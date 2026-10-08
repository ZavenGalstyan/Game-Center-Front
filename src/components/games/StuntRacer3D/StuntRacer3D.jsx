/**
 * Stunt Racer 3D — a true-3D arcade stunt racer: elevated sky tracks, giant
 * ramps, loops, moving obstacles, nitro, checkpoints and time-trial medals
 * across five worlds of six levels; six unlockable cars. Rendered inside the
 * shared <GamePlayer> (registered by name in ../registry.js).
 *
 * Screens are internal state (only one is ever mounted, so they can't
 * contradict each other):
 *
 *   MENU | LEVEL_SELECT | GARAGE | STATS | SETTINGS | CONTROLS | PLAY
 *
 * and a level moves through COUNTDOWN → PLAYING (⇄ FALLING → RESPAWNING,
 * ⇄ PAUSED) → LEVEL_COMPLETE (engine/run.js + screens/Play.jsx).
 *
 * Progress (unlocked / completed levels, medals, best times, stars, cars,
 * statistics, settings) persists under `stunt-racer-3d-progress`
 * (engine/storage.js); temporary physics state never does.
 *
 * Game Center integration:
 *   restartSignal  Restart → the current level starts over from the start
 *                  line (fresh mount); permanent progress is kept. On a menu
 *                  screen it does nothing destructive.
 *   muted          Mute → master gain to zero at once (music, engine, sfx)
 *                  without touching the saved volumes.
 * Fullscreen is handled by <GamePlayer>; nothing here remounts on resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./StuntRacer3D.css";
import Play from "./screens/Play.jsx";
import { MainMenu, LevelSelect, Garage, Statistics, SettingsScreen, ControlsScreen } from "./screens/Menus.jsx";
import { Results } from "./hud/Overlays.jsx";
import MenuScene from "./three/MenuScene.jsx";
import { getLevel, levelAvailable, TOTAL_LEVELS } from "./data/levels.js";
import { worldOfLevel } from "./data/worlds.js";
import { CAR_BY_ID } from "./data/cars.js";
import { loadState, saveState, recordFinish, selectCar, updateSettings, isLevelUnlocked, defaultState, addAttempt } from "./engine/storage.js";
import { RaceAudio } from "./engine/audio.js";
import { disposeTextures } from "./three/textures.js";
import { disposeCarMaterials } from "./three/carModel.js";
import { TEST } from "./utils/testHooks.js";

function isTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}

export default function StuntRacer3D({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new RaceAudio(), []);
  const touch = useMemo(() => isTouch(), []);

  useEffect(() => saveState(state), [state]);
  useEffect(
    () => () => {
      audio.dispose();
      disposeTextures();
      disposeCarMaterials();
    },
    [audio],
  );
  useEffect(() => audio.setMuted(muted), [audio, muted]);
  useEffect(() => {
    audio.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx });
    audio.setMusic(state.settings.musicOn);
  }, [audio, state.settings.master, state.settings.music, state.settings.sfx, state.settings.musicOn]);
  useEffect(() => {
    if (screen !== "play") {
      audio.setMood("menu");
      audio.setPaused(false);
    }
  }, [audio, screen]);

  // Game Center Restart → restart the level being driven (or shown in results).
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") {
      setResult(null);
      setAttempt((n) => n + 1);
    }
  }, [restartSignal, screen]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const play = useCallback(
    (id) => {
      if (id < 1 || id > TOTAL_LEVELS || !isLevelUnlocked(stateRef.current, id, levelAvailable)) {
        audio.locked();
        return;
      }
      audio.start();
      audio.select();
      setLevelId(id);
      setAttempt((n) => n + 1);
      setResult(null);
      setScreen("play");
    },
    [audio],
  );
  const nav = useCallback(
    (to) => {
      audio.start();
      audio.ui();
      if (to === "garage") setPreview(stateRef.current.car);
      setResult(null);
      setScreen(to);
    },
    [audio],
  );

  const recorded = useRef(new Set());
  const onFinish = useCallback(
    (res) => {
      const key = `${levelId}:${attempt}`;
      if (recorded.current.has(key)) return; // one record per attempt
      recorded.current.add(key);
      const r = recordFinish(stateRef.current, levelId, res);
      stateRef.current = r.state;
      setState(r.state);
      setResult({ res, outcome: r });
      if (r.newUnlocks.length || r.nextUnlocked) audio.unlock();
    },
    [levelId, attempt, audio],
  );
  const onAbandon = useCallback((stats) => setState((s) => addAttempt(s, stats)), []);
  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);

  useEffect(() => {
    if (TEST) window.__sr = { ...(window.__sr || {}), audio, screen, levelId, state, setScreen, play, setState, nav, result };
  });

  const def = getLevel(levelId);
  const world = worldOfLevel(levelId);
  const car = CAR_BY_ID.get(state.car) || CAR_BY_ID.get("blaze");
  const nextId = levelId + 1;
  const hasNext = nextId <= TOTAL_LEVELS && levelAvailable(nextId);

  return (
    <div className="sr-root" onPointerDown={() => audio.start()}>
      {screen !== "play" && <MenuScene mode={screen === "garage" ? "garage" : "menu"} carDef={screen === "garage" ? CAR_BY_ID.get(preview) || car : car} quality={state.settings.graphics} />}
      {screen === "menu" && <MainMenu state={state} onPlay={play} onNav={nav} />}
      {screen === "levels" && <LevelSelect state={state} onPick={play} onBack={() => nav("menu")} />}
      {screen === "garage" && (
        <Garage
          state={state}
          preview={preview}
          onPreview={(id) => {
            audio.ui();
            setPreview(id);
          }}
          onSelect={(id) => {
            audio.select();
            setState((s) => selectCar(s, id));
          }}
          onBack={() => nav("menu")}
        />
      )}
      {screen === "stats" && <Statistics state={state} onBack={() => nav("menu")} />}
      {screen === "settings" && <SettingsScreen settings={state.settings} onChange={changeSettings} muted={muted} onReset={() => setState({ ...defaultState(), settings: state.settings })} onBack={() => nav("menu")} />}
      {screen === "controls" && <ControlsScreen touch={touch} onBack={() => nav("menu")} />}
      {screen === "play" && def && (
        <Play
          key={`l${def.id}-${attempt}`}
          def={def}
          world={world}
          carDef={car}
          settings={state.settings}
          muted={muted}
          audio={audio}
          touch={touch}
          best={state.best[def.id] ? state.best[def.id].time : null}
          finished={!!result}
          onFinish={onFinish}
          onAbandon={onAbandon}
          onQuit={() => nav("levels")}
          onRestart={() => {
            setResult(null);
            setAttempt((n) => n + 1);
          }}
          onChangeSettings={changeSettings}
        />
      )}
      {screen === "play" && def && result && (
        <Results
          def={def}
          results={result.res}
          outcome={result.outcome}
          hasNext={hasNext}
          nextLocked={!isLevelUnlocked(state, nextId, levelAvailable)}
          onNext={() => play(nextId)}
          onRetry={() => play(levelId)}
          onLevels={() => nav("levels")}
          onMenu={() => nav("menu")}
        />
      )}
    </div>
  );
}
