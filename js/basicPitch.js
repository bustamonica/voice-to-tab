// Wrapper around Spotify's Basic Pitch neural transcription model.
// The package is CJS/ESM only on npm, so we load it through esm.sh which gives
// us a browser-ready ESM build with @tensorflow/tfjs@^3 bundled in.
//
// API verified against @spotify/basic-pitch@1.0.1 .d.ts declarations:
//   new BasicPitch(modelOrModelPath: string | Promise<tf.GraphModel>)
//   evaluateModel(buf: AudioBuffer | Float32Array, onComplete, onProgress): Promise<void>
//   outputToNotesPoly(frames, onsets, onsetThresh?, frameThresh?, minNoteLen?, ...)
//   addPitchBendsToNoteEvents(contours, notes, nBinsTolerance?)
//   noteFramesToTime(notes): NoteEventTime[]
//
// NoteEventTime: { startTimeSeconds, durationSeconds, pitchMidi, amplitude, pitchBends? }

const PACKAGE_URL = 'https://esm.sh/@spotify/basic-pitch@1.0.1';
const MODEL_URL = new URL('../model/model.json', import.meta.url).href;

let modulePromise = null;
let basicPitchPromise = null;

export function loadModule() {
  if (!modulePromise) modulePromise = import(PACKAGE_URL);
  return modulePromise;
}

export function loadBasicPitch() {
  if (!basicPitchPromise) {
    basicPitchPromise = loadModule().then((mod) => new mod.BasicPitch(MODEL_URL));
  }
  return basicPitchPromise;
}

export async function transcribe(audioBuffer, onProgress) {
  const [mod, bp] = await Promise.all([loadModule(), loadBasicPitch()]);

  const frames = [];
  const onsets = [];
  const contours = [];

  await bp.evaluateModel(
    audioBuffer,
    (f, o, c) => {
      for (const row of f) frames.push(row);
      for (const row of o) onsets.push(row);
      for (const row of c) contours.push(row);
    },
    onProgress || (() => {}),
  );

  // Conservative thresholds for hummed melodies: stricter onset detection
  // (0.5) and longer minimum note length (11 frames ~ 128 ms at the model's
  // ~86 Hz frame rate) cut down on transient false-positive notes.
  const raw = mod.outputToNotesPoly(frames, onsets, 0.5, 0.3, 11);
  const withBends = mod.addPitchBendsToNoteEvents(contours, raw);
  return mod.noteFramesToTime(withBends);
}

// Greedy monophonic reduction: scan notes in time order, drop any that overlap
// a louder kept note. For humming the model occasionally outputs an octave
// shadow or a brief transient alongside the real note — this strips both.
export function toMonophonic(noteEvents) {
  if (noteEvents.length === 0) return [];
  const sorted = [...noteEvents].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const kept = [];
  for (const ev of sorted) {
    const last = kept[kept.length - 1];
    if (!last) { kept.push(ev); continue; }
    const lastEnd = last.startTimeSeconds + last.durationSeconds;
    if (ev.startTimeSeconds >= lastEnd) {
      kept.push(ev);
    } else if (ev.amplitude > last.amplitude) {
      kept[kept.length - 1] = ev;
    }
  }
  return kept;
}
