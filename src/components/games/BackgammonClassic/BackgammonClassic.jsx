/**
 * Backgammon Classic — short (international) backgammon vs a heuristic AI.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Rules live in rules.js and the AI in ai.js; this file is
 * the turn flow (one reducer = single source of truth) and the board view:
 * an SVG board with HTML checkers on top, so moves glide with CSS transitions.
 *
 * You are ivory and move 24 → 1 (home bottom-right); the AI is dark and
 * moves 1 → 24. `restartSignal` (GamePlayer Restart) starts a new game,
 * `muted` silences the synth sounds. Difficulty is remembered in
 * localStorage (`backgammon-classic-difficulty`).
 */
import { memo, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./BackgammonClassic.css";
import {
  initialPosition, legalMoves, destinations, applyMove, diceToPlay, pipCount,
  rollDie, winner, BAR, OFF,
} from "./rules.js";
import { chooseTurn } from "./ai.js";
import { audio } from "./audio.js";

const STORE_KEY = "backgammon-classic-difficulty";
const LEVELS = ["easy", "medium", "hard"];
const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bgtest");

/* ------------------------------------------------------------ geometry (SVG units) */
const W = 1000, H = 700, TOP = 32, BOT = 668, MID = 350, PW = 400 / 6, R = 30;
const L0 = 36, BAR0 = 436, BAR1 = 504, R1 = 904, TRAY = 952;
const pointX = (p) =>
  p <= 6 ? R1 - (p - 0.5) * PW : p <= 12 ? BAR0 - (p - 6.5) * PW : p <= 18 ? L0 + (p - 12.5) * PW : BAR1 + (p - 18.5) * PW;
const isTop = (p) => p >= 13;
const stackStep = (n, room) => (n > 1 ? Math.min(2 * R, (room - 2 * R) / (n - 1)) : 0);

/* Checker slots: 1..24 points, 25/26 bar (you/AI), 27/28 borne off (you/AI). */
const slot = (pl, n) => (n === BAR[pl] ? 25 + pl : n === OFF[pl] ? 27 + pl : n);

function buildIds(pos) {
  const ids = Array.from({ length: 29 }, () => []);
  const next = [0, 0];
  const put = (s, pl, n) => { for (let i = 0; i < n; i++) ids[s].push(pl * 15 + next[pl]++); };
  for (let p = 1; p <= 24; p++) put(p, pos.pts[p] > 0 ? 0 : 1, Math.abs(pos.pts[p]));
  for (const pl of [0, 1]) { put(25 + pl, pl, pos.bar[pl]); put(27 + pl, pl, pos.off[pl]); }
  return ids;
}

/* ------------------------------------------------------------ turn flow */
function newGame(difficulty) {
  const pos = initialPosition();
  return {
    id: Math.random(), difficulty, pos, ids: buildIds(pos), turn: 0, turnNo: 0, phase: "opening",
    dice: null, left: [], opening: null, sel: null, last: -1, winner: -1,
    msg: { text: "Opening roll — each side rolls one die. Higher die moves first.", tone: "info" },
  };
}

function afterMoves(s) {
  const w = winner(s.pos);
  if (w >= 0) return { ...s, phase: "over", winner: w, msg: { text: w === 0 ? "You win!" : "The AI wins.", tone: "info" } };
  if (!s.left.length || !legalMoves(s.pos, s.turn, s.left).length) return { ...s, phase: "done" };
  return s;
}

function startTurn(s, a, b) {
  const left = diceToPlay(a, b);
  const can = legalMoves(s.pos, s.turn, left).length > 0;
  const who = s.turn === 0 ? "You have" : "The AI has";
  return {
    ...s, dice: [a, b], left, sel: null, phase: can ? "move" : "nomove",
    msg: can ? { text: s.turn === 0 ? (a === b ? "Doubles! Play four moves." : "Your move.") : "AI is thinking…", tone: "info" }
      : { text: `${who} no legal moves — turn passes.`, tone: "warn" },
  };
}

function reducer(s, a) {
  switch (a.type) {
    case "new": return newGame(a.difficulty ?? s.difficulty);
    case "load": return { ...s, pos: a.pos, ids: buildIds(a.pos), sel: null };
    case "rollStart": return { ...s, phase: s.phase === "opening" ? "openingRoll" : "rolling", sel: null };
    case "rollEnd": {
      if (s.phase === "openingRoll") {
        const [you, ai] = a.dice;
        if (you === ai) return { ...s, phase: "opening", opening: a.dice, msg: { text: `Tie (${you}–${ai}) — roll again.`, tone: "warn" } };
        const turn = you > ai ? 0 : 1;
        return { ...s, phase: "openingDone", opening: a.dice, turn, msg: { text: turn === 0 ? `You rolled higher (${you}–${ai}) — you start with ${you} and ${ai}.` : `The AI rolled higher (${ai}–${you}) and starts.`, tone: "info" } };
      }
      return startTurn({ ...s, opening: null }, a.dice[0], a.dice[1]);
    }
    case "begin": return startTurn({ ...s, opening: null, turnNo: s.turnNo + 1 }, s.opening[0], s.opening[1]);
    case "select": return { ...s, sel: a.from };
    case "msg": return { ...s, msg: a.msg };
    case "move": {
      if (s.phase !== "move") return s;
      let { pos, ids, left } = s;
      let last = s.last;
      for (const m of a.path) {
        if (!legalMoves(pos, s.turn, left).some((x) => x.from === m.from && x.to === m.to && x.die === m.die)) return s;
        ids = ids.slice();
        const from = slot(s.turn, m.from), to = slot(s.turn, m.to);
        ids[from] = ids[from].slice();
        last = ids[from].pop();
        if (m.hit) {
          ids[to] = ids[to].slice();
          ids[26 - s.turn] = [...ids[26 - s.turn], ids[to].pop()];
        }
        ids[to] = [...ids[to], last];
        pos = applyMove(pos, s.turn, m);
        const i = left.indexOf(m.die);
        left = left.slice(0, i).concat(left.slice(i + 1));
      }
      return afterMoves({ ...s, pos, ids, left, last, sel: null, msg: s.turn === 0 ? { text: left.length ? `${left.length} move${left.length > 1 ? "s" : ""} left.` : "Turn complete.", tone: "info" } : s.msg });
    }
    case "pass": {
      const turn = 1 - s.turn;
      return { ...s, turn, turnNo: s.turnNo + 1, phase: "roll", left: [], sel: null, msg: { text: turn === 0 ? "Your turn — roll the dice." : "AI's turn.", tone: "info" } };
    }
    default: return s;
  }
}

function loadDifficulty() {
  try { const d = localStorage.getItem(STORE_KEY); return LEVELS.includes(d) ? d : "medium"; } catch { return "medium"; }
}

/* ------------------------------------------------------------ dice */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, used, rolling, dark, x, y, delay = 0 }) {
  const [face, setFace] = useState(value || 1);
  useEffect(() => {
    if (!rolling) return setFace(value || 1);
    const t = setInterval(() => setFace(rollDie()), 70);
    return () => clearInterval(t);
  }, [rolling, value]);
  return (
    <div
      className={`bgc-die${dark ? " bgc-die--dark" : ""}${used ? " is-used" : ""}${rolling ? " is-rolling" : ""}`}
      style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, animationDelay: `${delay}ms` }}
    >
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[face].includes(i) ? "on" : ""} />)}
    </div>
  );
}

/* ------------------------------------------------------------ static board art */
const BoardArt = memo(function BoardArt() {
  const tri = (p) => {
    const x = pointX(p), t = isTop(p);
    const y0 = t ? TOP : BOT, y1 = t ? TOP + 262 : BOT - 262;
    return <path key={p} d={`M${x - PW / 2 + 2},${y0} L${x + PW / 2 - 2},${y0} L${x},${y1} Z`} fill={`url(#bgc-pt${p % 2})`} />;
  };
  const pts = Array.from({ length: 24 }, (_, i) => i + 1);
  return (
    <>
      <defs>
        <linearGradient id="bgc-frame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a3a22" /><stop offset=".5" stopColor="#3f2716" /><stop offset="1" stopColor="#2b1a0e" />
        </linearGradient>
        <linearGradient id="bgc-felt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a8784c" /><stop offset=".5" stopColor="#9a6b40" /><stop offset="1" stopColor="#8a5d36" />
        </linearGradient>
        <linearGradient id="bgc-pt1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6b1622" /><stop offset=".5" stopColor="#8e2433" /><stop offset="1" stopColor="#6b1622" />
        </linearGradient>
        <linearGradient id="bgc-pt0" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9c59b" /><stop offset=".5" stopColor="#f1e3c2" /><stop offset="1" stopColor="#d9c59b" />
        </linearGradient>
        <filter id="bgc-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.16" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.16  0 0 0 0 0.09  0 0 0 0 0.04  0 0 0 0.55 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="bgc-inset"><feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".45" /></filter>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="22" fill="url(#bgc-frame)" />
      <rect x="0" y="0" width={W} height={H} rx="22" fill="#fff" filter="url(#bgc-grain)" opacity=".9" />
      {[[L0, BAR0], [BAR1, R1]].map(([a, b]) => (
        <g key={a}>
          <rect x={a} y={TOP} width={b - a} height={BOT - TOP} fill="url(#bgc-felt)" filter="url(#bgc-inset)" />
          <rect x={a} y={TOP} width={b - a} height={BOT - TOP} fill="#fff" filter="url(#bgc-grain)" opacity=".5" />
        </g>
      ))}
      <rect x={TRAY - 30} y={TOP} width="60" height={BOT - TOP} rx="6" fill="#24150b" />
      <line x1={TRAY - 30} x2={TRAY + 30} y1={MID} y2={MID} stroke="#c8a24a" strokeOpacity=".35" />
      <rect x={BAR0} y={TOP - 10} width={BAR1 - BAR0} height={BOT - TOP + 20} fill="url(#bgc-frame)" />
      <rect x={BAR0 + 30} y={TOP} width="8" height={BOT - TOP} rx="3" fill="#000" opacity=".25" />
      <g>{pts.map(tri)}</g>
      <g className="bgc-nums">
        {pts.map((p) => <text key={p} x={pointX(p)} y={isTop(p) ? 22 : 690}>{p}</text>)}
      </g>
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="19" fill="none" stroke="#c8a24a" strokeOpacity=".4" strokeWidth="2" />
    </>
  );
});

/* ------------------------------------------------------------ component */
export default function BackgammonClassic({ restartSignal = 0, muted = false }) {
  const [screen, setScreen] = useState("menu"); // menu | how | play
  const [difficulty, setDifficulty] = useState(loadDifficulty);
  const [s, dispatch] = useReducer(reducer, difficulty, newGame);
  const [shake, setShake] = useState(0);
  const forced = useRef(null);
  const plan = useRef({ key: "", moves: [], i: 0 });

  useEffect(() => { audio.setMuted(muted); }, [muted]);
  useEffect(() => () => audio.dispose(), []);
  useEffect(() => { try { localStorage.setItem(STORE_KEY, difficulty); } catch { /* ignore */ } }, [difficulty]);

  const seen = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seen.current) return;
    seen.current = restartSignal;
    if (screen === "play") dispatch({ type: "new" });
  }, [restartSignal, screen]);

  const myTurn = s.turn === 0 && s.phase === "move";
  const legal = useMemo(() => (myTurn ? legalMoves(s.pos, 0, s.left) : []), [myTurn, s.pos, s.left]);
  const sel = s.sel ?? (myTurn && s.pos.bar[0] && legal.length ? BAR[0] : null);
  const dests = useMemo(() => (sel != null && myTurn ? destinations(s.pos, 0, s.left, sel) : new Map()), [sel, myTurn, s.pos, s.left]);
  const sources = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);

  const doMove = (path) => {
    if (path.some((m) => m.hit)) audio.hit();
    else if (path.some((m) => m.to === OFF[s.turn])) audio.bearOff();
    else audio.move();
    dispatch({ type: "move", path });
  };

  const roll = () => {
    audio.unlock();
    if (!(s.phase === "opening" || (s.phase === "roll" && s.turn === 0))) return;
    audio.roll();
    dispatch({ type: "rollStart" });
  };

  /* --- every timed step of the turn flow lives here (one timer, always cleaned up) */
  useEffect(() => {
    if (screen !== "play") return;
    let t;
    const at = (ms, fn) => { t = setTimeout(fn, ms); };
    const { phase, turn } = s;
    if (phase === "rolling" || phase === "openingRoll") {
      at(650, () => {
        const dice = forced.current || [rollDie(), rollDie()];
        forced.current = null;
        dispatch({ type: "rollEnd", dice });
      });
    } else if (phase === "openingDone") at(1500, () => dispatch({ type: "begin" }));
    else if (phase === "nomove") at(1600, () => dispatch({ type: "pass" }));
    else if (phase === "done") at(turn === 0 ? 450 : 650, () => dispatch({ type: "pass" }));
    else if (phase === "roll" && turn === 1) at(550, () => { audio.roll(); dispatch({ type: "rollStart" }); });
    else if (phase === "move" && turn === 1) {
      const key = `${s.id}:${s.turnNo}`;
      if (plan.current.key !== key) plan.current = { key, moves: chooseTurn(s.pos, 1, s.left, s.difficulty), i: 0 };
      at(600, () => {
        const m = plan.current.moves[plan.current.i++];
        if (m) doMove([m]); else dispatch({ type: "pass" });
      });
    } else if (phase === "over") audio.end(s.winner === 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, s.phase, s.turn, s.turnNo, s.left]);

  if (TEST) window.__bg = { state: () => s, dispatch, forceDice: (a, b) => { forced.current = [a, b]; }, legal, dests, roll, click: (t) => clickAt(t) };

  const warn = (text) => { dispatch({ type: "msg", msg: { text, tone: "warn" } }); setShake((n) => n + 1); };

  function clickAt(target) {
    audio.unlock();
    if (s.phase === "opening" || (s.phase === "roll" && s.turn === 0)) return warn("Roll the dice first.");
    if (!myTurn) return;
    if (sel != null && dests.has(target)) return doMove(dests.get(target));
    if (target === sel && s.sel != null) return dispatch({ type: "select", from: null });
    if (sources.has(target)) return dispatch({ type: "select", from: target });
    if (s.pos.bar[0] && target !== BAR[0]) return warn("You must enter your checker from the bar first.");
    const mine = target >= 1 && target <= 24 && s.pos.pts[target] > 0;
    if (mine) return warn("That checker has no legal move with these dice.");
    if (sel != null) return warn(target === OFF[0] ? "You can't bear off yet — all checkers must be home." : "That point is blocked or out of reach.");
    warn("Select one of your ivory checkers.");
  }

  /* --- checker layout */
  const checkers = useMemo(() => {
    const out = [];
    s.ids.forEach((list, sl) => {
      const n = list.length;
      list.forEach((id, k) => {
        let x, y, off = false;
        if (sl <= 24) {
          const step = stackStep(n, 300);
          x = pointX(sl);
          y = isTop(sl) ? TOP + R + k * step : BOT - R - k * step;
        } else if (sl <= 26) {
          const step = stackStep(n, 260);
          x = (BAR0 + BAR1) / 2;
          y = sl === 25 ? MID + 50 + k * step : MID - 50 - k * step;
        } else {
          off = true;
          x = TRAY;
          y = sl === 27 ? BOT - 10 - k * 19 : TOP + 10 + k * 19;
        }
        out[id] = { id, x, y, off, z: k + 1, top: k === n - 1, sl };
      });
    });
    return out;
  }, [s.ids]);

  const hits = [];
  for (let p = 1; p <= 24; p++) hits.push(p);
  const target = (sl) => (sl === 25 ? BAR[0] : sl === 27 ? OFF[0] : sl);
  const destMarks = [...dests.keys()].map((to) => {
    if (to === OFF[0]) return null;
    const n = Math.max(s.pos.pts[to], 0);
    const step = stackStep(n + 1, 300);
    return { to, x: pointX(to), y: isTop(to) ? TOP + R + n * step : BOT - R - n * step, hit: s.pos.pts[to] === -1 };
  }).filter(Boolean);

  /* --- dice */
  const dicePlayed = s.dice ? diceToPlay(s.dice[0], s.dice[1]) : [];
  const rolling = s.phase === "rolling" || s.phase === "openingRoll";
  const showOpening = s.phase === "opening" || s.phase === "openingRoll" || s.phase === "openingDone";
  let diceEls = null;
  if (showOpening) {
    diceEls = s.opening || rolling ? (
      <>
        <Die value={s.opening?.[1]} dark rolling={rolling} x={236} y={MID} />
        <Die value={s.opening?.[0]} rolling={rolling} x={704} y={MID} delay={60} />
      </>
    ) : null;
  } else if (rolling || (s.dice && s.phase !== "roll")) {
    const cx = s.turn === 0 ? 704 : 236;
    const list = rolling ? [0, 0] : dicePlayed;
    const usedN = list.length - s.left.length;
    diceEls = list.map((v, i) => {
      const used = !rolling && (list.length === 4 ? i < usedN : !s.left.includes(v));
      return <Die key={`${s.turnNo}-${i}`} value={v} dark={s.turn === 1} used={used} rolling={rolling} x={cx + (i - (list.length - 1) / 2) * 66} y={MID} delay={i * 50} />;
    });
  }
  const canRoll = s.phase === "opening" || (s.phase === "roll" && s.turn === 0);

  const pips = [pipCount(s.pos, 0), pipCount(s.pos, 1)];
  const offTarget = dests.has(OFF[0]);
  const gammon = s.winner >= 0 && s.pos.off[1 - s.winner] === 0;

  const start = () => { audio.unlock(); dispatch({ type: "new", difficulty }); setScreen("play"); };

  return (
    <div className={`bgc bgc--${screen}`}>
      {screen !== "play" && (
        <div className="bgc-menu" key={screen}>
          {screen === "menu" ? (
            <div className="bgc-card">
              <div className="bgc-logo" aria-hidden="true"><span /><span /><span /></div>
              <h1>Backgammon <em>Classic</em></h1>
              <p className="bgc-tag">ROLL • MOVE • WIN</p>
              <div className="bgc-levels" role="radiogroup" aria-label="Difficulty">
                {LEVELS.map((l) => (
                  <button key={l} role="radio" aria-checked={difficulty === l} className={difficulty === l ? "is-on" : ""} onClick={() => setDifficulty(l)}>
                    {l}
                  </button>
                ))}
              </div>
              <button className="bgc-btn bgc-btn--gold" onClick={start}>Play</button>
              <button className="bgc-btn" onClick={() => setScreen("how")}>How to Play</button>
            </div>
          ) : (
            <div className="bgc-card bgc-card--how">
              <h2>How to Play</h2>
              <ul>
                <li>You play <b>ivory</b> and move from point 24 down to 1. Your home board is bottom-right.</li>
                <li>Roll, then click a checker and a highlighted point. Dice can be combined if the stop in between is open.</li>
                <li>Doubles are played four times. You must use both dice when you can — or the higher one if only one fits.</li>
                <li>A point with two or more enemy checkers is blocked. Landing on a single one <b>hits</b> it to the bar.</li>
                <li>Checkers on the bar must re-enter in the opponent's home board before anything else moves.</li>
                <li>Once all 15 are home, bear them off into the tray. First to bear off all 15 wins.</li>
              </ul>
              <button className="bgc-btn bgc-btn--gold" onClick={() => setScreen("menu")}>Back</button>
            </div>
          )}
        </div>
      )}

      {screen === "play" && (
        <>
          <header className="bgc-hud">
            <div className={`bgc-plate${s.turn === 0 && s.phase !== "over" && !showOpening ? " is-active" : ""}`}>
              <span className="bgc-chip" />
              <div><b>You</b><small>Pips {pips[0]} · Off {s.pos.off[0]}{s.pos.bar[0] ? ` · Bar ${s.pos.bar[0]}` : ""}</small></div>
            </div>
            <p key={shake} className={`bgc-status bgc-status--${s.msg.tone}${s.msg.tone === "warn" ? " is-shake" : ""}`} aria-live="polite">{s.msg.text}</p>
            <div className={`bgc-plate bgc-plate--ai${s.turn === 1 && s.phase !== "over" && !showOpening ? " is-active" : ""}`}>
              <div><b>AI · {s.difficulty}</b><small>Pips {pips[1]} · Off {s.pos.off[1]}{s.pos.bar[1] ? ` · Bar ${s.pos.bar[1]}` : ""}</small></div>
              <span className="bgc-chip bgc-chip--dark" />
            </div>
            <button className="bgc-menu-btn" onClick={() => setScreen("menu")}>Menu</button>
          </header>

          <div className="bgc-stage">
            <div className="bgc-board">
              <svg viewBox={`0 0 ${W} ${H}`} className="bgc-svg" role="img" aria-label="Backgammon board">
                <BoardArt />
                {sel != null && sel >= 1 && sel <= 24 && (
                  <rect className="bgc-selcol" x={pointX(sel) - PW / 2 + 2} y={isTop(sel) ? TOP : BOT - 300} width={PW - 4} height="300" rx="6" />
                )}
                {[...dests.keys()].filter((t) => t >= 1 && t <= 24).map((t) => (
                  <path key={t} className="bgc-dest-tri" d={`M${pointX(t) - PW / 2 + 2},${isTop(t) ? TOP : BOT} L${pointX(t) + PW / 2 - 2},${isTop(t) ? TOP : BOT} L${pointX(t)},${isTop(t) ? TOP + 262 : BOT - 262} Z`} />
                ))}
                {offTarget && <rect className="bgc-dest-tray" x={TRAY - 30} y={MID} width="60" height={BOT - MID} rx="6" />}
                {destMarks.map((d) => <circle key={d.to} className={`bgc-dest${d.hit ? " is-hit" : ""}`} cx={d.x} cy={d.y} r={R - 4} />)}
                {/* click targets */}
                {hits.map((p) => (
                  <rect key={p} className="bgc-hit" x={pointX(p) - PW / 2} y={isTop(p) ? TOP : MID} width={PW} height={MID - TOP} onClick={() => clickAt(p)} />
                ))}
                <rect className="bgc-hit" x={BAR0} y={TOP} width={BAR1 - BAR0} height={BOT - TOP} onClick={() => clickAt(target(25))} />
                <rect className="bgc-hit" x={TRAY - 32} y={TOP} width="64" height={BOT - TOP} onClick={() => clickAt(target(27))} />
              </svg>

              <div className="bgc-layer">
                {checkers.map((c) => c && (
                  <div
                    key={c.id}
                    className={`bgc-ck${c.id >= 15 ? " bgc-ck--dark" : ""}${c.off ? " is-off" : ""}${c.id === s.last ? " is-last" : ""}${
                      c.top && myTurn && !c.off && sources.has(target(c.sl)) && sel == null ? " is-movable" : ""}${c.top && sel != null && target(c.sl) === sel ? " is-sel" : ""}`}
                    style={{ left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%`, zIndex: c.id === s.last ? 40 : c.z }}
                  />
                ))}
                {diceEls}
                {canRoll && (
                  <button className="bgc-roll" style={{ left: `${(704 / W) * 100}%`, top: `${((s.phase === "opening" && s.opening ? MID + 70 : MID) / H) * 100}%` }} onClick={roll}>
                    {s.phase === "opening" ? (s.opening ? "Roll again" : "Opening roll") : "Roll dice"}
                  </button>
                )}
              </div>

              {s.phase === "over" && (
                <div className="bgc-result">
                  <div className="bgc-card">
                    <h2>{s.winner === 0 ? "You Win" : "You Lose"}</h2>
                    <p className="bgc-tag">{gammon ? "GAMMON!" : s.winner === 0 ? "ALL 15 BORNE OFF" : `THE AI BORE OFF FIRST · YOU HAD ${s.pos.off[0]} OFF`}</p>
                    <button className="bgc-btn bgc-btn--gold" onClick={() => dispatch({ type: "new" })}>Play Again</button>
                    <button className="bgc-btn" onClick={() => setScreen("menu")}>Main Menu</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
