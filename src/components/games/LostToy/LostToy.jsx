/**
 * Lost Toy — a true-3D (Three.js / React Three Fiber) adventure platformer
 * for the Game Center: guide a tiny lost toy through a gigantic house — jump,
 * climb, bounce, push, ride — and find the way home.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Screens are internal state:
 *   menu | levels | toy | memories | stats | settings | controls | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): during a level, restarts THAT level in place
 *    (saved progress, buttons from other runs and other levels are untouched).
 *    On menu screens it does nothing.
 *  - Mute (`muted`): silences music, footsteps, pets, machines, UI and
 *    ambience immediately (master gain) without touching saved volumes.
 *  - Fullscreen: GamePlayer's; the canvas only resizes — no scene, loop,
 *    listener or audio is recreated, the level carries on.
 *  - Like: untouched (handled by the Game Center).
 *
 * Progress: localStorage `lost-toy-progress` (versioned, sanitised).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./LostToy.css";
import GameScreen from "./screens/GameScreen.jsx";
import MenuStage from "./screens/MenuStage.jsx";
import { MainMenu, LevelSelect, ToyScreen, MemoriesScreen, StatsScreen } from "./screens/MenuScreens.jsx";
import { SettingsPanel, ControlsHelp } from "./screens/Menus.jsx";
import { loadProgress, saveProgress, isUnlocked, nextUnlockedLevel } from "./utils/storage.js";
import { levelById, LEVEL_COUNT } from "./data/levels/index.js";
import { worldById } from "./data/worlds.js";
import { sound } from "./audio/sound.js";
import { disposeMaterialCache } from "./three/materials.js";
import { disposeLabelMats } from "./three/props.js";
import { hasWebGL, SceneErrorBoundary } from "./utils/canvasGuard.jsx";
import { TEST } from "./utils/testHooks.js";

export default function LostToy({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(null);
  const [session, setSession] = useState(0);
  const [webgl] = useState(hasWebGL);
  const settingsRef = useRef(progress.settings);
  settingsRef.current = progress.settings;

  /** single synchronous commit point: every writer sees the latest progress */
  const updateProgress = useCallback((fn) => {
    const next = fn(progressRef.current);
    if (next && next !== progressRef.current) {
      progressRef.current = next;
      setProgress(next);
    }
  }, []);

  /* ------------------------------------------------------------ save (debounced + on hide / unmount) */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const id = setTimeout(() => saveProgress(progressRef.current), 300);
    return () => clearTimeout(id);
  }, [progress]);
  useEffect(
    () => () => {
      saveProgress(progressRef.current);
      sound.dispose();
      disposeLabelMats();
      disposeMaterialCache();
    },
    [],
  );
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && saveProgress(progressRef.current);
    const onUnload = () => saveProgress(progressRef.current);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  const settings = progress.settings;

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    sound.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  }, [settings.master, settings.music, settings.sfx]);
  useEffect(() => {
    sound.setMuted(muted);
  }, [muted]);
  const level = levelId ? levelById(levelId) : null;
  const musicKey = screen === "game" && level ? `w${level.world}${level.id === 50 ? "home" : ""}` : "menu";
  useEffect(() => {
    if (musicKey === "menu") sound.music({ mood: "menu", bpm: 84, key: 0 });
    else {
      const w = worldById(Number(musicKey[1]));
      sound.music(musicKey.endsWith("home") ? { mood: "home", bpm: 88, key: 0 } : { ...w.music });
    }
  }, [musicKey]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* ------------------------------------------------------------ touch detection */
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    } catch {
      coarse = false;
    }
    if (TEST && new URLSearchParams(window.location.search).get("lttouch") === "1") coarse = true;
    setTouch(coarse);
  }, []);

  /* ------------------------------------------------------------ navigation */
  const play = useCallback(
    (id) => {
      const p = progressRef.current;
      if (!levelById(id) || !isUnlocked(p, id)) return;
      updateProgress((q) => ({ ...q, lastLevel: id }));
      setLevelId(id);
      setSession((s) => s + 1);
      setScreen("game");
    },
    [updateProgress],
  );
  const onPlay = useCallback(() => {
    const p = progressRef.current;
    let id = p.lastLevel && isUnlocked(p, p.lastLevel) && levelById(p.lastLevel) ? p.lastLevel : nextUnlockedLevel(p);
    if (!levelById(id)) id = Math.min(LEVEL_COUNT, nextUnlockedLevel(p));
    if (!levelById(id)) id = 1;
    play(id);
  }, [play]);
  const go = useCallback((s) => setScreen(s), []);
  // DEV-only: jump straight into any level (automation)
  useEffect(() => {
    if (!TEST) return undefined;
    window.__lt = window.__lt || {};
    window.__lt.playLevel = (id) => {
      if (!levelById(id)) return false;
      setLevelId(id);
      setSession((s) => s + 1);
      setScreen("game");
      return true;
    };
    window.__lt.screen = (s) => setScreen(s);
    window.__lt.sound = sound;
    window.__lt.progress = () => progressRef.current;
    window.__lt.update = updateProgress;
    return undefined;
  }, [updateProgress]);
  const onExit = useCallback((to) => setScreen(to || "menu"), []);
  const nextId = level ? level.id + 1 : null;
  const hasNext = !!(nextId && levelById(nextId) && isUnlocked(progress, nextId));
  const onNext = useCallback(() => nextId && play(nextId), [nextId, play]);
  const onSettings = useCallback((patch) => updateProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), [updateProgress]);
  const onCosmetic = useCallback((id) => updateProgress((p) => (p.unlockedCosmetics.includes(id) ? { ...p, selectedCosmetic: id } : p)), [updateProgress]);
  const onSeenMemories = useCallback(() => updateProgress((p) => (p.newMemories && p.newMemories.length ? { ...p, newMemories: [] } : p)), [updateProgress]);

  if (!webgl) {
    return (
      <div className="lt">
        <div className="lt-error">
          <div className="lt-error__title">3D isn't available</div>
          <p>Lost Toy needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  const menuView = screen === "toy" ? "toy" : "wide";
  return (
    <div className={`lt${touch ? " lt--touch" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      <SceneErrorBoundary key={screen === "game" ? `game:${session}` : "menus"}>
        {screen !== "game" && (
          <>
            <MenuStage settingsRef={settingsRef} cosmetic={progress.selectedCosmetic} view={menuView} />
            <div className={`lt-shade lt-shade--${screen}`} />
            {screen === "menu" && <MainMenu progress={progress} onPlay={onPlay} onNav={go} />}
            {screen === "levels" && <LevelSelect progress={progress} onPlay={play} onBack={() => go("menu")} initialLevel={levelId || progress.lastLevel} />}
            {screen === "toy" && <ToyScreen progress={progress} onSelect={onCosmetic} onBack={() => go("menu")} />}
            {screen === "memories" && <MemoriesScreen progress={progress} onSeen={onSeenMemories} onBack={() => go("menu")} />}
            {screen === "stats" && <StatsScreen progress={progress} onBack={() => go("menu")} />}
            {screen === "settings" && (
              <div className="lt-overlay lt-overlay--menu">
                <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => go("menu")} />
              </div>
            )}
            {screen === "controls" && (
              <div className="lt-overlay lt-overlay--menu">
                <ControlsHelp touch={touch} onBack={() => go("menu")} />
              </div>
            )}
          </>
        )}
        {screen === "game" && level && (
          <GameScreen
            key={`${level.id}:${session}`}
            level={level}
            settings={settings}
            settingsRef={settingsRef}
            muted={muted}
            touch={touch}
            progressRef={progressRef}
            updateProgress={updateProgress}
            restartSignal={restartSignal}
            onExit={onExit}
            onNext={onNext}
            hasNext={hasNext}
            cosmetic={progress.selectedCosmetic}
            onSettings={onSettings}
          />
        )}
      </SceneErrorBoundary>
    </div>
  );
}
