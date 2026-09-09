/**
 * Parking Master — driving input.
 *
 * One mutable object read by the physics step each frame; writing to it never
 * triggers a React render. Keyboard and touch both feed the same object, so a
 * tablet with a keyboard works with no mode switch.
 *
 * Keys are read from `event.code` so WASD keeps working on AZERTY / Dvorak.
 */

export function createInput() {
  return {
    throttle: 0, // -1..1  (forward / reverse-brake)
    steer: 0, // -1..1  (left / right)
    handbrake: false,
    keys: { up: false, down: false, left: false, right: false, space: false },
    touch: { throttle: 0, steer: 0, handbrake: false },
    reset() {
      this.throttle = 0;
      this.steer = 0;
      this.handbrake = false;
      this.keys.up = this.keys.down = this.keys.left = this.keys.right = this.keys.space = false;
      this.touch.throttle = 0;
      this.touch.steer = 0;
      this.touch.handbrake = false;
    },
    commit() {
      const k = this.keys;
      const kt = (k.up ? 1 : 0) - (k.down ? 1 : 0);
      const ks = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      this.throttle = kt !== 0 ? kt : this.touch.throttle;
      this.steer = ks !== 0 ? ks : this.touch.steer;
      this.handbrake = k.space || this.touch.handbrake;
    },
  };
}

const CODES = {
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  Space: "space",
};

/**
 * Attach keyboard listeners. `hooks` receives the one-shot actions (pause,
 * camera cycle, restart) so the component can drive React state from them.
 * Listeners live on `window` because the canvas is not focusable; arrow keys
 * and space are only swallowed while gameplay is the thing on screen.
 */
export function attachKeyboard(input, hooks = {}) {
  const onDown = (e) => {
    if (e.repeat) {
      if (CODES[e.code]) e.preventDefault();
      return;
    }
    const slot = CODES[e.code];
    if (slot) {
      input.keys[slot] = true;
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case "Escape": hooks.onPause?.(); break;
      case "KeyC": hooks.onCamera?.(); break;
      case "KeyR": hooks.onRestart?.(); break;
      case "KeyM": hooks.onMute?.(); break;
      default: break;
    }
  };
  const onUp = (e) => {
    const slot = CODES[e.code];
    if (slot) {
      input.keys[slot] = false;
      e.preventDefault();
    }
  };
  const onBlur = () => input.reset();

  window.addEventListener("keydown", onDown, { passive: false });
  window.addEventListener("keyup", onUp, { passive: false });
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onBlur);
  return () => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onBlur);
  };
}
