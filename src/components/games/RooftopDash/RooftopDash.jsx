/**
 * Rooftop Dash — a true-3D (Three.js / React Three Fiber) third-person parkour
 * platformer for the Game Center: run, jump, vault, slide, wall run, wall
 * jump and dash across five city districts.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Screens are internal state:
 *   menu | levels | runner | stats | settings | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): during a level, restarts THAT level in place
 *    (progress, stars and best times are untouched). On menu screens it does
 *    nothing.
 *  - Mute (`muted`): silences music, footsteps, parkour sounds, UI and
 *    ambience immediately (master gain) without touching saved volumes.
 *  - Fullscreen: GamePlayer's; the canvas only resizes — no scene, loop,
 *    listener or audio is recreated, the run carries on.
 *
 * Progress: localStorage `rooftop-dash-progress` (versioned, sanitised).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./RooftopDash.css";
import MenuStage from "./screens/MenuStage.jsx";
import GameScreen from "./screens/GameScreen.jsx";
import { MainMenu, LevelSelect, RunnerScreen, StatsScreen, SettingsPanel } from "./screens/Menus.jsx";
import { loadProgress, saveProgress, isUnlocked, nextUnlockedLevel } from "./utils/storage.js";
import { LEVELS, levelById } from "./data/levels/index.js";
import { worldById } from "./data/worlds.js";
import { sound } from "./audio/sound.js";
import { disposeMaterialCache } from "./three/materials.js";
import { disposePropCache } from "./three/props.js";
import { hasWebGL, SceneErrorBoundary } from "./utils/canvasGuard.jsx";
import { TEST } from "./utils/testHooks.js";

export default function RooftopDash({ restartSignal = 0, muted = false }) {
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

  /* ------------------------------------------------------------ save (debounced + on unmount) */
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
      disposePropCache();
      disposeMaterialCache();
    },
    [],
  );
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && saveProgress(progressRef.current);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, []);

  const settings = progress.settings;

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    sound.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  }, [settings.master, settings.music, settings.sfx]);
  useEffect(() => {
    sound.setMuted(muted);
    if (muted) sound.stopLoops();
  }, [muted]);
  const level = levelId ? levelById(levelId) : null;
  const musicWorld = screen === "game" && level ? worldById(level.world) : null;
  useEffect(() => {
    if (musicWorld) sound.music({ ...musicWorld.music, menu: false });
    else sound.music({ bpm: 86, key: 0, mood: "warm", menu: true });
  }, [musicWorld]);
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
  const rootRef = useRef(null);
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    } catch {
      coarse = false;
    }
    if (TEST && new URLSearchParams(window.location.search).get("rdtouch") === "1") coarse = true;
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
    let id = p.lastLevel && isUnlocked(p, p.lastLevel) ? p.lastLevel : nextUnlockedLevel(p);
    if (!levelById(id)) id = LEVELS[LEVELS.length - 1].id;
    play(id);
  }, [play]);
  const go = useCallback((s) => setScreen(s), []);
  // DEV-only: jump straight into any level (automation)
  useEffect(() => {
    if (!TEST) return undefined;
    window.__rd = window.__rd || {};
    window.__rd.playLevel = (id) => {
      if (!levelById(id)) return false;
      setLevelId(id);
      setSession((s) => s + 1);
      setScreen("game");
      return true;
    };
    window.__rd.screen = (s) => setScreen(s);
    window.__rd.sound = sound;
    window.__rd.progress = () => progressRef.current;
    return undefined;
  }, []);
  const onExit = useCallback((to) => {
    setScreen(to || "menu");
  }, []);
  const nextId = level ? level.id + 1 : null;
  const hasNext = !!(nextId && levelById(nextId) && isUnlocked(progress, nextId));
  const onNext = useCallback(() => nextId && play(nextId), [nextId, play]);
  const onSettings = useCallback((patch) => updateProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), [updateProgress]);

  // menu backdrop: the furthest district reached
  let bw = 1;
  for (const L of LEVELS) if (progress.completed[L.id]) bw = Math.max(bw, L.world);
  const menuWorld = Math.min(bw, 5);

  if (!webgl) {
    return (
      <div ref={rootRef} className="rd">
        <div className="rd-error">
          <div className="rd-error__title">3D isn't available</div>
          <p>Rooftop Dash needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`rd${touch ? " rd--touch" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      <SceneErrorBoundary key={screen === "game" ? `game:${session}` : "menus"}>
        {screen !== "game" && (
          <>
            <MenuStage worldId={menuWorld} settingsRef={settingsRef} outfit={progress.cosmetics.outfit} trail={progress.cosmetics.trail} view={screen === "runner" ? "runner" : "wide"} />
            <div className={`rd-shade rd-shade--${screen}`} />
            {screen === "menu" && <MainMenu progress={progress} onPlay={onPlay} onNav={go} />}
            {screen === "levels" && <LevelSelect progress={progress} onPlay={play} onBack={() => go("menu")} />}
            {screen === "runner" && <RunnerScreen progress={progress} onSelect={(c) => updateProgress((p) => ({ ...p, cosmetics: { ...p.cosmetics, ...c } }))} onBack={() => go("menu")} />}
            {screen === "stats" && <StatsScreen progress={progress} onBack={() => go("menu")} />}
            {screen === "settings" && <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => go("menu")} />}
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
            outfit={progress.cosmetics.outfit}
            trail={progress.cosmetics.trail}
            onSettings={onSettings}
          />
        )}
      </SceneErrorBoundary>
    </div>
  );
}
