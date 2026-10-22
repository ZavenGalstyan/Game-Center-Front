/**
 * Dot Connect — drag paths between matching dots until every pair is joined
 * and every cell is filled. SVG board inside the shared <GamePlayer>
 * (registered by name in ../registry.js); Restart / Mute / Fullscreen / Like
 * stay there.
 *
 * levels.js builds 50 boards solution-first (never unsolvable), rules.js holds
 * the drag rules, solver.js powers hints. `restartSignal` restarts the level
 * being played; `muted` silences the WebAudio blips. Progress, best times and
 * settings persist under `dot-connect-progress`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LEVELS, PALETTE } from "./levels.js";
import { connected, dotOwner, extend, filledCount, isWon } from "./rules.js";
import { solve } from "./solver.js";
import "./DotConnect.css";

const KEY = "dot-connect-progress";
const DEFAULTS = { unlocked: 1, done: {}, best: {}, settings: { labels: false, vibrate: true } };

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return p ? { ...DEFAULTS, ...p, settings: { ...DEFAULTS.settings, ...p.settings } } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let audio = null;
function tone(freq, dur, vol, type = "sine", delay = 0) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch {
    /* audio unavailable */
  }
}
const SFX = {
  step: () => tone(620, 0.04, 0.015, "triangle"),
  connect: (c) => [0, 0.07].forEach((d, i) => tone(523 * 2 ** ((c * 2 + i * 4) / 12), 0.18, 0.05, "sine", d)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 0.05, "sine", i * 0.09)),
  hint: () => tone(880, 0.25, 0.04, "sine"),
  undo: () => tone(330, 0.08, 0.03, "triangle"),
};

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const fresh = (L) => ({ paths: L.dots.map(() => []), undo: [], moves: 0, hints: 0, status: "playing", flash: -1 });
const BANDS = [
  { label: "5 × 5", from: 1, to: 10 },
  { label: "6 × 6", from: 11, to: 22 },
  { label: "7 × 7", from: 23, to: 36 },
  { label: "8 × 8", from: 37, to: 50 },
];

export default function DotConnect({ restartSignal = 0, muted = false }) {
  const [prog, setProg] = useState(loadProgress);
  const [screen, setScreen] = useState("menu"); // menu | levels | play
  const [lvl, setLvl] = useState(0);
  const [g, setG] = useState(() => fresh(LEVELS[0]));
  const [sec, setSec] = useState(0);
  const [toast, setToast] = useState("");
  const L = LEVELS[lvl];

  const gRef = useRef(g);
  gRef.current = g;
  const timeRef = useRef(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const progRef = useRef(prog);
  progRef.current = prog;
  const sfx = (name, arg) => !mutedRef.current && SFX[name](arg);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prog));
    } catch {
      /* storage blocked */
    }
  }, [prog]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // Timer: counts only while a level is actively being played.
  const running = screen === "play" && g.status === "playing";
  useEffect(() => {
    if (!running) return undefined;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      timeRef.current += (now - last) / 1000;
      last = now;
      setSec(Math.floor(timeRef.current));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const startLevel = useCallback((i) => {
    setLvl(i);
    setG(fresh(LEVELS[i]));
    timeRef.current = 0;
    setSec(0);
    setScreen("play");
  }, []);

  const setStatus = (status) => setG((s) => (s.status === "won" ? s : { ...s, status }));

  // Commit a board change: undo snapshot, move count, win check.
  const commit = (before, paths, extra = {}) => {
    const won = isWon(L, paths);
    setG((s) => ({ ...s, paths, undo: [...s.undo, before], moves: s.moves + 1, ...extra, status: won ? "won" : s.status }));
    if (!won) return;
    const t = Math.max(1, Math.round(timeRef.current));
    setSec(Math.floor(timeRef.current));
    setTimeout(() => sfx("win"), 250);
    setProg((p) => ({
      ...p,
      unlocked: Math.max(p.unlocked, Math.min(LEVELS.length, L.id + 1)),
      done: { ...p.done, [L.id]: true },
      best: { ...p.best, [L.id]: Math.min(p.best[L.id] ?? Infinity, t) },
    }));
  };

  // ---------- dragging ----------
  const svgRef = useRef(null);
  const drag = useRef(null);
  const cellAt = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const c = Math.floor(((e.clientX - r.left) / r.width) * L.n);
    const row = Math.floor(((e.clientY - r.top) / r.height) * L.n);
    return c < 0 || row < 0 || c >= L.n || row >= L.n ? -1 : row * L.n + c;
  };

  const onDown = (e) => {
    if (gRef.current.status !== "playing" || e.button > 0) return;
    e.preventDefault();
    const x = cellAt(e);
    if (x < 0) return;
    const { paths } = gRef.current;
    let c = dotOwner(L, x);
    let next;
    if (c >= 0) next = paths.map((q, k) => (k === c ? [x] : q));
    else {
      c = paths.findIndex((q) => q.includes(x));
      if (c < 0) return;
      next = paths.map((q, k) => (k === c ? q.slice(0, q.indexOf(x) + 1) : q));
    }
    drag.current = { c, before: paths, wasConnected: connected(L, paths, c) };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gRef.current = { ...gRef.current, paths: next, flash: -1 };
    setG((s) => ({ ...s, paths: next, flash: -1 }));
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const target = cellAt(e);
    if (target < 0) return;
    let paths = gRef.current.paths;
    const start = paths;
    const n = L.n;
    // walk one adjacent cell at a time so fast drags don't skip cells
    for (let guard = 0; guard < 2 * n; guard++) {
      const p = paths[d.c];
      const last = p[p.length - 1];
      if (last === target) break;
      const dr = Math.floor(target / n) - Math.floor(last / n);
      const dc = (target % n) - (last % n);
      const step = p.includes(target) ? target : Math.abs(dr) >= Math.abs(dc) ? last + Math.sign(dr) * n : last + Math.sign(dc);
      const nextPaths = extend(L, paths, d.c, step);
      if (nextPaths === paths) break;
      if (nextPaths[d.c].length > paths[d.c].length) {
        if (connected(L, nextPaths, d.c)) {
          sfx("connect", d.c);
          if (progRef.current.settings.vibrate) navigator.vibrate?.(18);
        } else sfx("step");
      }
      paths = nextPaths;
    }
    if (paths !== start) {
      gRef.current = { ...gRef.current, paths };
      setG((s) => ({ ...s, paths }));
    }
  };

  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    // a lone dot tap leaves a 1-cell "path"; tidy it away
    const tidy = gRef.current.paths.map((q) => (q.length === 1 ? [] : q));
    const same = tidy.every((q, k) => q.length === d.before[k].length && q.every((x, i) => x === d.before[k][i]));
    if (same) setG((s) => ({ ...s, paths: d.before }));
    else commit(d.before, tidy);
  };

  // ---------- tools ----------
  const undo = () => {
    const s = gRef.current;
    if (s.status !== "playing" || !s.undo.length) return;
    sfx("undo");
    setG({ ...s, paths: s.undo[s.undo.length - 1], undo: s.undo.slice(0, -1), flash: -1 });
  };

  const hint = () => {
    const s = gRef.current;
    if (s.status !== "playing") return;
    const fixed = {};
    s.paths.forEach((p, c) => connected(L, s.paths, c) && (fixed[c] = p));
    const sol = solve(L, fixed);
    if (!sol) {
      setToast("Your finished paths block every solution — undo or redraw one.");
      return;
    }
    const open = L.dots.map((_, c) => c).filter((c) => !fixed[c]);
    if (!open.length) return;
    const clashes = (c) => sol[c].some((x) => s.paths.some((q, k) => k !== c && q.includes(x)));
    const c = open.find((k) => !clashes(k)) ?? open[0];
    const cells = new Set(sol[c]);
    const paths = s.paths.map((q, k) => {
      if (k === c) return sol[c];
      const j = q.findIndex((x) => cells.has(x));
      return j < 0 ? q : j < 2 ? [] : q.slice(0, j);
    });
    sfx("hint");
    commit(s.paths, paths, { hints: s.hints + 1, flash: c });
  };

  const restart = () => {
    setG(fresh(L));
    timeRef.current = 0;
    setSec(0);
  };

  const togglePause = () => {
    const s = gRef.current.status;
    if (s === "playing") setStatus("paused");
    else if (s === "paused") setStatus("playing");
  };

  // Shared GamePlayer Restart → restart the current level.
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") restart();
  }, [restartSignal]);

  // Keyboard shortcuts (play screen only).
  const keys = useRef(null);
  keys.current = { undo, hint, togglePause, screen };
  useEffect(() => {
    const onKey = (e) => {
      if (keys.current.screen !== "play" || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "u") keys.current.undo();
      else if (k === "h" && !e.ctrlKey && !e.metaKey) keys.current.hint();
      else if (k === "p" || k === "escape") keys.current.togglePause();
      else return;
      if (k !== "escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onHide = () => document.hidden && setStatus("paused");
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // DEV-only test hook: open a dev page with ?dctest=1.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]dctest=1/.test(window.location.search)) {
    window.__dcn = { g, L, prog, startLevel, hint, undo, restart, setScreen };
  }

  const setSetting = (k) => setProg((p) => ({ ...p, settings: { ...p.settings, [k]: !p.settings[k] } }));
  const doneCount = Object.keys(prog.done).length;
  const continueAt = (LEVELS.find((l) => l.id <= prog.unlocked && !prog.done[l.id])?.id ?? prog.unlocked) - 1;

  // ---------- screens ----------
  if (screen === "menu") {
    return (
      <div className="dc">
        <div className="dc-menu">
          <MenuArt />
          <h2 className="dc-title">Dot Connect</h2>
          <p className="dc-tag">CONNECT • THINK • COMPLETE</p>
          <div className="dc-progress" aria-label={`${doneCount} of 50 levels complete`}>
            <i style={{ width: `${(doneCount / LEVELS.length) * 100}%` }} />
          </div>
          <p className="dc-sub">{doneCount} / {LEVELS.length} levels complete</p>
          <div className="dc-row">
            <button type="button" className="dc-btn dc-btn--main" onClick={() => startLevel(continueAt)}>
              {doneCount ? `Continue · Level ${continueAt + 1}` : "Play"}
            </button>
            <button type="button" className="dc-btn" onClick={() => setScreen("levels")}>Levels</button>
          </div>
          <div className="dc-row dc-settings">
            <Toggle on={prog.settings.labels} onClick={() => setSetting("labels")}>Number labels</Toggle>
            <Toggle on={prog.settings.vibrate} onClick={() => setSetting("vibrate")}>Vibration</Toggle>
          </div>
          <p className="dc-hint">Join every pair and fill every cell. Drag back to erase.</p>
        </div>
      </div>
    );
  }

  if (screen === "levels") {
    return (
      <div className="dc">
        <div className="dc-levels">
          <header className="dc-bar">
            <button type="button" className="dc-icon" aria-label="Back" onClick={() => setScreen("menu")}>‹</button>
            <h3>Select Level</h3>
            <span className="dc-sub">{doneCount}/50</span>
          </header>
          <div className="dc-level-scroll">
            {BANDS.map((b) => (
              <section key={b.label}>
                <h4>{b.label}</h4>
                <div className="dc-level-grid">
                  {LEVELS.slice(b.from - 1, b.to).map((l) => {
                    const locked = l.id > prog.unlocked;
                    return (
                      <button
                        type="button"
                        key={l.id}
                        disabled={locked}
                        className={`dc-tile${prog.done[l.id] ? " is-done" : ""}${locked ? " is-locked" : ""}`}
                        onClick={() => startLevel(l.id - 1)}
                      >
                        <b>{locked ? "🔒" : l.id}</b>
                        {prog.best[l.id] && <small>{fmt(prog.best[l.id])}</small>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const filled = filledCount(g.paths);
  const joined = L.dots.filter((_, c) => connected(L, g.paths, c)).length;
  const pct = Math.round((filled / (L.n * L.n)) * 100);
  const isLast = L.id === LEVELS.length;
  const allDone = doneCount === LEVELS.length;
  const best = prog.best[L.id];

  return (
    <div className="dc">
      <div className="dc-play">
        <header className="dc-hud">
          <button type="button" className="dc-icon" aria-label="Levels" onClick={() => setScreen("levels")}>‹</button>
          <div className="dc-hud-title">
            <strong>Level {L.id}</strong>
            <span>{L.n}×{L.n} · {L.dots.length} pairs</span>
          </div>
          <div className="dc-stats">
            <Stat label="Time" value={fmt(sec)} />
            <Stat label="Moves" value={g.moves} />
            <Stat label="Pairs" value={`${joined}/${L.dots.length}`} />
            <Stat label="Filled" value={`${pct}%`} />
          </div>
          <button type="button" className="dc-icon" aria-label="Pause" onClick={togglePause}>❚❚</button>
        </header>

        <div className="dc-board-wrap">
          <svg
            ref={svgRef}
            className={`dc-board${g.status === "won" ? " is-won" : ""}`}
            viewBox={`0 0 ${L.n} ${L.n}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            {Array.from({ length: L.n * L.n }, (_, i) => {
              const owner = g.paths.findIndex((q) => q.includes(i));
              return (
                <rect
                  key={i}
                  className="dc-cell"
                  x={(i % L.n) + 0.05}
                  y={Math.floor(i / L.n) + 0.05}
                  width={0.9}
                  height={0.9}
                  rx={0.2}
                  style={{ "--d": `${((i % L.n) + Math.floor(i / L.n)) * 45}ms`, fill: owner >= 0 ? `${PALETTE[owner].hex}2e` : undefined }}
                />
              );
            })}
            {g.paths.map((p, c) => {
              if (p.length < 2) return null;
              const pts = p.map((x) => `${(x % L.n) + 0.5},${Math.floor(x / L.n) + 0.5}`).join(" ");
              const col = PALETTE[c].hex;
              return (
                <g key={`${c}-${g.flash === c ? "h" : ""}`} className={g.flash === c ? "dc-path--hint" : ""}>
                  <polyline points={pts} className="dc-glow" stroke={col} />
                  <polyline points={pts} className="dc-path" stroke={col} pathLength="1" />
                </g>
              );
            })}
            {L.dots.map((pair, c) =>
              pair.map((x) => (
                <g key={x} className={`dc-dot${connected(L, g.paths, c) ? " is-on" : ""}`} transform={`translate(${(x % L.n) + 0.5} ${Math.floor(x / L.n) + 0.5})`}>
                  <circle r={0.44} fill={PALETTE[c].hex} className="dc-halo" />
                  <circle r={0.3} fill={PALETTE[c].hex} />
                  <circle r={0.1} cx={-0.09} cy={-0.1} fill="#fff" opacity="0.55" />
                  {prog.settings.labels && <text y={0.11} className="dc-label">{c + 1}</text>}
                </g>
              )),
            )}
          </svg>
        </div>

        <footer className="dc-tools">
          <button type="button" className="dc-btn" onClick={undo} disabled={!g.undo.length || g.status !== "playing"}>↶ Undo</button>
          <button type="button" className="dc-btn" onClick={hint} disabled={g.status !== "playing"}>💡 Hint{g.hints ? ` · ${g.hints}` : ""}</button>
          <button type="button" className="dc-btn" onClick={restart}>↻ Restart</button>
        </footer>
        <p className="dc-status" aria-live="polite">
          {toast || (joined === L.dots.length && filled < L.n * L.n ? "All pairs joined — now fill every cell!" : best ? `Best ${fmt(best)}` : " ")}
        </p>
      </div>

      {g.status === "paused" && (
        <div className="dc-overlay">
          <div className="dc-card">
            <h3>Paused</h3>
            <p className="dc-sub">Level {L.id} · {fmt(sec)}</p>
            <button type="button" className="dc-btn dc-btn--main" onClick={togglePause}>Resume</button>
            <div className="dc-row">
              <button type="button" className="dc-btn" onClick={() => restart()}>Restart</button>
              <button type="button" className="dc-btn" onClick={() => setScreen("levels")}>Levels</button>
            </div>
          </div>
        </div>
      )}

      {g.status === "won" && (
        <div className="dc-overlay dc-overlay--late">
          <div className="dc-card">
            {isLast && allDone ? (
              <>
                <div className="dc-trophy">🏆</div>
                <h3>All Levels Complete!</h3>
                <p className="dc-sub">You connected all 50 boards. Brilliant thinking!</p>
                <div className="dc-row">
                  <button type="button" className="dc-btn dc-btn--main" onClick={() => setScreen("levels")}>Level Select</button>
                  <button type="button" className="dc-btn" onClick={() => setScreen("menu")}>Menu</button>
                </div>
              </>
            ) : (
              <>
                <h3>Level Complete!</h3>
                <div className="dc-results">
                  <Stat label="Time" value={fmt(sec)} />
                  <Stat label="Moves" value={g.moves} />
                  <Stat label="Best" value={fmt(best ?? sec)} />
                </div>
                {g.hints > 0 && <p className="dc-sub">{g.hints} hint{g.hints > 1 ? "s" : ""} used</p>}
                <div className="dc-row">
                  {!isLast && (
                    <button type="button" className="dc-btn dc-btn--main" onClick={() => startLevel(lvl + 1)}>Next Level</button>
                  )}
                  {isLast && (
                    <button type="button" className="dc-btn dc-btn--main" onClick={() => setScreen("levels")}>Level Select</button>
                  )}
                  <button type="button" className="dc-btn" onClick={restart}>Replay</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="dc-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Toggle({ on, onClick, children }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`dc-toggle${on ? " is-on" : ""}`} onClick={onClick}>
      <i />
      {children}
    </button>
  );
}

function MenuArt() {
  return (
    <svg className="dc-art" viewBox="0 0 5 3" aria-hidden="true">
      <polyline points="0.5,0.5 1.5,0.5 1.5,1.5 2.5,1.5 2.5,0.5 4.5,0.5" stroke={PALETTE[1].hex} className="dc-path dc-art-path" pathLength="1" />
      <polyline points="0.5,1.5 0.5,2.5 3.5,2.5 3.5,1.5 4.5,1.5" stroke={PALETTE[0].hex} className="dc-path dc-art-path" pathLength="1" style={{ animationDelay: "0.4s" }} />
      {[
        [0.5, 0.5, 1], [4.5, 0.5, 1], [0.5, 1.5, 0], [4.5, 1.5, 0],
      ].map(([x, y, c]) => (
        <g key={`${x}${y}`} className="dc-dot is-on" transform={`translate(${x} ${y})`}>
          <circle r={0.44} fill={PALETTE[c].hex} className="dc-halo" />
          <circle r={0.3} fill={PALETTE[c].hex} />
        </g>
      ))}
    </svg>
  );
}
