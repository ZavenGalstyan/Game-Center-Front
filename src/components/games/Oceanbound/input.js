/**
 * Oceanbound — device input → per-frame intent for sim/game.js tick().
 *
 * Desktop: WASD / arrows move, mouse looks (pointer lock; if the lock is
 * refused, dragging over the stage still looks), Space jump / climb / swim
 * up, Shift sprint, C or Ctrl dive, E interact, LMB use tool, RMB or X
 * remove (hammer), R rotate, 1-8 / wheel hotbar, Tab inventory, B build
 * menu, Esc pause. Keys that would scroll the page are swallowed while
 * playing.
 *
 * Touch: left half = floating move joystick, right half = drag to look
 * (multi-touch tracked by pointerId); on-screen buttons call press().
 */
export function createInput() {
  const S = {
    keys: new Set(),
    active: false,
    locked: false,
    noLock: false,
    sens: 1,
    touchSens: 1,
    invert: false,
    lookX: 0,
    lookY: 0,
    use: false,
    usePressed: false,
    useReleased: false,
    alt: false,
    interact: false,
    rotate: false,
    jumpPressed: false,
    slot: null,
    wheel: 0,
    joy: { id: -1, ox: 0, oy: 0, x: 0, y: 0 },
    look: { id: -1, x: 0, y: 0 },
    drag: { on: false, x: 0, y: 0 },
    btn: { jump: false, sprint: false, dive: false, use: false },
    host: null,
    onPause: null,
    onInventory: null,
    onBuild: null,
  };
  const SWALLOW = new Set(["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "KeyB", "KeyR", "KeyC", "ControlLeft", "PageUp", "PageDown"]);
  const typing = (e) => e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA");

  const onKey = (e, down) => {
    if (!S.host || !S.host.isConnected || typing(e)) return;
    const c = e.code;
    if (S.overlay) {
      // inventory / build menu open: only the toggles work
      if (down && !e.repeat) {
        if (c === "Tab" || c === "KeyI") {
          e.preventDefault();
          S.onInventory?.();
        } else if (c === "KeyB") {
          e.preventDefault();
          S.onBuild?.();
        } else if (c === "Escape") S.onEscape?.();
      }
      if (SWALLOW.has(c)) e.preventDefault();
      return;
    }
    if (!S.active) return;
    if (SWALLOW.has(c)) e.preventDefault();
    if (down) S.keys.add(c);
    else S.keys.delete(c);
    if (!down || e.repeat) return;
    if (c === "KeyE" || c === "KeyF") S.interact = true;
    if (c === "KeyR") S.rotate = true;
    if (c === "KeyX") S.alt = true;
    if (c === "Space") S.jumpPressed = true;
    if (c.startsWith("Digit")) {
      const n = +c.slice(5);
      if (n >= 1 && n <= 8) S.slot = n - 1;
    }
    if (c === "Tab" || c === "KeyI") S.onInventory?.();
    if (c === "KeyB") S.onBuild?.();
    if (c === "Escape" || c === "KeyP") S.onPause?.("menu");
  };
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);

  const onMouseMove = (e) => {
    if (!S.active || S.overlay) return;
    if (S.locked || S.noLock) {
      if (!S.locked && !S.drag.on && S.noLock) return;
      const k = 0.0022 * S.sens;
      S.lookX += (e.movementX || 0) * k;
      S.lookY += (e.movementY || 0) * k * (S.invert ? -1 : 1);
    }
  };
  const onDown = (e) => {
    if (!S.active || S.overlay || e.pointerType === "touch") return;
    if (e.target.closest && e.target.closest("[data-ui]")) return;
    if (e.button === 0) {
      if (!S.use) S.usePressed = true;
      S.use = true;
    }
    if (e.button === 2) S.alt = true;
    if (S.noLock) S.drag = { on: true, x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    if (e.pointerType === "touch") return;
    if (e.button === 0 && S.use) {
      S.use = false;
      S.useReleased = true;
    }
    S.drag.on = false;
  };
  const onWheel = (e) => {
    if (!S.active || S.overlay) return;
    e.preventDefault();
    S.wheel += Math.sign(e.deltaY);
  };
  const onCtx = (e) => e.preventDefault();
  const onLockChange = () => {
    const was = S.locked;
    const el = document.pointerLockElement;
    S.locked = !!el && (el === S.host || S.host?.contains(el));
    if (was && !S.locked) {
      S.use = false;
      S.keys.clear();
      S.onPause?.("lock");
    }
  };
  const onBlurKeys = () => {
    S.keys.clear();
    S.use = false;
  };

  /* touch */
  const rect = () => S.host.getBoundingClientRect();
  const onTouchDown = (e) => {
    if (!S.active || S.overlay || e.pointerType !== "touch") return;
    if (e.target.closest && e.target.closest("[data-ui]")) return;
    const r = rect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < r.width * 0.42 && S.joy.id < 0) S.joy = { id: e.pointerId, ox: x, oy: y, x: 0, y: 0 };
    else if (S.look.id < 0) S.look = { id: e.pointerId, x, y };
    e.preventDefault();
  };
  const onTouchMove = (e) => {
    if (e.pointerType !== "touch" || !S.host) return;
    const r = rect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (e.pointerId === S.joy.id) {
      const R = Math.min(r.width, r.height) * 0.12;
      let dx = (x - S.joy.ox) / R;
      let dy = (y - S.joy.oy) / R;
      const L = Math.hypot(dx, dy);
      if (L > 1) {
        S.joy.ox += (dx / L) * (L - 1) * R;
        S.joy.oy += (dy / L) * (L - 1) * R;
        dx /= L;
        dy /= L;
      }
      S.joy.x = dx;
      S.joy.y = dy;
    } else if (e.pointerId === S.look.id) {
      const k = 0.006 * S.touchSens;
      S.lookX += (x - S.look.x) * k;
      S.lookY += (y - S.look.y) * k * (S.invert ? -1 : 1);
      S.look.x = x;
      S.look.y = y;
    }
  };
  const onTouchUp = (e) => {
    if (e.pointerType !== "touch") return;
    if (e.pointerId === S.joy.id) S.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    if (e.pointerId === S.look.id) S.look = { id: -1, x: 0, y: 0 };
  };

  const api = {
    S,
    attach(host) {
      S.host = host;
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      window.addEventListener("blur", onBlurKeys);
      document.addEventListener("mousemove", onMouseMove);
      host.addEventListener("pointerdown", onDown);
      host.addEventListener("pointerdown", onTouchDown);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointermove", onTouchMove);
      window.addEventListener("pointerup", onTouchUp);
      window.addEventListener("pointercancel", onTouchUp);
      host.addEventListener("wheel", onWheel, { passive: false });
      host.addEventListener("contextmenu", onCtx);
      document.addEventListener("pointerlockchange", onLockChange);
    },
    detach() {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlurKeys);
      document.removeEventListener("mousemove", onMouseMove);
      S.host?.removeEventListener("pointerdown", onDown);
      S.host?.removeEventListener("pointerdown", onTouchDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onTouchMove);
      window.removeEventListener("pointerup", onTouchUp);
      window.removeEventListener("pointercancel", onTouchUp);
      S.host?.removeEventListener("wheel", onWheel);
      S.host?.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("pointerlockchange", onLockChange);
      api.exitLock();
    },
    requestLock() {
      const el = S.host;
      if (!el || !el.requestPointerLock) {
        S.noLock = true;
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        let done = false;
        const fin = (ok) => {
          if (done) return;
          done = true;
          document.removeEventListener("pointerlockchange", ok1);
          document.removeEventListener("pointerlockerror", er1);
          S.noLock = !ok;
          resolve(ok);
        };
        const ok1 = () => fin(document.pointerLockElement === el);
        const er1 = () => fin(false);
        document.addEventListener("pointerlockchange", ok1);
        document.addEventListener("pointerlockerror", er1);
        try {
          const p = el.requestPointerLock();
          if (p && p.catch) p.catch(() => fin(false));
        } catch {
          fin(false);
        }
        setTimeout(() => fin(document.pointerLockElement === el), 900);
      });
    },
    exitLock() {
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    },
    setActive(on) {
      S.active = on;
      if (!on) {
        S.keys.clear();
        S.use = false;
        S.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
        S.look = { id: -1, x: 0, y: 0 };
        for (const k in S.btn) S.btn[k] = false;
      }
    },
    /** on-screen buttons (touch) */
    press(name, down) {
      if (name === "use") {
        if (down && !S.use) S.usePressed = true;
        if (!down && S.use) S.useReleased = true;
        S.use = down;
        return;
      }
      if (name in S.btn) S.btn[name] = down;
      if (!down) return;
      if (name === "jump") S.jumpPressed = true;
      if (name === "interact") S.interact = true;
      if (name === "rotate") S.rotate = true;
      if (name === "alt") S.alt = true;
    },
    /** consume this frame's intent */
    frame() {
      const K = S.keys;
      let mx = (K.has("KeyD") || K.has("ArrowRight") ? 1 : 0) - (K.has("KeyA") || K.has("ArrowLeft") ? 1 : 0);
      let my = (K.has("KeyW") || K.has("ArrowUp") ? 1 : 0) - (K.has("KeyS") || K.has("ArrowDown") ? 1 : 0);
      if (S.joy.id >= 0) {
        mx += S.joy.x;
        my -= S.joy.y;
      }
      const I = {
        mx: Math.max(-1, Math.min(1, mx)),
        my: Math.max(-1, Math.min(1, my)),
        lookX: S.lookX,
        lookY: S.lookY,
        jump: K.has("Space") || S.btn.jump,
        jumpPressed: S.jumpPressed,
        sprint: K.has("ShiftLeft") || K.has("ShiftRight") || S.btn.sprint || (S.joy.id >= 0 && Math.hypot(S.joy.x, S.joy.y) > 0.97),
        dive: K.has("KeyC") || K.has("ControlLeft") || S.btn.dive,
        use: S.use,
        usePressed: S.usePressed,
        useReleased: S.useReleased,
        alt: S.alt,
        interact: S.interact,
        rotate: S.rotate,
        slot: S.slot,
        wheel: S.wheel,
      };
      S.lookX = S.lookY = 0;
      S.usePressed = S.useReleased = S.alt = S.interact = S.rotate = S.jumpPressed = false;
      S.slot = null;
      S.wheel = 0;
      return I;
    },
  };
  return api;
}

export const EMPTY_INTENT = Object.freeze({ mx: 0, my: 0, lookX: 0, lookY: 0, jump: false, jumpPressed: false, sprint: false, dive: false, use: false, usePressed: false, useReleased: false, alt: false, interact: false, rotate: false, slot: null, wheel: 0 });
