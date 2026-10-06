/**
 * Level 1 — FIRST ROOFTOP (Sunset District). The quality benchmark and the
 * tutorial: every move is introduced once, in a safe spot, with one short
 * contextual hint.
 *
 *  R1 start roof ─ jump ─ R2 (vault vent, slide pipe) ─ sprint gap ─ R3 [CP]
 *  ─ WALL RUN (left mural) ─ R4 [CP] ─ WALL RUN (right) + WALL JUMP ─ R5
 *  ─ DASH gap (safety roof below → ledge climb back) ─ R6 [CP] ⟶ turn right
 *  ─ zig-zag hops (safe)  /  long wall-run shortcut (star 3) ─ R8 ─ FINISH
 *
 *  Star 1: over the first gap (main route)
 *  Star 2: on the water tank on R1 (climb: AC unit → ledge grab)
 *  Star 3: on the wall-run shortcut after the turn
 */
import { course } from "../kit.js";

const c = course({ id: 1, name: "First Rooftop", world: 1, streetY: -30, targetTime: 32 });

/* R1 — start roof */
c.start({ len: 26, w: 12, style: "apartment", spawnU: 3 });
c.hint(0, 11, "move");
c.prop("door", 3.2, -4.6, { rot: 0 });
c.prop("ac", 7.5, 4.6);
c.prop("ac", 10.5, 4.6);
c.prop("vent", 18, 4.9);
c.prop("antenna", 23.5, 5.2);
c.prop("dish", 21, -5.0);
c.prop("laundry", 6.5, 2.9, { turn90: false, ghost: true });
// star 2 detour: AC unit as a step up onto the water tank
c.prop("ac", 12.6, -4.0, { turn90: true });
c.prop("tank", 15.0, -4.2);
c.hint(17, 26, "jump");
c.tag("stars").go(10.2, -4.0, { slow: 0.6 }).go(11.6, -4.0, { act: "jump", fx: 0, fz: 1 }).go(12.6, -4.0, { land: true, pass: true }).go(13.2, -4.0, { act: "climb" }).go(15.0, -4.2, { land: true }).go(15.6, -1.2, { pass: true }).tag(null);
c.star(15.0, -4.2, 4.2 + 1.0, "risky");
c.starAhead(1.1, 0, 1.45, "main");

/* R2 — vault + slide */
c.roof({ gap: 2.3, len: 30, w: 11, style: "office" });
c.hint(1.5, 8, "vault");
c.vault(8.5, { h: 0.85, d: 0.7, w: 6.4 });
c.prop("ac", 8.8, 4.4, { turn90: true });
c.prop("acBig", 8.8, -4.3, { turn90: true });
c.hint(12, 19, "slide");
c.pipe(19.5, { clear: 1.12, w: 11 });
c.prop("solar", 24, 3.9, { turn90: true });
c.prop("solar", 24, -3.9, { turn90: true });
c.hint(23, 30, "sprint");

/* R3 — sprint gap, checkpoint, first wall run */
c.roof({ gap: 4.9, len: 18, w: 11, style: "apartment", how: "sprintJump" });
c.checkpoint(3.2);
c.prop("chimney", 6, 4.4);
c.prop("crates", 9, -4.2);
c.hint(8, 18, "wallrun");
c.wallrun({ side: "left", from: -4.5, to: 9.4, off: 1.5, h: 5.5, look: "mural" });

/* R4 — second wall run with wall jump to a roof off to the left */
c.roof({ gap: 8.8, len: 14, w: 10, style: "brick", how: "wallrun", side: "left", lineV: 0.6 });
c.checkpoint(4);
c.hint(5, 14, "walljump");
c.prop("ac", 10.5, -4.0);
c.wallrun({ side: "right", from: -3, to: 8.2, off: 1.4, h: 5.5, look: "mural2", lineV: -0.4 });

/* R5 — the dash gap (lower safety roof below → ledge grab back up) */
c.roof({ gap: 7.6, len: 14, w: 7, v: 4.4, style: "office", how: "wallrun", side: "right", lineV: -0.8, wjAt: 3.6 });
c.hint(4, 14, "dash");
c.prop("vent", 3, 2.6);
c.prop("skylight", 6.5, -1.9, { turn90: true });
c.under({ a: 0.8, b: 7.2, w: 9, dy: -2.9, style: "low" });

/* R6 — after the dash: checkpoint, then the corner */
c.roof({ gap: 7.2, len: 18, w: 10, style: "apartment", how: "dashJump", dashAt: 0.24 });
c.checkpoint(2.5);
c.prop("planter", 7, 4.2);
c.prop("bench", 9.5, 4.2);
c.prop("planter", 12, 4.2);
c.prop("ac", 4.5, -4.1);
c.turn("right");

/* after the turn: safe zig-zag (right then back) or the wall-run shortcut */
c.wallrun({ side: "left", from: -0.6, to: 10.1, off: 1.55, h: 6, look: "billboard", lineV: 0 });
c.starAhead(6.2, 0.95, 1.75, "shortcut");
c.prop("antenna", 2.5, -4.4);
// shortcut nodes (stars route): straight off the corner, along the billboard wall
c.tag("stars").go(5.5, 0.3, { sprint: true }).go(9.55, 0.4, { act: "wallrun", side: "left", sprint: true }).tag(null);
// safe route: hop right onto a small roof, then forward-left onto R8
c.tag("safe");
c.roof({ gap: 2.4, len: 5, w: 6, v: -4.5, style: "low", how: "jump", takeoffV: -3.6 });
c.prop("vent", 2.6, -1.9);
c.tag(null);
c.roof({ gap: 2.6, len: 10, w: 8, v: 0, style: "office", how: "jump", takeoffV: 1.9, landV: -2.2, edgeTag: "safe" });

/* finish roof */
c.roof({ gap: 2.4, len: 18, w: 13, v: 0, style: "tower" });
c.prop("ac", 4, 5.2);
c.prop("acBig", 13.5, -5.0);
c.prop("antenna", 16.5, 5.4);
c.finish(9);

export default c.build();
