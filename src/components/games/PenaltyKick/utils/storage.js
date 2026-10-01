/**
 * Penalty Kick — persistence under ONE key: `penalty-kick-progress`.
 * Versioned; every field is sanitised on load (a corrupted or hand-edited save
 * falls back field by field, never crashes). Saved only on discrete events
 * (a finished shootout / training round, a settings or kit change); the Game
 * Center Restart never touches it.
 */
import { MATCHES, STAGES } from "../data/career.js";
import { BALLS, KIT_OPTIONS, DEFAULT_KIT } from "../data/cosmetics.js";

const KEY = "penalty-kick-progress";
export const SAVE_VERSION = 1;

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
  shadows: true,
  crowd: "medium", // off | low | medium | high
  particles: true,
  cameraMotion: true,
  aimSens: "medium",
  swipeSens: "medium",
  controlHelp: true,
  reducedMotion: false,
};

export const STAT_KEYS = [
  "matchesPlayed", "matchesWon", "matchesLost", "suddenDeaths",
  "penaltiesTaken", "goalsScored", "shotsMissed", "shotsSaved",
  "penaltiesFaced", "saves", "catches", "goalsConceded",
  "woodwork", "topCorners", "curledShots", "overpowered",
  "bestStreak", "cleanSheets", "targetsHit", "bestTargetScore",
  "keeperBestSaves", "practiceShots", "playMs",
];

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    matches: {}, // id → { stars, best: "5-3", wins }
    selectedBall: "classic",
    kit: { ...DEFAULT_KIT },
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  if (raw.matches && typeof raw.matches === "object") {
    for (const M of MATCHES) {
      const r = raw.matches[M.id];
      if (!r || typeof r !== "object") continue;
      const best = typeof r.best === "string" && /^\d{1,2}-\d{1,2}$/.test(r.best) ? r.best : "0-0";
      p.matches[M.id] = { stars: Math.min(3, Math.max(1, int(r.stars, 1))), best, wins: Math.max(1, int(r.wins, 1)) };
    }
  }
  const st = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
  for (const k of STAT_KEYS) p.stats[k] = int(st[k]);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const lmh = ["low", "medium", "high"];
  p.settings = {
    sound: bool(s.sound, true),
    music: bool(s.music, true),
    graphics: pick(s.graphics, lmh, "medium"),
    shadows: bool(s.shadows, true),
    crowd: pick(s.crowd, ["off", ...lmh], "medium"),
    particles: bool(s.particles, true),
    cameraMotion: bool(s.cameraMotion, true),
    aimSens: pick(s.aimSens, lmh, "medium"),
    swipeSens: pick(s.swipeSens, lmh, "medium"),
    controlHelp: bool(s.controlHelp, true),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
  };
  const k = raw.kit && typeof raw.kit === "object" ? raw.kit : {};
  p.kit = {
    shirt: pick(k.shirt, KIT_OPTIONS.shirt, DEFAULT_KIT.shirt),
    shorts: pick(k.shorts, KIT_OPTIONS.shorts, DEFAULT_KIT.shorts),
    boots: pick(k.boots, KIT_OPTIONS.boots, DEFAULT_KIT.boots),
    gloves: pick(k.gloves, KIT_OPTIONS.gloves, DEFAULT_KIT.gloves),
    keeperShirt: pick(k.keeperShirt, KIT_OPTIONS.keeperShirt, DEFAULT_KIT.keeperShirt),
    skin: pick(k.skin, KIT_OPTIONS.skin, DEFAULT_KIT.skin),
    number: Math.min(99, Math.max(1, int(k.number, DEFAULT_KIT.number) || DEFAULT_KIT.number)),
    name: typeof k.name === "string" ? cleanName(k.name) || DEFAULT_KIT.name : DEFAULT_KIT.name,
  };
  p.selectedBall = unlockedBalls(p).includes(raw.selectedBall) ? raw.selectedBall : "classic";
  return p;
}

/** Shirt name: A–Z, space, dot, hyphen; 10 chars. */
export const cleanName = (s) =>
  String(s)
    .toUpperCase()
    .replace(/[^A-Z .-]/g, "")
    .replace(/\s+/g, " ")
    .trimStart()
    .slice(0, 10);

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
  } catch {
    /* storage full / blocked: play on without saving */
  }
}

/* ------------------------------------------------------------ career */
export const matchesWon = (p) => MATCHES.filter((M) => p.matches[M.id]).length;
export const totalStars = (p) => MATCHES.reduce((a, M) => a + (p.matches[M.id]?.stars || 0), 0);
export const stageWon = (p, stageId) => {
  const S = STAGES.find((s) => s.id === stageId);
  return !!S && !!p.matches[S.matches[1]];
};
export const stagesWon = (p) => STAGES.filter((s) => stageWon(p, s.id)).length;

export function isUnlocked(p, id) {
  if (id === 1) return true;
  return !!p.matches[id - 1];
}
export function nextMatchId(p) {
  for (const M of MATCHES) if (!p.matches[M.id]) return M.id;
  return MATCHES[MATCHES.length - 1].id;
}

/* ------------------------------------------------------------ balls */
export function ballUnlocked(p, b) {
  const u = b.unlock;
  if (!u) return true;
  const s = p.stats;
  if (u.kind === "goals") return s.goalsScored >= u.n;
  if (u.kind === "saves") return s.saves >= u.n;
  if (u.kind === "matches") return matchesWon(p) >= u.n;
  if (u.kind === "stage") {
    // "stage n" = the n-th stage final won (stage ids 1…5)
    return stageWon(p, u.n);
  }
  if (u.kind === "targets") return s.targetsHit >= u.n;
  return false;
}
export const unlockedBalls = (p) => BALLS.filter((b) => ballUnlocked(p, b)).map((b) => b.id);

/**
 * Stars for a WON career match:
 *   ★ win · ★★ won inside the regulation five · ★★★ also scored every kick
 */
export function starsFor(summary) {
  if (summary.winner !== "player") return 0;
  let s = 1;
  if (!summary.suddenDeath) s = 2;
  if (s === 2 && summary.playerMissed === 0) s = 3;
  return s;
}

/**
 * Fold one finished (or abandoned) session into progress, exactly once.
 * summary: { mode, matchId?, winner?, suddenDeath?, score:[p,r], playerMissed, stats (Session.stats), playMs, finished }
 */
export function applySession(prev, summary) {
  const before = new Set(unlockedBalls(prev));
  const p = { ...prev, matches: { ...prev.matches }, stats: { ...prev.stats } };
  const s = p.stats;
  const x = summary.stats;
  s.penaltiesTaken += x.shots;
  s.goalsScored += x.goals;
  s.shotsMissed += x.missed;
  s.shotsSaved += x.savedByKeeper;
  s.penaltiesFaced += x.faced;
  s.saves += x.saves;
  s.catches += x.catches;
  s.goalsConceded += x.conceded;
  s.woodwork += x.woodwork;
  s.topCorners += x.topCorners;
  s.curledShots += x.curled;
  s.overpowered += x.overpowered;
  s.bestStreak = Math.max(s.bestStreak, x.bestStreak);
  s.targetsHit += x.targetsHit;
  s.playMs += Math.max(0, Math.round(summary.playMs || 0));
  let stars = 0;
  let firstWin = false;
  let record = null;
  if (summary.mode === "career" && summary.finished) {
    s.matchesPlayed += 1;
    if (summary.suddenDeath) s.suddenDeaths += 1;
    if (summary.winner === "player") {
      s.matchesWon += 1;
      if (x.conceded === 0 && x.faced > 0) s.cleanSheets += 1;
      const old = p.matches[summary.matchId];
      firstWin = !old;
      stars = starsFor(summary);
      record = { stars: Math.max(old?.stars || 0, stars), best: `${summary.score[0]}-${summary.score[1]}`, wins: (old?.wins || 0) + 1 };
      p.matches[summary.matchId] = record;
    } else s.matchesLost += 1;
  }
  if (summary.mode === "targets" && summary.finished) s.bestTargetScore = Math.max(s.bestTargetScore, x.targetPoints);
  if (summary.mode === "keeper" && summary.finished) s.keeperBestSaves = Math.max(s.keeperBestSaves, x.saves);
  if (summary.mode === "practice") s.practiceShots += x.shots;
  const newBalls = unlockedBalls(p).filter((id) => !before.has(id));
  return { progress: p, stars, firstWin, record, newBalls };
}
