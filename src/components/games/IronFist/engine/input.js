/**
 * One-keyboard input for two simultaneous players.
 *
 *  • Keys are tracked by `KeyboardEvent.code` (layout-independent) in a held
 *    map per player; buttons are LATCHED on keydown so a tap shorter than one
 *    sim step still registers, and auto-repeat keydowns are ignored.
 *  • `read(side)` returns that side's input frame and clears its latches.
 *  • Arcade: player 1 also accepts the player-2 keys (one human, either hand
 *    layout). Local VS: each map drives only its own fighter.
 *  • Window blur / tab hide releases everything (no stuck "held" keys).
 *  • Game keys (incl. arrows / space) call preventDefault while enabled, so the
 *    page never scrolls; listeners are removed on detach().
 *
 * Key groups were picked far apart (WASD+FGHR · arrows+JKLO) to dodge the
 * most common keyboard-ghosting clusters; Shift keys are extra dodge keys.
 */
export const P1_KEYS = { KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down", KeyF: "punch", KeyG: "kick", KeyH: "special", KeyR: "dodge", ShiftLeft: "dodge" };
export const P2_KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", KeyJ: "punch", KeyK: "kick", KeyL: "special", KeyO: "dodge", ShiftRight: "dodge" };
const DIRS = ["left", "right", "up", "down"];
const BTNS = ["punch", "kick", "special", "dodge", "jump"];
const SWALLOW = new Set(["Space", "PageUp", "PageDown", "Home", "End"]);

/** Typing in a text field (e.g. the page's comment box) never drives a fighter. */
export const isEditable = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));

const blank = () => ({ held: { left: false, right: false, up: false, down: false }, latch: { punch: false, kick: false, special: false, dodge: false, jump: false }, keys: new Set() });

export function createKeyboard({ target = typeof window !== "undefined" ? window : null, onPause = null } = {}) {
  const P = [blank(), blank()];
  let mode = "vs"; // 'vs' | 'arcade'
  let enabled = true;
  let attached = false;

  const route = (code) => {
    if (P1_KEYS[code]) return [0, P1_KEYS[code]];
    if (P2_KEYS[code]) return [mode === "arcade" ? 0 : 1, P2_KEYS[code]];
    return null;
  };
  const refreshHeld = (p) => {
    for (const d of DIRS) p.held[d] = false;
    for (const code of p.keys) {
      const a = P1_KEYS[code] || P2_KEYS[code];
      if (DIRS.includes(a)) p.held[a] = true;
    }
  };

  function onDown(e) {
    if (!enabled || isEditable(e.target)) return;
    if (e.code === "Escape" || e.code === "KeyP") {
      if (!e.repeat) onPause?.();
      e.preventDefault();
      return;
    }
    const r = route(e.code);
    if (!r && !SWALLOW.has(e.code)) return;
    e.preventDefault();
    if (!r) return;
    const [side, action] = r;
    const p = P[side];
    p.keys.add(e.code);
    refreshHeld(p);
    if (e.repeat) return;
    if (action === "up") p.latch.jump = true;
    else if (BTNS.includes(action)) p.latch[action] = true;
  }
  function onUp(e) {
    const r = route(e.code);
    if (!r) return;
    if (enabled) e.preventDefault();
    for (const p of P) p.keys.delete(e.code);
    for (const p of P) refreshHeld(p);
  }
  function clear() {
    for (let i = 0; i < 2; i++) P[i] = blank();
  }
  const onVis = () => document.hidden && clear();

  return {
    attach() {
      if (attached || !target) return;
      attached = true;
      target.addEventListener("keydown", onDown, { passive: false });
      target.addEventListener("keyup", onUp, { passive: false });
      target.addEventListener("blur", clear);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    },
    detach() {
      if (!attached || !target) return;
      attached = false;
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
      target.removeEventListener("blur", clear);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
      clear();
    },
    setMode(m) {
      if (m !== mode) clear();
      mode = m;
    },
    get mode() {
      return mode;
    },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) clear();
    },
    clear,
    /** Input frame for a side; consumes its latched presses. */
    read(side) {
      const p = P[side];
      const frame = { held: { ...p.held }, pressed: { ...p.latch } };
      for (const b of BTNS) p.latch[b] = false;
      return frame;
    },
    /** Non-consuming view (menus, tests). */
    peek(side) {
      return { held: { ...P[side].held }, pressed: { ...P[side].latch } };
    },
    _handlers: { onDown, onUp, clear },
  };
}
