/**
 * Farm Life — a relaxing top-down 2D farming simulation. Rendered inside the shared
 * <GamePlayer> window (registered by name in src/components/games/registry.js),
 * exactly like every other Game Center title. No routes: everything below is
 * internal state.
 *
 *   loading | menu | play
 *
 * One farm per player: the save lives in IndexedDB (engine/save.js — the
 * spec calls farm state "serious persistence", too large/structured for a
 * single localStorage string). `restartSignal` is the GamePlayer Restart
 * counter; per spec a persistent-world game must never treat Restart as
 * "delete the farm" — it only snaps the player back to the farmhouse,
 * exactly like Stonewild's interpretation of the same shared control.
 * `muted` overrides in-game sound without touching the saved setting.
 */
import { useEffect, useState } from "react";
import "./FarmLife.css";

import MainMenu from "./screens/MainMenu.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import { loadFarmRecord, migrateFarmState, createNewFarmState, deleteFarmRecord } from "./engine/save.js";

export default function FarmLife({ restartSignal = 0, muted = false }) {
  const [screen, setScreen] = useState("loading");
  const [hasSave, setHasSave] = useState(false);
  const [farmState, setFarmState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadFarmRecord().then((record) => {
      if (cancelled) return;
      setHasSave(Boolean(record));
      setScreen("menu");
    });
    return () => { cancelled = true; };
  }, []);

  const startFarm = (fresh) => {
    if (fresh) {
      setFarmState(createNewFarmState());
      setScreen("play");
      return;
    }
    loadFarmRecord().then((record) => {
      setFarmState(migrateFarmState(record));
      setScreen("play");
    });
  };

  const handleResetFarm = async () => {
    await deleteFarmRecord();
    setHasSave(false);
  };

  const handleExitToMenu = () => {
    setFarmState(null);
    setScreen("menu");
    loadFarmRecord().then((record) => setHasSave(Boolean(record)));
  };

  return (
    <div className="fl-root">
      {screen === "loading" && (
        <div className="fl-loading">
          <div className="fl-loading__spinner" />
          <p>Waking up the farm…</p>
        </div>
      )}

      {screen === "menu" && (
        <MainMenu hasSave={hasSave} onContinue={() => startFarm(false)} onNewFarm={() => startFarm(true)} onResetFarm={handleResetFarm} />
      )}

      {screen === "play" && farmState && (
        <Gameplay initialState={farmState} restartSignal={restartSignal} muted={muted} onExitToMenu={handleExitToMenu} />
      )}
    </div>
  );
}
