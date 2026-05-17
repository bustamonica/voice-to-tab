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
  const rows = buildTabRows(notes);
  return STRINGS.map((s, i) => `${s.label}|-${rows[i].join('')}|`).join('\n');
}

// Returns one array per string of per-column cell strings. Each cell includes
// the trailing column separator so cells in the same column are equal-width
// across all six strings — letting them be addressed and highlighted as a
// vertical column without disrupting layout.
export function buildTabRows(notes) {
  const rows = STRINGS.map(() => []);

  for (const note of notes) {
    const pos = noteToTab(note.midi);
    const stringIndex = pos
      ? pos.stringIndex
      : note.midi < STRINGS[STRINGS.length - 1].midi
        ? STRINGS.length - 1
        : 0;
    const fretStr = pos ? String(pos.fret) : 'x';
    const width = fretStr.length;

    for (let i = 0; i < STRINGS.length; i++) {
      const cell = i === stringIndex ? fretStr : '-'.repeat(width);
      rows[i].push(`${cell}-`);
    }
  }

  return rows;
}
