/**
 * My Little Buddy — pure game logic (no React). Every action takes the current
 * save + `now` and returns `{ s, ev }`: a new save and a list of UI events
 * (sounds, speech, toasts). Time always passes first, so needs, sleep and the
 * achievement/level checks stay consistent no matter which action ran.
 */
import { ACHIEVEMENTS, COLORS, FOOD_BY_ID, ITEM_BY_ID } from "./data.js";

export const SAVE_KEY = "my-little-buddy-save";
export const STATS = ["hunger", "happy", "clean", "energy"];
/** Points lost per real hour while awake; asleep, hunger/happiness drop at half speed. */
export const RATES = { hunger: 7, happy: 5, clean: 4, energy: 5 };
export const SLEEP_GAIN = 0.6; // energy per second with the lights off
export const DECAY_FLOOR = 10; // time alone never drags a need below this
export const GAME_COST = 8; // energy per mini-game
const HOUR = 3600000;

export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const xpNeeded = (level) => 40 + level * 30;
export const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function newSave(now, { name = "Buddy", color = "mint" } = {}) {
  return {
    v: 1, name, color: COLORS[color] ? color : "mint",
    stats: { hunger: 75, happy: 80, clean: 70, energy: 80 },
    coins: 100, level: 1, xp: 0,
    food: { apple: 3, cookie: 2 },
    owned: [], hat: null, glasses: null, decor: [],
    sleeping: false, lastTick: now, created: now,
    daily: { last: null, streak: 0 },
    counts: { fed: 0, pets: 0, cleanFull: 0, restFull: 0, games: 0, memoryWins: 0, bought: 0, coinsEarned: 0 },
    best: { stars: 0, memory: 0, bubbles: 0 },
    ach: [],
  };
}

/** Defensive merge of a stored save with defaults; null if unusable. */
export function sanitize(raw, now) {
  if (!raw || typeof raw !== "object" || raw.v !== 1) return null;
  const b = newSave(now);
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const s = {
    ...b,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, 14) : b.name,
    color: COLORS[raw.color] ? raw.color : b.color,
    stats: { ...b.stats },
    coins: Math.max(0, Math.floor(num(raw.coins, b.coins))),
    level: Math.max(1, Math.floor(num(raw.level, 1))),
    xp: Math.max(0, num(raw.xp, 0)),
    food: {},
    owned: arr(raw.owned).filter((id) => ITEM_BY_ID[id]),
    sleeping: !!raw.sleeping,
    lastTick: Math.min(now, num(raw.lastTick, now)),
    created: num(raw.created, now),
    daily: { last: typeof raw.daily?.last === "string" ? raw.daily.last : null, streak: Math.max(0, num(raw.daily?.streak, 0)) },
    counts: { ...b.counts },
    best: { ...b.best },
    ach: arr(raw.ach),
  };
  for (const k of STATS) s.stats[k] = clamp(num(raw.stats?.[k], b.stats[k]));
  for (const k in b.counts) s.counts[k] = Math.max(0, num(raw.counts?.[k], 0));
  for (const k in b.best) s.best[k] = Math.max(0, num(raw.best?.[k], 0));
  for (const [id, n] of Object.entries(raw.food || {})) if (FOOD_BY_ID[id] && n > 0) s.food[id] = Math.floor(n);
  s.hat = s.owned.includes(raw.hat) ? raw.hat : null;
  s.glasses = s.owned.includes(raw.glasses) ? raw.glasses : null;
  s.decor = arr(raw.decor).filter((id) => s.owned.includes(id));
  return s;
}

export function load(now) {
  try {
    return sanitize(JSON.parse(localStorage.getItem(SAVE_KEY)), now);
  } catch {
    return null;
  }
}
export function persist(s) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

/* ---------- internals (mutate a draft) ---------- */

function elapse(d, now, ev) {
  const ms = Math.max(0, now - d.lastTick);
  d.lastTick = Math.max(d.lastTick, now);
  if (!ms) return;
  const h = ms / HOUR, st = d.stats, slow = d.sleeping ? 0.5 : 1;
  const decay = (k, amt) => {
    if (st[k] > DECAY_FLOOR) st[k] = Math.max(DECAY_FLOOR, st[k] - amt);
  };
  decay("hunger", RATES.hunger * h * slow);
  decay("happy", RATES.happy * h * slow);
  decay("clean", RATES.clean * h);
  if (d.sleeping) {
    const before = st.energy;
    st.energy = clamp(st.energy + (SLEEP_GAIN * ms) / 1000);
    if (before < 100 && st.energy >= 100) {
      d.counts.restFull++;
      addXp(d, 10, ev);
      ev.push({ type: "say", text: "Fully rested!" });
    }
  } else decay("energy", RATES.energy * h);
}

function addCoins(d, n, ev) {
  if (n <= 0) return;
  d.coins += n;
  d.counts.coinsEarned += n;
  ev.push({ type: "coins", n });
}

function addXp(d, n, ev) {
  d.xp += n;
  while (d.xp >= xpNeeded(d.level)) {
    d.xp -= xpNeeded(d.level);
    d.level++;
    const bonus = 20 + d.level * 5;
    ev.push({ type: "level", level: d.level, bonus });
    addCoins(d, bonus, ev);
  }
}

function checkAchievements(d, ev) {
  let again = true;
  while (again) {
    again = false;
    for (const a of ACHIEVEMENTS) {
      if (d.ach.includes(a.id) || a.value(d) < a.goal) continue;
      d.ach.push(a.id);
      ev.push({ type: "ach", id: a.id, title: a.title, reward: a.reward });
      addCoins(d, a.reward, ev);
      again = true;
    }
  }
}

const clone = (s) => JSON.parse(JSON.stringify(s));

function run(s, now, fn) {
  const d = clone(s), ev = [];
  elapse(d, now, ev);
  fn(d, ev);
  for (const k of STATS) d.stats[k] = clamp(d.stats[k]);
  checkAchievements(d, ev);
  return { s: d, ev };
}

/* ---------- actions ---------- */

export const tick = (s, now) => run(s, now, () => {});

/** Restore a save after time away: returns a "welcome" event for long absences. */
export function resume(s, now) {
  const away = Math.max(0, now - s.lastTick);
  const r = run(s, now, () => {});
  if (away > 10 * 60000) r.ev.unshift({ type: "welcome", away, slept: s.sleeping });
  return r;
}

export const isLocked = (item, s) => (item.level || 1) > s.level;

export function feed(s, now, id) {
  return run(s, now, (d, ev) => {
    const f = FOOD_BY_ID[id];
    if (!f) return;
    if (d.sleeping) return ev.push({ type: "say", text: "Zzz…" });
    if (d.stats.hunger >= 97) return ev.push({ type: "refuse", text: "I'm full!" });
    if (!d.food[id]) {
      if (isLocked(f, d)) return ev.push({ type: "error", text: `Unlocks at level ${f.level}` });
      if (d.coins < f.price) return ev.push({ type: "error", text: "Not enough coins" });
      d.coins -= f.price;
      d.food[id] = 1;
    }
    if (--d.food[id] <= 0) delete d.food[id];
    d.stats.hunger += f.fill;
    d.stats.happy += f.joy;
    d.counts.fed++;
    addXp(d, 3, ev);
    ev.push({ type: "eat", id });
  });
}

export function buyFood(s, now, id, qty = 1) {
  return run(s, now, (d, ev) => {
    const f = FOOD_BY_ID[id];
    if (!f || isLocked(f, d)) return ev.push({ type: "error", text: "Locked" });
    if (d.coins < f.price * qty) return ev.push({ type: "error", text: "Not enough coins" });
    d.coins -= f.price * qty;
    d.food[id] = (d.food[id] || 0) + qty;
    ev.push({ type: "buy" });
  });
}

export function buyItem(s, now, id) {
  return run(s, now, (d, ev) => {
    const it = ITEM_BY_ID[id];
    if (!it || d.owned.includes(id)) return;
    if (isLocked(it, d)) return ev.push({ type: "error", text: `Unlocks at level ${it.level}` });
    if (d.coins < it.price) return ev.push({ type: "error", text: "Not enough coins" });
    d.coins -= it.price;
    d.owned.push(id);
    d.counts.bought++;
    addXp(d, 5, ev);
    equipDraft(d, id, true);
    ev.push({ type: "buy", id });
  });
}

function equipDraft(d, id, on) {
  const it = ITEM_BY_ID[id];
  if (!it || !d.owned.includes(id)) return;
  if (it.kind === "decor") {
    d.decor = d.decor.filter((x) => x !== id);
    if (on) d.decor.push(id);
  } else d[it.kind === "hat" ? "hat" : "glasses"] = on ? id : null;
}

/** Toggle a hat / glasses / decoration on or off. */
export function toggleItem(s, now, id) {
  return run(s, now, (d, ev) => {
    const it = ITEM_BY_ID[id];
    if (!it) return;
    const on = it.kind === "decor" ? d.decor.includes(id) : d[it.kind === "hat" ? "hat" : "glasses"] === id;
    equipDraft(d, id, !on);
    ev.push({ type: "equip" });
  });
}

export function petBuddy(s, now) {
  return run(s, now, (d, ev) => {
    if (d.sleeping) return ev.push({ type: "say", text: "Zzz… 💤" });
    d.stats.happy += 1.5;
    d.counts.pets++;
    if (d.counts.pets % 5 === 0) addXp(d, 1, ev);
    ev.push({ type: "giggle" });
  });
}

/** `n` foam blobs rinsed off: +6 cleanliness each. */
export function rinse(s, now, n) {
  return run(s, now, (d, ev) => {
    const before = d.stats.clean;
    d.stats.clean = clamp(before + n * 6);
    addXp(d, n, ev);
    if (before < 99 && d.stats.clean >= 100) { // a real wash, not a top-up after a second of decay
      d.counts.cleanFull++;
      addXp(d, 5, ev);
      ev.push({ type: "say", text: "Squeaky clean! ✨" });
    }
  });
}

export function setSleep(s, now, on) {
  return run(s, now, (d, ev) => {
    if (d.sleeping === on) return;
    d.sleeping = on;
    ev.push({ type: "lamp", on });
  });
}

export const canPlay = (s) => !s.sleeping && s.stats.energy >= GAME_COST;

export function gameReward(game, result) {
  if (game === "stars") return Math.min(60, result.score);
  if (game === "bubbles") return Math.min(60, Math.ceil(result.score / 2));
  // memory: fewer moves = more coins; quick wins get a bonus
  return clamp(40 - Math.max(0, result.moves - 8) * 2, 10, 40) + (result.time < 40 ? 5 : 0);
}

/** A finished mini-game: coins, xp, best score; costs energy and a little hunger/cleanliness. */
export function finishGame(s, now, game, result) {
  let info = null;
  const r = run(s, now, (d, ev) => {
    const coins = gameReward(game, result);
    const score = game === "memory" ? result.moves : result.score;
    const prev = d.best[game];
    const best = game === "memory" ? !prev || score < prev : score > prev;
    if (best) d.best[game] = score;
    if (game === "memory") d.counts.memoryWins++;
    d.counts.games++;
    d.stats.energy -= GAME_COST;
    d.stats.hunger -= 3;
    d.stats.clean -= 4;
    d.stats.happy += 12;
    addCoins(d, coins, ev);
    addXp(d, 8 + Math.floor(coins / 5), ev);
    info = { coins, best, score };
  });
  r.result = info;
  return r;
}

export const dailyReady = (s, now) => s.daily.last !== dayKey(now);
export const dailyAmount = (streak) => 15 + 10 * Math.min(streak, 7);

/** Streak the next claim would give (a missed day restarts at 1). */
export const nextStreak = (s, now) => (s.daily.last === dayKey(now - 86400000) ? s.daily.streak + 1 : 1);

export function claimDaily(s, now) {
  return run(s, now, (d, ev) => {
    if (!dailyReady(d, now)) return;
    d.daily.streak = nextStreak(d, now);
    d.daily.last = dayKey(now);
    addCoins(d, dailyAmount(d.daily.streak), ev);
    addXp(d, 10, ev);
    ev.push({ type: "daily", streak: d.daily.streak });
  });
}

/** Mood from needs: drives the face. */
export function mood(s) {
  const low = Math.min(...STATS.map((k) => s.stats[k]));
  if (low < 25) return "sad";
  if (low < 50) return "meh";
  return "happy";
}

/** What the buddy asks for when idle, if anything. */
export function wish(s) {
  const st = s.stats;
  if (s.sleeping) return null;
  if (st.hunger < 35) return "I'm hungry…";
  if (st.energy < 25) return "So sleepy…";
  if (st.clean < 35) return "I need a bath!";
  if (st.happy < 35) return "Let's play!";
  return null;
}
