/**
 * Keyboard + mouse + touch → the simulation's per-step input.
 *
 * Desktop: WASD move · mouse look (pointer lock) · Shift sprint · Space
 * jump (dodge in combat or while blocking) · V / C dodge · LMB attack (hold:
 * heavy / draw / charge) · RMB block / ward / parry / aim · E interact ·
 * Q R F abilities · 1 heal / 2 tonic · wheel zoom. Panels: I inventory,
 * K skills, J journal, M map, Esc pause (handled by the shell).
 *
 * Touch: left-half virtual joystick, right-half drag to look, on-screen
 * buttons call press()/release() with the same action names.
 * Edges are latched until a step consumes them, so quick taps never vanish.
 */
export function createInput() {
  const keys = new Set();
  const edges = new Set();
  const mouse = { dx: 0, dy: 0, lmb: false, lmbPressed: false, rmb: false, wheel: 0 };
  const touch = { mx: 0, mz: 0, look: { dx: 0, dy: 0 }, held: new Set(), pressed: new Set() };
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
      if (b === 0) {
        mouse.lmb = true;
        mouse.lmbPressed = true;
      }
      if (b === 2) mouse.rmb = true;
    },
    mouseUp(b) {
      if (b === 0) mouse.lmb = false;
      if (b === 2) mouse.rmb = false;
    },
    wheel(d) {
      mouse.wheel += Math.sign(d);
    },
    /* touch */
    stick(mx, mz) {
      touch.mx = mx;
      touch.mz = mz;
    },
    look(dx, dy) {
      touch.look.dx += dx;
      touch.look.dy += dy;
    },
    press(a) {
      touch.held.add(a);
      touch.pressed.add(a);
    },
    release(a) {
      touch.held.delete(a);
    },
    clear() {
      keys.clear();
      edges.clear();
      mouse.lmb = mouse.rmb = mouse.lmbPressed = false;
      mouse.dx = mouse.dy = mouse.wheel = 0;
      touch.mx = touch.mz = 0;
      touch.look.dx = touch.look.dy = 0;
      touch.held.clear();
      touch.pressed.clear();
    },
    /** Build one step's input and consume edges / deltas. */
    frame() {
      const k = (c) => keys.has(c);
      const e = (c) => edges.has(c);
      const th = (a) => touch.held.has(a);
      const tp = (a) => touch.pressed.has(a);
      const s = 0.0022 * I.sens;
      let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0) + touch.mx;
      let mz = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0) + touch.mz;
      mx = Math.max(-1, Math.min(1, mx));
      mz = Math.max(-1, Math.min(1, mz));
      const out = {
        mx,
        mz,
        dYaw: (mouse.dx * s + touch.look.dx * 0.006 * I.sens),
        dPitch: -(mouse.dy * s + touch.look.dy * 0.005 * I.sens) * (I.invertY ? -1 : 1),
        sprint: k("ShiftLeft") || k("ShiftRight") || th("sprint") || Math.hypot(touch.mx, touch.mz) > 0.95,
        jump: e("Space") || tp("jump"),
        dodge: e("KeyV") || e("KeyC") || tp("dodge"),
        attack: { down: mouse.lmb || th("attack"), pressed: mouse.lmbPressed || tp("attack") },
        alt: mouse.rmb || th("block"),
        interact: e("KeyE") || tp("interact"),
        q: e("KeyQ") || tp("q"),
        r: e("KeyR") || tp("r"),
        f: e("KeyF") || tp("f"),
        potion: e("Digit1") || tp("potion") ? 1 : e("Digit2") || tp("tonic") ? 2 : 0,
        zoom: mouse.wheel,
      };
      edges.clear();
      mouse.dx = mouse.dy = 0;
      mouse.lmbPressed = false;
      mouse.wheel = 0;
      touch.look.dx = touch.look.dy = 0;
      touch.pressed.clear();
      return out;
    },
  };
  return I;
}

/** Fullscreen keyboard lock (Chromium) so game keys don't trigger browser shortcuts. */
export function lockKeyboard(on) {
  const kb = typeof navigator !== "undefined" ? navigator.keyboard : null;
  if (!kb?.lock) return;
  try {
    if (on) kb.lock(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "KeyI", "KeyM", "KeyJ", "KeyK", "Escape"]).catch(() => {});
    else kb.unlock();
  } catch {
    /* ignore */
  }
}

/** Touch-first device? (coarse pointer and no hover) */
export function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return (window.matchMedia?.("(pointer: coarse)")?.matches && !window.matchMedia?.("(hover: hover)")?.matches) || ("ontouchstart" in window && navigator.maxTouchPoints > 0 && !window.matchMedia?.("(hover: hover)")?.matches);
}
