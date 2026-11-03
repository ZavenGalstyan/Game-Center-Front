/**
 * Corridor 9: Endless Passage — first-person observation horror.
 *
 * One requestAnimationFrame loop steps the simulation (sim.js) and draws it
 * with plain Three.js (world.js); audio is procedural WebAudio (audio.js).
 * React only renders menus/overlays and the exit counter (which changes once
 * per loop) — walking never re-renders React.
 *
 * Controls: WASD / arrows move · mouse look (Pointer Lock) · Shift walk
 * faster · M mute · Esc pause. `restartSignal` (the Game Center Restart
 * button) starts a fresh run; `muted` silences audio.
 * DEV hook: `?c9test=1` fakes pointer lock, disables rAF and exposes
 * window.__c9 (see tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./Corridor9.css";
import { createGame } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { BEST_KEY, SETTINGS_KEY, GOAL } from "./data.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("c9test");
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);

function load(key, fb) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fb;
  } catch {
    return fb;
  }
}
function store(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function HowTo({ onBack }) {
  return (
    <div className="c9-panel c9-howto" role="dialog" aria-label="How to play">
      <h2>How to Play</h2>
      <div className="c9-howto__cols">
        <section>
          <h3>The passage</h3>
          <p>You are walking an underground passage that never ends. The sign at the start of each stretch shows your exit number. You begin at <b>Exit 0</b>. Reach <b>Exit 9</b> and walk out.</p>
          <h3>The rule</h3>
          <ul>
            <li>Every stretch is either <b>exactly as it should be</b>, or it has <b>one thing wrong</b> with it.</li>
            <li>If you notice <b>anything unusual</b> — <b>turn around</b> and walk back the way you came.</li>
            <li>If <b>nothing is unusual</b> — <b>keep going</b> to the far end.</li>
            <li>A right choice takes you one exit closer. A wrong one sends you back to <b>Exit 0</b>.</li>
          </ul>
          <p className="c9-dim">Learn the normal passage well on your first walk: the posters, the doors, the bench, the clock, the lights, the pipes, the floor. Sounds can lie — trust only what you see.</p>
        </section>
        <section>
          <h3>Controls</h3>
          <dl className="c9-keys">
            <dt>W A S D</dt><dd>Walk</dd>
            <dt>Mouse</dt><dd>Look around</dd>
            <dt>Shift</dt><dd>Walk faster</dd>
            <dt>M</dt><dd>Mute sound</dd>
            <dt>Esc</dt><dd>Pause</dd>
          </dl>
          <p className="c9-dim">Click the view to capture the mouse. Headphones recommended. There are no sudden flashes.</p>
        </section>
      </div>
      <button type="button" className="c9-btn c9-btn--primary" onClick={onBack}>Back</button>
    </div>
  );
}

export default function Corridor9({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const keys = useRef(new Set());
  const lockedRef = useRef(false);
  const screenRef = useRef("menu");
  const frame = useRef(() => {});
  const timers = useRef(new Set());
  const settings = useRef(load(SETTINGS_KEY, {}) || {});

  const [screen, setScreenState] = useState("menu"); // menu | play | paused | won
  const [howto, setHowto] = useState(false);
  const [locked, setLocked] = useState(false);
  const [localMute, setLocalMute] = useState(!!settings.current.mute);
  const [sens, setSens] = useState(Number.isFinite(settings.current.sens) ? settings.current.sens : 1);
  const [exitNo, setExitNo] = useState(0);
  const [pulse, setPulse] = useState(null); // { id, kind: "up" | "reset" }
  const [message, setMessage] = useState(null);
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(() => load(BEST_KEY, null));
  const [lockHint, setLockHint] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const sensRef = useRef(sens);
  sensRef.current = sens;

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  const say = useCallback((text, kind = "") => setMessage({ id: Date.now() + Math.random(), text, kind }), []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST) {
      lockedRef.current = true;
      setLocked(true);
      if (screenRef.current === "paused") setScreen("play");
      return;
    }
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => setLockHint(true));
    } catch {
      setLockHint(true);
    }
  }, [setScreen]);
  const releaseLock = useCallback(() => {
    if (TEST) {
      lockedRef.current = false;
      setLocked(false);
      return;
    }
    try {
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const onChange = () => {
      const l = document.pointerLockElement === rootRef.current;
      lockedRef.current = l;
      setLocked(l);
      keys.current.clear();
      if (l) {
        setLockHint(false);
        if (screenRef.current === "paused") setScreen("play");
      } else if (screenRef.current === "play") {
        setScreen("paused");
      }
    };
    const onErr = () => setLockHint(true);
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("pointerlockerror", onErr);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("pointerlockerror", onErr);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setScreen]);

  /* ------------------------------------------------------------ flow */
  const startGame = useCallback(() => {
    clearTimers();
    audio.unlock();
    gameRef.current = createGame();
    keys.current.clear();
    setResult(null);
    setHowto(false);
    setExitNo(0);
    setPulse(null);
    say("Notice everything. Trust nothing. Find Exit 9.", "long");
    setScreen("play");
    requestLock();
    later(() => audio.play("start"), 150);
  }, [clearTimers, later, requestLock, say, setScreen]);
  const toMenu = useCallback(() => {
    clearTimers();
    releaseLock();
    gameRef.current = null;
    setResult(null);
    setMessage(null);
    setHowto(false);
    setScreen("menu");
  }, [clearTimers, releaseLock, setScreen]);
  const pause = useCallback(() => {
    if (screenRef.current !== "play") return;
    setScreen("paused");
    releaseLock();
  }, [releaseLock, setScreen]);
  const resume = useCallback(() => {
    setHowto(false);
    requestLock();
  }, [requestLock]);

  const win = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const r = { time: g.t, mistakes: g.mistakes, found: g.found, loops: g.loops };
    const prev = load(BEST_KEY, null);
    if (!prev || g.t < prev) {
      store(BEST_KEY, g.t);
      setBest(g.t);
      r.newBest = true;
    }
    setResult(r);
    setScreen("won");
    releaseLock();
  }, [releaseLock, setScreen]);

  /* ------------------------------------------------------------ events from the sim */
  const handleEvents = useCallback((g) => {
    const evs = g.events;
    if (!evs.length) return;
    g.events = [];
    for (const e of evs) {
      switch (e.type) {
        case "step":
          audio.play("step", e);
          break;
        case "decision":
          setExitNo(e.after);
          setPulse({ id: Date.now() + Math.random(), kind: e.correct ? "up" : "reset" });
          if (e.correct) {
            audio.play("correct");
            if (e.after === GOAL) later(() => say("Exit 9. The way out is ahead.", "long"), 900);
          } else {
            audio.play("wrong");
            say(e.dir === "back" ? "Nothing was wrong. You turned back for no reason. Back to Exit 0." : "You walked past something that was wrong. Back to Exit 0.", "bad");
          }
          break;
        case "win":
          audio.play("win");
          later(win, 1300);
          break;
        default:
          break;
      }
    }
  }, [later, say, win]);

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const stage = stageRef.current;
    if (TEST) stage.dataset.preserve = "1";
    let world;
    try {
      world = createWorld(stage);
    } catch (err) {
      console.error("Corridor 9: WebGL unavailable", err);
      setNoGL(true);
      return undefined;
    }
    world.onEvent = (e) => {
      if (e.type === "figureGone") audio.play("figureGone");
    };
    worldRef.current = world;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      world.resize(Math.round(r.width), Math.round(r.height));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    fit();
    let raf = 0, last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      frame.current(dt);
    };
    if (!TEST) raf = requestAnimationFrame(loop);
    const tset = timers.current;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", fit);
      tset.forEach(clearTimeout);
      tset.clear();
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  frame.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    const g = gameRef.current;
    const scr = screenRef.current;
    if (g && scr === "play" && g.state === "play") {
      const k = keys.current;
      const on = lockedRef.current;
      g.update(dt, on ? {
        f: k.has("KeyW") || k.has("ArrowUp"),
        b: k.has("KeyS") || k.has("ArrowDown"),
        l: k.has("KeyA") || k.has("ArrowLeft"),
        r: k.has("KeyD") || k.has("ArrowRight"),
        sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
      } : {});
      handleEvents(g);
    }
    world.render(scr === "menu" ? null : g, scr === "play" || scr === "menu" ? dt : 0);
    const flick = g && g.loop.anomaly === "flicker" ? world.flickerLevel(g.loopTime) : null;
    audio.update(scr === "menu" ? null : g, dt, scr === "play" && g?.state === "play", flick);
  };

  /* ------------------------------------------------------------ input */
  const toggleMuteRef = useRef(() => {});
  toggleMuteRef.current = () => {
    setLocalMute((m) => {
      settings.current = { ...settings.current, mute: !m };
      store(SETTINGS_KEY, settings.current);
      return !m;
    });
  };
  useEffect(() => {
    const down = (e) => {
      if (e.code === "KeyM" && !e.repeat && (screenRef.current === "play" || screenRef.current === "paused")) toggleMuteRef.current();
      if (screenRef.current !== "play") return;
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
      if (e.repeat) return;
      if (e.code === "Escape" && (TEST || !document.pointerLockElement)) pause();
    };
    const up = (e) => keys.current.delete(e.code);
    const move = (e) => {
      if (!lockedRef.current || screenRef.current !== "play") return;
      const dx = Math.max(-250, Math.min(250, e.movementX || 0)), dy = Math.max(-250, Math.min(250, e.movementY || 0));
      gameRef.current?.look(dx, dy, sensRef.current);
    };
    const blur = () => keys.current.clear();
    const vis = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("mousemove", move);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    const root = rootRef.current;
    const wheel = (e) => e.preventDefault();
    const ctx = (e) => e.preventDefault();
    root?.addEventListener("wheel", wheel, { passive: false });
    root?.addEventListener("contextmenu", ctx);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousemove", move);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
      root?.removeEventListener("wheel", wheel);
      root?.removeEventListener("contextmenu", ctx);
    };
  }, [pause]);

  /* ------------------------------------------------------------ sound */
  const toggleMute = () => toggleMuteRef.current();
  useEffect(() => audio.setMuted(muted || localMute), [muted, localMute]);
  useEffect(() => () => audio.dispose(), []);
  const changeSens = (v) => {
    setSens(v);
    settings.current = { ...settings.current, sens: v };
    store(SETTINGS_KEY, settings.current);
  };

  /* ------------------------------------------------------------ restart from the Game Center toolbar */
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    startGame();
  }, [restartSignal, startGame]);

  /* ------------------------------------------------------------ transient text */
  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(() => setMessage((m) => (m && m.id === message.id ? null : m)), message.kind ? 5000 : 3200);
    return () => clearTimeout(id);
  }, [message]);

  /* ------------------------------------------------------------ test hook */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__c9 = {
      game: () => gameRef.current,
      setGame: (g) => {
        gameRef.current = g;
      },
      world: () => worldRef.current,
      screen: () => screenRef.current,
      locked: () => lockedRef.current,
      advance(n = 1, dt = 1 / 60) {
        for (let i = 0; i < n; i++) frame.current(dt);
      },
      keys: keys.current,
      start: startGame,
      toMenu,
      pause,
      resume,
      releaseLock,
      requestLock,
      toggleMute: () => toggleMuteRef.current(),
      fit() {
        const r = stageRef.current.getBoundingClientRect();
        worldRef.current?.resize(Math.round(r.width), Math.round(r.height));
      },
    };
    return () => {
      delete window.__c9;
    };
  }, [startGame, toMenu, pause, resume, releaseLock, requestLock]);

  const effMuted = muted || localMute;
  const inRun = screen === "play" || screen === "paused";
  const g = gameRef.current;

  return (
    <div
      ref={rootRef}
      className={`c9 c9--${screen}`}
      onClick={(e) => {
        if (e.target.closest?.("button, input, label")) return;
        if (screenRef.current === "play" && !lockedRef.current) requestLock();
      }}
    >
      <div ref={stageRef} className="c9-stage" />
      <div className="c9-vignette" />
      <div className="c9-grain" />
      {pulse?.kind === "reset" && <div key={pulse.id} className="c9-reset" />}
      {screen === "won" && <div className="c9-whiteout" />}

      {/* HUD */}
      <div className={`c9-hud${inRun ? "" : " is-hidden"}`} aria-hidden={!inRun}>
        <div key={pulse?.id ?? "x"} className={`c9-exit${pulse ? ` is-${pulse.kind}` : ""}${exitNo >= GOAL ? " is-final" : ""}`} aria-label={`Exit ${exitNo}`}>
          <span className="c9-exit__label">EXIT</span>
          <span className="c9-exit__num">{exitNo}</span>
          <span className="c9-exit__of">/ {GOAL}</span>
        </div>
        {effMuted && <div className="c9-hud__mute">Sound off · M</div>}
        {message && <div key={message.id} className={`c9-message${message.kind ? ` is-${message.kind}` : ""}`}>{message.text}</div>}
      </div>

      {/* screens */}
      {screen === "menu" && !howto && (
        <div className="c9-screen c9-menu">
          <div className="c9-menu__title">
            <div className="c9-menu__eyebrow">Horror · Psychological · Puzzle · Exploration</div>
            <h1>
              Corridor <span>9</span>
            </h1>
            <div className="c9-menu__sub">Endless Passage</div>
            <p className="c9-menu__tag">Notice Everything. Trust Nothing. Find Exit 9.</p>
          </div>
          <div className="c9-menu__actions">
            <button type="button" className="c9-btn c9-btn--primary" onClick={startGame} disabled={noGL}>Enter the Passage</button>
            <button type="button" className="c9-btn" onClick={() => setHowto(true)}>How to Play</button>
            <button type="button" className="c9-btn c9-btn--ghost" onClick={toggleMute}>Sound: {effMuted ? "Off" : "On"}</button>
          </div>
          <div className="c9-menu__foot">
            {best ? <span>Fastest way out: {fmt(best)}</span> : <span>Headphones recommended</span>}
            {TOUCH && <span className="c9-warn">Needs a keyboard and mouse.</span>}
            {noGL && <span className="c9-warn">WebGL is unavailable in this browser.</span>}
          </div>
        </div>
      )}

      {screen === "paused" && !howto && (
        <div className="c9-screen c9-pause">
          <div className="c9-panel">
            <h2>Paused</h2>
            <p className="c9-dim">{g ? `Exit ${g.progress} of ${GOAL} · ${g.mistakes} wrong turn${g.mistakes === 1 ? "" : "s"} · ${fmt(g.t)}` : ""}</p>
            <button type="button" className="c9-btn c9-btn--primary" onClick={resume}>Resume</button>
            {lockHint && <p className="c9-dim c9-small">Click Resume again to capture the mouse.</p>}
            <button type="button" className="c9-btn" onClick={startGame}>Restart from Exit 0</button>
            <button type="button" className="c9-btn" onClick={() => setHowto(true)}>How to Play</button>
            <button type="button" className="c9-btn c9-btn--ghost" onClick={toggleMute}>Sound: {effMuted ? "Off" : "On"}</button>
            <label className="c9-slider">
              <span>Mouse sensitivity</span>
              <input type="range" min="0.3" max="2.5" step="0.05" value={sens} onChange={(e) => changeSens(Number(e.target.value))} />
            </label>
            <button type="button" className="c9-btn c9-btn--ghost" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}

      {howto && (
        <div className="c9-screen">
          <HowTo onBack={() => setHowto(false)} />
        </div>
      )}

      {screen === "play" && !locked && <div className="c9-clickhint">Click to look around</div>}

      {screen === "won" && result && (
        <div className="c9-screen c9-end">
          <div className="c9-panel">
            <div className="c9-end__eyebrow">Exit 9</div>
            <h2>You Found the Way Out</h2>
            <p className="c9-end__stats">
              {fmt(result.time)} · {result.found} anomal{result.found === 1 ? "y" : "ies"} spotted · {result.mistakes} wrong turn{result.mistakes === 1 ? "" : "s"}
              {result.newBest ? " · new best" : best ? ` · best ${fmt(best)}` : ""}
            </p>
            <p className="c9-dim">The stairs climb into grey morning light. Behind you, the hum of the passage goes on — patient, the same as always. Almost.</p>
            <button type="button" className="c9-btn c9-btn--primary" onClick={startGame}>Walk It Again</button>
            <button type="button" className="c9-btn c9-btn--ghost" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
