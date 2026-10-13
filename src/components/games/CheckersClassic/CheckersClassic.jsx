/**
 * Checkers Classic — Russian checkers (8×8) vs an AI or two players on one device.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Rules live in rules.js and the AI in ai.js; this file is
 * the turn flow (one reducer = single source of truth) and the board view:
 * a CSS grid board with absolutely placed pieces, so moves glide with CSS
 * transitions. Captures are played one jump at a time ("step" actions) for
 * both the player and the AI; jumped pieces stay on the board, dimmed, until
 * the sequence ends — exactly as the rules treat them.
 *
 * White (bottom) moves first; vs the AI you are white. `restartSignal`
 * (GamePlayer Restart) starts a new game in the current mode, `muted`
 * silences the synth. Difficulty is remembered in localStorage
 * (`checkers-classic-difficulty`).
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./CheckersClassic.css";
import {
  newGame, legalMoves, nextSteps, matching, playMove, notation, count, isDark, sqName, WHITE, BLACK,
} from "./rules.js";
import { chooseMove } from "./ai.js";
import { audio } from "./audio.js";

const STORE_KEY = "checkers-classic-difficulty";
const LEVELS = ["easy", "medium", "hard"];
const CELLS = Array.from({ length: 64 }, (_, i) => i);
const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("cktest");

/* ------------------------------------------------------------ turn flow */
const buildPieces = (b) => b.flatMap((v, sq) => (v ? [{ sq, v }] : [])).map((p, id) => ({ ...p, id, dead: false, marked: false, crowned: 0 }));

function newMatch(mode, difficulty, pos) {
  const g = newGame(pos);
  return { id: Math.random(), mode, difficulty, g, pcs: buildPieces(g.pos.b), sel: null, pend: null, last: null, ply: 0, hist: [], offer: 0, result: null };
}

function reducer(s, a) {
  switch (a.type) {
    case "new": return newMatch(a.mode ?? s.mode, a.difficulty ?? s.difficulty, a.pos);
    case "select": return s.pend || s.result ? s : { ...s, sel: a.sq };
    case "step": {
      if (s.result) return s;
      const moves = legalMoves(s.g.pos);
      const from = s.pend ? s.pend.from : a.from;
      const prefix = s.pend ? s.pend.path : [];
      const info = nextSteps(s.g.pos, moves, from, prefix).get(a.to);
      if (!info) return s;
      const path = [...prefix, a.to];
      const side = s.g.pos.side;
      const mover = s.pend ? s.pend.id : s.pcs.find((p) => !p.dead && p.sq === from).id;
      let pcs = s.pcs.map((p) => {
        if (p.id === mover) return { ...p, sq: a.to, v: info.crown ? 2 * side : p.v, crowned: info.crown ? s.ply * 16 + path.length : p.crowned };
        if (p.sq === info.cap && !p.dead && !p.marked) return { ...p, marked: true };
        return p;
      });
      const done = matching(moves, from, path).find((m) => m.path.length === path.length);
      const last = { from: s.pend ? s.last.from : from, to: a.to, mover };
      if (!done) return { ...s, pcs, sel: from, pend: { from, id: mover, path }, last };
      pcs = pcs.map((p) => (p.marked ? { ...p, marked: false, dead: true } : p));
      const g = playMove(s.g, done);
      return { ...s, g, pcs, sel: null, pend: null, last, ply: s.ply + 1, hist: [...s.hist, notation(done)], offer: 0, result: g.result };
    }
    case "resign": return s.result ? s : { ...s, pend: null, result: { winner: -a.side, reason: `${a.side === WHITE ? "White" : "Black"} resigned`, resign: a.side } };
    case "offer": return s.result ? s : { ...s, offer: a.side };
    case "answer": return a.accept && s.offer ? { ...s, offer: 0, result: { winner: 0, reason: "Draw by agreement" } } : { ...s, offer: 0 };
    default: return s;
  }
}

function loadDifficulty() {
  try { const d = localStorage.getItem(STORE_KEY); return LEVELS.includes(d) ? d : "medium"; } catch { return "medium"; }
}

/* ------------------------------------------------------------ small pieces of UI */
const Disc = ({ dark, small }) => <span className={`ckc-chip${dark ? " ckc-chip--dark" : ""}${small ? " ckc-chip--sm" : ""}`} />;

function Plate({ side, name, active, left, taken }) {
  return (
    <div className={`ckc-plate${active ? " is-active" : ""}`}>
      <Disc dark={side === BLACK} />
      <div className="ckc-plate-txt">
        <b>{name}</b>
        <small>{left} left · {taken} taken</small>
        <span className="ckc-taken" aria-hidden="true">
          {Array.from({ length: taken }, (_, i) => <Disc key={i} dark={side === WHITE} small />)}
        </span>
      </div>
    </div>
  );
}

const Crown = () => (
  <svg className="ckc-crown" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5z" />
    <rect x="5" y="19" width="14" height="2" rx="1" />
  </svg>
);

/* ------------------------------------------------------------ component */
export default function CheckersClassic({ restartSignal = 0, muted = false }) {
  const [screen, setScreen] = useState("menu"); // menu | how | play
  const [difficulty, setDifficulty] = useState(loadDifficulty);
  const [s, dispatch] = useReducer(reducer, null, () => newMatch("ai", difficulty));
  const [warn, setWarn] = useState(null);
  const [armed, setArmed] = useState(false); // resign needs a second click
  const plan = useRef({ key: "", move: null });

  useEffect(() => { audio.setMuted(muted); }, [muted]);
  useEffect(() => () => audio.dispose(), []);
  useEffect(() => { try { localStorage.setItem(STORE_KEY, difficulty); } catch { /* ignore */ } }, [difficulty]);

  const seen = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seen.current) return;
    seen.current = restartSignal;
    if (screen === "play") dispatch({ type: "new" });
  }, [restartSignal, screen]);

  const side = s.g.pos.side;
  const aiTurn = s.mode === "ai" && side === BLACK;
  const myTurn = screen === "play" && !s.result && !aiTurn;
  const moves = useMemo(() => legalMoves(s.g.pos), [s.g.pos]);
  const forced = moves.length > 0 && moves[0].caps.length > 0;
  const sources = useMemo(() => [...new Set(moves.map((m) => m.from))], [moves]);
  const sel = s.pend ? s.pend.from : s.sel ?? (myTurn && sources.length === 1 ? sources[0] : null);
  const steps = useMemo(
    () => (sel != null && myTurn ? nextSteps(s.g.pos, moves, sel, s.pend ? s.pend.path : []) : new Map()),
    [sel, myTurn, s.g.pos, moves, s.pend],
  );
  const threats = useMemo(() => new Set([...steps.values()].map((x) => x.cap).filter((x) => x != null)), [steps]);
  const selSq = s.pend ? s.pend.path[s.pend.path.length - 1] : sel;

  useEffect(() => { setWarn(null); setArmed(false); }, [s.ply, s.id]);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  function doStep(from, to) {
    const info = nextSteps(s.g.pos, moves, s.pend ? s.pend.from : from, s.pend ? s.pend.path : []).get(to);
    if (!info) return;
    audio.unlock();
    if (info.cap != null) audio.capture(); else audio.move();
    if (info.crown) audio.promote();
    dispatch({ type: "step", from, to });
  }

  /* --- AI: think once per turn, then play the sequence one jump at a time */
  useEffect(() => {
    if (screen !== "play" || s.result || !aiTurn) return;
    const key = `${s.id}:${s.ply}`;
    if (plan.current.key !== key) plan.current = { key, move: null };
    const t = setTimeout(() => {
      const p = plan.current;
      if (!p.move) p.move = chooseMove(s.g.pos, s.difficulty);
      if (!p.move) return;
      doStep(p.move.from, p.move.path[s.pend ? s.pend.path.length : 0]);
    }, s.pend ? 430 : 520);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, s.id, s.ply, s.pend, s.result, aiTurn]);

  useEffect(() => {
    if (!s.result) return;
    audio.end(s.result.winner === 0 ? "draw" : s.mode === "ai" && s.result.winner === BLACK ? "lose" : "win");
  }, [s.result, s.mode]);

  const say = (text) => { audio.warn(); setWarn({ text, n: Math.random() }); };

  function clickSq(sq) {
    audio.unlock();
    if (!myTurn) return;
    if (sel != null && steps.has(sq)) return doStep(sel, sq);
    if (s.pend) return say("Finish the capture — jump again with the selected piece.");
    if (sources.includes(sq)) { setWarn(null); return dispatch({ type: "select", sq: sq === s.sel ? null : sq }); }
    if (Math.sign(s.g.pos.b[sq]) === side) return say(forced ? "Capturing is mandatory — pick a piece that can capture." : "That piece has no legal move.");
    if (sel != null) return say("Not a legal square for that piece.");
  }

  if (TEST) window.__ck = { state: () => s, dispatch, click: (sq) => clickSq(sq), moves, steps, sel };

  /* --- labels */
  const left = count(s.g.pos.b);
  const n = { [WHITE]: left[WHITE].men + left[WHITE].kings, [BLACK]: left[BLACK].men + left[BLACK].kings };
  const names = s.mode === "ai" ? { [WHITE]: "You", [BLACK]: `AI · ${s.difficulty}` } : { [WHITE]: "White", [BLACK]: "Black" };
  let status;
  if (warn) status = { text: warn.text, tone: "warn" };
  else if (s.result) status = { text: s.result.reason, tone: "info" };
  else if (s.offer) status = { text: `${s.offer === WHITE ? "White" : "Black"} offers a draw.`, tone: "info" };
  else if (s.pend) status = { text: aiTurn ? "AI is capturing…" : "Keep capturing — jump again.", tone: "gold" };
  else if (aiTurn) status = { text: "AI is thinking…", tone: "info" };
  else {
    const who = s.mode === "ai" ? "Your move" : `${names[side]} to move`;
    const extra = sel != null ? ` · ${sqName(sel)} selected, ${steps.size} move${steps.size === 1 ? "" : "s"}` : forced ? " · capture is mandatory" : "";
    status = { text: who + extra, tone: forced ? "gold" : "info" };
  }

  let heading = "Draw";
  if (s.result?.winner) heading = s.mode === "ai" ? (s.result.winner === WHITE ? "You Win" : "You Lose") : `${s.result.winner === WHITE ? "White" : "Black"} Wins`;
  const won = s.result && s.result.winner !== 0 && !(s.mode === "ai" && s.result.winner === BLACK);

  const histRows = [];
  for (let i = 0; i < s.hist.length; i += 2) histRows.push([s.hist[i], s.hist[i + 1]]);
  const histEnd = useRef(null);
  useEffect(() => { histEnd.current?.scrollIntoView({ block: "nearest" }); }, [s.hist.length]);

  const start = (mode) => { audio.unlock(); dispatch({ type: "new", mode, difficulty }); setScreen("play"); };
  const resign = () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    dispatch({ type: "resign", side: s.mode === "ai" ? WHITE : side });
  };

  return (
    <div className={`ckc ckc--${screen}`}>
      {screen !== "play" && (
        <div className="ckc-menu" key={screen}>
          {screen === "menu" ? (
            <div className="ckc-card">
              <div className="ckc-logo" aria-hidden="true"><Disc /><Disc dark /><Disc /></div>
              <h1>Checkers <em>Classic</em></h1>
              <p className="ckc-tag">MOVE • CAPTURE • WIN</p>
              <button className="ckc-btn ckc-btn--gold" onClick={() => start("ai")}>Play vs AI</button>
              <div className="ckc-levels" role="radiogroup" aria-label="Difficulty">
                {LEVELS.map((l) => (
                  <button key={l} role="radio" aria-checked={difficulty === l} className={difficulty === l ? "is-on" : ""} onClick={() => setDifficulty(l)}>
                    {l}
                  </button>
                ))}
              </div>
              <button className="ckc-btn" onClick={() => start("local")}>Local 2 Players</button>
              <button className="ckc-btn" onClick={() => setScreen("how")}>How to Play</button>
            </div>
          ) : (
            <div className="ckc-card ckc-card--how">
              <h2>How to Play</h2>
              <ul>
                <li>Russian checkers on the dark squares. <b>White</b> moves first; vs the AI you play white from the bottom.</li>
                <li>Men step one square diagonally forward. Click a piece, then a highlighted square.</li>
                <li><b>Capturing is mandatory</b> — forward or backward, by jumping an enemy piece onto the empty square behind it.</li>
                <li>Keep jumping while you can; you choose which capture sequence to take (it need not be the longest).</li>
                <li>Captured pieces leave the board only when the sequence ends — you can't jump them twice or over them.</li>
                <li>Reach the far row to become a <b>king</b>: it flies any distance diagonally and captures from afar. A man crowned mid-capture keeps capturing as a king.</li>
                <li>Win by taking every enemy piece or leaving it no move. Repeating a position three times, and long king-only endgames, are draws.</li>
              </ul>
              <button className="ckc-btn ckc-btn--gold" onClick={() => setScreen("menu")}>Back</button>
            </div>
          )}
        </div>
      )}

      {screen === "play" && (
        <div className="ckc-play">
          <aside className="ckc-side ckc-side--players">
            <Plate side={BLACK} name={names[BLACK]} active={!s.result && side === BLACK} left={n[BLACK]} taken={12 - n[WHITE]} />
            <p key={warn?.n ?? "s"} className={`ckc-status ckc-status--${status.tone}`} aria-live="polite">{status.text}</p>
            <Plate side={WHITE} name={names[WHITE]} active={!s.result && side === WHITE} left={n[WHITE]} taken={12 - n[BLACK]} />
          </aside>

          <div className="ckc-boardwrap">
            <div className="ckc-board">
              <div className="ckc-grid">
                {CELLS.map((i) => {
                  if (!isDark(i)) return <div key={i} className="ckc-sq" />;
                  const cls = `ckc-sq is-dark${i === selSq ? " is-sel" : ""}${steps.has(i) ? (steps.get(i).cap != null ? " is-dest is-jump" : " is-dest") : ""}${
                    s.last && (i === s.last.from || i === s.last.to) ? " is-last" : ""}`;
                  return <button key={i} className={cls} aria-label={sqName(i)} onClick={() => clickSq(i)} />;
                })}
                <div className="ckc-layer">
                  {s.pcs.map((p) => (
                    <div
                      key={`${s.id}-${p.id}`}
                      className={`ckc-pc${p.v < 0 ? " ckc-pc--dark" : ""}${p.dead ? " is-dead" : ""}${p.marked ? " is-marked" : ""}${
                        threats.has(p.sq) && !p.dead && !p.marked ? " is-threat" : ""}${myTurn && sel == null && sources.includes(p.sq) && !p.dead ? " is-movable" : ""}${
                        p.sq === selSq && !p.dead ? " is-sel" : ""}${s.last?.mover === p.id ? " is-mover" : ""}${won && Math.sign(p.v) === s.result.winner && !p.dead ? " is-cheer" : ""}`}
                      style={{ left: `${(p.sq & 7) * 12.5}%`, top: `${(p.sq >> 3) * 12.5}%` }}
                    >
                      <span className="ckc-disc">
                        {Math.abs(p.v) === 2 && <Crown key={`c${p.crowned}`} />}
                        {p.crowned > 0 && <i key={`f${p.crowned}`} className="ckc-flash" />}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="ckc-files" aria-hidden="true">{"abcdefgh".split("").map((f) => <span key={f}>{f}</span>)}</div>
              <div className="ckc-ranks" aria-hidden="true">{[8, 7, 6, 5, 4, 3, 2, 1].map((r) => <span key={r}>{r}</span>)}</div>
            </div>
          </div>

          <aside className="ckc-side ckc-side--log">
            <div className="ckc-log">
              <h3>Moves</h3>
              <ol>
                {histRows.map(([w, b], i) => <li key={i}><span>{i + 1}.</span><b>{w}</b><b>{b ?? ""}</b></li>)}
                <li ref={histEnd} className="ckc-log-end" />
              </ol>
            </div>
            <div className="ckc-actions">
              {s.offer ? (
                <>
                  <button className="ckc-act ckc-act--gold" onClick={() => dispatch({ type: "answer", accept: true })}>Accept draw</button>
                  <button className="ckc-act" onClick={() => dispatch({ type: "answer", accept: false })}>Decline</button>
                </>
              ) : (
                <>
                  {s.mode === "local" && <button className="ckc-act" disabled={!!s.result || !!s.pend} onClick={() => dispatch({ type: "offer", side })}>Offer draw</button>}
                  <button className={`ckc-act${armed ? " is-armed" : ""}`} disabled={!!s.result || (s.mode === "ai" && aiTurn)} onClick={resign}>{armed ? "Confirm resign" : "Resign"}</button>
                </>
              )}
              <button className="ckc-act" onClick={() => setScreen("menu")}>Menu</button>
            </div>
          </aside>

          {s.result && (
            <div className="ckc-result">
              {won && <div className="ckc-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</div>}
              <div className="ckc-card">
                <h2>{heading}</h2>
                <p className="ckc-tag">{s.result.reason.toUpperCase()}</p>
                <p className="ckc-final">{n[WHITE]} white · {n[BLACK]} black left · {s.ply} move{s.ply === 1 ? "" : "s"} played</p>
                <button className="ckc-btn ckc-btn--gold" onClick={() => dispatch({ type: "new" })}>Play Again</button>
                <button className="ckc-btn" onClick={() => setScreen("menu")}>Main Menu</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
