/**
 * Last Shelter — house-phase input. Keyboard (WASD / arrows, E or Space to
 * grab, Enter or Q to go down the hatch) and the on-screen joystick/buttons
 * (they write into S directly). frame() returns a world-space intent; the
 * camera looks north, so up on screen is -z.
 */
export function createInput() {
  const S = { keys: new Set(), joy: { x: 0, y: 0, active: false }, grabQ: false, descendQ: false, active: false, onKey: null };
  const typing = (e) => {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  };
  const kd = (e) => {
    if (typing(e)) return;
    if (S.onKey && S.onKey(e.code, e)) {
      e.preventDefault();
      return;
    }
    if (!S.active) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    S.keys.add(e.code);
    if (e.code === "KeyE" || e.code === "Space") S.grabQ = true;
    if (e.code === "Enter" || e.code === "KeyQ") S.descendQ = true;
  };
  const ku = (e) => S.keys.delete(e.code);
  const blur = () => S.keys.clear();
  return {
    S,
    attach() {
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      window.addEventListener("blur", blur);
    },
    detach() {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    },
    frame() {
      const k = S.keys;
      let mx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
      let mz = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
      if (S.joy.active) {
        mx = S.joy.x;
        mz = S.joy.y;
      }
      const out = { mx, mz, interact: S.grabQ, descend: S.descendQ };
      S.grabQ = false;
      S.descendQ = false;
      return out;
    },
    clear() {
      S.keys.clear();
      S.joy.active = false;
      S.joy.x = S.joy.y = 0;
      S.grabQ = S.descendQ = false;
    },
  };
}
