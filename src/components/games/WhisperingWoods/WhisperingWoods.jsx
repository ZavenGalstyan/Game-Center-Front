/**
 * Whispering Woods: The Eight Notes — first-person forest survival horror.
 *
 * One requestAnimationFrame loop steps the simulation (sim.js) and draws it
 * with plain Three.js (world.js); audio is procedural WebAudio (audio.js).
 * React renders the menus and overlays; the fast HUD (stamina, prompt,
 * static, vignette) is written straight to DOM refs so walking never
 * re-renders React.
 *
 * Controls: WASD / arrows move · mouse look (Pointer Lock) · Shift sprint ·
 * F flashlight · E take note · M mute · Esc pause. `restartSignal` (the Game
 * Center Restart button) starts a fresh run; `muted` silences audio.
 * DEV hook: `?wwtest=1` fakes pointer lock, disables rAF and exposes
 * window.__ww (see tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./WhisperingWoods.css";
import { createGame } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { BEST_KEY, SETTINGS_KEY } from "./data.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("wwtest");
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

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 10h6M9 14h6M9 18h3" />
    </svg>
  );
}

function HowTo({ onBack }) {
  return (
    <div className="ww-panel ww-howto" role="dialog" aria-label="How to play">
      <h2>How to Play</h2>
      <div className="ww-howto__cols">
        <section>
          <h3>Objective</h3>
          <p>Eight notes are pinned somewhere in these woods — on a cabin wall, an old truck, a well, a dead tree… They glow faintly. Find all <b>eight</b>, then reach the <b>exit gate</b> at the northern edge of the forest.</p>
          <h3>The Thing in the Trees</h3>
          <ul>
            <li>It cannot be fought. It grows bolder with every note you take.</li>
            <li>It comes when you are not looking. Listen: the crickets fall silent when it is near.</li>
            <li>Looking at it slows it — but its face fills you with dread. Stare too long and your flashlight fails.</li>
            <li>Break its line of sight, or sprint far into the fog, to lose it.</li>
          </ul>
        </section>
        <section>
          <h3>Controls</h3>
          <dl className="ww-keys">
            <dt>W A S D</dt><dd>Move</dd>
            <dt>Mouse</dt><dd>Look around</dd>
            <dt>Shift</dt><dd>Sprint (uses stamina)</dd>
            <dt>F</dt><dd>Flashlight on / off</dd>
            <dt>E</dt><dd>Take a note</dd>
            <dt>M</dt><dd>Mute sound</dd>
            <dt>Esc</dt><dd>Pause</dd>
          </dl>
          <p className="ww-dim">Stamina refills while you walk or stand still. Headphones recommended.</p>
        </section>
      </div>
      <button type="button" className="ww-btn ww-btn--primary" onClick={onBack}>Back</button>
    </div>
  );
}

export default function WhisperingWoods({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const keys = useRef(new Set());
  const lockedRef = useRef(false);
  const screenRef = useRef("menu");
  const frame = useRef(() => {});
  const timers = useRef(new Set());
  const hud = useRef({});
  const settings = useRef(load(SETTINGS_KEY, {}) || {});

  const [screen, setScreenState] = useState("menu"); // menu | play | paused | over | won
  const [howto, setHowto] = useState(false);
  const [locked, setLocked] = useState(false);
  const [localMute, setLocalMute] = useState(!!settings.current.mute);
  const [sens, setSens] = useState(Number.isFinite(settings.current.sens) ? settings.current.sens : 1);
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(() => load(BEST_KEY, null));
  const [noteCard, setNoteCard] = useState(null);
  const [message, setMessage] = useState(null);
  const [lockHint, setLockHint] = useState(false);
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
      } else if (screenRef.current === "play" && gameRef.current?.state === "play") {
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
    setNoteCard(null);
    setHowto(false);
    setMessage({ id: Date.now(), text: "Find the eight notes. Then find the way out.", long: true });
    setScreen("play");
    requestLock();
  }, [clearTimers, requestLock, setScreen]);
  const toMenu = useCallback(() => {
    clearTimers();
    releaseLock();
    gameRef.current = null;
    setResult(null);
    setNoteCard(null);
    setMessage(null);
    setHowto(false);
    setScreen("menu");
  }, [clearTimers, releaseLock, setScreen]);
  const pause = useCallback(() => {
    if (screenRef.current !== "play" || gameRef.current?.state !== "play") return;
    setScreen("paused");
    releaseLock();
  }, [releaseLock, setScreen]);
  const resume = useCallback(() => {
    setHowto(false);
    requestLock();
  }, [requestLock]);

  const endRun = useCallback((kind) => {
    const g = gameRef.current;
    if (!g) return;
    const r = { kind, notes: g.collected, time: g.t };
    if (kind === "won") {
      const prev = load(BEST_KEY, null);
      if (!prev || g.t < prev) {
        store(BEST_KEY, g.t);
        setBest(g.t);
        r.newBest = true;
      }
    }
    setResult(r);
    setNoteCard(null);
    setScreen(kind === "won" ? "won" : "over");
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
          audio.play("step", { sprint: e.sprint, breath: g.player.stamina < 30 });
          break;
        case "note":
          audio.play("note");
          setNoteCard({ id: Date.now(), text: e.text, count: e.count });
          break;
        case "gateOpen":
          audio.play("gateOpen");
          later(() => setMessage({ id: Date.now(), text: "All eight notes taken. Far to the north, a gate groans open…", long: true }), 3200);
          break;
        case "gateLocked":
          audio.play("gateLocked");
          setMessage({ id: Date.now(), text: `The gate is chained shut. ${8 - e.count} note${8 - e.count === 1 ? "" : "s"} remain.` });
          break;
        case "sting":
        case "chase":
        case "panic":
        case "vanish":
        case "light":
          audio.play(e.type);
          break;
        case "caught":
          audio.play("caught");
          later(() => endRun("over"), 1700);
          break;
        case "win":
          audio.play("win");
          later(() => endRun("won"), 900);
          break;
        default:
          break;
      }
    }
  }, [endRun, later]);

  /* ------------------------------------------------------------ HUD (refs) */
  const drawHud = useCallback((g) => {
    const h = hud.current;
    if (!h.stamina) return;
    const P = g?.player;
    const play = screenRef.current === "play" && g;
    if (play) {
      const st = P.stamina;
      h.staminaWrap.style.opacity = st > 99.5 ? "0" : "1";
      h.stamina.style.transform = `scaleX(${(st / 100).toFixed(3)})`;
      h.stamina.classList.toggle("is-tired", P.exhausted);
      const prompt = g.aim >= 0 ? "[E]  Take the note" : g.nearGate && !g.gateOpen ? "[E]  Examine the gate" : "";
      if (h.promptText !== prompt) {
        h.prompt.textContent = prompt;
        h.promptText = prompt;
        h.prompt.style.opacity = prompt ? "1" : "0";
      }
      const cnt = `${g.collected} / 8`;
      if (h.countText !== cnt) {
        h.count.textContent = cnt;
        h.countText = cnt;
      }
      h.objective.textContent = g.gateOpen ? "Reach the exit gate — north" : "";
      h.light.classList.toggle("is-off", !P.light || P.lightCut > 0);
    }
    // static + vignette from fear and proximity
    const M = g?.monster;
    const near = M && M.mode !== "hidden" ? Math.max(0, 1 - M.dist / 18) : 0;
    const caught = g?.state === "caught";
    const s = caught ? Math.min(0.24, 0.08 + g.endT * 0.2) : Math.min(0.24, (g ? g.fear / 100 : 0) * 0.13 + near * near * 0.2);
    h.staticOn = s > 0.01;
    h.static.style.opacity = s.toFixed(3);
    h.vignette.style.opacity = (0.55 + (g ? g.fear / 100 : 0) * 0.4).toFixed(3);
    h.red.style.opacity = caught ? Math.min(0.55, g.endT * 0.6).toFixed(3) : "0";
    if (h.staticOn) {
      const c = h.static, x = h.staticCtx;
      const img = h.staticImg;
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      c.style.transform = `translate(${(Math.random() * 6) | 0}px, ${(Math.random() * 6) | 0}px)`;
    }
  }, []);

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const stage = stageRef.current;
    if (TEST) stage.dataset.preserve = "1";
    let world;
    try {
      world = createWorld(stage);
    } catch (err) {
      console.error("Whispering Woods: WebGL unavailable", err);
      return undefined;
    }
    worldRef.current = world;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      world.resize(Math.round(r.width), Math.round(r.height));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    fit();
    // static canvas
    const sc = hud.current.static;
    if (sc) {
      hud.current.staticCtx = sc.getContext("2d");
      hud.current.staticImg = hud.current.staticCtx.createImageData(sc.width, sc.height);
    }
    let raf = 0, last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); // rAF time can precede `last`
      last = now;
      frame.current(dt);
    };
    if (!TEST) raf = requestAnimationFrame(loop);
    const tset = timers.current;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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
    if (g) {
      if (scr === "play" && lockedRef.current && g.state === "play") {
        const k = keys.current;
        g.update(dt, {
          f: k.has("KeyW") || k.has("ArrowUp"),
          b: k.has("KeyS") || k.has("ArrowDown"),
          l: k.has("KeyA") || k.has("ArrowLeft"),
          r: k.has("KeyD") || k.has("ArrowRight"),
          sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
        });
      } else if (g.state !== "play") g.update(dt);
      handleEvents(g);
    }
    world.render(scr === "menu" ? null : g, scr === "paused" ? 0 : dt);
    audio.update(g, dt, scr === "play");
    drawHud(g);
  };

  /* ------------------------------------------------------------ input */
  useEffect(() => {
    const down = (e) => {
      const scr = screenRef.current;
      if (scr !== "play") return;
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
      if (e.repeat) return;
      const g = gameRef.current;
      if (!g) return;
      if (e.code === "KeyF") g.toggleLight();
      else if (e.code === "KeyE") g.interact();
      else if (e.code === "KeyM") toggleMute();
      else if (e.code === "Escape" && (TEST || !document.pointerLockElement)) pause();
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
    // no page scrolling from the wheel while the cursor is over the game
    const root = rootRef.current;
    const wheel = (e) => e.preventDefault();
    root?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousemove", move);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
      root?.removeEventListener("wheel", wheel);
    };
    // toggleMute is stable via ref below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pause]);

  /* ------------------------------------------------------------ sound */
  const toggleMuteRef = useRef(() => {});
  toggleMuteRef.current = () => {
    setLocalMute((m) => {
      settings.current = { ...settings.current, mute: !m };
      store(SETTINGS_KEY, settings.current);
      return !m;
    });
  };
  function toggleMute() {
    toggleMuteRef.current();
  }
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
    if (!noteCard) return undefined;
    const id = setTimeout(() => setNoteCard((c) => (c && c.id === noteCard.id ? null : c)), 4200);
    return () => clearTimeout(id);
  }, [noteCard]);
  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(() => setMessage((m) => (m && m.id === message.id ? null : m)), message.long ? 5200 : 2800);
    return () => clearTimeout(id);
  }, [message]);

  /* ------------------------------------------------------------ test hook */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__ww = {
      game: () => gameRef.current,
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
      delete window.__ww;
    };
  }, [startGame, toMenu, pause, resume, releaseLock, requestLock]);

  const effMuted = muted || localMute;
  const inRun = screen === "play" || screen === "paused";

  return (
    <div
      ref={rootRef}
      className={`ww ww--${screen}`}
      onClick={(e) => {
        if (e.target.closest?.("button, input, label")) return;
        if (screenRef.current === "play" && !lockedRef.current && gameRef.current?.state === "play") requestLock();
      }}
    >
      <div ref={stageRef} className="ww-stage" />

      {/* atmosphere overlays */}
      <div ref={(el) => (hud.current.vignette = el)} className="ww-vignette" />
      <canvas ref={(el) => (hud.current.static = el)} className="ww-static" width={320} height={180} />
      <div ref={(el) => (hud.current.red = el)} className="ww-red" />

      {/* HUD */}
      <div className={`ww-hud${inRun ? "" : " is-hidden"}`} aria-hidden={!inRun}>
        <div className="ww-hud__count">
          <NoteIcon />
          <span ref={(el) => (hud.current.count = el)}>0 / 8</span>
          <span ref={(el) => (hud.current.light = el)} className="ww-hud__light" title="Flashlight (F)">
            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 3h10l-2 6H9L7 3ZM9 9v11h6V9" /></svg>
          </span>
        </div>
        <div ref={(el) => (hud.current.objective = el)} className="ww-hud__objective" />
        <div className="ww-hud__dot" />
        <div ref={(el) => (hud.current.prompt = el)} className="ww-hud__prompt" />
        <div ref={(el) => (hud.current.staminaWrap = el)} className="ww-hud__stamina">
          <div ref={(el) => (hud.current.stamina = el)} className="ww-hud__stamina-fill" />
        </div>
        {noteCard && (
          <div key={noteCard.id} className="ww-notecard">
            <div className="ww-notecard__count">Note {noteCard.count} of 8</div>
            <div className="ww-notecard__text">“{noteCard.text}”</div>
          </div>
        )}
        {message && <div key={message.id} className="ww-message">{message.text}</div>}
      </div>

      {/* screens */}
      {screen === "menu" && !howto && (
        <div className="ww-screen ww-menu">
          <div className="ww-menu__title">
            <div className="ww-menu__eyebrow">Horror · Survival</div>
            <h1>Whispering Woods</h1>
            <div className="ww-menu__sub">The Eight Notes</div>
            <p className="ww-menu__tag">Eight Notes. One Forest. No Escape.</p>
          </div>
          <div className="ww-menu__actions">
            <button type="button" className="ww-btn ww-btn--primary" onClick={startGame}>Enter the Woods</button>
            <button type="button" className="ww-btn" onClick={() => setHowto(true)}>How to Play</button>
            <button type="button" className="ww-btn ww-btn--ghost" onClick={toggleMute}>Sound: {effMuted ? "Off" : "On"}</button>
          </div>
          <div className="ww-menu__foot">
            {best ? <span>Best escape: {fmt(best)}</span> : <span>Headphones recommended</span>}
            {TOUCH && <span className="ww-warn">Needs a keyboard and mouse.</span>}
          </div>
        </div>
      )}

      {screen === "paused" && !howto && (
        <div className="ww-screen ww-pause">
          <div className="ww-panel">
            <h2>Paused</h2>
            <p className="ww-dim">{gameRef.current ? `${gameRef.current.collected} / 8 notes · ${fmt(gameRef.current.t)}` : ""}</p>
            <button type="button" className="ww-btn ww-btn--primary" onClick={resume}>Resume</button>
            {lockHint && <p className="ww-dim ww-small">Click Resume again to capture the mouse.</p>}
            <button type="button" className="ww-btn" onClick={startGame}>Restart</button>
            <button type="button" className="ww-btn" onClick={() => setHowto(true)}>How to Play</button>
            <button type="button" className="ww-btn ww-btn--ghost" onClick={toggleMute}>Sound: {effMuted ? "Off" : "On"}</button>
            <label className="ww-slider">
              <span>Mouse sensitivity</span>
              <input type="range" min="0.3" max="2.5" step="0.05" value={sens} onChange={(e) => changeSens(Number(e.target.value))} />
            </label>
            <button type="button" className="ww-btn ww-btn--ghost" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}

      {howto && (
        <div className="ww-screen">
          <HowTo onBack={() => setHowto(false)} />
        </div>
      )}

      {screen === "play" && !locked && gameRef.current?.state === "play" && (
        <div className="ww-clickhint">Click to look around</div>
      )}

      {screen === "over" && result && (
        <div className="ww-screen ww-end ww-end--over">
          <div className="ww-panel">
            <h2>It Found You</h2>
            <p className="ww-end__stats">{result.notes} / 8 notes · survived {fmt(result.time)}</p>
            <p className="ww-dim">{result.notes >= 6 ? "So close. The gate was almost open." : result.notes >= 3 ? "It grows bolder with every note. Keep moving." : "Don't hold its gaze. Break its line of sight."}</p>
            <button type="button" className="ww-btn ww-btn--primary" onClick={startGame}>Play Again</button>
            <button type="button" className="ww-btn ww-btn--ghost" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}

      {screen === "won" && result && (
        <div className="ww-screen ww-end ww-end--won">
          <div className="ww-panel">
            <h2>You Escaped</h2>
            <p className="ww-end__stats">All 8 notes · {fmt(result.time)}{result.newBest ? " · new best" : best ? ` · best ${fmt(best)}` : ""}</p>
            <p className="ww-dim">The gate clangs shut behind you. Somewhere in the trees, something is still watching.</p>
            <button type="button" className="ww-btn ww-btn--primary" onClick={startGame}>Play Again</button>
            <button type="button" className="ww-btn ww-btn--ghost" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
