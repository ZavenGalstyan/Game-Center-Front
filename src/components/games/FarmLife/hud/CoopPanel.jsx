/**
 * Farm Life — the Chicken Coop panel: buy a chicken, feed everyone, collect
 * ready eggs. `chickens` is a plain snapshot the parent refreshes after
 * every action (the live wandering copies stay in a ref — see
 * screens/Gameplay.jsx — this panel never needs 60fps position updates).
 */
const CHICKEN_PRICE = 100;

export default function CoopPanel({ money, chickens, eggsReady, onBuyChicken, onFeedAll, onCollectEggs, onClose }) {
  return (
    <div className="fl-panel-backdrop" onClick={onClose}>
      <div className="fl-panel fl-coop" onClick={(e) => e.stopPropagation()}>
        <div className="fl-panel__header">
          <h3>Chicken Coop</h3>
          <button type="button" className="fl-panel__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="fl-shop__coins">🪙 {money} coins</p>

        <div className="fl-coop__list">
          {chickens.length === 0 && <p className="fl-coop__empty">No chickens yet — buy your first one below.</p>}
          {chickens.map((c) => (
            <div className="fl-coop__row" key={c.id}>
              <span className="fl-coop__name">🐔 {c.name}</span>
              <span className="fl-coop__hunger" title="Hunger">
                <span className="fl-coop__hunger-bar" style={{ width: `${Math.round(c.hunger)}%` }} />
              </span>
              {c.hasEgg && <span className="fl-coop__egg">🥚 egg ready</span>}
            </div>
          ))}
        </div>

        <div className="fl-coop__actions">
          <button type="button" className="fl-btn fl-btn--primary" onClick={onBuyChicken} disabled={money < CHICKEN_PRICE}>
            Buy Chicken — {CHICKEN_PRICE} coins
          </button>
          <button type="button" className="fl-btn" onClick={onFeedAll} disabled={chickens.length === 0}>
            Feed All
          </button>
          <button type="button" className="fl-btn" onClick={onCollectEggs} disabled={eggsReady === 0}>
            Collect Eggs {eggsReady > 0 ? `(${eggsReady})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

export { CHICKEN_PRICE };
