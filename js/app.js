import { detectPitch } from './pitch.js';
import { freqToNote, midiToName } from './notes.js';
import { buildTabRows, STRINGS } from './tab.js';

console.log('[voice-to-tab] app.js v6 loaded (playback highlights)');

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

// Commit a new note when at least COMMIT_AGREE of the last HISTORY_SIZE frames
// agree on the same MIDI value. A sliding window tolerates the small jitter
// you naturally get during a sustained hum (one occasional off-frame between
// many correct ones) without committing transient pitches between notes.
const HISTORY_SIZE = 9;
const COMMIT_AGREE = 6;
const SILENCE_FRAMES_TO_END_NOTE = 5;

// Pitch range that's plausible for human humming / singing.
const MIN_FREQ = 65;   // ~C2
const MAX_FREQ = 1200; // ~D6

const detectedNotes = [];

let audioContext = null;
let analyser = null;
let mediaStream = null;
let rafId = null;
let recording = false;

const pitchHistory = [];
let lastCommittedMidi = null;
let silenceStreak = 0;

let isPlaying = false;
let playbackTimeoutId = null;
const highlightTimeouts = [];
let synth = null;

recordBtn.addEventListener('click', toggleRecording);
clearBtn.addEventListener('click', clearTab);
playBtn.addEventListener('click', togglePlayback);
tempoInput.addEventListener('input', () => {
  tempoValueEl.textContent = `${tempoInput.value} BPM`;
});

renderTab();

async function toggleRecording() {
  console.log('[voice-to-tab] record button clicked, recording=', recording);
  if (recording) {
    stopRecording('Stopped');
  } else {
    await startRecording();
  }
}

async function startRecording() {
  console.log('[voice-to-tab] requesting microphone...');
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('[voice-to-tab] microphone granted, tracks=', mediaStream.getTracks().length);
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

  recording = true;
  recordBtn.textContent = 'Stop Recording';
  recordBtn.classList.add('recording');
  statusEl.textContent = 'Listening';
  statusEl.classList.add('active');

  analyse();
}

function stopRecording(label) {
  recording = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;
  resetPending();
  lastCommittedMidi = null;

  recordBtn.textContent = 'Start Recording';
  recordBtn.classList.remove('recording');
  statusEl.textContent = label;
  statusEl.classList.remove('active');
  currentNoteEl.textContent = '—';
  currentFreqEl.textContent = '';
  levelBarEl.style.width = '0%';
}

function analyse() {
  if (!recording || !analyser) return;
  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  const level = Math.min(1, rms * 8);
  levelBarEl.style.width = `${(level * 100).toFixed(1)}%`;

  const freq = detectPitch(buffer, audioContext.sampleRate);

  if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
    const note = freqToNote(freq);
    currentNoteEl.textContent = note.name;
    currentFreqEl.textContent = `(${freq.toFixed(1)} Hz)`;
    silenceStreak = 0;

    pitchHistory.push(note.midi);
    if (pitchHistory.length > HISTORY_SIZE) pitchHistory.shift();

    const consensus = modeWithCount(pitchHistory);
    if (consensus.count >= COMMIT_AGREE && consensus.midi !== lastCommittedMidi) {
      commitNote({ midi: consensus.midi, name: midiToName(consensus.midi) });
    }
  } else {
    currentNoteEl.textContent = '—';
    currentFreqEl.textContent = '';
    silenceStreak++;
    if (silenceStreak >= SILENCE_FRAMES_TO_END_NOTE) resetPending();

  }

  rafId = requestAnimationFrame(analyse);
}

function commitNote(note) {
  lastCommittedMidi = note.midi;
  detectedNotes.push(note);
  renderTab();
}

function resetPending() {
  pitchHistory.length = 0;
  silenceStreak = 0;
  // A gap of silence ends a held note, so the next detection of the same MIDI
  // value should be treated as a new note onset.
  lastCommittedMidi = null;
}

function modeWithCount(arr) {
  const counts = new Map();
  let bestMidi = arr[0];
  let bestCount = 0;
  for (const m of arr) {
    const c = (counts.get(m) || 0) + 1;
    counts.set(m, c);
    if (c > bestCount) {
      bestCount = c;
      bestMidi = m;
    }
  }
  return { midi: bestMidi, count: bestCount };
}

function renderTab() {
  const rows = buildTabRows(detectedNotes);
  tabDisplayEl.innerHTML = STRINGS.map((s, rowIdx) => {
    const cells = rows[rowIdx]
      .map((cell, colIdx) => `<span class="tab-cell" data-col="${colIdx}">${cell}</span>`)
      .join('');
    return `<div class="tab-row">${s.label}|-${cells}|</div>`;
  }).join('');

  notesLogEl.innerHTML = detectedNotes
    .map((n, i) => `<span class="note-chip" data-chip="${i}">${n.name}</span>`)
    .join('');

  playBtn.disabled = detectedNotes.length === 0 || isPlaying;
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
  detectedNotes.length = 0;
  resetPending();
  lastCommittedMidi = null;
  renderTab();
}

async function togglePlayback() {
  if (isPlaying) {
    stopPlayback();
    return;
  }
  if (!detectedNotes.length) return;

  const Tone = window.Tone;
  if (!Tone) {
    console.error('[voice-to-tab] Tone.js not loaded');
    return;
  }

  await Tone.start();
  synth = new Tone.PluckSynth({
    attackNoise: 1.2,
    dampening: 4000,
    resonance: 0.92,
  }).toDestination();

  const bpm = Number(tempoInput.value) || 100;
  const noteDur = 60 / bpm; // one beat = quarter note

  isPlaying = true;
  playBtn.textContent = 'Stop';
  playBtn.classList.add('playing');
  recordBtn.disabled = true;

  const leadInSec = 0.05;
  const start = Tone.now() + leadInSec;
  for (let i = 0; i < detectedNotes.length; i++) {
    const freq = Tone.Frequency(detectedNotes[i].midi, 'midi').toFrequency();
    synth.triggerAttack(freq, start + i * noteDur);
  }

  // Schedule visual highlights to track the audio. setTimeout latency is well
  // under one note duration at any tempo we expose, so the chip / fret light
  // up in sync with what the ear is hearing.
  const leadInMs = leadInSec * 1000;
  for (let i = 0; i < detectedNotes.length; i++) {
    highlightTimeouts.push(setTimeout(() => highlightNote(i), leadInMs + i * noteDur * 1000));
  }
  highlightTimeouts.push(
    setTimeout(clearHighlights, leadInMs + detectedNotes.length * noteDur * 1000)
  );

  const totalMs = (detectedNotes.length * noteDur + 0.5) * 1000;
  playbackTimeoutId = setTimeout(stopPlayback, totalMs);
}

function stopPlayback() {
  if (playbackTimeoutId) {
    clearTimeout(playbackTimeoutId);
    playbackTimeoutId = null;
  }
  while (highlightTimeouts.length) clearTimeout(highlightTimeouts.pop());
  clearHighlights();
  if (synth) {
    synth.dispose();
    synth = null;
  }
  isPlaying = false;
  playBtn.textContent = 'Play';
  playBtn.classList.remove('playing');
  recordBtn.disabled = false;
  playBtn.disabled = detectedNotes.length === 0;
}
