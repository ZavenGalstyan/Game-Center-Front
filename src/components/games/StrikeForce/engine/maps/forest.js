/**
 * Forest Compound — a woodland research outpost.
 * West: log cabins and a campsite (Vanguard spawn, A). Centre: a concrete
 * walled compound around a bunker (B). East: an open-sided sawmill with
 * log piles and lumber stacks (Obsidian spawn, C). Trails link everything;
 * the rest is pine / birch forest with rocks and fallen trunks.
 */
import { createBuilder, hash2 } from "./build.js";

export function buildForest() {
  const B = createBuilder({ id: "forest", name: "Forest Compound", bounds: { minX: -50, maxX: 50, minZ: -40, maxZ: 40 } });
  const { box, room, watchtower, container, crate, barrier, sandbags, vehicle, barrel, tree, rock, wall, patch, spawn, flag, poi, prop } = B;

  /* ---- ground: trails + clearings ---- */
  patch(-50, -2.5, 50, 2.5, "dirtPath");
  patch(-2.5, -40, 2.5, 40, "dirtPath");
  patch(-44, -18, -24, 18, "dirt", { c: "#b3a184" });
  patch(24, -20, 46, 18, "gravel");
  patch(-15, -12, 15, 12, "concreteYard");
  patch(-30, 24, -14, 30, "dirtPath");
  patch(14, -30, 30, -24, "dirtPath");
  prop("mountains", { tint: "#55684f", dist: 360, height: 55, seed: 7 });

  /* ---- centre compound (concrete walls, four openings) ---- */
  const wh = 2.6;
  wall(-14, -11.5, -3, -11.5, wh, 0.45, "concrete");
  wall(3, -11.5, 14, -11.5, wh, 0.45, "concrete");
  wall(-14, 11.5, -3, 11.5, wh, 0.45, "concrete");
  wall(3, 11.5, 14, 11.5, wh, 0.45, "concrete");
  wall(-14.2, -11.5, -14.2, -3, wh, 0.45, "concrete");
  wall(-14.2, 3, -14.2, 11.5, wh, 0.45, "concrete");
  wall(14.2, -11.5, 14.2, -3, wh, 0.45, "concrete");
  wall(14.2, 3, 14.2, 11.5, wh, 0.45, "concrete");
  room(-5, -4, 8, 6, 3, {
    m: "concreteDark",
    open: [
      { side: "e", at: 0, w: 1.6 },
      { side: "s", at: -2, w: 1.6 },
      { side: "n", at: 1.5, w: 2.4, kind: "window", y0: 1.2, y1: 1.9 },
      { side: "w", at: 0, w: 1.6, kind: "window", y0: 1.2, y1: 1.9 },
    ],
    floor: "concreteFloor",
    roofM: "concrete",
  });
  box(-6.5, -5.5, 2.6, 0.9, 0.9, "desk", "steel");
  box(-3, -2.2, 1.2, 1.2, 1.8, "crate", "crateMetal", { s: "metal" });
  barrier(5, 6, 3, 0);
  barrier(9, -2, 3, 1);
  sandbags(3.5, -7, 3, 0);
  sandbags(-8, 7, 3, 0);
  box(9.5, 7.5, 2.2, 1.4, 1.6, "generator", "paintedMetal", { c: "#5a6b3a" });
  crate(-10.5, 8.5, 1.2);
  crate(-9.3, 8.5, 1.2);
  crate(-9.9, 8.5, 1, { y: 1.2 });
  barrel(11, -8.5, "#5b6b3a");
  barrel(11.6, -9.1, "#3b4b2a");
  container(7, -8.4, 0, "#4f5d3a");
  prop("antenna", { x: -10.5, z: -8.5, h: 14 });
  prop("lamp", { x: 12.5, z: 9.8, h: 6, dir: -1 });
  prop("lamp", { x: -12.5, z: -9.8, h: 6, dir: 1 });
  watchtower(0, -21, { face: "s", h: 4.6, m: "wood" });

  /* ---- west: cabins + campsite ---- */
  const cabin = { m: "logs", s: "cabin", roofM: "woodDark", floor: "wood" };
  room(-35, -10, 8, 6, 3, { ...cabin, open: [{ side: "e", at: 0.5, w: 1.4 }, { side: "s", at: -2, w: 1.4, kind: "window" }, { side: "n", at: 1.5, w: 1.4, kind: "window" }] });
  room(-38, 11, 7, 6, 3, { ...cabin, open: [{ side: "e", at: -0.5, w: 1.4 }, { side: "n", at: 0, w: 1.6, kind: "window" }, { side: "w", at: 1, w: 1.2, kind: "window" }] });
  room(-27, 15, 6, 5, 2.8, { ...cabin, open: [{ side: "n", at: 1, w: 1.4 }, { side: "w", at: 0, w: 1.2, kind: "window" }] });
  prop("campfire", { x: -31, z: 2 });
  box(-29.5, 4.2, 2.4, 0.5, 0.5, "logs", "logs");
  box(-32.8, 4.4, 2.2, 0.5, 0.5, "logs", "logs");
  box(-40.5, -2, 2.6, 1.8, 1.2, "woodpile", "logs");
  vehicle(-42, -22, 0, "pickup", "#5c6a4a");
  crate(-26.5, -7, 1.1);
  barrel(-26, -14, "#7a5a2e");

  /* ---- east: sawmill ---- */
  // open shed: posts + roof
  for (const x of [28, 34, 40])
    for (const z of [-14, -6]) box(x, z, 0.35, 0.35, 4.6, "post", "woodDark");
  box(34, -10, 13.5, 9.5, 0.3, "roof", "metalRoof", { y: 4.6, s: "shed" });
  box(34, -10, 10, 1.4, 1.0, "sawbench", "steel");
  box(31.5, -13, 4, 1.2, 1.2, "logs", "logs");
  box(36.5, -7, 4, 1.2, 1.2, "logs", "logs");
  // log piles + lumber stacks
  box(43, 4, 2.6, 6, 1.8, "logpile", "logs");
  box(28, 7, 6, 2.6, 1.7, "logpile", "logs");
  box(36, 13, 3, 2, 1.5, "lumber", "wood");
  box(41.5, 13, 3, 2, 1.1, "lumber", "wood");
  box(31, 15.5, 3, 2, 1.3, "lumber", "wood");
  vehicle(38, 3.5, 1, "forklift", "#d8a428");
  vehicle(44, -26, 1, "truck", "#4a5a3a");
  room(39, -27, 7, 5, 2.8, { ...cabin, open: [{ side: "w", at: 0, w: 1.4 }, { side: "n", at: 1, w: 1.3, kind: "window" }] });
  prop("lamp", { x: 26, z: -2.5, h: 6, dir: 1 });

  /* ---- forest ---- */
  const clear = [
    [-46, -20, -22, 20],
    [22, -22, 48, 20],
    [-16, -13, 16, 13],
    [-50, -3.2, 50, 3.2],
    [-3.2, -40, 3.2, 40],
    [-4, -25, 4, -17],
    [-30, 23, -14, 31],
    [14, -31, 30, -23],
  ];
  const free = (x, z, pad = 1.2) => !clear.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
  let n = 0;
  for (let gx = -48; gx <= 48; gx += 4.2)
    for (let gz = -38; gz <= 38; gz += 4.2) {
      const x = gx + (hash2(gx, gz) - 0.5) * 3.2;
      const z = gz + (hash2(gz, gx) - 0.5) * 3.2;
      if (!free(x, z)) continue;
      const r = hash2(x * 1.3, z * 0.7);
      if (r < 0.18) continue;
      const type = r < 0.62 ? "pine" : r < 0.8 ? "birch" : "oak";
      tree(x, z, 0.85 + hash2(z, x) * 0.45, type);
      n++;
      if (r > 0.94) rock(x + 1.6, z + 0.8, 1.6, 1.3, 0.9, { m: "rockMoss" });
    }
  // trees inside the clearings' edges for flavour
  for (const [x, z, s, t] of [
    [-24, -19, 1, "pine"],
    [-45, 19, 1.1, "pine"],
    [22, 19, 1, "birch"],
    [47, -21, 1.05, "pine"],
    [-18, 13, 0.9, "birch"],
    [17, -13, 0.95, "oak"],
  ])
    tree(x, z, s, t);
  // fallen trunks + rocks as cover along the trails
  for (const [x, z, w, d] of [
    [-18, 6.5, 4.5, 0.7],
    [18, -6.5, 4.5, 0.7],
    [-6, 20, 0.7, 4],
    [6, -30, 0.7, 4.5],
    [-20, -28, 4, 0.7],
    [20, 28, 4, 0.7],
  ])
    box(x, z, w, d, 0.65, "trunkLog", "logs");
  for (const [x, z, w, d, h] of [
    [-12, 22, 3, 2.2, 1.4],
    [12, -22, 3, 2.4, 1.5],
    [8, 26, 2.4, 2, 1.1],
    [-9, -30, 2.6, 2, 1.2],
    [21, 5.5, 2, 1.6, 1],
    [-21, -5.5, 2, 1.6, 1],
  ])
    rock(x, z, w, d, h, { m: "rockMoss" });
  // boundary: rock wall + tree line
  for (let x = -48; x <= 48; x += 6) {
    rock(x, -39.5, 6.5, 3, 3.5 + hash2(x, 3) * 2.5, { m: "rockMoss" });
    rock(x + 3, 39.5, 6.5, 3, 3.5 + hash2(x, 4) * 2.5, { m: "rockMoss" });
  }
  void n;

  /* ---- logic ---- */
  for (const [x, z] of [
    [-47, -6],
    [-47, 0],
    [-47, 6],
    [-44, 15],
    [-43, -15],
    [-30, 22],
    [-30, -20],
    [-40, 4],
    [-46, -12],
    [-45, 10],
  ])
    spawn(0, x, z, -Math.PI / 2);
  for (const [x, z] of [
    [47, -6],
    [47, 0],
    [47, 6],
    [45, 16],
    [45, -17],
    [30, 19],
    [30, -20],
    [41, -2],
    [46, -11],
    [46, 10],
  ])
    spawn(1, x, z, Math.PI / 2);
  flag("A", -31, -2.5);
  flag("B", 4.5, 2.5);
  flag("C", 33, -2);
  for (const [x, z, w] of [
    [-31, -2.5, 2],
    [4.5, 2.5, 3],
    [33, -2, 2],
    [-5, -4, 1.5],
    [0, -21, 1],
    [-20, 26, 1],
    [22, -27, 1],
    [-35, -10, 1],
    [39, -27, 1],
    [0, 26, 1],
  ])
    poi(x, z, w);

  return B.finish({ theme: "forest", shots: [{ a: [-46, 3, -1], b: [-36, 3.2, 0], t: [0, 2, 0] }, { a: [0, 2.2, 36], b: [0, 2.4, 24], t: [0, 2, -10] }, { a: [44, 5, -4], b: [36, 5.2, -12], t: [20, 1, 0] }, { a: [-14, 9, -30], b: [14, 10, -30], t: [0, 0, 0] }] });
}
