/**
 * World 3 — CONSTRUCTION ZONE, levels 21–30. Half-built high-rises.
 * Focus: crane loads (swinging platforms), construction lifts, crumbling
 * scaffold boards, steel beams, crane hooks, vertical routes, high vaults.
 */
import { course } from "../kit.js";
import { shortcutFinish, boxStar } from "./patterns.js";

const mk = (id, name) => course({ id, name, world: 3, streetY: -55 });
const S = "construction";

/* 21 — HARD HATS ON: steel beams and the first crumbling boards */
function l21() {
  const c = mk(21, "Hard Hats On");
  c.start({ len: 14, w: 11, style: S });
  c.prop("crates", 5, 4);
  c.vault(8, { h: 0.85, w: 11, look: "barrier" });
  c.beam({ gap: 0.01, len: 8, w: 0.8 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: S, how: "walk" });
  c.checkpoint(2);
  c.starAhead(1.2, 0, 1.3, "main");
  c.crumbleBridge({ pieces: 3, next: { len: 14, w: 10, style: S } });
  c.pipe(3.4, { w: 10, look: "beam" });
  boxStar(c, 9.4, -3.6, "crates");
  c.roof({ gap: 4.8, len: 12, w: 10, style: S, how: "sprintJump" });
  c.checkpoint(2);
  c.vault(6, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  c.crumbleBridge({ pieces: 4, next: { len: 12, w: 10, style: S } });
  shortcutFinish(c, { kind: "wall", side: "left", look: "mural", finishStyle: S });
  return c.build();
}

/* 22 — CRANE RIDE: swinging crane loads across big gaps */
function l22() {
  const c = mk(22, "Crane Ride");
  c.start({ len: 14, w: 11, style: S });
  c.ride({ type: "swing", amp: 0.42, ropeLen: 9, period: 5.2, next: { len: 12, w: 10, style: S } });
  c.checkpoint(2);
  c.starAhead(-10.6, 0, 1.4, "main");
  c.vault(6, { h: 0.85, w: 10, look: "barrier" });
  c.roof({ gap: 4.6, len: 12, w: 10, dy: -1, style: S, how: "sprintJump" });
  c.prop("acBig", 6, 3.4);
  c.star(6, 3.4, 2.5, "risky");
  c.tag("stars").go(4.2, 2.0).go(4.6, 2.6, { act: "jump" }).go(6, 3.4, { land: true }).go(8.4, 1.0, { pass: true }).tag(null);
  c.ride({ type: "swing", amp: 0.45, ropeLen: 9, period: 5.6, next: { len: 12, w: 10, style: S } });
  c.checkpoint(2);
  c.crumbleBridge({ pieces: 3, next: { len: 12, w: 10, style: S } });
  shortcutFinish(c, { kind: "dash", finishStyle: S });
  return c.build();
}

/* 23 — GOING UP: construction lifts and ledge climbs up a tower */
function l23() {
  const c = mk(23, "Going Up");
  c.start({ len: 12, w: 11, style: S });
  c.ride({ type: "lift", dy: 4.5, period: 6, next: { len: 10, w: 10, style: S } });
  c.roof({ gap: 1.8, len: 10, w: 10, dy: 2, style: S });
  c.checkpoint(2);
  c.starAhead(-8.4, 0, 1.2, "main");
  c.ride({ type: "lift", dy: 4.5, period: 6, next: { len: 12, w: 10, style: S } });
  c.prop("crates", 6, -3.4);
  c.star(6, -3.4, 2.0, "risky");
  c.tag("stars").go(4.0, -2.2).go(4.4, -2.8, { act: "jump" }).go(6, -3.4, { land: true }).go(8.4, -1.0, { pass: true }).tag(null);
  c.roof({ gap: 1.6, len: 10, w: 10, dy: 1.9, style: S });
  c.checkpoint(2);
  c.beam({ gap: 0.01, len: 8, w: 0.8 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: S, how: "walk" });
  c.vault(5.5, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  shortcutFinish(c, { kind: "wall", side: "right", look: "mural2", finishStyle: S });
  return c.build();
}

/* 24 — SWINGING STEEL: dodge crane hooks across the deck */
function l24() {
  const c = mk(24, "Swinging Steel");
  c.start({ len: 16, w: 11, style: S });
  c.hazard("hook", 10, 0, { axis: "across", len: 5.2, amp: 0.85, period: 3.4, wait: true });
  c.roof({ gap: 3.0, len: 14, w: 10, style: S });
  c.checkpoint(2);
  c.hazard("hook", 8, 0, { axis: "across", len: 5.2, amp: 0.9, period: 3.0, phase: 0.3, wait: true });
  c.starAhead(-6, 0, 1.0, "main");
  c.crumbleBridge({ pieces: 3, next: { len: 14, w: 10, style: S } });
  c.hazard("hook", 7, 0, { axis: "across", len: 5.2, amp: 0.85, period: 3.2, phase: 0.6, wait: true });
  c.prop("crates", 11, 3.4);
  c.star(11, 3.4, 2.0, "risky");
  c.tag("stars").go(9.2, 2.2).go(9.6, 2.8, { act: "jump" }).go(11, 3.4, { land: true }).go(12.4, 1.0, { pass: true }).tag(null);
  c.ride({ type: "swing", amp: 0.42, ropeLen: 9, period: 5.2, next: { len: 14, w: 10, style: S } });
  c.checkpoint(2);
  c.hazard("hook", 6, 0, { axis: "across", len: 5.2, amp: 0.9, period: 3.2, wait: true });
  shortcutFinish(c, { kind: "dash", finishStyle: S });
  return c.build();
}

/* 25 — SCAFFOLD SPRINT: crumbling boards, keep moving */
function l25() {
  const c = mk(25, "Scaffold Sprint");
  c.start({ len: 14, w: 11, style: S });
  c.crumbleBridge({ pieces: 3, next: { len: 6, w: 6, style: S } });
  c.crumbleBridge({ pieces: 4, delay: 0.45, next: { len: 12, w: 10, style: S } });
  c.checkpoint(2);
  c.starAhead(-10, 0, 1.0, "main");
  c.pipe(6.5, { w: 10, look: "beam" });
  c.roof({ gap: 4.8, len: 10, w: 10, style: S, how: "sprintJump" });
  c.crumbleBridge({ pieces: 3, delay: 0.45, next: { len: 12, w: 10, style: S } });
  c.checkpoint(2);
  c.prop("crates", 6, -3.4);
  c.star(6, -3.4, 2.0, "risky");
  c.tag("stars").go(4.0, -2.2).go(4.4, -2.8, { act: "jump" }).go(6, -3.4, { land: true }).go(8.4, -1.0, { pass: true }).tag(null);
  c.wallrun({ side: "left", from: -3, to: 9.2, off: 1.5, h: 6 });
  c.roof({ gap: 8.8, len: 12, w: 10, style: S, how: "wallrun", side: "left", lineV: 0.5 });
  c.crumbleBridge({ pieces: 4, delay: 0.42, next: { len: 12, w: 10, style: S } });
  shortcutFinish(c, { kind: "wall", side: "right", look: "mural2", finishStyle: S });
  return c.build();
}

/* 26 — HIGH VAULTS: barrier rows and tall vaults at speed */
function l26() {
  const c = mk(26, "High Vaults");
  c.start({ len: 20, w: 11, style: S });
  c.vault(5, { h: 1.2, d: 0.8, w: 11, look: "barrier" });
  c.vault(9.5, { h: 1.25, d: 0.8, w: 11, look: "barrier" });
  c.vault(13.5, { h: 0.85, w: 11 });
  c.roof({ gap: 4.8, len: 16, w: 10, style: S, how: "sprintJump" });
  c.checkpoint(2);
  c.vault(6, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  c.pipe(10, { w: 10, look: "beam" });
  c.starAhead(-3.5, 0, 1.4, "main");
  c.ride({ type: "lift", dy: 4, period: 6, next: { len: 16, w: 10, style: S } });
  c.vault(5, { h: 1.25, d: 0.8, w: 10, look: "barrier" });
  c.prop("acBig", 10, 3.4);
  c.star(10, 3.4, 2.5, "risky");
  c.tag("stars").go(8.2, 2.0).go(8.6, 2.6, { act: "jump" }).go(10, 3.4, { land: true }).go(12.4, 1.0, { pass: true }).tag(null);
  c.ride({ type: "swing", amp: 0.42, ropeLen: 9, period: 5.2, next: { len: 14, w: 10, style: S } });
  c.checkpoint(2);
  c.vault(6, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  shortcutFinish(c, { kind: "dash", finishStyle: S });
  return c.build();
}

/* 27 — BEAM WALK: a long run along steel beams between frames */
function l27() {
  const c = mk(27, "Beam Walk");
  c.start({ len: 12, w: 11, style: S });
  c.beam({ gap: 0.01, len: 8, w: 0.7 });
  c.roof({ gap: 0.01, len: 5, w: 5, style: S, how: "walk" });
  c.beam({ gap: 0.01, len: 7, w: 0.6 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: S, how: "walk" });
  c.checkpoint(2);
  c.starAhead(-10, 0, 1.2, "main");
  c.hazard("hook", 7, 0, { axis: "across", len: 5.2, amp: 0.85, period: 3.4, wait: true });
  c.roof({ gap: 3.0, len: 6, w: 6, dy: -1, style: S });
  c.beam({ gap: 0.01, len: 9, w: 0.6 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: S, how: "walk" });
  c.checkpoint(2);
  c.prop("crates", 6, 3.4);
  c.star(6, 3.4, 2.0, "risky");
  c.tag("stars").go(4.0, 2.2).go(4.4, 2.8, { act: "jump" }).go(6, 3.4, { land: true }).go(8.4, 1.0, { pass: true }).tag(null);
  c.crumbleBridge({ pieces: 3, next: { len: 12, w: 10, style: S } });
  shortcutFinish(c, { kind: "wall", side: "left", look: "mural", finishStyle: S });
  return c.build();
}

/* 28 — TOWER FRAME: climb the frame: ledges, lifts and a crane hop */
function l28() {
  const c = mk(28, "Tower Frame");
  c.start({ len: 12, w: 11, style: S });
  c.roof({ gap: 1.8, len: 10, w: 10, dy: 2, style: S });
  c.roof({ gap: 1.8, len: 10, w: 10, dy: 2, style: S });
  c.checkpoint(2);
  c.starAhead(-8.4, 0, 1.2, "main");
  c.ride({ type: "lift", dy: 4.5, period: 6, next: { len: 12, w: 10, style: S } });
  c.hazard("hook", 7, 0, { axis: "across", len: 5.2, amp: 0.85, period: 3.2, wait: true });
  c.ride({ type: "swing", amp: 0.45, ropeLen: 9, period: 5.4, next: { len: 14, w: 10, style: S } });
  c.checkpoint(2);
  boxStar(c, 8.6, -3.4, "crates");
  c.roof({ gap: 1.6, len: 10, w: 10, dy: 1.9, style: S });
  c.crumbleBridge({ pieces: 3, next: { len: 12, w: 10, style: S } });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "right", look: "mural2", finishStyle: S });
  return c.build();
}

/* 29 — DEMOLITION DAY: hooks, steam and boards giving way */
function l29() {
  const c = mk(29, "Demolition Day");
  c.start({ len: 14, w: 11, style: S });
  c.hazard("steam", 9, 0, { period: 2.8, wait: true });
  c.prop("crates", 9, 3.8);
  c.prop("crates", 9, -3.8);
  c.crumbleBridge({ pieces: 3, next: { len: 14, w: 10, style: S } });
  c.hazard("hook", 7, 0, { axis: "across", len: 5.2, amp: 0.85, period: 3.2, wait: true });
  c.checkpoint(2);
  c.starAhead(-3.5, 0, 1.2, "main");
  c.ride({ type: "swing", amp: 0.42, ropeLen: 9, period: 5.2, next: { len: 12, w: 10, style: S } });
  c.vault(6, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  c.prop("acBig", 10, 3.4);
  c.star(10, 3.4, 2.5, "risky");
  c.tag("stars").go(8.2, 2.0).go(8.6, 2.6, { act: "jump" }).go(10, 3.4, { land: true }).go(11.2, 1.0, { pass: true }).tag(null);
  c.ride({ type: "lift", dy: 4, period: 6, next: { len: 14, w: 10, style: S } });
  c.checkpoint(2);
  c.hazard("steam", 5, -1.6, { period: 3, phase: 0.5 });
  c.hazard("steam", 5, 1.6, { period: 3 });
  c.crumbleBridge({ pieces: 4, delay: 0.45, next: { len: 12, w: 10, style: S } });
  shortcutFinish(c, { kind: "dash", finishStyle: S });
  return c.build();
}

/* 30 — TOPPING OUT: the construction finale */
function l30() {
  const c = mk(30, "Topping Out");
  c.start({ len: 14, w: 11, style: S });
  c.vault(7, { h: 1.2, d: 0.8, w: 11, look: "barrier" });
  c.crumbleBridge({ pieces: 3, next: { len: 12, w: 10, style: S } });
  c.ride({ type: "swing", amp: 0.45, ropeLen: 9, period: 5.4, next: { len: 12, w: 10, style: S } });
  c.checkpoint(2);
  c.starAhead(-10.4, 0, 1.4, "main");
  c.hazard("hook", 7, 0, { axis: "across", len: 5.2, amp: 0.85, period: 3.2, wait: true });
  c.ride({ type: "lift", dy: 4.5, period: 6, next: { len: 10, w: 10, style: S } });
  c.roof({ gap: 1.8, len: 12, w: 10, dy: 2, style: S });
  c.checkpoint(2);
  c.wallrun({ side: "left", from: -2, to: 7.8, off: 1.4, h: 6, lineV: 0.4 });
  c.roof({ gap: 7.2, len: 12, w: 6, v: -4.6, style: S, how: "wallrun", side: "left", lineV: 0.8, wjAt: 3.4 });
  c.prop("crates", 6, 0);
  c.star(6, 0, 2.0, "risky");
  c.tag("stars").go(4.0, -1.2).go(4.4, -0.6, { act: "jump" }).go(6, 0, { land: true }).go(8.4, 1.0, { pass: true }).tag(null);
  c.beam({ gap: 0.01, len: 8, w: 0.6 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: S, how: "walk" });
  c.under({ a: 0.6, b: 6.6, w: 8, dy: -3 });
  c.roof({ gap: 7.2, len: 14, w: 10, style: S, how: "dashJump", dashAt: 0.24 });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "right", look: "mural2", finishStyle: S, finishLen: 16 });
  return c.build();
}

export default [l21(), l22(), l23(), l24(), l25(), l26(), l27(), l28(), l29(), l30()];
