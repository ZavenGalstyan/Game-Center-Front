/**
 * Rooftop Dash — one level's runtime: collision world, movers, crumbling
 * slabs, hazards, checkpoints, stars, finish, timer, falls / respawn, flow
 * and per-run statistics. Pure JS; stepped at a FIXED rate (MOVE.STEP) from
 * whatever frame rate the renderer runs at, with the frame delta clamped so a
 * resumed tab / debugger pause can never launch the runner through geometry.
 *
 * Exactly-once rules:
 *   - a star is collected once (flag checked + set in the same step)
 *   - a checkpoint activates once (only an index above the current one)
 *   - the finish fires once (state → FINISHED, never left again)
 *   - falling after the finish does nothing
 */
import { MOVE, FLOW, STATES as S, tuning } from "./config.js";
import { createColliders, addBox, cylinderBlocked } from "./collision.js";
import { createPlayer, stepPlayer, resetPlayerAt, knock, setState } from "./player.js";

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ movers */

/** offset of a mover's path at time t (seconds) */
export function moverOffset(m, t, out) {
  const p = m.path;
  const ph = ((t + (p.phase || 0) * p.period) % p.period) / p.period; // 0..1
  if (p.type === "line" || p.type === "lift") {
    // smooth ping-pong with short holds at each end
    const hold = p.hold == null ? 0.12 : p.hold;
    let u;
    if (ph < 0.5) u = clamp01((ph - hold / 2) / (0.5 - hold));
    else u = 1 - clamp01((ph - 0.5 - hold / 2) / (0.5 - hold));
    const e = u * u * (3 - 2 * u);
    out[0] = p.d[0] * e;
    out[1] = p.d[1] * e;
    out[2] = p.d[2] * e;
  } else if (p.type === "swing") {
    // pendulum arc around a pivot above; the slab stays level (crane load)
    const a = Math.sin(ph * TAU) * p.amp;
    const L = p.len;
    const h = Math.sin(a) * L;
    out[0] = p.axis === "x" ? h : 0;
    out[2] = p.axis === "z" ? h : 0;
    out[1] = (1 - Math.cos(a)) * L;
  } else {
    out[0] = out[1] = out[2] = 0;
  }
  return out;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------------------------------------------------ create */

export function createWorld(level, opts = {}) {
  const T = tuning(!!opts.assist);
  const C = createColliders();
  for (const b of level.boxes) addBox(C, b);

  const movers = (level.movers || []).map((m, i) => {
    const box = addBox(C, { ...m.box, dynamic: true, kind: m.kind || "mover", mat: m.mat || "metal" });
    return { i, path: m.path, kind: m.kind || "mover", base: { min: m.box.min.slice(), max: m.box.max.slice() }, box, off: [0, 0, 0], prev: [0, 0, 0], delta: [0, 0, 0] };
  });
  const crumbles = (level.crumbles || []).map((c, i) => {
    const box = addBox(C, { min: c.min, max: c.max, dynamic: true, kind: "crumble", mat: c.mat || "wood" });
    return { i, box, delay: c.delay || 0.55, respawn: c.respawn || 3.2, state: "solid", t: 0 };
  });
  const hazards = (level.hazards || []).map((h, i) => ({ ...h, i, on: false, warn: false, x: h.pos[0], y: h.pos[1], z: h.pos[2], vx: 0, vz: 0, hitCooldown: 0 }));

  const spawn = level.spawn;
  const W = {
    T,
    C,
    level,
    movers,
    crumbles,
    hazards,
    player: createPlayer(spawn),
    checkpoints: level.checkpoints || [],
    cpIndex: -1,
    checkpoint: { ...spawn },
    stars: (level.stars || []).map(() => false),
    starCount: 0,
    finish: level.finish,
    finished: false,
    finishTime: 0,
    time: 0, // shown timer (includes penalties)
    clock: 0, // simulation clock (movers, hazards), runs from load
    started: false,
    falls: 0,
    fadeT: 0,
    respawnT: 0,
    events: [],
    acc: 0,
    camYaw: spawn.yaw || 0,
    pending: { jump: false, dash: false, slide: false },
    flow: { count: 0, last: -99, best: 0, label: null, score: 0 },
    stats: { jumps: 0, vaults: 0, slides: 0, wallRuns: 0, wallJumps: 0, dashes: 0, ledges: 0, falls: 0, checkpoints: 0, distance: 0, stumbles: 0 },
    activeHint: null,
    steps: 0,
  };
  W.player.height = T.HEIGHT;
  stepMovers(W, 0);
  return W;
}

/* ------------------------------------------------------------------ input */

/**
 * Raw input → camera-relative world input. `raw` comes from utils/input.js:
 * { ax, ay (−1..1 right/forward), sprint, jumpHeld, slideHeld, take(name) }.
 */
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
  return {
    mx: mx * k,
    mz: mz * k,
    mag,
    sprint: !!raw.sprint,
    jumpHeld: !!raw.jumpHeld,
    slideHeld: !!raw.slideHeld,
    jumpPressed: false,
    dashPressed: false,
    slidePressed: false,
  };
}

/* ------------------------------------------------------------------ step */

export function stepWorld(W, raw, frameDt) {
  const dt = Math.min(Math.max(frameDt, 0), MOVE.MAX_FRAME_DT);
  // latch edges until a fixed step consumes them
  if (raw.edges) {
    if (raw.edges.jump) W.pending.jump = true;
    if (raw.edges.dash) W.pending.dash = true;
    if (raw.edges.slide) W.pending.slide = true;
  }
  W.acc += dt;
  const I = buildInput(W, raw);
  let n = 0;
  while (W.acc >= MOVE.STEP && n < 8) {
    W.acc -= MOVE.STEP;
    n++;
    I.jumpPressed = W.pending.jump;
    I.dashPressed = W.pending.dash;
    I.slidePressed = W.pending.slide;
    W.pending.jump = W.pending.dash = W.pending.slide = false;
    fixedStep(W, I, MOVE.STEP);
  }
  if (W.acc > MOVE.STEP) W.acc = 0;
  return n;
}

function fixedStep(W, I, dt) {
  const P = W.player;
  W.steps++;
  W.clock += dt;

  // the clock starts on the first real input (fair: reading the level is free)
  if (!W.started && !W.finished && (I.mag > 0.15 || I.jumpPressed || I.dashPressed)) {
    W.started = true;
    W.events.push({ type: "start" });
  }
  const controllable = P.state !== S.FALLING_OUT && P.state !== S.RESPAWN && P.state !== S.FINISHED;
  const PI = controllable ? I : NO_INPUT;

  stepMovers(W, dt);
  stepCrumbles(W, dt);

  const ox = P.x;
  const oz = P.z;
  stepPlayer(P, W, PI, dt);
  if (P.state !== S.FALLING_OUT && P.state !== S.RESPAWN) W.stats.distance += Math.hypot(P.x - ox, P.z - oz);

  stepHazards(W, dt);
  if (W.started && !W.finished) W.time += dt;
  triggers(W);
  falls(W, dt);
  drainFlow(W);
}

const NO_INPUT = { mx: 0, mz: 0, mag: 0, sprint: false, jumpHeld: false, slideHeld: false, jumpPressed: false, dashPressed: false, slidePressed: false };

function stepMovers(W, dt) {
  const P = W.player;
  const out = [0, 0, 0];
  for (const m of W.movers) {
    moverOffset(m, W.clock, out);
    m.delta[0] = out[0] - m.off[0];
    m.delta[1] = out[1] - m.off[1];
    m.delta[2] = out[2] - m.off[2];
    m.prev[0] = m.off[0];
    m.prev[1] = m.off[1];
    m.prev[2] = m.off[2];
    m.off[0] = out[0];
    m.off[1] = out[1];
    m.off[2] = out[2];
    const b = m.box;
    for (let a = 0; a < 3; a++) {
      b.min[a] = m.base.min[a] + out[a];
      b.max[a] = m.base.max[a] + out[a];
      b.vel[a] = dt > 0 ? m.delta[a] / dt : 0;
    }
    // carry a runner standing on it (explicit platform velocity: no slide-out, no double speed)
    if (dt > 0 && P.groundBox === b && (P.state === S.GROUND || P.state === S.SLIDE || P.state === S.CROUCH || P.state === S.FINISHED || (P.state === S.DASH && !P.dashAir))) {
      P.x += m.delta[0];
      P.y += m.delta[1];
      P.z += m.delta[2];
    }
  }
}

function stepCrumbles(W, dt) {
  const P = W.player;
  for (const c of W.crumbles) {
    const b = c.box;
    if (c.state === "solid") {
      if (P.groundBox === b && P.grounded) {
        c.state = "cracking";
        c.t = 0;
        W.events.push({ type: "crumbleStart", i: c.i });
      }
    } else if (c.state === "cracking") {
      c.t += dt;
      if (c.t >= c.delay) {
        c.state = "fallen";
        c.t = 0;
        b.active = false;
        b.solid = false;
        if (P.groundBox === b) {
          P.groundBox = null;
        }
        W.events.push({ type: "crumbleFall", i: c.i });
      }
    } else if (c.state === "fallen") {
      c.t += dt;
      if (c.t >= c.respawn) {
        // only come back if the runner isn't standing inside the slab's space
        b.solid = true;
        b.active = true;
        const inside = cylinderBlocked(W.C, P.x, P.y, P.z, W.T.RADIUS, P.height) === b;
        if (inside) {
          b.solid = false;
          b.active = false;
          c.t = c.respawn - 0.3;
        } else {
          c.state = "solid";
          c.t = 0;
          W.events.push({ type: "crumbleReset", i: c.i });
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ hazards */

export function hazardPhase(h, clock) {
  const period = h.period || 3;
  const ph = ((clock + (h.phase || 0) * period) % period) / period;
  const onFrac = h.onFrac || 0.38;
  const warnFrac = 0.18;
  if (ph >= 1 - onFrac) return { on: true, warn: false, ph };
  if (ph >= 1 - onFrac - warnFrac) return { on: false, warn: true, ph };
  return { on: false, warn: false, ph };
}

function stepHazards(W, dt) {
  const P = W.player;
  const dead = P.state === S.FALLING_OUT || P.state === S.RESPAWN || P.state === S.FINISHED;
  for (const h of W.hazards) {
    if (h.hitCooldown > 0) h.hitCooldown -= dt;
    if (h.type === "hook") {
      // swinging crane hook (sphere on an arc)
      const ph = ((W.clock + (h.phase || 0) * h.period) % h.period) / h.period;
      const a = Math.sin(ph * TAU) * h.amp;
      const nx = h.pos[0] + (h.axis === "x" ? Math.sin(a) * h.len : 0);
      const nz = h.pos[2] + (h.axis === "z" ? Math.sin(a) * h.len : 0);
      const ny = h.pos[1] - Math.cos(a) * h.len;
      h.vx = dt > 0 ? (nx - h.x) / dt : 0;
      h.vz = dt > 0 ? (nz - h.z) / dt : 0;
      h.x = nx;
      h.y = ny;
      h.z = nz;
      h.on = true;
      if (dead || h.hitCooldown > 0) continue;
      const cy = Math.max(P.y + 0.3, Math.min(P.y + P.height - 0.3, h.y));
      const dx = P.x - h.x;
      const dy = cy - h.y;
      const dz = P.z - h.z;
      const r = (h.r || 0.65) + W.T.RADIUS;
      if (dx * dx + dy * dy + dz * dz < r * r) {
        const sp = Math.hypot(h.vx, h.vz) || 1;
        let kx = h.vx / sp;
        let kz = h.vz / sp;
        if (sp < 0.5) {
          const d = Math.hypot(dx, dz) || 1;
          kx = dx / d;
          kz = dz / d;
        }
        knock(P, W, kx, kz, 1.1);
        h.hitCooldown = 0.8;
        W.events.push({ type: "hazard", kind: "hook", x: P.x, y: P.y, z: P.z });
      }
      continue;
    }
    const st = hazardPhase(h, W.clock);
    h.on = st.on;
    h.warn = st.warn;
    if (h.type === "fan") {
      // wind duct: constant push while inside the box zone (always on)
      h.on = true;
      if (dead) continue;
      const s = h.size;
      if (Math.abs(P.x - h.x) < s[0] / 2 && Math.abs(P.z - h.z) < s[2] / 2 && P.y + P.height > h.y && P.y < h.y + s[1]) {
        const f = h.force || 9;
        if (P.state === S.GROUND || P.state === S.AIR || P.state === S.SLIDE || P.state === S.CROUCH) {
          P.vx += h.dir[0] * f * dt;
          P.vz += h.dir[2] * f * dt;
        }
      }
      continue;
    }
    if (!st.on || dead || h.hitCooldown > 0) continue;
    // steam / zap: vertical cylinder zones
    const r = (h.r || 0.8) + W.T.RADIUS * 0.6;
    const dx = P.x - h.x;
    const dz = P.z - h.z;
    if (dx * dx + dz * dz < r * r && P.y < h.y + (h.h || 2.6) && P.y + P.height > h.y) {
      // push away along the hazard's preferred direction, else radially, else back along travel
      let kx = h.push ? h.push[0] : dx;
      let kz = h.push ? h.push[2] : dz;
      let d = Math.hypot(kx, kz);
      if (d < 0.05) {
        kx = -P.vx;
        kz = -P.vz;
        d = Math.hypot(kx, kz) || 1;
      }
      knock(P, W, kx / d, kz / d, h.type === "zap" ? 0.9 : 0.8);
      h.hitCooldown = 0.7;
      W.events.push({ type: "hazard", kind: h.type, x: P.x, y: P.y, z: P.z });
    }
  }
}

/* ------------------------------------------------------------------ triggers */

function triggers(W) {
  const P = W.player;
  if (P.state === S.FALLING_OUT || P.state === S.RESPAWN) return;
  const cy = P.y + 0.9;
  // stars
  const stars = W.level.stars || [];
  for (let i = 0; i < stars.length; i++) {
    if (W.stars[i]) continue;
    const s = stars[i];
    const dx = P.x - s.x;
    const dy = cy - s.y;
    const dz = P.z - s.z;
    if (dx * dx + dz * dz < 0.95 * 0.95 && Math.abs(dy) < 1.25) {
      W.stars[i] = true;
      W.starCount++;
      W.events.push({ type: "star", i, x: s.x, y: s.y, z: s.z, count: W.starCount });
      bumpFlow(W, "star", 0);
    }
  }
  if (W.finished) return;
  // checkpoints (in order; a later one also counts if an earlier was skipped)
  for (let i = W.cpIndex + 1; i < W.checkpoints.length; i++) {
    const c = W.checkpoints[i];
    const dx = P.x - c.x;
    const dz = P.z - c.z;
    if (dx * dx + dz * dz < (c.r || 1.7) * (c.r || 1.7) && P.y > c.y - 0.6 && P.y < c.y + 3) {
      W.cpIndex = i;
      W.checkpoint = { x: c.x, y: c.y, z: c.z, yaw: c.yaw || 0 };
      W.stats.checkpoints++;
      W.events.push({ type: "checkpoint", i, x: c.x, y: c.y, z: c.z });
      break;
    }
  }
  // finish
  const f = W.finish;
  if (f) {
    const dx = P.x - f.x;
    const dz = P.z - f.z;
    const r = f.r || 2.2;
    if (dx * dx + dz * dz < r * r && P.y > f.y - 0.8 && P.y < f.y + 4) {
      W.finished = true;
      W.finishTime = W.time;
      P.finished = true;
      P.vault = null;
      P.wall = null;
      P.ledge = null;
      if (P.state === S.SLIDE || P.state === S.CROUCH) P.height = W.T.HEIGHT;
      setState(P, W, S.FINISHED);
      P.grounded = P.grounded || P.groundBox != null;
      W.flow.best = Math.max(W.flow.best, W.flow.count);
      W.events.push({ type: "finish", time: W.time, stars: W.starCount, falls: W.falls });
    }
  }
}

function falls(W, dt) {
  const P = W.player;
  if (P.state === S.FINISHED) return;
  if (P.state === S.FALLING_OUT) {
    W.fadeT += dt;
    if (W.fadeT >= W.T.FALL_FADE_TIME) {
      resetPlayerAt(P, W, W.checkpoint);
      setState(P, W, S.RESPAWN);
      W.respawnT = 0;
      W.time += W.T.RESPAWN_PENALTY;
      W.events.push({ type: "respawn", x: P.x, y: P.y, z: P.z, yaw: W.checkpoint.yaw || 0, penalty: W.T.RESPAWN_PENALTY });
    }
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
  if (P.y < W.level.killY) {
    W.falls++;
    W.stats.falls++;
    W.fadeT = 0;
    P.vault = null;
    P.wall = null;
    P.ledge = null;
    setState(P, W, S.FALLING_OUT);
    W.flow.count = 0;
    W.flow.label = null;
    W.events.push({ type: "fall", x: P.x, y: P.y, z: P.z });
  }
}

/* ------------------------------------------------------------------ flow + stats from events */

const FLOW_ACTIONS = { vault: 1, wallrun: 1, walljump: 1, dash: 1, slide: 1, climb: 1, gap: 1 };

function bumpFlow(W, kind, add = 1) {
  const F = W.flow;
  if (W.clock - F.last > FLOW.WINDOW) F.count = 0;
  F.count += add;
  F.last = W.clock;
  F.score += F.count;
  F.best = Math.max(F.best, F.count);
  let label = null;
  for (const [n, l] of FLOW.LABELS) {
    if (F.count >= n) {
      label = l;
      break;
    }
  }
  if (label && label !== F.label) W.events.push({ type: "flow", label, count: F.count });
  F.label = label;
}

function drainFlow(W) {
  // count stats + flow from this step's movement events (events stay queued for the renderer/UI)
  const E = W.events;
  for (let i = W._flowSeen || 0; i < E.length; i++) {
    const e = E[i];
    switch (e.type) {
      case "jump":
        W.stats.jumps++;
        break;
      case "vault":
        W.stats.vaults++;
        break;
      case "slide":
        W.stats.slides++;
        break;
      case "wallrun":
        W.stats.wallRuns++;
        break;
      case "walljump":
        W.stats.wallJumps++;
        break;
      case "dash":
        W.stats.dashes++;
        break;
      case "climb":
        W.stats.ledges++;
        break;
      case "stumble":
        W.stats.stumbles++;
        W.flow.count = 0;
        W.flow.label = null;
        break;
      case "land": {
        // crossing a gap (landing on a different roof than the take-off) keeps the flow going
        const gb = W.player.groundBox;
        if (gb && W._airFrom && gb !== W._airFrom && e.fallH > -3) bumpFlow(W, "gap");
        break;
      }
      default:
    }
    if (FLOW_ACTIONS[e.type]) bumpFlow(W, e.type);
  }
  W._flowSeen = E.length;
  const P = W.player;
  if (P.grounded && P.groundBox) {
    W._lastGround = P.groundBox;
    W._airFrom = P.groundBox;
  }
  // chain expires quietly
  if (W.flow.count && W.clock - W.flow.last > FLOW.WINDOW) {
    W.flow.count = 0;
    W.flow.label = null;
  }
}

/** renderer / UI take the queued events once per frame */
export function drainEvents(W) {
  const e = W.events;
  W.events = [];
  W._flowSeen = 0;
  return e;
}

/** active tutorial hint zone (UI decides whether to show it) */
export function hintAt(W) {
  const P = W.player;
  const hints = W.level.hints || [];
  for (let i = 0; i < hints.length; i++) {
    const h = hints[i];
    if (P.x > h.min[0] && P.x < h.max[0] && P.z > h.min[1] && P.z < h.max[1] && P.y > (h.y ?? -1e9) - 3) return h;
  }
  return null;
}

/** Restart the level in place (Retry / shared Restart): fresh run, same world object. */
export function restartWorld(W) {
  const spawn = W.level.spawn;
  for (const c of W.crumbles) {
    c.state = "solid";
    c.t = 0;
    c.box.solid = true;
    c.box.active = true;
  }
  for (const h of W.hazards) h.hitCooldown = 0;
  W.cpIndex = -1;
  W.checkpoint = { ...spawn };
  W.stars = W.stars.map(() => false);
  W.starCount = 0;
  W.finished = false;
  W.finishTime = 0;
  W.time = 0;
  W.started = false;
  W.falls = 0;
  W.fadeT = 0;
  W.respawnT = 0;
  W.events = [];
  W._flowSeen = 0;
  W.acc = 0;
  W.pending = { jump: false, dash: false, slide: false };
  W.flow = { count: 0, last: -99, best: 0, label: null, score: 0 };
  W.stats = { jumps: 0, vaults: 0, slides: 0, wallRuns: 0, wallJumps: 0, dashes: 0, ledges: 0, falls: 0, checkpoints: 0, distance: 0, stumbles: 0 };
  W.camYaw = spawn.yaw || 0;
  W.player.finished = false;
  resetPlayerAt(W.player, W, spawn);
  W.events.push({ type: "restart", x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw || 0 });
}
