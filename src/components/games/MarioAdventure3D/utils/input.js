/**
 * Mario Adventure 3D — player input. One mutable object written by DOM
 * listeners and read once per frame; the hot path never re-renders React.
 *
 *   W A S D / arrows   move (camera-relative)
 *   Mouse              orbit the camera (pointer lock; drag-look fallback)
 *   Wheel              camera distance
 *   Space              jump (press again in the air = double jump)
 *   Shift              sprint        E   interact        Esc / P   pause
 *
 * Presses are latched EDGES (one press = one action, key-repeat ignored).
 * Everything held is released on blur, tab hide, pause, pointer-lock loss
 * and detach, so no key can stay stuck. Space / arrows never scroll the page.
 */
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyP"]);

export function createInput() {
  const I = {
    keys: new Set(),
    lookDX: 0,
    lookDY: 0,
    wheel: 0,
    edges: { jump: false, interact: false, pause: false },
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
    I.wheel = 0;
    I.edges.jump = I.edges.interact = I.edges.pause = false;
    I.dragging = false;
    I.lastMouse = null;
  };

  I.frame = () => {
    const k = I.keys;
    let ax = 0;
    let ay = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) ay += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) ay -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) ax += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) ax -= 1;
    const m = Math.hypot(ax, ay);
    if (m > 1) {
      ax /= m;
      ay /= m;
    }
    const raw = {
      ax,
      ay,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
      jumpHeld: k.has("Space"),
      jump: I.edges.jump,
      interact: I.edges.interact,
    };
    I.edges.jump = I.edges.interact = false;
    return raw;
  };
  I.consumeLook = () => {
    const d = [I.lookDX, I.lookDY];
    I.lookDX = 0;
    I.lookDY = 0;
    return d;
  };
  I.consumeWheel = () => {
    const w = I.wheel;
    I.wheel = 0;
    return w;
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
      if (e.code === "Space") I.edges.jump = true;
      else if (e.code === "KeyE") I.edges.interact = true;
    };
    const ku = (e) => I.keys.delete(e.code);
    const md = (e) => {
      if (!I.enabled) return;
      if (!I.locked && !I.lockFailed && e.button === 0) {
        I.requestLock();
        return;
      }
      if (!I.locked) {
        I.dragging = true;
        I.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };
    const mu = () => {
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
      if (!I.enabled) return;
      e.preventDefault();
      I.wheel += Math.max(-120, Math.min(120, e.deltaY));
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
