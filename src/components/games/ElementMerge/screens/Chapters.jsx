import { IconBack, IconLock } from "../components/uiIcons.jsx";
import { ElementIcon } from "../components/icons.jsx";
import { ELEMENTS } from "../data/elements.js";
import { CHAPTERS } from "../data/chapters.js";

/**
 * Chapters are discovery-driven, not hard-locked: a chapter "reveals" once
 * the player has found at least one element in it (Primal is always open).
 * Recipes never check this — it's purely a progress/flavor screen.
 */
export default function Chapters({ discoveredIds, onBack }) {
  const discoveredSet = new Set(discoveredIds);

  const chapters = CHAPTERS.map((c) => {
    const els = ELEMENTS.filter((e) => e.chapter === c.id);
    const found = els.filter((e) => discoveredSet.has(e.id));
    const revealed = c.n === 1 || found.length > 0;
    const sample = els.find((e) => discoveredSet.has(e.id)) || els[0];
    return { c, total: els.length, found: found.length, revealed, sample };
  });

  return (
    <div className="em-screen em-chapters">
      <div className="em-screen__head">
        <button type="button" className="em-icon-btn" onClick={onBack}><IconBack /></button>
        <h2>Chapters</h2>
      </div>
      <div className="em-chapters__grid">
        {chapters.map(({ c, total, found, revealed, sample }) => (
          <div key={c.id} className={`em-chapter-card${revealed ? "" : " em-chapter-card--locked"}${found === total ? " em-chapter-card--complete" : ""}`}>
            <div className="em-chapter-card__icon">
              {revealed ? <ElementIcon id={sample.id} family={sample.family} /> : <IconLock />}
            </div>
            <h3>{revealed ? c.name : `Chapter ${c.n}`}</h3>
            <p className="em-chapter-card__blurb">{revealed ? c.blurb : "Discover an element from this chapter to reveal it."}</p>
            <div className="em-chapter-card__bar">
              <div className="em-chapter-card__bar-fill" style={{ width: `${total ? (found / total) * 100 : 0}%` }} />
            </div>
            <span className="em-chapter-card__count">{revealed ? `${found} / ${total}` : "??? / " + total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
