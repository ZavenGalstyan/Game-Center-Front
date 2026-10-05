/**
 * Lumberjack Life — the tree system. ONE module owns every tree transition:
 *
 *   STANDING → BEING_CUT → FALLING → FALLEN → SECTIONED → (regrow) STANDING
 *
 * - Damage only arrives through `damageTree` / `damageCut`, which the tool
 *   code calls at the axe's impact frame (or per step while a chainsaw bites).
 *   Health is clamped at 0, a falling/fallen tree ignores felling damage, and
 *   the fall starts exactly once.
 * - The fall is deterministic, not a physics body: a rigid rod rotating about
 *   the cut (θ'' = k·g/L·sin θ) toward a fall direction chosen away from the
 *   player and into free space, stopped at the precomputed landing angle where
 *   the trunk meets the terrain, then a short bounce and a settle onto the
 *   ground. It cannot spin, launch, or tunnel.
 * - The fallen trunk is split into `logs` sections with cut marks between
 *   them; a section becomes a real Log the moment both of its ends are cut.
 */
import { CUT_HEIGHT, TREE, LOG } from "./constants.js";
import { speciesById, sectionHp } from "../data/species.js";
import { clamp, wrap, yawTo, pointSegDist, smooth } from "./math.js";
import { spawnLog } from "./logs.js";
import { PLAY_RADIUS } from "../data/regions.js";

export const TS = {
  STANDING: "STANDING",
  BEING_CUT: "BEING_CUT",
  FALLING: "FALLING",
  FALLEN: "FALLEN",
  SECTIONED: "SECTIONED",
  REMOVED: "REMOVED",
};

const TAPER = { birch: 0.62, pine: 0.6, fir: 0.66, spruce: 0.66, frostwood: 0.64, maple: 0.5, beech: 0.5, oak: 0.46, goldenwood: 0.46 };

export function makeTree(id, speciesId, x, z, y, rng, scale = 1) {
  const sp = speciesById(speciesId);
  const height = rng.range(sp.height[0], sp.height[1]) * scale;
  const radius = rng.range(sp.radius[0], sp.radius[1]) * (0.85 + 0.15 * scale);
  const t = {
    id,
    species: sp.id,
    variant: Math.floor(rng() * 1e6),
    x,
    z,
    y,
    rot: rng() * Math.PI * 2,
    height,
    radius,
    taper: TAPER[sp.id] ?? 0.55,
    maxHp: Math.round(sp.hp * (radius / ((sp.radius[0] + sp.radius[1]) / 2))),
    hp: 0,
    state: TS.STANDING,
    notchYaw: null,
    cutProgress: 0,
    shake: 0,
    hits: 0,
    fallYaw: 0,
    angle: 0,
    angVel: 0,
    landAngle: 1.5,
    phase: null,
    phaseT: 0,
    lie: null,
    sections: [],
    cuts: [],
    regrow: 0,
    grow: 1,
    logLen: sp.logLen,
    nLogs: sp.logs,
  };
  t.hp = t.maxHp;
  return t;
}

/** trunk length above the felling cut */
export const trunkLen = (t) => t.height - CUT_HEIGHT;
/** trunk radius at distance s above the cut */
export const radiusAt = (t, s) => t.radius * (1 - t.taper * clamp(s / trunkLen(t), 0, 1));
/** collision radius of the standing trunk (root flare included) */
export const trunkCollider = (t) => t.radius * 1.18 + 0.05;
export const stumpRadius = (t) => t.radius * 1.12;
export const isChoppable = (t) => (t.state === TS.STANDING || t.state === TS.BEING_CUT) && t.grow >= 1;
export const blocksAsTrunk = (t) => t.state === TS.STANDING || t.state === TS.BEING_CUT;
export const hasStump = (t) => t.state !== TS.STANDING && t.state !== TS.BEING_CUT && t.state !== TS.REMOVED;

/**
 * Current trunk axis: base point (on the cut) + unit direction toward the
 * crown. Standing trees point straight up; falling trees rotate about the
 * pivot; fallen trees lie along `lie`.
 */
export function trunkPose(t, out = {}) {
  const py = t.y + CUT_HEIGHT;
  if (t.state === TS.STANDING || t.state === TS.BEING_CUT) {
    out.bx = t.x; out.by = py; out.bz = t.z;
    out.dx = 0; out.dy = 1; out.dz = 0;
    return out;
  }
  if (t.state === TS.FALLING && t.phase !== "settle") {
    const s = Math.sin(t.angle);
    out.bx = t.x; out.by = py; out.bz = t.z;
    out.dx = s * Math.sin(t.fallYaw); out.dy = Math.cos(t.angle); out.dz = s * Math.cos(t.fallYaw);
    return out;
  }
  const L = t.lie;
  if (!L) {
    // defensive: a down tree without a resting pose renders as a bare stump axis
    out.bx = t.x; out.by = py; out.bz = t.z;
    out.dx = 0; out.dy = 1; out.dz = 0;
    return out;
  }
  if (t.state === TS.FALLING && t.phase === "settle") {
    const k = smooth(clamp(t.phaseT / TREE.settleTime, 0, 1));
    const s = Math.sin(t.landAngle);
    const ax = s * Math.sin(t.fallYaw);
    const ay = Math.cos(t.landAngle);
    const az = s * Math.cos(t.fallYaw);
    out.bx = t.x + (L.bx - t.x) * k;
    out.by = py + (L.by - py) * k;
    out.bz = t.z + (L.bz - t.z) * k;
    let dx = ax + (L.dx - ax) * k;
    let dy = ay + (L.dy - ay) * k;
    let dz = az + (L.dz - az) * k;
    const l = Math.hypot(dx, dy, dz) || 1;
    out.dx = dx / l; out.dy = dy / l; out.dz = dz / l;
    return out;
  }
  out.bx = L.bx; out.by = L.by; out.bz = L.bz;
  out.dx = L.dx; out.dy = L.dy; out.dz = L.dz;
  return out;
}

/** world point at distance s along the current trunk axis */
export function trunkPoint(t, s) {
  const p = trunkPose(t);
  return { x: p.bx + p.dx * s, y: p.by + p.dy * s, z: p.bz + p.dz * s };
}

/* ------------------------------------------------------------ felling */

/** pick a fall direction away from the cutter, preferring clear ground */
function chooseFallYaw(world, t, awayYaw) {
  const L = trunkLen(t) * 0.95;
  const offsets = [0, 0.28, -0.28, 0.55, -0.55, 0.85, -0.85, 1.15, -1.15];
  let best = awayYaw;
  let bestScore = Infinity;
  const P = world.player;
  for (let i = 0; i < offsets.length; i++) {
    const yaw = wrap(awayYaw + offsets[i]);
    const ex = t.x + Math.sin(yaw) * L;
    const ez = t.z + Math.cos(yaw) * L;
    let score = i * 0.05; // prefer straight away from the cutter
    for (const o of world.trees) {
      if (o === t || !blocksAsTrunk(o)) continue;
      if (pointSegDist(o.x, o.z, t.x, t.z, ex, ez).d < trunkCollider(o) + 0.45) score += 1;
    }
    for (const o of world.trees) {
      if (o === t || o.state !== TS.FALLEN) continue;
      const q = o.lie;
      const qe = { x: q.bx + q.dx * trunkLen(o), z: q.bz + q.dz * trunkLen(o) };
      if (segSeg(t.x, t.z, ex, ez, q.bx, q.bz, qe.x, qe.z) < 0.6) score += 0.8;
    }
    for (let k = 1; k <= 4; k++) {
      const px = t.x + Math.sin(yaw) * L * (k / 4);
      const pz = t.z + Math.cos(yaw) * L * (k / 4);
      if (world.terrain.padDist(px, pz) < 13.5) score += 3;
      if (Math.hypot(px, pz) > PLAY_RADIUS + 2) score += 2;
    }
    if (pointSegDist(P.x, P.z, t.x, t.z, ex, ez).d < 1.2) score += 6;
    if (score < bestScore) {
      bestScore = score;
      best = yaw;
    }
  }
  return best;
}

function segSeg(ax, az, bx, bz, cx, cz, dx, dz) {
  // cheap 2-sample approximation is enough for scoring
  const d1 = pointSegDist(cx, cz, ax, az, bx, bz).d;
  const d2 = pointSegDist(dx, dz, ax, az, bx, bz).d;
  const d3 = pointSegDist(ax, az, cx, cz, dx, dz).d;
  const d4 = pointSegDist(bx, bz, cx, cz, dx, dz).d;
  const mx = (cx + dx) / 2;
  const mz = (cz + dz) / 2;
  const d5 = pointSegDist(mx, mz, ax, az, bx, bz).d;
  return Math.min(d1, d2, d3, d4, d5);
}

/** first angle at which any part of the trunk would touch the terrain */
function computeLandAngle(world, t) {
  const H = world.terrain.heightAt;
  const L = trunkLen(t);
  const py = t.y + CUT_HEIGHT;
  const sy = Math.sin(t.fallYaw);
  const cy = Math.cos(t.fallYaw);
  for (let a = 0.4; a < 2.0; a += 0.01) {
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    for (let k = 1; k <= 8; k++) {
      const s = (L * k) / 8;
      const x = t.x + sy * sa * s;
      const z = t.z + cy * sa * s;
      const y = py + ca * s;
      if (y - H(x, z) <= radiusAt(t, s) * 0.9) return clamp(a, 1.15, 1.85);
    }
  }
  return 1.6;
}

/** final resting pose: slid a little off the stump, lying on the ground */
function computeLie(world, t) {
  const H = world.terrain.heightAt;
  const L = trunkLen(t);
  const sy = Math.sin(t.fallYaw);
  const cy = Math.cos(t.fallYaw);
  const slide = stumpRadius(t) + 0.35;
  const bx = t.x + sy * slide;
  const bz = t.z + cy * slide;
  // rest on the higher of several ground samples so no segment sinks
  const r0 = radiusAt(t, 0);
  const r1 = radiusAt(t, L);
  let by = -Infinity;
  let ey = -Infinity;
  for (let k = 0; k <= 2; k++) by = Math.max(by, H(bx + sy * k * 0.3, bz + cy * k * 0.3) + r0);
  const ex = bx + sy * L;
  const ez = bz + cy * L;
  for (let k = 0; k <= 2; k++) ey = Math.max(ey, H(ex - sy * k * 0.3, ez - cy * k * 0.3) + r1);
  // lift the line so every interior sample clears the ground too
  let lift = 0;
  for (let k = 1; k < 10; k++) {
    const f = k / 10;
    const gy = H(bx + sy * L * f, bz + cy * L * f) + radiusAt(t, L * f) * 0.92;
    const ly = by + (ey - by) * f;
    lift = Math.max(lift, gy - ly);
  }
  by += lift;
  ey += lift;
  let dx = ex - bx;
  let dy = ey - by;
  let dz = ez - bz;
  const l = Math.hypot(dx, dy, dz);
  return { bx, by, bz, dx: dx / l, dy: dy / l, dz: dz / l };
}

function setupSections(t) {
  const n = t.nLogs;
  t.sections = [];
  t.cuts = [];
  const hp = sectionHp(t.radius);
  for (let i = 0; i < n; i++) t.sections.push({ i, s0: i * t.logLen, s1: (i + 1) * t.logLen, freed: false, logId: null });
  for (let k = 1; k < n; k++) t.cuts.push({ k, s: k * t.logLen, hp, maxHp: hp, done: false, shake: 0 });
}

function startFall(world, t, fromX, fromZ) {
  const away = yawTo(fromX, fromZ, t.x, t.z);
  t.fallYaw = chooseFallYaw(world, t, away);
  t.landAngle = computeLandAngle(world, t);
  t.lie = computeLie(world, t);
  t.state = TS.FALLING;
  t.phase = "creak";
  t.phaseT = 0;
  t.angle = 0;
  t.angVel = 0;
  world.emit({ type: "treeCreak", treeId: t.id, x: t.x, z: t.z });
  world.emit({ type: "treeFelled", treeId: t.id, species: t.species });
}

/**
 * Apply felling damage. Returns the damage actually dealt (0 when the tree
 * can't take it). `fromX/Z` is the cutter's position: the notch opens on that
 * side and the tree falls away from it.
 */
export function damageTree(world, t, dmg, fromX, fromZ) {
  if (!isChoppable(t) || dmg <= 0) return 0;
  if (t.notchYaw == null) t.notchYaw = yawTo(t.x, t.z, fromX, fromZ);
  const before = t.hp;
  t.hp = Math.max(0, t.hp - dmg);
  t.state = TS.BEING_CUT;
  t.cutProgress = 1 - t.hp / t.maxHp;
  t.shake = 0.22;
  t.hits++;
  if (t.hp <= 0) startFall(world, t, fromX, fromZ);
  return before - t.hp;
}

/** Damage a cut mark on a fallen trunk; frees sections whose ends are both cut. */
export function damageCut(world, t, k, dmg) {
  if (t.state !== TS.FALLEN) return 0;
  const c = t.cuts[k];
  if (!c || c.done || dmg <= 0) return 0;
  const before = c.hp;
  c.hp = Math.max(0, c.hp - dmg);
  c.shake = 0.18;
  if (c.hp <= 0) {
    c.done = true;
    world.emit({ type: "sectionCut", treeId: t.id, k });
    freeSections(world, t);
  }
  return before - c.hp;
}

function sectionFree(t, i) {
  const n = t.sections.length;
  const left = i === 0 || t.cuts[i - 1].done;
  const right = i === n - 1 || t.cuts[i].done;
  return left && right;
}

function freeSections(world, t) {
  for (const sec of t.sections) {
    if (sec.freed || !sectionFree(t, sec.i)) continue;
    sec.freed = true;
    const L = t.lie;
    const s0 = sec.s0 + (sec.i === 0 ? 0 : LOG.kerf / 2);
    const s1 = sec.s1 - (sec.i === t.sections.length - 1 ? 0 : LOG.kerf / 2);
    const sm = (s0 + s1) / 2;
    const log = spawnLog(world, {
      species: t.species,
      len: s1 - s0,
      rA: radiusAt(t, s0),
      rB: radiusAt(t, s1),
      x: L.bx + L.dx * sm,
      z: L.bz + L.dz * sm,
      yaw: Math.atan2(L.dx, L.dz),
      treeId: t.id,
    });
    sec.logId = log.id;
    world.emit({ type: "logSpawn", logId: log.id, treeId: t.id, x: log.x, y: log.y, z: log.z });
  }
  if (t.sections.every((s) => s.freed)) {
    t.state = TS.SECTIONED;
    t.regrow = TREE.regrowDelay;
    world.emit({ type: "treeSectioned", treeId: t.id });
  }
}

/* ------------------------------------------------------------ per-step */
export function stepTree(world, t, dt) {
  if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
  for (const c of t.cuts) if (c.shake > 0) c.shake = Math.max(0, c.shake - dt);
  if (t.grow < 1) t.grow = Math.min(1, t.grow + dt / TREE.growTime);

  if (t.state === TS.FALLING) {
    t.phaseT += dt;
    if (t.phase === "creak") {
      // slow lean before the real fall: the warning
      t.angle = TREE.leanAngle * smooth(clamp(t.phaseT / TREE.creakTime, 0, 1));
      if (t.phaseT >= TREE.creakTime) {
        t.phase = "fall";
        t.phaseT = 0;
        t.angVel = 0.12;
        world.emit({ type: "treeFallStart", treeId: t.id });
      }
    } else if (t.phase === "fall") {
      const L = Math.max(3, trunkLen(t));
      const acc = TREE.fallGain * (1.5 * 9.81 / L) * Math.sin(t.angle);
      t.angVel = Math.min(t.angVel + acc * dt, 3.2);
      t.angle += t.angVel * dt;
      if (t.angle >= t.landAngle) {
        t.angle = t.landAngle;
        t.phase = "bounce";
        t.phaseT = 0;
        const mid = trunkPoint(t, trunkLen(t) * 0.55);
        world.emit({ type: "treeLand", treeId: t.id, x: mid.x, y: mid.y, z: mid.z, energy: t.angVel, species: t.species });
      }
    } else if (t.phase === "bounce") {
      const k = clamp(t.phaseT / TREE.bounceTime, 0, 1);
      t.angle = t.landAngle - TREE.bounceAmp * Math.sin(Math.PI * k) * (1 - k * 0.5);
      if (k >= 1) {
        t.angle = t.landAngle;
        t.phase = "settle";
        t.phaseT = 0;
      }
    } else if (t.phase === "settle") {
      if (t.phaseT >= TREE.settleTime) {
        t.state = TS.FALLEN;
        t.phase = null;
        setupSections(t);
        world.emit({ type: "treeFallen", treeId: t.id });
      }
    }
    return;
  }

  if (t.state === TS.SECTIONED) {
    t.regrow -= dt;
    if (t.regrow <= 0) tryRegrow(world, t);
  }
}

function tryRegrow(world, t) {
  const P = world.player;
  if (Math.hypot(P.x - t.x, P.z - t.z) < 10) {
    t.regrow = 5;
    return;
  }
  for (const l of world.logs.values()) {
    if (l.owner === "WORLD" && Math.hypot(l.x - t.x, l.z - t.z) < 1.6) {
      t.regrow = 8;
      return;
    }
  }
  const fresh = makeTree(t.id, world.pickSpecies(), t.x, t.z, t.y, world.rng, world.region.treeScale);
  Object.assign(t, fresh);
  t.grow = 0.12;
  world.emit({ type: "treeRegrow", treeId: t.id });
}

/* ------------------------------------------------------------ save / restore */
export function treeSnapshot(t) {
  const st = t.state === TS.FALLING ? TS.FALLEN : t.state;
  return {
    id: t.id,
    sp: t.species,
    v: t.variant,
    h: +t.height.toFixed(3),
    r: +t.radius.toFixed(4),
    st,
    hp: +t.hp.toFixed(2),
    ny: t.notchYaw == null ? null : +t.notchYaw.toFixed(4),
    fy: +t.fallYaw.toFixed(4),
    cuts: st === TS.FALLEN ? (t.cuts.length ? t.cuts.map((c) => +c.hp.toFixed(2)) : null) : null,
    fr: st === TS.FALLEN && t.sections.length ? t.sections.map((s) => (s.freed ? 1 : 0)) : null,
    rg: Math.round(t.regrow),
    g: +t.grow.toFixed(3),
  };
}

export function restoreTree(world, t, snap) {
  if (!snap || snap.id !== t.id) return;
  if (snap.sp && speciesById(snap.sp).id === snap.sp) {
    if (snap.sp !== t.species) {
      const sp = speciesById(snap.sp);
      t.species = sp.id;
      t.logLen = sp.logLen;
      t.nLogs = sp.logs;
      t.taper = TAPER[sp.id] ?? 0.55;
    }
    if (Number.isFinite(snap.h) && snap.h > 2) t.height = snap.h;
    if (Number.isFinite(snap.r) && snap.r > 0.05) t.radius = snap.r;
    if (Number.isFinite(snap.v)) t.variant = snap.v;
    t.maxHp = Math.round(speciesById(t.species).hp * (t.radius / ((speciesById(t.species).radius[0] + speciesById(t.species).radius[1]) / 2)));
  }
  if (Number.isFinite(snap.g)) t.grow = clamp(snap.g, 0.05, 1);
  const st = snap.st;
  if (st === TS.BEING_CUT && Number.isFinite(snap.hp) && snap.hp > 0) {
    t.state = TS.BEING_CUT;
    t.hp = Math.min(t.maxHp, snap.hp);
    t.cutProgress = 1 - t.hp / t.maxHp;
    t.notchYaw = Number.isFinite(snap.ny) ? snap.ny : 0;
  } else if (st === TS.FALLEN && Number.isFinite(snap.fy)) {
    t.state = TS.FALLEN;
    t.hp = 0;
    t.cutProgress = 1;
    t.notchYaw = Number.isFinite(snap.ny) ? snap.ny : wrap(snap.fy + Math.PI);
    t.fallYaw = snap.fy;
    t.landAngle = computeLandAngle(world, t);
    t.angle = t.landAngle;
    t.lie = computeLie(world, t);
    setupSections(t);
    if (Array.isArray(snap.cuts)) snap.cuts.forEach((hp, k) => {
      const c = t.cuts[k];
      if (c && Number.isFinite(hp)) {
        c.hp = clamp(hp, 0, c.maxHp);
        c.done = c.hp <= 0;
      }
    });
    // sections already turned into logs were saved as logs; mark them freed
    if (Array.isArray(snap.fr)) snap.fr.forEach((f, i) => {
      if (t.sections[i] && f) t.sections[i].freed = true;
    });
    // any cut that's done but whose section somehow isn't freed → free it now (spawns the log)
    freeSectionsSilently(world, t);
  } else if (st === TS.SECTIONED || st === TS.REMOVED) {
    t.state = TS.SECTIONED;
    t.hp = 0;
    t.cutProgress = 1;
    t.notchYaw = Number.isFinite(snap.ny) ? snap.ny : 0;
    t.fallYaw = Number.isFinite(snap.fy) ? snap.fy : 0;
    t.landAngle = computeLandAngle(world, t);
    t.angle = t.landAngle;
    t.lie = computeLie(world, t);
    t.regrow =Number.isFinite(snap.rg) ? clamp(snap.rg, 0, TREE.regrowDelay) : TREE.regrowDelay;
  }
}

function freeSectionsSilently(world, t) {
  const before = world.events.length;
  freeSections(world, t);
  world.events.length = before;
}
