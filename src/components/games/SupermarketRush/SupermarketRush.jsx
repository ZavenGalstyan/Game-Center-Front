/**
 * Supermarket Rush — a first-person 3D supermarket employee sim. Rendered
 * inside the shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is
 * internal state, exactly like the other Game Center titles.
 *
 *   menu | levels | play | complete | upgrades | statistics | settings
 *
 * All progression (unlocked levels, stars, money, upgrades, settings,
 * lifetime statistics) lives in localStorage under
 * `supermarket-rush-progress`. Nothing here touches another game's storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — Gameplay is mounted
 * with a key derived from it plus the level id, so Restart simply remounts
 * a fresh shift attempt for the CURRENT level; unlocks/stars/money/
 * statistics are untouched. `muted` comes from the GamePlayer Mute button
 * and overrides in-game sound/music without overwriting the saved setting.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "./SupermarketRush.css";

import MainMenu from "./screens/MainMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import ShiftComplete from "./screens/ShiftComplete.jsx";
import Upgrades from "./screens/Upgrades.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";

import { getLevel, TOTAL_LEVELS } from "./data/levels.js";
import { loadState, saveState, applyShiftResult, updateSettings, buyUpgrade, upgradeValue } from "./engine/storage.js";
import { sfx } from "./engine/sound.js";

export default function SupermarketRush({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [activeId, setActiveId] = useState(null);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const lastRestartRef = useRef(restartSignal);

  useEffect(() => saveState(state), [state]);

  const soundEnabled = state.settings.sfx > 0 && !muted;

  useEffect(() => {
    if (restartSignal !== lastRestartRef.current) {
      lastRestartRef.current = restartSignal;
      if (screen === "play") setAttempt((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  const level = activeId != null ? getLevel(activeId) : null;

  const go = (next) => { sfx.ui(soundEnabled); setScreen(next); };

  const openLevel = (id) => {
    if (id < 1 || id > TOTAL_LEVELS || id > state.unlockedLevel) return;
    setActiveId(id);
    setResult(null);
    setAttempt((n) => n + 1);
    setScreen("play");
  };

  const handleComplete = (run) => {
    setState((s) => applyShiftResult(s, run));
    setResult(run);
    sfx.starPop(soundEnabled);
    setScreen("complete");
  };

  const hasNext = activeId != null && activeId < TOTAL_LEVELS;

  const upgradeMults = useMemo(() => ({
    restockSpeedMult: upgradeValue(state, "restockSpeed"),
    moveSpeedMult: upgradeValue(state, "moveSpeed"),
    trolleyCapacity: Math.round(upgradeValue(state, "trolleyCapacity")),
    scannerSpeedMult: 1 / upgradeValue(state, "scannerSpeed"),
    shelfCapacityMult: upgradeValue(state, "shelfCapacity"),
  }), [state]);

  return (
    <div className="sr-root">
      {screen === "menu" && (
        <MainMenu
          state={state}
          onPlay={() => openLevel(Math.min(state.unlockedLevel, TOTAL_LEVELS))}
          onLevels={() => go("levels")}
          onUpgrades={() => go("upgrades")}
          onStatistics={() => go("statistics")}
          onSettings={() => go("settings")}
        />
      )}

      {screen === "levels" && (
        <LevelSelect state={state} onPick={openLevel} onBack={() => go("menu")} />
      )}

      {screen === "play" && level && (
        <Gameplay
          key={`level-${level.id}-${attempt}`}
          level={level}
          settings={state.settings}
          muted={muted}
          wallet={state.money}
          {...upgradeMults}
          onComplete={handleComplete}
          onExit={() => go("levels")}
          onRestart={() => setAttempt((n) => n + 1)}
          onChangeSettings={(patch) => setState((s) => updateSettings(s, patch))}
        />
      )}

      {screen === "complete" && level && result && (
        <ShiftComplete
          result={result}
          hasNext={hasNext}
          onNext={() => openLevel(activeId + 1)}
          onReplay={() => openLevel(activeId)}
          onLevels={() => go("levels")}
        />
      )}

      {screen === "upgrades" && (
        <Upgrades state={state} onBuy={(id) => { setState((s) => buyUpgrade(s, id)); sfx.purchase(soundEnabled); }} onBack={() => go("menu")} />
      )}

      {screen === "statistics" && <Statistics state={state} onBack={() => go("menu")} />}

      {screen === "settings" && (
        <Settings settings={state.settings} muted={muted} onChange={(patch) => setState((s) => updateSettings(s, patch))} onBack={() => go("menu")} />
      )}
    </div>
  );
}
