import { getOperation } from "../data/operations.js";
import { formatClock } from "../utils/timing.js";

export default function MissionBriefing({ mission, onBegin, onBack }) {
  const op = getOperation(mission.operation);
  return (
    <div className="bs-briefing" style={{ "--bs-accent": op.accent }}>
      <button type="button" className="bs-icon-btn bs-briefing__back" onClick={onBack} aria-label="Back to Mission Select">
        &#8592;
      </button>

      <div className="bs-briefing__card">
        <p className="bs-briefing__mission">MISSION {mission.id}</p>
        <h2 className="bs-briefing__op">{op.name}</h2>

        <div className="bs-briefing__grid">
          <div className="bs-briefing__stat"><span>TIME</span><strong>{formatClock(mission.timer)}</strong></div>
          <div className="bs-briefing__stat"><span>STRIKES</span><strong>{mission.maxStrikes}</strong></div>
          <div className="bs-briefing__stat"><span>MODULES</span><strong>{mission.modules.length}</strong></div>
        </div>

        {mission.special && (
          <p className="bs-briefing__special"><span>SPECIAL</span>{mission.special}</p>
        )}

        <button type="button" className="bs-btn bs-btn--primary bs-btn--big" onClick={onBegin}>
          BEGIN DEFUSAL
        </button>
      </div>
    </div>
  );
}
