/**
 * The static world, built once and shared (simulation, renderer, tests):
 * heightfield, structure layout, colliders/platforms, the scattered trees
 * and rocks, interiors and the navigation grid. Runtime state (gates open,
 * chests looted…) lives on the Game, which toggles gate colliders here.
 */
import { getTerrain } from "./terrain.js";
import { createCollisionWorld } from "./collide.js";
import { createNav } from "./nav.js";
import { buildLayout, footprint } from "../data/layout.js";
import { INTERIORS, LOCATIONS } from "../data/worldmap.js";
import { INTERIOR_MAPS, ICELL, IHEIGHT, cellsOf } from "../data/interiors.js";
import { rng, fbm, hash01 } from "./math.js";

let CACHE = null;

export function getWorld() {
  if (CACHE) return CACHE;
  const T = getTerrain();
  const col = createCollisionWorld();
  const layout = buildLayout(T);
  const interact = []; // {id, kind, x, y, z, r, ...}
  const lights = []; // torches/braziers for the renderer
  const keepout = [];

  /* ------------------------------------------------------------ structures */
  for (const e of layout) {
    const base = e.kind === "bridge" ? e.deck : groundUnder(T, e);
    e.y = base;
    const r = footprint(e);
    keepout.push([e.x, e.z, r]);
    addColliders(col, e, base);
    if (e.id) {
      const o = { id: e.id, kind: e.kind, x: e.x, y: base, z: e.z, rot: e.rot, e };
      // where to stand to use it (doors face away from their centre)
      const front = { cryptHut: 3.4, grate: 1.6, cage: 2.2, ballista: -1.6 }[e.kind];
      if (front) {
        o.ax = e.x + Math.sin(e.rot) * front;
        o.az = e.z + Math.cos(e.rot) * front;
      }
      interact.push(o);
    }
    if ((e.kind === "brazier" && e.lit) || e.kind === "campfire" || e.kind === "lamp") lights.push({ x: e.x, y: base + (e.kind === "lamp" ? 2.6 : 1.3), z: e.z, kind: e.kind, ember: !!e.ember, big: !!e.big });
  }

  // pickups rest on whatever is under them (the Mere jetty…)
  for (const o of interact) if (o.kind === "pickup") o.y = o.e.y = col.ground(o.x, o.z, 1e9);

  /* ------------------------------------------------------------ scatter */
  const kgrid = new Map();
  const KC = 16;
  for (const [x, z, r] of keepout)
    for (let i = Math.floor((x - r) / KC); i <= Math.floor((x + r) / KC); i++)
      for (let j = Math.floor((z - r) / KC); j <= Math.floor((z + r) / KC); j++) {
        const k = i * 10007 + j;
        if (!kgrid.has(k)) kgrid.set(k, []);
        kgrid.get(k).push([x, z, r]);
      }
  const blockedByStructure = (x, z, pad = 0) => {
    const a = kgrid.get(Math.floor(x / KC) * 10007 + Math.floor(z / KC));
    if (!a) return false;
    for (const [cx, cz, r] of a) if (Math.hypot(x - cx, z - cz) < r + pad) return true;
    return false;
  };
  // locations keep a clear patch too (spawn points, NPC spots)
  const clearings = LOCATIONS.filter((l) => l.safe || l.id === "wolfden" || l.id === "redhand" || l.id === "sanctum").map((l) => [l.x, l.z, l.id === "redhand" ? 32 : l.id === "sanctum" ? 58 : l.id === "wolfden" ? 18 : 14]);
  const R = rng(1337);
  const trees = [];
  const rocks = [];
  const STEP = 5;
  const lim = T.half - 14;
  for (let z = -lim; z < lim; z += STEP)
    for (let x = -lim; x < lim; x += STEP) {
      const px = x + (R() - 0.5) * STEP * 0.9;
      const pz = z + (R() - 0.5) * STEP * 0.9;
      const f = T.mask("forest", px, pz);
      const sn = T.mask("snow", px, pz);
      const ash = T.mask("ash", px, pz);
      const roll = R();
      const rockRoll = R();
      const slope = T.slope(px, pz);
      const B = Math.max(Math.abs(px), Math.abs(pz));
      if (T.mask("road", px, pz) > 0.05 || T.mask("wet", px, pz) > 0.25 || T.waterAt(px, pz) > -1e8 || T.mask("field", px, pz) > 0) continue;
      if (blockedByStructure(px, pz, 2) || clearings.some(([cx, cz, r]) => Math.hypot(px - cx, pz - cz) < r)) continue;
      const h = T.height(px, pz);
      // rocks: slopes, mountains, the odd boulder in the woods
      const pRock = 0.01 + Math.min(0.25, slope * 0.22) + (B > 420 ? 0.05 : 0);
      if (rockRoll < pRock && slope < 1.05) {
        const s = 0.6 + R() * (slope > 0.5 ? 2.6 : 1.6);
        rocks.push({ x: px, y: h - s * 0.25 - slope * s * 0.3, z: pz, s, rot: R() * 6.28, kind: R() < 0.5 ? 0 : 1, snow: sn, ash });
        if (s > 1) col.addCircle(px, pz, s * 0.85, h - 1, h + s * 1.3, { rock: true });
        continue;
      }
      if (slope > 0.8 || h > (sn > 0.45 ? 85 : 62)) continue;
      let p = 0.035 + f * 0.62;
      if (sn > 0.5) p = 0.08 + f * 0.4 + (h > 30 && h < 90 ? 0.18 : 0);
      if (ash > 0.5) p = 0.05;
      if (roll > p) continue;
      let type;
      if (ash > 0.5) type = "dead";
      else if (sn > 0.45) type = "pineSnow";
      else {
        const n = fbm(px / 50, pz / 50, 2, 202);
        type = f > 0.45 ? (n > 0.1 ? "pine" : n > -0.15 ? "oak" : "birch") : n > 0.2 ? "pine" : hash01(Math.round(px * 7 + pz), 3) < 0.6 ? "oak" : "birch";
      }
      const s = 0.8 + R() * 0.65;
      trees.push({ x: px, y: h, z: pz, s, rot: R() * 6.28, type, lean: (R() - 0.5) * 0.08 });
      col.addCircle(px, pz, (type === "oak" ? 0.55 : 0.4) * s, h - 1, h + 9 * s, { tree: true });
    }

  /* ------------------------------------------------------------ interiors */
  const interiors = {};
  for (const [id, I] of Object.entries(INTERIORS)) {
    const map = INTERIOR_MAPS[id];
    const rows = map.length;
    const cols = map[0].length;
    const at = (c, r) => ({ x: I.x + c * ICELL, z: I.z + r * ICELL });
    const isWall = (c, r) => r < 0 || c < 0 || r >= rows || c >= cols || map[r][c] === "#";
    // walls: merge horizontal runs into boxes
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        if (map[r][c] !== "#") {
          c++;
          continue;
        }
        let e = c;
        while (e + 1 < cols && map[r][e + 1] === "#") e++;
        const a = at(c, r);
        const b = at(e, r);
        col.addBox((a.x + b.x) / 2, a.z, ((e - c + 1) * ICELL) / 2, ICELL / 2, 0, -1, IHEIGHT + 1, { interior: id });
        c = e + 1;
      }
    }
    // floor + ceiling
    const cx = I.x + ((cols - 1) * ICELL) / 2;
    const cz = I.z + ((rows - 1) * ICELL) / 2;
    col.addPlatform(cx, cz, (cols * ICELL) / 2, (rows * ICELL) / 2, 0, 0, 0, { interior: id });
    col.addBox(cx, cz, (cols * ICELL) / 2, (rows * ICELL) / 2, 0, IHEIGHT, IHEIGHT + 1, { interior: id, ceiling: true });
    const seal = cellsOf(map, "G");
    if (seal.length) {
      const a = at(seal[0][0], seal[0][1]);
      const b = at(seal[seal.length - 1][0], seal[0][1]);
      col.addBox((a.x + b.x) / 2, a.z, ((seal.length) * ICELL) / 2, 0.6, 0, -1, IHEIGHT + 1, { gate: "seal" });
    }
    for (const [c, r] of cellsOf(map, "p")) {
      const p = at(c, r);
      col.addCircle(p.x, p.z, 0.8, -1, IHEIGHT + 1, { interior: id });
    }
    const pick = (ch) => cellsOf(map, ch).map(([c, r]) => ({ ...at(c, r), c, r }));
    const D = { ...I, map, rows, cols, at, isWall, arrive: pick("S")[0], exit: pick("X")[0], undead: pick("u"), boss: pick("H")[0], altar: pick("A")[0], braziers: pick("B"), chests: pick("c"), ladder: pick("T")[0], seal: pick("G"), pillars: pick("p") };
    interiors[id] = D;
    // interior interactables
    D.exit && interact.push({ id: `${id}_exit`, kind: "exitDoor", x: D.exit.x, y: 0, z: D.exit.z + ICELL * 0.3, interior: id });
    D.ladder && interact.push({ id: `${id}_ladder`, kind: "ladder", x: D.ladder.x, y: 0, z: D.ladder.z, interior: id });
    D.altar && interact.push({ id: "altar_heart", kind: "heartAltar", x: D.altar.x, y: 0, z: D.altar.z, interior: id });
    D.braziers.forEach((b, i) => {
      interact.push({ id: `cbrazier${i + 1}`, kind: "puzzleBrazier", x: b.x, y: 0, z: b.z, interior: id });
      col.addCircle(b.x, b.z, 0.7, -1, 1.4, { interior: id });
    });
    D.chests.forEach((c, i) => interact.push({ id: `c_${id}${i + 1}`, kind: "chest", x: c.x, y: 0, z: c.z, rot: 0, interior: id, e: { loot: id } }));
    // wall torches: every few wall cells that touch floor
    let n = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (map[r][c] === "#") continue;
        if ((c * 7 + r * 13) % 5 !== 0) continue;
        const dirs = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ];
        for (const [dc, dr] of dirs)
          if (isWall(c + dc, r + dr) && n++ % 2 === 0) {
            const p = at(c, r);
            lights.push({ x: p.x + dc * ICELL * 0.45, y: 3, z: p.z + dr * ICELL * 0.45, kind: "torch", interior: id, wall: [dc, dr] });
            break;
          }
      }
  }

  const nav = createNav(col, T, interiors);
  CACHE = { T, col, layout, trees, rocks, interact, interiors, lights, nav, byId: new Map(interact.map((o) => [o.id, o])) };
  return CACHE;
}

/** Lowest ground under a structure's footprint (so foundations never float). */
function groundUnder(T, e) {
  const r = Math.min(8, (e.w || e.len || e.r * 2 || 2) * 0.5);
  let lo = T.height(e.x, e.z);
  if (["house", "hall", "chapel", "cabin", "keep", "ruinKeep", "smithy", "stable", "tent", "gatehouse", "tower", "windmill", "cryptHut"].includes(e.kind))
    for (let a = 0; a < 8; a++) lo = Math.min(lo, T.height(e.x + Math.cos(a * 0.785) * r, e.z + Math.sin(a * 0.785) * r));
  return lo;
}

/** Colliders + platforms for one layout entry. */
function addColliders(col, e, y) {
  const { x, z, rot } = e;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  /** local (lx, lz) → world */
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const box = (lx, lz, hw, hd, y0, y1, o) => {
    const [wx, wz] = L(lx, lz);
    return col.addBox(wx, wz, hw, hd, rot, y0, y1, o);
  };
  const circ = (lx, lz, r, y0, y1, o) => {
    const [wx, wz] = L(lx, lz);
    return col.addCircle(wx, wz, r, y0, y1, o);
  };
  switch (e.kind) {
    case "house":
    case "hall":
    case "chapel":
    case "cabin":
    case "keep":
      box(0, 0, e.w / 2, e.d / 2, y - 3, y + (e.h || 4) * (e.floors || 1) + 8);
      if (e.kind === "chapel") box(0, -e.d / 2 + 2, 2, 2, y - 3, y + 16);
      break;
    case "smithy":
    case "stable":
      box(0, -e.d / 4, e.w / 2, e.d / 4, y - 3, y + 5);
      circ(-e.w / 2 + 0.3, e.d / 2 - 0.3, 0.25, y - 1, y + 4);
      circ(e.w / 2 - 0.3, e.d / 2 - 0.3, 0.25, y - 1, y + 4);
      break;
    case "ruinKeep": {
      const t = 1.8;
      const gap = 6;
      box(0, -e.d / 2, e.w / 2, t / 2, y - 3, y + e.h);
      box(-e.w / 2, 0, t / 2, e.d / 2, y - 3, y + e.h * 0.7);
      box(e.w / 2, 0, t / 2, e.d / 2, y - 3, y + e.h * 0.85);
      const side = (e.w - gap) / 4;
      box(-(gap / 2 + side), e.d / 2, side, t / 2, y - 3, y + e.h * 0.5);
      box(gap / 2 + side, e.d / 2, side, t / 2, y - 3, y + e.h * 0.6);
      break;
    }
    case "stall":
      box(0, 0.6, 1.6, 0.5, y - 1, y + 1.1);
      break;
    case "well":
      circ(0, 0, 1.35, y - 1, y + 1.05);
      break;
    case "statue":
      circ(0, 0, e.big ? 2.6 : 1.5, y - 1, y + (e.big ? 7 : 4));
      break;
    case "windmill":
      circ(0, 0, 4.4, y - 2, y + 14);
      break;
    case "watchtowerWood":
      circ(0, 0, 2, y - 1, y + 9);
      break;
    case "fence":
      box(0, 0, e.len / 2, 0.12, y - 1, y + (e.h || 1.1));
      break;
    case "palisade":
      box(0, 0, e.len / 2 + 0.2, 0.45, y - 2, y + 3.6);
      break;
    case "wall": {
      const h = e.h * (e.ruin ?? 1);
      box(0, 0, e.len / 2 + 0.1, e.t / 2, y - 4, y + h);
      break;
    }
    case "tower":
      circ(0, 0, e.r, y - 4, y + e.h);
      break;
    case "gatehouse": {
      const open = 6;
      const side = (e.w - open) / 2;
      box(-(open / 2 + side / 2), 0, side / 2, e.t / 2, y - 4, y + e.h);
      box(open / 2 + side / 2, 0, side / 2, e.t / 2, y - 4, y + e.h);
      box(0, 0, open / 2, e.t / 2, y + 5.6, y + e.h); // arch (camera only)
      box(0, 0, open / 2, 0.45, y - 2, y + 5.8, { gate: e.gate });
      if (e.open) col.setGate(e.gate, false);
      break;
    }
    case "cryptHut":
      box(0, 0, 2.6, 2.6, y - 2, y + 4.5);
      break;
    case "stairs":
      col.addPlatform(x, z, e.w / 2, e.d / 2, rot + Math.PI, y, y + e.h);
      break;
    case "tent":
      box(0, 0, e.w / 2, e.d / 2, y - 1, y + (e.style === "pavilion" ? 6 : 3));
      break;
    case "cage":
      box(0, 0, 1.2, 1.2, y - 1, y + 2.4);
      break;
    case "rack":
    case "logpile":
    case "cart":
    case "hay":
      box(0, 0, e.kind === "cart" ? 1.4 : 1.1, e.kind === "cart" ? 0.9 : 0.6, y - 1, y + 1.6);
      break;
    case "crate":
    case "barrel":
    case "anvil":
    case "dummy":
    case "scarecrow":
    case "lamp":
    case "banner":
    case "signpost":
    case "lever":
      circ(0, 0, e.kind === "crate" ? 0.55 : e.kind === "barrel" ? 0.45 : 0.25, y - 1, y + (e.kind === "banner" ? e.h : 1.8));
      break;
    case "brazier":
      circ(0, 0, 0.55, y - 1, y + 1.3);
      break;
    case "boulder":
      circ(0, 0, e.r * 0.9, y - 2, y + e.r * 1.4);
      break;
    case "caveMouth":
      circ(-3.5, 0, 2.6, y - 2, y + 6);
      circ(3.5, 0, 2.6, y - 2, y + 6);
      box(0, -2.5, 6, 1.5, y - 2, y + 8);
      break;
    case "monolith":
      box(0, 0, 0.7, 0.45, y - 2, y + e.h);
      break;
    case "pillar":
      circ(0, 0, 1.5, y - 2, y + e.h);
      break;
    case "altar":
      box(0, 0, 2.2, 1.4, y - 1, y + 1.2);
      break;
    case "dragonSkull":
      circ(0, 0, 3.6, y - 1, y + 4.5);
      break;
    case "ballista":
      circ(0, 0, 1.4, y - 1, y + 1.8);
      break;
    case "anchor":
      circ(0, 0, 1.1, y - 1, y + 5, { anchor: e.id });
      break;
    case "shrine":
      circ(0, 0, 0.8, y - 1, y + 2.2);
      break;
    case "chest":
      box(0, 0, 0.6, 0.42, y - 0.5, y + 0.8);
      break;
    case "oreNode":
      circ(0, 0, 1, y - 1, y + 1.4);
      break;
    case "mineEntrance":
      box(0, -2, 5, 2, y - 2, y + 7);
      break;
    case "rubble":
      circ(0, 0, 2, y - 1, y + 1.3);
      break;
    case "dock": {
      const T = getTerrain();
      const lake = T.lakes.find((l) => l.id === "mere");
      const [wx, wz] = L(0, 5);
      col.addPlatform(wx, wz, 1.3, 6, rot, lake.surf + 0.45, lake.surf + 0.45);
      e.deckY = lake.surf + 0.45;
      break;
    }
    case "bridge": {
      const ramp = 5;
      const mid = e.len / 2 - ramp;
      col.addPlatform(x, z, e.w / 2, mid, rot, e.deck, e.deck);
      const [ax, az] = L(0, -(mid + ramp / 2));
      const [bx, bz] = L(0, mid + ramp / 2);
      col.addPlatform(ax, az, e.w / 2, ramp / 2, rot, e.yA, e.deck);
      col.addPlatform(bx, bz, e.w / 2, ramp / 2, rot, e.deck, e.yB);
      box(-e.w / 2, 0, 0.15, mid, e.deck, e.deck + 1.1);
      box(e.w / 2, 0, 0.15, mid, e.deck, e.deck + 1.1);
      break;
    }
    default:
      break;
  }
}
