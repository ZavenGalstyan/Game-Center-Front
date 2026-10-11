/**
 * Urban Skate Rush — a true-3D (Three.js / React Three Fiber) third-person
 * skateboarding game for the Game Center: skate, trick, grind across five
 * city districts.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Screens are internal state:
 *   menu | levels | free | garage | stats | settings | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): during a mission, restarts THAT mission.
 *  - Mute (`muted`): silences all audio immediately.
 *  - Fullscreen: GamePlayer's; the canvas resizes.
 *
 * Progress: localStorage `urban-skate-rush-progress` (versioned, sanitised).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./UrbanSkateRush.css";
import { MainMenu, LevelSelect, GarageScreen, StatsScreen, SettingsPanel, FreeSkateSelect, PauseMenu } from "./screens/Menus.jsx";
import MenuStage from "./screens/MenuStage.jsx";
import GameScreen from "./screens/GameScreen.jsx";
import { loadProgress, saveProgress, isUnlocked, nextUnlockedMission } from "./utils/storage.js";
import { MISSIONS, missionById } from "./data/missions.js";
import { districtById } from "./data/districts.js";
import { sound } from "./audio/sound.js";
import { hasWebGL, SceneErrorBoundary } from "./utils/canvasGuard.jsx";

export default function UrbanSkateRush({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  const [screen, setScreen] = useState("menu");
  const [missionId, setMissionId] = useState(null);
  const [freeDistrictId, setFreeDistrictId] = useState(null);
  const [session, setSession] = useState(0);
  const [webgl] = useState(hasWebGL);
  const settingsRef = useRef(progress.settings);
  settingsRef.current = progress.settings;

  /** single synchronous commit point: every writer sees the latest progress */
  const updateProgress = useCallback((fn) => {
    const next = fn(progressRef.current);
    if (next && next !== progressRef.current) {
      progressRef.current = next;
      setProgress(next);
    }
  }, []);

  /* ------------------------------------------------------------ save (debounced + on unmount) */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const id = setTimeout(() => saveProgress(progressRef.current), 300);
    return () => clearTimeout(id);
  }, [progress]);

  useEffect(
    () => () => {
      saveProgress(progressRef.current);
      sound.dispose();
    },
    [],
  );

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && saveProgress(progressRef.current);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, []);

  const settings = progress.settings;

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    sound.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  }, [settings.master, settings.music, settings.sfx]);

  useEffect(() => {
    sound.setMuted(muted);
    if (muted) sound.stopLoops();
  }, [muted]);

  const mission = missionId ? missionById(missionId) : null;
  const musicDistrict = screen === "game" && mission ? districtById(mission.district) : null;

  useEffect(() => {
    if (musicDistrict) sound.music({ ...musicDistrict.music, menu: false });
    else sound.music({ bpm: 95, key: 0, mood: "urban", menu: true });
  }, [musicDistrict]);

  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* ------------------------------------------------------------ touch detection */
  const rootRef = useRef(null);
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    } catch {
      coarse = false;
    }
    setTouch(coarse);
  }, []);

  /* ------------------------------------------------------------ navigation */
  const play = useCallback(
    (id) => {
      const p = progressRef.current;
      if (!missionById(id) || !isUnlocked(p, id)) return;
      updateProgress((q) => ({ ...q, lastMission: id }));
      setMissionId(id);
      setFreeDistrictId(null);
      setSession((s) => s + 1);
      setScreen("game");
    },
    [updateProgress],
  );

  const playFree = useCallback(
    (districtId) => {
      setMissionId(null);
      setFreeDistrictId(districtId);
      setSession((s) => s + 1);
      setScreen("game");
    },
    [],
  );

  const onPlay = useCallback(() => {
    const p = progressRef.current;
    let id = p.lastMission && isUnlocked(p, p.lastMission) ? p.lastMission : nextUnlockedMission(p);
    if (!missionById(id)) id = MISSIONS[MISSIONS.length - 1].id;
    play(id);
  }, [play]);

  const go = useCallback((s) => setScreen(s), []);

  const onExit = useCallback((to) => {
    setScreen(to || "menu");
  }, []);

  const nextId = mission ? mission.id + 1 : null;
  const hasNext = !!(nextId && missionById(nextId) && isUnlocked(progress, nextId));
  const onNext = useCallback(() => nextId && play(nextId), [nextId, play]);
  const onSettings = useCallback((patch) => updateProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), [updateProgress]);
  const onSelectBoard = useCallback((boardId) => updateProgress((p) => ({ ...p, selectedBoard: boardId })), [updateProgress]);
  const onSelectOutfit = useCallback((outfitId) => updateProgress((p) => ({ ...p, selectedOutfit: outfitId })), [updateProgress]);

  // menu backdrop: the furthest district reached
  let bw = 1;
  for (const M of MISSIONS) if (progress.completed[M.id]) bw = Math.max(bw, M.district);
  const menuDistrict = Math.min(bw, 5);

  if (!webgl) {
    return (
      <div ref={rootRef} className="usr">
        <div className="usr-error">
          <div className="usr-error__title">3D isn't available</div>
          <p>Urban Skate Rush needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`usr${touch ? " usr--touch" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      <SceneErrorBoundary key={screen === "game" ? `game:${session}` : "menus"}>
        {screen !== "game" && (
          <>
            <MenuStage districtId={menuDistrict} settingsRef={settingsRef} boardId={progress.selectedBoard} outfitId={progress.selectedOutfit} view={screen === "garage" ? "garage" : "wide"} />
            <div className={`usr-shade usr-shade--${screen}`} />
            {screen === "menu" && <MainMenu progress={progress} onPlay={onPlay} onNav={go} />}
            {screen === "levels" && <LevelSelect progress={progress} onPlay={play} onBack={() => go("menu")} />}
            {screen === "free" && <FreeSkateSelect progress={progress} onPlay={playFree} onBack={() => go("menu")} />}
            {screen === "garage" && <GarageScreen progress={progress} onSelectBoard={onSelectBoard} onSelectOutfit={onSelectOutfit} onBack={() => go("menu")} />}
            {screen === "stats" && <StatsScreen progress={progress} onBack={() => go("menu")} />}
            {screen === "settings" && <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => go("menu")} />}
          </>
        )}
        {screen === "game" && (mission || freeDistrictId) && (
          <GameScreen
            key={`${mission ? mission.id : `free-${freeDistrictId}`}:${session}`}
            mission={mission}
            freeDistrictId={freeDistrictId}
            settings={settings}
            settingsRef={settingsRef}
            muted={muted}
            touch={touch}
            progressRef={progressRef}
            updateProgress={updateProgress}
            restartSignal={restartSignal}
            onExit={onExit}
            onNext={onNext}
            hasNext={hasNext}
            boardId={progress.selectedBoard}
            outfitId={progress.selectedOutfit}
            onSettings={onSettings}
          />
        )}
      </SceneErrorBoundary>
    </div>
  );
}
