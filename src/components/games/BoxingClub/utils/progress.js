/**
 * Boxing Club — persistence and progression. One versioned key:
 * `boxing-club-progress`. Loading sanitises field by field (a damaged or
 * older save keeps everything that's still valid). Saves happen on events —
 * a fight result, a training session, a setting or cosmetic change — never
 * per frame.
 *
 * Fight results carry a unique token; applying the same result twice is a
 * no-op, so rewards, unlocks and statistics can never double up.
 */
import { OPPONENTS, opponentIndex } from "../data/opponents.js";
import { GLOVES, LOOK_OPTIONS } from "../data/gloves.js";

const KEY = "boxing-club-progress";
export const SAVE_VERSION = 1;
export const STAT_KEYS = ["power", "speed", "stamina", "recovery"];
export const STAT_MAX = 10;

const prefersReducedMotion = () => {
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
  controlHelp: true,
  reducedMotion: false,
};

export const STAT_FIELDS = [
  "fights", "wins", "losses", "draws", "kos", "knockdownsScored", "knockdownsReceived",
  "jabsLanded", "crossesLanded", "hooksLanded", "bodyShots", "punchesThrown", "punchesLanded",
  "blocks", "dodges", "perfectDodges", "counters", "roundsWon", "trainingSessions", "championships", "fightTimeMs",
];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    fighter: {
      name: "Challenger",
      look: { skin: "#e5b18c", hair: "short", hairColor: "#1d1712", shorts: "#c0392b", shoes: "#1f1f24" },
      stats: { power: 1, speed: 1, stamina: 1, recovery: 1 },
      tp: 0,
    },
    career: { defeated: [] },
    gloves: { unlocked: ["rookie"], selected: "rookie" },
    training: { heavy: { best: 0, medal: 0 }, speed: { best: 0, medal: 0 }, dodge: { best: 0, medal: 0 }, combo: { best: 0, medal: 0 } },
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    statistics: Object.fromEntries(STAT_FIELDS.map((k) => [k, 0])),
    champion: false,
    seenControls: false,
    lastToken: null,
  };
}

const nat = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

export function loadProgress() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    raw = null;
  }
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  const f = raw.fighter || {};
  if (typeof f.name === "string" && f.name.trim()) p.fighter.name = f.name.trim().slice(0, 16);
  const L = f.look || {};
  p.fighter.look = {
    skin: oneOf(L.skin, LOOK_OPTIONS.skin, p.fighter.look.skin),
    hair: oneOf(L.hair, LOOK_OPTIONS.hair, p.fighter.look.hair),
    hairColor: oneOf(L.hairColor, LOOK_OPTIONS.hairColor, p.fighter.look.hairColor),
    shorts: oneOf(L.shorts, LOOK_OPTIONS.shorts, p.fighter.look.shorts),
    shoes: oneOf(L.shoes, LOOK_OPTIONS.shoes, p.fighter.look.shoes),
  };
  for (const k of STAT_KEYS) p.fighter.stats[k] = Math.min(STAT_MAX, Math.max(1, nat(f.stats?.[k], 1)));
  p.fighter.tp = nat(f.tp, 0);
  if (Array.isArray(raw.career?.defeated)) {
    // only real opponents, only in order (you can't have beaten #12 without #11)
    const set = new Set(raw.career.defeated.filter((id) => opponentIndex(id) >= 0));
    let n = 0;
    while (n < OPPONENTS.length && set.has(OPPONENTS[n].id)) n++;
    p.career.defeated = OPPONENTS.slice(0, n).map((o) => o.id);
  }
  for (const m of ["heavy", "speed", "dodge", "combo"]) {
    const t = raw.training?.[m];
    if (t) p.training[m] = { best: nat(t.best, 0), medal: Math.min(3, nat(t.medal, 0)) };
  }
  const s = raw.settings || {};
  for (const k of ["sound", "music", "particles", "cameraShake", "controlHelp", "reducedMotion"]) if (typeof s[k] === "boolean") p.settings[k] = s[k];
  p.settings.graphics = oneOf(s.graphics, ["low", "medium", "high"], p.settings.graphics);
  for (const k of STAT_FIELDS) p.statistics[k] = nat(raw.statistics?.[k], 0);
  p.champion = Boolean(raw.champion) && p.career.defeated.includes("darius");
  p.seenControls = Boolean(raw.seenControls);
  p.lastToken = typeof raw.lastToken === "string" ? raw.lastToken : null;
  p.gloves.unlocked = gloveUnlocks(p);
  p.gloves.selected = p.gloves.unlocked.includes(raw.gloves?.selected) ? raw.gloves.selected : "rookie";
  return p;
}

export function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
  } catch {
    /* storage unavailable — this session just won't persist */
  }
}

/* --------------------------------------------------------- derivations */

export const medalsEarned = (p) => Object.values(p.training).reduce((a, t) => a + t.medal, 0);
export const careerIndex = (p) => p.career.defeated.length; // index of the next opponent
export const currentTier = (p) => (OPPONENTS[Math.min(careerIndex(p), OPPONENTS.length - 1)]?.tier ?? 5);

/** Gloves are always derived from milestones, so a save can't lose or invent them. */
export function gloveUnlocks(p) {
  const st = p.statistics;
  const reached = currentTier(p);
  const ok = (g) => {
    const u = g.unlock;
    if (u.kind === "start") return true;
    if (u.kind === "wins") return p.career.defeated.length >= u.n;
    if (u.kind === "kos") return st.kos >= u.n;
    if (u.kind === "training") return medalsEarned(p) >= u.n;
    if (u.kind === "tier") return reached >= u.n || p.career.defeated.length >= OPPONENTS.length;
    if (u.kind === "perfect") return st.perfectDodges >= u.n;
    if (u.kind === "champion") return p.champion;
    return false;
  };
  return GLOVES.filter(ok).map((g) => g.id);
}

export function statCost(level) {
  return level; // 1→2 costs 1 TP … 9→10 costs 9 TP
}

export function upgradeStat(p, key) {
  const lv = p.fighter.stats[key];
  if (!STAT_KEYS.includes(key) || lv >= STAT_MAX || p.fighter.tp < statCost(lv)) return p;
  return { ...p, fighter: { ...p.fighter, tp: p.fighter.tp - statCost(lv), stats: { ...p.fighter.stats, [key]: lv + 1 } } };
}

/* ------------------------------------------------------------- results */

/**
 * Fold a finished fight in (pure). Returns { progress, rewards }.
 * `fight` = { token, opponentId, mode: "career" | "exhibition", result, stats, rounds, timeMs }
 */
export function applyFightResult(p, fight) {
  if (!fight?.token || p.lastToken === fight.token) return { progress: p, rewards: null };
  const res = fight.result;
  const won = res.winner === "player";
  const lost = res.winner === "opponent";
  const ko = won && (res.method === "KO" || res.method === "TKO");
  const sp = fight.stats.player;
  const so = fight.stats.opponent;
  const st = { ...p.statistics };
  st.fights++;
  if (won) st.wins++;
  else if (lost) st.losses++;
  else st.draws++;
  if (ko) st.kos++;
  st.knockdownsScored += sp.knockdowns;
  st.knockdownsReceived += so.knockdowns;
  st.jabsLanded += sp.jab;
  st.crossesLanded += sp.cross;
  st.hooksLanded += sp.hook;
  st.bodyShots += sp.body;
  st.punchesThrown += sp.thrown;
  st.punchesLanded += sp.landed;
  st.blocks += sp.blocks;
  st.dodges += sp.evades;
  st.perfectDodges += sp.perfect;
  st.counters += sp.counters;
  st.roundsWon += (res.rounds || []).filter((r) => r.result === "won").length;
  st.fightTimeMs += Math.max(0, Math.round(fight.timeMs || 0));

  let next = { ...p, statistics: st, lastToken: fight.token };
  const lines = [];
  let tp = 0;
  if (fight.mode === "career" && won) {
    const idx = opponentIndex(fight.opponentId);
    const first = idx === careerIndex(p);
    if (first) {
      tp = 3 + (ko ? 1 : 0);
      next.career = { defeated: [...p.career.defeated, fight.opponentId] };
      const upcoming = OPPONENTS[idx + 1];
      if (upcoming) lines.push(`Next opponent unlocked: ${upcoming.name}`);
      if (upcoming && upcoming.tier !== OPPONENTS[idx].tier) lines.push(`New venue: ${["", "Local Gym", "City Hall", "Regional Arena", "National Stadium", "Championship Night"][upcoming.tier]}`);
      if (fight.opponentId === "darius") {
        next.champion = true;
        st.championships++;
        lines.push("You are the CHAMPION!");
      }
    } else {
      tp = 1;
    }
  }
  if (tp) {
    next.fighter = { ...next.fighter, tp: next.fighter.tp + tp };
    lines.unshift(`+${tp} Training Point${tp > 1 ? "s" : ""}`);
  }
  const before = new Set(p.gloves.unlocked);
  const unlocked = gloveUnlocks(next);
  next.gloves = { ...next.gloves, unlocked };
  const newGloves = unlocked.filter((g) => !before.has(g));
  if (newGloves.length) lines.push(`New gloves: ${newGloves.map((id) => GLOVES.find((g) => g.id === id).name).join(", ")}`);
  return { progress: next, rewards: { lines, tp, newGloves } };
}

/** Training session: keeps the best score, awards 1 TP per new medal level. */
export function applyTraining(p, mode, score, medal) {
  const prev = p.training[mode];
  const gained = Math.max(0, medal - prev.medal);
  const next = {
    ...p,
    training: { ...p.training, [mode]: { best: Math.max(prev.best, score), medal: Math.max(prev.medal, medal) } },
    statistics: { ...p.statistics, trainingSessions: p.statistics.trainingSessions + 1 },
    fighter: { ...p.fighter, tp: p.fighter.tp + gained },
  };
  const before = new Set(p.gloves.unlocked);
  next.gloves = { ...next.gloves, unlocked: gloveUnlocks(next) };
  const newGloves = next.gloves.unlocked.filter((g) => !before.has(g));
  return { progress: next, gained, newGloves };
}
