/**
 * Blade Rush — a fast, precision rotating-target throwing arcade game.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is
 * internal state, exactly like Classic Chess, Fishing Journey, Mini Golf
 * Journey, Delivery Rush, Parking Master, Cake Designer, Crowd Rush and
 * Liquid Sort.
 *
 *   menu | stages | play | complete | failed | blades | settings | stats
 *
 * All progression (unlocked stages, per-stage stars + shards, blade
 * unlocks/selection, settings, lifetime statistics) lives in localStorage
 * under `blade-rush-progress`. Nothing here touches another game's storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — it restarts the
 * CURRENT stage attempt only (target rotation, embedded blades, remaining
 * blades, shards collected this attempt). Unlocks, stars and statistics are
 * never cleared by it. `muted` comes from the GamePlayer Mute button and
 * overrides the in-game audio settings without overwriting them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./BladeRush.css";

import BladeMenu from "./screens/BladeMenu.jsx";
import StageSelect from "./screens/StageSelect.jsx";
import BladeGameplay from "./screens/BladeGameplay.jsx";
import StageComplete from "./screens/StageComplete.jsx";
import StageFailed from "./screens/StageFailed.jsx";
import BladeCollection from "./screens/BladeCollection.jsx";
import BladeSettings from "./screens/BladeSettings.jsx";
import BladeStatistics from "./screens/BladeStatistics.jsx";
import UnlockToast from "./game/UnlockToast.jsx";

import { getStage, TOTAL_STAGES } from "./data/stages.js";
import { bladeById, newlyUnlockedBlades } from "./data/blades.js";
import {
  loadState, saveState, applyStageResult, starsForRun,
  selectBlade, updateSettings,
} from "./utils/storage.js";
import { sfx, Music } from "./utils/sound.js";

const MENU_SCREENS = new Set(["menu", "stages", "blades", "settings", "stats"]);

export default function BladeRush({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [activeId, setActiveId] = useState(null);
  const [result, setResult] = useState(null);
  const [unlockToast, setUnlockToast] = useState(null);
  const settingsFrom = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => saveState(state), [state]);

  const settings = useMemo(
    () => ({ ...state.settings, sound: state.settings.sound && !muted, music: state.settings.music && !muted }),
    [state.settings, muted],
  );
  const skin = bladeById(state.selectedBlade);
  const stage = activeId != null ? getStage(activeId) : null;

  const musicRef = useRef(null);
  useEffect(() => {
    const m = new Music(settings.music && MENU_SCREENS.has(screen));
    m.start();
    musicRef.current = m;
    return () => m.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    musicRef.current?.setEnabled(settings.music && (MENU_SCREENS.has(screen) || screen === "play"));
  }, [settings.music, screen]);

  const go = useCallback((next) => { sfx.ui(stateRef.current.settings.sound && !muted); setScreen(next); }, [muted]);

  const startStage = useCallback((id) => {
    if (id < 1 || id > TOTAL_STAGES) return;
    setActiveId(id);
    setResult(null);
    setScreen("play");
  }, []);

  const handleComplete = useCallback((payload) => {
    const stars = starsForRun(payload);
    setState((s) => {
      const next = applyStageResult(s, payload);
      const unlocked = newlyUnlockedBlades(s, next);
      if (unlocked.length) setUnlockToast(unlocked[unlocked.length - 1]);
      return next;
    });
    setResult({ ...payload, stars });
    setScreen("complete");
  }, []);

  const handleFailed = useCallback((payload) => {
    setState((s) => applyStageResult(s, payload));
    setResult(payload);
    setScreen("failed");
  }, []);

  const hasNext = activeId != null && activeId < TOTAL_STAGES && activeId + 1 <= state.unlockedStage;

  const openSettings = useCallback((from) => { settingsFrom.current = from; go("settings"); }, [go]);

  return (
    <div className="br">
      {screen === "menu" && (
        <BladeMenu
          state={state}
          skin={skin}
          onPlay={() => startStage(Math.min(state.unlockedStage, TOTAL_STAGES))}
          onStageSelect={() => go("stages")}
          onBlades={() => go("blades")}
          onStatistics={() => go("stats")}
          onSettings={() => openSettings("menu")}
        />
      )}

      {screen === "stages" && (
        <StageSelect state={state} onPick={startStage} onBack={() => go("menu")} />
      )}

      {screen === "play" && stage && (
        <BladeGameplay
          key={`stage-${stage.id}`}
          stage={stage}
          skin={skin}
          settings={settings}
          restartSignal={restartSignal}
          onFailed={handleFailed}
          onComplete={handleComplete}
          onExit={() => go("stages")}
        />
      )}

      {screen === "complete" && stage && result && (
        <StageComplete
          stage={stage}
          result={result}
          hasNext={hasNext}
          onNext={() => hasNext && startStage(activeId + 1)}
          onReplay={() => startStage(activeId)}
          onStageSelect={() => go("stages")}
        />
      )}

      {screen === "failed" && stage && result && (
        <StageFailed
          stage={stage}
          result={result}
          onRetry={() => startStage(activeId)}
          onStageSelect={() => go("stages")}
        />
      )}

      {screen === "blades" && (
        <BladeCollection
          state={state}
          onSelect={(id) => setState((s) => selectBlade(s, id))}
          onBack={() => go("menu")}
        />
      )}

      {screen === "settings" && (
        <BladeSettings
          settings={state.settings}
          muted={muted}
          onChange={(next) => setState((s) => updateSettings(s, next))}
          onBack={() => go(settingsFrom.current || "menu")}
        />
      )}

      {screen === "stats" && (
        <BladeStatistics state={state} onBack={() => go("menu")} />
      )}

      {unlockToast && (
        <UnlockToast
          blade={unlockToast}
          onView={() => { setUnlockToast(null); go("blades"); }}
          onDismiss={() => setUnlockToast(null)}
        />
      )}
    </div>
  );
}
