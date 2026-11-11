/**
 * Pharaoh's Secret: Lost Temple — first-person 3D escape-room adventure
 * through 20 chambers of an ancient Egyptian temple.
 *
 * One requestAnimationFrame loop steps the simulation (engine/sim.js) in
 * ≤1/60 s slices and draws it with plain Three.js (render/world.js); sound is
 * procedural WebAudio (audio.js). React renders only menus, overlays and a
 * HUD that changes on events (prompts, inventory, toasts) — walking and
 * looking never re-render React.
 *
 * All visible text is English source text: the Game Center's runtime
 * translator (i18n/gameTranslator.js + i18n/games/PharaohsSecret.json) swaps
 * it for Russian in place when the site language is Russian, and back again.
 * Sentences are kept whole in single text nodes so they translate as a unit.
 *
 * Controls: WASD move · mouse look (Pointer Lock) · Shift run · E interact ·
 * I inventory · H hint · R restart · Esc pause. `restartSignal` (Game Center
 * Restart) restarts the level; `muted` silences audio. DEV hook: `?phtest=1`
 * fakes pointer lock, disables rAF and exposes window.__ph (tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./PharaohsSecret.css";
import { createSim } from "./engine/sim.js";
import { getLevel, LEVELS, LEVEL_COUNT } from "./engine/levels.js";
import { ZONES } from "./engine/constants.js";
import { GLYPHS } from "./engine/glyphs.js";
import { ITEMS } from "./engine/items.js";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { loadProgress, saveProgress, recordCompletion, hasProgress, loadSettings, saveSettings, emptyProgress } from "./progress.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("phtest");
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
const STEP = 1 / 60;

const fmt = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s - m * 60);
  return `${m}:${r < 10 ? "0" : ""}${r}`;
};
const pad2 = (n) => String(n).padStart(2, "0");

/* ------------------------------------------------------------------ icons */
function Glyph({ id, className = "phs-glyph", color }) {
  const g = GLYPHS[id];
  if (!g) return null;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d={g.d} fillRule="evenodd" fill={color || "currentColor"} />
    </svg>
  );
}
const ICON_PATHS = {
  key: "M30 20A16 16 0 1 0 30.01 20ZM30 28A8 8 0 1 1 29.99 28ZM42 40L88 86L80 94L72 86L66 92L58 84L64 78L36 50Z",
  torch: "M44 40H56L54 95H46ZM50 4C62 16 66 28 58 38H42C34 28 38 16 50 4Z",
  mirror: "M50 6A30 30 0 1 1 49.99 6ZM50 14A22 22 0 1 0 50.01 14ZM45 64H55V95H45Z",
  scroll: "M18 20H82V30H18ZM24 30H76V74H24ZM18 74H82V84H18ZM32 40H68V44H32ZM32 50H68V54H32ZM32 60H58V64H32Z",
  heart: "M50 92L14 54C2 40 8 16 28 14C38 13 46 20 50 28C54 20 62 13 72 14C92 16 98 40 86 54Z",
  crook: "M46 95V30C46 12 60 6 70 10C80 14 82 26 74 32L68 26C72 22 70 16 64 16C58 16 56 22 56 30V95Z",
  flail: "M30 95L58 20L64 22L36 96ZM58 20L80 10L82 16L62 26ZM62 24L86 32L84 38L62 30ZM60 28L76 52L70 54L58 32Z",
  moon: GLYPHS.moon.d,
};
function ItemIcon({ id }) {
  const it = ITEMS[id];
  if (!it) return null;
  const d = it.glyph && !["crook", "flail"].includes(id) ? GLYPHS[it.glyph].d : ICON_PATHS[it.kind === "key" ? "key" : id] || GLYPHS.ankh.d;
  return (
    <svg viewBox="0 0 100 100" className="phs-icon" aria-hidden="true">
      <path d={d} fillRule="evenodd" fill={it.color} stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
    </svg>
  );
}
const Logo = () => (
  <svg viewBox="0 0 120 110" aria-hidden="true" className="phs-logo">
    <defs>
      <linearGradient id="phsg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffe9a8" />
        <stop offset="55%" stopColor="#e2a93a" />
        <stop offset="100%" stopColor="#8a5a1a" />
      </linearGradient>
    </defs>
    <path d="M60 4L116 104H4Z" fill="url(#phsg)" stroke="#5a3a10" strokeWidth="2" />
    <path d="M60 4L116 104H60Z" fill="rgba(0,0,0,0.22)" />
    <path d="M34 66C46 52 74 52 86 66C74 80 46 80 34 66Z" fill="#2a1a08" />
    <circle cx="60" cy="66" r="7" fill="#ffe9a8" />
    <path d="M52 78L48 92H53L56 78ZM68 78C70 88 78 90 82 85L84 88C78 96 66 92 65 78Z" fill="#2a1a08" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="phs-ico">
    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
  </svg>
);

/* ------------------------------------------------------------------ panels */
function Controls() {
  return (
    <dl className="phs-keys">
      <dt>W A S D</dt>
      <dd>Move</dd>
      <dt>Mouse</dt>
      <dd>Look around</dd>
      <dt>Shift</dt>
      <dd>Run</dd>
      <dt>E</dt>
      <dd>Interact, collect, read</dd>
      <dt>I</dt>
      <dd>Open the bag</dd>
      <dt>H</dt>
      <dd>Show a hint</dd>
      <dt>R</dt>
      <dd>Restart the level</dd>
      <dt>Esc</dt>
      <dd>Pause and release the mouse</dd>
    </dl>
  );
}

function HowTo({ onBack }) {
  return (
    <div className="phs-panel phs-howto" role="dialog" aria-label="How to Play">
      <h2>How to Play</h2>
      <div className="phs-howto__cols">
        <section>
          <h3>Your goal</h3>
          <p>Each chamber of the lost temple is sealed. Solve its puzzles and reach the glowing stairway of daylight to move on.</p>
          <h3>Ancient mechanisms</h3>
          <ul>
            <li>Read wall paintings, inscriptions and scrolls — they hold the clues.</li>
            <li>Symbol dials turn one sign at a time. Set them in the order the clue shows.</li>
            <li>Statues turn a quarter with each press. Their gaze matters.</li>
            <li>Pressure plates need weight: your own, or a pushed stone block.</li>
            <li>Bronze mirrors turn to guide the light of Ra onto golden disks.</li>
            <li>Keys and relics go into your bag. Pedestals show the sign of the relic they want.</li>
            <li>Loose stones hide secret passages. Look closely at the walls.</li>
          </ul>
          <h3>Traps</h3>
          <ul>
            <li>Spikes rise in a rhythm — cross while they are down.</li>
            <li>Cracked floors crumble: never stop on them.</li>
            <li>Blades and boulders move in patterns. Wait for an opening.</li>
            <li>If you fall, you return to the last safe place. Your items stay with you.</li>
          </ul>
        </section>
        <section>
          <h3>Controls</h3>
          <Controls />
          <p className="phs-dim">Click the view to capture the mouse. A keyboard and mouse are required.</p>
        </section>
      </div>
      <button type="button" className="phs-btn phs-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function Settings({ settings, onChange, onBack, onReset }) {
  const Toggle = ({ k, label }) => (
    <div className="phs-field">
      <span>{label}</span>
      <button type="button" className={`phs-toggle${settings[k] ? " is-on" : ""}`} aria-pressed={!!settings[k]} aria-label={label} onClick={() => onChange({ [k]: !settings[k] })}>
        {settings[k] ? "On" : "Off"}
      </button>
    </div>
  );
  return (
    <div className="phs-panel phs-settings" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <label className="phs-field">
        <span>Mouse sensitivity</span>
        <input type="range" min="0.2" max="3" step="0.05" value={settings.sens} aria-label="Mouse sensitivity" onChange={(e) => onChange({ sens: Number(e.target.value) })} />
        <output>{settings.sens.toFixed(2)}</output>
      </label>
      <label className="phs-field">
        <span>Field of view</span>
        <input type="range" min="60" max="100" step="1" value={settings.fov} aria-label="Field of view" onChange={(e) => onChange({ fov: Number(e.target.value) })} />
        <output>{settings.fov}°</output>
      </label>
      <label className="phs-field">
        <span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} aria-label="Volume" onChange={(e) => onChange({ volume: Number(e.target.value) })} />
        <output>{Math.round(settings.volume * 100)}%</output>
      </label>
      <Toggle k="invertY" label="Invert vertical look" />
      <div className="phs-field">
        <span>Sound</span>
        <button type="button" className={`phs-toggle${!settings.mute ? " is-on" : ""}`} aria-pressed={!settings.mute} aria-label="Sound" onClick={() => onChange({ mute: !settings.mute })}>
          {settings.mute ? "Off" : "On"}
        </button>
      </div>
      <Toggle k="hints" label="Tutorial tips" />
      <div className="phs-field">
        <span>Graphics</span>
        <div className="phs-seg" role="group" aria-label="Graphics">
          <button type="button" className={settings.quality === "high" ? "is-on" : ""} aria-pressed={settings.quality === "high"} onClick={() => onChange({ quality: "high" })}>
            High
          </button>
          <button type="button" className={settings.quality === "low" ? "is-on" : ""} aria-pressed={settings.quality === "low"} onClick={() => onChange({ quality: "low" })}>
            Fast
          </button>
        </div>
      </div>
      <div className="phs-settings__foot">
        {onReset && (
          <button type="button" className="phs-btn phs-btn--danger" onClick={onReset}>
            Reset progress
          </button>
        )}
        <button type="button" className="phs-btn phs-btn--primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function Confirm({ title, text, yes, no, onYes, onNo }) {
  return (
    <div className="phs-screen phs-screen--dim">
      <div className="phs-panel phs-confirm" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="phs-row">
          <button type="button" className="phs-btn phs-btn--danger" onClick={onYes}>
            {yes}
          </button>
          <button type="button" className="phs-btn phs-btn--primary" onClick={onNo}>
            {no}
          </button>
        </div>
      </div>
    </div>
  );
}

function LevelSelect({ progress, onPlay, onBack }) {
  return (
    <div className="phs-panel phs-levels" role="dialog" aria-label="Level Select">
      <div className="phs-levels__head">
        <h2>Level Select</h2>
        <span className="phs-dim">{`${Object.keys(progress.done).length} / ${LEVEL_COUNT} chambers complete`}</span>
      </div>
      <div className="phs-levels__scroll">
        {ZONES.map((z) => (
          <section key={z.id} className="phs-zone" style={{ "--acc": z.accent }}>
            <h3>{z.name}</h3>
            <div className="phs-levels__grid">
              {LEVELS.filter((l) => l.zone === z.id).map((l) => {
                const locked = l.id > progress.unlocked;
                const done = progress.done[l.id];
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`phs-lvl${locked ? " is-locked" : ""}${done ? " is-done" : ""}`}
                    disabled={locked}
                    onClick={() => onPlay(l.id)}
                    aria-label={locked ? `Level ${l.id}, locked` : `Level ${l.id}: ${l.name}`}
                  >
                    <span className="phs-lvl__no">{pad2(l.id)}</span>
                    <span className="phs-lvl__name">{locked ? "Locked" : l.name}</span>
                    <span className="phs-lvl__meta">{locked ? <LockIcon /> : done ? <span>{`Best ${fmt(done.time)}`}</span> : <span>New</span>}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <button type="button" className="phs-btn phs-btn--primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function CluePanel({ clue, onClose }) {
  return (
    <div className="phs-screen phs-screen--dim">
      <div className="phs-panel phs-clue" role="dialog" aria-label={clue.title}>
        <h2>{clue.title}</h2>
        {clue.glyphs?.length > 0 && (
          <div className="phs-clue__glyphs">
            {clue.glyphs.map((g, i) => (
              <figure key={`${g}${i}`}>
                <Glyph id={g} />
                <figcaption>{GLYPHS[g].name}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <p className="phs-clue__text">{clue.text}</p>
        <button type="button" className="phs-btn phs-btn--primary" onClick={onClose}>
          Back to the Temple
        </button>
      </div>
    </div>
  );
}

function Inventory({ inv, onRead, onClose }) {
  return (
    <div className="phs-screen phs-screen--dim">
      <div className="phs-panel phs-inv" role="dialog" aria-label="Bag">
        <h2>Bag</h2>
        {inv.length === 0 ? (
          <p className="phs-dim">Your bag is empty.</p>
        ) : (
          <ul className="phs-inv__list">
            {inv.map((x, i) => (
              <li key={`${x.item}${i}`}>
                <ItemIcon id={x.item} />
                <div>
                  <div className="phs-inv__name">{ITEMS[x.item].name}</div>
                  <div className="phs-dim phs-small">{ITEMS[x.item].desc}</div>
                </div>
                {x.clue && (
                  <button type="button" className="phs-btn" onClick={() => onRead(x.clue)}>
                    Read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="phs-btn phs-btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

const DEATH_TEXT = {
  spikes: "The spikes caught you. Back to the last safe place.",
  pit: "You fell into the darkness. Back to the last safe place.",
  trap: "The false stone gave way beneath you. Back to the last safe place.",
  blade: "The blade struck you. Back to the last safe place.",
  boulder: "The boulder crushed you. Back to the last safe place.",
  collapse: "The temple collapsed on you. Try again — faster!",
};

/* ------------------------------------------------------------------ main */
export default function PharaohsSecret({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const flashRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const menuSimRef = useRef(null);
  const keys = useRef(new Set());
  const look = useRef({ x: 0, y: 0 });
  const queued = useRef({ use: false });
  const lockedRef = useRef(false);
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const levelRef = useRef(1);
  const frame = useRef(() => {});
  const timers = useRef(new Set());
  const hudRef = useRef({ focus: null, inv: "", escape: "" });
  const settingsRef = useRef(loadSettings());
  const stepRef = useRef(0);
  const tickRef = useRef(0);
  const botRef = useRef(null);

  const [screen, setScreenState] = useState("menu"); // menu | levels | howto | settings | loading | play
  const [overlay, setOverlayState] = useState(null); // null | paused | complete | final | confirmLeave | confirmReset | howto | settings | hint | clue | inventory
  const [settings, setSettings] = useState(settingsRef.current);
  const [progress, setProgress] = useState(loadProgress);
  const [level, setLevel] = useState(1);
  const [locked, setLocked] = useState(false);
  const [lockHint, setLockHint] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [hud, setHud] = useState({ focus: null, inv: [], escape: null });
  const [toasts, setToasts] = useState([]);
  const [intro, setIntro] = useState(null);
  const [result, setResult] = useState(null);
  const [returnTo, setReturnTo] = useState("menu");
  const [clue, setClue] = useState(null);
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
      later(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "long" ? 5600 : 3000);
    },
    [later],
  );
  const flash = useCallback((cls) => {
    const el = flashRef.current;
    if (!el) return;
    el.className = "phs-flash";
    void el.offsetWidth;
    el.className = `phs-flash is-${cls}`;
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
    const L = getLevel(6);
    const s = createSim(L);
    s.player.x = 5.2;
    s.player.z = 20.4;
    s.player.pitch = 0.06;
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
      setClue(null);
      setHintN(1);
      setOverlay(null);
      keys.current.clear();
      look.current = { x: 0, y: 0 };
      queued.current = { use: false };
      setScreen("loading");
      requestLock();
      const begin = () => {
        const s = createSim(L);
        simRef.current = s;
        world.setLevel(L, s);
        hudRef.current = { focus: null, inv: "", escape: "" };
        setHud({ focus: null, inv: [], escape: null });
        setScreen("play");
        setIntro({ id, key: Date.now() });
        later(() => setIntro(null), 4600);
        if (L.tip && settingsRef.current.hints) later(() => toast(L.tip, "long"), 1200);
        const next = { ...progressRef.current, last: id };
        progressRef.current = next;
        setProgress(next);
        saveProgress(next);
      };
      if (TEST) begin();
      else later(begin, 420);
    },
    [clearTimers, later, requestLock, setOverlay, setScreen, toast],
  );
  const restartLevel = useCallback(() => {
    if (screenRef.current !== "play") return;
    const L = getLevel(levelRef.current);
    const s = createSim(L);
    simRef.current = s;
    worldRef.current?.setLevel(L, s);
    hudRef.current = { focus: null, inv: "", escape: "" };
    setHud({ focus: null, inv: [], escape: null });
    setOverlay(null);
    setClue(null);
    setToasts([]);
    keys.current.clear();
    flash("restart");
    audio.play("respawn");
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
      setClue(null);
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
    setClue(null);
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
    setResult({ id, time: s.t, deaths: s.stats.deaths, best, prev: prev?.time ?? null });
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
      const name = (id) => ITEMS[id]?.name || id;
      for (const e of evs) {
        switch (e.type) {
          case "pickup":
            audio.play("pickup");
            toast(`${name(e.item)} added to your bag.`, "good");
            break;
          case "note":
            toast("Press I to open your bag and read the scroll.", "long");
            break;
          case "chestOpen":
            audio.play("chest");
            break;
          case "empty":
            toast("Empty — only dust and old linen.");
            break;
          case "unlock":
            audio.play("unlock");
            toast(`You used the ${name(e.item)}.`);
            break;
          case "needItem":
            audio.play("deny");
            toast(`Locked. You need the ${name(e.item)}.`, "bad");
            break;
          case "sealed":
            audio.play("deny");
            toast("Sealed by an ancient mechanism. Solve the chamber's puzzle.", "bad");
            break;
          case "dial":
            audio.play("dial");
            break;
          case "solve":
            audio.play("solve");
            toast(e.seq ? "The flames burn as one!" : "The symbols lock into place!", "good");
            break;
          case "read": {
            const c = s.L.clues?.[e.clue];
            if (c) {
              audio.play("read");
              setClue(c);
              keys.current.clear();
              setOverlay("clue");
              releaseLock();
            }
            break;
          }
          case "statue":
          case "mirror":
            audio.play("grind");
            break;
          case "push":
            audio.play("push");
            break;
          case "pushFail":
            audio.play("deny");
            toast("It will not move that way.");
            break;
          case "lever":
            audio.play("lever");
            if (e.hidden) toast("A hidden mechanism clicks somewhere in the walls.", "good");
            break;
          case "wantItem":
            audio.play("deny");
            toast(`The ${name(e.item)} belongs here.`);
            break;
          case "place":
            audio.play("solve");
            toast(`${name(e.item)} placed.`, "good");
            break;
          case "needFlame":
            audio.play("deny");
            toast("You need a flame to light it.");
            break;
          case "haveTorch":
            toast("You already carry a torch.");
            break;
          case "brazier":
            audio.play("flame");
            break;
          case "seqFail":
            audio.play("fizzle");
            toast("Wrong order — every flame dies out.", "bad");
            break;
          case "plateOn":
          case "plateOff":
            audio.play("plate");
            break;
          case "doorOpen":
            audio.play("door");
            if (e.secret) toast("A hidden passage opens!", "good");
            else if (e.by === "mech") toast("Stone grinds against stone — a door is opening.", "good");
            break;
          case "doorClose":
            audio.play("doorClose");
            break;
          case "lightOn":
            audio.play("light");
            toast("The golden disk blazes with sunlight!", "good");
            break;
          case "crack":
            audio.play("crack");
            break;
          case "collapse":
            audio.play("collapse");
            break;
          case "fill":
            audio.play("collapse");
            toast("The block fills the pit.");
            break;
          case "death":
            audio.play("death");
            flash("death");
            toast(DEATH_TEXT[e.reason] || DEATH_TEXT.pit, "bad");
            break;
          case "respawn":
            audio.play("respawn");
            break;
          case "checkpoint":
            audio.play("checkpoint");
            break;
          case "escapeStart":
            audio.play("rumble");
            flash("curse");
            toast("The curse awakens! The temple is collapsing — run for the exit!", "long");
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
    [complete, flash, later, releaseLock, setOverlay, toast],
  );

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage, { preserve: TEST });
    } catch (err) {
      console.error("Pharaoh's Secret: WebGL unavailable", err);
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
      const running = !overlayRef.current && s.state !== "complete" && (lockedRef.current || botRef.current);
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
              run: k.has("ShiftLeft") || k.has("ShiftRight"),
            };
            if (i === 0) {
              input.lookX = look.current.x * sens;
              input.lookY = look.current.y * sens * (settingsRef.current.invertY ? -1 : 1);
              look.current = { x: 0, y: 0 };
              input.use = queued.current.use;
              queued.current = { use: false };
            }
          }
          s.update(h, input);
          handleEvents(s);
          if (s.state === "complete" || overlayRef.current) break;
        }
        // footsteps
        const p = s.player;
        if (p.speed > 1 && s.state === "play") {
          const stepN = Math.floor(p.bob / Math.PI);
          if (stepN !== stepRef.current) {
            stepRef.current = stepN;
            audio.play("step");
          }
        }
        // countdown ticks
        if (s.escape && s.state === "play") {
          const sec = Math.ceil(s.escape.left);
          if (sec !== tickRef.current) {
            tickRef.current = sec;
            if (sec <= 10) audio.play("tick");
          }
        }
        // HUD state that changes rarely → React only on change
        const f = s.focus;
        const focus = f ? { verb: f.verb, name: f.name, locked: !!f.locked } : null;
        const invKey = s.inv.map((x) => x.item).join(",");
        const esc = s.escape ? String(Math.max(0, Math.ceil(s.escape.left))) : "";
        const cur = hudRef.current;
        const fk = focus ? `${focus.verb}|${focus.name}` : "";
        if (fk !== cur.focus || invKey !== cur.inv || esc !== cur.escape) {
          hudRef.current = { focus: fk, inv: invKey, escape: esc };
          setHud({ focus, inv: s.inv.slice(), escape: esc || null });
        }
      } else if (s.events.length) handleEvents(s);
      world.render(s, running ? dt : dt * 0.25);
    } else {
      const ms = menuSimRef.current;
      if (ms) {
        ms.t += dt;
        ms.player.yaw = -0.42 + Math.sin(ms.t * 0.11) * 0.3;
        ms.player.bob = 0;
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
        if ((ov === "inventory" && e.code === "KeyI") || (ov === "clue" && e.code === "KeyE") || (ov === "hint" && e.code === "KeyH")) {
          e.preventDefault();
          actions.current.resume();
        } else if (e.code === "Escape" && TEST && (ov === "paused" || ov === "clue" || ov === "inventory" || ov === "hint")) actions.current.resume();
        return;
      }
      if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
      if (e.repeat) return;
      if (e.code === "KeyE") {
        e.preventDefault();
        queued.current.use = true;
      } else if (e.code === "KeyR") {
        e.preventDefault();
        actions.current.restartLevel();
      } else if (e.code === "KeyI") {
        e.preventDefault();
        actions.current.openOverlay("inventory");
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
    const blur = () => keys.current.clear();
    const vis = () => {
      if (document.hidden && !TEST) actions.current.pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("mousemove", move);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    const root = rootRef.current;
    const ctx = (e) => e.preventDefault();
    const wheel = (e) => {
      if (screenRef.current === "play") e.preventDefault();
    };
    root?.addEventListener("contextmenu", ctx);
    root?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("mousemove", move);
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
    window.__ph = {
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
      delete window.__ph;
    };
  }, [startLevel, restartLevel, toMenu, pause, resume]);

  /* ------------------------------------------------------------ render */
  const L = getLevel(level);
  const zone = ZONES[L?.zone ?? 0];
  const inPlay = screen === "play";
  const canContinue = hasProgress(progress);
  const continueId = Math.max(1, Math.min(progress.last, progress.unlocked));
  const doneCount = Object.keys(progress.done).length;

  return (
    <div
      ref={rootRef}
      className={`phs phs--${screen}${overlay ? " has-overlay" : ""}`}
      style={{ "--acc": zone.accent }}
      onClick={(e) => {
        if (e.target.closest?.("button, input, label, a")) return;
        if (screenRef.current === "play" && !overlayRef.current && !lockedRef.current) requestLock();
      }}
    >
      <div ref={stageRef} className="phs-stage" aria-hidden="true" />
      <div className="phs-vignette" />
      <div ref={flashRef} className="phs-flash" />

      {/* ------------------------------------------------ HUD */}
      {inPlay && L && (
        <div className={`phs-hud${overlay ? " is-dim" : ""}`}>
          <div className="phs-hud__level">
            <div className="phs-hud__title">
              <span className="phs-hud__no">{pad2(level)}</span>
              <span className="phs-hud__name">{L.name}</span>
            </div>
            <div className="phs-hud__obj">
              <span className="phs-hud__label">Objective</span>
              <span>{L.objective}</span>
            </div>
          </div>
          <div className="phs-hud__bag" aria-label="Bag">
            {hud.inv.map((x, i) => (
              <span key={`${x.item}${i}`} className="phs-hud__item" title={ITEMS[x.item].name} aria-label={ITEMS[x.item].name}>
                <ItemIcon id={x.item} />
              </span>
            ))}
          </div>
          {hud.escape && (
            <div className={`phs-escape${Number(hud.escape) <= 10 ? " is-urgent" : ""}`} role="timer" aria-label="Collapse countdown">
              <span className="phs-hud__label">The temple collapses in</span>
              <span className="phs-escape__time">{hud.escape}</span>
            </div>
          )}
          <div className="phs-cross" aria-hidden="true" />
          {hud.focus && (
            <div className={`phs-prompt${hud.focus.locked ? " is-locked" : ""}`}>
              {hud.focus.locked ? <LockIcon /> : <kbd>E</kbd>}
              <span className="phs-prompt__verb">{hud.focus.verb}</span>
              <span className="phs-prompt__name">{hud.focus.name}</span>
            </div>
          )}
          <div className="phs-hud__keys">
            <span>
              <kbd>I</kbd> Bag
            </span>
            <span>
              <kbd>H</kbd> Hint
            </span>
            <span>
              <kbd>R</kbd> Restart
            </span>
            <span>
              <kbd>Esc</kbd> Pause
            </span>
          </div>
          <div className="phs-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`phs-toast${t.kind ? ` is-${t.kind}` : ""}`}>
                {t.text}
              </div>
            ))}
          </div>
          {intro && (
            <div key={intro.key} className="phs-intro">
              <div className="phs-intro__zone">{zone.name}</div>
              <div className="phs-intro__no">{`Level ${intro.id}`}</div>
              <div className="phs-intro__name">{L.name}</div>
              <div className="phs-intro__obj">{L.objective}</div>
            </div>
          )}
          {!locked && !overlay && <div className="phs-clickhint">Click to capture the mouse and play</div>}
        </div>
      )}

      {/* ------------------------------------------------ menus */}
      {screen === "menu" && (
        <div className="phs-screen phs-menu">
          <div className="phs-menu__brand">
            <Logo />
            <div>
              <div className="phs-menu__eyebrow">Escape Room · Adventure · Puzzle</div>
              <h1 className="phs-menu__title">Pharaoh&apos;s Secret</h1>
              <div className="phs-menu__sub">Lost Temple</div>
            </div>
          </div>
          <p className="phs-menu__tag">Unlock the Past. Escape the Curse.</p>
          <div className="phs-menu__actions">
            <button type="button" className="phs-btn phs-btn--primary phs-btn--big" disabled={noGL} onClick={() => startLevel(1)}>
              Play
            </button>
            {canContinue && (
              <button type="button" className="phs-btn phs-btn--big" disabled={noGL} onClick={() => startLevel(continueId)}>
                <span>Continue</span>
                <span className="phs-btn__sub">{`Level ${continueId}`}</span>
              </button>
            )}
            <button type="button" className="phs-btn" disabled={noGL} onClick={() => setScreen("levels")}>
              Level Select
            </button>
            <button type="button" className="phs-btn" onClick={() => setScreen("howto")}>
              How to Play
            </button>
            <button
              type="button"
              className="phs-btn"
              onClick={() => {
                setReturnTo("menu");
                setScreen("settings");
              }}
            >
              Settings
            </button>
          </div>
          <div className="phs-menu__foot">
            <span>{`${doneCount} / ${LEVEL_COUNT} chambers complete`}</span>
            {TOUCH && <span className="phs-warn">This game needs a keyboard and mouse.</span>}
            {noGL && <span className="phs-warn">3D graphics are not available in this browser.</span>}
          </div>
        </div>
      )}
      {screen === "levels" && (
        <div className="phs-screen phs-screen--dim">
          <LevelSelect progress={progress} onPlay={startLevel} onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "howto" && (
        <div className="phs-screen phs-screen--dim">
          <HowTo onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "settings" && !overlay && (
        <div className="phs-screen phs-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setScreen(returnTo)} onReset={() => setOverlay("confirmReset")} />
        </div>
      )}
      {screen === "loading" && (
        <div className="phs-screen phs-loading" role="status" aria-label="Loading">
          <Logo />
          <div className="phs-loading__text">Entering the chamber…</div>
          <div className="phs-dim">{`Level ${level} · ${L?.name}`}</div>
        </div>
      )}

      {/* ------------------------------------------------ overlays */}
      {overlay === "paused" && (
        <div className="phs-screen phs-screen--dim">
          <div className="phs-panel phs-pause" role="dialog" aria-label="Paused">
            <div className="phs-eyebrow">{`Level ${level} · ${L?.name}`}</div>
            <h2>Paused</h2>
            <p className="phs-dim">{L?.objective}</p>
            <button type="button" className="phs-btn phs-btn--primary" onClick={resume}>
              Resume
            </button>
            {lockHint && <p className="phs-dim phs-small">Click Resume again to capture the mouse.</p>}
            <button type="button" className="phs-btn" onClick={restartLevel}>
              Restart Level
            </button>
            <div className="phs-row">
              <button type="button" className="phs-btn phs-btn--ghost" onClick={() => setOverlay("hint")}>
                Show Hint
              </button>
              <button type="button" className="phs-btn phs-btn--ghost" onClick={() => setOverlay("inventory")}>
                Bag
              </button>
            </div>
            <div className="phs-row">
              <button type="button" className="phs-btn phs-btn--ghost" onClick={() => setOverlay("howto")}>
                How to Play
              </button>
              <button type="button" className="phs-btn phs-btn--ghost" onClick={() => setOverlay("settings")}>
                Settings
              </button>
            </div>
            <button type="button" className="phs-btn phs-btn--ghost" onClick={() => setOverlay("confirmLeave")}>
              Exit to Menu
            </button>
          </div>
        </div>
      )}
      {overlay === "hint" && L && (
        <div className="phs-screen phs-screen--dim">
          <div className="phs-panel phs-hint" role="dialog" aria-label="Hint">
            <div className="phs-eyebrow">{`Level ${level} · ${L.name}`}</div>
            <h2>Hint</h2>
            <p>{L.hints[0]}</p>
            {hintN > 1 && <p className="phs-hint__more">{L.hints[1]}</p>}
            {hintN < 2 && (
              <button type="button" className="phs-btn" onClick={() => setHintN(2)}>
                Show Another Hint
              </button>
            )}
            <button type="button" className="phs-btn phs-btn--primary" onClick={resume}>
              Back to the Temple
            </button>
          </div>
        </div>
      )}
      {overlay === "clue" && clue && <CluePanel clue={clue} onClose={resume} />}
      {overlay === "inventory" && (
        <Inventory
          inv={simRef.current?.inv || []}
          onRead={(id) => {
            const c = simRef.current?.L.clues?.[id];
            if (!c) return;
            audio.play("read");
            setClue(c);
            setOverlay("clue");
          }}
          onClose={resume}
        />
      )}
      {overlay === "howto" && (
        <div className="phs-screen phs-screen--dim">
          <HowTo onBack={() => setOverlay("paused")} />
        </div>
      )}
      {overlay === "settings" && (
        <div className="phs-screen phs-screen--dim">
          <Settings settings={settings} onChange={changeSettings} onBack={() => setOverlay(screenRef.current === "play" ? "paused" : null)} />
        </div>
      )}
      {overlay === "confirmLeave" && (
        <Confirm
          title="Leave this level?"
          text="Your progress inside this chamber will be lost. Completed levels stay unlocked."
          yes="Leave"
          no="Stay"
          onYes={toMenu}
          onNo={() => setOverlay("paused")}
        />
      )}
      {overlay === "confirmReset" && (
        <Confirm
          title="Reset all progress?"
          text="Every level except the first will be locked again and your best times will be erased."
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
        <div className="phs-screen phs-screen--dim">
          <div className="phs-panel phs-done" role="dialog" aria-label="Level Complete">
            <div className="phs-eyebrow">{`Level ${result.id} · ${getLevel(result.id).name}`}</div>
            <h2>Level Complete</h2>
            <div className="phs-stats">
              <div>
                <span className="phs-stats__label">Time</span>
                <span className="phs-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="phs-stats__label">Falls</span>
                <span className="phs-stats__val">{result.deaths}</span>
              </div>
              <div>
                <span className="phs-stats__label">Best</span>
                <span className="phs-stats__val">{fmt(result.best ? result.time : result.prev)}</span>
              </div>
            </div>
            {result.best && result.prev !== null && <div className="phs-badge">New best time!</div>}
            <p className="phs-dim">{`Level ${result.id + 1} is now unlocked.`}</p>
            <button type="button" className="phs-btn phs-btn--primary phs-btn--big" onClick={() => startLevel(result.id + 1)}>
              Next Level
            </button>
            <div className="phs-row">
              <button type="button" className="phs-btn" onClick={() => startLevel(result.id)}>
                Replay
              </button>
              <button type="button" className="phs-btn" onClick={toLevels}>
                Level Select
              </button>
            </div>
          </div>
        </div>
      )}
      {overlay === "final" && result && (
        <div className="phs-screen phs-final">
          <div className="phs-panel phs-done phs-done--final" role="dialog" aria-label="Game Complete">
            <Logo />
            <div className="phs-eyebrow">All 20 chambers complete</div>
            <h2>Game Complete</h2>
            <p>You burst out into the desert sun as the Lost Temple sinks beneath the sand. The Heart of the Pharaoh glows in your hands — the secret is yours, and the curse is broken.</p>
            <div className="phs-stats">
              <div>
                <span className="phs-stats__label">Final escape</span>
                <span className="phs-stats__val">{fmt(result.time)}</span>
              </div>
              <div>
                <span className="phs-stats__label">Total best time</span>
                <span className="phs-stats__val">{fmt(Object.values(progress.done).reduce((a, d) => a + d.time, 0))}</span>
              </div>
            </div>
            <div className="phs-row">
              <button type="button" className="phs-btn phs-btn--primary" onClick={toLevels}>
                Level Select
              </button>
              <button type="button" className="phs-btn" onClick={toMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
