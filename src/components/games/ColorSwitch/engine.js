/**
 * Color Switch — pure game logic (no React, no DOM), tested in Node:
 * `node src/components/games/ColorSwitch/tools/engineTest.mjs`.
 *
 * World units are logical pixels; y grows downward, so climbing means the
 * ball's y gets more negative. The ball always sits on x = 0 and every
 * obstacle is centred on that column. The state object is mutated in place
 * (it lives in a ref and is drawn every frame); `step` returns the events of
 * that frame (jump / star / switch / pass / die) for sound and particles.
 *
 * Status flows ready -> playing <-> paused -> over.
 */
export const COLORS = ["#22e4ff", "#ff3d9a", "#ffd23f", "#9b5cff"]; // cyan, pink, yellow, violet
export const GRAVITY = 1500;
export const JUMP_V = -500;
export const MAX_FALL = 900;
export const BALL_R = 11;
export const STAR_R = 15;
export const SWITCH_R = 15;
export const RING_T = 18; // band thickness
const TAU = Math.PI * 2;
const QUARTER = Math.PI / 2;
const FIRST_Y = -320; // first ring centre, the ball starts at y = 0

const mod = (a, n) => ((a % n) + n) % n;

/** Spacing, spin speed and the chance of a double ring for the n-th obstacle. */
export function difficulty(n) {
  return {
    gap: Math.max(420, 500 - n * 5),
    speed: Math.min(3.1, 1.25 + n * 0.08),
    double: n >= 4 ? Math.min(0.5, 0.2 + (n - 4) * 0.03) : 0,
  };
}

function makeObstacle(n, y, rng) {
  const d = difficulty(n);
  const dir = rng() < 0.5 ? -1 : 1;
  const rot = rng() * TAU;
  const rings =
    rng() < d.double
      ? [
          { r: 118, rot, speed: d.speed * 0.85 * dir },
          // mirror image of the outer ring (reversed colours, opposite spin), so
          // both always show the same colour at the top and bottom crossings
          { r: 76, rot: mod(Math.PI - rot, TAU), speed: -d.speed * 0.85 * dir, flip: true },
        ]
      : [{ r: 108, rot, speed: d.speed * dir }];
  return { n, y, rings, star: true, passed: false, flash: 0, switchY: y - d.gap / 2, switcher: true };
}

export function create(best = 0, rng = Math.random) {
  const g = {
    status: "ready",
    ball: { y: 0, vy: 0, color: Math.floor(rng() * 4) },
    camY: -720 * 0.72, // ball rests 72% down the view
    viewH: 720,
    obstacles: [],
    next: 0, // index of the next obstacle to spawn
    nextY: FIRST_Y,
    score: 0,
    best,
    startBest: best,
    time: 0,
    overAt: 0,
    rng,
  };
  fill(g);
  return g;
}

/** Keep obstacles spawned a screen ahead and dropped once far below. */
function fill(g) {
  while (g.nextY > g.camY - g.viewH) {
    const o = makeObstacle(g.next, g.nextY, g.rng);
    g.obstacles.push(o);
    g.nextY -= difficulty(g.next).gap;
    g.next++;
  }
  const floor = g.camY + g.viewH + 200;
  g.obstacles = g.obstacles.filter((o) => o.y - 140 < floor);
}

export function setViewHeight(g, h) {
  if (g.status === "ready") g.camY += g.viewH * 0.72 - h * 0.72;
  g.viewH = h;
  fill(g);
}

/** Colour of segment k of `ring` (a flipped ring lists its colours backwards). */
export const segColor = (ring, k) => (ring.flip ? 3 - k : k);

/** Colour index of `ring` at world angle `a` (canvas angles, y down). */
export function segmentAt(ring, a) {
  return segColor(ring, Math.floor(mod(a - ring.rot, TAU) / QUARTER) % 4);
}

/**
 * Does the ball (at signed offset `dy` from the ring centre, positive = below)
 * touch a segment of a colour other than `color`? The ball's angular width is
 * checked at both edges so straddling a seam counts as touching both colours.
 */
export function ringHits(ring, dy, color) {
  const d = Math.abs(dy);
  if (d + BALL_R <= ring.r - RING_T / 2 || d - BALL_R >= ring.r + RING_T / 2) return false;
  const a = dy < 0 ? -QUARTER : QUARTER;
  const half = Math.asin(Math.min(1, BALL_R / Math.max(d, BALL_R)));
  return segmentAt(ring, a - half) !== color || segmentAt(ring, a + half) !== color;
}

export function jump(g) {
  if (g.status === "over" || g.status === "paused") return false;
  if (g.status === "ready") g.status = "playing";
  g.ball.vy = JUMP_V;
  return true;
}

export function togglePause(g) {
  if (g.status === "playing") g.status = "paused";
  else if (g.status === "paused") g.status = "playing";
}

function die(g, events) {
  g.status = "over";
  g.overAt = g.time;
  events.push({ type: "die", y: g.ball.y, color: g.ball.color });
}

/** Advance `dt` seconds. Returns this frame's events. */
export function step(g, dt) {
  const events = [];
  if (g.status === "paused") return events;
  dt = Math.min(dt, 0.05);
  g.time += dt;
  for (const o of g.obstacles) {
    for (const r of o.rings) r.rot = mod(r.rot + r.speed * dt, TAU);
    o.flash = Math.max(0, o.flash - dt * 2.5);
  }
  if (g.status !== "playing") return events;

  const b = g.ball;
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
  b.y += b.vy * dt;

  for (const o of g.obstacles) {
    const dy = b.y - o.y;
    if (o.rings.some((r) => ringHits(r, dy, b.color))) {
      die(g, events);
      return events;
    }
    if (o.star && Math.abs(dy) < BALL_R + STAR_R) {
      o.star = false;
      g.score++;
      if (g.score > g.best) g.best = g.score;
      events.push({ type: "star", y: o.y });
    }
    if (o.switcher && Math.abs(b.y - o.switchY) < BALL_R + SWITCH_R) {
      o.switcher = false;
      b.color = (b.color + 1 + Math.floor(g.rng() * 3)) % 4; // always a different colour
      events.push({ type: "switch", y: o.switchY, color: b.color });
    }
    if (!o.passed && dy < -((o.rings[0]?.r ?? 0) + RING_T / 2 + BALL_R)) {
      o.passed = true;
      o.flash = 1;
      events.push({ type: "pass", y: o.y });
    }
  }

  // Camera only ever climbs, easing toward keeping the ball a bit above centre.
  const target = b.y - g.viewH * 0.55;
  if (target < g.camY) g.camY += (target - g.camY) * Math.min(1, dt * 7);
  fill(g);

  if (b.y - BALL_R > g.camY + g.viewH) die(g, events);
  return events;
}
