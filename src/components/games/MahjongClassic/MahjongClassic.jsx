/**
 * Mahjong Classic — Mahjong Solitaire: clear the board by removing pairs of
 * matching free tiles. Rendered inside the shared <GamePlayer> (registered by
 * name in ../registry.js); Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) deals a new board with the current
 * layout and difficulty; `muted` silences the WebAudio clicks. Settings live
 * in localStorage under `mahjong-classic-settings`, best score / time per
 * layout + difficulty under `mahjong-classic-best`. Rules: ./engine.js.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DIFFICULTIES, LAYOUTS, availablePairs, canMatch, formatTime, freeTile, hint, match, newGame, pause, remaining, resume, shuffle, timeOf, undo } from "./engine.js";
import { TileFace, faceName } from "./faces.jsx";
import "./MahjongClassic.css";

const SETTINGS_KEY = "mahjong-classic-settings";
const BEST_KEY = "mahjong-classic-best";
const ASPECT = 1.32; // tile height / width
const DEPTH = 0.3; // layer offset, in half-tile widths
const EDGE = 0.22; // tile thickness

const load = (key, fallback) => {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key)) };
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
};

let ctx = null;
function blip(kind) {
  const notes = { tap: [[880, 0.04, 0.035]], match: [[660, 0.12, 0.05], [990, 0.16, 0.04]], bad: [[180, 0.14, 0.05]], shuffle: [[440, 0.08, 0.03], [550, 0.08, 0.03], [660, 0.1, 0.03]], win: [[523, 0.2, 0.05], [659, 0.2, 0.05], [784, 0.2, 0.05], [1047, 0.45, 0.05]] }[kind];
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    notes.forEach(([freq, dur, vol], k) => {
      const t = ctx.currentTime + k * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "bad" ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    });
  } catch {
    /* audio unavailable */
  }
}

const Tile = memo(function Tile({ i, face, gone, free, dim, cls, style, onPick }) {
  return (
    <button
      type="button"
      className={`mj-tile${gone ? " is-gone" : ""}${dim && !free ? " is-blocked" : ""}${cls}`}
      style={style}
      onClick={() => onPick(i)}
      tabIndex={gone ? -1 : 0}
      aria-hidden={gone || undefined}
      aria-label={`${faceName(face)}${free ? "" : " (blocked)"}`}
    >
      <TileFace face={face} />
    </button>
  );
});

function Clock({ s }) {
  const [now, setNow] = useState(() => Date.now());
  const running = s.since != null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  return formatTime(running ? timeOf(s, now) : s.elapsed);
}

export default function MahjongClassic({ restartSignal = 0, muted = false }) {
  const [settings, setSettings] = useState(() => load(SETTINGS_KEY, { layout: "turtle", level: "medium", showFree: true }));
  const [best, setBest] = useState(() => load(BEST_KEY, {}));
  const [s, setS] = useState(() => newGame(settings.layout, settings.level));
  const [sel, setSel] = useState(null);
  const [fx, setFx] = useState(null); // { ids, kind: "bad" | "hint", n }
  const [note, setNote] = useState(null);
  const [cw, setCw] = useState(0);
  const stageRef = useRef(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const play = (kind) => !mutedRef.current && blip(kind);

  const diff = DIFFICULTIES[s.level];
  const bestKey = `${s.layout}-${s.level}`;
  const prevBest = best[bestKey];
  const free = useMemo(() => s.tiles.map((_, i) => freeTile(s, i)), [s]);
  const pairs = useMemo(() => availablePairs(s), [s]);
  const stuck = !s.won && pairs.length === 0;
  const hintsLeft = diff.hints - s.hintsUsed;

  const deal = useCallback((layout, level) => {
    setS(newGame(layout, level));
    setSel(null);
    setFx(null);
    setNote(null);
  }, []);

  const changeSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    save(SETTINGS_KEY, next);
    if (patch.layout || patch.level) deal(next.layout, next.level);
  };

  // GamePlayer Restart -> fresh deal with the same settings
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    deal(s.layout, s.level);
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // effects (bad-match shake, hint glow, notes) clear themselves
  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(() => setFx(null), fx.kind === "hint" ? 2200 : 450);
    return () => clearTimeout(t);
  }, [fx]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);

  // victory: sound + best score / time
  useEffect(() => {
    if (!s.won) return;
    play("win");
    setBest((b) => {
      const p = b[bestKey] || {};
      const next = { ...b, [bestKey]: { score: Math.max(p.score || 0, s.score), time: Math.min(p.time ?? Infinity, s.elapsed), last: { score: s.score, time: s.elapsed } } };
      save(BEST_KEY, next);
      return next;
    });
  }, [s.won]); // eslint-disable-line react-hooks/exhaustive-deps

  // pause when the tab is hidden
  useEffect(() => {
    const onHide = () => document.hidden && setS((g) => (g.since != null ? pause(g) : g));
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // fit the board to the stage
  const bounds = useMemo(() => {
    let mx = 0, my = 0, mz = 0;
    for (const t of s.tiles) (mx = Math.max(mx, t.x)), (my = Math.max(my, t.y)), (mz = Math.max(mz, t.z));
    return { w: mx + 2 + mz * DEPTH + EDGE, h: (my + 2) * ASPECT + mz * DEPTH + EDGE, mz };
  }, [s.tiles]);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => setCw(Math.max(4, Math.min(el.clientWidth / bounds.w, el.clientHeight / bounds.h)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [bounds]);

  const order = useMemo(() => s.tiles.map((t, i) => [t, i]).sort(([a], [b]) => a.z - b.z || a.y - b.y || a.x - b.x).map(([, i]) => i), [s.tiles]);
  const styles = useMemo(() => {
    const out = [];
    order.forEach((i, k) => {
      const t = s.tiles[i];
      const off = (bounds.mz - t.z) * DEPTH * cw;
      out[i] = { left: t.x * cw + off, top: t.y * cw * ASPECT + off, width: 2 * cw, height: 2 * cw * ASPECT, zIndex: k + 1, "--d": `${Math.max(1.5, cw * EDGE)}px`, "--k": k };
    });
    return out;
  }, [order, s.tiles, bounds, cw]);

  const pick = (i) => {
    if (s.won || s.paused || s.gone[i]) return;
    if (!free[i]) {
      play("bad");
      setFx({ ids: [i], kind: "bad", n: Math.random() });
      setNote("That tile is blocked — it needs a free left or right side and nothing on top.");
      return;
    }
    if (sel === null) return play("tap"), setSel(i);
    if (sel === i) return setSel(null);
    const next = match(s, sel, i);
    if (next) {
      play("match");
      setS(next);
      setSel(null);
      setFx(null);
      return;
    }
    if (!canMatch(s.faces[sel], s.faces[i])) {
      play("bad");
      setFx({ ids: [sel, i], kind: "bad", n: Math.random() });
    }
    setSel(i);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const onPick = useCallback((i) => pickRef.current(i), []);

  const doHint = () => {
    if (s.won || s.paused || hintsLeft <= 0) return;
    const h = hint(s);
    if (!h) return;
    setSel(null);
    setFx({ ids: h, kind: "hint", n: Math.random() });
    setS({ ...s, hintsUsed: s.hintsUsed + 1, score: Math.max(0, s.score - Math.round(10 * diff.mult)) });
  };
  const doShuffle = () => {
    if (s.won || s.paused) return;
    const { state, rewound } = shuffle(s);
    play("shuffle");
    setS(state);
    setSel(null);
    setFx(null);
    setNote(rewound ? `Those tiles could no longer be cleared in any order — rewound ${rewound} move${rewound > 1 ? "s" : ""} and reshuffled.` : "Tiles reshuffled — the board can be cleared again.");
  };
  const doUndo = () => {
    if (s.won || s.paused || !s.history.length) return;
    setS(undo(s));
    setSel(null);
    setFx(null);
  };
  const togglePause = () => setS((g) => (g.paused ? resume(g) : pause(g)));

  // keyboard: H hint, S shuffle, U / Ctrl+Z undo, P pause
  const keysRef = useRef(null);
  keysRef.current = { h: doHint, s: doShuffle, u: doUndo, z: doUndo, p: togglePause };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, select, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !(e.ctrlKey || e.metaKey)) return;
      if (keysRef.current[k] && !e.altKey) {
        e.preventDefault();
        keysRef.current[k]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // DEV test hook (?mjtest=1)
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has("mjtest")) return;
    window.__mj = { state: () => s, set: setS, pick: onPick, sel: () => sel };
  });

  const fxClass = (i) => (fx?.ids.includes(i) ? (fx.kind === "bad" ? " is-bad" : " is-hint") : "");
  const isRecord = s.won && prevBest && prevBest.score === s.score;

  return (
    <div className="mj">
      <div className="mj-layout">
        <aside className="mj-side">
          <header className="mj-head">
            <h2 className="mj-title">Mahjong <span>Classic</span></h2>
            <p className="mj-tag">MATCH • CLEAR • RELAX</p>
          </header>

          <div className="mj-stats">
            <div className="mj-stat"><span>Tiles</span><strong>{remaining(s)}</strong></div>
            <div className="mj-stat"><span>Time</span><strong><Clock s={s} /></strong></div>
            <div className="mj-stat"><span>Moves</span><strong>{s.moves}</strong></div>
            <div className="mj-stat"><span>Score</span><strong>{s.score}</strong></div>
          </div>

          <div className="mj-pickers">
            <label className="mj-pick">
              <span>Layout</span>
              <select value={s.layout} onChange={(e) => changeSettings({ layout: e.target.value })}>
                {Object.entries(LAYOUTS).map(([id, l]) => <option key={id} value={id}>{l.label} ({l.cells.length})</option>)}
              </select>
            </label>
            <label className="mj-pick">
              <span>Difficulty</span>
              <select value={s.level} onChange={(e) => changeSettings({ level: e.target.value })}>
                {Object.entries(DIFFICULTIES).map(([id, d]) => <option key={id} value={id}>{d.label}</option>)}
              </select>
            </label>
          </div>

          <div className="mj-actions">
            <button type="button" className="mj-btn" onClick={doHint} disabled={s.won || s.paused || hintsLeft <= 0 || stuck} title="Hint (H)">
              Hint{Number.isFinite(hintsLeft) ? ` ${hintsLeft}` : ""}
            </button>
            <button type="button" className="mj-btn" onClick={doShuffle} disabled={s.won || s.paused} title="Shuffle (S)">Shuffle</button>
            <button type="button" className="mj-btn" onClick={doUndo} disabled={s.won || s.paused || !s.history.length} title="Undo (U)">Undo</button>
            <button type="button" className="mj-btn" onClick={togglePause} disabled={s.won} title="Pause (P)">{s.paused ? "Resume" : "Pause"}</button>
            <button type="button" className="mj-btn mj-btn--main" onClick={() => deal(s.layout, s.level)}>New Game</button>
          </div>

          <div className="mj-foot">
            <label className="mj-toggle">
              <input type="checkbox" checked={settings.showFree} onChange={(e) => changeSettings({ showFree: e.target.checked })} />
              <span>Dim blocked tiles</span>
            </label>
            <p className="mj-best">Best: <strong>{prevBest ? `${prevBest.score} pts · ${formatTime(prevBest.time)}` : "—"}</strong></p>
            <p className="mj-moves">{s.won ? "Board cleared" : stuck ? "No matches left" : `${pairs.length} match${pairs.length === 1 ? "" : "es"} available`}</p>
          </div>
        </aside>

        <div className="mj-stage" ref={stageRef}>
          <div key={s.key} className={`mj-board${s.paused ? " is-paused" : ""}`} style={{ width: bounds.w * cw, height: bounds.h * cw }}>
            {s.tiles.map((_, i) => (
              <Tile key={i} i={i} face={s.faces[i]} gone={s.gone[i]} free={free[i]} dim={settings.showFree} cls={`${sel === i ? " is-sel" : ""}${fxClass(i)}`} style={styles[i]} onPick={onPick} />
            ))}
          </div>

          {note && <p className="mj-note" role="status">{note}</p>}

          {stuck && !s.paused && (
            <div className="mj-banner" role="alert">
              <strong>No matching free tiles left</strong>
              <div>
                <button type="button" className="mj-btn mj-btn--main" onClick={doShuffle}>Shuffle</button>
                <button type="button" className="mj-btn" onClick={doUndo} disabled={!s.history.length}>Undo</button>
                <button type="button" className="mj-btn" onClick={() => deal(s.layout, s.level)}>New Game</button>
              </div>
            </div>
          )}

          {s.paused && (
            <div className="mj-overlay">
              <h3>Paused</h3>
              <button type="button" className="mj-btn mj-btn--main" onClick={togglePause}>Resume</button>
            </div>
          )}

          {s.won && (
            <div className="mj-overlay is-win">
              <p className="mj-kicker">{isRecord ? "★ New Best Score ★" : `${LAYOUTS[s.layout].label} · ${diff.label}`}</p>
              <h3>Board Cleared!</h3>
              <div className="mj-stats">
                <div className="mj-stat"><span>Score</span><strong>{s.score}</strong></div>
                <div className="mj-stat"><span>Time</span><strong>{formatTime(s.elapsed)}</strong></div>
                <div className="mj-stat"><span>Moves</span><strong>{s.moves}</strong></div>
                <div className="mj-stat"><span>Time bonus</span><strong>+{s.timeBonus}</strong></div>
              </div>
              <button type="button" className="mj-btn mj-btn--main" onClick={() => deal(s.layout, s.level)}>Play Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
