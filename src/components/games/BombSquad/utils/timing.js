/**
 * Bomb Squad — small time formatting/clamping helpers shared by the timer
 * system and the HUD-less device display.
 */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
