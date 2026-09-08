/**
 * Mini Golf Journey — a self-contained casual game rendered inside the one
 * shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes, no extra containers.
 *
 * One internal screen is visible at a time:
 *   menu | levelSelect | play | complete | settings | stats
 *
 * The gameplay screen stays mounted (suspended) behind the pause→Settings
 * overlay so opening Settings mid-hole never loses the shot. Every other
 * navigation tears it down.
 *
 * All progression (unlocked levels/worlds, per-hole best strokes & stars,
 * settings, lifetime stats) lives in localStorage under `gc_minigolf_journey`.
 * Nothing here touches Classic Chess or Fishing Journey storage.
 *
 * `restartSignal` is the incrementing counter behind the GamePlayer Restart
 * button — it only restarts the CURRENT hole (ball, strokes, obstacle timers);
 * stars, bests and unlocks are never cleared.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./MiniGolfJourney.css";
import MiniGolfMenu from "./screens/MiniGolfMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import GolfGameplay from "./screens/GolfGameplay.jsx";
import LevelComplete from "./screens/LevelComplete.jsx";
import MiniGolfSettings from "./screens/MiniGolfSettings.jsx";
import MiniGolfStatistics from "./screens/MiniGolfStatistics.jsx";
import { loadState, saveState, sanitizeSettings, applyResult } from "./utils/storage.js";
import { getLevel } from "./data/levels.js";
import { getWorld } from "./data/worlds.js";
import { sfx } from "./utils/sound.js";

export default function MiniGolfJourney({ restartSignal = 0 }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [activeLevelId, setActiveLevelId] = useState(null);
  const [playNonce, setPlayNonce] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const settingsFrom = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => saveState(state), [state]);

  const level = activeLevelId != null ? getLevel(activeLevelId) : null;
  const world = level ? getWorld(level.worldId) : null;

  const goPlay = useCallback((id) => {
    setActiveLevelId(id);
    setLastResult(null);
    setPlayNonce((n) => n + 1);
    setScreen("play");
  }, []);

  const handlePlayCurrent = useCallback(() => {
    sfx.ui(stateRef.current.settings.sound);
    goPlay(stateRef.current.currentLevel || 1);
  }, [goPlay]);

  const handleComplete = useCallback((result) => {
    const lvl = getLevel(stateRef.current.currentLevel);
    const target = activeLevelId != null ? getLevel(activeLevelId) : lvl;
    const applied = applyResult(stateRef.current, target, result.strokes, result.holeInOne);
    setState(applied.state);
    setLastResult({ level: target, result, applied });
    setScreen("complete");
  }, [activeLevelId]);

  const nextLevelId = useMemo(() => {
    if (activeLevelId == null || activeLevelId >= 50) return null;
    return state.unlockedLevels.includes(activeLevelId + 1) ? activeLevelId + 1 : null;
  }, [activeLevelId, state.unlockedLevels]);

  const toMenu = useCallback(() => {
    setActiveLevelId(null);
    setScreen("menu");
  }, []);
  const toLevelSelect = useCallback(() => {
    setActiveLevelId(null);
    setScreen("levelSelect");
  }, []);
  const toStats = useCallback(() => {
    setActiveLevelId(null);
    setScreen("stats");
  }, []);

  const openSettings = useCallback((from) => {
    settingsFrom.current = from;
    setScreen("settings");
  }, []);
  const closeSettings = useCallback(() => {
    setScreen(settingsFrom.current === "play" && activeLevelId != null ? "play" : "menu");
  }, [activeLevelId]);

  const changeSettings = useCallback((patch) => {
    setState((s) => ({ ...s, settings: sanitizeSettings({ ...s.settings, ...patch }) }));
  }, []);

  const gameMounted =
    activeLevelId != null && (screen === "play" || screen === "complete" || (screen === "settings" && settingsFrom.current === "play"));
  const gameSuspended = screen !== "play";

  return (
    <div className={`mgj mgj--gfx-${state.settings.graphics} ${state.settings.animations ? "" : "mgj--no-anim"}`}>
      {screen === "menu" && (
        <MiniGolfMenu
          state={state}
          animate={state.settings.animations}
          onPlay={handlePlayCurrent}
          onNavigate={(s) => (s === "levelSelect" ? toLevelSelect() : s === "stats" ? toStats() : openSettings("menu"))}
        />
      )}

      {screen === "levelSelect" && (
        <LevelSelect state={state} onBack={toMenu} onPlayLevel={(id) => goPlay(id)} />
      )}

      {screen === "stats" && <MiniGolfStatistics state={state} onBack={toMenu} />}

      {gameMounted && (
        <div className="mgj-gamehost" hidden={screen !== "play"}>
          <GolfGameplay
            key={`${activeLevelId}:${playNonce}`}
            level={level}
            world={world}
            settings={state.settings}
            suspended={gameSuspended}
            restartSignal={restartSignal}
            onComplete={handleComplete}
            onLevelSelect={toLevelSelect}
            onMainMenu={toMenu}
            onSettings={() => openSettings("play")}
          />
        </div>
      )}

      {screen === "complete" && lastResult && (
        <LevelComplete
          level={lastResult.level}
          world={getWorld(lastResult.level.worldId)}
          result={lastResult.result}
          applied={lastResult.applied}
          soundOn={state.settings.sound}
          hasNext={nextLevelId != null}
          onNext={() => nextLevelId != null && goPlay(nextLevelId)}
          onReplay={() => goPlay(lastResult.level.id)}
          onLevelSelect={toLevelSelect}
        />
      )}

      {screen === "settings" && (
        <MiniGolfSettings
          settings={state.settings}
          onChange={changeSettings}
          onBack={closeSettings}
          backLabel={settingsFrom.current === "play" ? "Back" : "Menu"}
        />
      )}
    </div>
  );
}
