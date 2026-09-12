/**
 * Grid Link — trace a path from START to END, moving only right or down,
 * never touching a restricted cell. Click the last node you placed to undo
 * it for free; any other invalid click strikes but keeps your progress.
 */
import { useRef, useState } from "react";
import { checkGridStep } from "../systems/moduleLogic.js";

const CELL = 30;
const PAD = 16;
const key = (p) => `${p.x},${p.y}`;

export default function GridLinkModule({ puzzle, solved, onSolve, onWrong }) {
  const [path, setPath] = useState(() => [puzzle.start]);
  const [wrongId, setWrongId] = useState(null);
  const doneRef = useRef(false);

  const pathIds = new Set(path.map(key));
  const last = path[path.length - 1];

  const handleClick = (cell) => {
    if (solved || doneRef.current) return;
    if (path.length > 1 && cell.x === last.x && cell.y === last.y) {
      setPath((p) => p.slice(0, -1)); // undo, free
      return;
    }
    const { valid, isEnd } = checkGridStep(puzzle, path, cell);
    if (!valid) {
      setWrongId(key(cell));
      setTimeout(() => setWrongId(null), 260);
      onWrong();
      return;
    }
    const next = [...path, cell];
    setPath(next);
    if (isEnd) {
      doneRef.current = true;
      onSolve();
    }
  };

  const { w, h } = puzzle.size;
  const vw = PAD * 2 + (w - 1) * CELL;
  const vh = PAD * 2 + (h - 1) * CELL;

  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x, y });

  return (
    <div className="bs-mod bs-mod--grid">
      <p className="bs-mod__clue">{puzzle.ruleText}</p>
      <svg className="bs-gridlink" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
        {path.slice(1).map((p, i) => {
          const a = path[i];
          return (
            <line
              key={`l${i}`}
              x1={PAD + a.x * CELL} y1={PAD + a.y * CELL}
              x2={PAD + p.x * CELL} y2={PAD + p.y * CELL}
              className="bs-gridlink__line"
            />
          );
        })}
        {cells.map((c) => {
          const id = key(c);
          const isStart = c.x === puzzle.start.x && c.y === puzzle.start.y;
          const isEnd = c.x === puzzle.end.x && c.y === puzzle.end.y;
          const isRestricted = puzzle.restrictedIds.has(id);
          const isOnPath = pathIds.has(id);
          const cx = PAD + c.x * CELL;
          const cy = PAD + c.y * CELL;
          return (
            <g key={id}>
              <circle
                cx={cx}
                cy={cy}
                r="9"
                role="button"
                tabIndex={solved ? -1 : 0}
                className={`bs-gridlink__cell${isStart ? " is-start" : ""}${isEnd ? " is-end" : ""}${isRestricted ? " is-restricted" : ""}${isOnPath ? " is-path" : ""}${wrongId === id ? " is-wrong" : ""}`}
                onClick={() => handleClick(c)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(c); } }}
              />
              {isRestricted && <text x={cx} y={cy + 3} textAnchor="middle" className="bs-gridlink__mark">✕</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
