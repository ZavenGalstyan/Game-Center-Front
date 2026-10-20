/**
 * Outpost 47 — puzzle panel bodies. Each keeps a local draft and submits via
 * `submit(answer)`; sim.js (through data.js `check`) is the only judge. The
 * panels show live physical feedback (gauges, meters, lit circuits) but never
 * reveal an answer.
 */
import { useEffect, useMemo, useState } from "react";
import { circuitFlow, rotMask, SYMBOLS, GEAR_TEETH, ITEMS } from "./data.js";

function useKeys(handler) {
  useEffect(() => {
    const down = (e) => {
      if (handler(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  });
}
const Fault = ({ msg }) => (msg ? <div className="o47-pz__fault" role="alert">{msg}</div> : null);

/* ------------------------------------------------------------ keypad */
export function Keypad({ pz, submit, sfx, extra }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState(null);
  const press = (d) => {
    sfx("click");
    setMsg(null);
    setCode((c) => (c.length >= pz.len ? c : c + d));
  };
  const enter = () => {
    if (code.length < pz.len) return setMsg(`ENTER ${pz.len} DIGITS`);
    if (!submit(code)) {
      setMsg("ACCESS DENIED");
      setCode("");
    }
  };
  useKeys((e) => {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === "Backspace") setCode((c) => c.slice(0, -1));
    else if (e.key === "Enter") enter();
    else return false;
    return true;
  });
  return (
    <div className="o47-keypad">
      {extra}
      <div className="o47-keypad__screen">
        {Array.from({ length: pz.len }, (_, i) => (
          <span key={i} className={i < code.length ? "is-on" : ""}>{code[i] ?? "·"}</span>
        ))}
      </div>
      <Fault msg={msg} />
      <div className="o47-keypad__grid">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"].map((k) => (
          <button
            type="button"
            key={k}
            className={k === "OK" ? "is-go" : k === "C" ? "is-clr" : ""}
            onClick={() => (k === "C" ? (sfx("click"), setCode("")) : k === "OK" ? enter() : press(k))}
          >
            {k === "OK" ? "ENTER" : k === "C" ? "CLR" : k}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ password */
export function Password({ submit }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(null);
  const enter = (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    if (!submit(text)) {
      setMsg("ACCESS DENIED — password incorrect");
      setText("");
    }
  };
  return (
    <form className="o47-term" onSubmit={enter}>
      <div className="o47-term__lines">
        <div>HPD SECURE SHELL 3.1 — OUTPOST 47</div>
        <div>user: <b>e.varga</b> (DIRECTOR)</div>
        <div>logs: 0 (purged) · archive: SEALED</div>
      </div>
      <label className="o47-term__row">
        <span>password&gt;</span>
        <input autoFocus value={text} maxLength={24} spellCheck={false} autoComplete="off" onChange={(e) => (setMsg(null), setText(e.target.value))} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <Fault msg={msg} />
      <button type="submit" className="o47-btn is-go">LOG IN</button>
    </form>
  );
}

/* ------------------------------------------------------------ sequence */
export function Sequence({ pz, submit, sfx }) {
  const [seq, setSeq] = useState([]);
  const [msg, setMsg] = useState(null);
  const press = (id) => {
    if (seq.includes(id)) return;
    sfx("switch");
    const next = [...seq, id];
    setSeq(next);
    setMsg(null);
    if (next.length === pz.buttons.length && !submit(next)) {
      setMsg("SEQUENCE FAULT — PANEL RESET");
      setTimeout(() => setSeq([]), 500);
    }
  };
  return (
    <div className="o47-seq">
      <div className="o47-seq__lamps">
        {pz.buttons.map((_, i) => (
          <i key={i} className={i < seq.length ? "is-on" : ""} />
        ))}
      </div>
      <div className="o47-seq__grid">
        {pz.buttons.map(([id, label]) => {
          const n = seq.indexOf(id);
          return (
            <button type="button" key={id} className={n >= 0 ? "is-on" : ""} onClick={() => press(id)}>
              <span className="o47-seq__toggle" />
              <span>{label}</span>
              {n >= 0 && <em>{n + 1}</em>}
            </button>
          );
        })}
      </div>
      <Fault msg={msg} />
      <button type="button" className="o47-btn" onClick={() => (sfx("click"), setSeq([]), setMsg(null))}>RESET PANEL</button>
    </div>
  );
}

/* ------------------------------------------------------------ circuit */
const SEG = { 1: "M50 50 L50 0", 2: "M50 50 L100 50", 4: "M50 50 L50 100", 8: "M50 50 L0 50" };
export function Circuit({ pz, submit, sfx }) {
  const [rots, setRots] = useState(() => new Array(pz.cells.length).fill(0));
  const lit = useMemo(() => circuitFlow(pz, rots), [pz, rots]);
  const sinks = pz.cells.map((c, i) => (c?.sink ? i : -1)).filter((i) => i >= 0);
  const allLit = sinks.every((i) => lit.has(i));
  useEffect(() => {
    if (allLit) submit(rots);
  }, [allLit]); // eslint-disable-line react-hooks/exhaustive-deps
  const rotate = (i) => {
    const c = pz.cells[i];
    if (!c || c.fixed) return;
    sfx("click");
    setRots((r) => r.map((v, j) => (j === i ? (v + 1) % 4 : v)));
  };
  return (
    <div className="o47-circuit">
      <div className="o47-circuit__grid" style={{ gridTemplateColumns: `repeat(${pz.cols}, 1fr)` }}>
        {pz.cells.map((c, i) => {
          if (!c) return <div key={i} className="o47-circuit__cell is-empty" />;
          const m = c.fixed ? c.m : rotMask(c.m, c.r0 + rots[i]);
          const on = lit.has(i);
          return (
            <button type="button" key={i} className={`o47-circuit__cell${on ? " is-lit" : ""}${c.fixed ? " is-fixed" : ""}${c.sink ? " is-sink" : ""}`} onClick={() => rotate(i)} aria-label={c.sink ? `Output ${c.sink}` : c.src ? "Source" : "Junction"}>
              <svg viewBox="0 0 100 100">
                {[1, 2, 4, 8].filter((b) => m & b).map((b) => (
                  <path key={b} d={SEG[b]} />
                ))}
                <circle cx="50" cy="50" r={c.src || c.sink ? 20 : 9} />
              </svg>
              {(c.sink || c.label) && <b>{c.sink || c.label}</b>}
            </button>
          );
        })}
      </div>
      <div className="o47-pz__note">Click a junction to rotate it. {sinks.filter((i) => lit.has(i)).length}/{sinks.length} outputs live.</div>
    </div>
  );
}

/* ------------------------------------------------------------ gauge helper */
function Gauge({ value, max, band, unit, ok }) {
  const a = (v) => -120 + (Math.max(0, Math.min(max, v)) / max) * 240;
  const arc = (v1, v2, r) => {
    const p = (v) => {
      const t = ((a(v) - 90) * Math.PI) / 180;
      return [60 + Math.cos(t) * r, 62 + Math.sin(t) * r];
    };
    const [x1, y1] = p(v1), [x2, y2] = p(v2);
    return `M${x1} ${y1} A${r} ${r} 0 ${a(v2) - a(v1) > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const ang = ((a(value) - 90) * Math.PI) / 180;
  return (
    <svg className={`o47-gauge${ok ? " is-ok" : ""}`} viewBox="0 0 120 100">
      <path d={arc(0, max, 46)} className="o47-gauge__track" />
      {band && <path d={arc(band[0], Math.max(band[1], band[0] + max * 0.012), 46)} className="o47-gauge__band" />}
      <line x1="60" y1="62" x2={60 + Math.cos(ang) * 40} y2={62 + Math.sin(ang) * 40} className="o47-gauge__needle" />
      <circle cx="60" cy="62" r="5" />
      <text x="60" y="92">{(Math.round(value * 100) / 100).toFixed(unit === "bar" ? 2 : 0)} {unit}</text>
    </svg>
  );
}

/* ------------------------------------------------------------ valves */
export function Valves({ pz, submit, sfx }) {
  const [v, setV] = useState(() => Object.fromEntries(pz.valves.map(([id]) => [id, 0])));
  const [msg, setMsg] = useState(null);
  const g = pz.gauge(v);
  const inBand = g >= pz.band[0] - 1e-9 && g <= pz.band[1] + 1e-9;
  const set = (id, d) => {
    sfx("click");
    setMsg(null);
    setV((o) => ({ ...o, [id]: Math.max(0, Math.min(pz.max, o[id] + d)) }));
  };
  return (
    <div className="o47-valves">
      <Gauge value={g} max={pz.gaugeMax} band={pz.band} unit={pz.unit} ok={inBand} />
      <div className="o47-valves__row">
        {pz.valves.map(([id, label, col]) => (
          <div key={id} className="o47-valve" style={{ "--c": col }}>
            <div className="o47-valve__wheel" style={{ transform: `rotate(${v[id] * 50}deg)` }} />
            <b>{label}</b>
            <div className="o47-valve__ctl">
              <button type="button" onClick={() => set(id, -1)} aria-label={`Close ${label}`}>−</button>
              <span>{v[id]}</span>
              <button type="button" onClick={() => set(id, 1)} aria-label={`Open ${label}`}>+</button>
            </div>
          </div>
        ))}
      </div>
      <Fault msg={msg} />
      <button type="button" className="o47-btn is-go" onClick={() => !submit(v) && setMsg("REJECTED — the system faulted. Check the posted rules.")}>ENGAGE</button>
    </div>
  );
}

/* ------------------------------------------------------------ switches */
export function Switches({ pz, submit, sfx }) {
  const [s, setS] = useState(() => Object.fromEntries(pz.switches.map(([id]) => [id, false])));
  const [msg, setMsg] = useState(null);
  const total = pz.switches.reduce((a, [id, , val]) => a + (s[id] ? val : 0), 0);
  const over = pz.cap && total > pz.cap;
  return (
    <div className="o47-switches">
      <div className={`o47-meter${total === pz.target ? " is-ok" : over ? " is-bad" : ""}`}>
        <div className="o47-meter__bar"><i style={{ width: `${Math.min(100, (total / (pz.target * 1.5)) * 100)}%` }} /><em style={{ left: `${(1 / 1.5) * 100}%` }} /></div>
        <span>{total} {pz.unit}{pz.cap ? ` / ${pz.cap} max` : ` · target ${pz.target}`}</span>
      </div>
      <div className="o47-switches__row">
        {pz.switches.map(([id, label, val]) => (
          <button type="button" key={id} className={`o47-switch${s[id] ? " is-on" : ""}`} onClick={() => (sfx("switch"), setMsg(null), setS((o) => ({ ...o, [id]: !o[id] })))}>
            <span className="o47-switch__lever" />
            <b>{label}</b>
            <em>{val} {pz.unit}</em>
          </button>
        ))}
      </div>
      <Fault msg={msg} />
      <button type="button" className="o47-btn is-go" onClick={() => !submit(s) && setMsg(over ? "OVERLOAD — bus tripped." : "REJECTED — configuration breaks a posted rule.")}>CLOSE BUS</button>
    </div>
  );
}

/* ------------------------------------------------------------ timeline */
export function Timeline({ pz, submit, sfx }) {
  const [a, setA] = useState(() => Object.fromEntries(pz.slots.map(([id]) => [id, ""])));
  const [msg, setMsg] = useState(null);
  const letter = (cid) => String.fromCharCode(65 + pz.clips.findIndex((c) => c[0] === cid));
  return (
    <div className="o47-timeline">
      <div className="o47-timeline__clips">
        {pz.clips.map(([id, text], i) => (
          <div key={id} className="o47-clip">
            <div className="o47-clip__frame"><span>CLIP {String.fromCharCode(65 + i)}</span><i>CAM ??</i></div>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <div className="o47-timeline__slots">
        {pz.slots.map(([id, label]) => (
          <label key={id} className="o47-slot">
            <span>{label}</span>
            <select value={a[id]} onChange={(e) => (sfx("click"), setMsg(null), setA((o) => ({ ...o, [id]: e.target.value })))}>
              <option value="">— assign clip —</option>
              {pz.clips.map(([cid]) => (
                <option key={cid} value={cid}>Clip {letter(cid)}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <Fault msg={msg} />
      <button type="button" className="o47-btn is-go" onClick={() => !submit(a) && setMsg("INDEX MISMATCH — footage does not match the door log.")}>REBUILD INDEX</button>
    </div>
  );
}

/* ------------------------------------------------------------ steam manifold */
export function Steam({ pz, submit, sfx }) {
  const [o, setO] = useState(() => Object.fromEntries(pz.lines.map(([id]) => [id, false])));
  const [msg, setMsg] = useState(null);
  const n = Object.values(o).filter(Boolean).length;
  return (
    <div className="o47-steam">
      <div className="o47-pz__note">Line pressure: {n ? `${Math.round(100 / n)}% per open line` : "manifold closed"}</div>
      <div className="o47-valves__row">
        {pz.lines.map(([id, label, col]) => (
          <button type="button" key={id} className={`o47-valve is-toggle${o[id] ? " is-open" : ""}`} style={{ "--c": col }} onClick={() => (sfx("switch"), setMsg(null), setO((x) => ({ ...x, [id]: !x[id] })))}>
            <div className="o47-valve__wheel" style={{ transform: `rotate(${o[id] ? 180 : 0}deg)` }} />
            <b>{label}</b>
            <span>{o[id] ? "OPEN" : "CLOSED"}</span>
          </button>
        ))}
      </div>
      <Fault msg={msg} />
      <button type="button" className="o47-btn is-go" onClick={() => !submit(o) && setMsg(n > 1 ? "Steam hisses from several lines — not enough pressure at any of them." : n ? "Steam roars somewhere else in the cave. Wrong line." : "Nothing is open.")}>RELEASE STEAM</button>
    </div>
  );
}

/* ------------------------------------------------------------ gears */
export function Gears({ pz, submit, sfx }) {
  const [a, setA] = useState({ A: "", B: "", C: "" });
  const [msg, setMsg] = useState(null);
  const owned = pz.owned || [];
  const T = (id) => GEAR_TEETH[id] || 0;
  const chain = ["A", "B", "C"].every((k) => a[k]);
  const ratio = chain ? T(a.C) / T(a.A) : null;
  const dir = chain ? "CLOCKWISE" : "—";
  const pick = (slot, id) => {
    sfx("clunk");
    setMsg(null);
    setA((o) => {
      const n = { ...o };
      for (const k of Object.keys(n)) if (n[k] === id) n[k] = "";
      n[slot] = id;
      return n;
    });
  };
  const slots = [["A", "CRANK"], ["B", "IDLER"], ["C", "DRIVE"]];
  return (
    <div className="o47-gears">
      <svg viewBox="0 0 300 120" className="o47-gears__svg">
        {slots.map(([k], i) => {
          const r = a[k] ? T(a[k]) * 1.25 + 6 : 14;
          return (
            <g key={k} transform={`translate(${55 + i * 95} 60)`}>
              <circle r={r} className={a[k] ? "is-fit" : "is-empty"} />
              <text y="4">{a[k] ? `${T(a[k])}T` : "—"}</text>
            </g>
          );
        })}
      </svg>
      <div className="o47-gears__slots">
        {slots.map(([k, label]) => (
          <div key={k} className="o47-gears__slot">
            <b>{label}</b>
            <div>
              {owned.map((id) => (
                <button type="button" key={id} className={a[k] === id ? "is-on" : ""} onClick={() => pick(k, id)}>{ITEMS[id].name.replace(/ Gear/, "")}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="o47-pz__note">Ratio: {ratio ? `${ratio.toFixed(2)} : 1` : "—"} · Drive turns: {dir}</div>
      <Fault msg={msg} />
      <button type="button" className="o47-btn is-go" disabled={!chain} onClick={() => !submit(a) && setMsg("The crank binds. The bulkhead won't move at that ratio.")}>TURN CRANK</button>
    </div>
  );
}

/* ------------------------------------------------------------ symbols */
export function Glyph({ id, size = 40 }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-label={id}>
      {id === "flake" && <g {...p}>{[0, 60, 120, 180, 240, 300].map((a) => <g key={a} transform={`rotate(${a})`}><path d="M0 0 L16 0 M9 0 L13 -4 M9 0 L13 4" /></g>)}</g>}
      {id === "drop" && <path {...p} d="M0 -16 Q15 2 0 15 Q-15 2 0 -16 Z" />}
      {id === "spore" && <g {...p}><circle r="4" />{[0, 72, 144, 216, 288].map((a) => <circle key={a} r="4" cx={Math.cos((a * Math.PI) / 180) * 11} cy={Math.sin((a * Math.PI) / 180) * 11} />)}</g>}
      {id === "bloom" && <g {...p}>{[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} rx="3.6" ry="8" cy="-8" transform={`rotate(${a})`} />)}</g>}
      {id === "moon" && <path {...p} d="M8 -12 A14 14 0 1 0 8 12 A10 10 0 1 1 8 -12 Z" />}
      {id === "tri" && <path {...p} d="M0 -14 L13 10 L-13 10 Z" />}
    </svg>
  );
}
export function Symbols({ submit, sfx }) {
  const [w, setW] = useState([4, 5, 4, 5]);
  const [msg, setMsg] = useState(null);
  const spin = (i, d) => {
    sfx("click");
    setMsg(null);
    setW((o) => o.map((v, j) => (j === i ? (v + d + SYMBOLS.length) % SYMBOLS.length : v)));
  };
  return (
    <div className="o47-symbols">
      <div className="o47-symbols__row">
        {w.map((v, i) => (
          <div key={i} className="o47-wheel">
            <button type="button" onClick={() => spin(i, -1)} aria-label="Previous symbol">▲</button>
            <div className="o47-wheel__face"><Glyph id={SYMBOLS[v]} /></div>
            <button type="button" onClick={() => spin(i, 1)} aria-label="Next symbol">▼</button>
          </div>
        ))}
      </div>
      <Fault msg={msg} />
      <button type="button" className="o47-btn is-go" onClick={() => !submit(w.map((v) => SYMBOLS[v])) && setMsg("The shackle doesn't budge.")}>OPEN LOCK</button>
    </div>
  );
}

/* ------------------------------------------------------------ challenge */
export function Challenge({ pz, submit, sfx }) {
  return (
    <Keypad
      pz={{ len: 4 }}
      submit={submit}
      sfx={sfx}
      extra={
        <div className="o47-challenge">
          <div>CLEARANCE <b>E. VARGA · LEVEL 5</b> <span className="is-ok">ACCEPTED</span></div>
          <div className="o47-challenge__word">CHALLENGE: <b>{pz.challenge}</b></div>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------ tuner */
export function Tuner({ pz, submit, sfx }) {
  const [v, setV] = useState(() => Object.fromEntries(pz.dials.map(([id, , , , , , init]) => [id, init])));
  const [msg, setMsg] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((x) => x + 1), 90);
    return () => clearInterval(iv);
  }, []);
  // closeness 0..1 per dial (physical feedback: how strong the lock is)
  const close = pz.dials.map(([id, , min, max]) => {
    const span = (max - min) * (pz.meter === "signal" ? 0.08 : 0.12);
    return Math.max(0, 1 - Math.abs(v[id] - pz.target[id]) / span);
  });
  const q = close.reduce((a, b) => a * b, 1);
  const step = (id, s, min, max, n) => {
    sfx("click");
    setMsg(null);
    setV((o) => ({ ...o, [id]: Math.round(Math.max(min, Math.min(max, o[id] + s * n)) * 1000) / 1000 }));
  };
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    let y;
    if (pz.meter === "spectrum") {
      const wl = 380 + (i / 60) * 320;
      const peak = Math.exp(-(((wl - v.wl) / 14) ** 2)) * (v.gain / 5);
      const real = Math.exp(-(((wl - pz.target.wl) / 10) ** 2)) * (v.gain === pz.target.gain ? 1 : 0.45);
      y = 0.08 + 0.6 * real * peak + 0.05 * Math.sin(i * 1.7 + tick * 0.3) * (1 - q);
    } else {
      y = 0.5 + Math.sin(i * 0.9 + tick * 0.6) * 0.38 * q + (Math.random() - 0.5) * 0.7 * (1 - q);
    }
    pts.push(`${(i / 60) * 300},${100 - Math.max(0, Math.min(1, y)) * 100}`);
  }
  return (
    <div className="o47-tuner">
      <svg viewBox="0 0 300 100" className="o47-tuner__scope" preserveAspectRatio="none">
        <polyline points={pts.join(" ")} />
      </svg>
      <div className={`o47-meter${q > 0.98 ? " is-ok" : ""}`}>
        <div className="o47-meter__bar"><i style={{ width: `${q * 100}%` }} /></div>
        <span>{pz.meter === "signal" ? "SIGNAL" : "PEAK MATCH"} {Math.round(q * 100)}%</span>
      </div>
      <div className="o47-tuner__dials">
        {pz.dials.map(([id, label, min, max, st, unit]) => (
          <div key={id} className="o47-dial">
            <b>{label}</b>
            <div className="o47-dial__val">{st < 1 ? v[id].toFixed(1) : v[id]} {unit}</div>
            <input type="range" min={min} max={max} step={st} value={v[id]} onChange={(e) => (setMsg(null), setV((o) => ({ ...o, [id]: Number(e.target.value) })))} aria-label={label} />
            <div className="o47-dial__ctl">
              <button type="button" onClick={() => step(id, -st, min, max, 10)}>«</button>
              <button type="button" onClick={() => step(id, -st, min, max, 1)}>‹</button>
              <button type="button" onClick={() => step(id, st, min, max, 1)}>›</button>
              <button type="button" onClick={() => step(id, st, min, max, 10)}>»</button>
            </div>
          </div>
        ))}
      </div>
      <Fault msg={msg} />
      <button type="button" className="o47-btn is-go" onClick={() => !submit(v) && setMsg(pz.meter === "signal" ? "No carrier. Nobody answers on that setting." : "Calibration failed — no specimen signature.")}>
        {pz.meter === "signal" ? "TRANSMIT" : "CALIBRATE"}
      </button>
    </div>
  );
}

export const PUZZLE_UI = {
  keypad: Keypad, password: Password, sequence: Sequence, circuit: Circuit, valves: Valves, switches: Switches,
  timeline: Timeline, steam: Steam, gears: Gears, symbols: Symbols, challenge: Challenge, tuner: Tuner,
};
