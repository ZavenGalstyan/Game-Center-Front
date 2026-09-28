/**
 * Parking Jam — exit-order parking puzzle for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes: every screen is internal state.
 *
 *   menu | levels | play | vehicles | stats | settings
 *
 * `restartSignal` (GamePlayer Restart) restarts the CURRENT level only —
 * unlocks, stars, skins, settings and statistics are never touched.
 * `muted` (GamePlayer Mute) gates every sound and the ambience without
 * overwriting the saved audio preferences.
 *
 * Progress lives in localStorage under `parking-jam-progress` (see
 * utils/progress.js). Fullscreen is handled entirely by GamePlayer: the
 * scene just re-fits to its new size, so toggling it can't remount or reset
 * a level.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./ParkingJam.css";
import MainMenu from "./screens/MainMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import Vehicles from "./screens/Vehicles.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";
import SafeScreen from "./components/SafeScreen.jsx";
import { getLevel, TOTAL_LEVELS } from "./data/index.js";
import { WORLDS, worldOf } from "./data/worlds.js";
import { loadProgress, saveProgress, applyComplete, bump, nextPlayable } from "./utils/progress.js";
import { sfx, Ambience } from "./utils/audio.js";

export default function ParkingJam({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState("menu");
  const [worldId, setWorldId] = useState(() => worldOf(nextPlayable(progress)).id);
  const [levelId, setLevelId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [resume, setResume] = useState(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const settingsBack = useRef("menu");

  /* Save on real changes only (progress objects are replaced on events, not frames). */
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    saveProgress(progress);
  }, [progress]);

  const settings = progress.settings;

  /* ------------------------------------------------------------ layout */
  const rootRef = useRef(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCompact(r.width < 560 || r.width / Math.max(1, r.height) < 1.2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------------------------------------- audio */
  useEffect(() => {
    sfx.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);

  const ambience = useRef(null);
  useEffect(() => {
    ambience.current = new Ambience();
    return () => {
      ambience.current?.dispose();
      ambience.current = null;
      sfx.setEnabled(false);
    };
  }, []);
  const activeWorld = screen === "play" ? worldOf(levelId) : WORLDS[worldId - 1];
  useEffect(() => {
    ambience.current?.setWorld(activeWorld.ambience);
  }, [activeWorld.ambience]);
  useEffect(() => {
    ambience.current?.setEnabled(settings.music && !muted);
  }, [settings.music, muted]);

  /* --------------------------------------------------------- play time */
  useEffect(() => {
    if (screen !== "play") return undefined;
    let last = Date.now();
    const flush = () => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      if (document.visibilityState === "visible" && dt > 0 && dt < 60000) setProgress((p) => bump(p, "playTimeMs", dt));
    };
    const id = setInterval(flush, 15000);
    return () => {
      clearInterval(id);
      flush();
    };
  }, [screen]);

  /* -------------------------------------------------------- navigation */
  const go = useCallback((s) => {
    sfx.ui();
    setScreen(s);
  }, []);

  const startLevel = useCallback((id, { fresh = false } = {}) => {
    const p = progressRef.current;
    if (id > p.unlockedLevel || !getLevel(id)) return; // locked levels never open
    const cur = p.current;
    setResume(!fresh && cur && cur.levelId === id ? cur : null);
    if (fresh && cur) setProgress((q) => ({ ...q, current: null }));
    setLevelId(id);
    setWorldId(worldOf(id).id);
    setAttempt((a) => a + 1);
    sfx.ui();
    setScreen("play");
  }, []);

  const playNext = useCallback(() => {
    const p = progressRef.current;
    const id = p.current && p.current.levelId <= p.unlockedLevel ? p.current.levelId : nextPlayable(p);
    startLevel(id);
  }, [startLevel]);

  const restartLevel = useCallback(() => {
    setResume(null);
    setProgress((p) => bump({ ...p, current: null }, "restarts"));
    setAttempt((a) => a + 1);
  }, []);

  /* GamePlayer Restart → restart the current level only. */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") restartLevel();
  }, [restartSignal, screen, restartLevel]);

  /* ------------------------------------------------ gameplay callbacks */
  const onMove = useCallback((id, order, mistakes, hints) => {
    setProgress((p) => bump({ ...p, current: { levelId: id, order, mistakes, hints } }, "carsCleared"));
  }, []);
  const onUndo = useCallback((id, order, mistakes, hints) => {
    setProgress((p) => bump(bump({ ...p, current: { levelId: id, order, mistakes, hints } }, "undoUsed"), "carsCleared", -1));
  }, []);
  const onBlocked = useCallback(() => setProgress((p) => bump(p, "blockedAttempts")), []);
  const onHint = useCallback(() => setProgress((p) => bump(p, "hintsUsed")), []);
  const onComplete = useCallback((id, res) => {
    const { progress: next, newSkins } = applyComplete(progressRef.current, id, res);
    progressRef.current = next;
    setProgress(next);
    return newSkins;
  }, []);
  const onChangeSettings = useCallback((patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);
  const onSelectSkin = useCallback((skinId) => {
    setProgress((p) => (p.unlockedSkins.includes(skinId) ? { ...p, selectedVehicleSkin: skinId } : p));
  }, []);

  const onNext = useCallback(() => {
    const nid = levelId + 1;
    if (nid <= TOTAL_LEVELS && nid <= progressRef.current.unlockedLevel) startLevel(nid, { fresh: true });
    else go("levels");
  }, [levelId, startLevel, go]);
  const onReplay = useCallback(() => startLevel(levelId, { fresh: true }), [levelId, startLevel]);
  const onLevels = useCallback(() => {
    setWorldId(worldOf(levelId).id);
    go("levels");
  }, [levelId, go]);

  /* -------------------------------------------------------------- view */
  const level = screen === "play" ? getLevel(levelId) : null;
  const world = activeWorld;
  const themeVars = useMemo(() => ({
    "--pj-bg0": world.ui.bg0, "--pj-bg1": world.ui.bg1, "--pj-accent": world.ui.accent, "--pj-accent2": world.ui.accent2,
    "--pj-text": world.ui.text, "--pj-dim": world.ui.dim, "--pj-panel": world.ui.panel,
  }), [world]);

  return (
    <div
      ref={rootRef}
      className={`pj${compact ? " pj--compact" : ""}`}
      style={themeVars}
      data-graphics={settings.graphics}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
    >
      <div className="pj__screen" key={screen}>
        <SafeScreen resetKey={`${screen}:${attempt}`} onRecover={() => setScreen("menu")}>
        {screen === "menu" && (
          <MainMenu
            progress={progress}
            settings={settings}
            onPlay={playNext}
            onLevels={() => go("levels")}
            onVehicles={() => go("vehicles")}
            onStats={() => go("stats")}
            onSettings={() => { settingsBack.current = "menu"; go("settings"); }}
          />
        )}
        {screen === "levels" && (
          <LevelSelect
            progress={progress}
            worldId={worldId}
            onWorld={(id) => { sfx.ui(); setWorldId(id); }}
            onPlay={(id) => startLevel(id)}
            onBack={() => go("menu")}
          />
        )}
        {screen === "play" && level && (
          <Gameplay
            key={`${levelId}:${attempt}`}
            level={level}
            world={world}
            settings={settings}
            skinId={progress.selectedVehicleSkin}
            resume={resume}
            compact={compact}
            hasNext={levelId < TOTAL_LEVELS}
            isLast={levelId === TOTAL_LEVELS}
            onMove={onMove}
            onUndo={onUndo}
            onBlocked={onBlocked}
            onHint={onHint}
            onRestart={restartLevel}
            onComplete={onComplete}
            onNext={onNext}
            onReplay={onReplay}
            onLevels={onLevels}
          />
        )}
        {screen === "vehicles" && (
          <Vehicles progress={progress} onSelect={onSelectSkin} onBack={() => go("menu")} />
        )}
        {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
        {screen === "settings" && (
          <Settings settings={settings} muted={muted} onChange={onChangeSettings} onBack={() => go(settingsBack.current)} />
        )}
        </SafeScreen>
      </div>
    </div>
  );
}
