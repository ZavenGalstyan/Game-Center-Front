/** Delivery Rush — small shared formatters used by HUD and result screens. */

/** 84 -> "1:24" (mm:ss, minutes never zero-padded) */
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** 84.3 -> "01:24" — the fixed-width HUD variant */
export function formatTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 12450 -> "12,450" */
export function formatNumber(n) {
  return Math.round(n || 0).toLocaleString("en-US");
}

/** metres -> "340 m" / "1.2 km" */
export function formatDistance(m) {
  if (!Number.isFinite(m)) return "--";
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}
