/**
 * Mini Golf Journey — Statistics. A game-style card wall, not a table.
 */
import { WORLDS } from "../data/worlds.js";
import { LEVELS, levelsForWorld } from "../data/levels.js";
import { IconChevronLeft, IconChart, IconStar, IconBolt, IconTrophy, IconTarget, IconFlag } from "../components/Icons.jsx";

export default function MiniGolfStatistics({ state, onBack }) {
  const s = state.stats;
  const totalStars = LEVELS.length * 3;
  const best =
    s.bestScore == null
      ? "—"
      : s.bestScore === 0
        ? "Par"
        : s.bestScore < 0
          ? `${-s.bestScore} under`
          : `${s.bestScore} over`;

  const tiles = [
    { k: "Holes completed", v: `${s.levelsCompleted}/50`, icon: <IconFlag /> },
    { k: "Stars earned", v: `${s.starsEarned}/${totalStars}`, icon: <IconStar /> },
    { k: "Total shots", v: s.totalShots, icon: <IconChart /> },
    { k: "Hole in ones", v: s.holeInOnes, icon: <IconTarget /> },
    { k: "Worlds completed", v: `${s.worldsCompleted}/5`, icon: <IconTrophy /> },
    { k: "Best hole vs par", v: best, icon: <IconBolt /> },
    { k: "Play attempts", v: s.attempts, icon: <IconChart /> },
  ];

  return (
    <div className="mgj-screen mgj-stats">
      <header className="mgj-screen__head">
        <button type="button" className="mgj-btn mgj-btn--ghost mgj-btn--sm" onClick={onBack}>
          <IconChevronLeft /> Menu
        </button>
        <h2 className="mgj-screen__title">Statistics</h2>
        <span className="mgj-screen__count" />
      </header>

      <div className="mgj-screen__body">
        <div className="mgj-stats__grid">
          {tiles.map((t) => (
            <div className="mgj-stat" key={t.k}>
              <span className="mgj-stat__icon">{t.icon}</span>
              <span className="mgj-stat__v">{t.v}</span>
              <span className="mgj-stat__k">{t.k}</span>
            </div>
          ))}
        </div>

        <h3 className="mgj-stats__sub">By world</h3>
        <div className="mgj-stats__worlds">
          {WORLDS.map((w) => {
            const ls = levelsForWorld(w.id);
            let done = 0;
            let stars = 0;
            for (const l of ls) {
              const r = state.results[l.id];
              if (r?.completed) done += 1;
              stars += r?.stars || 0;
            }
            const locked = !state.unlockedWorlds.includes(w.id);
            return (
              <div className={`mgj-stats__world ${locked ? "is-locked" : ""}`} key={w.id}>
                <span className="mgj-stats__world-dot" style={{ background: w.palette.accent }} />
                <span className="mgj-stats__world-name">{w.name}</span>
                <span className="mgj-stats__world-bar">
                  <span style={{ width: `${(done / ls.length) * 100}%`, background: w.palette.accent }} />
                </span>
                <span className="mgj-stats__world-num">
                  {locked ? "Locked" : `${done}/10 · ${stars}★`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
