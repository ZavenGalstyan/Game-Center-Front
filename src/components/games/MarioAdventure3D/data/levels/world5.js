/**
 * Mario Adventure 3D — World 5: LAVA KINGDOM.
 * Basalt isles over a lava sea (a dip costs a heart and bounces you up),
 * geysers, fire bars, crushers, cannon batteries — and the Magma King.
 */
import { build } from "../kit.js";

const W5 = { world: 5, theme: "lava", sea: { kind: "lava", y: -1 }, killY: -20, platStyle: "basalt", surf: "stone" };

/* ------------------------------------------------------------------ 5-1 VOLCANO PATH */
function volcanoPath() {
  const L = build({ ...W5, id: 25, num: 1, name: "Volcano Path" });
  L.island(0, 0, 9, 9, 1.5, { wob: 0.02 });
  L.island(0, 24, 8, 10, 2, { wob: 0.02 });
  L.island(0, 50, 8, 8, 2.5, { wob: 0.02 });
  L.island(0, 76, 9, 9, 3, { wob: 0.02 });
  L.island(13, 50, 3, 3, 4.5, { wob: 0.05, float: 4 });
  L.spawn(0, -4, 0);
  L.sign(2.4, -2, "The Lava Kingdom. A dip in the lava burns — and bounces you right back up. Steer to safety!", Math.PI);
  L.coinLine([0, -1], [0, 6], 3);
  L.enemy("walker", 4, 2, { radius: 2 });
  L.plat(0, 1.7, 11, 2.6, 2.4);
  L.plat(0, 1.9, 13.4, 2.6, 2.4);
  L.coin(0, 2.55, 11).coin(0, 2.75, 13.4);
  // geysers on the second isle
  L.hazard("geyser", { x: 0, y: 2, z: 20, period: 4 });
  L.hazard("geyser", { x: -2.6, y: 2, z: 27, period: 4, phase: 2 });
  L.coinLine([2.6, 18], [2.6, 30], 4);
  L.enemy("jumper", 3, 24);
  // crumbling rock bridge
  L.faller(0, 2.1, 35.6, 2.2, 2.2);
  L.faller(0, 2.3, 38, 2.2, 2.2);
  L.faller(0, 2.5, 40.4, 2.2, 2.2);
  L.coinAir([0, 3.2, 35.6], [0, 3.6, 40.4], 3);
  // third isle
  L.checkpoint(0, 44);
  L.hazard("firebar", { x: 0, y: 3.1, z: 52, n: 4, rate: 1.4 });
  L.enemy("armored", -4, 53, { radius: 1.6 });
  L.enemy("flyer", 3, 56, { fly: 2.6, radius: 2 });
  L.coinRingG(0, 52, 4.2, 4);
  // lift over the lava river
  L.mover(0, 2.6, 60.6, 3, 3, [0, 2.8, 64.8], 5);
  L.coin(0, 3.6, 62.7);
  L.goal(0, 80);
  L.coinLine([-2, 72], [2, 72], 2);
  L.deco("castle", 0, 85.5, { noCollide: true, s: 0.8 });
  // secret: a spring to a smoking perch
  L.spring(5.4, 50, { power: 22 });
  L.star(13, 6, 50);
  L.coinG(13, 48.6).coinG(13, 51.4);
  for (const [x, z] of [
    [-6, -3],
    [6, -5],
    [-6, 24],
    [5, 40.5],
    [-6, 78],
    [6, 74],
  ])
    L.deco(x < 0 ? "deadTree" : "lavaRock", x, z, { s: 0.9 });
  L.deco("torch", -2.5, 9, {});
  L.deco("torch", 2.5, 9, {});

  L.lv.route = [
    [0, 6],
    { stomp: 0 },
    [0, 8.4],
    { p: [0, 11], jumpAt: 9 },
    [0, 11],
    [0, 13.4],
    [0, 15.6],
    [2.6, 16.6],
    { waitSafe: [2.6, 30.4], sprint: true },
    { p: [2.6, 30.4], sprint: true, r: 0.7 },
    { stomp: 1 },
    [0, 33.2],
    { p: [0, 35.6], jumpAt: 9 },
    { p: [0, 38], jumpAt: 9, timeout: 2 },
    { p: [0, 40.4], jumpAt: 9, timeout: 2 },
    { p: [0, 43], jumpAt: 9, timeout: 2 },
    [0, 44],
    [4.2, 47],
    { p: [5.4, 50], air: true, r: 0.7 },
    { p: [13, 50], r: 0.8, timeout: 5, sprint: true },
    [13, 48.6],
    [13, 51.4],
    [11.4, 50],
    { p: [6.4, 50], jumpAt: 9 },
    [6.2, 50.4],
    [4.4, 54.6],
    { waitSafe: [0, 57.4] },
    [0, 57.4],
    { waitPlat: [0, 60.6], near: [0, 60.6], r: 0.4 },
    { p: [0, 60.6], jumpAt: 9 },
    { ride: [0, 60.6], until: [0, 64.8], r: 0.4 },
    { p: [0, 68.4], jumpAt: 9 },
    [-2, 72],
    [2, 72],
    [0, 80],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 5-2 FIRE BAR FORTRESS */
function fireBarFortress() {
  const L = build({ ...W5, id: 26, num: 2, name: "Fire Bar Fortress", platStyle: "castle" });
  L.island(0, -2, 8, 8, 2, { wob: 0.02 });
  L.island(0, 34, 6, 30, 2, { wob: 0.01, p: 4 });
  L.island(0, 76, 8, 8, 2, { wob: 0.02 });
  L.island(-20, 30, 4, 4, 3, { wob: 0.05, float: 4 });
  L.spawn(0, -6, 0);
  L.sign(2.4, -4, "Fire Bar Fortress. Wait for the bar to swing past — then sprint!", Math.PI);
  L.coinLine([0, -3], [0, 3], 3);
  // corridor walls
  L.wall(-4.6, 4.5, 34, 0.6, 2.5, 28, { style: "castle" });
  L.wall(4.6, 4.5, 34, 0.6, 2.5, 28, { style: "castle" });
  L.checkpoint(0, 7.5);
  L.hazard("firebar", { x: 0, y: 2.6, z: 14, n: 7, rate: 1.5 });
  L.hazard("firebar", { x: 0, y: 2.6, z: 25, n: 7, rate: -1.4, angle: 1.2 });
  L.hazard("firebar", { x: 0, y: 2.6, z: 36, n: 5, rate: 1.3, double: true });
  L.coinLine([3, 18], [3, 21], 2);
  L.coinLine([-3, 29], [-3, 32], 2);
  L.enemy("walker", 0, 19.8, { radius: 1.4 });
  L.enemy("walker", 0, 30.6, { radius: 1.4 });
  L.checkpoint(0, 42);
  // crusher hall
  L.hazard("crusher", { x: 0, y: 2, z: 48, size: 3, rise: 4, wait: 1.6 });
  L.hazard("crusher", { x: 0, y: 2, z: 53.4, size: 3, rise: 4, wait: 1.6, phase: 1.3 });
  L.coin(0, 2.85, 50.7).coin(0, 2.85, 56.2);
  L.enemy("armored", 0, 60, { radius: 1.4 });
  L.hazard("cannon", { x: -2.8, y: 2, z: 62.5, yaw: Math.PI, every: 3.6, range: 18 });
  // out of the fortress, over the moat
  L.faller(0, 2, 66.6, 2.6, 2.4, { style: "castle" });
  L.goal(0, 78);
  L.coinLine([-2, 71], [2, 71], 2);
  L.deco("castle", 0, 84.5, { noCollide: true, s: 0.85 });
  // secret: pipe in the hall to the treasury isle
  L.pipe(3, 44, 1.2, 2);
  L.pipe(-3, 74, 1.2, null);
  L.pipe(-21.8, 28, 1.2, 1, { secret: true });
  L.star(-20, 4.4, 32.2);
  L.coinRingG(-19.4, 30.6, 1.8, 3);
  for (const z of [8, 40, 64]) {
    L.deco("torch", -3.6, z, {});
    L.deco("torch", 3.6, z, {});
  }

  L.lv.route = [
    [0, 3],
    [0, 7.5],
    [0, 9.6],
    { waitSafe: [0, 18.6], sprint: true },
    { p: [0, 18.6], sprint: true, r: 0.7 },
    { stomp: 0 },
    [3, 18],
    [3, 21],
    [0, 20.4],
    { waitSafe: [0, 29.6], sprint: true },
    { p: [0, 29.6], sprint: true, r: 0.7 },
    { stomp: 1 },
    [-3, 29],
    [-3, 32],
    [2.6, 31],
    { waitSafe: [2.6, 41], sprint: true, timeout: 20 },
    { p: [2.6, 41], sprint: true, r: 0.7 },
    [0, 42],
    [2, 43],
    { p: [3, 44], jumpAt: 2 },
    { p: [3, 44], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-20, 32.2],
    [-17.6, 30.6],
    [-20.3, 32.2],
    [-20.3, 29],
    [-19.6, 27.4],
    { p: [-21.8, 28], jumpAt: 2.2 },
    { p: [-21.8, 28], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-2, 71],
    [2, 71],
    [0, 78],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 5-3 MAGMA RIVERS */
function magmaRivers() {
  const L = build({ ...W5, id: 27, num: 3, name: "Magma Rivers" });
  L.island(0, 0, 8, 8, 2, { wob: 0.02 });
  L.island(0, 40, 7, 7, 3, { wob: 0.02 });
  L.island(0, 80, 8, 8, 3.5, { wob: 0.02 });
  L.island(16, 40, 3, 3, 5, { wob: 0.05, float: 4 });
  L.spawn(0, -4, 0);
  L.coinLine([0, -1], [0, 5], 3);
  L.enemy("walker", -4, 2, { radius: 2 });
  // rafts down the first river
  L.mover(0, 2, 11, 3, 3, [0, 2.2, 17], 5);
  L.mover(-3, 2.4, 22, 3, 3, [3, 2.6, 26], 5, { phase: 1.2 });
  L.coinAir([0, 3, 12], [0, 3, 16], 3);
  L.plat(0, 2.3, 19.6, 2.4, 2.4);
  L.enemy("jumper", -5, -3);
  L.plat(0, 2.8, 30.2, 2.8, 2.8);
  L.checkpoint(0, 34.5);
  L.enemy("jumper", 3, 41);
  L.coinRingG(0, 41, 2.6, 4);
  // blinking slabs and a spinning bar
  L.blinker(0, 3, 50.2, 2.6, 2.6, 4, 0, { on: 0.65 });
  L.blinker(0, 3.2, 53.8, 2.6, 2.6, 4, 0.35, { on: 0.65 });
  L.coin(0, 3.85, 50.2).coin(0, 4.05, 53.8);
  L.bar(0, 3.3, 60.6, 7.4, 1.8, 0.6);
  L.coinAir([0, 4.4, 58], [0, 4.4, 63.2], 2);
  L.plat(0, 3.5, 66.8, 2.8, 2.8);
  L.enemy("armored", 2, 82, { radius: 2 });
  L.goal(0, 84);
  L.coinLine([-2, 76], [2, 76], 2);
  // secret: a raft east to a cinder perch
  L.mover(8.6, 3.2, 40, 2.8, 2.8, [11.6, 5, 40], 4.5);
  L.star(16, 6.4, 40);
  L.coinG(16, 38.6).coinG(16, 41.4);
  L.deco("deadTree", -5, -4, {});
  L.deco("lavaRock", 5, 3, {});
  L.deco("deadTree", 5, 82, {});

  L.lv.route = [
    [0, 5],
    { stomp: 0 },
    { stomp: 1 },
    [0, 7.4],
    { waitPlat: [0, 11], near: [0, 11], r: 0.4 },
    { p: [0, 11], jumpAt: 9 },
    { ride: [0, 11], until: [0, 17], r: 0.4 },
    { p: [0, 19.6], jumpAt: 9 },
    [0, 19.6],
    { waitPlat: [-3, 22], near: [-1.4, 23.1], r: 0.5, dir: [1, 0.6] },
    { p: [-0.8, 22.6], jumpAt: 9 },
    { ride: [-3, 22], until: [3, 26], r: 0.5, timeout: 6 },
    { p: [0, 30.2], jumpAt: 9 },
    [0, 30.2],
    { p: [0, 33.6], jumpAt: 9 },
    [0, 34.5],
    { stomp: 2 },
    [2.6, 41],
    [0, 43.6],
    [-2.6, 41],
    [6, 40],
    { waitPlat: [8.6, 40], near: [8.6, 40], r: 0.3 },
    { p: [8.6, 40], jumpAt: 9 },
    { ride: [8.6, 40], until: [11.6, 40], r: 0.2, timeout: 6 },
    { p: [14.2, 40], jumpAt: 9 },
    [16, 40],
    [16, 38.6],
    [16, 41.4],
    [14.4, 40],
    { waitPlat: [8.6, 40], near: [11.6, 40], r: 0.3 },
    { p: [11.6, 40], jumpAt: 9 },
    { ride: [8.6, 40], until: [8.6, 40], r: 0.2, timeout: 6 },
    { p: [5.6, 40], jumpAt: 9 },
    [0, 46.6],
    { waitOn: [0, 50.2] },
    { p: [0, 50.2], jumpAt: 9 },
    [0, 50.2],
    { waitOn: [0, 53.8] },
    { p: [0, 53.8], jumpAt: 9 },
    [0, 53.8],
    { waitAlign: [0, 60.6], at: -0.12, tol: 0.08 },
    { p: [0, 57.6], jumpAt: 9 },
    { p: [0, 60.6], sprint: true, r: 0.8 },
    { p: [0, 63.6], sprint: true, r: 0.8 },
    { p: [0, 66.8], jumpAt: 9 },
    [0, 66.8],
    { p: [0, 72.4], jumpAt: 9, jump: 2, dj: 0.3 },
    [0, 73],
    [-2, 76],
    [2, 76],
    [0, 84],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 5-4 ASH CANNONS */
function ashCannons() {
  const L = build({ ...W5, id: 28, num: 4, name: "Ash Cannons" });
  L.island(0, 0, 8, 8, 2, { wob: 0.02 });
  L.island(0, 32, 12, 20, 2.5, { wob: 0.02 });
  L.island(0, 72, 8, 8, 3, { wob: 0.02 });
  L.island(-24, 32, 3.4, 3.4, 4, { wob: 0.05, float: 4 });
  L.spawn(0, -4, 0);
  L.sign(2.4, -2, "Cannon batteries ahead! Their cannonballs can be stomped for a big bounce.", Math.PI);
  L.coinLine([0, -1], [0, 5], 3);
  L.plat(0, 2.2, 10.2, 2.6, 2.4);
  // the battlefield
  L.checkpoint(0, 14);
  L.hazard("cannon", { x: -10, y: 2.5, z: 20, yaw: Math.PI / 2, every: 3, range: 22 });
  L.hazard("cannon", { x: 10, y: 2.5, z: 28, yaw: -Math.PI / 2, every: 3, phase: 1.5, range: 22 });
  L.hazard("cannon", { x: -10, y: 2.5, z: 36, yaw: Math.PI / 2, every: 3, phase: 0.8, range: 22 });
  L.hazard("cannon", { x: 10, y: 2.5, z: 44, yaw: -Math.PI / 2, every: 3, phase: 2.2, range: 22 });
  L.hazard("geyser", { x: -4, y: 2.5, z: 32, period: 5 });
  L.hazard("geyser", { x: 4, y: 2.5, z: 40, period: 5, phase: 2.5 });
  L.coinLine([0, 18], [0, 48], 7);
  L.enemy("fast", 0, 24, { radius: 3 });
  L.enemy("armored", 0, 40, { radius: 3 });
  L.enemy("walker", -5, 46, { radius: 2 });
  // spinning disc to the gate
  L.disc(0, 2.8, 55.6, 2.8, 0.8);
  L.coin(0, 3.65, 55.6);
  L.plat(0, 3, 60.4, 2.6, 2.4);
  L.goal(0, 75);
  L.coinLine([-2, 67], [2, 67], 2);
  L.deco("castle", 0, 80.5, { noCollide: true, s: 0.8 });
  // secret: pipe behind the west battery
  L.pipe(-10, 26, 1.2, 2);
  L.pipe(5, 70, 1.2, null);
  L.pipe(-24, 29.6, 1.2, 1, { secret: true });
  L.star(-24, 5.4, 34);
  L.coinG(-25.6, 32).coinG(-22.4, 32);
  for (const [x, z] of [
    [-10, 12],
    [10, 14],
    [-9, 50],
    [9, 50],
  ])
    L.deco("lavaRock", x, z, { s: 1 });

  L.lv.route = [
    [0, 5],
    [0, 7.8],
    { p: [0, 10.2], jumpAt: 9 },
    [0, 10.2],
    { p: [0, 13], jumpAt: 9 },
    [0, 14],
    { stomp: 0, jumpAt: 2.2 },
    { p: [0, 48], sprint: true, r: 0.7 },
    [-7, 46],
    [-8, 24],
    { p: [-10, 26], jumpAt: 2 },
    { p: [-10, 26], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-24, 34],
    [-25.6, 32],
    [-22.4, 32],
    [-24, 31],
    { p: [-24, 29.6], jumpAt: 2 },
    { p: [-24, 29.6], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-2, 67],
    [2, 67],
    [0, 75],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 5-5 CASTLE APPROACH */
function castleApproach() {
  const L = build({ ...W5, id: 29, num: 5, name: "Castle Approach", platStyle: "castle" });
  L.island(0, 0, 8, 8, 2, { wob: 0.02 });
  L.island(0, 29, 7, 12, 3, { wob: 0.02, p: 3 });
  L.island(0, 66, 7, 12, 4, { wob: 0.02, p: 3 });
  L.island(0, 100, 9, 9, 5, { wob: 0.02 });
  L.island(17, 66, 3.2, 3.2, 6, { wob: 0.05, float: 4 });
  L.spawn(0, -4, 0);
  L.sign(2.4, -2, "The Magma King's castle is close. Everything you've learned — all at once!", Math.PI);
  L.coinLine([0, -1], [0, 5], 3);
  // fallers into the first ward
  L.faller(0, 2.2, 10.2, 2.4, 2.4, { style: "castle" });
  L.faller(0, 2.4, 12.8, 2.4, 2.4, { style: "castle" });
  L.faller(0, 2.6, 15.4, 2.4, 2.4, { style: "castle" });
  L.coin(0, 3.05, 10.2).coin(0, 3.45, 15.4);
  // first ward: geysers + a fire bar
  L.checkpoint(0, 20);
  L.hazard("geyser", { x: -2, y: 3, z: 26, period: 4 });
  L.hazard("firebar", { x: 0, y: 3.6, z: 33, n: 5, rate: 1.5 });
  L.hazard("geyser", { x: 2, y: 3, z: 38, period: 4, phase: 2 });
  L.coinLine([3, 24], [3, 30], 3);
  L.enemy("walker", 0, 38, { radius: 1.6 });
  L.enemy("flyer", -4, 98, { y: 5, fly: 2.6, radius: 2 });
  // blink bridge
  L.blinker(0, 3.3, 45, 2.6, 2.6, 4, 0, { on: 0.65 });
  L.blinker(0, 3.6, 48.4, 2.6, 2.6, 4, 0.35, { on: 0.65 });
  L.blinker(0, 3.9, 51.8, 2.6, 2.6, 4, 0.7, { on: 0.65 });
  L.coin(0, 4.15, 45).coin(0, 4.45, 48.4).coin(0, 4.75, 51.8);
  // second ward: crushers + cannon
  L.checkpoint(0, 56);
  L.hazard("crusher", { x: 0, y: 4, z: 62, size: 3, rise: 4, wait: 1.6 });
  L.hazard("crusher", { x: 0, y: 4, z: 68, size: 3, rise: 4, wait: 1.6, phase: 1.2 });
  L.hazard("cannon", { x: -5, y: 4, z: 74, yaw: Math.PI / 2, every: 3.2, range: 12 });
  L.coin(0, 4.85, 65).coin(0, 4.85, 71);
  L.enemy("fast", 0, 75, { radius: 1.6 });
  // spinning bar to the gate
  L.bar(0, 4.3, 81.6, 7.4, 1.8, 0.6, { style: "castle" });
  L.plat(0, 4.8, 88, 2.6, 2.4);
  L.goal(0, 102);
  L.coinLine([-2, 95], [2, 95], 2);
  L.deco("castle", 0, 108, { noCollide: true, s: 1 });
  // secret: lift east to a watchtower perch
  L.mover(8.4, 4.1, 66, 2.6, 2.6, [12.4, 6.1, 66], 5);
  L.star(17, 7.4, 66);
  L.coinG(17, 64.6).coinG(17, 67.4);
  for (const z of [20, 56, 92]) {
    L.deco("torch", -3, z, {});
    L.deco("torch", 3, z, {});
  }

  L.lv.route = [
    [0, 5],
    [0, 7.6],
    { p: [0, 10.2], jumpAt: 9 },
    [0, 10.2],
    { p: [0, 12.8], jumpAt: 9 },
    [0, 12.8],
    { p: [0, 15.4], jumpAt: 9 },
    [0, 15.4],
    { p: [0, 18.4], jumpAt: 9 },
    [0, 20],
    [3, 22],
    { waitSafe: [3, 30], sprint: true },
    { p: [3, 30], sprint: true, r: 0.7 },
    [3.6, 33],
    { waitSafe: [3, 38.6], sprint: true },
    { p: [3, 38.6], sprint: true, r: 0.7 },
    { stomp: 0 },
    [0, 40.2],
    { waitOn: [0, 45] },
    { p: [0, 45], jumpAt: 9 },
    [0, 45],
    { waitOn: [0, 48.4] },
    { p: [0, 48.4], jumpAt: 9 },
    [0, 48.4],
    { waitOn: [0, 51.8] },
    { p: [0, 51.8], jumpAt: 9 },
    [0, 51.8],
    { p: [0, 55], jumpAt: 9 },
    [0, 56],
    [5.2, 66],
    { waitPlat: [8.4, 66], near: [8.4, 66], r: 0.3 },
    { p: [8.4, 66], jumpAt: 9 },
    { ride: [8.4, 66], until: [12.4, 66], r: 0.3, timeout: 6 },
    { p: [15.2, 66], jumpAt: 9 },
    [17, 66],
    [17, 64.6],
    [17, 67.4],
    [15.4, 66],
    { waitPlat: [8.4, 66], near: [12.4, 66], r: 0.3 },
    { p: [12.4, 66], jumpAt: 9 },
    { ride: [8.4, 66], until: [8.4, 66], r: 0.3, timeout: 6 },
    { p: [5, 66], jumpAt: 9 },
    [3.6, 58.6],
    { waitCrush: [0, 62] },
    [0, 65],
    { waitCrush: [0, 68] },
    [0, 71.6],
    { stomp: 2, jumpAt: 2.2 },
    [0, 77],
    { waitAlign: [0, 81.6], at: -0.12, tol: 0.08 },
    { p: [0, 81.6], sprint: true, r: 0.8 },
    { p: [0, 84.6], sprint: true, r: 0.8 },
    { p: [0, 88], jumpAt: 9 },
    [0, 88],
    { p: [0, 92], jumpAt: 9 },
    [-2, 95],
    [2, 95],
    [0, 102],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 5-6 MAGMA KING'S CASTLE (final boss) */
function magmaCastle() {
  const L = build({ ...W5, id: 30, num: 6, name: "Magma King's Castle", coinGoal: 12, platStyle: "castle", boss: { kind: "magmaKing", x: 0, y: 2, z: 42, cx: 0, cz: 34, R: 15 } });
  L.island(0, 0, 9, 9, 1.5, { wob: 0.02 });
  L.island(0, 34, 17, 17, 2, { wob: 0.01, p: 2 });
  L.spawn(0, -4, 0);
  L.sign(2.5, -2, "The Magma King! After every slam he slumps, panting — that's when to stomp. Five hits to save the kingdoms!", Math.PI);
  L.coinLine([0, 0], [0, 6], 4);
  L.qblock(-2.5, 4.2, 4, "heart");
  L.qblock(2.5, 4.2, 4, "heart");
  L.plat(0, 1.9, 12, 3, 3);
  L.plat(0, 2, 15.6, 3, 3);
  L.coin(0, 2.75, 12).coin(0, 2.85, 15.6);
  L.checkpoint(0, 20.5);
  for (const a of [0.785, 2.356, 3.927, 5.498]) L.deco("torch", Math.cos(a) * 14, 34 + Math.sin(a) * 14, {});
  L.coinRingG(0, 34, 11, 8);
  L.spring(-12.5, 34, { power: 27 });
  L.island(-19.6, 34, 3.2, 3.2, 10, { wob: 0.05, float: 4 });
  L.star(-19.6, 11.4, 34);
  L.coinG(-19.6, 32).coinG(-19.6, 36);
  L.goal(0, 34, 2, 7);
  L.deco("castle", 0, 56, { noCollide: true, s: 1.4 });
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
    { boss: true, timeout: 200 },
    [-8.8, 34],
    { p: [-12.5, 34], air: true, r: 0.7 },
    { p: [-19.6, 34], r: 0.8, timeout: 5 },
    [-19.6, 32],
    [-19.6, 36],
    [-17.4, 34],
    { p: [-14, 34], jumpAt: 9 },
    [-12.5, 30],
    [0, 34],
  ];
  return L.done();
}

export const WORLD5 = [volcanoPath, fireBarFortress, magmaRivers, ashCannons, castleApproach, magmaCastle];
