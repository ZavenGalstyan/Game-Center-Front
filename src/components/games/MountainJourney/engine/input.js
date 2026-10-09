/**
 * Mountain Journey — input. One mutable object written by DOM listeners
 * (keyboard, pointer-locked mouse, touch controls) and read by the fixed-step
 * game, so the hot path never triggers a React render.
 *
 *   WASD / arrows  move        Shift  run        Space  jump / climb
 *   E              interact    Mouse  camera     Esc / P  pause
 *
 * Presses are edge-triggered: frame() hands each press to exactly one
 * simulation step, so holding a key never repeats an action and spamming
 * can't queue more than one.
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
  ShiftLeft: "run",
  ShiftRight: "run",
};

export function createInput() {
  let jump = false;
  let interact = false;
  const inp = {
    up: false,
    down: false,
    left: false,
    right: false,
    run: false,
    runToggle: false, // touch "run" button latches
    stickX: 0,
    stickY: 0,
    lookDX: 0,
    lookDY: 0,
    press(name) {
      if (name === "jump") jump = true;
      if (name === "interact") interact = true;
    },
    /** Snapshot for one sim tick; consumes presses and look deltas. */
    frame() {
      let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0) + inp.stickX;
      let mz = (inp.up ? 1 : 0) - (inp.down ? 1 : 0) + inp.stickY;
      const l = Math.hypot(mx, mz);
      if (l > 1) {
        mx /= l;
        mz /= l;
      }
      const f = {
        mx,
        mz,
        run: inp.run || inp.runToggle,
        jumpPressed: jump,
        interactPressed: interact,
        lookDX: inp.lookDX,
        lookDY: inp.lookDY,
      };
      jump = false;
      interact = false;
      inp.lookDX = 0;
      inp.lookDY = 0;
      return f;
    },
    unconsume(f) {
      if (f.jumpPressed) jump = true;
      if (f.interactPressed) interact = true;
    },
    reset() {
      inp.up = inp.down = inp.left = inp.right = inp.run = false;
      inp.stickX = inp.stickY = 0;
      inp.lookDX = inp.lookDY = 0;
      jump = interact = false;
    },
  };
  return inp;
}

/**
 * Wires keyboard + mouse + pointer lock to `el`.
 * hooks: onLockChange(locked), onPause(), touchMode() → bool, active() → bool
 */
export function attachControls(el, inp, hooks = {}) {
  const doc = el.ownerDocument || document;
  const isLocked = () => doc.pointerLockElement === el;
  const live = () => isLocked() || hooks.touchMode?.();
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;

  const onLockChange = () => {
    const locked = isLocked();
    if (!locked) inp.reset();
    hooks.onLockChange?.(locked);
  };
  const onLockError = () => hooks.onLockChange?.(false);
  const onMouseMove = (e) => {
    if (!isLocked()) return;
    inp.lookDX += Math.max(-200, Math.min(200, e.movementX || 0));
    inp.lookDY += Math.max(-200, Math.min(200, e.movementY || 0));
  };
  const onKeyDown = (e) => {
    if (typing(e)) return;
    if (e.code === "KeyP" || (e.code === "Escape" && !isLocked())) {
      // Esc while locked is consumed by the browser (unlock → pause)
      if (!e.repeat) hooks.onPause?.();
      e.preventDefault();
      return;
    }
    if (!live()) return;
    if (e.code === "Space") {
      if (!e.repeat) inp.press("jump");
      e.preventDefault();
      return;
    }
    if (e.code === "KeyE" || e.code === "KeyF") {
      if (!e.repeat) inp.press("interact");
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
  const onContext = (e) => {
    if (isLocked() || el.contains(e.target)) e.preventDefault();
  };

  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("contextmenu", onContext);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  doc.addEventListener("visibilitychange", onBlur);

  return function dispose() {
    doc.removeEventListener("pointerlockchange", onLockChange);
    doc.removeEventListener("pointerlockerror", onLockError);
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("contextmenu", onContext);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    doc.removeEventListener("visibilitychange", onBlur);
    if (isLocked()) doc.exitPointerLock?.();
  };
}

export function requestLock(el) {
  try {
    const r = el.requestPointerLock?.({ unadjustedMovement: true });
    if (r && typeof r.catch === "function") {
      r.catch(() => {
        try {
          el.requestPointerLock?.();
        } catch {
          /* ignore */
        }
      });
    }
  } catch {
    try {
      el.requestPointerLock?.();
    } catch {
      /* ignore */
    }
  }
}
