/**
 * Last Hope — item operations on the player: receive, use, equip, drop,
 * quick slots.
 */
import { ITEMS, equipSlotOf, isUsable } from "../data/items.js";
import { add, remove, resize, room, count } from "./inventory.js";
import { BASE_SLOTS } from "./inventory.js";
import { emit, dropItems } from "./damage.js";

export const QUICK = 5;

/**
 * Put items into the player's bag. Overflow lands on the ground.
 * o.gathered counts toward "gather" objectives; o.proto keeps durability.
 */
export function giveItem(G, id, n, o = {}) {
  if (n <= 0 || !ITEMS[id]) return 0;
  const it = ITEMS[id];
  const total = n;
  // a weapon or tool into an empty hand goes straight to the hand
  if (!G.equip.hand && it.w && n === 1 && !o.noEquip) {
    G.equip.hand = o.proto ? { ...o.proto, n: 1 } : { id, n: 1, d: it.dur };
    n = 0;
    emit(G, { t: "equip", id });
  }
  const left = n > 0 ? add(G.inv, id, n, o.proto || null) : 0;
  const got = total - left;
  if (left > 0) {
    dropItems(G, o.x ?? G.P.x, o.z ?? G.P.z, [{ id, n: left, ...(o.proto && o.proto.d != null ? { d: o.proto.d } : {}) }]);
    emit(G, { t: "toast", text: "Inventory full — items dropped", kind: "warn" });
  }
  if (o.gathered) G.stats.gathered[id] = (G.stats.gathered[id] || 0) + total;
  if (it.cat === "key") G.flags[`got_${id}`] = true;
  autoQuick(G, id);
  G.invVersion++;
  emit(G, { t: "pickup", id, n: got, x: o.x ?? G.P.x, z: o.z ?? G.P.z });
  return got;
}

function autoQuick(G, id) {
  const it = ITEMS[id];
  if (!(it.w || isUsable(id)) || G.quick.includes(id)) return;
  if (id === "dirty_water" || id === "raw_meat") return;
  const free = G.quick.indexOf(null);
  if (free >= 0) G.quick[free] = id;
}

export function invSize(G) {
  return BASE_SLOTS + (G.equip.pack ? ITEMS[G.equip.pack.id].slots || 0 : 0);
}

/** Eat / drink / heal from inventory slot i. Starts a short "use" action. */
export function useSlot(G, i) {
  const s = G.inv.slots[i];
  if (!s || !isUsable(s.id)) return false;
  const P = G.P;
  if (P.dead || (P.act && P.act.k !== "use")) return false;
  if (P.act) return false;
  P.act = { k: "use", t: 0, dur: 0.85, hit: 0.5, done: false, item: s.id, slot: i };
  emit(G, { t: "useStart", id: s.id });
  return true;
}

/** Apply a consumable's effect (at the use action's hit moment). */
export function applyUse(G, id) {
  const it = ITEMS[id];
  const P = G.P;
  if (remove(G.inv, id, 1) < 1) return false;
  if (it.food) P.food = Math.min(100, P.food + it.food);
  if (it.water) P.water = Math.min(100, P.water + it.water);
  if (it.stam) P.stam = Math.min(100, P.stam + it.stam);
  if (it.heal) P.hp = Math.min(P.maxHp, P.hp + it.heal);
  if (it.hp) {
    if (it.hp < 0) {
      P.hp = Math.max(1, P.hp + it.hp);
      emit(G, { t: "toast", text: id === "raw_meat" ? "Raw meat — you feel sick" : "That water tasted foul", kind: "warn" });
    } else P.hp = Math.min(P.maxHp, P.hp + it.hp);
  }
  if (it.cure) P.poison = 0;
  if (it.returns) add(G.inv, it.returns, 1);
  if (it.cat === "food") G.stats.eaten++;
  G.invVersion++;
  emit(G, { t: "used", id, cat: it.cat });
  return true;
}

/** Equip from inventory slot i (swaps with what's there). */
export function equipSlot(G, i) {
  const s = G.inv.slots[i];
  if (!s) return false;
  const slot = equipSlotOf(s.id);
  if (!slot) return false;
  const prev = G.equip[slot];
  if (slot === "pack") {
    const newSize = BASE_SLOTS + (ITEMS[s.id].slots || 0);
    G.inv.slots[i] = null;
    const over = resize(G.inv, newSize);
    G.equip.pack = s;
    if (prev) {
      const left = add(G.inv, prev.id, 1, prev);
      if (left) over.push(prev);
    }
    if (over.length) dropItems(G, G.P.x, G.P.z, over);
  } else {
    G.inv.slots[i] = prev || null;
    G.equip[slot] = s;
  }
  if (G.P.act && G.P.act.k !== "use") G.P.act = null;
  G.invVersion++;
  emit(G, { t: "equip", id: s.id, slot });
  return true;
}

export function unequip(G, slot) {
  const it = G.equip[slot];
  if (!it) return false;
  if (slot === "pack") {
    const used = G.inv.slots.filter(Boolean).length;
    if (used > BASE_SLOTS - 1) {
      emit(G, { t: "toast", text: "Make room before taking off the backpack", kind: "bad" });
      return false;
    }
    G.equip.pack = null;
    resize(G.inv, BASE_SLOTS);
    add(G.inv, it.id, 1, it);
  } else {
    if (room(G.inv, it.id) < 1) {
      emit(G, { t: "toast", text: "Inventory full", kind: "bad" });
      return false;
    }
    G.equip[slot] = null;
    add(G.inv, it.id, 1, it);
  }
  G.invVersion++;
  emit(G, { t: "unequip", id: it.id, slot });
  return true;
}

export function dropSlot(G, i, n = null) {
  const s = G.inv.slots[i];
  if (!s) return false;
  const k = n == null ? s.n : Math.min(n, s.n);
  const P = G.P;
  dropItems(G, P.x + Math.sin(P.yaw) * 0.9, P.z + Math.cos(P.yaw) * 0.9, [{ ...s, n: k }]);
  s.n -= k;
  if (s.n <= 0) G.inv.slots[i] = null;
  G.invVersion++;
  emit(G, { t: "drop", id: s.id });
  return true;
}

/** Quick slot k: equip the weapon / use the consumable bound to it. */
export function useQuick(G, k) {
  const id = G.quick[k];
  if (!id) return false;
  if (G.equip.hand?.id === id) {
    // tapping the equipped weapon holsters it
    return unequip(G, "hand");
  }
  const i = G.inv.slots.findIndex((s) => s && s.id === id);
  if (i < 0) {
    emit(G, { t: "toast", text: `No ${ITEMS[id].name} left`, kind: "warn" });
    return false;
  }
  if (ITEMS[id].w || ITEMS[id].cat === "armor") return equipSlot(G, i);
  return useSlot(G, i);
}

export function haveItem(G, id) {
  if (count(G.inv, id) > 0) return true;
  return Object.values(G.equip).some((e) => e && e.id === id);
}
