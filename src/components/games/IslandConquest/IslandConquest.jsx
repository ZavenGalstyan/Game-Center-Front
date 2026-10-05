/**
 * Island Conquest — real-time island territory strategy for the Game Center
 * (React Three Fiber + Three.js). Registered by name in ../registry.js.
 *
 * ONE <Canvas> stays mounted for the whole session. Menus show a live demo
 * battle (three AI fleets) behind them. The battle engine (engine/engine.js)
 * is the single authoritative state and is ticked by ONE useFrame
 * (three/Scene.jsx → <Driver>), never by React or by timers.
 *
 * Input: click/tap one of your islands, then a target — or drag from your
 * island to the target. Picking is screen-space against the projected
 * island positions (three/Scene.jsx → <Labels> fills `view.picks`), so it is
 * generous on touch screens. Every order is validated by the engine at the
 * moment it executes.
 *
 * Shared controls:
 *   restartSignal  restarts the CURRENT level from its starting state (islands,
 *                  troops, fleets, AI, clock, selection, result) — saved
 *                  progress is untouched. Ignored on menu screens.
 *   muted          silences every sound, the ocean bed and the music at once.
 *   Fullscreen     only resizes the canvas; the battle keeps running as is.
 * Progress: localStorage `island-conquest-progress` (see utils/storage.js).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import "./IslandConquest.css";
import { Engine } from "./engine/engine.js";
import { PLAYER, NEUTRAL, ISLAND_TYPES, FACTION_INFO, isEnemy } from "./engine/constants.js";
import { audio } from "./audio/audio.js";
import { LEVELS, getLevel, DEMO_LEVEL } from "./data/levels.js";
import { regionOf } from "./data/regions.js";
import { validateLevels } from "./data/validate.js";
import { loadProgress, saveProgress, applyResult, isUnlocked, nextLevelId } from "./utils/storage.js";
import { Driver, CameraRig, SkyDome, Lights, Ocean, Islands, Fleets, RouteDots, Bursts, Clouds, Birds, Labels } from "./three/Scene.jsx";
import { frameloop, glTest, Sizer, TEST } from "./three/testHooks.js";
import { hasWebGL, useCanvasWatchdog, SceneErrorBoundary } from "./three/CanvasGuard.jsx";
import { TopBar, SendBar, Hint, Banner, PauseOverlay, ResultOverlay } from "./screens/Hud.jsx";
import { MainMenu, LevelsScreen, IslandsScreen, StatsScreen, SettingsScreen } from "./screens/Menus.jsx";

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

if (import.meta.env.DEV) {
  const issues = validateLevels(LEVELS);
  if (issues.length) console.warn("[IslandConquest] level validation:", issues);
}

/** one-island world for the Islands codex (same shape the scene reads) */
function showcaseWorld(type) {
  const i = { id: "show", idx: 0, type, x: 0, z: 0, r: ISLAND_TYPES[type].r * 1.0, owner: PLAYER, troops: 48, cap: 60, variant: 11, capturedAt: null };
  return { islands: [i], byId: new Map([["show", i]]), fleets: [], mode: "show", run: null };
}

function Scene3D({ engine, world, gen, view, ui, bus, theme, settings, mode, layer, labelH }) {
  const q = settings.graphics;
  const water = settings.water;
  const shadows = settings.shadows && q !== "low";
  const motion = settings.cameraMotion && !settings.reducedMotion;
  return (
    <>
      <Driver engine={engine} bus={bus} ui={ui} />
      <Sizer />
      <color attach="background" args={[theme.fog]} />
      <fog attach="fog" args={[theme.fog, theme.fogNear, theme.fogFar]} />
      <SkyDome th={theme} />
      <Lights th={theme} shadows={shadows} quality={q} />
      <Ocean world={world} th={theme} quality={water} ui={ui} gen={gen} />
      <Islands world={world} th={theme} quality={q} gen={gen} shadows={shadows} labelH={labelH} ui={ui} />
      <Fleets world={world} quality={water} bus={bus} settings={settings} />
      <RouteDots world={world} ui={ui} quality={water} />
      <Bursts world={world} bus={bus} settings={settings} labelH={labelH} />
      {mode !== "islands" && <Clouds th={theme} quality={q} mode={mode} />}
      {mode !== "battle" && mode !== "islands" && <Birds quality={q} reduced={settings.reducedMotion} />}
      <Labels world={world} layer={layer} ui={ui} view={view} gen={gen} labelH={labelH} visible={mode === "battle"} />
      <CameraRig mode={mode} view={view} motion={motion} world={world} gen={gen} labelH={labelH} />
    </>
  );
}

export default function IslandConquest({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const [webgl] = useState(hasWebGL);
  const [canvasKey, setCanvasKey] = useState(0);
  const canvasStuck = useCanvasWatchdog(stageRef);
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;
  const view = useRef({ picks: [], camera: null }).current;
  const ui = useRef({ selected: null, target: null, drag: null, frac: 0.5, warn: new Set(), shore: new Map(), onSelectionLost: null }).current;
  const bus = useRef({ handlers: new Set() }).current;
  const labelH = useRef(new Map());

  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const settings = progress.settings;
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(1);
  const [mapRegion, setMapRegion] = useState(() => getLevel(nextLevelId(loadProgress()))?.region || 1);
  const [mapSel, setMapSel] = useState(null);
  const [showType, setShowType] = useState("medium");
  const [gen, setGen] = useState(0);
  const [hud, setHud] = useState(null);
  const [paused, setPaused] = useState(false);
  const [end, setEnd] = useState(null);
  const [banner, setBanner] = useState(null);
  const [tut, setTut] = useState(null);
  const [frac, setFrac] = useState(0.5);
  const [speed, setSpeedState] = useState(1);
  const [ingameSettings, setIngameSettings] = useState(false);
  const [touch] = useState(isTouch);
  const [hoverCursor, setHoverCursor] = useState(false);
  const applied = useRef(true);
  const inPlay = screen === "play";
  const level = getLevel(levelId) || LEVELS[0];

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ------------------------------------------------ boot: menu demo */
  const loadDemo = useCallback(
    (region) => {
      engine.load({ ...DEMO_LEVEL, region }, { demo: true });
      engine.setSpeed(1);
      ui.selected = null;
      ui.target = null;
      ui.drag = null;
      setGen((g) => g + 1);
    },
    [engine, ui]
  );
  useEffect(() => {
    loadDemo(mapRegion);
    return () => {
      engine.unload();
      audio.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  /* ------------------------------------------------ fold a battle once */
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
  /** leaving a battle part-way counts it as played (only if anything happened) */
  const abandon = useCallback(() => {
    if (applied.current || engine.mode !== "play") return;
    const r = engine.run;
    applied.current = true;
    if (r.time < 8 && !r.fleetsSent) return;
    const out = applyResult(progressRef.current, { result: "abandoned", levelId: engine.level.id, stars: 0, time: r.time, run: { ...r } });
    commit(out.progress);
  }, [engine, commit]);

  /* ------------------------------------------------ banners */
  const bannerTimer = useRef(0);
  const showBanner = useCallback((b, ms = 2000) => {
    clearTimeout(bannerTimer.current);
    setBanner({ ...b, key: Date.now() + Math.random() });
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  /* ------------------------------------------------ tutorial (level 1) */
  const tutRef = useRef(null); // { step, t }
  const setStep = useCallback(
    (step) => {
      tutRef.current = step < 0 ? null : { step, t: engine.run.time };
      const T = [
        "Your islands generate troops — watch the number grow.",
        touch ? "Tap your island (teal flag) to select it." : "Click your island (teal flag) to select it.",
        touch ? "Now tap the neutral island to send troops." : "Now click the neutral island to send troops.",
        "Capture every enemy island to win!",
      ];
      setTut(step < 0 ? null : T[step]);
    },
    [engine, touch]
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
          if (tr.step === 0 && t - tr.t > 3.5) setStep(1);
          else if (tr.step === 3 && t - tr.t > 6) setStep(-1);
        }
      },
      over: (summary) => {
        if (engine.mode !== "play") return;
        const out = fold(summary);
        if (summary.levelId === 1 && !progressRef.current.tutorialDone) commit({ ...progressRef.current, tutorialDone: true });
        if (summary.result === "won") audio.victory();
        else audio.defeat();
        ui.selected = null;
        ui.target = null;
        ui.drag = null;
        setBanner(null);
        setStep(-1);
        setEnd({ summary, out });
      },
    };
    ui.onSelectionLost = () => {
      audio.error();
      showBanner({ kind: "lose", text: "SELECTED ISLAND LOST" }, 1300);
    };
    if (TEST) window.__ic = { engine, view, ui, audio, bus, get progress() { return progressRef.current; } };
    return () => {
      if (TEST) delete window.__ic;
    };
  }, [engine, fold, view, ui, bus, commit, setStep, showBanner]);

  /* sound + banners from battle events */
  useEffect(() => {
    const h = (ev) => {
      if (engine.mode !== "play") return;
      for (const e of ev) {
        switch (e.type) {
          case "launch":
            if (e.owner === PLAYER) audio.launch(e.troops >= 25);
            else if (e.targetOwner === PLAYER) audio.warning();
            else audio.enemyLaunch();
            break;
          case "arrive":
            audio.arrive();
            if (e.kind === "reinforce") {
              if (e.owner === PLAYER) audio.reinforce();
            } else audio.battle(e.troops >= 25);
            break;
          case "capture":
            if (e.to === PLAYER) audio.capture();
            else if (e.from === PLAYER) {
              audio.lost();
              showBanner({ kind: "lose", text: "ISLAND LOST" }, 1400);
            } else audio.enemyCapture();
            break;
          case "eliminated":
            if (isEnemy(e.faction) && engine.factionsInLevel.filter(isEnemy).length > 1) showBanner({ kind: "win", text: `${FACTION_INFO[e.faction].name.toUpperCase()} DEFEATED` }, 2000);
            break;
          default:
        }
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, engine, showBanner]);

  /* ------------------------------------------------ audio + settings */
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);
  const shownRegion = inPlay ? level.region : mapRegion;
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
  const resetBattleUi = () => {
    setEnd(null);
    setBanner(null);
    setPaused(false);
    setIngameSettings(false);
    setStep(-1);
    ui.selected = null;
    ui.target = null;
    ui.drag = null;
    ptr.current = null;
  };

  const startLevel = useCallback(
    (id) => {
      const L = getLevel(id);
      if (!L || !isUnlocked(progressRef.current, id)) return;
      audio.unlock();
      abandon();
      resetBattleUi();
      engine.load(L);
      const sp = progressRef.current.settings.speed;
      engine.setSpeed(sp);
      setSpeedState(engine.speed);
      applied.current = false;
      setLevelId(id);
      setMapRegion(L.region);
      setGen((g) => g + 1);
      setHud(engine.hud());
      setScreen("play");
      const R = regionOf(L.region);
      showBanner({ kind: "intro", kicker: `${R.name.toUpperCase()} · LEVEL ${L.id}`, text: L.name.toUpperCase(), sub: L.intro || null }, L.intro ? 3400 : 2200);
      if (L.tutorial && !progressRef.current.tutorialDone) setStep(0);
      if (progressRef.current.lastPlayedLevel !== id) commit({ ...progressRef.current, lastPlayedLevel: id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon, commit, showBanner, setStep]
  );

  const toScreen = useCallback(
    (to, region) => {
      audio.unlock();
      audio.ui();
      abandon();
      resetBattleUi();
      setHud(null);
      const r = region || mapRegion;
      if (engine.mode !== "demo" || engine.level?.region !== r) loadDemo(r);
      else if (to !== "islands" && screen === "islands") setGen((g) => g + 1);
      setScreen(to);
      if (to === "islands") setGen((g) => g + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon, mapRegion, loadDemo, screen]
  );

  const togglePause = useCallback(
    (p) => {
      if (!inPlay || end) return;
      audio.ui();
      setPaused(p);
      engine.setPaused(p);
      if (p) {
        ui.drag = null;
        ptr.current = null;
      } else setIngameSettings(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, inPlay, end]
  );

  /* GamePlayer Restart → the current level from its starting state */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (inPlay) startLevel(levelId);
  }, [restartSignal, inPlay, levelId, startLevel]);

  /* hidden tab → suspend the clock and pause the battle */
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

  /* ------------------------------------------------ orders */
  const setSendFrac = useCallback(
    (v) => {
      audio.ui();
      ui.frac = v;
      setFrac(v);
    },
    [ui]
  );
  const toggleSpeed = useCallback(() => {
    if (!inPlay || end) return;
    audio.ui();
    engine.setSpeed(engine.speed === 2 ? 1 : 2);
    setSpeedState(engine.speed);
  }, [engine, inPlay, end]);

  const order = useCallback(
    (from, to) => {
      const r = engine.send(PLAYER, from, to, { fraction: ui.frac });
      if (!r.ok) {
        audio.error();
        if (r.reason === "empty") showBanner({ kind: "info", text: "NO TROOPS TO SEND" }, 1000);
        else if (r.reason === "owner") ui.selected = null;
        return false;
      }
      const tr = tutRef.current;
      if (tr && tr.step <= 2) setStep(3);
      return true;
    },
    [engine, ui, showBanner, setStep]
  );

  const select = useCallback(
    (id) => {
      ui.selected = id;
      audio.select();
      const tr = tutRef.current;
      if (tr && tr.step <= 1) setStep(2);
    },
    [ui, setStep]
  );

  /* ------------------------------------------------ pointer input */
  const ptr = useRef(null);
  const local = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pickAt = useCallback(
    (p) => {
      let best = null;
      let bd = Infinity;
      for (const k of view.picks) {
        const d = Math.hypot(p.x - k.x, p.y - k.y);
        const dl = Math.hypot(p.x - k.lx, p.y - (k.ly - 14));
        const hit = d < k.rad ? d / k.rad : dl < 26 ? dl / 26 : Infinity;
        if (hit < bd) {
          bd = hit;
          best = k.id;
        }
      }
      return best;
    },
    [view]
  );
  const toWorld = useCallback(
    (p) => {
      const cam = view.camera;
      const s = view.size;
      if (!cam || !s) return null;
      const v = new THREE.Vector3((p.x / s.w) * 2 - 1, -(p.y / s.h) * 2 + 1, 0.5).unproject(cam);
      const dir = v.sub(cam.position).normalize();
      if (Math.abs(dir.y) < 1e-4) return null;
      const t = -cam.position.y / dir.y;
      return t > 0 ? { x: cam.position.x + dir.x * t, z: cam.position.z + dir.z * t } : null;
    },
    [view]
  );
  const canAct = inPlay && !paused && !end;

  const onPointerDown = (e) => {
    if (!canAct || e.button > 0) return;
    audio.unlock();
    const p = local(e);
    const id = pickAt(p);
    ptr.current = { id, x: p.x, y: p.y, moved: false, type: e.pointerType };
    const isl = id ? engine.island(id) : null;
    ui.drag = isl && isl.owner === PLAYER ? { from: id, active: false, wx: null, wz: null } : null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
  };
  const onPointerMove = (e) => {
    if (!canAct) return;
    const p = local(e);
    const P = ptr.current;
    const id = pickAt(p);
    if (e.pointerType === "mouse" || (P && P.moved)) {
      ui.target = id;
      const over = !!id;
      if (over !== hoverCursor) setHoverCursor(over);
    }
    if (!P) return;
    if (!P.moved && Math.hypot(p.x - P.x, p.y - P.y) > 12) {
      P.moved = true;
      if (ui.drag) {
        ui.drag.active = true;
        if (ui.selected !== ui.drag.from) select(ui.drag.from);
      }
    }
    if (ui.drag && ui.drag.active) {
      const w = toWorld(p);
      if (w) {
        ui.drag.wx = w.x;
        ui.drag.wz = w.z;
      }
    }
  };
  const onPointerUp = (e) => {
    const P = ptr.current;
    ptr.current = null;
    if (!P || !canAct) {
      ui.drag = null;
      return;
    }
    const p = local(e);
    const id = pickAt(p);
    const drag = ui.drag;
    ui.drag = null;
    if (e.pointerType !== "mouse") ui.target = null;
    if (drag && drag.active) {
      if (id && id !== drag.from) order(drag.from, id);
      return;
    }
    // click / tap
    if (!id) {
      if (ui.selected) {
        ui.selected = null;
        audio.deselect();
      }
      return;
    }
    const isl = engine.island(id);
    if (ui.selected && ui.selected !== id) {
      order(ui.selected, id);
      return;
    }
    if (ui.selected === id) {
      ui.selected = null;
      audio.deselect();
      return;
    }
    if (isl && isl.owner === PLAYER) select(id);
    else {
      audio.error();
      showBanner({ kind: "info", text: touch ? "TAP ONE OF YOUR ISLANDS FIRST" : "SELECT ONE OF YOUR ISLANDS FIRST" }, 1100);
    }
  };
  const onPointerCancel = () => {
    ptr.current = null;
    ui.drag = null;
  };
  const onPointerLeave = (e) => {
    if (e.pointerType === "mouse" && !ptr.current) ui.target = null;
  };

  /* keyboard: 1-3 send size · S speed · P/Esc pause · Esc deselect */
  useEffect(() => {
    const key = (e) => {
      if (!inPlay) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.repeat) return;
      if (e.code === "Escape" && ui.selected && !paused && !end) {
        ui.selected = null;
        audio.deselect();
        return;
      }
      if (e.code === "Escape" || e.code === "KeyP") {
        if (ingameSettings) setIngameSettings(false);
        else togglePause(!paused);
        return;
      }
      if (paused || end) return;
      if (e.code === "Digit1") setSendFrac(0.25);
      else if (e.code === "Digit2") setSendFrac(0.5);
      else if (e.code === "Digit3") setSendFrac(1);
      else if (e.code === "KeyS") toggleSpeed();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [inPlay, paused, end, ingameSettings, togglePause, setSendFrac, toggleSpeed, ui]);

  /* ------------------------------------------------ render */
  const mode = screen === "islands" ? "islands" : inPlay ? "battle" : screen === "levels" ? "map" : "menu";
  const q = settings.graphics;
  const dpr = q === "low" ? [0.75, 1] : q === "high" ? [1, 2] : [1, 1.5];
  const hasNext = end && getLevel(level.id + 1) && isUnlocked(progress, level.id + 1);
  const theme = regionOf(inPlay ? level.region : mapRegion).theme;
  const settingsMemo = useMemo(() => settings, [settings]);
  const world = useMemo(() => (screen === "islands" ? showcaseWorld(showType) : engine), [screen, showType, engine]);
  const sceneGen = screen === "islands" ? `show-${showType}-${gen}` : gen;

  return (
    <div className={`ic${inPlay ? " ic--play" : ""}${hoverCursor && canAct ? " is-pointing" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"} onContextMenu={(e) => e.preventDefault()}>
      <div className="ic-stage" ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onPointerLeave={onPointerLeave}>
        {webgl ? (
          <SceneErrorBoundary
            key={`${canvasKey}-${settings.shadows && q !== "low" ? "s" : "n"}`}
            fallback={(msg, retry) => (
              <div className="ic-glfail" role="alert">
                <strong>The 3D view stopped</strong>
                <span>{msg}</span>
                <button type="button" className="ic-btn ic-btn--primary" onClick={() => (retry(), setCanvasKey((k) => k + 1))}>
                  RETRY
                </button>
              </div>
            )}
          >
            <Canvas
              className="ic-canvas"
              frameloop={frameloop}
              dpr={dpr}
              shadows={settings.shadows && q !== "low"}
              gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
              camera={{ fov: 36, position: [0, 30, 30], near: 0.5, far: 700 }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.0;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
              }}
            >
              <Scene3D engine={engine} world={world} gen={sceneGen} view={view} ui={ui} bus={bus} theme={theme} settings={settingsMemo} mode={mode} layer={layerRef} labelH={labelH} />
            </Canvas>
          </SceneErrorBoundary>
        ) : (
          <div className="ic-glfail" role="alert">
            <strong>3D graphics are not available</strong>
            <span>Island Conquest needs WebGL 2. Enable hardware acceleration in your browser settings and reload.</span>
          </div>
        )}
        {webgl && canvasStuck && (
          <div className="ic-glfail ic-glfail--soft" role="alert">
            <strong>The 3D view has not started</strong>
            <button type="button" className="ic-btn ic-btn--primary" onClick={() => setCanvasKey((k) => k + 1)}>
              RETRY
            </button>
          </div>
        )}
        <div className="ic-labels" ref={layerRef} aria-hidden="true" />
      </div>
      {!inPlay && <div className={`ic-vignette is-${screen}`} aria-hidden="true" />}

      {inPlay && hud && (
        <>
          <TopBar hud={hud} level={level} speed={speed} onPause={() => togglePause(true)} onSpeed={toggleSpeed} />
          {!end && <SendBar frac={frac} onFrac={setSendFrac} />}
          {!end && <Banner banner={banner} />}
          {!end && !paused && <Hint text={tut} />}
        </>
      )}

      {inPlay && paused && !end && !ingameSettings && (
        <PauseOverlay
          onResume={() => togglePause(false)}
          onRestart={() => startLevel(levelId)}
          onSettings={() => (audio.ui(), setIngameSettings(true))}
          onQuit={() => {
            setMapSel(level.id);
            setMapRegion(level.region);
            toScreen("levels", level.region);
          }}
        />
      )}
      {inPlay && paused && ingameSettings && <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => (audio.ui(), setIngameSettings(false))} inGame />}

      {inPlay && end && (
        <ResultOverlay
          end={end}
          level={level}
          hasNext={hasNext}
          onNext={() => startLevel(level.id + 1)}
          onReplay={() => startLevel(level.id)}
          onLevels={() => {
            const id = hasNext ? level.id + 1 : level.id;
            const rr = getLevel(id).region;
            setMapSel(id);
            setMapRegion(rr);
            toScreen("levels", rr);
          }}
        />
      )}

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => startLevel(nextLevelId(progressRef.current))}
          onLevels={() => {
            const id = nextLevelId(progressRef.current);
            const rr = getLevel(id).region;
            setMapSel(id);
            setMapRegion(rr);
            toScreen("levels", rr);
          }}
          onIslands={() => toScreen("islands")}
          onStats={() => toScreen("stats")}
          onSettings={() => toScreen("settings")}
        />
      )}
      {screen === "levels" && (
        <LevelsScreen
          progress={progress}
          region={mapRegion}
          selected={mapSel}
          onRegion={(r) => {
            audio.ui();
            setMapRegion(r);
            setMapSel(null);
            loadDemo(r);
          }}
          onSelect={(id) => {
            audio.ui();
            setMapSel(id);
          }}
          onPlay={startLevel}
          onBack={() => toScreen("menu")}
        />
      )}
      {screen === "islands" && (
        <IslandsScreen
          progress={progress}
          type={showType}
          onType={(t) => {
            audio.ui();
            setShowType(t);
          }}
          onBack={() => toScreen("menu")}
        />
      )}
      {screen === "stats" && <StatsScreen progress={progress} onBack={() => toScreen("menu")} />}
      {screen === "settings" && <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => toScreen("menu")} />}
    </div>
  );
}
