/**
 * Delivery Rush — career statistics.
 *
 * Everything here is derived from the mission record and the running counters,
 * so the numbers can never disagree with what the rest of the game shows.
 */

import { ZONES } from "../data/zones.js";
import { careerSummary, zoneProgress } from "../systems/progression.js";
import { formatNumber } from "../utils/format.js";

function Tile({ label, value, sub }) {
  return (
    <div className="dr-tile">
      <b className="dr-tile__value">{value}</b>
      <span className="dr-tile__label">{label}</span>
      {sub && <span className="dr-tile__sub">{sub}</span>}
    </div>
  );
}

export default function DeliveryStatistics({ state, onBack }) {
  const s = careerSummary(state);
  const rate = s.deliveries > 0 ? Math.round((s.successfulDeliveries / s.deliveries) * 100) : 0;
  const km = s.totalDistance / 1000;

  return (
    <div className="dr-screen dr-screen--stats">
      <header className="dr-subhead">
        <button type="button" className="dr-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Menu
        </button>
        <h2 className="dr-subhead__title">Statistics</h2>
        <span />
      </header>

      <div className="dr-stats">
        <div className="dr-tiles">
          <Tile label="Deliveries made" value={formatNumber(s.successfulDeliveries)} sub={`${formatNumber(s.deliveries)} attempted`} />
          <Tile label="Failed runs" value={formatNumber(s.failedDeliveries)} sub={`${rate}% success rate`} />
          <Tile label="Coins earned" value={formatNumber(s.totalCoinsEarned)} sub={`${formatNumber(state.coins)} in hand`} />
          <Tile label="Distance driven" value={`${km < 10 ? km.toFixed(2) : Math.round(km)} km`} />
          <Tile label="Collisions" value={formatNumber(s.collisions)} />
          <Tile label="Three-star runs" value={`${s.threeStars}`} sub={`of ${s.total} missions`} />
          <Tile label="Best streak" value={`x${s.bestStreak || 1}`} />
          <Tile label="Vehicles owned" value={`${s.vehiclesOwned}/${s.vehiclesTotal}`} />
        </div>

        <section className="dr-stats__zones">
          <h3 className="dr-settings__title">District progress</h3>
          <ul>
            {ZONES.map((z) => {
              const p = zoneProgress(state, z.id);
              return (
                <li key={z.id} className={p.unlocked ? "" : "is-locked"}>
                  <span className="dr-stats__dot" style={{ background: z.palette.accent }} />
                  <span className="dr-stats__name">{z.name}</span>
                  <span className="dr-stats__bar">
                    <i style={{ width: `${p.unlocked ? (p.stars / p.maxStars) * 100 : 0}%`, background: z.palette.accent }} />
                  </span>
                  <span className="dr-stats__num">
                    {p.unlocked ? `${p.completed}/${p.total} · ${p.stars}★` : `${p.required}★ to unlock`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
