/**
 * Delivery Rush — the garage.
 *
 * A real showroom rather than a list of cards: the selected vehicle stands on a
 * lit turntable you can drag to spin, with the roster down the left and the
 * spec sheet, paint options and the buy/equip action on the right.
 *
 * The stat bars are the same numbers the physics uses, mapped to 1-5, so what
 * the garage promises is what the car does.
 */

import GarageScene from "../game/GarageScene.jsx";
import { VEHICLES, PAINTS, getPaintHex } from "../data/vehicles.js";
import { formatNumber } from "../utils/format.js";
import { sfx } from "../utils/sound.js";

function Stars({ value, max = 5 }) {
  return (
    <span className="dr-bars" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? "is-on" : ""} />
      ))}
    </span>
  );
}

export default function Garage({
  state,
  selectedId,
  onSelect,
  onBuy,
  onEquip,
  onPaint,
  onBack,
  quality,
  sound,
}) {
  const vehicle = VEHICLES.find((v) => v.id === selectedId) || VEHICLES[0];
  const owned = state.ownedVehicles.includes(vehicle.id);
  const equipped = state.selectedVehicle === vehicle.id;
  const paintId = state.vehicleColors[vehicle.id] || vehicle.defaultPaint;
  const affordable = state.coins >= vehicle.price;

  return (
    <div className="dr-screen dr-screen--garage">
      <GarageScene vehicle={vehicle} paintHex={getPaintHex(paintId)} quality={quality} />

      <div className="dr-garage">
        <header className="dr-subhead">
          <button type="button" className="dr-back" onClick={onBack}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            Menu
          </button>
          <h2 className="dr-subhead__title">Garage</h2>
          <span className="dr-coins">
            <span className="dr-coins__icon" aria-hidden="true" />
            {formatNumber(state.coins)}
          </span>
        </header>

        <div className="dr-garage__body">
          <ul className="dr-garage__list">
            {VEHICLES.map((v) => {
              const has = state.ownedVehicles.includes(v.id);
              const isEq = state.selectedVehicle === v.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    className={`dr-vcard${v.id === selectedId ? " is-active" : ""}${has ? "" : " is-locked"}`}
                    onClick={() => {
                      sfx.ui(sound);
                      onSelect(v.id);
                    }}
                  >
                    <span className="dr-vcard__swatch" style={{ background: getPaintHex(state.vehicleColors[v.id] || v.defaultPaint) }} />
                    <span className="dr-vcard__text">
                      <b>{v.name}</b>
                      <i>{v.tagline}</i>
                    </span>
                    <span className="dr-vcard__state">
                      {isEq ? "Equipped" : has ? "Owned" : `${formatNumber(v.price)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="dr-garage__panel">
            <p className="dr-panel__eyebrow">{vehicle.tagline}</p>
            <h3 className="dr-panel__title">{vehicle.name}</h3>
            <p className="dr-panel__blurb">{vehicle.blurb}</p>

            <dl className="dr-specs">
              <div><dt>Speed</dt><dd><Stars value={vehicle.stars.speed} /></dd></div>
              <div><dt>Acceleration</dt><dd><Stars value={vehicle.stars.accel} /></dd></div>
              <div><dt>Handling</dt><dd><Stars value={vehicle.stars.handling} /></dd></div>
              <div><dt>Braking</dt><dd><Stars value={vehicle.stars.braking} /></dd></div>
              <div><dt>Capacity</dt><dd className="dr-specs__text">{vehicle.capacity}</dd></div>
              <div>
                <dt>Top speed</dt>
                <dd className="dr-specs__text">{Math.round(vehicle.drive.maxSpeed * 3.6)} km/h</dd>
              </div>
            </dl>

            {vehicle.cargoBonus && (
              <p className="dr-note">+{Math.round(vehicle.cargoBonus * 100)}% cargo bonus on every delivery.</p>
            )}

            <div className="dr-paints">
              <p className="dr-paints__label">Paint</p>
              <div className="dr-paints__row">
                {PAINTS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`dr-paint${p.id === paintId ? " is-active" : ""}`}
                    style={{ background: p.hex }}
                    title={p.name}
                    aria-label={p.name}
                    disabled={!owned}
                    onClick={() => {
                      sfx.ui(sound);
                      onPaint(vehicle.id, p.id);
                    }}
                  />
                ))}
              </div>
              {!owned && <p className="dr-paints__hint">Buy this vehicle to repaint it.</p>}
            </div>

            <div className="dr-garage__cta">
              {equipped ? (
                <button type="button" className="dr-btn dr-btn--primary" disabled>Equipped</button>
              ) : owned ? (
                <button
                  type="button"
                  className="dr-btn dr-btn--primary"
                  onClick={() => {
                    sfx.ui(sound);
                    onEquip(vehicle.id);
                  }}
                >
                  Equip
                </button>
              ) : (
                <button
                  type="button"
                  className={`dr-btn dr-btn--primary${affordable ? "" : " is-disabled"}`}
                  onClick={() => {
                    if (!affordable) {
                      sfx.denied(sound);
                      return;
                    }
                    sfx.buy(sound);
                    onBuy(vehicle.id);
                  }}
                >
                  Buy · {formatNumber(vehicle.price)}
                </button>
              )}
              {!owned && !affordable && (
                <p className="dr-garage__short">
                  {formatNumber(vehicle.price - state.coins)} more coins needed
                </p>
              )}
            </div>
            <p className="dr-garage__hint">Drag the showroom to spin the vehicle.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
