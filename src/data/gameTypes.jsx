import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../lib/api.js";
import { cacheEpoch, readCache, writeCache } from "../lib/queryCache.js";

/**
 * Shared game-types list (GET /api/game-types — public, sorted by name).
 * Used by the sidebar navigation and the admin game/game-type screens.
 *
 * The last list is kept in the public query cache (memory + storage), so the
 * sidebar paints at once on a repeat visit and is revalidated in the
 * background when older than TYPES_FRESH_MS. `reload({ fresh: true })` (after
 * an admin create/update/delete) bypasses the browser's HTTP cache as well.
 */
const GameTypesContext = createContext(null);

const TYPES_KEY = "types";
const TYPES_FRESH_MS = 60_000;

export function GameTypesProvider({ children }) {
  const [initial] = useState(() => readCache(TYPES_KEY, { persist: true, maxAge: TYPES_FRESH_MS }));
  const [types, setTypes] = useState(() => initial?.data ?? []);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState(null);
  const hasTypes = useRef(Boolean(initial));
  // Only the latest reload may apply its answer (a mount-time revalidation
  // must not overwrite the list fetched right after an admin change).
  const seq = useRef(0);

  const reload = useCallback(async ({ fresh = false } = {}) => {
    const mine = ++seq.current;
    const epoch = cacheEpoch();
    if (!hasTypes.current) setLoading(true);
    setError(null);
    try {
      const data = await api.listGameTypes({ fresh });
      if (mine !== seq.current) return;
      const list = Array.isArray(data) ? data : [];
      writeCache(TYPES_KEY, list, { persist: true, sinceEpoch: epoch });
      hasTypes.current = true;
      setTypes(list);
    } catch (err) {
      if (mine === seq.current) setError(err.message || "Could not load game types");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initial?.fresh) reload();
  }, [initial, reload]);

  const value = useMemo(() => {
    const byId = Object.fromEntries(types.map((t) => [t.id, t]));
    return { types, byId, loading, error, reload };
  }, [types, loading, error, reload]);

  return (
    <GameTypesContext.Provider value={value}>{children}</GameTypesContext.Provider>
  );
}

export function useGameTypes() {
  const ctx = useContext(GameTypesContext);
  if (!ctx) throw new Error("useGameTypes must be used within a GameTypesProvider");
  return ctx;
}
