// Time-domain autocorrelation pitch detector for monophonic input (humming,
// whistling, sung notes). Returns the fundamental frequency in Hz, or -1 if no
// clear pitch is found in the buffer.
//
// The approach: trim near-silent edges, compute the autocorrelation, find the
// first peak after the initial descent, then parabolically interpolate around
// that peak for sub-sample accuracy.

const MIN_RMS = 0.005;
const EDGE_THRESHOLD = 0.1;

export function detectPitch(buffer, sampleRate) {
  const size = buffer.length;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < MIN_RMS) return -1;

  let start = 0;
  let end = size - 1;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < EDGE_THRESHOLD) { start = i; break; }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < EDGE_THRESHOLD) { end = size - i; break; }
  }

  const trimmed = buffer.subarray(start, end);
  const n = trimmed.length;
  if (n < 32) return -1;

  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let j = 0; j < n - lag; j++) sum += trimmed[j] * trimmed[j + lag];
    c[lag] = sum;
  }

  let d = 0;
  while (d + 1 < n && c[d] > c[d + 1]) d++;

  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos <= 0 || maxPos >= n - 1) return -1;

  const x1 = c[maxPos - 1];
  const x2 = c[maxPos];
  const x3 = c[maxPos + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const period = a ? maxPos - b / (2 * a) : maxPos;

  if (period <= 0) return -1;
  return sampleRate / period;
}
