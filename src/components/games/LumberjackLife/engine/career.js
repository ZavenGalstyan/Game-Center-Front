/**
 * Lumberjack Life — career: orders, economy, statistics and the contextual
 * tutorial. Pure functions over the saved `progress` object; the game screen
 * feeds world events in (each event exactly once — the driver drains the
 * queue) and gets back a new progress + notifications.
 *
 * Orders: each region has five scripted orders, then endless generated
 * contracts. Objectives: CUT_TREE, COLLECT_LOGS (brought to the intake),
 * PROCESS_LOGS, PRODUCE_PLANKS, DELIVER (planks handed over at the order
 * board — the only objective that consumes stock). A reward is paid exactly
 * once: completion is keyed by order id in `completedOrders`.
 */
import { REGIONS, regionById } from "../data/regions.js";
import { SPECIES, speciesById, plankName } from "../data/species.js";
import { TOOLS, VEHICLES, UPGRADES, toolById, vehicleById } from "../data/equipment.js";
import { createRng, hashString } from "./math.js";

export const TUTORIAL_STEPS = [
  { id: "move", text: "Move with WASD · look with the mouse" },
  { id: "approach", text: "Walk up to a tree" },
  { id: "chop", text: "Click to swing your axe at the trunk" },
  { id: "fell", text: "Keep chopping — watch it fall!" },
  { id: "section", text: "Chop the marks on the fallen trunk into logs" },
  { id: "pickup", text: "Press E to pick up a log" },
  { id: "deposit", text: "Carry it to the sawmill intake (E to place)" },
  { id: "process", text: "The sawmill cuts logs into planks" },
  { id: "deliver", text: "Hand the planks in at the order board" },
];

/* ------------------------------------------------------------ orders */
function contractFor(region, seq) {
  const rng = createRng(hashString(`${region.id}:${seq}`));
  const total = region.species.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  let spId = region.species[0][0];
  for (const [id, w] of region.species) {
    r -= w;
    if (r <= 0) {
      spId = id;
      break;
    }
  }
  const sp = speciesById(spId);
  const kind = rng.int(0, 2);
  const tier = Math.min(4, Math.floor(seq / 3));
  const trees = 2 + rng.int(0, 2) + tier;
  const planks = Math.max(6, Math.round((trees * sp.logs * sp.planks * 0.8) / 2) * 2);
  const objectives = kind === 0
    ? [{ type: "CUT_TREE", n: trees, species: spId }, { type: "DELIVER", n: planks, species: spId }]
    : kind === 1
      ? [{ type: "PRODUCE_PLANKS", n: planks, species: spId }, { type: "DELIVER", n: planks, species: spId }]
      : [{ type: "COLLECT_LOGS", n: trees * 2 }, { type: "DELIVER", n: planks }];
  const reward = Math.round((planks * sp.plankValue * 1.7 + trees * 25) / 10) * 10;
  const clients = ["Riverside Builders", "Maple & Co.", "Northgate Carpentry", "Hollow Creek Farm", "Timberline Homes", "Brightwater Docks", "Ashford Joinery"];
  const names = ["Timber Contract", "Lumber Run", "Board Order", "Builder's Supply", "Workshop Restock", "Yard Contract"];
  return {
    id: `${region.id}-c${seq}`,
    name: `${names[rng.int(0, names.length - 1)]} #${seq + 1}`,
    client: clients[rng.int(0, clients.length - 1)],
    reward,
    objectives,
    contract: true,
  };
}

export function orderState(progress, regionId) {
  return progress.orders[regionId] || { index: 0, counters: [], seq: 0 };
}

export function currentOrder(progress, regionId) {
  const region = regionById(regionId);
  const st = orderState(progress, regionId);
  if (st.index < region.orders.length) return region.orders[st.index];
  return contractFor(region, st.seq);
}

const matches = (obj, species) => !obj.species || obj.species === species;

/** planks in storage that count for a DELIVER objective */
export function deliverable(obj, storage) {
  if (obj.species) return storage[obj.species] || 0;
  return Object.values(storage).reduce((a, b) => a + b, 0);
}

export function orderStatus(progress, regionId, storage) {
  const order = currentOrder(progress, regionId);
  const st = orderState(progress, regionId);
  const lines = order.objectives.map((o, i) => {
    const have = o.type === "DELIVER" ? deliverable(o, storage) : Math.min(o.n, st.counters[i] || 0);
    return { ...o, have: Math.min(have, o.n), raw: have, done: have >= o.n, label: objectiveLabel(o) };
  });
  const ready = lines.every((l) => l.done);
  return { order, lines, ready };
}

export function objectiveLabel(o) {
  const sp = o.species ? speciesById(o.species).name : null;
  switch (o.type) {
    case "CUT_TREE": return `Fell ${sp ? sp + " " : ""}trees`;
    case "COLLECT_LOGS": return `Bring ${sp ? sp + " " : ""}logs to the mill`;
    case "PROCESS_LOGS": return `Saw ${sp ? sp + " " : ""}logs`;
    case "PRODUCE_PLANKS": return `Produce ${sp ? plankName(o.species) : "planks"}`;
    case "DELIVER": return `Deliver ${sp ? plankName(o.species) : "planks"}`;
    default: return o.type;
  }
}

/** planks the current order needs kept back from selling, by species */
export function reservedPlanks(progress, regionId, storage) {
  const order = currentOrder(progress, regionId);
  const res = {};
  for (const o of order.objectives) {
    if (o.type !== "DELIVER") continue;
    if (o.species) res[o.species] = (res[o.species] || 0) + o.n;
  }
  // generic DELIVER: reserve the cheapest planks
  for (const o of order.objectives) {
    if (o.type !== "DELIVER" || o.species) continue;
    let need = o.n;
    const kinds = Object.keys(storage).sort((a, b) => speciesById(a).plankValue - speciesById(b).plankValue);
    for (const k of kinds) {
      const free = (storage[k] || 0) - (res[k] || 0);
      const take = Math.min(free, need);
      if (take > 0) {
        res[k] = (res[k] || 0) + take;
        need -= take;
      }
      if (need <= 0) break;
    }
  }
  return res;
}

export function sellQuote(progress, regionId, storage) {
  const res = reservedPlanks(progress, regionId, storage);
  let n = 0;
  let money = 0;
  const take = {};
  for (const [k, v] of Object.entries(storage)) {
    const free = v - (res[k] || 0);
    if (free > 0) {
      take[k] = free;
      n += free;
      money += free * speciesById(k).plankValue;
    }
  }
  return { n, money, take };
}

/* ------------------------------------------------------------ progress updates */
const clone = (p) => ({
  ...p,
  orders: { ...p.orders },
  statistics: { ...p.statistics, toolUse: { ...p.statistics.toolUse }, speciesCut: { ...p.statistics.speciesCut } },
  tutorial: { ...p.tutorial },
});

/**
 * Apply world events to the career. Returns { progress, notes[] } where notes
 * are UI toasts ("Order ready", tutorial steps…). Never pays rewards — that
 * only happens in deliverOrder.
 */
export function applyEvents(progress, regionId, events) {
  let p = null;
  const notes = [];
  const mut = () => (p || (p = clone(progress)));
  for (const ev of events) {
    let objType = null;
    let n = 1;
    if (ev.type === "treeFelled") {
      objType = "CUT_TREE";
      const q = mut();
      q.statistics.treesCut++;
      q.statistics.speciesCut[ev.species] = (q.statistics.speciesCut[ev.species] || 0) + 1;
    } else if (ev.type === "logCollected") objType = "COLLECT_LOGS";
    else if (ev.type === "logProcessed") objType = "PROCESS_LOGS";
    else if (ev.type === "planks") {
      objType = "PRODUCE_PLANKS";
      n = ev.n;
      mut().statistics.planksProduced += ev.n;
    }
    if (objType) {
      const q = mut();
      const order = currentOrder(q, regionId);
      const st = { ...orderState(q, regionId) };
      st.counters = order.objectives.map((o, i) => st.counters[i] || 0);
      let changed = false;
      order.objectives.forEach((o, i) => {
        if (o.type === objType && matches(o, ev.species) && st.counters[i] < o.n) {
          st.counters[i] = Math.min(o.n, st.counters[i] + n);
          changed = true;
        }
      });
      if (changed) q.orders[regionId] = st;
    }
    // tutorial
    const tut = progress.tutorial;
    if (!tut.done) {
      const stepDone = {
        hit: "chop", treeFallen: "fell", logSpawn: "section", pickup: "pickup", deposit: "deposit", planks: "process",
      }[ev.type];
      if (stepDone && !(p || progress).tutorial[stepDone]) mut().tutorial[stepDone] = true;
    }
  }
  return { progress: p || progress, notes };
}

export function markTutorial(progress, id) {
  if (progress.tutorial.done || progress.tutorial[id]) return progress;
  const p = clone(progress);
  p.tutorial[id] = true;
  if (TUTORIAL_STEPS.every((s) => p.tutorial[s.id])) p.tutorial.done = true;
  return p;
}

/** the first tutorial step not yet shown as done */
export function tutorialStep(progress) {
  const t = progress.tutorial;
  if (t.done || t.skipped) return null;
  return TUTORIAL_STEPS.find((s) => !t[s.id]) || null;
}

/**
 * Hand in the current order at the board. Validates everything again,
 * removes exactly the delivered planks from `storage` (mutated in place — it
 * is the live mill storage) and pays the reward once.
 */
export function deliverOrder(progress, regionId, storage) {
  const status = orderStatus(progress, regionId, storage);
  if (!status.ready) return { ok: false, progress };
  const order = status.order;
  if (progress.completedOrders.includes(order.id)) return { ok: false, progress };
  // remove stock
  for (const o of order.objectives) {
    if (o.type !== "DELIVER") continue;
    let need = o.n;
    if (o.species) {
      storage[o.species] -= need;
      need = 0;
    } else {
      const kinds = Object.keys(storage).sort((a, b) => speciesById(a).plankValue - speciesById(b).plankValue);
      for (const k of kinds) {
        const take = Math.min(storage[k], need);
        storage[k] -= take;
        need -= take;
        if (need <= 0) break;
      }
    }
  }
  for (const k of Object.keys(storage)) if (storage[k] <= 0) delete storage[k];
  const p = clone(progress);
  p.money += order.reward;
  p.statistics.moneyEarned += order.reward;
  p.statistics.ordersCompleted++;
  p.completedOrders = [...p.completedOrders, order.id];
  const st = { ...orderState(p, regionId) };
  if (order.contract) st.seq = (st.seq || 0) + 1;
  else st.index = (st.index || 0) + 1;
  st.counters = [];
  p.orders[regionId] = st;
  const unlocked = [];
  for (const u of order.unlocks || []) {
    const [kind, id] = u.split(":");
    if (kind === "vehicle" && !p.unlockedVehicles.includes(id)) {
      p.unlockedVehicles = [...p.unlockedVehicles, id];
      if (!p.selectedVehicle) p.selectedVehicle = id;
      unlocked.push(vehicleById(id).name);
    }
  }
  p.level = levelFor(p.completedOrders.length);
  if (!p.tutorial.deliver) {
    p.tutorial.deliver = true;
    p.tutorial.done = true;
  }
  return { ok: true, progress: p, order, reward: order.reward, unlocked };
}

export function sellTimber(progress, regionId, storage) {
  const q = sellQuote(progress, regionId, storage);
  if (q.n <= 0) return { ok: false, progress };
  for (const [k, v] of Object.entries(q.take)) {
    storage[k] -= v;
    if (storage[k] <= 0) delete storage[k];
  }
  const p = clone(progress);
  p.money += q.money;
  p.statistics.moneyEarned += q.money;
  p.statistics.planksSold = (p.statistics.planksSold || 0) + q.n;
  return { ok: true, progress: p, n: q.n, money: q.money };
}

export const levelFor = (completed) => 1 + Math.floor(completed / 2);

/* ------------------------------------------------------------ shop */
export function canAfford(progress, price) {
  return progress.money >= price;
}

export function buyTool(progress, id) {
  const t = toolById(id);
  if (t.id !== id || progress.unlockedTools.includes(id) || progress.money < t.price) return { ok: false, progress };
  const p = clone(progress);
  p.money -= t.price;
  p.unlockedTools = [...p.unlockedTools, id];
  p.selectedTool = id;
  return { ok: true, progress: p };
}

export function selectTool(progress, id) {
  if (!progress.unlockedTools.includes(id) || progress.selectedTool === id) return progress;
  return { ...progress, selectedTool: id };
}

/** Q: swap between the best owned axe and the best owned chainsaw */
export function toggleToolKind(progress) {
  const cur = toolById(progress.selectedTool);
  const owned = TOOLS.filter((t) => progress.unlockedTools.includes(t.id) && t.kind !== cur.kind);
  if (!owned.length) return progress;
  return { ...progress, selectedTool: owned[owned.length - 1].id };
}

export function buyVehicle(progress, id) {
  const v = vehicleById(id);
  if (!v || progress.unlockedVehicles.includes(id) || v.kind === "cart" || progress.money < v.price) return { ok: false, progress };
  const p = clone(progress);
  p.money -= v.price;
  p.unlockedVehicles = [...p.unlockedVehicles, id];
  p.selectedVehicle = id;
  return { ok: true, progress: p };
}

export function buyUpgrade(progress, id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return { ok: false, progress };
  const lvl = progress.sawmillUpgrades[id] || 0;
  if (lvl >= u.prices.length) return { ok: false, progress };
  const price = u.prices[lvl];
  if (progress.money < price) return { ok: false, progress };
  const p = clone(progress);
  p.money -= price;
  p.sawmillUpgrades = { ...p.sawmillUpgrades, [id]: lvl + 1 };
  return { ok: true, progress: p };
}

export function regionUnlockState(progress, region) {
  const owned = progress.unlockedRegions.includes(region.id);
  const ordersOk = progress.completedOrders.length >= region.unlock.orders;
  const moneyOk = progress.money >= region.unlock.price;
  return { owned, ordersOk, moneyOk, canBuy: !owned && ordersOk && moneyOk };
}

export function unlockRegion(progress, id) {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) return { ok: false, progress };
  const st = regionUnlockState(progress, region);
  if (!st.canBuy) return { ok: false, progress };
  const p = clone(progress);
  p.money -= region.unlock.price;
  p.unlockedRegions = [...p.unlockedRegions, id];
  return { ok: true, progress: p };
}

/** how far through a region's scripted orders the player is (0..1) */
export function regionCompletion(progress, region) {
  const done = region.orders.filter((o) => progress.completedOrders.includes(o.id)).length;
  return done / region.orders.length;
}

/** merge a world's high-frequency counters into the saved stats (then reset them) */
export function flushWorldStats(progress, ws) {
  if (!ws.axeSwings && !ws.chainsawTime && !ws.logsCollected && !ws.logsTransported && ws.distanceWalked < 0.01 && ws.distanceDriven < 0.01 && !Object.keys(ws.toolUse).length) return progress;
  const p = clone(progress);
  const s = p.statistics;
  s.axeSwings += ws.axeSwings;
  s.chainsawTime += ws.chainsawTime;
  s.logsCollected += ws.logsCollected;
  s.logsTransported += ws.logsTransported;
  s.distanceWalked += ws.distanceWalked;
  s.distanceDriven += ws.distanceDriven;
  for (const [k, v] of Object.entries(ws.toolUse)) s.toolUse[k] = (s.toolUse[k] || 0) + v;
  ws.axeSwings = 0;
  ws.chainsawTime = 0;
  ws.logsCollected = 0;
  ws.logsTransported = 0;
  ws.distanceWalked = 0;
  ws.distanceDriven = 0;
  ws.toolUse = {};
  return p;
}

export function favouriteTool(stats) {
  let best = null;
  let bv = 0;
  for (const [k, v] of Object.entries(stats.toolUse || {})) {
    // chainsaw time is seconds; one axe swing ≈ 0.8 s of work
    const w = toolById(k).kind === "chainsaw" ? v : v * 0.8;
    if (w > bv) {
      bv = w;
      best = k;
    }
  }
  return best ? toolById(best).name : "—";
}

export function favouriteSpecies(stats) {
  let best = null;
  let bv = 0;
  for (const [k, v] of Object.entries(stats.speciesCut || {})) {
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  return best && SPECIES[best] ? SPECIES[best].name : "—";
}

export { REGIONS, VEHICLES, UPGRADES, TOOLS };
