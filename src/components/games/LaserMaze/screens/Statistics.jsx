/** Laser Maze — lifetime statistics (derived from the save; nothing to drift). */
import { Icon } from "../components/icons.jsx";
import { WORLDS } from "../data/worlds.js";
import { TOTAL_LEVELS } from "../data/index.js";
import { overall, worldSummary } from "../utils/progress.js";

function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h) return `${h}h ${m % 60}m`;
  if (m) return `${m}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 1000)}s`;
}

export default function Statistics({ progress, onBack }) {
  const o = overall(progress);
  const s = progress.stats;
  const tiles = [
    ["Levels completed", `${o.completed}`, `of ${TOTAL_LEVELS}`],
    ["Worlds completed", `${o.worldsCompleted}`, `of ${WORLDS.length}`],
    ["Total stars", `${o.stars}`, `of ${TOTAL_LEVELS * 3}`],
    ["Best-move solves", `${o.perfect}`, "3★ at par"],
    ["Total moves", `${s.totalMoves}`, "puzzle interactions"],
    ["Hints used", `${s.hintsUsed}`, ""],
    ["Level resets", `${s.resets}`, `${s.undos} undos`],
    ["Play time", fmtTime(s.playTimeMs), "in puzzles"],
  ];
  return (
    <div className="lm-screen lm-stats">
      <header className="lm-screen__head">
        <button type="button" className="lm-back" onClick={onBack}><Icon.back /> Menu</button>
        <h2>Statistics</h2>
        <span />
      </header>
      <div className="lm-stats__grid">
        {tiles.map(([label, v, sub]) => (
          <div key={label} className="lm-stile">
            <span>{label}</span>
            <b>{v}</b>
            {sub && <small>{sub}</small>}
          </div>
        ))}
      </div>
      <div className="lm-stats__worlds">
        {WORLDS.map((w) => {
          const sum = worldSummary(progress, w.id);
          return (
            <div key={w.id} className="lm-stats__world" style={{ "--wa": w.accent }}>
              <span>{w.id}</span>
              <i><i style={{ width: `${sum.completed * 10}%` }} /></i>
              <small>{sum.stars}★</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
