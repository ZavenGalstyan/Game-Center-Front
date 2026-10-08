/**
 * Kart Legends — input. One mutable object written by DOM listeners
 * (keyboard, touch buttons) and read by the fixed-step race, so the hot
 * path never triggers a React render.
 *
 *   W / ↑  accelerate     S / ↓  brake / reverse     A D / ← →  steer
 *   Space  drift (hold)   Shift  boost (press)       Esc / P   pause
 *
 * Boost is edge-triggered: frame() hands each press to exactly one
 * simulation step, so holding Shift spends one segment, not the whole meter.
 */

const KEYS = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "drift",
};

export function createInput() {
  let boost = false;
  const inp = {
    up: false,
    down: false,
    left: false,
    right: false,
    drift: false,
    // touch buttons write the same slots through their own flags so a
    // finger lifting never cancels a held key and vice versa
    t: { up: false, down: false, left: false, right: false, drift: false },
    pressBoost() {
      boost = true;
    },
    /** Snapshot for one sim frame; consumes the boost press. */
    frame() {
      const T = inp.t;
      const f = {
        throttle: inp.up || T.up ? 1 : 0,
        brake: inp.down || T.down ? 1 : 0,
        steer: (inp.left || T.left ? 1 : 0) - (inp.right || T.right ? 1 : 0),
        drift: inp.drift || T.drift,
        boostPressed: boost,
      };
      boost = false;
      return f;
    },
    reset() {
      inp.up = inp.down = inp.left = inp.right = inp.drift = false;
      for (const k of Object.keys(inp.t)) inp.t[k] = false;
      boost = false;
    },
  };
  return inp;
}

/**
 * Keyboard listeners for a race. hooks: onPause(), active() → bool.
 * Returns a dispose function.
 */
export function attachKeyboard(inp, hooks = {}) {
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
  const onKeyDown = (e) => {
    if (typing(e)) return;
    if (e.code === "KeyP" || e.code === "Escape") {
      if (!e.repeat) hooks.onPause?.();
      e.preventDefault();
      return;
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      if (!e.repeat && (hooks.active?.() ?? true)) inp.pressBoost();
      e.preventDefault();
      return;
    }
    const slot = KEYS[e.code];
    if (slot) {
      inp[slot] = true;
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    const slot = KEYS[e.code];
    if (slot) inp[slot] = false;
  };
  const onBlur = () => inp.reset();
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onBlur);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onBlur);
  };
}
