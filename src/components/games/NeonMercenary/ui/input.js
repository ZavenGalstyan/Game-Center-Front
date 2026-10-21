/**
 * Keyboard + mouse input → the sim's per-step input object.
 *
 * Mouse look uses pointer lock (movementX/Y). Edge-triggered actions are
 * latched until the next sim step consumes them so a quick tap between two
 * steps is never lost.
 *
 * Bindings (as specified): WASD move · mouse look · Shift sprint · Space jump
 * · Ctrl crouch (standing) / dodge (moving) · E interact (hold for long
 * actions) · LMB fire · RMB aim · R reload · Q cyber ability · F melee ·
 * 1/2/3 + wheel weapons · H quick MedKit · Tab inventory · J journal · M map
 * · Esc pause. C (crouch) and V (dodge) are alternates for Ctrl, which some
 * browsers reserve for shortcuts.
 */
export function createInput() {
  const keys = new Set();
  const edges = new Set();
  const mouse = { dx: 0, dy: 0, fire: false, aim: false, firePressed: false, wheel: 0 };
  const I = {
    keys,
    mouse,
    sens: 1,
    invertY: false,
    enabled: false,
    /** Called by the shell's key handler. Returns true when the key was used. */
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
        mouse.fire = true;
        mouse.firePressed = true;
      }
      if (b === 2) mouse.aim = true;
    },
    mouseUp(b) {
      if (b === 0) mouse.fire = false;
      if (b === 2) mouse.aim = false;
    },
    wheel(d) {
      mouse.wheel += Math.sign(d);
    },
    clear() {
      keys.clear();
      edges.clear();
      mouse.fire = mouse.aim = mouse.firePressed = false;
      mouse.dx = mouse.dy = mouse.wheel = 0;
    },
    /** Build one sim step's input and consume edges / mouse deltas. */
    frame() {
      const k = (c) => keys.has(c);
      const e = (c) => edges.has(c);
      const s = 0.0022 * I.sens;
      const out = {
        mx: (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0),
        mz: (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0),
        dYaw: -mouse.dx * s,
        dPitch: -mouse.dy * s * (I.invertY ? -1 : 1),
        sprint: k("ShiftLeft") || k("ShiftRight"),
        jump: e("Space"),
        ctrl: e("ControlLeft") || e("ControlRight"),
        crouchKey: e("KeyC"),
        dodgeKey: e("KeyV"),
        interact: k("KeyE"),
        interactPressed: e("KeyE"),
        fire: mouse.fire,
        firePressed: mouse.firePressed,
        aim: mouse.aim,
        reload: e("KeyR"),
        ability: e("KeyQ"),
        melee: e("KeyF"),
        heal: e("KeyH"),
        slot: e("Digit1") ? "w1" : e("Digit2") ? "w2" : e("Digit3") ? "melee" : null,
        cycle: mouse.wheel ? Math.sign(mouse.wheel) : 0,
      };
      if (out.dodgeKey && (out.mx || out.mz)) out.ctrl = true;
      edges.clear();
      mouse.dx = mouse.dy = 0;
      mouse.firePressed = false;
      mouse.wheel = 0;
      return out;
    },
    /** Peek a pressed edge without consuming (UI shortcuts). */
    peek(code) {
      return edges.has(code);
    },
  };
  return I;
}

/** Fullscreen keyboard lock (Chromium): keeps Ctrl+W / Esc-style shortcuts from leaving the game. */
export function lockKeyboard(on) {
  const kb = typeof navigator !== "undefined" ? navigator.keyboard : null;
  if (!kb?.lock) return;
  try {
    if (on) kb.lock(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "Tab", "ControlLeft"]).catch(() => {});
    else kb.unlock();
  } catch {
    /* ignore */
  }
}
