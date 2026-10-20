/**
 * Space Station Escape — puzzle panel bodies. Each keeps a local draft and
 * submits through `submit(answer)`, which asks the engine (the only judge).
 * None of these components knows an answer.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SYMBOLS, SYMBOL_LEN, VALVES, GRID_SIZE, CIRCUIT, PASSWORD_LEN } from "./data.js";
import { circuitFlow, rotMask, pressures, gridPress, GRID_START } from "./engine.js";

const KEYS = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

/* 1 · bridge terminal ----------------------------------------------------- */
export function TerminalPuzzle({ submit, sfx, keyClick }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(null);
  const [boot, setBoot] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBoot((b) => Math.min(b + 1, 4)), 220);
    return () => clearInterval(id);
  }, []);
  const type = (ch) => {
    keyClick();
    setMsg(null);
    setText((t) => (t + ch).slice(0, 12));
  };
  const back = () => {
    keyClick();
    setText((t) => t.slice(0, -1));
  };
  const enter = () => {
    if (!text) return;
    if (!submit(text)) {
      setMsg("ACCESS DENIED");
      setText("");
    }
  };
  useEffect(() => {
    const down = (e) => {
      if (e.key === "Enter") enter();
      else if (e.key === "Backspace") back();
      else if (/^[a-z0-9]$/i.test(e.key)) type(e.key.toUpperCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });
  const lines = ["ARIA SECURE SHELL v4.2", "Helios Station · Deck 7 · Bridge", "Sector lockdown in effect.", "Enter command password:"];
  return (
    <div className="sse-pz">
      <div className="sse-term">
        {lines.slice(0, boot).map((l) => (
          <div key={l}>{l}</div>
        ))}
        <div className="sse-term__input">
          &gt; {text}
          <i className="sse-caret" />
        </div>
        {msg && <div className="sse-term__err">{msg}</div>}
        <div className="sse-term__hint">{PASSWORD_LEN} characters · letters and digits</div>
      </div>
      <div className="sse-kbd">
        {KEYS.map((row) => (
          <div key={row}>
            {[...row].map((ch) => (
              <button type="button" key={ch} onClick={() => type(ch)}>{ch}</button>
            ))}
          </div>
        ))}
        <div>
          <button type="button" className="is-wide" onClick={back}>⌫ DEL</button>
          <button type="button" className="is-wide is-go" onClick={() => (sfx("ui"), enter())}>ENTER ⏎</button>
        </div>
      </div>
    </div>
  );
}

/* 2 · power junction ------------------------------------------------------ */
const BASE = { straight: 5, corner: 3, tee: 7, cross: 15, empty: 0 };
export function CircuitPuzzle({ submit, sfx }) {
  const [rots, setRots] = useState(CIRCUIT.start);
  const flow = useMemo(() => circuitFlow(rots), [rots]);
  const done = useRef(false);
  useEffect(() => {
    if (flow.done && !done.current) {
      done.current = true;
      setTimeout(() => submit(rots), 500);
    }
  }, [flow.done, rots, submit]);
  const rotate = (r, c) => {
    if (done.current) return;
    sfx("ui");
    setRots((v) => v.map((row, i) => row.map((x, j) => (i === r && j === c ? (x + 1) % 4 : x))));
  };
  const S = 60;
  const arm = { 1: [0, -30], 2: [30, 0], 4: [0, 30], 8: [-30, 0] };
  return (
    <div className="sse-pz">
      <p className="sse-pz__lead">Click conduits to rotate them. Power must reach BOTH outputs.</p>
      <svg viewBox={`-60 -10 ${CIRCUIT.cols * S + 130} ${CIRCUIT.rows * S + 20}`} className="sse-circuit">
        <g transform={`translate(-52 ${CIRCUIT.inRow * S + 8})`}>
          <rect width="44" height="44" rx="8" className="sse-node-box is-src" />
          <text x="22" y="28" textAnchor="middle" className="sse-node-txt">⚛</text>
        </g>
        {CIRCUIT.outRows.map((r, i) => (
          <g key={r} transform={`translate(${CIRCUIT.cols * S + 6} ${r * S + 8})`}>
            <rect width="62" height="44" rx="8" className={`sse-node-box${flow.outs[i] ? " is-on" : ""}`} />
            <text x="31" y="27" textAnchor="middle" className="sse-node-txt is-small">{CIRCUIT.outNames[i]}</text>
          </g>
        ))}
        {CIRCUIT.tiles.map((row, r) =>
          row.map((kind, c) => {
            const m = rotMask(BASE[kind], rots[r][c]);
            const on = flow.lit[r][c];
            return (
              <g key={`${r}-${c}`} transform={`translate(${c * S + 30} ${r * S + 30})`} onClick={() => rotate(r, c)} className="sse-tile">
                <rect x="-28" y="-28" width="56" height="56" rx="6" className={on ? "is-on" : ""} />
                {[1, 2, 4, 8].filter((b) => m & b).map((b) => (
                  <line key={b} x1="0" y1="0" x2={arm[b][0]} y2={arm[b][1]} className={`sse-wire${on ? " is-on" : ""}`} />
                ))}
                <circle r="6" className={`sse-dot${on ? " is-on" : ""}`} />
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

/* 3 · specimen cabinet ---------------------------------------------------- */
export function SymbolsPuzzle({ submit, sfx, keyClick }) {
  const [seq, setSeq] = useState([]);
  const [bad, setBad] = useState(false);
  const press = (sym) => {
    keyClick();
    setBad(false);
    const next = [...seq, sym];
    if (next.length < SYMBOL_LEN) return setSeq(next);
    setSeq(next);
    setTimeout(() => {
      if (!submit(next)) {
        setBad(true);
        setSeq([]);
      }
    }, 250);
  };
  return (
    <div className="sse-pz">
      <p className="sse-pz__lead">Enter the {SYMBOL_LEN} bio-tags in sequence.</p>
      <div className={`sse-slots${bad ? " is-bad" : ""}`}>
        {Array.from({ length: SYMBOL_LEN }, (_, i) => (
          <span key={i} className={seq[i] ? "is-full" : ""}>{seq[i] || ""}</span>
        ))}
      </div>
      <div className="sse-sympad">
        {SYMBOLS.map((s) => (
          <button type="button" key={s} onClick={() => press(s)}>{s}</button>
        ))}
      </div>
      <button type="button" className="sse-btn" onClick={() => (sfx("ui"), setSeq([]), setBad(false))}>Clear</button>
    </div>
  );
}

/* 4 · pressure balance ---------------------------------------------------- */
export function PressurePuzzle({ submit, sfx }) {
  const [v, setV] = useState([0, 0, 0]);
  const p = pressures(v);
  const ok = p.map((x, i) => x === VALVES.targets[i]);
  const MAXP = 140;
  const turn = (i, k) => {
    sfx("ui");
    setV((a) => a.map((x, j) => (j === i ? Math.max(0, Math.min(VALVES.max, x + k)) : x)));
  };
  return (
    <div className="sse-pz">
      <p className="sse-pz__lead">Set every line exactly on its green mark.</p>
      <div className="sse-gauges">
        {VALVES.lines.map((name, i) => (
          <div key={name} className={`sse-gauge${ok[i] ? " is-ok" : ""}`}>
            <div className="sse-gauge__bar">
              <i className="sse-gauge__fill" style={{ height: `${Math.min(100, (p[i] / MAXP) * 100)}%` }} />
              <i className="sse-gauge__mark" style={{ bottom: `${(VALVES.targets[i] / MAXP) * 100}%` }} />
            </div>
            <b>{p[i]}</b>
            <small>{name} kPa</small>
          </div>
        ))}
      </div>
      <div className="sse-valves">
        {VALVES.names.map((n, i) => (
          <div key={n} className="sse-valve">
            <span className="sse-valve__name">Valve {n}</span>
            <div className="sse-valve__row">
              <button type="button" onClick={() => turn(i, -1)} aria-label={`Close valve ${n}`}>−</button>
              <span className="sse-valve__wheel" style={{ transform: `rotate(${v[i] * 45}deg)` }}>✲</span>
              <button type="button" onClick={() => turn(i, 1)} aria-label={`Open valve ${n}`}>+</button>
            </div>
            <span className="sse-valve__val">{v[i]} / {VALVES.max}</span>
          </div>
        ))}
      </div>
      <button type="button" className="sse-btn sse-btn--go" onClick={() => submit(v)}>Engage scrubbers</button>
    </div>
  );
}

/* 5 · laser grid ---------------------------------------------------------- */
export function GridPuzzle({ submit, sfx }) {
  const [presses, setPresses] = useState([]);
  const grid = useMemo(() => presses.reduce((g, [r, c]) => gridPress(g, r, c), GRID_START), [presses]);
  const left = grid.flat().filter(Boolean).length;
  const sent = useRef(false);
  useEffect(() => {
    if (left === 0 && !sent.current) {
      sent.current = true;
      setTimeout(() => submit(presses), 450);
    }
  }, [left, presses, submit]);
  return (
    <div className="sse-pz">
      <p className="sse-pz__lead">Switch off every emitter. Each node toggles itself and its direct neighbours.</p>
      <div className="sse-grid" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
        {grid.map((row, r) =>
          row.map((on, c) => (
            <button type="button" key={`${r}-${c}`} className={`sse-cell${on ? " is-on" : ""}`} aria-label={`Node ${r + 1},${c + 1}`} onClick={() => !sent.current && (sfx("ui"), setPresses((p) => [...p, [r, c]]))} />
          )),
        )}
      </div>
      <div className="sse-row">
        <span className="sse-pz__note">Active emitters: {left}</span>
        <button type="button" className="sse-btn" onClick={() => (sfx("ui"), setPresses([]))}>Reset grid</button>
      </div>
    </div>
  );
}

/* 6 · launch console ------------------------------------------------------ */
const COLORS = [["RED", "#ff4a4a"], ["AMBER", "#ffb02a"], ["GREEN", "#4fff7a"], ["BLUE", "#3fa8ff"]];
export function LaunchPuzzle({ submit, keyClick, state }) {
  const [code, setCode] = useState("");
  const [bad, setBad] = useState(false);
  const checks = [
    ["Main power", state.f.power],
    ["Life support", state.f.lifeSupport],
    ["Laser grid offline", state.f.lasersOff],
    ["Pod power cell", state.f.cellIn],
  ];
  const press = (d) => {
    keyClick();
    setBad(false);
    const next = (code + d).slice(0, 4);
    setCode(next);
    if (next.length === 4)
      setTimeout(() => {
        if (!submit(next)) {
          setBad(true);
          setCode("");
        }
      }, 250);
  };
  return (
    <div className="sse-pz sse-pz--launch">
      <ul className="sse-checks">
        {checks.map(([n, ok]) => (
          <li key={n} className={ok ? "is-ok" : ""}>{ok ? "✔" : "✖"} {n}</li>
        ))}
      </ul>
      <div className={`sse-slots sse-slots--code${bad ? " is-bad" : ""}`}>
        {COLORS.map(([n, c], i) => (
          <span key={n} style={{ "--c": c }} className={code[i] ? "is-full" : ""}>
            {code[i] || ""}
            <small>{n}</small>
          </span>
        ))}
      </div>
      <div className="sse-keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
          <button type="button" key={d} onClick={() => press(d)}>{d}</button>
        ))}
        <button type="button" onClick={() => (keyClick(), setCode(""), setBad(false))}>CLR</button>
      </div>
    </div>
  );
}

export const PUZZLE_UI = {
  terminal: TerminalPuzzle,
  circuit: CircuitPuzzle,
  symbols: SymbolsPuzzle,
  pressure: PressurePuzzle,
  grid: GridPuzzle,
  launch: LaunchPuzzle,
};
