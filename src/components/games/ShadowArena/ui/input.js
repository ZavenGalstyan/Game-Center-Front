/**
 * Two fighters on one keyboard. Keys are tracked by `event.code` (physical
 * position, layout-independent) in a held-set, so any mix of keys from both
 * schemes can be down at the same time:
 *
 *   P1: A/D move · W jump · S block · F punch · G kick · H special
 *   P2: ←/→ move · ↑ jump · ↓ block · J punch · K kick · L special
 *       (Numpad 1/2/3 also punch/kick/special — handy on keyboards whose
 *        matrix ghosts J/K/L together with the arrows)
 *
 * Jump and attacks are one-shot presses: a press is latched until the next
 * sim tick reads it (so a tap shorter than a frame still counts), auto-repeat
 * keydowns are ignored, and holding a key never re-triggers it. Held keys are
 * cleared on blur. A keyboard's hardware rollover limit can't be fixed in
 * software; the numpad keys give player 2 a second, separate key group.
 */
const MAP = {
  KeyA: [0, "l"], KeyD: [0, "r"], KeyW: [0, "jump"], KeyS: [0, "block"], KeyF: [0, "punch"], KeyG: [0, "kick"], KeyH: [0, "special"],
  ArrowLeft: [1, "l"], ArrowRight: [1, "r"], ArrowUp: [1, "jump"], ArrowDown: [1, "block"], KeyJ: [1, "punch"], KeyK: [1, "kick"], KeyL: [1, "special"],
  Numpad1: [1, "punch"], Numpad2: [1, "kick"], Numpad3: [1, "special"],
};
const ONE_SHOT = new Set(["jump", "punch", "kick", "special"]);
// also swallowed during a fight so the page never scrolls
const BLOCK = new Set(["Space", "PageUp", "PageDown", "Home", "End"]);

export function createInput() {
  const held = new Set();
  const latch = [{}, {}];
  let enabled = false;

  const isField = (e) => e.target?.closest?.("input, textarea, select, [contenteditable]");
  const down = (e) => {
    if (!enabled || e.ctrlKey || e.metaKey || e.altKey || isField(e)) return false;
    const m = MAP[e.code];
    if (!m && !BLOCK.has(e.code)) return false;
    e.preventDefault();
    if (m) {
      if (ONE_SHOT.has(m[1]) && !e.repeat && !held.has(e.code)) latch[m[0]][m[1]] = true;
      held.add(e.code);
    }
    return true;
  };
  const up = (e) => {
    if (MAP[e.code]) {
      held.delete(e.code);
      if (enabled) e.preventDefault();
    }
  };
  const clear = () => {
    held.clear();
    latch[0] = {};
    latch[1] = {};
  };
  const heldFor = (side, action) => {
    for (const code of held) {
      const m = MAP[code];
      if (m[0] === side && m[1] === action) return true;
    }
    return false;
  };

  return {
    down,
    up,
    clear,
    held,
    setEnabled(on) {
      enabled = on;
      if (!on) clear();
    },
    get enabled() {
      return enabled;
    },
    /** per-tick snapshot of both players; consumes latched presses */
    sample() {
      const out = [0, 1].map((s) => ({
        l: heldFor(s, "l"),
        r: heldFor(s, "r"),
        block: heldFor(s, "block"),
        jump: !!latch[s].jump,
        punch: !!latch[s].punch,
        kick: !!latch[s].kick,
        special: !!latch[s].special,
      }));
      latch[0] = {};
      latch[1] = {};
      return out;
    },
  };
}

/** menu navigation keys per player for the selection screens */
export const NAV = {
  0: { KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down", KeyF: "ok", KeyG: "back" },
  1: { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", KeyJ: "ok", KeyK: "back", Numpad1: "ok", Numpad2: "back" },
};
