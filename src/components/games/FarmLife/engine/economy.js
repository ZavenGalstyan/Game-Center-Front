/**
 * Farm Life — buying/selling helpers.
 *
 * Pure functions over `{ money, inventory }`. Every purchase/sale goes
 * through exactly one of these so money and items always change together —
 * no path exists that can charge money without granting the item, or remove
 * an item without paying out, which is exactly the "selling item without
 * removing it" / "buying item without money" bug class the spec calls out.
 */
import { addItem, removeItem, countItem } from "./inventory.js";
import { getItem } from "../data/items.js";

/** Buys up to `qty` of `itemId` at `unitPrice`, capped by both wallet and
 *  free inventory space. Returns { money, inventory, bought } — `bought` is
 *  how many actually changed hands (0 means the purchase did nothing, so
 *  callers can show "Not enough coins" / "Inventory full" accordingly). */
export function buyItem(state, itemId, qty, unitPrice) {
  const affordableQty = Math.min(qty, Math.floor(state.money / unitPrice));
  if (affordableQty <= 0) return { ...state, bought: 0 };
  const { inv, added } = addItem(state.inventory, itemId, affordableQty);
  if (added <= 0) return { ...state, bought: 0 };
  return { money: state.money - added * unitPrice, inventory: inv, bought: added };
}

/** Sells up to `qty` of `itemId` (or the item's own sellPrice if none is
 *  given). Returns { money, inventory, sold, earned }. */
export function sellItem(state, itemId, qty, unitPriceOverride) {
  const def = getItem(itemId);
  const unitPrice = unitPriceOverride ?? def?.sellPrice ?? 0;
  const have = countItem(state.inventory, itemId);
  const sellQty = Math.min(qty, have);
  if (sellQty <= 0) return { ...state, sold: 0, earned: 0 };
  const { inv, removed } = removeItem(state.inventory, itemId, sellQty);
  const earned = removed * unitPrice;
  return { money: state.money + earned, inventory: inv, sold: removed, earned };
}

export function sellAllOf(state, itemId, unitPriceOverride) {
  return sellItem(state, itemId, countItem(state.inventory, itemId), unitPriceOverride);
}
