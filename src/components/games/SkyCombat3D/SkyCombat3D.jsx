/**
 * Sky Combat 3D — 3D aerial combat for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the Sim (sim.js) at a
 * fixed 1/60 s and draws it with plain Three.js (world.js); the HUD reticles
 * and radar are canvases redrawn every frame (hud.js) and the numeric HUD is
 * written straight to DOM refs ~12×/s, so flying never re-renders React.
 * React only renders menus, the hangar, briefings and results.
 *
 * Controls (shown in How to Play and the pause screen): W/S pitch down/up ·
 * A/D roll · Q/E yaw · Shift/Ctrl throttle · mouse aim (assisted steering) ·
 * LMB gun · RMB select/lock target · Space missile · B bomb · F flares ·
 * C camera · Esc pause. Pointer Lock is released on pause, results, menus and
 * unmount. `restartSignal` restarts the active mission; `muted` silences all audio.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./SkyCombat3D.css";
import { Sim } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { drawHud, drawRadar } from "./hud.js";
import { loadProgress, saveProgress, applyResult, upgradeCost, buyUpgrade, buyJet } from "./progress.js";
import { MISSIONS, WORLDS, WORLD_ORDER, JETS, JET_ORDER, UPGRADES, UPGRADE_ORDER, MAX_UPGRADE, jetStats, missionById } from "./data.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("sctest");
const NOSAVE = TEST && PARAMS.has("nosave");
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyB", "KeyF", "KeyC", "KeyR", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"]);
const STEP = 1 / 60;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const storage = () => (typeof localStorage !== "undefined" ? localStorage : null);

const CONTROLS = [
  ["Mouse", "Aim — the jet steers toward the circle"],
  ["W / S", "Pitch nose down / up"],
  ["A / D", "Roll left / right"],
  ["Q / E", "Yaw left / right"],
  ["Shift / Ctrl", "Throttle up / down"],
  ["Left mouse", "Machine gun"],
  ["Right mouse", "Select & lock target (press again: next)"],
  ["Space", "Launch missile"],
  ["B", "Drop bomb"],
  ["F", "Flares (countermeasures)"],
  ["C", "Switch camera (chase / cockpit)"],
  ["Esc", "Pause & release the mouse"],
];

/* ================================================================== component */
export default function SkyCombat3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const hudRef = useRef(null);
  const radarRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const screenRef = useRef("menu");
  const lockedRef = useRef(false);
  const pausedRef = useRef(false);
  const viewRef = useRef("chase");
  const keys = useRef(new Set());
  const mouse = useRef({ fire: false, yaw: 0, pitch: 0, stick: { pitch: 0, roll: 0 } });
  const edges = useRef({ missile: false, bomb: false, flare: false, lock: false });
  const aimV = useRef(new THREE.Vector3(0, 0, -1));
  const hud = useRef({});
  const progRef = useRef(null);
  if (!progRef.current) progRef.current = storage() ? loadProgress(storage()) : loadProgress({ getItem: () => null });

  const [screen, setScreenState] = useState("menu"); // menu | hangar | missions | how | play | result
  const [prog, setProgState] = useState(progRef.current);
  const [missionSel, setMissionSel] = useState(() => Math.min(progRef.current.unlocked, MISSIONS.length));
  const [worldTab, setWorldTab] = useState(() => missionById(Math.min(progRef.current.unlocked, MISSIONS.length)).world);
  const [hangarJet, setHangarJet] = useState(progRef.current.jet);
  const [locked, setLocked] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [view, setViewState] = useState(progRef.current.settings.view);
  const [result, setResult] = useState(null);
  const [radio, setRadio] = useState([]);
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [flash, setFlash] = useState(0);
  const [fromScreen, setFromScreen] = useState("menu");

  viewRef.current = view;
  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setPaused = useCallback((v) => {
    pausedRef.current = v;
    setPausedState(v);
  }, []);
  const setProg = useCallback((p) => {
    progRef.current = p;
    setProgState(p);
    if (!NOSAVE && storage()) saveProgress(storage(), p);
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
        mouse.current.fire = false;
        if (screenRef.current === "play" && !simRef.current?.result) setPaused(true);
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
  const say = useCallback((who, text) => {
    const id = ++fid.current;
    setRadio((r) => [...r.slice(-2), { id, who, text }]);
    setTimeout(() => setRadio((r) => r.filter((x) => x.id !== id)), 5200);
  }, []);
  const toast = useCallback((text, kind = "info") => {
    const id = ++fid.current;
    setFeed((f) => [...f.slice(-4), { id, text, kind }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 3200);
  }, []);
  const showBanner = useCallback((title, sub, kind = "info") => {
    const id = ++fid.current;
    setBanner({ id, title, sub, kind });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), 3200);
  }, []);

  /* ------------------------------------------------------------ mission flow */
  const startMission = useCallback((id) => {
    audio.unlock();
    audio.ui();
    const p = progRef.current;
    const jet = p.jets[p.jet] ? p.jet : "falcon";
    const sim = new Sim({ mission: id, jet, up: p.up, seed: (Date.now() % 1e9) | 0 });
    simRef.current = sim;
    const d = sim.player.dir;
    mouse.current.yaw = Math.atan2(d.x, -d.z);
    mouse.current.pitch = Math.asin(d.y);
    mouse.current.fire = false;
    mouse.current.stick = { pitch: 0, roll: 0 };
    keys.current.clear();
    setMissionSel(id);
    setResult(null);
    setRadio([]);
    setFeed([]);
    setConfirmQuit(false);
    setShowHelp(false);
    setPaused(false);
    setScreen("play");
    const def = missionById(id);
    showBanner(`MISSION ${id} · ${def.title.toUpperCase()}`, sim.stage?.def.label || "", "start");
    hud.current.last = {};
    requestLock();
  }, [requestLock, setPaused, setScreen, showBanner]);

  const finishMission = useCallback(() => {
    const sim = simRef.current;
    if (!sim?.result) return;
    const r = sim.result;
    const { prog: np, earned, firstClear, newJet } = applyResult(progRef.current, sim.def.id, r);
    setProg(np);
    setResult({ ...r, mission: sim.def.id, earned, firstClear, newJet, jet: sim.jetId });
    releaseLock();
    audio.silence();
    setScreen("result");
  }, [releaseLock, setProg, setScreen]);

  const toMenu = useCallback((s = "menu") => {
    releaseLock();
    simRef.current = null;
    audio.silence();
    setPaused(false);
    setConfirmQuit(false);
    setScreen(s);
  }, [releaseLock, setPaused, setScreen]);

  // GamePlayer Restart → restart the active mission (menus: back to the main menu)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const s = screenRef.current;
    if (s === "play" || s === "result") startMission(simRef.current?.def.id || result?.mission || missionSel);
    else toMenu("menu");
  }, [restartSignal, startMission, toMenu, missionSel, result]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ sim events → audio/UI */
  const handleEvents = useCallback((sim) => {
    const p = sim.player;
    for (const e of sim.events.splice(0)) {
      switch (e.type) {
        case "radio":
          audio.radio();
          say(e.who, e.text);
          break;
        case "stage":
          audio.objective();
          showBanner("NEW OBJECTIVE", e.label, "obj");
          break;
        case "objective":
          toast(`Objective complete: ${e.label}`, "good");
          break;
        case "gate":
          audio.gate();
          toast(`Gate ${e.n}/${e.of}`, "good");
          break;
        case "kill":
          if (e.byPlayer) toast(`${e.name} destroyed`, "kill");
          else if (e.side === "friend") toast(`${e.name} lost!`, "bad");
          break;
        case "hit":
          audio.hit(e.kind);
          setFlash((f) => f + 1);
          break;
        case "missile":
          audio.missile();
          break;
        case "bomb":
          audio.bomb();
          break;
        case "flare":
          audio.flare();
          break;
        case "decoyed":
          toast("Missile decoyed by flares", "good");
          break;
        case "missileEvaded":
          toast("Missile evaded", "good");
          break;
        case "missileLaunch":
          toast(`${e.name}: missile launch!`, "bad");
          break;
        case "locked":
          audio.locked();
          break;
        case "target":
          audio.target();
          break;
        case "noTarget":
          audio.denied();
          break;
        case "empty":
          audio.denied();
          toast(`${e.weapon === "gun" ? "Gun" : e.weapon === "missile" ? "Missiles" : e.weapon === "bomb" ? "Bombs" : "Flares"} empty — rearm over home base`, "bad");
          break;
        case "rearm":
          audio.rearm();
          toast("Rearmed and repaired", "good");
          break;
        case "detectWarn":
          toast("Above radar ceiling — get low!", "bad");
          break;
        case "torpedoHit":
          toast(`${e.name} hit by a torpedo!`, "bad");
          break;
        case "complete":
          audio.complete();
          showBanner("MISSION COMPLETE", missionById(sim.def.id).title, "win");
          break;
        case "failed":
          audio.failed();
          showBanner("MISSION FAILED", e.reason, "fail");
          break;
        default:
      }
    }
    // explosions → sound by distance (read the fx queue before the renderer drains it)
    for (const f of sim.fx) {
      if (/xplosion|airburst|bigSplash|splash/.test(f.type)) {
        const d = Math.hypot(f.x - p.pos.x, f.y - p.pos.y, f.z - p.pos.z);
        audio.explosion(f.s, d);
      }
    }
  }, [say, showBanner, toast]);

  /* ------------------------------------------------------------ HUD writer */
  const writeHud = useCallback((sim) => {
    const h = hud.current;
    const L = h.last || (h.last = {});
    const set = (k, val) => {
      if (L[k] !== val && h[k]) {
        L[k] = val;
        h[k].textContent = val;
      }
    };
    const p = sim.player;
    const S = sim.stats;
    const hpF = Math.max(0, p.hp / p.maxHp);
    if (h.hpBar) {
      h.hpBar.style.transform = `scaleX(${hpF.toFixed(3)})`;
      h.hpWrap.dataset.lvl = hpF < 0.25 ? "crit" : hpF < 0.5 ? "low" : "ok";
    }
    set("hp", String(Math.ceil(Math.max(0, p.hp))));
    set("spd", String(Math.round(p.speed * 3.6)));
    set("alt", String(Math.round(p.pos.y)));
    set("agl", `AGL ${Math.round(Math.max(0, p.agl ?? 0))}`);
    if (h.thr) h.thr.style.transform = `scaleY(${p.throttle.toFixed(3)})`;
    set("thrTxt", p.ab ? "AB" : `${Math.round(p.throttle * 100)}%`);
    if (h.thrWrap) h.thrWrap.dataset.ab = p.ab ? "1" : "0";
    set("gun", String(p.ammo.gun));
    set("msl", String(p.ammo.missiles));
    set("bmb", String(p.ammo.bombs));
    set("flr", String(p.ammo.flares));
    for (const [k, cd, max] of [["mslCd", p.cd.missile, 0.7], ["bmbCd", p.cd.bomb, 0.45], ["flrCd", p.cd.flare, 1.4]]) if (h[k]) h[k].style.transform = `scaleX(${(1 - cd / max).toFixed(2)})`;
    if (h.wMsl) h.wMsl.dataset.state = p.ammo.missiles <= 0 ? "empty" : p.lock.locked ? "locked" : "ready";
    if (h.wGun) h.wGun.dataset.state = p.ammo.gun <= 0 ? "empty" : p.firing ? "firing" : "ready";
    const bombSight = !!p.ccip && sim.ground.some((g) => g.alive && g.side === "enemy" && g.pos.distanceTo(p.pos) < 6000);
    if (h.wBmb) h.wBmb.dataset.state = p.ammo.bombs <= 0 ? "empty" : bombSight ? "locked" : "ready";
    if (h.wFlr) h.wFlr.dataset.state = p.ammo.flares <= 0 ? "empty" : p.flareActive > 0 ? "firing" : "ready";
    // objective
    const ob = sim.objective();
    if (ob) {
      set("objLabel", ob.label);
      let prog = "";
      let f = 0;
      if (ob.kind === "count") {
        prog = `${ob.done} / ${ob.need}`;
        f = ob.need ? ob.done / ob.need : 0;
      } else if (ob.kind === "time") {
        prog = `${fmtTime(Math.max(0, ob.need - ob.done))} left`;
        f = ob.done / ob.need;
      } else if (ob.kind === "dist") {
        prog = ob.dist >= 1000 ? `${(ob.dist / 1000).toFixed(1)} km` : `${Math.round(ob.dist)} m`;
        f = 0;
      }
      set("objProg", prog);
      if (h.objBar) h.objBar.style.transform = `scaleX(${Math.min(1, f).toFixed(3)})`;
      set("stage", `Objective ${Math.min(sim.stageIdx + 1, sim.def.stages.length)} / ${sim.def.stages.length}`);
    }
    set("time", fmtTime(sim.t));
    set("enemies", String(sim.enemyCount()));
    set("kills", String(sim.kills));
    // warnings
    const w = [];
    if (p.alive && !sim.result) {
      if (p.rwr === "missile") w.push(["MISSILE INCOMING — FLARES [F] / BREAK TURN", "crit"]);
      else if (p.rwr === "lock") w.push(["ENEMY LOCK", "warn"]);
      if (p.warn.pullUp) w.push(["PULL UP", "crit"]);
      if (p.stalled) w.push(["STALL — NOSE DOWN, THROTTLE UP", "crit"]);
      else if (p.warn.stall) w.push(["LOW SPEED", "warn"]);
      if (p.warn.boundary) w.push([`RETURN TO COMBAT ZONE ${Math.max(0, 12 - p.outT).toFixed(0)}`, "crit"]);
      if (p.warn.ceiling) w.push(["ALTITUDE LIMIT", "warn"]);
      if (hpF < 0.25) w.push(["CRITICAL DAMAGE", "crit"]);
      else if (hpF < 0.5) w.push(["AIRCRAFT DAMAGED", "warn"]);
      if (sim.detect > 0.02) w.push([`RADAR DETECTION ${Math.round(sim.detect * 100)}%`, sim.detect > 0.5 ? "crit" : "warn"]);
      if (p.rearmT > 0) w.push([`REARMING ${Math.ceil(3 - p.rearmT)}`, "info"]);
    }
    const key = w.map((x) => x.join(":")).join("|");
    if (L.warn !== key && h.warn) {
      L.warn = key;
      h.warn.replaceChildren(...w.map(([t, k]) => {
        const d = document.createElement("div");
        d.className = `sc-warn sc-warn--${k}`;
        d.textContent = t;
        return d;
      }));
    }
    if (h.root) h.root.dataset.dmg = hpF < 0.25 ? "crit" : hpF < 0.5 ? "low" : "0";
  }, []);

  /* ------------------------------------------------------------ frame */
  const frameRef = useRef(null);
  const timers = useRef({ hud: 0, acc: 0, t: 0 });
  frameRef.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    dt = Math.min(dt, 0.1);
    timers.current.t += dt;
    const s = screenRef.current;
    const sim = simRef.current;
    if (s !== "play" || !sim) {
      world.render(null, dt, { mode: s === "hangar" ? "hangar" : "menu", hangarJet });
      return;
    }
    const active = lockedRef.current && !pausedRef.current;
    if (active || sim.result) {
      // fixed-step simulation
      timers.current.acc += dt;
      let n = 0;
      while (timers.current.acc >= STEP && n < 4) {
        timers.current.acc -= STEP;
        n++;
        sim.step(active ? buildInput(sim) : {}, STEP);
        handleEvents(sim);
      }
      if (n === 4) timers.current.acc = 0;
    }
    const aim = viewRef.current === "cockpit" && !progRef.current.settings.assist ? null : aimV.current;
    world.render(sim, dt, { mode: "play", view: viewRef.current, aim, freeze: !active && !sim.result });
    // HUD canvas + radar every frame
    const hc = hudRef.current;
    if (hc) {
      const ctx = hc.getContext("2d");
      drawHud(ctx, sim, world, { w: world.size.w, h: world.size.h, scale: hc.width / Math.max(1, world.size.w), view: viewRef.current, aim: aimV.current, assist: progRef.current.settings.assist, time: timers.current.t });
    }
    const rc = radarRef.current;
    if (rc) drawRadar(rc.getContext("2d"), sim, { size: rc.clientWidth || 160, scale: rc.width / Math.max(1, rc.clientWidth || 160), time: timers.current.t });
    timers.current.hud -= dt;
    if (timers.current.hud <= 0) {
      timers.current.hud = 0.08;
      writeHud(sim);
    }
    const p = sim.player;
    audio.step({
      active: p.alive && active,
      throttle: p.throttle,
      speed: p.speed,
      ab: p.ab,
      firing: p.firing,
      lock: p.lock.locked ? "locked" : p.lock.t > 0 ? "locking" : "none",
      rwr: p.rwr,
      dt,
    });
    if (sim.result && sim.endT > (sim.result.win ? 3.2 : 2.8)) finishMission();
  };

  function buildInput(sim) {
    const K = keys.current;
    const m = mouse.current;
    const st = progRef.current.settings;
    const p = sim.player;
    const pitch = (K.has("KeyS") || K.has("ArrowDown") ? 1 : 0) - (K.has("KeyW") || K.has("ArrowUp") ? 1 : 0);
    const roll = (K.has("KeyD") || K.has("ArrowRight") ? 1 : 0) - (K.has("KeyA") || K.has("ArrowLeft") ? 1 : 0);
    const yaw = (K.has("KeyE") ? 1 : 0) - (K.has("KeyQ") ? 1 : 0);
    // keyboard flying: the aim point follows the nose so letting go holds course
    if (pitch || roll) {
      m.yaw = Math.atan2(p.dir.x, -p.dir.z);
      m.pitch = Math.asin(Math.max(-1, Math.min(1, p.dir.y)));
    }
    const cp = Math.cos(m.pitch);
    aimV.current.set(Math.sin(m.yaw) * cp, Math.sin(m.pitch), -Math.cos(m.yaw) * cp);
    const stick = m.stick;
    stick.pitch *= 0.86;
    stick.roll *= 0.86;
    const e = edges.current;
    const inp = {
      pitch, roll, yaw,
      thrUp: K.has("ShiftLeft") || K.has("ShiftRight"),
      thrDown: K.has("ControlLeft") || K.has("ControlRight"),
      aim: st.assist ? aimV.current : null,
      assist: st.assist,
      stick: st.assist ? null : { pitch: stick.pitch, roll: stick.roll },
      fire: m.fire,
      missile: e.missile,
      bomb: e.bomb,
      flare: e.flare,
      lock: e.lock,
    };
    e.missile = e.bomb = e.flare = e.lock = false;
    return inp;
  }

  /* ------------------------------------------------------------ world lifecycle */
  const hangarJetRef = useRef(hangarJet);
  hangarJetRef.current = hangarJet;
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.className = "sc-canvas";
    canvas.setAttribute("aria-hidden", "true");
    rootRef.current.prepend(canvas);
    const world = createWorld(canvas, { preserve: TEST });
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
      const rc = radarRef.current;
      if (rc) {
        rc.width = Math.round(rc.clientWidth * dpr);
        rc.height = Math.round(rc.clientHeight * dpr);
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
      frameRef.current(dt);
      raf = requestAnimationFrame(loop);
    };
    if (TEST) {
      window.__sc = {
        world,
        sim: () => simRef.current,
        fit,
        keys: keys.current,
        mouse: mouse.current,
        edges: edges.current,
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
      if (TEST) delete window.__sc;
    };
  }, []);

  // refit the radar canvas whenever it (re)appears
  useEffect(() => {
    const rc = radarRef.current;
    if (rc) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      rc.width = Math.round(rc.clientWidth * dpr);
      rc.height = Math.round(rc.clientHeight * dpr);
    }
  }, [screen]);

  // leaving the tab mid-mission pauses it
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && screenRef.current === "play" && !simRef.current?.result && !TEST) {
        releaseLock();
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [releaseLock, setPaused]);

  /* ------------------------------------------------------------ input */
  const input = useRef({});
  input.current.kd = (e) => {
    if (screenRef.current !== "play") return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (!lockedRef.current || pausedRef.current) {
      if (e.code === "Escape" && pausedRef.current && !TEST) return; // browser already released the lock
      return;
    }
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    keys.current.add(e.code);
    if (e.repeat) return;
    audio.unlock();
    const E = edges.current;
    switch (e.code) {
      case "Space":
        E.missile = true;
        break;
      case "KeyB":
        E.bomb = true;
        break;
      case "KeyF":
        E.flare = true;
        break;
      case "KeyR":
        E.lock = true;
        break;
      case "KeyC": {
        const v = viewRef.current === "chase" ? "cockpit" : "chase";
        viewRef.current = v;
        setViewState(v);
        setProg({ ...progRef.current, settings: { ...progRef.current.settings, view: v } });
        break;
      }
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
    if (screenRef.current !== "play" || !lockedRef.current || pausedRef.current) return;
    const st = progRef.current.settings;
    const m = mouse.current;
    const k = 0.0021 * st.sens;
    const dy = (e.movementY || 0) * (st.invert ? -1 : 1);
    if (st.assist) {
      m.yaw += (e.movementX || 0) * k;
      m.pitch = Math.max(-1.4, Math.min(1.4, m.pitch - dy * k));
    } else {
      m.stick.roll = Math.max(-1, Math.min(1, m.stick.roll + (e.movementX || 0) * 0.012 * st.sens));
      m.stick.pitch = Math.max(-1, Math.min(1, m.stick.pitch - dy * 0.012 * st.sens));
    }
  };
  input.current.md = (e) => {
    if (screenRef.current !== "play" || !lockedRef.current || pausedRef.current) return;
    audio.unlock();
    if (e.button === 0) mouse.current.fire = true;
    if (e.button === 2) edges.current.lock = true;
  };
  input.current.mu = (e) => {
    if (e.button === 0) mouse.current.fire = false;
  };
  useEffect(() => {
    const kd = (e) => input.current.kd(e);
    const ku = (e) => input.current.ku(e);
    const mm = (e) => input.current.mm(e);
    const mu = (e) => input.current.mu(e);
    const blur = () => {
      keys.current.clear();
      mouse.current.fire = false;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    document.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const onStageMouseDown = (e) => {
    if (screenRef.current !== "play") return;
    if (!lockedRef.current && !pausedRef.current && !simRef.current?.result) {
      requestLock();
      return;
    }
    input.current.md(e);
  };

  const resume = useCallback(() => {
    audio.unlock();
    setShowHelp(false);
    setConfirmQuit(false);
    requestLock();
    if (TEST) setPaused(false);
  }, [requestLock, setPaused]);

  const setSetting = (k, v) => setProg({ ...progRef.current, settings: { ...progRef.current.settings, [k]: v } });

  useEffect(() => {
    if (!TEST || !window.__sc) return;
    Object.assign(window.__sc, { startMission, toMenu, setScreen, resume, finishMission, screen, paused, locked, view, result, requestLock, releaseLock, setProg, hud: hud.current });
  });

  /* ------------------------------------------------------------ render */
  const playing = screen === "play";
  const ref = (k) => (el) => {
    hud.current[k] = el;
  };
  const go = (s) => {
    audio.unlock();
    audio.ui();
    setFromScreen(screenRef.current);
    setScreen(s);
  };

  return (
    <div
      ref={rootRef}
      className={`sc${playing ? " sc--play" : ""}${locked ? " sc--locked" : ""}${playing && view === "cockpit" ? " sc--cockpit" : ""}`}
      onMouseDown={onStageMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {playing && (
        <>
          <canvas ref={hudRef} className="sc-hudcanvas" aria-hidden="true" />
          <div className="sc-hud" ref={ref("root")} data-dmg="0">
            <div key={"hit" + flash} className={flash ? "sc-hitflash" : ""} />
            <div className="sc-vignette" />
            <div className="sc-hud__mission">
              <div className="sc-hud__mtitle">
                <span className="sc-chip">M{simRef.current?.def.id}</span>
                {simRef.current?.def.title}
              </div>
              <div className="sc-hud__stage" ref={ref("stage")} />
              <div className="sc-hud__obj" ref={ref("objLabel")} />
              <div className="sc-hud__objrow">
                <div className="sc-hud__objbar"><i ref={ref("objBar")} /></div>
                <span ref={ref("objProg")} />
              </div>
            </div>
            <div className="sc-hud__stats">
              <div><small>TIME</small><b ref={ref("time")}>0:00</b></div>
              <div><small>HOSTILES</small><b ref={ref("enemies")}>0</b></div>
              <div><small>KILLS</small><b ref={ref("kills")}>0</b></div>
            </div>
            <div className="sc-hud__warn" ref={ref("warn")} />
            <div className="sc-hud__radar">
              <canvas ref={radarRef} className="sc-radar" aria-label="Radar" />
            </div>
            <div className="sc-hud__flight">
              <div className="sc-gauge">
                <small>SPEED km/h</small>
                <b ref={ref("spd")}>0</b>
              </div>
              <div className="sc-gauge">
                <small>ALT m</small>
                <b ref={ref("alt")}>0</b>
                <em ref={ref("agl")} />
              </div>
              <div className="sc-thr" ref={ref("thrWrap")} data-ab="0">
                <div className="sc-thr__bar"><i ref={ref("thr")} /></div>
                <small>THR</small>
                <em ref={ref("thrTxt")}>0%</em>
              </div>
            </div>
            <div className="sc-hud__bottom">
              <div className="sc-hp" ref={ref("hpWrap")} data-lvl="ok">
                <span>HULL</span>
                <div className="sc-hp__bar"><i ref={ref("hpBar")} /></div>
                <b ref={ref("hp")}>100</b>
              </div>
              <div className="sc-weapons">
                <div className="sc-wpn" ref={ref("wGun")}><small>GUN · LMB</small><b ref={ref("gun")}>0</b></div>
                <div className="sc-wpn" ref={ref("wMsl")}><small>MISSILE · SPACE</small><b ref={ref("msl")}>0</b><i><u ref={ref("mslCd")} /></i></div>
                <div className="sc-wpn" ref={ref("wBmb")}><small>BOMB · B</small><b ref={ref("bmb")}>0</b><i><u ref={ref("bmbCd")} /></i></div>
                <div className="sc-wpn" ref={ref("wFlr")}><small>FLARE · F</small><b ref={ref("flr")}>0</b><i><u ref={ref("flrCd")} /></i></div>
              </div>
            </div>
            <div className="sc-radio">
              {radio.map((r) => (
                <div key={r.id} className="sc-radio__line"><b>{r.who}</b> {r.text}</div>
              ))}
            </div>
            <div className="sc-feed">
              {feed.map((f) => (
                <div key={f.id} className={`sc-feed__item sc-feed__item--${f.kind}`}>{f.text}</div>
              ))}
            </div>
            {banner && (
              <div key={"bn" + banner.id} className={`sc-banner sc-banner--${banner.kind}`}>
                <b>{banner.title}</b>
                {banner.sub && <span>{banner.sub}</span>}
              </div>
            )}
            <div className="sc-hud__hint">C camera · RMB lock · Esc pause</div>
          </div>
          {!locked && !paused && !simRef.current?.result && (
            <div className="sc-overlay sc-overlay--click">
              <div className="sc-card sc-card--narrow">
                <h2>Ready for takeoff</h2>
                <p>Click to take control. The mouse is captured while you fly — press <kbd>Esc</kbd> to pause and release it.</p>
                <button type="button" className="sc-btn sc-btn--primary" onClick={resume}>Fly</button>
              </div>
            </div>
          )}
          {paused && (
            <div className="sc-overlay" onMouseDown={(e) => e.stopPropagation()}>
              <div className="sc-card sc-pause">
                {!showHelp ? (
                  <>
                    <h2>Paused</h2>
                    <p className="sc-muted">M{simRef.current?.def.id} · {simRef.current?.def.title}</p>
                    <div className="sc-col">
                      <button type="button" className="sc-btn sc-btn--primary" onClick={resume}>Resume</button>
                      <button type="button" className="sc-btn" onClick={() => startMission(simRef.current?.def.id || missionSel)}>Restart mission</button>
                      <button type="button" className="sc-btn" onClick={() => setShowHelp(true)}>Controls & settings</button>
                      {!confirmQuit ? (
                        <button type="button" className="sc-btn sc-btn--ghost" onClick={() => setConfirmQuit(true)}>Quit to menu</button>
                      ) : (
                        <div className="sc-row">
                          <span className="sc-muted">Abandon mission?</span>
                          <button type="button" className="sc-btn sc-btn--danger" onClick={() => toMenu("menu")}>Quit</button>
                          <button type="button" className="sc-btn sc-btn--ghost" onClick={() => setConfirmQuit(false)}>Stay</button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h2>Controls & settings</h2>
                    <Settings settings={prog.settings} onChange={setSetting} />
                    <ControlsList />
                    <button type="button" className="sc-btn sc-btn--primary" onClick={() => setShowHelp(false)}>Back</button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {screen === "menu" && <MainMenu prog={prog} onGo={go} onPlay={() => startMission(Math.min(prog.unlocked, MISSIONS.length))} />}
      {screen === "how" && <HowTo prog={prog} onChange={setSetting} onBack={() => go(fromScreen === "how" ? "menu" : fromScreen)} />}
      {screen === "missions" && (
        <Missions prog={prog} sel={missionSel} setSel={setMissionSel} tab={worldTab} setTab={setWorldTab} onLaunch={startMission} onBack={() => go("menu")} onHangar={() => go("hangar")} />
      )}
      {screen === "hangar" && (
        <Hangar
          prog={prog}
          sel={hangarJet}
          setSel={setHangarJet}
          onSelect={(id) => {
            audio.ui();
            setProg({ ...progRef.current, jet: id });
          }}
          onBuyJet={(id) => {
            const np = buyJet(progRef.current, id);
            if (np) {
              audio.rearm();
              setProg(np);
            } else audio.denied();
          }}
          onBuyUp={(k) => {
            const np = buyUpgrade(progRef.current, k);
            if (np) {
              audio.rearm();
              setProg(np);
            } else audio.denied();
          }}
          onBack={() => go(fromScreen === "missions" ? "missions" : "menu")}
          onMissions={() => go("missions")}
        />
      )}
      {screen === "result" && result && (
        <Result
          r={result}
          onRetry={() => startMission(result.mission)}
          onNext={() => startMission(Math.min(MISSIONS.length, result.mission + 1))}
          onMenu={() => toMenu("menu")}
          onHangar={() => {
            setFromScreen("menu");
            toMenu("hangar");
          }}
        />
      )}
    </div>
  );
}

/* ================================================================== screens */
function Icon({ id }) {
  const p = { width: "1em", height: "1em", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "sc-icon" };
  if (id === "lock") return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
  if (id === "check") return <svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
  return null;
}

function MainMenu({ prog, onGo, onPlay }) {
  const next = missionById(Math.min(prog.unlocked, MISSIONS.length));
  const done = Object.keys(prog.completed).length;
  return (
    <div className="sc-screen sc-menu">
      <div className="sc-menu__brand">
        <div className="sc-menu__eyebrow">FLY • FIGHT • DOMINATE</div>
        <h1>SKY COMBAT <span>3D</span></h1>
        <p>Pilot a real fighter jet through desert, mountain and ocean warzones. Dogfight, lock missiles, drop bombs and survive.</p>
      </div>
      <nav className="sc-menu__nav">
        <button type="button" className="sc-btn sc-btn--primary sc-btn--xl" onClick={onPlay}>
          <span>Play</span>
          <small>Mission {next.id} · {next.title}</small>
        </button>
        <button type="button" className="sc-btn sc-btn--xl" onClick={() => onGo("hangar")}><span>Aircraft Hangar</span><small>{JETS[prog.jet].name} · upgrades</small></button>
        <button type="button" className="sc-btn sc-btn--xl" onClick={() => onGo("missions")}><span>Missions</span><small>{done} / {MISSIONS.length} complete</small></button>
        <button type="button" className="sc-btn sc-btn--xl" onClick={() => onGo("how")}><span>How to Play</span><small>Controls & tips</small></button>
      </nav>
      <div className="sc-menu__foot">
        <span className="sc-credits">◈ {prog.credits.toLocaleString()} credits</span>
      </div>
    </div>
  );
}

function ControlsList() {
  return (
    <ul className="sc-controls">
      {CONTROLS.map(([k, t]) => (
        <li key={k}><kbd>{k}</kbd><span>{t}</span></li>
      ))}
    </ul>
  );
}

function Settings({ settings, onChange }) {
  return (
    <div className="sc-settings">
      <label className="sc-toggle">
        <input type="checkbox" checked={settings.assist} onChange={(e) => onChange("assist", e.target.checked)} />
        <span>Mouse-assisted steering <small>(off: the mouse acts as a joystick)</small></span>
      </label>
      <label className="sc-toggle">
        <input type="checkbox" checked={settings.invert} onChange={(e) => onChange("invert", e.target.checked)} />
        <span>Invert mouse Y</span>
      </label>
      <label className="sc-range">
        <span>Mouse sensitivity <b>{settings.sens.toFixed(1)}</b></span>
        <input type="range" min="0.3" max="2.5" step="0.1" value={settings.sens} onChange={(e) => onChange("sens", Number(e.target.value))} />
      </label>
    </div>
  );
}

function HowTo({ prog, onChange, onBack }) {
  return (
    <div className="sc-screen sc-panel-screen">
      <div className="sc-card sc-card--wide">
        <header className="sc-head">
          <h2>How to Play</h2>
          <button type="button" className="sc-btn sc-btn--ghost" onClick={onBack}>Back</button>
        </header>
        <div className="sc-how">
          <section>
            <h3>Controls</h3>
            <ControlsList />
          </section>
          <section>
            <h3>Flying & fighting</h3>
            <ul className="sc-tips">
              <li><b>Steer with the mouse.</b> Move the white circle; the jet rolls and pulls toward it. Keys override the mouse at any time.</li>
              <li><b>Energy matters.</b> Climbing and hard turns bleed speed. Below stall speed the nose drops — dive and add throttle to recover.</li>
              <li><b>Guns:</b> put the cross on the green lead circle in front of the selected target.</li>
              <li><b>Missiles:</b> select a target (right mouse), keep it near the nose until the box turns red — LOCK — then press Space.</li>
              <li><b>Bombs:</b> fly toward a ground target and release when the BOMB circle sits on it. Bunkers and ships need bombs or missiles.</li>
              <li><b>Under attack:</b> a lock warning means a launch is coming. Pop flares (F) and break hard across the missile's path.</li>
              <li><b>SAM sites</b> can't track you below ~70 m — terrain is your friend.</li>
              <li><b>Rearm & repair</b> by flying low and slow over your home base (green square on radar).</li>
            </ul>
            <h3>Settings</h3>
            <Settings settings={prog.settings} onChange={onChange} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Missions({ prog, sel, setSel, tab, setTab, onLaunch, onBack, onHangar }) {
  const m = missionById(sel);
  const unlocked = (id) => id <= prog.unlocked;
  const list = MISSIONS.filter((x) => x.world === tab);
  return (
    <div className="sc-screen sc-panel-screen">
      <div className="sc-card sc-card--wide sc-missions">
        <header className="sc-head">
          <h2>Missions</h2>
          <div className="sc-tabs" role="tablist">
            {WORLD_ORDER.map((w) => (
              <button key={w} type="button" role="tab" aria-selected={tab === w} className={`sc-tab${tab === w ? " is-on" : ""}`} onClick={() => setTab(w)}>
                <small>{WORLDS[w].short}</small>
                {WORLDS[w].name}
              </button>
            ))}
          </div>
          <button type="button" className="sc-btn sc-btn--ghost" onClick={onBack}>Back</button>
        </header>
        <div className="sc-missions__body">
          <div className="sc-mlist">
            {list.map((x) => {
              const ok = unlocked(x.id);
              return (
                <button key={x.id} type="button" className={`sc-mcard${sel === x.id ? " is-sel" : ""}${ok ? "" : " is-locked"}${prog.completed[x.id] ? " is-done" : ""}`} onClick={() => ok && setSel(x.id)} disabled={!ok} aria-label={`Mission ${x.id}: ${x.title}${ok ? "" : " (locked)"}`}>
                  <span className="sc-mcard__n">{String(x.id).padStart(2, "0")}</span>
                  <span className="sc-mcard__t">
                    <b>{x.title}</b>
                    <small>{ok ? x.tag : "Locked — complete the previous mission"}</small>
                  </span>
                  <span className="sc-mcard__s">{prog.completed[x.id] ? <Icon id="check" /> : ok ? null : <Icon id="lock" />}</span>
                </button>
              );
            })}
          </div>
          <div className="sc-brief">
            <div className="sc-brief__world">{WORLDS[m.world].short} · {WORLDS[m.world].name}</div>
            <h3>Mission {m.id}: {m.title}</h3>
            <p>{m.brief}</p>
            <h4>Objectives</h4>
            <ol className="sc-objlist">
              {m.stages.map((s, i) => <li key={i}>{s.label}</li>)}
              {(m.fails || []).map((f, i) => <li key={"f" + i} className="sc-objlist__fail">{f.label}</li>)}
            </ol>
            <div className="sc-brief__meta">
              <span>Reward <b>◈ {m.reward}</b>{prog.completed[m.id] ? " (replay: 40%)" : ""}</span>
              {m.unlock && <span>Unlocks <b>{JETS[m.unlock].name}</b></span>}
              {m.loadout && <span>Strike loadout <b>{m.loadout.bombs ? `+${m.loadout.bombs} bombs ` : ""}{m.loadout.missiles ? `+${m.loadout.missiles} missiles` : ""}</b></span>}
              {prog.best[m.id] && <span>Best <b>{fmtTime(prog.best[m.id])}</b></span>}
            </div>
            <div className="sc-row sc-brief__go">
              <button type="button" className="sc-btn sc-btn--ghost" onClick={onHangar}>Aircraft: {JETS[prog.jet].name}</button>
              <button type="button" className="sc-btn sc-btn--primary sc-btn--lg" disabled={!unlocked(m.id)} onClick={() => onLaunch(m.id)}>Launch mission</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, v, max, fmt }) {
  return (
    <div className="sc-stat">
      <span>{label}</span>
      <div className="sc-stat__bar"><i style={{ transform: `scaleX(${Math.min(1, v / max)})` }} /></div>
      <b>{fmt ? fmt(v) : Math.round(v)}</b>
    </div>
  );
}

function Hangar({ prog, sel, setSel, onSelect, onBuyJet, onBuyUp, onBack, onMissions }) {
  const j = JETS[sel];
  const S = jetStats(sel, prog.up);
  const owned = !!prog.jets[sel];
  const active = prog.jet === sel;
  return (
    <div className="sc-screen sc-hangar">
      <header className="sc-hangar__top">
        <h2>Aircraft Hangar</h2>
        <span className="sc-credits">◈ {prog.credits.toLocaleString()}</span>
        <div className="sc-row">
          <button type="button" className="sc-btn sc-btn--ghost" onClick={onBack}>Back</button>
          <button type="button" className="sc-btn sc-btn--primary" onClick={onMissions}>Missions</button>
        </div>
      </header>
      <aside className="sc-hangar__jets">
        {JET_ORDER.map((id) => {
          const J = JETS[id];
          const own = !!prog.jets[id];
          return (
            <button key={id} type="button" className={`sc-jet${sel === id ? " is-sel" : ""}${own ? "" : " is-locked"}`} onClick={() => setSel(id)}>
              <b>{J.name} {!own && <Icon id="lock" />}</b>
              <small>{own ? (prog.jet === id ? "In use" : J.role) : `Locked · Mission ${J.unlock.mission} or ◈ ${J.unlock.cost}`}</small>
            </button>
          );
        })}
      </aside>
      <section className="sc-hangar__info">
        <div className="sc-hangar__name">
          <small>{j.role}</small>
          <h3>{j.name}</h3>
          <p>{j.desc}</p>
        </div>
        <StatBar label="Top speed" v={S.maxSpeed * 3.6} max={1300} fmt={(x) => `${Math.round(x)} km/h`} />
        <StatBar label="Handling" v={S.pitchRate} max={2.1} fmt={(x) => (x * 57.3).toFixed(0) + "°/s"} />
        <StatBar label="Armor" v={S.hp} max={225} />
        <StatBar label="Gun damage" v={S.gunDamage * S.gunRate} max={260} fmt={(x) => Math.round(x) + "/s"} />
        <StatBar label="Missiles" v={S.missiles} max={15} />
        <StatBar label="Bombs" v={S.bombs} max={8} />
        <StatBar label="Flares" v={S.flares} max={22} />
        <div className="sc-row sc-hangar__act">
          {owned ? (
            <button type="button" className="sc-btn sc-btn--primary" disabled={active} onClick={() => onSelect(sel)}>{active ? "Selected" : "Fly this aircraft"}</button>
          ) : (
            <>
              <button type="button" className="sc-btn sc-btn--primary" disabled={prog.credits < j.unlock.cost} onClick={() => onBuyJet(sel)}>Unlock · ◈ {j.unlock.cost}</button>
              <span className="sc-muted">or complete Mission {j.unlock.mission}</span>
            </>
          )}
        </div>
      </section>
      <section className="sc-hangar__ups">
        <h4>Upgrades <small>(all aircraft)</small></h4>
        {UPGRADE_ORDER.map((k) => {
          const U = UPGRADES[k];
          const lvl = prog.up[k] || 0;
          const c = upgradeCost(prog, k);
          return (
            <div key={k} className="sc-up">
              <div className="sc-up__t">
                <b>{U.name}</b>
                <small>{U.desc}</small>
                <span className="sc-pips">{Array.from({ length: MAX_UPGRADE }, (_, i) => <i key={i} className={i < lvl ? "on" : ""} />)}</span>
              </div>
              <button type="button" className="sc-btn sc-btn--sm" disabled={c == null || prog.credits < c} onClick={() => onBuyUp(k)}>{c == null ? "MAX" : `◈ ${c}`}</button>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Result({ r, onRetry, onNext, onMenu, onHangar }) {
  const m = missionById(r.mission);
  const hasNext = r.win && r.mission < MISSIONS.length;
  return (
    <div className="sc-screen sc-panel-screen">
      <div className={`sc-card sc-result sc-result--${r.win ? "win" : "fail"}`}>
        <div className="sc-result__tag">Mission {m.id} · {m.title}</div>
        <h2>{r.win ? "MISSION COMPLETE" : "MISSION FAILED"}</h2>
        <p className="sc-muted">{r.reason}</p>
        <div className="sc-result__grid">
          <div><small>Enemies destroyed</small><b>{r.kills}</b></div>
          <div><small>Mission time</small><b>{fmtTime(r.time)}</b></div>
          <div><small>Gun accuracy</small><b>{Math.round(r.accuracy * 100)}%</b></div>
          <div><small>Hull remaining</small><b>{Math.max(0, Math.round((r.hp / r.maxHp) * 100))}%</b></div>
          <div className="sc-result__credits"><small>Credits earned</small><b>◈ {r.earned}</b></div>
        </div>
        {r.newJet && <div className="sc-unlock">New aircraft unlocked: <b>{JETS[r.newJet].name}</b></div>}
        {r.win && r.mission === MISSIONS.length && <div className="sc-unlock">Campaign complete — the skies are yours, ace.</div>}
        <div className="sc-row sc-result__btns">
          <button type="button" className="sc-btn" onClick={onRetry}>Retry</button>
          {hasNext && <button type="button" className="sc-btn sc-btn--primary" onClick={onNext}>Next mission</button>}
          <button type="button" className="sc-btn" onClick={onHangar}>Hangar</button>
          <button type="button" className="sc-btn sc-btn--ghost" onClick={onMenu}>Main menu</button>
        </div>
      </div>
    </div>
  );
}
