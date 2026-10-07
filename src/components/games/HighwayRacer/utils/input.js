/**
 * Highway Racer — player input. One small object written by DOM listeners
 * and drained once per frame; the hot path never triggers a React render.
 *
 *   A / ←   lane left        D / →   lane right
 *   Space / Shift   boost    Esc / P   pause
 *
 * Every press is an EDGE (key-repeat ignored) and the queue holds at most two
 * lane steps, so mashing can't stack up a backlog of lane changes. Everything
 * is released on window blur, tab hide, pause, run end, screen change and
 * detach — no stuck LEFT / RIGHT / BOOST.
 */
const LEFT = new Set(["KeyA", "ArrowLeft"]);
const RIGHT = new Set(["KeyD", "ArrowRight"]);
const BOOST = new Set(["Space", "ShiftLeft", "ShiftRight"]);
const PAUSE = new Set(["Escape", "KeyP"]);
const MAX_QUEUE = 2;

const typing = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

export function createInput() {
  const I = {
    queue: [],
    boost: false,
    pause: false,
    enabled: true,
    handlers: null,
  };

  I.releaseAll = () => {
    I.queue.length = 0;
    I.boost = false;
    I.pause = false;
  };

  I.press = (what) => {
    if (!I.enabled) return;
    if (what === "left" || what === "right") {
      if (I.queue.length < MAX_QUEUE) I.queue.push(what === "left" ? -1 : 1);
    } else if (what === "boost") I.boost = true;
    else if (what === "pause") I.pause = true;
  };

  /** hand this frame's input to the game and clear the edges */
  I.take = () => {
    const out = { steer: I.queue.splice(0, I.queue.length), boost: I.boost, pause: I.pause };
    I.boost = false;
    I.pause = false;
    return out;
  };

  I.attach = () => {
    if (I.handlers) return;
    const down = (e) => {
      if (typing(e.target)) return;
      const c = e.code;
      const game = LEFT.has(c) || RIGHT.has(c) || BOOST.has(c) || PAUSE.has(c);
      if (!game) return;
      e.preventDefault();
      if (e.repeat) return;
      if (LEFT.has(c)) I.press("left");
      else if (RIGHT.has(c)) I.press("right");
      else if (BOOST.has(c)) I.press("boost");
      else I.press("pause");
    };
    const blur = () => I.releaseAll();
    const vis = () => {
      if (document.visibilityState !== "visible") I.releaseAll();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    I.handlers = { down, blur, vis };
  };

  I.detach = () => {
    const h = I.handlers;
    if (!h) return;
    window.removeEventListener("keydown", h.down);
    window.removeEventListener("blur", h.blur);
    document.removeEventListener("visibilitychange", h.vis);
    I.handlers = null;
    I.releaseAll();
  };

  return I;
}
