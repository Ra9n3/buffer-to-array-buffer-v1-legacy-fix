/**
 * The VU meter's scale — its law and its geometry — as one pure module, no DOM.
 *
 * The LAW is the approved one, moved verbatim from VUMeter.svelte (nothing
 * about which dB sits where has changed: VU_MIN … VU_MAX, linear in modulation
 * percentage, the red band from VU_RED_FROM; the GR face its own card). It
 * lives here so the geometry and the tests read one source of truth, and
 * VUMeter.svelte re-exports every name, so imports from the component keep
 * working unchanged.
 *
 * The GEOMETRY is the re-cut of the stretched-card problem: the meter's box
 * was widened and the print stayed at its old size, small in the middle of the
 * card. vuGeometry(W, H) now cuts the whole print to the face it is given,
 * whatever that face's shape — the scale an ELLIPSE spanning the face's full
 * width, its ends 6% in from either side (rx = (W/2 − 0.06·W) / sin 70°), its
 * top 14% down from the card's top edge (ry = pivotY − 0.14·H), the pivot the
 * ellipse's own centre, 10% up from the foot. The needle is a straight line
 * from the pivot, its tip 97% of the way to the ellipse; the ticks and the
 * numerals run INWARD along the ellipse normal; the red band keeps its old
 * seat just outside the main arc. Every SIZE is the 1× print's own value
 * scaled by H / 68 — the approved card's height — so the print grows with the
 * card's height and spreads with its width, never letterboxed, never
 * distorted: the function is unit-free, call it in any consistent unit (the
 * component passes the face's own viewBox units, the tests the measured CSS
 * pixels).
 */

/** One mark on the VU face: a dB value relative to 0 VU and its weight. */
export interface VUMark {
  readonly db: number;
  readonly weight: "major" | "medium" | "minor";
  /** Numerals at the key points only (hardware spec §4a). */
  readonly numeral?: boolean;
}

/** The scale's two end stops and the start of the red overload band. */
export const VU_MIN = -20;
export const VU_MAX = 3;
export const VU_RED_FROM = 0;

/**
 * The standard VU face. Numerals at the key points; the one-dB marks either
 * side of 0 as unnumbered ticks; a few minors in the crowded lower range.
 * The face is linear in modulation percentage (0 VU = 100%), which is why
 * the dB marks bunch toward the left and the red third is only 3 dB wide.
 */
export const VU_MARKS: readonly VUMark[] = [
  { db: -20, weight: "major", numeral: true },
  { db: -15, weight: "minor" },
  { db: -12, weight: "minor" },
  { db: -10, weight: "major", numeral: true },
  { db: -8, weight: "minor" },
  { db: -7, weight: "major", numeral: true },
  { db: -6, weight: "minor" },
  { db: -5, weight: "major", numeral: true },
  { db: -4, weight: "minor" },
  { db: -3, weight: "major", numeral: true },
  { db: -2, weight: "medium" },
  { db: -1, weight: "medium" },
  { db: 0, weight: "major", numeral: true },
  { db: 1, weight: "medium" },
  { db: 2, weight: "medium" },
  { db: 3, weight: "major", numeral: true },
];

/**
 * TWO FACES (Task 2.8). The instrument is the same; only the printed card
 * differs. `"vu"` is the face above. `"gr"` is a dedicated gain-reduction
 * scale: 0 dB of reduction at the RIGHT stop, 20 dB at the left, the
 * needle falling leftward as reduction increases — a VU meter switched to
 * read gain reduction, with the card printed for that job. No red band,
 * no signed numerals, "GR" for the legend. It keeps the movement's own law
 * (linear in modulation from the 0 stop), so the first few dB take most of
 * the arc exactly as they do on the VU face.
 */
export type MeterFace = "vu" | "gr";
export const GR_MIN = 0;
export const GR_MAX = 20;
export const GR_MARKS: readonly VUMark[] = [
  { db: 0, weight: "major", numeral: true },
  { db: 1, weight: "major", numeral: true },
  { db: 2, weight: "medium" },
  { db: 3, weight: "major", numeral: true },
  { db: 4, weight: "minor" },
  { db: 5, weight: "major", numeral: true },
  { db: 7, weight: "minor" },
  { db: 10, weight: "major", numeral: true },
  { db: 15, weight: "minor" },
  { db: 20, weight: "major", numeral: true },
];

const modulation = (db: number): number => 100 * Math.pow(10, db / 20);

/**
 * Where a dB value sits along the arc: 0 at the left stop (−20), 1 at the
 * right stop (+3). Values past the stops rest on them — the needle never
 * leaves the printed scale.
 */
export function vuPosition(db: number): number {
  const clamped = Math.min(VU_MAX, Math.max(VU_MIN, db));
  return (modulation(clamped) - modulation(VU_MIN)) / (modulation(VU_MAX) - modulation(VU_MIN));
}

/** Where a gain-reduction value sits along the arc: 0 at the left stop (20 dB), 1 at the right (0 dB). */
export function grPosition(db: number): number {
  const clamped = Math.min(GR_MAX, Math.max(GR_MIN, db));
  return (modulation(-clamped) - modulation(-GR_MAX)) / (modulation(0) - modulation(-GR_MAX));
}

/** The needle's sweep either side of straight up: the scale runs −70° … +70°. */
export const SWEEP_DEG = 70;

/** The needle's angle from vertical for a dB value, in degrees (clockwise positive). */
export function vuAngle(db: number): number {
  return -SWEEP_DEG + 2 * SWEEP_DEG * vuPosition(db);
}

export function grAngle(db: number): number {
  return -SWEEP_DEG + 2 * SWEEP_DEG * grPosition(db);
}

/* --- the geometry --------------------------------------------------------- */

/** The face the 1× print was drawn for: the approved card's height, in units. */
const OLD_FACE_H = 68;
/** The 1× tick lengths: the outer end on the arc, running inward. */
const TICK_LEN = { major: 5, medium: 3.6, minor: 2.3 } as const;
/** The 1× gap from the arc to the numeral centres (55.5 − 46 on the old dial). */
const LABEL_OFFSET = 9.5;
/** The 1× red band: its thickness, and its gap outside the main arc. */
const RED_BAND_W = 2.4;
const RED_BAND_GAP = 0.35;
/** The 1× numerals and legend. */
const NUMERAL_SIZE = 6.6;
const LEGEND_SIZE = 9;
/** The legend's centre at 45.5 of 68 up the card (the old PIVOT_Y − 15.5, in face units). */
const LEGEND_Y_FRACTION = 45.5 / OLD_FACE_H;
/** The needle: a line of the 1× stroke, its tip 97% of the way to the scale. */
const NEEDLE_W = 1;
const NEEDLE_REACH = 0.97;
/** The 1× needle shadow: down and to the right, onto the card. */
const NEEDLE_SHADOW_DX = 1.1;
const NEEDLE_SHADOW_DY = 1.6;
/** The 1× pivot screw: the hub, its pin, its shadow's offset. */
const HUB_R = 3.2;
const HUB_PIN_R = 1.1;
const HUB_SHADOW_DX = 0.8;
const HUB_SHADOW_DY = 1.1;

/** Which card vuGeometry cuts: the marks, their law, the red band, the reading. */
export interface VuGeometryOptions {
  /** The reading the needle takes; values past the stops rest on them. */
  readonly level?: number;
  /** The card's marks. Default the VU face's. */
  readonly marks?: readonly VUMark[];
  /** The dB → position law, 0 at the left stop, 1 at the right. Default vuPosition. */
  readonly position?: (db: number) => number;
  /** Where the red band starts, or null for a card without one. Default VU_RED_FROM. */
  readonly redFrom?: number | null;
}

/** One tick: its line (the outer end on the ellipse, the inner end inward) and, when it carries one, its numeral's centre. */
export interface VuTickGeometry {
  readonly db: number;
  readonly weight: "major" | "medium" | "minor";
  readonly numeral: boolean;
  readonly red: boolean;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly nx: number;
  readonly ny: number;
}

/** The needle: a straight line from the pivot, and its shadow as the same blade — a thin quad, because a bare line's filter region degenerates the day the blade stands exactly vertical. */
export interface VuNeedleGeometry {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly shadow: { readonly points: string };
}

/** Everything the print needs, in the same units W and H were given in. */
export interface VuGeometry {
  readonly W: number;
  readonly H: number;
  /** The needle's pivot: the ellipse's centre, 10% up from the foot. */
  readonly pivot: { readonly x: number; readonly y: number };
  /** The scale ellipse's radii. */
  readonly rx: number;
  readonly ry: number;
  /** The main arc, from −70° to +70°. */
  readonly arc: { readonly d: string };
  /** The red overload band, just outside the main arc as it always sat — or null on a card without one. */
  readonly redBand: { readonly d: string; readonly strokeWidth: number } | null;
  /** One entry per mark, in the marks' own order. */
  readonly ticks: readonly VuTickGeometry[];
  /** The legend's centre ("VU" / "GR" — the caller prints the word): centred across, at the old relative height. */
  readonly legend: { readonly x: number; readonly y: number };
  readonly needle: VuNeedleGeometry;
  /** The pivot screw: the hub, its pin and its shadow's offset. */
  readonly hub: {
    readonly cx: number;
    readonly cy: number;
    readonly r: number;
    readonly pinR: number;
    readonly shadowDx: number;
    readonly shadowDy: number;
  };
  /** The print's sizes, every one the 1× value scaled by H / 68. */
  readonly sizes: {
    readonly numeral: number;
    readonly legend: number;
    readonly needle: number;
    readonly redBand: number;
  };
}

/** The path formatter the component's own drawing uses: two decimals, trailing zeros trimmed. */
const fmt = (n: number): string => n.toFixed(2).replace(/\.?0+$/, "");

/**
 * Cut the whole print to one face. Pure: no DOM, no state, nothing cached —
 * the same (W, H, options) always yields the same numbers, so the component
 * can call it in a $derived and the tests can call it directly.
 */
export function vuGeometry(W: number, H: number, options: VuGeometryOptions = {}): VuGeometry {
  const marks = options.marks ?? VU_MARKS;
  const position = options.position ?? vuPosition;
  const redFrom = options.redFrom === undefined ? VU_RED_FROM : options.redFrom;
  const level = options.level ?? VU_MIN;

  /** The print's own scale: every 1× size grows with the card's height. */
  const s = H / OLD_FACE_H;

  const pivot = { x: W / 2, y: H - 0.1 * H };
  const rx = (W / 2 - 0.06 * W) / Math.sin((SWEEP_DEG * Math.PI) / 180);
  const ry = pivot.y - 0.14 * H;

  /** A point on the scale ellipse at angle a, degrees from straight up. */
  const pointAt = (arx: number, ary: number, aDeg: number): { x: number; y: number } => {
    const a = (aDeg * Math.PI) / 180;
    return { x: pivot.x + arx * Math.sin(a), y: pivot.y - ary * Math.cos(a) };
  };
  /** The angle a dB value sits at: −70° at the left stop, +70° at the right. */
  const angleFor = (db: number): number => -SWEEP_DEG + 2 * SWEEP_DEG * position(db);
  /** The ellipse's outward normal at angle a, normalised. */
  const normalAt = (aDeg: number): { x: number; y: number } => {
    const a = (aDeg * Math.PI) / 180;
    const gx = Math.sin(a) / rx;
    const gy = -Math.cos(a) / ry;
    const len = Math.hypot(gx, gy);
    return { x: gx / len, y: gy / len };
  };
  /** An elliptical arc along a (possibly offset) scale ellipse, clockwise through the top. */
  const arcPath = (arx: number, ary: number, a0: number, a1: number): string => {
    const p0 = pointAt(arx, ary, a0);
    const p1 = pointAt(arx, ary, a1);
    return `M ${fmt(p0.x)} ${fmt(p0.y)} A ${fmt(arx)} ${fmt(ary)} 0 0 1 ${fmt(p1.x)} ${fmt(p1.y)}`;
  };

  const ticks: VuTickGeometry[] = marks.map((mark) => {
    const a = angleFor(mark.db);
    const p = pointAt(rx, ry, a);
    const n = normalAt(a);
    const len = TICK_LEN[mark.weight] * s;
    const off = LABEL_OFFSET * s;
    return {
      db: mark.db,
      weight: mark.weight,
      numeral: mark.numeral === true,
      red: redFrom !== null && mark.db > redFrom,
      x1: p.x,
      y1: p.y,
      x2: p.x - n.x * len,
      y2: p.y - n.y * len,
      nx: p.x - n.x * off,
      ny: p.y - n.y * off,
    };
  });

  const bandOffset = (RED_BAND_GAP + RED_BAND_W / 2) * s;
  const redBand =
    redFrom === null
      ? null
      : {
          d: arcPath(rx + bandOffset, ry + bandOffset, angleFor(redFrom), SWEEP_DEG),
          strokeWidth: RED_BAND_W * s,
        };

  const a = angleFor(level);
  const end = pointAt(rx, ry, a);
  const tip = { x: pivot.x + (end.x - pivot.x) * NEEDLE_REACH, y: pivot.y + (end.y - pivot.y) * NEEDLE_REACH };
  const dx = tip.x - pivot.x;
  const dy = tip.y - pivot.y;
  const length = Math.hypot(dx, dy);
  const half = (NEEDLE_W * s) / 2;
  const shadow = {
    points: [
      [pivot.x - (dy / length) * half + NEEDLE_SHADOW_DX * s, pivot.y + (dx / length) * half + NEEDLE_SHADOW_DY * s],
      [tip.x - (dy / length) * half + NEEDLE_SHADOW_DX * s, tip.y + (dx / length) * half + NEEDLE_SHADOW_DY * s],
      [tip.x + (dy / length) * half + NEEDLE_SHADOW_DX * s, tip.y - (dx / length) * half + NEEDLE_SHADOW_DY * s],
      [pivot.x + (dy / length) * half + NEEDLE_SHADOW_DX * s, pivot.y - (dx / length) * half + NEEDLE_SHADOW_DY * s],
    ]
      .map(([x, y]) => `${fmt(x)},${fmt(y)}`)
      .join(" "),
  };

  return {
    W,
    H,
    pivot,
    rx,
    ry,
    arc: { d: arcPath(rx, ry, -SWEEP_DEG, SWEEP_DEG) },
    redBand,
    ticks,
    legend: { x: W / 2, y: H * LEGEND_Y_FRACTION },
    needle: { x1: pivot.x, y1: pivot.y, x2: tip.x, y2: tip.y, shadow },
    hub: {
      cx: pivot.x,
      cy: pivot.y,
      r: HUB_R * s,
      pinR: HUB_PIN_R * s,
      shadowDx: HUB_SHADOW_DX * s,
      shadowDy: HUB_SHADOW_DY * s,
    },
    sizes: {
      numeral: NUMERAL_SIZE * s,
      legend: LEGEND_SIZE * s,
      needle: NEEDLE_W * s,
      redBand: RED_BAND_W * s,
    },
  };
}
