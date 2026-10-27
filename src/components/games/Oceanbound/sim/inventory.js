/**
 * Oceanbound — slot inventories (player bag, chests, station buffers).
 * A slot is null or { id, n, dur? } (dur = remaining uses for tools).
 * Slots 0..7 of the player bag are the hotbar.
 */
import { ITEMS } from "../data/items.js";

export const BAG_SLOTS = 32;
export const HOTBAR = 8;
export const CHEST_SLOTS = 20;

export function createInv(size) {
  return { slots: new Array(size).fill(null) };
}
const stackOf = (id) => ITEMS[id]?.stack || 1;
export function newStack(id, n = 1) {
  const it = ITEMS[id];
  const s = { id, n };
  if (it?.tool?.dur) s.dur = it.tool.dur;
  return s;
}

/** how many of `id` fit (respecting stacks) */
export function spaceFor(inv, id) {
  const max = stackOf(id);
  let s = 0;
  for (const sl of inv.slots) {
    if (!sl) s += max;
    else if (sl.id === id && max > 1) s += max - sl.n;
  }
  return s;
}

/** add items; returns the count that did not fit. Hotbar empties fill first for tools. */
export function addItem(inv, id, n = 1, preferHotbar = false) {
  if (!ITEMS[id] || n <= 0) return n;
  const max = stackOf(id);
  if (max > 1) {
    for (const sl of inv.slots) {
      if (n <= 0) break;
      if (sl && sl.id === id && sl.n < max) {
        const k = Math.min(n, max - sl.n);
        sl.n += k;
        n -= k;
      }
    }
  }
  const order = [...inv.slots.keys()];
  if (!preferHotbar && inv.slots.length > HOTBAR) {
    // materials go to the bag first, keeping the hotbar for tools
    order.sort((a, b) => (a < HOTBAR) - (b < HOTBAR) || a - b);
  }
  for (const i of order) {
    if (n <= 0) break;
    if (!inv.slots[i]) {
      const k = Math.min(n, max);
      inv.slots[i] = newStack(id, k);
      n -= k;
    }
  }
  return n;
}

export function countItem(inv, id) {
  let s = 0;
  for (const sl of inv.slots) if (sl && sl.id === id) s += sl.n;
  return s;
}
export function hasCost(inv, cost) {
  for (const k in cost) if (countItem(inv, k) < cost[k]) return false;
  return true;
}
export function missing(inv, cost) {
  const out = [];
  for (const k in cost) {
    const have = countItem(inv, k);
    if (have < cost[k]) out.push({ id: k, need: cost[k], have });
  }
  return out;
}
/** remove n of id, taking from bag slots before hotbar slots; returns removed count */
export function removeItem(inv, id, n = 1) {
  let left = n;
  const idx = [...inv.slots.keys()].sort((a, b) => (a < HOTBAR) - (b < HOTBAR) || b - a);
  for (const i of idx) {
    if (left <= 0) break;
    const sl = inv.slots[i];
    if (sl && sl.id === id) {
      const k = Math.min(left, sl.n);
      sl.n -= k;
      left -= k;
      if (sl.n <= 0) inv.slots[i] = null;
    }
  }
  return n - left;
}
export function payCost(inv, cost) {
  if (!hasCost(inv, cost)) return false;
  for (const k in cost) removeItem(inv, k, cost[k]);
  return true;
}

/** drag & drop: move / merge / swap slot a of A into slot b of B */
export function moveSlot(A, a, B, b) {
  if (A === B && a === b) return false;
  const sa = A.slots[a];
  const sb = B.slots[b];
  if (!sa) return false;
  if (sb && sb.id === sa.id && stackOf(sa.id) > 1) {
    const k = Math.min(sa.n, stackOf(sa.id) - sb.n);
    sb.n += k;
    sa.n -= k;
    if (sa.n <= 0) A.slots[a] = null;
    return true;
  }
  A.slots[a] = sb;
  B.slots[b] = sa;
  return true;
}
/** quick-move a whole slot into another inventory (shift-click) */
export function quickMove(A, a, B) {
  const sa = A.slots[a];
  if (!sa) return false;
  const max = stackOf(sa.id);
  let moved = false;
  if (max > 1) {
    for (const sl of B.slots) {
      if (sa.n <= 0) break;
      if (sl && sl !== sa && sl.id === sa.id && sl.n < max) {
        const k = Math.min(sa.n, max - sl.n);
        sl.n += k;
        sa.n -= k;
        moved = true;
      }
    }
  }
  if (sa.n <= 0) {
    A.slots[a] = null;
    return true;
  }
  const i = B.slots.indexOf(null);
  if (i >= 0) {
    B.slots[i] = sa;
    A.slots[a] = null;
    return true;
  }
  return moved;
}

export function invToJSON(inv) {
  return inv.slots.map((s) => (s ? (s.dur != null ? [s.id, s.n, s.dur] : [s.id, s.n]) : 0));
}
export function invFromJSON(arr, size) {
  const inv = createInv(size);
  if (!Array.isArray(arr)) return inv;
  for (let i = 0; i < Math.min(size, arr.length); i++) {
    const e = arr[i];
    if (!Array.isArray(e) || !ITEMS[e[0]]) continue;
    const n = Math.max(1, Math.min(stackOf(e[0]), Math.floor(+e[1] || 1)));
    const s = { id: e[0], n };
    const td = ITEMS[e[0]].tool?.dur;
    if (td) s.dur = Math.max(1, Math.min(td, Math.floor(+e[2] || td)));
    inv.slots[i] = s;
  }
  return inv;
}
