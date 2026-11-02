/**
 * Wobbly Warriors: Arena Clash — a two-blob physics brawler on one HTML5
 * canvas (engine.js = state + fixed-step physics, render.js = drawing) inside
 * the shared <GamePlayer> (registered by name in ../registry.js); Restart /
 * Mute / Fullscreen / Like stay there.
 *
 * Both players share one keyboard: P1 A/D/W/F, P2 ←/→/↑/L. Keys are tracked
 * by `e.code` in a held-set; jump/punch presses are latched so a tap shorter
 * than a frame still counts. In "ai" mode P2's keys are ignored and the
 * engine's bot drives fighter 2. Nothing is persisted.
 */
import { useEffect, useRef, useState } from "react";
import { W, H, ARENAS, FIGHTERS, WINS_NEEDED, create, step, rematch, togglePause } from "./engine.js";
import { draw, drawArenaPreview } from "./render.js";
import "./WobblyWarriors.css";

const KEYMAP = {
  KeyA: [0, "left"],
  KeyD: [0, "right"],
  KeyW: [0, "jump"],
  KeyF: [0, "punch"],
  ArrowLeft: [1, "left"],
  ArrowRight: [1, "right"],
  ArrowUp: [1, "jump"],
  KeyL: [1, "punch"],
};
// also swallowed while fighting so the page never scrolls
const SWALLOW = new Set(["ArrowDown", "Space"]);

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
  punch: () => tone(520, 0.07, 0.03, 0.5, "sawtooth"),
  hit: () => {
    tone(150, 0.16, 0.09, 0.45, "square");
    tone(90, 0.2, 0.07, 0.6, "sine");
  },
  jump: () => tone(260, 0.16, 0.04, 2.4, "sine"),
  land: () => tone(120, 0.08, 0.04, 0.6),
  tick: () => tone(660, 0.1, 0.04, 1, "sine"),
  fight: () => {
    tone(523, 0.12, 0.05, 1, "square");
    tone(784, 0.22, 0.05, 1, "square", 0.1);
  },
  ko: () => {
    tone(400, 0.6, 0.08, 0.25, "sawtooth");
    tone(1200, 0.3, 0.03, 1.5, "sine", 0.2);
  },
  round: () => tone(880, 0.25, 0.05, 1.2, "sine"),
  match: () => [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.22, 0.05, 1, "triangle", k * 0.12)),
};

export default function WobblyWarriors({ restartSignal = 0, muted = false }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sRef = useRef(null); // live match, null outside a fight
  const held = useRef(new Set());
  const [screen, setScreen] = useState("menu"); // menu | mode | arena | game
  const [mode, setMode] = useState("pvp");
  const [arena, setArena] = useState(0);
  const [phase, setPhase] = useState(null); // mirrors s.phase for overlays
  const [result, setResult] = useState(null);
  const ui = useRef({ screen, arena, mode });
  ui.current = { screen, arena, mode };
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const names = (m) => [`P1 ${FIGHTERS[0].name}`, m === "ai" ? `CPU ${FIGHTERS[1].name}` : `P2 ${FIGHTERS[1].name}`];

  const clearKeys = () => {
    held.current.clear();
    const s = sRef.current;
    if (s) for (const f of s.fighters) Object.assign(f.input, { left: false, right: false, jumpQ: false, punchQ: false });
  };

  const startMatch = (a = arena, m = mode) => {
    clearKeys();
    sRef.current = create({ mode: m, arena: a });
    setResult(null);
    setPhase(sRef.current.phase);
    setScreen("game");
  };
  const doRematch = () => {
    const s = sRef.current;
    if (!s) return;
    clearKeys();
    rematch(s);
    setResult(null);
    setPhase(s.phase);
  };
  const pause = () => {
    const s = sRef.current;
    if (!s) return;
    togglePause(s);
    clearKeys();
    setPhase(s.phase);
  };
  const leave = (to) => {
    clearKeys();
    sRef.current = null;
    setPhase(null);
    setResult(null);
    setScreen(to);
  };
  const act = useRef(null);
  act.current = { pause };

  // The single game loop + resize handling; created once, torn down on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    let dpr = 1;
    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (!width || !height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let shownPhase = null;
    let menuT = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      last = now;
      const s = sRef.current;
      if (s) {
        const keys = held.current;
        for (const [code, [p, what]] of Object.entries(KEYMAP)) {
          if (what !== "left" && what !== "right") continue;
          if (p === 1 && s.mode === "ai") continue;
          s.fighters[p].input[what] = keys.has(code);
        }
        const events = step(s, dt);
        if (!mutedRef.current) for (const e of new Set(events)) SOUNDS[e]?.();
        if (events.includes("match")) {
          setResult({ winner: s.matchWinner, score: [s.fighters[0].wins, s.fighters[1].wins] });
        }
        if (s.phase !== shownPhase) {
          shownPhase = s.phase;
          setPhase(s.phase);
        }
      } else {
        shownPhase = null;
        menuT += Math.min(dt, 0.1);
      }

      // letterbox the 960x540 world into whatever the stage is
      const cw = canvas.width;
      const ch = canvas.height;
      const scale = Math.min(cw / W, ch / H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#1a1030";
      ctx.fillRect(0, 0, cw, ch);
      ctx.setTransform(scale, 0, 0, scale, (cw - W * scale) / 2, (ch - H * scale) / 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      if (s) draw(ctx, s, names(s.mode));
      else drawArenaPreview(ctx, ui.current.arena, menuT);
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Keyboard: held-set by physical key, so both players can mash at once.
  useEffect(() => {
    const onDown = (e) => {
      if (ui.current.screen !== "game" || !sRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const s = sRef.current;
      if (e.code === "KeyP" || (e.code === "Escape" && s.phase !== "matchOver" && s.phase !== "paused")) {
        if (!e.repeat) act.current.pause();
        if (e.code === "KeyP") e.preventDefault();
        return;
      }
      const m = KEYMAP[e.code];
      if (!m && !SWALLOW.has(e.code)) return;
      e.preventDefault();
      if (!m) return;
      const [p, what] = m;
      if (p === 1 && s.mode === "ai") return;
      held.current.add(e.code);
      if (e.repeat) return;
      if (what === "jump") s.fighters[p].input.jumpQ = true;
      else if (what === "punch") s.fighters[p].input.punchQ = true;
    };
    const onUp = (e) => {
      held.current.delete(e.code);
      if (ui.current.screen === "game" && (KEYMAP[e.code] || SWALLOW.has(e.code))) e.preventDefault();
    };
    // a key released while the window is unfocused never fires keyup
    const onBlur = () => {
      clearKeys();
      const s = sRef.current;
      if (s && (s.phase === "fight" || s.phase === "countdown")) act.current.pause();
    };
    const onVis = () => document.hidden && onBlur();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GamePlayer Restart: fresh match with the same settings.
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (sRef.current) doRematch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  // DEV-only test hook: open a dev page with ?wwtest=1.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]wwtest=1/.test(window.location.search)) {
    window.__ww = { get s() { return sRef.current; }, held: held.current, startMatch, leave };
  }

  const nm = names(mode);

  return (
    <div className="wbw" ref={wrapRef} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="wbw-canvas" aria-label="Wobbly Warriors game" />

      {screen === "game" && phase !== "matchOver" && phase !== "paused" && (
        <button type="button" className="wbw-pause" aria-label="Pause" onClick={pause}>
          <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        </button>
      )}

      {screen === "menu" && (
        <div className="wbw-overlay">
          <div className="wbw-card">
            <h2 className="wbw-title">Wobbly Warriors</h2>
            <p className="wbw-sub">Arena Clash</p>
            <p className="wbw-tag">Wobble, Punch, and Knock Them Down!</p>
            <button type="button" className="wbw-btn" onClick={() => setScreen("mode")}>Play</button>
            <div className="wbw-controls">
              <div><strong style={{ color: FIGHTERS[0].body }}>P1 {FIGHTERS[0].name}</strong><span><kbd>A</kbd><kbd>D</kbd> move · <kbd>W</kbd> jump · <kbd>F</kbd> punch</span></div>
              <div><strong style={{ color: FIGHTERS[1].body }}>P2 {FIGHTERS[1].name}</strong><span><kbd>←</kbd><kbd>→</kbd> move · <kbd>↑</kbd> jump · <kbd>L</kbd> punch</span></div>
            </div>
            <p className="wbw-hint">First to {WINS_NEEDED} round wins · P to pause</p>
          </div>
        </div>
      )}

      {screen === "mode" && (
        <div className="wbw-overlay">
          <div className="wbw-card">
            <h3 className="wbw-head">Choose Mode</h3>
            <div className="wbw-choices">
              <button type="button" className="wbw-choice" onClick={() => { setMode("pvp"); setScreen("arena"); }}>
                <strong>2 Player VS</strong>
                <span>Two players, one keyboard</span>
              </button>
              <button type="button" className="wbw-choice" onClick={() => { setMode("ai"); setScreen("arena"); }}>
                <strong>VS Computer</strong>
                <span>You (A/D/W/F) vs CPU {FIGHTERS[1].name}</span>
              </button>
            </div>
            <button type="button" className="wbw-btn wbw-btn--ghost" onClick={() => setScreen("menu")}>Back</button>
          </div>
        </div>
      )}

      {screen === "arena" && (
        <div className="wbw-overlay">
          <div className="wbw-card">
            <h3 className="wbw-head">Pick an Arena</h3>
            <div className="wbw-choices">
              {ARENAS.map((a, k) => (
                <button
                  type="button"
                  key={a.id}
                  className={`wbw-choice wbw-arena wbw-arena--${a.id}${arena === k ? " is-on" : ""}`}
                  onMouseEnter={() => setArena(k)}
                  onFocus={() => setArena(k)}
                  onClick={() => { setArena(k); startMatch(k, mode); }}
                >
                  <strong>{a.name}</strong>
                </button>
              ))}
            </div>
            <button type="button" className="wbw-btn wbw-btn--ghost" onClick={() => setScreen("mode")}>Back</button>
          </div>
        </div>
      )}

      {screen === "game" && phase === "paused" && (
        <div className="wbw-overlay wbw-overlay--dim">
          <div className="wbw-card">
            <h3 className="wbw-head">Paused</h3>
            <button type="button" className="wbw-btn" onClick={pause}>Resume</button>
            <button type="button" className="wbw-btn wbw-btn--ghost" onClick={doRematch}>Restart Match</button>
            <button type="button" className="wbw-btn wbw-btn--ghost" onClick={() => leave("menu")}>Main Menu</button>
          </div>
        </div>
      )}

      {screen === "game" && phase === "matchOver" && result && (
        <div className="wbw-overlay wbw-overlay--late">
          <div className="wbw-card">
            <p className="wbw-tag">Match Winner</p>
            <h3 className="wbw-head" style={{ color: FIGHTERS[result.winner]?.body }}>{nm[result.winner]}</h3>
            <p className="wbw-score">{result.score[0]} – {result.score[1]}</p>
            <button type="button" className="wbw-btn" onClick={doRematch}>Rematch</button>
            <button type="button" className="wbw-btn wbw-btn--ghost" onClick={() => leave("arena")}>Change Arena</button>
            <button type="button" className="wbw-btn wbw-btn--ghost" onClick={() => leave("menu")}>Main Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
