/**
 * Pirate Cove — a 3D pirate adventure: sail, fight broadsides, dock, explore
 * islands on foot, dig up treasure. Rendered inside the shared <GamePlayer>
 * (registered by name in ../registry.js). Screens are internal state:
 *
 *   menu | adventures | ships | stats | settings | controls | play | complete | ending
 *
 * Progress, ships, upgrades, statistics and settings persist under
 * `pirate-cove-progress` (engine/storage.js); an adventure in progress never does.
 *
 * Game Center integration:
 *   restartSignal  Restart → restarts the current adventure from its start
 *                  (fresh mount); banked progress and gold are untouched.
 *   muted          Mute → master gain to zero immediately (music, ambience,
 *                  cannons, everything), without touching saved volumes.
 * Fullscreen is handled by <GamePlayer>; nothing here remounts on resize.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./PirateCove.css";
import Gameplay from "./screens/Gameplay.jsx";
import AdventureMap from "./screens/AdventureMap.jsx";
import ShipsScreen from "./screens/ShipsScreen.jsx";
import { MainMenu, Statistics, SettingsScreen, ControlsScreen } from "./screens/Menus.jsx";
import { CompleteScreen, EndingScreen } from "./hud/Overlays.jsx";
import { getAdventure, TOTAL_ADVENTURES } from "./data/adventures.js";
import { loadState, saveState, addRunStats, completeAdventure, updateSettings, buyUpgrade, selectShip, updateLook } from "./engine/storage.js";
import { PirateAudio } from "./engine/audio.js";
import { disposeTextures } from "./three/textures.js";
import { disposeMaterials } from "./three/materials.js";
import { disposeShipGeometry, disposeSailGeometry } from "./three/shipGeo.js";
import { disposeVegetation } from "./three/Vegetation.jsx";
import { disposeCharacterGeometry } from "./three/Characters.jsx";
import { TEST } from "./utils/testHooks.js";

function isTouch() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}

export default function PirateCove({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [advId, setAdvId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const lastRestart = useRef(restartSignal);
  const audio = useMemo(() => new PirateAudio(), []);
  const touch = useMemo(() => isTouch(), []);

  useEffect(() => saveState(state), [state]);

  useEffect(
    () => () => {
      audio.dispose();
      disposeTextures();
      disposeMaterials();
      disposeShipGeometry();
      disposeSailGeometry();
      disposeVegetation();
      disposeCharacterGeometry();
    },
    [audio],
  );
  useEffect(() => {
    audio.setMuted(muted);
  }, [audio, muted]);
  useEffect(() => {
    audio.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx });
  }, [audio, state.settings.master, state.settings.music, state.settings.sfx]);
  useEffect(() => {
    if (screen !== "play") audio.update(0.016, { mode: "menu", shore: 40, speed: 0 });
  }, [audio, screen]);
  useEffect(() => {
    if (TEST) window.__pc = { ...(window.__pc || {}), audio, screen, advId, state, setScreen, play: (id) => play(id) };
  });

  // Game Center Restart → restart the adventure being played.
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") setAttempt((n) => n + 1);
  }, [restartSignal, screen]);

  const startAudio = useCallback(() => audio.start(), [audio]);

  const play = (id) => {
    if (id < 1 || id > TOTAL_ADVENTURES || id > state.unlocked) return;
    audio.start();
    audio.ui();
    setAdvId(id);
    setAttempt((n) => n + 1);
    setResult(null);
    setScreen("play");
  };
  const nav = (to) => {
    audio.start();
    audio.ui();
    setScreen(to);
  };

  const onRunStats = useCallback((run, completed) => setState((s) => addRunStats(s, run, { completed })), []);

  const stateRef = useRef(state);
  stateRef.current = state;
  const doneFor = useRef(new Set());
  const onComplete = useCallback(
    ({ run, time }) => {
      const key = `${advId}:${attempt}`;
      if (doneFor.current.has(key)) return; // one completion per attempt
      doneFor.current.add(key);
      // reward for display from the committed state; the real write is a functional
      // update so it composes with the run-stats update queued just before it
      const r = completeAdventure(stateRef.current, advId, run, time);
      setState((s) => completeAdventure(s, advId, run, time).state);
      setResult({ run, reward: r.reward, time });
      setScreen(advId >= TOTAL_ADVENTURES ? "ending" : "complete");
    },
    [advId, attempt],
  );

  const adv = getAdventure(advId);
  const profile = useMemo(
    () => ({ ship: state.ship, upgrades: state.upgrades, look: { ...state.look, hullColor: "#6b4428", flag: "player" } }),
    [state.ship, state.upgrades, state.look],
  );
  const changeSettings = useCallback((patch) => setState((s) => updateSettings(s, patch)), []);

  return (
    <div className="pc-root" onPointerDown={startAudio}>
      {screen === "menu" && <MainMenu state={state} onPlay={play} onNav={nav} onAnyClick={startAudio} />}
      {screen === "adventures" && <AdventureMap state={state} onPick={play} onBack={() => nav("menu")} onShips={() => nav("ships")} />}
      {screen === "ships" && (
        <ShipsScreen
          state={state}
          audio={audio}
          onBack={() => nav("menu")}
          onSelect={(id) => {
            audio.ui();
            setState((s) => selectShip(s, id));
          }}
          onUpgrade={(id, key) => {
            audio.coins();
            setState((s) => buyUpgrade(s, id, key));
          }}
          onLook={(patch) => setState((s) => updateLook(s, patch))}
        />
      )}
      {screen === "stats" && <Statistics state={state} onBack={() => nav("menu")} />}
      {screen === "settings" && <SettingsScreen settings={state.settings} onChange={changeSettings} muted={muted} onBack={() => nav("menu")} />}
      {screen === "controls" && <ControlsScreen onBack={() => nav("menu")} touch={touch} />}
      {screen === "play" && adv && (
        <Gameplay
          key={`a${adv.id}-${attempt}`}
          adv={adv}
          profile={profile}
          settings={state.settings}
          muted={muted}
          audio={audio}
          onComplete={onComplete}
          onQuit={() => setScreen("adventures")}
          onRestart={() => setAttempt((n) => n + 1)}
          onChangeSettings={changeSettings}
          onRunStats={onRunStats}
        />
      )}
      {screen === "complete" && adv && result && (
        <div className="pc-complete-bg">
          <CompleteScreen adv={adv} result={result} hasNext={adv.id < TOTAL_ADVENTURES} onNext={() => play(adv.id + 1)} onMenu={() => nav("adventures")} onShips={() => nav("ships")} />
        </div>
      )}
      {screen === "ending" && (
        <div className="pc-complete-bg">
          <EndingScreen state={state} onMenu={() => nav("menu")} />
        </div>
      )}
    </div>
  );
}
