/**
 * Rotary Dial — drag (mouse/touch) or use arrow keys to rotate the dial to
 * the target value(s), LOCK to submit each step. Multi-step combinations
 * (harder missions) require locking in the right value several times in a
 * row, in order.
 */
import { useCallback, useRef, useState } from "react";
import { checkDialStep } from "../systems/moduleLogic.js";

const POSITIONS = 12;
const STEP_DEG = 360 / POSITIONS;

function angleOf(cx, cy, x, y) {
  const deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90;
  return (deg + 360) % 360;
}

export default function RotaryDialModule({ puzzle, solved, onSolve, onWrong }) {
  const [rotation, setRotation] = useState(0);
  const [step, setStep] = useState(0);
  const [flash, setFlash] = useState(null); // "ok" | "bad" | null
  const svgRef = useRef(null);
  const dragging = useRef(false);
  const doneRef = useRef(false);

  const snapIndex = Math.round(rotation / STEP_DEG) % POSITIONS;

  const onPointerDown = (e) => {
    if (solved) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current || solved) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setRotation(angleOf(cx, cy, e.clientX, e.clientY));
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setRotation((r) => Math.round(r / STEP_DEG) * STEP_DEG);
  };

  const nudge = (dir) => {
    if (solved) return;
    setRotation((r) => (Math.round(r / STEP_DEG) * STEP_DEG + dir * STEP_DEG + 360) % 360);
  };

  const lock = useCallback(() => {
    if (solved || doneRef.current) return;
    const value = Math.round(rotation / STEP_DEG) % POSITIONS;
    if (checkDialStep(puzzle, step, value)) {
      const next = step + 1;
      setFlash("ok");
      setTimeout(() => setFlash(null), 240);
      if (next >= puzzle.targets.length) {
        doneRef.current = true;
        onSolve();
      } else {
        setStep(next);
      }
    } else {
      setFlash("bad");
      setTimeout(() => setFlash(null), 260);
      onWrong();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotation, step, solved, puzzle]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); nudge(1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); lock(); }
  };

  const cx = 60, cy = 60, r = 46;

  return (
    <div className="bs-mod bs-mod--dial">
      <p className="bs-mod__clue">
        {puzzle.ruleText}
        {puzzle.targets.length > 1 && <span className="bs-mod__step"> (step {step + 1}/{puzzle.targets.length})</span>}
      </p>
      <svg
        ref={svgRef}
        className={`bs-dial${flash ? ` is-${flash}` : ""}`}
        viewBox="0 0 120 120"
        width="140"
        height="140"
        role="slider"
        tabIndex={solved ? -1 : 0}
        aria-valuenow={snapIndex}
        aria-valuetext={puzzle.positions[snapIndex]}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <circle cx={cx} cy={cy} r={r + 8} className="bs-dial__rim" />
        {puzzle.positions.map((label, i) => {
          const a = ((i * STEP_DEG - 90) * Math.PI) / 180;
          const tx = cx + Math.cos(a) * (r + 2);
          const ty = cy + Math.sin(a) * (r + 2);
          return (
            <text key={i} x={tx} y={ty + 3} textAnchor="middle" className={`bs-dial__tick${i === snapIndex ? " is-active" : ""}`}>
              {label}
            </text>
          );
        })}
        <circle cx={cx} cy={cy} r={10} className="bs-dial__hub" />
        <line
          x1={cx}
          y1={cy}
          x2={cx + Math.sin((rotation * Math.PI) / 180) * (r - 10)}
          y2={cy - Math.cos((rotation * Math.PI) / 180) * (r - 10)}
          className="bs-dial__pointer"
        />
      </svg>
      <button type="button" className="bs-mod__confirm" onClick={lock} disabled={solved}>
        LOCK
      </button>
    </div>
  );
}
