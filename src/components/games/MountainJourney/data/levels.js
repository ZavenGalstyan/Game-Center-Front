/**
 * Mountain Journey — the 30 authored levels (5 regions × 6).
 *
 * Each level is an ordered list of trail segments (engine/builder.js
 * SEGMENTS): the trail is laid forward segment by segment, so a level reads
 * like its walk. Every level has exactly 3 Mountain Badges and at least one
 * viewpoint; engine/bot.js plays each one end to end in tools/simTest.mjs.
 *
 * Common segment options: len, turn (radians over the segment), rise (m),
 * w (half width), l / r (bank kinds: wall | low | drop), surf.
 */

import { ASCENT_LEVELS } from "./levelsAscent.js";

const FIRST_LEVELS = [
  // ── REGION 1 — GREEN VALLEY ───────────────────────────────────────────────
  {
    id: 1,
    name: "The First Trail",
    weather: "sunnyMorning",
    seed: 101,
    valley: 30,
    objective: "Follow the forest trail to the mountain flag",
    tips: [
      { at: 0, text: "WASD to walk · Mouse to look around · Shift to run" },
      { badge: true, text: "Mountain Badges hide along the trail — find all three" },
    ],
    segs: [
      ["start", {}],
      ["path", { len: 15, turn: 0.35, rise: 0.6 }],
      ["badge", { at: "path", side: -1.0 }],
      ["path", { len: 12, turn: -0.5, rise: 0.8 }],
      ["stream", {}],
      ["path", { len: 9, turn: 0.25, rise: 1.2 }],
      ["log", {}],
      ["path", { len: 10, turn: 0.2, rise: 1.2 }],
      ["badge", { at: "spur", side: "left", len: 9 }],
      ["path", { len: 8, turn: -0.3, rise: 0.5 }],
      ["bridge", { kind: "wood", len: 7 }],
      ["checkpoint", {}],
      ["path", { len: 12, turn: 0.4, rise: 2 }],
      ["viewpoint", { side: "right", name: "Valley Overlook" }],
      ["path", { len: 10, turn: -0.2, rise: 1.5 }],
      ["badge", { at: "high" }],
      ["path", { len: 12, turn: 0.3, rise: 1.5 }],
      ["finish", {}],
    ],
  },
  {
    id: 2,
    name: "Whispering Falls",
    weather: "warmAfternoon",
    seed: 202,
    valley: 32,
    objective: "Cross the river below the falls",
    tip: "Hop from stone to stone — the river is too deep to wade",
    segs: [
      ["start", {}],
      ["path", { len: 12, turn: -0.3, rise: 0.5 }],
      ["waterfall", { side: "left", h: 8 }],
      ["path", { len: 10, turn: 0.35, rise: 1 }],
      ["badge", { at: "spur", side: "right", len: 8, turn: -0.5 }],
      ["path", { len: 8, turn: 0.1, rise: 0.4 }],
      ["stones", { n: 4, spacing: 2.4, falls: { dist: 13, height: 10 } }],
      ["checkpoint", {}],
      ["path", { len: 12, turn: -0.4, rise: 1.6 }],
      ["mover", { len: 7 }],
      ["path", { len: 8, turn: 0.3, rise: 0.8 }],
      ["badge", { at: "high" }],
      ["checkpoint", {}],
      ["path", { len: 10, turn: 0.3, rise: 1.5 }],
      ["viewpoint", { side: "left", name: "Falls Lookout" }],
      ["path", { len: 10, turn: -0.3, rise: 1.2 }],
      ["badge", { at: "path", side: 1.1 }],
      ["path", { len: 8, rise: 0.8 }],
      ["finish", {}],
    ],
  },
  {
    id: 3,
    name: "Mossy Ledges",
    weather: "mistyForest",
    seed: 303,
    valley: 30,
    objective: "Climb the mossy ledges and open the old bridge",
    tip: "Pale ledges with yellow marks can be climbed — walk into them or press Space",
    segs: [
      ["start", {}],
      ["path", { len: 12, turn: 0.3, rise: 0.8 }],
      ["ledge", { h: 2.2 }],
      ["path", { len: 10, turn: -0.35, rise: 0.6 }],
      ["badge", { at: "spur", side: "right", len: 8 }],
      ["path", { len: 6, turn: 0.15 }],
      ["ladder", { h: 3.8 }],
      ["checkpoint", {}],
      ["path", { len: 12, turn: 0.35, rise: 1 }],
      ["badge", { at: "high", h: 1.1 }],
      ["path", { len: 6, turn: -0.2 }],
      ["leverBridge", { len: 5 }],
      ["path", { len: 10, turn: -0.3, rise: 1.4 }],
      ["viewpoint", { side: "right", name: "Mossy Bluff" }],
      ["path", { len: 9, turn: 0.25, rise: 1 }],
      ["log", {}],
      ["path", { len: 8, turn: 0.2, rise: 0.8 }],
      ["badge", { at: "path", side: -1.1 }],
      ["path", { len: 6 }],
      ["finish", {}],
    ],
  },
];

export const LEVELS = [...FIRST_LEVELS, ...ASCENT_LEVELS];

/** The main-menu vista: a camp trail ending on a cliff above a river valley. */
export const MENU_LEVEL = {
  id: 0,
  name: "Mountain Journey",
  weather: "warmAfternoon",
  seed: 4242,
  valley: 52,
  objective: "",
  segs: [
    ["start", {}],
    ["path", { len: 12, turn: 0.15, rise: 1 }],
    ["path", { len: 26, rise: 2, r: "drop", turn: -0.1 }],
    ["vista", { side: "right", dist: 90, lake: { dist: 150, along: 60, r: 46 } }],
    ["path", { len: 6, w: 3.6, r: "drop" }],
    ["finish", { r: "drop", w: 3.6, cap: "drop" }],
  ],
};

export const TOTAL_LEVELS = 30;
export const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));
export const getLevel = (id) => LEVEL_BY_ID.get(id) || null;
