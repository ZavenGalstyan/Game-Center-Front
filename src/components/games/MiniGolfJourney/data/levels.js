/**
 * Mini Golf Journey — all 50 hand-authored levels (5 worlds × 10).
 *
 * Deterministic data only: the same level always renders and plays the same.
 * Terse authoring format, normalised by obstacles.js:
 *
 *   start / hole : [x, y]                       logical units (field 320×180)
 *   walls        : [x1, y1, x2, y2, thickness?] capsule segments
 *   hazards      : ['sand'|'water'|'ice'|'snow', x, y, w, h]   rect
 *                  ['water', cx, cy, r]                         circle
 *   obstacles    : { o:'box'|'spinner'|'gate'|'conveyor', ... }
 *   portals      : [ax, ay, bx, by, r?, hue?]
 *   decor        : [type, x, y, scale?]
 *
 * The engine adds the four perimeter walls itself. Intended gaps are ≥ 22
 * units so the ball (r ≈ 3.2) always has fair passage.
 */

import { worldForLevel } from "./worlds.js";
import { normHazard, normObstacle } from "./obstacles.js";

let _n = 0;
const _LEVELS = [];

function lvl(def) {
  _n += 1;
  const n = _n;
  const world = worldForLevel(n);
  const levelNumber = ((n - 1) % 10) + 1;
  const level = {
    id: n,
    worldId: world.id,
    levelNumber,
    par: def.par,
    name: def.name || `${world.name} · Hole ${levelNumber}`,
    hint: def.hint || "",
    start: { x: def.start[0], y: def.start[1] },
    hole: { x: def.hole[0], y: def.hole[1] },
    walls: (def.walls || []).map((w) => ({
      x1: w[0],
      y1: w[1],
      x2: w[2],
      y2: w[3],
      t: w[4] || 5,
    })),
    hazards: (def.hazards || []).map(normHazard),
    obstacles: (def.obstacles || []).map(normObstacle),
    portals: (def.portals || []).map((p) => ({
      ax: p[0],
      ay: p[1],
      bx: p[2],
      by: p[3],
      r: p[4] || 9,
      hue: p[5] ?? 190,
    })),
    decorations: (def.decor || []).map((d) => ({
      type: d[0],
      x: d[1],
      y: d[2],
      s: d[3] || 1,
    })),
  };
  _LEVELS.push(level);
  return level;
}

/* ============================ WORLD 1 · GREEN VALLEY ====================== */

lvl({
  par: 2,
  name: "First Putt",
  hint: "Drag back from the ball, release to putt. Straight and simple.",
  start: [40, 90],
  hole: [280, 90],
  decor: [["tree", 30, 6, 1.1], ["tree", 250, 4, 0.9], ["bush", 120, 172], ["flower", 200, 168]],
});

lvl({
  par: 2,
  name: "The Slant",
  hint: "A single angled wall — go around it or bank off it.",
  start: [38, 128],
  hole: [284, 54],
  walls: [[150, 150, 205, 58]],
  decor: [["tree", 60, 4], ["bush", 250, 170], ["flower", 100, 168], ["rock", 300, 150, 0.8]],
});

lvl({
  par: 2,
  name: "Around the Corner",
  hint: "A simple L — down the bottom, then up to the cup.",
  start: [40, 140],
  hole: [262, 42],
  walls: [
    [14, 110, 214, 110],
    [214, 110, 214, 14],
  ],
  decor: [["tree", 40, 4], ["bush", 120, 172], ["rock", 150, 96, 0.7], ["flower", 250, 150]],
});

lvl({
  par: 3,
  name: "Two Gates",
  hint: "Weave past the staggered barriers.",
  start: [38, 92],
  hole: [286, 92],
  walls: [
    [112, 14, 112, 112],
    [206, 68, 206, 166],
  ],
  decor: [["tree", 20, 4], ["tree", 280, 4, 0.9], ["bush", 60, 172], ["bush", 250, 172]],
});

lvl({
  par: 3,
  name: "Bank It",
  hint: "Bank off the top rail to swing the ball down onto the green.",
  start: [42, 150],
  hole: [280, 44],
  walls: [[92, 150, 236, 66]],
  decor: [["tree", 20, 6], ["rock", 300, 40, 0.9], ["flower", 60, 168], ["bush", 180, 172]],
});

lvl({
  par: 4,
  name: "The Narrows",
  hint: "A tight Z-corridor. Small taps — right along the bottom, up, back left.",
  start: [34, 142],
  hole: [58, 40],
  walls: [
    [100, 64, 306, 64],
    [14, 116, 214, 116],
  ],
  decor: [["tree", 40, 4], ["bush", 280, 172], ["rock", 260, 40, 0.7]],
});

lvl({
  par: 3,
  name: "Risk & Reward",
  hint: "Thread the top for a short line, or take the safe road below.",
  start: [36, 96],
  hole: [286, 66],
  walls: [
    [128, 58, 190, 58],
    [128, 58, 128, 118],
    [190, 58, 190, 118],
    [128, 118, 190, 118],
  ],
  decor: [["tree", 20, 4], ["tree", 300, 4, 0.8], ["flower", 90, 168], ["bush", 230, 172]],
});

lvl({
  par: 4,
  name: "The Weave",
  hint: "Up one side, over the top, down the other.",
  start: [34, 150],
  hole: [290, 150],
  walls: [
    [96, 166, 150, 74],
    [190, 74, 244, 166],
    [150, 74, 190, 74],
  ],
  decor: [["tree", 20, 6], ["tree", 300, 6, 0.9], ["bush", 160, 172], ["flower", 60, 168]],
});

lvl({
  par: 4,
  name: "Swinging Bar",
  hint: "A rail slides up and down the middle. Time the gap.",
  start: [36, 92],
  hole: [288, 92],
  walls: [
    [162, 14, 162, 34],
    [162, 150, 162, 166],
  ],
  obstacles: [
    { o: "gate", x: 162, y: 92, len: 58, axis: "y", travel: 74, period: 3.4 },
  ],
  decor: [["tree", 20, 4], ["tree", 292, 4, 0.9], ["bush", 90, 172]],
});

lvl({
  par: 4,
  name: "Valley Finale",
  hint: "Bottom corridor, bank the ramp, time the gate into the slot.",
  start: [32, 150],
  hole: [286, 40],
  walls: [
    [14, 112, 176, 112],
    [206, 112, 262, 58],
    [214, 14, 214, 62],
  ],
  obstacles: [
    { o: "gate", x: 248, y: 92, len: 40, axis: "x", travel: 58, period: 3 },
  ],
  decor: [["tree", 20, 6], ["tree", 120, 4, 0.9], ["rock", 150, 100, 0.7], ["flower", 60, 168]],
});

/* ============================ WORLD 2 · SUNSET BEACH ===================== */

lvl({
  par: 2,
  name: "Soft Sand",
  hint: "Sand kills your roll — give it more power.",
  start: [40, 90],
  hole: [284, 90],
  hazards: [["sand", 130, 58, 70, 64]],
  decor: [["palm", 24, 4], ["palm", 280, 4, 0.9], ["shell", 120, 170], ["beachRock", 300, 150, 0.9]],
});

lvl({
  par: 3,
  name: "Lagoon Edge",
  hint: "Water down the flank — into it costs a stroke.",
  start: [38, 44],
  hole: [286, 130],
  hazards: [["water", 40, 96, 240, 60]],
  walls: [[40, 66, 280, 66]],
  decor: [["palm", 24, 4], ["umbrella", 300, 30], ["shell", 60, 24]],
});

lvl({
  par: 3,
  name: "The Bridge",
  hint: "A narrow plank over open water. Straight and gentle.",
  start: [36, 90],
  hole: [288, 90],
  hazards: [
    ["water", 96, 16, 128, 60],
    ["water", 96, 104, 128, 60],
  ],
  decor: [["palm", 20, 4], ["palm", 300, 4, 0.9], ["beachRock", 60, 168, 0.8]],
});

lvl({
  par: 3,
  name: "Sand & Slant",
  hint: "Angled wall past a sand pit.",
  start: [40, 140],
  hole: [284, 50],
  walls: [[140, 154, 202, 58]],
  hazards: [["sand", 60, 40, 66, 54]],
  decor: [["palm", 20, 6], ["umbrella", 300, 150], ["shell", 250, 168]],
});

lvl({
  par: 4,
  name: "Split Lagoon",
  hint: "A pool in the middle — high road or low road.",
  start: [36, 90],
  hole: [288, 90],
  hazards: [["water", 116, 66, 96, 48]],
  decor: [["palm", 20, 4], ["palm", 300, 4], ["shell", 90, 24], ["beachRock", 200, 170, 0.9]],
});

lvl({
  par: 4,
  name: "Shortcut Plank",
  hint: "A thin plank cuts the corner — or loop around dry.",
  start: [34, 144],
  hole: [286, 44],
  hazards: [
    ["water", 70, 24, 150, 78],
    ["water", 150, 118, 130, 48],
  ],
  walls: [[220, 40, 220, 132]],
  decor: [["palm", 20, 6], ["umbrella", 40, 24], ["beachRock", 300, 168, 0.9]],
});

lvl({
  par: 4,
  name: "Dune Run",
  hint: "Three sand traps stagger the fairway.",
  start: [36, 90],
  hole: [288, 90],
  hazards: [
    ["sand", 84, 20, 52, 60],
    ["sand", 150, 100, 52, 60],
    ["sand", 216, 20, 52, 60],
  ],
  decor: [["palm", 20, 4], ["palm", 300, 4, 0.9], ["shell", 130, 172]],
});

lvl({
  par: 4,
  name: "Long Pier",
  hint: "A long plank over the bay. Keep it centred.",
  start: [30, 92],
  hole: [292, 92],
  hazards: [
    ["water", 70, 14, 210, 58],
    ["water", 70, 112, 210, 58],
  ],
  decor: [["palm", 18, 6], ["palm", 300, 6], ["beachRock", 40, 168, 0.8]],
});

lvl({
  par: 4,
  name: "Bank Over Blue",
  hint: "The pool blocks the middle — go up and around, bank off the deflector.",
  start: [40, 150],
  hole: [284, 150],
  walls: [[120, 58, 188, 22]],
  hazards: [["water", 96, 96, 170, 70]],
  decor: [["palm", 20, 6], ["umbrella", 300, 150], ["shell", 60, 168]],
});

lvl({
  par: 5,
  name: "Beach Championship",
  hint: "Sand, water and a plank — everything the shore taught you.",
  start: [30, 148],
  hole: [290, 42],
  walls: [
    [14, 110, 150, 110],
    [190, 110, 190, 40],
  ],
  hazards: [
    ["sand", 40, 40, 70, 56],
    ["water", 200, 96, 108, 70],
  ],
  decor: [["palm", 18, 6], ["palm", 300, 6, 0.9], ["umbrella", 60, 20], ["beachRock", 150, 170, 0.9]],
});

/* ============================ WORLD 3 · FROZEN PEAKS ==================== */

lvl({
  par: 3,
  name: "First Ice",
  hint: "Ice barely slows the ball — ease off the power.",
  start: [40, 90],
  hole: [284, 90],
  hazards: [["ice", 110, 20, 110, 140]],
  decor: [["pine", 22, 2], ["pine", 286, 2, 0.9], ["snowRock", 120, 170, 0.9]],
});

lvl({
  par: 3,
  name: "Deep Snow",
  hint: "Snow grabs the ball hard. Commit to the shot.",
  start: [40, 90],
  hole: [286, 90],
  hazards: [["snow", 120, 20, 90, 140]],
  decor: [["pine", 22, 2], ["snowman", 60, 168], ["snowRock", 260, 170, 0.8]],
});

lvl({
  par: 3,
  name: "Glazed Corner",
  hint: "The turn is iced — the ball will overshoot.",
  start: [40, 142],
  hole: [264, 44],
  walls: [
    [14, 112, 214, 112],
    [214, 112, 214, 14],
  ],
  hazards: [["ice", 150, 112, 128, 54]],
  decor: [["pine", 24, 2], ["icicle", 214, 20], ["snowRock", 60, 168, 0.8]],
});

lvl({
  par: 4,
  name: "Patchwork",
  hint: "Ice, then snow, then grass. Read each patch.",
  start: [36, 90],
  hole: [288, 90],
  hazards: [
    ["ice", 70, 20, 60, 140],
    ["snow", 150, 20, 60, 140],
  ],
  decor: [["pine", 20, 2], ["pine", 292, 2, 0.9], ["snowman", 250, 170]],
});

lvl({
  par: 4,
  name: "The Long Slide",
  hint: "One big sheet of ice. A whisper of power carries the green.",
  start: [30, 90],
  hole: [292, 90],
  hazards: [["ice", 60, 16, 210, 148]],
  decor: [["pine", 18, 2], ["pine", 300, 2], ["icicle", 150, 12]],
});

lvl({
  par: 4,
  name: "Frozen Bank",
  hint: "Bank off the wall — but the ice keeps the speed.",
  start: [40, 150],
  hole: [284, 46],
  walls: [[86, 150, 244, 62]],
  hazards: [["ice", 60, 40, 220, 120]],
  decor: [["pine", 20, 2], ["snowRock", 300, 40, 0.9], ["icicle", 120, 12]],
});

lvl({
  par: 4,
  name: "Snowbound Pin",
  hint: "Deep snow rings the cup — you must arrive with pace.",
  start: [38, 90],
  hole: [280, 90],
  hazards: [["snow", 214, 40, 92, 100]],
  walls: [[120, 40, 120, 90], [160, 90, 160, 140]],
  decor: [["pine", 20, 2], ["pine", 292, 2, 0.9], ["snowman", 60, 168]],
});

lvl({
  par: 5,
  name: "Slip Zones",
  hint: "Alternating ice and snow. Every patch flips the plan.",
  start: [34, 142],
  hole: [286, 44],
  walls: [[14, 100, 200, 100], [120, 100, 120, 14]],
  hazards: [
    ["ice", 40, 108, 90, 52],
    ["snow", 200, 20, 60, 70],
    ["ice", 200, 100, 106, 60],
  ],
  decor: [["pine", 20, 2], ["icicle", 120, 12], ["snowRock", 300, 168, 0.9]],
});

lvl({
  par: 5,
  name: "Threadle",
  hint: "A narrow iced Z. Right along the bottom, up, then a long glide left-to-right.",
  start: [34, 150],
  hole: [286, 36],
  walls: [
    [96, 60, 306, 60],
    [14, 116, 214, 116],
  ],
  hazards: [["ice", 14, 116, 180, 50], ["ice", 96, 14, 118, 46]],
  decor: [["pine", 20, 2], ["snowRock", 60, 168, 0.8]],
});

lvl({
  par: 5,
  name: "Frozen Championship",
  hint: "Long slide, tight turn, snow guarding the pin.",
  start: [30, 150],
  hole: [288, 132],
  walls: [
    [14, 104, 170, 104],
    [210, 104, 210, 44],
    [210, 44, 306, 44],
  ],
  hazards: [
    ["ice", 30, 110, 150, 52],
    ["ice", 210, 50, 96, 60],
    ["snow", 224, 110, 82, 52],
  ],
  decor: [["pine", 18, 2], ["pine", 300, 2, 0.9], ["snowman", 60, 24], ["icicle", 210, 40]],
});

/* ============================ WORLD 4 · ANCIENT RUINS ================== */

lvl({
  par: 3,
  name: "The First Gate",
  hint: "A stone slab slides across the passage. Wait for the opening.",
  start: [38, 92],
  hole: [286, 92],
  obstacles: [{ o: "gate", x: 160, y: 92, len: 52, axis: "y", travel: 78, period: 3 }],
  walls: [[160, 14, 160, 30], [160, 154, 160, 166]],
  decor: [["pillar", 24, 8], ["pillar", 292, 8], ["vineRock", 120, 172, 0.9]],
});

lvl({
  par: 3,
  name: "Stone Wheel",
  hint: "A rotating bar sweeps the centre. Send it through behind the blade.",
  start: [38, 92],
  hole: [286, 92],
  obstacles: [{ o: "spinner", x: 160, y: 90, len: 92, speed: 1.5 }],
  decor: [["pillar", 24, 8], ["pillar", 292, 8], ["brazier", 60, 170], ["brazier", 258, 170]],
});

lvl({
  par: 4,
  name: "Timing Hall",
  hint: "Two gates out of phase. Ride the rhythm.",
  start: [36, 92],
  hole: [288, 92],
  obstacles: [
    { o: "gate", x: 120, y: 92, len: 52, axis: "y", travel: 74, period: 2.8 },
    { o: "gate", x: 210, y: 92, len: 52, axis: "y", travel: 74, period: 2.8, phase: 1.4 },
  ],
  walls: [[120, 14, 120, 26], [210, 156, 210, 166]],
  decor: [["pillar", 22, 8], ["pillar", 294, 8], ["vineRock", 160, 172, 0.8]],
});

lvl({
  par: 4,
  name: "Slab & Bank",
  hint: "Bank off the ramp, then beat the slab to the cup.",
  start: [40, 150],
  hole: [284, 60],
  walls: [[82, 150, 232, 66]],
  obstacles: [{ o: "gate", x: 250, y: 92, len: 44, axis: "x", travel: 58, period: 2.6 }],
  decor: [["pillar", 22, 8], ["brazier", 60, 24], ["vineRock", 300, 168, 0.9]],
});

lvl({
  par: 5,
  name: "Twin Trials",
  hint: "A spinner and a slab guard the same room.",
  start: [36, 92],
  hole: [288, 92],
  obstacles: [
    { o: "spinner", x: 120, y: 90, len: 84, speed: 1.7 },
    { o: "gate", x: 214, y: 92, len: 56, axis: "y", travel: 70, period: 2.7 },
  ],
  decor: [["pillar", 22, 8], ["pillar", 294, 8], ["brazier", 60, 170], ["brazier", 258, 170]],
});

lvl({
  par: 4,
  name: "The Shortcut Door",
  hint: "A timed gate opens a straight line — miss it and go the long way.",
  start: [34, 140],
  hole: [286, 46],
  walls: [
    [14, 104, 210, 104],
    [210, 104, 210, 62],
    [150, 14, 150, 62],
  ],
  obstacles: [{ o: "gate", x: 180, y: 44, len: 30, axis: "x", travel: 44, period: 3.2 }],
  decor: [["pillar", 22, 8], ["vineRock", 60, 168, 0.9], ["brazier", 300, 24]],
});

lvl({
  par: 5,
  name: "Temple Maze",
  hint: "Up the left aisle, time the slab across the top, down the right aisle.",
  start: [32, 150],
  hole: [288, 150],
  walls: [
    [86, 166, 86, 66],
    [236, 66, 236, 166],
    [86, 66, 236, 66],
  ],
  obstacles: [{ o: "gate", x: 161, y: 44, len: 40, axis: "x", travel: 54, period: 3 }],
  decor: [["pillar", 22, 8], ["pillar", 294, 8], ["brazier", 60, 24]],
});

lvl({
  par: 4,
  name: "Guarded Pin",
  hint: "A bar sweeps the approach — slip past the blade to the cup.",
  start: [36, 92],
  hole: [289, 92],
  obstacles: [{ o: "spinner", x: 250, y: 92, len: 52, speed: 2 }],
  walls: [[150, 40, 150, 96], [196, 88, 196, 144]],
  decor: [["pillar", 22, 8], ["brazier", 60, 170], ["vineRock", 120, 20, 0.8]],
});

lvl({
  par: 5,
  name: "Clockwork Ruin",
  hint: "Spinner, then a gate, then the pin. One rhythm.",
  start: [34, 150],
  hole: [288, 44],
  walls: [[14, 106, 150, 106], [210, 14, 210, 70]],
  obstacles: [
    { o: "spinner", x: 110, y: 66, len: 74, speed: 1.8 },
    { o: "gate", x: 244, y: 96, len: 48, axis: "x", travel: 56, period: 2.5 },
  ],
  decor: [["pillar", 22, 8], ["pillar", 294, 8], ["brazier", 60, 24]],
});

lvl({
  par: 5,
  name: "Ruins Championship",
  hint: "Two spinners, a sliding slab and a bank. The temple's last test.",
  start: [30, 150],
  hole: [290, 132],
  walls: [
    [14, 104, 150, 104],
    [200, 104, 200, 50],
    [200, 50, 306, 50],
  ],
  obstacles: [
    { o: "spinner", x: 96, y: 60, len: 68, speed: 1.9 },
    { o: "spinner", x: 250, y: 92, len: 60, speed: -2.2 },
    { o: "gate", x: 170, y: 132, len: 40, axis: "x", travel: 52, period: 2.6 },
  ],
  decor: [["pillar", 20, 8], ["pillar", 296, 8], ["brazier", 60, 24], ["brazier", 280, 24]],
});

/* ============================ WORLD 5 · NEON CITY ===================== */

lvl({
  par: 3,
  name: "Conveyor",
  hint: "The lit strip pushes the ball. Aim across its flow.",
  start: [38, 92],
  hole: [286, 92],
  obstacles: [{ o: "conveyor", x: 120, y: 30, w: 90, h: 120, dy: 1, force: 150 }],
  decor: [["tower", 20, 2], ["tower", 292, 2, 0.9], ["cityLamp", 120, 172]],
});

lvl({
  par: 3,
  name: "Portal Pair",
  hint: "In one ring, out the other — velocity carries through.",
  start: [40, 92],
  hole: [286, 92],
  walls: [[150, 14, 150, 166]],
  portals: [[110, 92, 210, 92, 9, 190]],
  decor: [["tower", 20, 2], ["sign", 60, 20], ["hover", 250, 30]],
});

lvl({
  par: 4,
  name: "Cross-Current",
  hint: "Putt up the side — the belt carries you across the top.",
  start: [40, 150],
  hole: [286, 150],
  walls: [[92, 166, 92, 84], [230, 84, 230, 166]],
  obstacles: [{ o: "conveyor", x: 92, y: 60, w: 138, h: 24, dx: 1, force: 150 }],
  decor: [["tower", 20, 2], ["tower", 292, 2], ["cityLamp", 300, 150]],
});

lvl({
  par: 4,
  name: "Barrier Beat",
  hint: "A light-barrier slides across. Read its tempo.",
  start: [38, 92],
  hole: [288, 92],
  obstacles: [{ o: "gate", x: 170, y: 92, len: 60, axis: "y", travel: 82, period: 2.4 }],
  walls: [[170, 14, 170, 24], [170, 160, 170, 166]],
  decor: [["tower", 20, 2], ["sign", 250, 18], ["hover", 90, 28]],
});

lvl({
  par: 4,
  name: "Warp Bank",
  hint: "Bank into the portal to line up the pin.",
  start: [40, 150],
  hole: [286, 150],
  walls: [[70, 150, 210, 60]],
  portals: [[150, 40, 250, 150, 9, 280]],
  decor: [["tower", 20, 2], ["tower", 292, 2, 0.9], ["cityLamp", 60, 24]],
});

lvl({
  par: 5,
  name: "Double Belt",
  hint: "Two conveyors pull opposite ways. Find the seam.",
  start: [36, 92],
  hole: [288, 92],
  obstacles: [
    { o: "conveyor", x: 96, y: 20, w: 60, h: 140, dy: 1, force: 150 },
    { o: "conveyor", x: 176, y: 20, w: 60, h: 140, dy: -1, force: 150 },
  ],
  decor: [["tower", 20, 2], ["tower", 292, 2], ["sign", 150, 16]],
});

lvl({
  par: 5,
  name: "Barrier & Warp",
  hint: "Through the barrier, into the portal, out at the pin.",
  start: [34, 150],
  hole: [288, 40],
  walls: [[14, 104, 160, 104], [220, 14, 220, 60]],
  obstacles: [{ o: "gate", x: 120, y: 104, len: 34, axis: "x", travel: 48, period: 2.6 }],
  portals: [[250, 96, 250, 40, 8, 300]],
  decor: [["tower", 20, 2], ["hover", 60, 24], ["cityLamp", 300, 150]],
});

lvl({
  par: 5,
  name: "Grid Lock",
  hint: "A city block that doubles back twice. Small, exact shots.",
  start: [34, 150],
  hole: [286, 46],
  walls: [
    [64, 118, 306, 118],
    [14, 74, 246, 74],
  ],
  decor: [["tower", 20, 2], ["tower", 292, 2], ["sign", 40, 16]],
});

lvl({
  par: 5,
  name: "Circuit",
  hint: "Conveyor, barrier and portal in one loop.",
  start: [34, 150],
  hole: [286, 44],
  walls: [[14, 104, 140, 104], [200, 104, 200, 60]],
  obstacles: [
    { o: "conveyor", x: 40, y: 108, w: 100, h: 52, dx: 1, force: 150 },
    { o: "gate", x: 240, y: 92, len: 44, axis: "x", travel: 54, period: 2.4 },
  ],
  portals: [[170, 130, 170, 40, 8, 260]],
  decor: [["tower", 20, 2], ["tower", 292, 2], ["hover", 60, 22], ["cityLamp", 300, 150]],
});

lvl({
  par: 6,
  name: "Neon Championship",
  hint: "Ride the belt, thread the spinner, then time the barrier — or warp past it.",
  start: [30, 150],
  hole: [290, 44],
  walls: [
    [14, 104, 116, 104],
    [200, 104, 200, 64],
    [200, 64, 268, 64],
  ],
  obstacles: [
    { o: "conveyor", x: 40, y: 120, w: 104, h: 44, dx: 1, force: 150 },
    { o: "spinner", x: 244, y: 88, len: 54, speed: 2 },
    { o: "gate", x: 287, y: 64, len: 42, axis: "x", travel: 44, period: 2.4 },
  ],
  portals: [[150, 140, 246, 34, 8, 280]],
  decor: [["tower", 18, 2], ["tower", 300, 2, 0.9], ["sign", 60, 14], ["hover", 120, 22], ["cityLamp", 120, 172]],
});

export const LEVELS = _LEVELS;

export function getLevel(id) {
  return _LEVELS.find((l) => l.id === Number(id)) || _LEVELS[0];
}

export function levelsForWorld(worldId) {
  return _LEVELS.filter((l) => l.worldId === Number(worldId));
}
