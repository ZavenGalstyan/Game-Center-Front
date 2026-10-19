/**
 * Hulk: Open World 3D — progression + save data (framework-free).
 *
 * Total XP → level (1-30, config.xpForLevel). Each level beyond 1 grants an
 * upgrade point; boss victories grant 2 more and every completed mission 1.
 * Nine upgrade tracks × 5 ranks, each rank changes a real gameplay value
 * (computeStats). Saved under localStorage `hulk-open-world-3d-progress`
 * and validated field-by-field on load (bad data never crashes the game;
 * it falls back to defaults for that field only).
 */
import { HERO, xpForLevel, MAX_LEVEL } from "./config.js";

export const STORAGE_KEY = "hulk-open-world-3d-progress";
export const MAX_RANK = 5;

export const UPGRADES = [
  { id: "health", name: "Maximum Health", icon: "♥", desc: "+12% max health per rank", fmt: (r) => `${Math.round(HERO.maxHp * (1 + 0.12 * r))} HP` },
  { id: "punch", name: "Punch Damage", icon: "✊", desc: "+10% light punch damage per rank", fmt: (r) => `×${(1 + 0.1 * r).toFixed(2)}` },
  { id: "heavy", name: "Heavy Attack Damage", icon: "💥", desc: "+12% heavy, rage punch, smash & clap damage", fmt: (r) => `×${(1 + 0.12 * r).toFixed(2)}` },
  { id: "rageCap", name: "Rage Capacity", icon: "🔥", desc: "Bigger rage meter that fills just as fast; rage hits 6% harder per rank", fmt: (r) => `${100 + 25 * r} rage · ×${(HERO.rageDamage + 0.06 * r).toFixed(2)} dmg` },
  { id: "rageDur", name: "Rage Duration", icon: "⏱", desc: "+1.5 s of rage per rank", fmt: (r) => `${(HERO.rageDuration + 1.5 * r).toFixed(1)} s` },
  { id: "jump", name: "Jump Power", icon: "⤒", desc: "+7% leap power per rank (higher, further)", fmt: (r) => `×${(1 + 0.07 * r).toFixed(2)}` },
  { id: "sprint", name: "Sprint Speed", icon: "»", desc: "+6% sprint speed per rank", fmt: (r) => `${Math.round(HERO.sprint * (1 + 0.06 * r) * 3.6)} km/h` },
  { id: "throw", name: "Throw Strength", icon: "↗", desc: "+7% throw speed, +12% throw damage per rank", fmt: (r) => `×${(1 + 0.12 * r).toFixed(2)} dmg` },
  { id: "cooldown", name: "Ability Cooldowns", icon: "↻", desc: "−7% Smash / Clap / Rage Punch cooldown per rank", fmt: (r) => `−${7 * r}%` },
];
export const upgradeCost = (rank) => 1 + (rank >= 3 ? 1 : 0); // ranks 1-3 cost 1, 4-5 cost 2

export const DEFAULT_SETTINGS = { sensitivity: 1, invertY: false, volume: 0.8, music: true, shake: true, quality: "high", difficulty: "normal", fov: 70, hints: true };

export function freshProgress() {
  return {
    v: 1,
    xp: 0,
    spent: 0,
    up: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    completed: [],
    unlocked: 1,
    bosses: {},
    best: {},
    activityBest: {},
    discovered: [],
    settings: { ...DEFAULT_SETTINGS },
    free: null,
    lastMission: 1,
    totals: { kills: 0, destroyed: 0, playTime: 0, missions: 0 },
  };
}

/** level + progress inside it for a total XP */
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
export function pointsEarned(p) {
  const L = levelInfo(p.xp).level;
  const bosses = Object.values(p.bosses).filter(Boolean).length;
  return L - 1 + bosses * 2 + p.completed.length;
}
export const pointsLeft = (p) => pointsEarned(p) - p.spent;

/** gameplay stats from level + upgrade ranks */
export function computeStats(p) {
  const u = p.up;
  const L = levelInfo(p.xp).level;
  return {
    level: L,
    maxHp: Math.round(HERO.maxHp * (1 + 0.12 * u.health) * (1 + (L - 1) * 0.01)),
    punchMul: 1 + 0.1 * u.punch,
    heavyMul: 1 + 0.12 * u.heavy,
    rageMax: 100 + 25 * u.rageCap,
    rageGain: 1 + 0.25 * u.rageCap,
    rageDmgBonus: 0.06 * u.rageCap,
    rageDur: HERO.rageDuration + 1.5 * u.rageDur,
    jumpMul: 1 + 0.07 * u.jump,
    sprintMul: 1 + 0.06 * u.sprint,
    throwStr: 1 + 0.07 * u.throw,
    throwDmg: 1 + 0.12 * u.throw,
    cdMul: 1 - 0.07 * u.cooldown,
    defense: 1 - Math.min(0.25, (L - 1) * 0.009),
  };
}

export function buyUpgrade(p, id) {
  const r = p.up[id];
  if (r == null || r >= MAX_RANK) return null;
  const cost = upgradeCost(r);
  if (pointsLeft(p) < cost) return null;
  return { ...p, up: { ...p.up, [id]: r + 1 }, spent: p.spent + cost };
}
export function resetUpgrades(p) {
  return { ...p, up: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), spent: 0 };
}

/** commit a finished mission */
export function applyMissionResult(p, r, missionCount) {
  const before = levelInfo(p.xp).level;
  const out = { ...p, xp: p.xp + Math.max(0, r.xp | 0), totals: { ...p.totals, kills: p.totals.kills + (r.kills | 0), destroyed: p.totals.destroyed + (r.destroyed | 0), playTime: p.totals.playTime + (r.time || 0) } };
  let newMission = null;
  if (r.win) {
    if (!out.completed.includes(r.mission)) out.completed = [...out.completed, r.mission].sort((a, b) => a - b);
    out.totals.missions++;
    if (r.mission + 1 <= missionCount && out.unlocked < r.mission + 1) {
      out.unlocked = r.mission + 1;
      newMission = r.mission + 1;
    }
    if (r.boss) out.bosses = { ...out.bosses, [r.boss]: true };
    const b = out.best[r.mission];
    out.best = { ...out.best, [r.mission]: { time: b ? Math.min(b.time, r.time) : r.time, destruction: b ? Math.max(b.destruction, r.destruction) : r.destruction } };
    out.lastMission = Math.min(missionCount, r.mission + 1);
  } else out.lastMission = r.mission;
  const after = levelInfo(out.xp).level;
  return { prog: out, newMission, levelUp: after > before ? after : null };
}
export function addXp(p, n) {
  const before = levelInfo(p.xp).level;
  const out = { ...p, xp: p.xp + Math.max(0, n | 0) };
  const after = levelInfo(out.xp).level;
  return { prog: out, levelUp: after > before ? after : null };
}

/* ---------------------------------------------------------------- validation */
const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
export function sanitize(raw, missionCount = 20) {
  const f = freshProgress();
  if (!raw || typeof raw !== "object") return f;
  const p = { ...f };
  p.xp = Math.floor(num(raw.xp, 0, 0, 1e8));
  p.up = { ...f.up };
  if (raw.up && typeof raw.up === "object") for (const u of UPGRADES) p.up[u.id] = Math.floor(num(raw.up[u.id], 0, 0, MAX_RANK));
  p.completed = Array.isArray(raw.completed) ? [...new Set(raw.completed.filter((x) => Number.isInteger(x) && x >= 1 && x <= missionCount))].sort((a, b) => a - b) : [];
  p.unlocked = Math.floor(num(raw.unlocked, 1, 1, missionCount));
  // never lock a mission after a completed one
  for (const c of p.completed) p.unlocked = Math.max(p.unlocked, Math.min(missionCount, c + 1));
  p.bosses = {};
  if (raw.bosses && typeof raw.bosses === "object") for (const k of ["warMachine", "colossus", "titan"]) if (raw.bosses[k] === true) p.bosses[k] = true;
  p.best = {};
  if (raw.best && typeof raw.best === "object") {
    for (const [k, v] of Object.entries(raw.best)) {
      const id = Number(k);
      if (Number.isInteger(id) && id >= 1 && id <= missionCount && v && typeof v === "object") p.best[id] = { time: num(v.time, 0, 0, 1e6), destruction: num(v.destruction, 0, 0, 1e9) };
    }
  }
  p.activityBest = {};
  if (raw.activityBest && typeof raw.activityBest === "object") for (const k of ["destruction", "longjump", "arena", "rooftop", "throwing"]) if (raw.activityBest[k] != null) p.activityBest[k] = num(raw.activityBest[k], 0, 0, 1e7);
  p.discovered = Array.isArray(raw.discovered) ? raw.discovered.filter((x) => typeof x === "string" && x.length < 24).slice(0, 32) : [];
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sensitivity: num(s.sensitivity, f.settings.sensitivity, 0.2, 3),
    invertY: typeof s.invertY === "boolean" ? s.invertY : false,
    volume: num(s.volume, f.settings.volume, 0, 1),
    music: typeof s.music === "boolean" ? s.music : true,
    shake: typeof s.shake === "boolean" ? s.shake : true,
    quality: ["low", "medium", "high"].includes(s.quality) ? s.quality : "high",
    difficulty: ["easy", "normal", "hard"].includes(s.difficulty) ? s.difficulty : "normal",
    fov: num(s.fov, 70, 55, 95),
    hints: typeof s.hints === "boolean" ? s.hints : true,
  };
  p.free = raw.free && typeof raw.free === "object" && Number.isFinite(raw.free.x) && Number.isFinite(raw.free.z) ? { x: num(raw.free.x, 0, -20, 980), z: num(raw.free.z, 0, -20, 980) } : null;
  p.lastMission = Math.floor(num(raw.lastMission, 1, 1, missionCount));
  const t = raw.totals && typeof raw.totals === "object" ? raw.totals : {};
  p.totals = { kills: Math.floor(num(t.kills, 0, 0, 1e9)), destroyed: Math.floor(num(t.destroyed, 0, 0, 1e9)), playTime: num(t.playTime, 0, 0, 1e9), missions: Math.floor(num(t.missions, 0, 0, 1e6)) };
  // spent points can never exceed what the ranks cost
  let cost = 0;
  for (const u of UPGRADES) for (let r = 0; r < p.up[u.id]; r++) cost += upgradeCost(r);
  p.spent = cost;
  // if the save claims more ranks than it has points for, refund everything
  if (pointsEarned(p) < p.spent) {
    p.up = { ...f.up };
    p.spent = 0;
  }
  return p;
}
export function loadProgress(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return freshProgress();
    return sanitize(JSON.parse(raw));
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
