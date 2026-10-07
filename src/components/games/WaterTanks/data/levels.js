/**
 * Water Tanks — the handcrafted campaign, in authored form (see
 * engine/level.js for the format). Every level is checked by
 * tools/validateLevels.mjs: valid data, solvable, and `optimal` equals the
 * BFS optimum. tools/annotate.mjs shows that each special mechanic actually
 * changes its level's solution (it isn't decoration).
 *
 *   cap / start           capacity and starting litres
 *   shape                 tall | standard | wide | jar | flask (visual only)
 *   fill / drain          true = unlimited, n = uses
 *   lock "A:3"            sealed until A holds exactly 3 L
 *   inlet                 receives water but never pours out
 *   valves ["A>B"]        one-way pipe: A may pour into B, never B into A
 *   target 4 | "B:4" | ["A:4", 2]
 */
export const LEVELS = [
  /* ---------------------------------------------------- 1 · CLEAR WATER */
  { name: "First Pour", tip: "Pick a tank, then pick where to pour.", tanks: [{ cap: 4, start: 4 }, { cap: 2, shape: "tall" }], target: 2, optimal: 1 },
  { name: "What's Left", tip: "The water left behind counts too.", tanks: [{ cap: 5, start: 5 }, { cap: 3, shape: "tall" }], target: 2, optimal: 1 },
  { name: "Third Glass", tip: "Three tanks now — plan two pours ahead.", tanks: [{ cap: 6, start: 6, shape: "wide" }, { cap: 4 }, { cap: 1, shape: "tall" }], target: 3, optimal: 2 },
  { name: "Small Steps", tanks: [{ cap: 8, start: 8, shape: "wide" }, { cap: 3 }, { cap: 2, shape: "tall" }], target: 4, optimal: 3 },
  { name: "Seven Measures", tanks: [{ cap: 7, start: 7, shape: "wide" }, { cap: 5 }, { cap: 2, shape: "tall" }], target: 4, optimal: 3 },
  { name: "Just One", tanks: [{ cap: 7, start: 7, shape: "wide" }, { cap: 5, shape: "jar" }, { cap: 2, shape: "tall" }], target: 1, optimal: 4 },
  { name: "Right Tank", tip: "This target belongs to one tank — follow the green line.", tanks: [{ cap: 8, start: 8, shape: "wide" }, { cap: 3 }, { cap: 2, shape: "tall" }], target: "B:1", optimal: 2 },
  { name: "Half Started", tip: "Some tanks start with water already in them.", tanks: [{ cap: 9, start: 9, shape: "wide" }, { cap: 6, start: 2 }, { cap: 4, shape: "tall" }], target: 3, optimal: 2 },
  { name: "Six of Eight", tanks: [{ cap: 8, start: 8, shape: "wide" }, { cap: 5, shape: "jar" }, { cap: 3, shape: "tall" }], target: 6, optimal: 3 },
  { name: "Even Split", tip: "A classic. Take your time.", tanks: [{ cap: 8, start: 8, shape: "wide" }, { cap: 5, shape: "jar" }, { cap: 3, shape: "tall" }], target: 4, optimal: 6 },

  /* --------------------------------------------------- 2 · DEEP MEASURE */
  { name: "Ten Litre Tank", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 7 }, { cap: 3, shape: "tall" }], target: 1, optimal: 4 },
  { name: "Deeper Water", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 7, shape: "jar" }, { cap: 3, shape: "tall" }], target: 2, optimal: 6 },
  { name: "Twelve Down", tanks: [{ cap: 12, start: 12, shape: "wide" }, { cap: 7 }, { cap: 5, shape: "tall" }], target: 4, optimal: 6 },
  { name: "Off Balance", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10, start: 3 }, { cap: 7, shape: "tall" }], target: "C:6", optimal: 5 },
  { name: "Four Glasses", tip: "A fourth tank opens new routes.", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 9, shape: "jar" }, { cap: 6, start: 3 }, { cap: 3, shape: "tall" }], target: 5, optimal: 6 },
  { name: "Eight Exactly", tanks: [{ cap: 12, start: 12, shape: "wide" }, { cap: 7, shape: "jar" }, { cap: 5, shape: "tall" }], target: 8, optimal: 7 },
  { name: "The Long Way", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10, start: 3 }, { cap: 7, shape: "tall" }], target: "B:8", optimal: 6 },
  { name: "Quartet", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10 }, { cap: 6, shape: "jar" }, { cap: 5, shape: "tall" }], target: 3, optimal: 6 },
  { name: "Narrow Margin", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 8 }, { cap: 5, shape: "tall" }], target: 7, optimal: 8 },
  { name: "Deep Measure", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 8, shape: "jar" }, { cap: 7 }, { cap: 4, shape: "tall" }], target: 9, optimal: 7 },

  /* ------------------------------------------------------ 3 · VALVE LAB */
  { name: "One Way", tip: "Valves only let water flow along the arrow.", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 7 }, { cap: 4, shape: "tall" }], valves: ["C>A"], target: 2, optimal: 5 },
  { name: "Sealed Tank", tip: "A sealed tank opens when its condition is met.", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 6 }, { cap: 5, shape: "tall", lock: "A:4" }], target: "C:5", optimal: 2 },
  { name: "Inlet Only", tip: "Inlet tanks take water in but never pour it out.", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 8, inlet: true, shape: "jar" }, { cap: 2, start: 1, shape: "tall" }], target: 4, optimal: 4 },
  { name: "Two Valves", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 9, start: 2 }, { cap: 6, shape: "tall" }], valves: ["B>A", "C>B"], target: 3, optimal: 4 },
  { name: "Sealed Reserve", tip: "Sealed tanks can hold water of their own.", tanks: [{ cap: 9, start: 9, shape: "wide" }, { cap: 7 }, { cap: 6, start: 2, shape: "tall", lock: "A:2" }], target: "A:6", optimal: 4 },
  { name: "Backflow", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 9, shape: "jar" }, { cap: 6, start: 4 }], valves: ["B>A"], target: 3, optimal: 4 },
  { name: "Collector", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 9, inlet: true, shape: "jar" }, { cap: 8 }, { cap: 3, shape: "tall" }], target: 7, optimal: 8 },
  { name: "Pressure Seal", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10 }, { cap: 8, start: 7, lock: "A:8", shape: "jar" }, { cap: 7, shape: "tall" }], target: "C:2", optimal: 7 },
  { name: "Valve Chain", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10 }, { cap: 6, shape: "jar" }, { cap: 5, shape: "tall" }], valves: ["D>C", "D>A"], target: 9, optimal: 8 },
  { name: "Valve Lab", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10, start: 10, lock: "D:2" }, { cap: 8, shape: "jar" }, { cap: 7, shape: "tall" }], valves: ["B>A"], target: "C:5", optimal: 9 },

  /* ------------------------------------------------- 4 · PRESSURE WORKS */
  { name: "Tap Water", tip: "Tap FILL to top a tank up from the mains. It counts as a move.", tanks: [{ cap: 5, fill: true }, { cap: 3, shape: "tall" }], target: 2, optimal: 2 },
  { name: "Down the Drain", tip: "DRAIN empties a tank completely. It counts as a move.", tanks: [{ cap: 7, start: 7, shape: "wide" }, { cap: 3, drain: true, shape: "tall" }], target: 1, optimal: 3 },
  { name: "Five and Three", tanks: [{ cap: 5, fill: true }, { cap: 3, drain: true, shape: "tall" }], target: 4, optimal: 6 },
  { name: "Twin Targets", tip: "Two targets — each needs its own tank.", tanks: [{ cap: 8, start: 8, shape: "wide" }, { cap: 5, shape: "jar" }, { cap: 3, shape: "tall" }], target: [4, 4], optimal: 7 },
  { name: "Limited Tap", tip: "This tap only works a few times — watch the counter.", tanks: [{ cap: 10 }, { cap: 6, fill: 1, drain: 2, start: 5 }, { cap: 5, shape: "tall" }], target: "B:2", optimal: 6 },
  { name: "Split Pair", tanks: [{ cap: 9, start: 9, shape: "wide" }, { cap: 7 }, { cap: 4, shape: "tall" }], target: ["A:3", "B:6"], optimal: 6 },
  { name: "Drain Budget", tanks: [{ cap: 9, drain: 2, start: 4, shape: "wide" }, { cap: 8, fill: 1 }, { cap: 6, shape: "tall" }], target: "C:5", optimal: 7 },
  { name: "Seven and Four", tanks: [{ cap: 7, fill: true, shape: "wide" }, { cap: 4, drain: true, shape: "tall" }], target: 6, optimal: 6 },
  { name: "Mains Pressure", tanks: [{ cap: 9, fill: 1, drain: 2, start: 5, shape: "wide" }, { cap: 8 }, { cap: 5, shape: "tall" }], target: "B:7", optimal: 8 },
  { name: "Pressure Works", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 7, shape: "jar" }, { cap: 3, shape: "tall" }], target: [5, 5], optimal: 9 },

  /* ----------------------------------------------- 5 · MASTER RESERVOIR */
  { name: "Guarded Split", tanks: [{ cap: 10, start: 10, shape: "wide" }, { cap: 7 }, { cap: 4, shape: "tall" }], valves: ["C>A"], target: ["A:5", "B:5"], optimal: 10 },
  { name: "Three Taps", tanks: [{ cap: 10, fill: 3 }, { cap: 9, drain: 1, shape: "jar" }, { cap: 5, shape: "tall" }], target: "B:2", optimal: 9 },
  { name: "Overflow Plan", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 9, inlet: true, shape: "jar" }, { cap: 8 }, { cap: 3, shape: "tall" }], target: 4, optimal: 9 },
  { name: "Cross Current", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10, start: 5 }, { cap: 9 }, { cap: 5, shape: "tall" }], valves: ["C>A", "D>A"], target: 8, optimal: 7 },
  { name: "Locked Flow", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10, start: 7, lock: "A:4" }, { cap: 9, shape: "jar" }, { cap: 5, shape: "tall" }], target: "C:8", optimal: 8 },
  { name: "Hidden Reserve", tanks: [{ cap: 12, start: 12, shape: "wide" }, { cap: 10, start: 8, lock: "D:3" }, { cap: 7, shape: "jar" }, { cap: 6, shape: "tall" }], target: "C:3", optimal: 10 },
  { name: "Five Tanks", tip: "Five tanks — find the short route.", tanks: [{ cap: 12, start: 12, shape: "wide" }, { cap: 9 }, { cap: 7, shape: "jar" }, { cap: 4 }, { cap: 2, shape: "tall" }], target: ["A:8", "C:1"], optimal: 7 },
  { name: "Two by Valve", tanks: [{ cap: 11, start: 11, shape: "wide" }, { cap: 10 }, { cap: 6, shape: "jar" }, { cap: 5, shape: "tall" }], valves: ["D>C", "D>A"], target: ["A:8", "C:3"], optimal: 10 },
  { name: "Last Drops", tanks: [{ cap: 10, fill: 2, start: 6, shape: "wide" }, { cap: 9, drain: 1 }, { cap: 6, shape: "tall" }], target: "B:2", optimal: 9 },
  { name: "Master Reservoir", tip: "Everything you've learned, in one lab.", tanks: [{ cap: 12, start: 12, shape: "wide" }, { cap: 10, lock: "A:1", shape: "jar" }, { cap: 9 }, { cap: 7 }, { cap: 6, start: 6, shape: "tall" }], valves: ["B>C"], target: ["A:3", "C:1"], optimal: 10 },
];
