/**
 * Code Chip — select the chips in the order the posted rule demands
 * (ascending number, or a color-priority legend). Wrong pick resets
 * progress + strike.
 */
import { useRef, useState } from "react";
import { SymbolIcon } from "../components/icons.jsx";
import { checkChipClick } from "../systems/moduleLogic.js";

export default function CodeChipModule({ puzzle, solved, onSolve, onWrong }) {
  const [progress, setProgress] = useState(0);
  const [wrongId, setWrongId] = useState(null);
  const doneRef = useRef(false);

  const handlePick = (chipId) => {
    if (solved || doneRef.current) return;
    if (checkChipClick(puzzle, progress, chipId)) {
      const next = progress + 1;
      if (next >= puzzle.solutionOrder.length) {
        doneRef.current = true;
        onSolve();
      } else {
        setProgress(next);
      }
    } else {
      setProgress(0);
      setWrongId(chipId);
      setTimeout(() => setWrongId(null), 260);
      onWrong();
    }
  };

  const solvedIds = new Set(puzzle.solutionOrder.slice(0, progress));

  return (
    <div className="bs-mod bs-mod--chips">
      <p className="bs-mod__clue">{puzzle.ruleText}</p>
      {puzzle.priorityColors && (
        <div className="bs-chip-legend">
          {puzzle.priorityColors.map((c, i) => (
            <span key={c} className={`bs-chip-legend__item bs-chip-legend__item--${c}`}>{i + 1}. {c.toUpperCase()}</span>
          ))}
        </div>
      )}
      <div className="bs-chip-grid" role="list">
        {puzzle.chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`bs-chip bs-chip--${chip.color}${solvedIds.has(chip.id) ? " is-done" : ""}${wrongId === chip.id ? " is-wrong" : ""}`}
            onClick={() => handlePick(chip.id)}
            disabled={solved || solvedIds.has(chip.id)}
          >
            <SymbolIcon id={chip.symbol} />
            <span className="bs-chip__num">{chip.number}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
