/**
 * Tank Warfare 3D — 3D tank combat for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the Sim (sim.js) at a
 * fixed 1/60 s and draws it with plain Three.js (world.js); the crosshair,
 * markers and minimap are canvases redrawn every frame (hud.js) and the numeric
 * HUD is written straight to DOM refs ~12×/s, so driving never re-renders React.
 * React only renders menus, the garage, briefings, pause and results.
 *
 * Screens: menu | missions | survival | training | garage | how | settings | play
 * Progress (credits, unlocks, upgrades, settings) persists under
 * `tank-warfare-3d-progress` (progress.js); a run in progress never does.
 *
 * Game Center integration:
 *   restartSignal  Restart → restarts the active mission/run (menus: main menu)
 *   muted          Mute → master gain to zero for every game sound
 *   Fullscreen is GamePlayer's; the canvases follow the stage via ResizeObserver.
 * Pointer lock is released on pause, results, menus, tab hide and unmount; all
 * listeners, the rAF loop, audio and GPU resources are cleaned up on unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./TankWarfare3D.css";
import { Sim } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { drawHud, drawMinimap } from "./hud.js";
import { loadProgress, saveProgress, applyResult, buyTank, buyUpgrade, sanitize, freshProgress } from "./progress.js";
import { MISSIONS, WORLDS, TANKS, AMMO, AMMO_ORDER, TRAINING, missionById } from "./data.js";
import { MainMenu, MissionSelect, SurvivalSelect, TrainingBrief, Garage, HowTo, SettingsPanel, Briefing, PauseMenu, Results } from "./screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("twtest");
const NOSAVE = TEST && PARAMS.has("nosave");
const STEP = 1 / 60;
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyR", "Digit1", "Digit2", "Digit3", "ShiftLeft", "ShiftRight", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const CAM_ORDER = ["chase", "gunner", "cinematic"];
const CAM_NAME = { chase: "Chase camera", gunner: "Gunner sight", cinematic: "Cinematic camera" };
const COMP_NAME = { tracks: "Tracks damaged", turret: "Turret drive damaged", engine: "Engine damaged" };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const storage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};
const isTouch = () => typeof window !== "undefined" && (PARAMS.has("twtouch") || (window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches));

/* ================================================================== component */
export default function TankWarfare3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const hudRef = useRef(null);
  const mapRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const runRef = useRef(null); // {mode, mission, world}
  const screenRef = useRef("menu");
  const lockedRef = useRef(false);
  const pausedRef = useRef(false);
  const briefRef = useRef(false);
  const keys = useRef(new Set());
  const mouse = useRef({ fire: false, zoom: false });
  const edges = useRef({ ammo: null, repair: false, cam: false });
  const cam = useRef({ mode: "chase", yaw: 0, pitch: -0.1, zoom: false, shake: true });
  const hits = useRef([]);
  const hud = useRef({});
  const touchRef = useRef({ on: isTouch(), jx: 0, jy: 0, joyId: null, lookId: null, lx: 0, ly: 0, fire: false, boost: false });
  const progRef = useRef(null);
  if (!progRef.current) progRef.current = storage() ? loadProgress(storage()) : freshProgress();

  const [screen, setScreenState] = useState("menu");
  const [prog, setProgState] = useState(progRef.current);
  const [world, setWorld] = useState(() => missionById(Math.min(progRef.current.unlocked, 15)).world);
  const [missionSel, setMissionSel] = useState(() => Math.min(progRef.current.unlocked, 15));
  const [survWorld, setSurvWorld] = useState("desert");
  const [garageSel, setGarageSel] = useState(progRef.current.tank);
  const [locked, setLocked] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [brief, setBriefState] = useState(null);
  const [result, setResult] = useState(null);
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [flash, setFlash] = useState(0);
  const [camMode, setCamMode] = useState("chase");
  const [touch] = useState(touchRef.current.on);
  const [runKey, setRunKey] = useState(0);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setPaused = useCallback((v) => {
    pausedRef.current = v;
    setPausedState(v);
  }, []);
  const setBrief = useCallback((b) => {
    briefRef.current = !!b;
    setBriefState(b);
  }, []);
  const setProg = useCallback((p) => {
    progRef.current = p;
    setProgState(p);
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
      /* not allowed right now — the pause overlay stays up */
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
        mouse.current.fire = false;
        mouse.current.zoom = false;
        cam.current.zoom = false;
        if (screenRef.current === "play" && !simRef.current?.result && !briefRef.current) setPaused(true);
      } else setPaused(false);
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setPaused]);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const toast = useCallback((text, kind = "info") => {
    const id = ++fid.current;
    setFeed((f) => [...f.slice(-4), { id, text, kind }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 3200);
  }, []);
  const showBanner = useCallback((title, sub = "", kind = "info", ms = 3000) => {
    const id = ++fid.current;
    setBanner({ id, title, sub, kind });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);

  /* ------------------------------------------------------------ runs */
  const startRun = useCallback((run) => {
    audio.unlock();
    audio.ui();
    const p = progRef.current;
    const tank = p.tanks[p.tank] ? p.tank : "fox";
    const sim = new Sim({ mode: run.mode, mission: run.mission, world: run.world, tank, up: p.up[tank], difficulty: p.settings.difficulty, seed: (Date.now() % 1e9) | 0 });
    simRef.current = sim;
    runRef.current = run;
    const c = cam.current;
    c.yaw = sim.player.heading;
    c.pitch = -0.1;
    c.zoom = false;
    c.mode = p.settings.camera || "chase";
    c.shake = p.settings.shake;
    setCamMode(c.mode);
    worldRef.current?.resetCamera();
    keys.current.clear();
    mouse.current.fire = false;
    mouse.current.zoom = false;
    hits.current = [];
    hud.current.last = {};
    setResult(null);
    setFeed([]);
    setBanner(null);
    setPaused(false);
    setRunKey((k) => k + 1);
    setScreen("play");
    if (run.mode === "campaign") {
      const def = missionById(run.mission);
      setMissionSel(def.id);
      setWorld(def.world);
      setBrief({ title: `${def.id}. ${def.title}`, sub: `${WORLDS[def.world].name} · Mission ${def.id} of 15`, text: def.brief, objectives: def.stages.map((s) => s.label) });
    } else if (run.mode === "survival") {
      setBrief({ title: "Survival", sub: WORLDS[run.world].name, text: "Hold out against endless waves of enemy armour. Waves grow larger and tougher — every fifth wave brings a Warlord.", objectives: null });
    } else {
      setBrief({ title: "Training Range", sub: WORLDS.desert.name, text: "Work through the drills at your own pace. Targets don't shoot back.", objectives: TRAINING.tasks.map((t) => t.label) });
    }
    releaseLock();
  }, [releaseLock, setBrief, setPaused, setScreen]);

  const deploy = useCallback(() => {
    audio.unlock();
    setBrief(null);
    requestLock();
    const sim = simRef.current;
    if (sim && sim.stage) showBanner(sim.mode === "survival" ? "SURVIVAL" : sim.stage.def.label || "", sim.mode === "campaign" ? sim.def.title : "", "start");
  }, [requestLock, setBrief, showBanner]);

  const finishRun = useCallback(() => {
    const sim = simRef.current;
    if (!sim?.result) return;
    const r = sim.result;
    const before = progRef.current;
    const out = applyResult(before, r);
    setProg(out.prog);
    const notices = [];
    if (out.newMission) notices.push(`Mission ${out.newMission} unlocked: ${missionById(out.newMission).title}`);
    for (const id of out.newTanks) notices.push(`${TANKS[id].name} is now available in the Garage`);
    if (r.mode === "survival" && out.prog.survivalBest > before.survivalBest) notices.push(`New survival record: ${out.prog.survivalBest} waves`);
    const subtitle = r.mode === "campaign" ? `${sim.def.id}. ${sim.def.title}` : r.mode === "survival" ? WORLDS[sim.world].name : "Training Range";
    setResult({ ...r, reward: out.reward, notices, subtitle, waves: out.reward.waves ?? Math.max(0, r.wave - 1) });
    releaseLock();
    audio.silence();
  }, [releaseLock, setProg]);

  const toMenu = useCallback((s = "menu") => {
    releaseLock();
    simRef.current = null;
    runRef.current = null;
    audio.silence();
    setPaused(false);
    setBrief(null);
    setResult(null);
    setScreen(s);
  }, [releaseLock, setBrief, setPaused, setScreen]);

  const restartRun = useCallback(() => {
    if (runRef.current) startRun(runRef.current);
  }, [startRun]);

  // GamePlayer Restart → restart the active run (menus: back to the main menu)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play" && runRef.current) startRun(runRef.current);
    else toMenu("menu");
  }, [restartSignal, startRun, toMenu]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => audio.setVolume(prog.settings.volume), [prog.settings.volume]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ sim events → audio / UI */
  const handleEvents = useCallback((sim) => {
    const p = sim.player;
    const dist = (x, z) => Math.hypot(x - p.x, z - p.z);
    for (const e of sim.events.splice(0)) {
      switch (e.type) {
        case "fire":
          if (e.tank === p) audio.cannon(0, p.L.barrel / 4.6);
          else audio.cannon(dist(e.x, e.z), 0.8);
          break;
        case "impact":
          if (e.ammo === "ap" || e.kind === "water") audio.impact(e.kind, dist(e.x, e.z));
          break;
        case "tankHit":
          if (e.byPlayer && e.kind === "shell") {
            audio.hitConfirm();
            hud.current.hitMark = performance.now();
          }
          break;
        case "structHit":
          if (e.byPlayer) hud.current.hitMark = performance.now();
          break;
        case "ricochet":
          audio.ricochet(dist(e.x, e.z));
          if (e.byPlayer) toast("Ricochet!", "warn");
          else if (e.target === p) toast("Ricochet — your armour held", "good");
          break;
        case "kill":
          if (e.target === p) break;
          if (e.byPlayer) toast(`${e.target.name} destroyed`, "kill");
          else if (e.target.side === "ally") toast(`${e.target.name} lost`, "bad");
          break;
        case "playerHit":
          audio.playerHit(e.dmg);
          hits.current.push({ ang: e.ang, t: sim.t });
          if (hits.current.length > 8) hits.current.shift();
          setFlash((f) => f + 1);
          if (worldRef.current && cam.current.shake) worldRef.current.addShake(Math.min(1, 0.25 + e.dmg / 30));
          break;
        case "component":
          if (e.target === p) {
            toast(`${COMP_NAME[e.comp]}! Press R to repair`, "bad");
            audio.warn();
          } else if (e.byPlayer) toast(`Enemy ${e.comp === "tracks" ? "tracks" : e.comp === "turret" ? "turret" : "engine"} hit`, "good");
          break;
        case "reloaded":
          audio.reloaded();
          break;
        case "ammoSwitch":
          audio.ammoSwitch();
          if (e.auto) toast(`Out of ammo — loading ${AMMO[e.ammo].name}`, "warn");
          break;
        case "empty":
          audio.empty();
          toast(`${AMMO[e.ammo].name} depleted`, "bad");
          break;
        case "repair":
          audio.repair();
          toast(`Repaired +${Math.round(e.amount)} HP · ${e.kits} kit${e.kits === 1 ? "" : "s"} left`, "good");
          break;
        case "repairDenied":
          audio.empty();
          toast(e.reason, "warn");
          break;
        case "fieldRepair":
          toast(`Field repairs +${e.amount} HP · shells resupplied`, "good");
          break;
        case "critical":
          audio.warn();
          showBanner("CRITICAL DAMAGE", "Repair (R) or pull back to cover", "fail", 2200);
          break;
        case "stage":
          audio.stage();
          if (sim.t > 0.5) showBanner("NEW OBJECTIVE", e.label, "obj");
          break;
        case "objective":
          audio.objective();
          toast(`Objective complete: ${e.label}`, "good");
          break;
        case "wave":
          audio.warn();
          showBanner(`WAVE ${e.n}`, sim.mode === "survival" ? `${sim.enemiesAlive()} enemies incoming` : "Enemy reinforcements", "fail", 2400);
          break;
        case "waveClear":
          audio.objective();
          toast(`Wave ${e.n} cleared · +${e.heal} HP · resupplied`, "good");
          break;
        case "ambush":
          audio.warn();
          showBanner("AMBUSH!", "Protect the convoy", "fail", 2200);
          break;
        case "convoyHalt":
          toast("Convoy halted — enemies nearby", "warn");
          break;
        case "convoyArrived":
          toast("A convoy truck reached the lumber yard", "good");
          break;
        case "escaped":
          toast(`A supply truck escaped! (${e.n})`, "bad");
          break;
        case "bossPhase":
          audio.warn();
          showBanner(`${e.name.toUpperCase()} IS ENRAGED`, "Reinforcements inbound", "fail", 2600);
          break;
        case "structDestroyed":
          if (!e.struct.friendly) toast(`${e.struct.name} destroyed`, "kill");
          break;
        case "gate":
          audio.objective();
          toast(`Gate ${e.n}/${e.of}`, "good");
          break;
        case "smoke":
          audio.smoke();
          break;
        case "destruct":
          audio.destruct(dist(e.ob.x, e.ob.z));
          break;
        case "crash":
          if (e.tank === p) audio.crash();
          break;
        case "spotted":
          if (e.target.boss) toast(`${e.target.name} spotted`, "bad");
          break;
        case "complete":
          audio.victory();
          showBanner(sim.mode === "training" ? "TRAINING COMPLETE" : "MISSION COMPLETE", "", "win", 3200);
          break;
        case "failed":
          audio.defeat();
          showBanner(sim.mode === "survival" ? "TANK DESTROYED" : "MISSION FAILED", e.reason, "fail", 3200);
          break;
        default:
      }
    }
    // explosions → sound by distance (read the fx queue before the renderer drains it)
    for (const f of sim.fx) {
      if (f.type === "explosion" || f.type === "bigExplosion" || f.type === "tankDestroyed") audio.explosion(dist(f.x, f.z), f.type === "explosion" ? 0.8 : 1.2);
    }
  }, [showBanner, toast]);

  /* ------------------------------------------------------------ HUD writer (~12 Hz) */
  const writeHud = useCallback((sim) => {
    const h = hud.current;
    const L = h.last || (h.last = {});
    const set = (k, val) => {
      if (L[k] !== val && h[k]) {
        L[k] = val;
        h[k].textContent = val;
      }
    };
    const attr = (k, a, val) => {
      if (h[k] && h[k].dataset[a] !== val) h[k].dataset[a] = val;
    };
    const p = sim.player;
    const hpF = Math.max(0, p.hp / p.maxHp);
    if (h.hpBar) h.hpBar.style.transform = `scaleX(${hpF.toFixed(3)})`;
    attr("hpWrap", "lvl", hpF < 0.3 ? "crit" : hpF < 0.55 ? "low" : "ok");
    set("hp", `${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`);
    set("armor", `${Math.round(p.st.armor.front * 100)}%`);
    for (const k of ["tracks", "turret", "engine"]) attr("c_" + k, "state", p.comp[k] > 0 ? "bad" : "ok");
    set("kits", String(p.kits));
    if (h.boost) h.boost.style.transform = `scaleX(${p.boost.toFixed(3)})`;
    attr("boostWrap", "on", p.boosting ? "1" : "0");
    set("speed", `${Math.round(Math.abs(p.speed) * 3.6)}`);
    for (const a of AMMO_ORDER) {
      set("ammo_" + a, String(p.ammo[a]));
      attr("slot_" + a, "sel", p.loaded === a ? "1" : "0");
      attr("slot_" + a, "empty", p.ammo[a] <= 0 ? "1" : "0");
    }
    const rf = p.reloadMax ? 1 - p.reload / p.reloadMax : 1;
    if (h.reload) h.reload.style.transform = `scaleX(${(p.reload > 0 ? rf : 1).toFixed(3)})`;
    set("reloadTxt", p.reload > 0 ? `Reloading ${AMMO[p.loaded].short} · ${p.reload.toFixed(1)}s` : `${AMMO[p.loaded].name} ready`);
    attr("reloadWrap", "ready", p.reload > 0 ? "0" : "1");
    const ob = sim.objective();
    if (ob) {
      set("objLabel", ob.label);
      set("objProg", ob.prog || "");
      set("objStep", ob.step || (sim.mode === "survival" ? `Wave ${sim.wave}` : ""));
      if (h.objBar) h.objBar.style.transform = `scaleX(${Math.min(1, ob.frac || 0).toFixed(3)})`;
      if (h.dangerWrap) {
        const on = ob.danger != null;
        h.dangerWrap.style.display = on ? "" : "none";
        if (on) {
          h.danger.style.transform = `scaleX(${Math.min(1, Math.max(0, ob.danger)).toFixed(3)})`;
          set("dangerTxt", ob.dangerLabel || "");
        }
      }
    }
    set("time", fmtTime(sim.t));
    set("kills", String(sim.stats.kills));
    set("enemies", String(sim.enemiesAlive()));
    attr("root", "dmg", hpF < 0.3 ? "crit" : hpF < 0.55 ? "low" : "0");
    attr("root", "smoke", sim.inSmoke(p.x, p.y + 2, p.z) ? "1" : "0");
  }, []);

  /* ------------------------------------------------------------ frame */
  const frameRef = useRef(null);
  const timers = useRef({ hud: 0, acc: 0, t: 0 });
  const garageDrag = useRef(0);
  frameRef.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    dt = Math.min(dt, 0.1);
    timers.current.t += dt;
    const s = screenRef.current;
    const sim = simRef.current;
    const P = progRef.current;
    if (s === "garage") {
      const d = garageDrag.current;
      garageDrag.current = 0;
      world.renderGarage(dt, { look: garageSelRef.current, drag: d, locked: !P.tanks[garageSelRef.current] });
      return;
    }
    if (s !== "play" || !sim) {
      const m = missionById(missionSelRef.current);
      const w = s === "missions" ? worldTabRef.current : s === "survival" ? survWorldRef.current : s === "training" ? "desert" : m.world;
      const focus = s === "missions" && m.world === w ? m.start : null;
      world.renderMenu(dt, { world: w, look: P.tank, focus });
      return;
    }
    const c = cam.current;
    const active = (lockedRef.current || touchRef.current.on) && !pausedRef.current && !briefRef.current;
    world.updateCamera(sim, c, dt);
    let pred = null;
    if (active || sim.result) {
      const aim = world.aimPoint(sim);
      timers.current.acc += dt;
      let n = 0;
      while (timers.current.acc >= STEP && n < 5) {
        timers.current.acc -= STEP;
        n++;
        sim.step(active && !sim.result ? buildInput(sim, aim) : {}, STEP);
        handleEvents(sim);
      }
      if (n === 5) timers.current.acc = 0;
      h_aim.current = aim;
    }
    world.render(sim, dt, { cam: c });
    if (sim.player.alive) pred = sim.predictImpact(sim.player);
    // target info: what the shell would hit, else what the crosshair is on
    const aimRef = h_aim.current?.ref;
    let target = pred && (pred.kind === "tank" || pred.kind === "struct") ? pred.ref : null;
    if (!target && aimRef && (aimRef.L || aimRef.maxHp) && aimRef.alive !== false && aimRef.side !== "player") target = aimRef;
    if (target && target.side === "enemy" && !target.spotted && target.hidden) target = null;
    const hc = hudRef.current;
    if (hc) {
      drawHud(hc.getContext("2d"), sim, world, { w: world.size.w, h: world.size.h, dpr: hc.width / Math.max(1, world.size.w), cam: c, fov: world.camera.fov, pred, target, hits: hits.current, time: sim.t, targeting: !!sim.player.st.targeting });
    }
    const mc = mapRef.current;
    if (mc) {
      const sz = mc.clientWidth || 170;
      drawMinimap(mc.getContext("2d"), sim, world.minimapFor(sim.world), { size: sz, dpr: mc.width / Math.max(1, sz), yaw: c.yaw });
    }
    timers.current.hud -= dt;
    if (timers.current.hud <= 0) {
      timers.current.hud = 0.08;
      writeHud(sim);
    }
    const p = sim.player;
    audio.step({ active: p.alive && active && !sim.result, throttle: lastThrottle.current, speed: p.speed, maxSpeed: p.st.maxSpeed, boost: p.boosting, turret: p.turretMoving, crit: p.alive && p.hp / p.maxHp < 0.3, dt });
    if (sim.result && !resultShownRef.current && sim.endT > 2.6) {
      resultShownRef.current = true;
      finishRun();
    }
  };
  const h_aim = useRef(null);
  const lastThrottle = useRef(0);
  const resultShownRef = useRef(false);
  useEffect(() => {
    resultShownRef.current = false;
  }, [runKey]);
  // refs mirroring menu selections for the frame loop
  const garageSelRef = useRef(garageSel);
  garageSelRef.current = garageSel;
  const missionSelRef = useRef(missionSel);
  missionSelRef.current = missionSel;
  const worldTabRef = useRef(world);
  worldTabRef.current = world;
  const survWorldRef = useRef(survWorld);
  survWorldRef.current = survWorld;

  function buildInput(sim, aim) {
    const K = keys.current;
    const T = touchRef.current;
    const E = edges.current;
    let throttle = (K.has("KeyW") || K.has("ArrowUp") ? 1 : 0) - (K.has("KeyS") || K.has("ArrowDown") ? 1 : 0);
    let steer = (K.has("KeyD") || K.has("ArrowRight") ? 1 : 0) - (K.has("KeyA") || K.has("ArrowLeft") ? 1 : 0);
    if (T.on && (T.jx || T.jy)) {
      throttle = Math.abs(T.jy) > 0.18 ? T.jy : 0;
      steer = Math.abs(T.jx) > 0.18 ? T.jx : 0;
    }
    lastThrottle.current = throttle;
    const inp = {
      throttle,
      steer,
      boost: K.has("ShiftLeft") || K.has("ShiftRight") || T.boost,
      aim,
      fire: mouse.current.fire || T.fire,
      ammo: E.ammo,
      repair: E.repair,
    };
    E.ammo = null;
    E.repair = false;
    return inp;
  }

  /* ------------------------------------------------------------ world lifecycle */
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.className = "tw-canvas";
    canvas.setAttribute("aria-hidden", "true");
    rootRef.current.prepend(canvas);
    const world = createWorld(canvas, { quality: progRef.current.settings.quality, preserve: TEST });
    worldRef.current = world;
    const fit = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      world.resize(r.width, r.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const hc = hudRef.current;
      if (hc) {
        hc.width = Math.round(r.width * dpr);
        hc.height = Math.round(r.height * dpr);
      }
      const mc = mapRef.current;
      if (mc) {
        mc.width = Math.round(mc.clientWidth * dpr);
        mc.height = Math.round(mc.clientHeight * dpr);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rootRef.current);
    let raf = 0;
    let lastT = 0;
    const loop = (now) => {
      const dt = lastT ? (now - lastT) / 1000 : 0;
      lastT = now;
      try {
        frameRef.current(dt);
      } catch (err) {
        console.error("[TankWarfare3D] frame error", err);
      }
      raf = requestAnimationFrame(loop);
    };
    if (TEST) {
      window.__tw = {
        world,
        sim: () => simRef.current,
        fit,
        keys: keys.current,
        mouse: mouse.current,
        edges: edges.current,
        cam: cam.current,
        progress: () => progRef.current,
        advance(frames = 1, dt = STEP) {
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
      if (TEST) delete window.__tw;
    };
  }, []);

  // refit HUD canvases whenever the play screen (re)mounts them
  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = rootRef.current?.getBoundingClientRect();
    const hc = hudRef.current;
    if (hc && r) {
      hc.width = Math.round(r.width * dpr);
      hc.height = Math.round(r.height * dpr);
    }
    const mc = mapRef.current;
    if (mc) {
      mc.width = Math.round(mc.clientWidth * dpr);
      mc.height = Math.round(mc.clientHeight * dpr);
    }
  }, [screen, runKey]);

  useEffect(() => {
    worldRef.current?.setQuality(prog.settings.quality);
  }, [prog.settings.quality]);

  // leaving the tab mid-run pauses it
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && screenRef.current === "play" && !simRef.current?.result && !TEST) {
        releaseLock();
        if (!briefRef.current) setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [releaseLock, setPaused]);

  /* ------------------------------------------------------------ keyboard / mouse */
  const input = useRef({});
  const cycleCam = useCallback(() => {
    const c = cam.current;
    c.mode = CAM_ORDER[(CAM_ORDER.indexOf(c.mode) + 1) % CAM_ORDER.length];
    setCamMode(c.mode);
    toast(CAM_NAME[c.mode], "info");
    const p = progRef.current;
    setProg({ ...p, settings: { ...p.settings, camera: c.mode } });
  }, [setProg, toast]);
  input.current.kd = (e) => {
    if (screenRef.current !== "play") return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (!lockedRef.current || pausedRef.current || briefRef.current) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    keys.current.add(e.code);
    if (e.repeat) return;
    audio.unlock();
    const E = edges.current;
    switch (e.code) {
      case "Digit1":
        E.ammo = "ap";
        break;
      case "Digit2":
        E.ammo = "he";
        break;
      case "Digit3":
        E.ammo = "smoke";
        break;
      case "KeyR":
        E.repair = true;
        break;
      case "KeyC":
        cycleCam();
        break;
      case "Escape":
        if (TEST) {
          releaseLock();
          setPaused(true);
        }
        break;
      default:
    }
  };
  input.current.ku = (e) => {
    keys.current.delete(e.code);
    if (screenRef.current === "play" && GAME_KEYS.has(e.code) && lockedRef.current) e.preventDefault();
  };
  input.current.mm = (e) => {
    if (screenRef.current === "garage" && e.buttons === 1) {
      garageDrag.current += (e.movementX || 0) * 0.008;
      return;
    }
    if (screenRef.current !== "play" || !lockedRef.current || pausedRef.current || briefRef.current) return;
    const st = progRef.current.settings;
    const c = cam.current;
    const zoomK = c.zoom ? (c.mode === "gunner" ? 0.28 : 0.5) : 1;
    const k = 0.0022 * st.sens * zoomK;
    c.yaw -= (e.movementX || 0) * k;
    const dy = (e.movementY || 0) * (st.invert ? -1 : 1);
    const lo = c.mode === "gunner" ? -0.32 : c.mode === "cinematic" ? -0.25 : -0.55;
    const hi = c.mode === "gunner" ? 0.32 : c.mode === "cinematic" ? 0.6 : 0.38;
    c.pitch = Math.max(lo, Math.min(hi, c.pitch - dy * k));
  };
  input.current.md = (e) => {
    if (screenRef.current !== "play" || !lockedRef.current || pausedRef.current || briefRef.current) return;
    audio.unlock();
    if (e.button === 0) mouse.current.fire = true;
    if (e.button === 2) {
      mouse.current.zoom = true;
      cam.current.zoom = true;
    }
  };
  input.current.mu = (e) => {
    if (e.button === 0) mouse.current.fire = false;
    if (e.button === 2) {
      mouse.current.zoom = false;
      cam.current.zoom = false;
    }
  };
  useEffect(() => {
    const kd = (e) => input.current.kd(e);
    const ku = (e) => input.current.ku(e);
    const mm = (e) => input.current.mm(e);
    const mu = (e) => input.current.mu(e);
    const blur = () => {
      keys.current.clear();
      mouse.current.fire = false;
      mouse.current.zoom = false;
      cam.current.zoom = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    document.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("blur", blur);
    // the mouse wheel must not scroll the Game Center page while driving
    const root = rootRef.current;
    const wheel = (e) => {
      if (screenRef.current === "play" && (lockedRef.current || touchRef.current.on)) e.preventDefault();
    };
    root?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      root?.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const onStageMouseDown = (e) => {
    if (screenRef.current !== "play" || touchRef.current.on) return;
    if (briefRef.current || pausedRef.current || simRef.current?.result) return;
    if (!lockedRef.current) {
      requestLock();
      return;
    }
    input.current.md(e);
  };

  const resume = useCallback(() => {
    audio.unlock();
    requestLock();
    if (TEST || touchRef.current.on) setPaused(false);
  }, [requestLock, setPaused]);
  const pauseTouch = () => {
    lockedRef.current = false;
    setLocked(false);
    setPaused(true);
  };

  /* ------------------------------------------------------------ touch controls */
  const onJoy = (e, phase) => {
    const T = touchRef.current;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    if (phase === "start") {
      T.joyId = e.pointerId;
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    }
    if (T.joyId !== e.pointerId) return;
    if (phase === "end") {
      T.joyId = null;
      T.jx = T.jy = 0;
      el.style.setProperty("--jx", "0px");
      el.style.setProperty("--jy", "0px");
      return;
    }
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.min(1, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    T.jx = Math.cos(a) * l;
    T.jy = -Math.sin(a) * l;
    el.style.setProperty("--jx", `${Math.cos(a) * l * r.width * 0.32}px`);
    el.style.setProperty("--jy", `${Math.sin(a) * l * r.height * 0.32}px`);
  };
  const onLook = (e, phase) => {
    const T = touchRef.current;
    if (phase === "start") {
      T.lookId = e.pointerId;
      T.lx = e.clientX;
      T.ly = e.clientY;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      return;
    }
    if (T.lookId !== e.pointerId) return;
    if (phase === "end") {
      T.lookId = null;
      return;
    }
    const dx = e.clientX - T.lx;
    const dy = e.clientY - T.ly;
    T.lx = e.clientX;
    T.ly = e.clientY;
    const c = cam.current;
    const k = 0.0045 * progRef.current.settings.sens * (c.zoom ? 0.45 : 1);
    c.yaw -= dx * k;
    c.pitch = Math.max(-0.5, Math.min(0.38, c.pitch - dy * k));
  };
  const tbtn = (name, on, off) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      audio.unlock();
      on();
    },
    onPointerUp: (e) => {
      e.preventDefault();
      off?.();
    },
    onPointerCancel: () => off?.(),
    onPointerLeave: () => off?.(),
    "aria-label": name,
  });

  /* ------------------------------------------------------------ menu actions */
  const changeSettings = useCallback((patch) => {
    const p = progRef.current;
    const next = sanitize({ ...p, settings: { ...p.settings, ...patch } });
    if (patch.shake !== undefined) cam.current.shake = patch.shake;
    setProg(next);
  }, [setProg]);
  const go = (s) => {
    audio.unlock();
    audio.ui();
    if (s === "garage") setGarageSel(progRef.current.tank);
    if (s === "missions") {
      const m = missionById(missionSel);
      setWorld(m.world);
    }
    setScreen(s);
  };

  useEffect(() => {
    if (!TEST || !window.__tw) return;
    Object.assign(window.__tw, { startRun, deploy, toMenu, setScreen, resume, finishRun, restartRun, screen, paused, locked, brief, result, requestLock, releaseLock, setProg, hud: hud.current, cycleCam, go, changeSettings, setGarageSel, setMissionSel, setWorld });
  });

  /* ------------------------------------------------------------ render */
  const playing = screen === "play";
  const ref = (k) => (el) => {
    hud.current[k] = el;
  };
  const sim = simRef.current;
  const showTouch = playing && touch && !brief && !paused && !result;
  return (
    <div
      ref={rootRef}
      className={`tw${playing ? " tw--play" : ""}${locked && !touch ? " tw--locked" : ""}${playing && camMode === "gunner" ? " tw--gunner" : ""}`}
      onMouseDown={onStageMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {playing && sim && (
        <>
          <canvas ref={hudRef} className="tw-hudcanvas" aria-hidden="true" />
          <div className="tw-hud" ref={ref("root")} data-dmg="0" data-smoke="0">
            <div key={"hit" + flash} className={flash ? "tw-hitflash" : ""} />
            <div className="tw-vignette" />
            <div className="tw-hud__obj">
              <div className="tw-hud__mtitle">
                <span className="tw-chiplet">{sim.mode === "campaign" ? `M${sim.def.id}` : sim.mode === "survival" ? "SURVIVAL" : "TRAINING"}</span>
                {sim.mode === "campaign" ? sim.def.title : sim.mode === "survival" ? WORLDS[sim.world].name : "Live-fire course"}
              </div>
              <div className="tw-hud__step" ref={ref("objStep")} />
              <div className="tw-hud__label" ref={ref("objLabel")} />
              <div className="tw-hud__row">
                <div className="tw-bar tw-bar--obj">
                  <i ref={ref("objBar")} />
                </div>
                <span ref={ref("objProg")} />
              </div>
              <div className="tw-hud__danger" ref={ref("dangerWrap")} style={{ display: "none" }}>
                <div className="tw-bar tw-bar--danger">
                  <i ref={ref("danger")} />
                </div>
                <span ref={ref("dangerTxt")} />
              </div>
            </div>
            <div className="tw-hud__map">
              <canvas ref={mapRef} className="tw-minimap" aria-label="Mini-map" />
              <div className="tw-hud__stats">
                <div>
                  <small>TIME</small>
                  <b ref={ref("time")}>0:00</b>
                </div>
                <div>
                  <small>KILLS</small>
                  <b ref={ref("kills")}>0</b>
                </div>
                <div>
                  <small>HOSTILE</small>
                  <b ref={ref("enemies")}>0</b>
                </div>
              </div>
            </div>
            <div className="tw-hud__tank">
              <div className="tw-hud__tname">
                {sim.player.name}
                <span className="tw-hud__cam">{CAM_NAME[camMode]}</span>
              </div>
              <div className="tw-hp" ref={ref("hpWrap")} data-lvl="ok">
                <div className="tw-hp__bar">
                  <i ref={ref("hpBar")} />
                </div>
                <b ref={ref("hp")}>100</b>
              </div>
              <div className="tw-hud__mods">
                <span className="tw-mod">
                  ARMOR <b ref={ref("armor")}>0%</b>
                </span>
                <span className="tw-mod" ref={ref("c_tracks")} data-state="ok">
                  TRK
                </span>
                <span className="tw-mod" ref={ref("c_turret")} data-state="ok">
                  TUR
                </span>
                <span className="tw-mod" ref={ref("c_engine")} data-state="ok">
                  ENG
                </span>
                <span className="tw-mod tw-mod--kit">
                  <kbd>R</kbd> KITS <b ref={ref("kits")}>0</b>
                </span>
              </div>
              <div className="tw-hud__drive">
                <span>
                  <b ref={ref("speed")}>0</b> km/h
                </span>
                <div className="tw-boost" ref={ref("boostWrap")} data-on="0">
                  <small>BOOST</small>
                  <div className="tw-bar">
                    <i ref={ref("boost")} />
                  </div>
                </div>
              </div>
            </div>
            <div className="tw-hud__ammo">
              <div className="tw-slots">
                {AMMO_ORDER.map((a) => (
                  <div key={a} className={`tw-slot tw-slot--${a}`} ref={ref("slot_" + a)} data-sel={a === "ap" ? "1" : "0"} data-empty="0">
                    <kbd>{AMMO[a].key}</kbd>
                    <span>{AMMO[a].short}</span>
                    <b ref={ref("ammo_" + a)}>0</b>
                  </div>
                ))}
              </div>
              <div className="tw-reload" ref={ref("reloadWrap")} data-ready="1">
                <div className="tw-bar">
                  <i ref={ref("reload")} />
                </div>
                <span ref={ref("reloadTxt")} />
              </div>
            </div>
            <div className="tw-feed" aria-live="polite">
              {feed.map((f) => (
                <div key={f.id} className={`tw-feed__item tw-feed__item--${f.kind}`}>
                  {f.text}
                </div>
              ))}
            </div>
            {banner && (
              <div key={"bn" + banner.id} className={`tw-banner tw-banner--${banner.kind}`}>
                <b>{banner.title}</b>
                {banner.sub && <span>{banner.sub}</span>}
              </div>
            )}
            {!locked && !touch && !paused && !brief && !result && <div className="tw-clickhint">Click to take control</div>}
          </div>
          {showTouch && (
            <div className="tw-touch">
              <div className="tw-touch__look" onPointerDown={(e) => onLook(e, "start")} onPointerMove={(e) => onLook(e, "move")} onPointerUp={(e) => onLook(e, "end")} onPointerCancel={(e) => onLook(e, "end")} />
              <div className="tw-touch__joy" onPointerDown={(e) => onJoy(e, "start")} onPointerMove={(e) => onJoy(e, "move")} onPointerUp={(e) => onJoy(e, "end")} onPointerCancel={(e) => onJoy(e, "end")}>
                <i />
              </div>
              <div className="tw-touch__btns">
                <button type="button" className="tw-tb tw-tb--fire" {...tbtn("Fire", () => (touchRef.current.fire = true), () => (touchRef.current.fire = false))}>
                  FIRE
                </button>
                <button type="button" className="tw-tb" {...tbtn("Zoom", () => (cam.current.zoom = !cam.current.zoom))}>
                  ZOOM
                </button>
                <button type="button" className="tw-tb" {...tbtn("Boost", () => (touchRef.current.boost = true), () => (touchRef.current.boost = false))}>
                  BOOST
                </button>
                <button type="button" className="tw-tb" {...tbtn("Repair", () => (edges.current.repair = true))}>
                  REPAIR
                </button>
                <button type="button" className="tw-tb" {...tbtn("Camera", () => cycleCam())}>
                  CAM
                </button>
                {AMMO_ORDER.map((a) => (
                  <button key={a} type="button" className="tw-tb tw-tb--ammo" {...tbtn(AMMO[a].name, () => (edges.current.ammo = a))}>
                    {AMMO[a].short}
                  </button>
                ))}
              </div>
              <button type="button" className="tw-tb tw-tb--pause" {...tbtn("Pause", pauseTouch)}>
                II
              </button>
            </div>
          )}
          {brief && <Briefing {...brief} touch={touch} onStart={deploy} />}
          {paused && !brief && !result && (
            <PauseMenu
              onResume={resume}
              onRestart={restartRun}
              onMenu={() => toMenu("menu")}
              settings={prog.settings}
              onSettings={changeSettings}
              muted={muted}
            />
          )}
          {result && (
            <Results
              r={result}
              hasNext={result.mode === "campaign" && result.mission < MISSIONS.length}
              onRetry={restartRun}
              onNext={() => startRun({ mode: "campaign", mission: result.mission + 1 })}
              onGarage={() => toMenu("garage")}
              onMenu={() => toMenu("menu")}
            />
          )}
        </>
      )}
      {screen === "menu" && (
        <MainMenu
          prog={prog}
          onNav={go}
          onPlay={() => startRun({ mode: "campaign", mission: Math.min(prog.unlocked, MISSIONS.length) })}
          onDifficulty={(d) => changeSettings({ difficulty: d })}
        />
      )}
      {screen === "missions" && (
        <MissionSelect
          prog={prog}
          world={world}
          onWorld={(w) => {
            audio.ui();
            setWorld(w);
            const first = MISSIONS.find((m) => m.world === w);
            const best = MISSIONS.filter((m) => m.world === w && m.id <= prog.unlocked).pop() || first;
            setMissionSel(best.id);
          }}
          selected={missionSel}
          onSelect={(id) => {
            audio.ui();
            setMissionSel(id);
          }}
          onDeploy={(id) => startRun({ mode: "campaign", mission: id })}
          onBack={() => go("menu")}
        />
      )}
      {screen === "survival" && <SurvivalSelect prog={prog} world={survWorld} onWorld={(w) => (audio.ui(), setSurvWorld(w))} onStart={() => startRun({ mode: "survival", world: survWorld })} onBack={() => go("menu")} />}
      {screen === "training" && <TrainingBrief prog={prog} onStart={() => startRun({ mode: "training" })} onBack={() => go("menu")} />}
      {screen === "garage" && (
        <Garage
          prog={prog}
          sel={garageSel}
          onSel={(id) => {
            audio.ui();
            setGarageSel(id);
          }}
          onBuyTank={(id) => {
            audio.objective();
            setProg(buyTank(progRef.current, id));
          }}
          onSelect={(id) => {
            audio.ui();
            setProg({ ...progRef.current, tank: id });
          }}
          onUpgrade={(id, k) => {
            audio.reloaded();
            setProg(buyUpgrade(progRef.current, id, k));
          }}
          onBack={() => go("menu")}
        />
      )}
      {screen === "how" && <HowTo onBack={() => go("menu")} />}
      {screen === "settings" && (
        <SettingsPanel
          settings={prog.settings}
          muted={muted}
          onChange={changeSettings}
          onBack={() => go("menu")}
          onReset={() => {
            const fresh = { ...freshProgress(), settings: progRef.current.settings };
            setProg(fresh);
            setMissionSel(1);
            setWorld("desert");
            setGarageSel("fox");
            setScreen("menu");
          }}
        />
      )}
    </div>
  );
}
