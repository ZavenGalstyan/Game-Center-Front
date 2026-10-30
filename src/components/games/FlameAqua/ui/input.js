/**
 * Two-player keyboard on one keyboard. Keys are tracked by `event.code`
 * (physical position, layout-independent) in a held-set, so any mix of keys
 * from both schemes can be down at once:
 *   Flame: KeyA / KeyD / KeyW        Aqua: ArrowLeft / ArrowRight / ArrowUp
 * A jump press is latched until the next sim tick reads it, so a tap shorter
 * than one frame still jumps. Held keys are cleared on blur so nobody keeps
 * running after alt-tab. Hardware key-rollover limits of a given keyboard
 * cannot be fixed in software.
 */
const MAP = {
  KeyA: ["flame", "l"], KeyD: ["flame", "r"], KeyW: ["flame", "j"],
  ArrowLeft: ["aqua", "l"], ArrowRight: ["aqua", "r"], ArrowUp: ["aqua", "j"],
};
// also swallowed so the page never scrolls while playing
const BLOCK = new Set(["ArrowDown", "KeyS", "Space", "PageUp", "PageDown"]);

export function createInput() {
  const held = new Set();
  const latch = { flame: false, aqua: false };
  let enabled = false;

  const isField = (e) => e.target?.closest?.("input, textarea, select, [contenteditable]");
  const down = (e) => {
    if (!enabled || e.ctrlKey || e.metaKey || e.altKey || isField(e)) return false;
    const m = MAP[e.code];
    if (!m && !BLOCK.has(e.code)) return false;
    e.preventDefault();
    if (m) {
      if (m[1] === "j" && !held.has(e.code)) latch[m[0]] = true;
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
    latch.flame = latch.aqua = false;
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
    /** per-tick snapshot; consumes latched jump presses */
    sample() {
      const out = {
        flame: { l: held.has("KeyA"), r: held.has("KeyD"), jp: latch.flame || false },
        aqua: { l: held.has("ArrowLeft"), r: held.has("ArrowRight"), jp: latch.aqua || false },
      };
      latch.flame = latch.aqua = false;
      return out;
    },
  };
}
