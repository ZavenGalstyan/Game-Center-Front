/**
 * Kart Legends — a true-3D arcade kart racer: six karts, five cups of six
 * tracks, three-lap races against three AI rivals. Rendered inside the
 * shared <GamePlayer> (registered by name in ../registry.js). Screens are
 * internal state:
 *
 *   menu | select | garage | stats | settings | controls | race
 *
 * Progress (stars, records, unlocks, statistics, selected kart, settings)
 * persists under `kart-legends-progress` (engine/storage.js); a race in
 * progress never does.
 *
 * Game Center integration:
 *   restartSignal  Restart → the current race starts over from the grid
 *                  (fresh mount); stars, records and unlocks are kept.
 *   muted          Mute → master gain to zero at once (music, engines, sfx)
 *                  without touching the saved volumes.
 * Fullscreen is handled by <GamePlayer>; nothing here remounts on resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./KartLegends.css";
import Race from "./screens/Race.jsx";
import { MainMenu, RaceSelect, Garage, Statistics, SettingsScreen, ControlsScreen } from "./screens/Menus.jsx";
import { Results } from "./hud/Overlays.jsx";
import MenuScene, { disposeMenuTrack } from "./three/MenuScene.jsx";
import { getTrack, TOTAL_TRACKS } from "./data/tracks.js";
import { worldOfTrack } from "./data/worlds.js";
import { KART_BY_ID } from "./data/karts.js";
import { loadState, saveState, recordRace, selectKart, updateSettings, isTrackUnlocked, defaultState } from "./engine/storage.js";
import { KartAudio } from "./engine/audio.js";
import { disposeTextures } from "./three/textures.js";
import { disposeKartGeometry } from "./three/KartModel.jsx";
import { disposeEnvGeometry } from "./three/Environment.jsx";
import { TEST } from "./utils/testHooks.js";

function isTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}
const available = (id) => !!getTrack(id);

export default function KartLegends({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [trackId, setTrackId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new KartAudio(), []);
  const touch = useMemo(() => isTouch(), []);

  useEffect(() => saveState(state), [state]);
  useEffect(
    () => () => {
      audio.dispose();
      disposeTextures();
      disposeKartGeometry();
      disposeEnvGeometry();
      disposeMenuTrack();
    },
    [audio],
  );
  useEffect(() => audio.setMuted(muted), [audio, muted]);
  useEffect(() => {
    audio.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx });
    audio.setMusic(state.settings.musicOn);
  }, [audio, state.settings.master, state.settings.music, state.settings.sfx, state.settings.musicOn]);
  useEffect(() => {
    if (screen !== "race") {
      audio.setMood("menu");
      audio.setPaused(false);
    }
  }, [audio, screen]);

  // Game Center Restart → restart the race being driven (or shown in results).
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "race") {
      setResult(null);
      setAttempt((n) => n + 1);
    }
  }, [restartSignal, screen]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const play = useCallback(
    (id) => {
      if (id < 1 || id > TOTAL_TRACKS || !isTrackUnlocked(stateRef.current, id, available)) {
        audio.locked();
        return;
      }
      audio.start();
      audio.select();
      setTrackId(id);
      setAttempt((n) => n + 1);
      setResult(null);
      setScreen("race");
    },
    [audio],
  );
  const nav = (to) => {
    audio.start();
    audio.ui();
    if (to === "garage") setPreview(stateRef.current.kart);
    setResult(null);
    setScreen(to);
  };

  const recorded = useRef(new Set());
  const onFinish = useCallback(
    (res, raceStats) => {
      const key = `${trackId}:${attempt}`;
      if (recorded.current.has(key)) return; // one record per attempt
      recorded.current.add(key);
      const r = recordRace(stateRef.current, trackId, res, raceStats);
      stateRef.current = r.state;
      setState(r.state);
      setResult({ res, outcome: r });
      if (r.newUnlocks.length) audio.unlock();
    },
    [trackId, attempt, audio],
  );

  useEffect(() => {
    if (TEST) window.__kl = { ...(window.__kl || {}), audio, screen, trackId, state, setScreen, play, setState, nav };
  });

  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);
  const def = getTrack(trackId);
  const world = worldOfTrack(trackId);
  const kart = KART_BY_ID.get(state.kart) || KART_BY_ID.get("rookie");
  const showMenuScene = screen !== "race";
  const nextId = trackId + 1;
  const hasNext = nextId <= TOTAL_TRACKS && available(nextId);

  return (
    <div className="kl-root" onPointerDown={() => audio.start()}>
      {showMenuScene && <MenuScene mode={screen === "garage" ? "garage" : "menu"} kart={screen === "garage" ? KART_BY_ID.get(preview) || kart : kart} />}
      {screen === "menu" && <MainMenu state={state} onPlay={play} onNav={nav} />}
      {screen === "select" && <RaceSelect state={state} onPick={play} onBack={() => nav("menu")} />}
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
            setState((s) => selectKart(s, id));
          }}
          onBack={() => nav("menu")}
        />
      )}
      {screen === "stats" && <Statistics state={state} onBack={() => nav("menu")} />}
      {screen === "settings" && <SettingsScreen settings={state.settings} onChange={changeSettings} muted={muted} onReset={() => setState({ ...defaultState(), settings: state.settings })} onBack={() => nav("menu")} />}
      {screen === "controls" && <ControlsScreen touch={touch} onBack={() => nav("menu")} />}
      {screen === "race" && def && (
        <Race
          key={`t${def.id}-${attempt}`}
          def={def}
          world={world}
          kart={kart}
          settings={state.settings}
          muted={muted}
          audio={audio}
          touch={touch}
          finished={!!result}
          onFinish={onFinish}
          onQuit={() => nav("select")}
          onRestart={() => {
            setResult(null);
            setAttempt((n) => n + 1);
          }}
          onChangeSettings={changeSettings}
        />
      )}
      {screen === "race" && def && result && (
        <Results
          def={def}
          world={world}
          results={result.res}
          outcome={result.outcome}
          kartId={kart.id}
          hasNext={hasNext}
          nextLocked={!isTrackUnlocked(state, nextId, available)}
          onNext={() => play(nextId)}
          onRetry={() => play(trackId)}
          onSelect={() => nav("select")}
          onGarage={() => nav("garage")}
        />
      )}
    </div>
  );
}
