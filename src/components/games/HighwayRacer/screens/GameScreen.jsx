/**
 * Highway Racer — one play session: countdown → drive → crash → result.
 *
 * The run (engine/run.js) is stepped from the canvas frame loop through
 * `tickRef`; HUD numbers are written straight into the DOM every frame (no
 * React render per frame). React state only changes on phase changes, pops
 * and pause — so the screen stays cheap at any frame rate.
 *
 * Shared controls:
 *  - Restart (`restartSignal`): a fresh run with a fresh countdown. Coins,
 *    cars, records, statistics and settings are untouched.
 *  - Mute: handled globally by the sound module (master gain).
 *  - Fullscreen: the canvas only resizes; this component isn't remounted.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createRun } from "../engine/run.js";
import { KMH } from "../engine/config.js";
import { carById } from "../data/cars.js";
import { applyRun } from "../utils/storage.js";
import { sound } from "../audio/sound.js";
import { TEST } from "../utils/testHooks.js";

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} KM` : `${Math.floor(m)} M`);
const fmtInt = (n) => Math.floor(n).toLocaleString("en-US");

export default function GameScreen({ worldRef, tickRef, input, progressRef, commit, settings, touch, restartSignal, onExit }) {
  const [session, setSession] = useState(0);
  const [phase, setPhase] = useState("countdown");
  const [count, setCount] = useState(3);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [pops, setPops] = useState([]);
  const [combo, setCombo] = useState(0);
  const [boostReady, setBoostReady] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [help, setHelp] = useState(settings.controlHelp);
  const runRef = useRef(null);
  const pausedRef = useRef(false);
  const phaseRef = useRef("countdown");
  const popId = useRef(0);
  const hud = {
    score: useRef(null),
    dist: useRef(null),
    speed: useRef(null),
    coins: useRef(null),
    boost: useRef(null),
  };

  /* ------------------------------------------------------------ run lifecycle */
  const start = useCallback(() => {
    const p = progressRef.current;
    const R = createRun({ car: carById(p.selectedCar) });
    runRef.current = R;
    if (worldRef.current) worldRef.current.setRun(R);
    input.releaseAll();
    pausedRef.current = false;
    phaseRef.current = "countdown";
    setPaused(false);
    setPhase("countdown");
    setCount(3);
    setResult(null);
    setPops([]);
    setCombo(0);
    setBoostReady(false);
    setBoosting(false);
    setHelp(settings.controlHelp);
    sound.engineStart();
    sound.music("game");
    if (TEST) window.__hr.run = () => runRef.current;
  }, [input, progressRef, settings.controlHelp, worldRef]);

  useEffect(() => {
    start();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // outer Restart → fresh run (skips the first render)
  const firstSignal = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstSignal.current) return;
    firstSignal.current = restartSignal;
    setSession((s) => s + 1);
  }, [restartSignal]);

  useEffect(() => {
    input.attach();
    return () => {
      input.detach();
      tickRef.current = null;
      if (worldRef.current) worldRef.current.setRun(null);
      sound.engineStop();
    };
  }, [input, tickRef, worldRef]);

  /* ------------------------------------------------------------ pause */
  const setPause = useCallback(
    (v) => {
      const R = runRef.current;
      if (v && (!R || (R.phase !== "playing" && R.phase !== "countdown"))) return;
      pausedRef.current = v;
      setPaused(v);
      input.releaseAll();
      if (v) sound.engineStop();
      else if (R && (R.phase === "playing" || R.phase === "countdown")) sound.engineStart();
    },
    [input],
  );
  useEffect(() => {
    const vis = () => {
      if (document.visibilityState !== "visible") setPause(true);
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [setPause]);

  /* ------------------------------------------------------------ events */
  const pop = useCallback((text, kind) => {
    const id = ++popId.current;
    setPops((list) => [...list.slice(-3), { id, text, kind }]);
    setTimeout(() => setPops((list) => list.filter((x) => x.id !== id)), 1100);
  }, []);

  const finishRun = useCallback(
    (R) => {
      const summary = R.summary();
      let records = { distance: false, score: false };
      commit((p) => {
        const out = applyRun(p, summary);
        records = out.records;
        return out.next;
      });
      return { summary, records };
    },
    [commit],
  );

  const handle = useCallback(
    (R, e) => {
      const w = worldRef.current;
      if (w) w.event(e);
      switch (e.type) {
        case "count":
          setCount(e.n);
          sound.count(e.n);
          break;
        case "go":
          setCount(0);
          setTimeout(() => setCount((c) => (c === 0 ? -1 : c)), 750);
          phaseRef.current = "playing";
          setPhase("playing");
          sound.go();
          break;
        case "lane":
          sound.lane(e.dir);
          break;
        case "pass":
          if (Math.abs(e.dx) < 4.6) sound.pass(Math.abs(e.dx) < 3.4);
          break;
        case "near":
          sound.near(e.combo);
          pop(`NEAR MISS +${e.points}`, "near");
          setCombo(e.combo);
          break;
        case "comboEnd":
          setCombo(0);
          break;
        case "coin":
          sound.coin();
          break;
        case "boostPickup":
          sound.boostPickup();
          pop("BOOST +", "boost");
          break;
        case "boostReady":
          setBoostReady(true);
          sound.boostReady();
          break;
        case "boost":
          setBoostReady(false);
          setBoosting(true);
          sound.boost();
          break;
        case "boostEnd":
          setBoosting(false);
          break;
        case "crash": {
          sound.crash();
          sound.engineStop();
          setBoosting(false);
          setCombo(0);
          phaseRef.current = "crashed";
          setPhase("crashed");
          input.releaseAll();
          R.final = finishRun(R);
          break;
        }
        case "result": {
          phaseRef.current = "result";
          setPhase("result");
          const f = R.final || finishRun(R);
          setResult(f);
          sound.music("menu");
          if (f.records.distance || f.records.score) setTimeout(() => sound.record(), 250);
          break;
        }
        default:
      }
    },
    [finishRun, input, pop, worldRef],
  );

  /* ------------------------------------------------------------ frame tick */
  useEffect(() => {
    tickRef.current = (dt) => {
      const R = runRef.current;
      if (!R) return;
      const inp = input.take();
      if (inp.pause && (R.phase === "playing" || R.phase === "countdown")) {
        setPause(!pausedRef.current);
        return;
      }
      if (pausedRef.current) return;
      for (const d of inp.steer) R.steer(d);
      if (inp.boost) R.activateBoost();
      R.update(dt);
      if (R.events.length) {
        const evs = R.events.splice(0, R.events.length);
        for (const e of evs) handle(R, e);
      }
      // HUD straight into the DOM
      if (hud.score.current) hud.score.current.textContent = fmtInt(R.score);
      if (hud.dist.current) hud.dist.current.textContent = fmtDist(R.distance);
      if (hud.speed.current) hud.speed.current.textContent = String(Math.round(R.speed * KMH));
      if (hud.coins.current) hud.coins.current.textContent = String(R.coins);
      if (hud.boost.current) hud.boost.current.style.transform = `scaleX(${Math.max(0, Math.min(1, R.boost)).toFixed(3)})`;
      if (R.phase === "playing" || R.phase === "countdown") sound.engineUpdate(R.speed, R.boostTime > 0, R.phase === "countdown");
    };
    return () => {
      tickRef.current = null;
    };
  }, [handle, hud.boost, hud.coins, hud.dist, hud.score, hud.speed, input, setPause, tickRef]);

  // control help fades after a few seconds of driving
  useEffect(() => {
    if (phase !== "playing" || !help) return undefined;
    const id = setTimeout(() => setHelp(false), 6000);
    return () => clearTimeout(id);
  }, [phase, help]);

  // result screen keys: Enter = retry, Esc = menu
  useEffect(() => {
    if (phase !== "result") return undefined;
    const key = (e) => {
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        sound.ui();
        setSession((s) => s + 1);
      } else if (e.code === "Escape") {
        sound.uiBack();
        onExit("menu");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phase, onExit]);

  const retry = () => {
    sound.ui();
    setSession((s) => s + 1);
  };
  const exit = (to) => {
    sound.uiBack();
    onExit(to);
  };
  const touchPress = (what) => (e) => {
    e.preventDefault();
    sound.unlock();
    input.press(what);
  };

  const live = phase === "countdown" || phase === "playing";
  return (
    <div className={`hr-game${boosting ? " is-boosting" : ""}`}>
      {/* ---------------- HUD */}
      <div className={`hr-hud${phase === "result" ? " is-hidden" : ""}`}>
        <div className="hr-hud__block hr-hud__block--left">
          <span className="hr-hud__label">SCORE</span>
          <span className="hr-hud__value" ref={hud.score}>0</span>
          <span className="hr-hud__coins">
            <i className="hr-coin-icon" />
            <span ref={hud.coins}>0</span>
          </span>
        </div>
        <div className="hr-hud__block hr-hud__block--center">
          <span className="hr-hud__label">DISTANCE</span>
          <span className="hr-hud__value" ref={hud.dist}>0 M</span>
          {combo > 1 && <span className="hr-hud__combo">COMBO ×{combo}</span>}
        </div>
        <div className="hr-hud__block hr-hud__block--right">
          <span className="hr-hud__label">SPEED</span>
          <span className="hr-hud__value">
            <span ref={hud.speed}>0</span>
            <small> KM/H</small>
          </span>
        </div>
        {live && (
          <button type="button" className="hr-pause-btn" aria-label="Pause" onClick={() => setPause(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        )}
        <div
          className={`hr-boost${boostReady ? " is-ready" : ""}${boosting ? " is-active" : ""}`}
          onPointerDown={touch ? touchPress("boost") : undefined}
          role={touch ? "button" : undefined}
          aria-label="Boost"
        >
          <span className="hr-boost__label">BOOST</span>
          <span className="hr-boost__bar">
            <span className="hr-boost__fill" ref={hud.boost} />
          </span>
          {!touch && <kbd>SPACE</kbd>}
          {touch && boostReady && <span className="hr-boost__tap">TAP</span>}
        </div>
        <div className="hr-pops" aria-live="polite">
          {pops.map((p) => (
            <div key={p.id} className={`hr-pop hr-pop--${p.kind}`}>
              {p.text}
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- touch controls */}
      {touch && live && !paused && (
        <>
          <button type="button" className="hr-touch hr-touch--left" aria-label="Left lane" onPointerDown={touchPress("left")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" className="hr-touch hr-touch--right" aria-label="Right lane" onPointerDown={touchPress("right")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* ---------------- countdown */}
      {phase === "countdown" && !paused && (
        <div className="hr-count" key={count}>
          {count > 0 ? count : "GO!"}
        </div>
      )}
      {phase === "playing" && count === 0 && <div className="hr-count hr-count--go">GO!</div>}

      {help && live && !paused && (
        <div className="hr-help">
          {touch ? (
            <>Tap <b>◀</b> / <b>▶</b> to change lanes · tap <b>BOOST</b> when it's full</>
          ) : (
            <>
              <kbd>A</kbd>
              <kbd>←</kbd> / <kbd>D</kbd>
              <kbd>→</kbd> change lanes · <kbd>SPACE</kbd> boost · <kbd>P</kbd> pause
            </>
          )}
        </div>
      )}

      {/* ---------------- pause */}
      {paused && (
        <div className="hr-overlay hr-overlay--dim">
          <div className="hr-panel hr-panel--pause">
            <div className="hr-panel__title">PAUSED</div>
            <button type="button" className="hr-btn hr-btn--primary hr-btn--wide" onClick={() => setPause(false)}>
              RESUME
            </button>
            <button type="button" className="hr-btn hr-btn--wide" onClick={retry}>
              RESTART RUN
            </button>
            <button type="button" className="hr-btn hr-btn--wide hr-btn--ghost" onClick={() => exit("menu")}>
              MAIN MENU
            </button>
          </div>
        </div>
      )}

      {/* ---------------- result */}
      {phase === "result" && result && (
        <div className="hr-overlay hr-overlay--dim">
          <div className="hr-panel hr-panel--result">
            <div className="hr-result__head">
              <div className="hr-panel__title">RUN OVER</div>
              {(result.records.distance || result.records.score) && <div className="hr-newbest">NEW BEST!</div>}
            </div>
            <div className="hr-result__grid">
              <div className={`hr-stat hr-stat--big${result.records.distance ? " is-record" : ""}`}>
                <span>DISTANCE</span>
                <b>{fmtDist(result.summary.distance)}</b>
              </div>
              <div className={`hr-stat hr-stat--big${result.records.score ? " is-record" : ""}`}>
                <span>SCORE</span>
                <b>{fmtInt(result.summary.score)}</b>
              </div>
              <div className="hr-stat">
                <span>COINS</span>
                <b>+{result.summary.coins}</b>
              </div>
              <div className="hr-stat">
                <span>NEAR MISSES</span>
                <b>{result.summary.nearMisses}</b>
              </div>
              <div className="hr-stat">
                <span>TOP SPEED</span>
                <b>{result.summary.topSpeedKmh} km/h</b>
              </div>
              <div className="hr-stat">
                <span>BEST DISTANCE</span>
                <b>{fmtDist(progressRef.current.bestDistance)}</b>
              </div>
            </div>
            <div className="hr-result__actions">
              <button type="button" className="hr-btn hr-btn--primary hr-btn--big" onClick={retry} autoFocus>
                RETRY
              </button>
              <button type="button" className="hr-btn" onClick={() => exit("garage")}>
                GARAGE
              </button>
              <button type="button" className="hr-btn hr-btn--ghost" onClick={() => exit("menu")}>
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
