/**
 * Metro Rush — player input. DOM listeners push EDGES into a small queue
 * that the game drains once per frame (no React renders on the hot path).
 *
 *   ← / A  lane left     → / D  lane right
 *   ↑ / W / Space  jump  ↓ / S  slide      B / Shift  hoverboard
 *   Esc / P  pause
 *
 * Touch / pen / mouse: swipe left/right/up/down on the stage. A swipe fires
 * as soon as the finger has travelled far enough (no waiting for release),
 * one action per gesture; a double tap rides a hoverboard. Key-repeat is
 * ignored and the queue is capped so mashing can't build a backlog.
 */
const MAP = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up", Space: "up",
  ArrowDown: "down", KeyS: "down",
  KeyB: "board", ShiftLeft: "board", ShiftRight: "board",
  Escape: "pause", KeyP: "pause",
};
const MAX_QUEUE = 4;
const typing = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

export function createInput() {
  const I = { queue: [], enabled: false, handlers: null, el: null, lastTap: 0, gesture: null };

  I.press = (a) => {
    if (!I.enabled && a !== "pause") return;
    if (I.queue.length < MAX_QUEUE) I.queue.push(a);
  };
  I.take = () => I.queue.splice(0, I.queue.length);
  I.clear = () => {
    I.queue.length = 0;
    I.gesture = null;
  };

  I.attach = (el) => {
    if (I.handlers) return;
    I.el = el;
    const key = (e) => {
      if (typing(e.target)) return;
      const a = MAP[e.code];
      if (!a) return;
      // only claim keys while a run is live (menus keep normal keyboard use)
      if (!I.enabled && a !== "pause") return;
      e.preventDefault();
      if (e.repeat) return;
      I.press(a);
    };
    const down = (e) => {
      if (!I.enabled) return;
      if (e.target.closest && e.target.closest("button, a, input, [data-ui]")) return;
      I.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), fired: false };
    };
    const move = (e) => {
      const g = I.gesture;
      if (!g || g.id !== e.pointerId || g.fired) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      const r = el.getBoundingClientRect();
      const th = Math.max(18, Math.min(r.width, r.height) * 0.05);
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      g.fired = true;
      if (Math.abs(dx) > Math.abs(dy)) I.press(dx < 0 ? "left" : "right");
      else I.press(dy < 0 ? "up" : "down");
    };
    const up = (e) => {
      const g = I.gesture;
      if (!g || g.id !== e.pointerId) return;
      I.gesture = null;
      if (!g.fired && performance.now() - g.t < 260) {
        const now = performance.now();
        if (now - I.lastTap < 320) {
          I.press("board");
          I.lastTap = 0;
        } else I.lastTap = now;
      }
    };
    const cancel = () => {
      I.gesture = null;
    };
    // stop the page from scrolling / zooming while swiping on the stage
    const touchMove = (e) => {
      if (I.enabled && e.cancelable) e.preventDefault();
    };
    window.addEventListener("keydown", key);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    el.addEventListener("touchmove", touchMove, { passive: false });
    I.handlers = { key, down, move, up, cancel, touchMove };
  };

  I.detach = () => {
    const h = I.handlers;
    if (!h) return;
    window.removeEventListener("keydown", h.key);
    I.el.removeEventListener("pointerdown", h.down);
    window.removeEventListener("pointermove", h.move);
    window.removeEventListener("pointerup", h.up);
    window.removeEventListener("pointercancel", h.cancel);
    I.el.removeEventListener("touchmove", h.touchMove);
    I.handlers = null;
    I.clear();
  };
  return I;
}
