const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function freqToMidi(freq) {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

export function midiToName(midi) {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function freqToNote(freq) {
  if (!isFinite(freq) || freq <= 0) return null;
  const midi = freqToMidi(freq);
  return { midi, name: midiToName(midi), freq };
}
