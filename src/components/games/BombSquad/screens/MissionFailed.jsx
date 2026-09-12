import { getOperation } from "../data/operations.js";

const REASON_TEXT = {
  time: "TIME EXPIRED",
  strikes: "STRIKE LIMIT REACHED",
};

export default function MissionFailed({ mission, result, onRetry, onMissionSelect }) {
  const op = getOperation(mission.operation);
  return (
    <div className="bs-result bs-result--failed" style={{ "--bs-accent": op.accent }}>
      <div className="bs-result__card">
        <p className="bs-result__eyebrow">DEVICE POWERED DOWN</p>
        <h2 className="bs-result__title">MISSION FAILED</h2>
        <p className="bs-result__reason">{REASON_TEXT[result.failReason] || "DEFUSAL FAILED"}</p>

        <div className="bs-result__grid">
          <div className="bs-result__stat"><span>STRIKES</span><strong>{result.strikes}/{result.maxStrikes}</strong></div>
          <div className="bs-result__stat"><span>MODULES SOLVED</span><strong>{result.solvedTypes.length}/{result.moduleCount}</strong></div>
        </div>

        <div className="bs-result__actions">
          <button type="button" className="bs-btn bs-btn--primary" onClick={onRetry}>RETRY</button>
          <button type="button" className="bs-btn bs-btn--ghost" onClick={onMissionSelect}>MISSION SELECT</button>
        </div>
      </div>
    </div>
  );
}
