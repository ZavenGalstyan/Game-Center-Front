/**
 * Liquid Sort — a relaxing liquid-sorting logic puzzle.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is
 * internal state, exactly like Classic Chess, Fishing Journey, Mini Golf
 * Journey, Delivery Rush, Parking Master, Cake Designer and Crowd Rush.
 *
 *   menu | levels | play | results | settings | stats
 *
 * All progression (unlocked levels, stars, best move counts, cosmetics,
 * settings, statistics, an in-progress puzzle for resume-on-refresh) lives
 * in localStorage under `liquid-sort-progress`. Nothing here touches
 * another game's storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — during gameplay it
 * resets the CURRENT level attempt only; unlocks, stars, best moves and
 * statistics are never cleared. `muted` comes from the GamePlayer Mute
 * button and overrides the in-game audio settings without overwriting them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./LiquidSort.css";

import LiquidMenu from "./screens/LiquidMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import LiquidGameplay from "./screens/LiquidGameplay.jsx";
import LiquidResults from "./screens/LiquidResults.jsx";
import LiquidSettings from "./screens/LiquidSettings.jsx";
import LiquidStatistics from "./screens/LiquidStatistics.jsx";

import { getLevel } from "./data/levels.js";
import { chapterOfLevel, TOTAL_LEVELS } from "./data/chapters.js";
import { themeById } from "./data/cosmetics.js";
import {
  loadState, saveState, applyLevelComplete, recordHint, recordUndo, recordPour,
  setCosmetic, saveCurrentPuzzle, clearCurrentPuzzle,
} from "./utils/storage.js";
import { Music } from "./utils/sound.js";

export default function LiquidSort({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(1);
  const [attemptNonce, setAttemptNonce] = useState(0);
  const [result, setResult] = useState(null);
  const settingsBack = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => saveState(state), [state]);

  const settings = useMemo(
    () => ({
      ...state.settings,
      sound: state.settings.sound && !muted,
      music: state.settings.music && !muted,
    }),
    [state.settings, muted],
  );

  const musicRef = useRef(null);
  useEffect(() => {
    const wantsMusic = settings.music && ["menu", "levels", "play", "settings", "stats"].includes(screen);
    if (wantsMusic && !musicRef.current) musicRef.current = new Music(true);
    else if (musicRef.current) musicRef.current.setEnabled(wantsMusic);
    return undefined;
  }, [settings.music, screen]);
  useEffect(() => () => musicRef.current?.dispose(), []);

  /* GamePlayer Restart — forwarded to gameplay as an attempt-reset signal */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") setAttemptNonce((n) => n + 1);
  }, [restartSignal, screen]);

  const go = useCallback((next) => setScreen(next), []);

  /* ------------------------------------------------------------- levels */

  const level = useMemo(() => getLevel(levelId), [levelId]);

  const startLevel = useCallback((id) => {
    setLevelId(id);
    setResult(null);
    setState((s) => ({ ...s, currentLevel: id }));
    go("play");
  }, [go]);

  const playCurrent = useCallback(() => {
    const s = stateRef.current;
    const resume = s.savedPuzzle && s.savedPuzzle.levelId === (s.currentLevel || 1) ? s.savedPuzzle : null;
    startLevel(resume ? resume.levelId : Math.min(s.unlockedLevel, s.currentLevel || 1));
  }, [startLevel]);

  const initialResume =
    screen === "play" && state.savedPuzzle && state.savedPuzzle.levelId === levelId
      ? state.savedPuzzle
      : null;

  const handleLevelComplete = useCallback((id, moves, stars, finalBoard) => {
    const applied = applyLevelComplete(stateRef.current, id, moves, stars);
    setState(applied.state);
    const lvl = getLevel(id);
    setResult({
      levelId: id,
      board: finalBoard,
      moves,
      stars,
      targetMoves: lvl.targetMoves,
      bestMoves: applied.state.levels[id].bestMoves,
      nextUnlocked: id + 1 <= applied.state.unlockedLevel,
    });
    go("results");
  }, [go]);

  const handleHintUsed = useCallback(() => setState((s) => recordHint(s)), []);
  const handleUndoUsed = useCallback(() => setState((s) => recordUndo(s)), []);
  const handlePourDone = useCallback(() => setState((s) => recordPour(s)), []);
  const handleProgress = useCallback((board, moves) => {
    setState((s) => saveCurrentPuzzle(s, levelId, board, moves));
  }, [levelId]);

  const nextLevel = useCallback(() => {
    const nid = Math.min(TOTAL_LEVELS, levelId + 1);
    if (nid <= stateRef.current.unlockedLevel && nid !== levelId) startLevel(nid);
    else go("levels");
  }, [levelId, go, startLevel]);

  const replayLevel = useCallback(() => {
    setState((s) => clearCurrentPuzzle(s));
    setAttemptNonce((n) => n + 1);
    startLevel(levelId);
  }, [levelId, startLevel]);

  /* --------------------------------------------------------- settings */

  const updateSettings = useCallback((next) => setState((s) => ({ ...s, settings: next })), []);
  const updateCosmetic = useCallback((key, value) => setState((s) => setCosmetic(s, key, value)), []);
  const openSettings = useCallback(() => { settingsBack.current = screen; go("settings"); }, [screen, go]);

  /* ------------------------------------------------------------- theme */

  const activeTheme = useMemo(() => {
    if ((screen === "play" || screen === "results") && level) return chapterOfLevel(level.id).theme;
    return themeById(state.cosmetics.theme);
  }, [screen, level, state.cosmetics.theme]);

  const themeVars = {
    "--ls-bg0": activeTheme.bg0, "--ls-bg1": activeTheme.bg1, "--ls-panel": activeTheme.panel,
    "--ls-line": activeTheme.line, "--ls-accent": activeTheme.accent, "--ls-accent2": activeTheme.accent2,
    "--ls-text": activeTheme.text, "--ls-dim": activeTheme.dim, "--ls-surface": activeTheme.surface,
  };

  return (
    <div className="ls" style={themeVars} data-quality={state.settings.graphics} data-motion={state.settings.animations ? "on" : "off"}>
      <div className="ls__backdrop" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="ls__particle" style={{ "--n": i }} />
        ))}
      </div>
      <div className="ls__table" aria-hidden="true" />

      <div className="ls__screen">
        {screen === "menu" && (
          <LiquidMenu
            state={state}
            onPlay={() => { playCurrent(); }}
            onLevels={() => go("levels")}
            onStats={() => go("stats")}
            onSettings={openSettings}
          />
        )}

        {screen === "levels" && (
          <LevelSelect state={state} onPlay={startLevel} onBack={() => go("menu")} />
        )}

        {screen === "play" && level && (
          <LiquidGameplay
            key={`lvl-${level.id}`}
            level={level}
            bestMoves={state.levels[level.id]?.bestMoves ?? null}
            styleId={state.cosmetics.bottleStyle}
            colorAssist={state.settings.colorAssist}
            animationsOn={state.settings.animations}
            soundOn={settings.sound}
            restartSignal={attemptNonce}
            initialBoard={initialResume?.board || null}
            initialMoves={initialResume?.moves || 0}
            onExit={() => go("levels")}
            onLevelComplete={handleLevelComplete}
            onHintUsed={handleHintUsed}
            onUndoUsed={handleUndoUsed}
            onPourDone={handlePourDone}
            onProgress={handleProgress}
          />
        )}

        {screen === "results" && result && (
          <LiquidResults
            result={result}
            styleId={state.cosmetics.bottleStyle}
            colorAssist={state.settings.colorAssist}
            animationsOn={state.settings.animations}
            onNext={nextLevel}
            onReplay={replayLevel}
            onLevels={() => go("levels")}
          />
        )}

        {screen === "settings" && (
          <LiquidSettings
            settings={state.settings}
            cosmetics={state.cosmetics}
            levels={state.levels}
            muted={muted}
            onChangeSettings={updateSettings}
            onChangeCosmetic={updateCosmetic}
            onBack={() => go(settingsBack.current || "menu")}
          />
        )}

        {screen === "stats" && (
          <LiquidStatistics state={state} onBack={() => go("menu")} />
        )}
      </div>
    </div>
  );
}
