/**
 * Delivery Rush — HUD data channel.
 *
 * The driving loop runs at display rate and must never trigger a React render,
 * but the HUD does need live numbers. So the loop writes into this tiny store
 * and flushes it at about 12 Hz; only the HUD subscribes, so nothing else in
 * the tree re-renders.
 *
 * `useSyncExternalStore` gives React a consistent snapshot without an effect,
 * which matters here because the store is written from inside useFrame.
 */

import { useSyncExternalStore } from "react";

export function createHudStore(initial = {}) {
  let snapshot = {
    speed: 0,
    gear: "N",
    timeLeft: 0,
    distance: 0,
    targetName: "",
    targetLabel: "",
    stage: "pickup",
    condition: 100,
    collisions: 0,
    carrying: false,
    remainingStops: 0,
    coins: 0,
    streak: 1,
    arrowAngle: 0,
    onScreen: false,
    ready: false,
    offRoad: false,
    resetting: 0,
    player: { x: 0, z: 0, yaw: 0 },
    target: { x: 0, z: 0 },
    traffic: [],
    ...initial,
  };
  const listeners = new Set();

  return {
    get: () => snapshot,
    /** Replace the snapshot. Called at the HUD's refresh rate, not per frame. */
    set(patch) {
      snapshot = { ...snapshot, ...patch };
      for (const l of listeners) l();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useHud(store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
