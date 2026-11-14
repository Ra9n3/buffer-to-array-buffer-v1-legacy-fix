// The VU face re-geometry — pure, no DOM.
//
// The meter's box was stretched horizontally and the print stayed small in
// the middle of it; the fix is one pure function, vuGeometry(W, H), that cuts
// the whole scale to the face it is given. These tests pin its contract at
// the face as it is really laid out — the master VU's card in the meter
// bridge at the reference layout (1366×768, Console room), measured in CSS
// pixels — and, by doubling, at any proportionally larger one:
//
//   T1  every tick's outer end lies ON the scale ellipse, within 0.01 px,
//       at the angle the approved position law gives its dB value;
//   T2  the needle's tip is 97% of the way from the pivot to the ellipse at
//       both end stops, and on the pivot→0 dB line at 0 dB; levels past the
//       stops rest on them, as they always have;
//   T3  the ticks, the numerals and both arcs (the main arc and the red
//       band) lie fully inside the face with at least 2 px of margin;
//   T4  doubling W and H leaves every position the same fraction of the face.
import test from "node:test";
import assert from "node:assert/strict";
import { SWEEP_DEG, VU_MARKS, VU_MAX, VU_MIN, VU_RED_FROM, vuGeometry, vuPosition } from "../src/components/hardware/vu-geometry.ts";

/** The measured master-VU face at the current layout: the card inside the
 *  bezel (the drawing area), CSS pixels — 1366×768, Console room. */
const W = 192.23;
const H = 64.61;

const rad = (deg) => (deg * Math.PI) / 180;
const geo = vuGeometry(W, H);

/** The ellipse point the law puts a dB value at. */
const ellipsePointAt = (g, aDeg) => ({
  x: g.pivot.x + g.rx * Math.sin(rad(aDeg)),
  y: g.pivot.y - g.ry * Math.cos(rad(aDeg)),
});

/* --- T1: the ticks --------------------------------------------------------- */

test("T1 every tick's outer end lies on the scale ellipse, at its own angle, within 0.01 px", () => {
  assert.equal(geo.ticks.length, VU_MARKS.length, "the ticks are not the marks' own list");
  VU_MARKS.forEach((mark, i) => {
    const tick = geo.ticks[i];
    assert.equal(tick.db, mark.db, `tick ${i} is not the ${mark.db} dB mark`);
    assert.equal(tick.weight, mark.weight, `the ${mark.db} dB tick's weight changed`);
    assert.equal(tick.numeral, mark.numeral === true, `the ${mark.db} dB tick's numeral flag changed`);

    // The outer end is exactly the ellipse point at the angle the law gives.
    const a = -SWEEP_DEG + 2 * SWEEP_DEG * vuPosition(mark.db);
    const p = ellipsePointAt(geo, a);
    assert.ok(
      Math.abs(tick.x1 - p.x) < 1e-9 && Math.abs(tick.y1 - p.y) < 1e-9,
      `the ${mark.db} dB tick's outer end is not the ellipse point at ${a.toFixed(2)}°`,
    );

    // And it lies on the ellipse proper: the first-order distance from the
    // curve, |F| / |∇F| for the implicit ellipse equation, is under 0.01 px.
    const dx = tick.x1 - geo.pivot.x;
    const dy = tick.y1 - geo.pivot.y;
    const F = (dx * dx) / (geo.rx * geo.rx) + (dy * dy) / (geo.ry * geo.ry) - 1;
    const grad = Math.hypot((2 * dx) / (geo.rx * geo.rx), (2 * dy) / (geo.ry * geo.ry));
    const distance = Math.abs(F) / grad;
    assert.ok(distance < 0.01, `the ${mark.db} dB tick's outer end sits ${distance.toFixed(4)} px off the ellipse`);
  });

  // The arc the ticks sit on runs between the two end marks' ellipse points.
  const left = ellipsePointAt(geo, -SWEEP_DEG);
  const right = ellipsePointAt(geo, SWEEP_DEG);
  assert.ok(
    geo.arc.d.startsWith(`M ${left.x.toFixed(2).replace(/\.?0+$/, "")} ${left.y.toFixed(2).replace(/\.?0+$/, "")}`) &&
      geo.arc.d.endsWith(`${right.x.toFixed(2).replace(/\.?0+$/, "")} ${right.y.toFixed(2).replace(/\.?0+$/, "")}`),
    `the main arc does not run from the −70° point to the +70° point: ${geo.arc.d}`,
  );
});

/* --- T2: the needle -------------------------------------------------------- */

test("T2 the needle's tip is 97% of the way to the ellipse at both stops, and on the pivot→0 dB line at 0 dB", () => {
  assert.equal(VU_MIN, -20, "the left stop is not −20 dB");
  assert.equal(VU_MAX, 3, "the right stop is not +3 dB");

  for (const [level, angle] of [
    [VU_MIN, -SWEEP_DEG],
    [VU_MAX, SWEEP_DEG],
  ]) {
    const g = vuGeometry(W, H, { level });
    const end = ellipsePointAt(g, angle);
    assert.ok(
      Math.abs(g.needle.x1 - g.pivot.x) < 1e-9 && Math.abs(g.needle.y1 - g.pivot.y) < 1e-9,
      `the needle at ${level} dB does not start at the pivot`,
    );
    const tipX = g.pivot.x + 0.97 * (end.x - g.pivot.x);
    const tipY = g.pivot.y + 0.97 * (end.y - g.pivot.y);
    assert.ok(
      Math.abs(g.needle.x2 - tipX) < 1e-9 && Math.abs(g.needle.y2 - tipY) < 1e-9,
      `the tip at ${level} dB is not 97% of the way to the ${angle}° ellipse point`,
    );
  }

  // At 0 dB the tip lies on the line from the pivot to the 0 dB tick's
  // ellipse point — the printed mark it reads against.
  const g = vuGeometry(W, H, { level: 0 });
  const zero = geo.ticks.find((t) => t.db === 0);
  const cross = (g.needle.x2 - g.pivot.x) * (zero.y1 - g.pivot.y) - (g.needle.y2 - g.pivot.y) * (zero.x1 - g.pivot.x);
  assert.ok(Math.abs(cross) < 1e-9, `the 0 dB tip is not on the pivot→0 dB line (cross ${cross})`);
  const dot = (g.needle.x2 - g.pivot.x) * (zero.x1 - g.pivot.x) + (g.needle.y2 - g.pivot.y) * (zero.y1 - g.pivot.y);
  const lengthSq = (zero.x1 - g.pivot.x) ** 2 + (zero.y1 - g.pivot.y) ** 2;
  assert.ok(Math.abs(dot / lengthSq - 0.97) < 1e-9, `the 0 dB tip is not at 97% of the pivot→0 dB line`);

  // Levels past the stops rest on them, as they always have.
  const below = vuGeometry(W, H, { level: VU_MIN - 40 });
  const atMin = vuGeometry(W, H, { level: VU_MIN });
  const above = vuGeometry(W, H, { level: VU_MAX + 40 });
  const atMax = vuGeometry(W, H, { level: VU_MAX });
  assert.ok(
    below.needle.x2 === atMin.needle.x2 && below.needle.y2 === atMin.needle.y2,
    "a level below the left stop does not rest on the left stop",
  );
  assert.ok(
    above.needle.x2 === atMax.needle.x2 && above.needle.y2 === atMax.needle.y2,
    "a level above the right stop does not rest on the right stop",
  );
});

/* --- T3: the margins ------------------------------------------------------- */

test("T3 the ticks, the numerals and both arcs lie fully inside the face with at least 2 px margin", () => {
  const s = H / 68; // the print's own scale, the old card's height over this one's
  const box = (x, y, hw, hh, what) => {
    assert.ok(x - hw >= 2, `${what}: the left edge ${x - hw} is inside the 2 px margin`);
    assert.ok(y - hh >= 2, `${what}: the top edge ${y - hh} is inside the 2 px margin`);
    assert.ok(x + hw <= W - 2, `${what}: the right edge ${x + hw} is inside the 2 px margin`);
    assert.ok(y + hh <= H - 2, `${what}: the bottom edge ${y + hh} is inside the 2 px margin`);
  };

  // The ticks, both ends, half a stroke-width clear either way.
  const halfStroke = { major: 0.5 * s, medium: 0.35 * s, minor: 0.25 * s };
  for (const t of geo.ticks) {
    box(t.x1, t.y1, halfStroke[t.weight], halfStroke[t.weight], `the ${t.db} dB tick's outer end`);
    box(t.x2, t.y2, halfStroke[t.weight], halfStroke[t.weight], `the ${t.db} dB tick's inner end`);
  }

  // The numerals: a conservative box round the centre — 0.45 em per
  // character wide (the sign counts as one), 0.7 em tall.
  for (const t of geo.ticks.filter((x) => x.numeral)) {
    const chars = t.db === 0 ? 1 : String(Math.abs(t.db)).length + 1;
    box(t.nx, t.ny, 0.45 * geo.sizes.numeral * chars, 0.7 * geo.sizes.numeral, `the ${t.db} dB numeral`);
  }

  // The main arc, sampled: every point of the ellipse between the stops,
  // half its stroke-width clear.
  const steps = 140;
  for (let i = 0; i <= steps; i++) {
    const a = -SWEEP_DEG + (2 * SWEEP_DEG * i) / steps;
    const p = ellipsePointAt(geo, a);
    box(p.x, p.y, 0.35 * s, 0.35 * s, `the arc at ${a.toFixed(1)}°`);
  }

  // The red band: the offset ellipse it rides, from the red zone's start to
  // the right stop, its whole stroke-width clear on the outside.
  assert.ok(geo.redBand, "the VU face has no red band");
  const gap = 0.35 * s;
  const off = gap + geo.redBand.strokeWidth / 2;
  const from = -SWEEP_DEG + 2 * SWEEP_DEG * vuPosition(VU_RED_FROM);
  for (let i = 0; i <= steps; i++) {
    const a = from + ((SWEEP_DEG - from) * i) / steps;
    const band = {
      rx: geo.rx + off,
      ry: geo.ry + off,
    };
    const p = { x: geo.pivot.x + band.rx * Math.sin(rad(a)), y: geo.pivot.y - band.ry * Math.cos(rad(a)) };
    // the stroke's outer edge, along the band's own normal
    const gx = Math.sin(rad(a)) / band.rx;
    const gy = -Math.cos(rad(a)) / band.ry;
    const len = Math.hypot(gx, gy);
    const half = geo.redBand.strokeWidth / 2;
    box(
      p.x + (half * gx) / len,
      p.y + (half * gy) / len,
      0,
      0,
      `the red band's outer edge at ${a.toFixed(1)}°`,
    );
  }
});

/* --- T4: proportional scaling ----------------------------------------------- */

test("T4 doubling W and H leaves every position the same fraction of the face", () => {
  const a = vuGeometry(W, H, { level: -1.5 });
  const b = vuGeometry(2 * W, 2 * H, { level: -1.5 });
  const close = (p, q, what) => {
    assert.ok(Math.abs(q - 2 * p) <= 1e-9 * Math.max(1, Math.abs(2 * p)), `${what}: ${q} is not twice ${p}`);
  };
  close(a.pivot.x, b.pivot.x, "the pivot's x");
  close(a.pivot.y, b.pivot.y, "the pivot's y");
  close(a.rx, b.rx, "rx");
  close(a.ry, b.ry, "ry");
  close(a.legend.x, b.legend.x, "the legend's x");
  close(a.legend.y, b.legend.y, "the legend's y");
  close(a.needle.x1, b.needle.x1, "the needle's x1");
  close(a.needle.y1, b.needle.y1, "the needle's y1");
  close(a.needle.x2, b.needle.x2, "the needle's x2");
  close(a.needle.y2, b.needle.y2, "the needle's y2");
  close(a.hub.cx, b.hub.cx, "the hub's cx");
  close(a.hub.cy, b.hub.cy, "the hub's cy");
  close(a.hub.r, b.hub.r, "the hub's r");
  close(a.hub.pinR, b.hub.pinR, "the hub pin's r");
  close(a.sizes.numeral, b.sizes.numeral, "the numeral size");
  close(a.sizes.legend, b.sizes.legend, "the legend size");
  close(a.sizes.needle, b.sizes.needle, "the needle stroke");
  close(a.sizes.redBand, b.sizes.redBand, "the red band's width");
  assert.equal(b.ticks.length, a.ticks.length, "the doubled face has a different tick count");
  a.ticks.forEach((ta, i) => {
    const tb = b.ticks[i];
    close(ta.x1, tb.x1, `the ${ta.db} dB tick's x1`);
    close(ta.y1, tb.y1, `the ${ta.db} dB tick's y1`);
    close(ta.x2, tb.x2, `the ${ta.db} dB tick's x2`);
    close(ta.y2, tb.y2, `the ${ta.db} dB tick's y2`);
    close(ta.nx, tb.nx, `the ${ta.db} dB numeral's x`);
    close(ta.ny, tb.ny, `the ${ta.db} dB numeral's y`);
  });
});
