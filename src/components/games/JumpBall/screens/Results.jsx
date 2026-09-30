/** Jump Ball — result overlays: level complete, fail, endless game over. */
import { Icon } from "./icons.jsx";

const fmt = (t) => `${t.toFixed(1)}s`;

export function LevelComplete({ level, result, canNext, onNext, onReplay, onLevels }) {
  const { r, record, firstClear, fails, prevStars } = result;
  const under = r.time <= level.targetTime;
  return (
    <div className="jb-result-wrap">
      <div className="jb-panel jb-result">
        <p className="jb-result__kicker">LEVEL {level.id}</p>
        <h2 className="jb-result__title">LEVEL COMPLETE</h2>
        <div className="jb-result__stars">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`jb-bigstar${i < r.stars ? " is-on" : ""}`} style={{ animationDelay: `${120 + i * 140}ms` }}>
              <Icon name="star" />
            </span>
          ))}
        </div>
        {r.stars > prevStars && !firstClear && <p className="jb-result__badge">NEW STAR RECORD</p>}
        <dl className="jb-result__stats">
          <div>
            <dt>TIME</dt>
            <dd className={under ? "is-good" : ""}>{fmt(r.time)}</dd>
          </div>
          <div>
            <dt>BEST</dt>
            <dd>{fmt(record?.bestTime ?? r.time)}</dd>
          </div>
          <div>
            <dt>PERFECT</dt>
            <dd>{r.perfects}</dd>
          </div>
          <div>
            <dt>FALLS</dt>
            <dd>{fails}</dd>
          </div>
        </dl>
        <div className="jb-result__actions">
          {canNext ? (
            <button type="button" className="jb-btn jb-btn--primary" onClick={onNext}>
              NEXT LEVEL <Icon name="right" />
            </button>
          ) : (
            <p className="jb-result__end">{level.id === 50 ? "YOU CONQUERED EVERY WORLD" : "MORE LEVELS COMING"}</p>
          )}
          <div className="jb-result__row">
            <button type="button" className="jb-btn" onClick={onReplay}>
              <Icon name="retry" /> REPLAY
            </button>
            <button type="button" className="jb-btn" onClick={onLevels}>
              LEVELS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LevelFailed({ result, onRetry, onLevels }) {
  const spikes = result.r.cause === "spikes";
  return (
    <div className="jb-result-wrap jb-result-wrap--center">
      <div className="jb-panel jb-result jb-result--fail">
        <h2 className="jb-result__title">{spikes ? "OUCH!" : "MISSED!"}</h2>
        <p className="jb-result__sub">{spikes ? "Spikes pop the ball — steer around them." : "Steer earlier — aim for the next platform while you rise."}</p>
        <div className="jb-result__actions">
          <button type="button" className="jb-btn jb-btn--primary" onClick={onRetry} autoFocus>
            <Icon name="retry" /> RETRY
          </button>
          <button type="button" className="jb-btn jb-btn--ghost" onClick={onLevels}>
            LEVELS
          </button>
        </div>
        <p className="jb-result__key">SPACE / ENTER TO RETRY</p>
      </div>
    </div>
  );
}

export function EndlessOver({ result, onRetry, onMenu }) {
  const { r, best, newBest } = result;
  return (
    <div className="jb-result-wrap">
      <div className={`jb-panel jb-result${newBest ? " is-best" : ""}`}>
        <p className="jb-result__kicker">ENDLESS</p>
        {newBest && r.height > 0 && <p className="jb-result__badge">NEW BEST</p>}
        <div className="jb-result__height">
          {r.height}
          <small>M</small>
        </div>
        <dl className="jb-result__stats">
          <div>
            <dt>BEST</dt>
            <dd>{best} M</dd>
          </div>
          <div>
            <dt>STARS</dt>
            <dd>{r.stars}</dd>
          </div>
          <div>
            <dt>PERFECT</dt>
            <dd>{r.perfects}</dd>
          </div>
          <div>
            <dt>STREAK</dt>
            <dd>×{r.bestStreak}</dd>
          </div>
        </dl>
        <div className="jb-result__actions">
          <button type="button" className="jb-btn jb-btn--primary" onClick={onRetry}>
            <Icon name="retry" /> AGAIN
          </button>
          <button type="button" className="jb-btn jb-btn--ghost" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
