/**
 * Stunt Racer 3D — input. One mutable object written by DOM listeners
 * (keyboard, touch buttons) and read by the fixed-step run, so the hot path
 * never triggers a React render.
 *
 *   W / ↑  accelerate       S / ↓  brake / reverse     A D / ← →  steer
 *   Space  handbrake (held) Shift  nitro (held)         R  reset to checkpoint
 *   Esc / P  pause
 *
 * R is edge-triggered: frame() hands each press to exactly one step.
 */

const HELD = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "hand",
  ShiftLeft: "nitro",
  ShiftRight: "nitro",
};

export function createInput() {
  let reset = false;
  const inp = {
    up: false,
    down: false,
    left: false,
    right: false,
    hand: false,
    nitro: false,
    // touch buttons write their own held flags so a finger lifting never
    // cancels a held key and vice versa
    t: { up: false, down: false, left: false, right: false, hand: false, nitro: false },
    pressReset() {
      reset = true;
    },
    /** Snapshot for one sim step; consumes the reset press. */
    frame() {
      const T = inp.t;
      const f = {
        throttle: inp.up || T.up ? 1 : 0,
        brake: inp.down || T.down ? 1 : 0,
        steer: (inp.left || T.left ? 1 : 0) - (inp.right || T.right ? 1 : 0),
        handbrake: inp.hand || T.hand,
        nitro: inp.nitro || T.nitro,
        reset,
      };
      reset = false;
      return f;
    },
    reset() {
      inp.up = inp.down = inp.left = inp.right = inp.hand = inp.nitro = false;
      for (const k of Object.keys(inp.t)) inp.t[k] = false;
      reset = false;
    },
  };
  return inp;
}

/** Keyboard listeners for a run. hooks: onPause(), active() → bool. Returns a dispose function. */
export function attachKeyboard(inp, hooks = {}) {
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
  const onKeyDown = (e) => {
    if (typing(e)) return;
    const active = hooks.active?.() ?? true;
    if (e.code === "KeyP" || e.code === "Escape") {
      if (!e.repeat) hooks.onPause?.();
      e.preventDefault();
      return;
    }
    if (e.code === "KeyR") {
      if (!e.repeat && active) inp.pressReset();
      e.preventDefault();
      return;
    }
    const slot = HELD[e.code];
    if (slot) {
      if (active) inp[slot] = true;
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    const slot = HELD[e.code];
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
