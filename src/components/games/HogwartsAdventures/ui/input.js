/**
 * Keyboard + mouse + touch → the simulation's per-step input.
 *
 * Desktop: WASD move · mouse look (pointer lock) · Shift sprint · Space
 * dodge · LMB cast the equipped spell (hold to keep casting bolts) · RMB aim ·
 * F Protego · Q / R signature spells · 1–9 / wheel choose a spell · L Lumos ·
 * H Wiggenweld · G Invigoration · E interact. Panels (I inventory, K spellbook,
 * C character, J journal, M map, Esc pause) are handled by the shell.
 *
 * Touch: left-side floating joystick, right-side drag to look, buttons call
 * press()/release(). Edges are latched until a step consumes them.
 */
export function createInput() {
  const keys = new Set();
  const edges = new Set();
  const mouse = { dx: 0, dy: 0, lmb: false, lmbPressed: false, rmb: false, wheel: 0 };
  const touch = { mx: 0, mz: 0, look: { dx: 0, dy: 0 }, held: new Set(), pressed: new Set(), slot: null, cycle: 0 };
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
    selectSlot(i) {
      touch.slot = i;
    },
    cycleSpell(d) {
      touch.cycle += d;
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
      touch.slot = null;
      touch.cycle = 0;
    },
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
      let slot = touch.slot;
      for (let i = 1; i <= 9; i++) if (e(`Digit${i}`)) slot = i - 1;
      const out = {
        mx,
        mz,
        dYaw: mouse.dx * s + touch.look.dx * 0.006 * I.sens,
        dPitch: -(mouse.dy * s + touch.look.dy * 0.005 * I.sens) * (I.invertY ? -1 : 1),
        sprint: k("ShiftLeft") || k("ShiftRight") || th("sprint") || Math.hypot(touch.mx, touch.mz) > 0.95,
        dodge: e("Space") || tp("dodge"),
        cast: { down: mouse.lmb || th("cast"), pressed: mouse.lmbPressed || tp("cast") },
        aim: mouse.rmb || th("aim"),
        interact: e("KeyE") || tp("interact"),
        shield: e("KeyF") || tp("shield"),
        q: e("KeyQ") || tp("q"),
        r: e("KeyR") || tp("r"),
        lumos: e("KeyL") || tp("lumos"),
        potion: e("KeyH") || tp("potion") ? 1 : e("KeyG") || tp("tonic") ? 2 : 0,
        slot,
        cycle: Math.sign(mouse.wheel) + touch.cycle,
      };
      edges.clear();
      mouse.dx = mouse.dy = 0;
      mouse.lmbPressed = false;
      mouse.wheel = 0;
      touch.look.dx = touch.look.dy = 0;
      touch.pressed.clear();
      touch.slot = null;
      touch.cycle = 0;
      return out;
    },
  };
  return I;
}

export function lockKeyboard(on) {
  const kb = typeof navigator !== "undefined" ? navigator.keyboard : null;
  if (!kb?.lock) return;
  try {
    if (on) kb.lock(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "KeyI", "KeyM", "KeyJ", "KeyK", "KeyL", "KeyC", "Escape"]).catch(() => {});
    else kb.unlock();
  } catch {
    /* ignore */
  }
}
export function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return (window.matchMedia?.("(pointer: coarse)")?.matches && !window.matchMedia?.("(hover: hover)")?.matches) || ("ontouchstart" in window && navigator.maxTouchPoints > 0 && !window.matchMedia?.("(hover: hover)")?.matches);
}
