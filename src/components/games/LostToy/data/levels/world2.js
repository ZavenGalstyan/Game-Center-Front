/**
 * Lost Toy — World 2, Giant Kitchen, levels 11–20.
 * Bright tiles and stone worktops; new ideas: slippery wet surfaces, rolling
 * fruit, the vacuum cleaner, hot stove rings, spoon bridges, sliding drawers,
 * deep sink water with a floating sponge, the moving trolley, fridge magnets.
 * Worktops are 9.0 high (90 cm), the table 7.5, the fridge 18.
 */
import { createKit } from "../kit.js";
import { kitchenShell } from "./shells.js";

/** the long worktop along the back wall with the sink, used by several levels */
function backCounter(K, o = {}) {
  K.counter(-32, 10, -24, -18, 9, { front: "+z", color: o.color || "#4fb3a8", sink: o.sink === false ? null : { x0: -14, x1: -4, z0: -23, z1: -19.4, depth: 2.4, water: 1.6 } });
  K.upperCabinet("back", -20, 15, 18, 7, { color: o.color || "#4fb3a8" });
  if (o.upper2 !== false) K.upperCabinet("back", 2, 15, 14, 7, { color: o.color || "#4fb3a8" });
}

/* ====================================================================== 11 */
export function level11() {
  const K = createKit({ id: 11, name: "Tile Plains", world: 2 });
  kitchenShell(K, {});
  backCounter(K);
  K.fridge(14, 22, -24, -17, 18, { front: "+z" });
  K.spawn(-18, 0, 22, Math.PI);
  // freshly mopped tiles: wet = slippery
  K.wetMat(-14, 12, 10, 6, {});
  K.hint("explore", -24, 18, -10, 25, 0, 3);
  // a fruit bowl tipped over: oranges rolling across the floor
  K.bowl(6, 0, 10, 1.6, 1.0, { color: "#e85d4a" });
  K.hazard({ type: "roller", look: "orange", r: 0.7, pos: [-6, 0, 2], path: { type: "line", d: [16, 0, 0], period: 6.4, hold: 0.06 } });
  K.hazard({ type: "roller", look: "orange", r: 0.6, pos: [10, 0, 6], path: { type: "line", d: [-16, 0, 0], period: 5.2, hold: 0.06, phase: 0.5 } });
  K.button(-2, 0.6, 9, "between the wet tiles and the oranges");
  // a puddle by the sink: shallow water slows you down
  K.hazard({ type: "water", deep: false, pos: [-8, -0.02, -12], size: [7, 0.06, 4] });
  // up to the table: step stool → cookbook → chair → tablecloth climb
  K.table(-28, -12, -8, 6, 7.5, { color: "#d2a679", cloth: "#f2b8a0" });
  K.stepStool(-9.8, 2.2, { rot: 0, color: "#f2c14e" });
  K.book(-9.8, 2.8, 0.7, 2.6, 0.6, 1.0, { color: "#c0504d", spine: 3 });
  K.chair(-9.8, -3, { facing: "+z", seatH: 4.5, color: "#c8956a" });
  K.towel(-12.1, -11.98, -5.2, -0.8, 4.0, 7.5, { color: "#e85d4a", color2: "#f6d6cb" });
  K.hint("climb", -12, -5, -7.4, -1, 4.5, 3);
  K.checkpoint(-9.8, 1.4, 3.6, Math.PI);
  K.button(-20, 0.6, -1, "under the table");
  // on the table
  K.plates(-20, 7.5, -4, 1.4, 3, {});
  K.cup(-16, 7.5, 2, { color: "#fbfbf7", accent: "#4fb3a8" });
  K.cereal(-24, 7.5, 3, 2.4, 2.4, 1.0, { color: "#e98a52", label: "SUNNY FLAKES" });
  K.cup(-24, 7.5, 1.4, { accent: "#4fb3a8" });
  K.button(-24, 10.4, 3, "on the cereal box");
  K.board(-22, 7.5, 0.6, 2.4, 2.4, { color: "#d9a873" });
  K.finish(-25.5, 7.5, -6, { r: 1.0 });
  // more kitchen
  K.kettle(4, 9, -21, { color: "#4fb3a8" });
  K.jar(-26, 9, -21.5, 0.9, 2.2, { lid: "#f2c14e", fill: "#e9c9a0" });
  K.cereal(-29, 9, -21.6, 2.4, 3.6, 1.1, { color: "#4fb3a8", label: "CRUNCH O's" });

  K.go(-18, 18);
  K.go(-14, 13);
  K.go(-5, 10.6, { waitHazard: 1 });
  K.go(-2, 9.2, { only: "buttons" });
  K.go(-6, 6.2, { waitHazard: 0 });
  K.go(-14, 1.0, { only: "buttons" });
  K.go(-20, -1, { only: "buttons" });
  K.go(-14, 1.0, { only: "buttons" });
  K.go(-9.8, 6.2, { r: 0.3 });
  K.go(-9.8, 3.6, { jump: true, jd: 1.6, y: 1.4, r: 0.35 });
  K.go(-9.8, 1.6, { jump: true, jd: 1.4, y: 2.8, r: 0.35 });
  K.go(-9.8, 0.7, { jump: true, jd: 1.0, y: 3.4, r: 0.4 });
  K.go(-9.8, -2.6, { jump: true, jd: 2.6, y: 4.5 });
  K.go(-11.5, -3, { y: 4.5, r: 0.3 });
  K.go(-13, -3, { jump: true, jd: 2, y: 7.5 });
  K.go(-16.5, -2, { y: 7.5, only: "buttons" });
  K.go(-22, 0.6, { jump: true, jd: 1.3, y: 7.8, only: "buttons" });
  K.go(-24, 1.4, { jump: true, jd: 1.6, y: 8.5, only: "buttons" });
  K.go(-24, 3, { jump: true, jd: 1.6, y: 9.9, only: "buttons" });
  K.go(-21, 0, { y: 7.8, only: "buttons", r: 0.6 });
  K.go(-25.5, -6, { y: 7.5 });
  return K.done();
}

/* ====================================================================== 12 */
export function level12() {
  const K = createKit({ id: 12, name: "Under the Table", world: 2 });
  kitchenShell(K, {});
  backCounter(K);
  K.spawn(-20, 0, -4, Math.PI / 2);
  // a long table with chairs all round: a forest of legs
  K.table(-14, 14, -8, 8, 7.5, { color: "#c8956a" });
  for (const x of [-9, 0, 9]) {
    K.chair(x, -11.2, { facing: "+z", color: "#d2a679" });
    K.chair(x, 11.2, { facing: "-z", color: "#d2a679" });
  }
  // the vacuum cleaner sweeps the lane down the middle under the table
  K.hazard({ type: "vacuum", pos: [-16, 0, 0.5], r: 1.3, h: 1.4, suction: 5.5, pull: 2.4, color: "#d9473b", path: { type: "line", d: [32, 0, 0], period: 16, hold: 0.12 } });
  K.hint("explore", -22, -6, -15, 6, 0, 3);
  // shelters: lean behind them while it passes (they block the suction)
  K.shoebox(-6, 0, -2.2, 3, 2.2, 1.4, { color: "#9fc4d8", lid: "#6f9bd1" });
  K.shoebox(3, 0, -2.2, 3, 2.2, 1.4, { color: "#f2d16b", lid: "#e0a33a" });
  K.cardboard(11, 0, -3.4, 3.4, 2.6, 3.4, { open: "+x", label: "CANS" });
  K.button(-6, 0.6, -4.2, "behind the first shelter");
  K.checkpoint(-1.5, 0, -4.2, Math.PI / 2);
  // a dropped napkin pile and a fallen spoon
  K.laundry(7, -5.2, 3, 1.2, 2, { bounce: 7, seed: 11 });
  K.spoon(-1.5, 0, 4.8, 3.6, { axis: "x" });
  K.button(-11, 0.6, 5.2, "past the vacuum's lane");
  // out from under the table, up a chair and its hanging napkin to the top
  K.checkpoint(16.5, 0, -2, Math.PI / 2);
  K.cushion(17.3, 0, -9, 2, 1.2, 2, { color: "#e07a5f", bounce: 8.6 });
  K.towel(14.0, 14.12, -7.4, -4.4, 1.5, 7.5, { color: "#6f9bd1", color2: "#f4f4f4" });
  K.hint("climb", 14, -8, 18, -4, 0, 3);
  K.bowl(6, 7.5, 0, 1.8, 1.0, { color: "#f2c14e", fill: "#e98a52" });
  K.cup(-4, 7.5, 2, { accent: "#e85d4a" });
  K.plates(-8, 7.5, -3, 1.4, 2, {});
  K.button(6, 9.0, 0, "in the fruit bowl");
  K.finish(-10.5, 7.5, 2, { r: 1.0 });
  K.fridge(14, 22, -24, -17, 18, {});

  K.go(-16.6, -4.2);
  K.go(-8.4, -4.2, { waitHazard: 0 });
  K.go(-6, -4.2, { only: "buttons" });
  K.go(-1.5, -4.2);
  K.go(-1.5, 4.2, { only: "buttons", waitHazard: 0 });
  K.go(-11, 5.2, { only: "buttons", slow: 0.9 });
  K.go(-1.5, -4.2, { only: "buttons", waitHazard: 0 });
  K.go(6.5, -4.2, { waitHazard: 0 });
  K.go(16.5, -2);
  K.go(15.2, -5.9);
  K.go(12.6, -5.9, { jump: true, jd: 2.7, y: 7.5 });
  K.go(6, 1.6, { y: 7.5, only: "buttons", r: 0.5 });
  K.go(6, 0, { jump: true, jd: 1.4, y: 8.5, only: "buttons", r: 0.5 });
  K.go(-10.5, 2, { y: 7.5 });
  return K.done();
}

/* ====================================================================== 13 */
export function level13() {
  const K = createKit({ id: 13, name: "Chair Tower", world: 2 });
  kitchenShell(K, { clockC: -10 });
  backCounter(K);
  K.fridge(14, 22, -24, -17, 18, {});
  K.spawn(-12, 0, 8, Math.PI);
  // the baby's high chair, tray toward the worktop
  K.highChair(-23, -13.2, { seatH: 7.6, flip: true, trayY: 1.0, color: "#f4efe6", tray: "#f2c14e" });
  K.stepStool(-27.0, -10.2, { rot: 0, color: "#6f9bd1" });
  // a bib hanging over the side of the seat: climb it
  K.towel(-24.92, -24.8, -14.6, -11.8, 3.6, 7.6, { color: "#f28da0", color2: "#fff0f3" });
  K.hint("climb", -29, -15, -24.8, -7, 0, 4);
  K.checkpoint(-27.0, 2.8, -11.2, Math.PI);
  K.button(-27, 3.3, -11.2, "on the step stool");
  K.button(-23, 9.4, -16.0, "on the high chair tray");
  // along the worktop to the finish
  K.checkpoint(-26, 9, -20.4, Math.PI / 2);
  K.jar(-20, 9, -21.6, 0.9, 2.4, { lid: "#e85d4a", fill: "#c98d5a" });
  K.jar(-17.8, 9, -21.6, 0.8, 1.9, { lid: "#4fb3a8", fill: "#f2d16b" });
  K.board(-17, 9, -19.4, 3.0, 2.0, {});
  K.cereal(-29.5, 9, -21.4, 2.2, 3.2, 1.0, { color: "#8a5aa8", label: "BERRY BITS" });
  K.jar(-27.4, 9, -21.4, 0.6, 1.9, { lid: "#8a5aa8", fill: "#e85d4a" });
  K.button(-29.5, 12.7, -21.4, "on the berry cereal");
  K.finish(-2, 9, -19.0, { r: 1.0 });
  K.spoon(-14.6, 9, -20.2, 3.0, { axis: "z" });
  // floor life
  K.table(-6, 10, 2, 14, 7.5, { color: "#d2a679" });
  K.wetMat(-14, 2, 6, 5, { sign: true });

  K.go(-18, 2);
  K.go(-27, -6.4);
  K.go(-27, -8.8, { jump: true, jd: 1.6, y: 1.4, r: 0.35 });
  K.go(-27, -11.0, { jump: true, jd: 1.6, y: 2.8, r: 0.35 });
  K.go(-25.6, -11.8, { y: 2.8, r: 0.3 });
  K.go(-23.6, -12.8, { jump: true, jd: 1.8, y: 7.6 });
  K.go(-23, -15.6, { jump: true, jd: 1.4, y: 8.9, r: 0.4 });
  K.go(-23, -18.8, { jump: true, jd: 2.4, y: 9.0 });
  K.go(-26, -20.4, { y: 9.0 });
  K.go(-27.4, -19.6, { y: 9.0, only: "buttons" });
  K.go(-27.4, -21.4, { jump: true, jd: 2.0, y: 10.9, only: "buttons", r: 0.4 });
  K.go(-29.3, -21.4, { jump: true, jd: 2.0, y: 12.2, only: "buttons" });
  K.go(-26, -19.6, { y: 9.0, only: "buttons" });
  K.go(-19, -19.4, { y: 9.0 });
  K.go(-14.6, -19.4, { jump: true, jd: 1.0, y: 9.12, slow: 0.6 });
  K.go(-2, -19.0, { y: 9.0 });
  return K.done();
}

/* ====================================================================== 14 */
export function level14() {
  const K = createKit({ id: 14, name: "Countertop Cliffs", world: 2, maxFall: 5.5 });
  kitchenShell(K, { window: { wall: "back", c: 14, y: 12.5, w: 12, h: 9, sill: 0.6 } });
  // two worktop runs with a gap at the corner, the stove between
  K.counter(-32, -8, -24, -18, 9, { front: "+z", color: "#e98a52" });
  K.counter(-4, 30, -24, -18, 9, { front: "+z", color: "#e98a52" });
  K.upperCabinet("back", -20, 15, 22, 7, { color: "#e98a52" });
  K.spawn(-29, 9, -21, Math.PI / 2);
  K.board(-25, 9, -21, 3.2, 2.4, {});
  K.jar(-21.5, 9, -22.4, 0.9, 2.2, { lid: "#4fb3a8" });
  K.cereal(-18.5, 9, -20.4, 1.0, 1.4, 3.2, { color: "#f2c14e", label: "OATY" });
  K.button(-18.5, 10.9, -20.4, "on the little cereal box");
  K.checkpoint(-12, 9, -21, Math.PI / 2);
  // spoon bridge over the gap (-8 … -4)
  K.spoon(-6, 9, -21, 5.2, { axis: "x" });
  K.hint("balance", -9, -22, -3, -20, 9, 2);
  // hot rings: wait for them to cool
  K.stove(4, 9, -21, 6, 5, { rings: [[-1.5, -1.2], [1.5, 1.2]], period: 6, onFrac: 0.35 });
  K.checkpoint(-1.4, 9, -21, Math.PI / 2);
  K.kettle(10, 9, -22.4, { color: "#e85d4a" });
  // the toaster: bounce up to the open cupboard
  K.toaster(16, 9, -19.4, { bounce: 14.6, color: "#6f9bd1" });
  K.hint("bounce", 13, -23, 19, -19, 9, 3);
  K.box([12, 15.6, -24], [24, 16.0, -20.6], { mat: "wood" });
  K.prop({ type: "wallBoard", x0: 12, x1: 24, y: 16.0, z0: -24, z1: -20.6, color: "#fff8ee" });
  K.jar(21, 16, -23, 0.7, 1.6, { lid: "#8a5aa8", fill: "#e85d4a" });
  K.button(16, 14.4, -19.4, "above the toaster");
  K.finish(19, 16, -22.2, { r: 0.8 });
  K.button(26, 9.6, -21, "at the far end of the worktop");
  K.table(-8, 10, 4, 16, 7.5, {});
  K.fridge(-34, -27, -2, 6, 18, { front: "+x" });

  K.go(-26.8, -21);
  K.go(-25, -21, { jump: true, jd: 1.2, y: 9.3 });
  K.go(-20.2, -19.6, { y: 9.0 });
  K.go(-18.5, -20.4, { jump: true, jd: 1.6, y: 10.4 });
  K.go(-12, -21, { y: 9.0 });
  K.go(-8.4, -21, { y: 9.0, r: 0.3 });
  K.go(-4.6, -21, { jump: true, jd: 1.2, y: 9.12, slow: 0.6 });
  K.go(-1.4, -21, { y: 9.0 });
  K.go(0.6, -21, { y: 9.0, waitHazard: 0, cross: 2.0 });
  K.go(7.6, -21, { y: 9.0 });
  K.go(13.8, -22.4, { y: 9.0, only: "buttons" });
  K.go(26, -22.4, { y: 9.0, only: "buttons" });
  K.go(26, -21, { y: 9.0, only: "buttons" });
  K.go(18.6, -22.4, { y: 9.0, only: "buttons" });
  K.go(13.8, -22.4, { y: 9.0, only: "buttons" });
  K.go(13.8, -21, { y: 9.0 });
  K.go(16, -19.4, { jump: true, jd: 1.4, y: 10.1, r: 0.4 });
  K.go(16, -19.4, { jump: true, jd: 3, hold: true, fromY: 10.1, r: 0.8 });
  K.go(18, -22.4, { hold: true, y: 16.0 });
  K.go(19, -22.2, { y: 16.0 });
  return K.done();
}

/* ====================================================================== 15 */
export function level15() {
  const K = createKit({ id: 15, name: "The Dish Rack", world: 2 });
  kitchenShell(K, { window: { wall: "back", c: 6, y: 13, w: 14, h: 8, sill: 1.4 } });
  // the sink fills the worktop right to its front lip: only a narrow rim to walk
  K.counter(-32, 24, -24, -18, 9, { front: "+z", color: "#6f9bd1", sink: { x0: -9, x1: 1, z0: -23, z1: -18.4, depth: 2.4, water: 1.6 } });
  K.spawn(-28, 9, -21, Math.PI / 2);
  // the dish rack: a button waits in a slot between the plates
  K.dishRack(-22, -12, -23.4, -19, 9, { plates: 4, plateH: 2.4 });
  K.button(-17, 9.8, -21.2, "in a slot between the plates");
  K.checkpoint(-11, 9, -18.6, Math.PI / 2);
  K.cup(-10.4, 9, -21.6, { r: 0.7, h: 1.1, accent: "#e85d4a" });
  // the tap drips onto the rim: wait for the drop
  K.hazard({ type: "drip", pos: [-4, 9, -18.2], r: 0.55, h: 4, period: 2.8, onFrac: 0.25, warnFrac: 0.3 });
  K.hint("balance", -9.2, -19.0, 1.2, -18, 9, 2);
  K.button(-1.5, 9.8, -18.2, "along the sink's rim");
  K.checkpoint(4, 9, -21, Math.PI / 2);
  // up a stack of bowls to the window sill
  K.bowl(8, 9, -21.8, 1.8, 1.0, { color: "#f2c14e" });
  K.bowl(8, 10.0, -21.8, 1.6, 1.0, { color: "#e98a52" });
  K.bowl(8, 11.0, -21.8, 1.4, 1.0, { color: "#4fb3a8" });
  K.finish(1.0, 13, -23.3, { r: 0.7 });
  K.plant(13.2, 13, -23.6, { r: 0.45, h: 1.2, size: 0.5 });
  K.button(12.0, 13.5, -23.3, "at the far end of the sill");
  K.upperCabinet("back", 24, 15, 12, 7, { color: "#6f9bd1" });
  K.table(-10, 6, 4, 16, 7.5, {});
  K.fridge(26, 33, -24, -17, 18, {});

  K.go(-24, -18.6, { y: 9.0 });
  K.go(-17, -18.6, { y: 9.0, only: "buttons" });
  K.go(-17, -21.2, { jump: true, jd: 1.4, y: 9.3, only: "buttons", r: 0.35 });
  K.go(-17, -18.6, { y: 9.0, only: "buttons" });
  K.go(-11, -18.6, { y: 9.0 });
  K.go(-9.4, -18.2, { y: 9.0, r: 0.3, waitHazard: 0, cross: 1.6 });
  K.go(1.4, -18.2, { y: 9.0, slow: 0.7, r: 0.3 });
  K.go(4, -21, { y: 9.0 });
  K.go(5.6, -21.4, { y: 9.0 });
  K.go(8, -21.8, { jump: true, jd: 1.8, y: 10.0, atLeast: true, r: 0.5 });
  K.go(8, -21.8, { jump: true, jd: 1.0, y: 11.0, atLeast: true, r: 0.5 });
  K.go(8, -21.8, { jump: true, jd: 1.0, y: 12.0, r: 0.5 });
  K.go(8, -23.3, { jump: true, jd: 2, y: 13.0 });
  K.go(12.0, -23.3, { y: 13.0, only: "buttons", r: 0.4 });
  K.go(1.0, -23.3, { y: 13.0 });
  return K.done();
}

/* ====================================================================== 16 */
export function level16() {
  const K = createKit({ id: 16, name: "Spoon Bridges", world: 2 });
  kitchenShell(K, {});
  backCounter(K, { sink: false });
  K.spawn(-28, 9, -21, Math.PI / 2);
  // an island in the middle: drawers slide out of the back counter as stepping stones
  K.counter(-12, 12, -6, 2, 9, { front: "-z", color: "#e9d8bd" });
  K.checkpoint(-20, 9, -20, Math.PI / 2);
  const dr = (x, i, phase) =>
    K.mover("drawer", { min: [x - 2.2, 7.4, -22.4], max: [x + 2.2, 8.4, -18.0] }, { type: "line", d: [0, 0, 4.2], period: 5.6, hold: 0.4, phase }, { color: "#e8cfa6", color2: "#4fb3a8", extra: { front: "+z" } });
  dr(-16, 0, 0);
  dr(-10, 1, 0.1);
  K.hint("ride", -19, -18, -7, -12, 7, 3);
  // a bar stool, then a ladle resting from the stool over to the island
  K.stool(-10, -12.6, { r: 1.8, h: 8.4, color: "#c8956a" });
  K.spoon(-10, 8.4, -8.9, 6.6, { axis: "z", flip: true });
  K.button(-15.6, 8.9, -16.0, "riding the first drawer");
  K.checkpoint(-8, 9, -2, Math.PI / 2);
  K.bowl(-2, 9, -2, 1.8, 1.0, { color: "#f2c14e", fill: "#e98a52" });
  K.board(4, 9, -3, 3.6, 2.4, {});
  K.button(4, 9.9, -3, "on the cutting board");
  // the last bridge: a fork + spoon over to the dining table
  K.table(16, 30, -6, 6, 7.5, { color: "#c8956a" });
  K.spoon(14, 8.0, 0, 5.6, { axis: "x" });
  K.box([11.8, 7.5, -0.4], [12, 8.0, 0.4], { mat: "metal", noLedge: true, invisible: true });
  K.cup(24, 7.5, -3, { accent: "#4fb3a8" });
  K.button(28, 8.1, 4, "at the table's far corner");
  K.finish(22, 7.5, 0, { r: 1.0 });
  K.fridge(14, 22, -24, -17, 18, {});

  K.go(-22, -20);
  K.go(-20, -20, { y: 9.0 });
  K.go(-16, -18.6, { y: 9.0, r: 0.3, waitMover: { i: 0, phase: [0.3, 0.34] } });
  K.go(0, 0, { board: 0, jump: true, jd: 1.8 });
  K.go(-14.3, -15.6, { y: 8.4, r: 0.4 });
  K.go(0, 0, { board: 1, jump: true, jd: 2.6 });
  K.go(-10, -14.6, { y: 8.4, r: 0.4 });
  K.go(-10, -12.6, { y: 8.4, r: 0.4 });
  K.go(-10, -6.6, { y: 8.52, slow: 0.6, r: 0.4 });
  K.go(-8, -2, { jump: true, jd: 2, y: 9.0 });
  K.go(4, -3, { jump: true, jd: 1.4, y: 9.3, only: "buttons" });
  K.go(11.6, 0, { y: 9.0 });
  K.go(13.0, 0, { y: 8.12, slow: 0.6, r: 0.3 });
  K.go(16.6, 0, { y: 8.12, slow: 0.6, r: 0.3 });
  K.go(17.6, 0, { y: 7.5 });
  K.go(28, 4, { y: 7.5, only: "buttons" });
  K.go(22, 0, { y: 7.5 });
  return K.done();
}

/* ====================================================================== 17 */
export function level17() {
  const K = createKit({ id: 17, name: "Sink Canyon", world: 2 });
  kitchenShell(K, { window: { wall: "back", c: 0, y: 13, w: 16, h: 8, sill: 0.6 } });
  // a deep double sink with a sponge raft
  K.counter(-30, 30, -24, -16, 9, { front: "+z", color: "#8a5aa8", sink: { x0: -12, x1: 12, z0: -23.2, z1: -17.0, depth: 4.2, water: 3.0 } });
  K.spawn(-24, 9, -20, Math.PI / 2);
  K.checkpoint(-16, 9, -20, Math.PI / 2);
  // floating sponge across the deep water
  K.mover("platform", { min: [-11.6, 7.6, -21.4], max: [-8.6, 8.0, -18.8] }, { type: "line", d: [20.2, 0, 0], period: 14, hold: 0.16 }, { color: "#f2d16b", color2: "#5f9b52", extra: { look: "sponge" } });
  K.hint("ride", -14, -23, -10, -17, 9, 2);
  K.hint("water", -14, -23, -12, -17, 9, 2);
  // drips from the tap onto the sponge's path
  K.hazard({ type: "drip", pos: [0, 7.8, -20], r: 0.6, h: 5.6, period: 3.2, onFrac: 0.22, warnFrac: 0.3 });
  K.button(0, 9.0, -20, "right under the dripping tap");
  K.checkpoint(16, 9, -20, Math.PI / 2);
  // out over the dish rack and onto a stack of bowls → sill
  K.dishRack(18, 26, -23.4, -19.4, 9, { plates: 3, plateH: 2.2 });
  K.bowl(27.6, 9, -21.5, 1.6, 1.0, { color: "#4fb3a8" });
  K.bowl(27.6, 10.0, -21.5, 1.4, 1.0, { color: "#e85d4a" });
  K.bowl(27.6, 11.0, -21.5, 1.2, 1.0, { color: "#f2c14e" });
  K.box([16, 12.6, -24], [30, 13.0, -22.6], { mat: "wood" });
  K.prop({ type: "wallBoard", x0: 16, x1: 30, y: 13.0, z0: -24, z1: -22.6, color: "#fff8ee" });
  K.button(24, 13.5, -23.3, "on the high shelf");
  K.finish(18, 13, -23.3, { r: 0.7 });
  K.button(-28, 9.6, -17, "at the start of the worktop");
  K.table(-8, 8, 6, 16, 7.5, {});

  K.go(-28, -17.4, { only: "buttons", y: 9.0 });
  K.go(-16, -20, { y: 9.0 });
  K.go(-12.6, -20.1, { y: 9.0, r: 0.25, waitMover: { i: 0, axis: 0, at: 0, tol: 0.05 } });
  K.go(0, 0, { board: 0, jump: true, jd: 2.4 });
  K.go(0, 0, { y: 8.0, r: 99, waitMover: { i: 0, axis: 0, at: 20.2, tol: 0.08 } });
  K.go(12.6, -20.1, { jump: true, jd: 2.4, y: 9.0 });
  K.go(13.0, -20, { y: 9.0 });
  K.go(16, -20, { y: 9.0 });
  K.go(19.6, -21.4, { jump: true, jd: 1.3, y: 9.3, atLeast: true, r: 0.5 });
  K.go(22.2, -21.4, { jump: true, jd: 1.3, y: 9.3, atLeast: true, r: 0.5 });
  K.go(25.2, -21.4, { jump: true, jd: 1.3, y: 9.3, atLeast: true, r: 0.5 });
  K.go(27.6, -21.5, { jump: true, jd: 1.4, y: 10.0, atLeast: true, r: 0.4 });
  K.go(27.6, -21.5, { jump: true, jd: 1.0, y: 11.0, atLeast: true, r: 0.4 });
  K.go(27.6, -21.5, { jump: true, jd: 1.0, y: 12.0, atLeast: true, r: 0.4 });
  K.go(26.6, -23.3, { jump: true, jd: 2, y: 13.0 });
  K.go(24, -23.3, { y: 13.0, only: "buttons" });
  K.go(18, -23.3, { y: 13.0 });
  return K.done();
}

/* ====================================================================== 18 */
export function level18() {
  const K = createKit({ id: 18, name: "The Busy Trolley", world: 2 });
  kitchenShell(K, {});
  backCounter(K);
  K.spawn(-28, 9, -21, Math.PI / 2);
  // the cat strolls along the worktop
  K.pet({
    type: "cat",
    period: 14,
    color: "#3a3a40",
    color2: "#f4f4f4",
    stripe: "#2a2a30",
    keys: [
      { t: 0, at: [-20, -20.6], state: "sit", block: true, y: 9, face: 1.6 },
      { t: 3, at: [-20, -20.6], state: "walk", y: 9, warn: true },
      { t: 6, at: [-30, -20.6], state: "sit", block: true, y: 9, face: 1.6 },
      { t: 10, at: [-30, -20.6], state: "walk", y: 9, warn: true },
      { t: 13, at: [-20, -20.6], state: "sit", block: true, y: 9, face: 1.6 },
    ],
  });
  K.hint("pet", -32, -24, -16, -18, 9, 3);
  K.checkpoint(-16, 9, -20, Math.PI / 2);
  // the trolley rolls between the worktop and the table, over the floor
  K.mover("trolley", { min: [-3.2, 0, -16.6], max: [0.6, 8.6, -13] }, { type: "line", d: [0, 0, 20], period: 14, hold: 0.18 }, { color: "#d4d7dc" });
  K.hint("ride", -6, -18, 3, -15, 9, 3);
  K.button(-1.3, 9.2, -6, "riding the trolley");
  K.table(-12, 12, 6, 18, 7.5, { color: "#d2a679", cloth: "#9ed2c6" });
  K.checkpoint(0, 7.5, 9, Math.PI);
  K.plates(-6, 7.5, 12, 1.4, 4, {});
  K.cereal(6, 7.5, 14, 2.4, 2.4, 1.0, { color: "#e85d4a", label: "CRUNCH" });
  K.cup(6, 7.5, 12.4, { accent: "#f2c14e" });
  K.button(6, 10.4, 14, "on the cereal box");
  K.button(-10, 8.1, 16, "in the far corner of the table");
  K.finish(-6, 8.14, 12, { r: 0.9 });
  K.fridge(14, 22, -24, -17, 18, {});
  K.jar(-26, 9, -22.5, 0.8, 1.8, {});

  K.go(-27, -18.3, { y: 9.0, r: 0.3 });
  K.go(-27, -18.3, { y: 9.0, r: 0.5, waitPet: { i: 0, state: "sit", minLeft: 2.2, far: 3.5 } });
  K.go(-19, -18.4, { y: 9.0 });
  K.go(-16, -18.7, { y: 9.0 });
  K.go(-3.0, -18.7, { y: 9.0 });
  K.go(-1.3, -18.8, { y: 9.0, r: 0.3, waitMover: { i: 0, axis: 2, at: 0, tol: 0.05 } });
  K.go(0, 0, { board: 0, jump: true, jd: 3.8 });
  K.go(0, 0, { y: 8.6, r: 99, waitMover: { i: 0, axis: 2, at: 20, tol: 0.1 } });
  K.go(-1.3, 7.4, { y: 7.5 });
  K.go(0, 9, { y: 7.5 });
  K.go(6, 11.0, { only: "buttons", y: 7.5 });
  K.go(6, 12.4, { only: "buttons", jump: true, jd: 1.6, y: 8.5, r: 0.4 });
  K.go(6, 14, { only: "buttons", jump: true, jd: 1.6, y: 9.9 });
  K.go(-10, 16, { only: "buttons", y: 7.5 });
  K.go(-6, 12, { jump: true, jd: 1.2, y: 8.14 });
  return K.done();
}

/* ====================================================================== 19 */
export function level19() {
  const K = createKit({ id: 19, name: "Fridge Magnets", world: 2, maxFall: 5.5 });
  kitchenShell(K, {});
  backCounter(K);
  K.spawn(4, 0, 6, Math.PI);
  // the fridge: its door covered in magnets — a climbing wall
  K.fridge(12, 22, -24, -16, 20, { front: "-x" });
  const M = (y, z, letter, color) => K.magnet(12, y, z, "-x", { letter, color, w: 1.3, d: 0.8, h: 0.5 });
  const letters = "LOSTTOYHOMEAGAIN";
  const cols = ["#e85d4a", "#f2c14e", "#4fb3a8", "#6f9bd1", "#8a5aa8", "#6a8f3f"];
  const steps = [];
  for (let i = 0; i < 15; i++) {
    const y = 1.1 + i * 1.25;
    const z = i % 2 ? -20.3 : -18.9;
    M(y, z, letters[i], cols[i % cols.length]);
    steps.push([y, z]);
  }
  K.hint("ledge", 8, -23, 12, -16, 0, 6);
  K.checkpoint(11.6, 9.85, -20.3, Math.PI / 2, 0.7);
  K.button(11.6, 14.15, -18.9, "halfway up the magnet ladder");
  K.checkpoint(14, 20, -20, Math.PI / 2);
  // the top of the fridge: cereal boxes and the forgotten biscuit tin
  K.cereal(19, 20, -22, 2.4, 3.4, 1.2, { color: "#f2c14e", label: "HONEY HOOPS" });
  K.cereal(19, 20, -19.6, 1.2, 2.4, 2.4, { color: "#4fb3a8", label: "OATS", rot: 0 });
  K.button(19, 24, -22, "on top of the honey hoops");
  K.button(14, 0.6, -12, "behind the fridge door");
  K.finish(15.0, 20, -17.4, { r: 0.9 });
  K.table(-14, 2, 2, 14, 7.5, {});

  K.go(9, -12);
  K.go(14, -12, { only: "buttons", r: 0.2 });
  K.go(9, -12, { only: "buttons" });
  K.go(10.4, -18.8, { r: 0.3 });
  for (let i = 0; i < steps.length; i++) K.go(11.55, steps[i][1], { jump: true, jd: i ? 3 : 1.6, y: steps[i][0], r: 0.5 });
  K.go(13.2, -20.2, { jump: true, jd: 2.4, y: 20 });
  K.go(17.0, -19.6, { y: 20, only: "buttons" });
  K.go(19, -19.6, { jump: true, jd: 1.6, y: 22.4, only: "buttons", r: 0.4 });
  K.go(19, -22, { jump: true, jd: 2.0, y: 23.4, only: "buttons" });
  K.go(15.0, -17.4, { y: 20 });
  return K.done();
}

/* ====================================================================== 20 */
export function level20() {
  const K = createKit({ id: 20, name: "Cookie Jar Summit", world: 2 });
  kitchenShell(K, { clockC: -14 });
  backCounter(K, { sink: false, color: "#e98a52", upper2: false });
  // breakfast table → trolley ride over to the worktop
  K.table(-26, -14, 3, 13, 7.5, { color: "#d2a679", cloth: "#f6d69a" });
  K.spawn(-20, 7.5, 9, Math.PI);
  K.plates(-23.5, 7.5, 10.5, 1.3, 2, {});
  K.cup(-16.6, 7.5, 10.8, { accent: "#e85d4a" });
  K.mover("trolley", { min: [-21.9, 0, -1.0], max: [-18.1, 8.6, 2.6] }, { type: "line", d: [0, 0, -16.6], period: 13, hold: 0.2 }, { color: "#d4d7dc" });
  K.checkpoint(-20, 7.5, 5.2, Math.PI);
  K.button(-20, 9.2, -6, "riding the trolley");
  // the cat naps on the worktop
  K.pet({
    type: "cat",
    period: 12,
    color: "#e3a565",
    keys: [
      { t: 0, at: [-10, -20.6], state: "sleep", block: true, y: 9, face: 1.6 },
      { t: 5, at: [-10, -20.6], state: "walk", y: 9, warn: true },
      { t: 7, at: [-4, -20.6], state: "sit", block: true, y: 9, face: -1.6 },
      { t: 10, at: [-4, -20.6], state: "walk", y: 9, warn: true },
    ],
  });
  K.checkpoint(-22, 9, -20.4, Math.PI / 2);
  // the toaster launches you to the open spice shelf
  K.toaster(2, 9, -19.4, { bounce: 14.4, color: "#4fb3a8" });
  K.box([-2, 15.4, -24], [8, 15.8, -20.8], { mat: "wood" });
  K.prop({ type: "wallBoard", x0: -2, x1: 8, y: 15.8, z0: -24, z1: -20.8, color: "#fff8ee" });
  K.jar(5.5, 15.8, -23.2, 0.6, 1.4, { lid: "#e85d4a", fill: "#d9473b" });
  K.jar(7.0, 15.8, -23.2, 0.6, 1.2, { lid: "#6a8f3f", fill: "#f2d16b" });
  K.checkpoint(1, 15.8, -22, Math.PI / 2);
  // spoon over to the top of the tall cupboard, where the cookie jar lives
  K.spoon(10, 15.8, -22.2, 4.4, { axis: "x" });
  K.box([12, 0, -24], [20, 17.0, -18], { mat: "wood" });
  K.prop({ type: "tallCupboard", x0: 12, x1: 20, z0: -24, z1: -18, h: 17.0, color: "#e98a52" });
  K.button(10, 16.5, -22.2, "on the spoon bridge");
  K.box([13.7, 17.0, -23.5], [15.5, 18.8, -21.7], { mat: "wood" });
  K.prop({ type: "spiceBox", x: 14.6, y: 17.0, z: -22.6 });
  K.jar(17.5, 17.0, -21, 1.3, 2.6, { color: "#f4efe6", lid: "#c0504d", fill: "#c98d5a" });
  K.button(17.5, 20.2, -21, "on the cookie jar lid");
  K.finish(14.4, 17.0, -19.4, { r: 0.9 });

  K.go(-20, 3.6, { y: 7.5, r: 0.3, waitMover: { i: 0, axis: 2, at: 0, tol: 0.05 } });
  K.go(0, 0, { board: 0, jump: true, jd: 2.6 });
  K.go(0, 0, { y: 8.6, r: 99, waitMover: { i: 0, axis: 2, at: -16.6, tol: 0.1 } });
  K.go(-20, -17.6, { y: 9.0 });
  K.go(-22, -20.4, { y: 9.0 });
  K.go(-13, -19.2, { y: 9.0, waitPet: { i: 0, state: "sleep", minLeft: 4 } });
  K.go(-2, -19.2, { y: 9.0 });
  K.go(0, -21, { y: 9.0 });
  K.go(2, -19.4, { jump: true, jd: 1.4, y: 10.1, r: 0.4 });
  K.go(2, -19.4, { jump: true, jd: 3, hold: true, fromY: 10.1, r: 0.8 });
  K.go(1, -22.2, { hold: true, y: 15.8 });
  K.go(7.6, -22.2, { y: 15.8 });
  K.go(11.5, -22.2, { y: 15.92, slow: 0.6 });
  K.go(13.2, -21.0, { jump: true, jd: 2.2, y: 17.0 });
  K.go(14.6, -22.6, { only: "buttons", jump: true, jd: 1.6, y: 18.8, r: 0.4 });
  K.go(17.2, -21.4, { only: "buttons", jump: true, jd: 2.2, y: 19.6 });
  K.go(14.4, -19.4, { y: 17.0 });
  return K.done();
}
