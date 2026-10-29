/**
 * Last Hope — base building (Survivor's Camp) and the dynamic collision layer.
 *
 * Keys: f:i:j floor layer, o:i:j object layer (one each per cell),
 *       h:i:j / v:i:j cell edges for walls and doors (see data/structures.js).
 * Every change calls refreshDynamic(), which pushes structure + locked-door
 * shapes into the collider (blocking) and the nav grid (breakable cost, so
 * the dead siege the weakest wall when you hide).
 */
import { PIECES, GRID, BUILD_ZONE } from "../data/structures.js";
import { count, remove, add, makeInv } from "./inventory.js";
import { emit, giveXp, dropItems } from "./damage.js";

const H = Math.PI / 2;

/** Shape + transform of a piece at a key. */
export function pieceAt(kind, key, rot = 0) {
  const P = PIECES[kind];
  const [k, si, sj] = key.split(":");
  const i = +si;
  const j = +sj;
  if (P.place === "edge") {
    if (k === "h") return { x: (i + 0.5) * GRID, z: j * GRID, yaw: H, shape: { k: "b", x: (i + 0.5) * GRID, z: j * GRID, hw: 0.17, hd: GRID / 2, a: H } };
    return { x: i * GRID, z: (j + 0.5) * GRID, yaw: 0, shape: { k: "b", x: i * GRID, z: (j + 0.5) * GRID, hw: 0.17, hd: GRID / 2, a: 0 } };
  }
  const x = (i + 0.5) * GRID;
  const z = (j + 0.5) * GRID;
  const yaw = (rot % 4) * H;
  let shape = null;
  if (kind === "barricade") shape = { k: "b", x, z, hw: 0.8, hd: 0.36, a: yaw };
  else if (kind === "campfire") shape = { k: "c", x, z, r: 0.6 };
  else if (kind === "workbench") shape = { k: "b", x, z, hw: 0.8, hd: 0.45, a: yaw };
  else if (kind === "chest") shape = { k: "b", x, z, hw: 0.62, hd: 0.42, a: yaw };
  else if (kind === "collector") shape = { k: "c", x, z, r: 0.6 };
  else if (kind === "bed" || kind === "floor") shape = { k: "b", x, z, hw: 0.95, hd: 0.95, a: yaw };
  return { x, z, yaw, shape };
}

/** Snap a world point to a key for the piece. */
export function snapKey(kind, x, z, rot = 0) {
  const P = PIECES[kind];
  if (P.place === "edge") {
    if (rot % 2 === 0) return `h:${Math.floor(x / GRID)}:${Math.round(z / GRID)}`;
    return `v:${Math.round(x / GRID)}:${Math.floor(z / GRID)}`;
  }
  const layer = P.layer === "floor" ? "f" : "o";
  return `${layer}:${Math.floor(x / GRID)}:${Math.floor(z / GRID)}`;
}

export const costOf = (kind, tier = 0) => PIECES[kind].tiers[tier].cost;

function inZone(x, z) {
  const Z = BUILD_ZONE;
  return x >= Z.x0 - 0.01 && x <= Z.x1 + 0.01 && z >= Z.z0 - 0.01 && z <= Z.z1 + 0.01;
}

export function canAfford(G, cost) {
  for (const [id, n] of Object.entries(cost)) if (count(G.inv, id) < n) return false;
  return true;
}
function pay(G, cost) {
  for (const [id, n] of Object.entries(cost)) remove(G.inv, id, n);
  G.invVersion++;
}

/**
 * Validate a placement. Returns {ok, reason, key, x, z, yaw}.
 */
export function checkPlace(G, kind, x, z, rot = 0) {
  const P = PIECES[kind];
  const key = snapKey(kind, x, z, rot);
  const at = pieceAt(kind, key, rot);
  const out = { ok: false, reason: "", key, x: at.x, z: at.z, yaw: at.yaw, kind };
  if (G.loc !== "camp") return (out.reason = "You can only build at your camp"), out;
  if (!inZone(at.x, at.z)) return (out.reason = "Outside the build zone"), out;
  if (G.structures.some((s) => s.key === key)) return (out.reason = "Already occupied"), out;
  const tier = P.tiers[0];
  if (tier.level && G.P.level < tier.level) return (out.reason = `Requires level ${tier.level}`), out;
  if (!canAfford(G, tier.cost)) return (out.reason = "Not enough resources"), out;
  const R = G.R;
  if (at.shape) {
    const s = at.shape;
    // statics (trees, tents, the well…)
    const skipDyn = (q) => !!q.sid || !!q.lock;
    const blocked = s.k === "c" ? R.col.overlaps(s.x, s.z, s.r, skipDyn) : R.col.boxBlocked(s.x, s.z, s.hw, s.hd, s.a, skipDyn);
    if (blocked) return (out.reason = "Blocked"), out;
    if (P.solid) {
      // edge pieces vs objects in the two neighbouring cells, objects vs edges
      for (const o of G.structures) {
        if (!PIECES[o.kind].solid || !o.shape) continue;
        if (PIECES[o.kind].place === P.place) continue;
        if (shapesOverlap(s, o.shape)) return (out.reason = "Blocked by a structure"), out;
      }
      const pr = G.P.r + 0.05;
      if (shapeHits(s, G.P.x, G.P.z, pr)) return (out.reason = "You're standing there"), out;
      for (const zb of R.zombies) if (zb.state !== "dead" && shapeHits(s, zb.x, zb.z, zb.r)) return (out.reason = "Something's in the way"), out;
    }
  }
  out.ok = true;
  return out;
}

export function place(G, kind, x, z, rot = 0) {
  const c = checkPlace(G, kind, x, z, rot);
  if (!c.ok) {
    emit(G, { t: "toast", text: c.reason, kind: "bad" });
    return null;
  }
  const P = PIECES[kind];
  pay(G, P.tiers[0].cost);
  const at = pieceAt(kind, c.key, rot);
  const s = { id: G.nextSid++, kind, tier: 0, key: c.key, rot, x: at.x, z: at.z, yaw: at.yaw, hp: P.tiers[0].hp, open: false };
  if (P.storage) s.inv = makeInv(P.tiers[0].slots);
  if (kind === "collector") s.water = 0;
  attachShape(s);
  G.structures.push(s);
  G.stats.built[kind] = (G.stats.built[kind] || 0) + 1;
  if (kind === "bed") G.respawn = { x: s.x, z: s.z + 1.2 };
  refreshDynamic(G);
  giveXp(G, 4);
  emit(G, { t: "build", kind, sid: s.id, x: s.x, z: s.z });
  return s;
}

function attachShape(s) {
  s.shape = PIECES[s.kind].solid ? pieceAt(s.kind, s.key, s.rot).shape : null;
}

export function upgrade(G, sid) {
  const s = G.structures.find((q) => q.id === sid);
  if (!s) return false;
  const P = PIECES[s.kind];
  const next = P.tiers[s.tier + 1];
  if (!next) return emit(G, { t: "toast", text: "Already fully upgraded", kind: "bad" }), false;
  if (next.level && G.P.level < next.level) return emit(G, { t: "toast", text: `Requires level ${next.level}`, kind: "bad" }), false;
  if (!canAfford(G, next.cost)) return emit(G, { t: "toast", text: "Not enough resources", kind: "bad" }), false;
  pay(G, next.cost);
  s.tier++;
  s.hp = next.hp;
  if (P.storage && next.slots) {
    while (s.inv.slots.length < next.slots) s.inv.slots.push(null);
  }
  G.stats.upgrades[s.kind] = Math.max(G.stats.upgrades[s.kind] ?? -1, s.tier);
  refreshDynamic(G);
  giveXp(G, 8);
  emit(G, { t: "upgrade", kind: s.kind, sid, tier: s.tier, x: s.x, z: s.z });
  return true;
}

export function demolish(G, sid) {
  const i = G.structures.findIndex((q) => q.id === sid);
  if (i < 0) return false;
  const s = G.structures[i];
  if (s.inv && s.inv.slots.some(Boolean)) return emit(G, { t: "toast", text: "Empty the chest first", kind: "bad" }), false;
  G.structures.splice(i, 1);
  // refund half of the current tier's cost
  const cost = PIECES[s.kind].tiers[s.tier].cost;
  for (const [id, n] of Object.entries(cost)) {
    const back = Math.floor(n / 2);
    if (back > 0) {
      const left = add(G.inv, id, back);
      if (left > 0) dropItems(G, s.x, s.z, [{ id, n: left }]);
    }
  }
  G.invVersion++;
  if (s.kind === "bed" && G.respawn && Math.abs(G.respawn.x - s.x) < 0.1) G.respawn = null;
  refreshDynamic(G);
  emit(G, { t: "demolish", kind: s.kind, x: s.x, z: s.z });
  return true;
}

export function damageStructure(G, sid, dmg) {
  const s = G.structures.find((q) => q.id === sid);
  if (!s) return;
  s.hp -= dmg;
  s.hitT = 0.3;
  emit(G, { t: "shit", sid, x: s.x, z: s.z, kind: s.kind, tier: s.tier });
  if (s.hp <= 0) {
    G.structures.splice(G.structures.indexOf(s), 1);
    if (s.inv) dropItems(G, s.x, s.z, s.inv.slots.filter(Boolean));
    emit(G, { t: "sbreak", sid, kind: s.kind, x: s.x, z: s.z });
    emit(G, { t: "toast", text: `Your ${PIECES[s.kind].tiers[s.tier].name} was destroyed!`, kind: "bad" });
    refreshDynamic(G);
  }
}

export function setDoor(G, sid, open) {
  const s = G.structures.find((q) => q.id === sid);
  if (!s || !PIECES[s.kind].door) return;
  if (s.open === open) return;
  s.open = open;
  s.openT = 0;
  refreshDynamic(G);
  emit(G, { t: "door", sid, open, x: s.x, z: s.z });
}

/** Rebuild the dynamic collision + nav layers (structures and locked doors). */
export function refreshDynamic(G) {
  const R = G.R;
  if (!R) return;
  const col = [];
  const nav = [];
  if (G.loc === "camp")
    for (const s of G.structures) {
      if (!s.shape) attachShape(s);
      if (!s.shape) continue;
      const P = PIECES[s.kind];
      if (P.door && s.open) continue;
      col.push({ ...s.shape, sid: s.id, door: !!P.door, spikes: P.tiers[s.tier].spikes ?? P.spikes ?? 0, op: s.kind === "wall" || (P.door && !s.open) });
      nav.push({ id: s.id, shape: s.shape, cost: 5 + s.hp / 40 });
    }
  for (const d of R.doors) {
    if (d.open) continue;
    const shape = { k: "b", x: d.x, z: d.z, hw: d.w / 2, hd: 0.25, a: d.yaw };
    col.push({ ...shape, lock: d.id, op: true });
    nav.push({ id: 100000 + R.doors.indexOf(d), shape, cost: -1 });
  }
  R.col.setDynamic(col);
  R.nav.setStructures(nav);
}

/** Per-tick structure upkeep: rain collectors fill, doors swing shut behind you. */
export function stepStructures(G, dt) {
  if (G.loc !== "camp") {
    for (const s of G.structures) if (s.kind === "collector") s.water = Math.min(3, (s.water || 0) + dt / 180);
    return;
  }
  const P = G.P;
  for (const s of G.structures) {
    if (s.hitT) s.hitT = Math.max(0, s.hitT - dt);
    if (s.kind === "collector") s.water = Math.min(3, (s.water || 0) + dt / 180);
    if (PIECES[s.kind].door && s.open) {
      s.openT = (s.openT || 0) + dt;
      const far = (P.x - s.x) ** 2 + (P.z - s.z) ** 2 > 2.2 * 2.2;
      const blocked = G.R.zombies.some((z) => z.state !== "dead" && (z.x - s.x) ** 2 + (z.z - s.z) ** 2 < 1.4 * 1.4);
      if (far && s.openT > 1.5 && !blocked) setDoor(G, s.id, false);
    }
  }
}

/** Structures cost the camp nothing at other locations; collectors keep filling. */
export function structureById(G, sid) {
  return G.structures.find((s) => s.id === sid) || null;
}

/* ---------------------------------------------------------------- geometry helpers */
function shapeHits(s, x, z, r) {
  if (s.k === "c") return (x - s.x) ** 2 + (z - s.z) ** 2 < (r + s.r) ** 2;
  const c = Math.cos(s.a || 0);
  const sn = Math.sin(s.a || 0);
  const dx = x - s.x;
  const dz = z - s.z;
  const lx = Math.abs(c * dx - sn * dz) - s.hw;
  const lz = Math.abs(sn * dx + c * dz) - s.hd;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) < r;
}
function shapesOverlap(a, b) {
  // sample a's footprint as circles against b
  if (a.k === "c") return shapeHits(b, a.x, a.z, a.r);
  const c = Math.cos(a.a || 0);
  const s = Math.sin(a.a || 0);
  const r = Math.min(a.hw, a.hd);
  const n = Math.max(1, Math.round(Math.max(a.hw, a.hd) / r));
  const along = a.hw > a.hd ? "x" : "z";
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : -1 + (2 * k) / (n - 1);
    const lx = along === "x" ? t * (a.hw - r) : 0;
    const lz = along === "z" ? t * (a.hd - r) : 0;
    if (shapeHits(b, a.x + lx * c + lz * s, a.z - lx * s + lz * c, r * 0.9)) return true;
  }
  return false;
}
