/**
 * Survivor's Camp — the safe home base. A sunlit clearing ringed by pines;
 * the 36 × 36 m build zone sits in the middle. No zombies by day; from the
 * second night on small groups raid the clearing while you are here.
 */
import { createLayout } from "../../engine/layout.js";

export function buildCamp() {
  const B = createLayout({ id: "camp", name: "Survivor's Camp", w: 92, d: 92, seed: 1101, biome: "camp", base: "grass" });
  const { L } = B;
  // ground: worn dirt clearing, moss under the forest ring, a trail south
  B.paintCircle("dirt", 0, 0, 13, 7, 0.55);
  B.paintCircle("dirt", -9, -7, 5, 3, 0.7);
  B.paintCircle("moss", 0, 0, 60, 20, 0);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    B.paintCircle("moss", Math.cos(a) * 36, Math.sin(a) * 36, 14, 8, 0.85);
  }
  const trail = [
    [0, 12],
    [2, 22],
    [-2, 31],
    [1, 40],
    [0, 46],
  ];
  B.paintLine("dirt", trail, 3.4, 1.4, 0.9);
  B.reserveRect(-19, -19, 19, 19);
  for (const [x, z] of trail) B.reserve(x, z, 3);

  // starting camp (north-west corner of the zone)
  B.prop("tent", -12.5, -11.5, { yaw: 0.6, solid: "b", hw: 1.3, hd: 1.5, mark: 2.5 });
  B.prop("firepit_old", -8, -6.5, { solid: "c", r: 0.55 });
  B.prop("log_seat", -8, -4.2, { yaw: 0.1, solid: "b", hw: 0.85, hd: 0.25 });
  B.prop("log_seat", -10.4, -6.8, { yaw: 1.5, solid: "b", hw: 0.85, hd: 0.25 });
  B.prop("lean_to", 12.5, -13, { yaw: -0.5, solid: "b", hw: 1.6, hd: 1.1, mark: 2.4 });
  B.prop("woodpile", 14.8, -10.2, { yaw: -0.5, solid: "b", hw: 0.9, hd: 0.45 });
  B.container("crate", -14.5, -6.5, 0.3, { id: "camp_start", name: "Survivor's Stash", contents: { wood: 4, fiber: 4, cloth: 4, empty_bottle: 2, berries: 4, bandage: 1 } });
  B.prop("well", 9, 9.5, { solid: "c", r: 0.9 });
  L.sources.push({ t: "well", x: 9, z: 9.5, r: 2.2, name: "Old Well" });
  B.prop("sign", 3.5, 17.5, { yaw: Math.PI, v: 0 });
  B.prop("flag", -15.5, -15.5, { solid: "c", r: 0.15 });
  B.prop("clothesline", -3, -15, { yaw: 0.1 });

  // a few things to gather inside the clearing
  const inZone = [
    ["branch", -4, 6],
    ["branch", 6, -4],
    ["branch", -15, 4],
    ["branch", 15, 2],
    ["stones", 4, 3],
    ["stones", -6, 12],
    ["stones", 13, -3],
    ["stones", -2, -10],
    ["bush", -16, 12],
    ["bush", 16, 14],
    ["berry", 14, 15.5],
    ["berry", -17, 15],
  ];
  for (const [t, x, z] of inZone) B.node(t, x, z, { s: B.r(0.85, 1.1) });

  // harvestable forest ring
  const ring = (n, r0, r1, f) => {
    let made = 0;
    for (let tries = 0; tries < n * 30 && made < n; tries++) {
      const a = B.rng() * Math.PI * 2;
      const r = r0 + (r1 - r0) * Math.sqrt(B.rng());
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!B.free(x, z, 1.6, 2)) continue;
      f(x, z);
      made++;
    }
  };
  ring(34, 21, 33, (x, z) => B.node(B.rng() < 0.55 ? "pine" : B.rng() < 0.6 ? "tree" : "birch", x, z, { s: B.r(0.85, 1.2) }));
  ring(9, 20, 32, (x, z) => B.node(B.rng() < 0.7 ? "rock" : "boulder", x, z, { s: B.r(0.8, 1.15) }));
  ring(10, 20, 31, (x, z) => B.node(B.rng() < 0.4 ? "berry" : "bush", x, z, { s: B.r(0.85, 1.2) }));
  ring(8, 20, 30, (x, z) => B.node(B.rng() < 0.5 ? "branch" : "stones", x, z));
  ring(6, 21, 33, (x, z) => B.node("mushroom", x, z));
  // dense decorative boundary forest
  ring(230, 33, 46, (x, z) => B.prop(B.rng() < 0.7 ? "pine_big" : "tree_big", x, z, { yaw: B.rng() * 6.28, s: B.r(0.9, 1.35), solid: "c", r: 0.45, mark: 1.6 }));
  ring(60, 22, 44, (x, z) => B.prop(B.rng() < 0.5 ? "fern" : "grass_tuft", x, z, { yaw: B.rng() * 6.28, s: B.r(0.8, 1.3) }));

  // trailhead: the way out
  B.prop("pickup_truck", -3.2, 40.5, { yaw: 0.25, solid: "b", hw: 1.05, hd: 2.6, op: true });
  B.prop("trail_sign", 2.6, 38, { yaw: Math.PI });
  B.exit(0, 43, "Trailhead — open the world map", { r: 3.2 });
  L.entry = { x: 0.5, z: 36, yaw: Math.PI };
  L.start = { x: -4, z: -1.5, yaw: Math.PI * 0.85 };

  // raid entry points (night)
  L.raidPoints = [
    [0, 34],
    [-28, 18],
    [28, 20],
    [-30, -18],
    [27, -24],
  ];
  return L;
}
