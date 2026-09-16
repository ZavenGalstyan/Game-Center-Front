/**
 * Ball Adventure 3D — input.
 *
 * A single mutable object (`live`, not React state) that the physics loop
 * reads every frame. Keyboard, on-screen joystick and the jump button all
 * write into the same object so the controller never cares which one is
 * active. `jumpQueuedAt` records the performance.now() timestamp of the last
 * jump press edge — the controller consumes it for jump buffering and clears
 * it once used.
 */
export function createInput() {
  return {
    x: 0, // -1 (left) .. 1 (right)
    z: 0, // -1 (back) .. 1 (forward)
    jumpQueuedAt: -Infinity,
    jumpHeld: false,
  };
}

export function resetInput(input) {
  input.x = 0;
  input.z = 0;
  input.jumpQueuedAt = -Infinity;
  input.jumpHeld = false;
}

const KEY_MAP = {
  KeyW: "fwd", ArrowUp: "fwd",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
};

function recompute(input, keys) {
  input.z = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0);
  input.x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
}

export function attachKeyboard(input, { onRespawn, onPause, disabled } = {}) {
  const keys = { fwd: false, back: false, left: false, right: false };

  const onKeyDown = (e) => {
    if (disabled?.()) return;
    if (e.repeat) return; // OS key-repeat must never look like a fresh press (jump spam)
    if (e.code === "Space") {
      e.preventDefault();
      input.jumpQueuedAt = performance.now();
      input.jumpHeld = true;
      return;
    }
    if (e.code === "KeyR") { onRespawn?.(); return; }
    if (e.code === "Escape") { onPause?.(); return; }
    const dir = KEY_MAP[e.code];
    if (!dir) return;
    e.preventDefault();
    keys[dir] = true;
    recompute(input, keys);
  };

  const onKeyUp = (e) => {
    if (e.code === "Space") { input.jumpHeld = false; return; }
    const dir = KEY_MAP[e.code];
    if (!dir) return;
    keys[dir] = false;
    recompute(input, keys);
  };

  const onBlur = () => {
    keys.fwd = keys.back = keys.left = keys.right = false;
    input.jumpHeld = false;
    recompute(input, keys);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}
