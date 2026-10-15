/**
 * Sky Combat 3D — progression (credits, unlocks, upgrades, settings) kept in
 * localStorage under SAVE_KEY. Everything read back is validated, so a
 * damaged or hand-edited save falls back to safe values instead of crashing.
 */
import { SAVE_KEY, JETS, UPGRADES, MAX_UPGRADE, MISSIONS, freshProgress, missionById } from "./data.js";

const clampInt = (v, a, b, d) => (Number.isFinite(v) ? Math.max(a, Math.min(b, Math.round(v))) : d);

export function sanitize(raw) {
  const f = freshProgress();
  if (!raw || typeof raw !== "object") return f;
  const p = { ...f };
  p.credits = clampInt(raw.credits, 0, 1e7, 0);
  p.unlocked = clampInt(raw.unlocked, 1, MISSIONS.length, 1);
  p.completed = {};
  p.best = {};
  for (const m of MISSIONS) {
    if (raw.completed?.[m.id]) p.completed[m.id] = true;
    const b = Number(raw.best?.[m.id]);
    if (Number.isFinite(b) && b > 0) p.best[m.id] = b;
  }
  p.jets = { falcon: true };
  for (const id of Object.keys(JETS)) if (raw.jets?.[id]) p.jets[id] = true;
  p.jet = p.jets[raw.jet] ? raw.jet : "falcon";
  p.up = {};
  for (const k of Object.keys(UPGRADES)) p.up[k] = clampInt(raw.up?.[k], 0, MAX_UPGRADE, 0);
  const s = raw.settings || {};
  p.settings = {
    assist: s.assist !== false,
    sens: Number.isFinite(s.sens) ? Math.max(0.3, Math.min(2.5, s.sens)) : 1,
    invert: !!s.invert,
    view: s.view === "cockpit" ? "cockpit" : "chase",
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

/**
 * Apply a finished mission to the progression. Returns {prog, earned, firstClear, newJet}.
 * Full reward on the first clear, 40% on replays, plus 25 per kill (10 per kill on a failed sortie).
 */
export function applyResult(prog, missionId, result) {
  const def = missionById(missionId);
  const p = { ...prog, completed: { ...prog.completed }, best: { ...prog.best }, jets: { ...prog.jets } };
  let earned = 0;
  let newJet = null;
  const firstClear = result.win && !prog.completed[missionId];
  if (result.win) {
    earned = Math.round((firstClear ? def.reward : def.reward * 0.4) + result.kills * 25);
    p.completed[missionId] = true;
    if (!p.best[missionId] || result.time < p.best[missionId]) p.best[missionId] = Math.round(result.time * 10) / 10;
    p.unlocked = Math.max(p.unlocked, Math.min(MISSIONS.length, missionId + 1));
    if (def.unlock && !p.jets[def.unlock]) {
      p.jets[def.unlock] = true;
      newJet = def.unlock;
    }
  } else earned = result.kills * 10;
  p.credits += earned;
  return { prog: p, earned, firstClear, newJet };
}

export function upgradeCost(prog, key) {
  const lvl = prog.up[key] || 0;
  return lvl >= MAX_UPGRADE ? null : UPGRADES[key].cost[lvl];
}

export function buyUpgrade(prog, key) {
  const c = upgradeCost(prog, key);
  if (c == null || prog.credits < c) return null;
  return { ...prog, credits: prog.credits - c, up: { ...prog.up, [key]: (prog.up[key] || 0) + 1 } };
}

export function buyJet(prog, id) {
  const j = JETS[id];
  if (!j || prog.jets[id] || prog.credits < j.unlock.cost) return null;
  return { ...prog, credits: prog.credits - j.unlock.cost, jets: { ...prog.jets, [id]: true }, jet: id };
}
