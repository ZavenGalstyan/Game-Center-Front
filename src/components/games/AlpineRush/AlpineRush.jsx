/**
 * Alpine Rush — a true-3D downhill ski racing game: five mountain worlds of
 * six courses, slalom gates, jumps, three race modes, AI rivals, six ski
 * sets and skier customisation. Rendered inside the shared <GamePlayer>
 * (registered by name in ../registry.js). Screens are internal state:
 *
 *   MENU | WORLDS | FREE | GARAGE | STATS | SETTINGS | HOWTO | RACE
 *
 * and a race moves through COUNTDOWN → RACING (⇄ FALLEN, ⇄ PAUSED) →
 * FINISHED (engine/race.js + screens/Race.jsx). Only one screen is ever
 * mounted, so states can't contradict each other.
 *
 * Progress (medals, best times, unlocks, statistics, skis, customisation,
 * settings) persists under `alpine-rush-progress` (engine/storage.js); a
 * race in progress never does.
 *
 * Game Center integration:
 *   restartSignal  Restart → the current race (or free-ski run) starts over
 *                  from the start house (fresh mount); progress is kept. On
 *                  a menu screen it does nothing destructive.
 *   muted          Mute → master gain to zero at once (music + sfx) without
 *                  touching the saved volumes.
 * Fullscreen is handled by <GamePlayer>; nothing remounts on resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./AlpineRush.css";
import Race from "./screens/Race.jsx";
import { MainMenu, WorldSelect, FreeSki, Garage, Statistics, SettingsScreen, HowToPlay } from "./screens/Menus.jsx";
import { Results } from "./hud/Overlays.jsx";
import MenuScene from "./three/MenuScene.jsx";
import { getCourse, TOTAL_LEVELS } from "./data/courses.js";
import { WORLD_BY_ID } from "./data/worlds.js";
import { SKI_BY_ID } from "./data/skis.js";
import { loadState, saveState, recordRace, selectSki, updateSettings, updateCustom, isLevelUnlocked, defaultState, addPlayTime } from "./engine/storage.js";
import { SkiAudio } from "./engine/audio.js";
import { disposeTextures } from "./three/textures.js";
import { disposeGeo } from "./three/geo.js";
import { TEST } from "./utils/testHooks.js";

function isTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}
const available = (id) => !!getCourse(id);

export default function AlpineRush({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(1);
  const [free, setFree] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new SkiAudio(), []);
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
  }, [audio, state.settings.master, state.settings.music, state.settings.sfx]);
  useEffect(() => {
    if (screen !== "race") {
      audio.setMood("menu");
      audio.setPaused(false);
    }
  }, [audio, screen]);

  // Game Center Restart → restart the race being skied (or shown in results).
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
    (id, asFree = false) => {
      if (id < 1 || id > TOTAL_LEVELS || !isLevelUnlocked(stateRef.current, id, available)) {
        audio.locked();
        return;
      }
      audio.start();
      audio.select();
      setLevelId(id);
      setFree(asFree);
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
      if (to === "garage") setPreview(stateRef.current.ski);
      setResult(null);
      setScreen(to);
    },
    [audio],
  );

  const recorded = useRef(new Set());
  const onFinish = useCallback(
    (res, raceStats) => {
      const key = `${levelId}:${attempt}`;
      if (recorded.current.has(key)) return; // one record per attempt
      recorded.current.add(key);
      if (res.free) {
        const next = addPlayTime(stateRef.current, raceStats.time, raceStats, true);
        stateRef.current = next;
        setState(next);
        setResult({ res, outcome: null });
        return;
      }
      const r = recordRace(stateRef.current, levelId, res, raceStats);
      stateRef.current = r.state;
      setState(r.state);
      setResult({ res, outcome: r });
      if (r.medal) audio.medal(r.medal);
      if (r.newUnlocks.length || r.nextUnlocked) setTimeout(() => audio.unlock(), 900);
    },
    [levelId, attempt, audio],
  );
  const onAbandon = useCallback((seconds, raceStats, wasFree) => setState((s) => addPlayTime(s, seconds, raceStats, wasFree)), []);

  useEffect(() => {
    if (TEST) window.__ar = { ...(window.__ar || {}), audio, screen, levelId, state, setScreen, play, setState, nav };
  });

  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);
  const def = getCourse(levelId);
  const world = WORLD_BY_ID.get(def ? def.world : 1);
  const ski = SKI_BY_ID.get(state.ski) || SKI_BY_ID.get("starter");
  const nextId = levelId + 1;
  const hasNext = nextId <= TOTAL_LEVELS && available(nextId);
  const garageSki = screen === "garage" ? SKI_BY_ID.get(preview) || ski : ski;
  const suit = state.custom;
  const skiLook = useMemo(() => ({ ...garageSki.colors, pattern: garageSki.pattern }), [garageSki]);

  return (
    <div className="ar-root" onPointerDown={() => audio.start()}>
      {screen !== "race" && <MenuScene mode={screen === "garage" ? "garage" : "menu"} suit={suit} ski={skiLook} design={suit.design} quality={state.settings.graphics} />}
      {screen === "menu" && <MainMenu state={state} onPlay={(id) => play(id)} onNav={nav} />}
      {screen === "worlds" && <WorldSelect state={state} onPick={(id) => play(id)} onBack={() => nav("menu")} />}
      {screen === "free" && <FreeSki state={state} onPick={(id) => play(id, true)} onBack={() => nav("menu")} />}
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
            setState((s) => selectSki(s, id));
          }}
          onCustom={(patch) => {
            audio.ui();
            setState((s) => updateCustom(s, patch));
          }}
          onBack={() => nav("menu")}
        />
      )}
      {screen === "stats" && <Statistics state={state} onBack={() => nav("menu")} />}
      {screen === "settings" && <SettingsScreen settings={state.settings} onChange={changeSettings} muted={muted} onReset={() => setState({ ...defaultState(), settings: state.settings })} onBack={() => nav("menu")} />}
      {screen === "howto" && <HowToPlay touch={touch} onBack={() => nav("menu")} />}
      {screen === "race" && def && (
        <Race
          key={`l${def.id}-${free ? "f" : "r"}-${attempt}`}
          def={def}
          world={world}
          ski={ski}
          mode={free ? "free" : def.mode}
          custom={suit}
          settings={state.settings}
          muted={muted}
          audio={audio}
          touch={touch}
          finished={!!result}
          onFinish={onFinish}
          onAbandon={onAbandon}
          onQuit={() => nav("menu")}
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
          skiId={ski.id}
          best={state.best[def.id]}
          hasNext={hasNext}
          nextLocked={!isLevelUnlocked(state, nextId, available)}
          onNext={() => play(nextId)}
          onRetry={() => play(levelId, free)}
          onWorlds={() => nav(free ? "free" : "worlds")}
          onMenu={() => nav("menu")}
        />
      )}
    </div>
  );
}
