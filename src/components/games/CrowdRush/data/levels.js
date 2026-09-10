/**
 * Crowd Rush — 50 hand-designed levels, built from a compact shorthand.
 *
 * The engine is data-driven: one <Track>, one gate system, one enemy system and
 * a small set of reusable obstacles read these configs. Nothing here is random —
 * every gate choice, obstacle and enemy count is authored, and validated by
 * `systems/validate.js` (run in dev) so every level is beatable on the best line.
 *
 * Coordinate system: the crowd runs toward +z from z=0. `x` is the horizontal
 * lane offset (track is ~±5 wide). Sections are sorted by z.
 *
 * Shorthand
 *   gt(z, [[op,val,x], ...])         a gate choice (2-3 gates side by side)
 *   ob(z, type, opts)               an obstacle
 *   en(z, count, opts)              an enemy crowd  (opts.moving -> walks at you)
 *   nr(z, length, width)           a narrowed stretch of track
 *   pk(z, amount)                   a free pickup pad (small + boost, no choice)
 *
 * finish:
 *   foe(count)        final enemy crowd
 *   boss(strength)    giant boss, milestone levels
 *   stairs([m,...])   multiplier staircase - bonus scales with crowd that reaches
 *   fort(strength)    fortress / gate push
 */

import { worldForLevel } from "./worlds.js";
import { tuneLevel } from "./tuning.js";

const OPS = { "+": "add", "-": "sub", x: "mul", "/": "div" };

function g(spec) {
  // "x2@-2.4"  ->  { operation:"mul", value:2, x:-2.4 }
  const [body, x] = spec.split("@");
  const op = OPS[body[0]];
  return { operation: op, value: Number(body.slice(1)), x: Number(x) };
}

export function gt(z, specs) {
  return { type: "gateChoice", z, gates: specs.map(g) };
}
export function ob(z, obstacle, opts = {}) {
  return { type: "obstacle", z, obstacle, ...opts };
}
export function en(z, count, opts = {}) {
  return { type: "enemy", z, count, moving: !!opts.moving, speed: opts.speed || 0 };
}
export function nr(z, length, width) {
  return { type: "narrow", z, length, width };
}
export function pk(z, amount, x = 0) {
  return { type: "pickup", z, amount, x };
}

const foe = (count) => ({ type: "enemy", count });
const boss = (strength) => ({ type: "boss", strength });
const stairs = (mults) => ({ type: "staircase", mults });
const fort = (strength) => ({ type: "fortress", strength });

/* ---------------------------------------------------------------- the levels */
/* Each entry: [startCount, sections[], finish].  World + id derived from order. */

const L = [
  /* ===================== WORLD 1 - SUNNY PARK (1-10) ===================== */
  [5, [
    gt(28, ["+10@-2.6", "+20@2.6"]),
    gt(74, ["+15@-2.6", "x2@2.6"]),
  ], foe(10)],

  [5, [
    gt(26, ["+12@-2.6", "x2@2.6"]),
    gt(70, ["+25@-2.6", "x2@2.6"]),
    gt(112, ["+30@-2.6", "x2@2.6"]),
  ], foe(22)],

  [6, [
    gt(26, ["+15@-2.6", "x2@2.6"]),
    ob(58, "rotatingBar", { speed: 1.1, arm: 3.2 }),
    gt(92, ["+20@-2.6", "x2@2.6"]),
  ], foe(24)],

  [5, [
    gt(24, ["+10@-2.8", "+18@0", "x2@2.8"]),
    gt(58, ["+20@-2.6", "x2@2.6"]),
    ob(88, "rotatingBar", { speed: 1.2, arm: 3.4 }),
    gt(116, ["+25@-2.6", "x2@2.6"]),
  ], foe(30)],

  [8, [
    gt(24, ["+16@-2.6", "x2@2.6"]),
    en(60, 14),
    gt(96, ["+30@-2.6", "x2@2.6"]),
  ], foe(28)],

  [6, [
    gt(24, ["+14@-2.6", "x2@2.6"]),
    ob(56, "movingWall", { gap: 2.2, range: 3.0, speed: 1.1 }),
    gt(92, ["+22@-2.6", "x2@2.6"]),
    en(128, 20),
  ], foe(26)],

  [7, [
    gt(24, ["+18@-2.6", "x2@2.6"]),
    gt(58, ["+24@-2.6", "x3@2.6"]),
    ob(90, "rotatingBar", { speed: 1.35, arm: 3.6 }),
    gt(122, ["+30@-2.6", "x2@2.6"]),
  ], foe(40)],

  [8, [
    gt(24, ["+18@-2.6", "x2@2.6"]),
    nr(54, 16, 2.4),
    gt(88, ["+26@-2.6", "x2@2.6"]),
    ob(120, "movingWall", { gap: 2.0, range: 3.2, speed: 1.25 }),
  ], foe(34)],

  [8, [
    gt(24, ["+20@-2.6", "x2@2.6"]),
    en(56, 16),
    gt(92, ["+28@-2.6", "x2@2.6"]),
    en(126, 24),
  ], foe(30)],

  [10, [
    gt(24, ["+20@-2.6", "x2@2.6"]),
    ob(56, "rotatingBar", { speed: 1.3, arm: 3.4 }),
    gt(88, ["+30@-2.6", "x2@2.6"]),
    en(120, 26),
    gt(150, ["+40@-2.6", "x2@2.6"]),
  ], boss(70)],

  /* ===================== WORLD 2 - CITY DASH (11-20) ===================== */
  [10, [
    gt(24, ["+22@-2.6", "x2@2.6"]),
    ob(54, "swingHammer", { side: -1, period: 1.7 }),
    gt(86, ["+30@-2.6", "x2@2.6"]),
    en(120, 30),
  ], foe(38)],

  [12, [
    gt(24, ["+24@-2.8", "x2@0", "+40@2.8"]),
    ob(56, "movingWall", { gap: 2.0, range: 3.4, speed: 1.4 }),
    gt(90, ["+34@-2.6", "x2@2.6"]),
    en(126, 34),
  ], foe(40)],

  [12, [
    gt(24, ["x2@-2.6", "x3@2.6"]),
    ob(52, "saw", { x: -1.6, sweep: 3.4, speed: 1.5 }),
    gt(86, ["+36@-2.6", "x2@2.6"]),
    ob(118, "swingHammer", { side: 1, period: 1.5 }),
    en(150, 44),
  ], foe(46)],

  [12, [
    gt(24, ["+26@-2.6", "x2@2.6"]),
    gt(52, ["+30@-2.6", "x2@2.6"]),
    nr(80, 18, 2.2),
    ob(112, "movingWall", { gap: 1.9, range: 3.4, speed: 1.5 }),
    gt(146, ["+44@-2.6", "x2@2.6"]),
  ], foe(60)],

  [14, [
    gt(24, ["+28@-2.6", "x2@2.6"]),
    en(56, 24, { moving: true, speed: 2.2 }),
    gt(92, ["+40@-2.6", "x2@2.6"]),
    en(128, 40),
  ], foe(52)],

  [12, [
    gt(24, ["x2@-2.6", "+30@2.6"]),
    ob(52, "saw", { x: 1.4, sweep: 3.6, speed: 1.7 }),
    gt(84, ["+36@-2.6", "x2@2.6"]),
    ob(114, "rotatingBar", { speed: 1.7, arm: 3.8, twin: true }),
    gt(146, ["+48@-2.6", "x2@2.6"]),
  ], boss(95)],

  [14, [
    gt(24, ["+30@-2.6", "x2@2.6"]),
    ob(52, "movingWall", { gap: 1.9, range: 3.6, speed: 1.5 }),
    ob(84, "swingHammer", { side: -1, period: 1.4 }),
    gt(116, ["+42@-2.6", "x2@2.6"]),
    en(150, 50),
  ], foe(60)],

  [14, [
    gt(24, ["+30@-2.8", "x2@0", "x3@2.8"]),
    en(58, 30),
    ob(92, "saw", { x: 0, sweep: 4.0, speed: 1.8 }),
    gt(126, ["+46@-2.6", "x2@2.6"]),
  ], stairs([1, 2, 3, 5, 8])],

  [16, [
    gt(24, ["+32@-2.6", "x2@2.6"]),
    ob(52, "rotatingBar", { speed: 1.7, arm: 3.8 }),
    gt(84, ["+40@-2.6", "x2@2.6"]),
    en(116, 44, { moving: true, speed: 2.4 }),
    gt(150, ["+52@-2.6", "x2@2.6"]),
  ], foe(66)],

  [14, [
    gt(24, ["x2@-2.6", "+34@2.6"]),
    ob(52, "movingWall", { gap: 1.8, range: 3.8, speed: 1.7 }),
    en(86, 40),
    ob(120, "swingHammer", { side: 1, period: 1.3, twin: true }),
    gt(152, ["+54@-2.6", "x3@2.6"]),
  ], boss(120)],

  /* ===================== WORLD 3 - DESERT TEMPLE (21-30) ===================== */
  [16, [
    gt(24, ["+34@-2.6", "x2@2.6"]),
    ob(52, "swingHammer", { side: -1, period: 1.5, heavy: true }),
    gt(84, ["-10@-2.6", "x2@2.6"]),
    en(120, 48),
  ], foe(58)],

  [16, [
    gt(24, ["x2@-2.6", "+40@2.6"]),
    ob(52, "fallingColumn", { x: -1.4 }),
    ob(78, "fallingColumn", { x: 1.6 }),
    gt(108, ["-14@-2.6", "x2@2.6"]),
    en(142, 54),
  ], foe(62)],

  [18, [
    gt(24, ["+36@-2.6", "x2@2.6"]),
    nr(50, 16, 1.9),
    gt(80, ["x2@-2.6", "-16@2.6"]),
    ob(112, "rotatingBar", { speed: 1.9, arm: 4.0 }),
    en(146, 58),
  ], foe(68)],

  [18, [
    gt(24, ["x2@-2.6", "+44@2.6"]),
    ob(50, "swingHammer", { side: 1, period: 1.3, heavy: true }),
    gt(82, ["-12@-2.8", "+38@0", "x2@2.8"]),
    ob(116, "fallingColumn", { x: 0 }),
    gt(148, ["+56@-2.6", "x2@2.6"]),
  ], boss(140)],

  [18, [
    gt(24, ["+38@-2.6", "x2@2.6"]),
    en(52, 44, { moving: true, speed: 2.6 }),
    gt(88, ["x2@-2.6", "-18@2.6"]),
    ob(122, "spikeRoller", { width: 3.2, speed: 2.0 }),
    gt(154, ["+58@-2.6", "x2@2.6"]),
  ], foe(74)],

  [20, [
    gt(24, ["x2@-2.6", "+46@2.6"]),
    ob(50, "rotatingBar", { speed: 2.0, arm: 4.0, twin: true }),
    nr(84, 18, 1.8),
    gt(120, ["-16@-2.6", "x2@2.6"]),
    en(152, 66),
  ], stairs([1, 2, 3, 5, 8, 12])],

  [20, [
    gt(24, ["+40@-2.6", "x2@2.6"]),
    ob(50, "fallingColumn", { x: -1.5 }),
    ob(72, "swingHammer", { side: -1, period: 1.2 }),
    gt(106, ["x2@-2.6", "-20@2.6"]),
    en(140, 70, { moving: true, speed: 2.6 }),
    gt(172, ["+62@-2.6", "x2@2.6"]),
  ], foe(80)],

  [20, [
    gt(24, ["x2@-2.6", "+48@2.6"]),
    ob(50, "spikeRoller", { width: 3.6, speed: 2.2 }),
    gt(84, ["-18@-2.8", "+44@0", "x2@2.8"]),
    ob(120, "fallingColumn", { x: 1.4 }),
    en(154, 76),
  ], foe(84)],

  [22, [
    gt(24, ["+44@-2.6", "x2@2.6"]),
    en(50, 56),
    ob(88, "rotatingBar", { speed: 2.1, arm: 4.2, twin: true }),
    gt(122, ["x2@-2.6", "-22@2.6"]),
    ob(156, "swingHammer", { side: 1, period: 1.1, heavy: true }),
    gt(184, ["+66@-2.6", "x2@2.6"]),
  ], foe(92)],

  [22, [
    gt(24, ["x2@-2.6", "+50@2.6"]),
    ob(50, "spikeRoller", { width: 4.0, speed: 2.3 }),
    en(88, 64, { moving: true, speed: 2.8 }),
    gt(124, ["-20@-2.8", "x2@0", "x3@2.8"]),
    ob(160, "fallingColumn", { x: 0 }),
  ], boss(190)],

  /* ===================== WORLD 4 - FROZEN FACTORY (31-40) ===================== */
  [22, [
    gt(24, ["+46@-2.6", "x2@2.6"]),
    ob(50, "crusher", { x: -1.4, width: 2.6, period: 1.5 }),
    gt(84, ["/2@-2.6", "x2@2.6"]),
    en(120, 70),
  ], foe(84)],

  [24, [
    gt(24, ["x2@-2.6", "+52@2.6"]),
    ob(50, "crusher", { x: 1.4, width: 2.8, period: 1.4 }),
    ob(78, "conveyor", { dir: -1, strength: 2.2 }),
    gt(112, ["/2@-2.6", "x3@2.6"]),
    en(148, 78),
  ], foe(90)],

  [24, [
    gt(24, ["+48@-2.6", "x2@2.6"]),
    ob(50, "movingWall", { gap: 1.7, range: 4.0, speed: 1.9, icy: true }),
    gt(86, ["/2@-2.8", "+50@0", "x2@2.8"]),
    ob(122, "crusher", { x: 0, width: 3.0, period: 1.3 }),
    en(156, 86),
  ], foe(96)],

  [24, [
    gt(24, ["x2@-2.6", "+54@2.6"]),
    ob(48, "conveyor", { dir: 1, strength: 2.6 }),
    ob(74, "crusher", { x: -1.5, width: 2.8, period: 1.3 }),
    gt(108, ["/2@-2.6", "x2@2.6"]),
    en(142, 90, { moving: true, speed: 2.8 }),
    gt(174, ["+70@-2.6", "x2@2.6"]),
  ], boss(230)],

  [26, [
    gt(24, ["+52@-2.6", "x2@2.6"]),
    ob(48, "spikeRoller", { width: 4.2, speed: 2.5, icy: true }),
    gt(84, ["/3@-2.6", "x3@2.6"]),
    en(120, 96),
    ob(158, "crusher", { x: 1.4, width: 3.0, period: 1.2 }),
  ], foe(104)],

  [26, [
    gt(24, ["x2@-2.6", "+58@2.6"]),
    ob(48, "conveyor", { dir: -1, strength: 3.0 }),
    ob(76, "crusher", { x: 0, width: 3.2, period: 1.2, twin: true }),
    nr(112, 18, 1.7),
    gt(146, ["/2@-2.6", "x2@2.6"]),
    en(180, 102),
  ], stairs([1, 2, 3, 5, 8, 12, 20])],

  [26, [
    gt(24, ["+56@-2.6", "x2@2.6"]),
    en(48, 84, { moving: true, speed: 3.0 }),
    ob(90, "crusher", { x: -1.5, width: 3.0, period: 1.1 }),
    gt(124, ["/2@-2.8", "x2@0", "x3@2.8"]),
    ob(160, "movingWall", { gap: 1.6, range: 4.2, speed: 2.1, icy: true }),
    gt(190, ["+78@-2.6", "x2@2.6"]),
  ], foe(118)],

  [28, [
    gt(24, ["x2@-2.6", "+62@2.6"]),
    ob(48, "spikeRoller", { width: 4.4, speed: 2.7 }),
    ob(78, "conveyor", { dir: 1, strength: 3.2 }),
    gt(114, ["/3@-2.6", "x3@2.6"]),
    en(150, 112),
    ob(186, "crusher", { x: 0, width: 3.4, period: 1.1, twin: true }),
  ], foe(126)],

  [28, [
    gt(24, ["+60@-2.6", "x2@2.6"]),
    ob(48, "crusher", { x: -1.4, width: 3.0, period: 1.1 }),
    ob(72, "crusher", { x: 1.4, width: 3.0, period: 1.1 }),
    en(110, 104),
    gt(148, ["/2@-2.6", "x2@2.6"]),
    ob(184, "conveyor", { dir: -1, strength: 3.4 }),
    gt(214, ["+84@-2.6", "x2@2.6"]),
  ], foe(134)],

  [30, [
    gt(24, ["x2@-2.6", "+68@2.6"]),
    ob(48, "spikeRoller", { width: 4.6, speed: 2.9, icy: true }),
    en(90, 118, { moving: true, speed: 3.0 }),
    gt(128, ["/3@-2.8", "x2@0", "x3@2.8"]),
    ob(166, "crusher", { x: 0, width: 3.6, period: 1.0, twin: true }),
    nr(198, 18, 1.6),
  ], boss(290)],

  /* ===================== WORLD 5 - NEON ARENA (41-50) ===================== */
  [30, [
    gt(24, ["+64@-2.6", "x2@2.6"]),
    ob(48, "rotatingBar", { speed: 2.3, arm: 4.4, twin: true }),
    gt(84, ["/2@-2.6", "x3@2.6"]),
    en(120, 120, { moving: true, speed: 3.2 }),
    gt(158, ["+90@-2.6", "x2@2.6"]),
  ], foe(140)],

  [32, [
    gt(24, ["x2@-2.8", "+70@0", "x3@2.8"]),
    ob(48, "saw", { x: 0, sweep: 4.4, speed: 2.2 }),
    ob(76, "crusher", { x: -1.5, width: 3.2, period: 1.1 }),
    gt(112, ["/2@-2.6", "x2@2.6"]),
    en(148, 132),
  ], foe(150)],

  [32, [
    gt(24, ["+68@-2.6", "x2@2.6"]),
    ob(48, "movingWall", { gap: 1.6, range: 4.4, speed: 2.2 }),
    ob(76, "swingHammer", { side: -1, period: 1.0, heavy: true }),
    gt(112, ["/3@-2.6", "x3@2.6"]),
    en(150, 140, { moving: true, speed: 3.2 }),
    gt(188, ["+100@-2.6", "x2@2.6"]),
  ], boss(340)],

  [32, [
    gt(24, ["x2@-2.6", "+74@2.6"]),
    ob(48, "spikeRoller", { width: 4.8, speed: 3.0 }),
    en(88, 128),
    ob(124, "saw", { x: 1.5, sweep: 4.6, speed: 2.4 }),
    gt(160, ["/2@-2.8", "x2@0", "x3@2.8"]),
    ob(196, "crusher", { x: 0, width: 3.8, period: 1.0, twin: true }),
  ], stairs([1, 2, 3, 5, 8, 12, 20, 30])],

  [34, [
    gt(24, ["+72@-2.6", "x2@2.6"]),
    ob(46, "rotatingBar", { speed: 2.5, arm: 4.6, twin: true }),
    ob(74, "conveyor", { dir: -1, strength: 3.4 }),
    gt(112, ["/3@-2.6", "x3@2.6"]),
    en(150, 150, { moving: true, speed: 3.4 }),
    gt(188, ["+110@-2.6", "x2@2.6"]),
  ], foe(170)],

  [34, [
    gt(24, ["x2@-2.8", "+80@0", "x3@2.8"]),
    ob(46, "crusher", { x: -1.5, width: 3.4, period: 1.0 }),
    ob(70, "crusher", { x: 1.5, width: 3.4, period: 1.0 }),
    en(112, 150),
    ob(150, "saw", { x: 0, sweep: 4.8, speed: 2.6 }),
    gt(186, ["/2@-2.6", "x2@2.6"]),
    en(220, 160, { moving: true, speed: 3.4 }),
  ], boss(400)],

  [36, [
    gt(24, ["+80@-2.6", "x2@2.6"]),
    ob(46, "spikeRoller", { width: 5.0, speed: 3.2 }),
    nr(80, 20, 1.6),
    ob(118, "movingWall", { gap: 1.5, range: 4.6, speed: 2.4 }),
    gt(154, ["/3@-2.8", "x2@0", "x3@2.8"]),
    en(192, 176, { moving: true, speed: 3.6 }),
    gt(228, ["+120@-2.6", "x2@2.6"]),
  ], foe(190)],

  [36, [
    gt(24, ["x2@-2.6", "+88@2.6"]),
    ob(46, "rotatingBar", { speed: 2.7, arm: 4.8, twin: true }),
    en(88, 168),
    ob(126, "crusher", { x: 0, width: 4.0, period: 0.95, twin: true }),
    gt(164, ["/2@-2.6", "x3@2.6"]),
    ob(200, "saw", { x: -1.5, sweep: 5.0, speed: 2.8 }),
    en(236, 180, { moving: true, speed: 3.6 }),
  ], boss(460)],

  [38, [
    gt(24, ["+90@-2.8", "x2@0", "x3@2.8"]),
    ob(46, "conveyor", { dir: 1, strength: 3.8 }),
    ob(72, "spikeRoller", { width: 5.2, speed: 3.4 }),
    en(116, 184),
    gt(154, ["/3@-2.6", "x3@2.6"]),
    ob(192, "swingHammer", { side: 1, period: 0.9, heavy: true, twin: true }),
    en(228, 190, { moving: true, speed: 3.8 }),
    gt(262, ["+140@-2.6", "x2@2.6"]),
  ], stairs([1, 2, 3, 5, 8, 12, 20, 30, 50])],

  [40, [
    gt(22, ["+100@-2.8", "x2@0", "x3@2.8"]),
    ob(44, "rotatingBar", { speed: 2.9, arm: 5.0, twin: true }),
    ob(70, "crusher", { x: -1.6, width: 4.0, period: 0.9 }),
    en(108, 200),
    gt(146, ["/3@-2.6", "x3@2.6"]),
    ob(184, "spikeRoller", { width: 5.4, speed: 3.6 }),
    nr(216, 20, 1.5),
    en(252, 210, { moving: true, speed: 4.0 }),
    gt(288, ["/2@-2.8", "x2@0", "x3@2.8"]),
    ob(324, "saw", { x: 0, sweep: 5.4, speed: 3.0 }),
  ], boss(560)],
];

/* ---------------------------------------------------------------- assemble */

function trackLength(sections, finish) {
  const lastZ = sections.reduce((m, s) => {
    const end = s.type === "narrow" ? s.z + s.length : s.z;
    return Math.max(m, end);
  }, 0);
  const runway = finish.type === "staircase" ? 90 : finish.type === "boss" ? 70 : 56;
  return Math.round(lastZ + runway);
}

export const LEVELS = L.map(([startCount, sections, finish], i) => {
  const id = i + 1;
  const w = worldForLevel(id);
  const sorted = [...sections].sort((a, b) => a.z - b.z);
  const authored = {
    id,
    world: w.id,
    worldName: w.name,
    indexInWorld: id - w.range[0] + 1,
    startCount,
    sections: sorted,
    finish,
    length: trackLength(sorted, finish),
  };
  // the tuning pass sets enemy counts + finale strength from the difficulty
  // curve so every level stays fair as gate values are edited
  return tuneLevel(authored);
});

export const TOTAL_LEVELS = LEVELS.length;
export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

export function getLevel(id) {
  return LEVEL_BY_ID[id] || LEVELS[0];
}
export function levelsForWorld(worldId) {
  return LEVELS.filter((l) => l.world === worldId);
}
