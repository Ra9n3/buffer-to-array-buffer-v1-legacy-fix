/**
 * ALLOY analysis — a radix-2 complex FFT (Task 5.2).
 *
 * The one transform the spectral measurements need (plan §7 "energy by
 * frequency band over time, spectral centroid"), written here so the engine
 * has no dependency and no Web Audio: an iterative in-place Cooley–Tukey
 * over split real / imaginary Float64Arrays, with the bit-reversal table
 * and the twiddles computed once per size. Deterministic, pure.
 */

export class Fft {
  readonly size: number;
  private readonly rev: Uint32Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error(`FFT size must be a power of two, not ${size}`);
    this.size = size;
    const bits = Math.log2(size);
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >>> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      const a = (-2 * Math.PI * i) / size;
      this.cos[i] = Math.cos(a);
      this.sin[i] = Math.sin(a);
    }
  }

  /** Forward transform in place: X[k] = Σ x[n]·e^(−2πi·kn/N). */
  transform(re: Float64Array, im: Float64Array): void {
    const n = this.size;
    if (re.length !== n || im.length !== n) throw new Error("FFT buffers must match the size");
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >>> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const wr = this.cos[t];
          const wi = this.sin[t];
          const a = start + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }
}

/**
 * Two real frames in one complex transform: `re` holds frame A, `im` frame B
 * (both already windowed); on return `powerA[k]` and `powerB[k]` hold |A[k]|²
 * and |B[k]|² for k = 0 … N/2 (the one-sided spectra) and `re`/`im` are
 * consumed. Halves the FFT cost of the 50 %-overlap analysis, which always
 * has two frames per cell.
 */
export function powerSpectraOfPair(fft: Fft, re: Float64Array, im: Float64Array, powerA: Float64Array, powerB: Float64Array): void {
  const n = fft.size;
  fft.transform(re, im);
  const half = n >>> 1;
  for (let k = 0; k <= half; k++) {
    const j = k === 0 ? 0 : n - k;
    // A[k] = (X[k] + conj(X[N−k])) / 2 ; B[k] = (X[k] − conj(X[N−k])) / 2i
    const ar = (re[k] + re[j]) * 0.5;
    const ai = (im[k] - im[j]) * 0.5;
    const br = (im[k] + im[j]) * 0.5;
    const bi = (re[j] - re[k]) * 0.5;
    powerA[k] = ar * ar + ai * ai;
    powerB[k] = br * br + bi * bi;
  }
}

/** A naive DFT for the tests' cross-check of the transform. */
export function naiveDft(re: ArrayLike<number>, im: ArrayLike<number>): { re: Float64Array; im: Float64Array } {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      sr += re[t] * c - im[t] * s;
      si += re[t] * s + im[t] * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}
