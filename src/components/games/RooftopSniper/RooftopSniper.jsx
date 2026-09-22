/**
 * Rooftop Sniper — a 3D precision sniper game. Rendered inside the shared
 * <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is
 * internal state, exactly like the other Game Center titles.
 *
 *   menu | missions | play | complete | failed | rifles | statistics | settings
 *
 * All progression (unlocked missions, per-mission stars/best accuracy,
 * unlocked rifles, selected rifle, settings, lifetime statistics) lives in
 * localStorage under `rooftop-sniper-progress`. Nothing here touches
 * another game's storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — Gameplay is mounted
 * with a key derived from it plus the mission id, so Restart simply
 * remounts a fresh attempt of the CURRENT mission; unlocks/stars/
 * statistics are untouched. `muted` comes from the GamePlayer Mute button
 * and overrides in-game sound without overwriting the saved setting.
 */
import { useEffect, useRef, useState } from "react";
import "./RooftopSniper.css";

import MainMenu from "./screens/MainMenu.jsx";
import MissionSelect from "./screens/MissionSelect.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import MissionComplete from "./screens/MissionComplete.jsx";
import MissionFailed from "./screens/MissionFailed.jsx";
import Rifles from "./screens/Rifles.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";

import { getMission, isMissionBuilt, TOTAL_MISSIONS } from "./data/missions.js";
import { getRifle } from "./data/rifles.js";
import {
  loadState,
  saveState,
  applyMissionResult,
  updateSettings,
  selectRifle,
} from "./engine/storage.js";

export default function RooftopSniper({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [activeId, setActiveId] = useState(null);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const lastRestartRef = useRef(restartSignal);

  useEffect(() => saveState(state), [state]);

  useEffect(() => {
    if (restartSignal !== lastRestartRef.current) {
      lastRestartRef.current = restartSignal;
      if (screen === "play") setAttempt((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  const mission = activeId != null ? getMission(activeId) : null;
  const rifle = getRifle(state.selectedRifle);

  const go = (next) => setScreen(next);

  const openMission = (id) => {
    if (id < 1 || id > TOTAL_MISSIONS || id > state.unlockedMission || !isMissionBuilt(id)) return;
    setActiveId(id);
    setResult(null);
    setAttempt((n) => n + 1);
    setScreen("play");
  };

  const handleComplete = (run) => {
    setState((s) => applyMissionResult(s, run));
    setResult(run);
    setScreen("complete");
  };
  const handleFailed = (run) => {
    setState((s) => applyMissionResult(s, run));
    setResult(run);
    setScreen("failed");
  };

  const hasNext = activeId != null && activeId < TOTAL_MISSIONS && isMissionBuilt(activeId + 1) && activeId + 1 <= state.unlockedMission;

  return (
    <div className="rs-root">
      {screen === "menu" && (
        <MainMenu
          onPlay={() => openMission(Math.min(state.unlockedMission, TOTAL_MISSIONS))}
          onMissions={() => go("missions")}
          onRifles={() => go("rifles")}
          onStatistics={() => go("statistics")}
          onSettings={() => go("settings")}
        />
      )}

      {screen === "missions" && (
        <MissionSelect state={state} onPick={openMission} onBack={() => go("menu")} />
      )}

      {screen === "play" && mission && (
        <Gameplay
          key={`mission-${mission.id}-${attempt}`}
          mission={mission}
          rifle={rifle}
          settings={state.settings}
          muted={muted}
          onComplete={handleComplete}
          onFailed={handleFailed}
          onRestartMission={() => setAttempt((n) => n + 1)}
          onExitToSelect={() => go("missions")}
        />
      )}

      {screen === "complete" && mission && result && (
        <MissionComplete
          mission={mission}
          result={result}
          hasNext={hasNext}
          onNext={() => openMission(activeId + 1)}
          onReplay={() => openMission(activeId)}
          onSelect={() => go("missions")}
        />
      )}

      {screen === "failed" && mission && result && (
        <MissionFailed
          mission={mission}
          result={result}
          onRetry={() => openMission(activeId)}
          onSelect={() => go("missions")}
        />
      )}

      {screen === "rifles" && (
        <Rifles
          state={state}
          onSelect={(id) => setState((s) => selectRifle(s, id))}
          onBack={() => go("menu")}
        />
      )}

      {screen === "statistics" && <Statistics state={state} onBack={() => go("menu")} />}

      {screen === "settings" && (
        <Settings
          settings={state.settings}
          muted={muted}
          onChange={(patch) => setState((s) => updateSettings(s, patch))}
          onBack={() => go("menu")}
        />
      )}
    </div>
  );
}
