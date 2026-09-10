/**
 * Crowd Rush — a 2-value external store so the HUD (crowd count, progress,
 * phase, banners) can re-render on its own schedule without re-rendering the
 * WebGL tree every frame. The frame loop calls `set(...)` with cheap primitives;
 * React subscribes with useSyncExternalStore.
 */

export function createHudStore() {
  let state = {
    count: 0,
    progress: 0,
    phase: "run",
    enemy: null, // { count } during a battle
    banner: null, // { text, sub, key }
    paused: false,
  };
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());

  return {
    get: () => state,
    set: (patch) => {
      let changed = false;
      for (const k in patch) {
        if (state[k] !== patch[k]) changed = true;
      }
      if (!changed) return;
      state = { ...state, ...patch };
      emit();
    },
    banner: (text, sub) => {
      state = { ...state, banner: { text, sub, key: Date.now() + Math.random() } };
      emit();
    },
    subscribe: (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}
