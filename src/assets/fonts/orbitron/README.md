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
  kerning kept, the stylistic-alternate and small-cap features dropped;
  5 032 bytes. Inlined into the single-file build by `vite.config.ts`.
- `OFL.txt` — the licence.

Metrics worth knowing: 1000 units per em; cap height 0.72 em, x-height
0.58 em, ascent 0.75 / descent 0.25; proportional widths with kerning (there
is no tabular-figures feature: the digit `1` is 391 units wide against
826–834 for the other digits, so a running clock changes width as its
digits change); the middle dot `·` (U+00B7) is not in the font and falls
back to the next family in the stack.
