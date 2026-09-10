/**
 * Cake Designer — lifetime statistics (all from localStorage).
 */

import { Stars } from "../components/bits.jsx";
import { TOTAL_LEVELS } from "../data/collections.js";

export default function CakeStatistics({ state, onBack }) {
  const s = state.statistics;
  const rows = [
    ["Orders completed", `${s.ordersCompleted} / ${TOTAL_LEVELS}`],
    ["Total stars", `${s.stars} / ${TOTAL_LEVELS * 3}`],
    ["3-star orders", s.perfectOrders],
    ["Coins earned", s.coinsEarned.toLocaleString()],
    ["Best design match", `${s.bestScore}%`],
    ["Cakes created", s.cakesCreated],
    ["Free Design cakes", s.freeDesignCakes],
    ["Decorations placed", s.decorationsPlaced],
  ];
  return (
    <div className="cd-stats">
      <div className="cd-stats__top">
        <button className="cd-btn cd-btn--ghost" onClick={onBack}>Menu</button>
        <h2>Statistics</h2>
        <Stars value={Math.min(3, Math.round((s.stars / (TOTAL_LEVELS * 3)) * 3))} />
      </div>
      <div className="cd-stats__grid">
        {rows.map(([k, v]) => (
          <div key={k} className="cd-stat">
            <span className="cd-stat__val">{v}</span>
            <span className="cd-stat__key">{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
