/**
 * Progress in localStorage `teddy-quest-progress` (versioned + sanitised, so a
 * corrupt or hand-edited save can never break the menus).
 *
 * { v, unlocked, levels: { [id]: { done, coins, coinTotal, chests, chestTotal, time, friend } }, settings, won }
 * Each level keeps its BEST coins / chests / time; totals are derived.
 */
export const SAVE_KEY = "teddy-quest-progress";
export const LEVEL_COUNT = 30;
const VERSION = 1;

export const DEFAULT_SETTINGS = { sound: true, music: true, sens: 1, invertY: false, touch: "auto" };

export function defaultProgress() {
  return { v: VERSION, unlocked: 1, levels: {}, settings: { ...DEFAULT_SETTINGS }, won: false, last: 1 };
}

const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  p.unlocked = Math.round(num(raw.unlocked, 1, LEVEL_COUNT, 1));
  p.won = !!raw.won;
  p.last = Math.round(num(raw.last, 1, LEVEL_COUNT, 1));
  if (raw.levels && typeof raw.levels === "object") {
    for (let id = 1; id <= LEVEL_COUNT; id++) {
      const r = raw.levels[id];
      if (!r || typeof r !== "object" || !r.done) continue;
      p.levels[id] = {
        done: true,
        coins: Math.round(num(r.coins, 0, 999, 0)),
        coinTotal: Math.round(num(r.coinTotal, 0, 999, 0)),
        chests: Math.round(num(r.chests, 0, 9, 0)),
        chestTotal: Math.round(num(r.chestTotal, 0, 9, 0)),
        time: num(r.time, 0, 99999, 0),
        friend: !!r.friend,
      };
      if (id < LEVEL_COUNT) p.unlocked = Math.max(p.unlocked, id + 1);
    }
  }
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sound: s.sound !== false,
    music: s.music !== false,
    sens: num(s.sens, 0.3, 2.5, 1),
    invertY: !!s.invertY,
    touch: ["auto", "on", "off"].includes(s.touch) ? s.touch : "auto",
  };
  return p;
}

export function loadProgress(store) {
  try {
    const txt = store?.getItem(SAVE_KEY);
    return sanitize(txt ? JSON.parse(txt) : null);
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p, store) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked: progress stays in memory */
  }
}

export const levelUnlocked = (p, id) => id >= 1 && id <= LEVEL_COUNT && id <= p.unlocked;

/** merge a finished run into progress (keeps bests, unlocks the next level) */
export function recordResult(p, r) {
  const old = p.levels[r.levelId];
  const best = {
    done: true,
    coins: Math.max(old?.coins ?? 0, r.coins),
    coinTotal: r.coinTotal,
    chests: Math.max(old?.chests ?? 0, r.chests),
    chestTotal: r.chestTotal,
    time: old?.time ? Math.min(old.time, r.time) : r.time,
    friend: !!(old?.friend || r.friend),
  };
  return {
    ...p,
    levels: { ...p.levels, [r.levelId]: best },
    unlocked: Math.min(LEVEL_COUNT, Math.max(p.unlocked, r.levelId + 1)),
    won: p.won || r.levelId === LEVEL_COUNT,
  };
}

export function isNewBest(p, r) {
  const old = p.levels[r.levelId];
  if (!old) return { first: true };
  return { coins: r.coins > old.coins, time: r.time < old.time - 0.05, chests: r.chests > old.chests };
}

export function totals(p) {
  let coins = 0, chests = 0, friends = 0, done = 0;
  for (const r of Object.values(p.levels)) {
    coins += r.coins;
    chests += r.chests;
    if (r.friend) friends++;
    done++;
  }
  return { coins, chests, friends, done };
}
