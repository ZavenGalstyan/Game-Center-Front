/**
 * Snake Classic — steer the snake around a 20x20 board, eat food, grow and
 * avoid the walls and your own tail. Rendered inside the shared <GamePlayer>
 * (registered by name in ../registry.js); Restart / Mute / Fullscreen / Like
 * stay there.
 *
 * `restartSignal` (GamePlayer Restart) starts a fresh game; `muted` silences
 * the WebAudio blips. Only the best score is persisted, under
 * `snake-classic-best`.
 */
import { useEffect, useReducer, useRef } from "react";
import { create, reduce, tickMs } from "./engine.js";
import "./SnakeClassic.css";

const BEST_KEY = "snake-classic-best";
const KEYS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};
const ROTATE = { right: 0, down: 90, left: 180, up: 270 };

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

let ctx = null;
function blip(freq, dur, vol, slide = 1) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* audio unavailable */
  }
}

export default function SnakeClassic({ restartSignal = 0, muted = false }) {
  const [s, dispatch] = useReducer(reduce, undefined, () => create(loadBest()));
  const playing = s.status === "playing";
  const ended = s.status === "over" || s.status === "won";
  const tick = tickMs(s.eaten);

  // Game loop: one interval per speed level, cleared on pause / game over / unmount.
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => dispatch({ type: "tick" }), tick);
    return () => clearInterval(id);
  }, [playing, tick]);

  useEffect(() => {
    try {
      localStorage.setItem(BEST_KEY, String(s.best));
    } catch {
      /* storage blocked */
    }
  }, [s.best]);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  useEffect(() => {
    if (s.eaten && !mutedRef.current) blip(520, 0.09, 0.06, 1.6);
  }, [s.eaten]);
  useEffect(() => {
    if (mutedRef.current) return;
    if (s.status === "over") blip(220, 0.45, 0.08, 0.4);
    if (s.status === "won") blip(440, 0.6, 0.08, 2);
  }, [s.status]);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    dispatch({ type: "new" });
  }, [restartSignal]);

  // Pause when the tab is hidden so the snake doesn't die off-screen.
  useEffect(() => {
    const onHide = () => document.hidden && dispatch({ type: "halt" });
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const statusRef = useRef(s.status);
  statusRef.current = s.status;
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const dir = KEYS[e.key] || KEYS[e.key.toLowerCase?.()];
      const space = e.key === " " || e.code === "Space";
      if (!dir && !space && e.key !== "Enter") return;
      e.preventDefault(); // no page scrolling, no double-activating a focused button
      if (e.type !== "keydown") return;
      if (dir) dispatch({ type: "turn", dir });
      else if (statusRef.current === "over" || statusRef.current === "won") dispatch({ type: "new" });
      else dispatch({ type: "pause" });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  const swipe = useRef(null);
  const onPointerDown = (e) => {
    swipe.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = (e) => {
    if (!swipe.current) return;
    const dx = e.clientX - swipe.current.x;
    const dy = e.clientY - swipe.current.y;
    swipe.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    dispatch({ type: "turn", dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up" });
  };
  const pad = (dir) => (e) => {
    e.preventDefault();
    dispatch({ type: "turn", dir });
  };

  // DEV-only test hook: open a dev page with ?snktest=1.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]snktest=1/.test(window.location.search)) {
    window.__snk = { state: s, dispatch };
  }

  const len = s.snake.length;
  const newBest = s.score > 0 && s.score > s.startBest;

  return (
    <div className="snk">
      <div className="snk-layout">
        <aside className="snk-side">
          <header>
            <h2 className="snk-title">Snake</h2>
            <p className="snk-tag">EAT • GROW • SURVIVE</p>
          </header>
          <div className="snk-scores">
            <div className="snk-score">
              <span>Score</span>
              <strong key={s.score} className={s.score ? "is-bump" : ""}>{s.score}</strong>
            </div>
            <div className="snk-score">
              <span>Best</span>
              <strong>{s.best}</strong>
            </div>
          </div>
          <button
            type="button"
            className="snk-btn snk-btn--ghost"
            onClick={() => dispatch({ type: ended ? "new" : "pause" })}
          >
            {ended ? "Play Again" : playing ? "Pause" : s.status === "paused" ? "Resume" : "Start"}
          </button>
          <p className="snk-hint">Arrows / WASD · Space to pause</p>
        </aside>

        <div
          className={`snk-board${s.status === "ready" ? " is-reset" : ""}`}
          style={{ "--tick": `${tick}ms` }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipe.current = null)}
        >
          {s.food && <div className="snk-food" style={{ "--x": s.food.x, "--y": s.food.y }} />}
          {s.snake.map((p, i) => (
            <div
              key={i}
              className={`snk-seg${i === 0 ? " snk-head" : ""}`}
              style={{ "--x": p.x, "--y": p.y, "--t": len > 1 ? i / (len - 1) : 0, zIndex: len - i }}
            >
              {i === 0 && (
                <i style={{ transform: `rotate(${ROTATE[s.dir]}deg)` }}>
                  <b />
                  <b />
                </i>
              )}
            </div>
          ))}

          {!playing && (
            <div className="snk-overlay" onPointerDown={(e) => e.stopPropagation()}>
              {s.status === "ready" && (
                <>
                  <h3>Snake Classic</h3>
                  <p>Eat the glowing food, grow long and don't crash.</p>
                  <button type="button" className="snk-btn" onClick={() => dispatch({ type: "pause" })}>Start</button>
                  <small>or press any arrow key</small>
                </>
              )}
              {s.status === "paused" && (
                <>
                  <h3>Paused</h3>
                  <button type="button" className="snk-btn" onClick={() => dispatch({ type: "pause" })}>Resume</button>
                  <small>Space to resume</small>
                </>
              )}
              {ended && (
                <>
                  <h3>{s.status === "won" ? "Board Cleared!" : "Game Over"}</h3>
                  <p className="snk-final">{s.score}</p>
                  {newBest ? <p className="snk-badge">New best score!</p> : <p>Best {s.best}</p>}
                  <button type="button" className="snk-btn" onClick={() => dispatch({ type: "new" })}>Play Again</button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="snk-pad" aria-label="Direction controls">
          {["up", "left", "right", "down"].map((dir) => (
            <button key={dir} type="button" className={`snk-pad-${dir}`} aria-label={dir} onPointerDown={pad(dir)}>
              <svg viewBox="0 0 24 24" style={{ transform: `rotate(${ROTATE[dir] + 90}deg)` }}>
                <path d="M12 6l7 10H5z" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
