/**
 * World 2 — DOWNTOWN HEIGHTS, levels 11–20. Tall office towers at dusk.
 * Focus: longer gaps, moving platforms, lifts, wall-run chains, precision
 * landings on small roofs.
 */
import { course } from "../kit.js";
import { shortcutFinish } from "./patterns.js";

const mk = (id, name) => course({ id, name, world: 2, streetY: -70 });

/* 11 — GLASS AND STEEL: first moving platform */
function l11() {
  const c = mk(11, "Glass and Steel");
  c.start({ len: 16, w: 11, style: "office" });
  c.prop("acBig", 6, 3.8);
  c.prop("antenna", 12, -4.5);
  c.roof({ gap: 4.6, len: 12, w: 10, style: "tower", how: "sprintJump" });
  c.vault(6, { h: 0.85, w: 10 });
  c.ride({ type: "along", travel: 6, period: 5, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  c.starAhead(-6, 0, 1.2, "main");
  c.pipe(7, { w: 10 });
  c.roof({ gap: 3.2, len: 10, w: 9, dy: -1.2, style: "tower" });
  c.prop("acBig", 6, -3);
  c.star(6, -3, 1.5 + 1.0, "risky");
  c.tag("stars").go(4.0, -1.6).go(4.4, -2.2, { act: "jump" }).go(5.8, -3, { land: true }).go(8.4, -1.0, { pass: true }).tag(null);
  c.ride({ type: "along", travel: 7, period: 5.6, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  c.wallrun({ side: "left", from: -3, to: 9.2, off: 1.5, h: 6, look: "billboard" });
  c.roof({ gap: 8.8, len: 12, w: 10, style: "tower", how: "wallrun", side: "left", lineV: 0.5 });
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 12 — EXPRESS LIFT: ride a lift up to the next tower */
function l12() {
  const c = mk(12, "Express Lift");
  c.start({ len: 14, w: 11, style: "office" });
  c.vault(8, { h: 0.85, w: 11 });
  c.ride({ type: "lift", dy: 4.5, period: 6.5, next: { len: 12, w: 10, style: "tower" } });
  c.checkpoint(2);
  c.starAhead(1.2, 0, 1.5, "main");
  c.roof({ gap: 2.8, len: 10, w: 10, style: "office" });
  c.pipe(6, { w: 10 });
  c.roof({ gap: 5.0, len: 12, w: 10, dy: -1, style: "tower", how: "sprintJump" });
  c.prop("acBig", 6, 3.4);
  c.star(6, 3.4, 1.5 + 1.0, "risky");
  c.tag("stars").go(4.2, 2.0).go(4.6, 2.6, { act: "jump" }).go(6, 3.4, { land: true }).go(8.4, 1.2, { pass: true }).tag(null);
  c.ride({ type: "lift", dy: 3.8, period: 6, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  c.wallrun({ side: "right", from: -3, to: 9.2, off: 1.5, h: 6, look: "billboard" });
  c.roof({ gap: 8.8, len: 12, w: 10, style: "tower", how: "wallrun", side: "right", lineV: -0.5 });
  c.vault(5.5, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  shortcutFinish(c, { kind: "wall", side: "left" });
  return c.build();
}

/* 13 — TRAFFIC ABOVE: platforms sliding across the gaps */
function l13() {
  const c = mk(13, "Traffic Above");
  c.start({ len: 14, w: 11, style: "tower" });
  c.ride({ type: "across", sweep: 4, period: 4.6, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  c.vault(6, { h: 0.85, w: 10 });
  c.ride({ type: "across", sweep: 4.4, period: 4.2, phase: 0.5, next: { len: 12, w: 10, style: "tower" } });
  c.starAhead(-10.8, 0, 2.0, "main");
  c.roof({ gap: 4.8, len: 10, w: 9, dy: -1.5, style: "office", how: "sprintJump" });
  c.checkpoint(2);
  c.prop("acBig", 6.5, -3.2);
  c.star(6.5, -3.2, 1.5 + 1.0, "risky");
  c.tag("stars").go(4.7, -1.8).go(5.1, -2.4, { act: "jump" }).go(6.5, -3.2, { land: true }).go(8.6, -0.8, { pass: true }).tag(null);
  c.ride({ type: "along", travel: 6.5, period: 5.4, next: { len: 12, w: 10, style: "tower" } });
  c.pipe(6.5, { w: 10 });
  c.ride({ type: "across", sweep: 4, period: 4.4, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 14 — BILLBOARD CHAIN: wall run → wall jump → wall run */
function l14() {
  const c = mk(14, "Billboard Chain");
  c.start({ len: 14, w: 11, style: "office" });
  c.wallrun({ side: "left", from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: 0.4 });
  c.roof({ gap: 7.2, len: 10, w: 6, v: -4.6, style: "tower", how: "wallrun", side: "left", lineV: 0.8, wjAt: 3.4 });
  c.wallrun({ side: "right", from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: -0.4 });
  c.roof({ gap: 7.2, len: 12, w: 6, v: 0, style: "office", how: "wallrun", side: "right", lineV: -0.8, wjAt: 3.4 });
  c.checkpoint(2);
  c.star(-2.2, -4.5, 3.2, "main");
  c.vault(6, { h: 0.85, w: 6 });
  c.wallrun({ side: "left", from: -3, to: 9.2, off: 1.5, h: 6, look: "billboard" });
  c.roof({ gap: 8.8, len: 12, w: 10, style: "tower", how: "wallrun", side: "left", lineV: 0.5 });
  c.under({ a: 0.6, b: 6.4, w: 8, dy: -3 });
  c.roof({ gap: 7.0, len: 12, w: 10, style: "office", how: "dashJump", dashAt: 0.24 });
  c.checkpoint(2);
  // risky: off the side on a narrow ledge roof
  c.prop("acBig", 7, 3.4);
  c.star(7, 3.4, 2.5, "risky");
  c.tag("stars").go(5.2, 2.0).go(5.6, 2.6, { act: "jump" }).go(7, 3.4, { land: true }).go(9.4, 1.0, { pass: true }).tag(null);
  c.wallrun({ side: "right", from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: -0.4 });
  c.roof({ gap: 7.2, len: 12, w: 6, v: 4.6, style: "tower", how: "wallrun", side: "right", lineV: -0.8, wjAt: 3.4 });
  shortcutFinish(c, { kind: "wall", side: "right" });
  return c.build();
}

/* 15 — PRECISION: small roofs, exact landings */
function l15() {
  const c = mk(15, "Precision");
  c.start({ len: 12, w: 10, style: "tower" });
  c.roof({ gap: 3.0, len: 3.5, w: 3.5, style: "low" });
  c.roof({ gap: 3.2, len: 3.5, w: 3.5, dy: 0.6, style: "low" });
  c.starAhead(1.6, 0, 1.8, "main");
  c.roof({ gap: 3.4, len: 3.5, w: 3.5, dy: -0.6, style: "low" });
  c.roof({ gap: 3.0, len: 10, w: 9, style: "office" });
  c.checkpoint(2);
  c.beam({ gap: 0.01, len: 7, w: 0.7 });
  c.roof({ gap: 0.01, len: 4, w: 4, style: "low", how: "walk" });
  c.beam({ gap: 0.01, len: 6, w: 0.7 });
  c.roof({ gap: 0.01, len: 10, w: 9, style: "tower", how: "walk" });
  c.checkpoint(2);
  c.prop("acBig", 6, -3.2);
  c.star(6, -3.2, 2.5, "risky");
  c.tag("stars").go(4.2, -1.8).go(4.6, -2.4, { act: "jump" }).go(6, -3.2, { land: true }).go(8.0, -0.6, { pass: true }).tag(null);
  c.roof({ gap: 3.0, len: 3, w: 3, style: "low" });
  c.roof({ gap: 3.2, len: 3, w: 3, dy: 0.5, style: "low" });
  c.roof({ gap: 3.4, len: 3.5, w: 3.5, dy: -0.5, style: "low" });
  c.roof({ gap: 3.0, len: 12, w: 10, style: "office" });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 16 — RUSH HOUR: movers in sequence, then a long sprint line */
function l16() {
  const c = mk(16, "Rush Hour");
  c.start({ len: 14, w: 11, style: "office" });
  c.ride({ type: "along", travel: 7, period: 5, next: { len: 8, w: 9, style: "tower" } });
  c.ride({ type: "across", sweep: 4, period: 4.2, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  c.starAhead(-8.4, 0, 2.0, "main");
  c.pipe(6.5, { w: 10 });
  c.roof({ gap: 5.0, len: 10, w: 10, style: "tower", how: "sprintJump" });
  c.roof({ gap: 5.0, len: 10, w: 10, dy: -1, style: "office", how: "sprintJump" });
  c.checkpoint(2);
  c.prop("acBig", 6, -3.2);
  c.star(6, -3.2, 2.5, "risky");
  c.tag("stars").go(4.2, -1.8).go(4.6, -2.4, { act: "jump" }).go(6, -3.2, { land: true }).go(8.4, -0.8, { pass: true }).tag(null);
  c.ride({ type: "lift", dy: 4, period: 6, next: { len: 12, w: 10, style: "tower" } });
  c.vault(6, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  c.ride({ type: "along", travel: 7, period: 5.4, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "left" });
  return c.build();
}

/* 17 — WIND TUNNEL: rooftop exhaust fans push you sideways */
function l17() {
  const c = mk(17, "Wind Tunnel");
  c.start({ len: 16, w: 11, style: "tower" });
  c.hazard("fan", 9, 0, { dir: "left", size: [3.4, 3, 3.4], force: 7 });
  c.prop("acBig", 9, -4.4, { turn90: true });
  c.roof({ gap: 3.0, len: 12, w: 10, style: "office" });
  c.vault(5, { h: 0.85, w: 10 });
  c.roof({ gap: 4.8, len: 14, w: 10, style: "tower", how: "sprintJump" });
  c.checkpoint(2);
  c.hazard("fan", 7, 0, { dir: "right", size: [3.4, 3, 3.4], force: 8 });
  c.starAhead(-7, 0, 1.0, "main");
  c.wallrun({ side: "left", from: -3, to: 9.2, off: 1.5, h: 6, look: "billboard" });
  c.roof({ gap: 8.8, len: 12, w: 10, style: "office", how: "wallrun", side: "left", lineV: 0.5 });
  c.prop("acBig", 6, 3.4);
  c.star(6, 3.4, 2.5, "risky");
  c.tag("stars").go(4.2, 2.0).go(4.6, 2.6, { act: "jump" }).go(6, 3.4, { land: true }).go(8.4, 1.0, { pass: true }).tag(null);
  c.ride({ type: "across", sweep: 4, period: 4.4, next: { len: 15, w: 10, style: "tower" } });
  c.checkpoint(2);
  c.hazard("fan", 5, 0, { dir: "left", size: [3.4, 3, 3.4], force: 8 });
  c.pipe(9, { w: 10 });
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 18 — SKY BRIDGE: beams between towers, a lift and a long wall run */
function l18() {
  const c = mk(18, "Sky Bridge");
  c.start({ len: 12, w: 11, style: "office" });
  c.beam({ gap: 0.01, len: 9, w: 0.8 });
  c.roof({ gap: 0.01, len: 10, w: 9, style: "tower", how: "walk" });
  c.checkpoint(2);
  c.ride({ type: "lift", dy: 4.4, period: 6, next: { len: 10, w: 9, style: "office" } });
  c.starAhead(-8.4, 0, 1.2, "main");
  c.beam({ gap: 0.01, len: 8, w: 0.7 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: "tower", how: "walk" });
  c.checkpoint(2);
  c.wallrun({ side: "right", from: -3, to: 9.6, off: 1.5, h: 6, look: "billboard" });
  c.roof({ gap: 9.2, len: 12, w: 10, style: "office", how: "wallrun", side: "right", lineV: -0.5 });
  c.prop("acBig", 6, -3.4);
  c.star(6, -3.4, 2.5, "risky");
  c.tag("stars").go(4.2, -2.0).go(4.6, -2.6, { act: "jump" }).go(6, -3.4, { land: true }).go(8.4, -1.0, { pass: true }).tag(null);
  c.under({ a: 0.6, b: 6.6, w: 8, dy: -3 });
  c.roof({ gap: 7.2, len: 12, w: 10, style: "tower", how: "dashJump", dashAt: 0.24 });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "left" });
  return c.build();
}

/* 19 — NIGHTFALL: longer, mixed — movers, wall jumps, fans */
function l19() {
  const c = mk(19, "Nightfall");
  c.start({ len: 14, w: 11, style: "tower" });
  c.vault(8, { h: 0.85, w: 11 });
  c.ride({ type: "along", travel: 7, period: 5, next: { len: 10, w: 10, style: "office" } });
  c.wallrun({ side: "left", from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: 0.4 });
  c.roof({ gap: 7.2, len: 10, w: 6, v: -4.6, style: "tower", how: "wallrun", side: "left", lineV: 0.8, wjAt: 3.4 });
  c.checkpoint(2);
  c.star(-2.2, 4.5, 3.2, "main");
  c.hazard("fan", 5, 0, { dir: "right", size: [3, 3, 3], force: 7 });
  c.roof({ gap: 4.8, len: 10, w: 10, style: "office", how: "sprintJump" });
  c.ride({ type: "across", sweep: 4, period: 4.2, next: { len: 12, w: 10, style: "tower" } });
  c.checkpoint(2);
  c.prop("acBig", 6, 3.4);
  c.star(6, 3.4, 2.5, "risky");
  c.tag("stars").go(4.2, 2.0).go(4.6, 2.6, { act: "jump" }).go(6, 3.4, { land: true }).go(8.4, 1.0, { pass: true }).tag(null);
  c.ride({ type: "lift", dy: 4, period: 6, next: { len: 12, w: 10, style: "office" } });
  c.pipe(6.5, { w: 10 });
  c.under({ a: 0.6, b: 6.6, w: 8, dy: -3 });
  c.roof({ gap: 7.2, len: 12, w: 10, style: "tower", how: "dashJump", dashAt: 0.24 });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "right" });
  return c.build();
}

/* 20 — DOWNTOWN FINALE: the district's whole toolkit, longest so far */
function l20() {
  const c = mk(20, "Downtown Finale");
  c.start({ len: 14, w: 11, style: "office" });
  c.roof({ gap: 4.8, len: 10, w: 10, style: "tower", how: "sprintJump" });
  c.pipe(5, { w: 10 });
  c.ride({ type: "along", travel: 7, period: 5, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  c.wallrun({ side: "right", from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: -0.4 });
  c.roof({ gap: 7.2, len: 10, w: 6, v: 4.6, style: "tower", how: "wallrun", side: "right", lineV: -0.8, wjAt: 3.4 });
  c.wallrun({ side: "left", from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: 0.4 });
  c.roof({ gap: 7.2, len: 12, w: 6, v: 0, style: "office", how: "wallrun", side: "left", lineV: 0.8, wjAt: 3.4 });
  c.checkpoint(2);
  c.star(-2.2, 4.5, 3.2, "main");
  c.ride({ type: "lift", dy: 4.2, period: 6, next: { len: 12, w: 10, style: "tower" } });
  c.hazard("fan", 6, 0, { dir: "left", size: [3.4, 3, 3.4], force: 8 });
  c.ride({ type: "across", sweep: 4.4, period: 4.2, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  c.prop("acBig", 6, -3.4);
  c.star(6, -3.4, 2.5, "risky");
  c.tag("stars").go(4.2, -2.0).go(4.6, -2.6, { act: "jump" }).go(6, -3.4, { land: true }).go(8.4, -1.0, { pass: true }).tag(null);
  c.roof({ gap: 3.0, len: 3.5, w: 3.5, style: "low" });
  c.roof({ gap: 3.2, len: 3.5, w: 3.5, dy: 0.6, style: "low" });
  c.roof({ gap: 3.2, len: 12, w: 10, dy: -0.6, style: "tower" });
  c.under({ a: 0.6, b: 6.6, w: 8, dy: -3 });
  c.roof({ gap: 7.2, len: 12, w: 10, style: "office", how: "dashJump", dashAt: 0.24 });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "left", finishLen: 16 });
  return c.build();
}

export default [l11(), l12(), l13(), l14(), l15(), l16(), l17(), l18(), l19(), l20()];
