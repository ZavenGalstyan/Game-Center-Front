/**
 * Snowfall Station — an arctic research facility under the mountains.
 * Centre: the long corridor block with three halls (B is indoors in the
 * middle hall). North: radar dome, fuel tanks and pipe racks. South: an
 * open vehicle bay with snowcats. West: helipad and storage huts
 * (Vanguard spawn, A). East: generator house and comms mast (Obsidian, C).
 */
import { createBuilder, hash2 } from "./build.js";

export function buildSnow() {
  const B = createBuilder({ id: "snow", name: "Snowfall Station", bounds: { minX: -50, maxX: 50, minZ: -36, maxZ: 36 } });
  const { box, room, stairs, ladder, container, crate, barrier, vehicle, barrel, tree, rock, fence, wall, tank, htank, patch, spawn, flag, poi, prop } = B;

  /* ---- ground ---- */
  patch(-50, -2, -19, 2, "snowPacked");
  patch(19, -2, 50, 2, "snowPacked");
  patch(-21, -11, 21, 11, "concreteYard", { c: "#cdd6de" });
  patch(-8, 11, 8, 36, "snowPacked");
  patch(-8, -36, 8, -11, "snowPacked");
  patch(-44, -14, -24, 14, "concreteYard", { c: "#c5ced6" });
  patch(24, -16, 46, 14, "concreteYard", { c: "#c5ced6" });
  patch(-12, 13, 14, 28, "concreteFloor", { c: "#bcc5cc" });
  prop("mountains", { tint: "#8796a6", dist: 360, height: 95, seed: 11, snow: true });
  prop("helipad", { x: -36, z: -6, r: 6 });

  /* ---- corridor block: three halls ---- */
  const L = 36;
  const D = 8.5;
  room(0, 0, L, D, 3.8, {
    m: "corrugatedWall",
    s: "station",
    c: "#c9d2d9",
    open: [
      { side: "w", at: 0, w: 1.8 },
      { side: "e", at: 0, w: 1.8 },
      { side: "n", at: -12, w: 1.6 },
      { side: "n", at: 0, w: 2.2 },
      { side: "n", at: 12, w: 1.6 },
      { side: "s", at: -12, w: 1.6 },
      { side: "s", at: 3, w: 2.2 },
      { side: "s", at: 12, w: 1.6 },
      { side: "n", at: -6.5, w: 2.2, kind: "window", y0: 1.2, y1: 2.4 },
      { side: "n", at: 6.5, w: 2.2, kind: "window", y0: 1.2, y1: 2.4 },
      { side: "s", at: -5.5, w: 2.2, kind: "window", y0: 1.2, y1: 2.4 },
      { side: "s", at: 7.5, w: 2.2, kind: "window", y0: 1.2, y1: 2.4 },
    ],
    roofM: "metalRoof",
    floor: "tileDark",
  });
  // internal partitions with doorways (x = ±6)
  for (const x of [-6, 6]) {
    wall(x, -3.95, x, -1, 3.8, 0.3, "plasterWhite");
    wall(x, 1, x, 3.95, 3.8, 0.3, "plasterWhite");
    box(x, 0, 0.3, 2, 1.2, "wall", "plasterWhite", { y: 2.6 });
  }
  // lab benches / server racks
  box(-12, -2.2, 4, 0.9, 0.95, "desk", "steel");
  box(-12, 2.4, 3, 0.9, 1.9, "rack", "rackMetal");
  box(12, -2.3, 3, 0.9, 1.9, "rack", "rackMetal");
  box(13, 2.2, 3.5, 0.9, 0.95, "desk", "steel");
  box(-2.5, 2.2, 1.2, 1.2, 1.1, "crate", "crateMetal", { s: "metal" });
  box(2.5, -2.4, 2.2, 0.9, 0.95, "desk", "steel");

  /* ---- north: radar + tanks + pipes ---- */
  box(-6, -21, 7, 7, 3, "block", "concreteDark");
  stairs(-6, -16.4, "n", 2, 7, 0.43, 0.42, "metalGrate");
  prop("radome", { x: -6, z: -22.2, y: 3, r: 2.6 });
  box(-6, -22.6, 3, 3, 2.4, "block", "none", { hidden: true, y: 3 });
  tank(10, -21, 3, 6.5, "#d9dde0");
  tank(17, -24.5, 2.4, 5.5, "#c9ced2");
  htank(-20, -20, 7, 1.2, 0, "#b9c3cb");
  box(4, -14.5, 10, 0.6, 2.2, "pipeRack", "steel", { shoot: true });
  prop("pipes", { x0: -1, x1: 9, z: -14.5, y: 2.3 });
  container(-24, -13.5, 0, "#a6402e");
  container(24, -27, 1, "#2e6f9e");
  crate(-14.5, -16, 1.2);
  crate(-13.3, -16, 1.2);
  barrier(0, -12.8, 3, 0);
  rock(3, -27, 4, 3, 1.8, { m: "snowPacked" });
  rock(-15, -27.5, 3.5, 2.6, 1.5, { m: "snowPacked" });

  /* ---- south: vehicle bay ---- */
  for (const x of [-11, -3, 5, 13]) for (const z of [14, 27]) box(x, z, 0.4, 0.4, 5, "post", "steel");
  box(1, 20.5, 25, 14, 0.3, "roof", "metalRoof", { y: 5, s: "shed" });
  vehicle(-6, 20.5, 1, "snowcat", "#d8492c");
  vehicle(8.5, 19, 1, "snowcat", "#e0a12a");
  container(1, 31.5, 0, "#4c6f73");
  crate(-10, 25.5, 1.2);
  crate(-10, 24.2, 1.2);
  barrel(12.5, 25.5, "#2f5f8a");
  barrel(11.9, 24.9, "#b33b2a");
  box(2, 15, 2.6, 1.2, 1.1, "generator", "paintedMetal", { c: "#8a3b2e" });
  rock(-22, 24, 5, 3.5, 2.2, { m: "snowPacked" });
  rock(24, 25, 5, 3.5, 2.0, { m: "snowPacked" });
  barrier(-16, 14, 3, 1);
  barrier(17, 15, 3, 1);

  /* ---- west: helipad + huts ---- */
  room(-40, 9, 7, 5, 3, {
    m: "corrugatedWall",
    s: "station",
    c: "#b8c4cc",
    open: [
      { side: "n", at: 1.5, w: 1.5 },
      { side: "e", at: 0, w: 1.2, kind: "window" },
    ],
    roofM: "metalRoof",
    floor: "concreteFloor",
  });
  room(-29, 12, 6, 5, 3, {
    m: "corrugatedWall",
    s: "station",
    c: "#c9b28a",
    open: [
      { side: "w", at: 0, w: 1.5 },
      { side: "n", at: 1, w: 1.4, kind: "window" },
    ],
    roofM: "metalRoof",
    floor: "concreteFloor",
  });
  container(-30, -12.5, 0, "#c9822b");
  crate(-26, -6, 1.2);
  crate(-26, -4.7, 1.2);
  barrel(-43, -12, "#b33b2a");
  barrel(-42.4, -12.6, "#b33b2a");
  barrier(-24, 4, 3, 1);
  vehicle(-44, 18, 1, "snowcat", "#5f6b75");
  prop("windsock", { x: -43, z: -12.8 });

  /* ---- east: generator house + comms ---- */
  room(37, -9, 10, 7, 3.6, {
    m: "brickDark",
    open: [
      { side: "w", at: 1, w: 1.6 },
      { side: "s", at: -2, w: 1.6 },
      { side: "n", at: 2, w: 2, kind: "window" },
    ],
    roofM: "metalRoof",
    floor: "concreteFloor",
  });
  box(38.5, -10, 3.5, 1.6, 1.8, "generator", "paintedMetal", { c: "#5a6b3a" });
  box(34, -7, 1, 1, 1.4, "crate", "crateMetal", { s: "metal" });
  box(42, 8, 3, 3, 0.4, "block", "concreteDark");
  prop("mast", { x: 42, z: 8, h: 22 });
  prop("dish", { x: 30.5, z: 10.5, r: 2.2 });
  box(30.5, 10.5, 2, 2, 1.5, "block", "concreteDark");
  container(27, -13.5, 0, "#3f7a4b");
  crate(33, 4.5, 1.2);
  crate(34.3, 4.5, 1.2);
  barrier(26, -3, 3, 1);
  htank(44, -2, 5.5, 1.1, 1, "#d9dde0");
  vehicle(32, 15, 0, "pickup", "#3c4954");

  /* ---- outskirts: snowbanks, pines, boundary ---- */
  for (const [x, z, w, d, h] of [
    [-16, 7.5, 3, 1.6, 1.1],
    [16, -7.5, 3, 1.6, 1.1],
    [-24, -26, 4, 2.5, 1.4],
    [22, 30, 4, 2.4, 1.3],
    [-34, 26, 3, 2.2, 1.2],
    [38, -26, 3.5, 2.2, 1.3],
    [-12, 33, 4, 2, 1.2],
    [14, -32, 4, 2, 1.2],
  ])
    rock(x, z, w, d, h, { m: "snowPacked" });
  for (const [x, z] of [
    [-46, -30],
    [-40, -32],
    [-47, 31],
    [-38, 32],
    [46, 30],
    [40, 33],
    [46, -31],
    [30, -33],
    [-30, -32],
    [-20, 33],
  ])
    tree(x, z, 1 + hash2(x, z) * 0.3, "pine");
  for (let x = -48; x <= 48; x += 6) {
    rock(x, -37.5, 6.5, 3.2, 3 + hash2(x, 1) * 3, { m: "rock" });
    rock(x + 3, 37.5, 6.5, 3.2, 3 + hash2(x, 2) * 3, { m: "rock" });
  }
  for (let z = -30; z <= 30; z += 8) {
    rock(-52, z, 4, 8, 4 + hash2(z, 3) * 3, { m: "rock" });
    rock(52, z, 4, 8, 4 + hash2(z, 4) * 3, { m: "rock" });
  }
  fence(-50, -18, -34, -18, 2.3);
  fence(34, 22, 50, 22, 2.3);
  for (const [x, z] of [
    [-19, -5],
    [19, 5],
    [-8, 12],
    [8, -12],
  ])
    prop("lamp", { x, z, h: 7, color: "#ffc98a", dir: x > 0 ? -1 : 1 });
  void ladder;

  /* ---- logic ---- */
  for (const [x, z] of [
    [-47, -6],
    [-47, 0],
    [-47, 6],
    [-44, 13],
    [-44, -14],
    [-35, 20],
    [-36, -22],
    [-41, 2],
    [-47, -24],
    [-47, 24],
  ])
    spawn(0, x, z, -Math.PI / 2);
  for (const [x, z] of [
    [47, -6],
    [47, 0],
    [47, 6],
    [44, 15],
    [44, -15],
    [37, 21],
    [37, -21],
    [41, 2],
    [47, -24],
    [47, 24],
  ])
    spawn(1, x, z, Math.PI / 2);
  flag("A", -32, 2.5);
  flag("B", 0, 0);
  flag("C", 32, -1.5);
  for (const [x, z, w] of [
    [-32, 2.5, 2],
    [0, 0, 3],
    [32, -1.5, 2],
    [-12, 0, 1.5],
    [12, 0, 1.5],
    [-6, -17, 1],
    [1, 20, 1.5],
    [37, -9, 1],
    [-40, 9, 1],
    [14, -20, 1],
  ])
    poi(x, z, w);

  return B.finish({ theme: "snow", shots: [{ a: [-46, 3, 3], b: [-36, 3.3, 1], t: [0, 2, 0] }, { a: [-14, 1.8, -1.5], b: [-3, 1.8, -1], t: [10, 1.8, 0] }, { a: [24, 5, 30], b: [10, 5.5, 30], t: [0, 2, 10] }, { a: [30, 14, -30], b: [-20, 15, -30], t: [0, 0, 0] }] });
}
