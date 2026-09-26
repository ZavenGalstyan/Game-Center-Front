/**
 * Rooftop Sniper — Mission Failed: shows why (out of ammo / time expired)
 * and lets the player retry immediately or back out to Mission Select.
 */
const REASON_TEXT = {
  "OUT OF AMMO": "You ran out of ammunition before completing the objective.",
  "TIME EXPIRED": "Time ran out before completing the objective.",
};

export default function MissionFailed({ mission, result, onRetry, onSelect }) {
  return (
    <div className="rs-result">
      <div className="rs-result__card rs-result__card--failed">
        <p className="rs-result__eyebrow">MISSION FAILED</p>
        <h1>{mission.name}</h1>
        <p className="rs-result__reason">{REASON_TEXT[result.reason] || result.reason}</p>
        <div className="rs-result__stats">
          <Stat label="SHOTS" value={result.shotsFired} />
          <Stat label="HITS" value={result.hits} />
          <Stat label="ACCURACY" value={`${Math.round(result.accuracy * 100)}%`} />
        </div>
        <div className="rs-result__actions">
          <button type="button" className="rs-btn rs-btn--primary" onClick={onRetry}>RETRY</button>
          <button type="button" className="rs-btn" onClick={onSelect}>MISSION SELECT</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rs-result__stat">
      <span className="rs-result__stat-label">{label}</span>
      <span className="rs-result__stat-value">{value}</span>
    </div>
  );
}
