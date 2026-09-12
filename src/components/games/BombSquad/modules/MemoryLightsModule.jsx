/**
 * Memory Lights — watch the flash sequence (150-300ms flashes), then repeat
 * it (forward or reversed, per puzzle.reverse). REPLAY re-watches for free.
 * All timeouts are tracked and cleared on unmount/replay — no leaked timers.
 */
import { useEffect, useRef, useState } from "react";
import { checkMemoryClick } from "../systems/moduleLogic.js";

const FLASH_MS = 220;
const GAP_MS = 160;

export default function MemoryLightsModule({ puzzle, solved, onSolve, onWrong }) {
  const [phase, setPhase] = useState("watch"); // watch | input
  const [active, setActive] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(false);
  const timers = useRef([]);
  const doneRef = useRef(false);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const schedule = (fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); return id; };

  const playback = () => {
    clearTimers();
    setPhase("watch");
    setProgress(0);
    puzzle.sequence.forEach((lightIndex, i) => {
      schedule(() => setActive(lightIndex), i * (FLASH_MS + GAP_MS));
      schedule(() => setActive(-1), i * (FLASH_MS + GAP_MS) + FLASH_MS);
    });
    schedule(() => setPhase("input"), puzzle.sequence.length * (FLASH_MS + GAP_MS));
  };

  useEffect(() => {
    playback();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = (lightIndex) => {
    if (solved || phase !== "input" || doneRef.current) return;
    if (checkMemoryClick(puzzle, progress, lightIndex)) {
      const next = progress + 1;
      if (next >= puzzle.sequence.length) {
        doneRef.current = true;
        onSolve();
      } else {
        setProgress(next);
      }
    } else {
      setProgress(0);
      setWrongFlash(true);
      schedule(() => setWrongFlash(false), 260);
      onWrong();
    }
  };

  return (
    <div className="bs-mod bs-mod--memory">
      <p className="bs-mod__clue">{puzzle.ruleText}</p>
      <div className={`bs-lights${wrongFlash ? " is-wrong" : ""}`} role="list">
        {Array.from({ length: puzzle.lights }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`bs-light${active === i ? " is-lit" : ""}`}
            onClick={() => handleClick(i)}
            disabled={solved || phase !== "input"}
            aria-label={`Light ${i + 1}`}
          />
        ))}
      </div>
      <div className="bs-mod__row">
        <span className="bs-mod__hint">{phase === "watch" ? "WATCH…" : `INPUT ${progress}/${puzzle.sequence.length}`}</span>
        <button type="button" className="bs-mod__confirm bs-mod__confirm--ghost" onClick={playback} disabled={solved}>
          REPLAY
        </button>
      </div>
    </div>
  );
}
