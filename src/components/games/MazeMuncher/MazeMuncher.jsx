/**
 * Maze Muncher — neon maze arcade: chomp every energy dot, dodge four enemy
 * creatures, grab power orbs to turn the tables. Rendered inside the shared
 * <GamePlayer> (registered by name in ../registry.js); Restart / Mute /
 * Fullscreen / Like stay there.
 *
 * `restartSignal` starts a fresh run from the level the current run began
 * on; `muted` silences the synthesized effects. High score + unlocked levels
 * live in localStorage under `maze-muncher-save`. Rules: ./engine.js,
 * drawing: ./render.js, mazes: ./levels.js.
 *
 * DEV: `?mmtest=1` disables the rAF loop and exposes window.__mm (advance
 * frames manually; see tools/).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DIRS, newRun, nextLevel, setWant, step } from "./engine.js";
import { LEVELS } from "./levels.js";
import { createView } from "./render.js";
import { createAudio } from "./audio.js";
import "./MazeMuncher.css";

const SAVE_KEY = "maze-muncher-save";
const KEYS = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
const TEST = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("mmtest");

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return { high: Number(s?.high) || 0, unlocked: Math.min(LEVELS.length, Math.max(1, Number(s?.unlocked) || 1)) };
  } catch {
    return { high: 0, unlocked: 1 };
  }
}

export default function MazeMuncher({ restartSignal = 0, muted = false }) {
  const [screen, setScreen] = useState("menu"); // menu | play | paused | levelDone | over | victory
  const [save, setSave] = useState(loadSave);
  const [summary, setSummary] = useState(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const gRef = useRef(null);
  const viewRef = useRef(null);
  const audioRef = useRef(null);
  const screenRef = useRef(screen);
  const saveRef = useRef(save);
  const startLevelRef = useRef(0);
  screenRef.current = screen;
  saveRef.current = save;
  if (!gRef.current) gRef.current = newRun(0);
  if (!audioRef.current) audioRef.current = createAudio();

  const persist = useCallback((patch) => {
    const next = { ...saveRef.current, ...patch };
    saveRef.current = next;
    setSave(next);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  }, []);

  const startRun = useCallback((level = 0) => {
    startLevelRef.current = level;
    gRef.current = newRun(level);
    const v = viewRef.current;
    if (v) (v.fx = []), (v.pops = []);
    audioRef.current.unlock();
    audioRef.current.play("start");
    setSummary(null);
    setScreen("play");
  }, []);

  const continueRun = () => {
    nextLevel(gRef.current);
    audioRef.current.play("start");
    setScreen("play");
  };

  /** React to engine events: sounds, effects, screen changes. */
  const drain = useCallback(() => {
    const g = gRef.current, v = viewRef.current, a = audioRef.current;
    for (const e of g.events) {
      switch (e.type) {
        case "dot":
          a.play("chomp");
          if (e.combo % 4 === 0) v?.burst(e.x, e.y, "#ffe27a", 3, 2);
          break;
        case "orb":
          a.play("orb");
          v?.burst(e.x, e.y, "#7af7ff", 18, 5);
          v?.pop(e.x, e.y - 0.6, "POWER!", "#7af7ff");
          break;
        case "combo":
          a.play("combo");
          v?.pop(e.x, e.y - 0.6, `COMBO ×${e.combo} +${e.pts}`, "#ffd95a");
          break;
        case "eat":
          a.play("eat");
          v?.burst(e.x, e.y, e.color, 22, 6);
          v?.pop(e.x, e.y, `+${e.pts}`, "#7af7ff");
          break;
        case "bonusSpawn":
          a.play("bonusSpawn");
          break;
        case "bonus":
          a.play("bonus");
          v?.burst(e.x, e.y, "#ff9ff3", 16, 4);
          v?.pop(e.x, e.y, `+${e.pts}`, "#ff9ff3");
          break;
        case "life":
          a.play("life");
          v?.pop(g.player.tx, g.player.ty - 1, "1UP!", "#9cf04a");
          break;
        case "death":
          a.play("death");
          if (v) (v.shake = 1), v.burst(e.x, e.y, "#9cf04a", 26, 5);
          break;
        case "clear":
          a.play("clear");
          break;
        case "cleared": {
          const high = Math.max(saveRef.current.high, g.score);
          setSummary({ score: g.score, level: g.level, newHigh: g.score > saveRef.current.high });
          persist({ high, unlocked: Math.max(saveRef.current.unlocked, Math.min(LEVELS.length, g.level + 2)) });
          if (e.last) a.play("victory");
          setScreen(e.last ? "victory" : "levelDone");
          break;
        }
        case "over": {
          a.play("over");
          setSummary({ score: g.score, level: g.level, newHigh: g.score > saveRef.current.high });
          persist({ high: Math.max(saveRef.current.high, g.score) });
          setScreen("over");
          break;
        }
      }
    }
    g.events.length = 0;
  }, [persist]);

  // canvas, resize and the single animation loop
  useEffect(() => {
    const stage = stageRef.current;
    const view = createView(canvasRef.current);
    viewRef.current = view;
    let t = 0;
    const frame = (dt) => {
      t += dt;
      const g = gRef.current;
      if (screenRef.current === "play") {
        step(g, dt);
        drain();
      }
      view.draw(g, { high: saveRef.current.high, dt: screenRef.current === "paused" ? 0 : dt, t });
    };
    const fit = () => {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      view.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
      frame(0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    let raf = 0, last = performance.now();
    if (TEST) {
      window.__mm = {
        g: () => gRef.current,
        screen: () => screenRef.current,
        start: startRun,
        fit,
        driver: null,
        advance(n = 1, dt = 1 / 60) {
          for (let k = 0; k < n; k++) (this.driver?.(gRef.current), frame(dt));
        },
      };
    } else {
      const loop = (now) => {
        frame(Math.min(0.05, (now - last) / 1000));
        last = now;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (TEST) delete window.__mm;
    };
  }, [drain, startRun]);

  useEffect(() => () => audioRef.current.close(), []);
  useEffect(() => audioRef.current.setMuted(muted), [muted]);

  // GamePlayer Restart -> fresh run
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    startRun(startLevelRef.current);
  }, [restartSignal, startRun]);

  const togglePause = useCallback(() => {
    const s = screenRef.current;
    if (s === "play") setScreen("paused");
    else if (s === "paused") setScreen("play");
  }, []);

  // keyboard: arrows / WASD steer, P / Esc pause
  useEffect(() => {
    const onKey = (e) => {
      const s = screenRef.current;
      if (e.target.closest?.("input, textarea, select")) return;
      const dir = KEYS[e.code];
      if (dir && (s === "play" || s === "paused")) {
        e.preventDefault();
        if (s === "play") setWant(gRef.current, DIRS[dir]);
      } else if (e.code === "KeyP" || e.code === "Escape") {
        if (s === "play" || s === "paused") (e.preventDefault(), togglePause());
      } else if (e.code === "Space" && (s === "play" || s === "paused")) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  // pause when the tab is hidden
  useEffect(() => {
    const onHide = () => document.hidden && screenRef.current === "play" && setScreen("paused");
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // swipe steering: every 18px of travel in a direction counts as a swipe
  const swipe = useRef(null);
  const onPointerDown = (e) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId || screenRef.current !== "play") return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    setWant(gRef.current, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS.right : DIRS.left) : dy > 0 ? DIRS.down : DIRS.up);
    swipe.current = { ...s, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => (swipe.current = null);

  const g = gRef.current;
  const overlay = screen !== "play";

  return (
    <div className="mm">
      <div ref={stageRef} className="mm-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <canvas ref={canvasRef} className="mm-canvas" />
        {screen === "play" && (
          <button type="button" className="mm-pause" onClick={togglePause} aria-label="Pause">
            <span />
            <span />
          </button>
        )}

        {overlay && (
          <div className={`mm-overlay mm-overlay--${screen}`}>
            {screen === "menu" && (
              <div className="mm-card">
                <h2 className="mm-title">Maze <span>Muncher</span></h2>
                <p className="mm-tag">CHOMP • DODGE • SURVIVE</p>
                <p className="mm-text">Eat every energy dot to clear the maze. Grab a <b className="c-orb">power orb</b> to turn the creatures blue and chomp them for bonus points.</p>
                <div className="mm-crew">
                  {[["Ember", "chases you", "#ff3b5c"], ["Vex", "cuts you off", "#ff5fd2"], ["Bolt", "patrols", "#ff9f1c"], ["Wisp", "wanders", "#8b7bff"]].map(([n, d, c]) => (
                    <span key={n} style={{ "--c": c }}><i />{n}<small>{d}</small></span>
                  ))}
                </div>
                <button type="button" className="mm-btn mm-btn--main" onClick={() => startRun(0)}>Play</button>
                {save.unlocked > 1 && (
                  <div className="mm-levels" role="group" aria-label="Start level">
                    {LEVELS.map((_, i) => (
                      <button key={i} type="button" className="mm-lvl" disabled={i >= save.unlocked} onClick={() => startRun(i)}>{i + 1}</button>
                    ))}
                  </div>
                )}
                <p className="mm-hint">Arrows / WASD or swipe to steer · P to pause · High score <b>{save.high}</b></p>
              </div>
            )}

            {screen === "paused" && (
              <div className="mm-card">
                <h3 className="mm-head">Paused</h3>
                <p className="mm-text">Level {g.level + 1} · Score {g.score} · Lives {g.lives}</p>
                <button type="button" className="mm-btn mm-btn--main" onClick={togglePause}>Resume</button>
                <button type="button" className="mm-btn" onClick={() => setScreen("menu")}>Quit to Menu</button>
              </div>
            )}

            {screen === "levelDone" && summary && (
              <div className="mm-card">
                <p className="mm-kicker">Maze cleared</p>
                <h3 className="mm-head">Level {summary.level + 1} Complete!</h3>
                <div className="mm-stats">
                  <div><span>Score</span><b>{summary.score}</b></div>
                  <div><span>Lives</span><b>{g.lives}</b></div>
                  <div><span>Next</span><b>{summary.level + 2}/10</b></div>
                </div>
                <p className="mm-text">The creatures get faster from here.</p>
                <button type="button" className="mm-btn mm-btn--main" onClick={continueRun}>Next Level</button>
              </div>
            )}

            {(screen === "over" || screen === "victory") && summary && (
              <div className="mm-card">
                <p className="mm-kicker">{summary.newHigh ? "★ New High Score ★" : screen === "victory" ? "All 10 mazes cleared" : `Reached level ${summary.level + 1}`}</p>
                <h3 className={`mm-head${screen === "over" ? " is-over" : ""}`}>{screen === "victory" ? "Victory!" : "Game Over"}</h3>
                <div className="mm-stats">
                  <div><span>Score</span><b>{summary.score}</b></div>
                  <div><span>High</span><b>{save.high}</b></div>
                  <div><span>Level</span><b>{summary.level + 1}</b></div>
                </div>
                <button type="button" className="mm-btn mm-btn--main" onClick={() => startRun(screen === "victory" ? 0 : startLevelRef.current)}>Play Again</button>
                <button type="button" className="mm-btn" onClick={() => setScreen("menu")}>Menu</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
