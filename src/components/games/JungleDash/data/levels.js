/**
 * Jungle Dash — the six handcrafted levels.
 *
 * Units are metres; +y up; every level starts near z = 0 and runs toward −z
 * (the camera looks down −z). Boxes are [x0, y0, z0, x1, y1, z1].
 *
 *   solids      static ground / walls            { b, m (material) }
 *   movers      moving platforms (2-point ping-pong) { size:[w,h,d], path:[[x,top,z],[x,top,z]], period, phase }
 *   fallers     platforms that drop after you land { b, m, delay }
 *   crates      { p:[x, bottomY, z], t: n normal · b bounce · h heart · s cracked secret wall }
 *   fruits      [x, y, z] golden fruit            hearts  [x, y, z]
 *   enemies     crab / thorn: { t, a, b, speed } patrol a↔b · plant: { t, p, range, fire }
 *   hazards     spikes { b } · tspikes { b, period, on, phase } · slider { size, path, period }
 *               jet { p, h, r, period, on, phase } · crusher { b, drop, period, phase }
 *   kills       lava / water volumes { b, kind }
 *   checkpoints [x, y, z]   portal [x, y, z]   boss { p, arena:[x0, z0, x1, z1] }
 */

/** ground strip along z: x centre, near z0 → far z1 (z0 > z1), width w, top height */
const run = (x, z0, z1, w, top = 0, m = "grass", h = 6) => ({ b: [x - w / 2, top - h, z1, x + w / 2, top, z0], m });
/** box by centre (x, z), size (w, d), top height and thickness */
const box = (x, z, w, d, top = 0, h = 1, m = "stone") => ({ b: [x - w / 2, top - h, z - d / 2, x + w / 2, top, z + d / 2], m });
/** n fruit in a straight line */
const line = (a, b, n) => Array.from({ length: n }, (_, i) => {
  const k = n === 1 ? 0.5 : i / (n - 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
});
/** n fruit along a jump arc from a to b with apex height h */
const arc = (a, b, n, h) => line(a, b, n).map((p, i) => [p[0], p[1] + Math.sin((Math.PI * (i + 1)) / (n + 1)) * h, p[2]]);
const F = 0.75; // fruit height above the ground

/* ----------------------------------------------------------------------- 1 */
const sunny = {
  id: 1,
  key: "sunny",
  name: "Sunny Jungle",
  blurb: "Learn to run, jump and spin through the crates.",
  theme: "sunny",
  spawn: [0, 0, 3],
  killY: -3,
  liquid: "water",
  liquidY: -2.6,
  par: 70,
  solids: [
    run(0, 6, -20, 7, 0),
    run(0, -23, -31, 6, 0),
    run(0, -31, -44, 6, 1.2),
    run(5, -34, -44, 3, 3.8, "grass", 1), // high bonus ledge (bounce crate)
    run(1, -46, -62, 9, 0),
    run(0, -62, -74, 2.2, 0, "wood", 0.5), // rope bridge
    run(0, -74, -93, 9, 0),
  ],
  crates: [
    { p: [-1.5, 0, -8] },
    { p: [1.5, 0, -8] },
    { p: [0, 0, -13] },
    { p: [0, 1, -13] },
    { p: [-1.8, 1.2, -36] },
    { p: [1.6, 1.2, -38.5], t: "b" },
    { p: [5, 3.8, -42] },
    { p: [-2.2, 0, -49] },
    { p: [3.5, 0, -56] },
    { p: [-3, 0, -79] },
    { p: [-2, 0, -79] },
    { p: [-2.5, 1, -79] },
    { p: [3, 0, -82], t: "h" },
  ],
  fruits: [
    ...line([0, F, -2], [0, F, -6], 3),
    ...arc([0, F, -19.5], [0, F, -23.5], 4, 1.4),
    ...line([0, F, -25], [0, F, -29], 3),
    ...line([0, 1.2 + F, -33], [0, 1.2 + F, -41], 4),
    ...line([4.6, 3.8 + F, -35], [4.6, 3.8 + F, -40], 4),
    ...line([5.4, 3.8 + F, -35], [5.4, 3.8 + F, -40], 4),
    ...line([1.6, 4.4, -38.5], [1.6, 5.6, -38.5], 2),
    ...arc([0, 0.6 + F, -43], [0, F, -46.5], 3, 1.2),
    ...arc([0, F, -50.2], [0, F, -53.8], 3, 1.6),
    ...line([0, F, -64], [0, F, -72], 5),
    ...line([-2, F, -76], [2, F, -76], 3),
  ],
  hearts: [],
  enemies: [
    { t: "crab", a: [-2.5, 0, -17], b: [2.5, 0, -17], speed: 1.5 },
    { t: "crab", a: [-2.5, 0, -58.5], b: [3.5, 0, -58.5], speed: 1.8 },
    { t: "plant", p: [-3.3, 0, -85], range: 8 },
  ],
  hazards: [{ t: "spikes", b: [-3.4, 0, -52.5, 5.4, 0.45, -51.5] }],
  checkpoints: [
    [-1.2, 1.2, -33],
    [0, 0, -60],
  ],
  portal: [0, 0, -89.5],
  hints: [
    { z0: 6, z1: -4.5, text: "WASD / Arrows to move · Space to jump", touch: "Drag on the left side to move · JUMP to jump" },
    { z0: -4.5, z1: -12, text: "Spin into crates to smash them: Left click or J", touch: "Tap SPIN to smash crates" },
    { z0: -14, z1: -18, text: "Spin into the crab — or jump on its shell!", touch: "SPIN into the crab — or jump on it!" },
    { z0: -34.5, z1: -40, text: "Blue crates are springs — hold Space for a big bounce", touch: "Blue crates are springs — hold JUMP for a big bounce" },
    { z0: -48.5, z1: -51.2, text: "Jump over the spikes!" },
  ],
};

/* ----------------------------------------------------------------------- 2 */
const river = {
  id: 2,
  key: "river",
  name: "River Crossing",
  blurb: "Rope bridges and drifting rafts over the rapids.",
  theme: "river",
  spawn: [0, 0, 3],
  killY: -3,
  liquid: "water",
  liquidY: -2.6,
  par: 85,
  solids: [
    run(0, 6, -14, 7, 0),
    run(0, -14, -28, 2, 0, "wood", 0.5), // rope bridge
    run(0, -28, -38, 7, 0),
    run(0, -54, -64, 7, 0),
    run(0, -71, -80, 6, 0.6),
    box(1.5, -83, 2, 2, 0.9, 1, "stone"), // stepping stones
    box(-1, -86.5, 2, 2, 1.2, 1, "stone"),
    box(0.5, -90, 2.4, 2, 0.8, 1, "stone"),
    run(0, -94.2, -112, 7, 4, "grass", 7),
  ],
  movers: [
    { size: [3, 0.5, 3], path: [[0, 0, -39.6], [0, 0, -52.4]], period: 8, hold: 0.18, m: "wood" }, // raft along the river
    { size: [3, 0.5, 3], path: [[0, 0, -67.5], [6, 0, -67.5]], period: 7, hold: 0.22, m: "wood" }, // raft drifting sideways
    { size: [3, 0.5, 3], path: [[0, 0.8, -92.6], [0, 4, -92.6]], period: 6, hold: 0.22, m: "wood" }, // lift
  ],
  crates: [
    { p: [-1.6, 0, -6] },
    { p: [1.6, 0, -6] },
    { p: [-2.4, 0, -33] },
    { p: [-2.4, 1, -33] },
    { p: [2.4, 0, -30.5], t: "h" },
    { p: [-2.2, 0, -60] },
    { p: [2.2, 0, -60] },
    { p: [2.2, 1, -60] },
    { p: [-1.8, 0.6, -77] },
    { p: [2.4, 4, -99] },
    { p: [-2.6, 4, -101], t: "b" },
    { p: [1.5, 4, -106] },
  ],
  fruits: [
    ...line([0, F, -1], [0, F, -11], 5),
    ...line([0, F, -15], [0, F, -27], 6),
    ...line([0, F, -34], [0, F, -37], 2),
    ...line([0, F + 0.3, -42], [0, F + 0.3, -50], 5),
    ...line([0, F, -56], [0, F, -63], 4),
    ...arc([0, F, -64], [0, 0.6 + F, -71.5], 4, 1.8),
    ...line([0, 0.6 + F, -73], [0, 0.6 + F, -79], 4),
    [1.5, 0.9 + F, -83],
    [-1, 1.2 + F, -86.5],
    [0.5, 0.8 + F, -90],
    ...line([0, 1.8, -92.6], [0, 3.6, -92.6], 3),
    ...line([0, 4 + F, -96], [0, 4 + F, -104], 4),
    ...line([-2.6, 7.6, -101], [-2.6, 8.8, -101], 2),
  ],
  hearts: [],
  enemies: [
    { t: "crab", a: [0, 0, -17.5], b: [0, 0, -25], speed: 1.5 },
    { t: "plant", p: [-2.9, 0, -36.6], range: 8 },
    { t: "crab", a: [-2.6, 0, -57.5], b: [2.6, 0, -57.5], speed: 1.9 },
    { t: "plant", p: [2.8, 4, -103.5], range: 9 },
  ],
  hazards: [],
  checkpoints: [
    [0, 0, -31],
    [0, 0.6, -74],
  ],
  portal: [0, 4, -108.5],
  hints: [
    { z0: -36, z1: -39, text: "Wait for the raft, then hop on — it carries you across!" },
    { z0: -62.5, z1: -64.5, text: "Jump onto the raft when it drifts in front of you" },
    { z0: -90, z1: -92, text: "Ride the lift up" },
  ],
};

/* ----------------------------------------------------------------------- 3 */
const W3 = 2.6; // temple corridor wall height
const temple = {
  id: 3,
  key: "temple",
  name: "Ancient Temple",
  blurb: "Spike traps, crushers and secret rooms.",
  theme: "temple",
  spawn: [0, 0, 3],
  killY: -6,
  liquid: "abyss",
  par: 100,
  solids: [
    run(0, 6, -14, 8, 0, "sand", 8),
    run(0, -14, -34, 6, 0, "sand", 8),
    run(0, -34, -46, 7, 0, "sand", 8),
    // the cracked wall on the right of the hall, with a hidden alcove behind it
    { b: [3.5, 0, -38.5, 4.5, W3, -34], m: "stone" },
    { b: [3.5, 0, -46, 4.5, W3, -39.5], m: "stone" },
    { b: [3.5, 1.4, -39.5, 4.5, W3, -38.5], m: "stone" },
    { b: [3.5, -8, -39.5, 4.5, 0, -38.5], m: "sand" }, // doorway floor
    { b: [4.5, -8, -41.5, 8, 0, -36.5], m: "sand" },
    // crusher hall
    run(0, -46, -64, 4.4, 0, "sand", 8),
    run(0, -64, -72, 7, 0, "sand", 8),
    run(0, -86, -104, 8, 0, "sand", 8),
    run(-5, -91, -100, 3, 3.6, "sand", 1), // high balcony (secret)
  ],
  movers: [{ size: [3, 0.5, 3], path: [[0, 0, -73.6], [0, 0, -84.4]], period: 7.5, hold: 0.2, m: "stone" }],
  crates: [
    { p: [-2, 0, -5] },
    { p: [2, 0, -5] },
    { p: [0, 0, -10] },
    { p: [4, 0, -39], t: "s" }, // cracked wall: spin it!
    { p: [6.5, 0, -39], t: "h" },
    { p: [-2.6, 0, -42] },
    { p: [-2.6, 1, -42] },
    { p: [2.6, 0, -66] },
    { p: [-3, 0, -89] },
    { p: [-2, 0, -95.5], t: "b" },
    { p: [-5.2, 3.6, -97.5] },
    { p: [3, 0, -100] },
  ],
  fruits: [
    ...line([0, F, -2], [0, F, -12], 5),
    ...line([0, F, -15], [0, F, -33], 8),
    ...line([5.6, F, -37.5], [7.4, F, -37.5], 2),
    ...line([5.6, F, -40.5], [7.4, F, -40.5], 2),
    ...line([0, F, -48], [0, F, -63], 7),
    ...line([0, F, -73], [0, F, -84], 5),
    ...line([-4.4, 3.6 + F, -92.5], [-4.4, 3.6 + F, -99], 4),
    ...line([-5.6, 3.6 + F, -92.5], [-5.6, 3.6 + F, -99], 4),
    ...line([0, F, -88], [0, F, -98], 4),
  ],
  hearts: [[-5, 3.6 + 0.9, -93.2]],
  secretZones: [[-6.5, 3.6, -100, -3.5, 6, -91]],
  enemies: [
    { t: "plant", p: [-2.8, 0, -44.8], range: 8 },
    { t: "crab", a: [-3, 0, -90.5], b: [3, 0, -90.5], speed: 2 },
    { t: "plant", p: [3.2, 0, -97], range: 9 },
  ],
  hazards: [
    { t: "tspikes", b: [-3, 0, -20, 3, 0.6, -18], period: 2.4, on: 0.4, phase: 0 },
    { t: "tspikes", b: [-3, 0, -26, 3, 0.6, -24], period: 2.4, on: 0.4, phase: 0.5 },
    { t: "tspikes", b: [-3, 0, -32, 3, 0.6, -30], period: 2.4, on: 0.4, phase: 0 },
    { t: "crusher", b: [-2.2, 4, -51, 2.2, 5.6, -49], drop: 4, period: 2.8, phase: 0 },
    { t: "crusher", b: [-2.2, 4, -56.5, 2.2, 5.6, -54.5], drop: 4, period: 2.8, phase: 0.33 },
    { t: "crusher", b: [-2.2, 4, -62, 2.2, 5.6, -60], drop: 4, period: 2.8, phase: 0.66 },
    { t: "slider", size: [1, 1, 3], path: [[-3.6, 0, -69], [3.6, 0, -69]], period: 4.4, hold: 0.16 },
  ],
  checkpoints: [
    [0, 0, -36],
    [-2, 0, -66],
  ],
  portal: [0, 0, -101.5],
  hints: [
    { z0: -14, z1: -17.6, text: "Spikes pop up in rhythm — cross when they drop" },
    { z0: -36.5, z1: -41, text: "That wall looks cracked… try spinning it!" },
    { z0: -46, z1: -48.6, text: "Crushers! Run through right after one lifts" },
    { z0: -64.5, z1: -67, text: "Wait for the rolling log to pass" },
  ],
};

/* ----------------------------------------------------------------------- 4 */
const jets = (z, xs, phase, top = 0) => xs.map((x) => ({ t: "jet", p: [x, top, z], h: 3.2, r: 0.7, period: 2.6, on: 0.42, phase, warn: 0.7 }));
const volcano = {
  id: 4,
  key: "volcano",
  name: "Volcano Trail",
  blurb: "Lava, fire jets and crumbling rock.",
  theme: "volcano",
  spawn: [0, 0, 3],
  killY: -2.4,
  liquid: "lava",
  liquidY: -2.0,
  par: 100,
  solids: [
    run(0, 6, -12, 7, 0, "basalt"),
    run(0, -12, -30, 7, 0, "basalt"),
    run(0, -43, -58, 7, 0.6, "basalt"),
    run(0, -69.2, -75, 5, 0.6, "basalt"),
    run(0, -77, -97, 7, 1.2, "basalt"),
  ],
  fallers: [
    { b: [-1.25, -1, -33.75, 1.25, 0, -31.25], m: "crack", delay: 0.55, respawn: 3 },
    { b: [0.25, -0.7, -37.75, 2.75, 0.3, -35.25], m: "crack", delay: 0.55, respawn: 3 },
    { b: [-1.75, -0.4, -41.75, 0.75, 0.6, -39.25], m: "crack", delay: 0.55, respawn: 3 },
  ],
  movers: [{ size: [3, 0.5, 3], path: [[0, 0.6, -59.6], [0, 0.6, -67.6]], period: 6.5, hold: 0.2, m: "basalt" }],
  crates: [
    { p: [-1.8, 0, -5] },
    { p: [1.8, 0, -5] },
    { p: [-2.8, 0, -14] },
    { p: [2.8, 0, -28] },
    { p: [-2.6, 0.6, -46] },
    { p: [-2.6, 1.6, -46] },
    { p: [2.6, 0.6, -56.5], t: "h" },
    { p: [-1.5, 0.6, -72.5] },
    { p: [-2.8, 1.2, -83] },
    { p: [2.8, 1.2, -83] },
    { p: [2.8, 2.2, -83] },
    { p: [-2.6, 1.2, -95], t: "b" },
  ],
  fruits: [
    ...line([0, F, -1], [0, F, -10], 4),
    ...line([0, F, -13], [0, F, -16], 2),
    ...line([-1.2, F, -20.5], [-1.2, F, -21.5], 2),
    ...line([1.2, F, -26.5], [1.2, F, -27.5], 2),
    [0, 0.2 + F, -32.5],
    [1.5, 0.5 + F, -36.5],
    [-0.5, 0.8 + F, -40.5],
    ...line([0, 0.6 + F, -44], [0, 0.6 + F, -49], 3),
    ...line([0, 0.6 + F, -53], [0, 0.6 + F, -57], 3),
    ...line([0, 0.6 + F + 0.2, -61], [0, 0.6 + F + 0.2, -66], 3),
    ...line([0, 0.6 + F, -70.5], [0, 0.6 + F, -74], 2),
    ...arc([0, 0.6 + F, -75], [0, 1.2 + F, -77.5], 3, 1.4),
    ...line([0, 1.2 + F, -79], [0, 1.2 + F, -84], 3),
    ...line([0, 1.2 + F, -90], [0, 1.2 + F, -92], 2),
    ...line([-2.6, 4.8, -95], [-2.6, 6.2, -95], 2),
  ],
  hearts: [],
  enemies: [
    { t: "plant", p: [3, 0.6, -55], range: 9, fire: true, shot: 8 },
    { t: "crab", a: [-2.6, 1.2, -81], b: [2.6, 1.2, -81], speed: 2 },
    { t: "plant", p: [-3, 1.2, -91.5], range: 9, fire: true, shot: 8 },
  ],
  hazards: [
    ...jets(-18, [-2.4, 0, 2.4], 0),
    ...jets(-24, [-2.4, 0, 2.4], 0.5),
    { t: "slider", size: [1, 1, 2.4], path: [[-3.6, 0.6, -51], [3.6, 0.6, -51]], period: 4.2, hold: 0.16 },
    ...jets(-87, [-2.4, 0, 2.4], 0.25, 1.2),
  ],
  checkpoints: [
    [0, 0.6, -45],
    [1, 0.6, -71],
  ],
  portal: [0, 1.2, -94],
  hints: [
    { z0: -12, z1: -16.5, text: "Fire jets glow before they blast — wait, then dash!" },
    { z0: -29, z1: -31.5, text: "Crumbling rocks fall right after you land — keep hopping!" },
  ],
};

/* ----------------------------------------------------------------------- 5 */
const moon = {
  id: 5,
  key: "moon",
  name: "Moonlit Forest",
  blurb: "Spiky thornbacks and tricky platforms at night.",
  theme: "moon",
  spawn: [0, 0, 3],
  killY: -3,
  liquid: "night",
  liquidY: -2.6,
  par: 110,
  solids: [
    run(0, 6, -12, 7, 0, "moss"),
    run(0, -12, -26, 6, 0, "moss"),
    run(0, -26, -38, 1.6, 0, "wood", 0.6), // fallen log bridge
    box(4.6, -32, 2.2, 2.2, 0.4, 6, "moss"), // little island for the spitter
    run(0, -38, -48, 7, 0, "moss"),
    run(0, -62, -68, 6, 0, "moss"),
    run(0, -71.2, -86, 7, 3.5, "moss", 7),
    run(0, -97.5, -114, 8, 2.6, "moss", 7),
  ],
  movers: [
    { size: [3, 0.5, 3], path: [[0, 0, -49.6], [0, 0, -60.4]], period: 7, hold: 0.2, m: "wood" },
    { size: [3, 0.5, 3], path: [[0, 0, -69.6], [0, 3.5, -69.6]], period: 6, hold: 0.25, m: "wood" },
  ],
  fallers: [
    { b: [-1.2, 2.5, -89.2, 1.2, 3.5, -86.8], m: "crack", delay: 0.5, respawn: 3 },
    { b: [-0.6, 2.2, -92.7, 1.8, 3.2, -90.3], m: "crack", delay: 0.5, respawn: 3 },
    { b: [-1.4, 1.9, -96.2, 1.0, 2.9, -93.8], m: "crack", delay: 0.5, respawn: 3 },
  ],
  crates: [
    { p: [-1.8, 0, -6] },
    { p: [1.8, 0, -6] },
    { p: [-2.4, 0, -14] },
    { p: [2.6, 0, -42] },
    { p: [2.6, 1, -42] },
    { p: [-2.6, 0, -45], t: "h" },
    { p: [-2, 0, -65] },
    { p: [2.6, 3.5, -80] },
    { p: [-2.6, 3.5, -80] },
    { p: [-3, 2.6, -101] },
    { p: [3, 2.6, -101] },
    { p: [3, 3.6, -101] },
    { p: [-2.8, 2.6, -108], t: "b" },
  ],
  fruits: [
    ...line([0, F, -1], [0, F, -10], 4),
    ...line([0, F, -13], [0, F, -16], 2),
    ...line([0, F, -27], [0, F, -37], 6),
    ...line([0, F, -40], [0, F, -47], 4),
    ...line([0, F + 0.3, -52], [0, F + 0.3, -58], 4),
    ...line([0, F, -63], [0, F, -67], 3),
    ...line([0, 3.5 + F, -73], [0, 3.5 + F, -85], 6),
    [0, 3.5 + F, -88],
    [0.6, 3.2 + F, -91.5],
    [-0.2, 2.9 + F, -95],
    ...line([0, 2.6 + F, -99], [0, 2.6 + F, -106], 4),
    ...line([-2.8, 6.2, -108], [-2.8, 7.6, -108], 2),
  ],
  hearts: [],
  enemies: [
    { t: "thorn", a: [-2.2, 0, -19], b: [2.2, 0, -19], speed: 2.4 },
    { t: "plant", p: [4.6, 0.4, -32], range: 8, shot: 8, windup: 0.7 },
    { t: "thorn", a: [-2.6, 3.5, -76.5], b: [2.6, 3.5, -76.5], speed: 2.8 },
    { t: "plant", p: [2.9, 3.5, -84.5], range: 9, shot: 9, windup: 0.65, cool: 1.3 },
    { t: "thorn", a: [-3, 2.6, -103.5], b: [3, 2.6, -103.5], speed: 3 },
  ],
  hazards: [],
  checkpoints: [
    [0, 0, -40],
    [-1, 3.5, -73],
  ],
  portal: [0, 2.6, -110.5],
  hints: [
    { z0: -12, z1: -16, text: "Thornbacks are spiky — never jump on them. Spin them twice!" },
    { z0: -86, z1: -87.5, text: "Crumbling stones — don't stop!" },
  ],
};

/* ----------------------------------------------------------------------- 6 */
const fortress = {
  id: 6,
  key: "fortress",
  name: "Jungle Fortress",
  blurb: "Storm the fortress and face Mossjaw, the Jungle Guardian.",
  theme: "fortress",
  spawn: [0, 0, 3],
  killY: -3,
  liquid: "swamp",
  liquidY: -2.6,
  par: 150,
  solids: [
    run(0, 6, -10, 7, 0, "fort"),
    run(0, -10, -30, 6, 0, "fort"),
    run(0, -42, -54, 6, 0, "fort"),
    run(0, -54, -62, 7, 0, "fort"),
    run(0, -62, -66, 3, 0, "wood", 0.5), // drawbridge
    // the arena: walls left, right and back; low parapets either side of the gate
    { b: [-11, -6, -88, 11, 0, -66], m: "fort" },
    { b: [-12, 0, -89, -11, 2.4, -65.5], m: "fort" },
    { b: [11, 0, -89, 12, 2.4, -65.5], m: "fort" },
    { b: [-12, 0, -89, 12, 2.4, -88], m: "fort" },
    { b: [-11, 0, -66, -1.6, 0.8, -65.5], m: "fort" },
    { b: [1.6, 0, -66, 11, 0.8, -65.5], m: "fort" },
  ],
  movers: [{ size: [3, 0.5, 3], path: [[0, 0, -31.6], [0, 0, -40.4]], period: 6.5, hold: 0.2, m: "wood" }],
  crates: [
    { p: [-1.8, 0, -4] },
    { p: [1.8, 0, -4] },
    { p: [-2.4, 0, -27] },
    { p: [2.4, 0, -27] },
    { p: [-2.4, 0, -43.5] },
    { p: [2.6, 0, -56] },
    { p: [-2.6, 0, -58], t: "h" },
    { p: [2.6, 1, -56] },
  ],
  fruits: [
    ...line([0, F, -1], [0, F, -8], 4),
    ...line([0, F, -11], [0, F, -13], 2),
    ...line([0, F, -17.5], [0, F, -18.5], 2),
    ...line([0, F, -23.5], [0, F, -25], 2),
    ...line([0, F + 0.3, -33], [0, F + 0.3, -39], 4),
    ...line([0, F, -43], [0, F, -44], 2),
    ...line([0, F, -48], [0, F, -49], 2),
    ...line([0, F, -55], [0, F, -61], 4),
    ...line([-6, F, -70], [6, F, -70], 7),
  ],
  hearts: [
    [-9, 1.0, -86],
    [9, 1.0, -86],
  ],
  enemies: [
    { t: "crab", a: [-2.4, 0, -22], b: [2.4, 0, -22], speed: 2.2 },
    { t: "plant", p: [2.5, 0, -52.5], range: 8 },
    { t: "thorn", a: [-2.5, 0, -50], b: [2.5, 0, -50], speed: 2.4 },
  ],
  hazards: [
    { t: "crusher", b: [-3, 4, -16, 3, 5.6, -14], drop: 4, period: 2.8, phase: 0 },
    { t: "crusher", b: [-3, 4, -21, 3, 5.6, -19], drop: 4, period: 2.8, phase: 0.5 },
    { t: "tspikes", b: [-3, 0, -47, 3, 0.6, -45], period: 2.4, on: 0.4, phase: 0 },
  ],
  checkpoints: [[0, 0, -57.5]],
  portal: [0, 0, -84],
  boss: { p: [0, 0, -79], arena: [-11, -88, 11, -66] },
  camZones: [{ z0: -63, z1: -100, dist: 10.5, height: 7, look: 1.5 }],
  hints: [{ z0: -60, z1: -64, text: "Mossjaw is only hurt while it's tired or dizzy — dodge, then SPIN!" }],
};

export const LEVELS = [sunny, river, temple, volcano, moon, fortress];

/** menu / select metadata (also used before a level is built) */
export const LEVEL_INFO = [
  { id: 1, name: "Sunny Jungle", blurb: "Learn to run, jump and spin through the crates.", color: "#5cc94a" },
  { id: 2, name: "River Crossing", blurb: "Rope bridges and drifting rafts over the rapids.", color: "#3bb3d9" },
  { id: 3, name: "Ancient Temple", blurb: "Spike traps, crushers and secret rooms.", color: "#c9a25a" },
  { id: 4, name: "Volcano Trail", blurb: "Lava, fire jets and crumbling rock.", color: "#e8622c" },
  { id: 5, name: "Moonlit Forest", blurb: "Spiky thornbacks and tricky platforms at night.", color: "#7b74e0" },
  { id: 6, name: "Jungle Fortress", blurb: "Storm the fortress and face Mossjaw, the Jungle Guardian.", color: "#a8603c" },
];
export { run, box, line, arc };
