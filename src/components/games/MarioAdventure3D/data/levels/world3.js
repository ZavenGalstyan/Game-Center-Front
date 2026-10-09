/**
 * Mario Adventure 3D — World 3: OCEAN KINGDOM.
 * Sunny beaches, plank bridges, waterfalls, island hopping and a
 * lighthouse. The sea is shallow and inviting — and still a pit.
 */
import { build } from "../kit.js";

const W3 = { world: 3, theme: "ocean", sea: { kind: "water", y: -1.2 }, killY: -10, platStyle: "plank", surf: "sand" };
const GRASS = ["#58c95a", "#6fd56a", "#4cb636"];

/* ------------------------------------------------------------------ 3-1 SUNNY BEACH */
function sunnyBeach() {
  const L = build({ ...W3, id: 13, num: 1, name: "Sunny Beach" });
  L.island(0, 8.6, 14, 21, 0.5, { wob: 0.03 });
  L.island(0, 10, 7, 9, 0.9, { wob: 0.08, top: GRASS, surf: "grass" });
  L.island(0, 56, 10, 10, 0.5, { wob: 0.05 });
  L.island(0, 83, 9, 9, 1, { wob: 0.03 });
  L.island(21, 60, 3.6, 3.6, 2, { wob: 0.08 });
  L.spawn(0, -8, 0);
  L.sign(2.6, -6, "Welcome to the Ocean Kingdom! The water looks lovely — but don't fall in.", Math.PI);
  L.coinLine([0, -5], [0, 2], 4);
  L.enemy("walker", 5, 6, { radius: 2.5 });
  L.enemy("jumper", -4, 15);
  L.enemy("flyer", 6, 21, { fly: 2.4, radius: 2.5 });
  L.qblock(-1.1, 3.5, 12, "coin", { count: 3 });
  L.brick(1.1, 3.5, 12);
  // plank bridge over the lagoon (one plank crumbles)
  for (const z of [29.6, 32.3, 38.9, 41.6, 44.3]) L.plat(0, 0.6, z, 2.6, 2.6, { h: 0.4 });
  L.faller(0, 0.6, 35.6, 2.6, 2.6, { style: "plank", h: 0.4 });
  L.coin(0, 1.45, 32.3).coin(0, 1.45, 38.9).coin(0, 1.45, 44.3);
  // middle beach
  L.checkpoint(0, 48.5);
  L.coinRingG(0, 57, 2.6, 4);
  L.enemy("walker", -4, 59, { radius: 2 });
  // the spinning disc (or the rocks on the left)
  L.disc(0, 0.9, 70.4, 2.6, 0.7);
  L.coin(0, 1.75, 70.4);
  L.pillar(-4.6, 69, 0.9, 1.8, { shape: "cyl", style: "stone" });
  L.pillar(-4.6, 73.2, 1.2, 1.8, { shape: "cyl", style: "stone" });
  L.coin(-4.6, 1.75, 69).coin(-4.6, 2.05, 73.2);
  // goal beach
  L.enemy("armored", 4, 84, { radius: 2 });
  L.coinLine([-2, 80], [2, 80], 2);
  L.goal(0, 89);
  L.deco("castle", 0, 93.5, { noCollide: true, s: 0.75 });
  // secret: rocks out east lead to a sandbar islet
  L.pillar(12, 56, 1.1, 2, { shape: "cyl", style: "stone" });
  L.pillar(15.8, 57.6, 1.6, 2, { shape: "cyl", style: "stone" });
  L.star(21, 3.4, 60);
  L.coinG(20, 62).coinG(22, 58);

  for (const [x, z] of [
    [-9, -4],
    [9, 2],
    [-10, 22],
    [8, 26],
    [7, 52],
    [-7, 62],
    [6, 88],
    [-6, 80],
    [21.5, 61.5],
  ])
    L.deco("palm", x, z, { s: 0.9, rot: (x * z) % 6 });
  L.scatter("shell", 10, 0, 8, 13, 19, { noCollide: true });
  L.scatter("flowers", 8, 0, 10, 6, 8, { noCollide: true });

  L.lv.route = [
    [0, 2],
    { stomp: 0 },
    { stomp: 1 },
    [-1.1, 10.6],
    { p: [-1.1, 12], jump: 1 },
    { wait: 0.9 },
    { p: [-1.1, 12], jump: 1 },
    { wait: 0.9 },
    { p: [-1.1, 12], jump: 1 },
    { wait: 0.9 },
    [0, 26.5],
    [0, 29.6],
    [0, 33.2],
    { p: [0, 38.9], jumpAt: 9 },
    [0, 38.9],
    [0, 46],
    [0, 48.5],
    [2.6, 57],
    [0, 59.6],
    [-2.6, 57],
    [0, 54.4],
    [9.4, 56],
    { p: [12, 56], jumpAt: 9 },
    [12, 56],
    { p: [15.8, 57.6], jumpAt: 9 },
    [15.8, 57.6],
    { p: [19, 59.2], jumpAt: 9 },
    [20, 62],
    [21, 60],
    [22, 58],
    [19.2, 59.2],
    { p: [15.8, 57.6], jumpAt: 9 },
    [15.8, 57.6],
    { p: [12, 56], jumpAt: 9 },
    [12, 56],
    { p: [8.4, 56], jumpAt: 9 },
    { stomp: 1 },
    [0, 65.6],
    { p: [0, 70.4], jumpAt: 9 },
    [0, 72.2],
    { p: [0, 76], jumpAt: 9 },
    [0, 76],
    [-2, 80],
    [2, 80],
    [0, 89],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 3-2 ROPE BRIDGES */
function ropeBridges() {
  const L = build({ ...W3, id: 14, num: 2, name: "Rope Bridges" });
  const rocks = [
    [0, 0, 6, 5],
    [0, 26, 4.5, 6],
    [6, 50, 4.5, 7],
    [-2, 76, 5, 7],
    [0, 100, 6, 8],
  ];
  rocks.forEach(([x, z, r, h], i) => L.island(x, z, r, r, h, { wob: 0.03, top: i % 2 ? undefined : GRASS, surf: i % 2 ? "sand" : "grass" }));
  L.spawn(0, -2.5, 0);
  L.sign(2.4, -1, "Rope bridges between the sea stacks. Buzzers love to swoop here — keep moving!", Math.PI);
  L.coinLine([0, 0], [0, 3], 2);
  // bridge 1: planks with one gap
  for (const z of [7.2, 9.6, 12, 16.6, 19, 21.4]) L.plat(0, 5, z, 2, 2.4, { h: 0.3 });
  L.coin(0, 5.85, 9.6).coin(0, 5.85, 16.6);
  L.enemy("flyer", 3, 13, { y: 5, fly: 2.2, radius: 2 });
  L.enemy("walker", 0, 26, { radius: 2 });
  // bridge 2: rising, with crumbling planks
  L.plat(1.2, 6.2, 32.6, 2, 2.4, { h: 0.3 });
  L.faller(2.4, 6.4, 35.2, 2, 2.4, { style: "plank", h: 0.3 });
  L.faller(3.6, 6.6, 37.8, 2, 2.4, { style: "plank", h: 0.3 });
  L.plat(4.8, 6.8, 40.4, 2, 2.4, { h: 0.3 });
  L.plat(5.6, 6.9, 43, 2, 2.4, { h: 0.3 });
  L.plat(5.8, 6.95, 45.4, 2, 2.4, { h: 0.3 });
  L.coinAir([1.2, 7.2, 32.6], [4.8, 7.6, 40.4], 4);
  L.checkpoint(6, 50);
  L.hazard("cannon", { x: 8.5, y: 7, z: 52, yaw: Math.PI, every: 3.4, range: 26 });
  L.enemy("jumper", 4, 48);
  // bridge 3: blinking planks
  L.blinker(4.6, 7, 57.6, 2.2, 2.4, 4, 0, { on: 0.65, style: "plank" });
  L.blinker(3, 7, 61, 2.2, 2.4, 4, 0.35, { on: 0.65, style: "plank" });
  L.blinker(1.4, 7, 64.4, 2.2, 2.4, 4, 0.7, { on: 0.65, style: "plank" });
  L.plat(0, 7, 67.8, 2.2, 2.4, { h: 0.3 });
  L.plat(-0.8, 7, 70.2, 2.2, 2.4, { h: 0.3 });
  L.coin(4.6, 7.85, 57.6).coin(3, 7.85, 61).coin(1.4, 7.85, 64.4);
  L.enemy("flyer", -3, 66, { y: 7, fly: 2.2, radius: 2 });
  L.enemy("armored", -2, 78, { radius: 2 });
  // bridge 4 to the goal stack
  for (const z of [82.6, 85, 87.4, 89.8, 92.2]) L.plat(-1.2, 7.6, z, 2, 2.4, { h: 0.3 });
  L.coinLine([0, 96], [0, 100], 2);
  L.goal(0, 103);
  // secret: drop off the bridge onto a ledge below; a spring takes you back up
  L.plat(-3.2, 2, 14.4, 3.6, 3.6, { style: "stone" });
  L.star(-4.6, 3.5, 15.4);
  L.coin(-3, 2.85, 15.6);
  L.spring(-3, 13.2, { top: 2.4, power: 21 });
  for (const [x, z] of [
    [-3, 2],
    [2, -3],
    [-2, 24],
    [-4, 98],
    [4, 102],
  ])
    L.deco("palm", x, z, { s: 0.8 });

  L.lv.route = [
    [0, 3.5],
    [0, 7.2],
    [0, 12],
    [-0.5, 12.8],
    { p: [-3.2, 14.4], jumpAt: 9 },
    { p: [-4.4, 15.4], r: 0.6 },
    [-3, 15.6],
    [-3.6, 14.4],
    { p: [-3, 13.2], air: true, r: 0.6 },
    { p: [0, 12], r: 0.8, timeout: 4 },
    [0, 13.4],
    { p: [0, 16.6], jumpAt: 9 },
    [0, 16.6],
    [0, 21.6],
    { stomp: 1 },
    [0.4, 29.6],
    { p: [1.2, 32.6], jumpAt: 9 },
    [1.2, 32.6],
    { p: [2.4, 35.2], jumpAt: 9 },
    { p: [3.6, 37.8], jumpAt: 9, timeout: 2 },
    { p: [4.8, 40.4], jumpAt: 9, timeout: 2 },
    [4.8, 40.4],
    { p: [5.6, 43], jumpAt: 9 },
    [5.8, 45.4],
    [6, 50],
    [5.2, 54.6],
    { waitOn: [4.6, 57.6] },
    { p: [4.6, 57.6], jumpAt: 9 },
    [4.6, 57.6],
    { waitOn: [3, 61] },
    { p: [3, 61], jumpAt: 9 },
    [3, 61],
    { waitOn: [1.4, 64.4] },
    { p: [1.4, 64.4], jumpAt: 9 },
    [1.4, 64.4],
    { p: [0, 67.8], jumpAt: 9 },
    [0, 67.8],
    [-0.8, 70.2],
    [-1, 72.5],
    { stomp: 4 },
    { stomp: 4 },
    [-1.2, 80.5],
    { p: [-1.2, 82.6], jumpAt: 9 },
    [-1.2, 92.2],
    { p: [-0.6, 95], jumpAt: 9 },
    [0, 96],
    [0, 103],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 3-3 WATERFALL COVE */
function waterfallCove() {
  const L = build({ ...W3, id: 15, num: 3, name: "Waterfall Cove" });
  L.island(0, 0, 12, 10, 0.5, { wob: 0.05 });
  L.island(0, 24, 12, 8, 3, { wob: 0.03, p: 3, top: GRASS, surf: "grass" });
  L.island(0, 42, 12, 8, 6.5, { wob: 0.03, p: 3, top: GRASS, surf: "grass" });
  L.island(0, 66, 10, 9, 6.5, { wob: 0.04, top: GRASS, surf: "grass" });
  L.spawn(0, -6, 0);
  L.sign(2.6, -4, "Waterfall Cove. Waterfalls hide all sorts of secrets…", Math.PI);
  L.coinLine([0, -3], [0, 6], 4);
  L.enemy("walker", 6, 4, { radius: 2.5 });
  // terrace 1: steps beside the first waterfall
  L.waterfall(0, 0.5, 15.6, 6, 2.8);
  L.plat(-7, 1.7, 13, 2.4, 2.4, { style: "stone" });
  L.plat(7, 1.7, 13, 2.4, 2.4, { style: "stone" });
  L.coin(-7, 2.55, 13).coin(7, 2.55, 13);
  L.enemy("jumper", -4, 24);
  L.enemy("flyer", 5, 26, { y: 3, fly: 2.5, radius: 2 });
  // terrace 2: a spinning disc up the second fall, or the lift
  L.waterfall(-6, 3, 33.6, 5, 3.6);
  L.disc(4, 4.8, 31.6, 2.2, 0.8, { style: "disc" });
  L.mover(-8, 3.1, 31.4, 2.4, 2.4, [-8, 6.6, 31.4], 4.5, { style: "lift" });
  L.coin(4, 5.65, 31.6);
  L.checkpoint(0, 38);
  L.coinRingG(0, 44, 3, 5);
  L.enemy("armored", -5, 45, { radius: 2 });
  // the gorge: spinning bar over the rapids
  L.bar(0, 6.8, 53.4, 7.4, 1.8, 0.6);
  L.coinAir([0, 7.7, 51.6], [0, 7.7, 56.8], 3);
  L.enemy("walker", 3, 66, { radius: 2 });
  L.goal(0, 70);
  // secret: an alcove behind the waterfall at the cove's west end
  L.waterfall(-8.2, 0.5, 6, 3.4, 4.2, Math.PI / 2);
  L.wall(-11, 2.6, 6, 0.4, 2.1, 2.6, { style: "stone" });
  L.wall(-9.6, 2.6, 3.6, 1.4, 2.1, 0.4, { style: "stone" });
  L.wall(-9.6, 2.6, 8.4, 1.4, 2.1, 0.4, { style: "stone" });
  L.wall(-9.6, 4.9, 6, 1.6, 0.2, 2.8, { style: "stone" });
  L.star(-9.8, 1.9, 6);
  L.coin(-9.8, 1.35, 4.8).coin(-9.8, 1.35, 7.2);
  L.deco("palm", 8, -4, { s: 0.9 });
  L.deco("palm", -7, -5, { s: 0.9 });
  L.deco("tree", 8, 44, { s: 0.9 });
  L.deco("tree", -8, 66, { s: 0.9 });
  L.deco("tree", 8, 70, { s: 0.8 });
  L.scatter("flowers", 8, 0, 42, 10, 6, { noCollide: true, avoid: [[0, 42, 4]] });

  L.lv.route = [
    [0, 6],
    { stomp: 0 },
    [-7, 6],
    [-9.8, 6],
    [-9.8, 4.8],
    [-9.8, 7.2],
    [-7, 6],
    [-7, 8.2],
    { p: [-7, 13], jumpAt: 9 },
    [-7, 13],
    { p: [-6.6, 17], jumpAt: 9 },
    [-6.6, 17],
    [0, 18],
    [-8, 28.6],
    { waitPlat: [-8, 31.4], near: [-8, 31.4], r: 0.2, topBelow: 3.3 },
    { p: [-8, 31.4], jumpAt: 9 },
    [-8, 31.4],
    { waitPlat: [-8, 31.4], near: [-8, 31.4], r: 0.2, topAbove: 6.4 },
    { p: [-8, 35.6], jumpAt: 9 },
    [-6, 36.5],
    [0, 38],
    { stomp: 3 },
    { stomp: 3 },
    [3, 44],
    [0, 47],
    [-3, 44],
    [0, 41],
    [0, 49.6],
    { waitAlign: [0, 53.4], at: -0.12, tol: 0.08 },
    { p: [0, 51.6], sprint: true, r: 0.8 },
    { p: [0, 56.6], sprint: true, r: 0.8 },
    { p: [0, 60.4], jumpAt: 9, sprint: true },
    [0, 61],
    [0, 70],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 3-4 ISLAND HOPPING */
function islandHopping() {
  const L = build({ ...W3, id: 16, num: 4, name: "Island Hopping" });
  L.island(0, 0, 8, 8, 0.5, { wob: 0.06 });
  L.island(-6, 22, 4.5, 4.5, 1, { wob: 0.08, top: GRASS, surf: "grass" });
  L.island(4, 33, 4.5, 4.5, 1.5, { wob: 0.08 });
  L.island(-2, 56, 6, 6, 2, { wob: 0.07, top: GRASS, surf: "grass" });
  L.island(0, 84, 8, 8, 2.5, { wob: 0.06 });
  L.island(-24, 56, 3.4, 3.4, 3, { wob: 0.08 });
  L.spawn(0, -4, 0);
  L.coinLine([0, -1], [0, 5], 3);
  L.enemy("walker", 4, 2, { radius: 2 });
  // hop 1: a sliding raft
  L.mover(-1, 0.6, 11.2, 3, 3, [-4.6, 0.8, 16.4], 5);
  L.coinAir([-1.2, 1.8, 12], [-4.4, 1.8, 16], 2);
  L.enemy("walker", -7, 23.5, { radius: 1.5 });
  // hop 2: springs pad to pad
  L.spring(-3.6, 25.2, { power: 20 });
  L.coinAir([-2, 5.5, 27], [1.6, 4.5, 30.6], 3);
  L.enemy("flyer", 7, 24, { y: 1, fly: 3.4, radius: 1.5 });
  // hop 3: a loop of rafts
  L.loop(
    [
      [4, 1.6, 39.6],
      [2, 1.8, 45],
      [-1, 2, 49.4],
      [2, 1.8, 45],
    ],
    3,
    3,
    2.6,
  );
  L.checkpoint(-2, 53);
  L.coinRingG(-2, 57, 2.6, 4);
  L.enemy("fast", 1, 58, { radius: 2 });
  // hop 4: crumbling and blinking stepping stones
  L.faller(-1, 2, 64.4, 2.4, 2.4, { style: "stone" });
  L.blinker(0, 2.2, 68.4, 2.4, 2.4, 3.6, 0, { on: 0.7 });
  L.faller(1, 2.4, 72.4, 2.4, 2.4, { style: "stone" });
  L.coin(-1, 2.85, 64.4).coin(0, 3.05, 68.4).coin(1, 3.25, 72.4);
  L.goal(0, 87);
  L.coinLine([-2, 80], [2, 80], 2);
  // secret: pipe on island 4 to a far islet
  L.pipe(-6.6, 58, 1.4, 2);
  L.pipe(3.6, 82, 1.2, null, { y: 2.5 });
  L.pipe(-24, 53.4, 1.2, 1, { secret: true });
  L.star(-24, 4.4, 58);
  L.coinG(-25.6, 56).coinG(-22.4, 56);
  for (const [x, z] of [
    [-5, -3],
    [5, -4],
    [-8.5, 21],
    [7, 30],
    [-6, 60],
    [5, 88],
  ])
    L.deco("palm", x, z, { s: 0.85 });
  L.scatter("shell", 8, 0, 0, 7, 7, { noCollide: true });

  L.lv.route = [
    [0, 5],
    { stomp: 0 },
    [0, 7],
    { waitPlat: [-1, 11.2], near: [-1, 11.2], r: 0.3 },
    { p: [-1, 11.2], jumpAt: 9 },
    { ride: [-1, 11.2], until: [-4.6, 16.4], r: 0.3, timeout: 6 },
    { p: [-5.4, 19.2], jumpAt: 9 },
    [-5.4, 19.4],
    { stomp: 1 },
    [-4.6, 24.6],
    { p: [-3.6, 25.2], air: true, r: 0.7 },
    { p: [3, 32], r: 0.9, timeout: 5, sprint: true },
    [4, 33],
    [4, 36.6],
    { waitPlat: [4, 39.6], near: [4, 39.6], r: 0.4 },
    { p: [4, 39.6], jumpAt: 9 },
    { ride: [4, 39.6], until: [-1, 49.4], r: 0.4, timeout: 12 },
    { p: [-1.6, 51.6], jumpAt: 9 },
    [-2, 53],
    [0.6, 57],
    [-2, 59.6],
    [-4.6, 57],
    [-5.2, 58],
    { p: [-6.6, 58], jumpAt: 2.2 },
    { p: [-6.6, 58], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-24, 58],
    [-25.6, 56],
    [-22.4, 56],
    [-24, 54.8],
    { p: [-24, 53.4], jumpAt: 2.2 },
    { p: [-24, 53.4], r: 0.4 },
    { wait: 0.3 },
    { interact: true },
    { wait: 1.6 },
    [-2, 80],
    [2, 80],
    [0, 87],
  ];
  return L.done();
}

/* ------------------------------------------------------------------ 3-5 LIGHTHOUSE REEF */
function lighthouseReef() {
  const L = build({ ...W3, id: 17, num: 5, name: "Lighthouse Reef" });
  L.island(0, 0, 8, 8, 0.5, { wob: 0.06 });
  L.island(0, 30, 11, 11, 1, { wob: 0.05, top: GRASS, surf: "grass" });
  L.spawn(0, -4, 0);
  L.sign(2.4, -2, "Climb the lighthouse! Its spiral stair winds all the way to the lamp.", Math.PI);
  L.coinLine([0, -1], [0, 5], 3);
  L.enemy("walker", -4, 3, { radius: 2 });
  // reef path
  L.plat(0, 0.8, 10.8, 2.6, 2.6, { style: "stone" });
  L.bar(0, 1.1, 15.6, 6.4, 1.6, 0.7, { style: "plank" });
  L.coin(0, 1.65, 10.8).coin(0, 1.95, 15.6);
  L.checkpoint(0, 22);
  L.enemy("jumper", 6, 28);
  L.enemy("armored", -6, 28, { radius: 2 });
  // the lighthouse: a tower with a spiral of planks around it
  L.pillar(0, 33, 16, 2.6, { shape: "cyl", style: "stone" });
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + i * 0.62;
    const top = 2.2 + i * 1.05;
    const x = Math.cos(a) * 3.4;
    const z = 33 + Math.sin(a) * 3.4;
    if (i === 6 || i === 10) L.faller(x, top, z, 1.8, 1.8, { style: "plank", h: 0.3 });
    else L.plat(x, top, z, 1.8, 1.8, { h: 0.3 });
    if (i % 3 === 1) L.coin(x, top + 0.85, z);
  }
  L.hazard("cannon", { x: 9, y: 1, z: 30, yaw: -Math.PI / 2, every: 3, range: 16, phase: 1 });
  L.enemy("flyer", 4, 37, { y: 8, fly: 1, radius: 4.5 });
  L.goal(0, 33, 16, 5);
  // secret: a spring on the reef, a rock with the star
  L.spring(7.4, 4, { power: 22 });
  L.pillar(12, 4.4, 5.6, 2.8, { shape: "cyl", style: "stone", base: -1.2 });
  L.star(12, 7.1, 4.4);
  L.coin(12, 6.45, 3.2).coin(12, 6.45, 5.6);
  L.coinRingG(0, 33, 6.5, 6);
  for (const [x, z] of [
    [-5, -4],
    [5, -3],
    [-8, 36],
    [8, 38],
  ])
    L.deco("palm", x, z, { s: 0.85 });

  const r = [
    [0, 5],
    { stomp: 0 },
    [5.4, 4],
    { p: [7.4, 4], air: true, r: 0.7 },
    { p: [12, 4.4], r: 0.7, timeout: 5 },
    [12, 3.2],
    [12, 5.6],
    [11, 4.4],
    { p: [6, 4], jumpAt: 9 },
    [3, 6],
    [0, 7.4],
    { p: [0, 10.8], jumpAt: 9 },
    [0, 10.8],
    [0, 12.2],
    { waitAlign: [0, 15.6], at: -0.1, tol: 0.08 },
    { p: [0, 15.6], sprint: true, r: 0.8 },
    { p: [0, 18.4], sprint: true, r: 0.8 },
    { p: [0, 21], jumpAt: 9, sprint: true },
    [0, 22],
    { stomp: 1 },
    { stomp: 2 },
    { stomp: 2 },
    [3.3, 27.4],
    [6.5, 33],
    [3.3, 38.6],
    [-3.2, 38.6],
    [-6.5, 33],
    [-3.3, 27.4],
    [0, 27],
  ];
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + i * 0.62;
    const p = [Math.cos(a) * 3.4, 33 + Math.sin(a) * 3.4];
    r.push({ p, jumpAt: 9, dj: 0.3 });
    r.push({ p, r: 0.45 });
  }
  r.push({ p: [0, 33], jumpAt: 9 }, [0, 33]);
  L.lv.route = r;
  return L.done();
}

/* ------------------------------------------------------------------ 3-6 CAPTAIN CRAB'S COVE (boss) */
function crabCove() {
  const L = build({ ...W3, id: 18, num: 6, name: "Captain Crab's Cove", coinGoal: 12, boss: { kind: "captainCrab", x: 0, y: 1, z: 42, cx: 0, cz: 34, R: 15 } });
  L.island(0, 0, 9, 9, 0.5, { wob: 0.05 });
  L.island(0, 34, 16, 16, 1, { wob: 0.02, p: 2 });
  L.spawn(0, -4, 0);
  L.sign(2.5, -2, "Captain Crab! Bubbles can be stomped. When his big claw gets stuck in the sand — jump on his shell!", Math.PI);
  L.coinLine([0, 0], [0, 6], 4);
  L.qblock(-2.5, 3.2, 4, "heart");
  L.plat(0, 0.6, 12, 3, 3, { style: "plank" });
  L.plat(0, 0.8, 15.6, 3, 3, { style: "plank" });
  L.coin(0, 1.45, 12).coin(0, 1.65, 15.6);
  L.checkpoint(0, 20.5);
  for (const a of [0.785, 2.356, 3.927, 5.498]) L.deco("palm", Math.cos(a) * 13.5, 34 + Math.sin(a) * 13.5, { s: 0.9 });
  L.coinRingG(0, 34, 11, 8);
  L.spring(-12.5, 34, { power: 27 });
  L.island(-19.6, 34, 3.2, 3.2, 9, { wob: 0.08, float: 4 });
  L.star(-19.6, 10.4, 34);
  L.coinG(-19.6, 32).coinG(-19.6, 36);
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

export const WORLD3 = [sunnyBeach, ropeBridges, waterfallCove, islandHopping, lighthouseReef, crabCove];
