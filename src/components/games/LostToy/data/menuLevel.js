/**
 * Lost Toy — the Main Menu backdrop: a bedroom corner in the late afternoon.
 * Pip sits on a book on the floor; past it, the giant room: a bed like a
 * mountain, a desk like a cliff, sunlight through the window, a wind-up car
 * pottering about. Built with the same kit as the levels (it's a real level
 * the camera idles in — no input reaches it).
 */
import { createKit } from "./kit.js";

let cached = null;
export function menuLevel() {
  if (cached) return cached;
  const K = createKit({ id: 0, name: "Menu", world: 1 });
  K.room({ x0: -32, x1: 32, z0: -22, z1: 26, h: 26, windows: [{ wall: "back", c: 4, y: 9.6, w: 15, h: 11, sill: 0.9 }] });
  K.rug(2, 2, 18, 13, { pattern: "classic" });
  K.books(6.2, 0, 10.4, [
    { w: 2.6, h: 0.5, d: 3.4, color: "#2f6f8f", band: "#f2d16b", spine: 1 },
    { w: 2.4, h: 0.45, d: 3.0, color: "#c0504d", band: "#f6e6c4", spine: 0, dx: -0.05 },
  ]);
  K.spawn(6.2, 0.95, 10.4, Math.PI - 0.25);
  K.finish(40, 0, 40);
  K.blocks(9.5, 0, 7.5, [
    { s: 1.4, color: "#f2c14e", letter: "P" },
    { s: 1.25, color: "#e85d4a", letter: "I", dx: 0.1 },
  ]);
  K.block(11.3, 0, 8.6, 1.3, { color: "#4fb3a8", letter: "P" });
  K.crayons(3.2, 0.08, 7.8, { seed: 5 });
  K.sock(-1.5, 0.08, 9.5, { rot: 2.2, color: "#9fd0ff", stripe: "#3f7fd6" });
  K.bed(-32, -22, -21.4, -3, { top: 5.0, hang: "+x", blanket: "#e98a52", blanket2: "#f6d69a", color: "#e7cfa8" });
  K.desk(-6, 12, -22, -15.5, 7.2, { drawers: "left", color: "#d2a679" });
  K.chair(4.6, -12.4, { facing: "-z", seatH: 4.5, size: 4.4, color: "#c8956a", cushion: { color: "#e07a5f" } });
  K.lamp(-3.8, 7.2, -19.8, { color: "#f2c14e", dir: 0.9, h: 8.5, reach: 3 });
  K.mug(-0.6, 7.2, -16.9, { color: "#f2efe8", accent: "#e07a5f" });
  K.books(2, 7.2, -19.5, [
    { w: 2.6, h: 0.45, d: 3.2, color: "#a83f3f", band: "#f2d16b", spine: 0 },
    { w: 2.2, h: 0.45, d: 2.6, color: "#6a8f3f", band: "#ffffff", spine: 1 },
  ]);
  K.pencilCup(8.6, 7.2, -20.6, { color: "#5a8fd1" });
  K.curtains("back", 4, 9.6, 15, 12, { color: "#f2b8a0" });
  K.plant(20, 0, -18, { r: 2.2, h: 3.2, color: "#c96f4a", leaf: "#4f8a4a", size: 2.4 });
  K.shelf(27, 32, -21, -9, 7.2, { tiers: 2, open: "-x", color: "#f0e2c8" });
  K.teddy(-14, 16, { s: 1.15, rot: 0.8, color: "#c98d5a" });
  K.ball(16, 0, 4, 2.4, { color: "#e94f4f", color2: "#f6d04d" });
  K.wardrobe(25, 32, 6, 20, 21, { color: "#ead9bf", front: "-x" });
  K.wallArt("left", 4, 13, 7, 9, { art: "sun" });
  K.wallClock("right", -2, 17, 2.4);
  K.ceilingLamp(0, 2);
  // a wind-up car pottering back and forth across the rug
  K.toyCarMover(0, 0.08, 4.5, "x", -8, 11, { color: "#3f7fd6", hold: 0.08 });
  cached = K.done();
  return cached;
}
