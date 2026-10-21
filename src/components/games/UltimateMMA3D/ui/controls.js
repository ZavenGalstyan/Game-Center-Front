/**
 * Player input → semantic fight buttons (engine/match.js `blankButtons`).
 *
 * Keyboard:  WASD move (W/S toward / away, A/D circle) · J jab · K cross ·
 *            L left hook · O right hook · U uppercut · I kick (S+I low, W+I
 *            head) · H front kick · SPACE guard (S+SPACE body guard) · SHIFT
 *            dodge (+A/D slip, +S step back, alone = duck) · E clinch /
 *            takedown / submission · R contextual grapple · ESC pause.
 * Gamepad (standard mapping): left stick move · A jab · X cross · Y hook ·
 *            B uppercut · RT kick · RB front kick · LT guard · LB dodge ·
 *            D-pad ↓ grab (E) · D-pad ↑ grapple (R) · START pause.
 * Touch:     on-screen stick + buttons (ui/TouchPad.jsx writes into `touch`).
 *
 * Presses are latched until the next sim step consumes them, so a tap that
 * happens between two 60 Hz steps is never lost.
 */
export const GAME_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyK", "KeyL", "KeyO", "KeyU", "KeyI", "KeyH", "KeyE", "KeyR", "Space", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "KeyP"]);

const PRESS = { KeyJ: "jab", KeyK: "cross", KeyL: "hookL", KeyO: "hookR", KeyU: "upper", KeyI: "kick", KeyH: "teep", KeyE: "grab", KeyR: "grapple" };

export function createControls() {
  const held = new Set();
  let pressed = null; // latest strike/grab press since the last step
  let dodgeLatch = false;
  let struggle = 0;
  const touch = { mx: 0, mz: 0, guard: false, low: false };
  let padPrev = {};
  let onPause = null;

  function keydown(e) {
    if (e.repeat) {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      return false;
    }
    held.add(e.code);
    if (PRESS[e.code]) {
      pressed = PRESS[e.code];
      struggle++;
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") dodgeLatch = true;
    if (e.code === "Space") struggle++;
    if (e.code === "Escape" || e.code === "KeyP") onPause?.();
    return GAME_CODES.has(e.code);
  }
  function keyup(e) {
    held.delete(e.code);
  }
  function clear() {
    held.clear();
    pressed = null;
    dodgeLatch = false;
    struggle = 0;
    touch.mx = touch.mz = 0;
    touch.guard = touch.low = false;
  }

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...(pads || [])].find((x) => x && x.connected);
    if (!p) return null;
    const b = (i) => !!p.buttons[i]?.pressed;
    const edge = (i) => b(i) && !padPrev[i];
    const out = { mx: 0, mz: 0, guard: b(6), low: false };
    const ax = p.axes[0] || 0;
    const ay = p.axes[1] || 0;
    out.mx = Math.abs(ax) > 0.2 ? -ax : 0;
    out.mz = Math.abs(ay) > 0.2 ? -ay : 0;
    out.low = ay > 0.5;
    out.fwd = ay < -0.5;
    if (edge(0)) pressed = "jab";
    if (edge(2)) pressed = "cross";
    if (edge(3)) pressed = "hookL";
    if (edge(1)) pressed = "upper";
    if (edge(7)) pressed = "kick";
    if (edge(5)) pressed = "teep";
    if (edge(13)) pressed = "grab";
    if (edge(12)) pressed = "grapple";
    if (edge(4)) dodgeLatch = true;
    if (edge(9)) onPause?.();
    for (const i of [0, 1, 2, 3, 5, 7]) if (edge(i)) struggle++;
    padPrev = Object.fromEntries(p.buttons.map((x, i) => [i, x.pressed]));
    return out;
  }

  return {
    touch,
    keydown,
    keyup,
    clear,
    set onPause(fn) {
      onPause = fn;
    },
    /** Called once per sim step: returns buttons and consumes latched presses. */
    buttons() {
      const pad = pollPad();
      const h = (c) => held.has(c);
      const up = h("KeyW") || h("ArrowUp");
      const down = h("KeyS") || h("ArrowDown");
      const left = h("KeyA") || h("ArrowLeft");
      const right = h("KeyD") || h("ArrowRight");
      let mz = (up ? 1 : 0) - (down ? 1 : 0);
      let mx = (left ? 1 : 0) - (right ? 1 : 0);
      let guard = h("Space");
      let low = down;
      let fwd = up;
      if (pad) {
        if (pad.mx || pad.mz) {
          mx = pad.mx;
          mz = pad.mz;
        }
        guard = guard || pad.guard;
        low = low || pad.low;
        fwd = fwd || pad.fwd;
      }
      if (touch.mx || touch.mz) {
        mx = touch.mx;
        mz = touch.mz;
        low = low || touch.mz < -0.5;
        fwd = fwd || touch.mz > 0.5;
      }
      guard = guard || touch.guard;
      low = low || touch.low;
      let dodge = null;
      if (dodgeLatch) dodge = mx > 0.3 ? "left" : mx < -0.3 ? "right" : mz < -0.3 ? "back" : "duck";
      // holding guard + S selects the body guard rather than walking back
      const B = { mx, mz: guard && low ? 0 : mz, guard, low, fwd, dodge, btn: pressed, struggle: struggle > 0, attack: null, action: null };
      pressed = null;
      dodgeLatch = false;
      struggle = 0;
      return B;
    },
    /** Touch helpers */
    press(btn) {
      if (btn === "dodge") dodgeLatch = true;
      else pressed = btn;
      struggle++;
    },
  };
}
