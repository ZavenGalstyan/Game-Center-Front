/**
 * Parking Master — level complete / failed screen.
 */

import { formatTime } from "../utils/scoring.js";

function Stars({ n, big }) {
  return (
    <span className={`pm-stars${big ? " pm-stars--big" : ""}`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < n ? "is-filled" : ""} aria-hidden>
          <path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.4 3.3L6.9 14.3 2 9.4l7-.9z" />
        </svg>
      ))}
    </span>
  );
}

export default function ParkingResults({
  level,
  worldName,
  outcome, // "complete" | "failed"
  run,
  best,
  hasNext,
  onNext,
  onReplay,
  onSelect,
}) {
  if (outcome === "failed") {
    return (
      <div className="pm-screen pm-results pm-results--fail">
        <div className="pm-card">
          <p className="pm-card__eyebrow">{worldName} · Level {String(level.index).padStart(2, "0")}</p>
          <h2 className="pm-card__title">Level Failed</h2>
          <p className="pm-card__line">{run?.reason || "Too many collisions"}</p>
          <div className="pm-card__actions">
            <button type="button" className="pm-btn pm-btn--primary" onClick={onReplay}>Retry</button>
            <button type="button" className="pm-btn" onClick={onSelect}>Level Select</button>
          </div>
        </div>
      </div>
    );
  }

  const perfect = run.perfect;
  return (
    <div className="pm-screen pm-results">
      <div className="pm-card pm-card--wide">
        <p className="pm-card__eyebrow">{worldName} · Level {String(level.index).padStart(2, "0")}</p>
        <h2 className="pm-card__title">{perfect ? "Perfect Park!" : "Parking Complete"}</h2>

        <Stars n={run.stars} big />

        <div className="pm-results__grid">
          <Row label="Time" value={formatTime(run.time)} />
          <Row label="Precision" value={`${run.precision}%`} />
          <Row label="Collisions" value={run.collisions + (run.coneHits ? ` (+${run.coneHits} cones)` : "")} />
          <Row label="Score" value={run.score.toLocaleString()} />
          <Row label="Best Time" value={formatTime(best?.bestTime ?? run.time)} />
          <Row label="Best Precision" value={`${best?.bestPrecision ?? run.precision}%`} />
        </div>

        <div className="pm-card__actions">
          {hasNext && (
            <button type="button" className="pm-btn pm-btn--primary" onClick={onNext}>Next Level</button>
          )}
          <button type="button" className="pm-btn" onClick={onReplay}>Replay</button>
          <button type="button" className="pm-btn" onClick={onSelect}>Level Select</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="pm-results__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
