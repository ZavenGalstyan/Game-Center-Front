/**
 * Dimension Dash — the five bosses. Each is a small state machine with
 * readable telegraphs, a weak point that is only open in specific states,
 * and damage feedback (flash + knock-back + invulnerable window).
 *
 *   drill     DRILL CRAWLER   (2.5D)  revs, charges into the wall, stuck → cockpit open;
 *                                     phase 2 adds hop + ground shockwaves
 *   scorpion  SAND SCORPION   (3D)    circles, tail slam + shockwave ring, tail core
 *                                     exposed while stuck; phase 2 fires orb fans
 *   wing      HYDRO WING      (2.5D)  hovers, bombs from above, swoops low; tired after
 *                                     a swoop (homable); releases drones to chain homing
 *   sentinel  VOLT SENTINEL   (3D)    sweeping laser + shock rings, overheats → core open
 *   core      DIMENSION CORE  (3D → 2.5D → 3D) phase 1 shield nodes, phase 2 forces
 *                                     the arena into a side plane (camera transition),
 *                                     phase 3 back to 3D, faster
 *
 * Arena: `side` arenas are a closed 2.5D zone; `3d` arenas are a disc with a
 * soft circular wall. The fight starts when Sonic enters the arena.
 */
import { isAttacking, hurtPlayer, bounce, enterSide, exitSide } from "./player.js";
import { floorBelow } from "./geom.js";
import { SCORE } from "./config.js";
import { reachGoal } from "./world.js";

const fl = {};
const NAMES = { drill: "Drill Crawler", scorpion: "Sand Scorpion", wing: "Hydro Wing", sentinel: "Volt Sentinel", core: "Dimension Core" };
const HP = { drill: 6, scorpion: 6, wing: 5, sentinel: 6, core: 8 };

export function createBoss(W, cfg) {
  const Z = cfg.zone != null ? W.zones[cfg.zone] : null;
  const c = cfg.center;
  const B = {
    kind: cfg.kind,
    name: NAMES[cfg.kind],
    objective: `Defeat the ${NAMES[cfg.kind]}`,
    active: false,
    hp: HP[cfg.kind],
    maxHp: HP[cfg.kind],
    arena: cfg.arena,
    zone: Z,
    sideZone: cfg.sideZone != null ? W.zones[cfg.sideZone] : null,
    cx: c.x,
    cy: c.y,
    cz: c.z,
    radius: cfg.radius || 22,
    x: c.x,
    y: c.y,
    z: c.z,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 0,
    state: "idle",
    t: 0,
    hurtT: 0,
    flash: 0,
    phase: 1,
    hint: "",
    defeated: false,
    deadT: 0,
    rings: [], // shockwaves
    beams: [], // lasers
    nodes: [],
    targets: [],
    dir: -1,
    lastHit: -10,
    cfg,
  };
  // the weak point (homing target); moved every step
  B.weak = { x: c.x, y: c.y, z: c.z, hy: 0, r: 1.2, homable: false, dead: false, boss: true, zone: Z ? Z.idx : undefined };
  B.targets.push(B.weak);
  if (cfg.kind === "core") {
    for (let i = 0; i < 4; i++) {
      const n = { x: c.x, y: c.y + 3, z: c.z, hy: 0, r: 1, homable: true, dead: true, node: true, a: (i / 4) * Math.PI * 2 };
      B.nodes.push(n);
      B.targets.push(n);
    }
  }
  if (cfg.kind === "wing") {
    B.drones = [];
    for (let i = 0; i < 2; i++) {
      const d = { x: c.x, y: c.y + 4, z: c.z, hy: 0, r: 0.8, homable: true, dead: true, drone: true, zone: Z ? Z.idx : undefined };
      B.drones.push(d);
      B.targets.push(d);
    }
  }
  B.onRespawn = (W2) => {
    // a respawn resets the current attack, never the boss health
    B.state = "idle";
    B.t = -1.2;
    B.rings = [];
    B.beams = [];
    W2.shots = [];
    if (B.kind === "core" && B.phase === 2 && B.sideZone && W2.player.mode !== "side") {
      W2.player.x = B.sideZone.ox + B.sideZone.fx * (B.sideZone.s0 + 6);
      W2.player.z = B.sideZone.oz + B.sideZone.fz * (B.sideZone.s0 + 6);
      enterSide(W2, W2.player, B.sideZone, "boss");
    }
  };
  placeIdle(B);
  return B;
}

function placeIdle(B) {
  if (B.arena === "side" && B.zone) {
    const Z = B.zone;
    const s = Z.s1 - 8;
    B.x = Z.ox + Z.fx * s;
    B.z = Z.oz + Z.fz * s;
    B.y = B.cy;
    if (B.kind === "wing") B.y = B.cy + 7;
  } else {
    B.x = B.cx;
    B.z = B.cz;
    B.y = B.cy + (B.kind === "core" ? 4 : 0);
  }
}

/* ------------------------------------------------------------------ helpers */
const sAlong = (Z, x, z) => (x - Z.ox) * Z.fx + (z - Z.oz) * Z.fz;
function setS(B, Z, s) {
  B.x = Z.ox + Z.fx * s;
  B.z = Z.oz + Z.fz * s;
}
function ground(W, B, x, z, y) {
  return floorBelow(W.geom, x, z, y + 4, y - 20, fl) ? fl.y : y;
}
function addRing(B, x, y, z, speed = 11, max = 20) {
  B.rings.push({ x, y, z, r: 0.5, speed, max });
}

/* ------------------------------------------------------------------ step */
export function stepBoss(W, B, dt) {
  const p = W.player;
  if (!B.active && !B.defeated) {
    let inside;
    if (B.arena === "side") inside = p.mode === "side" && p.zone === B.zone;
    else inside = Math.hypot(p.x - B.cx, p.z - B.cz) < B.radius - 3 && Math.abs(p.y - B.cy) < 6;
    if (inside) {
      B.active = true;
      B.state = "intro";
      B.t = 0;
      W.events.push({ type: "bossIntro", name: B.name });
      W.events.push({ type: "bossRoar" });
    }
    return;
  }
  if (B.defeated) {
    B.deadT += dt;
    if (B.deadT > 0.25 && Math.floor(B.deadT * 4) !== Math.floor((B.deadT - dt) * 4)) W.events.push({ type: "bossBoom", x: B.x + (Math.random() - 0.5) * 3, y: B.y + 1 + Math.random() * 2, z: B.z + (Math.random() - 0.5) * 3 });
    if (B.deadT > 2.4 && W.state === "play") {
      if (p.mode === "side" && B.kind === "core") exitSide(W, p, "boss");
      reachGoal(W);
    }
    return;
  }
  B.t += dt;
  B.hurtT = Math.max(0, B.hurtT - dt);
  B.flash = Math.max(0, B.flash - dt);
  if (p.action === "dead") return;
  // 3D arena wall
  if (B.arena !== "side" && !(B.kind === "core" && B.phase === 2)) {
    const dx = p.x - B.cx;
    const dz = p.z - B.cz;
    const d = Math.hypot(dx, dz);
    const lim = B.radius - 0.8;
    if (d > lim && Math.abs(p.y - B.cy) < 8) {
      p.x = B.cx + (dx / d) * lim;
      p.z = B.cz + (dz / d) * lim;
      const vn = (p.vx * dx + p.vz * dz) / d;
      if (vn > 0) {
        p.vx -= (dx / d) * vn;
        p.vz -= (dz / d) * vn;
      }
    }
  }
  switch (B.kind) {
    case "drill":
      drill(W, B, dt);
      break;
    case "scorpion":
      scorpion(W, B, dt);
      break;
    case "wing":
      wing(W, B, dt);
      break;
    case "sentinel":
      sentinel(W, B, dt);
      break;
    case "core":
      core(W, B, dt);
      break;
    default:
  }
  // lockable only while open and not in the post-hit invulnerable window
  B.weak.homable = !!B.weak.open && B.hurtT <= 0 && !B.defeated;
  shockwaves(W, B, dt);
  beams(W, B, dt);
  weakContact(W, B);
}

/* ------------------------------------------------------------------ damage */
function hit(W, B, how) {
  if (B.hurtT > 0 || B.defeated) return false;
  B.hp -= 1;
  B.hurtT = 1.1;
  B.flash = 0.6;
  W.score += 500;
  W.events.push({ type: "bossHit", x: B.weak.x, y: B.weak.y, z: B.weak.z, hp: B.hp, how });
  if (B.hp <= 0) {
    B.defeated = true;
    B.deadT = 0;
    B.weak.homable = false;
    B.weak.open = false;
    B.weak.dead = true;
    for (const n of B.nodes) n.dead = true;
    if (B.drones) for (const d of B.drones) d.dead = true;
    B.rings = [];
    B.beams = [];
    W.shots = [];
    W.score += SCORE.boss;
    W.events.push({ type: "bossDefeat", x: B.x, y: B.y + 1.5, z: B.z });
  }
  return true;
}

/** weak point + body contact */
function weakContact(W, B) {
  const p = W.player;
  if (B.defeated || p.action === "dead") return;
  const w = B.weak;
  const pcx = p.x;
  const pcy = p.y + 0.5;
  const pcz = p.z;
  const dw = Math.hypot(pcx - w.x, pcy - (w.y + w.hy), pcz - w.z);
  if (w.open && dw < w.r + 0.6 && isAttacking(p, W)) {
    const landed = hit(W, B, p.action);
    {
      // bounce up and away from the boss
      bounce(W, p, true);
      let ax = p.x - B.x;
      let az = p.z - B.z;
      const l = Math.hypot(ax, az) || 1;
      ax /= l;
      az /= l;
      if (p.mode === "side" && p.zone) {
        const a = ax * p.zone.fx + az * p.zone.fz >= 0 ? 1 : -1;
        ax = p.zone.fx * a;
        az = p.zone.fz * a;
      }
      p.vx = ax * 9;
      p.vz = az * 9;
      p.vy = landed ? 13 : 10;
      p.invuln = Math.max(p.invuln, 0.6);
    }
    return;
  }
  // nodes / drones are simple homing targets
  for (const n of B.nodes) {
    if (n.dead) continue;
    if (Math.hypot(pcx - n.x, pcy - n.y, pcz - n.z) < 1.5 && isAttacking(p, W)) {
      n.dead = true;
      bounce(W, p, true);
      W.score += 200;
      W.events.push({ type: "enemyDefeat", x: n.x, y: n.y, z: n.z, kind: "node", pts: 200 });
    }
  }
  if (B.drones) {
    for (const d of B.drones) {
      if (d.dead) continue;
      if (Math.hypot(pcx - d.x, pcy - d.y, pcz - d.z) < 1.3 && isAttacking(p, W)) {
        d.dead = true;
        bounce(W, p, true);
        W.score += 200;
        W.events.push({ type: "enemyDefeat", x: d.x, y: d.y, z: d.z, kind: "drone", pts: 200 });
      }
    }
  }
  // body
  const body = B.body;
  if (!body) return;
  const dx = pcx - body.x;
  const dy = pcy - body.y;
  const dz = pcz - body.z;
  if (Math.abs(dy) > body.h) return;
  if (Math.hypot(dx, dz) > body.r + 0.45) return;
  if (isAttacking(p, W) && p.vy < 0 && dy > body.h * 0.4) {
    // landed on top of an armoured part: bounce off, no damage
    bounce(W, p, false);
    W.events.push({ type: "shieldBlock", x: p.x, y: p.y, z: p.z });
    return;
  }
  hurtPlayer(W, p, body.x, body.z, "boss");
}

/* ------------------------------------------------------------------ hazards */
function shockwaves(W, B, dt) {
  const p = W.player;
  const keep = [];
  for (const r of B.rings) {
    r.r += r.speed * dt;
    if (r.r > r.max) continue;
    keep.push(r);
    const d = Math.hypot(p.x - r.x, p.z - r.z);
    if (Math.abs(d - r.r) < 0.55 && p.y < r.y + 0.65 && p.y > r.y - 1 && p.action !== "dead") hurtPlayer(W, p, r.x, r.z, "shock");
  }
  B.rings = keep;
}

function beams(W, B, dt) {
  const p = W.player;
  for (const bm of B.beams) {
    bm.t += dt;
    bm.a += bm.spin * dt;
    bm.on = bm.t > bm.warn;
    if (!bm.on) continue;
    const dx = p.x - bm.x;
    const dz = p.z - bm.z;
    const d = Math.hypot(dx, dz);
    if (d > bm.len || d < 1) continue;
    let da = Math.atan2(dx, dz) - bm.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) * d > 0.6) continue;
    if (p.y > bm.y + bm.h || p.y < bm.y - 1) continue;
    hurtPlayer(W, p, bm.x, bm.z, "laser");
  }
  B.beams = B.beams.filter((b) => b.t < b.life);
}

/* ------------------------------------------------------------------ 1. drill crawler (side) */
function drill(W, B, dt) {
  const Z = B.zone;
  const p = W.player;
  const s = sAlong(Z, B.x, B.z);
  const ps = sAlong(Z, p.x, p.z);
  const lo = Z.s0 + 4;
  const hi = Z.s1 - 4;
  B.phase = B.hp <= 3 ? 2 : 1;
  B.y = ground(W, B, B.x, B.z, B.y);
  const face = B.dir;
  B.facing = Math.atan2(Z.fx * face, Z.fz * face);
  switch (B.state) {
    case "intro":
      B.hint = "Wait for it to crash into the wall, then hit the cockpit!";
      if (B.t > 1.6) set(B, "stalk");
      break;
    case "stalk": {
      B.dir = ps > s ? 1 : -1;
      const ns = s + B.dir * 3 * dt;
      setS(B, Z, Math.max(lo, Math.min(hi, ns)));
      if (B.t > (B.phase === 2 ? 1.2 : 1.8)) set(B, B.phase === 2 && (B.alt = !B.alt) ? "hop" : "rev");
      break;
    }
    case "rev":
      B.dir = ps > s ? 1 : -1;
      if (B.t > 0.9) {
        set(B, "charge");
        W.events.push({ type: "bossRoar" });
      }
      break;
    case "charge": {
      const ns = s + B.dir * (B.phase === 2 ? 21 : 17) * dt;
      if (ns < lo - 1.5 || ns > hi + 1.5) {
        setS(B, Z, Math.max(lo - 1.5, Math.min(hi + 1.5, ns)));
        set(B, "stuck");
        W.events.push({ type: "bossSlam", x: B.x, y: B.y, z: B.z });
        if (B.phase === 2) addRing(B, B.x, B.y, B.z, 10, 26);
      } else setS(B, Z, ns);
      break;
    }
    case "stuck":
      B.hint = "Now! Jump on the cockpit!";
      if (B.t > 2.2) {
        set(B, "stalk");
        B.hint = "";
      }
      break;
    case "hop":
      if (B.t < 0.5) B.vy = 0;
      else if (!B.air) {
        B.air = true;
        B.vy = 14;
        B.dir = ps > s ? 1 : -1;
      }
      if (B.air) {
        B.vy -= 30 * dt;
        B.hopY = (B.hopY || 0) + B.vy * dt;
        setS(B, Z, Math.max(lo, Math.min(hi, s + B.dir * 7 * dt)));
        if (B.hopY <= 0) {
          B.hopY = 0;
          B.air = false;
          W.events.push({ type: "bossSlam", x: B.x, y: B.y, z: B.z });
          addRing(B, B.x, B.y, B.z, 11, 24);
          set(B, "stalk");
        }
      }
      break;
    default:
      set(B, "stalk");
  }
  const lift = B.hopY || 0;
  B.body = { x: B.x, y: B.y + 1.1 + lift, z: B.z, r: 1.7, h: 1.2 };
  // cockpit on top, open while stuck
  B.weak.x = B.x - Z.fx * B.dir * 0.4;
  B.weak.z = B.z - Z.fz * B.dir * 0.4;
  B.weak.y = B.y + 2.5 + lift;
  B.weak.open = B.state === "stuck";
  B.weak.r = 1.3;
  if (B.state === "stuck") B.body = { x: B.x, y: B.y + 0.6, z: B.z, r: 1.6, h: 0.7 };
}

/* ------------------------------------------------------------------ 2. sand scorpion (3D) */
function scorpion(W, B, dt) {
  const p = W.player;
  B.phase = B.hp <= 3 ? 2 : 1;
  B.y = B.cy;
  const toP = Math.atan2(p.x - B.x, p.z - B.z);
  switch (B.state) {
    case "intro":
      B.hint = "Dodge the tail slam, then home in on the glowing tail!";
      if (B.t > 1.6) set(B, "circle");
      break;
    case "circle": {
      // circle the arena centre, facing Sonic
      B.ang = (B.ang ?? 0) + dt * (B.phase === 2 ? 0.55 : 0.4);
      const r = B.radius * 0.45;
      B.x = B.cx + Math.sin(B.ang) * r;
      B.z = B.cz + Math.cos(B.ang) * r;
      B.facing = toP;
      if (B.phase === 2 && B.t > 1 && !B.fired) {
        B.fired = true;
        for (const k of [-0.35, 0, 0.35]) {
          const a = toP + k;
          W.shots.push({ x: B.x + Math.sin(a) * 2, y: B.y + 1.4, z: B.z + Math.cos(a) * 2, vx: Math.sin(a) * 11, vy: 0, vz: Math.cos(a) * 11, t: 0, r: 0.5, kind: "sand", id: W.shotSeq++ });
        }
        W.events.push({ type: "bossShoot" });
      }
      if (B.t > (B.phase === 2 ? 2.6 : 3.2)) {
        B.fired = false;
        set(B, "raise");
        B.tx = p.x;
        B.tz = p.z;
      }
      break;
    }
    case "raise":
      B.facing = toP;
      B.tx += (p.x - B.tx) * Math.min(1, dt * 3);
      B.tz += (p.z - B.tz) * Math.min(1, dt * 3);
      B.hint = "Tail raised — get away from the marker!";
      if (B.t > 1.0) {
        set(B, "slam");
        W.events.push({ type: "bossSlam", x: B.tx, y: B.cy, z: B.tz });
        addRing(B, B.tx, B.cy, B.tz, 9, 14);
      }
      break;
    case "slam":
      B.hint = "The tail is stuck — homing attack it!";
      if (B.t > 2.0) set(B, "circle");
      break;
    default:
      set(B, "circle");
  }
  B.body = { x: B.x, y: B.y + 1, z: B.z, r: 2.1, h: 1.1 };
  const stuck = B.state === "slam";
  // the tail tip sits over the slam point while stuck, otherwise above the body
  if (stuck || B.state === "raise") {
    const k = stuck ? 1 : Math.min(1, B.t);
    B.weak.x = B.x + (B.tx - B.x) * k * 0.85;
    B.weak.z = B.z + (B.tz - B.z) * k * 0.85;
    B.weak.y = B.cy + (stuck ? 0.9 : 5);
  } else {
    B.weak.x = B.x - Math.sin(B.facing) * 1.6;
    B.weak.z = B.z - Math.cos(B.facing) * 1.6;
    B.weak.y = B.cy + 4;
  }
  B.weak.open = stuck;
  B.weak.r = 1.1;
}

/* ------------------------------------------------------------------ 3. hydro wing (side, flying) */
function wing(W, B, dt) {
  const Z = B.zone;
  const p = W.player;
  const s = sAlong(Z, B.x, B.z);
  const ps = sAlong(Z, p.x, p.z);
  const lo = Z.s0 + 5;
  const hi = Z.s1 - 5;
  B.phase = B.hp <= 2 ? 2 : 1;
  const gy = B.cy;
  switch (B.state) {
    case "intro":
      B.hint = "Home in on the drones to reach it when it swoops low!";
      if (B.t > 1.6) set(B, "bomb");
      break;
    case "bomb": {
      // fly side to side high up dropping bombs (shadow telegraph on the ground)
      B.dir = B.dir || 1;
      const ns = s + B.dir * 7 * dt;
      if (ns > hi || ns < lo) B.dir = -B.dir;
      setS(B, Z, Math.max(lo, Math.min(hi, ns)));
      B.y += (gy + 8 - B.y) * Math.min(1, dt * 2);
      B.drop = (B.drop || 0) - dt;
      if (B.drop <= 0) {
        B.drop = B.phase === 2 ? 0.7 : 1.0;
        W.shots.push({ x: B.x, y: B.y - 1, z: B.z, vx: 0, vy: -6, vz: 0, t: 0, r: 0.5, kind: "bomb", id: W.shotSeq++, grav: 12 });
      }
      if (B.t > 5) {
        set(B, "swoopPrep");
        B.dir = ps > s ? 1 : -1;
      }
      break;
    }
    case "swoopPrep":
      B.hint = "It's diving — jump over it!";
      B.y += (gy + 9 - B.y) * Math.min(1, dt * 3);
      if (B.t > 0.9) set(B, "swoop");
      break;
    case "swoop": {
      const ns = s + B.dir * 16 * dt;
      setS(B, Z, Math.max(lo - 2, Math.min(hi + 2, ns)));
      B.y += (gy + 1.6 - B.y) * Math.min(1, dt * 4);
      if (ns > hi + 1.5 || ns < lo - 1.5) {
        set(B, "tired");
        // drones pop out as homing stepping stones
        B.drones.forEach((d, i) => {
          d.dead = false;
          const ds = s - B.dir * (5 + i * 5);
          d.x = Z.ox + Z.fx * ds;
          d.z = Z.oz + Z.fz * ds;
          d.y = gy + 3.2 + i * 1.4;
        });
      }
      break;
    }
    case "tired":
      B.hint = "It's tired — homing chain off the drones and hit it!";
      B.y += (gy + 5.5 + Math.sin(B.t * 3) * 0.3 - B.y) * Math.min(1, dt * 3);
      if (B.t > 4.2) {
        set(B, "bomb");
        for (const d of B.drones) d.dead = true;
      }
      break;
    default:
      set(B, "bomb");
  }
  for (const d of B.drones) if (!d.dead) d.y += Math.sin(B.t * 3 + d.x) * 0.002;
  B.facing = Math.atan2(Z.fx * (B.dir || 1), Z.fz * (B.dir || 1));
  B.body = { x: B.x, y: B.y, z: B.z, r: 1.8, h: 0.9 };
  B.weak.x = B.x;
  B.weak.y = B.y + 0.9;
  B.weak.z = B.z;
  B.weak.open = B.state === "tired";
  B.weak.r = 1.4;
  if (B.state === "tired") B.body = null;
}

/* ------------------------------------------------------------------ 4. volt sentinel (3D) */
function sentinel(W, B, dt) {
  const p = W.player;
  B.phase = B.hp <= 3 ? 2 : 1;
  B.x = B.cx;
  B.z = B.cz;
  B.y = B.cy;
  const toP = Math.atan2(p.x - B.x, p.z - B.z);
  switch (B.state) {
    case "intro":
      B.hint = "Jump the laser sweep — hit the core when it overheats!";
      if (B.t > 1.6) set(B, "laser");
      break;
    case "laser":
      B.facing += dt * 0.8;
      if (!B.beams.length && B.t < 0.2) {
        const n = B.phase === 2 ? 2 : 1;
        for (let i = 0; i < n; i++) B.beams.push({ x: B.cx, y: B.cy, z: B.cz, a: toP + Math.PI * 0.6 + (i * Math.PI * 2) / n, spin: B.phase === 2 ? 1.25 : 1.0, len: B.radius, h: 0.7, t: 0, warn: 0.8, life: 6.5, on: false });
      }
      if (B.t > 6.6) set(B, "rings");
      break;
    case "rings":
      B.facing = toP;
      if (Math.floor(B.t / 1.1) !== Math.floor((B.t - dt) / 1.1) && B.t < 3.5) {
        addRing(B, B.cx, B.cy, B.cz, 9, B.radius);
        W.events.push({ type: "bossSlam", x: B.cx, y: B.cy, z: B.cz });
      }
      if (B.t > 4.2) {
        set(B, "overheat");
        W.events.push({ type: "bossRoar" });
      }
      break;
    case "overheat":
      B.hint = "Overheated! Homing attack the core!";
      if (B.t > 3.2) set(B, "laser");
      break;
    default:
      set(B, "laser");
  }
  B.body = { x: B.x, y: B.y + 2, z: B.z, r: 2.2, h: 2.2 };
  B.weak.x = B.x + Math.sin(B.facing) * 1.6;
  B.weak.z = B.z + Math.cos(B.facing) * 1.6;
  B.weak.y = B.y + 2.6;
  B.weak.open = B.state === "overheat";
  B.weak.r = 1.2;
}

/* ------------------------------------------------------------------ 5. dimension core (3D → side → 3D) */
function core(W, B, dt) {
  const p = W.player;
  const want = B.hp > 5 ? 1 : B.hp > 2 ? 2 : 3;
  if (want !== B.phase) {
    // phase change: the dimension shifts (camera + controls follow the zone)
    B.phase = want;
    B.rings = [];
    B.beams = [];
    W.shots = [];
    set(B, "shift");
    W.events.push({ type: "bossPhase", text: want === 2 ? "The dimension folds into 2.5D!" : "Back to 3D — final phase!" });
    if (want === 2 && B.sideZone) {
      const Z = B.sideZone;
      const ps = Math.max(Z.s0 + 3, Math.min(Z.s1 - 3, sAlong(Z, p.x, p.z)));
      p.x = Z.ox + Z.fx * ps;
      p.z = Z.oz + Z.fz * ps;
      enterSide(W, p, Z, "boss");
      B.arena = "side";
      B.zone = Z;
    } else if (want === 3 && p.mode === "side") {
      exitSide(W, p, "boss");
      B.arena = "3d";
      B.zone = null;
    }
  }
  const toP = Math.atan2(p.x - B.x, p.z - B.z);
  B.facing = toP;
  if (B.phase === 1 || B.phase === 3) {
    const fast = B.phase === 3;
    switch (B.state) {
      case "intro":
      case "shift":
        B.hint = fast ? "Break its shields again — faster now!" : "Destroy the four shield nodes, then strike the core!";
        B.y += (B.cy + 4 - B.y) * Math.min(1, dt * 2);
        if (B.t > 1.8) {
          set(B, "guard");
          B.nodes.forEach((n) => (n.dead = false));
        }
        break;
      case "guard": {
        B.spin = (B.spin || 0) + dt * (fast ? 1.6 : 1.1);
        B.y += (B.cy + 4 - B.y) * Math.min(1, dt * 2);
        B.nodes.forEach((n, i) => {
          const a = B.spin + (i / 4) * Math.PI * 2;
          n.x = B.x + Math.sin(a) * 6;
          n.z = B.z + Math.cos(a) * 6;
          n.y = B.cy + 2.2 + Math.sin(B.t * 2 + i) * 0.6;
        });
        B.fireT = (B.fireT || 0) - dt;
        if (B.fireT <= 0) {
          B.fireT = fast ? 1.2 : 1.8;
          const sp = fast ? 13 : 11;
          const dx = p.x - B.x;
          const dy = p.y + 0.5 - B.y;
          const dz = p.z - B.z;
          const l = Math.hypot(dx, dy, dz) || 1;
          W.shots.push({ x: B.x, y: B.y, z: B.z, vx: (dx / l) * sp, vy: (dy / l) * sp, vz: (dz / l) * sp, t: 0, r: 0.5, kind: "orb", id: W.shotSeq++ });
          W.events.push({ type: "bossShoot" });
        }
        if (fast && Math.floor(B.t / 2.5) !== Math.floor((B.t - dt) / 2.5)) addRing(B, B.cx, B.cy, B.cz, 10, B.radius);
        if (B.nodes.every((n) => n.dead)) {
          set(B, "exposed");
          W.events.push({ type: "bossRoar" });
        }
        break;
      }
      case "exposed":
        B.hint = "The core is down — hit it!";
        B.y += (B.cy + 1.4 - B.y) * Math.min(1, dt * 4);
        if (B.t > 3.4) {
          set(B, "guard");
          B.nodes.forEach((n) => (n.dead = false));
        }
        break;
      default:
        set(B, "guard");
    }
  } else {
    // phase 2: side plane; the core patrols the line, fires ground waves, dips to recharge
    const Z = B.sideZone;
    const s = sAlong(Z, B.x, B.z);
    const ps = sAlong(Z, p.x, p.z);
    switch (B.state) {
      case "shift":
        B.hint = "2.5D now! Jump its energy waves and hit it when it dips.";
        if (B.t < 0.05) setS(B, Z, Z.s1 - 8);
        B.y += (B.cy + 5 - B.y) * Math.min(1, dt * 2);
        if (B.t > 1.8) set(B, "waves");
        break;
      case "waves":
        B.dir = B.dir || -1;
        setS(B, Z, Math.max(Z.s0 + 5, Math.min(Z.s1 - 5, s + B.dir * 5 * dt)));
        if (s < Z.s0 + 5.5) B.dir = 1;
        if (s > Z.s1 - 5.5) B.dir = -1;
        B.y += (B.cy + 5 - B.y) * Math.min(1, dt * 2);
        if (Math.floor(B.t / 1.4) !== Math.floor((B.t - dt) / 1.4)) {
          const g = ground(W, B, p.x, p.z, B.cy);
          addRing(B, B.x, g, B.z, 10, 30);
          W.events.push({ type: "bossSlam", x: B.x, y: g, z: B.z });
        }
        if (B.t > 5.5) set(B, "dip");
        break;
      case "dip":
        B.hint = "It dipped — hit the core!";
        B.y += (B.cy + 1.6 - B.y) * Math.min(1, dt * 4);
        if (B.t > 3) set(B, "waves");
        break;
      default:
        set(B, "waves");
    }
    void ps;
  }
  B.body = B.state === "exposed" || B.state === "dip" ? null : { x: B.x, y: B.y, z: B.z, r: 1.5, h: 1.5 };
  B.weak.x = B.x;
  B.weak.y = B.y;
  B.weak.z = B.z;
  B.weak.r = 1.5;
  B.weak.zone = B.phase === 2 && B.sideZone ? B.sideZone.idx : undefined;
  B.weak.open = B.state === "exposed" || B.state === "dip";
  for (const n of B.nodes) n.homable = !n.dead;
}

function set(B, st) {
  B.state = st;
  B.t = 0;
}

/* ------------------------------------------------------------------ bot policy (headless verification) */

/**
 * Per-boss steering for the route bot: mutate `inp` (mx/my/camYaw/jump/attack).
 * Returns true when it took over the input.
 */
export function bossBot(W, B, inp, bot) {
  const p = W.player;
  if (!B || !B.active || B.defeated || p.action === "dead") return false;
  const side = p.mode === "side" && p.zone;
  const goTo = (x, z, stop = 0.8) => {
    const dx = x - p.x;
    const dz = z - p.z;
    if (side) {
      const a = dx * p.zone.fx + dz * p.zone.fz;
      inp.mx = Math.abs(a) < stop ? 0 : Math.sign(a);
    } else if (Math.hypot(dx, dz) > stop) {
      inp.camYaw = Math.atan2(dx, dz);
      inp.my = 1;
    }
    return Math.hypot(dx, dz);
  };
  const away = (x, z, want = 9) => {
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.hypot(dx, dz) || 1;
    if (side) {
      const a = dx * p.zone.fx + dz * p.zone.fz;
      const Z = p.zone;
      const s = sAlong(Z, p.x, p.z);
      let dir = a >= 0 ? 1 : -1;
      // cornered: run under / past instead
      if ((dir > 0 && s > Z.s1 - 3) || (dir < 0 && s < Z.s0 + 3)) dir = -dir;
      inp.mx = Math.abs(a) < want ? dir : 0;
    } else if (d < want) {
      // circle-strafe away from the boss inside the arena
      let tx = p.x + (dx / d) * 5;
      let tz = p.z + (dz / d) * 5;
      const rr = Math.hypot(tx - B.cx, tz - B.cz);
      if (rr > B.radius - 3) {
        tx = p.x - (dz / d) * 6;
        tz = p.z + (dx / d) * 6;
      }
      inp.camYaw = Math.atan2(tx - p.x, tz - p.z);
      inp.my = 1;
    }
  };
  // jump shockwaves that are about to reach us
  for (const r of B.rings) {
    const d = Math.hypot(p.x - r.x, p.z - r.z);
    if (d - r.r > 0 && d - r.r < 2.4 && p.grounded) {
      inp.jump = true;
      bot.holdJump = 0.3;
    }
  }
  for (const bm of B.beams) {
    if (!bm.on || !p.grounded) continue;
    const a = Math.atan2(p.x - bm.x, p.z - bm.z);
    let da = a - bm.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const d = Math.hypot(p.x - bm.x, p.z - bm.z);
    if (da > 0 && da * d < 2.2 + bm.spin * 0.4) {
      inp.jump = true;
      bot.holdJump = 0.3;
    }
  }
  // dodge incoming shots by jumping
  for (const s of W.shots) {
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d < 4 && p.grounded && s.y < p.y + 2) {
      inp.jump = true;
      bot.holdJump = 0.25;
    }
  }
  const w = B.weak;
  const lockable = (t) => p.lock === t;
  switch (B.kind) {
    case "drill": {
      if (B.state === "stuck") {
        const d = goTo(w.x, w.z, 0.5);
        if (d < 3.6 && p.grounded) {
          inp.jump = true;
          bot.holdJump = 0.4;
        }
        if (!p.grounded && (lockable(w) || p.lock)) inp.attack = true;
      } else if (B.state === "charge" || B.state === "rev") {
        // jump over the charge when it gets close
        const d = Math.hypot(p.x - B.x, p.z - B.z);
        const toward = (p.x - B.x) * Math.sin(B.facing) + (p.z - B.z) * Math.cos(B.facing) > 0;
        if (B.state === "charge" && toward && d < 6 && p.grounded) {
          inp.jump = true;
          bot.holdJump = 0.45;
        }
        if (B.state === "rev") away(B.x, B.z, 30);
      } else if (B.state === "hop") away(B.x, B.z, 12);
      else away(B.x, B.z, 7);
      return true;
    }
    case "scorpion": {
      if (B.state === "slam") {
        const d = goTo(w.x, w.z, 1.5);
        if (d < 7 && p.grounded) {
          inp.jump = true;
          bot.holdJump = 0.35;
        }
        if (!p.grounded && p.lock) inp.attack = true;
      } else if (B.state === "raise") away(B.tx, B.tz, 9);
      else away(B.x, B.z, 9);
      return true;
    }
    case "wing": {
      if (B.state === "tired") {
        const target = B.drones.find((d) => !d.dead) || w;
        const d = goTo(target.x, target.z, 1.5);
        if (d < 6 && p.grounded) {
          inp.jump = true;
          bot.holdJump = 0.4;
        }
        if (!p.grounded && p.lock) inp.attack = true;
      } else if (B.state === "swoop" || B.state === "swoopPrep") {
        const d = Math.hypot(p.x - B.x, p.z - B.z);
        if (B.state === "swoop" && d < 5 && p.grounded) {
          inp.jump = true;
          bot.holdJump = 0.45;
        }
      } else {
        // keep moving under the bomber so bombs land behind us
        const Z = p.zone;
        const s = sAlong(Z, p.x, p.z);
        bot.wdir = bot.wdir || 1;
        if (s > Z.s1 - 4) bot.wdir = -1;
        if (s < Z.s0 + 4) bot.wdir = 1;
        inp.mx = bot.wdir;
      }
      return true;
    }
    case "sentinel": {
      if (B.state === "overheat") {
        const d = goTo(w.x, w.z, 1.2);
        if (d < 6 && p.grounded) {
          inp.jump = true;
          bot.holdJump = 0.4;
        }
        if (!p.grounded && p.lock) inp.attack = true;
      } else away(B.x, B.z, 10);
      return true;
    }
    case "core": {
      const node = B.nodes.find((n) => !n.dead);
      if ((B.state === "guard") && node) {
        const d = goTo(node.x, node.z, 1);
        if (d < 5 && p.grounded) {
          inp.jump = true;
          bot.holdJump = 0.4;
        }
        if (!p.grounded && p.lock) inp.attack = true;
      } else if (B.state === "exposed" || B.state === "dip") {
        const d = goTo(w.x, w.z, 1);
        if (d < 5 && p.grounded) {
          inp.jump = true;
          bot.holdJump = 0.4;
        }
        if (!p.grounded && p.lock) inp.attack = true;
      } else away(B.x, B.z, 7);
      return true;
    }
    default:
      return false;
  }
}
