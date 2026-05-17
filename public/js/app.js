import { detectPitch } from './pitch.js';
import { freqToNote, midiToName } from './notes.js';
import { buildTabRows, STRINGS } from './tab.js';
import { loadBasicPitch, transcribe, toMonophonic } from './basicPitch.js';
import { estimateTempo, quantize } from './quantize.js';

console.log('[voice-to-tab] app.js v17 loaded (portal + post-checkout flow)');

const recordBtn = document.getElementById('recordBtn');
const playBtn = document.getElementById('playBtn');
const clearBtn = document.getElementById('clearBtn');
const tempoInput = document.getElementById('tempoInput');
const tempoValueEl = document.getElementById('tempoValue');
const statusEl = document.getElementById('status');
const currentNoteEl = document.getElementById('currentNote');
const currentFreqEl = document.getElementById('currentFreq');
const tabDisplayEl = document.getElementById('tabDisplay');
const notesLogEl = document.getElementById('notesLog');
const levelBarEl = document.getElementById('levelBar');
const popoverEl = document.getElementById('notePopover');
const popoverNameEl = document.getElementById('popoverNoteName');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModalEl = document.getElementById('settingsModal');
const settingsApplyBtn = document.getElementById('settingsApplyBtn');
const tempoBpmInput = document.getElementById('tempoBpmInput');
const quantSelect = document.getElementById('quantSelect');
const tripletsSelect = document.getElementById('tripletsSelect');
const manualSettingsEl = document.getElementById('manualSettings');
const paywallModalEl = document.getElementById('paywallModal');
const subscribeMonthlyBtn = document.getElementById('subscribeMonthlyBtn');
const subscribeYearlyBtn = document.getElementById('subscribeYearlyBtn');
const paywallSignInHint = document.getElementById('paywallSignInHint');

// Subscription state — fetched from /api/me on load. Defaults assume the
// server isn't reachable yet (we get the strictest behavior in that case).
let userState = { signedIn: false, premium: false, freeRecordingSeconds: 10 };

function refreshUserState() {
  return fetch('/api/me')
    .then((r) => r.json())
    .then((data) => {
      userState = { ...userState, ...data };
      if (paywallSignInHint) {
        paywallSignInHint.style.display = userState.signedIn ? 'none' : '';
      }
      // If we're now premium, drop any `locked` flags from existing notes so
      // the user immediately sees the unlocked state without re-recording.
      if (userState.premium) {
        let changed = false;
        for (const n of detectedNotes) {
          if (n.locked) { n.locked = false; changed = true; }
        }
        if (changed) renderTab();
      }
      updateAuthChrome();
      console.log('[voice-to-tab] user state:', userState);
      return userState;
    })
    .catch((err) => console.warn('[voice-to-tab] /api/me failed:', err));
}

refreshUserState();

// Handle the return from Stripe Checkout. Strip the query params so a reload
// doesn't re-trigger the toast. The webhook may still be in flight when we
// land here, so re-poll /api/me a couple of times to pick up the premium
// flag once it lands.
(function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('subscribed')) {
    showToast('Subscription active — thanks!');
    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      refreshUserState().then(() => {
        if (userState.premium || tries >= 5) clearInterval(poll);
      });
    }, 1200);
    window.history.replaceState({}, '', window.location.pathname);
  } else if (params.has('canceled')) {
    showToast('Checkout canceled.');
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

// Lightweight toast — a fixed-position div that fades out after a few seconds.
function showToast(text) {
  let el = document.getElementById('vt-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vt-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('visible'), 3500);
}

// Drop a "Manage subscription" button into the top nav when the user is a
// paying subscriber. The button POSTs /api/portal and redirects to Stripe.
function updateAuthChrome() {
  const nav = document.querySelector('.topnav');
  if (!nav) return;
  let manageBtn = document.getElementById('manageSubBtn');
  if (userState.premium && !manageBtn) {
    manageBtn = document.createElement('button');
    manageBtn.id = 'manageSubBtn';
    manageBtn.type = 'button';
    manageBtn.className = 'secondary';
    manageBtn.textContent = 'Manage subscription';
    manageBtn.addEventListener('click', openPortal);
    nav.insertBefore(manageBtn, nav.firstChild);
  } else if (!userState.premium && manageBtn) {
    manageBtn.remove();
  }
}

async function openPortal() {
  try {
    const res = await fetch('/api/portal', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (data?.url) {
      window.location.href = data.url;
      return;
    }
    showToast(data?.message || 'Could not open billing portal.');
  } catch (err) {
    console.error('[voice-to-tab] portal failed:', err);
    showToast('Could not open billing portal.');
  }
}

function openPaywall() {
  if (!paywallModalEl) return;
  if (paywallSignInHint) {
    paywallSignInHint.style.display = userState.signedIn ? 'none' : '';
  }
  paywallModalEl.hidden = false;
}
function closePaywall() {
  if (paywallModalEl) paywallModalEl.hidden = true;
}
if (paywallModalEl) {
  paywallModalEl.addEventListener('click', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.closePaywall !== undefined) {
      closePaywall();
    }
  });
}
async function startSubscribe(plan) {
  if (!userState.signedIn) {
    closePaywall();
    // Best-effort: trigger Clerk's sign-in by clicking the Sign-in button.
    const signInBtn = document.querySelector('.topnav button.secondary');
    if (signInBtn) signInBtn.click();
    return;
  }
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.url) {
      window.location.href = data.url; // Stripe Checkout (Phase 3)
      return;
    }
    alert(data?.message || 'Subscription flow not yet wired up (Phase 3).');
  } catch (err) {
    console.error('[voice-to-tab] checkout failed:', err);
    alert('Could not start checkout: ' + err.message);
  }
}
if (subscribeMonthlyBtn) subscribeMonthlyBtn.addEventListener('click', () => startSubscribe('monthly'));
if (subscribeYearlyBtn) subscribeYearlyBtn.addEventListener('click', () => startSubscribe('yearly'));

// Pitch range plausible for the live readout. Not used for transcription —
// Basic Pitch handles its own pitch range internally.
const MIN_FREQ = 65;   // ~C2
const MAX_FREQ = 1200; // ~D6

// detectedNotes: { midi, name, durationSec, startTimeSec, amplitude }
let detectedNotes = [];

let audioContext = null;
let analyser = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let rafId = null;
let recording = false;
let processing = false;

let isPlaying = false;
let playbackTimeoutId = null;
const highlightTimeouts = [];
let instrument = null;        // { sampler, reverb }
let instrumentReady = null;   // Promise<{sampler, reverb}>

// 10 sampled notes spanning A2 to C5. Tone.Sampler pitch-shifts the nearest
// one to fill in the rest of the fretboard — minor-third spacing gives good
// fidelity without forcing a huge download. Files originate from
// nbrosowsky/tonejs-instruments (filename convention: 's' for sharp) but are
// served from this project's own /samples directory so we don't depend on any
// third-party CDN that could be blocked by content blockers / corporate
// networks / regional restrictions.
const GUITAR_SAMPLES = {
  'A2': 'A2.mp3',
  'C3': 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  'A3': 'A3.mp3',
  'C4': 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  'A4': 'A4.mp3',
  'C5': 'C5.mp3',
};
const GUITAR_BASE_URL = new URL('../samples/guitar-acoustic/', import.meta.url).href;

function getInstrument() {
  if (instrumentReady) return instrumentReady;
  const Tone = window.Tone;
  if (!Tone) return Promise.reject(new Error('Tone.js not loaded'));

  // Hall-ish reverb, restrained wet so the picking stays articulate.
  const reverb = new Tone.Reverb({ decay: 1.6, wet: 0.22, preDelay: 0.02 }).toDestination();
  const sampler = new Tone.Sampler({
    urls: GUITAR_SAMPLES,
    baseUrl: GUITAR_BASE_URL,
    release: 0.8,
  }).connect(reverb);

  instrument = { sampler, reverb };
  instrumentReady = Tone.loaded().then(() => instrument);
  return instrumentReady;
}

recordBtn.addEventListener('click', toggleRecording);
clearBtn.addEventListener('click', clearTab);
playBtn.addEventListener('click', togglePlayback);
tempoInput.addEventListener('input', () => {
  tempoValueEl.textContent = `${Number(tempoInput.value).toFixed(2)}× speed`;
});

// Editing: hover a chip to reveal the popover, or click to pin it open.
// Mouse-leaving both the chip and the popover closes it after a brief grace
// period so the cursor can travel the gap between them without flicker.
let editingIdx = -1;
let hoverCloseTimer = null;
const HOVER_CLOSE_DELAY_MS = 180;

function scheduleHoverClose() {
  if (hoverCloseTimer) clearTimeout(hoverCloseTimer);
  hoverCloseTimer = setTimeout(() => {
    hoverCloseTimer = null;
    closePopover();
  }, HOVER_CLOSE_DELAY_MS);
}
function cancelHoverClose() {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
}

function canEdit() {
  return !isPlaying && !processing && !recording;
}

notesLogEl.addEventListener('mouseover', (e) => {
  const chip = e.target.closest('.note-chip');
  if (!chip || !canEdit()) return;
  if (chip.classList.contains('locked')) return;
  cancelHoverClose();
  const idx = Number(chip.dataset.chip);
  if (idx !== editingIdx) openPopover(idx);
});
notesLogEl.addEventListener('mouseleave', scheduleHoverClose);
popoverEl.addEventListener('mouseenter', cancelHoverClose);
popoverEl.addEventListener('mouseleave', scheduleHoverClose);

notesLogEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.note-chip');
  if (!chip || !canEdit()) return;
  if (chip.classList.contains('locked')) {
    openPaywall();
    return;
  }
  cancelHoverClose();
  openPopover(Number(chip.dataset.chip));
});
popoverEl.addEventListener('click', handlePopoverAction);
document.addEventListener('click', (e) => {
  if (popoverEl.hidden) return;
  if (popoverEl.contains(e.target)) return;
  if (e.target.closest('.note-chip')) return;
  closePopover();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopover();
});
window.addEventListener('resize', () => {
  if (!popoverEl.hidden) repositionPopover();
});
window.addEventListener('scroll', () => {
  if (!popoverEl.hidden) repositionPopover();
}, { passive: true });

// Settings modal: tempo + quantization.
settingsBtn.addEventListener('click', openSettingsModal);
settingsApplyBtn.addEventListener('click', applySettings);
settingsModalEl.addEventListener('click', (e) => {
  if (e.target.dataset.closeModal !== undefined) closeSettingsModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsModalEl.hidden) closeSettingsModal();
});
settingsModalEl.querySelectorAll('input[name="settingsMode"]').forEach((r) => {
  r.addEventListener('change', updateManualEnabled);
});

function openSettingsModal() {
  // Prefill tempo from estimate so manual mode starts with a sensible number.
  const detected = detectedNotes.length >= 2 ? estimateTempo(detectedNotes) : 120;
  tempoBpmInput.value = detected;
  updateManualEnabled();
  settingsModalEl.hidden = false;
}

function closeSettingsModal() {
  settingsModalEl.hidden = true;
}

function updateManualEnabled() {
  const mode = settingsModalEl.querySelector('input[name="settingsMode"]:checked').value;
  manualSettingsEl.classList.toggle('disabled', mode !== 'manual');
}

function applySettings() {
  if (!detectedNotes.length) { closeSettingsModal(); return; }
  const mode = settingsModalEl.querySelector('input[name="settingsMode"]:checked').value;
  let bpm, subdivision, triplets;
  if (mode === 'auto') {
    bpm = estimateTempo(detectedNotes);
    subdivision = 'sixteenth';
    triplets = false;
  } else {
    bpm = Math.max(40, Math.min(240, Number(tempoBpmInput.value) || 120));
    subdivision = quantSelect.value;
    triplets = tripletsSelect.value === 'yes';
  }
  detectedNotes = quantize(detectedNotes, { bpm, subdivision, triplets });
  renderTab();
  statusEl.textContent = `Quantized — ${bpm} BPM, ${subdivision}${triplets ? ' + triplets' : ''}`;
  closeSettingsModal();
}

renderTab();
initTempoUI();

function initTempoUI() {
  // Repurpose the slider as a playback-rate control. Range 0.25–2.0, default 1.
  tempoInput.min = '0.25';
  tempoInput.max = '2';
  tempoInput.step = '0.05';
  tempoInput.value = '1';
  tempoValueEl.textContent = '1.00× speed';
}

async function toggleRecording() {
  if (processing) return;
  if (recording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    statusEl.textContent = `Microphone error: ${err.message}`;
    console.error('[voice-to-tab] mic error:', err);
    return;
  }

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  recordedChunks = [];
  const mimeType = pickMediaRecorderMime();
  mediaRecorder = mimeType
    ? new MediaRecorder(mediaStream, { mimeType })
    : new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start(250); // emit a chunk every 250ms for smoother stop

  // Warm up the model in the background so it's ready by the time the user
  // stops recording. Failures here are non-fatal — we retry on stop.
  loadBasicPitch().catch((err) => console.warn('[voice-to-tab] preload failed:', err));
  // Same for the guitar samples — start downloading now so the first Play
  // doesn't make the user wait.
  if (window.Tone) {
    getInstrument().catch((err) => console.warn('[voice-to-tab] sample preload failed:', err));
  }

  recording = true;
  recordBtn.textContent = 'Stop Recording';
  recordBtn.classList.add('recording');
  statusEl.textContent = 'Listening';
  statusEl.classList.add('active');
  playBtn.disabled = true;

  // No hard stop here. Free-plan limit is enforced post-transcription by
  // marking notes that start past the free window as `locked`. The user can
  // hum as long as they want; locked notes appear dimmed with a lock icon.
  analyseLoop();
}

function pickMediaRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function stopRecording() {
  recording = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  // Stop the MediaRecorder and collect any final chunks.
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    await new Promise((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }

  recordBtn.textContent = 'Start Recording';
  recordBtn.classList.remove('recording');
  currentNoteEl.textContent = '—';
  currentFreqEl.textContent = '';
  levelBarEl.style.width = '0%';

  if (recordedChunks.length === 0) {
    statusEl.textContent = 'Stopped (no audio captured)';
    statusEl.classList.remove('active');
    cleanupAudioContext();
    return;
  }

  await runTranscription();
}

async function runTranscription() {
  processing = true;
  recordBtn.disabled = true;
  playBtn.disabled = true;
  statusEl.classList.remove('active');
  statusEl.textContent = 'Decoding audio…';

  try {
    const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    // Re-use the existing AudioContext (still open) to decode. If it's already
    // closed, open a fresh one.
    const decodeCtx = audioContext && audioContext.state !== 'closed'
      ? audioContext
      : new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);

    statusEl.textContent = 'Transcribing… 0%';
    const rawNotes = await transcribe(audioBuffer, (p) => {
      statusEl.textContent = `Transcribing… ${Math.round(p * 100)}%`;
    });
    const mono = toMonophonic(rawNotes);

    const limit = Number(userState.freeRecordingSeconds) || 10;
    detectedNotes = mono.map((ev) => {
      const midi = Math.round(ev.pitchMidi);
      const locked = !userState.premium && ev.startTimeSeconds >= limit;
      return {
        midi,
        name: midiToName(midi),
        startTimeSec: ev.startTimeSeconds,
        durationSec: ev.durationSeconds,
        amplitude: ev.amplitude,
        locked,
      };
    });
    renderTab();
    const lockedCount = detectedNotes.filter((n) => n.locked).length;
    if (lockedCount > 0) {
      statusEl.textContent = `Done — ${detectedNotes.length} notes (${lockedCount} locked past ${limit}s)`;
      openPaywall();
    } else {
      statusEl.textContent = `Done — ${detectedNotes.length} notes`;
    }
  } catch (err) {
    console.error('[voice-to-tab] transcription failed:', err);
    statusEl.textContent = `Transcription failed: ${err.message}`;
  } finally {
    processing = false;
    recordBtn.disabled = false;
    playBtn.disabled = detectedNotes.length === 0;
    cleanupAudioContext();
  }
}

function cleanupAudioContext() {
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;
}

// Live pitch readout during recording. Does not commit to detectedNotes —
// transcription happens after stop. Just gives the user visual feedback.
function analyseLoop() {
  if (!recording || !analyser) return;
  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  levelBarEl.style.width = `${(Math.min(1, rms * 8) * 100).toFixed(1)}%`;

  const freq = detectPitch(buffer, audioContext.sampleRate);
  if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
    const note = freqToNote(freq);
    currentNoteEl.textContent = note.name;
    currentFreqEl.textContent = `(${freq.toFixed(1)} Hz)`;
  } else {
    currentNoteEl.textContent = '—';
    currentFreqEl.textContent = '';
  }

  rafId = requestAnimationFrame(analyseLoop);
}

function renderTab() {
  const rows = buildTabRows(detectedNotes);
  tabDisplayEl.innerHTML = STRINGS.map((s, rowIdx) => {
    const cells = rows[rowIdx]
      .map((cell, colIdx) => {
        const lockedAttr = detectedNotes[colIdx]?.locked ? ' data-locked="1"' : '';
        return `<span class="tab-cell${detectedNotes[colIdx]?.locked ? ' locked' : ''}" data-col="${colIdx}"${lockedAttr}>${cell}</span>`;
      })
      .join('');
    return `<div class="tab-row">${s.label}|-${cells}|</div>`;
  }).join('');

  notesLogEl.innerHTML = detectedNotes
    .map((n, i) => {
      const cls = n.locked ? 'note-chip locked' : 'note-chip';
      const title = n.locked ? ' title="Locked — upgrade to unlock"' : '';
      const icon = n.locked ? ' <span class="lock-icon" aria-hidden="true">🔒</span>' : '';
      return `<span class="${cls}" data-chip="${i}"${title}>${n.name}${icon}</span>`;
    })
    .join('');

  const playable = detectedNotes.some((n) => !n.locked);
  playBtn.disabled = !playable || isPlaying || processing;
}

function highlightNote(idx) {
  clearHighlights();
  tabDisplayEl
    .querySelectorAll(`.tab-cell[data-col="${idx}"]`)
    .forEach((el) => el.classList.add('active'));
  const chip = notesLogEl.querySelector(`.note-chip[data-chip="${idx}"]`);
  if (chip) chip.classList.add('active');
}

function clearHighlights() {
  tabDisplayEl
    .querySelectorAll('.tab-cell.active')
    .forEach((el) => el.classList.remove('active'));
  notesLogEl
    .querySelectorAll('.note-chip.active')
    .forEach((el) => el.classList.remove('active'));
}

function clearTab() {
  if (isPlaying) stopPlayback();
  closePopover();
  detectedNotes = [];
  renderTab();
  if (!recording && !processing) {
    statusEl.textContent = 'Ready';
  }
}

function openPopover(idx) {
  if (idx < 0 || idx >= detectedNotes.length) return;
  editingIdx = idx;
  popoverEl.hidden = false;
  refreshPopover();
}

function refreshPopover() {
  if (editingIdx < 0 || editingIdx >= detectedNotes.length) {
    closePopover();
    return;
  }
  popoverNameEl.textContent = detectedNotes[editingIdx].name;
  notesLogEl.querySelectorAll('.note-chip.selected')
    .forEach((el) => el.classList.remove('selected'));
  const chip = notesLogEl.querySelector(`.note-chip[data-chip="${editingIdx}"]`);
  if (!chip) { closePopover(); return; }
  chip.classList.add('selected');
  repositionPopover();
}

function repositionPopover() {
  const chip = notesLogEl.querySelector(`.note-chip[data-chip="${editingIdx}"]`);
  if (!chip) return;
  const rect = chip.getBoundingClientRect();
  popoverEl.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
  popoverEl.style.top = `${window.scrollY + rect.bottom + 8}px`;
}

function closePopover() {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
  popoverEl.hidden = true;
  editingIdx = -1;
  notesLogEl.querySelectorAll('.note-chip.selected')
    .forEach((el) => el.classList.remove('selected'));
}

function handlePopoverAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (editingIdx < 0 || editingIdx >= detectedNotes.length) return;
  const action = btn.dataset.action;
  const note = detectedNotes[editingIdx];

  if (action === 'up' || action === 'down') {
    const delta = action === 'up' ? 1 : -1;
    const next = Math.min(120, Math.max(0, note.midi + delta));
    if (next === note.midi) return;
    note.midi = next;
    note.name = midiToName(next);
    renderTab();
    refreshPopover();
  } else if (action === 'delete') {
    // Close the timeline hole left by the deleted note. Shift every later
    // note left by (next.start - deleted.start) — that removes the deleted
    // note's own duration plus any silence immediately after it, but
    // preserves any rest that was already before it.
    if (editingIdx < detectedNotes.length - 1) {
      const shift = detectedNotes[editingIdx + 1].startTimeSec
                  - detectedNotes[editingIdx].startTimeSec;
      for (let i = editingIdx + 1; i < detectedNotes.length; i++) {
        detectedNotes[i].startTimeSec -= shift;
      }
    }
    detectedNotes.splice(editingIdx, 1);
    closePopover();
    renderTab();
    statusEl.textContent = detectedNotes.length
      ? `Edited — ${detectedNotes.length} notes`
      : 'Ready';
  }
}

async function togglePlayback() {
  if (isPlaying) { stopPlayback(); return; }
  if (!detectedNotes.length) return;

  const Tone = window.Tone;
  if (!Tone) {
    console.error('[voice-to-tab] Tone.js not loaded');
    return;
  }

  closePopover();
  await Tone.start();

  // Samples may still be downloading the first time around. Surface that.
  playBtn.textContent = 'Loading…';
  playBtn.disabled = true;
  let sampler;
  try {
    ({ sampler } = await getInstrument());
  } catch (err) {
    console.error('[voice-to-tab] sample load failed:', err);
    statusEl.textContent = `Could not load guitar samples: ${err.message}`;
    playBtn.textContent = 'Play';
    playBtn.disabled = detectedNotes.length === 0;
    return;
  }

  const rate = Number(tempoInput.value) || 1;
  const speed = Math.max(0.1, rate);

  isPlaying = true;
  playBtn.textContent = 'Stop';
  playBtn.classList.add('playing');
  playBtn.disabled = false;
  recordBtn.disabled = true;

  // Notes carry absolute startTimeSec from the recording. Anchor the first
  // note at "now + lead-in" and offset the rest by the start delta scaled by
  // playback rate. triggerAttackRelease sustains each sampled string through
  // the actual note duration, so held notes ring out instead of getting
  // chopped after a single pluck.
  const playableNotes = detectedNotes.filter((n) => !n.locked);
  if (playableNotes.length === 0) {
    stopPlayback();
    openPaywall();
    return;
  }

  const leadInSec = 0.05;
  const baseTime = playableNotes[0].startTimeSec;
  const audioStart = Tone.now() + leadInSec;

  for (let i = 0; i < detectedNotes.length; i++) {
    const n = detectedNotes[i];
    if (n.locked) continue;
    const offset = (n.startTimeSec - baseTime) / speed;
    const duration = Math.max(0.08, n.durationSec / speed);
    const noteName = Tone.Frequency(n.midi, 'midi').toNote();
    // Map the model's per-note amplitude into a useful velocity range so
    // dynamics from the original hum carry over without making quiet notes
    // inaudible. Amplitudes that came from manual edits (no amplitude field)
    // fall back to a neutral 0.85.
    const amp = typeof n.amplitude === 'number' ? n.amplitude : 0.85;
    const velocity = Math.min(1, Math.max(0.4, 0.45 + 0.6 * amp));
    sampler.triggerAttackRelease(noteName, duration, audioStart + offset, velocity);
  }

  const leadInMs = leadInSec * 1000;
  for (let i = 0; i < detectedNotes.length; i++) {
    const n = detectedNotes[i];
    if (n.locked) continue;
    const offsetMs = leadInMs + ((n.startTimeSec - baseTime) / speed) * 1000;
    highlightTimeouts.push(setTimeout(() => highlightNote(i), offsetMs));
  }
  const last = playableNotes[playableNotes.length - 1];
  const totalSec = (last.startTimeSec - baseTime + last.durationSec) / speed;
  highlightTimeouts.push(setTimeout(clearHighlights, leadInMs + totalSec * 1000));

  // Extra tail for the reverb wash to die out naturally.
  playbackTimeoutId = setTimeout(stopPlayback, leadInMs + (totalSec + 1.5) * 1000);
}

function stopPlayback() {
  if (playbackTimeoutId) {
    clearTimeout(playbackTimeoutId);
    playbackTimeoutId = null;
  }
  while (highlightTimeouts.length) clearTimeout(highlightTimeouts.pop());
  clearHighlights();
  // Stop any still-ringing notes, but keep the sampler cached so the next
  // Play doesn't have to re-download the samples.
  if (instrument && instrument.sampler) instrument.sampler.releaseAll();
  isPlaying = false;
  playBtn.textContent = 'Play';
  playBtn.classList.remove('playing');
  recordBtn.disabled = false;
  playBtn.disabled = detectedNotes.length === 0;
}
