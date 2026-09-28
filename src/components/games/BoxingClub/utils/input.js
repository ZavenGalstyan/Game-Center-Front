/**
 * Boxing Club — input controller shared by keyboard and touch.
 *
 * Held keys (move / block / body) are level-triggered; punches, dodges and
 * recovery presses are edge-triggered and consumed once per frame, so a held
 * key never auto-repeats punches and a queued press can't fire seconds later
 * (the fighter's own 140 ms buffer is the only queue).
 *
 * Keyboard: A/D or ←/→ move · J jab · K cross · L hook (U/I lead/rear hook)
 *           Space block · hold S or ↓ for body shots · Shift + direction dodge
 *           (Shift alone = slip back) · P/Esc pause · Enter skip
 */
const ATTACK_KEYS = { KeyJ: "jab", KeyK: "cross", KeyL: "hookL", KeyU: "hookL", KeyI: "hookR" };

export function createInput() {
  const held = { left: false, right: false, block: false, body: false, shift: false };
  let edges = { attack: null, dodge: null, recover: false, skip: false, pause: false };
  const touchHeld = { left: false, right: false, block: false, body: false };

  function dodgeFor(dirKey) {
    // the player faces right: left = slip back, right = slip in
    edges.dodge = dirKey === "left" ? "back" : "in";
  }

  function onKeyDown(e) {
    const t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    const c = e.code;
    let used = true;
    if (c === "KeyA" || c === "ArrowLeft") {
      if (!held.left && held.shift && !e.repeat) dodgeFor("left");
      held.left = true;
    } else if (c === "KeyD" || c === "ArrowRight") {
      if (!held.right && held.shift && !e.repeat) dodgeFor("right");
      held.right = true;
    } else if (c === "ShiftLeft" || c === "ShiftRight") {
      if (!held.shift && !e.repeat) {
        if (held.left) dodgeFor("left");
        else if (held.right) dodgeFor("right");
        else edges.dodge = "back";
      }
      held.shift = true;
    } else if (c === "Space") {
      held.block = true;
      if (!e.repeat) edges.recover = true;
    } else if (c === "KeyS" || c === "ArrowDown") {
      held.body = true;
    } else if (ATTACK_KEYS[c]) {
      if (!e.repeat) {
        edges.attack = ATTACK_KEYS[c];
        edges.recover = true;
      }
    } else if (c === "Escape" || c === "KeyP") {
      if (!e.repeat) edges.pause = true;
    } else if (c === "Enter") {
      if (!e.repeat) edges.skip = true;
    } else used = false;
    if (used) e.preventDefault();
  }

  function onKeyUp(e) {
    const c = e.code;
    if (c === "KeyA" || c === "ArrowLeft") held.left = false;
    else if (c === "KeyD" || c === "ArrowRight") held.right = false;
    else if (c === "ShiftLeft" || c === "ShiftRight") held.shift = false;
    else if (c === "Space") held.block = false;
    else if (c === "KeyS" || c === "ArrowDown") held.body = false;
  }

  function clear() {
    for (const k of Object.keys(held)) held[k] = false;
    for (const k of Object.keys(touchHeld)) touchHeld[k] = false;
    edges = { attack: null, dodge: null, recover: false, skip: false, pause: false };
  }

  const onBlur = () => clear();
  const onVis = () => {
    if (document.visibilityState !== "visible") clear();
  };

  return {
    attach() {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", onVis);
    },
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      clear();
    },
    clear,
    /** touch API */
    hold(key, v) {
      touchHeld[key] = v;
    },
    press(kind, value) {
      if (kind === "attack") {
        edges.attack = value;
        edges.recover = true;
      } else if (kind === "dodge") {
        edges.dodge = value || (touchHeld.right ? "in" : "back");
      } else if (kind === "skip") edges.skip = true;
      else if (kind === "recover") edges.recover = true;
      else if (kind === "pause") edges.pause = true;
    },
    /** This frame's input for the engine; edges are consumed. */
    frame() {
      const left = held.left || touchHeld.left;
      const right = held.right || touchHeld.right;
      const out = {
        move: (right ? 1 : 0) - (left ? 1 : 0),
        block: held.block || touchHeld.block,
        body: held.body || touchHeld.body,
        attack: edges.attack,
        dodge: edges.dodge,
        recover: edges.recover,
        skip: edges.skip,
        pause: edges.pause,
      };
      edges = { attack: null, dodge: null, recover: false, skip: false, pause: false };
      return out;
    },
  };
}
