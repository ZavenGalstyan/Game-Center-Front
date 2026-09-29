/**
 * Arena Gladiator — persistence & progression. One versioned key:
 * `arena-gladiator-progress`. Nothing here ever reads or writes another key.
 *
 * Loading sanitises field by field (a damaged or older save keeps everything
 * still valid; missing fields get defaults; unknown future versions are
 * read defensively rather than wiped). Saves happen on events (fight result,
 * equipment / setting change), never per frame. Every fight result carries a
 * unique token and applying the same token twice is a no-op, so rewards,
 * unlocks and statistics can never double up.
 */
import { ENEMIES, enemyById } from "../data/enemies.js";
import { ARENAS } from "../data/arenas.js";
import { WEAPONS, ARMORS } from "../data/weapons.js";

export const KEY = "arena-gladiator-progress";
export const SAVE_VERSION = 1;

export const STAT_FIELDS = [
  "fights", "wins", "losses", "enemiesDefeated", "lightAttacks", "heavyAttacks", "kicks", "hitsLanded", "attacksThrown",
  "damageDealt", "damageTaken", "blocks", "parries", "dodges", "counters", "guardBreaks", "fpTime", "tpTime",
  "championsDefeated", "playTime", "trainingSessions",
];

export const HELMETS = [
  { id: "none", name: "Bare Head", at: 0 },
  { id: "cap", name: "Pit Cap", at: 1 },
  { id: "brim", name: "Grated Brim", at: 3 },
  { id: "crest", name: "Crested Helm", at: 10 },
  { id: "full", name: "Closed Helm", at: 15 },
];

export const COLORS = [
  { id: "crimson", name: "Crimson", cloth: "#8c2f23", accent: "#d2a64a", at: 0 },
  { id: "sand", name: "Desert Sand", cloth: "#b08a55", accent: "#6b3a1c", at: 0 },
  { id: "bronze", name: "Bronze", cloth: "#6a4526", accent: "#e0a54f", at: 1 },
  { id: "azure", name: "Azure", cloth: "#2f4d7a", accent: "#c9d3d8", at: 4 },
  { id: "forest", name: "Forest", cloth: "#3d5a2a", accent: "#d8c27a", at: 7 },
  { id: "night", name: "Nightfall", cloth: "#1f1f2a", accent: "#8a8fa0", at: 12 },
  { id: "royal", name: "Royal Purple", cloth: "#5a1f6a", accent: "#e8c35a", at: 18 },
  { id: "legend", name: "Legend Gold", cloth: "#f0ead8", accent: "#f3d27a", at: 25 },
];

export const WEAPON_UNLOCKS = { sword_shield: 0, spear: 5, sword: 8, axe: 12, dual: 17 };
export const ARMOR_UNLOCKS = { balanced: 0, light: 2, heavy: 7 };

export const RANKS = [
  { at: 0, name: "UNKNOWN WARRIOR" },
  { at: 1, name: "PIT FIGHTER" },
  { at: 5, name: "ARENA WARRIOR" },
  { at: 10, name: "ELITE GLADIATOR" },
  { at: 20, name: "CHAMPION" },
  { at: 25, name: "ARENA LEGEND" },
];
export const rankOf = (career) => [...RANKS].reverse().find((r) => career >= r.at).name;
export const nextRank = (career) => RANKS.find((r) => r.at > career) || null;

const reduced = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export const DEFAULT_SETTINGS = {
  fov: 80,
  sensitivity: 1,
  invertY: false,
  sound: true,
  music: true,
  graphics: "medium",
  shadows: true,
  particles: true,
  cameraShake: true,
  headBob: "low",
  reducedMotion: false,
  controlHelp: true,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    careerProgress: 0,
    defeatedEnemies: [],
    unlockedArenas: ["dust_pit"],
    unlockedWeapons: ["sword_shield"],
    unlockedArmor: ["balanced"],
    unlockedHelmets: ["none"],
    unlockedColors: ["crimson", "sand"],
    selectedWeapon: "sword_shield",
    selectedArmor: "balanced",
    helmet: "none",
    color: "crimson",
    look: { skin: "#b98563", hair: "short", hairColor: "#2a1d15", beard: false },
    name: "GLADIATOR",
    cameraMode: "third",
    settings: { ...DEFAULT_SETTINGS, reducedMotion: reduced() },
    statistics: Object.fromEntries(STAT_FIELDS.map((k) => [k, 0])),
    bestTimes: {}, // enemyId → seconds
    champion: false,
    seenTutorial: false,
    tokens: [],
  };
}

const nat = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
const str = (v, allowed, d) => (typeof v === "string" && (!allowed || allowed.includes(v)) ? v : d);
const arr = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && (!allowed || allowed.includes(x))))] : []);
const hexColor = (v, d) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

const ENEMY_IDS = ENEMIES.map((e) => e.id);
const ARENA_IDS = ARENAS.map((a) => a.id);
const WEAPON_IDS = WEAPONS.map((w) => w.id);
const ARMOR_IDS = ARMORS.map((a) => a.id);
const HELMET_IDS = HELMETS.map((h) => h.id);
const COLOR_IDS = COLORS.map((c) => c.id);
export const HAIRS = ["short", "bald", "long", "braid", "bun", "mohawk", "shaggy"];

/** Recompute everything that is implied by career progress (never removes). */
export function applyUnlocks(p) {
  const c = p.careerProgress;
  const add = (list, id) => (list.includes(id) ? list : [...list, id]);
  let { unlockedArenas, unlockedWeapons, unlockedArmor, unlockedHelmets, unlockedColors } = p;
  for (const a of ARENAS) if (a.unlockAfter == null || c >= a.unlockAfter) unlockedArenas = add(unlockedArenas, a.id);
  for (const [id, at] of Object.entries(WEAPON_UNLOCKS)) if (c >= at) unlockedWeapons = add(unlockedWeapons, id);
  for (const [id, at] of Object.entries(ARMOR_UNLOCKS)) if (c >= at) unlockedArmor = add(unlockedArmor, id);
  for (const h of HELMETS) if (c >= h.at) unlockedHelmets = add(unlockedHelmets, h.id);
  for (const col of COLORS) if (c >= col.at) unlockedColors = add(unlockedColors, col.id);
  return { ...p, unlockedArenas, unlockedWeapons, unlockedArmor, unlockedHelmets, unlockedColors };
}

export function sanitize(raw) {
  const d = defaultProgress();
  if (!raw || typeof raw !== "object") return d;
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const st = raw.statistics && typeof raw.statistics === "object" ? raw.statistics : {};
  const look = raw.look && typeof raw.look === "object" ? raw.look : {};
  const defeated = arr(raw.defeatedEnemies, ENEMY_IDS);
  let career = Math.min(ENEMIES.length, Math.floor(nat(raw.careerProgress, 0)));
  // career can never be behind the enemies actually defeated in order
  while (career < ENEMIES.length && defeated.includes(ENEMIES[career].id)) career++;
  const p = {
    version: SAVE_VERSION,
    careerProgress: career,
    defeatedEnemies: defeated,
    unlockedArenas: arr(raw.unlockedArenas, ARENA_IDS),
    unlockedWeapons: arr(raw.unlockedWeapons, WEAPON_IDS),
    unlockedArmor: arr(raw.unlockedArmor, ARMOR_IDS),
    unlockedHelmets: arr(raw.unlockedHelmets, HELMET_IDS),
    unlockedColors: arr(raw.unlockedColors, COLOR_IDS),
    selectedWeapon: str(raw.selectedWeapon, WEAPON_IDS, d.selectedWeapon),
    selectedArmor: str(raw.selectedArmor, ARMOR_IDS, d.selectedArmor),
    helmet: str(raw.helmet, HELMET_IDS, d.helmet),
    color: str(raw.color, COLOR_IDS, d.color),
    look: {
      skin: hexColor(look.skin, d.look.skin),
      hair: str(look.hair, HAIRS, d.look.hair),
      hairColor: hexColor(look.hairColor, d.look.hairColor),
      beard: typeof look.beard === "boolean" ? look.beard : d.look.beard,
    },
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 14).toUpperCase() : d.name,
    cameraMode: str(raw.cameraMode, ["first", "third"], d.cameraMode),
    settings: {
      fov: Math.min(100, Math.max(70, Number.isFinite(s.fov) ? s.fov : d.settings.fov)),
      sensitivity: Math.min(2.5, Math.max(0.3, Number.isFinite(s.sensitivity) ? s.sensitivity : d.settings.sensitivity)),
      invertY: typeof s.invertY === "boolean" ? s.invertY : d.settings.invertY,
      sound: typeof s.sound === "boolean" ? s.sound : true,
      music: typeof s.music === "boolean" ? s.music : true,
      graphics: str(s.graphics, ["low", "medium", "high"], "medium"),
      shadows: typeof s.shadows === "boolean" ? s.shadows : true,
      particles: typeof s.particles === "boolean" ? s.particles : true,
      cameraShake: typeof s.cameraShake === "boolean" ? s.cameraShake : true,
      headBob: str(s.headBob, ["off", "low", "normal"], "low"),
      reducedMotion: typeof s.reducedMotion === "boolean" ? s.reducedMotion : d.settings.reducedMotion,
      controlHelp: typeof s.controlHelp === "boolean" ? s.controlHelp : true,
    },
    statistics: Object.fromEntries(STAT_FIELDS.map((k) => [k, nat(st[k], 0)])),
    bestTimes: {},
    champion: !!raw.champion,
    seenTutorial: !!raw.seenTutorial,
    tokens: arr(raw.tokens).slice(-60),
  };
  if (raw.bestTimes && typeof raw.bestTimes === "object") {
    for (const [k, v] of Object.entries(raw.bestTimes)) if (ENEMY_IDS.includes(k) && Number.isFinite(v) && v > 0) p.bestTimes[k] = v;
  }
  const u = applyUnlocks(p);
  // a selection must be something you own
  if (!u.unlockedWeapons.includes(u.selectedWeapon)) u.selectedWeapon = "sword_shield";
  if (!u.unlockedArmor.includes(u.selectedArmor)) u.selectedArmor = "balanced";
  if (!u.unlockedHelmets.includes(u.helmet)) u.helmet = "none";
  if (!u.unlockedColors.includes(u.color)) u.color = "crimson";
  if (career >= ENEMIES.length) u.champion = true;
  return u;
}

/** Migrations from older versions go here (v1 is the first). */
function migrate(raw) {
  if (!raw || typeof raw !== "object") return raw;
  // future: if (raw.version === 1) { ...; raw.version = 2 }
  return raw;
}

export function loadProgress() {
  try {
    const txt = window.localStorage.getItem(KEY);
    if (!txt) return defaultProgress();
    return sanitize(migrate(JSON.parse(txt)));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

/** Player combat stats scale gently with the career (arena champions beaten). */
export function playerHp(p) {
  return 100 + 10 * Math.min(4, Math.floor(p.careerProgress / 5));
}

export function playerLook(p) {
  const col = COLORS.find((c) => c.id === p.color) || COLORS[0];
  return {
    ...p.look,
    helmet: p.helmet,
    crest: col.accent,
    cloth: col.cloth,
    accent: col.accent,
    leather: "#6b4a2e",
    metal: "#b4ada2",
  };
}

/**
 * Apply one fight's result. data: { token, mode: "career"|"arena"|"training",
 * enemyId, won, stats (engine fighter stats), fpTime, tpTime, duration }
 * Returns { progress, rewards } — rewards: { careerAdvanced, unlocks: [text], rankUp }
 */
export function applyFightResult(p, data) {
  if (!data || !data.token || p.tokens.includes(data.token)) return { progress: p, rewards: null, duplicate: true };
  const st = { ...p.statistics };
  const s = data.stats || {};
  const training = data.mode === "training";
  st.lightAttacks += s.lightAttacks || 0;
  st.heavyAttacks += s.heavyAttacks || 0;
  st.kicks += s.kicks || 0;
  st.attacksThrown += (s.lightAttacks || 0) + (s.heavyAttacks || 0) + (s.kicks || 0);
  st.hitsLanded += s.hitsLanded || 0;
  st.damageDealt += s.damageDealt || 0;
  st.damageTaken += s.damageTaken || 0;
  st.blocks += s.blocks || 0;
  st.parries += s.parries || 0;
  st.dodges += s.dodges || 0;
  st.counters += s.counters || 0;
  st.guardBreaks += s.guardBreaks || 0;
  st.fpTime += data.fpTime || 0;
  st.tpTime += data.tpTime || 0;
  st.playTime += data.duration || 0;
  if (training) st.trainingSessions += 1;
  let next = { ...p, statistics: st, tokens: [...p.tokens, data.token].slice(-60) };
  const rewards = { careerAdvanced: false, unlocks: [], rankUp: null, firstWin: false };
  if (!training) {
    st.fights += 1;
    if (data.won) st.wins += 1;
    else st.losses += 1;
    const e = enemyById(data.enemyId);
    if (data.won && e) {
      st.enemiesDefeated += 1;
      if (!next.defeatedEnemies.includes(e.id)) {
        rewards.firstWin = true;
        next.defeatedEnemies = [...next.defeatedEnemies, e.id];
        if (e.champion) st.championsDefeated += 1;
      }
      const prevBest = next.bestTimes[e.id];
      if (data.duration > 0 && (!prevBest || data.duration < prevBest)) next.bestTimes = { ...next.bestTimes, [e.id]: Math.round(data.duration * 10) / 10 };
      if (e.n === next.careerProgress + 1) {
        const before = applyUnlocks(next);
        const oldRank = rankOf(next.careerProgress);
        next.careerProgress += 1;
        rewards.careerAdvanced = true;
        next = applyUnlocks(next);
        const newRank = rankOf(next.careerProgress);
        if (newRank !== oldRank) rewards.rankUp = newRank;
        for (const id of next.unlockedWeapons) if (!before.unlockedWeapons.includes(id)) rewards.unlocks.push(`Weapon: ${WEAPONS.find((w) => w.id === id).name}`);
        for (const id of next.unlockedArmor) if (!before.unlockedArmor.includes(id)) rewards.unlocks.push(`Armour: ${ARMORS.find((a) => a.id === id).name}`);
        for (const id of next.unlockedArenas) if (!before.unlockedArenas.includes(id)) rewards.unlocks.push(`Arena: ${ARENAS.find((a) => a.id === id).name}`);
        for (const id of next.unlockedHelmets) if (!before.unlockedHelmets.includes(id)) rewards.unlocks.push(`Helmet: ${HELMETS.find((h) => h.id === id).name}`);
        for (const id of next.unlockedColors) if (!before.unlockedColors.includes(id)) rewards.unlocks.push(`Colours: ${COLORS.find((c) => c.id === id).name}`);
        if (next.careerProgress >= ENEMIES.length) next.champion = true;
      }
    }
  }
  next.statistics = st;
  return { progress: next, rewards };
}

export const nextOpponent = (p) => ENEMIES[Math.min(p.careerProgress, ENEMIES.length - 1)];
export const isFightUnlocked = (p, e) => e.n <= p.careerProgress + 1;
