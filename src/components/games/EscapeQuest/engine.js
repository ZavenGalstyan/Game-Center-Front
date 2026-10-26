/**
 * Escape Quest — puzzle engine. Pure JS (no React, no DOM) so the game and
 * tools/simTest.mjs share exactly the same rules.
 *
 * A level is data (see levels/): hotspots placed in one or more views, a
 * per-level item table, combine recipes and a `solution` script. Hotspots:
 *   take:   item id         → tapping picks it up (hotspot disappears)
 *   lock:   {item, keep}    → use that item on it (consumed unless keep)
 *           {puzzle}        → tapping opens a puzzle UI; checkPuzzle judges
 *           {flags, auto}   → opens once every flag is set (auto: by itself)
 *   gives / reveals / removes / sets / msg → applied once, when opened
 *   clue:   {title, text, visual} → shown on every tap once accessible
 *   exit:   true            → tapping it once open escapes the room
 * State only ever grows (flags set, items gained), so a solution step that
 * was possible stays possible — the fuzz test relies on that.
 */
import { ITEMS } from "./items.js";

export function newState(level) {
  return {
    id: level.id,
    view: 0,
    inv: [],
    sel: null,
    flags: {},
    opened: {},
    seen: {},
    gone: {},
    shown: {},
    got: {},
    escaped: false,
    moves: 0,
    hints: 0,
  };
}

export const clone = (s) => JSON.parse(JSON.stringify(s));

export function itemDef(level, id) {
  return (level.items && level.items[id]) || ITEMS[id] || { name: id, icon: "box" };
}

export function hotspot(level, id) {
  return level.hotspots.find((h) => h.id === id);
}

export function visible(level, s, h) {
  if (typeof h === "string") h = hotspot(level, h);
  if (!h || s.gone[h.id]) return false;
  return !h.hidden || !!s.shown[h.id];
}

/** Unlocked (or never locked) — its contents / clue / exit are reachable. */
export const isOpen = (s, h) => !h.lock || !!s.opened[h.id];

function addItem(s, id) {
  if (!s.inv.includes(id)) s.inv.push(id);
  s.got[id] = true;
}

function removeItem(s, id) {
  s.inv = s.inv.filter((x) => x !== id);
  if (s.sel === id) s.sel = null;
}

/** Applies a hotspot's one-shot effects. Returns the message to show. */
function open(level, s, h, ev) {
  if (s.opened[h.id] && h.lock) return null;
  const first = !s.opened[h.id];
  s.opened[h.id] = true;
  if (!first) return null;
  (h.gives || []).forEach((it) => {
    addItem(s, it);
    ev.gained.push(it);
  });
  (h.reveals || []).forEach((id) => (s.shown[id] = true));
  (h.removes || []).forEach((id) => (s.gone[id] = true));
  (h.sets || []).forEach((f) => (s.flags[f] = true));
  if (h.lock) ev.unlocked.push(h.id);
  return h.msg || null;
}

/** Opens every visible `auto` flag-lock whose flags are all set (cascades). */
function autoLocks(level, s, ev) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const h of level.hotspots) {
      const L = h.lock;
      if (!L || !L.flags || !L.auto || L.item || L.items || L.puzzle || s.opened[h.id]) continue;
      if (L.flags.every((f) => s.flags[f])) {
        const m = open(level, s, h, ev);
        if (m) ev.msgs.push(m);
        changed = true;
      }
    }
  }
}

function event() {
  return { msgs: [], gained: [], unlocked: [], clue: null, puzzle: null, escaped: false, wrong: false, ok: false };
}

/**
 * Tap a hotspot, optionally holding an inventory item. Mutates `s`, returns
 * an event describing what the UI should show (messages, clue, puzzle…).
 */
export function tap(level, s, id, item = null) {
  const ev = event();
  const h = hotspot(level, id);
  if (!h || !visible(level, s, h) || s.escaped) return ev;
  s.moves++;
  const L = h.lock;

  if (item) {
    if (L && L.items && L.items.includes(item) && !s.opened[h.id]) {
      const key = (it) => `@${h.id}:${it}`;
      if (L.flags && !L.flags.every((f) => s.flags[f])) {
        ev.wrong = true;
        ev.msgs.push(h.locked || "Not yet — something else is needed first.");
        return ev;
      }
      if (L.ordered) {
        const next = L.items.find((it) => !s.flags[key(it)]);
        if (next !== item) {
          ev.wrong = true;
          ev.msgs.push(L.orderMsg || "That doesn't seem to go in next.");
          return ev;
        }
      }
      removeItem(s, item);
      s.flags[key(item)] = true;
      ev.ok = true;
      const placed = L.items.filter((it) => s.flags[key(it)]).length;
      if (placed < L.items.length) {
        ev.msgs.push(`${itemDef(level, item).name} placed (${placed}/${L.items.length}).`);
        return ev;
      }
      const m = open(level, s, h, ev);
      ev.msgs.push(m || "Everything is in place!");
      autoLocks(level, s, ev);
      if (h.clue) {
        ev.clue = h.clue;
        s.seen[h.id] = true;
      }
      return ev;
    }
    if (L && L.item === item && !s.opened[h.id]) {
      if (L.flags && !L.flags.every((f) => s.flags[f])) {
        ev.wrong = true;
        ev.msgs.push(h.locked || "Not yet — something else is needed first.");
        return ev;
      }
      if (!L.keep) removeItem(s, item);
      ev.ok = true;
      const m = open(level, s, h, ev);
      ev.msgs.push(m || `You used the ${itemDef(level, item).name.toLowerCase()}.`);
      autoLocks(level, s, ev);
      if (h.clue) {
        ev.clue = h.clue;
        s.seen[h.id] = true;
      }
      return ev;
    }
    ev.wrong = true;
    ev.msgs.push(h.wrongItem || "That doesn't work here.");
    return ev;
  }

  if (h.take) {
    s.gone[h.id] = true;
    addItem(s, h.take);
    ev.gained.push(h.take);
    ev.ok = true;
    ev.msgs.push(h.msg || `You found: ${itemDef(level, h.take).name}.`);
    const c = itemDef(level, h.take).clue;
    if (c) {
      ev.clue = c;
      s.seen["item:" + h.take] = true;
    }
    (h.sets || []).forEach((f) => (s.flags[f] = true));
    (h.reveals || []).forEach((r) => (s.shown[r] = true));
    autoLocks(level, s, ev);
    return ev;
  }

  if (L && !s.opened[h.id]) {
    if (L.puzzle) {
      if (L.flags && !L.flags.every((f) => s.flags[f])) ev.msgs.push(h.locked || "It has no power yet.");
      else ev.puzzle = h.id;
      return ev;
    }
    if (L.flags && !L.item && !L.items && L.flags.every((f) => s.flags[f])) {
      ev.ok = true;
      const m = open(level, s, h, ev);
      if (m) ev.msgs.push(m);
      autoLocks(level, s, ev);
    } else {
      ev.msgs.push(h.locked || "It won't open.");
      return ev;
    }
  } else if (!s.opened[h.id]) {
    const m = open(level, s, h, ev);
    if (m) ev.msgs.push(m);
    if (m || ev.gained.length) ev.ok = true;
    autoLocks(level, s, ev);
  } else if (!h.clue && !h.exit) {
    ev.msgs.push(h.after || (h.gives ? "Nothing else in here." : h.msg || "Nothing more to see."));
  }

  if (h.clue) {
    ev.clue = h.clue;
    ev.ok = true;
    s.seen[h.id] = true;
  }
  if (h.exit) {
    s.escaped = true;
    ev.escaped = true;
  }
  return ev;
}

/** Submit an answer to a puzzle-locked hotspot. */
export function solve(level, s, id, input) {
  const ev = event();
  const h = hotspot(level, id);
  if (!h || !h.lock || !h.lock.puzzle || s.opened[h.id] || !visible(level, s, h)) return ev;
  if (h.lock.flags && !h.lock.flags.every((f) => s.flags[f])) return ev;
  s.moves++;
  if (!checkPuzzle(h.lock.puzzle, input)) {
    ev.wrong = true;
    ev.msgs.push(h.lock.puzzle.wrong || "Nothing happens. That's not right.");
    return ev;
  }
  ev.ok = true;
  const m = open(level, s, h, ev);
  ev.msgs.push(m || "Click! It unlocked.");
  autoLocks(level, s, ev);
  if (h.clue) {
    ev.clue = h.clue;
    s.seen[h.id] = true;
  }
  if (h.exit) {
    s.escaped = true;
    ev.escaped = true;
  }
  return ev;
}

/** Combine two inventory items using the level's recipes. */
export function combine(level, s, a, b) {
  const ev = event();
  if (!s.inv.includes(a) || !s.inv.includes(b) || a === b) return ev;
  s.moves++;
  const r = (level.combos || []).find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
  if (!r) {
    ev.wrong = true;
    ev.msgs.push("Those two don't fit together.");
    return ev;
  }
  removeItem(s, a);
  removeItem(s, b);
  addItem(s, r.out);
  s.sel = null;
  ev.ok = true;
  ev.gained.push(r.out);
  ev.msgs.push(r.msg || `You made: ${itemDef(level, r.out).name}.`);
  const c = itemDef(level, r.out).clue;
  if (c) {
    ev.clue = c;
    s.seen["item:" + r.out] = true;
  }
  return ev;
}

/* ---------------- puzzles ---------------- */

const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

/** Lights puzzle: pressing a cell toggles it and its orthogonal neighbours. */
export function lightsPress(p, on, i) {
  const next = on.slice();
  const r = Math.floor(i / p.cols);
  const c = i % p.cols;
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < p.rows && cc >= 0 && cc < p.cols) next[rr * p.cols + cc] = !next[rr * p.cols + cc];
  });
  return next;
}

/** Start board for a lights puzzle — built by pressing `presses` on an all-lit board, so it is always solvable. */
export function lightsStart(p) {
  let on = Array(p.rows * p.cols).fill(true);
  p.presses.forEach((i) => (on = lightsPress(p, on, i)));
  return on;
}

/** Rotate puzzle: tile i starts at `start[i]` quarter turns; solved when all 0. */
export function checkPuzzle(p, input) {
  switch (p.type) {
    case "keypad":
    case "word":
      return String(input).toUpperCase() === String(p.answer).toUpperCase();
    case "colors":
    case "arrows":
    case "dials":
    case "order":
      return eqArr(input, p.answer);
    case "pattern": {
      const want = [...p.answer].sort((x, y) => x - y);
      const got = [...(input || [])].sort((x, y) => x - y);
      return eqArr(want, got);
    }
    case "lights":
      return Array.isArray(input) && input.length === p.rows * p.cols && input.every(Boolean);
    case "rotate":
      return Array.isArray(input) && input.length === p.start.length && input.every((r) => r % 4 === 0);
    default:
      return false;
  }
}

/** A correct input for any puzzle — used by the tests (and never shown raw to the player). */
export function puzzleSolution(p) {
  switch (p.type) {
    case "lights": {
      let on = lightsStart(p);
      p.presses.forEach((i) => (on = lightsPress(p, on, i)));
      return on;
    }
    case "rotate":
      return p.start.map(() => 0);
    default:
      return p.answer;
  }
}

/* ---------------- solution script / hints ---------------- */

/** Parses "tap:id", "use:item>id", "solve:id", "combine:a+b". */
export function parseStep(str) {
  const [kind, rest] = str.split(":");
  if (kind === "use") {
    const [item, id] = rest.split(">");
    return { kind, item, id };
  }
  if (kind === "combine") {
    const [a, b] = rest.split("+");
    return { kind, a, b };
  }
  return { kind, id: rest };
}

export function stepDone(level, s, step) {
  const st = typeof step === "string" ? parseStep(step) : step;
  if (st.kind === "combine") {
    const r = (level.combos || []).find((c) => (c.a === st.a && c.b === st.b) || (c.a === st.b && c.b === st.a));
    return !!(r && s.got[r.out]);
  }
  const h = hotspot(level, st.id);
  if (!h) return false;
  if (h.exit && st.kind === "tap") return s.escaped;
  if (h.take) return !!s.gone[h.id];
  if (st.kind === "use" && h.lock && h.lock.items) return !!s.flags[`@${h.id}:${st.item}`] || !!s.opened[h.id];
  if (st.kind === "tap" && h.clue && isOpen(s, h)) return !!s.seen[h.id];
  return !!s.opened[h.id];
}

/** Runs one solution step against the engine. */
export function runStep(level, s, step) {
  const st = parseStep(step);
  if (st.kind === "tap") return tap(level, s, st.id);
  if (st.kind === "use") return tap(level, s, st.id, st.item);
  if (st.kind === "combine") return combine(level, s, st.a, st.b);
  const h = hotspot(level, st.id);
  return solve(level, s, st.id, h && h.lock && h.lock.puzzle ? puzzleSolution(h.lock.puzzle) : null);
}

export function nextStep(level, s) {
  for (const step of level.solution) if (!stepDone(level, s, step)) return parseStep(step);
  return null;
}

const lc = (t) => String(t).toLowerCase();

/** Player-facing hint for the next unfinished step (plus the hotspot to pulse). */
export function hintFor(level, s) {
  const st = nextStep(level, s);
  if (!st) return null;
  if (st.kind === "combine") {
    return {
      text: `Combine the ${lc(itemDef(level, st.a).name)} with the ${lc(itemDef(level, st.b).name)} — select one, then tap the other in your bag.`,
      items: [st.a, st.b],
    };
  }
  const h = hotspot(level, st.id);
  const label = lc(h.label);
  let text;
  if (h.hint) text = h.hint;
  else if (st.kind === "use") text = `Try using the ${lc(itemDef(level, st.item).name)} on the ${label}.`;
  else if (st.kind === "solve") {
    const from = (h.lock.puzzle.clueFrom || [])
      .map((c) => (c.startsWith("item:") ? itemDef(level, c.slice(5)).name : hotspot(level, c)?.label))
      .filter(Boolean)
      .map(lc);
    text = `Work out the ${label}.` + (from.length ? ` The answer comes from the ${from.join(" and the ")}.` : "");
    if (h.lock.puzzle.hint) text += " " + h.lock.puzzle.hint;
  } else if (h.take) text = `Pick up the ${label}.`;
  else if (h.exit) text = `The way out is open — go through the ${label}!`;
  else if (h.clue) text = `Take a closer look at the ${label}.`;
  else text = `Check the ${label}.`;
  return { text, id: h.id, view: h.v || 0, item: st.item || null };
}
