import { THEMES } from "../data/themes.js";

function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Stack Tower — statistics arranged around a tower silhouette. */
export default function Statistics({ progress: p, onBack }) {
  const avg = p.totalRuns ? (p.totalBlocks / p.totalRuns).toFixed(1) : "0";
  const left = [
    ["RUNS PLAYED", p.totalRuns],
    ["TOTAL BLOCKS", p.totalBlocks],
    ["AVERAGE HEIGHT", avg],
    ["CUT PIECES", p.totalCutPieces],
  ];
  const right = [
    ["PERFECTS", p.totalPerfects],
    ["BEST STREAK", p.bestPerfectStreak],
    ["THEMES", `${p.unlockedThemes.length}/${THEMES.length}`],
    ["PLAY TIME", fmtTime(p.totalPlayTime)],
  ];
  // silhouette: slabs narrowing and drifting like a real run
  const slabs = Array.from({ length: 11 }, (_, i) => {
    const w = 64 - i * 3.4 - (i % 3) * 1.5;
    const x = 50 - w / 2 + Math.sin(i * 1.7) * 3;
    return { x, y: 150 - (i + 1) * 11.5, w };
  });
  return (
    <div className="st-screen">
      <div className="st-panel st-sheet">
        <header className="st-sheet__head">
          <button type="button" className="st-iconbtn" onClick={onBack} aria-label="Back">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2>STATISTICS</h2>
        </header>
        <div className="st-stats">
          <ul className="st-stats__col">
            {left.map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </li>
            ))}
          </ul>
          <div className="st-stats__tower">
            <svg viewBox="0 0 100 170" aria-hidden="true">
              <rect x="22" y="150" width="56" height="20" rx="1.5" className="st-sil-base" />
              {slabs.map((s, i) => (
                <rect key={i} x={s.x} y={s.y} width={s.w} height="10" rx="1.2" className="st-sil" style={{ opacity: 0.45 + i * 0.05 }} />
              ))}
            </svg>
            <div className="st-stats__best">
              <span>BEST HEIGHT</span>
              <b>{p.bestHeight}</b>
            </div>
          </div>
          <ul className="st-stats__col st-stats__col--r">
            {right.map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
