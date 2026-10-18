/**
 * Vice Streets 3D — progression, economy and the save file (framework-free).
 *
 * Saved under localStorage `vice-streets-3d-progress` and validated field by
 * field on load (a bad field falls back to its default, never the whole save).
 *
 *   money, xp → level (1–25), reputation
 *   completed missions, unlocked districts, discovered landmarks
 *   garage: owned vehicles {gid, type, paint, up, hp}, active vehicle, improvements
 *   outfits owned / worn, activity records, settings, free-roam position
 */
import { VEHICLES, VEHICLE, PAINTS, UPGRADES, MAX_UPGRADE, upgradeCost, repairCost, vehicleStats } from "../data/vehicles.js";
import { OUTFITS, OUTFIT } from "../data/people.js";
import { MISSIONS, missionById } from "../data/missions.js";

export const STORAGE_KEY = "vice-streets-3d-progress";
export const MAX_LEVEL = 25;
export const xpForLevel = (L) => 200 + 90 * (L - 1);
export const START_DISTRICTS = ["beach", "downtown", "haven"];
export const ALL_DISTRICTS = ["beach", "downtown", "haven", "docks", "hills"];

export const GARAGE_UPS = [
  { id: "capacity", name: "Garage Extension", desc: "More parking: 3 → 5 → 8 vehicles", prices: [6000, 15000] },
  { id: "workshop", name: "Workshop Lift", desc: "Repairs at your garage cost half", prices: [9000] },
  { id: "security", name: "Roll-down Shutters", desc: "Lose the police twice as fast while hiding in your garages", prices: [7000] },
];
export const garageCapacity = (p) => [3, 5, 8][p.garage.up.capacity | 0];

export const DEFAULT_SETTINGS = { sensitivity: 1, invertY: false, volume: 0.8, radio: true, quality: "high", camDist: 1, hints: true, shake: true, units: "kmh" };

export function freshProgress() {
  return {
    v: 1,
    money: 500,
    xp: 0,
    rep: 0,
    completed: [],
    districts: [...START_DISTRICTS],
    discovered: [],
    garage: { cars: [], active: null, next: 1, up: { capacity: 0, workshop: 0, security: 0 } },
    outfits: ["islander"],
    outfit: "islander",
    activity: {},
    stats: { missions: 0, fares: 0, deliveries: 0, races: 0, parks: 0, trials: 0, busted: 0, wasted: 0, earned: 0, driven: 0 },
    settings: { ...DEFAULT_SETTINGS },
    free: null,
    clock: 9,
  };
}

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const isArr = Array.isArray;

export function validate(raw) {
  const p = freshProgress();
  if (!raw || typeof raw !== "object") return p;
  if (isNum(raw.money)) p.money = Math.max(0, Math.round(raw.money));
  if (isNum(raw.xp)) p.xp = Math.max(0, Math.round(raw.xp));
  if (isNum(raw.rep)) p.rep = Math.max(0, Math.round(raw.rep));
  if (isArr(raw.completed)) p.completed = [...new Set(raw.completed.filter((id) => missionById(id)))];
  if (isArr(raw.districts)) p.districts = [...new Set([...START_DISTRICTS, ...raw.districts.filter((d) => ALL_DISTRICTS.includes(d))])];
  if (isArr(raw.discovered)) p.discovered = raw.discovered.filter((x) => typeof x === "string").slice(0, 50);
  const g = raw.garage;
  if (g && typeof g === "object") {
    if (isArr(g.cars)) {
      p.garage.cars = g.cars
        .filter((c) => c && VEHICLE[c.type] && typeof c.gid === "string")
        .map((c) => ({
          gid: c.gid,
          type: c.type,
          paint: typeof c.paint === "string" && /^#[0-9a-f]{6}$/i.test(c.paint) ? c.paint : null,
          up: Object.fromEntries(UPGRADES.map((u) => [u.id, Math.max(0, Math.min(MAX_UPGRADE, (c.up && c.up[u.id]) | 0))])),
          hp: isNum(c.hp) ? Math.max(0, Math.min(1, c.hp)) : 1,
        }))
        .slice(0, 8);
    }
    if (typeof g.active === "string" && p.garage.cars.some((c) => c.gid === g.active)) p.garage.active = g.active;
    else p.garage.active = p.garage.cars[0]?.gid || null;
    if (isNum(g.next)) p.garage.next = Math.max(p.garage.cars.length + 1, g.next | 0);
    if (g.up && typeof g.up === "object") for (const u of GARAGE_UPS) p.garage.up[u.id] = Math.max(0, Math.min(u.prices.length, g.up[u.id] | 0));
  }
  if (isArr(raw.outfits)) p.outfits = [...new Set(["islander", ...raw.outfits.filter((o) => OUTFIT[o])])];
  if (typeof raw.outfit === "string" && p.outfits.includes(raw.outfit)) p.outfit = raw.outfit;
  if (raw.activity && typeof raw.activity === "object") {
    for (const [k, v] of Object.entries(raw.activity)) if (v && typeof v === "object") p.activity[k] = { plays: v.plays | 0, wins: v.wins | 0, best: isNum(v.best) ? v.best : null };
  }
  if (raw.stats && typeof raw.stats === "object") for (const k of Object.keys(p.stats)) if (isNum(raw.stats[k])) p.stats[k] = raw.stats[k];
  if (raw.settings && typeof raw.settings === "object") {
    const s = raw.settings;
    if (isNum(s.sensitivity)) p.settings.sensitivity = Math.max(0.3, Math.min(2.5, s.sensitivity));
    if (typeof s.invertY === "boolean") p.settings.invertY = s.invertY;
    if (isNum(s.volume)) p.settings.volume = Math.max(0, Math.min(1, s.volume));
    if (typeof s.radio === "boolean") p.settings.radio = s.radio;
    if (["low", "medium", "high"].includes(s.quality)) p.settings.quality = s.quality;
    if (isNum(s.camDist)) p.settings.camDist = Math.max(0.7, Math.min(1.5, s.camDist));
    if (typeof s.hints === "boolean") p.settings.hints = s.hints;
    if (typeof s.shake === "boolean") p.settings.shake = s.shake;
    if (["kmh", "mph"].includes(s.units)) p.settings.units = s.units;
  }
  if (raw.free && isNum(raw.free.x) && isNum(raw.free.z) && Math.abs(raw.free.x) < 400 && Math.abs(raw.free.z) < 420) p.free = { x: raw.free.x, z: raw.free.z, h: isNum(raw.free.h) ? raw.free.h : 0 };
  if (isNum(raw.clock)) p.clock = ((raw.clock % 24) + 24) % 24;
  return p;
}

export function loadProgress(storage) {
  try {
    const s = storage.getItem(STORAGE_KEY);
    return s ? validate(JSON.parse(s)) : freshProgress();
  } catch {
    return freshProgress();
  }
}
export function saveProgress(storage, p) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
export const clone = (p) => JSON.parse(JSON.stringify(p));

/* ------------------------------------------------------------------ levels */
export function levelInfo(xp) {
  let L = 1;
  let rest = Math.max(0, xp);
  while (L < MAX_LEVEL && rest >= xpForLevel(L)) {
    rest -= xpForLevel(L);
    L++;
  }
  const need = L >= MAX_LEVEL ? 1 : xpForLevel(L);
  return { level: L, into: L >= MAX_LEVEL ? need : rest, need, frac: L >= MAX_LEVEL ? 1 : rest / need };
}
export const levelOf = (p) => levelInfo(p.xp).level;
/** mutates; returns the new level when it went up */
export function addXp(p, n) {
  const before = levelOf(p);
  p.xp += Math.max(0, Math.round(n));
  const after = levelOf(p);
  return after > before ? after : null;
}
export function addMoney(p, n) {
  p.money = Math.max(0, Math.round(p.money + n));
  if (n > 0) p.stats.earned += Math.round(n);
}
export const REP_TITLES = [
  [0, "Newcomer"],
  [20, "Local"],
  [45, "Hustler"],
  [70, "Fixer"],
  [100, "Big Shot"],
  [130, "King of the Streets"],
];
export const repTitle = (rep) => REP_TITLES.filter(([r]) => rep >= r).pop()[1];

/* ------------------------------------------------------------------ missions */
export function missionState(p, m) {
  if (p.completed.includes(m.id)) return "done";
  const r = m.req || {};
  if (r.after && !p.completed.includes(r.after)) return "locked";
  if ((r.rep || 0) > p.rep) return "rep";
  if ((r.level || 1) > levelOf(p)) return "level";
  return "open";
}
export const nextMission = (p) => MISSIONS.find((m) => missionState(p, m) !== "done") || null;
export const playableMissions = (p) => MISSIONS.filter((m) => ["open", "done"].includes(missionState(p, m)));

/** apply a finished mission; returns notices for the results screen */
export function applyMission(p, def, result) {
  const notes = [];
  if (!result.win) return { notes, money: 0, xp: 0, rep: 0 };
  const first = !p.completed.includes(def.id);
  const k = first ? 1 : 0.4;
  const money = Math.round(def.reward.money * k);
  const xp = Math.round(def.reward.xp * k);
  const rep = first ? def.reward.rep : 0;
  addMoney(p, money);
  const lvl = addXp(p, xp);
  p.rep += rep;
  if (first) {
    p.completed.push(def.id);
    p.stats.missions++;
    if (def.unlockOnStart && !p.districts.includes(def.unlockOnStart)) p.districts.push(def.unlockOnStart);
    if (def.unlock && !p.districts.includes(def.unlock)) {
      p.districts.push(def.unlock);
      notes.push(`District unlocked: ${def.unlock}`);
    }
    if (def.reward.car && !p.garage.cars.some((c) => c.type === def.reward.car)) {
      const c = addCar(p, def.reward.car);
      if (c) notes.push(`New vehicle: ${VEHICLE[def.reward.car].name} (in your garage)`);
    }
    const nm = MISSIONS.find((m) => m.req?.after === def.id);
    if (nm) notes.push(`Next mission: ${nm.id}. ${nm.title}${nm.req.rep > p.rep ? ` (needs ${nm.req.rep} reputation)` : ""}`);
  } else notes.push("Replay reward: 40%");
  if (lvl) notes.push(`Level up! You are now level ${lvl}`);
  return { notes, money, xp, rep };
}

/** apply a finished side activity */
export function applyActivity(p, act, result) {
  const a = (p.activity[act.id] = p.activity[act.id] || { plays: 0, wins: 0, best: null });
  a.plays++;
  const notes = [];
  let money = Math.round(result.earned || 0);
  let xp = 0;
  let rep = 0;
  if (result.win) {
    a.wins++;
    money += act.reward.money;
    xp = act.reward.xp;
    rep = act.reward.rep;
    if (result.t && (a.best == null || result.t < a.best)) {
      a.best = Math.round(result.t * 10) / 10;
      notes.push("New personal best!");
    }
    const key = { taxi: "fares", delivery: "deliveries", race: "races", parking: "parks", trial: "trials" }[act.id];
    if (key) p.stats[key]++;
  } else xp = Math.round(act.reward.xp * 0.25);
  addMoney(p, money);
  const lvl = addXp(p, xp);
  p.rep += rep;
  if (lvl) notes.push(`Level up! You are now level ${lvl}`);
  return { notes, money, xp, rep };
}

/* ------------------------------------------------------------------ garage + shops */
export function addCar(p, type, paint = null) {
  if (p.garage.cars.length >= garageCapacity(p)) return null;
  const c = { gid: `g${p.garage.next++}`, type, paint, up: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), hp: 1 };
  p.garage.cars.push(c);
  if (!p.garage.active) p.garage.active = c.gid;
  return c;
}
export const carById = (p, gid) => p.garage.cars.find((c) => c.gid === gid) || null;
export function vehicleLock(p, type) {
  const v = VEHICLE[type];
  if (levelOf(p) < v.level) return `Requires level ${v.level}`;
  if (p.rep < v.rep) return `Requires ${v.rep} reputation`;
  return null;
}
/** returns { ok, msg } — mutates p on success */
export function buyVehicle(p, type) {
  const v = VEHICLE[type];
  if (!v) return { ok: false, msg: "Unknown vehicle" };
  const lock = vehicleLock(p, type);
  if (lock) return { ok: false, msg: lock };
  if (p.money < v.price) return { ok: false, msg: "Not enough money" };
  if (p.garage.cars.length >= garageCapacity(p)) return { ok: false, msg: "Garage full — buy a Garage Extension or sell a car" };
  p.money -= v.price;
  const c = addCar(p, type);
  p.garage.active = c.gid;
  return { ok: true, msg: `${v.name} purchased!`, car: c };
}
export function sellVehicle(p, gid) {
  const c = carById(p, gid);
  if (!c) return { ok: false, msg: "No such vehicle" };
  if (p.garage.cars.length <= 1) return { ok: false, msg: "You can't sell your only car" };
  const value = Math.round((VEHICLE[c.type].price * 0.5) / 50) * 50;
  p.garage.cars = p.garage.cars.filter((x) => x !== c);
  if (p.garage.active === gid) p.garage.active = p.garage.cars[0].gid;
  addMoney(p, value);
  return { ok: true, msg: `Sold for $${value.toLocaleString("en-US")}` };
}
export function setActive(p, gid) {
  if (!carById(p, gid)) return { ok: false, msg: "No such vehicle" };
  p.garage.active = gid;
  return { ok: true, msg: "Active vehicle set" };
}
export function repairPrice(p, gid) {
  const c = carById(p, gid);
  if (!c) return 0;
  const base = repairCost(c.type, 1 - c.hp);
  return Math.round(base * (p.garage.up.workshop ? 0.5 : 1));
}
export function repairCar(p, gid) {
  const c = carById(p, gid);
  if (!c) return { ok: false, msg: "No such vehicle" };
  if (c.hp >= 0.999) return { ok: false, msg: "Already in perfect shape" };
  const cost = repairPrice(p, gid);
  if (p.money < cost) return { ok: false, msg: "Not enough money" };
  p.money -= cost;
  c.hp = 1;
  return { ok: true, msg: `Repaired for $${cost}` };
}
export function paintCar(p, gid, paintId) {
  const c = carById(p, gid);
  const pt = PAINTS.find((x) => x.id === paintId);
  if (!c || !pt) return { ok: false, msg: "Not available" };
  const cur = c.paint || null;
  if (cur === pt.hex) return { ok: false, msg: "Already that colour" };
  if (p.money < pt.price) return { ok: false, msg: "Not enough money" };
  p.money -= pt.price;
  c.paint = pt.hex;
  return { ok: true, msg: `Painted ${pt.name}` };
}
export function upgradeCar(p, gid, upId) {
  const c = carById(p, gid);
  if (!c) return { ok: false, msg: "No such vehicle" };
  const r = c.up[upId] | 0;
  if (r >= MAX_UPGRADE) return { ok: false, msg: "Fully upgraded" };
  const cost = upgradeCost(c.type, upId, r);
  if (p.money < cost) return { ok: false, msg: "Not enough money" };
  p.money -= cost;
  c.up[upId] = r + 1;
  return { ok: true, msg: `${UPGRADES.find((u) => u.id === upId).name} upgraded to rank ${r + 1}` };
}
export function buyGarageUp(p, id) {
  const u = GARAGE_UPS.find((x) => x.id === id);
  const r = p.garage.up[id] | 0;
  if (!u || r >= u.prices.length) return { ok: false, msg: "Already installed" };
  const cost = u.prices[r];
  if (p.money < cost) return { ok: false, msg: "Not enough money" };
  p.money -= cost;
  p.garage.up[id] = r + 1;
  return { ok: true, msg: `${u.name} installed` };
}
export function buyOutfit(p, id) {
  const o = OUTFIT[id];
  if (!o) return { ok: false, msg: "Not available" };
  if (p.outfits.includes(id)) {
    p.outfit = id;
    return { ok: true, msg: `Wearing ${o.name}` };
  }
  if (o.level && levelOf(p) < o.level) return { ok: false, msg: `Requires level ${o.level}` };
  if (p.money < o.price) return { ok: false, msg: "Not enough money" };
  p.money -= o.price;
  p.outfits.push(id);
  p.outfit = id;
  return { ok: true, msg: `Bought ${o.name}` };
}
export const statsFor = (c) => vehicleStats(c.type, c.up);
export { VEHICLES, PAINTS, UPGRADES, OUTFITS };
