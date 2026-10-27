/**
 * Oceanbound — the game simulation. Pure JS, deterministic from its seed
 * (apart from the RNG stream), no DOM / Three.js: the renderer and the UI
 * read G; the input layer feeds tick(G, intent, dt).
 *
 * Intent (one frame):
 *   mx, my          strafe / forward  (-1..1)
 *   lookX, lookY    yaw / pitch delta (rad)
 *   jump, jumpPressed, sprint, dive
 *   use, usePressed, useReleased    (left mouse / tool button)
 *   alt             right mouse / remove (pressed)
 *   interact        E (pressed)
 *   rotate          R (pressed)
 *   slot            0..7 hotbar select (or null), wheel (±1)
 */
import { ITEMS, RECIPES, RECIPE_BY_ID, PIECES, PLACEABLE, STATIONS, FUELS, CRATE_LOOT, REPAIR_COST, itemName } from "../data/items.js";
import { OBJECTIVES, LOG_PAGES } from "../data/objectives.js";
import { createInv, addItem, countItem, hasCost, missing, removeItem, payCost, invToJSON, invFromJSON, spaceFor, BAG_SLOTS, HOTBAR, CHEST_SLOTS, newStack } from "./inventory.js";
import { createRaft, buildColliders, canPlace, addPiece, canRemove, removePiece, raftToJSON, raftFromJSON, CELL, WALL_H, FOUNDATION_HP, dependents, cellKey, edgeBox, objBox, bounds, stairsDir, pieceKind } from "./raft.js";
import { createPlayer, stepPlayer, lookDir, eyePos, climbSpot, startClimb, overRaft, EYE, PR } from "./player.js";
import { createWorld, islandsNear, islandNodes, groundHeight, currentAt, reefsNear, reefNodes, NODE_INFO, islandZone, ISLAND_TYPES } from "./islands.js";
import { createShark, stepShark, hitShark, sharkSpheres } from "./shark.js";
import { waveHeight, waveSlope } from "./waves.js";
import { rng, clamp, damp, TAU } from "./util.js";

export const SAVE_VERSION = 1;
export const DAY_SEC = 960; // one in-game day = 16 minutes
const START_HOUR = 7.2;
const REACH = 3.0;
const MAX_HOOKED = 5;

/* ------------------------------------------------------------------ creation */
export function createGame({ seed = (Math.random() * 2 ** 32) >>> 0, difficulty = "normal" } = {}) {
  const G = {
    seed: seed >>> 0,
    difficulty,
    r: rng(seed ^ 0x51ed),
    t: 0,
    day: 1,
    clock: START_HOUR,
    world: createWorld(seed),
    raft: createRaft(),
    player: createPlayer(),
    inv: createInv(BAG_SLOTS),
    sel: 0,
    stats: { hp: 100, hunger: 100, thirst: 100, stamina: 100, oxygen: 100 },
    staminaLock: 0,
    debris: [],
    debrisId: 1,
    hook: { state: "idle", charge: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, items: [] },
    rod: { state: "idle", charge: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, bite: 0 },
    swing: null,
    use: { kind: null, t: 0 },
    build: { piece: "foundation", rot: 0, ghost: null, target: null },
    shark: null,
    stat: { collected: {}, crafted: {}, built: {}, placed: {}, found: { palm: 0, rocky: 0, jungle: 0 }, explored: { palm: 0, rocky: 0, jungle: 0 }, fish: 0, cooked: 0, drank: 0, ateCooked: 0, repelled: 0, killed: 0, chopped: 0, ingots: 0, seawater: 0, deaths: 0, distance: 0 },
    done: new Set(),
    unlocked: new Set(),
    islandState: {},
    found: {},
    pages: [],
    satchel: null,
    dead: null,
    events: [],
    feed: [],
    feedId: 1,
    target: null,
    prompt: null,
    reading: null,
    invVersion: 1,
    timers: { obj: 0, disc: 0, respawn: 0, debris: 0, save: 0 },
    aboard: true,
    raftDelta: [0, 0, 0],
    currentIsland: null,
    warn: null,
  };
  G.shark = createShark(G.r);
  for (const r of RECIPES) if (r.start) G.unlocked.add(r.id);
  for (const k in PIECES) if (PIECES[k].start) G.unlocked.add(k);
  // starting kit: the hook in slot 1
  G.inv.slots[0] = newStack("hook", 1);
  G.player.x = G.raft.x - 0.2;
  G.player.z = G.raft.z + 0.3;
  G.player.y = G.raft.y;
  G.player.onRaftFrame = true;
  G.player.grounded = true;
  G.player.ground = "raft";
  bindHelpers(G);
  buildColliders(G.raft);
  seedDebris(G, true);
  return G;
}

function bindHelpers(G) {
  G.hurt = (dmg, cause) => hurt(G, dmg, cause);
  G.destroyFoundation = (i, j) => destroyFoundation(G, i, j);
  G.onSharkKilled = (S) => {
    for (let k = 0; k < 2; k++) spawnDebris(G, "cargo", S.x + (k - 0.5) * 1.2, S.z + 0.6, [["shark_raw", 2]]);
  };
}

/* ------------------------------------------------------------------ feed / helpers */
export function note(G, text, item = null, n = 0, tone = "info") {
  const last = G.feed[G.feed.length - 1];
  if (item && last && last.item === item && G.t - last.t < 1.6 && last.tone === tone) {
    last.n += n;
    last.t = G.t;
    last.text = `+${last.n} ${itemName(item)}`;
    return;
  }
  G.feed.push({ id: G.feedId++, text, item, n, t: G.t, tone });
  if (G.feed.length > 6) G.feed.shift();
}
function give(G, id, n, silent = false) {
  const left = addItem(G.inv, id, n, ITEMS[id]?.kind === "tool");
  const got = n - left;
  if (got > 0) {
    G.stat.collected[id] = (G.stat.collected[id] || 0) + got;
    if (!silent) note(G, `+${got} ${itemName(id)}`, id, got, "gain");
    G.invVersion++;
  }
  if (left > 0) note(G, "Inventory full", null, 0, "bad");
  return left;
}
function canFit(G, list) {
  // list: [[id, n]]
  const tmp = { slots: G.inv.slots.map((s) => (s ? { ...s } : null)) };
  for (const [id, n] of list) if (addItem(tmp, id, n) > 0) return false;
  return true;
}
export const equipped = (G) => G.inv.slots[G.sel];
function hurt(G, dmg, cause) {
  if (G.dead || dmg <= 0) return;
  G.stats.hp -= dmg;
  // slow damage (hunger, thirst, drowning) is reported in chunks, not every frame
  if (dmg >= 1) G.events.push({ t: "hurt", dmg, cause });
  else {
    G.hurtAcc = (G.hurtAcc || 0) + dmg;
    if (G.hurtAcc >= 4) {
      G.events.push({ t: "hurt", dmg: G.hurtAcc, cause, slow: true });
      G.hurtAcc = 0;
    }
  }
  if (G.stats.hp <= 0) die(G, cause);
}
function useDur(G, slot) {
  const s = G.inv.slots[slot];
  if (!s || s.dur == null) return;
  s.dur--;
  if (s.dur <= 0) {
    G.inv.slots[slot] = null;
    note(G, `Your ${itemName(s.id)} broke!`, s.id, 0, "bad");
    G.events.push({ t: "toolBreak" });
  }
  G.invVersion++;
}

/* ------------------------------------------------------------------ debris */
const DEBRIS_W = [
  ["plank", 0.35],
  ["plastic", 0.27],
  ["leaf", 0.15],
  ["scrap", 0.11],
  ["barrel", 0.12],
];
function pickDebris(G) {
  let u = G.r();
  for (const [k, w] of DEBRIS_W) {
    if ((u -= w) <= 0) return k;
  }
  return "plank";
}
function spawnDebris(G, kind, x, z, items = null) {
  const d = { id: G.debrisId++, kind, x, z, rot: G.r() * TAU, spin: (G.r() - 0.5) * 0.3, ph: G.r() * TAU, hooked: false, items };
  G.debris.push(d);
  return d;
}
function seedDebris(G, initial) {
  const R = G.raft;
  if (initial) {
    // a few pieces close by so the player can start hooking immediately
    for (let k = 0; k < 12; k++) {
      const a = G.r() * TAU;
      const d = 7 + G.r() * 16;
      const x = R.x + Math.cos(a) * d + 6;
      const z = R.z + Math.sin(a) * d;
      spawnDebris(G, k < 5 ? "plank" : k < 8 ? "plastic" : k < 10 ? "leaf" : pickDebris(G), x, z);
    }
  }
  const moving = Math.hypot(R.vx, R.vz) > 0.2;
  const want = moving ? 46 : 20;
  const fx = moving ? R.vx / Math.hypot(R.vx, R.vz) : 1;
  const fz = moving ? R.vz / Math.hypot(R.vx, R.vz) : 0;
  let tries = 0;
  while (G.debris.length < want && tries++ < 30) {
    let x;
    let z;
    if (moving) {
      const ahead = 34 + G.r() * 56;
      const side = (G.r() - 0.5) * 50;
      x = R.x + fx * ahead - fz * side;
      z = R.z + fz * ahead + fx * side;
    } else {
      const a = G.r() * TAU;
      const d = 24 + G.r() * 36;
      x = R.x + Math.cos(a) * d;
      z = R.z + Math.sin(a) * d;
    }
    if (groundHeight(G.world, x, z) > -2.5) continue;
    spawnDebris(G, pickDebris(G), x, z);
  }
}
function debrisLoot(G, d) {
  if (d.items) return d.items.map((e) => [...e]);
  if (d.kind === "barrel") {
    const out = [];
    for (const [id, a, b, p] of CRATE_LOOT) if (G.r() < p) out.push([id, a + Math.floor(G.r() * (b - a + 1))]);
    if (!out.length) out.push(["plank", 3]);
    return out;
  }
  if (d.kind === "leaf") return [["leaf", G.r() < 0.4 ? 2 : 1]];
  return [[d.kind, d.kind === "plank" && G.r() < 0.25 ? 2 : 1]];
}
function collectDebris(G, d) {
  const loot = debrisLoot(G, d);
  if (!canFit(G, loot)) {
    note(G, "Inventory full", null, 0, "bad");
    return false;
  }
  for (const [id, n, dur] of loot) {
    give(G, id, n);
    if (dur != null) {
      // restore tool wear from a dropped satchel
      for (const s of G.inv.slots) if (s && s.id === id && s.dur === ITEMS[id].tool?.dur) {
        s.dur = dur;
        break;
      }
    }
  }
  G.events.push({ t: "collect", kind: d.kind });
  G.debris.splice(G.debris.indexOf(d), 1);
  return true;
}
function stepDebris(G, dt) {
  const R = G.raft;
  const [cx, cz] = currentAt(G.world, R.x, R.z);
  const nets = [...R.pieces.values()].filter((p) => p.type === "net");
  for (let k = G.debris.length - 1; k >= 0; k--) {
    const d = G.debris[k];
    d.rot += d.spin * dt;
    if (d.hooked) continue;
    d.x += cx * 0.12 * dt;
    d.z += cz * 0.12 * dt;
    // debris meeting the raft slides along its sides (nets catch it)
    const lx = d.x - R.x;
    const lz = d.z - R.z;
    for (const n of nets) {
      const b = edgeBox(n, 0.2);
      const ox = n.side === "x" ? n.out * 0.75 : 0;
      const oz = n.side === "z" ? n.out * 0.75 : 0;
      const mx = (b.x0 + b.x1) / 2 + ox;
      const mz = (b.z0 + b.z1) / 2 + oz;
      const hx = n.side === "x" ? 0.8 : CELL / 2 + 0.1;
      const hz = n.side === "z" ? 0.8 : CELL / 2 + 0.1;
      if (Math.abs(lx - mx) < hx && Math.abs(lz - mz) < hz) {
        const tot = Object.values(n.state.items).reduce((a, b2) => a + b2, 0);
        if (tot < 14) {
          for (const [id, c] of debrisLoot(G, d)) n.state.items[id] = (n.state.items[id] || 0) + c;
          G.debris.splice(k, 1);
          G.events.push({ t: "netCatch", x: d.x, z: d.z });
          break;
        }
      }
    }
    if (G.debris[k] !== d) continue;
    const c = overRaft(G, d.x, d.z, 0.35);
    if (c) {
      const ccx = (c.i + 0.5) * CELL;
      const ccz = (c.j + 0.5) * CELL;
      let px = lx - ccx;
      let pz = lz - ccz;
      const L = Math.hypot(px, pz) || 1;
      d.x += (px / L) * 2.2 * dt + R.vx * dt;
      d.z += (pz / L) * 2.2 * dt + R.vz * dt;
    }
  }
  G.timers.debris -= dt;
  if (G.timers.debris <= 0) {
    G.timers.debris = 0.6;
    for (let k = G.debris.length - 1; k >= 0; k--) {
      const d = G.debris[k];
      if (d.hooked || d.items) {
        if (d.items && Math.hypot(d.x - R.x, d.z - R.z) > 400) G.debris.splice(k, 1);
        continue;
      }
      if (Math.hypot(d.x - R.x, d.z - R.z) > 100) G.debris.splice(k, 1);
    }
    seedDebris(G, false);
  }
}

/* ------------------------------------------------------------------ raft motion */
function stepRaft(G, dt) {
  const R = G.raft;
  const isl = islandsNear(G.world, R.x, R.z, 220);
  let [tvx, tvz] = currentAt(G.world, R.x, R.z, isl);
  const sails = [...R.pieces.values()].filter((p) => p.type === "sail").length;
  if (R.sail.open && sails > 0) {
    const sp = 1.9 * (1 + 0.28 * (Math.min(sails, 4) - 1));
    tvx = tvx * 0.3 + Math.sin(R.sail.heading) * -sp;
    tvz = tvz * 0.3 + Math.cos(R.sail.heading) * -sp;
  } else if (R.sail.open) R.sail.open = false;
  const hasAnchor = [...R.pieces.values()].some((p) => p.type === "anchor");
  if (!hasAnchor) R.anchored = false;
  if (R.anchored) {
    tvx = 0;
    tvz = 0;
  }
  const k = Math.min(1, (R.anchored ? 1.4 : 0.45) * dt);
  R.vx += (tvx - R.vx) * k;
  R.vz += (tvz - R.vz) * k;
  let nx = R.x + R.vx * dt;
  let nz = R.z + R.vz * dt;
  const blocked = (x, z) => {
    for (const c of R.cells.values()) {
      const h = groundHeight(G.world, x + (c.i + 0.5) * CELL, z + (c.j + 0.5) * CELL, isl);
      if (h > -0.85) return true;
    }
    return false;
  };
  R.aground = false;
  if ((R.vx || R.vz) && blocked(nx, nz)) {
    if (!blocked(nx, R.z)) nz = R.z;
    else if (!blocked(R.x, nz)) nx = R.x;
    else {
      nx = R.x;
      nz = R.z;
    }
    R.vx = (nx - R.x) / dt;
    R.vz = (nz - R.z) / dt;
    R.aground = true;
  }
  const dx = nx - R.x;
  const dz = nz - R.z;
  G.stat.distance += Math.hypot(dx, dz);
  R.x = nx;
  R.z = nz;
  // bob: average sea level over the footprint
  const b = bounds(R);
  let h = 0;
  const pts = [
    [b.cx, b.cz],
    [b.x0, b.z0],
    [b.x1, b.z0],
    [b.x0, b.z1],
    [b.x1, b.z1],
  ];
  for (const [px, pz] of pts) h += waveHeight(R.x + px, R.z + pz, G.t);
  h /= pts.length;
  const ny = damp(R.y, h + 0.3, 3.2, dt);
  const dy = ny - R.y;
  R.y = ny;
  // cosmetic rocking (smaller for bigger rafts)
  const [sx, sz] = waveSlope(R.x + b.cx, R.z + b.cz, G.t);
  const scale = 1 / (1 + b.r * 0.12);
  R.pitch = damp(R.pitch || 0, -sz * 0.5 * scale, 2, dt);
  R.roll = damp(R.roll || 0, sx * 0.5 * scale, 2, dt);
  G.raftDelta[0] = dx;
  G.raftDelta[1] = dy;
  G.raftDelta[2] = dz;
  if (R.colVersion !== R.version) buildColliders(R);
}

/* ------------------------------------------------------------------ raycasts */
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o[0] - cx;
  const oy = o[1] - cy;
  const oz = o[2] - cz;
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : c < 0 ? 0 : Infinity;
}
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0;
  let tmax = Infinity;
  const lo = [x0, y0, z0];
  const hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo[a] || o[a] > hi[a]) return Infinity;
      continue;
    }
    let t1 = (lo[a] - o[a]) / d[a];
    let t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
function rayCyl(o, d, cx, cz, r, y0, y1) {
  const ox = o[0] - cx;
  const oz = o[2] - cz;
  const a = d[0] * d[0] + d[2] * d[2];
  if (a < 1e-9) return Infinity;
  const b = ox * d[0] + oz * d[2];
  const c = ox * ox + oz * oz - r * r;
  const h = b * b - a * c;
  if (h < 0) return Infinity;
  let t = (-b - Math.sqrt(h)) / a;
  if (t < 0) t = c < 0 ? 0 : Infinity;
  const y = o[1] + d[1] * t;
  return y >= y0 && y <= y1 ? t : Infinity;
}
/** first hit of the ray with the sea surface (within maxT) */
export function rayWater(G, o, d, maxT = 30) {
  if (d[1] > -0.02) return null;
  let t = (o[1] - 0) / -d[1];
  for (let k = 0; k < 4; k++) {
    const x = o[0] + d[0] * t;
    const z = o[2] + d[2] * t;
    const h = waveHeight(x, z, G.t);
    t = (o[1] - h) / -d[1];
  }
  if (t < 0 || t > maxT) return null;
  return { t, x: o[0] + d[0] * t, y: o[1] + d[1] * t, z: o[2] + d[2] * t };
}

function nodeShape(n) {
  const y = n.y;
  switch (n.type) {
    case "palm":
      return { cyl: [0.42, y, y + 4.2] };
    case "jtree":
      return { cyl: [0.6, y, y + 4.5] };
    case "bamboo":
      return { cyl: [0.55, y, y + 4] };
    case "mango":
      return { cyl: [1.3, y + 0.4, y + 4.4] };
    case "vine":
      return { cyl: [0.5, y + 0.2, y + 3.4] };
    case "boulder":
      return { sph: [y + 0.45, 1.05 * n.s] };
    case "bush":
      return { sph: [y + 0.45, 0.75] };
    case "crate":
      return { sph: [y + 0.38, 0.55] };
    case "page":
      return { sph: [y + 0.12, 0.38] };
    case "clay":
      return { sph: [y + 0.1, 0.55] };
    case "driftwood":
      return { sph: [y + 0.12, 0.6] };
    default:
      return { sph: [y + 0.15, 0.42] };
  }
}
const INTERACT_NODES = new Set(["palm", "jtree", "bamboo", "boulder", "mango", "bush", "vine", "stone", "coconut", "clay", "driftwood", "scrap", "crate", "page"]);
function nodeGone(G, ownerId, nodeId) {
  const st = G.islandState[ownerId];
  return !!(st && st.gone && st.gone[nodeId] != null);
}
function nodeOwners(G, x, z) {
  const out = [];
  for (const I of islandsNear(G.world, x, z, 40)) {
    if (Math.hypot(I.x - x, I.z - z) > I.r * 1.6 + 8) continue;
    out.push({ owner: I, nodes: islandNodes(G.world, I) });
  }
  for (const Rf of reefsNear(G.world, x, z, 20)) out.push({ owner: Rf, nodes: reefNodes(Rf) });
  return out;
}

/** what the crosshair points at (within reach) */
function computeTarget(G) {
  const P = G.player;
  const o = eyePos(P);
  const d = lookDir(P);
  const R = G.raft;
  let best = null;
  const consider = (t, obj) => {
    if (t < (best ? best.dist : REACH)) best = { ...obj, dist: t };
  };
  // raft pieces & foundations (in raft-local space)
  const lo = [o[0] - R.x, o[1] - R.y, o[2] - R.z];
  let wallT = Infinity;
  for (const c of R.colliders) {
    const t = rayBox(lo, d, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
    if (!(t < REACH + 3)) continue;
    if (c.ref === "cell") consider(t, { kind: "cell", i: c.i, j: c.j });
    else {
      const p = R.pieces.get(c.ref);
      if (p) consider(t, { kind: "piece", id: p.id });
      if (p && !c.deck) wallT = Math.min(wallT, t);
    }
  }
  // edge gear (nets / traps) sits outside the colliders
  for (const p of R.pieces.values()) {
    if (p.type !== "net" && p.type !== "trap") continue;
    const b = edgeBox(p, 0.3);
    const ox = p.side === "x" ? p.out * 0.55 : 0;
    const oz = p.side === "z" ? p.out * 0.55 : 0;
    const t = rayBox(lo, d, b.x0 + ox - 0.35, -0.6, b.z0 + oz - 0.35, b.x1 + ox + 0.35, 0.7, b.z1 + oz + 0.35);
    consider(t, { kind: "piece", id: p.id });
  }
  // floating debris
  for (const dbr of G.debris) {
    if (dbr.hooked) continue;
    if (Math.abs(dbr.x - o[0]) > 4 || Math.abs(dbr.z - o[2]) > 4) continue;
    const t = raySphere(o, d, dbr.x, waveHeight(dbr.x, dbr.z, G.t) + 0.05, dbr.z, dbr.kind === "barrel" || dbr.kind === "cargo" ? 0.6 : 0.5);
    if (t < wallT) consider(t, { kind: "debris", id: dbr.id });
  }
  // satchel
  if (G.satchel) {
    const S = G.satchel;
    const sy = S.float ? waveHeight(S.x, S.z, G.t) + 0.1 : S.y + 0.25;
    const t = raySphere(o, d, S.x, sy, S.z, 0.6);
    if (t < wallT) consider(t, { kind: "satchel" });
  }
  // island + reef nodes
  for (const { owner, nodes } of nodeOwners(G, P.x, P.z)) {
    for (const n of nodes) {
      if (!INTERACT_NODES.has(n.type)) continue;
      if (Math.abs(n.x - o[0]) > 6 || Math.abs(n.z - o[2]) > 6) continue;
      if (nodeGone(G, owner.id, n.id)) continue;
      if (n.type === "mango" && G.islandState[owner.id]?.fruit?.[n.id] != null) {
        // fruit picked: tree still choppable? no — mango trees are fruit-only
        continue;
      }
      const sh = nodeShape(n);
      const t = sh.cyl ? rayCyl(o, d, n.x, n.z, sh.cyl[0], sh.cyl[1], sh.cyl[2]) : raySphere(o, d, n.x, sh.sph[0], n.z, sh.sph[1]);
      if (t < wallT) consider(t, { kind: "node", owner: owner.id, node: n.id, type: n.type });
    }
  }
  // terrain occludes (march)
  if (best && best.kind === "node") {
    for (let s = 0.4; s < best.dist - 0.3; s += 0.35) {
      const x = o[0] + d[0] * s;
      const y = o[1] + d[1] * s;
      const z = o[2] + d[2] * s;
      if (groundHeight(G.world, x, z) > y + 0.05) {
        best = null;
        break;
      }
    }
  }
  return best;
}

function findNode(G, ownerId, nodeId) {
  const I = G.world.islands.get(ownerId) || G.world.reefs.get(ownerId);
  if (!I) return null;
  const nodes = I.nodes || (G.world.islands.has(ownerId) ? islandNodes(G.world, I) : reefNodes(I));
  return nodes[nodeId] || null;
}
function islandSt(G, id) {
  return (G.islandState[id] ||= { gone: {}, hits: {}, fruit: {} });
}

/* ------------------------------------------------------------------ interaction prompts */
function fuelItem(G) {
  for (const f of FUELS) if (countItem(G.inv, f) > 0) return f;
  return null;
}
function rawFoodItem(G) {
  const eq = equipped(G);
  if (eq && ITEMS[eq.id]?.cook) return eq.id;
  for (const s of G.inv.slots) if (s && ITEMS[s.id]?.cook) return s.id;
  return null;
}

/** prompt for the current target: { key, text, ok, alt? } */
function describe(G, T) {
  const eq = equipped(G);
  const eqId = eq?.id;
  if (!T) return null;
  if (T.kind === "debris") {
    const d = G.debris.find((x) => x.id === T.id);
    if (!d) return null;
    const label = d.kind === "barrel" ? "Supply Barrel" : d.kind === "cargo" ? (d.items?.[0]?.[0] === "shark_raw" ? "Shark Meat" : "Floating Crate") : itemName(d.kind);
    return { key: "E", text: `Grab ${label}` };
  }
  if (T.kind === "satchel") return { key: "E", text: "Recover your lost satchel" };
  if (T.kind === "cell") {
    const c = G.raft.cells.get(cellKey(T.i, T.j));
    if (!c) return null;
    if (eqId === "hammer" && c.hp < FOUNDATION_HP) return { key: "E", text: `Repair foundation (${Math.round(c.hp)}%)`, cost: REPAIR_COST, ok: hasCost(G.inv, REPAIR_COST) };
    if (c.hp < FOUNDATION_HP * 0.6) return { key: "", text: `Damaged foundation (${Math.round(c.hp)}%) — repair with the hammer`, ok: false, info: true };
    return null;
  }
  if (T.kind === "piece") {
    const p = G.raft.pieces.get(T.id);
    if (!p) return null;
    const s = p.state;
    switch (p.type) {
      case "door":
        return { key: "E", text: s.open ? "Close door" : "Open door" };
      case "chest":
        return { key: "E", text: "Open Storage Chest" };
      case "purifier":
      case "purifier2": {
        const def = STATIONS[p.type];
        if (s.fresh > 0) return countItem(G.inv, "cup_empty") > 0 ? { key: "E", text: `Collect fresh water (${s.fresh} ready)` } : { key: "", text: "Fresh water ready — bring an empty cup", info: true, ok: false };
        if (s.water + s.fresh < def.cups && countItem(G.inv, "cup_salt") > 0) {
          if (def.fuel && !fuelItem(G)) return { key: "", text: "Needs fuel (leaf, plank, bamboo or log)", ok: false, info: true };
          return { key: "E", text: def.fuel ? `Pour seawater (uses 1 ${itemName(fuelItem(G))})` : "Pour seawater" };
        }
        if (s.water > 0) return { key: "", text: `Purifying… ${Math.round((s.t / def.time) * 100)}%`, info: true, progress: s.t / def.time };
        return { key: "", text: "Purifier — fill a cup with seawater first", info: true, ok: false };
      }
      case "grill":
      case "grill2": {
        const def = STATIONS[p.type];
        const ready = s.items.filter((x) => x.done).length;
        if (ready) return { key: "E", text: `Take ${itemName(s.items.find((x) => x.done).id)}` };
        const raw = rawFoodItem(G);
        if (s.items.length < def.slots && raw) {
          if (def.fuel && !fuelItem(G)) return { key: "", text: "Needs fuel (leaf, plank, bamboo or log)", info: true, ok: false };
          return { key: "E", text: `Cook ${itemName(raw)}` };
        }
        if (s.items.length) {
          const it = s.items[0];
          return { key: "", text: `Cooking… ${Math.round((it.t / def.time) * 100)}%`, info: true, progress: it.t / def.time };
        }
        return { key: "", text: "Grill — needs raw fish or shark meat", info: true, ok: false };
      }
      case "smelter": {
        const def = STATIONS.smelter;
        if (s.ingots > 0) return { key: "E", text: `Take ${s.ingots} Metal Ingot${s.ingots > 1 ? "s" : ""}` };
        if (s.ore < 3 && countItem(G.inv, "metal_ore") > 0) {
          if (!fuelItem(G)) return { key: "", text: "Needs fuel to smelt", info: true, ok: false };
          return { key: "E", text: `Smelt metal ore (uses 1 ${itemName(fuelItem(G))})` };
        }
        if (s.ore > 0) return { key: "", text: `Smelting… ${Math.round((s.t / def.time) * 100)}% (${s.ore} ore)`, info: true, progress: s.t / def.time };
        return { key: "", text: "Smelter — needs metal ore", info: true, ok: false };
      }
      case "net": {
        const tot = Object.values(s.items).reduce((a, b) => a + b, 0);
        return tot ? { key: "E", text: `Empty net (${tot} items)` } : { key: "", text: "Collection net — empty", info: true, ok: false };
      }
      case "trap":
        return s.fish ? { key: "E", text: `Take ${s.fish} fish` } : { key: "", text: `Fish trap — waiting… ${Math.round((s.t / 80) * 100)}%`, info: true, ok: false, progress: s.t / 80 };
      case "sail": {
        const R = G.raft;
        return R.sail.open ? { key: "E", text: "Lower sail", alt: { key: "R", text: "Turn sail toward view" } } : { key: "E", text: "Raise sail toward view" };
      }
      case "anchor":
        return { key: "E", text: G.raft.anchored ? "Raise anchor" : "Drop anchor" };
      default:
        return null;
    }
  }
  if (T.kind === "node") {
    const n = findNode(G, T.owner, T.node);
    if (!n) return null;
    const info = NODE_INFO[n.type];
    if (info.tool === "axe") {
      if (eqId !== "axe") return { key: "", text: `${info.name} — equip an axe`, info: true, ok: false };
      const hits = islandSt(G, T.owner).hits[n.id] || 0;
      return { key: "LMB", text: `Chop ${info.name}${hits ? ` (${hits}/${info.hits})` : ""}` };
    }
    switch (n.type) {
      case "mango":
        return { key: "E", text: "Pick mangoes" };
      case "bush":
        return { key: "E", text: "Gather palm leaves" };
      case "vine":
        return { key: "E", text: "Pull down vines" };
      case "crate":
        return { key: "E", text: "Open supply crate" };
      case "page":
        return { key: "E", text: "Read logbook page" };
      case "driftwood":
        return { key: "E", text: "Gather driftwood" };
      default:
        return { key: "E", text: `Pick up ${info.name}` };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ doing things */
function interact(G, T) {
  if (!T) return false;
  const P = G.player;
  if (T.kind === "debris") {
    const d = G.debris.find((x) => x.id === T.id);
    if (d) collectDebris(G, d);
    return true;
  }
  if (T.kind === "satchel") {
    const S = G.satchel;
    let all = true;
    for (const e of S.items) {
      const left = addItem(G.inv, e[0], e[1]);
      if (left > 0) {
        e[1] = left;
        all = false;
      } else e[1] = 0;
      if (e[2] != null && left === 0) for (const s of G.inv.slots) if (s && s.id === e[0] && s.dur === ITEMS[e[0]].tool?.dur) {
        s.dur = e[2];
        break;
      }
    }
    S.items = S.items.filter((e) => e[1] > 0);
    G.invVersion++;
    if (all) {
      G.satchel = null;
      note(G, "Recovered your belongings", null, 0, "gain");
    } else note(G, "Inventory full — some items remain", null, 0, "bad");
    G.events.push({ t: "collect", kind: "satchel" });
    return true;
  }
  if (T.kind === "cell") {
    const c = G.raft.cells.get(cellKey(T.i, T.j));
    if (c && equipped(G)?.id === "hammer" && c.hp < FOUNDATION_HP) {
      if (!payCost(G.inv, REPAIR_COST)) {
        note(G, "Repair needs 1 Plank + 1 Plastic", null, 0, "bad");
        G.events.push({ t: "fail" });
        return true;
      }
      c.hp = FOUNDATION_HP;
      G.invVersion++;
      G.events.push({ t: "hammer", x: G.raft.x + (T.i + 0.5) * CELL, y: G.raft.y, z: G.raft.z + (T.j + 0.5) * CELL });
      note(G, "Foundation repaired", null, 0, "gain");
      G.use = { kind: "hammer", t: 0 };
      return true;
    }
    return false;
  }
  if (T.kind === "piece") return interactPiece(G, G.raft.pieces.get(T.id));
  if (T.kind === "node") return interactNode(G, T);
  return false;
}

function interactPiece(G, p) {
  if (!p) return false;
  const s = p.state;
  const R = G.raft;
  const ev = G.events;
  const at = pieceWorld(G, p);
  switch (p.type) {
    case "door": {
      if (s.open) {
        // don't close the door on the player
        const P = G.player;
        const b = edgeBox(p, 0.5);
        const lx = P.x - R.x;
        const lz = P.z - R.z;
        if (lx > b.x0 - PR && lx < b.x1 + PR && lz > b.z0 - PR && lz < b.z1 + PR && P.y < R.y + 1) {
          note(G, "Step out of the doorway", null, 0, "bad");
          return true;
        }
      }
      s.open = !s.open;
      R.version++;
      ev.push({ t: "door", open: s.open, ...at });
      return true;
    }
    case "chest":
      G.openChest = p.id;
      ev.push({ t: "chestOpen", ...at });
      return true;
    case "purifier":
    case "purifier2": {
      const def = STATIONS[p.type];
      if (s.fresh > 0) {
        if (countItem(G.inv, "cup_empty") === 0) return false;
        swapCup(G, "cup_empty", "cup_fresh");
        s.fresh--;
        ev.push({ t: "fill", ...at });
        note(G, "Collected fresh water", "cup_fresh", 0, "gain");
        return true;
      }
      if (s.water + s.fresh < def.cups && countItem(G.inv, "cup_salt") > 0) {
        if (def.fuel) {
          const f = fuelItem(G);
          if (!f) return false;
          removeItem(G.inv, f, 1);
        }
        swapCup(G, "cup_salt", "cup_empty");
        if (s.water === 0) s.t = 0;
        s.water++;
        ev.push({ t: "pour", ...at });
        return true;
      }
      return false;
    }
    case "grill":
    case "grill2": {
      const def = STATIONS[p.type];
      const ready = s.items.findIndex((x) => x.done);
      if (ready >= 0) {
        const it = s.items[ready];
        if (give(G, it.id, 1) === 0) s.items.splice(ready, 1);
        ev.push({ t: "collect", kind: "food" });
        return true;
      }
      const raw = rawFoodItem(G);
      if (s.items.length < def.slots && raw) {
        if (def.fuel) {
          const f = fuelItem(G);
          if (!f) return false;
          removeItem(G.inv, f, 1);
        }
        removeItem(G.inv, raw, 1);
        s.items.push({ id: ITEMS[raw].cook, t: 0, done: false });
        G.invVersion++;
        ev.push({ t: "sizzle", ...at });
        return true;
      }
      return false;
    }
    case "smelter": {
      if (s.ingots > 0) {
        const n = s.ingots;
        const left = give(G, "ingot", n);
        s.ingots = left;
        G.stat.ingots += n - left;
        ev.push({ t: "collect", kind: "ingot" });
        return true;
      }
      if (s.ore < 3 && countItem(G.inv, "metal_ore") > 0) {
        const f = fuelItem(G);
        if (!f) return false;
        removeItem(G.inv, f, 1);
        removeItem(G.inv, "metal_ore", 1);
        if (s.ore === 0) s.t = 0;
        s.ore++;
        G.invVersion++;
        ev.push({ t: "furnace", ...at });
        return true;
      }
      return false;
    }
    case "net": {
      const list = Object.entries(s.items).filter(([, n]) => n > 0);
      if (!list.length) return false;
      for (const [id, n] of list) {
        const left = give(G, id, n);
        if (left) s.items[id] = left;
        else delete s.items[id];
      }
      ev.push({ t: "collect", kind: "net" });
      return true;
    }
    case "trap": {
      if (!s.fish) return false;
      const left = give(G, "fish_raw", s.fish);
      G.stat.fish += s.fish - left;
      s.fish = left;
      ev.push({ t: "collect", kind: "fish" });
      return true;
    }
    case "sail": {
      if (R.sail.open) {
        R.sail.open = false;
        note(G, "Sail lowered — drifting with the current");
      } else {
        R.sail.open = true;
        R.sail.heading = G.player.yaw;
        R.anchored = false;
        note(G, "Sail raised");
      }
      ev.push({ t: "sail", open: R.sail.open, ...at });
      return true;
    }
    case "anchor":
      R.anchored = !R.anchored;
      if (R.anchored && R.sail.open) R.sail.open = false;
      note(G, R.anchored ? "Anchor dropped" : "Anchor raised");
      ev.push({ t: "anchor", down: R.anchored, ...at });
      return true;
    default:
      return false;
  }
}
function swapCup(G, from, to) {
  // prefer the equipped cup
  const eq = equipped(G);
  if (eq && eq.id === from) G.inv.slots[G.sel] = newStack(to, 1);
  else {
    const i = G.inv.slots.findIndex((s) => s && s.id === from);
    if (i >= 0) G.inv.slots[i] = newStack(to, 1);
  }
  G.invVersion++;
}
export function pieceWorld(G, p) {
  const R = G.raft;
  if (p.kind === "edge") {
    const b = edgeBox(p);
    return { x: R.x + (b.x0 + b.x1) / 2, y: R.y + p.level * WALL_H + 0.5, z: R.z + (b.z0 + b.z1) / 2 };
  }
  return { x: R.x + (p.i + 0.5) * CELL, y: R.y + p.level * WALL_H + 0.5, z: R.z + (p.j + 0.5) * CELL };
}

function crateLoot(G, owner) {
  const I = G.world.islands.get(owner);
  const type = I ? I.type : "reef";
  const r = G.r;
  const L = {
    palm: [["rope", 2, 3], ["plank", 3, 5], ["plastic", 2, 4], ["coconut", 1, 2], ["cup_empty", 1, 1]],
    rocky: [["scrap", 2, 4], ["rope", 2, 3], ["ingot", 1, 1], ["clay", 1, 3], ["stone", 2, 3]],
    jungle: [["vine", 2, 3], ["mango", 1, 2], ["rope", 2, 3], ["bandage", 1, 1], ["scrap", 1, 3]],
    reef: [["scrap", 2, 3], ["plastic", 2, 3], ["rope", 1, 2], ["clay", 1, 2]],
  }[type];
  return L.map(([id, a, b]) => [id, a + Math.floor(r() * (b - a + 1))]);
}

function interactNode(G, T) {
  const n = findNode(G, T.owner, T.node);
  if (!n) return false;
  const info = NODE_INFO[n.type];
  if (info.tool) return false;
  const st = islandSt(G, T.owner);
  const ev = G.events;
  const respawnAt = info.respawn ? G.t + info.respawn * DAY_SEC : -1;
  const take = (list) => {
    if (!canFit(G, list)) {
      note(G, "Inventory full", null, 0, "bad");
      G.events.push({ t: "fail" });
      return false;
    }
    for (const [id, c] of list) give(G, id, c);
    return true;
  };
  let ok = false;
  switch (n.type) {
    case "mango":
      if ((ok = take([["mango", 2]]))) st.fruit[n.id] = G.t + DAY_SEC;
      break;
    case "bush":
      ok = take([["leaf", 2 + (G.r() < 0.5 ? 1 : 0)]]);
      break;
    case "vine":
      ok = take([["vine", 2]]);
      break;
    case "stone":
      ok = take([["stone", 1]]);
      break;
    case "coconut":
      ok = take([["coconut", 1]]);
      break;
    case "clay":
      ok = take([["clay", 2]]);
      break;
    case "driftwood":
      ok = take([["plank", 2]]);
      break;
    case "scrap":
      ok = take([["scrap", 1 + (G.r() < 0.5 ? 1 : 0)]]);
      break;
    case "crate":
      ok = take(crateLoot(G, T.owner));
      if (ok) ev.push({ t: "crate", x: n.x, y: n.y, z: n.z });
      break;
    case "page": {
      const idx = G.pages.length;
      if (idx < LOG_PAGES.length) {
        G.pages.push(idx);
        G.reading = idx;
        note(G, `Logbook page found (${G.pages.length}/${LOG_PAGES.length})`, null, 0, "gain");
      } else {
        note(G, "Just a water-stained scrap of paper");
      }
      ev.push({ t: "page" });
      ok = true;
      break;
    }
    default:
      return false;
  }
  if (ok && n.type !== "mango") st.gone[n.id] = respawnAt;
  if (ok) ev.push({ t: "pickup", kind: n.type, x: n.x, y: n.y, z: n.z });
  return true;
}

function chopNode(G, T) {
  const n = findNode(G, T.owner, T.node);
  if (!n) return false;
  const info = NODE_INFO[n.type];
  if (info.tool !== "axe") return false;
  const st = islandSt(G, T.owner);
  st.hits[n.id] = (st.hits[n.id] || 0) + 1;
  G.events.push({ t: n.type === "boulder" ? "mine" : "chop", x: n.x, y: n.y + 1.2, z: n.z, node: n.id, owner: T.owner });
  if (n.type === "boulder") give(G, "metal_ore", 1);
  if (st.hits[n.id] >= info.hits) {
    delete st.hits[n.id];
    st.gone[n.id] = G.t + info.respawn * DAY_SEC;
    const yields = {
      palm: [["palmwood", 2], ["leaf", 3], ["coconut", G.r() < 0.6 ? 1 : 0]],
      jtree: [["palmwood", 3], ["vine", 1], ["leaf", 2]],
      bamboo: [["bamboo", 2]],
      boulder: [["stone", 1 + (G.r() < 0.5 ? 1 : 0)]],
    }[n.type].filter((e) => e[1] > 0);
    for (const [id, c] of yields) give(G, id, c);
    if (n.type === "palm" || n.type === "jtree") G.stat.chopped++;
    G.events.push({ t: n.type === "boulder" ? "rockBreak" : "treeFall", x: n.x, y: n.y, z: n.z, type: n.type });
  }
  return true;
}

/* ------------------------------------------------------------------ building */
export function setBuildPiece(G, piece) {
  if (!PIECES[piece] && !PLACEABLE[piece]) return false;
  if (PIECES[piece] && !G.unlocked.has(piece)) return false;
  G.build.piece = piece;
  G.build.ghost = null;
  return true;
}
function buildActive(G) {
  const eq = equipped(G);
  if (!eq) return null;
  if (eq.id === "hammer") return PIECES[G.build.piece] || PLACEABLE[G.build.piece] ? G.build.piece : "foundation";
  if (PLACEABLE[eq.id]) return eq.id;
  return null;
}
function pieceCost(type) {
  return PIECES[type] ? PIECES[type].cost : { [type]: 1 };
}
function computeGhost(G, type) {
  const P = G.player;
  const R = G.raft;
  const o = eyePos(P);
  const d = lookDir(P);
  const lo = [o[0] - R.x, o[1] - R.y, o[2] - R.z];
  const kind = PIECES[type]?.slot || PLACEABLE[type]?.slot;
  let level = PIECES[type]?.level || 0;
  if (type === "railing" && d[1] > 0.12) level = 1;
  const planeY = level === 1 ? WALL_H : 0;
  if (Math.abs(d[1]) < 1e-3) return null;
  const t = (planeY - lo[1]) / d[1];
  if (t < 0.3 || t > 8) return null;
  const px = lo[0] + d[0] * t;
  const pz = lo[2] + d[2] * t;
  const i = Math.floor(px / CELL);
  const j = Math.floor(pz / CELL);
  let slot;
  if (kind === "cell") slot = { kind: "cell", i, j, level };
  else {
    const fx = px - i * CELL;
    const fz = pz - j * CELL;
    const dW = fx;
    const dE = CELL - fx;
    const dS = fz;
    const dN = CELL - fz;
    const m = Math.min(dW, dE, dS, dN);
    if (m === dW) slot = { kind: "edge", side: "x", i, j, level };
    else if (m === dE) slot = { kind: "edge", side: "x", i: i + 1, j, level };
    else if (m === dS) slot = { kind: "edge", side: "z", i, j, level };
    else slot = { kind: "edge", side: "z", i, j: j + 1, level };
  }
  let res = canPlace(R, type, slot);
  // the body must not be inside the new piece
  if (res.ok) {
    const lx = P.x - R.x;
    const lz = P.z - R.z;
    const ly = P.y - R.y;
    let box = null;
    if (slot.kind === "edge" && type !== "net" && type !== "trap") box = { ...edgeBox({ side: slot.side, i: slot.i, j: slot.j }), y0: level * WALL_H, y1: level * WALL_H + 2.4 };
    else if (slot.kind === "cell" && type === "foundation") box = { x0: i * CELL, x1: (i + 1) * CELL, z0: j * CELL, z1: (j + 1) * CELL, y0: -3, y1: 0.05 };
    else if (slot.kind === "cell" && type !== "roof" && type !== "stairs") {
      const [w, , dd] = objBox(type);
      const c = [(i + 0.5) * CELL, (j + 0.5) * CELL];
      box = { x0: c[0] - w / 2, x1: c[0] + w / 2, z0: c[1] - dd / 2, z1: c[1] + dd / 2, y0: 0, y1: 2 };
    } else if (type === "roof") box = { x0: i * CELL, x1: (i + 1) * CELL, z0: j * CELL, z1: (j + 1) * CELL, y0: WALL_H - 0.2, y1: WALL_H + 0.1 };
    if (box && ly < box.y1 && ly + 1.78 > box.y0 && lx + PR > box.x0 && lx - PR < box.x1 && lz + PR > box.z0 && lz - PR < box.z1) res = { ok: false, reason: "You're standing in the way" };
  }
  const cost = pieceCost(type);
  if (res.ok && !hasCost(G.inv, cost)) res = { ok: false, reason: "Not enough materials", missing: missing(G.inv, cost) };
  if (res.ok && PIECES[type] && !G.unlocked.has(type)) res = { ok: false, reason: "Not unlocked yet" };
  return { type, slot, rot: G.build.rot, ok: res.ok, reason: res.reason || null, cost, missing: res.missing || null };
}
function placeGhost(G) {
  const g = G.build.ghost;
  if (!g) return false;
  if (!g.ok) {
    note(G, g.reason || "Can't build there", null, 0, "bad");
    G.events.push({ t: "fail" });
    return false;
  }
  if (!payCost(G.inv, g.cost)) return false;
  const p = addPiece(G.raft, g.type, g.slot, g.rot);
  if (PIECES[g.type]) G.stat.built[g.type] = (G.stat.built[g.type] || 0) + 1;
  else G.stat.placed[g.type] = (G.stat.placed[g.type] || 0) + 1;
  G.invVersion++;
  buildColliders(G.raft);
  const w = g.type === "foundation" ? { x: G.raft.x + (g.slot.i + 0.5) * CELL, y: G.raft.y, z: G.raft.z + (g.slot.j + 0.5) * CELL } : pieceWorld(G, p);
  G.events.push({ t: "place", type: g.type, ...w });
  G.use = { kind: "hammer", t: 0 };
  // placing the last placeable of a stack drops back to the hammer
  if (PLACEABLE[g.type] && !equipped(G)) {
    const hi = G.inv.slots.findIndex((s, k) => k < HOTBAR && s && s.id === "hammer");
    if (hi >= 0) G.sel = hi;
  }
  return true;
}
/** what the hammer would remove (raft piece / foundation under the crosshair) */
function removeTarget(G) {
  const T = G.target;
  if (!T) return null;
  if (T.kind === "piece") return { type: G.raft.pieces.get(T.id)?.type, id: T.id };
  if (T.kind === "cell") return { type: "foundation", i: T.i, j: T.j };
  return null;
}
function removeTargeted(G) {
  const t = removeTarget(G);
  if (!t || !t.type) return false;
  const res = canRemove(G.raft, t);
  if (!res.ok) {
    note(G, res.reason, null, 0, "bad");
    G.events.push({ t: "fail" });
    return false;
  }
  let refund;
  let p = null;
  if (t.type === "foundation") refund = [["plank", 2], ["plastic", 2]];
  else {
    p = G.raft.pieces.get(t.id);
    refund = PIECES[p.type] ? Object.entries(PIECES[p.type].cost) : [[p.type, 1]];
    // contents come back too
    const extra = stationContents(p);
    refund = refund.concat(extra);
  }
  if (!canFit(G, refund)) {
    note(G, "Make room in your inventory first", null, 0, "bad");
    G.events.push({ t: "fail" });
    return false;
  }
  const w = p ? pieceWorld(G, p) : { x: G.raft.x + (t.i + 0.5) * CELL, y: G.raft.y, z: G.raft.z + (t.j + 0.5) * CELL };
  removePiece(G.raft, t);
  if (p && p.type === "sail" && ![...G.raft.pieces.values()].some((q) => q.type === "sail")) G.raft.sail.open = false;
  if (p && p.type === "anchor") G.raft.anchored = false;
  for (const [id, n] of refund) addItem(G.inv, id, n);
  G.invVersion++;
  buildColliders(G.raft);
  G.events.push({ t: "remove", ...w });
  if (G.openChest === t.id) G.openChest = null;
  return true;
}
function stationContents(p) {
  const s = p.state;
  const out = [];
  if (p.type === "chest") for (const sl of s.slots) if (sl) out.push(sl.dur != null ? [sl.id, sl.n, sl.dur] : [sl.id, sl.n]);
  if (p.type === "grill" || p.type === "grill2") for (const it of s.items) out.push([it.done ? it.id : Object.keys(ITEMS).find((k) => ITEMS[k].cook === it.id) || it.id, 1]);
  if (p.type === "purifier" || p.type === "purifier2") {
    /* water inside is lost */
  }
  if (p.type === "smelter") {
    if (s.ore) out.push(["metal_ore", s.ore]);
    if (s.ingots) out.push(["ingot", s.ingots]);
  }
  if (p.type === "net") for (const k in s.items) if (s.items[k]) out.push([k, s.items[k]]);
  if (p.type === "trap" && s.fish) out.push(["fish_raw", s.fish]);
  return out;
}
function destroyFoundation(G, i, j) {
  const R = G.raft;
  const lost = [];
  for (const p of dependents(R, i, j)) {
    lost.push(...stationContents(p));
    if (PLACEABLE[p.type]) lost.push([p.type, 1]);
    removePiece(R, { id: p.id, type: p.type });
    if (p.type === "anchor") R.anchored = false;
  }
  removePiece(R, { type: "foundation", i, j });
  if (![...R.pieces.values()].some((q) => q.type === "sail")) R.sail.open = false;
  buildColliders(R);
  const x = R.x + (i + 0.5) * CELL;
  const z = R.z + (j + 0.5) * CELL;
  // what was on it floats off in a crate
  const items = [["plank", 1], ...lost];
  spawnDebris(G, "cargo", x + (i >= 0 ? 1.5 : -1.5), z + (j >= 0 ? 1.5 : -1.5), items);
  note(G, "The shark tore away a foundation!", null, 0, "bad");
  // if the player stood there they fall into the sea — physics handles it
}

/* ------------------------------------------------------------------ crafting & items */
export function craft(G, recipeId, times = 1) {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: "Unknown recipe" };
  if (!G.unlocked.has(r.id)) return { ok: false, reason: "Recipe locked" };
  let made = 0;
  for (let k = 0; k < times; k++) {
    if (!hasCost(G.inv, r.cost)) break;
    // check space after paying
    const tmp = { slots: G.inv.slots.map((s) => (s ? { ...s } : null)) };
    payCost(tmp, r.cost);
    if (addItem(tmp, r.out, r.n, ITEMS[r.out].kind === "tool") > 0) {
      if (!made) return { ok: false, reason: "No room in your inventory" };
      break;
    }
    payCost(G.inv, r.cost);
    addItem(G.inv, r.out, r.n, ITEMS[r.out].kind === "tool");
    G.stat.crafted[r.out] = (G.stat.crafted[r.out] || 0) + r.n;
    made++;
  }
  if (!made) return { ok: false, reason: "Not enough materials", missing: missing(G.inv, r.cost) };
  G.invVersion++;
  G.events.push({ t: "craft", item: r.out });
  note(G, `Crafted ${itemName(r.out)}${made > 1 ? ` ×${made}` : ""}`, r.out, 0, "gain");
  return { ok: true, made };
}

/** eat / drink from a slot (inventory panel or equipped item) */
export function consume(G, slot) {
  const s = G.inv.slots[slot];
  if (!s) return false;
  const it = ITEMS[s.id];
  const st = G.stats;
  if (it.kind === "water") {
    if (s.id !== "cup_fresh") return false;
    st.thirst = Math.min(100, st.thirst + 38);
    G.inv.slots[slot] = newStack("cup_empty", 1);
    G.stat.drank++;
    G.events.push({ t: "drink" });
    G.use = { kind: "drink", t: 0 };
    G.invVersion++;
    return true;
  }
  if (it.kind !== "food") return false;
  const f = it.food;
  st.hunger = clamp(st.hunger + f.hunger, 0, 100);
  st.thirst = clamp(st.thirst + f.thirst, 0, 100);
  if (f.health > 0) st.hp = Math.min(100, st.hp + f.health);
  else if (f.health < 0) hurt(G, -f.health, "food");
  if (s.id === "fish_cooked" || s.id === "shark_cooked") G.stat.ateCooked++;
  s.n--;
  if (s.n <= 0) G.inv.slots[slot] = null;
  G.events.push({ t: s.id === "bandage" ? "bandage" : "eat" });
  G.use = { kind: "eat", t: 0 };
  G.invVersion++;
  if (f.health < 0) note(G, "Raw food upset your stomach", null, 0, "bad");
  return true;
}

export function selectSlot(G, i) {
  i = ((i % HOTBAR) + HOTBAR) % HOTBAR;
  if (i === G.sel) return;
  cancelTools(G);
  G.sel = i;
  G.build.ghost = null;
  G.events.push({ t: "equip" });
}
function cancelTools(G) {
  const H = G.hook;
  if (H.state !== "idle" && H.state !== "retract") {
    for (const id of H.items) {
      const d = G.debris.find((x) => x.id === id);
      if (d) d.hooked = false;
    }
    H.items = [];
    H.state = H.state === "charge" ? "idle" : "retract";
  }
  if (G.rod.state !== "idle") G.rod.state = "idle";
}

/* ------------------------------------------------------------------ tools per frame */
function handPoint(G) {
  const P = G.player;
  const d = lookDir(P);
  return [P.x + d[0] * 0.5 + Math.cos(P.yaw) * 0.25, P.y + EYE - 0.25, P.z + d[2] * 0.5 - Math.sin(P.yaw) * 0.25];
}
function stepHook(G, I, dt) {
  const H = G.hook;
  const P = G.player;
  const eq = equipped(G);
  const holding = eq && eq.id === "hook";
  if (!holding && H.state !== "idle" && H.state !== "retract") cancelTools(G);
  const hp = handPoint(G);
  switch (H.state) {
    case "idle":
      if (holding && I.usePressed && !G.uiBlock) {
        H.state = "charge";
        H.charge = 0;
      }
      break;
    case "charge":
      H.charge = Math.min(1, H.charge + dt * 1.1);
      if (!I.use) {
        const d = lookDir(P);
        const sp = 6 + H.charge * 11;
        H.x = hp[0];
        H.y = hp[1];
        H.z = hp[2];
        const up = 0.25 + Math.max(0, d[1]) * 0.6;
        H.vx = d[0] * sp;
        H.vy = (d[1] + up) * sp * 0.75;
        H.vz = d[2] * sp;
        H.state = "fly";
        H.items = [];
        useDur(G, G.sel);
        G.events.push({ t: "hookThrow", s: H.charge });
        G.use = { kind: "throw", t: 0 };
      }
      break;
    case "fly": {
      H.vy -= 15 * dt;
      H.x += H.vx * dt;
      H.y += H.vy * dt;
      H.z += H.vz * dt;
      const w = waveHeight(H.x, H.z, G.t);
      const gh = groundHeight(G.world, H.x, H.z);
      const R = G.raft;
      const onRaft = overRaft(G, H.x, H.z) && H.y < R.y + 0.05;
      if (onRaft || gh > H.y) {
        H.state = "retract";
        break;
      }
      if (H.y <= w) {
        H.y = w;
        H.state = "water";
        G.events.push({ t: "splash", x: H.x, y: w, z: H.z, s: 0.5 });
        G.events.push({ t: "hookLand" });
      }
      if (Math.hypot(H.x - P.x, H.z - P.z) > 34) H.state = "retract";
      break;
    }
    case "water": {
      H.y = waveHeight(H.x, H.z, G.t);
      if (holding && I.use) {
        const dx = hp[0] - H.x;
        const dz = hp[2] - H.z;
        const d = Math.hypot(dx, dz);
        const sp = 4.6 * dt;
        H.x += (dx / d) * Math.min(sp, d);
        H.z += (dz / d) * Math.min(sp, d);
        H.reeling = true;
        if (Math.floor(G.t * 6) !== Math.floor((G.t - dt) * 6)) G.events.push({ t: "reel" });
      } else H.reeling = false;
      // grab debris
      if (H.items.length < MAX_HOOKED) {
        for (const db of G.debris) {
          if (db.hooked) continue;
          if (Math.abs(db.x - H.x) < 0.95 && Math.abs(db.z - H.z) < 0.95 && Math.hypot(db.x - H.x, db.z - H.z) < 0.95) {
            db.hooked = true;
            H.items.push(db.id);
            G.events.push({ t: "hooked", x: db.x, y: H.y, z: db.z });
            if (H.items.length >= MAX_HOOKED) break;
          }
        }
      }
      H.items.forEach((id, k) => {
        const db = G.debris.find((x) => x.id === id);
        if (!db) return;
        const a = (k / MAX_HOOKED) * TAU + G.t;
        db.x += (H.x + Math.cos(a) * 0.35 - db.x) * Math.min(1, 8 * dt);
        db.z += (H.z + Math.sin(a) * 0.35 - db.z) * Math.min(1, 8 * dt);
      });
      const near = Math.hypot(hp[0] - H.x, hp[2] - H.z);
      if (near < 1.7) {
        // in hand: collect everything on the hook
        let got = 0;
        for (const id of [...H.items]) {
          const db = G.debris.find((x) => x.id === id);
          if (!db) continue;
          if (collectDebris(G, db)) got++;
          else db.hooked = false;
        }
        H.items = [];
        H.state = "idle";
        if (got) G.events.push({ t: "hookHome" });
      } else if (near > 36) cancelTools(G);
      break;
    }
    case "retract": {
      const dx = hp[0] - H.x;
      const dy = hp[1] - H.y;
      const dz = hp[2] - H.z;
      const d = Math.hypot(dx, dy, dz);
      const sp = 22 * dt;
      if (d <= sp) H.state = "idle";
      else {
        H.x += (dx / d) * sp;
        H.y += (dy / d) * sp;
        H.z += (dz / d) * sp;
      }
      break;
    }
  }
}

function stepRod(G, I, dt) {
  const Rd = G.rod;
  const P = G.player;
  const eq = equipped(G);
  if (!(eq && eq.id === "rod")) {
    Rd.state = "idle";
    return;
  }
  const hp = handPoint(G);
  switch (Rd.state) {
    case "idle":
      if (I.usePressed && !G.uiBlock) {
        Rd.state = "charge";
        Rd.charge = 0;
      }
      break;
    case "charge":
      Rd.charge = Math.min(1, Rd.charge + dt * 1.2);
      if (!I.use) {
        const d = lookDir(P);
        const sp = 5 + Rd.charge * 9;
        Rd.x = hp[0];
        Rd.y = hp[1] + 0.6;
        Rd.z = hp[2];
        Rd.vx = d[0] * sp;
        Rd.vy = (d[1] + 0.45) * sp * 0.7;
        Rd.vz = d[2] * sp;
        Rd.state = "fly";
        G.events.push({ t: "cast" });
        G.use = { kind: "cast", t: 0 };
      }
      break;
    case "fly": {
      Rd.vy -= 14 * dt;
      Rd.x += Rd.vx * dt;
      Rd.y += Rd.vy * dt;
      Rd.z += Rd.vz * dt;
      const w = waveHeight(Rd.x, Rd.z, G.t);
      if (groundHeight(G.world, Rd.x, Rd.z) > Rd.y || (overRaft(G, Rd.x, Rd.z) && Rd.y < G.raft.y + 0.05)) {
        Rd.state = "idle";
        note(G, "Cast into open water", null, 0, "bad");
        break;
      }
      if (Rd.y <= w) {
        Rd.y = w;
        const depth = w - groundHeight(G.world, Rd.x, Rd.z);
        G.events.push({ t: "splash", x: Rd.x, y: w, z: Rd.z, s: 0.3 });
        if (depth < 2.2) {
          note(G, "Too shallow to fish here", null, 0, "bad");
          Rd.state = "idle";
        } else {
          Rd.state = "wait";
          Rd.t = 0;
          Rd.bite = 4 + G.r() * 8 * (G.clock > 5 && G.clock < 8 ? 0.6 : 1);
        }
      }
      break;
    }
    case "wait":
      Rd.y = waveHeight(Rd.x, Rd.z, G.t);
      Rd.t += dt;
      if (I.usePressed) {
        Rd.state = "idle";
        G.events.push({ t: "reel" });
        break;
      }
      if (Rd.t >= Rd.bite) {
        Rd.state = "bite";
        Rd.t = 0;
        G.events.push({ t: "bite", x: Rd.x, y: Rd.y, z: Rd.z });
        G.events.push({ t: "splash", x: Rd.x, y: Rd.y, z: Rd.z, s: 0.25 });
      }
      break;
    case "bite":
      Rd.y = waveHeight(Rd.x, Rd.z, G.t) - 0.18;
      Rd.t += dt;
      if (I.usePressed) {
        const catchId = G.r() < 0.9 ? "fish_raw" : G.r() < 0.5 ? "plastic" : "scrap";
        if (give(G, catchId, 1) === 0) {
          if (catchId === "fish_raw") G.stat.fish++;
          G.events.push({ t: "catch", item: catchId, x: Rd.x, y: Rd.y, z: Rd.z });
          useDur(G, G.sel);
        }
        Rd.state = "idle";
        G.use = { kind: "cast", t: 0 };
        break;
      }
      if (Rd.t > 1.35) {
        Rd.state = "wait";
        Rd.t = 0;
        Rd.bite = 3 + G.r() * 6;
        note(G, "It got away…", null, 0, "bad");
      }
      break;
  }
  if (Rd.state === "wait" || Rd.state === "bite") {
    if (Math.hypot(Rd.x - P.x, Rd.z - P.z) > 26) {
      Rd.state = "idle";
      note(G, "The line went slack", null, 0, "bad");
    }
  }
}

function stepMelee(G, I, dt) {
  const eq = equipped(G);
  const type = eq && ITEMS[eq.id].tool?.type;
  if (G.swing) {
    const S = G.swing;
    S.t += dt;
    if (!S.hit && S.t >= S.hitAt) {
      S.hit = true;
      meleeHit(G, S.kind);
    }
    if (S.t >= S.dur) G.swing = null;
  }
  if (!G.swing && I.use && !G.uiBlock && (type === "axe" || type === "spear")) {
    const st = G.stats;
    if (st.stamina < 3) return;
    st.stamina -= type === "axe" ? 4 : 5;
    G.swing = type === "axe" ? { kind: "axe", t: 0, dur: 0.72, hitAt: 0.3, hit: false } : { kind: "spear", t: 0, dur: 0.58, hitAt: 0.17, hit: false };
    G.events.push({ t: "swing", kind: type });
  }
}
function meleeHit(G, kind) {
  const P = G.player;
  const o = eyePos(P);
  const d = lookDir(P);
  // shark first
  const S = G.shark;
  if (S.state !== "dead") {
    for (const [x, y, z, r] of sharkSpheres(S)) {
      const t = raySphere(o, d, x, y, z, r + 0.25);
      if (t < (kind === "spear" ? 3.4 : 2.6)) {
        if (hitShark(G, kind === "spear" ? 30 : 14)) {
          useDur(G, G.sel);
          G.events.push({ t: "hit", x, y, z, blood: true });
        }
        return;
      }
    }
  }
  if (kind === "axe") {
    const T = G.target;
    if (T && T.kind === "node" && NODE_INFO[T.type]?.tool === "axe" && T.dist < 2.8) {
      chopNode(G, T);
      useDur(G, G.sel);
      return;
    }
  }
  G.events.push({ t: "whiff", kind });
}

function stepCup(G, I) {
  const eq = equipped(G);
  if (!eq || ITEMS[eq.id].kind !== "water" || !I.usePressed || G.uiBlock) return;
  if (eq.id === "cup_fresh") {
    consume(G, G.sel);
    return;
  }
  if (eq.id === "cup_empty") {
    const P = G.player;
    const hit = P.mode === "swim" ? { x: P.x, y: P.y, z: P.z } : rayWater(G, eyePos(P), lookDir(P), 3.6);
    if (hit) {
      G.inv.slots[G.sel] = newStack("cup_salt", 1);
      G.stat.seawater++;
      G.invVersion++;
      G.events.push({ t: "fill", ...hit });
      G.use = { kind: "fill", t: 0 };
    } else note(G, "Aim at the sea to fill the cup", null, 0, "bad");
    return;
  }
  note(G, "Pour seawater into a purifier", null, 0, "bad");
}

/* ------------------------------------------------------------------ stations */
function stepStations(G, dt) {
  const R = G.raft;
  for (const p of R.pieces.values()) {
    const s = p.state;
    switch (p.type) {
      case "purifier":
      case "purifier2": {
        if (s.water > 0) {
          s.t += dt;
          const T = STATIONS[p.type].time;
          if (s.t >= T) {
            s.t = 0;
            s.water--;
            s.fresh++;
            G.events.push({ t: "purified", ...pieceWorld(G, p) });
          }
        }
        break;
      }
      case "grill":
      case "grill2": {
        const T = STATIONS[p.type].time;
        for (const it of s.items) {
          if (it.done) continue;
          it.t += dt;
          if (it.t >= T) {
            it.done = true;
            G.stat.cooked++;
            G.events.push({ t: "cooked", ...pieceWorld(G, p) });
          }
        }
        break;
      }
      case "smelter": {
        if (s.ore > 0) {
          s.t += dt;
          if (s.t >= STATIONS.smelter.time) {
            s.t = 0;
            s.ore--;
            s.ingots++;
            G.events.push({ t: "smelted", ...pieceWorld(G, p) });
          }
        }
        break;
      }
      case "trap": {
        if (s.fish < 3) {
          s.t += dt;
          if (s.t >= 80) {
            s.t = 0;
            s.fish++;
          }
        }
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ survival */
function stepStats(G, dt, mv) {
  const st = G.stats;
  const P = G.player;
  const diff = G.difficulty === "easy" ? 0.7 : G.difficulty === "hard" ? 1.3 : 1;
  st.hunger = Math.max(0, st.hunger - dt * 0.125 * diff * (mv.sprinting ? 1.4 : 1));
  st.thirst = Math.max(0, st.thirst - dt * 0.16 * diff * (mv.sprinting ? 1.4 : 1) * (G.clock > 11 && G.clock < 16 ? 1.15 : 1));
  // stamina
  if (mv.sprinting) {
    st.stamina -= dt * (mv.swimming ? 13 : 16);
    G.staminaLock = 0.9;
  } else if (mv.swimming) {
    st.stamina -= dt * (mv.moving ? 2.6 : 1.2);
    G.staminaLock = 0.6;
  } else {
    G.staminaLock -= dt;
    if (G.staminaLock <= 0) st.stamina += dt * 15;
  }
  st.stamina = clamp(st.stamina, 0, 100);
  // oxygen
  if (P.headUnder) st.oxygen -= dt * 3.2;
  else st.oxygen += dt * 30;
  st.oxygen = clamp(st.oxygen, 0, 100);
  if (st.oxygen <= 0) hurt(G, dt * 9, "drown");
  if (st.hunger <= 0) hurt(G, dt * 0.55, "hunger");
  if (st.thirst <= 0) hurt(G, dt * 0.75, "thirst");
  if (st.hunger > 55 && st.thirst > 55 && st.hp < 100 && !G.dead) st.hp = Math.min(100, st.hp + dt * 0.28);
  // warnings
  const R = G.raft;
  const away = Math.hypot(P.x - R.x, P.z - R.z);
  G.warn = st.oxygen < 30 && P.headUnder ? "oxygen" : st.thirst < 15 ? "thirst" : st.hunger < 15 ? "hunger" : away > 45 && !R.anchored && Math.hypot(R.vx, R.vz) > 0.3 ? "drift" : null;
}

function die(G, cause) {
  if (G.dead) return;
  const P = G.player;
  G.stats.hp = 0;
  G.dead = { cause, t: 0 };
  G.stat.deaths++;
  cancelTools(G);
  // belongings (all but tools) sink into a satchel
  const items = [];
  G.inv.slots.forEach((s, i) => {
    if (!s) return;
    if (ITEMS[s.id].kind === "tool") return;
    items.push(s.dur != null ? [s.id, s.n, s.dur] : [s.id, s.n]);
    G.inv.slots[i] = null;
  });
  if (G.satchel) items.push(...G.satchel.items);
  if (items.length) {
    const swim = P.mode === "swim" || P.y < waveHeight(P.x, P.z, G.t) - 0.3;
    const onRaft = overRaft(G, P.x, P.z) && !swim;
    G.satchel = onRaft ? null : { x: P.x, y: swim ? 0 : P.y, z: P.z, float: swim, items };
    if (onRaft) for (const e of items) addItem(G.inv, e[0], e[1]);
  }
  G.invVersion++;
  G.events.push({ t: "death", cause });
}
export function respawn(G) {
  if (!G.dead) return;
  const R = G.raft;
  const P = G.player;
  // land on the clearest foundation near the raft's centre
  const b = bounds(R);
  let best = null;
  for (const c of R.cells.values()) {
    if (R.objs.has(`${c.i}:${c.j}:0`)) continue;
    const d = Math.hypot((c.i + 0.5) * CELL - b.cx, (c.j + 0.5) * CELL - b.cz);
    if (!best || d < best.d) best = { c, d };
  }
  const c = best ? best.c : [...R.cells.values()][0];
  P.x = R.x + (c.i + 0.5) * CELL;
  P.z = R.z + (c.j + 0.5) * CELL;
  P.y = R.y + 0.05;
  P.vx = P.vy = P.vz = 0;
  P.mode = "walk";
  P.grounded = true;
  P.onRaftFrame = true;
  P.climb = null;
  const st = G.stats;
  st.hp = 65;
  st.hunger = Math.max(st.hunger, 45);
  st.thirst = Math.max(st.thirst, 45);
  st.stamina = 100;
  st.oxygen = 100;
  G.dead = null;
  // the shark gives the castaway some breathing room
  if (G.shark.state !== "dead") {
    G.shark.state = "flee";
    G.shark.t = 0;
    G.shark.fleeFor = 25;
  }
  G.events.push({ t: "respawn" });
  if (G.satchel) note(G, "Your satchel is where you fell — find it!", null, 0, "info");
}

/* ------------------------------------------------------------------ world progress */
function stepDiscovery(G) {
  const P = G.player;
  for (const I of islandsNear(G.world, P.x, P.z, 260)) {
    const d = Math.hypot(I.x - P.x, I.z - P.z);
    if (!G.found[I.id] && d < I.r + 80) {
      G.found[I.id] = 1;
      G.stat.found[I.type]++;
      note(G, `Discovered ${I.name}`, null, 0, "gain");
      G.events.push({ t: "discover", type: I.type, name: I.name });
    }
    if (d < I.r * 1.05 && P.ground === "land" && P.mode === "walk" && islandZone(I, P.x, P.z) < 1.0 && P.y > waveHeight(P.x, P.z, G.t) - 0.4) {
      if (G.found[I.id] !== 2) {
        G.found[I.id] = 2;
        G.stat.explored[I.type]++;
        G.events.push({ t: "landfall", type: I.type, name: I.name });
      }
      G.currentIsland = I.id;
    }
  }
  if (P.mode === "swim" || P.ground === "raft") G.currentIsland = null;
}
function stepObjectives(G) {
  for (const o of OBJECTIVES) {
    if (G.done.has(o.id)) continue;
    if (o.val(G) >= o.goal) {
      G.done.add(o.id);
      const unlocked = [];
      for (const u of o.unlock || []) {
        if (!G.unlocked.has(u)) {
          G.unlocked.add(u);
          unlocked.push(u);
        }
      }
      G.events.push({ t: "objective", id: o.id, title: o.title, unlocked });
    }
  }
}
function stepRespawns(G) {
  for (const id in G.islandState) {
    const st = G.islandState[id];
    for (const k in st.gone) if (st.gone[k] >= 0 && G.t >= st.gone[k]) delete st.gone[k];
    for (const k in st.fruit) if (G.t >= st.fruit[k]) delete st.fruit[k];
  }
}

/* ------------------------------------------------------------------ main tick */
export function tick(G, I, dt) {
  dt = Math.min(dt, 0.1);
  G.t += dt;
  const prevClock = G.clock;
  G.clock = (G.clock + (dt / DAY_SEC) * 24) % 24;
  if (G.clock < prevClock) G.day++;
  stepRaft(G, dt);
  const P = G.player;
  if (G.dead) {
    G.dead.t += dt;
    if (P.onRaftFrame) {
      P.x += G.raftDelta[0];
      P.y += G.raftDelta[1];
      P.z += G.raftDelta[2];
    }
    stepShark(G, dt);
    stepDebris(G, dt);
    stepStations(G, dt);
    return;
  }
  // look
  if (I.lookX || I.lookY) {
    P.yaw -= I.lookX;
    P.pitch = clamp(P.pitch - I.lookY, -1.5, 1.5);
  }
  if (I.slot != null) selectSlot(G, I.slot);
  if (I.wheel) selectSlot(G, G.sel + (I.wheel > 0 ? 1 : -1));

  // climbing aboard from the water
  const spot = P.climb ? null : climbSpot(G, P);
  G.climbSpot = spot;
  if (spot && (I.jumpPressed || (I.interact && !G.target))) {
    startClimb(G, P, spot);
    G.events.push({ t: "climb" });
  }

  const mv = stepPlayer(G, P, I, dt, G.raftDelta);
  stepStats(G, dt, mv);
  if (G.dead) return;

  // what are we looking at?
  G.target = computeTarget(G);
  const bType = buildActive(G);
  if (bType) {
    if (I.rotate) {
      G.build.rot = (G.build.rot + 1) & 3;
      G.events.push({ t: "rotate" });
    }
    G.build.ghost = computeGhost(G, bType);
    G.build.target = equipped(G)?.id === "hammer" ? removeTarget(G) : null;
  } else {
    G.build.ghost = null;
    G.build.target = null;
  }
  G.prompt = describe(G, G.target);
  if (!G.prompt && spot) G.prompt = { key: "Space", text: "Climb aboard" };

  // E
  if (I.interact && !G.uiBlock) {
    if (!interact(G, G.target) && G.target) {
      if (G.prompt && G.prompt.info) G.events.push({ t: "fail" });
    }
  }
  // R on an open sail re-aims it
  if (I.rotate && !bType && G.target?.kind === "piece") {
    const p = G.raft.pieces.get(G.target.id);
    if (p && p.type === "sail" && G.raft.sail.open) {
      G.raft.sail.heading = P.yaw;
      G.events.push({ t: "sail", open: true, ...pieceWorld(G, p) });
      note(G, "Sail turned");
    }
  }

  // tools
  const eq = equipped(G);
  const eqKind = eq ? ITEMS[eq.id].kind : null;
  if (bType) {
    if (I.usePressed && !G.uiBlock) placeGhost(G);
    if (I.alt && !G.uiBlock && eq?.id === "hammer") removeTargeted(G);
  } else if (eqKind === "food" && I.usePressed && !G.uiBlock) consume(G, G.sel);
  stepHook(G, I, dt);
  stepRod(G, I, dt);
  stepMelee(G, I, dt);
  stepCup(G, I);
  if (G.use.kind) {
    G.use.t += dt;
    if (G.use.t > 0.7) G.use = { kind: null, t: 0 };
  }

  stepDebris(G, dt);
  stepStations(G, dt);
  stepShark(G, dt);

  G.timers.disc -= dt;
  if (G.timers.disc <= 0) {
    G.timers.disc = 0.5;
    stepDiscovery(G);
    stepObjectives(G);
  }
  G.timers.respawn -= dt;
  if (G.timers.respawn <= 0) {
    G.timers.respawn = 5;
    stepRespawns(G);
  }
  // old feed entries expire
  while (G.feed.length && G.t - G.feed[0].t > 4.5) G.feed.shift();
}

/* ------------------------------------------------------------------ HUD snapshot */
export function hudSnapshot(G) {
  const P = G.player;
  const R = G.raft;
  const st = G.stats;
  const eq = equipped(G);
  const objs = [];
  for (const o of OBJECTIVES) {
    if (G.done.has(o.id)) continue;
    objs.push({ id: o.id, title: o.title, desc: o.desc, v: Math.min(o.goal, o.val(G)), goal: o.goal });
    if (objs.length >= 3) break;
  }
  const markers = [];
  const dRaft = Math.hypot(R.x - P.x, R.z - P.z);
  if (dRaft > 6) markers.push({ kind: "raft", a: Math.atan2(R.x - P.x, R.z - P.z), d: dRaft });
  for (const I of islandsNear(G.world, P.x, P.z, 700)) {
    const d = Math.hypot(I.x - P.x, I.z - P.z);
    if (d > I.r + 10) markers.push({ kind: I.type, a: Math.atan2(I.x - P.x, I.z - P.z), d: d - I.r, found: !!G.found[I.id] });
  }
  if (G.satchel) markers.push({ kind: "satchel", a: Math.atan2(G.satchel.x - P.x, G.satchel.z - P.z), d: Math.hypot(G.satchel.x - P.x, G.satchel.z - P.z) });
  const S = G.shark;
  const g = G.build.ghost;
  return {
    hp: st.hp,
    hunger: st.hunger,
    thirst: st.thirst,
    stamina: st.stamina,
    oxygen: st.oxygen,
    underwater: P.headUnder,
    swimming: P.mode === "swim",
    sel: G.sel,
    eq: eq ? eq.id : null,
    invV: G.invVersion,
    prompt: G.prompt,
    objs,
    done: G.done.size,
    total: OBJECTIVES.length,
    clock: G.clock,
    day: G.day,
    yaw: P.yaw,
    markers,
    hook: G.hook.state === "charge" ? G.hook.charge : G.rod.state === "charge" ? G.rod.charge : -1,
    rod: G.rod.state,
    shark: S.state === "approach" || S.state === "bite" ? "raft" : S.state === "hunt" || S.state === "lunge" ? "you" : null,
    sharkBiting: S.state === "bite",
    build: g ? { type: g.type, ok: g.ok, reason: g.reason, cost: g.cost, missing: g.missing, rot: g.rot, remove: G.build.target ? G.build.target.type : null } : null,
    buildPiece: G.build.piece,
    raft: { sail: R.sail.open, anchored: R.anchored, aground: R.aground, speed: Math.hypot(R.vx, R.vz), cells: R.cells.size, sails: [...R.pieces.values()].some((p) => p.type === "sail"), anchor: [...R.pieces.values()].some((p) => p.type === "anchor") },
    feed: G.feed.map((f) => ({ id: f.id, text: f.text, item: f.item, tone: f.tone })),
    warn: G.warn,
    dead: G.dead ? { cause: G.dead.cause, t: G.dead.t } : null,
    island: G.currentIsland ? G.world.islands.get(G.currentIsland)?.name : null,
    reading: G.reading,
    openChest: G.openChest ?? null,
    hasHammer: countItem(G.inv, "hammer") > 0,
  };
}

/* ------------------------------------------------------------------ save / load */
export function serialize(G) {
  const P = G.player;
  const R = G.raft;
  const onRaft = P.onRaftFrame || (P.grounded && P.ground === "raft");
  const islandState = {};
  for (const id in G.islandState) {
    const s = G.islandState[id];
    if (Object.keys(s.gone).length || Object.keys(s.fruit).length) islandState[id] = { gone: s.gone, fruit: s.fruit };
  }
  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    seed: G.seed,
    difficulty: G.difficulty,
    t: G.t,
    day: G.day,
    clock: G.clock,
    player: { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, onRaft, rel: onRaft ? [P.x - R.x, P.y - R.y, P.z - R.z] : null, mode: P.mode },
    stats: { ...G.stats },
    inv: invToJSON(G.inv),
    sel: G.sel,
    raft: raftToJSON(R),
    unlocked: [...G.unlocked],
    done: [...G.done],
    stat: G.stat,
    islandState,
    found: G.found,
    pages: G.pages,
    satchel: G.satchel,
    shark: { cd: G.shark.cd, hp: G.shark.hp, dead: G.shark.state === "dead", respawn: G.shark.respawn },
    buildPiece: G.build.piece,
  };
}

const num = (v, d) => (Number.isFinite(v) ? v : d);
/** rebuild a game from a save; anything malformed falls back to defaults */
export function deserialize(data) {
  if (!data || typeof data !== "object" || !Number.isFinite(data.seed)) return null;
  const G = createGame({ seed: data.seed, difficulty: ["easy", "normal", "hard"].includes(data.difficulty) ? data.difficulty : "normal" });
  G.debris = [];
  G.t = Math.max(0, num(data.t, 0));
  G.day = Math.max(1, Math.floor(num(data.day, 1)));
  G.clock = clamp(num(data.clock, START_HOUR), 0, 23.999);
  if (data.stats && typeof data.stats === "object") for (const k in G.stats) G.stats[k] = clamp(num(data.stats[k], G.stats[k]), 1, 100);
  G.stats.hp = Math.max(G.stats.hp, 10);
  G.inv = invFromJSON(data.inv, BAG_SLOTS);
  G.sel = clamp(Math.floor(num(data.sel, 0)), 0, HOTBAR - 1);
  G.raft = raftFromJSON(data.raft);
  buildColliders(G.raft);
  if (Array.isArray(data.unlocked)) for (const u of data.unlocked) if (RECIPE_BY_ID[u] || PIECES[u]) G.unlocked.add(u);
  if (Array.isArray(data.done)) for (const d of data.done) if (OBJECTIVES.some((o) => o.id === d)) G.done.add(d);
  // objective rewards are re-applied (handles saves from before an unlock was added)
  for (const o of OBJECTIVES) if (G.done.has(o.id)) for (const u of o.unlock || []) G.unlocked.add(u);
  if (data.stat && typeof data.stat === "object") {
    for (const k in G.stat) {
      const v = data.stat[k];
      if (typeof G.stat[k] === "number" && Number.isFinite(v)) G.stat[k] = v;
      else if (typeof G.stat[k] === "object" && v && typeof v === "object") for (const kk in v) if (Number.isFinite(v[kk])) G.stat[k][kk] = v[kk];
    }
  }
  if (data.islandState && typeof data.islandState === "object") {
    for (const id in data.islandState) {
      const s = data.islandState[id];
      G.islandState[id] = { gone: { ...(s?.gone || {}) }, hits: {}, fruit: { ...(s?.fruit || {}) } };
    }
  }
  if (data.found && typeof data.found === "object") G.found = { ...data.found };
  if (Array.isArray(data.pages)) G.pages = data.pages.filter((p) => Number.isInteger(p) && p >= 0 && p < LOG_PAGES.length).slice(0, LOG_PAGES.length);
  if (data.satchel && Array.isArray(data.satchel.items)) {
    const items = data.satchel.items.filter((e) => Array.isArray(e) && ITEMS[e[0]] && e[1] > 0);
    if (items.length) G.satchel = { x: num(data.satchel.x, G.raft.x + 5), y: num(data.satchel.y, 0), z: num(data.satchel.z, G.raft.z), float: !!data.satchel.float, items };
  }
  const P = G.player;
  const pd = data.player || {};
  P.yaw = num(pd.yaw, P.yaw);
  P.pitch = clamp(num(pd.pitch, 0), -1.5, 1.5);
  const R = G.raft;
  // settle the raft on the waves before placing the player
  R.y = waveHeight(R.x, R.z, G.t) + 0.3;
  if (pd.onRaft && Array.isArray(pd.rel) && overRaft(G, R.x + num(pd.rel[0], 0), R.z + num(pd.rel[2], 0))) {
    P.x = R.x + num(pd.rel[0], 0);
    P.z = R.z + num(pd.rel[2], 0);
    P.y = R.y + Math.max(0, num(pd.rel[1], 0)) + 0.02;
    P.onRaftFrame = true;
  } else if (!pd.onRaft && Number.isFinite(pd.x) && Number.isFinite(pd.z)) {
    P.x = pd.x;
    P.z = pd.z;
    P.y = Math.max(num(pd.y, 0), groundHeight(G.world, P.x, P.z));
    P.mode = pd.mode === "swim" ? "swim" : "walk";
    P.onRaftFrame = false;
    P.grounded = false;
  } else {
    const c = [...R.cells.values()][0];
    P.x = R.x + (c.i + 0.5) * CELL;
    P.z = R.z + (c.j + 0.5) * CELL;
    P.y = R.y + 0.02;
    P.onRaftFrame = true;
  }
  if (data.shark) {
    G.shark.cd = Math.max(20, num(data.shark.cd, 90));
    G.shark.hp = clamp(num(data.shark.hp, 120), 10, 120);
    if (data.shark.dead) {
      G.shark.state = "dead";
      G.shark.respawn = clamp(num(data.shark.respawn, 60), 1, 200);
      G.shark.alive = false;
      G.shark.y = -12;
    }
  }
  G.shark.x = R.x + 16;
  G.shark.z = R.z + 4;
  if (typeof data.buildPiece === "string" && (PIECES[data.buildPiece] || PLACEABLE[data.buildPiece])) G.build.piece = data.buildPiece;
  // pre-existing objectives shouldn't re-announce
  seedDebris(G, true);
  return G;
}

export { HOTBAR, BAG_SLOTS, CHEST_SLOTS, spaceFor, ISLAND_TYPES, PIECES, pieceKind, stairsDir };
