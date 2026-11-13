# Orbitron — geometric display sans (local copy)

Source: Orbitron by Matt McInerney, released through The League of Moveable
Type (2009; repository snapshot `13e6a52`, 2011). Licensed under the **SIL
Open Font License 1.1** with Reserved Font Name "Orbitron" — free for
personal and commercial use, embedding and bundling allowed, the font may
not be sold on its own; see `OFL.txt` (the licence text as shipped in the
download). Downloaded 2026-11-01 from
https://www.1001fonts.com/orbitron-font.html
(`https://www.1001fonts.com/download/orbitron.zip`, sha256 of the zip begins
`0fa31ba1b2d263fa`). The download also contains Light (300), Bold (700) and
Black (900), in TTF and OTF, with the UFO sources; only Medium is kept here.

Files:

- `Orbitron-Medium.ttf` — the original Medium face (weight class 500; its
  own name table calls the style "Regular"), untouched. Kept as the source;
  not referenced by any stylesheet.
- `Orbitron-Medium.subset.woff2` — the face the Console's Time / Status
  screens load: the same font subset to `U+0020-007E, U+00A0-00FF,
  U+2013-2014, U+2022, U+2026` with fontTools
  (`python -m fontTools.subset "Orbitron Medium.ttf" --unicodes=… --flavor=woff2 --no-hinting`),
  kerning kept, the stylistic-alternate and small-cap features dropped —
  then the ten digits normalised to one tabular advance by
  `scripts/make-orbitron-tabular.py` (D10.2.5; see below); 4 988 bytes.
  Inlined into the single-file build by `vite.config.ts`.
- `OFL.txt` — the licence.

Metrics worth knowing: 1000 units per em; cap height 0.72 em, x-height
0.58 em, ascent 0.75 / descent 0.25; kerning kept (letters only — no pair
in the subset involves a digit); the middle dot `·` (U+00B7) is not in the
font and falls back to the next family in the stack.

The digits are **tabular in this subset** (owner, D10.2.5, 2026-11-13: the
time window must hold one size while the bar · beat ticks). Upstream
Orbitron Medium is proportional with no tabular-figures feature — the
digit `1` advanced 391 units against 826–834 for the others, so a running
readout changed width as its digits changed (measured 6.00 px per bar on
the transport deck's time window). `scripts/make-orbitron-tabular.py`
sets all ten digits to one advance — 834 units, the cell `0` and `8`
already occupy — with each digit's ink centred in its cell (the seven
wide digits keep the designer's own metrics; only `1`, `4` and `7` move).
The script is idempotent (`--check` verifies without writing); the
letters and kerning are untouched, and the original TTF above stays
proportional and unreferenced. Both files' SHA-256 are pinned by
`check:console-transport`; regenerating the subset from the TTF without
re-running the script fails the guard.
