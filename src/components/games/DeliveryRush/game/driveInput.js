/**
 * Delivery Rush — driving input.
 *
 * One mutable object read by the physics step each frame; nothing here causes a
 * React render. Keyboard and touch both write into the same object, so a phone
 * with a Bluetooth keyboard works without a mode switch.
 *
 * Keys are read from `event.code`, not `event.key`, so WASD keeps working on
 * AZERTY and Dvorak layouts.
 */

export function createInput() {
  return {
    throttle: 0,
    steer: 0,
    handbrake: false,
    // raw sources, combined every frame
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
    /** Fold keyboard and touch into the values the physics step reads. */
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
 * Attach keyboard handlers. `hooks` receives the one-shot actions (pause,
 * camera cycle, reset) so the component can drive React state from them.
 *
 * Listeners go on `window` because the canvas is not focusable, but arrow keys
 * and space are only swallowed while the game is actually the thing on screen.
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
      case "Escape":
        hooks.onPause?.();
        break;
      case "KeyC":
        hooks.onCamera?.();
        break;
      case "KeyR":
        hooks.onResetCar?.();
        break;
      case "KeyM":
        hooks.onMute?.();
        break;
      default:
        break;
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
  return () => {
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", onBlur);
  };
}
