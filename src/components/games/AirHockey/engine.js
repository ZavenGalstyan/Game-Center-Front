/**
 * Air Hockey — pure game state + physics, no DOM. Table space is W×H logical
 * units, origin top-left; the AI defends the top goal, the player the bottom.
 * `step(g, dt)` advances the match and returns a list of events for sound/FX.
 */
export const W = 420;
export const H = 720;
export const PUCK_R = 15;
export const PAD_R = 30;
export const GOAL_W = 150;
export const WIN_SCORE = 7;
export const MAX_PUCK_V = 1500;
export const CORNER_R = 64; // rounded table corners, so nothing gets wedged
const PLAYER_V = 2600; // player paddle chases the pointer at most this fast
const FRICTION = 0.32; // per-second exponential decay of puck speed
const WALL_E = 0.9; // wall restitution
const HIT_E = 0.92; // paddle restitution
const GOAL_PAUSE = 1.4; // seconds the "GOAL!" moment lasts
const CX = W / 2;

export const DIFFICULTY = {
  easy: { speed: 360, react: 0.3, error: 46, bounces: 0, attackLine: 0.3, defY: 64, counter: 0 },
  medium: { speed: 620, react: 0.14, error: 24, bounces: 1, attackLine: 0.42, defY: 72, counter: 40 },
  hard: { speed: 1080, react: 0.04, error: 5, bounces: 3, attackLine: 0.5, defY: 80, counter: 90 },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const homeOf = (side) => ({ x: CX, y: side === "ai" ? 90 : H - 90 });

/** If a circle of radius r at (x, y) pokes out of a rounded corner, the
 *  point it must move back to plus the outward normal; otherwise null. */
function cornerPush(x, y, r) {
  const cx = x < CORNER_R ? CORNER_R : x > W - CORNER_R ? W - CORNER_R : null;
  const cy = y < CORNER_R ? CORNER_R : y > H - CORNER_R ? H - CORNER_R : null;
  if (cx === null || cy === null) return null;
  const d = Math.hypot(x - cx, y - cy);
  const max = CORNER_R - r;
  if (d <= max || d < 1e-6) return null;
  const nx = (x - cx) / d;
  const ny = (y - cy) / d;
  return { x: cx + nx * max, y: cy + ny * max, nx, ny };
}

/** Paddle centres stay inside their own half, off the walls and corners. */
export function clampPaddle(side, x, y) {
  const p = {
    x: clamp(x, PAD_R, W - PAD_R),
    y: side === "ai" ? clamp(y, PAD_R, H / 2 - PAD_R) : clamp(y, H / 2 + PAD_R, H - PAD_R),
  };
  const c = cornerPush(p.x, p.y, PAD_R);
  return c ? { x: c.x, y: c.y } : p;
}

const paddle = (side) => ({ ...homeOf(side), vx: 0, vy: 0, side });

export function create(difficulty = "medium", rand = Math.random) {
  return {
    status: "ready", // ready | playing | paused | goal | over
    difficulty,
    rand,
    score: { player: 0, ai: 0 },
    puck: { x: CX, y: H / 2, vx: 0, vy: 0 },
    player: paddle("player"),
    ai: paddle("ai"),
    target: homeOf("player"), // where the pointer wants the player paddle
    aiTarget: homeOf("ai"),
    aiTimer: 0,
    aiStuck: 0, // seconds the puck has been sitting dead in the AI's half
    lastScorer: null,
    winner: null,
    timer: 0, // goal-pause countdown
    time: 0,
  };
}

/** Puck goes to the side that just conceded (or centre-of-player half to start). */
function resetPositions(g, servingSide) {
  g.puck = { x: CX, y: servingSide === "ai" ? H * 0.27 : H * 0.73, vx: 0, vy: 0 };
  g.player = paddle("player");
  g.ai = paddle("ai");
  g.target = homeOf("player");
  g.aiTarget = homeOf("ai");
  g.aiTimer = 0;
}

export function start(g, difficulty = g.difficulty) {
  const rand = g.rand;
  Object.assign(g, create(difficulty, rand));
  resetPositions(g, "player");
  g.status = "playing";
}

export function togglePause(g) {
  if (g.status === "playing") g.status = "paused";
  else if (g.status === "paused") g.status = "playing";
}

/** Pointer position in table units → where the player paddle should go. */
export function setTarget(g, x, y) {
  g.target = clampPaddle("player", x, y);
}

/** x where a puck at (x, vx) lands after travelling `dy` with up to `bounces` wall reflections. */
export function predictX(x, vx, vy, toY, y, bounces) {
  if (vy === 0) return x;
  const t = (toY - y) / vy;
  if (t <= 0) return x;
  let px = x + vx * t;
  const lo = PUCK_R;
  const hi = W - PUCK_R;
  for (let i = 0; i < bounces && (px < lo || px > hi); i++) px = px < lo ? 2 * lo - px : 2 * hi - px;
  return clamp(px, lo, hi);
}

/** Closest distance from point (px, py) to the segment a→b. */
function segDist(ax, ay, bx, by, px, py) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return Math.hypot(ax + vx * t - px, ay + vy * t - py);
}

/** Re-evaluated every `react` seconds: plan a target, then make sure getting
 *  there doesn't sweep through a puck that sits between us and our own goal. */
function aiThink(g) {
  const strike = aiPlan(g);
  const { puck, ai, aiTarget: t } = g;
  if (strike || puck.y >= ai.y) return;
  const reach = PAD_R + PUCK_R + 6;
  const fx = puck.x + puck.vx * 0.1;
  const fy = puck.y + puck.vy * 0.1;
  if (Math.min(segDist(ai.x, ai.y, t.x, t.y, puck.x, puck.y), segDist(ai.x, ai.y, t.x, t.y, fx, fy)) > reach) return;
  let s = ai.x > puck.x ? 1 : ai.x < puck.x ? -1 : puck.x < CX ? 1 : -1;
  const x = puck.x + s * (reach + 10);
  if (x > W - PAD_R || x < PAD_R) s = -s;
  g.aiTarget = clampPaddle("ai", puck.x + s * (reach + 10), Math.max(ai.y, puck.y + reach * 0.6));
}

/** Pick g.aiTarget; returns true when the move is a deliberate strike or block. */
function aiPlan(g) {
  const d = DIFFICULTY[g.difficulty] || DIFFICULTY.medium;
  const { puck, ai } = g;
  if (g.aiStuck > 1.4) {
    // Been pinning a dead puck: back off and let the air cushion free it.
    g.aiTarget = homeOf("ai");
    if (g.aiStuck > 2.2) g.aiStuck = 0;
    return false;
  }
  const err = (g.rand() - 0.5) * 2 * d.error;
  const slow = Math.hypot(puck.vx, puck.vy) < 160;
  const inHalf = puck.y < H * d.attackLine + PUCK_R || (slow && puck.y < H / 2 + PUCK_R);
  const incomingFast = puck.vy < -260;

  if (puck.y < d.defY && !slow) {
    // Live puck deep in our end: drop onto the goal line and cover the mouth,
    // meeting it at the near post where the boards still bounce it away.
    const x = clamp(puck.x, CX - GOAL_W / 2 + 4, CX + GOAL_W / 2 - 4);
    g.aiTarget = clampPaddle("ai", x + err * 0.2, PAD_R);
    return true;
  }
  if (inHalf && puck.y < PAD_R + PUCK_R && !incomingFast) {
    // Puck on our end line: nobody can get behind it, so sweep it sideways from the near side.
    const s = ai.x >= puck.x ? 1 : -1;
    const level = ai.y < puck.y + PAD_R;
    g.aiTarget = clampPaddle("ai", level ? puck.x - s * 50 : puck.x + s * 70, level ? PAD_R : PAD_R + 4);
    return false;
  }
  if (inHalf && !incomingFast) {
    // Attack: line up behind the puck relative to the player's goal, then drive through it.
    const aimX = CX + (g.rand() - 0.5) * GOAL_W * 0.9;
    let dx = aimX - puck.x;
    let dy = H - puck.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const rx = ai.x - puck.x;
    const ry = ai.y - puck.y;
    const behind = rx * dx + ry * dy; // < 0 means the paddle is on the far side from the aim
    const side = Math.abs(rx * dy - ry * dx);
    const back = PAD_R + PUCK_R + 10;
    const stage = clampPaddle("ai", puck.x - dx * back, puck.y - dy * back);
    const staged = Math.hypot(ai.x - stage.x, ai.y - stage.y) < 10;
    if ((behind < -back * 0.6 && side < PUCK_R) || staged) {
      // lined up: drive straight through the puck
      g.aiTarget = clampPaddle("ai", puck.x + dx * 50 + err * 0.3, puck.y + dy * 50);
      return true;
    } else if (behind < -PUCK_R) {
      g.aiTarget = stage;
    } else {
      // Puck is between us and our goal: detour round it without touching it.
      let s = rx > 0 ? 1 : rx < 0 ? -1 : puck.x < CX ? 1 : -1;
      if (puck.x + s * (back + 6) > W - PAD_R || puck.x + s * (back + 6) < PAD_R) s = -s;
      const x = puck.x + s * (back + 6);
      const clear = Math.abs(rx) > back;
      g.aiTarget = clampPaddle("ai", x, clear ? puck.y - back * 0.8 : Math.max(ai.y, puck.y + back * 0.8));
    }
    return false;
  }
  if (puck.vy < 0) {
    // Defend: get between the puck and the goal at the predicted crossing.
    const px = predictX(puck.x, puck.vx, puck.vy, d.defY, puck.y, d.bounces);
    const x = clamp(px + err, CX - GOAL_W / 2, CX + GOAL_W / 2);
    // When it's about to arrive and we're in line, step into it for a return shot.
    const eta = (puck.y - d.defY) / -puck.vy;
    if (d.counter && eta < 0.12 && Math.abs(px - x) < 1 && Math.abs(ai.x - x) < PUCK_R) {
      g.aiTarget = clampPaddle("ai", x, d.defY + d.counter);
      return true;
    }
    g.aiTarget = clampPaddle("ai", x, d.defY);
    return false;
  }
  // Idle: shadow the puck from in front of the goal.
  g.aiTarget = clampPaddle("ai", CX + (puck.x - CX) * 0.4 + err * 0.5, d.defY + 16);
  return false;
}

/** Move paddle p toward (tx, ty) at most `maxV` units/s. Returns the motion. */
function chase(p, tx, ty, maxV, dt) {
  let dx = tx - p.x;
  let dy = ty - p.y;
  const dist = Math.hypot(dx, dy);
  const maxD = maxV * dt;
  if (dist > maxD && dist > 0) {
    dx *= maxD / dist;
    dy *= maxD / dist;
  }
  return { dx, dy };
}

/** Circle–circle push-out + impulse with an infinitely heavy moving paddle. */
function hitPaddle(puck, p, pvx, pvy) {
  const dx = puck.x - p.x;
  const dy = puck.y - p.y;
  const dist = Math.hypot(dx, dy);
  const min = PUCK_R + PAD_R;
  if (dist >= min) return false;
  const nx = dist > 1e-6 ? dx / dist : 0;
  const ny = dist > 1e-6 ? dy / dist : p.side === "ai" ? 1 : -1;
  puck.x = p.x + nx * min;
  puck.y = p.y + ny * min;
  const rel = (puck.vx - pvx) * nx + (puck.vy - pvy) * ny;
  if (rel < 0) {
    puck.vx -= (1 + HIT_E) * rel * nx;
    puck.vy -= (1 + HIT_E) * rel * ny;
  }
  return true;
}

/** Walls, goal posts and goal mouths. Returns "wall" | "player" | "ai" (goal for) | null. */
function collideTable(puck) {
  let hit = null;
  const R = PUCK_R;
  puck.edge = puck.x < R + 6 || puck.x > W - R - 6;
  const corner = cornerPush(puck.x, puck.y, R);
  if (corner) {
    puck.x = corner.x;
    puck.y = corner.y;
    puck.edge = true;
    const rel = puck.vx * corner.nx + puck.vy * corner.ny;
    if (rel > 0) {
      puck.vx -= (1 + WALL_E) * rel * corner.nx;
      puck.vy -= (1 + WALL_E) * rel * corner.ny;
      hit = "wall";
    }
  }
  if (puck.x < R) {
    puck.x = R;
    if (puck.vx < 0) (puck.vx = -puck.vx * WALL_E), (hit = "wall");
  } else if (puck.x > W - R) {
    puck.x = W - R;
    if (puck.vx > 0) (puck.vx = -puck.vx * WALL_E), (hit = "wall");
  }
  const inMouth = Math.abs(puck.x - CX) < GOAL_W / 2;
  if (!inMouth) {
    if (puck.y < R + 6 || puck.y > H - R - 6) puck.edge = true;
    if (puck.y < R) {
      puck.y = R;
      if (puck.vy < 0) (puck.vy = -puck.vy * WALL_E), (hit = "wall");
    } else if (puck.y > H - R) {
      puck.y = H - R;
      if (puck.vy > 0) (puck.vy = -puck.vy * WALL_E), (hit = "wall");
    }
  }
  // goal posts are points at the mouth corners
  for (const py of [0, H]) {
    for (const px of [CX - GOAL_W / 2, CX + GOAL_W / 2]) {
      const dx = puck.x - px;
      const dy = puck.y - py;
      const d = Math.hypot(dx, dy);
      if (d < R && d > 1e-6) {
        const nx = dx / d;
        const ny = dy / d;
        puck.x = px + nx * R;
        puck.y = py + ny * R;
        const rel = puck.vx * nx + puck.vy * ny;
        if (rel < 0) {
          puck.vx -= (1 + WALL_E) * rel * nx;
          puck.vy -= (1 + WALL_E) * rel * ny;
          hit = "wall";
        }
      }
    }
  }
  // inside the mouth the puck is held between the posts until it crosses the line
  if (puck.y < 0 || puck.y > H) puck.x = clamp(puck.x, CX - GOAL_W / 2 + R, CX + GOAL_W / 2 - R);
  if (puck.y < -R) return "player";
  if (puck.y > H + R) return "ai";
  return hit;
}

function capSpeed(puck) {
  const v = Math.hypot(puck.vx, puck.vy);
  if (v > MAX_PUCK_V) {
    puck.vx *= MAX_PUCK_V / v;
    puck.vy *= MAX_PUCK_V / v;
  }
}

/** Advance the match by dt seconds. Returns [{type, ...}] events. */
export function step(g, dt) {
  const events = [];
  if (g.status === "paused" || g.status === "over" || dt <= 0) return events;
  g.time += dt;
  if (g.status === "ready") return events;
  if (g.status === "goal") {
    g.timer -= dt;
    if (g.timer <= 0) {
      resetPositions(g, g.lastScorer === "player" ? "ai" : "player");
      g.status = "playing";
    }
    return events;
  }

  const d = DIFFICULTY[g.difficulty] || DIFFICULTY.medium;
  const puck = g.puck;
  const speed = Math.hypot(puck.vx, puck.vy);
  g.aiStuck = speed < 60 && puck.y < H / 2 ? g.aiStuck + dt : 0;
  if (speed < 25 && puck.edge) {
    // air cushion: a dead puck resting on the boards pops back into play
    const tx = CX - puck.x;
    const ty = (puck.y < H / 2 ? H * 0.25 : H * 0.75) - puck.y;
    const len = Math.hypot(tx, ty) || 1;
    puck.vx = (tx / len) * 40;
    puck.vy = (ty / len) * 40;
  }
  g.aiTimer -= dt;
  if (g.aiTimer <= 0) {
    g.aiTimer = d.react;
    aiThink(g);
  }

  // Paddle motion this frame; substeps interpolate it so fast swings can't skip the puck.
  const pm = chase(g.player, g.target.x, g.target.y, PLAYER_V, dt);
  const am = chase(g.ai, g.aiTarget.x, g.aiTarget.y, d.speed, dt);
  const travel = Math.max(
    Math.hypot(puck.vx, puck.vy) * dt + Math.hypot(pm.dx, pm.dy),
    Math.hypot(puck.vx, puck.vy) * dt + Math.hypot(am.dx, am.dy),
  );
  const n = Math.min(40, Math.max(1, Math.ceil(travel / (PUCK_R * 0.5))));
  const h = dt / n;
  g.player.vx = pm.dx / dt;
  g.player.vy = pm.dy / dt;
  g.ai.vx = am.dx / dt;
  g.ai.vy = am.dy / dt;
  const damp = Math.exp(-FRICTION * h);
  let wallHit = false;
  let padHit = null;

  for (let i = 0; i < n; i++) {
    for (const [p, m] of [[g.player, pm], [g.ai, am]]) {
      const c = clampPaddle(p.side, p.x + m.dx / n, p.y + m.dy / n);
      p.x = c.x;
      p.y = c.y;
    }
    puck.x += puck.vx * h;
    puck.y += puck.vy * h;
    puck.vx *= damp;
    puck.vy *= damp;
    for (const p of [g.player, g.ai]) {
      if (hitPaddle(puck, p, p.vx, p.vy)) padHit = padHit || p.side;
    }
    capSpeed(puck);
    const res = collideTable(puck);
    if (res === "wall") wallHit = true;
    else if (res === "player" || res === "ai") {
      g.score[res] += 1;
      g.lastScorer = res;
      events.push({ type: "goal", by: res, x: puck.x, y: res === "player" ? 0 : H });
      if (g.score[res] >= WIN_SCORE) {
        g.status = "over";
        g.winner = res;
        events.push({ type: res === "player" ? "win" : "lose" });
      } else {
        g.status = "goal";
        g.timer = GOAL_PAUSE;
      }
      puck.vx = puck.vy = 0;
      return events;
    }
  }
  if (padHit) events.push({ type: "hit", by: padHit, v: Math.hypot(puck.vx, puck.vy), x: puck.x, y: puck.y });
  else if (wallHit) events.push({ type: "wall", v: Math.hypot(puck.vx, puck.vy), x: puck.x, y: puck.y });
  return events;
}
