import { IconBack } from "../components/uiIcons.jsx";
import { ELEMENTS, getElement } from "../data/elements.js";
import { CHAPTERS } from "../data/chapters.js";

function fmtTime(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Statistics({ statistics, discoveredIds, onBack }) {
  const discoveredSet = new Set(discoveredIds);
  const chaptersCompleted = CHAPTERS.filter((c) => {
    const els = ELEMENTS.filter((e) => e.chapter === c.id);
    return els.length > 0 && els.every((e) => discoveredSet.has(e.id));
  }).length;

  const usageEntries = Object.entries(statistics.elementUsage || {});
  const mostUsed = usageEntries.sort((a, b) => b[1] - a[1])[0];
  const mostUsedEl = mostUsed ? getElement(mostUsed[0]) : null;

  const chapterCounts = new Map();
  for (const id of discoveredIds) {
    const el = getElement(id);
    if (el) chapterCounts.set(el.chapter, (chapterCounts.get(el.chapter) || 0) + 1);
  }
  const favChapter = [...chapterCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const favChapterName = favChapter ? CHAPTERS.find((c) => c.id === favChapter[0])?.name : "—";

  const rows = [
    ["Total discoveries", statistics.totalDiscoveries],
    ["Total combinations", statistics.totalCombinations],
    ["Successful combinations", statistics.successfulCombinations],
    ["Failed combinations", statistics.failedCombinations],
    ["Unique recipes found", statistics.uniqueRecipesFound],
    ["Most used element", mostUsedEl ? mostUsedEl.name : "—"],
    ["Favorite category", favChapterName || "—"],
    ["Hints used", statistics.hintsUsed],
    ["Chapters completed", `${chaptersCompleted} / ${CHAPTERS.length}`],
    ["Play time", fmtTime(statistics.playTimeMs)],
  ];

  return (
    <div className="em-screen em-stats">
      <div className="em-screen__head">
        <button type="button" className="em-icon-btn" onClick={onBack}><IconBack /></button>
        <h2>Statistics</h2>
      </div>
      <div className="em-stats__grid">
        {rows.map(([label, value]) => (
          <div key={label} className="em-stat-tile">
            <span className="em-stat-tile__value">{value}</span>
            <span className="em-stat-tile__label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
