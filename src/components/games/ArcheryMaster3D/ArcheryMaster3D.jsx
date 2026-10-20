/**
 * Archery Master 3D — first-person target archery across five worlds and 50
 * levels (Sports).
 *
 * One requestAnimationFrame loop drives a small phase machine
 * (intro → aim → draw → flight → settle) and a plain Three.js world
 * (scene.js). Flight and collision are pure (physics.js), as are the level
 * data (levels.js) and run/progress rules (rules.js) — the Node validator in
 * tools/simTest.mjs plays all 50 levels through the same code. React draws
 * the HUD and menus; per-frame bits (reticle, power ring) go straight to the
 * DOM.
 *
 * Controls: mouse aims · hold left button (or Space) to draw · release to
 * shoot · hold Shift to steady your breath · arrow keys nudge the aim ·
 * right-click cancels a draw · Esc/P pauses. Touch: drag to aim, hold still
 * to draw, drag to fine-aim, lift to shoot.
 *
 * GamePlayer: `restartSignal` restarts the current level, `muted` silences
 * audio, Fullscreen just resizes the stage. DEV hook: `?amtest=1` exposes
 * window.__am.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./ArcheryMaster3D.css";
import { createScene } from "./scene.js";
import { WORLDS, LEVELS, LEVEL_COUNT, getLevel, windFor, objectiveLines, levelTags } from "./levels.js";
import { aimDir, launchOrigin, launchSpeed, accelOf, predict, createArrow, stepArrow, solveAim, posAt, EYE, MIN_POWER } from "./physics.js";
import { newRun, recordShot, status, loadProgress, saveProgress, applyResult, totalStars, worldStars } from "./rules.js";
import { audio } from "./audio.js";

const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("amtest");
const storage = typeof window !== "undefined" ? window.localStorage : null;
const YAW_R = 0.42; // pointer at the stage edge = ±24°
const PITCH_C = 0.06;
const PITCH_R = 0.22;
const FINE = 0.33; // mouse sensitivity while the string is drawn
const DRAW_TIME = 0.85;
const FATIGUE_AFTER = 3.2; // seconds at full draw before the arms start to shake
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mapPtr = (nx, ny) => ({ yaw: nx * YAW_R, pitch: PITCH_C + ny * PITCH_R });

function freshG() {
  return {
    level: LEVELS[0], run: null, phase: "idle", levelTime: 0, timer: 0,
    aim: { yaw: 0, pitch: 0.02 }, off: { yaw: 0, pitch: 0 }, ptr: null, view: { yaw: 0, pitch: 0 },
    power: 0, drawT: 0, fullT: 0, breath: 1, steady: false, twang: 0, keys: new Set(),
    touch: null, wind: { s: 0, d: 0, x: 0, z: 0 }, accel: accelOf({ x: 0, z: 0 }), arrow: null, paused: false,
  };
}

export default function ArcheryMaster3D({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const reticleRef = useRef(null);
  const ringRef = useRef(null);
  const distRef = useRef(null);
  const breathRef = useRef(null);
  const sceneRef = useRef(null);
  const g = useRef(null);
  if (!g.current) g.current = freshG();
  const progressRef = useRef(null);
  if (!progressRef.current) progressRef.current = storage ? loadProgress(storage) : loadProgress({ getItem: () => null });

  const [screen, setScreenState] = useState("menu"); // menu | select | play | result
  const [paused, setPausedState] = useState(false);
  const [phase, setPhaseState] = useState("idle");
  const [levelId, setLevelId] = useState(1);
  const [run, setRun] = useState(null);
  const [wind, setWind] = useState({ s: 0, d: 0 });
  const [progress, setProgress] = useState(progressRef.current);
  const [selWorld, setSelWorld] = useState(Math.floor((progressRef.current.unlocked - 1) / 10));
  const [banner, setBanner] = useState(null);
  const [popups, setPopups] = useState([]);
  const [result, setResult] = useState(null);
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
  const uid = useRef(0);
  const showBanner = useCallback((text, sub = "", kind = "info", ms = 1200) => {
    const id = ++uid.current;
    setBanner({ id, text, sub, kind });
    setTimeout(() => alive.current && setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);
  const popup = useCallback((p, text, kind) => {
    const s = sceneRef.current?.project(p);
    if (!s) return;
    const id = ++uid.current;
    setPopups((l) => [...l.slice(-3), { id, x: s.x, y: s.y, text, kind }]);
    setTimeout(() => alive.current && setPopups((l) => l.filter((q) => q.id !== id)), 1100);
  }, []);

  /* ------------------------------------------------------------ flow */
  const loadArrow = useCallback(() => {
    const G = g.current;
    const shot = G.run.shots.length;
    const prev = G.wind;
    G.wind = windFor(G.level, shot);
    G.accel = accelOf(G.wind);
    setWind({ s: G.wind.s, d: G.wind.d });
    audio.setWind(G.wind.s);
    if (shot > 0 && G.level.wind.shift && (prev.s !== G.wind.s || prev.d !== G.wind.d)) showBanner("Wind shift", `${G.wind.s.toFixed(1)} m/s`, "wind", 900);
    G.power = 0;
    G.drawT = 0;
    G.fullT = 0;
    setPhase("aim");
  }, [setPhase, showBanner]);

  const startLevel = useCallback(
    (id) => {
      const G = g.current;
      const sc = sceneRef.current;
      const L = getLevel(id);
      audio.unlock();
      audio.cue("start");
      Object.assign(G, { level: L, run: newRun(L), levelTime: 0, timer: 0, power: 0, drawT: 0, fullT: 0, breath: 1, arrow: null, twang: 0, touch: null });
      // start pointing down-range at the first target's stand, not at its gold
      const t0 = L.targets[0];
      G.aim = { yaw: Math.atan2(t0.x, -t0.z), pitch: 0.0 };
      // the next mouse move re-anchors the pointer to this aim (no jump)
      G.ptr = null;
      G.off = { yaw: 0, pitch: 0 };
      G.view = { ...G.aim };
      sc.setLevel(L);
      sc.setCamMode("play");
      setLevelId(id);
      setRun(G.run);
      setResult(null);
      setPopups([]);
      setPaused(false);
      setScreen("play");
      G.wind = windFor(L, 0);
      G.accel = accelOf(G.wind);
      setWind({ s: G.wind.s, d: G.wind.d });
      audio.setWind(G.wind.s);
      setPhase("intro");
      showBanner(`Level ${L.id}`, L.name, "intro", 1500);
      const p = { ...progressRef.current, last: id };
      progressRef.current = p;
      if (storage) saveProgress(storage, p);
    },
    [setPaused, setPhase, setScreen, showBanner],
  );

  const finishLevel = useCallback(() => {
    const G = g.current;
    const L = G.level;
    const r = applyResult(progressRef.current, L, G.run);
    progressRef.current = r.progress;
    if (storage) saveProgress(storage, r.progress);
    setProgress(r.progress);
    const champion = G.run.passed && L.id === LEVEL_COUNT;
    audio.cue(champion ? "champion" : G.run.passed ? "win" : "lose");
    setResult({ level: L, run: G.run, stars: r.stars, newBest: r.newBest, firstClear: r.firstClear, champion });
    setPhase("done");
    setScreen("result");
  }, [setPhase, setScreen]);

  const resolveShot = useCallback(
    (hit) => {
      const G = g.current;
      const sc = sceneRef.current;
      sc.impact(hit);
      audio.impact(hit.kind, hit.score);
      G.run = recordShot(G.run, G.level, hit);
      setRun(G.run);
      if (hit.kind === "target") {
        const kind = hit.perfect ? "perfect" : hit.score >= 10 ? "bull" : hit.score >= 9 ? "gold" : "hit";
        popup(hit.point, `+${hit.score}`, kind);
        if (hit.perfect) {
          audio.cue("perfect");
          showBanner("PERFECT!", "Dead centre · X ring", "perfect", 1300);
        } else if (hit.score >= 10) showBanner("BULLSEYE!", "+10", "bull", 1100);
      } else {
        audio.cue("miss");
        popup(hit.point, hit.kind === "obstacle" ? "Blocked" : "Miss", "miss");
        showBanner(hit.kind === "obstacle" ? "BLOCKED" : "MISS", "", "miss", 800);
      }
      G.timer = G.run.over ? 1.5 : 0.75;
      setPhase("settle");
    },
    [popup, setPhase, showBanner],
  );

  const startDraw = useCallback(() => {
    const G = g.current;
    if (screenRef.current !== "play" || G.paused || G.phase !== "aim") return false;
    audio.unlock();
    audio.drawStart();
    G.drawT = 0;
    G.fullT = 0;
    G.power = 0;
    setPhase("draw");
    return true;
  }, [setPhase]);

  const cancelDraw = useCallback(() => {
    const G = g.current;
    if (G.phase !== "draw") return;
    audio.drawStop();
    G.power = 0;
    setPhase("aim");
  }, [setPhase]);

  const release = useCallback(() => {
    const G = g.current;
    if (G.phase !== "draw" || G.paused) return;
    if (G.power < MIN_POWER) {
      cancelDraw();
      return;
    }
    const dir = aimDir(G.view.yaw, G.view.pitch);
    G.arrow = createArrow(launchOrigin(dir), dir, launchSpeed(G.power));
    audio.release(G.power);
    G.twang = 0.35;
    sceneRef.current.kick();
    setPhase("flight");
  }, [cancelDraw, setPhase]);

  const togglePause = useCallback(() => {
    const G = g.current;
    if (screenRef.current !== "play" || G.phase === "done") return;
    if (!G.paused) cancelDraw();
    setPaused(!G.paused);
  }, [cancelDraw, setPaused]);

  const toMenu = useCallback(
    (to = "menu") => {
      const sc = sceneRef.current;
      audio.drawStop();
      audio.setWind(0);
      setPaused(false);
      setPhase("idle");
      setBanner(null);
      setPopups([]);
      sc?.clearArrows();
      sc?.setCamMode("menu");
      if (to === "select") {
        const w = Math.floor((g.current.level.id - 1) / 10);
        setSelWorld(w);
        sc?.setWorld(w);
      } else sc?.setWorld(Math.floor((progressRef.current.unlocked - 1) / 10));
      setScreen(to);
    },
    [setPaused, setPhase, setScreen],
  );

  /* ------------------------------------------------------------ scene + loop */
  useEffect(() => {
    alive.current = true;
    // a fresh canvas per mount: StrictMode re-runs this effect and a disposed
    // renderer leaves its canvas with a lost context
    const canvas = document.createElement("canvas");
    canvas.className = "am-canvas";
    stageRef.current.appendChild(canvas);
    const sc = createScene(canvas);
    sceneRef.current = sc;
    sc.setWorld(Math.floor((progressRef.current.unlocked - 1) / 10));
    sc.setCamMode("menu");
    const ro = new ResizeObserver(() => {
      const el = stageRef.current;
      if (el) sc.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(stageRef.current);
    sc.resize(stageRef.current.clientWidth, stageRef.current.clientHeight);

    let raf = 0;
    let lastT = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      step(dt);
      raf = requestAnimationFrame(frame);
    };

    const pt = { x: 0, y: 0, z: 0 };
    function step(dt) {
      const G = g.current;
      const playing = screenRef.current === "play";
      const live = playing && !G.paused;
      const L = G.level;
      if (live) {
        G.levelTime += dt;
        G.twang = Math.max(0, G.twang - dt);
        // keyboard nudges (fine while drawing)
        const k = G.keys;
        const rate = (G.phase === "draw" ? 0.07 : 0.22) * dt;
        const dy = (k.has("ArrowRight") || k.has("KeyD") ? 1 : 0) - (k.has("ArrowLeft") || k.has("KeyA") ? 1 : 0);
        const dp = (k.has("ArrowUp") || k.has("KeyW") ? 1 : 0) - (k.has("ArrowDown") || k.has("KeyS") ? 1 : 0);
        if (dy || dp) {
          G.aim.yaw = clamp(G.aim.yaw + dy * rate, -YAW_R - 0.1, YAW_R + 0.1);
          G.aim.pitch = clamp(G.aim.pitch + dp * rate, PITCH_C - PITCH_R - 0.05, PITCH_C + PITCH_R + 0.08);
          if (G.ptr) {
            const m = mapPtr(G.ptr.nx, G.ptr.ny);
            G.off = { yaw: G.aim.yaw - m.yaw, pitch: G.aim.pitch - m.pitch };
          }
        }
        const ph = G.phase;
        if (ph === "intro") {
          if (sc.introDone()) loadArrow();
        } else if (ph === "draw") {
          G.drawT += dt;
          const p = Math.min(1, G.drawT / DRAW_TIME);
          G.power = 1 - (1 - p) * (1 - p);
          if (p >= 1) G.fullT += dt;
          if (G.steady && G.breath > 0) G.breath = Math.max(0, G.breath - dt / 2.6);
          else if (!G.steady) G.breath = Math.min(1, G.breath + dt / 2.2);
          // touch: hold still for a moment = start drawing (handled in pointer code)
        } else if (ph === "flight") {
          const hit = stepArrow(G.arrow, dt, L, G.accel, G.levelTime - dt);
          if (hit) {
            sc.setFlight(null);
            G.arrow = null;
            resolveShot(hit);
          } else sc.setFlight(G.arrow.p, G.arrow.v);
        } else if (ph === "settle") {
          G.timer -= dt;
          if (G.timer <= 0) {
            if (G.run.over) finishLevel();
            else loadArrow();
          }
        }
        if (ph !== "draw") G.breath = Math.min(1, G.breath + dt / 2.2);
        if (G.touch && G.touch.mode === "pending" && ph === "aim" && performance.now() - G.touch.t0 > 180) {
          G.touch.mode = "draw";
          startDraw();
        }
      }

      // aim smoothing + sway → the actual bow direction
      const drawing = G.phase === "draw";
      const k = 1 - Math.exp(-dt * (drawing ? 14 : 22));
      const tS = G.levelTime;
      const steadyNow = drawing && G.steady && G.breath > 0;
      const fatigue = Math.max(0, G.fullT - FATIGUE_AFTER) * 0.0022;
      const amp = (0.0008 + L.world * 0.00015 + Math.min(0.006, fatigue)) * (steadyNow ? 0.25 : 1) * (drawing ? 1 : 0.6);
      const swayY = amp * (Math.sin(tS * 1.1) * 0.7 + Math.sin(tS * 2.7 + 1.3) * 0.3);
      const swayP = amp * (Math.cos(tS * 0.83) * 0.6 + Math.sin(tS * 2.1 + 0.4) * 0.4);
      G.view.yaw += (G.aim.yaw + swayY - G.view.yaw) * k;
      G.view.pitch += (G.aim.pitch + swayP - G.view.pitch) * k;

      const loaded = playing && (G.phase === "aim" || G.phase === "draw");
      sc.update(live ? dt : 0, {
        yaw: G.view.yaw,
        pitch: G.view.pitch,
        power: drawing ? G.power : 0,
        drawing,
        ready: loaded,
        loaded,
        twang: G.twang,
        zoom: steadyNow,
        levelTime: G.levelTime,
        wind: G.wind,
      });

      // reticle = where this arrow would land on the nearest target's plane (no wind)
      const el = reticleRef.current;
      if (el) {
        let shown = false;
        if (loaded && !G.paused && sc.introDone()) {
          const dir = aimDir(G.view.yaw, G.view.pitch);
          // reference plane: the target closest to the aim ray
          let best = null;
          let bestA = Infinity;
          for (const tg of L.targets) {
            posAt(tg, G.levelTime, pt);
            const dx = pt.x - EYE.x, dyy = pt.y - EYE.y, dz = pt.z - EYE.z;
            const len = Math.hypot(dx, dyy, dz);
            const a = 1 - (dx * dir.x + dyy * dir.y + dz * dir.z) / len;
            if (a < bestA) {
              bestA = a;
              best = tg;
            }
          }
          const pw = drawing ? Math.max(G.power, MIN_POWER) : 1;
          const hit = predict(launchOrigin(dir), dir, launchSpeed(pw), accelOf({ x: 0, z: 0 }), best.z);
          const s = hit && sc.project(hit);
          if (s) {
            el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
            el.dataset.state = drawing ? (G.power >= 1 ? "full" : "draw") : "idle";
            el.dataset.steady = steadyNow ? "1" : "0";
            shown = true;
            if (distRef.current) distRef.current.textContent = `${Math.round(-best.z)} m`;
          }
        }
        el.style.opacity = shown ? "1" : "0";
        if (ringRef.current) ringRef.current.style.strokeDashoffset = String(((1 - (drawing ? G.power : 0)) * 113.1).toFixed(1));
        if (breathRef.current) {
          breathRef.current.style.transform = `scaleX(${G.breath.toFixed(3)})`;
          breathRef.current.closest(".am-breath").dataset.on = drawing ? "1" : "0";
        }
      }
      sc.render();
    }

    if (TEST) {
      window.__am = {
        g: g.current,
        sc,
        run: (sec, dt = 1 / 60) => {
          for (let t = 0; t < sec; t += dt) step(dt);
        },
        /** Aim perfectly (lead + wind) at target i, as the validator bot does. */
        aimAt(i = 0) {
          const G = g.current;
          const tg = G.level.targets[i];
          const T0 = G.levelTime;
          let a = solveAim(launchOrigin(aimDir(0, 0)), (t) => posAt(tg, T0 + t), launchSpeed(1), G.accel);
          a = solveAim(launchOrigin(aimDir(a.yaw, a.pitch)), (t) => posAt(tg, T0 + t), launchSpeed(1), G.accel);
          G.aim = { yaw: a.yaw, pitch: a.pitch };
          G.view = { ...G.aim };
          G.off = { yaw: 0, pitch: 0 };
          G.ptr = null;
          return a;
        },
      };
    }
    raf = requestAnimationFrame(frame);
    return () => {
      alive.current = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      sc.dispose();
      canvas.remove();
      sceneRef.current = null;
      if (TEST) delete window.__am;
    };
    // the loop reads everything through refs; the callbacks it uses are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ input */
  useEffect(() => {
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    const NAV = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);
    const down = (e) => {
      if (screenRef.current !== "play" || typing(e)) return;
      const G = g.current;
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        togglePause();
      } else if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) startDraw();
      } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        G.steady = true;
      } else if (NAV.has(e.code)) {
        e.preventDefault();
        G.keys.add(e.code);
      }
    };
    const up = (e) => {
      const G = g.current;
      G.keys.delete(e.code);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") G.steady = false;
      if (e.code === "Space" && screenRef.current === "play") {
        e.preventDefault();
        release();
      }
    };
    const blur = () => {
      const G = g.current;
      G.keys.clear();
      G.steady = false;
      cancelDraw();
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
  }, [cancelDraw, release, startDraw, togglePause]);

  const norm = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { nx: clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), ny: clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -1, 1) };
  };
  const clampAim = (a) => ({ yaw: clamp(a.yaw, -YAW_R - 0.1, YAW_R + 0.1), pitch: clamp(a.pitch, PITCH_C - PITCH_R - 0.05, PITCH_C + PITCH_R + 0.08) });

  const onPointerMove = (e) => {
    if (screenRef.current !== "play") return;
    const G = g.current;
    const p = norm(e);
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      const m = mapPtr(p.nx, p.ny);
      if (!G.ptr) {
        G.off = { yaw: G.aim.yaw - m.yaw, pitch: G.aim.pitch - m.pitch };
        G.ptr = p;
        return;
      }
      const prev = mapPtr(G.ptr.nx, G.ptr.ny);
      if (G.phase === "draw") {
        // fine aim: the bow moves a third as far as the mouse
        G.aim = clampAim({ yaw: G.aim.yaw + (m.yaw - prev.yaw) * FINE, pitch: G.aim.pitch + (m.pitch - prev.pitch) * FINE });
      } else {
        // free aim follows the pointer; any offset left from fine aiming
        // melts away as the mouse moves (never while it rests)
        const moved = Math.hypot(m.yaw - prev.yaw, m.pitch - prev.pitch);
        const f = Math.max(0, 1 - moved * 2.2);
        G.aim = clampAim({ yaw: m.yaw + G.off.yaw * f, pitch: m.pitch + G.off.pitch * f });
      }
      G.off = { yaw: G.aim.yaw - m.yaw, pitch: G.aim.pitch - m.pitch };
      G.ptr = p;
    } else if (G.touch && G.touch.id === e.pointerId) {
      const T = G.touch;
      const dx = p.nx - T.nx, dy = p.ny - T.ny;
      if (T.mode === "pending" && Math.hypot(dx, dy) > 0.035) T.mode = "aim";
      const f = T.mode === "draw" ? 0.28 : 0.75;
      G.aim = clampAim({ yaw: G.aim.yaw + dx * YAW_R * f, pitch: G.aim.pitch + dy * PITCH_R * f });
      T.nx = p.nx;
      T.ny = p.ny;
    }
  };
  const onPointerDown = (e) => {
    if (screenRef.current !== "play") return;
    const G = g.current;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone — still works without capture */
    }
    audio.unlock();
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      if (e.button === 2) {
        cancelDraw();
        return;
      }
      if (e.button !== 0) return;
      onPointerMove(e);
      startDraw();
    } else {
      const p = norm(e);
      G.touch = { id: e.pointerId, nx: p.nx, ny: p.ny, t0: performance.now(), mode: "pending" };
    }
  };
  const onPointerUp = (e) => {
    const G = g.current;
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      if (e.button === 0) release();
      return;
    }
    if (G.touch && G.touch.id === e.pointerId) {
      const mode = G.touch.mode;
      G.touch = null;
      if (mode === "draw") release();
    }
  };
  const onPointerCancel = () => {
    g.current.touch = null;
    cancelDraw();
  };

  /* ------------------------------------------------------------ GamePlayer */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play" || screenRef.current === "result") startLevel(g.current.level.id);
  }, [restartSignal, startLevel]);
  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ render */
  const L = getLevel(levelId);
  const st = run ? status(run, L) : null;
  const stars = totalStars(progress);
  const stop = (e) => e.stopPropagation();
  const pickWorld = (w) => {
    audio.unlock();
    audio.cue("ui");
    setSelWorld(w);
    sceneRef.current?.setWorld(w);
  };
  const openSelect = () => {
    audio.unlock();
    audio.cue("ui");
    const w = Math.floor((progressRef.current.unlocked - 1) / 10);
    setSelWorld(w);
    sceneRef.current?.setWorld(w);
    setHowTo(false);
    setScreen("select");
  };
  const partLabel = (p) => (p.key === "all" ? `Targets ${p.done}/${p.need}` : p.key === "score" ? `Score ${p.done}/${p.need}` : `Gold hits ${p.done}/${p.need}`);
  const barMax = L.stars[1];
  const showHud = screen === "play" && run;

  return (
    <div className={`am${screen === "play" ? " is-playing" : ""}`}>
      <div
        ref={stageRef}
        className={`am-stage${screen === "play" && !paused ? " is-aiming" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div ref={reticleRef} className="am-reticle" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48">
          <circle cx="24" cy="24" r="18" className="am-ret-track" />
          <circle ref={ringRef} cx="24" cy="24" r="18" className="am-ret-power" strokeDasharray="113.1" strokeDashoffset="113.1" transform="rotate(-90 24 24)" />
          <circle cx="24" cy="24" r="2.2" className="am-ret-dot" />
          <path d="M24 2v9M24 37v9M2 24h9M37 24h9" className="am-ret-ticks" />
        </svg>
        <span ref={distRef} className="am-ret-dist" />
      </div>

      {showHud && (
        <>
          <div className="am-hud-tl" style={{ "--acc": WORLDS[L.world].accent }}>
            <div className="am-lvl">
              <span>{WORLDS[L.world].name}</span>
              <b>
                Level {L.id} · {L.name}
              </b>
            </div>
            <ul className="am-obj">
              {st.parts.map((p) => (
                <li key={p.key} className={p.ok ? "is-ok" : ""}>
                  <i>{p.ok ? "✓" : ""}</i>
                  {partLabel(p)}
                </li>
              ))}
            </ul>
          </div>

          <div className="am-hud-score">
            <b>{run.score}</b>
            <div className="am-starbar" aria-label="Star progress">
              <div className="am-starbar-fill" style={{ width: `${Math.min(100, (run.score / barMax) * 100)}%` }} />
              {[L.stars[0], L.stars[1]].map((v, i) => (
                <span key={i} className={`am-starbar-mark${run.score >= v ? " is-on" : ""}`} style={{ left: `${(v / barMax) * 100}%` }} title={`${i + 2} stars at ${v}`}>
                  ★
                </span>
              ))}
            </div>
          </div>

          <button type="button" className="am-pausebtn" onClick={togglePause} onPointerDown={stop} aria-label="Pause">
            <span />
            <span />
          </button>

          <div className="am-quiver" aria-label={`${run.arrowsLeft} arrows left`}>
            <span className="am-quiver-n">{run.arrowsLeft}</span>
            <div className="am-quiver-list">
              {Array.from({ length: L.arrows }, (_, i) => {
                const shot = run.shots[i];
                return <i key={i} className={shot ? `is-used is-${shot.kind}${shot.score >= 9 ? " is-gold" : ""}` : phase === "draw" && i === run.shots.length ? "is-nocked" : ""} title={shot ? (shot.kind === "target" ? String(shot.score) : "miss") : ""} />;
              })}
            </div>
          </div>

          <div className={`am-wind${wind.s ? "" : " is-calm"}`} aria-label={wind.s ? `Wind ${wind.s} metres per second` : "No wind"}>
            <div className="am-wind-dial">
              {wind.s ? <span className="am-wind-arrow" style={{ transform: `rotate(${-wind.d}deg)` }} /> : <span className="am-wind-calm">~</span>}
            </div>
            <div className="am-wind-text">
              <span>Wind</span>
              <b>{wind.s ? `${wind.s.toFixed(1)} m/s` : "Calm"}</b>
            </div>
          </div>

          <div className="am-breath" data-on="0" aria-hidden="true">
            <span>Breath</span>
            <div>
              <i ref={breathRef} />
            </div>
          </div>

          <div className="am-hint">
            {phase === "aim" && "Aim with the mouse · hold to draw · release to shoot"}
            {phase === "draw" && "Hold Shift to steady · release to shoot · right-click cancels"}
          </div>

          {popups.map((q) => (
            <div key={q.id} className={`am-pop is-${q.kind}`} style={{ left: q.x, top: q.y }}>
              {q.text}
            </div>
          ))}
          {banner && (
            <div key={banner.id} className={`am-banner am-banner--${banner.kind}`}>
              <strong>{banner.text}</strong>
              {banner.sub && <span>{banner.sub}</span>}
            </div>
          )}
          {phase === "intro" && (
            <div className="am-introcard" onPointerDown={stop}>
              <span className="am-kicker">{WORLDS[L.world].name}</span>
              <ul>
                {objectiveLines(L).map((o) => (
                  <li key={o}>{o}</li>
                ))}
                <li className="am-intro-arrows">{L.arrows} arrows</li>
              </ul>
              {levelTags(L).length > 0 && (
                <div className="am-tags">
                  {levelTags(L).map((t) => (
                    <em key={t}>{t}</em>
                  ))}
                </div>
              )}
              <button type="button" className="am-skip" onClick={() => sceneRef.current?.skipIntro()}>
                Skip ›
              </button>
            </div>
          )}
        </>
      )}

      {screen === "menu" && (
        <div className="am-overlay am-overlay--menu" onPointerDown={stop}>
          <div className="am-card am-card--menu">
            <p className="am-kicker">Sports · Archery</p>
            <h1 className="am-title">
              Archery Master <em>3D</em>
            </h1>
            <p className="am-tagline">AIM • SHOOT • CONQUER</p>
            {howTo ? (
              <ul className="am-howto">
                <li>Move the <kbd>mouse</kbd> to aim. The reticle shows where the arrow lands — <b>before wind</b></li>
                <li>Hold the <b>left button</b> or <kbd>Space</kbd> to draw, release to shoot. A weak draw drops short</li>
                <li>Hold <kbd>Shift</kbd> while drawn to steady your breath; hold too long and your arms shake</li>
                <li>Read the <b>wind</b> dial and aim upwind. Lead moving targets</li>
                <li>Rings score 10 → 1. Inner gold = <b>bullseye</b>, the tiny X = <b>perfect</b></li>
                <li>Touch: drag to aim, hold still to draw, lift to shoot · <kbd>Esc</kbd> pauses</li>
              </ul>
            ) : (
              <div className="am-stats">
                <div>
                  <span>Stars</span>
                  <b>
                    {stars}
                    <small>/150</small>
                  </b>
                </div>
                <div>
                  <span>Levels</span>
                  <b>
                    {Object.keys(progress.best).length}
                    <small>/50</small>
                  </b>
                </div>
                <div>
                  <span>World</span>
                  <b>{Math.floor((progress.unlocked - 1) / 10) + 1}</b>
                </div>
              </div>
            )}
            <div className="am-actions">
              <button type="button" className="am-btn am-btn--primary" onClick={() => startLevel(progress.unlocked)}>
                {progress.unlocked > 1 || progress.best[1] ? `Continue · Lv ${progress.unlocked}` : "Play"}
              </button>
              <button type="button" className="am-btn" onClick={openSelect}>
                Levels
              </button>
              <button type="button" className="am-btn" onClick={() => setHowTo((v) => !v)}>
                {howTo ? "Back" : "How to play"}
              </button>
            </div>
            {progress.champion && <p className="am-champ-note">👑 Archery Champion</p>}
          </div>
        </div>
      )}

      {screen === "select" && (
        <div className="am-overlay am-overlay--select" onPointerDown={stop}>
          <div className="am-select">
            <div className="am-select-head">
              <button type="button" className="am-btn am-btn--ghost" onClick={() => toMenu("menu")}>
                ‹ Menu
              </button>
              <h2>Select Level</h2>
              <span className="am-total">★ {stars}/150</span>
            </div>
            <div className="am-worlds" role="tablist">
              {WORLDS.map((w) => {
                const locked = progress.unlocked < w.id * 10 + 1;
                return (
                  <button key={w.id} type="button" role="tab" aria-selected={selWorld === w.id} className={`am-world${selWorld === w.id ? " is-on" : ""}${locked ? " is-locked" : ""}`} style={{ "--acc": w.accent }} onClick={() => pickWorld(w.id)}>
                    <span className="am-world-icon">{locked ? "🔒" : w.icon}</span>
                    <span className="am-world-name">{w.name}</span>
                    <span className="am-world-stars">★ {worldStars(progress, w.id)}/30</span>
                  </button>
                );
              })}
            </div>
            <p className="am-world-blurb" style={{ "--acc": WORLDS[selWorld].accent }}>
              <b>
                Levels {selWorld * 10 + 1}–{selWorld * 10 + 10}
              </b>{" "}
              · {WORLDS[selWorld].blurb}
            </p>
            <div className="am-grid">
              {LEVELS.slice(selWorld * 10, selWorld * 10 + 10).map((lv) => {
                const locked = lv.id > progress.unlocked;
                const s = progress.stars[lv.id] || 0;
                return (
                  <button key={lv.id} type="button" className={`am-lcard${locked ? " is-locked" : ""}${s ? " is-done" : ""}${lv.id === progress.unlocked ? " is-next" : ""}`} disabled={locked} onClick={() => startLevel(lv.id)} style={{ "--acc": WORLDS[lv.world].accent }}>
                    <span className="am-lcard-n">{locked ? "🔒" : lv.id}</span>
                    <span className="am-lcard-name">{lv.name}</span>
                    <span className="am-lcard-stars">
                      {[1, 2, 3].map((k) => (
                        <i key={k} className={k <= s ? "is-on" : ""}>
                          ★
                        </i>
                      ))}
                    </span>
                    <span className="am-lcard-meta">{progress.best[lv.id] ? `Best ${progress.best[lv.id]}` : levelTags(lv)[0] || `${lv.arrows} arrows`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {screen === "play" && paused && (
        <div className="am-overlay" onPointerDown={stop}>
          <div className="am-card">
            <h2 className="am-h2">Paused</h2>
            <p className="am-sub2">
              Level {L.id} · {L.name} · {run?.score ?? 0} pts
            </p>
            <div className="am-actions am-actions--col">
              <button type="button" className="am-btn am-btn--primary" onClick={togglePause}>
                Resume
              </button>
              <button type="button" className="am-btn" onClick={() => startLevel(L.id)}>
                Restart level
              </button>
              <button type="button" className="am-btn" onClick={() => toMenu("select")}>
                Level select
              </button>
              <button type="button" className="am-btn" onClick={() => toMenu("menu")}>
                Main menu
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "result" && result && (
        <div className="am-overlay" onPointerDown={stop}>
          {result.champion ? (
            <div className="am-card am-card--champion">
              <div className="am-crown">👑</div>
              <p className="am-kicker">Champion&apos;s Temple conquered</p>
              <h2 className="am-final is-win">Archery Champion!</h2>
              <p className="am-best is-new">All 50 levels complete · Level 50 scored {result.run.score}</p>
              <div className="am-bigstars">
                {[1, 2, 3].map((k) => (
                  <i key={k} className={k <= result.stars ? "is-on" : ""} style={{ animationDelay: `${0.2 + k * 0.25}s` }}>
                    ★
                  </i>
                ))}
              </div>
              <div className="am-stats">
                <div>
                  <span>Total stars</span>
                  <b>
                    {stars}
                    <small>/150</small>
                  </b>
                </div>
                <div>
                  <span>Perfects</span>
                  <b>{result.run.perfects}</b>
                </div>
                <div>
                  <span>Worlds</span>
                  <b>5/5</b>
                </div>
              </div>
              <p className="am-sub2">{stars < 150 ? "Replay any level to chase the remaining stars." : "Every star collected. A true master."}</p>
              <div className="am-actions">
                <button type="button" className="am-btn am-btn--primary" onClick={() => toMenu("select")}>
                  Level select
                </button>
                <button type="button" className="am-btn" onClick={() => startLevel(LEVEL_COUNT)}>
                  Replay 50
                </button>
                <button type="button" className="am-btn" onClick={() => toMenu("menu")}>
                  Main menu
                </button>
              </div>
            </div>
          ) : (
            <div className={`am-card am-card--result${result.run.passed ? " is-win" : ""}`}>
              <p className="am-kicker">
                Level {result.level.id} · {result.level.name}
              </p>
              <h2 className={`am-final${result.run.passed ? " is-win" : ""}`}>{result.run.passed ? "Level Complete!" : result.run.arrowsLeft > 0 ? "Out of Reach" : "Out of Arrows"}</h2>
              <div className="am-bigstars">
                {[1, 2, 3].map((k) => (
                  <i key={k} className={k <= result.stars ? "is-on" : ""} style={{ animationDelay: `${0.2 + k * 0.25}s` }}>
                    ★
                  </i>
                ))}
              </div>
              <p className={`am-best${result.newBest ? " is-new" : ""}`}>
                {result.run.score} points
                {result.newBest && result.run.passed ? " · New best!" : progress.best[result.level.id] ? ` · Best ${progress.best[result.level.id]}` : ""}
              </p>
              <ul className="am-checks">
                {status(result.run, result.level).parts.map((p) => (
                  <li key={p.key} className={p.ok ? "is-ok" : "is-bad"}>
                    <i>{p.ok ? "✓" : "✗"}</i>
                    {partLabel(p)}
                  </li>
                ))}
                <li className="is-info">
                  <i>★</i>2★ at {result.level.stars[0]} · 3★ at {result.level.stars[1]}
                </li>
              </ul>
              <div className="am-actions">
                {result.run.passed && result.level.id < LEVEL_COUNT && (
                  <button type="button" className="am-btn am-btn--primary" onClick={() => startLevel(result.level.id + 1)}>
                    Next level
                  </button>
                )}
                <button type="button" className={`am-btn${result.run.passed ? "" : " am-btn--primary"}`} onClick={() => startLevel(result.level.id)}>
                  Retry
                </button>
                <button type="button" className="am-btn" onClick={() => toMenu("select")}>
                  Level select
                </button>
              </div>
              {result.firstClear && result.level.id % 10 === 0 && result.level.id < LEVEL_COUNT && <p className="am-unlock">🔓 {WORLDS[result.level.world + 1].name} unlocked!</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
