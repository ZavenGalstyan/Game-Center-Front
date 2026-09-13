/**
 * Stonewild — Workbench UI, opened by looking at a placed Workbench block
 * and pressing F. Shows every recipe (personal + tool-tier) through the
 * same shared CraftingPanel as the Inventory screen, plus the backpack for
 * reference — a real workbench supersedes the personal crafting list, it
 * doesn't duplicate a separate smaller one.
 */

import { useSyncExternalStore } from "react";
import Slot from "./Slot.jsx";
import CraftingPanel from "./CraftingPanel.jsx";
import { PERSONAL_RECIPES, WORKBENCH_RECIPES } from "../game/recipes.js";

const ALL_RECIPES = [...PERSONAL_RECIPES, ...WORKBENCH_RECIPES];

export default function WorkbenchScreen({ store, onClose }) {
  const s = useSyncExternalStore(store.subscribe, store.get);

  return (
    <div className="sw-overlay sw-workbench-overlay" onClick={onClose}>
      <div className="sw-panel sw-inventory__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sw-panel__header">
          <h2 className="sw-panel__title">Workbench</h2>
          <button type="button" className="sw-btn" onClick={onClose}>Close</button>
        </div>

        <div className="sw-inventory__body">
          <div className="sw-inventory__player">
            <p className="sw-inventory__label">Backpack</p>
            <div className="sw-slotgrid sw-slotgrid--backpack">
              {s.inventory.main.map((slot, i) => (
                <Slot key={i} slot={slot} section="main" index={i} onDrop={store.moveInventorySlot} />
              ))}
            </div>
          </div>

          <div className="sw-inventory__craftwrap">
            <p className="sw-inventory__label">Crafting</p>
            <CraftingPanel store={store} recipes={ALL_RECIPES} inventory={s.inventory} />
          </div>
        </div>
      </div>
    </div>
  );
}
