/**
 * Farm Life — the Shipping Box: sell crops/animal products for coins.
 * Checkpoint 1 simplification — pays out immediately on sale rather than
 * "next morning" (spec's fuller shipping-box delay is a later-phase nicety;
 * an instant, testable loop matters more for the first playable version).
 */
import ItemIcon from "./ItemIcon.jsx";
import { getItem } from "../data/items.js";

const SELLABLE_CATEGORIES = new Set(["crop", "animalProduct"]);

export default function ShippingPanel({ inventory, onSellAll, onClose }) {
  const counts = {};
  for (const slot of [...inventory.hotbar, ...inventory.backpack]) {
    if (!slot) continue;
    const def = getItem(slot.itemId);
    if (def && SELLABLE_CATEGORIES.has(def.category)) counts[def.id] = (counts[def.id] || 0) + slot.qty;
  }
  const rows = Object.entries(counts);

  return (
    <div className="fl-panel-backdrop" onClick={onClose}>
      <div className="fl-panel fl-shop" onClick={(e) => e.stopPropagation()}>
        <div className="fl-panel__header">
          <h3>Shipping Box</h3>
          <button type="button" className="fl-panel__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {rows.length === 0 && <p className="fl-coop__empty">Nothing to sell yet — harvest crops or collect eggs first.</p>}
        <div className="fl-shop__list">
          {rows.map(([itemId, qty]) => {
            const def = getItem(itemId);
            return (
              <div className="fl-shop__row" key={itemId}>
                <ItemIcon itemId={itemId} size={36} />
                <div className="fl-shop__info">
                  <strong>{def.name} ×{qty}</strong>
                  <span>{def.sellPrice} coins each</span>
                </div>
                <button type="button" className="fl-btn fl-btn--primary" onClick={() => onSellAll(itemId)}>
                  Sell All ({qty * def.sellPrice})
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
