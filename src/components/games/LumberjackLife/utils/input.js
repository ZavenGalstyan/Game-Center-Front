/**
 * Lumberjack Life — player input. One mutable object written by DOM
 * listeners and read once per frame by the scene; the hot path never
 * triggers a React render.
 *
 *   WASD / arrows move (arrows also steer vehicles) · mouse look (pointer lock,
 *   or hold right mouse to look when lock is unavailable) · Shift sprint ·
 *   LMB tool (hold for chainsaw) · E interact · F vehicle · Q switch tool ·
 *   Space brake · Esc / P pause
 *
 * Presses are latched edges consumed by the next simulation step. Everything
 * held (keys, mouse buttons, touch stick, chainsaw trigger, throttle) is
 * cleared on window blur, pause, pointer-lock loss, screen change and detach.
 */
export function createInput() {
  const I = {
    keys: new Set(),
    mouseL: false,
    mouseR: false,
    lookDX: 0,
    lookDY: 0,
    edges: { primary: 0, interact: 0, vehicle: 0, tool: 0, pause: 0 },
    locked: false,
    lockFailed: false,
    touch: { mx: 0, my: 0, sprint: false, primary: false, look: false },
    enabled: true,
    el: null,
    handlers: null,
    onLockChange: null,
    lastMouse: null,
    lastLookAt: 0,
  };

  I.releaseAll = () => {
    I.keys.clear();
    I.mouseL = false;
    I.mouseR = false;
    I.lookDX = 0;
    I.lookDY = 0;
    for (const k of Object.keys(I.edges)) I.edges[k] = 0;
    I.touch.mx = 0;
    I.touch.my = 0;
    I.touch.sprint = false;
    I.touch.primary = false;
    I.lastMouse = null;
  };

  I.press = (name) => {
    if (!I.enabled) return;
    I.edges[name] = (I.edges[name] || 0) + 1;
  };
  I.take = (name) => {
    const v = I.edges[name] > 0;
    I.edges[name] = 0;
    return v;
  };

  /** movement axes: x = right, y = forward (−1..1) */
  I.axes = () => {
    let x = 0;
    let y = 0;
    const k = I.keys;
    if (k.has("KeyW") || k.has("ArrowUp")) y += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    x += I.touch.mx;
    y += I.touch.my;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y };
  };
  I.sprint = () => I.keys.has("ShiftLeft") || I.keys.has("ShiftRight") || I.touch.sprint;
  I.brake = () => I.keys.has("Space");
  I.primaryHeld = () => I.mouseL || I.touch.primary;

  I.consumeLook = () => {
    const dx = I.lookDX;
    const dy = I.lookDY;
    I.lookDX = 0;
    I.lookDY = 0;
    if (dx || dy) I.lastLookAt = performance.now();
    return [dx, dy];
  };

  I.requestLock = () => {
    const el = I.el;
    if (!el || I.locked || I.lockFailed) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {
        I.lockFailed = true;
      });
    } catch {
      I.lockFailed = true;
    }
  };
  I.exitLock = () => {
    try {
      if (document.pointerLockElement === I.el) document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  };

  I.attach = (el) => {
    I.detach();
    I.el = el;
    const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "Space", "KeyE", "KeyF", "KeyQ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyP"]);
    const kd = (e) => {
      if (!I.enabled) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      I.keys.add(e.code);
      switch (e.code) {
        case "KeyE": I.press("interact"); break;
        case "KeyF": I.press("vehicle"); break;
        case "KeyQ": I.press("tool"); break;
        case "KeyP": I.press("pause"); break;
        default:
      }
    };
    const ku = (e) => {
      I.keys.delete(e.code);
    };
    const md = (e) => {
      if (!I.enabled) return;
      if (e.button === 0) {
        if (!I.locked && !I.lockFailed) {
          // the first click only captures the mouse — it doesn't swing
          I.requestLock();
          return;
        }
        I.mouseL = true;
        I.press("primary");
      } else if (e.button === 2) {
        I.mouseR = true;
        I.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const mu = (e) => {
      if (e.button === 0) I.mouseL = false;
      if (e.button === 2) {
        I.mouseR = false;
        I.lastMouse = null;
      }
    };
    const mm = (e) => {
      if (!I.enabled) return;
      if (I.locked) {
        I.lookDX += e.movementX || 0;
        I.lookDY += e.movementY || 0;
      } else if (I.mouseR || I.lockFailed) {
        if (I.lastMouse) {
          I.lookDX += e.clientX - I.lastMouse.x;
          I.lookDY += e.clientY - I.lastMouse.y;
        }
        I.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const cm = (e) => e.preventDefault();
    const blur = () => I.releaseAll();
    const plc = () => {
      const locked = document.pointerLockElement === el;
      I.locked = locked;
      if (!locked) {
        I.mouseL = false;
        I.keys.clear();
      }
      I.onLockChange && I.onLockChange(locked);
    };
    const ple = () => {
      I.lockFailed = true;
      I.onLockChange && I.onLockChange(false);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    el.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    window.addEventListener("mousemove", mm);
    el.addEventListener("contextmenu", cm);
    window.addEventListener("blur", blur);
    document.addEventListener("pointerlockchange", plc);
    document.addEventListener("pointerlockerror", ple);
    I.handlers = { kd, ku, md, mu, mm, cm, blur, plc, ple };
  };

  I.detach = () => {
    const h = I.handlers;
    if (!h) return;
    window.removeEventListener("keydown", h.kd);
    window.removeEventListener("keyup", h.ku);
    if (I.el) {
      I.el.removeEventListener("mousedown", h.md);
      I.el.removeEventListener("contextmenu", h.cm);
    }
    window.removeEventListener("mouseup", h.mu);
    window.removeEventListener("mousemove", h.mm);
    window.removeEventListener("blur", h.blur);
    document.removeEventListener("pointerlockchange", h.plc);
    document.removeEventListener("pointerlockerror", h.ple);
    I.exitLock();
    I.handlers = null;
    I.releaseAll();
  };

  return I;
}
