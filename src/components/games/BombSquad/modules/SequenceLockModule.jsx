/**
 * Sequence Lock — a ring of fictional icons; enter them in the order the
 * posted rule describes (dot-count ascending, or reverse of the shown
 * ring order). Wrong pick resets progress + strike.
 */
import { useRef, useState } from "react";
import { SymbolIcon } from "../components/icons.jsx";
import { symbolValue } from "../data/symbols.js";
import { checkSequenceClick } from "../systems/moduleLogic.js";

export default function SequenceLockModule({ puzzle, solved, onSolve, onWrong }) {
  const [progress, setProgress] = useState(0);
  const [wrongId, setWrongId] = useState(null);
  const doneRef = useRef(false);

  const handlePick = (iconId) => {
    if (solved || doneRef.current) return;
    if (checkSequenceClick(puzzle, progress, iconId)) {
      const next = progress + 1;
      if (next >= puzzle.solutionOrder.length) {
        doneRef.current = true;
        onSolve();
      } else {
        setProgress(next);
      }
    } else {
      setProgress(0);
      setWrongId(iconId);
      setTimeout(() => setWrongId(null), 260);
      onWrong();
    }
  };

  const solvedIds = new Set(puzzle.solutionOrder.slice(0, progress));
  const n = puzzle.displayOrder.length;
  const r = 44;

  return (
    <div className="bs-mod bs-mod--seqlock">
      <p className="bs-mod__clue">{puzzle.ruleText}</p>
      <div className="bs-seqlock">
        {puzzle.displayOrder.map((id, i) => {
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
          const x = 50 + Math.cos(angle) * r;
          const y = 50 + Math.sin(angle) * r;
          return (
            <button
              key={id}
              type="button"
              className={`bs-seqlock__btn${solvedIds.has(id) ? " is-done" : ""}${wrongId === id ? " is-wrong" : ""}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => handlePick(id)}
              disabled={solved || solvedIds.has(id)}
            >
              <SymbolIcon id={id} value={symbolValue(id)} showValue />
            </button>
          );
        })}
      </div>
    </div>
  );
}
