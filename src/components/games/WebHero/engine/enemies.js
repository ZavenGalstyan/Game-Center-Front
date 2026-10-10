/**
 * Web Hero — enemies. One state machine for every archetype:
 *
 *   idle → patrol → alert (“!”) → chase → attack (windup → active → recover)
 *   stunned · webbed (trapped) · airborne (launched) · down (knocked down) · defeated
 *
 * Archetypes:
 *   thug      basic melee, two-swing combo
 *   bruiser   slow, lots of health, unblockable ground slam (dodge it), can't be launched
 *   gunner    keeps distance, laser-sight telegraph, fires dodgeable shots
 *   shield    blocks frontal light hits — guard-break moves, web pull or the back
 *   assassin  fast lunges, evades some light attacks
 *   drone     flies, strafes, fires bolts; webs / aerial hits knock it down
 *
 * Attacks are telegraphed (windup + warning ring) and each swing can hurt the
 * hero at most once. At most two enemies attack at the same time (tokens).
 */
import { floorAt, pushOut, lineClear } from "./collide.js";

const fl = {};
const hit = {};

export const KINDS = {
  thug: { hp: 40, speed: 5.2, reach: 1.9, dmg: 9, wind: 0.62, rec: 0.6, cool: 1.1, r: 0.45, hy: 1.0, detect: 18, xp: 20 },
  bruiser: { hp: 150, speed: 3.6, reach: 2.8, dmg: 22, wind: 1.05, rec: 1.0, cool: 1.8, r: 0.75, hy: 1.3, detect: 18, xp: 45, slam: true, heavy: true },
  gunner: { hp: 35, speed: 4.6, reach: 22, dmg: 8, wind: 0.85, rec: 0.5, cool: 1.6, r: 0.45, hy: 1.0, detect: 28, xp: 25, ranged: true, keep: 10 },
  shield: { hp: 60, speed: 4.0, reach: 2.0, dmg: 12, wind: 0.75, rec: 0.7, cool: 1.4, r: 0.55, hy: 1.0, detect: 18, xp: 30, guard: true },
  assassin: { hp: 45, speed: 8.4, reach: 2.2, dmg: 11, wind: 0.42, rec: 0.45, cool: 0.9, r: 0.42, hy: 1.0, detect: 22, xp: 35, evade: 0.35 },
  drone: { hp: 28, speed: 6, reach: 18, dmg: 7, wind: 0.7, rec: 0.6, cool: 1.5, r: 0.6, hy: 0, detect: 26, xp: 25, ranged: true, fly: 4.2, keep: 8 },
};

let uid = 1;
export function spawnEnemy(W, kind, x, y, z, o = {}) {
  const K = KINDS[kind] || KINDS.thug;
  const scale = o.hpScale || 1;
  const e = {
    id: uid++,
    kind,
    x,
    y: y + (K.fly || 0),
    z,
    homeX: x,
    homeZ: z,
    homeY: y,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: o.facing || 0,
    hp: Math.round(K.hp * scale),
    maxHp: Math.round(K.hp * scale),
    r: K.r,
    hy: K.hy,
    K,
    fly: !!K.fly,
    state: o.state || "idle",
    t: 0,
    stun: 0,
    web: 0,
    slow: 0,
    tele: 0,
    cool: 0.5 + (uid % 5) * 0.2,
    token: false,
    swingId: 0,
    patrol: o.patrol || null,
    pi: 0,
    group: o.group ?? null,
    flash: 0,
    dead: false,
    deadT: 0,
    guardBroken: 0,
    aggro: !!o.aggro,
    leash: o.leash || 40,
    boss: false,
    hitFx: 0,
  };
  W.enemies.push(e);
  return e;
}

export function stepEnemies(W, dt) {
  const h = W.hero;
  let attacking = 0;
  for (const e of W.enemies) if (!e.dead && e.token) attacking++;
  for (const e of W.enemies) {
    if (e.dead) {
      e.deadT += dt;
      continue;
    }
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.hitFx = Math.max(0, e.hitFx - dt);
    // bosses run their own controller; fleeing runners follow their path
    if (e.boss && e.state !== "defeated") continue;
    if (e.runner && e.state === "flee") continue;
    e.cool = Math.max(0, e.cool - dt);
    e.guardBroken = Math.max(0, e.guardBroken - dt);
    e.slow = Math.max(0, e.slow - dt);
    const K = e.K;
    const dx = h.x - e.x;
    const dz = h.z - e.z;
    const dist = Math.hypot(dx, dz);
    const heroOk = h.action !== "defeated" && W.state === "play";

    // ---- crowd-control states
    if (e.state === "defeated") {
      e.deadT += dt;
      e.vy -= 26 * dt;
      e.y += e.vy * dt;
      ground(W, e);
      if (e.deadT > 2.5) e.dead = true;
      continue;
    }
    if (e.web > 0) {
      e.web -= dt;
      dropToken(e);
      if (e.fly) {
        // webbed drones drop out of the sky
        e.vy -= 26 * dt;
        e.y += e.vy * dt;
        if (ground(W, e)) {
          defeat(W, e, "crash");
          continue;
        }
      }
      if (e.web <= 0) e.state = "chase";
      continue;
    }
    if (e.state === "airborne") {
      e.vy -= 26 * dt;
      e.x += e.vx * dt;
      e.z += e.vz * dt;
      e.y += e.vy * dt;
      collide(W, e);
      if (e.vy < 0 && ground(W, e)) {
        e.state = "down";
        e.t = 0;
        e.vx = e.vz = 0;
        W.events.push({ type: "enemyLand", x: e.x, y: e.y, z: e.z });
      }
      continue;
    }
    if (e.state === "down") {
      if (e.t > 1.1) set(e, "chase");
      continue;
    }
    if (e.state === "stunned") {
      e.stun -= dt;
      slide(W, e, dt);
      if (e.stun <= 0) set(e, "chase");
      continue;
    }

    // ---- awareness
    const see = heroOk && dist < K.detect && Math.abs(h.y - e.y) < 14 && (dist < 6 || lineClear(W.geo, e.x, e.y + 1.5, e.z, h.x, h.y + 1.2, h.z));
    switch (e.state) {
      case "idle":
      case "patrol": {
        if (see || e.aggro) {
          set(e, "alert");
          W.events.push({ type: "enemyAlert", x: e.x, y: e.y + 2.2, z: e.z, id: e.id });
          break;
        }
        if (e.patrol) {
          const p = e.patrol[e.pi % e.patrol.length];
          if (moveTo(W, e, p.x, p.z, K.speed * 0.35, dt)) e.pi++;
          e.state = "patrol";
        } else e.facing += Math.sin(e.t * 0.7) * dt * 0.4;
        break;
      }
      case "alert":
        e.facing = Math.atan2(dx, dz);
        if (e.t > 0.55) set(e, "chase");
        break;
      case "chase": {
        if (!heroOk) {
          set(e, "patrol");
          break;
        }
        // protect missions: raiders go for the objective unless the hero is close
        if (e.objTarget && W.protect && dist > 8) {
          const P = W.protect;
          if (moveTo(W, e, P.x, P.z, K.speed * (e.slow > 0 ? 0.45 : 1), dt) || Math.hypot(P.x - e.x, P.z - e.z) < 2.6) {
            if (e.cool <= 0) {
              P.hp = Math.max(0, P.hp - K.dmg * 0.6);
              e.cool = K.cool + 0.6;
              W.events.push({ type: "objectiveHit", x: P.x, y: P.y + 1, z: P.z });
            }
          }
          break;
        }
        if (Math.hypot(e.x - e.homeX, e.z - e.homeZ) > e.leash && dist > 12) {
          // too far from home: give up and walk back
          moveTo(W, e, e.homeX, e.homeZ, K.speed, dt);
          if (Math.hypot(e.x - e.homeX, e.z - e.homeZ) < 2) set(e, "patrol");
          break;
        }
        const want = K.ranged ? K.keep : K.reach * 0.8;
        e.facing = Math.atan2(dx, dz);
        const sp = K.speed * (e.slow > 0 ? 0.45 : 1);
        if (K.ranged) {
          if (dist > K.keep + 4) moveTo(W, e, h.x, h.z, sp, dt);
          else if (dist < K.keep - 3) moveTo(W, e, e.x - dx, e.z - dz, sp * 0.8, dt);
          else strafe(W, e, dx, dz, sp * 0.5, dt);
        } else if (dist > want) {
          // close in; hold back a little while someone else has the attack token
          const hold = !e.token && attacking >= 2 && dist < 5;
          if (hold) strafe(W, e, dx, dz, sp * 0.4, dt);
          else moveTo(W, e, h.x, h.z, sp, dt);
        }
        const inRange = K.ranged ? dist < K.reach && lineClear(W.geo, e.x, e.y + 1.4, e.z, h.x, h.y + 1.2, h.z) : dist < K.reach + 0.4 && Math.abs(h.y - e.y) < 2.2;
        if (inRange && e.cool <= 0 && (e.token || attacking < 2)) {
          if (!e.token) {
            e.token = true;
            attacking++;
          }
          set(e, "windup");
          e.swingId++;
          e.tele = K.wind;
          W.events.push({ type: "telegraph", x: e.x, y: e.y + 2, z: e.z, kind: e.kind, ranged: !!K.ranged });
        }
        break;
      }
      case "windup":
        e.facing = turnTo(e.facing, Math.atan2(dx, dz), (K.ranged ? 4 : 6) * dt);
        e.tele = Math.max(0, K.wind - e.t);
        if (e.kind === "assassin" && e.t < K.wind * 0.8 && dist > 1.6) moveTo(W, e, h.x, h.z, K.speed * 1.3, dt);
        if (e.t >= K.wind) {
          set(e, "active");
          if (K.ranged) shoot(W, e);
          else if (K.slam) {
            W.events.push({ type: "slam", x: e.x + Math.sin(e.facing) * 1.8, y: e.y, z: e.z + Math.cos(e.facing) * 1.8 });
          }
        }
        break;
      case "active": {
        if (!K.ranged && !e.didHit) {
          const fx = Math.sin(e.facing);
          const fz = Math.cos(e.facing);
          const along = dx * fx + dz * fz;
          const reachOk = K.slam ? dist < K.reach + 0.8 : dist < K.reach + 0.5 && along > -0.3;
          if (reachOk && Math.abs(h.y - e.y) < 2) {
            e.didHit = true;
            W.damageHero(K.dmg * W.dmgScale, e.x, e.z, K.heavy ? "heavy" : "melee", false, e);
          }
        }
        if (e.t > 0.16) {
          set(e, "recover");
          e.didHit = false;
        }
        break;
      }
      case "recover":
        if (e.t > K.rec) {
          e.cool = K.cool;
          dropToken(e);
          set(e, "chase");
        }
        break;
      default:
        set(e, "idle");
    }
    if (e.fly) {
      // hover at flight height over whatever is below
      const gy = floorAt(W.geo, e.x, e.z, e.y, e.y - 60, fl) ? fl.y : 0;
      const want = Math.max(gy + K.fly, Math.min(h.y + 3.4, gy + K.fly + 8));
      e.y += (want + Math.sin(e.t * 2 + e.id) * 0.4 - e.y) * Math.min(1, dt * 2);
    } else ground(W, e);
  }
  separate(W);
  stepShots(W, dt);
}

function set(e, s) {
  e.state = s;
  e.t = 0;
}
function dropToken(e) {
  e.token = false;
}
function turnTo(a, b, max) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-max, Math.min(max, d));
}

function ground(W, e) {
  if (e.fly && e.state !== "defeated" && e.web <= 0) return false;
  if (floorAt(W.geo, e.x, e.z, e.y + 1.0, e.y - 3, fl)) {
    if (e.y - fl.y > 0.01 && e.vy < -0.1) {
      e.y = fl.y;
      e.vy = 0;
      return true;
    }
    e.y = fl.y;
    e.vy = 0;
    return true;
  }
  // nothing under: fall
  e.vy -= 26 * (1 / 120);
  e.y += e.vy * (1 / 120);
  if (e.y < -20 && !e.dead && e.state !== "defeated") defeat(W, e, "fall");
  return false;
}

function collide(W, e) {
  if (pushOut(W.geo, e, e.r, e.y + 0.1, e.y + 1.8, 0.5, hit)) {
    e.vx *= 0.3;
    e.vz *= 0.3;
  }
}

function moveTo(W, e, tx, tz, sp, dt) {
  const dx = tx - e.x;
  const dz = tz - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.6) return true;
  const ox = e.x;
  const oz = e.z;
  e.x += (dx / d) * sp * dt;
  e.z += (dz / d) * sp * dt;
  if (!e.fly) {
    collide(W, e);
    // don't walk off roof edges
    if (!floorAt(W.geo, e.x, e.z, e.y + 0.6, e.y - 1.2, fl)) {
      e.x = ox;
      e.z = oz;
    }
  }
  e.facing = turnTo(e.facing, Math.atan2(dx, dz), 8 * dt);
  e.moving = true;
  return false;
}

function strafe(W, e, dx, dz, sp, dt) {
  const d = Math.hypot(dx, dz) || 1;
  const side = e.id % 2 ? 1 : -1;
  moveTo(W, e, e.x + (-dz / d) * side * 3, e.z + (dx / d) * side * 3, sp, dt);
  e.facing = Math.atan2(dx, dz);
}

function slide(W, e, dt) {
  e.x += e.vx * dt;
  e.z += e.vz * dt;
  e.vx *= Math.max(0, 1 - 6 * dt);
  e.vz *= Math.max(0, 1 - 6 * dt);
  collide(W, e);
}

function separate(W) {
  const L = W.enemies;
  for (let i = 0; i < L.length; i++) {
    const a = L[i];
    if (a.dead || a.state === "defeated") continue;
    for (let j = i + 1; j < L.length; j++) {
      const b = L[j];
      if (b.dead || b.state === "defeated" || a.fly !== b.fly) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.r + b.r + 0.35;
      if (d < min && d > 1e-4) {
        const k = (min - d) / 2 / d;
        a.x -= dx * k;
        a.z -= dz * k;
        b.x += dx * k;
        b.z += dz * k;
      }
    }
  }
}

/* ------------------------------------------------------------------ damage taken */

/**
 * opts: { dmg, knock, launch, spike, fx, fz, move, breaksGuard, finisher, storm }
 * returns "hit" | "blocked" | "evaded" | "miss"
 */
export function hitEnemy(W, e, o) {
  if (e.dead || e.state === "defeated") return "miss";
  const h = W.hero;
  if (e.boss && W.boss && !W.boss.canHit(e, o)) {
    W.events.push({ type: "blocked", x: e.x, y: e.y + e.hy + 1, z: e.z });
    return "blocked";
  }
  // shield guards block frontal hits that don't break guards
  if (e.K.guard && e.guardBroken <= 0 && !o.breaksGuard && e.web <= 0 && e.state !== "stunned" && e.state !== "airborne" && e.state !== "down") {
    const fx = Math.sin(e.facing);
    const fz = Math.cos(e.facing);
    const tx = h.x - e.x;
    const tz = h.z - e.z;
    const front = (tx * fx + tz * fz) / (Math.hypot(tx, tz) || 1);
    if (front > 0.25 && o.move !== "aerial") {
      e.flash = 0.15;
      h.vx = (tx / (Math.hypot(tx, tz) || 1)) * 5;
      h.vz = (tz / (Math.hypot(tx, tz) || 1)) * 5;
      W.events.push({ type: "blocked", x: e.x, y: e.y + e.hy + 0.6, z: e.z });
      return "blocked";
    }
  }
  if (e.K.guard && o.breaksGuard) e.guardBroken = 5;
  // assassins slip some light hits
  if (e.K.evade && (o.move === "punch1" || o.move === "punch2") && e.web <= 0 && e.state !== "stunned" && e.state !== "windup" && W.rand() < e.K.evade) {
    e.x -= (o.fx || 0) * 2.2;
    e.z -= (o.fz || 0) * 2.2;
    set(e, "chase");
    W.events.push({ type: "evade", x: e.x, y: e.y + 1, z: e.z });
    return "evaded";
  }
  const dmg = o.finisher ? e.hp : o.dmg;
  e.hp -= dmg;
  e.flash = 0.18;
  e.hitFx = 0.3;
  W.stats.damage += dmg;
  dropToken(e);
  W.events.push({ type: "hit", x: e.x, y: e.y + e.hy + 0.4, z: e.z, move: o.move, dmg, heavy: dmg >= 18, finisher: !!o.finisher });
  if (e.hp <= 0) {
    defeat(W, e, o.finisher ? "finisher" : "ko", o);
    return "hit";
  }
  if (e.boss) {
    W.boss.onHit(e, o);
    return "hit";
  }
  // knock-back / launch / stun
  const fl2 = Math.hypot(o.fx || 0, o.fz || 0) || 1;
  const kx = ((o.fx || 0) / fl2) * (o.knock || 0);
  const kz = ((o.fz || 0) / fl2) * (o.knock || 0);
  if (o.launch && !e.K.heavy && !e.fly) {
    e.state = "airborne";
    e.t = 0;
    e.vx = kx * 0.3;
    e.vz = kz * 0.3;
    e.vy = o.launch;
  } else if (o.spike && (e.state === "airborne" || e.fly)) {
    if (e.fly) {
      e.web = 1.5;
      e.vy = o.spike;
    } else {
      e.vy = o.spike;
    }
  } else if (e.K.heavy && o.knock < 7 && !o.storm) {
    // bruisers shrug off light hits (brief flinch only)
    e.vx = kx * 0.2;
    e.vz = kz * 0.2;
  } else {
    e.state = "stunned";
    e.t = 0;
    e.stun = o.knock >= 6 ? 0.9 : 0.42;
    e.vx = kx;
    e.vz = kz;
  }
  return "hit";
}

export function webEnemy(W, e, level, dmg) {
  if (e.dead || e.state === "defeated") return;
  if (dmg) {
    e.hp -= dmg;
    W.stats.damage += dmg;
    if (e.hp <= 0) return defeat(W, e, "web");
  }
  e.webStack = (e.webStack || 0) + level;
  e.slow = 2.5;
  if (e.webStack >= 3 || level >= 3) {
    e.web = e.boss ? 1.2 : 4;
    e.webStack = 0;
    if (e.fly) e.vy = 0;
    dropToken(e);
    W.events.push({ type: "webbed", x: e.x, y: e.y + e.hy, z: e.z, id: e.id });
  } else W.events.push({ type: "webHit", x: e.x, y: e.y + e.hy, z: e.z });
  e.flash = 0.12;
}

export function pullEnemy(W, e, h) {
  const dx = h.x - e.x;
  const dz = h.z - e.z;
  const d = Math.hypot(dx, dz) || 1;
  if (e.K.guard) e.guardBroken = 5; // the shield is yanked away
  if (e.K.heavy || e.boss) {
    // too heavy: the hero is pulled in instead, the enemy staggers
    e.state = "stunned";
    e.t = 0;
    e.stun = 0.7;
    h.zip = { t: 0, target: e, dur: 0.4, noKick: true };
    return;
  }
  if (e.fly) {
    e.web = 1.5;
    return;
  }
  const want = Math.max(0, d - 1.6);
  e.state = "stunned";
  e.t = 0;
  e.stun = 1.0;
  e.vx = (dx / d) * want * 5.5;
  e.vz = (dz / d) * want * 5.5;
  dropToken(e);
}

export function defeat(W, e, how) {
  e.state = "defeated";
  e.t = 0;
  e.deadT = 0;
  e.hp = 0;
  e.vy = how === "ko" || how === "finisher" ? 4 : e.vy;
  dropToken(e);
  W.stats.defeated++;
  W.xp += e.K.xp;
  W.score += e.K.xp * 10;
  W.gainEnergy(6);
  W.events.push({ type: "enemyDefeat", x: e.x, y: e.y + e.hy, z: e.z, kind: e.kind, how, id: e.id, group: e.group });
  if (W.onEnemyDefeated) W.onEnemyDefeated(e);
}

/* ------------------------------------------------------------------ shots */

function shoot(W, e) {
  const h = W.hero;
  const sx = e.x;
  const sy = e.y + e.hy + 1.3;
  const sz = e.z;
  const tx = h.x + h.vx * 0.25;
  const ty = h.y + 1.1;
  const tz = h.z + h.vz * 0.25;
  const dx = tx - sx;
  const dy = ty - sy;
  const dz = tz - sz;
  const l = Math.hypot(dx, dy, dz) || 1;
  const sp = e.fly ? 24 : 30;
  W.shots.push({ x: sx, y: sy, z: sz, vx: (dx / l) * sp, vy: (dy / l) * sp, vz: (dz / l) * sp, t: 0, dmg: e.K.dmg * W.dmgScale, from: e.id, kind: e.fly ? "bolt" : "bullet" });
  W.events.push({ type: "enemyShoot", x: sx, y: sy, z: sz, kind: e.kind });
}

function stepShots(W, dt) {
  const h = W.hero;
  const keep = [];
  for (const s of W.shots) {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    let dead = s.t > 2.2;
    if (!dead && Math.hypot(h.x - s.x, h.y + 1 - s.y, h.z - s.z) < 0.75) {
      W.damageHero(s.dmg, s.x - s.vx, s.z - s.vz, "shot", false, null);
      dead = true;
    }
    if (!dead) {
      for (const b of W.geo.boxes) {
        if (s.x > b.x0 && s.x < b.x1 && s.y > b.y0 && s.y < b.y1 && s.z > b.z0 && s.z < b.z1) {
          dead = true;
          break;
        }
      }
      if (s.y < 0 && !W.city.water) dead = true;
    }
    if (dead) W.events.push({ type: "shotPop", x: s.x, y: s.y, z: s.z });
    else keep.push(s);
  }
  W.shots = keep;
}

export function threatTime(W) {
  // smallest time until an attack connects with the hero (for perfect dodges)
  const h = W.hero;
  let best = Infinity;
  for (const e of W.enemies) {
    if (e.dead || e.state === "defeated") continue;
    if (e.state === "windup" && !e.K.ranged) {
      const d = Math.hypot(h.x - e.x, h.z - e.z);
      if (d < e.K.reach + 2) best = Math.min(best, Math.max(0, e.K.wind - e.t));
    }
    if (e.state === "active" && !e.K.ranged && !e.didHit) best = 0;
  }
  for (const s of W.shots) {
    const d = Math.hypot(h.x - s.x, h.y + 1 - s.y, h.z - s.z);
    const v = Math.hypot(s.vx, s.vy, s.vz) || 1;
    const closing = ((h.x - s.x) * s.vx + (h.y + 1 - s.y) * s.vy + (h.z - s.z) * s.vz) / d / v;
    if (closing > 0.9) best = Math.min(best, d / v);
  }
  if (W.boss) best = Math.min(best, W.boss.threat());
  return best;
}
