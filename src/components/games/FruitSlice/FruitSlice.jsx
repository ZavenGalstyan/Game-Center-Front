/**
 * Fruit Slice — swipe to slice flying fruit, dodge bombs. One HTML5 canvas
 * (engine.js = state + physics + slicing, render.js = drawing) inside the
 * shared <GamePlayer> (registered by name in ../registry.js); Restart / Mute /
 * Fullscreen / Like stay there.
 *
 * Classic: 3 missed fruits or one bomb ends the run. Arcade: 60 s, combos,
 * bonus/time fruit, bombs cost points. `restartSignal` restarts the current
 * mode; `muted` silences the WebAudio effects. Best score per mode persists
 * under `fruit-slice-best`.
 */
import { useEffect, useRef, useState } from "react";
import { H, create, step, bladeDown, bladeTo, bladeUp, togglePause } from "./engine.js";
import { draw } from "./render.js";
import "./FruitSlice.css";

const BEST_KEY = "fruit-slice-best";
const MODES = {
  classic: { title: "Classic", desc: "Miss 3 fruits or hit a bomb and it's over." },
  arcade: { title: "Arcade", desc: "60 seconds. Combos, bonus and +5s fruit. Bombs cost 10." },
};

function loadBest() {
  try {
    return { classic: 0, arcade: 0, ...JSON.parse(localStorage.getItem(BEST_KEY)) };
  } catch {
    return { classic: 0, arcade: 0 };
  }
}

/** Tiny WebAudio kit; one context per mounted game, closed on unmount. */
function createAudio() {
  let ctx = null;
  let noise = null;
  const ensure = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const env = (node, vol, dur, t) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g).connect(ctx.destination);
  };
  const hiss = (dur, vol, freq, q = 1) => {
    const t = ensure().currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    f.Q.value = q;
    src.connect(f);
    env(f, vol, dur, t);
    src.start(t);
    src.stop(t + dur);
  };
  const tone = (freq, dur, vol, type = "sine", delay = 0, slide = 1) => {
    const t = ensure().currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    env(o, vol, dur, t);
    o.start(t);
    o.stop(t + dur);
  };
  const sfx = {
    slice: () => (hiss(0.12, 0.12, 2400, 0.8), tone(180, 0.09, 0.05, "sine", 0.01, 0.6)),
    bomb: () => (hiss(0.6, 0.35, 600, 0.5), tone(90, 0.5, 0.18, "sawtooth", 0, 0.4)),
    combo: () => [660, 880, 1100].forEach((f, i) => tone(f, 0.16, 0.05, "triangle", i * 0.06)),
    time: () => (tone(1320, 0.18, 0.05), tone(1760, 0.2, 0.04, "sine", 0.08)),
    miss: () => tone(160, 0.25, 0.07, "triangle", 0, 0.6),
    over: () => [523, 392, 262].forEach((f, i) => tone(f, 0.3, 0.05, "triangle", i * 0.14)),
  };
  return {
    play(name) {
      try {
        sfx[name]?.();
      } catch {
        /* audio unavailable */
      }
    },
    close() {
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}

export default function FruitSlice({ restartSignal = 0, muted = false }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sRef = useRef(null);
  const bestRef = useRef(null);
  if (!bestRef.current) bestRef.current = loadBest();
  const [screen, setScreen] = useState("menu"); // menu | playing | paused | over
  const [result, setResult] = useState(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioRef = useRef(null);
  const sound = (name) => !mutedRef.current && audioRef.current?.play(name);

  const view = useRef({ scale: 1, W: 1280 });

  const start = (mode) => {
    const s = create(mode, bestRef.current[mode], view.current.W);
    sRef.current = s;
    setResult(null);
    setScreen("playing");
  };
  const pause = () => {
    const s = sRef.current;
    if (!s || (s.phase !== "playing" && s.phase !== "paused")) return;
    togglePause(s);
    setScreen(s.phase);
  };

  // The single loop + resize + audio lifetime; created once, torn down on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const audio = createAudio();
    audioRef.current = audio;
    let dpr = 1;
    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (!width || !height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      view.current = { scale: height / H, W: Math.max(360, width / (height / H)), left: 0 }; // narrow screens: centre a 360-wide world
      view.current.left = (width / view.current.scale - view.current.W) / 2;
      if (sRef.current) sRef.current.W = view.current.W;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Menu backdrop: an idle demo round with no bombs, nothing persisted.
    const idle = Object.assign(create("arcade", 0, view.current.W), { demo: true });
    let raf = 0;
    let last = performance.now();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      last = now;
      const s = sRef.current;
      if (s) {
        const events = step(s, dt);
        if (!mutedRef.current) for (const e of events) audio.play(e);
        // report once — a bomb can end the round from pointer input, between steps
        if (s.phase === "over" && !s.reported) {
          s.reported = true;
          if (s.best > bestRef.current[s.mode]) {
            bestRef.current = { ...bestRef.current, [s.mode]: s.best };
            try {
              localStorage.setItem(BEST_KEY, JSON.stringify(bestRef.current));
            } catch {
              /* storage blocked */
            }
          }
          setResult({ mode: s.mode, score: s.score, best: s.best, newBest: s.score > s.startBest, reason: s.reason });
          setScreen("over");
        }
      } else {
        idle.W = view.current.W;
        idle.items = idle.items.filter((it) => it.kind === "fruit");
        idle.timeLeft = 60;
        step(idle, dt);
      }
      const { scale, left } = view.current;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * scale * left, 0);
      draw(ctx, s || idle);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      audio.close();
      audioRef.current = null;
    };
  }, []);

  // Blade input (mouse + touch through pointer events).
  const toWorld = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    const { scale, left } = view.current;
    return [(e.clientX - r.left) / scale - left, (e.clientY - r.top) / scale];
  };
  const onDown = (e) => {
    const s = sRef.current;
    if (!s || s.phase !== "playing" || e.button > 0 || e.target.closest("button")) return;
    e.preventDefault();
    bladeDown(s, ...toWorld(e));
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  };
  const onMove = (e) => {
    const s = sRef.current;
    if (!s?.blade) return;
    const pts = e.nativeEvent.getCoalescedEvents?.() || [];
    for (const p of pts.length ? pts : [e]) for (const ev of bladeTo(s, ...toWorld(p))) sound(ev);
  };
  const onUp = () => sRef.current && bladeUp(sRef.current);

  // Keyboard: P / Esc pause; Enter replays from the game-over screen.
  const keys = useRef(null);
  keys.current = { pause, screen, result, start };
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "p" || k === "escape") {
        if (k === "p") e.preventDefault();
        keys.current.pause();
      } else if (k === " " && keys.current.screen === "playing") e.preventDefault(); // no page scroll mid-swipe
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onHide = () => document.hidden && sRef.current?.phase === "playing" && pause();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (sRef.current) start(sRef.current.mode);
  }, [restartSignal]);

  // DEV-only test hook: open a dev page with ?fstest=1.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]fstest=1/.test(window.location.search)) {
    window.__fs = { get s() { return sRef.current; }, start, pause, view };
  }

  const best = bestRef.current;
  return (
    <div
      className="fs"
      ref={wrapRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="fs-canvas" aria-label="Fruit Slice game" />

      {screen === "playing" && (
        <button type="button" className="fs-pause" aria-label="Pause" onClick={pause}>
          <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        </button>
      )}

      {screen === "menu" && (
        <div className="fs-overlay">
          <div className="fs-card">
            <h2 className="fs-title">Fruit <span>Slice</span></h2>
            <p className="fs-tag">SLICE • COMBO • SURVIVE</p>
            <div className="fs-modes">
              {Object.entries(MODES).map(([id, m]) => (
                <button type="button" key={id} className={`fs-mode fs-mode--${id}`} onClick={() => start(id)}>
                  <strong>{m.title}</strong>
                  <span>{m.desc}</span>
                  <em>Best {best[id]}</em>
                </button>
              ))}
            </div>
            <p className="fs-hint">Drag across fruit to slice · avoid bombs · P to pause</p>
          </div>
        </div>
      )}

      {screen === "paused" && (
        <div className="fs-overlay fs-overlay--dim">
          <div className="fs-card">
            <h3 className="fs-head">Paused</h3>
            <button type="button" className="fs-btn" onClick={pause}>Resume</button>
            <div className="fs-row">
              <button type="button" className="fs-btn fs-btn--ghost" onClick={() => start(sRef.current.mode)}>Restart</button>
              <button type="button" className="fs-btn fs-btn--ghost" onClick={() => (sRef.current = null, setScreen("menu"))}>Modes</button>
            </div>
          </div>
        </div>
      )}

      {screen === "over" && result && (
        <div className="fs-overlay fs-overlay--late">
          <div className="fs-card">
            <h3 className="fs-head">{result.reason === "time" ? "Time's Up!" : result.reason === "bomb" ? "Boom!" : "Game Over"}</h3>
            <p className="fs-sub">{MODES[result.mode].title} mode{result.reason === "misses" ? " · 3 fruits missed" : ""}</p>
            <div className="fs-scores">
              <div><span>Score</span><strong>{result.score}</strong></div>
              <div><span>Best</span><strong>{result.best}</strong></div>
            </div>
            {result.newBest && <p className="fs-badge">New best score!</p>}
            <div className="fs-row">
              <button type="button" className="fs-btn" onClick={() => start(result.mode)}>Play Again</button>
              <button type="button" className="fs-btn fs-btn--ghost" onClick={() => (sRef.current = null, setScreen("menu"))}>Modes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
