/**
 * Alpine Rush — input. One mutable object written by DOM listeners
 * (keyboard, touch buttons) and read by the fixed-step race, so the hot path
 * never triggers a React render.
 *
 *   W / ↑   tuck (speed)           S / ↓   snowplough brake
 *   A / ←   steer left             D / →   steer right
 *   Q / E   sharper carve left / right (held)
 *   Shift   aggressive race tuck   Space   jump (grounded only)
 *   C       camera distance        R       respawn at the last checkpoint
 *   Esc / P pause
 *
 * Space and R are edge-triggered: frame() hands each press to exactly one
 * simulation step. Held keys are cleared on keyup, window blur, tab hide,
 * pause and unmount, so no input can ever get stuck.
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
  KeyQ: "carveL",
  KeyE: "carveR",
  ShiftLeft: "race",
  ShiftRight: "race",
};

export function createInput() {
  let jump = false;
  let respawn = false;
  const inp = {
    up: false,
    down: false,
    left: false,
    right: false,
    carveL: false,
    carveR: false,
    race: false,
    // touch buttons have their own held flags
    t: { up: false, down: false, left: false, right: false, carveL: false, carveR: false, race: false },
    pressJump() {
      jump = true;
    },
    pressRespawn() {
      respawn = true;
    },
    held(k) {
      return inp[k] || inp.t[k];
    },
    /** Snapshot for one sim frame; consumes the presses. */
    frame() {
      const L = inp.held("left") || inp.held("carveL");
      const Rr = inp.held("right") || inp.held("carveR");
      const f = {
        tuck: inp.held("up") ? 1 : 0,
        race: inp.held("race") ? 1 : 0,
        brake: inp.held("down") ? 1 : 0,
        steer: (L ? 1 : 0) - (Rr ? 1 : 0),
        sharp: (inp.held("carveL") && !Rr) || (inp.held("carveR") && !L) ? 1 : 0,
        jump,
        respawn,
      };
      jump = respawn = false;
      return f;
    },
    reset() {
      for (const k of ["up", "down", "left", "right", "carveL", "carveR", "race"]) inp[k] = false;
      for (const k of Object.keys(inp.t)) inp.t[k] = false;
      jump = respawn = false;
    },
  };
  return inp;
}

/** Keyboard listeners for a race. hooks: onPause(), onCamera(), active() → bool. Returns a dispose function. */
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
        if (!e.repeat && active) inp.pressJump();
        e.preventDefault();
        return;
      case "KeyR":
        if (!e.repeat && active) inp.pressRespawn();
        e.preventDefault();
        return;
      case "KeyC":
        if (!e.repeat) hooks.onCamera?.();
        e.preventDefault();
        return;
      default:
        break;
    }
    const slot = HELD[e.code];
    if (slot) {
      if (active) inp[slot] = true;
      e.preventDefault(); // no page scrolling with arrows / space
    }
  };
  const onKeyUp = (e) => {
    const slot = HELD[e.code];
    if (slot) inp[slot] = false;
  };
  const onBlur = () => inp.reset();
  const onVis = () => {
    if (document.hidden) inp.reset();
  };
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVis);
    inp.reset();
  };
}
