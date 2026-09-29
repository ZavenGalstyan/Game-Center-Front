/**
 * Stack Tower — timing arcade game for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent <canvas> is driven by the Engine (its own
 * rAF loop); React only renders the thin HUD and overlays:
 *
 *   menu | themes | stats | settings   (demo tower keeps stacking behind)
 *   play  (+ pause overlay, + result overlay after a miss)
 *
 * `restartSignal` (GamePlayer Restart) starts a fresh run — best height,
 * statistics, themes and settings are never wiped (an unfinished run is
 * folded into statistics first). `muted` gates every sound without touching
 * saved settings. Fullscreen only resizes the stage: the ResizeObserver
 * resizes the canvas, the engine and its listeners are never recreated.
 *
 * Progress lives in localStorage under `stack-tower-progress`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./StackTower.css";
import { Engine } from "./engine/engine.js";
import { audio } from "./audio/audio.js";
import { loadProgress, saveProgress, applyRun } from "./utils/storage.js";
import { THEMES, getTheme } from "./data/themes.js";
import MainMenu from "./screens/MainMenu.jsx";
import GameOver from "./screens/GameOver.jsx";
import Themes from "./screens/Themes.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";

const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sttest");

export default function StackTower({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [screen, setScreen] = useState("menu");
  const [hud, setHud] = useState({ height: 0, streak: 0, phase: "playing" });
  const [result, setResult] = useState(null);
  const [paused, setPaused] = useState(false);
  const resultAt = useRef(0);
  const settings = progress.settings;

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ------------------------------------------------------------ engine */
  useEffect(() => {
    const engine = new Engine(canvasRef.current, {
      hud: (h) => setHud(h),
      sound: (name, d = {}) => {
        if (name === "cut") {
          audio.place(d.size);
          audio.cut(d.frac);
        } else if (name === "perfect") {
          audio.perfect(d.streak);
          if (d.recovered) audio.recover();
        } else if (name === "miss") audio.miss();
        else if (name === "fall") audio.fall(d.size);
      },
      gameOver: (run) => {
        const prev = progressRef.current;
        const { progress: next, newBest, unlocked } = applyRun(prev, run);
        commit(next);
        resultAt.current = performance.now();
        setResult({ run, newBest, unlocked, best: next.bestHeight });
        if (newBest && run.height > 0) audio.newBest();
        else audio.gameOver();
      },
    });
    engineRef.current = engine;
    engine.setSettings(progressRef.current.settings);
    engine.setTheme(progressRef.current.selectedTheme);
    if (TEST) {
      engine.setManual(true);
      window.__st = engine;
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
      if (TEST) delete window.__st;
    };
  }, [commit]);

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
    engineRef.current?.setTheme(progress.selectedTheme);
  }, [progress.selectedTheme]);

  /* ------------------------------------------------------------ flow */

  /** Fold an unfinished run into statistics (Restart / Main Menu mid-run). */
  const abandonRun = useCallback(() => {
    const e = engineRef.current;
    if (!e || e.mode !== "play" || e.phase === "over" || e.overFired) return;
    const run = { ...e.run, height: e.blocks.length };
    if (run.height > 0) commit(applyRun(progressRef.current, run).progress);
  }, [commit]);

  const startRun = useCallback(() => {
    audio.unlock();
    abandonRun();
    setResult(null);
    setPaused(false);
    setScreen("play");
    const e = engineRef.current;
    e.setPaused(false);
    e.setMode("play");
  }, [abandonRun]);

  const toMenu = useCallback(() => {
    audio.ui();
    abandonRun();
    setResult(null);
    setPaused(false);
    setScreen("menu");
    const e = engineRef.current;
    e.setPaused(false);
    e.setMode("menu");
  }, [abandonRun]);

  const go = useCallback((s) => {
    audio.unlock();
    audio.ui();
    setScreen(s);
  }, []);

  const togglePause = useCallback((p) => {
    const e = engineRef.current;
    if (!e || e.mode !== "play" || e.phase === "over" || e.phase === "falling") return;
    audio.ui();
    setPaused(p);
    e.setPaused(p);
  }, []);

  /* GamePlayer Restart → fresh run (never touches best / stats / settings) */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") startRun();
  }, [restartSignal, screen, startRun]);

  /* ------------------------------------------------------------ input */
  const press = useCallback(() => {
    const e = engineRef.current;
    if (!e || screen !== "play" || paused) return;
    audio.unlock();
    e.press();
  }, [screen, paused]);

  const onPointerDown = useCallback(
    (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      if (ev.target.closest("button, .st-panel")) return;
      ev.preventDefault();
      press();
    },
    [press]
  );

  const spaceHeld = useRef(false);
  useEffect(() => {
    const down = (ev) => {
      if (ev.code === "Space" || ev.key === " ") {
        if (screen !== "play") return;
        const tag = ev.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        ev.preventDefault();
        if (ev.repeat || spaceHeld.current) return;
        spaceHeld.current = true;
        if (result) {
          // quick retry, but not from a Space still being mashed at the miss
          if (performance.now() - resultAt.current > 650) startRun();
          return;
        }
        press();
      } else if ((ev.key === "Escape" || ev.key === "p" || ev.key === "P") && screen === "play" && !result) {
        togglePause(!paused);
      }
    };
    const up = (ev) => {
      if (ev.code === "Space" || ev.key === " ") spaceHeld.current = false;
    };
    const blur = () => {
      spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [screen, result, paused, press, startRun, togglePause]);

  /* ------------------------------------------------------------ settings / themes */
  const updateSettings = useCallback(
    (patch) => {
      audio.ui();
      const p = progressRef.current;
      commit({ ...p, settings: { ...p.settings, ...patch } });
    },
    [commit]
  );

  const selectTheme = useCallback(
    (id) => {
      const p = progressRef.current;
      if (!p.unlockedThemes.includes(id)) return;
      audio.ui();
      commit({ ...p, selectedTheme: id });
    },
    [commit]
  );

  const theme = getTheme(progress.selectedTheme);
  const inPlay = screen === "play";

  return (
    <div
      ref={rootRef}
      className={`st st--${theme.ui}${inPlay ? " st--play" : ""}`}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      onPointerDown={inPlay ? onPointerDown : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="st-canvas" aria-hidden="true" />

      {inPlay && (
        <div className="st-hud">
          <div className="st-hud__left">
            <button type="button" className="st-iconbtn" aria-label="Pause" onClick={() => togglePause(true)} disabled={!!result}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              </svg>
            </button>
            <div className="st-best">
              <span>BEST</span>
              <strong>{Math.max(progress.bestHeight, hud.height)}</strong>
            </div>
          </div>
          <div className={`st-height${hud.height > 0 ? "" : " is-zero"}${result ? " is-hidden" : ""}`} key={hud.height}>
            {hud.height}
          </div>
          <div className="st-hud__right">
            {hud.streak >= 2 && (
              <div className={`st-streak${hud.streak >= 5 ? " is-hot" : ""}`} key={hud.streak}>
                PERFECT <b>×{hud.streak}</b>
              </div>
            )}
          </div>
          {hud.height === 0 && hud.phase === "playing" && !paused && (
            <div className="st-hint">TAP · CLICK · SPACE</div>
          )}
        </div>
      )}

      {inPlay && paused && !result && (
        <div className="st-veil">
          <div className="st-panel st-pause">
            <h2>PAUSED</h2>
            <button type="button" className="st-btn st-btn--primary" onClick={() => togglePause(false)}>
              RESUME
            </button>
            <button type="button" className="st-btn" onClick={startRun}>
              RESTART
            </button>
            <button type="button" className="st-btn st-btn--ghost" onClick={toMenu}>
              MAIN MENU
            </button>
          </div>
        </div>
      )}

      {inPlay && result && <GameOver result={result} onRetry={startRun} onMenu={toMenu} />}

      {screen === "menu" && (
        <MainMenu best={progress.bestHeight} onPlay={startRun} onThemes={() => go("themes")} onStats={() => go("stats")} onSettings={() => go("settings")} />
      )}
      {screen === "themes" && (
        <Themes themes={THEMES} progress={progress} onSelect={selectTheme} onBack={() => go("menu")} />
      )}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
      {screen === "settings" && <Settings settings={settings} onChange={updateSettings} onBack={() => go("menu")} />}
    </div>
  );
}
