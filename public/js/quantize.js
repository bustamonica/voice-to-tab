// Estimate tempo from note onset times.
//
// Approach: compute the median inter-onset interval (IOI). That interval is
// presumed to be either one quarter note or one eighth note, depending on
// which interpretation produces a BPM in the typical musical range. Hummed
// melodies have rubato, so this estimate is best-effort — a manual override
// will always be more reliable.
export function estimateTempo(notes) {
  if (!notes || notes.length < 2) return 120;

  const iois = [];
  for (let i = 1; i < notes.length; i++) {
    const dt = notes[i].startTimeSec - notes[i - 1].startTimeSec;
    if (dt > 0.05) iois.push(dt); // ignore overlapping / simultaneous detections
  }
  if (iois.length === 0) return 120;

  iois.sort((a, b) => a - b);
  const median = iois[Math.floor(iois.length / 2)];

  // 1 quarter note = 60/BPM sec; 1 eighth note = 30/BPM sec. So if the
  // median IOI is interpreted as a quarter, BPM = 60/IOI; as an eighth,
  // BPM = 30/IOI. Pick whichever lands in 60-180, the most common musical
  // range. Falls back to a clamped quarter interpretation otherwise.
  const asQuarter = 60 / median;
  const asEighth = 30 / median;

  let bpm;
  if (asQuarter >= 60 && asQuarter <= 180) bpm = asQuarter;
  else if (asEighth >= 60 && asEighth <= 180) bpm = asEighth;
  else bpm = Math.max(60, Math.min(180, asQuarter));

  return Math.round(bpm);
}

// Snap each note's startTimeSec and durationSec to the nearest grid line.
// `subdivision` selects the straight grid (quarter / eighth / sixteenth);
// `triplets: true` adds a parallel triplet grid (beat/3) and the nearer of the
// two grids wins per note.
//
// The first note is anchored at t=0 so the quantized sequence starts cleanly
// (the original recording usually had a lead-in silence).
export function quantize(notes, { bpm, subdivision, triplets }) {
  if (!notes || notes.length === 0) return [];
  if (subdivision === 'off') return notes.map((n) => ({ ...n }));

  const beat = 60 / bpm;
  const subsPerBeat = { quarter: 1, eighth: 2, sixteenth: 4 }[subdivision] ?? 4;
  const straightGrid = beat / subsPerBeat;
  const tripletGrid = triplets ? beat / 3 : null;
  const grids = tripletGrid ? [straightGrid, tripletGrid] : [straightGrid];

  function snap(t) {
    let bestVal = t;
    let bestErr = Infinity;
    for (const g of grids) {
      const candidate = Math.round(t / g) * g;
      const err = Math.abs(t - candidate);
      if (err < bestErr) { bestErr = err; bestVal = candidate; }
    }
    return bestVal;
  }

  const offset = notes[0].startTimeSec;
  return notes.map((n) => {
    const startTimeSec = Math.max(0, snap(n.startTimeSec - offset));
    const durationSec = Math.max(straightGrid * 0.5, snap(n.durationSec));
    return { ...n, startTimeSec, durationSec };
  });
}
