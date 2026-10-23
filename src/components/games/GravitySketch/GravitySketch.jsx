/**
 * Gravity Sketch — a physics drawing puzzle. Draw freehand shapes; they turn
 * into real objects (Matter.js) that fall, roll and push things around. Each
 * of the 30 levels has its own objective: make balls touch, fill a cup, hit
 * stars, press switches, balance a plank, clear obstacles…
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js); its Restart restarts the current level and its Mute
 * silences the synth sounds. Physics lives in ./engine.js, drawing in
 * ./render.js, the levels (with proven reference solutions, also used as
 * hints) in ./levels.js. Progress is saved under `gravity-sketch-progress`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as E from "./engine.js";
import { drawScene, burst, confetti, stepFx, PALETTE } from "./render.js";
import { LEVELS, CHAPTERS } from "./levels.js";
import { createAudio } from "./audio.js";
import * as P from "./progress.js";
import "./GravitySketch.css";

const N = LEVELS.length;
const chapterOf = (i) => CHAPTERS.reduce((c, ch, k) => (i >= ch.from ? k : c), 0);
const TEST = import.meta.env.DEV && typeof location !== "undefined" && /[?&]gstest=1/.test(location.search);
// `&gsmanual=1` stops the rAF loop so tests drive frames with __gs.advance()
const MANUAL = TEST && /[?&]gsmanual=1/.test(location.search);

const load = () => {
  try {
    return P.normalize(JSON.parse(localStorage.getItem(P.SAVE_KEY)), N);
  } catch {
    return P.normalize(null, N);
  }
};
const persist = (p) => {
  try {
    localStorage.setItem(P.SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
};

const GOAL_ICON = { touch: "🤝", in: "🎯", out: "🧹", hit: "⭐", press: "🔘", level: "⚖️", up: "⬆️", time: "⏱️", still: "🎯" };

/* ---------- tiny inline icons ---------- */
const Icon = ({ d, size = 1 }) => (
  <svg viewBox="0 0 24 24" width={`${size}em`} height={`${size}em`} aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const I = {
  pause: "M8 5v14M16 5v14",
  play: "M7 4.5v15l12-7.5z",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  restart: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  home: "M3 11 12 4l9 7M5 10v10h14V10",
  sound: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  mute: "M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6",
  full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  exitFull: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  next: "M5 12h14M13 6l6 6-6 6",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  help: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01",
  pen: "M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3",
};

function Stars({ n, size = 1, total = 3, anim = false }) {
  return (
    <span className={`gs-stars${anim ? " gs-stars--anim" : ""}`} style={{ fontSize: `${size}em` }}>
      {Array.from({ length: total }, (_, k) => (
        <svg key={k} viewBox="0 0 24 24" className={k < n ? "on" : ""} style={{ animationDelay: `${0.35 + k * 0.32}s` }} aria-hidden="true">
          <path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z" />
        </svg>
      ))}
    </span>
  );
}

/* ---------- menu backdrop: a little looping doodle ---------- */
function Doodle() {
  return (
    <svg className="gs-doodle" viewBox="0 0 400 140" aria-hidden="true">
      <path className="gs-doodle__line" d="M20 60 C 90 70, 160 110, 240 100 S 360 90, 385 118" />
      <circle className="gs-doodle__ball" r="11" />
      <path className="gs-doodle__pen" d="M0 0 l18 -18 l6 6 l-18 18 z M0 0 l-4 10 l10 -4" />
    </svg>
  );
}

export default function GravitySketch({ restartSignal = 0, muted = false }) {
  const [prog, setProg] = useState(load);
  const [screen, setScreen] = useState("menu"); // menu | levels | play
  const [lvl, setLvl] = useState(0);
  const [overlay, setOverlay] = useState(null); // pause | win | fail | howto
  const [runId, setRunId] = useState(0);
  const [hud, setHud] = useState({ shapes: 0, ink: 1, state: "ready", hold: 0, met: false, prog: 0 });
  const [result, setResult] = useState(null);
  const [hinted, setHinted] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [toast, setToast] = useState(null);
  const [tip, setTip] = useState(null); // coach bubble text
  const [tut, setTut] = useState(0); // level-1 tutorial step
  const [isFs, setIsFs] = useState(false);

  const level = LEVELS[lvl];
  const chapter = CHAPTERS[chapterOf(lvl)];

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const rootRef = useRef(null);
  const simRef = useRef(null);
  const strokeRef = useRef(null); // { st, id, bad }
  const fxRef = useRef([]);
  const realT = useRef(0);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  const hintedRef = useRef(hinted);
  hintedRef.current = hinted;
  const tutRef = useRef(tut);
  tutRef.current = tut;
  const winTimer = useRef(0);
  const toastTimer = useRef(0);

  const audio = useMemo(() => createAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => audio.setMuted(muted || !prog.sound), [audio, muted, prog.sound]);

  const saveProg = useCallback((next) => {
    setProg(next);
    persist(next);
  }, []);

  const flash = useCallback((text, ms = 2200) => {
    clearTimeout(toastTimer.current);
    setToast({ text, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => (clearTimeout(winTimer.current), clearTimeout(toastTimer.current)), []);

  /* ---------- level flow ---------- */
  const openLevel = useCallback(
    (i, { keepHint = false } = {}) => {
      clearTimeout(winTimer.current);
      setLvl(i);
      setScreen("play");
      setOverlay(null);
      setResult(null);
      setRunId((r) => r + 1);
      if (!keepHint) {
        setHinted(false);
        setGhost(false);
      }
      setTut(i === 0 && !keepHint ? 1 : 0);
      setTip(LEVELS[i].tip && !keepHint ? LEVELS[i].tip : null);
    },
    [],
  );
  const restart = useCallback(() => {
    if (screen !== "play") return;
    audio.play("reset");
    openLevel(lvl, { keepHint: true });
  }, [screen, lvl, openLevel, audio]);

  // GamePlayer Restart → restart the current level
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") openLevel(lvl, { keepHint: true });
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // fresh simulation for every (re)start
  useEffect(() => {
    if (screen !== "play") return;
    simRef.current = E.createSim(LEVELS[lvl]);
    strokeRef.current = null;
    fxRef.current = [];
    setHud({ shapes: 0, ink: 1, state: "ready", hold: 0, met: false, prog: 0 });
  }, [screen, lvl, runId]);

  const onWin = useCallback(() => {
    const sim = simRef.current;
    const shapes = sim.drawn.length;
    const stars = E.starsFor(LEVELS[lvl], shapes, hintedRef.current);
    const r = P.recordWin(prog, lvl, stars, shapes, N);
    saveProg(r.prog);
    setResult({ stars, shapes, newBest: r.newBest, first: r.first, best: r.prog.best[lvl] });
    confetti(fxRef.current, 140);
    audio.play("win");
    setTut(0);
    if (lvl === 0 && !prog.tutorial) saveProg({ ...r.prog, tutorial: true });
    winTimer.current = setTimeout(() => {
      setOverlay("win");
      for (let k = 0; k < stars; k++) setTimeout(() => audio.play("star", k), 380 + k * 320);
    }, 1100);
  }, [lvl, prog, saveProg, audio]);
  const onWinRef = useRef(onWin);
  onWinRef.current = onWin;

  /* ---------- canvas sizing ---------- */
  useEffect(() => {
    if (screen !== "play") return;
    const stage = stageRef.current, cv = canvasRef.current;
    if (!stage || !cv) return;
    const fit = () => {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const k = Math.min(r.width / E.W, r.height / E.H);
      const w = Math.floor(E.W * k), h = Math.floor(E.H * k);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(stage);
    window.addEventListener("resize", fit);
    return () => (ro?.disconnect(), window.removeEventListener("resize", fit));
  }, [screen]);

  /* ---------- main loop ---------- */
  const frame = useCallback(
    (dt, physics = true) => {
      const sim = simRef.current, cv = canvasRef.current;
      if (!sim || !cv) return;
      realT.current += dt;
      if (physics && !overlayRef.current) {
        sim.acc = (sim.acc ?? 0) + dt;
        let n = 0;
        while (sim.acc >= E.FRAME && n < 6) {
          E.step(sim);
          sim.acc -= E.FRAME;
          n++;
        }
        if (n === 6) sim.acc = 0;
      }
      // events → sound & particles
      for (const ev of sim.events) {
        if (ev.type === "bump" && ev.v > 4) audio.play("bump", ev.v);
        else if (ev.type === "hit") {
          audio.play("hit");
          burst(fxRef.current, ev.x, ev.y, { n: 16, shape: "star", colors: [PALETTE.yellow, "#fff1a8", PALETTE.orange], size: 16, speed: 8 });
        } else if (ev.type === "press") {
          audio.play("press");
          burst(fxRef.current, ev.x, ev.y - 10, { n: 10, colors: [PALETTE.green, "#fff"], speed: 6, size: 8 });
        } else if (ev.type === "open") audio.play("open");
        else if (ev.type === "release") audio.play("release");
        else if (ev.type === "start") audio.play("start");
        else if (ev.type === "win") onWinRef.current();
        else if (ev.type === "fail") {
          audio.play("fail");
          winTimer.current = setTimeout(() => setOverlay("fail"), 700);
        }
      }
      sim.events.length = 0;
      stepFx(fxRef.current, dt);

      // draw
      const ctx = cv.getContext("2d");
      const k = cv.width / E.W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const s = strokeRef.current;
      drawScene(ctx, sim, {
        t: realT.current,
        stroke: s?.st.pts,
        strokeBad: s?.bad,
        ghost: ghostRef.current || tutRef.current === 1 ? sim.level.sol.map((x) => x.pts) : null,
        fx: fxRef.current,
        accent: CHAPTERS[chapterOf(LEVELS.indexOf(sim.level))].color,
      });

      // HUD (only re-render when something visible changed)
      const ink = E.inkLeft(sim) / sim.level.ink;
      const hold = sim.goalMet ? Math.min(1, sim.hold / (sim.level.goal.hold || 1)) : 0;
      const gp = E.goalProgress(sim);
      setHud((h) =>
        h.shapes === sim.drawn.length && Math.abs(h.ink - ink) < 0.004 && h.state === sim.state && Math.abs(h.hold - hold) < 0.02 && h.met === sim.goalMet && h.prog === gp
          ? h
          : { shapes: sim.drawn.length, ink, state: sim.state, hold, met: sim.goalMet, prog: gp },
      );
    },
    [audio],
  );

  useEffect(() => {
    if (screen !== "play" || MANUAL) return;
    let raf = 0, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      frame(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen, frame]);

  /* ---------- drawing input ---------- */
  const toWorld = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * E.W, y: ((e.clientY - r.top) / r.height) * E.H };
  };
  const canDraw = () => {
    const sim = simRef.current;
    return sim && !overlayRef.current && sim.state !== "won" && sim.state !== "failed";
  };
  const onDown = (e) => {
    if (!canDraw() || strokeRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    setTip(null);
    const sim = simRef.current;
    if (E.inkLeft(sim) < 1) {
      audio.play("nope");
      flash("Out of ink — undo a shape to get it back");
      return;
    }
    const st = E.createStroke(sim);
    st.add(toWorld(e));
    if (!st.pts.length) {
      audio.play("nope");
      flash("Can't draw there — keep clear of objects and red zones");
      return;
    }
    strokeRef.current = { st, id: e.pointerId, bad: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };
  const onMove = (e) => {
    const s = strokeRef.current;
    if (!s || s.id !== e.pointerId) return;
    e.preventDefault();
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const list = evs.length ? evs : [e];
    const before = s.st.pts.length;
    for (const ev of list) {
      if (s.st.dead) break;
      s.st.add(toWorld(ev));
    }
    if (s.st.pts.length > before) audio.play("scratch");
    if (s.st.blocked && !s.bad) audio.play("nope");
    s.bad = s.st.blocked;
  };
  const onUp = (e) => {
    const s = strokeRef.current;
    if (!s || s.id !== e.pointerId) return;
    strokeRef.current = null;
    const sim = simRef.current;
    if (!canDraw()) return;
    const rec = E.commitStroke(sim, s.st.pts);
    if (rec) {
      rec.bornReal = realT.current;
      audio.play("pop");
      if (tutRef.current === 1) setTut(2);
      if (E.inkLeft(sim) < 1) flash("That was the last of your ink!");
    } else if (s.st.pts.length) audio.play("nope");
  };

  /* ---------- actions ---------- */
  const undo = useCallback(() => {
    const sim = simRef.current;
    if (!sim || overlayRef.current || sim.state === "won") return;
    if (E.undo(sim)) audio.play("undo");
  }, [audio]);
  const togglePause = useCallback(() => {
    if (screen !== "play") return;
    const sim = simRef.current;
    if (sim?.state === "won") return;
    setOverlay((o) => (o === "pause" ? null : o ? o : "pause"));
    audio.play("tap");
  }, [screen, audio]);
  const showHint = useCallback(() => {
    if (!simRef.current || simRef.current.state === "won") return;
    if (ghost) return setGhost(false);
    setGhost(true);
    audio.play("hint");
    if (!hinted) {
      setHinted(true);
      if ((prog.best[lvl]?.stars ?? 0) < 3) flash("Hint on — this level now gives at most ★★", 2800);
    }
  }, [ghost, hinted, prog, lvl, flash, audio]);
  const nextLvl = () => {
    audio.play("tap");
    if (lvl + 1 < N) openLevel(lvl + 1);
    else setScreen("levels");
  };
  const toggleSound = () => {
    saveProg({ ...prog, sound: !prog.sound });
  };

  /* ---------- fullscreen ---------- */
  const fsTarget = () => rootRef.current?.closest(".game-player") || rootRef.current;
  useEffect(() => {
    const sync = () => setIsFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => (document.removeEventListener("fullscreenchange", sync), document.removeEventListener("webkitfullscreenchange", sync));
  }, []);
  const canFs = typeof document !== "undefined" && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const toggleFs = async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
      else {
        const el = fsTarget();
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      /* refused */
    }
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (screen !== "play" || e.target?.closest?.("input, textarea")) return;
      if (!rootRef.current?.isConnected) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "backspace") (e.preventDefault(), undo());
      else if (k === "r") restart();
      else if (k === "p" || k === "escape") (e.preventDefault(), togglePause());
      else if (k === "h") showHint();
      else if ((k === "enter" || k === "n") && overlay === "win") nextLvl();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- DEV test hooks ---------- */
  useEffect(() => {
    if (!TEST) return;
    window.__gs = {
      E,
      LEVELS,
      sim: () => simRef.current,
      prog: () => prog,
      screen: () => screen,
      overlay: () => overlay,
      hud: () => hud,
      play: (i) => openLevel(i),
      setScreen,
      setOverlay,
      advance: (frames = 1) => {
        for (let i = 0; i < frames; i++) frame(E.FRAME);
      },
      /** draws the reference solution through the real stroke rules, stepping physics in between */
      solve: (maxFrames = 2400) => {
        const sim = simRef.current, sol = sim.level.sol;
        let qi = 0, f = 0;
        while (f < maxFrames && sim.state !== "won" && sim.state !== "failed") {
          while (qi < sol.length && (sim.time >= sol[qi].t || !sim.started)) {
            const rec = E.drawPoints(sim, sol[qi].pts);
            if (rec) rec.bornReal = realT.current;
            qi++;
          }
          frame(E.FRAME);
          f++;
        }
        return sim.state;
      },
    };
  });

  /* ---------- render ---------- */
  const solvedCount = Object.keys(prog.best).length;
  const stars = P.totalStars(prog);
  const goal = level.goal.all[0];
  const best = prog.best[lvl];
  const parText = `★★★ ≤ ${level.par[0]} shape${level.par[0] > 1 ? "s" : ""}`;
  const projected = E.starsFor(level, Math.max(1, hud.shapes), hinted);

  return (
    <div ref={rootRef} className={`gs gs--${screen}`} style={{ "--accent": chapter.color }} onContextMenu={(e) => e.preventDefault()}>
      <div className="gs-bg" />

      {screen === "menu" && (
        <div className="gs-menu">
          <div className="gs-menu__card">
            <div className="gs-logo">
              <span className="gs-logo__a">Gravity</span>
              <span className="gs-logo__b">Sketch</span>
            </div>
            <p className="gs-menu__sub">Draw it. Drop it. Solve it.</p>
            <Doodle />
            <div className="gs-menu__btns">
              <button
                className="gs-btn gs-btn--big gs-btn--primary"
                onClick={() => {
                  audio.play("tap");
                  if (!prog.tutorial && solvedCount === 0) openLevel(0);
                  else openLevel(P.nextLevel(prog, N));
                }}
              >
                <Icon d={I.play} /> {solvedCount ? "Continue" : "Play"}
              </button>
              <button className="gs-btn gs-btn--big" onClick={() => (audio.play("tap"), setScreen("levels"))}>
                <Icon d={I.grid} /> Levels
              </button>
              <button className="gs-btn gs-btn--big" onClick={() => (audio.play("tap"), setOverlay("howto"))}>
                <Icon d={I.help} /> How to play
              </button>
            </div>
            <div className="gs-menu__foot">
              <span className="gs-chip">
                <Stars n={1} total={1} /> {stars} / {N * 3}
              </span>
              <span className="gs-chip">
                {solvedCount} / {N} solved
              </span>
              <button className="gs-iconbtn" onClick={toggleSound} aria-label={prog.sound ? "Sound off" : "Sound on"} title="Sound">
                <Icon d={prog.sound ? I.sound : I.mute} />
              </button>
              {canFs && (
                <button className="gs-iconbtn" onClick={toggleFs} aria-label="Fullscreen" title="Fullscreen">
                  <Icon d={isFs ? I.exitFull : I.full} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {screen === "levels" && (
        <div className="gs-levels">
          <div className="gs-levels__head">
            <button className="gs-iconbtn" onClick={() => (audio.play("tap"), setScreen("menu"))} aria-label="Back to menu">
              <Icon d={I.home} />
            </button>
            <h2>Choose a level</h2>
            <span className="gs-chip">
              <Stars n={1} total={1} /> {stars} / {N * 3}
            </span>
          </div>
          <div className="gs-levels__rows">
            {CHAPTERS.map((ch, c) => (
              <div className="gs-chapter" key={ch.name} style={{ "--cc": ch.color }}>
                <div className="gs-chapter__name">
                  <b>{c + 1}</b>
                  <span>{ch.name}</span>
                </div>
                <div className="gs-chapter__grid">
                  {LEVELS.slice(ch.from, CHAPTERS[c + 1]?.from ?? N).map((L, k) => {
                    const i = ch.from + k, locked = i > prog.unlocked, b = prog.best[i];
                    return (
                      <button
                        key={i}
                        className={`gs-lv${locked ? " gs-lv--locked" : ""}${b ? " gs-lv--done" : ""}${!b && i === P.nextLevel(prog, N) ? " gs-lv--next" : ""}`}
                        disabled={locked}
                        onClick={() => (audio.play("tap"), openLevel(i))}
                        title={locked ? "Locked" : L.name}
                        aria-label={`Level ${i + 1}${locked ? " (locked)" : `: ${L.name}`}`}
                      >
                        {locked ? <Icon d={I.lock} /> : <span className="gs-lv__n">{i + 1}</span>}
                        {!locked && <Stars n={b?.stars ?? 0} size={0.8} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {screen === "play" && (
        <div className="gs-play">
          <div className="gs-hud">
            <div className="gs-hud__left">
              <button className="gs-iconbtn" onClick={togglePause} aria-label="Pause" title="Pause (P)">
                <Icon d={I.pause} />
              </button>
              <div className="gs-title">
                <span className="gs-title__n">Level {lvl + 1}</span>
                <span className="gs-title__name">{level.name}</span>
              </div>
            </div>
            <div className={`gs-task${hud.met ? " gs-task--met" : ""}`}>
              <span className="gs-task__icon">{GOAL_ICON[goal.t] || "🎯"}</span>
              <span className="gs-task__text">{level.task}</span>
              {hud.met && (level.goal.hold ?? 1.5) > 0 && hud.state === "running" && (
                <span className="gs-hold" style={{ "--p": hud.hold }} aria-label="Hold" />
              )}
            </div>
            <div className="gs-hud__right">
              <button className={`gs-iconbtn${ghost ? " is-on" : ""}`} onClick={showHint} aria-label="Hint" title="Hint (H)">
                <Icon d={I.bulb} />
              </button>
              <button className="gs-iconbtn" onClick={undo} disabled={!hud.shapes || hud.state === "won"} aria-label="Undo" title="Undo (Z)">
                <Icon d={I.undo} />
              </button>
              <button className="gs-iconbtn" onClick={restart} aria-label="Restart level" title="Restart (R)">
                <Icon d={I.restart} />
              </button>
              {canFs && (
                <button className="gs-iconbtn gs-hide-sm" onClick={toggleFs} aria-label="Fullscreen" title="Fullscreen">
                  <Icon d={isFs ? I.exitFull : I.full} />
                </button>
              )}
            </div>
          </div>
          <div className="gs-meters">
            <div className="gs-ink" title="Ink left">
              <Icon d={I.pen} />
              <div className="gs-ink__bar">
                <i style={{ transform: `scaleX(${hud.ink})` }} className={hud.ink < 0.2 ? "low" : ""} />
              </div>
            </div>
            <div className="gs-shapes" title={parText}>
              <span>
                {hud.shapes} shape{hud.shapes === 1 ? "" : "s"}
              </span>
              <Stars n={hud.shapes ? projected : hinted ? 2 : 3} size={0.85} />
            </div>
          </div>
          <div className="gs-stage" ref={stageRef}>
            <canvas
              ref={canvasRef}
              className="gs-canvas"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onLostPointerCapture={onUp}
            />
            {hud.state === "ready" && !overlay && (
              <div className="gs-banner">
                <Icon d={I.pen} /> Physics starts when you finish your first shape
              </div>
            )}
            {tut === 1 && !overlay && (
              <div className="gs-coach gs-coach--tut">
                <b>Draw a line across the gap</b>
                <span>Press and drag along the dotted path, then let go.</span>
              </div>
            )}
            {tut === 2 && hud.state === "running" && !overlay && (
              <div className="gs-coach gs-coach--tut">
                <b>Your line is real!</b>
                <span>It has weight and falls. Use Undo ↶ or Restart ⟲ any time.</span>
              </div>
            )}
            {tip && !overlay && tut === 0 && (
              <button className="gs-coach" onClick={() => setTip(null)}>
                <b>Tip</b>
                <span>{tip}</span>
                <em>tap to dismiss</em>
              </button>
            )}
            {hud.state !== "ready" && !overlay && (
              <div className="gs-rotate" aria-hidden="true">
                <span>📱↻</span> Turn your device sideways for a bigger page
              </div>
            )}
            {toast && (
              <div className="gs-toast" key={toast.id}>
                {toast.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- overlays ---------- */}
      {overlay === "pause" && (
        <div className="gs-overlay" onClick={(e) => e.target === e.currentTarget && setOverlay(null)}>
          <div className="gs-panel">
            <h2>Paused</h2>
            <p className="gs-panel__sub">
              Level {lvl + 1} · {level.name}
            </p>
            <p className="gs-panel__task">{level.task}</p>
            <div className="gs-panel__btns">
              <button className="gs-btn gs-btn--primary" onClick={() => (audio.play("tap"), setOverlay(null))}>
                <Icon d={I.play} /> Resume
              </button>
              <button className="gs-btn" onClick={restart}>
                <Icon d={I.restart} /> Restart
              </button>
              <button className="gs-btn" onClick={() => (audio.play("tap"), setOverlay(null), setScreen("levels"))}>
                <Icon d={I.grid} /> Levels
              </button>
              <button className="gs-btn" onClick={() => (audio.play("tap"), setOverlay(null), setScreen("menu"))}>
                <Icon d={I.home} /> Menu
              </button>
            </div>
            <div className="gs-panel__row">
              <button className="gs-iconbtn" onClick={toggleSound} aria-label="Toggle sound">
                <Icon d={prog.sound ? I.sound : I.mute} />
              </button>
              <span>Sound {prog.sound ? "on" : "off"}</span>
            </div>
          </div>
        </div>
      )}

      {overlay === "win" && result && (
        <div className="gs-overlay gs-overlay--win">
          <div className="gs-panel gs-panel--win">
            <div className="gs-win__clip">
              <div className="gs-win__burst" />
            </div>
            <h2>{["", "Solved!", "Great job!", "Brilliant!"][result.stars]}</h2>
            <Stars n={result.stars} size={3.2} anim />
            <p className="gs-panel__sub">
              {result.shapes} shape{result.shapes === 1 ? "" : "s"} · {parText}
              {hinted ? " · hint used" : ""}
            </p>
            {result.newBest && !result.first && <p className="gs-newbest">New best!</p>}
            <div className="gs-panel__btns gs-panel__btns--row">
              <button className="gs-btn" onClick={restart} aria-label="Replay">
                <Icon d={I.restart} /> Replay
              </button>
              <button className="gs-btn" onClick={() => (audio.play("tap"), setOverlay(null), setScreen("levels"))} aria-label="Levels">
                <Icon d={I.grid} /> Levels
              </button>
              <button className="gs-btn gs-btn--primary" onClick={nextLvl} autoFocus>
                {lvl + 1 < N ? (
                  <>
                    Next <Icon d={I.next} />
                  </>
                ) : (
                  "All done!"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay === "fail" && (
        <div className="gs-overlay">
          <div className="gs-panel gs-panel--fail">
            <h2>Oops!</h2>
            <p className="gs-panel__task">{simRef.current?.failReason || "Try again!"}</p>
            <div className="gs-panel__btns gs-panel__btns--row">
              <button className="gs-btn" onClick={() => (audio.play("tap"), setOverlay(null), setScreen("levels"))}>
                <Icon d={I.grid} /> Levels
              </button>
              <button className="gs-btn gs-btn--primary" onClick={restart} autoFocus>
                <Icon d={I.restart} /> Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay === "howto" && (
        <div className="gs-overlay" onClick={(e) => e.target === e.currentTarget && setOverlay(null)}>
          <div className="gs-panel gs-panel--howto">
            <h2>How to play</h2>
            <div className="gs-howto">
              <div>
                <span className="gs-howto__i">✏️</span>
                <b>Draw</b>
                <p>Drag to sketch a line or shape. Tap for a small ball. Every shape becomes a real object with weight.</p>
              </div>
              <div>
                <span className="gs-howto__i">🌍</span>
                <b>Gravity</b>
                <p>Physics wakes up after your first shape. Shapes fall, roll and push — rest them on pegs and ledges.</p>
              </div>
              <div>
                <span className="gs-howto__i">🎯</span>
                <b>Solve</b>
                <p>Complete the objective at the top. Fewer shapes earn more stars. Stuck? Try the 💡 hint.</p>
              </div>
            </div>
            <p className="gs-panel__sub">You can't draw through objects or red striped zones. Ink is limited.</p>
            <p className="gs-keys">
              <kbd>Z</kbd> undo · <kbd>R</kbd> restart · <kbd>P</kbd> pause · <kbd>H</kbd> hint
            </p>
            <div className="gs-panel__btns gs-panel__btns--row">
              <button className="gs-btn gs-btn--primary" onClick={() => (audio.play("tap"), setOverlay(null))} autoFocus>
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
