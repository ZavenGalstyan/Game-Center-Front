/**
 * Zombie Outbreak — zombie entities: creation, the finite-state machine,
 * navigation-following movement, attacks and damage.
 *
 *   SPAWNING → IDLE → CHASING ⇄ ATTACKING
 *                       ↕          ↓
 *                    STUNNED     DYING → DEAD (slot freed)
 *
 * Every zombie always knows where the player is (it's a survival arena);
 * it follows the shared flow field (engine/nav.js), re-planning its waypoint
 * a few times a second, staggered across zombies. Damage lands at a fixed
 * point in the swing, once per swing, and only if the player is still in
 * reach and in front — backing off during the wind-up dodges it.
 */
import { enemyDef } from "../data/enemies.js";
import { newPose, computePose, allocHit, hitVolumes } from "./pose.js";
import { clamp, approachAngle, approach, wrapAngle, yawTo } from "./math.js";
import { bossThink, bossAct, bossHitStun } from "./bosses.js";

export const Z = {
  SPAWNING: "SPAWNING",
  IDLE: "IDLE",
  CHASING: "CHASING",
  ATTACKING: "ATTACKING",
  STUNNED: "STUNNED",
  DYING: "DYING",
  DEAD: "DEAD",
};

const SPAWN_TIME = 1.0;
const SKINS = ["#7d8a6a", "#8a8f74", "#6f7d63", "#94907a", "#7a8577", "#8c826c"];
const SHIRTS = ["#8a5a4a", "#4f6a8a", "#7a7a5a", "#a08a6a", "#6a4a48", "#8a929e", "#b0a080", "#5a7a5a", "#a04a3a", "#cfc6b0", "#3a5a7a", "#9a8a3a"];
const PANTS = ["#4a4744", "#3a4a62", "#5a5040", "#6a5a4a", "#33373e", "#6a5a4a", "#2e3e5a"];

/** Nav size class for an enemy definition (see NAV_RADII in world.js). */
export function navClass(def) {
  return def.navClass ?? (def.boss ? 2 : def.big ? 1 : 0);
}

export function createZombiePool(n) {
  return Array.from({ length: n }, (_, i) => ({ slot: i, active: false, state: Z.DEAD, gen: 0 }));
}

/** Initialises pool slot `z` as a fresh zombie of `type` at (x, z). */
export function spawnZombie(z, type, x, zz, g, mods = {}) {
  const def = enemyDef(type);
  const rng = g.rng;
  z.active = true;
  z.gen++;
  z.id = g.nextId++;
  z.type = type;
  z.def = def;
  z.boss = !!def.boss;
  z.cls = navClass(def);
  z.rig = def.rig;
  z.scale = rng.range(def.scale[0], def.scale[1]);
  z.radius = def.radius;
  z.maxHp = Math.round(def.hp * (mods.hp || 1));
  z.hp = z.maxHp;
  z.speedMul = (mods.speed || 1) * (z.boss ? 1 : rng.range(0.92, 1.08));
  z.dmgMul = mods.damage || 1;
  z.atkRate = mods.attackRate || 1;
  z.x = x;
  z.z = zz;
  z.y = 0;
  z.vy = 0;
  z.spd = 0;
  z.yaw = yawTo(x, zz, g.player.x, g.player.z);
  z.state = Z.SPAWNING;
  z.stateT = 0;
  z.atkCd = rng.range(0.2, 0.8);
  z.rangedCd = rng.range(1.0, 2.5);
  z.atkKind = "swipe";
  z.atkWindup = def.attack.windup;
  z.atkHitAt = def.attack.hit;
  z.atkEnd = def.attack.hit + def.attack.recover;
  z.atkDone = false;
  z.wp = { x: g.player.x, z: g.player.z };
  z.wpT = (z.id % 7) * 0.04;
  z.direct = false;
  z.losT = (z.id % 5) * 0.05;
  z.los = false;
  z.progT = 0;
  z.progD = Infinity;
  z.stuck = 0;
  z.sidestep = 0;
  z.sideDir = 1;
  z.enraged = false;
  z.lastHitBy = 0;
  z.growlT = rng.range(1.5, 6);
  z.bs = z.boss ? { phase: 1, next: 1.5, count: 0, lastKind: "", data: {} } : null;
  z.anim = {
    time: rng.range(0, 10),
    phase: rng.range(0, 6.28),
    move: 0,
    run: 0,
    atk: -1,
    atkKind: "swipe",
    air: 0,
    arm: 0,
    charge: 0,
    stun: 0,
    hit: 0,
    hitSide: 1,
    hitPow: 0,
    death: -1,
    spawn: 0,
  };
  z.variant = {
    armsUp: type === "walker" ? rng.chance(0.45) : type === "brute" ? rng.chance(0.3) : false,
    limp: type === "walker" ? rng.chance(0.3) : false,
    deadArm: type === "walker" ? rng.chance(0.15) : false,
    headTilt: rng.range(-0.28, 0.28),
    fallFwd: rng.chance(0.5),
    seed: rng.range(0, 10),
    skin: rng.pick(SKINS),
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    hair: rng.int(0, 3),
    torn: rng.int(0, 2),
  };
  z.pose = z.pose || newPose();
  z.hit = allocHit(def);
  z.hitCount = 0;
  computePose(z);
  hitVolumes(z);
  return z;
}

export function aliveCount(zs) {
  let n = 0;
  for (const z of zs) if (z.active && z.state !== Z.DYING && z.state !== Z.DEAD) n++;
  return n;
}

export function isLiving(z) {
  return z.active && z.state !== Z.DYING && z.state !== Z.DEAD;
}

/* ------------------------------------------------------------------ update */

const tmpWp = { x: 0, z: 0 };

export function updateZombie(z, dt, g) {
  const A = z.anim;
  const p = g.player;
  A.time += dt;
  if (A.hit > 0) A.hit = Math.max(0, A.hit - dt);
  z.atkCd -= dt * z.atkRate;
  z.rangedCd -= dt;
  const def = z.def;
  const dx = p.x - z.x;
  const dz = p.z - z.z;
  const dist = Math.hypot(dx, dz);
  z.dist = dist;
  let wantSpeed = 0;
  let faceYaw = null;

  switch (z.state) {
    case Z.SPAWNING: {
      A.spawn = Math.min(1, A.spawn + dt / (z.boss ? 1.6 : SPAWN_TIME));
      z.yaw = approachAngle(z.yaw, yawTo(z.x, z.z, p.x, p.z), dt * 1.5);
      if (A.spawn >= 1) {
        z.state = Z.IDLE;
        z.stateT = z.boss ? 0.2 : g.rng.range(0.15, 0.6);
        g.emit({ type: "zgrowl", x: z.x, z: z.z, ztype: z.type, loud: z.boss });
      }
      break;
    }
    case Z.IDLE: {
      z.stateT -= dt;
      faceYaw = yawTo(z.x, z.z, p.x, p.z);
      if (z.stateT <= 0) z.state = Z.CHASING;
      break;
    }
    case Z.STUNNED: {
      z.stateT -= dt;
      A.stun = z.boss ? Math.max(0, Math.min(1, z.stateT * 2)) : 0;
      if (z.stateT <= 0) {
        z.state = Z.CHASING;
        A.stun = 0;
      }
      break;
    }
    case Z.CHASING: {
      if (!p.alive || g.frozen) break;
      if (z.boss) {
        const r = bossThink(z, dt, g, dist);
        if (r === "attack") break;
        wantSpeed = r && r.speed != null ? r.speed : def.speed * z.speedMul;
        if (r && r.away) {
          // Retreat / reposition targets set by the boss controller.
          steerTo(z, dt, g, r.tx, r.tz, wantSpeed, true);
          return finish(z, dt, g);
        }
      } else {
        wantSpeed = (def.run || def.speed) * z.speedMul * (z.enraged ? 1.4 : 1);
      }
      // Ranged (spitter) behaviour.
      if (def.ranged && dist > def.attack.range + 0.4) {
        updateLos(z, dt, g);
        const R = def.ranged;
        if (z.los && dist >= R.min * 0.75 && dist <= R.max) {
          faceYaw = yawTo(z.x, z.z, p.x, p.z);
          if (z.rangedCd <= 0 && Math.abs(wrapAngle(faceYaw - z.yaw)) < 0.5) {
            startAttack(z, "spit", R.windup, R.windup, R.windup + 0.45);
            break;
          }
          if (dist < R.min) {
            // Back away, keeping the bead on the player.
            const ax = z.x - dx / dist;
            const az = z.z - dz / dist;
            moveRaw(z, dt, g, ax - z.x, az - z.z, def.speed * 0.8 * z.speedMul);
            z.yaw = approachAngle(z.yaw, faceYaw, dt * 4);
            return finish(z, dt, g);
          }
          // Shuffle sideways while holding range.
          z.sideT = (z.sideT || 0) - dt;
          if (z.sideT <= 0) {
            z.sideT = g.rng.range(1.2, 2.4);
            z.sideDir = g.rng.chance(0.5) ? 1 : -1;
          }
          const sx = (-dz / dist) * z.sideDir;
          const sz = (dx / dist) * z.sideDir;
          moveRaw(z, dt, g, sx, sz, def.speed * 0.45 * z.speedMul);
          z.yaw = approachAngle(z.yaw, faceYaw, dt * 4);
          return finish(z, dt, g);
        }
      }
      // Melee / bomber trigger.
      const reach = def.attack.range;
      if (!z.boss && dist <= reach && z.atkCd <= 0) {
        const face = yawTo(z.x, z.z, p.x, p.z);
        if (Math.abs(wrapAngle(face - z.yaw)) < 0.9) {
          if (def.explode) startAttack(z, "arm", def.attack.windup, def.attack.windup, def.attack.windup);
          else startAttack(z, z.type === "brute" ? "slam" : "swipe", def.attack.windup, def.attack.hit, def.attack.hit + def.attack.recover);
          break;
        }
      }
      if (dist < reach * 0.8) wantSpeed = 0;
      if (dist < 0.05) break;
      chase(z, dt, g, wantSpeed, dist);
      return finish(z, dt, g);
    }
    case Z.ATTACKING: {
      if (z.boss) {
        bossAct(z, dt, g, dist);
        break;
      }
      A.atk += dt;
      const k = A.atk;
      // Track the player during the wind-up, but slowly — side-stepping works.
      if (k < z.atkHitAt) z.yaw = approachAngle(z.yaw, yawTo(z.x, z.z, p.x, p.z), dt * (z.type === "runner" ? 3 : 1.6));
      if (z.atkKind === "arm") {
        A.arm = clamp(k / z.atkWindup, 0, 1);
        // Keep shuffling at the player while fizzing.
        moveRaw(z, dt, g, dx, dz, def.speed * 0.35 * z.speedMul);
        if (k >= z.atkHitAt && !z.atkDone) {
          z.atkDone = true;
          bomberBurst(z, g, 1);
          return;
        }
        break;
      }
      if (!z.atkDone && k >= z.atkHitAt) {
        z.atkDone = true;
        if (z.atkKind === "spit") {
          launchSpit(z, g);
          z.rangedCd = def.ranged.cooldown * g.rng.range(0.85, 1.2);
        } else if (p.alive && !g.frozen) {
          const face = yawTo(z.x, z.z, p.x, p.z);
          const inArc = Math.abs(wrapAngle(face - z.yaw)) < 1.2;
          if (dist <= def.attack.range + 0.35 + (z.type === "brute" ? 0.3 : 0) && inArc) {
            g.damagePlayer(def.attack.damage * z.dmgMul, z.x, z.z, z.type);
            g.emit({ type: "zstrike", x: z.x, z: z.z, ztype: z.type });
          } else g.emit({ type: "zwhiff", x: z.x, z: z.z, ztype: z.type });
        }
      }
      if (k >= z.atkEnd) {
        z.state = Z.CHASING;
        A.atk = -1;
        z.atkCd = def.attack.cooldown * g.rng.range(0.85, 1.15);
      }
      break;
    }
    case Z.DYING: {
      A.death += dt;
      if (A.death > 3.4) {
        z.state = Z.DEAD;
        z.active = false;
      }
      break;
    }
    default:
      break;
  }
  if (faceYaw != null) z.yaw = approachAngle(z.yaw, faceYaw, dt * 3.5);
  // Not moving this frame: settle locomotion.
  z.spd = approach(z.spd, 0, dt * 8);
  A.move = approach(A.move, 0, dt * 4);
  A.run = approach(A.run, 0, dt * 4);
  return finish(z, dt, g);
}

function finish(z, dt, g) {
  if (z.state !== Z.DYING && z.state !== Z.DEAD && !z.boss) {
    z.growlT -= dt;
    if (z.growlT <= 0) {
      z.growlT = g.rng.range(3, 8);
      if (z.dist < 26) g.emit({ type: "zgrowl", x: z.x, z: z.z, ztype: z.type });
    }
  }
  computePose(z);
  if (z.active) hitVolumes(z);
}

export function startAttack(z, kind, windup, hitAt, end) {
  z.state = Z.ATTACKING;
  z.atkKind = kind;
  z.atkWindup = windup;
  z.atkHitAt = hitAt;
  z.atkEnd = end;
  z.atkDone = false;
  z.anim.atk = 0;
  z.anim.atkKind = kind;
}

function updateLos(z, dt, g) {
  z.losT -= dt;
  if (z.losT > 0) return;
  z.losT = 0.25;
  const p = g.player;
  z.los = g.world.clearShot(z.x, 1.5 * z.scale, z.z, p.x, p.y + 1.3, p.z);
}

/** Follow the flow field toward the player. */
function chase(z, dt, g, speed, dist) {
  const p = g.player;
  z.wpT -= dt;
  if (z.wpT <= 0) {
    z.wpT = 0.22 + (z.id % 4) * 0.02;
    z.direct = dist < 28 && g.world.gridClear(z.cls, z.x, z.z, p.x, p.z);
    if (!z.direct) {
      if (g.nav.waypoint(z.cls, z.x, z.z, tmpWp)) {
        z.wp.x = tmpWp.x;
        z.wp.z = tmpWp.z;
      } else {
        z.wp.x = p.x;
        z.wp.z = p.z;
      }
    }
    // Progress watchdog: if the nav distance hasn't dropped for a while, sidestep;
    // if it stays stuck, the director relocates the zombie (never an infinite wait).
    z.progT += 0.25;
    if (z.progT >= 2) {
      z.progT = 0;
      const nd = g.nav.progressAt(z.cls, z.x, z.z);
      if (nd < z.progD - 6 || dist < z.def.attack.range + 0.5) {
        z.stuck = Math.max(0, z.stuck - 2);
        z.progD = nd;
      } else {
        z.stuck += 2;
        z.progD = Math.min(z.progD, nd);
        if (z.stuck >= 4) {
          z.sidestep = 0.9;
          z.sideDir = g.rng.chance(0.5) ? 1 : -1;
        }
      }
    }
  }
  let tx = z.direct ? p.x : z.wp.x;
  let tz = z.direct ? p.z : z.wp.z;
  if (z.sidestep > 0) {
    z.sidestep -= dt;
    const ddx = tx - z.x;
    const ddz = tz - z.z;
    const l = Math.hypot(ddx, ddz) || 1;
    tx = z.x + (-ddz / l) * z.sideDir * 2;
    tz = z.z + (ddx / l) * z.sideDir * 2;
  }
  steerTo(z, dt, g, tx, tz, speed, false);
}

/** Turn toward (tx, tz) at the type's turn rate, walk forward (no sideways sliding). */
export function steerTo(z, dt, g, tx, tz, speed, run) {
  const want = yawTo(z.x, z.z, tx, tz);
  const turn = z.boss ? 3.2 : z.type === "runner" ? 7 : z.type === "brute" ? 2.6 : 3.8;
  z.yaw = approachAngle(z.yaw, want, dt * turn);
  const err = Math.abs(wrapAngle(want - z.yaw));
  const fwd = Math.max(0, Math.cos(err));
  z.spd = approach(z.spd, speed * fwd * fwd, dt * (z.type === "runner" || run ? 14 : 6));
  advance(z, dt, g, Math.sin(z.yaw), Math.cos(z.yaw), z.spd);
}

/** Move along an arbitrary direction (used for backing off / strafing) without turning. */
function moveRaw(z, dt, g, dx, dz, speed) {
  const l = Math.hypot(dx, dz);
  if (l < 1e-5) return;
  z.spd = approach(z.spd, speed, dt * 6);
  advance(z, dt, g, dx / l, dz / l, z.spd);
}

function advance(z, dt, g, ux, uz, spd) {
  z.x += ux * spd * dt;
  z.z += uz * spd * dt;
  g.world.resolveCircle(z, z.radius);
  const A = z.anim;
  const stride = (z.def.gait === "run" ? 1.9 : 1.35) * z.scale;
  A.phase += ((spd * dt) / stride) * Math.PI * 2;
  const walkRef = z.def.gait === "run" ? 2.2 : Math.max(0.8, z.def.speed);
  A.move = approach(A.move, clamp(spd / walkRef, 0, 1), dt * 6);
  A.run = approach(A.run, z.def.gait === "run" ? clamp((spd - 1.5) / 2.5, 0, 1) : 0, dt * 5);
}

/** Pairwise separation between zombies, and zombies vs the player. */
export function separate(zs, g) {
  const p = g.player;
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i];
    if (!a.active || a.state === Z.DYING || a.state === Z.DEAD) continue;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j];
      if (!b.active || b.state === Z.DYING || b.state === Z.DEAD) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const r = (a.radius + b.radius) * 0.92;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (r - d) * 0.5;
      const ux = dx / d;
      const uz = dz / d;
      // Heavier bodies move less.
      const wa = b.boss ? 0.9 : a.boss ? 0.1 : 0.5;
      a.x -= ux * push * 2 * wa;
      a.z -= uz * push * 2 * wa;
      b.x += ux * push * 2 * (1 - wa);
      b.z += uz * push * 2 * (1 - wa);
    }
    // Body vs player: the zombie gives way; the player is nudged a little.
    if (p.alive) {
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      const r = a.radius + p.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-8 && (a.y || 0) < 1.2) {
        const d = Math.sqrt(d2);
        const push = r - d;
        a.x += (dx / d) * push * 0.8;
        a.z += (dz / d) * push * 0.8;
        p.x -= (dx / d) * push * 0.2;
        p.z -= (dz / d) * push * 0.2;
      }
    }
    g.world.resolveCircle(a, a.radius);
  }
}

/* ------------------------------------------------------------------ damage */

/**
 * Applies a hit. zone: 0 head, 1 body, 2 legs, 3 weak point; `mult` is the
 * weak point's multiplier. Returns the damage dealt (after multipliers).
 */
export function damageZombie(z, amount, zone, mult, g, opts = {}) {
  if (!isLiving(z)) return 0;
  const def = z.def;
  let m = 1;
  if (zone === 0) m = def.headMult;
  else if (zone === 3) m = mult;
  else if (zone === 2) m = z.boss ? def.armor || 1 : 0.8;
  else if (z.boss) m = def.armor || 1;
  const dmg = amount * m;
  z.hp -= dmg;
  const A = z.anim;
  A.hitSide = opts.side || (g.rng.chance(0.5) ? 1 : -1);
  A.hitPow = clamp(dmg / (z.maxHp * 0.3) + 0.35, 0.35, 1) * (z.boss ? 0.35 : 1);
  A.hit = Math.max(A.hit, (def.staggerTime || 0.4) * (z.boss ? 0.5 : 0.75));
  if (z.hp <= 0) {
    killZombie(z, g, zone === 0, opts);
    return dmg;
  }
  // Big single hits stagger (interrupting the swing). Bombers don't stop fizzing.
  const staggerAt = def.stagger * z.maxHp / (opts.stagger || 1);
  if (!z.boss && dmg >= staggerAt && z.state !== Z.SPAWNING && !(z.state === Z.ATTACKING && z.atkKind === "arm")) {
    z.state = Z.STUNNED;
    z.stateT = def.staggerTime;
    A.atk = -1;
    z.atkCd = Math.max(z.atkCd, 0.3);
  }
  if (z.boss) bossHitStun(z, dmg, g);
  return dmg;
}

export function killZombie(z, g, headshot, opts = {}) {
  if (!isLiving(z)) return;
  z.hp = 0;
  z.state = Z.DYING;
  const A = z.anim;
  A.death = 0;
  A.atk = -1;
  A.arm = 0;
  A.air = 0;
  A.charge = 0;
  A.stun = 0;
  A.spawn = 1;
  z.y = 0;
  computePose(z);
  g.onKill(z, headshot, opts);
  if (z.def.explode && !opts.noBurst) bomberBurst(z, g, z.def.explode.deathScale, true);
}

/** Bomber detonation (on reaching the player, or when shot). */
function bomberBurst(z, g, scale, alreadyDead = false) {
  const E = z.def.explode;
  if (!alreadyDead) {
    // Self-destruct: it dies in the blast (no kill credit, no points).
    z.hp = 0;
    z.state = Z.DYING;
    z.anim.death = 0.75;
    z.anim.arm = 0;
    z.anim.atk = -1;
    z.burst = true;
    computePose(z);
    g.onKill(z, false, { self: true });
  }
  g.explode(z.x, 1.0, z.z, E.radius, E.damage * scale * z.dmgMul, E.zombieDamage, z);
}

function launchSpit(z, g) {
  const p = g.player;
  const R = z.def.ranged;
  const sx = z.x + Math.sin(z.yaw) * 0.4 * z.scale;
  const sz = z.z + Math.cos(z.yaw) * 0.4 * z.scale;
  const sy = 1.55 * z.scale;
  g.launchProjectile("spit", sx, sy, sz, p.x, p.y + 1.1, p.z, R.speed, R.damage * z.dmgMul, R.splash);
  g.emit({ type: "spit", x: sx, y: sy, z: sz });
}
