/**
 * Parking Master — a 3D precision parking game.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is internal
 * state, exactly like Classic Chess, Fishing Journey, Mini Golf Journey and
 * Delivery Rush.
 *
 *   menu | levels | play | result | settings | stats
 *
 * All progression (unlocked/completed levels, stars, best times, best
 * precision, selected car, settings, lifetime statistics) lives in localStorage
 * under `parking-master-progress`. Nothing here touches another game's storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — it restarts the CURRENT
 * level only (car, clock, mistakes, parking check). `muted` comes from the
 * GamePlayer Mute button and overrides the in-game audio settings without
 * overwriting them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ParkingMaster.css";

import ParkingMenu from "./screens/ParkingMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import ParkingGameplay from "./screens/ParkingGameplay.jsx";
import ParkingResults from "./screens/ParkingResults.jsx";
import ParkingSettings from "./screens/ParkingSettings.jsx";
import ParkingStatistics from "./screens/ParkingStatistics.jsx";

import { loadState, saveState, sanitizeSettings, applyRun, CAR_COLORS } from "./utils/storage.js";
import { ratePark } from "./utils/scoring.js";
import { getLevel, levelsForWorld, TOTAL_LEVELS } from "./data/levels.js";
import { getEnvironment, ENVIRONMENTS } from "./data/environments.js";
import { sfx } from "./utils/sound.js";

const colorHexOf = (id) => (CAR_COLORS.find((c) => c.id === id) || CAR_COLORS[0]).hex;

export default function ParkingMaster({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [activeId, setActiveId] = useState(null);
  const [runNonce, setRunNonce] = useState(0);
  const [result, setResult] = useState(null);
  const settingsFrom = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => saveState(state), [state]);

  /* ---------------------------------------------------------- derived */

  const level = activeId != null ? getLevel(activeId) : null;
  const env = level ? getEnvironment(level.world) : null;
  const worldName = env ? env.name : "";

  const settings = useMemo(
    () => ({
      ...state.settings,
      sound: state.settings.sound && !muted,
      music: state.settings.music && !muted,
    }),
    [state.settings, muted],
  );

  const colorHex = colorHexOf(state.selectedColor);

  // menu diorama uses the environment of the furthest world the player reached
  const menuEnvId = useMemo(() => {
    const reached = ENVIRONMENTS.filter((e) =>
      levelsForWorld(e.id).some((l) => l.id <= state.unlockedLevel),
    );
    return (reached[reached.length - 1] || ENVIRONMENTS[0]).id;
  }, [state.unlockedLevel]);

  const touch = useMemo(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)")?.matches ?? false),
    [],
  );

  /* ---------------------------------------------------------- actions */

  const go = useCallback(
    (next) => {
      sfx.ui(stateRef.current.settings.sound && !muted);
      setScreen(next);
    },
    [muted],
  );

  const startLevel = useCallback((id) => {
    const lvl = getLevel(id);
    if (!lvl) return;
    setActiveId(id);
    setResult(null);
    setRunNonce((n) => n + 1);
    setState((s) => ({ ...s, currentLevel: id }));
    setScreen("play");
  }, []);

  const playCurrent = useCallback(() => {
    sfx.ui(stateRef.current.settings.sound && !muted);
    const s = stateRef.current;
    startLevel(Math.min(s.unlockedLevel, s.currentLevel || 1));
  }, [muted, startLevel]);

  const handleComplete = useCallback(
    (runResult) => {
      const lvl = getLevel(activeId);
      if (!lvl) return;
      const collisionsEff =
        runResult.collisions + Math.round((runResult.coneHits || 0) * 0.34);
      const rated = ratePark({
        precision: runResult.precision,
        collisions: collisionsEff,
        time: runResult.time,
        parTime: lvl.parTime,
      });
      const run = { ...runResult, ...rated, success: true };
      setState((s) => applyRun(s, lvl.id, run));
      setResult({ outcome: "complete", run });
      setScreen("result");
    },
    [activeId],
  );

  const handleFail = useCallback(
    (runResult, reason) => {
      const lvl = getLevel(activeId);
      if (!lvl) return;
      setState((s) => applyRun(s, lvl.id, { ...runResult, success: false }));
      setResult({ outcome: "failed", run: { ...runResult, reason } });
      setScreen("result");
    },
    [activeId],
  );

  const nextLevel = useMemo(() => {
    if (!level) return null;
    const following = getLevel(level.id + 1);
    if (following && following.id <= state.unlockedLevel) return following.id;
    return null;
  }, [level, state.unlockedLevel]);

  const openSettings = useCallback(
    (from) => {
      settingsFrom.current = from;
      go("settings");
    },
    [go],
  );

  const changeSettings = useCallback((patch) => {
    setState((s) => ({ ...s, settings: sanitizeSettings({ ...s.settings, ...patch }) }));
  }, []);

  const toMenu = useCallback(() => {
    setActiveId(null);
    setResult(null);
    go("menu");
  }, [go]);

  /* ---------------------------------------------------------- gameplay mount */

  const sceneMounted =
    Boolean(level) &&
    (screen === "play" ||
      screen === "result" ||
      (screen === "settings" && settingsFrom.current === "play"));

  const bestRec = level ? state.levels[level.id] : null;

  return (
    <div className={`pm${touch ? " pm--touch" : ""} pm--gfx-${settings.graphics}`}>
      {screen === "menu" && (
        <ParkingMenu
          state={state}
          colorHex={colorHex}
          bodyType={state.selectedBody}
          envId={menuEnvId}
          onPlay={playCurrent}
          onLevels={() => go("levels")}
          onStats={() => go("stats")}
          onSettings={() => openSettings("menu")}
        />
      )}

      {screen === "levels" && (
        <LevelSelect
          state={state}
          initialWorld={level ? level.world : null}
          onPlay={startLevel}
          onBack={toMenu}
        />
      )}

      {sceneMounted && (
        <ParkingGameplay
          level={level}
          env={env}
          worldName={worldName}
          settings={settings}
          colorHex={colorHex}
          bodyType={state.selectedBody}
          restartSignal={restartSignal}
          runKey={runNonce}
          hidden={screen !== "play"}
          suspended={screen !== "play"}
          touch={touch}
          onComplete={handleComplete}
          onFail={handleFail}
          onReplay={() => {
            setResult(null);
            setRunNonce((n) => n + 1);
            setScreen("play");
          }}
          onExit={() => {
            setResult(null);
            go("levels");
          }}
          onMenu={toMenu}
          onSettings={() => openSettings("play")}
        />
      )}

      {screen === "result" && result && level && (
        <ParkingResults
          level={level}
          worldName={worldName}
          outcome={result.outcome}
          run={result.run}
          best={bestRec}
          hasNext={Boolean(nextLevel)}
          onNext={() => nextLevel && startLevel(nextLevel)}
          onReplay={() => startLevel(level.id)}
          onSelect={() => {
            setResult(null);
            go("levels");
          }}
        />
      )}

      {screen === "settings" && (
        <ParkingSettings
          settings={state.settings}
          selectedColor={state.selectedColor}
          selectedBody={state.selectedBody}
          onChange={changeSettings}
          onColor={(id) => setState((s) => ({ ...s, selectedColor: id }))}
          onBody={(id) => setState((s) => ({ ...s, selectedBody: id }))}
          backLabel={settingsFrom.current === "play" ? "Back" : "Menu"}
          onBack={() => {
            sfx.back(state.settings.sound && !muted);
            setScreen(settingsFrom.current === "play" && level ? "play" : "menu");
          }}
        />
      )}

      {screen === "stats" && <ParkingStatistics state={state} onBack={toMenu} />}
    </div>
  );
}

export { TOTAL_LEVELS };
