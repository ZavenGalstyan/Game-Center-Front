/**
 * Dimension Dash — a hybrid 2.5D / full-3D high-speed platformer (Three.js /
 * React Three Fiber) for the Game Center. Classic side-view sections and
 * free-roaming 3D sections live in ONE world; glowing shift gates switch the
 * camera, the controls and the movement rules between them.
 *
 * Personal fan-made prototype — not an official SEGA product. The hedgehog
 * is an original procedural model, all audio is synthesised; character and
 * branding rights must be resolved before any public distribution.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Screens are internal state:
 *   menu | levels | howto | settings | stats | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): during a level, restarts THAT level in place;
 *    on menu screens it does nothing.
 *  - Mute (`muted`): master gain → 0 immediately (music, effects, UI);
 *    saved volumes are untouched.
 *  - Fullscreen: GamePlayer's; the canvas only resizes.
 *  - Like: untouched (handled by the Game Center).
 *
 * Progress: localStorage `dimension-dash-progress` (versioned, sanitised).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./DimensionDash.css";
import GameScreen from "./screens/GameScreen.jsx";
import MenuStage from "./screens/MenuStage.jsx";
import { MainMenu, LevelSelect, StatsScreen, SettingsPanel, HowToPlay } from "./screens/Menus.jsx";
import { loadProgress, saveProgress, isUnlocked, nextUnlockedLevel } from "./utils/storage.js";
import { levelById, BUILT } from "./data/levels/index.js";
import { sound } from "./audio/sound.js";
import { hasWebGL, SceneErrorBoundary } from "./utils/canvasGuard.jsx";
import { TEST } from "./utils/testHooks.js";

export default function DimensionDash({ restartSignal = 0, muted = false }) {
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
  useEffect(() => {
    if (screen !== "game") {
      sound.setPaused(false);
      sound.music({ mood: "menu", bpm: 140, key: 3 });
    }
  }, [screen]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* ------------------------------------------------------------ navigation */
  const play = useCallback(
    (id) => {
      const p = progressRef.current;
      if (!levelById(id) || !isUnlocked(p, id)) {
        sound.denied();
        return;
      }
      updateProgress((q) => ({ ...q, lastLevel: id }));
      setLevelId(id);
      setSession((s) => s + 1);
      setScreen("game");
    },
    [updateProgress],
  );
  const onPlay = useCallback(() => {
    const p = progressRef.current;
    let id = p.lastLevel && isUnlocked(p, p.lastLevel) && levelById(p.lastLevel) ? p.lastLevel : nextUnlockedLevel(p, BUILT);
    if (!levelById(id)) id = BUILT.filter((b) => isUnlocked(p, b)).pop() || 1;
    play(id);
  }, [play]);
  const go = useCallback((s) => setScreen(s), []);
  const onExit = useCallback((to) => setScreen(to || "menu"), []);
  const level = levelId ? levelById(levelId) : null;
  const nextId = level ? level.meta.id + 1 : null;
  const hasNext = !!(nextId && levelById(nextId) && isUnlocked(progress, nextId));
  const onNext = useCallback(() => nextId && play(nextId), [nextId, play]);
  const onSettings = useCallback((patch) => updateProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), [updateProgress]);

  // DEV-only automation
  useEffect(() => {
    if (!TEST) return undefined;
    window.__dd = window.__dd || {};
    Object.assign(window.__dd, {
      playLevel: (id) => {
        if (!levelById(id)) return false;
        setLevelId(id);
        setSession((s) => s + 1);
        setScreen("game");
        return true;
      },
      screen: (s) => setScreen(s),
      sound,
      progress: () => progressRef.current,
      update: updateProgress,
    });
    return undefined;
  }, [updateProgress]);

  if (!webgl) {
    return (
      <div className="dd">
        <div className="dd-error">
          <div className="dd-error__title">3D isn't available</div>
          <p>Dimension Dash needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dd" data-motion={settings.reducedMotion ? "reduced" : "full"}>
      <SceneErrorBoundary key={screen === "game" ? `game:${session}` : "menus"}>
        {screen !== "game" && (
          <>
            <MenuStage settingsRef={settingsRef} />
            <div className={`dd-shade dd-shade--${screen}`} />
            {screen === "menu" && <MainMenu progress={progress} onPlay={onPlay} onNav={go} />}
            {screen === "levels" && <LevelSelect progress={progress} onPlay={play} onBack={() => go("menu")} initialWorld={level ? level.meta.world : Math.ceil((progress.lastLevel || 1) / 6)} />}
            {screen === "stats" && <StatsScreen progress={progress} onBack={() => go("menu")} />}
            {screen === "settings" && (
              <div className="dd-screen dd-panel-screen">
                <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => go("menu")} />
              </div>
            )}
            {screen === "howto" && (
              <div className="dd-screen dd-panel-screen">
                <HowToPlay onBack={() => go("menu")} />
              </div>
            )}
          </>
        )}
        {screen === "game" && level && (
          <GameScreen
            key={`${level.meta.id}:${session}`}
            level={level}
            settings={settings}
            settingsRef={settingsRef}
            muted={muted}
            progressRef={progressRef}
            updateProgress={updateProgress}
            restartSignal={restartSignal}
            onExit={onExit}
            onNext={onNext}
            hasNext={hasNext}
            onSettings={onSettings}
          />
        )}
      </SceneErrorBoundary>
    </div>
  );
}
