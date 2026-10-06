/** Shared UI sound props for menu buttons (hover tick). Click sounds are played by handlers. */
import { audio } from "../audio/audio.js";

export const ui = {
  onPointerEnter: (e) => {
    if (e.pointerType === "mouse") audio.uiHover();
  },
};

export const fmtTime = (t) => {
  if (!Number.isFinite(t) || t < 0) return "--:--.--";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
