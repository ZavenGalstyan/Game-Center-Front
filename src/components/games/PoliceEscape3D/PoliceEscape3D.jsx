/**
 * Police Escape 3D — a true-3D arcade police-chase game: drive a getaway car
 * through five night-time districts, dodge traffic, outsmart pursuing police
 * (road-graph AI), break through roadblocks, use nitro and shortcuts and
 * reach the escape point. 30 missions, six unlockable cars. Rendered inside
 * the shared <GamePlayer> (registered by name in ../registry.js).
 *
 * Authoritative states (only one screen is ever mounted):
 *
 *   MENU | MISSION_SELECT | GARAGE | STATS | SETTINGS | CONTROLS | PLAY
 *
 * and a mission runs COUNTDOWN → PLAYING (⇄ PAUSED) → MISSION_COMPLETE or
 * BUSTED (engine/mission.js + screens/Play.jsx).
 *
 * Progress (unlocked / completed missions, best times, best stars, cars,
 * statistics, settings) persists under `police-escape-3d-progress`
 * (engine/storage.js); nothing from a mission in progress is saved.
 *
 * Game Center integration:
 *   restartSignal  Restart → the current mission starts over (fresh mount:
 *                  player, police, traffic, timer, integrity, nitro,
 *                  objectives); permanent progress is kept. On a menu screen
 *                  it does nothing destructive.
 *   muted          Mute → master gain to zero (engine, sirens, music, sfx)
 *                  without touching the saved volumes.
 * Fullscreen is handled by <GamePlayer>; nothing here remounts on resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./PoliceEscape3D.css";
import Play from "./screens/Play.jsx";
import { MainMenu, MissionSelect, Garage, Statistics, SettingsScreen, ControlsScreen } from "./screens/Menus.jsx";
import { Complete, Busted } from "./hud/Overlays.jsx";
import MenuScene from "./three/MenuScene.jsx";
import { getMission, missionAvailable, TOTAL_MISSIONS } from "./data/missions.js";
import { worldOfMission } from "./data/worlds.js";
import { CAR_BY_ID } from "./data/cars.js";
import { loadState, saveState, recordEscape, recordAttempt, selectCar, updateSettings, isMissionUnlocked, defaultState } from "./engine/storage.js";
import { ChaseAudio } from "./engine/audio.js";
import { disposeTextures } from "./three/textures.js";
import { disposeCarMaterials } from "./three/carModel.js";
import { TEST } from "./utils/testHooks.js";

function isTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}

export default function PoliceEscape3D({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [missionId, setMissionId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [end, setEnd] = useState(null); // { kind: "complete", res, outcome } | { kind: "busted", why }
  const [preview, setPreview] = useState(null);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new ChaseAudio(), []);
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
  useEffect(() => audio.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx }), [audio, state.settings.master, state.settings.music, state.settings.sfx]);
  useEffect(() => {
    if (screen !== "play") {
      audio.setMood("menu");
      audio.setPaused(false);
    }
  }, [audio, screen]);

  // Game Center Restart → restart the mission being played (or ended).
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") {
      setEnd(null);
      setAttempt((n) => n + 1);
    }
  }, [restartSignal, screen]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const play = useCallback(
    (id) => {
      if (id < 1 || id > TOTAL_MISSIONS || !isMissionUnlocked(stateRef.current, id, missionAvailable)) {
        audio.locked();
        return;
      }
      audio.start();
      audio.select();
      setMissionId(id);
      setAttempt((n) => n + 1);
      setEnd(null);
      setScreen("play");
    },
    [audio],
  );
  const nav = useCallback(
    (to) => {
      audio.start();
      audio.ui();
      if (to === "garage") setPreview(stateRef.current.car);
      setEnd(null);
      setScreen(to);
    },
    [audio],
  );

  const recorded = useRef(new Set());
  const onComplete = useCallback(
    (res) => {
      const key = `${missionId}:${attempt}`;
      if (recorded.current.has(key)) return;
      recorded.current.add(key);
      const r = recordEscape(stateRef.current, missionId, res);
      stateRef.current = r.state;
      setState(r.state);
      setEnd({ kind: "complete", res, outcome: r });
      if (r.newUnlocks.length || r.nextUnlocked) audio.unlock();
    },
    [missionId, attempt, audio],
  );
  const onBusted = useCallback(
    (why, stats) => {
      const key = `${missionId}:${attempt}`;
      if (recorded.current.has(key)) return;
      recorded.current.add(key);
      setState((s) => recordAttempt(s, stats, true));
      setEnd({ kind: "busted", why });
    },
    [missionId, attempt],
  );
  const onAbandon = useCallback((stats) => setState((s) => recordAttempt(s, stats, false)), []);
  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);

  useEffect(() => {
    if (TEST) window.__pe = { ...(window.__pe || {}), audio, screen, missionId, state, setScreen, play, setState, nav, end };
  });

  const def = getMission(missionId);
  const world = worldOfMission(missionId);
  const car = CAR_BY_ID.get(state.car) || CAR_BY_ID.get("shadow");
  const nextId = missionId + 1;
  const hasNext = nextId <= TOTAL_MISSIONS && missionAvailable(nextId) && isMissionUnlocked(state, nextId, missionAvailable);

  return (
    <div className="pe-root" onPointerDown={() => audio.start()}>
      {screen !== "play" && <MenuScene mode={screen === "garage" ? "garage" : "menu"} carDef={screen === "garage" ? CAR_BY_ID.get(preview) || car : car} quality={state.settings.graphics} />}
      {screen === "menu" && <MainMenu state={state} onPlay={play} onNav={nav} />}
      {screen === "missions" && <MissionSelect state={state} onPick={play} onBack={() => nav("menu")} />}
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
          key={`m${def.id}-${attempt}`}
          def={def}
          world={world}
          carDef={car}
          settings={state.settings}
          muted={muted}
          audio={audio}
          touch={touch}
          best={state.best[def.id] ? state.best[def.id].time : null}
          ended={!!end}
          onComplete={onComplete}
          onBusted={onBusted}
          onAbandon={onAbandon}
          onQuit={() => nav("missions")}
          onRestart={() => {
            setEnd(null);
            setAttempt((n) => n + 1);
          }}
          onChangeSettings={changeSettings}
        />
      )}
      {screen === "play" && def && end?.kind === "complete" && (
        <Complete def={def} results={end.res} outcome={end.outcome} hasNext={hasNext} onNext={() => play(nextId)} onRetry={() => play(missionId)} onMissions={() => nav("missions")} onMenu={() => nav("menu")} />
      )}
      {screen === "play" && def && end?.kind === "busted" && <Busted def={def} why={end.why} onRetry={() => play(missionId)} onMissions={() => nav("missions")} onMenu={() => nav("menu")} />}
    </div>
  );
}
