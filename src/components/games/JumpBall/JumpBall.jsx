/**
 * Jump Ball — vertical bouncing arcade climber for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent <canvas> is driven by the Engine (its own
 * rAF loop, fixed-step physics); React only renders the HUD and overlays:
 *
 *   menu | levels | balls | stats | settings   (live demo / world backdrop behind)
 *   play (level or endless) + pause / complete / fail overlays
 *
 * Controls: LEFT / RIGHT only (A/D, ←/→, or hold the left/right half of the
 * screen). The ball bounces by itself. When both directions are held, the
 * most recently pressed one wins — same rule for keys and touches.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current level / endless
 * run — progress is never wiped (the abandoned attempt is folded into stats
 * first). `muted` gates every sound. Fullscreen only resizes the stage: the
 * ResizeObserver resizes the canvas; engine, loop and listeners are never
 * recreated.
 *
 * Progress lives in localStorage under `jump-ball-progress`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./JumpBall.css";
import { Engine } from "./engine/engine.js";
import { audio } from "./audio/audio.js";
import { LEVELS, getLevel } from "./data/levels.js";
import { getWorld } from "./data/worlds.js";
import { SKINS } from "./data/skins.js";
import { loadProgress, saveProgress, applyAttempt, isUnlocked, highestUnlocked, skinUnlocked } from "./utils/storage.js";
import MainMenu from "./screens/MainMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import Balls from "./screens/Balls.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";
import { LevelComplete, LevelFailed, EndlessOver } from "./screens/Results.jsx";
import { Icon } from "./screens/icons.jsx";

const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("jbtest");
const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export default function JumpBall({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [screen, setScreen] = useState("menu"); // menu | levels | balls | stats | settings | play
  const [mode, setMode] = useState(null); // level | endless
  const [levelId, setLevelId] = useState(1);
  const [browseWorld, setBrowseWorld] = useState(() => getLevel(highestUnlocked(loadProgress()))?.world || 1);
  const [hud, setHud] = useState({ time: 0, stars: 0, totalStars: 3, streak: 0, height: 0, status: "play" });
  const [result, setResult] = useState(null); // { kind: complete|failed|endless, ... }
  const [paused, setPaused] = useState(false);
  const [moved, setMoved] = useState(false);
  const [toast, setToast] = useState(null);
  const [touch] = useState(isTouch);
  const attemptRef = useRef({ applied: true, fails: 0 });
  const resultAt = useRef(0);
  const settings = progress.settings;

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  const showToast = useCallback((newSkins) => {
    if (!newSkins?.length) return;
    const names = newSkins.map((id) => SKINS.find((s) => s.id === id)?.name).filter(Boolean);
    setToast({ text: `NEW BALL UNLOCKED · ${names.join(", ")}`, key: Date.now() });
    audio.newUnlock();
  }, []);

  /* ------------------------------------------------------------ engine */
  useEffect(() => {
    const engine = new Engine(canvasRef.current, {
      hud: (h) => setHud(h),
      sound: (name, d = {}) => {
        if (name === "bounce") audio.bounce(d.impact);
        else if (name === "perfect") audio.perfect(d.streak);
        else if (name === "spring") audio.spring();
        else if (name === "star") audio.star(d.count);
        else if (name === "crack") audio.crack();
        else if (name === "breakFall") audio.breakFall();
        else if (name === "ice") audio.ice();
        else if (name === "wall") audio.wall();
        else if (name === "finish") audio.finish();
        else if (name === "fail") audio.fail();
      },
      complete: (r) => finishAttempt(r, "complete"),
      failed: (r) => finishAttempt(r, r.mode === "endless" ? "endless" : "failed"),
    });
    engineRef.current = engine;
    engine.setSettings(progressRef.current.settings);
    engine.setSkin(progressRef.current.selectedSkin);
    if (TEST) {
      engine.setManual(true);
      window.__jb = engine;
      document.body.setAttribute("data-jbtest", "1");
    }
    engine.start();

    const el = rootRef.current;
    const fit = () => {
      const r = el.getBoundingClientRect();
      engine.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    const vis = () => engine.setHidden(document.visibilityState === "hidden");
    vis();
    document.addEventListener("visibilitychange", vis);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", vis);
      engine.destroy();
      engineRef.current = null;
      if (TEST) delete window.__jb;
    };
    // finishAttempt is stable (refs only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music && !muted);
  }, [settings.sound, settings.music, muted]);
  useEffect(() => () => audio.dispose(), []);
  useEffect(() => {
    engineRef.current?.setSettings(settings);
  }, [settings]);
  useEffect(() => {
    engineRef.current?.setSkin(progress.selectedSkin);
  }, [progress.selectedSkin]);

  /* ------------------------------------------------------------ attempts */

  /** Fold the current attempt into progress exactly once. */
  function finishAttempt(r, kind) {
    const a = attemptRef.current;
    if (a.applied) return;
    a.applied = true;
    inputs.current.clear();
    engineRef.current?.setInput(0);
    const prev = progressRef.current;
    const { progress: next, firstClear, newSkins, record } = applyAttempt(prev, r);
    commit(next);
    resultAt.current = performance.now();
    if (kind === "complete") {
      audio.complete();
      const i = LEVELS.findIndex((L) => L.id === r.levelId);
      const nextLevel = LEVELS[i + 1] || null;
      setResult({ kind, r, firstClear, record, fails: a.fails, nextId: nextLevel?.id ?? null, prevStars: prev.levels[r.levelId]?.stars || 0 });
    } else if (kind === "endless") {
      setResult({ kind, r, best: next.stats.bestEndless, newBest: r.height > prev.stats.bestEndless });
    } else {
      a.fails += 1;
      setResult({ kind, r });
    }
    showToast(newSkins);
  }

  /** Restart / leave mid-attempt: fold partial stats (not counted as a fall). */
  const abandon = useCallback(() => {
    const a = attemptRef.current;
    const e = engineRef.current;
    if (a.applied || !e || e.mode === "menu") return;
    a.applied = true;
    const r = { ...e.result(), cause: null, finished: false };
    if (r.mode === "endless" && r.height <= 0 && r.bounces === 0) return;
    commit(applyAttempt(progressRef.current, r.mode === "endless" ? r : { ...r, mode: "level-abandon" }).progress);
  }, [commit]);

  const beginAttempt = useCallback(() => {
    attemptRef.current.applied = false;
    inputs.current.clear();
    setResult(null);
    setPaused(false);
    setMoved(false);
  }, []);

  const startLevel = useCallback(
    (id, { sameLevel = false } = {}) => {
      if (!isUnlocked(progressRef.current, id)) return;
      audio.unlock();
      abandon();
      if (!sameLevel) attemptRef.current.fails = 0;
      beginAttempt();
      const L = getLevel(id);
      setLevelId(id);
      setBrowseWorld(L.world);
      setMode("level");
      setScreen("play");
      audio.setVariant(getWorld(L.world).music);
      const e = engineRef.current;
      e.setPaused(false);
      e.loadLevel(L);
    },
    [abandon, beginAttempt]
  );

  const startEndless = useCallback(() => {
    audio.unlock();
    abandon();
    beginAttempt();
    setMode("endless");
    setScreen("play");
    audio.setVariant(0);
    const e = engineRef.current;
    e.setPaused(false);
    e.loadEndless((Date.now() & 0xffff) + 1);
  }, [abandon, beginAttempt]);

  const retry = useCallback(() => {
    if (mode === "endless") startEndless();
    else startLevel(levelId, { sameLevel: true });
  }, [mode, levelId, startLevel, startEndless]);

  const toMenu = useCallback(
    (to = "menu") => {
      audio.ui();
      abandon();
      inputs.current.clear();
      setResult(null);
      setPaused(false);
      setMode(null);
      setScreen(to);
      audio.setVariant(0);
      const e = engineRef.current;
      e.setPaused(false);
      e.showMenu();
    },
    [abandon]
  );

  const go = useCallback((s) => {
    audio.unlock();
    audio.ui();
    setScreen(s);
  }, []);

  const togglePause = useCallback((p) => {
    const e = engineRef.current;
    if (!e || e.mode === "menu" || e.sim.status !== "play") return;
    audio.ui();
    inputs.current.clear();
    setPaused(p);
    e.setPaused(p);
  }, []);

  /* GamePlayer Restart → restart current level / run (never wipes progress) */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") retry();
  }, [restartSignal, screen, retry]);

  /* ------------------------------------------------------------ input */
  // ordered list of held directions; the most recent wins
  const inputs = useRef({
    keys: new Map(), // key → dir
    ptrs: new Map(), // pointerId → dir
    order: [], // [{src, dir}]
    clear() {
      this.keys.clear();
      this.ptrs.clear();
      this.order = [];
      engineRef.current?.setInput(0);
    },
  });

  const pushInput = useCallback(() => {
    const st = inputs.current;
    const last = st.order[st.order.length - 1];
    const dir = last ? last.dir : 0;
    engineRef.current?.setInput(dir);
    if (dir) setMoved(true);
  }, []);

  const press = useCallback(
    (src, dir) => {
      const st = inputs.current;
      st.order = st.order.filter((o) => o.src !== src);
      st.order.push({ src, dir });
      pushInput();
    },
    [pushInput]
  );

  const release = useCallback(
    (src) => {
      const st = inputs.current;
      st.order = st.order.filter((o) => o.src !== src);
      pushInput();
    },
    [pushInput]
  );

  const inPlay = screen === "play";
  const active = inPlay && !paused && !result;

  useEffect(() => {
    const dirOf = (ev) => {
      const k = ev.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") return -1;
      if (k === "ArrowRight" || k === "d" || k === "D") return 1;
      return 0;
    };
    const down = (ev) => {
      const tag = ev.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const dir = dirOf(ev);
      if (dir && inPlay) {
        ev.preventDefault();
        if (!active) return;
        audio.unlock();
        const src = `k:${ev.code || ev.key}`;
        if (ev.repeat && inputs.current.keys.has(src)) return;
        inputs.current.keys.set(src, dir);
        press(src, dir);
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
      const dir = dirOf(ev);
      if (!dir) return;
      const src = `k:${ev.code || ev.key}`;
      inputs.current.keys.delete(src);
      release(src);
    };
    const blur = () => inputs.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [inPlay, active, paused, result, press, release, togglePause, retry, startLevel]);

  // any screen change / overlay drops held input
  useEffect(() => {
    inputs.current.clear();
  }, [screen, paused, result]);

  const sideOf = (ev) => {
    const r = rootRef.current.getBoundingClientRect();
    return ev.clientX - r.left < r.width / 2 ? -1 : 1;
  };
  const onPointerDown = (ev) => {
    if (!active || ev.pointerType === "mouse") return;
    if (ev.target.closest("button, .jb-panel")) return;
    ev.preventDefault();
    audio.unlock();
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    const dir = sideOf(ev);
    inputs.current.ptrs.set(ev.pointerId, dir);
    press(`p:${ev.pointerId}`, dir);
  };
  const onPointerMove = (ev) => {
    const st = inputs.current;
    if (!st.ptrs.has(ev.pointerId)) return;
    const dir = sideOf(ev);
    if (dir !== st.ptrs.get(ev.pointerId)) {
      st.ptrs.set(ev.pointerId, dir);
      press(`p:${ev.pointerId}`, dir);
    }
  };
  const onPointerUp = (ev) => {
    const st = inputs.current;
    if (!st.ptrs.has(ev.pointerId)) return;
    st.ptrs.delete(ev.pointerId);
    release(`p:${ev.pointerId}`);
  };

  /* ------------------------------------------------------------ settings / skins */
  const updateSettings = useCallback(
    (patch) => {
      audio.ui();
      const p = progressRef.current;
      commit({ ...p, settings: { ...p.settings, ...patch } });
    },
    [commit]
  );

  const selectSkin = useCallback(
    (id) => {
      const p = progressRef.current;
      const s = SKINS.find((k) => k.id === id);
      if (!s || !skinUnlocked(p, s)) return;
      audio.ui();
      commit({ ...p, selectedSkin: id });
    },
    [commit]
  );

  /* ------------------------------------------------------------ view */
  const L = mode === "level" ? getLevel(levelId) : null;
  const world = L ? getWorld(L.world) : getWorld(1);
  const showHint = inPlay && !result && !paused && ((levelId === 1 && mode === "level" && !moved) || (settings.controlHelp && hud.time < 2.6 && !moved));
  const fmt = (t) => `${Math.floor(t)}.${Math.floor((t % 1) * 10)}`;

  return (
    <div
      ref={rootRef}
      className={`jb${inPlay ? " jb--play" : ""}`}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      style={{ "--jb-a1": world.ui[0], "--jb-a2": world.ui[1] }}
      onPointerDown={inPlay ? onPointerDown : undefined}
      onPointerMove={inPlay ? onPointerMove : undefined}
      onPointerUp={inPlay ? onPointerUp : undefined}
      onPointerCancel={inPlay ? onPointerUp : undefined}
      onLostPointerCapture={inPlay ? onPointerUp : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="jb-canvas" aria-hidden="true" />

      {inPlay && (
        <div className="jb-hud">
          <div className="jb-hud__left">
            <button type="button" className="jb-iconbtn" aria-label="Pause" onClick={() => togglePause(true)} disabled={!!result}>
              <Icon name="pause" />
            </button>
            <div className="jb-hud__label">
              {mode === "level" ? (
                <>
                  <span>{world.name}</span>
                  <strong>
                    {L.id} · {L.name}
                  </strong>
                </>
              ) : (
                <>
                  <span>ENDLESS</span>
                  <strong>BEST {Math.max(progress.stats.bestEndless, hud.height)} M</strong>
                </>
              )}
            </div>
          </div>
          <div className="jb-hud__center">
            {mode === "level" ? <div className="jb-timer">{fmt(hud.time)}</div> : <div className="jb-height">{hud.height}<small>M</small></div>}
          </div>
          <div className="jb-hud__right">
            {hud.streak >= 2 && (
              <div className={`jb-streak${hud.streak >= 5 ? " is-hot" : ""}`} key={hud.streak}>
                PERFECT <b>×{hud.streak}</b>
              </div>
            )}
            {mode === "level" ? (
              <div className="jb-stars" aria-label={`${hud.stars} of 3 stars`}>
                {[0, 1, 2].map((i) => (
                  <Icon key={i} name="star" className={i < hud.stars ? "is-on" : ""} />
                ))}
              </div>
            ) : (
              <div className="jb-stars jb-stars--count">
                <Icon name="star" className="is-on" />
                <b>{hud.stars}</b>
              </div>
            )}
          </div>
          {mode === "level" && hud.time < 1.8 && !result && (
            <div className="jb-banner" key={`b${levelId}`}>
              <span>LEVEL {L.id}</span>
              <strong>{L.name}</strong>
            </div>
          )}
          {showHint && (
            <div className="jb-hint">
              {touch ? (
                <>
                  HOLD <b>LEFT</b> / <b>RIGHT</b> SIDE
                </>
              ) : (
                <>
                  <kbd>A</kbd>
                  <kbd>D</kbd>
                  <em>or</em>
                  <kbd>
                    <Icon name="left" />
                  </kbd>
                  <kbd>
                    <Icon name="right" />
                  </kbd>{" "}
                  MOVE
                </>
              )}
            </div>
          )}
          {touch && !result && !paused && (
            <div className="jb-pads" aria-hidden="true">
              <div className="jb-pad">
                <Icon name="left" />
              </div>
              <div className="jb-pad">
                <Icon name="right" />
              </div>
            </div>
          )}
        </div>
      )}

      {inPlay && paused && !result && (
        <div className="jb-veil">
          <div className="jb-panel jb-pause">
            <h2>PAUSED</h2>
            <button type="button" className="jb-btn jb-btn--primary" onClick={() => togglePause(false)}>
              RESUME
            </button>
            <button type="button" className="jb-btn" onClick={retry}>
              RESTART
            </button>
            {mode === "level" && (
              <button type="button" className="jb-btn" onClick={() => toMenu("levels")}>
                LEVELS
              </button>
            )}
            <button type="button" className="jb-btn jb-btn--ghost" onClick={() => toMenu("menu")}>
              MAIN MENU
            </button>
          </div>
        </div>
      )}

      {inPlay && result?.kind === "complete" && (
        <LevelComplete
          level={L}
          result={result}
          canNext={!!result.nextId && isUnlocked(progress, result.nextId)}
          onNext={() => startLevel(result.nextId)}
          onReplay={retry}
          onLevels={() => toMenu("levels")}
        />
      )}
      {inPlay && result?.kind === "failed" && <LevelFailed result={result} onRetry={retry} onLevels={() => toMenu("levels")} />}
      {inPlay && result?.kind === "endless" && <EndlessOver result={result} onRetry={retry} onMenu={() => toMenu("menu")} />}

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => {
            audio.unlock();
            audio.ui();
            setBrowseWorld(getLevel(highestUnlocked(progressRef.current)).world);
            setScreen("levels");
          }}
          onEndless={startEndless}
          onBalls={() => go("balls")}
          onStats={() => go("stats")}
          onSettings={() => go("settings")}
        />
      )}
      {screen === "levels" && (
        <LevelSelect
          progress={progress}
          world={browseWorld}
          onWorld={(w) => {
            audio.ui();
            setBrowseWorld(w);
          }}
          onPick={(id) => startLevel(id)}
          onBack={() => go("menu")}
          engine={engineRef}
        />
      )}
      {screen === "balls" && <Balls progress={progress} onSelect={selectSkin} onBack={() => go("menu")} />}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
      {screen === "settings" && <Settings settings={settings} onChange={updateSettings} onBack={() => go("menu")} />}

      {toast && (
        <div className="jb-toast" key={toast.key} onAnimationEnd={() => setToast(null)}>
          <Icon name="ball" />
          {toast.text}
        </div>
      )}
    </div>
  );
}
