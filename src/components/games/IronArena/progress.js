/**
 * Iron Arena — local persistence (localStorage `iron-arena-save`): coins,
 * owned tanks with their upgrade levels and skins, the selected tank, last
 * match setup, settings and career stats. Every read is defensive — missing
 * or malformed fields fall back to defaults. No real-money anything.
 */
import { TANKS, TANK_BY_ID, SKINS, UPGRADE_KEYS, UPGRADE_MAX, upgradeCost, skinFor } from "./engine/tanks.js";
import { MODES, DIFFICULTY } from "./engine/modes.js";
import { MAP_IDS } from "./engine/maps/index.js";

export const SAVE_KEY = "iron-arena-save";
export const START_COINS = 600;

export const DEFAULT_SETTINGS = {
  quality: "auto",
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  sens: 1,
  touchSens: 1,
  invert: false,
  toggleScope: false,
  fov: 60,
  showFps: false,
  shake: true,
};

const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));

function defaultTanks() {
  const out = {};
  for (const t of TANKS) out[t.id] = { owned: t.price === 0, up: { armor: 0, speed: 0, damage: 0 }, skins: ["factory"], skin: "factory" };
  return out;
}

export function defaultSave() {
  return {
    v: 1,
    coins: START_COINS,
    tanks: defaultTanks(),
    selected: "striker",
    setup: { mode: "dm", map: "desert", difficulty: "normal" },
    settings: { ...DEFAULT_SETTINGS },
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0, caps: 0, coinsEarned: 0, bestStreak: 0, damage: 0, time: 0 },
    seenIntro: false,
  };
}

export function sanitize(raw) {
  const D = defaultSave();
  const s = raw && typeof raw === "object" ? raw : {};
  const tanks = defaultTanks();
  const rt = s.tanks && typeof s.tanks === "object" ? s.tanks : {};
  for (const t of TANKS) {
    const r = rt[t.id];
    if (!r || typeof r !== "object") continue;
    const skins = Array.isArray(r.skins) ? r.skins.filter((id) => (SKINS[t.id] || []).some((k) => k.id === id)) : [];
    if (!skins.includes("factory")) skins.unshift("factory");
    tanks[t.id] = {
      owned: t.price === 0 || !!r.owned,
      up: Object.fromEntries(UPGRADE_KEYS.map((k) => [k, int(r.up?.[k], 0, 0, UPGRADE_MAX)])),
      skins,
      skin: skins.includes(r.skin) ? r.skin : "factory",
    };
  }
  const st = s.settings || {};
  const settings = {
    quality: ["auto", "low", "medium", "high"].includes(st.quality) ? st.quality : D.settings.quality,
    master: num(st.master, D.settings.master, 0, 1),
    music: num(st.music, D.settings.music, 0, 1),
    sfx: num(st.sfx, D.settings.sfx, 0, 1),
    sens: num(st.sens, D.settings.sens, 0.2, 3),
    touchSens: num(st.touchSens, D.settings.touchSens, 0.2, 3),
    invert: !!st.invert,
    toggleScope: !!st.toggleScope,
    fov: num(st.fov, D.settings.fov, 50, 80),
    showFps: !!st.showFps,
    shake: st.shake !== false,
  };
  const su = s.setup || {};
  const setup = {
    mode: MODES[su.mode] ? su.mode : D.setup.mode,
    map: MAP_IDS.includes(su.map) ? su.map : D.setup.map,
    difficulty: DIFFICULTY[su.difficulty] ? su.difficulty : D.setup.difficulty,
  };
  const ss = s.stats || {};
  const stats = {};
  for (const k of Object.keys(D.stats)) stats[k] = num(ss[k], 0, 0);
  const selected = tanks[s.selected]?.owned ? s.selected : "striker";
  return { v: 1, coins: int(s.coins, D.coins, 0, 1e9), tanks, selected, setup, settings, stats, seenIntro: !!s.seenIntro };
}

export function loadSave() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(SAVE_KEY) || "null"));
  } catch {
    return defaultSave();
  }
}
export function storeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ economy */
export function buyTank(save, id) {
  const t = TANK_BY_ID[id];
  if (!t || save.tanks[id]?.owned || save.coins < t.price) return null;
  return { ...save, coins: save.coins - t.price, tanks: { ...save.tanks, [id]: { ...save.tanks[id], owned: true } }, selected: id };
}
export function buyUpgrade(save, id, key) {
  const tk = save.tanks[id];
  if (!tk?.owned || !UPGRADE_KEYS.includes(key)) return null;
  const lvl = tk.up[key];
  const cost = upgradeCost(id, key, lvl);
  if (lvl >= UPGRADE_MAX || save.coins < cost) return null;
  return { ...save, coins: save.coins - cost, tanks: { ...save.tanks, [id]: { ...tk, up: { ...tk.up, [key]: lvl + 1 } } } };
}
export function buySkin(save, id, skinId) {
  const tk = save.tanks[id];
  const skin = skinFor(id, skinId);
  if (!tk?.owned || skin.id !== skinId) return null;
  if (tk.skins.includes(skinId)) return { ...save, tanks: { ...save.tanks, [id]: { ...tk, skin: skinId } } };
  if (save.coins < skin.cost) return null;
  return { ...save, coins: save.coins - skin.cost, tanks: { ...save.tanks, [id]: { ...tk, skins: [...tk.skins, skinId], skin: skinId } } };
}
export function selectTank(save, id) {
  if (!save.tanks[id]?.owned) return null;
  return { ...save, selected: id };
}

/** coins for a finished match (also used by the results screen breakdown) */
export function matchReward(summary) {
  const diff = DIFFICULTY[summary.difficulty]?.coins ?? 1;
  const lines = [
    ["Participation", 120],
    [`Kills × ${summary.kills}`, summary.kills * 35],
    [`Assists × ${summary.assists}`, summary.assists * 12],
  ];
  if (summary.caps) lines.push([`Flag captures × ${summary.caps}`, summary.caps * 120]);
  if (summary.returns) lines.push([`Flag returns × ${summary.returns}`, summary.returns * 40]);
  lines.push([summary.result === "win" ? "Victory bonus" : summary.result === "draw" ? "Draw bonus" : "Effort bonus", summary.result === "win" ? 250 : summary.result === "draw" ? 120 : 50]);
  if (summary.forfeit) lines.length = 1; // leaving early pays participation only
  const base = lines.reduce((a, [, v]) => a + v, 0);
  const total = Math.round((base * diff) / 5) * 5;
  return { lines, diff, total };
}

export function recordMatch(save, summary) {
  const reward = matchReward(summary);
  const st = save.stats;
  const stats = {
    matches: st.matches + 1,
    wins: st.wins + (summary.result === "win" ? 1 : 0),
    kills: st.kills + summary.kills,
    deaths: st.deaths + summary.deaths,
    assists: st.assists + summary.assists,
    caps: st.caps + (summary.caps || 0),
    coinsEarned: st.coinsEarned + reward.total,
    bestStreak: Math.max(st.bestStreak, summary.bestStreak || 0),
    damage: st.damage + Math.round(summary.damage || 0),
    time: st.time + Math.round(summary.time || 0),
  };
  return { save: { ...save, coins: save.coins + reward.total, stats }, reward };
}
