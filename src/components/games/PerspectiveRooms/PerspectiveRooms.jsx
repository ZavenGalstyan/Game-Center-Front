/**
 * Perspective: Impossible Rooms — a first-person forced-perspective escape
 * puzzle in 20 surreal rooms.
 *
 * One requestAnimationFrame loop steps the simulation (engine/sim.js) in
 * ≤1/60 s slices and draws it with plain three.js (render/world.js); sound is
 * procedural WebAudio (audio.js). React renders only menus, overlays and a HUD
 * that changes on events — walking and looking never re-render React.
 *
 * All visible text is English source text: the Game Center's runtime
 * translator (i18n/gameTranslator.js + i18n/games/PerspectiveRooms.json)
 * swaps it for Russian in place when the site language is Russian, and back
 * again. Sentences are kept whole in single text nodes so they translate as a
 * unit. No text is drawn into textures.
 *
 * Controls: WASD move · mouse look (Pointer Lock) · E / left click pick up or
 * place · wheel holding distance · Q / R turn the held object · Space jump ·
 * H hint · Esc pause. Restart lives in the pause menu and on the Game Center's
 * Restart button (`restartSignal`); `muted` silences audio. DEV hook:
 * `?pirtest=1` fakes pointer lock, disables rAF and exposes window.__pir
 * (tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./PerspectiveRooms.css";
import { createSim, objBox } from "./engine/sim.js";
import { getLevel, LEVELS, LEVEL_COUNT } from "./engine/levels.js";
import { ZONES } from "./engine/constants.js";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { loadProgress, saveProgress, recordCompletion, hasProgress, loadSettings, saveSettings, emptyProgress } from "./progress.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("pirtest");
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
const STEP = 1 / 60;

const fmt = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s - m * 60);
  return `${m}:${r < 10 ? "0" : ""}${r}`;
};
const pad2 = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ icons */
const Logo = () => (
  <svg viewBox="0 0 120 120" aria-hidden="true" className="pir-logo">
    <defs>
      <linearGradient id="pirg1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8fd6ff" />
        <stop offset="100%" stopColor="#c79bff" />
      </linearGradient>
      <linearGradient id="pirg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ff9ec7" />
        <stop offset="100%" stopColor="#ffd36b" />
      </linearGradient>
    </defs>
    <path d="M60 8L104 33V83L60 108L16 83V33Z" fill="none" stroke="url(#pirg1)" strokeWidth="6" strokeLinejoin="round" />
    <path d="M60 58L104 33M60 58V108M60 58L16 33" stroke="url(#pirg1)" strokeWidth="4" opacity="0.55" />
    <path d="M60 40L80 51.5V74.5L60 86L40 74.5V51.5Z" fill="url(#pirg2)" />
    <path d="M60 63L80 51.5M60 63V86M60 63L40 51.5" stroke="#ffffff" strokeWidth="2.5" opacity="0.85" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="pir-ico">
    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="pir-ico">
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ------------------------------------------------------------------ panels */
function Controls() {
  return (
    <dl className="pir-keys">
      <dt>W A S D</dt>
      <dd>Move</dd>
      <dt>Mouse</dt>
      <dd>Look around</dd>
      <dt>E / Left click</dt>
      <dd>Pick up or place an object</dd>
      <dt>Mouse wheel</dt>
      <dd>Pull a held object closer or push it away</dd>
      <dt>Q / R</dt>
      <dd>Turn the held object</dd>
      <dt>Space</dt>
      <dd>Jump</dd>
      <dt>H</dt>
      <dd>Show a hint</dd>
      <dt>Esc</dt>
      <dd>Pause and release the mouse</dd>
    </dl>
  );
}

function HowTo({ onBack }) {
  return (
    <div className="pir-panel pir-howto" role="dialog" aria-label="How to Play">
      <h2>How to Play</h2>
      <div className="pir-howto__cols">
        <section>
          <h3>Your goal</h3>
          <p>Every room is a puzzle. Open the way and walk into the glowing doorway to reach the next room.</p>
          <h3>Forced perspective</h3>
          <ul>
            <li>A held object keeps the size it appears to have on screen.</li>
            <li>Pick something up close to you and put it down far away — it becomes huge.</li>
            <li>Pick something up from far away and put it down close to you — it becomes tiny.</li>
            <li>A held object slides away from you until it touches something. The mouse wheel pulls it closer.</li>
            <li>An object only fits through an opening while it is smaller than the opening.</li>
            <li>Everything you place is solid: build bridges, stairs and platforms.</li>
          </ul>
          <h3>Mechanisms</h3>
          <ul>
            <li>Pressure plates show what they need: an object, a large object, or your own weight.</li>
            <li>Doors cannot close on objects — something tall can hold one open.</li>
            <li>An eye symbol on the floor marks a point of view. Stand on it and look around.</li>
            <li>Objects that fall into the void return to where they started.</li>
          </ul>
        </section>
        <section>
          <h3>Controls</h3>
          <Controls />
          <p className="pir-dim">Click the view to capture the mouse. A keyboard and mouse are required.</p>
        </section>
      </div>
      <button type="button" className="pir-btn pir-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function Settings({ settings, onChange, onBack, onReset }) {
  const Toggle = ({ k, label, invert = false }) => {
    const on = invert ? !settings[k] : !!settings[k];
    return (
      <div className="pir-field">
        <span>{label}</span>
        <button type="button" className={`pir-toggle${on ? " is-on" : ""}`} aria-pressed={on} aria-label={label} onClick={() => onChange({ [k]: !settings[k] })}>
          {on ? "On" : "Off"}
        </button>
      </div>
    );
  };
  return (
    <div className="pir-panel pir-settings" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <label className="pir-field">
        <span>Mouse sensitivity</span>
        <input type="range" min="0.2" max="3" step="0.05" value={settings.sens} aria-label="Mouse sensitivity" onChange={(e) => onChange({ sens: Number(e.target.value) })} />
        <output>{settings.sens.toFixed(2)}</output>
      </label>
      <label className="pir-field">
        <span>Field of view</span>
        <input type="range" min="60" max="100" step="1" value={settings.fov} aria-label="Field of view" onChange={(e) => onChange({ fov: Number(e.target.value) })} />
        <output>{settings.fov}°</output>
      </label>
      <label className="pir-field">
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} aria-label="Volume" onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        <output>{Math.round(settings.volume * 100)}%</output>
      </label>
      <Toggle k="invertY" label="Invert vertical look" />
      <Toggle k="mute" label="Sound" invert />
      <Toggle k="hints" label="Tutorial tips" />
      <div className="pir-field">
        <span>Graphics</span>
        <div className="pir-seg" role="group" aria-label="Graphics">
          <button type="button" className={settings.quality === "high" ? "is-on" : ""} aria-pressed={settings.quality === "high"} onClick={() => onChange({ quality: "high" })}>
            High
          </button>
          <button type="button" className={settings.quality === "low" ? "is-on" : ""} aria-pressed={settings.quality === "low"} onClick={() => onChange({ quality: "low" })}>
            Fast
          </button>
        </div>
      </div>
      <div className="pir-settings__foot">
        {onReset && (
          <button type="button" className="pir-btn pir-btn--danger" onClick={onReset}>
            Reset progress
          </button>
        )}
        <button type="button" className="pir-btn pir-btn--primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function Confirm({ title, text, yes, no, onYes, onNo }) {
  return (
    <div className="pir-screen pir-screen--dim">
      <div className="pir-panel pir-confirm" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="pir-row">
          <button type="button" className="pir-btn pir-btn--danger" onClick={onYes}>
            {yes}
          </button>
          <button type="button" className="pir-btn pir-btn--primary" onClick={onNo}>
            {no}
          </button>
        </div>
      </div>
    </div>
  );
}

function LevelSelect({ progress, onPlay, onBack }) {
  return (
    <div className="pir-panel pir-levels" role="dialog" aria-label="Level Select">
      <div className="pir-levels__head">
        <h2>Level Select</h2>
        <span className="pir-dim">{`${Object.keys(progress.done).length} / ${LEVEL_COUNT} rooms complete`}</span>
      </div>
      <div className="pir-levels__scroll">
        {ZONES.map((z) => (
          <section key={z.id} className="pir-zone" style={{ "--zacc": z.accent }}>
            <h3>{z.name}</h3>
            <div className="pir-levels__grid">
              {LEVELS.filter((l) => l.zone === z.id).map((l) => {
                const locked = l.id > progress.unlocked;
                const done = progress.done[l.id];
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`pir-lvl${locked ? " is-locked" : ""}${done ? " is-done" : ""}`}
                    disabled={locked}
                    onClick={() => onPlay(l.id)}
                    aria-label={locked ? `Room ${l.id}, locked` : `Room ${l.id}: ${l.name}`}
                  >
                    <span className="pir-lvl__no">{pad2(l.id)}</span>
                    <span className="pir-lvl__name">{locked ? "Locked" : l.name}</span>
                    <span className="pir-lvl__meta">
                      {locked ? (
                        <LockIcon />
                      ) : done ? (
                        <>
                          <CheckIcon />
                          <span>{`Best ${fmt(done.time)}`}</span>
                        </>
                      ) : (
                        <span>New</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <button type="button" className="pir-btn pir-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ HUD helpers */
function plateNeed(p) {
  if (p.socket) return "Drop something small inside.";
  if (p.need === "player") return "Only your own weight presses this plate.";
  if (p.need === "heavy") return `Needs a large object — at least ${p.min.toFixed(1)} m across.`;
  if (p.need === "any") return "Needs you or an object.";
  return "Needs an object.";
}
function holdInfo(s) {
  const h = s.hold;
  if (!h) return null;
  const b = objBox(h.obj);
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
  return { valid: h.valid, reason: h.reason, size: size.toFixed(1), name: h.obj.name };
}

/* ------------------------------------------------------------------ component */
export default function PerspectiveRooms({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const flashRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const menuSimRef = useRef(null);
  const keys = useRef(new Set());
  const look = useRef({ x: 0, y: 0 });
  const queued = useRef({ use: false, wheel: 0, rotQ: false, rotR: false });
  const lockedRef = useRef(false);
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const levelRef = useRef(1);
  const frame = useRef(() => {});
  const timers = useRef(new Set());
  const hudRef = useRef("");
  const settingsRef = useRef(loadSettings());
  const stepRef = useRef(0);
  const botRef = useRef(null);
  const menuT = useRef(0);

  const [screen, setScreenState] = useState("menu"); // menu | levels | howto | settings | loading | play
  const [overlay, setOverlayState] = useState(null); // null | paused | complete | final | confirmLeave | confirmReset | howto | settings | hint
  const [settings, setSettings] = useState(settingsRef.current);
  const [progress, setProgress] = useState(loadProgress);
  const [level, setLevel] = useState(1);
  const [locked, setLocked] = useState(false);
  const [lockHint, setLockHint] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [hud, setHud] = useState({ focus: null, hold: null });
  const [toasts, setToasts] = useState([]);
  const [intro, setIntro] = useState(null);
  const [result, setResult] = useState(null);
  const [returnTo, setReturnTo] = useState("menu");
  const [hintN, setHintN] = useState(1);

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
      later(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "long" ? 6200 : 3000);
    },
    [later],
  );
  const flash = useCallback((cls) => {
    const el = flashRef.current;
    if (!el) return;
    el.className = "pir-flash";
    void el.offsetWidth;
    el.className = `pir-flash is-${cls}`;
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
      } else if (screenRef.current === "play" && !overlayRef.current && simRef.current?.state === "play") {
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
    const L = getLevel(16);
    const s = createSim(L);
    s.player.x = 7;
    s.player.y = 1.2;
    s.player.z = 8;
    s.player.pitch = 0.05;
    for (const v of s.views) {
      v.done = true;
      s.latched[v.id] = true;
    }
    menuSimRef.current = s;
    world.setLevel(L, s);
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
      setHintN(1);
      setOverlay(null);
      keys.current.clear();
      look.current = { x: 0, y: 0 };
      queued.current = { use: false, wheel: 0, rotQ: false, rotR: false };
      setScreen("loading");
      requestLock();
      const begin = () => {
        const s = createSim(L);
        simRef.current = s;
        world.setLevel(L, s);
        hudRef.current = "";
        setHud({ focus: null, hold: null });
        setScreen("play");
        flash("enter");
        setIntro({ id, key: Date.now() });
        later(() => setIntro(null), 4800);
        if (L.tip && settingsRef.current.hints) later(() => toast(L.tip, "long"), 1400);
        const next = { ...progressRef.current, last: id };
        progressRef.current = next;
        setProgress(next);
        saveProgress(next);
      };
      if (TEST) begin();
      else later(begin, 450);
    },
    [clearTimers, flash, later, requestLock, setOverlay, setScreen, toast],
  );
  const restartLevel = useCallback(() => {
    if (screenRef.current !== "play") return;
    const L = getLevel(levelRef.current);
    const s = createSim(L);
    simRef.current = s;
    worldRef.current?.setLevel(L, s);
    hudRef.current = "";
    setHud({ focus: null, hold: null });
    setOverlay(null);
    setToasts([]);
    keys.current.clear();
    queued.current = { use: false, wheel: 0, rotQ: false, rotR: false };
    flash("restart");
    audio.play("objReturn");
    requestLock();
  }, [flash, requestLock, setOverlay]);

  const leaveLevel = useCallback(
    (to) => {
      clearTimers();
      releaseLock();
      simRef.current = null;
      setOverlay(null);
      setIntro(null);
      setToasts([]);
      setScreen(to);
      showMenuScene();
    },
    [clearTimers, releaseLock, setOverlay, setScreen, showMenuScene],
  );
  const toMenu = useCallback(() => leaveLevel("menu"), [leaveLevel]);
  const toLevels = useCallback(() => leaveLevel("levels"), [leaveLevel]);

  const pause = useCallback(() => {
    if (screenRef.current !== "play" || overlayRef.current) return;
    setOverlay("paused");
    releaseLock();
  }, [releaseLock, setOverlay]);
  const resume = useCallback(() => {
    setOverlay(null);
    requestLock();
  }, [requestLock, setOverlay]);
  const openOverlay = useCallback(
    (o) => {
      if (screenRef.current !== "play") return;
      keys.current.clear();
      setOverlay(o);
      releaseLock();
    },
    [releaseLock, setOverlay],
  );

  const complete = useCallback(() => {
    const s = simRef.current;
    if (!s) return;
    const id = levelRef.current;
    const { progress: next, best, prev } = recordCompletion(progressRef.current, id, s.t);
    progressRef.current = next;
    setProgress(next);
    setResult({ id, time: s.t, grabs: s.stats.grabs, best, prev: prev?.time ?? null });
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
      const gated = s.L.exits.some((e) => e.when.length);
      for (const e of evs) {
        switch (e.type) {
          case "grab":
            audio.play("grab");
            break;
          case "drop":
            audio.play("drop", e.weight);
            break;
          case "thud":
            audio.play("thud", e.weight);
            break;
          case "deny":
            audio.play("deny");
            toast(e.reason === "player" ? "Too close — it would land on you." : "There is no room for it there.", "bad");
            break;
          case "rotate":
            audio.play("rotate");
            break;
          case "wheel":
            audio.play("wheel");
            break;
          case "jump":
            audio.play("jump");
            break;
          case "land":
            audio.play("land");
            break;
          case "plateOn":
            audio.play("plateOn");
            break;
          case "plateOff":
            audio.play("plateOff");
            break;
          case "doorOpen":
            audio.play("door");
            toast("A door slides open.", "good");
            break;
          case "doorClose":
            audio.play("doorClose");
            break;
          case "jam":
            audio.play("jam");
            toast("The door is jammed open!", "good");
            break;
          case "aligned":
            audio.play("aligned");
            flash("align");
            toast(e.kind === "reveal" ? "A hidden path appears!" : "The picture is complete!", "good");
            break;
          case "exitOpen":
            audio.play("exitOpen");
            if (gated) toast("The exit is open!", "good");
            break;
          case "fall":
            audio.play("fall");
            flash("fall");
            toast("You fell into the void and returned to the start.", "bad");
            break;
          case "objReturn":
            audio.play("objReturn");
            toast("An object fell away and returned to its place.");
            break;
          case "complete":
            audio.play("complete");
            flash("complete");
            later(complete, 1000);
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
      console.error("Perspective: WebGL unavailable", err);
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
    let raf = 0,
      last = performance.now();
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

  frame.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    if (screenRef.current === "play") {
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
          if (botRef.current) input = botRef.current(s, h);
          else {
            input = {
              mz: (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0),
              mx: (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0),
              jump: k.has("Space"),
            };
            if (i === 0) {
              const q = queued.current;
              input.lookX = look.current.x * sens;
              input.lookY = look.current.y * sens * (settingsRef.current.invertY ? -1 : 1);
              look.current = { x: 0, y: 0 };
              input.use = q.use;
              input.wheel = q.wheel;
              input.rotQ = q.rotQ;
              input.rotR = q.rotR;
              queued.current = { use: false, wheel: 0, rotQ: false, rotR: false };
            }
          }
          s.update(h, input);
          handleEvents(s);
          if (s.state !== "play" || overlayRef.current) break;
        }
        // footsteps
        const p = s.player;
        if (p.speed > 1 && p.ground) {
          const stepN = Math.floor(p.bob / Math.PI);
          if (stepN !== stepRef.current) {
            stepRef.current = stepN;
            audio.play("step");
          }
        }
        // HUD state that changes rarely → React only on change
        const f = s.focus;
        let focus = null;
        if (f?.kind === "obj") focus = { kind: "obj", name: f.name };
        else if (f?.kind === "plate") focus = { kind: "plate", need: plateNeed(f.plate), on: f.plate.on };
        else if (f?.kind === "exit") focus = { kind: "exit", open: f.exit.unlocked };
        else if (f?.kind === "button") focus = { kind: "button" };
        const hold = holdInfo(s);
        const key = JSON.stringify([focus, hold]);
        if (key !== hudRef.current) {
          hudRef.current = key;
          setHud({ focus, hold });
        }
      } else if (s.events.length) handleEvents(s);
      world.render(s, running ? dt : dt * 0.25);
    } else {
      const ms = menuSimRef.current;
      if (ms) {
        menuT.current += dt;
        const t = menuT.current;
        ms.player.yaw = 0.62 + Math.sin(t * 0.09) * 0.32;
        ms.player.pitch = 0.08 + Math.sin(t * 0.13) * 0.05;
        world.render(ms, dt);
      } else world.render(null, dt);
    }
  };

  /* ------------------------------------------------------------ input */
  const actions = useRef({});
  actions.current = { restartLevel, pause, resume, openOverlay };
  useEffect(() => {
    const down = (e) => {
      if (screenRef.current !== "play") return;
      const ov = overlayRef.current;
      if (ov) {
        if (ov === "hint" && e.code === "KeyH") {
          e.preventDefault();
          actions.current.resume();
        } else if (e.code === "Escape" && TEST && (ov === "paused" || ov === "hint")) actions.current.resume();
        return;
      }
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
      if (e.repeat) return;
      const q = queued.current;
      if (e.code === "KeyE") {
        e.preventDefault();
        q.use = true;
      } else if (e.code === "KeyQ") {
        e.preventDefault();
        q.rotQ = true;
      } else if (e.code === "KeyR") {
        e.preventDefault();
        q.rotR = true;
      } else if (e.code === "KeyH") {
        e.preventDefault();
        actions.current.openOverlay("hint");
      } else if (e.code === "Escape" && (TEST || !document.pointerLockElement)) actions.current.pause();
    };
    const up = (e) => keys.current.delete(e.code);
    const move = (e) => {
      if (!lockedRef.current || screenRef.current !== "play" || overlayRef.current) return;
      look.current.x += Math.max(-300, Math.min(300, e.movementX || 0));
      look.current.y += Math.max(-300, Math.min(300, e.movementY || 0));
    };
    const mouse = (e) => {
      // a click that captures the mouse must not also grab something
      if (e.button !== 0 || !lockedRef.current || screenRef.current !== "play" || overlayRef.current) return;
      e.preventDefault();
      queued.current.use = true;
    };
    const blur = () => keys.current.clear();
    const vis = () => {
      if (document.hidden && !TEST) actions.current.pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("mousemove", move);
    document.addEventListener("mousedown", mouse);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    const root = rootRef.current;
    const ctx = (e) => e.preventDefault();
    const wheel = (e) => {
      if (screenRef.current !== "play") return;
      e.preventDefault();
      if (!lockedRef.current || overlayRef.current || !e.deltaY) return;
      queued.current.wheel += e.deltaY < 0 ? 1 : -1;
    };
    root?.addEventListener("contextmenu", ctx);
    root?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mousedown", mouse);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
      root?.removeEventListener("contextmenu", ctx);
      root?.removeEventListener("wheel", wheel);
    };
  }, []);

  /* ------------------------------------------------------------ settings / sound */
  const changeSettings = useCallback((patch) => {
    const next = { ...settingsRef.current, ...patch };
    const qualityChanged = patch.quality && patch.quality !== settingsRef.current.quality;
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
    const w = worldRef.current;
    w?.setFov(next.fov);
    w?.setQuality(next.quality);
    audio.setVolume(next.volume);
    if (qualityChanged && w) {
      const s = screenRef.current === "play" ? simRef.current : menuSimRef.current;
      if (s) w.setLevel(s.L, s);
    }
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
    window.__pir = {
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
      queue: (patch) => Object.assign(queued.current, patch),
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
      delete window.__pir;
    };
  }, [startLevel, restartLevel, toMenu, pause, resume]);

  /* ------------------------------------------------------------ render */
  const L = getLevel(level);
  const zone = ZONES[L?.zone ?? 0];
  const accent = { ...zone.theme, ...(L?.theme || {}) }.accent;
  const inPlay = screen === "play";
  const canContinue = hasProgress(progress);
  const continueId = Math.max(1, Math.min(progress.last, progress.unlocked));
  const doneCount = Object.keys(progress.done).length;
  const hf = hud.focus;
  const hh = hud.hold;

  return (
    <div
      ref={rootRef}
      className={`pir pir--${screen}${overlay ? " has-overlay" : ""}${zone.theme.dark && inPlay ? " is-dark" : ""}`}
      style={{ "--acc": inPlay ? accent : "#8fd6ff" }}
      onClick={(e) => {
        if (e.target.closest?.("button, input, label, a")) return;
        if (screenRef.current === "play" && !overlayRef.current && !lockedRef.current) requestLock();
      }}
    >
      <div ref={stageRef} className="pir-stage" aria-hidden="true" />
      <div className="pir-vignette" />
      <div ref={flashRef} className="pir-flash" />

      {/* ------------------------------------------------ HUD */}
      {inPlay && L && (
        <div className={`pir-hud${overlay ? " is-dim" : ""}`}>
          <div className="pir-hud__level">
            <div className="pir-hud__title">
              <span className="pir-hud__no">{pad2(level)}</span>
              <span className="pir-hud__name">{L.name}</span>
            </div>
            <div className="pir-hud__obj">
              <span className="pir-hud__label">Objective</span>
              <span>{L.objective}</span>
            </div>
          </div>
          <div className={`pir-cross${hh ? " is-holding" : ""}${hh && !hh.valid ? " is-bad" : ""}${hf?.kind === "obj" ? " is-grab" : ""}`} aria-hidden="true" />
          {hh ? (
            <div className={`pir-prompt${hh.valid ? "" : " is-bad"}`}>
              <kbd>E</kbd>
              <span className="pir-prompt__verb">Place</span>
              <span className="pir-prompt__name">{hh.name}</span>
              <span className="pir-prompt__size">{`Size: ${hh.size} m`}</span>
              {!hh.valid && <span className="pir-prompt__warn">{hh.reason === "player" ? "Too close to you" : "No room here"}</span>}
            </div>
          ) : hf?.kind === "obj" ? (
            <div className="pir-prompt">
              <kbd>E</kbd>
              <span className="pir-prompt__verb">Pick up</span>
              <span className="pir-prompt__name">{hf.name}</span>
            </div>
          ) : hf?.kind === "plate" ? (
            <div className={`pir-prompt is-info${hf.on ? " is-on" : ""}`}>
              <span className="pir-prompt__verb">{hf.on ? "Plate pressed" : "Pressure plate"}</span>
              <span className="pir-prompt__name">{hf.need}</span>
            </div>
          ) : hf?.kind === "exit" ? (
            <div className={`pir-prompt is-info${hf.open ? " is-on" : ""}`}>
              {!hf.open && <LockIcon />}
              <span className="pir-prompt__verb">{hf.open ? "Exit open" : "Exit locked"}</span>
            </div>
          ) : null}
          {hh && (
            <div className="pir-hud__holdkeys">
              <span>
                <kbd>Wheel</kbd> Distance
              </span>
              <span>
                <kbd>Q</kbd>
                <kbd>R</kbd> Turn
              </span>
            </div>
          )}
          <div className="pir-hud__keys">
            <span>
              <kbd>E</kbd> Grab
            </span>
            <span>
              <kbd>Space</kbd> Jump
            </span>
            <span>
              <kbd>H</kbd> Hint
            </span>
            <span>
              <kbd>Esc</kbd> Pause
            </span>
          </div>
          <div className="pir-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`pir-toast${t.kind ? ` is-${t.kind}` : ""}`}>
                {t.text}
              </div>
            ))}
          </div>
          {intro && (
            <div key={intro.key} className="pir-intro">
              <div className="pir-intro__zone">{zone.name}</div>
              <div className="pir-intro__no">{`Room ${intro.id}`}</div>
              <div className="pir-intro__name">{L.name}</div>
              <div className="pir-intro__obj">{L.objective}</div>
            </div>
          )}
          {!locked && !overlay && <div className="pir-clickhint">Click to capture the mouse and play</div>}
        </div>
      )}

      {/* ------------------------------------------------ menus */}
      {screen === "menu" && (
        <div className="pir-screen pir-menu">
          <div className="pir-menu__card">
            <div className="pir-menu__brand">
              <Logo />
              <div>
                <div className="pir-menu__eyebrow">Escape Room · Logic · Puzzle</div>
                <h1 className="pir-menu__title">Perspective</h1>
                <div className="pir-menu__sub">Impossible Rooms</div>
              </div>
            </div>
            <p className="pir-menu__tag">Change Your View. Change Reality.</p>
            <div className="pir-menu__actions">
              <button type="button" className="pir-btn pir-btn--primary pir-btn--big" disabled={noGL} onClick={() => startLevel(1)}>
                Play
              </button>
              {canContinue && (
                <button type="button" className="pir-btn pir-btn--big" disabled={noGL} onClick={() => startLevel(continueId)}>
                  <span>Continue</span>
                  <span className="pir-btn__sub">{`Room ${continueId}`}</span>
                </button>
              )}
              <button type="button" className="pir-btn" disabled={noGL} onClick={() => setScreen("levels")}>
                Level Select
              </button>
              <button type="button" className="pir-btn" onClick={() => setScreen("howto")}>
                How to Play
              </button>
              <button
                type="button"
                className="pir-btn"
                onClick={() => {
                  setReturnTo("menu");
                  setScreen("settings");
                }}
              >
                Settings
              </button>
            </div>
            <div className="pir-menu__foot">
              <span>{`${doneCount} / ${LEVEL_COUNT} rooms complete`}</span>
              {TOUCH && <span className="pir-warn">This game needs a keyboard and mouse.</span>}
              {noGL && <span className="pir-warn">3D graphics are not available in this browser.</span>}
            </div>
          </div>
        </div>
      )}
      {screen === "levels" && (
        <div className="pir-screen pir-screen--dim">
          <LevelSelect progress={progress} onPlay={startLevel} onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "howto" && (
        <div className="pir-screen pir-screen--dim">
          <HowTo onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "settings" && !overlay && (
        <div className="pir-screen pir-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setScreen(returnTo)} onReset={() => setOverlay("confirmReset")} />
        </div>
      )}
      {screen === "loading" && (
        <div className="pir-screen pir-loading" role="status" aria-label="Loading">
          <Logo />
          <div className="pir-loading__text">Shifting perspective…</div>
          <div className="pir-dim">{`Room ${level} · ${L?.name}`}</div>
        </div>
      )}

      {/* ------------------------------------------------ overlays */}
      {overlay === "paused" && (
        <div className="pir-screen pir-screen--dim">
          <div className="pir-panel pir-pause" role="dialog" aria-label="Paused">
            <div className="pir-eyebrow">{`Room ${level} · ${L?.name}`}</div>
            <h2>Paused</h2>
            <p className="pir-dim">{L?.objective}</p>
            <button type="button" className="pir-btn pir-btn--primary" onClick={resume}>
              Resume
            </button>
            {lockHint && <p className="pir-dim pir-small">Click Resume again to capture the mouse.</p>}
            <button type="button" className="pir-btn" onClick={restartLevel}>
              Restart Room
            </button>
            <div className="pir-row">
              <button type="button" className="pir-btn pir-btn--ghost" onClick={() => setOverlay("hint")}>
                Show Hint
              </button>
              <button type="button" className="pir-btn pir-btn--ghost" onClick={() => setOverlay("howto")}>
                How to Play
              </button>
            </div>
            <div className="pir-row">
              <button type="button" className="pir-btn pir-btn--ghost" onClick={() => setOverlay("settings")}>
                Settings
              </button>
              <button type="button" className="pir-btn pir-btn--ghost" onClick={() => setOverlay("confirmLeave")}>
                Exit to Menu
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay === "hint" && L && (
        <div className="pir-screen pir-screen--dim">
          <div className="pir-panel pir-hint" role="dialog" aria-label="Hint">
            <div className="pir-eyebrow">{`Room ${level} · ${L.name}`}</div>
            <h2>Hint</h2>
            <p>{L.hints[0]}</p>
            {hintN > 1 && <p className="pir-hint__more">{L.hints[1]}</p>}
            {hintN < 2 && (
              <button type="button" className="pir-btn" onClick={() => setHintN(2)}>
                Show Another Hint
              </button>
            )}
            <button type="button" className="pir-btn pir-btn--primary" onClick={resume}>
              Back to the Room
            </button>
          </div>
        </div>
      )}
      {overlay === "howto" && (
        <div className="pir-screen pir-screen--dim">
          <HowTo onBack={() => setOverlay("paused")} />
        </div>
      )}
      {overlay === "settings" && (
        <div className="pir-screen pir-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setOverlay(screenRef.current === "play" ? "paused" : null)} />
        </div>
      )}
      {overlay === "confirmLeave" && (
        <Confirm
          title="Leave this room?"
          text="Your progress inside this room will be lost. Completed rooms stay unlocked."
          yes="Leave"
          no="Stay"
          onYes={toMenu}
          onNo={() => setOverlay("paused")}
        />
      )}
      {overlay === "confirmReset" && (
        <Confirm
          title="Reset all progress?"
          text="Every room except the first will be locked again and your best times will be erased."
          yes="Reset"
          no="Cancel"
          onYes={() => {
            const p = emptyProgress();
            saveProgress(p);
            progressRef.current = p;
            setProgress(p);
            setOverlay(null);
          }}
          onNo={() => setOverlay(null)}
        />
      )}
      {overlay === "complete" && result && (
        <div className="pir-screen pir-screen--dim">
          <div className="pir-panel pir-done" role="dialog" aria-label="Room Complete">
            <div className="pir-eyebrow">{`Room ${result.id} · ${getLevel(result.id).name}`}</div>
            <h2>Room Complete</h2>
            <div className="pir-stats">
              <div>
                <span className="pir-stats__label">Time</span>
                <span className="pir-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="pir-stats__label">Objects moved</span>
                <span className="pir-stats__val">{result.grabs}</span>
              </div>
              <div>
                <span className="pir-stats__label">Best</span>
                <span className="pir-stats__val">{fmt(result.best ? result.time : result.prev)}</span>
              </div>
            </div>
            {result.best && result.prev !== null && <div className="pir-badge">New best time!</div>}
            <p className="pir-dim">{`Room ${result.id + 1} is now unlocked.`}</p>
            <button type="button" className="pir-btn pir-btn--primary pir-btn--big" onClick={() => startLevel(result.id + 1)}>
              Next Room
            </button>
            <div className="pir-row">
              <button type="button" className="pir-btn" onClick={() => startLevel(result.id)}>
                Replay
              </button>
              <button type="button" className="pir-btn" onClick={toLevels}>
                Level Select
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay === "final" && result && (
        <div className="pir-screen pir-final">
          <div className="pir-panel pir-done pir-done--final" role="dialog" aria-label="Game Complete">
            <Logo />
            <div className="pir-eyebrow">All 20 rooms complete</div>
            <h2>Game Complete</h2>
            <p>You stepped through the Vanishing Point. Behind you, the impossible rooms fold back into a single line — and the world looks a little different now that you know how to see it.</p>
            <div className="pir-stats">
              <div>
                <span className="pir-stats__label">Final room</span>
                <span className="pir-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="pir-stats__label">Total best time</span>
                <span className="pir-stats__val">{fmt(Object.values(progress.done).reduce((a, d) => a + d.time, 0))}</span>
              </div>
            </div>
            <div className="pir-row">
              <button type="button" className="pir-btn pir-btn--primary" onClick={toLevels}>
                Level Select
              </button>
              <button type="button" className="pir-btn" onClick={toMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
