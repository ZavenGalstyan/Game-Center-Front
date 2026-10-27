/**
 * Iron Arena — device input.
 *
 * Desktop: WASD / arrows drive, mouse aims (pointer lock; if the browser
 * refuses the lock, plain mouse movement over the stage still turns the
 * camera), left button fires, right button scopes (hold or toggle), wheel
 * zooms, Space / E fires the special ability, Tab shows the scoreboard,
 * C re-centres the camera behind the hull. Esc releases the lock → pause.
 *
 * Touch: left half = floating drive joystick; right half = drag to aim
 * (each finger tracked by pointerId, so driving + aiming + firing work at
 * the same time); on-screen Fire / Ability / Scope buttons call press().
 */
export function createInput() {
  const S = {
    keys: new Set(),
    fire: false,
    scope: false,
    scopeToggle: false,
    toggleScope: false,
    lookX: 0,
    lookY: 0,
    wheel: 0,
    ability: false,
    recenter: false,
    board: false,
    locked: false,
    sens: 1,
    touchSens: 1,
    invert: false,
    joy: { id: -1, ox: 0, oy: 0, x: 0, y: 0, active: false },
    look: { id: -1, x: 0, y: 0 },
    tFire: false,
    tScope: false,
    onPause: null,
    onBoard: null,
    noLock: false,
    host: null,
  };
  const DRIVE = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };

  const onKey = (e, down) => {
    const c = e.code;
    if (!S.host || !S.host.isConnected) return;
    // don't steal keys from text inputs / menus
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA")) return;
    if (!S.active) {
      if (down && c === "Escape") S.onEscape?.();
      return;
    }
    if (DRIVE[c] || c === "Space" || c === "Tab" || c === "KeyE" || c === "KeyQ") e.preventDefault();
    if (down) S.keys.add(c);
    else S.keys.delete(c);
    if (down && !e.repeat) {
      if (c === "Space" || c === "KeyE") S.ability = true;
      if (c === "KeyC") S.recenter = true;
      if (c === "KeyF") S.onFullscreen?.();
      if (c === "ShiftLeft" || c === "ShiftRight") {
        if (S.toggleScope) S.scopeToggle = !S.scopeToggle;
      }
      if (c === "Escape" || c === "KeyP") S.onPause?.("menu");
    }
    if (c === "Tab") {
      S.board = down;
      S.onBoard?.(down);
    }
  };
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);

  const onMouseMove = (e) => {
    if (!S.active) return;
    if (!S.locked && !S.noLock) return;
    const k = 0.0022 * S.sens;
    S.lookX += (e.movementX || 0) * k;
    S.lookY += (e.movementY || 0) * k * (S.invert ? -1 : 1);
  };
  const onMouseDown = (e) => {
    if (!S.active || e.pointerType === "touch") return;
    if (e.button === 0) S.fire = true;
    if (e.button === 2) {
      if (S.toggleScope) S.scopeToggle = !S.scopeToggle;
      else S.scope = true;
    }
  };
  const onMouseUp = (e) => {
    if (e.button === 0) S.fire = false;
    if (e.button === 2) S.scope = false;
  };
  const onWheel = (e) => {
    if (!S.active) return;
    e.preventDefault();
    S.wheel += Math.sign(e.deltaY);
  };
  const onCtx = (e) => e.preventDefault();
  const onLockChange = () => {
    const was = S.locked;
    S.locked = document.pointerLockElement === S.host || document.pointerLockElement === S.host?.querySelector("canvas");
    if (was && !S.locked) {
      S.fire = false;
      S.scope = false;
      S.onPause?.("lock");
    }
  };

  /* ---------------- touch (pointer events with pointerType touch) */
  const rectOf = () => S.host.getBoundingClientRect();
  const onTouchDown = (e) => {
    if (!S.active || e.pointerType !== "touch") return;
    if (e.target.closest && e.target.closest("[data-touch-btn]")) return;
    const r = rectOf();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < r.width * 0.42 && S.joy.id < 0) {
      S.joy = { id: e.pointerId, ox: x, oy: y, x: 0, y: 0, active: true };
    } else if (S.look.id < 0) {
      S.look = { id: e.pointerId, x, y };
    }
    e.preventDefault();
  };
  const onTouchMove = (e) => {
    if (e.pointerType !== "touch") return;
    const r = rectOf();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (e.pointerId === S.joy.id) {
      const R = Math.min(r.width, r.height) * 0.13;
      let dx = (x - S.joy.ox) / R;
      let dy = (y - S.joy.oy) / R;
      const L = Math.hypot(dx, dy);
      if (L > 1) {
        // drag the base along so the stick never "sticks" at the rim
        S.joy.ox += ((dx / L) * (L - 1)) * R;
        S.joy.oy += ((dy / L) * (L - 1)) * R;
        dx /= L;
        dy /= L;
      }
      S.joy.x = dx;
      S.joy.y = dy;
    } else if (e.pointerId === S.look.id) {
      const k = 0.0055 * S.touchSens;
      S.lookX += (x - S.look.x) * k;
      S.lookY += (y - S.look.y) * k * (S.invert ? -1 : 1);
      S.look.x = x;
      S.look.y = y;
    }
  };
  const onTouchUp = (e) => {
    if (e.pointerType !== "touch") return;
    if (e.pointerId === S.joy.id) S.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0, active: false };
    if (e.pointerId === S.look.id) S.look = { id: -1, x: 0, y: 0 };
  };

  const api = {
    S,
    attach(host) {
      S.host = host;
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      document.addEventListener("mousemove", onMouseMove);
      host.addEventListener("pointerdown", onMouseDown);
      window.addEventListener("pointerup", onMouseUp);
      host.addEventListener("wheel", onWheel, { passive: false });
      host.addEventListener("contextmenu", onCtx);
      host.addEventListener("pointerdown", onTouchDown);
      window.addEventListener("pointermove", onTouchMove);
      window.addEventListener("pointerup", onTouchUp);
      window.addEventListener("pointercancel", onTouchUp);
      document.addEventListener("pointerlockchange", onLockChange);
    },
    detach() {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", onMouseMove);
      S.host?.removeEventListener("pointerdown", onMouseDown);
      window.removeEventListener("pointerup", onMouseUp);
      S.host?.removeEventListener("wheel", onWheel);
      S.host?.removeEventListener("contextmenu", onCtx);
      S.host?.removeEventListener("pointerdown", onTouchDown);
      window.removeEventListener("pointermove", onTouchMove);
      window.removeEventListener("pointerup", onTouchUp);
      window.removeEventListener("pointercancel", onTouchUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      api.exitLock();
    },
    /** resolves true when the pointer is locked (or the lock isn't needed) */
    requestLock() {
      const el = S.host;
      if (!el || !el.requestPointerLock) {
        S.noLock = true;
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        let done = false;
        const finish = (ok) => {
          if (done) return;
          done = true;
          document.removeEventListener("pointerlockchange", ok1);
          document.removeEventListener("pointerlockerror", err1);
          if (!ok) S.noLock = true; // fall back to plain mouse movement
          resolve(true);
        };
        const ok1 = () => finish(document.pointerLockElement === el);
        const err1 = () => finish(false);
        document.addEventListener("pointerlockchange", ok1);
        document.addEventListener("pointerlockerror", err1);
        try {
          const p = el.requestPointerLock();
          if (p && p.catch) p.catch(() => finish(false));
        } catch {
          finish(false);
        }
        setTimeout(() => finish(document.pointerLockElement === el), 700);
      });
    },
    exitLock() {
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      S.locked = false;
    },
    setActive(on) {
      S.active = on;
      if (!on) api.releaseAll();
    },
    drive() {
      let thr = 0;
      let st = 0;
      for (const k of S.keys) {
        const d = DRIVE[k];
        if (!d) continue;
        thr += d[0];
        st += d[1];
      }
      if (S.joy.active) {
        const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
        thr += -dz(S.joy.y);
        st += dz(S.joy.x);
      }
      return { throttle: Math.max(-1, Math.min(1, thr)), steer: Math.max(-1, Math.min(1, st)) };
    },
    fireHeld: () => S.fire || S.tFire,
    scopeHeld: () => S.scope || S.scopeToggle || S.tScope,
    takeLook() {
      const r = [S.lookX, S.lookY];
      S.lookX = 0;
      S.lookY = 0;
      return r;
    },
    takeWheel() {
      const w = S.wheel;
      S.wheel = 0;
      return w;
    },
    takeAbility() {
      const a = S.ability;
      S.ability = false;
      return a;
    },
    takeRecenter() {
      const a = S.recenter;
      S.recenter = false;
      return a;
    },
    /** on-screen touch buttons */
    press(btn, down) {
      if (btn === "fire") S.tFire = down;
      else if (btn === "ability" && down) S.ability = true;
      else if (btn === "scope" && down) S.tScope = !S.tScope;
    },
    releaseAll() {
      S.keys.clear();
      S.fire = false;
      S.scope = false;
      S.tFire = false;
      S.joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0, active: false };
      S.look = { id: -1, x: 0, y: 0 };
      S.lookX = 0;
      S.lookY = 0;
      S.ability = false;
      S.board = false;
    },
  };
  return api;
}
