/**
 * Lumberjack Life — a true-3D (Three.js / React Three Fiber) lumberjack
 * simulation for the Game Center: fell trees, cut trunks into logs, carry
 * and haul them to your sawmill, watch it cut planks, fill orders, upgrade
 * tools / vehicles / mill and open up five regions.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes — screens are internal state:
 *   menu | regions | equipment | stats | settings | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): during play, restarts the current SESSION
 *    (fresh forest, player back at the yard; the career — money, unlocks,
 *    orders, statistics and the planks in your racks — is kept). Elsewhere
 *    it does nothing.
 *  - Mute (`muted`): silences all Lumberjack Life audio immediately without
 *    touching the saved volume settings.
 *  - Fullscreen: GamePlayer's; the canvas just resizes — no scene, loop,
 *    listener or audio is recreated.
 *
 * Progress lives in localStorage under `lumberjack-life-progress` (versioned).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./LumberjackLife.css";
import GameScreen from "./screens/GameScreen.jsx";
import { MainMenu, Regions, Equipment, Statistics, SettingsPanel } from "./screens/Menus.jsx";
import { loadProgress, saveProgress, newCareer } from "./utils/storage.js";
import { regionById } from "./data/regions.js";
import { sound } from "./audio/sound.js";
import { disposeRendererCaches } from "./three/worldRenderer.js";
import { hasWebGL, SceneErrorBoundary } from "./utils/canvasGuard.jsx";

export default function LumberjackLife({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  const [screen, setScreen] = useState("menu");
  const [session, setSession] = useState({ key: 0, fresh: null });
  const worldRef = useRef(null);
  const [webgl] = useState(hasWebGL);

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
    const id = setTimeout(() => saveProgress(progressRef.current), 250);
    return () => clearTimeout(id);
  }, [progress]);
  useEffect(() => () => {
    saveProgress(progressRef.current);
    sound.dispose();
    disposeRendererCaches();
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
  useEffect(() => {
    sound.ambience(true, progress.currentRegion === "pine-mountain" || progress.currentRegion === "snowy-timberland" ? 1.5 : 1);
    sound.music(settings.music > 0.01);
  }, [settings.music, progress.currentRegion]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* ------------------------------------------------------------ layout / touch */
  const rootRef = useRef(null);
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    } catch {
      coarse = false;
    }
    const measure = () => setTouch(coarse);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------------------------------------ play time */
  useEffect(() => {
    if (screen !== "game") return undefined;
    let acc = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      acc += 1;
      if (acc >= 10) {
        const n = acc;
        acc = 0;
        updateProgress((p) => ({ ...p, statistics: { ...p.statistics, playTime: p.statistics.playTime + n } }));
      }
    }, 1000);
    return () => {
      clearInterval(id);
      if (acc) updateProgress((p) => ({ ...p, statistics: { ...p.statistics, playTime: p.statistics.playTime + acc } }));
    };
  }, [screen, updateProgress]);

  /* ------------------------------------------------------------ navigation */
  const go = useCallback((s) => setScreen(s), []);
  const startGame = useCallback((fresh = null) => {
    setSession((s) => ({ key: s.key + 1, fresh }));
    setScreen("game");
  }, []);
  const onContinue = useCallback(() => startGame(null), [startGame]);
  const onNew = useCallback(() => {
    updateProgress((p) => newCareer(p));
    saveProgress(progressRef.current);
    startGame({ v: 1, trees: [], logs: [], mill: { deck: [], storage: {} } });
  }, [updateProgress, startGame]);
  const onTravel = useCallback((regionId) => {
    updateProgress((p) => ({ ...p, currentRegion: regionId, started: true }));
    startGame(null);
  }, [updateProgress, startGame]);

  /** GameScreen hands back its world snapshot + flushed stats; ignore stale sessions' worlds */
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onSaveWorld = useCallback((regionId, snap, p, key) => {
    const cur = progressRef.current;
    // keep the latest career (p may be a few ms old) but take its flushed stats
    const merged = { ...cur, statistics: p.statistics, started: true };
    if (key === sessionRef.current.key) merged.worlds = { ...cur.worlds, [regionId]: snap };
    progressRef.current = merged;
    setProgress(merged);
    saveProgress(merged);
  }, []);

  /* GamePlayer Restart → restart the current session only */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen !== "game") return;
    const w = worldRef.current;
    const storage = w ? { ...w.mill.storage } : {};
    const fresh = { v: 1, trees: [], logs: [], mill: { deck: [], storage } };
    updateProgress((p) => ({ ...p, worlds: { ...p.worlds, [p.currentRegion]: fresh } }));
    setSession((s) => ({ key: s.key + 1, fresh }));
  }, [restartSignal, screen, updateProgress]);

  const region = regionById(progress.currentRegion);

  if (!webgl) {
    return (
      <div ref={rootRef} className="ll">
        <div className="ll-error">
          <div className="ll-error__title">3D isn't available</div>
          <p>Lumberjack Life needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`ll${touch ? " ll--touch" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      <SceneErrorBoundary key={`${screen}:${session.key}`}>
        {screen === "menu" && <MainMenu progress={progress} settings={settings} onContinue={onContinue} onNew={onNew} onNav={go} />}
        {screen === "regions" && <Regions progress={progress} updateProgress={updateProgress} onTravel={onTravel} onBack={() => go("menu")} />}
        {screen === "equipment" && <Equipment progress={progress} updateProgress={updateProgress} onBack={() => go("menu")} />}
        {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
        {screen === "settings" && (
          <SettingsPanel settings={settings} muted={muted} onChange={(patch) => updateProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } }))} onBack={() => go("menu")} />
        )}
        {screen === "game" && (
          <GameScreen
            key={session.key}
            session={session}
            region={region}
            progress={progress}
            progressRef={progressRef}
            updateProgress={updateProgress}
            settings={settings}
            muted={muted}
            touch={touch}
            worldRef={worldRef}
            onSaveWorld={onSaveWorld}
            onQuit={() => go("menu")}
          />
        )}
      </SceneErrorBoundary>
    </div>
  );
}
