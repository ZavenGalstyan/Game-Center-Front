/**
 * Keyboard + mouse → one sim input per frame.
 * WASD/arrows move · mouse looks · LMB shoot · RMB aim · R reload ·
 * Space jump · F flashlight · E interact · Shift sprint · 1/2/3 or wheel switch weapons.
 * Presses are latched until a frame consumes them, so quick taps are never lost.
 */
export const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyF", "KeyR", "Digit1", "Digit2", "Digit3", "Tab"]);

export function createInput() {
  const keys = new Set();
  const edges = new Set();
  const mouse = { dx: 0, dy: 0, l: false, r: false, lEdge: false, wheel: 0 };
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
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return; // pointer-lock glitch
      mouse.dx += dx;
      mouse.dy += dy;
    },
    mouseDown(b) {
      if (b === 0) {
        mouse.l = true;
        mouse.lEdge = true;
      }
      if (b === 2) mouse.r = true;
    },
    mouseUp(b) {
      if (b === 0) mouse.l = false;
      if (b === 2) mouse.r = false;
    },
    wheel(d) {
      mouse.wheel += Math.sign(d);
    },
    /** release everything (blur, pause, pointer-lock loss) so nothing sticks */
    clear() {
      keys.clear();
      edges.clear();
      mouse.dx = mouse.dy = mouse.wheel = 0;
      mouse.l = mouse.r = mouse.lEdge = false;
    },
    frame() {
      const k = (c) => keys.has(c);
      const e = (c) => edges.has(c);
      const mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
      const mz = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
      const s = 0.0022 * I.sens;
      const out = {
        mx,
        mz,
        dYaw: -mouse.dx * s,
        dPitch: -mouse.dy * s * (I.invertY ? -1 : 1),
        fire: mouse.l,
        fireP: mouse.lEdge,
        aim: mouse.r,
        reload: e("KeyR"),
        sprint: k("ShiftLeft") || k("ShiftRight"),
        jump: e("Space"),
        interact: e("KeyE"),
        flash: e("KeyF"),
        weapon: e("Digit1") ? 1 : e("Digit2") ? 2 : e("Digit3") ? 3 : 0,
        wheel: mouse.wheel,
      };
      edges.clear();
      mouse.dx = mouse.dy = mouse.wheel = 0;
      mouse.lEdge = false;
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
    if (on) kb.lock(["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyF", "KeyR", "Space", "ShiftLeft", "Escape", "Tab"]).catch(() => {});
    else kb.unlock();
  } catch {
    /* ignore */
  }
}
