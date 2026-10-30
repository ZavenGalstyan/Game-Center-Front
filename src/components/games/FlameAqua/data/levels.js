/**
 * The 40 temple levels. Each level is plain data: a 32×18 ASCII `map` (see
 * the legend in ../engine/level.js) plus `objects` for the linked mechanics.
 * Maps are drawn with a tiny builder (`fill` / `put`) so layouts stay
 * readable; the result is the same ASCII grid either way.
 *
 * Coordinates are tiles: x 0–31 left→right, y 0–17 top→bottom. A floor at
 * row y means heroes stand in row y-1. Heroes jump ~2.6 tiles high and
 * ~3.5 tiles far, so every climb in these maps is at most 2 tiles.
 *
 * Every level has a scripted solution in tools/routes.mjs that the headless
 * test plays through the real simulation (tools/simTest.mjs levels).
 */
const COLS = 32;
const ROWS = 18;

function draw(fn) {
  const g = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? "#" : ".")),
  );
  const fill = (x0, y0, x1, y1, c = "#") => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (g[y] && x >= 0 && x < COLS) g[y][x] = c;
  };
  const put = (x, y, str) => [...str].forEach((c, i) => c !== " " && fill(x + i, y, x + i, y, c));
  fn(fill, put);
  return g.map((r) => r.join(""));
}

export const WORLDS = [
  { id: 0, name: "Forest Temple", blurb: "Learn to work together: levers, plates and doors.", accent: "#7fd66b" },
  { id: 1, name: "Crystal Temple", blurb: "Push boxes, ride lifts and chase every gem.", accent: "#8fd8ff" },
  { id: 2, name: "Shadow Temple", blurb: "Beat the clock on timed gates and dodge moving hazards.", accent: "#b48cff" },
  { id: 3, name: "Light Temple", blurb: "Bend light with mirrors to wake the ancient sensors.", accent: "#ffd76a" },
];

const L = [];
const level = (world, name, hint, build, objects = []) => L.push({ world, name, hint, map: draw(build), objects });

/* ======================================================= World 1 · Forest */

level(0, "Twin Steps", "Flame can wade through fire, Aqua through water. Reach both doors together!", (f, p) => {
  f(1, 1, 30, 6);
  f(9, 17, 10, 17, "f");
  f(15, 17, 16, 17, "w");
  f(20, 16, 30, 16);
  f(24, 15, 30, 15);
  p(2, 16, "12");
  p(9, 16, "r");
  p(15, 16, "b");
  p(10, 14, "b");
  p(16, 14, "r");
  p(21, 15, "rb");
  p(26, 14, "R");
  p(29, 14, "B");
});

level(0, "The Old Lever", "Walk right through a lever to switch it on.", (f, p) => {
  f(1, 1, 30, 4);
  f(5, 17, 6, 17, "w");
  f(16, 16, 17, 16);
  f(18, 14, 19, 16);
  f(8, 12, 17, 12);
  f(13, 12, 14, 12, "f");
  f(23, 1, 23, 13);
  p(2, 16, "12");
  p(5, 16, "b");
  p(9, 16, "r");
  p(13, 11, "r");
  p(11, 11, "b");
  p(26, 16, "rb");
  p(28, 16, "R");
  p(30, 16, "B");
}, [
  { t: "lever", x: 10, y: 11, ch: "a" },
  { t: "door", x: 23, y: 14, h: 3, ch: "a" },
]);

level(0, "Hold the Gate", "A pressure plate only works while someone stands on it.", (f, p) => {
  f(1, 1, 30, 5);
  f(15, 6, 15, 13);
  f(6, 17, 7, 17, "f");
  f(22, 17, 23, 17, "w");
  f(25, 15, 30, 15);
  f(27, 13, 30, 13);
  p(2, 16, "12");
  p(6, 16, "r");
  p(9, 15, "b");
  p(22, 16, "b");
  p(19, 15, "r");
  p(26, 14, "rb");
  p(28, 12, "R");
  p(30, 12, "B");
}, [
  { t: "plate", x: 12, y: 16, ch: "a" },
  { t: "plate", x: 18, y: 16, ch: "a" },
  { t: "door", x: 15, y: 14, h: 3, ch: "a" },
]);

level(0, "Toxic Moat", "Green goo is deadly to both of you — jump it!", (f, p) => {
  f(1, 1, 30, 5);
  f(3, 9, 30, 9);
  f(10, 9, 10, 9, "f");
  f(16, 9, 16, 9, "w");
  f(21, 9, 21, 9, "g");
  f(3, 13, 25, 13);
  f(9, 13, 9, 13, "f");
  f(15, 13, 15, 13, "g");
  f(20, 13, 20, 13, "w");
  f(1, 11, 2, 12);
  f(7, 17, 7, 17, "g");
  f(12, 17, 12, 17, "f");
  f(17, 17, 17, 17, "w");
  f(27, 15, 28, 16);
  p(1, 16, "12");
  p(12, 16, "r");
  p(17, 16, "b");
  p(7, 14, "r");
  p(7, 15, "b");
  p(9, 12, "r");
  p(20, 12, "b");
  p(15, 10, "r");
  p(15, 11, "b");
  p(10, 8, "r");
  p(16, 8, "b");
  p(21, 6, "r");
  p(21, 7, "b");
  p(26, 8, "R");
  p(29, 8, "B");
}, [
  { t: "lever", x: 5, y: 12, ch: "a", dir: -1 },
  { t: "door", x: 24, y: 6, h: 3, ch: "a" },
]);

level(0, "Split Paths", "Each hero has a lever that opens the other's way.", (f, p) => {
  f(1, 1, 30, 7);
  f(1, 12, 30, 12);
  f(5, 17, 6, 17, "f");
  f(15, 17, 16, 17, "f");
  f(24, 17, 25, 17, "g");
  f(6, 12, 7, 12, "w");
  f(10, 12, 11, 12, "g");
  f(22, 12, 23, 12, "w");
  p(2, 16, "1");
  p(2, 11, "2");
  p(5, 16, "r");
  p(15, 16, "r");
  p(24, 14, "r");
  p(6, 11, "b");
  p(10, 9, "b");
  p(22, 11, "b");
  p(28, 16, "R");
  p(28, 11, "B");
}, [
  { t: "lever", x: 10, y: 16, ch: "a" },
  { t: "door", x: 14, y: 8, h: 4, ch: "a" },
  { t: "lever", x: 18, y: 11, ch: "b" },
  { t: "door", x: 20, y: 13, h: 4, ch: "b" },
]);

level(0, "Color Doors", "Each door listens only to switches of its own colour.", (f, p) => {
  f(1, 1, 30, 9);
  f(4, 13, 26, 13);
  f(1, 15, 2, 16);
  f(28, 15, 29, 16);
  f(9, 13, 10, 13, "w");
  f(15, 13, 15, 13, "g");
  f(17, 17, 17, 17, "f");
  f(21, 17, 21, 17, "w");
  p(3, 16, "12");
  p(5, 16, "r");
  p(6, 16, "b");
  p(17, 16, "r");
  p(21, 14, "r");
  p(9, 12, "b");
  p(15, 10, "b");
  p(20, 12, "R");
  p(23, 12, "B");
}, [
  { t: "plate", x: 8, y: 16, ch: "a" },
  { t: "door", x: 10, y: 14, h: 3, ch: "a" },
  { t: "plate", x: 13, y: 16, ch: "b" },
  { t: "door", x: 6, y: 10, h: 3, ch: "b" },
]);

level(0, "Two Levers", "The golden door needs BOTH levers switched on.", (f, p) => {
  f(1, 1, 30, 7);
  f(12, 12, 19, 12);
  f(12, 13, 12, 13);
  f(19, 13, 19, 13);
  f(4, 17, 10, 17, "f");
  f(21, 17, 27, 17, "w");
  p(15, 11, "12");
  p(13, 11, "r");
  p(18, 11, "b");
  p(5, 16, "r");
  p(9, 16, "r");
  p(7, 14, "r");
  p(23, 16, "b");
  p(26, 16, "b");
  p(24, 14, "b");
  p(14, 16, "R");
  p(17, 16, "B");
}, [
  { t: "lever", x: 2, y: 16, ch: "a" },
  { t: "lever", x: 29, y: 16, ch: "b", dir: -1 },
  { t: "door", x: 12, y: 14, h: 3, ch: "a+b" },
  { t: "door", x: 19, y: 14, h: 3, ch: "a+b" },
]);

level(0, "Lift Off", "Stand on the plate to send the lift up for your partner.", (f, p) => {
  f(1, 1, 30, 3);
  f(4, 9, 21, 9);
  f(7, 9, 8, 9, "f");
  f(17, 9, 18, 9, "w");
  f(10, 17, 11, 17, "g");
  f(15, 17, 16, 17, "f");
  p(6, 16, "12");
  p(10, 14, "rb");
  p(15, 16, "r");
  p(7, 8, "r");
  p(8, 6, "b");
  p(23, 12, "r");
  p(2, 11, "b");
  p(12, 8, "R");
  p(14, 8, "B");
}, [
  { t: "plat", x: 22, y: 16.5, w: 3, to: [22, 9], ch: "a", speed: 90 },
  { t: "plate", x: 27, y: 16, ch: "a" },
  { t: "plat", x: 1, y: 16.5, w: 3, to: [1, 9], ch: "b", speed: 90 },
  { t: "lever", x: 5, y: 8, ch: "b" },
]);

level(0, "Seesaw Gates", "Some doors close when a plate is pressed — watch the arrows of fate.", (f, p) => {
  f(1, 1, 30, 6);
  f(5, 11, 26, 11);
  f(3, 15, 4, 16);
  f(1, 13, 2, 16);
  f(15, 17, 16, 17, "f");
  f(22, 17, 23, 17, "w");
  f(14, 11, 15, 11, "w");
  f(20, 11, 21, 11, "g");
  p(6, 16, "12");
  p(1, 12, "b");
  p(15, 16, "r");
  p(22, 14, "r");
  p(25, 16, "r");
  p(14, 10, "b");
  p(20, 8, "b");
  p(29, 16, "b");
  p(28, 16, "R");
  p(30, 16, "B");
}, [
  { t: "plate", x: 10, y: 16, ch: "a" },
  { t: "door", x: 13, y: 12, h: 5, ch: "a" },
  { t: "door", x: 19, y: 12, h: 5, ch: "a", inv: true },
  { t: "lever", x: 24, y: 16, ch: "c" },
  { t: "door", x: 9, y: 7, h: 4, ch: "c" },
]);

level(0, "Forest Heart", "Lifts, a plate and a door that needs both levers. Good luck!", (f, p) => {
  f(1, 1, 30, 3);
  f(1, 8, 12, 8);
  f(16, 8, 30, 8);
  f(4, 12, 27, 12);
  f(5, 12, 8, 12, "f");
  f(11, 12, 11, 12, "g");
  f(23, 12, 26, 12, "w");
  f(14, 10, 15, 11);
  f(8, 17, 9, 17, "f");
  f(18, 17, 19, 17, "w");
  p(14, 16, "12");
  p(8, 16, "r");
  p(18, 16, "b");
  p(2, 13, "r");
  p(29, 13, "b");
  p(11, 9, "r");
  p(11, 10, "b");
  p(5, 7, "r");
  p(8, 7, "b");
  p(24, 7, "R");
  p(27, 7, "B");
}, [
  { t: "plat", x: 1, y: 16.5, w: 3, to: [1, 12], ch: "a", speed: 90 },
  { t: "plate", x: 24, y: 16, ch: "a" },
  { t: "plat", x: 28, y: 16.5, w: 3, to: [28, 12], ch: "b", speed: 90 },
  { t: "plate", x: 19, y: 11, ch: "b" },
  { t: "lever", x: 4, y: 11, ch: "c" },
  { t: "lever", x: 22, y: 11, ch: "d", dir: -1 },
  { t: "door", x: 21, y: 4, h: 4, ch: "c+d" },
]);

/* ======================================================= World 2 · Crystal */

level(1, "Box Step", "Push the crate against the wall and use it as a step.", (f, p) => {
  f(1, 1, 30, 6);
  f(16, 14, 30, 16);
  f(5, 17, 6, 17, "f");
  f(8, 17, 9, 17, "w");
  f(20, 14, 21, 14, "g");
  p(2, 16, "12");
  p(12, 16, "X");
  p(5, 16, "r");
  p(8, 16, "b");
  p(8, 14, "r");
  p(5, 14, "b");
  p(16, 12, "r");
  p(15, 13, "b");
  p(20, 11, "rb");
  p(25, 13, "R");
  p(28, 13, "B");
});

level(1, "Crate on the Plate", "A crate can hold a plate down for you.", (f, p) => {
  f(1, 1, 30, 4);
  f(17, 5, 17, 12);
  f(9, 17, 10, 17, "f");
  f(20, 17, 21, 17, "w");
  f(24, 15, 25, 16);
  f(26, 13, 30, 16);
  p(2, 16, "12");
  p(6, 16, "X");
  p(9, 16, "r");
  p(10, 14, "b");
  p(14, 14, "r");
  p(13, 14, "b");
  p(20, 14, "r");
  p(20, 16, "b");
  p(26, 12, "r");
  p(28, 12, "b");
  p(27, 12, "R");
  p(29, 12, "B");
}, [
  { t: "plate", x: 13, y: 16, ch: "a" },
  { t: "door", x: 17, y: 13, h: 4, ch: "a" },
]);

level(1, "Goo Bridge", "Push a crate into each goo pit and hop across on it.", (f, p) => {
  f(1, 1, 30, 6);
  f(1, 15, 30, 16);
  f(9, 15, 12, 15, ".");
  f(9, 16, 12, 16, "g");
  f(18, 15, 21, 15, ".");
  f(18, 16, 21, 16, "g");
  f(25, 7, 25, 10);
  p(2, 14, "12");
  p(6, 14, "X");
  p(15, 14, "X");
  p(4, 14, "r");
  p(5, 14, "b");
  p(10, 12, "r");
  p(11, 12, "b");
  p(19, 12, "r");
  p(20, 12, "b");
  p(14, 14, "r");
  p(13, 14, "b");
  p(27, 14, "r");
  p(26, 14, "b");
  p(28, 14, "R");
  p(30, 14, "B");
}, [
  { t: "lever", x: 23, y: 14, ch: "a" },
  { t: "door", x: 25, y: 11, h: 4, ch: "a" },
]);

level(1, "Crystal Lift", "The lift rests at the top. Either plate calls it down.", (f, p) => {
  f(1, 1, 30, 3);
  f(1, 8, 20, 8);
  f(10, 8, 11, 8, "f");
  f(14, 8, 14, 8, "w");
  f(8, 17, 8, 17, "g");
  f(12, 17, 13, 17, "f");
  f(16, 17, 17, 17, "w");
  p(2, 16, "12");
  p(8, 14, "r");
  p(8, 15, "b");
  p(12, 16, "r");
  p(16, 16, "b");
  p(22, 12, "r");
  p(22, 11, "b");
  p(10, 7, "r");
  p(14, 7, "b");
  p(14, 5, "r");
  p(10, 5, "b");
  p(3, 7, "R");
  p(6, 7, "B");
}, [
  { t: "plat", x: 21, y: 8, w: 3, to: [21, 16.5], ch: "a", speed: 100 },
  { t: "plate", x: 26, y: 16, ch: "a" },
  { t: "plate", x: 18, y: 7, ch: "a" },
]);

level(1, "Crate Drop", "Two crates stacked make a tall step. Find the switch for the hatch.", (f, p) => {
  f(1, 1, 30, 2);
  f(20, 13, 30, 16);
  f(18, 3, 20, 3);
  f(18, 4, 18, 6);
  f(20, 4, 20, 6);
  f(1, 9, 8, 9);
  f(5, 17, 5, 17, "f");
  f(13, 17, 13, 17, "w");
  f(26, 13, 26, 13, "g");
  p(3, 16, "12");
  p(19, 5, "X");
  p(19, 16, "X");
  p(5, 16, "r");
  p(5, 14, "b");
  p(13, 16, "b");
  p(13, 14, "r");
  p(2, 8, "r");
  p(10, 12, "r");
  p(16, 16, "b");
  p(22, 12, "r");
  p(26, 10, "b");
  p(23, 12, "R");
  p(29, 12, "B");
}, [
  { t: "door", x: 19, y: 6, w: 1, h: 1, slide: "side", ch: "a" },
  { t: "plate", x: 4, y: 8, ch: "a", hold: 1.5 },
  { t: "plat", x: 9, y: 16.5, w: 3, to: [9, 9], ch: "b", speed: 90 },
  { t: "plate", x: 15, y: 16, ch: "b" },
]);

level(1, "Ferry Crossing", "Ride the floating ferries across the goo lake. Mind the timing!", (f, p) => {
  f(1, 1, 30, 6);
  f(7, 17, 22, 17, "g");
  f(27, 17, 27, 17, "f");
  p(2, 16, "12");
  p(4, 16, "r");
  p(5, 16, "b");
  p(9, 14, "r");
  p(10, 14, "b");
  p(16, 14, "r");
  p(17, 14, "b");
  p(27, 16, "r");
  p(27, 14, "b");
  p(26, 16, "R");
  p(29, 16, "B");
}, [
  { t: "plat", x: 7, y: 15.5, w: 3, to: [11, 15.5], mode: "loop", speed: 60, pause: 0.6 },
  { t: "plat", x: 18, y: 15.5, w: 3, to: [14, 15.5], mode: "loop", speed: 60, pause: 0.6 },
]);

level(1, "Counterweight", "Drop the crate down the hole to take your partner's place.", (f, p) => {
  f(1, 1, 30, 4);
  f(6, 9, 27, 9);
  f(10, 9, 10, 9, ".");
  f(14, 9, 14, 9, "w");
  f(25, 15, 26, 16);
  f(27, 13, 28, 16);
  f(29, 11, 30, 16);
  f(14, 17, 15, 17, "f");
  f(19, 17, 20, 17, "w");
  p(7, 16, "12");
  p(8, 8, "X");
  p(4, 12, "r");
  p(12, 8, "r");
  p(14, 6, "r");
  p(14, 14, "b");
  p(19, 16, "b");
  p(27, 12, "b");
  p(29, 10, "b");
  p(20, 8, "R");
  p(17, 8, "B");
}, [
  { t: "plat", x: 3, y: 16.5, w: 3, to: [3, 9], ch: "a", speed: 90 },
  { t: "plate", x: 10, y: 16, ch: "a" },
  { t: "door", x: 24, y: 10, h: 7, ch: "a" },
]);

level(1, "Gem Gallery", "Two towers, one goal. Each lever opens your partner's next door.", (f, p) => {
  const m = (x) => COLS - 1 - x;
  f(15, 1, 16, 16);
  for (const [side, pool] of [[0, "f"], [1, "w"]]) {
    const X = (x) => (side ? m(x) : x);
    const F = (x0, y0, x1, y1, c) => f(X(x0), y0, X(x1), y1, c);
    F(5, 17, 5, 17, pool);
    F(13, 15, 14, 16);
    F(1, 13, 11, 13);
    F(6, 13, 6, 13, pool);
    F(1, 11, 2, 12);
    F(3, 9, 14, 9);
    F(8, 9, 8, 9, pool);
    F(13, 7, 14, 8);
    F(1, 5, 12, 5);
    const g = side ? "b" : "r";
    for (const [x, y] of [[5, 16], [9, 16], [13, 14], [6, 12], [10, 12], [8, 8], [12, 8], [8, 4]]) p(X(x), y, g);
  }
  p(2, 16, "1");
  p(m(2), 16, "2");
  p(3, 4, "R");
  p(m(3), 4, "B");
}, [
  { t: "lever", x: 8, y: 12, ch: "b", dir: -1 },
  { t: "door", x: 3, y: 10, h: 3, ch: "a" },
  { t: "lever", x: 6, y: 8, ch: "d" },
  { t: "door", x: 11, y: 6, h: 3, ch: "c" },
  { t: "lever", x: 23, y: 12, ch: "a" },
  { t: "door", x: 28, y: 10, h: 3, ch: "b" },
  { t: "lever", x: 25, y: 8, ch: "c", dir: -1 },
  { t: "door", x: 20, y: 6, h: 3, ch: "d" },
]);

level(1, "Lift the Crate", "Drop the crate onto the lift and carry it up. Two levers share one lift.", (f, p) => {
  f(1, 1, 30, 5);
  f(1, 10, 30, 10);
  f(12, 10, 14, 10, ".");
  f(5, 6, 5, 6);
  f(1, 15, 11, 16);
  f(19, 17, 19, 17, "w");
  p(3, 14, "1");
  p(9, 14, "2");
  p(6, 14, "X");
  p(4, 14, "r");
  p(10, 14, "b");
  p(13, 12, "r");
  p(13, 11, "b");
  p(18, 16, "b");
  p(16, 9, "r");
  p(6, 9, "b");
  p(9, 7, "r");
  p(9, 6, "b");
  p(2, 9, "R");
  p(4, 9, "B");
}, [
  { t: "plat", x: 12, y: 16.5, w: 3, to: [12, 10], ch: "a", speed: 80 },
  { t: "lever", x: 17, y: 16, ch: "a" },
  { t: "lever", x: 17, y: 9, ch: "a", dir: -1 },
  { t: "plate", x: 9, y: 9, ch: "c" },
  { t: "door", x: 5, y: 7, h: 3, ch: "c" },
]);

level(1, "Crystal Core", "Crate, lift and ferry — everything you learned in the Crystal Temple.", (f, p) => {
  f(1, 1, 30, 3);
  f(1, 9, 8, 9);
  f(9, 9, 19, 9, "g");
  f(20, 9, 25, 9);
  f(16, 10, 16, 12);
  f(9, 17, 9, 17, "f");
  f(19, 17, 19, 17, "w");
  p(2, 16, "12");
  p(6, 16, "X");
  p(9, 16, "r");
  p(9, 14, "b");
  p(19, 14, "r");
  p(19, 16, "b");
  p(27, 12, "r");
  p(27, 11, "b");
  p(13, 7, "r");
  p(14, 7, "b");
  p(4, 8, "r");
  p(7, 8, "b");
  p(2, 8, "R");
  p(5, 8, "B");
}, [
  { t: "plate", x: 13, y: 16, ch: "a" },
  { t: "door", x: 16, y: 13, h: 4, ch: "a" },
  { t: "plat", x: 26, y: 9, w: 3, to: [26, 16.5], ch: "b", speed: 100 },
  { t: "plate", x: 21, y: 16, ch: "b" },
  { t: "plate", x: 22, y: 8, ch: "b" },
  { t: "plat", x: 17, y: 8.5, w: 3, to: [9, 8.5], mode: "loop", speed: 60, pause: 1 },
]);

/* ======================================================= World 3 · Shadow */

level(2, "Quick Feet", "Timed plates keep a gate open for a few seconds after you step off. Run!", (f, p) => {
  f(1, 1, 30, 6);
  f(3, 11, 26, 11);
  f(26, 15, 27, 16);
  f(28, 13, 30, 16);
  f(8, 17, 8, 17, "f");
  f(18, 17, 19, 17, "w");
  f(10, 11, 10, 11, "g");
  p(2, 16, "12");
  p(8, 16, "r");
  p(8, 14, "b");
  p(18, 16, "b");
  p(18, 14, "r");
  p(24, 16, "rb");
  p(10, 8, "r");
  p(10, 9, "b");
  p(4, 10, "R");
  p(7, 10, "B");
}, [
  { t: "plate", x: 5, y: 16, ch: "a", hold: 4 },
  { t: "door", x: 14, y: 12, h: 5, ch: "a" },
  { t: "plate", x: 22, y: 16, ch: "b", hold: 7 },
  { t: "door", x: 16, y: 7, h: 4, ch: "b" },
]);

level(2, "Saw Corridor", "Saws rise and fall. Wait for the gap, then dash underneath.", (f, p) => {
  f(1, 1, 30, 10);
  f(15, 17, 16, 17, "w");
  f(20, 17, 21, 17, "f");
  p(2, 16, "12");
  p(5, 16, "r");
  p(6, 16, "b");
  p(15, 14, "r");
  p(15, 16, "b");
  p(20, 16, "r");
  p(21, 14, "b");
  p(11, 16, "rb");
  p(28, 16, "R");
  p(30, 16, "B");
}, [
  { t: "saw", x: 8.5, y: 11.6, to: [8.5, 16.4], speed: 100 },
  { t: "saw", x: 13.5, y: 11.6, to: [13.5, 16.4], speed: 100, phase: 0.3 },
  { t: "saw", x: 18.5, y: 11.6, to: [18.5, 16.4], speed: 100, phase: 0.6 },
  { t: "saw", x: 23.5, y: 11.6, to: [23.5, 16.4], speed: 100, phase: 0.9 },
  { t: "lever", x: 25, y: 16, ch: "a" },
  { t: "door", x: 26, y: 11, h: 6, ch: "a" },
]);

level(2, "Element Orbs", "Fire orbs only hurt Aqua; water orbs only hurt Flame.", (f, p) => {
  f(1, 1, 30, 3);
  f(3, 8, 30, 8);
  f(3, 12, 26, 12);
  f(1, 10, 2, 11);
  f(26, 15, 27, 16);
  f(28, 13, 30, 16);
  f(11, 17, 11, 17, "f");
  f(17, 17, 18, 17, "w");
  f(19, 12, 19, 12, "g");
  f(10, 8, 10, 8, "f");
  f(21, 8, 21, 8, "w");
  p(2, 16, "12");
  p(11, 16, "r");
  p(11, 14, "b");
  p(17, 16, "b");
  p(17, 14, "r");
  p(19, 9, "r");
  p(19, 10, "b");
  p(10, 7, "r");
  p(10, 5, "b");
  p(21, 7, "b");
  p(21, 5, "r");
  p(26, 7, "R");
  p(29, 7, "B");
}, [
  { t: "fire", x: 7.5, y: 13.2, to: [7.5, 16.4], speed: 70 },
  { t: "water", x: 14.5, y: 13.2, to: [14.5, 16.4], speed: 70, phase: 0.5 },
  { t: "saw", x: 22.5, y: 13.2, to: [22.5, 16.4], speed: 80, phase: 0.2 },
  { t: "water", x: 22.5, y: 9.3, to: [22.5, 11.5], speed: 50 },
  { t: "fire", x: 9.5, y: 9.3, to: [9.5, 11.5], speed: 50, phase: 0.5 },
  { t: "saw", x: 15.5, y: 4.3, to: [15.5, 7.4], speed: 70 },
]);

level(2, "Relay Race", "Each plate opens your partner's gate for a moment. Keep the relay going!", (f, p) => {
  f(1, 1, 30, 6);
  f(1, 11, 30, 11);
  f(6, 17, 7, 17, "f");
  f(10, 17, 10, 17, "g");
  f(19, 17, 20, 17, "f");
  f(27, 17, 27, 17, "g");
  f(5, 11, 6, 11, "w");
  f(15, 11, 15, 11, "g");
  f(17, 11, 18, 11, "w");
  f(27, 11, 27, 11, "g");
  p(2, 16, "1");
  p(2, 10, "2");
  p(6, 16, "r");
  p(10, 14, "r");
  p(19, 16, "r");
  p(27, 14, "r");
  p(5, 10, "b");
  p(15, 8, "b");
  p(18, 10, "b");
  p(27, 8, "b");
  p(29, 16, "R");
  p(29, 10, "B");
}, [
  { t: "plate", x: 4, y: 16, ch: "a", hold: 4 },
  { t: "door", x: 8, y: 7, h: 4, ch: "a" },
  { t: "plate", x: 11, y: 10, ch: "b", hold: 4 },
  { t: "door", x: 13, y: 12, h: 5, ch: "b" },
  { t: "plate", x: 16, y: 16, ch: "c", hold: 4 },
  { t: "door", x: 21, y: 7, h: 4, ch: "c" },
  { t: "plate", x: 23, y: 10, ch: "d", hold: 4 },
  { t: "door", x: 25, y: 12, h: 5, ch: "d" },
]);

level(2, "Orbit Hall", "Hop across the floating stones while the saws circle.", (f, p) => {
  f(1, 1, 30, 3);
  f(5, 17, 25, 17, "g");
  f(6, 15, 7, 15);
  f(10, 14, 11, 14);
  f(14, 13, 15, 13);
  f(18, 14, 19, 14);
  f(22, 15, 23, 15);
  f(28, 4, 28, 11);
  p(2, 16, "12");
  p(6, 13, "r");
  p(7, 13, "b");
  p(12, 10, "r");
  p(13, 10, "b");
  p(16, 10, "r");
  p(17, 10, "b");
  p(26, 16, "rb");
  p(29, 16, "R");
  p(30, 16, "B");
}, [
  { t: "saw", x: 12.5, y: 11.5, orbit: 1.3, speed: 80 },
  { t: "saw", x: 20.5, y: 12, orbit: 1.3, speed: 80, phase: 0.5 },
  { t: "plate", x: 14, y: 12, ch: "a", hold: 8 },
  { t: "door", x: 28, y: 12, h: 5, ch: "a" },
]);

level(2, "Timed Lift", "The plate calls the lift down — but only for a few seconds.", (f, p) => {
  f(1, 1, 30, 3);
  f(1, 8, 19, 8);
  f(9, 17, 10, 17, "f");
  f(14, 17, 15, 17, "w");
  f(15, 8, 15, 8, "w");
  f(7, 8, 7, 8, "f");
  p(12, 16, "12");
  p(9, 16, "r");
  p(10, 14, "b");
  p(14, 16, "b");
  p(15, 14, "r");
  p(21, 12, "r");
  p(21, 11, "b");
  p(15, 5, "r");
  p(7, 5, "b");
  p(3, 7, "R");
  p(5, 7, "B");
}, [
  { t: "plat", x: 20, y: 8, w: 3, to: [20, 16.5], ch: "a", speed: 120 },
  { t: "plate", x: 4, y: 16, ch: "a", hold: 7 },
  { t: "saw", x: 17.5, y: 12, to: [17.5, 16.4], speed: 90 },
  { t: "saw", x: 11, y: 5.6, to: [11, 7.4], speed: 30 },
]);

level(2, "Night Watch", "Slip past the guardian orbs to reach your lever.", (f, p) => {
  f(1, 1, 30, 4);
  f(12, 12, 19, 12);
  f(12, 13, 12, 13);
  f(19, 13, 19, 13);
  f(3, 17, 10, 17, "f");
  f(21, 17, 28, 17, "w");
  p(15, 11, "12");
  p(13, 11, "r");
  p(18, 11, "b");
  p(4, 16, "r");
  p(9, 16, "r");
  p(22, 16, "b");
  p(27, 16, "b");
  p(14, 16, "R");
  p(17, 16, "B");
}, [
  { t: "water", x: 5.5, y: 12.5, to: [5.5, 16.4], speed: 80 },
  { t: "water", x: 8.5, y: 12.5, to: [8.5, 16.4], speed: 80, phase: 0.5 },
  { t: "fire", x: 25.5, y: 12.5, to: [25.5, 16.4], speed: 80 },
  { t: "fire", x: 22.5, y: 12.5, to: [22.5, 16.4], speed: 80, phase: 0.5 },
  { t: "lever", x: 2, y: 16, ch: "a" },
  { t: "lever", x: 29, y: 16, ch: "b", dir: -1 },
  { t: "door", x: 12, y: 14, h: 3, ch: "a+b" },
  { t: "door", x: 19, y: 14, h: 3, ch: "a+b" },
]);

level(2, "Gauntlet", "One plate, one long run. The far gate will not wait for you.", (f, p) => {
  f(1, 1, 30, 9);
  f(7, 17, 7, 17, "f");
  f(11, 17, 11, 17, "w");
  f(16, 17, 16, 17, "g");
  f(23, 17, 23, 17, "g");
  f(27, 10, 27, 11);
  p(2, 16, "12");
  p(7, 16, "r");
  p(7, 14, "b");
  p(11, 16, "b");
  p(11, 14, "r");
  p(16, 14, "rb");
  p(23, 14, "rb");
  p(29, 16, "R");
  p(30, 16, "B");
}, [
  { t: "plate", x: 4, y: 16, ch: "a", hold: 14 },
  { t: "saw", x: 9.5, y: 11.5, to: [9.5, 16.4], speed: 110 },
  { t: "fire", x: 13.5, y: 12, to: [13.5, 16.4], speed: 90 },
  { t: "water", x: 14.5, y: 12, to: [14.5, 16.4], speed: 90, phase: 0.5 },
  { t: "saw", x: 19.5, y: 11.5, to: [19.5, 16.4], speed: 110, phase: 0.4 },
  { t: "saw", x: 25.5, y: 11.5, to: [25.5, 16.4], speed: 110, phase: 0.8 },
  { t: "door", x: 27, y: 12, h: 5, ch: "a" },
]);

level(2, "Twin Timers", "Both gates need both timed plates. Step off together and sprint!", (f, p) => {
  f(1, 1, 30, 6);
  f(3, 7, 3, 11);
  f(28, 7, 28, 11);
  f(8, 17, 10, 17, "f");
  f(21, 17, 23, 17, "w");
  p(15, 16, "1");
  p(16, 16, "2");
  p(9, 16, "r");
  p(9, 14, "r");
  p(22, 16, "b");
  p(22, 14, "b");
  p(15, 13, "r");
  p(16, 13, "b");
  p(2, 16, "R");
  p(29, 16, "B");
}, [
  { t: "plate", x: 13, y: 16, ch: "a", hold: 6 },
  { t: "plate", x: 18, y: 16, ch: "b", hold: 6 },
  { t: "saw", x: 6.5, y: 11.6, to: [6.5, 16.4], speed: 110 },
  { t: "saw", x: 25.5, y: 11.6, to: [25.5, 16.4], speed: 110 },
  { t: "door", x: 3, y: 12, h: 5, ch: "a+b" },
  { t: "door", x: 28, y: 12, h: 5, ch: "a+b" },
]);

level(2, "Shadow Heart", "A lever, a timed lift and a twin lock. Escape the shadows together.", (f, p) => {
  f(1, 1, 30, 2);
  f(1, 9, 30, 9);
  f(14, 9, 16, 9, ".");
  f(5, 17, 6, 17, "f");
  f(20, 17, 21, 17, "w");
  f(11, 9, 11, 9, "g");
  p(9, 16, "12");
  p(24, 16, "r");
  p(6, 14, "b");
  p(3, 16, "b");
  p(21, 14, "r");
  p(15, 12, "r");
  p(15, 11, "b");
  p(11, 6, "rb");
  p(27, 8, "r");
  p(9, 8, "b");
  p(1, 8, "R");
  p(3, 8, "B");
}, [
  { t: "lever", x: 2, y: 16, ch: "d" },
  { t: "plat", x: 14, y: 9, w: 3, to: [14, 16.5], ch: "a", speed: 110 },
  { t: "plate", x: 26, y: 16, ch: "a", hold: 6 },
  { t: "saw", x: 23.5, y: 12, to: [23.5, 16.4], speed: 100 },
  { t: "fire", x: 24.5, y: 5, to: [24.5, 8.4], speed: 60 },
  { t: "water", x: 8.5, y: 5, to: [8.5, 8.4], speed: 60, phase: 0.5 },
  { t: "lever", x: 29, y: 8, ch: "c", dir: -1 },
  { t: "door", x: 4, y: 3, h: 6, ch: "c+d" },
]);

/* ======================================================= World 4 · Light */

level(3, "First Light", "Flip the lever to turn the mirror and send light into the sensor.", (f, p) => {
  f(1, 1, 30, 4);
  f(23, 5, 23, 11);
  f(5, 17, 5, 17, "f");
  f(13, 17, 14, 17, "w");
  f(19, 17, 19, 17, "g");
  f(27, 17, 27, 17, "f");
  p(2, 16, "12");
  p(5, 16, "r");
  p(5, 14, "b");
  p(13, 16, "b");
  p(14, 14, "r");
  p(19, 14, "r");
  p(19, 15, "b");
  p(27, 16, "r");
  p(27, 14, "b");
  p(26, 16, "R");
  p(29, 16, "B");
}, [
  { t: "emit", x: 1, y: 13, dir: "r" },
  { t: "mirror", x: 17, y: 13, o: "\\", ch: "a" },
  { t: "sensor", x: 17, y: 5, ch: "s" },
  { t: "lever", x: 9, y: 16, ch: "a" },
  { t: "door", x: 23, y: 12, h: 5, ch: "s" },
]);

level(3, "Mirror Crate", "A crate with a mirror bends the beam. Push it under the sensor.", (f, p) => {
  f(1, 1, 30, 6);
  f(15, 16, 15, 16);
  f(22, 7, 22, 11);
  f(9, 17, 9, 17, "w");
  f(18, 17, 18, 17, "f");
  f(25, 17, 25, 17, "g");
  p(2, 16, "12");
  p(6, 16, "/");
  p(9, 16, "b");
  p(9, 14, "r");
  p(11, 14, "r");
  p(13, 14, "b");
  p(18, 16, "r");
  p(18, 14, "b");
  p(25, 14, "r");
  p(25, 15, "b");
  p(27, 16, "R");
  p(29, 16, "B");
}, [
  { t: "emit", x: 1, y: 16, dir: "r" },
  { t: "sensor", x: 14, y: 7, ch: "s" },
  { t: "door", x: 22, y: 12, h: 5, ch: "s" },
]);

level(3, "Two Mirrors", "The beam needs both mirrors turned. Each of you has a lever.", (f, p) => {
  f(1, 1, 30, 4);
  f(13, 14, 18, 14);
  f(4, 17, 9, 17, "f");
  f(22, 17, 27, 17, "w");
  p(15, 13, "12");
  p(14, 13, "r");
  p(17, 13, "b");
  p(6, 16, "r");
  p(8, 16, "r");
  p(23, 16, "b");
  p(25, 16, "b");
  p(15, 16, "R");
  p(16, 16, "B");
}, [
  { t: "emit", x: 1, y: 6, dir: "r" },
  { t: "mirror", x: 12, y: 6, o: "/", ch: "a" },
  { t: "mirror", x: 12, y: 11, o: "/", ch: "b" },
  { t: "sensor", x: 20, y: 11, ch: "s" },
  { t: "lever", x: 2, y: 16, ch: "a" },
  { t: "lever", x: 29, y: 16, ch: "b", dir: -1 },
  { t: "door", x: 13, y: 15, h: 2, ch: "s" },
  { t: "door", x: 18, y: 15, h: 2, ch: "s" },
]);

level(3, "Shadow Play", "Crates and closed doors cast shadows. Clear the beam's path.", (f, p) => {
  f(1, 1, 30, 8);
  f(1, 14, 30, 16);
  f(10, 14, 11, 15, ".");
  f(10, 16, 11, 16, "g");
  f(4, 14, 4, 14, "f");
  f(21, 14, 21, 14, "w");
  p(2, 13, "12");
  p(7, 13, "X");
  p(4, 13, "r");
  p(4, 11, "b");
  p(10, 11, "r");
  p(11, 11, "b");
  p(21, 13, "b");
  p(21, 11, "r");
  p(25, 13, "r");
  p(26, 13, "b");
  p(28, 13, "R");
  p(30, 13, "B");
}, [
  { t: "emit", x: 1, y: 13, dir: "r" },
  { t: "plate", x: 13, y: 13, ch: "p" },
  { t: "plate", x: 19, y: 13, ch: "p" },
  { t: "door", x: 16, y: 9, h: 5, ch: "p" },
  { t: "sensor", x: 24, y: 13, ch: "s", hold: 6 },
  { t: "door", x: 27, y: 9, h: 5, ch: "s" },
]);

level(3, "Light Lift", "Aim the light up through the floor to wake the lift.", (f, p) => {
  f(1, 1, 30, 4);
  f(5, 10, 24, 10);
  f(12, 10, 12, 10, ".");
  f(16, 10, 16, 10, "g");
  f(23, 15, 24, 16);
  f(25, 13, 26, 16);
  f(27, 11, 28, 16);
  f(11, 16, 11, 16);
  f(20, 17, 20, 17, "f");
  p(19, 16, "1");
  p(6, 16, "2");
  p(16, 16, "\\");
  p(14, 16, "r");
  p(20, 16, "r");
  p(23, 14, "r");
  p(26, 12, "r");
  p(27, 10, "r");
  p(3, 13, "b");
  p(12, 7, "b");
  p(16, 7, "b");
  p(17, 9, "b");
  p(14, 9, "R");
  p(21, 9, "B");
}, [
  { t: "emit", x: 22, y: 16, dir: "l" },
  { t: "sensor", x: 12, y: 6, ch: "s" },
  { t: "plat", x: 2, y: 16.5, w: 3, to: [2, 10], ch: "s", speed: 90 },
  { t: "plate", x: 18, y: 9, ch: "d" },
  { t: "door", x: 25, y: 11, h: 2, ch: "d" },
]);

level(3, "Prism Path", "Both plates must be held at once to line up the mirrors. Then race!", (f, p) => {
  f(1, 1, 30, 3);
  f(1, 12, 7, 12);
  f(3, 12, 6, 12, "f");
  f(8, 13, 9, 16);
  f(10, 15, 10, 16);
  f(24, 12, 30, 12);
  f(25, 12, 28, 12, "w");
  f(22, 13, 23, 16);
  f(21, 15, 21, 16);
  f(12, 13, 19, 13);
  p(15, 12, "12");
  p(13, 12, "r");
  p(18, 12, "b");
  p(4, 11, "r");
  p(6, 11, "r");
  p(9, 12, "r");
  p(26, 11, "b");
  p(28, 11, "b");
  p(22, 12, "b");
  p(14, 16, "R");
  p(17, 16, "B");
}, [
  { t: "emit", x: 1, y: 5, dir: "r" },
  { t: "mirror", x: 15, y: 5, o: "/", ch: "a" },
  { t: "mirror", x: 15, y: 9, o: "/", ch: "b" },
  { t: "sensor", x: 25, y: 9, ch: "s", hold: 6 },
  { t: "plate", x: 1, y: 11, ch: "a" },
  { t: "plate", x: 30, y: 11, ch: "b" },
  { t: "door", x: 12, y: 14, h: 3, ch: "s" },
  { t: "door", x: 19, y: 14, h: 3, ch: "s" },
]);

level(3, "Sun Gate", "Flame powers the light, Aqua aims it. Then slip past the saw.", (f, p) => {
  f(1, 1, 30, 3);
  f(14, 13, 22, 13);
  f(21, 12, 21, 12);
  f(12, 15, 13, 16);
  f(6, 17, 9, 17, "f");
  f(17, 13, 17, 13, "w");
  f(26, 4, 26, 11);
  p(10, 16, "12");
  p(16, 12, "/");
  p(7, 16, "r");
  p(8, 14, "r");
  p(17, 12, "b");
  p(17, 10, "b");
  p(15, 12, "b");
  p(3, 16, "r");
  p(24, 16, "rb");
  p(28, 16, "R");
  p(30, 16, "B");
}, [
  { t: "emit", x: 1, y: 7, dir: "r", ch: "e" },
  { t: "mirror", x: 20, y: 7, o: "\\" },
  { t: "sensor", x: 14, y: 12, ch: "s" },
  { t: "lever", x: 4, y: 16, ch: "e" },
  { t: "saw", x: 24.5, y: 11.6, to: [24.5, 16.4], speed: 100 },
  { t: "door", x: 26, y: 12, h: 5, ch: "s" },
]);

level(3, "Hall of Mirrors", "Two mirror crates, two sensors, one double lock.", (f, p) => {
  f(1, 1, 30, 3);
  f(1, 11, 24, 11);
  f(10, 11, 10, 11, ".");
  f(13, 10, 13, 10);
  f(11, 16, 11, 16);
  f(24, 15, 25, 16);
  f(26, 13, 27, 16);
  f(6, 17, 7, 17, "f");
  f(16, 11, 17, 11, "w");
  p(2, 16, "12");
  p(4, 16, "/");
  p(19, 10, "\\");
  p(6, 16, "r");
  p(7, 14, "b");
  p(16, 10, "b");
  p(10, 8, "rb");
  p(15, 16, "r");
  p(18, 16, "b");
  p(25, 14, "r");
  p(2, 10, "R");
  p(4, 10, "B");
}, [
  { t: "emit", x: 1, y: 16, dir: "r" },
  { t: "sensor", x: 10, y: 4, ch: "a" },
  { t: "emit", x: 22, y: 10, dir: "l" },
  { t: "sensor", x: 14, y: 4, ch: "b" },
  { t: "door", x: 5, y: 4, h: 7, ch: "a+b" },
]);

level(3, "Twin Beams", "Hold both plates to light both sensors, then catch the lift before it rises.", (f, p) => {
  f(1, 1, 30, 2);
  f(12, 7, 19, 7);
  f(2, 17, 5, 17, "f");
  f(26, 17, 29, 17, "w");
  p(15, 16, "12");
  p(3, 16, "r");
  p(4, 14, "r");
  p(27, 16, "b");
  p(28, 14, "b");
  p(21, 12, "r");
  p(21, 11, "b");
  p(15, 6, "r");
  p(18, 6, "b");
  p(14, 6, "R");
  p(17, 6, "B");
}, [
  { t: "emit", x: 1, y: 4, dir: "r" },
  { t: "mirror", x: 6, y: 4, o: "/", ch: "a" },
  { t: "sensor", x: 6, y: 12, ch: "s", hold: 7 },
  { t: "emit", x: 30, y: 4, dir: "l" },
  { t: "mirror", x: 25, y: 4, o: "\\", ch: "b" },
  { t: "sensor", x: 25, y: 12, ch: "t", hold: 7 },
  { t: "plate", x: 30, y: 16, ch: "a" },
  { t: "plate", x: 1, y: 16, ch: "b" },
  { t: "plat", x: 20, y: 7, w: 3, to: [20, 16.5], ch: "s+t", speed: 120 },
  { t: "saw", x: 9.5, y: 10, to: [9.5, 16.4], speed: 110 },
  { t: "saw", x: 23.5, y: 10, to: [23.5, 16.4], speed: 110, phase: 0.5 },
]);

level(3, "Heart of Light", "Everything you have learned, one last time. Escape the Twin Temple together!", (f, p) => {
  f(1, 1, 30, 2);
  f(1, 9, 24, 9);
  f(9, 16, 9, 16);
  f(19, 17, 19, 17, "f");
  f(22, 17, 22, 17, "w");
  f(9, 9, 9, 9, "g");
  p(2, 16, "12");
  p(4, 16, "/");
  p(6, 16, "r");
  p(7, 16, "b");
  p(19, 16, "r");
  p(19, 14, "b");
  p(22, 16, "b");
  p(22, 14, "r");
  p(26, 12, "r");
  p(26, 11, "b");
  p(9, 6, "r");
  p(9, 7, "b");
  p(1, 8, "R");
  p(2, 8, "B");
}, [
  { t: "emit", x: 1, y: 16, dir: "r" },
  { t: "sensor", x: 8, y: 10, ch: "a" },
  { t: "door", x: 11, y: 10, h: 7, ch: "a" },
  { t: "plat", x: 25, y: 9, w: 3, to: [25, 16.5], ch: "b", speed: 110 },
  { t: "plate", x: 29, y: 16, ch: "b" },
  { t: "plate", x: 22, y: 8, ch: "b" },
  { t: "emit", x: 24, y: 4, dir: "l" },
  { t: "mirror", x: 16, y: 4, o: "\\", ch: "c" },
  { t: "mirror", x: 16, y: 7, o: "\\", ch: "d" },
  { t: "plate", x: 19, y: 8, ch: "c", hold: 6 },
  { t: "plate", x: 13, y: 8, ch: "d", hold: 6 },
  { t: "sensor", x: 5, y: 7, ch: "s", hold: 6 },
  { t: "water", x: 14.5, y: 4.5, to: [14.5, 8.4], speed: 60 },
  { t: "door", x: 3, y: 3, h: 6, ch: "s" },
]);

export const LEVELS = L.map((d, i) => ({ ...d, id: i + 1 }));
export const levelsOfWorld = (w) => LEVELS.filter((l) => l.world === w);
