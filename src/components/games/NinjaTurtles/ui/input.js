/**
 * Keyboard + mouse + touch → one sim input per step.
 *
 * Desktop: WASD/arrows move · mouse look (pointer lock; or drag when the
 * lock is unavailable) · Space jump · LMB light attack · RMB / F heavy ·
 * Q special · Shift dodge · E interact. Touch: left-half floating joystick, right-half
 * drag to look, buttons call press(). Presses are latched until a step
 * consumes them, so a quick tap is never lost between frames.
 */
export function createInput() {
  const keys = new Set();
  const edges = new Set();
  const mouse = { dx: 0, dy: 0, light: false, heavy: false };
  const touch = { mx: 0, mz: 0, dx: 0, dy: 0, pressed: new Set() };
  const I = {
    sens: 1,
    invertY: false,
    keyDown(code, repeat) {
      if (!repeat) edges.add(code);
      keys.add(code);
    },
    keyUp(code) {
      keys.delete(code);
    },
    mouseMove(dx, dy) {
      mouse.dx += dx;
      mouse.dy += dy;
    },
    mouseDown(b) {
      if (b === 0) mouse.light = true;
      if (b === 2) mouse.heavy = true;
    },
    stick(mx, mz) {
      touch.mx = mx;
      touch.mz = mz;
    },
    look(dx, dy) {
      touch.dx += dx;
      touch.dy += dy;
    },
    press(a) {
      touch.pressed.add(a);
    },
    clear() {
      keys.clear();
      edges.clear();
      mouse.dx = mouse.dy = 0;
      mouse.light = mouse.heavy = false;
      touch.mx = touch.mz = touch.dx = touch.dy = 0;
      touch.pressed.clear();
    },
    /** Consume everything gathered since the last call. */
    frame() {
      const k = (c) => keys.has(c);
      const e = (c) => edges.has(c);
      const tp = (a) => touch.pressed.has(a);
      let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0) + touch.mx;
      let mz = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0) + touch.mz;
      const l = Math.hypot(mx, mz);
      if (l > 1) {
        mx /= l;
        mz /= l;
      }
      const s = 0.0024 * I.sens;
      const out = {
        mx,
        mz,
        dYaw: -(mouse.dx * s + touch.dx * 0.0065 * I.sens),
        dPitch: (mouse.dy * s + touch.dy * 0.005 * I.sens) * (I.invertY ? -1 : 1),
        jump: e("Space") || tp("jump"),
        dodge: e("ShiftLeft") || e("ShiftRight") || tp("dodge"),
        light: mouse.light || e("KeyJ") || tp("light"),
        heavy: mouse.heavy || e("KeyF") || e("KeyK") || tp("heavy"),
        special: e("KeyQ") || e("KeyL") || tp("special"),
        interact: e("KeyE") || tp("interact"),
      };
      edges.clear();
      mouse.dx = mouse.dy = 0;
      mouse.light = mouse.heavy = false;
      touch.dx = touch.dy = 0;
      touch.pressed.clear();
      return out;
    },
  };
  return I;
}

/** In real fullscreen, keep Esc/WASD etc. from being eaten by the browser. */
export function lockKeyboard(on) {
  const kb = typeof navigator !== "undefined" ? navigator.keyboard : null;
  if (!kb?.lock) return;
  try {
    if (on) kb.lock(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyF", "Space", "ShiftLeft", "Escape"]).catch(() => {});
    else kb.unlock();
  } catch {
    /* ignore */
  }
}

export function isTouchDevice() {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
  const hover = window.matchMedia?.("(hover: hover)")?.matches;
  return !!(coarse && !hover) || ("ontouchstart" in window && navigator.maxTouchPoints > 0 && !hover);
}
