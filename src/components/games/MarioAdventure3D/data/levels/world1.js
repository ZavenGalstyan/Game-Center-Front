/**
 * Mario Adventure 3D — World 1: GREEN KINGDOM.
 * Grass, flowers, hills, trees and warp pipes. Gentle difficulty: wide
 * platforms, slow movers, walkers and hoppers.
 */
import { build } from "../kit.js";

const W1 = { world: 1, theme: "green", sea: { kind: "water", y: -3 }, killY: -14, platStyle: "grass" };

/* ------------------------------------------------------------------ 1-1 GREEN HILLS */
function greenHills() {
  const L = build({ ...W1, id: 1, num: 1, name: "Green Hills", coinGoal: 15 });
  // main meadow, the far meadow, the goal plateau and a floating secret isle
  L.island(0, 20, 20, 30, 0, { wob: 0.03 });
  L.island(0, 76, 17, 14, 1, { wob: 0.03 });
  L.island(0, 102, 12, 12, 4.5, { wob: 0.03 });
  L.island(-60, 60, 7.5, 7.5, 20, { wob: 0.06, float: 8 });
  L.hill(0, -3, 8, 2.2, { flat: 0.35 });
  L.hill(-11, 14, 7, 3.2, { flat: 0.2 });
  L.hill(12, 27, 7, 2.5, { flat: 0.45 });
  L.hill(-6, 40, 6, 1.8);
  L.hill(6, 79, 5, 1.2);

  L.spawn(0, -3, 0);
  L.sign(2.6, 0.5, "Welcome to the Green Kingdom! WASD to run (hold SHIFT to sprint), move the mouse to look around. SPACE jumps — press it again in mid-air for a double jump!", Math.PI);
  L.coinLine([0, 1.5], [0, 9.5], 5);

  // the first ? blocks
  L.brick(-2.2, 2.7, 14);
  L.qblock(0, 2.7, 14, "speed");
  L.brick(2.2, 2.7, 14);
  L.enemy("walker", 0, 22, { radius: 3 });

  // stepping blocks up the right side onto the flat hill
  L.plat(7, 1.4, 8.5, 2.6, 2.6, { style: "grassBlock" });
  L.plat(10, 2.8, 11.8, 2.6, 2.6, { style: "grassBlock" });
  L.plat(12.5, 4.2, 15.6, 3, 3, { style: "grassBlock" });
  L.coin(7, 2.25, 8.5).coin(10, 3.65, 11.8).coin(12.5, 5.05, 15.6);

  // a hopper guards the left hill
  L.enemy("jumper", -11, 14);

  // a quiet pipe between the hills… (the way to the secret isle)
  L.pipe(-14.5, 31, 2, 2); // → secret isle (pipe #2)

  // the gap: ride the lift, or hop the stepping stones on the right
  L.mover(0, 0.6, 53, 3.2, 3.2, [0, 0.6, 59.5], 6, { style: "lift" });
  L.coinAir([0, 1.6, 54.2], [0, 1.6, 58.4], 3);
  L.plat(7.5, 0.5, 52.4, 2.3, 2.3, { style: "stone" });
  L.plat(8, 1.0, 57.2, 2.3, 2.3, { style: "stone" });
  L.coinAir([7.7, 2.6, 54.8], [7.9, 2.9, 59.6], 2);

  // far meadow: checkpoint, a walker and an exit pipe from the secret isle
  L.checkpoint(0, 66);
  L.coinRingG(0, 75, 3.2, 3);
  L.enemy("walker", 5, 79, { radius: 3 });
  L.pipe(-8, 72, 1.6, null);
  L.qblock(-3.5, 3.7, 82, "jump");

  // stairs (and a spring) up to the goal plateau
  L.plat(-3, 2.4, 86.2, 2.4, 2.4, { style: "brickBlock" });
  L.plat(0, 3.6, 88.6, 2.4, 2.4, { style: "brickBlock" });
  L.coin(-3, 3.25, 86.2).coin(0, 4.45, 88.6);
  L.spring(6, 86.5);
  L.goal(0, 106);
  L.deco("castle", 0, 112, { rot: 0, noCollide: true });

  // the secret isle: hidden star + two coins
  L.pipe(-60, 56.5, 1.4, 1, { secret: true }); // → far meadow (pipe #1)
  L.star(-60, L.ground(-60, 63) + 1.4, 63);
  L.coinG(-62.5, 60).coinG(-57.5, 60);

  // scenery
  const path = [
    [0, -3, 6],
    [0, 10, 5],
    [0, 22, 6],
    [9, 12, 5],
    [-11, 14, 4],
    [-14.5, 31, 3],
    [0, 40, 5],
    [0, 48, 4],
    [0, 66, 4],
    [0, 76, 5],
    [-8, 72, 3],
    [-1, 86, 4],
    [6, 86, 3],
    [0, 104, 4],
    [12, 27, 3],
  ];
  L.deco("tree", -6, 4, { s: 1.1 });
  L.deco("tree", 7, 2, { s: 0.9 });
  L.deco("tree", -16, 26, { s: 1.2 });
  L.deco("tree", -12, 34, { s: 1 });
  L.deco("tree", 15, 38, { s: 1.15 });
  L.deco("tree", 8, 45, { s: 0.95 });
  L.deco("tree", -9, 47, { s: 1 });
  L.deco("tree", 12, 70, { s: 1.1 });
  L.deco("tree", -12, 80, { s: 1.05 });
  L.deco("tree", 7, 100, { s: 0.9 });
  L.deco("tree", -7, 99, { s: 0.95 });
  L.deco("tree", -62, 57, { s: 0.7 });
  L.scatter("bush", 14, 0, 20, 18, 28, { avoid: path });
  L.scatter("flowers", 34, 0, 20, 19, 29, { avoid: path.map(([x, z]) => [x, z, 1.5]), noCollide: true });
  L.scatter("flowers", 12, 0, 76, 15, 12, { noCollide: true });
  L.scatter("flowers", 5, -60, 60, 6, 6, { noCollide: true });
  L.scatter("rock", 4, 0, 20, 18, 28, { avoid: path, s: 0.6 });
  L.pipe(16, 12, 2.6, null);
  L.deco("fence", -3.5, 49, { rot: 0 });
  L.deco("fence", 3.5, 49, { rot: 0 });

  // bot route: every coin, both stomps, lift there, stones back, pipe secret, stairs, goal
  L.lv.route = [
    [0, 9.5],
    { p: [0, 14], jump: 1 },
    { wait: 1.2 },
    [0, 12.3],
    { stomp: 0 },
    [5.2, 7.4],
    { p: [7, 8.5], jumpAt: 1.9 },
    [7, 8.5],
    { p: [10, 11.8], jumpAt: 2.6 },
    [10, 11.8],
    { p: [12.5, 15.6], jumpAt: 3.8 },
    [12.5, 15.6],
    [12, 22],
    [12, 27],
    { stomp: 1 },
    [0, 48.3],
    { waitPlat: 3, near: [0, 53], r: 0.4 },
    { p: [0, 53], jumpAt: 9 },
    { ride: 3, until: [0, 59.5], r: 0.4 },
    { p: [0, 64], jumpAt: 9 },
    [0, 64],
    [0, 66],
    [3.2, 75],
    [-1.6, 77.8],
    [-1.6, 72.2],
    { stomp: 2 },
    [8, 63.4],
    { p: [8, 57.2], jumpAt: 9, jump: 2, dj: 0.35 },
    [8, 57.2],
    { p: [7.5, 52.4], jumpAt: 9 },
    [7.5, 52.4],
    { p: [7.5, 47], jumpAt: 9, jump: 2, dj: 0.35 },
    [7.5, 47],
    [-11, 31],
    { p: [-14.5, 31], jumpAt: 2.3 },
    { p: [-14.5, 31], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-60, 63],
    [-62.5, 60],
    [-57.5, 60],
    [-60, 59.5],
    { p: [-60, 56.5], jumpAt: 2.4 },
    { p: [-60, 56.5], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-3, 83.5],
    { p: [-3, 86.2], jumpAt: 2.0 },
    [-3, 86.2],
    { p: [0, 88.6], jumpAt: 3 },
    [0, 88.6],
    { p: [0, 93], jumpAt: 3.2 },
    [0, 93],
    [0, 106],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 1-2 PIPE MEADOWS */
function pipeMeadows() {
  const L = build({ ...W1, id: 2, num: 2, name: "Pipe Meadows", coinGoal: 18 });
  L.island(0, 0, 12, 13, 0, { wob: 0.04 });
  L.island(0, 52, 13, 10, 3, { wob: 0.04 });
  L.island(0, 78, 12, 11, 6, { wob: 0.04 });
  L.hill(-6, -4, 5, 1.2);
  L.hill(6, 54, 4, 0.8);
  L.spawn(0, -7, 0);
  L.sign(2.4, -4, "Pipe tops make great stepping stones. The blue disc spins — stay near its middle!", Math.PI);
  L.coinLine([0, -2], [0, 7], 5);
  L.enemy("walker", 6, 5, { radius: 2.5 });

  // the pipe field rising out of the water (main path)
  const pipes = [
    [0, 16, 1.0],
    [3, 19.6, 2.0],
    [0, 23.2, 3.0],
    [-3.4, 26.4, 2.4],
    [0, 29.8, 3.2],
    [3.4, 33.2, 4.0],
  ];
  for (const [x, z, top] of pipes) {
    L.pipe(x, z, top + 3, null, { y: -3 });
    L.coin(x, top + 0.85, z);
  }
  L.disc(0, 4, 37.8, 2.4, 0.9);
  // the safe ledges on the left (second path)
  L.plat(-6.5, 1, 17, 2.6, 2.6, { style: "grassBlock" });
  L.plat(-7.5, 2, 21.6, 2.6, 2.6, { style: "grassBlock" });
  L.plat(-7.5, 3, 26.2, 2.6, 2.6, { style: "grassBlock" });
  L.plat(-6.5, 3.6, 30.8, 2.6, 2.6, { style: "grassBlock" });
  L.plat(-4.5, 3.6, 35.6, 2.6, 2.6, { style: "grassBlock" });
  L.coin(-7.5, 2.85, 21.6).coin(-7.5, 3.85, 26.2).coin(-6.5, 4.45, 30.8).coin(-4.5, 4.45, 35.6);

  // the meadow: checkpoint, a coin block, a trooper and a buzzer
  L.checkpoint(0, 45);
  L.qblock(-4.5, 5.7, 50, "coin", { count: 5 });
  L.coinRingG(2, 52, 2.4, 3);
  L.enemy("walker", -5, 55, { radius: 2.5 });
  L.enemy("flyer", 3, 57, { radius: 2.5, fly: 2.6 });

  // secret: the spring beside the tall pipe
  L.spring(7, 48.6);
  L.pipe(10.2, 52, 6.5, null);
  L.star(10.2, 10.9, 52);

  // up to the goal meadow
  L.pipe(-3, 59.2, 1.6, null);
  L.plat(0, 5.6, 62.6, 2.6, 2.6, { style: "grassBlock" });
  L.coinLine([0, 70], [0, 75], 2);
  L.enemy("jumper", 5, 76);
  L.goal(0, 82);
  L.deco("castle", 0, 87.5, { noCollide: true, s: 0.9 });

  L.deco("tree", -7, 4, { s: 1 });
  L.deco("tree", 8, -6, { s: 1.1 });
  L.deco("tree", -9, 50, { s: 1 });
  L.deco("tree", 9, 82, { s: 0.9 });
  L.deco("tree", -8, 78, { s: 1 });
  L.scatter("flowers", 14, 0, 0, 11, 11, { noCollide: true, avoid: [[0, 0, 2]] });
  L.scatter("flowers", 10, 0, 52, 11, 8, { noCollide: true });
  L.scatter("bush", 6, 0, 78, 10, 9, { noCollide: true, avoid: [[0, 80, 3]] });

  L.lv.route = [
    [0, 7],
    { stomp: 0 },
    [0, 12],
    { p: [0, 16], jumpAt: 3.4 },
    [0, 16],
    { p: [3, 19.6], jumpAt: 4.8 },
    [3, 19.6],
    { p: [0, 23.2], jumpAt: 4.8 },
    [0, 23.2],
    { p: [-3.4, 26.4], jumpAt: 4.8 },
    [-3.4, 26.4],
    { p: [0, 29.8], jumpAt: 4.8 },
    [0, 29.8],
    { p: [3.4, 33.2], jumpAt: 4.8 },
    [3.4, 33.2],
    { p: [0, 37.8], jumpAt: 5.6 },
    [0, 37.8],
    { p: [0, 44], jumpAt: 5 },
    [0, 44],
    [0, 45.5],
    [-4.5, 50.2],
    { p: [-4.5, 50], jump: 1 },
    { wait: 0.9 },
    { p: [-4.5, 50], jump: 1 },
    { wait: 0.9 },
    { p: [-4.5, 50], jump: 1 },
    { wait: 0.9 },
    { p: [-4.5, 50], jump: 1 },
    { wait: 0.9 },
    { p: [-4.5, 50], jump: 1 },
    { wait: 0.9 },
    [4.4, 52],
    [0.8, 54.1],
    [0.8, 49.9],
    [7, 46],
    { p: [7, 48.6], air: true, r: 0.7 },
    { p: [10.2, 52], r: 0.6, timeout: 4 },
    { wait: 0.3 },
    [10.2, 56],
    [-3, 56.8],
    { p: [-3, 59.2], jumpAt: 2.4 },
    [-3, 59.2],
    { p: [0, 62.6], jumpAt: 4 },
    [0, 62.6],
    { p: [0, 68], jumpAt: 4 },
    [0, 70],
    [0, 82],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 1-3 MUSHROOM HEIGHTS */
function mushroomHeights() {
  const L = build({ ...W1, id: 3, num: 3, name: "Mushroom Heights", coinGoal: 16 });
  L.island(0, 0, 11, 11, 0, { wob: 0.05 });
  L.island(8, 42, 9, 8, 8.6, { wob: 0.05, float: 6 });
  L.island(8, 62, 8, 8, 16, { wob: 0.06, float: 9 });
  L.hill(-4, -3, 4, 1);
  L.spawn(0, -6, 0);
  L.sign(3, -4, "Giant mushrooms! Some stones crumble when you land on them — keep moving.", Math.PI);
  L.coinLine([0, -2], [0, 3.5], 4);
  L.enemy("walker", -6, 4, { radius: 2 });

  // the mushroom staircase
  const ms = [
    [0, 7.2, 2, 2],
    [4, 11.2, 3.8, 2],
    [0.5, 15.6, 5.4, 2.2],
    [-4.5, 18.6, 7, 2],
    [-4, 24, 8.6, 2],
  ];
  for (const [x, z, top, r] of ms) {
    L.mushroom(x, z, top, r, { base: z > 10 ? -3 : undefined });
    L.coin(x, top + 0.85, z);
  }
  L.enemy("flyer", -1, 12.5, { y: 4.5, fly: 2, radius: 2.2 });
  // crumbling stones to the high meadow
  L.faller(-0.5, 8.6, 27.6, 2.2, 2.2);
  L.faller(2.5, 8.6, 30.6, 2.2, 2.2);
  L.faller(5.5, 8.6, 33.6, 2.2, 2.2);
  L.coinAir([-0.5, 9.6, 27.6], [5.5, 9.6, 33.6], 3);

  // high meadow
  L.checkpoint(8, 37);
  L.coinRingG(8, 43, 2.6, 4);
  L.enemy("walker", 11, 45, { radius: 2 });
  // two ways up: the big spring, or the clouds on the right
  L.spring(8, 48.4, { power: 26 });
  L.cloud(16, 10.6, 50, 1.8);
  L.cloud(17.6, 12.6, 54, 1.8);
  L.cloud(17.6, 14.6, 58.6, 1.8);
  L.coin(16, 11.45, 50).coin(17.6, 13.45, 54).coin(17.6, 15.45, 58.6);
  L.enemy("flyer", 13, 55, { y: 11, fly: 2, radius: 2 });

  // summit
  L.coinLine([8, 57], [8, 60], 2);
  L.enemy("jumper", 4, 63);
  L.goal(8, 66);
  L.deco("castle", 8, 70.5, { noCollide: true, s: 0.75 });

  // secret: the tall mushroom off the staircase
  L.mushroom(-10.5, 14, 11, 1.6, { base: -3 });
  L.star(-10.5, 12.5, 14);
  L.coin(-10.5, 11.85, 15.2).coin(-10.5, 11.85, 12.8);

  L.deco("tree", -7, -5, { s: 1 });
  L.deco("tree", 7, 3, { s: 0.9 });
  L.deco("mushroom", -6, 1, { s: 0.8, noCollide: true });
  L.deco("mushroom", 5, -6, { s: 0.6, noCollide: true });
  L.deco("tree", 13, 40, { s: 0.8 });
  L.deco("mushroom", 3.5, 44, { s: 0.7, noCollide: true });
  L.scatter("flowers", 12, 0, 0, 10, 10, { noCollide: true, avoid: [[0, 0, 2]] });
  L.scatter("flowers", 6, 8, 42, 7, 6, { noCollide: true });

  L.lv.route = [
    [0, 3.5],
    { p: [0, 7.2], jumpAt: 3.6 },
    [0, 7.2],
    { p: [4, 11.2], jumpAt: 4.4 },
    [4, 11.2],
    { p: [0.5, 15.6], jumpAt: 4.6 },
    [0.5, 15.6],
    { p: [-4.5, 18.6], jumpAt: 4.6 },
    [-4.5, 18.6],
    { p: [-10.5, 14], jumpAt: 5.6, jump: 2, dj: 0.3 },
    [-10.5, 14],
    [-10.5, 15.2],
    [-9.6, 15.4],
    { p: [-4.5, 18.6], jumpAt: 9 },
    [-4.5, 18.6],
    { p: [-4, 24], jumpAt: 4.6 },
    [-4, 24],
    { p: [-0.5, 27.6], jumpAt: 4 },
    [-0.5, 27.6],
    { p: [2.5, 30.6], jumpAt: 9 },
    [2.5, 30.6],
    { p: [5.5, 33.6], jumpAt: 9 },
    [5.5, 33.6],
    [8, 36],
    [8, 37.2],
    [10.6, 43],
    [8, 45.6],
    [5.4, 43],
    [8, 40.4],
    [8, 46],
    { p: [8, 48.4], air: true, r: 0.7 },
    { p: [8, 58], r: 0.8, timeout: 5 },
    [8, 60],
    [8, 66],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 1-4 BRIDGE VALLEY */
function bridgeValley() {
  const L = build({ ...W1, id: 4, num: 4, name: "Bridge Valley", coinGoal: 18 });
  L.island(0, 0, 10, 10, 2, { wob: 0.04 });
  L.island(0, 38, 10, 10, 2, { wob: 0.04 });
  L.island(0, 72, 10, 10, 3, { wob: 0.04 });
  L.island(22, 72, 4.5, 4.5, 6, { wob: 0.06, float: 6 });
  L.island(0, 102, 10, 10, 3, { wob: 0.04 });
  L.hill(5, -3, 4, 1);
  L.spawn(0, -5, 0);
  L.coinLine([0, -1], [0, 6], 4);

  // plank bridge, a sliding lift, more planks
  L.plat(0, 2, 12.4, 3, 2.6, { style: "plank", h: 0.5 });
  L.plat(0, 2, 15.1, 3, 2.6, { style: "plank", h: 0.5 });
  L.mover(-4, 2, 19.5, 3, 3, [4, 2, 19.5], 6, { style: "lift" });
  L.plat(0, 2, 23.9, 3, 2.6, { style: "plank", h: 0.5 });
  L.plat(0, 2, 26.6, 3, 2.6, { style: "plank", h: 0.5 });
  L.coin(0, 2.85, 12.4).coin(0, 2.85, 15.1).coin(0, 2.85, 25.2);

  L.checkpoint(0, 30.5);
  L.qblock(0, 4.7, 37.5, "magnet");
  L.coinRingG(0, 40, 4.5, 4);
  L.enemy("armored", 4, 41, { radius: 2.5 });
  L.hazard("cannon", { x: 7.2, y: 2, z: 46, yaw: Math.PI, every: 3.2, speed: 6, range: 30 });

  // blinking path (left) or crumbling stones (right)
  L.blinker(-1, 2, 51.3, 2.6, 2.6, 4, 0, { on: 0.65 });
  L.blinker(-1, 2, 55.1, 2.6, 2.6, 4, 0.35, { on: 0.65 });
  L.blinker(-1, 2, 58.9, 2.6, 2.6, 4, 0.7, { on: 0.65 });
  L.faller(5, 2, 51.3, 2.2, 2.2);
  L.faller(5, 2, 55.1, 2.2, 2.2);
  L.faller(5, 2, 58.9, 2.2, 2.2);
  L.coinAir([-1, 3, 51.3], [-1, 3, 58.9], 3);

  // far meadow + a lift to the secret isle
  L.enemy("fast", -4, 75, { radius: 3 });
  L.enemy("walker", 4, 78, { radius: 2 });
  L.coinLine([-2, 66], [2, 66], 3);
  L.mover(11.6, 3.2, 72, 3, 3, [16.4, 6.2, 72], 5);
  L.star(22, 7.6, 72);
  L.coinRingG(22, 72, 2.2, 4);

  // the spinning bar to the goal meadow
  L.bar(0, 3.3, 85.9, 8.4, 1.8, 0.55);
  L.coinAir([0, 3.9, 84], [0, 3.9, 88.4], 2);
  L.coinLine([0, 96], [0, 99], 2);
  L.goal(0, 104);
  L.deco("castle", 0, 109.5, { noCollide: true, s: 0.85 });

  L.deco("tree", -6, -4, { s: 1 });
  L.deco("tree", 6, 4, { s: 0.9 });
  L.deco("tree", -7, 40, { s: 1 });
  L.deco("tree", 7, 72, { s: 1 });
  L.deco("tree", -7, 102, { s: 1 });
  L.deco("fence", -3, 9, {});
  L.deco("fence", 3, 9, {});
  L.scatter("flowers", 10, 0, 0, 9, 9, { noCollide: true, avoid: [[0, 2, 1.5]] });
  L.scatter("flowers", 8, 0, 72, 9, 9, { noCollide: true });
  L.scatter("bush", 5, 0, 38, 9, 9, { noCollide: true, avoid: [[0, 38, 5]] });

  L.lv.route = [
    [0, 6],
    [0, 9.2],
    { p: [0, 12.4], jumpAt: 3.4 },
    [0, 12.4],
    [0, 15.6],
    { waitPlat: [-4, 19.5], near: [-2.2, 19.5], r: 0.4, dir: [1, 0] },
    { p: [0, 19.5], jumpAt: 9 },
    { ride: [-4, 19.5], until: [0, 19.5], r: 0.6 },
    { p: [0, 23.9], jumpAt: 9 },
    [0, 23.9],
    [0, 28],
    [0, 30.5],
    [0, 35.6],
    { p: [0, 37.5], jump: 1 },
    { wait: 1.4 },
    [0, 35.8],
    [-4.5, 40],
    [0, 44.5],
    { stomp: 0 },
    [-1, 47.6],
    { waitOn: [-1, 51.3] },
    { p: [-1, 51.3], jumpAt: 9 },
    [-1, 51.3],
    { waitOn: [-1, 55.1] },
    { p: [-1, 55.1], jumpAt: 9 },
    [-1, 55.1],
    { waitOn: [-1, 58.9] },
    { p: [-1, 58.9], jumpAt: 9 },
    [-1, 58.9],
    { p: [-1, 63.5], jumpAt: 9 },
    [-1, 63.5],
    [-2, 66],
    [2, 66],
    [9.4, 72],
    { waitPlat: [11.6, 72], near: [11.6, 72], r: 0.4 },
    { p: [11.6, 72], jumpAt: 9 },
    { ride: [11.6, 72], until: [16.4, 72], r: 0.4 },
    { p: [19, 72], jumpAt: 9 },
    [20.4, 72],
    [22, 72],
    [24.2, 72],
    [22, 74.2],
    [22, 69.8],
    [19, 72],
    { waitPlat: [11.6, 72], near: [16.4, 72], r: 0.4, hold: [19, 72] },
    { p: [16.4, 72], jumpAt: 9 },
    { ride: [11.6, 72], until: [11.6, 72], r: 0.4 },
    { p: [8, 72], jumpAt: 9 },
    { stomp: 2 },
    { stomp: 1, jumpAt: 2.2 },
    [0, 81.2],
    { waitAlign: [0, 85.9], at: -0.12, tol: 0.08 },
    { p: [0, 85.9], sprint: true, r: 0.8 },
    { p: [0, 90], sprint: true, r: 0.8 },
    { p: [0, 94], jumpAt: 9, sprint: true },
    [0, 94],
    [0, 104],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 1-5 SKY GARDEN */
function skyGarden() {
  const L = build({ ...W1, id: 5, num: 5, name: "Sky Garden", coinGoal: 18 });
  L.island(0, 0, 9, 9, 12, { wob: 0.05, float: 8 });
  L.island(0, 40, 8, 8, 19, { wob: 0.05, float: 7 });
  L.island(0, 72, 8, 8, 21, { wob: 0.05, float: 8 });
  L.island(0, 96, 8, 8, 26, { wob: 0.05, float: 9 });
  L.island(23, 60, 4.2, 4.2, 24, { wob: 0.07, float: 5 });
  L.hill(3, -3, 3.5, 0.8);
  L.spawn(0, -4, 0);
  L.sign(2.6, -2, "Clouds can be jumped through from below — land on top of them!", Math.PI);
  L.coinLine([0, 1], [0, 5], 3);

  // rising clouds
  const cl = [
    [0, 13, 13.2],
    [3, 14.5, 17.2],
    [0, 16, 21.2],
    [-3, 17.5, 25.2],
    [0, 19, 29.2],
  ];
  for (const [x, top, z] of cl) {
    L.cloud(x, top, z, 1.8);
    L.coin(x, top + 0.85, z);
  }
  L.enemy("flyer", 4, 23, { y: 14, fly: 2, radius: 2.5 });

  // island two
  L.checkpoint(0, 34.5);
  L.coinRingG(0, 41, 2.6, 4);
  L.enemy("fast", 0, 44, { radius: 2.5 });
  L.enemy("flyer", -4, 38, { y: 19, fly: 2.6, radius: 2 });

  // spinning bar then crumbling stones
  L.bar(0, 19.3, 51.3, 7.4, 1.8, 0.65);
  L.faller(0, 19, 58.8, 2.2, 2.2);
  L.faller(0, 19, 62, 2.2, 2.2);
  L.coin(0, 19.85, 58.8).coin(0, 19.85, 62);

  // island three
  L.qblock(-3, 23.7, 72, "star");
  L.coinRingG(0, 74, 3, 4);
  L.enemy("walker", 3, 70, { radius: 2 });
  L.enemy("armored", -3, 76, { radius: 2 });
  // secret: blinking steps east to the lonely isle
  L.blinker(11.6, 22, 70, 2.6, 2.6, 4, 0, { on: 0.65 });
  L.blinker(15.3, 23, 66.6, 2.6, 2.6, 4, 0.35, { on: 0.65 });
  L.star(23, 25.5, 60);
  L.coinRingG(23, 60, 2.2, 3);
  L.pipe(-5.5, 68.6, 1.2, null); // #0 exit on island three
  L.pipe(25.2, 57.6, 1.2, 0); // #1 the way back from the secret isle

  // last climb
  L.cloud(2, 22.6, 82.4, 1.8);
  L.cloud(-1, 24.4, 85.8, 1.8);
  L.coin(2, 23.45, 82.4).coin(-1, 25.25, 85.8);
  L.goal(0, 99);
  L.deco("castle", 0, 104, { noCollide: true, s: 0.7 });

  L.deco("tree", -5, -3, { s: 0.8 });
  L.deco("tree", 4, 42, { s: 0.8 });
  L.deco("tree", -5, 72, { s: 0.8 });
  L.deco("tree", 5, 95, { s: 0.8 });
  L.scatter("flowers", 8, 0, 0, 8, 8, { noCollide: true, avoid: [[0, 0, 2]] });
  L.scatter("flowers", 6, 0, 96, 7, 7, { noCollide: true, avoid: [[0, 99, 2]] });

  L.lv.route = [
    [0, 5],
    [0, 8.2],
    { p: [0, 13.2], jumpAt: 9 },
    [0, 13.2],
    { p: [3, 17.2], jumpAt: 4.6 },
    [3, 17.2],
    { p: [0, 21.2], jumpAt: 4.6 },
    [0, 21.2],
    { p: [-3, 25.2], jumpAt: 4.6 },
    [-3, 25.2],
    { p: [0, 29.2], jumpAt: 4.6 },
    [0, 29.2],
    { p: [0, 33.6], jumpAt: 4 },
    [0, 34.5],
    [2.6, 41],
    [0, 43.6],
    [-2.6, 41],
    [0, 38.4],
    { stomp: 1 },
    [0, 47.4],
    { waitAlign: [0, 51.3], at: -0.12, tol: 0.08 },
    { p: [0, 51.3], sprint: true, r: 0.8 },
    { p: [0, 54.6], sprint: true, r: 0.8 },
    { p: [0, 58.8], jumpAt: 9 },
    [0, 58.8],
    { p: [0, 62], jumpAt: 9 },
    [0, 62],
    { p: [0, 65.5], jumpAt: 9 },
    [0, 65.5],
    [-3, 70.2],
    { p: [-3, 72], jump: 1 },
    { wait: 1.2 },
    [-3, 70.6],
    [3, 74],
    [0, 77],
    [-3, 74],
    [7.2, 70],
    { waitOn: [11.6, 70] },
    { p: [11.6, 70], jumpAt: 9 },
    [11.6, 70],
    { waitOn: [15.3, 66.6] },
    { p: [15.3, 66.6], jumpAt: 9 },
    [15.3, 66.6],
    { p: [20.2, 62], jumpAt: 9, jump: 2, dj: 0.3 },
    [20.2, 62],
    [23, 60],
    [25.2, 60],
    [21.9, 61.9],
    [21.9, 58.1],
    [23.6, 56.4],
    { p: [25.2, 57.6], jumpAt: 2.2 },
    { p: [25.2, 57.6], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [1.5, 78.6],
    { p: [2, 82.4], jumpAt: 4.2 },
    [2, 82.4],
    { p: [-1, 85.8], jumpAt: 9 },
    [-1, 85.8],
    { p: [0, 89.4], jumpAt: 9 },
    [0, 89.4],
    [0, 99],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 1-6 KING TROOPER'S MEADOW (boss) */
function kingsMeadow() {
  const L = build({ ...W1, id: 6, num: 6, name: "King Trooper's Meadow", coinGoal: 12, boss: { kind: "kingTrooper", x: 0, y: 1, z: 42, cx: 0, cz: 34, R: 15 } });
  L.island(0, 0, 9, 9, 0, { wob: 0.05 });
  L.island(0, 34, 16, 16, 1, { wob: 0.02, p: 2 });
  L.spawn(0, -4, 0);
  L.sign(2.5, -2, "The King Trooper rules this meadow! When he charges, sidestep — he'll crash and get dizzy. That's your moment to stomp!", Math.PI);
  L.coinLine([0, 0], [0, 6], 4);
  L.qblock(-2.5, 2.7, 4, "heart");
  // stepping stones to the arena
  L.plat(0, 0.6, 12, 3, 3, { style: "grassBlock" });
  L.plat(0, 0.8, 15.6, 3, 3, { style: "grassBlock" });
  L.coin(0, 1.45, 12).coin(0, 1.65, 15.6);
  L.checkpoint(0, 20.5);
  // arena: four stone pillars at the edge, coins round the rim
  for (const a of [0.785, 2.356, 3.927, 5.498]) L.pillar(Math.cos(a) * 13, 34 + Math.sin(a) * 13, 4, 1.8, { style: "stone", shape: "cyl" });
  L.coinRingG(0, 34, 11, 8);
  // secret: a spring behind the arena to a floating ledge with the star
  L.spring(-12.5, 34, { power: 27 });
  L.island(-19.6, 34, 3.2, 3.2, 9, { wob: 0.08, float: 4 });
  L.star(-19.6, 10.4, 34);
  L.coinG(-19.6, 32).coinG(-19.6, 36);
  L.goal(0, 34, 1, 7);
  L.deco("castle", 0, 52, { noCollide: true, s: 0.9 });
  L.deco("tree", -6, -4, { s: 1 });
  L.deco("tree", 6, 2, { s: 0.9 });
  L.scatter("flowers", 8, 0, 0, 8, 8, { noCollide: true, avoid: [[0, 0, 2]] });

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

export const WORLD1 = [greenHills, pipeMeadows, mushroomHeights, bridgeValley, skyGarden, kingsMeadow];
