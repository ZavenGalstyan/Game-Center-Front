/**
 * Supermarket Rush — upgrades screen. A handful of useful, purchasable
 * upgrades — see data/upgrades.js — bought with money earned from shifts.
 */
import { UPGRADES, upgradeCost, upgradeMaxLevel } from "../data/upgrades.js";

export default function Upgrades({ state, onBuy, onBack }) {
  return (
    <div className="sr-screen sr-upgrades">
      <header className="sr-screen__header">
        <button type="button" className="sr-btn sr-btn--icon" onClick={onBack}>‹</button>
        <h1>Upgrades</h1>
        <span className="sr-upgrades__wallet">${state.money}</span>
      </header>
      <div className="sr-upgrades__grid">
        {UPGRADES.map((u) => {
          const level = state.upgrades[u.id] || 0;
          const max = upgradeMaxLevel(u);
          const cost = upgradeCost(u, level);
          const maxed = cost == null;
          return (
            <div key={u.id} className="sr-upgrades__card">
              <h3>{u.name}</h3>
              <p>{u.description}</p>
              <div className="sr-upgrades__pips">
                {Array.from({ length: max }).map((_, i) => (
                  <span key={i} className={i < level ? "sr-upgrades__pip sr-upgrades__pip--on" : "sr-upgrades__pip"} />
                ))}
              </div>
              <button
                type="button"
                className="sr-btn sr-btn--primary"
                disabled={maxed || state.money < cost}
                onClick={() => onBuy(u.id)}
              >
                {maxed ? "MAXED" : `UPGRADE — $${cost}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
