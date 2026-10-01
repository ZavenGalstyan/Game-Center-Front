/** Jump Ball — statistics, as an arcade scoreboard (not a dashboard). */
import { Icon } from "./icons.jsx";
import { LEVELS } from "../data/levels.js";
import { levelsDone, totalStars } from "../utils/storage.js";

function time(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h) return `${h}H ${m % 60}M`;
  return `${m}M ${Math.floor((ms % 60000) / 1000)}S`;
}

export default function Statistics({ progress, onBack }) {
  const s = progress.stats;
  const hero = [
    { icon: "flag", label: "LEVELS", value: `${levelsDone(progress)}/${LEVELS.length}` },
    { icon: "star", label: "STARS", value: `${totalStars(progress)}/${LEVELS.length * 3}` },
    { icon: "up", label: "BEST ENDLESS", value: `${s.bestEndless} M` },
  ];
  const rows = [
    ["TOTAL BOUNCES", s.bounces],
    ["PERFECT LANDINGS", s.perfects],
    ["BEST PERFECT STREAK", `×${s.bestStreak}`],
    ["TOTAL FALLS", s.falls],
    ["MOVING PLATFORMS LANDED", s.moving],
    ["SPRING BOUNCES", s.springs],
    ["BREAKING PLATFORMS USED", s.breaks],
    ["ENDLESS RUNS", s.endlessRuns],
    ["TOTAL PLAY TIME", time(s.playMs)],
  ];
  return (
    <div className="jb-screen">
      <div className="jb-panel jb-sheet">
        <header className="jb-sheet__head">
          <button type="button" className="jb-iconbtn" aria-label="Back" onClick={onBack}>
            <Icon name="back" />
          </button>
          <h2>STATISTICS</h2>
        </header>
        <div className="jb-stats__hero">
          {hero.map((h) => (
            <div key={h.label} className="jb-stats__big">
              <Icon name={h.icon} />
              <strong>{h.value}</strong>
              <span>{h.label}</span>
            </div>
          ))}
        </div>
        <ul className="jb-stats__list">
          {rows.map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              <i />
              <b>{v}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
