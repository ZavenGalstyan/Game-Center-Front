/**
 * Urban Skate Rush — Input handling
 *
 * Manages keyboard and touch input for skateboard control.
 */

const state = {
  // Movement
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,

  // Actions
  jump: false,
  jumpPressed: false,
  crouch: false,
  grind: false,

  // Tricks
  kickflip: false,
  heelflip: false,
  shoveIt: false,

  // Camera
  mouseX: 0,
  mouseY: 0,
  mouseDeltaX: 0,
  mouseDeltaY: 0,

  // Touch joystick
  touchMoveX: 0,
  touchMoveY: 0,

  // System
  pause: false,
  pausePressed: false,
};

let listeners = [];
let pointerLocked = false;

function handleKeyDown(e) {
  // Prevent default for game keys
  if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift", "q", "e", "r", "f", "c"].includes(e.key)) {
    e.preventDefault();
  }

  switch (e.key.toLowerCase()) {
    case "w":
    case "arrowup":
      state.forward = true;
      break;
    case "s":
    case "arrowdown":
      state.backward = true;
      break;
    case "a":
    case "arrowleft":
      state.left = true;
      break;
    case "d":
    case "arrowright":
      state.right = true;
      break;
    case " ":
      if (!state.jump) {
        state.jumpPressed = true;
      }
      state.jump = true;
      break;
    case "shift":
      state.sprint = true;
      break;
    case "c":
      state.crouch = true;
      break;
    case "f":
      state.grind = true;
      break;
    case "q":
      state.kickflip = true;
      break;
    case "e":
      state.heelflip = true;
      break;
    case "r":
      state.shoveIt = true;
      break;
    case "escape":
      if (!state.pause) {
        state.pausePressed = true;
      }
      state.pause = true;
      break;
  }
}

function handleKeyUp(e) {
  switch (e.key.toLowerCase()) {
    case "w":
    case "arrowup":
      state.forward = false;
      break;
    case "s":
    case "arrowdown":
      state.backward = false;
      break;
    case "a":
    case "arrowleft":
      state.left = false;
      break;
    case "d":
    case "arrowright":
      state.right = false;
      break;
    case " ":
      state.jump = false;
      break;
    case "shift":
      state.sprint = false;
      break;
    case "c":
      state.crouch = false;
      break;
    case "f":
      state.grind = false;
      break;
    case "q":
      state.kickflip = false;
      break;
    case "e":
      state.heelflip = false;
      break;
    case "r":
      state.shoveIt = false;
      break;
    case "escape":
      state.pause = false;
      break;
  }
}

function handleMouseMove(e) {
  if (pointerLocked) {
    state.mouseDeltaX += e.movementX || 0;
    state.mouseDeltaY += e.movementY || 0;
  }
}

function handleBlur() {
  // Reset all keys when window loses focus
  state.forward = false;
  state.backward = false;
  state.left = false;
  state.right = false;
  state.sprint = false;
  state.jump = false;
  state.crouch = false;
  state.grind = false;
  state.kickflip = false;
  state.heelflip = false;
  state.shoveIt = false;
}

function handlePointerLockChange() {
  pointerLocked = document.pointerLockElement !== null;
}

export function initInput(element) {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("pointerlockchange", handlePointerLockChange);

  listeners = [
    { target: window, type: "keydown", handler: handleKeyDown },
    { target: window, type: "keyup", handler: handleKeyUp },
    { target: window, type: "blur", handler: handleBlur },
    { target: document, type: "mousemove", handler: handleMouseMove },
    { target: document, type: "pointerlockchange", handler: handlePointerLockChange },
  ];
}

export function disposeInput() {
  for (const { target, type, handler } of listeners) {
    target.removeEventListener(type, handler);
  }
  listeners = [];
  pointerLocked = false;
}

export function requestPointerLock(element) {
  if (element && element.requestPointerLock) {
    element.requestPointerLock();
  }
}

export function exitPointerLock() {
  if (document.exitPointerLock) {
    document.exitPointerLock();
  }
}

export function isPointerLocked() {
  return pointerLocked;
}

export function getInput() {
  // Calculate movement vector
  let mx = 0;
  let mz = 0;

  if (state.forward) mz += 1;
  if (state.backward) mz -= 1;
  if (state.left) mx -= 1;
  if (state.right) mx += 1;

  // Add touch input
  mx += state.touchMoveX;
  mz += state.touchMoveY;

  // Normalize
  const mag = Math.hypot(mx, mz);
  if (mag > 1) {
    mx /= mag;
    mz /= mag;
  }

  return {
    mx,
    mz,
    mag: Math.min(mag, 1),
    sprint: state.sprint,
    jumpPressed: state.jumpPressed,
    jumpHeld: state.jump,
    crouch: state.crouch,
    grind: state.grind,
    kickflip: state.kickflip,
    heelflip: state.heelflip,
    shoveIt: state.shoveIt,
    pausePressed: state.pausePressed,
    mouseDeltaX: state.mouseDeltaX,
    mouseDeltaY: state.mouseDeltaY,
  };
}

export function consumeInput() {
  // Reset pressed states (one-shot triggers)
  state.jumpPressed = false;
  state.pausePressed = false;
  state.kickflip = false;
  state.heelflip = false;
  state.shoveIt = false;

  // Reset mouse deltas
  state.mouseDeltaX = 0;
  state.mouseDeltaY = 0;
}

export function setTouchMove(x, y) {
  state.touchMoveX = x;
  state.touchMoveY = y;
}

export function setTouchJump(pressed) {
  if (pressed && !state.jump) {
    state.jumpPressed = true;
  }
  state.jump = pressed;
}

export function setTouchTrick(trick) {
  state[trick] = true;
}
