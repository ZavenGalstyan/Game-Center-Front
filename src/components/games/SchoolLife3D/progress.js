/**
 * School Life Simulator 3D — save model (localStorage).
 *
 * One key holds the whole profile: appearance, school day, level/XP,
 * grades, attendance, friendships, missions, homework, unlocks, settings and
 * a snapshot of the current day (clock, class records, player position) so
 * "Continue" resumes mid-day. Everything is validated on load so a damaged
 * or older save can't crash the game.
 */
import { DEFAULT_LOOK, STUDENTS, SUBJECT_ORDER, OUTFITS, HAIR_STYLES, HAIR_COLORS, ACCESSORIES, ACC_SLOTS, BOTTOMS, SKIN, EYE_COLORS, MAX_LEVEL } from "./data.js";

export const SAVE_KEY = "school-life-3d-save";
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = { volume: 0.8, sens: 1, invertY: false, dayLength: "normal", quality: "high", minimap: true, camDist: 1 };

export function freshSave() {
  const friends = {};
  STUDENTS.forEach((s) => (friends[s.id] = s.start));
  const grades = {};
  SUBJECT_ORDER.forEach((s) => (grades[s] = []));
  return {
    v: SAVE_VERSION,
    started: false,
    look: JSON.parse(JSON.stringify(DEFAULT_LOOK)),
    day: 1,
    level: 1,
    xp: 0,
    totalXp: 0,
    points: 30,
    rep: 50,
    happy: 60,
    grades,
    exams: [],
    att: { attended: 0, total: 0, late: 0, absent: 0, onTime: 0 },
    friends,
    met: {},
    missions: {},
    counters: {},
    flags: {},
    homework: [],
    notebook: { state: 0, spot: null },
    favor: null,
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    dayState: null,
  };
}

const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

export function sanitizeLook(l) {
  const d = DEFAULT_LOOK;
  const o = obj(l) || {};
  const acc = obj(o.acc) || {};
  const accOut = {};
  for (const s of ACC_SLOTS) {
    const a = ACCESSORIES.find((x) => x.id === acc[s]);
    accOut[s] = a && (a.slot === s || a.id === "none") ? a.id : d.acc[s];
  }
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 16) : d.name,
    body: o.body === "m" || o.body === "f" ? o.body : o.bottom === "skirt" ? "f" : d.body,
    skin: Number.isInteger(o.skin) && o.skin >= 0 && o.skin < SKIN.length ? o.skin : d.skin,
    hairStyle: HAIR_STYLES.some((h) => h.id === o.hairStyle) ? o.hairStyle : d.hairStyle,
    hairColor: HAIR_COLORS.some((h) => h.id === o.hairColor) ? o.hairColor : d.hairColor,
    eyes: Number.isInteger(o.eyes) && o.eyes >= 0 && o.eyes < EYE_COLORS.length ? o.eyes : d.eyes,
    outfit: OUTFITS.some((x) => x.id === o.outfit) ? o.outfit : d.outfit,
    bottom: BOTTOMS.some((x) => x.id === o.bottom) ? o.bottom : d.bottom,
    build: Number.isInteger(o.build) && o.build >= 0 && o.build <= 2 ? o.build : d.build,
    acc: accOut,
  };
}

export function validateSave(raw) {
  const base = freshSave();
  const s = obj(raw);
  if (!s || s.v !== SAVE_VERSION) return base;
  const out = base;
  out.started = !!s.started;
  out.look = sanitizeLook(s.look);
  out.day = Math.round(num(s.day, 1, 1, 9999));
  out.level = Math.round(num(s.level, 1, 1, MAX_LEVEL));
  out.xp = num(s.xp, 0, 0, 1e7);
  out.totalXp = num(s.totalXp, 0, 0, 1e9);
  out.points = Math.round(num(s.points, 30, 0, 1e7));
  out.rep = num(s.rep, 50, 0, 100);
  out.happy = num(s.happy, 60, 0, 100);
  const g = obj(s.grades) || {};
  for (const k of SUBJECT_ORDER) {
    out.grades[k] = Array.isArray(g[k]) ? g[k].filter((m) => obj(m) && typeof m.score === "number" && typeof m.kind === "string").map((m) => ({ key: String(m.key || ""), kind: m.kind, score: num(m.score, 0, 0, 100), day: Math.round(num(m.day, 1, 1, 9999)) })).slice(-80) : [];
  }
  out.exams = Array.isArray(s.exams) ? s.exams.filter((e) => obj(e) && typeof e.score === "number").slice(-30) : [];
  const a = obj(s.att) || {};
  out.att = { attended: num(a.attended, 0, 0), total: num(a.total, 0, 0), late: num(a.late, 0, 0), absent: num(a.absent, 0, 0), onTime: num(a.onTime, 0, 0) };
  const f = obj(s.friends) || {};
  for (const st of STUDENTS) out.friends[st.id] = num(f[st.id], st.start, 0, 100);
  out.met = obj(s.met) || {};
  const m = obj(s.missions) || {};
  out.missions = {};
  for (const k of Object.keys(m)) if (typeof m[k] === "number") out.missions[k] = m[k];
  const c = obj(s.counters) || {};
  out.counters = {};
  for (const k of Object.keys(c)) if (typeof c[k] === "number" && Number.isFinite(c[k])) out.counters[k] = c[k];
  const fl = obj(s.flags) || {};
  out.flags = {};
  for (const k of Object.keys(fl)) out.flags[k] = !!fl[k];
  out.homework = Array.isArray(s.homework) ? s.homework.filter((h) => obj(h) && SUBJECT_ORDER.includes(h.subject) && typeof h.id === "string").slice(-40) : [];
  const nb = obj(s.notebook) || {};
  out.notebook = { state: Math.round(num(nb.state, 0, 0, 3)), spot: typeof nb.spot === "string" ? nb.spot : null };
  out.favor = obj(s.favor) && typeof s.favor.npc === "string" ? s.favor : null;
  out.history = Array.isArray(s.history) ? s.history.filter(obj).slice(-30) : [];
  const st = obj(s.settings) || {};
  out.settings = {
    volume: num(st.volume, DEFAULT_SETTINGS.volume, 0, 1),
    sens: num(st.sens, 1, 0.3, 3),
    invertY: !!st.invertY,
    dayLength: ["short", "normal", "long"].includes(st.dayLength) ? st.dayLength : "normal",
    quality: ["low", "medium", "high"].includes(st.quality) ? st.quality : "high",
    minimap: st.minimap !== false,
    camDist: num(st.camDist, 1, 0.6, 1.6),
  };
  out.dayState = obj(s.dayState) && s.dayState.day === out.day && typeof s.dayState.time === "number" ? s.dayState : null;
  return out;
}

export function loadSave(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return freshSave();
    return validateSave(JSON.parse(raw));
  } catch {
    return freshSave();
  }
}
export function writeSave(storage, save) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
export const hasProgress = (save) => !!save && save.started;
