/**
 * Snake Classic — pure game logic (no React, no DOM), tested in Node:
 * `node src/components/games/SnakeClassic/tools/engineTest.mjs`.
 *
 * The snake is a list of cells, head first. Status flows
 * ready -> playing <-> paused -> over | won.
 */
export const SIZE = 20;
export const POINTS = 10;
export const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
const QUEUE_MAX = 3; // buffered turns, so quick "up, left" presses both register

/** Tick length in ms: starts at 150 and speeds up with every food eaten. */
export const tickMs = (eaten) => Math.max(60, 150 - eaten * 3);

/** A random empty cell, or null when the snake fills the board. */
export function spawnFood(snake, rng = Math.random) {
  const taken = new Set(snake.map((p) => p.y * SIZE + p.x));
  const empty = [];
  for (let k = 0; k < SIZE * SIZE; k++) if (!taken.has(k)) empty.push(k);
  if (!empty.length) return null;
  const k = empty[Math.floor(rng() * empty.length)];
  return { x: k % SIZE, y: Math.floor(k / SIZE) };
}

export function create(best = 0, rng = Math.random) {
  const snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
  return { snake, dir: "right", queue: [], food: spawnFood(snake, rng), score: 0, eaten: 0, best, startBest: best, status: "ready" };
}

/** Queue a turn; reversing into the snake's own neck is ignored. */
export function turn(s, dir) {
  if (!DIRS[dir] || s.status === "over" || s.status === "won" || s.status === "paused") return s;
  const started = s.status === "ready" ? { ...s, status: "playing" } : s;
  const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if (dir === last || dir === OPPOSITE[last] || s.queue.length >= QUEUE_MAX) return started;
  return { ...started, queue: [...s.queue, dir] };
}

export function togglePause(s) {
  if (s.status === "playing") return { ...s, status: "paused" };
  if (s.status === "paused" || s.status === "ready") return { ...s, status: "playing" };
  return s;
}

/** Advance one tick. */
export function step(s, rng = Math.random) {
  if (s.status !== "playing") return s;
  const [dir = s.dir, ...queue] = s.queue;
  const d = DIRS[dir];
  const head = { x: s.snake[0].x + d.x, y: s.snake[0].y + d.y };
  const eats = s.food && head.x === s.food.x && head.y === s.food.y;
  // The tail leaves its cell this tick unless the snake grows, so the head may enter it.
  const body = eats ? s.snake : s.snake.slice(0, -1);
  const hitWall = head.x < 0 || head.y < 0 || head.x >= SIZE || head.y >= SIZE;
  if (hitWall || body.some((p) => p.x === head.x && p.y === head.y)) {
    return { ...s, dir, queue: [], status: "over" };
  }
  const snake = [head, ...body];
  if (!eats) return { ...s, snake, dir, queue };
  const score = s.score + POINTS;
  const food = spawnFood(snake, rng);
  return { ...s, snake, dir, queue, food, score, eaten: s.eaten + 1, best: Math.max(s.best, score), status: food ? "playing" : "won" };
}

export function reduce(s, a) {
  switch (a.type) {
    case "tick":
      return step(s, a.rng);
    case "turn":
      return turn(s, a.dir);
    case "pause":
      return togglePause(s);
    case "halt": // pause only if running (tab hidden)
      return s.status === "playing" ? togglePause(s) : s;
    case "new":
      return create(s.best, a.rng);
    default:
      return s;
  }
}
