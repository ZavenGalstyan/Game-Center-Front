/**
 * Liquid Sort — compact gameplay HUD: level number, moves, best, hints left,
 * plus the in-game Undo / Hint buttons. Restart / Mute / Fullscreen are the
 * shared GamePlayer controls and are never duplicated here.
 */
import { IconUndo, IconHint } from "./icons.jsx";

export default function GameHUD({
  levelId, moves, bestMoves, hintsLeft, hintTotal,
  canUndo, canHint, onUndo, onHint, onExit,
}) {
  return (
    <div className="ls-hud">
      <div className="ls-hud__group">
        <button type="button" className="ls-btn ls-btn--ghost ls-btn--small" onClick={onExit}>← Levels</button>
        <div className="ls-hud__chip"><b>{levelId}</b><span>Level</span></div>
        <div className="ls-hud__chip"><b>{moves}</b><span>Moves</span></div>
        <div className="ls-hud__chip"><b>{bestMoves ?? "—"}</b><span>Best</span></div>
      </div>
      <div className="ls-hud__actions">
        <button type="button" className="ls-btn ls-btn--small" onClick={onUndo} disabled={!canUndo} title="Undo last pour">
          <IconUndo width={16} height={16} /> Undo
        </button>
        <button type="button" className="ls-btn ls-btn--small" onClick={onHint} disabled={!canHint} title="Show a hint">
          <IconHint width={16} height={16} /> Hint ({hintsLeft}/{hintTotal})
        </button>
      </div>
    </div>
  );
}
