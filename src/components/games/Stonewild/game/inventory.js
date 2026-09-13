/**
 * Stonewild — inventory data structure and pure operations.
 *
 * `{ hotbar: Array(9), main: Array(27) }`, each slot either `null` or
 * `{ itemId, count, durability? }`. Every mutation here returns a NEW
 * inventory object (immutable update) — Gameplay.jsx holds this in a
 * useSyncExternalStore-style store (see game/inventoryStore.js) so the UI
 * re-renders on real changes without the 60fps frame loop touching React
 * state.
 */

import { getItem, stackLimitFor } from "./items.js";
import { HOTBAR_SIZE, INVENTORY_SIZE } from "./constants.js";

export function createEmptyInventory() {
  return {
    hotbar: new Array(HOTBAR_SIZE).fill(null),
    main: new Array(INVENTORY_SIZE).fill(null),
    selected: 0,
  };
}

function cloneInv(inv) {
  return { hotbar: inv.hotbar.slice(), main: inv.main.slice(), selected: inv.selected };
}

/**
 * Adds `count` of `itemId` into the first available slots (hotbar first,
 * then main), merging into existing partial stacks before using empty ones.
 * Returns `{ inventory, leftover }` — `leftover > 0` means the inventory is
 * full and that many items were NOT added (caller must leave the source,
 * e.g. a world drop, alone).
 */
export function addItem(inv, itemId, count) {
  if (!itemId || count <= 0) return { inventory: inv, leftover: 0 };
  const limit = stackLimitFor(itemId);
  let remaining = count;
  const next = cloneInv(inv);

  const fillInto = (arr) => {
    // merge into existing stacks first
    for (let i = 0; i < arr.length && remaining > 0; i++) {
      const slot = arr[i];
      if (slot && slot.itemId === itemId && slot.count < limit) {
        const add = Math.min(limit - slot.count, remaining);
        arr[i] = { ...slot, count: slot.count + add };
        remaining -= add;
      }
    }
    // then empty slots
    for (let i = 0; i < arr.length && remaining > 0; i++) {
      if (!arr[i]) {
        const add = Math.min(limit, remaining);
        arr[i] = { itemId, count: add };
        remaining -= add;
      }
    }
  };

  fillInto(next.hotbar);
  fillInto(next.main);

  return { inventory: next, leftover: remaining };
}

/** Removes up to `count` of `itemId` from anywhere (hotbar first). Returns null if not enough. */
export function removeItem(inv, itemId, count) {
  const total = countItem(inv, itemId);
  if (total < count) return null;
  let remaining = count;
  const next = cloneInv(inv);
  const drain = (arr) => {
    for (let i = 0; i < arr.length && remaining > 0; i++) {
      const slot = arr[i];
      if (slot && slot.itemId === itemId) {
        const take = Math.min(slot.count, remaining);
        const left = slot.count - take;
        arr[i] = left > 0 ? { ...slot, count: left } : null;
        remaining -= take;
      }
    }
  };
  drain(next.hotbar);
  drain(next.main);
  return next;
}

export function countItem(inv, itemId) {
  let n = 0;
  for (const s of inv.hotbar) if (s && s.itemId === itemId) n += s.count;
  for (const s of inv.main) if (s && s.itemId === itemId) n += s.count;
  return n;
}

export function hasAtLeast(inv, itemId, count) {
  return countItem(inv, itemId) >= count;
}

function slotArray(inv, section) {
  return section === "hotbar" ? inv.hotbar : inv.main;
}

/** Swaps or merges slot `a` into slot `b` (drag-and-drop). Sections: "hotbar" | "main". */
export function moveSlot(inv, from, to) {
  const next = cloneInv(inv);
  const fromArr = slotArray(next, from.section);
  const toArr = slotArray(next, to.section);
  const a = fromArr[from.index];
  const b = toArr[to.index];
  if (!a) return inv;

  if (b && b.itemId === a.itemId) {
    const limit = stackLimitFor(a.itemId);
    const space = limit - b.count;
    if (space > 0) {
      const moved = Math.min(space, a.count);
      toArr[to.index] = { ...b, count: b.count + moved };
      const remain = a.count - moved;
      fromArr[from.index] = remain > 0 ? { ...a, count: remain } : null;
      return next;
    }
  }
  // swap
  fromArr[from.index] = b || null;
  toArr[to.index] = a;
  return next;
}

export function selectedSlot(inv) {
  return inv.hotbar[inv.selected] || null;
}

export function setSelected(inv, index) {
  if (index < 0 || index >= inv.hotbar.length) return inv;
  return { ...inv, selected: index };
}

/** Reduces durability on the currently-selected hotbar tool; clears the slot at 0. Returns a new inventory. */
export function damageSelectedTool(inv, amount = 1) {
  const slot = inv.hotbar[inv.selected];
  if (!slot) return inv;
  const def = getItem(slot.itemId);
  if (!def || !def.tool) return inv;
  const nextHotbar = inv.hotbar.slice();
  const maxDur = slot.maxDurability ?? def.tool.durability;
  const cur = (slot.durability ?? maxDur) - amount;
  nextHotbar[inv.selected] = cur > 0 ? { ...slot, durability: cur, maxDurability: maxDur } : null;
  return { ...inv, hotbar: nextHotbar };
}

/** Consumes one item from the selected hotbar slot (placing a block, eating food). */
export function consumeSelected(inv) {
  const slot = inv.hotbar[inv.selected];
  if (!slot) return inv;
  const nextHotbar = inv.hotbar.slice();
  nextHotbar[inv.selected] = slot.count > 1 ? { ...slot, count: slot.count - 1 } : null;
  return { ...inv, hotbar: nextHotbar };
}

export function isFull(inv) {
  return inv.hotbar.every(Boolean) && inv.main.every(Boolean);
}
