import { formatClock } from "../utils/timing.js";

/**
 * The device's integrated digital display. Pressure state is purely a
 * function of remaining/total — no independent timer of its own.
 */
export default function DeviceTimer({ remaining, total, reducedMotion }) {
  const pct = total > 0 ? remaining / total : 1;
  const pressure = remaining <= 5 ? "critical" : remaining <= 15 ? "high" : remaining <= 30 ? "warn" : "calm";
  return (
    <div
      className={`bs-timer bs-timer--${pressure}${reducedMotion ? " bs-timer--still" : ""}`}
      role="timer"
      aria-live="off"
    >
      <span className="bs-timer__label">TIME</span>
      <span className="bs-timer__digits">{formatClock(remaining)}</span>
      <span className="bs-timer__bar"><span className="bs-timer__bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }} /></span>
    </div>
  );
}
