/**
 * Car Wash Studio — persistence, stars and progression.
 *
 * One namespaced, versioned key: `car-wash-studio-progress`. Loading
 * sanitizes field by field, so a malformed field falls back to its default
 * without wiping the rest. Stars only ever go up; a replay can never lower
 * a best result or re-award anything. The mid-job save (`current`) is a
 * compact downsampled surface snapshot written only at checkpoints.
 */
import { TOTAL_JOBS, getJob, TOOL_COLORS, KIT_LEVELS } from "../data/jobs.js";

const KEY = "car-wash-studio-progress";
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
  music: false,
  graphics: "medium",
  particles: true,
  assist: true,
  smoothing: true,
  reducedMotion: false,
};

export const DEFAULT_STATS = {
  jobsCompleted: 0,
  water: 0,
  foam: 0,
  panelsScrubbed: 0,
  wheelsCleaned: 0,
  windowsCleaned: 0,
  interiorsDetailed: 0,
  trashRemoved: 0,
  vacuumed: 0,
  carsPolished: 0,
  perfectJobs: 0,
  hintsUsed: 0,
  playTimeMs: 0,
};

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlocked: 1,
    jobs: {},
    settings: { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion() },
    stats: { ...DEFAULT_STATS },
    toolColor: "cream",
    current: null,
  };
}

const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

function sanitize(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== "object") return p;
  p.unlocked = Math.min(TOTAL_JOBS, Math.max(1, Math.floor(num(raw.unlocked, 1))));
  if (raw.jobs && typeof raw.jobs === "object") {
    for (const [k, v] of Object.entries(raw.jobs)) {
      const id = Number(k);
      if (!getJob(id) || !v || typeof v !== "object") continue;
      p.jobs[id] = {
        stars: Math.min(3, Math.floor(num(v.stars))),
        completed: Math.floor(num(v.completed)),
        bestClean: Math.min(1, num(v.bestClean)),
        bestTime: num(v.bestTime),
      };
    }
  }
  const s = raw.settings || {};
  for (const k of ["sound", "music", "particles", "assist", "smoothing", "reducedMotion"]) if (typeof s[k] === "boolean") p.settings[k] = s[k];
  p.settings.graphics = pick(s.graphics, ["low", "medium", "high"], p.settings.graphics);
  const st = raw.stats || {};
  for (const k of Object.keys(DEFAULT_STATS)) p.stats[k] = num(st[k]);
  p.toolColor = TOOL_COLORS.some((c) => c.id === raw.toolColor) ? raw.toolColor : "cream";
  const c = raw.current;
  if (c && typeof c === "object" && getJob(c.jobId) && c.jobId <= p.unlocked && c.data && typeof c.data === "object") {
    p.current = { jobId: c.jobId, data: c.data, view: typeof c.view === "string" ? c.view : "left" };
  }
  return p;
}

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full / blocked — try again without the bulky mid-job snapshot
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...p, current: null }));
    } catch {
      /* give up quietly */
    }
  }
}

export function totalStars(p) {
  return Object.values(p.jobs).reduce((a, j) => a + j.stars, 0);
}

export function completedCount(p) {
  return Object.values(p.jobs).filter((j) => j.completed > 0).length;
}

export function highestCompleted(p) {
  let h = 0;
  for (const [k, v] of Object.entries(p.jobs)) if (v.completed > 0) h = Math.max(h, Number(k));
  return h;
}

export function kitLevel(p) {
  const stars = totalStars(p);
  let lvl = 0;
  for (const k of KIT_LEVELS) if (stars >= k.stars) lvl = k.level;
  return lvl;
}

/** Stars never depend on speed: completion, few hints, optional detailing. */
export function computeStars(result) {
  let s = 1;
  if (result.hints <= 1 && result.cleanliness >= 0.95) s = 2;
  if (s === 2 && result.optDone >= result.optTotal) s = 3;
  return s;
}

export function applyComplete(p, jobId, result, extra) {
  const job = getJob(jobId);
  const stars = computeStars(result);
  const prev = p.jobs[jobId] || { stars: 0, completed: 0, bestClean: 0, bestTime: 0 };
  const jobs = {
    ...p.jobs,
    [jobId]: {
      stars: Math.max(prev.stars, stars),
      completed: prev.completed + 1,
      bestClean: Math.max(prev.bestClean, result.cleanliness),
      bestTime: prev.bestTime ? Math.min(prev.bestTime, result.time) : result.time,
    },
  };
  const st = { ...p.stats };
  st.jobsCompleted += 1;
  if (job.stages.includes("scrub")) st.panelsScrubbed += extra.paintPanels;
  if (job.stages.includes("wheels")) st.wheelsCleaned += extra.wheels;
  if (job.stages.includes("glass")) st.windowsCleaned += extra.windows;
  if (job.interior) st.interiorsDetailed += 1;
  if (job.stages.includes("polish")) st.carsPolished += 1;
  if (stars === 3) st.perfectJobs += 1;
  return {
    ...p,
    jobs,
    stats: st,
    unlocked: Math.min(TOTAL_JOBS, Math.max(p.unlocked, jobId + 1)),
    current: p.current && p.current.jobId === jobId ? null : p.current,
  };
}

export function addStats(p, delta) {
  const st = { ...p.stats };
  for (const [k, v] of Object.entries(delta)) if (k in st && Number.isFinite(v)) st[k] += v;
  return { ...p, stats: st };
}
