/**
 * Mountain Journey — a third-person 3D mountain adventure: 30 handcrafted
 * trails across five regions, from a forest camp in the valley to the snowy
 * summit. Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Screens are internal state:
 *
 *   menu | levels | explorer | stats | settings | controls | play | complete | summit
 *
 * Progress, badges, viewpoints, best times, statistics, cosmetics and
 * settings persist under `mountain-journey-progress` (engine/storage.js);
 * a level in progress never does.
 *
 * Game Center integration:
 *   restartSignal  Restart → restarts the current level from its start (fresh
 *                  mount); banked progress, badges and viewpoints are kept.
 *   muted          Mute → master gain to zero at once (music, ambience, sfx)
 *                  without touching the saved volumes.
 * Fullscreen is handled by <GamePlayer>; nothing here remounts on resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./MountainJourney.css";
import Gameplay from "./screens/Gameplay.jsx";
import LevelMap from "./screens/LevelMap.jsx";
import ExplorerScreen from "./screens/ExplorerScreen.jsx";
import { MainMenu, Statistics, SettingsScreen, ControlsScreen } from "./screens/Menus.jsx";
import { CompleteScreen, SummitEnding } from "./hud/Overlays.jsx";
import MenuScene, { disposeMenuLevel } from "./three/MenuScene.jsx";
import { getLevel, TOTAL_LEVELS } from "./data/levels.js";
import { regionOfLevel } from "./data/regions.js";
import { loadState, saveState, addRunStats, completeLevel, recordBadge, recordViewpoint, updateSettings, updateLook, foundBadges, progressOf } from "./engine/storage.js";
import { MountainAudio } from "./engine/audio.js";
import { disposeTextures } from "./three/textures.js";
import { disposeMaterials } from "./three/materials.js";
import { disposeVegetation } from "./three/Vegetation.jsx";
import { disposePropGeometry } from "./three/Props.jsx";
import { TEST } from "./utils/testHooks.js";

function isTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}

const MENU_SCREENS = new Set(["menu", "levels", "explorer", "stats", "settings", "controls"]);

export default function MountainJourney({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new MountainAudio(), []);
  const touch = useMemo(() => isTouch(), []);

  useEffect(() => saveState(state), [state]);
  useEffect(
    () => () => {
      audio.dispose();
      disposeTextures();
      disposeMaterials();
      disposeVegetation();
      disposePropGeometry();
      disposeMenuLevel();
    },
    [audio],
  );
  useEffect(() => {
    audio.setMuted(muted);
  }, [audio, muted]);
  useEffect(() => {
    audio.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx });
  }, [audio, state.settings.master, state.settings.music, state.settings.sfx]);
  // menu ambience (the level's own ambience takes over in play)
  useEffect(() => {
    if (screen === "play") return undefined;
    audio.setRegion(null);
    audio.setPaused(false);
    const id = setInterval(() => audio.update(0.1, null), 250);
    return () => clearInterval(id);
  }, [audio, screen]);

  // Game Center Restart → restart the level being played.
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") setAttempt((n) => n + 1);
  }, [restartSignal, screen]);

  const startAudio = useCallback(() => audio.start(), [audio]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const play = useCallback(
    (id) => {
      const s = stateRef.current;
      if (id < 1 || id > TOTAL_LEVELS || id > s.unlocked || !getLevel(id)) return;
      audio.start();
      audio.ui();
      setLevelId(id);
      setAttempt((n) => n + 1);
      setResult(null);
      setScreen("play");
      setState((st) => (st.lastLevel === id ? st : { ...st, lastLevel: id }));
    },
    [audio],
  );
  const nav = (to) => {
    audio.start();
    audio.ui();
    setScreen(to);
  };

  useEffect(() => {
    if (TEST) window.__mj = { ...(window.__mj || {}), audio, screen, levelId, state, setScreen, play, setState };
  });

  const onRunStats = useCallback((run) => setState((s) => addRunStats(s, run)), []);
  const onBadge = useCallback((idx) => setState((s) => recordBadge(s, levelId, idx)), [levelId]);
  const onViewpoint = useCallback(() => setState((s) => recordViewpoint(s, levelId)), [levelId]);

  const doneFor = useRef(new Set());
  const onComplete = useCallback(
    ({ time }) => {
      const key = `${levelId}:${attempt}`;
      if (doneFor.current.has(key)) return; // one completion per attempt
      doneFor.current.add(key);
      const r = completeLevel(stateRef.current, levelId, time);
      setState((s) => completeLevel(s, levelId, time).state);
      const badgesTotal = (r.state.badges[levelId] || [0, 0, 0]).reduce((a, b) => a + b, 0);
      setResult({ time, reward: r.reward, badgesTotal, viewpoint: !!r.state.viewpoints[levelId] });
      setScreen(levelId >= TOTAL_LEVELS ? "summit" : "complete");
    },
    [levelId, attempt],
  );

  const def = getLevel(levelId);
  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);
  const found = useMemo(() => foundBadges(state, levelId), [state.badges, levelId]); // eslint-disable-line react-hooks/exhaustive-deps
  const showMenuScene = MENU_SCREENS.has(screen);

  return (
    <div className="mj-root" onPointerDown={startAudio}>
      {showMenuScene && <MenuScene look={state.look} mode={screen === "explorer" ? "explorer" : "menu"} settings={state.settings} />}
      {screen === "menu" && <MainMenu state={state} onPlay={play} onNav={nav} />}
      {screen === "levels" && <LevelMap state={state} onPick={play} onBack={() => nav("menu")} />}
      {screen === "explorer" && <ExplorerScreen state={state} onLook={(patch) => setState((s) => updateLook(s, patch))} onBack={() => nav("menu")} />}
      {screen === "stats" && <Statistics state={state} onBack={() => nav("menu")} />}
      {screen === "settings" && <SettingsScreen settings={state.settings} onChange={changeSettings} muted={muted} onBack={() => nav("menu")} />}
      {screen === "controls" && <ControlsScreen onBack={() => nav("menu")} touch={touch} />}
      {screen === "play" && def && (
        <Gameplay
          key={`l${def.id}-${attempt}`}
          def={def}
          found={found}
          look={state.look}
          settings={state.settings}
          muted={muted}
          audio={audio}
          touch={touch}
          onComplete={onComplete}
          onQuit={() => setScreen("levels")}
          onRestart={() => setAttempt((n) => n + 1)}
          onChangeSettings={changeSettings}
          onRunStats={onRunStats}
          onBadge={onBadge}
          onViewpoint={onViewpoint}
        />
      )}
      {screen === "complete" && def && result && (
        <div className="mj-complete-bg">
          <CompleteScreen
            def={def}
            region={regionOfLevel(def.id)}
            result={result}
            hasNext={def.id < TOTAL_LEVELS && !!getLevel(def.id + 1)}
            onNext={() => play(def.id + 1)}
            onReplay={() => play(def.id)}
            onMap={() => nav("levels")}
          />
        </div>
      )}
      {screen === "summit" && (
        <div className="mj-complete-bg mj-complete-bg--summit">
          <SummitEnding state={state} progress={progressOf(state)} onMap={() => nav("levels")} onMenu={() => nav("menu")} />
        </div>
      )}
    </div>
  );
}
