/**
 * Night Corridor — a first-person horror escape. Rendered inside the
 * shared <GamePlayer> (registered by name in ../registry.js). Every screen
 * is internal state:
 *
 *   menu | chapters | stats | settings | controls | play | cleared | ending
 *
 * Progress, statistics and settings persist under `night-corridor-progress`
 * (see engine/storage.js); an in-progress section never does.
 *
 * Game Center integration:
 *   restartSignal  Restart button → restarts the current section attempt
 *                  (fresh mount at the section start); progress untouched.
 *   muted          Mute button → master gain to zero immediately, without
 *                  changing the saved volume settings.
 * Fullscreen is handled by <GamePlayer>; nothing here remounts on resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./NightCorridor.css";
import Gameplay from "./screens/Gameplay.jsx";
import { MainMenu, Chapters, Statistics, SettingsScreen, ControlsScreen, SectionCleared, Ending } from "./screens/Menus.jsx";
import { getSection, TOTAL_SECTIONS } from "./data/sections.js";
import { loadState, saveState, addRunStats, completeSection, updateSettings } from "./engine/storage.js";
import { HorrorAudio } from "./engine/audio.js";
import { disposeTextureCache } from "./three/textures.js";
import { disposeMaterials } from "./three/materials.js";
import { TEST } from "./utils/testHooks.js";

export default function NightCorridor({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [sectionId, setSectionId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [cleared, setCleared] = useState(null);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new HorrorAudio(), []);

  useEffect(() => saveState(state), [state]);

  // One audio graph for the whole game; torn down with the component.
  useEffect(
    () => () => {
      audio.dispose();
      disposeTextureCache();
      disposeMaterials();
    },
    [audio],
  );
  useEffect(() => {
    audio.setMuted(muted);
  }, [audio, muted]);
  useEffect(() => {
    if (TEST) window.__nc = { ...(window.__nc || {}), audio, screen, sectionId, attempt };
  }, [audio, screen, sectionId, attempt]);
  useEffect(() => {
    audio.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx });
  }, [audio, state.settings.master, state.settings.music, state.settings.sfx]);

  // Game Center Restart → restart the current section attempt.
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") {
      audio.reset();
      setAttempt((n) => n + 1);
    }
  }, [restartSignal, screen, audio]);

  const startAudio = useCallback(() => audio.start(), [audio]);

  const play = (id) => {
    if (id < 1 || id > TOTAL_SECTIONS || id > state.unlocked) return;
    audio.start();
    audio.reset();
    audio.uiTick();
    setSectionId(id);
    setAttempt((n) => n + 1);
    setCleared(null);
    setScreen("play");
  };

  const nav = (to) => {
    audio.start();
    audio.uiTick();
    setScreen(to);
  };

  const toMenu = () => {
    audio.reset();
    setScreen("menu");
  };

  const onRunStats = useCallback((run) => setState((s) => addRunStats(s, run)), []);

  const onComplete = useCallback(
    (result) => {
      setState((s) => completeSection(s, sectionId, result.time));
      audio.reset();
      if (sectionId >= TOTAL_SECTIONS) {
        setScreen("ending");
      } else {
        setCleared(result);
        setScreen("cleared");
      }
    },
    [sectionId, audio],
  );

  const section = getSection(sectionId);
  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);

  return (
    <div className="nc-root">
      {screen === "menu" && <MainMenu state={state} audio={audio} onPlay={play} onNav={nav} onAnyClick={startAudio} />}
      {screen === "chapters" && <Chapters state={state} onPick={play} onBack={() => nav("menu")} />}
      {screen === "stats" && <Statistics state={state} onBack={() => nav("menu")} />}
      {screen === "settings" && <SettingsScreen settings={state.settings} onChange={changeSettings} muted={muted} onBack={() => nav("menu")} />}
      {screen === "controls" && <ControlsScreen onBack={() => nav("menu")} />}
      {screen === "play" && section && (
        <Gameplay
          key={`s${section.id}-a${attempt}`}
          section={section}
          settings={state.settings}
          muted={muted}
          audio={audio}
          onComplete={onComplete}
          onQuit={toMenu}
          onRestart={() => {
            audio.reset();
            setAttempt((n) => n + 1);
          }}
          onChangeSettings={changeSettings}
          onRunStats={onRunStats}
        />
      )}
      {screen === "cleared" && section && cleared && (
        <SectionCleared
          section={section}
          result={cleared}
          best={state.bestTime[section.id]}
          hasNext={section.id < TOTAL_SECTIONS}
          onNext={() => play(section.id + 1)}
          onMenu={toMenu}
        />
      )}
      {screen === "ending" && <Ending state={state} onMenu={toMenu} />}
    </div>
  );
}
