/**
 * Rooftop Dash — the main-menu set: one dressed rooftop with the runner at
 * the edge looking out over the skyline, and a few roofs stepping away in
 * front for depth. Built with the same kit as the levels (no finish).
 */
import { course } from "./kit.js";

export function menuLevel(world = 1) {
  const c = course({ id: 900 + world, name: "Menu", world, streetY: world === 5 ? -90 : -34, noFinish: true });
  c.start({ len: 16, w: 13, style: "apartment", spawnU: 14.6 });
  c.prop("tank", 4.5, -3.8);
  c.prop("ac", 3.2, 4.4);
  c.prop("ac", 6.2, 4.4);
  c.prop("antenna", 1.5, 5.4);
  c.prop("laundry", 3.5, 1.0, { ghost: true });
  c.prop("planter", 12.5, -4.9, { turn90: false });
  c.prop("door", 9.5, -4.6);
  c.prop("vent", 14.2, 3.0);
  c.roof({ gap: 5, len: 14, w: 11, dy: -3, style: "office", v: 2 });
  c.prop("acBig", 6, -2.5);
  c.prop("solar", 9, 2.5, { turn90: true });
  c.roof({ gap: 6, len: 18, w: 14, dy: 1.5, style: "brick", v: -3 });
  c.prop("tank", 9, 3.5);
  c.prop("chimney", 4, -4);
  c.roof({ gap: 7, len: 12, w: 10, dy: -2, style: "tower", v: 5 });
  c.prop("dish", 5, 0);
  return c.build();
}
