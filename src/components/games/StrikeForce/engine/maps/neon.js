/**
 * Neon District — rain-slick downtown at night.
 * A wide avenue runs west→east (A, B, C along it) crossed by two side
 * streets. North: a plaza, a convenience store and a back alley, a fenced
 * construction site. South: a parking garage, an arcade and a pocket park,
 * a row of shops. Neon signage, parked traffic and a stalled bus give cover.
 */
import { createBuilder, hash2 } from "./build.js";

export function buildNeon() {
  const B = createBuilder({ id: "neon", name: "Neon District", bounds: { minX: -46, maxX: 46, minZ: -32, maxZ: 32 } });
  const { box, room, facade, stairs, container, crate, barrier, vehicle, barrel, tree, fence, patch, spawn, flag, poi, prop } = B;

  /* ---- streets ---- */
  patch(-46, -5, 46, 5, "wetAsphalt", { lines: "x" });
  patch(-26, -32, -18, 32, "wetAsphalt", { lines: "z" });
  patch(16, -32, 24, 32, "wetAsphalt", { lines: "z" });
  for (const [x0, z0, x1, z1] of [
    [-46, -8, 46, -5],
    [-46, 5, 46, 8],
    [-29, -32, -26, 32],
    [-18, -32, -15, 32],
    [13, -32, 16, 32],
    [24, -32, 27, 32],
  ])
    patch(x0, z0, x1, z1, "sidewalk");
  // curbs (walkable step)
  for (const z of [-5.12, 5.12]) box(0, z, 92, 0.24, 0.14, "curb", "concreteDark");
  prop("crosswalk", { x: -22, z: 0, w: 8, d: 10, along: "x" });
  prop("crosswalk", { x: 20, z: 0, w: 8, d: 10, along: "x" });
  prop("skyline", { seed: 2 });

  /* ---- boundary towers ---- */
  const styles = ["office", "apartment", "office", "tower"];
  let k = 0;
  for (const [x0, x1] of [
    [-46, -29],
    [-15, -1.5],
    [1.5, 13],
    [27, 46],
  ]) {
    facade((x0 + x1) / 2, -35, x1 - x0, 6, 14 + hash2(x0, 1) * 16, styles[k++ % 4], { c: ["#8d8f95", "#7d6e66", "#6e7b86", "#8a8478"][k % 4] });
    facade((x0 + x1) / 2, 35, x1 - x0, 6, 13 + hash2(x0, 2) * 18, styles[k++ % 4], { c: ["#6e7b86", "#8d8f95", "#7d6e66", "#857e74"][k % 4] });
  }
  for (const [z0, z1] of [
    [-32, -8],
    [8, 32],
  ]) {
    facade(-49, (z0 + z1) / 2, 6, z1 - z0, 18 + hash2(z0, 3) * 10, "office", { c: "#76808a" });
    facade(49, (z0 + z1) / 2, 6, z1 - z0, 16 + hash2(z0, 4) * 12, "apartment", { c: "#827468" });
  }
  // avenue ends (closed by barricades + buildings beyond)
  facade(-49, 0, 6, 16, 12, "office", { c: "#5f6a74" });
  facade(49, 0, 6, 16, 12, "office", { c: "#6a5f58" });

  /* ---- north-west: plaza ---- */
  box(-37, -18, 4, 4, 0.5, "planter", "concrete");
  tree(-37, -18, 0.85, "oak");
  box(-32, -24, 4, 4, 0.5, "planter", "concrete");
  tree(-32, -24, 0.8, "oak");
  room(-39, -27, 8, 5, 3.4, {
    m: "brickDark",
    open: [
      { side: "s", at: 1.5, w: 1.6 },
      { side: "s", at: -1.6, w: 2.4, kind: "window", y0: 0.8, y1: 2.5 },
      { side: "e", at: 0, w: 1.4, kind: "window" },
    ],
    glass: true,
    floor: "tileDark",
  });
  prop("neon", { x: -39, z: -24.35, y: 3.0, w: 5, text: "NOODLE BAR", color: "#ff3fa8", face: "s" });
  box(-33, -13, 3, 0.8, 0.9, "bench", "woodDark");
  box(-41, -12, 0.8, 3, 0.9, "bench", "woodDark");
  prop("kiosk", { x: -29.5, z: -15, c: "#22c7ff" });
  box(-29.5, -15, 2.2, 2.2, 2.6, "kiosk", "none", { hidden: true });

  /* ---- north-centre: store + alley ---- */
  room(-9, -13, 11, 8, 3.6, {
    m: "plasterWhite",
    open: [
      { side: "s", at: -3.4, w: 1.8 },
      { side: "s", at: 1.5, w: 5.5, kind: "window", y0: 0.6, y1: 2.8 },
      { side: "n", at: 3.5, w: 1.4 },
      { side: "e", at: -1.5, w: 1.4, kind: "window" },
    ],
    glass: true,
    floor: "tile",
  });
  box(-11, -14, 5, 0.8, 1.5, "rack", "rackMetal");
  box(-11, -11.6, 5, 0.8, 1.5, "rack", "rackMetal");
  box(-5.8, -15.5, 1.4, 2.4, 1.05, "desk", "wood");
  prop("neon", { x: -7.5, z: -8.85, y: 3.1, w: 6, text: "24/7 MART", color: "#3fffb2", face: "s" });
  facade(-9, -23, 11, 6, 9, "apartment", { c: "#6e6560" });
  // alley between the store block and the next
  box(-1.8, -16, 1.2, 2, 1.4, "dumpster", "paintedMetal", { c: "#2f5a3a" });
  box(1.5, -21, 1.2, 2, 1.4, "dumpster", "paintedMetal", { c: "#3a4a6a" });
  crate(-2, -25, 1);
  barrel(1.8, -12, "#444b52");
  facade(7.5, -15, 11, 12, 12, "office", { c: "#6e7b86" });
  prop("neon", { x: 7.5, z: -8.9, y: 4.0, w: 7.5, text: "VOLT", color: "#3fe9ff", face: "s", big: true });
  facade(7.5, -26, 11, 6, 15, "tower", { c: "#7a7068" });
  prop("acUnits", { x: 1.8, z: -15, face: "w", n: 3 });

  /* ---- north-east: construction site ---- */
  fence(27.5, -9, 34, -9, 2.4);
  fence(38, -9, 46, -9, 2.4);
  fence(27.5, -29, 27.5, -9, 2.4);
  container(32, -14, 0, "#c9822b");
  container(41, -20, 1, "#2e6f9e");
  container(41, -20, 1, "#a6402e", 1);
  stairs(37.6, -24, "n", 1.4, 6, 0.42, 0.42, "metalGrate");
  box(35, -27.5, 6, 3, 2.52, "scaffold", "metalGrate");
  barrier(32, -20, 3, 0);
  barrier(36, -12.5, 3, 1);
  box(31, -25, 2.4, 1.2, 0.5, "pallet", "wood");
  crate(31, -25, 1, { y: 0.5 });
  prop("towerCrane", { x: 44, z: -30, h: 36 });
  prop("cones", { x: 30, z: -10.5, n: 4, along: "x" });

  /* ---- south-west: parking garage ---- */
  room(-36.5, 18.5, 17, 15, 3.4, {
    m: "concreteDark",
    open: [
      { side: "n", at: -2, w: 9, h: 3.0 },
      { side: "e", at: 2, w: 6, h: 3.0 },
      { side: "s", at: 4, w: 2 },
      { side: "w", at: -3, w: 4, kind: "window", y0: 1.0, y1: 2.6 },
    ],
    floor: "concreteFloor",
    roofM: "concrete",
  });
  for (const [x, z] of [
    [-40, 15],
    [-33, 15],
    [-40, 22],
    [-33, 22],
  ])
    box(x, z, 0.6, 0.6, 3.4, "pillar", "concrete");
  vehicle(-36.5, 13.5, 0, "suv", "#2b3138");
  vehicle(-41.5, 18.5, 1, "car", "#7a1f24");
  vehicle(-31, 23.3, 1, "car", "#c9c7c0");
  prop("neon", { x: -36.5, z: 10.85, y: 2.95, w: 6, text: "PARKING", color: "#4f8bff", face: "n" });

  /* ---- south-centre: arcade + park ---- */
  room(-8, 16, 12, 9, 3.8, {
    m: "brick",
    open: [
      { side: "n", at: -3.5, w: 2 },
      { side: "n", at: 2.2, w: 4.6, kind: "window", y0: 0.6, y1: 2.8 },
      { side: "e", at: 2, w: 1.5 },
    ],
    glass: true,
    floor: "tileDark",
  });
  for (const x of [-12, -9.6, -7.2]) box(x, 18.5, 1.0, 0.9, 1.8, "arcade", "darkMetal", { c: "#1d1f2a" });
  prop("arcadeScreens", { xs: [-12, -9.6, -7.2], z: 18.04, y: 1.3 });
  prop("neon", { x: -8, z: 11.4, y: 3.4, w: 7, text: "ARCADE", color: "#ff3fa8", face: "n", big: true });
  facade(-8, 25.75, 12, 9.5, 11, "apartment", { c: "#8a7f74" });
  // pocket park
  patch(2, 10, 12, 24, "grass");
  tree(4, 13, 0.9, "oak");
  tree(10, 20.5, 0.95, "oak");
  tree(4.5, 22, 0.8, "oak");
  box(7, 16.5, 2.6, 2.6, 0.7, "fountain", "concrete");
  prop("fountain", { x: 7, z: 16.5 });
  box(10.5, 13, 0.8, 2.6, 0.9, "bench", "woodDark");
  box(3.5, 18, 0.8, 2.6, 0.9, "bench", "woodDark");
  fence(2, 24.5, 12, 24.5, 1.4, { s: "iron" });
  facade(7, 29.5, 12, 5, 13, "office", { c: "#5f6a74" });

  /* ---- south-east: shops ---- */
  room(32, 13, 9, 7, 3.6, {
    m: "plasterBlue",
    open: [
      { side: "n", at: -2.5, w: 1.6 },
      { side: "n", at: 1.6, w: 4, kind: "window", y0: 0.6, y1: 2.6 },
      { side: "w", at: 0.5, w: 1.4 },
    ],
    glass: true,
    floor: "tile",
  });
  prop("neon", { x: 32, z: 9.4, y: 3.2, w: 5.5, text: "PHARMACY", color: "#3fffb2", face: "n" });
  room(41.5, 13, 8, 7, 3.6, {
    m: "brickDark",
    open: [
      { side: "n", at: 1.5, w: 1.6 },
      { side: "n", at: -1.6, w: 2.6, kind: "window", y0: 0.6, y1: 2.6 },
      { side: "w", at: -1, w: 1.4 },
    ],
    glass: true,
    floor: "tileDark",
  });
  prop("neon", { x: 41.5, z: 9.4, y: 3.2, w: 5, text: "CYBER CAFE", color: "#ffb23f", face: "n" });
  facade(36.5, 24, 19, 9, 12, "apartment", { c: "#6e6560" });
  box(29, 18, 1.2, 2, 1.4, "dumpster", "paintedMetal", { c: "#2f5a3a" });

  /* ---- street cover ---- */
  vehicle(-38, -3.2, 0, "car", "#c03a2b");
  vehicle(-31, 3.4, 2, "van", "#d8d4c8");
  vehicle(-11, -3.0, 0, "car", "#1f2a3a");
  vehicle(-3, 2.6, 2, "bus", "#e2a12c");
  vehicle(9.5, -3.2, 0, "suv", "#4a4f55");
  vehicle(30.5, 3.3, 2, "car", "#3b6d8f");
  vehicle(39, -2.8, 0, "car", "#9b9b96");
  vehicle(20, -14, 1, "car", "#5a1f2a");
  vehicle(-22.5, 15, 3, "car", "#d6d1c4");
  vehicle(-21.5, -22, 1, "van", "#6a7a3a");
  barrier(-1, -5.9, 3, 0);
  barrier(-18, 0, 3, 1);
  barrier(13.5, 0.5, 3, 1);
  barrier(25.5, -1, 3, 1);
  barrier(-25, 1, 2.6, 1);
  box(-14.3, -6.6, 1.6, 1.0, 1.2, "busStop", "steel", { c: "#5b6168" });
  prop("busStop", { x: -14.3, z: -6.6 });
  for (const [x, z] of [
    [-18.6, -5.6],
    [15.6, 5.6],
    [-25.4, 5.6],
    [24.4, -5.6],
  ])
    prop("trafficLight", { x, z });
  for (let x = -40; x <= 40; x += 13) {
    prop("lamp", { x, z: -6.6, h: 6.5, dir: 1, color: hash2(x, 1) > 0.5 ? "#ffd2a0" : "#bfe4ff" });
    prop("lamp", { x: x + 6.5, z: 6.6, h: 6.5, dir: -1, color: "#ffd2a0" });
  }
  prop("billboard", { x: 0, z: -9.2, y: 13, w: 12, h: 4.5, text: "STRIKE ENERGY", color: "#3fe9ff" });
  prop("cables", { x0: -46, x1: 46, zs: [-7, 7], y: 8.5 });

  /* ---- logic ---- */
  for (const [x, z] of [
    [-44, -6],
    [-44, 0],
    [-44, 6],
    [-43.5, -12],
    [-41, 9.5],
    [-44, 3],
    [-40, -18],
    [-43.5, -3],
    [-28, 28],
    [-27.5, -28],
  ])
    spawn(0, x, z, -Math.PI / 2);
  for (const [x, z] of [
    [44, -6],
    [44, 0],
    [44, 6],
    [42, -11],
    [42.5, 8],
    [44, 3],
    [25.5, 27],
    [44, -3],
    [25.5, -27],
    [39, 6.5],
  ])
    spawn(1, x, z, Math.PI / 2);
  flag("A", -31, -1);
  flag("B", 2, -6.5);
  flag("C", 31, -1);
  for (const [x, z, w] of [
    [-31, -1, 2],
    [2, -6.5, 3],
    [31, -1, 2],
    [-9, -13, 1.5],
    [-8, 16, 1.5],
    [7, 16, 1],
    [-36, 18, 1.5],
    [35, -18, 1.5],
    [0, -20, 1],
    [32, 13, 1],
  ])
    poi(x, z, w);

  return B.finish({ theme: "neon", shots: [{ a: [-42, 2.4, -1], b: [-30, 2.6, 0.5], t: [10, 3, 0] }, { a: [8, 1.8, 6.5], b: [-4, 2, 6.5], t: [-6, 3, -10] }, { a: [-20, 3, -26], b: [-23, 3.4, -14], t: [-22, 2, 10] }, { a: [40, 6, 0], b: [30, 6.5, -2], t: [-10, 2, 0] }] });
}
