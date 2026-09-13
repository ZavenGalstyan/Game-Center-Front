/**
 * Stonewild — Inventory (E). Real slots (backpack + hotbar, drag/drop,
 * stacking) on the left, the shared crafting panel (tabs + recipe cards +
 * a detail pane, see CraftingPanel.jsx) on the right. Nothing here is a
 * placeholder — every craft button calls crafting.js against the real
 * inventory. Redesigned for readability: fixed-size slot grid (never
 * shrinks to fit), no ingredient text crammed into recipe cards, a
 * `max-height` so the modal fits inside the GamePlayer viewport with only
 * the recipe list scrolling internally.
 */

import { useSyncExternalStore } from "react";
import Slot from "./Slot.jsx";
import CraftingPanel from "./CraftingPanel.jsx";
import { PERSONAL_RECIPES } from "../game/recipes.js";

export default function InventoryScreen({ store, onClose }) {
  const s = useSyncExternalStore(store.subscribe, store.get);

  return (
    <div className="sw-overlay sw-inventory-overlay" onClick={onClose}>
      <div className="sw-panel sw-inventory__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sw-panel__header">
          <h2 className="sw-panel__title">Inventory</h2>
          <button type="button" className="sw-btn" onClick={onClose}>Close (E)</button>
        </div>

        <div className="sw-inventory__body">
          <div className="sw-inventory__player">
            <p className="sw-inventory__label">Backpack</p>
            <div className="sw-slotgrid sw-slotgrid--backpack">
              {s.inventory.main.map((slot, i) => (
                <Slot key={i} slot={slot} section="main" index={i} onDrop={store.moveInventorySlot} />
              ))}
            </div>
            <p className="sw-inventory__label">Hotbar</p>
            <div className="sw-slotgrid sw-slotgrid--hotbar">
              {s.inventory.hotbar.map((slot, i) => (
                <Slot
                  key={i}
                  slot={slot}
                  section="hotbar"
                  index={i}
                  selected={s.inventory.selected === i}
                  onDrop={store.moveInventorySlot}
                />
              ))}
            </div>
          </div>

          <div className="sw-inventory__craftwrap">
            <p className="sw-inventory__label">Crafting</p>
            <CraftingPanel store={store} recipes={PERSONAL_RECIPES} inventory={s.inventory} />
          </div>
        </div>
      </div>
    </div>
  );
}
