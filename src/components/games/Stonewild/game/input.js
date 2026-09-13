/**
 * Stonewild — first-person input: Pointer Lock mouse-look + WASD/jump/sprint,
 * mouse buttons (break/place), and the menu/UI keys (E, F, F3, 1-9, wheel).
 *
 * One mutable object, written by DOM listeners and read once per frame by
 * StonewildScene — matches the input.js pattern used by Parking Master, so
 * the hot path never triggers a React render.
 *
 * Two different gating rules, on purpose:
 *  - Movement (WASD/jump/sprint), mouse-look, and the mouse BUTTONS
 *    (break/place) only act while pointer-locked — they're "you are looking
 *    at the world right now" actions, and gating them prevents a stray
 *    click on an overlay from also breaking a block underneath it.
 *  - E / F / F3 / 1-9 / wheel are UI actions and must keep working the
 *    moment pointer lock is RELEASED too (E has to close the inventory it
 *    just opened, which is exactly when the lock is gone) — so they're
 *    ungated, always live for as long as this is attached.
 *
 * Pointer Lock notes (spec: "handle fullscreen changes, pause, unmount, tab
 * changes cleanly"):
 *  - The browser itself releases the lock on Esc — we don't (can't) intercept
 *    that key; we just listen for `pointerlockchange` and treat "lock lost"
 *    as "show the paused/click-to-play overlay".
 *  - `visibilitychange` and `blur` reset held keys/mouse buttons so a
 *    tab-away can't leave a phantom "still holding W" or "still mining" —
 *    no giant catch-up movement/break-progress on return either, since
 *    StonewildScene clamps its own frame delta.
 *  - `dispose()` removes every listener and exits pointer lock if held, so
 *    remounting Stonewild (leave the game, come back) never doubles them up.
 */

const MOVE_CODES = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  Space: "jump",
  ShiftLeft: "sprint", ShiftRight: "sprint",
};

const DIGIT_CODES = {
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
  Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8,
};

export function createInput() {
  return {
    forward: false, back: false, left: false, right: false, jump: false, sprint: false,
    mouseDX: 0,
    mouseDY: 0,
    mouseLeft: false,
    mouseRight: false,
    locked: false,
    reset() {
      this.forward = this.back = this.left = this.right = this.jump = this.sprint = false;
      this.mouseLeft = false;
      this.mouseRight = false;
      this.mouseDX = 0;
      this.mouseDY = 0;
    },
    consumeMouse() {
      const dx = this.mouseDX;
      const dy = this.mouseDY;
      this.mouseDX = 0;
      this.mouseDY = 0;
      return [dx, dy];
    },
  };
}

/**
 * Wires an element (the gameplay canvas) up for pointer lock, keyboard and
 * mouse buttons. `hooks`:
 *   onLockChange(locked), onInventoryToggle(), onInteract(), onDebugToggle(),
 *   onHotbarSelect(index), onHotbarScroll(direction), onPlaceAttempt()
 * Returns a cleanup function.
 */
export function attachPointerLockControls(el, input, hooks = {}) {
  const doc = el.ownerDocument || document;

  const requestLock = () => {
    if (doc.pointerLockElement === el) return;
    el.requestPointerLock?.();
  };

  const onLockChange = () => {
    const locked = doc.pointerLockElement === el;
    input.locked = locked;
    if (!locked) input.reset();
    hooks.onLockChange?.(locked);
  };

  const onLockError = () => {
    input.locked = false;
    hooks.onLockChange?.(false);
  };

  const onMouseMove = (e) => {
    if (doc.pointerLockElement !== el) return;
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  };

  const onKeyDown = (e) => {
    // Ungated menu/UI keys — must work whether or not the pointer is locked.
    switch (e.code) {
      case "KeyE":
        hooks.onInventoryToggle?.();
        e.preventDefault();
        return;
      case "F3":
        hooks.onDebugToggle?.();
        e.preventDefault();
        return;
      case "KeyF":
        if (doc.pointerLockElement === el) hooks.onInteract?.();
        return;
      default:
        break;
    }
    if (e.code in DIGIT_CODES) {
      hooks.onHotbarSelect?.(DIGIT_CODES[e.code]);
      return;
    }

    // Gated movement — only while actually looking at the world.
    if (doc.pointerLockElement !== el) return;
    const slot = MOVE_CODES[e.code];
    if (slot) {
      input[slot] = true;
      e.preventDefault();
    }
  };

  const onKeyUp = (e) => {
    const slot = MOVE_CODES[e.code];
    if (slot) input[slot] = false;
  };

  const onMouseDown = (e) => {
    if (doc.pointerLockElement !== el) return;
    if (e.button === 0) input.mouseLeft = true;
    else if (e.button === 2) {
      input.mouseRight = true;
      hooks.onPlaceAttempt?.();
    }
  };
  const onMouseUp = (e) => {
    if (e.button === 0) input.mouseLeft = false;
    else if (e.button === 2) input.mouseRight = false;
  };
  const onContextMenu = (e) => {
    if (doc.pointerLockElement === el) e.preventDefault();
  };
  const onWheel = (e) => {
    if (doc.pointerLockElement !== el) return;
    hooks.onHotbarScroll?.(e.deltaY > 0 ? 1 : -1);
    e.preventDefault();
  };

  const onBlurOrHide = () => {
    input.reset();
  };

  const onClick = () => requestLock();

  el.addEventListener("click", onClick);
  el.addEventListener("mousedown", onMouseDown);
  el.addEventListener("contextmenu", onContextMenu);
  el.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("mouseup", onMouseUp);
  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  doc.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlurOrHide);
  doc.addEventListener("visibilitychange", onBlurOrHide);

  return function dispose() {
    el.removeEventListener("click", onClick);
    el.removeEventListener("mousedown", onMouseDown);
    el.removeEventListener("contextmenu", onContextMenu);
    el.removeEventListener("wheel", onWheel);
    window.removeEventListener("mouseup", onMouseUp);
    doc.removeEventListener("pointerlockchange", onLockChange);
    doc.removeEventListener("pointerlockerror", onLockError);
    doc.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlurOrHide);
    doc.removeEventListener("visibilitychange", onBlurOrHide);
    if (doc.pointerLockElement === el) doc.exitPointerLock?.();
  };
}
