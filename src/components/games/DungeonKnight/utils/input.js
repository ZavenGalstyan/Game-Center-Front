/**
 * Dungeon Knight — player input. One mutable object written by DOM listeners
 * and read once per frame; the hot path never triggers a React render.
 *
 *   W A S D            move (camera-relative)      Shift   sprint
 *   Mouse              camera (pointer lock)       ← → ↑ ↓ camera (keys)
 *   Left mouse         light attack (combo)        R       heavy attack
 *   Right mouse (hold) block                       Space   dodge roll
 *   E                  interact (chest / shrine / door)
 *   Q                  potion                      Esc / P pause
 *
 * Presses are latched EDGES (one press = one action; key-repeat ignored).
 * Everything held is released on window blur, tab hide, pause, pointer-lock
 * loss, screen change, death, room transition and detach — nothing can stay
 * stuck (W, block, sprint …). Space / arrows never scroll the page.
 */
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyQ", "KeyR", "KeyP", "Escape"]);

export function createInput() {
  const I = {
    keys: new Set(),
    mouse: { left: false, right: false },
    lookDX: 0,
    lookDY: 0,
    edges: { attack: false, heavy: false, dodge: false, interact: false, potion: false, pause: false },
    locked: false,
    lockFailed: false,
    enabled: true,
    el: null,
    handlers: null,
    onLockChange: null,
    isTouch: false,
    touch: { mx: 0, my: 0, block: false, sprint: false, lookDX: 0, lookDY: 0 },
    drag: null,
    keyLook: true,
  };

  I.releaseAll = () => {
    I.keys.clear();
    I.mouse.left = false;
    I.mouse.right = false;
    I.lookDX = 0;
    I.lookDY = 0;
    for (const k in I.edges) I.edges[k] = false;
    I.touch.mx = 0;
    I.touch.my = 0;
    I.touch.block = false;
    I.touch.sprint = false;
    I.drag = null;
  };

  I.press = (name) => {
    if (!I.enabled) return;
    I.edges[name] = true;
  };

  /** Per-frame raw input for the engine (edges handed over and cleared). */
  I.frame = (camYaw) => {
    const k = I.keys;
    let ax = 0;
    let ay = 0;
    if (k.has("KeyW")) ay += 1;
    if (k.has("KeyS")) ay -= 1;
    if (k.has("KeyD")) ax += 1;
    if (k.has("KeyA")) ax -= 1;
    ax += I.touch.mx;
    ay += I.touch.my;
    const m = Math.hypot(ax, ay);
    if (m > 1) {
      ax /= m;
      ay /= m;
    }
    const e = I.edges;
    const any = e.attack || e.heavy || e.dodge || e.interact || e.potion;
    const raw = {
      ax,
      ay,
      camYaw,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight") || I.touch.sprint,
      block: I.mouse.right || I.touch.block,
      edges: any ? { attack: e.attack, heavy: e.heavy, dodge: e.dodge, interact: e.interact, potion: e.potion } : null,
    };
    e.attack = e.heavy = e.dodge = e.interact = e.potion = false;
    return raw;
  };

  I.consumeLook = () => {
    let dx = I.lookDX + I.touch.lookDX;
    let dy = I.lookDY + I.touch.lookDY;
    I.lookDX = 0;
    I.lookDY = 0;
    I.touch.lookDX = 0;
    I.touch.lookDY = 0;
    // keyboard camera (always available — also the fallback without pointer lock)
    if (I.keyLook && I.enabled) {
      if (I.keys.has("ArrowLeft")) dx -= 9;
      if (I.keys.has("ArrowRight")) dx += 9;
      if (I.keys.has("ArrowUp")) dy -= 6;
      if (I.keys.has("ArrowDown")) dy += 6;
    }
    return [dx, dy];
  };
  I.takePause = () => {
    const p = I.edges.pause;
    I.edges.pause = false;
    return p;
  };

  I.requestLock = () => {
    const el = I.el;
    if (!el || I.locked || I.lockFailed || I.isTouch) return;
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
    const typing = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    const kd = (e) => {
      if (typing(e.target)) return;
      if (!GAME_KEYS.has(e.code)) return;
      // only while the game stage is the thing being played
      if (!I.enabled && e.code !== "Escape" && e.code !== "KeyP") return;
      e.preventDefault();
      if (e.repeat) return;
      I.keys.add(e.code);
      if (!I.enabled) {
        if (e.code === "Escape" || e.code === "KeyP") I.edges.pause = true;
        return;
      }
      if (e.code === "Space") I.press("dodge");
      else if (e.code === "KeyE") I.press("interact");
      else if (e.code === "KeyQ") I.press("potion");
      else if (e.code === "KeyR") I.press("heavy");
      else if (e.code === "KeyP" || e.code === "Escape") I.edges.pause = true;
    };
    const ku = (e) => {
      I.keys.delete(e.code);
    };
    const md = (e) => {
      if (!I.enabled) return;
      if (e.button === 0) {
        if (!I.locked && !I.lockFailed && !I.isTouch) {
          // the first click captures the mouse; it doesn't swing
          I.requestLock();
          return;
        }
        if (I.locked) {
          I.mouse.left = true;
          I.press("attack");
        } else {
          // no pointer lock available: drag to look, click to attack
          I.drag = { x: e.clientX, y: e.clientY, moved: 0 };
        }
      } else if (e.button === 2) {
        I.mouse.right = true;
      }
    };
    const mu = (e) => {
      if (e.button === 0) {
        I.mouse.left = false;
        if (I.drag && I.drag.moved < 6 && I.enabled) I.press("attack");
        I.drag = null;
      } else if (e.button === 2) I.mouse.right = false;
    };
    const mm = (e) => {
      if (!I.enabled) return;
      if (I.locked) {
        I.lookDX += e.movementX || 0;
        I.lookDY += e.movementY || 0;
      } else if (I.drag) {
        const dx = e.clientX - I.drag.x;
        const dy = e.clientY - I.drag.y;
        I.drag.moved += Math.abs(dx) + Math.abs(dy);
        I.drag.x = e.clientX;
        I.drag.y = e.clientY;
        if (I.drag.moved >= 6) {
          I.lookDX += dx * 1.4;
          I.lookDY += dy * 1.4;
        }
      }
    };
    const ctx = (e) => e.preventDefault();
    const blur = () => I.releaseAll();
    const vis = () => {
      if (document.visibilityState === "hidden") I.releaseAll();
    };
    const lockCh = () => {
      const was = I.locked;
      I.locked = document.pointerLockElement === el;
      if (!I.locked) {
        I.mouse.left = false;
        I.mouse.right = false;
      }
      if (was !== I.locked && I.onLockChange) I.onLockChange(I.locked);
    };
    const lockErr = () => {
      I.lockFailed = true;
      if (I.onLockChange) I.onLockChange(false);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    el.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    window.addEventListener("mousemove", mm);
    el.addEventListener("contextmenu", ctx);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    document.addEventListener("pointerlockchange", lockCh);
    document.addEventListener("pointerlockerror", lockErr);
    I.handlers = { kd, ku, md, mu, mm, ctx, blur, vis, lockCh, lockErr };
  };

  I.detach = () => {
    const h = I.handlers;
    if (!h) return;
    window.removeEventListener("keydown", h.kd);
    window.removeEventListener("keyup", h.ku);
    if (I.el) {
      I.el.removeEventListener("mousedown", h.md);
      I.el.removeEventListener("contextmenu", h.ctx);
    }
    window.removeEventListener("mouseup", h.mu);
    window.removeEventListener("mousemove", h.mm);
    window.removeEventListener("blur", h.blur);
    document.removeEventListener("visibilitychange", h.vis);
    document.removeEventListener("pointerlockchange", h.lockCh);
    document.removeEventListener("pointerlockerror", h.lockErr);
    I.exitLock();
    I.handlers = null;
    I.releaseAll();
  };

  return I;
}
