/**
 * Last Hope — input. Keyboard + mouse (screen-relative WASD, mouse aim,
 * LMB attack, wheel zoom) and touch (dynamic virtual joystick on the left
 * half, HUD buttons write into S). frame() turns it into the sim intent; edge
 * presses (interact, quick slots) fire once.
 */
import { CAM_YAW } from "./render/world.js";

const UP = [-Math.sin(CAM_YAW), -Math.cos(CAM_YAW)];
const RIGHT = [Math.cos(CAM_YAW), -Math.sin(CAM_YAW)];

export function createInput() {
  const S = {
    keys: new Set(),
    mouse: { x: 0, y: 0, in: false, down: false, moved: false },
    joy: { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false },
    touch: false,
    attackHeld: false,
    sprintToggle: false,
    interactQ: false,
    quickQ: -1,
    zoom: 18,
    active: false,
    overlay: false,
    buildMode: false,
    // callbacks (set by the shell)
    onKey: null,
    onPlace: null,
    onRotate: null,
    onCancel: null,
  };
  let host = null;
  let world = null;

  const isTyping = (e) => {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  };
  const kd = (e) => {
    if (isTyping(e)) return;
    const c = e.code;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(c) && S.active) e.preventDefault();
    if (e.repeat) {
      if (S.keys.has(c)) return;
    }
    S.keys.add(c);
    if (!S.active) return;
    const handled = S.onKey?.(c, e);
    if (handled) {
      e.preventDefault();
      return;
    }
    if (S.overlay) return;
    if (c === "KeyE" || c === "KeyF") S.interactQ = true;
    else if (/^Digit[1-5]$/.test(c)) S.quickQ = +c.slice(5) - 1;
  };
  const ku = (e) => {
    S.keys.delete(e.code);
  };
  const blur = () => {
    S.keys.clear();
    S.mouse.down = false;
    S.attackHeld = false;
    S.joy.active = false;
    S.joy.id = null;
  };
  const md = (e) => {
    if (e.pointerType === "touch") return;
    if (!S.active || S.overlay) return;
    if (e.target.closest?.("[data-ui]")) return;
    if (e.button === 0) {
      if (S.buildMode) S.onPlace?.();
      else S.mouse.down = true;
    } else if (e.button === 2) {
      if (S.buildMode) S.onRotate?.();
    }
  };
  const mu = (e) => {
    if (e.pointerType === "touch") return;
    if (e.button === 0) S.mouse.down = false;
  };
  const mm = (e) => {
    if (e.pointerType === "touch") return;
    S.mouse.x = e.clientX;
    S.mouse.y = e.clientY;
    S.mouse.in = true;
    S.mouse.moved = true;
  };
  const ml = () => {
    S.mouse.in = false;
  };
  const wheel = (e) => {
    if (!S.active || S.overlay) return;
    S.zoom = Math.max(12, Math.min(30, S.zoom + Math.sign(e.deltaY) * 1.5));
  };
  const ctx = (e) => {
    if (S.active) e.preventDefault();
  };
  // ---------------------------------------------------------------- touch joystick
  const ts = (e) => {
    if (!S.active || S.overlay) return;
    for (const t of e.changedTouches) {
      if (t.target.closest?.("[data-ui]")) continue;
      const r = host.getBoundingClientRect();
      const lx = t.clientX - r.left;
      if (lx < r.width * 0.5 && S.joy.id == null) {
        S.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0, active: true };
      } else if (S.buildMode) {
        S.mouse.x = t.clientX;
        S.mouse.y = t.clientY;
        S.mouse.in = true;
      }
    }
  };
  const tm = (e) => {
    for (const t of e.changedTouches)
      if (t.identifier === S.joy.id) {
        const R = 56;
        let dx = (t.clientX - S.joy.ox) / R;
        let dy = (t.clientY - S.joy.oy) / R;
        const l = Math.hypot(dx, dy);
        if (l > 1) {
          dx /= l;
          dy /= l;
          // drag the origin so direction changes stay responsive
          S.joy.ox = t.clientX - dx * R;
          S.joy.oy = t.clientY - dy * R;
        }
        S.joy.x = dx;
        S.joy.y = dy;
      }
  };
  const te = (e) => {
    for (const t of e.changedTouches)
      if (t.identifier === S.joy.id) {
        S.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
      }
  };

  return {
    S,
    attach(h, w) {
      host = h;
      world = w;
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      window.addEventListener("blur", blur);
      h.addEventListener("pointerdown", md);
      window.addEventListener("pointerup", mu);
      window.addEventListener("pointermove", mm);
      h.addEventListener("pointerleave", ml);
      h.addEventListener("wheel", wheel, { passive: true });
      h.addEventListener("contextmenu", ctx);
      h.addEventListener("touchstart", ts, { passive: true });
      h.addEventListener("touchmove", tm, { passive: true });
      h.addEventListener("touchend", te);
      h.addEventListener("touchcancel", te);
    },
    detach() {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerup", mu);
      window.removeEventListener("pointermove", mm);
      if (host) {
        host.removeEventListener("pointerdown", md);
        host.removeEventListener("pointerleave", ml);
        host.removeEventListener("wheel", wheel);
        host.removeEventListener("contextmenu", ctx);
        host.removeEventListener("touchstart", ts);
        host.removeEventListener("touchmove", tm);
        host.removeEventListener("touchend", te);
        host.removeEventListener("touchcancel", te);
      }
    },
    setWorld(w) {
      world = w;
    },
    /** Aim point on the ground under the cursor (desktop), or null. */
    aimPoint() {
      if (S.touch || !S.mouse.in || !world) return null;
      return world.screenToGround(S.mouse.x, S.mouse.y);
    },
    cursorGround() {
      if (!world || !S.mouse.in) return null;
      return world.screenToGround(S.mouse.x, S.mouse.y, 0);
    },
    frame() {
      const k = S.keys;
      let ix = 0;
      let iy = 0;
      if (k.has("KeyW") || k.has("ArrowUp")) iy += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) iy -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) ix += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) ix -= 1;
      if (S.joy.active) {
        ix += S.joy.x;
        iy -= S.joy.y;
      }
      const l = Math.hypot(ix, iy);
      if (l > 1) {
        ix /= l;
        iy /= l;
      }
      const mx = RIGHT[0] * ix + UP[0] * iy;
      const mz = RIGHT[1] * ix + UP[1] * iy;
      const out = {
        mx,
        mz,
        sprint: k.has("ShiftLeft") || k.has("ShiftRight") || S.sprintToggle,
        aim: S.buildMode ? null : this.aimPoint(),
        attack: !S.buildMode && !S.overlay && (S.mouse.down || S.attackHeld || k.has("Space")),
        interact: S.interactQ,
        quick: S.quickQ,
        touch: S.touch,
      };
      S.interactQ = false;
      S.quickQ = -1;
      return out;
    },
    setActive(v) {
      S.active = v;
      if (!v) blur();
    },
  };
}
