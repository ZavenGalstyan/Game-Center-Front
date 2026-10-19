/**
 * Air Hockey — mouse/touch the bottom paddle against an AI on a neon table,
 * first to 7 goals. Physics and AI live in ./engine.js; this component owns
 * the canvas, input, sound and the DOM HUD/screens. Rendered inside the shared
 * <GamePlayer> (registered by name in ../registry.js); Restart / Mute /
 * Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) starts a fresh match; `muted` silences
 * the WebAudio blips. Win streaks and the chosen difficulty are persisted
 * under `air-hockey-stats`.
 */
import { useEffect, useRef, useState } from "react";
import { W, H, PUCK_R, PAD_R, GOAL_W, CORNER_R, WIN_SCORE, create, start, step, togglePause, setTarget } from "./engine.js";
import "./AirHockey.css";

const STATS_KEY = "air-hockey-stats";
const RIM = 16; // table rail thickness, in table units
const GLOW = 26; // room around the rail for its glow
const WIDE = 1.5; // stage aspect at which the HUD moves beside the table (matches the CSS)
const CYAN = "#22e6ff";
const RED = "#ff3b5c";
const LEVELS = ["easy", "medium", "hard"];

function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY)) || {};
    return { streak: s.streak | 0, best: s.best | 0, difficulty: LEVELS.includes(s.difficulty) ? s.difficulty : "medium" };
  } catch {
    return { streak: 0, best: 0, difficulty: "medium" };
  }
}

let actx = null;
function blip(freq, dur, vol, slide = 1, type = "triangle", delay = 0) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + delay;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* audio unavailable */
  }
}
const SOUNDS = {
  hit: (v) => blip(260 + Math.min(v, 1500) * 0.3, 0.07, 0.03 + Math.min(v, 1500) / 30000, 0.6, "square"),
  wall: (v) => blip(170, 0.05, 0.012 + Math.min(v, 1500) / 70000, 0.8, "triangle"),
  goalYou: () => [523, 659, 784].forEach((f, i) => blip(f, 0.2, 0.05, 1.01, "sine", i * 0.09)),
  goalCpu: () => [392, 311, 247].forEach((f, i) => blip(f, 0.22, 0.05, 0.99, "sawtooth", i * 0.1)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.32, 0.06, 1.01, "sine", i * 0.12)),
  lose: () => blip(300, 0.7, 0.07, 0.4, "sawtooth"),
};

function burst(fx, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.5 + Math.random() * 2.5, life: 0.35 + Math.random() * 0.45, max: 0.8, color });
  }
}

function roundedTable(ctx, inset) {
  const r = CORNER_R + inset;
  const x0 = -inset;
  const y0 = -inset;
  const x1 = W + inset;
  const y1 = H + inset;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
}

/** Static table art (surface, markings, rails, goals) drawn once per resize. */
function paintTable(view) {
  const { s, dpr } = view;
  const k = s * dpr;
  const c = document.createElement("canvas");
  c.width = Math.ceil((W + 2 * (RIM + GLOW)) * k);
  c.height = Math.ceil((H + 2 * (RIM + GLOW)) * k);
  const ctx = c.getContext("2d");
  ctx.setTransform(k, 0, 0, k, (RIM + GLOW) * k, (RIM + GLOW) * k);

  // rail: neon gradient from the CPU's red end to the player's cyan end
  const rail = ctx.createLinearGradient(0, 0, 0, H);
  rail.addColorStop(0, RED);
  rail.addColorStop(0.5, "#a46bff");
  rail.addColorStop(1, CYAN);
  ctx.save();
  roundedTable(ctx, RIM);
  ctx.fillStyle = "#050a1c";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 30 * k;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = rail;
  ctx.lineWidth = 4;
  ctx.shadowColor = "#7a8cff";
  ctx.shadowBlur = 18 * k;
  roundedTable(ctx, RIM - 3);
  ctx.stroke();
  ctx.restore();

  // playing surface
  roundedTable(ctx, 0);
  const surf = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.62);
  surf.addColorStop(0, "#13265a");
  surf.addColorStop(1, "#0a1636");
  ctx.fillStyle = surf;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // air holes
  ctx.fillStyle = "rgba(150,180,255,0.07)";
  for (let y = 12; y < H; y += 22) for (let x = 12 + ((y / 22) % 2) * 11; x < W; x += 22) ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
  // markings
  ctx.lineWidth = 3;
  ctx.shadowBlur = 12 * k;
  const line = (color, draw) => {
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.beginPath();
    draw();
    ctx.stroke();
  };
  line("rgba(170,140,255,0.75)", () => {
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
  });
  line("rgba(170,140,255,0.55)", () => ctx.arc(W / 2, H / 2, 62, 0, Math.PI * 2));
  line("rgba(255,59,92,0.55)", () => ctx.arc(W / 2, 0, GOAL_W * 0.62, 0, Math.PI));
  line("rgba(34,230,255,0.55)", () => ctx.arc(W / 2, H, GOAL_W * 0.62, Math.PI, Math.PI * 2));
  ctx.fillStyle = "rgba(200,190,255,0.8)";
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // goal slots cut through the rail
  for (const [y, color] of [[-RIM, RED], [H, CYAN]]) {
    ctx.save();
    ctx.fillStyle = "#02040c";
    ctx.fillRect(W / 2 - GOAL_W / 2, y, GOAL_W, RIM);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16 * k;
    ctx.fillRect(W / 2 - GOAL_W / 2 - 4, y, 5, RIM);
    ctx.fillRect(W / 2 + GOAL_W / 2 - 1, y, 5, RIM);
    ctx.globalAlpha = 0.85;
    ctx.fillRect(W / 2 - GOAL_W / 2, y === H ? H + RIM - 3 : -RIM, GOAL_W, 3);
    ctx.restore();
  }
  return c;
}

function drawPaddle(ctx, p, color, k) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 22 * k;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PAD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const body = ctx.createRadialGradient(p.x - PAD_R * 0.35, p.y - PAD_R * 0.4, 2, p.x, p.y, PAD_R);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(0.25, color);
  body.addColorStop(1, "#0b1030");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PAD_R - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, PAD_R * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  const knob = ctx.createRadialGradient(p.x - 4, p.y - 5, 1, p.x, p.y, PAD_R * 0.42);
  knob.addColorStop(0, "#ffffff");
  knob.addColorStop(1, color);
  ctx.fillStyle = knob;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PAD_R * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

function draw(ctx, g, fx, view) {
  const { w, h, dpr, s, ox, oy, table, trail } = view;
  const k = s * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w * dpr, h * dpr);
  if (table) ctx.drawImage(table, Math.round((ox - (RIM + GLOW) * s) * dpr), Math.round((oy - (RIM + GLOW) * s) * dpr));
  ctx.setTransform(k, 0, 0, k, ox * dpr, oy * dpr);

  // goal flash in the net that was just scored on
  if (g.status === "goal" || (g.status === "over" && g.lastScorer)) {
    const top = g.lastScorer === "player";
    const color = top ? CYAN : RED;
    const pulse = g.status === "goal" ? 0.55 + 0.45 * Math.sin(g.time * 18) : 0.6;
    const y = top ? 0 : H;
    const glow = ctx.createRadialGradient(W / 2, y, 4, W / 2, y, GOAL_W * 1.1);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.55 * pulse;
    ctx.fillStyle = glow;
    ctx.fillRect(0, top ? 0 : H - GOAL_W * 1.1, W, GOAL_W * 1.1);
    ctx.globalAlpha = 1;
  }

  // puck trail (newest last)
  const puckVisible = g.status !== "goal" && g.status !== "over";
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const a = (i + 1) / trail.length;
    ctx.globalAlpha = a * 0.22;
    ctx.fillStyle = "#cfe9ff";
    ctx.beginPath();
    ctx.arc(t.x, t.y, PUCK_R * (0.45 + 0.5 * a), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const p of fx) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawPaddle(ctx, g.ai, RED, k);
  drawPaddle(ctx, g.player, CYAN, k);

  if (puckVisible) {
    const { x, y } = g.puck;
    ctx.save();
    ctx.shadowColor = "rgba(210,235,255,0.95)";
    ctx.shadowBlur = 18 * k;
    ctx.fillStyle = "#f4f8ff";
    ctx.beginPath();
    ctx.arc(x, y, PUCK_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(120,150,200,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, PUCK_R * 0.62, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export default function AirHockey({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const statsRef = useRef(null);
  if (!statsRef.current) statsRef.current = loadStats();
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = create(statsRef.current.difficulty);
  const fxRef = useRef([]);
  const viewRef = useRef({ w: 1, h: 1, dpr: 1, s: 1, ox: 0, oy: 0, table: null, trail: [] });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const [stats, setStats] = useState(statsRef.current);
  const [newBest, setNewBest] = useState(false);
  // UI mirror of the engine state; synced from the loop only when it changes.
  const snap = (g) => ({ status: g.status, you: g.score.player, cpu: g.score.ai, winner: g.winner, scorer: g.lastScorer, difficulty: g.difficulty });
  const [ui, setUi] = useState(() => snap(gameRef.current));
  const sync = () => {
    const n = snap(gameRef.current);
    setUi((u) => (Object.keys(n).every((key) => u[key] === n[key]) ? u : n));
  };

  const play = (type, v) => !mutedRef.current && SOUNDS[type]?.(v);

  const saveStats = (next) => {
    statsRef.current = next;
    setStats(next);
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  };

  const begin = (difficulty = gameRef.current.difficulty) => {
    start(gameRef.current, difficulty);
    if (difficulty !== statsRef.current.difficulty) saveStats({ ...statsRef.current, difficulty });
    fxRef.current = [];
    viewRef.current.trail = [];
    setNewBest(false);
    sync();
  };

  const chooseDifficulty = (difficulty) => {
    gameRef.current.difficulty = difficulty;
    saveStats({ ...statsRef.current, difficulty });
    sync();
  };

  const pause = () => {
    togglePause(gameRef.current);
    sync();
  };

  const finish = (won) => {
    const s = statsRef.current;
    const streak = won ? s.streak + 1 : 0;
    const best = Math.max(s.best, streak);
    setNewBest(won && streak > s.best);
    saveStats({ ...s, streak, best });
  };

  const advance = (dt) => {
    const g = gameRef.current;
    const fx = fxRef.current;
    const view = viewRef.current;
    for (const e of step(g, dt)) {
      if (e.type === "hit") {
        play("hit", e.v);
        burst(fx, e.x, e.y, e.by === "player" ? CYAN : RED, 6 + Math.min(10, e.v / 120), 90 + e.v * 0.15);
      } else if (e.type === "wall") {
        if (e.v > 120) play("wall", e.v);
      } else if (e.type === "goal") {
        play(e.by === "player" ? "goalYou" : "goalCpu");
        const color = e.by === "player" ? CYAN : RED;
        burst(fx, e.x, e.y, color, 40, 380);
        burst(fx, e.x, e.y, "#ffffff", 14, 260);
      } else if (e.type === "win" || e.type === "lose") {
        play(e.type);
        finish(e.type === "win");
      }
    }
    if (g.status !== "paused") {
      for (const p of fx) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
        p.life -= dt;
      }
      fxRef.current = fx.filter((p) => p.life > 0);
      if (g.status === "playing") {
        view.trail.push({ x: g.puck.x, y: g.puck.y });
        if (view.trail.length > 9) view.trail.shift();
      } else if (g.status !== "ready") view.trail.length = 0;
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx, g, fxRef.current, view);
    sync();
  };
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      advanceRef.current(Math.min(0.05, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fit the canvas to the stage at device resolution and place the table.
  useEffect(() => {
    const el = stageRef.current;
    const fit = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = canvasRef.current;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const top = w / h >= WIDE ? 0 : h * 0.13; // narrow stages keep a scoreboard band on top
      const pad = Math.min(w, h) * 0.025;
      const availW = w - 2 * pad;
      const availH = h - top - 2 * pad;
      const s = Math.max(0.05, Math.min(availW / (W + 2 * RIM), availH / (H + 2 * RIM)));
      const view = viewRef.current;
      Object.assign(view, { w, h, dpr, s, ox: (w - W * s) / 2, oy: top + pad + (availH - H * s) / 2 });
      view.table = paintTable(view);
      advanceRef.current(0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (gameRef.current.status !== "ready") begin();
  }, [restartSignal]);

  // Pause when the tab is hidden so the AI doesn't score on an empty chair.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && gameRef.current.status === "playing") pause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const handlers = useRef({});
  handlers.current = { begin, pause };
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      const isGo = key === " " || key === "enter";
      const isPause = key === "p" || key === "escape";
      if (!isGo && !isPause) return;
      const g = gameRef.current;
      if (isGo) e.preventDefault(); // no page scrolling, no re-clicking a focused button
      if (e.repeat) return;
      if (g.status === "ready" || g.status === "over") {
        if (isGo) handlers.current.begin();
      } else if (isPause || (isGo && g.status === "paused")) {
        if (g.status !== "goal") handlers.current.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Pointer → table units, so the paddle tracks correctly however the canvas is scaled. */
  const aim = (e) => {
    const g = gameRef.current;
    if (g.status !== "playing" && g.status !== "goal") return;
    const rect = stageRef.current.getBoundingClientRect();
    const v = viewRef.current;
    const lift = e.pointerType === "mouse" ? 0 : PAD_R * 0.7; // keep the paddle visible above a fingertip
    setTarget(g, (e.clientX - rect.left - v.ox) / v.s, (e.clientY - rect.top - v.oy) / v.s - lift);
  };

  // DEV-only test hook: open a dev page with ?ahtest=1.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]ahtest=1/.test(window.location.search)) {
    window.__ah = { game: () => gameRef.current, view: viewRef.current, begin, pause, chooseDifficulty, stats: () => statsRef.current, advance: (frames = 1, dt = 1 / 60) => { for (let i = 0; i < frames; i++) advanceRef.current(dt); } };
  }

  const { status, you, cpu, winner, scorer, difficulty } = ui;
  const live = status === "playing" || status === "paused" || status === "goal";
  const stop = (e) => e.stopPropagation();
  const levelPicker = (
    <div className="ahk-levels" role="radiogroup" aria-label="AI difficulty">
      {LEVELS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={difficulty === l} className={`ahk-level${difficulty === l ? " is-on" : ""}`} onClick={() => chooseDifficulty(l)}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="ahk">
      <div
        ref={stageRef}
        className={`ahk-stage${status === "playing" ? " is-playing" : ""}`}
        onPointerDown={(e) => {
          if (!live) return;
          if (e.pointerType !== "mouse") e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          aim(e);
        }}
        onPointerMove={aim}
      >
        <canvas ref={canvasRef} className="ahk-canvas" />

        <div className="ahk-hud">
          <div className="ahk-board" aria-label={`CPU ${cpu}, You ${you}`}>
            <div className="ahk-team ahk-team--cpu">
              <span>CPU</span>
              <strong key={`c${cpu}`} className={cpu ? "is-bump" : ""}>{cpu}</strong>
            </div>
            <div className="ahk-board-mid">
              <em>First to {WIN_SCORE}</em>
              <small>{difficulty}</small>
            </div>
            <div className="ahk-team ahk-team--you">
              <span>You</span>
              <strong key={`y${you}`} className={you ? "is-bump" : ""}>{you}</strong>
            </div>
          </div>
          <div className="ahk-hud-right">
            <div className="ahk-streak" title="Winning streak / best streak">
              <span>Streak</span>
              <strong>
                {stats.streak}
                <i> / best {stats.best}</i>
              </strong>
            </div>
            {live && (
              <button type="button" className="ahk-pause" onPointerDown={stop} onClick={pause} disabled={status === "goal"} aria-label={status === "paused" ? "Resume" : "Pause"}>
                {status === "paused" ? <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg> : <svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>}
              </button>
            )}
          </div>
        </div>

        {status === "goal" && (
          <div key={`${you}-${cpu}`} className={`ahk-goal ahk-goal--${scorer === "player" ? "you" : "cpu"}`} aria-live="polite">
            <strong>GOAL!</strong>
            <span>{scorer === "player" ? "You score" : "CPU scores"}</span>
          </div>
        )}

        {status === "ready" && (
          <div className="ahk-overlay" onPointerDown={stop}>
            <h2 className="ahk-title">
              <span className="is-cyan">AIR</span> <span className="is-red">HOCKEY</span>
            </h2>
            <p className="ahk-tag">STRIKE • DEFEND • SCORE</p>
            {levelPicker}
            <button type="button" className="ahk-btn" onClick={() => begin()}>Start Match</button>
            <small>Move the mouse or drag to control the cyan paddle · P to pause</small>
            {stats.best > 0 && <small className="ahk-note">Best winning streak: {stats.best}</small>}
          </div>
        )}

        {status === "paused" && (
          <div className="ahk-overlay" onPointerDown={stop}>
            <h3>Paused</h3>
            <p className="ahk-final-score"><span className="is-red">{cpu}</span> : <span className="is-cyan">{you}</span></p>
            <button type="button" className="ahk-btn" onClick={pause}>Resume</button>
            <small>Space or P to resume</small>
          </div>
        )}

        {status === "over" && (
          <div className={`ahk-overlay ahk-overlay--over${winner === "player" ? " is-win" : ""}`} onPointerDown={stop}>
            <h3>{winner === "player" ? "Victory!" : "Defeat"}</h3>
            <p className="ahk-final-score"><span className="is-red">{cpu}</span> : <span className="is-cyan">{you}</span></p>
            <p className="ahk-streak-line">
              {winner === "player" ? `Winning streak: ${stats.streak}` : "Streak reset"} · Best: {stats.best}
            </p>
            {newBest && <p className="ahk-badge">★ New best streak! ★</p>}
            {levelPicker}
            <button type="button" className="ahk-btn" onClick={() => begin()}>Play Again</button>
            <small>Enter or Space to play again</small>
          </div>
        )}
      </div>
    </div>
  );
}
