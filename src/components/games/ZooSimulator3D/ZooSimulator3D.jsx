/**
 * Zoo Simulator 3D — a first-person zoo management sim for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the Zoo (sim.js) and
 * draws it with plain Three.js (world.js). React renders menus, panels and
 * toasts; the live HUD (money, clock, rating, prompt, hotbar, compass) is
 * written straight to DOM refs ~10×/s so walking around never re-renders.
 *
 * Controls: WASD walk · mouse look (Pointer Lock) · Shift sprint · E / click
 * interact · 1-3 tools (or wheel) · F flashlight · Esc releases the mouse.
 * Interaction panels release the pointer and freeze movement; the sim keeps
 * running underneath them. `restartSignal` asks to start a brand-new zoo,
 * `muted` silences all sound. Progress autosaves to localStorage.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./ZooSimulator3D.css";
import { Zoo, money, moodWord, readSave } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import {
  SAVE_KEY, SETTINGS_KEY, SPECIES, ENC_BY_ID, ZONES, UPGRADES, STAFF, MISSIONS, DAILY_POOL, TICKET_PRICES,
  PRICE_DEMAND, DAY_LENGTH,
} from "./data.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("zootest");
const TOOLS = [
  { icon: "🪣", name: "Food bucket" },
  { icon: "💧", name: "Water jug" },
  { icon: "🧹", name: "Broom" },
];
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyF", "Digit1", "Digit2", "Digit3", "Tab"]);

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
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}
const pct = (v) => `${Math.round(v * 100)}%`;
const clock = (t) => {
  const mins = 8 * 60 + Math.floor((t / DAY_LENGTH) * 12 * 60); // 08:00 → 20:00
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
};

/** A showcase zoo for the main-menu flyover (everything built, visitors about). */
function demoZoo() {
  const z = new Zoo(null, { seed: 42 });
  z.money = 1e7;
  z.build("zebra");
  z.unlockZone("savanna");
  z.build("giraffe");
  z.build("lion");
  z.unlockZone("valley");
  z.build("elephant");
  for (const u of ["benches", "flowers", "kiosk"]) z.buyUpgrade(u);
  z.hire("keeper");
  z.hire("cleaner");
  z.dayT = DAY_LENGTH * 0.3;
  Object.assign(z.player, { x: -200, z: -200 });
  for (let i = 0; i < 400; i++) z.update(0.1);
  z.events.length = 0;
  return z;
}

export default function ZooSimulator3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const zooRef = useRef(null);
  const demoRef = useRef(null);
  const screenRef = useRef("menu");
  const panelRef = useRef(null);
  const lockedRef = useRef(false);
  const keys = useRef(new Set());
  const look = useRef({ yaw: 0, pitch: 0 });
  const targetRef = useRef(null);
  const hud = useRef({});
  const settingsRef = useRef(null);
  if (!settingsRef.current) settingsRef.current = loadSettings();

  const [screen, setScreen] = useState("menu"); // menu | how | play
  const [panel, setPanel] = useState(null);
  const [locked, setLocked] = useState(false);
  const [saveInfo, setSaveInfo] = useState(() => (typeof localStorage !== "undefined" ? readSave(localStorage, SAVE_KEY) : null));
  const [confirmNew, setConfirmNew] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [mission, setMission] = useState(null);
  const [, setTick] = useState(0);
  const [sens, setSens] = useState(settingsRef.current.sens);

  /* ------------------------------------------------------------ toasts */
  const toastId = useRef(0);
  const toast = useCallback((text, kind = "info", ms = 2800) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  /* ------------------------------------------------------------ save */
  const saveNow = useCallback(() => {
    const zoo = zooRef.current;
    if (!zoo || TEST && PARAMS.has("nosave")) return;
    const s = zoo.serialize();
    if (store(SAVE_KEY, s)) setSaveInfo(s);
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
      if (!l) keys.current.clear();
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, []);

  /* ------------------------------------------------------------ panels */
  const openPanel = useCallback((p) => {
    panelRef.current = p;
    setPanel(p);
    keys.current.clear();
    audio.ui();
    releaseLock();
  }, [releaseLock]);
  const closePanel = useCallback((relock = true) => {
    panelRef.current = null;
    setPanel(null);
    if (relock && screenRef.current === "play") requestLock();
  }, [requestLock]);

  /* ------------------------------------------------------------ mission view */
  const syncMission = useCallback(() => {
    const zoo = zooRef.current;
    if (!zoo) return;
    const m = MISSIONS[zoo.mission];
    const next = m ? { i: zoo.mission, text: m.text, hint: m.hint, reward: m.reward } : { i: MISSIONS.length, text: "All missions complete!", hint: "Keep your zoo thriving — finish daily tasks for bonus cash.", reward: 0 };
    setMission((cur) => (cur && cur.i === next.i && cur.text === next.text ? cur : next));
  }, []);

  /* ------------------------------------------------------------ events → feedback */
  const lastCash = useRef(0);
  const handleEvents = useCallback((zoo) => {
    const world = worldRef.current;
    const p = zoo.player;
    for (const e of zoo.events.splice(0)) {
      const dist = e.x != null ? Math.hypot(e.x - p.x, e.z - p.z) : 0;
      switch (e.type) {
        case "step":
          audio.step(e.surface, e.sprint);
          break;
        case "animal":
          if (dist < 40) audio.animal(e.species, (1 - dist / 40) * (e.ambient ? 0.6 : 1));
          break;
        case "feed":
          audio.feed();
          world?.burst("feed", e.x, 0.6, e.z);
          if (e.msg) toast(e.msg, "good", 1800);
          break;
        case "eat":
          if (dist < 18) toast(`${e.name} is eating`, "info", 1500);
          break;
        case "water":
          audio.water();
          world?.burst("water", e.x, 0.6, e.z);
          toast(e.msg, "good", 1800);
          break;
        case "tap":
        case "collect":
          if (e.type === "tap") audio.tap();
          else audio.collect();
          toast(e.msg, "good", 1600);
          break;
        case "clean":
          audio.clean();
          world?.burst("clean", e.x, 0.3, e.z, 18);
          if (e.msg) toast(e.msg, "good", 2200);
          break;
        case "cash": {
          const h = hud.current.money;
          if (h) {
            h.classList.remove("is-pulse");
            void h.offsetWidth;
            h.classList.add("is-pulse");
          }
          const now = performance.now();
          if (e.kind !== "rewards" && now - lastCash.current > 900) {
            lastCash.current = now;
            audio.cash(dist < 25 ? 0.8 : 0.35);
          }
          break;
        }
        case "purchase":
          audio.purchase();
          world?.burst("build", p.x - Math.sin(p.yaw) * 2, 1.2, p.z - Math.cos(p.yaw) * 2, 24);
          toast(e.msg, "success", e.big ? 3600 : 2600);
          break;
        case "mission":
          audio.mission();
          toast(`Mission complete: ${e.msg}  +${money(e.reward)}`, "mission", 4200);
          syncMission();
          break;
        case "daily":
          audio.cash(1);
          toast(`${e.msg}  +${money(e.reward)}`, "mission", 3600);
          break;
        case "day":
          toast(`Day ${e.day} complete · income ${money(e.income)} · wages ${money(e.wages)}`, "info", 4500);
          if (e.quit.length) toast(`${e.quit.join(", ")} quit — you couldn't pay wages!`, "error", 4500);
          break;
        case "error":
        case "deny":
          audio.error();
          toast(e.msg, e.type === "error" ? "error" : "warn", 2200);
          break;
        case "info":
          toast(e.msg, "info", 2000);
          break;
        default:
      }
    }
  }, [toast, syncMission]);

  /* ------------------------------------------------------------ HUD writer */
  const lastHud = useRef({});
  const writeHud = useCallback((zoo) => {
    const h = hud.current;
    const L = lastHud.current;
    const set = (key, val) => {
      if (L[key] !== val && h[key]) {
        L[key] = val;
        h[key].textContent = val;
      }
    };
    const p = zoo.player;
    set("money", money(zoo.money));
    set("day", `Day ${zoo.day}`);
    set("clock", clock(zoo.dayT));
    if (h.dayBar) h.dayBar.style.transform = `scaleX(${(zoo.dayT / DAY_LENGTH).toFixed(3)})`;
    const stars = Math.round(zoo.sat * 10) / 2;
    set("stars", "★★★★★".slice(0, Math.floor(stars)) + (stars % 1 ? "⯪" : "") + "☆☆☆☆☆".slice(0, 5 - Math.ceil(stars)));
    set("sat", pct(zoo.sat));
    set("visitors", String(zoo.visitors.length));
    set("vToday", `${zoo.today.visitors} today`);
    const counts = [`${p.food}/${zoo.foodCap}`, `${p.water}/${zoo.waterCap}`, "∞"];
    counts.forEach((c, i) => set("count" + i, c));
    if (L.tool !== p.tool && h.slots) {
      L.tool = p.tool;
      h.slots.forEach((el, i) => el?.classList.toggle("is-on", i === p.tool));
    }
    if (L.flash !== p.flashlight && h.flash) {
      L.flash = p.flashlight;
      h.flash.classList.toggle("is-on", p.flashlight);
    }
    const pr = zoo.missionProgress();
    set("mProg", pr ? (pr.goal > 1 ? `${pr.cur.toLocaleString("en-US")} / ${pr.goal.toLocaleString("en-US")}${MISSIONS[zoo.mission].stat === "sat" ? "%" : ""}` : "") : "");
    if (h.mBar) h.mBar.style.transform = `scaleX(${pr ? Math.min(1, pr.cur / pr.goal).toFixed(3) : 1})`;
    zoo.daily.tasks.forEach((t, i) => {
      const def = DAILY_POOL.find((d) => d.type === t.type);
      set("d" + i, `${t.done ? "✔" : "○"} ${def.text(t.goal)}  ${t.done ? "" : `${zoo.dailyProgress(t)}/${t.goal}`}`);
      if (h["d" + i]) h["d" + i].classList.toggle("is-done", t.done);
    });
    // compass + objective guide (beacon in the world, marker on the compass)
    if (h.compass) h.compass.style.transform = `translateX(${(((p.yaw / (Math.PI * 2)) * 400) % 400).toFixed(1)}px)`;
    const g = zoo.guide();
    worldRef.current?.setGuide(g);
    if (h.guide) h.guide.dataset.on = g ? "1" : "0";
    if (g) {
      const dist = Math.hypot(g.x - p.x, g.z - p.z);
      set("guideText", g.label);
      set("guideDist", dist < 3 ? "here" : `${Math.round(dist)} m`);
      let rel = Math.atan2(g.x - p.x, -(g.z - p.z)) + p.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const px = (rel / (Math.PI * 2)) * 400;
      if (h.compassGoal) {
        h.compassGoal.style.transform = `translateX(${Math.max(-96, Math.min(96, px)).toFixed(1)}px)`;
        h.compassGoal.dataset.edge = Math.abs(px) > 96 ? "1" : "0";
      }
    }
    if (h.compassGoal) h.compassGoal.style.display = g ? "" : "none";
    const it = targetRef.current;
    const promptKey = it ? it.key + "|" + zoo.describe(it).text + zoo.describe(it).sub : "";
    if (L.prompt !== promptKey && h.prompt) {
      L.prompt = promptKey;
      if (!it) h.prompt.dataset.on = "0";
      else {
        const d = zoo.describe(it);
        h.prompt.dataset.on = "1";
        h.prompt.dataset.ok = d.ok ? "1" : "0";
        h.promptText.textContent = d.text;
        h.promptSub.textContent = d.sub || "";
      }
      if (h.cross) h.cross.dataset.on = it ? "1" : "0";
    }
  }, []);

  /* ------------------------------------------------------------ main loop */
  const frameRef = useRef(null);
  const timers = useRef({ hud: 0, save: 0 });
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
      world.render(demo, dt, "menu");
      return;
    }
    const zoo = zooRef.current;
    if (!zoo) return;
    const active = lockedRef.current && !panelRef.current;
    const running = active || !!panelRef.current;
    if (running) zoo.update(dt);
    const p = zoo.player;
    if (active) {
      const k = 1 - Math.exp(-dt * 32);
      p.yaw += (look.current.yaw - p.yaw) * k;
      p.pitch += (look.current.pitch - p.pitch) * k;
      const K = keys.current;
      zoo.stepPlayer({
        f: K.has("KeyW") || K.has("ArrowUp"),
        b: K.has("KeyS") || K.has("ArrowDown"),
        l: K.has("KeyA") || K.has("ArrowLeft"),
        r: K.has("KeyD") || K.has("ArrowRight"),
        sprint: K.has("ShiftLeft") || K.has("ShiftRight"),
      }, dt);
    } else {
      p.vx = p.vz = 0;
      p.moving = 0;
    }
    world.render(zoo, dt, "play");
    if (active) {
      const { eye, dir } = world.look();
      targetRef.current = zoo.pick(eye, dir);
    } else targetRef.current = null;
    world.setTarget(targetRef.current);
    handleEvents(zoo);
    timers.current.hud -= dt;
    if (timers.current.hud <= 0) {
      timers.current.hud = 0.1;
      writeHud(zoo);
    }
    timers.current.save -= dt;
    if (timers.current.save <= 0) {
      timers.current.save = 20;
      saveNow();
    }
  };

  useEffect(() => {
    // a fresh canvas per mount: dispose() force-loses the old context
    const canvas = document.createElement("canvas");
    canvas.className = "zoo-canvas";
    canvas.setAttribute("aria-hidden", "true");
    rootRef.current.prepend(canvas);
    const world = createWorld(canvas, { preserve: TEST });
    worldRef.current = world;
    if (!demoRef.current) demoRef.current = demoZoo();
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
      window.__zoo = {
        world,
        zoo: () => zooRef.current,
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
      if (TEST) delete window.__zoo;
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
  const begin = useCallback((zoo) => {
    zooRef.current = zoo;
    look.current.yaw = zoo.player.yaw;
    look.current.pitch = zoo.player.pitch;
    lastHud.current = {};
    timers.current = { hud: 0, save: 20 };
    targetRef.current = null;
    panelRef.current = null;
    setPanel(null);
    setConfirmNew(false);
    screenRef.current = "play";
    setScreen("play");
    audio.unlock();
    audio.ambience(1);
    syncMission();
    requestLock();
  }, [requestLock, syncMission]);

  const newGame = useCallback(() => {
    audio.unlock();
    audio.ui();
    const zoo = new Zoo(null, { seed: TEST ? 5 : (Date.now() % 1e9) | 0 });
    begin(zoo);
    toast("Welcome to your zoo! Follow the objective at the top right.", "info", 4200);
    store(SAVE_KEY, zoo.serialize());
    setSaveInfo(zoo.serialize());
  }, [begin, toast]);

  const continueGame = useCallback(() => {
    audio.unlock();
    audio.ui();
    const s = readSave(localStorage, SAVE_KEY);
    if (!s) {
      setSaveInfo(null);
      toast("Save data was missing or damaged — starting fresh.", "warn", 3500);
      return newGame();
    }
    begin(new Zoo(s));
    toast(`Welcome back! Day ${s.day}`, "info", 2500);
  }, [begin, newGame, toast]);

  const toMenu = useCallback(() => {
    saveNow();
    releaseLock();
    panelRef.current = null;
    setPanel(null);
    zooRef.current = null;
    screenRef.current = "menu";
    setScreen("menu");
    audio.ambience(0);
  }, [saveNow, releaseLock]);

  // GamePlayer Restart → confirm a brand-new zoo
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play") openPanel({ type: "restart" });
    else if (saveInfo) setConfirmNew(true);
    else newGame();
  }, [restartSignal, openPanel, newGame, saveInfo]);

  // live panel refresh
  useEffect(() => {
    if (!panel) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [panel]);

  useEffect(() => {
    if (!TEST || !window.__zoo) return;
    Object.assign(window.__zoo, { newGame, continueGame, toMenu, openPanel, closePanel, screen, panel, locked, requestLock, releaseLock, saveNow });
  });

  /* ------------------------------------------------------------ input */
  const doInteract = useCallback(() => {
    const zoo = zooRef.current;
    const it = targetRef.current;
    if (!zoo || !it) return;
    const res = zoo.interact(it);
    if (res?.panel) openPanel(res.panel);
    if (res?.use) worldRef.current?.useTool();
    handleEvents(zoo);
  }, [openPanel, handleEvents]);

  const playing = screen === "play";
  useEffect(() => {
    if (!playing) return undefined;
    const kd = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (panelRef.current) {
        if (e.code === "KeyE" || e.code === "Escape") {
          e.preventDefault();
          closePanel(e.code === "KeyE");
        }
        return;
      }
      if (!lockedRef.current) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      keys.current.add(e.code);
      if (e.repeat) return;
      const zoo = zooRef.current;
      if (!zoo) return;
      audio.unlock();
      if (e.code === "KeyE") doInteract();
      else if (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3") {
        zoo.player.tool = Number(e.code.slice(5)) - 1;
        audio.ui();
      } else if (e.code === "KeyF") {
        zoo.player.flashlight = !zoo.player.flashlight;
        audio.ui();
      }
    };
    const ku = (e) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    const mm = (e) => {
      if (!lockedRef.current || panelRef.current) return;
      const s = 0.0022 * settingsRef.current.sens;
      look.current.yaw -= (e.movementX || 0) * s;
      look.current.pitch = Math.max(-1.45, Math.min(1.45, look.current.pitch - (e.movementY || 0) * s));
    };
    const md = (e) => {
      if (!lockedRef.current || panelRef.current || e.button !== 0) return;
      doInteract();
    };
    const wheel = (e) => {
      if (!lockedRef.current || panelRef.current) return;
      e.preventDefault();
      const zoo = zooRef.current;
      if (zoo) zoo.player.tool = (zoo.player.tool + (e.deltaY > 0 ? 1 : 2)) % 3;
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
  }, [playing, closePanel, doInteract]);

  const changeSens = (v) => {
    setSens(v);
    settingsRef.current.sens = v;
    store(SETTINGS_KEY, { sens: v });
  };

  /* ------------------------------------------------------------ render */
  const zoo = zooRef.current;
  const paused = playing && !locked && !panel;
  const act = (fn) => () => {
    audio.unlock();
    fn();
    if (zooRef.current) handleEvents(zooRef.current);
    saveNow();
    setTick((t) => t + 1);
  };

  return (
    <div ref={rootRef} className={`zoo${playing ? " zoo--play" : ""}${playing && locked && !panel ? " zoo--locked" : ""}`} onContextMenu={(e) => e.preventDefault()}>
      {/* ---------------- HUD */}
      {playing && zoo && (
        <div className="zoo-hud" aria-hidden={!!panel}>
          <div className="zoo-card zoo-stats">
            <div className="zoo-money" ref={(el) => (hud.current.money = el)}>{money(zoo.money)}</div>
            <div className="zoo-row">
              <span ref={(el) => (hud.current.day = el)}>Day {zoo.day}</span>
              <span className="zoo-clock" ref={(el) => (hud.current.clock = el)} />
            </div>
            <div className="zoo-daybar"><i ref={(el) => (hud.current.dayBar = el)} /></div>
            <div className="zoo-row">
              <span className="zoo-stars" ref={(el) => (hud.current.stars = el)} />
              <span className="zoo-dim">Satisfaction <b ref={(el) => (hud.current.sat = el)} /></span>
            </div>
            <div className="zoo-row">
              <span>👥 <b ref={(el) => (hud.current.visitors = el)} /> visitors</span>
              <span className="zoo-dim" ref={(el) => (hud.current.vToday = el)} />
            </div>
          </div>

          <div className="zoo-card zoo-goal">
            <div className="zoo-goal__label">{mission && mission.i < MISSIONS.length ? `Objective ${mission.i + 1}/${MISSIONS.length}` : "Objectives"}</div>
            <div className="zoo-goal__text">{mission?.text}</div>
            <div className="zoo-goal__prog">
              <div className="zoo-goal__bar"><i ref={(el) => (hud.current.mBar = el)} /></div>
              <span ref={(el) => (hud.current.mProg = el)} />
            </div>
            <div className="zoo-guide" ref={(el) => (hud.current.guide = el)} data-on="0">
              <span className="zoo-guide__pin">📍</span>
              <span ref={(el) => (hud.current.guideText = el)} />
              <b ref={(el) => (hud.current.guideDist = el)} />
            </div>
            <div className="zoo-goal__hint">{mission?.hint}{mission?.reward ? ` Reward ${money(mission.reward)}.` : ""}</div>
            <div className="zoo-daily">
              <div className="zoo-goal__label">Daily tasks</div>
              {[0, 1, 2].map((i) => <div key={i} className="zoo-daily__item" ref={(el) => (hud.current["d" + i] = el)} />)}
            </div>
          </div>

          <div className="zoo-compass" aria-hidden="true">
            <i className="zoo-compass__goal" ref={(el) => (hud.current.compassGoal = el)} />
            <div className="zoo-compass__strip" ref={(el) => (hud.current.compass = el)}>
              {[0, 1, 2].map((k) => (
                <span key={k} className="zoo-compass__set">
                  <b>N</b><i>·</i><em>NE</em><i>·</i><b>E</b><i>·</i><em>SE</em><i>·</i><b>S</b><i>·</i><em>SW</em><i>·</i><b>W</b><i>·</i><em>NW</em><i>·</i>
                </span>
              ))}
            </div>
          </div>

          <div className="zoo-cross" ref={(el) => (hud.current.cross = el)} data-on="0" />
          <div className="zoo-prompt" ref={(el) => (hud.current.prompt = el)} data-on="0">
            <kbd>E</kbd>
            <span ref={(el) => (hud.current.promptText = el)} />
            <small ref={(el) => (hud.current.promptSub = el)} />
          </div>

          <div className="zoo-hotbar">
            {TOOLS.map((t, i) => (
              <div key={t.name} className="zoo-slot" ref={(el) => {
                hud.current.slots = hud.current.slots || [];
                hud.current.slots[i] = el;
              }}>
                <kbd>{i + 1}</kbd>
                <span className="zoo-slot__icon">{t.icon}</span>
                <span className="zoo-slot__name">{t.name}</span>
                <b ref={(el) => (hud.current["count" + i] = el)} />
              </div>
            ))}
            <div className="zoo-slot zoo-slot--flash" ref={(el) => (hud.current.flash = el)}>
              <kbd>F</kbd>
              <span className="zoo-slot__icon">🔦</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- toasts */}
      <div className="zoo-toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`zoo-toast is-${t.kind}`}>{t.text}</div>)}
      </div>

      {/* ---------------- interaction panels */}
      {playing && zoo && panel && (
        <div className="zoo-panel-wrap" onMouseDown={(e) => e.stopPropagation()}>
          <Panel panel={panel} zoo={zoo} act={act} close={() => closePanel(true)} newGame={newGame} />
        </div>
      )}

      {/* ---------------- pause / click to play */}
      {paused && (
        <div className="zoo-veil" onMouseDown={(e) => e.stopPropagation()}>
          <div className="zoo-menu zoo-menu--pause">
            <h2>{zoo && zoo.time < 1 ? "Ready to work?" : "Paused"}</h2>
            <button className="zoo-btn zoo-btn--primary" onClick={() => { audio.unlock(); requestLock(); }}>
              ▶ Click to {zoo && zoo.time < 1 ? "start" : "resume"}
            </button>
            <label className="zoo-sens">
              Mouse sensitivity <b>{sens.toFixed(1)}×</b>
              <input type="range" min="0.3" max="2.5" step="0.1" value={sens} onChange={(e) => changeSens(Number(e.target.value))} />
            </label>
            <div className="zoo-keys">
              <span><kbd>WASD</kbd> walk</span><span><kbd>Mouse</kbd> look</span><span><kbd>Shift</kbd> sprint</span>
              <span><kbd>E</kbd> / click interact</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> tools</span><span><kbd>F</kbd> flashlight</span>
            </div>
            <button className="zoo-btn" onClick={toMenu}>💾 Save &amp; exit to menu</button>
          </div>
        </div>
      )}

      {/* ---------------- main menu */}
      {screen === "menu" && (
        <div className="zoo-veil zoo-veil--menu">
          <div className="zoo-menu">
            <div className="zoo-logo">
              <span className="zoo-logo__paw">🦒</span>
              <h1>Zoo Simulator <em>3D</em></h1>
              <p className="zoo-tag">BUILD • CARE • EXPAND</p>
            </div>
            {confirmNew ? (
              <>
                <p className="zoo-warn">Start a new zoo? Your saved zoo (Day {saveInfo?.day}, {money(saveInfo?.money || 0)}) will be replaced.</p>
                <button className="zoo-btn zoo-btn--danger" onClick={newGame}>Yes, start over</button>
                <button className="zoo-btn" onClick={() => setConfirmNew(false)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="zoo-btn zoo-btn--primary" onClick={saveInfo ? continueGame : newGame}>▶ Play</button>
                <button className="zoo-btn" disabled={!saveInfo} onClick={continueGame}>
                  Continue{saveInfo ? <small> Day {saveInfo.day} · {money(saveInfo.money)}</small> : <small> no save yet</small>}
                </button>
                <button className="zoo-btn" onClick={() => (saveInfo ? setConfirmNew(true) : newGame())}>New Game</button>
                <button className="zoo-btn" onClick={() => { audio.ui(); setScreen("how"); screenRef.current = "how"; }}>How to Play</button>
              </>
            )}
          </div>
        </div>
      )}
      {screen === "how" && (
        <div className="zoo-veil zoo-veil--menu">
          <div className="zoo-menu zoo-menu--how">
            <h2>How to Play</h2>
            <div className="zoo-how">
              <section>
                <h3>Controls</h3>
                <ul>
                  <li><kbd>W A S D</kbd> walk · <kbd>Shift</kbd> sprint</li>
                  <li><kbd>Mouse</kbd> look around (click to capture)</li>
                  <li><kbd>E</kbd> or click — interact with what you aim at</li>
                  <li><kbd>1</kbd> food bucket · <kbd>2</kbd> water jug · <kbd>3</kbd> broom</li>
                  <li><kbd>F</kbd> flashlight · <kbd>Esc</kbd> pause / free the mouse</li>
                </ul>
              </section>
              <section>
                <h3>Caring for animals</h3>
                <ul>
                  <li>Follow the <b>yellow beacon</b> — it always shows where to go next.</li>
                  <li>Grab <b>free food</b> at the Storage Barn and fill troughs, or press <kbd>E</kbd> on a hungry animal.</li>
                  <li>Fill your jug at a <b>water tap</b> and refill the water stations.</li>
                  <li>Walk in through a gate and press <kbd>E</kbd> on droppings to sweep them.</li>
                </ul>
              </section>
              <section>
                <h3>Growing the zoo</h3>
                <ul>
                  <li>Visitors pay at the gate and tip when animals are happy and pens clean.</li>
                  <li>Info signs sell more animals; orange signs build new habitats.</li>
                  <li>The <b>Gift Shop</b> sells upgrades, the <b>Staff Office</b> hires help, the <b>Ticket Booth</b> sets prices.</li>
                  <li>Open the barriers to Savanna Plains and Elephant Valley to expand.</li>
                </ul>
              </section>
            </div>
            <button className="zoo-btn zoo-btn--primary" onClick={() => { audio.ui(); setScreen("menu"); screenRef.current = "menu"; }}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== panels */
function Bar({ label, v, warn = 0.35 }) {
  return (
    <div className={`zoo-bar${v < warn ? " is-low" : ""}`}>
      <span>{label}</span>
      <div><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, v))})` }} /></div>
      <b>{pct(v)}</b>
    </div>
  );
}

function Panel({ panel, zoo, act, close, newGame }) {
  const head = (title, sub, icon) => (
    <header className="zoo-panel__head">
      <span className="zoo-panel__icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      <button className="zoo-x" onClick={close} aria-label="Close">✕</button>
    </header>
  );
  const foot = <footer className="zoo-panel__foot"><span><kbd>E</kbd> / <kbd>Esc</kbd> close</span><span className="zoo-panel__money">{money(zoo.money)}</span></footer>;
  const afford = (c) => zoo.money >= c;
  const ICON = { rabbit: "🐇", deer: "🦌", zebra: "🦓", giraffe: "🦒", lion: "🦁", elephant: "🐘" };

  switch (panel.type) {
    case "animal": {
      const a = zoo.animals.find((x) => x.id === panel.id);
      if (!a) return <div className="zoo-panel">{head("Animal", "It wandered off", "🐾")}{foot}</div>;
      const sp = SPECIES[a.species];
      const st = zoo.enc[a.enc];
      const p = zoo.player;
      const dist = Math.hypot(a.x - p.x, a.z - p.z);
      const canFeed = p.food > 0 && dist <= 4 + sp.r && a.hunger <= 0.95;
      return (
        <div className="zoo-panel">
          {head(`${a.name} the ${sp.name}`, `Feeling ${moodWord(a)} · ${a.male ? "male" : "female"}`, ICON[a.species])}
          <div className="zoo-panel__body">
            <Bar label="Food" v={a.hunger} />
            <Bar label="Water" v={a.thirst} />
            <Bar label="Happiness" v={a.happy} warn={0.5} />
            <Bar label="Cleanliness" v={zoo.cleanOf(a.enc)} warn={0.5} />
            <p className="zoo-note">
              Trough {pct(st.trough)} · Water station {pct(st.basin)} · {st.dirt.length} dropping{st.dirt.length === 1 ? "" : "s"}
            </p>
            <button className="zoo-btn zoo-btn--primary" disabled={!canFeed} onClick={act(() => zoo.handFeed(a.id))}>
              🪣 Hand-feed {a.name} <small>(1 portion · you have {p.food})</small>
            </button>
            {!canFeed && <p className="zoo-note zoo-note--dim">{!p.food ? "Collect food at the Storage Barn to hand-feed." : a.hunger > 0.95 ? `${a.name} is full.` : "Move closer to hand-feed."}</p>}
          </div>
          {foot}
        </div>
      );
    }
    case "enclosure": {
      const def = ENC_BY_ID[panel.id];
      const sp = SPECIES[panel.id];
      const st = zoo.enc[panel.id];
      const list = zoo.animalsIn(panel.id);
      const full = list.length >= sp.max;
      const avg = list.reduce((s, a) => s + a.happy, 0) / Math.max(1, list.length);
      return (
        <div className="zoo-panel">
          {head(`${sp.plural} habitat`, `${list.length}/${sp.max} animals · visitors love ${sp.plural.toLowerCase()} ${"★".repeat(Math.round(sp.weight))}`, ICON[panel.id])}
          <div className="zoo-panel__body">
            <Bar label="Happiness" v={avg} warn={0.5} />
            <Bar label="Trough" v={st.trough} />
            <Bar label="Water" v={st.basin} />
            <Bar label="Cleanliness" v={zoo.cleanOf(panel.id)} warn={0.5} />
            <ul className="zoo-list">
              {list.map((a) => <li key={a.id}><b>{a.name}</b><span>{moodWord(a)}</span></li>)}
            </ul>
            <button className="zoo-btn zoo-btn--primary" disabled={full || !afford(sp.animalCost)} onClick={act(() => zoo.buyAnimal(panel.id))}>
              {full ? "Habitat is full" : `Buy another ${sp.name.toLowerCase()} — ${money(sp.animalCost)}`}
            </button>
            {!full && !afford(sp.animalCost) && <p className="zoo-note zoo-note--bad">You need {money(sp.animalCost - zoo.money)} more.</p>}
            <p className="zoo-note zoo-note--dim">Gate is on the {{ E: "east", W: "west", N: "north", S: "south" }[def.gate.side]} side — walk in to sweep.</p>
          </div>
          {foot}
        </div>
      );
    }
    case "build": {
      const def = ENC_BY_ID[panel.id];
      const sp = SPECIES[panel.id];
      if (zoo.enc[panel.id].built) return <div className="zoo-panel">{head(`${sp.plural} habitat`, "Already built", ICON[panel.id])}{foot}</div>;
      const ok = afford(def.buildCost);
      return (
        <div className="zoo-panel">
          {head(`Build ${sp.name} Habitat`, ZONES[def.zone].name, ICON[panel.id])}
          <div className="zoo-panel__body">
            <ul className="zoo-facts">
              <li>Includes <b>{sp.start} {sp.start > 1 ? sp.plural.toLowerCase() : sp.name.toLowerCase()}</b> (room for {sp.max})</li>
              <li>Fenced habitat with feeding trough and water station</li>
              <li>Visitor appeal <b>{"★".repeat(Math.round(sp.weight))}</b> — more visitors and tips</li>
              <li>Extra {sp.plural.toLowerCase()} cost {money(sp.animalCost)} each</li>
            </ul>
            <div className="zoo-price">{money(def.buildCost)}</div>
            <button className="zoo-btn zoo-btn--primary" disabled={!ok} onClick={act(() => { if (zoo.build(panel.id)) close(); })}>Confirm construction</button>
            {!ok && <p className="zoo-note zoo-note--bad">Not enough money — you need {money(def.buildCost - zoo.money)} more.</p>}
            <button className="zoo-btn" onClick={close}>Cancel</button>
          </div>
          {foot}
        </div>
      );
    }
    case "expand": {
      const z = ZONES[panel.id];
      const ok = afford(z.cost);
      return (
        <div className="zoo-panel">
          {head(`Unlock ${z.name}`, "Zoo expansion", "🚧")}
          <div className="zoo-panel__body">
            <p className="zoo-note">{z.desc}</p>
            <ul className="zoo-facts">
              <li>Removes the construction barrier and opens new paths</li>
              <li>New habitat plots: {Object.values(ENC_BY_ID).filter((e) => e.zone === panel.id).map((e) => SPECIES[e.id].plural).join(" & ")}</li>
              <li>A water tap for the new area</li>
            </ul>
            <div className="zoo-price">{money(z.cost)}</div>
            <button className="zoo-btn zoo-btn--primary" disabled={!ok} onClick={act(() => { if (zoo.unlockZone(panel.id)) close(); })}>Confirm expansion</button>
            {!ok && <p className="zoo-note zoo-note--bad">Not enough money — you need {money(z.cost - zoo.money)} more.</p>}
            <button className="zoo-btn" onClick={close}>Cancel</button>
          </div>
          {foot}
        </div>
      );
    }
    case "shop":
      return (
        <div className="zoo-panel zoo-panel--wide">
          {head("Gift Shop", `Upgrades & facilities · today's souvenir sales ${money(zoo.today.shop)}`, "🎁")}
          <div className="zoo-panel__body zoo-grid">
            {Object.entries(UPGRADES).map(([id, u]) => {
              const owned = zoo.upgrades[id];
              return (
                <div key={id} className={`zoo-item${owned ? " is-owned" : ""}`}>
                  <span className="zoo-item__icon">{u.icon}</span>
                  <div className="zoo-item__txt"><b>{u.name}</b><small>{u.desc}</small></div>
                  <button className="zoo-btn zoo-btn--sm" disabled={owned || !afford(u.cost)} onClick={act(() => zoo.buyUpgrade(id))}>
                    {owned ? "Owned" : money(u.cost)}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="zoo-note zoo-note--dim zoo-pad">Facilities {pct(zoo.facilities)} — benches, gardens and snacks raise visitor satisfaction.</p>
          {foot}
        </div>
      );
    case "office":
      return (
        <div className="zoo-panel zoo-panel--wide">
          {head("Staff Office", "Wages are paid at the end of each day", "🧑‍🌾")}
          <div className="zoo-panel__body zoo-grid">
            {Object.entries(STAFF).map(([id, s]) => {
              const hired = zoo.staff[id];
              return (
                <div key={id} className={`zoo-item${hired ? " is-owned" : ""}`}>
                  <span className="zoo-item__icon" style={{ background: "#" + s.color.toString(16).padStart(6, "0") }}>{id === "keeper" ? "🪣" : id === "cleaner" ? "🧹" : "🎟️"}</span>
                  <div className="zoo-item__txt"><b>{s.name}</b><small>{s.desc} Hire {money(s.hire)} + {money(s.wage)}/day.</small></div>
                  {hired ? (
                    <button className="zoo-btn zoo-btn--sm" onClick={act(() => zoo.fire(id))}>Dismiss</button>
                  ) : (
                    <button className="zoo-btn zoo-btn--sm zoo-btn--primary" disabled={!afford(s.hire)} onClick={act(() => zoo.hire(id))}>Hire {money(s.hire)}</button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="zoo-note zoo-note--dim zoo-pad">Daily wages: {money(Object.entries(STAFF).reduce((s, [id, x]) => s + (zoo.staff[id] ? x.wage : 0), 0))}. Unpaid staff quit.</p>
          {foot}
        </div>
      );
    case "booth": {
      const t = zoo.today;
      const income = t.tickets + t.tips + t.shop + t.snacks;
      const perMin = (60 / zoo.spawnInterval()).toFixed(1);
      return (
        <div className="zoo-panel">
          {head("Ticket Booth", `Day ${zoo.day} · ${clock(zoo.dayT)}`, "🎟️")}
          <div className="zoo-panel__body">
            <table className="zoo-table">
              <tbody>
                <tr><td>Tickets</td><td>{money(t.tickets)}</td></tr>
                <tr><td>Visitor tips</td><td>{money(t.tips)}</td></tr>
                <tr><td>Gift shop</td><td>{money(t.shop)}</td></tr>
                {zoo.upgrades.kiosk && <tr><td>Snacks</td><td>{money(t.snacks)}</td></tr>}
                <tr><td>Task rewards</td><td>{money(t.rewards)}</td></tr>
                <tr className="is-total"><td>Income today</td><td>{money(income + t.rewards)}</td></tr>
                <tr><td>Spent today</td><td>−{money(t.spent)}</td></tr>
              </tbody>
            </table>
            <p className="zoo-note">{t.visitors} visitors today · ≈{perMin}/min arriving · capacity {zoo.maxVisitors}</p>
            <div className="zoo-label">Ticket price</div>
            <div className="zoo-seg">
              {TICKET_PRICES.map((pr) => (
                <button key={pr} className={zoo.ticketPrice === pr ? "is-on" : ""} onClick={act(() => zoo.setTicketPrice(pr))}>
                  ${pr}<small>{PRICE_DEMAND[pr] > 1 ? "busy" : PRICE_DEMAND[pr] === 1 ? "normal" : PRICE_DEMAND[pr] > 0.7 ? "fewer" : "few"}</small>
                </button>
              ))}
            </div>
            <p className="zoo-note zoo-note--dim">Higher prices earn more per visitor but fewer people come, and they expect more.</p>
          </div>
          {foot}
        </div>
      );
    }
    case "restart":
      return (
        <div className="zoo-panel">
          {head("Start a new zoo?", "Restart", "🔄")}
          <div className="zoo-panel__body">
            <p className="zoo-note">Your current zoo (Day {zoo.day}, {money(zoo.money)}) will be replaced by a brand-new one.</p>
            <button className="zoo-btn zoo-btn--danger" onClick={newGame}>Yes, start over</button>
            <button className="zoo-btn" onClick={close}>Keep playing</button>
          </div>
          {foot}
        </div>
      );
    default:
      return null;
  }
}
