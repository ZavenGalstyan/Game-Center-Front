/**
 * Farm Life — keyboard movement + scroll-to-zoom input.
 *
 * Top-down 2D: the camera always faces straight down and never rotates, so
 * there's no drag-to-look — only scroll-to-zoom. The cursor stays free at
 * all times for hotbar clicks, inventory drag-and-drop and shop panels
 * while the world is live behind them. Movement keys read from `window`
 * like Parking Master's input.js so the canvas needn't be focused.
 */
const MOVE_CODES = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  ShiftLeft: "sprint", ShiftRight: "sprint",
};

const DIGIT_CODES = {
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
  Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8,
};

export function createInput() {
  return {
    forward: false, back: false, left: false, right: false, sprint: false,
    wheelDelta: 0,
    reset() {
      this.forward = this.back = this.left = this.right = this.sprint = false;
    },
    consumeWheel() {
      const w = this.wheelDelta;
      this.wheelDelta = 0;
      return w;
    },
  };
}

/**
 * `hooks`: onInteract(), onInventoryToggle(), onHotbarSelect(index), onPause()
 */
export function attachControls(el, input, hooks = {}) {
  const onKeyDown = (e) => {
    if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    switch (e.code) {
      case "KeyE":
      case "KeyF":
        hooks.onInteract?.();
        e.preventDefault();
        return;
      case "KeyI":
        hooks.onInventoryToggle?.();
        e.preventDefault();
        return;
      case "Escape":
        hooks.onPause?.();
        return;
      default:
        break;
    }
    if (e.code in DIGIT_CODES) {
      hooks.onHotbarSelect?.(DIGIT_CODES[e.code]);
      return;
    }
    const slot = MOVE_CODES[e.code];
    if (slot) {
      input[slot] = true;
      e.preventDefault();
    }
  };

  const onKeyUp = (e) => {
    const slot = MOVE_CODES[e.code];
    if (slot) input[slot] = false;
  };

  const onWheel = (e) => {
    if (e.target.tagName !== "CANVAS") return;
    input.wheelDelta += e.deltaY;
    e.preventDefault();
  };

  const onBlurOrHide = () => input.reset();

  el.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlurOrHide);
  document.addEventListener("visibilitychange", onBlurOrHide);

  return function dispose() {
    el.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlurOrHide);
    document.removeEventListener("visibilitychange", onBlurOrHide);
  };
}
