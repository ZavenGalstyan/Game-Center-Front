/**
 * Metro Rush — save data (localStorage `metro-rush-save`), purchases,
 * missions and daily challenges. Everything here is pure: functions take a
 * save and return a new one (or null when the action isn't allowed).
 */
import { CHARACTERS, charById } from "./data/characters.js";
import { BOARDS, BOARD_PACKS, boardById } from "./data/boards.js";
import { DAILY_BONUS, DAILY_POOL, MAX_MULT, MISSION_SETS, SET_BONUS, UPGRADES, UPGRADE_MAX, upgradeCost, upgradeMul } from "./data/missions.js";
import { THEMES } from "./data/themes.js";
import { POWER_T } from "./engine/config.js";
import { hashString, rngInt } from "./engine/rng.js";

export const SAVE_KEY = "metro-rush-save";
const VERSION = 1;

export function defaultSave() {
  return {
    v: VERSION,
    coins: 0,
    best: 0,
    bestDist: 0,
    runs: 0,
    totals: {},
    chars: { kai: ["classic"] },
    char: "kai",
    outfit: "classic",
    boards: ["breeze"],
    board: "breeze",
    charges: 3,
    upgrades: { magnet: 0, mult: 0, shield: 0, boost: 0, board: 0 },
    mset: 0,
    mprog: [0, 0, 0],
    mdone: [false, false, false],
    mult: 1,
    daily: null,
    tutorialDone: false,
    settings: { music: 0.55, sfx: 0.9, quality: "auto", theme: "metro", tour: true },
  };
}

const num = (v, d = 0, lo = 0, hi = 1e12) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

export function sanitize(raw) {
  const d = defaultSave();
  if (!raw || typeof raw !== "object") return d;
  const s = { ...d };
  s.coins = Math.floor(num(raw.coins));
  s.best = Math.floor(num(raw.best));
  s.bestDist = Math.floor(num(raw.bestDist));
  s.runs = Math.floor(num(raw.runs));
  s.totals = {};
  if (raw.totals && typeof raw.totals === "object") for (const [k, v] of Object.entries(raw.totals)) s.totals[k] = num(v);
  s.chars = { kai: ["classic"] };
  if (raw.chars && typeof raw.chars === "object") {
    for (const ch of CHARACTERS) {
      const owned = raw.chars[ch.id];
      if (!Array.isArray(owned)) continue;
      const ok = owned.filter((o) => ch.outfits.some((x) => x.id === o));
      if (!ok.includes("classic")) ok.unshift("classic");
      s.chars[ch.id] = [...new Set(ok)];
    }
  }
  s.char = s.chars[raw.char] ? raw.char : "kai";
  s.outfit = (s.chars[s.char] || []).includes(raw.outfit) ? raw.outfit : "classic";
  s.boards = Array.isArray(raw.boards) ? [...new Set(["breeze", ...raw.boards.filter((b) => BOARDS.some((x) => x.id === b))])] : ["breeze"];
  s.board = s.boards.includes(raw.board) ? raw.board : "breeze";
  s.charges = Math.floor(num(raw.charges, 3, 0, 999));
  s.upgrades = { ...d.upgrades };
  if (raw.upgrades) for (const u of UPGRADES) s.upgrades[u.id] = Math.floor(num(raw.upgrades[u.id], 0, 0, UPGRADE_MAX));
  s.mset = Math.floor(num(raw.mset, 0, 0, MISSION_SETS.length));
  s.mprog = [0, 1, 2].map((i) => num(Array.isArray(raw.mprog) ? raw.mprog[i] : 0));
  s.mdone = [0, 1, 2].map((i) => !!(Array.isArray(raw.mdone) && raw.mdone[i]));
  s.mult = Math.floor(num(raw.mult, 1, 1, MAX_MULT));
  s.tutorialDone = !!raw.tutorialDone;
  const st = raw.settings || {};
  s.settings = {
    music: num(st.music, d.settings.music, 0, 1),
    sfx: num(st.sfx, d.settings.sfx, 0, 1),
    quality: ["auto", "high", "medium", "low"].includes(st.quality) ? st.quality : "auto",
    theme: THEMES.some((t) => t.id === st.theme) ? st.theme : "metro",
    tour: st.tour === undefined ? true : !!st.tour,
  };
  if (raw.daily && typeof raw.daily === "object" && typeof raw.daily.date === "string" && Array.isArray(raw.daily.ids)) {
    const dl = raw.daily;
    const ids = dl.ids.filter((id) => DAILY_POOL.some((p) => p.id === id)).slice(0, 3);
    if (ids.length === 3) {
      s.daily = {
        date: dl.date,
        ids,
        targets: [0, 1, 2].map((i) => Math.max(1, Math.floor(num(dl.targets?.[i], 1)))),
        prog: [0, 1, 2].map((i) => num(dl.prog?.[i])),
        done: [0, 1, 2].map((i) => !!dl.done?.[i]),
        bonus: !!dl.bonus,
        streak: Math.floor(num(dl.streak, 0, 0, 9999)),
        lastDay: typeof dl.lastDay === "string" ? dl.lastDay : "",
      };
    }
  }
  return s;
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return ensureDaily(sanitize(raw ? JSON.parse(raw) : null));
  } catch {
    return ensureDaily(defaultSave());
  }
}
export function storeSave(s) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ daily */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const prevDay = (key) => {
  const [y, m, dd] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, dd - 1));
};

export function makeDaily(date, streak = 0, lastDay = "") {
  const st = { s: hashString("metro-rush:" + date) | 0 };
  const pool = DAILY_POOL.slice();
  const ids = [];
  const targets = [];
  for (let i = 0; i < 3; i++) {
    const p = pool.splice(rngInt(st, pool.length), 1)[0];
    ids.push(p.id);
    targets.push(p.base + p.step * rngInt(st, 4));
  }
  return { date, ids, targets, prog: [0, 0, 0], done: [false, false, false], bonus: false, streak, lastDay };
}

export function ensureDaily(save, now = new Date()) {
  const today = dayKey(now);
  if (save.daily && save.daily.date === today) return save;
  const old = save.daily;
  // the streak survives only if yesterday's set was finished
  const streak = old && old.lastDay === prevDay(today) ? old.streak : 0;
  return { ...save, daily: makeDaily(today, streak, old ? old.lastDay : "") };
}

export const dailyDefs = (daily) => (daily ? daily.ids.map((id, i) => ({ ...DAILY_POOL.find((p) => p.id === id), target: daily.targets[i] })) : []);
export const dailyText = (def) => def.text.replace("{n}", def.target.toLocaleString("en-US"));

/* ------------------------------------------------------------------ missions */
export const currentSet = (save) => MISSION_SETS[save.mset] || null;
const statOf = (stats, stat) => (stat === "runs" ? 0 : Math.floor(stats[stat] || 0));

/** mission progress including the run in progress (nothing is saved) */
export function liveMissions(save, stats) {
  const set = currentSet(save);
  if (!set) return [];
  return set.map((m, i) => {
    const base = save.mprog[i] || 0;
    const value = save.mdone[i] ? m.target : m.scope === "run" ? Math.max(base, statOf(stats, m.stat)) : base + statOf(stats, m.stat);
    return { ...m, value: Math.min(value, m.target), done: save.mdone[i] || value >= m.target };
  });
}
export function liveDaily(save, stats) {
  const d = save.daily;
  if (!d) return [];
  return dailyDefs(d).map((def, i) => {
    const value = d.done[i] ? def.target : (d.prog[i] || 0) + statOf(stats, def.stat);
    return { ...def, value: Math.min(value, def.target), done: d.done[i] || value >= def.target };
  });
}

/**
 * Fold a finished (or abandoned) run into the save.
 * Returns { save, report } — report lists everything that was earned.
 */
export function commitRun(save0, stats, { spentRevives = 0, now = new Date() } = {}) {
  let save = ensureDaily(save0, now);
  const report = { coins: Math.floor(stats.coins || 0), missionCoins: 0, missions: [], setDone: null, daily: [], dailyBonus: 0, newBest: false, newBestDist: false };
  const totals = { ...save.totals };
  for (const [k, v] of Object.entries(stats)) if (typeof v === "number") totals[k] = (totals[k] || 0) + v;
  totals.runs = (totals.runs || 0) + 1;
  save = {
    ...save,
    totals,
    runs: save.runs + 1,
    coins: Math.max(0, save.coins + report.coins - spentRevives),
  };
  if ((stats.score || 0) > save.best) {
    save.best = Math.floor(stats.score);
    report.newBest = true;
  }
  if ((stats.dist || 0) > save.bestDist) {
    save.bestDist = Math.floor(stats.dist);
    report.newBestDist = true;
  }
  // missions
  const set = currentSet(save);
  if (set) {
    const mprog = save.mprog.slice();
    const mdone = save.mdone.slice();
    set.forEach((m, i) => {
      if (mdone[i]) return;
      const runVal = m.stat === "runs" ? 1 : Math.floor(stats[m.stat] || 0);
      mprog[i] = m.scope === "run" ? Math.max(mprog[i], runVal) : mprog[i] + runVal;
      if (mprog[i] >= m.target) {
        mdone[i] = true;
        mprog[i] = m.target;
        report.missions.push(m);
        report.missionCoins += m.reward;
      }
    });
    save = { ...save, mprog, mdone };
    if (mdone.every(Boolean)) {
      const bonus = SET_BONUS(save.mset);
      report.setDone = { index: save.mset, bonus, mult: Math.min(MAX_MULT, save.mult + 1) };
      report.missionCoins += bonus;
      save = { ...save, mset: save.mset + 1, mult: Math.min(MAX_MULT, save.mult + 1), mprog: [0, 0, 0], mdone: [false, false, false] };
    }
  }
  // daily
  if (save.daily) {
    const d = { ...save.daily, prog: save.daily.prog.slice(), done: save.daily.done.slice() };
    dailyDefs(d).forEach((def, i) => {
      if (d.done[i]) return;
      d.prog[i] += def.stat === "runs" ? 1 : Math.floor(stats[def.stat] || 0);
      if (d.prog[i] >= def.target) {
        d.done[i] = true;
        d.prog[i] = def.target;
        report.daily.push(def);
        report.missionCoins += def.reward;
      }
    });
    if (d.done.every(Boolean) && !d.bonus) {
      d.bonus = true;
      d.streak = (d.lastDay === prevDay(d.date) ? d.streak : 0) + 1;
      d.lastDay = d.date;
      report.dailyBonus = DAILY_BONUS + Math.min(10, d.streak - 1) * 50;
      report.missionCoins += report.dailyBonus;
    }
    save = { ...save, daily: d };
  }
  save.coins += report.missionCoins;
  return { save, report };
}

/* ------------------------------------------------------------------ shop */
export function buyCharacter(save, id) {
  const ch = charById(id);
  if (ch.id !== id || save.chars[id] || save.coins < ch.price) return null;
  return { ...save, coins: save.coins - ch.price, chars: { ...save.chars, [id]: ["classic"] }, char: id, outfit: "classic" };
}
export function buyOutfit(save, id, outfitId) {
  const ch = charById(id);
  const o = ch.outfits.find((x) => x.id === outfitId);
  const owned = save.chars[id];
  if (!o || !owned || owned.includes(outfitId) || save.coins < o.price) return null;
  return { ...save, coins: save.coins - o.price, chars: { ...save.chars, [id]: [...owned, outfitId] }, char: id, outfit: outfitId };
}
export function selectCharacter(save, id, outfitId = "classic") {
  if (!save.chars[id] || !save.chars[id].includes(outfitId)) return null;
  return { ...save, char: id, outfit: outfitId };
}
export function buyBoard(save, id) {
  const b = boardById(id);
  if (b.id !== id || save.boards.includes(id) || save.coins < b.price) return null;
  return { ...save, coins: save.coins - b.price, boards: [...save.boards, id], board: id };
}
export function selectBoard(save, id) {
  if (!save.boards.includes(id)) return null;
  return { ...save, board: id };
}
export function buyPack(save, packId) {
  const p = BOARD_PACKS.find((x) => x.id === packId);
  if (!p || save.coins < p.price) return null;
  return { ...save, coins: save.coins - p.price, charges: Math.min(999, save.charges + p.count) };
}
export function buyUpgrade(save, id) {
  const lvl = save.upgrades[id] ?? 0;
  const cost = upgradeCost(lvl);
  if (lvl >= UPGRADE_MAX || save.coins < cost) return null;
  return { ...save, coins: save.coins - cost, upgrades: { ...save.upgrades, [id]: lvl + 1 } };
}
export const reviveCost = (n) => 150 * 2 ** n;

/** power-up durations with upgrades applied */
export function powerTimes(save) {
  const out = {};
  for (const k of Object.keys(POWER_T)) out[k] = POWER_T[k] * upgradeMul(save.upgrades[k]);
  return out;
}
