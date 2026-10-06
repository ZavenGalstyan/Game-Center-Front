/**
 * World 5 — SKYLINE CORE, levels 41–50. The tallest towers, above the cloud
 * sea, at sunrise. Focus: mastery — long chains, every mechanic combined,
 * advanced shortcuts. Level 50, SKYLINE MASTER, ends on the highest roof.
 */
import { course } from "../kit.js";
import { shortcutFinish, boxStar } from "./patterns.js";

const mk = (id, name) => course({ id, name, world: 5, streetY: -120 });

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
  c.wallrun({ side, from: -2, to: 7.8, off: 1.4, h: 6, look: "mural", lineV: s * 0.4 });
  c.roof({ gap: 7.2, len: 12, w: 6, v: toV, style: "tower", how: "wallrun", side, lineV: s * 0.8, wjAt: 3.4, ...next });
};
const steps = (c, n = 3) => {
  for (let i = 0; i < n; i++) c.roof({ gap: 3.2, len: 3, w: 3, dy: i % 2 ? -0.5 : 0.5, style: "low" });
};

/* 41 — ABOVE THE CLOUDS */
function l41() {
  const c = mk(41, "Above the Clouds");
  c.start({ len: 16, w: 12, style: "tower" });
  c.prop("helipad", 7, 0, { ghost: true });
  c.roof({ gap: 5.0, len: 12, w: 10, style: "office", how: "sprintJump" });
  wallGap(c, "left");
  c.checkpoint(2);
  c.starAhead(-7.5, 0.3, 1.0, "main");
  c.ride({ type: "swing", amp: 0.42, ropeLen: 9, period: 5.2, next: { len: 14, w: 10, style: "tower" } });
  boxStar(c, 8.5, 3.4);
  dashGap(c, 7.0);
  c.checkpoint(2);
  c.vault(5, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  shortcutFinish(c, { kind: "dash", props: [["helipad", 8, 0, { ghost: true }]] });
  return c.build();
}

/* 42 — SKY BRIDGES */
function l42() {
  const c = mk(42, "Sky Bridges");
  c.start({ len: 14, w: 11, style: "tower" });
  c.beam({ gap: 0.01, len: 10, w: 0.7 });
  c.roof({ gap: 0.01, len: 6, w: 6, style: "glass", how: "walk" });
  c.beam({ gap: 0.01, len: 9, w: 0.6 });
  c.roof({ gap: 0.01, len: 14, w: 10, style: "office", how: "walk" });
  c.checkpoint(2);
  c.starAhead(-12.4, 0, 1.2, "main");
  boxStar(c, 8.5, -3.4);
  wallJumpGap(c, "right", 4.6);
  c.beam({ gap: 0.01, len: 9, w: 0.6 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: "tower", how: "walk" });
  c.checkpoint(2);
  dashGap(c, 7.2);
  shortcutFinish(c, { kind: "wall", side: "left" });
  return c.build();
}

/* 43 — HELIPAD HOPS */
function l43() {
  const c = mk(43, "Helipad Hops");
  c.start({ len: 16, w: 12, style: "tower" });
  c.prop("helipad", 8, 0, { ghost: true });
  c.roof({ gap: 5.0, len: 14, w: 12, style: "tower", how: "sprintJump" });
  c.prop("helipad", 7, 0, { ghost: true });
  c.ride({ type: "lift", dy: 4.4, period: 5.6, next: { len: 14, w: 12, style: "tower" } });
  c.checkpoint(2);
  c.starAhead(-12.4, 0, 1.2, "main");
  c.prop("helipad", 7, 0, { ghost: true });
  dashGap(c, 7.2, { w: 12 });
  boxStar(c, 8.5, 3.4);
  c.ride({ type: "swing", amp: 0.45, ropeLen: 9, period: 5.4, next: { len: 14, w: 12, style: "tower" } });
  c.checkpoint(2);
  c.hazard("steam", 6, 0, { period: 2.4, wait: true });
  shortcutFinish(c, { kind: "wall", side: "right", props: [["helipad", 8, 0, { ghost: true }]] });
  return c.build();
}

/* 44 — HIGH WIRE */
function l44() {
  const c = mk(44, "High Wire");
  c.start({ len: 14, w: 11, style: "tower" });
  steps(c, 3);
  c.roof({ gap: 3.2, len: 12, w: 10, style: "office" });
  c.checkpoint(2);
  c.starAhead(-10.4, 0, 1.0, "main");
  c.beam({ gap: 0.01, len: 10, w: 0.5 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: "tower", how: "walk" });
  c.hazard("zap", 6, 0, { period: 2.4, wait: true, r: 1.1 });
  wallGap(c, "right");
  c.checkpoint(2);
  boxStar(c, 8.5, -3.4);
  c.ride({ type: "across", sweep: 4.6, period: 3.6, next: { len: 14, w: 10, style: "tower" } });
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 45 — SUNRISE RUN */
function l45() {
  const c = mk(45, "Sunrise Run");
  c.start({ len: 18, w: 11, style: "tower" });
  c.roof({ gap: 5.0, len: 10, w: 10, style: "office", how: "sprintJump" });
  dashGap(c, 7.2);
  wallGap(c, "left");
  c.checkpoint(2);
  c.starAhead(-9.2, 0.3, 1.0, "main");
  c.pipe(4, { w: 10 });
  c.roof({ gap: 5.0, len: 14, w: 10, style: "tower", how: "sprintJump" });
  boxStar(c, 8.5, 3.4);
  dashGap(c, 7.4);
  wallJumpGap(c, "right", 4.6);
  c.checkpoint(2);
  c.ride({ type: "along", travel: 7, period: 4.6, next: { len: 14, w: 10, style: "tower" } });
  shortcutFinish(c, { kind: "wall", side: "left" });
  return c.build();
}

/* 46 — CRANE CROWN */
function l46() {
  const c = mk(46, "Crane Crown");
  c.start({ len: 14, w: 11, style: "construction" });
  c.ride({ type: "swing", amp: 0.42, ropeLen: 9, period: 5.0, next: { len: 12, w: 10, style: "tower" } });
  c.hazard("hook", 7, 0, { axis: "across", len: 5.2, amp: 0.85, period: 3.0, wait: true });
  c.ride({ type: "swing", amp: 0.45, ropeLen: 9, period: 5.4, next: { len: 14, w: 10, style: "construction" } });
  c.checkpoint(2);
  c.starAhead(-12.4, 0, 1.2, "main");
  boxStar(c, 8.5, -3.4, "crates");
  c.crumbleBridge({ pieces: 3, delay: 0.45, next: { len: 12, w: 10, style: "tower" } });
  c.ride({ type: "lift", dy: 4.4, period: 5.6, next: { len: 14, w: 10, style: "tower" } });
  c.checkpoint(2);
  dashGap(c, 7.2);
  shortcutFinish(c, { kind: "wall", side: "right" });
  return c.build();
}

/* 47 — THIN AIR */
function l47() {
  const c = mk(47, "Thin Air");
  c.start({ len: 14, w: 11, style: "tower" });
  wallJumpGap(c, "left", -4.6);
  wallJumpGap(c, "right", 0);
  c.checkpoint(2);
  c.star(-2.2, -4.5, 3.2, "main");
  steps(c, 4);
  c.roof({ gap: 3.2, len: 14, w: 10, style: "office" });
  boxStar(c, 8.5, 3.4);
  dashGap(c, 7.4);
  c.checkpoint(2);
  c.hazard("fan", 6, 0, { dir: "left", size: [3.4, 3, 3.4], force: 8 });
  c.roof({ gap: 5.0, len: 12, w: 10, style: "tower", how: "sprintJump" });
  wallGap(c, "left");
  c.checkpoint(2);
  shortcutFinish(c, { kind: "dash" });
  return c.build();
}

/* 48 — STORM FRONT */
function l48() {
  const c = mk(48, "Storm Front");
  c.start({ len: 16, w: 11, style: "office" });
  c.hazard("zap", 9, 0, { period: 2.4, wait: true, r: 1.1 });
  c.ride({ type: "across", sweep: 4.6, period: 3.6, next: { len: 12, w: 10, style: "tower" } });
  c.hazard("steam", 6, 0, { period: 2.4, wait: true });
  dashGap(c, 7.2);
  c.checkpoint(2);
  c.starAhead(-10, 0, 1.0, "main");
  wallJumpGap(c, "right", 4.6);
  c.hazard("fan", 6, 0, { dir: "right", size: [3.4, 3, 3.4], force: 8 });
  c.roof({ gap: 5.0, len: 14, w: 10, style: "office", how: "sprintJump" });
  c.checkpoint(2);
  boxStar(c, 8.5, -3.4);
  c.ride({ type: "swing", amp: 0.45, ropeLen: 9, period: 5.2, next: { len: 12, w: 10, style: "tower" } });
  c.crumbleBridge({ pieces: 3, delay: 0.45, next: { len: 14, w: 10, style: "tower" } });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "left" });
  return c.build();
}

/* 49 — THE SPIRE */
function l49() {
  const c = mk(49, "The Spire");
  c.start({ len: 12, w: 11, style: "tower" });
  c.roof({ gap: 1.8, len: 10, w: 10, dy: 2, style: "tower" });
  c.ride({ type: "lift", dy: 4.5, period: 5.6, next: { len: 12, w: 10, style: "office" } });
  c.checkpoint(2);
  c.starAhead(-10.4, 0, 1.2, "main");
  c.roof({ gap: 1.8, len: 10, w: 10, dy: 2, style: "tower" });
  wallGap(c, "right");
  c.ride({ type: "lift", dy: 4.5, period: 5.6, next: { len: 14, w: 10, style: "tower" } });
  c.checkpoint(2);
  boxStar(c, 8.5, 3.4);
  dashGap(c, 7.2);
  c.roof({ gap: 1.8, len: 12, w: 10, dy: 2, style: "office" });
  c.checkpoint(2);
  shortcutFinish(c, { kind: "dash", props: [["helipad", 8, 0, { ghost: true }]] });
  return c.build();
}

/* 50 — SKYLINE MASTER: the final course — every skill, then the highest roof */
function l50() {
  const c = mk(50, "Skyline Master");
  c.start({ len: 16, w: 12, style: "tower" });
  c.prop("helipad", 6, 0, { ghost: true });
  c.vault(12, { h: 0.85, w: 12 });
  // act 1 — speed
  c.roof({ gap: 5.0, len: 12, w: 10, style: "office", how: "sprintJump" });
  c.pipe(5, { w: 10 });
  dashGap(c, 7.2);
  c.checkpoint(2);
  c.starAhead(-10.4, 0, 1.0, "main");
  // act 2 — walls
  wallJumpGap(c, "left", -4.6);
  wallJumpGap(c, "right", 0);
  wallGap(c, "left");
  c.checkpoint(2);
  // act 3 — moving city
  c.ride({ type: "along", travel: 7, period: 4.6, next: { len: 10, w: 10, style: "tower" } });
  c.ride({ type: "across", sweep: 4.6, period: 3.6, next: { len: 12, w: 10, style: "office" } });
  c.ride({ type: "swing", amp: 0.45, ropeLen: 9, period: 5.2, next: { len: 14, w: 10, style: "tower" } });
  c.checkpoint(2);
  boxStar(c, 8.5, -3.4);
  // act 4 — hazards and precision
  c.hazard("zap", 6, 0, { period: 2.4, wait: true, r: 1.1 });
  steps(c, 3);
  c.roof({ gap: 3.2, len: 12, w: 10, style: "office" });
  c.crumbleBridge({ pieces: 3, delay: 0.45, next: { len: 14, w: 10, style: "tower" } });
  c.hazard("steam", 6, 0, { period: 2.4, wait: true });
  c.checkpoint(2);
  // act 5 — the climb to the top of the skyline
  c.ride({ type: "lift", dy: 5, period: 5.6, next: { len: 10, w: 10, style: "tower" } });
  c.roof({ gap: 1.8, len: 12, w: 10, dy: 2, style: "tower" });
  dashGap(c, 7.4);
  c.checkpoint(2);
  shortcutFinish(c, { kind: "wall", side: "right", finishLen: 20, finishW: 16, finishAt: 11, props: [["helipad", 11, 0, { ghost: true }], ["antenna", 18, 6.5], ["antenna", 18, -6.5]] });
  return c.build();
}

export default [l41(), l42(), l43(), l44(), l45(), l46(), l47(), l48(), l49(), l50()];
