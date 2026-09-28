/**
 * Parking Jam — statistics, shown as licence plates bolted to a garage wall.
 */
import { Icon } from "../components/icons.jsx";
import { summary } from "../utils/progress.js";
import { TOTAL_LEVELS } from "../data/index.js";
import { WORLDS } from "../data/worlds.js";

function time(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function Statistics({ progress, onBack }) {
  const s = summary(progress);
  const st = progress.statistics;
  const plates = [
    ["Levels completed", `${s.completed}`, `of ${TOTAL_LEVELS}`],
    ["Cars cleared", `${st.carsCleared}`, "driven out"],
    ["Perfect levels", `${s.perfect}`, "three stars"],
    ["Total stars", `${s.stars}`, `of ${TOTAL_LEVELS * 3}`],
    ["Worlds completed", `${s.worldsCompleted}`, `of ${WORLDS.length}`],
    ["Blocked attempts", `${st.blockedAttempts}`, "bumps"],
    ["Hints used", `${st.hintsUsed}`, "tips"],
    ["Undo used", `${st.undoUsed}`, "reverses"],
    ["Restarts", `${st.restarts}`, "fresh starts"],
    ["Play time", time(st.playTimeMs), "at the wheel"],
  ];
  return (
    <div className="pj-stats">
      <header className="pj-head">
        <button type="button" className="pj-btn pj-btn--icon" onClick={onBack} aria-label="Back to menu"><Icon.back /></button>
        <h2 className="pj-head__title">Statistics</h2>
        <span className="pj-head__meta"><Icon.star className="is-on" /> {s.stars}</span>
      </header>
      <div className="pj-stats__wall">
        {plates.map(([label, value, sub], i) => (
          <div key={label} className="pj-license" style={{ "--tilt": `${((i * 37) % 5) - 2}deg` }}>
            <span className="pj-license__bolt" /><span className="pj-license__bolt is-r" />
            <span className="pj-license__label">{label}</span>
            <b className="pj-license__value">{value}</b>
            <span className="pj-license__sub">{sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
