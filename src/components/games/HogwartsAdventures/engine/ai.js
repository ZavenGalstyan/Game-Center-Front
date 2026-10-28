/**
 * Enemy behaviour. Shared states: idle (patrol around home) → alert →
 * combat → (stunned / lifted / staggered / knocked) → dead.
 *
 *   caster   holds a duelling band, strafes, casts after a visible wind-up
 *            (wand glow + "windup" event), shields, sidesteps, apparates
 *   melee    paths in, winds up (ground telegraph), lunges / swings / slams
 *   dementor glides in; drains life in an aura (Lumos and Edurus soften it)
 *   dummy    takes hits, heals back up
 *
 * Movement uses the nav grid when the straight line is blocked.
 */
import { ENEMIES } from "../data/enemies.js";
import { wrapAngle, approachAngle, clamp } from "./math.js";
import { spawnBolt, hurtPlayer, hurtEnemy } from "./combat.js";

export function makeEnemy(G, type, x, z, group) {
  const def = ENEMIES[type];
  const e = {
    id: ++G.uid,
    type,
    def,
    group: group || null,
    x,
    z,
    y: G.col.ground(x, z, 2),
    yaw: G.rand() * 6.28,
    home: { x, z },
    hp: def.hp,
    maxHp: def.hp,
    state: "idle",
    t: 0,
    aggro: false,
    target: null,
    path: null,
    pathT: 0,
    vx: 0,
    vz: 0,
    speed: 0,
    stunT: 0,
    liftT: 0,
    liftH: 0,
    staggerT: 0,
    disarmT: 0,
    burnT: 0,
    slowT: 0,
    shieldT: 0,
    shieldCd: 2 + G.rand() * 3,
    castCd: 1.2 + G.rand() * 1.5,
    meleeCd: 0.5,
    blinkCd: 4,
    volleyCd: 4 + G.rand() * 3,
    webCd: 2 + G.rand() * 3,
    slamCd: 5,
    wind: null,
    windT: 0,
    strafe: G.rand() < 0.5 ? 1 : -1,
    strafeT: 1 + G.rand() * 2,
    hitT: 0,
    lastHitT: 99,
    dead: false,
    deadT: 0,
    knock: null,
    anim: "idle",
    flyY: def.fly || 0,
    wanderT: G.rand() * 3,
    wanderTo: null,
  };
  return e;
}

const DETECT_LOS_EVERY = 0.25;

export function updateEnemy(G, e, dt) {
  if (e.dead) {
    e.deadT += dt;
    return;
  }
  const p = G.player;
  const def = e.def;
  e.hitT = Math.max(0, e.hitT - dt);
  e.lastHitT += dt;
  e.t += dt;
  // timers
  for (const k of ["stunT", "staggerT", "disarmT", "slowT", "shieldT", "shieldCd", "castCd", "meleeCd", "blinkCd", "volleyCd", "webCd", "slamCd"]) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
  // burning
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.burnAcc = (e.burnAcc || 0) + dt;
    if (e.burnAcc >= 0.5) {
      e.burnAcc = 0;
      hurtEnemy(G, e, 3 * (def.resist?.incendio || 1), "dot");
      if (e.dead) return;
    }
  }
  // regen dummies
  if (def.ai === "dummy") {
    if (e.lastHitT > 3 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + def.regen * dt);
    e.anim = e.hitT > 0 ? "hit" : "idle";
    return;
  }
  // knockback / pull
  if (e.knock) {
    e.x += e.knock.vx * dt;
    e.z += e.knock.vz * dt;
    e.knock.t -= dt;
    if (e.knock.t <= 0) e.knock = null;
    G.col.resolve(e, def.radius, def.height);
  }
  // levitated: helpless, then falls
  if (e.liftT > 0) {
    e.liftT -= dt;
    e.liftH = Math.min(1.8, e.liftH + dt * 5);
    e.anim = "lifted";
    e.wind = null;
    if (e.liftT <= 0) {
      e.liftT = 0;
      e.falling = true;
    }
    e.y = G.col.ground(e.x, e.z, e.y + 2) + e.liftH + (e.flyY || 0);
    return;
  }
  if (e.falling) {
    e.liftH = Math.max(0, e.liftH - dt * 9);
    if (e.liftH === 0) {
      e.falling = false;
      hurtEnemy(G, e, 8, "dot");
      e.staggerT = 0.6;
      G.emit({ type: "thud", x: e.x, y: e.y, z: e.z });
      if (e.dead) return;
    }
  }
  const gy = G.col.ground(e.x, e.z, e.y + 0.6);
  const baseY = gy > -10 ? gy : e.y;
  e.y = baseY + e.liftH + (e.flyY ? e.flyY + Math.sin(e.t * 2.2 + e.id) * 0.15 : 0);
  if (e.stunT > 0 || e.staggerT > 0) {
    e.anim = e.stunT > 0 ? "stunned" : "hit";
    e.wind = null;
    e.speed = 0;
    return;
  }

  // ---------------------------------------------------------- perception
  const tgt = pickTarget(G, e);
  const dx = tgt.x - e.x;
  const dz = tgt.z - e.z;
  const d = Math.hypot(dx, dz);
  e.losT = (e.losT || 0) - dt;
  if (e.losT <= 0) {
    e.losT = DETECT_LOS_EVERY;
    e.los = G.col.los(e.x, e.y + def.height * 0.8, e.z, tgt.x, tgt.y + 1.3, tgt.z, { noTrees: false });
  }
  if (!e.aggro && !p.dead) {
    const seeR = def.detect * (p.lumos ? 1.15 : 1) * (G.region?.atmos === "forest" && !p.lumos ? 0.8 : 1);
    if ((d < seeR && e.los) || d < 4 || e.lastHitT < 0.2 || G.alertNear(e)) {
      e.aggro = true;
      G.emit({ type: "alert", id: e.id, x: e.x, y: e.y + def.height + 0.5, z: e.z, etype: e.type });
    }
  }
  if (p.dead) e.aggro = false;
  if (!e.aggro) {
    patrol(G, e, dt);
    return;
  }
  // leash: give up if dragged far from home and out of sight
  if (!def.boss && Math.hypot(e.x - e.home.x, e.z - e.home.z) > 55 && !e.los) {
    e.aggro = false;
    e.hp = e.maxHp;
  }
  e.combatT = 0;
  p.combatT = Math.max(p.combatT, 4);

  switch (def.ai) {
    case "caster":
      caster(G, e, tgt, d, dt);
      break;
    case "melee":
      melee(G, e, tgt, d, dt);
      break;
    case "dementor":
      dementor(G, e, tgt, d, dt);
      break;
    default:
      break;
  }
}

/** Mostly the hero; sometimes the student we are protecting. */
function pickTarget(G, e) {
  const p = G.player;
  const a = G.protect;
  if (a && !a.down) {
    e.allyT = (e.allyT || 0) - 1 / 60;
    if (e.allyT <= 0) {
      e.allyT = 4 + G.rand() * 3;
      const da = Math.hypot(a.x - e.x, a.z - e.z);
      const dp = Math.hypot(p.x - e.x, p.z - e.z);
      e.onAlly = da < dp * 0.8 && G.rand() < 0.55;
    }
    if (e.onAlly) return a;
  }
  return p;
}

function patrol(G, e, dt) {
  e.wanderT -= dt;
  if (e.wanderT <= 0) {
    e.wanderT = 3 + G.rand() * 4;
    const a = G.rand() * Math.PI * 2;
    const r = G.rand() * 4;
    e.wanderTo = G.rand() < 0.45 ? null : { x: e.home.x + Math.sin(a) * r, z: e.home.z + Math.cos(a) * r };
  }
  if (e.wanderTo) moveToward(G, e, e.wanderTo.x, e.wanderTo.z, e.def.speed * 0.35, dt, 0.5);
  else {
    e.speed = 0;
    e.anim = "idle";
  }
}

/** Steer toward (tx,tz): straight if open, else along an A* path. */
function moveToward(G, e, tx, tz, speed, dt, stopAt = 0.3) {
  const def = e.def;
  let gx = tx;
  let gz = tz;
  const d = Math.hypot(tx - e.x, tz - e.z);
  if (d < stopAt) {
    e.speed = 0;
    return true;
  }
  const flying = !!def.fly;
  // fliers hover over low furniture, but walls still need a path around
  if (G.nav && !G.nav.lineOpen(e.x, e.z, tx, tz) && !(flying && G.col.los(e.x, e.y + 0.2, e.z, tx, e.y + 0.2, tz, { noTrees: true }))) {
    e.pathT -= dt;
    if (!e.path || e.pathT <= 0 || (e.pathGoal && Math.hypot(e.pathGoal.x - tx, e.pathGoal.z - tz) > 3)) {
      e.path = G.nav.findPath(e.x, e.z, tx, tz, 3500);
      e.pathT = 0.6 + G.rand() * 0.4;
      e.pathGoal = { x: tx, z: tz };
    }
    if (e.path && e.path.length) {
      let wp = e.path[0];
      if (Math.hypot(wp.x - e.x, wp.z - e.z) < 0.7 && e.path.length > 1) {
        e.path.shift();
        wp = e.path[0];
      }
      gx = wp.x;
      gz = wp.z;
    }
  } else e.path = null;
  const dx = gx - e.x;
  const dz = gz - e.z;
  const L = Math.hypot(dx, dz) || 1;
  const sp = speed * (e.slowT > 0 ? 0.5 : 1);
  const ox = e.x;
  const oz = e.z;
  e.x += (dx / L) * sp * dt;
  e.z += (dz / L) * sp * dt;
  // don't walk off into pits
  if (!flying && G.col.inPit(e.x, e.z) && G.col.ground(e.x, e.z, e.y + 0.5) < -5) {
    e.x = ox;
    e.z = oz;
  }
  separate(G, e);
  G.col.resolve(e, def.radius, def.height);
  e.yaw = approachAngle(e.yaw, Math.atan2(dx, dz), dt * 8);
  e.speed = Math.hypot(e.x - ox, e.z - oz) / dt;
  e.anim = e.speed > 3.6 ? "run" : e.speed > 0.4 ? "walk" : "idle";
  return false;
}
function separate(G, e) {
  for (const o of G.enemies) {
    if (o === e || o.dead) continue;
    const dx = e.x - o.x;
    const dz = e.z - o.z;
    const R = e.def.radius + o.def.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < R * R && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (R - d) * 0.5;
      e.x += (dx / d) * push;
      e.z += (dz / d) * push;
    }
  }
}
function face(e, tx, tz, dt, rate = 10) {
  e.yaw = approachAngle(e.yaw, Math.atan2(tx - e.x, tz - e.z), dt * rate);
}

/* ---------------------------------------------------------------- casters */
function caster(G, e, tgt, d, dt) {
  const def = e.def;
  const p = G.player;
  // incoming player bolt? shield or sidestep
  if (!e.wind && e.disarmT <= 0) {
    for (const b of G.projectiles) {
      if (b.team !== "player" || b.reflected) continue; // a rebounded curse is too quick to read
      const bx = e.x - b.x;
      const bz = e.z - b.z;
      const bd = Math.hypot(bx, bz);
      if (bd > 7 || bd < 0.5) continue;
      if ((bx * b.vx + bz * b.vz) / (bd * b.speed) < 0.92) continue;
      if (b.seenBy === e.id) continue;
      b.seenBy = e.id;
      if (def.shield && e.shieldCd <= 0 && G.rand() < def.shield.chance) {
        e.shieldT = def.shield.dur;
        e.shieldCd = def.shield.cd;
        G.emit({ type: "enemyShield", id: e.id, x: e.x, y: e.y + 1.2, z: e.z });
      } else if (G.rand() < (def.dodge || 0)) {
        const sx = -b.vz / b.speed;
        const sz = b.vx / b.speed;
        e.knock = { vx: sx * 9 * e.strafe, vz: sz * 9 * e.strafe, t: 0.22 };
        G.emit({ type: "enemyDodge", id: e.id });
      }
      break;
    }
  }
  // disarmed: scramble backward to fetch the wand
  if (e.disarmT > 0) {
    const ax = e.x - tgt.x;
    const az = e.z - tgt.z;
    const L = Math.hypot(ax, az) || 1;
    moveToward(G, e, e.x + (ax / L) * 3, e.z + (az / L) * 3, def.speed * 0.6, dt, 0.1);
    face(e, tgt.x, tgt.z, dt);
    e.anim = "disarmed";
    return;
  }
  // winding up a spell
  if (e.wind) {
    e.windT -= dt;
    face(e, tgt.x, tgt.z, dt, 6);
    e.speed = 0;
    e.anim = "cast";
    if (e.windT <= 0) {
      const w = e.wind;
      e.wind = null;
      if (e.los) {
        fireBolt(G, e, tgt, w);
        if (w.volley > 1) {
          for (let k = 1; k < w.volley; k++) G.later(k * 0.22, () => !e.dead && e.stunT <= 0 && e.disarmT <= 0 && fireBolt(G, e, tgt, w, (k % 2 ? 1 : -1) * 0.12 * k));
        }
      }
      e.castCd = def.bolt.every[0] + G.rand() * (def.bolt.every[1] - def.bolt.every[0]);
    }
    return;
  }
  // apparate away when pressed
  if (def.blink && e.blinkCd <= 0 && (d < 4 || (e.hp < e.maxHp * 0.6 && G.rand() < 0.02))) {
    blink(G, e, tgt, def.blink.dist);
    return;
  }
  // positioning
  const [rmin, rmax] = def.range;
  if (d > rmax || !e.los) moveToward(G, e, tgt.x, tgt.z, def.speed, dt, rmin);
  else if (d < rmin) {
    const ax = e.x - tgt.x;
    const az = e.z - tgt.z;
    moveToward(G, e, e.x + (ax / d) * 3, e.z + (az / d) * 3, def.speed * 0.8, dt, 0.1);
    face(e, tgt.x, tgt.z, dt);
  } else {
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      e.strafeT = 1.2 + G.rand() * 2;
      e.strafe = -e.strafe;
    }
    const sx = (-(tgt.z - e.z) / d) * e.strafe;
    const sz = ((tgt.x - e.x) / d) * e.strafe;
    moveToward(G, e, e.x + sx * 2, e.z + sz * 2, def.speed * 0.45, dt, 0.1);
    face(e, tgt.x, tgt.z, dt);
  }
  // start a cast
  if (e.castCd <= 0 && e.los && d < rmax + 6) {
    const volley = def.volley && e.volleyCd <= 0 ? def.volley.n : 1;
    if (volley > 1) e.volleyCd = def.volley.cd;
    e.wind = { ...def.bolt, volley };
    e.windT = def.bolt.windup * (volley > 1 ? 1.25 : 1);
    G.emit({ type: "windup", id: e.id, x: e.x, y: e.y + 1.5, z: e.z, color: def.bolt.color, t: e.windT, volley });
  }
  void p;
}
function fireBolt(G, e, tgt, w, spread = 0) {
  const fx = Math.sin(e.yaw);
  const fz = Math.cos(e.yaw);
  const sx = e.x + fx * 0.5 + fz * 0.25;
  const sy = e.y + 1.45;
  const sz = e.z + fz * 0.5 - fx * 0.25;
  // lead the target a little (not perfectly — dodging should work)
  const lead = Math.hypot(tgt.x - sx, tgt.z - sz) / w.speed;
  const tv = tgt.vel || { x: 0, z: 0 };
  const tx = tgt.x + tv.x * lead * 0.45;
  const tz = tgt.z + tv.z * lead * 0.45;
  let dx = tx - sx;
  const dy = tgt.y + 1.15 - sy;
  let dz = tz - sz;
  if (spread) {
    const c = Math.cos(spread);
    const s = Math.sin(spread);
    [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
  }
  const L = Math.hypot(dx, dy, dz) || 1;
  spawnBolt(G, { team: "enemy", kind: w.kind, x: sx, y: sy, z: sz, dx: dx / L, dy: dy / L, dz: dz / L, speed: w.speed, range: 40, dmg: w.dmg, src: e, color: w.color, radius: w.radius || 0.25, slow: w.slow, homing: w.homing ?? 0.35, target: tgt === G.player ? null : null });
  G.emit({ type: "enemyCast", id: e.id, kind: w.kind, color: w.color });
}
function blink(G, e, tgt, dist) {
  const ox = e.x;
  const oz = e.z;
  for (let k = 0; k < 8; k++) {
    const a = G.rand() * Math.PI * 2;
    const nx = tgt.x + Math.sin(a) * dist;
    const nz = tgt.z + Math.cos(a) * dist;
    if (!G.nav || !G.nav.open(nx, nz)) continue;
    if (G.col.ground(nx, nz, e.y + 1) < -5) continue;
    e.x = nx;
    e.z = nz;
    e.blinkCd = e.def.blink.cd;
    G.emit({ type: "apparate", id: e.id, x0: ox, z0: oz, x: nx, z: nz, y: e.y });
    return;
  }
  e.blinkCd = 2;
}

/* ---------------------------------------------------------------- melee */
function melee(G, e, tgt, d, dt) {
  const def = e.def;
  const M = def.melee;
  if (e.wind) {
    const w = e.wind;
    e.windT -= dt;
    e.speed = 0;
    if (w.kind === "strike") {
      face(e, tgt.x, tgt.z, dt, 3);
      e.anim = "windup";
      if (e.windT <= 0) {
        // lunge + hit
        e.wind = { kind: "lunge", t: 0.22 };
        e.windT = 0.22;
        e.hitDone = false;
        e.anim = "attack";
      }
    } else if (w.kind === "lunge") {
      const fx = Math.sin(e.yaw);
      const fz = Math.cos(e.yaw);
      const keep = Math.max(0, d - def.radius - 0.6);
      const step = Math.min(M.lunge * dt, keep);
      e.x += fx * step;
      e.z += fz * step;
      G.col.resolve(e, def.radius, def.height);
      e.anim = "attack";
      if (!e.hitDone && e.windT < 0.12) {
        e.hitDone = true;
        const dx = tgt.x - e.x;
        const dz = tgt.z - e.z;
        const dd = Math.hypot(dx, dz);
        const a = Math.abs(wrapAngle(Math.atan2(dx, dz) - e.yaw));
        if (dd < M.reach + 0.45 && a < (M.sweep ? 1.15 : 0.85)) {
          if (tgt === G.player) meleeHitPlayer(G, e, M.dmg);
          else G.hurtAlly(tgt, M.dmg);
        }
        G.emit({ type: "swing", id: e.id, etype: e.type, x: e.x, y: e.y + 1, z: e.z });
      }
      if (e.windT <= 0) {
        e.wind = null;
        e.meleeCd = M.cd * (0.85 + G.rand() * 0.3);
      }
    } else if (w.kind === "slam") {
      e.anim = "slam";
      if (e.windT <= 0) e.wind = null;
    }
    return;
  }
  // guardian ground slam
  if (def.slam && e.slamCd <= 0 && d < def.slam.r + 1) {
    e.slamCd = def.slam.cd;
    e.wind = { kind: "slam" };
    e.windT = def.slam.windup + 0.3;
    G.zones.push({ kind: "warn", shape: "circle", x: e.x, z: e.z, r: def.slam.r, delay: def.slam.windup, dmg: def.slam.dmg, color: "#ff6a3a", t: 0, fx: "slam", allyDmg: true });
    G.emit({ type: "telegraph", shape: "circle", x: e.x, z: e.z, r: def.slam.r, dur: def.slam.windup, color: "#ff6a3a" });
    return;
  }
  // spider web spit at mid range
  if (def.web && e.webCd <= 0 && d > 5 && d < 15 && e.los) {
    e.webCd = def.web.every;
    fireBolt(G, e, tgt, { kind: "web", dmg: 3, speed: def.web.speed, color: "#e8e8e0", slow: def.web.slow, radius: 0.35 });
  }
  if (d < M.reach + def.radius * 0.3 && e.meleeCd <= 0 && e.los) {
    e.wind = { kind: "strike" };
    e.windT = M.windup;
    const yaw = Math.atan2(tgt.x - e.x, tgt.z - e.z);
    G.emit({ type: "telegraph", shape: "cone", x: e.x, z: e.z, r: M.reach + 0.5, yaw, half: M.sweep ? 1.15 : 0.85, dur: M.windup, color: "#ff5a3a" });
    G.emit({ type: "windup", id: e.id, x: e.x, y: e.y + 1, z: e.z, melee: true, t: M.windup });
    return;
  }
  if (d > M.reach * 0.8) moveToward(G, e, tgt.x, tgt.z, def.speed, dt, M.reach * 0.7);
  else {
    e.speed = 0;
    face(e, tgt.x, tgt.z, dt);
    e.anim = "idle";
  }
}
function meleeHitPlayer(G, e, dmg) {
  const p = G.player;
  if (p.iframe > 0 || p.dodgeT > 0.05) {
    G.emit({ type: "dodged", x: p.x, y: p.y + 1, z: p.z });
    return;
  }
  if (p.shieldT > 0) {
    G.setFlag("duelBlock");
    G.emit({ type: "blocked", x: p.x, y: p.y + 1.2, z: p.z, color: "#7fd0ff", shield: true, melee: true });
    // a well-timed shield staggers the attacker
    if (p.shieldAge < 0.35) e.staggerT = 0.9;
    return;
  }
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const L = Math.hypot(dx, dz) || 1;
  hurtPlayer(G, dmg, { kind: "melee", dirX: dx / L, dirZ: dz / L });
}

/* ---------------------------------------------------------------- dementors */
function dementor(G, e, tgt, d, dt) {
  const def = e.def;
  const p = G.player;
  if (d > def.drain.r * 0.6) moveToward(G, e, tgt.x, tgt.z, def.speed * (p.lumos ? 0.75 : 1), dt, def.drain.r * 0.5);
  else {
    e.speed = 0;
    face(e, tgt.x, tgt.z, dt);
  }
  e.anim = "glide";
  if (d < def.drain.r) {
    let dps = def.drain.dps;
    if (p.lumos) dps *= 0.6;
    if (tgt === p) {
      e.drainAcc = (e.drainAcc || 0) + dps * dt;
      p.slowT = Math.max(p.slowT, 0.3);
      p.chill = Math.min(1, (p.chill || 0) + dt * 0.8);
      if (e.drainAcc >= 2) {
        hurtPlayer(G, Math.floor(e.drainAcc), { kind: "drain", noStagger: true, color: "#9ab8d8" });
        e.drainAcc -= Math.floor(e.drainAcc);
      }
    } else {
      e.drainAcc = (e.drainAcc || 0) + dps * dt;
      if (e.drainAcc >= 2) {
        G.hurtAlly(tgt, Math.floor(e.drainAcc));
        e.drainAcc -= Math.floor(e.drainAcc);
      }
    }
    if (!e.shrieked) {
      e.shrieked = true;
      G.emit({ type: "dementorNear", id: e.id });
    }
  } else e.shrieked = false;
}

export { clamp };
