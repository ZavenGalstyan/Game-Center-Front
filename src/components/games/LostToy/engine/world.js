/**
 * Lost Toy — one level's runtime: collision world, moving toys, pushable
 * blocks, interactions, household hazards, pets, Memory Buttons,
 * checkpoints, finish, falls / respawn and per-run statistics. Pure JS;
 * stepped at a FIXED rate (MOVE.STEP) from whatever frame rate the renderer
 * runs at, with the frame delta clamped so a resumed tab / debugger pause can
 * never launch the toy through furniture.
 *
 * Exactly-once rules:
 *   - a Memory Button is collected once (flag checked + set in the same step)
 *   - a checkpoint activates once (only an index above the current one)
 *   - the finish fires once (state → FINISHED, never left again)
 *   - falling / hazards after the finish do nothing
 *
 * Determinism: movers, hazards and pets run on the level clock (W.clock),
 * which restarts with the level, so timing is learnable and identical on
 * every attempt and every graphics setting.
 */
import { MOVE, STATES as S, tuning } from "./config.js";
import { createColliders, addBox, cylinderBlocked, groundBelow, lineClear, queryRect } from "./collision.js";
import { createPlayer, stepPlayer, resetPlayerAt, knock, hurt, setState } from "./player.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------------------------------------------------ paths */

/**
 * Offset of a path at local time t. Writes [x,y,z] into out and the travel
 * heading (radians, atan2(dx,dz)) into out[3].
 *   line  — smooth ping-pong with short holds at each end (drawer, trolley, wind-up car)
 *   loop  — constant speed round a closed polyline of offsets (robot vacuum, toy train)
 */
export function pathOffset(p, t, out) {
  if (p.type === "loop") {
    const pts = p.pts;
    if (!p._len) {
      let L = 0;
      p._seg = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const l = Math.hypot(b[0] - a[0], b[2] - a[2], b[1] - a[1]);
        p._seg.push(l);
        L += l;
      }
      p._len = L;
    }
    let d = (((t * p.speed + (p.phase || 0) * p._len) % p._len) + p._len) % p._len;
    for (let i = 0; i < pts.length; i++) {
      const l = p._seg[i];
      if (d <= l || i === pts.length - 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const u = l > 0 ? clamp01(d / l) : 0;
        out[0] = a[0] + (b[0] - a[0]) * u;
        out[1] = a[1] + (b[1] - a[1]) * u;
        out[2] = a[2] + (b[2] - a[2]) * u;
        out[3] = Math.atan2(b[0] - a[0], b[2] - a[2]);
        return out;
      }
      d -= l;
    }
    return out;
  }
  // line / lift (ping-pong)
  const period = p.period || 4;
  const ph = (((t + (p.phase || 0) * period) % period) + period) % period / period;
  const hold = p.hold == null ? 0.12 : p.hold;
  let u;
  let fwd;
  if (ph < 0.5) {
    u = clamp01((ph - hold / 2) / (0.5 - hold));
    fwd = true;
  } else {
    u = 1 - clamp01((ph - 0.5 - hold / 2) / (0.5 - hold));
    fwd = false;
  }
  const e = p.ease === false ? u : u * u * (3 - 2 * u);
  out[0] = p.d[0] * e;
  out[1] = p.d[1] * e;
  out[2] = p.d[2] * e;
  out[3] = fwd ? Math.atan2(p.d[0], p.d[2]) : Math.atan2(-p.d[0], -p.d[2]);
  return out;
}

/* ------------------------------------------------------------------ pets */

/**
 * Pet timeline: cyclic list of keys { t, at:[x,z], state, face?, block?, warn? }.
 * Position is interpolated between consecutive keys (walking), or held while
 * the key's state is a staying state (idle / look / play / sit).
 */
export function petAt(pet, clock, out) {
  const keys = pet.keys;
  const period = pet.period;
  const t = (((clock + (pet.phase || 0)) % period) + period) % period;
  let i = keys.length - 1;
  for (let k = 0; k < keys.length; k++) {
    if (keys[k].t <= t) i = k;
    else break;
  }
  const a = keys[i];
  const b = keys[(i + 1) % keys.length];
  const tb = b.t > a.t ? b.t : b.t + period;
  const u = clamp01((t - a.t) / Math.max(1e-6, tb - a.t));
  const moving = a.state === "walk" || a.state === "approach" || a.state === "leave" || a.state === "run";
  if (moving) {
    out.x = a.at[0] + (b.at[0] - a.at[0]) * u;
    out.z = a.at[1] + (b.at[1] - a.at[1]) * u;
    out.yaw = Math.atan2(b.at[0] - a.at[0], b.at[1] - a.at[1]);
    out.speed = Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) / Math.max(1e-6, tb - a.t);
  } else {
    out.x = a.at[0];
    out.z = a.at[1];
    out.yaw = a.face != null ? a.face : out.yaw || 0;
    out.speed = 0;
  }
  out.state = a.state;
  out.y = a.y || 0;
  out.block = !!a.block;
  out.keyIndex = i;
  out.u = u;
  out.timeToNext = tb - t;
  // warning: the NEXT key is flagged and is about to start
  out.warn = !!b.warn && tb - t < (pet.warnLead || 1.4);
  return out;
}

/* ------------------------------------------------------------------ create */

export function createWorld(level, opts = {}) {
  const T = tuning(!!opts.assist);
  const C = createColliders();
  for (const b of level.boxes) {
    const nb = addBox(C, b);
    if (nb.conveyor) nb.conveyor0 = nb.conveyor.slice();
  }

  const movers = (level.movers || []).map((m, i) => {
    const box = addBox(C, { ...m.box, dynamic: true, kind: "mover", mat: m.mat || "plastic", bounce: m.bounce || 0 });
    return {
      i,
      kind: m.kind || "car",
      path: m.path,
      active: m.startsOn !== false,
      startsOn: m.startsOn !== false,
      t: 0,
      base: { min: m.box.min.slice(), max: m.box.max.slice() },
      box,
      off: [0, 0, 0, 0],
      delta: [0, 0, 0],
      heading: 0,
      def: m,
    };
  });
  const pushables = (level.pushables || []).map((p, i) => {
    const box = addBox(C, { min: p.min, max: p.max, dynamic: true, kind: "pushable", mat: p.mat || "wood", pushable: true, pushIndex: i });
    return { i, box, origin: { min: p.min.slice(), max: p.max.slice() }, axis: p.axis || "xz", range: p.range || null, vy: 0, falling: false, def: p, movedTotal: 0 };
  });
  const interacts = (level.interacts || []).map((it, i) => ({ ...it, i, used: false }));
  const hazards = (level.hazards || []).map((h, i) => ({ ...h, i, x: h.pos ? h.pos[0] : 0, y: h.pos ? h.pos[1] : 0, z: h.pos ? h.pos[2] : 0, on: false, warn: false, hitCooldown: 0, near: 0, heading: 0, off: [0, 0, 0, 0] }));
  const pets = (level.pets || []).map((p, i) => {
    const box = addBox(C, { min: [0, -50, 0], max: [0.1, -49.9, 0.1], dynamic: true, kind: "pet", mat: "fabric", solid: false, active: false, noLedge: true });
    return { ...p, i, box, cur: { x: p.keys[0].at[0], z: p.keys[0].at[1], yaw: 0, state: "idle", speed: 0 }, hitCooldown: 0, metT: -99, warned: -1, lookYaw: 0 };
  });

  const spawn = level.spawn;
  const W = {
    T,
    C,
    level,
    movers,
    pushables,
    interacts,
    hazards,
    pets,
    player: createPlayer(spawn),
    checkpoints: level.checkpoints || [],
    cpIndex: -1,
    checkpoint: { ...spawn },
    buttons: (level.buttons || []).map(() => false),
    buttonCount: 0,
    finish: level.finish,
    finished: false,
    finishTime: 0,
    time: 0,
    clock: 0,
    started: false,
    falls: 0,
    fadeT: 0,
    respawnT: 0,
    events: [],
    acc: 0,
    camYaw: spawn.yaw || 0,
    pending: { jump: false, interact: false },
    stats: newRunStats(),
    nearInteract: null,
    steps: 0,
    stuckT: 0,
    lastRide: null,
    fallReason: null,
    movePushable: null,
  };
  W.movePushable = (pb, dx, dz) => movePushable(W, pb, dx, dz);
  stepMovers(W, 0);
  stepPets(W, 0);
  // settle the spawn onto the floor/furniture under it
  resetPlayerAt(W.player, W, spawn);
  return W;
}

export function newRunStats() {
  return { jumps: 0, falls: 0, ledgeSaves: 0, pushes: 0, bounces: 0, rides: 0, petEncounters: 0, checkpoints: 0, distance: 0, interacts: 0, climbs: 0 };
}

/* ------------------------------------------------------------------ input */

/** Raw input → camera-relative world input. raw: { ax, ay (−1..1 right/forward), sprint, jumpHeld } */
function buildInput(W, raw) {
  const yaw = W.camYaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -fz;
  const rz = fx;
  const ax = raw.ax || 0;
  const ay = raw.ay || 0;
  const mx = fx * ay + rx * ax;
  const mz = fz * ay + rz * ax;
  let mag = Math.hypot(mx, mz);
  const k = mag > 1 ? 1 / mag : 1;
  if (mag > 1) mag = 1;
  return { mx: mx * k, mz: mz * k, mag, sprint: !!raw.sprint, jumpHeld: !!raw.jumpHeld, jumpPressed: false, interactPressed: false };
}

/* ------------------------------------------------------------------ step */

export function stepWorld(W, raw, frameDt) {
  const dt = Math.min(Math.max(frameDt || 0, 0), MOVE.MAX_FRAME_DT);
  if (raw.edges) {
    if (raw.edges.jump) W.pending.jump = true;
    if (raw.edges.interact) W.pending.interact = true;
  }
  W.acc += dt;
  const I = buildInput(W, raw);
  let n = 0;
  while (W.acc >= MOVE.STEP && n < 8) {
    W.acc -= MOVE.STEP;
    n++;
    I.jumpPressed = W.pending.jump;
    I.interactPressed = W.pending.interact;
    W.pending.jump = W.pending.interact = false;
    fixedStep(W, I, MOVE.STEP);
  }
  if (W.acc > MOVE.STEP) W.acc = 0;
  return n;
}

const NO_INPUT = { mx: 0, mz: 0, mag: 0, sprint: false, jumpHeld: false, jumpPressed: false, interactPressed: false };

function fixedStep(W, I, dt) {
  const P = W.player;
  W.steps++;
  W.clock += dt;

  if (!W.started && !W.finished && (I.mag > 0.15 || I.jumpPressed)) {
    W.started = true;
    W.events.push({ type: "start" });
  }
  const controllable = P.state !== S.FALLING_OUT && P.state !== S.RESPAWN && P.state !== S.FINISHED && P.state !== S.HURT;
  const PI = controllable ? I : NO_INPUT;

  stepMovers(W, dt);
  stepPushables(W, dt);
  stepPets(W, dt);

  const ox = P.x;
  const oz = P.z;
  const wasState = P.state;
  stepPlayer(P, W, PI, dt);
  if (P.state !== S.FALLING_OUT && P.state !== S.RESPAWN) W.stats.distance += Math.min(0.5, Math.hypot(P.x - ox, P.z - oz));
  if (P.state === S.CLIMB && wasState !== S.CLIMB) W.stats.climbs++;

  // riding bookkeeping (a new boarding = one ride)
  if (P.grounded && P.groundBox && P.groundBox.kind === "mover") {
    if (W.lastRide !== P.groundBox) {
      W.lastRide = P.groundBox;
      const m = W.movers.find((q) => q.box === P.groundBox);
      W.stats.rides++;
      W.events.push({ type: "ride", kind: m ? m.kind : "car", i: m ? m.i : -1 });
    }
  } else if (P.grounded && P.groundBox) {
    W.lastRide = null;
  }

  stepInteract(W, controllable ? I : NO_INPUT);
  stepHazards(W, dt);
  petContacts(W, dt);
  if (W.started && !W.finished) W.time += dt;
  triggers(W);
  falls(W, dt);
  stuck(W, dt);
  countStats(W);
}

/* ------------------------------------------------------------------ movers */

function stepMovers(W, dt) {
  const P = W.player;
  const out = W._mo || (W._mo = [0, 0, 0, 0]);
  for (const m of W.movers) {
    if (m.active) m.t += dt;
    pathOffset(m.path, m.t, out);
    m.delta[0] = out[0] - m.off[0];
    m.delta[1] = out[1] - m.off[1];
    m.delta[2] = out[2] - m.off[2];
    m.off[0] = out[0];
    m.off[1] = out[1];
    m.off[2] = out[2];
    if (m.active && (Math.abs(m.delta[0]) + Math.abs(m.delta[2]) > 1e-5 || m.path.type === "loop")) m.heading = out[3];
    const b = m.box;
    const oldTop = b.max[1];
    for (let a = 0; a < 3; a++) {
      b.min[a] = m.base.min[a] + out[a];
      b.max[a] = m.base.max[a] + out[a];
      b.vel[a] = dt > 0 ? m.delta[a] / dt : 0;
    }
    if (dt <= 0) continue;
    // carry a toy standing on it: explicit platform displacement — it can't slide off,
    // can't get double speed (velocity is never added while standing), can't sink
    const standing = P.groundBox === b && (P.state === S.GROUND || P.state === S.PUSH || P.state === S.FINISHED);
    if (standing) {
      const nx = P.x + m.delta[0];
      const nz = P.z + m.delta[2];
      // never carry the toy into a wall/shelf: if the new spot is blocked, the
      // horizontal carry is dropped (the player's own collision then slides it off)
      if (!cylinderBlocked(W.C, nx, P.y + m.delta[1] + 0.02, nz, W.T.RADIUS * 0.95, W.T.HEIGHT - 0.04, b)) {
        P.x = nx;
        P.z = nz;
      }
      P.y = b.max[1];
    } else if (m.delta[1] > 0 && P.state === S.AIR && P.vy <= m.delta[1] / dt + 0.01) {
      // a rising platform scoops up a toy hovering just above it (no sinking through)
      const R = W.T.RADIUS * 0.78;
      const cx = clamp(P.x, b.min[0], b.max[0]);
      const cz = clamp(P.z, b.min[2], b.max[2]);
      if ((P.x - cx) ** 2 + (P.z - cz) ** 2 < R * R && P.y >= oldTop - 0.02 && P.y < b.max[1]) {
        P.y = b.max[1];
        P.vy = 0;
      }
    }
  }
}

/* ------------------------------------------------------------------ pushables */

const PUSH_EPS = 0.004;
function pushableBlocked(W, pb, min, max) {
  const list = queryRect(W.C, min[0] + PUSH_EPS, min[2] + PUSH_EPS, max[0] - PUSH_EPS, max[2] - PUSH_EPS);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b === pb.box || !b.solid) continue;
    if (b.max[1] <= min[1] + 0.02 || b.min[1] >= max[1] - 0.02) continue;
    if (b.max[0] <= min[0] + PUSH_EPS || b.min[0] >= max[0] - PUSH_EPS || b.max[2] <= min[2] + PUSH_EPS || b.min[2] >= max[2] - PUSH_EPS) continue;
    return true;
  }
  return false;
}

/** Try to slide a pushable by (dx,dz). Returns the distance actually moved. */
function movePushable(W, pb, dx, dz) {
  if (pb.falling) return 0;
  const b = pb.box;
  if (pb.axis === "x") dz = 0;
  if (pb.axis === "z") dx = 0;
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  if (pb.range) {
    const [rx, rz] = pb.range;
    if (rx) dx = clamp(cx + dx, rx[0], rx[1]) - cx;
    if (rz) dz = clamp(cz + dz, rz[0], rz[1]) - cz;
  }
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return 0;
  // sub-steps so a fast push can't skip through a thin wall
  const n = Math.max(1, Math.ceil(len / 0.03));
  const sx = dx / n;
  const sz = dz / n;
  let moved = 0;
  const min = b.min.slice();
  const max = b.max.slice();
  for (let i = 0; i < n; i++) {
    min[0] += sx;
    max[0] += sx;
    min[2] += sz;
    max[2] += sz;
    if (pushableBlocked(W, pb, min, max)) {
      min[0] -= sx;
      max[0] -= sx;
      min[2] -= sz;
      max[2] -= sz;
      break;
    }
    moved += Math.hypot(sx, sz);
  }
  for (let a = 0; a < 3; a++) {
    b.vel[a] = 0;
    b.min[a] = min[a];
    b.max[a] = max[a];
  }
  pb.movedTotal += moved;
  // lost its footing → it will drop next step
  checkSupport(W, pb);
  return moved;
}

function checkSupport(W, pb) {
  const b = pb.box;
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  // supported if the centre (shrunk footprint) rests on something
  const r = Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 0.22;
  const g = groundBelow(W.C, cx, b.min[1], cz, r, 0.03, 0.02, b);
  if (!g) {
    pb.falling = true;
    pb.vy = 0;
  }
}

function stepPushables(W, dt) {
  for (const pb of W.pushables) {
    if (!pb.falling) continue;
    const b = pb.box;
    pb.vy = Math.max(pb.vy - W.T.GRAVITY * dt, -14);
    const dy = pb.vy * dt;
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const r = Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 0.22;
    const g = groundBelow(W.C, cx, b.min[1], cz, r, -dy + 0.001, 0.0, b);
    const P = W.player;
    if (g) {
      const h = b.max[1] - b.min[1];
      b.min[1] = g.max[1];
      b.max[1] = g.max[1] + h;
      pb.falling = false;
      pb.vy = 0;
      W.events.push({ type: "pushLand", i: pb.i, x: cx, y: b.min[1], z: cz, mat: pb.box.mat });
      // never land ON the toy: nudge it out sideways if it was underneath
      if (cylinderBlocked(W.C, P.x, P.y, P.z, W.T.RADIUS, W.T.HEIGHT) === b) {
        const dx = P.x - cx || 0.01;
        const dz = P.z - cz;
        const d = Math.hypot(dx, dz) || 1;
        knock(P, W, dx / d, dz / d, 0.7);
      }
    } else {
      b.min[1] += dy;
      b.max[1] += dy;
    }
    if (b.max[1] < (W.level.killY ?? -5)) resetPushable(W, pb);
  }
}

function resetPushable(W, pb) {
  const b = pb.box;
  for (let a = 0; a < 3; a++) {
    b.min[a] = pb.origin.min[a];
    b.max[a] = pb.origin.max[a];
    b.vel[a] = 0;
  }
  pb.falling = false;
  pb.vy = 0;
  pb.movedTotal = 0;
  W.events.push({ type: "pushReset", i: pb.i });
}

/* ------------------------------------------------------------------ interactions (E) */

function stepInteract(W, I) {
  const P = W.player;
  let near = null;
  if (P.state === S.GROUND || P.state === S.PUSH) {
    let bestD = Infinity;
    for (const it of W.interacts) {
      if (it.used && !it.toggle) continue;
      const dx = P.x - it.pos[0];
      const dz = P.z - it.pos[2];
      const dy = P.y - it.pos[1];
      const r = it.r || 1.1;
      const d = dx * dx + dz * dz;
      if (d < r * r && Math.abs(dy) < 1.2 && d < bestD) {
        bestD = d;
        near = it;
      }
    }
  }
  W.nearInteract = near;
  if (!I.interactPressed || !near) return;
  near.used = !near.toggle || !near.used;
  W.stats.interacts++;
  const t = near.target;
  if (t && t.mover != null) {
    const m = W.movers[t.mover];
    if (m) {
      m.active = near.toggle ? !m.active : true;
    }
  }
  if (t && t.conveyor != null) {
    const b = W.C.all[t.conveyor];
    if (b && b.conveyor) {
      b.conveyor = near.toggle ? [-b.conveyor[0], -b.conveyor[1]] : t.set || [-b.conveyor[0], -b.conveyor[1]];
      W.events.push({ type: "conveyor", i: t.conveyor, v: b.conveyor });
    }
  }
  if (t && t.hazard != null) {
    const h = W.hazards[t.hazard];
    if (h) h.disabled = near.toggle ? !h.disabled : true;
  }
  W.events.push({ type: "interact", i: near.i, kind: near.kind || "switch", x: near.pos[0], y: near.pos[1], z: near.pos[2] });
}

/* ------------------------------------------------------------------ hazards */

export function hazardPhase(h, clock) {
  const period = h.period || 3;
  const ph = ((((clock + (h.phase || 0) * period) % period) + period) % period) / period;
  const onFrac = h.onFrac == null ? 0.4 : h.onFrac;
  const warnFrac = h.warnFrac == null ? 0.2 : h.warnFrac;
  if (ph >= 1 - onFrac) return { on: true, warn: false, ph };
  if (ph >= 1 - onFrac - warnFrac) return { on: false, warn: true, ph };
  return { on: false, warn: false, ph };
}

function inBox(P, h, T) {
  const s = h.size;
  return Math.abs(P.x - h.x) < s[0] / 2 && Math.abs(P.z - h.z) < s[2] / 2 && P.y + T.HEIGHT > h.y && P.y < h.y + s[1];
}

function stepHazards(W, dt) {
  const P = W.player;
  const T = W.T;
  const dead = P.state === S.FALLING_OUT || P.state === S.RESPAWN || P.state === S.FINISHED || P.state === S.HURT;
  P.inShallow = false;
  for (const h of W.hazards) {
    if (h.hitCooldown > 0) h.hitCooldown -= dt;
    h.near = 0;
    switch (h.type) {
      case "vacuum": {
        // a moving vacuum head along a path; suction pulls toward the nozzle when nothing is in between
        pathOffset(h.path, W.clock, h.off);
        h.x = h.pos[0] + h.off[0];
        h.z = h.pos[2] + h.off[2];
        h.y = h.pos[1];
        h.heading = h.off[3];
        h.on = !h.disabled;
        const dx = P.x - h.x;
        const dz = P.z - h.z;
        const d = Math.hypot(dx, dz);
        h.near = d;
        if (!h.on || dead) break;
        const head = h.r || 1.4;
        if (d < head + T.RADIUS && P.y < h.y + (h.h || 1.2)) {
          if (h.hitCooldown <= 0) {
            hurt(P, W, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0, "vacuum");
            h.hitCooldown = 1;
          }
          break;
        }
        const reach = h.suction || 0;
        if (reach > 0 && d < reach && P.y < h.y + 3 && (P.grounded || P.state === S.AIR)) {
          // walls / furniture block the pull (no suction through a shelf)
          if (lineClear(W.C, h.x, h.y + 0.5, h.z, P.x, P.y + 0.5, P.z)) {
            const k = (1 - d / reach) * (h.pull || 2.2);
            P.vx -= (dx / d) * k * dt * 6;
            P.vz -= (dz / d) * k * dt * 6;
            // capped well below run speed: always escapable by running away
            const sp = Math.hypot(P.vx, P.vz);
            const cap = T.RUN_SPEED * 1.05;
            if (sp > cap) {
              P.vx *= cap / sp;
              P.vz *= cap / sp;
            }
          }
        }
        break;
      }
      case "water": {
        // deep: sinks + respawn; shallow: slow + splashy
        h.on = true;
        if (dead) break;
        if (!inBox(P, h, T)) break;
        const surface = h.y + h.size[1];
        if (h.deep) {
          if (P.y < surface - 0.03) {
            W.fallReason = "water";
            startFallOut(W, "water");
          }
        } else if (P.grounded) {
          P.inShallow = true;
        }
        break;
      }
      case "wind": {
        // fan / breeze zone: steady (or gusting) push while inside the box
        const st = h.period ? hazardPhase(h, W.clock) : { on: true, warn: false };
        h.on = st.on && !h.disabled;
        h.warn = st.warn && !h.disabled;
        if (!h.on || dead) break;
        if (!inBox(P, h, T)) break;
        const f = h.force || 3;
        if (P.state === S.GROUND || P.state === S.AIR || P.state === S.PUSH) {
          const k = P.grounded ? 0.55 : 1;
          P.vx += h.dir[0] * f * k * dt;
          P.vz += h.dir[2] * f * k * dt;
          if (h.dir[1]) P.vy += h.dir[1] * f * dt;
        }
        break;
      }
      case "drip":
      case "sprinkler":
      case "steam": {
        // timed column: warning, then on; contact = a knock (drip/sprinkler) — never unavoidable
        const st = hazardPhase(h, W.clock);
        h.on = st.on && !h.disabled;
        h.warn = st.warn && !h.disabled;
        if (!h.on || dead || h.hitCooldown > 0) break;
        const r = (h.r || 0.6) + T.RADIUS * 0.6;
        const dx = P.x - h.x;
        const dz = P.z - h.z;
        if (dx * dx + dz * dz < r * r && P.y < h.y + (h.h || 2) && P.y + T.HEIGHT > h.y) {
          let kx = h.push ? h.push[0] : dx;
          let kz = h.push ? h.push[2] : dz;
          let d = Math.hypot(kx, kz);
          if (d < 0.05) {
            kx = -P.vx;
            kz = -P.vz;
            d = Math.hypot(kx, kz) || 1;
            if (d < 0.05) {
              kx = 1;
              d = 1;
            }
          }
          knock(P, W, kx / d, kz / d, h.strength || 0.9);
          h.hitCooldown = 0.8;
          W.events.push({ type: "hazard", kind: h.type, x: P.x, y: P.y, z: P.z });
        }
        break;
      }
      case "roller": {
        // a rolling object (ball, can, tyre) on a path: bumps the toy aside
        pathOffset(h.path, W.clock, h.off);
        const px = h.x;
        const pz = h.z;
        h.x = h.pos[0] + h.off[0];
        h.z = h.pos[2] + h.off[2];
        h.y = h.pos[1] + h.off[1];
        h.heading = h.off[3];
        h.vx = dt > 0 ? (h.x - px) / dt : 0;
        h.vz = dt > 0 ? (h.z - pz) / dt : 0;
        h.on = true;
        if (dead || h.hitCooldown > 0) break;
        const r = (h.r || 0.6) + T.RADIUS;
        const dx = P.x - h.x;
        const dz = P.z - h.z;
        if (dx * dx + dz * dz < r * r && P.y < h.y + (h.r || 0.6) * 2 && P.y + T.HEIGHT > h.y) {
          const d = Math.hypot(dx, dz) || 1;
          if (h.lethal) hurt(P, W, dx / d, dz / d, "roller");
          else knock(P, W, dx / d, dz / d, h.strength || 1);
          h.hitCooldown = 0.9;
          W.events.push({ type: "hazard", kind: "roller", x: P.x, y: P.y, z: P.z });
        }
        break;
      }
      case "swing": {
        // a weight on a cord swinging from a pivot (plumb bob, work lamp): knocks the toy aside
        const per = h.period || 3;
        const ph = ((((W.clock + (h.phase || 0) * per) % per) + per) % per) / per;
        const a = Math.sin(ph * TAU) * (h.amp || 0.8);
        const nx = h.pos[0] + (h.axis === "z" ? 0 : Math.sin(a) * h.len);
        const nz = h.pos[2] + (h.axis === "z" ? Math.sin(a) * h.len : 0);
        const ny = h.pos[1] - Math.cos(a) * h.len;
        h.vx = dt > 0 ? (nx - h.x) / dt : 0;
        h.vz = dt > 0 ? (nz - h.z) / dt : 0;
        h.x = nx;
        h.y = ny;
        h.z = nz;
        h.angle = a;
        h.on = true;
        if (dead || h.hitCooldown > 0) break;
        const cy = Math.max(P.y + 0.2, Math.min(P.y + T.HEIGHT - 0.2, h.y));
        const dx = P.x - h.x;
        const dy = cy - h.y;
        const dz = P.z - h.z;
        const rr = (h.r || 0.6) + T.RADIUS;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          const sp = Math.hypot(h.vx, h.vz) || 1;
          let kx = h.vx / sp;
          let kz = h.vz / sp;
          if (sp < 0.4) {
            const d = Math.hypot(dx, dz) || 1;
            kx = dx / d;
            kz = dz / d;
          }
          knock(P, W, kx, kz, h.strength || 1);
          h.hitCooldown = 0.9;
          W.events.push({ type: "hazard", kind: "swing", x: P.x, y: P.y, z: P.z });
        }
        break;
      }
      case "zone": {
        // generic "don't touch" (hot stove ring, wet paint): hurt on contact
        const st = h.period ? hazardPhase(h, W.clock) : { on: true, warn: false };
        h.on = st.on && !h.disabled;
        h.warn = st.warn && !h.disabled;
        if (!h.on || dead) break;
        if (inBox(P, h, T)) {
          const sp = Math.hypot(P.vx, P.vz) || 1;
          hurt(P, W, -P.vx / sp || 0.01, -P.vz / sp, h.kind || "zone");
        }
        break;
      }
      default:
    }
  }
}

/* ------------------------------------------------------------------ pets */

function stepPets(W, dt) {
  const P = W.player;
  for (const pet of W.pets) {
    const prevState = pet.cur.state;
    petAt(pet, W.clock, pet.cur);
    // a sitting pet is a solid, temporary obstacle (it always leaves on schedule)
    const b = pet.box;
    const r = pet.blockR || (pet.type === "dog" ? 1.4 : 1.1);
    const h = pet.type === "dog" ? 4.2 : 3.4;
    const py = pet.cur.y || 0;
    if (pet.cur.block) {
      const min = [pet.cur.x - r, py, pet.cur.z - r];
      const max = [pet.cur.x + r, py + h, pet.cur.z + r];
      const wasSolid = b.solid;
      b.min = min;
      b.max = max;
      b.active = true;
      // never materialise around the toy
      if (!wasSolid) {
        const dx = clamp(P.x, min[0], max[0]) - P.x;
        const dz = clamp(P.z, min[2], max[2]) - P.z;
        b.solid = !(dx * dx + dz * dz < W.T.RADIUS * W.T.RADIUS && P.y < py + h && P.y + W.T.HEIGHT > py);
      }
    } else {
      b.solid = false;
      b.active = false;
      b.min = [0, -50, 0];
      b.max = [0.1, -49.9, 0.1];
    }
    // head turns toward the toy when it is close (visual + "look" reaction)
    const dx = P.x - pet.cur.x;
    const dz = P.z - pet.cur.z;
    const d = Math.hypot(dx, dz);
    pet.dist = d;
    pet.lookYaw = Math.atan2(dx, dz);
    if (pet.cur.warn && pet.warned !== pet.cur.keyIndex) {
      pet.warned = pet.cur.keyIndex;
      W.events.push({ type: "petWarn", pet: pet.type, i: pet.i, x: pet.cur.x, z: pet.cur.z, dist: d });
    }
    if (prevState !== pet.cur.state) W.events.push({ type: "petState", pet: pet.type, i: pet.i, state: pet.cur.state, dist: d });
    if (pet.hitCooldown > 0) pet.hitCooldown -= dt;
  }
}

function petContacts(W) {
  const P = W.player;
  const dead = P.state === S.FALLING_OUT || P.state === S.RESPAWN || P.state === S.FINISHED || P.state === S.HURT;
  for (const pet of W.pets) {
    const d = pet.dist;
    const py = pet.cur.y || 0;
    const rel = P.y - py;
    // an "encounter": the pet came close while the toy was out and about (once per approach)
    if (d < (pet.type === "dog" ? 4.5 : 3.6) && rel > -1 && rel < 4 && W.clock - pet.metT > 6 && !dead) {
      pet.metT = W.clock;
      W.stats.petEncounters++;
      W.events.push({ type: "petMeet", pet: pet.type, i: pet.i });
    }
    if (dead || pet.cur.block || pet.hitCooldown > 0) continue;
    // moving pets bump the toy aside (gentle, along the pet's travel direction)
    if (pet.cur.speed < 0.2 && pet.cur.state !== "play") continue;
    const r = (pet.type === "dog" ? 1.5 : 1.15) + W.T.RADIUS;
    if (d < r && rel > -0.5 && rel < (pet.type === "dog" ? 4 : 3.2)) {
      const sx = Math.sin(pet.cur.yaw);
      const sz = Math.cos(pet.cur.yaw);
      const ux = d > 0.01 ? (P.x - pet.cur.x) / d : sx;
      const uz = d > 0.01 ? (P.z - pet.cur.z) / d : sz;
      const kx = ux * 0.6 + sx * 0.4;
      const kz = uz * 0.6 + sz * 0.4;
      const kd = Math.hypot(kx, kz) || 1;
      if (knock(P, W, kx / kd, kz / kd, pet.type === "dog" ? 1.1 : 0.85)) {
        pet.hitCooldown = 1.2;
        W.events.push({ type: "petBump", pet: pet.type, i: pet.i, x: P.x, y: P.y, z: P.z });
      }
    }
  }
}

/* ------------------------------------------------------------------ triggers */

function triggers(W) {
  const P = W.player;
  if (P.state === S.FALLING_OUT || P.state === S.RESPAWN) return;
  const cy = P.y + 0.5;
  // Memory Buttons
  const buttons = W.level.buttons || [];
  for (let i = 0; i < buttons.length; i++) {
    if (W.buttons[i]) continue;
    const s = buttons[i];
    const dx = P.x - s.x;
    const dy = cy - s.y;
    const dz = P.z - s.z;
    if (dx * dx + dz * dz < 0.6 * 0.6 && Math.abs(dy) < 0.75) {
      W.buttons[i] = true;
      W.buttonCount++;
      W.events.push({ type: "button", i, x: s.x, y: s.y, z: s.z, count: W.buttonCount });
    }
  }
  if (W.finished || P.state === S.HURT) return;
  // checkpoints (in order; a later one also counts if an earlier was skipped)
  for (let i = W.cpIndex + 1; i < W.checkpoints.length; i++) {
    const c = W.checkpoints[i];
    const dx = P.x - c.x;
    const dz = P.z - c.z;
    const r = c.r || 1.0;
    if (dx * dx + dz * dz < r * r && P.y > c.y - 0.4 && P.y < c.y + 1.6 && P.grounded) {
      W.cpIndex = i;
      W.checkpoint = { x: c.x, y: c.y, z: c.z, yaw: c.yaw || 0 };
      W.stats.checkpoints++;
      W.events.push({ type: "checkpoint", i, x: c.x, y: c.y, z: c.z });
      break;
    }
  }
  // finish (must be standing at the goal — no brushing past it mid-air)
  const f = W.finish;
  if (f) {
    const dx = P.x - f.x;
    const dz = P.z - f.z;
    const r = f.r || 1.0;
    if (dx * dx + dz * dz < r * r && P.y > f.y - 0.3 && P.y < f.y + 1.5 && (P.grounded || P.state === S.LEDGE)) {
      W.finished = true;
      W.finishTime = W.time;
      P.finished = true;
      setState(P, W, S.FINISHED);
      P.grounded = P.groundBox != null || P.grounded;
      W.events.push({ type: "finish", time: W.time, buttons: W.buttonCount, falls: W.falls });
    }
  }
}

function startFallOut(W, reason) {
  const P = W.player;
  if (P.state === S.FALLING_OUT || P.state === S.RESPAWN || P.state === S.FINISHED) return;
  W.falls++;
  W.stats.falls++;
  W.fadeT = 0;
  W.fallReason = reason;
  setState(P, W, S.FALLING_OUT);
  if (reason === "water") {
    P.vx *= 0.2;
    P.vz *= 0.2;
    P.vy = -0.8;
  }
  W.events.push({ type: "fall", reason, x: P.x, y: P.y, z: P.z });
}

function falls(W, dt) {
  const P = W.player;
  if (P.state === S.FINISHED) return;
  if (P.state === S.HURT) {
    if (P.hurtT >= W.T.HAZARD_FADE_DELAY) startFallOut(W, "hazard");
    return;
  }
  if (P.state === S.FALLING_OUT) {
    W.fadeT += dt;
    if (W.fadeT >= W.T.FALL_FADE_TIME) respawn(W);
    return;
  }
  if (P.state === S.RESPAWN) {
    W.respawnT += dt;
    if (W.respawnT >= W.T.RESPAWN_TIME) {
      W.fadeT = 0;
      setState(P, W, S.GROUND);
      P.grounded = true;
    }
    return;
  }
  if (P.y < (W.level.killY ?? -5)) {
    startFallOut(W, "void");
    return;
  }
  // a drop far taller than the toy = a tumble back to the last checkpoint
  const maxFall = W.level.maxFall ?? 5.5;
  if (!P.grounded && P.state === S.AIR && P.vy < 0 && P.peakY - P.y > maxFall) startFallOut(W, "height");
}

function respawn(W) {
  const P = W.player;
  resetPlayerAt(P, W, W.checkpoint);
  // pushables that were lost (fell out) or are marked as respawn-reset come back
  for (const pb of W.pushables) if (pb.def.resetOnRespawn || pb.box.max[1] < (W.level.killY ?? -5)) resetPushable(W, pb);
  for (const h of W.hazards) h.hitCooldown = 0.6; // a moment of grace after appearing
  for (const p of W.pets) p.hitCooldown = 1.2;
  W.lastRide = null;
  setState(P, W, S.RESPAWN);
  W.respawnT = 0;
  W.events.push({ type: "respawn", x: P.x, y: P.y, z: P.z, yaw: W.checkpoint.yaw || 0, reason: W.fallReason });
  W.fallReason = null;
}

/** last resort: the toy ended up overlapping solid geometry (squeezed by a mover) → put it back safely */
function stuck(W, dt) {
  const P = W.player;
  if (P.state === S.RESPAWN || P.state === S.FALLING_OUT || P.state === S.LEDGE || P.state === S.FINISHED) {
    W.stuckT = 0;
    return;
  }
  const b = cylinderBlocked(W.C, P.x, P.y + 0.05, P.z, W.T.RADIUS * 0.7, W.T.HEIGHT - 0.1);
  if (b) W.stuckT += dt;
  else W.stuckT = 0;
  if (W.stuckT > 0.45) {
    W.stuckT = 0;
    W.fadeT = 0;
    setState(P, W, S.FALLING_OUT);
    W.fallReason = "stuck";
    W.events.push({ type: "unstuck", x: P.x, y: P.y, z: P.z });
  }
}

function countStats(W) {
  const E = W.events;
  for (let i = W._seen || 0; i < E.length; i++) {
    const e = E[i];
    switch (e.type) {
      case "jump":
        W.stats.jumps++;
        break;
      case "bounce":
        W.stats.bounces++;
        break;
      case "ledge":
        if (e.save) W.stats.ledgeSaves++;
        break;
      case "pushStart":
        W.stats.pushes++;
        break;
      default:
    }
  }
  W._seen = E.length;
}

/** renderer / UI take the queued events once per frame */
export function drainEvents(W) {
  const e = W.events;
  W.events = [];
  W._seen = 0;
  return e;
}

/** active tutorial hint zone (UI decides whether to show it) */
export function hintAt(W) {
  const P = W.player;
  const hints = W.level.hints || [];
  for (let i = 0; i < hints.length; i++) {
    const h = hints[i];
    if (P.x > h.min[0] && P.x < h.max[0] && P.z > h.min[1] && P.z < h.max[1] && P.y > (h.y ?? -1e9) - 0.5 && P.y < (h.y ?? -1e9) + (h.h ?? 1e9)) return h;
  }
  return null;
}

/** Restart the level in place (Retry / shared Restart): fresh run, same world object. */
export function restartWorld(W) {
  const spawn = W.level.spawn;
  for (const pb of W.pushables) resetPushable(W, pb);
  for (const m of W.movers) {
    m.active = m.startsOn;
    m.t = 0;
  }
  for (const it of W.interacts) it.used = false;
  for (const b of W.C.all) if (b.conveyor0) b.conveyor = b.conveyor0.slice();
  for (const h of W.hazards) {
    h.hitCooldown = 0;
    h.disabled = false;
  }
  for (const p of W.pets) {
    p.hitCooldown = 0;
    p.metT = -99;
    p.warned = -1;
  }
  W.clock = 0;
  stepMovers(W, 0);
  stepPets(W, 0);
  W.cpIndex = -1;
  W.checkpoint = { ...spawn };
  W.buttons = W.buttons.map(() => false);
  W.buttonCount = 0;
  W.finished = false;
  W.finishTime = 0;
  W.time = 0;
  W.started = false;
  W.falls = 0;
  W.fadeT = 0;
  W.respawnT = 0;
  W.events = [];
  W._seen = 0;
  W.acc = 0;
  W.pending = { jump: false, interact: false };
  W.stats = newRunStats();
  W.camYaw = spawn.yaw || 0;
  W.stuckT = 0;
  W.lastRide = null;
  W.fallReason = null;
  W.nearInteract = null;
  W.player.finished = false;
  resetPlayerAt(W.player, W, spawn);
  W.events.push({ type: "restart", x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw || 0 });
}

export { TAU };
