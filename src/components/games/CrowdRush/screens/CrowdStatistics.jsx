/**
 * Crowd Rush — lifetime statistics (all from localStorage).
 */

import { TOTAL_LEVELS } from "../data/levels.js";

export default function CrowdStatistics({ state, onBack }) {
  const st = state.statistics;
  const rows = [
    ["Levels Completed", `${st.levelsCompleted} / ${TOTAL_LEVELS}`],
    ["Total Stars", `${st.totalStars} / ${TOTAL_LEVELS * 3}`],
    ["Best Crowd", st.bestCrowd],
    ["Total Runners Collected", st.runnersCollected],
    ["Total Runners Lost", st.runnersLost],
    ["Enemy Crowds Defeated", st.enemyCrowdsDefeated],
    ["Bosses Defeated", st.bossesDefeated],
    ["Total Runs", st.totalRuns],
    ["Coins", state.coins],
  ];

  return (
    <div className="cr-screen cr-stats">
      <header className="cr-levels__head">
        <button type="button" className="cr-btn cr-btn--ghost" onClick={onBack}>‹ Menu</button>
        <h2>Statistics</h2>
        <span />
      </header>
      <div className="cr-stats__list">
        {rows.map(([k, v]) => (
          <div key={k} className="cr-stats__row">
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
