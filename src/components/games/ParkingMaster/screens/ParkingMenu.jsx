/**
 * Parking Master — main menu. Premium: the 3D diorama fills the background and
 * the title, stats and buttons sit on a soft gradient panel over it.
 */

import MenuScene from "../game/MenuScene.jsx";
import { TOTAL_LEVELS } from "../data/levels.js";

export default function ParkingMenu({
  state,
  colorHex,
  bodyType,
  envId,
  onPlay,
  onLevels,
  onStats,
  onSettings,
}) {
  const stars = state.statistics.totalStars;
  const done = state.statistics.levelsCompleted;
  const best = Math.round(state.statistics.bestPrecision);

  return (
    <div className="pm-screen pm-menu">
      <div className="pm-menu__scene">
        <MenuScene colorHex={colorHex} bodyType={bodyType} envId={envId} quality={state.settings.graphics} />
      </div>
      <div className="pm-menu__veil" />

      <div className="pm-menu__body">
        <div className="pm-menu__brand">
          <h1 className="pm-menu__title">
            PARKING<br />MASTER
          </h1>
          <p className="pm-menu__subtitle">Drive • Align • Park</p>
        </div>

        <div className="pm-menu__stats">
          <Stat label="Total Stars" value={`${stars} / ${TOTAL_LEVELS * 3}`} />
          <Stat label="Levels Completed" value={`${done} / ${TOTAL_LEVELS}`} />
          <Stat label="Best Precision" value={best ? `${best}%` : "—"} />
        </div>

        <div className="pm-menu__actions">
          <button type="button" className="pm-btn pm-btn--primary pm-btn--lg" onClick={onPlay}>
            Play
          </button>
          <button type="button" className="pm-btn pm-btn--lg" onClick={onLevels}>Level Select</button>
          <button type="button" className="pm-btn pm-btn--lg" onClick={onStats}>Statistics</button>
          <button type="button" className="pm-btn pm-btn--lg" onClick={onSettings}>Settings</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="pm-stat">
      <span className="pm-stat__value">{value}</span>
      <span className="pm-stat__label">{label}</span>
    </div>
  );
}
