/**
 * Harbor Strike — industrial port at dusk.
 * West: harbour office (Vanguard spawn). East: fuel depot (Obsidian spawn).
 * North lane: warehouse road with an enterable warehouse. Middle: container
 * yard around an open square under the gantry crane (B). South: the quay.
 */
import { createBuilder } from "./build.js";

export function buildHarbor() {
  const B = createBuilder({ id: "harbor", name: "Harbor Strike", bounds: { minX: -52, maxX: 52, minZ: -33, maxZ: 25.5 } });
  const { box, room, facade, stairs, ladder, container, crate, barrier, vehicle, barrel, fence, wall, tank, patch, spawn, flag, poi, prop } = B;

  /* ---- ground ---- */
  patch(-52, -33, 52, 25.5, "concreteYard");
  patch(-52, -31, 52, -26.5, "asphalt", { lines: "x" });
  patch(-30, -14, 30, 13, "asphaltWorn");
  patch(-52, 15.5, 52, 25.5, "quay");
  patch(-52, 24.6, 52, 25.5, "quayEdge");
  prop("water", { y: -2.2 });
  prop("ship", { x: 6, z: 36, len: 92 });
  prop("lighthouse", { x: -80, z: 70 });

  /* ---- north boundary: warehouses / sheds ---- */
  facade(-41, -36, 22, 6, 11, "warehouse", { c: "#7d8a8f" });
  facade(-18, -36.5, 22, 7, 13, "warehouse", { c: "#8d7b68" });
  facade(6, -36, 24, 6, 10, "warehouse", { c: "#6d7f88" });
  facade(30, -36.5, 22, 7, 14, "warehouse", { c: "#857a70" });
  facade(48, -36, 12, 6, 9, "warehouse", { c: "#6f7b80" });

  /* ---- west: harbour office (Vanguard spawn) ---- */
  room(-43, -21, 11, 8, 3.6, {
    m: "plasterBlue",
    open: [
      { side: "e", at: -1.2, w: 1.5 },
      { side: "s", at: 2.5, w: 1.5 },
      { side: "s", at: -2.2, w: 2, kind: "window" },
      { side: "n", at: 0, w: 3, kind: "window" },
      { side: "e", at: 2.2, w: 1.6, kind: "window" },
    ],
    floor: "tile",
  });
  crate(-46.5, -23.5, 1.1);
  box(-41, -23.8, 2.4, 0.9, 0.85, "desk", "wood");
  vehicle(-46, -10, 1, "pickup", "#6c7d5c");
  barrier(-38, -6, 3, 1);
  barrier(-38, 6, 3, 1);
  crate(-41, 15, 1.2);
  crate(-41, 16.3, 1.2);
  crate(-41, 15.6, 1, { y: 1.2 });
  vehicle(-46, 9, 3, "forklift", "#d8a428");
  fence(-52, -14, -36, -14, 2.3);
  prop("lamp", { x: -36, z: -12, h: 7 });
  prop("lamp", { x: -36, z: 13, h: 7 });

  /* ---- north lane: road + warehouse ---- */
  room(3, -20.5, 22, 12, 7.2, {
    m: "corrugatedWall",
    s: "warehouse",
    open: [
      { side: "w", at: 0, w: 4.4, h: 4.4 },
      { side: "e", at: 0, w: 4.4, h: 4.4 },
      { side: "s", at: -6.5, w: 1.6 },
      { side: "s", at: 6.5, w: 1.6 },
      { side: "s", at: 0, w: 5, kind: "window", y0: 3.6, y1: 5.2 },
      { side: "n", at: -4, w: 6, kind: "window", y0: 4.2, y1: 5.6 },
      { side: "n", at: 6, w: 6, kind: "window", y0: 4.2, y1: 5.6 },
    ],
    roofM: "metalRoof",
    floor: "concreteFloor",
  });
  // racks + crates inside
  box(-3.5, -23.5, 5, 1.1, 2.6, "rack", "rackMetal");
  box(9.5, -23.5, 5, 1.1, 2.6, "rack", "rackMetal");
  crate(-4, -18, 1.3);
  crate(-2.6, -18, 1.3);
  crate(-3.3, -18, 1.1, { y: 1.3 });
  crate(9, -17.5, 1.3);
  crate(10.4, -18.2, 1.3);
  box(3, -21, 2.6, 1.6, 1.15, "crate", "crateMetal", { s: "metal" });
  vehicle(4, -24.5, 0, "forklift", "#d8a428");

  vehicle(-21, -29, 0, "truck", "#a33a2b");
  crate(-24, -23, 1.2);
  crate(-24, -21.7, 1.2);
  box(-15, -22.5, 2.4, 1.2, 0.5, "pallet", "wood");
  crate(-15, -22.5, 1, { y: 0.5 });
  barrel(-28, -24, "#2f5f8a");
  barrel(-27.3, -24.6, "#2f5f8a");
  barrel(-27.7, -23.4, "#b33b2a");
  vehicle(26, -29, 2, "truck", "#2c5d8f");
  crate(22, -22, 1.2);
  crate(23.3, -22, 1.2);
  crate(22.6, -22, 1, { y: 1.2 });
  barrier(17.5, -19, 3, 1);
  barrier(-12, -19, 3, 1);
  prop("lamp", { x: -12, z: -27, h: 8 });
  prop("lamp", { x: 18, z: -27, h: 8 });

  /* ---- container yard (west) ---- */
  container(-21, -8.2, 0, "#a6402e");
  container(-21, -8.2, 0, "#2e6f9e", 1);
  container(-21, -5.7, 0, "#3f7a4b");
  ladder(-21, -4.3, 2.59, "s"); // up onto the green one, then the stack edge
  container(-12.2, -7.5, 1, "#c9822b");
  container(-21, 5.5, 0, "#6d4a8c");
  container(-21, 8, 0, "#a6402e");
  container(-21, 8, 0, "#c9b03a", 1);
  container(-12.2, 6.3, 1, "#2e6f9e");
  container(-12.2, 6.3, 1, "#8a2f2f", 1);
  container(-16.5, 0.6, 0, "#4c6f73");
  stairs(-19.8, 2.4, "n", 1.4, 6, 0.43, 0.42, "metalGrate"); // reach the yard's middle stack
  crate(-25.5, 0.5, 1.2);
  crate(-25.5, 1.8, 1.2);
  barrier(-8, -2, 3, 1);
  barrier(-8, 6.5, 2.6, 0);

  /* ---- container yard (east) ---- */
  container(22.5, -8.2, 0, "#2e6f9e");
  container(22.5, -5.7, 0, "#a6402e");
  container(22.5, -5.7, 0, "#4c6f73", 1);
  ladder(22.5, -9.6, 2.59, "n");
  container(13.6, -7.5, 1, "#3f7a4b");
  container(13.6, -7.5, 1, "#c9822b", 1);
  container(22.5, 5.5, 0, "#c9b03a");
  container(22.5, 8, 0, "#6d4a8c");
  container(13.6, 6.3, 1, "#a6402e");
  container(18, 0.6, 0, "#8a2f2f");
  stairs(21.3, -1.2, "s", 1.4, 6, 0.43, 0.42, "metalGrate");
  crate(27, 0.5, 1.2);
  crate(27, -0.8, 1.2);
  barrier(10, -2, 3, 1);
  barrier(10, 7, 2.6, 0);

  /* ---- centre square under the gantry crane (B) ---- */
  crate(1, -3.5, 1.3);
  crate(2.3, -3.5, 1.3);
  crate(5.5, 6.5, 1.3);
  crate(5.5, 7.8, 1.3);
  crate(5.5, 7.1, 1.1, { y: 1.3 });
  vehicle(-2.5, 6.5, 1, "forklift", "#d8a428");
  box(1.5, 2.2, 2.6, 1.6, 1.1, "crate", "crateMetal", { s: "metal" });
  // gantry crane legs (crane itself is a prop)
  box(-5.5, -12.5, 1.1, 1.1, 1.2, "craneFoot", "paintedMetal", { c: "#d8a428" });
  box(-5.5, 11.5, 1.1, 1.1, 1.2, "craneFoot", "paintedMetal", { c: "#d8a428" });
  box(8.5, -12.5, 1.1, 1.1, 1.2, "craneFoot", "paintedMetal", { c: "#d8a428" });
  box(8.5, 11.5, 1.1, 1.1, 1.2, "craneFoot", "paintedMetal", { c: "#d8a428" });
  box(-5.5, -12.5, 0.8, 0.8, 18, "craneLeg", "none", { hidden: true });
  box(-5.5, 11.5, 0.8, 0.8, 18, "craneLeg", "none", { hidden: true });
  box(8.5, -12.5, 0.8, 0.8, 18, "craneLeg", "none", { hidden: true });
  box(8.5, 11.5, 0.8, 0.8, 18, "craneLeg", "none", { hidden: true });
  prop("gantry", { x: 1.5, z: -0.5, w: 14, d: 24, h: 18 });

  /* ---- yard / quay divider ---- */
  container(-9, 13.2, 0, "#2e6f9e");
  container(12, 13.2, 0, "#3f7a4b");
  container(-34, 12.8, 0, "#8a2f2f");
  container(36, 12.8, 0, "#c9822b");
  wall(-30, 11.5, -27, 11.5, 1.1, 0.5, "concrete", { k: "barrier" });

  /* ---- quay (south) ---- */
  for (let x = -48; x <= 48; x += 8) box(x, 24.4, 0.45, 0.45, 0.6, "bollard", "paintedMetal", { c: "#2b2f33" });
  crate(-28, 19.5, 1.2);
  crate(-26.8, 19.5, 1.2);
  crate(-27.4, 19.5, 1, { y: 1.2 });
  container(-16, 20.5, 0, "#c9b03a");
  barrier(-4, 19.5, 3, 0);
  vehicle(4, 20.5, 0, "truck", "#d0d4d8");
  barrier(16, 18.5, 3, 0);
  container(26, 21, 0, "#4c6f73");
  crate(36, 19, 1.2);
  crate(37.3, 19, 1.2);
  box(-38, 21, 2.4, 1.2, 0.5, "pallet", "wood");
  crate(-38, 21, 1, { y: 0.5 });
  // quay crane on rails
  box(-30, 16.4, 1.2, 1.2, 1.4, "craneFoot", "paintedMetal", { c: "#b8402c" });
  box(-30, 23.6, 1.2, 1.2, 1.4, "craneFoot", "paintedMetal", { c: "#b8402c" });
  box(-22, 16.4, 1.2, 1.2, 1.4, "craneFoot", "paintedMetal", { c: "#b8402c" });
  box(-22, 23.6, 1.2, 1.2, 1.4, "craneFoot", "paintedMetal", { c: "#b8402c" });
  prop("quayCrane", { x: -26, z: 20, w: 8, d: 7.2 });
  prop("rails", { z0: 16.4, z1: 23.6, x0: -52, x1: 52 });
  prop("lamp", { x: -10, z: 16, h: 9 });
  prop("lamp", { x: 22, z: 16, h: 9 });

  /* ---- east: fuel depot (Obsidian spawn) ---- */
  tank(45.5, -24, 3, 7, "#d2d6d9");
  tank(38.5, -24, 2.5, 6, "#bfc5ca");
  fence(34, -18, 52, -18, 2.3);
  room(43.5, 4, 8, 6, 3.2, {
    m: "plasterWhite",
    open: [
      { side: "w", at: -1, w: 1.5 },
      { side: "n", at: 1.5, w: 1.5 },
      { side: "w", at: 1.6, w: 1.4, kind: "window" },
      { side: "s", at: 0, w: 2.5, kind: "window" },
    ],
    floor: "tile",
  });
  vehicle(46, -10, 1, "pickup", "#3c4954");
  barrier(38, -6, 3, 1);
  barrier(38, 13, 3, 1);
  barrel(34, -12, "#b33b2a");
  barrel(34.6, -12.6, "#b33b2a");
  crate(40, 17, 1.2);
  prop("lamp", { x: 37, z: -12, h: 7 });
  prop("lamp", { x: 37, z: 12, h: 7 });

  /* ---- logic ---- */
  for (const [x, z] of [
    [-47, -6],
    [-47, 0],
    [-47, 6],
    [-44, 12],
    [-44, -12],
    [-40, 19],
    [-48, -16],
    [-41, -2],
    [-41, 4],
    [-44, 20],
  ])
    spawn(0, x, z, -Math.PI / 2);
  for (const [x, z] of [
    [47, -6],
    [47, 0],
    [48, 9],
    [44, 12],
    [44, -12],
    [40, 20],
    [48, -15],
    [41, -2],
    [40, 8],
    [46, 21],
  ])
    spawn(1, x, z, Math.PI / 2);
  flag("A", -30, 1);
  flag("B", 1.5, -0.5);
  flag("C", 31, 1);
  for (const [x, z, w] of [
    [-30, 1, 2],
    [1.5, -0.5, 3],
    [31, 1, 2],
    [3, -20, 2],
    [-16.5, 3.5, 1],
    [18, -2, 1],
    [-4, 20, 1.5],
    [20, 20, 1],
    [-20, -22, 1],
    [22, -24, 1],
    [-12, 0, 1],
    [14, 1, 1],
  ])
    poi(x, z, w);

  return B.finish({ theme: "harbor", shots: [{ a: [-40, 3.2, 16], b: [-30, 3.6, 10], t: [6, 2.5, -2] }, { a: [-6, 2, -18], b: [6, 2.2, -18.5], t: [3, 1.6, -24] }, { a: [26, 7, 22], b: [18, 8, 22], t: [-4, 1, -4] }, { a: [-10, 14, -6], b: [10, 15, -4], t: [2, 0, 10] }] });
}
