/**
 * Water Tanks — a relaxing water-measurement logic puzzle for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes: every screen is internal state.
 *
 *   menu | levels | play | tanks | stats | settings
 *
 * `restartSignal` (GamePlayer Restart) restarts the CURRENT level only — by
 * remounting <Gameplay> with a new attempt key, which cancels any running
 * pour. Unlocks, stars, statistics and settings are never touched.
 * `muted` (GamePlayer Mute) silences every sound and the music immediately
 * without overwriting the saved audio preferences.
 * Fullscreen is handled by GamePlayer around this same tree: the board just
 * re-measures, so toggling it never remounts or resets a level.
 *
 * Progress lives in localStorage under `water-tanks-progress` (utils/progress.js).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./WaterTanks.css";
import Backdrop from "./components/Backdrop.jsx";
import SafeScreen from "./components/SafeScreen.jsx";
import MainMenu from "./screens/MainMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import TankStyles from "./screens/TankStyles.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";
import { getLevel, TOTAL_LEVELS } from "./data/index.js";
import { chapterOf } from "./data/chapters.js";
import { styleVars } from "./data/styles.js";
import { loadProgress, saveProgress, applyComplete, bump, nextPlayable, styleUnlocked } from "./utils/progress.js";
import { sfx, Music } from "./utils/audio.js";

export default function WaterTanks({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(1);
  const [chapterId, setChapterId] = useState(() => chapterOf(nextPlayable(progress)).id);
  const [attempt, setAttempt] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const settingsBack = useRef("menu");

  /* Save on real events only (never per frame, never animation state). */
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
      setCompact(r.width < 620 || r.height < 380);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* pause decorative animation while the tab is hidden */
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  /* ------------------------------------------------------------- audio */
  useEffect(() => {
    sfx.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);
  const music = useRef(null);
  useEffect(() => {
    music.current = new Music();
    return () => {
      music.current?.dispose();
      music.current = null;
      sfx.stopAll();
      sfx.setEnabled(false);
    };
  }, []);
  useEffect(() => {
    music.current?.setEnabled(settings.music && !muted);
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
    sfx.stopAll();
    sfx.ui();
    setScreen(s);
  }, []);

  const startLevel = useCallback((id) => {
    if (id > progressRef.current.highestUnlockedLevel || !getLevel(id)) return;
    sfx.stopAll();
    sfx.ui();
    setLevelId(id);
    setChapterId(chapterOf(id).id);
    setAttempt((a) => a + 1);
    setScreen("play");
  }, []);

  const playNext = useCallback(() => startLevel(nextPlayable(progressRef.current)), [startLevel]);

  const restartLevel = useCallback(() => {
    sfx.stopAll();
    setProgress((p) => bump(p, "restarts"));
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
  const onMove = useCallback((kind, litres) => {
    setProgress((p) => {
      let q = bump(p, "totalMoves");
      q = bump(q, kind === "pour" ? "totalPours" : kind === "fill" ? "totalFills" : "totalDrains");
      return kind === "pour" ? bump(q, "litersTransferred", litres) : q;
    });
  }, []);
  const onInvalid = useCallback(() => setProgress((p) => bump(p, "invalidActions")), []);
  const onUndo = useCallback(() => setProgress((p) => bump(p, "undoUses")), []);
  const onHint = useCallback(() => setProgress((p) => bump(p, "hintsUsed")), []);
  const onComplete = useCallback((level, res) => {
    const out = applyComplete(progressRef.current, level, res);
    progressRef.current = out.progress;
    setProgress(out.progress);
    return out;
  }, []);
  const onChangeSettings = useCallback((patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);
  const onSelectStyle = useCallback((id) => {
    setProgress((p) => (styleUnlocked(p, id) ? { ...p, selectedTankStyle: id } : p));
  }, []);

  const onNext = useCallback(() => {
    const nid = levelId + 1;
    if (nid <= TOTAL_LEVELS && nid <= progressRef.current.highestUnlockedLevel) startLevel(nid);
    else {
      setChapterId(chapterOf(levelId).id);
      go("levels");
    }
  }, [levelId, startLevel, go]);
  const onRetry = useCallback(() => startLevel(levelId), [levelId, startLevel]);
  const onLevels = useCallback(() => {
    setChapterId(chapterOf(levelId).id);
    go("levels");
  }, [levelId, go]);

  /* DEV-only automation hook (?wttest=1) */
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    if (!new URLSearchParams(window.location.search).has("wttest")) return undefined;
    const api = {
      progress: () => progressRef.current,
      screen: (s) => setScreen(s),
      play: (id) => {
        setProgress((p) => ({ ...p, highestUnlockedLevel: Math.max(p.highestUnlockedLevel, id) }));
        progressRef.current = { ...progressRef.current, highestUnlockedLevel: Math.max(progressRef.current.highestUnlockedLevel, id) };
        startLevel(id);
      },
      setProgress: (fn) => setProgress(fn),
      audio: sfx,
    };
    window.__wt = api;
    return () => {
      if (window.__wt === api) delete window.__wt;
    };
  }, [startLevel]);

  /* -------------------------------------------------------------- view */
  const level = screen === "play" ? getLevel(levelId) : null;
  const vars = useMemo(() => styleVars(progress.selectedTankStyle), [progress.selectedTankStyle]);

  return (
    <div
      ref={rootRef}
      className={`wt${compact ? " wt--compact" : ""}${hidden ? " is-hidden" : ""}`}
      style={vars}
      data-graphics={settings.graphics}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      data-water={settings.waterEffects ? "on" : "off"}
      data-particles={settings.particles ? "on" : "off"}
    >
      <Backdrop variant={screen === "play" ? "lab" : "menu"} graphics={settings.graphics} />
      <div className="wt__screen" key={screen === "play" ? "play" : screen}>
        <SafeScreen resetKey={`${screen}:${attempt}`} onRecover={() => setScreen("menu")}>
          {screen === "menu" && (
            <MainMenu
              progress={progress}
              compact={compact}
              onPlay={playNext}
              onLevels={() => {
                setChapterId(chapterOf(nextPlayable(progressRef.current)).id);
                go("levels");
              }}
              onTanks={() => go("tanks")}
              onStats={() => go("stats")}
              onSettings={() => {
                settingsBack.current = "menu";
                go("settings");
              }}
            />
          )}
          {screen === "levels" && (
            <LevelSelect
              progress={progress}
              chapterId={chapterId}
              onChapter={(id) => {
                sfx.ui();
                setChapterId(id);
              }}
              onPlay={startLevel}
              onBack={() => go("menu")}
            />
          )}
          {screen === "play" && level && (
            <Gameplay
              key={`${levelId}:${attempt}`}
              level={level}
              chapter={chapterOf(levelId)}
              settings={settings}
              styleVarsObj={null}
              compact={compact}
              bestMoves={progress.bestMovesByLevel[levelId] ?? null}
              hasNext={levelId < TOTAL_LEVELS}
              onMove={onMove}
              onInvalid={onInvalid}
              onUndo={onUndo}
              onHint={onHint}
              onComplete={onComplete}
              onNext={onNext}
              onRetry={onRetry}
              onLevels={onLevels}
              onMenu={() => go("menu")}
            />
          )}
          {screen === "tanks" && <TankStyles progress={progress} onSelect={onSelectStyle} onBack={() => go("menu")} />}
          {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
          {screen === "settings" && (
            <Settings settings={settings} muted={muted} onChange={onChangeSettings} onBack={() => go(settingsBack.current)} />
          )}
        </SafeScreen>
      </div>
    </div>
  );
}
