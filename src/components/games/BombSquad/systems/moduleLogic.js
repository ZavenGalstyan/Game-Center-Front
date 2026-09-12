/**
 * Bomb Squad — pure puzzle generation + solution checking for all 10 module
 * types. Nothing in this file touches the DOM, React, or timers: every
 * function is `(puzzle-ish data, rng) -> data` or `(puzzle, attempt) ->
 * boolean`, so it is fully testable in isolation from the module components
 * that render it (systems/moduleFactory.js wires the two together).
 *
 * Puzzle generation always derives the SOLUTION first, then builds the
 * visible puzzle/clue text around it (per-type generate() below) — never the
 * reverse — so nothing here can produce an unsolvable device. RNG is always
 * caller-supplied and seeded (utils/random.js), never Math.random(), so a
 * replay with the same seed reproduces the exact same fair variant.
 */
import { randInt, sample, shuffle } from "../utils/random.js";
import { SYMBOLS, symbolValue } from "../data/symbols.js";

const WIRE_COLORS = ["red", "blue", "yellow", "green", "white", "purple"];
const SERIALS = ["triangle", "circle", "square"];

/* ---------------------------------------------------------- Color Wires */

const WIRE_RULES = [
  {
    test: (wires, serial) => {
      if (serial !== "triangle") return null;
      const idx = wires.findIndex((w) => w.color === "red");
      return idx >= 0 ? idx : null;
    },
    describe: () => "SERIAL TRIANGLE detected → cut the first RED wire.",
  },
  {
    test: (wires) => {
      const blues = wires.map((w, i) => (w.color === "blue" ? i : -1)).filter((i) => i >= 0);
      return blues.length === 2 ? blues[blues.length - 1] : null;
    },
    describe: () => "Exactly two BLUE wires present → cut the rightmost BLUE wire.",
  },
  {
    test: (wires) => {
      if (wires.some((w) => w.color === "yellow")) return null;
      const idx = wires.findIndex((w) => w.color === "green");
      return idx >= 0 ? idx : null;
    },
    describe: () => "No YELLOW wire present → cut the first GREEN wire.",
  },
  {
    test: (wires) => (wires.length % 2 === 1 ? Math.floor(wires.length / 2) : null),
    describe: (wires) => `Wire count is odd (${wires.length}) → cut the middle wire.`,
  },
  {
    test: (wires) => (wires[0].color === wires[wires.length - 1].color ? wires.length - 1 : null),
    describe: () => "First and last wire share a color → cut the last wire.",
  },
  {
    test: (wires) => {
      const idx = wires.findIndex((w) => w.color === "purple");
      return idx >= 0 ? idx : null;
    },
    describe: () => "A PURPLE wire is present → cut the first PURPLE wire.",
  },
  {
    // fallback — always resolves
    test: (wires) => {
      const idx = wires.findIndex((w) => w.color === "red");
      return idx >= 0 ? idx : 0;
    },
    describe: (wires) =>
      wires.some((w) => w.color === "red")
        ? "No special condition met → cut the first RED wire."
        : "No special condition met → cut the first wire.",
  },
];

export function generateColorWires(difficulty, rng) {
  const count = randInt(rng, 4 + Math.min(2, difficulty - 1), Math.min(7, 4 + difficulty + 1));
  const paletteSize = Math.min(WIRE_COLORS.length, 3 + difficulty);
  const palette = WIRE_COLORS.slice(0, paletteSize);
  const wires = Array.from({ length: count }, (_, i) => ({
    id: `w${i}`,
    color: palette[randInt(rng, 0, palette.length - 1)],
  }));
  const serial = difficulty >= 2 && rng() < 0.4 ? SERIALS[randInt(rng, 0, SERIALS.length - 1)] : null;

  let solutionIndex = 0;
  let ruleText = "";
  for (const rule of WIRE_RULES) {
    const idx = rule.test(wires, serial);
    if (idx != null) {
      solutionIndex = idx;
      ruleText = rule.describe(wires, serial);
      break;
    }
  }
  return { wires, serial, solutionId: wires[solutionIndex].id, ruleText };
}

export function checkWireCut(puzzle, wireId) {
  return wireId === puzzle.solutionId;
}

/* --------------------------------------------------------- Symbol Match */

export function generateSymbolMatch(difficulty, rng) {
  const n = Math.min(6, 3 + difficulty);
  const chosen = sample(rng, SYMBOLS, n).map((s) => s.id);
  let buttons = shuffle(rng, chosen);
  if (buttons.every((id, i) => id === chosen[i])) buttons = shuffle(rng, buttons); // avoid a trivial identity layout
  return { clueOrder: chosen, buttons, solutionOrder: chosen, ruleText: "TAP the panel below in the order shown by the strip above." };
}

export function checkSymbolClick(puzzle, progressIndex, symbolId) {
  return puzzle.solutionOrder[progressIndex] === symbolId;
}

/* --------------------------------------------------------- Switch Order */

export function generateSwitchOrder(difficulty, rng) {
  const n = Math.min(6, 3 + difficulty);
  const useColorRule = difficulty >= 2 && rng() < 0.5;
  const switches = Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    label: String.fromCharCode(65 + i), // A, B, C...
    led: rng() < 0.5 ? "amber" : "cyan",
  }));

  let target;
  let ruleText;
  if (useColorRule) {
    const targetColor = rng() < 0.5 ? "amber" : "cyan";
    target = switches.map((s) => s.led === targetColor);
    ruleText = `SET UP every switch with a ${targetColor.toUpperCase()} indicator. ALL OTHERS DOWN.`;
  } else {
    const codeLen = randInt(rng, 1, Math.max(1, n - 1));
    const code = sample(rng, switches.map((_, i) => i + 1), codeLen).sort((a, b) => a - b);
    target = switches.map((_, i) => code.includes(i + 1));
    ruleText = `SET UP: positions ${code.join("-")}. ALL OTHERS DOWN.`;
  }
  return { switches, target, ruleText };
}

export function checkSwitchConfirm(puzzle, states) {
  return puzzle.target.length === states.length && puzzle.target.every((v, i) => v === states[i]);
}

/* -------------------------------------------------------- Memory Lights */

export function generateMemoryLights(difficulty, rng) {
  const n = Math.min(6, 4 + Math.min(2, difficulty - 1));
  const length = Math.min(8, 2 + difficulty);
  const sequence = [];
  for (let i = 0; i < length; i++) {
    let idx;
    do { idx = randInt(rng, 0, n - 1); } while (idx === sequence[sequence.length - 1]);
    sequence.push(idx);
  }
  const reverse = difficulty >= 3 && rng() < 0.5;
  return {
    lights: n,
    sequence,
    reverse,
    ruleText: reverse ? "WATCH the sequence, then repeat it IN REVERSE." : "WATCH the sequence, then repeat it in order.",
  };
}

export function checkMemoryClick(puzzle, progressIndex, lightIndex) {
  const expected = puzzle.reverse
    ? puzzle.sequence[puzzle.sequence.length - 1 - progressIndex]
    : puzzle.sequence[progressIndex];
  return lightIndex === expected;
}

/* --------------------------------------------------------- Rotary Dial */

const DIAL_LABELS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "◆", "✦"];

export function generateRotaryDial(difficulty, rng) {
  const steps = difficulty >= 3 ? 3 : difficulty === 2 ? 2 : 1;
  const targets = [];
  for (let i = 0; i < steps; i++) {
    let v;
    do { v = randInt(rng, 0, 11); } while (v === targets[targets.length - 1]);
    targets.push(v);
  }
  return {
    positions: DIAL_LABELS,
    targets,
    ruleText: `DIAL TO: ${targets.map((i) => DIAL_LABELS[i]).join(" → ")}`,
  };
}

export function checkDialStep(puzzle, stepIndex, value) {
  return puzzle.targets[stepIndex] === value;
}

/* ------------------------------------------------------- Signal Router */

export function generateSignalRouter(difficulty, rng) {
  const w = difficulty >= 3 ? 5 : difficulty === 2 ? 4 : 3;
  const h = difficulty >= 2 ? 3 : 3;
  const startY = randInt(rng, 0, h - 1);
  const outputY = randInt(rng, 0, h - 1);
  const start = { x: 0, y: startY };
  const output = { x: w - 1, y: outputY };

  // Random walk from start to output, moving only right or vertically —
  // guarantees termination and a always-solvable, always-forward path.
  const path = [];
  let cur = { ...start };
  let guard = 0;
  while ((cur.x !== output.x || cur.y !== output.y) && guard < 200) {
    guard++;
    const options = [];
    if (cur.x < output.x) options.push({ x: cur.x + 1, y: cur.y }, { x: cur.x + 1, y: cur.y });
    if (cur.y < output.y) options.push({ x: cur.x, y: cur.y + 1 });
    if (cur.y > output.y) options.push({ x: cur.x, y: cur.y - 1 });
    if (!options.length) options.push({ x: Math.min(w - 1, cur.x + 1), y: cur.y });
    cur = options[randInt(rng, 0, options.length - 1)];
    if (cur.x !== start.x || cur.y !== start.y) {
      if (cur.x !== output.x || cur.y !== output.y) path.push(cur);
    }
  }

  // A couple of decoy dead-end spurs branching off real path nodes.
  const decoys = [];
  const decoyCount = difficulty >= 2 ? randInt(rng, 1, 2) : 1;
  const branchable = path.filter((p) => p.x < w - 1);
  for (let i = 0; i < decoyCount && branchable.length; i++) {
    const from = branchable[randInt(rng, 0, branchable.length - 1)];
    const dir = rng() < 0.5 ? 1 : -1;
    const ny = Math.max(0, Math.min(h - 1, from.y + dir));
    const dx = { x: from.x, y: ny };
    if (ny !== from.y && !path.some((p) => p.x === dx.x && p.y === dx.y)) {
      decoys.push({ ...dx, from: `${from.x},${from.y}` });
    }
  }

  const pathIds = path.map((p) => `${p.x},${p.y}`);
  return {
    size: { w, h },
    start,
    output,
    path,
    decoys,
    pathIds,
    ruleText: "ACTIVATE every track node on the route from START to OUTPUT. Dead-end spurs are traps.",
  };
}

export function checkSignalNode(puzzle, nodeId) {
  return puzzle.pathIds.includes(nodeId);
}

/* ------------------------------------------------------------ Code Chip */

const CHIP_COLORS = ["amber", "cyan", "magenta"];

export function generateCodeChip(difficulty, rng) {
  const n = Math.min(8, 4 + difficulty);
  const useColorPriority = difficulty >= 2 && rng() < 0.5;
  const numbers = shuffle(rng, Array.from({ length: n }, (_, i) => i + 1));
  const symbols = sample(rng, SYMBOLS, n).map((s) => s.id);

  if (useColorPriority) {
    const subsetSize = difficulty >= 3 ? 3 : 2;
    const priorityColors = shuffle(rng, CHIP_COLORS).slice(0, subsetSize);
    const chips = Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      symbol: symbols[i],
      number: numbers[i],
      color: priorityColors[randInt(rng, 0, priorityColors.length - 1)],
    }));
    const solutionOrder = chips
      .slice()
      .sort((a, b) => {
        const pa = priorityColors.indexOf(a.color);
        const pb = priorityColors.indexOf(b.color);
        return pa !== pb ? pa - pb : a.number - b.number;
      })
      .map((c) => c.id);
    return {
      chips,
      priorityColors,
      solutionOrder,
      ruleText: `PRIORITY: ${priorityColors.map((c) => c.toUpperCase()).join(" → ")} (ties: low → high number).`,
    };
  }

  const chips = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    symbol: symbols[i],
    number: numbers[i],
    color: CHIP_COLORS[randInt(rng, 0, CHIP_COLORS.length - 1)],
  }));
  const solutionOrder = chips.slice().sort((a, b) => a.number - b.number).map((c) => c.id);
  return { chips, priorityColors: null, solutionOrder, ruleText: "SELECT chips in ASCENDING number order." };
}

export function checkChipClick(puzzle, progressIndex, chipId) {
  return puzzle.solutionOrder[progressIndex] === chipId;
}

/* -------------------------------------------------------- Pressure Bar */

export function generatePressureBar(difficulty, rng) {
  const zoneWidth = [0.3, 0.22, 0.16, 0.11][Math.min(3, difficulty - 1)] ?? 0.16;
  const period = Math.max(1.0, 2.6 - difficulty * 0.3);
  const requiredStops = difficulty >= 4 ? 3 : difficulty >= 2 ? 2 : 1;
  const zones = [];
  for (let i = 0; i < requiredStops; i++) {
    let center;
    do { center = zoneWidth / 2 + rng() * (1 - zoneWidth); } while (zones.length && Math.abs(zones[zones.length - 1].center - center) < 0.22);
    zones.push({ center, period: Math.max(0.9, period * (1 - 0.06 * i)) });
  }
  return { zoneWidth, requiredStops, zones, ruleText: `TAP the marker while it is inside the SAFE ZONE. Stops required: ${requiredStops}.` };
}

export function checkPressureTap(puzzle, stopIndex, markerPos) {
  const zone = puzzle.zones[stopIndex];
  if (!zone) return false;
  return Math.abs(markerPos - zone.center) <= puzzle.zoneWidth / 2;
}

/* ----------------------------------------------------------- Grid Link */

export function generateGridLink(difficulty, rng) {
  const size = difficulty >= 3 ? 5 : 4;
  const start = { x: 0, y: 0 };
  const end = { x: size - 1, y: size - 1 };

  // Monotonic (right/down only) staircase path — always guaranteed solvable.
  const path = [{ ...start }];
  let cur = { ...start };
  while (cur.x !== end.x || cur.y !== end.y) {
    const canRight = cur.x < end.x;
    const canDown = cur.y < end.y;
    let goRight;
    if (canRight && canDown) goRight = rng() < 0.5;
    else goRight = canRight;
    cur = goRight ? { x: cur.x + 1, y: cur.y } : { x: cur.x, y: cur.y + 1 };
    path.push({ ...cur });
  }

  const pathIds = new Set(path.map((p) => `${p.x},${p.y}`));
  const allCells = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!pathIds.has(`${x},${y}`)) allCells.push({ x, y });
  const restrictedCount = Math.min(allCells.length, difficulty >= 3 ? 6 : difficulty === 2 ? 4 : 2);
  const restricted = sample(rng, allCells, restrictedCount);
  const restrictedIds = new Set(restricted.map((p) => `${p.x},${p.y}`));

  return {
    size: { w: size, h: size },
    start,
    end,
    restrictedIds,
    guaranteedPath: path,
    ruleText: "LINK START → END moving RIGHT or DOWN only. Avoid marked cells.",
  };
}

/** Validates extending `path` (array of {x,y}, path[0] === start) with `next`. */
export function checkGridStep(puzzle, path, next) {
  const last = path[path.length - 1];
  const movedRightOrDown = (next.x === last.x + 1 && next.y === last.y) || (next.y === last.y + 1 && next.x === last.x);
  if (!movedRightOrDown) return { valid: false, isEnd: false };
  if (puzzle.restrictedIds.has(`${next.x},${next.y}`)) return { valid: false, isEnd: false };
  if (path.some((p) => p.x === next.x && p.y === next.y)) return { valid: false, isEnd: false };
  const isEnd = next.x === puzzle.end.x && next.y === puzzle.end.y;
  return { valid: true, isEnd };
}

/* ------------------------------------------------------- Sequence Lock */

export function generateSequenceLock(difficulty, rng) {
  const n = Math.min(8, 4 + difficulty);
  const icons = sample(rng, SYMBOLS, n).map((s) => s.id);
  const displayOrder = shuffle(rng, icons);
  const useReverse = difficulty === 1 && rng() < 0.5;

  let solutionOrder;
  let ruleText;
  if (useReverse) {
    solutionOrder = displayOrder.slice().reverse();
    ruleText = "ENTER the ring RIGHT TO LEFT (reverse of the displayed order).";
  } else {
    solutionOrder = displayOrder.slice().sort((a, b) => symbolValue(a) - symbolValue(b));
    ruleText = "ENTER icons LOW → HIGH by dot count.";
  }
  return { displayOrder, solutionOrder, ruleText };
}

export function checkSequenceClick(puzzle, progressIndex, iconId) {
  return puzzle.solutionOrder[progressIndex] === iconId;
}
