/**
 * Supermarket Rush — first-person input: Pointer Lock mouse-look + WASD +
 * Shift (sprint) + E (interact/restock, held) + Q (drop box). Same shape as
 * Stonewild's input.js: one mutable object written by DOM listeners and read
 * once per frame by the R3F scene, so the hot path never triggers a React
 * render.
 *
 * Movement, mouse-look and E/Q only act while pointer-locked — they're
 * "you're looking at the store right now" actions. Tab (task list) stays
 * live whether or not the pointer is locked, since it's a UI toggle the
 * player may want while looking at the paused/click-to-play overlay too.
 * The browser itself releases the lock on Esc; we just listen for
 * `pointerlockchange` and treat "lock lost" as "show the pause menu".
 */

const MOVE_CODES = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  ShiftLeft: "sprint", ShiftRight: "sprint",
};

export function createInput() {
  return {
    forward: false, back: false, left: false, right: false, sprint: false,
    interact: false,
    mouseDX: 0,
    mouseDY: 0,
    locked: false,
    reset() {
      this.forward = this.back = this.left = this.right = this.sprint = false;
      this.interact = false;
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
 * Wires an element up for pointer lock, keyboard and the interact key.
 * `hooks`: onLockChange(locked), onDrop(), onTasksToggle(down).
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
    if (e.code === "Tab") {
      hooks.onTasksToggle?.(true);
      e.preventDefault();
      return;
    }
    if (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3") {
      hooks.onChoice?.(Number(e.code.slice(-1)) - 1);
      return;
    }
    if (doc.pointerLockElement !== el) return;
    if (e.code === "KeyE") {
      input.interact = true;
      e.preventDefault();
      return;
    }
    if (e.code === "KeyQ") {
      hooks.onDrop?.();
      return;
    }
    const slot = MOVE_CODES[e.code];
    if (slot) {
      input[slot] = true;
      e.preventDefault();
    }
  };

  const onKeyUp = (e) => {
    if (e.code === "Tab") {
      hooks.onTasksToggle?.(false);
      return;
    }
    if (e.code === "KeyE") input.interact = false;
    const slot = MOVE_CODES[e.code];
    if (slot) input[slot] = false;
  };

  const onBlurOrHide = () => input.reset();
  const onClick = () => requestLock();

  el.addEventListener("click", onClick);
  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  doc.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlurOrHide);
  doc.addEventListener("visibilitychange", onBlurOrHide);

  return function dispose() {
    el.removeEventListener("click", onClick);
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
