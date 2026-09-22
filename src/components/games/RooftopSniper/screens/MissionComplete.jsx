/**
 * Rooftop Sniper — Mission Complete: time, shots, hits, accuracy, stars.
 */
export default function MissionComplete({ mission, result, hasNext, onNext, onReplay, onSelect }) {
  const accuracyPct = Math.round(result.accuracy * 100);
  return (
    <div className="rs-result">
      <div className="rs-result__card rs-result__card--success">
        <p className="rs-result__eyebrow">MISSION COMPLETE</p>
        <h1>{mission.name}</h1>
        <div className="rs-result__stars">
          {"★".repeat(result.stars)}
          {"☆".repeat(3 - result.stars)}
        </div>
        <div className="rs-result__stats">
          <Stat label="TIME" value={`${result.timeElapsed.toFixed(1)}s`} />
          <Stat label="SHOTS" value={result.shotsFired} />
          <Stat label="HITS" value={result.hits} />
          <Stat label="ACCURACY" value={`${accuracyPct}%`} />
        </div>
        <div className="rs-result__actions">
          {hasNext && (
            <button type="button" className="rs-btn rs-btn--primary" onClick={onNext}>NEXT MISSION</button>
          )}
          <button type="button" className="rs-btn" onClick={onReplay}>REPLAY</button>
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
