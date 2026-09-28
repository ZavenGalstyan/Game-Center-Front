/**
 * Parking Jam — one level attempt.
 *
 * Owns the logical state `{ present, history }` (engine/logic.js). A tap is
 * resolved against that state synchronously: legal → the state changes at
 * once and the Scene animates the car out; blocked → nothing changes except
 * feedback. Input is locked from a legal tap until the car has physically
 * left the lot (`busy`), so a double-click or rapid taps can never remove two
 * cars or drive one through another. Completion fires once (completedRef).
 *
 * The parent remounts this component (new key) for Restart / Replay / Next,
 * which discards timers and animations from the previous attempt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Scene from "../render/Scene.jsx";
import LevelComplete from "./LevelComplete.jsx";
import { Icon } from "../components/icons.jsx";
import {
  initialState, canExit, applyExit, undoExit, isSolved, legalMoves, bestHint, replay, pathCells, remaining,
} from "../engine/logic.js";
import { starsFor, starRules } from "../utils/progress.js";
import { skinById } from "../data/skins.js";
import { sfx } from "../utils/audio.js";

const HINT_COOLDOWN = 1200;
const ASSIST_DELAY = 7000;

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Gameplay({
  level, world, settings, skinId, resume, hasNext, isLast,
  onMove, onUndo, onBlocked, onHint, onRestart, onComplete, onNext, onReplay, onLevels, compact,
}) {
  const [game, setGame] = useState(() => {
    const r = resume ? replay(level, resume.order) : null;
    return r && !isSolved(r) ? r : initialState(level);
  });
  const [mistakes, setMistakes] = useState(() => (resume ? resume.mistakes : 0));
  const [hints, setHints] = useState(() => (resume ? resume.hints : 0));
  const [phase, setPhase] = useState("play"); // play | clearing | done
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);
  const [flash, setFlash] = useState(null);
  const [assist, setAssist] = useState(null);
  const [tip, setTip] = useState(() => level.tip);
  const [result, setResult] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const sceneRef = useRef(null);
  const busyRef = useRef(false);
  const completedRef = useRef(false);
  const lastBlocked = useRef({ i: -1, t: 0 });
  const lastHint = useRef(0);
  const firstExit = useRef(false);
  const started = useRef(performance.now());
  const timers = useRef(new Set());
  const ref = useRef({});
  ref.current = { game, mistakes, hints, phase };

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const setLock = (v) => {
    busyRef.current = v;
    setBusy(v);
  };

  const skin = useMemo(() => skinById(skinId), [skinId]);
  const n = level.vehicles.length;
  const left = remaining(game.present);
  const moves = game.history.length;
  const rules = starRules(level);
  const early = level.id <= 10;
  const legal = useMemo(() => legalMoves(level, game.present), [level, game.present]);
  const stuck = phase === "play" && left > 0 && legal.length === 0;

  /* level tips fade after a few seconds (the Level 1 tutorial stays up) */
  useEffect(() => {
    if (!tip || level.id === 1) return undefined;
    const id = setTimeout(() => setTip(null), 6500);
    return () => clearTimeout(id);
  }, [tip, level.id]);

  /* clock (display only — time never causes failure) */
  useEffect(() => {
    if (phase !== "play") return undefined;
    const id = setInterval(() => setElapsed(performance.now() - started.current), 1000);
    return () => clearInterval(id);
  }, [phase]);

  /* move assist: after a quiet spell, softly mark the cars that can leave */
  const [poke, setPoke] = useState(0);
  useEffect(() => {
    setAssist(null);
    if (!settings.moveAssist || phase !== "play") return undefined;
    const id = setTimeout(() => setAssist(legalMoves(level, ref.current.game.present)), ASSIST_DELAY);
    return () => clearTimeout(id);
  }, [settings.moveAssist, phase, poke, level]);

  /* ------------------------------------------------------------ finish */
  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    const { mistakes: m, hints: h } = ref.current;
    const timeMs = Math.round(performance.now() - started.current);
    const stars = starsFor(level, m, h);
    const newSkins = onComplete(level.id, { stars, mistakes: m, timeMs, hints: h });
    setResult({ stars, mistakes: m, hints: h, timeMs, newSkins: newSkins || [] });
    setPhase("done");
    sfx.complete();
  }, [level, onComplete]);

  /* ------------------------------------------------------------- input */
  const tap = useCallback((i) => {
    const { game: g, phase: ph } = ref.current;
    if (ph !== "play" || busyRef.current) return;
    setPoke((k) => k + 1);
    const res = canExit(level, g.present, i);
    if (!res.ok) {
      if (res.reason === "gone") return;
      const now = performance.now();
      const same = lastBlocked.current.i === i && now - lastBlocked.current.t < 380;
      lastBlocked.current = { i, t: now };
      if (same) return; // a double-click is one attempt, with one feedback
      sceneRef.current?.nudge(i);
      sfx.blocked();
      setMistakes((m) => m + 1);
      onBlocked();
      const cells = [];
      if (res.blockedAt) {
        for (const c of pathCells(level, level.vehicles[i])) {
          cells.push(c);
          if (c[0] === res.blockedAt[0] && c[1] === res.blockedAt[1]) break;
        }
      }
      setFlash({ index: i, blocker: early || settings.moveAssist ? res.blocker : null, cells, key: now });
      later(() => setFlash((f) => (f && f.key === now ? null : f)), 750);
      if (level.id === 1) setTip("That car is blocked — something is in its way.");
      return;
    }
    const next = applyExit(level, g, i);
    if (!next) return;
    setLock(true);
    setGame(next);
    setHint(null);
    setFlash(null);
    sfx.engine(level.vehicles[i].length);
    const done = isSolved(next);
    if (done) {
      setPhase("clearing");
      sfx.lastCar();
    }
    if (level.id === 1 && !firstExit.current) setTip("Great! Clearing one car opens space for another.");
    else if (firstExit.current && level.id !== 1) setTip(null);
    firstExit.current = true;
    onMove(level.id, next.history, ref.current.mistakes, ref.current.hints);
    sceneRef.current?.exit(i, {
      onClear: () => setLock(false),
      onDone: done ? () => later(finish, settings.reducedMotion ? 150 : 480) : undefined,
    });
  }, [level, early, settings.moveAssist, settings.reducedMotion, onBlocked, onMove, later, finish]);

  const undo = useCallback(() => {
    const { game: g, phase: ph } = ref.current;
    if (ph !== "play" || busyRef.current || !g.history.length) return;
    const u = undoExit(g);
    if (!u) return;
    setLock(true);
    setGame({ present: u.present, history: u.history });
    setHint(null);
    setFlash(null);
    setPoke((k) => k + 1);
    sfx.undo();
    onUndo(level.id, u.history, ref.current.mistakes, ref.current.hints);
    sceneRef.current?.bringBack(u.restored, { onDone: () => setLock(false) });
  }, [level, onUndo]);

  const askHint = useCallback(() => {
    const { game: g, phase: ph } = ref.current;
    if (ph !== "play") return;
    const now = performance.now();
    if (now - lastHint.current < HINT_COOLDOWN) return;
    const h = bestHint(level, g.present);
    if (h == null) return;
    lastHint.current = now;
    setHint(h);
    setPoke((k) => k + 1);
    sfx.hint();
    setHints((x) => x + 1);
    onHint();
  }, [level, onHint]);

  /* keyboard shortcuts: U undo, H hint */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "u" || e.key === "U" || ((e.ctrlKey || e.metaKey) && e.key === "z")) {
        e.preventDefault();
        undo();
      } else if (e.key === "h" || e.key === "H") askHint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, askHint]);

  const insets = compact ? { top: 92, left: 8, right: 8, bottom: 8 } : { left: 212, top: 12, right: 12, bottom: 12 };
  const tipText = phase === "play" ? tip : null;

  return (
    <div className={`pj-play${compact ? " is-compact" : ""}`}>
      <Scene
        ref={sceneRef}
        level={level}
        world={world}
        present={game.present}
        skin={skin}
        settings={settings}
        uid={`pjs${level.id}`}
        insets={insets}
        interactive={phase === "play"}
        onTap={tap}
        hint={hint}
        flash={flash}
        assist={assist}
        allowRotate
      />

      <aside className="pj-hud" aria-label="Level status">
        <div className="pj-hud__title">
          <span className="pj-hud__world">{world.name}</span>
          <span className="pj-hud__level">Level {level.id}</span>
          <span className="pj-hud__name">{level.name}</span>
        </div>
        <div className="pj-hud__plates">
          <div className="pj-plate"><span>Cars left</span><b>{left}<small>/{n}</small></b></div>
          <div className="pj-plate"><span>Moves</span><b>{moves}</b></div>
          <div className={`pj-plate${mistakes > rules.three ? " is-warn" : ""}`}><span>Blocked</span><b>{mistakes}</b></div>
          <div className="pj-plate pj-plate--time"><span>Time</span><b>{formatTime(elapsed)}</b></div>
        </div>
        <div className="pj-hud__stars" title={`★★★: no hints and ≤ ${rules.three} blocked taps · ★★: ≤ ${rules.two} blocked taps`}>
          {[0, 1, 2].map((k) => {
            const cur = starsFor(level, mistakes, hints);
            return <Icon.star key={k} className={k < cur ? "is-on" : ""} />;
          })}
        </div>
        <div className="pj-hud__tools">
          <button type="button" className="pj-tool" onClick={askHint} disabled={phase !== "play" || left === 0}>
            <Icon.bulb /><span>Hint</span>
          </button>
          <button type="button" className="pj-tool" onClick={undo} disabled={phase !== "play" || busy || moves === 0}>
            <Icon.undo /><span>Undo</span>
          </button>
          <button type="button" className="pj-tool" onClick={onRestart} disabled={phase === "clearing"}>
            <Icon.restart /><span>Restart</span>
          </button>
          <button type="button" className="pj-tool" onClick={onLevels}>
            <Icon.grid /><span>Levels</span>
          </button>
        </div>
      </aside>

      {tipText && (
        <div className="pj-tip" key={tipText} role="status">
          <Icon.info /> {tipText}
        </div>
      )}

      {stuck && (
        <div className="pj-stuck" role="alertdialog" aria-label="No clear path">
          <div className="pj-stuck__sign">NO CLEAR PATH</div>
          <p>No car can leave from here.</p>
          <div className="pj-stuck__row">
            <button type="button" className="pj-btn" onClick={undo} disabled={!moves}><Icon.undo /> Undo</button>
            <button type="button" className="pj-btn" onClick={onRestart}><Icon.restart /> Restart</button>
            <button type="button" className="pj-btn" onClick={askHint}><Icon.bulb /> Hint</button>
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <LevelComplete
          level={level}
          world={world}
          result={result}
          hasNext={hasNext}
          isLast={isLast}
          reducedMotion={settings.reducedMotion}
          onNext={onNext}
          onReplay={onReplay}
          onLevels={onLevels}
          formatTime={formatTime}
        />
      )}
    </div>
  );
}
