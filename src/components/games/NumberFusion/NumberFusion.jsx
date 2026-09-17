/**
 * Number Fusion — a classic slide-and-merge number puzzle: 2+2=4, 4+4=8,
 * and so on, on a 4x4 board, arrow keys (or swipe) push every tile at once.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js), exactly like every other Game Center
 * title — no routes, every screen below is internal state:
 *
 *   menu | play | settings
 *
 * All progression (best score, statistics, the in-progress board for
 * resume-on-refresh, settings) lives in localStorage under
 * `number-fusion-progress` — nothing here touches another game's storage.
 *
 * `restartSignal` (the GamePlayer Restart counter) starts a brand-new board
 * — the natural meaning of "restart" for this game — without touching the
 * best score or statistics. `muted` overrides the in-game sound setting
 * without overwriting it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./NumberFusion.css";

import MainMenu from "./screens/MainMenu.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import Settings from "./screens/Settings.jsx";

import { emptyCells, move as slideMove, spawnRandomTile, isGameOver, hasTileAtLeast } from "./engine/grid.js";
import { loadState, saveState, SIZE } from "./utils/storage.js";
import { sfx } from "./utils/sound.js";

const WIN_VALUE = 2048;
const UNDO_STACK_CAP = 8;

function freshBoard() {
  let cells = emptyCells(SIZE);
  ({ cells } = spawnRandomTile(cells, SIZE));
  ({ cells } = spawnRandomTile(cells, SIZE));
  return { cells, score: 0 };
}

export default function NumberFusion({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [board, setBoard] = useState(() => state.board || freshBoard());
  const [status, setStatus] = useState("playing"); // playing | won | over
  const [spawnedId, setSpawnedId] = useState(null);
  const [mergedIds, setMergedIds] = useState(() => new Set());
  const wonAlready = useRef(Boolean(state.board && hasTileAtLeast(state.board.cells, SIZE, WIN_VALUE)));
  // A freshly-generated board always has two tiles (non-zero sum), so
  // "was there a game to resume" has to be judged from what was actually
  // loaded from storage, not from the in-memory board's contents.
  const hadSavedGame = useRef(Boolean(state.board));
  const undoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const boardRef = useRef(board);
  boardRef.current = board;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    saveState({ ...state, board });
  }, [state, board]);

  const soundOn = state.settings.sound && !muted;

  // Resolve initial status from whatever board was resumed.
  useEffect(() => {
    if (isGameOver(board.cells, SIZE)) setStatus("over");
    else if (wonAlready.current) setStatus("playing"); // already dismissed the win overlay in a prior session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------------- GamePlayer Restart */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") {
      undoStack.current = [];
      setCanUndo(false);
      wonAlready.current = false;
      setBoard(freshBoard());
      setStatus("playing");
      setSpawnedId(null);
      setMergedIds(new Set());
    }
  }, [restartSignal, screen]);

  const go = useCallback((next) => setScreen(next), []);

  const newGame = useCallback(() => {
    undoStack.current = [];
    setCanUndo(false);
    wonAlready.current = false;
    hadSavedGame.current = false;
    setBoard(freshBoard());
    setStatus("playing");
    setSpawnedId(null);
    setMergedIds(new Set());
    sfx.newGame(soundOn);
    go("play");
  }, [soundOn, go]);

  const applyMove = useCallback((direction) => {
    if (statusRef.current === "over") return;
    const current = boardRef.current;
    const res = slideMove(current.cells, SIZE, direction);
    if (!res.moved) return;

    undoStack.current = [...undoStack.current, current].slice(-UNDO_STACK_CAP);
    setCanUndo(true);

    let nextCells = res.cells;
    const spawn = spawnRandomTile(nextCells, SIZE);
    if (spawn.spawned) nextCells = spawn.cells;

    const nextScore = current.score + res.scoreGained;
    const merges = new Set(res.movements.filter((m) => m.merged).map((m) => m.id));

    setBoard({ cells: nextCells, score: nextScore });
    setSpawnedId(spawn.spawned?.id ?? null);
    setMergedIds(merges);

    if (merges.size > 0) sfx.merge(soundOn, merges.size - 1);
    else sfx.slide(soundOn);
    if (spawn.spawned) sfx.spawn(soundOn);

    setState((s) => {
      const statistics = {
        ...s.statistics,
        totalMoves: s.statistics.totalMoves + 1,
        totalMerges: s.statistics.totalMerges + merges.size,
        highestTile: Math.max(s.statistics.highestTile, ...nextCells.flat().filter(Boolean).map((t) => t.value), 0),
      };
      const bestScore = Math.max(s.bestScore, nextScore);
      return { ...s, bestScore, statistics };
    });

    if (!wonAlready.current && hasTileAtLeast(nextCells, SIZE, WIN_VALUE)) {
      wonAlready.current = true;
      setStatus("won");
      sfx.win(soundOn);
      setState((s) => ({ ...s, statistics: { ...s.statistics, wins: s.statistics.wins + 1 } }));
    } else if (isGameOver(nextCells, SIZE)) {
      setStatus("over");
      sfx.gameOver(soundOn);
      setState((s) => ({ ...s, statistics: { ...s.statistics, gamesPlayed: s.statistics.gamesPlayed + 1 } }));
    }
  }, [soundOn]);

  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    setCanUndo(undoStack.current.length > 0);
    setBoard(prev);
    setStatus(isGameOver(prev.cells, SIZE) ? "over" : "playing");
    setSpawnedId(null);
    setMergedIds(new Set());
    sfx.undo(soundOn);
  }, [soundOn]);

  const keepPlaying = useCallback(() => setStatus("playing"), []);

  const changeSettings = useCallback((next) => setState((s) => ({ ...s, settings: next })), []);
  const resetBest = useCallback(() => setState((s) => ({ ...s, bestScore: 0 })), []);

  const settingsBack = useRef("menu");
  const openSettings = useCallback(() => { settingsBack.current = screen; go("settings"); }, [screen, go]);

  return (
    <div className="nf" data-motion={state.settings.reducedMotion ? "reduced" : "full"}>
      <div className="nf__backdrop" aria-hidden="true">
        <div className="nf__glow nf__glow--a" />
        <div className="nf__glow nf__glow--b" />
      </div>

      <div className="nf__screen">
        {screen === "menu" && (
          <MainMenu
            bestScore={state.bestScore}
            statistics={state.statistics}
            hasSavedGame={(hadSavedGame.current || canUndo) && status !== "over"}
            onPlay={() => go("play")}
            onSettings={openSettings}
          />
        )}

        {screen === "play" && (
          <Gameplay
            cells={board.cells}
            size={SIZE}
            score={board.score}
            bestScore={state.bestScore}
            spawnedId={spawnedId}
            mergedIds={mergedIds}
            status={status}
            reducedMotion={state.settings.reducedMotion}
            canUndo={canUndo}
            onMove={applyMove}
            onNewGame={newGame}
            onUndo={undo}
            onKeepPlaying={keepPlaying}
            onOpenSettings={openSettings}
            onOpenMenu={() => go("menu")}
          />
        )}

        {screen === "settings" && (
          <Settings
            settings={state.settings}
            muted={muted}
            onChangeSettings={changeSettings}
            onResetBest={resetBest}
            onBack={() => go(settingsBack.current || "menu")}
          />
        )}
      </div>
    </div>
  );
}
