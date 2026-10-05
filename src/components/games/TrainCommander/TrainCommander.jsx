/**
 * Train Commander — armoured-train strategy defence for the Game Center
 * (React Three Fiber + Three.js). Registered by name in ../registry.js.
 *
 * ONE <Canvas> stays mounted for the whole session. Menus show the train
 * rolling through the region behind them; the journey simulation
 * (engine/engine.js) is ticked by a single useFrame (three/Scene.jsx →
 * <Driver>), never by React or timers.
 *
 * Shared controls:
 *   restartSignal  restarts the CURRENT route from its starting state (train
 *                  HP, modules, Scrap, enemies, projectiles, schedule,
 *                  progress, boss, timers, result). Saved progress is
 *                  untouched. Ignored on menu screens.
 *   muted          silences the train loop, every sound and the music now.
 *   Fullscreen     only resizes the canvas; the route keeps running as is.
 * Progress: localStorage `train-commander-progress` (utils/storage.js).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import "./TrainCommander.css";
import { Engine } from "./engine/engine.js";
import { audio } from "./audio/audio.js";
import { MODULES, MODULE_IDS } from "./data/modules.js";
import { ENEMIES, BOSSES } from "./data/enemies.js";
import { ROUTES, getRoute } from "./data/routes.js";
import { regionOf } from "./data/regions.js";
import { liveryOf } from "./data/cosmetics.js";
import { loadProgress, saveProgress, applyResult, isUnlocked, nextRouteId } from "./utils/storage.js";
import { Driver, CameraRig, Lights, World, Weather, atmosphere } from "./three/Scene.jsx";
import { TrainView } from "./three/TrainView.jsx";
import { Enemies, Projectiles, Markers, Effects, Floaters } from "./three/Combat.jsx";
import { frameloop, glTest, Sizer, TEST } from "./three/testHooks.js";
import { hasWebGL, useCanvasWatchdog, SceneErrorBoundary } from "./three/CanvasGuard.jsx";
import { TopBar, CarStrip, WagonPanel, Banner, Hint, CheckpointBar, BossBar, PauseOverlay, ResultOverlay } from "./screens/Hud.jsx";
import { MainMenu, RoutesScreen, TrainScreen, StatsScreen, SettingsScreen } from "./screens/Menus.jsx";
import { EnemyIcon, ModuleIcon } from "./screens/ui.jsx";

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const SIDE_TEXT = { left: "LEFT FLANK", right: "RIGHT FLANK", ahead: "AHEAD", behind: "FROM BEHIND" };

/** the menu backdrop: an endless, peaceful run through a region */
function demoRoute(region, wagons = 4) {
  return { id: 900 + region, region, wagons, startScrap: 0, modules: MODULE_IDS, speed: 7.5, events: [], length: 1e9, from: "", to: "", time: "day", weather: "clear" };
}
const DEMO_MODULES = [{ type: "cannon", level: 2 }, { type: "gunner", level: 3 }, { type: "repair", level: 1 }, { type: "lancer", level: 2 }];

/* --------------------------------------------------------- in-canvas helpers */
function AudioSync({ engine, enabled }) {
  useFrame(() => {
    const on = enabled && engine.mode !== "idle" && engine.mode !== "showcase" && !engine.paused && !engine.hidden;
    audio.setTrain(engine.cruise > 0 ? engine.v / engine.cruise : 0, on);
  });
  return null;
}

/** keeps the wagon panel horizontally under the selected car */
function PanelAnchor({ view, panelRef, compact }) {
  useFrame(() => {
    const el = panelRef.current;
    if (!el || compact || !view.selAnchor || !view.size) return;
    const [W] = view.size;
    const w = el.offsetWidth || 300;
    const x = Math.max(8, Math.min(W - w - 8, view.selAnchor[0] - w / 2));
    el.style.left = `${Math.round(x)}px`;
    el.style.transform = "none";
  });
  return null;
}

/** DOM arrows at the stage edge for incoming groups (pooled, positioned per frame) */
function EdgeArrows({ view, layer }) {
  const pool = useRef([]);
  useEffect(() => {
    const el = layer.current;
    if (!el) return undefined;
    const list = [];
    for (let i = 0; i < 8; i++) {
      const d = document.createElement("div");
      d.className = "tc-edge";
      d.style.display = "none";
      d.innerHTML = '<span class="tc-edge__arrow"></span><span class="tc-edge__txt"></span>';
      el.appendChild(d);
      list.push(d);
    }
    pool.current = list;
    return () => list.forEach((d) => d.remove());
  }, [layer]);
  useFrame(() => {
    const ws = view.warnings || [];
    const list = pool.current;
    if (!list.length || !view.toScreen || !view.size) return;
    const [W, H] = view.size;
    let n = 0;
    for (const w of ws) {
      if (n >= list.length) break;
      const d = list[n++];
      const [sx, sy] = view.toScreen(Math.max(-60, Math.min(60, w.x)), 0.5, Math.max(-30, Math.min(30, w.z)));
      const pad = 34;
      const x = Math.max(pad, Math.min(W - pad, sx));
      const y = Math.max(pad + 50, Math.min(H - pad - 70, sy));
      const ang = Math.atan2(sy - H * 0.55, sx - W / 2);
      d.style.display = "flex";
      d.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      d.firstChild.style.transform = `rotate(${ang}rad)`;
      d.lastChild.textContent = w.boss ? "BOSS" : SIDE_TEXT[w.side] || "";
      d.className = `tc-edge${w.boss ? " is-boss" : ""}`;
    }
    for (let i = n; i < list.length; i++) list[i].style.display = "none";
  });
  return null;
}

function Scene3D({ engine, view, bus, fx, envRef, layer, edgeLayer, panelRef, region, atmo, settings, mode, seed, pal, selected, onSelect, compact, garage, twin, soundOn }) {
  const q = settings.graphics;
  const shadows = settings.shadows && q !== "low";
  const R = regionOf(region);
  return (
    <>
      <Driver engine={engine} bus={bus} />
      <Sizer />
      <color attach="background" args={[atmo.fog]} />
      <fog attach="fog" args={[atmo.fog, atmo.fogNear, atmo.fogFar]} />
      <Lights A={atmo} shadows={shadows} quality={q} envRef={envRef} view={view} />
      <World R={R} A={atmo} quality={q} engine={engine} envRef={envRef} seed={seed} twin={twin} />
      <Weather A={atmo} engine={engine} quality={q} particles={settings.particles} />
      <TrainView engine={engine} pal={pal} quality={q} settings={settings} fx={fx} selected={selected} onSelect={onSelect} view={view} interactive={mode === "play"} />
      <Enemies engine={engine} quality={q} settings={settings} fx={fx} />
      <Projectiles engine={engine} fx={fx} settings={settings} />
      <Markers engine={engine} bus={bus} view={view} />
      <Effects engine={engine} bus={bus} fx={fx} settings={settings} view={view} />
      <Floaters bus={bus} layer={layer} view={view} settings={settings} engine={engine} />
      <EdgeArrows view={view} layer={edgeLayer} />
      <PanelAnchor view={view} panelRef={panelRef} compact={compact} />
      <AudioSync engine={engine} enabled={soundOn} />
      <CameraRig mode={mode} view={view} engine={engine} settings={settings} garage={garage} />
    </>
  );
}

export default function TrainCommander({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const edgeRef = useRef(null);
  const panelRef = useRef(null);
  const envRef = useRef(null);
  const [webgl] = useState(hasWebGL);
  const [canvasKey, setCanvasKey] = useState(0);
  const canvasStuck = useCanvasWatchdog(stageRef);
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;
  const view = useRef({ shake: 0 }).current;
  const bus = useRef({ handlers: new Set() }).current;
  const fx = useRef(null);
  const garage = useRef({ yaw: 0.35, pitch: 0.1, drag: false }).current;

  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const settings = progress.settings;
  const [screen, setScreen] = useState("menu");
  const [routeId, setRouteId] = useState(() => nextRouteId(loadProgress()));
  const [mapSel, setMapSel] = useState(null);
  const [showModule, setShowModule] = useState("gunner");
  const [hud, setHud] = useState(null);
  const [paused, setPaused] = useState(false);
  const [end, setEnd] = useState(null);
  const [banner, setBanner] = useState(null);
  const [ingameSettings, setIngameSettings] = useState(false);
  const [sel, setSel] = useState(null);
  const [scrapFlash, setScrapFlash] = useState(0);
  const [tut, setTut] = useState(null);
  const [touch] = useState(isTouch);
  const [narrow, setNarrow] = useState(false);
  const applied = useRef(true);
  const inPlay = screen === "play";
  const route = getRoute(routeId) || ROUTES[0];
  const compact = touch || narrow;

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ------------------------------------------------ the stage is narrow? */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const f = () => {
      const r = el.getBoundingClientRect();
      setNarrow(r.width < 760 || r.width / Math.max(1, r.height) < 1.2);
    };
    f();
    let ro = null;
    try {
      ro = new ResizeObserver(f);
      ro.observe(el);
    } catch {
      /* the window resize below covers it */
    }
    window.addEventListener("resize", f);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", f);
    };
  }, []);

  /* ------------------------------------------------ boot: menu backdrop */
  const menuRegion = getRoute(nextRouteId(progress))?.region || 1;
  const [demoRegion, setDemoRegion] = useState(menuRegion);
  useEffect(() => {
    engine.load(demoRoute(demoRegion), { demo: true, modules: DEMO_MODULES });
    return () => {
      engine.unload();
      audio.dispose();
      document.body.style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  /* ------------------------------------------------ fold a route once */
  const fold = useCallback(
    (summary) => {
      if (applied.current) return null;
      applied.current = true;
      const out = applyResult(progressRef.current, summary);
      commit(out.progress);
      return out;
    },
    [commit]
  );
  const abandon = useCallback(() => {
    if (applied.current || engine.mode !== "play" || !engine.route) return;
    const r = engine.run;
    if (r.time < 8 && !r.built) {
      applied.current = true;
      return;
    }
    fold({ result: "abandoned", routeId: engine.route.id, stars: 0, run: { ...r, killsByType: { ...r.killsByType }, builtByType: { ...r.builtByType } } });
  }, [engine, fold]);

  /* ------------------------------------------------ banners */
  const bannerTimer = useRef(0);
  const showBanner = useCallback((b, ms = 2400) => {
    clearTimeout(bannerTimer.current);
    setBanner({ ...b, key: Date.now() + Math.random() });
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  /* ------------------------------------------------ tutorial (route 1) */
  const tutRef = useRef(null); // { step, t }
  const setStep = useCallback(
    (step) => {
      tutRef.current = step < 0 ? null : { step, t: engine.run.time };
      const T = [
        { text: touch ? "Tap a wagon (or its chip below) to open its mount." : "Click a wagon (or its chip below) to open its mount.", hlCar: 1 },
        { text: "Fit a GUNNER — it aims and fires on its own.", hlMod: "gunner" },
        { text: "Raiders are coming. Watch the red markers — your guns engage automatically.", hlCar: null },
        { text: "Wrecks drop Scrap. Arm the other wagons, then upgrade.", hlCar: null },
        { text: "Station stop: repair and build. Press CONTINUE when ready.", hlCar: null },
        { text: "Keep the LOCOMOTIVE alive — if it is destroyed, the journey fails.", hlCar: 0 },
      ];
      setTut(step < 0 ? null : T[step]);
    },
    [touch, engine]
  );

  /* ------------------------------------------------ engine callbacks */
  useEffect(() => {
    engine.cb = {
      hud: (h) => {
        if (engine.mode !== "play") return;
        setHud(h);
        const tr = tutRef.current;
        if (tr) {
          const t = engine.run.time;
          if (tr.step === 3 && t - tr.t > 9) setStep(5);
          else if (tr.step === 5 && t - tr.t > 8) setStep(-1);
        }
      },
      over: (summary) => {
        if (engine.mode !== "play") return;
        const out = fold(summary);
        if (summary.routeId === 1 && !progressRef.current.tutorialDone) commit({ ...progressRef.current, tutorialDone: true });
        if (summary.result === "won") audio.victory();
        else audio.defeat();
        setBanner(null);
        setStep(-1);
        setSel(null);
        setEnd({ summary, out });
      },
    };
    if (TEST) window.__tc = { engine, view, audio, bus, get progress() { return progressRef.current; }, get fx() { return fx.current; } };
    return () => {
      if (TEST) delete window.__tc;
    };
  }, [engine, fold, view, bus, commit, setStep]);

  /* sound + banners + tutorial from journey events */
  useEffect(() => {
    let lastCrit = 0;
    const h = (ev) => {
      if (engine.mode !== "play") return;
      for (const e of ev) {
        switch (e.type) {
          case "fire":
            if (e.module === "gunner") audio.gunner(e.level);
            else if (e.module === "cannon") audio.cannon();
            else audio.lancer();
            break;
          case "impact":
            audio.hit(e.armored);
            break;
          case "explode":
            audio.cannonImpact(e.hits);
            break;
          case "enemySwing":
            audio.enemyAttack(e.kind);
            break;
          case "enemyShoot":
            audio.enemyShoot();
            break;
          case "carHit": {
            audio.armorHit(e.by === "vehicle" || e.by === "boss" || e.by === "armored");
            const c = engine.cars[e.car];
            if (c && c.kind === "loco" && c.hp / c.maxHp < 0.3 && engine.time - lastCrit > 6) {
              lastCrit = engine.time;
              audio.critical();
              showBanner({ kind: "danger", text: "LOCOMOTIVE CRITICAL", sub: "Select it and use emergency REPAIR" }, 2200);
            }
            break;
          }
          case "kill":
            if (e.vehicle) audio.vehicleDestroyed(e.boss);
            else audio.enemyDefeat();
            if (e.reward > 0) audio.scrap();
            if (tutRef.current && tutRef.current.step === 2) setStep(3);
            if (e.boss) showBanner({ kind: "win", text: `${BOSSES[e.enemy].name.toUpperCase()} DESTROYED`, sub: `+${e.reward} Scrap` }, 2600);
            break;
          case "scrap":
            if (e.why === "checkpoint") audio.scrap();
            break;
          case "build":
            audio.build();
            if (tutRef.current && tutRef.current.step <= 1) setStep(2);
            break;
          case "upgrade":
            audio.upgrade();
            break;
          case "sell":
            audio.ui();
            break;
          case "emergency":
          case "carRestored":
            audio.emergency();
            break;
          case "carDisabled":
            audio.wagonDown();
            showBanner({ kind: "danger", text: `WAGON ${e.car} DISABLED`, sub: "Its module is offline until repaired" }, 2000);
            break;
          case "warn":
            audio.warn();
            break;
          case "wave": {
            if (e.intro && ENEMIES[e.intro]) {
              showBanner({ kind: "intro", kicker: "NEW ENEMY", text: ENEMIES[e.intro].name.toUpperCase(), sub: ENEMIES[e.intro].blurb, icon: <EnemyIcon type={e.intro} size={34} /> }, 3600);
            } else if (e.final) showBanner({ kind: "danger", text: "FINAL ASSAULT", sub: "Hold the line — the destination is close" }, 2600);
            break;
          }
          case "bossWarn":
            audio.bossWarn();
            showBanner({ kind: "boss", kicker: BOSSES[e.boss].title, text: "HEAVY THREAT INCOMING", sub: BOSSES[e.boss].name, icon: <EnemyIcon type={e.boss} size={38} /> }, 3400);
            break;
          case "bossFire":
            audio.bossFire();
            break;
          case "bossEnrage":
            showBanner({ kind: "danger", text: "THE BOSS IS ENRAGED", sub: "Attacks come faster" }, 1800);
            break;
          case "bossSwitch":
            showBanner({ kind: "info", text: "BOSS SWITCHING SIDES", sub: "It is crossing behind the train" }, 1800);
            break;
          case "approach":
            showBanner({ kind: "info", kicker: "STATION AHEAD", text: e.name.toUpperCase() }, 2200);
            break;
          case "checkpoint":
            audio.checkpoint();
            if (e.unlock) showBanner({ kind: "unlock", kicker: "SUPPLY DROP", text: `${MODULES[e.unlock].name.toUpperCase()} UNLOCKED`, sub: MODULES[e.unlock].blurb, icon: <ModuleIcon type={e.unlock} size={36} /> }, 4200);
            else showBanner({ kind: "info", kicker: "CHECKPOINT", text: e.name.toUpperCase(), sub: e.bonus ? `+${e.bonus} Scrap supply` : null }, 2400);
            if (tutRef.current && tutRef.current.step <= 5 && engine.route.id === 1) setStep(4);
            break;
          case "depart":
            audio.whistle();
            if (tutRef.current && tutRef.current.step === 4) setStep(-1);
            break;
          case "finalResolved":
            showBanner({ kind: "win", text: "THE WAY IS CLEAR", sub: `${engine.route.to} ahead` }, 2600);
            break;
          case "victory":
          case "defeat":
            setSel(null);
            break;
          default:
        }
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, engine, showBanner, setStep]);

  /* storm thunder (visual lightning lives in <Lights>) */
  useEffect(() => {
    let last = 0;
    const id = setInterval(() => {
      if ((view.thunder || 0) !== last) {
        last = view.thunder || 0;
        if (screen === "play") audio.thunder();
      }
    }, 250);
    return () => clearInterval(id);
  }, [view, screen]);

  /* ------------------------------------------------ audio + settings */
  const soundOn = settings.sound && !muted;
  useEffect(() => {
    audio.setEnabled(soundOn);
  }, [soundOn]);
  const shownRegion = inPlay ? route.region : demoRegion;
  useEffect(() => {
    audio.setMusic(settings.music && !muted && !end && !paused, inPlay ? "battle" : "menu", shownRegion);
  }, [settings.music, muted, inPlay, shownRegion, end, paused]);

  const updateSettings = useCallback(
    (s) => {
      audio.unlock();
      audio.ui();
      commit({ ...progressRef.current, settings: s });
    },
    [commit]
  );

  /* ------------------------------------------------ flow */
  const resetRouteUi = () => {
    setEnd(null);
    setBanner(null);
    setPaused(false);
    setIngameSettings(false);
    setSel(null);
    setStep(-1);
  };

  const startRoute = useCallback(
    (id) => {
      const R = getRoute(id);
      if (!R || !isUnlocked(progressRef.current, id)) return;
      audio.unlock();
      abandon();
      resetRouteUi();
      engine.load(R);
      engine.setSpeed(progressRef.current.settings.speed);
      applied.current = false;
      setRouteId(id);
      setDemoRegion(R.region);
      setHud(engine.hud());
      setScreen("play");
      const k = regionOf(R.region);
      showBanner({ kind: "intro", kicker: `${k.name.toUpperCase()} · ROUTE ${R.id}`, text: R.name.toUpperCase(), sub: `${R.from} → ${R.to}` }, 2600);
      if (R.tutorial && !progressRef.current.tutorialDone) setStep(0);
      if (progressRef.current.lastRoute !== id) commit({ ...progressRef.current, lastRoute: id });
      audio.whistle();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon, commit, showBanner, setStep]
  );

  const toScreen = useCallback(
    (to, region) => {
      audio.unlock();
      audio.ui();
      abandon();
      resetRouteUi();
      setHud(null);
      const rg = region || demoRegion;
      if (to === "train") {
        const mods = progressRef.current.unlockedModules;
        engine.load(demoRoute(rg, 4), { showcase: true, modules: [{ type: mods.includes("cannon") ? "cannon" : "gunner", level: 3 }, { type: "gunner", level: 2 }, { type: mods.includes("lancer") ? "lancer" : "gunner", level: 1 }, { type: mods.includes("repair") ? "repair" : "gunner", level: 2 }] });
      } else if (engine.mode !== "demo" || engine.route?.region !== rg) engine.load(demoRoute(rg), { demo: true, modules: DEMO_MODULES });
      engine.setSpeed(1);
      setDemoRegion(rg);
      setScreen(to);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon, demoRegion]
  );

  const togglePause = useCallback(
    (p) => {
      if (!inPlay || end) return;
      audio.ui();
      setPaused(p);
      engine.setPaused(p);
      if (!p) setIngameSettings(false);
    },
    [engine, inPlay, end]
  );

  /* GamePlayer Restart → the current route from its starting state */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (inPlay) startRoute(routeId);
  }, [restartSignal, inPlay, routeId, startRoute]);

  /* hidden tab → suspend the clock and pause the route (no catch-up later) */
  useEffect(() => {
    const vis = () => {
      const hidden = document.visibilityState === "hidden" && !TEST;
      engine.setHidden(hidden);
      if (hidden && engine.mode === "play" && engine.active) {
        setPaused(true);
        engine.setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [engine]);

  /* ------------------------------------------------ actions */
  const fail = useCallback((r) => {
    if (r.reason === "scrap") {
      audio.error();
      setScrapFlash((n) => n + 1);
    } else if (r.reason === "cooldown" || r.reason === "full" || r.reason === "occupied" || r.reason === "max") audio.error();
  }, []);
  const can = () => inPlay && !paused && !end;
  const selectCar = useCallback(
    (i) => {
      if (!inPlay || end) return;
      audio.ui();
      setSel(i);
      if (i != null && tutRef.current && tutRef.current.step === 0 && engine.cars[i]?.kind === "wagon") setStep(1);
    },
    [inPlay, end, engine, setStep]
  );
  const build = useCallback(
    (i, type) => {
      if (!can()) return;
      audio.unlock();
      const r = engine.buildModule(i, type);
      if (!r.ok) fail(r);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, inPlay, paused, end, fail]
  );
  const upgrade = useCallback(
    (i) => {
      if (!can()) return;
      const r = engine.upgradeModule(i);
      if (!r.ok) fail(r);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, inPlay, paused, end, fail]
  );
  const sell = useCallback(
    (i) => {
      if (!can()) return;
      const r = engine.sellModule(i);
      if (!r.ok) fail(r);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, inPlay, paused, end, fail]
  );
  const repair = useCallback(
    (i) => {
      if (!can()) return;
      const r = engine.emergencyRepair(i);
      if (!r.ok) fail(r);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, inPlay, paused, end, fail]
  );
  const toggleSpeed = useCallback(() => {
    if (!inPlay || end) return;
    audio.ui();
    engine.setSpeed(engine.speed === 2 ? 1 : 2);
  }, [engine, inPlay, end]);
  const depart = useCallback(() => {
    if (!can()) return;
    audio.ui();
    engine.depart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, inPlay, paused, end]);

  /* keyboard: 1-4 build · U upgrade · R repair · [ ] cars · S speed · P/Esc pause · Space continue */
  useEffect(() => {
    const key = (e) => {
      if (!inPlay) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.repeat) return;
      if (e.code === "Escape") {
        if (ingameSettings) setIngameSettings(false);
        else if (sel != null && !paused) setSel(null);
        else togglePause(!paused);
        return;
      }
      if (e.code === "KeyP") return togglePause(!paused);
      if (paused || end) return;
      if (e.code === "KeyS") toggleSpeed();
      else if (e.code === "BracketRight" || e.code === "BracketLeft" || e.code === "Tab") {
        e.preventDefault();
        const n = engine.cars.length;
        const d = e.code === "BracketLeft" || (e.code === "Tab" && e.shiftKey) ? -1 : 1;
        selectCar(sel == null ? 1 % n : (sel + d + n) % n);
      } else if (e.code === "Space" && engine.checkpoint && engine.checkpoint.arrived) {
        e.preventDefault();
        depart();
      } else if (sel != null) {
        if (/^Digit[1-4]$/.test(e.code)) build(sel, MODULE_IDS[+e.code.slice(5) - 1]);
        else if (e.code === "KeyU") upgrade(sel);
        else if (e.code === "KeyR") repair(sel);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [inPlay, paused, end, ingameSettings, sel, togglePause, toggleSpeed, selectCar, build, upgrade, repair, depart, engine]);

  /* ------------------------------------------------ render */
  const mode = screen === "train" ? "garage" : inPlay ? "play" : screen === "routes" ? "map" : "menu";
  const q = settings.graphics;
  const dpr = q === "low" ? [0.75, 1] : q === "high" ? [1, 2] : [1, 1.5];
  const hasNext = end && getRoute(route.id + 1) && isUnlocked(progress, route.id + 1);
  const sceneRegion = inPlay ? route.region : demoRegion;
  const atmo = useMemo(() => atmosphere(regionOf(sceneRegion), inPlay ? route.time : "day", inPlay ? route.weather : "clear"), [sceneRegion, inPlay, route.time, route.weather]);
  const seed = inPlay ? route.id : 900 + sceneRegion;
  const settingsMemo = useMemo(() => settings, [settings]);
  const pal = liveryOf(progress.selectedCosmetic);
  const twin = inPlay && route.id === 30;
  const onSelect = useCallback((i) => selectCar(i), [selectCar]);
  const selCar = hud && sel != null ? hud.cars[sel] : null;

  return (
    <div className={`tc${inPlay ? " tc--play" : ""}${compact ? " tc--compact" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"} onContextMenu={(e) => e.preventDefault()}>
      <div className="tc-stage" ref={stageRef}>
        {webgl ? (
          <SceneErrorBoundary
            key={canvasKey}
            fallback={(msg, retry) => (
              <div className="tc-glfail" role="alert">
                <strong>The 3D view stopped</strong>
                <span>{msg}</span>
                <button type="button" className="tc-btn tc-btn--primary" onClick={() => (retry(), setCanvasKey((k) => k + 1))}>
                  RETRY
                </button>
              </div>
            )}
          >
            <Canvas
              className="tc-canvas"
              frameloop={frameloop}
              dpr={dpr}
              shadows={settings.shadows && q !== "low"}
              gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
              camera={{ fov: 38, position: [30, 8, 22], near: 0.3, far: 1200 }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
              }}
              onPointerMissed={() => inPlay && sel != null && setSel(null)}
            >
              <Scene3D
                engine={engine}
                view={view}
                bus={bus}
                fx={fx}
                envRef={envRef}
                layer={layerRef}
                edgeLayer={edgeRef}
                panelRef={panelRef}
                region={sceneRegion}
                atmo={atmo}
                settings={settingsMemo}
                mode={mode}
                seed={seed}
                pal={pal}
                selected={sel}
                onSelect={onSelect}
                compact={compact}
                garage={garage}
                twin={twin}
                soundOn={soundOn}
              />
            </Canvas>
          </SceneErrorBoundary>
        ) : (
          <div className="tc-glfail" role="alert">
            <strong>3D graphics are not available</strong>
            <span>Train Commander needs WebGL 2. Enable hardware acceleration in your browser settings and reload.</span>
          </div>
        )}
        {webgl && canvasStuck && (
          <div className="tc-glfail tc-glfail--soft" role="alert">
            <strong>The 3D view has not started</strong>
            <button type="button" className="tc-btn tc-btn--primary" onClick={() => setCanvasKey((k) => k + 1)}>
              RETRY
            </button>
          </div>
        )}
      </div>
      <div className="tc-floats" ref={layerRef} aria-hidden="true" />
      <div className="tc-edges" ref={edgeRef} aria-hidden="true" style={{ display: inPlay && !end && !paused ? "block" : "none" }} />
      {!inPlay && <div className={`tc-vignette is-${screen}`} aria-hidden="true" />}

      {inPlay && hud && (
        <>
          <TopBar hud={hud} route={route} onPause={() => togglePause(true)} onSpeed={toggleSpeed} flash={scrapFlash} />
          {!end && <BossBar boss={hud.boss} />}
          {!end && <Banner banner={banner} />}
          {!end && !paused && <CheckpointBar cp={hud.checkpoint} onContinue={depart} />}
          {!end && !paused && <Hint text={tut?.text} />}
          {!end && <CarStrip hud={hud} selected={sel} onSelect={selectCar} highlight={tut?.hlCar} />}
          {!end && selCar && <WagonPanel hud={hud} index={sel} onBuild={build} onUpgrade={upgrade} onSell={sell} onRepair={repair} onClose={() => setSel(null)} panelRef={panelRef} compact={compact} tutorialHl={tut?.hlMod} />}
        </>
      )}

      {inPlay && paused && !end && !ingameSettings && (
        <PauseOverlay
          onResume={() => togglePause(false)}
          onRestart={() => startRoute(routeId)}
          onSettings={() => (audio.ui(), setIngameSettings(true))}
          onQuit={() => {
            setMapSel(route.id);
            toScreen("routes", route.region);
          }}
        />
      )}
      {inPlay && paused && ingameSettings && <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => (audio.ui(), setIngameSettings(false))} inGame />}

      {inPlay && end && (
        <ResultOverlay
          end={end}
          route={route}
          hasNext={hasNext}
          onNext={() => startRoute(route.id + 1)}
          onReplay={() => startRoute(route.id)}
          onRoutes={() => {
            const id = hasNext ? route.id + 1 : route.id;
            setMapSel(id);
            toScreen("routes", getRoute(id).region);
          }}
        />
      )}

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => startRoute(nextRouteId(progressRef.current))}
          onRoutes={() => {
            setMapSel(nextRouteId(progressRef.current));
            toScreen("routes");
          }}
          onTrain={() => toScreen("train")}
          onStats={() => toScreen("stats")}
          onSettings={() => toScreen("settings")}
        />
      )}
      {screen === "routes" && (
        <RoutesScreen
          progress={progress}
          selected={mapSel}
          onSelect={(id) => {
            audio.ui();
            setMapSel(id);
          }}
          onPlay={startRoute}
          onBack={() => toScreen("menu")}
        />
      )}
      {screen === "train" && (
        <TrainScreen
          progress={progress}
          module={showModule}
          onModule={(m) => {
            audio.ui();
            setShowModule(m);
          }}
          livery={progress.selectedCosmetic}
          onLivery={(id) => {
            audio.ui();
            commit({ ...progressRef.current, selectedCosmetic: id });
          }}
          onBack={() => toScreen("menu")}
          garage={garage}
        />
      )}
      {screen === "stats" && <StatsScreen progress={progress} onBack={() => toScreen("menu")} />}
      {screen === "settings" && <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => toScreen("menu")} />}
    </div>
  );
}
