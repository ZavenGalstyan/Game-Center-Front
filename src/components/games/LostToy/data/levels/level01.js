/**
 * Level 1 — THE FIRST STEP (Cozy Bedroom). The quality benchmark.
 *
 * The toy tumbles out of a tipped cardboard box onto a sunny bedroom floor.
 * Far across the room, past the giant desk, a low toy shelf waits.
 *
 *   spawn (inside the box) → rug                         MOVE
 *   → three lying books, each a little higher            JUMP          (Memory Button 1, main route)
 *   → drop onto a fallen pillow → onto the toy chest      BOUNCE        (checkpoint)
 *   → push the letter block to the chest edge            PUSH
 *   → block → chair cushion → bounce up to the desk      LEDGE / BOUNCE (checkpoint)
 *   → wind the crank (E) → ride the string gondola        INTERACT / RIDE
 *   → low toy shelf: finish flag
 *   optional: under the bed (Memory Button 2, exploration detour)
 *             book stair on the desk → window sill (Memory Button 3, platforming)
 */
import { createKit } from "../kit.js";

export default function level01() {
  const K = createKit({ id: 1, name: "The First Step", world: 1, maxFall: 5.5 });

  K.room({ x0: -32, x1: 32, z0: -22, z1: 26, h: 26, windows: [{ wall: "back", c: 4, y: 9.6, w: 15, h: 11, sill: 0.9 }], doors: [{ wall: "front", c: 14, w: 9, h: 21 }] });

  /* ---------------------------------------------------------- start: the box and the rug */
  K.cardboard(-29, 0, 15.5, 5, 4, 5, { open: "+x", label: "FRAGILE" });
  K.spawn(-28.2, 0.14, 15.5, Math.PI / 2);
  K.hint("move", -32, 10, -19, 21, 0, 3);
  K.rug(-15, 9, 14, 10, { pattern: "classic" });
  K.sock(-19, 0.08, 12.4, { rot: 0.6 });
  K.crayons(-11.5, 0.08, 6.5, { seed: 2 });
  K.paper(-17.5, 0.08, 6.0, 3.2, 2.4, { rot: 0.4 });

  /* ---------------------------------------------------------- jump: lying books */
  K.book(-7.8, 0, -4.4, 2.4, 0.55, 3.2, { color: "#2f6f8f", band: "#f2d16b", spine: 0 });
  K.books(-4.4, 0, -4.3, [
    { w: 2.4, h: 0.5, d: 2.8, color: "#c0504d", band: "#f6e6c4", spine: 3 },
    { w: 2.2, h: 0.5, d: 2.6, color: "#6a8f3f", band: "#f2d16b", dx: 0.05, dz: 0.05, spine: 0 },
  ]);
  K.books(-1.0, 0, -4.4, [
    { w: 2.4, h: 0.5, d: 3.2, color: "#8a5aa8", band: "#f6e6c4", spine: 1 },
    { w: 2.3, h: 0.5, d: 3.0, color: "#e0a33a", band: "#7a3f2a", dx: -0.05, spine: 0 },
    { w: 2.2, h: 0.55, d: 2.9, color: "#3f7fd6", band: "#ffffff", dx: 0.04, dz: -0.06, spine: 3 },
  ]);
  K.hint("jump", -11, -8, -5.8, 0, 0, 2);
  K.button(-4.4, 1.55, -4.3, "on the book stack");

  /* ---------------------------------------------------------- bounce: pillow → toy chest */
  K.pillow(-0.9, 0, -8.7, 4.2, 1.3, 3.4, { color: "#f7efe0", bounce: 8.8 });
  K.hint("bounce", -2.6, -7.2, 0.6, -2.4, 1.2, 3);
  K.chest(-3.4, 1.6, -15.2, -10.4, 2.8, { color: "#7fb5c9", trim: "#f4e7cf", front: "+z" });
  K.checkpoint(0.3, 2.8, -11.2, Math.PI / 2);

  /* ---------------------------------------------------------- push: letter block to the edge */
  K.block(-2.1, 2.8, -12.8, 1.1, { color: "#e85d4a", letter: "A", push: { axis: "x", range: [[-2.8, 1.05], null] } });
  K.hint("push", -3.4, -15.2, 1.6, -10.4, 2.8, 2);

  /* ---------------------------------------------------------- chair → desk */
  K.chair(4.6, -12.9, { facing: "-z", seatH: 4.5, size: 4.4, color: "#c8956a", cushion: { color: "#e07a5f", bounce: 8.6 } });
  K.hint("ledge", 1.6, -15.2, 7.2, -10.4, 3.8, 2.4);
  K.desk(-6, 12, -22, -15.5, 7.2, { drawers: "left", color: "#d2a679" });
  K.checkpoint(5.6, 7.2, -17.2, Math.PI / 2);

  // desk dressing (all solid, all at scale)
  K.lamp(-3.8, 7.2, -19.8, { color: "#f2c14e", dir: 0.9, h: 8.5, reach: 3 });
  K.mug(-0.6, 7.2, -16.9, { color: "#f2efe8", accent: "#e07a5f" });
  K.notebook(5.2, 7.2, -19.6, 4.2, 3.0, { color: "#3f7fd6", open: true, rot: 0.15 });
  K.pencilCup(8.6, 7.2, -20.6, { color: "#5a8fd1" });
  K.pencil(7.6, 7.2, -16.6, 3.2, { axis: "x", color: "#f2c14e" });
  K.eraser(9.8, 7.2, -16.4, { color: "#f28da0" });

  // optional platforming: book stair on the desk → window sill (Memory Button 3)
  K.book(1.0, 7.2, -19.3, 2.6, 0.45, 3.2, { color: "#a83f3f", band: "#f2d16b", spine: 0 });
  K.book(1.5, 7.65, -19.6, 2.2, 0.45, 2.6, { color: "#2f6f8f", band: "#f6e6c4", spine: 1 });
  K.book(2.0, 8.1, -19.9, 1.8, 0.45, 2.0, { color: "#6a8f3f", band: "#ffffff", spine: 3 });
  K.plant(6.2, 9.6, -21.55, { r: 0.42, h: 1.25, color: "#c96f4a", leaf: "#5f9b52", size: 0.45 });
  K.button(10.6, 10.15, -21.55, "on the window sill");
  K.curtains("back", 4, 9.6, 15, 12, { color: "#f2b8a0" });

  /* ---------------------------------------------------------- interact + ride: the string gondola */
  const gon = K.mover(
    "gondola",
    { min: [12.1, 6.95, -19.8], max: [14.7, 7.2, -17.2] },
    { type: "line", d: [12.2, 0, 0], period: 15, hold: 0.16 },
    { startsOn: false, color: "#e0a33a", color2: "#d9473b", extra: { anchorA: [11.6, 13.5, -18.5], anchorB: [31.4, 13.5, -18.5] } },
  );
  K.interact("crank", 10.9, 7.2, -18.5, { mover: gon }, { label: "Wind the crank", r: 1.5, rot: 1 });
  K.hint("interact", 8.8, -21, 12, -16, 7.2, 2);

  /* ---------------------------------------------------------- the low toy shelf: finish */
  const boards = K.shelf(27, 32, -21, -9, 7.2, { tiers: 2, open: "-x", color: "#f0e2c8" });
  K.finish(29.6, 7.2, -15, { r: 1.2 });
  // a few friendly toys on the shelf below (scale cues)
  K.block(29.6, boards[1], -11.2, 1.3, { color: "#4fb3a8", letter: "C" });
  K.car(29.5, boards[0], -17.8, { rot: 1, color: "#d9473b" });

  /* ---------------------------------------------------------- the bed (exploration: under it) */
  K.bed(-32, -22, -21.4, -3, { top: 5.0, hang: "+x", blanket: "#6f9bd1", blanket2: "#f4e3b2", color: "#e7cfa8" });
  K.button(-27.5, 0.5, -11.5, "under the bed");
  K.sock(-25.6, 0, -9.2, { rot: 2.2, color: "#9fd0ff", stripe: "#3f7fd6" });
  K.nightstand(-18.7, -19.2, { w: 4.4, d: 3.6, h: 5.5, color: "#d8b48a", front: "+z" });
  K.alarmClock(-18.4, 5.5, -19.6, { color: "#e85d4a" });

  /* ---------------------------------------------------------- the rest of the room (scale + life) */
  K.wardrobe(25, 32, 6, 20, 21, { color: "#ead9bf", front: "-x" });
  K.teddy(19.5, 19.5, { s: 1.15, rot: 2.6, color: "#c98d5a" });
  K.ball(12.5, 0, 13, 2.4, { color: "#4fb3a8", color2: "#f6d04d" });
  K.laundry(-6, 21, 7, 2.6, 5, { bounce: 7, seed: 4 });
  K.car(4, 0, 9.5, { rot: 0.35, color: "#3f7fd6" });
  K.blocks(8.5, 0, 4.5, [
    { s: 1.3, color: "#f2c14e", letter: "L" },
    { s: 1.2, color: "#6a8f3f", letter: "T", dx: 0.1 },
  ]);
  K.plant(20, 0, -18, { r: 2.2, h: 3.2, color: "#c96f4a", leaf: "#4f8a4a", size: 2.4 });
  K.wallArt("left", 4, 13, 7, 9, { art: "sun" });
  K.wallArt("left", -8, 15, 5, 6, { art: "boat" });
  K.wallClock("right", -2, 17, 2.4);
  K.wallShelf("front", -14, 15, 12, { items: "toys" });
  K.ceilingLamp(0, 2);

  /* ---------------------------------------------------------- bot route (tools/levelBot.mjs) */
  K.go(-26, 15.5);
  K.go(-27, -1, { only: "buttons" });
  K.go(-27.5, -11.5, { only: "buttons" });
  K.go(-26, -1, { only: "buttons" });
  K.go(-10.4, -4.4);
  K.go(-7.8, -4.4, { jump: true, jd: 1.3, y: 0.55 });
  K.go(-4.4, -4.3, { jump: true, jd: 1.4, y: 1.0 });
  K.go(-1.0, -4.4, { jump: true, jd: 1.4, y: 1.55 });
  K.go(-1.0, -5.6, { y: 1.55, r: 0.25 });
  K.go(-0.9, -12.0, { jump: true, jd: 9, hold: true, y: 2.8 });
  K.go(-3.0, -11.0, { y: 2.8 });
  K.go(-3.15, -12.8, { y: 2.8, r: 0.2 });
  K.go(0.3, -12.8, { y: 2.8, r: 0.3 });
  K.go(1.05, -12.8, { jump: true, jd: 1.0, y: 3.9 });
  K.go(4.6, -13.1, { jump: true, jd: 4, y: 4.95 });
  K.go(4.6, -17.5, { jump: true, jd: 4, hold: true, y: 7.2 });
  K.go(5.6, -17.2, { y: 7.2 });
  K.go(1.0, -16.9, { y: 7.2, only: "buttons" });
  K.go(1.0, -18.0, { jump: true, jd: 1.2, y: 7.65, r: 0.25, only: "buttons" });
  K.go(1.5, -18.6, { jump: true, jd: 1.0, y: 8.1, r: 0.25, only: "buttons" });
  K.go(2.0, -19.6, { jump: true, jd: 1.0, y: 8.55, only: "buttons" });
  K.go(2.0, -21.55, { jump: true, jd: 2, hold: true, y: 9.6, only: "buttons" });
  K.go(5.3, -21.55, { y: 9.6, only: "buttons" });
  K.go(6.2, -21.55, { jump: true, jd: 1.0, hold: true, y: 10.85, only: "buttons" });
  K.go(10.6, -21.55, { y: 9.6, only: "buttons" });
  K.go(10.6, -19.0, { y: 7.2, only: "buttons" });
  K.go(10.0, -18.5, { y: 7.2, interact: true, r: 0.5 });
  K.go(11.6, -18.5, { y: 7.2, r: 0.25, waitMover: { i: 0, axis: 0, at: 0, tol: 0.02 } });
  K.go(13.4, -18.5, { y: 7.2, r: 0.4, waitMover: { i: 0, axis: 0, at: 12.2, tol: 0.05 } });
  K.go(29.6, -15, { y: 7.2, r: 0.6 });

  return K.done();
}
