/**
 * Laser Maze — one level attempt.
 *
 * Owns the puzzle state, its undo history and the move counter. The beam is
 * `traceBeams(level, puzzle)` — recomputed synchronously on every change, so
 * a click updates the light in the same frame while the mirror plate
 * animates (~200ms CSS) toward the same orientation.
 *
 * Completion fires once per mount: `completedRef` guards it, input locks
 * the moment the solving state is reached, and the parent remounts this
 * component (new key) for Replay / Next / Restart, which also discards any
 * running beam animation or timer from the previous attempt.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "../components/Board.jsx";
import { Icon } from "../components/icons.jsx";
import LevelComplete from "./LevelComplete.jsx";
import Settings from "./Settings.jsx";
import { initialState, sanitizeState, stateKey } from "../engine/level.js";
import { traceBeams } from "../engine/trace.js";
import { applyMove, solve } from "../engine/moves.js";
import { colorOf } from "../engine/constants.js";
import { starsFor, starThresholds } from "../utils/progress.js";
import { sfx } from "../utils/audio.js";

const HINT_MAX_STATES = 80000;

function Gameplay({
  level, world, settings, muted, bestMoves, resume, hasNext,
  onMove, onUndo, onReset, onHint, onComplete,
  onNext, onReplay, onLevels, onMenu, onChangeSettings,
}) {
  const start = useMemo(() => initialState(level), [level]);
  const [puzzle, setPuzzle] = useState(() => (resume && sanitizeState(level, resume.state)) || start);
  const [moves, setMoves] = useState(() => (resume && sanitizeState(level, resume.state) ? resume.moves : 0));
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [hint, setHint] = useState(null);
  const [hintMsg, setHintMsg] = useState(null);
  const [phase, setPhase] = useState("play"); // play | completing | done
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pulse, setPulse] = useState(() => level.targets.map(() => 0));
  const [result, setResult] = useState(null);

  const trace = useMemo(() => traceBeams(level, puzzle), [level, puzzle]);
  const ref = useRef({});
  ref.current = { puzzle, moves, history, phase, paused, selected, trace };
  const completedRef = useRef(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const locked = phase !== "play" || paused;

  /* --------------------------------------------------------- moves */

  const commit = useCallback((move) => {
    const r = ref.current;
    if (r.phase !== "play" || r.paused) return;
    const next = applyMove(level, r.puzzle, move);
    if (stateKey(next) === stateKey(r.puzzle)) return;
    const m = r.moves + 1;
    setHistory((h) => [...h, { puzzle: r.puzzle, moves: r.moves }]);
    setPuzzle(next);
    setMoves(m);
    setSelected(null);
    setHint(null); // a hint is only valid for the board it was computed on
    setHintMsg(null);
    onMove(level.id, next, m);
  }, [level, onMove]);

  const rotate = useCallback((i) => {
    sfx.rotate();
    commit({ t: "rot", i });
  }, [commit]);

  const crank = useCallback((i) => {
    sfx.crank();
    commit({ t: "crank", i });
  }, [commit]);

  const selectMovable = useCallback((i) => {
    if (ref.current.phase !== "play") return;
    setSelected((s) => (s === i ? null : i));
    sfx.pick();
  }, []);

  const moveTo = useCallback((slot) => {
    const i = ref.current.selected;
    if (i === null) return;
    sfx.slide();
    commit({ t: "mv", i, s: slot });
  }, [commit]);

  const clearSelection = useCallback(() => setSelected(null), []);

  const undo = useCallback(() => {
    const r = ref.current;
    if (r.phase !== "play" || r.paused || !r.history.length) return;
    const prev = r.history[r.history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setPuzzle(prev.puzzle);
    setMoves(prev.moves);
    setSelected(null);
    setHint(null);
    setHintMsg(null);
    sfx.undo();
    onUndo(level.id, prev.puzzle, prev.moves);
  }, [level, onUndo]);

  const reset = useCallback(() => {
    const r = ref.current;
    if (r.phase !== "play") return;
    setPuzzle(start);
    setMoves(0);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setHintMsg(null);
    setPaused(false);
    sfx.back();
    onReset(level.id);
  }, [start, level, onReset]);

  const askHint = useCallback(() => {
    const r = ref.current;
    if (r.phase !== "play" || r.paused) return;
    sfx.hint();
    onHint();
    // Exact continuation from the CURRENT board, via the same BFS the validator uses.
    const res = solve(level, r.puzzle, { maxStates: HINT_MAX_STATES });
    let mv = res && res.solution[0];
    let left = res ? res.solution.length : null;
    if (!mv && stateKey(r.puzzle) === stateKey(start) && level.solution?.length) {
      mv = level.solution[0];
      left = level.solution.length;
    }
    if (!mv) {
      setHint(null);
      setHintMsg({ text: "Reset to follow the guided solution.", reset: true });
      return;
    }
    setHint(mv);
    if (mv.t === "mv") setSelected(null);
    const verb = mv.t === "rot"
      ? `Turn the highlighted ${level.rotatables[mv.i].kind}`
      : mv.t === "crank" ? "Turn the highlighted crank" : "Pick up the highlighted mirror and place it on the dashed slot";
    setHintMsg({ text: `${verb}. ${left === 1 ? "That solves it!" : `${left} moves from a solution.`}` });
  }, [level, start, onHint]);

  /* ------------------------------------------------- beam feedback */

  const prevTrace = useRef(trace);
  useEffect(() => {
    const prev = prevTrace.current;
    prevTrace.current = trace;
    if (prev === trace) return;
    let newlyLit = false;
    const bumps = [];
    trace.targetLit.forEach((lit, i) => {
      if (lit && !prev.targetLit[i]) {
        newlyLit = true;
        bumps.push(i);
        sfx.target(i);
      }
    });
    if (bumps.length) setPulse((p) => p.map((v, i) => (bumps.includes(i) ? v + 1 : v)));
    if (!newlyLit && trace.targetWrong.some((w, i) => w && !prev.targetWrong[i])) sfx.mismatch();
    if (!newlyLit && prev.targetLit.some((l, i) => l && !trace.targetLit[i])) sfx.targetOff();
    if ([...trace.switchesOn].some((s) => !prev.switchesOn.has(s))) sfx.switchOn();
    if (trace.gatesOpen.size > prev.gatesOpen.size) sfx.gate();
    if (trace.portalHits.length > prev.portalHits.length) sfx.portal();
    if (!newlyLit && trace.segments.length !== prev.segments.length) sfx.reflect();
  }, [trace]);

  /* ------------------------------------------------------ completion */

  useEffect(() => {
    if (!trace.solved || completedRef.current) return;
    completedRef.current = true;
    setPhase("completing");
    setHint(null);
    setHintMsg(null);
    setSelected(null);
    sfx.complete();
    const finalMoves = ref.current.moves;
    const stars = starsFor(finalMoves, level.par);
    const prevBest = bestMoves;
    timers.current.push(setTimeout(() => {
      setResult({ moves: finalMoves, stars, newBest: prevBest == null || finalMoves < prevBest, prevBest });
      setPhase("done");
      onComplete(level.id, finalMoves, stars);
    }, settings.reducedMotion ? 350 : 850));
  }, [trace.solved, level, bestMoves, onComplete, settings.reducedMotion]);

  /* -------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if ((k === "z" && (e.ctrlKey || e.metaKey)) || k === "u" || k === "backspace") {
        e.preventDefault();
        undo();
      } else if (k === "r" && !e.ctrlKey && !e.metaKey) reset();
      else if (k === "h") askHint();
      else if (k === "escape") {
        if (ref.current.selected !== null) setSelected(null);
        else if (ref.current.phase === "play") setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, reset, askHint]);

  /* ------------------------------------------------------------ view */

  const th = starThresholds(level.par);
  const levelNo = ((level.id - 1) % 10) + 1;
  const boardSettings = useMemo(() => ({
    graphics: settings.graphics,
    particles: settings.particles,
    beamGlow: settings.beamGlow,
    reducedMotion: settings.reducedMotion,
  }), [settings.graphics, settings.particles, settings.beamGlow, settings.reducedMotion]);

  return (
    <div className={`lm-play${phase !== "play" ? " is-complete" : ""}${phase === "done" ? " is-done" : ""}`}>
      <header className="lm-hud">
        <div className="lm-hud__title">
          <span className="lm-hud__world">World {world.id} · {world.name}</span>
          <span className="lm-hud__level">{world.id}-{levelNo} <em>{level.name}</em></span>
        </div>
        <div className="lm-hud__stats">
          <div className="lm-stat"><span>Moves</span><b>{moves}</b></div>
          <div className="lm-stat"><span>Best</span><b>{bestMoves ?? "—"}</b></div>
          <div className="lm-stat" title={`3 stars at ${th.three} moves or fewer`}><span>3★ par</span><b>{level.par ?? "—"}</b></div>
          <div className="lm-stat lm-stat--targets">
            <span>Targets</span>
            <b>
              {level.targets.map((t, i) => (
                <i key={i} className={trace.targetLit[i] ? "is-lit" : ""} style={{ "--c": colorOf(t.c).hex }} />
              ))}
              <small>{trace.litCount}/{level.targets.length}</small>
            </b>
          </div>
        </div>
        <div className="lm-hud__actions">
          <button type="button" className="lm-ibtn" onClick={undo} disabled={locked || !history.length} title="Undo (U / Ctrl+Z)"><Icon.undo /><span>Undo</span></button>
          <button type="button" className="lm-ibtn" onClick={reset} disabled={phase !== "play" || (!history.length && moves === 0)} title="Reset level (R)"><Icon.reset /><span>Reset</span></button>
          <button type="button" className="lm-ibtn lm-ibtn--hint" onClick={askHint} disabled={locked} title="Hint (H)"><Icon.hint /><span>Hint</span></button>
          <button type="button" className="lm-ibtn" onClick={() => setPaused(true)} disabled={phase !== "play"} title="Pause (Esc)"><Icon.pause /><span>Menu</span></button>
        </div>
      </header>

      <div className="lm-play__boardwrap" onClick={clearSelection}>
        <Board
          level={level}
          state={puzzle}
          trace={trace}
          world={world}
          uid={`lm${level.id}`}
          settings={boardSettings}
          interactive={!locked}
          selected={selected}
          hint={hint}
          completing={phase !== "play"}
          pulse={pulse}
          onRotate={rotate}
          onCrank={crank}
          onSelectMovable={selectMovable}
          onMoveTo={moveTo}
          onBackground={clearSelection}
        />
      </div>

      <footer className="lm-play__foot">
        {hintMsg ? (
          <p className="lm-toast lm-toast--hint">
            <Icon.hint /> {hintMsg.text}
            {hintMsg.reset && <button type="button" onClick={reset}>Reset</button>}
          </p>
        ) : selected !== null ? (
          <p className="lm-toast">Tap a glowing slot to place the mirror · tap it again to put it down</p>
        ) : level.tip && phase === "play" ? (
          <p className="lm-toast lm-toast--tip">{level.tip}</p>
        ) : null}
      </footer>

      {paused && phase === "play" && (
        <div className="lm-overlay" onClick={() => { setPaused(false); setShowSettings(false); }}>
          <div className="lm-panel lm-panel--pause" onClick={(e) => e.stopPropagation()}>
            {showSettings ? (
              <Settings settings={settings} muted={muted} onChange={onChangeSettings} onBack={() => setShowSettings(false)} compact />
            ) : (
              <>
                <h2 className="lm-panel__title">Paused</h2>
                <p className="lm-panel__sub">{world.id}-{levelNo} · {level.name}</p>
                <div className="lm-panel__buttons">
                  <button type="button" className="lm-btn lm-btn--primary" onClick={() => setPaused(false)}><Icon.play /> Resume</button>
                  <button type="button" className="lm-btn" onClick={reset}><Icon.reset /> Reset level</button>
                  <button type="button" className="lm-btn" onClick={() => setShowSettings(true)}><Icon.gear /> Settings</button>
                  <button type="button" className="lm-btn" onClick={onLevels}><Icon.grid /> Level select</button>
                  <button type="button" className="lm-btn lm-btn--ghost" onClick={onMenu}><Icon.home /> Main menu</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <LevelComplete
          world={world}
          level={level}
          levelNo={levelNo}
          result={result}
          bestMoves={bestMoves}
          hasNext={hasNext}
          onNext={onNext}
          onReplay={onReplay}
          onLevels={onLevels}
        />
      )}
    </div>
  );
}

export default memo(Gameplay);

