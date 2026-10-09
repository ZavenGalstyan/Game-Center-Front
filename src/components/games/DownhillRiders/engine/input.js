/**
 * Downhill Riders — input. One mutable object written by DOM listeners
 * (keyboard, touch buttons) and read by the fixed-step race, so the hot path
 * never triggers a React render.
 *
 *   W / ↑  pedal          S / ↓  brake          A D / ← →  steer
 *   Space  jump / hop     Shift  pedal boost    Q / E      tricks (in the air)
 *   R      respawn at the last checkpoint       Esc / P    pause
 *
 * Space, Shift, Q / E and R are edge-triggered: frame() hands each press to
 * exactly one simulation step, so holding a key never repeats a trick, a hop
 * or a boost.
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
};

export function createInput() {
  let hop = false;
  let boost = false;
  let trick = null;
  let respawn = false;
  const inp = {
    up: false,
    down: false,
    left: false,
    right: false,
    // touch buttons write their own held flags so a finger lifting never
    // cancels a held key and vice versa
    t: { up: false, down: false, left: false, right: false },
    pressHop() {
      hop = true;
    },
    pressBoost() {
      boost = true;
    },
    pressTrick(k) {
      trick = k;
    },
    pressRespawn() {
      respawn = true;
    },
    /** Snapshot for one sim frame; consumes the presses. */
    frame() {
      const T = inp.t;
      const f = {
        throttle: inp.up || T.up ? 1 : 0,
        brake: inp.down || T.down ? 1 : 0,
        steer: (inp.left || T.left ? 1 : 0) - (inp.right || T.right ? 1 : 0),
        hop,
        boostPressed: boost,
        trick,
        respawn,
      };
      hop = boost = respawn = false;
      trick = null;
      return f;
    },
    reset() {
      inp.up = inp.down = inp.left = inp.right = false;
      for (const k of Object.keys(inp.t)) inp.t[k] = false;
      hop = boost = respawn = false;
      trick = null;
    },
  };
  return inp;
}

/** Keyboard listeners for a race. hooks: onPause(), active() → bool. Returns a dispose function. */
export function attachKeyboard(inp, hooks = {}) {
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
  const onKeyDown = (e) => {
    if (typing(e)) return;
    const active = hooks.active?.() ?? true;
    switch (e.code) {
      case "KeyP":
      case "Escape":
        if (!e.repeat) hooks.onPause?.();
        e.preventDefault();
        return;
      case "Space":
        if (!e.repeat && active) inp.pressHop();
        e.preventDefault();
        return;
      case "ShiftLeft":
      case "ShiftRight":
        if (!e.repeat && active) inp.pressBoost();
        e.preventDefault();
        return;
      case "KeyQ":
        if (!e.repeat && active) inp.pressTrick("q");
        e.preventDefault();
        return;
      case "KeyE":
        if (!e.repeat && active) inp.pressTrick("e");
        e.preventDefault();
        return;
      case "KeyR":
        if (!e.repeat && active) inp.pressRespawn();
        e.preventDefault();
        return;
      default:
        break;
    }
    const slot = HELD[e.code];
    if (slot) {
      inp[slot] = true;
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
