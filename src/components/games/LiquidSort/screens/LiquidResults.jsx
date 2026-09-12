/**
 * Liquid Sort — Level Complete. The finished board stays fully visible
 * behind a small semi-transparent panel instead of a big opaque modal.
 */
import GameDefs from "../components/GameDefs.jsx";
import Bottle from "../components/Bottle.jsx";
import { IconStar } from "../components/icons.jsx";
import { TOTAL_LEVELS } from "../data/chapters.js";

export default function LiquidResults({ result, styleId, colorAssist, animationsOn, onNext, onReplay, onLevels }) {
  const { levelId, board, moves, stars, targetMoves, bestMoves, nextUnlocked } = result;
  const perfect = stars === 3;

  return (
    <div className="ls-results">
      <GameDefs />
      <div className="ls-topbar">
        <span style={{ width: 64 }} />
        <div className="ls-topbar__title">Level {levelId} Complete</div>
        <span style={{ width: 64 }} />
      </div>

      <div className="ls-results__board">
        <div className="ls-board-wrap">
          <div className="ls-board" style={{ "--ls-bottle-w": "64px", "--ls-bottle-h": "122px" }}>
            {board.map((b, i) => (
              <div className="ls-board__slot" key={i} style={{ width: 64, height: 122 }}>
                <Bottle colors={b} styleId={styleId} disabled colorAssist={colorAssist} animationsOn={animationsOn} label="" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ls-panel ls-results__panel">
        <div className={`ls-results__title${perfect ? " ls-results__title--perfect" : ""}`}>
          {perfect ? "Perfect Sort!" : "Level Complete"}
        </div>
        <div className="ls-results__stars">
          {[1, 2, 3].map((n) => <IconStar key={n} filled={n <= stars} />)}
        </div>
        <div className="ls-results__stats">
          <div className="ls-menu__stat"><b>{moves}</b><span>Moves</span></div>
          <div className="ls-menu__stat"><b>{targetMoves}</b><span>Target</span></div>
          <div className="ls-menu__stat"><b>{bestMoves}</b><span>Best</span></div>
        </div>
        <div className="ls-results__actions">
          {levelId < TOTAL_LEVELS && nextUnlocked && (
            <button type="button" className="ls-btn ls-btn--primary" onClick={onNext}>Next Level</button>
          )}
          <button type="button" className="ls-btn" onClick={onReplay}>Replay</button>
          <button type="button" className="ls-btn ls-btn--ghost" onClick={onLevels}>Level Select</button>
        </div>
      </div>
    </div>
  );
}
