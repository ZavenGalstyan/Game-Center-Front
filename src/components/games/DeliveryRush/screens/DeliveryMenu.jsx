/**
 * Delivery Rush — main menu.
 *
 * The live street diorama renders behind everything; this is only the overlay.
 * The primary action always names the exact run it will start, so the player
 * never has to go through a menu to continue their career.
 */

import MenuScene from "../game/MenuScene.jsx";
import { formatNumber } from "../utils/format.js";
import { careerSummary } from "../systems/progression.js";

export default function DeliveryMenu({
  zone,
  theme,
  vehicle,
  paintHex,
  state,
  nextRun,
  quality,
  onPlay,
  onGarage,
  onCities,
  onStats,
  onSettings,
}) {
  const summary = careerSummary(state);

  return (
    <div className="dr-screen dr-screen--menu">
      <MenuScene zone={zone} theme={theme} vehicle={vehicle} paintHex={paintHex} quality={quality} />

      <div className="dr-menu">
        <header className="dr-menu__head">
          <p className="dr-menu__kicker">{zone.name}</p>
          <h1 className="dr-menu__title">
            <span>Delivery</span>
            <span className="dr-menu__title-2">Rush</span>
          </h1>
          <p className="dr-menu__tag">Pick Up · Drive Fast · Deliver</p>
        </header>

        <nav className="dr-menu__nav">
          <button type="button" className="dr-btn dr-btn--hero" onClick={onPlay}>
            <span className="dr-btn__main">Play</span>
            {nextRun && (
              <span className="dr-btn__sub">
                Mission {String(nextRun.index).padStart(2, "0")} · {nextRun.zoneName}
              </span>
            )}
          </button>
          <div className="dr-menu__row">
            <button type="button" className="dr-btn" onClick={onGarage}>Garage</button>
            <button type="button" className="dr-btn" onClick={onCities}>Districts</button>
          </div>
          <div className="dr-menu__row">
            <button type="button" className="dr-btn" onClick={onStats}>Statistics</button>
            <button type="button" className="dr-btn" onClick={onSettings}>Settings</button>
          </div>
        </nav>

        <footer className="dr-menu__foot">
          <div className="dr-stat">
            <b>{formatNumber(state.coins)}</b>
            <i>Coins</i>
          </div>
          <div className="dr-stat">
            <b>
              {summary.stars}
              <em>/{summary.maxStars}</em>
            </b>
            <i>Stars</i>
          </div>
          <div className="dr-stat">
            <b>
              {summary.completed}
              <em>/{summary.total}</em>
            </b>
            <i>Deliveries</i>
          </div>
          <div className="dr-stat">
            <b>{vehicle.name}</b>
            <i>Equipped</i>
          </div>
        </footer>
      </div>
    </div>
  );
}
