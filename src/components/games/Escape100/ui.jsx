/**
 * Escape 100 — React UI pieces: icons, glyphs, keypad, wires, clue reader,
 * 3D item inspector, hint panel, level select, settings.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { GLYPHS, COLORS, paintClue } from "./art.js";
import { THEMES } from "./themes.js";

export const Icon = ({ d, size = 1, fill = false }) => (
  <svg viewBox="0 0 24 24" width={`${size}em`} height={`${size}em`} aria-hidden="true">
    <path d={d} fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const I = {
  menu: "M4 6h16M4 12h16M4 18h16",
  pause: "M8 5v14M16 5v14",
  play: "M7 4.5v15l12-7.5z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  restart: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  sound: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  mute: "M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6",
  full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  exitFull: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6L6 18",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  gear: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  check: "M5 12l4 4 10-10",
  next: "M5 12h14M13 6l6 6-6 6",
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01",
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 8-7 8-3 0-4.5-2-6-5l-1.5-3a1.5 1.5 0 0 1 2.6-1.5L8 13",
};

export function Glyph({ name, size = 1.4, color = "currentColor" }) {
  if (!GLYPHS[name]) return <span>{name}</span>;
  return (
    <svg viewBox="0 0 24 24" width={`${size}em`} height={`${size}em`} aria-label={name} role="img">
      <path d={GLYPHS[name]} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- keypad ---------- */
const KEYSETS = {
  digits: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
};
export function Keypad({ o, onSubmit, onClose, onKey, shake }) {
  const [v, setV] = useState([]);
  const multi = o.glyphs === "symbols" || o.glyphs === "colors";
  const len = multi ? o.code.split(",").length : o.code.length;
  const keys = o.glyphs === "symbols" ? o.keys || ["sun", "moon", "star", "eye", "hand", "fish", "bird", "tree", "wave"] : o.glyphs === "colors" ? o.keys || ["red", "blue", "green", "yellow", "purple", "orange"] : o.glyphs === "letters" ? o.keys || KEYSETS.letters : KEYSETS.digits;
  const sep = o.glyphs === "symbols" || o.glyphs === "colors" ? "," : "";
  useEffect(() => {
    if (shake) setV([]);
  }, [shake]);
  const push = (k) => {
    if (v.length >= len) return;
    onKey?.(v.length);
    setV((cur) => (cur.length >= len ? cur : [...cur, k]));
  };
  useEffect(() => {
    const onKeyDown = (e) => {
      if (o.glyphs !== "symbols" && o.glyphs !== "colors" && /^[0-9a-zA-Z]$/.test(e.key) && keys.includes(e.key.toUpperCase())) push(e.key.toUpperCase());
      else if (e.key === "Backspace") setV((x) => x.slice(0, -1));
      else if (e.key === "Enter" && v.length === len) onSubmit(v.join(sep));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  const show = (k, big) => (o.glyphs === "symbols" ? <Glyph name={k} size={big ? 1.6 : 1.8} /> : o.glyphs === "colors" ? <i className="e100-swatch" style={{ background: COLORS[k] || k }} /> : k);
  return (
    <div className={`e100-panel e100-keypad e100-keypad--${o.glyphs}${shake ? " is-shake" : ""}`} key={shake}>
      <div className="e100-panel__head">
        <b>{o.label || "Keypad"}</b>
        <button className="e100-x" onClick={onClose} aria-label="Close">
          <Icon d={I.close} />
        </button>
      </div>
      <div className="e100-display" data-testid="kp-display">
        {Array.from({ length: len }, (_, i) => (
          <span key={i} className={v[i] != null ? "is-on" : ""}>
            {v[i] != null ? show(v[i], true) : "•"}
          </span>
        ))}
      </div>
      <div className="e100-keys" style={{ "--cols": keys.length > 12 ? 7 : keys.length > 9 ? 5 : 3 }}>
        {keys.map((k) => (
          <button key={k} className="e100-key" onClick={() => push(k)} data-key={k} aria-label={`key ${k}`}>
            {show(k)}
          </button>
        ))}
      </div>
      <div className="e100-panel__row">
        <button className="e100-btn" onClick={() => setV([])} data-key="clear">
          Clear
        </button>
        <button className="e100-btn e100-btn--go" disabled={v.length !== len} onClick={() => onSubmit(v.join(sep))} data-key="ok">
          Enter
        </button>
      </div>
    </div>
  );
}

/* ---------- wires ---------- */
export function Wires({ o, onSubmit, onClose }) {
  const [map, setMap] = useState({});
  const [pick, setPick] = useState(null);
  const connect = (r) => {
    if (!pick) return;
    const m = Object.fromEntries(Object.entries(map).filter(([k, v]) => k !== pick && v !== r));
    m[pick] = r;
    setMap(m);
    setPick(null);
  };
  const H = Math.max(o.left.length, o.right.length);
  const y = (i, n) => 30 + (i + (H - n) / 2) * 56;
  return (
    <div className="e100-panel e100-wires">
      <div className="e100-panel__head">
        <b>{o.label || "Wiring Panel"}</b>
        <button className="e100-x" onClick={onClose} aria-label="Close">
          <Icon d={I.close} />
        </button>
      </div>
      <p className="e100-panel__tip">Tap a coloured wire on the left, then the terminal it should connect to.</p>
      <div className="e100-wires__board" style={{ height: H * 56 + 10 }}>
        <svg className="e100-wires__svg" viewBox={`0 0 300 ${H * 56 + 10}`} preserveAspectRatio="none">
          {Object.entries(map).map(([l, r]) => (
            <path key={l} d={`M40 ${y(o.left.indexOf(l), o.left.length)} C150 ${y(o.left.indexOf(l), o.left.length)} 150 ${y(o.right.indexOf(r), o.right.length)} 260 ${y(o.right.indexOf(r), o.right.length)}`} stroke={COLORS[l] || l} strokeWidth="7" fill="none" strokeLinecap="round" />
          ))}
        </svg>
        <div className="e100-wires__col">
          {o.left.map((l, i) => (
            <button key={l} className={`e100-term${pick === l ? " is-pick" : ""}`} style={{ top: y(i, o.left.length) - 20, background: COLORS[l] || l }} onClick={() => setPick(l)} data-wire={l} aria-label={`wire ${l}`} />
          ))}
        </div>
        <div className="e100-wires__col e100-wires__col--r">
          {o.right.map((r, i) => (
            <button key={r} className="e100-term e100-term--r" style={{ top: y(i, o.right.length) - 20 }} onClick={() => connect(r)} data-term={r} aria-label={`terminal ${r}`}>
              {o.rightGlyphs ? <Glyph name={o.rightGlyphs[i]} size={1.1} /> : o.rightLabels?.[i] ?? r}
            </button>
          ))}
        </div>
      </div>
      <div className="e100-panel__row">
        <button className="e100-btn" onClick={() => setMap({})} data-key="clear">
          Reset
        </button>
        <button className="e100-btn e100-btn--go" disabled={Object.keys(map).length !== o.left.length} onClick={() => onSubmit(map)} data-key="ok">
          Power On
        </button>
      </div>
    </div>
  );
}

/* ---------- reader (clues, notes) ---------- */
export function Reader({ title, content, onClose }) {
  const url = useMemo(() => {
    const c = paintClue(content, 768, Math.round(768 * 0.72));
    return c?.toDataURL("image/png");
  }, [content]);
  return (
    <div className="e100-panel e100-reader">
      <div className="e100-panel__head">
        <b>{title}</b>
        <button className="e100-x" onClick={onClose} aria-label="Close">
          <Icon d={I.close} />
        </button>
      </div>
      {url && <img src={url} alt={[content.title, content.big, ...(content.lines || [])].filter(Boolean).join(" ")} />}
    </div>
  );
}

/* ---------- 3D item inspector ---------- */
export function Inspector({ item, def, inspect, onClose, onUse }) {
  const host = useRef(null);
  useEffect(() => {
    if (!inspect) return;
    inspect.showInspect(def);
    const cv = inspect.canvas;
    cv.className = "e100-inspect__cv";
    host.current?.appendChild(cv);
    let d = null;
    const down = (e) => ((d = { x: e.clientX, y: e.clientY }), cv.setPointerCapture?.(e.pointerId));
    const move = (e) => {
      if (!d) return;
      inspect.drag(e.clientX - d.x, e.clientY - d.y);
      d = { x: e.clientX, y: e.clientY };
    };
    const up = () => (d = null);
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      inspect.hideInspect();
      cv.remove();
    };
  }, [inspect, def]);
  const contentUrl = useMemo(() => (def.content ? paintClue(def.content, 640, 460)?.toDataURL() : null), [def]);
  return (
    <div className="e100-panel e100-inspect">
      <div className="e100-panel__head">
        <b>{def.name}</b>
        <button className="e100-x" onClick={onClose} aria-label="Close">
          <Icon d={I.close} />
        </button>
      </div>
      <div className="e100-inspect__body">
        <div className="e100-inspect__view" ref={host} />
        {contentUrl && <img className="e100-inspect__content" src={contentUrl} alt={[def.content.title, ...(def.content.lines || [])].filter(Boolean).join(" ")} />}
      </div>
      <p className="e100-panel__tip">{def.desc} {def.inspectText || ""}</p>
      <div className="e100-panel__row">
        <button className="e100-btn e100-btn--go" onClick={onUse} data-key="use">
          <Icon d={I.hand} /> Use on…
        </button>
      </div>
      <span hidden>{item}</span>
    </div>
  );
}

/* ---------- hints ---------- */
export function Hints({ stage, hints, shown, onMore, onClose }) {
  const list = hints[stage].h;
  return (
    <div className="e100-panel e100-hints">
      <div className="e100-panel__head">
        <b>
          <Icon d={I.bulb} /> Hints
        </b>
        <button className="e100-x" onClick={onClose} aria-label="Close">
          <Icon d={I.close} />
        </button>
      </div>
      <ol>
        {list.slice(0, shown).map((h, i) => (
          <li key={i} className={`e100-hint e100-hint--${i}`}>
            <em>{["A nudge", "A clue", "The answer"][i]}</em>
            {h}
          </li>
        ))}
      </ol>
      {shown < 3 ? (
        <button className="e100-btn e100-btn--go" onClick={onMore} data-key="more">
          {shown === 0 ? "Show a hint" : shown === 1 ? "I need more help" : "Show me what to do"}
        </button>
      ) : (
        <p className="e100-panel__tip">Hints follow your progress — come back after the next step.</p>
      )}
    </div>
  );
}

/* ---------- level select ---------- */
export function LevelSelect({ levels, prog, onPick, onBack }) {
  const [ch, setCh] = useState(() => Math.floor((prog.current - 1) / 10));
  const theme = THEMES[ch];
  const done = levels.slice(ch * 10, ch * 10 + 10).filter((L) => prog.done[L.id]).length;
  return (
    <div className="e100-levels" style={{ "--tc": theme.color }}>
      <div className="e100-levels__head">
        <button className="e100-icon" onClick={onBack} aria-label="Back">
          <Icon d={I.back} />
        </button>
        <div>
          <h2>Select a Room</h2>
          <p>{Object.keys(prog.done).length} / 100 escaped</p>
        </div>
      </div>
      <div className="e100-chapters" role="tablist">
        {THEMES.map((t, i) => {
          const locked = i * 10 + 1 > prog.unlocked;
          const n = levels.slice(i * 10, i * 10 + 10).filter((L) => prog.done[L.id]).length;
          return (
            <button key={t.key} role="tab" aria-selected={i === ch} className={`e100-chap${i === ch ? " is-on" : ""}${locked ? " is-locked" : ""}`} style={{ "--cc": t.color }} onClick={() => setCh(i)}>
              <b>{i + 1}</b>
              <span>{t.chapter.replace("The ", "")}</span>
              <i style={{ width: `${n * 10}%` }} />
            </button>
          );
        })}
      </div>
      <div className="e100-chapinfo">
        <h3>
          Chapter {ch + 1} · {theme.chapter}
        </h3>
        <p>
          {theme.blurb} <b>{done}/10</b>
        </p>
      </div>
      <div className="e100-grid">
        {levels.slice(ch * 10, ch * 10 + 10).map((L) => {
          const locked = L.id > prog.unlocked, d = prog.done[L.id], cur = L.id === prog.current;
          return (
            <button key={L.id} className={`e100-tile${locked ? " is-locked" : ""}${d ? " is-done" : ""}${cur ? " is-cur" : ""}`} disabled={locked} onClick={() => onPick(L.id)} aria-label={`Room ${L.id}${locked ? " locked" : `: ${L.name}`}`}>
              <span className="e100-tile__n">{L.id}</span>
              <span className="e100-tile__name">{locked ? "Locked" : L.name}</span>
              <span className="e100-tile__ico">{locked ? <Icon d={I.lock} /> : d ? <Icon d={I.check} /> : <Icon d={I.door} />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- settings ---------- */
export function Settings({ settings, onChange, onClose, onReset }) {
  const [confirm, setConfirm] = useState(false);
  const slider = (key, label) => (
    <label className="e100-set">
      <span>{label}</span>
      <input type="range" min="0" max="1" step="0.05" value={settings[key]} onChange={(e) => onChange({ [key]: +e.target.value })} />
      <output>{Math.round(settings[key] * 100)}%</output>
    </label>
  );
  return (
    <div className="e100-panel e100-settings">
      <div className="e100-panel__head">
        <b>
          <Icon d={I.gear} /> Settings
        </b>
        <button className="e100-x" onClick={onClose} aria-label="Close">
          <Icon d={I.close} />
        </button>
      </div>
      <div className="e100-set">
        <span>Graphics</span>
        <div className="e100-seg">
          {["low", "medium", "high"].map((q) => (
            <button key={q} className={settings.quality === q ? "is-on" : ""} onClick={() => onChange({ quality: q })}>
              {q}
            </button>
          ))}
        </div>
      </div>
      {slider("master", "Master volume")}
      {slider("sfx", "Effects")}
      {slider("amb", "Ambience")}
      <label className="e100-set">
        <span>Mute all sound</span>
        <input type="checkbox" checked={settings.muted} onChange={(e) => onChange({ muted: e.target.checked })} />
      </label>
      <label className="e100-set">
        <span>Look sensitivity</span>
        <input type="range" min="0.4" max="2" step="0.1" value={settings.sens} onChange={(e) => onChange({ sens: +e.target.value })} />
        <output>{settings.sens.toFixed(1)}×</output>
      </label>
      <div className="e100-panel__row">
        {confirm ? (
          <>
            <span className="e100-warn">Erase all progress?</span>
            <button className="e100-btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="e100-btn e100-btn--danger" onClick={() => (setConfirm(false), onReset())}>
              Erase
            </button>
          </>
        ) : (
          <button className="e100-btn e100-btn--danger" onClick={() => setConfirm(true)}>
            Reset progress
          </button>
        )}
      </div>
    </div>
  );
}
