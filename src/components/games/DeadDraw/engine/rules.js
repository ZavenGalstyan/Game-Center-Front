/**
 * Core state + helpers shared by cards and days. Framework-free: the whole
 * game runs headless under Node (tools/simTest.mjs).
 *
 * Resources are integers clamped to [0, cap]. A cost is only ever paid when
 * it can be paid in full; shortfalls (daily consumption you cannot cover)
 * never go negative — they turn into explicit Health penalties instead.
 */
export const CAPS = { hp: 100, food: 12, water: 12, power: 12, scrap: 10 };
export const RES = ["hp", "food", "water", "power", "scrap"];
export const MAX_THREAT = 10;
export const MAX_FORTIFY = 3;

/** mulberry32 over a numeric state stored in S.rng, so saves are deterministic. */
export function rngOf(S) {
  return () => {
    S.rng = (S.rng + 0x6d2b79f5) | 0;
    let t = S.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function note(S, k, d) {
  if (!d) return;
  S.fx = S.fx || {};
  S.fx[k] = (S.fx[k] || 0) + d;
}

/** Add resources (negative values remove, never below zero). Returns the real deltas. */
export function gain(S, delta) {
  const out = {};
  for (const [k, v] of Object.entries(delta)) {
    if (!v) continue;
    const before = S.res[k];
    S.res[k] = clamp(before + v, 0, CAPS[k]);
    out[k] = S.res[k] - before;
    note(S, k, out[k]);
  }
  return out;
}

export function hurt(S, n, cause) {
  if (n <= 0) return 0;
  const before = S.res.hp;
  S.res.hp = clamp(before - Math.round(n), 0, CAPS.hp);
  const d = before - S.res.hp;
  note(S, "hp", -d);
  S.stats.damage += d;
  if (S.res.hp <= 0 && !S.cause) S.cause = cause || "wounds";
  return d;
}

export function heal(S, n) {
  const before = S.res.hp;
  S.res.hp = clamp(before + n, 0, CAPS.hp);
  note(S, "hp", S.res.hp - before);
}

export function addThreat(S, n) {
  const before = S.threat;
  S.threat = clamp(S.threat + n, 0, MAX_THREAT);
  note(S, "threat", S.threat - before);
}

export function addDefense(S, n) {
  S.defense = Math.max(-2, S.defense + n);
  note(S, "defense", n);
}

export function canPay(S, cost) {
  return Object.entries(cost || {}).every(([k, v]) => S.res[k] >= v);
}

export function pay(S, cost) {
  if (!canPay(S, cost)) return false;
  for (const [k, v] of Object.entries(cost || {})) gain(S, { [k]: -v });
  return true;
}

/** Total defence for tonight: tonight's cards + permanent fortification + companion. */
export function totalDefense(S) {
  return Math.max(0, S.defense + S.fortify + (S.companion ? 1 : 0));
}

/** Take the collected fx deltas (and reset them). */
export function takeFx(S) {
  const f = S.fx || {};
  S.fx = {};
  return f;
}
