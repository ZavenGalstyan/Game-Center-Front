/**
 * Crowd Rush — a 3D arcade crowd-runner.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is internal
 * state, exactly like Classic Chess, Fishing Journey, Mini Golf Journey,
 * Delivery Rush, Parking Master and Cake Designer.
 *
 *   menu | levels | play | result | settings | stats
 *
 * All progression (unlocked levels, per-level stars + best crowd + best score,
 * crowd colour, trail, coins, settings, lifetime statistics) lives in
 * localStorage under `crowd-rush-progress`. Nothing here touches another game's
 * storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — it restarts the CURRENT
 * level only (crowd, positions, gates, obstacles, enemies, progress). Stars,
 * unlocks, settings and statistics are never cleared by it.
 *
 * `muted` comes from the GamePlayer Mute button and overrides the in-game audio
 * settings without overwriting them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./CrowdRush.css";

import CrowdMenu from "./screens/CrowdMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import CrowdGameplay from "./screens/CrowdGameplay.jsx";
import CrowdResults from "./screens/CrowdResults.jsx";
import CrowdSettings from "./screens/CrowdSettings.jsx";
import CrowdStatistics from "./screens/CrowdStatistics.jsx";

import { loadState, saveState, applyRun, colorOf } from "./utils/storage.js";
import { getLevel, TOTAL_LEVELS } from "./data/levels.js";
import { getWorld, worldForLevel } from "./data/worlds.js";
import { nextLevelId } from "./utils/progression.js";
import { sfx, Music } from "./utils/sound.js";

export default function CrowdRush({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [activeId, setActiveId] = useState(null);
  const [runNonce, setRunNonce] = useState(0);
  const [result, setResult] = useState(null);
  const settingsFrom = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => saveState(state), [state]);

  /* -------------------------------------------------------------- derived */

  const level = activeId != null ? getLevel(activeId) : null;
  const world = level ? getWorld(level.world) : getWorld("sunny-park");
  const colorHex = colorOf(state.selectedColor).hex;

  const settings = useMemo(
    () => ({
      ...state.settings,
      sound: state.settings.sound && !muted,
      music: state.settings.music && !muted,
    }),
    [state.settings, muted],
  );

  const touch = useMemo(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)")?.matches ?? false),
    [],
  );

  /* --------------------------------------------------------------- music */

  const musicRef = useRef(null);
  useEffect(() => {
    const m = new Music(settings.music && (screen === "menu" || screen === "play"));
    m.start();
    musicRef.current = m;
    return () => m.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    musicRef.current?.setEnabled(settings.music && (screen === "menu" || screen === "play"));
  }, [settings.music, screen]);

  /* -------------------------------------------------------------- actions */

  const go = useCallback(
    (next) => {
      sfx.ui(stateRef.current.settings.sound && !muted);
      setScreen(next);
    },
    [muted],
  );

  const startLevel = useCallback((id) => {
    if (id < 1 || id > TOTAL_LEVELS) return;
    setActiveId(id);
    setResult(null);
    setRunNonce((n) => n + 1);
    setScreen("play");
  }, []);

  const handlePlay = useCallback(() => {
    sfx.ui(stateRef.current.settings.sound && !muted);
    startLevel(nextLevelId(stateRef.current));
  }, [muted, startLevel]);

  const handleResult = useCallback((res) => {
    setResult(res);
    setState((s) =>
      applyRun(s, {
        levelId: res.levelId,
        success: res.success,
        finalCrowd: res.finalCrowd,
        score: res.score,
        stars: res.stars,
        coins: res.coins,
        runnersCollected: res.runnersCollected,
        runnersLost: res.runnersLost,
        enemiesDefeated: res.enemiesDefeated,
        bossDefeated: res.bossDefeated,
      }),
    );
    setScreen("result");
  }, []);

  // GamePlayer Restart — restart the current level in place
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play" && activeId != null) {
      setResult(null);
      setRunNonce((n) => n + 1);
    } else if (screen === "result" && activeId != null) {
      setResult(null);
      setRunNonce((n) => n + 1);
      setScreen("play");
    }
  }, [restartSignal, screen, activeId]);

  const openSettings = useCallback(
    (from) => {
      settingsFrom.current = from;
      go("settings");
    },
    [go],
  );

  const nextAfterResult = useMemo(() => {
    if (!result?.success || activeId == null) return null;
    const n = activeId + 1;
    return n <= TOTAL_LEVELS && n <= state.unlockedLevel ? n : null;
  }, [result, activeId, state.unlockedLevel]);

  /* --------------------------------------------------------------- render */

  return (
    <div className="cr">
      {screen === "menu" && (
        <CrowdMenu
          state={state}
          colorHex={colorHex}
          onPlay={handlePlay}
          onLevels={() => go("levels")}
          onStats={() => go("stats")}
          onSettings={() => openSettings("menu")}
        />
      )}

      {screen === "levels" && (
        <LevelSelect
          state={state}
          onPick={startLevel}
          onBack={() => go("menu")}
        />
      )}

      {screen === "play" && level && (
        <CrowdGameplay
          level={level}
          world={world}
          colorHex={colorHex}
          settings={settings}
          runKey={runNonce}
          touch={touch}
          onResult={handleResult}
          onQuit={() => go("levels")}
        />
      )}

      {screen === "result" && result && level && (
        <CrowdResults
          level={level}
          world={world}
          result={result}
          state={state}
          hasNext={Boolean(nextAfterResult)}
          onNext={() => nextAfterResult && startLevel(nextAfterResult)}
          onReplay={() => startLevel(activeId)}
          onLevels={() => go("levels")}
          onMenu={() => go("menu")}
        />
      )}

      {screen === "settings" && (
        <CrowdSettings
          state={state}
          setState={setState}
          muted={muted}
          onBack={() => go(settingsFrom.current)}
        />
      )}

      {screen === "stats" && (
        <CrowdStatistics state={state} onBack={() => go("menu")} />
      )}
    </div>
  );
}
