/**
 * Industrial Yard — Harlow Freight & Steel. A fenced concrete yard with two
 * enterable warehouses, a shipping-container maze, fuel tanks, a gantry crane,
 * scrap and machinery to strip for metal and parts, explosive drums, and the
 * security office where the Alpha Brute guards the Bunker Access Card.
 * The SITE 9 hatch in the north leads down to the Underground Bunker.
 */
import { createLayout } from "../../engine/layout.js";

export function buildIndustrial() {
  const B = createLayout({ id: "industrial", name: "Industrial Yard", w: 164, d: 150, seed: 4409, biome: "industrial", base: "dirt" });
  const { L } = B;
  // concrete pads inside the fence, grass verge outside
  B.paintRect("concrete", -68, -63, 70, 63, 0.4, 1);
  B.paintRect("grass", -82, -75, -71, 75, 1.2, 1);
  B.paintRect("moss", -82, -75, -73, 75, 2, 0.6);
  B.paintRect("grass", 72, -75, 82, 75, 1.2, 1);
  B.paintRect("grass", -82, 66, 82, 75, 1.2, 1);
  B.paintRect("grass", -82, -75, 82, -66, 1.2, 1);
  for (let k = 0; k < 40; k++) B.paintCircle("dirt", B.r(-66, 66), B.r(-60, 60), B.r(2, 6), 3, B.r(0.3, 0.6));
  for (let k = 0; k < 12; k++) B.paintCircle("asphalt", B.r(-66, 66), B.r(-60, 60), B.r(1, 3), 1.5, 0.5);

  B.road(
    [
      [-86, 0],
      [44, 0],
    ],
    10,
    { lines: true },
  );
  B.road(
    [
      [-30, 0],
      [-30, -22],
    ],
    8,
    { lines: false },
  );
  B.road(
    [
      [24, 0],
      [24, -24],
    ],
    8,
    { lines: false },
  );
  B.reserveRect(-86, -6, 46, 6);

  // perimeter chain-link fence with the west gate
  B.fence(-70, -64, 72, -64, "chain");
  B.fence(72, -64, 72, 66, "chain");
  B.fence(72, 66, -70, 66, "chain");
  B.fence(-70, 66, -70, -64, "chain", [[64, 12]]);
  B.prop("gate", -70, 0, { yaw: Math.PI / 2 });
  B.box(-63.5, 11.5, 0, 4, 3.6, { kind: "booth", h: 2.6, mat: "concrete", front: [[2, 1.5]], frontWin: [], rightWin: [[1.8, 1.6]], name: "Guard Booth" });
  B.container("locker", -64.9, 10.6, Math.PI / 2, { name: "Guard Locker" });

  // warehouse A (with a locker room partition)
  const A = B.warehouse(-30, -36, 0, 32, 20, { name: "Warehouse A", sign: "A", rackX: [-12, -3], side: true });
  {
    const [x0, z0] = A.P(8, -10);
    const [x1, z1] = A.P(8, 2);
    B.wall(x0, z0, x1, z1, { h: 3.2, t: 0.2, mat: "interior", gaps: [[9.5, 1.8]] });
    for (let k = 0; k < 3; k++) {
      const [x, z] = A.P(15.3, -8 + k * 1.1);
      B.container("locker", x, z, -Math.PI / 2);
    }
    for (const [lx, lz] of [
      [-12, -1],
      [-4, -1],
      [3, -1.5],
    ]) {
      const [x, z] = A.P(lx, lz);
      B.container("metal_crate", x, z, 0.1);
    }
    const [fx, fz] = A.P(-6, 5);
    B.prop("forklift", fx, fz, { yaw: 0.6, solid: "b", hw: 0.7, hd: 1.5 });
    const [px, pz] = A.P(-12, 6);
    B.prop("pallets", px, pz, { yaw: 0.2, solid: "b", hw: 0.7, hd: 0.7 });
  }
  // warehouse B
  const W = B.warehouse(24, -40, 0, 28, 22, { name: "Warehouse B", sign: "B", racks: 3, doorOff: 0 });
  {
    for (const [lx, lz] of [
      [-9, -1],
      [-1, 0],
      [8, -1.5],
    ]) {
      const [x, z] = W.P(lx, lz);
      B.container("metal_crate", x, z, -0.1);
    }
    const [mx, mz] = W.P(9, 6);
    B.node("machine", mx, mz, { yaw: 0, v: 1 });
    const [fx, fz] = W.P(-8, 6);
    B.prop("forklift", fx, fz, { yaw: -0.4, solid: "b", hw: 0.7, hd: 1.5 });
  }

  // security office (Alpha Brute's lair) at the loading dock
  const off = B.box(56, -30, -Math.PI / 2, 12, 9, { kind: "office", h: 3.1, mat: "concrete", floor: "tile", name: "Security Office", front: [[6, 1.6]], frontWin: [[2.5, 1.6], [9.5, 1.6]] });
  {
    const [sx, sz] = off.P(4, -3.2);
    B.container("safe", sx, sz, -Math.PI / 2, { id: "security_safe", name: "Security Safe", contents: { bunker_card: 1, gun_schematic: 1, pistol_ammo: 10, parts: 2 } });
    const [dx, dz] = off.P(-2.5, -2.4);
    B.prop("desk_office", dx, dz, { yaw: -Math.PI / 2, solid: "b", hw: 0.8, hd: 0.45 });
    const [lx, lz] = off.P(-5, 2.5);
    B.container("locker", lx, lz, 0);
    const [cx, cz] = off.P(-3.5, 3.6);
    B.prop("monitor_bank", cx, cz, { yaw: Math.PI - Math.PI / 2, solid: "b", hw: 0.9, hd: 0.3 });
  }
  B.paintRect("asphalt", 38, -42, 50, -18, 0.3, 0.8);
  B.prop("loading_dock", 46, -30, { yaw: Math.PI / 2 });
  L.boss = { id: "alpha", x: 44, z: -26 };

  // shipping-container yard
  const colors = [0, 1, 2, 3, 4];
  let ci = 0;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 3; col++) {
      const x = 30 + col * 11;
      const z = 16 + row * 9;
      if ((row === 2 && col === 1) || (row === 4 && col === 0)) continue; // aisles
      const stack = (row + col) % 3 === 0 ? 2 : 1;
      const yaw = (row * 7 + col) % 5 === 0 ? 0.08 : 0;
      if ((row === 1 && col === 2) || (row === 3 && col === 0) || (row === 0 && col === 1)) {
        B.container("container", x, z, Math.PI / 2 + yaw, { name: "Open Container" });
        B.prop("shipping_container", x, z, { yaw: Math.PI / 2 + yaw, v: colors[ci++ % 5], h: 1, c: 1 });
      } else {
        B.prop("shipping_container", x, z, { yaw: Math.PI / 2 + yaw, v: colors[ci++ % 5], h: stack, solid: "b", hw: 1.22, hd: 3.05, op: true });
      }
    }
  B.reserveRect(23, 10, 60, 60);

  // fuel tanks + chemical store
  for (const [x, z] of [
    [-48, 34],
    [-38, 42],
  ]) {
    B.prop("fuel_tank", x, z, { solid: "c", r: 3.6, op: true });
    B.reserve(x, z, 5);
  }
  B.prop("pipes", -43, 28, { yaw: 0.3, solid: "b", hw: 4, hd: 0.4 });
  for (const [x, z] of [
    [-55, 44],
    [-54, 46],
    [-30, 33],
    [-31, 35],
  ])
    B.container("chem_barrel", x, z, B.r(0, 6));
  B.paintCircle("dirt", -44, 38, 13, 4, 0.5);

  // gantry crane over the central lot
  B.prop("crane", 0, 32, { yaw: 0 });
  for (const [dx, dz] of [
    [-9, -4],
    [9, -4],
    [-9, 4],
    [9, 4],
  ])
    B.solidB(dx, 32 + dz, 0.4, 0.4, 0, false);
  B.reserveRect(-10, 27, 10, 37);

  // explosive drums
  const drums = [
    [-14, -14],
    [-6, 22],
    [12, 14],
    [36, -6],
    [-46, 20],
    [50, 8],
    [-20, 46],
    [6, -50],
    [32, 58],
    [-56, -50],
  ];
  drums.forEach(([x, z], i) => {
    L.hazards.push({ id: `drum${i}`, t: "drum", x, z, r: 0.4 });
    B.solidC(x, z, 0.4);
    B.mark(x, z, 1.4);
  });

  // SITE 9 hatch — the way down
  B.prop("bunker_hatch", 0, -58, { yaw: 0, solid: "b", hw: 3, hd: 2.2 });
  B.paintRect("concrete", -6, -64, 6, -52, 0.3, 1);
  B.reserveRect(-7, -64, 7, -50);
  B.exit(0, -54.2, "SITE 9 hatch — descend into the bunker", { r: 2.4, to: "bunker" });

  // scatter: scrap, machines, lights, debris
  const sc = (n, r, f, margin = 3) => {
    let made = 0;
    for (let tries = 0; tries < n * 50 && made < n; tries++) {
      const x = B.r(-66, 68);
      const z = B.r(-60, 62);
      if (!B.free(x, z, r, margin)) continue;
      f(x, z);
      made++;
    }
  };
  sc(24, 1.6, (x, z) => B.node("scrap", x, z, { s: B.r(0.85, 1.2) }));
  sc(7, 1.8, (x, z) => B.node("machine", x, z, { v: Math.floor(B.rng() * 3) }));
  sc(6, 2.4, (x, z) => {
    B.node("wreck", x, z, { yaw: B.rng() * 6.28, v: 4 });
    B.solidB(x, z, 1, 2.2, 0, true);
  });
  sc(14, 1.2, (x, z) => B.prop("pallets", x, z, { yaw: B.rng() * 6.28, solid: "b", hw: 0.7, hd: 0.7 }));
  sc(10, 1, (x, z) => B.prop("tire_stack", x, z, { solid: "c", r: 0.5 }));
  sc(8, 1.4, (x, z) => B.container("metal_crate", x, z, B.rng() * 6.28));
  sc(16, 0.8, (x, z) => B.prop("debris", x, z, { yaw: B.rng() * 6.28, s: B.r(0.8, 1.3) }), 2);
  sc(10, 0.8, (x, z) => B.node("stones", x, z));
  for (const [x, z] of [
    [-50, -10],
    [-10, -10],
    [10, 10],
    [-20, 20],
    [40, 4],
    [-50, -55],
    [60, 60],
    [-60, 55],
    [0, -40],
  ]) {
    B.prop("floodlight", x, z, { solid: "c", r: 0.2 });
    B.light(x, 7, z, { color: "#e8f0ff", i: 2.6, r: 18, kind: "flood", flicker: (x + z) % 3 === 0 ? 0.5 : 0 });
  }
  for (let k = 0; k < 160; k++) {
    const side = k % 4;
    const t = B.r(-80, 80);
    const inset = B.r(0, 6);
    const x = side === 0 ? -82 + inset : side === 1 ? 82 - inset : t;
    const z = side === 2 ? -75 + inset : side === 3 ? 75 - inset : t;
    if (Math.abs(z) < 10 && x < -70) continue;
    if (!B.free(x, z, 1.3, 0)) continue;
    B.prop(B.rng() < 0.4 ? "tree_big" : "pine_big", x, z, { yaw: B.rng() * 6.28, s: B.r(0.9, 1.3), solid: "c", r: 0.45, mark: 1.3 });
  }

  // threats
  B.spawn("walker", -20, -16, 3, 6);
  B.spawn("walker", 0, 10, 3, 8);
  B.spawn("walker", -40, 18, 2, 5);
  B.spawn("walker", 10, 50, 2, 8);
  B.spawn("runner", 18, -10, 3, 6);
  B.spawn("runner", -50, -40, 2, 6);
  B.spawn("armored", -30, -38, 2, 5);
  B.spawn("armored", 24, -42, 2, 5);
  B.spawn("armored", 46, 30, 2, 4);
  B.spawn("toxic", -44, 30, 3, 6);
  B.spawn("toxic", 42, 50, 2, 5);
  B.spawn("runner", 30, 30, 3, 10, { night: true });
  B.spawn("armored", -10, 0, 2, 8, { night: true });

  B.prop("road_sign", -76, -7.6, { yaw: Math.PI / 2, v: 1 });
  B.prop("pickup_truck", -79, 4, { yaw: 1.55, solid: "b", hw: 1.05, hd: 2.6, op: true, v: 2 });
  B.exit(-81, -2, "Service road — open the world map", { r: 3.6 });
  L.entry = { x: -76, z: -2.5, yaw: Math.PI / 2 };
  return L;
}
