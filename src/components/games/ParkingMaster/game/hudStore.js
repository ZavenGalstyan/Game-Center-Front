/**
 * Parking Master — tiny HUD store.
 *
 * The frame loop writes here ~60×/s; React components read it through
 * useSyncExternalStore. Values are primitives only, and the loop batches its
 * write into a single set() per frame, so a HUD re-render is one shallow diff.
 */

export function createHudStore(initial = {}) {
  let state = {
    time: 0,
    speed: 0, // km/h
    mistakes: 3,
    feedback: "idle", // idle | position | align | hold | done
    holdProgress: 0, // 0..1
    precision: 0,
    ...initial,
  };
  const subs = new Set();

  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
