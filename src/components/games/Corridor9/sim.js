/**
 * Corridor 9 — deterministic game simulation. No Three.js, no DOM: the
 * component feeds it input, world.js draws it, tools/simTest.mjs runs it in
 * Node.
 *
 * State per loop: { index, anomaly (id | null), final, seed }. The loop is
 * judged exactly once, the moment the player crosses J1 (kept going) or J0
 * (turned back); the same frame teleports them to the start of the next
 * loop, so a crossing can never fire twice.
 */
import {
  W, L, J0, J1, T, EYE, RADIUS, WALK, RUN, GOAL, ANOMALY_CHANCE, ANOMALY_IDS,
  WALK_RECTS, PROPS, BENCH_SIZE, DOOR_W, DOOR_AJAR,
} from "./data.js";

/** mulberry32 — small seeded PRNG */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrapAngle = (a) => {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Axis-aligned box around a (possibly rotated) bench footprint. */
export function benchBox(b) {
  const c = Math.abs(Math.cos(b.rot)), s = Math.abs(Math.sin(b.rot));
  const ex = c * BENCH_SIZE.depth / 2 + s * BENCH_SIZE.len / 2;
  const ez = s * BENCH_SIZE.depth / 2 + c * BENCH_SIZE.len / 2;
  return [b.x - ex, b.x + ex, b.z - ez, b.z + ez];
}
/** Swing of the ajar door into the corridor (hinge on its north edge, so
 *  the dark gap faces you as you walk up the corridor). */
export function ajarDoorBox() {
  const d = PROPS.doors[1];
  const hz = d.z + DOOR_W / 2;
  return [-W / 2, -W / 2 + Math.sin(DOOR_AJAR) * DOOR_W + 0.04, hz - Math.cos(DOOR_AJAR) * DOOR_W - 0.04, hz];
}

/** Obstacles for a loop's anomaly. */
export function obstaclesFor(anomaly) {
  const out = [benchBox(anomaly === "bench" ? PROPS.benchMoved : PROPS.bench)];
  if (anomaly === "door") out.push(ajarDoorBox());
  return out;
}

/** Can a circle of `r` stand at (x, z)? */
export function free(x, z, obstacles, r = RADIUS) {
  let inside = false;
  for (const [x0, x1, z0, z1] of WALK_RECTS) {
    if (x >= x0 + r && x <= x1 - r && z >= z0 + r && z <= z1 - r) {
      inside = true;
      break;
    }
  }
  if (!inside) return false;
  for (const [x0, x1, z0, z1] of obstacles) {
    // circle vs box
    const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return false;
  }
  return true;
}

/** Which part of the passage a point is in. */
export function regionAt(x, z) {
  if (z < 0) return x < -W / 2 ? "south-connector" : "south-corner";
  if (z > L) return x > W / 2 ? "north-connector" : "north-corner";
  return "main";
}

/**
 * Pure next-loop roll. Uses a shuffle bag so every anomaly turns up before
 * any repeats, and never the same anomaly twice in a row.
 */
export function rollLoop(state, rand) {
  const index = state.loopIndex + 1;
  if (state.progress >= GOAL) return { index, anomaly: null, final: true };
  if (state.forceNormal) return { index, anomaly: null, final: false };
  if (rand() >= state.chance) return { index, anomaly: null, final: false };
  if (!state.bag.length) {
    const bag = ANOMALY_IDS.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag[bag.length - 1] === state.lastAnomaly && bag.length > 1) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    state.bag = bag;
  }
  const anomaly = state.bag.pop();
  return { index, anomaly, final: false };
}

/** Start position: just inside the south connector, facing down it (east). */
export const START = { x: J0.x + 0.9, z: J0.z, yaw: -Math.PI / 2 };

export function createGame({ seed = (Math.random() * 2 ** 32) >>> 0, chance = ANOMALY_CHANCE, forced = null } = {}) {
  const rand = rng(seed);
  const g = {
    seed,
    t: 0,
    state: "play", // play | won
    progress: 0,
    best: 0,
    mistakes: 0,
    found: 0, // anomalies correctly turned back from
    loops: 0, // decisions made
    loopTime: 0,
    events: [],
    history: [],
    // loop bookkeeping (kept on the object so rollLoop stays pure-ish)
    roll: { loopIndex: -1, progress: 0, chance, bag: [], lastAnomaly: null, forceNormal: true },
    forced, // tests: array of anomaly ids / null to play in order
    loop: null,
    player: { x: START.x, z: START.z, yaw: START.yaw, pitch: 0, vx: 0, vz: 0, stride: 0, bob: 0, moving: 0, speed: 0 },
    obstacles: [],
    enteredMain: false,
  };

  const nextLoop = () => {
    const r = g.roll;
    r.progress = g.progress;
    let loop;
    if (g.forced && g.forced.length && g.progress < GOAL) {
      loop = { index: r.loopIndex + 1, anomaly: g.forced.shift(), final: false };
    } else loop = rollLoop(r, rand);
    r.loopIndex = loop.index;
    r.forceNormal = false;
    if (loop.anomaly) r.lastAnomaly = loop.anomaly;
    loop.exit = g.progress;
    g.loop = loop;
    g.loopTime = 0;
    g.enteredMain = false;
    g.obstacles = obstaclesFor(loop.anomaly);
    g.events.push({ type: "loop", loop });
  };

  const judge = (dir) => {
    const loop = g.loop;
    const correct = dir === "back" ? !!loop.anomaly : !loop.anomaly;
    const before = g.progress;
    if (correct) {
      g.progress += 1;
      if (loop.anomaly) g.found += 1;
    } else {
      g.progress = 0;
      g.mistakes += 1;
    }
    g.best = Math.max(g.best, g.progress);
    g.loops += 1;
    const rec = { loop: loop.index, anomaly: loop.anomaly, dir, correct, before, after: g.progress, t: g.t };
    g.history.push(rec);
    g.events.push({ type: "decision", ...rec });
  };

  /** Called after movement. Returns true when a crossing was handled. */
  const crossings = () => {
    const P = g.player;
    if (P.x > J1.x && P.z > L) {
      if (g.loop.final) {
        g.state = "won";
        g.loops += 1;
        g.history.push({ loop: g.loop.index, anomaly: null, dir: "forward", correct: true, before: g.progress, after: g.progress, t: g.t, win: true });
        g.events.push({ type: "win" });
        return true;
      }
      judge("forward");
      P.x -= T.x;
      P.z -= T.z;
      nextLoop();
      return true;
    }
    if (P.x < J0.x && P.z < 0) {
      judge("back");
      // 180° turn about J0: you walked back out of the loop, and you walk
      // into the next one facing forward again
      P.x = 2 * J0.x - P.x;
      P.z = 2 * J0.z - P.z;
      P.yaw = wrapAngle(P.yaw + Math.PI);
      P.vx = -P.vx;
      P.vz = -P.vz;
      nextLoop();
      return true;
    }
    return false;
  };

  /** Move with axis-separated sliding, sub-stepped so nothing tunnels. */
  const move = (dx, dz) => {
    const P = g.player;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
    const sx = dx / n, sz = dz / n;
    for (let i = 0; i < n; i++) {
      if (free(P.x + sx, P.z, g.obstacles)) P.x += sx;
      else P.vx = 0;
      if (free(P.x, P.z + sz, g.obstacles)) P.z += sz;
      else P.vz = 0;
      if (crossings()) return;
    }
  };

  g.look = (dx, dy, sens = 1) => {
    const P = g.player;
    const k = 0.0021 * sens;
    P.yaw = wrapAngle(P.yaw - dx * k);
    P.pitch = Math.max(-1.3, Math.min(1.3, P.pitch - dy * k));
  };

  g.update = (dt, input = {}) => {
    if (g.state !== "play") return;
    g.t += dt;
    g.loopTime += dt;
    const P = g.player;
    const f = (input.f ? 1 : 0) - (input.b ? 1 : 0);
    const s = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    // forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const len = Math.hypot(wx, wz);
    const speed = input.sprint ? RUN : WALK;
    if (len > 0) {
      wx = (wx / len) * speed;
      wz = (wz / len) * speed;
    }
    const a = 1 - Math.exp(-dt * (len > 0 ? 9 : 12));
    P.vx += (wx - P.vx) * a;
    P.vz += (wz - P.vz) * a;
    if (Math.abs(P.vx) < 1e-3 && !len) P.vx = 0;
    if (Math.abs(P.vz) < 1e-3 && !len) P.vz = 0;
    const before = { x: P.x, z: P.z, loop: g.loop.index };
    move(P.vx * dt, P.vz * dt);
    if (g.state !== "play") return;
    // distance walked → footsteps + head bob (teleports don't count)
    const d = g.loop.index === before.loop ? Math.hypot(P.x - before.x, P.z - before.z) : Math.hypot(P.vx, P.vz) * dt;
    P.speed = d / Math.max(dt, 1e-6);
    P.moving += ((P.speed > 0.3 ? 1 : 0) - P.moving) * Math.min(1, dt * 8);
    P.stride += d;
    P.bob += d * (Math.PI * 2) / 1.3;
    const strideLen = P.speed > WALK + 0.3 ? 0.82 : 0.66;
    if (P.stride >= strideLen) {
      P.stride -= strideLen;
      g.events.push({ type: "step", run: P.speed > WALK + 0.3 });
    }
    if (!g.enteredMain && P.z > 0.3 && P.z < L) {
      g.enteredMain = true;
      g.events.push({ type: "enterMain" });
    }
  };

  /** camera position (eye) for the renderer */
  g.eye = () => {
    const P = g.player;
    const bobY = Math.sin(P.bob) * 0.028 * P.moving;
    const bobX = Math.cos(P.bob * 0.5) * 0.018 * P.moving;
    return { x: P.x + Math.cos(P.yaw) * bobX, y: EYE + bobY, z: P.z - Math.sin(P.yaw) * bobX };
  };

  nextLoop();
  return g;
}
