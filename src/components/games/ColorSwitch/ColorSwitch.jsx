/**
 * Color Switch — tap to bounce a ball up through spinning four-colour rings,
 * passing only through the segment that matches its colour. Rendered on one
 * <canvas> inside the shared <GamePlayer> (registered by name in
 * ../registry.js); Restart / Mute / Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) starts a fresh game; `muted` silences
 * the WebAudio blips. Only the best score is persisted, under
 * `color-switch-best`.
 */
import { useEffect, useRef, useState } from "react";
import { COLORS, segColor, BALL_R, STAR_R, SWITCH_R, RING_T, create, jump, step, togglePause, setViewHeight } from "./engine.js";
import "./ColorSwitch.css";

const BEST_KEY = "color-switch-best";
const VIEW_H = 720; // logical height the stage is scaled to
const MIN_W = 330; // logical width that must always fit (widest ring + margin)
const TITLE = "COLOR\u00a0SWITCH".split("");

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

let actx = null;
function blip(freq, dur, vol, slide = 1, type = "triangle") {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
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
  jump: () => blip(380, 0.08, 0.035, 1.5),
  star: () => blip(880, 0.16, 0.05, 1.5, "sine"),
  switch: () => blip(520, 0.22, 0.05, 2, "sine"),
  pass: () => blip(660, 0.1, 0.03, 1.25, "sine"),
  die: () => blip(240, 0.5, 0.09, 0.35, "sawtooth"),
};

// Parallax backdrop dots, fixed per module.
const DOTS = Array.from({ length: 70 }, (_, i) => ({
  x: ((i * 97) % 100) / 100,
  y: ((i * 61) % 100) / 100,
  r: 0.6 + ((i * 13) % 10) / 8,
  a: 0.15 + ((i * 7) % 10) / 22,
}));

function burst(fx, y, colors, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    fx.push({
      x: 0, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      r: 2 + Math.random() * 3.5,
      life: 0.6 + Math.random() * 0.5, max: 1.1,
      color: colors[i % colors.length],
    });
  }
}

function starPath(ctx, x, y, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

function draw(ctx, g, fx, view) {
  const { w, h, dpr, s } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // backdrop dots drift at 30% of the camera speed
  for (const d of DOTS) {
    const y = (((d.y * h - g.camY * s * 0.3) % h) + h) % h;
    ctx.fillStyle = `rgba(190,200,255,${d.a})`;
    ctx.fillRect(d.x * w, y, d.r, d.r);
  }

  const shake = view.shake > 0 ? view.shake * 7 : 0;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 + (Math.random() - 0.5) * shake), dpr * (-g.camY * s + (Math.random() - 0.5) * shake));
  const t = g.time;
  const top = g.camY - 160;
  const bottom = g.camY + g.viewH + 160;

  ctx.lineCap = "butt";
  for (const o of g.obstacles) {
    if (o.y < top || o.y > bottom) continue;
    for (const ring of o.rings) {
      for (let k = 0; k < 4; k++) {
        const a0 = ring.rot + (k * Math.PI) / 2 + 0.015;
        const a1 = a0 + Math.PI / 2 - 0.03;
        ctx.strokeStyle = COLORS[segColor(ring, k)];
        ctx.globalAlpha = 0.18 + o.flash * 0.3;
        ctx.lineWidth = RING_T + 12 + o.flash * 14;
        ctx.beginPath();
        ctx.arc(0, o.y, ring.r, a0, a1);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = RING_T;
        ctx.beginPath();
        ctx.arc(0, o.y, ring.r, a0, a1);
        ctx.stroke();
      }
    }
    if (o.star) {
      const p = 1 + Math.sin(t * 5 + o.n) * 0.08;
      ctx.save();
      ctx.translate(0, o.y);
      ctx.rotate(Math.sin(t * 2 + o.n) * 0.2);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath();
      ctx.arc(0, 0, STAR_R * 1.7 * p, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      starPath(ctx, 0, 0, STAR_R * p, STAR_R * 0.45 * p);
      ctx.fill();
      ctx.restore();
    }
    if (o.switcher && o.switchY > top && o.switchY < bottom) {
      const rot = t * 2.5;
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = COLORS[k];
        ctx.beginPath();
        ctx.moveTo(0, o.switchY);
        ctx.arc(0, o.switchY, SWITCH_R, rot + (k * Math.PI) / 2, rot + ((k + 1) * Math.PI) / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, o.switchY, SWITCH_R + 4 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // particles
  for (const p of fx) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ball: soft halo + shaded core (hidden once it has shattered)
  if (g.status !== "over") {
    const b = g.ball;
    const c = COLORS[b.color];
    const bob = g.status === "ready" ? Math.sin(t * 3) * 4 : 0;
    const y = b.y + bob;
    const halo = ctx.createRadialGradient(0, y, BALL_R * 0.6, 0, y, BALL_R * 3);
    halo.addColorStop(0, c + "88");
    halo.addColorStop(1, c + "00");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, y, BALL_R * 3, 0, Math.PI * 2);
    ctx.fill();
    const core = ctx.createRadialGradient(-BALL_R * 0.35, y - BALL_R * 0.35, 1, 0, y, BALL_R);
    core.addColorStop(0, "#ffffff");
    core.addColorStop(0.35, c);
    core.addColorStop(1, c);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function ColorSwitch({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = create(loadBest());
  const fxRef = useRef([]);
  const viewRef = useRef({ w: 1, h: 1, dpr: 1, s: 1, shake: 0 });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // UI mirror of the engine state; synced from the loop only when it changes.
  const [ui, setUi] = useState(() => ({ status: "ready", score: 0, best: gameRef.current.best, startBest: gameRef.current.best }));
  const sync = () => {
    const g = gameRef.current;
    setUi((u) =>
      u.status === g.status && u.score === g.score && u.best === g.best && u.startBest === g.startBest
        ? u
        : { status: g.status, score: g.score, best: g.best, startBest: g.startBest },
    );
  };

  const play = (type) => !mutedRef.current && SOUNDS[type]?.();

  const restart = () => {
    const prev = gameRef.current;
    const g = create(prev.best);
    setViewHeight(g, prev.viewH);
    gameRef.current = g;
    fxRef.current = [];
    viewRef.current.shake = 0;
    sync();
  };

  const tap = () => {
    const g = gameRef.current;
    if (g.status === "over") return;
    if (jump(g)) {
      play("jump");
      fxRef.current.push({ x: 0, y: g.ball.y + BALL_R, vx: 0, vy: 60, r: 5, life: 0.25, max: 0.5, color: COLORS[g.ball.color] });
      sync();
    }
  };

  const pause = () => {
    togglePause(gameRef.current);
    sync();
  };

  // Advance + render. One rAF loop for the component's lifetime.
  const advance = (dt) => {
    const g = gameRef.current;
    const fx = fxRef.current;
    for (const e of step(g, dt)) {
      play(e.type);
      if (e.type === "star") burst(fx, e.y, ["#ffffff", "#fff3b0"], 14, 180);
      else if (e.type === "switch") burst(fx, e.y, COLORS, 22, 220);
      else if (e.type === "pass") burst(fx, e.y, COLORS, 10, 120);
      else if (e.type === "die") {
        burst(fx, e.y, [COLORS[e.color], "#ffffff", COLORS[e.color]], 46, 420);
        viewRef.current.shake = 1;
      }
    }
    if (g.status !== "paused") {
      for (const p of fx) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 380 * dt;
        p.vx *= 1 - dt * 1.5;
        p.life -= dt;
      }
      fxRef.current = fx.filter((p) => p.life > 0);
      viewRef.current.shake = Math.max(0, viewRef.current.shake - dt * 3);
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx, g, fxRef.current, viewRef.current);
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

  // Fit the canvas to the stage at device resolution.
  useEffect(() => {
    const el = stageRef.current;
    const fit = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = canvasRef.current;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const s = Math.min(h / VIEW_H, w / MIN_W);
      Object.assign(viewRef.current, { w, h, dpr, s });
      setViewHeight(gameRef.current, h / s);
      advanceRef.current(0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BEST_KEY, String(ui.best));
    } catch {
      /* storage blocked */
    }
  }, [ui.best]);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    restart();
  }, [restartSignal]);

  // Pause when the tab is hidden so the ball doesn't fall off-screen.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && gameRef.current.status === "playing") pause();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const handlers = useRef({});
  handlers.current = { tap, pause, restart };
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      const isJump = k === " " || k === "arrowup" || k === "w";
      const isPause = k === "p" || k === "escape";
      if (!isJump && !isPause && k !== "enter") return;
      if (k !== "escape") e.preventDefault(); // no page scrolling, no re-clicking a focused button
      if (e.type !== "keydown" || e.repeat) return;
      const g = gameRef.current;
      const h = handlers.current;
      if (g.status === "over") {
        // Short grace period so a frantic jump doesn't skip the Game Over screen.
        if ((isJump || k === "enter") && g.time - g.overAt > 0.6) h.restart();
      } else if (isPause) {
        if (g.status !== "ready") h.pause();
      } else if (g.status === "paused") {
        h.pause();
      } else if (isJump) {
        h.tap();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // DEV-only test hook: open a dev page with ?cstest=1.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]cstest=1/.test(window.location.search)) {
    window.__cs = { game: () => gameRef.current, tap, pause, restart, advance: (frames = 1, dt = 1 / 60) => { for (let i = 0; i < frames; i++) advanceRef.current(dt); } };
  }

  const { status, score, best, startBest } = ui;
  const newBest = score > 0 && score > startBest;
  const stop = (e) => e.stopPropagation();

  return (
    <div className="csw">
      <div
        ref={stageRef}
        className="csw-stage"
        onPointerDown={(e) => {
          if (e.button === 0 || e.pointerType !== "mouse") {
            e.preventDefault();
            tap();
          }
        }}
      >
        <canvas ref={canvasRef} className="csw-canvas" />

        <div className="csw-hud">
          <div className="csw-hud-left">
            <div className="csw-panel">
              <span>Score</span>
              <strong key={score} className={score ? "is-bump" : ""}>{score}</strong>
            </div>
            {(status === "playing" || status === "paused") && (
              <button type="button" className="csw-pause" onPointerDown={stop} onClick={pause} aria-label={status === "paused" ? "Resume" : "Pause"}>
                {status === "paused" ? (
                  <svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
                )}
              </button>
            )}
          </div>
          <div className="csw-panel csw-panel--best">
            <span>Best</span>
            <strong>{best}</strong>
          </div>
        </div>

        {status === "ready" && (
          <div className="csw-overlay csw-overlay--dim csw-overlay--start">
            <h2 className="csw-title" aria-label="Color Switch">
              {TITLE.map((ch, i) => (
                <span key={i} style={{ color: COLORS[i % 4], "--i": i }}>{ch}</span>
              ))}
            </h2>
            <p className="csw-tag">JUMP • MATCH • SURVIVE</p>
            <div className="csw-tap">Tap to start</div>
            <small>Space · Click · Tap to jump &nbsp;|&nbsp; P to pause</small>
          </div>
        )}

        {status === "paused" && (
          <div className="csw-overlay csw-overlay--dim" onPointerDown={stop}>
            <h3>Paused</h3>
            <button type="button" className="csw-btn" onClick={pause}>Resume</button>
            <small>Space or P to resume</small>
          </div>
        )}

        {status === "over" && (
          <div className="csw-overlay csw-overlay--dim csw-overlay--over" onPointerDown={stop}>
            <h3>Game Over</h3>
            <div className="csw-final">
              <div><span>Score</span><strong>{score}</strong></div>
              <div><span>Best</span><strong>{best}</strong></div>
            </div>
            {newBest && <p className="csw-badge">★ New best score! ★</p>}
            <button type="button" className="csw-btn" onClick={restart}>Play Again</button>
            <small>Enter or Space to play again</small>
          </div>
        )}
      </div>
    </div>
  );
}
