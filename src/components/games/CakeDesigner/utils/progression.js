/**
 * Cake Designer — unlock logic.
 *
 * A catalogue entry's `unlock` rule is resolved against the player's progress:
 *
 *   { type: "start" }                    always available
 *   { type: "level", level: N }          available once the player has REACHED
 *                                        level N  (unlockedLevel >= N) — this is
 *                                        what guarantees every order's own
 *                                        ingredients are in reach on that level
 *   { type: "collection", collection }   available once that collection opens
 *   { type: "coins", cost: N }           optional shop item — available only
 *                                        after it's been bought (state.purchased)
 *
 * Nothing here writes storage; it only reads the progress object.
 */

import { COLLECTION_BY_ID } from "../data/collections.js";
import { ALL_UNLOCKABLES, UNLOCK_BY_KEY } from "../data/items.js";

export function isUnlocked(rule, state) {
  if (!rule || rule.type === "start") return true;
  if (rule.type === "level") return (state.unlockedLevel || 1) >= rule.level;
  if (rule.type === "collection") {
    const col = COLLECTION_BY_ID[rule.collection];
    if (!col) return true;
    return (state.unlockedLevel || 1) >= col.range[0];
  }
  if (rule.type === "coins") return (state.purchased || []).includes(ruleKeyFor(rule));
  return false;
}

// coins rules are matched by the catalogue key that owns them
function ruleKeyFor(rule) {
  const owner = ALL_UNLOCKABLES.find((u) => u.unlock === rule);
  return owner ? owner.key : null;
}

/** `group:id` -> boolean, e.g. isItemUnlocked("shape", "square", state) */
export function isItemUnlocked(group, id, state) {
  const entry = UNLOCK_BY_KEY[`${group}:${id}`];
  if (!entry) return true; // things with no unlock rule (e.g. drip:"none")
  return isUnlocked(entry.unlock, state);
}

/** All catalogue keys the player currently owns. */
export function unlockedKeys(state) {
  return ALL_UNLOCKABLES.filter((u) => isUnlocked(u.unlock, state)).map((u) => u.key);
}

/** Coin-shop entries that are still locked, with their price. */
export function shopItems(state) {
  return ALL_UNLOCKABLES
    .filter((u) => u.unlock?.type === "coins")
    .map((u) => ({ ...u, owned: (state.purchased || []).includes(u.key), price: u.unlock.cost }));
}

/** Per-group owned / total counts for the Collection screen. */
export function collectionCounts(state) {
  const owned = new Set(unlockedKeys(state));
  const out = {};
  for (const u of ALL_UNLOCKABLES) {
    out[u.group] = out[u.group] || { owned: 0, total: 0 };
    out[u.group].total += 1;
    if (owned.has(u.key)) out[u.group].owned += 1;
  }
  return out;
}

/** Human sentence for a lock rule, for tooltips on the Collection screen. */
export function lockLabel(rule) {
  if (!rule || rule.type === "start") return "Unlocked";
  if (rule.type === "level") return `Reach Order ${String(rule.level).padStart(2, "0")}`;
  if (rule.type === "collection") {
    const col = COLLECTION_BY_ID[rule.collection];
    return col ? `Unlock ${col.name}` : "Locked";
  }
  if (rule.type === "coins") return `Buy for ${rule.cost} coins`;
  return "Locked";
}
