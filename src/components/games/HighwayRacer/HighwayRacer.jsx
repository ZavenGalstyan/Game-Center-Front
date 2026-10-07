/**
 * Highway Racer — a true-3D (Three.js / React Three Fiber) endless arcade
 * highway racer for the Game Center: drive forward automatically, change
 * lanes to dodge traffic, collect coins, chain near misses, boost, and push
 * the distance and score further every run.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent canvas sits behind every screen; screens
 * are internal state:  menu | garage | stats | settings | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): restarts the CURRENT RUN with a fresh
 *    countdown (coins, cars, records, statistics and settings untouched).
 *    On menus it does nothing.
 *  - Mute (`muted`): silences engine, music, SFX, boost, traffic and UI
 *    immediately (master gain) without touching the saved volumes.
 *  - Fullscreen: GamePlayer's; the canvas only resizes — no run, scene,
 *    loop, listener or audio is recreated.
 *  - Like: untouched (handled by the Game Center).
 *
 * Progress: localStorage `highway-racer-progress` (versioned, sanitised).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./HighwayRacer.css";
import Stage from "./three/Stage.jsx";
import GameScreen from "./screens/GameScreen.jsx";
import { Garage, MainMenu, Settings, Statistics } from "./screens/Menus.jsx";
import { loadProgress, saveProgress } from "./utils/storage.js";
import { createInput } from "./utils/input.js";
import { CARS } from "./data/cars.js";
import { envById, envUnlocked } from "./data/environments.js";
import { sound } from "./audio/sound.js";
import { hasWebGL, SceneErrorBoundary } from "./utils/canvasGuard.jsx";
import { TEST, TEST_TOUCH } from "./utils/testHooks.js";

export default function HighwayRacer({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  const [screen, setScreen] = useState("menu");
  const [session, setSession] = useState(0);
  const [envPreview, setEnvPreview] = useState(progress.selectedEnvironment);
  const [carPreview, setCarPreview] = useState(progress.selectedCar);
  const [webgl] = useState(hasWebGL);
  const [world, setWorld] = useState(null);
  const worldRef = useRef(null);
  const tickRef = useRef(null);
  const input = useMemo(() => createInput(), []);
  const s = progress.settings;
  const settingsRef = useRef(s);
  settingsRef.current = s;

  /** change + save */
  const commit = useCallback((fn) => {
    const next = fn(progressRef.current);
    if (!next || next === progressRef.current) return;
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ---------------------------------------------------------------- audio */
  useEffect(() => {
    sound.setVolumes({ sound: s.sound, music: s.music, sfx: s.sfx });
  }, [s.sound, s.music, s.sfx]);
  useEffect(() => {
    sound.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    if (screen !== "game") sound.music("menu");
  }, [screen]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      sound.dispose();
    };
  }, []);

  /* ---------------------------------------------------------------- touch */
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    } catch {
      coarse = false;
    }
    setTouch(coarse || TEST_TOUCH);
  }, []);

  /* ---------------------------------------------------------------- world sync */
  const onReady = useCallback((w) => {
    worldRef.current = w;
    setWorld(w);
  }, []);
  useEffect(() => {
    if (!world) return;
    world.setSettings(s);
  }, [world, s]);
  useEffect(() => {
    if (!world) return;
    world.setMode(screen === "game" ? "game" : screen === "garage" ? "garage" : "menu");
    world.setEnvironment(screen === "game" ? progress.selectedEnvironment : envPreview);
    world.setCar(screen === "garage" ? carPreview : progress.selectedCar);
  }, [world, screen, envPreview, carPreview, progress.selectedCar, progress.selectedEnvironment]);

  /* ---------------------------------------------------------------- navigation */
  const play = useCallback(() => {
    const p = progressRef.current;
    if (!envUnlocked(envById(envPreview), p.bestDistance)) {
      sound.deny();
      return;
    }
    if (p.selectedEnvironment !== envPreview) commit((q) => ({ ...q, selectedEnvironment: envPreview }));
    sound.ui();
    setSession((n) => n + 1);
    setScreen("game");
  }, [commit, envPreview]);
  const go = useCallback((sc) => {
    sound.ui();
    if (sc === "garage") setCarPreview(progressRef.current.selectedCar);
    setScreen(sc);
  }, []);
  const back = useCallback(() => {
    sound.uiBack();
    setScreen("menu");
  }, []);
  const onExit = useCallback((to) => {
    if (to === "garage") setCarPreview(progressRef.current.selectedCar);
    setEnvPreview(progressRef.current.selectedEnvironment);
    setScreen(to || "menu");
  }, []);
  const onEnv = useCallback(
    (id) => {
      sound.ui();
      setEnvPreview(id);
      if (envUnlocked(envById(id), progressRef.current.bestDistance)) commit((q) => (q.selectedEnvironment === id ? q : { ...q, selectedEnvironment: id }));
    },
    [commit],
  );
  const onSelectCar = useCallback(
    (id) => {
      if (!progressRef.current.unlockedCars.includes(id)) return;
      sound.ui();
      commit((p) => ({ ...p, selectedCar: id }));
    },
    [commit],
  );
  const onUnlockCar = useCallback(
    (id) => {
      const car = CARS.find((c) => c.id === id);
      const p = progressRef.current;
      if (!car || p.unlockedCars.includes(id)) return;
      if (p.coins < car.price) {
        sound.deny();
        return;
      }
      sound.unlock();
      commit((q) => ({ ...q, coins: q.coins - car.price, unlockedCars: [...q.unlockedCars, id], selectedCar: id }));
    },
    [commit],
  );
  const changeSettings = useCallback((patch) => commit((p) => ({ ...p, settings: { ...p.settings, ...patch } })), [commit]);

  // menu keyboard: Enter = play
  useEffect(() => {
    if (screen !== "menu") return undefined;
    const key = (e) => {
      if ((e.code === "Enter" || e.code === "NumpadEnter") && document.activeElement?.tagName !== "BUTTON") play();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [screen, play]);

  // garage: drag on the canvas rotates the car
  const drag = useRef(null);
  const onCanvasPointer = useCallback(
    (e) => {
      if (screen !== "garage" || !worldRef.current) return;
      drag.current = { x: e.clientX };
      const move = (ev) => {
        if (!drag.current || !worldRef.current) return;
        worldRef.current.garageRotate((ev.clientX - drag.current.x) * 0.01);
        drag.current.x = ev.clientX;
      };
      const up = () => {
        drag.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [screen],
  );

  /* ---------------------------------------------------------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__hr = window.__hr || {};
    Object.assign(window.__hr, {
      progress: () => progressRef.current,
      commit,
      screen: (sc) => setScreen(sc),
      play,
      input,
      sound,
    });
    return undefined;
  }, [commit, input, play]);

  if (!webgl) {
    return (
      <div className="hr">
        <div className="hr-error">
          <div className="hr-error__title">3D isn't available</div>
          <p>Highway Racer needs WebGL. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`hr${touch ? " hr--touch" : ""}`} data-screen={screen} data-motion={s.reducedMotion ? "reduced" : "full"}>
      <SceneErrorBoundary>
        <Stage settingsRef={settingsRef} tickRef={tickRef} onReady={onReady} onPointerDown={onCanvasPointer} />
        <div className={`hr-shade hr-shade--${screen}`} />
        {screen === "menu" && <MainMenu progress={progress} envId={envPreview} onPlay={play} onNav={go} onEnv={onEnv} />}
        {screen === "garage" && (
          <Garage progress={progress} previewId={carPreview} onPreview={setCarPreview} onSelect={onSelectCar} onUnlock={onUnlockCar} onBack={back} />
        )}
        {screen === "stats" && <Statistics progress={progress} onBack={back} />}
        {screen === "settings" && <Settings settings={s} muted={muted} onChange={changeSettings} onBack={back} />}
        {screen === "game" && world && (
          <GameScreen
            key={session}
            worldRef={worldRef}
            tickRef={tickRef}
            input={input}
            progressRef={progressRef}
            commit={commit}
            settings={s}
            touch={touch}
            restartSignal={restartSignal}
            onExit={onExit}
          />
        )}
      </SceneErrorBoundary>
    </div>
  );
}
