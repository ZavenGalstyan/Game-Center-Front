/**
 * Farm Life — inventory/hotbar logic.
 *
 * Pure functions over a plain `{ hotbar: Slot[9], backpack: Slot[27] }`
 * shape (`Slot` = `{ itemId, qty } | null`). Nothing here touches React —
 * gameStore.js owns the mutable copy and notifies subscribers; this module
 * just computes the next state so every code path (planting consumes a
 * seed, selling removes crops, buying adds seeds, drag/drop swaps slots)
 * goes through the same add/remove/stack rules — no duplication, no partial
 * writes, per the spec's anti-duplication requirements.
 */
import { stackLimitFor } from "../data/items.js";
import { HOTBAR_SIZE, BACKPACK_SIZE } from "./constants.js";

export function createEmptyInventory() {
  return {
    hotbar: Array.from({ length: HOTBAR_SIZE }, () => null),
    backpack: Array.from({ length: BACKPACK_SIZE }, () => null),
  };
}

function allSlots(inv) {
  return [...inv.hotbar.map((s, i) => ({ area: "hotbar", i, s })), ...inv.backpack.map((s, i) => ({ area: "backpack", i, s }))];
}

function cloneInv(inv) {
  return { hotbar: inv.hotbar.map((s) => (s ? { ...s } : null)), backpack: inv.backpack.map((s) => (s ? { ...s } : null)) };
}

/** Adds `qty` of `itemId`, filling existing stacks first, then empty slots
 *  (hotbar before backpack). Returns { inv, added, leftover } — `leftover`
 *  is what didn't fit, so callers can refuse a purchase that would be lost. */
export function addItem(inv, itemId, qty) {
  if (qty <= 0) return { inv, added: 0, leftover: 0 };
  const next = cloneInv(inv);
  const limit = stackLimitFor(itemId);
  let remaining = qty;

  for (const { area, i, s } of allSlots(next)) {
    if (remaining <= 0) break;
    if (s && s.itemId === itemId && s.qty < limit) {
      const room = limit - s.qty;
      const take = Math.min(room, remaining);
      next[area][i] = { ...s, qty: s.qty + take };
      remaining -= take;
    }
  }
  for (const { area, i, s } of allSlots(next)) {
    if (remaining <= 0) break;
    if (!s) {
      const take = Math.min(limit, remaining);
      next[area][i] = { itemId, qty: take };
      remaining -= take;
    }
  }
  return { inv: next, added: qty - remaining, leftover: remaining };
}

export function countItem(inv, itemId) {
  return allSlots(inv).reduce((sum, { s }) => sum + (s && s.itemId === itemId ? s.qty : 0), 0);
}

export function hasItem(inv, itemId, qty = 1) {
  return countItem(inv, itemId) >= qty;
}

/** Removes up to `qty` of `itemId` across all stacks. Returns { inv, removed }. */
export function removeItem(inv, itemId, qty) {
  if (qty <= 0) return { inv, removed: 0 };
  const next = cloneInv(inv);
  let remaining = qty;
  for (const { area, i, s } of allSlots(next)) {
    if (remaining <= 0) break;
    if (s && s.itemId === itemId) {
      const take = Math.min(s.qty, remaining);
      const left = s.qty - take;
      next[area][i] = left > 0 ? { ...s, qty: left } : null;
      remaining -= take;
    }
  }
  return { inv: next, removed: qty - remaining };
}

/** Swaps/stacks the contents of two slots (drag-and-drop). Same-item stacks
 *  merge up to the stack limit, with any overflow left in the source slot. */
export function moveSlot(inv, fromArea, fromIndex, toArea, toIndex) {
  if (fromArea === toArea && fromIndex === toIndex) return inv;
  const next = cloneInv(inv);
  const from = next[fromArea][fromIndex];
  const to = next[toArea][toIndex];
  if (!from) return inv;

  if (to && to.itemId === from.itemId) {
    const limit = stackLimitFor(from.itemId);
    const room = limit - to.qty;
    if (room > 0) {
      const move = Math.min(room, from.qty);
      next[toArea][toIndex] = { ...to, qty: to.qty + move };
      const remain = from.qty - move;
      next[fromArea][fromIndex] = remain > 0 ? { ...from, qty: remain } : null;
      return next;
    }
  }
  next[fromArea][fromIndex] = to || null;
  next[toArea][toIndex] = from;
  return next;
}

export function isInventoryFull(inv) {
  return allSlots(inv).every(({ s }) => s !== null);
}
