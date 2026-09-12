import { formatClock } from "../utils/timing.js";
import { getOperation } from "../data/operations.js";
import { isPerfectDisarm } from "../systems/scoringSystem.js";

export default function MissionComplete({ mission, result, hasNext, onNext, onReplay, onMissionSelect }) {
  const op = getOperation(mission.operation);
  const accuracy = Math.round((result.moduleCount / (result.moduleCount + result.strikes)) * 100);
  const perfect = isPerfectDisarm(result);

  return (
    <div className="bs-result bs-result--complete" style={{ "--bs-accent": op.accent }}>
      <div className="bs-result__card">
        <p className="bs-result__eyebrow">DEVICE DISARMED</p>
        <h2 className="bs-result__title">MISSION COMPLETE</h2>

        {perfect && <p className="bs-result__perfect">&#9670; PERFECT DISARM &#9670;</p>}

        <div className="bs-result__stars" aria-label={`${result.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < result.stars ? "is-lit" : ""}>&#9733;</span>
          ))}
        </div>

        <div className="bs-result__grid">
          <div className="bs-result__stat"><span>TIME REMAINING</span><strong>{formatClock(result.timeRemaining)}</strong></div>
          <div className="bs-result__stat"><span>STRIKES</span><strong>{result.strikes}/{result.maxStrikes}</strong></div>
          <div className="bs-result__stat"><span>ACCURACY</span><strong>{accuracy}%</strong></div>
          {result.bonus && (
            <div className="bs-result__stat"><span>BONUS</span><strong className={result.bonusMet ? "is-good" : "is-bad"}>{result.bonusMet ? "MET" : "MISSED"}</strong></div>
          )}
        </div>

        <div className="bs-result__actions">
          {hasNext && <button type="button" className="bs-btn bs-btn--primary" onClick={onNext}>NEXT MISSION</button>}
          <button type="button" className="bs-btn" onClick={onReplay}>REPLAY</button>
          <button type="button" className="bs-btn bs-btn--ghost" onClick={onMissionSelect}>MISSION SELECT</button>
        </div>
      </div>
    </div>
  );
}
