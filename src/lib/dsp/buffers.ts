/**
 * ALLOY — the buffer contract the two Task 6.1 modules share.
 *
 * The project's sample format is a channel of 32-bit floats — one
 * `Float32Array` per channel, mono or stereo, 48 kHz, no interleaving, no
 * resampling (Task 5.1's format contract, D5.1.1 / D5.1.3). These helpers
 * enforce that at a module's boundary, so a mismatch is a named error
 * rather than a silent short buffer.
 *
 * `output` may be the same arrays as `input`: every module here filters in
 * place.
 */

/** `Float32Array` or not — the one check every buffer passes through. */
function requireChannel(module: string, side: string, channels: number, buffers: readonly Float32Array[]): void {
  if (!Array.isArray(buffers) || buffers.length !== channels) {
    const got = Array.isArray(buffers) ? buffers.length : typeof buffers;
    throw new Error(`${module}: expected ${channels} ${side} channel(s), got ${got}`);
  }
  for (let c = 0; c < channels; c++) {
    if (!(buffers[c] instanceof Float32Array)) {
      throw new Error(`${module}: ${side} channel ${c + 1} is not a Float32Array`);
    }
  }
}

/** A channel count, a frame count and two channel sets that can hold them. */
export function requireBuffers(
  module: string,
  channels: number,
  input: readonly Float32Array[],
  output: readonly Float32Array[],
  count: number,
): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${module}: the frame count is a whole number ≥ 0, not ${String(count)}`);
  }
  requireChannel(module, "input", channels, input);
  requireChannel(module, "output", channels, output);
  for (let c = 0; c < channels; c++) {
    if (input[c].length < count) {
      throw new Error(`${module}: input channel ${c + 1} holds ${input[c].length} frames, ${count} asked for`);
    }
    if (output[c].length < count) {
      throw new Error(`${module}: output channel ${c + 1} holds ${output[c].length} frames, ${count} asked for`);
    }
  }
}

/** An optional key (sidechain) input: same channel count, at least `count` frames. */
export function requireKeyBuffers(
  module: string,
  channels: number,
  key: readonly Float32Array[],
  count: number,
): void {
  requireChannel(module, "key", channels, key);
  for (let c = 0; c < channels; c++) {
    if (key[c].length < count) {
      throw new Error(`${module}: key channel ${c + 1} holds ${key[c].length} frames, ${count} asked for`);
    }
  }
}

/** The frame count a call means when the caller names none. */
export function defaultCount(input: readonly Float32Array[]): number {
  return input.length > 0 ? input[0].length : 0;
}

/** `output = input` for every channel, without a view per channel. */
export function copyChannels(
  channels: number,
  input: readonly Float32Array[],
  output: readonly Float32Array[],
  count: number,
): void {
  for (let c = 0; c < channels; c++) {
    const from = input[c];
    const to = output[c];
    if (from === to) continue;
    for (let i = 0; i < count; i++) to[i] = from[i];
  }
}
