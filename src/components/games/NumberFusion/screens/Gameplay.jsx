import { useEffect, useRef } from "react";
import Board from "../components/Board.jsx";
import { IconSettings, IconUndo, IconRefresh } from "../components/uiIcons.jsx";

const KEY_TO_DIRECTION = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
  A: "left", D: "right", W: "up", S: "down",
};

const SWIPE_THRESHOLD = 24; // px

export default function Gameplay({
  cells,
  size,
  score,
  bestScore,
  spawnedId,
  mergedIds,
  status, // "playing" | "won" | "over"
  reducedMotion,
  canUndo,
  onMove,
  onNewGame,
  onUndo,
  onKeepPlaying,
  onOpenSettings,
  onOpenMenu,
}) {
  const boardWrapRef = useRef(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const onKeyDown = (e) => {
      const dir = KEY_TO_DIRECTION[e.key];
      if (!dir) return;
      e.preventDefault();
      if (statusRef.current === "over") return;
      onMoveRef.current(dir);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return undefined;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onPointerDown = (e) => {
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
    };
    const onPointerUp = (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
      if (statusRef.current === "over") return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      onMoveRef.current(dir);
    };
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return (
    <div className="nf-gameplay">
      <div className="nf-topbar">
        <button type="button" className="nf-icon-btn" onClick={onOpenMenu} title="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <div className="nf-topbar__scores">
          <div className="nf-score"><span className="nf-score__label">Score</span><span className="nf-score__value">{score}</span></div>
          <div className="nf-score nf-score--best"><span className="nf-score__label">Best</span><span className="nf-score__value">{bestScore}</span></div>
        </div>
        <div className="nf-topbar__actions">
          <button type="button" className="nf-icon-btn" onClick={onUndo} disabled={!canUndo} title="Undo"><IconUndo /></button>
          <button type="button" className="nf-icon-btn" onClick={onNewGame} title="New game"><IconRefresh /></button>
          <button type="button" className="nf-icon-btn" onClick={onOpenSettings} title="Settings"><IconSettings /></button>
        </div>
      </div>

      <div className="nf-gameplay__board-wrap" ref={boardWrapRef}>
        <Board cells={cells} size={size} spawnedId={spawnedId} mergedIds={mergedIds} reducedMotion={reducedMotion} />

        {status === "over" && (
          <div className="nf-overlay">
            <div className="nf-overlay__card">
              <h2>Game Over</h2>
              <p>Final score: {score}</p>
              <button type="button" className="nf-btn nf-btn--primary" onClick={onNewGame}>New Game</button>
            </div>
          </div>
        )}
        {status === "won" && (
          <div className="nf-overlay nf-overlay--win">
            <div className="nf-overlay__card">
              <h2>You reached 2048!</h2>
              <p>Keep going for a higher score, or start fresh.</p>
              <div className="nf-overlay__actions">
                <button type="button" className="nf-btn nf-btn--ghost" onClick={onNewGame}>New Game</button>
                <button type="button" className="nf-btn nf-btn--primary" onClick={onKeepPlaying}>Keep Playing</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="nf-gameplay__hint">Use the arrow keys (or swipe) to slide every tile at once.</p>
    </div>
  );
}
