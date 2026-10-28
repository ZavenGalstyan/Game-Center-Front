/**
 * Last Hope — slot inventories (player bag, storage chests, containers).
 * A slot is null or { id, n, d? } — `d` is remaining durability for items
 * that wear out (stack 1).
 */
import { ITEMS } from "../data/items.js";

export const BASE_SLOTS = 20;

export function makeInv(size) {
  return { slots: Array(size).fill(null) };
}
export const stackOf = (id) => ITEMS[id]?.stack || 1;
export const newItem = (id, n = 1) => {
  const it = { id, n };
  if (ITEMS[id]?.dur) it.d = ITEMS[id].dur;
  return it;
};

export function count(inv, id) {
  let n = 0;
  for (const s of inv.slots) if (s && s.id === id) n += s.n;
  return n;
}

/** How many of `id` fit. */
export function room(inv, id) {
  const st = stackOf(id);
  let r = 0;
  for (const s of inv.slots) {
    if (!s) r += st;
    else if (s.id === id && st > 1) r += st - s.n;
  }
  return r;
}

/**
 * Add n of id (or a prepared item object with durability). Fills existing
 * stacks first. Returns how many did NOT fit.
 */
export function add(inv, id, n = 1, proto = null) {
  const st = stackOf(id);
  if (st > 1)
    for (const s of inv.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < st) {
        const k = Math.min(n, st - s.n);
        s.n += k;
        n -= k;
      }
    }
  for (let i = 0; i < inv.slots.length && n > 0; i++) {
    if (inv.slots[i]) continue;
    const k = Math.min(n, st);
    const it = proto ? { ...proto, n: k } : newItem(id, k);
    inv.slots[i] = it;
    n -= k;
  }
  return n;
}

/** Remove n of id (smallest stacks first). Returns how many were removed. */
export function remove(inv, id, n = 1) {
  let got = 0;
  const idxs = inv.slots.map((s, i) => (s && s.id === id ? i : -1)).filter((i) => i >= 0);
  idxs.sort((a, b) => inv.slots[a].n - inv.slots[b].n);
  for (const i of idxs) {
    if (got >= n) break;
    const s = inv.slots[i];
    const k = Math.min(s.n, n - got);
    s.n -= k;
    got += k;
    if (s.n <= 0) inv.slots[i] = null;
  }
  return got;
}

export function hasAll(inv, cost, extra = null) {
  for (const [id, n] of Object.entries(cost)) if (count(inv, id) + (extra ? count(extra, id) : 0) < n) return false;
  return true;
}

/**
 * Move a slot between inventories (drag & drop). Merges equal stacks,
 * otherwise swaps. `n` < full stack splits.
 */
export function moveSlot(a, ai, b, bi, n = null) {
  const s = a.slots[ai];
  if (!s) return false;
  if (a === b && ai === bi) return false;
  const t = b.slots[bi];
  const amount = n == null ? s.n : Math.min(n, s.n);
  if (!t) {
    if (amount === s.n) {
      b.slots[bi] = s;
      a.slots[ai] = null;
    } else {
      b.slots[bi] = { ...s, n: amount };
      s.n -= amount;
    }
    return true;
  }
  if (t.id === s.id && stackOf(s.id) > 1) {
    const k = Math.min(amount, stackOf(s.id) - t.n);
    if (k <= 0) return false;
    t.n += k;
    s.n -= k;
    if (s.n <= 0) a.slots[ai] = null;
    return true;
  }
  if (amount !== s.n) return false;
  b.slots[bi] = s;
  a.slots[ai] = t;
  return true;
}

/** Quick transfer of a whole slot into another inventory. Returns moved count. */
export function transfer(a, ai, b) {
  const s = a.slots[ai];
  if (!s) return 0;
  const before = s.n;
  const left = add(b, s.id, s.n, s);
  if (left <= 0) a.slots[ai] = null;
  else s.n = left;
  return before - left;
}

/** Move everything that fits from a to b. */
export function takeAll(a, b) {
  let moved = 0;
  for (let i = 0; i < a.slots.length; i++) if (a.slots[i]) moved += transfer(a, i, b);
  return moved;
}

/** Resize keeping items; returns overflow items that no longer fit. */
export function resize(inv, size) {
  const items = inv.slots.filter(Boolean);
  const over = [];
  if (inv.slots.length > size) {
    const kept = inv.slots.slice(0, size);
    for (const s of inv.slots.slice(size)) if (s) over.push(s);
    inv.slots = kept;
    // compact overflow into free kept slots
    for (let k = over.length - 1; k >= 0; k--) {
      const free = inv.slots.indexOf(null);
      if (free < 0) break;
      inv.slots[free] = over.pop();
    }
  } else while (inv.slots.length < size) inv.slots.push(null);
  void items;
  return over;
}

export function sortInv(inv) {
  const order = ["weapon", "tool", "armor", "ammo", "medical", "food", "resource", "key", "misc"];
  const items = inv.slots.filter(Boolean);
  // merge stacks
  const merged = [];
  for (const it of items) {
    const st = stackOf(it.id);
    const m = st > 1 && merged.find((x) => x.id === it.id && x.n < st);
    if (m) {
      const k = Math.min(it.n, st - m.n);
      m.n += k;
      it.n -= k;
      if (it.n > 0) merged.push(it);
    } else merged.push(it);
  }
  merged.sort((a, b) => order.indexOf(ITEMS[a.id]?.cat) - order.indexOf(ITEMS[b.id]?.cat) || a.id.localeCompare(b.id) || b.n - a.n);
  inv.slots = inv.slots.map((_, i) => merged[i] || null);
}
