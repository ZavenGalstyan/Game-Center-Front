/**
 * Water Tanks — level compiler. Authored data (data/levels.js) uses tank
 * letters and short flags; the game and solver use indices. Compiling is pure
 * and memoised so the same compiled object (and solver cache) is reused.
 *
 * Authored form:
 *   { name, tip?, tanks: [{ cap, start?, shape?, fill?, drain?, lock?, inlet? }],
 *     target: 4 | "B:4" | ["A:4", "C:2"] | [4, 4],
 *     valves?: ["A>B"], optimal }
 *   fill / drain: true (unlimited) or a number of uses
 *   lock: "A:3"  — sealed until tank A holds exactly 3 L
 *   inlet: true  — this tank can receive but never pour out
 */

export const LETTERS = "ABCDEF";
export const SHAPES = ["tall", "standard", "wide", "jar", "flask"];

function uses(v) {
  if (v === true) return Infinity;
  if (Number.isInteger(v) && v > 0) return v;
  return 0;
}

function parseRef(str, field) {
  const m = /^([A-F]):(\d+)$/.exec(String(str));
  if (!m) throw new Error(`bad ${field} "${str}"`);
  return { tank: LETTERS.indexOf(m[1]), amount: Number(m[2]) };
}

function parseTarget(t) {
  if (typeof t === "number") return { tank: null, amount: t };
  return parseRef(t, "target");
}

const compiled = new Map();

export function compileLevel(raw, meta = {}) {
  const tanks = raw.tanks.map((t, i) => ({
    id: LETTERS[i],
    index: i,
    capacity: t.cap,
    initial: t.start ?? 0,
    shape: t.shape || "standard",
    fill: uses(t.fill),
    drain: uses(t.drain),
    lock: t.lock ? parseRef(t.lock, "lock") : null,
    pourOut: !t.inlet,
  }));
  const targetList = Array.isArray(raw.target) ? raw.target : [raw.target];
  const valves = (raw.valves || []).map((v) => {
    const m = /^([A-F])>([A-F])$/.exec(v);
    if (!m) throw new Error(`bad valve "${v}"`);
    return { from: LETTERS.indexOf(m[1]), to: LETTERS.indexOf(m[2]) };
  });
  return {
    id: meta.id ?? raw.id,
    chapter: meta.chapter ?? raw.chapter ?? 1,
    name: raw.name,
    tip: raw.tip || null,
    tanks,
    targets: targetList.map(parseTarget),
    valves,
    optimalMoves: raw.optimal ?? null,
    difficulty: raw.difficulty ?? null,
  };
}

/** Memoised compile for campaign levels (stable identity → solver cache hits). */
export function compileCampaignLevel(raw, id, chapter) {
  if (!compiled.has(id)) compiled.set(id, compileLevel(raw, { id, chapter }));
  return compiled.get(id);
}

export const tankName = (level, i) => `${level.tanks[i].id}`;

/** Short human description of a target, e.g. "4 L" or "B = 4 L". */
export function targetLabel(level, t) {
  return t.tank === null ? `${t.amount} L` : `${level.tanks[t.tank].id} = ${t.amount} L`;
}
