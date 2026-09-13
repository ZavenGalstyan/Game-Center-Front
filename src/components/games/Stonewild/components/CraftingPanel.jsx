/**
 * Stonewild — the crafting panel shared by the Inventory and Workbench
 * screens: category tabs -> a scrollable grid of compact recipe cards
 * (icon + name + output count only, never the ingredient text crammed into
 * the card itself — that was the overlapping-text bug) -> a separate
 * selected-recipe detail pane with the large icon, a per-ingredient
 * owned/needed readout, and the one Craft button.
 */

import { useEffect, useMemo, useState } from "react";
import ItemIcon from "./ItemIcon.jsx";
import { canCraftRecipe, craftRecipe } from "../game/crafting.js";
import { countItem } from "../game/inventory.js";
import { getItem } from "../game/items.js";
import { CATEGORIES } from "../game/recipes.js";

export default function CraftingPanel({ store, recipes, inventory }) {
  const [category, setCategory] = useState("all");
  const filtered = useMemo(
    () => (category === "all" ? recipes : recipes.filter((r) => r.category === category)),
    [recipes, category],
  );
  const [selectedId, setSelectedId] = useState(filtered[0]?.id ?? null);

  useEffect(() => {
    if (!filtered.some((r) => r.id === selectedId)) setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const selected = recipes.find((r) => r.id === selectedId) || null;
  const availableCategories = CATEGORIES.filter((c) => c === "all" || recipes.some((r) => r.category === c));

  return (
    <div className="sw-crafting">
      <div className="sw-crafting__tabs">
        {availableCategories.map((c) => (
          <button
            key={c}
            type="button"
            className={`sw-tab${category === c ? " is-active" : ""}`}
            onClick={() => setCategory(c)}
          >
            {c.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="sw-crafting__body">
        <div className="sw-crafting__list">
          {filtered.length === 0 && <p className="sw-crafting__empty-list">No recipes in this category yet.</p>}
          {filtered.map((r) => {
            const can = canCraftRecipe(inventory, r);
            return (
              <button
                key={r.id}
                type="button"
                className={`sw-recipe-card${selectedId === r.id ? " is-selected" : ""}${can ? "" : " is-unavailable"}`}
                onClick={() => setSelectedId(r.id)}
              >
                <ItemIcon itemId={r.output.item} size={30} />
                <span className="sw-recipe-card__name">{r.name}</span>
                <span className="sw-recipe-card__qty">×{r.output.count}</span>
              </button>
            );
          })}
        </div>

        <div className="sw-crafting__detail">
          {selected ? (
            <>
              <div className="sw-crafting__detail-icon">
                <ItemIcon itemId={selected.output.item} size={56} />
              </div>
              <h3 className="sw-crafting__detail-title">
                {selected.name} <span className="sw-crafting__detail-qty">×{selected.output.count}</span>
              </h3>
              <p className="sw-crafting__requires-label">Requires</p>
              <ul className="sw-requirement-list">
                {selected.inputs.map((cost) => {
                  const owned = countItem(inventory, cost.item);
                  const enough = owned >= cost.count;
                  const def = getItem(cost.item);
                  return (
                    <li key={cost.item} className={`sw-requirement${enough ? "" : " is-short"}`}>
                      <ItemIcon itemId={cost.item} size={22} />
                      <span className="sw-requirement__name">{def?.name || cost.item}</span>
                      <span className="sw-requirement__count">
                        {owned} / {cost.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="sw-btn sw-btn--primary sw-crafting__craft-btn"
                disabled={!canCraftRecipe(inventory, selected)}
                onClick={() => craftRecipe(store, selected)}
              >
                Craft
              </button>
            </>
          ) : (
            <p className="sw-crafting__empty">Select a recipe to see what it needs.</p>
          )}
        </div>
      </div>
    </div>
  );
}
