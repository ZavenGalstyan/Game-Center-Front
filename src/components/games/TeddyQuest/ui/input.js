/**
 * Keyboard + mouse + touch → one input sample per frame (camera-relative stick).
 *
 * Desktop: WASD / arrows move · Space jump (hold = higher) · left click / J
 * attack · Shift sprint · mouse (pointer lock or drag) rotates the camera ·
 * Q / E rotate the camera with the keyboard.
 * Touch: joystick (left), JUMP / ATTACK buttons, drag anywhere else to look.
 * Presses are latched until a frame consumes them, so a quick tap between two
 * frames is never lost.
 */
export function createInput() {
  const keys = new Set();
  const edges = new Set();
  const touch = { mx: 0, mz: 0, jumpHeld: false, pressed: new Set(), sprint: false };
  let click = false;
  let lookX = 0, lookY = 0;
  const I = {
    keyDown(code, repeat) {
      if (!repeat) edges.add(code);
      keys.add(code);
    },
    keyUp(code) {
      keys.delete(code);
    },
    mouseDown(b) {
      if (b === 0) click = true;
    },
    look(dx, dy) {
      lookX += dx;
      lookY += dy;
    },
    stick(mx, mz) {
      touch.mx = mx;
      touch.mz = mz;
      touch.sprint = Math.hypot(mx, mz) > 0.92;
    },
    press(a) {
      touch.pressed.add(a);
      if (a === "jump") touch.jumpHeld = true;
    },
    release(a) {
      if (a === "jump") touch.jumpHeld = false;
    },
    clear() {
      keys.clear();
      edges.clear();
      click = false;
      lookX = lookY = 0;
      touch.mx = touch.mz = 0;
      touch.jumpHeld = false;
      touch.sprint = false;
      touch.pressed.clear();
    },
    /** consume everything gathered since the last call. mx = right, mz = forward (camera space) */
    frame() {
      const k = (c) => keys.has(c);
      const e = (c) => edges.has(c);
      let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0) + touch.mx;
      let mz = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0) + touch.mz;
      const l = Math.hypot(mx, mz);
      if (l > 1) {
        mx /= l;
        mz /= l;
      }
      const out = {
        mx,
        mz,
        jump: e("Space") || touch.pressed.has("jump"),
        jumpHeld: k("Space") || touch.jumpHeld,
        attack: click || e("KeyJ") || e("KeyK") || touch.pressed.has("attack"),
        sprint: k("ShiftLeft") || k("ShiftRight") || touch.sprint,
        lookX,
        lookY,
        turn: (k("KeyE") ? 1 : 0) - (k("KeyQ") ? 1 : 0),
      };
      edges.clear();
      click = false;
      lookX = lookY = 0;
      touch.pressed.clear();
      return out;
    },
  };
  return I;
}

export const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyK", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"]);

/** In real fullscreen, keep Space / WASD from being eaten by the browser. */
export function lockKeyboard(on) {
  const kb = typeof navigator !== "undefined" ? navigator.keyboard : null;
  if (!kb?.lock) return;
  try {
    if (on) kb.lock(["KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyQ", "KeyE", "Space"]).catch(() => {});
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
