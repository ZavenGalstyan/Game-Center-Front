/**
 * Mario Adventure 3D — World 2: DESERT KINGDOM.
 * Sand dunes over a quicksand sea, ancient sandstone ruins, firebars,
 * crushers, cannons and lots of drifting stone platforms.
 */
import { build } from "../kit.js";

const W2 = { world: 2, theme: "desert", sea: { kind: "void", y: -4 }, killY: -5, platStyle: "sandstone", surf: "sand" };

/* ------------------------------------------------------------------ 2-1 DUNE ROAD */
function duneRoad() {
  const L = build({ ...W2, id: 7, num: 1, name: "Dune Road" });
  L.island(0, 25, 16, 34, 0, { wob: 0.03 });
  L.island(0, 80, 12, 12, 2, { wob: 0.03 });
  L.hill(-8, 8, 7, 2.5);
  L.hill(9, 22, 8, 3.5, { flat: 0.3 });
  L.hill(-7, 37, 7, 3);
  L.hill(7, 48, 6, 2);
  L.hill(-1, 4, 4, 0.8);
  L.spawn(0, -5, 0);
  L.sign(2.6, -3, "The Desert Kingdom! Mind the quicksand — it swallows everything.", Math.PI);
  L.coinLine([0, -1], [0, 9], 5);
  L.qblock(-2.2, 2.7, 14.5, "coin", { count: 3 });
  L.qblock(0, 2.7, 14.5, "jump");
  L.brick(2.2, 2.7, 14.5);
  L.enemy("walker", 0, 22, { radius: 3 });
  L.enemy("jumper", -8, 8);
  // ruin steps up to an old column
  L.plat(3, 1.2, 29, 2.4, 2.4);
  L.plat(5, 2.4, 31.8, 2.4, 2.4);
  L.plat(7, 3.6, 34.6, 2.4, 2.4);
  L.pillar(9.4, 37.6, 4.8, 2.2, { shape: "cyl" });
  L.coin(3, 2.05, 29).coin(5, 3.25, 31.8).coin(7, 4.45, 34.6).coin(9.4, 5.65, 37.6);
  L.enemy("walker", -3, 44, { radius: 2.5 });
  L.coinLine([0, 50], [0, 56], 3);
  // across the quicksand: a drifting slab, or the stone posts on the right
  L.mover(0, 1, 61, 3, 3, [0, 1, 66.6], 5);
  L.pillar(6, 62.4, 1.2, 2.2, { shape: "cyl" });
  L.pillar(7, 66, 2, 2.2, { shape: "cyl" });
  L.coinAir([0, 2, 62], [0, 2, 66], 2);
  // oasis town
  L.checkpoint(0, 71);
  L.coinRingG(4, 80, 2.2, 3);
  L.enemy("armored", 4, 84, { radius: 2 });
  L.goal(0, 88);
  L.deco("castle", 0, 93.5, { noCollide: true, s: 0.85 });
  // secret: an invisible block next to the lone cactus lifts you to a ledge
  L.deco("cactus", -6.5, 79, { s: 1 });
  L.sign(-4, 76, "Lone cactus, lonely sky… something invisible floats nearby.", Math.PI * 0.75);
  L.qblock(-8, 4.6, 80.5, "coin", { hidden: true });
  L.plat(-10.6, 7.2, 83.2, 2.6, 2.6);
  L.star(-10.6, 8.6, 83.2);

  for (const [x, z] of [
    [-11, -3],
    [12, 4],
    [-13, 22],
    [13, 36],
    [-12, 52],
    [10, 72],
    [-9, 88],
  ])
    L.deco("cactus", x, z, { s: 0.9 + ((x * z) % 3) * 0.1 });
  L.deco("column", -11, 30, { s: 0.8 });
  L.deco("column", 12, 57, { s: 0.7 });
  L.scatter("rock", 6, 0, 25, 14, 30, { s: 0.6, avoid: [[0, 25, 4]] });
  L.scatter("bush", 6, 0, 25, 14, 30, { noCollide: true, avoid: [[0, 25, 4]] });

  L.lv.route = [
    [0, 9],
    [-2.2, 13.2],
    { p: [-2.2, 14.5], jump: 1 },
    { wait: 0.9 },
    { p: [-2.2, 14.5], jump: 1 },
    { wait: 0.9 },
    { p: [-2.2, 14.5], jump: 1 },
    { wait: 0.9 },
    [0, 13],
    { p: [0, 14.5], jump: 1 },
    { wait: 1.2 },
    [0, 12.8],
    { stomp: 0 },
    [1.4, 27.2],
    { p: [3, 29], jumpAt: 2.6 },
    [3, 29],
    { p: [5, 31.8], jumpAt: 9 },
    [5, 31.8],
    { p: [7, 34.6], jumpAt: 9 },
    [7, 34.6],
    { p: [9.4, 37.6], jumpAt: 9 },
    [9.4, 37.6],
    [0, 46],
    [0, 56],
    [0, 58],
    { waitPlat: [0, 61], near: [0, 61], r: 0.4 },
    { p: [0, 61], jumpAt: 9 },
    { ride: [0, 61], until: [0, 66.6], r: 0.4 },
    { p: [0, 69.4], jumpAt: 9 },
    [0, 71],
    [6.2, 80],
    [2.9, 81.9],
    [2.9, 78.1],
    { stomp: 3 },
    { stomp: 3 },
    [-8, 79],
    { p: [-8, 80.5], jump: 1 },
    { wait: 1 },
    [-8, 79.2],
    { wait: 0.5 },
    { hop: 2 },
    { wait: 0.4 },
    { p: [-8, 80.5], r: 0.5, timeout: 3 },
    { p: [-10.6, 83.2], jumpAt: 9 },
    [-10.6, 83.2],
    { p: [-6, 85], jumpAt: 9 },
    [-2, 86],
    [0, 88],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 2-2 ANCIENT RUINS */
function ancientRuins() {
  const L = build({ ...W2, id: 8, num: 2, name: "Ancient Ruins" });
  L.island(0, 0, 10, 10, 1, { wob: 0.03 });
  L.island(0, 40, 12, 26, 1, { wob: 0.02 });
  L.island(-40, 40, 6, 6, 6, { wob: 0.06, float: 6 });
  L.spawn(0, -5, 0);
  L.coinLine([0, -1], [0, 7], 4);
  L.plat(0, 1, 12, 3, 3);
  L.checkpoint(0, 16.5);
  L.enemy("walker", -7, 18, { radius: 2 });
  // the corridor
  L.wall(-3.6, 3, 32, 0.5, 2, 12);
  L.wall(3.6, 3, 32, 0.5, 2, 12);
  L.hazard("firebar", { x: 0, y: 1.6, z: 26, n: 5, rate: 1.5 });
  L.hazard("firebar", { x: 0, y: 1.6, z: 36.5, n: 5, rate: -1.7, angle: 1.6 });
  L.coinLine([1.3, 21], [1.3, 31], 4);
  L.coinLine([1.3, 33], [1.3, 42], 3);
  // high road on the right wall: steps up, then walk the wall top
  L.plat(6, 2.2, 18.6, 2.4, 2.4);
  L.plat(6, 3.6, 21.4, 2.4, 2.4);
  L.coin(3.6, 5.85, 27).coin(3.6, 5.85, 33).coin(3.6, 5.85, 39);
  L.coinLine([7.2, 26], [7.2, 38], 3);
  // crushers guard the plaza
  L.hazard("crusher", { x: 0, y: 1, z: 48, size: 2.4, rise: 4.2, wait: 1.8 });
  L.hazard("crusher", { x: 0, y: 1, z: 53, size: 2.4, rise: 4.2, wait: 1.8, phase: 1.4 });
  L.coin(0, 1.85, 50.5).coin(0, 1.85, 55.5);
  L.enemy("armored", 5, 60.5, { radius: 1 });
  L.enemy("jumper", -7, 44);
  L.goal(0, 62);
  for (const z of [16, 46, 56]) {
    L.deco("column", -8, z, { s: 0.8 });
    L.deco("column", 8, z, { s: 0.8 });
  }
  // secret: the pipe behind the west wall
  L.pipe(-8, 30, 1.6, 2);
  L.pipe(-8, 56, 1.6, null);
  L.pipe(-40, 37, 1.4, 1, { secret: true });
  L.star(-40, 7.6, 43);
  L.coinRingG(-40, 41, 2.2, 4);
  L.deco("pyramid", -40, 47, { s: 0.25, noCollide: true });
  L.scatter("cactus", 5, 0, 0, 9, 9, { avoid: [[0, 0, 3]] });
  L.scatter("rock", 4, 0, 40, 11, 24, { s: 0.5, avoid: [[0, 40, 5]] });

  L.lv.route = [
    [0, 7],
    [0, 9],
    { p: [0, 12], jumpAt: 3.2 },
    [0, 12],
    { p: [0, 15], jumpAt: 9 },
    [0, 16.5],
    { stomp: 0 },
    [1.3, 19.6],
    { waitSafe: [1.3, 31.6], sprint: true, timeout: 20 },
    { p: [1.3, 31.6], sprint: true, r: 0.6 },
    { waitSafe: [1.3, 43.6], sprint: true, timeout: 20 },
    { p: [1.3, 43.6], sprint: true, r: 0.6 },
    [0, 44.8],
    { stomp: 2 },
    [0, 44.8],
    { waitCrush: [0, 48] },
    [0, 50.5],
    { waitCrush: [0, 53] },
    [0, 55.8],
    [-6.5, 50],
    [-7, 44],
    { stomp: 2 },
    [-6.5, 28],
    { p: [-8, 30], jumpAt: 2.2 },
    { p: [-8, 30], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-40, 43],
    [-37.8, 41],
    [-40, 43.2],
    [-42.2, 41],
    [-40, 38.8],
    [-40, 38.4],
    { p: [-40, 37], jumpAt: 2.2 },
    { p: [-40, 37], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-5, 58.5],
    [0, 62],
  ];
  return L.done();
}

function driftingStones() {
  const L = build({ ...W2, id: 9, num: 3, name: "Drifting Stones" });
  L.island(0, 0, 8, 8, 2, { wob: 0.04 });
  L.island(0, 48, 8, 8, 8, { wob: 0.04, float: 6 });
  L.island(0, 84, 8, 8, 8, { wob: 0.04, float: 6 });
  L.island(12.6, 48, 3.2, 3.2, 15, { wob: 0.07, float: 4 });
  L.spawn(0, -4, 0);
  L.sign(2.4, -2, "Ride the drifting stones across the quicksand. Patience!", Math.PI);
  L.coinLine([0, -1], [0, 5], 3);
  L.mover(0, 2, 11.4, 3, 3, [0, 2, 20], 5);
  L.coinAir([0, 3, 13], [0, 3, 19], 3);
  L.plat(0, 2.5, 24.2, 2.6, 2.6);
  L.mover(-5, 3, 28.8, 3.2, 3.2, [5, 3, 28.8], 7);
  L.plat(0, 3.5, 33.4, 2.6, 2.6);
  L.coin(0, 3.35, 24.2).coin(0, 4.35, 33.4);
  L.mover(0, 3.5, 37.9, 3, 3, [0, 8, 37.9], 5);
  L.coinAir([0, 5, 37.9], [0, 8, 37.9], 2);
  L.enemy("flyer", 4, 26, { y: 3, fly: 2.4, radius: 2.5 });
  L.checkpoint(0, 43);
  L.coinRingG(0, 49, 2.6, 4);
  L.enemy("walker", -3, 51, { radius: 2 });
  // loop ride to the far isle
  L.loop(
    [
      [0, 8, 58],
      [7, 8, 62],
      [7, 8, 70],
      [0, 8, 74.2],
      [-7, 8, 70],
      [-7, 8, 62],
    ],
    3,
    3,
    3,
  );
  L.coinAir([7, 9, 63], [7, 9, 69], 3);
  L.enemy("flyer", -4, 66, { y: 8, fly: 2.2, radius: 2 });
  L.coinLine([0, 80], [0, 84], 2);
  L.goal(0, 87);
  L.deco("castle", 0, 91.5, { noCollide: true, s: 0.7 });
  // secret: big spring to the high sand-isle
  L.spring(5.4, 48, { power: 26 });
  L.star(12.6, 16.4, 48);
  L.coinG(12.6, 46).coinG(12.6, 50);
  L.deco("cactus", -5, -3, {});
  L.deco("cactus", -5, 46, { s: 0.8 });
  L.deco("column", -4, 87, { s: 0.6 });
  L.deco("pyramid", 0, 66, { s: 0.45, y: -4, noCollide: true });

  L.lv.route = [
    [0, 5],
    [0, 8.3],
    { waitPlat: [0, 11.4], near: [0, 11.4], r: 0.4 },
    { p: [0, 11.4], jumpAt: 9 },
    { ride: [0, 11.4], until: [0, 20], r: 0.4 },
    { p: [0, 24.2], jumpAt: 9 },
    [0, 24.2],
    [0, 25.2],
    { waitPlat: [-5, 28.8], near: [-2.6, 28.8], r: 0.4, dir: [1, 0] },
    { p: [0, 28.8], jumpAt: 9 },
    { ride: [-5, 28.8], until: [0, 28.8], r: 0.6 },
    { p: [0, 33.4], jumpAt: 9 },
    [0, 33.4],
    [0, 34.4],
    { waitPlat: [0, 37.9], near: [0, 37.9], r: 0.3 },
    { p: [0, 37.9], jumpAt: 9 },
    { ride: [0, 37.9], until: [0, 37.9], r: 0.1, timeout: 6 },
    { wait: 2.4 },
    { p: [0, 41.5], jumpAt: 9 },
    [0, 43],
    [2.6, 49],
    [0, 51.6],
    [-2.6, 49],
    [0, 46.4],
    [4.2, 48],
    { p: [5.4, 48], air: true, r: 0.7 },
    { p: [12.6, 48], r: 0.8, timeout: 5, sprint: true },
    [12.6, 46],
    [12.6, 50],
    [10.4, 48],
    { p: [7, 48], jumpAt: 9 },
    { stomp: 1 },
    [0, 54.6],
    { waitPlat: [0, 58], near: [0, 58], r: 0.5 },
    { p: [0, 58], jumpAt: 9 },
    { ride: [0, 58], until: [0, 74.2], r: 0.5, timeout: 30 },
    { p: [0, 77], jumpAt: 9 },
    [0, 80],
    [0, 87],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 2-4 CANNON CANYON */
function cannonCanyon() {
  const L = build({ ...W2, id: 10, num: 4, name: "Cannon Canyon" });
  L.island(0, 0, 9, 9, 1, { wob: 0.03 });
  L.island(0, 40, 6, 28, 1, { wob: 0.02, p: 3 });
  L.island(0, 90, 9, 9, 3.4, { wob: 0.03 });
  L.spawn(0, -4, 0);
  L.sign(2.6, -2, "Cannons fire across the canyon. Watch their rhythm — or stomp the cannonballs!", Math.PI);
  L.coinLine([0, -1], [0, 7], 3);
  L.plat(0, 1, 10.6, 3, 2.6);
  // side cliffs with cannons
  L.island(-11, 30, 4, 18, 4, { wob: 0.04 });
  L.island(11, 46, 4, 18, 4, { wob: 0.04 });
  L.hazard("cannon", { x: -9, y: 4, z: 20, yaw: Math.PI / 2, every: 3, range: 20 });
  L.hazard("cannon", { x: 9, y: 4, z: 34, yaw: -Math.PI / 2, every: 3, phase: 1.5, range: 20 });
  L.hazard("cannon", { x: -9, y: 4, z: 44, yaw: Math.PI / 2, every: 3, phase: 0.8, range: 20 });
  L.hazard("cannon", { x: 9, y: 4, z: 56, yaw: -Math.PI / 2, every: 3, phase: 2.2, range: 20 });
  L.checkpoint(0, 15);
  L.coinLine([0, 18], [0, 60], 8);
  L.enemy("armored", 0, 30, { radius: 3 });
  L.enemy("fast", 0, 50, { radius: 3 });
  L.enemy("flyer", -3, 64, { y: 1, fly: 3, radius: 2 });
  // blinking slabs, or crumbling ones on the right
  L.blinker(0, 1.2, 71.2, 2.6, 2.6, 4, 0, { on: 0.65 });
  L.blinker(0, 2, 75, 2.6, 2.6, 4, 0.35, { on: 0.65 });
  L.blinker(0, 2.8, 78.8, 2.6, 2.6, 4, 0.7, { on: 0.65 });
  L.faller(5, 1.2, 71.2, 2.2, 2.2);
  L.faller(5, 2, 75, 2.2, 2.2);
  L.faller(5, 2.8, 78.8, 2.2, 2.2);
  L.coin(0, 2.05, 71.2).coin(0, 2.85, 75).coin(0, 3.65, 78.8);
  L.goal(0, 93);
  L.deco("castle", 0, 97.5, { noCollide: true, s: 0.75 });
  // secret: a spring up the right cliff, then a crumbling bridge to the star
  L.spring(3.4, 40, { power: 22 });
  L.faller(11, 4, 40.5, 2.2, 2.2);
  L.pillar(11, 37.2, 6.5, 2, { shape: "cyl" });
  L.star(11, 7.9, 37.2);
  L.coin(11, 4.85, 40.5);
  for (const z of [10, 26, 40, 60]) L.deco("cactus", -12, z, { s: 0.9 });
  for (const z of [32, 50]) L.deco("column", 12.5, z, { s: 0.8 });

  L.lv.route = [
    [0, 7],
    { p: [0, 10.6], jumpAt: 3.4 },
    [0, 10.6],
    { p: [0, 14], jumpAt: 9 },
    [0, 15],
    [0, 26],
    { stomp: 0 },
    { stomp: 0 },
    [2, 40],
    { p: [3.4, 40], air: true, r: 0.7 },
    { p: [11, 40.5], r: 0.9, timeout: 5 },
    { p: [11, 37.2], jumpAt: 9 },
    [11, 37.2],
    { wait: 0.4 },
    [9.6, 43],
    { p: [2, 46], jumpAt: 9 },
    [0, 46],
    { stomp: 1, jumpAt: 2.2 },
    [0, 66.5],
    { waitOn: [0, 71.2] },
    { p: [0, 71.2], jumpAt: 9 },
    [0, 71.2],
    { waitOn: [0, 75] },
    { p: [0, 75], jumpAt: 9 },
    [0, 75],
    { waitOn: [0, 78.8] },
    { p: [0, 78.8], jumpAt: 9 },
    [0, 78.8],
    { p: [0, 82.5], jumpAt: 9 },
    [0, 82.5],
    [0, 93],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 2-5 SUN TEMPLE */
function sunTemple() {
  const L = build({ ...W2, id: 11, num: 5, name: "Sun Temple" });
  L.island(0, 0, 12, 12, 0, { wob: 0.03 });
  L.island(0, 20, 10, 8, 3, { wob: 0.02, p: 3 });
  L.island(0, 34, 8, 6, 7, { wob: 0.02, p: 3 });
  L.island(0, 46, 6, 5, 11, { wob: 0.02, p: 3 });
  L.island(0, 56, 5, 5, 15, { wob: 0.02, p: 3 });
  L.island(-26, 4, 5, 5, 4, { wob: 0.06, float: 5 });
  L.spawn(0, -7, 0);
  L.sign(2.6, -5, "Climb the Sun Temple! Ride lifts, bounce springs, and dodge the stone crushers.", Math.PI);
  L.coinLine([0, -3], [0, 6], 4);
  L.enemy("walker", 6, 2, { radius: 2.5 });
  L.plat(-3, 1.5, 9.6, 2.6, 2.4);
  L.coin(-3, 2.35, 9.6);
  // tier 1
  L.checkpoint(0, 15.5);
  L.enemy("armored", 4, 20, { radius: 2 });
  L.coinRingG(-4, 20, 1.8, 3);
  L.spring(3, 25.4, { power: 20 });
  L.mover(-4, 3.1, 25.4, 2.8, 2.8, [-4, 7.2, 25.4], 4.5);
  // tier 2: crushers
  L.hazard("crusher", { x: 0, y: 7, z: 33, size: 2.4, rise: 4, wait: 1.6 });
  L.hazard("crusher", { x: -3.4, y: 7, z: 35.6, size: 2.4, rise: 4, wait: 1.6, phase: 1.2 });
  L.coin(0, 7.85, 31).coin(-3.4, 7.85, 37.8);
  L.plat(-2, 8.4, 38.6, 2.4, 2);
  L.plat(1, 9.8, 39.6, 2.4, 2);
  // tier 3: firebar
  L.hazard("firebar", { x: 0, y: 11.6, z: 46, n: 5, rate: 1.3 });
  L.coinRingG(0, 46, 3.6, 4);
  L.enemy("flyer", -4, 44, { y: 11, fly: 2.6, radius: 1.8 });
  L.mover(3.4, 11.1, 49.4, 2.6, 2.6, [3.4, 15.2, 49.4], 4.5);
  // summit
  L.goal(0, 57.5);
  L.coinLine([-2, 54.4], [2, 54.4], 2);
  // secret: pipe to the sky-shrine
  L.pipe(-9, -3, 1.6, 1);
  L.pipe(-26, 1.6, 1.4, 2, { secret: true });
  L.pipe(8.5, 18.5, 1.4, null, { y: 3 });
  L.star(-26, 5.5, 6.5);
  L.coinG(-28, 4).coinG(-24, 4);
  L.deco("column", 9, 9, { s: 0.7 });
  L.deco("column", -9, 9, { s: 0.7 });
  L.deco("column", 6.5, 34, { s: 0.5 });
  L.deco("column", -6.5, 34, { s: 0.5 });
  L.scatter("cactus", 5, 0, 0, 11, 11, { avoid: [[0, 0, 4]] });

  L.lv.route = [
    [0, 6],
    { stomp: 0 },
    [-3, 7.2],
    { p: [-3, 9.6], jumpAt: 9 },
    [-3, 9.6],
    { p: [-3, 6.8], jumpAt: 9 },
    [-9, -5],
    { p: [-9, -3], jumpAt: 2.2 },
    { p: [-9, -3], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-26, 6.5],
    [-28, 4],
    [-24, 4],
    [-26, 3.2],
    { p: [-26, 1.6], jumpAt: 2.2 },
    { p: [-26, 1.6], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [7, 18],
    [-2.2, 20],
    [-4, 21.8],
    [-5.8, 20],
    [-4.9, 18.4],
    [1.5, 22.8],
    { p: [3, 25.4], air: true, r: 0.7 },
    { p: [2, 31], r: 1, timeout: 5 },
    [2.2, 31.4],
    [2.2, 36.4],
    [-1.2, 36.8],
    { p: [-2, 38.6], jumpAt: 9 },
    [-2, 38.6],
    { p: [1, 39.6], jumpAt: 9 },
    [1, 39.6],
    { p: [1.6, 42.6], jumpAt: 9 },
    [1.6, 42.6],
    [4.6, 44],
    [4.6, 47.4],
    { waitPlat: [3.4, 49.4], near: [3.4, 49.4], r: 0.2, topBelow: 11.4 },
    { p: [3.4, 49.4], jumpAt: 9 },
    [3.4, 49.4],
    { waitPlat: [3.4, 49.4], near: [3.4, 49.4], r: 0.2, topAbove: 15 },
    { p: [2, 52.6], jumpAt: 9 },
    [2, 54.4],
    [-2, 54.4],
    [0, 57.5],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 2-6 TOMB SCARAB'S PIT (boss) */
function scarabPit() {
  const L = build({ ...W2, id: 12, num: 6, name: "Tomb Scarab's Pit", coinGoal: 12, boss: { kind: "tombScarab", x: 0, y: 1, z: 42, cx: 0, cz: 34, R: 15 } });
  L.island(0, 0, 9, 9, 0, { wob: 0.04 });
  L.island(0, 34, 16, 16, 1, { wob: 0.02, p: 2 });
  L.spawn(0, -4, 0);
  L.sign(2.5, -2, "The Tomb Scarab burrows under the sand. When it bursts out, it flips over — stomp its belly!", Math.PI);
  L.coinLine([0, 0], [0, 6], 4);
  L.qblock(-2.5, 2.7, 4, "heart");
  L.plat(0, 0.6, 12, 3, 3);
  L.plat(0, 0.8, 15.6, 3, 3);
  L.coin(0, 1.45, 12).coin(0, 1.65, 15.6);
  L.checkpoint(0, 20.5);
  for (const a of [0.785, 2.356, 3.927, 5.498]) L.deco("column", Math.cos(a) * 13.5, 34 + Math.sin(a) * 13.5, { s: 0.9 });
  L.coinRingG(0, 34, 11, 8);
  L.spring(12.5, 34, { power: 27 });
  L.island(19.6, 34, 3.2, 3.2, 9, { wob: 0.08, float: 4 });
  L.star(19.6, 10.4, 34);
  L.coinG(19.6, 32).coinG(19.6, 36);
  L.goal(0, 34, 1, 7);
  L.deco("pyramid", 0, 60, { s: 1, y: -4, noCollide: true });
  L.scatter("cactus", 4, 0, 0, 8, 8, { avoid: [[0, 0, 3]] });
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

export const WORLD2 = [duneRoad, ancientRuins, driftingStones, cannonCanyon, sunTemple, scarabPit];
