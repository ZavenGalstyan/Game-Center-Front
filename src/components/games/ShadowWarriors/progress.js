/**
 * Shadow Warriors — save data (localStorage) and the pure rules for rewards,
 * unlocks and the shop. Everything here is plain data in / data out so the
 * headless tests can exercise it.
 */
import { WEAPONS, ARMORS, ABILITIES, MAX_LEVEL, upgradeCost, abilityUpgradeCost } from "./data/gear.js";
import { BATTLES, battleById } from "./data/campaign.js";

export const SAVE_KEY = "shadow-warriors-save";
export const LAST_BATTLE = BATTLES.length;

export function freshSave() {
  return {
    v: 1,
    coins: 0,
    cleared: 0, // highest battle won
    battles: {}, // id → { wins, perfect, best (seconds) }
    owned: { weapon: ["fists"], armor: ["gi"], ability: ["wave"] },
    lv: { weapon: { fists: 0 }, armor: { gi: 0 }, ability: { wave: 0 } },
    eq: { weapon: "fists", armor: "gi", ability: "wave" },
    stats: { wins: 0, losses: 0, perfects: 0, earned: 0, fights: 0 },
    settings: { music: true, sfx: true, shake: true, effects: true, touch: "auto", hints: true },
    last: 1,
    finished: false,
  };
}

const KINDS = { weapon: WEAPONS, armor: ARMORS, ability: ABILITIES };

/** Merge whatever was stored onto a fresh save, dropping anything invalid. */
export function sanitize(raw) {
  const s = freshSave();
  if (!raw || typeof raw !== "object") return s;
  const num = (v, d, lo = 0, hi = 1e9) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);
  s.coins = num(raw.coins, 0);
  s.cleared = num(raw.cleared, 0, 0, LAST_BATTLE);
  s.last = num(raw.last, 1, 1, LAST_BATTLE);
  s.finished = !!raw.finished;
  if (raw.battles && typeof raw.battles === "object") {
    for (const [k, b] of Object.entries(raw.battles)) {
      const id = Number(k);
      if (!battleById(id) || !b) continue;
      s.battles[id] = { wins: num(b.wins, 0), perfect: !!b.perfect, best: Number.isFinite(b.best) ? b.best : null };
    }
  }
  for (const kind of Object.keys(KINDS)) {
    const valid = new Set(KINDS[kind].map((x) => x.id));
    const owned = Array.isArray(raw.owned?.[kind]) ? raw.owned[kind].filter((id) => valid.has(id)) : [];
    s.owned[kind] = [...new Set([...s.owned[kind], ...owned])];
    for (const id of s.owned[kind]) s.lv[kind][id] = num(raw.lv?.[kind]?.[id], 0, 0, kind === "ability" ? 3 : MAX_LEVEL);
    const eq = raw.eq?.[kind];
    if (eq && s.owned[kind].includes(eq)) s.eq[kind] = eq;
  }
  for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats?.[k], 0);
  if (raw.settings && typeof raw.settings === "object") {
    for (const k of ["music", "sfx", "shake", "effects", "hints"]) if (typeof raw.settings[k] === "boolean") s.settings[k] = raw.settings[k];
    if (["auto", "on", "off"].includes(raw.settings.touch)) s.settings.touch = raw.settings.touch;
  }
  // abilities taught by bosses already beaten
  for (const ab of ABILITIES) if (ab.from && s.cleared >= ab.from && !s.owned.ability.includes(ab.id)) {
    s.owned.ability.push(ab.id);
    s.lv.ability[ab.id] = 0;
  }
  return s;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return freshSave();
  }
}

export function storeSave(s) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked — progress stays in memory */
  }
}

export const isBattleOpen = (s, id) => id >= 1 && id <= Math.min(LAST_BATTLE, s.cleared + 1);
export const itemUnlocked = (s, item) => s.cleared >= (item.unlock || 0);

/**
 * Apply a finished battle. result = { won, perfect, time }.
 * Returns { save, coins, first, unlocks: [{kind, item}], ability }.
 */
export function applyResult(s0, battleId, result) {
  const B = battleById(battleId);
  const s = structuredCloneSafe(s0);
  const rec = s.battles[battleId] || { wins: 0, perfect: false, best: null };
  const first = result.won && rec.wins === 0;
  let coins;
  if (result.won) {
    coins = first ? B.reward : Math.round((B.reward * 0.4) / 5) * 5;
    if (result.perfect) coins += Math.round((B.reward * 0.25) / 5) * 5;
  } else coins = Math.max(10, Math.round((B.reward * 0.12) / 5) * 5);
  s.coins += coins;
  s.stats.earned += coins;
  s.stats.fights++;
  const unlocks = [];
  let ability = null;
  if (result.won) {
    s.stats.wins++;
    if (result.perfect) s.stats.perfects++;
    rec.wins++;
    rec.perfect = rec.perfect || !!result.perfect;
    if (Number.isFinite(result.time)) rec.best = rec.best == null ? result.time : Math.min(rec.best, result.time);
    const before = s.cleared;
    s.cleared = Math.max(s.cleared, battleId);
    if (s.cleared > before) {
      for (const [kind, list] of [["weapon", WEAPONS], ["armor", ARMORS]]) {
        for (const it of list) if (it.unlock > before && it.unlock <= s.cleared) unlocks.push({ kind, item: it });
      }
      for (const ab of ABILITIES) {
        if (ab.from > before && ab.from <= s.cleared && !s.owned.ability.includes(ab.id)) {
          s.owned.ability.push(ab.id);
          s.lv.ability[ab.id] = 0;
          ability = ab;
        }
      }
    }
    s.last = Math.min(LAST_BATTLE, battleId + 1);
    if (battleId === LAST_BATTLE) s.finished = true;
  } else {
    s.stats.losses++;
    s.last = battleId;
  }
  s.battles[battleId] = rec;
  return { save: s, coins, first, unlocks, ability };
}

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}

// ------------------------------------------------------------------ shop
export function buy(s0, kind, id) {
  const item = KINDS[kind]?.find((x) => x.id === id);
  if (!item || kind === "ability") return { ok: false, why: "unknown item" };
  if (s0.owned[kind].includes(id)) return { ok: false, why: "already owned" };
  if (!itemUnlocked(s0, item)) return { ok: false, why: `win battle ${item.unlock} to unlock` };
  if (s0.coins < item.price) return { ok: false, why: "not enough coins" };
  const s = structuredCloneSafe(s0);
  s.coins -= item.price;
  s.owned[kind].push(id);
  s.lv[kind][id] = 0;
  s.eq[kind] = id;
  return { ok: true, save: s };
}

export function upgradePrice(s, kind, id) {
  const lvl = s.lv[kind]?.[id] ?? 0;
  if (kind === "ability") return abilityUpgradeCost(lvl);
  const item = KINDS[kind].find((x) => x.id === id);
  return upgradeCost(item, lvl);
}

export function upgrade(s0, kind, id) {
  if (!s0.owned[kind]?.includes(id)) return { ok: false, why: "not owned" };
  const price = upgradePrice(s0, kind, id);
  if (price == null) return { ok: false, why: "max level" };
  if (s0.coins < price) return { ok: false, why: "not enough coins" };
  const s = structuredCloneSafe(s0);
  s.coins -= price;
  s.lv[kind][id] = (s.lv[kind][id] || 0) + 1;
  return { ok: true, save: s };
}

export function equip(s0, kind, id) {
  if (!s0.owned[kind]?.includes(id)) return { ok: false, why: "not owned" };
  const s = structuredCloneSafe(s0);
  s.eq[kind] = id;
  return { ok: true, save: s };
}
