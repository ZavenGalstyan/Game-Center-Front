/**
 * Zombie Outbreak — a first-person zombie survival shooter. Rendered inside
 * the shared <GamePlayer> (registered by name in ../registry.js). Screens are
 * internal state:
 *
 *   menu | stages | loadout | weapons | stats | settings | controls | play
 *
 * Progress, loadout, statistics and settings persist under
 * `zombie-outbreak-progress` (engine/storage.js); a stage attempt never does.
 *
 * Game Center integration:
 *   restartSignal  Restart → restarts the current stage attempt (fresh mount);
 *                  progress untouched. Ignored outside gameplay.
 *   muted          Mute → master gain to zero immediately (settings untouched).
 * Fullscreen is handled by <GamePlayer>; the canvases resize in place.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ZombieOutbreak.css";
import Play from "./screens/Play.jsx";
import { MainMenu, StageSelect, WeaponSelect, Statistics, SettingsScreen, ControlsScreen } from "./screens/Menus.jsx";
import { getStage, TOTAL_STAGES } from "./data/stages.js";
import { loadState, saveState, updateSettings, defaultState } from "./engine/storage.js";
import { applyResult, setLoadout, markSeen } from "./engine/progression.js";
import { GameAudio } from "./engine/audio.js";
import { disposeTextures } from "./three/textures.js";
import { disposeMaterials } from "./three/materials.js";
import { TEST } from "./utils/testHooks.js";

export default function ZombieOutbreak({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [stageId, setStageId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [playLoadout, setPlayLoadout] = useState(state.loadout);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new GameAudio(), []);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => saveState(state), [state]);

  useEffect(
    () => () => {
      audio.dispose();
      disposeTextures();
      disposeMaterials();
    },
    [audio],
  );
  useEffect(() => audio.setMuted(muted), [audio, muted]);
  useEffect(() => {
    audio.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx });
  }, [audio, state.settings.master, state.settings.music, state.settings.sfx]);

  // Game Center Restart → restart the current stage attempt.
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") {
      audio.reset();
      setAttempt((n) => n + 1);
    }
  }, [restartSignal, screen, audio]);

  const play = useCallback(
    (id) => {
      const st = stateRef.current;
      if (id < 1 || id > TOTAL_STAGES || id > st.unlocked || !getStage(id)) return;
      audio.start();
      audio.reset();
      setStageId(id);
      setPlayLoadout([...st.loadout]);
      setAttempt((n) => n + 1);
      setScreen("play");
    },
    [audio],
  );

  const nav = (to) => {
    audio.start();
    if (to === "weapons" || to === "loadout") setState((s) => markSeen(s));
    setScreen(to);
  };
  const toMenu = () => {
    audio.reset();
    setScreen("menu");
  };

  // Folds an attempt into the save and returns what it unlocked.
  const onResult = useCallback((result) => {
    const before = stateRef.current;
    const out = applyResult(before, result);
    stateRef.current = out.state;
    setState(out.state);
    return { newWeapons: out.newWeapons, newStage: out.newStage, best: before.best[result.stageId] ?? null };
  }, []);

  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);
  const stage = getStage(stageId);
  const seenTypes = useMemo(() => {
    // Enemy types already met in earlier stages (no "new threat" toast for them).
    const set = new Set();
    for (let i = 1; i < stageId; i++) {
      const s = getStage(i);
      if (s && stateRef.current.completed[i]) for (const w of s.waves) for (const [t] of w.groups) set.add(t);
    }
    return [...set];
  }, [stageId]);

  useEffect(() => {
    if (TEST) window.__zo = { ...(window.__zo || {}), audio, play, setState, nav: setScreen, screen, state };
  });

  return (
    <div className="zo-root">
      {screen === "menu" && <MainMenu state={state} onPlay={(id) => { setStageId(id); play(id); }} onNav={nav} onAnyClick={() => audio.start()} />}
      {screen === "stages" && (
        <StageSelect
          state={state}
          initial={stageId}
          onBack={toMenu}
          onPick={(id) => {
            setStageId(id);
            nav("loadout");
          }}
        />
      )}
      {(screen === "loadout" || screen === "weapons") && (
        <WeaponSelect
          state={state}
          stageId={screen === "loadout" ? stageId : null}
          onLoadout={(l) => setState((s) => setLoadout(s, l))}
          onDeploy={() => play(stageId)}
          onBack={() => setScreen(screen === "loadout" ? "stages" : "menu")}
        />
      )}
      {screen === "stats" && <Statistics state={state} onBack={toMenu} />}
      {screen === "settings" && (
        <SettingsScreen
          settings={state.settings}
          onChange={changeSettings}
          muted={muted}
          onBack={toMenu}
          onReset={() => {
            const fresh = { ...defaultState(), settings: state.settings };
            stateRef.current = fresh;
            setState(fresh);
            setScreen("menu");
          }}
        />
      )}
      {screen === "controls" && <ControlsScreen onBack={toMenu} />}
      {screen === "play" && stage && (
        <Play
          key={`s${stage.id}-a${attempt}`}
          stage={stage}
          loadout={playLoadout}
          settings={state.settings}
          muted={muted}
          audio={audio}
          hasNext={stage.id < TOTAL_STAGES && !!getStage(stage.id + 1)}
          seenTypes={seenTypes}
          onResult={onResult}
          onRestart={() => {
            audio.reset();
            setAttempt((n) => n + 1);
          }}
          onNext={() => play(stage.id + 1)}
          onStageSelect={() => {
            audio.reset();
            setScreen("stages");
          }}
          onMenu={toMenu}
          onChangeSettings={changeSettings}
        />
      )}
    </div>
  );
}
