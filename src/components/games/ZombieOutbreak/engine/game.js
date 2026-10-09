/**
 * Zombie Outbreak — one stage attempt (framework-free; runs in the browser
 * and headless in tools/simTest.mjs).
 *
 *   PREPARING ─▶ PLAYING (wave n) ─▶ BETWEEN_WAVES ─▶ PLAYING (wave n+1) … ─▶ STAGE_COMPLETE
 *                     └────────────── player hp 0 ──────────────▶ GAME_OVER
 *
 * (MENU / STAGE_SELECT / WEAPON_SELECT / PAUSED live in the React shell; a
 * paused game is simply not stepped.)
 *
 * update(dt, input) runs fixed sub-steps of at most 1/60 s; look() is applied
 * per rendered frame for responsiveness. Everything the renderer, HUD and
 * audio need comes out as plain state plus an event queue (drain()).
 */
import { createWorld } from "./world.js";
import { createNav } from "./nav.js";
import { createRng, clamp, approach, raySphere, wrapAngle } from "./math.js";
import { navClass, createZombiePool, spawnZombie, updateZombie, separate, damageZombie, killZombie, isLiving, Z } from "./zombies.js";
import { createArsenal, tickArsenal, startReload, switchTo, pressTrigger, wantShot, addAmmo, ammoFull, totalAmmoFraction } from "./weapons.js";
import { getArena } from "../data/arenas/index.js";
import { enemyDef } from "../data/enemies.js";

export const STATE = {
  PREPARING: "PREPARING",
  PLAYING: "PLAYING",
  BETWEEN_WAVES: "BETWEEN_WAVES",
  GAME_OVER: "GAME_OVER",
  STAGE_COMPLETE: "STAGE_COMPLETE",
};

export const EYE = 1.62;
const WALK = 4.6;
const SPRINT = 7.3;
const GRAVITY = 17;
const JUMP_V = 5.7;
const POOL = 30;
const PREP_TIME = 3.2;
const BREAK_TIME = 7;
const CLEAR_DELAY = 2.4;
const ARMOR_ABSORB = 0.6;

const PICKUP_INFO = {
  health: { label: "HEALTH PACK" },
  ammo: { label: "AMMO BOX" },
  armor: { label: "ARMOR VEST" },
  boost: { label: "DAMAGE BOOST" },
};

export function createGame(stage, opts = {}) {
  const arena = getArena(stage.arena);
  const world = createWorld(arena, stage.extras || []);
  const nav = createNav(world);
  const rng = createRng(opts.seed ?? 1234);
  const start = stage.start || arena.start;
  const mods = stage.mods || {};

  const player = {
    x: start.x,
    z: start.z,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    kx: 0,
    kz: 0,
    yaw: start.yaw || 0,
    pitch: 0,
    radius: 0.36,
    grounded: true,
    hp: 100,
    maxHp: 100,
    armor: stage.startArmor || 0,
    maxArmor: 100,
    stamina: 100,
    exhausted: false,
    regenDelay: 0,
    sprinting: false,
    sprintBlock: 0,
    ads: 0,
    alive: true,
    bobPhase: 0,
    speed: 0,
    recoilP: 0,
    recoilY: 0,
    hurtT: 0,
    boostT: 0,
    deathT: 0,
    landDip: 0,
    stepAcc: 0,
  };

  const g = {
    stage,
    arena,
    world,
    nav,
    rng,
    time: 0,
    state: STATE.PREPARING,
    stateT: PREP_TIME,
    frozen: false,
    events: [],
    player,
    arsenal: createArsenal(opts.loadout),
    zombies: createZombiePool(POOL),
    projectiles: Array.from({ length: 40 }, () => ({ active: false })),
    hazards: Array.from({ length: 28 }, () => ({ active: false })),
    pickups: [],
    nextId: 1,
    nextPickupId: 1,
    waveIdx: -1,
    wave: null,
    waveTime: 0,
    queue: [],
    spawnT: 0,
    burst: 0,
    bossPending: -1,
    boss: null,
    bossDefeated: false,
    capBase: opts.maxActive || 14,
    spawnUsed: {},
    supplyCd: 8,
    supplyCheck: 1,
    relocateCheck: 1,
    score: 0,
    combo: 0,
    comboT: 0,
    prompt: null,
    clearT: 0,
    stats: { shots: 0, hits: 0, headshots: 0, kills: 0, byType: {}, waves: 0, damageTaken: 0, bossKills: 0, pickups: 0 },
    shake: 0,
    mods,
  };

  // Spawn-point validity per size class: never inside geometry, and the
  // spawn must be connected to the player's start (a brute can't use a
  // spawn behind a door it doesn't fit through).
  nav.update(0, player.x, player.z, true);
  g.spawnOk = {};
  for (const [id, s] of Object.entries(arena.spawns)) {
    g.spawnOk[id] = [0, 1, 2].map((cls) => !world.isBlocked(cls, s.x, s.z) && nav.fields[cls].dist[world.cellOf(s.x, s.z)] < nav.INF);
  }

  /* ------------------------------------------------------------ events */
  g.emit = (e) => {
    g.events.push(e);
  };
  g.drain = () => {
    const e = g.events;
    g.events = [];
    return e;
  };

  /* ------------------------------------------------------------ look */
  g.look = (dx, dy, sens = 1) => {
    if (!player.alive) return;
    const def = g.arsenal.def;
    const zoomK = 1 - (1 - def.adsZoom) * player.ads;
    const k = 0.0022 * sens * (0.45 + 0.55 * zoomK);
    player.yaw -= dx * k;
    player.pitch = clamp(player.pitch - dy * k, -1.45, 1.45);
  };

  /* ------------------------------------------------------------ public helpers used by zombies/bosses */
  g.damagePlayer = (amount, fx, fz, kind) => {
    if (!player.alive || g.state === STATE.STAGE_COMPLETE || g.clearT > 0) return;
    if (amount <= 0) return;
    const absorbed = Math.min(player.armor, amount * ARMOR_ABSORB);
    player.armor -= absorbed;
    const dmg = amount - absorbed;
    player.hp -= dmg;
    player.hurtT = 0.45;
    g.stats.damageTaken += dmg;
    g.shake = Math.max(g.shake, Math.min(1, 0.25 + amount / 40));
    g.emit({ type: "phurt", amount, armor: absorbed, fx, fz, kind });
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      player.deathT = 0;
      g.state = STATE.GAME_OVER;
      g.stateT = 0;
      g.frozen = true;
      g.emit({ type: "pdead" });
    }
  };

  g.knockPlayer = (vx, vz) => {
    player.kx += vx;
    player.kz += vz;
  };

  g.addHazard = (kind, x, z, r, o = {}) => {
    const h = g.hazards.find((q) => !q.active);
    if (!h) return null;
    Object.assign(h, { active: true, kind, x, z, r, t: 0, dur: o.dur ?? 1, follow: o.follow || null, ahead: o.ahead || 0, ring: !!o.ring, len: o.len || 0, yaw: o.follow ? o.follow.yaw : 0, speed: o.speed || 0, maxR: o.maxR || 0, dmg: o.dmg || 0, dps: o.dps || 0, tick: 0, done: false, id: g.nextId++ });
    return h;
  };

  g.launchProjectile = (kind, sx, sy, sz, tx, ty, tz, speed, dmg, splash) => {
    const pr = g.projectiles.find((q) => !q.active);
    if (!pr) return;
    const d = Math.hypot(tx - sx, tz - sz);
    const T = Math.max(0.35, d / speed);
    const G = 6;
    Object.assign(pr, { active: true, kind, x: sx, y: sy, z: sz, vx: (tx - sx) / T, vz: (tz - sz) / T, vy: (ty - sy + 0.5 * G * T * T) / T, g: G, dmg, splash, life: T + 2.5, r: 0.2, id: g.nextId++ });
  };

  g.lobGlob = (sx, sy, sz, tx, tz, T, dmg) => {
    const pr = g.projectiles.find((q) => !q.active);
    if (!pr) return;
    const pt = { x: tx, z: tz };
    world.resolveCircle(pt, 0.5);
    const G = 9.8;
    Object.assign(pr, { active: true, kind: "glob", x: sx, y: sy, z: sz, vx: (pt.x - sx) / T, vz: (pt.z - sz) / T, vy: (0 - sy + 0.5 * G * T * T) / T, g: G, dmg, splash: 1.9, life: T + 1.5, r: 0.35, id: g.nextId++ });
    g.addHazard("warn", pt.x, pt.z, 1.9, { dur: T, glob: true });
  };

  g.explode = (x, y, z, r, dmgPlayer, dmgZombie, src) => {
    g.emit({ type: "explode", x, y, z, r });
    const p = player;
    const d = Math.hypot(p.x - x, p.y + 1 - y, p.z - z);
    if (dmgPlayer > 0 && d < r && world.clearShot(x, y, z, p.x, p.y + 1, p.z)) {
      g.damagePlayer(dmgPlayer * (1 - 0.65 * (d / r)), x, z, "explosion");
    }
    if (d < r * 2.2) g.shake = Math.max(g.shake, 0.7 * (1 - d / (r * 2.2)));
    for (const zz of g.zombies) {
      if (zz === src || !isLiving(zz)) continue;
      const dz = Math.hypot(zz.x - x, zz.z - z);
      if (dz > r + zz.radius) continue;
      if (!world.clearShot(x, y, z, zz.x, 1, zz.z)) continue;
      damageZombie(zz, dmgZombie * (1 - 0.5 * clamp(dz / r, 0, 1)), 1, 1, g, { explosion: true });
    }
  };

  g.minionCount = () => g.zombies.reduce((n, z) => n + (isLiving(z) && z.minion ? 1 : 0), 0);

  g.spawnMinion = (type) => {
    const z = g.zombies.find((q) => !q.active);
    if (!z) return;
    const sp = pickSpawn(g, g.wave?.spawns || Object.keys(arena.spawns), 0, true);
    if (!sp) return;
    spawnZombie(z, type, sp.x, sp.z, g, waveMods(g));
    z.minion = true;
    g.emit({ type: "spawn", x: sp.x, z: sp.z, ztype: type });
  };

  g.farEntrance = (cls) => {
    let best = null;
    let bd = -1;
    for (const [id, s] of Object.entries(arena.spawns)) {
      if (!g.spawnOk[id][cls]) continue;
      if (nav.distAt(cls, s.x, s.z) >= nav.INF) continue;
      const d = Math.hypot(s.x - player.x, s.z - player.z);
      if (d > bd) {
        bd = d;
        best = s;
      }
    }
    return best || arena.bossSpawn;
  };

  g.onKill = (z, headshot, o = {}) => {
    if (o.self || o.collapse) {
      g.emit({ type: "kill", ztype: z.type, headshot: false, points: 0, x: z.x, z: z.z, boss: false, self: true, id: z.id });
      return;
    }
    g.stats.kills++;
    g.stats.byType[z.type] = (g.stats.byType[z.type] || 0) + 1;
    if (headshot) g.stats.headshots++;
    g.combo = g.comboT > 0 ? Math.min(10, g.combo + 1) : 1;
    g.comboT = 3.5;
    const mult = 1 + 0.1 * (g.combo - 1);
    const pts = Math.round(z.def.points * mult) + (headshot ? 50 : 0);
    g.score += pts;
    g.emit({ type: "kill", ztype: z.type, headshot, points: pts, combo: g.combo, x: z.x, z: z.z, boss: z.boss, id: z.id });
    if (z.boss) {
      g.stats.bossKills++;
      g.bossDefeated = true;
      g.emit({ type: "boss_dead", boss: z.type, name: z.def.name });
      // The horde collapses with its master.
      for (const o2 of g.zombies) if (o2 !== z && isLiving(o2)) killZombie(o2, g, false, { collapse: true, noBurst: true });
      g.queue.length = 0;
    } else if (!z.minion) {
      // Occasional drops keep a long fight supplied.
      const r = rng.next();
      if (r < 0.09) addPickup(g, "ammo", z.x, z.z, "drop");
      else if (r < 0.13) addPickup(g, "health", z.x, z.z, "drop");
    }
  };

  /* ------------------------------------------------------------ main update */
  g.update = (dt, input) => {
    let rem = Math.min(dt, 0.1);
    let first = true;
    while (rem > 1e-6) {
      const h = Math.min(rem, 1 / 60);
      step(g, h, input, first);
      first = false;
      rem -= h;
    }
  };

  g.hud = () => hudSnapshot(g);
  g.result = () => result(g);

  // Stage-start pickups.
  for (const pk of stage.pickups || []) {
    if (pk.when === "start" || pk.when === "both") {
      const pt = arena.pickups[pk.at];
      if (pt) addPickup(g, pk.type, pt.x, pt.z, "stage", pk.at);
    }
  }
  g.emit({ type: "prepare", stage: stage.id });
  return g;
}

/* ================================================================== step */

const NO_INPUT = {
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
  fire: false,
  ads: false,
  moveX: 0,
  moveY: 0,
  take: () => false,
  takeSlot: () => -1,
  takeWheel: () => 0,
};

function step(g, dt, input = NO_INPUT, first) {
  const p = g.player;
  g.time += dt;
  g.shake = Math.max(0, g.shake - dt * 2.2);
  if (p.hurtT > 0) p.hurtT = Math.max(0, p.hurtT - dt);
  const playing = p.alive && g.state !== STATE.STAGE_COMPLETE;
  const inp = playing ? input : NO_INPUT;

  if (!p.alive) p.deathT += dt;

  movePlayer(g, dt, inp, first);
  handleWeapons(g, dt, inp, first);

  if (p.alive) g.nav.update(g.time, p.x, p.z);

  director(g, dt);

  for (const z of g.zombies) if (z.active) updateZombie(z, dt, g);
  separate(g.zombies, g);
  g.world.resolveCircle(p, p.radius);

  updateProjectiles(g, dt);
  updateHazards(g, dt);
  updatePickups(g, dt, inp, first);

  if (g.comboT > 0) {
    g.comboT -= dt;
    if (g.comboT <= 0) g.combo = 0;
  }
  if (p.boostT > 0) p.boostT = Math.max(0, p.boostT - dt);
}

/* ------------------------------------------------------------ player movement */

function movePlayer(g, dt, input, first) {
  const p = g.player;
  const a = g.arsenal;
  if (!p.alive) {
    p.vx = approach(p.vx, 0, dt * 20);
    p.vz = approach(p.vz, 0, dt * 20);
    return;
  }
  let fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0) + (input.moveY || 0);
  let str = (input.right ? 1 : 0) - (input.left ? 1 : 0) + (input.moveX || 0);
  const l = Math.hypot(fwd, str);
  if (l > 1) {
    fwd /= l;
    str /= l;
  }
  const sy = Math.sin(p.yaw);
  const cy = Math.cos(p.yaw);
  // Camera looks toward -Z at yaw 0.
  const wx = -sy * fwd + cy * str;
  const wz = -cy * fwd - sy * str;
  const wishLen = Math.min(1, Math.hypot(wx, wz));

  // ADS.
  const adsWanted = !!input.ads && a.state !== "lower" && a.state !== "raise" && a.state !== "reload";
  p.ads = approach(p.ads, adsWanted ? 1 : 0, dt / 0.16);

  // Sprint (+ forgiving stamina).
  if (p.sprintBlock > 0) p.sprintBlock -= dt;
  const wantSprint = !!input.sprint && fwd > 0.3 && p.ads < 0.3 && p.sprintBlock <= 0 && !p.exhausted && p.stamina > 0;
  p.sprinting = wantSprint && p.grounded ? true : wantSprint && p.sprinting;
  if (p.sprinting) {
    p.stamina = Math.max(0, p.stamina - dt * 14);
    p.regenDelay = 0.6;
    if (p.stamina <= 0) {
      p.exhausted = true;
      p.sprinting = false;
    }
  } else {
    if (p.regenDelay > 0) p.regenDelay -= dt;
    else p.stamina = Math.min(100, p.stamina + dt * 26);
    if (p.exhausted && p.stamina >= 30) p.exhausted = false;
  }

  let maxSpeed = p.sprinting ? SPRINT : WALK;
  maxSpeed *= 1 - 0.36 * p.ads;
  const tvx = wx * maxSpeed;
  const tvz = wz * maxSpeed;
  const accel = p.grounded ? (wishLen > 0.05 ? 44 : 36) : 10;
  const ddx = tvx - p.vx;
  const ddz = tvz - p.vz;
  const dl = Math.hypot(ddx, ddz);
  const stepA = accel * dt;
  if (dl <= stepA) {
    p.vx = tvx;
    p.vz = tvz;
  } else {
    p.vx += (ddx / dl) * stepA;
    p.vz += (ddz / dl) * stepA;
  }

  // Jump / gravity.
  if (first && input.take("jump") && p.grounded) {
    p.vy = JUMP_V;
    p.grounded = false;
    g.emit({ type: "jump" });
  }
  if (!p.grounded) {
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;
    const ceil = g.world.ceiling - 1.85;
    if (p.y > ceil) {
      p.y = ceil;
      p.vy = Math.min(0, p.vy);
    }
    if (p.y <= 0) {
      const impact = -p.vy;
      p.y = 0;
      p.vy = 0;
      p.grounded = true;
      p.landDip = Math.min(1, impact / 9);
      g.emit({ type: "land", impact });
    }
  }

  // Integrate + collide.
  const ox = p.x;
  const oz = p.z;
  p.x += (p.vx + p.kx) * dt;
  p.z += (p.vz + p.kz) * dt;
  const kd = Math.exp(-dt * 7);
  p.kx *= kd;
  p.kz *= kd;
  g.world.resolveCircle(p, p.radius);
  // Bleed velocity into walls so it can't build up against them.
  const ax = (p.x - ox) / dt - p.kx;
  const az = (p.z - oz) / dt - p.kz;
  if (Math.hypot(ax, az) < Math.hypot(p.vx, p.vz) - 0.01) {
    p.vx = ax;
    p.vz = az;
  }
  p.speed = Math.hypot(p.vx, p.vz);
  if (p.grounded && p.speed > 0.4) {
    p.bobPhase += dt * (p.speed * 1.75 + 1.2);
    p.stepAcc += p.speed * dt;
    const stride = p.sprinting ? 1.9 : 1.55;
    if (p.stepAcc >= stride) {
      p.stepAcc = 0;
      g.emit({ type: "step", sprint: p.sprinting });
    }
  }
  p.landDip = Math.max(0, p.landDip - dt * 3);
  // Recoil recovers smoothly.
  const rk = Math.min(1, dt * 9);
  p.recoilP -= p.recoilP * rk;
  p.recoilY -= p.recoilY * rk;
}

/* ------------------------------------------------------------ weapons */

function handleWeapons(g, dt, input, first) {
  const p = g.player;
  const a = g.arsenal;
  const out = [];
  tickArsenal(a, dt, out);
  if (p.alive && g.state !== STATE.STAGE_COMPLETE) {
    if (first) {
      const slot = input.takeSlot ? input.takeSlot() : -1;
      if (slot >= 0) switchTo(a, slot, out);
      const wheel = input.takeWheel ? input.takeWheel() : 0;
      if (wheel !== 0 && a.slots.length > 1) {
        const base = a.state === "lower" ? a.next : a.cur;
        switchTo(a, (base + wheel + a.slots.length) % a.slots.length, out);
      }
      if (input.take("reload")) startReload(a, out);
      if (input.take("fire")) pressTrigger(a);
    }
    const auto = a.def.mode === "auto";
    if (wantShot(a, auto && !!input.fire, out)) {
      fireShot(g);
      // Auto weapons with very high rpm at low frame rates: keep cadence.
      let guard = 0;
      while (auto && input.fire && a.cd <= 0 && a.slot.mag > 0 && guard++ < 3) {
        if (wantShot(a, true, out)) fireShot(g);
        else break;
      }
    }
    // Auto-reload a few moments after running dry.
    if (a.state === "ready" && a.slot.mag === 0 && a.slot.reserve > 0 && a.sinceShot > 0.22) startReload(a, out);
  }
  for (const e of out) g.emit(e);
}

const tmpHit = { t: 0, nx: 0, ny: 0, nz: 0, surface: "", solid: null };

export function currentSpread(g) {
  const p = g.player;
  const a = g.arsenal;
  const def = a.def;
  let s = def.spread + (def.ads - def.spread) * p.ads;
  const moving = clamp(p.speed / WALK, 0, 1.6);
  s *= 1 + moving * (0.55 - 0.35 * p.ads);
  if (!p.grounded) s *= 1.7;
  if (p.sprinting) s *= 1.6;
  return s + a.bloom * (1 - 0.6 * p.ads);
}

function fireShot(g) {
  const p = g.player;
  const a = g.arsenal;
  const def = a.def;
  const rng = g.rng;
  g.stats.shots++;
  p.sprinting = false;
  p.sprintBlock = 0.3;
  const ox = p.x;
  const oy = p.y + EYE;
  const oz = p.z;
  const yaw = p.yaw + p.recoilY;
  const pitch = p.pitch + p.recoilP;
  const cp = Math.cos(pitch);
  // Forward, right, up basis.
  const fx = -Math.sin(yaw) * cp;
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * cp;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const ux = Math.sin(yaw) * Math.sin(pitch);
  const uy = cp;
  const uz = Math.cos(yaw) * Math.sin(pitch);
  const spread = currentSpread(g);
  const boost = p.boostT > 0 ? 1.5 : 1;
  let anyHit = false;
  const tracers = [];
  for (let i = 0; i < def.pellets; i++) {
    let sx = 0;
    let sy = 0;
    if (spread > 0) {
      const ang = rng.next() * Math.PI * 2;
      // Pellets spread evenly over the cone, single shots bias to the centre.
      const rr = def.pellets > 1 ? Math.sqrt((i + rng.next()) / def.pellets) : Math.sqrt(rng.next()) * 0.85;
      sx = Math.cos(ang) * rr * spread;
      sy = Math.sin(ang) * rr * spread;
    }
    let dx = fx + rx * sx + ux * sy;
    let dy = fy + uy * sy;
    let dz = fz + rz * sx + uz * sy;
    const dl = Math.hypot(dx, dy, dz);
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const r = castRay(g, ox, oy, oz, dx, dy, dz, def, boost);
    if (r.hitZombie) anyHit = true;
    if (i < 4) tracers.push([r.x, r.y, r.z]);
  }
  if (anyHit) g.stats.hits++;
  // Recoil: view kick (recovers in movePlayer) — gentler when aiming.
  const rk = 1 - 0.4 * p.ads;
  p.recoilP += def.recoil.pitch * rk;
  p.recoilY += (rng.next() * 2 - 1) * def.recoil.yaw * rk;
  g.emit({ type: "shot", w: def.id, ads: p.ads, tracers, hit: anyHit });
}

/**
 * One ray: nearest of world geometry and zombie hit volumes. Bullets stop at
 * walls (the wall test bounds the zombie search), pierce passes through a
 * zombie at 70 %.
 */
function castRay(g, ox, oy, oz, dx, dy, dz, def, boost) {
  const world = g.world;
  let pierce = def.pierce || 0;
  let dmgK = 1;
  const skip = [];
  const wall = world.raycast(ox, oy, oz, dx, dy, dz, def.range, tmpHit);
  const tWall = wall ? wall.t : def.range;
  const res = { hitZombie: false, x: ox + dx * tWall, y: oy + dy * tWall, z: oz + dz * tWall };
  let from = 0;
  for (;;) {
    let best = tWall;
    let bz = null;
    let bzone = 1;
    let bmult = 1;
    for (const z of g.zombies) {
      if (!isLiving(z) || skip.includes(z)) continue;
      // Cheap reject: distance from the ray to the body's middle.
      const cx = z.x - ox;
      const cy = 1.0 * z.scale + (z.y || 0) + z.pose.rootY - oy;
      const cz = z.z - oz;
      const along = cx * dx + cy * dy + cz * dz;
      if (along < from - 2 || along > best + 3) continue;
      const px = cx - dx * along;
      const py = cy - dy * along;
      const pz = cz - dz * along;
      const lim = 1.6 * z.scale + 0.5;
      if (px * px + py * py + pz * pz > lim * lim) continue;
      for (let k = 0; k < z.hitCount; k++) {
        const h = z.hit[k];
        const t = raySphere(ox, oy, oz, dx, dy, dz, h[0], h[1], h[2], h[3]);
        if (t < 0 || t < from || t >= best) continue;
        // Prefer the head when the ray enters head and body at nearly the same depth.
        best = t;
        bz = z;
        bzone = h[4];
        bmult = h[5];
      }
    }
    if (!bz) break;
    const t = best;
    const hx = ox + dx * t;
    const hy = oy + dy * t;
    const hz = oz + dz * t;
    // Falloff.
    const [f0, f1, fmin] = def.falloff;
    const fall = t <= f0 ? 1 : t >= f1 ? fmin : 1 - (1 - fmin) * ((t - f0) / (f1 - f0));
    const side = (bz.x - ox) * -dz + (bz.z - oz) * dx > 0 ? -1 : 1;
    const before = bz.hp;
    const dealt = damageZombie(bz, def.damage * fall * boost * dmgK, bzone, bmult, g, { side, stagger: def.stagger || 1, weapon: def.id });
    const killed = before > 0 && bz.hp <= 0;
    res.hitZombie = true;
    res.x = hx;
    res.y = hy;
    res.z = hz;
    g.emit({ type: "zhit", x: hx, y: hy, z: hz, zone: bzone, kill: killed, dmg: dealt, ztype: bz.type, boss: bz.boss, id: bz.id });
    if (def.splash) {
      g.emit({ type: "blast", x: hx, y: hy, z: hz, r: def.splash.radius });
      splash(g, hx, hy, hz, def.splash, bz, boost);
    }
    if (pierce > 0) {
      pierce--;
      dmgK *= 0.7;
      skip.push(bz);
      from = t + 0.05;
      continue;
    }
    return res;
  }
  if (wall) {
    g.emit({ type: "impact", x: res.x, y: res.y, z: res.z, nx: wall.nx, ny: wall.ny, nz: wall.nz, surface: wall.surface });
    if (def.splash) {
      g.emit({ type: "blast", x: res.x, y: res.y, z: res.z, r: def.splash.radius });
      splash(g, res.x + wall.nx * 0.2, res.y + wall.ny * 0.2, res.z + wall.nz * 0.2, def.splash, null, boost);
    }
  }
  return res;
}

function splash(g, x, y, z, sp, except, boost) {
  for (const zz of g.zombies) {
    if (zz === except || !isLiving(zz)) continue;
    const d = Math.hypot(zz.x - x, zz.z - z);
    if (d > sp.radius + zz.radius) continue;
    if (!g.world.clearShot(x, y, z, zz.x, 1, zz.z)) continue;
    const dealt = damageZombie(zz, sp.damage * boost * (1 - 0.5 * clamp(d / sp.radius, 0, 1)), 1, 1, g, { explosion: true });
    if (dealt > 0) g.emit({ type: "zhit", x: zz.x, y: 1.2, z: zz.z, zone: 1, kill: zz.hp <= 0, dmg: dealt, ztype: zz.type, boss: zz.boss, splash: true, id: zz.id });
  }
}

/* ------------------------------------------------------------ waves */

function waveMods(g) {
  const m = g.mods;
  const w = g.wave || {};
  return { hp: (m.hp || 1) * (w.hp || 1), speed: (m.speed || 1) * (w.speed || 1), damage: m.damage || 1, attackRate: (m.attackRate || 1) * (w.attackRate || 1) };
}

function buildQueue(g, wave) {
  const list = [];
  for (const [type, n] of wave.groups) for (let i = 0; i < n; i++) list.push(type);
  // Shuffle, but open each wave with the basic types so the specials arrive mid-wave.
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(g.rng.next() * (i + 1));
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  const basic = list.filter((t) => t === "walker" || t === "runner");
  const special = list.filter((t) => t !== "walker" && t !== "runner");
  const lead = basic.splice(0, Math.min(basic.length, 3));
  const rest = [...basic, ...special];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(g.rng.next() * (i + 1));
    const t = rest[i];
    rest[i] = rest[j];
    rest[j] = t;
  }
  return [...lead, ...rest];
}

function startWave(g, i) {
  const waves = g.stage.waves;
  g.waveIdx = i;
  g.wave = waves[i];
  g.waveTime = 0;
  g.queue = buildQueue(g, g.wave);
  g.burst = Math.min(g.queue.length, g.wave.burst ?? 3);
  g.spawnT = 0.9;
  g.state = STATE.PLAYING;
  g.bossPending = g.wave.boss ? 2.2 : -1;
  g.emit({ type: "wave_start", n: i + 1, total: waves.length, final: i === waves.length - 1, boss: g.wave.boss ? enemyDef(g.wave.boss).name : null });
}

function livingCount(g) {
  let n = 0;
  for (const z of g.zombies) if (isLiving(z)) n++;
  return n;
}

export function remaining(g) {
  return g.queue.length + livingCount(g) + (g.bossPending > 0 ? 1 : 0);
}

function pickSpawn(g, ids, cls, quick = false) {
  const p = g.player;
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  let best = null;
  let bs = -Infinity;
  for (const id of ids) {
    const s = g.arena.spawns[id];
    if (!s || !g.spawnOk[id] || !g.spawnOk[id][cls]) continue;
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz);
    let score = Math.min(d, 30) * 0.3 + g.rng.next() * 4;
    if (d < 9) score -= 100 - d;
    const cosA = (dx * fx + dz * fz) / (d || 1);
    if (cosA > 0.9 && d < 26) score -= 25; // right in the crosshair
    const used = g.spawnUsed[id];
    if (used != null && g.time - used < (quick ? 0.4 : 1.2)) score -= 18;
    if (score > bs) {
      bs = score;
      best = { id, x: s.x, z: s.z };
    }
  }
  if (!best) return null;
  g.spawnUsed[best.id] = g.time;
  // Small jitter so groups don't stack, kept out of geometry.
  const pt = { x: best.x + (g.rng.next() - 0.5) * 1.4, z: best.z + (g.rng.next() - 0.5) * 1.4 };
  g.world.resolveCircle(pt, 0.5);
  if (g.world.isBlocked(cls, pt.x, pt.z)) {
    pt.x = best.x;
    pt.z = best.z;
  }
  return { id: best.id, x: pt.x, z: pt.z };
}

function director(g, dt) {
  const p = g.player;
  if (g.state === STATE.GAME_OVER) return;
  if (g.state === STATE.STAGE_COMPLETE) {
    g.stateT += dt;
    return;
  }
  if (g.state === STATE.PREPARING) {
    g.stateT -= dt;
    if (g.stateT <= 0) startWave(g, 0);
    return;
  }
  if (g.clearT > 0) {
    g.clearT -= dt;
    if (g.clearT <= 0) {
      g.state = STATE.STAGE_COMPLETE;
      g.stateT = 0;
      const p2 = g.player;
      const acc = g.stats.shots ? g.stats.hits / g.stats.shots : 0;
      g.score += 1000 + Math.round(p2.hp) * 10 + Math.round(acc * 1000);
      g.emit({ type: "stage_complete" });
    }
    return;
  }
  if (g.state === STATE.BETWEEN_WAVES) {
    g.stateT -= dt;
    if (g.stateT <= 0) startWave(g, g.waveIdx + 1);
    return;
  }
  // PLAYING
  const wave = g.wave;
  g.waveTime += dt;
  const living = livingCount(g);
  const cap = Math.min(g.capBase, wave.cap || g.capBase);

  if (g.bossPending > 0) {
    g.bossPending -= dt;
    if (g.bossPending <= 0) {
      g.bossPending = -1;
      const z = g.zombies.find((q) => !q.active);
      if (z) {
        const bp = g.stage.bossSpawn || g.arena.bossSpawn;
        spawnZombie(z, wave.boss, bp.x, bp.z, g, { hp: (g.mods.bossHp || 1), speed: 1, damage: g.mods.damage || 1 });
        g.boss = z;
        g.emit({ type: "boss_spawn", boss: wave.boss, name: z.def.name, title: z.def.title, x: bp.x, z: bp.z });
        g.emit({ type: "roar", x: bp.x, z: bp.z, boss: wave.boss });
      }
    }
  }

  g.spawnT -= dt;
  if (g.queue.length && g.spawnT <= 0 && living < cap) {
    const type = g.queue[0];
    const def = enemyDef(type);
    const sp = pickSpawn(g, wave.spawns || Object.keys(g.arena.spawns), navClass(def));
    const slot = g.zombies.find((q) => !q.active);
    if (sp && slot) {
      g.queue.shift();
      spawnZombie(slot, type, sp.x, sp.z, g, waveMods(g));
      g.emit({ type: "spawn", x: sp.x, z: sp.z, ztype: type });
      if (g.burst > 0) {
        g.burst--;
        g.spawnT = 0.45;
      } else g.spawnT = (wave.interval || 2) * (0.7 + g.rng.next() * 0.6);
    } else g.spawnT = 0.5;
  }

  // Safety: relocate zombies that can't make progress; enrage stragglers.
  g.relocateCheck -= dt;
  if (g.relocateCheck <= 0) {
    g.relocateCheck = 1;
    for (const z of g.zombies) {
      if (!isLiving(z) || z.boss) continue;
      if (z.stuck >= 12 || z.x !== z.x || z.z !== z.z) {
        const sp = pickSpawn(g, Object.keys(g.arena.spawns), z.cls);
        if (sp) {
          z.x = sp.x;
          z.z = sp.z;
          z.stuck = 0;
          z.progD = Infinity;
          z.state = Z.SPAWNING;
          z.anim.spawn = 0;
          z.anim.atk = -1;
          g.emit({ type: "spawn", x: sp.x, z: sp.z, ztype: z.type, relocated: true });
        }
      }
    }
    if (g.waveTime > 120 && g.queue.length === 0 && living <= 3) {
      for (const z of g.zombies) if (isLiving(z) && !z.enraged) z.enraged = true;
    }
  }

  // Wave complete?
  if (g.queue.length === 0 && living === 0 && g.bossPending < 0 && (!wave.boss || g.bossDefeated || g.boss)) {
    g.stats.waves++;
    const bonus = 250 * (g.waveIdx + 1);
    g.score += bonus;
    const last = g.waveIdx >= g.stage.waves.length - 1;
    g.emit({ type: "wave_clear", n: g.waveIdx + 1, bonus, final: last });
    if (last) {
      g.clearT = CLEAR_DELAY;
      for (const pr of g.projectiles) pr.active = false;
      for (const h of g.hazards) h.active = false;
      g.emit({ type: "stage_clear" });
    } else {
      g.state = STATE.BETWEEN_WAVES;
      g.stateT = g.stage.breakTime || BREAK_TIME;
      for (const pk of g.stage.pickups || []) {
        if (pk.when !== "break" && pk.when !== "both") continue;
        if (pk.from && g.waveIdx + 1 < pk.from) continue;
        if (g.pickups.some((q) => q.active && q.point === pk.at)) continue;
        const pt = g.arena.pickups[pk.at];
        if (pt) addPickup(g, pk.type, pt.x, pt.z, "stage", pk.at);
      }
    }
  }
  void p;
}

/* ------------------------------------------------------------ projectiles + hazards */

function updateProjectiles(g, dt) {
  const p = g.player;
  for (const pr of g.projectiles) {
    if (!pr.active) continue;
    pr.life -= dt;
    if (pr.life <= 0) {
      pr.active = false;
      continue;
    }
    const ox = pr.x;
    const oy = pr.y;
    const oz = pr.z;
    pr.vy -= pr.g * dt;
    const nx = ox + pr.vx * dt;
    const ny = oy + pr.vy * dt;
    const nz = oz + pr.vz * dt;
    const sdx = nx - ox;
    const sdy = ny - oy;
    const sdz = nz - oz;
    const len = Math.hypot(sdx, sdy, sdz) || 1e-6;
    // Player (chest sphere).
    if (p.alive && pr.kind === "spit") {
      const cx = p.x;
      const cy = p.y + 1.1;
      const cz = p.z;
      const t = clamp(((cx - ox) * sdx + (cy - oy) * sdy + (cz - oz) * sdz) / (len * len), 0, 1);
      const qx = ox + sdx * t - cx;
      const qy = oy + sdy * t - cy;
      const qz = oz + sdz * t - cz;
      if (qx * qx + qy * qy + qz * qz < (0.5 + pr.r) ** 2) {
        g.damagePlayer(pr.dmg, ox, oz, "spit");
        g.emit({ type: "splat", x: ox + sdx * t, y: oy + sdy * t, z: oz + sdz * t, onPlayer: true, kind: pr.kind });
        pr.active = false;
        continue;
      }
    }
    const hit = g.world.raycast(ox, oy, oz, sdx / len, sdy / len, sdz / len, len, tmpHit);
    if (hit || ny <= 0) {
      const t = hit ? hit.t / len : clamp(oy / Math.max(1e-6, oy - ny), 0, 1);
      const hx = ox + sdx * t;
      const hy = Math.max(0.02, oy + sdy * t);
      const hz = oz + sdz * t;
      pr.active = false;
      g.emit({ type: "splat", x: hx, y: hy, z: hz, kind: pr.kind });
      const d = Math.hypot(p.x - hx, p.z - hz);
      if (pr.kind === "glob") {
        if (d < pr.splash + p.radius && p.y < 1.2) g.damagePlayer(pr.dmg, hx, hz, "toxic");
        g.addHazard("puddle", hx, hz, 1.9, { dur: 3.5, dps: 8 });
      } else if (d < pr.splash && p.y < 1.4 && g.world.clearShot(hx, hy + 0.2, hz, p.x, p.y + 1, p.z)) {
        g.damagePlayer(pr.dmg * 0.5, hx, hz, "spit");
      }
      continue;
    }
    pr.x = nx;
    pr.y = ny;
    pr.z = nz;
  }
}

function updateHazards(g, dt) {
  const p = g.player;
  for (const h of g.hazards) {
    if (!h.active) continue;
    h.t += dt;
    if (h.follow) {
      const f = h.follow;
      if (!isLiving(f) || f.state !== Z.ATTACKING) {
        h.active = false;
        continue;
      }
      h.yaw = f.yaw;
      h.x = f.x + Math.sin(f.yaw) * h.ahead;
      h.z = f.z + Math.cos(f.yaw) * h.ahead;
    }
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    switch (h.kind) {
      case "warn":
      case "line":
        if (h.t >= h.dur) h.active = false;
        break;
      case "burst":
        if (h.t >= h.dur) {
          h.active = false;
          if (d <= h.r + p.radius && p.y < 1.0) g.damagePlayer(h.dmg, h.x, h.z, "toxic");
          g.emit({ type: "burst", x: h.x, z: h.z, r: h.r });
        }
        break;
      case "puddle":
        if (h.t >= h.dur) {
          h.active = false;
          break;
        }
        h.tick -= dt;
        if (d <= h.r && p.y < 0.3 && h.tick <= 0) {
          h.tick = 0.5;
          g.damagePlayer(h.dps * 0.5, h.x, h.z, "toxic");
        }
        break;
      case "shock": {
        h.r += h.speed * dt;
        if (!h.done && p.y < 0.35 && Math.abs(d - h.r) < 0.55) {
          h.done = true;
          g.damagePlayer(h.dmg, h.x, h.z, "shock");
        }
        if (h.r >= h.maxR) h.active = false;
        break;
      }
      default:
        if (h.t >= h.dur) h.active = false;
    }
  }
}

/* ------------------------------------------------------------ pickups */

function addPickup(g, type, x, z, src, point = null) {
  const pt = { x, z };
  g.world.resolveCircle(pt, 0.4);
  const pk = { id: g.nextPickupId++, type, x: pt.x, z: pt.z, active: true, src, point, life: src === "drop" ? 22 : Infinity, t: 0 };
  g.pickups.push(pk);
  // Keep the list short.
  if (g.pickups.length > 40) g.pickups = g.pickups.filter((q) => q.active);
  return pk;
}

function useful(g, type) {
  const p = g.player;
  switch (type) {
    case "health":
      return p.hp < p.maxHp - 0.5;
    case "ammo":
      return !ammoFull(g.arsenal);
    case "armor":
      return p.armor < p.maxArmor - 0.5;
    case "boost":
      return true;
    default:
      return false;
  }
}

function collect(g, pk) {
  const p = g.player;
  pk.active = false;
  g.stats.pickups++;
  switch (pk.type) {
    case "health":
      p.hp = Math.min(p.maxHp, p.hp + 40);
      break;
    case "ammo":
      addAmmo(g.arsenal, pk.src === "drop" ? 0.18 : 0.4);
      break;
    case "armor":
      p.armor = Math.min(p.maxArmor, p.armor + 50);
      break;
    case "boost":
      p.boostT = 15;
      break;
    default:
      break;
  }
  g.emit({ type: "pickup", kind: pk.type, label: PICKUP_INFO[pk.type]?.label || pk.type });
}

function updatePickups(g, dt, input, first) {
  const p = g.player;
  g.prompt = null;
  const interact = first && input.take("interact");
  let nearest = null;
  let nd = 2.3;
  for (const pk of g.pickups) {
    if (!pk.active) continue;
    pk.t += dt;
    if (pk.life !== Infinity) {
      pk.life -= dt;
      if (pk.life <= 0) {
        pk.active = false;
        continue;
      }
    }
    if (!p.alive) continue;
    const d = Math.hypot(p.x - pk.x, p.z - pk.z);
    // Walking over a pickup collects it — but only if it would help.
    if (d < 1.05 && p.y < 1.2 && useful(g, pk.type)) {
      collect(g, pk);
      continue;
    }
    if (d < nd) {
      nd = d;
      nearest = pk;
    }
  }
  if (nearest) {
    const ok = useful(g, nearest.type);
    g.prompt = { type: nearest.type, label: PICKUP_INFO[nearest.type]?.label || nearest.type, full: !ok };
    if (interact) {
      if (ok) collect(g, nearest);
      else g.emit({ type: "pickup_full", kind: nearest.type });
    }
  }
  // Supply drop when the player is nearly out of ammo (never a soft lock).
  g.supplyCd -= dt;
  g.supplyCheck -= dt;
  if (g.supplyCheck <= 0 && p.alive) {
    g.supplyCheck = 1;
    if (g.supplyCd <= 0 && totalAmmoFraction(g.arsenal) < 0.14 && !g.pickups.some((q) => q.active && q.type === "ammo")) {
      let best = null;
      let bd = Infinity;
      for (const pt of Object.values(g.arena.pickups)) {
        const d = Math.hypot(pt.x - p.x, pt.z - p.z);
        if (d > 3.5 && d < bd) {
          bd = d;
          best = pt;
        }
      }
      if (best) {
        addPickup(g, "ammo", best.x, best.z, "supply");
        g.supplyCd = 20;
        g.emit({ type: "supply", x: best.x, z: best.z });
      }
    }
  }
}

/* ------------------------------------------------------------ HUD + result */

function hudSnapshot(g) {
  const p = g.player;
  const a = g.arsenal;
  const s = a.slot;
  const boss = g.boss && g.boss.active && g.boss.state !== Z.DEAD && g.boss.state !== Z.DYING ? g.boss : null;
  return {
    state: g.state,
    stateT: g.stateT,
    clearing: g.clearT > 0,
    hp: p.hp,
    maxHp: p.maxHp,
    armor: p.armor,
    stamina: p.stamina,
    exhausted: p.exhausted,
    boostT: p.boostT,
    weapon: a.def.id,
    weaponName: a.def.name,
    weaponKind: a.def.kind,
    mag: s.mag,
    magSize: a.def.mag,
    reserve: s.reserve,
    reloading: a.state === "reload" ? 1 - a.t / Math.max(0.01, a.dur) : -1,
    switching: a.state === "lower" || a.state === "raise",
    slots: a.slots.map((q, i) => ({ id: q.def.id, name: q.def.name, mag: q.mag, reserve: q.reserve, active: i === a.cur })),
    wave: g.waveIdx + 1,
    waves: g.stage.waves.length,
    remaining: remaining(g),
    score: g.score,
    combo: g.combo,
    comboT: g.comboT,
    boss: boss ? { name: boss.def.name, title: boss.def.title, hp: boss.hp, maxHp: boss.maxHp, phase: boss.bs?.phase || 1 } : null,
    prompt: g.prompt,
    ads: p.ads,
    spread: currentSpread(g),
    lowHp: p.hp > 0 && p.hp < 30,
    alive: p.alive,
    yaw: p.yaw,
    px: p.x,
    pz: p.z,
  };
}

export function starsFor(stage, cleared, hp, acc) {
  if (!cleared) return 0;
  const s = stage.stars || { hp: 50, acc: 0.4 };
  let n = 1;
  if (hp >= s.hp) {
    n = 2;
    if (acc >= s.acc) n = 3;
  }
  return n;
}

function result(g) {
  const p = g.player;
  const st = g.stats;
  const acc = st.shots ? st.hits / st.shots : 0;
  const cleared = g.state === STATE.STAGE_COMPLETE;
  return {
    stageId: g.stage.id,
    cleared,
    waves: st.waves,
    totalWaves: g.stage.waves.length,
    kills: st.kills,
    byType: { ...st.byType },
    headshots: st.headshots,
    shots: st.shots,
    hits: st.hits,
    accuracy: acc,
    score: g.score,
    hp: Math.round(p.hp),
    stars: starsFor(g.stage, cleared, p.hp, acc),
    time: g.time,
    bossKills: st.bossKills,
    damageTaken: Math.round(st.damageTaken),
  };
}

export { wrapAngle };
