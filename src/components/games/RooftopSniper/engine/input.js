/**
 * Rooftop Sniper — first-person aiming input: Pointer Lock mouse-look, left
 * click to shoot, right click (held) to scope, wheel to cycle scope zoom,
 * R to reload, Shift (held) to hold breath. Same shape as Supermarket
 * Rush's engine/input.js: one mutable object written by DOM listeners and
 * read once per frame by the R3F scene, so the hot path never triggers a
 * React render.
 *
 * All actions only act while pointer-locked — the browser itself releases
 * the lock on Esc, and `pointerlockchange` losing lock is what the gameplay
 * screen treats as "show the pause menu" (see screens/Gameplay.jsx).
 */
export function createInput() {
  return {
    mouseDX: 0,
    mouseDY: 0,
    locked: false,
    shootQueued: false,
    scoped: false,
    reloadQueued: false,
    holdBreath: false,
    wheelDelta: 0,
    reset() {
      this.shootQueued = false;
      this.scoped = false;
      this.reloadQueued = false;
      this.holdBreath = false;
      this.mouseDX = 0;
      this.mouseDY = 0;
      this.wheelDelta = 0;
    },
    consumeMouse() {
      const dx = this.mouseDX;
      const dy = this.mouseDY;
      this.mouseDX = 0;
      this.mouseDY = 0;
      return [dx, dy];
    },
    consumeShoot() {
      const s = this.shootQueued;
      this.shootQueued = false;
      return s;
    },
    consumeReload() {
      const r = this.reloadQueued;
      this.reloadQueued = false;
      return r;
    },
    consumeWheel() {
      const w = this.wheelDelta;
      this.wheelDelta = 0;
      return w;
    },
  };
}

/**
 * Wires an element up for pointer lock, mouse buttons, wheel and keyboard.
 * `hooks`: onLockChange(locked).
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

  const onMouseDown = (e) => {
    if (doc.pointerLockElement !== el) {
      requestLock();
      return;
    }
    if (e.button === 0) {
      input.shootQueued = true;
      e.preventDefault();
    } else if (e.button === 2) {
      input.scoped = true;
      e.preventDefault();
    }
  };
  const onMouseUp = (e) => {
    if (e.button === 2) input.scoped = false;
  };
  const onContextMenu = (e) => e.preventDefault();

  const onWheel = (e) => {
    if (doc.pointerLockElement !== el) return;
    input.wheelDelta += e.deltaY;
    e.preventDefault();
  };

  const onKeyDown = (e) => {
    if (doc.pointerLockElement !== el) return;
    if (e.code === "KeyR") {
      input.reloadQueued = true;
      e.preventDefault();
      return;
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      input.holdBreath = true;
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.holdBreath = false;
  };

  const onBlurOrHide = () => input.reset();

  el.addEventListener("mousedown", onMouseDown);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("mouseup", onMouseUp);
  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  doc.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlurOrHide);
  doc.addEventListener("visibilitychange", onBlurOrHide);

  return function dispose() {
    el.removeEventListener("mousedown", onMouseDown);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("contextmenu", onContextMenu);
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
