/**
 * Blade Rush — Stage Complete (and, for boss stages, the "Boss Complete"
 * presentation the spec calls out as its own screen: same component, a
 * boss-flavoured heading/badge, since the only real difference is copy).
 */
import { targetById } from "../data/targets.js";

export default function StageComplete({ stage, result, hasNext, onNext, onReplay, onStageSelect }) {
  const target = targetById(stage.target);
  const stars = result.stars || 0;
  const flawless = result.shardsTotal > 0 && result.shardsCollected >= result.shardsTotal;

  return (
    <div className="br-result br-result--complete">
      <div className="br-result__card">
        {stage.boss && <div className="br-result__boss-tag">BOSS DEFEATED</div>}
        <h2 className="br-result__title">STAGE {stage.id} COMPLETE</h2>
        <p className="br-result__subtitle">{target.name} broken</p>

        <div className="br-result__stars" aria-label={`${stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`br-result__star${i < stars ? " is-lit" : ""}`}>&#9733;</span>
          ))}
        </div>

        {flawless && <div className="br-result__flawless">FLAWLESS</div>}

        <div className="br-result__stats">
          <div className="br-result__stat">
            <span className="br-result__stat-label">ACCURACY</span>
            <span className="br-result__stat-value">100%</span>
          </div>
          {result.shardsTotal > 0 && (
            <div className="br-result__stat">
              <span className="br-result__stat-label">SHARDS</span>
              <span className="br-result__stat-value">{result.shardsCollected} / {result.shardsTotal}</span>
            </div>
          )}
          <div className="br-result__stat">
            <span className="br-result__stat-label">SCORE</span>
            <span className="br-result__stat-value">{result.score}</span>
          </div>
        </div>

        <div className="br-result__actions">
          {hasNext && (
            <button type="button" className="br-btn br-btn--primary" onClick={onNext}>NEXT STAGE</button>
          )}
          <button type="button" className="br-btn" onClick={onReplay}>REPLAY</button>
          <button type="button" className="br-btn br-btn--ghost" onClick={onStageSelect}>STAGE SELECT</button>
        </div>
      </div>
    </div>
  );
}
