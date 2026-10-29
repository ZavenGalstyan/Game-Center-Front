/**
 * Hand-composed placement of every structure, prop and interactable in the
 * overworld. Both the collision world (engine/world.js) and the renderer
 * (render/structures.js) consume this one list, so what you see is what
 * you collide with.
 *
 * Entry: { kind, x, z, rot, ...params }. `rot` is a yaw (0 = front faces +Z).
 * Interactables carry an `id` (chests, shrines, doors, levers, cages…).
 */
import { smoothPath } from "../engine/math.js";

const rad = (d) => (d * Math.PI) / 180;
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

export function buildLayout(T) {
  const S = [];
  const add = (kind, x, z, rot = 0, p = {}) => {
    const e = { kind, x, z, rot, ...p };
    S.push(e);
    return e;
  };
  /** A wall run between two points (centre line), split into `n` pieces. */
  const wallRun = (ax, az, bx, bz, p = {}) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = p.pieces || 1;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const cx = ax + (bx - ax) * (t0 + t1) * 0.5;
      const cz = az + (bz - az) * (t0 + t1) * 0.5;
      const rot = Math.atan2(bz - az, bx - ax) * -1;
      add(p.kind || "wall", cx, cz, rot, { len: len / n, h: p.h ?? 11, t: p.t ?? 3, ...(p.ruin ? { ruin: p.ruin(k) } : {}), crenel: p.crenel ?? true, style: p.style });
    }
  };
  const fenceRun = (pts, kind = "fence", h = 1.1) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      add(kind, (ax + bx) / 2, (az + bz) / 2, -Math.atan2(bz - az, bx - ax), { len, h });
    }
  };

  /* ================================================================ Thornwick */
  const V = { x: 0, z: 150 };
  add("well", V.x + 4, V.z + 4, 0);
  add("statue", V.x - 6, V.z + 8, rad(180), { type: "founder" });
  // landmark buildings
  add("house", -26, 132, face(-26, 132, -4, 146), { w: 15, d: 10, h: 4.2, floors: 2, roof: "thatch", style: "timber", sign: "inn", id: "inn" });
  add("house", 20, 168, face(20, 168, 4, 152), { w: 10, d: 8, h: 3.6, floors: 2, roof: "shingle", style: "timber", id: "elderhouse" });
  add("hall", -6, 186, face(-6, 186, -2, 160), { w: 17, d: 10, h: 5.5, id: "marchhall" });
  add("smithy", 24, 128, face(24, 128, 8, 146), { w: 9, d: 7, id: "smithy" });
  add("chapel", 38, 182, face(38, 182, 10, 158), { w: 9, d: 14 });
  add("windmill", -66, 208, rad(30), {});
  add("watchtowerWood", -46, 108, rad(20), {});
  // market stalls around the square
  [
    [12, 142, "#9b2d2d"],
    [14, 158, "#2d5a9b"],
    [-14, 158, "#c9a227"],
    [-12, 141, "#3f7a3a"],
  ].forEach(([x, z, c]) => add("stall", x, z, face(x, z, 0, 150), { color: c }));
  // houses ring
  const houses = [
    [-36, 160, 8, 7, "thatch"],
    [-44, 176, 7, 6, "thatch"],
    [-30, 196, 8, 6, "shingle"],
    [-50, 140, 7, 6, "thatch"],
    [-54, 124, 8, 7, "shingle"],
    [-30, 112, 7, 6, "thatch"],
    [-14, 112, 7, 6, "shingle"],
    [16, 106, 8, 6, "thatch"],
    [30, 114, 7, 6, "thatch"],
    [36, 132, 6, 6, "shingle"],
    [32, 166, 7, 6, "thatch"],
    [14, 186, 8, 7, "shingle"],
    [24, 202, 7, 6, "thatch"],
    [-18, 206, 7, 6, "thatch"],
    [-58, 158, 6, 6, "thatch"],
    [10, 122, 6, 5, "thatch"],
  ];
  houses.forEach(([x, z, w, d, roof], i) => add("house", x, z, face(x, z, 0, 150) + (i % 3 === 0 ? rad(8) : 0), { w, d, h: 3.2 + (i % 3) * 0.3, floors: i % 4 === 1 ? 2 : 1, roof, style: i % 5 === 2 ? "stone" : "timber" }));
  // fields & fences south of the village
  fenceRun([[-55, 218], [-55, 264], [60, 264], [60, 232]]);
  add("hay", -40, 240, 0);
  add("hay", 20, 252, rad(40));
  add("hay", 44, 244, rad(70));
  add("scarecrow", 5, 240, rad(10));
  // village dressing
  for (const [x, z, k] of [
    [-18, 130, "barrel"],
    [-17, 128, "barrel"],
    [-33, 140, "crate"],
    [28, 138, "crate"],
    [30, 124, "logpile"],
    [20, 124, "anvil"],
    [-8, 166, "cart"],
    [34, 150, "crate"],
    [-46, 150, "logpile"],
    [8, 178, "barrel"],
    [-24, 170, "hay"],
    [-60, 118, "cart"],
  ])
    add(k, x, z, rad((x * 37 + z * 11) % 360));
  for (const [x, z] of [
    [-8, 140],
    [8, 160],
    [-10, 172],
    [16, 140],
    [-22, 150],
    [26, 156],
  ])
    add("lamp", x, z, 0);
  add("banner", 2, 175, rad(180), { color: "#3f6a3a", sigil: "marches", h: 7 });
  add("banner", -14, 175, rad(180), { color: "#3f6a3a", sigil: "marches", h: 7 });
  add("signpost", -62, 141, rad(90), { text: "Thornwick" });
  add("signpost", 64, 146, rad(-90), { text: "Ashfall · Ember Court" });
  add("signpost", -6, 92, rad(180), { text: "Wintermere Hold" });

  /* ================================================================ The Silent Road (clues) */
  add("clue", -112, 123, rad(70), { id: "clue_cart", look: "cart" });
  add("clue", -166, 119, rad(10), { id: "clue_cloak", look: "cloak" });
  add("clue", -226, 166, rad(-40), { id: "clue_arrows", look: "arrows" });
  add("pickup", -113.6, -106.2, 0, { id: "locket", item: "q_locket", when: "s_locket" });

  /* ================================================================ Hunter's Lodge */
  add("cabin", -190, 50, rad(60), { w: 9, d: 7, id: "lodge" });
  add("campfire", -180, 61, 0, { id: "lodgefire" });
  add("rack", -176, 54, rad(20));
  add("logpile", -196, 60, rad(80));
  add("chest", -194, 44, rad(60), { id: "c_lodge", loot: "lodge" });

  /* ================================================================ Greyfang Den */
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + 0.3;
    if (Math.abs(a - Math.PI * 0.25) < 0.4) continue; // the way in
    add("boulder", -330 + Math.cos(a) * 19, -80 + Math.sin(a) * 19, a, { r: 3 + (k % 3) });
  }
  add("caveMouth", -341, -94, rad(30), {});
  add("bones", -326, -76, 0);
  add("bones", -334, -84, rad(120));
  add("chest", -340, -88, rad(30), { id: "c_den", loot: "den" });

  /* ================================================================ Red Hand Camp */
  const C = { x: -300, z: 200 };
  {
    const pts = [];
    for (let k = 0; k <= 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      pts.push([C.x + Math.cos(a) * 30, C.z + Math.sin(a) * 30, a]);
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = (pts[k][2] + pts[k + 1][2]) / 2;
      if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI - -0.35) < 0.33) continue; // gate gap facing the camp spur (north-east)
      fenceRun([pts[k], pts[k + 1]], "palisade", 3.4);
    }
  }
  add("campfire", C.x, C.z, 0, { big: true });
  [
    [-314, 188, 7, 6, "#6b2a22", "garrick"],
    [-286, 214, 5, 4, "#5a4a36"],
    [-318, 212, 5, 4, "#4a3a2a"],
    [-284, 186, 5, 4, "#5a4a36"],
    [-302, 222, 5, 4, "#6b2a22"],
  ].forEach(([x, z, w, d, c, id]) => add("tent", x, z, face(x, z, C.x, C.z), { w, d, color: c, style: "ridge", id }));
  add("cage", -308, 214, rad(160), { id: "cage" });
  add("rack", -292, 190, rad(40));
  add("rack", -296, 208, rad(-30));
  add("crate", -312, 198, 0);
  add("crate", -310, 196, rad(30));
  add("barrel", -288, 200, 0);
  add("banner", -286, 182, rad(40), { color: "#7a1f1a", sigil: "redhand", h: 6 });
  add("chest", -318, 184, rad(30), { id: "c_garrick", loot: "garrick" });

  /* ================================================================ Old Watchtower, Mirror Mere */
  add("tower", -120, -40, 0, { r: 4.2, h: 12, roof: "broken", style: "old" });
  add("rubble", -114, -34, rad(30));
  add("chest", -116, -46, rad(200), { id: "c_tower", loot: "tower" });
  add("dock", -108, -98, rad(-145), {});

  /* ================================================================ Wintermere Hold */
  const K = { x: 0, z: -300 };
  const X0 = -56;
  const X1 = 56;
  const Z0 = -352;
  const Z1 = -252;
  wallRun(X0, Z1, -7, Z1, { pieces: 3 });
  wallRun(7, Z1, X1, Z1, { pieces: 3 });
  wallRun(X1, Z1, X1, Z0, { pieces: 5 });
  wallRun(X1, Z0, X0, Z0, { pieces: 5 });
  wallRun(X0, Z0, X0, Z1, { pieces: 5 });
  for (const [x, z] of [
    [X0, Z0],
    [X1, Z0],
    [X0, Z1],
    [X1, Z1],
    [X0, -302],
    [X1, -302],
  ])
    add("tower", x, z, 0, { r: 6, h: 19, roof: "cone", style: "castle" });
  add("gatehouse", 0, Z1, 0, { w: 14, h: 15, t: 8, gate: "wintergate", open: true });
  add("keep", K.x, -328, 0, { w: 32, d: 20, h: 22 });
  add("tower", -17, -338, 0, { r: 5, h: 30, roof: "cone", style: "castle" });
  add("tower", 17, -338, 0, { r: 5, h: 30, roof: "cone", style: "castle" });
  add("stairs", 0, -314, 0, { w: 10, d: 4, h: 2 });
  add("house", -38, -288, rad(90), { w: 18, d: 8, h: 4.5, floors: 1, roof: "slate", style: "stone", id: "barracks" });
  add("smithy", 38, -282, rad(-90), { w: 9, d: 7, id: "castlesmithy" });
  add("stable", -36, -266, rad(90), { w: 12, d: 6 });
  add("statue", 0, -292, 0, { type: "king", big: true });
  for (const [x, z] of [
    [24, -300],
    [28, -306],
    [24, -312],
  ])
    add("dummy", x, z, rad(-90));
  add("rack", 32, -298, rad(-90));
  add("chest", -46, -340, rad(45), { id: "c_castle", loot: "castle" });
  for (const x of [-24, -10, 10, 24]) add("banner", x, -317, 0, { color: "#2b4a7a", sigil: "wardens", h: 9 });
  add("banner", -10, Z1 + 3, 0, { color: "#2b4a7a", sigil: "wardens", h: 8 });
  add("banner", 10, Z1 + 3, 0, { color: "#2b4a7a", sigil: "wardens", h: 8 });
  for (const [x, z] of [
    [-8, -270],
    [8, -270],
    [-12, -314],
    [12, -314],
    [-30, -300],
    [30, -290],
  ])
    add("brazier", x, z, 0, { lit: true });
  for (const [x, z, k] of [
    [-44, -330, "crate"],
    [-42, -334, "barrel"],
    [44, -330, "crate"],
    [46, -326, "barrel"],
    [42, -270, "logpile"],
    [-28, -270, "hay"],
  ])
    add(k, x, z, rad(x * 3));
  add("signpost", 6, -236, 0, { text: "Wintermere Hold" });

  /* ================================================================ Frostfang Mines */
  add("mineEntrance", -98, -270, rad(10), {});
  for (const [i, x, z] of [
    [1, -104, -258],
    [2, -86, -262],
    [3, -92, -246],
  ])
    add("oreNode", x, z, rad(i * 70), { id: `ore${i}` });
  add("cart", -90, -254, rad(40), { mine: true });
  add("chest", -108, -266, rad(20), { id: "c_mines", loot: "mines" });

  /* ================================================================ Standing Stones */
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    add("monolith", 150 + Math.cos(a) * 13, -60 + Math.sin(a) * 13, a + Math.PI / 2, { h: 5 + (k % 3) * 1.4, tilt: (k % 4) * 0.05 });
  }
  add("chest", 152, -48, rad(10), { id: "c_stones", loot: "stones" });

  /* ================================================================ Ember shrines (collectibles) */
  const SHRINES = [
    [1, -176, -164],
    [2, -380, 60],
    [3, 150, -60],
    [4, 382, 182],
    [5, -60, 330],
    [6, 96, -300],
  ];
  for (const [i, x, z] of SHRINES) add("shrine", x, z, rad(i * 50), { id: `shrine${i}` });

  /* ================================================================ Ashfall Ruins */
  const A0x = 262;
  const A1x = 338;
  const A0z = -18;
  const A1z = 58;
  const ruin = (k) => [0.95, 0.55, 0.8, 0.4, 0.9, 0.65][k % 6];
  wallRun(A0x, A0z, A1x, A0z, { pieces: 5, h: 9, t: 2.6, ruin, style: "ruin" });
  wallRun(A1x, A0z, A1x, A1z, { pieces: 5, h: 9, t: 2.6, ruin: (k) => ruin(k + 2), style: "ruin" });
  wallRun(A1x, A1z, A0x, A1z, { pieces: 5, h: 9, t: 2.6, ruin: (k) => ruin(k + 4), style: "ruin" });
  wallRun(A0x, A1z, A0x, 26, { pieces: 2, h: 9, t: 2.6, ruin, style: "ruin" });
  wallRun(A0x, 14, A0x, A0z, { pieces: 2, h: 9, t: 2.6, ruin: (k) => ruin(k + 1), style: "ruin" });
  for (const [x, z, roof] of [
    [A0x, A0z, "broken"],
    [A1x, A0z, "flat"],
    [A0x, A1z, "flat"],
    [A1x, A1z, "broken"],
  ])
    add("tower", x, z, 0, { r: 5, h: roof === "broken" ? 11 : 14, roof, style: "ruin" });
  add("gatehouse", A0x, 20, rad(90), { w: 12, h: 12, t: 6, gate: "ashgate", open: false, style: "ruin" });
  add("lever", A0x + 7, 28, rad(-90), { id: "ashlever" });
  add("ruinKeep", 306, 4, 0, { w: 26, d: 18, h: 14 });
  add("cryptHut", 320, 42, rad(180), { id: "cryptdoor" });
  add("trapdoor", 282, 46, 0, { id: "trapdoor" });
  for (const [x, z] of [
    [280, 4],
    [292, 40],
    [326, 20],
    [272, 30],
    [310, 30],
  ])
    add("brazier", x, z, 0, { lit: true, ember: true });
  for (const [x, z] of [
    [285, 15],
    [318, 52],
    [330, 0],
  ])
    add("rubble", x, z, rad(x));
  add("banner", 268, 14, rad(90), { color: "#2a1a1a", sigil: "ashen", h: 7 });
  add("banner", 268, 26, rad(90), { color: "#2a1a1a", sigil: "ashen", h: 7 });
  add("chest", 300, 0, 0, { id: "c_keep", loot: "keep" });
  // outside: the smugglers' grate under the south cliff, screened by boulders
  add("grate", 334, 104, rad(180), { id: "grate" });
  add("boulder", 328, 100, 0, { r: 2.6 });
  add("boulder", 341, 99, 0, { r: 2.2 });
  add("boulder", 344, 108, 0, { r: 3 });

  /* ================================================================ Ashfall Outpost (Wardens' forward camp) */
  add("tent", 200, 56, rad(200), { w: 5, d: 4, color: "#3a4e6e", style: "ridge" });
  add("tent", 212, 68, rad(240), { w: 5, d: 4, color: "#3a4e6e", style: "ridge" });
  add("campfire", 205, 64, 0, {});
  add("banner", 198, 66, 0, { color: "#2b4a7a", sigil: "wardens", h: 6 });

  /* ================================================================ Cinderpeak */
  const D = { x: 310, z: -330 };
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.13;
    const near = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.35;
    if (near) continue; // the path arrives from the south
    add("pillar", D.x + Math.cos(a) * 39, D.z + Math.sin(a) * 39, a, { h: 8 + (k % 3) * 3, broken: k % 2 === 0 });
  }
  add("altar", D.x, D.z - 6, 0, {});
  add("dragonSkull", D.x - 22, D.z - 20, rad(40), {});
  add("ballista", D.x - 20, D.z + 24, face(D.x - 20, D.z + 24, D.x, D.z), { id: "ballista1" });
  add("ballista", D.x + 22, D.z + 22, face(D.x + 22, D.z + 22, D.x, D.z), { id: "ballista2" });
  add("chest", D.x + 4, D.z - 30, rad(180), { id: "c_hoard", loot: "hoard" });
  // the Ashen Anchors binding the dragon, along the mountain path
  for (const [i, x, z] of [
    [1, 321.7, -107.2],
    [2, 284, -196],
    [3, 339.2, -252.3],
  ])
    add("anchor", x, z, 0, { id: `anchor${i}` });

  /* ================================================================ Ember Court Pavilion */
  const E = { x: 170, z: 250 };
  add("tent", E.x, E.z + 12, 0, { w: 16, d: 10, color: "#8a1c1c", style: "pavilion", id: "pavilion" });
  [
    [152, 238, "#a83a1c"],
    [188, 238, "#a83a1c"],
    [150, 262, "#c9a227"],
    [192, 262, "#c9a227"],
  ].forEach(([x, z, c]) => add("tent", x, z, face(x, z, E.x, E.z), { w: 6, d: 6, color: c, style: "round" }));
  for (const [x, z] of [
    [162, 244],
    [178, 244],
    [160, 256],
    [180, 256],
  ])
    add("brazier", x, z, 0, { lit: true, ember: true });
  add("banner", 164, 230, rad(180), { color: "#8a1c1c", sigil: "ember", h: 8 });
  add("banner", 176, 230, rad(180), { color: "#8a1c1c", sigil: "ember", h: 8 });
  add("stall", 186, 250, face(186, 250, E.x, E.z), { color: "#6a2a8a" });

  /* ================================================================ South march, east hills */
  add("tower", -120, 362, 0, { r: 4, h: 7, roof: "broken", style: "old" });
  add("chest", -116, 356, 0, { id: "c_south", loot: "south" });
  add("chest", 400, 120, rad(90), { id: "c_east", loot: "east" });
  add("chest", 60, -182, rad(-90), { id: "c_falls", loot: "falls" });

  /* ================================================================ bridges (roads × river) */
  const rv = T.river.pts;
  for (const R of T.roads) {
    for (let i = 0; i < R.pts.length - 1; i++) {
      const [ax, az] = R.pts[i];
      const [bx, bz] = R.pts[i + 1];
      for (let j = 0; j < rv.length - 1; j++) {
        const [cx, cz] = rv[j];
        const [dx, dz] = rv[j + 1];
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (Math.abs(den) < 1e-9) continue;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        if (S.some((e) => e.kind === "bridge" && Math.hypot(e.x - x, e.z - z) < 20)) continue;
        const dir = Math.atan2(bx - ax, bz - az);
        const len = T.river.w + 12;
        const fx = Math.sin(dir);
        const fz = Math.cos(dir);
        const yA = T.height(x - fx * len * 0.5, z - fz * len * 0.5);
        const yB = T.height(x + fx * len * 0.5, z + fz * len * 0.5);
        const deck = Math.max(yA, yB, T.waterAt(x, z) + 1.4) + 0.15;
        add("bridge", x, z, dir, { len, w: R.w + 1.6, deck, yA, yB });
      }
    }
  }
  return S;
}

/** Footprint radius used to keep trees and rocks off structures. */
export function footprint(e) {
  switch (e.kind) {
    case "house":
    case "hall":
    case "chapel":
    case "cabin":
    case "smithy":
    case "stable":
      return Math.hypot(e.w, e.d) * 0.5 + 3;
    case "keep":
    case "ruinKeep":
      return Math.hypot(e.w, e.d) * 0.5 + 4;
    case "wall":
      return e.len * 0.5 + 3;
    case "tower":
      return e.r + 4;
    case "gatehouse":
      return e.w * 0.6 + 6;
    case "tent":
      return Math.max(e.w, e.d) * 0.6 + 2;
    case "windmill":
      return 9;
    case "bridge":
      return e.len * 0.5 + 2;
    case "palisade":
    case "fence":
      return e.len * 0.5 + 1.5;
    case "pillar":
    case "monolith":
      return 3;
    default:
      return 3;
  }
}

export { smoothPath };
