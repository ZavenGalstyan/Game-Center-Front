/**
 * Stonewild — the one gameplay store.
 *
 * Everything the frame loop writes every tick (position, break progress) AND
 * everything the UI needs to react to (health, hunger, inventory, toasts)
 * lives in one subscribe/get store, read by React via
 * `useSyncExternalStore` — same pattern as Parking Master's hudStore, just
 * grown to cover a real survival game instead of a debug readout. Mutating
 * inventory/health/hunger here (instead of scattering `useState` across
 * components) is what lets both the 60fps loop and the Inventory/Workbench
 * screens act on the exact same state without prop-drilling or stale
 * closures.
 */

import { getItem } from "./items.js";
import {
  addItem,
  removeItem,
  moveSlot,
  createEmptyInventory,
  hasAtLeast,
  consumeSelected,
  damageSelectedTool,
  selectedSlot,
} from "./inventory.js";
import { MAX_HEALTH, MAX_HUNGER } from "./constants.js";

export function createGameStore(initial = {}) {
  let state = {
    // debug (F3 only)
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    onGround: false,
    sprinting: false,
    chunks: 0,
    fps: 0,
    saveStatus: "idle", // 'idle' | 'saving' | 'saved'

    // survival
    health: MAX_HEALTH,
    hunger: MAX_HUNGER,
    dead: false,

    // inventory
    inventory: createEmptyInventory(),

    // interaction feedback
    target: null, // { x, y, z, blockId, face } — the block under the crosshair, or null
    breakProgress: 0, // 0..1 for the currently targeted block
    actionKind: null, // 'break' | 'attack' | 'place' | 'eat' — drives the held-item animation
    actionNonce: 0,

    // HUD ephemera
    toast: null, // { id, text }
    selectedName: null, // { id, text } — item name flashed above the hotbar

    // tutorial
    objectiveIndex: 0,

    ...initial,
  };

  const subs = new Set();
  let toastTimer = null;
  let nameTimer = null;

  const api = {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },

    showToast(text) {
      const id = Date.now();
      api.set({ toast: { id, text } });
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (state.toast?.id === id) api.set({ toast: null });
      }, 1600);
    },

    flashItemName(text) {
      const id = Date.now();
      api.set({ selectedName: { id, text } });
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => {
        if (state.selectedName?.id === id) api.set({ selectedName: null });
      }, 1100);
    },

    triggerAction(kind) {
      api.set({ actionKind: kind, actionNonce: state.actionNonce + 1 });
    },

    /** Adds items to inventory and announces it. Returns leftover count (0 = all added). */
    addItemToInventory(itemId, count) {
      const { inventory, leftover } = addItem(state.inventory, itemId, count);
      const added = count - leftover;
      if (added > 0) {
        api.set({ inventory });
        const def = getItem(itemId);
        api.showToast(`+${added} ${def ? def.name : itemId}`);
        if (itemId === "wildwoodLog" || itemId === "pineLog") api.advanceObjective(1);
        if (itemId === "stone") api.advanceObjective(4);
      }
      return leftover;
    },

    /** Optional survival-guide tracker — only ever moves forward. */
    advanceObjective(index) {
      if (index > state.objectiveIndex) api.set({ objectiveIndex: index });
    },

    removeItemFromInventory(itemId, count) {
      const next = removeItem(state.inventory, itemId, count);
      if (!next) return false;
      api.set({ inventory: next });
      return true;
    },

    hasItems(costs) {
      return costs.every((c) => hasAtLeast(state.inventory, c.item, c.count));
    },

    moveInventorySlot(from, to) {
      api.set({ inventory: moveSlot(state.inventory, from, to) });
    },

    selectHotbar(index) {
      if (index < 0 || index >= state.inventory.hotbar.length) return;
      api.set({ inventory: { ...state.inventory, selected: index } });
      const slot = state.inventory.hotbar[index];
      const def = slot ? getItem(slot.itemId) : null;
      api.flashItemName(def ? def.name : "Empty");
    },

    getSelectedItem() {
      const slot = selectedSlot(state.inventory);
      return slot ? { slot, def: getItem(slot.itemId) } : null;
    },

    /** Consumes one of the selected hotbar item (placing a block, eating food). */
    consumeSelectedItem() {
      api.set({ inventory: consumeSelected(state.inventory) });
    },

    /** Reduces durability on the selected tool; clears the slot at 0. */
    damageSelectedTool(amount = 1) {
      api.set({ inventory: damageSelectedTool(state.inventory, amount) });
    },

    damage(amount) {
      if (state.dead || amount <= 0) return;
      const health = Math.max(0, state.health - amount);
      api.set({ health, dead: health <= 0 });
    },

    heal(amount) {
      if (state.dead || amount <= 0) return;
      api.set({ health: Math.min(MAX_HEALTH, state.health + amount) });
    },

    setHunger(value) {
      api.set({ hunger: Math.max(0, Math.min(MAX_HUNGER, value)) });
    },

    respawn(spawn) {
      api.set({ health: MAX_HEALTH, hunger: MAX_HUNGER, dead: false });
      return spawn;
    },
  };

  return api;
}
