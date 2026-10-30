/**
 * The 30 levels of Teddy Quest, authored with the course builder (build.js).
 * Each level is a unique sequence of segments; difficulty rises through the
 * five worlds (gap sizes, narrower paths, more enemies, timed hazards).
 * Every level ships a bot route — tools/levelTest.mjs plays all of them.
 */
import { buildLevel } from "./build.js";

export const WORLDS = [
  { id: 1, name: "Green Valley", theme: "valley", blurb: "Rolling hills, soft grass and easy hops.", color: "#5cc75a" },
  { id: 2, name: "Sunny Desert", theme: "desert", blurb: "Moving platforms and sinking sand traps.", color: "#f2b84b" },
  { id: 3, name: "Snowy Mountain", theme: "snow", blurb: "Slippery ice and falling icicles.", color: "#8fd3ff" },
  { id: 4, name: "Crystal Cave", theme: "cave", blurb: "Narrow bridges and hidden treasures.", color: "#a77bff" },
  { id: 5, name: "Dark Castle", theme: "castle", blurb: "Traps, tough guards and the Baron himself.", color: "#e0566b" },
];

const W = (id) => WORLDS[Math.ceil(id / 6) - 1];
const L = (id, name, author, extra = {}) => () => buildLevel({ id, name, world: W(id).id, theme: W(id).theme, ...extra }, author);

const DEFS = [
  /* ================================================================ WORLD 1 — Green Valley */
  L(1, "Meadow Morning", (b) => {
    b.start(7).coins(4);
    b.hint(-3, 0, "Move with WASD / arrows · drag the mouse to look around");
    b.pad(6, { w: 4 }).coins(4);
    b.gap(1.5, 5, { w: 4, arc: 2 }).coins(3);
    b.hint(-5, 0, "Press SPACE to jump — hold it to jump higher!");
    b.steps(2, 0.8, 2.6, { w: 4 });
    b.coin(-1.3, 0);
    b.pad(7, { w: 4.5 }).patrol().coins(3, 1.3);
    b.hint(-6, 0, "A Grumblebug! Click or press J to swipe it");
    b.turn("R", { w: 4.5 }).checkpoint(-2.2, 0);
    b.stones(3, 1.4, 2.4);
    b.pad(7, { w: 4.5 }).coins(5);
    b.secret("L", { dist: 1.8 });
    b.hint(-4, 0, "Treasure chests hide off the main path!");
    b.gap(2, 6, { w: 4, arc: 2 }).patrol().coins(3, -1.2);
    b.turn("L", { w: 4.5 });
    b.pad(5, { w: 4 }).coins(3);
    b.goal();
  }),
  L(2, "Clover Hills", (b) => {
    b.start(6).coins(3);
    b.steps(3, 0.7, 2.5, { w: 3.8 });
    b.pad(5, { w: 4 }).coins(4);
    b.gap(2, 4, { w: 3.6, dy: -0.8, arc: 2 }).patrol();
    b.turn("L", { w: 4.5 }).ring(6, 1.3);
    b.stones(4, 1.6, 2.2, { zig: 1 });
    b.pad(6, { w: 4 }).checkpoint().coins(3);
    b.secret("R", { dist: 2, dy: 0.8 });
    b.gap(1.8, 6, { w: 4 }).chaser();
    b.hint(-4, 0, "Sneaky Spud chases you — two swipes take it down");
    b.turn("R", { w: 4 }, 0);
    b.steps(2, 0.9, 2.4, { w: 3.6 });
    b.gap(2, 5, { w: 3.6, arc: 2 }).coins(3).patrol();
    b.gap(1.6, 3, { w: 3.6 });
    b.goal();
  }),
  L(3, "Bunny Burrow", (b) => {
    b.start(6).coins(3);
    b.pad(8, { w: 5 }).patrol({ across: true, f: -3 }).coins(4, -1.5);
    b.stones(3, 1.8, 2.2, { dys: [0.6, 0.6, -0.6] });
    b.turn("R", { w: 4.5, gap: 1.6 }).coins(3);
    b.pad(5, { w: 3.6 }).spikes(-2.5, 0.8);
    b.hint(-4, 0, "Jump over the spikes!");
    b.pad(5, { w: 3.6 }).coins(3).checkpoint();
    b.gap(2, 6, { w: 4.5, arc: 2 }).chaser().coins(2, 1.4);
    b.secret("L", { dist: 2.2, dy: -0.6 });
    b.turn("L", { w: 4.5 });
    b.stones(3, 1.6, 2.3);
    b.pad(7, { w: 5 }).rescue("Pip the Bunny", "bunny", -3.5).coins(3, 1.6);
    b.hint(-6, 0, "Swipe the cage twice to free Pip — the portal opens when friends are safe");
    b.gap(1.8, 4, { w: 4 }).coins(2);
    b.goal();
  }),
  L(4, "Windmill Way", (b) => {
    b.start(6).coins(3);
    b.steps(2, 0.8, 2.6);
    b.pad(5, { w: 3.6 }).coins(3).spring(-1.4, 0);
    b.hint(-3, 0, "Bounce pads launch you up high!");
    b.pad(5, { gap: 1.2, dy: 3, w: 4 }).coins(4);
    b.route.splice(-4, 3, ["bounce", ...springAt(b, -1), ...lastLand(b)]);
    b.turn("L", { w: 4.5 }).checkpoint().patrol({ across: true });
    b.stones(4, 1.7, 2.2, { zig: 0.8 });
    b.pad(6, { w: 4 }).chaser().coins(3);
    b.secret("R", { dist: 2.2 });
    b.gap(2.2, 5, { dy: -1, w: 4, arc: 3 }).spikes(-2.5, 0.8, { w: 2.6, s: 0.6 }).coins(2, -1.5);
    b.turn("R", { w: 4.5 });
    b.pad(6, { w: 4 }).patrol().honeyPot(-1, 1.3);
    b.gap(2, 4, { w: 3.6 });
    b.goal();
  }),
  L(5, "Thistle Ridge", (b) => {
    b.start(5).coins(2);
    b.pad(8, { w: 3.4 }).spikes(-4, 0.8).coins(2, 1.1);
    b.gap(2.2, 4, { w: 3.4, arc: 2 });
    b.stones(4, 1.9, 2, { dys: [0.5, 0.5, 0.5, -0.5] });
    b.turn("R", { w: 4.5, gap: 1.8 }).checkpoint().ring(6, 1.2);
    b.pad(8, { w: 4 }).patrol().chaser({ f: -2 }).coins(4, 1.4);
    b.secret("L", { dist: 2.4, dy: 1 });
    b.gap(2.2, 5, { w: 3.4 }).spikes(-1.6, 0.8);
    b.turn("L", { w: 4 });
    b.steps(3, 0.8, 2.2, { w: 3.4 });
    b.pad(6, { w: 4 }).checkpoint().coins(3).honeyPot(-1, -1.3);
    b.stones(3, 2, 2.2, { zig: 1 });
    b.pad(6, { w: 4.5 }).chaser().coins(3, -1.5);
    b.goal(5, { gap: 1.8 });
  }),
  L(6, "Old Oak Hollow", (b) => {
    b.start(6).coins(3);
    b.pad(6, { w: 4 }).patrol().coins(3, 1.4);
    b.gap(2.2, 3, { dy: 1, w: 3.4 });
    b.gap(2.2, 3, { dy: 1, w: 3.4 }).coins(2);
    b.gap(2.2, 6, { dy: -0.5, w: 4, arc: 2 }).spikes(-3, 0.8, { w: 2.2, s: -0.8 }).coins(2, 1.3);
    b.turn("L", { w: 4.5 }).checkpoint();
    b.stones(4, 1.8, 2, { zig: 1.2 });
    b.pad(7, { w: 4.5 }).chaser().patrol({ across: true, f: -2 }).coins(3);
    b.secret("R", { dist: 2, dy: -2.2, size: 3.2 });
    b.turn("R", { w: 4.5, gap: 2 });
    b.pad(5, { w: 3.6 }).spring(-1.4, 0).coins(2);
    b.pad(6, { gap: 1.6, dy: 3, w: 4.5 }).coins(3);
    b.route.splice(-4, 3, ["bounce", ...springAt(b, -1), ...lastLand(b)]);
    b.checkpoint();
    b.gap(2, 7, { w: 5 }).rescue("Rusty the Fox", "fox", -3.5).chaser({ f: -1.5, s: 1.5 });
    b.goal(5, { gap: 1.6 });
  }),

  /* ================================================================ WORLD 2 — Sunny Desert */
  L(7, "Dune Steps", (b) => {
    b.start(6).coins(3);
    b.pad(5, { w: 3.6 }).coins(3);
    b.mover(5, { period: 5 });
    b.pad(5, { gap: 0.7, w: 3.6 }).coins(3).patrol();
    b.turn("R", { w: 4.5, gap: 1.8 }).checkpoint();
    b.pad(4, { w: 3.6, surface: "sand" });
    b.hint(-3, 0, "Sand traps! Keep moving or you'll sink");
    b.pad(5, { w: 3.6 }).coins(3);
    b.secret("L", { dist: 2.2 });
    b.mover(6, { side: 2, period: 5.5 });
    b.pad(6, { gap: 0.7, w: 4 }).chaser().coins(3);
    b.steps(2, 0.9, 2.4);
    b.goal(5, { gap: 1.8 });
  }),
  L(8, "Cactus Crossing", (b) => {
    b.start(5).coins(2);
    b.stones(3, 1.8, 2.2);
    b.pad(6, { w: 4, gap: 1.6 }).saw({ period: 2.6 }).coins(3, 1.4);
    b.hint(-4, 0, "Rolling thornballs — time your run!");
    b.turn("L", { w: 4.5 }).checkpoint();
    b.mover(5.5, { period: 5 });
    b.pad(4, { gap: 0.7, w: 3.6, surface: "sand" }).coins(2);
    b.pad(5, { w: 3.6 }).patrol();
    b.secret("R", { dist: 2.4, dy: 0.7 });
    b.elevator(3, { period: 5 });
    b.pad(6, { gap: 0.7, w: 4 }).coins(4).chaser();
    b.turn("R", { w: 4.5 }).checkpoint();
    b.gap(2.4, 5, { w: 3.6, dy: -1, arc: 2 }).saw({ period: 3 });
    b.gap(2, 4, { w: 3.6 });
    b.goal();
  }),
  L(9, "Oasis Rescue", (b) => {
    b.start(6).coins(3);
    b.pad(6, { w: 4 }).patrol().coins(2, 1.4);
    b.mover(6, { period: 5.5 });
    b.pad(4, { gap: 0.7, w: 3.6, surface: "sand" });
    b.pad(4, { w: 3.6 }).coins(2);
    b.turn("R", { w: 4.5, gap: 1.6 }).checkpoint().ring(6);
    b.stones(4, 2, 2, { zig: 1 });
    b.pad(6, { w: 4 }).saw({ period: 2.8 }).coins(2, -1.4);
    b.pad(4, { w: 4 });
    b.secret("L", { dist: 2.2, dy: -2, size: 3 });
    b.mover(4, { side: -2, period: 5 });
    b.pad(7, { gap: 0.7, w: 5 }).rescue("Bramble the Hedgehog", "hedgehog", -3.5).chaser({ f: -1.5 });
    b.turn("L", { w: 4.5 }).honeyPot(-2, 0);
    b.gap(2.2, 4, { w: 3.6, arc: 2 });
    b.goal();
  }),
  L(10, "Sunken Temple", (b) => {
    b.start(5).coins(2);
    b.pad(5, { w: 3.4, surface: "sand" });
    b.pad(4, { w: 3.4 }).coins(2);
    b.steps(3, 0.9, 2.2, { w: 3.4 });
    b.mover(6, { period: 5 });
    b.mover(5, { side: 3, period: 5 });
    b.pad(6, { gap: 0.7, w: 4 }).checkpoint().patrol().coins(3, 1.3);
    b.turn("L", { w: 4.5 });
    b.pad(7, { w: 4 }).saw({ period: 2.4 }).spikes(-2.4, 0.7).coins(3, -1.3);
    b.pad(4, { w: 4 });
    b.secret("R", { dist: 2.4 });
    b.stones(3, 2, 2.2, { dys: [0.6, 0.6, 0] });
    b.turn("R", { w: 4.5, gap: 1.8 }).checkpoint();
    b.pad(5, { w: 4, surface: "sand" }).coins(2);
    b.pad(5, { w: 4 }).chaser();
    b.goal(5, { gap: 2 });
  }),
  L(11, "Mirage Market", (b) => {
    b.start(5).coins(2);
    b.elevator(2.5, { period: 4.5 });
    b.pad(6, { gap: 0.7, w: 4 }).patrol().coins(3, 1.4);
    b.gap(2.4, 4, { w: 3.4, arc: 2 }).saw({ period: 2.2 });
    b.turn("R", { w: 4.5, gap: 1.8 }).checkpoint();
    b.mover(6, { side: -2, period: 5.5 });
    b.pad(4, { gap: 0.7, w: 3.4, surface: "sand" }).coins(2);
    b.pad(5, { w: 3.6 }).chaser();
    b.secret("L", { dist: 2.6, dy: 1 });
    b.turn("L", { w: 4.5 });
    b.stones(4, 2.1, 2, { zig: 1.2 });
    b.pad(6, { w: 4 }).checkpoint().honeyPot(-1, 1.3).spikes(-3.5, 0.8, { period: 2.4, on: 0.5 });
    b.mover(7, { period: 6 });
    b.pad(5, { gap: 0.7, w: 4 }).patrol();
    b.goal(5, { gap: 1.8 });
  }),
  L(12, "Pharaoh's Gate", (b) => {
    b.start(5).coins(2);
    b.pad(6, { w: 4 }).chaser().coins(2, 1.4);
    b.mover(6, { period: 5 });
    b.mover(6, { side: -3, period: 5 });
    b.pad(5, { gap: 0.7, w: 4 }).checkpoint();
    b.pad(4, { w: 3.4, surface: "sand" });
    b.pad(6, { w: 4 }).saw({ period: 2.4 }).saw({ period: 2.4, ph: 0.5, f: -1.5 }).coins(3);
    b.turn("R", { w: 4.5 }).ring(6);
    b.secret("R", { dist: 2.2, dy: -2.4 });
    b.stones(3, 2.2, 2, { dys: [0.7, 0.7, 0.7] });
    b.elevator(3, { period: 5 });
    b.pad(7, { gap: 0.7, w: 5 }).checkpoint(-6).rescue("Clementine the Chick", "chick", -3.5).patrol({ across: true, f: -1.5 });
    b.turn("L", { w: 4.5 });
    b.gap(2.4, 4, { w: 3.6, arc: 2 }).chaser();
    b.goal(5, { gap: 1.8 });
  }),

  /* ================================================================ WORLD 3 — Snowy Mountain */
  L(13, "Frosty Trail", (b) => {
    b.start(6).coins(3);
    b.pad(7, { w: 4, surface: "ice" }).coins(3);
    b.hint(-6, 0, "Ice is slippery — move gently!");
    b.gap(2, 5, { w: 4 }).patrol();
    b.pad(6, { w: 3.6 }).drop(-3).coins(2, 1.2);
    b.hint(-5, 0, "Watch the shadows — icicles fall from above");
    b.turn("L", { w: 4.5 }).checkpoint();
    b.stones(3, 1.8, 2.2, { surface: "ice" });
    b.pad(6, { w: 4, gap: 1.6 }).chaser().coins(3);
    b.secret("R", { dist: 2.2 });
    b.turn("R", { w: 4.5, gap: 1.6 });
    b.steps(2, 0.9, 2.4, { w: 3.6, surface: "ice" });
    b.gap(2, 5, { w: 4 }).drop(-2.5, { period: 2.8 });
    b.goal(5, { gap: 1.6 });
  }),
  L(14, "Pine Peak", (b) => {
    b.start(5).coins(2);
    b.steps(3, 0.9, 2.4, { w: 3.6 });
    b.crumbles(3, 1.6, 2.2);
    b.hint(-6, 0, "Cracked ice breaks — don't stand still!");
    b.pad(6, { w: 4, gap: 1.6 }).checkpoint().patrol({ across: true }).coins(2, 1.4);
    b.turn("R", { w: 4.5, surface: "ice" });
    b.pad(8, { w: 3.6, surface: "ice" }).drop(-2.5).drop(-5.5, { ph: 0.5 }).coins(4);
    b.pad(4, { w: 4 });
    b.secret("L", { dist: 2.2, dy: 0.8 });
    b.mover(5, { period: 5.5 });
    b.pad(6, { gap: 0.7, w: 4 }).chaser().honeyPot(-1, 1.3);
    b.turn("L", { w: 4.5 }).checkpoint();
    b.stones(3, 2, 2.2, { zig: 1 });
    b.goal(5, { gap: 2 });
  }),
  L(15, "Penguin Pass", (b) => {
    b.start(5).coins(2);
    b.pad(6, { w: 4, surface: "ice" }).patrol();
    b.gap(2.2, 4, { w: 3.6, arc: 2 }).drop(-2);
    b.turn("L", { w: 4.5, gap: 1.6 }).checkpoint().ring(6);
    b.crumbles(4, 1.6, 2.2, { zig: 0.8 });
    b.pad(6, { w: 4, gap: 1.6 }).bar({ w: 1.5 }).coins(2, 1.5);
    b.hint(-5, 0, "Jump over the spinning log!");
    b.pad(4, { w: 4 });
    b.secret("R", { dist: 2.2, dy: -2.2 });
    b.turn("R", { w: 4.5 });
    b.pad(5, { w: 3.6, surface: "ice" }).chaser();
    b.elevator(2.8, { period: 5 });
    b.pad(7, { gap: 0.7, w: 5 }).checkpoint(-6).rescue("Waddles the Penguin", "penguin", -3.5).patrol({ across: true, f: -1.5 });
    b.gap(2.2, 4, { w: 3.6 }).drop(-2, { period: 2.6 });
    b.goal(5, { gap: 1.8 });
  }),
  L(16, "Avalanche Alley", (b) => {
    b.start(5).coins(2);
    b.pad(10, { w: 4 }).drop(-2.5).drop(-5, { ph: 0.33 }).drop(-7.5, { ph: 0.66 }).coins(4, 1.4);
    b.turn("R", { w: 4.5, gap: 1.8 }).checkpoint();
    b.stones(4, 2, 2, { surface: "ice", dys: [0.5, 0.5, 0, -0.5] });
    b.pad(6, { w: 4, gap: 1.8 }).chaser().patrol({ across: true, f: -1.5 });
    b.secret("L", { dist: 2.6 });
    b.mover(6, { side: 2, period: 5.5 });
    b.pad(6, { gap: 0.7, w: 4 }).bar({ w: 1.8 }).coins(3, 1.5);
    b.turn("L", { w: 4.5 }).checkpoint().honeyPot(-2, 1.4);
    b.crumbles(3, 1.8, 2.2);
    b.pad(5, { w: 4, gap: 1.8, surface: "ice" }).patrol();
    b.goal(5, { gap: 2 });
  }),
  L(17, "Glacier Gondola", (b) => {
    b.start(5).coins(2);
    b.mover(7, { period: 6 });
    b.mover(6, { side: -3, period: 6 });
    b.pad(5, { gap: 0.7, w: 4 }).checkpoint().chaser();
    b.elevator(3, { period: 5 });
    b.pad(6, { gap: 0.7, w: 3.6, surface: "ice" }).drop(-3).coins(3);
    b.turn("R", { w: 4.5 });
    b.secret("R", { dist: 2.4, dy: -2.2 });
    b.stones(3, 2.2, 2, { zig: 1.2 });
    b.pad(7, { w: 4, gap: 1.8 }).bar({ w: 2 }).coins(2, -1.5);
    b.turn("L", { w: 4.5 }).checkpoint();
    b.crumbles(4, 1.7, 2.2, { dys: [0.6, 0.6, 0, 0] });
    b.pad(5, { w: 4, gap: 1.8 }).patrol().honeyPot(-1, 1.4);
    b.goal(5, { gap: 2 });
  }),
  L(18, "Summit Storm", (b) => {
    b.start(5).coins(2);
    b.steps(3, 1, 2.2, { w: 3.4, surface: "ice" });
    b.pad(7, { w: 4 }).chaser().drop(-2).coins(2, 1.4);
    b.turn("L", { w: 4.5, gap: 2 }).checkpoint();
    b.crumbles(4, 1.8, 2, { zig: 1 });
    b.pad(6, { w: 4, gap: 1.8 }).bar({ w: 2.1 }).drop(-5, { period: 3 });
    b.pad(4, { w: 4 });
    b.secret("R", { dist: 2.2, dy: 0.9 });
    b.mover(6, { period: 5 });
    b.pad(5, { gap: 0.7, w: 3.6, surface: "ice" }).coins(3);
    b.turn("R", { w: 4.5 }).checkpoint();
    b.pad(7, { w: 5 }).rescue("Hoot the Owl", "owl", -3.5).chaser({ f: -1.5, s: 1.5 }).patrol({ across: true, f: -5.5 });
    b.stones(3, 2.2, 2, { dys: [0.8, 0.8, 0] });
    b.goal(5, { gap: 2 });
  }),

  /* ================================================================ WORLD 4 — Crystal Cave */
  L(19, "Glowstone Tunnel", (b) => {
    b.start(5).coins(2);
    b.pad(8, { w: 3.2 }).walls(3).coins(4);
    b.pad(7, { w: 1.5, look: "bridge" }).coins(3);
    b.hint(-6, 0, "Narrow bridge — steady steps!");
    b.pad(6, { w: 4 }).patrol().walls(3, { sides: [-1] });
    b.secret("R", { dist: 2.2, dy: -2.4, size: 3 });
    b.hint(-4, 0, "Treasures hide below — use bounce pads to return");
    b.turn("L", { w: 4.5, gap: 1.8 }).checkpoint();
    b.stones(3, 2, 1.8);
    b.pad(8, { w: 1.4, look: "bridge", gap: 1.6 }).coins(3);
    b.pad(6, { w: 4 }).chaser().walls(3);
    b.goal(5, { gap: 1.8 });
  }),
  L(20, "Amethyst Abyss", (b) => {
    b.start(5).coins(2);
    b.pad(6, { w: 1.5, look: "bridge" }).coins(3);
    b.pad(5, { w: 4, gap: 1.6 }).patrol({ across: true }).walls(3, { sides: [1] });
    b.secret("L", { dist: 2.4, dy: -2.2 });
    b.crumbles(4, 1.6, 2);
    b.turn("R", { w: 4.5, gap: 1.6 }).checkpoint();
    b.pad(8, { w: 1.4, look: "bridge" }).saw({ along: true, period: 3.4 });
    b.pad(6, { w: 4 }).chaser().coins(3, 1.4);
    b.elevator(3, { period: 5 });
    b.pad(5, { gap: 0.7, w: 3.6 }).walls(3, { sides: [-1] }).checkpoint();
    b.secret("R", { dist: 2.2, dy: -2.6 });
    b.stones(3, 2, 1.8, { zig: 1 });
    b.goal(5, { gap: 1.8 });
  }),
  L(21, "Mushroom Grotto", (b) => {
    b.start(5).coins(2);
    b.pad(5, { w: 3.6 }).spring(-1.2, 0);
    b.pad(5, { gap: 1.2, dy: 3.2, w: 4 }).coins(3);
    b.route.splice(-4, 3, ["bounce", ...springAt(b, -1), ...lastLand(b)]);
    b.pad(7, { w: 1.5, look: "bridge" }).coins(3);
    b.turn("L", { w: 4.5, gap: 1.6 }).checkpoint().patrol({ across: true });
    b.secret("L", { dist: 2.4, dy: -2.4 });
    b.crumbles(3, 1.8, 2, { zig: 0.8 });
    b.pad(6, { w: 4, gap: 1.6 }).chaser().coins(2, 1.4);
    b.mover(6, { side: 2, period: 5.5 });
    b.pad(7, { gap: 0.7, w: 5 }).checkpoint(-6).rescue("Truffle the Piglet", "piglet", -3.5).patrol({ across: true, f: -1.5 });
    b.turn("R", { w: 4.5 });
    b.pad(6, { w: 1.4, look: "bridge" }).coins(3);
    b.goal(5, { gap: 1.6 });
  }),
  L(22, "Echoing Chasm", (b) => {
    b.start(5).coins(2);
    b.stones(4, 2.2, 1.8, { dys: [0.6, 0.6, -0.6, 0.6] });
    b.pad(6, { w: 4, gap: 1.8 }).chaser().walls(3.4).coins(2, 1.3);
    b.pad(8, { w: 1.3, look: "bridge" }).saw({ along: true, period: 3.6 }).coins(3);
    b.turn("R", { w: 4.5, gap: 1.6 }).checkpoint();
    b.secret("R", { dist: 2.6, dy: -2.6 });
    b.mover(6, { period: 5 });
    b.mover(5, { side: -3, period: 5 });
    b.pad(6, { gap: 0.7, w: 4 }).patrol().honeyPot(-1, 1.4);
    b.crumbles(4, 1.8, 2, { zig: 1 });
    b.turn("L", { w: 4.5, gap: 1.8 }).checkpoint();
    b.pad(6, { w: 4 }).chaser().walls(3, { sides: [1] });
    b.secret("L", { dist: 2.2, dy: 0.8 });
    b.goal(5, { gap: 2 });
  }),
  L(23, "Crystal Labyrinth", (b) => {
    b.start(5).coins(2);
    b.pad(6, { w: 3.4 }).walls(3.4).patrol();
    b.turn("R", { w: 4 }).walls(3.4, { sides: [-1] });
    b.pad(6, { w: 3.4 }).walls(3.4).saw({ period: 2.6 }).coins(3);
    b.turn("L", { w: 4 }).checkpoint();
    b.pad(7, { w: 1.4, look: "bridge", gap: 1.6 }).coins(3);
    b.pad(6, { w: 4, gap: 1.6 }).chaser().walls(3.4, { sides: [1] });
    b.secret("L", { dist: 2.4, dy: -2.4 });
    b.turn("L", { w: 4 }).walls(3.4, { sides: [1] });
    b.crumbles(3, 2, 2);
    b.pad(6, { w: 4, gap: 1.8 }).checkpoint().patrol({ across: true }).walls(3.4);
    b.turn("R", { w: 4 });
    b.secret("R", { dist: 2.2 });
    b.stones(3, 2.2, 1.8, { zig: 1 });
    b.goal(5, { gap: 1.8 });
  }),
  L(24, "Heart of the Mountain", (b) => {
    b.start(5).coins(2);
    b.pad(8, { w: 1.4, look: "bridge" }).coins(3);
    b.pad(6, { w: 4, gap: 1.6 }).chaser().patrol({ across: true, f: -1.5 });
    b.elevator(3.2, { period: 5 });
    b.pad(5, { gap: 0.7, w: 3.6 }).checkpoint().walls(3, { sides: [-1] });
    b.secret("R", { dist: 2.4, dy: -2.6 });
    b.crumbles(4, 1.8, 2, { zig: 0.9 });
    b.turn("R", { w: 4.5, gap: 1.6 });
    b.pad(8, { w: 1.3, look: "bridge" }).saw({ along: true, period: 3.2 });
    b.pad(5, { w: 4, gap: 1.6 }).checkpoint().honeyPot(-1, 1.4);
    b.mover(6, { side: -2, period: 5 });
    b.pad(7, { gap: 0.7, w: 5 }).rescue("Nibbles the Mouse", "mouse", -3.5).chaser({ f: -1.5, s: -1.5 }).chaser({ f: -5.5, s: 1.5 });
    b.secret("L", { dist: 2.4, dy: 1 });
    b.goal(5, { gap: 2 });
  }),

  /* ================================================================ WORLD 5 — Dark Castle */
  L(25, "Drawbridge Dash", (b) => {
    b.start(5).coins(2);
    b.pad(8, { w: 4 }).walls(3).fire(-3, { period: 3 }).fire(-6, { period: 3, ph: 0.5 }).coins(3, 1.4);
    b.hint(-7, 0, "Fire vents puff smoke before they blast!");
    b.gap(2.2, 5, { w: 3.6 }).patrol();
    b.turn("R", { w: 4.5, gap: 1.8 }).checkpoint();
    b.pad(6, { w: 3.6 }).spikes(-3, 0.9, { period: 2.6, on: 0.5 }).coins(2, 1.2);
    b.mover(6, { period: 5 });
    b.pad(6, { gap: 0.7, w: 4 }).chaser().honeyPot(-1, 1.4);
    b.secret("L", { dist: 2.4, dy: -2.4 });
    b.turn("L", { w: 4.5, gap: 1.8 }).checkpoint();
    b.pad(7, { w: 4 }).bar({ w: 2 }).coins(2, 1.5);
    b.stones(3, 2.2, 2);
    b.goal(5, { gap: 2 });
  }),
  L(26, "Torchlit Halls", (b) => {
    b.start(5).coins(2);
    b.pad(10, { w: 3.6 }).walls(3.4).fire(-2.5, { period: 2.6 }).fire(-5, { period: 2.6, ph: 0.33 }).fire(-7.5, { period: 2.6, ph: 0.66 }).coins(3, 1.2);
    b.turn("L", { w: 4.5 }).checkpoint().patrol({ across: true });
    b.crumbles(3, 1.8, 2);
    b.pad(6, { w: 4, gap: 1.8 }).chaser().walls(3.4, { sides: [-1] });
    b.secret("R", { dist: 2.4, dy: 0.9 });
    b.mover(6, { side: 2, period: 5 });
    b.pad(6, { gap: 0.7, w: 4 }).saw({ period: 2.4 }).spikes(-1.2, 0.8, { period: 2.4, on: 0.5, ph: 0.5 });
    b.turn("R", { w: 4.5 }).checkpoint().honeyPot(-2, 1.4);
    b.stones(3, 2.2, 2, { dys: [0.7, 0.7, 0.7] });
    b.pad(6, { w: 4.5, gap: 2 }).patrol().chaser({ f: -2 });
    b.goal(5, { gap: 2 });
  }),
  L(27, "Dungeon Depths", (b) => {
    b.start(5).coins(2);
    b.pad(7, { w: 1.6, look: "bridge" }).fire(-3.5, { period: 3 }).coins(2);
    b.pad(6, { w: 4, gap: 1.6 }).chaser().walls(3.4, { sides: [1] });
    b.secret("L", { dist: 2.4, dy: -2.6 });
    b.mover(6, { period: 5 });
    b.mover(6, { side: 3, period: 5 });
    b.pad(5, { gap: 0.7, w: 4 }).checkpoint();
    b.pad(7, { w: 4 }).bar({ w: 2.1 }).coins(2, 1.5);
    b.turn("R", { w: 4.5, gap: 1.8 }).honeyPot(-2, 1.4);
    b.crumbles(4, 1.8, 2, { zig: 1 });
    b.pad(7, { w: 5, gap: 1.8 }).checkpoint(-6).rescue("Whiskers the Kitten", "cat", -3.5).patrol({ across: true, f: -1.5 }).chaser({ f: -5.5, s: 1.5 });
    b.turn("L", { w: 4.5 });
    b.pad(6, { w: 3.6 }).spikes(-3, 0.9, { period: 2.2, on: 0.5 });
    b.goal(5, { gap: 2 });
  }),
  L(28, "Spiked Ramparts", (b) => {
    b.start(5).coins(2);
    b.steps(3, 1, 2.2, { w: 3.4 });
    b.pad(8, { w: 3.6 }).spikes(-2.5, 0.9, { period: 2.4, on: 0.5 }).spikes(-5.5, 0.9, { period: 2.4, on: 0.5, ph: 0.5 }).coins(2, 1.2);
    b.turn("L", { w: 4.5, gap: 1.8 }).checkpoint().chaser();
    b.pad(8, { w: 1.4, look: "bridge" }).saw({ along: true, period: 3.2 });
    b.pad(6, { w: 4, gap: 1.6 }).patrol().fire(-2, { period: 2.8 });
    b.elevator(3.2, { period: 5 });
    b.pad(5, { gap: 0.7, w: 3.6 }).checkpoint().honeyPot(-1, 1.2);
    b.secret("R", { dist: 2.4, dy: -2.6 });
    b.turn("R", { w: 4.5 });
    b.stones(4, 2.2, 1.8, { zig: 1.1 });
    b.pad(7, { w: 4.5, gap: 1.8 }).bar({ w: 2.2 }).chaser({ f: -1.2, s: 1.6 });
    b.goal(5, { gap: 2 });
  }),
  L(29, "Throne Approach", (b) => {
    b.start(5).coins(2);
    b.pad(8, { w: 4 }).walls(3.4).fire(-2, { period: 2.4 }).fire(-4, { period: 2.4, ph: 0.5 }).fire(-6, { period: 2.4 }).coins(3, 1.4);
    b.mover(6, { period: 4.6 });
    b.pad(6, { gap: 0.7, w: 4 }).checkpoint().chaser().patrol({ across: true, f: -1.5 });
    b.secret("L", { dist: 2.6, dy: 1 });
    b.crumbles(4, 2, 2, { dys: [0.6, 0.6, 0, 0] });
    b.turn("R", { w: 4.5, gap: 1.8 }).checkpoint();
    b.pad(7, { w: 4 }).bar({ w: 2.3 }).saw({ period: 2.2, f: -1.2 }).coins(2, 1.5);
    b.pad(8, { w: 1.3, look: "bridge" }).spikes(-4, 0.9, { period: 2.2, on: 0.45 });
    b.turn("L", { w: 4.5, gap: 1.6 }).honeyPot(-2, 1.4);
    b.secret("R", { dist: 2.4, dy: -2.6 });
    b.stones(3, 2.3, 2, { dys: [0.7, 0.7, 0.7] });
    b.pad(6, { w: 4.5, gap: 2 }).chaser().chaser({ f: -4.5, s: 1.5 });
    b.goal(5, { gap: 2 });
  }),
  L(
    30,
    "Baron's Throne Room",
    (b) => {
      b.start(5).coins(2);
      b.pad(6, { w: 4 }).walls(3.4).coins(3).honeyPot(-1.5, 1.2);
      b.hint(-5, 0, "Baron Bristlesnout awaits. Hit him when he's dazed!");
      b.stones(3, 2, 2);
      b.pad(5, { w: 3.6, gap: 1.6 }).checkpoint();
      b.pad(4, { w: 3.2 });
      b.arena(10);
    },
    { boss: true },
  ),
];

/** dev builds re-run every builder lazily; levels are built once and cached */
const CACHE = new Map();
export function getLevel(id) {
  if (!CACHE.has(id)) {
    const def = DEFS[id - 1];
    if (!def) return null;
    CACHE.set(id, def());
  }
  return CACHE.get(id);
}
export const LEVEL_COUNT = DEFS.length;
export const levelName = (id) => getLevel(id)?.name ?? "";

/* ---------------------------------------------------------------- route helpers for springs */
function springAt(b, idx) {
  const s = b.springs[b.springs.length + idx];
  return [s.x, s.z];
}
function lastLand(b) {
  // landing point a little into the newest platform
  const j = b.route.findLast ? b.route.findLast((r) => r[0] === "jump") : [...b.route].reverse().find((r) => r[0] === "jump");
  return [j[1], j[2], j[3]];
}
