/**
 * Supermarket Rush — the one gameplay store for a shift.
 *
 * Continuous per-frame state (player position, customer transforms, the
 * held box's bob) lives in refs inside the R3F tree and never touches this
 * store — see three/StoreScene.jsx. Everything here is *discrete* UI state:
 * task progress, money, the interact prompt, guidance target, checkout
 * session, toasts. React reads it via `useSyncExternalStore` so the HUD
 * only re-renders when one of these actually changes.
 */

export function createGameStore(tasks) {
  let state = {
    tasks,
    elapsedSec: 0,
    interactPrompt: null, // string shown bottom-center, e.g. "E — PICK UP"
    heldBox: null, // { productId, count, capacity }
    pushingTrolley: false,
    trolleyLoad: [], // [{ productId, count, capacity }]
    guidance: null, // { x, z, label, kind }
    restockProgress: null, // { shelfId, pct }
    spillProgress: null, // { id, pct }
    checkout: null, // { checkoutId, customerId, items:[{productId,price,scanned}], total, scannedIndex }
    helpPrompt: null, // { customerId, question, options: [{label, correct}] }
    toast: null,
    tasksOpen: false,
    paused: false,
    finished: false,
    finishResult: null,
    satisfactionEvents: [], // running +/- log this shift
    shiftStats: {
      productsRestocked: 0,
      customersServed: 0,
      itemsScanned: 0,
      cartsCollected: 0,
      fastCheckouts: 0,
      spillsCleaned: 0,
    },
  };

  const subs = new Set();
  let toastTimer = null;

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
      const id = Date.now() + Math.random();
      api.set({ toast: { id, text } });
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (state.toast?.id === id) api.set({ toast: null });
      }, 2200);
    },

    setTasks(tasks) {
      api.set({ tasks });
    },

    addSatisfaction(delta, reason) {
      const events = [...state.satisfactionEvents, { delta, reason, t: state.elapsedSec }].slice(-200);
      api.set({ satisfactionEvents: events });
    },

    bumpStat(key, amount = 1) {
      api.set({ shiftStats: { ...state.shiftStats, [key]: (state.shiftStats[key] || 0) + amount } });
    },

    pickUpBox(productId, count, capacity) {
      api.set({ heldBox: { productId, count, capacity } });
    },
    dropBox() {
      api.set({ heldBox: null });
    },
    setHeldBoxCount(count) {
      if (!state.heldBox) return;
      api.set({ heldBox: count > 0 ? { ...state.heldBox, count } : null });
    },
  };

  return api;
}

export function currentSatisfaction(state) {
  const base = 80;
  const total = state.satisfactionEvents.reduce((sum, e) => sum + e.delta, base * 0);
  return Math.max(0, Math.min(100, base + total));
}
