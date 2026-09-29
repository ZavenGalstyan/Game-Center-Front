/**
 * Stack Tower — persistence under ONE namespaced, versioned key:
 * `stack-tower-progress`. Nothing else in localStorage is touched.
 *
 * Loading sanitises field by field: a missing / corrupt field falls back to
 * its default without wiping the rest; unknown future versions are read
 * best-effort. Saves happen on discrete events only (run end, theme or
 * setting change) — never per frame.
 */
import { THEMES } from "../data/themes.js";

const KEY = "stack-tower-progress";
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
  particles: true,
  cameraMotion: true,
  reducedMotion: false,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    bestHeight: 0,
    totalRuns: 0,
    totalBlocks: 0,
    totalPerfects: 0,
    bestPerfectStreak: 0,
    totalCutPieces: 0,
    selectedTheme: "skyline",
    unlockedThemes: ["skyline"],
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    totalPlayTime: 0, // ms
  };
}

const int = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);

export function themesForHeight(best) {
  return THEMES.filter((t) => best >= t.unlock).map((t) => t.id);
}

export function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  p.bestHeight = int(raw.bestHeight);
  p.totalRuns = int(raw.totalRuns);
  p.totalBlocks = Math.max(int(raw.totalBlocks), p.bestHeight);
  p.totalPerfects = int(raw.totalPerfects);
  p.bestPerfectStreak = int(raw.bestPerfectStreak);
  p.totalCutPieces = int(raw.totalCutPieces);
  p.totalPlayTime = int(raw.totalPlayTime);
  // unlocks are derived from best height too, so a corrupt list self-repairs
  const listed = Array.isArray(raw.unlockedThemes) ? raw.unlockedThemes.filter((id) => THEMES.some((t) => t.id === id)) : [];
  p.unlockedThemes = [...new Set(["skyline", ...listed, ...themesForHeight(p.bestHeight)])];
  p.selectedTheme = p.unlockedThemes.includes(raw.selectedTheme) ? raw.selectedTheme : "skyline";
  const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  p.settings = {
    sound: bool(s.sound, p.settings.sound),
    music: bool(s.music, p.settings.music),
    graphics: ["low", "medium", "high"].includes(s.graphics) ? s.graphics : p.settings.graphics,
    particles: bool(s.particles, p.settings.particles),
    cameraMotion: bool(s.cameraMotion, p.settings.cameraMotion),
    reducedMotion: bool(s.reducedMotion, p.settings.reducedMotion),
  };
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
    window.localStorage.setItem(KEY, JSON.stringify({ ...p, version: SAVE_VERSION }));
  } catch {
    /* storage full / blocked — progress simply isn't persisted */
  }
}

/**
 * Fold one finished run into progress. Returns { progress, newBest, unlocked }.
 * run = { height, perfects, bestStreak, cuts, playMs }
 */
export function applyRun(prev, run) {
  const p = { ...prev };
  p.totalRuns += 1;
  p.totalBlocks += run.height;
  p.totalPerfects += run.perfects;
  p.totalCutPieces += run.cuts;
  p.totalPlayTime += Math.max(0, Math.round(run.playMs));
  p.bestPerfectStreak = Math.max(p.bestPerfectStreak, run.bestStreak);
  const newBest = run.height > prev.bestHeight;
  if (newBest) p.bestHeight = run.height;
  const before = new Set(prev.unlockedThemes);
  p.unlockedThemes = [...new Set([...prev.unlockedThemes, ...themesForHeight(p.bestHeight)])];
  const unlocked = p.unlockedThemes.filter((id) => !before.has(id));
  return { progress: p, newBest, unlocked };
}
