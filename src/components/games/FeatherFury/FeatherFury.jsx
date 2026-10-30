/**
 * Feather Fury: Island Siege — a 2D slingshot physics game. Rendered on one
 * <canvas> inside the shared <GamePlayer> (registered by name in
 * ../registry.js); menus and HUD are React overlays.
 *
 * The Matter.js world lives in engine/game.js and is stepped at a fixed 60 Hz
 * from a rAF loop that never touches React state on its own — the HUD is
 * synced only when a shown value changes. Input is pointer-based (mouse and
 * touch): drag the bird back to aim, release to fire, tap in flight for the
 * bird's ability, drag elsewhere to look around.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current level; `muted`
 * silences the WebAudio synth. Progress lives under `feather-fury-island-siege-save`.
 */
import { useEffect, useRef, useState } from "react";
import { DT, SLING, clampPull, createGame, destroyGame, step, launch, triggerAbility, currentBird, MAX_PULL } from "./engine/game.js";
import { LEVELS, WORLDS, levelsOfWorld } from "./data/levels.js";
import { BIRD_INFO } from "./data/worlds.js";
import { loadProgress, saveProgress, recordWin, isUnlocked, isDone, totalStars, LEVEL_COUNT } from "./engine/save.js";
import { createView, fitView, startIntro, updateCamera, toWorld, drawFrame, spawnFx, stepFx } from "./render/draw.js";
import { audio } from "./audio.js";
import "./FeatherFury.css";

const TEST = import.meta.env.DEV && typeof window !== "undefined" && /[?&]fftest=1/.test(window.location.search);
const MANUAL = TEST && /[?&]ffmanual=1/.test(window.location.search);
const NOSAVE = TEST && /[?&]nosave=1/.test(window.location.search);

const levelLabel = (def) => `${def.world + 1}-${((def.id - 1) % 10) + 1}`;
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const ABILITY_HINT = { yellow: "Tap to dash!", black: "Tap to explode!", blue: "Tap to split!" };

function hudOf(g) {
  const flying = g.state === "flying" && g.shot;
  return {
    score: g.score,
    left: g.queue.length - g.next,
    defeated: g.defeated,
    total: g.totalEnemies,
    ability: flying && !g.shot.abilityUsed && !g.shot.touched && ABILITY_HINT[g.shot.type] ? g.shot.type : null,
    state: g.state,
  };
}
const sameHud = (a, b) => a.score === b.score && a.left === b.left && a.defeated === b.defeated && a.ability === b.ability && a.state === b.state && a.total === b.total;

export default function FeatherFury({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = createGame(LEVELS[0]);
  const viewRef = useRef(null);
  if (!viewRef.current) viewRef.current = createView();
  const fxRef = useRef([]);
  const accRef = useRef(0);
  const aimRef = useRef({ mode: null, id: -1, pull: null, sx: 0, cam: 0, creak: 0 });

  const [progress, setProgressState] = useState(() => (NOSAVE ? loadProgress(null) : loadProgress()));
  const progressRef = useRef(progress);
  const setProgress = (fn) => {
    const next = typeof fn === "function" ? fn(progressRef.current) : fn;
    progressRef.current = next;
    setProgressState(next);
    if (!NOSAVE) saveProgress(next);
  };

  const [screen, setScreenState] = useState("menu"); // menu | worlds | levels | play
  const [overlay, setOverlayState] = useState(null); // null | pause | complete | lost | victory | help
  const [world, setWorld] = useState(0);
  const [levelId, setLevelId] = useState(1);
  const [hud, setHud] = useState(() => hudOf(gameRef.current));
  const [result, setResult] = useState(null);
  const [hintOn, setHintOn] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // refs mirror the UI state for the loop and the event handlers
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
    const h = hudOf(gameRef.current);
    setHud((o) => (sameHud(o, h) ? o : h));
  };

  const cancelAim = () => {
    aimRef.current.mode = null;
    aimRef.current.pull = null;
    aimRef.current.id = -1;
  };

  const loadLevel = (id) => {
    destroyGame(gameRef.current);
    const g = createGame(LEVELS[id - 1]);
    gameRef.current = g;
    fxRef.current = [];
    accRef.current = 0;
    cancelAim();
    const v = viewRef.current;
    fitView(v, g.def, v.w, v.h, v.dpr);
    return g;
  };

  const startLevel = (id) => {
    const def = LEVELS[id - 1];
    loadLevel(id);
    startIntro(viewRef.current);
    ui.current.levelId = id;
    setLevelId(id);
    setWorld(def.world);
    setResult(null);
    setOverlay(null);
    setScreen("play");
    setHintOn(!!def.hint);
    syncHud();
    draw();
  };
  const restart = () => {
    if (ui.current.screen === "play") startLevel(ui.current.levelId);
  };
  const pause = () => {
    if (ui.current.screen === "play" && !ui.current.overlay) {
      cancelAim();
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
    loadLevel(ui.current.levelId);
    viewRef.current.intro = 0;
    syncHud();
  };
  const nextLevel = () => {
    const id = ui.current.levelId;
    if (id < LEVEL_COUNT) startLevel(id + 1);
    else toMenu("worlds");
  };

  /* ---------------------------------------------------------------- loop */

  const onEnd = (g) => {
    if (g.state === "won") {
      const id = g.def.id;
      const prev = progressRef.current;
      const r = g.result;
      setProgress((p) => recordWin(p, id, r.score, r.stars));
      setResult({ ...r, best: Math.max(prev.best[id] || 0, r.score), newBest: !!prev.best[id] && r.score > prev.best[id] });
      setOverlay(id === LEVEL_COUNT ? "victory" : "complete");
    } else {
      setResult({ ...g.result, left: g.totalEnemies - g.defeated });
      setOverlay("lost");
    }
  };

  function draw() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const a = aimRef.current;
    drawFrame(ctx, gameRef.current, viewRef.current, fxRef.current, { aiming: a.mode === "aim", pull: a.pull });
  }

  const frame = (dt) => {
    const g = gameRef.current;
    const v = viewRef.current;
    const playing = ui.current.screen === "play" && !ui.current.overlay;
    if (playing) {
      accRef.current = Math.min(accRef.current + dt, 0.1);
      while (accRef.current >= DT) {
        accRef.current -= DT;
        step(g);
      }
      if (g.events.length) {
        for (const e of g.events) {
          audio.play(e);
          spawnFx(fxRef.current, e, v);
        }
        g.events.length = 0;
      }
      if (aimRef.current.mode === "aim" && g.state !== "ready") cancelAim();
      if ((g.state === "won" || g.state === "lost") && g.stateT > (g.state === "won" ? 1.6 : 0.8) && !ui.current.overlay) onEnd(g);
      syncHud();
    }
    if (playing || ui.current.screen !== "play") {
      updateCamera(v, g, dt);
      stepFx(fxRef.current, dt);
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

  // fit the canvas to the stage at device resolution
  useEffect(() => {
    const el = stageRef.current;
    const fit = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const c = canvasRef.current;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      fitView(viewRef.current, gameRef.current.def, w, h, dpr);
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

  // free the physics world when the game unmounts (StrictMode remounts get a fresh one)
  useEffect(() => {
    if (gameRef.current.destroyed) gameRef.current = createGame(gameRef.current.def);
    return () => destroyGame(gameRef.current);
  }, []);

  /* ---------------------------------------------------------------- input */

  const pointerPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const onPointerDown = (e) => {
    audio.unlock();
    if (ui.current.screen !== "play" || ui.current.overlay) return;
    if (e.button !== undefined && e.button > 0) return;
    const g = gameRef.current;
    const v = viewRef.current;
    const a = aimRef.current;
    if (a.mode) return; // a second finger while aiming
    setHintOn(false);
    if (v.intro > 0) v.intro = 0;
    const { sx, sy } = pointerPos(e);
    if (g.state === "flying") {
      triggerAbility(g);
      return;
    }
    const w = toWorld(v, sx, sy);
    const grab = Math.max(70, 46 / v.zoom);
    a.id = e.pointerId;
    if (g.state === "ready" && Math.hypot(w.x - SLING.x, w.y - SLING.y) < grab) {
      a.mode = "aim";
      a.pull = clampPull(w.x - SLING.x, w.y - SLING.y);
    } else {
      a.mode = "pan";
      a.sx = sx;
      a.cam = v.camX;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  const onPointerMove = (e) => {
    const a = aimRef.current;
    if (!a.mode || e.pointerId !== a.id) return;
    const v = viewRef.current;
    const { sx, sy } = pointerPos(e);
    if (a.mode === "aim") {
      const w = toWorld(v, sx, sy);
      a.pull = clampPull(w.x - SLING.x, w.y - SLING.y);
      const now = performance.now();
      if (now - a.creak > 90) {
        a.creak = now;
        audio.stretch(Math.hypot(a.pull.x, a.pull.y) / MAX_PULL);
      }
    } else if (Math.abs(sx - a.sx) > 4 || v.manual) {
      v.manual = true;
      v.camX = Math.max(v.minCam, Math.min(v.maxCam, a.cam - (sx - a.sx) / v.zoom));
    }
  };

  const onPointerUp = (e) => {
    const a = aimRef.current;
    if (!a.mode || e.pointerId !== a.id) return;
    if (a.mode === "aim" && e.type === "pointerup" && a.pull) {
      const g = gameRef.current;
      if (launch(g, a.pull)) viewRef.current.manual = false;
    }
    cancelAim();
  };

  const actions = useRef({});
  actions.current = { pause, resume, restart, nextLevel, toMenu, startLevel };
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.("input, textarea, select, [contenteditable]")) return;
      const { screen: sc, overlay: ov } = ui.current;
      if (sc !== "play") return;
      const a = actions.current;
      const k = e.code;
      if (k === "Escape" || k === "KeyP") {
        e.preventDefault();
        if (ov === "pause") a.resume();
        else if (!ov) a.pause();
      } else if (k === "KeyR") {
        e.preventDefault();
        if (ov !== "help") a.restart();
      } else if (k === "Space") {
        e.preventDefault();
        if (!ov) triggerAbility(gameRef.current);
      } else if (k === "Enter" && !e.repeat) {
        e.preventDefault();
        if (ov === "lost") a.restart();
        else if (ov === "complete") a.nextLevel();
        else if (ov === "pause") a.resume();
      }
    };
    const onBlur = () => actions.current.pause();
    const onVis = () => document.hidden && onBlur();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onKey);
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
    const id = setTimeout(() => setHintOn(false), 7000);
    return () => clearTimeout(id);
  }, [hintOn, levelId]);

  if (TEST) {
    window.__ff = {
      game: () => gameRef.current,
      view: viewRef.current,
      screen: () => ui.current.screen,
      overlay: () => ui.current.overlay,
      progress: () => progressRef.current,
      setProgress,
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
  const stars = totalStars(progress);
  const g = gameRef.current;
  const pouch = screen === "play" && hud.state === "ready" ? currentBird(g) : null;

  return (
    <div className="ff">
      <div
        ref={stageRef}
        className="ff-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="ff-canvas" />

        {screen === "play" && (
          <div className="ff-hud">
            <div className="ff-chip ff-chip--level">
              <b>{levelLabel(def)}</b>
              <span>{def.name}</span>
            </div>
            <div className="ff-chip ff-chip--foes" title="Mokos defeated">
              <i className="ff-moko" /> {hud.defeated}/{hud.total}
            </div>
            <div className="ff-chip ff-chip--birds" title="Birds left">
              <i className="ff-feather" /> {hud.left}
            </div>
            <div className="ff-score">
              <strong>{fmt(hud.score)}</strong>
              <span>Best {fmt(progress.best[def.id] || 0)}</span>
            </div>
            <div className="ff-hud-btns">
              <button type="button" className="ff-icon" onPointerDown={(e) => e.stopPropagation()} onClick={restart} aria-label="Restart level" title="Restart (R)">↻</button>
              <button type="button" className="ff-icon" onPointerDown={(e) => e.stopPropagation()} onClick={pause} aria-label="Pause" title="Pause (Esc / P)">❚❚</button>
            </div>
          </div>
        )}
        {screen === "play" && !overlay && hud.ability && <div className="ff-tap">{ABILITY_HINT[hud.ability]}</div>}
        {screen === "play" && !overlay && hintOn && <div className="ff-hint">{def.hint}</div>}
        {screen === "play" && !overlay && <div className="ff-rotate">Tip: turn your phone sideways for a bigger view</div>}
        {screen === "play" && !overlay && pouch && !hintOn && BIRD_INFO[pouch] && (
          <div className="ff-next" style={{ "--c": BIRD_INFO[pouch].color }}>
            <b>{BIRD_INFO[pouch].name}</b> {BIRD_INFO[pouch].power}
          </div>
        )}

        {screen === "menu" && !overlay && (
          <div className="ff-screen ff-screen--menu">
            <div className="ff-logo">
              <span className="ff-logo-a">Feather</span>
              <span className="ff-logo-b">Fury</span>
            </div>
            <div className="ff-logo-sub">Island Siege</div>
            <p className="ff-tag">Aim Smart. Launch Fast. Smash Everything!</p>
            <div className="ff-menu-btns">
              <button type="button" className="ff-btn ff-btn--big" onClick={() => startLevel(Math.min(progress.unlocked, LEVEL_COUNT))}>
                {Object.keys(progress.stars).length ? `Continue · ${levelLabel(LEVELS[Math.min(progress.unlocked, LEVEL_COUNT) - 1])}` : "Play"}
              </button>
              <button type="button" className="ff-btn" onClick={() => setScreen("worlds")}>Select Level</button>
              <button type="button" className="ff-btn" onClick={() => setOverlay("help")}>How to Play</button>
              <button type="button" className="ff-btn ff-btn--ghost" onClick={() => setProgress((p) => ({ ...p, sound: !p.sound }))}>
                Sound: {progress.sound ? "On" : "Off"}
              </button>
            </div>
            <small className="ff-foot">★ {stars}/{LEVEL_COUNT * 3} stars · {Object.keys(progress.stars).length}/{LEVEL_COUNT} levels cleared</small>
          </div>
        )}

        {screen === "worlds" && (
          <div className="ff-screen">
            <h2 className="ff-h2">Choose an Island</h2>
            <div className="ff-worlds">
              {WORLDS.map((w) => {
                const lv = levelsOfWorld(w.id);
                const open = isUnlocked(progress, lv[0].id);
                const st = lv.reduce((s, l) => s + (progress.stars[l.id] || 0), 0);
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={`ff-world${open ? "" : " is-locked"}`}
                    style={{ "--accent": w.accent, "--sky0": w.sky[0], "--sky1": w.sky[1], "--gr": w.ground[0] }}
                    disabled={!open}
                    onClick={() => {
                      setWorld(w.id);
                      setScreen("levels");
                    }}
                  >
                    <span className="ff-world-n">World {w.id + 1}</span>
                    <strong>{w.name}</strong>
                    <span className="ff-world-blurb">{open ? w.blurb : "Clear the previous island to unlock"}</span>
                    <span className="ff-world-n">{open ? `★ ${st}/30` : "🔒 Locked"}</span>
                  </button>
                );
              })}
            </div>
            <div className="ff-row">
              <button type="button" className="ff-btn ff-btn--ghost" onClick={() => setScreen("menu")}>← Back</button>
            </div>
          </div>
        )}

        {screen === "levels" && (
          <div className="ff-screen">
            <h2 className="ff-h2" style={{ color: WORLDS[world].accent }}>{WORLDS[world].name}</h2>
            <div className="ff-levels">
              {levelsOfWorld(world).map((l) => {
                const open = isUnlocked(progress, l.id);
                const s = progress.stars[l.id] || 0;
                return (
                  <button key={l.id} type="button" className={`ff-level${open ? "" : " is-locked"}${s ? " is-done" : ""}`} disabled={!open} onClick={() => startLevel(l.id)} title={open ? l.name : "Locked"}>
                    <b>{open ? ((l.id - 1) % 10) + 1 : "🔒"}</b>
                    <span className="ff-level-stars">{[1, 2, 3].map((i) => <i key={i} className={i <= s ? "on" : ""}>★</i>)}</span>
                  </button>
                );
              })}
            </div>
            <div className="ff-row">
              <button type="button" className="ff-btn ff-btn--ghost" onClick={() => setScreen("worlds")}>← Islands</button>
              <button type="button" className="ff-btn ff-btn--ghost" disabled={world === 0} onClick={() => setWorld(world - 1)}>‹ Prev</button>
              <button type="button" className="ff-btn ff-btn--ghost" disabled={world === WORLDS.length - 1 || !isUnlocked(progress, levelsOfWorld(world + 1)[0]?.id)} onClick={() => setWorld(world + 1)}>Next ›</button>
            </div>
          </div>
        )}

        {overlay === "help" && (
          <div className="ff-screen ff-screen--modal">
            <h2 className="ff-h2">How to Play</h2>
            <ul className="ff-help-list">
              <li><b>Drag</b> the bird in the slingshot backwards, aim with the dotted guide, and <b>release</b> to launch.</li>
              <li>Defeat every <b>Moko</b> to win. Falling blocks and big drops hurt them too.</li>
              <li><b>Tap</b> (or press Space) while a bird is flying to use its power — once, before it hits anything.</li>
              <li>Drag anywhere else to look around. Unused birds give a <b>10,000</b> bonus each.</li>
            </ul>
            <div className="ff-birds">
              {Object.entries(BIRD_INFO).map(([k, b]) => (
                <div key={k} className="ff-bird" style={{ "--c": b.color }}>
                  <i />
                  <b>{b.name}</b>
                  <span>{b.power}</span>
                </div>
              ))}
            </div>
            <p className="ff-mats"><em className="m-wood">Wood</em> breaks easily · <em className="m-glass">Glass</em> shatters · <em className="m-stone">Stone</em> is tough · <em className="m-ice">Ice</em> slides · <em className="m-tnt">Crates</em> explode</p>
            <button type="button" className="ff-btn" onClick={() => setOverlay(null)}>Got it</button>
          </div>
        )}

        {overlay === "pause" && (
          <div className="ff-screen ff-screen--modal">
            <h2 className="ff-h2">Paused</h2>
            <p className="ff-sub">{levelLabel(def)} · {def.name}</p>
            <div className="ff-menu-btns">
              <button type="button" className="ff-btn ff-btn--big" onClick={resume}>Resume</button>
              <button type="button" className="ff-btn" onClick={restart}>Restart Level</button>
              <button type="button" className="ff-btn" onClick={() => toMenu("levels")}>Level Select</button>
              <button type="button" className="ff-btn ff-btn--ghost" onClick={() => toMenu("menu")}>Main Menu</button>
            </div>
            <small className="ff-foot">Esc / P to resume · R to restart</small>
          </div>
        )}

        {overlay === "lost" && result && (
          <div className="ff-screen ff-screen--modal ff-screen--lost">
            <h2 className="ff-h2">Out of Birds!</h2>
            <p className="ff-sub">{result.left === 1 ? "One Moko is still giggling." : `${result.left} Mokos are still giggling.`} Try a different angle!</p>
            <div className="ff-stats">
              <div><span>Score</span><strong>{fmt(result.score)}</strong></div>
            </div>
            <div className="ff-menu-btns">
              <button type="button" className="ff-btn ff-btn--big" onClick={restart}>Try Again</button>
              <button type="button" className="ff-btn ff-btn--ghost" onClick={() => toMenu("levels")}>Level Select</button>
            </div>
            <small className="ff-foot">Enter or R to retry</small>
          </div>
        )}

        {(overlay === "complete" || overlay === "victory") && result && (
          <div className={`ff-screen ff-screen--modal ff-screen--win${overlay === "victory" ? " is-victory" : ""}`}>
            <h2 className="ff-h2">{overlay === "victory" ? "The Island is Saved!" : "Level Complete!"}</h2>
            {overlay === "victory" && (
              <p className="ff-sub">
                The Moko King is toppled and the Sunfruit is home. {Object.keys(progress.stars).length >= LEVEL_COUNT ? `All ${LEVEL_COUNT} levels cleared with ★ ${stars}/${LEVEL_COUNT * 3}.` : `${Object.keys(progress.stars).length}/${LEVEL_COUNT} levels cleared.`}
              </p>
            )}
            <div className="ff-stars">
              {[1, 2, 3].map((i) => (
                <span key={i} className={`ff-star${i <= result.stars ? " on" : ""}`} style={{ animationDelay: `${0.15 + i * 0.25}s` }}>★</span>
              ))}
            </div>
            <div className="ff-stats">
              <div><span>Score</span><strong>{fmt(result.score)}</strong></div>
              <div><span>Bird bonus</span><strong>{fmt(result.bonus)}</strong></div>
              <div><span>Best</span><strong>{fmt(result.best)}</strong></div>
            </div>
            {result.newBest && <p className="ff-badge">★ New high score ★</p>}
            <div className="ff-menu-btns">
              {overlay === "complete" ? (
                <button type="button" className="ff-btn ff-btn--big" onClick={nextLevel}>Next Level →</button>
              ) : (
                <button type="button" className="ff-btn ff-btn--big" onClick={() => toMenu("worlds")}>Island Map</button>
              )}
              <button type="button" className="ff-btn" onClick={restart}>Replay</button>
              <button type="button" className="ff-btn ff-btn--ghost" onClick={() => toMenu("levels")}>Level Select</button>
            </div>
            {overlay === "complete" && <small className="ff-foot">Enter for the next level</small>}
          </div>
        )}

        {screen === "menu" && !overlay && progress.unlocked > 1 && (
          <div className="ff-reset">
            {confirmReset ? (
              <>
                <span>Erase all progress?</span>
                <button type="button" onClick={() => { setProgress((p) => ({ ...p, unlocked: 1, best: {}, stars: {} })); setConfirmReset(false); }}>Yes, erase</button>
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
