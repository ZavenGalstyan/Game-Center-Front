/**
 * Water Tanks — one level being played.
 *
 * The session reducer (engine/session.js) owns the puzzle. This screen only:
 *   - measures the board and lays the tanks out
 *   - runs the pour timeline for the current pour token (lift → move/tilt →
 *     flow → return → END), all timers in one cancellable Timeline
 *   - plays sounds, shows feedback/hints, and reports events upward
 * Restart / Retry remount this component with a new key, so no timer, sound
 * or callback from an old attempt can reach the new one.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import Board from "../components/Board.jsx";
import { Icon, Stars } from "../components/icons.jsx";
import { layoutBoard } from "../components/geometry.js";
import { createSession, sessionReducer, shownAmount } from "../engine/session.js";
import { targetStatus } from "../engine/rules.js";
import { Timeline } from "../utils/timeline.js";
import { sfx } from "../utils/audio.js";
import { starRule } from "../utils/progress.js";

export function durations(p, settings) {
  const slow = (import.meta.env.DEV && typeof window !== "undefined" && window.__wtSlow) || 1; // DEV slow-motion for inspection
  const f = (settings.pourSpeed === "fast" ? 0.55 : 1) * slow;
  if (!p) return { lift: 0, move: 0, flow: 300, ret: 0 };
  if (settings.reducedMotion) return { lift: 0, move: 0, flow: Math.round(Math.min(420, 220 + 25 * p.amount) * f), ret: 0 };
  if (p.kind === "pour") {
    // total 820–980 ms: lift 110 · lean 220 · flow 280–440 (grows with litres) · return 210
    return { lift: Math.round(110 * f), move: Math.round(220 * f), flow: Math.round(Math.min(440, 240 + 40 * p.amount) * f), ret: Math.round(210 * f) };
  }
  return { lift: 0, move: Math.round(140 * f), flow: Math.round(Math.min(600, 260 + 34 * p.amount) * f), ret: Math.round(130 * f) };
}

const REASONS = {
  empty: (L, t) => `Tank ${t} is empty`,
  full: (L, t) => `Tank ${t} is already full`,
  "locked-source": (L, t, lv, i) => sealText(lv, i),
  "locked-dest": (L, t, lv, i) => sealText(lv, i),
  inlet: (L, t) => `Tank ${t} is inlet-only — it can't pour out`,
  valve: (L, t, lv, i, s) => {
    const v = lv.valves.find((x) => x.from === i && x.to === s.selected);
    return v ? `One-way valve: only ${lv.tanks[v.from].id} → ${lv.tanks[v.to].id}` : "Blocked by a one-way valve";
  },
  "no-uses": (L, t) => `No uses left on tank ${t}`,
};

function sealText(level, i) {
  const lock = level.tanks[i].lock;
  return lock ? `Tank ${level.tanks[i].id} is sealed — it opens when ${level.tanks[lock.tank].id} holds exactly ${lock.amount} L` : "That tank is sealed";
}

function moveText(level, m) {
  if (!m) return "";
  if (m.kind === "pour") return `Pour ${level.tanks[m.from].id} → ${level.tanks[m.to].id}`;
  return `${m.kind === "fill" ? "Fill" : "Drain"} ${level.tanks[m.tank].id}`;
}

export default function Gameplay({
  level, chapter, settings, styleVarsObj, compact, bestMoves, hasNext,
  onMove, onInvalid, onUndo, onHint, onComplete, onNext, onRetry, onLevels, onMenu,
}) {
  const [session, dispatch] = useReducer(sessionReducer, level, createSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const timeline = useRef(null);
  if (!timeline.current) timeline.current = new Timeline();

  /* ------------------------------------------------------ board size */
  const boardRef = useRef(null);
  const [size, setSize] = useState(null);
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      const top = Math.round(el.offsetTop);
      setSize((s) => (s && s.w === w && s.h === h && s.top === top ? s : { w, h, top }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const hasFixtures = level.tanks.some((t) => t.fill || t.drain);
  const layout = useMemo(
    () => (size && size.w > 40 && size.h > 40 ? layoutBoard(size.w, size.h, level, { fixtureRow: hasFixtures, valveRows: level.valves.length, compact, headroom: size.top }) : null),
    [size, level, hasFixtures, compact],
  );

  /* ------------------------------------------------- pour timeline */
  const pour = session.pour;
  const D = useMemo(() => durations(pour, settings), [pour?.token, settings.pourSpeed, settings.reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = sessionRef.current.pour;
    if (!p) return undefined;
    const tl = timeline.current;
    const d = durations(p, settings);
    const token = p.token;
    let stopPour = null;
    onMove?.(p.kind, p.amount);
    if (p.kind === "pour" && d.lift) sfx.lift();
    let t = d.lift;
    tl.at(t, () => dispatch({ type: "PHASE", token, phase: "move" }));
    t += d.move;
    tl.at(t, () => {
      dispatch({ type: "PHASE", token, phase: "flow" });
      stopPour = sfx.pourStart(p.amount, p.kind);
    });
    const steps = Math.min(p.amount, 24);
    for (let k = 1; k <= steps; k++) {
      const litres = Math.round((k / steps) * p.amount);
      tl.at(t + (d.flow * k) / steps - 1, () => dispatch({ type: "TICK", token, k: litres }));
    }
    t += d.flow;
    tl.at(t, () => {
      stopPour?.();
      stopPour = null;
      if (p.kind !== "drain") sfx.splash();
      if (p.unlockedNow.length) sfx.unlock();
      dispatch({ type: "PHASE", token, phase: "return" });
    });
    t += d.ret;
    tl.at(t + 10, () => dispatch({ type: "END", token }));
    return () => {
      tl.clear();
      stopPour?.();
    };
  }, [pour?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  /* unmount: nothing keeps sounding or ticking */
  useEffect(() => () => {
    timeline.current?.clear();
    sfx.stopAll();
  }, []);

  /* ------------------------------------------------------- feedback */
  const [toast, setToast] = useState(null);
  const fbSeq = session.feedback?.seq;
  useEffect(() => {
    const fb = sessionRef.current.feedback;
    if (!fb) return undefined;
    sfx.invalid();
    onInvalid?.();
    const lv = sessionRef.current.level;
    const make = REASONS[fb.reason];
    setToast({ seq: fb.seq, text: make ? make(lv, lv.tanks[fb.tank]?.id, lv, fb.tank, sessionRef.current) : "Can't pour there", warn: true });
    const id = setTimeout(() => setToast((t) => (t && t.seq === fb.seq ? null : t)), 2000);
    return () => clearTimeout(id);
  }, [fbSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* selection sounds */
  const prevSel = useRef(null);
  useEffect(() => {
    if (session.selected !== null && prevSel.current === null) sfx.select();
    else if (session.selected === null && prevSel.current !== null && !session.pour) sfx.deselect();
    prevSel.current = session.selected;
  }, [session.selected, session.pour]);

  /* ----------------------------------------------------- completion */
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const reported = useRef(false);
  useEffect(() => {
    if (session.status !== "solved" || reported.current) return undefined;
    reported.current = true;
    sfx.stopAll();
    sfx.target();
    const s = sessionRef.current;
    setResult(onComplete?.(level, { moves: s.moves, hints: s.hintsUsed }) ?? null);
    const id = setTimeout(() => {
      setShowResult(true);
      sfx.complete();
    }, settings.reducedMotion ? 450 : 800);
    return () => clearTimeout(id);
  }, [session.status]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------- actions */
  const tap = useCallback((i) => {
    const s = sessionRef.current;
    if (s.pour || s.status !== "playing") return;
    dispatch({ type: "TAP", tank: i });
  }, []);
  const fixture = useCallback((kind, i) => {
    const s = sessionRef.current;
    if (s.pour || s.status !== "playing") return;
    dispatch({ type: "FIXTURE", kind, tank: i });
  }, []);
  const undo = useCallback(() => {
    const s = sessionRef.current;
    if (s.pour || s.status !== "playing" || !s.history.length) return;
    dispatch({ type: "UNDO" });
    sfx.undo();
    onUndo?.();
  }, [onUndo]);
  const hint = useCallback(() => {
    const s = sessionRef.current;
    if (s.pour || s.status !== "playing") return;
    dispatch({ type: "HINT" });
  }, []);
  const hintSeq = session.hintsUsed;
  useEffect(() => {
    if (hintSeq > 0) {
      sfx.hint();
      onHint?.();
    }
  }, [hintSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* keyboard: 1–6 tanks · Esc cancel · U / Backspace undo · H hint */
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!boardRef.current?.isConnected || showResultRef.current) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= sessionRef.current.level.tanks.length) {
        e.preventDefault();
        tap(n - 1);
      } else if (e.key === "Escape") {
        dispatch({ type: "DESELECT" });
      } else if (e.key === "u" || e.key === "U" || e.key === "Backspace") {
        e.preventDefault();
        undo();
      } else if (e.key === "h" || e.key === "H") {
        hint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap, undo, hint]);
  const showResultRef = useRef(false);
  showResultRef.current = showResult;

  /* DEV-only automation hook (?wttest=1): drive + fast-forward the real game */
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    if (!new URLSearchParams(window.location.search).has("wttest")) return undefined;
    const api = {
      get session() { return sessionRef.current; },
      get layout() { return layoutRef.current; },
      tap: (i) => tap(i),
      fixture: (k, i) => fixture(k, i),
      undo: () => undo(),
      hint: () => hint(),
      flush: () => timeline.current.flush(),
      pending: () => timeline.current.pending,
    };
    window.__wtPlay = api;
    return () => {
      if (window.__wtPlay === api) delete window.__wtPlay;
    };
  }, [tap, fixture, undo, hint]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  /* ----------------------------------------------------------- view */
  // target indicators follow what the player SEES (mid-pour amounts), not the committed result
  const shown = level.tanks.map((_, i) => shownAmount(session, i));
  const met = targetStatus(level, { ...session.state, amounts: shown });
  const rule = starRule(level.optimalMoves);
  const locked = Boolean(session.pour) || session.status !== "playing";
  const help = (() => {
    if (!settings.controlHelp || session.status !== "playing") return null;
    if (session.pour) return null;
    if (session.selected !== null) return { main: "SELECT WHERE TO POUR", sub: `Tap ${level.tanks[session.selected].id} again to cancel` };
    if (session.hint?.move) return { main: moveText(level, session.hint.move).toUpperCase(), sub: "Hint", hint: true };
    if (session.hint?.none) return { main: "NO PATH FROM HERE", sub: "Undo or restart", warn: true };
    return { main: "SELECT A TANK", sub: hasFixtures ? "or use a fill tap / drain" : null };
  })();
  const anyFree = level.targets.some((t) => t.tank === null);

  return (
    <div className={`wt-play${session.status === "solved" ? " is-solved" : ""}${session.pour ? " is-pouring" : ""}`} style={styleVarsObj}>
      <header className="wt-hud">
        <div className="wt-hud__left">
          <button type="button" className="wt-iconbtn" onClick={onLevels} aria-label="Back to levels"><Icon.back /></button>
          <div className="wt-hud__level">
            <span className="wt-hud__kicker">{chapter.name} · Level {level.id}</span>
            <span className="wt-hud__name">{level.name}</span>
          </div>
        </div>
        <div className="wt-hud__target" aria-live="polite">
          <span className="wt-hud__kicker">{level.targets.length > 1 ? "Targets" : "Target"}</span>
          <div className="wt-hud__chips">
            {level.targets.map((t, k) => (
              <span key={k} className={`wt-goal${met[k] ? " is-met" : ""}`}>
                {met[k] ? <Icon.check /> : <Icon.target />}
                {t.tank !== null && <em>{level.tanks[t.tank].id}</em>}
                <b>{t.amount} L</b>
              </span>
            ))}
          </div>
          {anyFree && !compact && <span className="wt-hud__sub">{level.targets.length > 1 ? "in different tanks" : "in any tank"}</span>}
        </div>
        <div className="wt-hud__tools">
          <button type="button" className="wt-iconbtn" onClick={undo} disabled={locked || !session.history.length} aria-label="Undo"><Icon.undo /></button>
          <button type="button" className="wt-iconbtn" onClick={hint} disabled={locked} aria-label="Hint"><Icon.hint /></button>
        </div>
        <div className="wt-hud__right">
          <span className="wt-hud__kicker">Moves</span>
          <span className="wt-hud__moves" key={session.moves}>{session.moves}</span>
          <span className="wt-hud__par" title="Moves for three stars"><Stars n={3} size={10} /> ≤ {rule.three}</span>
        </div>
      </header>

      {level.tip && session.moves === 0 && session.status === "playing" && <div className="wt-tip">{level.tip}</div>}

      <div className="wt-stage" ref={boardRef} onClick={(e) => { if (e.target === e.currentTarget) dispatch({ type: "DESELECT" }); }}>
        {layout && (
          <Board
            session={session}
            layout={layout}
            D={D}
            settings={settings}
            uid={uid}
            onTap={tap}
            onFixture={fixture}
            compact={compact}
          />
        )}
        {toast && <div className={`wt-toast${toast.warn ? " is-warn" : ""}`} key={toast.seq} role="status">{toast.text}</div>}
      </div>

      <footer className="wt-bar">
        <div className={`wt-help${help?.hint ? " is-hint" : ""}${help?.warn ? " is-warn" : ""}`} aria-live="polite">
          {help && (<><b>{help.main}</b>{help.sub && <small>{help.sub}</small>}</>)}
        </div>
        <div className="wt-bar__btns">
          <button type="button" className="wt-btn" onClick={undo} disabled={locked || !session.history.length}>
            <Icon.undo /><span>Undo</span>
          </button>
          <button type="button" className="wt-btn" onClick={hint} disabled={locked}>
            <Icon.hint /><span>Hint</span>
          </button>
        </div>
        <div className="wt-bar__spacer" />
      </footer>

      {showResult && (
        <ResultPanel
          level={level}
          moves={session.moves}
          hints={session.hintsUsed}
          result={result}
          bestMoves={bestMoves}
          hasNext={hasNext}
          onNext={onNext}
          onRetry={onRetry}
          onLevels={onLevels}
          onMenu={onMenu}
        />
      )}
    </div>
  );
}

function ResultPanel({ level, moves, hints, result, hasNext, onNext, onRetry, onLevels }) {
  const stars = result?.stars ?? 1;
  const best = result ? Math.min(moves, result.prevBest ?? moves) : moves;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i <= stars) sfx.star(i - 1);
      setShown(i);
      if (i >= 3) clearInterval(id);
    }, 220);
    return () => clearInterval(id);
  }, [stars]);
  const nextRef = useRef(null);
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="wt-result" role="dialog" aria-label="Level complete">
      <div className="wt-result__card">
        <span className="wt-result__kicker">Level {level.id} · {level.name}</span>
        <h2 className="wt-result__title">Level Complete</h2>
        <div className="wt-result__stars">
          {[1, 2, 3].map((i) => (
            <svg key={i} viewBox="0 0 24 24" className={`wt-bigstar${i <= Math.min(shown, stars) ? " is-on" : ""}`} aria-hidden="true">
              <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8Z" />
            </svg>
          ))}
          <span className="wt-sr">{stars} of 3 stars</span>
        </div>
        <dl className="wt-result__stats">
          <div><dt>Target</dt><dd>{level.targets.map((t) => (t.tank !== null ? `${level.tanks[t.tank].id} ${t.amount}` : t.amount)).join(" + ")} L</dd></div>
          <div><dt>Moves</dt><dd>{moves}</dd></div>
          <div><dt>Best</dt><dd>{best}{result?.newBest ? <i className="wt-new">NEW</i> : null}</dd></div>
          <div><dt>Optimal</dt><dd>{level.optimalMoves}</dd></div>
        </dl>
        <p className="wt-result__note">
          {moves <= level.optimalMoves && hints === 0
            ? "Optimal solution — perfect measure."
            : hints > 0 && moves <= level.optimalMoves
              ? "Solved with a hint — three stars need a hint-free solve."
              : `Optimal solution: ${level.optimalMoves} move${level.optimalMoves === 1 ? "" : "s"}.`}
        </p>
        {result?.newStyles?.length > 0 && (
          <p className="wt-result__unlock"><Icon.tank /> New tank style: <b>{result.newStyles.map((s) => s.name).join(", ")}</b></p>
        )}
        <div className="wt-result__btns">
          <button type="button" className="wt-btn" onClick={onLevels}><Icon.levels /><span>Levels</span></button>
          <button type="button" className="wt-btn" onClick={onRetry}><Icon.retry /><span>Retry</span></button>
          <button type="button" ref={nextRef} className="wt-btn wt-btn--primary" onClick={onNext}>
            <span>{hasNext ? "Next Level" : "Finish"}</span><Icon.next />
          </button>
        </div>
      </div>
    </div>
  );
}
