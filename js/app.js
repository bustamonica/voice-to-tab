import { detectPitch } from './pitch.js';
import { freqToNote } from './notes.js';
import { buildTabDisplay } from './tab.js';

console.log('[voice-to-tab] app.js v3 loaded');

const recordBtn = document.getElementById('recordBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const currentNoteEl = document.getElementById('currentNote');
const currentFreqEl = document.getElementById('currentFreq');
const tabDisplayEl = document.getElementById('tabDisplay');
const notesLogEl = document.getElementById('notesLog');
const levelBarEl = document.getElementById('levelBar');

// A detected pitch must repeat this many analysis frames in a row before it's
// committed to the tab. Filters out brief glissandos and analysis jitter.
const STABLE_FRAMES = 3;

// Pitch range that's plausible for human humming / singing.
const MIN_FREQ = 65;   // ~C2
const MAX_FREQ = 1200; // ~D6

const detectedNotes = [];

let audioContext = null;
let analyser = null;
let mediaStream = null;
let rafId = null;
let recording = false;

let pendingMidi = null;
let pendingCount = 0;
let lastCommittedMidi = null;
let debugFrame = 0;

recordBtn.addEventListener('click', toggleRecording);
clearBtn.addEventListener('click', clearTab);

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

  if (++debugFrame % 15 === 0) {
    console.log(`[voice-to-tab] rms=${rms.toFixed(4)} freq=${freq.toFixed(1)}Hz`);
  }

  if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
    const note = freqToNote(freq);
    currentNoteEl.textContent = note.name;
    currentFreqEl.textContent = `(${freq.toFixed(1)} Hz)`;

    if (pendingMidi === note.midi) {
      pendingCount++;
      if (pendingCount === STABLE_FRAMES && note.midi !== lastCommittedMidi) {
        commitNote(note);
      }
    } else {
      pendingMidi = note.midi;
      pendingCount = 1;
    }
  } else {
    currentNoteEl.textContent = '—';
    currentFreqEl.textContent = '';
    resetPending();
  }

  rafId = requestAnimationFrame(analyse);
}

function commitNote(note) {
  lastCommittedMidi = note.midi;
  detectedNotes.push(note);
  renderTab();
}

function resetPending() {
  pendingMidi = null;
  pendingCount = 0;
  // A gap of silence ends a held note, so the next detection of the same MIDI
  // value should be treated as a new note onset.
  lastCommittedMidi = null;
}

function renderTab() {
  tabDisplayEl.textContent = buildTabDisplay(detectedNotes);
  notesLogEl.innerHTML = detectedNotes
    .map((n) => `<span class="note-chip">${n.name}</span>`)
    .join('');
}

function clearTab() {
  detectedNotes.length = 0;
  resetPending();
  lastCommittedMidi = null;
  renderTab();
}
