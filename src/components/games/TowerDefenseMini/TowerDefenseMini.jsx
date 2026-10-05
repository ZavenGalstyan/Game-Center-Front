/**
 * Tower Defense Mini — 3D tower defense for the Game Center (React Three
 * Fiber + Three.js). Registered by name in ../registry.js.
 *
 * ONE <Canvas> stays mounted for the whole session. Menus show a live demo
 * battle behind them; the battle engine (engine/engine.js) is ticked by a
 * single useFrame (three/Scene.jsx → <Driver>) and never by React.
 *
 * Shared controls:
 *   restartSignal  restarts the CURRENT battle from its starting state (towers,
 *                  coins, lives, waves, enemies, projectiles) — saved progress
 *                  is untouched. Ignored on menu screens.
 *   muted          silences every sound and the music immediately.
 *   Fullscreen     only resizes the canvas; the battle keeps running as is.
 * Progress: localStorage `tower-defense-mini-progress` (see utils/storage.js).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import "./TowerDefenseMini.css";
import { Engine } from "./engine/engine.js";
import { buildPath } from "./engine/path.js";
import { audio } from "./audio/audio.js";
import { LEVELS, getLevel, levelsOfWorld } from "./data/levels.js";
import { worldOf } from "./data/worlds.js";
import { loadProgress, saveProgress, applyRun, isUnlocked, nextLevelId } from "./utils/storage.js";
import { Driver, CameraRig, Lights, Ground, Backdrop, Water, Props, Base, Gates, Pads, Towers, Enemies, Projectiles, Effects, RangeRings, Floaters, Showcase, levelBounds } from "./three/Scene.jsx";
import { frameloop, glTest, Sizer, TEST } from "./three/testHooks.js";
import { hasWebGL, useCanvasWatchdog, SceneErrorBoundary } from "./three/CanvasGuard.jsx";
import { TopBar, WaveButton, BuildMenu, TowerPanel, Banner, Hint, PauseOverlay, ResultOverlay } from "./screens/Hud.jsx";
import { MainMenu, LevelSelect, TowersScreen, Statistics, Settings } from "./screens/Menus.jsx";

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const firstOfWorld = (w) => levelsOfWorld(w)[0] || LEVELS[0];

function Scene3D({ engine, view, bus, fx, level, settings, mode, showcase, layer }) {
  const world = worldOf(level);
  const paths = useMemo(() => level.paths.map(buildPath), [level]);
  const bounds = useMemo(() => levelBounds(level, paths), [level, paths]);
  const center = useMemo(() => [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2], [bounds]);
  const q = settings.graphics;
  const shadows = q !== "low";
  const motion = settings.cameraMotion && !settings.reducedMotion;
  return (
    <>
      <Driver engine={engine} bus={bus} />
      <Sizer />
      <color attach="background" args={[world.sky]} />
      <fog attach="fog" args={[world.fog, 38, 95]} />
      <Lights world={world} shadows={shadows} quality={q} center={center} />
      <Ground level={level} world={world} paths={paths} quality={q} />
      <Backdrop world={world} center={center} />
      <Water level={level} world={world} />
      <Props level={level} world={world} paths={paths} quality={q} />
      <Gates level={level} world={world} />
      <Base level={level} world={world} bus={bus} view={view} />
      <Pads engine={engine} view={view} level={level} />
      <Towers engine={engine} view={view} />
      <Enemies engine={engine} world={world} view={view} />
      <Projectiles engine={engine} fx={fx} settings={settings} />
      <Effects engine={engine} bus={bus} settings={settings} fx={fx} view={view} />
      <RangeRings view={view} />
      <Floaters bus={bus} layer={layer} settings={settings} engine={engine} />
      {mode === "showcase" && <Showcase type={showcase.type} level={showcase.level} world={world} />}
      <CameraRig engine={engine} view={view} mode={mode} bounds={bounds} motion={motion} />
    </>
  );
}

export default function TowerDefenseMini({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const layerRef = useRef(null);
  const [webgl] = useState(hasWebGL);
  const [canvasKey, setCanvasKey] = useState(0);
  const canvasStuck = useCanvasWatchdog(stageRef);
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;
  const view = useRef({ hoverSpot: -1, selSpot: -1, selTower: null, range: null, range2: null, shake: 0 }).current;
  const bus = useRef({ handlers: new Set() }).current;
  const fx = useRef(null);

  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const settings = progress.settings;
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(1);
  const [sceneLevelId, setSceneLevelId] = useState(1);
  const [menuWorld, setMenuWorld] = useState(() => getLevel(nextLevelId(loadProgress()))?.world || 1);
  const [levelSel, setLevelSel] = useState(null);
  const [showcase, setShowcase] = useState({ type: "archer", level: 1 });
  const [hud, setHud] = useState(null);
  const [sel, setSel] = useState(null); // {kind:'spot', i} | {kind:'tower', id}
  const [paused, setPaused] = useState(false);
  const [end, setEnd] = useState(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ingameSettings, setIngameSettings] = useState(false);
  const [coinFlash, setCoinFlash] = useState(0);
  const [touch] = useState(isTouch);
  const applied = useRef(true);
  const inPlay = screen === "play";
  const level = getLevel(levelId) || LEVELS[0];
  const sceneLevel = getLevel(sceneLevelId) || LEVELS[0];

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ------------------------------------------------ boot: menu demo */
  useEffect(() => {
    engine.load(LEVELS[0], { demo: true });
    return () => {
      engine.unload();
      audio.dispose();
    };
  }, [engine]);

  /* ------------------------------------------------ fold a run once */
  const fold = useCallback(
    (summary) => {
      if (applied.current) return null;
      applied.current = true;
      const out = applyRun(progressRef.current, summary);
      commit(out.progress);
      return out;
    },
    [commit]
  );
  const abandon = useCallback(() => {
    if (applied.current || engine.mode !== "play") return;
    const r = engine.run;
    if (r.playMs < 1500 && !r.towersBuilt) {
      applied.current = true;
      return;
    }
    fold({ result: "abandoned", levelId: engine.level.id, run: { ...r, towerUse: { ...r.towerUse } } });
  }, [engine, fold]);

  /* ------------------------------------------------ engine callbacks */
  const bannerTimer = useRef(0);
  const showBanner = useCallback((b, ms = 2200) => {
    clearTimeout(bannerTimer.current);
    setBanner({ ...b, key: Date.now() + Math.random() });
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  useEffect(() => {
    engine.cb = {
      hud: (h) => {
        if (engine.mode === "play") setHud(h);
      },
      over: (summary) => {
        if (engine.mode !== "play") return;
        const out = fold(summary);
        if (summary.result === "won") audio.victory();
        else audio.defeat();
        setSel(null);
        setBanner(null);
        setEnd({ summary, out, leaksByType: summary.run.leaksByType });
      },
    };
    if (TEST) window.__td = { engine, view, audio };
    return () => {
      if (TEST) delete window.__td;
    };
  }, [engine, fold, view]);

  /* sound + banners from battle events */
  useEffect(() => {
    const h = (ev) => {
      if (engine.mode !== "play") return;
      for (const e of ev) {
        switch (e.type) {
          case "shot":
            audio.shot(e.kind);
            break;
          case "hit":
            audio.hit(e.kind);
            break;
          case "dmg":
            if (e.armored && e.tower === "archer") audio.hit("armor");
            break;
          case "boom":
            audio.boom();
            break;
          case "kill":
            audio.die(e.kind, e.boss);
            audio.coin(e.boss);
            if (e.boss) showBanner({ kind: "clear", text: "BOSS DEFEATED", sub: `+${e.reward} coins` }, 2400);
            break;
          case "leak":
            audio.leak();
            break;
          case "build":
            audio.place();
            break;
          case "upgrade":
            audio.upgrade();
            break;
          case "sell":
            audio.sell();
            break;
          case "waveStart":
            audio.waveStart();
            if (e.boss) {
              audio.bossWarn();
              showBanner({ kind: "boss", text: "BOSS WAVE", sub: worldOf(engine.level).boss.name.toUpperCase() }, 2800);
            } else showBanner({ kind: "wave", text: `WAVE ${e.wave}`, sub: e.wave === engine.waves.length ? "FINAL WAVE" : null }, 1800);
            break;
          case "waveClear":
            audio.waveClear();
            showBanner({ kind: "clear", text: "WAVE CLEARED", sub: e.bonus ? `+${e.bonus} bonus coins` : null }, 1900);
            break;
          default:
        }
      }
    };
    bus.handlers.add(h);
    return () => bus.handlers.delete(h);
  }, [bus, engine, showBanner]);

  /* ------------------------------------------------ audio + settings */
  const battleMood = inPlay && hud && hud.phase === "wave" ? (engine.currentWave()?.boss ? "boss" : "battle") : "menu";
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);
  useEffect(() => {
    audio.setMusic(settings.music && !muted && !end && !paused, battleMood, sceneLevel.world);
  }, [settings.music, muted, battleMood, sceneLevel.world, end, paused]);

  const updateSettings = useCallback(
    (s) => {
      audio.unlock();
      audio.ui();
      commit({ ...progressRef.current, settings: s });
    },
    [commit]
  );

  /* ------------------------------------------------ selection ↔ view */
  useEffect(() => {
    view.selSpot = sel?.kind === "spot" ? sel.i : -1;
    view.selTower = sel?.kind === "tower" ? sel.id : null;
    view.freeze = !!sel;
    if (!sel) {
      view.range = null;
      view.range2 = null;
    }
  }, [sel, view]);
  // a selected tower that no longer exists (sold, restarted) closes its panel
  useEffect(() => {
    if (sel?.kind === "tower" && !engine.towerById(sel.id)) setSel(null);
    if (sel?.kind === "spot" && engine.spots[sel.i]?.tower) setSel(null);
  }, [hud, sel, engine]);

  /* ------------------------------------------------ flow */
  const resetBattleUi = () => {
    setSel(null);
    setEnd(null);
    setBanner(null);
    setPaused(false);
    setBusy(false);
    busyRef.current = false;
    setIngameSettings(false);
    view.hoverSpot = -1;
    view.range = view.range2 = null;
  };

  const startLevel = useCallback(
    (id) => {
      const L = getLevel(id);
      if (!L || !isUnlocked(progressRef.current, id)) return;
      audio.unlock();
      abandon();
      resetBattleUi();
      engine.load(L);
      engine.setSpeed(progressRef.current.settings.speed);
      applied.current = false;
      setLevelId(id);
      setSceneLevelId(id);
      setMenuWorld(L.world);
      setHud(engine.hud());
      setScreen("play");
      if (progressRef.current.lastPlayed !== id) commit({ ...progressRef.current, lastPlayed: id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon, commit]
  );

  const toScreen = useCallback(
    (to, demoLevel) => {
      audio.unlock();
      audio.ui();
      abandon();
      resetBattleUi();
      setHud(null);
      const L = demoLevel || (engine.mode === "demo" && engine.level ? engine.level : LEVELS[0]);
      if (engine.mode !== "demo" || engine.level !== L) engine.load(L, { demo: true });
      setSceneLevelId(L.id);
      setScreen(to);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon]
  );

  const togglePause = useCallback(
    (p) => {
      if (!inPlay || end) return;
      audio.ui();
      setPaused(p);
      engine.setPaused(p);
      if (p) setSel(null);
      else setIngameSettings(false);
    },
    [engine, inPlay, end]
  );

  /* GamePlayer Restart → the current battle from its starting state */
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
        setSel(null);
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [engine]);

  /* ------------------------------------------------ actions */
  const startWave = useCallback(() => {
    if (!inPlay || paused || end) return;
    audio.unlock();
    if (engine.startWave()) setSel((s) => (s?.kind === "spot" ? null : s));
  }, [engine, inPlay, paused, end]);

  const build = useCallback(
    (type) => {
      if (sel?.kind !== "spot") return;
      audio.unlock();
      const r = engine.build(sel.i, type);
      if (r.ok) setSel(null);
      else if (r.reason === "coins") {
        audio.error();
        setCoinFlash((n) => n + 1);
      }
    },
    [engine, sel]
  );

  // rapid repeat clicks must not chain upgrades: the lock is a ref, so it is
  // seen synchronously even before React re-renders the disabled button
  const busyTimer = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => () => clearTimeout(busyTimer.current), []);
  const lock = () => {
    busyRef.current = true;
    setBusy(true);
    clearTimeout(busyTimer.current);
    busyTimer.current = setTimeout(() => {
      busyRef.current = false;
      setBusy(false);
    }, 350);
  };
  const upgrade = useCallback(() => {
    if (sel?.kind !== "tower" || busyRef.current) return;
    const r = engine.upgrade(sel.id);
    if (r.ok) lock();
    else if (r.reason === "coins") {
      audio.error();
      setCoinFlash((n) => n + 1);
    }
  }, [engine, sel]);
  const sell = useCallback(() => {
    if (sel?.kind !== "tower" || busyRef.current) return;
    const r = engine.sell(sel.id);
    if (r.ok) {
      lock();
      setSel(null);
    }
  }, [engine, sel]);

  const toggleSpeed = useCallback(() => {
    audio.ui();
    engine.setSpeed(engine.speed === 2 ? 1 : 2);
  }, [engine]);

  /* ------------------------------------------------ pointer input */
  const pick = (ev) => {
    if (!view.project || !rootRef.current) return -1;
    const r = rootRef.current.getBoundingClientRect();
    const nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((ev.clientY - r.top) / r.height) * 2 - 1);
    const hit = view.project(nx, ny);
    if (!hit) return -1;
    let best = -1;
    let bd = 1.1;
    engine.spots.forEach((s, i) => {
      const d = Math.hypot(s.x - hit[0], s.z - hit[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const canAct = inPlay && !paused && !end && engine.active;
  const onPointerDown = (ev) => {
    if (!canAct) return;
    if (ev.button !== undefined && ev.button > 0) return;
    if (ev.target.closest(".tdm-ui")) return;
    audio.unlock();
    const i = pick(ev);
    if (i < 0) {
      setSel(null);
      return;
    }
    const spot = engine.spots[i];
    audio.ui();
    if (spot.tower) setSel((s) => (s?.kind === "tower" && s.id === spot.tower.id ? null : { kind: "tower", id: spot.tower.id }));
    else setSel((s) => (s?.kind === "spot" && s.i === i ? null : { kind: "spot", i }));
  };
  const onPointerMove = (ev) => {
    if (!canAct || ev.pointerType !== "mouse") return;
    if (ev.target.closest(".tdm-ui")) {
      view.hoverSpot = -1;
      rootRef.current.style.cursor = "";
      return;
    }
    const i = pick(ev);
    if (i !== view.hoverSpot && i >= 0) audio.hover();
    view.hoverSpot = i;
    rootRef.current.style.cursor = i >= 0 ? "pointer" : "";
  };
  const onPointerLeave = () => {
    view.hoverSpot = -1;
  };

  /* keyboard: Space start wave · Esc close / pause · 1-4 build · U upgrade */
  useEffect(() => {
    const key = (e) => {
      if (!inPlay) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Escape") {
        if (sel) setSel(null);
        else togglePause(!paused);
      } else if (e.code === "KeyP") togglePause(!paused);
      else if (e.code === "Space") {
        const a = document.activeElement;
        const ours = !a || a === document.body || (rootRef.current && rootRef.current.contains(a));
        if (!ours) return;
        e.preventDefault();
        startWave();
      } else if (sel?.kind === "spot" && /^Digit[1-4]$/.test(e.code)) build(["archer", "cannon", "frost", "mage"][+e.code.slice(5) - 1]);
      else if (sel?.kind === "tower" && e.code === "KeyU") upgrade();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [inPlay, sel, paused, togglePause, startWave, build, upgrade]);

  /* ------------------------------------------------ render */
  const mode = screen === "towers" ? "showcase" : inPlay ? "battle" : "menu";
  const q = settings.graphics;
  const dpr = q === "low" ? [0.75, 1] : q === "high" ? [1, 2] : [1, 1.5];
  const selTower = sel?.kind === "tower" ? engine.towerById(sel.id) : null;
  const selSpot = sel?.kind === "spot" ? engine.spots[sel.i] : null;
  const hasNext = end && getLevel(level.id + 1) && isUnlocked(progress, level.id + 1);
  let hint = null;
  if (inPlay && hud && !end && level.id <= 2 && hud.wave === 0) {
    if (!hud.towers) hint = touch ? "Tap a stone pad to build a tower" : "Click a stone pad to build a tower";
    else hint = "Build more, or press START WAVE when ready";
  }

  return (
    <div
      ref={rootRef}
      className={`tdm${inPlay ? " tdm--play" : ""}`}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="tdm-stage" ref={stageRef}>
        {webgl ? (
          <SceneErrorBoundary
            key={canvasKey}
            fallback={(msg, retry) => (
              <div className="tdm-glfail" role="alert">
                <strong>The 3D view stopped</strong>
                <span>{msg}</span>
                <button type="button" className="tdm-btn tdm-btn--primary" onClick={() => (retry(), setCanvasKey((k) => k + 1))}>
                  RETRY
                </button>
              </div>
            )}
          >
            <Canvas
              className="tdm-canvas"
              frameloop={frameloop}
              dpr={dpr}
              shadows={q !== "low"}
              gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
              camera={{ fov: 38, position: [0, 26, 18], near: 0.5, far: 300 }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
              }}
            >
              <Scene3D engine={engine} view={view} bus={bus} fx={fx} level={sceneLevel} settings={settings} mode={mode} showcase={showcase} layer={layerRef} />
            </Canvas>
          </SceneErrorBoundary>
        ) : (
          <div className="tdm-glfail" role="alert">
            <strong>3D graphics are not available</strong>
            <span>Tower Defense Mini needs WebGL 2. Enable hardware acceleration in your browser settings and reload.</span>
          </div>
        )}
        {webgl && canvasStuck && (
          <div className="tdm-glfail tdm-glfail--soft" role="alert">
            <strong>The 3D view has not started</strong>
            <button type="button" className="tdm-btn tdm-btn--primary" onClick={() => setCanvasKey((k) => k + 1)}>
              RETRY
            </button>
          </div>
        )}
      </div>
      <div className="tdm-floats" ref={layerRef} aria-hidden="true" />

      {inPlay && hud && (
        <>
          <TopBar hud={hud} levelName={level.name} onPause={() => togglePause(true)} onSpeed={toggleSpeed} flash={coinFlash} />
          {!end && !paused && <WaveButton hud={hud} onStart={startWave} first={hud.wave === 0 && hud.towers > 0} />}
          {!end && !paused && selSpot && <BuildMenu key={`b${sel.i}`} spot={selSpot} view={view} coins={hud.coins} onBuild={build} onClose={() => setSel(null)} touch={touch} audio={audio} />}
          {!end && !paused && selTower && <TowerPanel key={`t${selTower.id}`} tower={selTower} view={view} coins={hud.coins} onUpgrade={upgrade} onSell={sell} onClose={() => setSel(null)} busy={busy} />}
          {!end && <Banner banner={banner} />}
          {!end && !paused && <Hint text={hint} />}
        </>
      )}

      {inPlay && paused && !end && !ingameSettings && (
        <PauseOverlay onResume={() => togglePause(false)} onRestart={() => startLevel(levelId)} onSettings={() => (audio.ui(), setIngameSettings(true))} onQuit={() => toScreen("levels", firstOfWorld(level.world))} />
      )}
      {inPlay && paused && ingameSettings && <Settings settings={settings} onChange={updateSettings} onBack={() => (audio.ui(), setIngameSettings(false))} inGame />}

      {inPlay && end && (
        <ResultOverlay
          end={end}
          level={level}
          hasNext={hasNext}
          onNext={() => startLevel(level.id + 1)}
          onReplay={() => startLevel(level.id)}
          onLevels={() => {
            setLevelSel(hasNext ? level.id + 1 : level.id);
            toScreen("levels", firstOfWorld(getLevel(hasNext ? level.id + 1 : level.id).world));
            setMenuWorld(getLevel(hasNext ? level.id + 1 : level.id).world);
          }}
        />
      )}

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => startLevel(nextLevelId(progressRef.current))}
          onLevels={() => {
            const w = getLevel(nextLevelId(progressRef.current))?.world || 1;
            setMenuWorld(w);
            setLevelSel(null);
            toScreen("levels", firstOfWorld(w));
          }}
          onTowers={() => toScreen("towers")}
          onStats={() => toScreen("stats")}
          onSettings={() => toScreen("settings")}
        />
      )}
      {screen === "levels" && (
        <LevelSelect
          progress={progress}
          world={menuWorld}
          selected={levelSel}
          onSelect={(id) => {
            audio.ui();
            setLevelSel(id);
          }}
          onWorld={(w) => {
            audio.ui();
            setMenuWorld(w);
            setLevelSel(null);
            const L = firstOfWorld(w);
            if (engine.level !== L) {
              engine.load(L, { demo: true });
              setSceneLevelId(L.id);
            }
          }}
          onPlay={startLevel}
          onBack={() => toScreen("menu", LEVELS[0])}
        />
      )}
      {screen === "towers" && (
        <TowersScreen
          type={showcase.type}
          level={showcase.level}
          onType={(t) => (audio.ui(), setShowcase((s) => ({ ...s, type: t })))}
          onLevel={(l) => (audio.ui(), setShowcase((s) => ({ ...s, level: l })))}
          onBack={() => toScreen("menu")}
        />
      )}
      {screen === "stats" && <Statistics progress={progress} onBack={() => toScreen("menu")} />}
      {screen === "settings" && <Settings settings={settings} onChange={updateSettings} onBack={() => toScreen("menu")} />}
    </div>
  );
}
