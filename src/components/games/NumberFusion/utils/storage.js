/**
 * Number Fusion — localStorage persistence. One namespaced key:
 * `number-fusion-progress`. Every read is sanitized so a corrupt or older
 * save never crashes a newer build — an invalid board is simply dropped
 * (starts a fresh game), never the best score or settings.
 */
const KEY = "number-fusion-progress";
const SAVE_VERSION = 1;
export const SIZE = 4;

export const DEFAULT_SETTINGS = {
  sound: true,
  reducedMotion: false,
};

export function defaultState() {
  return {
    saveVersion: SAVE_VERSION,
    bestScore: 0,
    board: null, // { cells, score, size } — resume-on-refresh for the current game
    settings: { ...DEFAULT_SETTINGS },
    statistics: {
      gamesPlayed: 0,
      totalMoves: 0,
      totalMerges: 0,
      highestTile: 0,
      wins: 0,
    },
  };
}

function readJSON() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
function writeJSON(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — session just won't persist */
  }
}

function sanitizeBoard(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.cells) || raw.cells.length !== SIZE) return null;
  for (const row of raw.cells) {
    if (!Array.isArray(row) || row.length !== SIZE) return null;
    for (const cell of row) {
      if (cell === null) continue;
      if (typeof cell !== "object" || !Number.isFinite(cell.value) || cell.value <= 0) return null;
    }
  }
  if (!Number.isFinite(raw.score) || raw.score < 0) return null;
  return { cells: raw.cells, score: Math.floor(raw.score) };
}

export function loadState() {
  const raw = readJSON();
  const def = defaultState();
  if (!raw || typeof raw !== "object") return def;

  const bestScore = Number.isFinite(raw.bestScore) ? Math.max(0, Math.floor(raw.bestScore)) : 0;
  const settings = {
    sound: raw.settings ? Boolean(raw.settings.sound ?? true) : true,
    reducedMotion: raw.settings ? Boolean(raw.settings.reducedMotion) : false,
  };
  const rawStats = raw.statistics && typeof raw.statistics === "object" ? raw.statistics : {};
  const statistics = { ...def.statistics };
  for (const k of Object.keys(def.statistics)) {
    statistics[k] = Number.isFinite(rawStats[k]) ? Math.max(0, Math.floor(rawStats[k])) : 0;
  }

  return {
    saveVersion: SAVE_VERSION,
    bestScore,
    board: sanitizeBoard(raw.board),
    settings,
    statistics,
  };
}

export function saveState(state) {
  writeJSON(state);
}
