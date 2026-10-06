/**
 * Lost Toy — World 1, Cozy Bedroom, levels 2–10 (level 1 is level01.js).
 * Each level is a different corner of the same sunny bedroom, built from
 * household objects at true scale, and each adds one idea on top of the last:
 *   2 under the bed (maze, cloth climbing)   3 pillows (bounce chains)
 *   4 wall shelves (push, lift, balance, garland climb)
 *   5 the desk (rides, pencil bridges)       6 toy train (riding a loop)
 *   7 blanket fort                           8 windowsill (wind from a fan)
 *   9 wardrobe (drawers, hanging clothes, a sleepy cat)
 *  10 the open door (robot vacuum, the cat on patrol)
 */
import { createKit } from "../kit.js";
import { bedroomShell } from "./shells.js";

/* ====================================================================== 2 */
export function level02() {
  const K = createKit({ id: 2, name: "Under the Bed", world: 1 });
  bedroomShell(K, { clockWall: "right", clockC: -6 });
  K.spawn(-19, 0, 10, Math.PI);
  K.hint("explore", -26, 2, -14, 8, 0, 3);

  // the bed: a mountain with a dark cave underneath
  K.bed(-26, -14, -20, 4, { top: 6.0, frameY: 2.2, railTop: 3.2, headboard: "-z", headboardH: 9.5, hang: "+x", hangZ0: -14, hangZ1: 2.8, blanket: "#8a5aa8", blanket2: "#f6d69a", color: "#d8b48a" });
  // storage bins under the bed: a little maze
  K.shoebox(-22, 0, -0.4, 6, 1.8, 3.2, { color: "#9fc4d8", lid: "#6f9bd1" });
  K.shoebox(-18, 0, -6.0, 6, 1.8, 3.0, { color: "#f2d16b", lid: "#e0a33a" });
  K.shoebox(-22, 0, -11.5, 6, 1.8, 3.0, { color: "#f28da0", lid: "#d9473b" });
  K.shoebox(-18, 0, -15.75, 6, 1.8, 2.5, { color: "#b7d98a", lid: "#6a8f3f" });
  K.slipper(-17, -12, { rot: 0, color: "#f28da0", color2: "#fff0f3" });
  K.button(-17, 0.75, -13.0, "inside the slipper");
  K.button(-24.5, 0.5, 2.6, "behind the first bin");
  K.nightLight(-15.2, 0, -8.6, { color: "#ffd27a", intensity: 3, distance: 12 });
  for (const [x, z, s] of [[-24.5, -3.5, 1.1], [-15.5, -2.4, 0.8], [-24, -16.8, 1.3], [-20.2, -8.8, 0.9], [-15.8, -18.5, 1]]) K.dustBunny(x, z, { s });
  K.sock(-20.5, 0, -18.6, { rot: 1.1, color: "#9fd0ff", stripe: "#3f7fd6" });
  K.crayons(-23, 0, -8.3, { seed: 4 });

  // out from under the bed → climb the hanging blanket → bounce over the bed
  K.hint("climb", -13.8, -14, -10, 2, 0, 3);
  K.checkpoint(-17.5, 6.0, -8, Math.PI);
  K.button(-20, 10.0, -20.3, "on top of the headboard");

  // nightstand: the finish
  K.nightstand(-11.2, -18, { w: 3.6, d: 4, h: 6.4, color: "#d8b48a", front: "+z" });
  K.alarmClock(-10.2, 6.4, -19.2, { color: "#4fb3a8" });
  K.finish(-11.6, 6.4, -17.4, { r: 1.0 });

  // the rest of the room
  K.rug(2, 4, 16, 11, { pattern: "classic" });
  K.desk(-2, 14, -22, -15.5, 7.2, { drawers: "right", color: "#d2a679" });
  K.chair(6, -12.6, { facing: "-z", color: "#c8956a", cushion: { color: "#6f9bd1" } });
  K.wardrobe(25, 32, 6, 20, 21, { color: "#ead9bf", front: "-x" });
  K.teddy(20, 18, { s: 1.1, rot: 3.6 });
  K.ball(8, 0, 14, 2.4, { color: "#e94f4f", color2: "#f6d04d" });
  K.blocks(-6, 0, 14, [{ s: 1.4, color: "#4fb3a8", letter: "B" }, { s: 1.2, color: "#f2c14e", letter: "E", dx: 0.1 }]);
  K.plant(24, 0, -18, { r: 2.2, h: 3.2, leaf: "#4f8a4a", size: 2.4 });

  // route
  K.go(-19, 6.5);
  K.go(-17, 2.4);
  K.go(-24.4, 2.6, { only: "buttons" });
  K.go(-17, 2.4, { only: "buttons" });
  K.go(-17, -3.0);
  K.go(-23.2, -3.4);
  K.go(-23.2, -8.6);
  K.go(-17, -9.4, { only: "buttons" });
  K.go(-17, -12.9, { only: "buttons", y: 0.16 });
  K.go(-17, -9.6, { only: "buttons" });
  K.go(-18.4, -9.2);
  K.go(-18.4, -13.75);
  K.go(-23.2, -13.75);
  K.go(-23.2, -18.3);
  K.go(-13.5, -18.3, { r: 0.25 });
  K.go(-13.4, -15.0, { r: 0.25 });
  K.go(-12.6, -10);
  K.go(-16.5, -10, { jump: true, jd: 2, y: 6.0 });
  K.go(-17.5, -8, { y: 6.0 });
  K.go(-20, -15.4, { y: 6.0, only: "buttons" });
  K.go(-20, -17.4, { jump: true, jd: 3, hold: true, air: true, only: "buttons" });
  K.go(-20, -20.3, { jump: true, jd: 4, hold: true, y: 9.5, only: "buttons" });
  K.go(-16, -17.0, { only: "buttons", air: true, r: 1.0 });
  K.go(-14.8, -17.6, { y: 6.0 });
  K.go(-11.6, -17.4, { jump: true, jd: 4, hold: true, y: 6.4, r: 0.9 });
  return K.done();
}

/* ====================================================================== 3 */
export function level03() {
  const K = createKit({ id: 3, name: "Pillow Mountain", world: 1 });
  bedroomShell(K, { art1: "flower", clockC: 6 });
  K.spawn(14, 0, 4, Math.PI * 0.85);

  // a big bed piled with pillows
  K.bed(-24, 4, -20, 0, { top: 5.5, headboard: "-z", headboardH: 13, hang: "+x", hangZ0: -16, hangZ1: -3, blanket: "#e98a52", blanket2: "#f6d69a", color: "#e7cfa8", pillow: false });
  // block stair → stool → drop onto the spring toy → bounce onto the bed
  K.block(12, 0, -6, 1.2, { color: "#e85d4a", letter: "U" });
  K.blocks(12, 0, -8.5, [{ s: 1.2, color: "#f2c14e", letter: "P" }, { s: 1.2, color: "#4fb3a8", letter: "!" }]);
  K.blocks(12, 0, -11, [{ s: 1.2, color: "#6f9bd1", letter: "H" }, { s: 1.2, color: "#e85d4a", letter: "O" }, { s: 1.2, color: "#f2c14e", letter: "P" }]);
  K.stool(9, -11, { r: 1.8, h: 4, color: "#c8956a" });
  K.springToy(5.6, 0, -11, { bounce: 13.6, color: "#e85d9c" });
  K.hint("bounce", 4.6, -13, 10.6, -9, 0, 6);
  K.checkpoint(1.5, 5.5, -9, -Math.PI / 2);

  // the pillow mountain: stacks of 1, 2, 3, 4 pillows
  const pal = ["#fffaf0", "#f6d69a", "#f2b8a0", "#cfe3ff"];
  const stack = (x, z, n) => {
    let y = 5.5;
    for (let i = 0; i < n; i++) y = K.pillow(x + (i % 2 ? 0.12 : -0.1), y, z, 5 - i * 0.2, 1.3, 3.5 - i * 0.1, { color: pal[i % pal.length], bounce: 9 });
    return y;
  };
  stack(0, -6.7, 1);
  stack(-1.5, -10, 2);
  stack(-3, -13.3, 3);
  stack(-4.5, -16.6, 4);
  K.button(-1.3, 8.9, -9.4, "on the second pillow");
  K.button(-4.5, 12.6, -18.4, "high above the tallest stack");
  K.plush(-20, 5.5, -6, { kind: "bunny", color: "#f4e3e8", s: 1.1 });
  K.hint("balance", -24, -20.6, 4, -19.4, 12.5, 3);
  // walk the headboard to the flag
  K.finish(-21.5, 13, -20.3, { r: 0.9 });
  K.button(-10, 0.5, -2, "under the foot of the bed");

  // room
  K.nightstand(8.5, -18.5, { w: 4.4, d: 4, h: 5.5 });
  K.lamp(8.5, 5.5, -19, { color: "#f2c14e", dir: -2.2, h: 6, reach: 1.4, intensity: 3 });
  K.rug(14, 10, 14, 12, { pattern: "classic" });
  K.laundry(22, 16, 7, 2.6, 5, { seed: 7 });
  K.wardrobe(25, 32, -14, 0, 21, { color: "#ead9bf", front: "-x" });
  K.car(18, 0, 4, { rot: 1, color: "#3f7fd6" });

  // route
  K.go(13, -2.5);
  K.go(-8, -1, { only: "buttons" });
  K.go(-10, -2, { only: "buttons" });
  K.go(13, -2.5, { only: "buttons" });
  K.go(13.5, -6);
  K.go(12, -6, { jump: true, jd: 1.4, y: 1.2 });
  K.go(12, -8.5, { jump: true, jd: 2.6, y: 2.4 });
  K.go(12, -11, { jump: true, jd: 2.6, y: 3.6 });
  K.go(9.4, -11, { jump: true, jd: 2, y: 4.0 });
  K.go(5.6, -11, { slow: 0.7, air: true, r: 0.5 });
  K.go(1.5, -9.5, { hold: true, air: true, r: 1.2 });
  K.go(1.5, -9, { y: 5.5 });
  K.go(1.5, -8.8, { y: 5.5, r: 0.3 });
  K.go(0, -6.7, { jump: true, jd: 6, hold: true, fromY: 6.8, r: 1.4 });
  K.go(-1.5, -10, { hold: true, fromY: 8.1, r: 1.4 });
  K.go(-3, -13.3, { hold: true, fromY: 9.4, r: 1.4 });
  K.go(-4.5, -16.6, { hold: true, fromY: 10.7, r: 1.4 });
  K.go(-4.5, -20.3, { hold: true, y: 13 });
  K.go(-21.5, -20.3, { y: 13, slow: 0.6 });
  return K.done();
}

/* ====================================================================== 4 */
export function level04() {
  const K = createKit({ id: 4, name: "The Bookshelf Climb", world: 1 });
  bedroomShell(K, { window: { wall: "left", c: 2, y: 9.6, w: 15, h: 11, sill: 0.9 }, art: false, clockWall: "right", clockC: 8 });
  K.spawn(-22, 0, -6, Math.PI * 0.8);

  // toy chest + a letter block to push to its edge
  K.chest(-18, -13, -19, -15, 2.8, { color: "#e0a33a", trim: "#fff1cf", front: "+z" });
  K.block(-17, 0, -13.6, 1.4, { color: "#f2c14e", letter: "T" });
  K.block(-15, 2.8, -16.6, 1.2, { color: "#6f9bd1", letter: "S", push: { axis: "z", range: [null, [-18.4, -16.0]] } });
  K.hint("push", -18, -19, -13, -15, 2.8, 2);
  const shelf = (x0, x1, y, z1 = -19, o = {}) => {
    // a floating wall shelf on two brackets
    K.box([x0, y - 0.4, -22], [x1, y, z1], { mat: "wood" });
    K.prop({ type: "wallBoard", x0, x1, y, z0: -22, z1, color: o.color || "#f0e2c8" });
  };
  // S1
  shelf(-16, -6, 4.6);
  K.bookRowZ(-13.2, 4.6, -21.8, -19.2, 1.2, 1.3, { seed: 3 });
  K.checkpoint(-9, 4.6, -20.5, Math.PI / 2);
  K.button(-13.0, 6.4, -20.5, "on the books on the first shelf");
  // S2 + crank lift to S3
  shelf(-4.4, 1.6, 6.0);
  K.checkpoint(-2, 6.0, -20.5, Math.PI / 2);
  K.mug(-3.6, 6.0, -21.2, { r: 0.7, h: 0.9, color: "#fdf6e3", accent: "#4fb3a8" });
  const lift = K.lift(3.2, 6.0, -20.5, 2.4, 2.2, 4.8, { crank: [0.6, 6.0, -20.4], period: 9, look: "book", color: "#2f6f8f", color2: "#f2d16b" });
  void lift;
  K.hint("interact", -1, -22, 1.6, -19, 6.0, 2);
  // S3
  shelf(4.8, 10.8, 10.8);
  K.bookRow(6.5, 9.5, 10.8, -21.4, 1.0, 1.2, { seed: 9 });
  K.button(8, 12.5, -21.4, "on the little books, third shelf");
  // ruler bridge → S4 (deeper shelf)
  K.ruler(11.7, 10.8, -20.2, 3.2, { axis: "x" });
  K.hint("balance", 10.2, -21, 13.2, -19.4, 10.8, 2);
  shelf(12.6, 19, 10.8, -17);
  K.checkpoint(15.5, 10.8, -18.2, Math.PI / 2);
  // S6: a little side shelf for a button
  shelf(20.6, 23, 12.2);
  K.button(21.8, 12.8, -20.5, "on the small side shelf");
  // garland up to S5
  shelf(13, 19, 14.6);
  K.garland(14.4, 16, -19, -18.88, 11.3, 14.6, {});
  K.hint("climb", 13, -19, 19, -17, 10.8, 2);
  K.plush(17.6, 14.6, -20.6, { kind: "bear", color: "#c98d5a", s: 0.8, bounce: 8 });
  K.finish(13.8, 14.6, -20.5, { r: 0.8 });

  // a big bookcase and the rest of the room
  K.shelf(-31.5, -26, -21, -9, 18, { tiers: 4, open: "+x", color: "#d2a679" });
  K.bed(14, 30, 4, 22, { top: 5.0, headboard: "+z", headboardH: 9.5, hang: "none", blanket: "#4fb3a8", color: "#e7cfa8" });
  K.rug(-12, 6, 14, 10, {});
  K.ball(-4, 0, 10, 2.4, { color: "#4fb3a8", color2: "#f6d04d" });
  K.teddy(-24, 18, { s: 1.0, rot: 2.2 });

  // route
  K.go(-18.6, -12.0);
  K.go(-17, -13.6, { jump: true, jd: 1.6, y: 1.4 });
  K.go(-15, -15.4, { jump: true, jd: 2.2, y: 2.8, r: 0.25 });
  K.go(-15, -17.4, { y: 2.8, r: 0.3 });
  K.go(-15, -18.4, { jump: true, jd: 1.2, y: 4.0, r: 0.3 });
  K.go(-14, -20.5, { jump: true, jd: 2.4, y: 4.6 });
  K.go(-13.0, -20.4, { jump: true, jd: 1.2, y: 5.9 });
  K.go(-11, -20.4, { y: 4.6 });
  K.go(-6.4, -20.5, { y: 4.6 });
  K.go(-3.6, -20.0, { jump: true, jd: 2.8, hold: true, y: 6.0 });
  K.go(0.6, -19.4, { y: 6.0, interact: true, r: 0.5 });
  K.go(1.4, -20.5, { y: 6.0, r: 0.25, waitMover: { i: 0, axis: 1, at: 0, tol: 0.02 } });
  K.go(3.2, -20.5, { y: 6.0, r: 0.35, waitMover: { i: 0, axis: 1, at: 4.8, tol: 0.03 } });
  K.go(5.4, -20.5, { y: 10.8 });
  K.go(8, -21.4, { jump: true, jd: 1.3, y: 12.0, only: "buttons" });
  K.go(10.2, -20.2, { y: 10.8 });
  K.go(13.2, -20.2, { y: 10.8, slow: 0.7 });
  K.go(18.6, -20.5, { y: 10.8, only: "buttons" });
  K.go(21.6, -20.5, { jump: true, jd: 3, hold: true, y: 12.2, only: "buttons" });
  K.go(18.4, -20.0, { jump: true, jd: 3, y: 10.8, only: "buttons" });
  K.go(15.2, -17.8, { y: 10.8 });
  K.go(15.2, -20.5, { jump: true, jd: 2, y: 14.6 });
  K.go(13.8, -20.5, { y: 14.6 });
  return K.done();
}

/* ====================================================================== 5 */
export function level05() {
  const K = createKit({ id: 5, name: "Desk Expedition", world: 1 });
  bedroomShell(K, { window: { wall: "back", c: 0, y: 12.5, w: 18, h: 9, sill: 0.6 }, clockC: 10 });
  K.desk(-28, -6, -22, -15.5, 7.2, { drawers: "left", color: "#d2a679" });
  K.desk(-2, 22, -22, -15.5, 7.2, { drawers: "right", color: "#c8956a" });
  K.spawn(-26, 7.2, -18.5, Math.PI / 2);
  K.notebook(-23, 7.2, -18.6, 3, 2.6, { color: "#e07a5f" });
  K.pencilCup(-25.6, 7.2, -21, { color: "#e85d4a" });
  K.button(-27.2, 7.7, -21.2, "behind the pencil cup");
  // a wall of standing books across the desk: hop over
  K.bookRowZ(-20, 7.2, -21.8, -15.7, 1.0, 1.0, { seed: 12 });
  K.button(-20, 8.75, -18.5, "on top of the book wall");
  K.checkpoint(-17.5, 7.2, -18.5, Math.PI / 2);
  // spilled blue paint — ride the wind-up car over it
  K.spill(-10.8, 7.2, -18.7, 4.6, 6.2, { color: "#6fc3e8" });
  const car = K.toyCarMover(-14.8, 7.2, -18.5, "x", 6.6, 10, { startsOn: false, color: "#d9473b", hold: 0.14 });
  K.interact("windup", -16.8, 7.2, -16.4, { mover: car }, { label: "Wind up the car", r: 1.4 });
  K.hint("interact", -18.5, -21.5, -15.5, -15.6, 7.2, 2);
  K.hint("ride", -16, -21.5, -13, -15.6, 7.2, 2);
  // a pencil bridge between the desks
  K.pencil(-4, 7.2, -18.5, 5.4, { axis: "x", color: "#f2c14e" });
  K.hint("balance", -6.5, -19.5, -1.5, -17.5, 7.2, 2);
  K.checkpoint(0.6, 7.2, -18.5, Math.PI / 2);
  K.lamp(2.6, 7.2, -20.6, { color: "#6f9bd1", dir: 0.8, h: 7.5, reach: 2.4 });
  K.laptop(8, 7.2, -19, { w: 6, d: 4, color: "#c9ccd2" });
  K.mug(13.4, 7.2, -20.8, { color: "#f2efe8", accent: "#e98a52" });
  K.eraser(12.4, 7.2, -18.6, {});
  K.crayons(4.5, 7.2, -16.8, { seed: 8 });
  // a jumpy spring toy up to the wall shelf
  K.springToy(17.5, 7.2, -18.6, { bounce: 11.5, color: "#4fb3a8" });
  K.box([14.5, 10.6, -22], [21.5, 11.0, -19.6], { mat: "wood" });
  K.prop({ type: "wallBoard", x0: 14.5, x1: 21.5, y: 11.0, z0: -22, z1: -19.6, color: "#f0e2c8" });
  K.button(18.0, 11.4, -19.4, "high above the spring");
  K.plush(15.6, 11.0, -21, { kind: "whale", color: "#9fd0ff", s: 0.6, bounce: 7 });
  K.finish(19.6, 11.0, -20.9, { r: 0.8 });
  // room
  K.chair(-17, -11.6, { facing: "-z", color: "#c8956a" });
  K.rug(0, 6, 18, 12, {});
  K.bed(-32, -20, 4, 24, { top: 5, headboard: "+z", hang: "none", blanket: "#6a8f3f", color: "#e7cfa8" });
  K.teddy(20, 18, { s: 1.0, rot: 3.3 });

  K.go(-23, -18.6, { y: 7.2 });
  K.go(-25.6, -19.2, { only: "buttons", y: 7.2 });
  K.go(-27.2, -21.1, { only: "buttons", y: 7.2, r: 0.25 });
  K.go(-24, -18.5, { only: "buttons", y: 7.2 });
  K.go(-21.3, -18.5, { y: 7.2 });
  K.go(-20, -18.5, { jump: true, jd: 1.4, y: 8.2 });
  K.go(-18.6, -18.5, { y: 7.2 });
  K.go(-16.8, -16.6, { y: 7.2, interact: true, r: 0.45 });
  K.go(-16.6, -17.4, { y: 7.2, r: 0.3, waitMover: { i: 0, axis: 0, at: 6.6, tol: 0.05 } });
  K.go(-16.6, -17.4, { y: 7.2, r: 0.3, waitMover: { i: 0, axis: 0, at: 0, tol: 0.03 } });
  K.go(0, 0, { board: 0, jump: true, jd: 2.0 });
  K.go(-14.8, -18.5, { y: 8.2, r: 9, waitMover: { i: 0, axis: 0, at: 6.6, tol: 0.05 } });
  K.go(-7.4, -18.5, { y: 7.2, r: 0.3 });
  K.go(-6.0, -18.5, { jump: true, jd: 1.2, y: 7.5, r: 0.3 });
  K.go(-1.7, -18.5, { y: 7.5, slow: 0.6, r: 0.3 });
  K.go(0.6, -18.5, { y: 7.2 });
  K.go(4, -16.4, { y: 7.2 });
  K.go(15.6, -16.4, { y: 7.2 });
  K.go(17.5, -18.6, { jump: true, jd: 1.4, y: 8.2, r: 0.3 });
  K.go(17.5, -18.6, { jump: true, jd: 3, hold: true, fromY: 8.2, r: 0.7 });
  K.go(19.4, -20.8, { hold: true, y: 11.0 });
  return K.done();
}

/* ====================================================================== 6 */
export function level06() {
  const K = createKit({ id: 6, name: "Toy Train Junction", world: 1, maxFall: 4.0 });
  bedroomShell(K, { art1: "boat", clockC: 12 });
  // two low play tables with a toy railway looping over both
  K.desk(-26, -8, -12, 4, 4.6, { color: "#7fb5c9" });
  K.desk(0, 18, -12, 4, 4.6, { color: "#f2c14e" });
  K.box([-8, 4.4, -8.45], [0, 4.6, -7.55], { mat: "wood" });
  K.box([-8, 4.4, -0.45], [0, 4.6, 0.45], { mat: "wood" });
  K.prop({ type: "plank", x0: -8, x1: 0, z: -8, y: 4.6, w: 0.9 });
  K.prop({ type: "plank", x0: -8, x1: 0, z: 0, y: 4.6, w: 0.9 });
  K.trackLoop([[-22, -8], [14, -8], [14, 0], [-22, 0]], 4.6);
  K.mover("train", { min: [-22.9, 4.6, -8.9], max: [-21.1, 5.5, -7.1] }, { type: "loop", pts: [[0, 0, 0], [36, 0, 0], [36, 0, 8], [0, 0, 8]], speed: 2.4 }, { color: "#d9473b", color2: "#f2c14e" });
  K.spawn(-24, 4.6, 2.4, Math.PI / 2);
  K.hint("ride", -12, -12, -8, 4, 4.6, 2);
  // T1: a little cardboard toy house with a button inside
  K.cardboard(-17, 4.6, -4, 4, 2.4, 4, { open: "+x", label: "TOY HOUSE" });
  K.button(-17.4, 5.1, -4, "inside the toy house");
  K.block(-12.6, 4.6, 1.4, 1.2, { color: "#6a8f3f", letter: "R" });
  K.checkpoint(-11.5, 4.6, -4, Math.PI / 2);
  K.button(-4, 5.3, 0, "out on the second bridge");
  // T2: marbles rolling across, then a block staircase to the flag
  K.checkpoint(3.2, 4.6, -4, Math.PI / 2);
  K.hazard({ type: "roller", look: "ball", color: "#4fb3a8", r: 0.45, pos: [7, 4.6, -10.5], path: { type: "line", d: [0, 0, 12], period: 4.4, hold: 0.05 } });
  K.hazard({ type: "roller", look: "ball", color: "#e94f4f", r: 0.45, pos: [10, 4.6, 1.5], path: { type: "line", d: [0, 0, -12], period: 3.6, hold: 0.05, phase: 0.4 } });
  K.block(12.6, 4.6, -4, 1.2, { color: "#e85d4a", letter: "J" });
  K.blocks(14.4, 4.6, -4, [{ s: 1.2, color: "#f2c14e", letter: "U" }, { s: 1.2, color: "#4fb3a8", letter: "M" }]);
  K.blocks(16.2, 4.6, -4, [{ s: 1.2, color: "#6f9bd1", letter: "P" }, { s: 1.2, color: "#e85d4a", letter: "!" }, { s: 1.2, color: "#f2c14e", letter: "*" }]);
  K.finish(16.2, 8.2, -4, { r: 0.7 });
  K.button(-17, 7.5, -4, "on the toy house roof");
  K.block(-14.4, 4.6, -1.4, 1.2, { color: "#f28da0", letter: "H" });
  // room
  K.rug(-4, 14, 22, 12, {});
  K.bed(-32, -20, -21.4, -14, { top: 5, headboard: "-z", hang: "none", color: "#e7cfa8", blanket: "#e98a52" });
  K.wardrobe(25, 32, 6, 20, 21, { front: "-x" });
  K.teddy(-22, 18, { s: 1.0, rot: 2.4 });
  K.laundry(22, -16, 6, 2.4, 5, {});

  K.go(-20.5, 2.4);
  K.go(-13.6, -1.0);
  K.go(-14, -4, { only: "buttons", y: 4.6 });
  K.go(-17.4, -4, { only: "buttons", y: 4.6 });
  K.go(-14, -4, { only: "buttons", y: 4.6 });
  K.go(-13.0, -1.4, { only: "buttons", y: 4.6 });
  K.go(-14.4, -1.4, { only: "buttons", jump: true, jd: 1.4, y: 5.8, r: 0.3 });
  K.go(-16.2, -3.0, { only: "buttons", jump: true, jd: 2.4, y: 7.0 });
  K.go(-17, -4, { only: "buttons", y: 7.0 });
  K.go(-13.2, -4, { only: "buttons", y: 4.6 });
  K.go(-11.5, -4, { y: 4.6 });
  K.go(-10.2, -6.3, { y: 4.6, r: 0.3, waitMover: { i: 0, axis: 0, at: 10.4, tol: 0.4 } });
  K.go(0, 0, { board: 0, jump: true, jd: 2.0 });
  K.go(0, 0, { y: 5.5, r: 99, waitMover: { i: 0, axis: 0, at: 26.4, tol: 0.4 } });
  K.go(3.6, -7.0, { y: 4.6 });
  K.go(3.2, -4, { y: 4.6 });
  K.go(3.2, -0.2, { only: "buttons", y: 4.6 });
  K.go(-4, 0, { only: "buttons", y: 4.6, slow: 0.6, r: 0.4 });
  K.go(2.4, 0, { only: "buttons", y: 4.6, slow: 0.6 });
  K.go(5.5, -4, { y: 4.6, r: 0.3 });
  K.go(8.5, -4, { y: 4.6, waitHazard: 0 });
  K.go(11.4, -4, { y: 4.6 });
  K.go(12.6, -4, { jump: true, jd: 1.4, y: 5.8 });
  K.go(14.4, -4, { jump: true, jd: 1.4, y: 7.0 });
  K.go(16.2, -4, { jump: true, jd: 1.4, y: 8.2, r: 0.5 });
  return K.done();
}

/* ====================================================================== 7 */
export function level07() {
  const K = createKit({ id: 7, name: "The Blanket Fort", world: 1 });
  bedroomShell(K, { art1: "stars", clockC: -10 });
  K.spawn(-22, 0, 8, Math.PI * 0.75);
  // two chairs back to back with a blanket roof between them
  K.chair(-10, -6, { facing: "+x", color: "#c8956a" });
  K.chair(6, -6, { facing: "-x", color: "#c8956a" });
  const top = 9.55;
  K.box([-12.3, 9.4, -8.6], [8.3, top, -3.4], { mat: "fabric", bounce: 6, noLedge: true });
  K.box([-12.3, 0.9, -8.75], [8.3, top, -8.6], { mat: "fabric", climb: true, noLedge: true });
  K.box([-12.3, 0.9, -3.4], [-3, top, -3.25], { mat: "fabric", climb: true, noLedge: true });
  K.box([0, 0.9, -3.4], [8.3, top, -3.25], { mat: "fabric", climb: true, noLedge: true });
  K.box([-3, 3.6, -3.4], [0, top, -3.25], { mat: "fabric", noLedge: true, noCamera: true });
  K.prop({ type: "fort", x0: -12.3, x1: 8.3, z0: -8.75, z1: -3.25, y: top, door: [-3, 0], color: "#e98a52", color2: "#f6d69a" });
  K.hint("climb", -12, -3.2, 8, 1, 0, 3);
  // inside the fort: cushions, a torch, picture books
  K.pillow(-6.4, 0, -6, 3, 1.1, 3.6, { color: "#f6d69a", bounce: 9 });
  K.nightLight(-1.5, 0, -7.6, { color: "#ffe2a0", intensity: 4, distance: 12 });
  K.books(2, 0, -6.4, [{ w: 2.4, h: 0.5, d: 3, color: "#8a5aa8", spine: 0 }, { w: 2.2, h: 0.5, d: 2.8, color: "#2f6f8f", spine: 1 }]);
  K.button(2, 1.5, -6.4, "on the picture books in the fort");
  K.button(-10, 5.2, -6, "on a chair seat inside the fort");
  K.checkpoint(-1.5, 0, -1.4, Math.PI);
  K.button(-2, 10.8, -6, "bouncing high on the roof");
  K.checkpoint(-2, top, -6, Math.PI / 2);
  // off the roof onto the desk
  K.desk(11, 27, -10, -2, 7.2, { drawers: "right", color: "#d2a679" });
  K.lamp(24.5, 7.2, -8, { color: "#f2c14e", dir: -1.6, h: 7, reach: 2 });
  K.books(23, 7.2, -8.4, [{ w: 2.6, h: 0.45, d: 3.2, color: "#c0504d", spine: 0 }]);
  K.finish(20.5, 7.2, -6, { r: 1.0 });
  // room
  K.rug(-2, 6, 26, 10, {});
  K.bed(-32, -20, -21.4, -12, { top: 5, headboard: "-z", hang: "none", blanket: "#6f9bd1" });
  K.laundry(-24, 16, 6, 2.6, 5, { seed: 2 });
  K.teddy(20, 18, { s: 1.0, rot: 3.6 });
  K.wardrobe(25, 32, 8, 22, 21, { front: "-x" });

  K.go(-6, 1);
  K.go(-1.5, -1.4);
  K.go(-1.5, -5.6, { only: "buttons" });
  K.go(0.2, -6.4, { only: "buttons" });
  K.go(2, -6.4, { jump: true, jd: 1.4, y: 1.0, only: "buttons" });
  K.go(-4, -6, { only: "buttons", y: 0 });
  K.go(-6.4, -6, { jump: true, jd: 1.5, hold: true, fromY: 1.1, r: 1.0, only: "buttons" });
  K.go(-7.3, -6, { hold: true, y: 4.5, r: 0.8, only: "buttons" });
  K.go(-10, -6, { y: 4.5, r: 0.5, only: "buttons" });
  K.go(-5.6, -6, { only: "buttons", y: 0, r: 1.2 });
  K.go(-1.5, -5, { only: "buttons" });
  K.go(-1.5, -1.4);
  K.go(-6, -1.6);
  K.go(-6, -4.5, { jump: true, jd: 2.2, y: top });
  K.go(-2, -6, { y: top });
  K.go(-2, -6, { only: "buttons", jump: true, jd: 3, hold: true, fromY: top, r: 0.8 });
  K.go(-2, -6, { only: "buttons", y: top, r: 1.2 });
  K.go(7.8, -6, { y: top });
  K.go(13.5, -6, { jump: true, jd: 3, y: 7.2 });
  K.go(20.5, -6, { y: 7.2 });
  return K.done();
}

/* ====================================================================== 8 */
export function level08() {
  const K = createKit({ id: 8, name: "Windowsill Walk", world: 1 });
  bedroomShell(K, { window: { wall: "back", c: 0, y: 6.0, w: 38, h: 14, sill: 1.6 }, curtains: false, clockWall: "right", clockC: 4 });
  K.spawn(-27, 0, -2, Math.PI);
  // up to the sill: block → chest → plush bounce → nightstand → sill
  K.block(-24.4, 0, -12.6, 1.4, { color: "#f2c14e", letter: "W" });
  K.chest(-28, -23.6, -19.5, -14, 2.8, { color: "#6f9bd1", trim: "#fff1cf", front: "+z" });
  K.plush(-24.6, 2.8, -18.6, { kind: "bunny", color: "#f4e3e8", s: 0.55, bounce: 9.5 });
  K.nightstand(-21.6, -20.2, { w: 3.6, d: 3.6, h: 5.0, front: "+z" });
  K.checkpoint(-21.6, 5.0, -20.4, Math.PI / 2);
  // the long sill (y 6, 1.6 deep, z -22..-20.4)
  K.curtains("back", 0, 6.0, 38, 15, { color: "#f2b8a0" });
  K.plant(-14, 6.0, -21.2, { r: 0.5, h: 1.3, leaf: "#5f9b52", size: 0.6 });
  K.button(-8, 6.6, -21.2, "along the sill");
  K.checkpoint(-6, 6.0, -21.2, Math.PI / 2);
  // a desk fan blowing across the sill, on and off
  K.box([-0.6, 6.0, -22], [0.6, 7.4, -21.45], { mat: "plastic", noLedge: true });
  K.hazard({ type: "wind", look: "fan", pos: [0, 6.0, -20.9], size: [2.8, 3, 1.1], dir: [0, 0, 1], force: 9, period: 4.2, onFrac: 0.45, warnFrac: 0.18, fanY: 0.75, fanAt: [0, 6.0, -21.72], fanScale: 0.38 });
  K.hint("wind", -4, -22, 4, -20.4, 6.0, 2);
  K.bookRow(5, 7.6, 6.0, -21.4, 1.0, 1.3, { seed: 4 });
  K.button(6.3, 7.8, -21.4, "on top of the little books");
  K.checkpoint(11, 6.0, -21.2, Math.PI / 2);
  K.plant(14, 6.0, -21.2, { r: 0.5, h: 1.3, leaf: "#4f8a4a", size: 0.6 });
  K.finish(17.4, 6.0, -21.2, { r: 0.7 });
  // the curtain drawn at the west end of the sill: climb it to the pelmet for a button
  K.box([-19.35, 7.6, -22], [-19.2, 19.6, -20.4], { mat: "fabric", climb: true, noLedge: true, noCamera: true });
  K.prop({ type: "drape", x: -19.27, z0: -22, z1: -20.4, y0: 7.6, y1: 19.0, color: "#f2b8a0" });
  K.box([-21.6, 19.0, -22], [-19.35, 19.6, -20.6], { mat: "wood" });
  K.prop({ type: "pelmet", x0: -21.6, x1: -19.35, y: 19.6, z0: -22, z1: -20.6, color: "#e9d8bd" });
  K.button(-20.5, 20.1, -21.3, "on the curtain pelmet");
  K.checkpoint(-18.2, 6.0, -21.0, Math.PI / 2);
  // room
  K.desk(-6, 12, 10, 16.5, 7.2, { color: "#d2a679" });
  K.rug(0, 0, 20, 12, {});
  K.bed(-32, -20, 6, 24, { top: 5, headboard: "+z", hang: "none", blanket: "#4fb3a8" });
  K.teddy(22, 16, { s: 1.0, rot: 3.6 });

  K.go(-24.4, -11);
  K.go(-24.4, -12.6, { jump: true, jd: 1.5, y: 1.4 });
  K.go(-24.6, -14.8, { jump: true, jd: 2.2, y: 2.8, r: 0.3 });
  K.go(-24.6, -18.6, { jump: true, jd: 1.4, y: 3.79, r: 0.5 });
  K.go(-24.6, -18.6, { jump: true, jd: 3, hold: true, fromY: 3.79, r: 0.8 });
  K.go(-21.6, -20.2, { hold: true, y: 5.0 });
  K.go(-18.4, -21.2, { jump: true, jd: 3.2, y: 6.0 });
  K.go(-17.6, -21.2, { y: 6.0, only: "buttons" });
  K.go(-20.5, -21.2, { only: "buttons", jump: true, jd: 2.0, y: 19.6 });
  K.go(-20.5, -21.3, { only: "buttons", y: 19.6, r: 0.3 });
  K.go(-18.0, -21.1, { only: "buttons", y: 6.0, r: 0.6 });
  K.go(-15.3, -21.2, { y: 6.0, r: 0.3 });
  K.go(-12.7, -21.2, { jump: true, jd: 2.6, y: 6.0 });
  K.go(-6, -21.2, { y: 6.0 });
  K.go(-2.6, -20.9, { y: 6.0, waitHazard: 0, cross: 1.1, r: 0.3 });
  K.go(3.4, -20.9, { y: 6.0 });
  K.go(6.3, -21.4, { jump: true, jd: 1.5, y: 7.3, only: "buttons" });
  K.go(8.6, -21.2, { y: 6.0, only: "buttons" });
  K.go(4.2, -20.7, { y: 6.0, r: 0.3 });
  K.go(8.6, -20.7, { y: 6.0, r: 0.3 });
  K.go(12.7, -21.2, { y: 6.0, r: 0.3 });
  K.go(15.3, -21.2, { jump: true, jd: 2.6, y: 6.0 });
  K.go(17.4, -21.2, { y: 6.0 });
  return K.done();
}

/* ====================================================================== 9 */
export function level09() {
  const K = createKit({ id: 9, name: "Wardrobe Heights", world: 1 });
  bedroomShell(K, { clockWall: "left", clockC: 10 });
  K.spawn(-6, 0, -4, Math.PI * 0.85);
  // a chest of small drawers, pulled out further at the bottom: a staircase
  K.dresser(0, 10, -20, -14, 7.0, { rows: 5, front: "+z", color: "#e9d8bd" });
  const drawers = [
    [0.05, 1.4, 3.2],
    [1.4, 2.75, 2.4],
    [2.75, 4.1, 1.6],
    [4.1, 5.45, 0.8],
  ];
  for (const [y0, y1, out] of drawers) {
    K.box([0.6, y0, -14], [9.4, y1, -14 + out], { mat: "wood" });
    K.prop({ type: "drawerOut", x0: 0.6, x1: 9.4, y0, y1, z0: -14, z1: -14 + out, color: "#fff8ee", knob: "#e0b04a" });
  }
  K.hint("ledge", 0, -14, 10, -10, 0, 3);
  K.checkpoint(4, 7.0, -17, Math.PI / 2);
  K.alarmClock(1.5, 7.0, -18.8, { color: "#e98a52", rot: 0 });
  K.hatbox(2.4, 7.0, -15.6, 0.7, 0.9, { color: "#9fd0ff" });
  K.button(2.4, 8.4, -15.6, "on the little hatbox");
  // the wardrobe: a coat on a peg board up its side, then hatboxes to the top
  K.wardrobe(10.5, 22, -20, -10, 21, { color: "#ead9bf", front: "+z" });
  K.box([9.0, 15.4, -19], [10.5, 15.8, -13], { mat: "wood" });
  K.prop({ type: "wallBoardX", x0: 9.0, x1: 10.5, y: 15.8, z0: -19, z1: -13, color: "#c8956a" });
  K.clothes(8.86, 9.0, -14.4, -13.2, 7.6, 15.8, { color: "#d9473b" });
  K.hint("climb", 7, -15, 10.5, -12, 7.0, 2);
  // a little staircase of boxes along the peg board
  K.shoebox(9.75, 15.8, -15.0, 1.4, 1.35, 1.2, { color: "#f28da0", lid: "#d9473b" });
  K.shoebox(9.75, 15.8, -16.2, 1.4, 1.35, 1.2, { color: "#f2c14e", lid: "#e0a33a" });
  K.shoebox(9.75, 17.15, -16.2, 1.4, 1.35, 1.2, { color: "#9fd0ff", lid: "#6f9bd1" });
  K.shoebox(9.75, 15.8, -17.4, 1.4, 1.35, 1.2, { color: "#b7d98a", lid: "#6a8f3f" });
  K.shoebox(9.75, 17.15, -17.4, 1.4, 1.35, 1.2, { color: "#f4e3e8", lid: "#f28da0" });
  K.shoebox(9.75, 18.5, -17.4, 1.4, 1.35, 1.2, { color: "#e9e2d6", lid: "#c0504d" });
  K.checkpoint(12.2, 21, -16, Math.PI / 2);
  // the cat who sleeps on top of the wardrobe
  K.pet({
    type: "cat",
    period: 16,
    color: "#e3a565",
    keys: [
      { t: 0, at: [17.5, -15], state: "sleep", block: true, y: 21, face: -1.6 },
      { t: 5, at: [17.5, -15], state: "look", block: true, y: 21, warn: true, face: -1.6 },
      { t: 6.5, at: [17.5, -15], state: "walk", y: 21 },
      { t: 8.5, at: [17.5, -11.6], state: "sit", block: true, y: 21, face: 3.1 },
      { t: 12, at: [17.5, -11.6], state: "walk", y: 21, warn: true },
      { t: 14, at: [17.5, -15], state: "sleep", block: true, y: 21, face: -1.6 },
    ],
  });
  K.hint("pet", 10.5, -20, 22, -10, 21, 2);
  K.button(21.2, 21.6, -19.2, "behind the sleeping cat");
  K.button(4, 1.9, -11.2, "on the bottom drawer");
  K.finish(20.6, 21, -11.6, { r: 0.8 });
  // room
  K.rug(-8, 4, 18, 12, {});
  K.bed(-32, -20, -21.4, -4, { top: 5, headboard: "-z", hang: "none", blanket: "#8a5aa8" });
  K.teddy(-22, 16, { s: 1.0, rot: 2.4 });
  K.ball(12, 0, 10, 2.4, { color: "#e94f4f", color2: "#f6d04d" });

  K.go(4, -9.5);
  K.go(4, -11.2, { jump: true, jd: 1.6, y: 1.4, atLeast: true, r: 0.4 });
  K.go(4, -12.0, { jump: true, jd: 1.2, y: 2.75, atLeast: true, r: 0.4 });
  K.go(4, -12.8, { jump: true, jd: 1.2, y: 4.1, atLeast: true, r: 0.4 });
  K.go(4, -13.6, { jump: true, jd: 1.2, y: 5.45, atLeast: true, r: 0.4 });
  K.go(4, -15, { jump: true, jd: 2, y: 7.0 });
  K.go(2.4, -15.6, { only: "buttons", jump: true, jd: 1.2, y: 7.9 });
  K.go(7.6, -16, { y: 7.0 });
  K.go(7.9, -13.8, { y: 7.0, r: 0.3 });
  K.go(9.6, -13.8, { jump: true, jd: 1.6, y: 15.8 });
  K.go(9.75, -15.0, { jump: true, jd: 1.3, y: 17.15, r: 0.35 });
  K.go(9.75, -16.2, { jump: true, jd: 1.3, y: 18.5, r: 0.35 });
  K.go(9.75, -17.4, { jump: true, jd: 1.3, y: 19.85, r: 0.35 });
  K.go(12.2, -17.4, { jump: true, jd: 2.6, y: 21 });
  K.go(21.1, -19.2, { y: 21, only: "buttons", r: 0.25 });
  K.go(14.5, -13, { y: 21, waitPet: { i: 0, state: "sleep", minLeft: 3 } });
  K.go(20.6, -11.6, { y: 21 });
  return K.done();
}

/* ====================================================================== 10 */
export function level10() {
  const K = createKit({ id: 10, name: "The Open Door", world: 1, maxFall: 7.5 });
  bedroomShell(K, { doors: [{ wall: "front", c: 14, w: 9, h: 21, open: true }], clockC: -12 });
  K.spawn(-22, 0, -12, Math.PI * 0.2);
  K.bed(-32, -20, -21.4, -4, { top: 5, headboard: "-z", hang: "none", blanket: "#e98a52" });
  // a robot vacuum on its rounds (ride it for a button)
  K.mover("vacuum", { min: [-9.1, 0, -4.1], max: [-6.9, 0.9, -1.9] }, { type: "loop", pts: [[0, 0, 0], [16, 0, 0], [16, 0, 12], [0, 0, 12]], speed: 1.8 }, { color: "#f4f4f4", color2: "#3a3d44" });
  K.button(0, 1.5, 9, "riding the robot vacuum");
  K.button(-28, 0.5, -10, "under the bed by the wall");
  K.hint("ride", -12, -6, 12, 14, 0, 2);
  // the cat on patrol across the middle of the room
  K.pet({
    type: "cat",
    period: 18,
    color: "#7a7a80",
    color2: "#e9e9ec",
    stripe: "#5a5a60",
    keys: [
      { t: 0, at: [-14, 16], state: "sit", block: true, face: 1.6 },
      { t: 3, at: [-14, 16], state: "walk", warn: true },
      { t: 8, at: [4, 16], state: "sit", block: true, face: 0 },
      { t: 11, at: [4, 16], state: "walk", warn: true },
      { t: 16, at: [-14, 16], state: "sit", block: true, face: 1.6 },
    ],
  });
  K.hint("pet", -16, 12, 6, 20, 0, 3);
  K.checkpoint(-4, 0, 6, 0);
  // up and over the baby gate in front of the door
  K.block(1.6, 0, 19.6, 1.2, { color: "#e85d4a", letter: "G" });
  K.chest(3, 8, 17.5, 21.6, 2.6, { color: "#4fb3a8", trim: "#fff1cf", front: "-z" });
  K.plush(6.6, 2.6, 19.6, { kind: "bear", color: "#c98d5a", s: 0.55, bounce: 9.6 });
  K.dresser(7.6, 9.5, 17, 23, 6.4, { rows: 3, front: "-x", color: "#f0e2c8" });
  K.gate(9.5, 18.5, 23.4, 7.0, {});
  K.hint("balance", 9.5, 22.6, 18.5, 24.2, 7.0, 2);
  K.button(14, 7.6, 23.4, "on the middle of the gate");
  K.cushion(14, 0, 24.9, 3.4, 1.0, 1.8, { color: "#e98a52", bounce: 6.5 });
  K.finish(17, 0, 25.0, { r: 0.9 });
  // room
  K.rug(-2, 4, 20, 14, {});
  K.wardrobe(25, 32, -14, 0, 21, { front: "-x" });
  K.desk(-6, 12, -22, -15.5, 7.2, { drawers: "left" });
  K.chair(4.6, -12.6, { facing: "-z", color: "#c8956a" });
  K.laundry(-26, 18, 6, 2.6, 5, { seed: 9 });

  K.go(-24, -2, { only: "buttons" });
  K.go(-28, -10, { only: "buttons" });
  K.go(-24, -2, { only: "buttons" });
  K.go(-14, -6);
  K.go(-4, 6);
  K.go(4, 6.4, { only: "buttons", r: 0.4, waitMover: { i: 0, axis: 0, at: 13.5, tol: 0.5 } });
  K.go(0, 0, { only: "buttons", board: 0, jump: true, jd: 2.0 });
  K.go(0, 0, { only: "buttons", y: 0.9, r: 99, waitMover: { i: 0, axis: 0, at: 5, tol: 0.6 } });
  K.go(-4, 6.8, { only: "buttons" });
  K.go(-4, 12, { waitPet: { i: 0, state: "sit", minLeft: 2 } });
  K.go(-1.4, 19.6);
  K.go(1.6, 19.6, { jump: true, jd: 1.4, y: 1.2 });
  K.go(4, 19.6, { jump: true, jd: 2.0, y: 2.6 });
  K.go(6.6, 19.6, { jump: true, jd: 1.4, y: 3.59, r: 0.5 });
  K.go(6.6, 19.6, { jump: true, jd: 3, hold: true, fromY: 3.59, r: 0.8 });
  K.go(8.8, 20, { hold: true, y: 6.4 });
  K.go(10.2, 23.4, { jump: true, jd: 2.5, y: 7.0 });
  K.go(14, 23.4, { y: 7.0, slow: 0.6 });
  K.go(14, 24.9, { air: true, r: 0.6 });
  K.go(17, 25.0, { y: 0 });
  return K.done();
}
