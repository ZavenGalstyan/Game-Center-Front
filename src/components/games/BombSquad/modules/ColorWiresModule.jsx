/**
 * Color Wires — cut the single wire the posted rule points to. Wrong cuts
 * mark that wire "burnt" (disabled) and strike; other wires stay live so
 * the player can still find the right one. Fully fictional puzzle rules —
 * see systems/moduleLogic.js generateColorWires()/checkWireCut().
 */
import { useRef, useState } from "react";
import { checkWireCut } from "../systems/moduleLogic.js";

const DASH = { red: "0", blue: "0", yellow: "4 2", green: "1 3", white: "6 2", purple: "2 2" };

export default function ColorWiresModule({ puzzle, solved, onSolve, onWrong }) {
  const [burnt, setBurnt] = useState(() => new Set());
  const doneRef = useRef(false);

  const handleCut = (wireId) => {
    if (solved || doneRef.current || burnt.has(wireId)) return;
    if (checkWireCut(puzzle, wireId)) {
      doneRef.current = true;
      onSolve();
    } else {
      setBurnt((s) => new Set(s).add(wireId));
      onWrong();
    }
  };

  const h = puzzle.wires.length * 30 + 12;

  return (
    <div className="bs-mod bs-mod--wires">
      <p className="bs-mod__clue">
        {puzzle.serial && <span className="bs-mod__serial">SERIAL: {puzzle.serial.toUpperCase()}</span>}
        {puzzle.ruleText}
      </p>
      <svg className="bs-wires" viewBox={`0 0 220 ${h}`} preserveAspectRatio="none" role="list">
        {puzzle.wires.map((w, i) => {
          const y = 16 + i * 30;
          const isBurnt = burnt.has(w.id);
          const d = `M8,${y} C 70,${y - 9} 150,${y + 9} 212,${y}`;
          return (
            <g key={w.id} role="listitem" aria-label={`${w.color} wire`} className={`bs-wire${isBurnt ? " is-burnt" : ""}`}>
              <rect x="2" y={y - 6} width="10" height="12" rx="2" className="bs-wire__cap" />
              <rect x="208" y={y - 6} width="10" height="12" rx="2" className="bs-wire__cap" />
              <path d={d} className={`bs-wire__strand bs-wire__strand--${w.color}`} strokeDasharray={DASH[w.color]} />
              <path
                d={d}
                className="bs-wire__hit"
                onClick={() => handleCut(w.id)}
                role="button"
                tabIndex={solved || isBurnt ? -1 : 0}
                aria-disabled={solved || isBurnt}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleCut(w.id); } }}
              />
              {isBurnt && <text x="110" y={y + 4} textAnchor="middle" className="bs-wire__mark">✕</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
