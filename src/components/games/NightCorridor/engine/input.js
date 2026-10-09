/**
 * Night Corridor — input. One mutable object written by DOM listeners
 * (keyboard, pointer-locked mouse, touch) and read by the fixed-step game,
 * so the hot path never triggers a React render.
 *
 * Presses (E, F) are edge-triggered: `press(name)` queues one, the game
 * consumes it with `take(name)`. Holding E never spams a door.
 */

const MOVE = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  ShiftLeft: "sprint", ShiftRight: "sprint",
  KeyC: "crouch", ControlLeft: "crouch", ControlRight: "crouch",
};

export function createInput() {
  const presses = new Set();
  return {
    forward: false, back: false, left: false, right: false, sprint: false, crouch: false,
    touchX: 0, touchY: 0, touchSprint: false,
    lookDX: 0, lookDY: 0,
    press(name) {
      presses.add(name);
    },
    take(name) {
      if (!presses.has(name)) return false;
      presses.delete(name);
      return true;
    },
    consumeLook() {
      const d = [this.lookDX, this.lookDY];
      this.lookDX = 0;
      this.lookDY = 0;
      return d;
    },
    reset() {
      this.forward = this.back = this.left = this.right = this.sprint = this.crouch = false;
      this.touchX = this.touchY = 0;
      this.lookDX = this.lookDY = 0;
      presses.clear();
    },
  };
}

/**
 * Wires keyboard + pointer lock to `el`. hooks: onLockChange(locked), onPause().
 * Movement keys act only while locked (or in touch mode); P/Esc pause.
 */
export function attachControls(el, input, hooks = {}) {
  const doc = el.ownerDocument || document;
  const isLocked = () => doc.pointerLockElement === el;
  const active = () => isLocked() || hooks.touchMode?.();

  const onLockChange = () => {
    const locked = isLocked();
    if (!locked) input.reset();
    hooks.onLockChange?.(locked);
  };
  const onLockError = () => hooks.onLockChange?.(false);
  const onMouseMove = (e) => {
    if (!isLocked()) return;
    // Clamp single-event spikes some browsers emit on lock.
    const dx = Math.max(-250, Math.min(250, e.movementX || 0));
    const dy = Math.max(-250, Math.min(250, e.movementY || 0));
    input.lookDX += dx;
    input.lookDY += dy;
  };
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
  const onKeyDown = (e) => {
    if (typing(e)) return;
    if (e.code === "KeyP" || (e.code === "Escape" && hooks.touchMode?.())) {
      hooks.onPause?.();
      e.preventDefault();
      return;
    }
    if (!active()) return;
    if (e.code === "KeyE") {
      if (!e.repeat) input.press("interact");
      e.preventDefault();
      return;
    }
    if (e.code === "KeyF") {
      if (!e.repeat) input.press("flashlight");
      e.preventDefault();
      return;
    }
    const slot = MOVE[e.code];
    if (slot) {
      input[slot] = true;
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    const slot = MOVE[e.code];
    if (slot) input[slot] = false;
  };
  const onBlur = () => input.reset();

  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  doc.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  doc.addEventListener("visibilitychange", onBlur);

  return function dispose() {
    doc.removeEventListener("pointerlockchange", onLockChange);
    doc.removeEventListener("pointerlockerror", onLockError);
    doc.removeEventListener("mousemove", onMouseMove);
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
