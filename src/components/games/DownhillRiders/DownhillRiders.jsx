/**
 * Downhill Riders — a true-3D arcade downhill mountain-bike racer: six
 * bikes, five regions of six trails, jumps, tricks, boost and three AI
 * rivals. Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Screens are internal state:
 *
 *   MENU | TRAIL_SELECT | GARAGE | STATS | SETTINGS | CONTROLS | RACE
 *
 * and a race moves through COUNTDOWN → RACING (⇄ CRASHED, ⇄ PAUSED) →
 * FINISHED (engine/race.js + screens/Race.jsx). Only one screen is ever
 * mounted, so states can't contradict each other.
 *
 * Progress (medals, best times, unlocks, statistics, selected bike,
 * settings) persists under `downhill-riders-progress` (engine/storage.js);
 * a race in progress never does.
 *
 * Game Center integration:
 *   restartSignal  Restart → the current race starts over from the gate
 *                  (fresh mount); medals, times and unlocks are kept. On a
 *                  menu screen it does nothing destructive.
 *   muted          Mute → master gain to zero at once (music, tyres, sfx)
 *                  without touching the saved volumes.
 * Fullscreen is handled by <GamePlayer>; nothing here remounts on resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./DownhillRiders.css";
import Race from "./screens/Race.jsx";
import { MainMenu, TrailSelect, Garage, Statistics, SettingsScreen, ControlsScreen } from "./screens/Menus.jsx";
import { Results } from "./hud/Overlays.jsx";
import MenuScene from "./three/MenuScene.jsx";
import { getTrack, TOTAL_TRACKS } from "./data/tracks.js";
import { REGION_BY_ID } from "./data/regions.js";
import { BIKE_BY_ID } from "./data/bikes.js";
import { loadState, saveState, recordRace, selectBike, updateSettings, isTrackUnlocked, defaultState, addPlayTime } from "./engine/storage.js";
import { RideAudio } from "./engine/audio.js";
import { disposeTextures } from "./three/textures.js";
import { disposeGeo } from "./three/geo.js";
import { TEST } from "./utils/testHooks.js";

function isTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}
const available = (id) => !!getTrack(id);

export default function DownhillRiders({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [trackId, setTrackId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new RideAudio(), []);
  const touch = useMemo(() => isTouch(), []);

  useEffect(() => saveState(state), [state]);
  useEffect(
    () => () => {
      audio.dispose();
      disposeTextures();
      disposeGeo();
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

  // Game Center Restart → restart the race being ridden (or shown in results).
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
  const nav = useCallback(
    (to) => {
      audio.start();
      audio.ui();
      if (to === "garage") setPreview(stateRef.current.bike);
      setResult(null);
      setScreen(to);
    },
    [audio],
  );

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
      if (r.newUnlocks.length || r.nextUnlocked) audio.unlock();
    },
    [trackId, attempt, audio],
  );
  const onAbandon = useCallback((seconds, raceStats) => setState((s) => addPlayTime(s, seconds, raceStats)), []);

  useEffect(() => {
    if (TEST) window.__dr = { ...(window.__dr || {}), audio, screen, trackId, state, setScreen, play, setState, nav };
  });

  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);
  const def = getTrack(trackId);
  const region = REGION_BY_ID.get(def ? def.region : 1);
  const bike = BIKE_BY_ID.get(state.bike) || BIKE_BY_ID.get("trailblazer");
  const nextId = trackId + 1;
  const hasNext = nextId <= TOTAL_TRACKS && available(nextId);

  return (
    <div className="dr-root" onPointerDown={() => audio.start()}>
      {screen !== "race" && <MenuScene mode={screen === "garage" ? "garage" : "menu"} bike={screen === "garage" ? BIKE_BY_ID.get(preview) || bike : bike} quality={state.settings.graphics} />}
      {screen === "menu" && <MainMenu state={state} onPlay={play} onNav={nav} />}
      {screen === "trails" && <TrailSelect state={state} onPick={play} onBack={() => nav("menu")} />}
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
            setState((s) => selectBike(s, id));
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
          region={region}
          bike={bike}
          settings={state.settings}
          muted={muted}
          audio={audio}
          touch={touch}
          finished={!!result}
          onFinish={onFinish}
          onAbandon={onAbandon}
          onQuit={() => nav("trails")}
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
          results={result.res}
          outcome={result.outcome}
          bikeId={bike.id}
          hasNext={hasNext}
          nextLocked={!isTrackUnlocked(state, nextId, available)}
          onNext={() => play(nextId)}
          onRetry={() => play(trackId)}
          onTrails={() => nav("trails")}
          onMenu={() => nav("menu")}
        />
      )}
    </div>
  );
}
