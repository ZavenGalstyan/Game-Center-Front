/** Color Platforms — compact LEVEL COMPLETE overlay. */
import { Icon } from "./icons.jsx";
import { fmtTime, ui } from "./ui.js";

export default function Results({ level, result, canNext, isLast, onNext, onRetry, onLevels }) {
  const r = result.summary;
  const got = r.stars.filter(Boolean).length;
  return (
    <div className="cp-veil">
      <div className={`cp-panel cp-results${isLast ? " is-final" : ""}`} role="dialog" aria-label="Level complete">
        <span className="cp-results__kicker">
          LEVEL {level.id} · {level.name}
        </span>
        <h2>{isLast ? "COLOR MASTER!" : "LEVEL COMPLETE"}</h2>
        <div className="cp-results__stars" aria-label={`${got} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={r.stars[i] ? "is-on" : ""} style={{ "--d": `${120 + i * 140}ms` }}>
              <Icon name="star" />
            </span>
          ))}
        </div>
        <dl className="cp-results__rows">
          <div>
            <dt>
              <Icon name="clock" /> TIME
            </dt>
            <dd>{fmtTime(r.time)}</dd>
          </div>
          <div>
            <dt>BEST</dt>
            <dd>
              {fmtTime(result.best)}
              {result.record && <em>NEW BEST</em>}
            </dd>
          </div>
          <div>
            <dt>
              <Icon name="fall" /> FALLS
            </dt>
            <dd>{r.falls}</dd>
          </div>
        </dl>
        {result.perfect && <p className="cp-results__perfect">PERFECT RUN — 3 STARS, NO FALLS</p>}
        <div className="cp-results__actions">
          {canNext && (
            <button type="button" className="cp-btn cp-btn--primary" onClick={onNext} {...ui}>
              <Icon name="next" /> NEXT LEVEL
            </button>
          )}
          <button type="button" className={`cp-btn${canNext ? "" : " cp-btn--primary"}`} onClick={onRetry} {...ui}>
            <Icon name="retry" /> RETRY
          </button>
          <button type="button" className="cp-btn" onClick={onLevels} {...ui}>
            <Icon name="grid" /> LEVELS
          </button>
        </div>
      </div>
    </div>
  );
}
