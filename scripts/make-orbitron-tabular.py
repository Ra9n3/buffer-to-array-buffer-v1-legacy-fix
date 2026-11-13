#!/usr/bin/env python3
"""Make the shipped Orbitron subset's digits tabular — Task 10.2, D10.2.5.

Owner, 2026-11-13: the small screen in the transport bar — the bar · beat
readout — "is dynamic, it become smaller when the beat count is 1, and
bigger when the beat is either 2/3 or 4, it should stay static with one
size."

Root cause (the font folder's README had it written down): Orbitron Medium
is proportional with no tabular-figures feature — the digit `1` advances
391 units against 826-834 for the others — so every line the display
prints changes width with WHICH digits it shows, and the time window is
content-sized (`flex: 0 0 auto`), so the window itself breathes: measured
6.00 px on every bar of the 10.2 build (beat 1 narrowest, beat 4 widest).
`font-variant-numeric: tabular-nums` was already declared in
LampDisplay's CSS; the face cannot honour it.

The fix is in the face we ship, not in the layout: the subset's ten digits
are normalised to ONE advance — 834 units, the cell `0` and `8` already
occupy, so the seven digits at 820-834 keep their metrics to within
0.4-1.4 % of an em (sub-pixel at the display's sizes) and only `1`, `4`
and `7` gain the air a tabular cell needs — with each digit's ink centred
in its cell, which leaves the seven wide digits exactly where the designer
put them (their ink boxes already sit centred in their advances). A
readout that ticks must not reflow: bar · beat holds one width through
beats 1-4, the clock through seconds 0-9; only a change in digit COUNT
(bar 9 -> 10, hour 9 -> 10) may move the window, one cell at a time.

The letter glyphs, the kerning (letters only — no pair in the subset
involves a digit) and the original `Orbitron-Medium.ttf` (the untouched
source, never referenced by a stylesheet) are not modified. The patch is
idempotent: run twice, the second run is a no-op. The woff2's SHA is
pinned by check:console-transport (D10.2.5); regenerating the subset from
the TTF without re-running this script would fail the guard.

Usage (from the repository root):
    python3 scripts/make-orbitron-tabular.py [--check]
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates

ROOT = Path(__file__).resolve().parent.parent
SUBSET = ROOT / "src/assets/fonts/orbitron/Orbitron-Medium.subset.woff2"
TTF = ROOT / "src/assets/fonts/orbitron/Orbitron-Medium.ttf"

DIGITS = "0123456789"
TABULAR_ADVANCE = 834  # units — the cell `0` and `8` already occupy


def main() -> int:
    check_only = "--check" in sys.argv
    font = TTFont(SUBSET)
    cmap = font.getBestCmap()
    glyf = font["glyf"]
    hmtx = font["hmtx"]

    missing = [c for c in DIGITS if ord(c) not in cmap]
    if missing:
        print(f"FAIL: digits not in subset: {missing}")
        return 1
    if not TTF.exists():
        print("FAIL: the original TTF is missing")
        return 1

    changed = False
    print(f"{'digit':>5} {'advance':>8} {'->':>4} {'xMin':>6} {'ink':>5} {'shift':>6}")
    for ch in DIGITS:
        name = cmap[ord(ch)]
        glyph = glyf[name]
        if glyph.numberOfContours < 0:
            print(f"FAIL: {ch} is a composite glyph — handling not written")
            return 1
        ink = glyph.xMax - glyph.xMin
        if ink > TABULAR_ADVANCE:
            print(f"FAIL: {ch} ink {ink} wider than the tabular cell")
            return 1
        old_adv, old_lsb = hmtx[name]
        # centre the ink in the cell: the wide digits are already centred
        # (their dx comes out 0 or a rounding unit), the narrow ones move.
        target_xmin = (TABULAR_ADVANCE - ink) // 2
        dx = target_xmin - glyph.xMin
        if old_adv != TABULAR_ADVANCE or dx != 0:
            if check_only:
                print(f"FAIL (check mode): {ch} not normalised")
                return 1
            glyph.coordinates = GlyphCoordinates([(x + dx, y) for (x, y) in glyph.coordinates])
            glyph.recalcBounds(glyf)
            changed = True
        hmtx[name] = (TABULAR_ADVANCE, glyph.xMin)
        print(f"{ch:>5} {old_adv:>8} {'->':>4} {TABULAR_ADVANCE} {glyph.xMin:>6} {ink:>5} {dx:>+6}")

    if check_only:
        print("OK: all ten digits tabular")
        return 0

    if changed:
        font.flavor = "woff2"
        font.save(SUBSET)
        print(f"\nwrote {SUBSET.name}: {SUBSET.stat().st_size} bytes")
        print("re-pin its sha256 in scripts/check-console-transport-structure.mjs")
    else:
        print("\nalready tabular — no change")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
