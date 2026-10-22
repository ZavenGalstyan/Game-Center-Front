/**
 * Flappy Wings engine — pure, framework-free game state + fixed-substep
 * physics. The world is a fixed 640 units tall; its width follows the
 * container's aspect ratio (`s.W`, set by the component on resize).
 *
 * step() returns a list of event names ("tick", "go", "flap", "score",
 * "hit", "land") the component turns into sounds.
 */
export const H = 640;
export const GROUND_H = 96;
export const PLAY_H = H - GROUND_H;
export const BIRD_R = 16; // drawn size
export const HIT_R = 12.5; // a touch forgiving vs. the artwork
export const PIPE_W = 84;
export const CAP_H = 30;
export const CAP_LIP = 5;

const GRAVITY = 1650;
const FLAP_V = -500;
const MAX_FALL = 780;
// Horizontal distance between pipe pairs grows with speed, so the time
// between pairs shrinks gently (1.6s → 1.25s) instead of collapsing.
const spacingFor = (speed) => 270 + (speed - 170) * 0.6;
const EDGE = 64; // min distance from a gap to the ceiling / ground
const MAX_RISE = 130; // max upward shift of the gap between consecutive pairs
const MAX_DROP = 170;
const COUNTDOWN = 3;
const SUBSTEP = 1 / 120;

/** Pipes speed up and gaps narrow over the first 40 points, then hold. */
export const speedFor = (score) => 170 + Math.min(score, 40) * 2; // 170 → 250
export const gapFor = (score) => 182 - Math.min(score, 40) * 1.05; // 182 → 140

export function create(best = 0, W = 400) {
  return {
    phase: "menu", // menu | countdown | playing | paused | over
    W,
    time: 0,
    scroll: 0,
    countdown: 0,
    score: 0,
    best,
    startBest: best,
    bird: { y: PLAY_H * 0.45, vy: 0, rot: 0, wing: 0 },
    pipes: [],
    pops: [],
    bump: 0,
    flash: 0,
    overAt: 0,
  };
}

export const birdX = (s) => Math.round(Math.min(s.W * 0.3, 250));

/** Fresh round straight into the 3-2-1 countdown. */
export function begin(s) {
  Object.assign(s, create(s.best, s.W), { phase: "countdown", countdown: COUNTDOWN, time: s.time, scroll: s.scroll });
}

export function flap(s) {
  if (s.phase !== "playing") return false;
  s.bird.vy = FLAP_V;
  return true;
}

export function togglePause(s) {
  if (s.phase === "playing" || s.phase === "countdown") {
    s.resumeTo = s.phase;
    s.phase = "paused";
  } else if (s.phase === "paused") {
    s.phase = s.resumeTo || "playing";
  }
}

function spawn(s, rand) {
  const last = s.pipes[s.pipes.length - 1];
  const gap = gapFor(s.score + s.pipes.filter((p) => !p.scored).length);
  const lo = EDGE + gap / 2;
  const hi = PLAY_H - EDGE - gap / 2;
  let min = lo;
  let max = hi;
  // Keep consecutive gaps reachable: you can fall far, but climb only so fast.
  if (last) {
    min = Math.max(lo, last.cy - MAX_RISE);
    max = Math.min(hi, last.cy + MAX_DROP);
  }
  const cy = min + rand() * (max - min);
  s.pipes.push({ x: last ? last.x + spacingFor(speedFor(s.score)) : s.W + 140, cy, gap, scored: false });
}

/** Rectangles of one pipe pair (bodies + caps), in world units. */
export function pipeRects(p) {
  const top = p.cy - p.gap / 2;
  const bot = p.cy + p.gap / 2;
  return [
    { x: p.x, y: -2000, w: PIPE_W, h: 2000 + top - CAP_H },
    { x: p.x - CAP_LIP, y: top - CAP_H, w: PIPE_W + CAP_LIP * 2, h: CAP_H },
    { x: p.x - CAP_LIP, y: bot, w: PIPE_W + CAP_LIP * 2, h: CAP_H },
    { x: p.x, y: bot + CAP_H, w: PIPE_W, h: PLAY_H - bot },
  ];
}

export function circleHitsRect(cx, cy, r, b) {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
  const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function physics(b, dt) {
  b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
  b.y += b.vy * dt;
  const target = b.vy < 0 ? -0.42 : Math.min(1.45, (b.vy / MAX_FALL) * 1.9 - 0.35);
  b.rot += (target - b.rot) * Math.min(1, dt * (b.vy < 0 ? 18 : 6));
}

function substep(s, dt, rand, ev) {
  const b = s.bird;
  s.time += dt;
  s.pops = s.pops.filter((p) => (p.t += dt) < 0.8);
  s.bump = Math.max(0, s.bump - dt * 4);
  s.flash = Math.max(0, s.flash - dt * 3);

  if (s.phase === "menu" || s.phase === "countdown") {
    s.scroll += speedFor(0) * dt;
    b.wing += dt * 14;
    b.y = PLAY_H * 0.45 + Math.sin(s.time * 3.2) * 9;
    b.rot = Math.sin(s.time * 3.2 + 1) * 0.06;
    if (s.phase === "countdown") {
      const before = Math.ceil(s.countdown);
      s.countdown -= dt;
      if (s.countdown <= 0) {
        s.phase = "playing";
        b.vy = FLAP_V;
        ev.push("go");
      } else if (Math.ceil(s.countdown) !== before) ev.push("tick");
    }
    return;
  }

  if (s.phase === "over") {
    if (b.y + HIT_R < PLAY_H) {
      physics(b, dt);
      b.rot = Math.min(1.57, b.rot + dt * 6);
      if (b.y + HIT_R >= PLAY_H) {
        b.y = PLAY_H - HIT_R;
        ev.push("land");
      }
    }
    return;
  }

  // playing
  const speed = speedFor(s.score);
  s.scroll += speed * dt;
  b.wing += dt * (b.vy < 0 ? 26 : 13);
  for (const p of s.pipes) p.x -= speed * dt;
  while (s.pipes.length && s.pipes[0].x + PIPE_W + CAP_LIP < -10) s.pipes.shift();
  while (!s.pipes.length || s.pipes[s.pipes.length - 1].x < s.W + 40) spawn(s, rand);
  physics(b, dt);

  const bx = birdX(s);
  for (const p of s.pipes) {
    if (!p.scored && p.x + PIPE_W < bx) {
      p.scored = true;
      s.score += 1;
      s.bump = 1;
      s.pops.push({ x: bx + 10, y: b.y - 34, t: 0 });
      ev.push("score");
    }
  }

  let hit = b.y - HIT_R <= 0 || b.y + HIT_R >= PLAY_H;
  if (!hit) {
    for (const p of s.pipes) {
      if (p.x - CAP_LIP > bx + HIT_R || p.x + PIPE_W + CAP_LIP < bx - HIT_R) continue;
      if (pipeRects(p).some((r) => circleHitsRect(bx, b.y, HIT_R, r))) {
        hit = true;
        break;
      }
    }
  }
  if (hit) {
    s.phase = "over";
    s.overAt = s.time;
    s.flash = 1;
    b.y = Math.max(HIT_R, Math.min(b.y, PLAY_H - HIT_R));
    if (b.vy < 0) b.vy = 0;
    if (s.score > s.best) s.best = s.score;
    ev.push("hit");
  }
}

/** Advance by a frame's dt (clamped, split into small fixed substeps). */
export function step(s, dt, rand = Math.random) {
  const ev = [];
  if (s.phase === "paused") return ev;
  let left = Math.min(Math.max(dt, 0), 0.05);
  while (left > 1e-6) {
    const d = Math.min(SUBSTEP, left);
    substep(s, d, rand, ev);
    left -= d;
  }
  return ev;
}
