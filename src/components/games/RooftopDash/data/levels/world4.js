/**
 * World 4 — NEON CITY, levels 31–40. Night, wet roofs, soft neon.
 * Focus: faster routes, dash chains, moving signs (platforms sliding
 * across gaps), electric boxes, steam, complex wall-run chains, precision.
 */
import { course } from "../kit.js";
import { shortcutFinish, boxStar } from "./patterns.js";

const mk = (id, name) => course({ id, name, world: 4, streetY: -60 });

/* reusable neon phrases */
const dashGap = (c, gap = 7.0, next = {}) => {
  c.under({ a: 0.6, b: gap - 0.6, w: 8, dy: -3 });
  c.roof({ gap, len: 12, w: 10, style: "tower", how: "dashJump", dashAt: 0.24, ...next });
};
const wallGap = (c, side, next = {}) => {
  c.wallrun({ side, from: -3, to: 9.2, off: 1.5, h: 6, look: "billboard" });
  c.roof({ gap: 8.8, len: 12, w: 10, style: "office", how: "wallrun", side, lineV: side === "left" ? 0.5 : -0.5, ...next });
};
const wallJumpGap = (c, side, toV, next = {}) => {
  const s = side === "left" ? 1 : -1;
  c.wallrun({ side, from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: s * 0.4 });
  c.roof({ gap: 7.2, len: 12, w: 6, v: toV, style: "tower", how: "wallrun", side, lineV: s * 0.8, wjAt: 3.4, ...next });
};

/* 31 — NEON NIGHTS: sprint line with dash gaps */
function l31() {
  const c = mk(31, "Neon Nights");
  c.start({ len: 16, w: 11, style: "tower" });
  c.roof({ gap: 5.0, len: 12, w: 10, style: "office", how: "sprintJump" });
  dashGap(c, 7.0);
  c.checkpoint(2);
  c.starAhead(-8, 0, 1.2, "main");
  c.vault(6, { h: 0.85, w: 10 });
  c.roof({ gap: 5.0, len: 14, w: 10, style: "office", how: "sprintJump" });
  boxStar(c, 8.5, 3.4);
  dashGap(c, 7.2);
  c.checkpoint(2);
  c.pipe(4, { w: 10 });
  wallGap(c, "left");
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 32 — LIVE WIRE: electric boxes arcing across the lane */
function l32() {
  const c = mk(32, "Live Wire");
  c.start({ len: 16, w: 11, style: "office" });
  c.hazard("zap", 9, 0, { period: 2.6, wait: true, r: 1.1 });
  c.prop("acBig", 9, 4.2, { turn90: true });
  c.prop("acBig", 9, -4.2, { turn90: true });
  c.roof({ gap: 3.0, len: 14, w: 10, style: "tower" });
  c.vault(5, { h: 0.85, w: 10 });
  c.hazard("zap", 10, 0, { period: 2.4, phase: 0.4, wait: true, r: 1.1 });
  c.roof({ gap: 4.8, len: 14, w: 10, style: "office", how: "sprintJump" });
  c.checkpoint(2);
  c.starAhead(-11, 0, 1.0, "main");
  boxStar(c, 8.5, -3.4);
  wallGap(c, "right");
  c.hazard("zap", 6, 0, { period: 2.6, wait: true, r: 1.1 });
  dashGap(c, 7.0);
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "left" });
  return c.build();
}

/* 33 — SLIDING SIGNS: neon signs gliding across the gaps */
function l33() {
  const c = mk(33, "Sliding Signs");
  c.start({ len: 14, w: 11, style: "tower" });
  c.ride({ type: "across", sweep: 4.4, period: 3.8, next: { len: 12, w: 10, style: "office" } });
  c.ride({ type: "across", sweep: 4.6, period: 3.6, phase: 0.5, next: { len: 14, w: 10, style: "tower" } });
  c.checkpoint(2);
  c.starAhead(-12.4, 0, 1.2, "main");
  boxStar(c, 8.5, 3.4);
  c.roof({ gap: 5.0, len: 12, w: 10, style: "office", how: "sprintJump" });
  c.ride({ type: "across", sweep: 4.4, period: 3.6, next: { len: 12, w: 10, style: "tower" } });
  c.checkpoint(2);
  c.pipe(4, { w: 10 });
  c.ride({ type: "along", travel: 7, period: 4.6, next: { len: 14, w: 10, style: "office" } });
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 34 — STEAM DISTRICT: vents in rhythm, keep the flow */
function l34() {
  const c = mk(34, "Steam District");
  c.start({ len: 16, w: 11, style: "office" });
  c.hazard("steam", 8, -1.6, { period: 2.6 });
  c.hazard("steam", 8, 1.6, { period: 2.6, phase: 0.5 });
  c.hazard("steam", 12, 0, { period: 2.4, wait: true });
  c.roof({ gap: 4.8, len: 14, w: 10, style: "tower", how: "sprintJump" });
  c.vault(5, { h: 0.85, w: 10 });
  c.hazard("steam", 10, 0, { period: 2.6, wait: true });
  wallJumpGap(c, "left", -4.6);
  c.checkpoint(2);
  c.star(-2.2, 4.5, 3.2, "main");
  c.hazard("steam", 6, 0, { period: 2.4, wait: true });
  c.roof({ gap: 4.8, len: 14, w: 10, style: "office", how: "sprintJump" });
  boxStar(c, 8.5, 3.4 - 4.6 + 4.6);
  dashGap(c, 7.0);
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "right" });
  return c.build();
}

/* 35 — CHAIN REACTION: wall run → wall jump → wall run → dash */
function l35() {
  const c = mk(35, "Chain Reaction");
  c.start({ len: 14, w: 11, style: "tower" });
  wallJumpGap(c, "left", -4.6);
  wallJumpGap(c, "right", 0);
  c.checkpoint(2);
  c.star(-2.2, -4.5, 3.2, "main");
  wallGap(c, "left");
  dashGap(c, 7.2);
  c.checkpoint(2);
  boxStar(c, 8.5, -3.4);
  wallJumpGap(c, "right", 4.6);
  wallJumpGap(c, "left", 0);
  c.checkpoint(2);
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 36 — RAIN SLICK: precision hops on small wet roofs */
function l36() {
  const c = mk(36, "Rain Slick");
  c.start({ len: 12, w: 10, style: "office" });
  c.roof({ gap: 3.2, len: 3, w: 3, style: "low" });
  c.roof({ gap: 3.2, len: 3, w: 3, dy: 0.6, style: "low" });
  c.roof({ gap: 3.4, len: 3, w: 3, dy: -0.6, style: "low" });
  c.starAhead(1.6, 0, 1.5, "main");
  c.roof({ gap: 3.2, len: 12, w: 10, style: "tower" });
  c.checkpoint(2);
  c.hazard("zap", 6, 0, { period: 2.6, wait: true, r: 1.1 });
  c.roof({ gap: 5.0, len: 3.5, w: 3.5, style: "low", how: "sprintJump" });
  c.roof({ gap: 3.2, len: 3.5, w: 3.5, dy: 0.5, style: "low" });
  c.roof({ gap: 3.2, len: 14, w: 10, dy: -0.5, style: "office" });
  c.checkpoint(2);
  boxStar(c, 8.5, 3.4);
  c.beam({ gap: 0.01, len: 8, w: 0.6 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: "tower", how: "walk" });
  shortcutFinish(c, { kind: "wall", side: "left" });
  return c.build();
}

/* 37 — BLACKOUT: fans, zaps and a lift through the dark */
function l37() {
  const c = mk(37, "Blackout");
  c.start({ len: 16, w: 11, style: "tower" });
  c.hazard("fan", 8, 0, { dir: "right", size: [3.4, 3, 3.4], force: 8 });
  c.roof({ gap: 4.8, len: 14, w: 10, style: "office", how: "sprintJump" });
  c.hazard("zap", 7, 0, { period: 2.6, wait: true, r: 1.1 });
  c.ride({ type: "lift", dy: 4.4, period: 5.6, next: { len: 14, w: 10, style: "tower" } });
  c.checkpoint(2);
  c.starAhead(-12.4, 0, 1.2, "main");
  boxStar(c, 8.5, -3.4);
  dashGap(c, 7.0);
  c.hazard("fan", 6, 0, { dir: "left", size: [3.4, 3, 3.4], force: 8 });
  wallGap(c, "right");
  c.checkpoint(2);
  c.ride({ type: "across", sweep: 4.4, period: 3.8, next: { len: 14, w: 10, style: "office" } });
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 38 — EXPRESSWAY: the fastest line in the city — sprint, dash, repeat */
function l38() {
  const c = mk(38, "Expressway");
  c.start({ len: 18, w: 11, style: "office" });
  c.roof({ gap: 5.0, len: 10, w: 10, style: "tower", how: "sprintJump" });
  c.roof({ gap: 5.0, len: 10, w: 10, style: "office", how: "sprintJump" });
  dashGap(c, 7.4);
  c.checkpoint(2);
  c.starAhead(-8.4, 0, 1.2, "main");
  c.pipe(4, { w: 10 });
  c.roof({ gap: 5.0, len: 14, w: 10, style: "office", how: "sprintJump" });
  boxStar(c, 8.5, 3.4);
  dashGap(c, 7.2);
  dashGap(c, 7.4);
  c.checkpoint(2);
  wallGap(c, "left");
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 39 — AFTER HOURS: everything at night, long */
function l39() {
  const c = mk(39, "After Hours");
  c.start({ len: 14, w: 11, style: "tower" });
  c.hazard("steam", 9, 0, { period: 2.6, wait: true });
  c.ride({ type: "across", sweep: 4.4, period: 3.8, next: { len: 12, w: 10, style: "office" } });
  wallJumpGap(c, "right", 4.6);
  c.checkpoint(2);
  c.star(-2.2, -4.5, 3.2, "main");
  c.hazard("zap", 6, 0, { period: 2.6, wait: true, r: 1.1 });
  dashGap(c, 7.0);
  c.ride({ type: "lift", dy: 4.2, period: 5.6, next: { len: 14, w: 10, style: "tower" } });
  c.checkpoint(2);
  boxStar(c, 8.5, -3.4);
  wallGap(c, "left");
  c.hazard("fan", 6, 0, { dir: "right", size: [3.4, 3, 3.4], force: 8 });
  c.roof({ gap: 5.0, len: 12, w: 10, style: "office", how: "sprintJump" });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "right" });
  return c.build();
}

/* 40 — NEON CROWN: the night district finale */
function l40() {
  const c = mk(40, "Neon Crown");
  c.start({ len: 14, w: 11, style: "office" });
  c.roof({ gap: 5.0, len: 12, w: 10, style: "tower", how: "sprintJump" });
  c.hazard("zap", 6, 0, { period: 2.4, wait: true, r: 1.1 });
  wallJumpGap(c, "left", -4.6);
  wallJumpGap(c, "right", 0);
  c.checkpoint(2);
  c.star(-2.2, -4.5, 3.2, "main");
  c.ride({ type: "across", sweep: 4.6, period: 3.6, next: { len: 12, w: 10, style: "office" } });
  dashGap(c, 7.4);
  c.checkpoint(2);
  c.hazard("steam", 6, 0, { period: 2.4, wait: true });
  c.roof({ gap: 3.2, len: 3, w: 3, style: "low" });
  c.roof({ gap: 3.2, len: 3, w: 3, dy: 0.6, style: "low" });
  c.roof({ gap: 3.2, len: 14, w: 10, dy: -0.6, style: "tower" });
  boxStar(c, 8.5, 3.4);
  wallGap(c, "right");
  c.checkpoint(2);
  dashGap(c, 7.2);
  shortcutFinish(c, { kind: "wall", side: "left", finishLen: 16 });
  return c.build();
}

export default [l31(), l32(), l33(), l34(), l35(), l36(), l37(), l38(), l39(), l40()];
