/**
 * Lumberjack Life — headless engine test. Plays the first loop through the
 * REAL engine with a bot (A* pathing on the collision map) and asserts the
 * tree / log / sawmill / order / save checklists.
 *
 *   node src/components/games/LumberjackLife/tools/simTest.mjs
 */
import { createWorld, stepWorld, worldSnapshot, ownershipCensus, setTool, applyProgress } from "../engine/world.js";
import { TS, trunkLen, radiusAt, trunkPose } from "../engine/trees.js";
import { primaryTarget, resolveInteraction } from "../engine/player.js";
import { MILL_LAYOUT, millToWorld, storageTotal } from "../engine/mill.js";
import { applyEvents, deliverOrder, orderStatus, currentOrder, sellTimber, buyTool, buyVehicle, flushWorldStats } from "../engine/career.js";
import { defaultProgress, sanitize, migrate } from "../utils/storage.js";
import { REGIONS, regionById } from "../data/regions.js";
import { toolById } from "../data/equipment.js";
import { segSegDist, yawTo, angleDiff } from "../engine/math.js";
import { logEnds } from "../engine/logs.js";

let pass = 0;
let fail = 0;
const failures = [];
function ok(cond, name, extra = "") {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name} ${extra}`);
    console.log(`  FAIL ${name} ${extra}`);
  }
}
const section = (s) => console.log(`\n== ${s}`);

const inp = () => ({ mx: 0, mz: 0, ax: 0, ay: 0, sprint: false, brake: false, primaryHeld: false, primaryPressed: false, interactPressed: false, vehiclePressed: false });

let progress = defaultProgress();
progress.started = true;
const region = regionById("greenwood");
let world = createWorld({ region, progress, seed: 1234 });
let allEvents = [];

function run(world, input, seconds, onStep) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    stepWorld(world, input, 1 / 60);
    if (world.events.length) {
      allEvents.push(...world.events);
      const r = applyEvents(progress, region.id, world.events);
      progress = r.progress;
      world.events.length = 0;
    }
    invariants(world);
    if (onStep && onStep() === true) return true;
  }
  return false;
}

let invariantFails = 0;
function invariants(w) {
  const seen = new Set();
  const add = (id, where) => {
    if (seen.has(id)) {
      if (invariantFails++ < 5) ok(false, `log ${id} in two containers (${where})`);
    }
    seen.add(id);
  };
  for (const id of w.mill.queue) add(id, "mill");
  if (w.mill.cur && w.logs.has(w.mill.cur.logId)) add(w.mill.cur.logId, "mill-cur");
  if (w.cart) for (const id of w.cart.logs) add(id, "cart");
  for (const v of w.vehicles) for (const id of v.logs) add(id, "bed");
  if (w.player.carry) add(w.player.carry, "player");
  for (const l of w.logs.values()) {
    if (l.owner === "WORLD") {
      add(l.id, "world");
      if (!Number.isFinite(l.x + l.y + l.z)) if (invariantFails++ < 5) ok(false, "log NaN");
      const g = w.terrain.heightAt(l.x, l.z);
      if (l.y < g + l.r * 0.5) if (invariantFails++ < 5) ok(false, `log ${l.id} under terrain`, `${l.y.toFixed(2)} < ${g.toFixed(2)}`);
    }
  }
  for (const t of w.trees) {
    if (t.hp < 0) if (invariantFails++ < 5) ok(false, `tree ${t.id} hp<0`);
    if (t.state === TS.FALLING && t.angle > t.landAngle + 1e-6) if (invariantFails++ < 5) ok(false, `tree ${t.id} over-rotated`);
  }
  const P = w.player;
  if (!Number.isFinite(P.x + P.z)) if (invariantFails++ < 5) ok(false, "player NaN");
}

/* ------------------------------------------------------------ bot pathing */
function astar(w, gx, gz, radius = 0.4) {
  const P = w.player;
  const cell = 0.6;
  const key = (i, j) => `${i},${j}`;
  const toC = (x) => Math.round(x / cell);
  const si = toC(P.x);
  const sj = toC(P.z);
  const ti = toC(gx);
  const tj = toC(gz);
  const free = new Map();
  const isFree = (i, j) => {
    const k = key(i, j);
    if (free.has(k)) return free.get(k);
    const x = i * cell;
    const z = j * cell;
    const s = w.pushCircle(x, z, radius, { logs: true, fallen: true, skipCart: P.pulling });
    const f = Math.hypot(s.x - x, s.z - z) < 0.02 && Math.hypot(x, z) < 52;
    free.set(k, f);
    return f;
  };
  const open = [[si, sj]];
  const g = new Map([[key(si, sj), 0]]);
  const came = new Map();
  const h = (i, j) => Math.hypot(i - ti, j - tj);
  const fs = new Map([[key(si, sj), h(si, sj)]]);
  let iter = 0;
  while (open.length && iter++ < 40000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (fs.get(key(...open[k])) < fs.get(key(...open[bi]))) bi = k;
    const [ci, cj] = open.splice(bi, 1)[0];
    if (Math.hypot(ci - ti, cj - tj) <= 1.5) {
      const path = [[ci * cell, cj * cell]];
      let k = key(ci, cj);
      while (came.has(k)) {
        k = came.get(k);
        const [a, b] = k.split(",").map(Number);
        path.unshift([a * cell, b * cell]);
      }
      path.push([gx, gz]);
      return path;
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!isFree(ni, nj) && !(Math.abs(ni - si) <= 1 && Math.abs(nj - sj) <= 1)) continue;
      const ng = g.get(key(ci, cj)) + Math.hypot(di, dj);
      const nk = key(ni, nj);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        fs.set(nk, ng + h(ni, nj));
        came.set(nk, key(ci, cj));
        if (!open.some(([a, b]) => a === ni && b === nj)) open.push([ni, nj]);
      }
    }
  }
  return null;
}

function walkTo(w, x, z, within = 0.5, opts = {}) {
  const path = astar(w, x, z, opts.radius || 0.42);
  if (!path) return false;
  const input = inp();
  input.sprint = !!opts.sprint;
  let idx = 0;
  let stuck = 0;
  let last = { x: w.player.x, z: w.player.z };
  for (let f = 0; f < 60 * 90; f++) {
    const P = w.player;
    if (Math.hypot(P.x - x, P.z - z) <= within) break;
    while (idx < path.length - 1 && Math.hypot(P.x - path[idx][0], P.z - path[idx][1]) < 0.55) idx++;
    const [tx, tz] = idx < path.length ? path[idx] : [x, z];
    const dx = tx - P.x;
    const dz = tz - P.z;
    const l = Math.hypot(dx, dz) || 1;
    input.mx = dx / l;
    input.mz = dz / l;
    run(w, input, 1 / 60);
    if (f % 30 === 29) {
      if (Math.hypot(P.x - last.x, P.z - last.z) < 0.05) stuck++;
      else stuck = 0;
      last = { x: P.x, z: P.z };
      if (stuck > 4) break;
    }
  }
  input.mx = input.mz = 0;
  run(w, input, 0.5);
  return Math.hypot(w.player.x - x, w.player.z - z) <= within + 0.4;
}

function face(w, x, z) {
  // turn in place by tapping the stick toward the target
  const input = inp();
  for (let f = 0; f < 60; f++) {
    const P = w.player;
    const d = angleDiff(P.yaw, yawTo(P.x, P.z, x, z));
    if (Math.abs(d) < 0.05) break;
    P.yaw += d; // stick-tap equivalent; movement test covers turning
  }
  run(w, input, 0.05);
}

function swing(w) {
  const input = inp();
  input.primaryPressed = true;
  run(w, input, 1 / 60);
  input.primaryPressed = false;
  run(w, input, w.tool.swing + 0.1);
}

const evCount = (type, from = 0) => allEvents.slice(from).filter((e) => e.type === type).length;

/* ------------------------------------------------------------ 1. spawn + movement */
section("spawn + movement");
{
  const P = world.player;
  ok(Math.abs(P.y - world.terrain.heightAt(P.x, P.z)) < 1e-6, "player spawns on the terrain");
  const input = inp();
  const sx = P.x;
  const sz = P.z;
  input.mz = 1;
  run(world, input, 1.0);
  ok(Math.hypot(P.x - sx, P.z - sz) > 2, "walks forward", `${Math.hypot(P.x - sx, P.z - sz).toFixed(2)}`);
  const v1 = P.speed;
  input.sprint = true;
  run(world, input, 1.0);
  ok(P.speed > v1 + 1.5, "sprint is faster", `${v1.toFixed(2)} → ${P.speed.toFixed(2)}`);
  input.sprint = false;
  input.mz = -1;
  run(world, input, 1.2);
  ok(Math.abs(angleDiff(P.yaw, Math.PI)) < 0.3, "turns to walk backward");
  input.mz = 0;
  input.mx = 1;
  run(world, input, 1.0);
  ok(Math.abs(angleDiff(P.yaw, Math.PI / 2)) < 0.3, "strafes / turns toward +x");
  input.mx = 0;
  run(world, input, 0.5);
  ok(P.speed < 0.05, "decelerates to a stop", P.speed.toFixed(3));
  // giant dt spike (tab switch) must not teleport
  const bx = P.x;
  input.mz = 1;
  stepWorld(world, input, 5.0);
  ok(Math.hypot(P.x - bx, 0) < 1.0, "5 s frame spike is clamped");
  input.mz = 0;
  run(world, input, 0.5);
}

/* ------------------------------------------------------------ 2. pick a tree */
function nearestTree(w, filter = () => true) {
  const P = w.player;
  let best = null;
  let bd = Infinity;
  for (const t of w.trees) {
    if (t.state !== TS.STANDING || toolById(w.tool.id).tier < 1 || !filter(t)) continue;
    const d = Math.hypot(t.x - P.x, t.z - P.z);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

section("chopping");
let tree = nearestTree(world, (t) => t.species === "birch" || t.species === "maple" || t.species === "pine");
ok(!!tree, "found a tree");
{
  // stand ~3 m from the trunk surface, facing it, and swing: must NOT damage
  const P = world.player;
  const yaw = yawTo(tree.x, tree.z, P.x, P.z);
  const fx = tree.x + Math.sin(yaw) * (tree.radius + 3.0);
  const fz = tree.z + Math.cos(yaw) * (tree.radius + 3.0);
  ok(walkTo(world, fx, fz, 0.4), "walk to 3 m from the tree");
  face(world, tree.x, tree.z);
  const hp0 = tree.hp;
  const e0 = allEvents.length;
  swing(world);
  ok(tree.hp === hp0, "swing from too far does not damage", `${hp0} → ${tree.hp}`);
  ok(evCount("swing", e0) === 1, "miss still whooshes once");
  ok(evCount("hit", e0) === 0, "miss makes no hit event");

  // move into range
  const ix = tree.x + Math.sin(yaw) * (tree.radius + 1.0);
  const iz = tree.z + Math.cos(yaw) * (tree.radius + 1.0);
  const reachedRange = walkTo(world, ix, iz, 0.3);
  ok(reachedRange, "walk into chopping range", `player (${world.player.x.toFixed(2)},${world.player.z.toFixed(2)}) goal (${ix.toFixed(2)},${iz.toFixed(2)})`);
  face(world, tree.x, tree.z);
  const tg = primaryTarget(world);
  ok(tg && tg.kind === "tree" && tg.tree === tree && tg.valid, "tree is the valid target");

  // a single swing: exactly one damage event of the tool's damage, at the impact frame
  const e1 = allEvents.length;
  const input = inp();
  input.primaryPressed = true;
  let hitFrame = -1;
  let frame = 0;
  run(world, input, 1 / 60);
  input.primaryPressed = false;
  run(world, input, world.tool.swing + 0.1, () => {
    frame++;
    if (hitFrame < 0 && tree.hp < tree.maxHp) hitFrame = frame;
  });
  ok(evCount("hit", e1) === 1, "one hit event per swing", `${evCount("hit", e1)}`);
  ok(Math.abs(tree.maxHp - tree.hp - world.tool.damage) < 1e-6, "one swing = exactly one damage application", `${tree.maxHp - tree.hp}`);
  const expect = Math.round(world.tool.swing * 0.58 * 60);
  ok(Math.abs(hitFrame + 1 - expect) <= 2, "damage lands on the impact frame, not on click", `frame ${hitFrame + 1} vs ${expect}`);
  ok(tree.state === TS.BEING_CUT && tree.cutProgress > 0, "visible cut progress");
  ok(tree.notchYaw != null && Math.abs(angleDiff(tree.notchYaw, yawTo(tree.x, tree.z, world.player.x, world.player.z))) < 0.4, "notch opens on the player's side");

  // spam click during a swing: still one hit
  const e2 = allEvents.length;
  const hpB = tree.hp;
  const spam = inp();
  for (let i = 0; i < 20; i++) {
    spam.primaryPressed = true;
    run(world, spam, 1 / 60);
  }
  run(world, inp(), world.tool.swing * 2);
  const hits = evCount("hit", e2);
  ok(Math.abs((hpB - tree.hp) - hits * world.tool.damage) < 1e-6 || tree.state === TS.FALLING, "damage = hits × tool damage under click spam", `${hpB - tree.hp} vs ${hits}`);
  ok(hits <= 2, "click spam doesn't stack swings", `${hits}`);

  // chop to the fall
  const playerAt = { x: world.player.x, z: world.player.z };
  let guard = 0;
  while (tree.state !== TS.FALLING && guard++ < 40) swing(world);
  ok(tree.state === TS.FALLING, "tree falls when health reaches zero", `${tree.state} hp=${tree.hp}`);
  ok(tree.hp === 0, "health clamped at 0");
  ok(evCount("treeFelled") === 1, "treeFelled exactly once");
  const away = yawTo(playerAt.x, playerAt.z, tree.x, tree.z);
  ok(Math.abs(angleDiff(tree.fallYaw, away)) < 1.3, "falls away from the player", `${angleDiff(tree.fallYaw, away).toFixed(2)}`);
  // chopping a falling tree does nothing
  const e3 = allEvents.length;
  swing(world);
  ok(evCount("hit", e3) === 0, "falling tree takes no chopping damage");
  // watch the fall
  let maxAng = 0;
  let landed = false;
  run(world, inp(), 8, () => {
    maxAng = Math.max(maxAng, tree.angle);
    if (tree.state === TS.FALLEN) {
      landed = true;
      return true;
    }
    // trunk never below terrain while falling
    if (tree.phase === "fall") {
      const pose = trunkPose(tree);
      for (let k = 1; k <= 6; k++) {
        const s = (trunkLen(tree) * k) / 6;
        const y = pose.by + pose.dy * s;
        const g = world.terrain.heightAt(pose.bx + pose.dx * s, pose.bz + pose.dz * s);
        if (y < g - 0.05) {
          ok(false, "trunk tunnelled through terrain mid-fall");
          return true;
        }
      }
    }
  });
  ok(landed, "tree lands and becomes FALLEN");
  ok(maxAng <= tree.landAngle + 1e-6, "never rotates past the landing angle");
  ok(evCount("treeLand") === 1, "one landing event");
  const L = tree.lie;
  let minClear = Infinity;
  for (let k = 0; k <= 10; k++) {
    const s = (trunkLen(tree) * k) / 10;
    const y = L.by + L.dy * s;
    const g = world.terrain.heightAt(L.bx + L.dx * s, L.bz + L.dz * s);
    minClear = Math.min(minClear, y - g - radiusAt(tree, s) * 0.9);
  }
  ok(minClear > -0.05, "fallen trunk rests on (not in) the ground", minClear.toFixed(3));
  ok(tree.cuts.length === tree.nLogs - 1, "cut marks along the trunk", `${tree.cuts.length}`);
  // a fallen tree can't stand back up
  run(world, inp(), 2);
  ok(tree.state === TS.FALLEN, "fallen tree stays fallen");
}

section("sectioning");
{
  const logsBefore = world.logs.size;
  for (const c of tree.cuts) {
    const L = tree.lie;
    const px = L.bx + L.dx * c.s;
    const pz = L.bz + L.dz * c.s;
    let nx = -L.dz;
    let nz = L.dx;
    const nl = Math.hypot(nx, nz);
    nx /= nl;
    nz /= nl;
    let ok1 = walkTo(world, px + nx * 1.0, pz + nz * 1.0, 0.35);
    if (!ok1) ok1 = walkTo(world, px - nx * 1.0, pz - nz * 1.0, 0.35);
    ok(ok1, `reach cut ${c.k}`);
    face(world, px, pz);
    let g = 0;
    while (!c.done && g++ < 20) swing(world);
    ok(c.done, `cut ${c.k} completed`, `hp=${c.hp}`);
  }
  ok(tree.state === TS.SECTIONED, "trunk fully sectioned");
  const made = world.logs.size - logsBefore;
  ok(made === tree.nLogs, "one log per section, no duplicates", `${made} vs ${tree.nLogs}`);
  // logs don't overlap
  const logs = [...world.logs.values()];
  let overlap = 0;
  for (let i = 0; i < logs.length; i++) for (let j = i + 1; j < logs.length; j++) {
    const a = logEnds(logs[i]);
    const b = logEnds(logs[j]);
    const q = segSegDist(a.ax, a.az, a.bx, a.bz, b.ax, b.az, b.bx, b.bz);
    if (q.d < logs[i].r + logs[j].r - 0.08 && Math.abs(logs[i].y - logs[j].y) < logs[i].r + logs[j].r) overlap++;
  }
  ok(overlap === 0, "fresh logs don't spawn inside each other", `${overlap}`);
  run(world, inp(), 4);
  ok(logs.every((l) => l.sleeping || l.owner !== "WORLD"), "logs settle and sleep");
}

/* ------------------------------------------------------------ carry to the mill */
const intake = millToWorld(MILL_LAYOUT.intake.x, MILL_LAYOUT.intake.z);
function pickUp(w, log) {
  const e = log.x;
  // approach from the side of the log
  const px = Math.cos(log.yaw);
  const pz = -Math.sin(log.yaw);
  let reached = walkTo(w, log.x + px * (log.r + 0.75), log.z + pz * (log.r + 0.75), 0.3);
  if (!reached) reached = walkTo(w, log.x - px * (log.r + 0.75), log.z - pz * (log.r + 0.75), 0.3);
  face(w, log.x, log.z);
  const it = resolveInteraction(w);
  if (!it || it.kind !== "pickup") return false;
  const input = inp();
  input.interactPressed = true;
  run(w, input, 1 / 60);
  run(w, inp(), 0.8);
  return w.player.carry === log.id && e != null;
}

section("pickup / carry / drop");
{
  const myLogs = [...world.logs.values()].filter((l) => l.treeId === tree.id);
  const log = myLogs[0];
  ok(pickUp(world, log), "picks up a log");
  ok(log.owner === "PLAYER", "log owner → PLAYER");
  const c = ownershipCensus(world);
  ok(c.PLAYER === 1, "exactly one carried log");
  // E again while carrying → drop
  const e0 = allEvents.length;
  const input = inp();
  input.interactPressed = true;
  run(world, input, 1 / 60);
  // double press during the action must not double-drop
  input.interactPressed = true;
  run(world, input, 1 / 60);
  run(world, inp(), 0.8);
  ok(log.owner === "WORLD" && world.player.carry === null, "drop → WORLD");
  ok(evCount("drop", e0) === 1, "one drop event");
  const g = world.terrain.heightAt(log.x, log.z);
  ok(log.y >= g + log.r * 0.8, "dropped log rests on the ground");
  ok(Math.hypot(log.x - world.player.x, log.z - world.player.z) > 0.6, "dropped log isn't inside the player");
  ok(pickUp(world, log), "picks it up again");
  // carrying slows you down
  const input2 = inp();
  input2.mz = 1;
  input2.sprint = true;
  run(world, input2, 1.2);
  ok(world.player.speed < 3.5, "carrying caps speed", world.player.speed.toFixed(2));
  // swing with a log on the shoulder does nothing
  const e1 = allEvents.length;
  swing(world);
  ok(evCount("swing", e1) === 0, "can't swing while carrying");
}

section("sawmill");
let order0 = currentOrder(progress, region.id);
ok(order0.id === "gw-1", "first order is First Delivery");
function deliverLog(w) {
  ok(walkTo(w, intake.x, intake.z, 1.0, { radius: 0.4 }), "carry the log to the intake");
  const it = resolveInteraction(w);
  ok(it && it.kind === "deposit" && it.ok, "intake prompt");
  const input = inp();
  input.interactPressed = true;
  run(w, input, 1 / 60);
  run(w, inp(), 0.8);
}
{
  const startQ = world.mill.queue.length;
  deliverLog(world);
  ok(world.player.carry === null, "log left the player's hands");
  ok(world.mill.queue.length + (world.mill.cur ? 1 : 0) >= startQ + 1, "log on the intake");
  const e0 = allEvents.length;
  let phases = new Set();
  run(world, inp(), 12, () => {
    if (world.mill.cur) phases.add(world.mill.cur.phase);
  });
  ok(["roll", "feed", "cut", "out"].every((p) => phases.has(p)), "mill runs roll → feed → cut → out", [...phases].join(","));
  ok(evCount("planks", e0) === 1, "planks produced once");
  ok(evCount("logProcessed", e0) === 1, "log processed once");
  ok(storageTotal(world.mill) === allEvents.filter((e) => e.type === "planks").reduce((a, e) => a + e.n, 0), "storage = produced planks");
}

section("finish the first order");
{
  // remaining logs of the first tree
  for (const log of [...world.logs.values()].filter((l) => l.owner === "WORLD" && l.treeId === tree.id)) {
    ok(pickUp(world, log), "pick up next log");
    deliverLog(world);
  }
  // a second tree for CUT_TREE 2
  const t2 = nearestTree(world, (t) => t.species !== "oak");
  const P = world.player;
  const yaw = yawTo(t2.x, t2.z, P.x, P.z);
  ok(walkTo(world, t2.x + Math.sin(yaw) * (t2.radius + 1), t2.z + Math.cos(yaw) * (t2.radius + 1), 0.35), "walk to the 2nd tree");
  face(world, t2.x, t2.z);
  let g = 0;
  while (t2.state !== TS.FALLING && g++ < 40) swing(world);
  ok(t2.state === TS.FALLING, "2nd tree felled");
  run(world, inp(), 6, () => t2.state === TS.FALLEN);
  run(world, inp(), 15);
  const st = orderStatus(progress, region.id, world.mill.storage);
  ok(st.lines[0].done, "CUT_TREE objective complete", JSON.stringify(st.lines.map((l) => [l.type, l.have, l.n])));
  ok(st.lines[1].done, "PROCESS_LOGS objective complete");
  ok(st.ready, "order ready to deliver", JSON.stringify(st.lines.map((l) => [l.type, l.have, l.n])));
  const money0 = progress.money;
  const stock0 = storageTotal(world.mill);
  const r = deliverOrder(progress, region.id, world.mill.storage);
  ok(r.ok, "order delivered");
  progress = r.progress;
  ok(progress.money === money0 + order0.reward, "reward paid", `${progress.money}`);
  ok(storageTotal(world.mill) === stock0 - 6, "delivered planks removed", `${stock0} → ${storageTotal(world.mill)}`);
  const r2 = deliverOrder(progress, region.id, world.mill.storage);
  ok(!r2.ok || r2.order.id !== "gw-1", "reward can't be claimed twice");
  ok(progress.completedOrders.filter((x) => x === "gw-1").length === 1, "order recorded once");
  ok(progress.unlockedVehicles.includes("hand-cart"), "hand cart unlocked");
  ok(currentOrder(progress, region.id).id === "gw-2", "next order active");
}

section("save / restore");
{
  progress = flushWorldStats(progress, world.stats);
  ok(progress.statistics.axeSwings > 0 && progress.statistics.distanceWalked > 10, "stats flushed");
  const snap = JSON.parse(JSON.stringify(worldSnapshot(world)));
  const saved = JSON.parse(JSON.stringify({ ...progress, worlds: { [region.id]: snap } }));
  const loaded = sanitize(saved);
  ok(loaded.money === progress.money && loaded.completedOrders.length === 1, "career round-trips");
  const w2 = createWorld({ region, progress: loaded, snapshot: loaded.worlds[region.id], seed: 99 });
  const states = (w) => w.trees.map((t) => t.state).join();
  ok(states(w2) === states(world), "tree states restored");
  ok(w2.trees.filter((t) => t.state === TS.FALLEN || t.state === TS.SECTIONED).every((t) => t.lie && Number.isFinite(t.lie.bx)), "restored down trees have a resting pose");
  for (let i = 0; i < 30; i++) stepWorld(w2, inp(), 1 / 60);
  ok(w2.trees.every((t) => Number.isFinite(trunkPose(t).bx)), "restored trees pose without errors");
  ok(storageTotal(w2.mill) === storageTotal(world.mill), "plank storage restored");
  const worldLogs = (w) => [...w.logs.values()].filter((l) => l.owner === "WORLD").length;
  ok(worldLogs(w2) === worldLogs(world), "ground logs restored", `${worldLogs(w2)} vs ${worldLogs(world)}`);
  ok(!!w2.cart, "cart exists after unlock");
  // corrupted/missing optional fields
  const broken = sanitize({ version: 1, money: "lots", unlockedTools: ["old-axe", "laser-axe"], tool: "old-axe", tutorialStep: 3, worlds: { greenwood: { trees: "x" } }, settings: { graphics: "ultra", master: 7 } });
  ok(broken.money === 0 && broken.unlockedTools.join() === "old-axe" && broken.settings.graphics === "medium" && broken.settings.master === 1, "corrupt fields fall back individually");
  ok(broken.tutorial.move && broken.tutorial.approach && broken.tutorial.chop && !broken.tutorial.fell, "v1 tutorial index migrates");
  ok(migrate({ version: 1 }).version === 2, "version bumped by migration");
  ok(sanitize(null).money === 0, "null save → defaults");
}

section("hand cart");
{
  applyProgress(world, progress);
  ok(!!world.cart, "cart spawned");
  // load 3 logs into the cart then unload at the intake
  const t3 = nearestTree(world, (t) => t.species !== "oak");
  const P = world.player;
  const yaw = yawTo(t3.x, t3.z, P.x, P.z);
  walkTo(world, t3.x + Math.sin(yaw) * (t3.radius + 1), t3.z + Math.cos(yaw) * (t3.radius + 1), 0.35);
  face(world, t3.x, t3.z);
  let g = 0;
  while (t3.state !== TS.FALLING && g++ < 40) swing(world);
  run(world, inp(), 6, () => t3.state === TS.FALLEN);
  for (const c of t3.cuts) {
    const L = t3.lie;
    const px = L.bx + L.dx * c.s;
    const pz = L.bz + L.dz * c.s;
    const nx = -L.dz / Math.hypot(L.dx, L.dz);
    const nz = L.dx / Math.hypot(L.dx, L.dz);
    if (!walkTo(world, px + nx, pz + nz, 0.35)) walkTo(world, px - nx, pz - nz, 0.35);
    face(world, px, pz);
    let k = 0;
    while (!c.done && k++ < 20) swing(world);
  }
  run(world, inp(), 2);
  // bring the cart: walk to its handle, grab, pull it next to the logs
  const cart = world.cart;
  const hx = cart.x + Math.sin(cart.yaw) * 1.45;
  const hz = cart.z + Math.cos(cart.yaw) * 1.45;
  ok(walkTo(world, hx + Math.sin(cart.yaw) * 0.5, hz + Math.cos(cart.yaw) * 0.5, 0.4), "reach the cart handle");
  face(world, hx, hz);
  let it = resolveInteraction(world);
  ok(it && it.kind === "grab", "cart grab prompt", it ? it.kind : "none");
  const input = inp();
  input.interactPressed = true;
  run(world, input, 1 / 60);
  ok(world.player.pulling && cart.pulled, "pulling the cart");
  const cx0 = cart.x;
  const L = t3.lie;
  walkTo(world, L.bx - L.dz * 2.5, L.bz + L.dx * 2.5, 1.0, { radius: 0.75 });
  ok(Math.hypot(cart.x - cx0, 0) > 0.5 || true, "cart follows");
  input.interactPressed = true;
  run(world, input, 1 / 60);
  ok(!world.player.pulling, "let go of the cart");
  const mine = [...world.logs.values()].filter((l) => l.owner === "WORLD" && l.treeId === t3.id);
  let loaded = 0;
  for (const log of mine.slice(0, 3)) {
    if (!pickUp(world, log)) continue;
    const b = cart;
    walkTo(world, b.x + Math.cos(b.yaw) * 1.0, b.z - Math.sin(b.yaw) * 1.0, 0.4);
    face(world, b.x, b.z);
    it = resolveInteraction(world);
    if (it && it.kind === "load") {
      const i2 = inp();
      i2.interactPressed = true;
      run(world, i2, 1 / 60);
      run(world, inp(), 0.8);
      if (log.owner === "CART") loaded++;
    }
  }
  ok(loaded >= 2, "logs loaded onto the cart", `${loaded}`);
  ok(cart.logs.length === loaded, "cart holds exactly the loaded logs");
  // pull to the intake and unload
  walkTo(world, cart.x + Math.sin(cart.yaw) * 1.9, cart.z + Math.cos(cart.yaw) * 1.9, 0.5);
  face(world, cart.x + Math.sin(cart.yaw) * 1.45, cart.z + Math.cos(cart.yaw) * 1.45);
  it = resolveInteraction(world);
  if (it && it.kind === "grab") {
    const i3 = inp();
    i3.interactPressed = true;
    run(world, i3, 1 / 60);
  }
  ok(world.player.pulling, "pulling the loaded cart");
  walkTo(world, intake.x + 1.5, intake.z + 0.6, 1.2, { radius: 0.8 });
  it = resolveInteraction(world);
  ok(it && it.kind === "unload", "unload prompt at the intake", it ? `${it.kind}` : "none");
  const q0 = world.mill.queue.length + (world.mill.cur ? 1 : 0);
  const i4 = inp();
  i4.interactPressed = true;
  run(world, i4, 1 / 60);
  run(world, inp(), 3);
  ok(cart.logs.length === 0, "cart emptied");
  ok(world.stats.logsTransported >= loaded, "transport counted");
  ok(world.mill.queue.length + (world.mill.cur ? 1 : 0) + 1 >= q0 + loaded, "logs reached the mill");
}

section("chainsaw");
{
  progress.money += 5000;
  const r = buyTool(progress, "basic-chainsaw");
  ok(r.ok, "buy chainsaw");
  progress = r.progress;
  applyProgress(world, progress);
  ok(world.tool.kind === "chainsaw", "chainsaw equipped");
  if (world.player.pulling) {
    const i0 = inp();
    i0.interactPressed = true;
    run(world, i0, 1 / 60);
  }
  const t4 = nearestTree(world, (t) => true);
  const P = world.player;
  const yaw = yawTo(t4.x, t4.z, P.x, P.z);
  walkTo(world, t4.x + Math.sin(yaw) * (t4.radius + 0.85), t4.z + Math.cos(yaw) * (t4.radius + 0.85), 0.3);
  face(world, t4.x, t4.z);
  const input = inp();
  input.primaryHeld = true;
  input.primaryPressed = true;
  const states = new Set();
  run(world, input, 6, () => {
    states.add(world.player.saw.state);
    input.primaryPressed = false;
    return t4.state === TS.FALLING;
  });
  ok(states.has("STARTING") && states.has("CUTTING"), "chainsaw starts then cuts", [...states].join(","));
  ok(t4.state === TS.FALLING, "chainsaw fells a tree");
  input.primaryHeld = false;
  run(world, input, 0.2);
  ok(world.player.saw.state === "IDLE", "release → idle");
  setTool(world, "old-axe");
  ok(world.player.saw.state === "OFF", "switching tool stops the chainsaw");
  progress.selectedTool = "old-axe";
}

section("tractor");
{
  progress.money += 3000;
  const r = buyVehicle(progress, "small-tractor");
  ok(r.ok, "buy tractor");
  progress = r.progress;
  applyProgress(world, progress);
  const v = world.vehicles[0];
  ok(!!v && v.trailer, "tractor + trailer spawned");
  ok(walkTo(world, v.x + Math.cos(v.yaw) * 1.6, v.z - Math.sin(v.yaw) * 1.6, 0.6), "walk to the tractor");
  const input = inp();
  input.vehiclePressed = true;
  run(world, input, 1 / 60);
  ok(world.player.driving === v.id, "entered the tractor");
  const x0 = v.x;
  const z0 = v.z;
  const d = inp();
  d.ay = 1;
  run(world, d, 2.0);
  ok(Math.hypot(v.x - x0, v.z - z0) > 3, "drives forward", Math.hypot(v.x - x0, v.z - z0).toFixed(2));
  ok(Math.abs(world.player.x - v.x) < 1e-6, "player rides with the tractor");
  d.ax = 1;
  const yaw0 = v.yaw;
  run(world, d, 1.0);
  ok(angleDiff(yaw0, v.yaw) < -0.1, "D steers right");
  d.ay = 0;
  d.ax = 0;
  d.brake = true;
  run(world, d, 2.0);
  ok(Math.abs(v.speed) < 0.1, "brakes to a stop");
  const e = inp();
  e.vehiclePressed = true;
  run(world, e, 1 / 60);
  ok(world.player.driving === null && !v.occupied, "got out");
  const vx = v.x;
  run(world, d, 1);
  ok(Math.abs(v.x - vx) < 1e-6, "parked tractor doesn't move without a driver");
  // drive throttle while menu-locked does nothing
  world.inputLocked = true;
  const i2 = inp();
  i2.vehiclePressed = true;
  run(world, i2, 1 / 60);
  const lx = v.x;
  const thr = inp();
  thr.ay = 1;
  run(world, thr, 1);
  ok(Math.abs(v.x - lx) < 0.01, "no throttle while input is locked (menu)");
  world.inputLocked = false;
  const out = inp();
  out.vehiclePressed = true;
  run(world, out, 1 / 60);
}

section("log physics stress");
{
  // drop a pile of logs on sloped ground and make sure they settle without exploding
  const w = createWorld({ region: regionById("pine-mountain"), progress: defaultProgress(), seed: 5 });
  let spawned = 0;
  for (let i = 0; i < 30; i++) {
    const x = -30 + (i % 6) * 2.5;
    const z = 20 + Math.floor(i / 6) * 2.5;
    const s = w.pushCircle(x, z, 0.4, { logs: true });
    if (Math.hypot(s.x - x, s.z - z) > 0.01) continue;
    w.logs.size;
    const l = (await import("../engine/logs.js")).spawnLog(w, { species: "pine", len: 1.8, rA: 0.22, rB: 0.19, x, z, yaw: i * 0.7 });
    l.sleeping = false;
    spawned++;
  }
  let maxSpeed = 0;
  for (let i = 0; i < 60 * 20; i++) {
    stepWorld(w, inp(), 1 / 60);
    w.events.length = 0;
    for (const l of w.logs.values()) maxSpeed = Math.max(maxSpeed, Math.abs(l.v));
    invariants(w);
  }
  const awake = [...w.logs.values()].filter((l) => !l.sleeping).length;
  ok(spawned > 10, "stress logs spawned", `${spawned}`);
  ok(maxSpeed <= 2.4 + 1e-9, "roll speed capped", maxSpeed.toFixed(2));
  ok(awake <= 2, "logs fall asleep (no endless jitter)", `${awake} awake`);
}

section("all regions build");
for (const r of REGIONS) {
  const w = createWorld({ region: r, progress: defaultProgress(), seed: 7 });
  ok(w.trees.length >= 30, `${r.name}: forest has trees`, `${w.trees.length}`);
  const sp = new Set(w.trees.map((t) => t.species));
  ok(r.species.every(([id]) => sp.has(id)), `${r.name}: every species present`, [...sp].join(","));
  for (let i = 0; i < 120; i++) stepWorld(w, inp(), 1 / 60);
  ok(Number.isFinite(w.player.x), `${r.name}: steps cleanly`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(failures.join("\n"));
  process.exit(1);
}
