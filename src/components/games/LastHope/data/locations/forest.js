/**
 * Pinewood Forest — wood, stone, fiber, game and the first walkers.
 * A dirt road winds north from the drop-off; a pond, a hunter's cabin, an
 * abandoned campsite, a logging site, a rocky outcrop and a ranger tower.
 */
import { createLayout } from "../../engine/layout.js";

export function buildForest() {
  const B = createLayout({ id: "forest", name: "Pinewood Forest", w: 160, d: 160, seed: 2203, biome: "forest", base: "grass" });
  const { L } = B;
  B.paintCircle("moss", 0, 0, 110, 30, 0);
  for (let k = 0; k < 40; k++) B.paintCircle("moss", B.r(-75, 75), B.r(-75, 75), B.r(8, 18), 8, B.r(0.5, 0.9));
  for (let k = 0; k < 16; k++) B.paintCircle("dirt", B.r(-70, 70), B.r(-70, 70), B.r(2, 5), 3, 0.45);

  const road = [
    [2, 82],
    [4, 60],
    [12, 40],
    [-4, 18],
    [-8, 0],
    [6, -22],
    [16, -44],
    [8, -64],
    [-4, -84],
  ];
  B.road(road, 5, { kind: "dirt", lines: false, curb: false });
  for (let k = 0; k < road.length - 1; k++) {
    const [ax, az] = road[k];
    const [bx, bz] = road[k + 1];
    for (let t = 0; t <= 1; t += 0.12) B.reserve(ax + (bx - ax) * t, az + (bz - az) * t, 3.4);
  }

  // pond
  L.water = [{ x: 36, z: -16, r: 10.5 }];
  B.solidC(36, -16, 9.3, false);
  B.reserve(36, -16, 13);
  L.sources.push({ t: "pond", x: 36, z: -16, r: 11.8, name: "Pond" });
  B.paintCircle("dirt", 36, -16, 13.5, 3, 0.6);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    B.prop("reeds", 36 + Math.cos(a) * 10.4, -16 + Math.sin(a) * 10.4, { yaw: a, s: B.r(0.8, 1.2) });
  }
  B.prop("dock", 26.6, -12, { yaw: Math.PI / 2 + 0.35 });

  // hunter's cabin
  B.cabin(-42, -36, 0.35, { chest: { name: "Hunter's Chest" } });
  B.paintCircle("dirt", -42, -36, 9, 4, 0.7);
  B.prop("woodpile", -36.5, -40, { yaw: 0.35, solid: "b", hw: 0.9, hd: 0.45 });
  B.prop("chopping_block", -37.5, -32.5, { solid: "c", r: 0.4 });

  // abandoned campsite
  B.paintCircle("dirt", -12, 14, 7, 3, 0.8);
  B.reserve(-12, 14, 7);
  B.prop("tent", -16, 10.5, { yaw: 0.9, solid: "b", hw: 1.3, hd: 1.5, v: 1 });
  B.prop("tent_collapsed", -8, 9.5, { yaw: -0.6, solid: "b", hw: 1.2, hd: 1.2 });
  B.prop("firepit_old", -12, 15, { solid: "c", r: 0.55 });
  B.container("backpack_pile", -14.5, 17, 0.4);
  B.container("backpack_pile", -9, 17.5, -1.1);
  B.container("crate", -17.5, 14.5, 0.2, { table: "hunter_chest", name: "Camping Crate" });
  B.prop("log_seat", -12, 12.6, { solid: "b", hw: 0.85, hd: 0.25 });

  // logging site
  B.paintRect("dirt", 32, 30, 54, 50, 3, 0.85);
  B.reserveRect(32, 30, 54, 50);
  B.prop("log_pile", 38, 35, { yaw: 0.1, solid: "b", hw: 3.2, hd: 1.3 });
  B.prop("log_pile", 46, 44, { yaw: -0.2, solid: "b", hw: 3.2, hd: 1.3 });
  B.prop("logging_truck", 48, 34, { yaw: 1.4, solid: "b", hw: 1.25, hd: 4.2, op: true });
  B.prop("sawhorse", 40, 41, { yaw: 0.6, solid: "b", hw: 0.8, hd: 0.3 });
  B.node("stump_big", 36, 45, {});
  B.container("toolbox", 42.5, 38.5, 0.2, { name: "Lumberjack's Toolbox" });
  B.container("crate", 51.5, 47.5, -0.3, { table: "camp_crate" });

  // rocky outcrop
  B.reserve(-46, 44, 13);
  for (let k = 0; k < 7; k++) B.prop("cliff", -46 + B.r(-9, 9), 44 + B.r(-9, 9), { yaw: B.r(0, 6.28), s: B.r(1.1, 1.8), solid: "c", r: 1.6, op: true });
  for (let k = 0; k < 9; k++) {
    const a = B.rng() * Math.PI * 2;
    const r = B.r(6, 14);
    const x = -46 + Math.cos(a) * r;
    const z = 44 + Math.sin(a) * r;
    if (B.free(x, z, 1.4, 3)) B.node(B.rng() < 0.6 ? "boulder" : "rock", x, z, { s: B.r(0.85, 1.2) });
  }

  // ranger watchtower
  B.prop("watchtower", 50, -56, { yaw: 0.3, mark: 4 });
  for (const [dx, dz] of [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ])
    B.solidC(50 + dx, -56 + dz, 0.2);
  B.container("crate", 52.8, -53, 0.5, { table: "hunter_chest", name: "Ranger Supplies" });

  // a burned-out car on the road
  B.node("wreck", 9, 31, { yaw: 2.6, v: 2 });
  B.solidB(9, 31, 1, 2.2, 2.6, true);

  // scatter
  const sc = (n, r, f, margin = 4) => {
    let made = 0;
    for (let tries = 0; tries < n * 40 && made < n; tries++) {
      const x = B.r(-76, 76);
      const z = B.r(-76, 76);
      if (!B.free(x, z, r, margin)) continue;
      f(x, z);
      made++;
    }
  };
  sc(150, 1.7, (x, z) => B.node(B.rng() < 0.55 ? "pine" : B.rng() < 0.65 ? "tree" : "birch", x, z, { s: B.r(0.85, 1.25) }));
  sc(16, 1.6, (x, z) => B.node(B.rng() < 0.6 ? "rock" : "boulder", x, z, { s: B.r(0.8, 1.15) }));
  sc(38, 1, (x, z) => B.node("bush", x, z, { s: B.r(0.85, 1.25) }));
  sc(18, 1, (x, z) => B.node("berry", x, z, { s: B.r(0.85, 1.15) }));
  sc(24, 0.7, (x, z) => B.node("mushroom", x, z));
  sc(18, 0.8, (x, z) => B.node("branch", x, z));
  sc(16, 0.8, (x, z) => B.node("stones", x, z));
  sc(110, 0.6, (x, z) => B.prop(B.rng() < 0.55 ? "fern" : "grass_tuft", x, z, { yaw: B.rng() * 6.28, s: B.r(0.8, 1.4) }), 2);
  sc(26, 1.2, (x, z) => B.prop("log_fallen", x, z, { yaw: B.rng() * 6.28, s: B.r(0.8, 1.2), solid: "b", hw: 0.32, hd: 2.1 }));
  // dense boundary
  for (let k = 0; k < 420; k++) {
    const side = k % 4;
    const t = B.r(-80, 80);
    const inset = B.r(0, 7.5);
    const x = side === 0 ? -80 + inset : side === 1 ? 80 - inset : t;
    const z = side === 2 ? -80 + inset : side === 3 ? 80 - inset : t;
    if (Math.abs(x) < 6 && z > 70) continue; // keep the road mouth open
    if (!B.free(x, z, 1.3, 0)) continue;
    B.prop(B.rng() < 0.75 ? "pine_big" : "tree_big", x, z, { yaw: B.rng() * 6.28, s: B.r(0.95, 1.45), solid: "c", r: 0.45, mark: 1.3 });
  }

  // life
  B.animal("deer", 0, -42, 3, 12);
  B.animal("deer", -30, -4, 2, 10);
  B.animal("deer", 52, 6, 2, 10);
  B.animal("rabbit", 20, 18, 2, 14);
  B.animal("rabbit", -26, 56, 2, 12);
  B.animal("rabbit", 30, -46, 2, 12);

  B.spawn("walker", -12, 14, 3, 5);
  B.spawn("walker", 42, 40, 3, 6);
  B.spawn("walker", -42, -30, 2, 5);
  B.spawn("walker", 10, -30, 2, 7);
  B.spawn("walker", 28, -2, 2, 6);
  B.spawn("walker", -20, -60, 2, 8);
  B.spawn("walker", 56, -40, 1, 5);
  B.spawn("runner", 18, 18, 1, 6);
  B.spawn("runner", 0, 0, 2, 10, { night: true });
  B.spawn("walker", -32, 52, 3, 8, { night: true });
  B.spawn("walker", 40, -60, 2, 8, { night: true });

  B.prop("trail_sign", 6.5, 74, { yaw: Math.PI });
  B.prop("pickup_truck", -3.5, 76, { yaw: 0.2, solid: "b", hw: 1.05, hd: 2.6, op: true, v: 1 });
  B.exit(2, 79, "Forest road — open the world map", { r: 3.4 });
  L.entry = { x: 3, z: 71, yaw: Math.PI };
  return L;
}
