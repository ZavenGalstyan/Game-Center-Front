/**
 * Web Hero — keyboard + mouse input. One mutable object written by DOM
 * listeners and read once per frame; the hot path never re-renders React.
 *
 *   W A S D / arrows   move (camera-relative)        Mouse        orbit camera
 *   Space              jump · double jump            Shift        sprint
 *   Left click         light attack                  Right click  web shot
 *   Q (hold)           web swing — release to let go E (hold)     interact / rescue
 *   F                  heavy attack                  Ctrl / C     dodge
 *   R                  Web Storm (full Hero Energy)  1-5          web abilities
 *   Esc / P            pause
 *
 * Presses are latched EDGES (one press = one action, key-repeat ignored).
 * Everything held is released on blur, tab hide, pause, pointer-lock loss and
 * detach, so no key can stay stuck. Space / arrows / Ctrl never reach the page.
 */
const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyF", "KeyR", "KeyC",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "KeyP", "Tab",
]);
const EDGE_OF = {
  Space: "jump",
  KeyF: "heavy",
  ControlLeft: "dodge",
  ControlRight: "dodge",
  KeyC: "dodge",
  KeyR: "special",
  KeyE: "interact",
  Digit1: "ab1",
  Digit2: "ab2",
  Digit3: "ab3",
  Digit4: "ab4",
  Digit5: "ab5",
};

export function createInput() {
  const I = {
    keys: new Set(),
    lookDX: 0,
    lookDY: 0,
    edges: { jump: false, light: false, heavy: false, web: false, dodge: false, special: false, interact: false, ab1: false, ab2: false, ab3: false, ab4: false, ab5: false },
    lmb: false,
    rmb: false,
    locked: false,
    lockFailed: false,
    dragging: false,
    lastMouse: null,
    enabled: true,
    el: null,
    handlers: null,
    onLockChange: null,
    onPause: null,
  };

  I.releaseAll = () => {
    I.keys.clear();
    I.lookDX = 0;
    I.lookDY = 0;
    for (const k of Object.keys(I.edges)) I.edges[k] = false;
    I.lmb = false;
    I.rmb = false;
    I.dragging = false;
    I.lastMouse = null;
  };

  /** raw per-frame input in the engine's vocabulary (camYaw is filled by the renderer) */
  I.frame = () => {
    const k = I.keys;
    let mx = 0;
    let my = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) my += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) my -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    const raw = {
      mx,
      my,
      camYaw: 0,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
      jumpHeld: k.has("Space"),
      swing: k.has("KeyQ"),
      interactHeld: k.has("KeyE"),
      ...I.edges,
    };
    for (const e of Object.keys(I.edges)) I.edges[e] = false;
    return raw;
  };
  I.consumeLook = () => {
    const d = [I.lookDX, I.lookDY];
    I.lookDX = 0;
    I.lookDY = 0;
    return d;
  };

  I.requestLock = () => {
    const el = I.el;
    if (!el || I.locked || I.lockFailed) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") {
        r.catch(() => {
          I.lockFailed = true;
          I.onLockChange && I.onLockChange(false);
        });
      }
    } catch {
      I.lockFailed = true;
    }
  };
  I.exitLock = () => {
    try {
      if (I.el && document.pointerLockElement === I.el) document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  };

  I.attach = (el) => {
    I.detach();
    I.el = el;
    const kd = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        if (!e.repeat && I.onPause) I.onPause();
        return;
      }
      if (!I.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      I.keys.add(e.code);
      const edge = EDGE_OF[e.code];
      if (edge) I.edges[edge] = true;
    };
    const ku = (e) => {
      I.keys.delete(e.code);
      if (GAME_KEYS.has(e.code) && I.enabled) e.preventDefault();
    };
    const md = (e) => {
      if (!I.enabled) return;
      if (e.button === 2) {
        I.rmb = true;
        I.edges.web = true;
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      if (!I.locked && !I.lockFailed) {
        I.requestLock();
        return;
      }
      I.lmb = true;
      I.edges.light = true;
      if (!I.locked) {
        I.dragging = true;
        I.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const mu = (e) => {
      if (e.button === 2) I.rmb = false;
      if (e.button === 0) I.lmb = false;
      I.dragging = false;
      I.lastMouse = null;
    };
    const mm = (e) => {
      if (!I.enabled) return;
      if (I.locked) {
        const dx = e.movementX || 0;
        const dy = e.movementY || 0;
        if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return; // spike right after locking
        I.lookDX += dx;
        I.lookDY += dy;
      } else if (I.dragging && I.lastMouse) {
        I.lookDX += (e.clientX - I.lastMouse.x) * 1.6;
        I.lookDY += (e.clientY - I.lastMouse.y) * 1.6;
        I.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const wh = (e) => {
      if (I.enabled) e.preventDefault();
    };
    const cm = (e) => e.preventDefault();
    const blur = () => I.releaseAll();
    const vis = () => {
      if (document.visibilityState === "hidden") I.releaseAll();
    };
    const plc = () => {
      const locked = document.pointerLockElement === el;
      I.locked = locked;
      if (!locked) I.releaseAll();
      I.onLockChange && I.onLockChange(locked);
    };
    const ple = () => {
      I.lockFailed = true;
      I.onLockChange && I.onLockChange(false);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    el.addEventListener("mousedown", md);
    el.addEventListener("wheel", wh, { passive: false });
    window.addEventListener("mouseup", mu);
    window.addEventListener("mousemove", mm);
    el.addEventListener("contextmenu", cm);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    document.addEventListener("pointerlockchange", plc);
    document.addEventListener("pointerlockerror", ple);
    I.handlers = { kd, ku, md, mu, mm, wh, cm, blur, vis, plc, ple };
  };

  I.detach = () => {
    const h = I.handlers;
    if (!h) return;
    window.removeEventListener("keydown", h.kd);
    window.removeEventListener("keyup", h.ku);
    if (I.el) {
      I.el.removeEventListener("mousedown", h.md);
      I.el.removeEventListener("wheel", h.wh);
      I.el.removeEventListener("contextmenu", h.cm);
    }
    window.removeEventListener("mouseup", h.mu);
    window.removeEventListener("mousemove", h.mm);
    window.removeEventListener("blur", h.blur);
    document.removeEventListener("visibilitychange", h.vis);
    document.removeEventListener("pointerlockchange", h.plc);
    document.removeEventListener("pointerlockerror", h.ple);
    I.exitLock();
    I.handlers = null;
    I.el = null;
    I.releaseAll();
  };
  return I;
}
