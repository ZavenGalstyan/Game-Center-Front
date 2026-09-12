import { formatClock } from "../utils/timing.js";

export default function BombStatistics({ state, onBack }) {
  const st = state.statistics;
  const rows = [
    ["MISSIONS COMPLETED", st.missionsCompleted],
    ["TOTAL STARS", st.totalStars],
    ["PERFECT DISARMS", st.perfectDisarms],
    ["TOTAL MODULES SOLVED", st.modulesSolved],
    ["TOTAL STRIKES", st.strikes],
    ["BEST TIME", st.bestTimeElapsed == null ? "--:--" : formatClock(st.bestTimeElapsed)],
    ["TOTAL DEFUSAL TIME", formatClock(st.totalDefusalTime)],
    ["WIRE MODULES SOLVED", st.wireModulesSolved],
    ["MEMORY MODULES SOLVED", st.memoryModulesSolved],
    ["TIMING MODULES SOLVED", st.timingModulesSolved],
  ];

  return (
    <div className="bs-stats">
      <div className="bs-select__header">
        <button type="button" className="bs-icon-btn" onClick={onBack} aria-label="Back">&#8592;</button>
        <h2 className="bs-select__title">STATISTICS</h2>
        <div style={{ width: 32 }} />
      </div>

      <div className="bs-stats__grid">
        {rows.map(([label, value]) => (
          <div key={label} className="bs-stats__row">
            <span className="bs-stats__label">{label}</span>
            <span className="bs-stats__value">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
