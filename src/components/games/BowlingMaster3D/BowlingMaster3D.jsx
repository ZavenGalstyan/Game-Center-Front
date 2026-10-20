/**
 * Bowling Master 3D — ten-pin bowling for the Game Center (Sports).
 *
 * One requestAnimationFrame loop steps the lane physics (physics.js) and
 * mirrors it into a plain Three.js alley (scene.js). Scoring is pure
 * (scoring.js). React only draws the HUD and the menu / pause / results cards;
 * per-frame values (power meter) are written straight to the DOM.
 *
 * Controls: mouse / A-D aim · ←/→ ball position · ↑/↓ or W/S spin ·
 * hold Space or mouse button to charge power, release to bowl · Esc/P pause.
 *
 * GamePlayer: `restartSignal` starts a new game (ignored on the main menu),
 * `muted` silences audio, Fullscreen just resizes the stage.
 * DEV hook: `?bmtest=1` exposes window.__bm.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./BowlingMaster3D.css";
import { createScene, BALL_COLORS } from "./scene.js";
import { createSim, rackPins, sweepFallen, launch, stepSim, isSettled, standingCount, isStanding, predictPath, powerToSpeed, MAX_X } from "./physics.js";
import { nextRoll, frameTotals, frameMarks, totalScore, gameStats } from "./scoring.js";
import { audio } from "./audio.js";

const STORE_KEY = "bowling-master-3d-progress";
const MAX_ANGLE = 0.045;
const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bmtest");
const PIN_ROWS = [[6, 7, 8, 9], [3, 4, 5], [1, 2], [0]];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return { best: 0, games: 0, ball: 0, ...(s && typeof s === "object" ? s : {}) };
  } catch {
    return { best: 0, games: 0, ball: 0 };
  }
}
function saveStore(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked — best score just won't persist */
  }
}

function ScoreSheet({ rolls, compact = false }) {
  const marks = frameMarks(rolls);
  const totals = frameTotals(rolls);
  const cur = nextRoll(rolls);
  return (
    <div className={`bm-sheet${compact ? " is-compact" : ""}`}>
      {marks.map((m, i) => (
        <div key={i} className={`bm-frame${i === 9 ? " is-tenth" : ""}${!cur.over && i === cur.frame ? " is-cur" : ""}`}>
          <span className="bm-frame-n">{i + 1}</span>
          <div className="bm-marks">
            {m.map((c, j) => (
              <span key={j} className={c === "X" ? "is-x" : c === "/" ? "is-sp" : ""}>{c}</span>
            ))}
          </div>
          <b>{totals[i] ?? ""}</b>
        </div>
      ))}
      <div className="bm-frame bm-total">
        <span className="bm-frame-n">Total</span>
        <b>{totalScore(rolls)}</b>
      </div>
    </div>
  );
}

export default function BowlingMaster3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const meterRef = useRef(null);
  const meterValRef = useRef(null);
  const sceneRef = useRef(null);
  const simRef = useRef(null);
  const g = useRef(null);
  if (!g.current) {
    g.current = { phase: "menu", rolls: [], info: nextRoll([]), before: 10, timer: 0, swept: false, resetFull: false, streak: 0, x: 0, angle: 0, spin: 0, power: 0, pdir: 1, lastPower: 0, keys: new Set(), paused: false, aimKey: "", aimPath: null, overShown: false, camBack: false, hudT: 0, pinKey: "" };
  }
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = loadStore();

  const [screen, setScreenState] = useState("menu"); // menu | play | results
  const [paused, setPausedState] = useState(false);
  const [phase, setPhaseState] = useState("menu");
  const [rolls, setRolls] = useState([]);
  const [shot, setShot] = useState({ x: 0, angle: 0, spin: 0 });
  const [banner, setBanner] = useState(null);
  const [pinsUp, setPinsUp] = useState(() => Array(10).fill(true));
  const [result, setResult] = useState(null);
  const [store, setStore] = useState(storeRef.current);
  const [howTo, setHowTo] = useState(false);
  const screenRef = useRef("menu");
  const alive = useRef(true);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setPhase = useCallback((p) => {
    g.current.phase = p;
    setPhaseState(p);
  }, []);
  const setPaused = useCallback((p) => {
    g.current.paused = p;
    setPausedState(p);
  }, []);
  const pushShot = useCallback(() => {
    const G = g.current;
    setShot({ x: G.x, angle: G.angle, spin: G.spin });
  }, []);
  const bannerId = useRef(0);
  const showBanner = useCallback((text, sub = "", kind = "info", ms = 1700) => {
    const id = ++bannerId.current;
    setBanner({ id, text, sub, kind });
    setTimeout(() => alive.current && setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);

  /* ------------------------------------------------------------ flow */
  const resetBallIdle = useCallback(() => {
    const b = simRef.current.ball;
    Object.assign(b, { x: g.current.x, z: 0.35, y: 0.109, vx: 0, vz: 0, state: "idle" });
  }, []);

  const startGame = useCallback(() => {
    const G = g.current;
    const sc = sceneRef.current;
    audio.unlock();
    audio.cue("ui");
    Object.assign(G, { rolls: [], info: nextRoll([]), streak: 0, x: 0, angle: 0, spin: 0, power: 0, timer: 0, aimKey: "", overShown: false, pinKey: "" });
    G.keys.clear();
    rackPins(simRef.current);
    resetBallIdle();
    sc?.setRackDrop(0);
    sc?.setSweep(null);
    sc?.setCamMode("aim");
    setRolls([]);
    setBanner(null);
    setResult(null);
    setHowTo(false);
    pushShot();
    setPaused(false);
    setPhase("aim");
    setScreen("play");
  }, [pushShot, resetBallIdle, setPaused, setPhase, setScreen]);

  const toMenu = useCallback(() => {
    const G = g.current;
    audio.roll(0);
    rackPins(simRef.current);
    G.x = 0;
    resetBallIdle();
    sceneRef.current?.setSweep(null);
    sceneRef.current?.setRackDrop(0);
    sceneRef.current?.setCamMode("menu");
    setPaused(false);
    setPhase("menu");
    setScreen("menu");
    setBanner(null);
  }, [resetBallIdle, setPaused, setPhase, setScreen]);

  const startCharge = useCallback(() => {
    const G = g.current;
    if (screenRef.current !== "play" || G.paused || G.phase !== "aim") return;
    audio.unlock();
    G.power = 0;
    G.pdir = 1;
    setPhase("charge");
  }, [setPhase]);

  const throwBall = useCallback(() => {
    const G = g.current;
    if (G.phase !== "charge" || G.paused) return;
    const sim = simRef.current;
    G.before = standingCount(sim);
    G.lastPower = G.power;
    launch(sim, { x: G.x, angle: G.angle, speed: powerToSpeed(G.power), spin: G.spin });
    sceneRef.current.setCamMode("follow");
    setPhase("roll");
  }, [setPhase]);

  const resolveRoll = useCallback(() => {
    const G = g.current;
    const sim = simRef.current;
    const prev = G.info;
    const knocked = clamp(G.before - standingCount(sim), 0, prev.standing);
    G.rolls = [...G.rolls, knocked];
    G.info = nextRoll(G.rolls);
    setRolls(G.rolls);
    if (prev.fullRack && knocked === 10) {
      G.streak++;
      const sub = G.streak === 2 ? "Double!" : G.streak === 3 ? "Turkey!" : G.streak > 3 ? `${G.streak} in a row!` : "All ten down";
      showBanner("STRIKE!", sub, "strike", 2000);
      audio.cue("strike");
      sceneRef.current.flash(1);
    } else {
      G.streak = 0;
      if (!prev.fullRack && knocked === prev.standing) {
        showBanner("SPARE!", "Cleared the rack", "spare");
        audio.cue("spare");
        sceneRef.current.flash(0.6);
      } else if (knocked === 0) {
        const gut = sim.ball.state === "pit" && Math.abs(sim.ball.x) > 0.52;
        showBanner(gut ? "GUTTER" : "MISS", gut ? "Into the channel" : "No pins down", "miss");
        audio.cue("gutter");
      } else showBanner(`${knocked}`, knocked === 1 ? "pin" : "pins", "count", 1300);
    }
    if (G.info.over) {
      G.timer = 2.6;
      G.overShown = false;
      setPhase("over");
    } else {
      Object.assign(G, { timer: 0, swept: false, camBack: false, resetFull: G.info.fullRack });
      setPhase("reset");
    }
  }, [setPhase, showBanner]);

  const finishGame = useCallback(() => {
    const G = g.current;
    const score = totalScore(G.rolls);
    const prevBest = storeRef.current.best;
    const s = { ...storeRef.current, best: Math.max(prevBest, score), games: storeRef.current.games + 1 };
    storeRef.current = s;
    saveStore(s);
    setStore(s);
    setResult({ score, prevBest, newBest: score > prevBest, ...gameStats(G.rolls), rolls: G.rolls });
    audio.cue("over");
    sceneRef.current.setCamMode("menu");
    setPhase("menu");
    setScreen("results");
  }, [setPhase, setScreen]);

  const togglePause = useCallback(() => {
    const G = g.current;
    if (screenRef.current !== "play") return;
    if (!G.paused && G.phase === "charge") setPhase("aim");
    G.keys.clear();
    audio.roll(0);
    setPaused(!G.paused);
  }, [setPaused, setPhase]);

  const nudge = useCallback((k, d) => {
    const G = g.current;
    if (G.phase !== "aim" && G.phase !== "charge") return;
    if (k === "x") G.x = clamp(G.x + d, -MAX_X, MAX_X);
    if (k === "angle") G.angle = clamp(G.angle + d, -MAX_ANGLE, MAX_ANGLE);
    if (k === "spin") G.spin = clamp(Math.round((G.spin + d) * 10) / 10, -1, 1);
    pushShot();
  }, [pushShot]);

  const chooseBall = useCallback((i) => {
    const s = { ...storeRef.current, ball: i };
    storeRef.current = s;
    saveStore(s);
    setStore(s);
    sceneRef.current?.setBallColor(i);
    audio.unlock();
    audio.cue("ui");
  }, []);

  /* ------------------------------------------------------------ scene + loop */
  useEffect(() => {
    alive.current = true;
    // a fresh canvas per mount: StrictMode re-runs this effect and a disposed
    // renderer leaves its canvas with a lost context
    const canvas = document.createElement("canvas");
    canvas.className = "bm-canvas";
    stageRef.current.appendChild(canvas);
    const sc = createScene(canvas);
    sceneRef.current = sc;
    sc.setBallColor(storeRef.current.ball);
    const sim = createSim();
    simRef.current = sim;
    rackPins(sim);
    resetBallIdle();
    sc.setCamMode("menu", true);

    const ro = new ResizeObserver(() => {
      const el = stageRef.current;
      if (el) sc.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(stageRef.current);
    sc.resize(stageRef.current.clientWidth, stageRef.current.clientHeight);

    let raf = 0;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      raf = requestAnimationFrame(frame);
    };

    function step(dt) {
      const G = g.current;
      const live = !G.paused;
      if (live && (G.phase === "aim" || G.phase === "charge")) {
        const k = G.keys;
        let ch = false;
        const mv = (cond, key, d, lo, hi) => {
          if (!cond) return;
          G[key] = clamp(G[key] + d, lo, hi);
          ch = true;
        };
        mv(k.has("ArrowLeft"), "x", -0.45 * dt, -MAX_X, MAX_X);
        mv(k.has("ArrowRight"), "x", 0.45 * dt, -MAX_X, MAX_X);
        mv(k.has("KeyA"), "angle", -0.03 * dt, -MAX_ANGLE, MAX_ANGLE);
        mv(k.has("KeyD"), "angle", 0.03 * dt, -MAX_ANGLE, MAX_ANGLE);
        mv(k.has("ArrowUp") || k.has("KeyW"), "spin", 1.2 * dt, -1, 1);
        mv(k.has("ArrowDown") || k.has("KeyS"), "spin", -1.2 * dt, -1, 1);
        if (ch) pushShot();
        if (G.phase === "charge") {
          G.power += G.pdir * dt * 1.05;
          if (G.power >= 1) [G.power, G.pdir] = [1, -1];
          if (G.power <= 0) [G.power, G.pdir] = [0, 1];
        }
        resetBallIdle();
        const key = `${G.x.toFixed(3)}|${G.angle.toFixed(4)}|${G.spin.toFixed(2)}`;
        if (key !== G.aimKey) {
          G.aimKey = key;
          G.aimPath = predictPath(G.x, G.angle, powerToSpeed(0.65), G.spin, -9, 0.02);
        }
      } else if (live && G.phase === "roll") {
        stepSim(sim, dt);
        for (const e of sim.events) audio.hit(e.v, e.ball);
        sim.events.length = 0;
        const b = sim.ball;
        audio.roll(b.state === "roll" || b.state === "gutter" ? Math.hypot(b.vx, b.vz) : 0, b.state === "gutter");
        if (b.z < -14.5) sc.setCamMode("pins");
        if (isSettled(sim)) {
          audio.roll(0);
          G.timer = 0.6;
          setPhase("settle");
        }
      } else if (live && G.phase === "settle") {
        stepSim(sim, dt);
        sim.events.length = 0;
        G.timer -= dt;
        if (G.timer <= 0) resolveRoll();
      } else if (live && G.phase === "reset") {
        G.timer += dt;
        const t = G.timer;
        sc.setRackDrop(t < 0.25 ? ease(t / 0.25) * 0.45 : t < 0.85 ? 0.45 : 0.45 * (1 - ease(Math.min(1, (t - 0.85) / 0.45))));
        sc.setSweep(t >= 0.25 && t < 0.85 ? -17.3 - ((t - 0.25) / 0.6) * 2.1 : null);
        if (!G.swept && t >= 0.5) {
          G.swept = true;
          if (G.resetFull) rackPins(sim);
          else sweepFallen(sim);
        }
        if (!G.camBack && t >= 0.6) {
          G.camBack = true;
          resetBallIdle();
          sc.setCamMode("aim");
        }
        if (t >= 1.3) {
          sc.setRackDrop(0);
          G.aimKey = "";
          setPhase("aim");
        }
      } else if (live && G.phase === "over") {
        stepSim(sim, dt);
        sim.events.length = 0;
        G.timer -= dt;
        if (!G.overShown && G.timer < 1.4) {
          G.overShown = true;
          showBanner("GAME OVER", `Final score ${totalScore(G.rolls)}`, "over", 1600);
        }
        if (G.timer <= 0) finishGame();
      }

      // HUD bits that change every frame go straight to the DOM
      if (meterRef.current) {
        const p = G.phase === "charge" ? G.power : G.phase === "aim" ? 0 : G.lastPower;
        meterRef.current.style.transform = `scaleY(${p.toFixed(3)})`;
        if (meterValRef.current) meterValRef.current.textContent = `${Math.round(p * 100)}%`;
      }
      G.hudT -= dt;
      if (G.hudT <= 0) {
        G.hudT = 0.1;
        const up = sim.pins.map(isStanding);
        const key = up.join();
        if (key !== G.pinKey) {
          G.pinKey = key;
          setPinsUp(up);
        }
      }
      const aiming = screenRef.current === "play" && (G.phase === "aim" || G.phase === "charge");
      sc.update(live ? dt : 0, sim, aiming ? G.aimPath : null);
      sc.render();
    }

    // DEV: rAF can be throttled in automation — let QA drive frames by hand
    if (TEST) window.__bm = { g: g.current, sim, sc, run: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) step(dt); } };
    raf = requestAnimationFrame(frame);
    return () => {
      alive.current = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      sc.dispose();
      canvas.remove();
      sceneRef.current = null;
      if (TEST) delete window.__bm;
    };
    // the loop reads everything through refs; the callbacks below are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ input */
  useEffect(() => {
    const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "Space"]);
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    const down = (e) => {
      if (screenRef.current !== "play" || typing(e)) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (!GAME_KEYS.has(e.code)) return;
      e.preventDefault();
      if (g.current.paused) return;
      if (e.code === "Space") {
        if (!e.repeat) startCharge();
      } else g.current.keys.add(e.code);
    };
    const up = (e) => {
      if (e.code === "Space" && screenRef.current === "play") {
        e.preventDefault();
        throwBall();
      }
      g.current.keys.delete(e.code);
    };
    const blur = () => {
      g.current.keys.clear();
      if (g.current.phase === "charge") setPhase("aim");
    };
    const vis = () => {
      if (document.hidden && screenRef.current === "play" && !g.current.paused) togglePause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [setPhase, startCharge, throwBall, togglePause]);

  const aimFromPointer = (e) => {
    const G = g.current;
    if (G.paused || (G.phase !== "aim" && G.phase !== "charge")) return;
    const r = stageRef.current.getBoundingClientRect();
    G.angle = clamp(((e.clientX - r.left) / r.width - 0.5) * 2.4 * MAX_ANGLE, -MAX_ANGLE, MAX_ANGLE);
    pushShot();
  };
  const onPointerDown = (e) => {
    if (e.button !== 0 || screenRef.current !== "play") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    aimFromPointer(e);
    startCharge();
  };
  const onPointerUp = () => throwBall();

  /* ------------------------------------------------------------ GamePlayer */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current !== "menu") startGame();
  }, [restartSignal, startGame]);
  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ render */
  const cur = nextRoll(rolls);
  const aimingNow = phase === "aim" || phase === "charge";
  const spinLabel = shot.spin === 0 ? "Straight" : `${Math.abs(shot.spin * 100).toFixed(0)}% ${shot.spin > 0 ? "◀ left" : "right ▶"}`;
  const stop = (e) => e.stopPropagation();

  return (
    <div ref={rootRef} className={`bm${screen === "play" ? " is-playing" : ""}`}>
      <div
        ref={stageRef}
        className={`bm-stage${aimingNow && !paused ? " is-aiming" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={aimFromPointer}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {screen === "play" && (
        <>
          <div className="bm-top">
            <ScoreSheet rolls={rolls} />
          </div>
          <div className="bm-chips">
            <span className="bm-chip">
              Frame <b>{cur.over ? 10 : cur.frame + 1}</b>
              {!cur.over && <> · Ball <b>{cur.ball + 1}</b></>}
            </span>
            <span className="bm-chip bm-chip--best">Best <b>{store.best}</b></span>
          </div>
          <button type="button" className="bm-pausebtn" onClick={togglePause} aria-label="Pause">
            <span />
            <span />
          </button>

          <div className="bm-meter" aria-label="Power">
            <span className="bm-meter-label">Power</span>
            <div className="bm-meter-bar">
              <div ref={meterRef} className="bm-meter-fill" />
            </div>
            <span ref={meterValRef} className="bm-meter-val">0%</span>
          </div>

          <div className="bm-controls" onPointerDown={stop}>
            {[
              ["Position", "x", 0.03, `${(shot.x * 100).toFixed(0)} cm`, shot.x / MAX_X],
              ["Aim", "angle", 0.004, `${((shot.angle * 180) / Math.PI).toFixed(1)}°`, shot.angle / MAX_ANGLE],
              ["Spin", "spin", 0.1, spinLabel, -shot.spin],
            ].map(([label, k, d, val, f]) => (
              <div key={k} className="bm-ctl">
                <span className="bm-ctl-label">{label}</span>
                <button type="button" disabled={!aimingNow} onClick={() => nudge(k, k === "spin" ? d : -d)} aria-label={`${label} left`}>◀</button>
                <div className="bm-ctl-track">
                  <i style={{ left: `${50 + clamp(f, -1, 1) * 46}%` }} />
                </div>
                <button type="button" disabled={!aimingNow} onClick={() => nudge(k, k === "spin" ? -d : d)} aria-label={`${label} right`}>▶</button>
                <span className="bm-ctl-val">{val}</span>
              </div>
            ))}
          </div>

          <div className="bm-pins" aria-label="Pins standing">
            {PIN_ROWS.map((row, i) => (
              <div key={i}>
                {row.map((p) => (
                  <i key={p} className={pinsUp[p] ? "is-up" : ""} />
                ))}
              </div>
            ))}
          </div>

          <div className="bm-hint">
            {phase === "aim" && "Hold SPACE or the mouse to charge · release to bowl"}
            {phase === "charge" && "Release to bowl!"}
            {(phase === "roll" || phase === "settle") && "Rolling…"}
            {phase === "reset" && "Resetting pins…"}
          </div>

          {banner && (
            <div key={banner.id} className={`bm-banner bm-banner--${banner.kind}`}>
              <strong>{banner.text}</strong>
              {banner.sub && <span>{banner.sub}</span>}
            </div>
          )}
        </>
      )}

      {screen === "menu" && (
        <div className="bm-overlay bm-overlay--menu" onPointerDown={stop}>
          <div className="bm-card bm-card--menu">
            <p className="bm-kicker">Sports · 10-pin</p>
            <h1 className="bm-title">
              Bowling Master <em>3D</em>
            </h1>
            <p className="bm-tagline">AIM • ROLL • STRIKE</p>
            {howTo ? (
              <ul className="bm-howto">
                <li><kbd>Mouse</kbd> / <kbd>A</kbd><kbd>D</kbd> aim the line</li>
                <li><kbd>←</kbd><kbd>→</kbd> move your starting position</li>
                <li><kbd>↑</kbd><kbd>↓</kbd> / <kbd>W</kbd><kbd>S</kbd> spin — the ball hooks late on the dry back end</li>
                <li>Hold <kbd>Space</kbd> or the mouse button to charge, release to bowl</li>
                <li>Hit the pocket (just beside the head pin) at an angle for strikes</li>
                <li>Strike = 10 + next two balls · Spare = 10 + next ball · Max 300</li>
                <li><kbd>Esc</kbd> / <kbd>P</kbd> pause</li>
              </ul>
            ) : (
              <>
                <div className="bm-stats">
                  <div><span>Personal best</span><b>{store.best}</b></div>
                  <div><span>Games played</span><b>{store.games}</b></div>
                </div>
                <div className="bm-balls" role="radiogroup" aria-label="Ball">
                  {BALL_COLORS.map((c, i) => (
                    <button key={c.name} type="button" role="radio" aria-checked={store.ball === i} title={c.name} className={store.ball === i ? "is-on" : ""} style={{ "--c1": c.base, "--c2": c.swirl }} onClick={() => chooseBall(i)} />
                  ))}
                </div>
              </>
            )}
            <div className="bm-actions">
              <button type="button" className="bm-btn bm-btn--primary" onClick={startGame}>Play</button>
              <button type="button" className="bm-btn" onClick={() => setHowTo((v) => !v)}>{howTo ? "Back" : "How to play"}</button>
            </div>
          </div>
        </div>
      )}

      {screen === "play" && paused && (
        <div className="bm-overlay" onPointerDown={stop}>
          <div className="bm-card">
            <h2 className="bm-h2">Paused</h2>
            <p className="bm-sub">Frame {cur.over ? 10 : cur.frame + 1} · Score {totalScore(rolls)}</p>
            <div className="bm-actions bm-actions--col">
              <button type="button" className="bm-btn bm-btn--primary" onClick={togglePause}>Resume</button>
              <button type="button" className="bm-btn" onClick={startGame}>Restart game</button>
              <button type="button" className="bm-btn" onClick={toMenu}>Main menu</button>
            </div>
          </div>
        </div>
      )}

      {screen === "results" && result && (
        <div className="bm-overlay" onPointerDown={stop}>
          <div className="bm-card bm-card--results">
            <p className="bm-kicker">Game over</p>
            <div className="bm-final">{result.score}</div>
            <p className={`bm-best${result.newBest ? " is-new" : ""}`}>
              {result.score === 300 ? "PERFECT GAME!" : result.newBest ? "New personal best!" : `Personal best ${store.best}`}
            </p>
            <div className="bm-stats bm-stats--three">
              <div><span>Strikes</span><b>{result.strikes}</b></div>
              <div><span>Spares</span><b>{result.spares}</b></div>
              <div><span>Best</span><b>{store.best}</b></div>
            </div>
            <ScoreSheet rolls={result.rolls} compact />
            <div className="bm-actions">
              <button type="button" className="bm-btn bm-btn--primary" onClick={startGame}>Play again</button>
              <button type="button" className="bm-btn" onClick={toMenu}>Main menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
