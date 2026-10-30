/**
 * Flame & Aqua: Twin Temple — local two-player co-op puzzle platformer.
 * Rendered on one <canvas> inside the shared <GamePlayer> (registered by
 * name in ../registry.js); menus and HUD are React overlays.
 *
 * Both heroes are always human-controlled from one keyboard (A/D/W and the
 * arrow keys); the simulation (engine/sim.js) runs at a fixed 120 Hz and the
 * React tree only re-renders when a HUD value or screen changes.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current level; `muted`
 * silences the WebAudio blips. Progress lives under `flame-aqua-twin-temple-save`.
 */
import { useEffect, useRef, useState } from "react";
import { DT, VIEW_W, VIEW_H, gemTotals, step } from "./engine/sim.js";
import { buildLevel } from "./engine/level.js";
import { LEVELS, WORLDS, levelsOfWorld } from "./data/levels.js";
import { loadProgress, saveProgress, recordWin, isUnlocked, isDone, fmtTime, LEVEL_COUNT } from "./engine/save.js";
import { bakeStatic, drawFrame, spawnFx, stepFx } from "./render/draw.js";
import { createInput } from "./ui/input.js";
import { audio } from "./audio.js";
import "./FlameAqua.css";

const TEST = import.meta.env.DEV && typeof window !== "undefined" && /[?&]fatest=1/.test(window.location.search);
const MANUAL = TEST && /[?&]famanual=1/.test(window.location.search);
const NOSAVE = TEST && /[?&]nosave=1/.test(window.location.search);

const levelLabel = (def) => `${def.world + 1}-${((def.id - 1) % 10) + 1}`;

function hudOf(s) {
  const g = gemTotals(s);
  return { tenths: Math.floor(s.time * 10), fire: g.fireGot, fireMax: g.fire, water: g.waterGot, waterMax: g.water, status: s.status };
}

export default function FlameAqua({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  if (!simRef.current) simRef.current = buildLevel(LEVELS[0]);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const fxRef = useRef([]);
  const viewRef = useRef({ w: 1, h: 1, dpr: 1, scale: 1, ox: 0, oy: 0 });
  const bakeRef = useRef({ key: "", canvas: null });
  const accRef = useRef(0);

  const [progress, setProgressState] = useState(() => (NOSAVE ? loadProgress(null) : loadProgress()));
  const progressRef = useRef(progress);
  const setProgress = (fn) => {
    const next = typeof fn === "function" ? fn(progressRef.current) : fn;
    progressRef.current = next;
    setProgressState(next);
    if (!NOSAVE) saveProgress(next);
  };

  const [screen, setScreenState] = useState("menu"); // menu | worlds | levels | play
  const [overlay, setOverlayState] = useState(null); // null | pause | dead | complete | victory | help
  const [world, setWorld] = useState(0);
  const [levelId, setLevelId] = useState(1);
  const [hud, setHud] = useState(() => hudOf(simRef.current));
  const [result, setResult] = useState(null);
  const [hintOn, setHintOn] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // refs mirror the UI state for the loop and key handler
  const ui = useRef({ screen, overlay, levelId });
  ui.current = { screen, overlay, levelId };
  const setScreen = (sc) => {
    ui.current.screen = sc;
    setScreenState(sc);
  };
  const setOverlay = (o) => {
    ui.current.overlay = o;
    setOverlayState(o);
  };

  audio.muted = muted || !progress.sound;

  const syncHud = () => {
    const h = hudOf(simRef.current);
    setHud((o) => (o.tenths === h.tenths && o.fire === h.fire && o.water === h.water && o.status === h.status && o.fireMax === h.fireMax ? o : h));
  };

  const startLevel = (id) => {
    const def = LEVELS[id - 1];
    simRef.current = buildLevel(def);
    fxRef.current = [];
    accRef.current = 0;
    inputRef.current.clear();
    ui.current.levelId = id;
    setLevelId(id);
    setWorld(def.world);
    setResult(null);
    setOverlay(null);
    setScreen("play");
    setHintOn(true);
    syncHud();
    draw();
  };
  const restart = () => {
    if (ui.current.screen === "play") startLevel(ui.current.levelId);
  };
  const pause = () => {
    if (ui.current.screen === "play" && !ui.current.overlay && simRef.current.status === "playing") {
      inputRef.current.clear();
      setOverlay("pause");
    }
  };
  const resume = () => {
    if (ui.current.overlay === "pause") {
      accRef.current = 0;
      setOverlay(null);
    }
  };
  const toMenu = (sc = "menu") => {
    setOverlay(null);
    setScreen(sc);
    simRef.current = buildLevel(LEVELS[ui.current.levelId - 1]);
    fxRef.current = [];
    syncHud();
  };
  const nextLevel = () => {
    const id = ui.current.levelId;
    if (id < LEVEL_COUNT) startLevel(id + 1);
    else toMenu("worlds");
  };

  /* ---------------------------------------------------------------- loop */

  const handleEvents = (s, events) => {
    for (const e of events) {
      audio.play(e.type, e.who);
      spawnFx(fxRef.current, e);
    }
  };

  const onEnd = (s) => {
    if (s.status === "won") {
      const id = s.id;
      const gems = s.players[0].gems + s.players[1].gems;
      const prev = progressRef.current;
      const firstClear = !isDone(prev, id);
      const newBest = !prev.best[id] || s.endT < prev.best[id];
      setProgress((p) => recordWin(p, id, s.endT, gems));
      setResult({ time: s.endT, best: Math.min(prev.best[id] || Infinity, s.endT), newBest, gems, maxGems: s.gems.length, firstClear });
      setOverlay(id === LEVEL_COUNT ? "victory" : "complete");
    } else setOverlay("dead");
  };

  function draw() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const s = simRef.current;
    const v = viewRef.current;
    const key = `${s.id}:${v.scale * v.dpr}`;
    if (bakeRef.current.key !== key) bakeRef.current = { key, canvas: bakeStatic(s, s.def.world, v.scale * v.dpr) };
    drawFrame(ctx, s, v, fxRef.current, bakeRef.current.canvas);
  }

  const frame = (dt) => {
    const s = simRef.current;
    const playing = ui.current.screen === "play" && !ui.current.overlay;
    if (playing) {
      accRef.current = Math.min(accRef.current + dt, 0.1);
      while (accRef.current >= DT) {
        accRef.current -= DT;
        const wasPlaying = s.status === "playing";
        handleEvents(s, step(s, inputRef.current.sample()));
        if (wasPlaying && s.status !== "playing") inputRef.current.clear();
      }
      if (s.status !== "playing" && s.post > (s.status === "won" ? 1.1 : 0.9) && !ui.current.overlay) onEnd(s);
      stepFx(fxRef.current, dt);
      syncHud();
    } else if (ui.current.screen !== "play") {
      s.post += dt; // keep the backdrop heroes breathing behind the menus
    }
    draw();
  };
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => {
    if (MANUAL) return undefined;
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      frameRef.current(Math.min(0.1, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // fit the 960×540 world into the stage (letterboxed) at device resolution
  useEffect(() => {
    const el = stageRef.current;
    const fit = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = canvasRef.current;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const scale = Math.min(w / VIEW_W, h / VIEW_H);
      Object.assign(viewRef.current, { w, h, dpr, scale, ox: (w - VIEW_W * scale) / 2, oy: (h - VIEW_H * scale) / 2 });
      draw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  /* ---------------------------------------------------------------- input */

  const inPlay = screen === "play" && !overlay;
  useEffect(() => {
    inputRef.current.setEnabled(inPlay);
  }, [inPlay]);

  const actions = useRef({});
  actions.current = { pause, resume, restart, nextLevel, toMenu, startLevel };
  useEffect(() => {
    const input = inputRef.current;
    const onDown = (e) => {
      audio.unlock();
      const { screen: sc, overlay: ov } = ui.current;
      const a = actions.current;
      if (input.down(e)) return; // a hero key while playing
      if (e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (sc !== "play") return;
      const k = e.code;
      if (k === "Escape" || k === "KeyP") {
        e.preventDefault();
        if (ov === "pause") a.resume();
        else if (!ov) a.pause();
      } else if (k === "KeyR") {
        e.preventDefault();
        if (!ov || ov === "pause" || ov === "dead") a.restart();
      } else if (k === "Enter" && !e.repeat) {
        e.preventDefault();
        if (ov === "dead") a.restart();
        else if (ov === "complete") a.nextLevel();
        else if (ov === "pause") a.resume();
      } else if ((k.startsWith("Arrow") || k === "Space") && ov) e.preventDefault();
    };
    const onUp = (e) => input.up(e);
    const onBlur = () => {
      input.clear();
      actions.current.pause();
    };
    const onVis = () => document.hidden && onBlur();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    actions.current.restart();
  }, [restartSignal]);

  useEffect(() => {
    if (!hintOn) return undefined;
    const id = setTimeout(() => setHintOn(false), 6000);
    return () => clearTimeout(id);
  }, [hintOn, levelId]);

  if (TEST) {
    window.__fa = {
      sim: () => simRef.current,
      screen: () => ui.current.screen,
      overlay: () => ui.current.overlay,
      progress: () => progressRef.current,
      setProgress,
      input: inputRef.current,
      play: (id) => actions.current.startLevel(id),
      restart: () => actions.current.restart(),
      pause: () => actions.current.pause(),
      resume: () => actions.current.resume(),
      toMenu: (sc) => actions.current.toMenu(sc),
      setScreen,
      advance: (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) frameRef.current(dt);
      },
    };
  }

  /* ---------------------------------------------------------------- view */

  const def = LEVELS[levelId - 1];
  const doneCount = Object.keys(progress.best).length;
  const unlock = () => audio.unlock();

  return (
    <div className="fa" onPointerDown={unlock}>
      <div ref={stageRef} className="fa-stage">
        <canvas ref={canvasRef} className="fa-canvas" />

        {screen === "play" && (
          <div className="fa-hud">
            <div className="fa-chip fa-chip--level">
              <b>{levelLabel(def)}</b>
              <span>{def.name}</span>
            </div>
            <div className="fa-chip fa-chip--time">{fmtTime(hud.tenths / 10)}</div>
            <div className="fa-chip fa-chip--gems">
              <i className="fa-gem fa-gem--fire" /> {hud.fire}/{hud.fireMax}
              <i className="fa-gem fa-gem--water" /> {hud.water}/{hud.waterMax}
            </div>
            <div className="fa-hud-btns">
              <button type="button" className="fa-icon" onClick={restart} aria-label="Restart level" title="Restart (R)">↻</button>
              <button type="button" className="fa-icon" onClick={pause} aria-label="Pause" title="Pause (Esc / P)">❚❚</button>
            </div>
          </div>
        )}
        {screen === "play" && hintOn && !overlay && <div className="fa-hint">{def.hint}</div>}

        {screen === "menu" && (
          <div className="fa-screen fa-screen--menu">
            <div className="fa-logo">
              <span className="fa-logo-flame">Flame</span>
              <span className="fa-logo-amp">&amp;</span>
              <span className="fa-logo-aqua">Aqua</span>
            </div>
            <div className="fa-logo-sub">Twin Temple</div>
            <p className="fa-tag">Two Heroes. One Temple. Escape Together.</p>
            <div className="fa-menu-btns">
              <button type="button" className="fa-btn fa-btn--big" onClick={() => startLevel(Math.min(progress.unlocked, LEVEL_COUNT))}>
                {doneCount ? `Continue · ${levelLabel(LEVELS[Math.min(progress.unlocked, LEVEL_COUNT) - 1])}` : "Play"}
              </button>
              <button type="button" className="fa-btn" onClick={() => setScreen("worlds")}>Select Level</button>
              <button type="button" className="fa-btn" onClick={() => setOverlay("help")}>How to Play</button>
              <button type="button" className="fa-btn fa-btn--ghost" onClick={() => setProgress((p) => ({ ...p, sound: !p.sound }))}>
                Sound: {progress.sound ? "On" : "Off"}
              </button>
            </div>
            <div className="fa-controls">
              <div className="fa-ctl fa-ctl--fire"><b>Flame</b><kbd>A</kbd><kbd>W</kbd><kbd>D</kbd></div>
              <div className="fa-ctl fa-ctl--water"><b>Aqua</b><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd></div>
            </div>
            <small className="fa-foot">Local co-op for two players on one keyboard · {doneCount}/{LEVEL_COUNT} levels cleared</small>
          </div>
        )}

        {screen === "worlds" && (
          <div className="fa-screen">
            <h2 className="fa-h2">Choose a Temple</h2>
            <div className="fa-worlds">
              {WORLDS.map((w) => {
                const lv = levelsOfWorld(w.id);
                const open = isUnlocked(progress, lv[0].id);
                const done = lv.filter((l) => isDone(progress, l.id)).length;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={`fa-world fa-world--${w.id}${open ? "" : " is-locked"}`}
                    style={{ "--accent": w.accent }}
                    disabled={!open}
                    onClick={() => {
                      setWorld(w.id);
                      setScreen("levels");
                    }}
                  >
                    <span className="fa-world-n">World {w.id + 1}</span>
                    <strong>{w.name}</strong>
                    <span className="fa-world-blurb">{open ? w.blurb : "Clear the previous temple to unlock"}</span>
                    <span className="fa-world-bar"><i style={{ width: `${done * 10}%` }} /></span>
                    <span className="fa-world-n">{open ? `${done}/10 cleared` : "🔒 Locked"}</span>
                  </button>
                );
              })}
            </div>
            <div className="fa-row">
              <button type="button" className="fa-btn fa-btn--ghost" onClick={() => setScreen("menu")}>← Back</button>
            </div>
          </div>
        )}

        {screen === "levels" && (
          <div className="fa-screen">
            <h2 className="fa-h2" style={{ color: WORLDS[world].accent }}>{WORLDS[world].name}</h2>
            <div className="fa-levels">
              {levelsOfWorld(world).map((l) => {
                const open = isUnlocked(progress, l.id);
                const best = progress.best[l.id];
                const total = l.map.join("").replace(/[^rb]/g, "").length;
                return (
                  <button key={l.id} type="button" className={`fa-level${open ? "" : " is-locked"}${best ? " is-done" : ""}`} disabled={!open} onClick={() => startLevel(l.id)}>
                    <b>{levelLabel(l)}</b>
                    <span className="fa-level-name">{open ? l.name : "Locked"}</span>
                    <span className="fa-level-meta">{best ? `⏱ ${fmtTime(best)} · 💎 ${progress.gems[l.id] || 0}/${total}` : open ? "New" : "🔒"}</span>
                  </button>
                );
              })}
            </div>
            <div className="fa-row">
              <button type="button" className="fa-btn fa-btn--ghost" onClick={() => setScreen("worlds")}>← Temples</button>
              <button type="button" className="fa-btn fa-btn--ghost" disabled={world === 0} onClick={() => setWorld(world - 1)}>‹ Prev</button>
              <button type="button" className="fa-btn fa-btn--ghost" disabled={world === 3 || !isUnlocked(progress, levelsOfWorld(world + 1)[0]?.id)} onClick={() => setWorld(world + 1)}>Next ›</button>
            </div>
          </div>
        )}

        {overlay === "help" && (
          <div className="fa-screen fa-screen--modal">
            <h2 className="fa-h2">How to Play</h2>
            <div className="fa-help">
              <div className="fa-help-col fa-help-col--fire">
                <h3>Flame · Player 1</h3>
                <p><kbd>A</kbd> <kbd>D</kbd> move · <kbd>W</kbd> jump</p>
                <p>Walks through <em className="t-fire">fire</em>. Dies in <em className="t-water">water</em>.</p>
                <p>Collects <em className="t-fire">red gems</em>.</p>
              </div>
              <div className="fa-help-col fa-help-col--water">
                <h3>Aqua · Player 2</h3>
                <p><kbd>←</kbd> <kbd>→</kbd> move · <kbd>↑</kbd> jump</p>
                <p>Swims through <em className="t-water">water</em>. Dies in <em className="t-fire">fire</em>.</p>
                <p>Collects <em className="t-water">blue gems</em>.</p>
              </div>
            </div>
            <ul className="fa-help-list">
              <li><em className="t-toxic">Green goo</em>, saws and moving orbs of the wrong element are deadly.</li>
              <li>Plates work while someone (or a box) stands on them; walk through a lever to flip it.</li>
              <li>Doors and lifts match the colour of the switch that drives them. A ring shows a gate&apos;s timer.</li>
              <li>Bounce light off mirrors into sensors. Push boxes by walking into them.</li>
              <li>Both heroes must stand in their own door to finish. <kbd>R</kbd> restarts, <kbd>Esc</kbd> pauses.</li>
            </ul>
            <button type="button" className="fa-btn" onClick={() => setOverlay(null)}>Got it</button>
          </div>
        )}

        {overlay === "pause" && (
          <div className="fa-screen fa-screen--modal">
            <h2 className="fa-h2">Paused</h2>
            <p className="fa-sub">{levelLabel(def)} · {def.name}</p>
            <div className="fa-menu-btns">
              <button type="button" className="fa-btn fa-btn--big" onClick={resume}>Resume</button>
              <button type="button" className="fa-btn" onClick={restart}>Restart Level</button>
              <button type="button" className="fa-btn" onClick={() => toMenu("levels")}>Level Select</button>
              <button type="button" className="fa-btn fa-btn--ghost" onClick={() => toMenu("menu")}>Main Menu</button>
            </div>
            <small className="fa-foot">Esc / P to resume · R to restart</small>
          </div>
        )}

        {overlay === "dead" && (
          <div className="fa-screen fa-screen--modal fa-screen--dead">
            <h2 className="fa-h2">Oh no!</h2>
            <p className="fa-sub">{deathLine(simRef.current)}</p>
            <div className="fa-menu-btns">
              <button type="button" className="fa-btn fa-btn--big" onClick={restart}>Try Again</button>
              <button type="button" className="fa-btn fa-btn--ghost" onClick={() => toMenu("levels")}>Level Select</button>
            </div>
            <small className="fa-foot">Enter or R to retry</small>
          </div>
        )}

        {(overlay === "complete" || overlay === "victory") && result && (
          <div className={`fa-screen fa-screen--modal fa-screen--win${overlay === "victory" ? " is-victory" : ""}`}>
            <h2 className="fa-h2">{overlay === "victory" ? "The Twin Temple is Free!" : "Level Complete!"}</h2>
            {overlay === "victory" && (
              <p className="fa-sub">
                {doneCount >= LEVEL_COUNT ? "All 40 levels cleared — Flame and Aqua escaped together." : `You reached the heart of the temple! ${doneCount}/${LEVEL_COUNT} levels cleared.`}
              </p>
            )}
            <div className="fa-stats">
              <div><span>Time</span><strong>{fmtTime(result.time)}</strong></div>
              <div><span>Best</span><strong>{fmtTime(result.best)}</strong></div>
              <div><span>Gems</span><strong>{result.gems}/{result.maxGems}</strong></div>
            </div>
            {result.newBest && !result.firstClear && <p className="fa-badge">★ New best time ★</p>}
            {result.gems === result.maxGems && <p className="fa-badge fa-badge--gem">💎 Every gem collected</p>}
            <div className="fa-menu-btns">
              {overlay === "complete" ? (
                <button type="button" className="fa-btn fa-btn--big" onClick={nextLevel}>Next Level →</button>
              ) : (
                <button type="button" className="fa-btn fa-btn--big" onClick={() => toMenu("worlds")}>Temple Map</button>
              )}
              <button type="button" className="fa-btn" onClick={restart}>Replay</button>
              <button type="button" className="fa-btn fa-btn--ghost" onClick={() => toMenu("levels")}>Level Select</button>
            </div>
            {overlay === "complete" && <small className="fa-foot">Enter for the next level</small>}
          </div>
        )}

        {screen === "menu" && confirmReset !== null && progress.unlocked > 1 && (
          <div className="fa-reset">
            {confirmReset ? (
              <>
                <span>Erase all progress?</span>
                <button type="button" onClick={() => { setProgress((p) => ({ ...p, unlocked: 1, best: {}, gems: {} })); setConfirmReset(false); }}>Yes, erase</button>
                <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmReset(true)}>Reset progress</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function deathLine(s) {
  const p = s.players.find((x) => x.dead);
  if (!p) return "";
  const who = p.id === "flame" ? "Flame" : "Aqua";
  switch (p.cause) {
    case "water": return `${who} fizzled out in the water.`;
    case "fire": return `${who} evaporated in the fire.`;
    case "toxic": return `${who} fell into the toxic goo.`;
    case "saw": return `${who} was caught by a saw.`;
    default: return `${who} was caught by a hazard.`;
  }
}
