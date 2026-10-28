export type FunctionColor = {
  key: string;
  name: string;
  /** mid tone of the cap */
  base: string;
  /** upper-left highlight of the radial dome */
  hi: string;
  /** lower-right shade of the radial dome */
  lo: string;
  /** pointer / print colour that sits on top of the cap */
  ink: string;
  applies: string;
};

/** §5 — Functional colour coding, applied per pot, not as a panel accent. */
export const COLORS: Record<string, FunctionColor> = {
  cream: {
    key: "cream",
    name: "Cream / off-white",
    base: "#e7ddc4",
    hi: "#fbf5e6",
    lo: "#a29880",
    ink: "#241f18",
    applies: "Input trim, gain staging, fader caps",
  },
  amber: {
    key: "amber",
    name: "Amber / gold",
    base: "#dfa055",
    hi: "#f7d59a",
    lo: "#96601f",
    ink: "#2c1a06",
    applies: "EQ and tonal controls",
  },
  red: {
    key: "red",
    name: "Red",
    base: "#bd4637",
    hi: "#ea9179",
    lo: "#772115",
    ink: "#fdf0ea",
    applies: "Compression and dynamics",
  },
  bluegrey: {
    key: "bluegrey",
    name: "Blue-grey",
    base: "#6d869a",
    hi: "#adc6d5",
    lo: "#3a4f5f",
    ink: "#f1f7fb",
    applies: "Pan, stereo image, spatial placement",
  },
  green: {
    key: "green",
    name: "Green",
    base: "#4d9461",
    hi: "#98d2a4",
    lo: "#245234",
    ink: "#f0fbf2",
    applies: "Sends, auxiliary paths, reverb/delay",
  },
  orange: {
    key: "orange",
    name: "Orange",
    base: "#d97725",
    hi: "#f6b977",
    lo: "#8a430e",
    ink: "#2c1503",
    applies: "Bus/group masters, recurring console accent stripe",
  },
};

export const COLOR_ORDER = ["cream", "amber", "red", "bluegrey", "green", "orange"];

/** §7 — organisational colour: identity marker only, never a control colour. */
export const ORG_COLORS = [
  "#df7a26",
  "#c04a3a",
  "#6d869a",
  "#4d9461",
  "#b9922f",
  "#9c5fb0",
  "#cf6f9a",
  "#4b9fb5",
];
