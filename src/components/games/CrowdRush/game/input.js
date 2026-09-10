/**
 * Crowd Rush — keyboard steering. A/D + arrow keys set a -1..0..1 direction on
 * the run. Everything is released on window blur / visibility loss so a crowd
 * never keeps sliding after the player tabs away.
 */

import { setKeyDir, setPaused } from "./engine.js";

export function attachKeyboard(runRef, onPauseToggle) {
  const keys = new Set();

  const apply = () => {
    const run = runRef.current;
    if (!run) return;
    let dir = 0;
    if (keys.has("a") || keys.has("arrowleft")) dir -= 1;
    if (keys.has("d") || keys.has("arrowright")) dir += 1;
    setKeyDir(run, dir);
  };

  const down = (e) => {
    const k = e.key.toLowerCase();
    if (["a", "d", "arrowleft", "arrowright"].includes(k)) {
      keys.add(k);
      e.preventDefault();
      apply();
    } else if (k === "escape") {
      onPauseToggle?.();
    } else if (k === "p") {
      onPauseToggle?.();
    }
  };
  const up = (e) => {
    keys.delete(e.key.toLowerCase());
    apply();
  };
  const clear = () => {
    keys.clear();
    apply();
  };

  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", clear);

  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", clear);
    document.removeEventListener("visibilitychange", clear);
    const run = runRef.current;
    if (run) setKeyDir(run, 0);
  };
}
