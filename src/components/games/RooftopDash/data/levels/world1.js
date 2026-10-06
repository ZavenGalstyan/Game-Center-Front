/**
 * World 1 — SUNSET DISTRICT, levels 2–10 (level 1 is level01.js).
 * Focus: the basics — jump, sprint gaps, vaults, slides, ledge climbs,
 * simple wall runs, the first dash gaps and (late) a steam vent.
 * Every level is validated by the route bot (tools/levelBot.mjs).
 */
import { course } from "../kit.js";

const W = 1;
const mk = (id, name, extra = {}) => course({ id, name, world: W, streetY: -30, ...extra });

/* 2 — TAR & GRAVEL: hop chain, vault, slide, first ledge step-up */
function l2() {
  const c = mk(2, "Tar & Gravel");
  c.start({ len: 16, w: 11, style: "apartment" });
  c.prop("ac", 6, 4.2);
  c.prop("vent", 10, -4.4);
  c.prop("door", 3, -4.3);
  c.starAhead(1.2, 0, 1.5, "main");
  c.roof({ gap: 2.6, len: 12, w: 10, style: "brick" });
  c.vault(5, { h: 0.8, w: 5 });
  c.prop("ac", 5.3, 3.9, { turn90: true });
  c.prop("ac", 5.3, -3.9, { turn90: true });
  c.roof({ gap: 3.0, len: 14, w: 10, dy: -1, style: "office" });
  c.checkpoint(2.5);
  c.pipe(8, { w: 10 });
  c.prop("solar", 12, 3.6, { turn90: true });
  // star 2: on a rooftop room beside the lane (ledge climb), risky detour
  c.block(11, { len: 2.4, w: 2.6, v: -3.4, h: 2.2, kind: "room" });
  c.star(12.2, -3.4, 2.2 + 1.0, "risky");
  c.tag("stars").go(9.5, -1.6).go(10.5, -3.0, { act: "climb" }).go(12.2, -3.4, { land: true }).go(13.4, -1.0, { pass: true }).tag(null);
  c.roof({ gap: 2.0, len: 12, w: 10, dy: 1.9, style: "apartment" }); // ledge climb up
  c.prop("chimney", 6, 3.8);
  c.prop("tank", 8.5, -3.3);
  c.roof({ gap: 4.6, len: 10, w: 9, style: "brick", how: "sprintJump" });
  c.checkpoint(2);
  // star 3: a long shortcut along a mural wall skipping two hops
  c.wallrun({ side: "right", from: -1, to: 10.6, off: 1.5, h: 5, look: "mural2" });
  c.starAhead(6, -1.1, 1.7, "shortcut");
  c.tag("stars").go(5.8, -0.4, { sprint: true }).go(9.55, -0.5, { act: "wallrun", side: "right", sprint: true }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.4, len: 4, w: 6, v: 3.4, style: "low", takeoffV: 2 });
  c.tag(null);
  c.roof({ gap: 2.4, len: 12, w: 11, v: 0, style: "tower", takeoffV: -1.2, landV: 2.2, edgeTag: "safe" });
  c.prop("acBig", 9, 4);
  c.finish(7);
  return c.build();
}

/* 3 — LAUNDRY LINES: planks, a turn, vault rhythm */
function l3() {
  const c = mk(3, "Laundry Lines");
  c.start({ len: 14, w: 12, style: "apartment" });
  c.prop("laundry", 7, 4.2, { ghost: true });
  c.prop("laundry", 7, -4.2, { ghost: true });
  c.vault(10, { h: 0.75, w: 7 });
  c.beam({ gap: 0.01, len: 6, w: 0.9 });
  c.starAhead(-3, 0, 1.1, "main");
  c.roof({ gap: 0.01, len: 14, w: 10, style: "brick", how: "walk" });
  c.checkpoint(2);
  c.vault(6, { h: 0.85, w: 10 });
  c.vault(10, { h: 0.7, w: 10, look: "barrier" });
  c.turn("left");
  c.roof({ gap: 2.8, len: 10, w: 9, style: "office" });
  c.prop("ac", 4, 3.4);
  c.prop("ac", 4, -3.4);
  // risky: star on the far end of a narrow side plank
  c.star(8, -3.6, 1.0, "risky");
  c.prop("planter", 8, 3.6, { turn90: false });
  c.tag("stars").go(7, -3.4).go(8.6, -2, { pass: true }).tag(null);
  c.beam({ gap: 0.01, len: 7, w: 0.8 });
  c.roof({ gap: 0.01, len: 12, w: 10, style: "apartment", how: "walk" });
  c.checkpoint(2);
  c.pipe(6.5, { w: 10 });
  c.roof({ gap: 3.4, len: 10, w: 9, dy: -1.4, style: "brick" });
  // shortcut: dash straight over a gap the safe route walks around via a plank detour
  c.prop("vent", 3, 3.2);
  c.starAhead(4, -0.6, 1.5, "shortcut");
  c.tag("stars").go(6.5, 0, { sprint: true }).go(9.55, 0, { act: "dashJump", sprint: true, dashAt: 0.22 }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.2, len: 4, w: 4, v: -3.2, style: "low", takeoffV: -2.6 });
  c.tag(null);
  c.roof({ gap: 2.4, len: 14, w: 12, v: 0, style: "tower", takeoffV: 1.4, landV: -2.8, edgeTag: "safe" });
  c.prop("antenna", 12, 5);
  c.finish(8);
  return c.build();
}

/* 4 — CHIMNEY STEPS: climbing up and dropping down the roofline */
function l4() {
  const c = mk(4, "Chimney Steps");
  c.start({ len: 12, w: 11, style: "brick" });
  c.prop("chimney", 4, 4);
  c.prop("chimney", 7, -4);
  c.roof({ gap: 1.6, len: 10, w: 10, dy: 1.8, style: "apartment" });
  c.prop("chimney", 5, 3.6);
  c.roof({ gap: 1.6, len: 10, w: 10, dy: 2.0, style: "brick" });
  c.starAhead(-2, -3.4, 1.0, "risky");
  c.tag("stars").go(6, -2.5).go(8, -3.4, { pass: true }).go(9.5, -0.5).tag(null);
  c.checkpoint(2);
  c.roof({ gap: 3.6, len: 13, w: 10, dy: -3.0, style: "office" });
  c.pipe(9, { w: 10 });
  c.roof({ gap: 2.8, len: 9, w: 9, dy: -0.8, style: "low" });
  c.starAhead(1.4, 0, 1.3, "main");
  c.roof({ gap: 1.8, len: 12, w: 10, dy: 2.1, style: "apartment" });
  c.checkpoint(2);
  c.vault(6.5, { h: 1.2, d: 0.8, w: 10, look: "barrier" });
  // shortcut: wall run left straight to the final roof
  c.wallrun({ side: "left", from: -1, to: 11.2, off: 1.5, h: 5 });
  c.starAhead(6, 1.05, 1.7, "shortcut");
  c.tag("stars").go(9.3, 0.3, { sprint: true }).go(11.55, 0.4, { act: "wallrun", side: "left", sprint: true }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.2, len: 5, w: 5, v: -3.4, dy: 0.8, style: "low", takeoffV: -2.8 });
  c.tag(null);
  c.roof({ gap: 2.0, len: 14, w: 12, v: 0, style: "tower", takeoffV: 1.2, landV: -3, edgeTag: "safe", dy: -0.8 });
  c.prop("tank", 10, 3.6);
  c.finish(7);
  return c.build();
}

/* 5 — WALL WALKER: wall runs left/right, a wall jump chain */
function l5() {
  const c = mk(5, "Wall Walker");
  c.start({ len: 14, w: 11, style: "apartment" });
  c.wallrun({ side: "left", from: -3, to: 9.2, off: 1.5, h: 5 });
  c.roof({ gap: 8.6, len: 12, w: 10, style: "office", how: "wallrun", side: "left", lineV: 0.5 });
  c.checkpoint(2);
  c.wallrun({ side: "right", from: -3, to: 9.4, off: 1.5, h: 5, look: "mural2" });
  c.starAhead(4.5, -1.1, 1.8, "main");
  c.roof({ gap: 9, len: 12, w: 10, style: "brick", how: "wallrun", side: "right", lineV: -0.5 });
  c.vault(6, { h: 0.8, w: 10 });
  c.wallrun({ side: "left", from: -2, to: 7.8, off: 1.4, h: 5, lineV: 0.4 });
  c.roof({ gap: 7.2, len: 12, w: 6, v: -4.6, style: "apartment", how: "wallrun", side: "left", lineV: 0.8, wjAt: 3.4 });
  c.checkpoint(2);
  // risky: high star above the far wall-run's end (needs a full wall run, no jump)
  c.wallrun({ side: "right", from: -2, to: 9.4, off: 1.4, h: 5, lineV: 0 });
  c.starAhead(8.4, -1.0, 1.7, "risky");
  c.roof({ gap: 9.4, len: 12, w: 10, style: "office", how: "wallrun", side: "right", lineV: -0.4 });
  c.pipe(6, { w: 10 });
  // shortcut: an extra wall straight to the finish roof; safe route detours via a corner hop
  c.wallrun({ side: "left", from: -1, to: 10.6, off: 1.5, h: 5, look: "billboard" });
  c.starAhead(5.5, 1.05, 1.7, "shortcut");
  c.tag("stars").go(8.8, 0.3, { sprint: true }).go(11.55, 0.4, { act: "wallrun", side: "left", sprint: true }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.4, len: 4.5, w: 5, v: -8.2, style: "low", takeoffV: -2.8 });
  c.tag(null);
  c.roof({ gap: 2.3, len: 14, w: 12, v: -4.6, style: "tower", takeoffV: 1.4, landV: -3, edgeTag: "safe" });
  c.finish(7);
  return c.build();
}

/* 6 — GOLDEN HOUR: sprint gaps and dash gaps with safety roofs */
function l6() {
  const c = mk(6, "Golden Hour");
  c.start({ len: 16, w: 11, style: "apartment" });
  c.prop("ac", 5, 4);
  c.roof({ gap: 5.0, len: 12, w: 10, style: "brick", how: "sprintJump" });
  c.under({ a: 0.6, b: 4.4, w: 8, dy: -3 });
  c.roof({ gap: 7.0, len: 12, w: 10, style: "office", how: "dashJump", dashAt: 0.24 });
  c.checkpoint(2);
  c.starAhead(3.8, 0, 2.0, "main");
  c.under({ a: 0.6, b: 7.4, w: 8, dy: -3 });
  c.roof({ gap: 7.4, len: 10, w: 10, style: "apartment", how: "dashJump", dashAt: 0.26 });
  c.vault(5, { h: 0.85, w: 10 });
  c.roof({ gap: 4.8, len: 10, w: 10, dy: -1.5, style: "low", how: "sprintJump" });
  c.checkpoint(2);
  // risky: a star on a big AC unit right at the roof edge
  c.prop("acBig", 6.5, -3.6);
  c.star(6.5, -3.6, 1.5 + 1.0, "risky");
  c.tag("stars").go(4.6, -2.2).go(5.0, -2.8, { act: "jump" }).go(6.5, -3.6, { land: true }).go(8.6, -1.0, { pass: true }).tag(null);
  c.under({ a: 0.6, b: 6.2, w: 8, dy: -2.8 });
  c.roof({ gap: 6.8, len: 12, w: 10, dy: 0, style: "brick", how: "dashJump", dashAt: 0.24 });
  c.pipe(5.5, { w: 10 });
  c.wallrun({ side: "right", from: -1, to: 10.6, off: 1.5, h: 5, look: "mural2" });
  c.starAhead(5.6, -1.05, 1.7, "shortcut");
  c.tag("stars").go(8.8, -0.3, { sprint: true }).go(11.55, -0.4, { act: "wallrun", side: "right", sprint: true }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.4, len: 4.5, w: 5, v: 3.6, style: "low", takeoffV: 2.8 });
  c.tag(null);
  c.roof({ gap: 2.3, len: 14, w: 12, v: 0, style: "tower", takeoffV: -1.4, landV: 3, edgeTag: "safe" });
  c.finish(7);
  return c.build();
}

/* 7 — STEAM ALLEY: the first hazard — vents that burst on a rhythm */
function l7() {
  const c = mk(7, "Steam Alley");
  c.start({ len: 14, w: 10, style: "brick" });
  c.prop("vent", 4, 3.6);
  c.hazard("steam", 10, 0, { period: 2.8, wait: true });
  c.prop("acBig", 10, 3.7, { turn90: true });
  c.prop("acBig", 10, -3.7, { turn90: true });
  c.roof({ gap: 2.8, len: 14, w: 10, style: "office" });
  c.vault(5, { h: 0.8, w: 10 });
  c.hazard("steam", 10.5, -1.6, { period: 3.2, phase: 0.5 });
  c.hazard("steam", 10.5, 1.6, { period: 3.2, phase: 0 });
  c.roof({ gap: 3.2, len: 12, w: 10, dy: -1, style: "apartment" });
  c.checkpoint(2);
  c.pipe(4.5, { w: 10 });
  c.starAhead(-4, -3.2, 1.0, "risky");
  c.tag("stars").go(6.5, -2.6).go(8, -3.2, { pass: true }).go(9.6, -0.6).tag(null);
  c.roof({ gap: 4.9, len: 12, w: 10, style: "brick", how: "sprintJump" });
  c.hazard("steam", 6, 0, { period: 3, wait: true });
  c.prop("ac", 6, 3.9);
  c.prop("ac", 6, -3.9);
  c.starAhead(1.6, 0, 1.5, "main");
  c.roof({ gap: 2.6, len: 12, w: 10, style: "office" });
  c.checkpoint(2);
  c.wallrun({ side: "left", from: -1, to: 10.2, off: 1.5, h: 5 });
  c.starAhead(5.4, 1.05, 1.7, "shortcut");
  c.tag("stars").go(8.6, 0.3, { sprint: true }).go(11.55, 0.4, { act: "wallrun", side: "left", sprint: true }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.4, len: 4.2, w: 5, v: -3.6, style: "low", takeoffV: -2.8 });
  c.tag(null);
  c.roof({ gap: 2.2, len: 14, w: 12, v: 0, style: "tower", takeoffV: 1.4, landV: -3, edgeTag: "safe" });
  c.finish(7.5);
  return c.build();
}

/* 8 — ROOFTOP GARDEN: high vaults, planters, two turns */
function l8() {
  const c = mk(8, "Rooftop Garden");
  c.start({ len: 16, w: 12, style: "apartment" });
  c.prop("planter", 5, 4.6);
  c.prop("planter", 5, -4.6);
  c.prop("bench", 9, 4.6);
  c.vault(11, { h: 1.2, d: 0.9, w: 12, look: "barrier" });
  c.roof({ gap: 2.6, len: 12, w: 11, style: "brick" });
  c.turn("right");
  c.roof({ gap: 3.0, len: 16, w: 10, dy: -1, style: "office" });
  c.checkpoint(1.8);
  c.vault(3.4, { h: 0.9, w: 10 });
  c.prop("planter", 9, 3.6);
  c.star(9, 3.6, 0.6 + 1.0, "risky");
  c.tag("stars").go(4.9, 0.4).go(5.6, 3.6, { slow: 0.7 }).go(6.6, 3.6, { act: "jump" }).go(8.6, 3.6, { land: true }).go(10.9, 3.6, { pass: true }).go(11.6, 1.4, { pass: true }).tag(null);
  c.roof({ gap: 4.8, len: 12, w: 10, style: "apartment", how: "sprintJump" });
  c.pipe(6, { w: 10 });
  c.turn("left");
  c.roof({ gap: 2.6, len: 12, w: 10, dy: 1.9, style: "brick" });
  c.checkpoint(2);
  c.starAhead(3.2, 0, 1.9, "main");
  c.under({ a: 0.6, b: 6.6, w: 8, dy: -3 });
  c.roof({ gap: 7.0, len: 10, w: 10, style: "office", how: "dashJump", dashAt: 0.24 });
  c.vault(5, { h: 0.8, w: 10 });
  c.wallrun({ side: "right", from: -1, to: 10.4, off: 1.5, h: 5, look: "mural2" });
  c.starAhead(5.4, -1.05, 1.7, "shortcut");
  c.tag("stars").go(6.6, -0.3, { sprint: true }).go(9.55, -0.4, { act: "wallrun", side: "right", sprint: true }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.4, len: 4.4, w: 5, v: 3.6, style: "low", takeoffV: 2.8 });
  c.tag(null);
  c.roof({ gap: 2.2, len: 14, w: 12, v: 0, style: "tower", takeoffV: -1.4, landV: 3, edgeTag: "safe" });
  c.prop("planter", 3, 5);
  c.finish(8);
  return c.build();
}

/* 9 — BILLBOARD BOULEVARD: billboard wall runs and wall-jump switchbacks */
function l9() {
  const c = mk(9, "Billboard Boulevard");
  c.start({ len: 14, w: 11, style: "office" });
  c.wallrun({ side: "right", from: -3, to: 9.4, off: 1.5, h: 6, look: "billboard" });
  c.roof({ gap: 9, len: 10, w: 10, style: "brick", how: "wallrun", side: "right", lineV: -0.5 });
  c.checkpoint(2);
  c.wallrun({ side: "left", from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: 0.4 });
  c.roof({ gap: 7.2, len: 10, w: 6, v: -4.6, style: "office", how: "wallrun", side: "left", lineV: 0.8, wjAt: 3.4 });
  // on the wall-jump arc, just before this roof's edge
  c.star(-2.2, 4.5, 3.2, "main");
  c.wallrun({ side: "right", from: -2, to: 7.8, off: 1.4, h: 6, look: "billboard", lineV: -0.4 });
  c.roof({ gap: 7.2, len: 12, w: 6, v: 0, style: "apartment", how: "wallrun", side: "right", lineV: -0.8, wjAt: 3.4 });
  c.checkpoint(2);
  c.pipe(6, { w: 6 });
  c.under({ a: 0.6, b: 6.3, w: 8, dy: -3 });
  c.roof({ gap: 6.9, len: 10, w: 10, style: "brick", how: "dashJump", dashAt: 0.24 });
  // risky: a star perched on the billboard frame (walk off a high AC block onto it)
  c.prop("acBig", 6, -3.2);
  c.star(6, -3.2, 1.5 + 0.9, "risky");
  c.tag("stars").go(4, -1.8).go(4.6, -2.6, { act: "jump" }).go(6, -3.2, { land: true }).go(7.6, -0.8, { pass: true }).tag(null);
  c.wallrun({ side: "left", from: -1, to: 10.6, off: 1.5, h: 6, look: "billboard" });
  c.starAhead(5.6, 1.05, 1.7, "shortcut");
  c.tag("stars").go(6.8, 0.3, { sprint: true }).go(9.55, 0.4, { act: "wallrun", side: "left", sprint: true }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.4, len: 4.4, w: 5, v: -3.6, style: "low", takeoffV: -2.8 });
  c.tag(null);
  c.roof({ gap: 2.2, len: 14, w: 12, v: 0, style: "tower", takeoffV: 1.4, landV: -3, edgeTag: "safe" });
  c.finish(7.5);
  return c.build();
}

/* 10 — SUNSET SPRINT: the district finale, everything so far */
function l10() {
  const c = mk(10, "Sunset Sprint");
  c.start({ len: 14, w: 11, style: "apartment" });
  c.vault(8, { h: 0.85, w: 11 });
  c.roof({ gap: 4.8, len: 12, w: 10, style: "brick", how: "sprintJump" });
  c.pipe(5, { w: 10 });
  c.roof({ gap: 1.8, len: 10, w: 10, dy: 2, style: "office" });
  c.checkpoint(2);
  c.wallrun({ side: "left", from: -3, to: 9.2, off: 1.5, h: 5 });
  c.roof({ gap: 8.8, len: 10, w: 10, style: "apartment", how: "wallrun", side: "left", lineV: 0.5 });
  c.starAhead(-2.6, 0, 1.2, "main");
  c.hazard("steam", 6, 0, { period: 2.8, wait: true });
  c.prop("ac", 6, 3.9);
  c.prop("ac", 6, -3.9);
  c.under({ a: 0.6, b: 6.6, w: 8, dy: -3 });
  c.roof({ gap: 7.2, len: 12, w: 10, style: "brick", how: "dashJump", dashAt: 0.24 });
  c.checkpoint(2);
  c.turn("right");
  c.wallrun({ side: "right", from: -2, to: 7.8, off: 1.4, h: 5, look: "mural2", lineV: -0.4 });
  c.roof({ gap: 7.2, len: 10, w: 6, v: 4.6, style: "office", how: "wallrun", side: "right", lineV: -0.8, wjAt: 3.4 });
  c.star(6, 1.6, 1.0, "risky");
  c.prop("chimney", 7.6, 1.8);
  c.tag("stars").go(5, 0.8).go(6.2, 1.6, { pass: true }).go(8, 0, { pass: true }).tag(null);
  c.roof({ gap: 3.0, len: 12, w: 10, v: 4.6, dy: -1, style: "apartment" });
  c.checkpoint(2);
  c.vault(5, { h: 1.15, d: 0.8, w: 10, look: "barrier" });
  c.wallrun({ side: "left", from: -1, to: 10.6, off: 1.5, h: 5, look: "billboard" });
  c.starAhead(5.6, 1.05, 1.7, "shortcut");
  c.tag("stars").go(8.8, 0.3, { sprint: true }).go(11.55, 0.4, { act: "wallrun", side: "left", sprint: true }).tag(null);
  c.tag("safe");
  c.roof({ gap: 2.4, len: 4.4, w: 5, v: 4.6 - 3.6, style: "low", takeoffV: -2.8 });
  c.tag(null);
  c.roof({ gap: 2.2, len: 16, w: 13, v: 4.6, style: "tower", takeoffV: 1.4, landV: -3, edgeTag: "safe" });
  c.prop("antenna", 13, 5.5);
  c.finish(8);
  return c.build();
}

export default [l2(), l3(), l4(), l5(), l6(), l7(), l8(), l9(), l10()];
