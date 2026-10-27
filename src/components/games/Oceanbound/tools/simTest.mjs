/**
 * Oceanbound — headless gameplay checks against the real simulation.
 *   node src/components/games/Oceanbound/tools/simTest.mjs [group…]
 * groups: core move hook inv craft build survive water fish cook shark
 *         island save death sail objectives stress   (default: all)
 * Every check drives the sim through tick() intents the way the input layer
 * does (aim = set yaw/pitch, use = hold the tool button, …).
 */
import { createGame, tick, serialize, deserialize, craft, consume, respawn, hudSnapshot, setBuildPiece, selectSlot } from "../sim/game.js";
import { addItem, countItem, removeItem, moveSlot, createInv, newStack } from "../sim/inventory.js";
import { addPiece, canPlace, canRemove, buildColliders, CELL, WALL_H } from "../sim/raft.js";
import { islandNodes, groundHeight, islandHeight } from "../sim/islands.js";
import { waveHeight } from "../sim/waves.js";
import { EYE } from "../sim/player.js";
import { OBJECTIVES } from "../data/objectives.js";

let pass = 0;
let fail = 0;
const groups = process.argv.slice(2);
const want = (g) => !groups.length || groups.includes(g);
function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    console.log("  ✗", msg);
  }
}
const I0 = () => ({ mx: 0, my: 0, lookX: 0, lookY: 0, jump: false, jumpPressed: false, sprint: false, dive: false, use: false, usePressed: false, useReleased: false, alt: false, interact: false, rotate: false, slot: null, wheel: 0 });
const DT = 1 / 60;
function run(G, sec, f = () => ({})) {
  const n = Math.round(sec / DT);
  for (let k = 0; k < n; k++) tick(G, { ...I0(), ...f(k) }, DT);
}
function press(G, patch) {
  tick(G, { ...I0(), ...patch }, DT);
}
function aim(G, x, y, z) {
  const P = G.player;
  const ex = P.x;
  const ey = P.y + EYE;
  const ez = P.z;
  const dx = x - ex;
  const dz = z - ez;
  P.yaw = Math.atan2(-dx, -dz);
  P.pitch = Math.atan2(y - ey, Math.hypot(dx, dz));
}
const give = (G, id, n) => {
  addItem(G.inv, id, n);
  G.invVersion++;
};
const fresh = (seed = 7) => {
  const G = createGame({ seed });
  G.debris = [];
  G.shark.cd = 1e9; // keep the shark away unless a test wants it
  return G;
};
const equip = (G, id) => {
  let i = G.inv.slots.findIndex((s) => s && s.id === id);
  if (i < 0) {
    give(G, id, 1);
    i = G.inv.slots.findIndex((s) => s && s.id === id);
  }
  if (i >= 8) {
    moveSlot(G.inv, i, G.inv, 7);
    i = 7;
  }
  selectSlot(G, i);
};
const nan = (G) => !Number.isFinite(G.player.x + G.player.y + G.player.z + G.raft.x + G.raft.y + G.raft.z);

/* ------------------------------------------------------------------ core */
if (want("core")) {
  console.log("core");
  const G = fresh();
  ok(G.raft.cells.size === 4, "starts with a 2x2 raft");
  ok(G.inv.slots[0]?.id === "hook", "starts holding the hook");
  run(G, 1);
  ok(G.player.grounded && G.player.ground === "raft", "stands on the raft");
  const x0 = G.raft.x;
  run(G, 30);
  ok(G.raft.x - x0 > 10, `raft drifts with the current (${(G.raft.x - x0).toFixed(1)} m in 30 s)`);
  ok(G.player.ground === "raft" && Math.abs(G.player.x - G.raft.x) < 1.7, "player is carried by the raft");
  ok(Math.abs(G.player.y - G.raft.y) < 0.05, "feet on the deck while the raft bobs");
  ok(!nan(G), "no NaN");
}

/* ------------------------------------------------------------------ movement */
if (want("move")) {
  console.log("move");
  const G = fresh();
  G.raft.anchored = true;
  [...G.raft.pieces.values()];
  // anchor needs an anchor piece; emulate a still raft
  G.raft.vx = G.raft.vz = 0;
  run(G, 0.5);
  // walk east off the raft into the sea
  G.player.yaw = -Math.PI / 2; // look +x
  run(G, 3, () => ({ my: 1 }));
  ok(G.player.mode === "swim", "walking off the edge → swimming");
  ok(G.player.x - G.raft.x > CELL, "left the raft");
  // swim back and climb
  G.player.yaw = Math.PI / 2;
  let climbed = false;
  for (let k = 0; k < 600 && !climbed; k++) {
    const spot = G.climbSpot;
    press(G, { my: 1, jumpPressed: !!spot, jump: !!spot });
    if (G.player.mode === "walk" && G.player.ground === "raft") climbed = true;
  }
  run(G, 1);
  ok(climbed && G.player.ground === "raft", "swim back and climb aboard with Space");
  // sprint drains stamina; jumping works
  const s0 = G.stats.stamina;
  G.player.x = G.raft.x - 1.4;
  G.player.yaw = -Math.PI / 2;
  run(G, 0.5, () => ({ my: 1, sprint: true }));
  ok(G.stats.stamina < s0, "sprinting uses stamina");
  run(G, 1);
  const y0 = G.player.y;
  press(G, { jumpPressed: true, jump: true });
  run(G, 0.15);
  ok(G.player.y > y0 + 0.4, "jump lifts the player");
  run(G, 1.5);
  ok(G.player.ground === "raft" && Math.abs(G.player.y - G.raft.y) < 0.05, "lands back on the deck");
  // a wall blocks walking
  addPiece(G.raft, "wall", { kind: "edge", side: "x", i: 0, j: 0, level: 0 });
  buildColliders(G.raft);
  G.player.x = G.raft.x - 0.8;
  G.player.z = G.raft.z + 0.8;
  G.player.y = G.raft.y;
  G.player.yaw = -Math.PI / 2;
  run(G, 2, () => ({ my: 1 }));
  ok(G.player.x - G.raft.x < 0 - 0.25, `wall blocks the body (x=${(G.player.x - G.raft.x).toFixed(2)})`);
  // underwater: dive drains oxygen
  const H = fresh(9);
  H.player.x = H.raft.x + 8;
  H.player.y = -2;
  H.player.mode = "swim";
  H.player.onRaftFrame = false;
  run(H, 6, () => ({ dive: true }));
  ok(H.player.headUnder && H.stats.oxygen < 90, `diving drains oxygen (${H.stats.oxygen.toFixed(0)})`);
  run(H, 6, () => ({ jump: true }));
  ok(!H.player.headUnder && H.stats.oxygen > 90, "surfacing refills oxygen");
  ok(!nan(G) && !nan(H), "no NaN");
}

/* ------------------------------------------------------------------ hook */
if (want("hook")) {
  console.log("hook");
  const G = fresh();
  G.raft.vx = G.raft.vz = 0;
  run(G, 0.3);
  const P = G.player;
  // a plank 7 m to the east, a plastic next to it
  G.debris.push({ id: 900, kind: "plank", x: P.x + 7, z: P.z, rot: 0, spin: 0, ph: 0, hooked: false }, { id: 901, kind: "plastic", x: P.x + 7.4, z: P.z + 0.3, rot: 0, spin: 0, ph: 0, hooked: false });
  aim(G, P.x + 7, 1.2, P.z);
  P.pitch = 0.05;
  press(G, { use: true, usePressed: true });
  ok(G.hook.state === "charge", "holding use charges the throw");
  run(G, 0.45, () => ({ use: true }));
  press(G, { useReleased: true });
  ok(G.hook.state === "fly", "release throws the hook");
  let landed = false;
  for (let k = 0; k < 240 && !landed; k++) {
    press(G, {});
    landed = G.hook.state === "water";
  }
  ok(landed, "hook lands in the water");
  const dist = Math.hypot(G.hook.x - P.x, G.hook.z - P.z);
  ok(dist > 3 && dist < 20, `throw distance ${dist.toFixed(1)} m`);
  // reel it in while sweeping across the debris
  G.hook.x = P.x + 8.5;
  G.hook.z = P.z;
  const before = countItem(G.inv, "plank");
  let k = 0;
  for (; k < 900 && G.hook.state !== "idle"; k++) press(G, { use: true });
  ok(G.hook.state === "idle", "reeling brings the hook home");
  ok(countItem(G.inv, "plank") === before + 1 || countItem(G.inv, "plank") === before + 2, "the plank is collected");
  ok(countItem(G.inv, "plastic") === 1, "plastic collected in the same reel");
  ok(!G.debris.some((d) => d.id === 900 || d.id === 901), "collected debris removed from the sea");
  ok(G.inv.slots[0].dur < 140, "hook wears with use");
  // grab by hand
  G.debris.push({ id: 902, kind: "leaf", x: P.x + 1.5, z: P.z, rot: 0, spin: 0, ph: 0, hooked: false });
  aim(G, P.x + 1.5, waveHeight(P.x + 1.5, P.z, G.t), P.z);
  press(G, { interact: true });
  ok(countItem(G.inv, "leaf") >= 1, "E grabs nearby floating debris");
}

/* ------------------------------------------------------------------ inventory */
if (want("inv")) {
  console.log("inv");
  const inv = createInv(32);
  ok(addItem(inv, "plank", 45) === 0, "45 planks fit");
  ok(inv.slots.filter((s) => s && s.id === "plank").map((s) => s.n).join(",") === "30,15", "stacks of 30");
  ok(inv.slots.slice(0, 8).every((s) => !s), "materials keep out of the hotbar");
  ok(removeItem(inv, "plank", 20) === 20 && countItem(inv, "plank") === 25, "remove from stacks");
  const full = createInv(2);
  ok(addItem(full, "stone", 50) === 10, "capacity limit returns the overflow");
  const a = createInv(4);
  addItem(a, "rope", 10);
  addItem(a, "rope", 15, true);
  ok(countItem(a, "rope") === 25, "rope count");
  a.slots[0] = { id: "rope", n: 15 };
  a.slots[1] = { id: "rope", n: 10 };
  moveSlot(a, 0, a, 1);
  ok(a.slots[1].n === 20 && a.slots[0].n === 5, "drag merges stacks up to the cap");
  a.slots[2] = newStack("axe");
  moveSlot(a, 2, a, 0);
  ok(a.slots[0].id === "axe" && a.slots[2].id === "rope", "drag swaps different items");
}

/* ------------------------------------------------------------------ crafting */
if (want("craft")) {
  console.log("craft");
  const G = fresh();
  ok(!craft(G, "rope").ok, "can't craft without materials");
  give(G, "leaf", 5);
  const r = craft(G, "rope", 5);
  ok(r.ok && r.made === 2, "craft ×5 makes as many as affordable (2)");
  ok(countItem(G.inv, "leaf") === 1 && countItem(G.inv, "rope") === 2, "recipe consumed 4 leaves");
  ok(!craft(G, "chest").ok && craft(G, "chest").reason === "Recipe locked", "locked recipes can't be crafted");
  give(G, "plank", 4);
  ok(craft(G, "hammer").ok && countItem(G.inv, "hammer") === 1 && countItem(G.inv, "plank") === 0, "hammer crafted, planks consumed");
  ok(G.inv.slots.slice(0, 8).some((s) => s && s.id === "hammer"), "new tools go to the hotbar");
}

/* ------------------------------------------------------------------ building */
if (want("build")) {
  console.log("build");
  const G = fresh();
  G.raft.vx = G.raft.vz = 0;
  give(G, "plank", 30);
  give(G, "plastic", 20);
  give(G, "rope", 10);
  equip(G, "hammer");
  setBuildPiece(G, "foundation");
  run(G, 0.3);
  const P = G.player;
  const R = G.raft;
  // look at the water just east of the raft (cell i=1, j=0)
  aim(G, R.x + 1.5 * CELL, R.y, R.z + 0.5 * CELL);
  press(G, {});
  ok(G.build.ghost && G.build.ghost.ok, `ghost valid next to the raft (${G.build.ghost?.reason})`);
  press(G, { usePressed: true, use: true });
  ok(R.cells.size === 5 && countItem(G.inv, "plank") === 28 && countItem(G.inv, "plastic") === 18, "foundation placed, cost paid");
  // not connected → invalid
  aim(G, R.x + 4.5 * CELL, R.y, R.z + 0.5 * CELL);
  press(G, {});
  ok(!G.build.ghost || !G.build.ghost.ok, "detached foundation rejected");
  // walls on edges + overlap
  setBuildPiece(G, "wall");
  ok(canPlace(R, "wall", { kind: "edge", side: "z", i: 0, j: -1, level: 0 }).ok, "wall allowed on an edge");
  addPiece(R, "wall", { kind: "edge", side: "z", i: 0, j: -1, level: 0 });
  ok(!canPlace(R, "wall", { kind: "edge", side: "z", i: 0, j: -1, level: 0 }).ok, "no overlapping walls");
  ok(!canPlace(R, "roof", { kind: "cell", i: 1, j: 0, level: 1 }).ok, "roof needs support");
  ok(canPlace(R, "roof", { kind: "cell", i: 0, j: -1, level: 1 }).ok, "roof above a walled cell is ok");
  // remove (refund) + split protection
  const bridge = fresh(3);
  for (const [i, j] of [
    [1, 0],
    [2, 0],
  ])
    addPiece(bridge.raft, "foundation", { kind: "cell", i, j, level: 0 });
  ok(!canRemove(bridge.raft, { type: "foundation", i: 1, j: 0 }).ok, "removing a bridging foundation is refused");
  ok(canRemove(bridge.raft, { type: "foundation", i: 2, j: 0 }).ok, "removing a leaf foundation is fine");
  // remove with the hammer (RMB) through the real tick
  const pl0 = countItem(G.inv, "plank");
  aim(G, R.x + 1.5 * CELL, R.y - 0.1, R.z + 0.5 * CELL);
  press(G, {});
  press(G, { alt: true });
  ok(R.cells.size === 4 && countItem(G.inv, "plank") === pl0 + 2, "hammer removes a foundation with a refund");
  // colliders follow structure changes
  const n0 = R.colliders.length;
  addPiece(R, "railing", { kind: "edge", side: "x", i: -1, j: 0, level: 0 });
  buildColliders(R);
  ok(R.colliders.length === n0 + 1, "colliders rebuilt after a change");
  // stations: chest stores items, door toggles collider
  G.unlocked.add("door");
  give(G, "scrap", 2);
  ok(canPlace(R, "door", { kind: "edge", side: "x", i: 1, j: -1, level: 0 }).ok, "door on an edge");
  const door = addPiece(R, "door", { kind: "edge", side: "x", i: 1, j: -1, level: 0 });
  buildColliders(R);
  const closed = R.colliders.filter((c) => c.ref === door.id).length;
  door.state.open = true;
  buildColliders(R);
  ok(closed === 1 && R.colliders.filter((c) => c.ref === door.id).length === 3, "opening a door leaves a walkable gap");
}

/* ------------------------------------------------------------------ stairs + roof */
if (want("build")) {
  const G = fresh(3);
  const R = G.raft;
  for (const [i, j] of [
    [-1, 1],
    [0, 1],
    [-1, 2],
    [0, 2],
  ])
    addPiece(R, "foundation", { kind: "cell", i, j, level: 0 });
  addPiece(R, "stairs", { kind: "cell", i: 0, j: 0, level: 0 }, 0);
  addPiece(R, "wall", { kind: "edge", side: "x", i: 1, j: 1, level: 0 });
  ok(canPlace(R, "roof", { kind: "cell", i: 0, j: 1, level: 1 }).ok, "roof next to the stairs top");
  addPiece(R, "roof", { kind: "cell", i: 0, j: 1, level: 1 });
  addPiece(R, "roof", { kind: "cell", i: 0, j: 2, level: 1 });
  addPiece(R, "railing", { kind: "edge", side: "z", i: 0, j: 3, level: 1 });
  ok(!canPlace(R, "roof", { kind: "cell", i: 0, j: 0, level: 1 }).ok, "no roof above stairs");
  buildColliders(R);
  const P = G.player;
  P.x = R.x + 0.5 * CELL;
  P.z = R.z - 0.9;
  P.y = R.y;
  run(G, 0.5);
  P.yaw = Math.PI;
  run(G, 5, () => ({ my: 1 }));
  ok(Math.abs(P.y - R.y - WALL_H) < 0.05 && P.ground === "raft", "walk up the stairs onto the roof deck");
  ok(P.z - R.z < 3 * CELL - 0.25, "the roof railing stops you");
  P.x = R.x - 0.5 * CELL;
  P.z = R.z + 1.5 * CELL;
  P.y = R.y;
  P.yaw = -Math.PI / 2;
  run(G, 1, () => ({ my: 1 }));
  ok(Math.abs(P.y - R.y) < 0.05 && P.x - R.x < CELL, "walk under the roof; the wall below stops you");
}

/* ------------------------------------------------------------------ survival stats */
if (want("survive")) {
  console.log("survive");
  const G = fresh();
  run(G, 120);
  ok(G.stats.hunger < 90 && G.stats.thirst < 85, `hunger ${G.stats.hunger.toFixed(0)} / thirst ${G.stats.thirst.toFixed(0)} fall over 2 min`);
  G.stats.hunger = 0;
  G.stats.thirst = 0;
  const hp = G.stats.hp;
  run(G, 10);
  ok(G.stats.hp < hp - 5, "starving + dehydrated drains health");
  give(G, "coconut", 1);
  const i = G.inv.slots.findIndex((s) => s && s.id === "coconut");
  consume(G, i);
  ok(G.stats.thirst > 10 && G.stats.hunger > 5, "eating a coconut restores hunger & thirst");
  // healthy regen
  const H = fresh();
  H.stats.hp = 50;
  run(H, 30);
  ok(H.stats.hp > 55, "health regenerates when fed and watered");
}

/* ------------------------------------------------------------------ water */
if (want("water")) {
  console.log("water");
  const G = fresh();
  G.raft.vx = G.raft.vz = 0;
  give(G, "plastic", 4);
  craft(G, "cup_empty");
  equip(G, "cup_empty");
  run(G, 0.2);
  const P = G.player;
  const R = G.raft;
  aim(G, P.x + 2.6, 0, P.z);
  press(G, { usePressed: true, use: true });
  ok(G.inv.slots[G.sel]?.id === "cup_salt", "cup filled with seawater");
  // purifier
  addPiece(R, "purifier", { kind: "cell", i: 0, j: -1, level: 0 });
  buildColliders(R);
  const pur = [...R.pieces.values()].find((p) => p.type === "purifier");
  const at = { x: R.x + 0.5 * CELL, y: R.y + 0.5, z: R.z - 0.5 * CELL };
  P.x = R.x - 0.6;
  P.z = R.z - 0.6;
  aim(G, at.x, at.y, at.z);
  press(G, {});
  ok(G.prompt && /fuel/i.test(G.prompt.text), `no fuel → prompt says so (“${G.prompt?.text}”)`);
  press(G, { interact: true });
  ok(pur.state.water === 0, "can't pour without fuel");
  give(G, "leaf", 1);
  aim(G, at.x, at.y, at.z);
  press(G, { interact: true });
  ok(pur.state.water === 1 && countItem(G.inv, "leaf") === 0 && countItem(G.inv, "cup_empty") === 1, "pouring uses the cup and 1 fuel");
  run(G, 29, (k) => (k % 60 === 0 ? { slot: 0 } : {}));
  ok(pur.state.fresh === 1, "purified after ~28 s");
  // the raft drifted meanwhile: aim at where the purifier is now
  aim(G, R.x + 0.5 * CELL, R.y + 0.5, R.z - 0.5 * CELL);
  press(G, { interact: true });
  ok(countItem(G.inv, "cup_fresh") === 1 && pur.state.fresh === 0, "collected fresh water");
  G.stats.thirst = 30;
  equip(G, "cup_fresh");
  press(G, { usePressed: true, use: true });
  ok(G.stats.thirst > 60 && G.stat.drank === 1 && countItem(G.inv, "cup_empty") === 1, "drinking restores thirst and returns the cup");
}

/* ------------------------------------------------------------------ fishing */
if (want("fish")) {
  console.log("fish");
  const G = fresh(11);
  G.raft.vx = G.raft.vz = 0;
  equip(G, "rod");
  run(G, 0.2);
  const P = G.player;
  let caught = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    P.yaw = -Math.PI / 2;
    P.pitch = 0.1;
    press(G, { usePressed: true, use: true });
    run(G, 0.5, () => ({ use: true }));
    press(G, { useReleased: true });
    for (let k = 0; k < 60 * 20 && G.rod.state !== "bite"; k++) press(G, {});
    if (G.rod.state === "bite") {
      press(G, { usePressed: true, use: true });
      run(G, 0.1);
    }
    caught = G.stat.fish;
    if (caught) break;
  }
  ok(caught >= 1 || countItem(G.inv, "plastic") + countItem(G.inv, "scrap") > 0, `rod catches something (fish ${caught})`);
  ok(G.rod.state === "idle", "line comes back after a catch");
  // missing the bite window
  P.yaw = -Math.PI / 2;
  press(G, { usePressed: true, use: true });
  run(G, 0.4, () => ({ use: true }));
  press(G, { useReleased: true });
  for (let k = 0; k < 60 * 20 && G.rod.state !== "bite"; k++) press(G, {});
  run(G, 1.6);
  ok(G.rod.state === "wait", "a missed bite keeps the line waiting");
}

/* ------------------------------------------------------------------ cooking */
if (want("cook")) {
  console.log("cook");
  const G = fresh();
  G.raft.vx = G.raft.vz = 0;
  const R = G.raft;
  addPiece(R, "grill", { kind: "cell", i: 0, j: -1, level: 0 });
  buildColliders(R);
  const gr = [...R.pieces.values()].find((p) => p.type === "grill");
  give(G, "fish_raw", 2);
  give(G, "plank", 2);
  run(G, 0.2);
  const P = G.player;
  P.x = R.x - 0.5;
  P.z = R.z - 0.5;
  aim(G, R.x + 0.5 * CELL, R.y + 0.5, R.z - 0.5 * CELL);
  press(G, { interact: true });
  ok(gr.state.items.length === 1 && countItem(G.inv, "fish_raw") === 1 && countItem(G.inv, "plank") === 1, "raw fish + fuel go on the grill");
  run(G, 21);
  ok(gr.state.items[0]?.done && G.stat.cooked === 1, "fish cooks in ~20 s");
  aim(G, R.x + 0.5 * CELL, R.y + 0.5, R.z - 0.5 * CELL);
  press(G, { interact: true });
  ok(countItem(G.inv, "fish_cooked") === 1, "took the grilled fish");
  G.stats.hunger = 20;
  const i = G.inv.slots.findIndex((s) => s && s.id === "fish_cooked");
  consume(G, i);
  ok(G.stats.hunger > 45 && G.stat.ateCooked === 1, "eating cooked fish fills hunger");
}

/* ------------------------------------------------------------------ shark */
if (want("shark")) {
  console.log("shark");
  const G = fresh(5);
  G.raft.vx = G.raft.vz = 0;
  for (const [i, j] of [
    [1, -1],
    [1, 0],
  ])
    addPiece(G.raft, "foundation", { kind: "cell", i, j, level: 0 });
  buildColliders(G.raft);
  G.shark.cd = 0.5;
  let warned = false;
  let bit = false;
  for (let k = 0; k < 60 * 40 && !bit; k++) {
    press(G, {});
    if (G.shark.state === "approach") warned = true;
    if (G.shark.state === "bite") bit = true;
  }
  ok(warned && bit, "shark telegraphs, then bites a foundation");
  ok(G.events !== null, "events ok");
  const T = G.shark.target;
  const cell = G.raft.cells.get(`${T.i}:${T.j}`);
  const hp0 = cell.hp;
  run(G, 2);
  ok(cell.hp < hp0, "biting damages the foundation");
  // spear it twice
  equip(G, "spear");
  const P = G.player;
  P.x = G.raft.x + (T.i + 0.5) * CELL;
  P.z = G.raft.z + (T.j + 0.5) * CELL;
  P.y = G.raft.y;
  let hits = 0;
  for (let n = 0; n < 6 && G.shark.state === "bite"; n++) {
    aim(G, G.shark.x, G.shark.y, G.shark.z);
    press(G, { usePressed: true, use: true });
    run(G, 0.7, () => {
      aim(G, G.shark.x, G.shark.y, G.shark.z);
      return {};
    });
    hits = G.shark.hits;
  }
  ok(G.shark.state === "flee" && G.stat.repelled === 1, `spear drives the shark off (hits ${hits})`);
  // repair with the hammer
  equip(G, "hammer");
  give(G, "plank", 1);
  give(G, "plastic", 1);
  aim(G, G.raft.x + (T.i + 0.5) * CELL, G.raft.y - 0.05, G.raft.z + (T.j + 0.5) * CELL);
  press(G, {});
  press(G, { interact: true });
  ok(cell.hp === 100, "hammer + E repairs the foundation");
  // destruction of an edge foundation when left alone
  const H = fresh(6);
  for (const [i, j] of [
    [1, -1],
    [1, 0],
    [-2, 0],
  ])
    addPiece(H.raft, "foundation", { kind: "cell", i, j, level: 0 });
  buildColliders(H.raft);
  H.shark.cd = 0.2;
  const n0 = H.raft.cells.size;
  run(H, 60);
  ok(H.raft.cells.size === n0 - 1, "an unattended bite destroys a foundation");
  ok(H.debris.some((d) => d.kind === "cargo"), "its wreckage floats off as a crate");
  // hunting a swimmer
  const S = fresh(8);
  S.raft.vx = S.raft.vz = 0;
  S.player.x = S.raft.x + 14;
  S.player.y = -1.5;
  S.player.mode = "swim";
  S.player.onRaftFrame = false;
  S.shark.x = S.raft.x + 30;
  S.shark.z = S.raft.z;
  S.shark.state = "circle";
  const hp0p = S.stats.hp;
  let hunted = false;
  run(S, 25, () => {
    if (S.shark.state === "hunt" || S.shark.state === "lunge") hunted = true;
    return {};
  });
  ok(hunted && S.stats.hp < hp0p, `the shark hunts swimmers (hp ${S.stats.hp.toFixed(0)})`);
  // killing it drops meat
  const K = fresh(4);
  K.shark.state = "circle";
  for (let n = 0; n < 4; n++) {
    K.shark.state = "circle";
    // direct hit API
  }
  const { hitShark } = await import("../sim/shark.js");
  for (let n = 0; n < 4; n++) hitShark(K, 30);
  ok(K.shark.state === "dead" && K.stat.killed === 1, "four spear hits kill the shark");
  ok(K.debris.some((d) => d.items && d.items[0][0] === "shark_raw"), "it drops shark meat");
  run(K, 155);
  ok(K.shark.state !== "dead", "a new shark arrives later");
}

/* ------------------------------------------------------------------ islands */
if (want("island")) {
  console.log("island");
  const G = fresh(21);
  const I = G.world.islands.get("g0") || (await import("../sim/islands.js")).islandsNear(G.world, 205, 33, 50).find((x) => x.type === "palm");
  ok(I && I.type === "palm", "a palm island lies on the starting current");
  const nodes = islandNodes(G.world, I);
  ok(nodes.filter((n) => n.type === "palm").length >= 8, "it has palm trees");
  ok(nodes.some((n) => n.type === "crate") && nodes.some((n) => n.type === "page"), "a hidden crate and logbook page");
  // drift there: the current bends around the island and brings the raft close
  let minD = Infinity;
  for (let k = 0; k < 60 * 400; k += 1) {
    tick(G, I0(), 1 / 30);
    minD = Math.min(minD, Math.hypot(G.raft.x - I.x, G.raft.z - I.z) - I.r);
    if (G.raft.x > I.x + 60) break;
  }
  ok(minD < 30 && minD > 0, `the current carries the raft past the island (${minD.toFixed(1)} m from its beach)`);
  ok(G.stat.found.palm >= 1, "island discovered on the way");
  // land on it and walk
  const P = G.player;
  P.x = I.x - I.r * 0.4;
  P.z = I.z;
  P.y = islandHeight(I, P.x, P.z) + 0.5;
  P.mode = "walk";
  P.onRaftFrame = false;
  run(G, 2);
  ok(P.ground === "land" && P.mode === "walk", "walking on the island");
  ok(G.stat.explored.palm === 1, "landfall recorded");
  // chop a palm
  const palm = nodes.filter((n) => n.type === "palm").sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  equip(G, "axe");
  P.x = palm.x - 1.4;
  P.z = palm.z;
  P.y = islandHeight(I, P.x, P.z);
  run(G, 0.5);
  for (let n = 0; n < 3; n++) {
    aim(G, palm.x, palm.y + 1.4, palm.z);
    press(G, { use: true, usePressed: true });
    run(G, 0.75, () => {
      aim(G, palm.x, palm.y + 1.4, palm.z);
      return {};
    });
  }
  ok(countItem(G.inv, "palmwood") === 2 && countItem(G.inv, "leaf") >= 3, "three axe hits fell a palm: logs + leaves");
  ok(G.islandState[I.id].gone[palm.id] > G.t, "the tree is gone until it regrows");
  ok(G.stat.chopped === 1, "chop counted");
  // pick up a stone
  const st = nodes.find((n) => n.type === "stone");
  P.x = st.x - 1;
  P.z = st.z;
  P.y = Math.max(islandHeight(I, P.x, P.z), waveHeight(P.x, P.z, G.t) - 1);
  P.mode = "walk";
  run(G, 0.3);
  aim(G, st.x, st.y + 0.15, st.z);
  press(G, { interact: true });
  ok(countItem(G.inv, "stone") === 1, "E picks up a stone");
  // the logbook page
  const pg = nodes.find((n) => n.type === "page");
  P.x = pg.x - 1;
  P.z = pg.z + 0.2;
  P.y = islandHeight(I, P.x, P.z);
  run(G, 0.3);
  aim(G, pg.x, pg.y + 0.1, pg.z);
  press(G, { interact: true });
  ok(G.pages.length === 1 && G.reading === 0, "logbook page found and opened");
  // all three types exist on the route
  const types = new Set([...G.world.islands.values()].filter((x) => x.id.startsWith("g")).map((x) => x.type));
  ok(types.size === 3, "palm, rocky and jungle islands are all on the starting route");
  const R2 = G.world.islands.get("g1");
  const rn = islandNodes(G.world, R2);
  ok(rn.some((n) => n.type === "boulder") && rn.some((n) => n.type === "clay"), "rocky island has ore and clay");
  const J = G.world.islands.get("g2");
  const jn = islandNodes(G.world, J);
  ok(["mango", "bamboo", "vine", "jtree"].every((t) => jn.some((n) => n.type === t)), "jungle island has mango, bamboo, vines, trees");
  ok(groundHeight(G.world, I.x, I.z) > 2, "island centre is above water");
}

/* ------------------------------------------------------------------ save / load */
if (want("save")) {
  console.log("save");
  const G = fresh(31);
  give(G, "plank", 17);
  give(G, "rope", 3);
  addPiece(G.raft, "foundation", { kind: "cell", i: 1, j: 0, level: 0 });
  addPiece(G.raft, "wall", { kind: "edge", side: "z", i: 0, j: 0, level: 0 });
  const ch = addPiece(G.raft, "chest", { kind: "cell", i: 1, j: 0, level: 0 });
  ch.state.slots[3] = { id: "stone", n: 7 };
  G.unlocked.add("chest");
  G.done.add("planks");
  G.pages.push(0);
  G.islandState.g0 = { gone: { 3: 999 }, hits: {}, fruit: {} };
  G.stats.hunger = 42;
  run(G, 5);
  const json = JSON.stringify(serialize(G));
  const H = deserialize(JSON.parse(json));
  ok(H && countItem(H.inv, "plank") === 17 && countItem(H.inv, "rope") === 3, "inventory restored");
  ok(H.raft.cells.size === 5 && H.raft.pieces.size === 2, "raft foundations + pieces restored");
  const ch2 = [...H.raft.pieces.values()].find((p) => p.type === "chest");
  ok(ch2 && ch2.state.slots[3]?.n === 7, "chest contents restored");
  ok(H.unlocked.has("chest") && H.done.has("planks"), "unlocks + objectives restored");
  ok(H.pages.length === 1 && H.islandState.g0.gone[3] === 999, "logbook + island harvest state restored");
  ok(Math.abs(H.stats.hunger - G.stats.hunger) < 0.01, "stats restored");
  ok(H.player.onRaftFrame && Math.abs(H.player.x - H.raft.x - (G.player.x - G.raft.x)) < 0.01, "player restored on the raft");
  ok(Math.abs(H.raft.x - G.raft.x) < 1e-6 && H.seed === G.seed, "world seed + raft position restored");
  run(H, 2);
  ok(H.player.ground === "raft" && !nan(H), "restored game runs");
  // corrupted / partial saves never crash
  ok(deserialize(null) === null && deserialize({}) === null, "garbage → null");
  const weird = deserialize({ seed: 5, v: 1, inv: [["nonsense", 4], ["plank", 9999], 0, "x"], raft: { cells: [[0, 0, 50], ["a"]], pieces: [{ t: "wall", k: "edge", s: "z", i: 0, j: 0, l: 0 }, { t: "laser", k: "cell" }] }, stats: { hp: "NaN" }, done: ["nope"], unlocked: ["nope"], pages: [99, 1] });
  ok(weird && countItem(weird.inv, "plank") === 30 && weird.raft.cells.size === 1 && weird.raft.pieces.size === 1, "bad entries dropped, valid ones clamped");
  run(weird, 1);
  ok(!nan(weird), "patched save runs");
}

/* ------------------------------------------------------------------ death */
if (want("death")) {
  console.log("death");
  const G = fresh(41);
  give(G, "plank", 12);
  give(G, "coconut", 2);
  G.raft.vx = G.raft.vz = 0;
  const P = G.player;
  P.x = G.raft.x + 10;
  P.y = -1.5;
  P.mode = "swim";
  P.onRaftFrame = false;
  G.stats.hp = 5;
  G.hurt(10, "shark");
  ok(G.dead && G.dead.cause === "shark", "death recorded");
  ok(G.satchel && G.satchel.items.length === 2 && countItem(G.inv, "plank") === 0, "materials go into a satchel");
  ok(countItem(G.inv, "hook") === 1, "tools are kept");
  run(G, 2);
  respawn(G);
  ok(!G.dead && P.ground !== "land" && Math.abs(P.x - G.raft.x) < 3, "respawned on the raft");
  ok(G.stats.hp === 65, "recovered health");
  // swim to the satchel and recover it
  P.x = G.satchel.x - 1.2;
  P.z = G.satchel.z;
  P.y = -1.5;
  P.mode = "swim";
  P.onRaftFrame = false;
  run(G, 0.3);
  aim(G, G.satchel.x, waveHeight(G.satchel.x, G.satchel.z, G.t) + 0.1, G.satchel.z);
  press(G, { interact: true });
  ok(!G.satchel && countItem(G.inv, "plank") === 12, "satchel recovered");
}

/* ------------------------------------------------------------------ sail / anchor */
if (want("sail")) {
  console.log("sail");
  const G = fresh(51);
  const R = G.raft;
  const sail = addPiece(R, "sail", { kind: "cell", i: 0, j: 0, level: 0 });
  addPiece(R, "anchor", { kind: "cell", i: -1, j: -1, level: 0 });
  buildColliders(R);
  run(G, 0.2);
  const P = G.player;
  P.x = R.x - 0.6 * CELL;
  P.z = R.z + 0.5 * CELL;
  aim(G, R.x + 0.5 * CELL, R.y + 1.6, R.z + 0.5 * CELL);
  press(G, {});
  ok(G.target?.kind === "piece" && R.pieces.get(G.target.id)?.type === "sail", "looking at the mast targets the sail");
  P.yaw = 0; // face north (-z) while raising
  aim(G, R.x + 0.5 * CELL, R.y + 1.6, R.z + 0.5 * CELL);
  const yawRaise = P.yaw;
  press(G, { interact: true });
  ok(R.sail.open && Math.abs(R.sail.heading - yawRaise) < 1e-6, "E raises the sail toward the view");
  const z0 = R.z;
  const x0 = R.x;
  run(G, 20);
  const dir = [R.x - x0, R.z - z0];
  const want_ = [-Math.sin(yawRaise), -Math.cos(yawRaise)];
  const along = (dir[0] * want_[0] + dir[1] * want_[1]) / 20;
  ok(along > 1.2, `sailing moves the raft along the heading (${along.toFixed(2)} m/s)`);
  void sail;
  // anchor stops it
  const an = [...R.pieces.values()].find((p) => p.type === "anchor");
  P.x = R.x - 0.2;
  P.z = R.z + 0.6;
  P.y = R.y;
  aim(G, R.x - 0.5 * CELL, R.y + 0.5, R.z - 0.5 * CELL);
  press(G, { interact: true });
  ok(R.anchored && !R.sail.open, "dropping the anchor lowers the sail");
  run(G, 6);
  const x1 = R.x;
  run(G, 5);
  ok(Math.abs(R.x - x1) < 0.05, "anchored raft holds position");
  void an;
}

/* ------------------------------------------------------------------ objectives */
if (want("objectives")) {
  console.log("objectives");
  ok(OBJECTIVES.length >= 25, `${OBJECTIVES.length} objectives`);
  const G = fresh(61);
  give(G, "plank", 10);
  G.stat.collected.plank = 10;
  run(G, 1);
  ok(G.done.has("planks"), "objective completes from real counters");
  give(G, "leaf", 2);
  craft(G, "rope");
  run(G, 1);
  ok(G.done.has("rope"), "craft objective");
  for (const [i, j] of [
    [1, 0],
    [1, -1],
  ])
    addPiece(G.raft, "foundation", { kind: "cell", i, j, level: 0 });
  run(G, 1);
  ok(G.done.has("expand6") && G.unlocked.has("chest") && G.unlocked.has("net"), "expand6 unlocks chest + collection net");
  const snap = hudSnapshot(G);
  ok(snap.objs.length === 3 && !snap.objs.some((o) => G.done.has(o.id)), "tracker shows the next 3 open objectives");
  // collection net catches drifting debris
  const N = fresh(62);
  N.unlocked.add("net");
  const net = addPiece(N.raft, "net", { kind: "edge", side: "x", i: 1, j: 0, level: 0 });
  buildColliders(N.raft);
  N.debris.push({ id: 5, kind: "plank", x: N.raft.x + CELL + 0.75, z: N.raft.z + 0.5 * CELL, rot: 0, spin: 0, ph: 0, hooked: false });
  run(N, 0.2);
  ok((net.state.items.plank || 0) >= 1, "collection net catches debris");
}

/* ------------------------------------------------------------------ stress */
if (want("stress")) {
  console.log("stress");
  const G = createGame({ seed: 99 });
  let maxDebris = 0;
  const t0 = Date.now();
  let r = 1;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 60 * 60 * 20; k++) {
    const I = I0();
    I.mx = rnd() - 0.5;
    I.my = rnd() < 0.6 ? 1 : 0;
    I.lookX = (rnd() - 0.5) * 0.05;
    I.jumpPressed = rnd() < 0.01;
    I.jump = I.jumpPressed;
    I.usePressed = rnd() < 0.01;
    I.use = rnd() < 0.3;
    tick(G, I, DT);
    if (G.dead) respawn(G);
    G.events.length = 0;
    maxDebris = Math.max(maxDebris, G.debris.length);
    if (nan(G)) break;
  }
  ok(!nan(G), "20 min of random play: no NaN");
  ok(maxDebris < 120, `debris recycled (max ${maxDebris})`);
  ok(G.world.islands.size < 60, `island cache bounded (${G.world.islands.size})`);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s for 20 min of sim, raft travelled ${G.stat.distance.toFixed(0)} m, day ${G.day})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
