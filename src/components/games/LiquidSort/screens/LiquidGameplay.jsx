/**
 * Liquid Sort — the puzzle screen.
 *
 * Owns everything about the CURRENT attempt: the live board, selection,
 * move count, in-memory undo history (never persisted — cleared whenever a
 * new level starts, the level restarts, or the level changes), hints used,
 * and the pour-animation handoff to <LiquidBoard>.
 *
 * A pour's LOGICAL result commits to `board` the instant it's validated;
 * <LiquidBoard>/<PourAnimation> only interpolate the VISUAL transition
 * afterwards (see PourAnimation.js for why). Input stays locked
 * (`isPouring`) for that whole visual duration so two pours can never
 * overlap or corrupt state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import LiquidBoard from "../game/LiquidBoard.jsx";
import GameHUD from "../components/GameHUD.jsx";
import GameDefs from "../components/GameDefs.jsx";
import { applyPour, isBottleCompleted, CAPACITY } from "../systems/pourRules.js";
import { isSolved } from "../systems/winDetection.js";
import { legalMoves } from "../systems/puzzleSolver.js";
import { getHint } from "../systems/hintSystem.js";
import { starsForMoves } from "../utils/progression.js";
import { sfx } from "../utils/sound.js";

const HINT_LIMIT = 3;
const HINT_DISPLAY_MS = 4200;

export default function LiquidGameplay({
  level,
  bestMoves,
  styleId,
  colorAssist,
  animationsOn,
  soundOn,
  restartSignal = 0,
  initialBoard = null,
  initialMoves = 0,
  onExit,
  onLevelComplete,
  onHintUsed,
  onUndoUsed,
  onPourDone,
  onProgress,
}) {
  const freshBoard = useCallback(() => level.bottles.map((b) => b.slice()), [level]);

  const [board, setBoard] = useState(() => initialBoard || freshBoard());
  const [selected, setSelected] = useState(null);
  const [moves, setMoves] = useState(initialMoves);
  const [history, setHistory] = useState([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [pendingPour, setPendingPour] = useState(null);
  const [isPouring, setIsPouring] = useState(false);
  const [shakeTarget, setShakeTarget] = useState(null);
  const [hint, setHint] = useState(null);
  const [celebrating, setCelebrating] = useState(false);
  const [deadEnd, setDeadEnd] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const boardRef = useRef(board);
  boardRef.current = board;
  const hintTimerRef = useRef(null);
  const celebrateTimerRef = useRef(null);
  // Reset to true on setup, not just on the initial useRef value — StrictMode's
  // dev-only mount/cleanup/remount simulation would otherwise leave this
  // permanently false after its first pass, silently killing the celebration
  // timeout below on every level completion.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const resetAttempt = useCallback(() => {
    setBoard(freshBoard());
    setSelected(null);
    setMoves(0);
    setHistory([]);
    setHintsUsed(0);
    setPendingPour(null);
    setIsPouring(false);
    setShakeTarget(null);
    setHint(null);
    setCelebrating(false);
    setDeadEnd(false);
    setResetSignal((n) => n + 1);
    clearTimeout(hintTimerRef.current);
    clearTimeout(celebrateTimerRef.current);
  }, [freshBoard]);

  // GamePlayer's shared Restart button resets THIS attempt only.
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    resetAttempt();
  }, [restartSignal, resetAttempt]);

  // Reset whenever a different level is opened.
  const lastLevelId = useRef(level.id);
  useEffect(() => {
    if (lastLevelId.current === level.id) return;
    lastLevelId.current = level.id;
    resetAttempt();
  }, [level.id, resetAttempt]);

  useEffect(() => () => {
    clearTimeout(hintTimerRef.current);
    clearTimeout(celebrateTimerRef.current);
  }, []);

  // lightweight resume-on-refresh save — skipped once solved/celebrating
  useEffect(() => {
    if (celebrating) return;
    onProgress?.(board, moves);
  }, [board, moves, celebrating, onProgress]);

  const clearHintSoon = useCallback(() => {
    clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(null), HINT_DISPLAY_MS);
  }, []);

  const refreshDeadEnd = useCallback((b) => {
    const stuck = !isSolved(b, CAPACITY) && legalMoves(b, CAPACITY).length === 0;
    setDeadEnd(stuck);
    if (stuck) sfx.deadEnd(soundOn);
  }, [soundOn]);

  const handleBottleClick = useCallback((idx) => {
    if (isPouring || celebrating) return;

    if (selected === null) {
      if (board[idx].length === 0) return; // nothing to pick up — not an attempted move
      setSelected(idx);
      setHint(null);
      sfx.select(soundOn);
      return;
    }
    if (selected === idx) {
      setSelected(null);
      sfx.deselect(soundOn);
      return;
    }

    const from = selected;
    const to = idx;
    const result = applyPour(board, from, to, CAPACITY);
    if (!result) {
      setShakeTarget({ index: to, nonce: Date.now() });
      sfx.invalid(soundOn);
      setSelected(null);
      return;
    }

    setHistory((h) => [...h, { board: board.map((b) => b.slice()), moves }]);
    const oldSource = board[from];
    const oldDest = board[to];
    setBoard(result.board);
    setMoves((m) => m + 1);
    setSelected(null);
    setHint(null);
    sfx.pourStart(soundOn);
    setIsPouring(true);
    setPendingPour({
      key: `${from}-${to}-${moves}-${Date.now()}`,
      from, to, oldSource, oldDest,
      newSource: result.board[from], newDest: result.board[to],
      color: result.color, amount: result.amount,
    });
  }, [board, celebrating, isPouring, moves, selected, soundOn]);

  const handlePourAnimDone = useCallback(() => {
    setIsPouring(false);
    setPendingPour(null);
    onPourDone?.();
    const current = boardRef.current;
    if (isSolved(current, CAPACITY)) {
      setCelebrating(true);
      celebrateTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        const finalMoves = moves; // moves already reflects the completed count
        const stars = starsForMoves(finalMoves, level.targetMoves);
        sfx[stars === 3 ? "perfect" : "win"](soundOn);
        onLevelComplete?.(level.id, finalMoves, stars, boardRef.current);
      }, 900);
    } else {
      refreshDeadEnd(current);
    }
  }, [level, moves, onLevelComplete, onPourDone, refreshDeadEnd, soundOn]);

  const handleBottleLanded = useCallback((idx) => {
    if (isBottleCompleted(boardRef.current[idx], CAPACITY)) sfx.bottleComplete(soundOn);
  }, [soundOn]);

  const handleUndo = useCallback(() => {
    if (isPouring || celebrating || history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setBoard(prev.board);
    setMoves(prev.moves);
    setSelected(null);
    setHint(null);
    sfx.undo(soundOn);
    onUndoUsed?.();
    refreshDeadEnd(prev.board);
  }, [celebrating, history, isPouring, onUndoUsed, refreshDeadEnd, soundOn]);

  const handleHint = useCallback(() => {
    if (isPouring || celebrating || hintsUsed >= HINT_LIMIT) return;
    const suggestion = getHint(board, { capacity: CAPACITY });
    if (!suggestion) return;
    setHint(suggestion);
    setHintsUsed((n) => n + 1);
    sfx.hint(soundOn);
    onHintUsed?.();
    clearHintSoon();
  }, [board, celebrating, clearHintSoon, hintsUsed, isPouring, onHintUsed, soundOn]);

  const canUndo = !isPouring && !celebrating && history.length > 0;
  const canHint = !isPouring && !celebrating && hintsUsed < HINT_LIMIT;

  return (
    <div className="ls-play">
      <GameDefs />
      <GameHUD
        levelId={level.id}
        moves={moves}
        bestMoves={bestMoves}
        hintsLeft={HINT_LIMIT - hintsUsed}
        hintTotal={HINT_LIMIT}
        canUndo={canUndo}
        canHint={canHint}
        onUndo={handleUndo}
        onHint={handleHint}
        onExit={onExit}
      />
      <LiquidBoard
        board={board}
        styleId={styleId}
        capacity={CAPACITY}
        selected={selected}
        hint={hint}
        shakeTarget={shakeTarget}
        animationsOn={animationsOn}
        colorAssist={colorAssist}
        disabled={isPouring || celebrating}
        onBottleClick={handleBottleClick}
        pendingPour={pendingPour}
        onPourAnimDone={handlePourAnimDone}
        onBottleLanded={handleBottleLanded}
        resetSignal={resetSignal}
      />
      {deadEnd && !celebrating && (
        <div className="ls-deadend">
          <div className="ls-deadend__card">
            <span>No more moves</span>
            <button type="button" className="ls-btn ls-btn--small" onClick={handleUndo} disabled={history.length === 0}>Undo</button>
            <button type="button" className="ls-btn ls-btn--small ls-btn--primary" onClick={resetAttempt}>Restart</button>
          </div>
        </div>
      )}
    </div>
  );
}
