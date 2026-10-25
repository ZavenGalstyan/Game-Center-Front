/**
 * Escape Quest — puzzle UIs and the clue reader. Puzzle components never
 * know the answer: they collect input and hand it to `onSubmit`, which asks
 * the engine (checkPuzzle) and returns true/false.
 */
import { useEffect, useMemo, useState } from "react";
import { Glyph, Arrow, COLORS, COLOR_NAMES } from "./glyphs.jsx";
import { GLYPHS } from "./glyphNames.js";
import { ItemIcon } from "./icons.jsx";
import { TextPic } from "./pics.jsx";
import { lightsPress, lightsStart } from "./engine.js";
import { Prop } from "./props.jsx";
import { SFX } from "./audio.js";

const isGlyph = (v) => GLYPHS.includes(v);
const isArrow = (v) => typeof v === "string" && v.length === 1 && "UDLR".includes(v);

/** One symbol/colour/arrow/text token drawn in a square SVG. */
export function Token({ v, size = 40, c, text = false }) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className="eq-token" aria-hidden="true">
      {COLORS[v] && !text ? (
        <circle cx="40" cy="40" r="30" fill={COLORS[v]} stroke="#2b2033" strokeWidth="5" />
      ) : isArrow(v) && !text ? (
        <Arrow dir={v} x={40} y={40} size={66} c={c || "#f7d23e"} />
      ) : isGlyph(v) && !text ? (
        <Glyph name={v} x={40} y={40} size={62} c={c || "#f7d23e"} sw={2} />
      ) : (
        <text x="40" y="54" textAnchor="middle" fontSize={String(v).length > 2 ? 30 : 42} fontWeight="900" fill={c || "#fff6e0"} fontFamily="'Trebuchet MS', Verdana, sans-serif">
          {v}
        </text>
      )}
    </svg>
  );
}

const label = (v) => (COLORS[v] ? COLOR_NAMES[v] : isArrow(v) ? { U: "Up", D: "Down", L: "Left", R: "Right" }[v] : String(v));

/* ---------------- clue reader ---------------- */

export function ClueVisual({ visual }) {
  if (!visual) return null;
  const v = visual;
  switch (v.type) {
    case "code":
      return (
        <div className="eq-clue__code">
          {String(v.value)
            .split("")
            .map((ch, i) => (
              <span key={i} style={v.colors ? { color: COLORS[v.colors[i]] } : undefined}>
                {ch}
              </span>
            ))}
        </div>
      );
    case "seq":
      return (
        <div className="eq-clue__seq">
          {v.value.map((t, i) => (
            <span key={i} className="eq-clue__tok" title={label(t)}>
              <Token v={t} size={46} />
              {v.numbered && <em>{i + 1}</em>}
            </span>
          ))}
        </div>
      );
    case "pairs":
      return (
        <div className="eq-clue__pairs">
          {v.value.map((r, i) => (
            <div key={i} className="eq-clue__pair">
              {r.k != null && <Token v={r.k} size={38} />}
              {r.k != null && <span className="eq-clue__eq">=</span>}
              {r.v != null ? <Token v={r.v} size={38} /> : <b>{r.t}</b>}
            </div>
          ))}
        </div>
      );
    case "grid":
      return (
        <div className="eq-clue__grid" style={{ gridTemplateColumns: `repeat(${v.cols}, 1fr)` }}>
          {Array.from({ length: v.rows * v.cols }, (_, i) => (
            <span key={i} className={v.on.includes(i) ? "on" : ""}>
              {v.mark && v.on.includes(i) ? v.mark : ""}
            </span>
          ))}
        </div>
      );
    case "clock":
      return (
        <svg viewBox="0 0 120 120" width="120" height="120" className="eq-clue__clock">
          <Prop kind="clock" w={120} h={120} p={{ time: v.time, numbers: true, c: "#3fb0a0" }} />
        </svg>
      );
    case "lines":
      return (
        <div className="eq-clue__lines">
          {v.value.map((t, i) => (
            <p key={i}>{v.bold ? <><b>{t[0]}</b>{t.slice(1)}</> : t}</p>
          ))}
        </div>
      );
    case "chart":
      return (
        <div className="eq-clue__chart">
          {v.cells.map((c, i) => (
            <span key={i}>
              <small>{c.n}</small>
              <b>{c.s}</b>
            </span>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export function ClueCard({ clue, onClose }) {
  return (
    <div className="eq-modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="eq-card eq-card--clue eq-pop">
        <div className="eq-card__title">{clue.title || "Clue"}</div>
        {clue.text && <p className="eq-clue__text">{clue.text}</p>}
        <ClueVisual visual={clue.visual} />
        <button className="eq-btn eq-btn--primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

/* ---------------- puzzles ---------------- */

function useShake() {
  const [shake, setShake] = useState(false);
  return [
    shake,
    () => {
      setShake(true);
      setTimeout(() => setShake(false), 450);
    },
  ];
}

function Slots({ values, len, render }) {
  return (
    <div className="eq-pz__slots">
      {Array.from({ length: len }, (_, i) => (
        <span key={i} className={`eq-pz__slot${values[i] != null ? " filled" : ""}`}>
          {values[i] != null ? render(values[i], i) : ""}
        </span>
      ))}
    </div>
  );
}

function Keypad({ p, submit }) {
  const [val, setVal] = useState("");
  const len = String(p.answer).length;
  const press = (d) => {
    SFX.key();
    const next = (val + d).slice(0, len);
    setVal(next);
    if (next.length === len) setTimeout(() => !submit(next) && setVal(""), 160);
  };
  return (
    <div className="eq-pz__keypad-wrap">
      <div className="eq-pz__display">
        {Array.from({ length: len }, (_, i) => (
          <span key={i}>{val[i] ?? "•"}</span>
        ))}
      </div>
      <div className="eq-pz__keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "←"].map((k) => (
          <button
            key={k}
            className={`eq-key${k === "C" || k === "←" ? " eq-key--fn" : ""}`}
            onClick={() => (k === "C" ? setVal("") : k === "←" ? setVal(val.slice(0, -1)) : press(k))}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function SequenceInput({ p, submit, buttons, arrows }) {
  const [val, setVal] = useState([]);
  const len = p.answer.length;
  const press = (b, i) => {
    SFX.beep(i);
    const next = [...val, b].slice(0, len);
    setVal(next);
    if (next.length === len) setTimeout(() => !submit(next) && setVal([]), 220);
  };
  return (
    <div className="eq-pz__seq">
      <Slots values={val} len={len} render={(v) => <Token v={v} size={30} text={!arrows && !COLORS[v] && !isGlyph(v)} />} />
      {arrows ? (
        <div className="eq-pz__arrows">
          {["U", "L", "R", "D"].map((d, i) => (
            <button key={d} className={`eq-arrowbtn eq-arrowbtn--${d}`} onClick={() => press(d, i * 2)} aria-label={label(d)}>
              <Token v={d} size={44} />
            </button>
          ))}
        </div>
      ) : (
        <div className="eq-pz__buttons">
          {buttons.map((b, i) => (
            <button key={b} className="eq-colorbtn" style={COLORS[b] ? { background: COLORS[b] } : undefined} onClick={() => press(b, i)} aria-label={label(b)}>
              {!COLORS[b] && <Token v={b} size={36} text={!isGlyph(b)} />}
            </button>
          ))}
        </div>
      )}
      <button className="eq-btn eq-btn--ghost eq-btn--sm" onClick={() => setVal([])}>
        Reset
      </button>
    </div>
  );
}

function Wheels({ sets, submit, letters }) {
  const [idx, setIdx] = useState(() => sets.map(() => 0));
  const turn = (i, d) => {
    SFX.turn();
    setIdx((a) => a.map((v, j) => (j === i ? (v + d + sets[i].length) % sets[i].length : v)));
  };
  return (
    <div className="eq-pz__wheels-wrap">
      <div className="eq-pz__wheels">
        {sets.map((set, i) => (
          <div key={i} className="eq-wheel">
            <button className="eq-wheel__btn" onClick={() => turn(i, -1)} aria-label="Previous">
              ▲
            </button>
            <div className="eq-wheel__face">{letters ? <span className="eq-wheel__letter">{set[idx[i]]}</span> : <Token v={set[idx[i]]} size={44} />}</div>
            <button className="eq-wheel__btn" onClick={() => turn(i, 1)} aria-label="Next">
              ▼
            </button>
          </div>
        ))}
      </div>
      <button className="eq-btn eq-btn--primary" onClick={() => submit(letters ? idx.map((v, i) => sets[i][v]).join("") : idx.map((v, i) => sets[i][v]))}>
        Open
      </button>
    </div>
  );
}

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function OrderPuzzle({ p, submit }) {
  const [order, setOrder] = useState(() => p.pieces.map((x) => x.id));
  const [sel, setSel] = useState(null);
  const byId = useMemo(() => Object.fromEntries(p.pieces.map((x) => [x.id, x])), [p]);
  const tapPiece = (i) => {
    SFX.tap();
    if (sel == null) return setSel(i);
    if (sel !== i) {
      const next = order.slice();
      [next[sel], next[i]] = [next[i], next[sel]];
      setOrder(next);
    }
    setSel(null);
  };
  return (
    <div className="eq-pz__order-wrap">
      <div className="eq-pz__order">
        {order.map((id, i) => {
          const pc = byId[id];
          return (
            <button key={id} className={`eq-piece${sel === i ? " sel" : ""}`} onClick={() => tapPiece(i)} aria-label={pc.label || label(pc.c || id)}>
              <svg viewBox="0 0 60 100" width="100%" height="100%">
                {pc.icon ? (
                  <g>
                    <rect x="4" y="4" width="52" height="92" rx="10" fill="#fff6e0" stroke="#2b2033" strokeWidth="4" />
                    <ItemIcon icon={pc.icon} c={pc.ic} size={46} x={7} y={27} />
                  </g>
                ) : pc.h ? (
                  <rect x="14" y={96 - 88 * pc.h} width="32" height={88 * pc.h} rx="6" fill={COLORS[pc.c] || pc.c} stroke="#2b2033" strokeWidth="4" />
                ) : (
                  <g>
                    <rect x="8" y="4" width="44" height="92" rx="6" fill={COLORS[pc.c] || pc.c || "#c9925a"} stroke="#2b2033" strokeWidth="4" />
                    <path d="M12 24 H48 M12 76 H48" stroke="#f7d23e" strokeWidth="4" />
                  </g>
                )}
                {pc.g && <Glyph name={pc.g} x={30} y={pc.icon ? 18 : 50} size={30} c={pc.icon ? "#2b2033" : "#fff"} />}
                {pc.dots != null &&
                  Array.from({ length: pc.dots }, (_, k) => <Glyph key={k} name="star" x={30} y={20 + k * 16} size={13} c="#f7d23e" sw={1} />)}
                {pc.label && (
                  <text x="30" y={pc.icon ? 88 : 60} textAnchor="middle" fontSize="18" fontWeight="900" fill={pc.icon ? "#2b2033" : "#fff"} stroke={pc.icon ? "none" : "#2b2033"} strokeWidth="1">
                    {pc.label}
                  </text>
                )}
              </svg>
            </button>
          );
        })}
      </div>
      <p className="eq-pz__tip">Tap two pieces to swap them.</p>
      <button className="eq-btn eq-btn--primary" onClick={() => submit(order)}>
        Done
      </button>
    </div>
  );
}

function PatternPuzzle({ p, submit }) {
  const [on, setOn] = useState([]);
  const toggle = (i) => {
    SFX.tap();
    setOn((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]));
  };
  return (
    <div className="eq-pz__pattern-wrap">
      {p.colLabels && (
        <div className="eq-pz__collabels" style={{ gridTemplateColumns: `repeat(${p.cols}, 1fr)` }}>
          {p.colLabels.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      )}
      <div className={`eq-pz__pattern eq-pz__pattern--${p.style || "tile"}`} style={{ gridTemplateColumns: `repeat(${p.cols}, 1fr)` }}>
        {Array.from({ length: p.rows * p.cols }, (_, i) => (
          <button key={i} className={on.includes(i) ? "on" : ""} onClick={() => toggle(i)} aria-label={`Cell ${i + 1}`}>
            {p.style === "switch" && <i />}
          </button>
        ))}
      </div>
      <button className="eq-btn eq-btn--primary" onClick={() => submit(on)}>
        Check
      </button>
    </div>
  );
}

function LightsPuzzle({ p, submit }) {
  const start = useMemo(() => lightsStart(p), [p]);
  const [on, setOn] = useState(start);
  const press = (i) => {
    SFX.beep(i % 8);
    const next = lightsPress(p, on, i);
    setOn(next);
    if (next.every(Boolean)) setTimeout(() => submit(next), 250);
  };
  return (
    <div className="eq-pz__pattern-wrap">
      <div className="eq-pz__pattern eq-pz__pattern--lights" style={{ gridTemplateColumns: `repeat(${p.cols}, 1fr)` }}>
        {on.map((v, i) => (
          <button key={i} className={v ? "on" : ""} onClick={() => press(i)} aria-label={`Light ${i + 1}`}>
            <Token v={p.glyph || "star"} size={26} c={v ? "#fff8c0" : "#5d6b7a"} />
          </button>
        ))}
      </div>
      <p className="eq-pz__tip">Each press flips a light and its neighbors. Light them all!</p>
      <button className="eq-btn eq-btn--ghost eq-btn--sm" onClick={() => setOn(start)}>
        Reset
      </button>
    </div>
  );
}

function RotatePuzzle({ p, submit }) {
  const n = Math.round(Math.sqrt(p.start.length));
  const [rot, setRot] = useState(p.start);
  const size = 100;
  const turn = (i) => {
    SFX.turn();
    const next = rot.map((r, j) => (j === i ? (r + 1) % 4 : r));
    setRot(next);
    if (next.every((r) => r === 0)) setTimeout(() => submit(next), 300);
  };
  const W = n * size;
  return (
    <div className="eq-pz__rotate-wrap">
      <svg viewBox={`0 0 ${W} ${W}`} className="eq-pz__rotate">
        <defs>
          {rot.map((_, i) => (
            <clipPath key={i} id={`eq-rc-${i}`}>
              <rect x={(i % n) * size} y={Math.floor(i / n) * size} width={size} height={size} />
            </clipPath>
          ))}
        </defs>
        {rot.map((r, i) => {
          const cx = (i % n) * size + size / 2;
          const cy = Math.floor(i / n) * size + size / 2;
          return (
            <g key={i} onClick={() => turn(i)} className="eq-pz__tile">
              <g clipPath={`url(#eq-rc-${i})`}>
                <g transform={`rotate(${r * 90} ${cx} ${cy})`} style={{ transition: "transform .2s" }}>
                  <TextPic pic={p.pic} text={p.text} w={W} h={W} />
                </g>
              </g>
              <rect x={cx - size / 2 + 1} y={cy - size / 2 + 1} width={size - 2} height={size - 2} fill="transparent" stroke="#2b2033" strokeWidth="3" />
            </g>
          );
        })}
      </svg>
      <p className="eq-pz__tip">Tap a tile to turn it. Restore the picture.</p>
    </div>
  );
}

export function PuzzleModal({ hotspotLabel, p, onSubmit, onClose }) {
  const [shake, bump] = useShake();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const submit = (input) => {
    const good = onSubmit(input);
    if (good) setOk(true);
    else bump();
    return good;
  };
  let body;
  switch (p.type) {
    case "keypad":
      body = <Keypad p={p} submit={submit} />;
      break;
    case "colors":
      body = <SequenceInput p={p} submit={submit} buttons={p.palette} />;
      break;
    case "arrows":
      body = <SequenceInput p={p} submit={submit} arrows />;
      break;
    case "dials":
      body = <Wheels sets={p.wheels || p.answer.map(() => p.symbols)} submit={submit} />;
      break;
    case "word":
      body = <Wheels sets={String(p.answer).split("").map(() => p.letters ? p.letters.split("") : ALPHA)} submit={submit} letters />;
      break;
    case "order":
      body = <OrderPuzzle p={p} submit={submit} />;
      break;
    case "pattern":
      body = <PatternPuzzle p={p} submit={submit} />;
      break;
    case "lights":
      body = <LightsPuzzle p={p} submit={submit} />;
      break;
    case "rotate":
      body = <RotatePuzzle p={p} submit={submit} />;
      break;
    default:
      body = null;
  }
  return (
    <div className="eq-modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`eq-card eq-card--puzzle eq-pop${shake ? " eq-shake" : ""}${ok ? " eq-solved" : ""}`}>
        <button className="eq-card__x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="eq-card__title">{p.title || hotspotLabel}</div>
        {p.prompt && <p className="eq-pz__prompt">{p.prompt}</p>}
        <div className="eq-pz__body">{body}</div>
      </div>
    </div>
  );
}
