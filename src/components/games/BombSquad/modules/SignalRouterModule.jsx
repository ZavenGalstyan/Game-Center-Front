/**
 * Signal Router — a small board of nodes connected by printed tracks.
 * Activate every node on the real route from START to OUTPUT; the extra
 * dead-end spurs are decoys — clicking one strikes instead of toggling.
 */
import { useRef, useState } from "react";
import { checkSignalNode } from "../systems/moduleLogic.js";

const CELL = 34;
const PAD = 18;

const key = (p) => `${p.x},${p.y}`;
const pos = (p) => ({ cx: PAD + p.x * CELL, cy: PAD + p.y * CELL });

export default function SignalRouterModule({ puzzle, solved, onSolve, onWrong }) {
  const [active, setActive] = useState(() => new Set());
  const [wrongId, setWrongId] = useState(null);
  const doneRef = useRef(false);

  const route = [puzzle.start, ...puzzle.path, puzzle.output];

  const handleClick = (nodeId, isDecoy) => {
    if (solved || doneRef.current) return;
    if (isDecoy) {
      setWrongId(nodeId);
      setTimeout(() => setWrongId(null), 260);
      onWrong();
      return;
    }
    if (active.has(nodeId)) return;
    const next = new Set(active).add(nodeId);
    setActive(next);
    if (checkSignalNode(puzzle, nodeId) && next.size >= puzzle.pathIds.length) {
      doneRef.current = true;
      onSolve();
    }
  };

  const w = PAD * 2 + (puzzle.size.w - 1) * CELL;
  const h = PAD * 2 + (puzzle.size.h - 1) * CELL;

  return (
    <div className="bs-mod bs-mod--signal">
      <p className="bs-mod__clue">{puzzle.ruleText}</p>
      <svg className="bs-signal" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {/* printed tracks */}
        {route.slice(1).map((p, i) => {
          const a = pos(route[i]);
          const b = pos(p);
          return <line key={`r${i}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} className="bs-signal__track" />;
        })}
        {puzzle.decoys.map((d) => {
          const [fx, fy] = d.from.split(",").map(Number);
          const a = pos({ x: fx, y: fy });
          const b = pos(d);
          return <line key={key(d)} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} className="bs-signal__track bs-signal__track--decoy" />;
        })}

        {/* start/output anchors */}
        {[{ p: puzzle.start, label: "START" }, { p: puzzle.output, label: "OUTPUT" }].map(({ p, label }) => {
          const c = pos(p);
          return (
            <g key={label}>
              <circle cx={c.cx} cy={c.cy} r="7" className="bs-signal__anchor" />
              <text x={c.cx} y={c.cy - 12} textAnchor="middle" className="bs-signal__anchor-label">{label}</text>
            </g>
          );
        })}

        {/* route nodes */}
        {puzzle.path.map((p) => {
          const id = key(p);
          const c = pos(p);
          return (
            <circle
              key={id}
              cx={c.cx}
              cy={c.cy}
              r="7"
              role="button"
              tabIndex={solved ? -1 : 0}
              className={`bs-signal__node${active.has(id) ? " is-active" : ""}`}
              onClick={() => handleClick(id, false)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(id, false); } }}
            />
          );
        })}

        {/* decoy dead-end nodes */}
        {puzzle.decoys.map((d) => {
          const id = key(d);
          const c = pos(d);
          return (
            <circle
              key={id}
              cx={c.cx}
              cy={c.cy}
              r="7"
              role="button"
              tabIndex={solved ? -1 : 0}
              className={`bs-signal__node bs-signal__node--decoy${wrongId === id ? " is-wrong" : ""}`}
              onClick={() => handleClick(id, true)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(id, true); } }}
            />
          );
        })}
      </svg>
    </div>
  );
}
