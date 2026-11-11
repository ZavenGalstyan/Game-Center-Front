/**
 * Keyboard + mouse → one sim input per frame.
 *
 * WASD/arrows move · mouse looks (pointer lock, or drag when it's refused) ·
 * LMB shoot (punch when guns are holstered) · RMB aim · R reload · E interact
 * (hold for long actions) · Shift sprint · Space jump · Q dodge · F punch ·
 * V kick · X block · C crouch · Z Dead Eye · 1–4 / wheel switch weapons.
 * Presses are latched until a frame consumes them, so quick taps are never lost.
 */
export const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyQ", "KeyE", "KeyF", "KeyV", "KeyX", "KeyC", "KeyR", "KeyZ", "Digit1", "Digit2", "Digit3", "Digit4", "Tab"]);

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
      // guard against the occasional huge pointer-lock jump
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
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
    clear() {
      keys.clear();
      edges.clear();
      mouse.dx = mouse.dy = mouse.wheel = 0;
      mouse.l = mouse.r = mouse.lEdge = false;
    },
    /** Consume everything gathered since the last call. */
    frame() {
      const k = (c) => keys.has(c);
      const e = (c) => edges.has(c);
      let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
      let mz = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
      const l = Math.hypot(mx, mz);
      if (l > 1) {
        mx /= l;
        mz /= l;
      }
      const s = 0.0022 * I.sens;
      let weapon = 0;
      for (let i = 1; i <= 4; i++) if (e(`Digit${i}`)) weapon = i;
      const out = {
        mx,
        mz,
        dYaw: -mouse.dx * s,
        dPitch: -mouse.dy * s * (I.invertY ? -1 : 1),
        fire: mouse.l,
        fireP: mouse.lEdge,
        aim: mouse.r,
        reload: e("KeyR"),
        jump: e("Space"),
        sprint: k("ShiftLeft") || k("ShiftRight"),
        dodge: e("KeyQ"),
        melee: e("KeyF"),
        kick: e("KeyV"),
        block: k("KeyX"),
        crouch: e("KeyC"),
        interact: e("KeyE"),
        interactHeld: k("KeyE"),
        weapon,
        wheel: mouse.wheel,
        deadEye: e("KeyZ"),
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
    if (on) kb.lock(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyF", "KeyR", "KeyC", "KeyV", "KeyX", "KeyZ", "Space", "ShiftLeft", "Escape", "Tab"]).catch(() => {});
    else kb.unlock();
  } catch {
    /* ignore */
  }
}
