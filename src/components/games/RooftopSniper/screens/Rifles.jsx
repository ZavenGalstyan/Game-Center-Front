/**
 * Rooftop Sniper — Rifles: the 5 sniper rifles, unlocked by mission
 * progression (no shop, no currency). Selecting one sets it as the rifle
 * used for the next mission attempt.
 */
import { RIFLES, isRifleUnlocked } from "../data/rifles.js";

const STAT_MAX = { stability: 1, zoom: 8, velocity: 420, reload: 3, magazine: 6 };

export default function Rifles({ state, onSelect, onBack }) {
  return (
    <div className="rs-rifles">
      <header className="rs-select__header">
        <button type="button" className="rs-btn rs-btn--icon" onClick={onBack}>&larr;</button>
        <h1>RIFLES</h1>
        <div />
      </header>

      <div className="rs-rifles__grid">
        {RIFLES.map((rifle) => {
          const unlocked = isRifleUnlocked(state, rifle);
          const active = state.selectedRifle === rifle.id;
          const topZoom = rifle.zoomLevels[rifle.zoomLevels.length - 1];
          return (
            <div key={rifle.id} className={`rs-rifle-card${active ? " rs-rifle-card--active" : ""}${unlocked ? "" : " rs-rifle-card--locked"}`}>
              <h2>{rifle.name}</h2>
              <p className="rs-rifle-card__tagline">{rifle.tagline}</p>
              <Bar label="STABILITY" value={rifle.stability / STAT_MAX.stability} />
              <Bar label="ZOOM" value={topZoom / STAT_MAX.zoom} suffix={`${topZoom}×`} />
              <Bar label="VELOCITY" value={rifle.velocity / STAT_MAX.velocity} suffix={`${rifle.velocity} m/s`} />
              <Bar label="RELOAD" value={1 - rifle.reloadTime / STAT_MAX.reload} suffix={`${rifle.reloadTime.toFixed(1)}s`} />
              <Bar label="MAGAZINE" value={rifle.magazine / STAT_MAX.magazine} suffix={rifle.magazine} />
              {unlocked ? (
                <button
                  type="button"
                  className={`rs-btn${active ? " rs-btn--primary" : ""}`}
                  disabled={active}
                  onClick={() => onSelect(rifle.id)}
                >
                  {active ? "EQUIPPED" : "EQUIP"}
                </button>
              ) : (
                <p className="rs-rifle-card__unlock">Unlocks at Mission {rifle.unlockMission}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ label, value, suffix }) {
  return (
    <div className="rs-rifle-bar">
      <span className="rs-rifle-bar__label">{label}</span>
      <span className="rs-rifle-bar__track">
        <span className="rs-rifle-bar__fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
      </span>
      {suffix != null && <span className="rs-rifle-bar__suffix">{suffix}</span>}
    </div>
  );
}
