/** Headless rules tests: `node src/components/games/SnakeClassic/tools/engineTest.mjs` */
import { create, step, turn, togglePause, reduce, spawnFood, tickMs, SIZE, POINTS } from "../engine.js";

let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const playing = (over = {}) => ({ ...create(0, () => 0.99), status: "playing", food: { x: 0, y: 0 }, ...over });
const head = (s) => s.snake[0];

// --- start state
const s0 = create(42);
check("starts ready, length 3, facing right, best kept", s0.status === "ready" && s0.snake.length === 3 && s0.dir === "right" && s0.best === 42);
check("food spawns off the snake", !s0.snake.some((p) => p.x === s0.food.x && p.y === s0.food.y));
check("no movement while ready", step(s0) === s0);

// --- movement in all four directions
check("moves right", eq(head(step(playing())), { x: 10, y: 10 }));
for (const [dir, want] of [["up", { x: 9, y: 9 }], ["down", { x: 9, y: 11 }]]) {
  check(`moves ${dir}`, eq(head(step(turn(playing(), dir))), want));
}
const goingUp = step(turn(playing(), "up"));
check("moves left (after turning up)", eq(head(step(turn(goingUp, "left"))), { x: 8, y: 9 }));
check("length unchanged when not eating", step(playing()).snake.length === 3);

// --- reverse-turn prevention
check("reverse turn ignored", turn(playing(), "left").queue.length === 0 && eq(head(step(turn(playing(), "left"))), { x: 10, y: 10 }));
const quick = turn(turn(playing(), "up"), "left"); // up then left within one tick: both legal
check("buffered turns apply in order", eq(head(step(step(quick))), { x: 8, y: 9 }));
check("quick up+down can't reverse into the neck", turn(turn(playing(), "up"), "down").queue.join() === "up");
check("first key starts the game", turn(s0, "up").status === "playing");

// --- food, growth, score, speed
const meal = playing({ food: { x: 10, y: 10 }, best: 5 });
const fed = step(meal, () => 0);
check("eating grows by one", fed.snake.length === 4 && eq(fed.snake.at(-1), meal.snake.at(-1)));
check("eating scores", fed.score === POINTS && fed.eaten === 1 && fed.best === POINTS);
check("new food on an empty cell", fed.food && !fed.snake.some((p) => p.x === fed.food.x && p.y === fed.food.y));
check("speed increases with food", tickMs(0) > tickMs(10) && tickMs(1000) === 60);
let foodOk = true;
for (let k = 0; k < 300; k++) {
  const snake = Array.from({ length: 1 + Math.floor(Math.random() * 390) }, (_, i) => ({ x: i % SIZE, y: Math.floor(i / SIZE) }));
  const f = spawnFood(snake);
  if (!f || snake.some((p) => p.x === f.x && p.y === f.y)) foodOk = false;
}
check("spawnFood never lands on the snake", foodOk);

// --- collisions
let wall = playing({ snake: [{ x: 19, y: 3 }, { x: 18, y: 3 }, { x: 17, y: 3 }] });
check("right wall ends game", step(wall).status === "over");
check("top wall ends game", step(turn(playing({ snake: [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 0 }] }), "up")).status === "over");
check("left wall ends game", step(playing({ dir: "left", snake: [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }] })).status === "over");
check("bottom wall ends game", step(playing({ dir: "down", snake: [{ x: 5, y: 19 }, { x: 5, y: 18 }, { x: 5, y: 17 }] })).status === "over");
// snake curled so turning down runs into its body
const curl = playing({ dir: "left", snake: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 7 }] });
check("body collision ends game", step(turn(curl, "down")).status === "over");
// 2x2 loop: head moves into the cell the tail is leaving
const loop = playing({ dir: "left", snake: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }] });
const looped = step(turn(loop, "down"));
check("may move into the tail's previous cell", looped.status === "playing" && eq(head(looped), { x: 5, y: 6 }));
check("...but not when growing (tail stays)", step(turn({ ...loop, food: { x: 5, y: 6 } }, "down")).status === "over");
const dead = step(wall);
check("no turns or ticks after game over", turn(dead, "up") === dead && step(dead) === dead);

// --- pause, restart
const p = togglePause(playing());
check("pause stops movement and turns", p.status === "paused" && step(p) === p && turn(p, "up") === p);
check("resume", togglePause(p).status === "playing");
check("halt pauses a running game only", reduce(playing(), { type: "halt" }).status === "paused" && reduce(p, { type: "halt" }) === p && reduce(create(), { type: "halt" }).status === "ready");
check("game over can't be unpaused", togglePause(dead) === dead);
const fresh = reduce({ ...fed, status: "over" }, { type: "new" });
check("restart: fresh ready game keeps best", fresh.status === "ready" && fresh.score === 0 && fresh.snake.length === 3 && fresh.best === POINTS);

// --- full board = victory: zig-zag snake covering 399 cells, last food straight ahead
const cells = [];
for (let y = 0; y < SIZE; y++) for (let i = 0; i < SIZE; i++) cells.push({ x: y % 2 ? SIZE - 1 - i : i, y });
const full = cells.slice(1); // head at (1,0) moving left, food at (0,0)
const v = step(playing({ snake: full, dir: "left", food: { x: 0, y: 0 } }));
check("filling the board wins", v.status === "won" && v.snake.length === SIZE * SIZE && v.food === null);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
