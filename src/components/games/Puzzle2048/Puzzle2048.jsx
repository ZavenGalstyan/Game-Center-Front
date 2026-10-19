/**
 * 2048 Puzzle — slide numbered tiles on a 4x4 board, merge equal pairs and
 * chase the 2048 tile. Rendered inside the shared <GamePlayer> (registered by
 * name in ../registry.js); Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) starts a new board, keeping the best
 * score. `muted` silences the little WebAudio blips. The board, score, best
 * score and one-step undo live in localStorage under `puzzle-2048-save`.
 */
import { useEffect, useReducer, useRef } from "react";
import { reduce, restore, serialize } from "./engine.js";
import "./Puzzle2048.css";

const SAVE_KEY = "puzzle-2048-save";
const KEYS = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
};

function load() {
  try {
    return restore(JSON.parse(localStorage.getItem(SAVE_KEY)));
  } catch {
    return restore(null);
  }
}

let ctx = null;
function blip(kind) {
  const notes = { move: [180, 0.04, 0.03], merge: [440, 0.09, 0.06], undo: [260, 0.07, 0.04], new: [330, 0.1, 0.05], win: [660, 0.35, 0.07], over: [140, 0.4, 0.06] }[kind];
  if (!notes) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const [freq, dur, vol] = notes;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (kind === "win") osc.frequency.exponentialRampToValueAtTime(freq * 2, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* audio unavailable */
  }
}

const tileClass = (v) => `p2048-tile p2048-v${v > 2048 ? "super" : v} p2048-d${Math.min(String(v).length, 6)}`;

export default function Puzzle2048({ restartSignal = 0, muted = false }) {
  const [s, dispatch] = useReducer(reduce, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(s)));
    } catch {
      /* storage full or blocked */
    }
  }, [s]);

  const lastSeq = useRef(s.seq);
  useEffect(() => {
    if (s.seq === lastSeq.current) return;
    lastSeq.current = s.seq;
    if (!muted && s.sound) blip(s.sound);
  }, [s.seq, s.sound, muted]);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    dispatch({ type: "new" });
  }, [restartSignal]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const dir = KEYS[e.key] || KEYS[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        dispatch({ type: "move", dir });
      } else if (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "u") {
        dispatch({ type: "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const touch = useRef(null);
  const onPointerDown = (e) => {
    touch.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId); // swipes that end off the board still count
  };
  const onPointerUp = (e) => {
    if (!touch.current) return;
    const dx = e.clientX - touch.current.x;
    const dy = e.clientY - touch.current.y;
    touch.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    dispatch({ type: "move", dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up" });
  };

  const showWin = s.won && !s.keep;

  return (
    <div className="p2048">
      <div className="p2048-layout">
        <aside className="p2048-side">
          <header className="p2048-head">
            <h2 className="p2048-title">2048</h2>
            <p className="p2048-tag">SLIDE • MERGE • WIN</p>
          </header>
          <div className="p2048-scores">
            <div className="p2048-score">
              <span>Score</span>
              <strong>{s.score}</strong>
              {s.gain > 0 && <em key={s.seq} className="p2048-gain">+{s.gain}</em>}
            </div>
            <div className="p2048-score">
              <span>Best</span>
              <strong>{s.best}</strong>
            </div>
          </div>
          <div className="p2048-actions">
            <button type="button" className="p2048-btn p2048-btn--main" onClick={() => dispatch({ type: "new" })}>New Game</button>
            <button type="button" className="p2048-btn" onClick={() => dispatch({ type: "undo" })} disabled={!s.prev}>Undo</button>
          </div>
          <p className="p2048-hint">Arrows / WASD or swipe</p>
        </aside>

        <div
          className="p2048-board"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (touch.current = null)}
        >
          {Array.from({ length: 16 }, (_, k) => (
            <div key={k} className="p2048-cell" style={{ "--r": Math.floor(k / 4), "--c": k % 4 }} />
          ))}
          {s.tiles.map((t) => (
            <div
              key={t.id}
              className={`${tileClass(t.v)}${t.gone ? " is-gone" : ""}${t.merged ? " is-merged" : ""}${t.isNew ? " is-new" : ""}`}
              style={{ "--r": t.r, "--c": t.c }}
            >
              <span>{t.v}</span>
            </div>
          ))}

          {(showWin || s.over) && (
            <div className={`p2048-overlay${showWin ? " is-win" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
              <h3>{showWin ? "You made 2048!" : "Game Over"}</h3>
              <p>Score {s.score}</p>
              <div className="p2048-actions">
                {showWin ? (
                  <button type="button" className="p2048-btn p2048-btn--main" onClick={() => dispatch({ type: "keep" })}>Keep Playing</button>
                ) : (
                  <button type="button" className="p2048-btn" onClick={() => dispatch({ type: "undo" })} disabled={!s.prev}>Undo</button>
                )}
                <button type="button" className={`p2048-btn${showWin ? "" : " p2048-btn--main"}`} onClick={() => dispatch({ type: "new" })}>
                  {showWin ? "New Game" : "Try Again"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
