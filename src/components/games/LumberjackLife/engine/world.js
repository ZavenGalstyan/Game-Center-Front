/**
 * Lumberjack Life — the world: one region's forest, the lumberjack, logs,
 * sawmill, cart and vehicles. Pure JS, headless-simulable (tools/simTest.mjs).
 *
 * `stepWorld(world, input, frameDt)` clamps the frame delta (tab switches,
 * fullscreen transitions, debugger pauses) and advances in fixed 1/60 s
 * steps; one-shot inputs (click, E, F, Q) are consumed by the first step.
 * Everything that happens is pushed to `world.events` for the driver to turn
 * into sound, particles, HUD updates and career progress.
 *
 * Save: `worldSnapshot` stores only plain data (tree states, log specs and
 * owners, mill deck + storage, cart/vehicle poses) — never live references.
 */
import { STEP, MAX_FRAME, PLAYER, UNLOAD_INTERVAL } from "./constants.js";
import { createRng, hashString, clamp, segSegDist, pointSegDist, wrap } from "./math.js";
import { createTerrain } from "./terrain.js";
import { makeTree, stepTree, TS, blocksAsTrunk, hasStump, trunkCollider, stumpRadius, treeSnapshot, restoreTree, radiusAt } from "./trees.js";
import { spawnLog, stepLogs, setOwner, restOnGround, logEnds } from "./logs.js";
import { createMill, stepMill, millSnapshot, MILL_LAYOUT, millToWorld, applyMillUpgrades, millAccept } from "./mill.js";
import { createPlayer, stepPlayer, stopChainsaw } from "./player.js";
import { createCart, createVehicle, stepCart, stepVehicle, CART } from "./vehicles.js";
import { toolById, vehicleById } from "../data/equipment.js";
import { MILL, SPAWN, PLAY_RADIUS } from "../data/regions.js";

export const EMPTY_STATS = () => ({
  axeSwings: 0,
  chainsawTime: 0,
  logsCollected: 0,
  logsTransported: 0,
  distanceWalked: 0,
  distanceDriven: 0,
  toolUse: {},
});

/* ------------------------------------------------------------ layout */
function placeTrees(world, region, terrain) {
  const rng = createRng(hashString(region.id) ^ 0x9e3779b9);
  const trees = [];
  const weights = region.species;
  const total = weights.reduce((a, [, w]) => a + w, 0);
  const pick = () => {
    let r = rng() * total;
    for (const [id, w] of weights) {
      r -= w;
      if (r <= 0) return id;
    }
    return weights[0][0];
  };
  world.pickSpecies = () => {
    let r = world.rng() * total;
    for (const [id, w] of weights) {
      r -= w;
      if (r <= 0) return id;
    }
    return weights[0][0];
  };
  let n = 0;
  for (const st of region.stands) {
    let placed = 0;
    for (let tries = 0; tries < st.n * 30 && placed < st.n; tries++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * st.r;
      const x = st.x + Math.cos(a) * rr;
      const z = st.z + Math.sin(a) * rr;
      if (Math.hypot(x, z) > PLAY_RADIUS - 3) continue;
      if (terrain.padDist(x, z) < 17) continue;
      if (terrain.roadDist(x, z) < 3.2) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6) continue;
      const minGap = 3.6 * region.treeScale;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < minGap)) continue;
      if (world.rocks.some((r) => Math.hypot(r.x - x, r.z - z) < r.r + 1.6)) continue;
      const t = makeTree(`T${++n}`, pick(), x, z, terrain.heightAt(x, z), rng, region.treeScale);
      trees.push(t);
      placed++;
    }
  }
  return trees;
}

function placeRocks(region, terrain) {
  const rng = createRng(hashString(region.id) ^ 0x51ed27);
  const rocks = [];
  const count = Math.round(14 * region.deco.rocks);
  for (let tries = 0; tries < count * 25 && rocks.length < count; tries++) {
    const a = rng() * Math.PI * 2;
    const rr = 10 + Math.sqrt(rng()) * (PLAY_RADIUS - 12);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (terrain.padDist(x, z) < 19 || terrain.roadDist(x, z) < 3.5) continue;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 7) continue;
    if (rocks.some((r) => Math.hypot(r.x - x, r.z - z) < 4)) continue;
    const r = rng.range(0.45, 1.25) * (region.id === "pine-mountain" ? 1.25 : 1);
    rocks.push({ x, z, r, y: terrain.heightAt(x, z), seed: Math.floor(rng() * 1e6), rot: rng() * 6.28 });
  }
  return rocks;
}

/* ------------------------------------------------------------ create */
export function createWorld({ region, progress, snapshot = null, seed = Date.now() % 1e9 }) {
  const terrain = createTerrain(region);
  const world = {
    region,
    terrain,
    rng: createRng(seed),
    time: 0,
    acc: 0,
    events: [],
    logs: new Map(),
    logSeq: 0,
    trees: [],
    rocks: [],
    mill: createMill(progress.sawmillUpgrades),
    player: createPlayer(SPAWN.x, SPAWN.z, SPAWN.yaw),
    tool: toolById(progress.selectedTool),
    cart: null,
    vehicles: [],
    unload: null,
    stats: EMPTY_STATS(),
    inputLocked: false,
    orderPrompt: null,
    sellPrompt: null,
    buildings: buildingFlags(progress),
  };
  world.emit = (ev) => {
    world.events.push(ev);
  };
  world.rocks = placeRocks(region, terrain);
  world.trees = placeTrees(world, region, terrain);
  world.player.y = terrain.heightAt(world.player.x, world.player.z);
  installCollision(world);
  syncOwnedVehicles(world, progress);
  if (snapshot) restoreWorld(world, snapshot);
  world.events.length = 0;
  return world;
}

export function buildingFlags(progress) {
  const tools = progress.unlockedTools || [];
  const veh = progress.unlockedVehicles || [];
  const upg = progress.sawmillUpgrades || {};
  const done = (progress.completedOrders || []).length;
  return {
    toolShed: tools.length > 1,
    garage: veh.some((v) => v !== "hand-cart"),
    yard: (upg.storage || 0) > 0 || (upg.intake || 0) > 1,
    office: done >= 6,
    flags: done >= 12,
  };
}

/** spawn the cart / vehicles the player owns (idempotent) */
export function syncOwnedVehicles(world, progress) {
  const owned = progress.unlockedVehicles || [];
  if (owned.includes("hand-cart") && !world.cart) {
    const h = millToWorld(MILL_LAYOUT.cartHome.x, MILL_LAYOUT.cartHome.z);
    world.cart = createCart({ x: h.x, z: h.z, yaw: MILL_LAYOUT.cartHome.yaw });
    stepCart(world, 0);
  }
  let slot = world.vehicles.length;
  for (const id of owned) {
    const def = vehicleById(id);
    if (!def || def.kind === "cart" || world.vehicles.some((v) => v.id === id)) continue;
    const h = millToWorld(MILL_LAYOUT.vehicleHome.x + slot * 5.2, MILL_LAYOUT.vehicleHome.z);
    const v = createVehicle(id, h.x, h.z + (def.kind === "truck" ? 2 : 0), 0);
    world.vehicles.push(v);
    slot++;
  }
}

export function setTool(world, toolId) {
  const next = toolById(toolId);
  if (next.id === world.tool.id) return;
  if (world.tool.kind === "chainsaw") stopChainsaw(world, true);
  world.player.swing = null;
  world.tool = next;
  world.emit({ type: "equip", tool: next.id });
}

export function applyProgress(world, progress) {
  applyMillUpgrades(world.mill, progress.sawmillUpgrades);
  world.buildings = buildingFlags(progress);
  syncOwnedVehicles(world, progress);
  if (progress.selectedTool !== world.tool.id) setTool(world, progress.selectedTool);
}

/* ------------------------------------------------------------ collision */
function installCollision(world) {
  const boxes = MILL_LAYOUT.boxes.map((b) => ({ x0: MILL.x + b.x0, x1: MILL.x + b.x1, z0: MILL.z + b.z0, z1: MILL.z + b.z1 }));
  const posts = MILL_LAYOUT.posts.map(([x, z]) => ({ x: MILL.x + x, z: MILL.z + z, r: 0.18 }));
  const extraBoxes = () => {
    const B = world.buildings;
    const out = [];
    if (B.toolShed) out.push({ x0: MILL.x - 15.6, x1: MILL.x - 11.4, z0: MILL.z - 7.2, z1: MILL.z - 3.4 });
    if (B.garage) out.push({ x0: MILL.x + 11.2, x1: MILL.x + 18.8, z0: MILL.z - 9.5, z1: MILL.z - 4.0 });
    if (B.office) out.push({ x0: MILL.x - 16.5, x1: MILL.x - 11.5, z0: MILL.z + 6.5, z1: MILL.z + 10.5 });
    if (B.yard) out.push({ x0: MILL.x + 5.7, x1: MILL.x + 9.1, z0: MILL.z + 2.0, z1: MILL.z + 3.6 });
    return out;
  };

  const circlePush = (s, cx, cz, R) => {
    const dx = s.x - cx;
    const dz = s.z - cz;
    const m = s.r + R;
    const d2 = dx * dx + dz * dz;
    if (d2 >= m * m) return;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      s.x += m;
      return;
    }
    const k = (m - d) / d;
    s.x += dx * k;
    s.z += dz * k;
  };
  const segPush = (s, ax, az, bx, bz, R) => {
    const p = pointSegDist(s.x, s.z, ax, az, bx, bz);
    const m = s.r + R;
    if (p.d >= m) return;
    if (p.d < 1e-6) {
      s.x += m;
      return;
    }
    const k = (m - p.d) / p.d;
    s.x += (s.x - p.cx) * k;
    s.z += (s.z - p.cz) * k;
  };
  const boxPush = (s, b) => {
    const cx = clamp(s.x, b.x0, b.x1);
    const cz = clamp(s.z, b.z0, b.z1);
    const dx = s.x - cx;
    const dz = s.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= s.r * s.r) return;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      const k = (s.r - d) / d;
      s.x += dx * k;
      s.z += dz * k;
      return;
    }
    // centre inside the box: leave by the nearest face
    const opts = [[b.x0 - s.r - s.x, 0], [b.x1 + s.r - s.x, 0], [0, b.z0 - s.r - s.z], [0, b.z1 + s.r - s.z]];
    let best = opts[0];
    for (const o of opts) if (Math.abs(o[0] + o[1]) < Math.abs(best[0] + best[1])) best = o;
    s.x += best[0];
    s.z += best[1];
  };

  /** fallen (not yet cut free) trunk sections as capsules */
  const fallenSegs = (t, fn) => {
    const L = t.lie;
    if (!L) return;
    for (const sec of t.sections) {
      if (sec.freed) continue;
      const ax = L.bx + L.dx * sec.s0;
      const az = L.bz + L.dz * sec.s0;
      const bx = L.bx + L.dx * sec.s1;
      const bz = L.bz + L.dz * sec.s1;
      fn(ax, az, bx, bz, (radiusAt(t, sec.s0) + radiusAt(t, sec.s1)) / 2);
    }
  };

  const vehCircles = (v, fn) => {
    for (const [, oz, r] of v.dim.circles) fn(v.x + Math.sin(v.yaw) * oz, v.z + Math.cos(v.yaw) * oz, r * 0.92);
    if (v.trailer) for (const [, oz, r] of v.dim.trailerCircles) fn(v.trailer.x + Math.sin(v.trailer.yaw) * oz, v.trailer.z + Math.cos(v.trailer.yaw) * oz, r * 0.85);
  };

  /**
   * Push a circle out of everything solid. opts: logs (include WORLD logs),
   * fallen (fallen trunks), skipCart, skipVehicle (id), exceptLog (id).
   */
  world.pushCircle = (x, z, r, opts = {}) => {
    const s = { x, z, r };
    for (let it = 0; it < 3; it++) {
      for (const t of world.trees) {
        if (blocksAsTrunk(t)) {
          if (t.grow > 0.35) circlePush(s, t.x, t.z, trunkCollider(t) * Math.min(1, t.grow + 0.1));
        } else if (hasStump(t)) circlePush(s, t.x, t.z, stumpRadius(t));
        if (opts.fallen && t.state === TS.FALLEN) fallenSegs(t, (ax, az, bx, bz, R) => segPush(s, ax, az, bx, bz, R * 0.92));
      }
      for (const rk of world.rocks) circlePush(s, rk.x, rk.z, rk.r * 0.9);
      for (const p of posts) circlePush(s, p.x, p.z, p.r);
      for (const b of boxes) boxPush(s, b);
      for (const b of extraBoxes()) boxPush(s, b);
      if (opts.logs) {
        for (const l of world.logs.values()) {
          if (l.owner !== "WORLD" || l.id === opts.exceptLog) continue;
          const e = logEnds(l);
          segPush(s, e.ax, e.az, e.bx, e.bz, l.r * 0.9);
        }
      }
      const c = world.cart;
      if (c && !opts.skipCart) {
        for (const off of [0.45, -0.45]) circlePush(s, c.x + Math.sin(c.yaw) * off, c.z + Math.cos(c.yaw) * off, CART.radius * 0.75);
      }
      for (const v of world.vehicles) {
        if (v.id === opts.skipVehicle) continue;
        if (world.player.driving === v.id && r === PLAYER.radius) continue;
        vehCircles(v, (cx, cz, R) => circlePush(s, cx, cz, R));
      }
    }
    return s;
  };

  /** keep a WORLD log out of trees, rocks, the mill and other logs (positional, rate-limited) */
  world.pushLog = (log) => {
    const ox = log.x;
    const oz = log.z;
    const e0 = logEnds(log);
    let px = 0;
    let pz = 0;
    const apply = (cx, cz, R) => {
      const p = pointSegDist(cx, cz, e0.ax, e0.az, e0.bx, e0.bz);
      const m = log.r + R;
      if (p.d >= m || p.d < 1e-6) return;
      const k = (m - p.d) / p.d;
      px += (p.cx - cx) * k;
      pz += (p.cz - cz) * k;
    };
    for (const t of world.trees) {
      if (blocksAsTrunk(t)) apply(t.x, t.z, trunkCollider(t));
      else if (hasStump(t)) apply(t.x, t.z, stumpRadius(t));
    }
    for (const rk of world.rocks) apply(rk.x, rk.z, rk.r * 0.9);
    for (const b of boxes) {
      for (const f of [0, 0.5, 1]) {
        const sx = e0.ax + (e0.bx - e0.ax) * f;
        const sz = e0.az + (e0.bz - e0.az) * f;
        const s = { x: sx, z: sz, r: log.r };
        boxPush(s, b);
        px += (s.x - sx) / 2;
        pz += (s.z - sz) / 2;
      }
    }
    for (const o of world.logs.values()) {
      if (o === log || o.owner !== "WORLD") continue;
      if (Math.abs(o.x - log.x) > (o.len + log.len) / 2 + 1 || Math.abs(o.z - log.z) > (o.len + log.len) / 2 + 1) continue;
      const e1 = logEnds(o);
      const q = segSegDist(e0.ax, e0.az, e0.bx, e0.bz, e1.ax, e1.az, e1.bx, e1.bz);
      const m = log.r + o.r;
      if (q.d >= m - 0.005) continue;
      const dx = q.c1x - q.c2x;
      const dz = q.c1z - q.c2z;
      const dl = Math.hypot(dx, dz);
      const nx = dl > 1e-6 ? dx / dl : Math.cos(log.yaw);
      const nz = dl > 1e-6 ? dz / dl : -Math.sin(log.yaw);
      const pen = m - q.d;
      px += nx * pen * 0.5;
      pz += nz * pen * 0.5;
      if (o.sleeping) {
        o.sleeping = false;
        o.sleepT = 0;
      }
    }
    const pl = Math.hypot(px, pz);
    const maxStep = 0.06;
    if (pl > maxStep) {
      px *= maxStep / pl;
      pz *= maxStep / pl;
    }
    log.x = ox + px;
    log.z = oz + pz;
    return Math.min(pl, maxStep);
  };

  /** would a log of this size fit here (for drops)? */
  world.logFits = (x, z, yaw, len, r, exceptId) => {
    if (Math.hypot(x, z) > PLAY_RADIUS) return false;
    const fx = Math.sin(yaw) * len * 0.5;
    const fz = Math.cos(yaw) * len * 0.5;
    const ax = x - fx;
    const az = z - fz;
    const bx = x + fx;
    const bz = z + fz;
    const P = world.player;
    if (pointSegDist(P.x, P.z, ax, az, bx, bz).d < PLAYER.radius + r + 0.02) return false;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const sx = ax + (bx - ax) * f;
      const sz = az + (bz - az) * f;
      const s = world.pushCircle(sx, sz, r, { logs: true, fallen: true, exceptLog: exceptId });
      if (Math.hypot(s.x - sx, s.z - sz) > 0.03) return false;
    }
    // not on a wall-steep slope
    const H = world.terrain.heightAt;
    return Math.abs(H(ax, az) - H(bx, bz)) < len * 0.7;
  };

  /** vehicles nudge logs out of the way (and wake them) */
  world.shoveLogs = (cx, cz, R) => {
    for (const l of world.logs.values()) {
      if (l.owner !== "WORLD") continue;
      const e = logEnds(l);
      const p = pointSegDist(cx, cz, e.ax, e.az, e.bx, e.bz);
      const m = l.r + R;
      if (p.d >= m || p.d < 1e-6) continue;
      const k = Math.min(0.08, m - p.d) / p.d;
      l.x += (p.cx - cx) * k;
      l.z += (p.cz - cz) * k;
      l.sleeping = false;
      l.sleepT = 0;
    }
  };

  world.startUnload = (source) => {
    if (world.unload) return;
    world.unload = { id: source.id, t: 0 };
    world.emit({ type: "unloadStart" });
  };
}

/* ------------------------------------------------------------ step */
function stepUnload(world, dt) {
  const U = world.unload;
  if (!U) return;
  const src = U.id === "cart" ? world.cart : world.vehicles.find((v) => v.id === U.id);
  if (!src || !src.logs.length) {
    world.unload = null;
    return;
  }
  U.t += dt;
  if (U.t < UNLOAD_INTERVAL) return;
  U.t = 0;
  const id = src.logs[src.logs.length - 1];
  const log = world.logs.get(id);
  if (!log) {
    src.logs.pop();
    return;
  }
  if (world.mill.queue.length >= world.mill.cap) {
    world.emit({ type: "toast", text: "Intake deck is full", tone: "warn" });
    world.unload = null;
    return;
  }
  if (millAccept(world, log)) {
    src.logs.pop();
    world.stats.logsTransported++;
    world.emit({ type: "deposit", logId: id, fromBed: true });
  } else world.unload = null;
}

function step(world, inp, dt) {
  world.time += dt;
  stepPlayer(world, inp, dt);
  for (const t of world.trees) stepTree(world, t, dt);
  stepLogs(world, dt);
  stepCart(world, dt);
  for (const v of world.vehicles) stepVehicle(world, v, inp, dt);
  stepUnload(world, dt);
  stepMill(world, dt);
  // consume one-shot inputs after the first step that saw them
  inp.primaryPressed = false;
  inp.interactPressed = false;
  inp.vehiclePressed = false;
}

/**
 * Advance by a frame. `inp` = { mx, mz (world-space move dir), ax, ay (raw
 * axes for driving), sprint, brake, primaryHeld, primaryPressed,
 * interactPressed, vehiclePressed }.
 */
export function stepWorld(world, inp, frameDt) {
  const dt = clamp(frameDt, 0, MAX_FRAME);
  world.acc += dt;
  let n = 0;
  while (world.acc >= STEP && n < 8) {
    step(world, inp, STEP);
    world.acc -= STEP;
    n++;
  }
  if (n === 8) world.acc = 0;
  return n;
}

/* ------------------------------------------------------------ save / restore */
export function worldSnapshot(world) {
  const logs = [];
  const P = world.player;
  for (const l of world.logs.values()) {
    if (l.owner === "MILL" || l.owner === "PROCESSED") continue;
    let owner = l.owner;
    let x = l.x;
    let z = l.z;
    let yaw = l.yaw;
    if (owner === "PLAYER") {
      // a carried log is put down at the player's feet
      owner = "WORLD";
      x = P.x + Math.sin(P.yaw) * 1.0;
      z = P.z + Math.cos(P.yaw) * 1.0;
      yaw = wrap(P.yaw + Math.PI / 2);
    }
    logs.push({ sp: l.species, len: +l.len.toFixed(3), rA: +l.rA.toFixed(3), rB: +l.rB.toFixed(3), x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3), o: owner, h: l.holder, c: l.collected ? 1 : 0 });
  }
  const c = world.cart;
  return {
    v: 1,
    trees: world.trees.map(treeSnapshot),
    logs,
    mill: millSnapshot(world),
    cart: c ? { x: +c.x.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(3) } : null,
    vehicles: world.vehicles.map((v) => ({ id: v.id, x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: +v.yaw.toFixed(3), ty: v.trailer ? +v.trailer.yaw.toFixed(3) : null })),
    player: { x: +P.x.toFixed(2), z: +P.z.toFixed(2), yaw: +P.yaw.toFixed(3) },
  };
}

function finite(...v) {
  return v.every((x) => Number.isFinite(x));
}

export function restoreWorld(world, snap) {
  if (!snap || typeof snap !== "object") return;
  const byId = new Map(world.trees.map((t) => [t.id, t]));
  if (Array.isArray(snap.trees)) for (const ts of snap.trees) if (ts && byId.has(ts.id)) restoreTree(world, byId.get(ts.id), ts);
  // logs restored by restoreTree (from cuts) stay; saved logs are added
  if (Array.isArray(snap.logs)) {
    for (const s of snap.logs) {
      if (!s || !finite(s.len, s.rA, s.rB, s.x, s.z, s.yaw) || s.len <= 0.2 || s.len > 4) continue;
      const owner = s.o === "CART" && world.cart ? "CART" : s.o === "BED" && world.vehicles.some((v) => v.id === s.h) ? "BED" : "WORLD";
      const log = spawnLog(world, { species: s.sp, len: s.len, rA: clamp(s.rA, 0.05, 0.8), rB: clamp(s.rB, 0.05, 0.8), x: clamp(s.x, -PLAY_RADIUS, PLAY_RADIUS), z: clamp(s.z, -PLAY_RADIUS, PLAY_RADIUS), yaw: s.yaw, owner: "WORLD" });
      log.collected = !!s.c;
      if (owner === "CART" && world.cart.logs.length < world.cart.cap) {
        log.owner = "CART";
        log.holder = "cart";
        log.slot = world.cart.logs.length;
        world.cart.logs.push(log.id);
      } else if (owner === "BED") {
        const v = world.vehicles.find((x) => x.id === s.h);
        if (v && v.logs.length < v.cap) {
          log.owner = "BED";
          log.holder = v.id;
          log.slot = v.logs.length;
          v.logs.push(log.id);
        }
      }
    }
  }
  const m = snap.mill;
  if (m && typeof m === "object") {
    if (m.storage && typeof m.storage === "object") {
      for (const [k, v] of Object.entries(m.storage)) if (Number.isFinite(v) && v > 0) world.mill.storage[k] = Math.floor(v);
    }
    if (Array.isArray(m.deck)) {
      for (const d of m.deck.slice(0, world.mill.cap)) {
        if (!d || !finite(d.len, d.rA, d.rB)) continue;
        const log = spawnLog(world, { species: d.sp, len: d.len, rA: d.rA, rB: d.rB, x: MILL.x, z: MILL.z, yaw: Math.PI / 2, owner: "PLAYER" });
        log.collected = true;
        log.owner = "PLAYER"; // transitional; millAccept validates PLAYER → MILL
        millAccept(world, log);
      }
    }
  }
  if (snap.cart && world.cart && finite(snap.cart.x, snap.cart.z, snap.cart.yaw)) {
    world.cart.x = snap.cart.x;
    world.cart.z = snap.cart.z;
    world.cart.yaw = snap.cart.yaw;
    stepCart(world, 0);
  }
  if (Array.isArray(snap.vehicles)) {
    for (const s of snap.vehicles) {
      const v = world.vehicles.find((x) => x.id === s.id);
      if (!v || !finite(s.x, s.z, s.yaw)) continue;
      v.x = s.x;
      v.z = s.z;
      v.yaw = s.yaw;
      if (v.trailer) {
        const ty = Number.isFinite(s.ty) ? s.ty : s.yaw;
        const hx = v.x + Math.sin(v.yaw) * v.dim.hitch;
        const hz = v.z + Math.cos(v.yaw) * v.dim.hitch;
        v.trailer.yaw = ty;
        v.trailer.x = hx - Math.sin(ty) * v.dim.trailerLen;
        v.trailer.z = hz - Math.cos(ty) * v.dim.trailerLen;
      }
    }
  }
  if (snap.player && finite(snap.player.x, snap.player.z, snap.player.yaw)) {
    const P = world.player;
    P.x = clamp(snap.player.x, -PLAY_RADIUS, PLAY_RADIUS);
    P.z = clamp(snap.player.z, -PLAY_RADIUS, PLAY_RADIUS);
    P.yaw = snap.player.yaw;
  }
  // make sure the player isn't restored inside something
  const P = world.player;
  const s = world.pushCircle(P.x, P.z, PLAYER.radius, { logs: true, fallen: true });
  P.x = s.x;
  P.z = s.z;
  P.y = world.terrain.heightAt(P.x, P.z);
  for (const l of world.logs.values()) if (l.owner === "WORLD") restOnGround(world, l);
}

/** debug/test: count logs per owner (used by simTest to prove single ownership) */
export function ownershipCensus(world) {
  const out = { WORLD: 0, PLAYER: 0, CART: 0, BED: 0, MILL: 0 };
  for (const l of world.logs.values()) out[l.owner] = (out[l.owner] || 0) + 1;
  return out;
}

export { TS, setOwner };
