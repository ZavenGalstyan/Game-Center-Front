/**
 * Pressure Bar — tap while the marker is inside the safe zone. The marker
 * position is driven straight to the DOM every animation frame (a ref, not
 * React state) so this module never re-renders the tree 60x/sec; only a
 * tap or a solved stop touches React state.
 */
import { useEffect, useRef, useState } from "react";
import { checkPressureTap } from "../systems/moduleLogic.js";

export default function PressureBarModule({ puzzle, solved, onSolve, onWrong }) {
  const [stopIndex, setStopIndex] = useState(0);
  const [flash, setFlash] = useState(null);
  const markerRef = useRef(null);
  const posRef = useRef(0);
  const rafRef = useRef(null);
  const startRef = useRef(performance.now());
  const doneRef = useRef(false);

  useEffect(() => {
    const zone = puzzle.zones[stopIndex];
    const period = zone ? zone.period : 1.6;
    const tick = (now) => {
      const t = (Math.sin(((now - startRef.current) / 1000) * ((2 * Math.PI) / period)) + 1) / 2;
      posRef.current = t;
      if (markerRef.current) markerRef.current.style.left = `${t * 100}%`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [stopIndex, puzzle]);

  const handleTap = () => {
    if (solved || doneRef.current) return;
    if (checkPressureTap(puzzle, stopIndex, posRef.current)) {
      setFlash("ok");
      setTimeout(() => setFlash(null), 220);
      const next = stopIndex + 1;
      if (next >= puzzle.requiredStops) {
        doneRef.current = true;
        onSolve();
      } else {
        setStopIndex(next);
      }
    } else {
      setFlash("bad");
      setTimeout(() => setFlash(null), 260);
      onWrong();
    }
  };

  const zone = puzzle.zones[stopIndex] || puzzle.zones[puzzle.zones.length - 1];

  return (
    <div className="bs-mod bs-mod--pressure">
      <p className="bs-mod__clue">{puzzle.ruleText} <span className="bs-mod__step">({stopIndex}/{puzzle.requiredStops})</span></p>
      <div
        className={`bs-pressure${flash ? ` is-${flash}` : ""}`}
        role="button"
        tabIndex={solved ? -1 : 0}
        aria-label="Tap when marker is in the safe zone"
        onClick={handleTap}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleTap(); } }}
      >
        <div className="bs-pressure__zone" style={{ left: `${(zone.center - puzzle.zoneWidth / 2) * 100}%`, width: `${puzzle.zoneWidth * 100}%` }} />
        <div ref={markerRef} className="bs-pressure__marker" style={{ left: "0%" }} />
      </div>
    </div>
  );
}
