/**
 * Zombie Outbreak — input. One mutable object written by DOM listeners
 * (keyboard, pointer-locked mouse, wheel, touch) and read by the engine, so
 * the hot path never triggers a React render.
 *
 * Held state: forward/back/left/right/sprint/fire/ads (+ analog moveX/moveY).
 * Presses are edge-triggered and queued (jump, reload, interact, fire clicks,
 * weapon slots, wheel) so a tap between two frames is never lost.
 */

const HOLD = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
};
const PRESS = { Space: "jump", KeyR: "reload", KeyE: "interact" };
const SLOT = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };

export function createInput() {
  const presses = new Map();
  let slot = -1;
  let wheel = 0;
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
    fire: false,
    ads: false,
    moveX: 0,
    moveY: 0,
    lookDX: 0,
    lookDY: 0,
    press(name) {
      presses.set(name, (presses.get(name) || 0) + 1);
    },
    take(name) {
      const n = presses.get(name) || 0;
      if (n <= 0) return false;
      presses.set(name, n - 1);
      return true;
    },
    queueSlot(i) {
      slot = i;
    },
    takeSlot() {
      const s = slot;
      slot = -1;
      return s;
    },
    wheel(d) {
      wheel += d;
    },
    takeWheel() {
      const w = Math.sign(wheel);
      wheel = 0;
      return w;
    },
    consumeLook() {
      const d = [this.lookDX, this.lookDY];
      this.lookDX = 0;
      this.lookDY = 0;
      return d;
    },
    reset() {
      this.forward = this.back = this.left = this.right = this.sprint = this.fire = this.ads = false;
      this.moveX = this.moveY = 0;
      this.lookDX = this.lookDY = 0;
      presses.clear();
      slot = -1;
      wheel = 0;
    },
  };
}

/**
 * Wires keyboard, mouse buttons, wheel and pointer lock to `el`.
 * hooks: onLockChange(locked), onPause(), touchMode() → bool.
 * Gameplay keys only act (and only block page scrolling) while the game has
 * the pointer (or in touch mode); P / Esc always reach onPause.
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
    // Clamp single-event spikes some browsers emit right after locking.
    const dx = Math.max(-300, Math.min(300, e.movementX || 0));
    const dy = Math.max(-300, Math.min(300, e.movementY || 0));
    input.lookDX += dx;
    input.lookDY += dy;
  };
  const onMouseDown = (e) => {
    if (!isLocked()) return;
    if (e.button === 0) {
      input.fire = true;
      input.press("fire");
    } else if (e.button === 2) input.ads = true;
    e.preventDefault();
  };
  const onMouseUp = (e) => {
    if (e.button === 0) input.fire = false;
    else if (e.button === 2) input.ads = false;
  };
  const onWheel = (e) => {
    if (!isLocked()) return;
    if (Math.abs(e.deltaY) > 2) input.wheel(e.deltaY > 0 ? 1 : -1);
    e.preventDefault();
  };
  const onContext = (e) => e.preventDefault();
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
  const onKeyDown = (e) => {
    if (typing(e)) return;
    if (e.code === "KeyP" || (e.code === "Escape" && hooks.touchMode?.())) {
      if (!e.repeat) hooks.onPause?.();
      e.preventDefault();
      return;
    }
    if (!active()) return;
    const hold = HOLD[e.code];
    if (hold) {
      input[hold] = true;
      e.preventDefault();
      return;
    }
    const press = PRESS[e.code];
    if (press) {
      if (!e.repeat) input.press(press);
      e.preventDefault();
      return;
    }
    if (e.code in SLOT) {
      if (!e.repeat) input.queueSlot(SLOT[e.code]);
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    const hold = HOLD[e.code];
    if (hold) input[hold] = false;
  };
  const onBlur = () => input.reset();

  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  doc.addEventListener("mousemove", onMouseMove);
  doc.addEventListener("mousedown", onMouseDown);
  doc.addEventListener("mouseup", onMouseUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("contextmenu", onContext);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  doc.addEventListener("visibilitychange", onBlur);

  return function dispose() {
    doc.removeEventListener("pointerlockchange", onLockChange);
    doc.removeEventListener("pointerlockerror", onLockError);
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("mousedown", onMouseDown);
    doc.removeEventListener("mouseup", onMouseUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("contextmenu", onContext);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    doc.removeEventListener("visibilitychange", onBlur);
    if (isLocked()) doc.exitPointerLock?.();
  };
}

export function requestLock(el) {
  if (!el) return;
  try {
    const r = el.requestPointerLock?.({ unadjustedMovement: true });
    if (r && typeof r.catch === "function") {
      r.catch(() => {
        try {
          const r2 = el.requestPointerLock?.();
          if (r2 && typeof r2.catch === "function") r2.catch(() => {});
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
