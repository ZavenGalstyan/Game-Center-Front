/**
 * Laser Maze — light-routing logic puzzle for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes: every screen is internal state.
 *
 *   menu | worlds | levels | play | settings | stats
 *
 * `restartSignal` (GamePlayer Restart) restarts the CURRENT level attempt
 * only — unlocks, stars, best moves and statistics are never touched.
 * `muted` (GamePlayer Mute) gates every sound and the music pad without
 * overwriting the saved audio preferences.
 *
 * Progress lives in localStorage under `laser-maze-progress` (see
 * utils/progress.js). Fullscreen is handled entirely by GamePlayer; nothing
 * here listens for it, so toggling it cannot remount or reset a puzzle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./LaserMaze.css";
import Backdrop from "./components/Backdrop.jsx";
import MainMenu from "./screens/MainMenu.jsx";
import WorldSelect from "./screens/WorldSelect.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import Settings from "./screens/Settings.jsx";
import Statistics from "./screens/Statistics.jsx";
import { getLevel, TOTAL_LEVELS } from "./data/index.js";
import { WORLDS, worldOf } from "./data/worlds.js";
import { loadProgress, saveProgress, applyComplete, bump, nextPlayable } from "./utils/progress.js";
import { sfx, MusicPad } from "./utils/audio.js";

export default function LaserMaze({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState("menu");
  const [worldId, setWorldId] = useState(() => worldOf(nextPlayable(progress)).id);
  const [levelId, setLevelId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [resume, setResume] = useState(null);
  const settingsBack = useRef("menu");
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => saveProgress(progress), [progress]);

  const settings = progress.settings;

  /* ------------------------------------------------------------ audio */

  useEffect(() => {
    sfx.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);

  const music = useRef(null);
  useEffect(() => {
    music.current = new MusicPad();
    return () => {
      music.current?.dispose();
      music.current = null;
      sfx.setEnabled(false);
    };
  }, []);
  const activeWorld = screen === "play" ? worldOf(levelId) : WORLDS[worldId - 1];
  useEffect(() => {
    music.current?.setWorld(activeWorld.id);
  }, [activeWorld.id]);
  useEffect(() => {
    music.current?.setEnabled(settings.music && !muted);
  }, [settings.music, muted]);

  /* ------------------------------------------------------- play time */

  useEffect(() => {
    if (screen !== "play") return undefined;
    let last = Date.now();
    const flush = () => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      if (document.visibilityState === "visible" && dt > 0 && dt < 60000) {
        setProgress((p) => bump(p, "playTimeMs", dt));
      }
    };
    const id = setInterval(flush, 15000);
    return () => {
      clearInterval(id);
      flush();
    };
  }, [screen]);

  /* --------------------------------------------------------- navigation */

  const go = useCallback((s) => {
    sfx.ui();
    setScreen(s);
  }, []);

  const startLevel = useCallback((id, { fresh = false } = {}) => {
    const p = progressRef.current;
    const cur = p.current;
    setResume(!fresh && cur && cur.levelId === id ? cur : null);
    if (fresh && cur?.levelId === id) setProgress((q) => ({ ...q, current: null }));
    setLevelId(id);
    setWorldId(worldOf(id).id);
    setAttempt((a) => a + 1);
    sfx.ui();
    setScreen("play");
  }, []);

  const playNext = useCallback(() => {
    const p = progressRef.current;
    const id = p.current && p.current.levelId <= p.unlocked ? p.current.levelId : nextPlayable(p);
    startLevel(id);
  }, [startLevel]);

  /* GamePlayer Restart → restart the current level attempt only. */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen !== "play") return;
    setResume(null);
    setProgress((p) => bump({ ...p, current: null }, "resets"));
    setAttempt((a) => a + 1);
  }, [restartSignal, screen]);

  /* ------------------------------------------------- gameplay callbacks */

  const onMove = useCallback((id, state, moves) => {
    setProgress((p) => bump({ ...p, current: { levelId: id, state, moves } }, "totalMoves"));
  }, []);
  const onUndo = useCallback((id, state, moves) => {
    setProgress((p) => bump({ ...p, current: { levelId: id, state, moves } }, "undos"));
  }, []);
  const onReset = useCallback(() => {
    setProgress((p) => bump({ ...p, current: null }, "resets"));
  }, []);
  const onHint = useCallback(() => setProgress((p) => bump(p, "hintsUsed")), []);
  const onComplete = useCallback((id, moves, stars) => {
    setProgress((p) => applyComplete(p, id, moves, stars));
  }, []);
  const onChangeSettings = useCallback((patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);

  const onNext = useCallback(() => {
    const nid = levelId + 1;
    if (nid <= TOTAL_LEVELS && nid <= progressRef.current.unlocked) startLevel(nid, { fresh: true });
    else go("levels");
  }, [levelId, startLevel, go]);
  const onReplay = useCallback(() => startLevel(levelId, { fresh: true }), [levelId, startLevel]);
  const onLevels = useCallback(() => {
    setWorldId(worldOf(levelId).id);
    go("levels");
  }, [levelId, go]);
  const onMenu = useCallback(() => go("menu"), [go]);

  /* ------------------------------------------------------------- view */

  const level = screen === "play" ? getLevel(levelId) : null;
  const world = activeWorld;
  const themeVars = useMemo(() => ({
    "--lm-bg0": world.bg0, "--lm-bg1": world.bg1, "--lm-bg2": world.bg2,
    "--lm-accent": world.accent, "--lm-accent2": world.accent2,
    "--lm-text": world.text, "--lm-dim": world.dim, "--lm-frame": world.frame,
  }), [world]);

  return (
    <div className="lm" style={themeVars} data-graphics={settings.graphics}
      data-motion={settings.reducedMotion ? "reduced" : "full"}>
      <Backdrop world={world} graphics={settings.graphics} particles={settings.particles} reducedMotion={settings.reducedMotion} />
      <div className="lm__screen" key={screen === "play" ? "play" : screen}>
        {screen === "menu" && (
          <MainMenu progress={progress} settings={settings} onPlay={playNext}
            onWorlds={() => go("worlds")} onStats={() => go("stats")}
            onSettings={() => { settingsBack.current = "menu"; go("settings"); }} />
        )}
        {screen === "worlds" && (
          <WorldSelect progress={progress} onPick={(id) => { setWorldId(id); go("levels"); }} onBack={() => go("menu")} />
        )}
        {screen === "levels" && (
          <LevelSelect progress={progress} worldId={worldId} onPlay={(id) => startLevel(id)}
            onWorld={(id) => { sfx.ui(); setWorldId(id); }} onBack={() => go("worlds")} />
        )}
        {screen === "play" && level && (
          <Gameplay
            key={`${levelId}:${attempt}`}
            level={level}
            world={world}
            settings={settings}
            muted={muted}
            bestMoves={progress.levels[levelId]?.bestMoves ?? null}
            resume={resume}
            hasNext={levelId < TOTAL_LEVELS}
            onMove={onMove}
            onUndo={onUndo}
            onReset={onReset}
            onHint={onHint}
            onComplete={onComplete}
            onNext={onNext}
            onReplay={onReplay}
            onLevels={onLevels}
            onMenu={onMenu}
            onChangeSettings={onChangeSettings}
          />
        )}
        {screen === "settings" && (
          <Settings settings={settings} muted={muted} onChange={onChangeSettings} onBack={() => go(settingsBack.current)} />
        )}
        {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
      </div>
    </div>
  );
}
