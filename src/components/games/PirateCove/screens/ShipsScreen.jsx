/**
 * Pirate Cove — Ships: a 3D preview of the chosen hull on the water, the
 * three classes, simple stat bars, the three upgrade tracks (Hull, Speed,
 * Cannons) paid in gold, and light cosmetics (sail + accent colour).
 */
import { useState } from "react";
import { ShipPreview } from "../three/MenuScene.jsx";
import { PLAYER_SHIPS, SHIP_CLASSES, SHIP_UNLOCK, UPGRADE_KEYS, UPGRADE_INFO, MAX_UPGRADE, upgradeCost, playerShipStats, statBars, SAIL_COLORS, ACCENT_COLORS } from "../data/ships.js";

export default function ShipsScreen({ state, onBack, onSelect, onUpgrade, onLook, audio }) {
  const [view, setView] = useState(state.ship);
  const owned = !!state.ships[view];
  const up = state.upgrades[view];
  const stats = playerShipStats(view, up);
  const bars = statBars(stats);
  const look = { ...state.look, hullColor: "#6b4428", flag: "player" };
  const C = SHIP_CLASSES[view];
  return (
    <div className="pc-ships">
      <div className="pc-ships__view">
        <ShipPreview shipId={view} look={look} />
      </div>
      <div className="pc-ships__panel">
        <div className="pc-ships__top">
          <button type="button" className="pc-back" onClick={onBack}>
            ← BACK
          </button>
          <span className="pc-ships__gold">
            <i className="pc-coin" /> {state.gold}
          </span>
        </div>
        <div className="pc-tabs">
          {PLAYER_SHIPS.map((id) => (
            <button
              key={id}
              type="button"
              className={`${view === id ? "on" : ""}${state.ships[id] ? "" : " locked"}`}
              onClick={() => {
                audio?.ui();
                setView(id);
              }}
            >
              {state.ships[id] ? "" : "🔒 "}
              {SHIP_CLASSES[id].name}
            </button>
          ))}
        </div>
        <h2 className="pc-ships__name">{C.name}</h2>
        <p className="pc-ships__blurb">{C.blurb}</p>
        <div className="pc-statbars">
          {[
            ["Hull", bars.hull, `${stats.hull}`],
            ["Speed", bars.speed, `${Math.round(stats.maxSpeed * 1.94)} kn`],
            ["Cannons", bars.cannons, `${stats.perSide}×2 · ${stats.damage.toFixed(0)} dmg`],
          ].map(([l, k, v]) => (
            <div key={l} className="pc-statbar">
              <span>{l}</span>
              <div className="pc-statbar__track">
                <i style={{ width: `${k * 100}%` }} />
              </div>
              <em>{v}</em>
            </div>
          ))}
        </div>
        {owned ? (
          <>
            <div className="pc-ships__head">Upgrades</div>
            {UPGRADE_KEYS.map((key) => {
              const lvl = up[key];
              const cost = upgradeCost(view, lvl);
              const can = cost != null && state.gold >= cost;
              return (
                <div key={key} className="pc-upg">
                  <div className="pc-upg__name">
                    {UPGRADE_INFO[key].label}
                    <small>{UPGRADE_INFO[key].text}</small>
                  </div>
                  <div className="pc-upg__pips">
                    {Array.from({ length: MAX_UPGRADE }).map((_, i) => (
                      <i key={i} className={i < lvl ? "on" : ""} />
                    ))}
                  </div>
                  <button type="button" className="pc-btn pc-btn--small" disabled={!can} onClick={() => onUpgrade(view, key)}>
                    {cost == null ? (
                      "MAX"
                    ) : (
                      <>
                        {cost} <i className="pc-coin" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
            <div className="pc-ships__head">Colours</div>
            <div className="pc-swatches">
              <span>Sails</span>
              {SAIL_COLORS.map((c) => (
                <button key={c.id} type="button" title={c.name} className={state.look.sail === c.color ? "on" : ""} style={{ background: c.color }} onClick={() => onLook({ sail: c.color })} />
              ))}
            </div>
            <div className="pc-swatches">
              <span>Trim</span>
              {ACCENT_COLORS.map((c) => (
                <button key={c.id} type="button" title={c.name} className={state.look.accent === c.color ? "on" : ""} style={{ background: c.color }} onClick={() => onLook({ accent: c.color })} />
              ))}
            </div>
            <button type="button" className="pc-btn pc-btn--primary pc-ships__select" disabled={state.ship === view} onClick={() => onSelect(view)}>
              {state.ship === view ? "CURRENT SHIP" : `SAIL THE ${C.name.toUpperCase()}`}
            </button>
          </>
        ) : (
          <div className="pc-ships__lock">
            <b>Locked</b>
            <span>{SHIP_UNLOCK[view]?.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}
