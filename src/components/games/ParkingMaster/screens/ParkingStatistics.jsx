/**
 * Parking Master — lifetime statistics (all from localStorage).
 */

import { TOTAL_LEVELS } from "../data/levels.js";
import { formatTime } from "../utils/scoring.js";

export default function ParkingStatistics({ state, onBack }) {
  const s = state.statistics;
  const rows = [
    ["Levels Completed", `${s.levelsCompleted} / ${TOTAL_LEVELS}`],
    ["Total Stars", `${s.totalStars} / ${TOTAL_LEVELS * 3}`],
    ["Parking Attempts", s.attempts.toLocaleString()],
    ["Total Collisions", s.collisions.toLocaleString()],
    ["Perfect Parks", s.perfectParks.toLocaleString()],
    ["Best Precision", s.bestPrecision ? `${Math.round(s.bestPrecision)}%` : "—"],
    ["Total Driving Time", formatTime(s.drivingTime)],
  ];
  return (
    <div className="pm-screen pm-stats-screen">
      <header className="pm-select__head">
        <button type="button" className="pm-btn pm-btn--ghost" onClick={onBack}>Back</button>
        <h2>Statistics</h2>
        <span />
      </header>
      <div className="pm-stats-list">
        {rows.map(([label, value]) => (
          <div key={label} className="pm-stats-list__row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
