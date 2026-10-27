/**
 * Desert Outpost — sun-baked forward operating base.
 * West: adobe village ruins (Vanguard spawn, A). Centre: HESCO-walled
 * compound with the command post, barracks and two watchtowers (B).
 * East: motor pool and maintenance hangar (Obsidian spawn, C).
 * North: rocky ridge road. South: dry riverbed with wrecks.
 */
import { createBuilder, hash2 } from "./build.js";

export function buildDesert() {
  const B = createBuilder({ id: "desert", name: "Desert Outpost", bounds: { minX: -50, maxX: 50, minZ: -38, maxZ: 38 } });
  const { box, room, stairs, watchtower, container, crate, barrier, sandbags, hesco, vehicle, barrel, tree, rock, fence, wall, htank, patch, spawn, flag, poi, prop } = B;

  /* ---- ground ---- */
  patch(-21, -17, 21, 17, "gravel");
  patch(-50, -26, 50, -21, "dirtPath");
  patch(-48, -3, -21, 3, "dirtPath");
  patch(21, -3, 50, 3, "dirtPath");
  patch(-46, -24, -26, 24, "dirt", { c: "#d8c6a6" });
  patch(26, -26, 48, 22, "concreteYard");
  patch(-50, 22, 50, 38, "sandDark");
  prop("mountains", { tint: "#b8996f", dist: 360, height: 42, seed: 3 });

  /* ---- compound perimeter (HESCO) with four gates ---- */
  const H = 1.95;
  // north wall (gate at x 4..9)
  hesco(-12.3, -16.5, 16.4, 0, H);
  hesco(15, -16.5, 12, 0, H);
  // south wall (gate at x -9..-4)
  hesco(-15, 16.5, 12, 0, H);
  hesco(8.8, 16.5, 25.6, 0, H);
  // west wall (gate at z -2.5..2.5)
  hesco(-20.5, -9.5, 13, 1, H);
  hesco(-20.5, 9.5, 13, 1, H);
  // east wall (gate at z -2.5..2.5)
  hesco(20.5, -9.5, 13, 1, H);
  hesco(20.5, 9.5, 13, 1, H);
  // gate barriers + sandbag chicanes
  barrier(-24, -4.2, 2.6, 1);
  barrier(24, 4.2, 2.6, 1);
  sandbags(6.5, -19.5, 3.2, 0);
  sandbags(-6.5, 19.5, 3.2, 0);

  /* ---- command post + barracks ---- */
  room(-3, -5, 12, 9, 4, {
    m: "plasterSand",
    open: [
      { side: "w", at: 0, w: 1.6 },
      { side: "e", at: 1, w: 1.6 },
      { side: "n", at: -2.5, w: 1.6 },
      { side: "s", at: 2.5, w: 1.6 },
      { side: "s", at: -2.5, w: 2, kind: "window" },
      { side: "n", at: 3, w: 2, kind: "window" },
      { side: "w", at: 2.8, w: 1.2, kind: "window" },
      { side: "e", at: -2.4, w: 1.2, kind: "window" },
    ],
    floor: "tileDark",
  });
  box(-4, -6.5, 3, 1.2, 0.9, "desk", "wood");
  box(1.5, -2.5, 1.6, 0.8, 0.9, "desk", "wood");
  crate(-7.5, -1.8, 1);
  room(-12, 9.5, 10, 6, 3.4, {
    m: "plasterSand",
    open: [
      { side: "n", at: -2.5, w: 1.5 },
      { side: "e", at: 0, w: 1.5 },
      { side: "n", at: 2.2, w: 2, kind: "window" },
      { side: "s", at: -1, w: 3, kind: "window" },
    ],
    floor: "concreteFloor",
  });
  box(-15.5, 11, 2, 0.9, 0.6, "crate", "crateMetal", { s: "metal" });
  box(-12.5, 11, 2, 0.9, 0.6, "crate", "crateMetal", { s: "metal" });
  // tents (canvas over frames)
  box(10, -9.5, 6, 4, 2.6, "tent", "sandbag", { c: "#a89670" });
  box(11.5, 10, 4, 6, 2.6, "tent", "sandbag", { c: "#8f8a63" });
  // courtyard cover around B
  sandbags(7.5, 3.5, 3, 0);
  sandbags(4.5, 7.5, 3, 1);
  crate(13, 3, 1.2);
  crate(13, 4.3, 1.2);
  crate(13, 3.6, 1, { y: 1.2 });
  barrel(10.5, 8.5, "#5b6b3a");
  barrel(11.1, 8.0, "#5b6b3a");
  container(-12, -10.5, 0, "#7c6a4a");
  vehicle(2, 12, 0, "humvee", "#b79e74");
  watchtower(16.8, -12.8, { face: "w", h: 4.3, m: "wood" });
  watchtower(-16.8, 12.8, { face: "e", h: 4.3, m: "wood" });
  prop("flagpole", { x: -3, z: 2, h: 8 });
  prop("antenna", { x: 0.5, z: -8.5, h: 11 });
  prop("camoNet", { x: 10, z: -9.5, w: 7, d: 5, h: 2.8 });

  /* ---- west village ruins ---- */
  const adobe = { m: "plasterSand", floor: "dirt", roof: false, light: false };
  room(-38, -16, 8, 6, 3.2, { ...adobe, open: [{ side: "s", at: 1, w: 1.5 }, { side: "e", at: 0, w: 1.4 }, { side: "n", at: -1.5, w: 1.3, kind: "window" }] });
  room(-30, 13, 7, 6, 3, { ...adobe, open: [{ side: "n", at: -1, w: 1.5 }, { side: "w", at: 0.5, w: 1.4 }, { side: "e", at: 0, w: 1.4, kind: "window" }] });
  room(-42, 9, 6, 7, 3.4, { ...adobe, roof: true, open: [{ side: "e", at: 1, w: 1.5 }, { side: "n", at: 0, w: 1.4, kind: "window" }] });
  // broken walls + market stalls
  wall(-29, -10, -24, -10, 1.6, 0.45, "plasterSand");
  wall(-36, -4, -36, -1, 1.2, 0.45, "plasterSand");
  wall(-44, -6, -40, -6, 2.4, 0.45, "plasterSand");
  box(-29.5, -6, 3, 1.2, 1.0, "crate", "crateWood");
  prop("awning", { x: -29.5, z: -6, w: 3.6, d: 2.2, h: 2.3, c: "#a83b2e" });
  box(-33, 6.5, 3, 1.2, 1.0, "crate", "crateWood");
  prop("awning", { x: -33, z: 6.5, w: 3.6, d: 2.2, h: 2.3, c: "#2e5f8a" });
  barrel(-36.5, 3.5, "#8a5b2e");
  barrel(-37.1, 4.1, "#8a5b2e");
  vehicle(-44, -20, 1, "pickup", "#9c8a6a");
  tree(-40, -1, 1, "palm");
  tree(-27.5, 2.5, 1.05, "palm");
  tree(-45, 16, 0.95, "palm");
  tree(-33.5, -21, 1, "palm");
  prop("well", { x: -34, z: -2.5 });
  box(-34, -2.5, 1.6, 1.6, 0.9, "well", "concrete", { hidden: true });

  /* ---- east motor pool + hangar ---- */
  room(39, -16, 15, 10, 6, {
    m: "corrugatedWall",
    s: "warehouse",
    open: [
      { side: "w", at: 0, w: 6, h: 4.6 },
      { side: "s", at: -4, w: 1.6 },
      { side: "n", at: 0, w: 8, kind: "window", y0: 4.2, y1: 5.4 },
    ],
    roofM: "metalRoof",
    floor: "concreteFloor",
  });
  vehicle(40, -16, 0, "apc", "#8a7a56");
  crate(44, -12.5, 1.2);
  crate(44, -19.5, 1.2);
  box(35.5, -19.5, 3, 1, 1.2, "rack", "rackMetal");
  vehicle(30, -6.5, 0, "humvee", "#b79e74");
  vehicle(36, 8.5, 2, "truck", "#7d7a55");
  vehicle(29, 12.5, 1, "humvee", "#a8916a");
  htank(43, 4, 6, 1.1, 1, "#cbb68a");
  htank(46.5, 4, 6, 1.1, 1, "#cbb68a");
  sandbags(30, 1, 3, 1);
  barrier(36, -4, 3, 0);
  barrel(33, 15.5, "#2f5f8a");
  barrel(33.6, 16.1, "#b33b2a");
  container(42.5, 17, 1, "#7c6a4a");
  prop("camoNet", { x: 29.5, z: -6.5, w: 7, d: 5, h: 2.6 });
  prop("lamp", { x: 26.5, z: -9, h: 7 });
  prop("lamp", { x: 26.5, z: 9, h: 7 });

  /* ---- north ridge + south wadi ---- */
  for (let x = -48; x <= 48; x += 5.5) {
    const h = 2.5 + hash2(x, 1) * 3;
    rock(x + hash2(x, 2) * 2, -33.5 + hash2(x, 3) * 2, 4 + hash2(x, 4) * 3, 3 + hash2(x, 5) * 2, h, { m: "rockSand" });
  }
  rock(-8, -27.5, 2.5, 2, 1.2, { m: "rockSand" });
  rock(14, -28, 3, 2, 1.4, { m: "rockSand" });
  rock(-30, -28.5, 3, 2.4, 1.6, { m: "rockSand" });
  rock(30, -29, 2.8, 2, 1.3, { m: "rockSand" });
  vehicle(-16, -24, 0, "truck", "#8c7a5a");
  sandbags(4, -26, 3, 0);
  for (const [x, z, w, d, h] of [
    [-40, 28, 4, 3, 1.8],
    [-22, 31, 5, 3.5, 2.2],
    [-6, 26.5, 3, 2.5, 1.3],
    [12, 30, 4.5, 3, 2.0],
    [28, 27, 3.5, 3, 1.6],
    [42, 31, 5, 4, 2.4],
    [-30, 23.5, 2.2, 1.8, 1.0],
    [20, 24, 2.4, 2, 1.1],
  ])
    rock(x, z, w, d, h, { m: "rockSand" });
  vehicle(-12, 30, 1, "car", "#6b5a44", { wreck: true });
  vehicle(33, 33, 2, "pickup", "#5c4a3a", { wreck: true });
  for (let x = -48; x <= 48; x += 7) rock(x + hash2(x, 9) * 3, 36.5, 5, 2.5, 2.5 + hash2(x, 8) * 2, { m: "rockSand" });
  fence(-50, 21, -24, 21, 2.2, { s: "razor" });
  fence(24, 21, 50, 21, 2.2, { s: "razor" });

  /* ---- logic ---- */
  for (const [x, z] of [
    [-47, -8],
    [-47, -2],
    [-47, 4],
    [-46, 12],
    [-45, -14],
    [-41, 19],
    [-47, 20],
    [-43, 1],
    [-44, -24],
    [-39, -9],
  ])
    spawn(0, x, z, -Math.PI / 2);
  for (const [x, z] of [
    [47, -6],
    [47, 0],
    [47, 8],
    [45, 13],
    [46, -24],
    [37.5, 19],
    [47, -2],
    [43, -4],
    [40, 1],
    [46, 25],
  ])
    spawn(1, x, z, Math.PI / 2);
  flag("A", -34, -6);
  flag("B", 7.5, 5.5);
  flag("C", 34, 3);
  for (const [x, z, w] of [
    [-34, -6, 2],
    [7.5, 5.5, 3],
    [34, 3, 2],
    [-3, -5, 2],
    [-12, 9.5, 1],
    [0, -24, 1.5],
    [0, 26, 1.5],
    [-24, 0, 1],
    [24, 0, 1],
    [39, -16, 1.5],
    [-30, 13, 1],
  ])
    poi(x, z, w);

  return B.finish({ theme: "desert", shots: [{ a: [-44, 3, 4], b: [-36, 3.2, -2], t: [-10, 2, -4] }, { a: [-6, 2.2, 22], b: [6, 2.4, 24], t: [2, 1.5, 0] }, { a: [44, 5, -2], b: [38, 5.5, -10], t: [20, 1, 8] }, { a: [20, 12, -28], b: [-10, 13, -30], t: [0, 0, 0] }] });
}
