/**
 * Strike Force — device input → the player's combatant input.
 *
 * Desktop: pointer-locked mouse look, WASD, Shift sprint, C / Ctrl crouch,
 * Space jump, R reload, 1 / 2 / Q / wheel switch, F pick up, I inspect,
 * left mouse fire, right mouse aim (hold or toggle), Tab scoreboard.
 * Touch: floating move stick (pushing it fully forward sprints), drag
 * anywhere on the right to look, on-screen buttons (handled by the touch
 * UI through press()/release()). Every touch is tracked by pointerId so
 * moving, looking and firing work at the same time.
 *
 * Look angles live here and are written to the combatant every sim step,
 * so the camera can use the newest value between steps.
 */
const BASE_SENS = 0.0021; // radians per pixel at sensitivity 1

export function createInput() {
  const keys = new Set();
  const btn = { fire: false, ads: false, sprint: false, crouch: false, jump: false, reload: false, interact: false, scores: false };
  const touch = { mx: 0, mz: 0, active: false, sprint: false };
  const S = {
    enabled: false,
    locked: false,
    yaw: 0,
    pitch: 0,
    sens: 1,
    adsSens: 0.8,
    touchSens: 1,
    invert: false,
    toggleAds: false,
    toggleCrouch: false,
    adsLatched: false,
    crouchLatched: false,
    swap: null,
    inspect: false,
    lookDX: 0,
    lookDY: 0,
    adsFactor: 1,
    onPause: null,
    onScores: null,
    host: null,
  };

  const look = (dx, dy, k = 1) => {
    const s = BASE_SENS * S.sens * k * S.adsFactor;
    S.yaw -= dx * s;
    S.pitch -= dy * s * (S.invert ? -1 : 1);
    S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch));
    S.lookDX += dx * s;
    S.lookDY += dy * s;
  };

  /* ------------------------------------------------------------ keyboard */
  const onKey = (e, down) => {
    if (!S.enabled) return;
    const c = e.code;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "KeyC", "KeyR", "KeyF", "KeyQ", "Digit1", "Digit2", "Tab", "KeyI", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) e.preventDefault();
    if (down) {
      if (e.repeat) return;
      keys.add(c);
      if (c === "KeyC") S.crouchLatched = !S.crouchLatched;
      if (c === "Digit1") S.swap = 0;
      if (c === "Digit2") S.swap = 1;
      if (c === "KeyQ") S.swap = "next";
      if (c === "KeyI") S.inspect = true;
      if (c === "Tab") S.onScores?.(true);
    } else {
      keys.delete(c);
      if (c === "Tab") S.onScores?.(false);
    }
  };
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);

  /* ------------------------------------------------------------ mouse */
  const onMove = (e) => {
    if (!S.enabled || !S.locked) return;
    // ignore the occasional giant jump some browsers emit on lock
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    look(e.movementX, e.movementY);
  };
  // mousedown / mouseup (not pointer events): a pointer only gets pointerdown for
  // its first button, so left-click while holding right (ADS) never fired
  const isTouchCompat = (e) => e.sourceCapabilities?.firesTouchEvents;
  const onDown = (e) => {
    if (!S.enabled || !S.locked || isTouchCompat(e)) return;
    if (e.button === 0) btn.fire = true;
    if (e.button === 2) {
      if (S.toggleAds) S.adsLatched = !S.adsLatched;
      else btn.ads = true;
    }
  };
  const onUp = (e) => {
    if (isTouchCompat(e)) return;
    if (e.button === 0) btn.fire = false;
    if (e.button === 2 && !S.toggleAds) btn.ads = false;
  };
  const onWheel = (e) => {
    if (!S.enabled || !S.locked) return;
    e.preventDefault();
    S.swap = "next";
  };
  const onCtx = (e) => {
    if (S.enabled) e.preventDefault();
  };
  const onLockChange = () => {
    const was = S.locked;
    S.locked = document.pointerLockElement === S.host;
    if (was && !S.locked) {
      releaseAll();
      if (S.enabled) S.onPause?.("unlock");
    }
  };
  const onBlur = () => releaseAll();

  function releaseAll() {
    keys.clear();
    btn.fire = btn.ads = btn.sprint = btn.jump = btn.reload = btn.interact = false;
    touch.mx = touch.mz = 0;
    touch.active = false;
    touch.sprint = false;
  }

  /* ------------------------------------------------------------ touch look / stick */
  const pointers = new Map(); // id → { role, x0, y0, x, y }
  let stickEl = null;
  let knobEl = null;
  function onTouchDown(e) {
    if (!S.enabled || e.pointerType !== "touch") return;
    if (e.target.closest && e.target.closest("[data-touch-btn]")) return; // buttons handle themselves
    const rect = S.host.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const left = x < rect.width * 0.42;
    pointers.set(e.pointerId, { role: left ? "stick" : "look", x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
    if (left) {
      touch.active = true;
      showStick(e.clientX - rect.left, e.clientY - rect.top);
    }
    e.preventDefault();
  }
  function onTouchMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (p.role === "look" || p.role === "fireLook") look(dx * 1.9, dy * 1.9, S.touchSens);
    else if (p.role === "stick") {
      const R = 54;
      let sx = (p.x - p.x0) / R;
      let sy = (p.y - p.y0) / R;
      const l = Math.hypot(sx, sy);
      if (l > 1) {
        // drag the stick origin along so it never feels stuck
        if (l > 1.6) {
          p.x0 += (sx / l) * (l - 1.6) * R;
          p.y0 += (sy / l) * (l - 1.6) * R;
          moveStickBase(p.x0, p.y0);
        }
        sx /= l;
        sy /= l;
      }
      touch.mx = sx;
      touch.mz = -sy;
      touch.sprint = -sy > 0.92 && l > 1.25;
      moveKnob(sx, sy);
    }
    e.preventDefault();
  }
  function onTouchUp(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.role === "stick") {
      touch.mx = touch.mz = 0;
      touch.active = false;
      touch.sprint = false;
      hideStick();
    }
    if (p.role === "fireLook") btn.fire = false;
  }
  const showStick = (x, y) => {
    if (!stickEl) return;
    stickEl.style.display = "block";
    stickEl.style.left = x + "px";
    stickEl.style.top = y + "px";
    moveKnob(0, 0);
  };
  const moveStickBase = (cx, cy) => {
    if (!stickEl) return;
    const rect = S.host.getBoundingClientRect();
    stickEl.style.left = cx - rect.left + "px";
    stickEl.style.top = cy - rect.top + "px";
  };
  const moveKnob = (x, y) => {
    if (knobEl) knobEl.style.transform = `translate(${x * 42}px, ${y * 42}px)`;
  };
  const hideStick = () => {
    if (stickEl) stickEl.style.display = "none";
  };

  /** touch buttons: the fire button also looks while held (drag-to-aim) */
  function press(name, e) {
    if (name === "fire") {
      btn.fire = true;
      if (e && e.pointerId !== undefined) pointers.set(e.pointerId, { role: "fireLook", x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
    } else if (name === "ads") S.adsLatched = !S.adsLatched;
    else if (name === "crouch") S.crouchLatched = !S.crouchLatched;
    else if (name === "swap") S.swap = "next";
    else if (name === "sprint") touch.sprintLatch = !touch.sprintLatch;
    else btn[name] = true;
  }
  function release(name) {
    if (name === "fire") btn.fire = false;
    else if (name === "ads" || name === "crouch" || name === "swap" || name === "sprint") return;
    else btn[name] = false;
  }

  /* ------------------------------------------------------------ attach */
  function attach(host) {
    S.host = host;
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    document.addEventListener("mousemove", onMove);
    host.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("contextmenu", onCtx);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("blur", onBlur);
    host.addEventListener("pointerdown", onTouchDown, { passive: false });
    window.addEventListener("pointermove", onTouchMove, { passive: false });
    window.addEventListener("pointerup", onTouchUp);
    window.addEventListener("pointercancel", onTouchUp);
  }
  function detach() {
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    document.removeEventListener("mousemove", onMove);
    S.host?.removeEventListener("mousedown", onDown);
    window.removeEventListener("mouseup", onUp);
    S.host?.removeEventListener("wheel", onWheel);
    S.host?.removeEventListener("contextmenu", onCtx);
    document.removeEventListener("pointerlockchange", onLockChange);
    window.removeEventListener("blur", onBlur);
    S.host?.removeEventListener("pointerdown", onTouchDown);
    window.removeEventListener("pointermove", onTouchMove);
    window.removeEventListener("pointerup", onTouchUp);
    window.removeEventListener("pointercancel", onTouchUp);
    if (document.pointerLockElement === S.host) document.exitPointerLock?.();
  }

  function requestLock() {
    if (!S.host || S.locked) return Promise.resolve(true);
    try {
      const r = S.host.requestPointerLock?.({ unadjustedMovement: true });
      if (r && r.catch)
        return r.then(
          () => true,
          () =>
            // unadjustedMovement isn't supported everywhere — retry plain
            Promise.resolve(S.host.requestPointerLock?.()).then(
              () => true,
              () => false,
            ),
        );
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }
  function exitLock() {
    if (document.pointerLockElement === S.host) document.exitPointerLock?.();
  }

  /** write this step's controls into a combatant input (called per sim step) */
  function apply(inp, player) {
    const k = (c) => keys.has(c);
    let mx = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
    let mz = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0);
    if (touch.active || touch.mx || touch.mz) {
      mx = touch.mx;
      mz = touch.mz;
    }
    inp.mx = mx;
    inp.mz = mz;
    inp.yaw = S.yaw;
    inp.pitch = S.pitch;
    inp.fire = btn.fire;
    inp.ads = btn.ads || S.adsLatched;
    // pulling the trigger always drops a sprint (mobile auto-sprint included)
    inp.sprint = (k("ShiftLeft") || k("ShiftRight") || touch.sprint || !!touch.sprintLatch) && !btn.fire;
    if (inp.sprint && S.adsLatched && mz > 0.5) S.adsLatched = false; // sprinting drops toggled ADS
    if (inp.sprint && S.crouchLatched && mz > 0.5) S.crouchLatched = false;
    inp.crouch = k("ControlLeft") || S.crouchLatched;
    inp.jump = k("Space") || btn.jump;
    inp.reload = k("KeyR") || btn.reload;
    inp.interact = k("KeyF") || btn.interact;
    inp.respawn = btn.fire || k("Space");
    if (S.swap !== null && player) {
      inp.swap = S.swap === "next" ? (player.cur + 1) % player.weapons.length : S.swap;
      S.swap = null;
    }
    if (touch.sprintLatch && Math.abs(mz) < 0.2) touch.sprintLatch = false;
  }
  /** look deltas since the last call (for weapon sway) */
  function takeLookDelta() {
    const d = [S.lookDX, S.lookDY];
    S.lookDX = 0;
    S.lookDY = 0;
    return d;
  }
  function takeInspect() {
    const v = S.inspect;
    S.inspect = false;
    return v;
  }
  function setStick(el, knob) {
    stickEl = el;
    knobEl = knob;
  }
  function setView(yaw, pitch) {
    S.yaw = yaw;
    S.pitch = pitch;
  }

  return { S, btn, touch, attach, detach, requestLock, exitLock, apply, takeLookDelta, takeInspect, press, release, releaseAll, setStick, setView, look };
}
