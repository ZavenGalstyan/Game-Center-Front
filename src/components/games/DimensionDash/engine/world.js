/**
 * Dimension Dash — one level session: geometry, entities and the fixed-step
 * simulation. Pure JS (no DOM / three) so tools/simTest.mjs can play every
 * level headlessly with the bot.
 *
 *   createWorld(level)       fresh session from builder data
 *   advance(W, inp, dt)      accumulates real time into fixed STEPs
 *   step(W, inp, dt)         one fixed step
 *   restartWorld(W)          full restart in place
 *   continueFromCheckpoint   after a game over
 *
 * W.events is drained by the renderer each frame (sounds, particles, camera,
 * HUD toasts). W.state: play → goal (victory pose) → complete | gameover.
 */
import { STEP, MAX_STEPS, POWER, POWER_IDS, SCORE, START_LIVES, P } from "./config.js";
import { buildGeom } from "./builder.js";
import { floorBelow, stepDynamic, blocked } from "./geom.js";
import { makeCurve } from "./curve.js";
import { createPlayer, stepPlayer, pickTarget, hurtPlayer, killPlayer, launch, boostAlong, tryRide, tryRail, enterSide, exitSide, isAttacking, bounce, leaveCurve } from "./player.js";
import { createEnemies, stepEnemies } from "./enemies.js";
import { createBoss, stepBoss } from "./bosses.js";
import { createCamera } from "./camera.js";

const fl = {};

export function createWorld(level) {
  const W = { level };
  reset(W, true);
  return W;
}

function reset(W, full) {
  const L = W.level;
  W.geom = buildGeom(L);
  W.zones = L.zones;
  W.rides = L.rides.map((r) => ({ ...r, curve: makeCurve(r.pts, r.ups), radius: r.radius || estimateRadius(r) }));
  W.rails = L.rails.map((r) => {
    const curve = makeCurve(r.pts);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of r.pts) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
      z0 = Math.min(z0, p[2]);
      z1 = Math.max(z1, p[2]);
    }
    return { curve, box: { x0: x0 - 1.5, x1: x1 + 1.5, y0, y1, z0: z0 - 1.5, z1: z1 + 1.5 } };
  });
  // rings: flat arrays + alive flags
  const n = L.rings.length;
  W.ringPos = new Float32Array(n * 3);
  W.ringAlive = new Uint8Array(n).fill(1);
  W.ringMag = new Uint8Array(n);
  W.ringCells = new Map();
  for (let i = 0; i < n; i++) {
    const [x, y, z] = L.rings[i];
    W.ringPos[i * 3] = x;
    W.ringPos[i * 3 + 1] = y;
    W.ringPos[i * 3 + 2] = z;
    const k = cellKey(x, z);
    let c = W.ringCells.get(k);
    if (!c) W.ringCells.set(k, (c = []));
    c.push(i);
  }
  W.ringTotal = n;
  W.loose = []; // scattered rings
  W.monitors = L.monitors.map((m) => ({ ...m, dead: false, homable: true, hy: 0.55, r: 0.6, kind: m.kind, monitor: true }));
  W.springs = L.springs.map((s) => ({ ...s, cd: 0, squash: 0 }));
  W.boosts = L.boosts.map((b) => ({ ...b, cd: 0, fx: Math.sin(b.h), fz: Math.cos(b.h) }));
  W.dashRings = L.dashRings.map((d) => ({ ...d, cd: 0 }));
  W.checkpoints = L.checkpoints.map((c, i) => ({ ...c, idx: i, on: false }));
  W.redStars = L.redStars.map((s, i) => ({ ...s, idx: i, got: false }));
  W.spikes = L.spikes.map((s) => ({ ...s, fx: Math.sin(s.h), fz: Math.cos(s.h) }));
  W.lasers = L.lasers.map((l) => ({ ...l, fx: Math.sin(l.h), fz: Math.cos(l.h), lit: false }));
  W.switches = L.switches.map((s) => ({ ...s, pressed: false }));
  W.gates = L.gates.map((g) => ({ ...g, open: false, geo: W.geom.boxes.find((b) => b.src === L.boxes[g.box]) }));
  W.goal = L.goal ? { ...L.goal, hit: false } : null;
  W.shots = [];
  W.shotSeq = 1;
  W.enemies = createEnemies(W, L.enemies);
  W.boss = L.boss ? createBoss(W, L.boss) : null;
  W.targets = [...W.enemies, ...W.monitors];
  if (W.boss) W.targets.push(...W.boss.targets);

  const sp = L.spawn;
  W.player = createPlayer(sp);
  W.player.facing = sp.h;
  W.events = [];
  W.t = 0;
  W.acc = 0;
  W.time = 0;
  W.state = "play";
  W.stateT = 0;
  W.rings = 0;
  W.score = 0;
  W.chain = 0;
  W.lives = START_LIVES;
  W.power = { speed: 0, magnet: 0, shield: 0, invincible: 0, jump: 0 };
  W.ringsTotalGot = 0;
  W.stats = { jumps: 0, enemies: 0, rings: 0, hits: 0, deaths: 0, falls: 0, homing: 0, grinds: 0, spinDashes: 0, loops: 0, redStars: 0, monitors: 0, topSpeed: 0, distance: 0, shifts: 0 };
  W.checkpoint = { idx: -1, x: sp.x, y: sp.y, z: sp.z, h: sp.h, mode: sp.mode, zone: sp.zone ?? null, time: 0 };
  W.prompt = null;
  W.losBlocked = (ax, ay, az, bx, by, bz) => blocked(W.geom, ax, ay, az, bx, by, bz);
  W.floorQuery = (x, y, z, o) => (floorBelow(W.geom, x, z, y + 0.3, y - 40, o) ? o.y : NaN);
  W.restart = () => restartWorld(W);
  W.scatterRings = (k) => scatter(W, k);
  W.cam = W.cam && !full ? W.cam : createCamera();
  W.zoneBlend = 0;
  // start inside a side zone?
  if (sp.mode === "side" && sp.zone != null) {
    const p = W.player;
    p.mode = "side";
    p.zone = W.zones[sp.zone];
    p.sideSign = 1;
    // never spawn against a closed zone end
    const Z = p.zone;
    const a = (p.x - Z.ox) * Z.fx + (p.z - Z.oz) * Z.fz;
    if (!Z.openStart && a < Z.s0 + 2) {
      p.x += Z.fx * (Z.s0 + 2 - a);
      p.z += Z.fz * (Z.s0 + 2 - a);
    }
  }
  settle(W);
  W.cam.mode = W.player.mode === "side" ? "side" : "third";
  W.cam.snap = true;
  W.cam.yaw = sp.h;
}

function estimateRadius(r) {
  if (r.kind === "loop" || r.kind === "half") {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of r.pts) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
    return Math.max(2, (hi - lo) / 2);
  }
  return 4;
}

const cellKey = (x, z) => (Math.floor(x / 4) + 8192) * 16384 + (Math.floor(z / 4) + 8192);

function settle(W) {
  const p = W.player;
  if (floorBelow(W.geom, p.x, p.z, p.y + 1.5, p.y - 4, fl)) {
    p.y = fl.y;
    p.grounded = true;
    p.floor = fl.src;
    p.nx = fl.nx;
    p.ny = fl.ny;
    p.nz = fl.nz;
  } else {
    p.grounded = false;
  }
}

export function restartWorld(W) {
  const cam = W.cam;
  reset(W, false);
  W.cam = cam;
  W.cam.mode = W.player.mode === "side" ? "side" : "third";
  W.cam.snap = true;
  W.cam.yaw = W.level.spawn.h;
  W.events.push({ type: "restart" });
}

/** pause-menu "back to checkpoint" (when stuck): free, keeps lives and time */
export function toCheckpoint(W) {
  if (W.state !== "play") return;
  respawn(W);
}

export function continueFromCheckpoint(W) {
  W.lives = START_LIVES;
  W.state = "play";
  W.stats.continues = (W.stats.continues || 0) + 1;
  respawn(W);
}

/* ------------------------------------------------------------------ stepping */

export function advance(W, inp, dt) {
  W.acc = Math.min(W.acc + dt, STEP * MAX_STEPS);
  let first = true;
  while (W.acc >= STEP) {
    W.acc -= STEP;
    step(W, first ? inp : { ...inp, jump: false, attack: false, interact: false, leftE: false, rightE: false }, STEP);
    first = false;
  }
}

export function step(W, inp, dt) {
  W.lastInput = inp;
  W.t += dt;
  W.stateT += dt;
  const p = W.player;
  if (W.state === "complete" || W.state === "gameover") return;
  if (W.state === "play") W.time += dt;
  if (W.state === "goal" && W.stateT > 2.6) {
    W.state = "complete";
    W.events.push({ type: "complete" });
    return;
  }

  stepDynamic(W.geom, W.t, dt);

  // power-ups
  for (const k of POWER_IDS) {
    if (k === "shield") continue;
    if (W.power[k] > 0) {
      W.power[k] = Math.max(0, W.power[k] - dt);
      if (W.power[k] === 0) W.events.push({ type: "powerEnd", power: k });
    }
  }

  const ox = p.x;
  const oy = p.y;
  const oz = p.z;
  const wasGrounded = p.grounded;
  const input = W.state === "play" ? inp : { mx: 0, my: 0, camYaw: inp.camYaw };
  stepPlayer(W, input, dt);
  if (p.grounded && !wasGrounded) W.chain = 0;
  if (p.action === "dead") {
    if (p.deadT > 1.7) afterDeath(W);
    return;
  }
  p.lastX = ox;
  p.lastZ = oz;

  // mode zones
  zones(W, ox, oz);
  // loops / rails
  if (p.mode === "side" || p.mode === "free") {
    if (!tryRide(W, p, ox, oy, oz)) tryRail(W, p);
    if (p.mode === "ride") W.stats.loops++;
  }

  pickTarget(W, p);
  items(W, dt, ox, oy, oz);
  stepEnemies(W, dt);
  if (W.boss) stepBoss(W, W.boss, dt);
  looseRings(W, dt);
  hazards(W, dt);

  const sp = Math.hypot(p.vx, p.vy, p.vz);
  if (sp > W.stats.topSpeed) W.stats.topSpeed = sp;
  W.stats.distance += Math.hypot(p.x - ox, p.z - oz);

  // falling out of the world
  if (p.y < W.level.killY && p.action !== "dead") {
    hurtPlayer(W, p, p.x, p.z, "fall");
  }
}

/* ------------------------------------------------------------------ zones (2.5D ⇄ 3D) */

function zones(W, ox, oz) {
  const p = W.player;
  if (p.mode === "side") {
    const Z = p.zone;
    const a = (p.x - Z.ox) * Z.fx + (p.z - Z.oz) * Z.fz;
    if ((Z.openEnd && a > Z.s1) || (Z.openStart && a < Z.s0)) {
      exitSide(W, p);
      W.stats.shifts++;
    }
    return;
  }
  if (p.mode !== "free") return;
  for (const Z of W.zones) {
    if (Z.dormant) continue; // only a boss can switch a dormant zone on
    const a0 = (ox - Z.ox) * Z.fx + (oz - Z.oz) * Z.fz;
    const a1 = (p.x - Z.ox) * Z.fx + (p.z - Z.oz) * Z.fz;
    const d = (p.x - Z.ox) * Z.nx + (p.z - Z.oz) * Z.nz;
    if (Math.abs(d) > Z.dh + 1.6) continue;
    if (p.y < Z.oy + (Z.hMin ?? 0) - 6 || p.y > Z.oy + (Z.hMax ?? 0) + 7) continue;
    const inside = a1 >= Z.s0 && a1 <= Z.s1;
    if (!inside) continue;
    // the ground under the player must be this section's (roads may pass above / below it)
    const under = floorBelow(W.geom, p.x, p.z, p.y + 1, p.y - 8, fl) ? fl.src : null;
    if (under ? under.zone !== Z.idx : Math.abs(p.y - (Z.oy + (Z.hMax ?? 0))) > 3) continue;
    const crossed = (Z.openStart && a0 < Z.s0) || (Z.openEnd && a0 > Z.s1);
    const onIt = p.grounded && p.floor && p.floor.zone === Z.idx && Math.abs(d) <= Z.dh;
    if (crossed || onIt) {
      enterSide(W, p, Z);
      W.stats.shifts++;
      return;
    }
  }
}

/* ------------------------------------------------------------------ pickups + triggers */

function items(W, dt, ox, oy, oz) {
  const p = W.player;
  const px = p.x;
  const py = p.y + 0.6;
  const pz = p.z;
  // rings (with magnet pull)
  const mag = W.power.magnet > 0;
  const R = mag ? 7.5 : 1.25;
  const cx = Math.floor(px / 4);
  const cz = Math.floor(pz / 4);
  const span = mag ? 2 : 1;
  for (let ix = cx - span; ix <= cx + span; ix++) {
    for (let iz = cz - span; iz <= cz + span; iz++) {
      const c = W.ringCells.get((ix + 8192) * 16384 + (iz + 8192));
      if (!c) continue;
      for (const i of c) {
        if (!W.ringAlive[i]) continue;
        const rx = W.ringPos[i * 3];
        const ry = W.ringPos[i * 3 + 1];
        const rz = W.ringPos[i * 3 + 2];
        const d = Math.hypot(rx - px, ry - py, rz - pz);
        // swept test so fast runs never skip rings
        const sd = segDist(ox, oy + 0.6, oz, px, py, pz, rx, ry, rz);
        if (sd < 1.25) {
          W.ringAlive[i] = 0;
          gainRing(W, 1, rx, ry, rz);
        } else if (mag && d < R) W.ringMag[i] = 1;
      }
    }
  }
  if (mag) {
    for (let i = 0; i < W.ringTotal; i++) {
      if (!W.ringMag[i] || !W.ringAlive[i]) continue;
      const k = i * 3;
      const dx = px - W.ringPos[k];
      const dy = py - W.ringPos[k + 1];
      const dz = pz - W.ringPos[k + 2];
      const d = Math.hypot(dx, dy, dz) || 1;
      const s = Math.min(d, (18 + Math.hypot(p.vx, p.vz)) * dt);
      W.ringPos[k] += (dx / d) * s;
      W.ringPos[k + 1] += (dy / d) * s;
      W.ringPos[k + 2] += (dz / d) * s;
      if (d < 1.2) {
        W.ringAlive[i] = 0;
        gainRing(W, 1, W.ringPos[k], W.ringPos[k + 1], W.ringPos[k + 2]);
      }
    }
  }

  // monitors
  for (const m of W.monitors) {
    if (m.dead) continue;
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const dy = p.y - m.y;
    const hd = Math.hypot(dx, dz);
    if (hd > 1.15 || dy > 1.6 || dy < -1.2) continue;
    if (isAttacking(W.player, W) || (p.vy < -2 && dy > 0.6)) {
      breakMonitor(W, m);
      if (!p.grounded) bounce(W, p, p.action === "homing");
    } else if (hd > 0.01) {
      // solid-ish: push out sideways
      const k = (1.15 - hd) / hd;
      p.x += dx * k;
      p.z += dz * k;
      const vn = (p.vx * dx + p.vz * dz) / hd;
      if (vn < 0) {
        p.vx -= (dx / hd) * vn;
        p.vz -= (dz / hd) * vn;
      }
    }
  }

  // springs
  for (const s of W.springs) {
    s.cd = Math.max(0, s.cd - dt);
    s.squash = Math.max(0, s.squash - dt * 3);
    if (s.cd > 0 || p.mode === "rail") continue;
    const hd = Math.hypot(p.x - s.x, p.z - s.z);
    const dy = p.y - s.y;
    if (hd < 1.0 && dy > -0.4 && dy < 1.0 && (p.vy <= 2 || p.grounded)) {
      s.cd = 0.4;
      s.squash = 1;
      let vx = s.vx ?? 0;
      let vz = s.vz ?? 0;
      if (s.vf != null) {
        vx = Math.sin(s.h) * s.vf;
        vz = Math.cos(s.h) * s.vf;
      }
      if (Math.abs(s.vf ?? 0) < 0.01 && s.vx == null) {
        // a straight-up spring keeps some forward motion so it feels alive
        vx = p.vx * 0.35;
        vz = p.vz * 0.35;
      }
      p.y = s.y + 0.3;
      launch(W, p, vx, s.vy, vz, s.lock, "spring");
      W.chain = 0;
    }
  }

  // boost pads
  for (const b of W.boosts) {
    b.cd = Math.max(0, b.cd - dt);
    if (b.cd > 0) continue;
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const f = dx * b.fx + dz * b.fz;
    const r = dx * -b.fz + dz * b.fx;
    if (Math.abs(f) > b.l / 2 + 0.6 || Math.abs(r) > b.w / 2 + 0.3) continue;
    if (p.y - b.y > 0.9 || p.y - b.y < -0.6) continue;
    if (p.mode === "rail") continue;
    b.cd = 0.3;
    boostAlong(W, p, b.h, b.speed);
  }

  // dash rings (mid-air hoops)
  for (const d of W.dashRings) {
    d.cd = Math.max(0, d.cd - dt);
    if (d.cd > 0) continue;
    if (segDist(ox, oy + 0.5, oz, p.x, p.y + 0.5, p.z, d.x, d.y, d.z) > 2.2) continue;
    d.cd = 0.6;
    let vx = d.vx ?? Math.sin(d.h) * d.vf;
    let vz = d.vz ?? Math.cos(d.h) * d.vf;
    p.x = d.x;
    p.y = d.y - 0.5;
    p.z = d.z;
    launch(W, p, vx, d.vy, vz, d.lock, "dashRing");
  }

  // checkpoints
  for (const c of W.checkpoints) {
    if (c.on) continue;
    if (Math.hypot(p.x - c.x, p.z - c.z) < 1.8 && Math.abs(p.y - c.y) < 3) {
      c.on = true;
      if (c.idx > W.checkpoint.idx) {
        const zoneIdx = p.mode === "side" && p.zone ? p.zone.idx : c.mode === "side" ? c.zone : null;
        W.checkpoint = { idx: c.idx, x: c.x, y: c.y, z: c.z, h: p.mode === "side" && p.zone ? (p.sideSign > 0 ? p.zone.h : p.zone.h + Math.PI) : c.h, mode: zoneIdx != null ? "side" : "free", zone: zoneIdx, time: W.time, sideSign: p.sideSign };
      }
      W.score += 100;
      W.events.push({ type: "checkpoint", x: c.x, y: c.y, z: c.z });
    }
  }

  // red star rings (hidden collectibles)
  for (const s of W.redStars) {
    if (s.got) continue;
    if (segDist(ox, oy + 0.6, oz, px, py, pz, s.x, s.y, s.z) < 1.5) {
      s.got = true;
      W.stats.redStars++;
      W.score += SCORE.redStar;
      W.events.push({ type: "redStar", x: s.x, y: s.y, z: s.z, n: W.stats.redStars });
    }
  }

  // switches (E)
  W.prompt = null;
  for (const s of W.switches) {
    if (s.pressed) continue;
    if (Math.hypot(p.x - s.x, p.z - s.z) < 2.2 && Math.abs(p.y - s.y) < 2) {
      W.prompt = { kind: "switch", label: "Press E to open the gate" };
      if (W.lastInput && W.lastInput.interact) {
        s.pressed = true;
        const g = W.gates[s.gate];
        if (g) {
          g.open = true;
          if (g.geo) g.geo.on = false;
        }
        W.events.push({ type: "switch", x: s.x, y: s.y, z: s.z });
      }
    }
  }

  // goal
  const g = W.goal;
  if (g && !g.hit && W.state === "play" && !W.boss) {
    if (Math.hypot(p.x - g.x, p.z - g.z) < 2.6 && p.y > g.y - 1.5 && p.y < g.y + 5) reachGoal(W);
  }
}

export function reachGoal(W) {
  const p = W.player;
  if (W.goal) W.goal.hit = true;
  W.state = "goal";
  W.stateT = 0;
  if (p.mode === "ride" || p.mode === "rail") leaveCurve(W, p, 0.3);
  p.action = "victory";
  W.events.push({ type: "goal" });
}

function segDist(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + dx * t - px, ay + dy * t - py, az + dz * t - pz);
}

function gainRing(W, n, x, y, z) {
  const before = W.rings;
  W.rings += n;
  W.ringsTotalGot += n;
  W.stats.rings += n;
  W.score += SCORE.ring * n;
  W.events.push({ type: "ring", x, y, z });
  if (Math.floor(before / 100) < Math.floor(W.rings / 100)) {
    W.lives++;
    W.events.push({ type: "oneUp" });
  }
}

function breakMonitor(W, m) {
  m.dead = true;
  W.stats.monitors++;
  W.score += SCORE.monitor;
  const p = W.player;
  switch (m.kind) {
    case "rings":
      gainRing(W, 10, m.x, m.y + 1, m.z);
      break;
    case "life":
      W.lives++;
      W.events.push({ type: "oneUp" });
      break;
    case "shield":
      W.power.shield = 1;
      break;
    default:
      if (POWER[m.kind]) W.power[m.kind] = POWER[m.kind].time;
  }
  void p;
  W.events.push({ type: "monitor", kind: m.kind, x: m.x, y: m.y, z: m.z });
}

/* ------------------------------------------------------------------ hazards */

function hazards(W, dt) {
  const p = W.player;
  if (p.action === "dead") return;
  for (const s of W.spikes) {
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const f = dx * s.fx + dz * s.fz;
    const r = dx * -s.fz + dz * s.fx;
    if (Math.abs(f) > s.w / 2 + 0.25 || Math.abs(r) > 1.4) continue;
    const dy = p.y - s.y;
    if (dy < -0.4 || dy > 0.75) continue;
    if (hurtPlayer(W, p, s.x - s.fx * Math.sign(f || 1), s.z - s.fz * Math.sign(f || 1), "spikes")) {
      p.vy = Math.max(p.vy, 9);
      p.grounded = false;
    }
  }
  for (const l of W.lasers) {
    const ph = (W.t + l.phase) % (l.on + l.off);
    const lit = ph < l.on;
    if (lit !== l.lit) {
      l.lit = lit;
      if (lit && Math.hypot(p.x - l.x, p.z - l.z) < 30) W.events.push({ type: "laser", on: true });
    }
    l.warn = !lit && ph > l.on + l.off - 0.45; // flicker before turning on
    if (!lit) continue;
    const dx = p.x - l.x;
    const dz = p.z - l.z;
    const f = dx * l.fx + dz * l.fz;
    const r = dx * -l.fz + dz * l.fx;
    if (Math.abs(f) > 0.45 || Math.abs(r) > l.w / 2) continue;
    const dy = p.y - l.y;
    if (dy > l.hgt + 0.1 || dy < -1.2) continue;
    hurtPlayer(W, p, p.x - l.fx * Math.sign(p.vx * l.fx + p.vz * l.fz || 1), p.z - l.fz * Math.sign(p.vx * l.fx + p.vz * l.fz || 1), "laser");
  }
}

/* ------------------------------------------------------------------ scattered rings */

function scatter(W, k) {
  const p = W.player;
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + (i % 2) * 0.3;
    const sp = 5 + (i % 3) * 2.2;
    let vx = Math.cos(a) * sp;
    let vz = Math.sin(a) * sp;
    if (p.mode === "side" && p.zone) {
      const c = Math.cos(a) * sp;
      vx = p.zone.fx * c;
      vz = p.zone.fz * c;
    }
    W.loose.push({ x: p.x, y: p.y + 0.9, z: p.z, vx, vy: 7 + (i % 4) * 1.6, vz, t: 0, id: (W.looseSeq = (W.looseSeq || 0) + 1) });
  }
}

function looseRings(W, dt) {
  if (!W.loose.length) return;
  const p = W.player;
  const keep = [];
  for (const r of W.loose) {
    r.t += dt;
    r.vy -= 30 * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.z += r.vz * dt;
    if (r.vy < 0 && floorBelow(W.geom, r.x, r.z, r.y + 0.3, r.y - 0.1, fl)) {
      r.y = fl.y + 0.1;
      r.vy = Math.abs(r.vy) * 0.6;
      r.vx *= 0.8;
      r.vz *= 0.8;
    }
    if (r.t > 0.55 && p.action !== "dead" && Math.hypot(p.x - r.x, p.y + 0.6 - r.y, p.z - r.z) < 1.4) {
      gainRing(W, 1, r.x, r.y, r.z);
      continue;
    }
    if (r.t < 4.2 && r.y > W.level.killY) keep.push(r);
  }
  W.loose = keep;
}

/* ------------------------------------------------------------------ death / respawn */

function afterDeath(W) {
  W.lives -= 1;
  if (W.lives <= 0) {
    W.lives = 0;
    W.state = "gameover";
    W.events.push({ type: "gameover" });
    return;
  }
  respawn(W);
}

function respawn(W) {
  const c = W.checkpoint;
  const p = W.player;
  const keepFacing = c.h;
  const fresh = createPlayer({ x: c.x, y: c.y, z: c.z, h: keepFacing });
  Object.assign(p, fresh);
  p.facing = keepFacing;
  p.invuln = 1.5;
  if (c.mode === "side" && c.zone != null) {
    p.mode = "side";
    p.zone = W.zones[c.zone];
    p.sideSign = c.sideSign || 1;
  }
  settle(W);
  W.rings = 0;
  W.chain = 0;
  W.loose = [];
  W.shots = [];
  W.power = { speed: 0, magnet: 0, shield: 0, invincible: 0, jump: 0 };
  // crumbling planks are whole again after a respawn
  for (const b of W.geom.dyn) {
    if (!b.crumble) continue;
    b.crumble.state = "idle";
    b.crumble.t = 0;
    b.x = b.bx;
    b.y = b.by;
    b.z = b.bz;
    b.on = true;
  }
  // enemies come back; broken monitors stay broken
  for (const e of W.enemies) {
    if (e.dead && e.deadT > 0) {
      /* stays defeated (no farming / no re-fighting) */
    }
  }
  if (W.boss && W.boss.onRespawn) W.boss.onRespawn(W);
  // boss fights: come back with a few rings so one stray hit isn't instantly fatal
  if (W.boss && W.boss.active && !W.boss.defeated) W.rings = 5;
  W.cam.mode = p.mode === "side" ? "side" : "third";
  W.cam.snap = true;
  W.cam.yaw = keepFacing;
  W.respawns = (W.respawns || 0) + 1;
  W.events.push({ type: "respawn" });
}

export { killPlayer };

/* ------------------------------------------------------------------ results */

/** rank inputs → { rank, scoreBreakdown } (see utils/rank) */
export function runSummary(W) {
  const L = W.level;
  const par = L.meta.par || 120;
  return {
    time: W.time,
    par,
    rings: W.rings,
    ringsCollected: W.ringsTotalGot,
    ringTotal: W.ringTotal,
    enemies: W.stats.enemies,
    enemyTotal: W.enemies.length,
    hits: W.stats.hits,
    deaths: W.stats.deaths,
    redStars: W.redStars.filter((s) => s.got).length,
    redStarTotal: W.redStars.length,
    redStarFlags: W.redStars.map((s) => s.got),
    score: W.score,
    boss: !!W.boss,
  };
}

export { P };
