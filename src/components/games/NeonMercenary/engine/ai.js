/**
 * Enemy AI (pure sim).
 *
 * State machine:  idle / patrol → suspicious (investigate) → alert (react,
 * call nearby allies) → combat (chase · attack · cover · flank · strafe)
 * → retreat (badly hurt, once) → search (lost the player) → return → patrol.
 *
 * Perception runs at ~10 Hz per enemy: range + field of view + line of sight
 * fill an awareness meter (slower when the player crouches, faster when they
 * sprint). Gunfire is heard. Only a few enemies may shoot at the same time
 * ("attack tokens"); the rest reposition, so fights stay readable and fair.
 */
import { ENEMIES } from "../data/enemies.js";
import { lineOfSight, collideCircle, findPath, navClear, nearestWalkable, raycast, groundHeight } from "./map.js";
import { approachAngle, clamp, dist, wrapAngle, yawOf } from "./math.js";
import { PLAYER_H, CROUCH_H } from "./player.js";

let NEXT_ID = 1;
export const MAX_TOKENS = 3;

export function createEnemy(G, type, x, z, opts = {}) {
  const def = ENEMIES[type];
  const scale = def.look?.scale || 1;
  const n = nearestWalkable(G.map, x, z, 6) || { x, z };
  const hpMul = opts.hpMul || 1;
  const e = {
    id: NEXT_ID++,
    kind: "enemy",
    type,
    def,
    name: def.name,
    faction: def.faction,
    x: def.flyer ? x : n.x,
    z: def.flyer ? z : n.z,
    y: def.flyer ? 4 : 0,
    yaw: opts.yaw ?? G.rand() * Math.PI * 2,
    vx: 0,
    vz: 0,
    hp: def.hp * hpMul,
    maxHp: def.hp * hpMul,
    shield: def.shield || 0,
    maxShield: def.shield || 0,
    shieldDelay: 0,
    r: def.flyer ? 0.5 : 0.4 * (def.look?.girth || 1),
    h: def.flyer ? 0.7 : 1.8 * scale,
    robot: !!def.robot,
    flyer: !!def.flyer,
    state: opts.route ? "patrol" : opts.alert ? "combat" : "idle",
    aware: opts.alert ? 1 : 0,
    canSee: false,
    seeT: G.rand() * 0.1,
    lastKnown: opts.alert ? { x: G.player.x, z: G.player.z } : null,
    lostT: 0,
    route: opts.route || null,
    routeI: 0,
    waitT: 0,
    home: { x: n.x, z: n.z, yaw: opts.yaw ?? 0 },
    path: null,
    pathI: 0,
    pathT: 0,
    goal: null,
    cover: null,
    coverT: 0,
    peek: false,
    fireT: 0.6 + G.rand() * 0.8,
    burstLeft: 0,
    reactT: 0,
    windup: 0,
    stunT: 0,
    hitT: 0,
    deadT: 0,
    tag: opts.tag || null,
    mission: !!opts.tag,
    retreated: false,
    searchT: 0,
    investT: 0,
    strafe: G.rand() < 0.5 ? 1 : -1,
    strafeT: 0,
    flankSide: G.rand() < 0.5 ? 1 : -1,
    token: false,
    anim: "idle",
    animT: 0,
    aimPitch: 0,
    crouch: false,
    lastHitT: -9,
    dropsQuest: opts.drop || null,
    noLoot: !!opts.noLoot,
    hold: !!opts.hold, // guards that stay at their post
    alertRadius: opts.alertRadius ?? 22,
    look: def.look,
  };
  if (e.flyer) e.y = groundHeight(G.map, e.x, e.z, 0.5, 50) + 3.5 + G.rand();
  return e;
}

/* ------------------------------------------------------------ helpers */
const eyeY = (e) => (e.flyer ? e.y : e.y + (e.crouch ? 1.05 : e.h * 0.9));
const playerChest = (p) => p.y + (PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT) * 0.72;
const playerHead = (p) => p.y + (PLAYER_H + (CROUCH_H - PLAYER_H) * p.crouchT) * 0.93;

export function setAlert(G, e, x, z) {
  if (e.state === "dead") return;
  const was = e.state;
  e.aware = 1;
  e.lastKnown = { x, z };
  e.lostT = 0;
  if (was !== "combat" && was !== "retreat") {
    e.state = "combat";
    e.reactT = e.def.reaction;
    G.emit({ type: "alert", id: e.id, x: e.x, y: e.y + e.h + 0.4, z: e.z, robot: e.robot });
    G.onAlert?.(e);
  }
}

/** Gunfire / explosions: nearby enemies investigate, very close ones engage. */
export function hearNoise(G, x, z, radius, fromPlayer = true) {
  for (const e of G.enemies) {
    if (e.state === "dead" || e.stunT > 0) continue;
    const d = dist(e.x, e.z, x, z);
    if (d > radius) continue;
    if (e.state === "combat" || e.state === "retreat") {
      if (fromPlayer && !e.canSee) e.lastKnown = { x, z };
      continue;
    }
    if (d < radius * 0.45 && fromPlayer) setAlert(G, e, x, z);
    else {
      e.state = "suspicious";
      e.aware = Math.max(e.aware, 0.5);
      e.investT = 7;
      e.goal = { x, z };
      e.path = null;
      G.emit({ type: "suspicious", id: e.id });
    }
  }
}

function alertAllies(G, e) {
  for (const o of G.enemies) {
    if (o === e || o.state === "dead" || o.faction !== e.faction) continue;
    if (o.state === "combat" || o.state === "retreat") continue;
    if (dist(o.x, o.z, e.x, e.z) < e.alertRadius) setAlert(G, o, e.lastKnown.x, e.lastKnown.z);
  }
}

function perceive(G, e) {
  const p = G.player;
  const def = e.def;
  e.canSee = false;
  if (p.dead || G.cinematic) return;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const d = Math.hypot(dx, dz);
  const range = def.detect * (G.darkFactor || 1);
  if (d > range * 1.15) return;
  const ang = Math.abs(wrapAngle(yawOf(dx, dz) - e.yaw));
  const near = d < (p.crouchT > 0.5 ? 1.1 : 3.5);
  const inFov = def.fov >= 360 || ang < ((def.fov * Math.PI) / 180) * 0.5 || near || e.state === "combat";
  if (!inFov) return;
  const ey = eyeY(e);
  if (!lineOfSight(G.map, e.x, ey, e.z, p.x, playerHead(p), p.z) && !lineOfSight(G.map, e.x, ey, e.z, p.x, playerChest(p), p.z)) return;
  e.canSee = true;
}

/** Pick a cover spot that hides a crouched body from the player but lets it peek. */
function findCover(G, e, far = false) {
  const p = G.player;
  const M = G.map;
  const pe = playerHead(p);
  let best = null;
  let bestS = Infinity;
  const wr = e.def.weapon.range || 30;
  for (const c of M.cover) {
    if (c.taken && c.taken !== e.id) continue;
    const de = dist(c.x, c.z, e.x, e.z);
    if (de > (far ? 22 : 15)) continue;
    const dp = dist(c.x, c.z, p.x, p.z);
    if (dp < 5 || dp > wr * 0.95) continue;
    // the box must be between the spot and the player
    const toPx = p.x - c.x;
    const toPz = p.z - c.z;
    if (toPx * -c.nx + toPz * -c.nz < 0.3 * dp) continue;
    if (lineOfSight(M, p.x, pe, p.z, c.x, 0.95, c.z)) continue; // crouched body visible → bad
    let s = de * 0.6 + Math.abs(dp - wr * 0.5) * 0.5;
    if (far) s = -dp + de * 0.3;
    // keep teammates spread out
    for (const o of G.enemies) if (o !== e && o.state !== "dead" && dist(o.x, o.z, c.x, c.z) < 2.5) s += 8;
    if (s < bestS) {
      bestS = s;
      best = c;
    }
  }
  return best;
}

function releaseCover(e) {
  if (e.cover && e.cover.taken === e.id) e.cover.taken = null;
  e.cover = null;
}
function releaseToken(G, e) {
  if (e.token) {
    e.token = false;
    G.tokens = Math.max(0, G.tokens - 1);
  }
}

/** Steer along a nav path toward (tx,tz). Returns remaining distance. */
function moveTo(G, e, tx, tz, speed, dt, face = true) {
  const M = G.map;
  const d = dist(e.x, e.z, tx, tz);
  if (d < 0.35) {
    e.vx *= 0.8;
    e.vz *= 0.8;
    return d;
  }
  e.pathT -= dt;
  const goalMoved = !e.goal || dist(e.goal.x, e.goal.z, tx, tz) > 1.5;
  let wx = tx;
  let wz = tz;
  if (navClear(M, e.x, e.z, tx, tz)) {
    e.path = null;
  } else {
    if ((!e.path || goalMoved || e.pathT <= 0) && G.pathBudget > 0) {
      G.pathBudget--;
      e.path = findPath(M, e.x, e.z, tx, tz, 7000);
      e.pathI = 0;
      e.pathT = 0.9 + G.rand() * 0.4;
    }
    if (e.path && e.path.length) {
      let wp = e.path[e.pathI];
      while (wp && dist(e.x, e.z, wp.x, wp.z) < 0.6 && e.pathI < e.path.length - 1) wp = e.path[++e.pathI];
      if (wp) {
        wx = wp.x;
        wz = wp.z;
      }
    }
  }
  e.goal = { x: tx, z: tz };
  let dx = wx - e.x;
  let dz = wz - e.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  // separation
  for (const o of G.enemies) {
    if (o === e || o.state === "dead" || o.flyer) continue;
    const ox = e.x - o.x;
    const oz = e.z - o.z;
    const od = ox * ox + oz * oz;
    if (od < 1.44 && od > 1e-4) {
      const k = (1.2 - Math.sqrt(od)) * 1.5;
      dx += (ox / Math.sqrt(od)) * k;
      dz += (oz / Math.sqrt(od)) * k;
    }
  }
  const nl = Math.hypot(dx, dz) || 1;
  const sp = Math.min(speed, d * 3);
  e.vx += ((dx / nl) * sp - e.vx) * Math.min(1, dt * 8);
  e.vz += ((dz / nl) * sp - e.vz) * Math.min(1, dt * 8);
  if (face) e.yaw = approachAngle(e.yaw, yawOf(e.vx, e.vz), dt * 7);
  return d;
}

function integrate(G, e, dt) {
  e.x += e.vx * dt;
  e.z += e.vz * dt;
  if (!e.flyer) {
    collideCircle(G.map, e, e.r, e.h);
    e.y = groundHeight(G.map, e.x, e.z, e.r, e.y + 0.45);
  }
}

/* ------------------------------------------------------------ attacks */
function tryFire(G, e, dt, d) {
  const w = e.def.weapon;
  const p = G.player;
  e.fireT -= dt;
  if (e.reactT > 0) {
    e.reactT -= dt;
    return false;
  }
  if (!e.canSee || d > w.range || p.dead) {
    e.burstLeft = 0;
    return false;
  }
  if (!e.token) {
    if (G.tokens < MAX_TOKENS) {
      e.token = true;
      G.tokens++;
    } else return false;
  }
  if (e.fireT > 0) return true;
  if (e.burstLeft <= 0) e.burstLeft = w.burst || 1;
  e.burstLeft--;
  e.fireT = e.burstLeft > 0 ? 1 / w.rate : (w.burstGap || 1 / w.rate) + G.rand() * 0.4;
  if (e.burstLeft <= 0) releaseToken(G, e); // hand the token over between bursts
  G.enemyShoot(e, w);
  e.anim = "shoot";
  e.animT = 0.25;
  return true;
}

function meleeAttack(G, e, dt, d) {
  const w = e.def.weapon;
  const p = G.player;
  e.fireT -= dt;
  if (e.windup > 0) {
    e.windup -= dt;
    e.vx *= 0.85;
    e.vz *= 0.85;
    if (e.windup <= 0) {
      const ang = Math.abs(wrapAngle(yawOf(p.x - e.x, p.z - e.z) - e.yaw));
      if (dist(e.x, e.z, p.x, p.z) < w.reach + 0.5 && ang < 1.1 && Math.abs(p.y - e.y) < 1.2) G.damagePlayer(w.dmg, e, "melee");
      else G.emit({ type: "whiff", id: e.id });
      e.fireT = 1 / w.rate;
    }
    return true;
  }
  if (d < w.reach + 0.25 && e.fireT <= 0 && e.reactT <= 0 && !p.dead) {
    e.windup = w.windup || 0.4;
    e.anim = "melee";
    e.animT = e.windup + 0.25;
    G.emit({ type: "telegraph", id: e.id, kind: "melee" });
    return true;
  }
  if (e.reactT > 0) e.reactT -= dt;
  return false;
}

/* ------------------------------------------------------------ main update */
export function updateEnemy(G, e, dt) {
  if (e.state === "dead") {
    e.deadT += dt;
    return;
  }
  const def = e.def;
  const p = G.player;
  e.animT = Math.max(0, e.animT - dt);
  e.hitT = Math.max(0, e.hitT - dt);
  // shields regenerate
  if (e.maxShield > 0) {
    e.shieldDelay -= dt;
    if (e.shieldDelay <= 0) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.25 * dt);
  }
  if (e.stunT > 0) {
    e.stunT -= dt;
    e.vx *= 0.9;
    e.vz *= 0.9;
    if (e.flyer) e.y = Math.max(groundHeight(G.map, e.x, e.z, 0.5, 40) + 0.9, e.y - dt * 2);
    integrate(G, e, dt);
    e.anim = "stun";
    releaseToken(G, e);
    return;
  }
  // perception at 10 Hz
  e.seeT -= dt;
  if (e.seeT <= 0) {
    e.seeT = 0.1;
    perceive(G, e);
  }
  const d = dist(e.x, e.z, p.x, p.z);
  if (e.canSee) {
    if (e.state === "combat" || e.state === "retreat") {
      e.lastKnown = { x: p.x, z: p.z };
      e.lostT = 0;
    } else {
      const crouched = p.crouchT > 0.5;
      let rate = (0.35 + 2.2 * clamp(1 - d / def.detect, 0, 1)) * (crouched ? 0.38 * (1 - G.D.stealth) : 1) * (p.sprinting ? 1.35 : 1);
      if (d < 3 && !crouched) rate *= 3;
      e.aware = Math.min(1, e.aware + rate * dt * (G.stealthMult || 1));
      if (e.aware >= 1) {
        setAlert(G, e, p.x, p.z);
        alertAllies(G, e);
      } else if (e.aware > 0.4 && e.state !== "suspicious") {
        e.state = "suspicious";
        e.investT = 6;
        e.goal = null;
        G.emit({ type: "suspicious", id: e.id });
      }
      if (e.state === "suspicious") e.lastKnown = { x: p.x, z: p.z };
    }
  } else if (e.state !== "combat" && e.state !== "retreat") {
    e.aware = Math.max(0, e.aware - dt * 0.3);
  }

  if (e.flyer) return updateFlyer(G, e, dt, d);

  switch (e.state) {
    case "idle": {
      e.anim = "idle";
      e.vx *= 0.8;
      e.vz *= 0.8;
      e.waitT -= dt;
      if (e.waitT <= 0) {
        e.waitT = 2.5 + G.rand() * 3;
        e.lookYaw = e.home.yaw + (G.rand() - 0.5) * 1.6;
      }
      if (e.lookYaw != null) e.yaw = approachAngle(e.yaw, e.lookYaw, dt * 1.5);
      if (dist(e.x, e.z, e.home.x, e.home.z) > 1.2) {
        moveTo(G, e, e.home.x, e.home.z, def.speed, dt);
        e.anim = "walk";
      }
      break;
    }
    case "patrol": {
      const r = e.route;
      const wp = r[e.routeI % r.length];
      if (e.waitT > 0) {
        e.waitT -= dt;
        e.vx *= 0.8;
        e.vz *= 0.8;
        e.anim = "idle";
        e.yaw += Math.sin(G.time * 0.9 + e.id) * dt * 0.6;
      } else if (moveTo(G, e, wp[0], wp[1], def.speed, dt) < 0.8) {
        e.routeI = (e.routeI + 1) % r.length;
        e.waitT = 1 + G.rand() * 2;
      } else e.anim = "walk";
      break;
    }
    case "suspicious": {
      // investigate the last thing seen or heard
      e.investT -= dt;
      const g = e.lastKnown || e.goal;
      if (g && dist(e.x, e.z, g.x, g.z) > 1.5 && !e.hold) {
        moveTo(G, e, g.x, g.z, def.speed * 1.15, dt);
        e.anim = "walk";
      } else {
        e.vx *= 0.8;
        e.vz *= 0.8;
        e.anim = "idle";
        e.yaw += dt * 1.2;
        if (g) e.yaw = approachAngle(e.yaw, yawOf(g.x - e.x, g.z - e.z), dt * 2);
      }
      if (e.investT <= 0 && e.aware < 0.4) {
        e.state = e.route ? "patrol" : "return";
        e.lastKnown = null;
      }
      break;
    }
    case "combat":
      combat(G, e, dt, d);
      break;
    case "retreat": {
      if (!e.cover) {
        e.cover = findCover(G, e, true);
        if (e.cover) e.cover.taken = e.id;
        e.coverT = 4.5;
      }
      const tgt = e.cover || { x: e.x - (p.x - e.x), z: e.z - (p.z - e.z) };
      const left = moveTo(G, e, tgt.x, tgt.z, def.run, dt);
      e.anim = left > 0.6 ? "run" : "crouch";
      e.crouch = left <= 0.6;
      if (left <= 0.6) {
        e.coverT -= dt;
        e.yaw = approachAngle(e.yaw, yawOf(p.x - e.x, p.z - e.z), dt * 4);
      }
      if (e.coverT <= 0 || (!e.cover && left < 0.6)) {
        e.retreated = true;
        e.state = "combat";
        e.crouch = false;
      }
      break;
    }
    case "search": {
      e.searchT -= dt;
      if (!e.goal || dist(e.x, e.z, e.goal.x, e.goal.z) < 1 || e.waitT > 0) {
        e.waitT -= dt;
        e.anim = "idle";
        e.vx *= 0.8;
        e.vz *= 0.8;
        e.yaw += dt * 1.6;
        if (e.waitT <= 0) {
          const base = e.lastKnown || e.home;
          const pt = nearestWalkable(G.map, base.x + (G.rand() - 0.5) * 14, base.z + (G.rand() - 0.5) * 14, 4);
          e.goal = pt ? { x: pt.x, z: pt.z } : null;
          e.waitT = 1.5;
        }
      } else {
        moveTo(G, e, e.goal.x, e.goal.z, def.speed * 1.3, dt);
        e.anim = "walk";
        e.waitT = 0;
      }
      if (e.searchT <= 0) {
        e.state = "return";
        e.lastKnown = null;
        e.aware = 0;
        G.emit({ type: "lost", id: e.id });
      }
      break;
    }
    case "return": {
      const tgt = e.route ? { x: e.route[0][0], z: e.route[0][1] } : e.home;
      if (moveTo(G, e, tgt.x, tgt.z, def.speed, dt) < 1) {
        e.state = e.route ? "patrol" : "idle";
        e.routeI = 0;
        e.yaw = e.home.yaw;
      }
      e.anim = "walk";
      break;
    }
  }
  integrate(G, e, dt);
  if (e.hitT > 0 && e.anim !== "shoot") e.anim = "hit";
}

function combat(G, e, dt, d) {
  const def = e.def;
  const w = def.weapon;
  const p = G.player;
  if (!e.canSee) {
    if (!(e.cover && !e.peek)) e.lostT += dt; // hiding in cover on purpose isn't "lost"
    if (e.lostT > (e.hold ? 6 : 4.5)) {
      releaseToken(G, e);
      releaseCover(e);
      e.state = "search";
      e.searchT = 10;
      e.goal = e.lastKnown ? { ...e.lastKnown } : null;
      e.waitT = 0;
      e.crouch = false;
      return;
    }
  }
  if (def.retreatAt && !e.retreated && e.hp < e.maxHp * def.retreatAt) {
    releaseToken(G, e);
    releaseCover(e);
    e.state = "retreat";
    G.emit({ type: "retreat", id: e.id });
    return;
  }
  const lk = e.lastKnown || { x: p.x, z: p.z };
  const faceP = () => (e.yaw = approachAngle(e.yaw, yawOf(lk.x - e.x, lk.z - e.z), dt * 9));

  // ---------------------------------------------------------- melee rushers
  if (w.kind === "melee") {
    if (meleeAttack(G, e, dt, d)) {
      faceP();
      return;
    }
    // two attackers at most, the rest circle
    const close = G.enemies.filter((o) => o !== e && o.state === "combat" && o.def.weapon.kind === "melee" && dist(o.x, o.z, p.x, p.z) < 2.6).length;
    if (close >= 2 && d < 5) {
      const a = yawOf(e.x - p.x, e.z - p.z) + e.strafe * dt * 0.8;
      moveTo(G, e, p.x + Math.sin(a) * 3.6, p.z + Math.cos(a) * 3.6, def.speed * 1.6, dt, false);
      faceP();
      e.anim = "walk";
    } else {
      moveTo(G, e, lk.x, lk.z, def.run, dt);
      e.anim = "run";
      if (d < 4) faceP();
    }
    return;
  }

  // ---------------------------------------------------------- ranged
  const pref = def.heavy ? 7 : w.range * (0.4 + 0.25 * (1 - def.aggression));
  e.strafeT -= dt;
  if (e.strafeT <= 0) {
    e.strafeT = 1.5 + G.rand() * 2;
    e.strafe = -e.strafe;
  }
  // cover users take a spot, hide, peek, fire
  if (def.cover && !e.hold) {
    if (e.cover) {
      // spot compromised? (player flanked it)
      if (lineOfSight(G.map, p.x, playerHead(p), p.z, e.cover.x, 0.95, e.cover.z) && d < w.range) {
        releaseCover(e);
        e.coverCd = 2;
      }
    }
    e.coverCd = (e.coverCd || 0) - dt;
    if (!e.cover && e.coverCd <= 0) {
      e.cover = findCover(G, e);
      e.coverCd = 2.5;
      if (e.cover) e.cover.taken = e.id;
    }
    if (e.cover) {
      const left = moveTo(G, e, e.cover.x, e.cover.z, def.run, dt, dist(e.x, e.z, e.cover.x, e.cover.z) > 3);
      if (left > 0.6) {
        e.anim = "run";
        e.crouch = false;
        if (d < w.range && e.canSee) tryFire(G, e, dt, d);
        faceP();
        return;
      }
      faceP();
      e.coverT -= dt;
      if (e.coverT <= 0) {
        e.peek = !e.peek;
        e.coverT = e.peek ? 1.8 + G.rand() * 1.4 : 0.9 + G.rand() * 1.1;
        e.seeT = 0; // re-check line of sight right away from the new eye height
        e.peekBlind = 0;
      }
      e.crouch = !e.peek;
      if (e.peek) {
        tryFire(G, e, dt, d);
        if (!e.canSee) {
          e.peekBlind = (e.peekBlind || 0) + dt;
          if (e.peekBlind > 0.7) e.coverT = Math.min(e.coverT, 0.1);
        } else e.peekBlind = 0;
        if (e.animT <= 0) e.anim = "aim";
      } else {
        releaseToken(G, e);
        e.anim = "crouch";
        e.fireT = Math.max(e.fireT, 0.25);
      }
      return;
    }
  }
  e.crouch = false;
  // positioning: flankers swing around the player's side, others hold range and strafe
  let tx = lk.x;
  let tz = lk.z;
  if (def.flank && d < w.range * 1.2) {
    const pf = G.player.yaw + (Math.PI / 2) * e.flankSide;
    tx = lk.x + Math.sin(pf) * pref;
    tz = lk.z + Math.cos(pf) * pref;
    const n = nearestWalkable(G.map, tx, tz, 5);
    if (n) {
      tx = n.x;
      tz = n.z;
    }
  } else if (d < pref * 0.75 && !def.heavy) {
    // too close → back off
    const ax = e.x - lk.x;
    const az = e.z - lk.z;
    const l = Math.hypot(ax, az) || 1;
    tx = e.x + (ax / l) * 3;
    tz = e.z + (az / l) * 3;
  } else if (d < pref * 1.15 && e.canSee) {
    // in the sweet spot: strafe sideways
    const a = yawOf(lk.x - e.x, lk.z - e.z) + (Math.PI / 2) * e.strafe;
    tx = e.x + Math.sin(a) * 2;
    tz = e.z + Math.cos(a) * 2;
    if (!navClear(G.map, e.x, e.z, tx, tz)) e.strafe = -e.strafe;
  }
  const hold = e.hold && e.canSee;
  if (!hold) {
    const fast = d > w.range * 0.9 || !e.canSee;
    moveTo(G, e, tx, tz, fast ? def.run : def.speed * 1.4, dt, false);
    e.anim = fast ? "run" : "walk";
  } else {
    e.vx *= 0.8;
    e.vz *= 0.8;
    e.anim = "aim";
  }
  faceP();
  if (tryFire(G, e, dt, d) && e.animT <= 0) e.anim = "aim";
}

/* ------------------------------------------------------------ drones */
function updateFlyer(G, e, dt, d) {
  const def = e.def;
  const p = G.player;
  const M = G.map;
  let tx = e.x;
  let tz = e.z;
  let ty = e.y;
  let speed = def.speed;
  if (e.state === "combat") {
    const lk = e.lastKnown || p;
    if (!e.canSee) {
      e.lostT += dt;
      if (e.lostT > 6) {
        e.state = "return";
        e.aware = 0;
        releaseToken(G, e);
      }
    }
    // orbit the player at 9–13 m, 3–5 m up
    e.orbit = (e.orbit ?? G.rand() * 6.28) + dt * 0.55 * e.strafe;
    const R = 10 + Math.sin(G.time * 0.7 + e.id) * 2.5;
    tx = lk.x + Math.sin(e.orbit) * R;
    tz = lk.z + Math.cos(e.orbit) * R;
    ty = p.y + 3.4 + Math.sin(G.time * 1.3 + e.id) * 0.8;
    speed = def.run;
    e.yaw = approachAngle(e.yaw, yawOf(p.x - e.x, p.z - e.z), dt * 6);
    tryFire(G, e, dt, Math.hypot(d, e.y - p.y));
  } else if (e.state === "patrol" && e.route) {
    const wp = e.route[e.routeI % e.route.length];
    tx = wp[0];
    tz = wp[1];
    ty = 4.2;
    if (dist(e.x, e.z, tx, tz) < 1.2) e.routeI++;
    e.yaw = approachAngle(e.yaw, yawOf(tx - e.x, tz - e.z), dt * 3);
  } else if (e.state === "suspicious" && e.lastKnown) {
    tx = e.lastKnown.x;
    tz = e.lastKnown.z;
    ty = 4;
    e.investT -= dt;
    e.yaw = approachAngle(e.yaw, yawOf(tx - e.x, tz - e.z), dt * 3);
    if (e.investT <= 0 && e.aware < 0.4) e.state = e.route ? "patrol" : "return";
  } else {
    tx = e.home.x;
    tz = e.home.z;
    ty = 4;
    if (dist(e.x, e.z, tx, tz) < 1.5 && e.state === "return") e.state = e.route ? "patrol" : "idle";
    e.yaw += dt * 0.5;
  }
  // keep clear of rooftops / boxes underneath
  const floor = groundHeight(M, tx, tz, 0.6, 60) + 2.2;
  ty = Math.max(ty, floor);
  let dx = tx - e.x;
  let dz = tz - e.z;
  const dl = Math.hypot(dx, dz);
  if (dl > 0.01) {
    dx /= dl;
    dz /= dl;
  }
  const sp = Math.min(speed, dl * 2);
  // obstacle ahead → climb
  const ahead = raycast(M, e.x, e.y, e.z, dx, 0, dz, 2.5);
  if (ahead) ty = Math.max(ty, ahead.box.y1 + 1.5);
  e.vx += (dx * sp - e.vx) * Math.min(1, dt * 3);
  e.vz += (dz * sp - e.vz) * Math.min(1, dt * 3);
  e.x += e.vx * dt;
  e.z += e.vz * dt;
  e.y += clamp(ty - e.y, -3 * dt, 3 * dt);
  // separation between drones
  for (const o of G.enemies) {
    if (o === e || !o.flyer || o.state === "dead") continue;
    const ox = e.x - o.x;
    const oz = e.z - o.z;
    const od = Math.hypot(ox, oz);
    if (od < 2 && od > 1e-3) {
      e.x += (ox / od) * (2 - od) * dt * 2;
      e.z += (oz / od) * (2 - od) * dt * 2;
    }
  }
  // never inside a solid box
  const pos = { x: e.x, y: e.y - 0.3, z: e.z };
  collideCircle(M, pos, 0.5, 0.6, 0);
  e.x = pos.x;
  e.z = pos.z;
  e.anim = e.state === "combat" ? "attack" : "fly";
}

export function killEnemy(G, e) {
  releaseToken(G, e);
  releaseCover(e);
  e.state = "dead";
  e.deadT = 0;
  e.hp = 0;
  e.anim = "death";
  e.vx = e.vz = 0;
}
