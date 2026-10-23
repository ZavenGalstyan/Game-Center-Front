/**
 * Neon Circuit — a Lights Out logic puzzle: tapping a node flips it and its
 * orthogonal neighbours; clear the board to win. Rendered inside the shared
 * <GamePlayer> (registered by name in ../registry.js); Restart / Mute /
 * Fullscreen / Like stay there.
 *
 * `restartSignal` (GamePlayer Restart) restarts the current level (Classic) or
 * the whole run (Time Challenge); `muted` silences the synth blips. Rules and
 * the GF(2) solver live in ./engine.js, session logic in ./game.js, and the 100
 * levels in ./levels.js (generated + validated by ./tools). Progress and
 * settings are saved under `neon-circuit-progress`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as E from "./engine.js";
import * as G from "./game.js";
import { LEVELS } from "./levels.js";
import { createAudio } from "./audio.js";
import "./NeonCircuit.css";

const { TIERS, CHALLENGES } = G;
const tierName = (id) => TIERS.find((t) => t.id === id).name;
const load = () => {
  try {
    return G.normalize(JSON.parse(localStorage.getItem(G.SAVE_KEY)));
  } catch {
    return G.normalize(null);
  }
};
const persist = (p) => {
  try {
    localStorage.setItem(G.SAVE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
};
const now = () => performance.now();

export default function NeonCircuit({ restartSignal = 0, muted = false }) {
  const [prog, setProg] = useState(load);
  const [screen, setScreen] = useState("menu"); // menu | levels | challenges | game
  const [tab, setTab] = useState(() => LEVELS[G.nextUnsolved(prog)][3]);
  const [overlay, setOverlay] = useState(null); // pause | win | timeup | rules | rulesP
  const [play, setPlay] = useState(null); // { mode: "classic", lvl } | { mode: "challenge", tier, run, idx }
  const [board, setBoard] = useState(0);
  const [hist, setHist] = useState([]); // pressed cells, for Undo
  const [hint, setHint] = useState(null); // { i, left }
  const [hintsUsed, setHintsUsed] = useState(0);
  const [won, setWon] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [kbd, setKbd] = useState(false);
  const [aim, setAim] = useState(-1);
  const [pulse, setPulse] = useState(null); // { i, id } → ripple on the pressed node
  const [banner, setBanner] = useState(null); // { text, id }
  const [penalty, setPenalty] = useState(0); // id of the last "-10s" flash
  const [, setTick] = useState(0);
  const clock = useRef(G.createClock());
  const winTimer = useRef(0);
  const tiles = useRef([]);

  const audio = useMemo(() => createAudio(), []);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => audio.setMuted(muted), [audio, muted]);

  const puz = !play ? null : play.mode === "classic" ? G.levelPuzzle(play.lvl) : play.run[play.idx];
  const n = puz?.n ?? 5;
  const solved = !!puz && board === 0;
  const live = screen === "game" && !!puz && !overlay && !solved;
  const challenge = play?.mode === "challenge" ? play : null;

  const saveProg = useCallback((next) => {
    setProg(next);
    persist(next);
  }, []);

  /* ---------- level flow ---------- */
  useEffect(() => () => clearTimeout(winTimer.current), []);
  useEffect(() => {
    if (screen !== "game") clearTimeout(winTimer.current);
  }, [screen]);
  const loadBoard = (pz) => {
    setBoard(pz.board);
    setHist([]);
    setHint(null);
    setPulse(null);
    setAim(-1);
    setCursor((pz.n * pz.n) >> 1);
  };
  const begin = (p, pz) => {
    clearTimeout(winTimer.current);
    clock.current.reset(now());
    setPlay(p);
    loadBoard(pz);
    setHintsUsed(0);
    setWon(null);
    setOverlay(null);
    setScreen("game");
  };
  const startLevel = (lvl) => {
    begin({ mode: "classic", lvl }, G.levelPuzzle(lvl));
    setTab(LEVELS[lvl][3]);
    setBanner(null);
  };
  const startChallenge = (tier) => {
    const run = G.makeRun(tier);
    begin({ mode: "challenge", tier, run, idx: 0 }, run[0]);
    setBanner({ text: `Circuit 1 / ${run.length}`, id: Date.now() });
  };
  /** Restart Level: Classic starts the level over (moves + time); in a Time
   *  Challenge only the current board resets — the clock keeps running. */
  const restartLevel = () => {
    if (!puz) return;
    if (challenge) {
      if (solved) return;
      loadBoard(puz);
      setOverlay(null);
    } else startLevel(play.lvl);
    audio.play("reset");
  };

  // GamePlayer Restart → restart the level / the challenge run
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen !== "game" || !play) return;
    if (play.mode === "classic") startLevel(play.lvl);
    else startChallenge(play.tier);
  }, [restartSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- clock ---------- */
  useEffect(() => {
    if (live) clock.current.start(now());
    else clock.current.stop(now());
  }, [live]);
  const tickRef = useRef(null);
  tickRef.current = () => {
    setTick((t) => t + 1);
    if (!challenge) return;
    const left = G.timeLeft(challenge.tier, clock.current.elapsed(now()));
    if (left <= 0) {
      clock.current.stop(now());
      setOverlay("timeup");
      audio.play("lose");
    } else if (left < 10000 && Math.ceil(left / 1000) !== tickRef.sec) {
      tickRef.sec = Math.ceil(left / 1000);
      audio.play("tick");
    }
  };
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => tickRef.current(), 200);
    return () => clearInterval(id);
  }, [live]);
  const liveRef = useRef(live);
  liveRef.current = live;
  // leaving the tab pauses the game (the timer must not run in the background)
  useEffect(() => {
    const onVis = () => document.hidden && liveRef.current && setOverlay("pause");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* ---------- moves ---------- */
  const solvedWith = (moves) => {
    const t = now();
    clock.current.stop(t);
    const ms = clock.current.elapsed(t);
    if (challenge && challenge.idx < challenge.run.length - 1) {
      audio.play("clear");
      const next = challenge.idx + 1;
      winTimer.current = setTimeout(() => {
        setPlay((p) => ({ ...p, idx: next }));
        loadBoard(challenge.run[next]);
        setBanner({ text: `Circuit ${next + 1} / ${challenge.run.length}`, id: Date.now() });
      }, 900);
      return;
    }
    const { prog: np, result } = challenge ? G.recordChallenge(prog, challenge.tier, ms) : G.recordLevel(prog, play.lvl, moves, ms);
    saveProg(np);
    winTimer.current = setTimeout(() => {
      audio.play("win");
      setWon({ ...result, hintsUsed });
      setOverlay("win");
    }, 950);
  };
  const tap = (i) => {
    if (!live) return;
    const next = E.press(n, board, i);
    setBoard(next);
    setHist((h) => [...h, i]);
    setHint(null);
    setCursor(i);
    setPulse({ i, id: Math.random() });
    audio.play("toggle", E.lit(next) / (n * n));
    if (next === 0) solvedWith(hist.length + 1);
  };
  const undo = () => {
    if (!live || !hist.length) return;
    const i = hist[hist.length - 1];
    setBoard(E.press(n, board, i));
    setHist((h) => h.slice(0, -1));
    setHint(null);
    setPulse({ i, id: Math.random() });
    audio.play("undo");
  };
  const doHint = () => {
    if (!live) return;
    const i = E.hint(n, board, cursor);
    if (i < 0) return;
    setHint({ i, left: E.minMoves(n, board) });
    setHintsUsed((k) => k + 1);
    if (challenge) {
      clock.current.add(G.HINT_PENALTY);
      setPenalty(Math.random());
    }
    audio.play("hint");
  };

  /* ---------- keyboard ---------- */
  const keys = useRef(null);
  keys.current = (e) => {
    if (screen !== "game") return false;
    const k = e.key.toLowerCase();
    if (k === "escape" || k === "p") {
      if (overlay === "pause") setOverlay(null);
      else if (live) setOverlay("pause");
      return overlay === "pause" || live;
    }
    if (!live) return false;
    if (k === "u" || (k === "z" && (e.ctrlKey || e.metaKey))) return undo(), true;
    if (k === "r" && !e.ctrlKey && !e.metaKey) return restartLevel(), true;
    if (k === "h") return doHint(), true;
    const d = { arrowleft: [0, -1], arrowright: [0, 1], arrowup: [-1, 0], arrowdown: [1, 0] }[k];
    if (d) {
      const r = Math.max(0, Math.min(n - 1, ((cursor / n) | 0) + d[0])), c = Math.max(0, Math.min(n - 1, (cursor % n) + d[1]));
      setCursor(r * n + c);
      setKbd(true);
      return true;
    }
    if ((k === " " || k === "enter") && !e.target.closest?.("button")) return tap(cursor), setKbd(true), true;
    return false;
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, select, textarea") || e.altKey) return;
      if (keys.current(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (kbd && live) tiles.current[cursor]?.focus({ preventScroll: true });
  }, [kbd, live, cursor]);

  // DEV test hook (?nctest=1)
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has("nctest")) return;
    window.__nc = { E, G, LEVELS, startLevel, startChallenge, tap, undo, hint: doHint, restartLevel, setOverlay, setScreen, clock: clock.current, state: () => ({ screen, overlay, play, board, hist, hint, hintsUsed, won, prog, cursor, n, live }) };
  });

  /* ---------- render ---------- */
  const totalStars = Object.values(prog.stars).reduce((a, b) => a + b, 0);
  const solvedCount = Object.keys(prog.stars).length;
  const next = G.nextUnsolved(prog);
  const elapsed = clock.current.elapsed(now());
  const left = challenge ? G.timeLeft(challenge.tier, elapsed) : 0;
  const aimCell = kbd ? cursor : aim;
  const aimMask = prog.preview && live && aimCell >= 0 ? E.masks(n)[aimCell] : 0;
  const lights = E.lit(board);
  const back = () => setScreen(challenge ? "challenges" : "levels");

  return (
    <div className={`nc${prog.fx ? "" : " nc--calm"}`} onPointerDown={() => setKbd(false)}>
      <div className="nc-bg" />
      {prog.fx && <Particles />}

      {screen === "menu" && (
        <div className="nc-screen nc-menu">
          <MiniBoard />
          <h1 className="nc-logo">
            <span>NEON</span>
            <em>CIRCUIT</em>
          </h1>
          <p className="nc-tagline">TAP • TOGGLE • SOLVE</p>
          <div className="nc-menu__btns">
            <button type="button" className="nc-btn nc-btn--big" onClick={() => (audio.play("tap"), startLevel(next))}>
              {solvedCount ? `Continue · Level ${next + 1}` : "Play Classic"}
            </button>
            <div className="nc-row">
              <button type="button" className="nc-btn nc-btn--ghost" onClick={() => (audio.play("tap"), setScreen("levels"))}>Levels</button>
              <button type="button" className="nc-btn nc-btn--ghost nc-btn--time" onClick={() => (audio.play("tap"), setScreen("challenges"))}>Time Challenge</button>
            </div>
            <button type="button" className="nc-btn nc-btn--link" onClick={() => setOverlay("rules")}>How to play</button>
          </div>
          <p className="nc-menu__stats">
            <span>★ {totalStars} / {LEVELS.length * 3}</span>
            <span>{solvedCount} / {LEVELS.length} solved</span>
          </p>
          <div className="nc-settings">
            <Toggle on={prog.preview} label="Tap preview" onChange={(v) => saveProg({ ...prog, preview: v })} />
            <Toggle on={prog.fx} label="Particles" onChange={(v) => saveProg({ ...prog, fx: v })} />
          </div>
        </div>
      )}

      {screen === "levels" && (
        <div className="nc-screen nc-levels">
          <div className="nc-head">
            <button type="button" className="nc-icon" onClick={() => setScreen("menu")} aria-label="Back">‹</button>
            <h2 className="nc-h">Select Level</h2>
            <span className="nc-pill">★ {totalStars}</span>
          </div>
          <div className="nc-tabs" role="tablist">
            {TIERS.map((t) => {
              const ids = LEVELS.map((l, i) => (l[3] === t.id ? i : -1)).filter((i) => i >= 0);
              const done = ids.filter((i) => prog.stars[i]).length;
              return (
                <button type="button" role="tab" key={t.id} aria-selected={tab === t.id} className={`nc-tab nc-t--${t.id}${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
                  {t.name}
                  <small>{done}/{ids.length}</small>
                  <span className="nc-tab__bar" style={{ "--p": done / ids.length }} />
                </button>
              );
            })}
          </div>
          <div className="nc-grid">
            {LEVELS.map((l, i) => {
              if (l[3] !== tab) return null;
              const locked = i > prog.unlocked;
              return (
                <button type="button" key={i} className={`nc-lv${locked ? " is-locked" : ""}${i === next ? " is-next" : ""}${prog.stars[i] ? " is-done" : ""}`} disabled={locked} onClick={() => startLevel(i)} aria-label={`Level ${i + 1}, ${l[0]} by ${l[0]}${locked ? ", locked" : prog.stars[i] ? `, ${prog.stars[i]} stars` : ""}`}>
                  {locked ? <LockIcon /> : <b>{i + 1}</b>}
                  <small>{l[0]}×{l[0]}</small>
                  <span className="nc-lv__stars" aria-hidden="true">{[1, 2, 3].map((s) => <i key={s} className={(prog.stars[i] ?? 0) >= s ? "on" : ""}>★</i>)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {screen === "challenges" && (
        <div className="nc-screen nc-levels">
          <div className="nc-head">
            <button type="button" className="nc-icon" onClick={() => setScreen("menu")} aria-label="Back">‹</button>
            <h2 className="nc-h">Time Challenge</h2>
            <span className="nc-pill nc-pill--time">⏱</span>
          </div>
          <p className="nc-sub">Clear every circuit before the clock hits zero. Hints cost {G.HINT_PENALTY / 1000} seconds.</p>
          <div className="nc-cards">
            {TIERS.map((t) => {
              const c = CHALLENGES[t.id], rec = prog.ch[t.id];
              const sizes = [...new Set(c.specs.map((s) => `${s[0]}×${s[0]}`))].join(" · ");
              return (
                <button type="button" key={t.id} className={`nc-card nc-t--${t.id}`} onClick={() => (audio.play("tap"), startChallenge(t.id))}>
                  <small className="nc-chip">{t.name}</small>
                  <strong>{c.name}</strong>
                  <span>{c.specs.length} circuits · {G.fmt(c.time * 1000)}</span>
                  <span className="nc-card__dim">{sizes}</span>
                  <span className="nc-lv__stars" aria-label={`${rec?.stars ?? 0} stars`}>{[1, 2, 3].map((s) => <i key={s} className={(rec?.stars ?? 0) >= s ? "on" : ""}>★</i>)}</span>
                  <span className="nc-card__dim">{rec ? `Best ${G.fmtExact(rec.ms)}` : "Not cleared yet"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {screen === "game" && puz && (
        <div className="nc-game">
          <aside className="nc-hud">
            <div className="nc-head">
              <button type="button" className="nc-icon" onClick={back} aria-label={challenge ? "Challenges" : "Levels"} title={challenge ? "Challenges" : "Levels"}>‹</button>
              <div className="nc-hud__title">
                <small className={`nc-chip nc-t--${challenge ? challenge.tier : puz.tier}`}>{challenge ? `${CHALLENGES[challenge.tier].name} · Timed` : tierName(puz.tier)}</small>
                <strong>{challenge ? `Circuit ${challenge.idx + 1}/${challenge.run.length}` : `Level ${play.lvl + 1}`}</strong>
              </div>
              <button type="button" className="nc-icon" onClick={() => live && setOverlay("pause")} aria-label="Pause" title="Pause (P)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              </button>
            </div>
            <div className="nc-stats">
              <div><small>Moves</small><b key={hist.length} className="nc-bump">{hist.length}</b></div>
              <div><small>Optimal</small><b>{puz.opt}</b></div>
              <div className={challenge && left < 10000 ? "is-warn" : ""}>
                <small>{challenge ? "Time left" : "Time"}</small>
                <b>{G.fmt(challenge ? left : elapsed)}</b>
                {penalty !== 0 && <em key={penalty} className="nc-penalty">−{G.HINT_PENALTY / 1000}s</em>}
              </div>
              <div><small>{challenge ? "Lights" : "Best"}</small><b>{challenge ? lights : prog.best[play.lvl] ?? "–"}</b></div>
            </div>
            {challenge ? (
              <>
                <div className="nc-timebar" style={{ "--p": left / (CHALLENGES[challenge.tier].time * 1000) }} />
                <div className="nc-pips" aria-label={`${challenge.idx} of ${challenge.run.length} circuits cleared`}>
                  {challenge.run.map((_, k) => <i key={k} className={k < challenge.idx || (k === challenge.idx && solved) ? "on" : k === challenge.idx ? "cur" : ""} />)}
                </div>
              </>
            ) : (
              <div className="nc-stars-live" aria-label="Stars at this pace">
                {[1, 2, 3].map((s) => <i key={s} className={E.stars(Math.max(hist.length, puz.opt), puz.opt) >= s ? "on" : ""}>★</i>)}
                <small>{puz.n}×{puz.n} · {lights} lit</small>
              </div>
            )}
            <div className="nc-actions">
              <button type="button" className="nc-act" onClick={undo} disabled={!live || !hist.length} title="Undo (U)"><UndoIcon />Undo</button>
              <button type="button" className="nc-act" onClick={restartLevel} disabled={!live || !hist.length} title="Restart level (R)"><ResetIcon />Restart</button>
              <button type="button" className="nc-act nc-act--hint" onClick={doHint} disabled={!live} title="Hint (H)"><BulbIcon />Hint</button>
            </div>
            <p className="nc-hint-text" aria-live="polite">
              {solved ? "Circuit cleared!" : hint ? `Tap the pulsing node · ${hint.left} optimal move${hint.left > 1 ? "s" : ""} left` : "Tap a node: it flips itself and the four around it. Turn every light off."}
            </p>
          </aside>

          <div className="nc-boardwrap">
            {banner && <div key={banner.id} className="nc-banner" onAnimationEnd={() => setBanner(null)}>{banner.text}</div>}
            <div className={`nc-board${solved ? " is-solved" : ""}`} style={{ "--n": n }} role="group" aria-label={`${n} by ${n} circuit, ${lights} lights on`}>
              {Array.from({ length: n * n }, (_, i) => {
                const on = E.isOn(board, i), r = (i / n) | 0, c = i % n;
                return (
                  <button
                    type="button"
                    key={`${play.mode}${play.lvl ?? play.idx}-${i}`}
                    ref={(el) => (tiles.current[i] = el)}
                    className={`nc-tile${on ? " is-on" : ""}${E.isOn(aimMask, i) ? (i === aimCell ? " is-aim is-aim0" : " is-aim") : ""}${hint?.i === i ? " is-hint" : ""}${kbd && cursor === i ? " is-cursor" : ""}`}
                    style={{ "--h": 180 + ((r + c) / Math.max(1, 2 * n - 2)) * 130, "--k": r + c }}
                    tabIndex={cursor === i ? 0 : -1}
                    aria-pressed={on}
                    aria-label={`Row ${r + 1}, column ${c + 1}, ${on ? "on" : "off"}`}
                    onClick={() => tap(i)}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setAim(i)}
                    onPointerLeave={() => setAim((a) => (a === i ? -1 : a))}
                  >
                    <span className="nc-tile__core" />
                    {pulse?.i === i && <i key={pulse.id} className="nc-ripple" />}
                  </button>
                );
              })}
            </div>
            {solved && prog.fx && <Sparks key={`${play.lvl}-${challenge?.idx}`} />}
          </div>
        </div>
      )}

      {overlay === "pause" && (
        <div className="nc-screen nc-screen--dim">
          <div className="nc-panel nc-panel--small">
            <h2 className="nc-h">Paused</h2>
            <p className="nc-sub">{challenge ? `${CHALLENGES[challenge.tier].name} · ${G.fmt(left)} left` : `Level ${play.lvl + 1} · ${hist.length} moves · ${G.fmt(elapsed)}`}</p>
            <button type="button" className="nc-btn" onClick={() => setOverlay(null)}>Resume</button>
            <button type="button" className="nc-btn nc-btn--ghost" onClick={restartLevel}>Restart Level</button>
            {challenge && <button type="button" className="nc-btn nc-btn--ghost" onClick={() => startChallenge(challenge.tier)}>New Run</button>}
            <button type="button" className="nc-btn nc-btn--ghost" onClick={() => setOverlay("rulesP")}>How to play</button>
            <button type="button" className="nc-btn nc-btn--ghost" onClick={() => (setOverlay(null), back())}>{challenge ? "Challenges" : "Level Select"}</button>
            <button type="button" className="nc-btn nc-btn--ghost" onClick={() => (setOverlay(null), setScreen("menu"))}>Main Menu</button>
          </div>
        </div>
      )}

      {overlay === "win" && won && (
        <div className="nc-screen nc-screen--dim">
          <div className="nc-panel nc-win">
            <p className="nc-kicker">{challenge ? `Time Challenge · ${CHALLENGES[challenge.tier].name}` : `${tierName(puz.tier)} · Level ${play.lvl + 1}`}</p>
            <h2 className="nc-h nc-h--glow">{challenge ? "Challenge Complete!" : won.stars === 3 ? "Perfect Circuit!" : "Circuit Cleared!"}</h2>
            <div className="nc-win__stars">
              {[1, 2, 3].map((s) => (
                <i key={s} className={won.stars >= s ? "on" : ""} style={{ animationDelay: `${0.15 + s * 0.18}s` }} onAnimationStart={() => won.stars >= s && audio.play("star")}>★</i>
              ))}
            </div>
            {challenge ? (
              <div className="nc-stats nc-stats--win">
                <div><small>Time</small><b>{G.fmtExact(won.ms)}</b></div>
                <div><small>Left</small><b>{G.fmt(won.left)}</b></div>
                <div><small>Best</small><b>{G.fmtExact(won.best)}</b></div>
              </div>
            ) : (
              <div className="nc-stats nc-stats--win">
                <div><small>Moves</small><b>{won.moves}</b></div>
                <div><small>Optimal</small><b>{won.opt}</b></div>
                <div><small>Time</small><b>{G.fmtExact(won.ms)}</b></div>
              </div>
            )}
            <p className="nc-sub">
              {challenge
                ? `${won.newTime ? "New best time! " : ""}Finish with half the clock left for ★★★.`
                : `${won.stars === 3 ? "Solved in the optimal number of moves." : `Solve it in ${won.opt} moves for ★★★.`} Best: ${won.best} moves · ${G.fmtExact(won.bestTime)}${won.newBest || won.newTime ? " (new record)" : ""}.`}
              {won.hintsUsed ? ` ${won.hintsUsed} hint${won.hintsUsed > 1 ? "s" : ""} used.` : ""}
            </p>
            <div className="nc-row">
              {challenge ? (
                <button type="button" className="nc-btn" onClick={() => startChallenge(challenge.tier)}>Play Again</button>
              ) : (
                !won.last && <button type="button" className="nc-btn" onClick={() => startLevel(play.lvl + 1)}>Next Level</button>
              )}
              {!challenge && <button type="button" className="nc-btn nc-btn--ghost" onClick={() => startLevel(play.lvl)}>Replay</button>}
              <button type="button" className="nc-btn nc-btn--ghost" onClick={() => (setOverlay(null), back())}>{challenge ? "Challenges" : "Levels"}</button>
            </div>
            {won.last && !challenge && <p className="nc-sub">You powered down all {LEVELS.length} circuits!</p>}
          </div>
        </div>
      )}

      {overlay === "timeup" && challenge && (
        <div className="nc-screen nc-screen--dim">
          <div className="nc-panel nc-panel--small nc-timeup">
            <p className="nc-kicker">Time Challenge · {CHALLENGES[challenge.tier].name}</p>
            <h2 className="nc-h nc-h--warn">Time's Up!</h2>
            <p className="nc-sub">You cleared {challenge.idx} of {challenge.run.length} circuits{lights ? ` — ${lights} light${lights > 1 ? "s" : ""} still on` : ""}.</p>
            <button type="button" className="nc-btn" onClick={() => startChallenge(challenge.tier)}>Try Again</button>
            <button type="button" className="nc-btn nc-btn--ghost" onClick={() => (setOverlay(null), setScreen("challenges"))}>Challenges</button>
            <button type="button" className="nc-btn nc-btn--ghost" onClick={() => (setOverlay(null), setScreen("menu"))}>Main Menu</button>
          </div>
        </div>
      )}

      {overlay?.startsWith("rules") && <Rules onClose={() => setOverlay(overlay === "rulesP" ? "pause" : null)} />}
    </div>
  );
}

function Toggle({ on, label, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`nc-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
      <span className="nc-switch__knob" />
      {label}
    </button>
  );
}

// deterministic drifting motes behind every screen
const MOTES = Array.from({ length: 16 }, (_, k) => ({ x: (k * 37 + 11) % 100, s: 0.5 + ((k * 7) % 5) * 0.25, d: 9 + ((k * 13) % 9), t: -((k * 29) % 17), h: k % 3 }));
function Particles() {
  return (
    <div className="nc-motes" aria-hidden="true">
      {MOTES.map((m, k) => <i key={k} className={`h${m.h}`} style={{ left: `${m.x}%`, "--s": m.s, animationDuration: `${m.d}s`, animationDelay: `${m.t}s` }} />)}
    </div>
  );
}
function Sparks() {
  return (
    <div className="nc-sparks" aria-hidden="true">
      {Array.from({ length: 24 }, (_, k) => <i key={k} style={{ "--a": `${k * 15 + (k % 2) * 7}deg`, "--d": 0.7 + (k % 4) * 0.18, "--h": 180 + ((k * 23) % 130), animationDelay: `${(k % 3) * 0.05}s` }} />)}
    </div>
  );
}

const DEMO = [0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0];
function MiniBoard() {
  return (
    <div className="nc-board nc-board--mini" style={{ "--n": 5 }} aria-hidden="true">
      {DEMO.map((on, i) => (
        <span key={i} className={`nc-tile${on ? " is-on" : ""}`} style={{ "--h": 180 + (((i / 5) | 0) + (i % 5)) * 16, "--k": ((i / 5) | 0) + (i % 5) }}>
          <span className="nc-tile__core" />
        </span>
      ))}
    </div>
  );
}

function Rules({ onClose }) {
  return (
    <div className="nc-screen nc-screen--dim">
      <div className="nc-panel nc-rules">
        <h2 className="nc-h">How to play</h2>
        <div className="nc-rules__body">
          <div className="nc-rules__demo" aria-hidden="true">
            <div className="nc-board nc-board--mini" style={{ "--n": 3 }}>
              {[0, 1, 0, 1, 1, 1, 0, 1, 0].map((on, i) => <span key={i} className={`nc-tile${on ? " is-on" : ""}${i === 4 ? " is-aim0" : ""}`} style={{ "--h": 200 + i * 10, "--k": i }}><span className="nc-tile__core" /></span>)}
            </div>
          </div>
          <p><b>Goal:</b> switch <b>every light off</b>.</p>
          <p><b>Tapping a node</b> flips it and its neighbours above, below, left and right (never diagonals). Corner nodes flip 3 lights, edge nodes 4, inner nodes 5.</p>
          <p><b>Optimal</b> is the fewest taps that solve the board. Match it for ★★★; a few extra taps still earn ★★.</p>
          <p><b>Hint</b> lights up a node that belongs to a shortest solution from the board as it is now. <b>Undo</b> takes back your last tap; <b>Restart</b> resets the level.</p>
          <p><b>Time Challenge:</b> clear five generated circuits before the timer runs out — each hint costs {G.HINT_PENALTY / 1000}s.</p>
          <p><b>Keyboard:</b> arrows move · <kbd>Space</kbd>/<kbd>Enter</kbd> tap · <kbd>U</kbd> undo · <kbd>R</kbd> restart · <kbd>H</kbd> hint · <kbd>P</kbd> pause.</p>
        </div>
        <button type="button" className="nc-btn" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

const LockIcon = () => <svg className="nc-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" strokeWidth="2.4" stroke="currentColor" /></svg>;
const UndoIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12h-3" /></svg>;
const ResetIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5" /></svg>;
const BulbIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>;
