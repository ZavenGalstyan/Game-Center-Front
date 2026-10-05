/**
 * Train Commander — persistence under ONE key: `train-commander-progress`.
 *
 *   { version, unlockedRoute, routeStars, unlockedModules, cosmetics,
 *     selectedCosmetic, settings, statistics, lastRoute, tutorialDone }
 *
 * Versioned; every field is sanitised on load, so a corrupted, partial or
 * hand-edited save falls back field by field and never crashes the Game
 * Center (and a valid save is never wiped). Written only on discrete events
 * (route finished, settings/livery changed). The Game Center Restart never
 * touches it.
 */
import { ROUTES, modulesForRoute } from "../data/routes.js";
import { LIVERIES } from "../data/cosmetics.js";

export const KEY = "train-commander-progress";
export const SAVE_VERSION = 1;
const LAST = ROUTES.length;

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
  shadows: true,
  cameraMotion: true,
  cameraShake: true,
  damageNumbers: true,
  reducedMotion: false,
  speed: 1,
};

export const STAT_KEYS = [
  "routesPlayed",
  "routesCompleted",
  "routesFailed",
  "distance",
  "enemiesDefeated",
  "vehiclesDestroyed",
  "bossesDefeated",
  "scrapEarned",
  "scrapSpent",
  "modulesBuilt",
  "modulesUpgraded",
  "repairs",
  "wagonsLost",
  "perfectRoutes",
  "builtGunner",
  "builtCannon",
  "builtLancer",
  "builtRepair",
  "playTime",
];

const BUILT_KEY = { gunner: "builtGunner", cannon: "builtCannon", lancer: "builtLancer", repair: "builtRepair" };

/** liveries unlocked by clearing a route (cosmetic only) */
export function liveriesFor(stars) {
  const cleared = Math.max(0, ...Object.keys(stars).map(Number).filter((id) => stars[id] > 0), 0);
  return LIVERIES.filter((l) => cleared >= l.unlock.route).map((l) => l.id);
}

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlockedRoute: 1,
    routeStars: {},
    unlockedModules: modulesForRoute(1),
    cosmetics: ["classic"],
    selectedCosmetic: "classic",
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    statistics: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    lastRoute: 1,
    tutorialDone: false,
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  if (raw.routeStars && typeof raw.routeStars === "object") {
    for (const r of ROUTES) {
      const s = Math.min(3, int(raw.routeStars[r.id]));
      if (s >= 1) p.routeStars[r.id] = s;
    }
  }
  // the unlocked route can never be behind what the stars prove was cleared
  let cleared = 0;
  for (const r of ROUTES) if (p.routeStars[r.id]) cleared = Math.max(cleared, r.id);
  p.unlockedRoute = Math.max(1, Math.min(LAST, Math.max(int(raw.unlockedRoute, 1), Math.min(LAST, cleared + 1))));
  p.unlockedModules = modulesForRoute(p.unlockedRoute);
  if (p.unlockedRoute > 1 || cleared >= 1) {
    // route 1 hands out the cannon at its second checkpoint
    if (!p.unlockedModules.includes("cannon")) p.unlockedModules.push("cannon");
  }
  p.cosmetics = liveriesFor(p.routeStars);
  p.selectedCosmetic = p.cosmetics.includes(raw.selectedCosmetic) ? raw.selectedCosmetic : "classic";
  const st = raw.statistics && typeof raw.statistics === "object" ? raw.statistics : {};
  for (const k of STAT_KEYS) p.statistics[k] = int(st[k]);
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sound: bool(s.sound, true),
    music: bool(s.music, true),
    graphics: pick(s.graphics, ["low", "medium", "high"], "medium"),
    particles: bool(s.particles, true),
    shadows: bool(s.shadows, true),
    cameraMotion: bool(s.cameraMotion, true),
    cameraShake: bool(s.cameraShake, true),
    damageNumbers: bool(s.damageNumbers, true),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
    speed: pick(s.speed, [1, 2], 1),
  };
  p.lastRoute = ROUTES.some((r) => r.id === raw.lastRoute) && raw.lastRoute <= p.unlockedRoute ? raw.lastRoute : 1;
  p.tutorialDone = bool(raw.tutorialDone, false);
  return p;
}

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full / blocked — the game keeps working without saving */
  }
}

export const isUnlocked = (p, id) => id >= 1 && id <= p.unlockedRoute && id <= LAST;
export const totalStars = (p) => Object.values(p.routeStars).reduce((a, s) => a + s, 0);
export const regionStars = (p, region) => ROUTES.filter((r) => r.region === region).reduce((a, r) => a + (p.routeStars[r.id] || 0), 0);
/** the route PLAY should start: first unlocked route without stars, else the last played */
export function nextRouteId(p) {
  for (const r of ROUTES) if (isUnlocked(p, r.id) && !p.routeStars[r.id]) return r.id;
  return p.lastRoute || 1;
}
export function favoriteModule(stats) {
  const list = Object.entries(BUILT_KEY).map(([id, k]) => [id, stats[k] || 0]);
  list.sort((a, b) => b[1] - a[1]);
  return list[0][1] > 0 ? list[0][0] : null;
}

/** Fold a finished (or abandoned) route into the save. Pure. */
export function applyResult(prev, summary) {
  const p = JSON.parse(JSON.stringify(prev));
  const r = summary.run;
  const s = p.statistics;
  s.routesPlayed++;
  s.distance += Math.round(r.distance);
  s.enemiesDefeated += r.kills;
  s.vehiclesDestroyed += r.vehicles;
  s.bossesDefeated += r.bosses;
  s.scrapEarned += Math.max(0, Math.round(r.scrapEarned));
  s.scrapSpent += Math.round(r.scrapSpent);
  s.modulesBuilt += r.built;
  s.modulesUpgraded += r.upgrades;
  s.repairs += r.repairs;
  s.wagonsLost += r.wagonsLost;
  for (const [id, k] of Object.entries(BUILT_KEY)) s[k] += r.builtByType[id] || 0;
  s.playTime += Math.round(r.time);
  p.lastRoute = summary.routeId;
  let firstClear = false;
  let improved = false;
  let unlockedRoute = null;
  let newLivery = null;
  if (summary.result === "won") {
    s.routesCompleted++;
    if (summary.stars === 3 && r.wagonsLost === 0) s.perfectRoutes++;
    const old = p.routeStars[summary.routeId] || 0;
    firstClear = !old;
    improved = summary.stars > old;
    p.routeStars[summary.routeId] = Math.max(old, summary.stars);
    if (summary.routeId + 1 <= LAST && p.unlockedRoute < summary.routeId + 1) {
      p.unlockedRoute = summary.routeId + 1;
      unlockedRoute = p.unlockedRoute;
    }
    const mods = modulesForRoute(p.unlockedRoute);
    if (!mods.includes("cannon")) mods.push("cannon");
    p.unlockedModules = mods;
    const before = new Set(p.cosmetics);
    p.cosmetics = liveriesFor(p.routeStars);
    newLivery = p.cosmetics.find((c) => !before.has(c)) || null;
  } else if (summary.result === "lost") s.routesFailed++;
  return { progress: p, firstClear, improved, unlockedRoute, newLivery };
}
