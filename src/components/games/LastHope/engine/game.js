/**
 * Last Hope — the simulation. Framework-free and deterministic for a seed;
 * the renderer mirrors G every frame and the Node tests drive it directly.
 *
 *   createGame({seed, difficulty})   new run at the Survivor's Camp
 *   tick(G, intent, dt)              advance (intent = movement / aim / buttons)
 *   doInteract(G)                    the E / interact button
 *   craft / travel / respawn / …      actions called by the UI
 *   serialize(G) / deserialize(data) save games
 *
 * Time: one in-game hour is HOUR seconds; night runs 20:00 – 05:30.
 * Runtime-only state (zombies, projectiles, colliders) lives in G.R and is
 * rebuilt by enterLocation(); everything worth keeping lives in G.locs.
 */
import { ITEMS } from "../data/items.js";
import { RECIPES, RECIPE_BY_ID, STATION_NAMES } from "../data/recipes.js";
import { PIECES } from "../data/structures.js";
import { LOCATIONS, getMap } from "../data/locations/index.js";
import { BOSSES } from "../data/zombies.js";
import { createCollider } from "./collide.js";
import { createNav } from "./nav.js";
import { NODES, bestToolFor } from "./nodes.js";
import { makeInv, count, remove, add, room, BASE_SLOTS } from "./inventory.js";
import { mulberry32, clamp, yawOf, angDiff, rint } from "./util.js";
import { emit, giveXp, rollTable, maxHpFor, xpFor, dropItems } from "./damage.js";
import { spawnZombie, stepZombies, isNight } from "./zombies.js";
import { spawnAnimal, stepAnimals } from "./animals.js";
import { startAttack, resolveMelee, fire, stepProjectiles, stepHazards, weaponOf, nodeInFront, noise } from "./combat.js";
import { giveItem, applyUse, invSize, QUICK, haveItem, equipSlot, useQuick } from "./items.js";
import { refreshDynamic, stepStructures, setDoor, structureById, pieceAt } from "./building.js";
import { checkMissions, tracked, progress } from "./missions.js";
import { CONTAINER_DIMS, NODE_SOLID } from "./layout.js";

export const SAVE_VERSION = 1;
export const HOUR = 50;
export const WALK = 3.6;
export const SPRINT = 6.2;
export const DIFFS = {
  easy: { drain: 0.65, zdmg: 0.7, zhp: 0.85, label: "Relaxed" },
  normal: { drain: 1, zdmg: 1, zhp: 1, label: "Survivor" },
  hard: { drain: 1.3, zdmg: 1.3, zhp: 1.15, label: "Hardcore" },
};
const ARENAS = {
  alpha: { x0: 33, x1: 66, z0: -48, z1: -10 },
};

/* =================================================================== create */
export function createGame({ seed = 1, difficulty = "normal" } = {}) {
  const G = baseState(seed, difficulty);
  enterLocation(G, "camp", "start");
  emit(G, { t: "toast", text: "Day 1 — Survive the dead. Rebuild your world.", kind: "info" });
  return G;
}

function baseState(seed, difficulty) {
  const G = {
    v: SAVE_VERSION,
    seed: seed >>> 0,
    difficulty: DIFFS[difficulty] ? difficulty : "normal",
    t: 0,
    clock: 8.5,
    day: 1,
    loc: "camp",
    locs: {},
    unlocked: ["camp", "forest"],
    visited: [],
    P: newPlayer(),
    inv: makeInv(BASE_SLOTS),
    equip: { hand: null, head: null, body: null, legs: null, feet: null, pack: null },
    quick: Array(QUICK).fill(null),
    structures: [],
    nextSid: 1,
    respawn: null,
    flags: {},
    stats: { gathered: {}, crafted: {}, built: {}, kills: {}, looted: {}, eaten: 0, upgrades: {}, deaths: 0, travels: 0, days: 1 },
    done: [],
    weather: { kind: "clear", t: HOUR * 5, k: 0 },
    raidNight: 0,
    events: [],
    invVersion: 0,
    open: null,
    interact: null,
    missionT: 0,
    R: null,
  };
  G.diff = DIFFS[G.difficulty];
  G.rng = mulberry32(G.seed ^ 0x9e3779b9);
  G.structById = (sid) => structureById(G, sid);
  return G;
}

function newPlayer() {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    vx: 0,
    vz: 0,
    kx: 0,
    kz: 0,
    r: 0.38,
    hp: 100,
    maxHp: 100,
    food: 100,
    water: 100,
    stam: 100,
    poison: 0,
    level: 1,
    xp: 0,
    dead: false,
    deadT: 0,
    act: null,
    cd: 0,
    iframes: 0,
    hurtT: 0,
    lastHurt: -99,
    sprinting: false,
    exhausted: false,
    faceT: 0,
    stamT: 0,
    combo: 0,
    moving: false,
    speed: 0,
    inside: null,
    sneak: false,
  };
}

/* =================================================================== locations */
export function locState(G, id) {
  if (!G.locs[id]) G.locs[id] = { nodes: {}, cont: {}, looted: {}, bag: null, bossDead: false, doors: {}, visits: 0 };
  return G.locs[id];
}

export function enterLocation(G, id, how = "travel") {
  const map = getMap(id);
  const ls = locState(G, id);
  ls.visits++;
  G.loc = id;
  G.open = null;
  const R = {
    map,
    col: createCollider(map),
    nav: createNav(map),
    zombies: [],
    animals: [],
    pickups: [],
    proj: [],
    clouds: [],
    noise: [],
    field: [null, null],
    nextId: 1,
    nodes: [],
    nodeById: new Map(),
    doors: map.doors.map((d) => ({ ...d, open: !!ls.doors[d.id] || (!!d.flag && !!G.flags[d.flag]) })),
    hazards: map.hazards.map((h) => ({ ...h, hp: 20, alive: true, chainT: null })),
    raid: null,
    nightSpawned: false,
    nightT: 0,
    trickleT: 60,
    respawnT: 5,
    initial: 0,
    switches: (map.switches || []).map((s) => ({ ...s })),
  };
  for (const n of map.nodes) {
    const def = NODES[n.t];
    if (!def) continue;
    const at = ls.nodes[n.id];
    const rn = { ...n, def, left: def.amount || 1, acc: 0, alive: !(at > G.t), respawnAt: at || 0, shake: 0, solidR: (NODE_SOLID[n.t] || 0) * n.s };
    R.nodes.push(rn);
    R.nodeById.set(n.id, rn);
  }
  G.R = R;
  refreshDynamic(G);
  // the dead
  const night = isNight(G);
  for (const sp of map.spawns) if (!sp.night) spawnGroup(G, sp);
  if (night) {
    for (const sp of map.spawns) if (sp.night) spawnGroup(G, sp);
    R.nightSpawned = true;
  }
  R.initial = R.zombies.length;
  if (map.boss && !ls.bossDead) {
    const bd = BOSSES[map.boss.id];
    const arena = map.boss.id === "warden" ? map.rooms.find((r) => r.name === "Containment Hall") : ARENAS[map.boss.id];
    spawnZombie(G, bd.type, map.boss.x, map.boss.z, { boss: map.boss.id, r: 3, arena });
  }
  for (const a of map.animals)
    for (let k = 0; k < a.n; k++) {
      const p = freeSpot(G, a.x, a.z, a.r, 0);
      if (p) spawnAnimal(G, a.t, p[0], p[1], { x: a.x, z: a.z, r: a.r + 4 });
    }
  // place the player
  const P = G.P;
  const spot = how === "start" ? map.start || map.entry : how === "respawn" ? G.respawn || map.start || map.entry : how === "load" ? { x: P.x, z: P.z, yaw: P.yaw } : map.entry;
  P.x = spot.x;
  P.z = spot.z;
  P.yaw = spot.yaw ?? P.yaw;
  P.vx = P.vz = P.kx = P.kz = 0;
  P.act = null;
  const res = R.col.resolve(P.x, P.z, P.r);
  P.x = res.x;
  P.z = res.z;
  if (!G.visited.includes(id)) G.visited.push(id);
  emit(G, { t: "enter", loc: id, how });
  checkMissions(G);
}

function freeSpot(G, x, z, r, cls) {
  const R = G.R;
  for (let k = 0; k < 14; k++) {
    const a = G.rng() * Math.PI * 2;
    const d = Math.sqrt(G.rng()) * r;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    if (!R.nav.isBlocked(cls, px, pz) && !R.col.overlaps(px, pz, 0.45)) return [px, pz];
  }
  return R.nav.nearestFree(cls, x, z, 10);
}

function spawnGroup(G, sp, o = {}) {
  const P = G.P;
  let made = 0;
  for (let k = 0; k < sp.n; k++) {
    const p = freeSpot(G, sp.x, sp.z, sp.r, 0);
    if (!p) continue;
    if (o.far && (p[0] - P.x) ** 2 + (p[1] - P.z) ** 2 < o.far * o.far) continue;
    spawnZombie(G, sp.t, p[0], p[1], { hx: sp.x, hz: sp.z, r: sp.r + 3, night: sp.night });
    made++;
  }
  return made;
}

/* =================================================================== tick */
export const EMPTY_INTENT = { mx: 0, mz: 0, sprint: false, aim: null, attack: false, interact: false, quick: -1, touch: false };

export function tick(G, I, dt) {
  dt = Math.min(dt, 0.05);
  const R = G.R;
  const P = G.P;
  G.t += dt;
  // ---------------------------------------------------------------- clock + weather
  const wasNight = isNight(G);
  G.clock += dt / HOUR;
  if (G.clock >= 24) {
    G.clock -= 24;
    G.day++;
    G.stats.days = G.day;
    emit(G, { t: "newday", day: G.day });
  }
  const night = isNight(G);
  if (night && !wasNight) emit(G, { t: "night" });
  if (!night && wasNight) emit(G, { t: "dawn" });
  stepWeather(G, dt);

  // ---------------------------------------------------------------- player
  stepPlayer(G, I, dt);
  stepSurvival(G, dt);

  // ---------------------------------------------------------------- world
  stepProjectiles(G, dt);
  stepHazards(G, dt);
  stepZombies(G, dt);
  stepAnimals(G, dt);
  stepStructures(G, dt);
  stepPickups(G, dt);
  for (let i = R.noise.length - 1; i >= 0; i--) if ((R.noise[i].life -= dt) <= 0) R.noise.splice(i, 1);
  stepSpawns(G, dt, night);
  for (const n of R.nodes) if (n.shake > 0) n.shake = Math.max(0, n.shake - dt * 3);

  // ---------------------------------------------------------------- interaction prompt + missions
  G.interact = P.dead ? null : findInteract(G);
  if (I.interact && G.interact && !P.dead) doInteract(G);
  if (I.quick >= 0) useQuick(G, I.quick);
  G.missionT -= dt;
  if (G.missionT <= 0) {
    G.missionT = 0.4;
    checkMissions(G);
  }
}

function stepWeather(G, dt) {
  const W = G.weather;
  W.t -= dt;
  const target = W.kind === "rain" ? 1 : W.kind === "fog" ? 1 : W.kind === "cloudy" ? 0.6 : 0;
  W.k += (target - W.k) * Math.min(1, dt * 0.15);
  if (W.t <= 0) {
    const r = G.rng();
    const prev = W.kind;
    W.kind = r < 0.46 ? "clear" : r < 0.7 ? "cloudy" : r < 0.88 ? "rain" : "fog";
    if (W.kind === prev && prev !== "clear") W.kind = "clear";
    W.t = HOUR * (3 + G.rng() * 5);
    if (W.kind !== prev) emit(G, { t: "weather", kind: W.kind });
  }
}

/* =================================================================== player */
function stepPlayer(G, I, dt) {
  const P = G.P;
  const R = G.R;
  P.cd = Math.max(0, P.cd - dt);
  P.hurtT = Math.max(0, P.hurtT - dt);
  P.iframes = Math.max(0, P.iframes - dt);
  P.faceT = Math.max(0, P.faceT - dt);
  if (P.dead) {
    P.deadT += dt;
    P.vx = P.vz = 0;
    P.sprinting = false;
    P.moving = false;
    P.speed = 0;
    return;
  }
  // actions in progress
  const A = P.act;
  if (A) {
    A.t += dt;
    if (!A.done && A.t >= A.hit) {
      A.done = true;
      if (A.k === "melee") resolveMelee(G, A);
      else if (A.k === "shoot") fire(G, A);
      else if (A.k === "use") applyUse(G, A.item);
      else if (A.k === "pick") finishPick(G, A.node);
    }
    if (A.t >= A.dur) P.act = null;
  }
  if (I.attack && !P.act && !G.uiBlock) startAttack(G, I);

  // movement
  let mx = I.mx || 0;
  let mz = I.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  const moving = ml > 0.08;
  if (P.exhausted && P.stam > 25) P.exhausted = false;
  P.sprinting = !!I.sprint && moving && !P.exhausted && P.stam > 0 && (!P.act || P.act.k === "use");
  let sp = P.sprinting ? SPRINT : WALK;
  if (P.act) sp *= P.act.k === "melee" ? 0.42 : P.act.k === "shoot" ? 0.55 : P.act.k === "pick" ? 0.15 : 0.55;
  if (P.food < 12 || P.water < 12) sp *= 0.88;
  if (P.hp < P.maxHp * 0.25) sp *= 0.92;
  const tvx = mx * sp;
  const tvz = mz * sp;
  const acc = Math.min(1, dt * (moving ? 12 : 16));
  P.vx += (tvx - P.vx) * acc;
  P.vz += (tvz - P.vz) * acc;
  P.x += (P.vx + P.kx) * dt;
  P.z += (P.vz + P.kz) * dt;
  const kd = Math.exp(-8 * dt);
  P.kx *= kd;
  P.kz *= kd;
  const res = R.col.resolve(P.x, P.z, P.r);
  P.x = res.x;
  P.z = res.z;
  P.speed = Math.hypot(P.vx, P.vz);
  P.moving = moving;
  if (P.sprinting) {
    P.noiseT = (P.noiseT || 0) - dt;
    if (P.noiseT <= 0) {
      P.noiseT = 0.5;
      noise(G, P.x, P.z, 6.5);
    }
  }
  // facing
  let want = null;
  if (P.act && (P.act.k === "melee" || P.act.k === "shoot")) want = P.act.yaw;
  else if (I.aim && weaponOf(G).kind !== "melee") want = yawOf(I.aim.x - P.x, I.aim.z - P.z);
  else if (P.faceT > 0) want = null;
  else if (moving) want = yawOf(mx, mz);
  if (want != null) {
    const turn = (P.act ? 22 : 13) * dt;
    const da = angDiff(P.yaw, want);
    P.yaw += clamp(da, -turn, turn);
  }
  // building we're inside (roof hiding / prompts)
  P.inside = insideBuilding(R.map, P.x, P.z);
}

export function insideBuilding(map, x, z) {
  for (let i = 0; i < map.buildings.length; i++) {
    const b = map.buildings[i];
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = c * dx - s * dz;
    const lz = s * dx + c * dz;
    if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) return i;
  }
  if (map.rooms)
    for (let i = 0; i < map.rooms.length; i++) {
      const r = map.rooms[i];
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return 1000 + i;
    }
  return null;
}

function stepSurvival(G, dt) {
  const P = G.P;
  if (P.dead) return;
  const dm = G.diff.drain;
  const sprintMul = P.sprinting ? 1.6 : 1;
  P.food = Math.max(0, P.food - dt * 0.055 * dm * sprintMul);
  P.water = Math.max(0, P.water - dt * 0.078 * dm * sprintMul);
  // stamina
  if (P.sprinting) {
    P.stam = Math.max(0, P.stam - dt * 15);
    P.stamT = 0;
    if (P.stam <= 0) {
      P.exhausted = true;
      emit(G, { t: "toast", text: "Exhausted!", kind: "warn" });
    }
  } else {
    P.stamT += dt;
    if (P.stamT > 0.8) P.stam = Math.min(100, P.stam + dt * (P.food > 10 && P.water > 10 ? 22 : 9));
  }
  // starvation / thirst / poison
  let dot = 0;
  if (P.food <= 0) dot += 0.45;
  if (P.water <= 0) dot += 0.6;
  if (P.poison > 0) {
    P.poison = Math.max(0, P.poison - dt);
    dot += 2.2;
  }
  if (dot > 0) {
    P.hp -= dot * dt;
    if (P.hp <= 0) {
      P.hp = 0;
      P.dead = true;
      P.deadT = 0;
      emit(G, { t: "death", cause: P.poison > 0 ? "toxic" : P.water <= 0 ? "thirst" : "hunger" });
    }
  } else if (P.food > 35 && P.water > 35 && G.t - P.lastHurt > 6) {
    const fire = G.loc === "camp" && G.structures.some((s) => (s.kind === "campfire" || s.kind === "bed") && (s.x - P.x) ** 2 + (s.z - P.z) ** 2 < 25);
    P.hp = Math.min(P.maxHp, P.hp + dt * (0.22 + (fire ? 0.6 : 0)));
  }
  P.warm = G.loc === "camp" && G.structures.some((s) => s.kind === "campfire" && (s.x - P.x) ** 2 + (s.z - P.z) ** 2 < 25);
}

/* =================================================================== pickups */
function stepPickups(G, dt) {
  const R = G.R;
  const P = G.P;
  for (let i = R.pickups.length - 1; i >= 0; i--) {
    const p = R.pickups[i];
    p.t += dt;
    if (p.t > p.life) {
      R.pickups.splice(i, 1);
      continue;
    }
    if (P.dead || p.t < 0.35) continue;
    const d2 = (p.x - P.x) ** 2 + (p.z - P.z) ** 2;
    if (d2 < 1.5 * 1.5) {
      let all = true;
      for (const it of p.items) {
        if (it.n <= 0) continue;
        const fit = Math.min(it.n, room(G.inv, it.id) + (!G.equip.hand && ITEMS[it.id]?.w ? 1 : 0));
        if (fit > 0) {
          giveItem(G, it.id, fit, { gathered: ITEMS[it.id]?.cat === "resource" || ITEMS[it.id]?.cat === "food", proto: it.d != null ? it : null, x: p.x, z: p.z });
          it.n -= fit;
        }
        if (it.n > 0) all = false;
      }
      if (all) R.pickups.splice(i, 1);
      else if (!p.fullMsg) {
        p.fullMsg = true;
        emit(G, { t: "toast", text: "Inventory full", kind: "bad" });
      }
    }
  }
}

/* =================================================================== spawns, raids, regrowth */
function stepSpawns(G, dt, night) {
  const R = G.R;
  const P = G.P;
  const map = R.map;
  if (night) R.nightT += dt;
  else R.nightT = 0;
  if (night && !R.nightSpawned) {
    R.nightSpawned = true;
    for (const sp of map.spawns) if (sp.night) spawnGroup(G, sp, { far: 22 });
  }
  if (!night) R.nightSpawned = false;
  // trickle: keep locations alive
  R.trickleT -= dt;
  if (R.trickleT <= 0 && G.loc !== "camp") {
    R.trickleT = 70 + G.rng() * 40;
    const alive = R.zombies.filter((z) => z.state !== "dead" && !z.boss).length;
    if (alive < R.initial * 0.65) {
      const day = map.spawns.filter((s) => !s.night && (s.x - P.x) ** 2 + (s.z - P.z) ** 2 > 34 * 34);
      if (day.length) {
        const sp = day[Math.floor(G.rng() * day.length)];
        spawnGroup(G, { ...sp, n: Math.min(2, sp.n) }, { far: 30 });
      }
    }
  }
  // camp raids: once per night from the second night on
  const nightIndex = G.clock >= 20 ? G.day : G.day - 1;
  if (G.loc === "camp" && night && G.day >= 2 && G.raidNight !== nightIndex && R.nightT > 30 && !R.raid && !P.dead) {
    G.raidNight = nightIndex;
    const pts = map.raidPoints || [[0, 30]];
    const n = 3 + Math.min(4, Math.floor(G.day / 2));
    const a = pts[Math.floor(G.rng() * pts.length)];
    const b = pts[Math.floor(G.rng() * pts.length)];
    let made = 0;
    for (let k = 0; k < n; k++) {
      const p = k % 2 ? a : b;
      const type = k === 0 && G.day >= 6 ? "armored" : k === 1 && G.day >= 4 ? "runner" : "walker";
      const s = freeSpot(G, p[0], p[1], 3, 0);
      if (!s) continue;
      const z = spawnZombie(G, type, s[0], s[1], { hx: 0, hz: 0, r: 18, raid: true });
      z.state = "chase";
      z.lastSeen = { x: P.x, z: P.z };
      made++;
    }
    R.raid = { left: made, total: made };
    emit(G, { t: "raid", n: made });
  }
  if (R.raid && R.raid.left <= 0) {
    R.raid = null;
    G.flags.raid_survived = true;
    giveXp(G, 80);
    emit(G, { t: "raidEnd" });
  }
  // depleted nodes regrow (out of sight)
  R.respawnT -= dt;
  if (R.respawnT <= 0) {
    R.respawnT = 4;
    const ls = G.locs[G.loc];
    for (const n of R.nodes)
      if (!n.alive && G.t >= n.respawnAt && (n.x - P.x) ** 2 + (n.z - P.z) ** 2 > 20 * 20) {
        n.alive = true;
        n.left = n.def.amount || 1;
        n.acc = 0;
        delete ls.nodes[n.id];
        emit(G, { t: "regrow", node: n.id });
      }
  }
}

/* =================================================================== interaction */
/**
 * The nearest thing the interact button would act on:
 * {kind, id, x, z, label, verb, ok, hint}.
 */
export function findInteract(G) {
  const P = G.P;
  const R = G.R;
  const map = R.map;
  const fx = Math.sin(P.yaw);
  const fz = Math.cos(P.yaw);
  let best = null;
  let bs = 1e9;
  const consider = (o, d) => {
    const dx = o.x - P.x;
    const dz = o.z - P.z;
    const l = Math.hypot(dx, dz) || 1;
    const facing = (dx * fx + dz * fz) / l;
    const s = d - facing * 0.45 + (o.pri || 0);
    if (s < bs) {
      bs = s;
      best = o;
    }
  };
  const ls = G.locs[G.loc];
  for (const c of map.containers) {
    const dm = CONTAINER_DIMS[c.t] || [0.5, 0.5];
    const d = Math.hypot(c.x - P.x, c.z - P.z) - Math.max(dm[0], dm[1]) * 0.8;
    if (d > 1.5) continue;
    const opened = ls.cont[c.id] != null;
    const empty = opened && !ls.cont[c.id].some(Boolean);
    consider({ kind: "container", id: c.id, x: c.x, z: c.z, verb: empty ? "Search (empty)" : opened ? "Open" : "Search", label: c.name, ok: true }, d);
  }
  if (ls.bag && Math.hypot(ls.bag.x - P.x, ls.bag.z - P.z) < 2) consider({ kind: "bag", id: "bag", x: ls.bag.x, z: ls.bag.z, verb: "Recover", label: "Your dropped backpack", ok: true, pri: -1 }, Math.hypot(ls.bag.x - P.x, ls.bag.z - P.z));
  for (const n of R.nodes) {
    if (!n.alive) continue;
    const d = Math.hypot(n.x - P.x, n.z - P.z) - (n.solidR || 0);
    if (d > (n.def.pick ? 1.5 : 1.7)) continue;
    if (n.def.pick) consider({ kind: "pick", id: n.id, x: n.x, z: n.z, verb: "Collect", label: n.def.label, ok: true }, d);
    else {
      const tool = bestToolFor(n.def.kind, toolList(G));
      const hint = tool ? `with ${ITEMS[tool.id].name}` : n.def.min ? n.def.need : "bare-handed";
      consider({ kind: "gather", id: n.id, x: n.x, z: n.z, verb: n.def.kind === "tree" ? "Chop" : n.def.kind === "rock" ? "Mine" : n.def.kind === "scrap" ? "Salvage" : "Harvest", label: n.def.label, hint, ok: true, pri: 0.25 }, d);
    }
  }
  if (G.loc === "camp")
    for (const s of G.structures) {
      const P2 = PIECES[s.kind];
      const d = Math.hypot(s.x - P.x, s.z - P.z) - (P2.place === "edge" ? 0.4 : 0.6);
      if (d > 1.6) continue;
      if (P2.door) consider({ kind: "door", id: s.id, x: s.x, z: s.z, verb: s.open ? "Close" : "Open", label: P2.tiers[s.tier].name, ok: true }, d);
      else if (P2.storage) consider({ kind: "chest", id: s.id, x: s.x, z: s.z, verb: "Open", label: P2.tiers[s.tier].name, ok: true }, d);
      else if (P2.station) consider({ kind: "station", id: s.id, x: s.x, z: s.z, verb: s.kind === "campfire" ? "Cook" : "Craft", label: P2.tiers[s.tier].name, ok: true }, d);
      else if (s.kind === "collector") {
        const w = Math.floor(s.water || 0);
        consider({ kind: "collector", id: s.id, x: s.x, z: s.z, verb: w ? `Collect ${w} water` : "Filling…", label: "Rain Collector", ok: w > 0 }, d);
      } else if (s.kind === "bed") consider({ kind: "bed", id: s.id, x: s.x, z: s.z, verb: "Rest", label: "Bedroll", ok: true }, d);
    }
  for (const src of map.sources) {
    const d = Math.hypot(src.x - P.x, src.z - P.z) - (src.r - 1.4);
    if (d > 1.4) continue;
    const has = count(G.inv, "empty_bottle") > 0;
    consider({ kind: "source", id: src.t, x: src.x, z: src.z, verb: has ? "Fill bottles" : "Need an empty bottle", label: src.name, ok: has }, Math.max(0, d));
  }
  for (const ex of map.exits) {
    const d = Math.hypot(ex.x - P.x, ex.z - P.z);
    if (d > ex.r) continue;
    const locked = ex.to && !G.unlocked.includes(ex.to);
    consider({ kind: "exit", id: ex.to || "map", x: ex.x, z: ex.z, verb: locked ? "Locked" : ex.to ? "Enter" : "Travel", label: ex.label, ok: !locked, hint: locked ? `Requires ${LOCATIONS[ex.to].unlock}` : null, pri: -0.5 }, d);
  }
  for (const d of R.doors) {
    if (d.open) continue;
    const dd = Math.hypot(d.x - P.x, d.z - P.z);
    if (dd > 2.4) continue;
    const ok = d.key ? haveItem(G, d.key) : d.flag ? !!G.flags[d.flag] : true;
    const label = d.kind === "blast" ? (ok ? "Blast door — powered" : "Blast door — no power") : d.label;
    consider({ kind: "lockdoor", id: d.id, x: d.x, z: d.z, verb: ok ? (d.kind === "blast" ? "Open" : "Unlock") : "Locked", label, ok }, dd);
  }
  for (const s of R.switches) {
    const dd = Math.hypot(s.x - P.x, s.z - P.z);
    if (dd > 2.2) continue;
    const on = !!G.flags[s.flag];
    consider({ kind: "switch", id: s.id, x: s.x, z: s.z, verb: on ? "Power is on" : s.label, label: "Generator switchboard", ok: !on }, dd);
  }
  return best;
}

function toolList(G) {
  const out = [];
  if (G.equip.hand) out.push({ ...ITEMS[G.equip.hand.id], id: G.equip.hand.id, where: "hand" });
  G.inv.slots.forEach((s, i) => {
    if (s && ITEMS[s.id].w?.gather) out.push({ ...ITEMS[s.id], id: s.id, where: i });
  });
  return out;
}

export function doInteract(G) {
  const it = G.interact;
  const P = G.P;
  const R = G.R;
  if (!it || P.dead) return false;
  if (P.act && P.act.k !== "use" && it.kind !== "gather") return false;
  const ls = G.locs[G.loc];
  switch (it.kind) {
    case "container": {
      openContainer(G, it.id);
      return true;
    }
    case "bag":
      G.open = { kind: "bag" };
      emit(G, { t: "open", what: "bag" });
      return true;
    case "pick": {
      const n = R.nodeById.get(it.id);
      P.act = { k: "pick", t: 0, dur: 0.6, hit: 0.4, done: false, node: n };
      P.yaw = yawOf(n.x - P.x, n.z - P.z);
      emit(G, { t: "pickStart", node: n.id });
      return true;
    }
    case "gather": {
      const n = R.nodeById.get(it.id);
      if (!n) return false;
      // pull the best tool for the job into the hand
      const tool = bestToolFor(n.def.kind, toolList(G));
      if (tool && tool.where !== "hand") equipSlot(G, tool.where);
      return startAttack(G, null, yawOf(n.x - P.x, n.z - P.z));
    }
    case "door":
      setDoor(G, it.id, !structureById(G, it.id).open);
      return true;
    case "chest":
      G.open = { kind: "chest", sid: it.id };
      emit(G, { t: "open", what: "chest" });
      return true;
    case "station": {
      const s = structureById(G, it.id);
      G.open = { kind: "craft", station: PIECES[s.kind].tiers[s.tier].station || PIECES[s.kind].station };
      emit(G, { t: "open", what: "craft" });
      return true;
    }
    case "collector": {
      const s = structureById(G, it.id);
      const n = Math.floor(s.water || 0);
      if (n <= 0) return false;
      const fit = Math.min(n, room(G.inv, "water_bottle"));
      if (fit <= 0) return emit(G, { t: "toast", text: "Inventory full", kind: "bad" }), false;
      s.water -= fit;
      giveItem(G, "water_bottle", fit);
      return true;
    }
    case "bed": {
      if (R.zombies.some((z) => z.state === "chase" || z.state === "siege")) return emit(G, { t: "toast", text: "You can't rest with the dead this close", kind: "bad" }), false;
      if (G.t - (P.restT ?? -999) < 90) return emit(G, { t: "toast", text: "You're not tired yet", kind: "warn" }), false;
      P.restT = G.t;
      P.hp = Math.min(P.maxHp, P.hp + 35);
      P.stam = 100;
      P.food = Math.max(0, P.food - 6);
      P.water = Math.max(0, P.water - 8);
      G.clock += 1.5;
      G.respawn = { x: it.x, z: it.z + 1.2 };
      emit(G, { t: "rest" });
      emit(G, { t: "toast", text: "You rest for a while. Respawn point set.", kind: "good" });
      return true;
    }
    case "source": {
      const n = count(G.inv, "empty_bottle");
      if (!n) return emit(G, { t: "toast", text: "You need an empty bottle", kind: "warn" }), false;
      remove(G.inv, "empty_bottle", n);
      const left = add(G.inv, "dirty_water", n);
      if (left) add(G.inv, "empty_bottle", left);
      G.stats.gathered.dirty_water = (G.stats.gathered.dirty_water || 0) + n - left;
      G.invVersion++;
      emit(G, { t: "fill", n: n - left });
      emit(G, { t: "pickup", id: "dirty_water", n: n - left, x: P.x, z: P.z });
      return true;
    }
    case "exit": {
      if (!it.ok) return emit(G, { t: "toast", text: it.hint || "Locked", kind: "bad" }), false;
      if (R.zombies.some((z) => (z.state === "chase" || z.state === "windup") && (z.x - P.x) ** 2 + (z.z - P.z) ** 2 < 14 * 14)) return emit(G, { t: "toast", text: "Shake off the dead before you travel", kind: "bad" }), false;
      if (it.id !== "map") {
        travel(G, it.id);
        return true;
      }
      G.open = { kind: "map" };
      emit(G, { t: "open", what: "map" });
      return true;
    }
    case "lockdoor": {
      const d = R.doors.find((q) => q.id === it.id);
      if (!it.ok) return emit(G, { t: "toast", text: d.label, kind: "bad" }), false;
      d.open = true;
      ls.doors[d.id] = true;
      G.flags[`door_${d.id}`] = true;
      refreshDynamic(G);
      emit(G, { t: "unlockDoor", id: d.id, x: d.x, z: d.z, kind: d.kind });
      emit(G, { t: "toast", text: d.kind === "blast" ? "The blast door grinds open…" : "Access granted", kind: "good" });
      giveXp(G, 30);
      return true;
    }
    case "switch": {
      const s = R.switches.find((q) => q.id === it.id);
      if (G.flags[s.flag]) return false;
      G.flags[s.flag] = true;
      emit(G, { t: "power" });
      emit(G, { t: "toast", text: "Power restored. Somewhere, a heavy door unlocks.", kind: "good" });
      giveXp(G, 40);
      noise(G, P.x, P.z, 28);
      return true;
    }
  }
  return false;
}

function finishPick(G, n) {
  if (!n || !n.alive) return;
  const got = [];
  for (const [id, [mn, mx]] of Object.entries(n.def.give)) {
    const k = rint(G.rng, mn, mx);
    if (k > 0) {
      giveItem(G, id, k, { gathered: true, x: n.x, z: n.z });
      got.push([id, k]);
      giveXp(G, k);
    }
  }
  n.alive = false;
  n.respawnAt = G.t + n.def.resp;
  G.locs[G.loc].nodes[n.id] = n.respawnAt;
  emit(G, { t: "deplete", node: n.id, x: n.x, z: n.z, kind: "pick", t2: n.t });
}

/** Open (and on first visit roll) a world container. */
export function openContainer(G, cid) {
  const c = G.R.map.containers.find((q) => q.id === cid);
  if (!c) return null;
  const ls = G.locs[G.loc];
  let first = false;
  if (ls.cont[cid] == null) {
    first = true;
    const items = c.contents ? Object.entries(c.contents).map(([id, n]) => ({ id, n })) : rollTable(G.rng, c.table);
    const slots = Array(Math.max(8, items.length)).fill(null);
    items.forEach((it, i) => {
      slots[i] = { id: it.id, n: it.n };
      if (ITEMS[it.id]?.dur) slots[i].d = Math.round(ITEMS[it.id].dur * (c.contents ? 1 : 0.55 + G.rng() * 0.45));
    });
    ls.cont[cid] = slots;
    ls.looted[cid] = c.contents ? -1 : G.t + HOUR * 48;
  } else if (ls.looted[cid] > 0 && G.t > ls.looted[cid] && !ls.cont[cid].some(Boolean)) {
    // restocked after two days
    const items = rollTable(G.rng, c.table);
    ls.cont[cid] = Array(8).fill(null);
    items.forEach((it, i) => (ls.cont[cid][i] = { id: it.id, n: it.n, ...(ITEMS[it.id]?.dur ? { d: Math.round(ITEMS[it.id].dur * 0.7) } : {}) }));
    ls.looted[cid] = G.t + HOUR * 48;
    first = true;
  }
  if (first) {
    G.stats.looted[G.loc] = (G.stats.looted[G.loc] || 0) + 1;
    giveXp(G, 5);
  }
  G.open = { kind: "container", id: cid };
  G.P.act = { k: "loot", t: 0, dur: 0.45, hit: 9, done: true };
  emit(G, { t: "open", what: "container", id: cid, first, tt: c.t });
  return ls.cont[cid];
}

/** The inventory object behind whatever panel is open (for transfers). */
export function openInv(G) {
  const o = G.open;
  if (!o) return null;
  const ls = G.locs[G.loc];
  if (o.kind === "container") return ls.cont[o.id] ? { slots: ls.cont[o.id], set: (s) => (ls.cont[o.id] = s) } : null;
  if (o.kind === "chest") return structureById(G, o.sid)?.inv || null;
  if (o.kind === "bag") {
    if (!ls.bag) return null;
    return ls.bag.inv;
  }
  return null;
}

/** After a transfer, tidy up (empty bags disappear). */
export function afterTransfer(G) {
  const ls = G.locs[G.loc];
  if (ls.bag && !ls.bag.inv.slots.some(Boolean)) {
    ls.bag = null;
    if (G.open?.kind === "bag") G.open = null;
    emit(G, { t: "toast", text: "Backpack recovered", kind: "good" });
  }
  G.invVersion++;
}

/* =================================================================== crafting */
export function stationsNear(G) {
  const out = new Set();
  if (G.loc !== "camp") return out;
  const P = G.P;
  for (const s of G.structures) {
    const P2 = PIECES[s.kind];
    if (!P2.station) continue;
    if ((s.x - P.x) ** 2 + (s.z - P.z) ** 2 > 4.2 * 4.2) continue;
    out.add(P2.station);
    const st = P2.tiers[s.tier].station;
    if (st) out.add(st);
  }
  return out;
}

export function recipeState(G, r, near = stationsNear(G)) {
  if (r.unlock && !G.flags[r.unlock]) return { ok: false, locked: true, reason: "Find the Gunsmith Notes" };
  if (G.P.level < r.level) return { ok: false, locked: true, reason: `Requires level ${r.level}` };
  if (r.station && !near.has(r.station)) return { ok: false, reason: `Requires a ${STATION_NAMES[r.station]} nearby` };
  for (const [id, n] of Object.entries(r.cost)) if (count(G.inv, id) < n) return { ok: false, reason: "Missing materials" };
  return { ok: true };
}

export function craft(G, rid, times = 1) {
  const r = RECIPE_BY_ID[rid];
  if (!r) return { ok: false, reason: "Unknown recipe" };
  let made = 0;
  for (let k = 0; k < times; k++) {
    const st = recipeState(G, r);
    if (!st.ok) {
      if (!made) return st;
      break;
    }
    // check space for the output (consumed inputs may free a slot)
    const sim = { slots: G.inv.slots.map((s) => (s ? { ...s } : null)) };
    for (const [id, n] of Object.entries(r.cost)) remove(sim, id, n);
    const fits = add(sim, r.out, r.n) === 0 || (!G.equip.hand && ITEMS[r.out].w && r.n === 1);
    if (!fits) {
      if (!made) return { ok: false, reason: "Inventory full" };
      break;
    }
    for (const [id, n] of Object.entries(r.cost)) remove(G.inv, id, n);
    giveItem(G, r.out, r.n);
    G.stats.crafted[r.out] = (G.stats.crafted[r.out] || 0) + r.n;
    giveXp(G, 3 + Object.values(r.cost).reduce((a, b) => a + b, 0) * 0.4);
    made++;
  }
  G.invVersion++;
  emit(G, { t: "craft", id: r.out, n: r.n * made, station: r.station });
  checkMissions(G);
  return { ok: true, made };
}

export function availableRecipes(G) {
  const near = stationsNear(G);
  return RECIPES.map((r) => ({ r, s: recipeState(G, r, near) }));
}

/* =================================================================== travel / death */
export function travel(G, to) {
  if (!G.unlocked.includes(to) || !LOCATIONS[to]) return false;
  if (G.P.dead) return false;
  if (to === G.loc) {
    G.open = null;
    return false;
  }
  const P = G.P;
  P.food = Math.max(0, P.food - 5);
  P.water = Math.max(0, P.water - 7);
  G.clock += 1;
  if (G.clock >= 24) {
    G.clock -= 24;
    G.day++;
  }
  G.stats.travels++;
  enterLocation(G, to, "travel");
  emit(G, { t: "travel", to });
  return true;
}

export function respawn(G) {
  const P = G.P;
  if (!P.dead) return false;
  const ls = G.locs[G.loc];
  const items = G.inv.slots.filter(Boolean);
  if (items.length) {
    if (ls.bag) {
      for (const it of items) {
        const left = add(ls.bag.inv, it.id, it.n, it);
        if (left) ls.bag.inv.slots.push({ ...it, n: left });
      }
    } else {
      ls.bag = { x: P.x, z: P.z, inv: { slots: items.map((s) => ({ ...s })).concat(Array(Math.max(0, 8 - items.length)).fill(null)) } };
    }
    G.inv.slots = G.inv.slots.map(() => null);
  }
  for (const k of Object.keys(G.equip)) {
    const e = G.equip[k];
    if (e && e.d != null) e.d = Math.max(1, Math.round(e.d * 0.85));
  }
  G.stats.deaths++;
  P.dead = false;
  P.deadT = 0;
  P.hp = Math.round(P.maxHp * 0.6);
  P.food = Math.max(P.food, 45);
  P.water = Math.max(P.water, 45);
  P.stam = 100;
  P.poison = 0;
  P.exhausted = false;
  P.act = null;
  G.invVersion++;
  enterLocation(G, "camp", "respawn");
  P.iframes = 2;
  emit(G, { t: "respawn", bag: items.length > 0 });
  return true;
}

/* =================================================================== save / load */
export function serialize(G) {
  const P = G.P;
  return {
    v: SAVE_VERSION,
    seed: G.seed,
    difficulty: G.difficulty,
    t: G.t,
    clock: G.clock,
    day: G.day,
    loc: G.loc,
    locs: G.locs,
    unlocked: G.unlocked,
    visited: G.visited,
    P: { x: P.x, z: P.z, yaw: P.yaw, hp: P.hp, maxHp: P.maxHp, food: P.food, water: P.water, stam: P.stam, poison: P.poison, level: P.level, xp: P.xp, dead: P.dead, restT: P.restT },
    inv: G.inv.slots,
    equip: G.equip,
    quick: G.quick,
    structures: G.structures.map((s) => ({ id: s.id, kind: s.kind, tier: s.tier, key: s.key, rot: s.rot || 0, hp: s.hp, inv: s.inv ? s.inv.slots : undefined, water: s.water })),
    nextSid: G.nextSid,
    respawn: G.respawn,
    flags: G.flags,
    stats: G.stats,
    done: G.done,
    weather: G.weather,
    raidNight: G.raidNight,
    savedAt: Date.now(),
  };
}

export function deserialize(d) {
  try {
    if (!d || typeof d !== "object" || !Number.isFinite(d.seed) || (d.v | 0) < 1 || (d.v | 0) > SAVE_VERSION) return null;
    const G = baseState(d.seed, d.difficulty);
    G.t = +d.t || 0;
    G.clock = Number.isFinite(d.clock) ? d.clock : 8;
    G.day = d.day | 0 || 1;
    G.locs = d.locs && typeof d.locs === "object" ? d.locs : {};
    for (const ls of Object.values(G.locs)) {
      ls.nodes = ls.nodes || {};
      ls.cont = ls.cont || {};
      ls.looted = ls.looted || {};
      ls.doors = ls.doors || {};
    }
    G.unlocked = Array.isArray(d.unlocked) ? d.unlocked.filter((l) => LOCATIONS[l]) : ["camp", "forest"];
    if (!G.unlocked.includes("camp")) G.unlocked.unshift("camp");
    G.visited = Array.isArray(d.visited) ? d.visited : [];
    Object.assign(G.P, d.P || {});
    G.P.maxHp = maxHpFor(G.P.level | 0 || 1);
    G.P.hp = clamp(+G.P.hp || 1, 0, G.P.maxHp);
    const cleanSlot = (s) => (s && ITEMS[s.id] && s.n > 0 ? { id: s.id, n: s.n | 0, ...(s.d != null ? { d: s.d } : {}) } : null);
    G.equip = { hand: null, head: null, body: null, legs: null, feet: null, pack: null };
    for (const k of Object.keys(G.equip)) G.equip[k] = cleanSlot(d.equip?.[k]);
    const size = invSize(G);
    G.inv.slots = Array(size).fill(null);
    (Array.isArray(d.inv) ? d.inv : []).forEach((s, i) => {
      if (i < size) G.inv.slots[i] = cleanSlot(s);
    });
    G.quick = Array.isArray(d.quick) ? d.quick.slice(0, QUICK).map((q) => (ITEMS[q] ? q : null)) : Array(QUICK).fill(null);
    while (G.quick.length < QUICK) G.quick.push(null);
    G.structures = (Array.isArray(d.structures) ? d.structures : [])
      .filter((s) => PIECES[s.kind] && PIECES[s.kind].tiers[s.tier | 0])
      .map((s) => {
        const P2 = PIECES[s.kind];
        const o = { id: s.id, kind: s.kind, tier: s.tier | 0, key: s.key, rot: s.rot | 0, hp: s.hp, open: false };
        const at = pieceAtSafe(s.kind, s.key, o.rot);
        if (!at) return null;
        Object.assign(o, { x: at.x, z: at.z, yaw: at.yaw });
        if (P2.storage) o.inv = { slots: Array(P2.tiers[o.tier].slots).fill(null).map((_, i) => cleanSlot(s.inv?.[i])) };
        if (s.kind === "collector") o.water = +s.water || 0;
        return o;
      })
      .filter(Boolean);
    G.nextSid = Math.max(d.nextSid | 0, ...G.structures.map((s) => s.id + 1), 1);
    G.respawn = d.respawn || null;
    G.flags = d.flags || {};
    G.stats = Object.assign(G.stats, d.stats || {});
    G.done = Array.isArray(d.done) ? d.done : [];
    G.weather = d.weather && d.weather.kind ? d.weather : G.weather;
    G.raidNight = d.raidNight | 0;
    G.rng = mulberry32((G.seed ^ Math.floor(G.t * 1000)) >>> 0);
    const wasDead = G.P.dead;
    enterLocation(G, LOCATIONS[d.loc] ? d.loc : "camp", "load");
    if (wasDead) {
      G.P.dead = true;
      respawn(G);
    }
    G.events.length = 0;
    return G;
  } catch (err) {
    console.error("[LastHope] bad save", err);
    return null;
  }
}

function pieceAtSafe(kind, key, rot) {
  try {
    if (typeof key !== "string" || key.split(":").length !== 3) return null;
    return pieceAt(kind, key, rot);
  } catch {
    return null;
  }
}

/* =================================================================== HUD */
export function hudSnapshot(G) {
  const P = G.P;
  const R = G.R;
  const hand = G.equip.hand;
  const w = weaponOf(G);
  let boss = null;
  for (const z of R.zombies)
    if (z.boss && z.state !== "dead" && (z.state !== "idle" || Math.hypot(z.x - P.x, z.z - P.z) < 18) && Math.hypot(z.x - P.x, z.z - P.z) < 34) boss = { name: BOSSES[z.boss].name, hp: z.hp, max: z.maxHp };
  const it = G.interact;
  return {
    hp: P.hp,
    maxHp: P.maxHp,
    food: P.food,
    water: P.water,
    stam: P.stam,
    exhausted: P.exhausted,
    poison: P.poison > 0,
    warm: !!P.warm,
    level: P.level,
    xp: P.xp,
    xpNext: xpFor(P.level),
    clock: G.clock,
    day: G.day,
    night: isNight(G),
    loc: G.loc,
    weather: G.weather.kind,
    dead: P.dead,
    deadT: P.deadT,
    hand: hand ? { id: hand.id, d: hand.d, max: ITEMS[hand.id].dur || 0 } : null,
    ammo: w.ammo ? { id: w.ammo, n: count(G.inv, w.ammo) } : null,
    quick: G.quick.map((id) => (id ? { id, n: ITEMS[id].w ? (G.equip.hand?.id === id ? 1 : count(G.inv, id)) : count(G.inv, id), on: G.equip.hand?.id === id } : null)),
    interact: it ? { verb: it.verb, label: it.label, hint: it.hint || null, ok: it.ok, kind: it.kind } : null,
    missions: tracked(G).map((m) => {
      const p = progress(G, m);
      return { id: m.id, title: m.title, desc: m.desc, cur: p.cur, need: p.need };
    }),
    doneCount: G.done.length,
    boss,
    raid: R.raid ? { left: R.raid.left, total: R.raid.total } : null,
    inside: P.inside,
    chased: R.zombies.some((z) => z.state === "chase" || z.state === "windup" || z.state === "siege"),
    invV: G.invVersion,
  };
}

export { isNight, dropItems, giveItem };
