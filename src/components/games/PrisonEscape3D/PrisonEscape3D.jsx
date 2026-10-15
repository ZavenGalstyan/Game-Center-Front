/**
 * Prison Escape 3D — a first-person stealth escape adventure for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the Game (sim.js) and
 * draws it with plain Three.js (world.js). React renders the menus and the
 * panels (dialogue, notes, inventory, keypad, CCTV); the live HUD (stamina,
 * suspicion, visibility, prompt, minimap) is written straight to DOM refs
 * ~10×/s so walking around never re-renders React.
 *
 * Controls: WASD move · mouse look (Pointer Lock) · Shift sprint · C / Ctrl
 * crouch · E interact (hold for some) · F flashlight · I inventory · Q next
 * item · Esc pause. Panels release the pointer and freeze the world (the CCTV
 * desk keeps it running — that's the point of watching it). `restartSignal`
 * asks to start over; `muted` silences every sound. Progress saves to
 * localStorage on progress events and every 15 s, never per frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./PrisonEscape3D.css";
import { Game, readSave } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import {
  SAVE_KEY, SETTINGS_KEY, ITEMS, NOTES, GLYPHS, MISSIONS, ROUTES, WALLS, ZONES, BOUNDS, GUARDS,
} from "./data.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("petest");
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyF", "KeyC", "KeyI", "KeyQ", "ControlLeft", "ControlRight", "Tab"]);

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    return { sens: Number.isFinite(s.sens) ? Math.min(2.5, Math.max(0.3, s.sens)) : 1 };
  } catch {
    return { sens: 1 };
  }
}
function store(key, val) {
  try {
    if (val == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/* ------------------------------------------------------------------ glyphs */
export function Glyph({ id, size = 28 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  switch (id) {
    case "star":
      return <svg {...p}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" /></svg>;
    case "moon":
      return <svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>;
    case "gear":
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /><circle cx="12" cy="12" r="6.5" /></svg>;
    case "anchor":
      return <svg {...p}><circle cx="12" cy="5" r="2" /><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8" /></svg>;
    case "eye":
      return <svg {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "key":
      return <svg {...p}><circle cx="7.5" cy="12" r="4" /><path d="M11.5 12H22M18 12v4M21 12v3" /></svg>;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ minimap */
const MAP_PX = 3; // pixels per metre in the static map
function buildMapImage() {
  const W = Math.ceil((BOUNDS.x2 - BOUNDS.x1) * MAP_PX);
  const H = Math.ceil((BOUNDS.z2 - BOUNDS.z1) * MAP_PX);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const X = (x) => (x - BOUNDS.x1) * MAP_PX;
  const Z = (z) => (z - BOUNDS.z1) * MAP_PX;
  for (const zn of [...ZONES].reverse()) {
    g.fillStyle = zn.outdoor ? (zn.id === "exterior" ? "rgba(70,110,70,0.55)" : "rgba(90,100,110,0.5)") : zn.restricted ? "rgba(150,60,50,0.42)" : "rgba(120,140,160,0.42)";
    g.fillRect(X(zn.x1), Z(zn.z1), (zn.x2 - zn.x1) * MAP_PX, (zn.z2 - zn.z1) * MAP_PX);
  }
  for (const w of WALLS) {
    if (w.kind === "invisible") continue;
    g.fillStyle = w.kind === "bars" || w.kind === "fence" ? "rgba(200,210,220,0.55)" : w.y1 > 0 ? "rgba(230,235,240,0.45)" : "rgba(235,240,245,0.95)";
    g.fillRect(X(w.x1), Z(w.z1), Math.max(1, (w.x2 - w.x1) * MAP_PX), Math.max(1, (w.z2 - w.z1) * MAP_PX));
  }
  return c;
}
function drawMap(ctx, img, game, { cx, cz, yaw, scale, w, h, intel, all = false, target }) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  if (yaw != null) ctx.rotate(yaw);
  const k = scale / MAP_PX;
  ctx.scale(k, k);
  ctx.translate(-(cx - BOUNDS.x1) * MAP_PX, -(cz - BOUNDS.z1) * MAP_PX);
  ctx.drawImage(img, 0, 0);
  const X = (x) => (x - BOUNDS.x1) * MAP_PX;
  const Z = (z) => (z - BOUNDS.z1) * MAP_PX;
  // doors
  for (const d of game.doors) {
    if (d.id.startsWith("cell") && d.id !== "cell3") continue;
    const D = d.def;
    ctx.fillStyle = d.open > 0.9 ? "rgba(120,220,140,0.9)" : d.locked ? "rgba(255,90,70,0.95)" : "rgba(255,190,90,0.95)";
    const hw = (D.w / 2) * MAP_PX;
    if (D.axis === "x") ctx.fillRect(X(D.x) - hw, Z(D.z) - 1.5, hw * 2, 3);
    else ctx.fillRect(X(D.x) - 1.5, Z(D.z) - hw, 3, hw * 2);
  }
  if (intel) {
    for (const c of game.cams) {
      if (!c.active) continue;
      ctx.fillStyle = `rgba(255,70,60,${0.18 + c.aware * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(X(c.x), Z(c.z));
      const r = c.range * MAP_PX * 0.8;
      const a0 = -c.yaw - Math.PI / 2;
      ctx.arc(X(c.x), Z(c.z), r, a0 - c.fov, a0 + c.fov);
      ctx.closePath();
      ctx.fill();
    }
    for (const g of game.guards) {
      if (!g.active) continue;
      const col = g.state === "chase" ? "255,59,48" : g.state === "patrol" || g.state === "return" ? "255,140,70" : "255,204,0";
      ctx.fillStyle = `rgba(${col},0.22)`;
      ctx.beginPath();
      ctx.moveTo(X(g.x), Z(g.z));
      const a0 = -g.yaw - Math.PI / 2;
      ctx.arc(X(g.x), Z(g.z), 9 * MAP_PX, a0 - 0.96, a0 + 0.96);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgb(${col})`;
      ctx.beginPath();
      ctx.arc(X(g.x), Z(g.z), 1.6 * MAP_PX * (all ? 0.8 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (all) {
    // patrol routes (CCTV)
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    for (const def of GUARDS) {
      const r = def.routes[game.phase];
      if (!r) continue;
      ctx.strokeStyle = "rgba(255,170,90,0.55)";
      ctx.beginPath();
      r.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // objective
  if (target) {
    ctx.fillStyle = "#ff9f3a";
    ctx.save();
    ctx.translate(X(target[0]), Z(target[1]));
    ctx.rotate(Math.PI / 4);
    const s = (all ? 2.2 : 3) * MAP_PX;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
  // player
  const p = game.player;
  ctx.save();
  ctx.translate(X(p.x), Z(p.z));
  ctx.rotate(-p.yaw);
  ctx.fillStyle = "#7fe0ff";
  ctx.beginPath();
  const s = 2.4 * MAP_PX * (all ? 0.8 : 1);
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.7, s * 0.8);
  ctx.lineTo(0, s * 0.35);
  ctx.lineTo(-s * 0.7, s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ================================================================== component */
export default function PrisonEscape3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const demoRef = useRef(null);
  const screenRef = useRef("menu");
  const panelRef = useRef(null);
  const lockedRef = useRef(false);
  const keys = useRef(new Set());
  const look = useRef({ yaw: 0, pitch: 0 });
  const targetRef = useRef(null);
  const hud = useRef({});
  const mapImg = useRef(null);
  const settingsRef = useRef(null);
  if (!settingsRef.current) settingsRef.current = loadSettings();

  const [screen, setScreen] = useState("menu"); // menu | how | play | ending
  const [panel, setPanelState] = useState(null);
  const [locked, setLocked] = useState(false);
  const [saveInfo, setSaveInfo] = useState(() => (typeof localStorage !== "undefined" ? readSave(localStorage, SAVE_KEY) : null));
  const [confirmNew, setConfirmNew] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [subs, setSubs] = useState([]);
  const [banner, setBanner] = useState(null);
  const [mission, setMission] = useState(null);
  const [overlay, setOverlay] = useState(null); // {kind:'capture'|'morning'|'night', text, sub}
  const [hidden, setHidden] = useState(null);
  const [ending, setEnding] = useState(null);
  const [showControls, setShowControls] = useState(false);
  const [sens, setSens] = useState(settingsRef.current.sens);
  const [, setTick] = useState(0);

  const setPanel = useCallback((p) => {
    panelRef.current = p;
    setPanelState(p);
  }, []);

  /* ------------------------------------------------------------ feedback */
  const toastId = useRef(0);
  const toast = useCallback((text, kind = "info", ms = 2800) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const subtitle = useCallback((who, text, kind = "npc", ms = 3400) => {
    const id = ++toastId.current;
    setSubs((t) => [...t.slice(-2), { id, who, text, kind }]);
    setTimeout(() => setSubs((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const showBanner = useCallback((b) => {
    setBanner({ ...b, id: Math.random() });
    setTimeout(() => setBanner((cur) => (cur && cur.title === b.title ? null : cur)), 3800);
  }, []);

  /* ------------------------------------------------------------ save */
  const saveNow = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.ended || (TEST && PARAMS.has("nosave"))) return;
    const s = game.serialize();
    if (store(SAVE_KEY, s)) setSaveInfo(s);
    game.dirty = false;
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST) {
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
    if (TEST) {
      lockedRef.current = false;
      setLocked(false);
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
      if (!l) {
        keys.current.clear();
        if (screenRef.current === "play" && !panelRef.current) saveNow();
      }
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [saveNow]);

  /* ------------------------------------------------------------ panels */
  const openPanel = useCallback((p) => {
    setPanel(p);
    keys.current.clear();
    const g = gameRef.current;
    if (g) {
      g.channel = null;
      g.player.vx = g.player.vz = 0;
    }
    releaseLock();
  }, [releaseLock, setPanel]);
  const closePanel = useCallback((relock = true) => {
    const cur = panelRef.current;
    setPanel(null);
    audio.ui();
    if (cur?.type === "note" || cur?.type === "dialogue") saveNow();
    if (relock && screenRef.current === "play") requestLock();
  }, [requestLock, saveNow, setPanel]);

  /* ------------------------------------------------------------ mission view */
  const lastMission = useRef("");
  const syncMission = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const v = g.missionView();
    const key = JSON.stringify(v);
    if (key !== lastMission.current) {
      lastMission.current = key;
      setMission(v);
    }
  }, []);

  /* ------------------------------------------------------------ events */
  const handleEvents = useCallback((game) => {
    for (const e of game.events.splice(0)) {
      switch (e.type) {
        case "footstep":
          audio.footstep(e.surface, e.sprint, e.crouch);
          break;
        case "door":
          if (e.by !== "guard" || Math.hypot(e.x - game.player.x, e.z - game.player.z) < 14) audio.door(e.kind, e.open);
          break;
        case "pickup":
          audio.pickup();
          toast(e.msg, "good", 3200);
          setTick((t) => t + 1);
          break;
        case "deny":
          audio.deny();
          toast(e.msg, "warn", 3200);
          break;
        case "info":
          toast(e.msg, "info", 3600);
          break;
        case "step":
          toast(`✔ ${e.text}`, "good", 2600);
          audio.ui();
          syncMission();
          break;
        case "mission":
          audio.mission();
          showBanner({ title: e.title, next: e.next, index: e.index });
          syncMission();
          break;
        case "pa":
          audio.pa();
          subtitle("PA", e.text, "pa", 5200);
          break;
        case "bark":
          subtitle(e.who, e.text, e.kind === "chase" ? "danger" : "npc", 2600);
          if (e.kind === "suspicious" || e.kind === "investigate") audio.suspicious();
          break;
        case "alert":
          audio.alert();
          break;
        case "alarm":
          audio.alarm();
          toast(e.msg, "danger", 3600);
          break;
        case "caught":
          audio.caught();
          setOverlay({ kind: "capture", text: "CAUGHT", sub: `${e.who}: “${e.line}”` });
          break;
        case "respawn":
          setOverlay(null);
          toast(e.msg, "warn", 4200);
          look.current.yaw = game.player.yaw;
          look.current.pitch = 0;
          saveNow();
          break;
        case "lost":
          toast("They lost you. Stay hidden.", "info", 2200);
          break;
        case "spark":
          audio.spark();
          break;
        case "power":
          audio.power();
          break;
        case "breaker":
          audio.breaker(e.up);
          break;
        case "floods":
          audio.breaker(false);
          audio.spark();
          break;
        case "work":
          audio.work();
          break;
        case "hide":
          audio.hide();
          setHidden(e.on ? e.kind : null);
          look.current.yaw = game.player.yaw;
          break;
        case "escape":
          audio.victory();
          audio.ambience(0);
          store(SAVE_KEY, null);
          setSaveInfo(null);
          setEnding(e);
          releaseLock();
          screenRef.current = "ending";
          setScreen("ending");
          break;
        default:
      }
    }
  }, [toast, subtitle, showBanner, syncMission, saveNow, releaseLock]);

  /* ------------------------------------------------------------ HUD writer */
  const lastHud = useRef({});
  const writeHud = useCallback((game) => {
    const h = hud.current;
    const L = lastHud.current;
    const set = (key, val) => {
      if (L[key] !== val && h[key]) {
        L[key] = val;
        h[key].textContent = val;
      }
    };
    const p = game.player;
    if (h.stam) h.stam.style.transform = `scaleX(${(p.stamina / 100).toFixed(3)})`;
    if (h.stamWrap) h.stamWrap.dataset.low = p.exhausted ? "1" : "0";
    if (h.susp) h.susp.style.transform = `scaleX(${game.alert.toFixed(3)})`;
    const lvl = game.capture ? 3 : game.alertLevel;
    const label = lvl === 3 ? "DETECTED" : lvl === 2 ? "SEARCHING" : lvl === 1 || game.alert > 0.3 ? "SUSPICIOUS" : game.trespassing() ? "RESTRICTED AREA" : "UNNOTICED";
    set("suspLabel", label);
    if (h.suspWrap) h.suspWrap.dataset.lvl = String(lvl === 0 && game.alert > 0.3 ? 1 : lvl);
    if (h.suspWrap) h.suspWrap.dataset.tres = game.trespassing() ? "1" : "0";
    const vis = Math.min(1, game.vis / 1.25);
    if (h.eye) h.eye.style.opacity = (0.25 + vis * 0.75).toFixed(2);
    set("visLabel", p.hidden ? "Hidden" : vis < 0.25 ? "In shadow" : vis < 0.55 ? "Low profile" : vis < 0.85 ? "Visible" : "Exposed");
    set("stance", p.hidden ? "HIDING" : p.crouch ? "CROUCHING" : p.sprinting ? "SPRINTING" : "STANDING");
    set("zone", game.zone.name);
    if (h.zone) h.zone.dataset.r = game.trespassing() ? "1" : "0";
    // selected item
    const sel = game.sel ? ITEMS[game.sel] : null;
    set("selIcon", sel ? sel.icon : "·");
    set("selName", sel ? sel.name : "Empty hands");
    set("invCount", `${game.inv.length} item${game.inv.length === 1 ? "" : "s"}`);
    if (h.flash) h.flash.dataset.on = game.flashlight ? "1" : game.has("flashlight") ? "0" : "x";
    // prompt
    const it = targetRef.current;
    const d = it ? game.describe(it) : null;
    const key = d ? `${it.key}|${d.verb}|${d.sub}|${d.ok}` : "";
    if (L.prompt !== key && h.prompt) {
      L.prompt = key;
      h.prompt.dataset.on = d ? "1" : "0";
      if (d) {
        h.prompt.dataset.ok = d.ok ? "1" : "0";
        h.promptKey.textContent = d.ok ? (d.hold ? "Hold E" : "E") : "—";
        h.promptText.textContent = `${d.verb ? d.verb + " " : ""}${d.text}`;
        h.promptSub.textContent = d.sub || "";
      }
      if (h.cross) h.cross.dataset.on = d ? "1" : "0";
    }
    if (h.ring) {
      const ch = game.channel;
      h.ring.dataset.on = ch ? "1" : "0";
      if (ch) h.ringFill.style.strokeDashoffset = String(100 - (ch.t / ch.dur) * 100);
    }
    // minimap
    const mc = h.map;
    if (mc && mapImg.current) {
      const cx = mc.getContext("2d");
      const v = game.missionView();
      drawMap(cx, mapImg.current, game, { cx: p.x, cz: p.z, yaw: p.yaw, scale: 3.4, w: mc.width, h: mc.height, intel: game.intel, target: v.target });
    }
    syncMission();
  }, [syncMission]);

  /* ------------------------------------------------------------ main loop */
  const frameRef = useRef(null);
  const timers = useRef({ hud: 0, save: 15, dirty: 0 });
  frameRef.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    dt = Math.min(dt, 0.1);
    if (screenRef.current !== "play") {
      const demo = demoRef.current;
      if (demo) {
        demo.update(dt);
        demo.events.length = 0;
      }
      if (screenRef.current === "ending" && gameRef.current) world.render(gameRef.current, dt * 0.3, "play");
      else world.render(demo, dt, "menu");
      return;
    }
    const game = gameRef.current;
    if (!game) return;
    const P = panelRef.current;
    const active = lockedRef.current && !P;
    const running = active || P?.type === "cctv";
    const p = game.player;
    if (active && !game.transition && !game.capture) {
      const k = 1 - Math.exp(-dt * 30);
      if (!p.hidden) {
        p.yaw += (look.current.yaw - p.yaw) * k;
        p.pitch += (look.current.pitch - p.pitch) * k;
      } else {
        // a little peeking from inside a hiding spot
        const base = p.hideYaw ?? p.yaw;
        p.hideYaw = base;
        look.current.yaw = Math.max(base - 0.6, Math.min(base + 0.6, look.current.yaw));
        p.pitch += (look.current.pitch - p.pitch) * k;
        p.yaw = base + (look.current.yaw - base);
      }
      const K = keys.current;
      game.stepPlayer({
        f: K.has("KeyW") || K.has("ArrowUp"),
        b: K.has("KeyS") || K.has("ArrowDown"),
        l: K.has("KeyA") || K.has("ArrowLeft"),
        r: K.has("KeyD") || K.has("ArrowRight"),
        sprint: K.has("ShiftLeft") || K.has("ShiftRight"),
      }, dt);
    } else {
      game.stepPlayer({}, dt);
    }
    if (!p.hidden) p.hideYaw = null;
    if (running) game.update(dt);
    world.render(game, dt, "play");
    if (active) {
      const { eye, dir } = world.look();
      targetRef.current = game.pick(eye, dir);
    } else if (!P) targetRef.current = null;
    game.target = targetRef.current;
    if (active) game.updateChannel(dt, keys.current.has("KeyE"));
    world.setTarget(active ? targetRef.current : null);
    handleEvents(game);
    if (running) audio.tension(game.alert, dt);
    // overlays driven by sim state
    const tr = game.transition;
    if (tr) {
      const want = tr.kind === "morning" ? { kind: "morning", text: "06:30", sub: "Morning — Block C" } : { kind: "night", text: "22:00", sub: "Lights out" };
      if (overlayRef.current?.kind !== want.kind) {
        overlayRef.current = want;
        setOverlay(want);
        if (tr.kind === "morning") audio.bell();
      }
    } else if (overlayRef.current && overlayRef.current.kind !== "capture") {
      overlayRef.current = null;
      setOverlay(null);
      look.current.yaw = game.player.yaw;
      audio.ambience(1, game.night);
      syncMission();
    }
    if (game.capture) overlayRef.current = { kind: "capture" };
    else if (overlayRef.current?.kind === "capture") overlayRef.current = null;
    timers.current.hud -= dt;
    if (timers.current.hud <= 0) {
      timers.current.hud = 0.1;
      writeHud(game);
    }
    if (game.dirty) {
      timers.current.dirty += dt;
      if (timers.current.dirty > 0.6) {
        timers.current.dirty = 0;
        saveNow();
      }
    }
    timers.current.save -= dt;
    if (timers.current.save <= 0) {
      timers.current.save = 15;
      if (running) saveNow();
    }
  };
  const overlayRef = useRef(null);

  useEffect(() => {
    // a fresh canvas per mount: dispose() force-loses the old context
    const canvas = document.createElement("canvas");
    canvas.className = "pe-canvas";
    canvas.setAttribute("aria-hidden", "true");
    rootRef.current.prepend(canvas);
    const world = createWorld(canvas, { preserve: TEST });
    worldRef.current = world;
    if (!demoRef.current) demoRef.current = new Game(null, { seed: 9 });
    mapImg.current = buildMapImage();
    const fit = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) world.resize(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rootRef.current);
    let raf = 0;
    let lastT = 0;
    const loop = (now) => {
      const dt = lastT ? (now - lastT) / 1000 : 0;
      lastT = now;
      frameRef.current(dt);
      raf = requestAnimationFrame(loop);
    };
    if (TEST) {
      window.__pe = {
        world,
        game: () => gameRef.current,
        demo: () => demoRef.current,
        fit,
        keys: keys.current,
        look: look.current,
        target: () => targetRef.current,
        advance(frames = 1, dt = 1 / 60) {
          for (let i = 0; i < frames; i++) frameRef.current(dt);
        },
      };
    } else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      world.dispose();
      canvas.remove();
      worldRef.current = null;
      if (TEST) delete window.__pe;
    };
  }, []);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  // save when the tab hides / page unloads / component unmounts
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && screenRef.current === "play") saveNow();
    };
    const onUnload = () => screenRef.current === "play" && saveNow();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
      if (screenRef.current === "play") saveNow();
    };
  }, [saveNow]);

  /* ------------------------------------------------------------ flow */
  const begin = useCallback((game) => {
    gameRef.current = game;
    look.current.yaw = game.player.yaw;
    look.current.pitch = 0;
    lastHud.current = {};
    lastMission.current = "";
    timers.current = { hud: 0, save: 15, dirty: 0 };
    targetRef.current = null;
    overlayRef.current = null;
    setPanel(null);
    setOverlay(null);
    setHidden(null);
    setEnding(null);
    setConfirmNew(false);
    setShowControls(false);
    screenRef.current = "play";
    setScreen("play");
    audio.unlock();
    audio.ambience(1, game.night);
    syncMission();
    requestLock();
  }, [requestLock, syncMission, setPanel]);

  const newGame = useCallback(() => {
    audio.unlock();
    audio.ui();
    const game = new Game(null, { seed: (Date.now() % 1e9) | 0 });
    begin(game);
    store(SAVE_KEY, game.serialize());
    setSaveInfo(game.serialize());
    subtitle("", "Block C, 23:40. Your first night inside. The cell door is locked — look around.", "narration", 6000);
  }, [begin, subtitle]);

  const continueGame = useCallback(() => {
    audio.unlock();
    audio.ui();
    const s = readSave(localStorage, SAVE_KEY);
    if (!s) {
      setSaveInfo(null);
      toast("Save data was missing or damaged — starting fresh.", "warn", 3500);
      return newGame();
    }
    const game = new Game(s, { seed: (Date.now() % 1e9) | 0 });
    begin(game);
    toast(`Welcome back — Mission ${game.mission + 1}: ${MISSIONS[game.mission].title}`, "info", 3000);
  }, [begin, newGame, toast]);

  const toMenu = useCallback(() => {
    saveNow();
    releaseLock();
    setPanel(null);
    gameRef.current = null;
    overlayRef.current = null;
    setOverlay(null);
    setHidden(null);
    screenRef.current = "menu";
    setScreen("menu");
    audio.ambience(0);
  }, [saveNow, releaseLock, setPanel]);

  // GamePlayer Restart → confirm a brand-new run
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play") openPanel({ type: "restart" });
    else if (screenRef.current === "ending") newGame();
    else if (saveInfo) {
      screenRef.current = "menu";
      setScreen("menu");
      setConfirmNew(true);
    } else newGame();
  }, [restartSignal, openPanel, newGame, saveInfo]);

  useEffect(() => {
    if (!TEST || !window.__pe) return;
    Object.assign(window.__pe, { newGame, continueGame, toMenu, openPanel, closePanel, screen, panel, locked, requestLock, releaseLock, saveNow, begin });
  });

  /* ------------------------------------------------------------ input */
  const doInteract = useCallback(() => {
    const game = gameRef.current;
    const it = targetRef.current;
    if (!game || !it) return;
    const res = game.interact(it);
    handleEvents(game);
    if (res?.panel) {
      if (res.panel.type === "note") audio.paper();
      openPanel({ ...res.panel, step: 0 });
    }
  }, [openPanel, handleEvents]);

  const useItem = useCallback((id) => {
    const game = gameRef.current;
    if (!game || !game.has(id)) return;
    const def = ITEMS[id];
    if (def.read) {
      audio.paper();
      setPanel({ type: "note", id: def.read, from: "inventory" });
      return;
    }
    if (id === "flashlight") {
      game.flashlight = !game.flashlight;
      audio.ui();
      setTick((t) => t + 1);
      return;
    }
    game.select(id);
    setTick((t) => t + 1);
  }, [setPanel]);

  const playing = screen === "play";
  // Listeners are registered once per play session and call these per-render
  // handlers, so held keys survive React re-renders (toasts, panels…).
  const input = useRef({});
  input.current.kd = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const game = gameRef.current;
      const P = panelRef.current;
      if (P) {
        if (GAME_KEYS.has(e.code) || e.code === "Escape") e.preventDefault();
        if (e.repeat) return;
        if (P.type === "dialogue") {
          const lines = P.lines.length;
          if (e.code === "Escape") closePanel(false);
          else if (P.step < lines - 1 && (e.code === "KeyE" || e.code === "Space" || e.code === "Enter")) setPanel({ ...P, step: P.step + 1 });
          else if (P.step >= lines - 1 && !P.choices.length && (e.code === "KeyE" || e.code === "Space" || e.code === "Enter")) closePanel(true);
          else if (P.step >= lines - 1 && /^Digit[1-9]$/.test(e.code)) {
            const c = P.choices[Number(e.code.slice(5)) - 1];
            if (c && !c.disabled) choose(c.id);
          }
          return;
        }
        if (P.type === "keypad" && /^Digit[1-6]$/.test(e.code)) {
          pressGlyph(GLYPHS[Number(e.code.slice(5)) - 1]);
          return;
        }
        if (e.code === "Escape" || e.code === "KeyE" || (P.type === "inventory" && (e.code === "KeyI" || e.code === "Tab"))) {
          if (P.type === "note" && P.from === "inventory") setPanel({ type: "inventory" });
          else closePanel(e.code !== "Escape");
        }
        return;
      }
      if (!lockedRef.current || !game) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      keys.current.add(e.code);
      if (e.repeat) return;
      audio.unlock();
      if (overlayRef.current && overlayRef.current.kind !== "capture" && game.transition) return;
      switch (e.code) {
        case "KeyE":
          doInteract();
          break;
        case "KeyF":
          if (game.has("flashlight")) {
            game.flashlight = !game.flashlight;
            audio.ui();
          } else toast("You don't have a flashlight.", "warn", 1800);
          break;
        case "KeyC":
        case "ControlLeft":
        case "ControlRight":
          game.toggleCrouch();
          handleEvents(game);
          break;
        case "KeyI":
        case "Tab":
          audio.ui();
          openPanel({ type: "inventory" });
          break;
        case "KeyQ":
          game.cycleItem(1);
          audio.ui();
          break;
        default:
      }
  };
  useEffect(() => {
    if (!playing) return undefined;
    const kd = (e) => input.current.kd(e);
    const ku = (e) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const mm = (e) => {
      if (!lockedRef.current || panelRef.current) return;
      const s = 0.0021 * settingsRef.current.sens;
      look.current.yaw -= (e.movementX || 0) * s;
      look.current.pitch = Math.max(-1.4, Math.min(1.4, look.current.pitch - (e.movementY || 0) * s));
    };
    const md = (e) => {
      if (panelRef.current || e.button !== 0 || !lockedRef.current) return;
      input.current.interact();
    };
    const wheel = (e) => {
      e.preventDefault();
      if (!lockedRef.current || panelRef.current) return;
      gameRef.current?.cycleItem(e.deltaY > 0 ? 1 : -1);
    };
    const root = rootRef.current;
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    document.addEventListener("mousemove", mm);
    root.addEventListener("mousedown", md);
    root.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", mm);
      root.removeEventListener("mousedown", md);
      root.removeEventListener("wheel", wheel);
      keys.current.clear();
    };
  }, [playing]);
  input.current.interact = doInteract;

  /* ------------------------------------------------------------ panel actions */
  function choose(id) {
    const game = gameRef.current;
    const P = panelRef.current;
    if (!game || !P) return;
    audio.ui();
    if (id === "wait") return closePanel(true);
    const res = game.choose(P.npc, id);
    handleEvents(game);
    if (res) setPanel({ ...res, step: 0 });
  }
  const kpTimer = useRef(0);
  function pressGlyph(gl) {
    const game = gameRef.current;
    const P = panelRef.current;
    if (!game || !P || P.type !== "keypad" || P.result === "ok") return;
    const r = game.keypadPress(gl);
    handleEvents(game);
    if (r === "more") {
      audio.beep(true);
      setPanel({ ...P, entered: [...(P.entered || []), gl], result: null });
    } else if (r === "ok") {
      audio.beep(true);
      setPanel({ ...P, entered: [...(P.entered || []), gl], result: "ok" });
      clearTimeout(kpTimer.current);
      kpTimer.current = setTimeout(() => {
        if (panelRef.current?.type === "keypad") closePanel(true);
      }, 900);
    } else {
      audio.beep(false);
      setPanel({ ...P, entered: [], result: "wrong", wrongs: (P.wrongs || 0) + 1 });
    }
  }
  // CCTV: watching for a few seconds logs the patrol pattern
  useEffect(() => {
    if (panel?.type !== "cctv") return undefined;
    const g = gameRef.current;
    const t0 = performance.now();
    let raf = 0;
    const draw = () => {
      const c = hud.current.cctv;
      if (c && g && mapImg.current) {
        const ctx = c.getContext("2d");
        const view = { cx: 19, cz: -2, yaw: null, scale: 5.2, w: c.width, h: c.height, intel: true, all: true, target: null };
        drawMap(ctx, mapImg.current, g, view);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        for (let y = 0; y < c.height; y += 3) ctx.fillRect(0, y, c.width, 1);
        const sec = ((performance.now() - t0) / 1000) | 0;
        ctx.fillStyle = "rgba(160,255,190,0.9)";
        ctx.font = "12px monospace";
        ctx.fillText(`CCTV · LIVE · ${String(sec).padStart(3, "0")}s`, 10, 18);
      }
      raf = requestAnimationFrame(draw);
    };
    const tick = setInterval(() => {
      if (!TEST) return;
      draw();
    }, 250);
    if (!TEST) raf = requestAnimationFrame(draw);
    const done = setTimeout(() => {
      if (g && !g.flags.has("cctv") && panelRef.current?.type === "cctv") {
        g.watchCctv();
        handleEvents(g);
        toast("Patrol pattern logged — guards now show on your minimap.", "good", 4000);
      } else if (g && !g.intel) g.intel = true;
    }, TEST ? 50 : 3500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [panel?.type, handleEvents, toast]);

  const changeSens = (v) => {
    setSens(v);
    settingsRef.current.sens = v;
    store(SETTINGS_KEY, { sens: v });
  };

  /* ------------------------------------------------------------ render */
  const game = gameRef.current;
  const paused = playing && !locked && !panel && !(overlay && overlay.kind !== "capture" && game?.transition);
  const controlsList = (
    <div className="pe-keys">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
      <span><kbd>Mouse</kbd> look</span>
      <span><kbd>Shift</kbd> sprint</span>
      <span><kbd>C</kbd> / <kbd>Ctrl</kbd> crouch</span>
      <span><kbd>E</kbd> / click interact</span>
      <span><kbd>F</kbd> flashlight</span>
      <span><kbd>I</kbd> inventory</span>
      <span><kbd>Q</kbd> / wheel next item</span>
      <span><kbd>Esc</kbd> pause</span>
    </div>
  );

  return (
    <div ref={rootRef} className={`pe${playing ? " pe--play" : ""}${playing && locked && !panel ? " pe--locked" : ""}${game?.night ? " pe--night" : ""}`} onContextMenu={(e) => e.preventDefault()}>
      {/* ---------------- HUD */}
      {playing && game && (
        <div className="pe-hud" aria-hidden={!!panel}>
          {mission && (
            <div className="pe-card pe-mission">
              <div className="pe-mission__label">Mission {mission.index + 1}/{mission.total}</div>
              <div className="pe-mission__title">{mission.title}</div>
              <ul className="pe-steps">
                {mission.steps.map((s) => (
                  <li key={s.id} className={s.done ? "is-done" : s.cur ? "is-cur" : ""}>
                    <i />{s.text}
                  </li>
                ))}
              </ul>
              {mission.hint && <div className="pe-hint">💡 {mission.hint}</div>}
            </div>
          )}

          <div className="pe-susp" ref={(el) => (hud.current.suspWrap = el)} data-lvl="0">
            <span className="pe-susp__label" ref={(el) => (hud.current.suspLabel = el)}>UNNOTICED</span>
            <div className="pe-susp__bar"><i ref={(el) => (hud.current.susp = el)} /></div>
          </div>

          <div className="pe-mapwrap">
            <canvas className="pe-map" width="168" height="168" ref={(el) => (hud.current.map = el)} />
            <div className="pe-zone" ref={(el) => (hud.current.zone = el)} />
          </div>

          <div className="pe-card pe-status">
            <div className="pe-vis">
              <svg ref={(el) => (hud.current.eye = el)} viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
              <div>
                <b ref={(el) => (hud.current.visLabel = el)} />
                <small ref={(el) => (hud.current.stance = el)} />
              </div>
            </div>
            <div className="pe-stam" ref={(el) => (hud.current.stamWrap = el)}>
              <span>Stamina</span>
              <div><i ref={(el) => (hud.current.stam = el)} /></div>
            </div>
          </div>

          <div className="pe-card pe-sel">
            <span className="pe-sel__icon" ref={(el) => (hud.current.selIcon = el)} />
            <div>
              <b ref={(el) => (hud.current.selName = el)} />
              <small><span ref={(el) => (hud.current.invCount = el)} /> · <kbd>I</kbd> bag · <kbd>Q</kbd> next</small>
            </div>
            <span className="pe-flash" ref={(el) => (hud.current.flash = el)} data-on="x" title="Flashlight (F)">🔦</span>
          </div>

          <div className="pe-cross" ref={(el) => (hud.current.cross = el)} data-on="0" />
          <svg className="pe-ring" ref={(el) => (hud.current.ring = el)} data-on="0" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="15.9" pathLength="100" className="pe-ring__bg" />
            <circle cx="20" cy="20" r="15.9" pathLength="100" className="pe-ring__fg" ref={(el) => (hud.current.ringFill = el)} />
          </svg>
          <div className="pe-prompt" ref={(el) => (hud.current.prompt = el)} data-on="0">
            <kbd ref={(el) => (hud.current.promptKey = el)}>E</kbd>
            <span ref={(el) => (hud.current.promptText = el)} />
            <small ref={(el) => (hud.current.promptSub = el)} />
          </div>
        </div>
      )}

      {hidden && playing && <div className={`pe-hideview is-${hidden}`} aria-hidden="true"><span>Hidden — press <kbd>E</kbd> to leave</span></div>}

      {/* ---------------- subtitles + toasts + banner */}
      <div className="pe-subs" aria-live="polite">
        {subs.map((s) => (
          <div key={s.id} className={`pe-sub is-${s.kind}`}>{s.who && <b>{s.who}: </b>}{s.text}</div>
        ))}
      </div>
      <div className="pe-toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`pe-toast is-${t.kind}`}>{t.text}</div>)}
      </div>
      {banner && playing && (
        <div className="pe-banner" key={banner.id}>
          <small>Mission complete</small>
          <b>{banner.title}</b>
          {banner.next && <span>Next: {banner.next}</span>}
        </div>
      )}

      {/* ---------------- capture / time-of-day overlays */}
      {overlay && playing && (
        <div className={`pe-overlay is-${overlay.kind}`}>
          <b>{overlay.text}</b>
          <span>{overlay.sub}</span>
          {overlay.kind === "capture" && <small>Returning to your cell…</small>}
        </div>
      )}

      {/* ---------------- panels */}
      {playing && game && panel && (
        <div className="pe-panel-wrap" onMouseDown={(e) => e.stopPropagation()}>
          <Panel panel={panel} game={game} close={closePanel} setPanel={setPanel} choose={choose} pressGlyph={pressGlyph} useItem={useItem} newGame={newGame} hud={hud} />
        </div>
      )}

      {/* ---------------- pause */}
      {paused && (
        <div className="pe-veil" onMouseDown={(e) => e.stopPropagation()}>
          <div className="pe-menu pe-menu--pause">
            <h2>{game && game.time < 0.5 ? "Ready?" : "Paused"}</h2>
            <button className="pe-btn pe-btn--primary" onClick={() => { audio.unlock(); requestLock(); }}>▶ {game && game.time < 0.5 ? "Start" : "Resume"}</button>
            <button className="pe-btn" onClick={() => setShowControls((v) => !v)}>{showControls ? "Hide controls" : "Controls"}</button>
            {showControls && controlsList}
            <label className="pe-sens">
              Mouse sensitivity <b>{sens.toFixed(1)}×</b>
              <input type="range" min="0.3" max="2.5" step="0.1" value={sens} onChange={(e) => changeSens(Number(e.target.value))} />
            </label>
            <button className="pe-btn" onClick={toMenu}>Main Menu <small>progress is saved</small></button>
          </div>
        </div>
      )}

      {/* ---------------- main menu */}
      {screen === "menu" && (
        <div className="pe-veil pe-veil--menu">
          <div className="pe-menu pe-menu--main">
            <div className="pe-logo">
              <span className="pe-logo__bars" aria-hidden="true" />
              <h1>Prison Escape <em>3D</em></h1>
              <p className="pe-tag">PLAN • SNEAK • ESCAPE</p>
            </div>
            {confirmNew ? (
              <>
                <p className="pe-warn">Start a new escape? Your saved progress (Mission {(saveInfo?.mission ?? 0) + 1}: {MISSIONS[saveInfo?.mission ?? 0].title}) will be lost.</p>
                <button className="pe-btn pe-btn--danger" onClick={newGame}>Yes, start over</button>
                <button className="pe-btn" onClick={() => setConfirmNew(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="pe-btn pe-btn--primary" onClick={saveInfo ? continueGame : newGame}>▶ Play</button>
                <button className="pe-btn" disabled={!saveInfo} onClick={continueGame}>
                  Continue{saveInfo ? <small>Mission {saveInfo.mission + 1} · {MISSIONS[saveInfo.mission].title}{saveInfo.timesCaught ? ` · caught ${saveInfo.timesCaught}×` : ""}</small> : <small>no saved escape</small>}
                </button>
                <button className="pe-btn" onClick={() => (saveInfo ? setConfirmNew(true) : newGame())}>New Game</button>
                <button className="pe-btn" onClick={() => { audio.ui(); screenRef.current = "how"; setScreen("how"); }}>How to Play</button>
              </>
            )}
          </div>
        </div>
      )}
      {screen === "how" && (
        <div className="pe-veil pe-veil--menu">
          <div className="pe-menu pe-menu--how">
            <h2>How to Play</h2>
            <div className="pe-how">
              <section>
                <h3>Controls</h3>
                {controlsList}
                <p className="pe-note">Tip: use <kbd>C</kbd> to crouch — holding <kbd>Ctrl</kbd> while pressing <kbd>W</kbd> can close the browser tab.</p>
              </section>
              <section>
                <h3>Stealth</h3>
                <ul>
                  <li>By day you may walk the <b>cell block, corridor, cafeteria and laundry</b>. Red areas on the minimap are restricted.</li>
                  <li>Guards notice you by <b>distance, angle, light and line of sight</b> — walls block their view, bars don't.</li>
                  <li><b>Crouch</b> to stay low and quiet. <b>Sprinting</b> is loud and suspicious.</li>
                  <li>The <b>suspicion meter</b> fills while you're watched. Break line of sight or hide in a <b>locker, cart or dumpster</b>.</li>
                  <li>Cameras sweep — wait for the red cone to pass. After lights out, everywhere outside your cell is off limits.</li>
                </ul>
              </section>
              <section>
                <h3>Escaping</h3>
                <ul>
                  <li>Follow the <b>mission card</b> (top left). The orange diamond on the minimap marks your objective; hints appear if you get stuck.</li>
                  <li>Search everything with <kbd>E</kbd>. Notes stay in your inventory — reread them with <kbd>I</kbd>.</li>
                  <li>Caught? You're returned to your cell — you keep your progress and items.</li>
                  <li>Two ways out: the <b>Maintenance Route</b> and the <b>Courtyard Route</b>.</li>
                </ul>
              </section>
            </div>
            <button className="pe-btn pe-btn--primary" onClick={() => { audio.ui(); screenRef.current = "menu"; setScreen("menu"); }}>Back</button>
          </div>
        </div>
      )}
      {screen === "ending" && ending && (
        <div className="pe-veil pe-veil--end">
          <div className="pe-menu pe-menu--end">
            <p className="pe-tag">YOU'RE OUT</p>
            <h1 className="pe-escaped">ESCAPED!</h1>
            <div className="pe-stats">
              <div><small>Escape route</small><b>{ending.routeName}</b></div>
              <div><small>Time taken</small><b>{fmtTime(ending.time)}</b></div>
              <div><small>Times caught</small><b>{ending.caught}</b></div>
            </div>
            <p className="pe-note">{ending.route === "A" ? "Through the dark service tunnel and out the drainage gate — nobody saw a thing." : "Over the yard, under the searchlights and through the drain — gone before the count."}{ending.caught === 0 ? " A ghost. Never caught once." : ""}</p>
            <button className="pe-btn pe-btn--primary" onClick={newGame}>Play Again</button>
            <button className="pe-btn" onClick={() => { screenRef.current = "menu"; setScreen("menu"); gameRef.current = null; }}>Main Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== panels */
function Panel({ panel, game, close, setPanel, choose, pressGlyph, useItem, newGame, hud }) {
  const foot = (txt = "E / Esc close") => <footer className="pe-panel__foot"><span>{txt}</span></footer>;
  switch (panel.type) {
    case "dialogue": {
      const last = panel.step >= panel.lines.length - 1;
      return (
        <div className="pe-panel pe-dialogue">
          <header><span className="pe-dialogue__who">{panel.speaker}</span><button className="pe-x" onClick={() => close(false)} aria-label="Close">✕</button></header>
          <p className="pe-dialogue__line" key={panel.step}>{panel.lines[panel.step]}</p>
          {last && panel.choices.length > 0 ? (
            <div className="pe-choices">
              {panel.choices.map((c, i) => (
                <button key={c.id} className={`pe-btn${c.id !== "wait" ? " pe-btn--primary" : ""}`} disabled={c.disabled} onClick={() => choose(c.id)}>
                  <kbd>{i + 1}</kbd> {c.label}{c.sub && <small>{c.sub}</small>}
                </button>
              ))}
            </div>
          ) : (
            <button className="pe-btn pe-btn--primary pe-dialogue__next" onClick={() => (last ? close(true) : setPanel({ ...panel, step: panel.step + 1 }))}>
              {last ? "Close" : "Continue"} <kbd>E</kbd>
            </button>
          )}
          <div className="pe-dots">{panel.lines.map((_, i) => <i key={i} className={i <= panel.step ? "is-on" : ""} />)}</div>
        </div>
      );
    }
    case "note": {
      const n = NOTES[panel.id];
      return (
        <div className="pe-panel pe-note-panel">
          <div className="pe-paper">
            <h2>{n.title}</h2>
            {n.body.map((l, i) => <p key={i}>{l}</p>)}
            {n.glyphs && (
              <div className="pe-glyphs">
                {n.glyphs.map((g, i) => <span key={i}><Glyph id={g} size={38} /><small>{i + 1}</small></span>)}
              </div>
            )}
            {n.foot && <p className="pe-paper__foot">{n.foot}</p>}
          </div>
          <button className="pe-btn pe-btn--primary" onClick={() => (panel.from === "inventory" ? setPanel({ type: "inventory" }) : close(true))}>{panel.from === "inventory" ? "Back" : "Done"} <kbd>E</kbd></button>
        </div>
      );
    }
    case "inventory": {
      const sel = game.sel;
      const def = sel ? ITEMS[sel] : null;
      return (
        <div className="pe-panel pe-inv">
          <header><h2>Inventory</h2><button className="pe-x" onClick={() => close(true)} aria-label="Close">✕</button></header>
          {game.inv.length === 0 ? <p className="pe-note">Your pockets are empty. Search things with E.</p> : (
            <div className="pe-inv__grid">
              {game.inv.map((id) => (
                <button key={id} className={`pe-slot${id === sel ? " is-sel" : ""}`} onClick={() => { game.select(id); setPanel({ type: "inventory", t: Math.random() }); }}>
                  <span>{ITEMS[id].icon}</span>
                  <small>{ITEMS[id].name}</small>
                  {id === "flashlight" && game.flashlight && <i className="pe-slot__on">ON</i>}
                </button>
              ))}
            </div>
          )}
          {def && (
            <div className="pe-inv__detail">
              <b>{def.icon} {def.name}</b>
              <p>{def.desc}</p>
              <div className="pe-row">
                {def.read && <button className="pe-btn pe-btn--primary" onClick={() => useItem(sel)}>Read</button>}
                {sel === "flashlight" && <button className="pe-btn pe-btn--primary" onClick={() => { useItem(sel); setPanel({ type: "inventory", t: Math.random() }); }}>{game.flashlight ? "Switch off" : "Switch on"}</button>}
                {!def.read && sel !== "flashlight" && <span className="pe-note">Selected — aim at something it fits and press <kbd>E</kbd>.</span>}
              </div>
            </div>
          )}
          <div className="pe-inv__route">
            {game.mission >= 6 && Object.entries(ROUTES).map(([k, r]) => (
              <div key={k}><b>{r.name}</b> {r.needs.map((i) => <span key={i} className={game.has(i) ? "is-ok" : ""}>{ITEMS[i].icon} {ITEMS[i].name}</span>)}</div>
            ))}
          </div>
          {foot("I / E / Esc close")}
        </div>
      );
    }
    case "keypad": {
      const entered = panel.entered || [];
      const hasNote = game.has("accessnote");
      return (
        <div className={`pe-panel pe-keypad${panel.result === "wrong" ? " is-wrong" : ""}${panel.result === "ok" ? " is-ok" : ""}`}>
          <header><h2>Maintenance Door</h2><button className="pe-x" onClick={() => close(true)} aria-label="Close">✕</button></header>
          <div className="pe-keypad__slots">
            {[0, 1, 2, 3].map((i) => <span key={i}>{entered[i] ? <Glyph id={entered[i]} size={26} /> : null}</span>)}
          </div>
          <div className="pe-keypad__status">{panel.result === "ok" ? "ACCESS GRANTED" : panel.result === "wrong" ? "ACCESS DENIED" : "ENTER GLYPH SEQUENCE"}</div>
          <div className="pe-keypad__grid">
            {GLYPHS.map((g, i) => (
              <button key={g} className="pe-glyphbtn" onClick={() => pressGlyph(g)} aria-label={g}>
                <Glyph id={g} size={30} />
                <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
          {panel.result === "wrong" && (
            <p className="pe-note">{hasNote ? "Wrong order. Your access note shows the sequence." : panel.wrongs > 1 ? "Guessing won't work — the sequence must be written down somewhere. Staff keep paperwork in the storage room." : "Wrong sequence."}</p>
          )}
          {hasNote && (
            panel.peek ? (
              <div className="pe-glyphs pe-glyphs--sm">{NOTES.accessnote.glyphs.map((g, i) => <span key={i}><Glyph id={g} size={22} /><small>{i + 1}</small></span>)}</div>
            ) : (
              <button className="pe-btn" onClick={() => setPanel({ ...panel, peek: true })}>🗒️ Check your access note</button>
            )
          )}
          {foot("1–6 press · Esc close")}
        </div>
      );
    }
    case "cctv":
      return (
        <div className="pe-panel pe-cctv">
          <header><h2>CCTV — Patrol Monitor</h2><button className="pe-x" onClick={() => close(true)} aria-label="Close">✕</button></header>
          <canvas width="560" height="340" ref={(el) => (hud.current.cctv = el)} />
          <p className="pe-note">Live feed. Dots are guards (orange patrolling, yellow searching, red chasing), dashed lines their routes, red wedges the cameras. Officer Hale leaves the Guard Station desk to walk the Restricted Corridor, then comes back.</p>
          {foot("E / Esc close — the world keeps moving while you watch")}
        </div>
      );
    case "restart":
      return (
        <div className="pe-panel">
          <header><h2>Restart the escape?</h2></header>
          <p className="pe-note">You'll go back to your first night. Current progress (Mission {game.mission + 1}: {MISSIONS[game.mission].title}) will be lost.</p>
          <div className="pe-row">
            <button className="pe-btn pe-btn--danger" onClick={newGame}>Yes, restart</button>
            <button className="pe-btn" onClick={() => close(true)}>Keep playing</button>
          </div>
        </div>
      );
    default:
      return null;
  }
}
