/**
 * Ball Adventure 3D — a 3D rolling-ball platformer. Rendered inside the
 * shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js), exactly like every other Game Center
 * title. No routes: everything below is internal state.
 *
 *   menu | worlds | levels | balls | settings | stats | play
 *
 * All progression (unlocked levels, stars/crystals/best-times per level,
 * selected skin, settings, lifetime stats) lives in localStorage under
 * `ball-adventure-3d-progress` — see engine/storage.js.
 *
 * `restartSignal` is the GamePlayer Restart button. It only means something
 * while a level is on screen, where it restarts THAT level (ball, crystals,
 * checkpoints, timer) without touching saved progression — see
 * screens/LevelWorld.jsx, which is fully remounted (via `attemptKey`) to
 * guarantee no leaked physics state between attempts.
 *
 * `muted` overrides in-game sound without touching the saved setting.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./BallAdventure3D.css";

import MainMenu from "./screens/MainMenu.jsx";
import WorldSelect from "./screens/WorldSelect.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import BallsScreen from "./screens/BallsScreen.jsx";
import Settings from "./screens/Settings.jsx";
import Statistics from "./screens/Statistics.jsx";
import LevelWorld from "./screens/LevelWorld.jsx";

import { loadState, saveState, recordLevelResult, totalStars } from "./engine/storage.js";
import { getLevel, levelExists } from "./data/levels/index.js";
import { getWorld, getWorldForLevel, WORLDS } from "./data/worlds.js";
import { getSkin } from "./data/skins.js";

export default function BallAdventure3D({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [worldId, setWorldId] = useState(WORLDS[0].id);
  const [levelId, setLevelId] = useState(null);
  const [attemptKey, setAttemptKey] = useState(0);

  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => { saveState(progress); }, [progress]);

  const touch = useMemo(
    () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)")?.matches ?? false),
    [],
  );

  // GamePlayer Restart restarts the current level attempt only.
  const seenRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seenRestart.current) return;
    seenRestart.current = restartSignal;
    if (screen === "play") setAttemptKey((k) => k + 1);
  }, [restartSignal, screen]);

  const handleLevelComplete = useCallback((finishedLevelId, payload, delta) => {
    setProgress((prev) => {
      let next = prev;
      if (delta) {
        const stats = { ...next.stats };
        for (const [k, v] of Object.entries(delta)) stats[k] = (stats[k] || 0) + v;
        next = { ...next, stats };
      }
      if (finishedLevelId != null && payload) {
        next = recordLevelResult(next, finishedLevelId, payload);
      }
      return next;
    });
  }, []);

  const openLevel = useCallback((id) => {
    setLevelId(id);
    setAttemptKey((k) => k + 1);
    setScreen("play");
  }, []);

  const playLatest = useCallback(() => {
    const id = Math.min(progressRef.current.highestUnlockedLevel, 100);
    openLevel(levelExists(id) ? id : 1);
  }, [openLevel]);

  const stars = totalStars(progress);
  const skin = getSkin(progress.selectedSkin);

  let body = null;
  if (screen === "menu") {
    body = (
      <MainMenu
        skin={skin}
        onPlay={playLatest}
        onWorlds={() => setScreen("worlds")}
        onBalls={() => setScreen("balls")}
        onStats={() => setScreen("stats")}
        onSettings={() => setScreen("settings")}
      />
    );
  } else if (screen === "worlds") {
    body = (
      <WorldSelect
        progress={progress}
        totalStars={stars}
        onOpenWorld={(w) => { setWorldId(w.id); setScreen("levels"); }}
        onBack={() => setScreen("menu")}
      />
    );
  } else if (screen === "levels") {
    body = (
      <LevelSelect
        world={getWorld(worldId)}
        progress={progress}
        onPlayLevel={openLevel}
        onBack={() => setScreen("worlds")}
      />
    );
  } else if (screen === "balls") {
    body = (
      <BallsScreen
        progress={progress}
        totalStars={stars}
        onSelectSkin={(id) => setProgress((p) => ({ ...p, selectedSkin: id }))}
        onBack={() => setScreen("menu")}
      />
    );
  } else if (screen === "settings") {
    body = (
      <Settings
        settings={progress.settings}
        onChange={(patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } }))}
        onBack={() => setScreen("menu")}
      />
    );
  } else if (screen === "stats") {
    body = <Statistics progress={progress} onBack={() => setScreen("menu")} />;
  } else if (screen === "play" && levelId != null && levelExists(levelId)) {
    const level = getLevel(levelId);
    const world = getWorldForLevel(levelId);
    const rec = progress.levels[levelId];
    body = (
      <LevelWorld
        key={`${levelId}:${attemptKey}`}
        level={level}
        world={world}
        skin={skin}
        settings={progress.settings}
        muted={muted}
        touch={touch}
        levelIndexInWorld={levelId - world.levelStart + 1}
        bestTime={rec?.bestTime ?? null}
        hasNext={levelExists(levelId + 1)}
        onLevelComplete={handleLevelComplete}
        onExit={() => { setWorldId(world.id); setScreen("levels"); }}
        onNext={() => openLevel(levelId + 1)}
        onReplay={() => setAttemptKey((k) => k + 1)}
        onSettingsChange={(patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } }))}
      />
    );
  }

  return <div className="ba3d-root">{body}</div>;
}
