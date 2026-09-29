import { getTheme } from "../data/themes.js";

/** Stack Tower — compact result card; the pulled-back tower stays visible. */
export default function GameOver({ result, onRetry, onMenu }) {
  const { run, newBest, unlocked, best } = result;
  return (
    <div className="st-result-wrap">
      <div className={`st-panel st-result${newBest && run.height > 0 ? " is-best" : ""}`} role="dialog" aria-label="Run result">
        {newBest && run.height > 0 ? <p className="st-result__badge">NEW BEST!</p> : <p className="st-result__kicker">TOWER HEIGHT</p>}
        <p className="st-result__height">{run.height}</p>
        <dl className="st-result__stats">
          <div>
            <dt>BEST</dt>
            <dd>{best}</dd>
          </div>
          <div>
            <dt>PERFECTS</dt>
            <dd>{run.perfects}</dd>
          </div>
          <div>
            <dt>BEST STREAK</dt>
            <dd>{run.bestStreak}</dd>
          </div>
        </dl>
        {unlocked.length > 0 && (
          <p className="st-result__unlock">
            THEME UNLOCKED: <b>{unlocked.map((id) => getTheme(id).name).join(", ")}</b>
          </p>
        )}
        <div className="st-result__actions">
          <button type="button" className="st-btn st-btn--primary" onClick={onRetry} autoFocus>
            RETRY
          </button>
          <button type="button" className="st-btn st-btn--ghost" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
