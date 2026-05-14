// Standard tuning, ordered as displayed in tablature (high-pitched string at
// the top). Each entry holds the open-string MIDI value.
export const STRINGS = [
  { label: 'e', midi: 64 }, // high E
  { label: 'B', midi: 59 },
  { label: 'G', midi: 55 },
  { label: 'D', midi: 50 },
  { label: 'A', midi: 45 },
  { label: 'E', midi: 40 }, // low E
];

const MAX_FRET = 22;

// Map a MIDI note to its lowest playable fret on the standard-tuned guitar.
// Returns null if the note is below low E or above the fretboard.
export function noteToTab(midi) {
  let best = null;
  for (let i = 0; i < STRINGS.length; i++) {
    const fret = midi - STRINGS[i].midi;
    if (fret < 0 || fret > MAX_FRET) continue;
    if (!best || fret < best.fret) best = { stringIndex: i, fret };
  }
  return best;
}

export function buildTabDisplay(notes) {
  const lines = STRINGS.map((s) => `${s.label}|-`);

  for (const note of notes) {
    const pos = noteToTab(note.midi);
    // When a note falls outside the guitar's range, place an 'x' on the closest
    // string (low E for sub-range notes, high E for super-range) so the column
    // is still readable.
    const stringIndex = pos
      ? pos.stringIndex
      : note.midi < STRINGS[STRINGS.length - 1].midi
        ? STRINGS.length - 1
        : 0;
    const fretStr = pos ? String(pos.fret) : 'x';
    const width = fretStr.length;

    for (let i = 0; i < STRINGS.length; i++) {
      const cell = i === stringIndex ? fretStr : '-'.repeat(width);
      lines[i] += cell + '-';
    }
  }

  for (let i = 0; i < lines.length; i++) lines[i] += '|';
  return lines.join('\n');
}
