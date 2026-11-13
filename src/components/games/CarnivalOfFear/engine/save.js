/**
 * Progress + settings in localStorage (key SAVE_KEY). Every read is guarded,
 * so a blocked or corrupt storage just means a fresh start.
 */
export const SAVE_KEY = "carnival-of-fear-progress";
export const LEVEL_COUNT = 10;

export const DEFAULT_SETTINGS = { volume: 0.8, music: 0.6, sens: 1, invertY: false, brightness: 1, quality: "high", difficulty: "normal", hints: true };

export function freshProgress() {
  return { v: 1, unlocked: 1, completed: {}, victory: false, settings: { ...DEFAULT_SETTINGS } };
}

const clamp01 = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

export function loadProgress(store) {
  const f = freshProgress();
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return f;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return f;
    const unlocked = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(Number(p.unlocked)) || 1));
    const completed = {};
    if (p.completed && typeof p.completed === "object")
      for (const [k, v] of Object.entries(p.completed)) {
        const id = Number(k);
        if (Number.isInteger(id) && id >= 1 && id <= LEVEL_COUNT && v && typeof v === "object") completed[id] = { time: Number(v.time) || 0, kills: Number(v.kills) || 0, accuracy: Number(v.accuracy) || 0 };
      }
    const s = { ...DEFAULT_SETTINGS, ...(p.settings && typeof p.settings === "object" ? p.settings : {}) };
    s.volume = clamp01(Number(s.volume), DEFAULT_SETTINGS.volume);
    s.music = clamp01(Number(s.music), DEFAULT_SETTINGS.music);
    s.sens = Math.max(0.2, Math.min(3, Number(s.sens) || 1));
    s.brightness = Math.max(0.5, Math.min(1.6, Number(s.brightness) || 1));
    if (!["low", "medium", "high"].includes(s.quality)) s.quality = "high";
    if (!["easy", "normal", "hard"].includes(s.difficulty)) s.difficulty = "normal";
    s.invertY = s.invertY === true;
    s.hints = s.hints !== false;
    return { v: 1, unlocked, completed, victory: !!p.victory, settings: s };
  } catch {
    return f;
  }
}

export function saveProgress(p, store) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: keep playing */
  }
}

/** record a finished level; keeps the best time and unlocks the next one */
export function completeLevel(p, report) {
  const prev = p.completed[report.id];
  const best = !prev || report.time < prev.time ? { time: report.time, kills: report.kills, accuracy: report.accuracy } : prev;
  return {
    ...p,
    unlocked: Math.max(p.unlocked, Math.min(LEVEL_COUNT, report.id + 1)),
    completed: { ...p.completed, [report.id]: best },
    victory: p.victory || report.id === LEVEL_COUNT,
  };
}

/** the level "Continue" should open */
export function continueLevel(p) {
  for (let i = 1; i <= p.unlocked; i++) if (!p.completed[i]) return i;
  return p.unlocked;
}
