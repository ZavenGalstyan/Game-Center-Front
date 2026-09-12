/**
 * Blade Rush — localStorage persistence. One namespaced key,
 * `blade-rush-progress`. Every read merges onto the defaults and
 * re-validates every field, so a save from an older build (or a hand-edited
 * one) can never crash a newer build. Writes happen only on meaningful
 * events (finishing/failing a stage, changing a setting, picking a blade) —
 * never once per frame (rotation angle is never persisted).
 *
 * Nothing here touches the keys used by any other Game Center game.
 */
import { TOTAL_STAGES } from "../data/stages.js";
import { BLADES, bladeById, isBladeUnlocked } from "../data/blades.js";

const KEY = "blade-rush-progress";
const BLADE_IDS = new Set(BLADES.map((b) => b.id));

export const DEFAULT_SETTINGS = {
  graphics: "high", // low | medium | high
  sound: true,
  music: true,
  screenShake: true,
  particles: "high", // low | high
};

export const DEFAULT_STATISTICS = {
  bladesThrown: 0,
  successfulHits: 0,
  failedThrows: 0,
  targetsBroken: 0,
  bossesDefeated: 0,
  shardsCollected: 0,
  bestHitStreak: 0,
  stagesCompleted: 0,
  totalStars: 0,
};

const DEFAULT_STATE = {
  unlockedStage: 1,
  stages: {}, // { [id]: { completed, stars, shards } }
  selectedBlade: "rookie",
  settings: { ...DEFAULT_SETTINGS },
  statistics: { ...DEFAULT_STATISTICS },
};

const GRAPHICS_OPT = ["low", "medium", "high"];
const PARTICLES_OPT = ["low", "high"];

function readJSON() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function writeJSON(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!GRAPHICS_OPT.includes(s.graphics)) s.graphics = "high";
  if (!PARTICLES_OPT.includes(s.particles)) s.particles = "high";
  s.sound = Boolean(s.sound);
  s.music = Boolean(s.music);
  s.screenShake = Boolean(s.screenShake);
  return s;
}

export function loadState() {
  const raw = readJSON() || {};
  const state = {
    ...DEFAULT_STATE,
    ...raw,
    settings: sanitizeSettings(raw.settings),
    statistics: { ...DEFAULT_STATISTICS, ...(raw.statistics || {}) },
  };

  let unlocked = Number.isInteger(raw.unlockedStage) ? raw.unlockedStage : 1;
  state.unlockedStage = Math.min(TOTAL_STAGES, Math.max(1, unlocked));

  state.stages = {};
  if (raw.stages && typeof raw.stages === "object") {
    for (const [k, v] of Object.entries(raw.stages)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_STAGES || !v) continue;
      state.stages[id] = {
        completed: Boolean(v.completed),
        stars: [0, 1, 2, 3].includes(v.stars) ? v.stars : 0,
        shards: Number.isFinite(v.shards) ? Math.max(0, Math.floor(v.shards)) : 0,
      };
    }
  }

  for (const key of Object.keys(state.statistics)) {
    const v = state.statistics[key];
    state.statistics[key] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  }

  // Unlocked blades are derived from progression (see data/blades.js), never
  // stored — so an old save's `unlockedBlades` array (if any) is simply
  // ignored, and every blade whose requirement is already met just works.
  state.selectedBlade =
    BLADE_IDS.has(raw.selectedBlade) && isBladeUnlocked(bladeById(raw.selectedBlade), state)
      ? raw.selectedBlade
      : "rookie";
  delete state.unlockedBlades;

  return state;
}

export function saveState(state) {
  writeJSON({
    unlockedStage: state.unlockedStage,
    stages: state.stages,
    selectedBlade: state.selectedBlade,
    settings: state.settings,
    statistics: state.statistics,
  });
}

/**
 * Fold a finished attempt (success or failure) into persistent state. Pure —
 * returns a new object. `run` = engine._results() plus { unlockedNewBlades }.
 * Replaying a stage can only raise its stars, never lower them.
 */
export function applyStageResult(state, run) {
  const next = { ...state, stages: { ...state.stages }, statistics: { ...state.statistics } };
  const st = next.statistics;

  st.bladesThrown += run.totalThrown + (run.success ? 0 : 1);
  st.successfulHits += run.totalThrown;
  if (!run.success) st.failedThrows += 1;
  st.shardsCollected += run.shardsCollected || 0;
  st.bestHitStreak = Math.max(st.bestHitStreak, run.bestStreak || 0);

  if (!run.success) return next;

  st.targetsBroken += 1;
  if (run.boss) st.bossesDefeated += 1;

  const stars = starsForRun(run);
  const prev = state.stages[run.stageId] || { completed: false, stars: 0, shards: 0 };
  const wasCompleted = prev.completed;
  next.stages[run.stageId] = {
    completed: true,
    stars: Math.max(prev.stars, stars),
    shards: Math.max(prev.shards, run.shardsCollected || 0),
  };

  if (!wasCompleted) {
    st.stagesCompleted += 1;
    next.unlockedStage = Math.min(TOTAL_STAGES, Math.max(state.unlockedStage, run.stageId + 1));
  }
  st.totalStars = Object.values(next.stages).reduce((s, l) => s + (l.stars || 0), 0);

  return next;
}

export function starsForRun(run) {
  if (!run.success) return 0;
  if (!run.shardsTotal) return 3; // no bonus objects on this stage — completion is the whole challenge
  let stars = 1;
  if (run.shardsCollected >= Math.ceil(run.shardsTotal / 2)) stars += 1;
  if (run.shardsCollected >= run.shardsTotal) stars += 1;
  return stars;
}

export function selectBlade(state, bladeId) {
  if (!BLADE_IDS.has(bladeId) || !isBladeUnlocked(bladeById(bladeId), state)) return state;
  return { ...state, selectedBlade: bladeId };
}

export function updateSettings(state, settings) {
  return { ...state, settings: sanitizeSettings(settings) };
}

export function prevBest(state, stageId) {
  return state.stages[stageId] || { completed: false, stars: 0, shards: 0 };
}
