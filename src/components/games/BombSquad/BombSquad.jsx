/**
 * Bomb Squad — a fictional bomb-defusal puzzle game. Rendered inside the one
 * shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is
 * internal state, exactly like the other Game Center titles.
 *
 *   menu | select | briefing | play | complete | failed | archive | settings | stats
 *
 * All progression (unlocked missions, per-mission stars/best time/perfect,
 * discovered modules, settings, lifetime statistics) lives in localStorage
 * under `bomb-squad-progress`. Nothing here touches another game's storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — forwarded into
 * DefusalScreen, which restarts the CURRENT mission attempt only (timer,
 * strikes, module states). Unlocks, stars and statistics are never cleared
 * by it. `muted` comes from the GamePlayer Mute button and overrides the
 * in-game audio settings without overwriting them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "./BombSquad.css";

import BombMenu from "./screens/BombMenu.jsx";
import MissionSelect from "./screens/MissionSelect.jsx";
import MissionBriefing from "./screens/MissionBriefing.jsx";
import DefusalScreen from "./screens/DefusalScreen.jsx";
import MissionComplete from "./screens/MissionComplete.jsx";
import MissionFailed from "./screens/MissionFailed.jsx";
import DeviceArchive from "./screens/DeviceArchive.jsx";
import BombSettings from "./screens/BombSettings.jsx";
import BombStatistics from "./screens/BombStatistics.jsx";

import { getMission, TOTAL_MISSIONS } from "./data/missions.js";
import { loadState, saveState, applyMissionResult, updateSettings } from "./utils/storage.js";
import { starsForRun } from "./systems/scoringSystem.js";
import { sfx, Music } from "./utils/sound.js";

const MENU_SCREENS = new Set(["menu", "select", "archive", "settings", "stats"]);

export default function BombSquad({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [activeId, setActiveId] = useState(null);
  const [result, setResult] = useState(null);
  const settingsFrom = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => saveState(state), [state]);

  const settings = useMemo(
    () => ({ ...state.settings, sound: state.settings.sound && !muted, music: state.settings.music && !muted }),
    [state.settings, muted],
  );
  const mission = activeId != null ? getMission(activeId) : null;

  const musicRef = useRef(null);
  useEffect(() => {
    const m = new Music(settings.music && MENU_SCREENS.has(screen));
    m.start();
    musicRef.current = m;
    return () => m.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    musicRef.current?.setEnabled(settings.music && (MENU_SCREENS.has(screen) || screen === "briefing"));
  }, [settings.music, screen]);

  const go = (next) => { sfx.ui(stateRef.current.settings.sound && !muted); setScreen(next); };

  const openBriefing = (id) => {
    if (id < 1 || id > TOTAL_MISSIONS) return;
    setActiveId(id);
    setResult(null);
    go("briefing");
  };

  const beginDefusal = () => go("play");

  const handleComplete = (run) => {
    setState((s) => applyMissionResult(s, run));
    setResult({ ...run, stars: starsForRun(run) });
    setScreen("complete");
  };

  const handleFailed = (run) => {
    setState((s) => applyMissionResult(s, run));
    setResult(run);
    setScreen("failed");
  };

  const hasNext = activeId != null && activeId < TOTAL_MISSIONS && activeId + 1 <= state.unlockedMission;

  const openSettings = (from) => { settingsFrom.current = from; go("settings"); };

  return (
    <div className="bs" data-reduced-motion={state.settings.reducedMotion ? "1" : "0"}>
      {screen === "menu" && (
        <BombMenu
          state={state}
          onPlay={() => openBriefing(Math.min(state.unlockedMission, TOTAL_MISSIONS))}
          onMissionSelect={() => go("select")}
          onArchive={() => go("archive")}
          onStatistics={() => go("stats")}
          onSettings={() => openSettings("menu")}
        />
      )}

      {screen === "select" && (
        <MissionSelect state={state} onPick={openBriefing} onBack={() => go("menu")} />
      )}

      {screen === "briefing" && mission && (
        <MissionBriefing mission={mission} onBegin={beginDefusal} onBack={() => go("select")} />
      )}

      {screen === "play" && mission && (
        <DefusalScreen
          key={`mission-${mission.id}`}
          mission={mission}
          settings={settings}
          restartSignal={restartSignal}
          onFailed={handleFailed}
          onComplete={handleComplete}
          onExit={() => go("select")}
        />
      )}

      {screen === "complete" && mission && result && (
        <MissionComplete
          mission={mission}
          result={result}
          hasNext={hasNext}
          onNext={() => hasNext && openBriefing(activeId + 1)}
          onReplay={() => openBriefing(activeId)}
          onMissionSelect={() => go("select")}
        />
      )}

      {screen === "failed" && mission && result && (
        <MissionFailed
          mission={mission}
          result={result}
          onRetry={() => openBriefing(activeId)}
          onMissionSelect={() => go("select")}
        />
      )}

      {screen === "archive" && (
        <DeviceArchive state={state} onBack={() => go("menu")} />
      )}

      {screen === "settings" && (
        <BombSettings
          settings={state.settings}
          muted={muted}
          onChange={(next) => setState((s) => updateSettings(s, next))}
          onBack={() => go(settingsFrom.current || "menu")}
        />
      )}

      {screen === "stats" && (
        <BombStatistics state={state} onBack={() => go("menu")} />
      )}
    </div>
  );
}
