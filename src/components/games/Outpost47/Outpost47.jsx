/**
 * Outpost 47: Frozen Secrets — first-person escape room / mystery survival.
 *
 * One requestAnimationFrame loop steps the Game (sim.js) and draws it with
 * plain Three.js (world.js). React renders the menus, journal, inventory,
 * documents and puzzle panels; the fast HUD (temperature, prompt, battery)
 * is written to DOM refs ~10×/s so walking never re-renders React.
 *
 * Controls: WASD move · mouse look (Pointer Lock) · Shift sprint · C / Ctrl
 * crouch · Space jump · E interact · F flashlight · I / Tab inventory ·
 * J journal · H hint · Esc pause. Touch devices get a stick + buttons.
 * Panels release the pointer and freeze the world. `restartSignal` starts a
 * new game; `muted` silences audio. Progress saves to localStorage on every
 * meaningful event and every 10 s. DEV hook: `?o47test=1` exposes window.__o47.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./Outpost47.css";
import { Game, readSave, LAYOUT } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { PUZZLE_UI, Glyph } from "./Puzzles.jsx";
import { SAVE_KEY, SETTINGS_KEY, RECORD_KEY, ITEMS, DOCS, PUZZLES, CHAPTERS, ENDINGS, ROOMS, UX, BOUNDS } from "./data.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("o47test");
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyC", "ControlLeft", "ControlRight", "Tab"]);
const TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

function store(key, val) {
  try {
    if (val == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}
function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function readProgress() {
  try {
    return readSave(window.localStorage, SAVE_KEY);
  } catch {
    return null; // storage blocked
  }
}
function loadSettings() {
  const s = load(SETTINGS_KEY, {}) || {};
  return {
    sens: Number.isFinite(s.sens) ? Math.min(3, Math.max(0.2, s.sens)) : 1,
    invertY: !!s.invertY,
    headBob: s.headBob !== false,
    volume: Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : 0.8,
    hints: s.hints !== false,
  };
}
const fmtTime = (s) => {
  s = Math.floor(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};
const bodyTemp = (t) => (32 + (5 * Math.max(0, t)) / 100).toFixed(1);

/* ------------------------------------------------------------------ icons */
function Icon({ id, size = 26 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (id) {
    case "card":
      return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></svg>;
    case "battery":
      return <svg {...p}><rect x="3" y="8" width="16" height="8" rx="1.5" /><path d="M21 11v2M6 11v2M9 11v2" /></svg>;
    case "tool":
      return <svg {...p}><path d="M14 6l4 4M5 19l9-9M14 6c1-2 4-3 6-2l-3 3 1 2 2 1 3-3c1 2 0 5-2 6" /></svg>;
    case "part":
      return <svg {...p}><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></svg>;
    case "gear":
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /><circle cx="12" cy="12" r="6.5" /></svg>;
    case "sample":
      return <svg {...p}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M7 15h10" /></svg>;
    case "code":
      return <svg {...p}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>;
    case "flashlight":
      return <svg {...p}><path d="M7 3h10l-2 6H9L7 3ZM9 9v11h6V9" /><path d="M12 13v3" /></svg>;
    case "doc":
      return <svg {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></svg>;
    case "temp":
      return <svg {...p}><path d="M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0Z" /><path d="M12 9v7" /></svg>;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ station map */
function StationMap({ game }) {
  const under = game.player.x > UX - 100;
  const rooms = ROOMS.filter((r) => (r.x1 > UX - 100) === under);
  const box = under ? { x1: UX - 16, x2: UX + 58, z1: -84, z2: 66 } : { x1: -30, x2: 62, z1: -66, z2: 80 };
  const p = game.player;
  // a window around the player (clamped to the region) keeps rooms readable
  const W = 96, H = 60;
  const vx = Math.max(box.x1, Math.min(box.x2 - W, p.x - W / 2)), vz = Math.max(box.z1, Math.min(box.z2 - H, p.z - H / 2));
  return (
    <div className="o47-map">
      <svg viewBox={`${vx} ${vz} ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {!under && <rect x={BOUNDS.x1} y={BOUNDS.z1} width={BOUNDS.x2 - BOUNDS.x1} height={BOUNDS.z2 - BOUNDS.z1} className="o47-map__ground" />}
        {!under && <path d="M-60 -60 H3 V-58.5 H9 V-60 H62" className="o47-map__ridge" />}
        {rooms.map((r) => {
          const seen = game.f["seen_" + r.id];
          return (
            <g key={r.id} className={seen ? "is-seen" : ""}>
              <rect x={r.x1} y={r.z1} width={r.x2 - r.x1} height={r.z2 - r.z1} />
              {seen && (r.x2 - r.x1) > 5 && <text x={(r.x1 + r.x2) / 2} y={(r.z1 + r.z2) / 2}>{r.name.replace(/ —.*/, "").replace("Outpost", "")}</text>}
            </g>
          );
        })}
        {Object.values(LAYOUT.doors).filter((d) => (d.x > UX - 100) === under).map((d) => (
          <rect key={d.id} x={d.x - (d.axis === "x" ? d.w / 2 : 0.3)} y={d.z - (d.axis === "z" ? d.w / 2 : 0.3)} width={d.axis === "x" ? d.w : 0.6} height={d.axis === "z" ? d.w : 0.6} className={game.doorsOpen[d.id] ? "o47-map__door is-open" : "o47-map__door"} />
        ))}
        {!under && game.f.scanned && <circle cx="6" cy="-58" r="2.5" className="o47-map__mark" />}
        <g transform={`translate(${p.x} ${p.z}) rotate(${(-p.yaw * 180) / Math.PI})`}>
          <path d="M0 -3.2 L2.2 2.4 L0 1.2 L-2.2 2.4 Z" className="o47-map__me" />
        </g>
      </svg>
      <div className="o47-map__legend">{under ? "Underground — Sublevel" : "Surface — Outpost 47"} · rooms appear once visited</div>
    </div>
  );
}

/* ================================================================== component */
export default function Outpost47({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const menuGame = useRef(null);
  if (!menuGame.current) menuGame.current = new Game();
  const screenRef = useRef("menu");
  const panelRef = useRef(null);
  const cardRef = useRef(null);
  const lockedRef = useRef(false);
  const keys = useRef(new Set());
  const touchMove = useRef({ x: 0, y: 0 });
  const touchFlags = useRef({ sprint: false, crouch: false, jump: false });
  const hud = useRef({});
  const settingsRef = useRef(null);
  if (!settingsRef.current) settingsRef.current = loadSettings();

  const [screen, setScreenState] = useState("menu"); // menu | play | ending
  const [menuView, setMenuView] = useState("main"); // main | settings | chapters | confirm
  const [panel, setPanelState] = useState(null);
  const [locked, setLocked] = useState(false);
  const [saveInfo, setSaveInfo] = useState(() => readProgress());
  const [records, setRecords] = useState(() => load(RECORD_KEY, null) || { endings: {}, runs: 0, best: 0 });
  const [settings, setSettings] = useState(settingsRef.current);
  const [toasts, setToasts] = useState([]);
  const [subs, setSubs] = useState([]);
  const [card, setCardState] = useState(null);
  const [zoneTitle, setZoneTitle] = useState(null);
  const [mission, setMission] = useState(null);
  const [ending, setEnding] = useState(null);
  const [solvedFlash, setSolvedFlash] = useState(false);
  const [newDoc, setNewDoc] = useState(false);
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setPanel = useCallback((p) => {
    panelRef.current = p;
    setPanelState(p);
  }, []);
  const setCard = useCallback((c) => {
    cardRef.current = c;
    setCardState(c);
  }, []);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const timeouts = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timeouts.current.delete(id);
      fn();
    }, ms);
    timeouts.current.add(id);
  }, []);
  const toast = useCallback((text, kind = "info", ms = 3200) => {
    const id = ++fid.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    later(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, [later]);
  const subtitle = useCallback((who, text, ms) => {
    const id = ++fid.current;
    setSubs((t) => [...t.slice(-1), { id, who, text }]);
    later(() => setSubs((t) => t.filter((x) => x.id !== id)), ms || Math.max(3600, text.length * 62));
  }, [later]);

  /* ------------------------------------------------------------ save */
  const saveNow = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.ended || screenRef.current !== "play" || (TEST && PARAMS.has("nosave"))) return;
    const s = g.serialize();
    if (store(SAVE_KEY, s)) setSaveInfo(s);
    g.dirty = false;
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST || TOUCH) {
      lockedRef.current = true;
      setLocked(true);
      return;
    }
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* not allowed right now — the pause overlay stays up */
    }
  }, []);
  const releaseLock = useCallback(() => {
    if (TEST || TOUCH) {
      lockedRef.current = false;
      setLocked(false);
      return;
    }
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
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
      if (!l && screenRef.current === "play") {
        saveNow();
        if (!panelRef.current && !cardRef.current) setPanel({ type: "pause" });
      }
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [saveNow, setPanel]);

  /* ------------------------------------------------------------ panels */
  const openPanel = useCallback((p) => {
    keys.current.clear();
    const g = gameRef.current;
    if (g) g.player.vx = g.player.vz = 0;
    setPanel(p);
    if (p.type === "doc") audio.cue("doc");
    else audio.cue("ui");
    releaseLock();
  }, [releaseLock, setPanel]);
  const closePanel = useCallback(() => {
    setPanel(null);
    audio.cue("ui");
    saveNow();
    if (screenRef.current === "play" && !cardRef.current) requestLock();
  }, [requestLock, saveNow, setPanel]);

  /* ------------------------------------------------------------ mission view */
  const lastMission = useRef("");
  const syncMission = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const v = g.objectiveView();
    const key = JSON.stringify(v);
    if (key !== lastMission.current) {
      lastMission.current = key;
      setMission(v);
    }
  }, []);

  /* ------------------------------------------------------------ game events */
  const handleEvents = useCallback((g) => {
    let save = false;
    for (const e of g.events.splice(0)) {
      switch (e.type) {
        case "step":
          audio.step(e.surface, e.sprint, e.crouch);
          break;
        case "sfx":
          audio.cue(e.name);
          break;
        case "item":
          toast(`Acquired: ${ITEMS[e.id].name}`, "good");
          save = true;
          bump();
          break;
        case "doc":
          if (e.id !== "pilot") {
            toast(`Journal: “${DOCS[e.id].title}” added`, "info", 2600);
            setNewDoc(true);
          }
          save = true;
          break;
        case "door":
          audio.cue(e.ice ? "steam" : e.heavy ? "doorHeavy" : "door");
          save = true;
          break;
        case "toast":
          toast(e.text, e.kind);
          break;
        case "say":
          subtitle(e.who, e.text, e.ms);
          if (e.who === "PA" || e.who === "Radio" || e.who === "Kestrel") audio.cue("radio");
          break;
        case "power":
          audio.cue("power");
          toast("Main power restored.", "good", 3600);
          save = true;
          break;
        case "objective":
          toast(`✓ ${e.text}`, "good", 2800);
          audio.cue("success");
          save = true;
          break;
        case "chapter":
          setCard({ n: e.n, title: e.title, intro: e.intro, prev: e.prev });
          audio.cue("chapter");
          keys.current.clear();
          releaseLock();
          save = true;
          break;
        case "solved":
          save = true;
          break;
        case "zone":
          if (e.first && e.id !== "outdoor" && e.id !== "deep") {
            setZoneTitle({ id: Math.random(), name: e.name });
            later(() => setZoneTitle(null), 3000);
          }
          break;
        case "ambient": {
          const pick = { outdoor: "wind", indoor: Math.random() < 0.5 ? "clank" : "groan", cave: Math.random() < 0.5 ? "crack" : "drip", tunnel: "drip", lab: "hum", hangar: "clank", shelter: "groan" }[e.env];
          if (pick) audio.cue(pick);
          break;
        }
        case "collapse":
          audio.cue("collapse");
          keys.current.clear();
          break;
        case "respawn":
          toast("You came to somewhere warm. Your progress is intact.", "warn", 4200);
          save = true;
          break;
        case "ending": {
          audio.cue("ending");
          const rec = load(RECORD_KEY, null) || { endings: {}, runs: 0, best: 0 };
          rec.endings = { ...rec.endings, [e.kind]: true };
          rec.runs = (rec.runs || 0) + 1;
          rec.best = rec.best ? Math.min(rec.best, g.time) : g.time;
          // keep the moment before the choice so the other ending is one click away
          const snap = g.serialize();
          delete snap.f.ending;
          rec.decision = snap;
          store(RECORD_KEY, rec);
          setRecords(rec);
          store(SAVE_KEY, null);
          setSaveInfo(null);
          setEnding({ kind: e.kind, time: g.time, docs: g.docs.length, hints: g.hintsUsed });
          releaseLock();
          setPanel(null);
          setScreen("ending");
          break;
        }
        default:
      }
    }
    if (save) saveNow();
  }, [toast, subtitle, setCard, releaseLock, later, saveNow, setPanel, setScreen]);

  /* ------------------------------------------------------------ HUD writer */
  const lastHud = useRef({});
  const writeHud = useCallback((g) => {
    const h = hud.current, L = lastHud.current;
    const set = (k, v) => {
      if (L[k] !== v && h[k]) {
        L[k] = v;
        h[k].textContent = v;
      }
    };
    const t = Math.max(0, g.temp);
    if (h.tempBar) h.tempBar.style.transform = `scaleX(${(t / 100).toFixed(3)})`;
    set("tempVal", `${bodyTemp(t)}°C`);
    const warming = g.env.warmFlag ? !!g.f[g.env.warmFlag] : !!g.env.warm;
    const lvl = t < 25 ? "3" : t < 45 ? "2" : g.env.cold > 0 ? "1" : warming && t < 99.5 ? "w" : "0";
    if (h.temp && h.temp.dataset.lvl !== lvl) h.temp.dataset.lvl = lvl;
    set("tempNote", lvl === "3" ? "HYPOTHERMIA — get inside" : lvl === "2" ? "Freezing" : lvl === "1" ? g.env.label : lvl === "w" ? "Warming up" : g.env.label);
    if (h.frost) h.frost.style.opacity = Math.max(0, (60 - t) / 60).toFixed(2);
    if (h.root) h.root.dataset.crit = t < 25 ? "1" : "0";
    set("bat", g.flashlight ? `${Math.ceil(g.battery)}%` : "OFF");
    if (h.flash) h.flash.dataset.on = g.flashlight ? (g.battery > 0 ? "1" : "dim") : "0";
    set("batCount", `×${g.count("battery")}`);
    // prompt
    const tg = !panelRef.current && !g.transition ? g.target() : null;
    const d = tg ? g.describe(tg) : null;
    const key = d ? `${tg.key}|${d.verb}|${d.text}|${d.sub}|${d.ok}` : "";
    if (L.prompt !== key && h.prompt) {
      L.prompt = key;
      h.prompt.dataset.on = d ? "1" : "0";
      if (d) {
        h.prompt.dataset.ok = d.ok ? "1" : "0";
        h.promptKey.textContent = d.ok ? (TOUCH ? "TAP" : "E") : "✕";
        h.promptText.textContent = d.ok && d.verb ? `${d.verb} · ${d.text}` : d.text;
        h.promptSub.textContent = d.sub || "";
      }
      if (h.cross) h.cross.dataset.on = d ? (d.ok ? "1" : "2") : "0";
    }
    // transition fade
    const tr = g.transition;
    if (h.fade) {
      let o = 0;
      if (tr) {
        const k = tr.t / tr.dur;
        o = tr.kind === "collapse" ? Math.min(1, k * 2.2) * (k > 0.8 ? (1 - k) / 0.2 : 1) : k < 0.5 ? k * 2 : (1 - k) * 2;
      }
      h.fade.style.opacity = o.toFixed(3);
      h.fade.dataset.kind = tr?.kind || "";
      set("fadeText", tr ? (tr.kind === "collapse" ? "The cold takes you…" : tr.label) : "");
    }
    syncMission();
  }, [syncMission]);

  /* ------------------------------------------------------------ main loop */
  const frame = useRef(null);
  const tm = useRef({ hud: 0, save: 10, amb: 0 });
  frame.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    dt = Math.min(dt, 0.1);
    const scr = screenRef.current;
    if (scr === "menu") {
      world.update(menuGame.current, dt, { menu: true });
      world.render();
      tm.current.amb -= dt;
      if (tm.current.amb <= 0) {
        tm.current.amb = 0.12;
        audio.ambience({ env: "menu", active: true });
      }
      return;
    }
    const g = gameRef.current;
    if (!g) return;
    const active = lockedRef.current && !panelRef.current && !cardRef.current && scr === "play";
    if (active || (g.transition && scr === "play")) {
      const K = keys.current;
      const tmv = touchMove.current, tf = touchFlags.current;
      const fwd = (K.has("KeyW") || K.has("ArrowUp") ? 1 : 0) - (K.has("KeyS") || K.has("ArrowDown") ? 1 : 0) + tmv.y;
      const strafe = (K.has("KeyD") || K.has("ArrowRight") ? 1 : 0) - (K.has("KeyA") || K.has("ArrowLeft") ? 1 : 0) + tmv.x;
      const input = {
        fwd: Math.max(-1, Math.min(1, fwd)), strafe: Math.max(-1, Math.min(1, strafe)),
        sprint: K.has("ShiftLeft") || K.has("ShiftRight") || tf.sprint,
        crouch: K.has("KeyC") || K.has("ControlLeft") || K.has("ControlRight") || tf.crouch,
        jump: K.has("Space") || tf.jump,
      };
      // fixed-size substeps keep movement speed honest on slow machines
      for (let rem = dt; rem > 1e-4; rem -= 1 / 30) {
        g.step(Math.min(rem, 1 / 30), input);
        input.jump = false;
      }
      tf.jump = false;
      handleEvents(g);
    }
    world.update(g, active ? dt : dt * 0.25, { headBob: settingsRef.current.headBob });
    world.render();
    const T = tm.current;
    T.hud -= dt;
    if (T.hud <= 0) {
      T.hud = 0.1;
      writeHud(g);
      audio.ambience({ env: g.zone.env, power: !!g.f.power, active, cold: g.temp < 25 ? 1 : 0 });
    }
    if (active) {
      T.save -= dt;
      if (T.save <= 0) {
        T.save = 10;
        saveNow();
      }
    }
  };

  /* ------------------------------------------------------------ world lifecycle */
  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage);
    } catch (err) {
      console.error("Outpost 47: WebGL unavailable", err);
      return undefined;
    }
    worldRef.current = world;
    const ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      world.resize(r.width, r.height);
    });
    ro.observe(stage);
    const r0 = stage.getBoundingClientRect();
    world.resize(r0.width, r0.height);
    let raf = 0, last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      frame.current(dt);
    };
    raf = requestAnimationFrame(loop);
    const tset = timeouts.current;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      tset.forEach(clearTimeout);
      tset.clear();
      world.dispose();
      worldRef.current = null;
    };
  }, []);
  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);
  useEffect(() => () => {
    saveNow();
    audio.dispose();
  }, [saveNow]);

  /* ------------------------------------------------------------ flow */
  const begin = useCallback((g, fresh) => {
    audio.unlock();
    gameRef.current = g;
    keys.current.clear();
    lastMission.current = "";
    setEnding(null);
    setToasts([]);
    setSubs([]);
    setPanel(null);
    setScreen("play");
    syncMission();
    if (fresh) {
      setCard({ n: 1, title: CHAPTERS[0].title, intro: CHAPTERS[0].intro, first: true });
      later(() => subtitle("Skyhook", "Investigator, we can't hold in this wind. We'll be back when the storm breaks. Follow the flags — and good luck.", 7000), 2600);
    } else {
      toast(`Resumed — Chapter ${Math.min(g.chapter + 1, 6)}: ${CHAPTERS[Math.min(g.chapter, 5)].title}`, "info");
      setCard(null);
      requestLock();
    }
    saveNow();
  }, [setPanel, setScreen, syncMission, setCard, later, subtitle, toast, requestLock, saveNow]);
  const newGame = useCallback(() => {
    store(SAVE_KEY, null);
    begin(new Game(), true);
  }, [begin]);
  const continueGame = useCallback(() => {
    const s = readProgress();
    if (!s) return newGame();
    begin(new Game(s), false);
  }, [begin, newGame]);
  const toMenu = useCallback(() => {
    saveNow();
    releaseLock();
    setPanel(null);
    setCard(null);
    setScreen("menu");
    setMenuView("main");
    setSaveInfo(readProgress());
  }, [saveNow, releaseLock, setPanel, setCard, setScreen]);
  const retryCheckpoint = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.teleport(g.checkpoint);
    g.temp = Math.max(g.temp, 60);
    setPanel(null);
    toast("Back at your last safe checkpoint.", "info");
    requestLock();
  }, [setPanel, toast, requestLock]);
  const dismissCard = useCallback(() => {
    setCard(null);
    audio.cue("ui");
    if (screenRef.current === "play" && !panelRef.current) requestLock();
  }, [setCard, requestLock]);

  // GamePlayer restart → fresh game (ignored on the main menu)
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    if (screenRef.current !== "menu") newGame();
  }, [restartSignal, newGame]);

  /* ------------------------------------------------------------ input */
  useEffect(() => {
    const interact = () => {
      const g = gameRef.current;
      const res = g.interact();
      handleEvents(g);
      if (res && screenRef.current === "play") {
        if (res.type === "puzzle" && g.solved[res.id] && PUZZLES[res.id].type !== "password") return;
        openPanel(res);
      }
    };
    const down = (e) => {
      if (screenRef.current !== "play") return;
      const P = panelRef.current;
      if (cardRef.current) {
        if (e.code === "Enter" || e.code === "Space" || e.code === "KeyE" || e.code === "Escape") {
          e.preventDefault();
          dismissCard();
        }
        return;
      }
      if (P) {
        const inField = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
        if (e.code === "Escape" || (!inField && P.type !== "puzzle" && ((e.code === "KeyE" && P.type === "doc") || ((e.code === "KeyI" || e.code === "Tab") && P.type === "inventory") || (e.code === "KeyJ" && P.type === "journal")))) {
          e.preventDefault();
          closePanel();
        }
        if (e.code === "Tab") e.preventDefault();
        return;
      }
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        if (e.code === "Tab") {
          openPanel({ type: "inventory" });
          return;
        }
        keys.current.add(e.code);
      }
      if (!lockedRef.current) return;
      if (e.repeat) return;
      const g = gameRef.current;
      switch (e.code) {
        case "KeyE":
          interact();
          break;
        case "KeyF":
          g.toggleFlashlight();
          handleEvents(g);
          writeHud(g);
          break;
        case "KeyI":
          openPanel({ type: "inventory" });
          break;
        case "KeyJ":
          setNewDoc(false);
          openPanel({ type: "journal", tab: "objectives" });
          break;
        case "KeyM":
          openPanel({ type: "journal", tab: "map" });
          break;
        case "KeyH":
          toast(`Hint: ${g.hint()}`, "hint", 7000);
          break;
        default:
      }
    };
    const up = (e) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const move = (e) => {
      if (!lockedRef.current || TOUCH || screenRef.current !== "play" || panelRef.current) return;
      const g = gameRef.current;
      if (!g || g.transition) return;
      const s = settingsRef.current.sens * 0.0022;
      g.player.yaw -= (e.movementX || 0) * s;
      g.player.pitch = Math.max(-1.45, Math.min(1.45, g.player.pitch - (e.movementY || 0) * s * (settingsRef.current.invertY ? -1 : 1)));
    };
    const mouse = (e) => {
      if (screenRef.current !== "play" || panelRef.current || cardRef.current || !lockedRef.current || TOUCH) return;
      if (e.button === 0) interact();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("mousemove", move);
    document.addEventListener("mousedown", mouse);
    window.__o47interact = interact;
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mousedown", mouse);
      delete window.__o47interact;
    };
  }, [handleEvents, openPanel, closePanel, dismissCard, toast, writeHud]);

  /* ------------------------------------------------------------ touch */
  const stick = useRef(null);
  const lookTouch = useRef(null);
  const onTouchStart = (e) => {
    if (!TOUCH || screenRef.current !== "play" || panelRef.current) return;
    for (const t of e.changedTouches) {
      const r = rootRef.current.getBoundingClientRect();
      if (t.clientX - r.left < r.width * 0.4 && !stick.current) stick.current = { id: t.identifier, x: t.clientX, y: t.clientY };
      else if (!lookTouch.current) lookTouch.current = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  const onTouchMove = (e) => {
    const g = gameRef.current;
    for (const t of e.changedTouches) {
      if (stick.current && t.identifier === stick.current.id) {
        const dx = (t.clientX - stick.current.x) / 50, dy = (t.clientY - stick.current.y) / 50;
        touchMove.current = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, -dy)) };
        if (hud.current.knob) hud.current.knob.style.transform = `translate(${touchMove.current.x * 34}px, ${-touchMove.current.y * 34}px)`;
      } else if (lookTouch.current && t.identifier === lookTouch.current.id && g) {
        const s = settingsRef.current.sens * 0.005;
        g.player.yaw -= (t.clientX - lookTouch.current.x) * s;
        g.player.pitch = Math.max(-1.45, Math.min(1.45, g.player.pitch - (t.clientY - lookTouch.current.y) * s));
        lookTouch.current.x = t.clientX;
        lookTouch.current.y = t.clientY;
      }
    }
  };
  const onTouchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (stick.current && t.identifier === stick.current.id) {
        stick.current = null;
        touchMove.current = { x: 0, y: 0 };
        if (hud.current.knob) hud.current.knob.style.transform = "";
      }
      if (lookTouch.current && t.identifier === lookTouch.current.id) lookTouch.current = null;
    }
  };

  /* ------------------------------------------------------------ settings */
  const updateSettings = (patch) => {
    const s = { ...settingsRef.current, ...patch };
    settingsRef.current = s;
    setSettings(s);
    store(SETTINGS_KEY, s);
  };

  /* ------------------------------------------------------------ test hook */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__o47 = {
      game: () => gameRef.current,
      world: () => worldRef.current,
      screen: () => screenRef.current,
      newGame, continueGame,
      tp: (x, z, yaw = 0) => gameRef.current.teleport({ x, z, yaw }),
      look: (yaw, pitch = 0) => Object.assign(gameRef.current.player, { yaw, pitch }),
      interact: () => window.__o47interact?.(),
      solve: (id, a) => {
        const ok = gameRef.current.solve(id, a);
        handleEvents(gameRef.current);
        return ok;
      },
      panel: (p) => openPanel(p),
      close: () => closePanel(),
      card: () => dismissCard(),
      step: (sec, input = {}) => {
        for (let i = 0; i < sec * 60; i++) gameRef.current.step(1 / 60, input);
        handleEvents(gameRef.current);
      },
    };
    return () => delete window.__o47;
  }, [newGame, continueGame, handleEvents, closePanel, dismissCard, openPanel]);

  /* ================================================================ render */
  const g = gameRef.current;
  const playing = screen === "play";
  const showResume = playing && !locked && !panel && !card && !TOUCH;
  const P = panel;

  const docPanel = P?.type === "doc" && DOCS[P.id];
  const puzzleView = P?.type === "puzzle" && g ? g.puzzleView(P.id) : null;
  const PuzzleBody = puzzleView ? PUZZLE_UI[puzzleView.type] : null;
  const submitPuzzle = (answer) => {
    const ok = g.solve(P.id, answer);
    handleEvents(g);
    if (ok) {
      setSolvedFlash(true);
      later(() => {
        setSolvedFlash(false);
        if (panelRef.current?.id === P.id) {
          // the director's terminal shows its files right after logging in
          if (P.id === "p_varga") setPanel({ type: "doc", id: "varga_terminal" });
          else if (P.id === "p_timeline") setPanel({ type: "doc", id: "timeline_result" });
          else closePanel();
        }
      }, 1100);
    }
    bump();
    return ok;
  };

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        hud.current.root = el;
      }}
      className={`o47${playing ? " is-playing" : ""}${TOUCH ? " is-touch" : ""}`}
      onClick={() => {
        if (playing && !panelRef.current && !cardRef.current && !lockedRef.current) requestLock();
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={stageRef} className="o47-stage" />
      <div className="o47-vignette" />
      <div className="o47-frost" ref={(el) => (hud.current.frost = el)} />

      {/* ---------------------------------------------------------- HUD */}
      {playing && g && (
        <div className="o47-hud">
          <div className="o47-obj">
            {mission && (
              <>
                <div className="o47-obj__ch">CHAPTER {mission.n} · {mission.title.toUpperCase()}</div>
                <div className="o47-obj__cur">{mission.current || "Chapter complete"}</div>
                <ul>
                  {mission.list.map((o) => (
                    <li key={o.id} className={o.done ? "is-done" : o.text === mission.current ? "is-cur" : ""}>{o.text}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="o47-status">
            <div className="o47-temp" ref={(el) => (hud.current.temp = el)}>
              <Icon id="temp" size={20} />
              <div className="o47-temp__body">
                <div className="o47-temp__row"><b ref={(el) => (hud.current.tempVal = el)}>37.0°C</b><span ref={(el) => (hud.current.tempNote = el)} /></div>
                <div className="o47-temp__bar"><i ref={(el) => (hud.current.tempBar = el)} /></div>
              </div>
            </div>
            <div className="o47-flash" ref={(el) => (hud.current.flash = el)}>
              <Icon id="flashlight" size={18} />
              <b ref={(el) => (hud.current.bat = el)}>OFF</b>
              <span ref={(el) => (hud.current.batCount = el)}>×0</span>
              <kbd>F</kbd>
            </div>
            <div className="o47-status__btns">
              <button type="button" onClick={(e) => (e.stopPropagation(), openPanel({ type: "inventory" }))}>Inventory <kbd>I</kbd></button>
              <button type="button" className={newDoc ? "has-new" : ""} onClick={(e) => (e.stopPropagation(), setNewDoc(false), openPanel({ type: "journal", tab: "objectives" }))}>Journal <kbd>J</kbd></button>
            </div>
          </div>
          <div className="o47-cross" ref={(el) => (hud.current.cross = el)} data-on="0" />
          <div className="o47-prompt" ref={(el) => (hud.current.prompt = el)} data-on="0">
            <kbd ref={(el) => (hud.current.promptKey = el)}>E</kbd>
            <div>
              <b ref={(el) => (hud.current.promptText = el)} />
              <span ref={(el) => (hud.current.promptSub = el)} />
            </div>
          </div>
          <div className="o47-subs">
            {subs.map((s) => (
              <div key={s.id} className="o47-sub"><b>{s.who}</b> {s.text}</div>
            ))}
          </div>
          <div className="o47-toasts">
            {toasts.map((t) => (
              <div key={t.id} className={`o47-toast is-${t.kind}`}>{t.text}</div>
            ))}
          </div>
          {zoneTitle && (
            <div key={zoneTitle.id} className="o47-zone">{zoneTitle.name}</div>
          )}
          {TOUCH && (
            <div className="o47-touch">
              <div className="o47-touch__stick"><i ref={(el) => (hud.current.knob = el)} /></div>
              <div className="o47-touch__btns">
                <button type="button" onTouchStart={(e) => (e.stopPropagation(), window.__o47interact?.())}>E</button>
                <button type="button" onTouchStart={(e) => (e.stopPropagation(), g.toggleFlashlight())}>F</button>
                <button type="button" onTouchStart={(e) => (e.stopPropagation(), (touchFlags.current.jump = true))}>Jump</button>
                <button type="button" onTouchStart={(e) => (e.stopPropagation(), (touchFlags.current.crouch = !touchFlags.current.crouch))}>Crouch</button>
                <button type="button" onTouchStart={(e) => (e.stopPropagation(), (touchFlags.current.sprint = !touchFlags.current.sprint))}>Run</button>
                <button type="button" onTouchStart={(e) => (e.stopPropagation(), openPanel({ type: "pause" }))}>❚❚</button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="o47-fade" ref={(el) => (hud.current.fade = el)}>
        <span ref={(el) => (hud.current.fadeText = el)} />
      </div>

      {/* ---------------------------------------------------------- click to resume */}
      {showResume && (
        <div className="o47-resume">
          <div className="o47-resume__card">
            <b>Click to continue</b>
            <span>Mouse look is paused. Esc releases the mouse.</span>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- chapter card */}
      {card && playing && (
        <div className="o47-chapter" onClick={(e) => (e.stopPropagation(), dismissCard())}>
          {card.prev && <div className="o47-chapter__prev">Chapter complete — {card.prev}</div>}
          <div className="o47-chapter__n">CHAPTER {card.n}</div>
          <h2>{card.title}</h2>
          <p>{card.intro}</p>
          {card.first && (
            <div className="o47-chapter__controls">
              <span><kbd>W A S D</kbd> move</span><span><kbd>Mouse</kbd> look</span><span><kbd>Shift</kbd> sprint</span><span><kbd>C</kbd> crouch</span>
              <span><kbd>Space</kbd> jump</span><span><kbd>E</kbd> interact</span><span><kbd>F</kbd> flashlight</span><span><kbd>I</kbd> inventory</span><span><kbd>J</kbd> journal</span><span><kbd>H</kbd> hint</span>
              <p className="o47-chapter__warn">The storm drains your body heat. Get indoors before you freeze.</p>
            </div>
          )}
          <button type="button" className="o47-btn is-go">{TOUCH ? "Tap" : "Click"} to continue</button>
        </div>
      )}

      {/* ---------------------------------------------------------- panels */}
      {P && playing && g && (
        <div className="o47-overlay" onClick={(e) => e.stopPropagation()}>
          {P.type === "pause" && (
            <div className="o47-panel o47-pause">
              <h2>Paused</h2>
              <div className="o47-pause__meta">Chapter {Math.min(g.chapter + 1, 6)} · {CHAPTERS[Math.min(g.chapter, 5)].title} · {fmtTime(g.time)}</div>
              <button type="button" className="o47-btn is-go" onClick={closePanel}>Resume</button>
              <button type="button" className="o47-btn" onClick={() => setPanel({ type: "journal", tab: "objectives" })}>Journal</button>
              <button type="button" className="o47-btn" onClick={() => setPanel({ type: "inventory" })}>Inventory</button>
              <button type="button" className="o47-btn" onClick={() => setPanel({ type: "settings" })}>Settings</button>
              <button type="button" className="o47-btn" onClick={() => toast(`Hint: ${g.hint()}`, "hint", 7000)}>Hint for current objective</button>
              <button type="button" className="o47-btn" onClick={retryCheckpoint}>Return to last checkpoint</button>
              <button type="button" className="o47-btn is-dim" onClick={toMenu}>Save &amp; quit to menu</button>
            </div>
          )}
          {P.type === "settings" && (
            <div className="o47-panel o47-settings">
              <h2>Settings</h2>
              <SettingsBody settings={settings} update={updateSettings} />
              <button type="button" className="o47-btn is-go" onClick={() => setPanel({ type: "pause" })}>Back</button>
            </div>
          )}
          {docPanel && (
            <div className="o47-panel o47-doc">
              <div className="o47-doc__from">{docPanel.from}</div>
              <h2>{docPanel.title}</h2>
              <div className="o47-doc__body">
                {P.id === "whiteboard" && (
                  <div className="o47-doc__glyphs">
                    {["flake", "drop", "spore", "bloom"].map((s, i) => (
                      <span key={s}><Glyph id={s} size={44} /><em>{["I DORMANT", "II THAW", "III SPORES", "IV BLOOM"][i]}</em></span>
                    ))}
                  </div>
                )}
                {docPanel.body.split("\n").map((l, i) => (l ? <p key={i}>{l}</p> : <br key={i} />))}
              </div>
              <button type="button" className="o47-btn is-go" onClick={closePanel}>Close <kbd>E</kbd></button>
            </div>
          )}
          {puzzleView && PuzzleBody && (
            <div className={`o47-panel o47-puzzle is-${puzzleView.type}`}>
              <div className="o47-puzzle__head">
                <div>
                  <h2>{puzzleView.title}</h2>
                  <div className="o47-puzzle__sub">{puzzleView.sub}</div>
                </div>
                <button type="button" className="o47-x" onClick={closePanel} aria-label="Close">✕</button>
              </div>
              {solvedFlash || puzzleView.solved ? (
                <div className="o47-solved">✓ SOLVED</div>
              ) : (
                <PuzzleBody key={P.id} pz={puzzleView} submit={submitPuzzle} sfx={(n) => audio.cue(n)} />
              )}
              {settings.hints && !puzzleView.solved && (
                <details className="o47-puzzle__hint">
                  <summary>Need a hint?</summary>
                  {puzzleView.hints.map((h) => (
                    <p key={h}>{h}</p>
                  ))}
                </details>
              )}
            </div>
          )}
          {P.type === "inventory" && <Inventory g={g} close={closePanel} openDoc={(id) => setPanel({ type: "doc", id })} onUse={(id) => {
            g.useItem(id);
            handleEvents(g);
            bump();
          }} />}
          {P.type === "journal" && <Journal g={g} tab={P.tab} setTab={(t) => setPanel({ type: "journal", tab: t })} openDoc={(id) => setPanel({ type: "doc", id })} close={closePanel} hint={() => toast(`Hint: ${g.hint()}`, "hint", 7000)} hintsOn={settings.hints} />}
          {P.type === "map" && (
            <div className="o47-panel o47-journal">
              <h2>Station Map</h2>
              <StationMap game={g} />
              <button type="button" className="o47-btn is-go" onClick={closePanel}>Close</button>
            </div>
          )}
          {P.type === "decision" && <Decision g={g} close={closePanel} choose={(k) => {
            g.end(k);
            handleEvents(g);
          }} />}
        </div>
      )}

      {/* ---------------------------------------------------------- main menu */}
      {screen === "menu" && (
        <div className="o47-menu">
          <div className="o47-menu__brand">
            <div className="o47-menu__kicker">HALVORSEN POLAR DYNAMICS · STATION 47</div>
            <h1>OUTPOST 47</h1>
            <div className="o47-menu__sub">FROZEN SECRETS</div>
            <div className="o47-menu__tag">EXPLORE • SURVIVE • UNCOVER</div>
          </div>
          {menuView === "main" && (
            <div className="o47-menu__col">
              {saveInfo && (
                <button type="button" className="o47-btn is-go is-big" onClick={continueGame}>
                  Continue
                  <small>Chapter {Math.min((saveInfo.ch || 0) + 1, 6)} · {CHAPTERS[Math.min(saveInfo.ch || 0, 5)].title} · {fmtTime(saveInfo.time)}</small>
                </button>
              )}
              <button type="button" className={`o47-btn is-big${saveInfo ? "" : " is-go"}`} onClick={() => (saveInfo ? setMenuView("confirm") : newGame())}>New Game</button>
              <button type="button" className="o47-btn" onClick={() => setMenuView("chapters")}>Chapters</button>
              <button type="button" className="o47-btn" onClick={() => setMenuView("settings")}>Settings</button>
              <div className="o47-menu__records">
                {records.endings?.expose && <span className="is-exp">Ending: The Truth, Unfiltered</span>}
                {records.endings?.destroy && <span className="is-des">Ending: Nothing Left to Find</span>}
                {!records.runs && <span>Headphones recommended. Mouse + keyboard.</span>}
              </div>
            </div>
          )}
          {menuView === "confirm" && (
            <div className="o47-menu__col o47-panel">
              <h2>Start over?</h2>
              <p>Your current investigation will be erased.</p>
              <button type="button" className="o47-btn is-go" onClick={newGame}>Start a new game</button>
              <button type="button" className="o47-btn" onClick={() => setMenuView("main")}>Cancel</button>
            </div>
          )}
          {menuView === "settings" && (
            <div className="o47-menu__col o47-panel">
              <h2>Settings</h2>
              <SettingsBody settings={settings} update={updateSettings} />
              <button type="button" className="o47-btn is-go" onClick={() => setMenuView("main")}>Back</button>
            </div>
          )}
          {menuView === "chapters" && (
            <div className="o47-menu__col o47-panel o47-chapters">
              <h2>Chapters</h2>
              <ol>
                {CHAPTERS.map((c, i) => {
                  const reached = (saveInfo?.ch ?? -1) >= i || records.runs > 0;
                  return (
                    <li key={c.n} className={reached ? "is-open" : ""}>
                      <b>{c.n}. {c.title}</b>
                      <span>{reached || i === 0 ? c.intro : "Not yet reached."}</span>
                    </li>
                  );
                })}
              </ol>
              <button type="button" className="o47-btn is-go" onClick={() => setMenuView("main")}>Back</button>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- ending */}
      {screen === "ending" && ending && (
        <div className="o47-ending" data-kind={ending.kind}>
          <div className="o47-ending__kicker">OUTPOST 47 · FINAL TRANSMISSION</div>
          <h1>{ENDINGS[ending.kind].title}</h1>
          <div className="o47-ending__body">{ENDINGS[ending.kind].body.split("\n").map((l, i) => (l ? <p key={i}>{l}</p> : null))}</div>
          <div className="o47-ending__stats">
            <span>Time <b>{fmtTime(ending.time)}</b></span>
            <span>Documents <b>{ending.docs}/{Object.keys(DOCS).length}</b></span>
            <span>Hints <b>{ending.hints}</b></span>
            <span>Endings found <b>{Object.keys(records.endings || {}).length}/2</b></span>
          </div>
          <div className="o47-ending__btns">
            <button type="button" className="o47-btn is-go" onClick={newGame}>Play again</button>
            {records.decision && (
              <button type="button" className="o47-btn" onClick={() => begin(new Game(records.decision), false)}>Return to the final decision</button>
            )}
            <button type="button" className="o47-btn" onClick={toMenu}>Main menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== sub-panels */
function SettingsBody({ settings, update }) {
  return (
    <div className="o47-form">
      <label>
        <span>Mouse sensitivity <b>{settings.sens.toFixed(2)}</b></span>
        <input type="range" min="0.2" max="3" step="0.05" value={settings.sens} onChange={(e) => update({ sens: Number(e.target.value) })} />
      </label>
      <label>
        <span>Volume <b>{Math.round(settings.volume * 100)}%</b></span>
        <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => update({ volume: Number(e.target.value) })} />
      </label>
      <label className="o47-check"><input type="checkbox" checked={settings.headBob} onChange={(e) => update({ headBob: e.target.checked })} /> Head bob</label>
      <label className="o47-check"><input type="checkbox" checked={settings.invertY} onChange={(e) => update({ invertY: e.target.checked })} /> Invert mouse Y</label>
      <label className="o47-check"><input type="checkbox" checked={settings.hints} onChange={(e) => update({ hints: e.target.checked })} /> Show hint buttons on puzzles</label>
    </div>
  );
}

function Inventory({ g, close, openDoc, onUse }) {
  const counts = {};
  for (const id of g.inv) counts[id] = (counts[id] || 0) + 1;
  const ids = Object.keys(counts);
  const [sel, setSel] = useState(ids[0] || null);
  const it = sel && ITEMS[sel];
  return (
    <div className="o47-panel o47-inv">
      <div className="o47-puzzle__head">
        <h2>Inventory</h2>
        <button type="button" className="o47-x" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="o47-inv__body">
        <div className="o47-inv__grid">
          {ids.map((id) => (
            <button type="button" key={id} className={sel === id ? "is-sel" : ""} onClick={() => (audio.cue("click"), setSel(id))}>
              <Icon id={ITEMS[id].icon} />
              <span>{ITEMS[id].name}</span>
              {counts[id] > 1 && <em>×{counts[id]}</em>}
            </button>
          ))}
        </div>
        <div className="o47-inv__detail">
          {it ? (
            <>
              <div className="o47-inv__icon"><Icon id={it.icon} size={56} /></div>
              <h3>{it.name}</h3>
              <div className="o47-inv__kind">{it.kind}</div>
              <p>{it.desc}</p>
              {sel === "flashlight" && <p className="o47-inv__stat">Charge: {Math.ceil(g.battery)}% · {g.flashlight ? "ON" : "OFF"}</p>}
              {sel === "battery" && <button type="button" className="o47-btn is-go" onClick={() => onUse("battery")}>Use — recharge flashlight</button>}
              {it.kind === "code" && <p className="o47-inv__stat">Keep these: the evacuation console wants all three, in order.</p>}
            </>
          ) : (
            <p>Empty.</p>
          )}
        </div>
      </div>
      <div className="o47-inv__foot">
        Items are used automatically when you interact with the object they fit. <button type="button" className="o47-link" onClick={() => openDoc("pilot")}>Mission brief</button>
      </div>
    </div>
  );
}

function Journal({ g, tab, setTab, openDoc, close, hint, hintsOn }) {
  const v = g.objectiveView();
  return (
    <div className="o47-panel o47-journal">
      <div className="o47-puzzle__head">
        <h2>Journal</h2>
        <button type="button" className="o47-x" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="o47-tabs">
        {[["objectives", "Objectives"], ["docs", `Documents (${g.docs.length})`], ["map", "Map"]].map(([k, l]) => (
          <button type="button" key={k} className={tab === k ? "is-on" : ""} onClick={() => (audio.cue("click"), setTab(k))}>{l}</button>
        ))}
      </div>
      {tab === "objectives" && (
        <div className="o47-journal__obj">
          {CHAPTERS.map((c, i) => {
            if (i > g.chapter) return null;
            const cur = i === Math.min(g.chapter, 5);
            return (
              <div key={c.n} className={`o47-journal__ch${cur ? " is-cur" : ""}`}>
                <b>Chapter {c.n} — {c.title}</b>
                {cur ? (
                  <ul>
                    {v.list.map((o) => (
                      <li key={o.id} className={o.done ? "is-done" : ""}>{o.text}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="is-done">Complete</span>
                )}
              </div>
            );
          })}
          {hintsOn && <button type="button" className="o47-btn" onClick={hint}>Hint for the current objective <kbd>H</kbd></button>}
        </div>
      )}
      {tab === "docs" && (
        <div className="o47-journal__docs">
          {[...g.docs].reverse().map((id) => (
            <button type="button" key={id} onClick={() => openDoc(id)}>
              <Icon id="doc" size={18} />
              <span><b>{DOCS[id].title}</b><em>{DOCS[id].from}</em></span>
            </button>
          ))}
        </div>
      )}
      {tab === "map" && <StationMap game={g} />}
    </div>
  );
}

function Decision({ g, close, choose }) {
  const [pick, setPick] = useState(null);
  return (
    <div className="o47-panel o47-decision">
      <div className="o47-puzzle__head">
        <div>
          <h2>Project 47 — Final Decision</h2>
          <div className="o47-puzzle__sub">Halvorsen aircraft inbound. The snowcat is ready. Choose what leaves this station.</div>
        </div>
        <button type="button" className="o47-x" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="o47-decision__opts">
        <button type="button" className={pick === "expose" ? "is-on" : ""} onClick={() => (audio.cue("click"), setPick("expose"))}>
          <b>Transmit the archive</b>
          <span>Send every log, order and specimen record to Kestrel and the world. Halvorsen is exposed; the crew gets real doctors. The research becomes public.</span>
        </button>
        <button type="button" className={pick === "destroy" ? "is-on" : ""} onClick={() => (audio.cue("click"), setPick("destroy"))}>
          <b>Purge &amp; incinerate</b>
          <span>Burn the samples{g.has("vial") ? " — including the vial you carry —" : ""} and wipe the archive. Only a medical beacon goes out. No one can ever weaponise it — or prove what happened.</span>
        </button>
      </div>
      <button type="button" className="o47-btn is-go" disabled={!pick} onClick={() => choose(pick)}>{pick ? "Confirm and board the snowcat" : "Choose"}</button>
    </div>
  );
}
