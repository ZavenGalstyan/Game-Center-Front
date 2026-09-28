/**
 * Street Basketball — persistence & progression. One versioned key:
 * `street-basketball-progress`. Loading sanitises field-by-field (a damaged or
 * older save keeps everything still valid; missing fields get defaults), and
 * nothing here ever touches another key.
 *
 * Saves happen on events (match result, unlock, upgrade, cosmetic/setting
 * change, training record) — never per frame. Every match / drill result
 * carries a unique token; applying the same token twice is a no-op, so
 * rewards, unlocks and statistics can never double up.
 */
import { OPPONENTS, opponentById } from "../data/opponents.js";
import { COURTS } from "../data/courts.js";
import { OUTFITS, BALLS, DUNKS, HEADBANDS, WRISTBANDS, LOOK, byId } from "../data/cosmetics.js";

const KEY = "street-basketball-progress";
export const SAVE_VERSION = 1;
export const SKILLS = ["shooting", "finishing", "speed", "defense", "stamina"];
export const SKILL_MIN = 4;
export const SKILL_MAX = 10;

export const STAT_FIELDS = [
  "matches", "wins", "losses", "points", "fgm", "fga", "perfect", "twoM", "twoA", "layups", "dunks",
  "blocks", "steals", "rebounds", "crossovers", "swishes", "winStreak", "bestWinStreak", "trainingSessions", "playTimeSec",
];

const reduced = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  graphics: "medium",
  particles: true,
  cameraShake: true,
  shotMeter: true,
  controlHelp: true,
  reducedMotion: false,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    careerStage: 0,
    defeated: [],
    unlockedCourts: ["neighborhood"],
    player: { name: "YOU", skin: LOOK.skin[2], hair: "fade", hairColor: LOOK.hairColor[0], number: "23" },
    upgrades: Object.fromEntries(SKILLS.map((k) => [k, SKILL_MIN])),
    skillPoints: 0,
    selectedOutfit: "rookie",
    unlockedOutfits: ["rookie"],
    selectedBall: "classic",
    unlockedBalls: ["classic"],
    unlockedDunks: ["one"],
    headband: "none",
    wristband: "none",
    unlockedHeadbands: ["none", "white"],
    unlockedWristbands: ["none", "white"],
    trainingRecords: {
      free: { makes: 0, attempts: 0, perfect: 0, bestStreak: 0 },
      three: { best: 0 },
      dunk: { best: 0 },
      dribble: { best: 0 }, // seconds, lower is better (0 = none yet)
      defense: { best: 0 },
    },
    settings: { ...DEFAULT_SETTINGS, reducedMotion: reduced() },
    statistics: Object.fromEntries(STAT_FIELDS.map((k) => [k, 0])),
    champion: false,
    seenRules: false,
    tokens: [],
  };
}

const nat = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const ids = (list) => list.map((x) => x.id);
const cleanList = (v, valid, base) => {
  const out = new Set(base);
  if (Array.isArray(v)) v.forEach((x) => valid.includes(x) && out.add(x));
  return [...out];
};

export function loadProgress() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    raw = null;
  }
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  const oppIds = ids(OPPONENTS);
  p.defeated = cleanList(raw.defeated, oppIds, []);
  p.careerStage = Math.min(OPPONENTS.length, Math.max(nat(raw.careerStage), firstUndefeated(p.defeated)));
  p.unlockedCourts = cleanList(raw.unlockedCourts, ids(COURTS), ["neighborhood"]);
  const pl = raw.player || {};
  p.player = {
    name: typeof pl.name === "string" && pl.name.trim() ? pl.name.trim().slice(0, 12).toUpperCase() : p.player.name,
    skin: oneOf(pl.skin, LOOK.skin, p.player.skin),
    hair: oneOf(pl.hair, LOOK.hair, p.player.hair),
    hairColor: oneOf(pl.hairColor, LOOK.hairColor, p.player.hairColor),
    number: typeof pl.number === "string" && /^\d{1,2}$/.test(pl.number) ? pl.number : p.player.number,
  };
  const up = raw.upgrades || {};
  for (const k of SKILLS) p.upgrades[k] = Math.max(SKILL_MIN, Math.min(SKILL_MAX, nat(up[k], SKILL_MIN)));
  p.skillPoints = nat(raw.skillPoints);
  p.unlockedOutfits = cleanList(raw.unlockedOutfits, ids(OUTFITS), ["rookie"]);
  p.selectedOutfit = oneOf(raw.selectedOutfit, p.unlockedOutfits, "rookie");
  p.unlockedBalls = cleanList(raw.unlockedBalls, ids(BALLS), ["classic"]);
  p.selectedBall = oneOf(raw.selectedBall, p.unlockedBalls, "classic");
  p.unlockedDunks = cleanList(raw.unlockedDunks, ids(DUNKS), ["one"]);
  p.unlockedHeadbands = cleanList(raw.unlockedHeadbands, ids(HEADBANDS), ["none", "white"]);
  p.unlockedWristbands = cleanList(raw.unlockedWristbands, ids(WRISTBANDS), ["none", "white"]);
  p.headband = oneOf(raw.headband, p.unlockedHeadbands, "none");
  p.wristband = oneOf(raw.wristband, p.unlockedWristbands, "none");
  const tr = raw.trainingRecords || {};
  const f = tr.free || {};
  p.trainingRecords.free = { makes: nat(f.makes), attempts: nat(f.attempts), perfect: nat(f.perfect), bestStreak: nat(f.bestStreak) };
  for (const k of ["three", "dunk", "defense"]) p.trainingRecords[k] = { best: nat(tr[k]?.best) };
  p.trainingRecords.dribble = { best: num(tr.dribble?.best) };
  const s = raw.settings || {};
  p.settings = {
    sound: typeof s.sound === "boolean" ? s.sound : true,
    music: typeof s.music === "boolean" ? s.music : true,
    graphics: oneOf(s.graphics, ["low", "medium", "high"], "medium"),
    particles: typeof s.particles === "boolean" ? s.particles : true,
    cameraShake: typeof s.cameraShake === "boolean" ? s.cameraShake : true,
    shotMeter: typeof s.shotMeter === "boolean" ? s.shotMeter : true,
    controlHelp: typeof s.controlHelp === "boolean" ? s.controlHelp : true,
    reducedMotion: typeof s.reducedMotion === "boolean" ? s.reducedMotion : p.settings.reducedMotion,
  };
  const st = raw.statistics || {};
  for (const k of STAT_FIELDS) p.statistics[k] = k === "playTimeSec" ? num(st[k]) : nat(st[k]);
  p.champion = !!raw.champion || p.defeated.includes("marcus");
  p.seenRules = !!raw.seenRules;
  p.tokens = Array.isArray(raw.tokens) ? raw.tokens.filter((t) => typeof t === "string").slice(-40) : [];
  // courts follow defeated bosses (repairs older/partial saves)
  for (const c of COURTS) if (c.unlock && p.defeated.includes(c.unlock) && !p.unlockedCourts.includes(c.id)) p.unlockedCourts.push(c.id);
  return p;
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function firstUndefeated(defeated) {
  const i = OPPONENTS.findIndex((o) => !defeated.includes(o.id));
  return i === -1 ? OPPONENTS.length : i;
}

/** An opponent is playable in career if it is the next one or already beaten. */
export function isOpponentUnlocked(p, id) {
  const o = opponentById(id);
  return p.defeated.includes(id) || o.index <= p.careerStage;
}

/** Engine ratings (1–10) derived from the five bounded skills. */
export function playerRatings(p) {
  const u = p.upgrades;
  return {
    shooting: u.shooting,
    finishing: u.finishing,
    speed: u.speed,
    defense: u.defense,
    stamina: u.stamina,
    handle: (u.speed + u.finishing) / 2,
    steal: (u.defense + u.speed) / 2,
    block: (u.defense + u.finishing) / 2,
    rebound: (u.defense + u.finishing) / 2,
  };
}

export function upgradeCost(level) {
  return level < 7 ? 2 : 3;
}

export function upgradeSkill(p, k) {
  if (!SKILLS.includes(k)) return p;
  const lvl = p.upgrades[k];
  if (lvl >= SKILL_MAX) return p;
  const cost = upgradeCost(lvl);
  if (p.skillPoints < cost) return p;
  return { ...p, skillPoints: p.skillPoints - cost, upgrades: { ...p.upgrades, [k]: lvl + 1 } };
}

/* ------------------------------------------------------------ unlocks */

function meets(p, u) {
  const st = p.statistics;
  switch (u.type) {
    case "default": return true;
    case "defeat": return p.defeated.includes(u.id);
    case "champion": return p.champion;
    case "perfect": return st.perfect + p.trainingRecords.free.perfect >= u.n;
    case "dunks": return st.dunks >= u.n;
    case "wins": return st.wins >= u.n;
    case "makes": return st.fgm + p.trainingRecords.free.makes >= u.n;
    case "training": return (p.trainingRecords[u.mode]?.best || 0) >= u.score;
    default: return false;
  }
}

/** Grant everything newly earned. Returns [progress, newUnlockLabels]. */
export function grantUnlocks(p) {
  const got = [];
  const next = { ...p };
  const scan = (list, field, label) => {
    const have = new Set(next[field]);
    for (const it of list) {
      if (!have.has(it.id) && meets(next, it.unlock)) {
        have.add(it.id);
        got.push(`${label}: ${it.name}`);
      }
    }
    next[field] = [...have];
  };
  scan(OUTFITS, "unlockedOutfits", "Outfit");
  scan(BALLS, "unlockedBalls", "Ball");
  scan(DUNKS, "unlockedDunks", "Dunk");
  scan(HEADBANDS, "unlockedHeadbands", "Headband");
  scan(WRISTBANDS, "unlockedWristbands", "Wristband");
  return [next, got];
}

export function isUnlocked(p, kind, id) {
  const field = { outfit: "unlockedOutfits", ball: "unlockedBalls", dunk: "unlockedDunks", headband: "unlockedHeadbands", wristband: "unlockedWristbands" }[kind];
  return !!field && p[field].includes(id);
}

/* ------------------------------------------------------------ results */

/**
 * Apply a finished match exactly once.
 * r: { token, opponentId, mode: "career"|"quick", winner, score, stats (player's), timeSec }
 */
export function applyMatchResult(p, r) {
  if (!r || !r.token || p.tokens.includes(r.token)) return { progress: p, rewards: null };
  const won = r.winner === "p";
  const s = r.stats || {};
  const st = { ...p.statistics };
  st.matches += 1;
  if (won) st.wins += 1;
  else st.losses += 1;
  st.points += nat(s.points);
  st.fgm += nat(s.fgm);
  st.fga += nat(s.fga);
  st.perfect += nat(s.perfect);
  st.twoM += nat(s.twoM);
  st.twoA += nat(s.twoA);
  st.layups += nat(s.layups);
  st.dunks += nat(s.dunks);
  st.blocks += nat(s.blocks);
  st.steals += nat(s.steals);
  st.rebounds += nat(s.rebounds);
  st.crossovers += nat(s.crossovers);
  st.swishes += nat(s.swishes);
  st.winStreak = won ? st.winStreak + 1 : 0;
  st.bestWinStreak = Math.max(st.bestWinStreak, st.winStreak);
  st.playTimeSec += num(r.timeSec);

  let next = { ...p, statistics: st, tokens: [...p.tokens, r.token].slice(-40) };
  const rewards = { won, skillPoints: 0, newlyDefeated: false, courtUnlocked: null, unlocks: [], champion: false };
  if (won && r.mode === "career") {
    const o = opponentById(r.opponentId);
    if (!next.defeated.includes(o.id)) {
      next.defeated = [...next.defeated, o.id];
      rewards.newlyDefeated = true;
      rewards.skillPoints += 2;
      if (o.boss) rewards.skillPoints += 2;
      const court = COURTS.find((c) => c.unlock === o.id);
      if (court && !next.unlockedCourts.includes(court.id)) {
        next.unlockedCourts = [...next.unlockedCourts, court.id];
        rewards.courtUnlocked = court.id;
      }
      if (o.final) {
        next.champion = true;
        rewards.champion = true;
      }
    }
    next.careerStage = Math.max(next.careerStage, firstUndefeated(next.defeated));
  }
  next.skillPoints += rewards.skillPoints;
  const [withUnlocks, got] = grantUnlocks(next);
  rewards.unlocks = got;
  return { progress: withUnlocks, rewards };
}

/**
 * Apply a training session once. kind: free|three|dunk|dribble|defense.
 * data: { token, score, makes, attempts, perfect, bestStreak, timeSec }
 */
export function applyTraining(p, kind, data) {
  if (!data || !data.token || p.tokens.includes(data.token)) return { progress: p, record: false, unlocks: [] };
  const tr = { ...p.trainingRecords };
  let record = false;
  if (kind === "free") {
    const f = tr.free;
    tr.free = {
      makes: f.makes + nat(data.makes),
      attempts: f.attempts + nat(data.attempts),
      perfect: f.perfect + nat(data.perfect),
      bestStreak: Math.max(f.bestStreak, nat(data.bestStreak)),
    };
    record = nat(data.bestStreak) > f.bestStreak;
  } else if (kind === "dribble") {
    const t = num(data.score);
    if (t > 0 && (tr.dribble.best === 0 || t < tr.dribble.best)) {
      tr.dribble = { best: Math.round(t * 100) / 100 };
      record = true;
    }
  } else if (tr[kind]) {
    if (nat(data.score) > tr[kind].best) {
      tr[kind] = { best: nat(data.score) };
      record = true;
    }
  }
  const st = { ...p.statistics, trainingSessions: p.statistics.trainingSessions + 1, playTimeSec: p.statistics.playTimeSec + num(data.timeSec) };
  let next = { ...p, trainingRecords: tr, statistics: st, tokens: [...p.tokens, data.token].slice(-40) };
  // a first personal best in each drill is worth a skill point
  if (record && kind !== "free" && !(p.trainingRecords[kind]?.best)) next.skillPoints += 1;
  const [withUnlocks, got] = grantUnlocks(next);
  return { progress: withUnlocks, record, unlocks: got };
}

/** The player's full look for the renderer (appearance + outfit + accessories). */
export function playerLook(p) {
  const o = byId(OUTFITS, p.selectedOutfit);
  return {
    skin: p.player.skin,
    hair: p.player.hair,
    hairColor: p.player.hairColor,
    number: p.player.number,
    jersey: o.jersey,
    jerseyTrim: o.jerseyTrim,
    shorts: o.shorts,
    shortsTrim: o.shortsTrim,
    shoes: o.shoes,
    shoeAccent: o.shoeAccent,
    socks: o.socks,
    headband: byId(HEADBANDS, p.headband).color,
    wristband: byId(WRISTBANDS, p.wristband).color,
    build: 1,
    bulk: 1,
  };
}

/** Opponent look (their data + defaults for the fields they don't set). */
export function opponentLook(o) {
  const L = o.look;
  return {
    skin: L.skin,
    hair: L.hair,
    hairColor: L.hairColor,
    jersey: L.jersey,
    jerseyTrim: L.shorts === "#f2f0ea" ? "#1b1b1b" : "#f2f2ee",
    shorts: L.shorts,
    shortsTrim: L.jersey,
    shoes: L.shoes,
    shoeAccent: L.jersey,
    socks: "#f4f4f4",
    headband: L.headband || null,
    wristband: L.wristband || null,
    beard: !!L.beard,
    build: L.build || 1,
    bulk: L.bulk || 1,
    number: String((o.index * 7 + 3) % 99),
  };
}
