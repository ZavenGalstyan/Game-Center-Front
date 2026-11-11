/**
 * Portal Shift: Dimension Escape — first-person portal puzzle escape rooms.
 *
 * One requestAnimationFrame loop steps the simulation (engine/sim.js) in
 * ≤1/60 s slices and draws it with plain Three.js (render/world.js); audio is
 * procedural WebAudio (audio.js). React renders only menus, overlays and a
 * HUD that changes on events (prompts, timers, toasts) — walking and looking
 * never re-render React.
 *
 * All visible text is English source text: the Game Center's runtime
 * translator (i18n/gameTranslator.js + i18n/games/PortalShift.json) swaps it
 * for Russian in place when the site language is Russian, and back again.
 *
 * Controls: WASD move · mouse look (Pointer Lock) · left/right click blue /
 * orange portal · E interact · Space jump · R restart · H hint · Esc pause.
 * `restartSignal` (Game Center Restart) restarts the current chamber; `muted`
 * silences audio. DEV hook: `?pstest=1` fakes pointer lock, disables rAF and
 * exposes window.__ps (see tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./PortalShift.css";
import { createSim } from "./engine/sim.js";
import { getLevel, LEVELS, LEVEL_COUNT } from "./engine/levels.js";
import { SECTORS } from "./engine/constants.js";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { loadProgress, saveProgress, recordCompletion, hasProgress, loadSettings, saveSettings, emptyProgress } from "./progress.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("pstest");
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
const STEP = 1 / 60;

const fmt = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`;
};
const pad2 = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ icons (decorative SVG) */
const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ps-ico">
    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ps-ico">
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Logo = () => (
  <svg viewBox="0 0 120 120" aria-hidden="true" className="ps-logo">
    <defs>
      <radialGradient id="psb" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#bfe3ff" />
        <stop offset="60%" stopColor="#2b8cff" />
        <stop offset="100%" stopColor="#0b2a55" />
      </radialGradient>
      <radialGradient id="pso" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffe2bf" />
        <stop offset="60%" stopColor="#ff8a1c" />
        <stop offset="100%" stopColor="#5a2600" />
      </radialGradient>
    </defs>
    <ellipse cx="40" cy="60" rx="20" ry="34" fill="url(#psb)" />
    <ellipse cx="80" cy="60" rx="20" ry="34" fill="url(#pso)" />
    <ellipse cx="40" cy="60" rx="20" ry="34" fill="none" stroke="#9fd2ff" strokeWidth="2.5" />
    <ellipse cx="80" cy="60" rx="20" ry="34" fill="none" stroke="#ffc58a" strokeWidth="2.5" />
    <path d="M30 60h60" stroke="#fff" strokeWidth="3" strokeDasharray="4 6" strokeLinecap="round" />
  </svg>
);

/* ------------------------------------------------------------------ static panels */
function Controls() {
  return (
    <dl className="ps-keys">
      <dt>W A S D</dt>
      <dd>Move</dd>
      <dt>Mouse</dt>
      <dd>Look around</dd>
      <dt>Left click</dt>
      <dd>Open the blue portal</dd>
      <dt>Right click</dt>
      <dd>Open the orange portal</dd>
      <dt>E</dt>
      <dd>Pick up, drop, press buttons</dd>
      <dt>Space</dt>
      <dd>Jump</dd>
      <dt>R</dt>
      <dd>Restart the chamber</dd>
      <dt>H</dt>
      <dd>Show the hint</dd>
      <dt>Esc</dt>
      <dd>Pause and release the mouse</dd>
    </dl>
  );
}

function HowTo({ onBack }) {
  return (
    <div className="ps-panel ps-howto" role="dialog" aria-label="How to Play">
      <h2>How to Play</h2>
      <div className="ps-howto__cols">
        <section>
          <h3>Your goal</h3>
          <p>Each test chamber hides a way out. Reach the glowing exit lift — when its frame turns green, it is unlocked.</p>
          <h3>Portals</h3>
          <ul>
            <li>Portals only open on bright white panels. Dark metal and glass reject them.</li>
            <li>Walk into one portal and you step out of the other, facing out of its wall.</li>
            <li>Speed is kept: fall into a floor portal from high up and you fly out of the other one.</li>
            <li>Beams and cubes pass through portals too.</li>
          </ul>
          <h3>Devices</h3>
          <ul>
            <li>Energy cubes hold pressure plates down and help you climb ledges.</li>
            <li>Reflector cubes turn a beam the way you face when you drop them.</li>
            <li>Receivers light up when a beam hits them. Coloured lights above a door show which devices it needs.</li>
            <li>Timed buttons only work for a few seconds — prepare your portals first.</li>
            <li>The glowing liquid is deadly. You return to the last checkpoint.</li>
          </ul>
        </section>
        <section>
          <h3>Controls</h3>
          <Controls />
          <p className="ps-dim">Click the view to capture the mouse. A keyboard and mouse are required.</p>
        </section>
      </div>
      <button type="button" className="ps-btn ps-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function Settings({ settings, onChange, onBack, onReset }) {
  return (
    <div className="ps-panel ps-settings" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <label className="ps-field">
        <span>Mouse sensitivity</span>
        <input type="range" min="0.2" max="3" step="0.05" value={settings.sens} aria-label="Mouse sensitivity" onChange={(e) => onChange({ sens: Number(e.target.value) })} />
        <output>{settings.sens.toFixed(2)}</output>
      </label>
      <label className="ps-field">
        <span>Field of view</span>
        <input type="range" min="60" max="100" step="1" value={settings.fov} aria-label="Field of view" onChange={(e) => onChange({ fov: Number(e.target.value) })} />
        <output>{settings.fov}°</output>
      </label>
      <label className="ps-field">
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} aria-label="Volume" onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        <output>{Math.round(settings.volume * 100)}%</output>
      </label>
      <div className="ps-field">
        <span>Invert vertical look</span>
        <button type="button" className={`ps-toggle${settings.invertY ? " is-on" : ""}`} aria-pressed={settings.invertY} onClick={() => onChange({ invertY: !settings.invertY })}>
          {settings.invertY ? "On" : "Off"}
        </button>
      </div>
      <div className="ps-field">
        <span>Sound</span>
        <button type="button" className={`ps-toggle${!settings.mute ? " is-on" : ""}`} aria-pressed={!settings.mute} onClick={() => onChange({ mute: !settings.mute })}>
          {settings.mute ? "Off" : "On"}
        </button>
      </div>
      <div className="ps-field">
        <span>Portal view</span>
        <div className="ps-seg" role="group" aria-label="Portal view">
          <button type="button" className={settings.quality === "high" ? "is-on" : ""} aria-pressed={settings.quality === "high"} onClick={() => onChange({ quality: "high" })} title="See through portals into the other side">
            See-through
          </button>
          <button type="button" className={settings.quality === "low" ? "is-on" : ""} aria-pressed={settings.quality === "low"} onClick={() => onChange({ quality: "low" })} title="Faster: portals show an energy surface">
            Fast
          </button>
        </div>
      </div>
      <div className="ps-settings__foot">
        {onReset && (
          <button type="button" className="ps-btn ps-btn--danger" onClick={onReset}>
            Reset progress
          </button>
        )}
        <button type="button" className="ps-btn ps-btn--primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function Confirm({ title, text, yes, no, onYes, onNo }) {
  return (
    <div className="ps-screen ps-screen--dim">
      <div className="ps-panel ps-confirm" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="ps-row">
          <button type="button" className="ps-btn ps-btn--danger" onClick={onYes}>
            {yes}
          </button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={onNo}>
            {no}
          </button>
        </div>
      </div>
    </div>
  );
}

function LevelSelect({ progress, onPlay, onBack }) {
  return (
    <div className="ps-panel ps-levels" role="dialog" aria-label="Level Select">
      <div className="ps-levels__head">
        <h2>Level Select</h2>
        <span className="ps-dim">{`${Object.keys(progress.done).length} / ${LEVEL_COUNT} chambers complete`}</span>
      </div>
      <div className="ps-levels__scroll">
        {SECTORS.map((sec) => (
          <section key={sec.id} className="ps-sector" style={{ "--acc": `#${sec.accent.toString(16).padStart(6, "0")}` }}>
            <h3>
              <span className="ps-sector__no">{sec.id + 1}</span>
              {sec.name}
            </h3>
            <div className="ps-levels__grid">
              {LEVELS.filter((l) => l.sector === sec.id).map((l) => {
                const locked = l.id > progress.unlocked;
                const done = progress.done[l.id];
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`ps-lvl${locked ? " is-locked" : ""}${done ? " is-done" : ""}`}
                    disabled={locked}
                    onClick={() => onPlay(l.id)}
                    aria-label={locked ? `Chamber ${l.id}, locked` : `Chamber ${l.id}: ${l.name}`}
                  >
                    <span className="ps-lvl__no">{pad2(l.id)}</span>
                    <span className="ps-lvl__name">{locked ? "Locked" : l.name}</span>
                    <span className="ps-lvl__meta">
                      {locked ? <LockIcon /> : done ? (
                        <>
                          <CheckIcon /> {fmt(done.time)}
                        </>
                      ) : (
                        "New"
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <button type="button" className="ps-btn ps-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ main */
export default function PortalShift({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const flashRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const menuSimRef = useRef(null);
  const keys = useRef(new Set());
  const look = useRef({ x: 0, y: 0 });
  const queued = useRef({ fire: null, use: false, jump: false });
  const lockedRef = useRef(false);
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const levelRef = useRef(1);
  const frame = useRef(() => {});
  const timers = useRef(new Set());
  const hudRef = useRef({ prompt: "", timer: "", hasBlue: false, hasOrange: false, exitOpen: false });
  const settingsRef = useRef(loadSettings());
  const dipRef = useRef(0);

  const [screen, setScreenState] = useState("menu"); // menu | levels | howto | settings | loading | play
  const [overlay, setOverlayState] = useState(null); // null | paused | complete | final | confirmLeave | confirmReset | howto | settings | hint
  const [settings, setSettings] = useState(settingsRef.current);
  const [progress, setProgress] = useState(loadProgress);
  const [level, setLevel] = useState(1);
  const [locked, setLocked] = useState(false);
  const [lockHint, setLockHint] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [hud, setHud] = useState(hudRef.current);
  const [toasts, setToasts] = useState([]);
  const [intro, setIntro] = useState(null);
  const [result, setResult] = useState(null);
  const [returnTo, setReturnTo] = useState("menu");

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
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
  const toast = useCallback(
    (text, kind = "") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, text, kind }]);
      later(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "long" ? 5200 : 2800);
    },
    [later],
  );
  const flash = useCallback((cls) => {
    const el = flashRef.current;
    if (!el) return;
    el.className = "ps-flash";
    void el.offsetWidth;
    el.className = `ps-flash is-${cls}`;
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST) {
      lockedRef.current = true;
      setLocked(true);
      if (overlayRef.current === "paused") setOverlay(null);
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
  }, [setOverlay]);
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
        if (overlayRef.current === "paused") setOverlay(null);
      } else if (screenRef.current === "play" && !overlayRef.current) {
        setOverlay("paused");
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
  }, [setOverlay]);

  const progressRef = useRef(progress);
  progressRef.current = progress;

  /* ------------------------------------------------------------ flow */
  const showMenuScene = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const L = getLevel(3);
    const s = createSim(L);
    s.setPortal("blue", [0, 1, 6], "px");
    s.setPortal("orange", [6, 1, 6], "nx");
    s.player.pos = [7, 2, 23.5];
    s.yaw = 0;
    s.pitch = -0.04;
    menuSimRef.current = s;
    world.setLevel(L);
  }, []);

  const startLevel = useCallback(
    (id) => {
      const world = worldRef.current;
      if (!world) return;
      clearTimers();
      audio.unlock();
      const L = getLevel(id);
      levelRef.current = id;
      setLevel(id);
      setResult(null);
      setToasts([]);
      setOverlay(null);
      keys.current.clear();
      look.current = { x: 0, y: 0 };
      queued.current = { fire: null, use: false, jump: false };
      setScreen("loading");
      requestLock();
      const begin = () => {
        world.setLevel(L);
        simRef.current = createSim(L);
        hudRef.current = { prompt: "", timer: "", hasBlue: !!simRef.current.portals.blue, hasOrange: !!simRef.current.portals.orange, exitOpen: simRef.current.exitOpen() };
        setHud(hudRef.current);
        setScreen("play");
        setIntro({ id, key: Date.now() });
        later(() => setIntro(null), 4200);
        if (L.tip) later(() => toast(L.tip, "long"), 900);
        const next = { ...progressRef.current, last: id };
        progressRef.current = next;
        setProgress(next);
        saveProgress(next);
      };
      if (TEST) begin();
      else later(begin, 380);
    },
    [clearTimers, later, requestLock, setOverlay, setScreen, toast],
  );
  const restartLevel = useCallback(() => {
    if (screenRef.current !== "play") return;
    const L = getLevel(levelRef.current);
    simRef.current = createSim(L);
    setOverlay(null);
    setToasts([]);
    keys.current.clear();
    flash("restart");
    audio.play("respawn");
    requestLock();
  }, [flash, requestLock, setOverlay]);

  const toMenu = useCallback(() => {
    clearTimers();
    releaseLock();
    simRef.current = null;
    setOverlay(null);
    setIntro(null);
    setToasts([]);
    setScreen("menu");
    showMenuScene();
  }, [clearTimers, releaseLock, setOverlay, setScreen, showMenuScene]);

  const toLevels = useCallback(() => {
    clearTimers();
    releaseLock();
    simRef.current = null;
    setOverlay(null);
    setIntro(null);
    setToasts([]);
    setScreen("levels");
    showMenuScene();
  }, [clearTimers, releaseLock, setOverlay, setScreen, showMenuScene]);

  const pause = useCallback(() => {
    if (screenRef.current !== "play" || overlayRef.current) return;
    setOverlay("paused");
    releaseLock();
  }, [releaseLock, setOverlay]);
  const resume = useCallback(() => {
    setOverlay(null);
    requestLock();
  }, [requestLock, setOverlay]);

  const complete = useCallback(() => {
    const s = simRef.current;
    if (!s) return;
    const id = levelRef.current;
    const { progress: next, best, prev } = recordCompletion(progressRef.current, id, s.t, s.stats.portals);
    progressRef.current = next;
    setProgress(next);
    setResult({ id, time: s.t, portals: s.stats.portals, deaths: s.stats.deaths, best, prev: prev?.time ?? null });
    releaseLock();
    if (id === LEVEL_COUNT) {
      audio.play("gameComplete");
      setOverlay("final");
    } else setOverlay("complete");
  }, [releaseLock, setOverlay]);

  /* ------------------------------------------------------------ sim events → audio / HUD */
  const handleEvents = useCallback(
    (s) => {
      const evs = s.events;
      if (!evs.length) return;
      s.events = [];
      const world = worldRef.current;
      for (const e of evs) {
        switch (e.type) {
          case "portal":
            audio.play("portal", e);
            world?.fx(e);
            break;
          case "portalFail":
            audio.play("portalFail");
            world?.fx(e);
            if (e.reason === "occupied") toast("The other portal is already on that surface.");
            else if (e.reason === "glass") toast("Portals cannot open on glass.");
            else if (e.reason === "blocked") toast("Something is in the way.");
            else toast("Portals only open on white panels.");
            break;
          case "portalLocked":
            audio.play("portalLocked");
            toast(e.color === "orange" ? "The orange portal is fixed in this chamber." : "The blue portal is fixed in this chamber.");
            break;
          case "teleport":
            if (e.kind === "player") {
              audio.play("teleport");
              flash(e.to);
            }
            break;
          case "eject":
            if (e.kind === "player") toast("Portal loop detected — you were set down safely.");
            break;
          case "pickup":
          case "drop":
            audio.play(e.type);
            break;
          case "dropForced":
            audio.play("drop");
            toast("The cube slipped from your grip.");
            break;
          case "land":
            audio.play("land", e);
            dipRef.current = -Math.min(0.25, e.v * 0.012);
            break;
          case "jump":
            audio.play("jump");
            break;
          case "plateOn":
          case "plateOff":
          case "receiverOn":
          case "receiverOff":
          case "tick":
          case "pad":
            audio.play(e.type, e);
            break;
          case "timerEnd":
            audio.play("timerEnd");
            toast("Time is up — the timer has reset.");
            break;
          case "switch":
            audio.play("switch");
            if (e.timed) toast("Timer started — hurry!");
            break;
          case "doorOpen":
            audio.play("doorOpen", e);
            if (e.exit) toast("The exit is unlocked!", "good");
            break;
          case "doorClose":
            audio.play("doorClose", e);
            break;
          case "respawn":
            audio.play("respawn");
            flash("respawn");
            toast(e.reason === "goo" ? "The energy liquid dissolved you. Back to the checkpoint." : "You fell out of the chamber. Back to the checkpoint.", "bad");
            break;
          case "cubeRespawn":
            audio.play("cubeRespawn");
            toast("A cube was lost — a fresh one was dispensed.");
            break;
          case "checkpoint":
            audio.play("checkpoint");
            toast("Checkpoint reached.", "good");
            break;
          case "complete":
            audio.play("complete");
            flash("complete");
            later(complete, 900);
            break;
          default:
            break;
        }
      }
    },
    [complete, flash, later, toast],
  );

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage, { preserve: TEST });
    } catch (err) {
      console.error("Portal Shift: WebGL unavailable", err);
      setNoGL(true);
      return undefined;
    }
    worldRef.current = world;
    world.setFov(settingsRef.current.fov);
    world.setQuality(settingsRef.current.quality);
    const fit = () => {
      const r = stage.getBoundingClientRect();
      world.resize(Math.round(r.width), Math.round(r.height));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    fit();
    showMenuScene();
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
      simRef.current = null;
      menuSimRef.current = null;
    };
  }, [showMenuScene]);

  const botRef = useRef(null);
  frame.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    const scr = screenRef.current;
    if (scr === "play") {
      const s = simRef.current;
      if (!s) return world.render(null, dt);
      const running = !overlayRef.current && s.state === "play" && (lockedRef.current || botRef.current);
      if (running) {
        const k = keys.current;
        const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
        const h = dt / n;
        const sens = settingsRef.current.sens * 0.0022;
        for (let i = 0; i < n; i++) {
          let input;
          if (botRef.current) input = botRef.current(s);
          else {
            input = {
              mz: (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0),
              mx: (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0),
              jump: k.has("Space") || queued.current.jump,
            };
            if (i === 0) {
              input.lookX = look.current.x * sens;
              input.lookY = look.current.y * sens * (settingsRef.current.invertY ? -1 : 1);
              look.current = { x: 0, y: 0 };
              input.fire = queued.current.fire;
              input.use = queued.current.use;
              queued.current = { fire: null, use: false, jump: false };
            }
          }
          s.update(h, input);
          handleEvents(s);
          if (s.state !== "play") break;
        }
        // HUD state that changes rarely → React only on change
        const f = s.focus;
        const prompt = !f ? "" : f.kind === "drop" ? "drop" : f.kind === "cube" ? (f.ref.kind === "reflector" ? "reflector" : "cube") : "button";
        const tm = s.timers();
        const timer = tm.length ? tm[0].left.toFixed(1) : "";
        const next = { prompt, timer, hasBlue: !!s.portals.blue, hasOrange: !!s.portals.orange, exitOpen: s.exitOpen() };
        const cur = hudRef.current;
        if (next.prompt !== cur.prompt || next.timer !== cur.timer || next.hasBlue !== cur.hasBlue || next.hasOrange !== cur.hasOrange || next.exitOpen !== cur.exitOpen) {
          hudRef.current = next;
          setHud(next);
        }
      } else if (s.events.length) handleEvents(s);
      dipRef.current *= Math.exp(-dt * 8);
      world.render(s, running ? dt : dt * 0.25, { dip: dipRef.current });
    } else {
      const ms = menuSimRef.current;
      if (ms) {
        ms.t += dt;
        ms.yaw = Math.sin(ms.t * 0.12) * 0.32;
        world.render(ms, dt, { device: false });
      } else world.render(null, dt);
    }
  };

  /* ------------------------------------------------------------ input */
  const actions = useRef({});
  actions.current = { restartLevel, pause, resume, toMenu };
  useEffect(() => {
    const down = (e) => {
      const scr = screenRef.current;
      if (scr !== "play") return;
      if (overlayRef.current) {
        if (e.code === "Escape" && TEST && overlayRef.current === "paused") actions.current.resume();
        return;
      }
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
        if (e.code === "Space") queued.current.jump = true;
      }
      if (e.repeat) return;
      if (e.code === "KeyE") {
        e.preventDefault();
        queued.current.use = true;
      } else if (e.code === "KeyR") {
        e.preventDefault();
        actions.current.restartLevel();
      } else if (e.code === "KeyH") {
        e.preventDefault();
        setOverlay("hint");
        releaseLock();
      } else if (e.code === "Escape" && (TEST || !document.pointerLockElement)) actions.current.pause();
    };
    const up = (e) => keys.current.delete(e.code);
    const move = (e) => {
      if (!lockedRef.current || screenRef.current !== "play" || overlayRef.current) return;
      look.current.x += Math.max(-300, Math.min(300, e.movementX || 0));
      look.current.y += Math.max(-300, Math.min(300, e.movementY || 0));
    };
    const mdown = (e) => {
      if (!lockedRef.current || screenRef.current !== "play" || overlayRef.current) return;
      if (e.button === 0) queued.current.fire = "blue";
      else if (e.button === 2) queued.current.fire = "orange";
      else return;
      e.preventDefault();
    };
    const blur = () => keys.current.clear();
    const vis = () => {
      if (document.hidden && !TEST) actions.current.pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("mousemove", move);
    document.addEventListener("mousedown", mdown);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    const root = rootRef.current;
    const ctx = (e) => e.preventDefault();
    const wheel = (e) => e.preventDefault();
    root?.addEventListener("contextmenu", ctx);
    root?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mousedown", mdown);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
      root?.removeEventListener("contextmenu", ctx);
      root?.removeEventListener("wheel", wheel);
    };
  }, [releaseLock, setOverlay]);

  /* ------------------------------------------------------------ settings / sound */
  const changeSettings = useCallback((patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
    worldRef.current?.setFov(next.fov);
    worldRef.current?.setQuality(next.quality);
    audio.setVolume(next.volume);
  }, []);
  useEffect(() => audio.setMuted(muted || settings.mute), [muted, settings.mute]);
  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ Game Center restart button */
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    if (screenRef.current === "play") restartLevel();
  }, [restartSignal, restartLevel]);

  /* ------------------------------------------------------------ test hook */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__ps = {
      sim: () => simRef.current,
      world: () => worldRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      locked: () => lockedRef.current,
      level: () => levelRef.current,
      progress: () => progressRef.current,
      setProgress: (p) => {
        progressRef.current = p;
        setProgress(p);
        saveProgress(p);
      },
      advance(n = 1, dt = 1 / 60) {
        for (let i = 0; i < n; i++) frame.current(dt);
      },
      keys: keys.current,
      look: look.current,
      queue: queued.current,
      fire: (c) => (queued.current.fire = c),
      use: () => (queued.current.use = true),
      setBot: (b) => (botRef.current = b),
      play: startLevel,
      restart: restartLevel,
      toMenu,
      pause,
      resume,
      fit() {
        const r = stageRef.current.getBoundingClientRect();
        worldRef.current?.resize(Math.round(r.width), Math.round(r.height));
      },
    };
    return () => {
      delete window.__ps;
    };
  }, [startLevel, restartLevel, toMenu, pause, resume]);

  /* ------------------------------------------------------------ render */
  const L = getLevel(level);
  const sec = SECTORS[L?.sector ?? 0];
  const inPlay = screen === "play";
  const canContinue = hasProgress(progress);
  const continueId = Math.max(1, Math.min(progress.last, progress.unlocked));

  const promptText = {
    cube: "Pick up the energy cube",
    reflector: "Pick up the reflector cube",
    drop: "Drop the cube",
    button: "Press the button",
  }[hud.prompt];

  return (
    <div
      ref={rootRef}
      className={`ps ps--${screen}${overlay ? " has-overlay" : ""}`}
      style={{ "--acc": `#${sec.accent.toString(16).padStart(6, "0")}` }}
      onClick={(e) => {
        if (e.target.closest?.("button, input, label, a")) return;
        if (screenRef.current === "play" && !overlayRef.current && !lockedRef.current) requestLock();
      }}
    >
      <div ref={stageRef} className="ps-stage" aria-hidden="true" />
      <div className="ps-vignette" />
      <div ref={flashRef} className="ps-flash" />

      {/* ------------------------------------------------ HUD */}
      {inPlay && L && (
        <div className={`ps-hud${overlay ? " is-dim" : ""}`}>
          <div className="ps-hud__level">
            <div className="ps-hud__chamber">
              <span className="ps-hud__no">{pad2(level)}</span>
              <span className="ps-hud__name">{L.name}</span>
            </div>
            <div className="ps-hud__obj">
              <span className="ps-hud__label">Objective</span>
              <span>{L.objective}</span>
            </div>
            <div className={`ps-hud__exit${hud.exitOpen ? " is-open" : ""}`}>{hud.exitOpen ? "Exit unlocked" : "Exit locked"}</div>
          </div>
          {hud.timer && (
            <div className="ps-hud__timer" role="timer" aria-label="Timer">
              <span className="ps-hud__label">Timer</span>
              <span className="ps-hud__time">{hud.timer}</span>
            </div>
          )}
          <div className="ps-cross" aria-hidden="true">
            <span className={`ps-cross__b${hud.hasBlue ? " is-on" : ""}`} />
            <span className="ps-cross__dot" />
            <span className={`ps-cross__o${hud.hasOrange ? " is-on" : ""}`} />
          </div>
          {promptText && (
            <div className="ps-prompt">
              <kbd>E</kbd> {promptText}
            </div>
          )}
          <div className="ps-hud__keys">
            <span>
              <kbd>R</kbd> Restart
            </span>
            <span>
              <kbd>H</kbd> Hint
            </span>
            <span>
              <kbd>Esc</kbd> Pause
            </span>
          </div>
          <div className="ps-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`ps-toast${t.kind ? ` is-${t.kind}` : ""}`}>
                {t.text}
              </div>
            ))}
          </div>
          {intro && (
            <div key={intro.key} className="ps-intro">
              <div className="ps-intro__sector">{sec.name}</div>
              <div className="ps-intro__no">{`Chamber ${pad2(intro.id)}`}</div>
              <div className="ps-intro__name">{L.name}</div>
              <div className="ps-intro__obj">{L.objective}</div>
            </div>
          )}
          {!locked && !overlay && <div className="ps-clickhint">Click to capture the mouse and play</div>}
        </div>
      )}

      {/* ------------------------------------------------ menus */}
      {screen === "menu" && (
        <div className="ps-screen ps-menu">
          <div className="ps-menu__brand">
            <Logo />
            <div>
              <div className="ps-menu__eyebrow">Escape Room · Logic · Puzzle</div>
              <h1 className="ps-menu__title">
                Portal <span>Shift</span>
              </h1>
              <div className="ps-menu__sub">Dimension Escape</div>
            </div>
          </div>
          <p className="ps-menu__tag">Two Portals. Endless Possibilities. One Way Out.</p>
          <div className="ps-menu__actions">
            <button type="button" className="ps-btn ps-btn--primary ps-btn--big" disabled={noGL} onClick={() => startLevel(1)}>
              Play
            </button>
            {canContinue && (
              <button type="button" className="ps-btn ps-btn--big" disabled={noGL} onClick={() => startLevel(continueId)}>
                Continue <span className="ps-btn__sub">{`Chamber ${pad2(continueId)}`}</span>
              </button>
            )}
            <button type="button" className="ps-btn" disabled={noGL} onClick={() => setScreen("levels")}>
              Level Select
            </button>
            <button type="button" className="ps-btn" onClick={() => setScreen("howto")}>
              How to Play
            </button>
            <button
              type="button"
              className="ps-btn"
              onClick={() => {
                setReturnTo("menu");
                setScreen("settings");
              }}
            >
              Settings
            </button>
          </div>
          <div className="ps-menu__foot">
            <span>{`${Object.keys(progress.done).length} / ${LEVEL_COUNT} chambers complete`}</span>
            {TOUCH && <span className="ps-warn">This game needs a keyboard and mouse.</span>}
            {noGL && <span className="ps-warn">WebGL is unavailable in this browser.</span>}
          </div>
        </div>
      )}
      {screen === "levels" && (
        <div className="ps-screen ps-screen--dim">
          <LevelSelect progress={progress} onPlay={startLevel} onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "howto" && (
        <div className="ps-screen ps-screen--dim">
          <HowTo onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "settings" && !overlay && (
        <div className="ps-screen ps-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setScreen(returnTo)} onReset={() => setOverlay("confirmReset")} />
        </div>
      )}
      {screen === "loading" && (
        <div className="ps-screen ps-loading" role="status" aria-label="Loading">
          <div className="ps-loading__ring" />
          <div className="ps-loading__text">Calibrating chamber…</div>
          <div className="ps-dim">{`Chamber ${pad2(level)} · ${L?.name}`}</div>
        </div>
      )}

      {/* ------------------------------------------------ overlays */}
      {overlay === "paused" && (
        <div className="ps-screen ps-screen--dim">
          <div className="ps-panel ps-pause" role="dialog" aria-label="Paused">
            <div className="ps-pause__eyebrow">{`Chamber ${pad2(level)} · ${L?.name}`}</div>
            <h2>Paused</h2>
            <p className="ps-dim">{L?.objective}</p>
            <button type="button" className="ps-btn ps-btn--primary" onClick={resume}>
              Resume
            </button>
            {lockHint && <p className="ps-dim ps-small">Click Resume again to capture the mouse.</p>}
            <button type="button" className="ps-btn" onClick={restartLevel}>
              Restart Chamber
            </button>
            <button type="button" className="ps-btn" onClick={() => setOverlay("hint")}>
              Show Hint
            </button>
            <div className="ps-row">
              <button type="button" className="ps-btn ps-btn--ghost" onClick={() => setOverlay("howto")}>
                How to Play
              </button>
              <button type="button" className="ps-btn ps-btn--ghost" onClick={() => setOverlay("settings")}>
                Settings
              </button>
            </div>
            <button type="button" className="ps-btn ps-btn--ghost" onClick={() => setOverlay("confirmLeave")}>
              Exit to Menu
            </button>
          </div>
        </div>
      )}
      {overlay === "hint" && L && (
        <div className="ps-screen ps-screen--dim">
          <div className="ps-panel ps-hint" role="dialog" aria-label="Hint">
            <div className="ps-pause__eyebrow">{`Chamber ${pad2(level)} · ${L.name}`}</div>
            <h2>Hint</h2>
            <p>{L.hint}</p>
            <button type="button" className="ps-btn ps-btn--primary" onClick={resume}>
              Back to the Chamber
            </button>
          </div>
        </div>
      )}
      {overlay === "howto" && (
        <div className="ps-screen ps-screen--dim">
          <HowTo onBack={() => setOverlay("paused")} />
        </div>
      )}
      {overlay === "settings" && (
        <div className="ps-screen ps-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setOverlay("paused")} />
        </div>
      )}
      {overlay === "confirmLeave" && (
        <Confirm
          title="Leave this chamber?"
          text="Your progress inside this chamber will be lost. Completed chambers stay unlocked."
          yes="Leave"
          no="Stay"
          onYes={toMenu}
          onNo={() => setOverlay("paused")}
        />
      )}
      {overlay === "confirmReset" && (
        <Confirm
          title="Reset all progress?"
          text="Every chamber except the first will be locked again and your best times will be erased."
          yes="Reset"
          no="Cancel"
          onYes={() => {
            const p = emptyProgress();
            saveProgress(p);
            progressRef.current = p;
            setProgress(p);
            setOverlay(null);
            toast("Progress reset.");
          }}
          onNo={() => setOverlay(null)}
        />
      )}
      {overlay === "complete" && result && (
        <div className="ps-screen ps-screen--dim">
          <div className="ps-panel ps-done" role="dialog" aria-label="Chamber Complete">
            <div className="ps-pause__eyebrow">{`Chamber ${pad2(result.id)} · ${getLevel(result.id).name}`}</div>
            <h2>Chamber Complete</h2>
            <div className="ps-stats">
              <div>
                <span className="ps-stats__label">Time</span>
                <span className="ps-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="ps-stats__label">Portals</span>
                <span className="ps-stats__val">{result.portals}</span>
              </div>
              <div>
                <span className="ps-stats__label">Best</span>
                <span className="ps-stats__val">{fmt(result.best ? result.time : result.prev)}</span>
              </div>
            </div>
            {result.best && result.prev !== null && <div className="ps-badge">New best time!</div>}
            <p className="ps-dim">{`Chamber ${pad2(result.id + 1)} is now unlocked.`}</p>
            <button type="button" className="ps-btn ps-btn--primary ps-btn--big" onClick={() => startLevel(result.id + 1)}>
              Next Chamber
            </button>
            <div className="ps-row">
              <button type="button" className="ps-btn" onClick={() => startLevel(result.id)}>
                Replay
              </button>
              <button type="button" className="ps-btn" onClick={toLevels}>
                Level Select
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay === "final" && result && (
        <div className="ps-screen ps-final">
          <div className="ps-panel ps-done ps-done--final" role="dialog" aria-label="Game Complete">
            <Logo />
            <div className="ps-pause__eyebrow">All 25 chambers complete</div>
            <h2>Dimension Escaped!</h2>
            <p>The last portal closes behind you. Beyond the core, daylight pours through an open hatch — for the first time, the way out is real.</p>
            <div className="ps-stats">
              <div>
                <span className="ps-stats__label">Final chamber</span>
                <span className="ps-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="ps-stats__label">Total best time</span>
                <span className="ps-stats__val">{fmt(Object.values(progress.done).reduce((a, d) => a + d.time, 0))}</span>
              </div>
            </div>
            <div className="ps-row">
              <button type="button" className="ps-btn ps-btn--primary" onClick={toLevels}>
                Level Select
              </button>
              <button type="button" className="ps-btn" onClick={toMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
