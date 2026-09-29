/**
 * Arena Gladiator — player input. One mutable object written by DOM
 * listeners and read once per frame by the fight scene, so the hot path never
 * triggers a React render.
 *
 *   WASD move · mouse look (Pointer Lock) · Shift sprint · Space dodge
 *   LMB light · RMB (hold) block · MMB / R heavy · F kick
 *   Q lock-on (third person) · V / C camera · Esc / P pause
 *   Keyboard-only fallback: J light · K (hold) block · L heavy · arrows look
 *
 * Presses are latched as "edges" and consumed by the next simulation step;
 * held states (move, sprint, block) are cleared on blur, pause, pointer-lock
 * loss and screen change so nothing ever sticks.
 */
export function createInput() {
  const I = {
    keys: new Set(),
    mouseBlock: false,
    lookDX: 0,
    lookDY: 0,
    edges: { light: 0, heavy: 0, dodge: 0, kick: 0, lock: 0, camera: 0, pause: 0 },
    locked: false,
    lockFailed: false,
    touch: { mx: 0, my: 0, block: false, sprint: false },
    enabled: true,
    el: null,
    handlers: null,
    onLockChange: null,
    lastMouse: null,
  };

  I.releaseAll = () => {
    I.keys.clear();
    I.mouseBlock = false;
    I.lookDX = 0;
    I.lookDY = 0;
    for (const k of Object.keys(I.edges)) I.edges[k] = 0;
    I.touch.mx = 0;
    I.touch.my = 0;
    I.touch.block = false;
    I.touch.sprint = false;
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

  /** Movement in camera-local terms: x = right, y = forward (−1..1). */
  I.move = () => {
    let x = 0;
    let y = 0;
    const k = I.keys;
    if (k.has("KeyW")) y += 1;
    if (k.has("KeyS")) y -= 1;
    if (k.has("KeyD")) x += 1;
    if (k.has("KeyA")) x -= 1;
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
  I.block = () => I.mouseBlock || I.keys.has("KeyK") || I.touch.block;

  I.consumeLook = () => {
    let dx = I.lookDX;
    let dy = I.lookDY;
    I.lookDX = 0;
    I.lookDY = 0;
    // arrow-key look (keyboard-only play)
    if (I.keys.has("ArrowLeft")) dx -= 9;
    if (I.keys.has("ArrowRight")) dx += 9;
    if (I.keys.has("ArrowUp")) dy -= 6;
    if (I.keys.has("ArrowDown")) dy += 6;
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
    const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "Space", "KeyR", "KeyF", "KeyQ", "KeyV", "KeyC", "KeyJ", "KeyK", "KeyL", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyP"]);
    const kd = (e) => {
      if (!I.enabled) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      I.keys.add(e.code);
      switch (e.code) {
        case "Space": I.press("dodge"); break;
        case "KeyR":
        case "KeyL": I.press("heavy"); break;
        case "KeyJ": I.press("light"); break;
        case "KeyF": I.press("kick"); break;
        case "KeyQ": I.press("lock"); break;
        case "KeyV":
        case "KeyC": I.press("camera"); break;
        case "KeyP": I.press("pause"); break;
        default:
      }
    };
    const ku = (e) => {
      I.keys.delete(e.code);
    };
    const md = (e) => {
      if (!I.enabled) return;
      if (!I.locked && !I.lockFailed && e.button === 0) {
        // first click only captures the mouse, it doesn't swing
        I.requestLock();
        return;
      }
      if (e.button === 0) I.press("light");
      else if (e.button === 2) I.mouseBlock = true;
      else if (e.button === 1) {
        e.preventDefault();
        I.press("heavy");
      }
    };
    const mu = (e) => {
      if (e.button === 2) I.mouseBlock = false;
    };
    const mm = (e) => {
      if (!I.enabled) return;
      if (I.locked) {
        I.lookDX += e.movementX || 0;
        I.lookDY += e.movementY || 0;
      } else if (I.lockFailed) {
        // no pointer lock available: look with the mouse position instead
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
        I.mouseBlock = false;
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
