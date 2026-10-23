/** Chapter 9 — The Dimensional Maze (levels 81–90). */
import { level, on, at, container, pickup, keypad, lever, toggle, dial, buttons, slot, movable, clue, wires, mirrors, timed, prop, machine } from "./common.js";

const final = (verb = "Step through.") => ({ until: { flag: "_never" }, h: ["The way is open.", "Nothing holds you here now.", verb] });
const G4 = ["moon", "eye", "fish", "star"];
const LIGHT = ["red", "green", "blue"];

export default [
  level({
    id: 81,
    name: "The Folded Floor",
    objective: "Read the floor from the right angle.",
    room: { door: { w: "N", x: 0, style: "portal" } },
    objects: [
      clue("floor", "floor", at(0, 1.8, 0, 0.01), { style: "neon", grid: [["V", "Q", "T", "X"], ["K", "O", "B", "M"], ["Z", "R", "I", "W"], ["H", "J", "U", "D"]] }, { label: "Glowing Floor Letters" }),
      clue("note", "holo", on("E", 0, 1.7), { style: "neon", lines: ["Read the diagonal,", "from the corner", "nearest the portal."] }, { label: "Floating Note" }),
      keypad("kp", on("W", 0, 1.3), "VOID", { glyphs: "letters", label: "Portal Lock", clues: ["floor", "note"], derived: true }),
      prop("floatCubes", at(2.4, 2.2)),
    ],
    exit: { cond: { solved: "kp" } },
    hints: [
      { until: { solved: "kp" }, h: ["The floor letters form a 4×4 grid.", "Start at the top-left corner (the side nearest the portal) and go diagonally.", "V, O, I, D."] },
      final(),
    ],
    solution: [{ a: "click", id: "note" }, { a: "click", id: "floor" }, { a: "code", id: "kp", v: "VOID" }, { a: "click", id: "door" }],
  }),

  level({
    id: 82,
    name: "Portal Pairs",
    objective: "Connect each portal to its destination.",
    room: { door: { w: "N", x: -1.6, style: "portal" } },
    objects: [
      clue("rules", "holo", on("E", 0, 1.6), { style: "neon", title: "PORTAL LAW", lines: ["Blue leads to the moon.", "Red never leads to the sun.", "Each world takes one portal."] }, { label: "Portal Law" }),
      wires("links", on("W", 0, 1.3), ["red", "blue", "green"], ["sun", "moon", "star"], { red: "star", blue: "moon", green: "sun" }, { rightGlyphs: ["sun", "moon", "star"], label: "Portal Junction", clues: ["rules"] }),
      prop("portalRing", on("S", 0, 0)),
      prop("crystal", at(2.4, 2.4)),
    ],
    exit: { cond: { solved: "links" } },
    hints: [
      { until: { solved: "links" }, h: ["Use the portal law to deduce each link.", "Blue → moon. Red can't go to the sun, and the moon is taken…", "Red → star, blue → moon, green → sun."] },
      final(),
    ],
    solution: [{ a: "click", id: "rules" }, { a: "wire", id: "links", map: { red: "star", blue: "moon", green: "sun" } }, { a: "click", id: "door" }],
  }),

  level({
    id: 83,
    name: "The Prism Gallery",
    objective: "Bend the light through the folded gallery.",
    room: { door: { w: "N", x: 1.6, style: "portal" } },
    objects: [
      mirrors(
        "prism",
        at(0, 1.8, 0),
        {
          size: [7, 6],
          source: { at: [-1, 5], dir: "E" },
          targets: [[1, 0]],
          cells: [
            { x: 2, y: 5, m: "\\" },
            { x: 2, y: 3, m: "/" },
            { x: 4, y: 3, m: "\\" },
            { x: 4, y: 1, m: "/" },
            { x: 1, y: 1, m: "\\" },
            { x: 3, y: 5, block: true },
            { x: 5, y: 3, block: true },
            { x: 2, y: 0, block: true },
            { x: 5, y: 1, m: "/" },
            { x: 6, y: 4, m: "\\" },
          ],
        },
        { label: "Prism Table", onSolve: { msg: "The light folds through the room — the portal ignites." } },
      ),
      clue("memo", "holo", on("E", 0, 1.6), { style: "neon", lines: ["The light enters low", "and must end high,", "near where it began."] }, { label: "Floating Memo" }),
    ],
    exit: { cond: { solved: "prism" } },
    hints: [
      { until: { solved: "prism" }, h: ["Follow the beam and fix one mirror at a time.", "It must zig-zag up the middle and come back left along the second row.", "Rotate the bottom mirror, the middle-right mirror, and the upper-right mirror."] },
      final(),
    ],
    solution: [{ a: "click", id: "memo" }, { a: "rotate", id: "prism", cell: 0 }, { a: "rotate", id: "prism", cell: 2 }, { a: "rotate", id: "prism", cell: 3 }, { a: "click", id: "door" }],
  }),

  level({
    id: 84,
    name: "Geared Discs",
    objective: "Align the three geared discs.",
    room: { door: { w: "N", x: 0, style: "portal" } },
    objects: [
      clue("target", "holo", on("E", -0.6, 1.6), { style: "neon", title: "ALIGNMENT", lines: ["Outer: EYE", "Middle: STAR", "Inner: FISH"] }, { label: "Alignment Glyphs" }),
      clue("warning", "holo", on("E", 0.8, 1.6), { style: "neon", lines: ["The discs are geared:", "middle drags outer,", "inner drags middle."] }, { label: "Gear Warning" }),
      dial("outer", on("W", -0.7, 1.4), G4, { style: "disc", label: "Outer Disc" }),
      dial("middle", on("W", 0, 1.4), G4, { style: "disc", label: "Middle Disc", links: ["outer"] }),
      dial("inner", on("W", 0.7, 1.4), G4, { style: "disc", label: "Inner Disc", links: ["middle"] }),
    ],
    exit: { cond: { dial: { outer: 1, middle: 3, inner: 2 } } },
    hints: [
      { until: { unlocked: "door" }, h: ["Turning a disc also turns the one it's geared to — set them from the inside out.", "Inner first (it drags the middle), then middle (it drags the outer), then fix the outer.", "Turn the inner disc twice, the middle once, and leave the outer."] },
      final(),
    ],
    solution: [
      { a: "click", id: "target" },
      { a: "click", id: "warning" },
      { a: "click", id: "inner" },
      { a: "click", id: "inner" },
      { a: "click", id: "middle" },
      { a: "click", id: "door" },
    ],
  }),

  level({
    id: 85,
    name: "The Labyrinth Map",
    objective: "Trace the only path through the maze.",
    room: { door: { w: "N", x: -1.6, style: "portal" } },
    objects: [
      clue("map", "chalkboard", on("E", 0, 1.6), { style: "neon", title: "S → E", grid: [["", "", "#", "E"], ["", "#", "", ""], ["", "", "", "#"], ["S", "#", "", ""]] }, { label: "Maze Map" }),
      buttons("pad", on("W", 0, 1.3), [{ id: "U", label: "↑" }, { id: "D", label: "↓" }, { id: "L", label: "←" }, { id: "R", label: "→" }], ["U", "R", "R", "U", "R", "U"], { label: "Direction Pad", clues: ["map"] }),
      clue("legend", "holo", on("S", 0, 1.6), { style: "neon", lines: ["# = wall", "one step per press"] }, { label: "Map Legend" }),
    ],
    exit: { cond: { solved: "pad" } },
    hints: [
      { until: { solved: "pad" }, h: ["Start at S, end at E, never step on #.", "Most routes are dead ends — only one gets to E.", "Up, right, right, up, right, up."] },
      final(),
    ],
    solution: [
      { a: "click", id: "map" },
      { a: "click", id: "legend" },
      ...["U", "R", "R", "U", "R", "U"].map((b) => ({ a: "press", id: "pad", b })),
      { a: "click", id: "door" },
    ],
  }),

  level({
    id: 86,
    name: "The Endless Stair",
    objective: "Complete both sequences.",
    room: { door: { w: "N", x: 1.6, style: "portal" } },
    objects: [
      clue("s1", "holo", on("E", -0.8, 1.6), { style: "neon", title: "SEQUENCE I", lines: ["1, 1, 2, 3, 5, 8, ?"] }, { label: "Sequence I" }),
      clue("s2", "holo", on("E", 0.8, 1.6), { style: "neon", title: "SEQUENCE II", lines: ["3, 6, 12, 24, ?"] }, { label: "Sequence II" }),
      clue("rule", "holo", on("W", 0, 1.9), { style: "neon", lines: ["Code: answer I,", "then answer II."] }, { label: "Instruction" }),
      keypad("kp", on("W", 0, 1.2), "1348", { label: "Stair Lock", clues: ["s1", "s2", "rule"], derived: true }),
      prop("stairsVoid", on("S", 0, 0)),
    ],
    exit: { cond: { solved: "kp" } },
    hints: [
      { until: { solved: "kp" }, h: ["Each number follows a rule.", "Sequence I adds the two previous numbers; sequence II doubles.", "13 and 48 → enter 1348."] },
      final(),
    ],
    solution: [{ a: "click", id: "s1" }, { a: "click", id: "s2" }, { a: "click", id: "rule" }, { a: "code", id: "kp", v: "1348" }, { a: "click", id: "door" }],
  }),

  level({
    id: 87,
    name: "Light Mixer",
    objective: "Mix purple and yellow light.",
    room: { door: { w: "N", x: 0, style: "portal" } },
    objects: [
      clue("wheel", "holo", on("E", -0.7, 1.6), { style: "neon", title: "LIGHT", lines: ["red + blue = purple", "red + green = yellow", "green + blue = cyan"] }, { label: "Light Chart" }),
      clue("ask", "holo", on("E", 0.8, 1.6), { style: "neon", title: "THE PORTAL ASKS", colors: ["purple", "yellow"] }, { label: "Portal's Request" }),
      dial("a1", on("W", -0.9, 1.4), LIGHT, { style: "disc", label: "Beam A1" }),
      dial("a2", on("W", -0.3, 1.4), LIGHT, { style: "disc", label: "Beam A2" }),
      dial("b1", on("W", 0.3, 1.4), LIGHT, { style: "disc", label: "Beam B1" }),
      dial("b2", on("W", 0.9, 1.4), LIGHT, { style: "disc", label: "Beam B2" }),
      clue("labels", "holo", on("W", 0, 2.1), { style: "neon", lines: ["PAIR A → purple      PAIR B → yellow"] }, { label: "Pair Labels" }),
    ],
    exit: {
      cond: {
        all: [
          { any: [{ dial: { a1: 0, a2: 2 } }, { dial: { a1: 2, a2: 0 } }] },
          { any: [{ dial: { b1: 0, b2: 1 } }, { dial: { b1: 1, b2: 0 } }] },
        ],
      },
    },
    hints: [
      { until: { unlocked: "door" }, h: ["Pair A must make purple, pair B yellow.", "The light chart tells you which two colours make each.", "A: red + blue. B: red + green."] },
      final(),
    ],
    solution: [
      { a: "click", id: "wheel" },
      { a: "click", id: "ask" },
      { a: "click", id: "labels" },
      { a: "turn", id: "a2", to: 2 },
      { a: "turn", id: "b2", to: 1 },
      { a: "click", id: "door" },
    ],
  }),

  level({
    id: 88,
    name: "The Echo Chamber",
    objective: "Remember the echo and repeat it.",
    room: { door: { w: "N", x: -1.6, style: "portal" } },
    objects: [
      clue("tip", "holo", on("E", 0.9, 1.6), { style: "neon", lines: ["The echo shows once.", "Remember it."] }, { label: "Whisper" }),
      timed("play", on("E", -0.6, 1.3), 4, { label: "Play Echo" }),
      clue("echo", "holo", on("E", -0.6, 1.95), { style: "neon", title: "ECHO", glyphs: ["spiral", "eye", "spiral", "drop", "eye"] }, { showIf: { active: "play" }, label: "The Echo" }),
      buttons("rep", on("W", 0, 1.3), [{ id: "spiral", glyph: "spiral" }, { id: "eye", glyph: "eye" }, { id: "drop", glyph: "drop" }], ["spiral", "eye", "spiral", "drop", "eye"], { label: "Echo Stones", clues: ["echo"] }),
      prop("crystal", at(2.4, 2.4)),
    ],
    exit: { cond: { solved: "rep" } },
    hints: [
      { until: { solved: "rep" }, h: ["Press Play Echo — a pattern appears for 4 seconds.", "Memorise the symbols, then repeat them on the echo stones.", "Spiral, eye, spiral, drop, eye."] },
      final(),
    ],
    solution: [
      { a: "click", id: "tip" },
      { a: "click", id: "play" },
      { a: "click", id: "echo" },
      { a: "wait", s: 5 },
      ...["spiral", "eye", "spiral", "drop", "eye"].map((b) => ({ a: "press", id: "rep", b })),
      { a: "click", id: "door" },
    ],
  }),

  level({
    id: 89,
    name: "The Portal Engine",
    objective: "Charge the portal engine with both orbs.",
    room: { door: { w: "N", x: 1.6, style: "portal" } },
    objects: [
      slot("f1", on("W", -0.6, 1.4), ["orb", "orbPurple"], { style: "holder", label: "Left Frame" }),
      slot("f2", on("W", 0.6, 1.4), ["orb", "orbPurple"], { style: "holder", label: "Right Frame" }),
      clue("order", "holo", on("W", 0, 2.1), { style: "neon", lines: ["Light on the left,", "void on the right."] }, { label: "Engine Inscription" }),
      pickup("o1", "orb", at(-2.2, 1.8, 0, 0.9), { label: "Glass Orb" }),
      prop("floatCubes", at(-2.2, 1.8)),
      container("cube", "box", at(2.2, 2.0, 0, 0), { lock: { cond: { solved: "kp" } }, contents: ["orbPurple"], label: "Void Box" }),
      clue("riddle", "holo", on("E", 0, 1.6), { style: "neon", title: "VOID BOX", lines: ["Sides of a cube,", "then corners of a cube."] }, { label: "Void Riddle" }),
      keypad("kp", on("E", 1.2, 1.3), "68", { label: "Void Box Lock", clues: ["riddle"], derived: true }),
      machine("eng", "gears", on("S", 0, 0.5), { placed: { f1: "orb", f2: "orbPurple" } }, { label: "Portal Engine" }),
    ],
    exit: { cond: { placed: { f1: "orb", f2: "orbPurple" } } },
    hints: [
      { until: { got: "orb" }, h: ["One orb floats in plain sight.", "Look among the floating cubes.", "Take the glass orb."] },
      { until: { solved: "kp" }, h: ["The void box asks about a cube.", "A cube has 6 sides and 8 corners.", "Enter 68."] },
      { until: { got: "orbPurple" }, h: ["The void box opened.", "Take what's inside.", "Take the void orb."] },
      { until: { unlocked: "door" }, h: ["The inscription says light left, void right.", "The glass orb is the light.", "Glass orb → left frame, void orb → right frame."] },
      final(),
    ],
    solution: [
      { a: "click", id: "o1" },
      { a: "click", id: "riddle" },
      { a: "code", id: "kp", v: "68" },
      { a: "click", id: "cube" },
      { a: "take", id: "cube", item: "orbPurple" },
      { a: "click", id: "order" },
      { a: "use", item: "orb", id: "f1" },
      { a: "use", item: "orbPurple", id: "f2" },
      { a: "click", id: "door" },
    ],
  }),

  level({
    id: 90,
    name: "Heart of the Maze",
    objective: "Unfold the heart of the maze.",
    room: { door: { w: "N", x: 0, style: "portal" } },
    objects: [
      clue("t1", "holo", on("E", -1.2, 1.7), { style: "neon", title: "LAYER I", lines: ["Outer: FISH · Inner: EYE", "(inner drags outer)"] }, { label: "Layer I Glyphs" }),
      dial("outer", on("W", -0.9, 1.6), G4, { style: "disc", label: "Outer Disc" }),
      dial("inner", on("W", -0.3, 1.6), G4, { style: "disc", label: "Inner Disc", links: ["outer"] }),
      container("core", "box", at(-1.6, -1.0), { lock: { cond: { dial: { outer: 2, inner: 1 } } }, autoOpen: true, contents: ["crystal"], label: "Layer Core", lockedMsg: "Sealed by the discs." }),
      timed("flash", on("W", 0.6, 1.3), 4, { label: "Memory Flash" }),
      clue("mem", "holo", on("W", 0.6, 1.95), { style: "neon", title: "FLASH", glyphs: ["bolt", "leaf", "leaf", "bolt"] }, { showIf: { active: "flash" }, label: "Flash Pattern" }),
      buttons("echo", on("S", -0.6, 1.3), [{ id: "bolt", glyph: "bolt" }, { id: "leaf", glyph: "leaf" }], ["bolt", "leaf", "leaf", "bolt"], { label: "Memory Stones", clues: ["mem"], needs: { cond: { placed: { heart: "crystal" } }, msg: "The stones are dormant. The heart socket is empty." } }),
      slot("heart", on("S", 0.6, 1.3), "crystal", { style: "holder", label: "Heart Socket", swap: false }),
      mirrors(
        "beam",
        at(1.4, -0.6, 0),
        {
          size: [4, 4],
          source: { at: [-1, 3], dir: "E" },
          targets: [[3, 0]],
          cells: [
            { x: 1, y: 3, m: "\\" },
            { x: 1, y: 1, m: "\\" },
            { x: 3, y: 1, m: "/" },
            { x: 2, y: 2, block: true },
          ],
        },
        { label: "Beam Table", onSolve: { msg: "The beam strikes the heart." }, needs: { cond: { solved: "echo" }, msg: "The table is dark. Wake the memory stones first." } },
      ),
    ],
    exit: { cond: { solved: "beam" } },
    hints: [
      { until: { dial: { outer: 2, inner: 1 } }, h: ["Layer I: set the outer and inner discs. Turning the inner also turns the outer.", "Set the inner first, then fix the outer.", "Turn the inner once (outer moves too), then the outer once more."] },
      { until: { placed: { heart: "crystal" } }, h: ["The layer core opened.", "Take the crystal and find the heart socket.", "Use the crystal on the heart socket on the back wall."] },
      { until: { solved: "echo" }, h: ["Press Memory Flash and watch.", "Repeat the four symbols on the memory stones.", "Bolt, leaf, leaf, bolt."] },
      { until: { solved: "beam" }, h: ["Last: the beam table.", "Climb up from the bottom row, then right to the top-right crystal.", "Rotate the two left mirrors."] },
      final(),
    ],
    solution: [
      { a: "click", id: "t1" },
      { a: "click", id: "inner" },
      { a: "click", id: "outer" },
      { a: "take", id: "core", item: "crystal" },
      { a: "use", item: "crystal", id: "heart" },
      { a: "click", id: "flash" },
      { a: "click", id: "mem" },
      { a: "wait", s: 5 },
      ...["bolt", "leaf", "leaf", "bolt"].map((b) => ({ a: "press", id: "echo", b })),
      { a: "rotate", id: "beam", cell: 0 },
      { a: "rotate", id: "beam", cell: 1 },
      { a: "click", id: "door" },
    ],
  }),
];
