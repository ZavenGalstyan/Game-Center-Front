/**
 * Urban Skate Rush — localStorage persistence
 *
 * Handles saving and loading game progress with versioning.
 */

const STORAGE_KEY = "urban-skate-rush-progress";
const VERSION = 1;

const DEFAULT_PROGRESS = {
  version: VERSION,
  // Mission progress
  completed: {}, // { missionId: { stars, bestScore, bestCombo } }
  lastMission: null,
  // Currency
  coins: 0,
  // Unlocks
  purchasedBoards: [],
  purchasedOutfits: [],
  unlockedDistricts: [1],
  // Current selections
  selectedBoard: "street-classic",
  selectedOutfit: "default",
  // Statistics
  totalScore: 0,
  totalTricks: 0,
  totalGrinds: 0,
  totalGrindDistance: 0,
  bestCombo: 0,
  bestSingleScore: 0,
  playTime: 0,
  // Settings
  settings: {
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    cameraSensitivity: 1.0,
    cameraDistance: 1.0,
    showControls: true,
    reducedMotion: false,
    graphics: "high",
  },
};

function sanitize(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROGRESS };

  const p = { ...DEFAULT_PROGRESS };

  // Version migration
  if (typeof raw.version === "number") {
    p.version = raw.version;
  }

  // Mission progress
  if (raw.completed && typeof raw.completed === "object") {
    p.completed = {};
    for (const [id, data] of Object.entries(raw.completed)) {
      const mId = parseInt(id, 10);
      if (mId >= 1 && mId <= 30 && typeof data === "object") {
        p.completed[mId] = {
          stars: Math.min(3, Math.max(0, parseInt(data.stars, 10) || 0)),
          bestScore: Math.max(0, parseInt(data.bestScore, 10) || 0),
          bestCombo: Math.max(0, parseInt(data.bestCombo, 10) || 0),
        };
      }
    }
  }

  if (typeof raw.lastMission === "number" && raw.lastMission >= 1 && raw.lastMission <= 30) {
    p.lastMission = raw.lastMission;
  }

  // Currency
  if (typeof raw.coins === "number") {
    p.coins = Math.max(0, Math.floor(raw.coins));
  }

  // Unlocks
  if (Array.isArray(raw.purchasedBoards)) {
    p.purchasedBoards = raw.purchasedBoards.filter((b) => typeof b === "string");
  }
  if (Array.isArray(raw.purchasedOutfits)) {
    p.purchasedOutfits = raw.purchasedOutfits.filter((o) => typeof o === "string");
  }
  if (Array.isArray(raw.unlockedDistricts)) {
    p.unlockedDistricts = raw.unlockedDistricts.filter((d) => typeof d === "number" && d >= 1 && d <= 5);
    if (!p.unlockedDistricts.includes(1)) p.unlockedDistricts.unshift(1);
  }

  // Selections
  if (typeof raw.selectedBoard === "string") {
    p.selectedBoard = raw.selectedBoard;
  }
  if (typeof raw.selectedOutfit === "string") {
    p.selectedOutfit = raw.selectedOutfit;
  }

  // Statistics
  if (typeof raw.totalScore === "number") p.totalScore = Math.max(0, raw.totalScore);
  if (typeof raw.totalTricks === "number") p.totalTricks = Math.max(0, raw.totalTricks);
  if (typeof raw.totalGrinds === "number") p.totalGrinds = Math.max(0, raw.totalGrinds);
  if (typeof raw.totalGrindDistance === "number") p.totalGrindDistance = Math.max(0, raw.totalGrindDistance);
  if (typeof raw.bestCombo === "number") p.bestCombo = Math.max(0, raw.bestCombo);
  if (typeof raw.bestSingleScore === "number") p.bestSingleScore = Math.max(0, raw.bestSingleScore);
  if (typeof raw.playTime === "number") p.playTime = Math.max(0, raw.playTime);

  // Settings
  if (raw.settings && typeof raw.settings === "object") {
    const s = raw.settings;
    if (typeof s.master === "number") p.settings.master = Math.max(0, Math.min(1, s.master));
    if (typeof s.music === "number") p.settings.music = Math.max(0, Math.min(1, s.music));
    if (typeof s.sfx === "number") p.settings.sfx = Math.max(0, Math.min(1, s.sfx));
    if (typeof s.cameraSensitivity === "number") p.settings.cameraSensitivity = Math.max(0.1, Math.min(2, s.cameraSensitivity));
    if (typeof s.cameraDistance === "number") p.settings.cameraDistance = Math.max(0.5, Math.min(1.5, s.cameraDistance));
    if (typeof s.showControls === "boolean") p.settings.showControls = s.showControls;
    if (typeof s.reducedMotion === "boolean") p.settings.reducedMotion = s.reducedMotion;
    if (["low", "medium", "high"].includes(s.graphics)) p.settings.graphics = s.graphics;
  }

  return p;
}

export function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return sanitize(raw);
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or unavailable
  }
}

export function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULT_PROGRESS };
}

export function isUnlocked(progress, missionId) {
  if (missionId === 1) return true; // First mission always unlocked

  // Previous mission must be completed
  const prevId = missionId - 1;
  return !!progress.completed[prevId];
}

export function nextUnlockedMission(progress) {
  // Find the first incomplete unlocked mission
  for (let id = 1; id <= 30; id++) {
    if (!progress.completed[id] && isUnlocked(progress, id)) {
      return id;
    }
  }
  // All completed - return last mission
  return 30;
}

export function calculateStars(score, thresholds) {
  if (score >= thresholds.three) return 3;
  if (score >= thresholds.two) return 2;
  if (score >= thresholds.one) return 1;
  return 0;
}

export function getTotalStars(progress) {
  let total = 0;
  for (const data of Object.values(progress.completed)) {
    total += data.stars || 0;
  }
  return total;
}

export function getCompletedMissionCount(progress) {
  return Object.keys(progress.completed).length;
}
