/**
 * Rooftop Sniper — lifetime statistics.
 */
import { TOTAL_MISSIONS } from "../data/missions.js";

export default function Statistics({ state, onBack }) {
  const st = state.statistics;
  const accuracy = st.shotsFired > 0 ? Math.round((st.hits / st.shotsFired) * 100) : 0;

  return (
    <div className="rs-select">
      <header className="rs-select__header">
        <button type="button" className="rs-btn rs-btn--icon" onClick={onBack}>&larr;</button>
        <h1>STATISTICS</h1>
        <div />
      </header>
      <div className="rs-stats__grid">
        <StatCard label="Missions Completed" value={`${st.missionsCompleted} / ${TOTAL_MISSIONS}`} />
        <StatCard label="Total Stars" value={`${st.totalStars} / ${TOTAL_MISSIONS * 3}`} />
        <StatCard label="Shots Fired" value={st.shotsFired} />
        <StatCard label="Hits" value={st.hits} />
        <StatCard label="Misses" value={st.misses} />
        <StatCard label="Overall Accuracy" value={`${accuracy}%`} />
        <StatCard label="Best Accuracy" value={`${Math.round(st.bestAccuracyEver * 100)}%`} />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rs-stat-card">
      <span className="rs-stat-card__value">{value}</span>
      <span className="rs-stat-card__label">{label}</span>
    </div>
  );
}
