/**
 * Keyboard + mouse + touch → one sim input per frame.
 *
 * Desktop: WASD / arrows move · Space jump (hold for higher) · left click or
 * J / K spin. Touch: floating joystick (left), JUMP and SPIN buttons.
 * Presses are latched until a frame consumes them, so a quick tap between
 * two frames is never lost; held Space/JUMP drives the variable jump height.
 */
export function createInput() {
  const keys = new Set();
  const edges = new Set();
  const touch = { mx: 0, mz: 0, jumpHeld: false, pressed: new Set() };
  let click = false;
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
    stick(mx, mz) {
      touch.mx = mx;
      touch.mz = mz;
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
      touch.mx = touch.mz = 0;
      touch.jumpHeld = false;
      touch.pressed.clear();
    },
    /** consume everything gathered since the last call */
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
        spin: click || e("KeyJ") || e("KeyK") || touch.pressed.has("spin"),
      };
      edges.clear();
      click = false;
      touch.pressed.clear();
      return out;
    },
  };
  return I;
}

export const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyK"]);

/** In real fullscreen, keep Esc / Space etc. from being eaten by the browser. */
export function lockKeyboard(on) {
  const kb = typeof navigator !== "undefined" ? navigator.keyboard : null;
  if (!kb?.lock) return;
  try {
    if (on) kb.lock(["KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyK", "Space", "Escape"]).catch(() => {});
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
