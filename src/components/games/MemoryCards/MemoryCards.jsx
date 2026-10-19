/**
 * Memory Cards — flip two cards at a time, find every matching pair. Rendered
 * inside the shared <GamePlayer> (registered by name in ../registry.js);
 * Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) deals a new game at the current
 * difficulty. `muted` silences the WebAudio blips. Best time per difficulty
 * lives in localStorage under `memory-cards-best`.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { LEVELS, formatTime, newGame, reduce, timeOf, totalPairs } from "./engine.js";
import "./MemoryCards.css";

const BEST_KEY = "memory-cards-best";
const HIDE_DELAY = 850;

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) || {};
  } catch {
    return {};
  }
}

let ctx = null;
function blip(kind) {
  const notes = { flip: [520, 0.05, 0.03], match: [660, 0.18, 0.06], miss: [200, 0.16, 0.04], win: [523, 0.5, 0.07] }[kind];
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const [freq, dur, vol] = notes;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    if (kind === "win" || kind === "match") osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* audio unavailable */
  }
}

/* Twelve pair illustrations, drawn in a 100x100 box: [name, colour, shapes]. */
const FACES = [
  ["Heart", "#ff4d6d", <path d="M50 82C20 62 12 44 22 30 32 17 46 22 50 34 54 22 68 17 78 30 88 44 80 62 50 82Z" />],
  ["Star", "#ffb703", <polygon points="50,12 61,38 89,40 67,58 74,86 50,70 26,86 33,58 11,40 39,38" />],
  ["Moon", "#8e9bff", <path d="M60 14A37 37 0 1 0 86 70 29 29 0 1 1 60 14Z" />],
  ["Sun", "#ff8c1a", <>
    <circle cx="50" cy="50" r="18" />
    <g strokeWidth="7" strokeLinecap="round" stroke="currentColor">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="50" y1="20" x2="50" y2="10" transform={`rotate(${a} 50 50)`} />)}
    </g>
  </>],
  ["Gem", "#22d3ee", <>
    <path d="M30 20H70L88 42 50 86 12 42Z" />
    <path d="M12 42H88M30 20 40 42 50 86 60 42 70 20" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="3" />
  </>],
  ["Leaf", "#4ade80", <>
    <path d="M18 82C18 42 44 18 84 16 84 56 60 82 18 82Z" />
    <path d="M18 82 66 34" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="4" strokeLinecap="round" />
  </>],
  ["Drop", "#3b82f6", <>
    <path d="M50 12C64 34 77 50 77 64A27 27 0 0 1 23 64C23 50 36 34 50 12Z" />
    <path d="M36 62A14 14 0 0 0 46 76" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="5" strokeLinecap="round" />
  </>],
  ["Bolt", "#facc15", <polygon points="58,8 22,56 46,56 38,92 78,40 54,40" />],
  ["Crown", "#f59e0b", <>
    <path d="M14 70 18 28 36 48 50 18 64 48 82 28 86 70Z" />
    <rect x="14" y="74" width="72" height="10" rx="3" />
  </>],
  ["Flower", "#e879f9", <>
    {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="50" cy="28" rx="13" ry="19" transform={`rotate(${a} 50 50)`} />)}
    <circle cx="50" cy="50" r="11" fill="#fde047" />
  </>],
  ["Note", "#a78bfa", <>
    <path d="M38 70V26L80 16V60" fill="none" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" />
    <ellipse cx="28" cy="72" rx="13" ry="10" />
    <ellipse cx="70" cy="62" rx="13" ry="10" />
  </>],
  ["Planet", "#fb7185", <>
    <circle cx="50" cy="50" r="22" />
    <ellipse cx="50" cy="50" rx="42" ry="12" fill="none" stroke="currentColor" strokeWidth="6" transform="rotate(-20 50 50)" />
  </>],
];

function CardBack() {
  return (
    <svg viewBox="0 0 60 80" className="mc-back-art" aria-hidden="true">
      <rect x="4" y="4" width="52" height="72" rx="5" />
      <rect x="8" y="8" width="44" height="64" rx="3" strokeOpacity=".45" />
      <path d="M30 18 46 40 30 62 14 40Z" />
      <path d="M30 27 39 40 30 53 21 40Z" strokeOpacity=".6" />
      <circle cx="30" cy="40" r="3" fill="currentColor" />
      {[[8, 8], [52, 8], [8, 72], [52, 72]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="currentColor" />)}
    </svg>
  );
}

export default function MemoryCards({ restartSignal = 0, muted = false }) {
  const [s, dispatch] = useReducer(reduce, "easy", newGame);
  const [best, setBest] = useState(loadBest);
  const [now, setNow] = useState(() => Date.now());
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const play = (kind) => !mutedRef.current && blip(kind);

  // GamePlayer Restart -> fresh deal at the same difficulty
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    dispatch({ type: "new" });
  }, [restartSignal]);

  // mismatched pair flips back after a short delay
  useEffect(() => {
    if (s.open.length !== 2) return;
    const t = setTimeout(() => dispatch({ type: "hide" }), HIDE_DELAY);
    return () => clearTimeout(t);
  }, [s.open]);

  // display clock, only while running
  const running = s.since != null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  // victory: sound + best time
  useEffect(() => {
    if (!s.won) return;
    play("win");
    setBest((b) => {
      const prev = b[s.level];
      if (prev && prev.time <= s.elapsed) return b;
      const next = { ...b, [s.level]: { time: s.elapsed, moves: s.moves } };
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }, [s.won]); // eslint-disable-line react-hooks/exhaustive-deps

  const flip = (index) => {
    const action = { type: "flip", index, now: Date.now() };
    const next = reduce(s, action);
    if (next === s) return;
    play(next.pairs > s.pairs ? "match" : next.open.length === 2 ? "miss" : "flip");
    dispatch(action);
  };

  const { cols, rows } = LEVELS[s.level];
  const prevBest = best[s.level];
  const isRecord = s.won && prevBest && prevBest.time === s.elapsed && prevBest.moves === s.moves;
  const time = s.won || s.paused ? s.elapsed : timeOf(s, now);

  return (
    <div className="mc">
      <div className="mc-layout">
        <aside className="mc-side">
          <header className="mc-head">
            <h2 className="mc-title">Memory <span>Cards</span></h2>
            <p className="mc-tag">FLIP • MATCH • WIN</p>
          </header>

          <div className="mc-stats">
            <div className="mc-stat"><span>Moves</span><strong>{s.moves}</strong></div>
            <div className="mc-stat"><span>Time</span><strong>{formatTime(time)}</strong></div>
            <div className="mc-stat"><span>Pairs</span><strong>{s.pairs}/{totalPairs(s)}</strong></div>
          </div>

          <div className="mc-levels" role="group" aria-label="Difficulty">
            {Object.entries(LEVELS).map(([id, l]) => (
              <button key={id} type="button" className={`mc-level${id === s.level ? " is-on" : ""}`} aria-pressed={id === s.level} onClick={() => dispatch({ type: "new", level: id })}>
                {l.label}
              </button>
            ))}
          </div>

          <div className="mc-actions">
            <button type="button" className="mc-btn mc-btn--main" onClick={() => dispatch({ type: "new" })}>New Game</button>
            <button type="button" className="mc-btn" disabled={s.won} onClick={() => dispatch({ type: s.paused ? "resume" : "pause", now: Date.now() })}>
              {s.paused ? "Resume" : "Pause"}
            </button>
          </div>

          <p className="mc-best">Best {LEVELS[s.level].label}: <strong>{prevBest ? `${formatTime(prevBest.time)} · ${prevBest.moves} moves` : "—"}</strong></p>
        </aside>

        <div className="mc-stage">
          <div key={s.key} className="mc-board" style={{ "--cols": cols, "--rows": rows, "--ar": (cols * 3) / (rows * 4), "--ar-p": (rows * 3) / (cols * 4) }}>
            {s.cards.map((c, i) => {
              const up = c.matched || s.open.includes(i);
              const [name, color, art] = FACES[c.face];
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`mc-card${up ? " is-up" : ""}${c.matched ? " is-matched" : ""}`}
                  style={{ "--c": color, "--i": i }}
                  onClick={() => flip(i)}
                  disabled={s.paused || s.won}
                  aria-label={up ? name : "Hidden card"}
                >
                  <span className="mc-inner">
                    <span className="mc-face mc-face--back"><CardBack /></span>
                    <span className="mc-face mc-face--front">
                      <svg viewBox="0 0 100 100" className="mc-art" fill="currentColor" aria-hidden="true">{art}</svg>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {s.paused && (
            <div className="mc-overlay">
              <h3>Paused</h3>
              <button type="button" className="mc-btn mc-btn--main" onClick={() => dispatch({ type: "resume", now: Date.now() })}>Resume</button>
            </div>
          )}

          {s.won && (
            <div className="mc-overlay is-win">
              <p className="mc-win-kicker">{isRecord ? "★ New Best Time ★" : "All pairs found"}</p>
              <h3>Victory!</h3>
              <div className="mc-stats">
                <div className="mc-stat"><span>Time</span><strong>{formatTime(s.elapsed)}</strong></div>
                <div className="mc-stat"><span>Moves</span><strong>{s.moves}</strong></div>
                <div className="mc-stat"><span>Best</span><strong>{prevBest ? formatTime(prevBest.time) : "—"}</strong></div>
              </div>
              <button type="button" className="mc-btn mc-btn--main" onClick={() => dispatch({ type: "new" })}>Play Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
