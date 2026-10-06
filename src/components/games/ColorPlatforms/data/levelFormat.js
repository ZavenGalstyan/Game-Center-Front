/**
 * Color Platforms — compact level notation → runtime level config, plus the
 * development validator.
 *
 * A level is written as data (never as a component):
 *
 *   {
 *     name, color: "B",                // start / respawn color (default B)
 *     s:  [x, y],                      // spawn — feet position
 *     f:  [x, y],                      // finish portal — feet position
 *     cp: [x, y],                      // optional checkpoint (on a static Neutral platform)
 *     p:  [[x, y, w, c, opts], …],     // platforms, c = B | R | Y | N | J (bounce, neutral)
 *     st: [[x, y, at?], …],            // exactly 3 stars; `at` = platform index the
 *                                      //   route bot lands on while collecting it
 *     k:  [[x, y, w], …],              // spikes standing on y
 *     saw:[[x, y, r, move], …],        // spike balls (optionally moving)
 *     hints: [{ x0, x1, keys, alt, color, until }],   // contextual tutorial hints
 *     tut: "basics",                   // tutorial flag saved once the level is cleared
 *   }
 *
 * opts: { mx, my, t, ph }  moving: offset (mx, my) over a ping-pong period t (s), phase ph (0..1)
 *       { f, fb }          fading: disappears f s after a valid landing, returns after fb s (0 = never)
 *       { skip }           off the bot's route (detours, drop-through decoys)
 *       { w2 }             (unused) reserved
 *
 * Platforms are listed in route order; the headless bot (engine/bot.js)
 * visits them in that order, which is how every level is proven finishable.
 */
import { BLUE, RED, YELLOW, NEUTRAL, PLATFORM_COLORS, PLATFORM_TYPES, PHYS } from "../engine/constants.js";

const C = { B: BLUE, R: RED, Y: YELLOW, N: NEUTRAL, J: NEUTRAL };

function compileMove(o) {
  if (!o || (!o.mx && !o.my)) return null;
  return { dx: o.mx || 0, dy: o.my || 0, period: o.t || 3, phase: o.ph || 0 };
}

export function compileLevel(def, id, chapter) {
  const platforms = def.p.map(([x, y, w, c, o = {}], i) => ({
    id: i,
    x,
    y,
    w,
    h: o.h || PHYS.PLAT_H,
    code: c,
    color: C[c],
    type: c === "J" ? "bounce" : "normal",
    move: compileMove(o),
    fade: o.f ? { stay: o.f, back: o.fb ?? 2.6 } : null,
    skip: !!o.skip,
  }));
  const hazards = [
    ...(def.k || []).map(([x, y, w]) => ({ kind: "spikes", x, y, w })),
    ...(def.saw || []).map(([x, y, r, o]) => ({ kind: "saw", x, y, r: r || 16, move: compileMove(o) })),
  ];
  const stars = (def.st || []).map(([x, y, at]) => ({ x, y, at: at ?? null }));

  let minX = def.s[0];
  let maxX = def.f[0];
  let minY = def.s[1];
  let maxY = def.s[1];
  for (const p of platforms) {
    const mx = p.move ? p.move.dx : 0;
    const my = p.move ? p.move.dy : 0;
    minX = Math.min(minX, p.x, p.x + mx);
    maxX = Math.max(maxX, p.x + p.w, p.x + p.w + mx);
    minY = Math.min(minY, p.y, p.y + my);
    maxY = Math.max(maxY, p.y, p.y + my);
  }
  for (const s of stars) minY = Math.min(minY, s.y);
  minY = Math.min(minY, def.f[1] - 160);

  return {
    id,
    chapter,
    name: def.name,
    startColor: C[def.color || "B"],
    spawn: { x: def.s[0], y: def.s[1] },
    finish: { x: def.f[0], y: def.f[1] },
    checkpoint: def.cp ? { x: def.cp[0], y: def.cp[1] } : null,
    platforms,
    hazards,
    stars,
    hints: def.hints || [],
    tut: def.tut || null,
    bounds: { minX: minX - 260, maxX: maxX + 260, minY: minY - 120, maxY, killY: maxY + 460 },
  };
}

/** Pure position of a moving thing at sim time t (deterministic, no drift). */
export function moveOffset(move, t, out) {
  if (!move) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const k = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (t / move.period + move.phase));
  out.x = move.dx * k;
  out.y = move.dy * k;
  return out;
}

/** Lightweight DEV validation — returns a list of problems (empty = ok). */
export function validateLevel(L) {
  const errs = [];
  const at = (m) => errs.push(`L${L.id} ${L.name}: ${m}`);
  if (!L.name) at("missing name");
  if (!L.spawn || !Number.isFinite(L.spawn.x) || !Number.isFinite(L.spawn.y)) at("missing spawn");
  if (!L.finish || !Number.isFinite(L.finish.x) || !Number.isFinite(L.finish.y)) at("missing finish");
  if (!L.platforms.length) at("no platforms");
  if (L.stars.length !== 3) at(`expected 3 stars, found ${L.stars.length}`);
  if (!PLATFORM_COLORS.includes(L.startColor) || L.startColor === NEUTRAL) at(`bad start color ${L.startColor}`);
  const onStatic = (pt, needNeutral) =>
    L.platforms.some(
      (p) => !p.move && !p.fade && p.type === "normal" && (!needNeutral || p.color === NEUTRAL) && Math.abs(p.y - pt.y) < 0.5 && pt.x >= p.x - 2 && pt.x <= p.x + p.w + 2
    );
  if (L.spawn && !onStatic(L.spawn, true)) at("spawn is not on a static Neutral platform");
  if (L.finish && !onStatic(L.finish, false)) at("finish is not on a static platform");
  if (L.checkpoint && !onStatic(L.checkpoint, true)) at("checkpoint is not on a static Neutral platform");
  for (const p of L.platforms) {
    if (!PLATFORM_COLORS.includes(p.color)) at(`platform ${p.id}: unsupported color ${p.color}`);
    if (!PLATFORM_TYPES.includes(p.type)) at(`platform ${p.id}: unsupported type ${p.type}`);
    if (p.type === "bounce" && p.color !== NEUTRAL) at(`platform ${p.id}: bounce must be Neutral`);
    if (!(p.w >= 40) || !(p.h > 0)) at(`platform ${p.id}: bad size ${p.w}x${p.h}`);
    if (p.move && !(p.move.period > 0.5)) at(`platform ${p.id}: bad move period`);
    if (p.fade && !(p.fade.stay >= 0.3)) at(`platform ${p.id}: bad fade time`);
  }
  for (const s of L.stars) if (s.at != null && !L.platforms[s.at]) at(`star at unknown platform ${s.at}`);
  for (const h of L.hazards) {
    if (h.kind === "spikes" && !(h.w >= 16)) at("spikes too narrow");
    if (h.kind === "saw" && h.move && !(h.move.period > 0.5)) at("bad saw period");
  }
  return errs;
}
