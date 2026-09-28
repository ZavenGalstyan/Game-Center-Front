/**
 * Boxing Club — fight record, presented like a locker-room record board.
 */
import { Icon } from "../components/icons.jsx";

function time(ms) {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function Statistics({ progress, onBack }) {
  const s = progress.statistics;
  const acc = s.punchesThrown ? Math.round((s.punchesLanded / s.punchesThrown) * 100) : 0;
  const groups = [
    ["RECORD", [["Fights", s.fights], ["Wins", s.wins], ["Losses", s.losses], ["KOs", s.kos], ["Rounds won", s.roundsWon], ["Championships", s.championships]]],
    ["OFFENCE", [["Punches thrown", s.punchesThrown], ["Punches landed", s.punchesLanded], ["Accuracy", `${acc}%`], ["Jabs landed", s.jabsLanded], ["Crosses landed", s.crossesLanded], ["Hooks landed", s.hooksLanded], ["Body shots", s.bodyShots], ["Counters", s.counters]]],
    ["DEFENCE", [["Blocks", s.blocks], ["Dodges", s.dodges], ["Perfect dodges", s.perfectDodges], ["Knockdowns scored", s.knockdownsScored], ["Knockdowns received", s.knockdownsReceived]]],
    ["GYM", [["Training sessions", s.trainingSessions], ["Total fight time", time(s.fightTimeMs)]]],
  ];
  return (
    <div className="bc-stats">
      <header className="bc-head">
        <button type="button" className="bc-btn bc-btn--icon" onClick={onBack} aria-label="Back"><Icon.back /></button>
        <h2 className="bc-head__title">Statistics</h2>
        <span className="bc-head__meta">{progress.fighter.name}</span>
      </header>
      <div className="bc-board">
        <div className="bc-board__hero">
          <span className="bc-board__label">PRO RECORD</span>
          <b className="bc-board__record">{s.wins}–{s.losses}{s.draws ? `–${s.draws}` : ""}</b>
          <span className="bc-board__kos">{s.kos} KO{s.kos === 1 ? "" : "s"}</span>
          {progress.champion && <span className="bc-board__belt"><Icon.trophy /> CHAMPION</span>}
        </div>
        {groups.map(([title, rows]) => (
          <section key={title} className="bc-board__col">
            <h3>{title}</h3>
            <dl>
              {rows.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
