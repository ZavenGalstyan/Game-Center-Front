import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../lib/api.js";

/**
 * Shared game-types list (GET /api/game-types — public, sorted by name).
 * Used by the sidebar navigation and the admin game/game-type screens.
 */
const GameTypesContext = createContext(null);

export function GameTypesProvider({ children }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listGameTypes();
      setTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load game types");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
