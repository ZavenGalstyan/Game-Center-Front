/**
 * Corridor 9: Endless Passage — shared constants (used by sim.js, world.js
 * and the tests). Plain data, no Three.js.
 *
 * Top view (x → east, z → north). One loop of the passage:
 *
 *            N corner ── N connector ──▶ J1   (forward exit → next loop)
 *               │
 *         main corridor (length L, posters on the east wall,
 *               │         doors/bench/clock/pipes on the west wall)
 *               │
 *  J0 ◀── S connector ── S corner          (J0 = loop start; going back
 *                                           past it = "turned around")
 *
 * The north end (N corner + N connector) is the south end rotated 180°
 * about the corridor centre, and the next loop's south end is the south end
 * shifted by T. Every texture period divides 1.6 m and every pivot sits on
 * that grid, so both teleports (forward: p - T; back: rotate about J0) land
 * on pixel-identical geometry.
 */
export const W = 3.2; // corridor width
export const H = 2.9; // ceiling height
export const L = 25.6; // main corridor length (z = 0 … L)
export const C = 8; // connector length
export const EYE = 1.62;
export const RADIUS = 0.28;
export const J0 = { x: -W / 2 - C, z: -W / 2 }; // loop start / backward line
export const J1 = { x: W / 2 + C, z: L + W / 2 }; // forward line
export const T = { x: W + 2 * C, z: L + W }; // translation between loops
export const CENTER = { x: 0, z: L / 2 };

export const WALK = 1.9; // m/s
export const RUN = 3.5;
export const GOAL = 9; // reach Exit 9
export const ANOMALY_CHANCE = 0.6;

export const BEST_KEY = "corridor9-best";
export const SETTINGS_KEY = "corridor9-settings";

/** Walkable rectangles [x0, x1, z0, z1] — the connectors run a little past
 *  the junctions so you can step over the line (and get teleported). */
export const WALK_RECTS = [
  [J0.x - 2, W / 2, -W, 0], // S connector + S corner
  [-W / 2, W / 2, -W, L + W], // main corridor + both corners
  [-W / 2, J1.x + 2, L, L + W], // N corner + N connector
];

/* ------------------------------------------------------------------ props
 * East wall (x = +W/2) is on your LEFT walking north; west wall on your right. */
export const PROPS = {
  fixturesZ: [2.4, 6.56, 10.72, 14.88, 19.04, 23.2],
  posters: [
    { id: "p0", z: 4.6, art: "metro" },
    { id: "p1", z: 9.2, art: "lost" }, // goes missing
    { id: "p2", z: 16.4, art: "seaside" }, // changes
    { id: "p3", z: 21.0, art: "concert" },
  ],
  infoSign: { z: 12.8 },
  shadow: { z: 18.7 },
  doors: [
    { id: "d0", z: 6.4, label: "STAFF ONLY", num: "B2-03" },
    { id: "d1", z: 19.2, label: "ELECTRICAL", num: "B2-07" }, // ajar
  ],
  bench: { x: -W / 2 + 0.3, z: 12.8, rot: 0 },
  benchMoved: { x: -0.25, z: 13.4, rot: Math.PI / 2 - 0.12 },
  clock: { z: 12.8, y: 2.12 },
  leak: { z: 9.6 },
  floorPatch: { z0: 16.0, z1: 18.4 },
  extraLightZ: 12.8,
  flickerIndex: 4, // fixture at z = 19.04
  silhouette: { x: 0.55, z: L + W - 0.75 },
  exitSignZ: 0.9,
};

/** Bench footprint (local, before rotation): length along the wall × depth. */
export const BENCH_SIZE = { len: 1.8, depth: 0.5 };
export const DOOR_W = 0.96;
export const DOOR_AJAR = 0.55; // radians

/**
 * The anomaly catalogue. `hint` is used only on the victory / debug screen.
 */
export const ANOMALIES = [
  { id: "poster_missing", name: "A poster is missing" },
  { id: "poster_changed", name: "A poster has changed" },
  { id: "flicker", name: "A ceiling light flickers" },
  { id: "bench", name: "The bench has moved" },
  { id: "door", name: "A door is ajar" },
  { id: "red_sign", name: "The blue sign turned red" },
  { id: "leak", name: "A pipe is leaking" },
  { id: "shadow", name: "A shadow with no owner" },
  { id: "extra_light", name: "An extra ceiling light" },
  { id: "clock", name: "The clock runs backward" },
  { id: "silhouette", name: "Someone at the far end" },
  { id: "floor", name: "The floor tiles change colour" },
];
export const ANOMALY_IDS = ANOMALIES.map((a) => a.id);
export const ANOMALY_NAME = Object.fromEntries(ANOMALIES.map((a) => [a.id, a.name]));
