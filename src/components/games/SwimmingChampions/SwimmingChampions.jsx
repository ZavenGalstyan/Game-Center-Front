/**
 * Swimming Champions — 3D freestyle racing vs five AI swimmers, for the Game
 * Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the Race (engine.js)
 * and draws it with plain Three.js (scene.js). React only renders menus,
 * overlays and the countdown; the live HUD (timer, place, stamina, rhythm,
 * tracker) is written straight to DOM refs each frame, so racing never
 * re-renders the tree.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current race with the
 * same settings. `muted` silences every sound. Fullscreen just resizes the
 * stage; a ResizeObserver refits the renderer.
 *
 * Settings and best times live in localStorage (`swimming-champions`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./SwimmingChampions.css";
import { Race, DISTANCES, DIFFICULTY, LANES, PLAYER_LANE, TUNE, totalOf, wallDist } from "./engine.js";
import { createWorld } from "./scene.js";
import { audio } from "./audio.js";

const STORE_KEY = "swimming-champions";
const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("swtest");
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];
const PLACE_TITLE = ["", "GOLD!", "SILVER!", "BRONZE!", "4TH PLACE", "5TH PLACE", "6TH PLACE"];
const hex = (n) => "#" + n.toString(16).padStart(6, "0");
const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m ? `${m}:${s.toFixed(2).padStart(5, "0")}` : s.toFixed(2);
};

function loadStore() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    return {
      distance: DISTANCES[d.distance] ? d.distance : 50,
      difficulty: DIFFICULTY[d.difficulty] ? d.difficulty : "medium",
      best: d.best && typeof d.best === "object" ? d.best : {},
    };
  } catch {
    return { distance: 50, difficulty: "medium", best: {} };
  }
}
function saveStore(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — keep it for this session only */
  }
}

const isCoarse = () =>
  PARAMS.has("swtouch") || (typeof window !== "undefined" && window.matchMedia?.("(hover: none) and (pointer: coarse)").matches);

export default function SwimmingChampions({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const raceRef = useRef(null);
  const modeRef = useRef("menu"); // menu | race | finish | results
  const finishT = useRef(0);
  const hud = useRef({});
  const streak = useRef(0);
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = loadStore();

  const [screen, setScreen] = useState("menu"); // menu | how | race | results
  const [distance, setDistance] = useState(storeRef.current.distance);
  const [difficulty, setDifficulty] = useState(storeRef.current.difficulty);
  const [countdown, setCountdown] = useState(null);
  const [intro, setIntro] = useState(false);
  const [finished, setFinished] = useState(null);
  const [results, setResults] = useState(null);
  const [touch, setTouch] = useState(isCoarse);

  const bestKey = `${distance}-${difficulty}`;
  const best = storeRef.current.best[bestKey];

  /* ------------------------------------------------------------ feedback */
  const flash = useCallback((text, kind = "good") => {
    const el = hud.current.feedback;
    if (!el) return;
    el.textContent = text;
    el.className = `swc-feedback is-${kind}`;
    void el.offsetWidth; // restart the CSS animation
    el.classList.add("is-on");
  }, []);

  /* ------------------------------------------------------------ race events */
  const onEvent = useRef(null);
  onEvent.current = (type, d) => {
    const race = raceRef.current;
    const world = worldRef.current;
    if (!race) return;
    switch (type) {
      case "count":
        setIntro(false);
        setCountdown(d.n);
        audio.beep(d.n);
        break;
      case "go":
        setCountdown("GO");
        audio.start();
        audio.crowd(0.6);
        break;
      case "early":
        flash("WAIT FOR GO!", "bad");
        break;
      case "dive":
        flash(d.reaction < 0.3 ? `GREAT START · ${d.reaction.toFixed(2)}s` : `REACTION ${d.reaction.toFixed(2)}s`, d.reaction < 0.3 ? "perfect" : "good");
        break;
      case "entry":
        world?.burst(PLAYER_LANE, 46, 1.5);
        audio.splash(1);
        break;
      case "splash":
        world?.burst(d.lane, 22, 1.1);
        if (race.time < 1.2) audio.splash(0.35);
        break;
      case "stroke":
        audio.stroke(d.q);
        if (hud.current.grade) {
          hud.current.grade.textContent = { perfect: "PERFECT", good: "GOOD", fast: "TOO FAST", slow: "TOO SLOW", same: "SAME ARM!" }[d.grade];
          hud.current.grade.dataset.g = d.grade;
        }
        if (d.grade === "perfect") {
          streak.current += 1;
          if (streak.current % 10 === 0) flash(`RHYTHM ×${streak.current}!`, "perfect");
        } else {
          streak.current = 0;
          if (d.grade === "same") {
            flash("ALTERNATE A / D!", "bad");
            audio.bad();
          } else if (d.grade === "fast") flash("TOO FAST — FIND THE BEAT", "bad");
        }
        break;
      case "flip":
        flash(d.q > 0.85 ? "PERFECT TURN!" : d.q > 0.5 ? "GOOD TURN" : "EARLY TURN", d.q > 0.85 ? "perfect" : d.q > 0.5 ? "good" : "bad");
        audio.turn(d.q);
        break;
      case "turn":
        world?.burst(d.lane, d.player ? 30 : 14, d.player ? 1.2 : 0.9);
        if (d.player && d.kind === "open") audio.splash(0.5);
        break;
      case "missedTurn":
        flash("MISSED TURN! PRESS SPACE NEAR THE WALL", "bad");
        audio.bad();
        break;
      case "finish":
        world?.burst(d.lane, d.player ? 50 : 20, d.player ? 1.6 : 1);
        if (d.player) {
          modeRef.current = "finish";
          finishT.current = 0;
          audio.finish(d.place);
          audio.crowd(1);
          const st = storeRef.current;
          const prev = st.best[`${race.distance}-${race.difficulty}`];
          const isBest = !prev || d.time < prev;
          if (isBest) {
            st.best[`${race.distance}-${race.difficulty}`] = d.time;
            saveStore(st);
          }
          setFinished({ place: d.place, time: d.time, isBest });
        } else audio.splash(0.25);
        break;
      default:
    }
  };

  /* ------------------------------------------------------------ HUD writer */
  const last = useRef({});
  const writeHud = useCallback((race) => {
    const h = hud.current;
    const L = last.current;
    if (!race || !h.time) return;
    const p = race.player;
    const set = (key, el, val) => {
      if (L[key] !== val && el) {
        L[key] = val;
        el.textContent = val;
      }
    };
    set("time", h.time, fmt(p.place ? p.finishTime : race.time));
    const pos = race.positionOf(p);
    set("place", h.place, ORD[pos]);
    set("len", h.len, `${Math.min(p.lengths + 1, race.lengths)}/${race.lengths}`);
    set("dist", h.dist, `${Math.min(race.distance, Math.floor(totalOf(p)))}m`);
    set("speed", h.speed, (p.v * 1).toFixed(1));
    if (h.stam) {
      h.stam.style.transform = `scaleX(${p.stamina.toFixed(3)})`;
      h.stamWrap.dataset.state = p.exhausted ? "empty" : p.boosting ? "boost" : p.stamina < 0.25 ? "low" : "ok";
    }
    if (h.rhythm) h.rhythm.style.transform = `scaleX(${p.rhythm.toFixed(3)})`;
    if (h.beat) {
      const since = race.phase === "race" && p.phase !== "block" ? Math.min(0.9, race.time - p.lastStroke) : 0;
      h.beat.style.left = `${(since / 0.9) * 100}%`;
    }
    if (h.track) {
      for (let i = 0; i < LANES; i++) {
        const s = race.swimmers[i];
        h.track[i].style.left = `${(totalOf(s) / race.distance) * 100}%`;
      }
    }
    const ctx = race.context();
    const label = { dive: "DIVE", turn: "TURN!", boost: "BOOST", wait: "READY", done: "DONE" }[ctx];
    set("ctx", h.ctx, label);
    if (h.ctxBtn) h.ctxBtn.dataset.ctx = ctx;
    if (h.turnHint) {
      const show = ctx === "turn" || (ctx === "dive" && race.time > 0.15);
      h.turnHint.dataset.on = show ? "1" : "0";
      set("hint", h.turnHint, ctx === "dive" ? "PRESS SPACE / A / D TO DIVE" : wallDist(p) > 2.4 ? "WALL AHEAD · GET READY" : "PRESS SPACE — FLIP TURN!");
    }
  }, []);

  /* ------------------------------------------------------------ loop */
  const showResults = useRef(null);
  showResults.current = () => {
    const race = raceRef.current;
    modeRef.current = "results";
    setResults({
      rows: race.standings().map((s) => ({ lane: s.lane, name: s.name, cap: s.cap, time: s.finishTime, player: s.isPlayer, place: s.place })),
      place: race.player.place,
      time: race.player.finishTime,
      distance: race.distance,
      difficulty: race.difficulty,
    });
    setScreen("results");
    audio.crowd(0.35);
  };

  useEffect(() => {
    // a fresh canvas per mount: dispose() force-loses the old context, so a
    // StrictMode/HMR remount must never reuse it
    const canvas = document.createElement("canvas");
    canvas.className = "swc-canvas";
    canvas.setAttribute("aria-hidden", "true");
    rootRef.current.prepend(canvas);
    const world = createWorld(canvas, { preserve: TEST });
    worldRef.current = world;
    const fit = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) world.resize(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rootRef.current);

    let goClear = false;
    const frame = (dt) => {
      dt = Math.min(dt, 0.1);
      const race = raceRef.current;
      if (race) {
        let scale = 1;
        if (modeRef.current === "finish") {
          finishT.current += dt;
          // after the cinematic, hurry the stragglers home for the results
          if (race.phase !== "done" && finishT.current > 2.6) scale = 6;
          if (race.phase === "done" && finishT.current > 3.6) showResults.current();
        }
        let rem = dt * scale;
        while (rem > 1e-6) {
          const step = Math.min(rem, 1 / 30);
          race.update(step);
          rem -= step;
        }
        if (race.phase === "race" && race.time > 0.9 && !goClear) {
          goClear = true;
          setCountdown(null);
        } else if (race.phase !== "race") goClear = false;
      }
      world.render(race, dt, race ? modeRef.current : "menu");
      if (race && modeRef.current === "race") writeHud(race);
    };

    let raf = 0;
    let lastT = 0;
    const loop = (now) => {
      const dt = lastT ? (now - lastT) / 1000 : 0;
      lastT = now;
      frame(dt);
      raf = requestAnimationFrame(loop);
    };
    if (TEST) {
      window.__sw = {
        world,
        race: () => raceRef.current,
        mode: () => modeRef.current,
        fit,
        advance(frames = 1, dt = 1 / 60) {
          for (let i = 0; i < frames; i++) frame(dt);
        },
      };
    } else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      world.dispose();
      canvas.remove();
      worldRef.current = null;
      if (TEST) delete window.__sw;
    };
  }, [writeHud]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ flow */
  const startRace = useCallback(() => {
    audio.unlock();
    audio.ui();
    const st = storeRef.current;
    st.distance = distance;
    st.difficulty = difficulty;
    saveStore(st);
    raceRef.current = new Race({
      distance,
      difficulty,
      seed: TEST ? 1 : (Date.now() % 1e9) | 0,
      onEvent: (t, d) => onEvent.current?.(t, d),
    });
    modeRef.current = "race";
    finishT.current = 0;
    streak.current = 0;
    last.current = {};
    setCountdown(null);
    setFinished(null);
    setResults(null);
    setIntro(true);
    setScreen("race");
    audio.crowd(0.3);
  }, [distance, difficulty]);

  const toMenu = useCallback(() => {
    audio.ui();
    raceRef.current = null;
    modeRef.current = "menu";
    setResults(null);
    setFinished(null);
    setCountdown(null);
    setIntro(false);
    setScreen("menu");
    audio.crowd(0);
  }, []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "race" || screen === "results") startRace();
  }, [restartSignal, screen, startRace]);

  useEffect(() => {
    if (!TEST || !window.__sw) return;
    window.__sw.start = startRace;
    window.__sw.toMenu = toMenu;
    window.__sw.screen = screen;
  });

  /* ------------------------------------------------------------ input */
  const racing = screen === "race";
  useEffect(() => {
    if (!racing) return undefined;
    const down = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const race = raceRef.current;
      if (!race) return;
      const k = e.code;
      if (k === "KeyA" || k === "ArrowLeft" || k === "KeyD" || k === "ArrowRight" || k === "Space") e.preventDefault();
      if (e.repeat) return;
      audio.unlock();
      if (race.phase === "intro" && (k === "Space" || k === "Enter")) return race.skipIntro();
      if (k === "KeyA" || k === "ArrowLeft") race.stroke(-1);
      else if (k === "KeyD" || k === "ArrowRight") race.stroke(1);
      else if (k === "Space") {
        race.action();
        race.setBoost(true);
      }
    };
    const up = (e) => {
      if (e.code === "Space") raceRef.current?.setBoost(false);
    };
    const blur = () => raceRef.current?.setBoost(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      raceRef.current?.setBoost(false);
    };
  }, [racing]);

  const touchStroke = (side) => (e) => {
    e.preventDefault();
    audio.unlock();
    const race = raceRef.current;
    if (race?.phase === "intro") return race.skipIntro();
    race?.stroke(side);
  };
  const touchAction = (e) => {
    e.preventDefault();
    audio.unlock();
    const race = raceRef.current;
    if (race?.phase === "intro") return race.skipIntro();
    race?.action();
    race?.setBoost(true);
  };
  const touchRelease = () => raceRef.current?.setBoost(false);

  const onRootPointer = (e) => {
    if (e.pointerType === "touch" && !touch) setTouch(true);
    if (racing && raceRef.current?.phase === "intro" && !e.target.closest("button")) raceRef.current.skipIntro();
  };

  const pick = (fn) => (v) => {
    audio.unlock();
    audio.ui();
    fn(v);
  };

  /* ------------------------------------------------------------ view */
  const H = (key) => (el) => {
    hud.current[key] = el;
  };
  const trackRef = (i) => (el) => {
    if (!hud.current.track) hud.current.track = [];
    hud.current.track[i] = el;
  };
  const RIV = raceRef.current?.swimmers;

  return (
    <div
      ref={rootRef}
      className={`swc${racing ? " swc--race" : ""}${touch ? " swc--touch" : ""}`}
      onPointerDown={onRootPointer}
      onContextMenu={(e) => e.preventDefault()}
    >
      {racing && !finished && (
        <div className="swc-hud">
          <div className="swc-hud__top">
            <div className="swc-chip swc-chip--time">
              <span>TIME</span>
              <strong ref={H("time")}>0.00</strong>
            </div>
            <div className="swc-chip swc-chip--place">
              <span>POS</span>
              <strong ref={H("place")}>—</strong>
            </div>
            <div className="swc-chip">
              <span>LENGTH</span>
              <strong ref={H("len")}>1/1</strong>
            </div>
            <div className="swc-chip swc-chip--hide-sm">
              <span>DIST</span>
              <strong ref={H("dist")}>0m</strong>
            </div>
          </div>

          <div className="swc-track" aria-hidden="true">
            {(RIV || []).map((s, i) => (
              <div key={s.lane} className={`swc-track__lane${s.isPlayer ? " is-you" : ""}`}>
                <i ref={trackRef(i)} style={{ background: hex(s.cap) }} />
              </div>
            ))}
          </div>

          <div className="swc-meters">
            <div className="swc-meter">
              <div className="swc-meter__label">
                RHYTHM <b ref={H("grade")} data-g="">—</b>
              </div>
              <div className="swc-beat">
                <div className="swc-beat__zone" style={{ left: `${((TUNE.idealGap - 0.08) / 0.9) * 100}%`, width: `${(0.18 / 0.9) * 100}%` }} />
                <div className="swc-beat__cursor" ref={H("beat")} />
              </div>
              <div className="swc-bar">
                <i ref={H("rhythm")} className="swc-bar__fill swc-bar__fill--rhythm" />
              </div>
            </div>
            <div className="swc-meter" ref={H("stamWrap")} data-state="ok">
              <div className="swc-meter__label">
                STAMINA <b>
                  <span ref={H("speed")}>0.0</span> m/s
                </b>
              </div>
              <div className="swc-bar swc-bar--tall">
                <i ref={H("stam")} className="swc-bar__fill swc-bar__fill--stam" />
              </div>
            </div>
          </div>

          <div className="swc-hint" ref={H("turnHint")} data-on="0" />
          <div className="swc-feedback" ref={H("feedback")} />
          {!touch && <div className="swc-keys">A / D alternate · hold SPACE boost · SPACE at wall turn</div>}
        </div>
      )}

      {racing && intro && (
        <div className="swc-intro">
          <p className="swc-kicker">{DIFFICULTY[difficulty].label.toUpperCase()} · LANE {PLAYER_LANE + 1}</p>
          <h2>{DISTANCES[distance].label.toUpperCase()}</h2>
          <span>{touch ? "Tap to skip" : "Space to skip"}</span>
        </div>
      )}

      {racing && countdown !== null && (
        <div key={String(countdown)} className={`swc-count${countdown === "GO" ? " is-go" : ""}`}>
          {countdown}
        </div>
      )}

      {racing && finished && (
        <div className={`swc-finish place-${finished.place}`}>
          <strong>{PLACE_TITLE[finished.place]}</strong>
          <span>
            {ORD[finished.place]} · {fmt(finished.time)}s{finished.isBest ? " · NEW BEST" : ""}
          </span>
        </div>
      )}

      {racing && touch && !finished && (
        <div className="swc-pad">
          <button type="button" className="swc-pad__stroke" onPointerDown={touchStroke(-1)} aria-label="Left stroke">
            <b>L</b>
            <span>STROKE</span>
          </button>
          <button
            type="button"
            className="swc-pad__ctx"
            ref={H("ctxBtn")}
            data-ctx="wait"
            onPointerDown={touchAction}
            onPointerUp={touchRelease}
            onPointerCancel={touchRelease}
            onPointerLeave={touchRelease}
          >
            <span ref={H("ctx")}>READY</span>
          </button>
          <button type="button" className="swc-pad__stroke" onPointerDown={touchStroke(1)} aria-label="Right stroke">
            <b>R</b>
            <span>STROKE</span>
          </button>
        </div>
      )}

      {screen === "menu" && (
        <div className="swc-veil">
          <div className="swc-panel swc-menu">
            <p className="swc-kicker">DIVE • SWIM • WIN</p>
            <h1 className="swc-title">
              SWIMMING <em>CHAMPIONS</em>
            </h1>
            <div className="swc-label">DISTANCE</div>
            <div className="swc-seg" role="radiogroup" aria-label="Distance">
              {Object.entries(DISTANCES).map(([id, d]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={distance === +id}
                  className={`swc-seg__btn${distance === +id ? " is-on" : ""}`}
                  onClick={() => pick(setDistance)(+id)}
                >
                  <b>{d.short}</b>
                  <span>{d.lengths === 1 ? "1 length" : `${d.lengths} lengths`}</span>
                </button>
              ))}
            </div>
            <div className="swc-label">DIFFICULTY</div>
            <div className="swc-seg" role="radiogroup" aria-label="Difficulty">
              {Object.entries(DIFFICULTY).map(([id, d]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === id}
                  className={`swc-seg__btn swc-seg__btn--${id}${difficulty === id ? " is-on" : ""}`}
                  onClick={() => pick(setDifficulty)(id)}
                >
                  <b>{d.label}</b>
                </button>
              ))}
            </div>
            <p className="swc-best">{best ? `Best: ${fmt(best)}s` : "No best time yet"}</p>
            <button type="button" className="swc-btn swc-btn--primary" onClick={startRace}>
              PLAY
            </button>
            <button type="button" className="swc-btn swc-btn--ghost" onClick={() => pick(setScreen)("how")}>
              HOW TO PLAY
            </button>
          </div>
        </div>
      )}

      {screen === "how" && (
        <div className="swc-veil">
          <div className="swc-panel swc-how">
            <h2>HOW TO PLAY</h2>
            <ul>
              <li><b>Dive</b> on GO — press <kbd>Space</kbd>, <kbd>A</kbd> or <kbd>D</kbd> fast for a strong start.</li>
              <li><b>Swim</b> by alternating <kbd>A</kbd> and <kbd>D</kbd> (or ← →). Press when the cursor hits the green beat zone.</li>
              <li><b>Rhythm</b> is speed: steady alternating strokes are fastest. Mashing or repeating one arm slows you down.</li>
              <li><b>Boost</b> — hold <kbd>Space</kbd> for a kick burst. It drains stamina; an empty tank must refill before boosting again.</li>
              <li><b>Turn</b> — in 100m and 200m press <kbd>Space</kbd> about 1–2 m before the wall for a flip turn. Miss it and you'll do a slow open turn.</li>
              <li><b>Mobile</b> — tap L and R alternately; the middle button dives, turns and boosts.</li>
            </ul>
            <button type="button" className="swc-btn swc-btn--primary" onClick={() => pick(setScreen)("menu")}>
              GOT IT
            </button>
          </div>
        </div>
      )}

      {screen === "results" && results && (
        <div className="swc-veil swc-veil--results">
          <div className={`swc-panel swc-results place-${results.place}`}>
            {results.place <= 3 && (
              <div className="swc-confetti" aria-hidden="true">
                {Array.from({ length: 18 }, (_, i) => (
                  <i key={i} style={{ "--i": i }} />
                ))}
              </div>
            )}
            <p className="swc-kicker">
              {DISTANCES[results.distance].label.toUpperCase()} · {DIFFICULTY[results.difficulty].label.toUpperCase()}
            </p>
            <h2 className="swc-results__title">{PLACE_TITLE[results.place]}</h2>
            <p className="swc-results__time">
              {fmt(results.time)}s{finished?.isBest ? <em> NEW BEST</em> : null}
            </p>
            <ol className="swc-board">
              {results.rows.map((r) => (
                <li key={r.lane} className={r.player ? "is-you" : ""}>
                  <span className="swc-board__pos">{r.place}</span>
                  <i style={{ background: hex(r.cap) }} />
                  <span className="swc-board__name">
                    {r.name}
                    <small>Lane {r.lane + 1}</small>
                  </span>
                  <span className="swc-board__time">{fmt(r.time)}</span>
                  <span className="swc-board__gap">{r.place === 1 ? "" : `+${(r.time - results.rows[0].time).toFixed(2)}`}</span>
                </li>
              ))}
            </ol>
            <div className="swc-row">
              <button type="button" className="swc-btn swc-btn--primary" onClick={startRace}>
                PLAY AGAIN
              </button>
              <button type="button" className="swc-btn swc-btn--ghost" onClick={toMenu}>
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
