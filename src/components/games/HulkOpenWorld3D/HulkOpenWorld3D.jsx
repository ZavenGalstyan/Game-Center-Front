/**
 * Hulk: Open World 3D — superhero open-world action for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the framework-free
 * Sim (engine/sim.js) at a fixed 1/60 s and draws it with plain Three.js
 * (render/world.js). The numeric HUD is written straight to DOM refs ~15×/s
 * and markers / minimap / city map are canvases, so gameplay never
 * re-renders React; React only renders menus, briefings, pause and results.
 *
 * Screens: menu | missions | brief | upgrades | how | settings | play
 * Play overlays: pause | map | upgrades | settings | result
 * Progress (XP, upgrades, missions, bosses, landmarks, activities, settings,
 * free-roam position) persists under `hulk-open-world-3d-progress`.
 *
 * Game Center integration:
 *   restartSignal  Restart → restarts the active mission / free-roam session
 *   muted          Mute → master gain to zero for every game sound
 *   Fullscreen is GamePlayer's; the canvases follow the stage (ResizeObserver).
 * Pointer lock is released on pause, overlays, results, menus, tab hide and
 * unmount; listeners, the rAF loop, audio and GPU resources are cleaned up.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./HulkOpenWorld3D.css";
import { Sim } from "./engine/sim.js";
import { getCity, DISTRICTS } from "./engine/city.js";
import { STEP, ATTACKS, HERO } from "./engine/config.js";
import { loadProgress, saveProgress, freshProgress, computeStats, buyUpgrade, resetUpgrades, applyMissionResult, addXp, levelInfo, pointsLeft } from "./engine/progress.js";
import { MISSIONS, ACTIVITIES, missionById } from "./data/missions.js";
import { resolveAt } from "./engine/missions.js";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { drawOverlay, drawMinimap, drawCityMap } from "./ui/hud.js";
import { MainMenu, MissionSelect, Briefing, UpgradesPanel, HowTo, SettingsPanel, PauseMenu, Results } from "./ui/screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("hktest");
const NOSAVE = TEST && PARAMS.has("nosave");
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "KeyC", "KeyM", "Tab", "Space", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const storage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};
const isTouch = () => typeof window !== "undefined" && (PARAMS.has("hktouch") || (window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches));
const BOSS_SITES = [
  { mission: 14, boss: "warMachine", site: "fort", name: "War Machine" },
  { mission: 16, boss: "colossus", site: "steel", name: "Iron Colossus" },
  { mission: 19, boss: "titan", site: "titan", name: "Titan Destroyer" },
];
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

export default function HulkOpenWorld3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const miniRef = useRef(null);
  const mapRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const menuSimRef = useRef(null);
  const runRef = useRef(null);
  const screenRef = useRef("menu");
  const overlayStateRef = useRef(null);
  const lockedRef = useRef(false);
  const keys = useRef(new Set());
  const edges = useRef({});
  const mouse = useRef({ heavy: false });
  const cam = useRef({ yaw: Math.PI, pitch: 0.18 });
  const hud = useRef({});
  const hits = useRef([]);
  const touchRef = useRef({ on: isTouch(), jx: 0, jy: 0, joyId: null, lookId: null, lx: 0, ly: 0, jump: false, heavy: false, sprint: false });
  const progRef = useRef(null);
  if (!progRef.current) progRef.current = storage() ? loadProgress(storage()) : freshProgress();

  const [screen, setScreenState] = useState("menu");
  const [overlay, setOverlayState] = useState(null);
  const [prog, setProgState] = useState(progRef.current);
  const [briefId, setBriefId] = useState(null);
  const [result, setResult] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState("mission");
  const [touch] = useState(touchRef.current.on);
  const [flash, setFlash] = useState(0);
  const [quality, setQuality] = useState(progRef.current.settings.quality);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayStateRef.current = o;
    setOverlayState(o);
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
      /* not allowed right now — the pause card stays up */
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
        mouse.current.heavy = false;
        if (screenRef.current === "play" && !overlayStateRef.current && simRef.current && !simRef.current.result) setOverlay("pause");
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
    setToasts((f) => [...f.slice(-4), { id, text, kind }]);
    setTimeout(() => setToasts((f) => f.filter((x) => x.id !== id)), 3400);
  }, []);
  const showBanner = useCallback((title, sub = "", kind = "info", ms = 2600) => {
    const id = ++fid.current;
    setBanner({ id, title, sub, kind });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);

  /* ------------------------------------------------------------ runs */
  const stats = () => computeStats(progRef.current);
  const startRun = useCallback(
    (run) => {
      audio.unlock();
      audio.ui();
      const P = progRef.current;
      const sim = new Sim({
        mode: run.mode,
        mission: run.mission,
        stats: computeStats(P),
        difficulty: P.settings.difficulty,
        seed: (Date.now() % 1e9) | 0,
        spawn: run.mode === "free" ? P.free : null,
        discovered: P.discovered,
        activityBest: { ...P.activityBest },
      });
      simRef.current = sim;
      runRef.current = run;
      worldRef.current?.reset();
      cam.current.yaw = sim.hero.heading + Math.PI;
      cam.current.pitch = 0.2;
      keys.current.clear();
      edges.current = {};
      mouse.current.heavy = false;
      hits.current = [];
      hud.current.last = {};
      hud.current.saveT = 6;
      hud.current.stepDist = 0;
      hud.current.musicT = 0;
      setResult(null);
      setToasts([]);
      setBanner(null);
      setMode(run.mode);
      setOverlay(null);
      setScreen("play");
      requestLock();
      if (run.mode === "mission") {
        const def = missionById(run.mission);
        setTimeout(() => showBanner(`MISSION ${def.id}`, def.title, "start", 2800), 50);
      } else setTimeout(() => showBanner("FREE ROAM", "Explore · Fight · Discover", "start", 2400), 50);
    },
    [requestLock, setOverlay, setScreen, showBanner],
  );

  /** free roam: bank XP / landmarks / activities / position */
  const commitFree = useCallback(() => {
    const sim = simRef.current;
    if (!sim || sim.mode !== "free") return;
    let p = progRef.current;
    let lvlUp = null;
    if (sim.runXp > 0) {
      const out = addXp(p, Math.round(sim.runXp));
      p = out.prog;
      lvlUp = out.levelUp;
      sim.runXp = 0;
    }
    p = { ...p, discovered: [...sim.discovered], activityBest: { ...p.activityBest, ...sim.activityBest }, free: { x: sim.hero.x, z: sim.hero.z } };
    setProg(p);
    if (lvlUp) {
      sim.setStats(computeStats(p));
      audio.levelUp();
      showBanner(`LEVEL ${lvlUp}!`, `${pointsLeft(p)} upgrade point${pointsLeft(p) === 1 ? "" : "s"} — press Tab`, "level", 3000);
    }
  }, [setProg, showBanner]);

  const finishMission = useCallback(() => {
    const sim = simRef.current;
    if (!sim?.result) return;
    const r = sim.result;
    const before = progRef.current;
    const out = applyMissionResult(before, r, MISSIONS.length);
    const notices = [];
    if (out.levelUp) notices.push(`Level up! You reached level ${out.levelUp}.`);
    if (out.newMission) notices.push(`Mission ${out.newMission} unlocked: ${missionById(out.newMission).title}`);
    if (r.win && r.boss && !before.bosses[r.boss]) notices.push("Boss defeated: +2 upgrade points");
    if (r.win && !before.completed.includes(r.mission)) notices.push("+1 upgrade point for completing the mission");
    setProg(out.prog);
    setResult({ ...r, notices });
    setOverlay("result");
    releaseLock();
    if (r.win) audio.victory();
    else audio.defeat();
  }, [releaseLock, setOverlay, setProg]);

  const toMenu = useCallback(
    (s = "menu") => {
      if (simRef.current && simRef.current.mode === "free") commitFree();
      releaseLock();
      simRef.current = null;
      runRef.current = null;
      audio.silence();
      worldRef.current?.reset();
      setOverlay(null);
      setResult(null);
      setScreen(s);
    },
    [commitFree, releaseLock, setOverlay, setScreen],
  );
  const restartRun = useCallback(() => {
    if (!runRef.current) return;
    if (simRef.current && simRef.current.mode === "free") commitFree();
    startRun(runRef.current);
  }, [commitFree, startRun]);

  // GamePlayer Restart → restart the active run (menus: back to the main menu)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play" && runRef.current) restartRun();
    else toMenu("menu");
  }, [restartSignal, restartRun, toMenu]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => audio.setVolume(prog.settings.volume), [prog.settings.volume]);
  useEffect(() => audio.setMusic(prog.settings.music), [prog.settings.music]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ world (re)creation */
  useEffect(() => {
    // a fresh canvas per renderer (StrictMode / quality changes re-create it)
    const canvas = document.createElement("canvas");
    canvas.className = "hk-canvas";
    canvasRef.current.appendChild(canvas);
    const city = getCity();
    const world = createWorld(canvas, { city, quality });
    worldRef.current = world;
    const el = rootRef.current;
    const fit = () => {
      const r = el.getBoundingClientRect();
      world.resize(r.width, r.height);
      for (const c of [overlayRef.current, miniRef.current, mapRef.current]) {
        if (!c) continue;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = c === miniRef.current ? c.clientWidth || 170 : r.width;
        const h = c === miniRef.current ? c.clientWidth || 170 : r.height;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (!menuSimRef.current) menuSimRef.current = new Sim({ mode: "free", stats: computeStats(progRef.current), seed: 7, ambient: true });
    hud.current.fit = fit;
    return () => {
      ro.disconnect();
      world.dispose();
      canvas.remove();
      worldRef.current = null;
    };
  }, [quality]);

  // overlay / minimap / map canvases mount with the play screen: size them then
  useEffect(() => {
    hud.current.fit && hud.current.fit();
  }, [screen, overlay]);

  /* ------------------------------------------------------------ sim events → audio / UI */
  const handleEvents = useCallback(
    (sim) => {
      const h = sim.hero;
      const dist = (x, z) => Math.hypot(x - h.x, z - h.z);
      for (const e of sim.events) {
        switch (e.type) {
          case "act":
            if (e.kind === "smash" || e.kind === "clap") audio.grunt();
            else if (e.kind === "lift") audio.lift();
            else if (e.kind !== "hurt") audio.whoosh(e.kind === "heavy" || e.kind === "ragePunch" || e.kind === "jab3");
            break;
          case "impact":
            audio.punch(e.kind);
            break;
          case "jump":
            audio.jump();
            break;
          case "leap":
            audio.chargeStop();
            audio.leap(e.charge);
            break;
          case "land":
            if (e.impact > 8) audio.land(e.impact);
            break;
          case "landShock":
            audio.landShock();
            break;
          case "smash":
            audio.smash();
            break;
          case "clap":
            audio.clap();
            break;
          case "rageStart":
            audio.rage();
            showBanner("RAGE!", "Damage up · damage taken down", "rage", 1800);
            break;
          case "rageEnd":
            toast("Rage faded", "info");
            break;
          case "throw":
            audio.throw();
            break;
          case "bodySlam":
            audio.crash(0, 0.6);
            break;
          case "cooldown":
            toast(`${e.what === "smash" ? "Ground Smash" : "Thunder Clap"} is recharging`, "warn");
            break;
          case "grabFail":
            break;
          case "propDestroyed": {
            const p = e.prop;
            const d = dist(p.x, p.z);
            if (p.type === "car" || p.type === "van" || p.type === "taxi") audio.crash(d, 1);
            else audio.crumble(d, p.type === "crate" || p.type === "bench" || p.type === "fence" ? "wood" : "stone");
            break;
          }
          case "propImpact":
            audio.crash(dist(e.x, e.z), Math.min(1.2, e.speed / 30));
            break;
          case "explosion":
            audio.explosion(dist(e.x, e.z), e.big);
            break;
          case "enemyFire":
            audio.gun(dist(e.x, e.z), e.kind);
            break;
          case "bossFire":
            audio.gun(dist(e.boss.x, e.boss.z) * 0.5, e.kind);
            break;
          case "telegraph":
            if (dist(e.enemy.x, e.enemy.z) < 40) audio.telegraph(e.kind);
            break;
          case "heroHit":
            audio.hurt(e.dmg);
            hits.current.push({ ang: e.ang, t: sim.t });
            if (hits.current.length > 8) hits.current.shift();
            if (e.dmg > 15) setFlash((f) => f + 1);
            break;
          case "heroDown":
            audio.defeat();
            if (sim.mode === "free") showBanner("DOWN!", "Getting back up…", "fail", 3000);
            break;
          case "respawn":
            toast("Back on your feet", "good");
            break;
          case "kill":
            break;
          case "step":
            if (sim.t > 0.5) {
              audio.objective();
              showBanner("NEW OBJECTIVE", e.label, "obj", 2400);
            }
            break;
          case "objective":
            toast(`✔ ${e.label}`, "good");
            break;
          case "wave":
            audio.alarm();
            showBanner(`WAVE ${e.n}${e.of ? ` / ${e.of}` : ""}`, "Enemies incoming", "fail", 2000);
            break;
          case "checkpoint":
            audio.objective();
            toast(`Checkpoint ${e.n} / ${e.of}`, "good");
            break;
          case "civLost":
            toast("A civilian was lost!", "bad");
            break;
          case "civSafe":
            toast("Civilian reached safety", "good");
            break;
          case "freed":
            audio.objective();
            toast("Civilians freed — cover their escape!", "good");
            break;
          case "escaped":
            toast("A vehicle reached the gate!", "bad");
            break;
          case "bossIntro":
            audio.bossRoar();
            showBanner(e.boss.name.toUpperCase(), "BOSS BATTLE", "boss", 3000);
            break;
          case "bossPhase":
            audio.alarm();
            showBanner(`${e.boss.name.toUpperCase()} — PHASE ${e.phase}`, "It's getting angry", "fail", 2200);
            break;
          case "bossTelegraph":
            audio.bossTele();
            break;
          case "bossVulnerable":
            toast("WEAK POINT EXPOSED — hit it now!", "good");
            break;
          case "bossStunned":
            audio.crash(0, 1.2);
            showBanner("STUNNED!", "It rammed the wall — go all in", "good", 1800);
            break;
          case "bossShield":
            toast("Shield up! Destroy the 3 shield generators", "warn");
            break;
          case "bossShieldDown":
            showBanner("SHIELD DOWN", "The Titan is exposed", "good", 2000);
            break;
          case "bossShielded":
            break;
          case "bossDefeated":
            showBanner(`${e.boss.name.toUpperCase()} DEFEATED`, "", "win", 3200);
            break;
          case "bossSlam":
            break;
          case "landmark":
            audio.objective();
            showBanner("LANDMARK DISCOVERED", `${e.landmark.name} · +60 XP`, "obj", 2600);
            break;
          case "encounter":
            toast(`${e.name} spotted nearby`, "warn");
            break;
          case "encounterClear":
            toast(`${e.name} cleared · +40 XP`, "good");
            break;
          case "activity": {
            const a = ACTIVITIES.find((x) => x.id === e.id);
            audio.objective();
            showBanner(a.name.toUpperCase(), a.rules, "start", 3200);
            break;
          }
          case "activityDone": {
            const sc = e.sc;
            if (e.success) {
              audio.victory();
              showBanner("CHALLENGE COMPLETE", `${sc.def.name} · ${sc.reason} · +${sc.def.xp} XP`, "win", 3600);
            } else {
              audio.defeat();
              showBanner("CHALLENGE FAILED", `${sc.def.name} · ${sc.reason}`, "fail", 3200);
            }
            break;
          }
          case "jumpScore":
            toast(`Leap: ${Math.round(e.d)} m`, e.d >= 55 ? "good" : "info");
            break;
          case "throwScore":
            toast(e.pts ? `Target hit: +${e.pts}` : "Missed the targets", e.pts ? "good" : "warn");
            break;
          case "honk":
            audio.honk(dist(e.x, e.z));
            break;
          case "scream":
            audio.scream(dist(e.x, e.z));
            break;
          case "missionComplete":
          case "missionFailed":
            break;
          default:
        }
      }
    },
    [showBanner, toast],
  );

  /* ------------------------------------------------------------ input → sim */
  const buildInput = useCallback((sim) => {
    const k = keys.current;
    const T = touchRef.current;
    const c = cam.current;
    let f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let r = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    if (T.on && (T.jx || T.jy)) {
      r = T.jx;
      f = -T.jy;
    }
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
    const E = edges.current;
    edges.current = {};
    const world = worldRef.current;
    return {
      mx,
      mz,
      camYaw: c.yaw + Math.PI,
      aim: world ? world.aimDir() : null,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight") || T.sprint,
      walk: !!hud.current.walk,
      jump: k.has("Space") || T.jump,
      punch: !!E.punch,
      heavy: mouse.current.heavy || T.heavy,
      smash: !!E.smash,
      grab: !!E.grab,
      rage: !!E.rage,
      special: !!E.special,
    };
  }, []);

  /* ------------------------------------------------------------ HUD writer */
  const writeHud = useCallback((sim) => {
    const H = hud.current;
    const L = H.last || (H.last = {});
    const set = (k, v) => {
      if (L[k] !== v && H[k]) {
        L[k] = v;
        H[k].textContent = v;
      }
    };
    const attr = (k, a, v) => {
      if (H[k] && H[k].dataset[a] !== v) H[k].dataset[a] = v;
    };
    const bar = (k, f) => {
      if (H[k]) H[k].style.transform = `scaleX(${Math.max(0, Math.min(1, f)).toFixed(3)})`;
    };
    const h = sim.hero;
    const st = h.st;
    bar("hpBar", h.hp / h.maxHp);
    set("hp", `${Math.ceil(h.hp)} / ${h.maxHp}`);
    attr("hpWrap", "lvl", h.hp / h.maxHp < 0.3 ? "crit" : "ok");
    bar("rageBar", h.rage / st.rageMax);
    attr("rageWrap", "state", h.raging ? "on" : h.rage >= st.rageMax - 0.01 ? "ready" : "fill");
    set("rageTxt", h.raging ? `RAGE ${h.rageT.toFixed(1)}s` : h.rage >= st.rageMax - 0.01 ? "RAGE READY — press R" : `Rage ${Math.floor((h.rage / st.rageMax) * 100)}%`);
    // level (free roam shows banked + pending XP)
    const P = progRef.current;
    const pend = sim.mode === "free" ? sim.runXp : sim.runXp;
    const li = levelInfo(P.xp + (sim.mode === "free" ? pend : 0));
    set("lvl", `LV ${li.level}`);
    bar("xpBar", li.frac);
    set("xpTxt", sim.mode === "mission" ? `+${Math.round(sim.runXp)} XP this mission` : `${Math.floor(li.into)} / ${li.need} XP`);
    // abilities
    const ab = (k, cd, max, label) => {
      if (!H[k]) return;
      const f = cd > 0 ? cd / max : 0;
      H[k].style.setProperty("--cd", f.toFixed(3));
      attr(k, "ready", cd > 0 ? "0" : "1");
      set(k + "T", cd > 0 ? `${Math.ceil(cd)}` : label);
    };
    ab("abSmash", h.cd.smash, ATTACKS.smash.cd * st.cdMul, "Q");
    ab("abClap", h.cd.clap, ATTACKS.clap.cd * st.cdMul, "F");
    ab("abRP", h.cd.ragePunch, ATTACKS.ragePunch.cd * st.cdMul, "RMB");
    if (H.abRage) {
      attr("abRage", "ready", h.rage >= st.rageMax - 0.01 && !h.raging ? "1" : h.raging ? "on" : "0");
      H.abRage.style.setProperty("--cd", (1 - h.rage / st.rageMax).toFixed(3));
    }
    // objective
    const ob = sim.objective();
    if (H.objWrap) H.objWrap.style.display = ob ? "" : "none";
    if (ob) {
      set("objTitle", ob.title || "");
      set("objLabel", ob.label || "");
      set("objProg", ob.prog || "");
      set("objStep", ob.step ? `Step ${ob.step}` : "");
      bar("objBar", ob.frac || 0);
      set("objTimer", ob.timer != null ? fmtT(ob.timer) : "");
      attr("objTimer", "low", ob.timer != null && ob.timer < 20 ? "1" : "0");
      if (H.dangerWrap) {
        const on = ob.danger != null && ob.danger > 0.001;
        H.dangerWrap.style.display = on ? "" : "none";
        if (on) {
          bar("danger", ob.danger);
          set("dangerTxt", ob.dangerLabel || "");
        }
      }
    }
    // boss bar
    const b = sim.bossBar();
    if (H.bossWrap) H.bossWrap.style.display = b && !(b.dead && b.deadT > 3) ? "" : "none";
    if (b) {
      set("bossName", b.name);
      bar("bossBar", b.hp / b.maxHp);
      set("bossPhase", b.shield ? "SHIELDED" : b.vuln > 0 || b.stun > 0 ? "VULNERABLE!" : `Phase ${b.phase}`);
      attr("bossWrap", "state", b.shield ? "shield" : b.vuln > 0 || b.stun > 0 ? "vuln" : "ok");
    }
    // prompt + district
    const pr = sim.interactPrompt();
    if (H.prompt) {
      H.prompt.style.display = pr ? "" : "none";
      if (pr) set("prompt", pr.text);
    }
    set("district", DISTRICTS[sim.districtAt(h.x, h.z)].name);
    set("kills", `${sim.stats.kills}`);
    set("dest", `${Math.round(sim.stats.destruction)}`);
  }, []);

  /* ------------------------------------------------------------ frame */
  const frameRef = useRef(null);
  const timers = useRef({ hud: 0, acc: 0, mini: 0 });
  const activitySpots = useRef(null);
  frameRef.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    dt = Math.min(dt, 0.1);
    const s = screenRef.current;
    const sim = simRef.current;
    const P = progRef.current;
    if (s !== "play" || !sim) {
      const ms = menuSimRef.current;
      if (ms) {
        ms.step({}, Math.min(dt, 1 / 30));
        ms.events.length = 0;
        world.renderMenu(ms, dt, null);
      }
      return;
    }
    const ov = overlayStateRef.current;
    const active = (lockedRef.current || touchRef.current.on) && !ov;
    if (active || sim.result) {
      timers.current.acc += dt;
      let n = 0;
      while (timers.current.acc >= STEP && n < 5) {
        timers.current.acc -= STEP;
        n++;
        const botIn = TEST && window.__hkBotInput ? window.__hkBotInput(sim) : null;
        if (botIn && !botIn.aim) botIn.aim = worldRef.current ? worldRef.current.aimDir() : null;
        sim.step(active && !sim.result ? botIn || buildInput(sim) : {}, STEP);
        handleEvents(sim);
        if (TEST && window.__hkTap) window.__hkTap(sim);
      }
      if (n === 5) timers.current.acc = 0;
    }
    if (TEST && window.__hkBotInput) {
      // follow-cam while the test bot drives
      const want = sim.hero.heading + Math.PI;
      const d = Math.atan2(Math.sin(want - cam.current.yaw), Math.cos(want - cam.current.yaw));
      cam.current.yaw += d * Math.min(1, dt * 2.5);
    }
    world.render(sim, dt, cam.current, P.settings);
    // charge hum, footsteps, music
    const h = sim.hero;
    if (h.charging && h.anim.charge > 0) {
      audio.chargeStart();
      audio.charge(h.anim.charge);
    } else audio.chargeStop();
    if (h.grounded && h.alive) {
      hud.current.stepDist = (hud.current.stepDist || 0) + h.speed * dt;
      const stride = h.sprinting ? 4.2 : h.speed > 6 ? 3.2 : 2.4;
      if (hud.current.stepDist > stride && h.speed > 1) {
        hud.current.stepDist = 0;
        audio.step(Math.min(1.3, 0.5 + h.speed / 14));
      }
    }
    hud.current.musicT = (hud.current.musicT || 0) - dt;
    if (hud.current.musicT <= 0) {
      hud.current.musicT = 1;
      const boss = sim.bosses.some((b) => !b.dead && b.state !== "intro");
      const fight = sim.enemies.some((e) => !e.dead && !e.sleep && e.state !== "patrol" && Math.hypot(e.x - h.x, e.z - h.z) < 90);
      if (boss) audio.music("boss");
      else if (fight) {
        hud.current.calmT = 0;
        audio.music("combat");
      } else {
        hud.current.calmT = (hud.current.calmT || 0) + 1;
        if (hud.current.calmT > 6) audio.music("none");
      }
    }
    // overlay canvas: markers, bars, crosshair
    const oc = overlayRef.current;
    if (oc) drawOverlay(oc.getContext("2d"), sim, world, { w: world.size.w, h: world.size.h, dpr: oc.width / Math.max(1, world.size.w), hits: hits.current, settings: P.settings });
    // minimap ~20 Hz
    timers.current.mini -= dt;
    const mc = miniRef.current;
    if (!activitySpots.current) activitySpots.current = ACTIVITIES.map((a) => ({ ...sim.activitySpot(a), name: a.name, id: a.id }));
    if (mc && timers.current.mini <= 0) {
      timers.current.mini = 0.05;
      const sz = mc.clientWidth || 170;
      drawMinimap(mc.getContext("2d"), sim, { size: sz, dpr: mc.width / Math.max(1, sz), camYaw: cam.current.yaw, activities: sim.mode === "free" ? activitySpots.current : [], discovered: sim.discovered });
    }
    if (ov === "map" && mapRef.current) {
      const m = mapRef.current;
      const nextM = MISSIONS.find((x) => !P.completed.includes(x.id) && x.id <= P.unlocked);
      const ms = nextM && sim.mode === "free" ? resolveAt(sim, nextM.start, { snap: false }) : null;
      drawCityMap(m.getContext("2d"), sim, {
        w: world.size.w,
        h: world.size.h,
        dpr: m.width / Math.max(1, world.size.w),
        activities: activitySpots.current,
        discovered: sim.discovered,
        bossSites: BOSS_SITES.map((b) => ({ ...sim.city.sites[b.site], name: b.name, done: !!P.bosses[b.boss] })),
        missionSite: ms ? { ...ms, label: `Next: ${nextM.title}` } : null,
      });
    }
    timers.current.hud -= dt;
    if (timers.current.hud <= 0) {
      timers.current.hud = 0.066;
      writeHud(sim);
    }
    // persistence / results
    if (sim.mode === "free") {
      hud.current.saveT = (hud.current.saveT || 6) - dt;
      if (hud.current.saveT <= 0) {
        hud.current.saveT = 6;
        commitFree();
      }
    }
    if (sim.result && overlayStateRef.current !== "result" && !hud.current.finishing) {
      hud.current.finishing = true;
      setTimeout(() => {
        hud.current.finishing = false;
        finishMission();
      }, 900);
    }
  };
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const dt = (t - last) / 1000;
      last = t;
      try {
        frameRef.current(dt);
      } catch (err) {
        console.error("[Hulk] " + (err && err.stack ? err.stack : err));
      }
    };
    raf = requestAnimationFrame(loop);
    const vis = () => {
      if (document.hidden && screenRef.current === "play" && !overlayStateRef.current && simRef.current && !simRef.current.result) {
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
  useEffect(() => {
    const root = rootRef.current;
    const playing = () => screenRef.current === "play" && simRef.current;
    const kd = (e) => {
      if (!playing()) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      const ov = overlayStateRef.current;
      if (e.code === "Tab") {
        if (ov === "upgrades") {
          setOverlay(null);
          requestLock();
        } else if (!ov || ov === "map") {
          releaseLock();
          setOverlay("upgrades");
        }
        return;
      }
      if (e.code === "KeyM") {
        if (ov === "map") {
          setOverlay(null);
          requestLock();
        } else if (!ov) {
          releaseLock();
          setOverlay("map");
        }
        return;
      }
      if (e.code === "Escape" && (ov === "map" || ov === "upgrades" || ov === "settings")) {
        setOverlay(ov === "settings" ? "pause" : null);
        if (ov !== "settings") requestLock();
        return;
      }
      if (ov) return;
      if (e.repeat) return;
      keys.current.add(e.code);
      if (e.code === "KeyQ") edges.current.smash = true;
      if (e.code === "KeyE") edges.current.grab = true;
      if (e.code === "KeyR") edges.current.rage = true;
      if (e.code === "KeyF") edges.current.special = true;
      if (e.code === "KeyC") hud.current.walk = !hud.current.walk;
    };
    const ku = (e) => {
      keys.current.delete(e.code);
      if (playing() && GAME_KEYS.has(e.code)) e.preventDefault();
    };
    const mm = (e) => {
      if (!lockedRef.current || !playing() || overlayStateRef.current) return;
      const S = progRef.current.settings;
      const k = 0.0022 * S.sensitivity;
      cam.current.yaw -= e.movementX * k;
      cam.current.pitch = Math.max(-0.55, Math.min(1.25, cam.current.pitch + e.movementY * k * (S.invertY ? -1 : 1)));
    };
    const md = (e) => {
      if (!playing()) return;
      if (overlayStateRef.current) return;
      if (!lockedRef.current) {
        requestLock();
        return;
      }
      if (e.button === 0) edges.current.punch = true;
      if (e.button === 2) mouse.current.heavy = true;
      e.preventDefault();
    };
    const mu = (e) => {
      if (e.button === 2) mouse.current.heavy = false;
    };
    const ctx = (e) => {
      if (playing()) e.preventDefault();
    };
    const wheel = (e) => {
      if (playing() && !overlayStateRef.current) e.preventDefault();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    document.addEventListener("mousemove", mm);
    root.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    root.addEventListener("contextmenu", ctx);
    root.addEventListener("wheel", wheel, { passive: false });
    const blur = () => {
      keys.current.clear();
      mouse.current.heavy = false;
    };
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", mm);
      root.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      root.removeEventListener("contextmenu", ctx);
      root.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", blur);
    };
  }, [releaseLock, requestLock, setOverlay]);

  /* ------------------------------------------------------------ touch */
  const onTouchStart = useCallback((e) => {
    const T = touchRef.current;
    if (!T.on || screenRef.current !== "play" || overlayStateRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest(".hk-tbtn")) continue;
      const x = t.clientX - r.left;
      if (x < r.width * 0.4 && T.joyId == null) {
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
        cam.current.pitch = Math.max(-0.55, Math.min(1.25, cam.current.pitch + (t.clientY - T.ly) * 0.005));
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
    if (name === "jump") T.jump = down;
    else if (name === "heavy") T.heavy = down;
    else if (name === "sprint") {
      if (down) T.sprint = !T.sprint;
    } else if (down) edges.current[name] = true;
  };

  /* ------------------------------------------------------------ test hooks (dev only) */
  useEffect(() => {
    if (!TEST) return;
    window.__hk = {
      sim: () => simRef.current,
      menuSim: () => menuSimRef.current,
      world: () => worldRef.current,
      cam: cam.current,
      keys: keys.current,
      edges,
      mouse: mouse.current,
      startRun,
      toMenu,
      setOverlay,
      screen: () => screenRef.current,
      overlay: () => overlayStateRef.current,
      prog: () => progRef.current,
      setProg,
      fit: () => hud.current.fit && hud.current.fit(),
      frame: (dt = 1 / 60) => frameRef.current(dt),
    };
    return () => {
      delete window.__hk;
    };
  }, [startRun, toMenu, setOverlay, setProg]);

  /* ------------------------------------------------------------ actions */
  const nextMissionId = () => {
    const P = progRef.current;
    const m = MISSIONS.find((x) => !P.completed.includes(x.id) && x.id <= P.unlocked);
    return m ? m.id : null;
  };
  const onPlay = () => {
    audio.unlock();
    audio.ui();
    const id = nextMissionId();
    if (id) {
      setBriefId(id);
      setScreen("brief");
    } else setScreen("missions");
  };
  const onContinue = () => {
    audio.unlock();
    if (progRef.current.free || !nextMissionId()) startRun({ mode: "free" });
    else onPlay();
  };
  const onFree = () => startRun({ mode: "free" });
  const onBuy = (id) => {
    const n = buyUpgrade(progRef.current, id);
    if (!n) return;
    audio.ui();
    setProg(n);
    if (simRef.current) simRef.current.setStats(computeStats(n));
  };
  const onReset = () => {
    const n = resetUpgrades(progRef.current);
    setProg(n);
    if (simRef.current) simRef.current.setStats(computeStats(n));
  };
  const onSettings = (s) => {
    const n = { ...progRef.current, settings: s };
    setProg(n);
    if (s.quality !== quality) setQuality(s.quality);
  };
  const resume = () => {
    setOverlay(null);
    requestLock();
  };

  const brief = briefId ? missionById(briefId) : null;
  const hasNext = result && result.win && result.mission < MISSIONS.length;

  return (
    <div className={`hk${touch ? " hk--touch" : ""}`} ref={rootRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="hk-canvas" ref={canvasRef} />
      {screen === "play" && (
        <>
          <canvas className="hk-overlay" ref={overlayRef} />
          <div className="hk-flash" key={flash} data-on={flash ? "1" : "0"} />
          <div className="hk-hud">
            <div className="hk-hud__tl">
              <div className="hk-vit" ref={(r) => (hud.current.hpWrap = r)}>
                <div className="hk-vit__row">
                  <span className="hk-vit__lbl">HEALTH</span>
                  <span className="hk-vit__val" ref={(r) => (hud.current.hp = r)} />
                </div>
                <div className="hk-bar hk-bar--hp">
                  <i ref={(r) => (hud.current.hpBar = r)} />
                </div>
              </div>
              <div className="hk-vit hk-vit--rage" ref={(r) => (hud.current.rageWrap = r)}>
                <div className="hk-vit__row">
                  <span className="hk-vit__lbl" ref={(r) => (hud.current.rageTxt = r)} />
                </div>
                <div className="hk-bar hk-bar--rage">
                  <i ref={(r) => (hud.current.rageBar = r)} />
                </div>
              </div>
              <div className="hk-lvlrow">
                <b ref={(r) => (hud.current.lvl = r)} />
                <div className="hk-bar hk-bar--xp">
                  <i ref={(r) => (hud.current.xpBar = r)} />
                </div>
                <span ref={(r) => (hud.current.xpTxt = r)} />
              </div>
            </div>
            <div className="hk-obj" ref={(r) => (hud.current.objWrap = r)}>
              <div className="hk-obj__title">
                <span ref={(r) => (hud.current.objTitle = r)} />
                <em ref={(r) => (hud.current.objStep = r)} />
              </div>
              <div className="hk-obj__label" ref={(r) => (hud.current.objLabel = r)} />
              <div className="hk-obj__row">
                <span ref={(r) => (hud.current.objProg = r)} />
                <b className="hk-obj__timer" ref={(r) => (hud.current.objTimer = r)} />
              </div>
              <div className="hk-bar hk-bar--obj">
                <i ref={(r) => (hud.current.objBar = r)} />
              </div>
              <div className="hk-obj__danger" ref={(r) => (hud.current.dangerWrap = r)}>
                <span ref={(r) => (hud.current.dangerTxt = r)} />
                <div className="hk-bar hk-bar--danger">
                  <i ref={(r) => (hud.current.danger = r)} />
                </div>
              </div>
            </div>
            <div className="hk-boss" ref={(r) => (hud.current.bossWrap = r)} style={{ display: "none" }}>
              <div className="hk-boss__row">
                <b ref={(r) => (hud.current.bossName = r)} />
                <span ref={(r) => (hud.current.bossPhase = r)} />
              </div>
              <div className="hk-bar hk-bar--boss">
                <i ref={(r) => (hud.current.bossBar = r)} />
              </div>
            </div>
            <div className="hk-mini">
              <canvas ref={miniRef} />
              <div className="hk-mini__district" ref={(r) => (hud.current.district = r)} />
            </div>
            <div className="hk-abil">
              <div className="hk-ab" ref={(r) => (hud.current.abSmash = r)} title="Ground Smash">
                <i>💥</i>
                <span ref={(r) => (hud.current.abSmashT = r)}>Q</span>
                <small>Smash</small>
              </div>
              <div className="hk-ab" ref={(r) => (hud.current.abClap = r)} title="Thunder Clap">
                <i>👏</i>
                <span ref={(r) => (hud.current.abClapT = r)}>F</span>
                <small>Clap</small>
              </div>
              <div className="hk-ab" ref={(r) => (hud.current.abRP = r)} title="Rage Punch (hold right mouse)">
                <i>✊</i>
                <span ref={(r) => (hud.current.abRPT = r)}>RMB</span>
                <small>Rage Punch</small>
              </div>
              <div className="hk-ab hk-ab--rage" ref={(r) => (hud.current.abRage = r)} title="Rage">
                <i>🔥</i>
                <span>R</span>
                <small>Rage</small>
              </div>
            </div>
            <div className="hk-stats">
              <span>
                Defeated <b ref={(r) => (hud.current.kills = r)}>0</b>
              </span>
              <span>
                Destruction <b ref={(r) => (hud.current.dest = r)}>0</b>
              </span>
            </div>
            <div className="hk-prompt" ref={(r) => (hud.current.prompt = r)} style={{ display: "none" }} />
          </div>
          <div className="hk-toasts">
            {toasts.map((t) => (
              <div key={t.id} className={`hk-toast hk-toast--${t.kind}`}>
                {t.text}
              </div>
            ))}
          </div>
          {banner && (
            <div className={`hk-banner hk-banner--${banner.kind}`} key={banner.id}>
              <b>{banner.title}</b>
              {banner.sub && <span>{banner.sub}</span>}
            </div>
          )}
          {!locked && !overlay && !touch && (
            <button className="hk-capture" onClick={requestLock}>
              Click to play
            </button>
          )}
          {touch && !overlay && (
            <div className="hk-touch">
              {[
                ["punch", "Punch"],
                ["heavy", "Heavy"],
                ["jump", "Jump"],
                ["smash", "Smash"],
                ["special", "Clap"],
                ["grab", "Grab"],
                ["rage", "Rage"],
                ["sprint", "Sprint"],
              ].map(([k, label]) => (
                <button key={k} className={`hk-tbtn hk-tbtn--${k}`} onTouchStart={tb(k, true)} onTouchEnd={tb(k, false)} onTouchCancel={tb(k, false)}>
                  {label}
                </button>
              ))}
              <button className="hk-tbtn hk-tbtn--pause" onTouchStart={(e) => (e.preventDefault(), setOverlay("pause"))}>
                II
              </button>
              <button className="hk-tbtn hk-tbtn--map" onTouchStart={(e) => (e.preventDefault(), setOverlay("map"))}>
                Map
              </button>
            </div>
          )}
          {overlay === "map" && (
            <div className="hk-mapwrap" onClick={resume}>
              <canvas className="hk-map" ref={mapRef} />
            </div>
          )}
          {overlay === "pause" && (
            <PauseMenu
              mode={mode}
              onResume={resume}
              onRestart={restartRun}
              onSettings={() => setOverlay("settings")}
              onUpgrades={() => setOverlay("upgrades")}
              onMenu={() => toMenu("menu")}
            />
          )}
          {overlay === "upgrades" && (
            <div className="hk-dim">
              <UpgradesPanel prog={prog} onBuy={onBuy} onReset={onReset} onBack={resume} inGame />
            </div>
          )}
          {overlay === "settings" && (
            <div className="hk-dim">
              <SettingsPanel settings={prog.settings} onChange={onSettings} onBack={() => setOverlay("pause")} inGame />
            </div>
          )}
          {overlay === "result" && result && (
            <Results
              r={result}
              hasNext={hasNext}
              onRetry={() => startRun(runRef.current)}
              onNext={() => {
                setBriefId(result.mission + 1);
                toMenu("brief");
              }}
              onMenu={() => toMenu("menu")}
            />
          )}
        </>
      )}
      {screen === "menu" && <MainMenu prog={prog} onPlay={onPlay} onContinue={onContinue} onFree={onFree} onScreen={setScreen} />}
      {screen === "missions" && (
        <div className="hk-dim">
          <MissionSelect
            prog={prog}
            onBack={() => setScreen("menu")}
            onPick={(id) => {
              audio.unlock();
              audio.ui();
              setBriefId(id);
              setScreen("brief");
            }}
          />
        </div>
      )}
      {screen === "brief" && brief && <Briefing mission={brief} hints={prog.settings.hints} onStart={() => startRun({ mode: "mission", mission: brief.id })} onBack={() => setScreen("missions")} />}
      {screen === "upgrades" && (
        <div className="hk-dim">
          <UpgradesPanel prog={prog} onBuy={onBuy} onReset={onReset} onBack={() => setScreen("menu")} />
        </div>
      )}
      {screen === "how" && (
        <div className="hk-dim">
          <HowTo onBack={() => setScreen("menu")} touch={touch} />
        </div>
      )}
      {screen === "settings" && (
        <div className="hk-dim">
          <SettingsPanel settings={prog.settings} onChange={onSettings} onBack={() => setScreen("menu")} />
        </div>
      )}
    </div>
  );
}

export { HERO };
