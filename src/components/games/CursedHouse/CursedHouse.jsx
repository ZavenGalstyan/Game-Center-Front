/**
 * The Cursed House: Escape — first-person horror escape.
 *
 * One requestAnimationFrame loop steps the simulation (sim.js) and draws it
 * with plain Three.js (world.js); audio is procedural WebAudio (audio.js).
 * React renders menus and overlays; the fast HUD (stamina, prompt, the
 * awareness eye, room name) is written straight to DOM refs so walking
 * never re-renders React.
 *
 * Controls: WASD move · mouse look (Pointer Lock) · Shift sprint ·
 * Ctrl or C crouch (toggle) · E interact / hide · F flashlight · M mute ·
 * Esc pause. `restartSignal` (the Game Center Restart button) starts a
 * fresh run; `muted` silences audio.
 * DEV hook: `?chtest=1` fakes pointer lock, disables rAF and exposes
 * window.__ch (see tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./CursedHouse.css";
import { createGame, roomAt, LAYOUT } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { BEST_KEY, SETTINGS_KEY, KEY_NAMES, ROOMS, LIVES, HIDES } from "./data.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("chtest");
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);
const LOCK_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyE", "KeyF", "ControlLeft", "ControlRight"];

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

function KeyIcon({ filled, tint }) {
  return (
    <svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true">
      <g fill="none" stroke={filled ? tint : "currentColor"} strokeWidth="2.2" strokeLinecap="round" opacity={filled ? 1 : 0.35}>
        <circle cx="9" cy="16" r="5.5" fill={filled ? `${tint}33` : "none"} />
        <path d="M14.5 16H28M23 16v4M26.5 16v3" />
      </g>
    </svg>
  );
}
function CandleIcon({ lit }) {
  return (
    <svg viewBox="0 0 24 32" width="0.8em" height="1.05em" aria-hidden="true">
      {lit && <path d="M12 3c2.6 3.4 3 5.6 0 8.6C9 8.6 9.4 6.4 12 3z" fill="#ffc46b" />}
      <rect x="8" y="12" width="8" height="16" rx="1.5" fill={lit ? "#d9cfb0" : "#4a4640"} />
      <path d="M12 12v-1.5" stroke="#222" strokeWidth="1.4" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 48 24" width="2.2em" height="1.1em" aria-hidden="true">
      <path d="M2 12C10 2 38 2 46 12 38 22 10 22 2 12z" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="24" cy="12" r="5.5" fill="currentColor" />
    </svg>
  );
}
const KEY_TINTS = ["#d2a64e", "#a9a9ae", "#e6e6ee"];

function HowTo({ onBack }) {
  return (
    <div className="ch-panel ch-howto" role="dialog" aria-label="How to play">
      <h2>How to Play</h2>
      <div className="ch-howto__cols">
        <section>
          <h3>Escape</h3>
          <p>You wake in an upstairs bedroom of the old Hollow house. The front door is held by <b>three locks</b>. Three keys are hidden around the house — <b>one on the ground floor, one in the basement, one upstairs</b>. Some are tucked inside things: search fridges, drawers and boxes. Find all three, unlock the front door and get out.</p>
          <h3>Old Mrs. Hollow</h3>
          <ul>
            <li>She wanders the house with her lantern and opens any door you close.</li>
            <li>She <b>hears</b> running, doors, drawers and rattling locks — even through floors. Walk or crouch to stay quiet.</li>
            <li>She <b>sees</b> only what is in front of her and never through walls. A lit flashlight carries further; crouching keeps you lower.</li>
            <li>When she spots you she shrieks — that is your moment to run. Break her line of sight and hide.</li>
          </ul>
          <h3>Hiding</h3>
          <p>Two <b>wardrobes</b> and two <b>beds</b> can hide you. If she <b>does not see you</b> get in, she loses you. If she watches you climb in, she will drag you out. Press <b>E</b> again to leave.</p>
          <p className="ch-dim">She can catch you three times. Each time you wake back in the bedroom — keys kept.</p>
        </section>
        <section>
          <h3>Controls</h3>
          <dl className="ch-keys">
            <dt>W A S D</dt><dd>Move</dd>
            <dt>Mouse</dt><dd>Look around</dd>
            <dt>Shift</dt><dd>Sprint (noisy, uses stamina)</dd>
            <dt>C / Ctrl</dt><dd>Crouch on / off (silent)</dd>
            <dt>E</dt><dd>Open · search · take · hide</dd>
            <dt>F</dt><dd>Flashlight on / off</dd>
            <dt>M</dt><dd>Mute sound</dd>
            <dt>Esc</dt><dd>Pause</dd>
          </dl>
          <p className="ch-dim">Tip: use <b>C</b> for crouch — in a windowed browser Ctrl+W can close the tab. In fullscreen Ctrl is safe. Headphones recommended.</p>
        </section>
      </div>
      <button type="button" className="ch-btn ch-btn--primary" onClick={onBack}>Back</button>
    </div>
  );
}

export default function CursedHouse({ restartSignal = 0, muted = false }) {
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
  const [inv, setInv] = useState({ keys: 0, lives: LIVES });
  const [message, setMessage] = useState(null);
  const [scare, setScare] = useState(null); // { lives } while the capture plays out
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
  const say = useCallback((text, long = false) => setMessage({ id: Date.now() + Math.random(), text, long }), []);

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

  /* ------------------------------------------------------------ fullscreen: capture Ctrl/WASD so Ctrl+W can't close the tab */
  useEffect(() => {
    const kb = typeof navigator !== "undefined" ? navigator.keyboard : null;
    if (!kb?.lock) return undefined;
    const onFs = () => {
      const fs = document.fullscreenElement;
      try {
        if (fs && rootRef.current && fs.contains(rootRef.current)) kb.lock(LOCK_KEYS).catch(() => {});
        else kb.unlock();
      } catch {
        /* unsupported */
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      try {
        kb.unlock();
      } catch {
        /* ignore */
      }
    };
  }, []);

  /* ------------------------------------------------------------ flow */
  const syncInv = useCallback(() => {
    const g = gameRef.current;
    if (g) setInv({ keys: g.keys.length, lives: g.lives });
  }, []);
  const startGame = useCallback(() => {
    clearTimers();
    audio.unlock();
    gameRef.current = createGame();
    keys.current.clear();
    hud.current.room = null;
    hud.current.seenRooms = new Set();
    setResult(null);
    setScare(null);
    setHowto(false);
    setInv({ keys: 0, lives: LIVES });
    say("Find the three keys. Unlock the front door. Stay quiet.", true);
    setScreen("play");
    requestLock();
  }, [clearTimers, requestLock, say, setScreen]);
  const toMenu = useCallback(() => {
    clearTimers();
    releaseLock();
    gameRef.current = null;
    setResult(null);
    setScare(null);
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

  const endRun = useCallback((kind) => {
    const g = gameRef.current;
    if (!g) return;
    const r = { kind, keys: g.keys.length, time: g.t, captures: g.captures };
    if (kind === "won") {
      const prev = load(BEST_KEY, null);
      if (!prev || g.t < prev) {
        store(BEST_KEY, g.t);
        setBest(g.t);
        r.newBest = true;
      }
    }
    setResult(r);
    setScare(null);
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
          audio.play("step", { ...e, breath: g.player.stamina < 30 });
          break;
        case "enemyStep":
        case "hum":
        case "inspect":
          audio.play(e.type, e, g);
          break;
        case "door":
          audio.play("door", e, g);
          break;
        case "doorHandle": {
          const d = LAYOUT.doors[e.id];
          audio.play("doorHandle", { x: d.cx, y: d.y0, z: d.cz }, g);
          break;
        }
        case "locked":
          audio.play("locked");
          say(e.count ? `Locked. ${3 - e.count} more key${3 - e.count === 1 ? "" : "s"} to find… and she heard that.` : "The front door is locked three times over. The rattle echoes through the house…");
          break;
        case "unlock":
          audio.play("unlock");
          say("The last lock gives way. RUN!", true);
          break;
        case "key":
          audio.play("key");
          say(`${KEY_NAMES[g.keySpots.findIndex((s) => s.id === e.id)] || "A key"} — ${e.count} of 3`);
          syncInv();
          if (e.count === 3) later(() => say("All three keys. Get to the front door.", true), 2600);
          break;
        case "container":
          audio.play("container", e);
          if (e.found) say("Something glints inside…");
          else if (e.empty) say("Nothing useful in here.");
          break;
        case "hide":
          audio.play("hide", e);
          break;
        case "unhide":
          audio.play("hide", e);
          break;
        case "spotted":
          audio.play("spotted");
          hud.current.pulse = 1;
          break;
        case "lost":
          audio.play("lost");
          say("She has lost your trail… for now.");
          break;
        case "blocked":
          audio.play("blocked");
          say("Something is in the way.");
          break;
        case "light":
        case "crouch":
          audio.play("light");
          break;
        case "caught":
          audio.play("caught");
          setScare({ lives: e.lives, id: Date.now() });
          break;
        case "respawned":
          audio.play("respawn");
          setScare(null);
          syncInv();
          say(`You wake up back in the bedroom. ${e.lives} chance${e.lives === 1 ? "" : "s"} left.`, true);
          break;
        case "gameover":
          audio.play("gameover");
          syncInv();
          later(() => endRun("over"), 900);
          break;
        case "win":
          audio.play("win");
          later(() => endRun("won"), 1100);
          break;
        default:
          break;
      }
    }
  }, [endRun, later, say, syncInv]);

  /* ------------------------------------------------------------ HUD (refs) */
  const drawHud = useCallback((g, dt) => {
    const h = hud.current;
    if (!h.stamina) return;
    const play = screenRef.current === "play" && g;
    if (!play) return;
    const P = g.player, E = g.enemy;
    const st = P.stamina;
    h.staminaWrap.style.opacity = st > 99.5 ? "0" : "1";
    h.stamina.style.transform = `scaleX(${(st / 100).toFixed(3)})`;
    h.stamina.classList.toggle("is-tired", P.exhausted);
    const prompt = g.state === "play" ? g.describeAim() : "";
    if (h.promptText !== prompt) {
      h.prompt.textContent = prompt;
      h.promptText = prompt;
      h.prompt.style.opacity = prompt ? "1" : "0";
    }
    // the eye: how aware she is of you
    const chase = E.mode === "chase" || E.mode === "alert" || E.mode === "pull";
    h.pulse = Math.max(0, (h.pulse || 0) - dt * 1.5);
    const aw = E.disabled ? 0 : chase ? 1 : Math.min(1, E.awareness * 1.2);
    h.eye.style.opacity = (aw < 0.05 ? 0 : 0.25 + aw * 0.75).toFixed(2);
    h.eye.classList.toggle("is-hunting", chase);
    h.root.classList.toggle("is-chased", chase);
    h.root.classList.toggle("is-hidden", !!P.hidden);
    h.root.classList.toggle("is-respawn", g.state === "respawn");
    h.root.classList.toggle("is-won", g.state === "won");
    h.crouch.classList.toggle("is-on", P.crouch);
    h.light.classList.toggle("is-on", P.light);
    const hidden = P.hidden ? `Hidden ${HIDES[P.hidden].kind === "bed" ? "under the " + HIDES[P.hidden].name : "in the wardrobe"} — hold still.` : "";
    if (h.hiddenText !== hidden) {
      h.hidden.textContent = hidden;
      h.hiddenText = hidden;
    }
    // room name the first time you step into a room
    const room = P.hidden ? h.room : roomAt(P.x, P.y, P.z);
    if (room && room !== h.room) {
      h.room = room;
      if (!h.seenRooms) h.seenRooms = new Set();
      if (!h.seenRooms.has(room) && ROOMS[room] && room !== "porch") {
        h.seenRooms.add(room);
        h.roomEl.textContent = ROOMS[room].name;
        h.roomEl.classList.remove("is-show");
        void h.roomEl.offsetWidth;
        h.roomEl.classList.add("is-show");
      }
    }
    // fear vignette
    const near = E.disabled ? 0 : Math.max(0, 1 - E.dist / 8);
    h.vignette.style.opacity = (0.6 + (chase ? 0.3 : near * 0.25) + h.pulse * 0.2).toFixed(3);
  }, []);

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const stage = stageRef.current;
    if (TEST) stage.dataset.preserve = "1";
    let world;
    try {
      world = createWorld(stage);
    } catch (err) {
      console.error("The Cursed House: WebGL unavailable", err);
      hud.current.noGL = true;
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
    if (g && scr === "play") {
      if (g.state === "play") {
        if (lockedRef.current) {
          const k = keys.current;
          g.update(dt, {
            f: k.has("KeyW") || k.has("ArrowUp"),
            b: k.has("KeyS") || k.has("ArrowDown"),
            l: k.has("KeyA") || k.has("ArrowLeft"),
            r: k.has("KeyD") || k.has("ArrowRight"),
            sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
          });
        }
      } else g.update(dt);
      handleEvents(g);
    }
    const drawn = scr === "menu" ? null : g;
    world.render(drawn, scr === "play" ? dt : 0);
    audio.update(g, dt, scr === "play");
    drawHud(g, dt);
  };

  /* ------------------------------------------------------------ input */
  useEffect(() => {
    const down = (e) => {
      if (screenRef.current !== "play") return;
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
      if (e.repeat) return;
      const g = gameRef.current;
      if (!g) return;
      if (e.code === "KeyF") g.toggleLight();
      else if (e.code === "KeyE") g.interact();
      else if (e.code === "KeyC" || e.code === "ControlLeft" || e.code === "ControlRight") {
        e.preventDefault();
        g.toggleCrouch();
      } else if (e.code === "KeyM") toggleMuteRef.current();
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
  const toggleMuteRef = useRef(() => {});
  toggleMuteRef.current = () => {
    setLocalMute((m) => {
      settings.current = { ...settings.current, mute: !m };
      store(SETTINGS_KEY, settings.current);
      return !m;
    });
  };
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
    const id = setTimeout(() => setMessage((m) => (m && m.id === message.id ? null : m)), message.long ? 5200 : 3200);
    return () => clearTimeout(id);
  }, [message]);

  /* ------------------------------------------------------------ test hook */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__ch = {
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
      delete window.__ch;
    };
  }, [startGame, toMenu, pause, resume, releaseLock, requestLock]);

  const effMuted = muted || localMute;
  const inRun = screen === "play" || screen === "paused";

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        hud.current.root = el;
      }}
      className={`ch ch--${screen}`}
      onClick={(e) => {
        if (e.target.closest?.("button, input, label")) return;
        if (screenRef.current === "play" && !lockedRef.current) requestLock();
      }}
    >
      <div ref={stageRef} className="ch-stage" />

      {/* atmosphere overlays */}
      <div ref={(el) => (hud.current.vignette = el)} className="ch-vignette" />
      <div className="ch-hidebars" />
      <div className="ch-fade" />
      {scare && <div key={scare.id} className="ch-scare" />}

      {/* HUD */}
      <div className={`ch-hud${inRun ? "" : " is-hidden"}`} aria-hidden={!inRun}>
        <div className="ch-hud__keys" title="Keys">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`ch-hud__key${inv.keys > i ? " is-have" : ""}`}>
              <KeyIcon filled={inv.keys > i} tint={KEY_TINTS[i]} />
            </span>
          ))}
        </div>
        <div className="ch-hud__lives" title="Chances">
          {Array.from({ length: LIVES }, (_, i) => (
            <CandleIcon key={i} lit={inv.lives > i} />
          ))}
        </div>
        <div ref={(el) => (hud.current.eye = el)} className="ch-hud__eye" title="She knows you are here">
          <EyeIcon />
        </div>
        <div ref={(el) => (hud.current.roomEl = el)} className="ch-hud__room" />
        <div className="ch-hud__dot" />
        <div ref={(el) => (hud.current.prompt = el)} className="ch-hud__prompt" />
        <div ref={(el) => (hud.current.hidden = el)} className="ch-hud__hidden" />
        <div className="ch-hud__status">
          <span ref={(el) => (hud.current.crouch = el)} className="ch-hud__chip">Crouching</span>
          <span ref={(el) => (hud.current.light = el)} className="ch-hud__chip ch-hud__chip--light">Flashlight off</span>
        </div>
        <div ref={(el) => (hud.current.staminaWrap = el)} className="ch-hud__stamina">
          <div ref={(el) => (hud.current.stamina = el)} className="ch-hud__stamina-fill" />
        </div>
        {message && <div key={message.id} className={`ch-message${message.long ? " is-long" : ""}`}>{message.text}</div>}
        {scare && <div key={`t${scare.id}`} className="ch-scare__text">{scare.lives > 0 ? `${scare.lives} chance${scare.lives === 1 ? "" : "s"} left` : "No chances left"}</div>}
      </div>

      {/* screens */}
      {screen === "menu" && !howto && (
        <div className="ch-screen ch-menu">
          <div className="ch-menu__title">
            <div className="ch-menu__eyebrow">Horror · Survival · Escape · Stealth</div>
            <h1>The Cursed House</h1>
            <div className="ch-menu__sub">Escape</div>
            <p className="ch-menu__tag">Stay Quiet. Hide Fast. Escape Alive.</p>
          </div>
          <div className="ch-menu__actions">
            <button type="button" className="ch-btn ch-btn--primary" onClick={startGame}>Start</button>
            <button type="button" className="ch-btn" onClick={() => setHowto(true)}>How to Play</button>
            <button type="button" className="ch-btn ch-btn--ghost" onClick={toggleMute}>Sound: {effMuted ? "Off" : "On"}</button>
          </div>
          <div className="ch-menu__foot">
            {best ? <span>Fastest escape: {fmt(best)}</span> : <span>Headphones recommended</span>}
            {TOUCH && <span className="ch-warn">Needs a keyboard and mouse.</span>}
            {hud.current.noGL && <span className="ch-warn">WebGL is unavailable in this browser.</span>}
          </div>
        </div>
      )}

      {screen === "paused" && !howto && (
        <div className="ch-screen ch-pause">
          <div className="ch-panel">
            <h2>Paused</h2>
            <p className="ch-dim">{gameRef.current ? `${gameRef.current.keys.length} / 3 keys · ${gameRef.current.lives} chance${gameRef.current.lives === 1 ? "" : "s"} · ${fmt(gameRef.current.t)}` : ""}</p>
            <button type="button" className="ch-btn ch-btn--primary" onClick={resume}>Resume</button>
            {lockHint && <p className="ch-dim ch-small">Click Resume again to capture the mouse.</p>}
            <button type="button" className="ch-btn" onClick={startGame}>Restart</button>
            <button type="button" className="ch-btn" onClick={() => setHowto(true)}>How to Play</button>
            <button type="button" className="ch-btn ch-btn--ghost" onClick={toggleMute}>Sound: {effMuted ? "Off" : "On"}</button>
            <label className="ch-slider">
              <span>Mouse sensitivity</span>
              <input type="range" min="0.3" max="2.5" step="0.05" value={sens} onChange={(e) => changeSens(Number(e.target.value))} />
            </label>
            <button type="button" className="ch-btn ch-btn--ghost" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}

      {howto && (
        <div className="ch-screen">
          <HowTo onBack={() => setHowto(false)} />
        </div>
      )}

      {screen === "play" && !locked && (
        <div className="ch-clickhint">Click to look around</div>
      )}

      {screen === "over" && result && (
        <div className="ch-screen ch-end ch-end--over">
          <div className="ch-panel">
            <h2>Game Over</h2>
            <p className="ch-end__stats">{result.keys} / 3 keys · {fmt(result.time)} in the house</p>
            <p className="ch-dim">{result.keys >= 2 ? "So close. The front door was nearly open." : "Walk, don't run. Close doors behind you. Hide where she can't see you get in."}</p>
            <button type="button" className="ch-btn ch-btn--primary" onClick={startGame}>Try Again</button>
            <button type="button" className="ch-btn ch-btn--ghost" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}

      {screen === "won" && result && (
        <div className="ch-screen ch-end ch-end--won">
          <div className="ch-panel">
            <h2>You Escaped</h2>
            <p className="ch-end__stats">{fmt(result.time)} · caught {result.captures} time{result.captures === 1 ? "" : "s"}{result.newBest ? " · new best" : best ? ` · best ${fmt(best)}` : ""}</p>
            <p className="ch-dim">The door slams behind you. Through the little barred window, a lantern sways in the hall… then goes out.</p>
            <button type="button" className="ch-btn ch-btn--primary" onClick={startGame}>Play Again</button>
            <button type="button" className="ch-btn ch-btn--ghost" onClick={toMenu}>Main Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
