/**
 * Lumberjack Life — the sawmill. Logs are only ever ADDED through
 * `millAccept` (validated ownership change → MILL) and only ever turned into
 * planks inside `stepMill`, one at a time, with a `done` latch per job, so a
 * log can't be processed twice and its planks can't be credited twice.
 *
 *   intake deck (queue) → roll onto conveyor → feed to saw → cut → output belt → storage racks
 *
 * Layout is in the mill's local frame (shared with three/sawmillMesh.js):
 * +x runs along the machine line (deck → saw → storage), +z faces the yard.
 */
import { MILL } from "../data/regions.js";
import { MILL_T } from "./constants.js";
import { setOwner, stackSlot } from "./logs.js";
import { speciesById } from "../data/species.js";
import { upgradeValue } from "../data/equipment.js";

export const MILL_LAYOUT = {
  deckX: -4.2,
  deckZ0: 0.95,
  deckY: 0.62,
  deckPerRow: 6,
  deckSpacing: 0.6,
  beltY: 0.86,
  feedEndX: -0.55, // front of the log reaches the blade here
  sawX: 0,
  outEndX: 4.7,
  intake: { x: -4.2, z: 5.1 }, // where the player stands to drop logs on the deck
  board: { x: 2.4, z: 5.7 },
  buyer: { x: 9.6, z: 5.4 },
  cartHome: { x: -10, z: 3.6, yaw: Math.PI / 2 },
  vehicleHome: { x: 14, z: 3, yaw: 0 },
  boxes: [
    { x0: -6.5, x1: -1.9, z0: 0.55, z1: 4.2 }, // log deck
    { x0: -6.7, x1: 4.9, z0: -0.75, z1: 0.6 }, // conveyor + saw + output belt
    { x0: -1.0, x1: 1.0, z0: -1.1, z1: 1.05 }, // saw housing
    { x0: 5.4, x1: 9.9, z0: -2.3, z1: 1.4 }, // timber racks
    { x0: -7.6, x1: -0.4, z0: -8.0, z1: -3.0 }, // workshop
    { x0: 2.05, x1: 2.75, z0: 5.45, z1: 5.95 }, // order board post
    { x0: 9.4, x1: 12.4, z0: 6.2, z1: 7.8 }, // timber buyer's stall
  ],
  posts: [[-1.75, -1.85], [1.75, -1.85], [-1.75, 1.9], [1.75, 1.9]],
};

export const millToWorld = (lx, lz) => ({ x: MILL.x + lx, z: MILL.z + lz });

export function createMill(upgrades) {
  return {
    queue: [],
    cur: null,
    storage: {},
    cap: upgradeValue(upgrades, "intake"),
    storeCap: upgradeValue(upgrades, "storage"),
    conv: upgradeValue(upgrades, "conveyor"),
    saw: upgradeValue(upgrades, "saw"),
    blocked: false,
    running: false,
    beltPhase: 0,
    outPhase: 0,
    sawSpin: 0,
    jobSeq: 0,
  };
}

export function applyMillUpgrades(mill, upgrades) {
  mill.cap = upgradeValue(upgrades, "intake");
  mill.storeCap = upgradeValue(upgrades, "storage");
  mill.conv = upgradeValue(upgrades, "conveyor");
  mill.saw = upgradeValue(upgrades, "saw");
}

export const storageTotal = (mill) => Object.values(mill.storage).reduce((a, b) => a + b, 0);
export const deckFree = (mill) => mill.cap - mill.queue.length;

/** deck slot pose (local) for queue index i */
export function deckSlot(i, r) {
  const s = stackSlot(i, MILL_LAYOUT.deckPerRow, MILL_LAYOUT.deckSpacing, 0.46);
  const width = (MILL_LAYOUT.deckPerRow - 1) * MILL_LAYOUT.deckSpacing;
  return {
    lx: MILL_LAYOUT.deckX,
    lz: MILL_LAYOUT.deckZ0 + width / 2 + s.x,
    ly: MILL_LAYOUT.deckY + s.y + r,
  };
}

/** Put a log on the intake deck. Validated; returns false when full / illegal. */
export function millAccept(world, log) {
  const mill = world.mill;
  if (!log || mill.queue.length >= mill.cap) return false;
  if (mill.queue.includes(log.id) || (mill.cur && mill.cur.logId === log.id)) return false;
  if (!setOwner(world, log, "MILL")) return false;
  mill.queue.push(log.id);
  world.emit({ type: "logCollected", species: log.species, logId: log.id });
  return true;
}

export function stepMill(world, dt) {
  const mill = world.mill;
  if (!mill.cur && mill.queue.length) {
    const id = mill.queue.shift();
    const log = world.logs.get(id);
    if (log && log.owner === "MILL") {
      const sp = speciesById(log.species);
      mill.cur = {
        job: ++mill.jobSeq,
        logId: id,
        species: log.species,
        len: log.len,
        r: log.r,
        rA: log.rA,
        rB: log.rB,
        planks: sp.planks,
        phase: "roll",
        t: 0,
        dur: MILL_T.roll / mill.conv,
        done: false,
      };
      world.emit({ type: "millStart" });
    }
  }
  const c = mill.cur;
  mill.running = !!c && !mill.blocked;
  if (!c) {
    mill.sawSpin = Math.max(0, mill.sawSpin - dt * 1.5);
    return;
  }
  // blade spins up while a job is on the line, down when idle
  mill.sawSpin = Math.min(1, mill.sawSpin + dt * 1.2);
  if (c.phase === "roll" || c.phase === "feed") mill.beltPhase += dt * mill.conv;
  if (c.phase === "out") mill.outPhase += dt * mill.conv;
  if (c.phase === "cut") mill.beltPhase += dt * 0.35 * mill.saw;

  if (c.phase === "out" && mill.blocked) {
    // storage full: wait at the end of the belt until planks are delivered/sold
    if (mill.storeCap - storageTotal(mill) >= c.planks) mill.blocked = false;
    else return;
  }
  c.t += dt;
  if (c.t < c.dur) return;
  if (c.phase === "roll") {
    c.phase = "feed";
    c.t = 0;
    c.dur = MILL_T.feed / mill.conv;
  } else if (c.phase === "feed") {
    c.phase = "cut";
    c.t = 0;
    c.dur = (MILL_T.cutBase + c.len * MILL_T.cutPerM) / mill.saw;
    world.emit({ type: "sawCut", on: true });
  } else if (c.phase === "cut") {
    world.emit({ type: "sawCut", on: false });
    const log = world.logs.get(c.logId);
    if (log) setOwner(world, log, "PROCESSED");
    world.emit({ type: "logProcessed", species: c.species });
    c.phase = "out";
    c.t = 0;
    c.dur = MILL_T.out / mill.conv;
  } else if (c.phase === "out") {
    if (mill.storeCap - storageTotal(mill) < c.planks) {
      if (!mill.blocked) world.emit({ type: "toast", text: "Timber racks are full — deliver or sell planks", tone: "warn" });
      mill.blocked = true;
      c.t = c.dur;
      return;
    }
    if (!c.done) {
      c.done = true;
      mill.storage[c.species] = (mill.storage[c.species] || 0) + c.planks;
      world.emit({ type: "planks", species: c.species, n: c.planks });
    }
    mill.cur = null;
  }
}

export function millSnapshot(world) {
  const mill = world.mill;
  const pending = [];
  // logs on the deck AND the one on the line go back on the deck after a reload
  if (mill.cur && mill.cur.phase !== "out") pending.push({ sp: mill.cur.species, len: mill.cur.len, rA: mill.cur.rA, rB: mill.cur.rB });
  for (const id of mill.queue) {
    const l = world.logs.get(id);
    if (l) pending.push({ sp: l.species, len: l.len, rA: l.rA, rB: l.rB });
  }
  const storage = { ...mill.storage };
  if (mill.cur && mill.cur.phase === "out" && !mill.cur.done) storage[mill.cur.species] = (storage[mill.cur.species] || 0) + mill.cur.planks;
  return { deck: pending, storage };
}
