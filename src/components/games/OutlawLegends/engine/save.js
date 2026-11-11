/**
 * Saved progress: unlocked/completed missions, XP, money, upgrades, owned
 * weapons, abilities and settings, in localStorage (key below). Every
 * function is pure (returns a new object) so React state stays simple.
 */
import { WEAPON_ORDER, UPGRADE_MAX, CHAR_UPGRADES, ABILITIES, weaponUpgradeCost, charUpgradeCost, levelFromXp } from "./data.js";
import { MISSIONS, MISSION_BY_ID } from "./missions.js";

export const SAVE_KEY = "outlaw-legends-progress";
export const DEFAULT_SETTINGS = { sens: 1, invertY: false, difficulty: "normal", volume: 0.8, music: 0.5, hints: true, quality: "high" };

export function freshProgress() {
  return {
    v: 1,
    unlocked: 1,
    completed: {},
    xp: 0,
    money: 0,
    weapons: ["revolver"],
    upgrades: { revolver: { dmg: 0, acc: 0, rel: 0 }, shotgun: { dmg: 0, acc: 0, rel: 0 }, rifle: { dmg: 0, acc: 0, rel: 0 }, dual: { dmg: 0, acc: 0, rel: 0 }, char: { health: 0, melee: 0, stamina: 0 } },
    abilities: {},
    lastMission: 1,
    finished: false,
    settings: { ...DEFAULT_SETTINGS },
  };
}

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

export function sanitize(raw) {
  const p = freshProgress();
  if (!raw || typeof raw !== "object") return p;
  p.unlocked = Math.max(1, Math.min(MISSIONS.length, Math.floor(num(raw.unlocked, 1))));
  if (raw.completed && typeof raw.completed === "object") {
    for (const [k, v] of Object.entries(raw.completed)) {
      const id = Number(k);
      if (MISSION_BY_ID[id] && v && typeof v === "object") p.completed[id] = { rank: String(v.rank || "Drifter"), time: num(v.time), kills: num(v.kills), best: num(v.best, num(v.time)) };
    }
  }
  p.xp = Math.max(0, Math.floor(num(raw.xp)));
  p.money = Math.max(0, Math.floor(num(raw.money)));
  if (Array.isArray(raw.weapons)) p.weapons = WEAPON_ORDER.filter((w) => w === "revolver" || raw.weapons.includes(w));
  for (const w of [...WEAPON_ORDER]) {
    const u = raw.upgrades?.[w] || {};
    p.upgrades[w] = { dmg: clampLvl(u.dmg), acc: clampLvl(u.acc), rel: clampLvl(u.rel) };
  }
  const ch = raw.upgrades?.char || {};
  for (const c of CHAR_UPGRADES) p.upgrades.char[c.id] = Math.max(0, Math.min(c.max, Math.floor(num(ch[c.id]))));
  for (const a of ABILITIES) if (raw.abilities?.[a.id]) p.abilities[a.id] = true;
  p.lastMission = MISSION_BY_ID[raw.lastMission] ? raw.lastMission : 1;
  p.finished = !!raw.finished;
  const s = raw.settings || {};
  p.settings = {
    sens: Math.max(0.3, Math.min(2.5, num(s.sens, 1))),
    invertY: !!s.invertY,
    difficulty: ["easy", "normal", "hard"].includes(s.difficulty) ? s.difficulty : "normal",
    volume: Math.max(0, Math.min(1, num(s.volume, 0.8))),
    music: Math.max(0, Math.min(1, num(s.music, 0.5))),
    hints: s.hints !== false,
    quality: ["high", "low", "off"].includes(s.quality) ? s.quality : "high",
  };
  // weapons granted by completed missions are always owned
  for (const m of MISSIONS) if (m.unlock && p.completed[m.id] && !p.weapons.includes(m.unlock)) p.weapons.push(m.unlock);
  p.weapons = WEAPON_ORDER.filter((w) => p.weapons.includes(w));
  return p;
}
const clampLvl = (v) => Math.max(0, Math.min(UPGRADE_MAX, Math.floor(num(v))));

export function loadProgress(store) {
  try {
    const raw = store?.getItem(SAVE_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return freshProgress();
  }
}
export function saveProgress(p, store) {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked: keep playing */
  }
}

export const missionUnlocked = (p, id) => id <= p.unlocked;
/** The mission "Continue" should start: first unfinished unlocked one. */
export function nextMissionId(p) {
  for (const m of MISSIONS) if (m.id <= p.unlocked && !p.completed[m.id]) return m.id;
  return Math.min(p.unlocked, MISSIONS.length);
}

export function rankFor(S) {
  const c = S.counters;
  const acc = c.shots ? c.hits / c.shots : 1;
  if (c.deaths === 0 && acc >= 0.45) return "Legend";
  if (c.deaths <= 1) return "Gunslinger";
  return "Drifter";
}

/** Apply a finished mission: rewards, unlocks, records. Returns { progress, report }. */
export function completeMission(p, S) {
  const M = S.M;
  const first = !p.completed[M.id];
  const mul = first ? 1 : 0.5;
  const missionMoney = Math.round(M.reward.money * mul);
  const missionXp = Math.round(M.reward.xp * mul);
  const xpGain = S.earn.xp + missionXp;
  const moneyGain = S.earn.money + missionMoney;
  const levelBefore = levelFromXp(p.xp);
  const rank = rankFor(S);
  const prev = p.completed[M.id];
  const time = Math.round(S.t);
  const ranks = ["Drifter", "Gunslinger", "Legend"];
  const bestRank = prev && ranks.indexOf(prev.rank) > ranks.indexOf(rank) ? prev.rank : rank;
  const q = {
    ...p,
    xp: p.xp + xpGain,
    money: p.money + moneyGain,
    unlocked: Math.max(p.unlocked, Math.min(MISSIONS.length, M.id + 1)),
    completed: { ...p.completed, [M.id]: { rank: bestRank, time, kills: S.counters.kills, best: prev ? Math.min(prev.best || time, time) : time } },
    lastMission: Math.min(MISSIONS.length, M.id + 1),
    finished: p.finished || !!M.final,
    weapons: [...p.weapons],
  };
  let newWeapon = null;
  if (M.unlock && !q.weapons.includes(M.unlock)) {
    q.weapons.push(M.unlock);
    newWeapon = M.unlock;
  }
  q.weapons = WEAPON_ORDER.filter((w) => q.weapons.includes(w));
  const levelAfter = levelFromXp(q.xp);
  const c = S.counters;
  return {
    progress: q,
    report: {
      id: M.id,
      first,
      rank,
      time,
      kills: c.kills,
      headshots: c.headshots,
      takedowns: c.takedowns,
      accuracy: c.shots ? Math.round((c.hits / c.shots) * 100) : 0,
      deaths: c.deaths,
      missionMoney,
      missionXp,
      lootMoney: S.earn.money,
      combatXp: S.earn.xp,
      xpGain,
      moneyGain,
      levelBefore,
      levelAfter,
      newWeapon,
      final: !!M.final,
    },
  };
}

/* ------------------------------------------------------------ shop */
export function buyWeaponUpgrade(p, wid, track) {
  const lvl = p.upgrades[wid][track];
  if (lvl >= UPGRADE_MAX || !p.weapons.includes(wid)) return null;
  const cost = weaponUpgradeCost(wid, lvl);
  if (p.money < cost) return null;
  return { ...p, money: p.money - cost, upgrades: { ...p.upgrades, [wid]: { ...p.upgrades[wid], [track]: lvl + 1 } } };
}
export function buyCharUpgrade(p, id) {
  const def = CHAR_UPGRADES.find((c) => c.id === id);
  const lvl = p.upgrades.char[id];
  if (!def || lvl >= def.max) return null;
  const cost = charUpgradeCost(id, lvl);
  if (p.money < cost) return null;
  return { ...p, money: p.money - cost, upgrades: { ...p.upgrades, char: { ...p.upgrades.char, [id]: lvl + 1 } } };
}
export function buyAbility(p, id) {
  const a = ABILITIES.find((x) => x.id === id);
  if (!a || p.abilities[id]) return null;
  if (levelFromXp(p.xp) < a.level || p.money < a.cost) return null;
  return { ...p, money: p.money - a.cost, abilities: { ...p.abilities, [id]: true } };
}
