/**
 * Switch Order — set every switch UP/DOWN to match the coded rule, then
 * CONFIRM. Toggling is free (no strike); only a wrong CONFIRM strikes, so
 * players can experiment without being punished for exploring.
 */
import { useRef, useState } from "react";
import { checkSwitchConfirm } from "../systems/moduleLogic.js";

export default function SwitchOrderModule({ puzzle, solved, onSolve, onWrong }) {
  const [states, setStates] = useState(() => puzzle.switches.map(() => false));
  const [shake, setShake] = useState(false);
  const doneRef = useRef(false);

  const toggle = (i) => {
    if (solved) return;
    setStates((s) => s.map((v, idx) => (idx === i ? !v : v)));
  };

  const confirm = () => {
    if (solved || doneRef.current) return;
    if (checkSwitchConfirm(puzzle, states)) {
      doneRef.current = true;
      onSolve();
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 300);
      onWrong();
    }
  };

  return (
    <div className="bs-mod bs-mod--switches">
      <p className="bs-mod__clue">{puzzle.ruleText}</p>
      <div className={`bs-switch-row${shake ? " is-wrong" : ""}`} role="list">
        {puzzle.switches.map((sw, i) => (
          <div key={sw.id} className="bs-switch" role="listitem">
            <span className={`bs-switch__led bs-switch__led--${sw.led}`} aria-hidden="true" />
            <button
              type="button"
              className={`bs-switch__lever${states[i] ? " is-up" : ""}`}
              onClick={() => toggle(i)}
              disabled={solved}
              aria-pressed={states[i]}
              aria-label={`Switch ${sw.label}, currently ${states[i] ? "up" : "down"}`}
            >
              <span className="bs-switch__nub" />
            </button>
            <span className="bs-switch__label">{sw.label}</span>
          </div>
        ))}
      </div>
      <button type="button" className="bs-mod__confirm" onClick={confirm} disabled={solved}>
        CONFIRM
      </button>
    </div>
  );
}
