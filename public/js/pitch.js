// YIN pitch detector — Cheveigné & Kawahara (2002).
// Far more accurate than plain autocorrelation on monophonic signals like
// humming, because the cumulative-mean-normalized difference function (step 3)
// strongly suppresses octave errors.
//
// Returns the fundamental frequency in Hz, or -1 if no clear pitch.

const MIN_RMS = 0.005;
const THRESHOLD = 0.15;

export function detectPitch(buffer, sampleRate) {
  const size = buffer.length;
  const tauMax = Math.floor(size / 2);

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < MIN_RMS) return -1;

  // 1) Difference function
  const yin = new Float32Array(tauMax);
  for (let tau = 1; tau < tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < tauMax; j++) {
      const d = buffer[j] - buffer[j + tau];
      sum += d * d;
    }
    yin[tau] = sum;
  }

  // 2) Cumulative mean normalized difference
  yin[0] = 1;
  let running = 0;
  for (let tau = 1; tau < tauMax; tau++) {
    running += yin[tau];
    yin[tau] *= tau / running;
  }

  // 3) Absolute threshold — pick the first dip below THRESHOLD, then descend to
  //    its local minimum (so we don't latch onto a noisy shoulder).
  let tau = -1;
  for (let i = 2; i < tauMax; i++) {
    if (yin[i] < THRESHOLD) {
      while (i + 1 < tauMax && yin[i + 1] < yin[i]) i++;
      tau = i;
      break;
    }
  }
  if (tau === -1) return -1;

  // 4) Parabolic interpolation around the minimum for sub-sample accuracy
  const x0 = tau > 1 ? tau - 1 : tau;
  const x2 = tau + 1 < tauMax ? tau + 1 : tau;
  let refined = tau;
  if (x0 !== tau && x2 !== tau) {
    const s0 = yin[x0];
    const s1 = yin[tau];
    const s2 = yin[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) refined = tau + (s2 - s0) / denom;
  }

  if (refined <= 0) return -1;
  return sampleRate / refined;
}
