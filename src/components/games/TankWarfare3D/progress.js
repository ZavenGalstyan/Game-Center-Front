/**
 * Tank Warfare 3D — progression kept in localStorage under SAVE_KEY:
 * credits, unlocked missions, completions/best times, owned tanks, per-tank
 * upgrade levels, survival/training records and settings. Every value read
 * back is validated, so a damaged or hand-edited save falls back safely.
 */
import { SAVE_KEY, SAVE_VERSION, TANKS, TANK_ORDER, UPGRADES, UPGRADE_ORDER, MAX_UPGRADE, MISSIONS, TRAINING, DIFFICULTY, upgradeCost, missionById } from "./data.js";

const clampInt = (v, a, b, d) => (Number.isFinite(v) ? Math.max(a, Math.min(b, Math.round(v))) : d);
const blankUp = () => Object.fromEntries(UPGRADE_ORDER.map((k) => [k, 0]));

export function freshProgress() {
  return {
    v: SAVE_VERSION,
    credits: 0,
    unlocked: 1,
    completed: {},
    best: {},
    tanks: { fox: true },
    tank: "fox",
    up: Object.fromEntries(TANK_ORDER.map((id) => [id, blankUp()])),
    survivalBest: 0,
    trainingDone: false,
    totalKills: 0,
    settings: { difficulty: "medium", sens: 1, invert: false, camera: "chase", quality: "high", shake: true, volume: 0.8 },
  };
}

export function sanitize(raw) {
  const f = freshProgress();
  if (!raw || typeof raw !== "object") return f;
  const p = { ...f };
  p.credits = clampInt(raw.credits, 0, 1e8, 0);
  p.unlocked = clampInt(raw.unlocked, 1, MISSIONS.length, 1);
  for (const m of MISSIONS) {
    if (raw.completed?.[m.id]) p.completed[m.id] = true;
    const b = Number(raw.best?.[m.id]);
    if (Number.isFinite(b) && b > 0) p.best[m.id] = b;
  }
  // a completed mission always unlocks the next one
  for (const m of MISSIONS) if (p.completed[m.id]) p.unlocked = Math.max(p.unlocked, Math.min(MISSIONS.length, m.id + 1));
  p.tanks = { fox: true };
  for (const id of TANK_ORDER) if (raw.tanks?.[id]) p.tanks[id] = true;
  p.tank = p.tanks[raw.tank] ? raw.tank : "fox";
  p.up = {};
  for (const id of TANK_ORDER) {
    p.up[id] = blankUp();
    for (const k of UPGRADE_ORDER) p.up[id][k] = clampInt(raw.up?.[id]?.[k], 0, MAX_UPGRADE, 0);
  }
  p.survivalBest = clampInt(raw.survivalBest, 0, 9999, 0);
  p.trainingDone = !!raw.trainingDone;
  p.totalKills = clampInt(raw.totalKills, 0, 1e7, 0);
  const s = raw.settings || {};
  p.settings = {
    difficulty: DIFFICULTY[s.difficulty] ? s.difficulty : "medium",
    sens: Number.isFinite(s.sens) ? Math.max(0.3, Math.min(2.5, s.sens)) : 1,
    invert: !!s.invert,
    camera: ["chase", "gunner", "cinematic"].includes(s.camera) ? s.camera : "chase",
    quality: ["low", "medium", "high"].includes(s.quality) ? s.quality : "high",
    shake: s.shake !== false,
    volume: Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : 0.8,
  };
  return p;
}

export function loadProgress(storage) {
  try {
    return sanitize(JSON.parse(storage.getItem(SAVE_KEY)));
  } catch {
    return freshProgress();
  }
}

export function saveProgress(storage, p) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** Credits for a finished run (shown on the result screen before applying). */
export function rewardFor(prog, r) {
  if (r.mode === "campaign") {
    const def = missionById(r.mission);
    if (!r.win) return { base: 0, kills: r.kills * 15, bonus: 0, total: r.kills * 15, firstClear: false };
    const first = !prog.completed[r.mission];
    const base = Math.round(def.reward * (first ? 1 : 0.4));
    const kills = r.kills * 25;
    const bonus = Math.round(def.reward * 0.25 * Math.max(0, Math.min(1, r.hpLeft)));
    return { base, kills, bonus, total: base + kills + bonus, firstClear: first };
  }
  if (r.mode === "survival") {
    const waves = Math.max(0, r.wave - (r.win ? 0 : 1));
    const base = waves * 70;
    const kills = r.kills * 20;
    return { base, kills, bonus: 0, total: base + kills, waves };
  }
  // training
  const first = !prog.trainingDone;
  const base = r.win ? (first ? TRAINING.reward : 60) : 0;
  return { base, kills: 0, bonus: 0, total: base, firstClear: first && r.win };
}

/** Fold a finished run into the progression. Returns {prog, reward, newMission, newTanks}. */
export function applyResult(prog, r) {
  const reward = rewardFor(prog, r);
  const p = { ...prog, completed: { ...prog.completed }, best: { ...prog.best } };
  p.credits += reward.total;
  p.totalKills += r.kills || 0;
  let newMission = null;
  const before = availableTanks(prog);
  if (r.mode === "campaign" && r.win) {
    p.completed[r.mission] = true;
    const t = Math.round(r.time || 0);
    if (t > 0 && (!p.best[r.mission] || t < p.best[r.mission])) p.best[r.mission] = t;
    const next = Math.min(MISSIONS.length, r.mission + 1);
    if (next > p.unlocked) {
      p.unlocked = next;
      newMission = next;
    }
  }
  if (r.mode === "survival") {
    const waves = Math.max(0, r.wave - (r.win ? 0 : 1));
    p.survivalBest = Math.max(p.survivalBest, waves);
  }
  if (r.mode === "training" && r.win) p.trainingDone = true;
  const after = availableTanks(p);
  const newTanks = after.filter((id) => !before.includes(id) && !p.tanks[id]);
  return { prog: p, reward, newMission, newTanks };
}

/** Tanks whose campaign milestone has been reached (owned or purchasable). */
export function availableTanks(p) {
  return TANK_ORDER.filter((id) => {
    const u = TANKS[id].unlock;
    return !u || !!p.completed[u.mission];
  });
}

export function canBuyTank(p, id) {
  const T = TANKS[id];
  if (!T) return { ok: false, why: "Unknown tank" };
  if (p.tanks[id]) return { ok: false, why: "Owned" };
  if (T.unlock && !p.completed[T.unlock.mission]) return { ok: false, why: `Complete mission ${T.unlock.mission} to unlock` };
  if (p.credits < T.cost) return { ok: false, why: `Needs ${T.cost} credits` };
  return { ok: true, why: "" };
}

export function buyTank(p, id) {
  if (!canBuyTank(p, id).ok) return p;
  return { ...p, credits: p.credits - TANKS[id].cost, tanks: { ...p.tanks, [id]: true }, tank: id };
}

export function buyUpgrade(p, tankId, key) {
  if (!p.tanks[tankId] || !UPGRADES[key]) return p;
  const lv = p.up[tankId][key];
  if (lv >= MAX_UPGRADE) return p;
  const cost = upgradeCost(tankId, key, lv);
  if (p.credits < cost) return p;
  return { ...p, credits: p.credits - cost, up: { ...p.up, [tankId]: { ...p.up[tankId], [key]: lv + 1 } } };
}
