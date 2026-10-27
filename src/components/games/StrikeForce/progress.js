/**
 * Strike Force — local persistence (localStorage `strike-force-save`).
 * Settings, the last match setup, the loadout and career statistics.
 * Reads are defensive: anything missing or malformed falls back to defaults.
 */
import { WEAPON_BY_ID } from "./engine/weapons.js";
import { MAPS } from "./engine/maps/index.js";
import { MODES, DIFFICULTY, SIZES } from "./engine/config.js";

export const SAVE_KEY = "strike-force-save";

export const DEFAULT_SETTINGS = {
  quality: "auto",
  fov: 95,
  sens: 1,
  adsSens: 0.8,
  touchSens: 1,
  invert: false,
  toggleAds: false,
  master: 0.8,
  music: 0.45,
  sfx: 0.9,
  showFps: false,
};

const DEFAULT = {
  v: 1,
  settings: DEFAULT_SETTINGS,
  setup: { mode: "tdm", map: "harbor", difficulty: "normal", size: "standard" },
  loadout: { primary: "vx9", secondary: "p9" },
  stats: { matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, assists: 0, bestStreak: 0, captures: 0, shots: 0, hits: 0, time: 0, xp: 0, weapons: {}, modes: {}, maps: {} },
};

const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function loadSave() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
  } catch {
    raw = null;
  }
  const s = raw && typeof raw === "object" ? raw : {};
  const st = s.settings || {};
  const settings = {
    quality: ["auto", "low", "medium", "high"].includes(st.quality) ? st.quality : DEFAULT_SETTINGS.quality,
    fov: num(st.fov, DEFAULT_SETTINGS.fov, 75, 115),
    sens: num(st.sens, DEFAULT_SETTINGS.sens, 0.1, 4),
    adsSens: num(st.adsSens, DEFAULT_SETTINGS.adsSens, 0.2, 1.5),
    touchSens: num(st.touchSens, DEFAULT_SETTINGS.touchSens, 0.2, 3),
    invert: !!st.invert,
    toggleAds: !!st.toggleAds,
    master: num(st.master, DEFAULT_SETTINGS.master, 0, 1),
    music: num(st.music, DEFAULT_SETTINGS.music, 0, 1),
    sfx: num(st.sfx, DEFAULT_SETTINGS.sfx, 0, 1),
    showFps: !!st.showFps,
  };
  const su = s.setup || {};
  const setup = {
    mode: MODES[su.mode] ? su.mode : DEFAULT.setup.mode,
    map: MAPS.some((m) => m.id === su.map) ? su.map : DEFAULT.setup.map,
    difficulty: DIFFICULTY[su.difficulty] ? su.difficulty : DEFAULT.setup.difficulty,
    size: SIZES[su.size] ? su.size : DEFAULT.setup.size,
  };
  const lo = s.loadout || {};
  const loadout = {
    primary: WEAPON_BY_ID[lo.primary] && WEAPON_BY_ID[lo.primary].cat !== "pistol" ? lo.primary : DEFAULT.loadout.primary,
    secondary: WEAPON_BY_ID[lo.secondary] && WEAPON_BY_ID[lo.secondary].cat === "pistol" ? lo.secondary : DEFAULT.loadout.secondary,
  };
  const sv = s.stats || {};
  const stats = { ...DEFAULT.stats };
  for (const k of Object.keys(DEFAULT.stats)) {
    if (typeof DEFAULT.stats[k] === "number") stats[k] = num(sv[k], 0, 0);
    else stats[k] = sv[k] && typeof sv[k] === "object" ? sv[k] : {};
  }
  return { v: 1, settings, setup, loadout, stats };
}

export function storeSave(s) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage full / blocked — the game keeps running without saving */
  }
}

/** fold a finished match into career stats; returns { save, xp } */
export function recordMatch(save, m, weaponKills) {
  const p = m.player;
  const won = !!m.result?.won;
  const xp = Math.round(p.score * 0.5 + (won ? 400 : 150) + p.caps * 60);
  const st = { ...save.stats };
  st.matches++;
  if (won) st.wins++;
  st.kills += p.kills;
  st.deaths += p.deaths;
  st.headshots += p.headshots;
  st.assists += p.assists;
  st.captures += p.caps;
  st.shots += p.shots;
  st.hits += p.hits;
  st.bestStreak = Math.max(st.bestStreak, p.bestStreak);
  st.time += Math.round(m.t);
  st.xp += xp;
  st.weapons = { ...st.weapons };
  for (const [w, k] of Object.entries(weaponKills || {})) st.weapons[w] = (st.weapons[w] || 0) + k;
  const mid = m.mode.id;
  st.modes = { ...st.modes, [mid]: { played: (st.modes[mid]?.played || 0) + 1, won: (st.modes[mid]?.won || 0) + (won ? 1 : 0) } };
  const map = m.map.id;
  st.maps = { ...st.maps, [map]: { played: (st.maps[map]?.played || 0) + 1, won: (st.maps[map]?.won || 0) + (won ? 1 : 0) } };
  return { save: { ...save, stats: st }, xp };
}

/** rank from XP: 1..50 */
export function rankOf(xp) {
  let lvl = 1;
  let need = 600;
  let left = xp;
  while (left >= need && lvl < 50) {
    left -= need;
    lvl++;
    need = Math.round(need * 1.12);
  }
  return { level: lvl, into: left, need };
}
