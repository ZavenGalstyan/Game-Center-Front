/**
 * Farm Life — the one gameplay store.
 *
 * Holds every piece of DISCRETE state the HUD renders: money, inventory,
 * hotbar selection, watering can, the farm tile grid, UI flags, toasts and
 * tutorial progress. React reads it via useSyncExternalStore so a subscriber
 * only re-renders when something it cares about actually changes.
 *
 * Continuous per-frame state — player transform, chicken wander positions,
 * the game clock — deliberately does NOT live here (same split Supermarket
 * Rush uses): those live in plain refs owned by screens/Gameplay.jsx and are
 * stepped by Scene.jsx's useFrame, which would otherwise force a React
 * re-render 60 times a second for data nothing in the DOM needs reactively.
 * engine/interactions.js is what ties a ref-based system (chickens, clock)
 * to a store action (feeding a chicken changes money? no — but buying one
 * does, and that money change belongs here).
 */
import { getItem, isTool } from "../data/items.js";
import { getCrop, cropForSeed } from "../data/crops.js";
import { tillTile, plantSeed, waterTile, harvestTile, canPlant, canWater, canHarvest, tickGrowth, resetDailyWater } from "./farmGrid.js";
import { addItem, removeItem, countItem, moveSlot } from "./inventory.js";
import { buyItem, sellItem } from "./economy.js";
import { WATERING_CAN_BASE_CAPACITY } from "./constants.js";

export function createGameStore(persisted) {
  let state = {
    money: persisted.money,
    inventory: persisted.inventory,
    selectedHotbar: persisted.selectedHotbar || 0,
    wateringCan: persisted.wateringCan || { water: WATERING_CAN_BASE_CAPACITY, capacity: WATERING_CAN_BASE_CAPACITY },
    farmTiles: persisted.farmTiles,
    stats: persisted.stats,
    tutorial: {
      tilledCount: 0, plantedCount: 0, watered: false, harvested: false,
      sold: false, boughtChicken: false, fedChicken: false, collectedEgg: false, soldEgg: false,
      done: false,
      ...persisted.tutorial,
    },
    clockDisplay: { day: persisted.clock?.day ?? 1, time: "06:00 AM", season: "Spring", seasonDay: 1 },
    inventoryOpen: false,
    paused: false,
    interactPrompt: null,
    toast: null,
    chickenCount: (persisted.chickens || []).length,
  };

  const subs = new Set();
  let toastTimer = null;

  const api = {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subs.forEach((fn) => fn());
      if (patch.tutorial && !state.tutorial.done) api.checkTutorialComplete();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },

    showToast(text) {
      const id = Date.now() + Math.random();
      api.set({ toast: { id, text } });
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (state.toast?.id === id) api.set({ toast: null });
      }, 2400);
    },

    selectHotbar(i) {
      if (i < 0 || i >= state.inventory.hotbar.length) return;
      api.set({ selectedHotbar: i });
    },
    toggleInventory() {
      api.set({ inventoryOpen: !state.inventoryOpen });
    },
    setPaused(v) {
      api.set({ paused: v });
    },
    setInteractPrompt(text) {
      if (text === state.interactPrompt) return;
      api.set({ interactPrompt: text });
    },
    setInventory(inventory) {
      api.set({ inventory });
    },
    moveSlot(fromArea, fromIndex, toArea, toIndex) {
      api.set({ inventory: moveSlot(state.inventory, fromArea, fromIndex, toArea, toIndex) });
    },
    /** Grants items not obtained through farming/selling (e.g. collected eggs). */
    addItemToInventory(itemId, qty) {
      const { inv, added } = addItem(state.inventory, itemId, qty);
      if (added > 0) api.set({ inventory: inv });
      return added;
    },
    setChickenCount(n) {
      if (n === state.chickenCount) return;
      api.set({ chickenCount: n });
    },
    setClockDisplay(clockDisplay) {
      api.set({ clockDisplay });
    },

    getSelectedItem() {
      const slot = state.inventory.hotbar[state.selectedHotbar];
      return slot ? getItem(slot.itemId) : null;
    },

    // --- Farming actions ----------------------------------------------
    tillAt(index) {
      const item = api.getSelectedItem();
      if (!item || item.id !== "hoe") return false;
      const before = state.farmTiles;
      const tiles = tillTile(before, index);
      if (tiles === before) return false;
      const tutorial = { ...state.tutorial, tilledCount: state.tutorial.tilledCount + 1 };
      api.set({ farmTiles: tiles, tutorial });
      return true;
    },

    plantAt(index) {
      const slot = state.inventory.hotbar[state.selectedHotbar];
      const item = slot ? getItem(slot.itemId) : null;
      if (!item || item.category !== "seed") return false;
      if (!canPlant(state.farmTiles, index)) return false;
      const crop = cropForSeed(item.id);
      if (!crop) return false;
      const { inv } = removeItem(state.inventory, item.id, 1);
      const tiles = plantSeed(state.farmTiles, index, crop.id);
      const tutorial = { ...state.tutorial, plantedCount: state.tutorial.plantedCount + 1 };
      api.set({ inventory: inv, farmTiles: tiles, tutorial });
      return true;
    },

    waterAt(index) {
      const item = api.getSelectedItem();
      if (!item || item.id !== "wateringCan") return false;
      if (state.wateringCan.water <= 0) {
        api.showToast("Watering can is empty — refill at the well or pond.");
        return false;
      }
      if (!canWater(state.farmTiles, index)) return false;
      const tiles = waterTile(state.farmTiles, index);
      const tutorial = { ...state.tutorial, watered: true };
      api.set({ farmTiles: tiles, wateringCan: { ...state.wateringCan, water: state.wateringCan.water - 1 }, tutorial });
      return true;
    },

    refillCan() {
      if (state.wateringCan.water >= state.wateringCan.capacity) return false;
      api.set({ wateringCan: { ...state.wateringCan, water: state.wateringCan.capacity } });
      api.showToast("Watering can refilled.");
      return true;
    },

    harvestAt(index) {
      if (!canHarvest(state.farmTiles, index)) return false;
      const { tiles, cropId, yieldAmount } = harvestTile(state.farmTiles, index);
      if (!cropId) return false;
      const { inv } = addItem(state.inventory, cropId, yieldAmount);
      const stats = { ...state.stats, cropsHarvested: state.stats.cropsHarvested + yieldAmount };
      const tutorial = { ...state.tutorial, harvested: true };
      api.set({ farmTiles: tiles, inventory: inv, stats, tutorial });
      const crop = getCrop(cropId);
      api.showToast(`Harvested ${crop?.name || cropId}!`);
      return true;
    },

    tickGrowth(dt) {
      const tiles = tickGrowth(state.farmTiles, dt);
      if (tiles !== state.farmTiles) api.set({ farmTiles: tiles });
    },

    onDayRollover() {
      const tiles = resetDailyWater(state.farmTiles);
      if (tiles !== state.farmTiles) api.set({ farmTiles: tiles });
    },

    // --- Economy --------------------------------------------------------
    sell(itemId, qty) {
      const result = sellItem(state, itemId, qty);
      if (result.sold <= 0) return result;
      const stats = { ...state.stats, itemsSold: state.stats.itemsSold + result.sold };
      const tutorial = { ...state.tutorial, sold: true, soldEgg: state.tutorial.soldEgg || itemId === "egg" };
      api.set({ money: result.money, inventory: result.inventory, stats, tutorial });
      api.showToast(`Sold ${result.sold} for ${result.earned} coins.`);
      return result;
    },

    sellAllOf(itemId) {
      return api.sell(itemId, countItem(state.inventory, itemId));
    },

    buySeeds(seedItemId, qty) {
      const def = getItem(seedItemId);
      if (!def) return { bought: 0 };
      const result = buyItem(state, seedItemId, qty, def.buyPrice);
      if (result.bought <= 0) {
        api.showToast(state.money < def.buyPrice ? "Not enough coins." : "Inventory is full.");
        return result;
      }
      api.set({ money: result.money, inventory: result.inventory });
      api.showToast(`Bought ${result.bought} ${def.name}.`);
      return result;
    },

    spendMoney(amount) {
      if (state.money < amount) return false;
      api.set({ money: state.money - amount });
      return true;
    },

    markBoughtChicken() {
      api.set({ tutorial: { ...state.tutorial, boughtChicken: true } });
    },
    markFedChicken() {
      if (state.tutorial.fedChicken) return;
      api.set({ tutorial: { ...state.tutorial, fedChicken: true } });
    },
    markCollectedEgg() {
      api.set({ tutorial: { ...state.tutorial, collectedEgg: true }, stats: { ...state.stats, eggsCollected: state.stats.eggsCollected + 1 } });
    },
    checkTutorialComplete() {
      const t = state.tutorial;
      if (t.done) return;
      const complete = t.tilledCount >= 3 && t.plantedCount >= 3 && t.watered && t.harvested && t.sold && t.boughtChicken && t.fedChicken && t.collectedEgg && t.soldEgg;
      if (complete) {
        api.set({ tutorial: { ...t, done: true } });
        api.showToast("First Morning complete! The farm is yours to grow.");
      }
    },
  };

  return api;
}

export function isEquippedTool(store, toolId) {
  const item = store.getSelectedItem();
  return Boolean(item && isTool(item.id) && item.id === toolId);
}
