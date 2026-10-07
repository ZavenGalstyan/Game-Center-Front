/**
 * Pirate Cove — input. One mutable object written by DOM listeners
 * (keyboard, pointer-locked mouse, touch controls) and read by the
 * fixed-step game, so the hot path never triggers a React render.
 *
 * The same keys mean different things at sea and ashore, so this layer only
 * records intent and presses; engine/game.js decides per mode:
 *   sea      W/S trim sails · A/D steer · Q/E broadside · F dock · mouse look
 *   ashore   WASD move · Shift sprint · Space jump · LMB/J attack · RMB/K
 *            block · C dodge · E/F interact · mouse camera
 * Presses are edge-triggered (`take` consumes one), so holding a key never
 * repeats an action and spamming can't queue more than one.
 */

const KEYS = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  KeyK: "block",
};

export function createInput() {
  const presses = new Set();
  const inp = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    block: false,
    mouseBlock: false,
    // touch
    stickX: 0,
    stickY: 0,
    touchSteer: 0,
    touchThrottle: null,
    lookDX: 0,
    lookDY: 0,
    mode: "sea",
    press(name) {
      presses.add(name);
    },
    take(name) {
      if (!presses.has(name)) return false;
      presses.delete(name);
      return true;
    },
    consumeLook() {
      const d = [inp.lookDX, inp.lookDY];
      inp.lookDX = 0;
      inp.lookDY = 0;
      return d;
    },
    reset() {
      inp.up = inp.down = inp.left = inp.right = inp.sprint = inp.block = inp.mouseBlock = false;
      inp.stickX = inp.stickY = inp.touchSteer = 0;
      inp.lookDX = inp.lookDY = 0;
      presses.clear();
    },
    get ship() {
      const steer = (inp.left ? 1 : 0) - (inp.right ? 1 : 0) + inp.touchSteer;
      return {
        throttle: (inp.up ? 1 : 0) - (inp.down ? 1 : 0),
        steer: Math.max(-1, Math.min(1, steer)),
        setThrottle: inp.touchThrottle,
      };
    },
    get foot() {
      let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0) + inp.stickX;
      let mz = (inp.up ? 1 : 0) - (inp.down ? 1 : 0) + inp.stickY;
      const l = Math.hypot(mx, mz);
      if (l > 1) {
        mx /= l;
        mz /= l;
      }
      return { mx, mz, sprint: inp.sprint, block: inp.block || inp.mouseBlock };
    },
  };
  return inp;
}

/**
 * Wires keyboard + mouse + pointer lock to `el`.
 * hooks: onLockChange(locked), onPause(), onMap(), touchMode() → bool.
 */
export function attachControls(el, inp, hooks = {}) {
  const doc = el.ownerDocument || document;
  const isLocked = () => doc.pointerLockElement === el;
  const active = () => isLocked() || hooks.touchMode?.();
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;

  const onLockChange = () => {
    const locked = isLocked();
    if (!locked) inp.reset();
    hooks.onLockChange?.(locked);
  };
  const onLockError = () => hooks.onLockChange?.(false);
  const onMouseMove = (e) => {
    if (!isLocked()) return;
    inp.lookDX += Math.max(-250, Math.min(250, e.movementX || 0));
    inp.lookDY += Math.max(-250, Math.min(250, e.movementY || 0));
  };
  const onMouseDown = (e) => {
    if (!isLocked()) return;
    if (e.button === 0) inp.press("attack");
    if (e.button === 2) inp.mouseBlock = true;
  };
  const onMouseUp = (e) => {
    if (e.button === 2) inp.mouseBlock = false;
  };
  const onContext = (e) => {
    if (isLocked() || el.contains(e.target)) e.preventDefault();
  };
  const onKeyDown = (e) => {
    if (typing(e)) return;
    if (e.code === "KeyP" || (e.code === "Escape" && hooks.touchMode?.())) {
      hooks.onPause?.();
      e.preventDefault();
      return;
    }
    if (e.code === "KeyM" || e.code === "Tab") {
      if (!e.repeat) hooks.onMap?.();
      e.preventDefault();
      return;
    }
    if (!active()) return;
    const once = (name) => {
      if (!e.repeat) inp.press(name);
      e.preventDefault();
    };
    switch (e.code) {
      case "KeyQ":
        return once("fireLeft");
      case "KeyE":
        if (inp.mode === "sea") return once("fireRight");
        return once("interact");
      case "KeyF":
        return once("interact");
      case "Space":
        return once("jump");
      case "KeyJ":
        return once("attack");
      case "KeyC":
        return once("dodge");
      default:
        break;
    }
    const slot = KEYS[e.code];
    if (slot) {
      inp[slot] = true;
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    const slot = KEYS[e.code];
    if (slot) inp[slot] = false;
  };
  const onBlur = () => inp.reset();

  doc.addEventListener("pointerlockchange", onLockChange);
  doc.addEventListener("pointerlockerror", onLockError);
  doc.addEventListener("mousemove", onMouseMove);
  el.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  doc.addEventListener("contextmenu", onContext);
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  doc.addEventListener("visibilitychange", onBlur);

  return function dispose() {
    doc.removeEventListener("pointerlockchange", onLockChange);
    doc.removeEventListener("pointerlockerror", onLockError);
    doc.removeEventListener("mousemove", onMouseMove);
    el.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    doc.removeEventListener("contextmenu", onContext);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    doc.removeEventListener("visibilitychange", onBlur);
    if (isLocked()) doc.exitPointerLock?.();
  };
}

export function requestLock(el) {
  try {
    const r = el.requestPointerLock?.({ unadjustedMovement: true });
    if (r && typeof r.catch === "function") {
      r.catch(() => {
        try {
          el.requestPointerLock?.();
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
