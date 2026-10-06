/** Color Platforms — statistics (only things the sim actually measures). */
import { Icon } from "./icons.jsx";
import { LEVELS } from "../data/levels/index.js";
import { levelsDone, totalStars } from "../utils/storage.js";
import { ui, fmtTime } from "./ui.js";

const fmtPlay = (ms) => {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m ${Math.floor((ms % 60000) / 1000)}s`;
};

export default function Statistics({ progress, onBack }) {
  const s = progress.stats;
  const bests = Object.entries(progress.bestTimes)
    .map(([id, t]) => ({ id: Number(id), t }))
    .sort((a, b) => a.id - b.id);
  const total = bests.reduce((n, b) => n + b.t, 0);
  const rows = [
    ["LEVELS COMPLETED", `${levelsDone(progress)}/${LEVELS.length}`],
    ["TOTAL STARS", `${totalStars(progress)}/${LEVELS.length * 3}`],
    ["PERFECT LEVELS", Object.keys(progress.perfect).length],
    ["TOTAL JUMPS", s.jumps],
    ["COLOR SWITCHES", s.switches],
    ["BLUE SWITCHES", s.BLUE, "b"],
    ["RED SWITCHES", s.RED, "r"],
    ["YELLOW SWITCHES", s.YELLOW, "y"],
    ["FALLS", s.falls],
    ["CHECKPOINTS", s.checkpoints],
    ["MOVING LANDINGS", s.moving],
    ["FADING PLATFORMS USED", s.fades],
    ["BOUNCE JUMPS", s.bounces],
    ["PLAY TIME", fmtPlay(s.playMs)],
  ];
  return (
    <div className="cp-screen">
      <div className="cp-panel cp-sheet">
        <header className="cp-sheet__head">
          <button type="button" className="cp-iconbtn" aria-label="Back" onClick={onBack} {...ui}>
            <Icon name="back" />
          </button>
          <h2>STATISTICS</h2>
        </header>
        <div className="cp-stats">
          <dl className="cp-stats__grid">
            {rows.map(([k, v, c]) => (
              <div key={k} className={c ? `is-${c}` : ""}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="cp-stats__best">
            <h3>
              <Icon name="clock" /> BEST TIMES
            </h3>
            {bests.length === 0 ? (
              <p className="cp-empty">Finish a level to set a time.</p>
            ) : (
              <ol>
                {bests.map((b) => (
                  <li key={b.id}>
                    <span>
                      {b.id}. {LEVELS[b.id - 1]?.name}
                    </span>
                    <b>{fmtTime(b.t)}</b>
                  </li>
                ))}
              </ol>
            )}
            {bests.length > 1 && (
              <p className="cp-stats__sum">
                SUM <b>{fmtTime(total)}</b>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
