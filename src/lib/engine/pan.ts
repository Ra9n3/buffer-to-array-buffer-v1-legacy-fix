/**
 * ALLOY — the constant-power pan law (Task 7.1).
 *
 * The project model stores PAN −100 … +100 (a track) and BALANCE −100 … +100 (a
 * bus), but **no document fixed a gain law** — so the owner chose one at the 7.1
 * readiness gate (2026-11-03): **constant power**.
 *
 *     θ = (pan + 100) / 200 · π/2
 *     left = cos θ          right = sin θ
 *
 * Centre is −3.01 dB per side (cos π/4), a hard pan is unity on one side and
 * silence on the other, and `left² + right² = 1` at every position, so a source
 * keeps its power as it moves. A bus BALANCE uses the same law on its stereo pair
 * (both channels scaled by the two gains), which is the balance reading of a
 * pan control, not a second law.
 *
 * This is a gain law only: no hidden gain, no compensation, no width change.
 */

/** Centre attenuation per side, dB — the constant-power law's own value (≈ −3.01). */
export const PAN_CENTRE_DB = 20 * Math.log10(Math.SQRT1_2);

export interface PanGains {
  readonly left: number;
  readonly right: number;
}

/** The two gains for a pan position, −100 (hard left) … +100 (hard right). */
export function panGains(pan: number): PanGains {
  const finite = Number.isFinite(pan) ? pan : 0;
  const position = Math.min(100, Math.max(-100, finite));
  const theta = ((position + 100) / 200) * (Math.PI / 2);
  // cos(π/2) is 6e-17, not 0: a hard pan must be silent on the other side, not "almost".
  const tidy = (gain: number): number => (Math.abs(gain) < 1e-15 ? 0 : gain);
  return { left: tidy(Math.cos(theta)), right: tidy(Math.sin(theta)) };
}

/**
 * The two gains for a bus BALANCE, −100 … +100.
 *
 * This is deliberately NOT `panGains`: a balance sits on a stereo pair whose default
 * position must be neutral. The constant-power pan law is −3.01 dB per side at the
 * centre, which is right for placing a source but would quietly drop every bus by 3 dB
 * at its own default — a gain the model does not hold, and a direct disagreement with
 * the same material routed straight to Master. So BALANCE reads like a console balance
 * control: the centre is unity on both sides, and moving it attenuates the opposite
 * side linearly, never boosting either one (0 dB at the centre, −∞ at the far end of
 * the attenuated side, the other side untouched).
 */
export function balanceGains(balance: number): PanGains {
  const finite = Number.isFinite(balance) ? balance : 0;
  const position = Math.min(100, Math.max(-100, finite));
  const attenuation = 1 - Math.abs(position) / 100;
  return position <= 0 ? { left: 1, right: attenuation } : { left: attenuation, right: 1 };
}
