/**
 * Vice Streets 3D — open-world city action for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the framework-free
 * Sim (engine/sim.js) at a fixed 1/60 s and draws it with plain Three.js
 * (render/world.js). The numeric HUD is written straight to DOM refs ~15×/s
 * and the mini-map / city map are canvases, so gameplay never re-renders
 * React; React only renders menus, shops, dialogue and results.
 *
 * Screens: menu | missions | garage | how | settings | play
 * Play overlays: pause | settings | map | profile | missions | brief |
 *                garage | dealer | clothes | cafe | result | ending
 * Progress persists under localStorage `vice-streets-3d-progress`.
 *
 * Game Center integration:
 *   restartSignal  Restart → restarts the active mission / activity / free-roam
 *                  session (saved progression is never touched)
 *   muted          Mute → master gain to zero for every sound
 *   Fullscreen / Like stay GamePlayer's; the canvas follows the stage.
 * Pointer lock is released on pause, overlays, results, menus, tab hide and
 * unmount; listeners, the rAF loop, audio and GPU resources are cleaned up.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./ViceStreets3D.css";
import { Sim, STEP, missionSpawn } from "./engine/sim.js";
import { getCity, DISTRICTS } from "./engine/city.js";
import { planRoute } from "./engine/nav.js";
import { loadProgress, saveProgress, freshProgress, levelInfo, missionState, applyMission, applyActivity, buyVehicle, setActive, repairCar, paintCar, upgradeCar, buyGarageUp, sellVehicle, buyOutfit, addMoney, repTitle, nextMission } from "./engine/progress.js";
import { MISSIONS, ACTIVITIES, missionById } from "./data/missions.js";
import { VEHICLE } from "./data/vehicles.js";
import { playerLook } from "./data/people.js";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { drawMinimap, drawMap } from "./ui/hud.js";
import { MainMenu, MissionList, Briefing, Result, Pause, Settings, HowTo, Profile, Dealer, Garage, Clothes, Cafe, Ending, Dialog, Logo } from "./ui/screens.jsx";
import { fmtMoney, fmtTime, clamp, damp } from "./engine/util.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("vstest");
const NOSAVE = TEST && PARAMS.has("nosave");
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyF", "KeyQ", "KeyC", "KeyH", "KeyM", "KeyJ", "Tab", "Space", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const storage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};
const isTouch = () => typeof window !== "undefined" && (PARAMS.has("vstouch") || (window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches));
const MENU_FOCUS = { x: 60, z: -40 };

export default function ViceStreets3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const canvasHost = useRef(null);
  const miniRef = useRef(null);
  const mapRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const menuSimRef = useRef(null);
  const sessionRef = useRef(null);
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const lockedRef = useRef(false);
  const keys = useRef(new Set());
  const edges = useRef({});
  const cam = useRef({ yaw: Math.PI, pitch: 0.22, near: false, freeT: 0 });
  const ctl = useRef({ steer: 0 });
  const hud = useRef({});
  const gps = useRef({ route: null, t: 0, waypoint: null, key: "" });
  const touchRef = useRef({ on: isTouch(), jx: 0, jy: 0, joyId: null, lookId: null, lx: 0, ly: 0, jump: false, sprint: false });
  const progRef = useRef(null);
  if (!progRef.current) progRef.current = storage() && !NOSAVE ? loadProgress(storage()) : freshProgress();

  const [prog, setProgState] = useState(progRef.current);
  const [screen, setScreenS] = useState("menu");
  const [overlay, setOverlayS] = useState(null);
  const [brief, setBrief] = useState(null);
  const [result, setResult] = useState(null);
  const [ending, setEnding] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  // the area you are in: a small corner label for a moment, never centre-screen
  const [area, setArea] = useState(null);
  const showArea = useCallback((name) => {
    const id = Date.now() + Math.random();
    setArea({ id, name });
    setTimeout(() => setArea((a) => (a && a.id === id ? null : a)), 1600);
  }, []);
  const [dialog, setDialog] = useState(null);
  const [say, setSay] = useState(null);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [locked, setLocked] = useState(false);
  const [quality, setQuality] = useState(progRef.current.settings.quality);
  const [touch] = useState(touchRef.current.on);
  const [inCar, setInCar] = useState(false);
  const [settingsFrom, setSettingsFrom] = useState(null);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenS(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayS(o);
    setMsg("");
  }, []);
  /** the save object is mutated in place (the sim shares it): publish + persist */
  const commit = useCallback(() => {
    const p = progRef.current;
    setProgState({ ...p });
    if (!NOSAVE && storage()) saveProgress(storage(), p);
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST || touchRef.current.on) {
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
      /* not allowed right now — the click-to-play card stays up */
    }
  }, []);
  const releaseLock = useCallback(() => {
    if (TEST || touchRef.current.on) {
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
        if (screenRef.current === "play" && !overlayRef.current && simRef.current && !simRef.current.dialog) setOverlay("pause");
      }
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setOverlay]);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const toast = useCallback((text, kind = "info") => {
    const id = ++fid.current;
    setToasts((f) => [...f.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((f) => f.filter((x) => x.id !== id)), 3200);
  }, []);
  const showBanner = useCallback((title, sub = "", kind = "info", ms = 2600) => {
    const id = ++fid.current;
    setBanner({ id, title, sub, kind });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);

  /* ------------------------------------------------------------ sessions */
  const offersFor = useCallback((sim) => {
    const P = progRef.current;
    const out = [];
    // the next open mission of each story line (main story, Coral Key arc)
    for (const arc of [undefined, "key"]) {
      const m = MISSIONS.find((x) => x.arc === arc && missionState(P, x) === "open");
      if (!m) continue;
      const at = sim.resolve(m.start.at);
      out.push({ kind: "mission", id: m.id, x: at.x, z: at.z, label: `Start mission ${m.id}: ${m.title}` });
    }
    for (const a of ACTIVITIES) {
      const p = sim.city.places[a.place];
      if (p && sim.districtOpen(p.district)) out.push({ kind: "activity", id: a.id, x: p.x, z: p.z, label: `Start ${a.name}`, icon: a.icon });
    }
    return out;
  }, []);
  const saveNow = useCallback(() => {
    const sim = simRef.current;
    const P = progRef.current;
    if (sim && !sim.ambient) {
      sim.syncOwned();
      P.clock = sim.clock;
      if (!sim.run && !sim.ending) {
        const F = sim.focus();
        if (sim.districtOpen(sim.city.districtAt(F.x, F.z))) P.free = { x: F.x, z: F.z, h: sim.player.mode === "car" && sim.player.car ? sim.player.car.h : sim.player.h };
      }
      if (sim.dirty) sim.dirty = false;
    }
    commit();
  }, [commit]);

  /** a fresh world session: free roam, or a story mission from its start point */
  const startSession = useCallback(
    (sess) => {
      audio.unlock();
      const P = progRef.current;
      let spawn;
      if (sess.mission) spawn = missionSpawn(getCity(), missionById(sess.mission));
      else {
        const f = P.free;
        spawn = f ? { x: f.x, z: f.z, h: f.h } : { x: 281, z: -85, h: -Math.PI / 2 };
      }
      const sim = new Sim({ prog: P, seed: (Date.now() % 1e9) | 0, spawn, clock: P.clock });
      simRef.current = sim;
      sessionRef.current = sess;
      if (sess.mission) sim.startMission(missionById(sess.mission));
      else if (sess.activity) sim.startActivity(sess.activity);
      sim.offers = sim.run ? [] : offersFor(sim);
      worldRef.current?.reset();
      const pl = sim.player;
      cam.current.yaw = (pl.mode === "car" && pl.car ? pl.car.h : pl.h) + Math.PI;
      cam.current.pitch = 0.22;
      cam.current.freeT = 0;
      keys.current.clear();
      edges.current = {};
      gps.current = { route: null, t: 0, waypoint: null, key: "" };
      hud.current.last = {};
      hud.current.areaName = null;
      hud.current.saveT = 8;
      setResult(null);
      setEnding(null);
      setDialog(null);
      setToasts([]);
      setBanner(null);
      setOverlay(null);
      setScreen("play");
      requestLock();
      if (sess.mission) {
        const def = missionById(sess.mission);
        setTimeout(() => showBanner(`MISSION ${def.id}`, def.title, "start", 2800), 60);
      } else if (!sess.activity) setTimeout(() => showBanner("FREE ROAM", "Drive · Explore · Rule", "start", 2200), 60);
    },
    [offersFor, requestLock, setOverlay, setScreen, showBanner],
  );

  const toMenu = useCallback(() => {
    saveNow();
    releaseLock();
    simRef.current = null;
    sessionRef.current = null;
    audio.silence();
    worldRef.current?.reset();
    setOverlay(null);
    setResult(null);
    setEnding(null);
    setDialog(null);
    setScreen("menu");
  }, [releaseLock, saveNow, setOverlay, setScreen]);

  /** finish the run: apply rewards once, show the result card */
  const finishRun = useCallback(() => {
    const sim = simRef.current;
    if (!sim?.run?.result || sim.run.applied) return;
    const run = sim.run;
    run.applied = true;
    const r = run.result;
    const P = progRef.current;
    let out;
    if (run.kind === "mission") out = applyMission(P, run.def, r);
    else {
      const a = ACTIVITIES.find((x) => x.id === run.def.id);
      out = applyActivity(P, a, r);
    }
    if (r.win && run.kind === "mission" && run.def.reward.car) sim.refreshOwned();
    commit();
    setResult({ ...r, ...out });
    setOverlay("result");
    releaseLock();
    if (r.win) audio.success();
    else audio.fail();
    if (out.notes.some((n) => n.startsWith("Level up"))) setTimeout(() => audio.levelUp(), 900);
  }, [commit, releaseLock, setOverlay]);

  const continueFree = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.ending) sim.respawn();
    sim.endRun();
    sim.police.setWanted(0);
    sim.offers = offersFor(sim);
    sessionRef.current = { free: true };
    setResult(null);
    setEnding(null);
    setOverlay(null);
    saveNow();
    requestLock();
  }, [offersFor, requestLock, saveNow, setOverlay]);

  const retry = useCallback(() => {
    const sim = simRef.current;
    const sess = sessionRef.current || {};
    const run = sim?.run;
    if (run && run.kind === "activity") {
      if (sim.ending) sim.respawn();
      sim.endRun();
      sim.startActivity(run.def.id);
      sessionRef.current = { activity: run.def.id };
      setResult(null);
      setOverlay(null);
      requestLock();
      return;
    }
    const id = run && run.kind === "mission" ? run.def.id : sess.mission;
    if (id) startSession({ mission: id });
    else startSession({ free: true });
  }, [requestLock, setOverlay, startSession]);

  // GamePlayer Restart → restart the active mission / activity / session (menus: back to the main menu)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play" && simRef.current) {
      const sim = simRef.current;
      if (sim.run) retry();
      else startSession({ free: true });
    } else {
      setScreen("menu");
      setOverlay(null);
    }
  }, [restartSignal, retry, setOverlay, setScreen, startSession]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => audio.setVolume(prog.settings.volume), [prog.settings.volume]);
  useEffect(() => audio.setRadio(prog.settings.radio), [prog.settings.radio]);
  useEffect(
    () => () => {
      // unmount: persist and shut audio down
      try {
        const sim = simRef.current;
        if (sim && !NOSAVE && storage()) {
          sim.syncOwned();
          saveProgress(storage(), progRef.current);
        }
      } catch {
        /* ignore */
      }
      audio.dispose();
    },
    [],
  );

  /* ------------------------------------------------------------ world (re)creation */
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.className = "vs-canvas";
    canvasHost.current.appendChild(canvas);
    const city = getCity();
    let world;
    try {
      world = createWorld(canvas, { city, quality });
    } catch (e) {
      console.error("[ViceStreets3D] WebGL unavailable", e);
      canvas.remove();
      hud.current.noGL = true;
      return undefined;
    }
    worldRef.current = world;
    const el = rootRef.current;
    const fit = () => {
      const r = el.getBoundingClientRect();
      world.resize(r.width, r.height);
      for (const c of [miniRef.current, mapRef.current]) {
        if (!c) continue;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        c.width = Math.round((c.clientWidth || 160) * dpr);
        c.height = Math.round((c.clientHeight || 160) * dpr);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (!menuSimRef.current) menuSimRef.current = new Sim({ prog: freshProgress(), seed: 9, ambient: true, spawn: { ...MENU_FOCUS, h: 0 }, clock: 17.6 });
    hud.current.fit = fit;
    return () => {
      ro.disconnect();
      world.dispose();
      canvas.remove();
      worldRef.current = null;
    };
  }, [quality]);
  useEffect(() => {
    hud.current.fit && hud.current.fit();
  }, [screen, overlay, inCar]);

  /* ------------------------------------------------------------ sim events → audio / UI */
  const handleEvents = useCallback(
    (sim) => {
      const F = sim.focus();
      const d = (x, z) => Math.hypot(x - F.x, z - F.z);
      for (const e of sim.events) {
        switch (e.type) {
          case "objective":
            if (sim.t > 0.3) audio.objective();
            hud.current.hintMsg = e.hint;
            hud.current.hintT = 9;
            break;
          case "checkpoint":
            audio.checkpoint();
            break;
          case "countdown":
            audio.countdown(e.n);
            showBanner(e.n ? `${e.n}` : "GO!", "", "count", 900);
            break;
          case "crash":
            audio.crash(e.impact, e.player ? 0 : d(e.x, e.z));
            break;
          case "pedHit":
            audio.pedHit(e.speed);
            break;
          case "swing":
            audio.swing(e.heavy, e.player ? 0 : d(e.x, e.z));
            break;
          case "punchHit":
            if (e.blocked) audio.block(d(e.x, e.z));
            else audio.punch(e.heavy || e.kick, d(e.x, e.z));
            break;
          case "pedDeath":
            audio.bodyFall(d(e.x, e.z));
            break;
          case "propBreak":
            audio.propBreak(e.prop.type, d(e.x, e.z));
            break;
          case "propWobble":
            audio.bump(d(e.x, e.z));
            break;
          case "callingPolice":
            if (d(e.x, e.z) < 40) toast("A witness is calling the police!", "bad");
            break;
          case "fightBack":
            if (d(e.x, e.z) < 20) toast("They're fighting back!", "warn");
            break;
          case "drink":
            audio.coin();
            break;
          case "cash":
            audio.coin();
            toast(`+${fmtMoney(e.amount)} picked up`, "good");
            break;
          case "defend":
            if (d(e.x, e.z) < 25) toast("A bystander steps in to fight you!", "warn");
            break;
          case "scream":
            audio.scream(d(e.x, e.z));
            break;
          case "honk":
            audio.honk(d(e.x, e.z));
            break;
          case "horn":
            audio.horn();
            break;
          case "jump":
            audio.jump();
            break;
          case "land":
            audio.land(e.impact);
            break;
          case "step":
            audio.step(e.run);
            break;
          case "door":
          case "exitStart":
            audio.door();
            break;
          case "entered":
            setInCar(true);
            if (e.v.type && sim.t > 1 && progRef.current.settings.hints && !hud.current.carHint) {
              hud.current.carHint = true;
              toast("W/S drive & reverse · A/D steer · Space handbrake · E get out (jump out while moving) · C camera", "info");
            }
            break;
          case "exited":
            setInCar(false);
            break;
          case "toast":
            toast(e.text, e.kind || "info");
            if (e.kind === "warn") audio.deny();
            break;
          case "wanted":
            audio.wanted(true);
            toast(`★ Wanted level ${e.to}${e.reason ? ` — ${e.reason}` : ""}`, "bad");
            break;
          case "wantedLost":
            audio.wanted(false);
            showBanner("LOST THEM", "Wanted level cleared", "win", 2000);
            break;
          case "roadblock":
            toast("Roadblock ahead!", "bad");
            break;
          case "busted":
          case "wasted":
            audio.busted();
            releaseLock();
            if (!sim.run) setTimeout(() => {
              setEnding({ kind: e.type, penalty: e.penalty, where: e.type === "busted" ? "the Downtown Police Station" : "St. Marisol Hospital" });
              setOverlay("ending");
            }, 1800);
            break;
          case "respawned":
            toast(`You wake up at ${e.where}`, "info");
            break;
          case "dialog":
            setDialog({ ...sim.dialog });
            break;
          case "dialogEnd":
            setDialog(null);
            break;
          case "say":
            setSay({ text: e.text, id: e.id });
            setTimeout(() => setSay((s) => (s && s.id === e.id ? null : s)), 2600);
            break;
          case "service":
            releaseLock();
            if (e.id === "garage") setOverlay("garage");
            else setOverlay(e.id);
            audio.ui();
            break;
          case "offer": {
            const o = e.offer;
            releaseLock();
            if (o.kind === "mission") setBrief({ def: missionById(o.id), activity: false });
            else setBrief({ def: ACTIVITIES.find((a) => a.id === o.id), activity: true });
            setOverlay("brief");
            audio.ui();
            break;
          }
          case "landmark":
            audio.checkpoint();
            showBanner("LANDMARK DISCOVERED", `${e.landmark.name} · +$100 · +75 XP`, "obj", 2600);
            if (e.levelUp) setTimeout(() => showBanner(`LEVEL ${e.levelUp}!`, repTitle(progRef.current.rep), "level", 2600), 2700);
            commit();
            break;
          case "district":
            showBanner("DISTRICT UNLOCKED", DISTRICTS[e.district].name, "obj", 2600);
            break;
          case "found":
          case "interacted":
            audio.objective();
            if (e.label) toast(e.label, "good");
            break;
          case "paid":
            audio.purchase();
            toast(`+${fmtMoney(e.amount)} ${e.label || ""}`, "good");
            break;
          case "board":
            toast("Passenger on board", "good");
            break;
          case "targetStopped":
            showBanner("TARGET STOPPED", "", "win", 1600);
            break;
          case "rivals":
            toast("Dash's crew is on your tail!", "bad");
            break;
          case "carjack":
            toast("Carjacked!", "warn");
            break;
          case "locked":
            break;
          case "redLight":
            break;
          case "copOut":
            toast("Police on foot — run!", "bad");
            break;
          case "runEnd":
            break;
          default:
        }
      }
    },
    [commit, releaseLock, setOverlay, showBanner, toast],
  );

  /* ------------------------------------------------------------ input → sim */
  const buildInput = useCallback((sim, dt) => {
    const k = keys.current;
    const T = touchRef.current;
    const c = cam.current;
    let f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let r = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    if (T.on && (T.jx || T.jy)) {
      r = T.jx;
      f = -T.jy;
    }
    const E = edges.current;
    edges.current = {};
    const driving = sim.player.mode === "car";
    // keyboard steering ramps in / centres quickly
    ctl.current.steer = damp(ctl.current.steer, r, r === 0 ? 22 : 16, dt);
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    const rx = Math.cos(c.yaw);
    const rz = -Math.sin(c.yaw);
    let mx = fx * f + rx * r;
    let mz = fz * f + rz * r;
    const n = Math.hypot(mx, mz);
    if (n > 1) {
      mx /= n;
      mz /= n;
    }
    const space = k.has("Space") || T.jump;
    return {
      mx: driving ? 0 : mx,
      mz: driving ? 0 : mz,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight") || T.sprint,
      jump: !driving && !!E.jump,
      interact: !!E.interact,
      action: !!E.action,
      throttle: driving ? f : 0,
      steer: driving ? (T.on ? r : ctl.current.steer) : 0,
      handbrake: driving && space,
      horn: driving && k.has("KeyH"),
      punch: !driving && !!E.punch,
      heavy: !driving && !!E.heavy,
      kick: !driving && !!E.kick,
    };
  }, []);

  /* ------------------------------------------------------------ HUD writer */
  const writeHud = useCallback((sim) => {
    const H = hud.current;
    const L = H.last || (H.last = {});
    const set = (key, v) => {
      if (L[key] !== v && H[key]) {
        L[key] = v;
        H[key].textContent = v;
      }
    };
    const show = (key, on) => {
      if (H[key] && L[key + ":v"] !== on) {
        L[key + ":v"] = on;
        H[key].style.display = on ? "" : "none";
      }
    };
    const bar = (key, fr) => {
      if (H[key]) H[key].style.transform = `scaleX(${clamp(fr, 0, 1).toFixed(3)})`;
    };
    const P = progRef.current;
    const pl = sim.player;
    set("money", fmtMoney(P.money));
    const hh = Math.floor(sim.clock);
    const mm = Math.floor((sim.clock - hh) * 60);
    set("clock", `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
    bar("hpBar", pl.hp / 100);
    if (H.hpWrap) H.hpWrap.dataset.low = pl.hp < 30 ? "1" : "0";
    // wanted
    const W = sim.police.wanted;
    for (let i = 0; i < 5; i++) {
      const s = H[`star${i}`];
      if (!s) continue;
      const on = i < W;
      const st = on ? (sim.police.seen ? "on" : "flash") : "off";
      if (s.dataset.s !== st) s.dataset.s = st;
    }
    show("evadeWrap", W > 0 && !sim.police.seen);
    if (W > 0) bar("evade", sim.police.evadeT / sim.police.evadeMax);
    show("bustWrap", sim.police.bustT > 0.05);
    bar("bust", sim.police.bustT / 3);
    // vehicle
    const car = pl.mode === "car" ? pl.car : null;
    show("carWrap", !!car);
    if (car) {
      const kmh = Math.abs(car.vf) * 3.6;
      const mph = P.settings.units === "mph";
      set("speed", `${Math.round(mph ? kmh * 0.621 : kmh)}`);
      set("units", mph ? "mph" : "km/h");
      set("carName", VEHICLE[car.type].name + (car.vf < -0.5 ? " · R" : ""));
      bar("carHp", car.hp / car.st.hp);
      if (H.carHpWrap) H.carHpWrap.dataset.low = car.hp / car.st.hp < 0.3 ? "1" : "0";
    }
    // objective
    const run = sim.run;
    show("objWrap", !!run && !run.result);
    if (run && !run.result) {
      set("objTitle", run.kind === "mission" ? `M${run.def.id} · ${run.def.title}` : run.def.name);
      const st = run.stage;
      const mk = run.marker();
      let text = run.needMain() ? mk?.label || "" : st?.text || "";
      if (st && st.type === "race" && run.st?.count <= 0) text = `${st.text} — position ${run.st.pos || 1}/${(run.racers?.length || 0) + 1}`;
      set("objText", text);
      const tm = run.timer();
      set("objTimer", tm != null ? fmtTime(tm) : "");
      if (H.objTimer) H.objTimer.dataset.low = tm != null && tm < 15 ? "1" : "0";
      let progTxt = "";
      if (st && (st.type === "checkpoints" || st.type === "race") && run.st?.pts) progTxt = `Checkpoint ${Math.min(run.st.k + 1, run.st.pts.length)}/${run.st.pts.length}`;
      if (st && st.type === "visit") progTxt = `${run.st.done.filter(Boolean).length}/${run.st.pts.length} delivered`;
      if (st && st.type === "collect") progTxt = `${run.st.items.filter((i) => i.done).length}/${run.st.items.length}`;
      if (st && st.type === "chase") progTxt = `Target damage ${Math.round((1 - Math.max(0, run.st.v.hp) / run.st.v.st.hp) * 100)}%`;
      if (run.cargoKey && run.vehicles[run.cargoKey] && run.def.fail?.cargo) {
        const v = run.vehicles[run.cargoKey];
        progTxt += `${progTxt ? " · " : ""}Cargo ${Math.max(0, Math.round(100 - ((run.cargoHp - v.hp) / v.st.hp / run.def.fail.cargo) * 100))}%`;
      }
      if (run.earned) progTxt += `${progTxt ? " · " : ""}Earned ${fmtMoney(run.earned)}`;
      set("objProg", progTxt);
    }
    // prompt
    const pr = sim.prompt;
    show("prompt", !!pr && !sim.dialog);
    if (pr) {
      set("promptKey", pr.key);
      set("promptText", pr.text);
      if (H.prompt) H.prompt.dataset.warn = pr.warn ? "1" : "0";
    }
    // hint line
    H.hintT = (H.hintT || 0) - 0.066;
    show("hint", P.settings.hints && H.hintT > 0 && !!H.hintMsg);
    if (H.hintMsg) set("hintText", H.hintMsg);
    // district
    const F = sim.focus();
    const dist = DISTRICTS[sim.city.districtAt(F.x, F.z)].name;
    set("district", dist);
    // (H.district is the HUD element; the last area shown is tracked separately)
    if (H.areaName !== dist) {
      // shown once on arrival (also when a session starts), in the corner
      showArea(dist);
      H.areaName = dist;
    }
    const li = levelInfo(P.xp);
    set("level", `LV ${li.level}`);
    bar("xpBar", li.frac);
  }, [showArea, showBanner]);

  /* ------------------------------------------------------------ frame */
  const frameRef = useRef(null);
  const timers = useRef({ hud: 0, acc: 0, mini: 0 });
  frameRef.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    dt = Math.min(dt, 0.1);
    const sim = simRef.current;
    const P = progRef.current;
    if (screenRef.current !== "play" || !sim) {
      const ms = menuSimRef.current;
      if (ms) {
        ms.step(Math.min(dt, 1 / 30), {});
        world.render(ms, { menu: MENU_FOCUS }, dt, P.settings);
      }
      return;
    }
    const ov = overlayRef.current;
    const active = (lockedRef.current || touchRef.current.on) && !ov;
    const T = timers.current;
    const stepping = active || (sim.ending && !ov);
    // every event of every physics step this frame (the renderer reads them for effects)
    sim.frameEvents = [];
    if (stepping) {
      T.acc += dt;
      let n = 0;
      while (T.acc >= STEP && n < 5) {
        T.acc -= STEP;
        n++;
        const bot = TEST && window.__vsBot ? window.__vsBot(sim) : null;
        sim.step(STEP, active ? bot || buildInput(sim, STEP) : {});
        for (const e of sim.events) sim.frameEvents.push(e);
        handleEvents(sim);
        if (sim.run?.result && !sim.run.applied && !hud.current.finishing) {
          hud.current.finishing = true;
          setTimeout(() => {
            hud.current.finishing = false;
            finishRun();
          }, 1300);
        }
      }
      if (n === 5) T.acc = 0;
    }
    // test bot drives the camera too
    if (TEST && window.__vsBot && sim.player.mode === "foot") {
      const want = sim.player.h + Math.PI;
      cam.current.yaw += Math.atan2(Math.sin(want - cam.current.yaw), Math.cos(want - cam.current.yaw)) * Math.min(1, dt * 3);
    }
    // draw between the last two physics steps: smooth motion at any frame rate
    world.render(sim, cam.current, dt, P.settings, stepping ? T.acc / STEP : 1);
    {
      // Club Neon's music: loud inside, a muffled thump within ~90 m
      const F = sim.focus();
      const CL = sim.city.club;
      let club = { level: 0, inside: false };
      if (CL && !sim.ambient) {
        const inside = sim.inClub(F.x, F.z);
        const d = Math.hypot(F.x - (CL.x0 + CL.x1) / 2, F.z - (CL.z0 + CL.z1) / 2);
        club = { inside, level: inside ? 1 : Math.max(0, 1 - Math.max(0, d - 26) / 65) };
      }
      audio.update(sim, dt, { paused: !!ov, club });
    }
    // GPS route ~1 Hz to the mission marker or the map waypoint
    const G = gps.current;
    G.t -= dt;
    if (G.t <= 0) {
      G.t = 1;
      const mk = sim.run && !sim.run.result ? sim.run.marker() : null;
      const dest = mk || G.waypoint;
      if (dest) {
        const F = sim.focus();
        const h = sim.player.mode === "car" && sim.player.car ? sim.player.car.h : sim.player.h;
        if (Math.hypot(dest.x - F.x, dest.z - F.z) < 12) G.route = null;
        else G.route = planRoute(sim.city, F.x, F.z, h, dest.x, dest.z, { blocked: (e) => sim.edgeBlocked(e) }).pts;
        G.marker = mk;
        if (G.waypoint && !mk && Math.hypot(G.waypoint.x - F.x, G.waypoint.z - F.z) < 15) {
          G.waypoint = null;
          toast("Waypoint reached", "good");
        }
      } else {
        G.route = null;
        G.marker = null;
      }
    }
    T.mini -= dt;
    const mc = miniRef.current;
    if (mc && T.mini <= 0) {
      T.mini = 0.05;
      const route = G.route ? [{ x: sim.focus().x, z: sim.focus().z }, ...G.route] : null;
      drawMinimap(mc.getContext("2d"), mc.width, mc.height, sim, cam.current.yaw, route, { marker: G.marker, waypoint: G.waypoint, zoom: (sim.player.mode === "car" ? 0.9 : 1.3) * (mc.width / 180) });
    }
    if (ov === "map" && mapRef.current) {
      const m = mapRef.current;
      const route = G.route ? [{ x: sim.focus().x, z: sim.focus().z }, ...G.route] : null;
      hud.current.mapXf = drawMap(m.getContext("2d"), m.width, m.height, sim, route, G.waypoint, G.marker);
    }
    T.hud -= dt;
    if (T.hud <= 0) {
      T.hud = 0.066;
      writeHud(sim);
    }
    // autosave in free roam
    if (!sim.run && !ov) {
      hud.current.saveT = (hud.current.saveT || 8) - dt;
      if (hud.current.saveT <= 0 || sim.dirty) {
        hud.current.saveT = 8;
        saveNow();
      }
    }
  };
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const dt = (t - last) / 1000;
      last = t;
      if (TEST && window.__vsHold) return;
      try {
        frameRef.current(dt);
      } catch (err) {
        console.error("[ViceStreets3D] " + (err && err.stack ? err.stack : err));
      }
    };
    raf = requestAnimationFrame(loop);
    const vis = () => {
      if (document.hidden && screenRef.current === "play" && !overlayRef.current) {
        releaseLock();
        setOverlay("pause");
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [releaseLock, setOverlay]);

  /* ------------------------------------------------------------ keyboard / mouse */
  const closeOverlay = useCallback(() => {
    const sim = simRef.current;
    setOverlay(null);
    if (sim) sim.player.cool = 0.3;
    requestLock();
  }, [requestLock, setOverlay]);
  useEffect(() => {
    const root = rootRef.current;
    const playing = () => screenRef.current === "play" && simRef.current;
    const toggle = (name) => {
      const ov = overlayRef.current;
      if (ov === name) closeOverlay();
      else if (!ov || ov === "map" || ov === "profile" || ov === "missions") {
        releaseLock();
        setOverlay(name);
      }
    };
    const kd = (e) => {
      if (!playing()) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      const ov = overlayRef.current;
      const sim = simRef.current;
      if (e.code === "Tab") return toggle("profile");
      if (e.code === "KeyM") return toggle("map");
      if (e.code === "KeyJ") return toggle("missions");
      if (e.code === "Escape" && ov && ov !== "pause" && ov !== "result" && ov !== "ending" && ov !== "brief") {
        if (ov === "settings") setOverlay("pause");
        else closeOverlay();
        return;
      }
      if (ov) return;
      if (e.repeat) return;
      keys.current.add(e.code);
      if (e.code === "KeyE") edges.current.interact = true;
      if (e.code === "KeyF") edges.current.action = true;
      if (e.code === "KeyQ") edges.current.kick = true;
      if (e.code === "Space") edges.current.jump = true;
      if (e.code === "KeyC" && sim.player.mode === "car") cam.current.near = !cam.current.near;
    };
    const ku = (e) => {
      keys.current.delete(e.code);
      if (playing() && GAME_KEYS.has(e.code)) e.preventDefault();
    };
    const mm = (e) => {
      if (!lockedRef.current || !playing() || overlayRef.current) return;
      const S = progRef.current.settings;
      const k = 0.0022 * S.sensitivity;
      cam.current.yaw -= e.movementX * k;
      cam.current.pitch = clamp(cam.current.pitch + e.movementY * k * (S.invertY ? -1 : 1), -0.3, 1.2);
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) cam.current.freeT = 1.6;
    };
    const md = (e) => {
      if (!playing() || overlayRef.current) return;
      if (!lockedRef.current) {
        requestLock();
        return;
      }
      const sim = simRef.current;
      if (sim?.dialog && e.button === 0) sim.advanceDialog();
      else if (sim && sim.player.mode === "foot") {
        // left = punch (click again for combos), right = heavy punch
        if (e.button === 0) edges.current.punch = true;
        if (e.button === 2) edges.current.heavy = true;
      }
      e.preventDefault();
    };
    const ctx = (e) => {
      if (playing()) e.preventDefault();
    };
    const wheel = (e) => {
      if (playing() && !overlayRef.current) {
        e.preventDefault();
        const S = progRef.current.settings;
        S.camDist = clamp(S.camDist + Math.sign(e.deltaY) * 0.05, 0.7, 1.5);
      }
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    document.addEventListener("mousemove", mm);
    root.addEventListener("mousedown", md);
    root.addEventListener("contextmenu", ctx);
    root.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", mm);
      root.removeEventListener("mousedown", md);
      root.removeEventListener("contextmenu", ctx);
      root.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", blur);
    };
  }, [closeOverlay, releaseLock, requestLock, setOverlay]);

  /* ------------------------------------------------------------ touch */
  const onTouchStart = useCallback((e) => {
    const T = touchRef.current;
    if (!T.on || screenRef.current !== "play" || overlayRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest(".vs-tbtn")) continue;
      if (t.clientX - r.left < r.width * 0.42 && T.joyId == null) {
        T.joyId = t.identifier;
        T.jx0 = t.clientX;
        T.jy0 = t.clientY;
        T.jx = T.jy = 0;
      } else if (T.lookId == null) {
        T.lookId = t.identifier;
        T.lx = t.clientX;
        T.ly = t.clientY;
      }
    }
  }, []);
  const onTouchMove = useCallback((e) => {
    const T = touchRef.current;
    if (!T.on) return;
    for (const t of e.changedTouches) {
      if (t.identifier === T.joyId) {
        const dx = (t.clientX - T.jx0) / 50;
        const dy = (t.clientY - T.jy0) / 50;
        const n = Math.hypot(dx, dy);
        T.jx = n > 1 ? dx / n : dx;
        T.jy = n > 1 ? dy / n : dy;
      } else if (t.identifier === T.lookId) {
        cam.current.yaw -= (t.clientX - T.lx) * 0.006;
        cam.current.pitch = clamp(cam.current.pitch + (t.clientY - T.ly) * 0.005, -0.3, 1.2);
        cam.current.freeT = 1.6;
        T.lx = t.clientX;
        T.ly = t.clientY;
      }
    }
  }, []);
  const onTouchEnd = useCallback((e) => {
    const T = touchRef.current;
    for (const t of e.changedTouches) {
      if (t.identifier === T.joyId) {
        T.joyId = null;
        T.jx = T.jy = 0;
      }
      if (t.identifier === T.lookId) T.lookId = null;
    }
  }, []);
  const tb = (name, down) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const T = touchRef.current;
    if (name === "jump") {
      T.jump = down;
      if (down) edges.current.jump = true;
    } else if (name === "sprint") {
      if (down) T.sprint = !T.sprint;
    } else if (name === "map" && down) {
      setOverlay(overlayRef.current === "map" ? null : "map");
    } else if (name === "pause" && down) setOverlay("pause");
    else if (down) edges.current[name] = true;
  };

  /* ------------------------------------------------------------ test hooks (dev only) */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__vs = {
      sim: () => simRef.current,
      world: () => worldRef.current,
      cam: cam.current,
      keys: keys.current,
      edges,
      startSession,
      toMenu,
      finishRun,
      continueFree,
      retry,
      setOverlay,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      prog: () => progRef.current,
      commit,
      frame: (dt = 1 / 60) => frameRef.current(dt),
      fit: () => hud.current.fit && hud.current.fit(),
    };
    return () => {
      delete window.__vs;
    };
  }, [commit, continueFree, finishRun, retry, setOverlay, startSession, toMenu]);

  /* ------------------------------------------------------------ menu actions */
  const onPlay = () => {
    audio.unlock();
    audio.ui();
    const m = nextMission(progRef.current);
    if (m && missionState(progRef.current, m) === "open") {
      setBrief({ def: m, activity: false, fromMenu: true });
      setScreen("brief");
    } else startSession({ free: true });
  };
  const onBriefStart = () => {
    const b = brief;
    audio.ui();
    if (b.activity) {
      const sim = simRef.current;
      if (!sim) return;
      sim.startActivity(b.def.id);
      sim.offers = [];
      sessionRef.current = { activity: b.def.id };
      setOverlay(null);
      showBanner(b.def.name.toUpperCase(), "", "start", 2000);
      requestLock();
    } else startSession({ mission: b.def.id });
    setBrief(null);
  };
  const onBriefCancel = () => {
    setBrief(null);
    if (screenRef.current === "brief") setScreen("menu");
    else closeOverlay();
  };

  /* ------------------------------------------------------------ shops */
  const shopResult = (r) => {
    setMsg(r.msg);
    if (r.ok) {
      audio.purchase();
      commit();
      simRef.current?.refreshOwned();
    } else audio.deny();
    return r;
  };
  const onGarageAct = (kind, a, b) => {
    const P = progRef.current;
    const sim = simRef.current;
    let r;
    if (kind === "upgrade") r = upgradeCar(P, a, b);
    else if (kind === "paint") r = paintCar(P, a, b);
    else if (kind === "repair") r = repairCar(P, a);
    else if (kind === "garageUp") r = buyGarageUp(P, a);
    else if (kind === "sell") {
      if (sim && sim.player.car?.garageId === a) r = { ok: false, msg: "Get out of it before selling" };
      else {
        r = sellVehicle(P, a);
        if (r.ok && sim) for (const v of [...sim.vehicles]) if (v.garageId === a) sim.removeVehicle(v);
      }
    } else if (kind === "active") {
      r = setActive(P, a);
      if (r.ok && sim && overlayRef.current === "garage" && !(sim.player.car && sim.player.car.garageId)) {
        sim.spawnOwned({ ...sim.city.places.garageSpawn });
        r.msg = "Active vehicle set — it's waiting on the lot";
      }
    }
    shopResult(r);
  };
  const onBuyCar = (type) => {
    const r = buyVehicle(progRef.current, type);
    shopResult(r);
    const sim = simRef.current;
    if (r.ok && sim && !(sim.player.car && sim.player.car.garageId)) {
      sim.spawnOwned({ ...sim.city.places.dealerSpawn });
      setMsg(`${r.msg} It's parked outside the showroom.`);
    }
  };
  const onBuyOutfit = (id) => {
    const r = buyOutfit(progRef.current, id);
    shopResult(r);
    const sim = simRef.current;
    if (r.ok && sim) {
      sim.player.look = playerLook(id);
      sim.player.outfit = id;
    }
  };
  const onEat = (price, hp) => {
    const P = progRef.current;
    const sim = simRef.current;
    if (P.money < price) return shopResult({ ok: false, msg: "Not enough money" });
    addMoney(P, -price);
    if (sim) sim.player.hp = Math.min(100, sim.player.hp + hp);
    shopResult({ ok: true, msg: "Delicious! Health restored." });
  };
  const onSettings = (s) => {
    const P = progRef.current;
    P.settings = s;
    commit();
    if (s.quality !== quality) setQuality(s.quality);
  };
  const onMapClick = (e) => {
    const xf = hud.current.mapXf;
    const c = mapRef.current;
    if (!xf || !c) return;
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const w = xf.toWorld((e.clientX - r.left) * k, (e.clientY - r.top) * k);
    const G = gps.current;
    if (G.waypoint && Math.hypot(G.waypoint.x - w.x, G.waypoint.z - w.z) < 20) G.waypoint = null;
    else G.waypoint = w;
    G.t = 0;
    audio.ui();
  };
  const gpsTo = (def) => {
    const sim = simRef.current;
    if (!sim) return;
    const at = def.start ? sim.resolve(def.start.at) : sim.city.places[def.place];
    gps.current.waypoint = { x: at.x, z: at.z };
    gps.current.t = 0;
    toast(`GPS set: ${def.title || def.name}`, "good");
    closeOverlay();
  };

  /* ------------------------------------------------------------ render */
  const sim = simRef.current;
  const playing = screen === "play";
  const R = (k) => (el) => (hud.current[k] = el);
  return (
    <div className={`vs ${touch ? "touch" : ""}`} ref={rootRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="vs-canvas-host" ref={canvasHost} />
      {hud.current.noGL && <div className="vs-nogl">WebGL is not available in this browser.</div>}

      {playing && (
        <div className="vs-hud">
          <div className="vs-top-right">
            <div className="vs-money" ref={R("money")} />
            <div className="vs-stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} ref={R(`star${i}`)} data-s="off">
                  ★
                </span>
              ))}
            </div>
            <div className="vs-evade" ref={R("evadeWrap")} style={{ display: "none" }}>
              <small>EVADING</small>
              <span className="vs-meter">
                <i ref={R("evade")} />
              </span>
            </div>
            <div className="vs-clock">
              <span ref={R("clock")} /> · <span ref={R("district")} />
            </div>
          </div>
          <div className="vs-obj" ref={R("objWrap")} style={{ display: "none" }}>
            <div className="t" ref={R("objTitle")} />
            <div className="x" ref={R("objText")} />
            <div className="row">
              <span className="p" ref={R("objProg")} />
              <span className="vs-tm" ref={R("objTimer")} />
            </div>
          </div>
          <div className="vs-hint" ref={R("hint")} style={{ display: "none" }}>
            <span ref={R("hintText")} />
          </div>
          <div className="vs-bottom-left">
            <canvas className="vs-mini" ref={miniRef} />
            <div className="vs-bars">
              <div className="vs-lvl">
                <b ref={R("level")} />
                <span className="vs-meter xp">
                  <i ref={R("xpBar")} />
                </span>
              </div>
              <div className="vs-hp" ref={R("hpWrap")}>
                <span className="vs-meter hp">
                  <i ref={R("hpBar")} />
                </span>
              </div>
            </div>
          </div>
          <div className="vs-car" ref={R("carWrap")} style={{ display: "none" }}>
            <div className="spd">
              <b ref={R("speed")} />
              <small ref={R("units")} />
            </div>
            <div className="nm" ref={R("carName")} />
            <div className="vs-hp car" ref={R("carHpWrap")}>
              <span className="vs-meter hp">
                <i ref={R("carHp")} />
              </span>
            </div>
          </div>
          <div className="vs-prompt" ref={R("prompt")} style={{ display: "none" }}>
            <kbd ref={R("promptKey")} />
            <span ref={R("promptText")} />
          </div>
          <div className="vs-bust" ref={R("bustWrap")} style={{ display: "none" }}>
            <small>BEING ARRESTED — MOVE!</small>
            <span className="vs-meter">
              <i ref={R("bust")} />
            </span>
          </div>
          {say && (
            <div className="vs-say">
              <span>“{say.text}”</span>
            </div>
          )}
          <Dialog d={dialog} onNext={() => simRef.current?.advanceDialog()} />
          <div className="vs-toasts">
            {toasts.map((t) => (
              <div key={t.id} className={`vs-toast ${t.kind}`}>
                {t.text}
              </div>
            ))}
          </div>
          {area && (
            <div key={area.id} className="vs-area">
              {area.name}
            </div>
          )}
          {banner && (
            <div key={banner.id} className={`vs-banner ${banner.kind}`}>
              <b>{banner.title}</b>
              {banner.sub && <small>{banner.sub}</small>}
            </div>
          )}
          {!locked && !overlay && !touch && (
            <div className="vs-click">
              <div>
                <b>Click to play</b>
                <small>Esc pauses · M map · J missions · Tab profile</small>
              </div>
            </div>
          )}
          {touch && !overlay && (
            <div className="vs-touch">
              <div className="vs-tpad">
                <button type="button" className="vs-tbtn" onTouchStart={tb("interact", true)}>
                  E
                </button>
                <button type="button" className="vs-tbtn" onTouchStart={tb("action", true)}>
                  F
                </button>
                <button type="button" className="vs-tbtn big" onTouchStart={tb("jump", true)} onTouchEnd={tb("jump", false)}>
                  {inCar ? "HB" : "⤒"}
                </button>
                <button type="button" className="vs-tbtn" onTouchStart={tb("sprint", true)}>
                  ⚡
                </button>
                {!inCar && (
                  <>
                    <button type="button" className="vs-tbtn" aria-label="Punch" onTouchStart={tb("punch", true)}>
                      👊
                    </button>
                    <button type="button" className="vs-tbtn" aria-label="Heavy punch" onTouchStart={tb("heavy", true)}>
                      💥
                    </button>
                    <button type="button" className="vs-tbtn" aria-label="Kick" onTouchStart={tb("kick", true)}>
                      🦵
                    </button>
                  </>
                )}
                <button type="button" className="vs-tbtn" onTouchStart={tb("map", true)}>
                  M
                </button>
                <button type="button" className="vs-tbtn" onTouchStart={tb("pause", true)}>
                  ❚❚
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------- menu screens -------- */}
      {screen === "menu" && <MainMenu prog={prog} next={nextMission(prog)} onPlay={onPlay} onContinue={() => startSession({ free: true })} onFree={() => startSession({ free: true })} onMissions={() => setScreen("missions")} onGarage={() => setScreen("garage")} onHow={() => setScreen("how")} onSettings={() => setScreen("settings")} />}
      {screen === "missions" && (
        <div className="vs-screen">
          <MissionList prog={prog} onBack={() => setScreen("menu")} onPick={(m) => (setBrief({ def: m, activity: false, fromMenu: true }), setScreen("brief"))} />
        </div>
      )}
      {screen === "brief" && brief && (
        <div className="vs-screen">
          <Briefing def={brief.def} activity={brief.activity} prog={prog} onStart={onBriefStart} onCancel={onBriefCancel} />
        </div>
      )}
      {screen === "garage" && (
        <div className="vs-screen">
          <Garage prog={prog} onAct={onGarageAct} onClose={() => setScreen("menu")} msg={msg} here={false} />
        </div>
      )}
      {screen === "how" && (
        <div className="vs-screen">
          <HowTo onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "settings" && (
        <div className="vs-screen">
          <Settings s={prog.settings} onChange={onSettings} onBack={() => setScreen("menu")} />
        </div>
      )}

      {/* -------- in-game overlays -------- */}
      {playing && overlay && (
        <div className={`vs-overlay vs-ov-${overlay}`}>
          {overlay === "pause" && (
            <Pause
              saved={saved}
              onResume={closeOverlay}
              onSave={() => {
                saveNow();
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
                audio.purchase();
              }}
              onSettings={() => {
                setSettingsFrom("pause");
                setOverlay("settings");
              }}
              onMenu={toMenu}
            />
          )}
          {overlay === "settings" && <Settings s={prog.settings} onChange={onSettings} onBack={() => setOverlay(settingsFrom || "pause")} />}
          {overlay === "map" && (
            <div className="vs-mapwrap">
              <canvas ref={mapRef} className="vs-map" onClick={onMapClick} />
              <div className="vs-legend">
                <b>City Map</b> · click to set / clear a GPS waypoint · M to close
                <span>
                  <i style={{ color: "#ff5fa8" }}>M</i> mission <i style={{ color: "#5fb8ff" }}>●</i> side job <i style={{ color: "#ffd23f" }}>●</i> objective <i style={{ color: "#ffb347" }}>🔧</i> garage <i style={{ color: "#7dd3ff" }}>🚗</i> dealer <i>☕</i> café <i>👕</i> clothes <i style={{ color: "#ff5a5a" }}>✚</i> hospital <i style={{ color: "#6ea8ff" }}>★</i> police
                </span>
              </div>
            </div>
          )}
          {overlay === "profile" && <Profile prog={prog} onClose={closeOverlay} />}
          {overlay === "missions" && <MissionList prog={prog} inGame onBack={closeOverlay} onPick={(m) => (setBrief({ def: m, activity: false }), setOverlay("brief"))} onGps={gpsTo} />}
          {overlay === "brief" && brief && <Briefing def={brief.def} activity={brief.activity} prog={prog} onStart={onBriefStart} onCancel={onBriefCancel} />}
          {overlay === "garage" && <Garage prog={prog} onAct={onGarageAct} onClose={closeOverlay} msg={msg} here />}
          {overlay === "dealer" && <Dealer prog={prog} onBuy={onBuyCar} onClose={closeOverlay} msg={msg} />}
          {overlay === "clothes" && <Clothes prog={prog} onBuy={onBuyOutfit} onClose={closeOverlay} msg={msg} />}
          {overlay === "cafe" && <Cafe prog={prog} hp={sim ? sim.player.hp : 100} onEat={onEat} onClose={closeOverlay} msg={msg} />}
          {overlay === "result" && result && <Result res={result} onRetry={retry} onContinue={continueFree} onMenu={toMenu} />}
          {overlay === "ending" && ending && <Ending {...ending} onContinue={continueFree} />}
        </div>
      )}
      {!playing && screen !== "menu" && <div className="vs-logo-corner"><Logo small /></div>}
    </div>
  );
}
