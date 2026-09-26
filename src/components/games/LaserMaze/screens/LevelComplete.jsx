/**
 * Laser Maze — compact Level Complete bar, docked at the bottom of the stage
 * so the solved, fully-lit board stays visible above it.
 */
import { useEffect, useRef } from "react";
import { Icon, Stars } from "../components/icons.jsx";
import { starThresholds } from "../utils/progress.js";

export default function LevelComplete({ world, level, levelNo, result, bestMoves, hasNext, onNext, onReplay, onLevels }) {
  const th = starThresholds(level.par);
  const primary = useRef(null);
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, []);
  const note =
    result.stars === 3
      ? result.moves < level.par ? "Better than the known solution!" : "Perfect — optimal solution"
      : result.stars === 2
        ? `Solve in ${th.three} moves for 3 stars`
        : `Solve in ${th.two} moves for 2 stars`;
  return (
    <div className="lm-overlay lm-overlay--dock">
      <div className="lm-panel lm-panel--complete" role="dialog" aria-label="Level complete">
        <div className="lm-complete__head">
          <p className="lm-panel__eyebrow">{world.name} · {world.id}-{levelNo}</p>
          <h2 className="lm-panel__title lm-panel__title--glow">Level Complete</h2>
          <div className="lm-complete__stars"><Stars n={result.stars} size={26} /></div>
          <p className="lm-complete__note">{note}</p>
          {!hasNext && <p className="lm-complete__note lm-complete__finale">Every world is illuminated — thank you for playing!</p>}
        </div>
        <div className="lm-complete__grid">
          <div><span>Moves</span><b>{result.moves}</b></div>
          <div><span>Best</span><b>{bestMoves ?? result.moves}{result.newBest && result.prevBest != null && <em>new!</em>}</b></div>
          <div><span>Par</span><b>{level.par}</b></div>
        </div>
        <div className="lm-complete__buttons">
          {hasNext && (
            <button ref={primary} type="button" className="lm-btn lm-btn--primary" onClick={onNext}>Next level <Icon.next /></button>
          )}
          <div className="lm-complete__minor">
            <button type="button" className="lm-btn" onClick={onReplay}><Icon.reset /> Replay</button>
            <button type="button" className="lm-btn" onClick={onLevels}><Icon.grid /> Levels</button>
          </div>
        </div>
      </div>
    </div>
  );
}
