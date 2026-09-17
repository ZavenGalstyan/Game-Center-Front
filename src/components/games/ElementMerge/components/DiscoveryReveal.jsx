import { useEffect } from "react";
import { ElementIcon } from "./icons.jsx";
import { getElement } from "../data/elements.js";
import { chapterInfo } from "../data/chapters.js";

const MILESTONES = new Set([
  "life", "human", "city", "electricity", "computer", "robot", "rocket", "planet", "galaxy", "black_hole",
]);

/**
 * Centered discovery reveal. `discoveryNumber` is the element's 1-based
 * order among the player's own discoveries (starters excluded), matching
 * the "DISCOVERY #12" style called for in the brief. Auto-dismiss keeps it
 * from blocking play too long; a click/keypress continues immediately.
 */
export default function DiscoveryReveal({ elementId, discoveryNumber, onContinue }) {
  const el = getElement(elementId);
  const milestone = MILESTONES.has(elementId);

  useEffect(() => {
    const t = setTimeout(onContinue, milestone ? 1600 : 1100);
    const onKey = () => onContinue();
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [onContinue, milestone]);

  if (!el) return null;
  const chapter = chapterInfo(el.chapter);

  return (
    <div className={`em-reveal${milestone ? " em-reveal--milestone" : ""}`} onClick={onContinue} role="dialog" aria-label={`New discovery: ${el.name}`}>
      <div className="em-reveal__card" onClick={(e) => e.stopPropagation()}>
        <span className="em-reveal__label">New Discovery</span>
        <div className="em-reveal__art"><ElementIcon id={el.id} family={el.family} /></div>
        <h2 className="em-reveal__name">{el.name}</h2>
        <p className="em-reveal__desc">{el.desc}</p>
        <div className="em-reveal__meta">
          <span>{chapter?.name}</span>
          <span className="em-reveal__dot">•</span>
          <span>Discovery #{discoveryNumber}</span>
        </div>
        <button type="button" className="em-btn em-btn--ghost" onClick={onContinue}>Continue</button>
      </div>
    </div>
  );
}
