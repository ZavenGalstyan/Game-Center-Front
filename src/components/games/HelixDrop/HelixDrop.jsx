/**
 * Helix Drop — rotating-tower drop arcade game for the Game Center (true 3D:
 * React Three Fiber + Three.js). Registered by name in ../registry.js.
 *
 * ONE <Canvas> stays mounted for the whole session; the engine is created once
 * and ticked by a single useFrame (see three/Scene.jsx → <Driver>). Screens:
 *   menu | levels | balls | stats | settings | play (+ pause / result overlays)
 *
 * Input: drag horizontally (mouse or touch, unified Pointer Events with
 * pointer capture — one pointer at a time, so a touch can never also fire a
 * mouse rotation) or hold A/D, ←/→. The ball is never moved directly.
 * `restartSignal` restarts the current level / run (progress is kept);
 * `muted` silences every sound; fullscreen only resizes the canvas.
 * Progress: localStorage `helix-drop-progress`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import "./HelixDrop.css";
import { Engine } from "./engine/engine.js";
import { audio } from "./audio/audio.js";
import { LEVELS, getLevel } from "./data/levels.js";
import { getWorld } from "./data/worlds.js";
import { SKINS, getSkin } from "./data/skins.js";
import { loadProgress, saveProgress, applyAttempt, isUnlocked, highestUnlocked, skinUnlocked } from "./utils/storage.js";
import { Driver, Tower, Ball, CameraRig, Lights, Environment } from "./three/Scene.jsx";
import { frameloop, glTest, Sizer, TEST } from "./three/testHooks.js";
import { MainMenu, LevelSelect, Balls, Statistics, Settings, LevelComplete, LevelFailed, EndlessOver, Icon } from "./screens/Screens.jsx";

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

function Scene3D({ engine, world, skin, settings, menu }) {
  const q = settings.graphics;
  const shadows = settings.shadows && q !== "low";
  return (
    <>
      <Driver engine={engine} />
      <Sizer />
      <Environment engine={engine} world={world} quality={q} reducedMotion={settings.reducedMotion} />
      <Lights engine={engine} world={world} shadows={shadows} quality={q} />
      <Tower key={`${world.key}`} engine={engine} world={world} quality={q} shadows={shadows} />
      <Ball engine={engine} skin={skin} quality={q} />
      <CameraRig engine={engine} menu={menu} />
    </>
  );
}

export default function HelixDrop({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [screen, setScreen] = useState("menu");
  const [mode, setMode] = useState(null);
  const [levelId, setLevelId] = useState(1);
  const [browseWorld, setBrowseWorld] = useState(() => getLevel(highestUnlocked(loadProgress()))?.world || 1);
  const [hud, setHud] = useState({ time: 0, progress: 0, floors: 0, streak: 0, smash: false, status: "play" });
  const [result, setResult] = useState(null);
  const [paused, setPaused] = useState(false);
  const [dragged, setDragged] = useState(false);
  const [toast, setToast] = useState(null);
  const [worldKey, setWorldKey] = useState(1);
  const [touch] = useState(isTouch);
  const attempt = useRef({ applied: true, fails: 0 });
  const resultAt = useRef(0);
  const settings = progress.settings;

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ------------------------------------------------ engine callbacks (once) */
  useEffect(() => {
    engine.cb = {
      hud: (h) => setHud(h),
      sound: (n, d = {}) => {
        if (n === "bounce") audio.bounce();
        else if (n === "pass") audio.pass(d.streak);
        else if (n === "smashOn") audio.smashOn();
        else if (n === "smash") audio.smash();
        else if (n === "death") audio.death();
        else if (n === "finish") audio.finish();
      },
      complete: (r) => finishAttempt(r),
      failed: (r) => finishAttempt(r),
    };
    if (TEST) window.__hd = engine;
    const vis = () => engine.setHidden(document.visibilityState === "hidden" && !TEST);
    vis();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      if (TEST) delete window.__hd;
    };
    // finishAttempt only uses refs / stable setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music && !muted);
  }, [settings.sound, settings.music, muted]);
  useEffect(() => () => audio.dispose(), []);
  useEffect(() => {
    engine.setSettings(settings);
  }, [engine, settings]);

  /* ------------------------------------------------------------ attempts */
  function finishAttempt(r) {
    const a = attempt.current;
    if (a.applied) return;
    a.applied = true;
    endDrag();
    const L = r.levelId ? getLevel(r.levelId) : null;
    const prev = progressRef.current;
    const out = applyAttempt(prev, r, L);
    commit(out.progress);
    resultAt.current = performance.now();
    if (r.mode === "endless") setResult({ kind: "endless", r, best: out.progress.stats.bestDepth, newBest: r.depth > prev.stats.bestDepth });
    else if (r.finished) {
      audio.complete();
      const i = LEVELS.findIndex((x) => x.id === r.levelId);
      setResult({ kind: "complete", r, stars: out.stars, record: out.record, fails: a.fails, nextId: LEVELS[i + 1]?.id ?? null, prevStars: prev.levels[r.levelId]?.stars || 0 });
    } else {
      a.fails += 1;
      setResult({ kind: "failed", r });
    }
    if (out.newSkins.length) {
      setToast({ text: `NEW BALL · ${out.newSkins.map((id) => getSkin(id).name).join(", ")}`, key: Date.now() });
      audio.newUnlock();
    }
  }

  const abandon = useCallback(() => {
    const a = attempt.current;
    if (a.applied || engine.mode === "menu") return;
    a.applied = true;
    const r = { ...engine.result(), failed: false, finished: false };
    if (r.bounces === 0 && r.floors === 0) return;
    const L = r.levelId ? getLevel(r.levelId) : null;
    commit(applyAttempt(progressRef.current, r.mode === "endless" ? r : { ...r, mode: "abandon" }, L).progress);
  }, [engine, commit]);

  const begin = useCallback(() => {
    attempt.current.applied = false;
    setResult(null);
    setPaused(false);
    setDragged(false);
    endDrag();
    engine.setPaused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const startLevel = useCallback(
    (id, same = false) => {
      if (!isUnlocked(progressRef.current, id)) return;
      audio.unlock();
      abandon();
      if (!same) attempt.current.fails = 0;
      begin();
      const L = getLevel(id);
      setLevelId(id);
      setBrowseWorld(L.world);
      setMode("level");
      setScreen("play");
      setWorldKey(L.world);
      audio.setVariant(getWorld(L.world).music);
      engine.loadLevel(L);
    },
    [engine, abandon, begin]
  );

  const startEndless = useCallback(() => {
    audio.unlock();
    abandon();
    begin();
    setMode("endless");
    setScreen("play");
    setWorldKey(1);
    audio.setVariant(0);
    engine.loadEndless((Date.now() & 0xffff) + 1);
  }, [engine, abandon, begin]);

  const retry = useCallback(() => {
    if (mode === "endless") startEndless();
    else startLevel(levelId, true);
  }, [mode, levelId, startLevel, startEndless]);

  const toMenu = useCallback(
    (to = "menu", w = 1) => {
      audio.ui();
      abandon();
      endDrag();
      setResult(null);
      setPaused(false);
      setMode(null);
      setScreen(to);
      setWorldKey(w);
      audio.setVariant(0);
      engine.setPaused(false);
      engine.showMenu(w);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon]
  );

  const go = useCallback((s) => {
    audio.unlock();
    audio.ui();
    setScreen(s);
  }, []);

  const togglePause = useCallback(
    (p) => {
      if (engine.mode === "menu" || engine.sim.status !== "play") return;
      audio.ui();
      endDrag();
      setPaused(p);
      engine.setPaused(p);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine]
  );

  /* GamePlayer Restart → current level / run again; progress untouched */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") retry();
  }, [restartSignal, screen, retry]);

  /* endless: follow the world theme down the tower */
  useEffect(() => {
    if (mode !== "endless") return;
    const id = setInterval(() => {
      const w = engine.currentWorld().id;
      setWorldKey((k) => (k !== w ? w : k));
    }, 400);
    return () => clearInterval(id);
  }, [mode, engine]);

  /* ------------------------------------------------------------ input */
  const drag = useRef({ id: null, x: 0 });
  function endDrag() {
    drag.current.id = null;
    keys.current = [];
    engine.setKey(0);
  }
  const inPlay = screen === "play";
  const active = inPlay && !paused && !result;

  const onPointerDown = (ev) => {
    if (!active || drag.current.id !== null) return; // one pointer only
    if (ev.button !== undefined && ev.button > 0) return;
    if (ev.target.closest("button, .hd-panel")) return;
    ev.preventDefault();
    audio.unlock();
    drag.current = { id: ev.pointerId, x: ev.clientX };
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onPointerMove = (ev) => {
    if (ev.pointerId !== drag.current.id || !active) return;
    const dx = ev.clientX - drag.current.x;
    drag.current.x = ev.clientX;
    if (dx) {
      engine.dragPx(dx);
      if (!dragged && Math.abs(dx) > 0) setDragged(true);
    }
  };
  const onPointerEnd = (ev) => {
    if (ev.pointerId === drag.current.id) drag.current.id = null;
  };

  const keys = useRef([]);
  useEffect(() => {
    const dirOf = (k) => (k === "ArrowLeft" || k === "a" || k === "A" ? -1 : k === "ArrowRight" || k === "d" || k === "D" ? 1 : 0);
    const down = (ev) => {
      const tag = ev.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const d = dirOf(ev.key);
      if (d && inPlay) {
        ev.preventDefault();
        if (!active) return;
        const code = ev.code || ev.key;
        keys.current = keys.current.filter((k) => k.code !== code);
        keys.current.push({ code, d });
        engine.setKey(d);
        setDragged(true);
        return;
      }
      if ((ev.key === "Escape" || ev.key === "p" || ev.key === "P") && inPlay && !result) {
        ev.preventDefault();
        togglePause(!paused);
      } else if ((ev.key === "Enter" || ev.key === " ") && inPlay && result && performance.now() - resultAt.current > 450) {
        ev.preventDefault();
        if (result.kind === "complete" && result.nextId && isUnlocked(progressRef.current, result.nextId)) startLevel(result.nextId);
        else retry();
      } else if (ev.key === " " && inPlay) ev.preventDefault();
    };
    const up = (ev) => {
      const d = dirOf(ev.key);
      if (!d) return;
      const code = ev.code || ev.key;
      keys.current = keys.current.filter((k) => k.code !== code);
      const last = keys.current[keys.current.length - 1];
      engine.setKey(last ? last.d : 0);
    };
    const blur = () => endDrag();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPlay, active, paused, result, togglePause, retry, startLevel, engine]);

  useEffect(() => {
    endDrag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, paused, result]);

  /* ------------------------------------------------------------ settings / balls */
  const updateSettings = useCallback(
    (patch) => {
      audio.ui();
      const p = progressRef.current;
      commit({ ...p, settings: { ...p.settings, ...patch } });
    },
    [commit]
  );
  const selectBall = useCallback(
    (id) => {
      const p = progressRef.current;
      const s = SKINS.find((k) => k.id === id);
      if (!s || !skinUnlocked(p, s)) return;
      audio.ui();
      commit({ ...p, selectedBall: id });
    },
    [commit]
  );

  /* ------------------------------------------------------------ view */
  const L = mode === "level" ? getLevel(levelId) : null;
  const world = getWorld(inPlay ? worldKey : screen === "levels" ? browseWorld : 1);
  const skin = getSkin(progress.selectedBall);
  const q = settings.graphics;
  const dpr = q === "low" ? [0.75, 1] : q === "high" ? [1, 2] : [1, 1.5];
  const pct = Math.round(hud.progress * 100);
  const showHint = inPlay && !result && !paused && (!dragged || (settings.controlHelp && hud.time < 2.2 && levelId === 1));
  const menuBackdrop = !inPlay;

  // level select shows the browsed world's tower in the menu scene
  useEffect(() => {
    if (!inPlay) engine.world = getWorld(screen === "levels" ? browseWorld : 1);
  }, [inPlay, screen, browseWorld, engine]);

  return (
    <div
      ref={rootRef}
      className={`hd${inPlay ? " hd--play" : ""}${hud.smash && inPlay ? " is-smash" : ""}`}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      style={{ "--hd-a1": world.ui[0], "--hd-a2": world.ui[1] }}
      onPointerDown={inPlay ? onPointerDown : undefined}
      onPointerMove={inPlay ? onPointerMove : undefined}
      onPointerUp={inPlay ? onPointerEnd : undefined}
      onPointerCancel={inPlay ? onPointerEnd : undefined}
      onLostPointerCapture={inPlay ? onPointerEnd : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="hd-stage">
        <Canvas
          className="hd-canvas"
          frameloop={frameloop}
          dpr={dpr}
          shadows={settings.shadows && q !== "low"}
          gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
          camera={{ fov: 46, position: [0, 4, 10.4], near: 0.1, far: 140 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
          <Scene3D engine={engine} world={world} skin={skin} settings={settings} menu={menuBackdrop} />
        </Canvas>
      </div>

      {inPlay && (
        <div className="hd-hud">
          <div className="hd-hud__left">
            <button type="button" className="hd-iconbtn" aria-label="Pause" onClick={() => togglePause(true)} disabled={!!result}>
              <Icon name="pause" />
            </button>
            <div className="hd-hud__label">
              {mode === "level" ? (
                <>
                  <span>{world.name}</span>
                  <strong>LEVEL {String(L.id).padStart(2, "0")}</strong>
                </>
              ) : (
                <>
                  <span>ENDLESS</span>
                  <strong>DEPTH {hud.floors}</strong>
                </>
              )}
            </div>
          </div>
          <div className="hd-hud__center">
            {hud.smash ? (
              <div className="hd-chip hd-chip--smash" key="smash">
                SMASH
              </div>
            ) : hud.streak >= 2 ? (
              <div className="hd-chip" key={hud.streak}>
                DROP <b>×{hud.streak}</b>
              </div>
            ) : null}
          </div>
          <div className="hd-hud__right">
            {mode === "level" ? (
              <div className="hd-pct">{pct}%</div>
            ) : (
              <div className="hd-pct">
                BEST <b>{Math.max(progress.stats.bestDepth, hud.floors)}</b>
              </div>
            )}
          </div>
          {mode === "level" && (
            <div className="hd-progress" aria-label={`Progress ${pct}%`}>
              <span className="hd-progress__cap">START</span>
              <div className="hd-progress__bar">
                <i style={{ height: `${pct}%` }} />
                <em style={{ top: `${pct}%` }} />
              </div>
              <span className="hd-progress__cap">FINISH</span>
            </div>
          )}
          {mode === "level" && hud.time < 2 && !result && (
            <div className="hd-banner" key={`b${levelId}`}>
              <span>LEVEL {L.id}</span>
              <strong>{L.name}</strong>
              <small>
                ★★ UNDER {L.targetTime}s · ★★★ ALSO DROP ×{L.streakGoal}
              </small>
            </div>
          )}
          {showHint && (
            <div className="hd-hint">
              <svg viewBox="0 0 64 32" width="54" height="27" aria-hidden="true">
                <path d="M6 16h52M6 16l7-6M6 16l7 6M58 16l-7-6M58 16l-7 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {touch ? "DRAG TO ROTATE" : "DRAG TO ROTATE · A / D"}
            </div>
          )}
        </div>
      )}

      {inPlay && paused && !result && (
        <div className="hd-veil">
          <div className="hd-panel hd-pause">
            <h2>PAUSED</h2>
            {mode === "level" && (
              <p className="hd-pause__goal">
                ★★ under {L.targetTime}s · ★★★ also a DROP ×{L.streakGoal}
              </p>
            )}
            <button type="button" className="hd-btn hd-btn--primary" onClick={() => togglePause(false)}>
              RESUME
            </button>
            <button type="button" className="hd-btn" onClick={retry}>
              RESTART
            </button>
            {mode === "level" && (
              <button type="button" className="hd-btn" onClick={() => toMenu("levels", L.world)}>
                LEVELS
              </button>
            )}
            <button type="button" className="hd-btn hd-btn--ghost" onClick={() => toMenu("menu")}>
              MAIN MENU
            </button>
          </div>
        </div>
      )}

      {inPlay && result?.kind === "complete" && (
        <LevelComplete level={L} result={result} canNext={!!result.nextId && isUnlocked(progress, result.nextId)} onNext={() => startLevel(result.nextId)} onReplay={retry} onLevels={() => toMenu("levels", L.world)} />
      )}
      {inPlay && result?.kind === "failed" && <LevelFailed result={result} onRetry={retry} onLevels={() => toMenu("levels", L.world)} />}
      {inPlay && result?.kind === "endless" && <EndlessOver result={result} onRetry={retry} onMenu={() => toMenu("menu")} />}

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => startLevel(highestUnlocked(progressRef.current))}
          onLevels={() => {
            setBrowseWorld(getLevel(highestUnlocked(progressRef.current)).world);
            go("levels");
          }}
          onEndless={startEndless}
          onBalls={() => go("balls")}
          onStats={() => go("stats")}
          onSettings={() => go("settings")}
        />
      )}
      {screen === "levels" && <LevelSelect progress={progress} world={browseWorld} onWorld={(w) => (audio.ui(), setBrowseWorld(w))} onPick={startLevel} onBack={() => go("menu")} />}
      {screen === "balls" && <Balls progress={progress} onSelect={selectBall} onBack={() => go("menu")} />}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
      {screen === "settings" && <Settings settings={settings} onChange={updateSettings} onBack={() => go("menu")} />}

      {toast && (
        <div className="hd-toast" key={toast.key} onAnimationEnd={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
