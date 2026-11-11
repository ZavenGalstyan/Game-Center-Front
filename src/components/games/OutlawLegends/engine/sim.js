/**
 * Outlaw Legends — framework-free simulation.
 *
 * createSim(missionId, opts) builds a mission; step(S, dt, input) advances it
 * and returns the events of that step (shots, hits, pickups, dialogue…).
 * Everything gameplay-relevant lives here — including the third-person camera
 * rig, because shots are ray-cast from the camera through the crosshair — so
 * the Node test bots play exactly the game the browser shows.
 *
 * Coordinates: x right, z south, y up. A facing angle `rot` looks along
 * (−sin rot, −cos rot) (Three.js rotation.y convention).
 */
import { WEAPONS, ENEMIES, DIFFICULTY, WEAPON_ORDER } from "./data.js";
import { MISSION_BY_ID, buildMission } from "./missions.js";
import { collideCircle, rayObstacles, segmentBlocked, rayCylinder, raySphere, buildGrid, findPath, cellOf, walkable, clamp, lerp, angDiff, faceAngle, rng } from "./geom.js";

const GRAV = 16;
const SPEED = { walk: 4.6, sprint: 7.4, crouch: 2.5, aim: 3.3 };
const PR = 0.4; // player radius
const ER = 0.42; // enemy radius
const NOISE_R = 34;
const LINE_TIME = (text) => clamp(1.6 + text.length * 0.048, 2.6, 6.5);

/* ====================================================================== setup */

export function createSim(missionId, opts = {}) {
  const M = MISSION_BY_ID[missionId];
  if (!M) throw new Error(`unknown mission ${missionId}`);
  const L = buildMission(M);
  const stats = opts.stats;
  const diffKey = DIFFICULTY[opts.difficulty] ? opts.difficulty : "normal";
  const S = {
    M,
    L,
    obs: L.obs,
    grid: null,
    diff: DIFFICULTY[diffKey],
    diffKey,
    tier: 1 + (M.id - 1) * 0.035,
    rand: rng(opts.seed || M.id * 7919 + 13),
    stats,
    t: 0,
    status: "play",
    events: [],
    enemies: [],
    nextEnemyId: 1,
    projectiles: [],
    timed: [],
    pickups: [],
    nextPickupId: 1,
    objects: new Map(),
    npcs: [],
    spawned: new Set(),
    stepI: -1,
    stepT: 0,
    step: null,
    wavesDone: 0,
    say: [],
    sayT: 0,
    toast: null,
    checkpoint: null,
    duel: null,
    deadReason: null,
    endT: 0,
    deadEye: { on: false, meter: 1 },
    timeScale: 1,
    earn: { xp: 0, money: 0 },
    counters: { kills: 0, headshots: 0, shots: 0, hits: 0, takedowns: 0, melee: 0, deaths: 0, damage: 0 },
    noiseT: 0,
    cam: { yaw: 0, pitch: -0.08, pos: [0, 2, 5], dir: [0, 0, -1], fov: 60, aim: 0, shake: 0, cine: null },
    assist: opts.assist ?? true,
  };
  S.grid = buildGrid(L.bounds, L.obs);
  // player
  const [sx, sz, sr = 0] = M.start;
  const owned = [...stats.owned];
  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: WEAPONS[id].mag, res: WEAPONS[id].reserve };
  S.P = {
    x: sx,
    z: sz,
    y: 0,
    vy: 0,
    vx: 0,
    vz: 0,
    rot: (sr * Math.PI) / 180,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    st: stats.maxStamina,
    maxSt: stats.maxStamina,
    w: owned[0] || "revolver",
    owned,
    ammo,
    fireCd: 0,
    reloadT: 0,
    reloadNeed: 0,
    switchT: 0,
    aimT: 0,
    bloom: 0,
    crouch: false,
    sprint: false,
    moving: 0,
    roll: null,
    rollCd: 0,
    melee: null,
    combo: 0,
    comboT: 0,
    block: false,
    blockT: 0,
    hurtT: 0,
    downT: 0,
    takedown: null,
    use: null,
    regenT: 0,
    lastShot: -9,
    shotT: 9,
    dualSide: 0,
    holster: false,
    exhausted: false,
    onGround: true,
    alive: true,
  };
  S.cam.yaw = S.P.rot;
  // npcs & objects
  for (const n of M.npcs || []) S.npcs.push({ ...n, rot: ((n.rot || 0) * Math.PI) / 180, talkT: 0 });
  for (const o of M.objects || []) S.objects.set(o.id, { ...o, y: o.y ?? 0, done: false, hp: o.hp, maxHp: o.hp, rot: ((o.rot || 0) * Math.PI) / 180 });
  for (const gname of M.spawn || []) spawnGroup(S, gname);
  // supplies placed in the level (ammo boxes, tonics)
  for (const [kind, x, z, amount] of M.pickups || []) addPickup(S, kind, x, z, amount ?? (kind === "tonic" ? 40 : 1));
  startStep(S, 0);
  updateCamera(S, 1);
  return S;
}

const emit = (S, type, data = {}) => S.events.push({ type, ...data });

function sayLines(S, lines) {
  if (!lines) return;
  for (const [who, text] of lines) S.say.push({ who, text, t: LINE_TIME(text) });
}

/* ====================================================================== enemies */

function makeEnemy(S, type, x, z, opt = {}, group = null) {
  const base = ENEMIES[type];
  const boss = opt.boss || null;
  const hpMul = S.diff.hp * (boss ? 1 : S.tier);
  const hp = Math.round((boss?.hp || base.hp) * hpMul);
  const e = {
    id: S.nextEnemyId++,
    type,
    def: base,
    look: opt.look || base.look,
    name: opt.name || null,
    group,
    x,
    z,
    y: 0,
    rot: opt.rot != null ? (opt.rot * Math.PI) / 180 : faceAngle(S.P.x - x, S.P.z - z),
    hp,
    maxHp: hp,
    alive: true,
    state: "idle",
    alert: !!opt.alert,
    alertOpt: !!opt.alert,
    hold: !!opt.hold,
    siege: !!opt.siege,
    ko: !!opt.ko,
    patrol: opt.patrol || null,
    patrolI: 0,
    spawn: { x, z, rot: opt.rot != null ? (opt.rot * Math.PI) / 180 : null },
    lastKnown: opt.alert ? [S.P.x, S.P.z] : null,
    sees: false,
    seeT: 0,
    lostT: 0,
    perceiveT: S.rand() * 0.2,
    path: null,
    pathT: 0,
    goal: null,
    stuckT: 0,
    speed: 0,
    aimT: 0,
    fireCd: 0.6 + S.rand() * 1.2,
    burst: 0,
    burstT: 0,
    shotT: 9,
    meleeCd: 0.5,
    atk: null,
    blockT: 0,
    crouch: false,
    cover: null,
    coverT: 0,
    coverCd: 0,
    coverCycles: 0,
    strafeT: 0,
    hurtT: 0,
    downT: 0,
    stunT: 0,
    deadT: 0,
    kvx: 0,
    kvz: 0,
    orbitA: Math.atan2(z - S.P.z, x - S.P.x),
    orbitDir: S.rand() < 0.5 ? 1 : -1,
    boss: boss ? { ...boss, specialCd: 3 + S.rand() * 2, phase: 1, summoned: false } : null,
    tele: null,
    charge: null,
    duel: false,
  };
  if (boss) e.rate = base.rate;
  S.enemies.push(e);
  return e;
}

function spawnGroup(S, name) {
  const list = S.M.groups?.[name];
  if (!list || S.spawned.has(name)) return;
  S.spawned.add(name);
  for (const [type, x, z, opt] of list) makeEnemy(S, type, x, z, opt || {}, name);
  emit(S, "spawn", { group: name });
}

const living = (S) => S.enemies.filter((e) => e.alive);
const groupDone = (S, name) => S.spawned.has(name) && !S.enemies.some((e) => e.group === name && e.alive);

function eyeY(e) {
  return e.def.mounted ? 2.45 : e.crouch ? 1.05 : 1.55;
}
function playerHead(S) {
  const P = S.P;
  return P.crouch ? 1.0 : P.roll ? 0.8 : 1.5;
}
function playerChest(S) {
  const P = S.P;
  return P.y + (P.crouch ? 0.8 : P.roll ? 0.6 : 1.2);
}

/** Can enemy e see the player right now (range, view cone, line of sight)? */
function canSee(S, e) {
  const P = S.P;
  if (!P.alive) return false;
  const dx = P.x - e.x, dz = P.z - e.z;
  const d = Math.hypot(dx, dz);
  let view = e.def.view * (S.M.theme === "night" || S.M.theme === "dusk" ? 0.85 : 1);
  if (!e.alert) {
    if (P.crouch) view *= 0.5;
    if (d > 4) {
      const a = Math.abs(angDiff(e.rot, faceAngle(dx, dz)));
      if (a > 1.0) return false;
    }
  }
  if (d > view) return false;
  const ey = eyeY(e);
  // two probes: head and chest
  if (segmentBlocked(e.x, ey, e.z, P.x, P.y + playerHead(S), P.z, S.obs) < 0) return true;
  return segmentBlocked(e.x, ey, e.z, P.x, playerChest(S), P.z, S.obs) < 0;
}

function alertEnemy(S, e, x, z) {
  if (!e.alive) return;
  if (!e.alert) {
    e.alert = true;
    e.fireCd = Math.max(e.fireCd, 0.5 + S.rand() * 0.6);
    emit(S, "alert", { id: e.id });
  }
  e.lastKnown = [x, z];
}

function makeNoise(S, x, z, r) {
  for (const e of S.enemies) {
    if (!e.alive || e.duel) continue;
    if (Math.hypot(e.x - x, e.z - z) < r) alertEnemy(S, e, S.P.x, S.P.z);
  }
}

/* ====================================================================== damage */

function addXp(S, amount, why) {
  if (amount <= 0) return;
  S.earn.xp += amount;
  emit(S, "xp", { amount, why });
}

function dropLoot(S, e) {
  const r = S.rand();
  const money = Math.round(e.def.money * (0.8 + S.rand() * 0.5) * (e.boss ? 1 : 1));
  addPickup(S, "cash", e.x + (S.rand() - 0.5) * 0.8, e.z + (S.rand() - 0.5) * 0.8, money);
  if (r < 0.6 || e.boss) addPickup(S, "ammo", e.x + 0.7, e.z - 0.3, 1);
  if (r > 0.82 || e.boss) addPickup(S, "tonic", e.x - 0.6, e.z + 0.4, 35);
}

function addPickup(S, kind, x, z, amount) {
  // keep pickups out of solid boxes
  const c = collideCircle(x, z, 0.3, 0, S.obs);
  S.pickups.push({ id: S.nextPickupId++, kind, x: c.x, z: c.z, amount, t: 0 });
}

function killEnemy(S, e, how, head = false) {
  e.alive = false;
  e.state = e.ko && how !== "takedown" ? "ko" : "dead";
  e.deadT = 0;
  e.atk = null;
  e.tele = null;
  e.charge = null;
  e.aimT = 0;
  S.counters.kills++;
  if (how === "melee" || how === "takedown") S.counters.melee++;
  let xp = Math.round(e.def.xp * (e.boss ? 1 : 1));
  if (e.boss && e.def.xp < 100) xp += 120;
  addXp(S, xp, e.name || e.def.name);
  if (head) {
    S.counters.headshots++;
    addXp(S, 5, "Headshot");
  }
  if (how === "takedown") addXp(S, 15, "Takedown");
  if (S.deadEye.on || S.stats.deadEye) S.deadEye.meter = Math.min(1, S.deadEye.meter + (head ? 0.2 : 0.12));
  if (!e.duel) dropLoot(S, e);
  emit(S, "kill", { id: e.id, x: e.x, z: e.z, how, head, boss: !!e.boss, name: e.name, ko: e.state === "ko" });
  // nearby allies get angry
  makeNoise(S, e.x, e.z, 16);
}

/** Bullet/melee damage to an enemy. kx,kz = knockback (m/s). */
function damageEnemy(S, e, dmg, { kx = 0, kz = 0, head = false, how = "gun", stun = 0, down = false, x, y, z } = {}) {
  if (!e.alive) return false;
  if (e.blockT > 0 && how === "melee" && !down) {
    dmg *= 0.15;
    emit(S, "blocked", { id: e.id, x: e.x, z: e.z });
  }
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  S.counters.damage += dmg;
  emit(S, "hit", { id: e.id, dmg, head, how, x: x ?? e.x, y: y ?? 1.3, z: z ?? e.z, kill: e.hp <= 0 });
  alertEnemy(S, e, S.P.x, S.P.z);
  if (e.hp <= 0) {
    killEnemy(S, e, how, head);
    e.kvx = kx * 0.8;
    e.kvz = kz * 0.8;
    return true;
  }
  if (e.boss && !e.boss.halved && e.hp < e.maxHp * 0.5) {
    e.boss.halved = true;
    e.boss.phase = 2;
    emit(S, "phase", { id: e.id, name: e.name });
    if (e.boss.specials.includes("summon") && !e.boss.summoned) {
      e.boss.summoned = true;
      spawnGroup(S, "adds");
      emit(S, "summon", { name: e.name });
    }
  }
  const heavy = e.boss || e.def.mounted;
  e.hurtT = 0.22;
  if (!heavy) {
    e.kvx += kx;
    e.kvz += kz;
    if (dmg >= 18 && S.rand() < 0.5) e.aimT = 0;
    if (down || Math.hypot(kx, kz) > 5.5) {
      e.state = "down";
      e.downT = 1.5;
      e.atk = null;
      e.aimT = 0;
      e.crouch = false;
      e.cover = null;
    } else if (stun > 0) {
      e.stunT = Math.max(e.stunT, stun);
      e.atk = null;
    }
  } else {
    e.kvx += kx * 0.2;
    e.kvz += kz * 0.2;
  }
  return false;
}

function damagePlayer(S, dmg, { x, z, kind = "bullet", src = null, knock = 0 } = {}) {
  const P = S.P;
  if (!P.alive || S.status !== "play") return 0;
  if (P.takedown) return 0;
  if (P.roll && P.roll.t > 0.04 && P.roll.t < 0.38 && kind !== "blast") {
    emit(S, "dodged", {});
    return 0;
  }
  if (P.roll && kind === "blast") dmg *= 0.5;
  dmg *= S.diff.dmg * (S.tier * 0.35 + 0.65);
  if (kind === "bullet" && S.stats.toughHide) dmg *= 0.85;
  // blocking (attack must come from the front)
  if (P.block && x != null) {
    const front = Math.cos(angDiff(P.rot, faceAngle(x - P.x, z - P.z)));
    if (front > 0.1) {
      if (kind === "melee") {
        if (S.stats.counter && P.blockT < 0.3 && src) {
          src.stunT = 1.6;
          src.atk = null;
          emit(S, "counter", { id: src.id, x: src.x, z: src.z });
          addXp(S, 5, "Counter");
          return 0;
        }
        dmg *= 0.15;
        P.st = Math.max(0, P.st - 12);
        emit(S, "blockHit", {});
      } else if (kind === "bullet") {
        dmg *= 0.65;
      }
    }
  }
  dmg = Math.max(1, Math.round(dmg));
  P.hp -= dmg;
  P.hurtT = 0.3;
  P.regenT = 0;
  S.cam.shake = Math.min(1, S.cam.shake + dmg / 30);
  if (knock > 0 && x != null) {
    const d = Math.hypot(P.x - x, P.z - z) || 1;
    P.vx += ((P.x - x) / d) * knock;
    P.vz += ((P.z - z) / d) * knock;
    if (knock > 5) {
      P.downT = 0.9;
      P.melee = null;
      P.roll = null;
    }
  }
  emit(S, "hurt", { dmg, x, z, kind });
  if (P.hp <= 0) {
    P.hp = 0;
    P.alive = false;
    S.counters.deaths++;
    S.status = "dead";
    S.deadReason = kind === "duel" ? "duel" : "killed";
    S.deadEye.on = false;
    emit(S, "dead", { reason: S.deadReason });
  }
  return dmg;
}

/* ====================================================================== player */

function weaponStats(S, id) {
  return S.stats.weapons[id];
}

function startReload(S) {
  const P = S.P;
  const w = weaponStats(S, P.w);
  const a = P.ammo[P.w];
  if (P.reloadT > 0 || a.mag >= w.mag || a.res <= 0) return false;
  P.reloadNeed = w.reloadType === "round" ? w.reload : w.reload;
  P.reloadT = P.reloadNeed;
  emit(S, "reload", { w: P.w });
  return true;
}

function finishReload(S) {
  const P = S.P;
  const w = weaponStats(S, P.w);
  const a = P.ammo[P.w];
  if (w.reloadType === "round") {
    if (a.res > 0 && a.mag < w.mag) {
      a.mag++;
      a.res--;
      emit(S, "shell", { w: P.w });
      if (a.mag < w.mag && a.res > 0) {
        P.reloadT = w.reload;
        return;
      }
    }
  } else {
    const n = Math.min(w.mag - a.mag, a.res);
    a.mag += n;
    a.res -= n;
    emit(S, "reloaded", { w: P.w });
  }
  P.reloadT = 0;
}

function switchWeapon(S, id) {
  const P = S.P;
  if (!P.owned.includes(id) || P.w === id) return;
  P.w = id;
  P.reloadT = 0;
  P.switchT = S.stats.quickDraw ? 0.18 : 0.36;
  P.fireCd = Math.max(P.fireCd, 0.1);
  emit(S, "switch", { w: id });
}

export function giveWeapon(S, id) {
  const P = S.P;
  if (!P.owned.includes(id)) {
    P.owned.push(id);
    P.owned.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
  }
  P.ammo[id] = { mag: WEAPONS[id].mag, res: WEAPONS[id].reserve };
  switchWeapon(S, id);
  emit(S, "newWeapon", { w: id });
}

export function muzzle(S) {
  const P = S.P;
  const fx = -Math.sin(P.rot), fz = -Math.cos(P.rot);
  const rx = Math.cos(P.rot), rz = -Math.sin(P.rot);
  const side = P.w === "dual" ? (P.dualSide ? -0.32 : 0.32) : 0.3;
  const y = P.y + (P.crouch ? 1.0 : 1.38);
  return [P.x + fx * 0.65 + rx * side, y, P.z + fz * 0.65 + rz * side];
}

/** Hitscan one ray from the camera. Returns {t, kind, e, head, obj, point, normal}. */
function castShot(S, ox, oy, oz, dx, dy, dz, tMin, tMax, ignoreObjects = false) {
  let best = tMax, res = { kind: "none" };
  const ro = rayObstacles(ox + dx * tMin, oy + dy * tMin, oz + dz * tMin, dx, dy, dz, S.obs, tMax - tMin);
  if (ro.b) {
    best = ro.t + tMin;
    res = { kind: ro.b === "ground" ? "ground" : "obs", b: ro.b, n: ro.n };
  }
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const mounted = e.def.mounted;
    const big = e.boss ? 1.12 : 1;
    const r = (mounted ? 0.75 : 0.36) * big;
    const y0 = mounted ? 0.25 : 0;
    const y1 = (mounted ? 2.35 : e.crouch ? 1.05 : e.state === "down" ? 0.5 : 1.5) * (mounted ? 1 : big);
    const hy = mounted ? 2.62 : e.crouch ? 1.22 : e.state === "down" ? 0.3 : 1.7 * big;
    const tb = rayCylinder(ox, oy, oz, dx, dy, dz, e.x, e.z, r, y0, y1, best);
    const th = raySphere(ox, oy, oz, dx, dy, dz, e.x, hy, e.z, 0.21 * big, best);
    const t = Math.min(tb, th);
    if (t >= tMin && t < best) {
      best = t;
      res = { kind: "enemy", e, head: th <= tb + 0.05 && th < Infinity && e.state !== "down" };
    }
  }
  if (!ignoreObjects) {
    for (const o of S.objects.values()) {
      if (o.kind !== "bottle" || o.done) continue;
      const tb = rayCylinder(ox, oy, oz, dx, dy, dz, o.x, o.z, 0.12, o.y - 0.02, o.y + 0.36, best);
      if (tb >= tMin && tb < best) {
        best = tb;
        res = { kind: "bottle", obj: o };
      }
    }
  }
  res.t = best;
  res.point = [ox + dx * best, oy + dy * best, oz + dz * best];
  return res;
}

function spreadDir(S, d, spread) {
  if (spread <= 0) return d;
  // random cone around d
  const a = S.rand() * Math.PI * 2, r = Math.sqrt(S.rand()) * spread;
  // basis
  let ux = -d[2], uz = d[0];
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul;
  uz /= ul;
  const vx = d[1] * uz, vy = d[2] * ux - d[0] * uz, vz = -d[1] * ux;
  const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
  const nx = d[0] + ux * cx + vx * cy, ny = d[1] + vy * cy, nz = d[2] + uz * cx + vz * cy;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

function fire(S) {
  const P = S.P, C = S.cam;
  const w = weaponStats(S, P.w);
  const a = P.ammo[P.w];
  if (a.mag <= 0) {
    if (!startReload(S)) emit(S, "dry", { w: P.w });
    P.fireCd = 0.25;
    return;
  }
  if (P.reloadT > 0 && w.reloadType !== "round") return;
  P.reloadT = 0;
  a.mag--;
  P.fireCd = w.rate;
  P.lastShot = S.t;
  P.shotT = 0;
  P.dualSide ^= 1;
  P.sprint = false;
  P.rot = C.yaw;
  S.counters.shots++;
  const moving = P.moving > 0.5;
  let spread = lerp(w.spread, w.aimSpread, C.aim) + (moving ? w.moveSpread : 0) + (P.onGround ? 0 : 0.04) + P.bloom;
  if (P.crouch) spread *= 0.75;
  P.bloom = Math.min(0.05, P.bloom + w.recoil * 0.35);
  const mz = muzzle(S);
  const [ox, oy, oz] = C.pos;
  const d = C.dir;
  // skip anything between camera and the player
  const tMin = Math.max(0, (P.x - ox) * d[0] + (P.y + 1.3 - oy) * d[1] + (P.z - oz) * d[2]) * 0.85;
  let hitAny = false;
  const tracers = [];
  for (let k = 0; k < w.pellets; k++) {
    const dir = spreadDir(S, d, spread);
    const r = castShot(S, ox, oy, oz, dir[0], dir[1], dir[2], tMin, 140);
    let p = r.point;
    let res = r;
    // gun → target must be clear too (no shooting round the corner the camera sees past)
    if (r.kind !== "none") {
      const f = segmentBlocked(mz[0], mz[1], mz[2], p[0], p[1], p[2], S.obs);
      if (f >= 0 && f < 0.97) {
        p = [mz[0] + (p[0] - mz[0]) * f, mz[1] + (p[1] - mz[1]) * f, mz[2] + (p[2] - mz[2]) * f];
        res = { kind: "obs" };
      }
    }
    const dist = Math.hypot(p[0] - mz[0], p[1] - mz[1], p[2] - mz[2]);
    let mul = 1;
    if (dist > w.range) mul = Math.max(0.4, 1 - (0.6 * (dist - w.range)) / Math.max(1, w.maxRange - w.range));
    if (res.kind === "enemy") {
      const e = res.e;
      const kd = Math.hypot(e.x - P.x, e.z - P.z) || 1;
      const kn = (w.knock * mul) / Math.max(1, w.pellets / 4);
      let dmg = w.dmg * mul * (res.head ? w.headMul : 1);
      if (S.deadEye.on) dmg *= 1.25;
      damageEnemy(S, e, dmg, { head: res.head, kx: ((e.x - P.x) / kd) * kn, kz: ((e.z - P.z) / kd) * kn, x: p[0], y: p[1], z: p[2], down: w.id === "shotgun" && kd < 4 && k === 0 && w.pellets > 1 && S.rand() < 0.5 });
      hitAny = true;
    } else if (res.kind === "bottle") {
      res.obj.done = true;
      emit(S, "bottle", { id: res.obj.id, x: res.obj.x, y: res.obj.y, z: res.obj.z });
      hitAny = true;
    } else if (res.kind !== "none") {
      emit(S, "impact", { x: p[0], y: p[1], z: p[2], mat: res.b === "ground" || r.kind === "ground" ? "dirt" : res.b?.kind || "wood" });
    }
    if (k < 3 || w.pellets <= 3) tracers.push(p);
  }
  if (hitAny) S.counters.hits++;
  emit(S, "fire", { w: P.w, mx: mz[0], my: mz[1], mz: mz[2], tracers, side: P.dualSide });
  // recoil
  const kick = w.recoil * (0.75 + S.rand() * 0.5) * (C.aim > 0.5 ? 0.8 : 1);
  C.pitch = clamp(C.pitch + kick, -1.1, 0.75);
  C.yaw += (S.rand() - 0.5) * kick * 0.6;
  // noise
  makeNoise(S, P.x, P.z, NOISE_R);
}

/** Melee: F punch combo (3rd hit knocks down), V kick. */
function startMelee(S, kind) {
  const P = S.P;
  if (P.melee || P.roll || P.downT > 0) {
    if (P.melee && kind === "punch" && P.melee.kind === "punch" && P.melee.t > 0.12) P.melee.queued = true;
    return;
  }
  const cost = kind === "kick" ? 16 : 7;
  if (P.st < cost * 0.5) {
    emit(S, "tired", {});
    return;
  }
  P.st = Math.max(0, P.st - cost);
  P.block = false;
  P.reloadT = 0;
  let i = 0;
  if (kind === "punch") {
    i = P.comboT > 0 ? (P.combo + 1) % 3 : 0;
    P.combo = i;
  }
  // soft lock-on: turn toward the nearest enemy in front
  let best = null, bd = 3.2;
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    if (d > bd) continue;
    const a = Math.abs(angDiff(S.cam.yaw, faceAngle(e.x - P.x, e.z - P.z)));
    if (a > 1.2) continue;
    best = e;
    bd = d;
  }
  P.rot = best ? faceAngle(best.x - P.x, best.z - P.z) : S.cam.yaw;
  const dur = kind === "kick" ? 0.62 : i === 2 ? 0.52 : 0.36;
  const hitAt = kind === "kick" ? 0.24 : i === 2 ? 0.2 : 0.13;
  P.melee = { kind, i, t: 0, dur, hitAt, done: false, queued: false };
  emit(S, "swing", { kind, i });
}

function meleeHit(S) {
  const P = S.P;
  const m = P.melee;
  const kick = m.kind === "kick";
  const range = kick ? 2.0 : 1.75;
  const fx = -Math.sin(P.rot), fz = -Math.cos(P.rot);
  let hits = 0;
  const targets = S.enemies.filter((e) => e.alive).map((e) => ({ e, d: Math.hypot(e.x - P.x, e.z - P.z) })).filter((o) => o.d < range + (o.e.def.mounted ? 0.5 : 0)).sort((a, b) => a.d - b.d);
  for (const { e, d } of targets) {
    const dot = ((e.x - P.x) * fx + (e.z - P.z) * fz) / (d || 1);
    if (dot < 0.35 && d > 0.7) continue;
    const base = kick ? 24 : m.i === 2 ? 26 : m.i === 1 ? 16 : 13;
    const dmg = base * S.stats.melee;
    const kn = kick ? 7 : m.i === 2 ? 6.5 : 1.6;
    const breakGuard = kick;
    if (e.blockT > 0 && breakGuard) e.blockT = 0;
    // brawlers sometimes raise their guard against punches
    if (!kick && e.def.meleeOnly && !e.boss && e.blockT <= 0 && e.state !== "down" && e.stunT <= 0 && S.rand() < 0.22) e.blockT = 0.7;
    damageEnemy(S, e, dmg, { kx: fx * kn, kz: fz * kn, how: "melee", stun: kick ? 0.6 : 0.35, down: kick || m.i === 2, x: e.x, y: 1.4, z: e.z });
    hits++;
    if (!kick) break; // punches hit one target, kicks up to two
    if (hits >= 2) break;
  }
  if (hits) {
    emit(S, "punch", { kind: m.kind, i: m.i, x: P.x + fx, z: P.z + fz });
    makeNoise(S, P.x, P.z, 10);
  }
}

/** Something to press E on: takedown > talk > interact. */
export function interactTarget(S) {
  const P = S.P;
  if (!P.alive || S.status !== "play" || S.duel) return null;
  // takedown
  let td = null, tdD = 1.9;
  for (const e of S.enemies) {
    if (!e.alive || e.boss || e.def.mounted) continue;
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    if (d > tdD) continue;
    const behind = !e.alert && Math.abs(angDiff(e.rot, faceAngle(P.x - e.x, P.z - e.z))) > 1.9;
    if (e.state === "down" || e.stunT > 0.2 || behind) {
      td = e;
      tdD = d;
    }
  }
  if (td) return { kind: "takedown", e: td, text: "Takedown" };
  const st = S.step;
  // talk
  for (const n of S.npcs) {
    if (Math.hypot(n.x - P.x, n.z - P.z) < 2.6) {
      const isStep = st?.type === "talk" && st.npc === n.id;
      return { kind: "talk", npc: n, text: isStep ? `Talk to ${n.name}` : `Talk to ${n.name}`, step: isStep };
    }
  }
  if (st && st.type === "interact") {
    for (const id of st.ids) {
      const o = S.objects.get(id);
      if (!o || o.done) continue;
      if (Math.hypot(o.x - P.x, o.z - P.z) < 2.2) return { kind: "use", obj: o, text: st.verb || "Use", hold: st.hold ?? 0.6 };
    }
  }
  return null;
}

function updatePlayer(S, dt, inp) {
  const P = S.P, C = S.cam;
  P.shotT += dt;
  P.hurtT = Math.max(0, P.hurtT - dt);
  P.fireCd = Math.max(0, P.fireCd - dt);
  P.switchT = Math.max(0, P.switchT - dt);
  P.rollCd = Math.max(0, P.rollCd - dt);
  P.comboT = Math.max(0, P.comboT - dt);
  P.bloom = Math.max(0, P.bloom - dt * 0.12);
  if (!P.alive) return;
  const fists = !!S.step?.fists;
  P.holster = fists;

  // knocked down
  if (P.downT > 0) {
    P.downT -= dt;
    P.block = false;
    P.crouch = false;
    moveBody(S, P, dt, 0, 0);
    return;
  }
  // takedown animation locks the player in place
  if (P.takedown) {
    const td = P.takedown;
    td.t += dt;
    if (!td.done && td.t > 0.45) {
      td.done = true;
      if (td.e.alive) {
        td.e.hp = 0;
        S.counters.takedowns++;
        emit(S, "hit", { id: td.e.id, dmg: td.e.maxHp, head: false, how: "takedown", x: td.e.x, y: 1.2, z: td.e.z, kill: true });
        killEnemy(S, td.e, "takedown");
      }
    }
    if (td.t > 0.85) P.takedown = null;
    return;
  }

  // stamina
  const exhaustedNow = P.st <= 1;
  if (exhaustedNow) P.exhausted = true;
  if (P.exhausted && P.st > P.maxSt * 0.3) P.exhausted = false;

  // weapon select
  if (inp.weapon && !fists) {
    const id = WEAPON_ORDER[inp.weapon - 1];
    if (id && P.owned.includes(id)) switchWeapon(S, id);
  }
  if (inp.wheel && !fists && P.owned.length > 1) {
    const i = P.owned.indexOf(P.w);
    switchWeapon(S, P.owned[(i + (inp.wheel > 0 ? 1 : -1) + P.owned.length) % P.owned.length]);
  }

  // crouch toggle (sprint or jump stands you up)
  if (inp.crouch) {
    P.crouch = !P.crouch;
    emit(S, "crouch", { on: P.crouch });
  }

  // block
  const wantBlock = (!!inp.block || (fists && !!inp.aim)) && !P.melee && !P.roll && P.st > 2;
  if (wantBlock && !P.block) P.blockT = 0;
  P.block = wantBlock;
  if (P.block) {
    P.blockT += dt;
    P.st = Math.max(0, P.st - dt * 4);
  }

  // dodge roll
  if (inp.dodge && !P.roll && P.rollCd <= 0 && P.onGround && P.st >= 12 && !P.melee) {
    P.st -= 20;
    const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw);
    const rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
    let dx = fx * inp.mz + rx * inp.mx, dz = fz * inp.mz + rz * inp.mx;
    const l = Math.hypot(dx, dz);
    if (l < 0.1) {
      dx = -fx;
      dz = -fz;
    } else {
      dx /= l;
      dz /= l;
    }
    P.roll = { t: 0, dx, dz };
    P.rot = faceAngle(dx, dz);
    P.crouch = false;
    P.block = false;
    P.reloadT = 0;
    P.rollCd = 0.55;
    emit(S, "roll", {});
  }

  // melee
  if (inp.melee) startMelee(S, "punch");
  if (inp.kick) startMelee(S, "kick");
  if (P.melee) {
    const m = P.melee;
    m.t += dt;
    if (!m.done && m.t >= m.hitAt) {
      m.done = true;
      meleeHit(S);
    }
    if (m.t >= m.dur) {
      const q = m.queued && m.kind === "punch";
      P.melee = null;
      P.comboT = 0.45;
      if (q) startMelee(S, "punch");
    }
  }

  // aim
  const aiming = !!inp.aim && !P.roll && !P.melee && !fists && P.switchT <= 0;
  C.aim = clamp(C.aim + (aiming ? dt * 7 : -dt * 6), 0, 1);
  P.aimT = C.aim;

  // movement
  let speed = SPEED.walk;
  const wantSprint = !!inp.sprint && inp.mz > 0.2 && !aiming && !P.block && !P.exhausted && P.st > 0;
  P.sprint = wantSprint && !P.melee;
  if (P.sprint) {
    P.crouch = false;
    speed = SPEED.sprint;
    P.st = Math.max(0, P.st - dt * 15);
  } else {
    P.st = Math.min(P.maxSt, P.st + dt * (P.block ? 0 : 22));
  }
  if (P.crouch) speed = SPEED.crouch;
  if (aiming) speed = Math.min(speed, SPEED.aim);
  if (P.block) speed = Math.min(speed, 2.2);
  if (P.melee) speed = 1.2;
  if (P.reloadT > 0) speed = Math.min(speed, 3.8);
  const fx = -Math.sin(C.yaw), fz = -Math.cos(C.yaw);
  const rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
  let mx = fx * inp.mz + rx * inp.mx, mzv = fz * inp.mz + rz * inp.mx;
  if (P.roll) {
    P.roll.t += dt;
    const k = P.roll.t < 0.42 ? 1 : 0.4;
    mx = P.roll.dx * 9.5 * k;
    mzv = P.roll.dz * 9.5 * k;
    moveBody(S, P, dt, mx, mzv);
    if (P.roll.t > 0.5) P.roll = null;
  } else {
    moveBody(S, P, dt, mx * speed, mzv * speed);
  }
  P.moving = Math.hypot(mx, mzv) * (P.roll ? 0 : speed);

  // jump
  if (inp.jump && P.onGround && !P.roll && !P.melee && P.st > 5) {
    P.vy = 5.6;
    P.onGround = false;
    P.crouch = false;
    P.st -= 6;
    emit(S, "jump", {});
  }

  // facing
  const combat = aiming || S.t - P.lastShot < 0.7 || P.block || P.reloadT > 0;
  if (!P.melee && !P.roll) {
    if (combat) P.rot = C.yaw;
    else if (P.moving > 0.3) {
      const target = faceAngle(mx, mzv);
      P.rot += angDiff(P.rot, target) * Math.min(1, dt * 12);
    }
  }

  // reload
  if (inp.reload && !fists) startReload(S);
  if (P.reloadT > 0) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) finishReload(S);
  }

  // shooting
  const w = weaponStats(S, P.w);
  const trig = w.auto ? inp.fire : inp.fireP;
  if (fists) {
    if (inp.fireP && !P.roll && !P.block) startMelee(S, "punch");
  } else if (trig && !P.roll && !P.melee && P.switchT <= 0 && !P.block && P.fireCd <= 0) fire(S);

  // auto reload on empty
  if (!fists && P.ammo[P.w].mag === 0 && P.reloadT <= 0 && P.fireCd <= 0 && P.ammo[P.w].res > 0 && !P.roll) startReload(S);

  // interact
  const it = interactTarget(S);
  S.prompt = it;
  if (it && it.kind === "takedown" && inp.interact) {
    P.takedown = { t: 0, e: it.e, done: false };
    it.e.state = "takendown";
    it.e.atk = null;
    it.e.aimT = 0;
    P.rot = faceAngle(it.e.x - P.x, it.e.z - P.z);
    emit(S, "takedown", { id: it.e.id });
  } else if (it && it.kind === "talk" && inp.interact) {
    talkTo(S, it.npc);
  } else if (it && it.kind === "use") {
    if (inp.interactHeld) {
      if (!P.use || P.use.id !== it.obj.id) P.use = { id: it.obj.id, t: 0, need: it.hold };
      P.use.t += dt;
      if (P.use.t >= P.use.need) {
        P.use = null;
        useObject(S, it.obj);
      }
    } else P.use = null;
  } else P.use = null;

  // completely out of ammo → a supply box turns up close by
  if (!fists) {
    const total = P.owned.reduce((n, id) => n + P.ammo[id].mag + P.ammo[id].res, 0);
    P.dryT = total === 0 ? (P.dryT || 0) + dt : 0;
    if (P.dryT > 2 && !S.pickups.some((k) => k.kind === "ammo" && Math.hypot(k.x - P.x, k.z - P.z) < 12)) {
      P.dryT = -6;
      const bx = P.x + Math.sin(P.rot) * 2.5, bz = P.z + Math.cos(P.rot) * 2.5;
      addPickup(S, "ammo", bx, bz, 1);
      emit(S, "supply", { x: bx, z: bz });
    }
  }

  // regen out of combat (up to 60 %)
  P.regenT += dt;
  if (P.regenT > 5 && P.hp < P.maxHp * 0.6) P.hp = Math.min(P.maxHp * 0.6, P.hp + dt * 4);

  // pickups
  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const k = S.pickups[i];
    k.t += dt;
    if (Math.hypot(k.x - P.x, k.z - P.z) > 1.4) continue;
    if (k.kind === "tonic") {
      if (P.hp >= P.maxHp) continue;
      P.hp = Math.min(P.maxHp, P.hp + k.amount);
      emit(S, "pickup", { kind: "tonic", amount: k.amount });
    } else if (k.kind === "cash") {
      S.earn.money += k.amount;
      emit(S, "pickup", { kind: "cash", amount: k.amount });
    } else if (k.kind === "ammo") {
      for (const id of P.owned) {
        const W = WEAPONS[id];
        const add = id === P.w ? Math.ceil(W.mag * 1.5) : Math.ceil(W.mag * 0.75);
        P.ammo[id].res = Math.min(W.maxReserve, P.ammo[id].res + add);
      }
      emit(S, "pickup", { kind: "ammo", amount: 0 });
    }
    S.pickups.splice(i, 1);
  }
  // mission collectables
  if (S.step?.type === "collect") {
    for (const id of S.step.ids) {
      const o = S.objects.get(id);
      if (o && !o.done && Math.hypot(o.x - P.x, o.z - P.z) < 1.5) {
        o.done = true;
        emit(S, "collect", { id, x: o.x, z: o.z });
      }
    }
  }
}

function moveBody(S, P, dt, vx, vz) {
  // knockback velocity decays
  P.vx *= Math.max(0, 1 - dt * 6);
  P.vz *= Math.max(0, 1 - dt * 6);
  let nx = P.x + (vx + P.vx) * dt, nz = P.z + (vz + P.vz) * dt;
  // vertical
  if (!P.onGround || P.vy > 0) {
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    if (P.y <= 0) {
      P.y = 0;
      if (P.vy < -3) emit(S, "land", {});
      P.vy = 0;
      P.onGround = true;
    }
  }
  const c = collideCircle(nx, nz, PR, P.y, S.obs);
  nx = c.x;
  nz = c.z;
  // enemies push the player a little (and stop walking through them)
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const r = PR + (e.def.mounted ? 0.85 : ER);
    const dx = nx - e.x, dz = nz - e.z, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-4) {
      nx = e.x + (dx / d) * r;
      nz = e.z + (dz / d) * r;
    }
  }
  const c2 = collideCircle(nx, nz, PR, P.y, S.obs);
  P.x = c2.x;
  P.z = c2.z;
}

function talkTo(S, npc) {
  const st = S.step;
  npc.talkT = 3;
  if (st?.type === "talk" && st.npc === npc.id) {
    if (S.say.length) S.say = [];
    sayLines(S, st.lines);
    emit(S, "talk", { npc: npc.id });
    completeStep(S);
  } else {
    const idle = {
      hale: "Get to it, Eli. Red Mesa's counting on you.",
      gus: "Keep your head down, friend.",
      pete: "Don't mind me — just keep 'em off the coach!",
      martha: "Please hurry...",
      bell: "I'll be under the counter if you need me!",
    }[npc.id];
    if (idle && !S.say.length) sayLines(S, [[npc.name, idle]]);
  }
}

function useObject(S, o) {
  const st = S.step;
  o.done = true;
  emit(S, "use", { id: o.id, kind: o.kind, x: o.x, z: o.z });
  if (o.kind === "hostage") {
    emit(S, "freed", { id: o.id });
    addXp(S, 20, "Rescue");
  }
  if (o.kind === "dynamite") {
    S.timed.push({ t: 3, kind: "blast", x: o.wagon ? o.wagon[0] : o.x, z: o.wagon ? o.wagon[1] : o.z, gate: !!o.gate, obj: o.id });
    emit(S, "fuse", { id: o.id, x: o.x, z: o.z });
  }
  if (st?.give && st.ids.length === 1) giveWeapon(S, st.give);
}

/* ====================================================================== enemy AI */

function nearestCover(S, e) {
  const P = S.P;
  let best = null, bestScore = Infinity;
  for (const b of S.obs) {
    if (b.hidden || b.h < 0.9 || b.nocol || b.y0) continue;
    const dE = Math.hypot(b.x - e.x, b.z - e.z);
    if (dE > 14 + Math.max(b.w, b.d) / 2) continue;
    // far side of the box from the player
    let dx = b.x - P.x, dz = b.z - P.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const qx = b.x + dx * 60, qz = b.z + dz * 60;
    const cx = clamp(qx, b.x - b.w / 2, b.x + b.w / 2), cz = clamp(qz, b.z - b.d / 2, b.z + b.d / 2);
    // pull the spot toward the enemy along the box face so long walls give a near spot
    const px = clamp(e.x, b.x - b.w / 2 + 0.5, b.x + b.w / 2 - 0.5), pz = clamp(e.z, b.z - b.d / 2 + 0.5, b.z + b.d / 2 - 0.5);
    const fx = Math.abs(cx - b.x) >= b.w / 2 - 1e-3 ? cx + Math.sign(dx) * 0.75 : px;
    const fz = Math.abs(cz - b.z) >= b.d / 2 - 1e-3 ? cz + Math.sign(dz) * 0.75 : pz;
    const [ci, cj] = cellOf(S.grid, fx, fz);
    if (!walkable(S.grid, ci, cj)) continue;
    const dP = Math.hypot(fx - P.x, fz - P.z);
    if (dP < 7.5) continue;
    if (dP > e.def.range * 1.05) continue;
    if (segmentBlocked(P.x, P.y + 1.4, P.z, fx, 0.95, fz, S.obs) < 0) continue;
    const score = Math.hypot(fx - e.x, fz - e.z) + (b.h < 1.6 ? 0 : 2);
    if (score < bestScore) {
      bestScore = score;
      best = [fx, fz];
    }
  }
  return best;
}

function setGoal(S, e, x, z) {
  e.goal = [x, z];
  e.path = findPath(S.grid, e.x, e.z, x, z) || [[x, z]];
  e.pathT = 0.7 + S.rand() * 0.4;
}

function followPath(S, e, dt, speed) {
  if (!e.path || !e.path.length) {
    e.speed = 0;
    return true;
  }
  const [tx, tz] = e.path[0];
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  if (d < 0.35) {
    e.path.shift();
    if (!e.path.length) {
      e.speed = 0;
      return true;
    }
    return false;
  }
  const s = Math.min(speed, d / dt);
  const ox = e.x, oz = e.z;
  e.x += (dx / d) * s * dt;
  e.z += (dz / d) * s * dt;
  e.speed = s;
  if (!e.sees || !e.alert) e.rot += angDiff(e.rot, faceAngle(dx, dz)) * Math.min(1, dt * 8);
  const moved = Math.hypot(e.x - ox, e.z - oz);
  if (moved < s * dt * 0.3) e.stuckT += dt;
  else e.stuckT = Math.max(0, e.stuckT - dt);
  return false;
}

function enemyShoot(S, e, accMul = 1, dmgMul = 1, target = null) {
  const P = S.P;
  e.shotT = 0;
  const mx = e.x - Math.sin(e.rot) * 0.6, mz = e.z - Math.cos(e.rot) * 0.6;
  const my = e.def.mounted ? 2.2 : e.crouch ? 1.05 : 1.4;
  if (target) {
    // siege: shooting the defended object
    const o = target;
    const d = Math.hypot(o.x - e.x, o.z - e.z) || 1;
    const tx = o.x + ((e.x - o.x) / d) * Math.min(o.r * 0.6, 3), tz = o.z + ((e.z - o.z) / d) * Math.min(o.r * 0.6, 3);
    emit(S, "efire", { id: e.id, mx, my, mz, tx, ty: 1.5, tz, hit: false, type: e.type });
    if (S.rand() < 0.8) {
      const dmg = Math.max(2, (e.def.dmg || 6) * 0.9 * S.diff.dmg);
      o.hp = Math.max(0, o.hp - dmg);
      emit(S, "objHit", { id: o.id, hp: o.hp });
    }
    return;
  }
  const ty = playerChest(S);
  const dist = Math.hypot(P.x - e.x, P.z - e.z);
  const f = segmentBlocked(mx, my, mz, P.x, ty, P.z, S.obs);
  if (f >= 0) {
    // bullet slams into the cover between us
    const ix = mx + (P.x - mx) * f, iy = my + (ty - my) * f, iz = mz + (P.z - mz) * f;
    emit(S, "efire", { id: e.id, mx, my, mz, tx: ix, ty: iy, tz: iz, hit: false, type: e.type });
    emit(S, "impact", { x: ix, y: iy, z: iz, mat: "wood", near: Math.hypot(ix - P.x, iz - P.z) < 3 });
    return;
  }
  let p = e.def.acc * accMul * S.diff.acc;
  p *= clamp(1.15 - dist / (e.def.range * 1.4), 0.25, 1);
  if (P.moving > 3) p *= 0.65;
  else if (P.moving > 0.5) p *= 0.82;
  if (P.sprint) p *= 0.75;
  if (P.crouch) p *= 0.8;
  if (!P.onGround) p *= 0.6;
  if (S.deadEye.on) p *= 0.7;
  const hit = S.rand() < p;
  if (hit) {
    let dmg = e.def.dmg * dmgMul;
    if (e.type === "shotgunner") dmg *= clamp(1.35 - dist / 12, 0.25, 1.2);
    emit(S, "efire", { id: e.id, mx, my, mz, tx: P.x, ty, tz: P.z, hit: true, type: e.type });
    damagePlayer(S, dmg, { x: e.x, z: e.z, kind: "bullet", knock: e.type === "shotgunner" && dist < 5 ? 3 : 0 });
  } else {
    // miss: whizz past
    const ox = (S.rand() - 0.5) * 2.4, oy = (S.rand() - 0.3) * 1.2;
    const rx = Math.cos(e.rot), rz = -Math.sin(e.rot);
    const tx = P.x + rx * ox + (P.x - e.x) * 0.6, tz = P.z + rz * ox + (P.z - e.z) * 0.6;
    emit(S, "efire", { id: e.id, mx, my, mz, tx, ty: Math.max(0.05, ty + oy - 0.4), tz, hit: false, type: e.type, whiz: dist > 3 });
    emit(S, "impact", { x: tx, y: 0.02, z: tz, mat: "dirt", near: true });
  }
}

function enemyMeleeStart(S, e, kind = "punch") {
  const wind = kind === "slam" ? 0.62 : e.boss ? 0.42 : 0.46;
  e.atk = { kind, t: 0, wind, dur: wind + 0.55, done: false };
  e.aimT = 0;
  emit(S, "ewind", { id: e.id, kind });
}

function enemyMeleeUpdate(S, e, dt) {
  const P = S.P;
  const a = e.atk;
  a.t += dt;
  if (!a.done && a.t >= a.wind) {
    a.done = true;
    const d = Math.hypot(P.x - e.x, P.z - e.z);
    if (a.kind === "slam") {
      emit(S, "slam", { id: e.id, x: e.x, z: e.z });
      if (d < 3.2 && P.onGround) damagePlayer(S, 26, { x: e.x, z: e.z, kind: "melee", src: e, knock: 7 });
    } else {
      const facing = Math.cos(angDiff(e.rot, faceAngle(P.x - e.x, P.z - e.z)));
      if (d < 1.95 && facing > 0.3) {
        const dmg = e.def.melee * (e.boss ? 1.2 : 1);
        damagePlayer(S, dmg, { x: e.x, z: e.z, kind: "melee", src: e, knock: e.boss ? 4 : 2 });
        emit(S, "epunch", { id: e.id });
      } else emit(S, "ewhiff", { id: e.id });
    }
  }
  if (a.t >= a.dur) {
    e.atk = null;
    e.meleeCd = e.def.meleeOnly ? 0.55 + S.rand() * 0.6 : 1.4;
    // brawlers chain a second punch sometimes
    if (e.def.meleeOnly && a.kind === "punch" && S.rand() < 0.3) e.meleeCd = 0.08;
  }
}

function bossSpecial(S, e, dt) {
  const P = S.P;
  const B = e.boss;
  if (e.tele) {
    e.tele.t += dt;
    const T = e.tele;
    if (T.kind === "fan") {
      if (T.t >= 0.9) {
        T.shotT = (T.shotT ?? 0) - dt;
        if (T.shotT <= 0) {
          T.shots = (T.shots ?? 0) + 1;
          T.shotT = 0.1;
          e.rot = faceAngle(P.x - e.x, P.z - e.z);
          enemyShoot(S, e, 0.55, 0.8);
          if (T.shots >= 6) e.tele = null;
        }
      }
    } else if (T.kind === "dynamite") {
      if (T.t >= 0.7) {
        throwDynamite(S, e);
        e.tele = null;
      }
    } else if (T.kind === "charge") {
      if (T.t >= 0.8) {
        const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
        e.charge = { t: 0, dx: dx / d, dz: dz / d, hit: false };
        e.rot = faceAngle(dx, dz);
        e.tele = null;
        emit(S, "charge", { id: e.id });
      }
    }
    return true;
  }
  B.specialCd -= dt;
  if (B.specialCd > 0) return false;
  const d = Math.hypot(P.x - e.x, P.z - e.z);
  const opts = B.specials.filter((s) => (s === "fan" && e.sees && d < 26) || (s === "dynamite" && d > 5 && d < 22) || (s === "charge" && d > 3.5 && d < 18 && e.sees) || (s === "slam" && d < 3));
  if (!opts.length) return false;
  const kind = opts[Math.floor(S.rand() * opts.length)];
  B.specialCd = (B.phase === 2 ? 4 : 5.8) + S.rand() * 2;
  if (kind === "slam") {
    enemyMeleeStart(S, e, "slam");
    return true;
  }
  e.tele = { kind, t: 0 };
  e.aimT = 0;
  emit(S, "tele", { id: e.id, kind });
  return true;
}

function throwDynamite(S, e) {
  const P = S.P;
  const tx = P.x + P.vx * 0.3 + (S.rand() - 0.5) * 2, tz = P.z + P.vz * 0.3 + (S.rand() - 0.5) * 2;
  const T = 1.0;
  const sx = e.x, sy = 1.8, sz = e.z;
  S.projectiles.push({ kind: "dynamite", x: sx, y: sy, z: sz, vx: (tx - sx) / T, vy: (0 - sy + 0.5 * GRAV * T * T) / T, vz: (tz - sz) / T, fuse: 2.0, owner: e.id });
  emit(S, "throw", { id: e.id });
}

function explode(S, x, z, { r = 3.8, dmg = 45, owner = null, gate = false } = {}) {
  emit(S, "explode", { x, z, r });
  const P = S.P;
  const d = Math.hypot(P.x - x, P.z - z);
  if (d < r && P.alive) damagePlayer(S, dmg * (1 - d / r) + 8, { x, z, kind: "blast", knock: 8 });
  for (const e of S.enemies) {
    if (!e.alive || e.id === owner) continue;
    const de = Math.hypot(e.x - x, e.z - z);
    if (de < r) damageEnemy(S, e, (dmg * 1.6 * (1 - de / r) + 10) * (e.boss ? 0.4 : 1), { kx: ((e.x - x) / (de || 1)) * 8, kz: ((e.z - z) / (de || 1)) * 8, how: "blast", down: true });
  }
  if (gate) {
    let changed = false;
    for (const b of S.obs) {
      if (b.gate && !b.gone) {
        b.gone = b.nocol = b.noray = true;
        changed = true;
        emit(S, "gateGone", { id: b.id });
      }
    }
    if (changed) S.grid = buildGrid(S.L.bounds, S.obs);
  }
  makeNoise(S, x, z, 40);
}

function updateEnemy(S, e, dt) {
  const P = S.P;
  e.shotT += dt;
  e.hurtT = Math.max(0, e.hurtT - dt);
  e.blockT = Math.max(0, e.blockT - dt);
  if (!e.alive) {
    e.deadT += dt;
    // death slide from knockback
    if (e.kvx || e.kvz) {
      const c = collideCircle(e.x + e.kvx * dt, e.z + e.kvz * dt, 0.3, 0, S.obs);
      e.x = c.x;
      e.z = c.z;
      e.kvx *= Math.max(0, 1 - dt * 5);
      e.kvz *= Math.max(0, 1 - dt * 5);
      if (Math.abs(e.kvx) + Math.abs(e.kvz) < 0.05) e.kvx = e.kvz = 0;
    }
    return;
  }
  if (e.state === "takendown" || e.duel) return;
  // knockback
  if (e.kvx || e.kvz) {
    e.x += e.kvx * dt;
    e.z += e.kvz * dt;
    e.kvx *= Math.max(0, 1 - dt * 7);
    e.kvz *= Math.max(0, 1 - dt * 7);
    if (Math.abs(e.kvx) + Math.abs(e.kvz) < 0.05) e.kvx = e.kvz = 0;
  }
  if (e.state === "down") {
    e.downT -= dt;
    if (e.downT <= 0) {
      e.state = "combat";
      e.stunT = 0.3;
    }
    collideEnemy(S, e);
    return;
  }
  if (e.stunT > 0) {
    e.stunT -= dt;
    e.speed = 0;
    collideEnemy(S, e);
    return;
  }
  e.meleeCd = Math.max(0, e.meleeCd - dt);
  e.fireCd = Math.max(0, e.fireCd - dt);
  e.coverCd = Math.max(0, e.coverCd - dt);

  // perception
  e.perceiveT -= dt;
  if (e.perceiveT <= 0) {
    e.perceiveT = 0.15 + S.rand() * 0.1;
    const s = canSee(S, e);
    if (s) {
      if (!e.alert) {
        // spotting takes a moment unless close
        e.seeT += 0.2;
        const dd = Math.hypot(P.x - e.x, P.z - e.z);
        if (e.seeT > 0.55 || dd < 6) {
          alertEnemy(S, e, P.x, P.z);
          // tell nearby friends
          for (const o of S.enemies) if (o !== e && o.alive && Math.hypot(o.x - e.x, o.z - e.z) < 18) alertEnemy(S, o, P.x, P.z);
        }
      } else e.lastKnown = [P.x, P.z];
      e.lostT = 0;
    } else {
      e.seeT = Math.max(0, e.seeT - 0.1);
      e.lostT += 0.2;
    }
    e.sees = s && e.alert;
  }

  const dx = P.x - e.x, dz = P.z - e.z;
  const dist = Math.hypot(dx, dz);
  const def = e.def;

  if (!e.alert) {
    e.state = "idle";
    e.crouch = false;
    if (e.patrol) {
      const [px, pz] = e.patrol[e.patrolI];
      if (!e.path || !e.path.length) setGoal(S, e, px, pz);
      if (followPath(S, e, dt, def.speed * 0.4)) {
        e.patrolI = (e.patrolI + 1) % e.patrol.length;
        e.path = null;
      }
    } else {
      e.speed = 0;
      if (e.spawn.rot == null) e.rot += Math.sin(S.t * 0.4 + e.id) * dt * 0.25;
    }
    collideEnemy(S, e);
    return;
  }
  e.state = "combat";

  // melee attack in progress
  if (e.atk) {
    e.rot += angDiff(e.rot, faceAngle(dx, dz)) * Math.min(1, dt * (e.atk.t < e.atk.wind * 0.7 ? 8 : 1));
    enemyMeleeUpdate(S, e, dt);
    e.speed = 0;
    collideEnemy(S, e);
    return;
  }
  // boss charge
  if (e.charge) {
    const c = e.charge;
    c.t += dt;
    const ox = e.x, oz = e.z;
    e.x += c.dx * 12 * dt;
    e.z += c.dz * 12 * dt;
    e.speed = 12;
    const col = collideCircle(e.x, e.z, ER * 1.2, 0, S.obs);
    e.x = col.x;
    e.z = col.z;
    if (!c.hit && Math.hypot(P.x - e.x, P.z - e.z) < 1.5) {
      c.hit = true;
      damagePlayer(S, 30, { x: ox, z: oz, kind: "melee", src: e, knock: 9 });
    }
    if (col.hit || c.t > 1.1) {
      e.charge = null;
      if (col.hit) {
        e.stunT = 1.4;
        emit(S, "crash", { id: e.id, x: e.x, z: e.z });
      }
    }
    return;
  }

  if (e.boss && bossSpecial(S, e, dt)) {
    if (e.tele && e.tele.kind !== "charge") e.rot += angDiff(e.rot, faceAngle(dx, dz)) * Math.min(1, dt * 6);
    collideEnemy(S, e);
    return;
  }

  // mounted riders circle their target at speed
  if (def.mounted) {
    updateRider(S, e, dt, dist);
    return;
  }

  // siege: go for the defended object unless the player is close/engaging
  const defObj = S.step?.type === "defend" ? S.objects.get(S.step.obj) : null;
  const siegeTarget = e.siege && defObj && defObj.hp > 0 && (dist > 11 || !e.sees) && e.hurtT <= 0 ? defObj : null;

  // melee range
  if (dist < (def.meleeOnly ? 1.45 : 1.6) && e.meleeCd <= 0 && P.alive && Math.abs(P.y) < 1) {
    enemyMeleeStart(S, e, e.boss && e.boss.specials.includes("slam") && S.rand() < 0.3 ? "slam" : "punch");
    collideEnemy(S, e);
    return;
  }

  let speed = def.speed;
  e.pathT -= dt;

  if (def.meleeOnly) {
    // close in
    e.crouch = false;
    if (dist > 1.3) {
      if (e.pathT <= 0 || !e.path) setGoal(S, e, P.x, P.z);
      followPath(S, e, dt, speed * (dist < 4 ? 0.85 : 1));
      e.rot += angDiff(e.rot, faceAngle(dx, dz)) * Math.min(1, dt * 6);
    } else e.speed = 0;
    collideEnemy(S, e);
    return;
  }

  // ---------------- ranged behaviour
  const targetX = siegeTarget ? siegeTarget.x : P.x, targetZ = siegeTarget ? siegeTarget.z : P.z;
  const tdist = Math.hypot(targetX - e.x, targetZ - e.z);
  const inRange = siegeTarget ? tdist < 16 : e.sees && dist <= def.range;

  // cover cycle
  if (!siegeTarget && e.cover) {
    const [cx, cz] = e.cover;
    const atCover = Math.hypot(cx - e.x, cz - e.z) < 0.6;
    if (!atCover) {
      if (e.pathT <= 0 || !e.path) setGoal(S, e, cx, cz);
      followPath(S, e, dt, speed);
      if (e.stuckT > 1.5) {
        e.cover = null;
        e.coverCd = 3;
      }
    } else {
      e.speed = 0;
      e.coverT -= dt;
      if (e.crouch) {
        if (e.coverT <= 0) {
          e.crouch = false;
          e.coverT = 1.6 + S.rand() * 1.2;
          e.fireCd = Math.min(e.fireCd, 0.15);
        }
      } else if (e.coverT <= 0 && e.aimT <= 0 && e.burst <= 0) {
        e.crouch = true;
        e.coverT = 1.3 + S.rand() * 1.1;
        e.coverCycles++;
      }
      // flanked or player too close → leave cover
      const flanked = segmentBlocked(P.x, P.y + 1.4, P.z, e.x, 0.95, e.z, S.obs) < 0;
      if (dist < 6.5 || (flanked && e.crouch) || e.coverCycles > 4) {
        e.cover = null;
        e.crouch = false;
        e.coverCd = dist < 6.5 ? 9 : 4 + S.rand() * 3;
        e.coverCycles = 0;
      }
    }
    e.rot += angDiff(e.rot, faceAngle(dx, dz)) * Math.min(1, dt * 6);
  } else if (!siegeTarget && !e.hold && e.coverCd <= 0 && e.sees && (e.coverUses || 0) < 3 && dist > 8 && (e.hp < e.maxHp * 0.7 || S.rand() < def.cover * dt * 0.6) && def.cover > 0) {
    const c = nearestCover(S, e);
    e.coverCd = 2.5;
    if (c) {
      e.coverUses = (e.coverUses || 0) + 1;
      e.cover = c;
      e.coverT = 1 + S.rand();
      e.coverCycles = 0;
      setGoal(S, e, c[0], c[1]);
    }
  } else if (!e.hold) {
    e.crouch = false;
    // positioning
    if (siegeTarget) {
      if (tdist > 14) {
        if (e.pathT <= 0 || !e.path) setGoal(S, e, siegeTarget.x, siegeTarget.z);
        followPath(S, e, dt, speed);
      } else e.speed = 0;
    } else if (!e.sees) {
      // hunt: last known position, then the player
      const [lx, lz] = e.lastKnown || [P.x, P.z];
      if (e.pathT <= 0 || !e.path) setGoal(S, e, e.lostT > 3 ? P.x : lx, e.lostT > 3 ? P.z : lz);
      followPath(S, e, dt, speed);
    } else if (def.rush && dist > 4.5) {
      if (e.pathT <= 0 || !e.path) setGoal(S, e, P.x, P.z);
      followPath(S, e, dt, speed * (e.aimT > 0 ? 0.5 : 1));
    } else if (dist > def.range * 0.85) {
      if (e.pathT <= 0 || !e.path) setGoal(S, e, P.x, P.z);
      followPath(S, e, dt, speed);
    } else if (def.strafe || (def.sniper && dist < 10)) {
      e.strafeT -= dt;
      if (e.strafeT <= 0) {
        e.strafeT = 1.4 + S.rand() * 1.4;
        const side = S.rand() < 0.5 ? 1 : -1;
        const px = -dz / (dist || 1), pz = dx / (dist || 1);
        let ax = e.x + px * side * (2.5 + S.rand() * 2.5), az = e.z + pz * side * (2.5 + S.rand() * 2.5);
        if (def.sniper) {
          ax -= (dx / dist) * 4;
          az -= (dz / dist) * 4;
        }
        const [ci, cj] = cellOf(S.grid, ax, az);
        if (walkable(S.grid, ci, cj)) setGoal(S, e, ax, az);
      }
      followPath(S, e, dt, speed * 0.55);
    } else {
      e.speed = 0;
      e.path = null;
    }
    if (e.stuckT > 1.2) {
      e.stuckT = 0;
      e.path = null;
      e.pathT = 0;
    }
  } else {
    e.speed = 0;
    // hold-position shooters duck between shots if there's low cover at hand
    if (e.lowCover === undefined) e.lowCover = S.obs.some((b) => !b.hidden && b.h >= 0.85 && b.h <= 1.9 && Math.abs(b.x - e.x) < b.w / 2 + 1.3 && Math.abs(b.z - e.z) < b.d / 2 + 1.3);
    e.crouch = e.lowCover && e.aimT <= 0 && e.burst <= 0 && e.fireCd > 0.6;
  }

  // facing the target while engaged
  if (e.sees || siegeTarget) e.rot += angDiff(e.rot, faceAngle(targetX - e.x, targetZ - e.z)) * Math.min(1, dt * 7);

  // shooting
  const canShoot = !e.crouch && inRange && (siegeTarget || P.alive);
  if (e.burst > 0) {
    e.burstT -= dt;
    if (e.burstT <= 0) {
      e.burst--;
      e.burstT = 0.16;
      if (siegeTarget) enemyShoot(S, e, 1, 1, siegeTarget);
      else if (e.sees) enemyShoot(S, e, e.speed > 0.5 ? 0.8 : 1);
    }
  } else if (e.aimT > 0) {
    e.aimT -= dt;
    if (!canShoot) e.aimT = 0;
    else if (e.aimT <= 0) {
      e.burst = def.burst;
      e.burstT = 0;
      const rate = e.boss && e.boss.phase === 2 ? def.rate * 0.75 : def.rate;
      e.fireCd = rate * (0.8 + S.rand() * 0.5) + def.burst * 0.16;
    }
  } else if (canShoot && e.fireCd <= 0) {
    e.aimT = def.aim * (0.85 + S.rand() * 0.3);
    if (def.sniper) emit(S, "glint", { id: e.id });
  }
  collideEnemy(S, e);
}

function updateRider(S, e, dt, dist) {
  const P = S.P;
  const def = e.def;
  const defObj = S.step?.type === "defend" ? S.objects.get(S.step.obj) : null;
  const center = e.siege && defObj && defObj.hp > 0 && dist > 14 ? defObj : P;
  const R = 14;
  e.orbitA += (e.orbitDir * def.speed * dt) / R;
  const gx = center.x + Math.cos(e.orbitA) * R, gz = center.z + Math.sin(e.orbitA) * R;
  const want = faceAngle(gx - e.x, gz - e.z);
  e.rot += clamp(angDiff(e.rot, want), -2.2 * dt, 2.2 * dt);
  const sp = def.speed * (e.hurtT > 0 ? 0.6 : 1);
  const nx = e.x - Math.sin(e.rot) * sp * dt, nz = e.z - Math.cos(e.rot) * sp * dt;
  const c = collideCircle(nx, nz, 0.9, 0, S.obs);
  if (c.hit) {
    e.stuckT += dt;
    if (e.stuckT > 0.4) {
      e.orbitDir *= -1;
      e.stuckT = 0;
      e.orbitA += e.orbitDir * 0.5;
    }
  } else e.stuckT = 0;
  e.x = c.x;
  e.z = c.z;
  e.speed = sp;
  // riders shoot sideways from the saddle
  const tgt = center === P ? null : center;
  const canShoot = tgt ? Math.hypot(tgt.x - e.x, tgt.z - e.z) < 18 : e.sees && dist < def.range;
  if (e.aimT > 0) {
    e.aimT -= dt;
    if (e.aimT <= 0 && canShoot) {
      enemyShoot(S, e, 1, 1, tgt);
      e.fireCd = def.rate * (0.8 + S.rand() * 0.5);
    }
  } else if (canShoot && e.fireCd <= 0) e.aimT = def.aim;
}

function collideEnemy(S, e) {
  const r = e.def.mounted ? 0.9 : ER;
  for (const o of S.enemies) {
    if (o === e || !o.alive || o.id > e.id) continue;
    const rr = r + (o.def.mounted ? 0.9 : ER);
    const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz);
    if (d < rr && d > 1e-4) {
      const push = (rr - d) / 2;
      e.x += (dx / d) * push;
      e.z += (dz / d) * push;
      o.x -= (dx / d) * push;
      o.z -= (dz / d) * push;
    }
  }
  const P = S.P;
  const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
  if (d < r + PR && d > 1e-4) {
    e.x = P.x + (dx / d) * (r + PR);
    e.z = P.z + (dz / d) * (r + PR);
  }
  const c = collideCircle(e.x, e.z, r, 0, S.obs);
  e.x = c.x;
  e.z = c.z;
}

function updateProjectiles(S, dt) {
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const p = S.projectiles[i];
    p.fuse -= dt;
    if (p.y > 0 || p.vy > 0) {
      p.vy -= GRAV * dt;
      const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
      const c = collideCircle(nx, nz, 0.15, p.y, S.obs);
      if (c.hit) {
        p.vx *= -0.3;
        p.vz *= -0.3;
      }
      p.x = c.x;
      p.z = c.z;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.vx *= 0.3;
        p.vz *= 0.3;
      }
    } else {
      p.vx *= Math.max(0, 1 - dt * 4);
      p.vz *= Math.max(0, 1 - dt * 4);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }
    if (p.fuse <= 0) {
      explode(S, p.x, p.z, { owner: p.owner });
      S.projectiles.splice(i, 1);
    }
  }
  for (let i = S.timed.length - 1; i >= 0; i--) {
    const T = S.timed[i];
    T.t -= dt;
    if (T.t <= 0) {
      S.timed.splice(i, 1);
      if (T.kind === "blast") {
        explode(S, T.x, T.z, { r: 5, dmg: 60, gate: T.gate });
        // destroy the wagon the charge was planted on
        for (const b of S.obs) {
          if (b.kind === "wagon" && !b.gone && Math.hypot(b.x - T.x, b.z - T.z) < 1) {
            b.gone = true;
            b.kind2 = "wreck";
            b.h = 0.6;
            emit(S, "wreck", { id: b.id });
          }
        }
        S.grid = buildGrid(S.L.bounds, S.obs);
      }
    }
  }
}

/* ====================================================================== objectives */

function startStep(S, i) {
  const M = S.M;
  S.stepI = i;
  S.stepT = 0;
  S.wavesDone = 0;
  const st = M.steps[i];
  S.step = st;
  if (!st) return;
  if (st.npcAt) {
    for (const [id, [x, z]] of Object.entries(st.npcAt)) {
      const n = S.npcs.find((q) => q.id === id);
      if (n) {
        n.x = x;
        n.z = z;
      }
    }
  }
  if (st.type === "kill") for (const gname of st.groups) if (!st.later?.includes(gname)) spawnGroup(S, gname);
  sayLines(S, st.say);
  if (st.train) emit(S, "train", {});
  // resupply: never start an objective with an empty gun belt
  if (i > 0) {
    let topped = false;
    for (const id of S.P.owned) {
      const W = WEAPONS[id], a = S.P.ammo[id];
      const floor = W.mag * (id === "revolver" ? 4 : 2);
      if (a.res < floor) {
        a.res = floor;
        topped = true;
      }
    }
    if (topped) emit(S, "resupply", {});
  }
  if (st.type === "duel") startDuel(S, st);
  saveCheckpoint(S);
  emit(S, "step", { i, text: st.text });
}

function completeStep(S) {
  const st = S.step;
  if (!st) return;
  sayLines(S, st.doneSay);
  if (st.give && st.ids?.length !== 1) giveWeapon(S, st.give);
  addXp(S, 10, "Objective");
  emit(S, "stepDone", { i: S.stepI, text: st.text });
  if (S.stepI + 1 >= S.M.steps.length) {
    S.step = null;
    S.status = "ending";
    S.endT = 0;
    return;
  }
  startStep(S, S.stepI + 1);
}

/** Progress of the current step: {n, need} or null. */
export function stepProgress(S) {
  const st = S.step;
  if (!st) return null;
  switch (st.type) {
    case "kill": {
      const groups = st.groups.filter((gname) => !st.later?.includes(gname) || S.spawned.has(gname));
      const list = S.enemies.filter((e) => groups.includes(e.group));
      const total = groups.reduce((a, gname) => a + (S.M.groups[gname]?.length || 0), 0);
      return { n: list.filter((e) => !e.alive).length, need: total };
    }
    case "targets":
    case "interact":
    case "collect":
      return { n: st.ids.filter((id) => S.objects.get(id)?.done).length, need: st.ids.length };
    case "survive":
    case "defend":
      return { t: Math.max(0, st.time - S.stepT), time: st.time };
    default:
      return null;
  }
}

function updateStep(S, dt) {
  const st = S.step;
  if (!st || S.status !== "play") return;
  S.stepT += dt;
  switch (st.type) {
    case "reach": {
      if (Math.hypot(S.P.x - st.at[0], S.P.z - st.at[1]) < (st.r || 3)) completeStep(S);
      break;
    }
    case "kill": {
      const main = st.groups.filter((gname) => !st.later?.includes(gname));
      if (main.every((gname) => groupDone(S, gname)) && (st.later || []).every((gname) => groupDone(S, gname) || !S.spawned.has(gname))) completeStep(S);
      break;
    }
    case "targets":
    case "interact":
    case "collect": {
      if (st.ids.every((id) => S.objects.get(id)?.done)) completeStep(S);
      break;
    }
    case "survive":
    case "defend": {
      while (S.wavesDone < st.waves.length && S.stepT >= st.waves[S.wavesDone][0]) {
        spawnGroup(S, st.waves[S.wavesDone][1]);
        S.wavesDone++;
        if (S.wavesDone > 1) emit(S, "wave", { n: S.wavesDone });
      }
      if (st.type === "defend") {
        const o = S.objects.get(st.obj);
        if (o && o.hp <= 0) {
          S.status = "failed";
          S.deadReason = "objective";
          emit(S, "failed", { obj: o.id });
          return;
        }
      }
      if (S.stepT >= st.time) completeStep(S);
      break;
    }
    default:
      break;
  }
}

function saveCheckpoint(S) {
  const P = S.P;
  const st = S.step;
  const at = st?.type === "duel" ? st.at : [P.x, P.z];
  const objHp = {};
  for (const o of S.objects.values()) if (o.hp != null) objHp[o.id] = o.hp;
  S.checkpoint = {
    stepI: S.stepI,
    x: at[0],
    z: at[1],
    rot: P.rot,
    hp: P.hp,
    ammo: JSON.parse(JSON.stringify(P.ammo)),
    owned: [...P.owned],
    w: P.w,
    objHp,
    spawned: new Set(S.spawned),
  };
}

/** Back to the last checkpoint after death / failure / a lost duel. */
export function respawn(S) {
  const cp = S.checkpoint;
  const P = S.P;
  const st = S.M.steps[cp.stepI];
  P.x = cp.x;
  P.z = cp.z;
  P.y = 0;
  P.vy = P.vx = P.vz = 0;
  P.rot = cp.rot;
  P.hp = P.maxHp;
  P.st = P.maxSt;
  P.alive = true;
  P.roll = P.melee = P.takedown = P.use = null;
  P.downT = P.hurtT = P.reloadT = 0;
  P.crouch = false;
  P.owned = [...cp.owned];
  P.ammo = JSON.parse(JSON.stringify(cp.ammo));
  for (const id of P.owned) {
    const W = WEAPONS[id];
    const a = P.ammo[id];
    a.mag = W.mag;
    a.res = Math.max(a.res, W.mag * 3);
  }
  P.w = cp.w;
  S.cam.yaw = P.rot;
  S.cam.pitch = -0.08;
  S.cam.aim = 0;
  S.projectiles = [];
  S.timed = S.timed.filter((T) => T.kind === "blast");
  S.deadEye.on = false;
  // enemies spawned during this step's waves are removed; everyone else alive resets
  const waveGroups = new Set((st.waves || []).map((w) => w[1]));
  // anything spawned after the checkpoint (waves, boss reinforcements) goes away and can spawn again
  S.enemies = S.enemies.filter((e) => cp.spawned.has(e.group) && !e.duel);
  for (const gname of [...S.spawned]) if (!cp.spawned.has(gname)) S.spawned.delete(gname);
  void waveGroups;
  for (const e of S.enemies) {
    if (!e.alive) continue;
    e.x = e.spawn.x;
    e.z = e.spawn.z;
    e.hp = e.maxHp;
    e.alert = e.alertOpt;
    e.lastKnown = e.alert ? [P.x, P.z] : null;
    e.state = "idle";
    e.path = null;
    e.cover = null;
    e.crouch = false;
    e.atk = e.tele = e.charge = null;
    e.aimT = 0;
    e.burst = 0;
    e.fireCd = 1 + S.rand();
    e.downT = e.stunT = 0;
    e.kvx = e.kvz = 0;
    if (e.boss) {
      e.boss.halved = false;
      e.boss.summoned = false;
      e.boss.phase = 1;
      e.boss.specialCd = 3;
    }
  }
  for (const [id, hp] of Object.entries(cp.objHp)) {
    const o = S.objects.get(id);
    if (o) o.hp = Math.max(hp, o.maxHp * 0.6);
  }
  S.status = "play";
  S.deadReason = null;
  S.say = [];
  S.duel = null;
  S.stepI = cp.stepI;
  S.step = st;
  S.stepT = 0;
  S.wavesDone = 0;
  if (st.type === "duel") startDuel(S, st);
  emit(S, "respawn", {});
  updateCamera(S, 1);
}

/* ====================================================================== duel */

function startDuel(S, st) {
  const P = S.P;
  // clear the street: no-one else interferes with a duel
  for (const e of S.enemies) if (e.alive) e.duelFrozen = true;
  const [ax, az] = st.at, [fx, fz] = st.foeAt;
  P.x = ax;
  P.z = az;
  P.y = 0;
  P.vx = P.vz = P.vy = 0;
  P.crouch = false;
  P.roll = P.melee = null;
  P.block = false;
  P.rot = faceAngle(fx - ax, fz - az);
  if (P.w !== "revolver") {
    P.w = "revolver";
  }
  P.ammo.revolver.mag = WEAPONS.revolver.mag;
  P.reloadT = 0;
  const foe = makeEnemy(S, "gunslinger", fx, fz, { name: st.foe.name, look: st.foe.look, rot: 0 }, "duel");
  foe.rot = faceAngle(ax - fx, az - fz);
  foe.duel = true;
  foe.hp = foe.maxHp = 1;
  foe.alert = true;
  let reaction = st.foe.reaction + S.diff.duel + (S.stats.quickDraw ? 0.12 : 0);
  reaction = Math.max(0.45, reaction);
  S.duel = { phase: "intro", t: 0, delay: 1.7 + S.rand() * 2.2, reaction, foe, drawT: 0, result: null, shots: 0, playerTime: null, offYaw: (S.rand() < 0.5 ? -1 : 1) * (0.05 + S.rand() * 0.05) };
  S.cam.yaw = P.rot;
  S.cam.pitch = -0.02;
  emit(S, "duelStart", { name: st.foe.name });
}

function updateDuel(S, dt, inp) {
  const D = S.duel;
  const P = S.P, C = S.cam;
  const foe = D.foe;
  D.t += dt;
  const toFoe = faceAngle(foe.x - P.x, foe.z - P.z);
  const dist = Math.hypot(foe.x - P.x, foe.z - P.z);
  const chestPitch = Math.atan2(1.25 - 1.55, dist);
  P.shotT += dt;
  P.fireCd = Math.max(0, P.fireCd - dt);
  if (D.phase === "intro") {
    C.aim = 0;
    if (D.t > 2.6) {
      D.phase = "ready";
      D.t = 0;
      emit(S, "duelReady", {});
    }
    return;
  }
  if (D.phase === "ready") {
    C.yaw = toFoe;
    C.pitch = chestPitch;
    C.aim = clamp(C.aim + dt * 4, 0, 0.6);
    if (inp.fireP) {
      D.result = "early";
      D.phase = "resolve";
      D.t = 0;
      emit(S, "duelFoul", {});
      return;
    }
    if (D.t >= D.delay) {
      D.phase = "draw";
      D.t = 0;
      C.yaw = toFoe + D.offYaw;
      C.pitch = chestPitch - 0.17;
      emit(S, "draw", {});
    }
    return;
  }
  if (D.phase === "draw") {
    C.aim = clamp(C.aim + dt * 8, 0, 1);
    C.yaw += inp.dYaw;
    C.pitch = clamp(C.pitch + inp.dPitch, -0.8, 0.6);
    updateCamera(S, dt);
    if (inp.fireP && P.fireCd <= 0) {
      D.shots++;
      P.fireCd = 0.28;
      P.shotT = 0;
      P.ammo.revolver.mag = Math.max(0, P.ammo.revolver.mag - 1);
      const mz = muzzle(S);
      const d = spreadDir(S, C.dir, 0.002);
      const r = castShot(S, C.pos[0], C.pos[1], C.pos[2], d[0], d[1], d[2], 0.5, 120, true);
      emit(S, "fire", { w: "revolver", mx: mz[0], my: mz[1], mz: mz[2], tracers: [r.point], side: 0 });
      S.counters.shots++;
      if (r.kind === "enemy" && r.e === foe) {
        S.counters.hits++;
        D.result = "win";
        D.playerTime = D.t;
        D.phase = "resolve";
        D.t = 0;
        foe.hp = 0;
        emit(S, "hit", { id: foe.id, dmg: 100, head: r.head, how: "duel", x: r.point[0], y: r.point[1], z: r.point[2], kill: true });
        killEnemy(S, foe, "duel", r.head);
        addXp(S, 100, "Duel won");
        emit(S, "duelWin", { time: D.playerTime });
        return;
      }
      emit(S, "impact", { x: r.point[0], y: r.point[1], z: r.point[2], mat: "dirt" });
    }
    if (D.t >= D.reaction) {
      D.result = "lose";
      D.phase = "resolve";
      D.t = 0;
    }
    return;
  }
  if (D.phase === "resolve") {
    if (D.result !== "win" && !D.foeShot) {
      D.foeShot = true;
      foe.shotT = 0;
      emit(S, "efire", { id: foe.id, mx: foe.x, my: 1.4, mz: foe.z, tx: P.x, ty: 1.3, tz: P.z, hit: true, type: "duel" });
      P.hp = 1;
      damagePlayer(S, 999, { x: foe.x, z: foe.z, kind: "duel" });
      emit(S, "duelLose", { early: D.result === "early" });
      return;
    }
    if (D.result === "win" && D.t > 2.2) {
      S.duel = null;
      for (const e of S.enemies) e.duelFrozen = false;
      completeStep(S);
    }
  }
}

/* ====================================================================== camera */

function updateCamera(S, dt) {
  const P = S.P, C = S.cam;
  C.shake = Math.max(0, C.shake - dt * 2.5);
  if (S.duel && S.duel.phase === "intro") {
    const D = S.duel;
    const f = D.foe;
    const mx = (P.x + f.x) / 2, mz = (P.z + f.z) / 2;
    const dx = f.x - P.x, dz = f.z - P.z, l = Math.hypot(dx, dz) || 1;
    const px = -dz / l, pz = dx / l;
    const k = clamp(D.t / 2.6, 0, 1);
    const side = 7 + l * 0.35;
    C.cine = { pos: [mx + px * side * (1 - k * 0.3) - (dx / l) * (2 + k * 4), 1.2 + k * 0.8, mz + pz * side * (1 - k * 0.3) - (dz / l) * (2 + k * 4)], target: [mx, 1.3, mz] };
    C.pos = C.cine.pos;
    C.fov = 46;
    return;
  }
  if (S.status === "ending" && S.M.final) {
    const a = S.endT * 0.35;
    C.cine = { pos: [P.x + Math.sin(a) * 5, 2.1, P.z + Math.cos(a) * 5], target: [P.x, 1.3, P.z] };
    C.pos = C.cine.pos;
    return;
  }
  C.cine = null;
  const w = S.stats.weapons[P.w];
  const aim = C.aim;
  const cy = Math.cos(C.pitch), sy = Math.sin(C.pitch);
  const fx = -Math.sin(C.yaw) * cy, fy = sy, fz = -Math.cos(C.yaw) * cy;
  const rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw);
  const dist = lerp(3.5, P.w === "rifle" ? 1.25 : 1.75, aim);
  const shoulder = lerp(0.62, 0.55, aim);
  const py = P.y + (P.crouch ? 1.2 : P.roll ? 1.0 : 1.58);
  const sx = P.x + rx * shoulder * 0.4, sz = P.z + rz * shoulder * 0.4;
  let tx = P.x - fx * dist + rx * shoulder, ty = py - fy * dist + 0.12, tz = P.z - fz * dist + rz * shoulder;
  // keep the camera out of walls
  const dx = tx - sx, dy = ty - py, dz = tz - sz;
  const dl = Math.hypot(dx, dy, dz);
  // low cover (crates, wagons, sandbags) doesn't pull the camera in — it rises over it instead
  const r = rayObstacles(sx, py, sz, dx / dl, dy / dl, dz / dl, S.obs, dl + 0.3, (b) => b.hidden || b.h < 1.75 || (b.y0 || 0) > py);
  if (r.b && r.b !== "ground" && r.t < dl + 0.25) {
    const k = Math.max(0.15, r.t - 0.3) / dl;
    tx = sx + dx * k;
    ty = py + dy * k;
    tz = sz + dz * k;
  }
  // ceilings
  for (const room of S.L.rooms) {
    if (P.x > room.x0 && P.x < room.x1 && P.z > room.z0 && P.z < room.z1) ty = Math.min(ty, room.ceil - 0.3);
  }
  for (const b of S.obs) {
    if (b.hidden || b.h >= 1.75 || b.nocol) continue;
    if (Math.abs(tx - b.x) < b.w / 2 + 0.25 && Math.abs(tz - b.z) < b.d / 2 + 0.25) ty = Math.max(ty, b.h + 0.3);
  }
  ty = Math.max(0.35, ty);
  C.pos = [tx, ty, tz];
  C.dir = [fx, fy, fz];
  C.fov = lerp(62, w.fov, aim);
}

/* ====================================================================== step */

/**
 * input: { mx, mz, dYaw, dPitch, fire, fireP, aim, reload, jump, sprint, dodge,
 * melee, kick, block, crouch, interact, interactHeld, weapon, wheel, deadEye }
 */
export function step(S, dt, input) {
  S.events = [];
  const inp = input || EMPTY;
  S.t += dt;
  const P = S.P, C = S.cam;

  // dialogue queue
  if (S.say.length) {
    S.sayT += dt;
    if (S.sayT >= S.say[0].t) {
      S.say.shift();
      S.sayT = 0;
    }
  } else S.sayT = 0;

  if (S.status === "ending") {
    S.endT += dt;
    updateCamera(S, dt);
    for (const e of S.enemies) updateEnemy(S, e, dt);
    if (S.endT > (S.M.final ? 4 : 1.6)) {
      S.status = "complete";
      emit(S, "complete", {});
    }
    return S.events;
  }
  if (S.status !== "play") {
    // dead / failed: the world keeps settling
    for (const e of S.enemies) if (!e.alive) updateEnemy(S, e, dt);
    return S.events;
  }

  if (S.duel) {
    updateDuel(S, dt, inp);
    if (S.duel?.phase !== "draw") updateCamera(S, dt);
    for (const e of S.enemies) if (!e.alive) updateEnemy(S, e, dt);
    return S.events;
  }

  // dead eye
  if (inp.deadEye && S.stats.deadEye) {
    if (S.deadEye.on) S.deadEye.on = false;
    else if (S.deadEye.meter > 0.25) {
      S.deadEye.on = true;
      emit(S, "deadEye", { on: true });
    }
  }
  if (S.deadEye.on) {
    S.deadEye.meter -= dt * 0.2;
    if (S.deadEye.meter <= 0) {
      S.deadEye.meter = 0;
      S.deadEye.on = false;
      emit(S, "deadEye", { on: false });
    }
  }
  const ws = S.deadEye.on ? 0.35 : 1;
  S.timeScale = ws;

  // look
  if (!P.takedown && P.alive) {
    C.yaw += inp.dYaw || 0;
    C.pitch = clamp(C.pitch + (inp.dPitch || 0), -1.1, 0.75);
    // recoil settles a little
  }
  updatePlayer(S, dt, inp);
  const wdt = dt * ws;
  for (const e of S.enemies) if (!e.duelFrozen) updateEnemy(S, e, wdt);
  // forget long-dead bodies beyond a cap
  if (S.enemies.length > 70) {
    const idx = S.enemies.findIndex((e) => !e.alive && e.deadT > 20);
    if (idx >= 0) S.enemies.splice(idx, 1);
  }
  updateProjectiles(S, wdt);
  updateStep(S, dt);
  updateCamera(S, dt);
  return S.events;
}

const EMPTY = { mx: 0, mz: 0, dYaw: 0, dPitch: 0 };

/* ====================================================================== queries for HUD / bots */

/** Where the current objective is: list of [x, z] points. */
export function objectiveMarkers(S) {
  const st = S.step;
  if (!st) return [];
  switch (st.type) {
    case "talk": {
      const n = S.npcs.find((q) => q.id === st.npc);
      return n ? [[n.x, n.z]] : [];
    }
    case "reach":
    case "duel":
      return [st.at];
    case "kill":
      return S.enemies.filter((e) => e.alive && st.groups.includes(e.group)).map((e) => [e.x, e.z]);
    case "targets":
    case "interact":
    case "collect":
      return st.ids.map((id) => S.objects.get(id)).filter((o) => o && !o.done).map((o) => [o.x, o.z]);
    case "defend": {
      const o = S.objects.get(st.obj);
      return o ? [[o.x, o.z]] : [];
    }
    default:
      return [];
  }
}

/** What the crosshair is on: {blocked} when the gun's line is obstructed, {enemy} when an enemy is under it. */
export function aimInfo(S) {
  const P = S.P, C = S.cam;
  if (!P.alive || S.status !== "play") return null;
  const d = C.dir;
  const [ox, oy, oz] = C.pos;
  const tMin = Math.max(0, (P.x - ox) * d[0] + (P.y + 1.3 - oy) * d[1] + (P.z - oz) * d[2]) * 0.85;
  const r = castShot(S, ox, oy, oz, d[0], d[1], d[2], tMin, 140, true);
  const mz = muzzle(S);
  const p = r.point;
  const f = r.kind === "none" ? -1 : segmentBlocked(mz[0], mz[1], mz[2], p[0], p[1], p[2], S.obs);
  const blocked = f >= 0 && f < 0.97 && Math.hypot(p[0] - mz[0], p[2] - mz[2]) * (1 - f) > 0.6;
  return { blocked, enemy: r.kind === "enemy" ? r.e : null, dist: r.t };
}

export function bossInfo(S) {
  const st = S.step;
  if (!st?.boss) return null;
  const bosses = S.enemies.filter((e) => e.boss && st.groups.includes(e.group));
  if (!bosses.length) return null;
  const hp = bosses.reduce((a, e) => a + Math.max(0, e.hp), 0);
  const max = bosses.reduce((a, e) => a + e.maxHp, 0);
  return { name: st.boss, hp, max, phase: Math.max(...bosses.map((e) => e.boss.phase)) };
}
