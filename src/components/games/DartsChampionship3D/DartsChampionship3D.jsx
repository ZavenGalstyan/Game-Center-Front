/**
 * Darts Championship 3D — 301 / 501 double-out darts vs an AI (Sports).
 *
 * One requestAnimationFrame loop drives a small phase machine and a plain
 * Three.js arena (scene.js). Scoring is pure (board.js) and so are the match
 * rules and AI (rules.js): every dart's score comes from its actual impact
 * point. React draws the HUD and menu / pause / results cards; per-frame bits
 * (crosshair, power meter) are written straight to the DOM.
 *
 * Controls: move the mouse / finger to aim · hold to charge power (sweet spot
 * marked on the meter) · release to throw. Space also charges. Esc/P pauses.
 *
 * GamePlayer: `restartSignal` restarts the match (ignored on the main menu),
 * `muted` silences audio, Fullscreen just resizes the stage.
 * DEV hook: `?dctest=1` exposes window.__dc.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./DartsChampionship3D.css";
import { createScene } from "./scene.js";
import { scoreAt } from "./board.js";
import { DIFFICULTY, newMatch, applyDart, nextTurn, average, checkoutRoute, aiThrow, gauss, powerOffset, IDEAL_POWER } from "./rules.js";
import { audio } from "./audio.js";

const STORE_KEY = "darts-championship-3d-progress";
const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dctest");
const NAMES = ["YOU", "CPU"];
const TOUCH_LIFT = 72; // px the crosshair sits above a finger
const ease = (t) => t * t * (3 - 2 * t);

const DEFAULT_STORE = { wins: 0, losses: 0, best: { 301: 0, 501: 0 }, highTurn: 0, bestCheckout: 0, bestAvg: 0, mode: 501, diff: "medium" };
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return s && typeof s === "object" ? { ...DEFAULT_STORE, ...s, best: { ...DEFAULT_STORE.best, ...s.best } } : DEFAULT_STORE;
  } catch {
    return DEFAULT_STORE;
  }
}
function saveStore(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked — records just won't persist */
  }
}

/** Remaining-after-each-turn columns for the chalk scoreboard. */
function chalkRows(m) {
  return m.turns.map((list) => {
    let r = m.start;
    return [m.start, ...list.map((t) => (t === "BUST" ? r : (r -= t)))];
  });
}

const dartText = (d) => (d.bust ? "BUST" : d.label === "MISS" ? "—" : d.label);

export default function DartsChampionship3D({ restartSignal = 0, muted = false }) {
  const stageRef = useRef(null);
  const crossRef = useRef(null);
  const meterRef = useRef(null);
  const meterValRef = useRef(null);
  const sceneRef = useRef(null);
  const g = useRef(null);
  if (!g.current) {
    g.current = { phase: "menu", match: newMatch(501), mode: 501, diff: "medium", idx: 0, power: 0, pdir: 1, lastPower: 0, pointer: { nx: 0, ny: 0 }, aim: { x: 0, y: 0 }, timer: 0, ai: null, paused: false, t: 0, done: false };
  }
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = loadStore();

  const [screen, setScreenState] = useState("menu"); // menu | play | results
  const [paused, setPausedState] = useState(false);
  const [phase, setPhaseState] = useState("menu");
  const [match, setMatch] = useState(() => g.current.match);
  const [store, setStore] = useState(storeRef.current);
  const [mode, setMode] = useState(storeRef.current.mode);
  const [diff, setDiff] = useState(storeRef.current.diff);
  const [banner, setBanner] = useState(null);
  const [popups, setPopups] = useState([]);
  const [last, setLast] = useState(null);
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
  const bannerId = useRef(0);
  const showBanner = useCallback((text, sub = "", kind = "info", ms = 1300) => {
    const id = ++bannerId.current;
    setBanner({ id, text, sub, kind });
    setTimeout(() => alive.current && setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);
  const popup = useCallback((x, y, text, kind) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const p = sc.project(x, y);
    const id = ++bannerId.current;
    setPopups((l) => [...l.slice(-4), { id, x: p.x, y: p.y, text, kind }]);
    setTimeout(() => alive.current && setPopups((l) => l.filter((q) => q.id !== id)), 1000);
  }, []);
  const commit = useCallback((m) => {
    g.current.match = m;
    setMatch(m);
    sceneRef.current?.setScoreboard({ title: String(m.start), names: NAMES, rows: chalkRows(m), rem: m.rem, active: m.over ? -1 : m.player });
  }, []);

  /* ------------------------------------------------------------ flow */
  const beginTurn = useCallback(() => {
    const G = g.current;
    const sc = sceneRef.current;
    G.idx = 0;
    G.ai = null;
    G.timer = 0;
    const p = G.match.player;
    sc.setCamMode(p === 0 ? "player" : "ai");
    sc.setHand(-1);
    setPhase(p === 0 ? "aim" : "aiAim");
  }, [setPhase]);

  const startMatch = useCallback(
    (m = g.current.mode, d = g.current.diff) => {
      const G = g.current;
      audio.unlock();
      audio.cue("ui");
      Object.assign(G, { mode: m, diff: d, power: 0, lastPower: 0, done: false });
      sceneRef.current?.clearDarts();
      commit(newMatch(m, 0));
      setBanner(null);
      setPopups([]);
      setLast(null);
      setResult(null);
      setHowTo(false);
      setPaused(false);
      setScreen("play");
      beginTurn();
      showBanner("GAME ON!", `${m} · Double out · You throw first`, "info", 1500);
    },
    [beginTurn, commit, setPaused, setScreen, showBanner],
  );

  const toMenu = useCallback(() => {
    const sc = sceneRef.current;
    sc?.clearDarts();
    sc?.setHand(-1);
    sc?.setCamMode("menu");
    setPaused(false);
    setPhase("menu");
    setScreen("menu");
    setBanner(null);
    setPopups([]);
  }, [setPaused, setPhase, setScreen]);

  const finishMatch = useCallback(() => {
    const G = g.current;
    if (G.done) return;
    G.done = true;
    const m = G.match;
    const won = m.winner === 0;
    const prev = storeRef.current;
    const avg = average(m, 0);
    const best = { ...prev.best };
    const newBest = won && (!best[m.start] || m.thrown[0] < best[m.start]);
    if (newBest) best[m.start] = m.thrown[0];
    const s = {
      ...prev,
      wins: prev.wins + (won ? 1 : 0),
      losses: prev.losses + (won ? 0 : 1),
      best,
      highTurn: Math.max(prev.highTurn, m.best[0]),
      bestCheckout: won ? Math.max(prev.bestCheckout, m.checkout) : prev.bestCheckout,
      bestAvg: Math.max(prev.bestAvg, Math.round(avg * 10) / 10),
    };
    storeRef.current = s;
    saveStore(s);
    setStore(s);
    setResult({ won, newBest, m });
    sceneRef.current.setCamMode("menu");
    setPhase("menu");
    setScreen("results");
  }, [setPhase, setScreen]);

  /** A dart has struck: score it, give feedback, decide what comes next. */
  const landDart = useCallback(
    (x, y, hit) => {
      const G = g.current;
      const sc = sceneRef.current;
      const who = G.match.player;
      const { m, outcome } = applyDart(G.match, hit);
      audio.thud(Math.hypot(x, y) <= 225);
      G.idx++;
      commit(m);
      setLast({ who, label: dartText(hit), score: hit.score });
      popup(x, y, hit.ring === "miss" ? "MISS" : hit.score ? `${hit.label === "BULL" ? "BULL" : hit.label} · ${hit.score}` : "0", hit.ring);

      if (outcome.type === "win") {
        audio.cue(who === 0 ? "win" : "lose");
        sc.flash(1.2);
        showBanner("GAME SHOT!", who === 0 ? `You win · ${m.checkout} checkout` : `CPU wins · ${m.checkout} checkout`, who === 0 ? "win" : "lose", 2200);
        G.timer = 2.4;
        setPhase("over");
        return;
      }
      if (outcome.type === "bust") {
        audio.cue("bust");
        showBanner("BUST", `Score stays ${m.rem[who]}`, "bust", 1500);
      } else if (hit.ring === "inner-bull") {
        audio.cue("bull");
        sc.flash(1);
        showBanner("BULLSEYE!", "50", "bull", 1100);
      } else if (hit.ring === "treble") {
        audio.cue("treble");
        sc.flash(0.5);
        showBanner(`TRIPLE ${hit.num}`, `${hit.score}`, "treble", 900);
      } else if (hit.ring === "double") {
        audio.cue("double");
        showBanner(`DOUBLE ${hit.num}`, `${hit.score}`, "double", 900);
      }
      if (outcome.turnOver) {
        if (outcome.type !== "bust") {
          const s = outcome.turnScore;
          if (s === 180) {
            audio.cue("max");
            sc.flash(1.5);
            showBanner("ONE HUNDRED AND EIGHTY!", who === 0 ? "Maximum!" : "CPU hits the max", "max", 2000);
          } else if (s >= 100) showBanner(`${s}`, "Ton plus!", "ton", 1200);
        }
        G.timer = outcome.type === "bust" ? 1.6 : 1.3;
        setPhase("turnEnd");
      } else {
        G.timer = 0.35;
        setPhase("after");
      }
    },
    [commit, popup, setPhase, showBanner],
  );

  const startCharge = useCallback(() => {
    const G = g.current;
    const sc = sceneRef.current;
    if (screenRef.current !== "play" || G.paused || G.phase !== "aim" || !sc?.camReady()) return;
    audio.unlock();
    G.power = 0;
    G.pdir = 1;
    setPhase("charge");
  }, [setPhase]);

  const release = useCallback(() => {
    const G = g.current;
    if (G.phase !== "charge" || G.paused) return;
    const lvl = DIFFICULTY[G.diff];
    G.lastPower = G.power;
    let x = G.aim.x + gauss() * lvl.release;
    let y = G.aim.y + gauss() * lvl.release + powerOffset(G.power);
    const r = Math.hypot(x, y);
    if (r > 440) [x, y] = [(x / r) * 440, (y / r) * 440];
    const hit = scoreAt(x, y);
    audio.whoosh();
    sceneRef.current.throwDart(0, G.idx, x, y, () => landDart(x, y, hit));
    setPhase("flight");
  }, [landDart, setPhase]);

  const togglePause = useCallback(() => {
    const G = g.current;
    if (screenRef.current !== "play" || G.phase === "over") return;
    if (!G.paused && G.phase === "charge") setPhase("aim");
    setPaused(!G.paused);
  }, [setPaused, setPhase]);

  const pick = useCallback((key, val) => {
    audio.unlock();
    audio.cue("ui");
    const s = { ...storeRef.current, [key]: val };
    storeRef.current = s;
    saveStore(s);
    setStore(s);
    g.current[key] = val;
    (key === "mode" ? setMode : setDiff)(val);
  }, []);

  /* ------------------------------------------------------------ scene + loop */
  useEffect(() => {
    alive.current = true;
    // a fresh canvas per mount: StrictMode re-runs this effect and a disposed
    // renderer leaves its canvas with a lost context
    const canvas = document.createElement("canvas");
    canvas.className = "dc-canvas";
    stageRef.current.appendChild(canvas);
    const sc = createScene(canvas);
    sceneRef.current = sc;
    g.current.mode = storeRef.current.mode;
    g.current.diff = storeRef.current.diff;
    commit(newMatch(storeRef.current.mode));
    const ro = new ResizeObserver(() => {
      const el = stageRef.current;
      if (el) sc.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(stageRef.current);
    sc.resize(stageRef.current.clientWidth, stageRef.current.clientHeight);
    sc.setCamMode("menu", true);

    let raf = 0;
    let lastT = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      step(dt);
      raf = requestAnimationFrame(frame);
    };

    function step(dt) {
      const G = g.current;
      const live = !G.paused;
      const lvl = DIFFICULTY[G.diff];
      let cross = null; // { x, y, ai }
      if (live) {
        G.t += dt;
        const ph = G.phase;
        if (ph === "aim" || ph === "charge") {
          if (sc.camReady()) {
            const raw = sc.boardAt(G.pointer.nx, G.pointer.ny) || { x: 0, y: 0 };
            const t = G.t, a = lvl.drift;
            // skill drift: a slow Lissajous sway that grows with difficulty
            G.aim.x = Math.max(-440, Math.min(440, raw.x + a * (Math.sin(t * 1.3) * 0.7 + Math.sin(t * 3.1 + 1) * 0.3)));
            G.aim.y = Math.max(-440, Math.min(440, raw.y + a * (Math.cos(t * 1.07) * 0.6 + Math.sin(t * 2.3 + 2) * 0.4)));
            cross = { ...G.aim, ai: false };
            sc.setHand(0, G.idx, G.phase === "charge" ? G.power : 0, G.aim);
          }
          if (ph === "charge") {
            G.power += G.pdir * dt * 0.95;
            if (G.power >= 1) [G.power, G.pdir] = [1, -1];
            if (G.power <= 0) [G.power, G.pdir] = [0, 1];
          }
        } else if (ph === "after") {
          G.timer -= dt;
          if (G.timer <= 0) setPhase(G.match.player === 0 ? "aim" : "aiAim");
        } else if (ph === "aiAim") {
          if (sc.camReady() || G.ai) {
            if (!G.ai) {
              const plan = aiThrow(G.match.rem[1], G.diff);
              const from = G.lastAi || { x: 0, y: -150 };
              G.ai = { plan, from, t: 0, dur: 0.75 + (G.diff === "easy" ? 0.25 : 0) };
            }
            const A = G.ai;
            A.t += dt;
            const k = ease(Math.min(1, A.t / A.dur));
            const w = lvl.sigma * 0.35 * (1 - k * 0.6);
            cross = {
              x: A.from.x + (A.plan.aim.x - A.from.x) * k + Math.sin(G.t * 5.1) * w,
              y: A.from.y + (A.plan.aim.y - A.from.y) * k + Math.cos(G.t * 4.3) * w,
              ai: true,
            };
            if (A.t >= A.dur + 0.25) {
              const { x, y, hit } = A.plan;
              G.lastAi = A.plan.aim;
              G.ai = null;
              audio.whoosh();
              sc.throwDart(1, G.idx, x, y, () => landDart(x, y, hit));
              setPhase("flight");
            }
          }
        } else if (ph === "turnEnd") {
          G.timer -= dt;
          if (G.timer <= 0) {
            sc.clearDarts(G.match.player);
            commit(nextTurn(G.match));
            if (G.match.player === 0) audio.cue("turn");
            beginTurn();
          }
        } else if (ph === "over") {
          G.timer -= dt;
          if (G.timer <= 0) finishMatch();
        }
      }

      // per-frame HUD straight to the DOM
      const el = crossRef.current;
      if (el) {
        if (cross && screenRef.current === "play" && !G.paused) {
          const p = sc.project(cross.x, cross.y);
          el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
          el.dataset.ai = cross.ai ? "1" : "0";
          el.style.opacity = "1";
        } else el.style.opacity = "0";
      }
      if (meterRef.current) {
        const p = G.phase === "charge" ? G.power : G.phase === "aim" ? 0 : G.lastPower;
        meterRef.current.style.transform = `scaleY(${p.toFixed(3)})`;
        if (meterValRef.current) meterValRef.current.textContent = `${Math.round(p * 100)}%`;
      }
      sc.update(live ? dt : 0);
      sc.render();
    }

    // DEV: rAF can be throttled in automation — let QA drive frames by hand
    if (TEST) window.__dc = { g: g.current, sc, run: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) step(dt); } };
    raf = requestAnimationFrame(frame);
    return () => {
      alive.current = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      sc.dispose();
      canvas.remove();
      sceneRef.current = null;
      if (TEST) delete window.__dc;
    };
    // the loop reads everything through refs; the callbacks it uses are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ input */
  useEffect(() => {
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    const down = (e) => {
      if (screenRef.current !== "play" || typing(e)) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        togglePause();
      } else if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) startCharge();
      }
    };
    const up = (e) => {
      if (e.code === "Space" && screenRef.current === "play") {
        e.preventDefault();
        release();
      }
    };
    const blur = () => {
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
  }, [release, setPhase, startCharge, togglePause]);

  const track = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    const lift = e.pointerType === "touch" ? TOUCH_LIFT : 0;
    g.current.pointer = { nx: ((e.clientX - r.left) / r.width) * 2 - 1, ny: -(((e.clientY - lift - r.top) / r.height) * 2 - 1) };
  };
  const onPointerDown = (e) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || screenRef.current !== "play") return;
    track(e);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone — the throw still works without capture */
    }
    startCharge();
  };

  /* ------------------------------------------------------------ GamePlayer */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current !== "menu") startMatch();
  }, [restartSignal, startMatch]);
  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ render */
  const p = match.player;
  const dartsLeft = 3 - match.darts.length;
  const route = !match.over && phase !== "turnEnd" ? checkoutRoute(match.rem[p], dartsLeft) : null;
  const turnScore = match.turnStart - match.rem[p];
  const aiming = phase === "aim" || phase === "charge";
  const stop = (e) => e.stopPropagation();
  const recordLine = (s) => (s.best[mode] ? `${s.best[mode]} darts` : "—");

  return (
    <div className={`dc${screen === "play" ? " is-playing" : ""}`}>
      <div
        ref={stageRef}
        className={`dc-stage${aiming && !paused ? " is-aiming" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={track}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div ref={crossRef} className="dc-cross" aria-hidden="true">
        <i />
      </div>

      {screen === "play" && (
        <>
          <div className="dc-board">
            {[0, 1].map((i) => (
              <div key={i} className={`dc-player${i === p && !match.over ? " is-on" : ""}${i === 1 ? " is-cpu" : ""}`}>
                <div className="dc-player-head">
                  <span className="dc-name">{i === 0 ? "You" : `CPU · ${DIFFICULTY[g.current.diff].name}`}</span>
                  {i === p && !match.over && (
                    <span className="dc-darts" aria-label={`${dartsLeft} darts left`}>
                      {[0, 1, 2].map((k) => <i key={k} className={k < dartsLeft ? "is-left" : ""} />)}
                    </span>
                  )}
                </div>
                <b className="dc-rem">{match.rem[i]}</b>
                <div className="dc-sub">
                  <span>Avg <b>{average(match, i).toFixed(1)}</b></span>
                  <span>Darts <b>{match.thrown[i]}</b></span>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="dc-pausebtn" onClick={togglePause} onPointerDown={stop} aria-label="Pause">
            <span />
            <span />
          </button>

          <div className="dc-turn">
            <div className="dc-mode">{match.start} · Double out</div>
            <div className="dc-turn-head">
              <span>{p === 0 ? "Your turn" : "CPU turn"}</span>
              <b>{turnScore}</b>
            </div>
            <div className="dc-slots">
              {[0, 1, 2].map((k) => {
                const d = match.darts[k];
                return (
                  <span key={k} className={d ? `is-${d.bust ? "bust" : d.ring}` : ""}>
                    {d ? dartText(d) : "·"}
                  </span>
                );
              })}
            </div>
            {route && <div className="dc-route">Checkout <b>{route.join(" · ")}</b></div>}
            {last && <div className="dc-last">Last: {NAMES[last.who]} <b>{last.label}</b>{last.label !== "BUST" && ` (${last.score})`}</div>}
          </div>

          <div className={`dc-meter${p === 0 ? "" : " is-idle"}`} aria-label="Power">
            <span className="dc-meter-label">Power</span>
            <div className="dc-meter-bar">
              <em style={{ bottom: `${(IDEAL_POWER - 0.06) * 100}%`, height: "12%" }} />
              <div ref={meterRef} className="dc-meter-fill" />
            </div>
            <span ref={meterValRef} className="dc-meter-val">0%</span>
          </div>

          <div className="dc-hint">
            {phase === "aim" && "Aim with mouse / finger · hold to charge · release in the gold zone"}
            {phase === "charge" && "Release to throw!"}
            {phase === "aiAim" && "CPU is aiming…"}
          </div>

          {popups.map((q) => (
            <div key={q.id} className={`dc-pop is-${q.kind}`} style={{ left: q.x, top: q.y }}>
              {q.text}
            </div>
          ))}
          {banner && (
            <div key={banner.id} className={`dc-banner dc-banner--${banner.kind}`}>
              <strong>{banner.text}</strong>
              {banner.sub && <span>{banner.sub}</span>}
            </div>
          )}
        </>
      )}

      {screen === "menu" && (
        <div className="dc-overlay dc-overlay--menu" onPointerDown={stop}>
          <div className="dc-card dc-card--menu">
            <p className="dc-kicker">Sports · Darts</p>
            <h1 className="dc-title">
              Darts Championship <em>3D</em>
            </h1>
            <p className="dc-tagline">AIM • THROW • BULLSEYE</p>
            {howTo ? (
              <ul className="dc-howto">
                <li>Move the <kbd>mouse</kbd> or your finger to aim — the crosshair sways a little</li>
                <li>Hold to charge power, release in the <b>gold zone</b>; too soft drops low, too hard flies high</li>
                <li>3 darts a turn. Count down from 301 / 501 to exactly zero</li>
                <li>Finish on a <b>double</b> or the <b>bull</b> (50)</li>
                <li><b>Bust</b> — below zero, leaving 1, or zero without a double: score resets to the turn start</li>
                <li><kbd>Space</kbd> also charges · <kbd>Esc</kbd> / <kbd>P</kbd> pause</li>
              </ul>
            ) : (
              <>
                <div className="dc-pick">
                  <span>Game</span>
                  <div className="dc-seg" role="radiogroup" aria-label="Game mode">
                    {[301, 501].map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={mode === v} className={mode === v ? "is-on" : ""} onClick={() => pick("mode", v)}>{v}</button>
                    ))}
                  </div>
                </div>
                <div className="dc-pick">
                  <span>Opponent</span>
                  <div className="dc-seg" role="radiogroup" aria-label="Difficulty">
                    {Object.entries(DIFFICULTY).map(([k, v]) => (
                      <button key={k} type="button" role="radio" aria-checked={diff === k} className={diff === k ? "is-on" : ""} onClick={() => pick("diff", k)}>{v.name}</button>
                    ))}
                  </div>
                </div>
                <div className="dc-stats">
                  <div><span>Wins</span><b>{store.wins}</b></div>
                  <div><span>Losses</span><b>{store.losses}</b></div>
                  <div><span>Best {mode}</span><b>{recordLine(store)}</b></div>
                  <div><span>Best avg</span><b>{store.bestAvg ? store.bestAvg.toFixed(1) : "—"}</b></div>
                </div>
              </>
            )}
            <div className="dc-actions">
              <button type="button" className="dc-btn dc-btn--primary" onClick={() => startMatch(mode, diff)}>Play</button>
              <button type="button" className="dc-btn" onClick={() => setHowTo((v) => !v)}>{howTo ? "Back" : "How to play"}</button>
            </div>
          </div>
        </div>
      )}

      {screen === "play" && paused && (
        <div className="dc-overlay" onPointerDown={stop}>
          <div className="dc-card">
            <h2 className="dc-h2">Paused</h2>
            <p className="dc-sub2">{match.start} · You {match.rem[0]} — CPU {match.rem[1]}</p>
            <div className="dc-actions dc-actions--col">
              <button type="button" className="dc-btn dc-btn--primary" onClick={togglePause}>Resume</button>
              <button type="button" className="dc-btn" onClick={() => startMatch()}>Restart match</button>
              <button type="button" className="dc-btn" onClick={toMenu}>Main menu</button>
            </div>
          </div>
        </div>
      )}

      {screen === "results" && result && (
        <div className="dc-overlay" onPointerDown={stop}>
          <div className={`dc-card dc-card--results${result.won ? " is-win" : ""}`}>
            <p className="dc-kicker">{result.m.start} · {DIFFICULTY[g.current.diff].name} CPU</p>
            <h2 className="dc-final">{result.won ? "Victory!" : "Defeat"}</h2>
            <p className={`dc-best${result.newBest ? " is-new" : ""}`}>
              {result.won ? (result.newBest ? `New record: ${result.m.thrown[0]}-dart leg!` : `Won in ${result.m.thrown[0]} darts · ${result.m.checkout} checkout`) : `CPU checked out ${result.m.checkout}`}
            </p>
            <table className="dc-table">
              <thead>
                <tr><th /><th>You</th><th>CPU</th></tr>
              </thead>
              <tbody>
                <tr><td>3-dart avg</td><td>{average(result.m, 0).toFixed(1)}</td><td>{average(result.m, 1).toFixed(1)}</td></tr>
                <tr><td>Darts</td><td>{result.m.thrown[0]}</td><td>{result.m.thrown[1]}</td></tr>
                <tr><td>Best turn</td><td>{result.m.best[0]}</td><td>{result.m.best[1]}</td></tr>
                <tr><td>Left</td><td>{result.m.rem[0]}</td><td>{result.m.rem[1]}</td></tr>
              </tbody>
            </table>
            <div className="dc-stats dc-stats--three">
              <div><span>Record</span><b>{store.wins}–{store.losses}</b></div>
              <div><span>Best turn</span><b>{store.highTurn}</b></div>
              <div><span>Best checkout</span><b>{store.bestCheckout || "—"}</b></div>
            </div>
            <div className="dc-actions">
              <button type="button" className="dc-btn dc-btn--primary" onClick={() => startMatch()}>Play again</button>
              <button type="button" className="dc-btn" onClick={toMenu}>Main menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
