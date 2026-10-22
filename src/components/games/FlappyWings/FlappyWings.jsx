/**
 * Flappy Wings — tap to flap through endless pipe pairs. One HTML5 canvas
 * (engine.js = state + physics, render.js = drawing) inside the shared
 * <GamePlayer> (registered by name in ../registry.js); Restart / Mute /
 * Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) starts a fresh round; `muted` silences
 * the WebAudio blips. Only the best score is persisted, under
 * `flappy-wings-best`.
 */
import { useEffect, useRef, useState } from "react";
import { H, create, begin, flap, togglePause, step } from "./engine.js";
import { draw } from "./render.js";
import "./FlappyWings.css";

const BEST_KEY = "flappy-wings-best";
const FLAP_KEYS = new Set([" ", "Spacebar", "ArrowUp", "w", "W", "Enter"]);
const PAUSE_KEYS = new Set(["p", "P", "Escape"]);

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* storage blocked */
  }
}

let audio = null;
function tone(freq, dur, vol, slide = 1, type = "triangle", delay = 0) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* audio unavailable */
  }
}
const SOUNDS = {
  flap: () => tone(380, 0.08, 0.035, 1.9),
  score: () => {
    tone(880, 0.09, 0.04, 1, "sine");
    tone(1320, 0.14, 0.04, 1, "sine", 0.07);
  },
  tick: () => tone(660, 0.08, 0.04, 1, "sine"),
  go: () => tone(990, 0.16, 0.05, 1.2, "sine"),
  hit: () => tone(180, 0.22, 0.08, 0.5, "square"),
  land: () => tone(110, 0.12, 0.06, 0.6),
};

export default function FlappyWings({ restartSignal = 0, muted = false }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sRef = useRef(null);
  if (!sRef.current) sRef.current = create(loadBest());
  const [phase, setPhase] = useState("menu");
  const [result, setResult] = useState({ score: 0, best: sRef.current.best, newBest: false });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Actions shared by pointer, keyboard and buttons.
  const act = useRef(null);
  act.current = {
    start() {
      const s = sRef.current;
      if (s.phase === "menu" || s.phase === "over") {
        begin(s);
        setPhase(s.phase);
      }
    },
    tap() {
      const s = sRef.current;
      if (s.phase === "menu") act.current.start();
      else if (s.phase === "paused") act.current.pause();
      else if (s.phase === "over" && s.time - s.overAt > 0.8) act.current.start();
      else if (flap(s) && !mutedRef.current) SOUNDS.flap();
    },
    pause() {
      const s = sRef.current;
      togglePause(s);
      setPhase(s.phase);
    },
  };

  // The single game loop + resize handling; created once, torn down on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const s = sRef.current;
    let scale = 1;
    let dpr = 1;

    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (!width || !height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      scale = height / H;
      s.W = Math.max(300, width / scale);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let shownPhase = s.phase;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const events = step(s, (now - last) / 1000);
      last = now;
      if (!mutedRef.current) for (const e of events) SOUNDS[e]?.();
      if (events.includes("hit")) {
        if (s.best > s.startBest) saveBest(s.best);
        setResult({ score: s.score, best: s.best, newBest: s.score > s.startBest });
      }
      if (s.phase !== shownPhase) {
        shownPhase = s.phase;
        setPhase(s.phase);
      }
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      // centre the world horizontally if the container is narrower than 300 units
      const extra = canvas.width / (dpr * scale) - s.W;
      if (extra < 0) ctx.translate(extra / 2, 0);
      draw(ctx, s);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Keyboard: flap / pause; swallow Space so the page never scrolls and a
  // focused GamePlayer button isn't activated (buttons fire on keyup).
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const isFlap = FLAP_KEYS.has(e.key) || e.code === "Space";
      const isPause = PAUSE_KEYS.has(e.key);
      if (!isFlap && !isPause) return;
      if (e.key !== "Escape") e.preventDefault();
      if (e.type !== "keydown" || e.repeat) return;
      if (isFlap) act.current.tap();
      else if (e.key !== "Escape" || sRef.current.phase === "playing") act.current.pause();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // Auto-pause when the tab is hidden.
  useEffect(() => {
    const onHide = () => {
      const p = sRef.current.phase;
      if (document.hidden && (p === "playing" || p === "countdown")) act.current.pause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const s = sRef.current;
    s.phase = "menu";
    act.current.start();
  }, [restartSignal]);

  const onPointerDown = (e) => {
    if (e.button > 0 || e.target.closest("button")) return;
    e.preventDefault();
    act.current.tap();
  };

  // DEV-only test hook: open a dev page with ?fwtest=1.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]fwtest=1/.test(window.location.search)) {
    window.__fw = { s: sRef.current, act: act.current };
  }

  return (
    <div className="fw" ref={wrapRef} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="fw-canvas" aria-label="Flappy Wings game" />

      {(phase === "playing" || phase === "countdown") && (
        <button type="button" className="fw-pause" aria-label="Pause" onClick={() => act.current.pause()}>
          <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        </button>
      )}

      {phase === "menu" && (
        <div className="fw-overlay">
          <div className="fw-card">
            <h2 className="fw-title">Flappy Wings</h2>
            <p className="fw-tag">TAP • FLY • SURVIVE</p>
            <button type="button" className="fw-btn" onClick={() => act.current.start()}>Play</button>
            <p className="fw-hint">Space, click or tap to flap · P to pause</p>
            {result.best > 0 && <p className="fw-best">Best {result.best}</p>}
          </div>
        </div>
      )}

      {phase === "paused" && (
        <div className="fw-overlay fw-overlay--dim">
          <div className="fw-card">
            <h3 className="fw-head">Paused</h3>
            <button type="button" className="fw-btn" onClick={() => act.current.pause()}>Resume</button>
            <p className="fw-hint">Tap or press Space to resume</p>
          </div>
        </div>
      )}

      {phase === "over" && (
        <div className="fw-overlay fw-overlay--late">
          <div className="fw-card">
            <h3 className="fw-head">Game Over</h3>
            <div className="fw-scores">
              <div><span>Score</span><strong>{result.score}</strong></div>
              <div><span>Best</span><strong>{result.best}</strong></div>
            </div>
            {result.newBest && <p className="fw-badge">New best score!</p>}
            <button type="button" className="fw-btn" onClick={() => act.current.start()}>Play Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
