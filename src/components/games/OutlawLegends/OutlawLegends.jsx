/**
 * Outlaw Legends: Wild Frontier — a third-person Wild West shooter with
 * fist-fighting, duels and light RPG progression across 20 missions.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). engine/sim.js is the framework-free simulation, stepped
 * here at ≤ 1/60 s; render/world.js mirrors it in plain Three.js; React draws
 * menus and a HUD refreshed ~10×/s (crosshair, hit markers and damage
 * numbers are imperative). Progress persists in localStorage.
 *
 * GamePlayer: `restartSignal` restarts the current mission; `muted` silences
 * audio; fullscreen is GamePlayer's (the canvas follows the stage).
 *
 * DEV hooks: `?oltest=1` (+`&nosave=1` keeps saves in memory, `&olmanual=1`
 * stops requestAnimationFrame) exposes window.__ol — see tools/harness.mjs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./OutlawLegends.css";
import { createSim, step as simStep, respawn as simRespawn, stepProgress, objectiveMarkers, bossInfo, aimInfo } from "./engine/sim.js";
import { MISSIONS, MISSION_BY_ID } from "./engine/missions.js";
import { WEAPONS, playerStats, levelFromXp, xpForLevel, MAX_LEVEL } from "./engine/data.js";
import { faceAngle, angDiff } from "./engine/geom.js";
import { loadProgress, saveProgress, freshProgress, completeMission, nextMissionId, buyWeaponUpgrade, buyCharUpgrade, buyAbility, SAVE_KEY } from "./engine/save.js";
import { createWorld } from "./render/world.js";
import { createInput, lockKeyboard, GAME_KEYS } from "./ui/input.js";
import { audio } from "./audio.js";
import { Hud } from "./ui/Hud.jsx";
import { MainMenu, MissionSelect, Briefing, Shop, Help, Settings, Pause, Death, Complete, Victory } from "./ui/Screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("oltest");
const NOSAVE = TEST && PARAMS.has("nosave");
const MANUAL = TEST && PARAMS.has("olmanual");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => (NOSAVE ? memStore : typeof localStorage !== "undefined" ? localStorage : undefined);
const STEP = 1 / 60;
const FLOAT_MAX = 26;
const MENU_SCREENS = new Set(["menu", "missions", "briefing", "shop"]);

export default function OutlawLegends({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const floatRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const botRef = useRef(null);
  const floats = useRef([]);
  const T = useRef({ hud: 0, hpLag: 100, aim: 0, hitT: 9, deadT: 0, xpAcc: 0, xpT: 0, alertT: 0, levelShown: 1 });
  const fx = { cross: useRef(null), hit: useRef(null), vignette: useRef(null), hold: useRef(null) };

  const [progress, setProgressState] = useState(() => loadProgress(store()));
  const progressRef = useRef(progress);
  const [screen, setScreenState] = useState("menu");
  const screenRef = useRef("menu");
  const [overlay, setOverlayState] = useState(null); // pause | dead | complete
  const overlayRef = useRef(null);
  const [sub, setSubState] = useState(null); // settings | help
  const subRef = useRef(null);
  const [missionId, setMissionId] = useState(() => nextMissionId(progress));
  const [returnTo, setReturnTo] = useState("menu");
  const [hud, setHud] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [report, setReport] = useState(null);
  const [deathInfo, setDeathInfo] = useState(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const lockPausedAt = useRef(0);
  const [webglError, setWebglError] = useState(null);
  const settings = progress.settings;

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const setSub = useCallback((s) => {
    subRef.current = s;
    setSubState(s);
  }, []);
  const setProgress = useCallback((p) => {
    progressRef.current = p;
    setProgressState(p);
    saveProgress(p, store());
  }, []);
  const setSetting = useCallback(
    (k, v) => {
      const p = progressRef.current;
      setProgress({ ...p, settings: { ...p.settings, [k]: v } });
    },
    [setProgress],
  );

  /* ------------------------------------------------------------ toasts */
  const toastId = useRef(0);
  const toastTimers = useRef(new Set());
  const toast = useCallback((text, kind = "info", ms = 2200, icon = null) => {
    const id = ++toastId.current;
    setToasts((l) => [...l.slice(-3), { id, text, kind, icon }]);
    const tm = setTimeout(() => {
      toastTimers.current.delete(tm);
      setToasts((l) => l.filter((x) => x.id !== id));
    }, ms);
    toastTimers.current.add(tm);
  }, []);
  useEffect(
    () => () => {
      for (const tm of toastTimers.current) clearTimeout(tm);
    },
    [],
  );

  /* ------------------------------------------------------------ settings → input / audio / gfx */
  useEffect(() => {
    inputRef.current.sens = settings.sens;
    inputRef.current.invertY = settings.invertY;
  }, [settings.sens, settings.invertY]);
  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    audio.setVolume(settings.volume, settings.music);
  }, [settings.volume, settings.music]);
  useEffect(() => {
    worldRef.current?.setQuality(settings.quality);
  }, [settings.quality]);
  useEffect(() => () => audio.stopAll(), []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST) return;
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* drag-to-look fallback */
    }
  }, []);
  const releaseLock = useCallback(() => {
    inputRef.current.clear();
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
        inputRef.current.clear();
        const S = simRef.current;
        if (screenRef.current === "play" && !overlayRef.current && S && S.status === "play") {
          lockPausedAt.current = performance.now();
          setOverlay("pause");
        }
      }
    };
    const onFs = () => lockKeyboard(!!document.fullscreenElement && !!rootRef.current && document.fullscreenElement.contains(rootRef.current));
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("fullscreenchange", onFs);
      lockKeyboard(false);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setOverlay]);

  /* ------------------------------------------------------------ floating numbers */
  const addFloat = useCallback((x, y, z, text, cls) => {
    const layer = floatRef.current;
    if (!layer) return;
    const L = floats.current;
    if (L.length >= FLOAT_MAX) L.shift().el.remove();
    const el = document.createElement("div");
    el.className = `ol-float ${cls}`;
    el.textContent = text;
    layer.appendChild(el);
    L.push({ x, y, z, t: 0, el });
  }, []);
  const clearFloats = useCallback(() => {
    for (const f of floats.current) f.el.remove();
    floats.current = [];
  }, []);

  /* ------------------------------------------------------------ mission flow */
  const startMission = useCallback(
    (id) => {
      const p = progressRef.current;
      const stats = playerStats(p);
      let S;
      try {
        S = createSim(id, { stats, difficulty: p.settings.difficulty, seed: (Date.now() & 0xffff) + 1 });
      } catch (err) {
        console.error("[OutlawLegends] mission failed to start", err);
        return;
      }
      simRef.current = S;
      worldRef.current?.clearMenu();
      worldRef.current?.setSim(S);
      clearFloats();
      inputRef.current.clear();
      T.current = { hud: 0, hpLag: S.P.maxHp, aim: 0, hitT: 9, deadT: 0, xpAcc: 0, xpT: 0, alertT: 0, levelShown: levelFromXp(p.xp), baseXp: p.xp, baseMoney: p.money };
      setMissionId(id);
      setReport(null);
      setDeathInfo(null);
      setOverlay(null);
      setSub(null);
      setHud(null);
      setScreen("play");
      audio.unlock();
      audio.stopMusic();
      audio.stopWind();
      if (!["interior", "mine"].includes(S.M.theme)) audio.startWind(S.M.theme === "night" ? 0.6 : 1);
      requestLock();
      toast(`Mission ${id} · ${S.M.name}`, "title", 3000);
    },
    [clearFloats, requestLock, setOverlay, setScreen, setSub, toast],
  );

  const goMenuScene = useCallback(() => {
    simRef.current = null;
    worldRef.current?.setMenu(1, "sunset");
  }, []);

  const toMenu = useCallback(
    (to = "menu") => {
      releaseLock();
      setOverlay(null);
      setSub(null);
      clearFloats();
      audio.stopWind();
      audio.startMusic();
      goMenuScene();
      setScreen(to);
    },
    [clearFloats, goMenuScene, releaseLock, setOverlay, setScreen, setSub],
  );

  const openBriefing = useCallback(
    (id) => {
      setMissionId(id);
      setScreen("briefing");
      audio.unlock();
      audio.click();
    },
    [setScreen],
  );

  const finishMission = useCallback(
    (S) => {
      const { progress: q, report: r } = completeMission(progressRef.current, S);
      setProgress(q);
      setReport(r);
      releaseLock();
      audio.victory();
      audio.stopWind();
      if (r.final) setScreen("victory");
      else setOverlay("complete");
    },
    [releaseLock, setOverlay, setProgress, setScreen],
  );

  const respawn = useCallback(() => {
    const S = simRef.current;
    if (!S) return;
    simRespawn(S);
    clearFloats();
    inputRef.current.clear();
    T.current.deadT = 0;
    T.current.hpLag = S.P.hp;
    setOverlay(null);
    setDeathInfo(null);
    requestLock();
    toast("Back at the last checkpoint", "info", 1600);
  }, [clearFloats, requestLock, setOverlay, toast]);

  /* ------------------------------------------------------------ events */
  const handleEvents = useCallback(
    (S, evs) => {
      worldRef.current?.onEvents(S, evs);
      const P = S.P;
      const Tm = T.current;
      for (const e of evs) {
        switch (e.type) {
          case "fire":
            audio.shot(e.w);
            break;
          case "efire": {
            audio.enemyShot(Math.hypot(e.mx - P.x, e.mz - P.z), e.type);
            if (e.whiz) audio.whiz();
            break;
          }
          case "impact":
            if (e.near && Math.random() < 0.35) audio.ricochet();
            break;
          case "hit":
            if (e.how === "melee" || e.how === "takedown") audio.punch(e.dmg > 20);
            else audio.enemyHit(e.head);
            if (e.how === "takedown") addFloat(e.x, e.y + 0.4, e.z, "Takedown!", "head");
            else if (e.dmg > 0 && e.how !== "duel") addFloat(e.x, e.y + 0.3, e.z, String(e.dmg), e.head ? "head" : e.kill ? "kill" : e.how === "melee" ? "melee" : "");
            Tm.hitT = 0;
            Tm.hitKind = e.kill ? "kill" : e.head ? "head" : "";
            break;
          case "kill":
            audio.kill();
            break;
          case "swing":
            audio.swing();
            break;
          case "punch":
            audio.punch(e.kind === "kick" || e.i === 2);
            break;
          case "blocked":
          case "blockHit":
            audio.block();
            break;
          case "counter":
            audio.block();
            toast("Counter!", "good", 1000);
            break;
          case "hurt":
            audio.hurt();
            addFloat(P.x, 1.9, P.z, `-${e.dmg}`, "hurt");
            break;
          case "dodged":
            break;
          case "reload":
            audio.reload(e.w);
            break;
          case "shell":
            audio.shell();
            break;
          case "reloaded":
            audio.reloaded();
            break;
          case "dry":
            audio.dry();
            break;
          case "switch":
            audio.switchW();
            break;
          case "roll":
            audio.roll();
            break;
          case "jump":
            audio.jump();
            break;
          case "land":
            audio.land();
            break;
          case "tired":
            toast("Too tired — catch your breath", "bad", 1200);
            break;
          case "pickup":
            if (e.kind === "cash") {
              audio.coins();
              addFloat(P.x, 2.0, P.z, `+$${e.amount}`, "cash");
            } else if (e.kind === "tonic") {
              audio.heal();
              addFloat(P.x, 2.0, P.z, `+${e.amount}`, "heal");
            } else {
              audio.pickup();
              addFloat(P.x, 2.0, P.z, "+Ammo", "cash");
            }
            break;
          case "xp":
            Tm.xpAcc += e.amount;
            Tm.xpT = 1.1;
            break;
          case "collect":
            audio.coins();
            break;
          case "explode":
            audio.explosion();
            break;
          case "fuse":
            audio.fuse();
            toast("Dynamite planted — get clear!", "bad", 1800);
            break;
          case "alert":
            if (S.t - Tm.alertT > 1.2) {
              audio.alert();
              Tm.alertT = S.t;
            }
            break;
          case "step":
            if (e.i > 0) toast("Checkpoint reached", "good", 1500);
            break;
          case "stepDone":
            audio.step();
            toast(e.text, "good", 2000, "✓");
            break;
          case "newWeapon":
            toast(`New weapon: ${WEAPONS[e.w].name}`, "title", 3000);
            break;
          case "resupply":
            toast("Ammunition resupplied", "info", 1500);
            break;
          case "supply":
            toast("A supply box turned up nearby", "info", 2000);
            break;
          case "wave":
            toast("More outlaws are coming!", "bad", 1800);
            break;
          case "phase":
            toast(`${e.name} is enraged!`, "bad", 2000);
            break;
          case "summon":
            toast(`${e.name} calls for reinforcements!`, "bad", 2200);
            break;
          case "tele":
            if (e.kind === "dynamite") audio.fuse();
            break;
          case "throw":
            break;
          case "freed":
            toast("Captive freed", "good", 1400);
            break;
          case "duelStart":
            audio.tension();
            break;
          case "draw":
            audio.bell();
            break;
          case "duelWin":
            audio.victory();
            break;
          case "duelLose":
            Tm.duelEarly = e.early;
            break;
          case "train":
            audio.train();
            toast("The train is pulling in!", "info", 2400);
            break;
          case "dead":
          case "failed":
            audio.defeat();
            break;
          case "complete":
            finishMission(S);
            break;
          default:
            break;
        }
      }
    },
    [addFloat, finishMission, toast],
  );

  /* ------------------------------------------------------------ HUD snapshot */
  const snapshot = useCallback((S, dt) => {
    const P = S.P, C = S.cam;
    const Tm = T.current;
    Tm.hpLag = P.hp > Tm.hpLag ? P.hp : Tm.hpLag + (P.hp - Tm.hpLag) * Math.min(1, dt * 2.5);
    const xp = (Tm.baseXp ?? 0) + S.earn.xp;
    const lv = levelFromXp(xp);
    const a = xpForLevel(lv), b = xpForLevel(Math.min(MAX_LEVEL, lv + 1));
    // compass toward the nearest objective point
    const marks = objectiveMarkers(S);
    let compass = null;
    {
      const ticks = [];
      const step = Math.PI / 12;
      const base = Math.round(C.yaw / step);
      for (let k = base - 7; k <= base + 7; k++) {
        const rel = angDiff(C.yaw, k * step);
        if (Math.abs(rel) > Math.PI / 2) continue;
        ticks.push({ k, x: 50 - (rel / (Math.PI / 2)) * 50, major: k % 6 === 0 });
      }
      let mark = null, dist = null;
      if (marks.length) {
        let best = null, bd = Infinity;
        for (const m of marks) {
          const d = Math.hypot(m[0] - P.x, m[1] - P.z);
          if (d < bd) {
            bd = d;
            best = m;
          }
        }
        const rel = angDiff(C.yaw, faceAngle(best[0] - P.x, best[1] - P.z));
        mark = Math.max(2, Math.min(98, 50 - (rel / (Math.PI / 2)) * 50));
        dist = Math.round(bd);
      }
      compass = { ticks, mark, dist };
    }
    const st = S.step;
    let defend = null;
    if (st?.type === "defend") {
      const o = S.objects.get(st.obj);
      if (o) defend = { label: o.kind === "jail" ? "Jailhouse" : "Stagecoach", hp: o.hp, max: o.maxHp };
    }
    const say = S.say[0] ? { who: S.say[0].who, text: S.say[0].text, key: `${S.say[0].who}|${S.say[0].text}` } : null;
    const D = S.duel;
    const a2 = P.ammo[P.w];
    return {
      missionLabel: `Mission ${S.M.id} · ${S.M.name}`,
      step: st ? st.text : "Mission complete",
      hint: st?.hint || null,
      prog: stepProgress(S),
      hp: P.hp,
      maxHp: P.maxHp,
      hpLag: Tm.hpLag,
      st: P.st,
      maxSt: P.maxSt,
      exhausted: P.exhausted,
      money: (Tm.baseMoney ?? 0) + S.earn.money,
      level: lv,
      xpPct: lv >= MAX_LEVEL ? 100 : ((xp - a) / Math.max(1, b - a)) * 100,
      compass,
      boss: bossInfo(S),
      defend,
      prompt: S.status === "play" && S.prompt ? { kind: S.prompt.kind, text: S.prompt.text, hold: !!S.prompt.hold } : null,
      say,
      duel: D ? { phase: D.phase, name: D.foe.name, result: D.result, time: D.playerTime } : null,
      w: P.w,
      mag: a2.mag,
      res: a2.res,
      owned: P.owned,
      reloading: P.reloadT > 0,
      deadEye: S.stats.deadEye ? S.deadEye.meter : null,
      deadEyeOn: S.deadEye.on,
      fists: !!st?.fists,
      crouch: P.crouch,
      block: P.block,
      aiming: C.aim > 0.5,
    };
  }, []);

  /* ------------------------------------------------------------ main loop */
  const tick = useCallback(
    (dt) => {
      const w = worldRef.current;
      const scr = screenRef.current;
      if (MENU_SCREENS.has(scr)) {
        inputRef.current.frame();
        w?.renderMenu(dt);
        return;
      }
      const S = simRef.current;
      if (!S || !w) return;
      const Tm = T.current;
      if (scr === "victory") {
        Tm.vicT = (Tm.vicT || 0) + dt;
        const a = Tm.vicT * 0.25;
        S.cam.cine = { pos: [S.P.x + Math.sin(a) * 6, 2.2 + Math.sin(Tm.vicT * 0.3) * 0.3, S.P.z + Math.cos(a) * 6], target: [S.P.x, 1.4, S.P.z] };
        S.status = "ending";
        S.endT = -999; // keep the cheer pose without re-completing
        w.render(S, dt);
        S.status = "complete";
        return;
      }
      const playing = scr === "play" && !overlayRef.current && !subRef.current;
      if (playing) {
        let inp = inputRef.current.frame();
        const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
          if (botRef.current) inp = botRef.current(S, h);
          const evs = simStep(S, h, i === 0 || botRef.current ? inp : { ...inp, dYaw: 0, dPitch: 0, fireP: false, reload: false, jump: false, dodge: false, melee: false, kick: false, crouch: false, interact: false, weapon: 0, wheel: 0, deadEye: false });
          if (evs.length) handleEvents(S, evs);
          if (S.status === "complete" || simRef.current !== S) return;
        }
        if (S.status === "dead" || S.status === "failed") {
          Tm.deadT += dt;
          if (Tm.deadT > 1.3 && !overlayRef.current) {
            releaseLock();
            setDeathInfo({ reason: S.deadReason, early: !!Tm.duelEarly });
            Tm.duelEarly = false;
            setOverlay("dead");
          }
        }
        // level-up mid-mission
        const lvNow = levelFromXp((Tm.baseXp ?? 0) + S.earn.xp);
        if (lvNow > Tm.levelShown) {
          Tm.levelShown = lvNow;
          audio.levelUp();
          toast(`Level up! You reached level ${lvNow}.`, "title", 2600);
        }
        Tm.xpT -= dt;
        if (Tm.xpAcc > 0 && Tm.xpT <= 0) {
          toast(`+${Tm.xpAcc} XP`, "xp", 1300);
          Tm.xpAcc = 0;
        }
      } else inputRef.current.frame();
      w.render(S, playing ? dt * (S.deadEye.on ? 0.6 : 1) : 0);
      // floats
      const L = floats.current;
      for (let i = L.length - 1; i >= 0; i--) {
        const f = L[i];
        f.t += dt;
        const p = w.project(f.x, f.y + f.t * 1.1, f.z);
        if (f.t > 1 || !p) {
          f.el.remove();
          L.splice(i, 1);
          continue;
        }
        f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.2 - f.t) * 2})`;
        f.el.style.opacity = String(Math.min(1, (1 - f.t) * 4));
      }
      // imperative HUD bits
      const P = S.P, C = S.cam;
      const cross = fx.cross.current;
      if (cross) {
        const ws = S.stats.weapons[P.w];
        const spread = (ws.spread + (ws.aimSpread - ws.spread) * C.aim + (P.moving > 0.5 ? ws.moveSpread : 0) + P.bloom) * (P.crouch ? 0.75 : 1);
        const px = 6 + spread * 520 * (60 / C.fov);
        cross.style.setProperty("--sp", `${px.toFixed(1)}px`);
        Tm.aimT = (Tm.aimT || 0) - dt;
        if (Tm.aimT <= 0) {
          Tm.aimT = 0.05;
          const ai = playing && S.status === "play" ? aimInfo(S) : null;
          cross.classList.toggle("blocked", !!ai?.blocked);
          cross.classList.toggle("enemy", !!ai?.enemy && !ai?.blocked);
        }
        cross.classList.toggle("hidden", !!S.duel && S.duel.phase !== "draw");
      }
      Tm.hitT += dt;
      const hm = fx.hit.current;
      if (hm) {
        hm.style.opacity = Tm.hitT < 0.18 ? String(1 - Tm.hitT / 0.18) : "0";
        hm.className = `ol-hitmark ${Tm.hitKind || ""}`;
      }
      const vg = fx.vignette.current;
      if (vg) {
        const low = Math.max(0, 1 - P.hp / (P.maxHp * 0.35));
        vg.style.opacity = String(Math.min(1, P.hurtT * 2.4 + low * 0.55 + (P.alive ? 0 : 0.8)));
      }
      const hold = fx.hold.current;
      if (hold) hold.style.width = P.use ? `${Math.min(100, (P.use.t / P.use.need) * 100)}%` : "0%";
      // HUD state
      Tm.hud -= dt;
      if (scr === "play" && Tm.hud <= 0) {
        Tm.hud = 0.1;
        setHud(snapshot(S, 0.1));
      }
    },
    [handleEvents, releaseLock, setOverlay, snapshot, toast],
  );
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage, { preserve: MANUAL });
    } catch (err) {
      setWebglError(String(err?.message || err));
      return undefined;
    }
    worldRef.current = world;
    world.setQuality(progressRef.current.settings.quality);
    world.setMenu(1, "sunset");
    const fit = () => world.resize(stage.clientWidth, stage.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        tickRef.current(dt);
      } catch (err) {
        console.error("[OutlawLegends] frame error", err);
      }
    };
    if (!MANUAL) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", fit);
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------ keyboard / mouse */
  const togglePause = useCallback(() => {
    if (screenRef.current !== "play") return;
    const S = simRef.current;
    if (!S || (S.status !== "play" && S.status !== "ending")) return;
    if (overlayRef.current === "pause") {
      if (subRef.current) return;
      setOverlay(null);
      requestLock();
    } else if (!overlayRef.current) {
      setOverlay("pause");
      releaseLock();
    }
  }, [releaseLock, requestLock, setOverlay]);

  useEffect(() => {
    const active = () => screenRef.current === "play" && !overlayRef.current && !subRef.current;
    const kd = (e) => {
      if (!rootRef.current?.isConnected) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (screenRef.current !== "play") return;
      if (e.code === "Escape" || e.code === "KeyP") {
        if (subRef.current) {
          setSub(null);
          return;
        }
        if (performance.now() - lockPausedAt.current > 400) togglePause();
        return;
      }
      if (!active()) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      audio.unlock();
      inputRef.current.keyDown(e.code, e.repeat);
    };
    const ku = (e) => inputRef.current.keyUp(e.code);
    const blur = () => {
      inputRef.current.clear();
      const S = simRef.current;
      if (screenRef.current === "play" && !overlayRef.current && S?.status === "play") setOverlay("pause");
    };
    const mu = (e) => inputRef.current.mouseUp(e.button);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    window.addEventListener("mouseup", mu);
    // wheel switches weapons and must not scroll the page
    const root = rootRef.current;
    const wh = (e) => {
      if (screenRef.current !== "play" || overlayRef.current || subRef.current) return;
      e.preventDefault();
      inputRef.current.wheel(e.deltaY);
    };
    root?.addEventListener("wheel", wh, { passive: false });
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      window.removeEventListener("mouseup", mu);
      root?.removeEventListener("wheel", wh);
    };
  }, [setOverlay, setSub, togglePause]);

  const drag = useRef(null);
  const onMouseDown = (e) => {
    if (screenRef.current !== "play" || overlayRef.current || subRef.current) return;
    if (e.target.closest?.("button")) return;
    audio.unlock();
    if (TEST) {
      inputRef.current.mouseDown(e.button);
      return;
    }
    if (!lockedRef.current) {
      requestLock();
      drag.current = { x: e.clientX, y: e.clientY, moved: 0, b: e.button };
      return;
    }
    inputRef.current.mouseDown(e.button);
  };
  const onMouseMove = (e) => {
    if (lockedRef.current) inputRef.current.mouseMove(e.movementX || 0, e.movementY || 0);
    else if (drag.current) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      drag.current.moved += Math.abs(dx) + Math.abs(dy);
      inputRef.current.mouseMove(dx, dy);
    }
  };
  const onMouseUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved < 6 && !lockedRef.current && screenRef.current === "play" && !overlayRef.current) {
      // pointer lock refused: a plain click still shoots
      setTimeout(() => {
        if (lockedRef.current) return;
        inputRef.current.mouseDown(e.button);
        setTimeout(() => inputRef.current.mouseUp(e.button), 50);
      }, 60);
    }
  };

  /* ------------------------------------------------------------ GamePlayer restart */
  const firstRestart = useRef(true);
  useEffect(() => {
    if (firstRestart.current) {
      firstRestart.current = false;
      return;
    }
    const S = simRef.current;
    if (S && (screenRef.current === "play" || screenRef.current === "victory")) startMission(S.M.id);
  }, [restartSignal, startMission]);

  // menu music starts with the first click anywhere
  const onAnyPointer = () => {
    audio.unlock();
    if (MENU_SCREENS.has(screenRef.current)) audio.startMusic();
  };

  /* ------------------------------------------------------------ dev hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__ol = {
      sim: () => simRef.current,
      world: () => worldRef.current,
      input: inputRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      sub: () => subRef.current,
      progress: () => progressRef.current,
      setProgress: (fn) => setProgress(typeof fn === "function" ? fn(progressRef.current) : fn),
      play: (id) => startMission(id),
      brief: (id) => openBriefing(id),
      setScreen: (s) => setScreen(s),
      toMenu: (s) => toMenu(s),
      respawn: () => respawn(),
      resume: () => {
        setSub(null);
        setOverlay(null);
      },
      pause: () => togglePause(),
      setBot: (fn) => {
        botRef.current = fn;
      },
      advance: (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) tickRef.current(dt);
      },
      report: () => report,
    };
    return () => {
      delete window.__ol;
    };
  });

  /* ------------------------------------------------------------ shop handlers */
  const buy = (q) => {
    if (!q) return;
    setProgress(q);
    audio.buy();
  };

  const S = simRef.current;
  const inPlay = screen === "play";
  const M = MISSION_BY_ID[missionId] || MISSIONS[0];
  return (
    <div
      ref={rootRef}
      className={`ol ${inPlay ? "ol-playing" : ""} ${locked ? "ol-locked" : ""}`}
      tabIndex={-1}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onPointerDown={onAnyPointer}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={stageRef} className="ol-stage" />
      <div ref={floatRef} className="ol-floats" />
      {MENU_SCREENS.has(screen) && <div className="ol-menu-shade" />}

      {webglError && (
        <div className="ol-screen ol-dim">
          <div className="ol-panel narrow center">
            <h2>3D isn't available</h2>
            <p className="ol-center">This game needs WebGL, which your browser or device couldn't start. Try another browser or enable hardware acceleration.</p>
          </div>
        </div>
      )}

      {inPlay && S && <Hud h={hud} fx={fx} hints={settings.hints} onPause={togglePause} />}
      {inPlay && !TEST && !locked && !overlay && !sub && hud && S?.t < 12 && <div className="ol-clickhint">Click the game to control the camera with the mouse</div>}
      <div className="ol-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ol-toast ${t.kind}`}>
            {t.icon && (
              <span className="ol-toast-icon" aria-hidden="true">
                {t.icon}
              </span>
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => openBriefing(Object.keys(progress.completed).length ? nextMissionId(progress) : 1)}
          onContinue={() => startMission(nextMissionId(progressRef.current))}
          onMissions={() => setScreen("missions")}
          onShop={() => {
            setReturnTo("menu");
            setScreen("shop");
          }}
          onHelp={() => setSub("help")}
          onSettings={() => setSub("settings")}
        />
      )}
      {screen === "missions" && <MissionSelect progress={progress} onPick={openBriefing} onBack={() => setScreen("menu")} />}
      {screen === "briefing" && (
        <Briefing
          id={missionId}
          progress={progress}
          onStart={() => startMission(missionId)}
          onShop={() => {
            setReturnTo("briefing");
            setScreen("shop");
          }}
          onBack={() => setScreen("missions")}
        />
      )}
      {screen === "shop" && (
        <Shop
          progress={progress}
          onBuyWeapon={(w, t) => buy(buyWeaponUpgrade(progressRef.current, w, t))}
          onBuyChar={(id) => buy(buyCharUpgrade(progressRef.current, id))}
          onBuyAbility={(id) => buy(buyAbility(progressRef.current, id))}
          onBack={() => setScreen(returnTo)}
        />
      )}

      {inPlay && overlay === "pause" && S && (
        <Pause
          mission={S.M}
          onResume={() => {
            setOverlay(null);
            requestLock();
          }}
          onCheckpoint={respawn}
          onRestart={() => startMission(S.M.id)}
          onSettings={() => setSub("settings")}
          onHelp={() => setSub("help")}
          onQuit={() => toMenu("menu")}
        />
      )}
      {inPlay && overlay === "dead" && deathInfo && <Death reason={deathInfo.reason} early={deathInfo.early} onCheckpoint={respawn} onRestart={() => S && startMission(S.M.id)} onQuit={() => toMenu("menu")} />}
      {inPlay && overlay === "complete" && report && (
        <Complete
          r={report}
          onNext={() => {
            toMenu("briefing");
            setMissionId(Math.min(MISSIONS.length, report.id + 1));
          }}
          onShop={() => {
            toMenu("shop");
            setReturnTo("briefing");
            setMissionId(Math.min(MISSIONS.length, report.id + 1));
          }}
          onReplay={() => startMission(report.id)}
          onMissions={() => toMenu("missions")}
          onMenu={() => toMenu("menu")}
        />
      )}
      {screen === "victory" && <Victory r={report} progress={progress} onMenu={() => toMenu("menu")} onMissions={() => toMenu("missions")} />}

      {sub === "settings" && (
        <Settings
          settings={settings}
          setSetting={setSetting}
          inMission={inPlay}
          onReset={() => {
            try {
              store()?.removeItem(SAVE_KEY);
            } catch {
              /* ignore */
            }
            const f = freshProgress();
            setProgress({ ...f, settings: progressRef.current.settings });
            setMissionId(1);
          }}
          onBack={() => setSub(null)}
        />
      )}
      {sub === "help" && <Help onBack={() => setSub(null)} />}
    </div>
  );
}
