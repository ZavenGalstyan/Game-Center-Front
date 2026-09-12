/**
 * Symbol Match — reproduce the indicator strip's symbol order on the panel
 * below. Wrong tap resets progress (no strike-then-stuck softlock) + strike.
 */
import { useRef, useState } from "react";
import { SymbolIcon } from "../components/icons.jsx";
import { checkSymbolClick } from "../systems/moduleLogic.js";

export default function SymbolMatchModule({ puzzle, solved, onSolve, onWrong }) {
  const [progress, setProgress] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(null);
  const doneRef = useRef(false);

  const handleTap = (symbolId) => {
    if (solved || doneRef.current) return;
    if (checkSymbolClick(puzzle, progress, symbolId)) {
      const next = progress + 1;
      if (next >= puzzle.solutionOrder.length) {
        doneRef.current = true;
        onSolve();
      } else {
        setProgress(next);
      }
    } else {
      setProgress(0);
      setWrongFlash(symbolId);
      setTimeout(() => setWrongFlash(null), 260);
      onWrong();
    }
  };

  return (
    <div className="bs-mod bs-mod--symbols">
      <p className="bs-mod__clue">{puzzle.ruleText}</p>
      <div className="bs-symbol-strip" role="list" aria-label="Target order">
        {puzzle.clueOrder.map((id, i) => (
          <span key={i} className={`bs-symbol-strip__item${i < progress ? " is-done" : ""}`}>
            <SymbolIcon id={id} />
          </span>
        ))}
      </div>
      <div className="bs-symbol-grid" role="list">
        {puzzle.buttons.map((id, i) => (
          <button
            key={i}
            type="button"
            className={`bs-symbol-btn${wrongFlash === id ? " is-wrong" : ""}`}
            onClick={() => handleTap(id)}
            disabled={solved}
          >
            <SymbolIcon id={id} />
          </button>
        ))}
      </div>
    </div>
  );
}
