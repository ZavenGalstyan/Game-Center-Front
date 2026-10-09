/**
 * Mario Adventure 3D — World 4: SNOW KINGDOM.
 * Powder snow, slippery ice (rinks, floes and ice platforms), falling
 * icicles, frozen caves with low ceilings, and a blizzard-swept peak.
 */
import { build } from "../kit.js";

const W4 = { world: 4, theme: "snow", sea: { kind: "water", y: -1.5 }, killY: -10, platStyle: "ice", surf: "snow" };
const ICE = ["#bfe6ff", "#d4efff", "#a8dcfa"];

/* ------------------------------------------------------------------ 4-1 POWDER FIELDS */
function powderFields() {
  const L = build({ ...W4, id: 19, num: 1, name: "Powder Fields" });
  L.island(0, 10, 14, 20, 0, { wob: 0.03 });
  L.island(0, 22, 6, 5, 0.3, { wob: 0.04, top: ICE, surf: "ice" });
  L.island(0, 56, 14, 16, 1, { wob: 0.03 });
  L.hill(-8, 2, 6, 2.5);
  L.hill(9, 8, 5, 1.8);
  L.hill(-9, 52, 5, 2);
  L.spawn(0, -6, 0);
  L.sign(2.6, -4, "Brrr! The Snow Kingdom. Ice is slippery — start turning early!", Math.PI);
  L.coinLine([0, -3], [0, 7], 4);
  L.enemy("walker", 4, 10, { radius: 2.5 });
  L.enemy("jumper", -6, 12);
  L.qblock(-1.1, 2.6, 13, "magnet");
  L.brick(1.1, 2.6, 13);
  // the ice rink
  L.coinRingG(0, 22, 3.4, 6);
  // ice steps over the crevasse (or the drifting floe on the right)
  L.plat(-1.4, 0.4, 31.6, 2.8, 2.8);
  L.plat(1, 0.6, 34.8, 2.8, 2.8);
  L.plat(-0.6, 0.8, 38, 2.8, 2.8);
  L.coin(-1.4, 1.25, 31.6).coin(1, 1.45, 34.8).coin(-0.6, 1.65, 38);
  L.mover(7, 0.6, 31.8, 3, 3, [7, 0.9, 38.4], 5, { style: "snow" });
  L.checkpoint(0, 43.5);
  L.enemy("armored", 4, 54, { radius: 2.5 });
  L.enemy("fast", -4, 60, { radius: 2.5 });
  L.coinLine([0, 47], [0, 55], 3);
  L.goal(0, 66);
  L.deco("castle", 0, 71.5, { noCollide: true, s: 0.85 });
  // secret: a tall ice pillar behind the pines, climbed with stepping blocks
  L.plat(10.6, 1.8, 46, 2.4, 2.4, { style: "snow" });
  L.plat(11.4, 3.4, 49, 2.4, 2.4, { style: "snow" });
  L.pillar(10.4, 52.4, 5, 2.4, { style: "ice" });
  L.star(10.4, 6.4, 52.4);
  L.coin(10.6, 2.65, 46).coin(11.4, 4.25, 49);
  for (const [x, z, s] of [
    [-10, -4, 1.1],
    [10, -2, 1],
    [-12, 18, 1.2],
    [12, 24, 1],
    [-11, 40, 1.1],
    [12.5, 44, 1],
    [-9, 64, 1],
    [8, 62, 0.9],
  ])
    L.deco("pine", x, z, { s });
  L.deco("snowman", 5, -3, { rot: Math.PI });
  L.deco("snowman", -5, 47, { rot: Math.PI * 0.8 });
  L.scatter("crystal", 4, 0, 56, 12, 12, { avoid: [[0, 56, 6]], noCollide: true });

  L.lv.route = [
    [0, 7],
    { stomp: 0 },
    { stomp: 1 },
    [-1.1, 11.6],
    { p: [-1.1, 13], jump: 1 },
    { wait: 1.4 },
    [-1.1, 11],
    [3.4, 22],
    [1.7, 24.9],
    [-1.7, 24.9],
    [-3.4, 22],
    [-1.7, 19.1],
    [1.7, 19.1],
    [-1.4, 28.4],
    { p: [-1.4, 31.6], jumpAt: 9 },
    [-1.4, 31.6],
    { p: [1, 34.8], jumpAt: 9 },
    [1, 34.8],
    { p: [-0.6, 38], jumpAt: 9 },
    [-0.6, 38],
    { p: [0, 41.6], jumpAt: 9 },
    [0, 43.5],
    [8.4, 44.6],
    { p: [10.6, 46], jumpAt: 9 },
    [10.6, 46],
    { p: [11.4, 49], jumpAt: 9 },
    [11.4, 49],
    { p: [10.4, 52.4], jumpAt: 9, jump: 2, dj: 0.3 },
    [10.4, 52.4],
    { p: [6, 52], jumpAt: 9 },
    { stomp: 3 },
    { stomp: 3 },
    [0, 55],
    [0, 66],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 4-2 ICICLE PASS */
function iciclePass() {
  const L = build({ ...W4, id: 20, num: 2, name: "Icicle Pass" });
  L.island(0, 0, 9, 9, 0, { wob: 0.03 });
  L.island(0, 40, 6, 32, 1, { wob: 0.02, p: 3 });
  L.island(0, 84, 9, 9, 2, { wob: 0.03 });
  L.island(-17, 40, 3.4, 3.4, 4, { wob: 0.06, float: 4 });
  L.spawn(0, -4, 0);
  L.sign(2.4, -2, "Icicles drop when you pass beneath them. Listen for the crack and keep running!", Math.PI);
  L.coinLine([0, -1], [0, 5], 3);
  L.plat(0, 0.6, 10.6, 3, 3, { style: "snow" });
  L.checkpoint(0, 12.5);
  // ice arches with icicles along the pass
  for (const z of [20, 30, 40, 50, 60]) {
    L.wall(-4.6, 4, z, 0.6, 3, 0.8, { style: "ice" });
    L.wall(4.6, 4, z, 0.6, 3, 0.8, { style: "ice" });
    L.wall(0, 7.4, z, 5.2, 0.4, 0.8, { style: "ice" });
  }
  for (const [x, z] of [
    [-1, 20],
    [1.2, 25],
    [-0.8, 30],
    [1, 35],
    [0, 40],
    [-1.4, 45],
    [1, 50],
    [-0.6, 55],
    [0.8, 60],
  ])
    L.hazard("icicle", { x, y: 7, z });
  L.coinLine([0, 16], [0, 64], 9);
  L.enemy("walker", 2, 28, { radius: 2 });
  L.enemy("flyer", -2, 46, { y: 1, fly: 3, radius: 2 });
  L.enemy("armored", 2, 57, { radius: 1.6 });
  // crumbling snow to the last meadow
  L.faller(0, 1.6, 74.6, 2.6, 2.6, { style: "snow" });
  L.faller(0, 1.9, 77.8, 2.6, 2.6, { style: "snow" });
  L.goal(0, 86);
  L.coinLine([-2, 82], [2, 82], 2);
  // secret: a frozen pipe to an ice shelf
  L.pipe(-3, 66, 1.4, 2);
  L.pipe(4, 80, 1.2, null, { y: 2 });
  L.pipe(-17, 37.6, 1.2, 1, { secret: true });
  L.star(-17, 5.4, 42);
  L.coinG(-18.6, 40).coinG(-15.4, 40);
  for (const [x, z] of [
    [-6, -4],
    [6, 2],
    [-7, 84],
    [7, 86],
  ])
    L.deco("pine", x, z, { s: 1 });
  L.deco("snowman", 4, -5, { rot: Math.PI });

  L.lv.route = [
    [0, 5],
    [0, 7.6],
    { p: [0, 10.6], jumpAt: 9 },
    [0, 10.6],
    [0, 12.5],
    { stomp: 0 },
    { p: [-2.4, 62], sprint: true, r: 0.8 },
    [-3, 63.8],
    { p: [-3, 66], jumpAt: 2.2 },
    { p: [-3, 66], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-17, 42],
    [-18.6, 40],
    [-15.4, 40],
    [-17, 39],
    { p: [-17, 37.6], jumpAt: 2.2 },
    { p: [-17, 37.6], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-2, 82],
    [2, 82],
    [0, 86],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 4-3 FROZEN CAVES */
function frozenCaves() {
  const L = build({ ...W4, id: 21, num: 3, name: "Frozen Caves" });
  L.island(0, 8, 10, 18, 0, { wob: 0.01, p: 4 });
  L.island(0, 52, 10, 17, 0, { wob: 0.01, p: 4 });
  L.spawn(0, -8, 0);
  L.sign(2.4, -8, "The Frozen Caves. Watch your step — the cave floor drops into icy water in places!", Math.PI);
  L.coinLine([0, -5], [0, -1], 3);
  // tunnel walls + roof: z 0 → 60, 7 wide, roof at 5.6
  L.wall(-4, 3, 30, 0.6, 3, 30, { style: "ice" });
  L.wall(4, 3, 30, 0.6, 3, 30, { style: "ice" });
  L.wall(0, 6.3, 12, 4.6, 0.5, 12, { style: "ice", camIgnore: false });
  L.wall(0, 6.3, 48, 4.6, 0.5, 12, { style: "ice" });
  // first chamber: pillars and troopers
  L.pillar(-1.6, 8, 1.2, 1.2, { shape: "cyl", style: "ice" });
  L.pillar(1.8, 14, 1.2, 1.2, { shape: "cyl", style: "ice" });
  L.coinLine([0, 3], [0, 20], 5);
  L.enemy("walker", 0, 11, { radius: 2 });
  L.enemy("armored", 0, 19, { radius: 1.8 });
  // the chasm under the skylight: blinking ice
  L.checkpoint(0, 22.5);
  L.blinker(-1.4, 0.2, 27.2, 2.6, 2.6, 4, 0, { on: 0.65 });
  L.blinker(1.4, 0.4, 30.6, 2.6, 2.6, 4, 0.35, { on: 0.65 });
  L.blinker(-1, 0.6, 34, 2.6, 2.6, 4, 0.7, { on: 0.65 });
  L.coin(-1.4, 1.05, 27.2).coin(1.4, 1.25, 30.6).coin(-1, 1.45, 34);
  // second chamber: a fast charger
  L.enemy("fast", 0, 50, { radius: 2 });
  L.coinLine([0, 40], [0, 56], 4);
  L.goal(0, 64);
  L.coinLine([-2, 60], [2, 60], 2);
  // secret: a crack in the east wall hides a crystal grotto
  L.island(13, 48, 4.4, 5, 0, { wob: 0.04 });
  L.pipe(2.4, 44, 1.2, 2);
  L.pipe(-2.4, 58, 1.2, null);
  L.pipe(13, 45, 1.2, 1, { secret: true });
  L.star(13, 1.6, 50.6);
  L.coinG(11.4, 48).coinG(14.6, 48);
  L.deco("crystal", 14.8, 51, { s: 1.2, noCollide: true });
  L.deco("crystal", 11, 51.4, { s: 0.9, noCollide: true });
  L.deco("crystal", -2.8, 4, { s: 0.8, noCollide: true });
  L.deco("crystal", 2.8, 40, { s: 0.8, noCollide: true });
  L.deco("crystal", -2.8, 52, { s: 0.9, noCollide: true });

  L.lv.route = [
    [0, -2],
    [0, 3],
    { stomp: 0 },
    [0, 16.5],
    { stomp: 1 },
    { stomp: 1 },
    [0, 22.5],
    [-1.4, 24.6],
    { waitOn: [-1.4, 27.2] },
    { p: [-1.4, 27.2], jumpAt: 9 },
    [-1.4, 27.2],
    { waitOn: [1.4, 30.6] },
    { p: [1.4, 30.6], jumpAt: 9 },
    [1.4, 30.6],
    { waitOn: [-1, 34] },
    { p: [-1, 34], jumpAt: 9 },
    [-1, 34],
    { p: [-0.6, 37.2], jumpAt: 9 },
    [0, 40],
    [1.4, 42.6],
    { p: [2.4, 44], jumpAt: 2 },
    { p: [2.4, 44], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [13, 50.6],
    [11.4, 48],
    [14.6, 48],
    [13, 46.4],
    { p: [13, 45], jumpAt: 2 },
    { p: [13, 45], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    { stomp: 2 },
    [-2, 60],
    [2, 60],
    [0, 64],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 4-4 ICE LAKE */
function iceLake() {
  const L = build({ ...W4, id: 22, num: 4, name: "Ice Lake" });
  L.island(0, 0, 9, 9, 0.6, { wob: 0.03 });
  L.island(0, 26, 10, 10, 0, { wob: 0.03, top: ICE, surf: "ice" });
  L.island(0, 58, 10, 10, 0, { wob: 0.03, top: ICE, surf: "ice" });
  L.island(0, 86, 9, 9, 0.6, { wob: 0.03 });
  L.island(22, 42, 3.6, 3.6, 0.6, { wob: 0.06 });
  L.spawn(0, -4, 0);
  L.sign(2.4, -2, "Ice Lake. Floes drift between the frozen sheets — the water is freezing!", Math.PI);
  L.coinLine([0, -1], [0, 6], 3);
  L.enemy("walker", -4, 3, { radius: 2 });
  L.plat(0, 0.4, 11.2, 2.6, 2.6, { style: "snow" });
  L.plat(0, 0.3, 14.4, 2.6, 2.6, { style: "snow" });
  L.coin(0, 1.25, 11.2).coin(0, 1.15, 14.4);
  // the first sheet (slippery!)
  L.coinRingG(0, 26, 4, 6);
  L.enemy("fast", 3, 28, { radius: 3 });
  L.enemy("walker", -4, 24, { radius: 2.5 });
  L.hazard("cannon", { x: -8, y: 0, z: 30, yaw: Math.PI / 2, every: 3.4, range: 17 });
  // a snowy dock to wait on, then floes across the open water
  L.plat(0, 0.25, 35.4, 4, 2.4, { style: "snow" });
  L.plat(0, 0.25, 48.2, 4, 2.4, { style: "snow" });
  L.mover(-3, 0.2, 38.6, 3.2, 3.2, [3, 0.2, 38.6], 5, { style: "ice" });
  L.mover(3, 0.2, 43.2, 3.2, 3.2, [-3, 0.2, 43.2], 5, { style: "ice" });
  L.coinAir([0, 1.2, 38.6], [0, 1.2, 43.2], 2);
  L.checkpoint(0, 50);
  L.coinRingG(0, 58, 3.6, 5);
  L.enemy("armored", -3, 61, { radius: 2.5 });
  L.enemy("flyer", 4, 62, { fly: 2.6, radius: 2.5 });
  // last crossing: a spinning ice disc
  L.disc(0, 0.6, 72.4, 2.6, 0.75, { style: "ice" });
  L.coin(0, 1.45, 72.4);
  L.goal(0, 89);
  L.coinLine([-2, 83], [2, 83], 2);
  // secret: an ice stone, a floe ride east to an islet, a pipe home
  L.plat(7.6, 0.25, 43, 2.6, 2.6, { style: "snow" });
  L.mover(12, 0.3, 42.4, 3, 3, [17.2, 0.5, 42.4], 5.5, { style: "snow" });
  L.pipe(23.6, 40.2, 1.2, 1);
  L.pipe(-4.6, 53.6, 1.2, null);
  L.star(22, 2.1, 42);
  L.coinG(23.4, 43.6).coinG(20.6, 40.4);
  for (const [x, z] of [
    [-6, -4],
    [6, 3],
    [-6, 88],
    [6, 90],
    [22, 44.5],
  ])
    L.deco("pine", x, z, { s: 0.9 });
  L.deco("snowman", 4, -5, { rot: Math.PI });

  L.lv.route = [
    [0, 6],
    { stomp: 0 },
    [0, 8.2],
    { p: [0, 11.2], jumpAt: 9 },
    [0, 11.2],
    { p: [0, 14.4], jumpAt: 9 },
    [0, 14.4],
    { p: [0, 17.6], jumpAt: 9 },
    [0, 17.6],
    { stomp: 1 },
    { stomp: 2 },
    [4, 26],
    [0, 30],
    [-4, 26],
    [0, 22],
    [0, 35.6],
    { waitPlat: [-3, 38.6], near: [-1.6, 38.6], r: 0.4, dir: [1, 0] },
    { p: [0, 38.6], jumpAt: 9 },
    { ride: [-3, 38.6], until: [0, 38.6], r: 0.9 },
    { waitPlat: [3, 43.2], near: [0, 43.2], r: 0.7 },
    { p: [0, 43.2], jumpAt: 9 },
    { ride: [3, 43.2], until: [3, 43.2], r: 0.4, timeout: 6 },
    { p: [7.6, 43], jumpAt: 9 },
    [7.6, 43],
    { waitPlat: [12, 42.4], near: [12, 42.4], r: 0.4 },
    { p: [12, 42.4], jumpAt: 9 },
    { ride: [12, 42.4], until: [17.2, 42.4], r: 0.4, timeout: 8 },
    { p: [19.8, 42.2], jumpAt: 9 },
    [22, 42],
    [23.4, 43.6],
    [20.6, 40.4],
    [22, 42],
    { p: [23.6, 40.2], jumpAt: 2 },
    { p: [23.6, 40.2], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [0, 50],
    [3.6, 58],
    [0, 61.6],
    [-3.6, 58],
    [0, 54.4],
    [0, 67.6],
    { p: [0, 72.4], jumpAt: 9 },
    [0, 72.4],
    { p: [0, 74.2], r: 0.4 },
    { p: [0, 78.4], jumpAt: 9 },
    [0, 79],
    [-2, 83],
    [2, 83],
    [0, 89],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 4-5 BLIZZARD PEAK */
function blizzardPeak() {
  const L = build({ ...W4, id: 23, num: 5, name: "Blizzard Peak" });
  L.island(0, 0, 11, 11, 0, { wob: 0.03 });
  L.island(0, 20, 9, 7, 3, { wob: 0.02, p: 3 });
  L.island(0, 34, 7, 6, 7, { wob: 0.02, p: 3 });
  L.island(0, 47, 6, 6, 11, { wob: 0.02, p: 3 });
  L.island(0, 61.4, 6, 6, 15.5, { wob: 0.02, p: 3 });
  L.island(16, 34, 3.4, 3.4, 11, { wob: 0.06, float: 5 });
  L.spawn(0, -6, 0);
  L.sign(2.4, -4, "Blizzard Peak! Climb the snowy ledges to the summit flag.", Math.PI);
  L.coinLine([0, -3], [0, 6], 4);
  L.enemy("walker", 5, 3, { radius: 2 });
  L.plat(-2.4, 1.6, 10.4, 2.6, 2.4, { style: "snow" });
  L.coin(-2.4, 2.45, 10.4);
  // ledge 1 → 2: a spring
  L.checkpoint(0, 16);
  L.enemy("jumper", -4, 21);
  L.spring(2, 25, { power: 21 });
  L.coinAir([2, 7, 26.6], [1, 8, 29], 2);
  // ledge 2 → 3: ice steps under icicles
  L.plat(-3, 8.4, 39, 2.4, 2.2);
  L.plat(-1, 9.8, 40.6, 2.4, 2.2);
  L.hazard("icicle", { x: -3, y: 14, z: 39 });
  L.hazard("icicle", { x: -1, y: 15, z: 40.6 });
  L.coin(-3, 9.25, 39).coin(-1, 10.65, 40.6);
  L.enemy("flyer", 3, 34, { y: 7, fly: 2.4, radius: 2 });
  // ledge 3 → summit: clouds of snow
  L.cloud(2.6, 12.4, 52.6, 1.8);
  L.cloud(-1, 13.9, 54.8, 1.8);
  L.coin(2.6, 13.25, 52.6).coin(-1, 14.75, 54.8);
  L.coinLine([-2, 59], [2, 59], 3);
  L.enemy("armored", 2.6, 49.6, { radius: 1.2 });
  L.goal(0, 62.4);
  // secret: a lift from ledge 3 out to a frosty perch
  L.mover(6.6, 7.1, 34, 2.6, 2.6, [11.2, 11.1, 34], 5, { style: "snow" });
  L.star(16, 12.4, 34);
  L.coinG(16, 32.4).coinG(16, 35.6);
  for (const [x, z] of [
    [-8, -4],
    [8, -2],
    [-7, 22],
    [6, 36],
    [-5, 48],
  ])
    L.deco("pine", x, z, { s: 0.9 });

  L.lv.route = [
    [0, 6],
    { stomp: 0 },
    [-2.4, 8],
    { p: [-2.4, 10.4], jumpAt: 9 },
    [-2.4, 10.4],
    { p: [-2.2, 14.4], jumpAt: 9 },
    [-1, 15.4],
    [0, 16],
    { stomp: 1 },
    [2, 23.2],
    { p: [2, 25], air: true, r: 0.7 },
    { p: [1, 30.6], r: 1, timeout: 5 },
    [3.6, 31],
    { waitPlat: [6.6, 34], near: [6.6, 34], r: 0.3 },
    { p: [6.6, 34], jumpAt: 9 },
    { ride: [6.6, 34], until: [11.2, 34], r: 0.4, timeout: 7 },
    { p: [14, 34], jumpAt: 9 },
    [16, 34],
    [16, 32.4],
    [16, 35.6],
    [14, 34],
    { waitPlat: [6.6, 34], near: [11.2, 34], r: 0.4 },
    { p: [11.2, 34], jumpAt: 9 },
    { ride: [6.6, 34], until: [6.6, 34], r: 0.4, timeout: 7 },
    { p: [4, 35], jumpAt: 9 },
    [-3, 36.6],
    { p: [-3, 39], jumpAt: 9 },
    [-3, 39],
    { p: [-1, 40.6], jumpAt: 9 },
    [-1, 40.6],
    { p: [-0.6, 43.4], jumpAt: 9 },
    [0, 44],
    [-2, 47],
    [1.6, 50.4],
    { p: [2.6, 52.6], jumpAt: 9 },
    [2.6, 52.6],
    { p: [-1, 54.8], jumpAt: 9 },
    [-1, 54.8],
    { p: [-0.6, 57.8], jumpAt: 9 },
    [-2, 59],
    [2, 59],
    [0, 62.4],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 4-6 FROST YETI'S RINK (boss) */
function yetiRink() {
  const L = build({ ...W4, id: 24, num: 6, name: "Frost Yeti's Rink", coinGoal: 12, boss: { kind: "frostYeti", x: 0, y: 1, z: 42, cx: 0, cz: 34, R: 15 } });
  L.island(0, 0, 9, 9, 0, { wob: 0.04 });
  L.island(0, 34, 16, 16, 1, { wob: 0.02, p: 2 });
  L.island(0, 34, 5, 5, 1.02, { wob: 0.04, top: ICE, surf: "ice" });
  L.spawn(0, -4, 0);
  L.sign(2.5, -2, "Watch the icy rink in the middle! Dodge the snowballs; after his belly-flop he's stuck — stomp him!", Math.PI);
  L.coinLine([0, 0], [0, 6], 4);
  L.qblock(-2.5, 2.7, 4, "heart");
  L.plat(0, 0.6, 12, 3, 3, { style: "snow" });
  L.plat(0, 0.8, 15.6, 3, 3, { style: "snow" });
  L.coin(0, 1.45, 12).coin(0, 1.65, 15.6);
  L.checkpoint(0, 20.5);
  for (const a of [0.785, 2.356, 3.927, 5.498]) L.deco("pine", Math.cos(a) * 13.8, 34 + Math.sin(a) * 13.8, { s: 0.9 });
  L.coinRingG(0, 34, 11, 8);
  L.spring(12.5, 34, { power: 27 });
  L.island(19.6, 34, 3.2, 3.2, 9, { wob: 0.08, float: 4 });
  L.star(19.6, 10.4, 34);
  L.coinG(19.6, 32).coinG(19.6, 36);
  L.goal(0, 34, 1, 7);
  L.lv.route = [
    [0, 6],
    [-2.5, 4],
    { p: [-2.5, 4], jump: 1 },
    { wait: 1.2 },
    [-2.5, 6],
    [0, 8.4],
    { p: [0, 12], jumpAt: 3.6 },
    [0, 12],
    { p: [0, 15.6], jumpAt: 9 },
    [0, 15.6],
    { p: [0, 19.5], jumpAt: 9 },
    [0, 20.5],
    [0, 25],
    { boss: true },
    [8.8, 34],
    { p: [12.5, 34], air: true, r: 0.7 },
    { p: [19.6, 34], r: 0.8, timeout: 5 },
    [19.6, 32],
    [19.6, 36],
    [17.4, 34],
    { p: [14, 34], jumpAt: 9 },
    [12.5, 38],
    [0, 34],
  ];
  return L.done();
}

export const WORLD4 = [powderFields, iciclePass, frozenCaves, iceLake, blizzardPeak, yetiRink];
