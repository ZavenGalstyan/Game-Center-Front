/**
 * The poker table: felt, seats, hole cards, board, pot, bets, dealer button.
 *
 * Pure view of the engine state. All positions are percentages of a fixed
 * 16:9 frame, so the layout scales without seats ever overlapping. CSS
 * animations are keyed on engine facts (hand number, street, seat) and carry
 * their start offsets in custom properties; they never feed back into rules.
 */
import { useMemo } from "react";
import { PlayingCard, ChipStack, Avatar, fmt } from "./pieces.jsx";
import { evaluate, handName, scoreHand } from "../engine/evaluator.js";
import { buildPots } from "../engine/pots.js";
import { potTotal, potCollected } from "../engine/table.js";
import { PROFILES } from "../engine/ai.js";

const CENTER = [50, 47.5];
const POT = [50, 31.5];
const H = 0.5625; // frame height / width

/** [seatX, seatY, betX, betY] in % of the frame, human first, clockwise. */
const LAYOUTS = {
  2: [[50, 88, 38, 71], [50, 9.5, 61, 23]],
  3: [[50, 88, 38, 71], [12, 27, 25, 36], [88, 27, 75, 36]],
  4: [[50, 88, 38, 71], [8, 45, 20, 47], [50, 9.5, 61, 23], [92, 45, 80, 47]],
  5: [[50, 88, 38, 71], [9, 63, 21, 58], [22, 11, 31, 25], [78, 11, 69, 25], [91, 63, 79, 58]],
  6: [[50, 88, 38, 71], [9, 64, 21, 59], [13, 24, 25, 33], [50, 9.5, 61, 23], [87, 24, 75, 33], [91, 64, 79, 59]],
};
export const layoutFor = (n) => LAYOUTS[Math.max(2, Math.min(6, n))];

const lerp = (a, b, t) => a + (b - a) * t;

function actionLabel(a) {
  if (!a) return null;
  switch (a.type) {
    case "sb": return `SB ${fmt(a.amount)}`;
    case "bb": return `BB ${fmt(a.amount)}`;
    case "check": return "Check";
    case "call": return `Call ${fmt(a.amount)}`;
    case "bet": return `Bet ${fmt(a.to)}`;
    case "raise": return `Raise ${fmt(a.to)}`;
    case "allin": return "All-in";
    case "fold": return "Fold";
    default: return null;
  }
}

function TimerRing({ seconds, seq, paused }) {
  return (
    <svg key={seq} className="thp-timer" viewBox="0 0 100 100" aria-hidden="true" style={{ "--t": `${seconds}s`, animationPlayState: paused ? "paused" : "running" }}>
      <circle cx="50" cy="50" r="46" />
      <circle className="thp-timer__run" cx="50" cy="50" r="46" style={{ animationPlayState: paused ? "paused" : "running" }} />
    </svg>
  );
}

export default function TableView({ table, cosmetics, settings, timerSeconds, timerKey, paused, humanName }) {
  const t = table;
  const n = t.players.length;
  const L = layoutFor(n);
  const res = t.phase === "complete" ? t.result : null;
  const back = cosmetics.cardBack;

  // cards that make the winning hand(s), for highlighting
  const winCards = useMemo(() => {
    if (!res || !res.showdown) return null;
    const set = new Set();
    res.winners.forEach((w) => res.hands[w]?.best.forEach((c) => set.add(c)));
    return set;
  }, [res]);

  // deal order index of each seat (for staggered deal animation)
  const dealOrder = useMemo(() => {
    const order = [];
    for (let k = 1; k <= n; k++) { const i = (t.dealer + k) % n; if (t.players[i].inHand) order.push(i); }
    return order;
  }, [t.dealer, t.handNo, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const collected = t.phase === "complete" ? 0 : potCollected(t);
  const showPots = t.phase !== "complete" && t.players.some((p) => p.allIn) ? buildPots(t.players.map((p) => ({ total: p.total - p.bet, folded: p.folded }))) : [];
  const collecting = t.phase === "street-end" || t.phase === "showdown";

  const dealerSpot = (i) => {
    const [sx, sy] = L[i];
    let x = lerp(sx, CENTER[0], 0.24), y = lerp(sy, CENTER[1], 0.24);
    if (Math.abs(sx - 50) < 5) x += i === 0 ? 10 : -9;
    return [x, y];
  };

  return (
    <div className="thp-table">
      <div className="thp-rail">
        <div className="thp-felt">
          <div className="thp-felt__logo" aria-hidden="true">
            <span>TEXAS HOLD'EM</span>
            <small>BET • BLUFF • WIN</small>
          </div>
          <div className="thp-felt__line" aria-hidden="true" />
        </div>
      </div>

      {/* pot */}
      <div className="thp-pot" style={{ left: `${POT[0]}%`, top: `${POT[1]}%` }} aria-live="polite">
        {collected > 0 && <ChipStack key={`pot-${t.handNo}`} amount={collected} label={false} columns={3} className="thp-pot__chips" />}
        <span className="thp-pot__label">
          {res ? "Pot awarded" : <>Pot <b>{fmt(potTotal(t))}</b></>}
        </span>
        {showPots.length > 1 && (
          <span className="thp-pot__sides">
            {showPots.map((p, k) => <i key={k}>{k === 0 ? "Main" : `Side ${k}`} {fmt(p.amount)}</i>)}
          </span>
        )}
      </div>

      {/* board */}
      <div className="thp-board" style={{ left: `${CENTER[0]}%`, top: `${CENTER[1]}%` }}>
        {Array.from({ length: 5 }, (_, k) => {
          const c = t.board[k];
          if (c == null) return <span key={`e${k}`} className="thp-slot" />;
          const delay = k < 3 ? k * 0.14 : 0;
          return (
            <PlayingCard
              key={`${t.handNo}-b${k}`}
              card={c}
              back={back}
              size="md"
              anim="flip"
              style={{ "--d": `${delay}s` }}
              win={winCards ? winCards.has(c) : false}
              dim={winCards ? !winCards.has(c) : false}
            />
          );
        })}
      </div>

      {/* bets in front of players */}
      {t.players.map((p, i) => {
        if (p.bet <= 0 || !L[i]) return null;
        const [sx, sy, bx, by] = L[i];
        return (
          <div
            key={`bet-${t.handNo}-${t.street}-${i}`}
            className={`thp-bet${collecting ? " is-collect" : ""}`}
            style={{
              left: `${bx}%`, top: `${by}%`,
              "--fx": (sx - bx).toFixed(2), "--fy": ((sy - by) * H).toFixed(2),
              "--tx": (POT[0] - bx).toFixed(2), "--ty": ((POT[1] - by) * H).toFixed(2),
            }}
          >
            <ChipStack amount={p.bet} />
          </div>
        );
      })}

      {/* pot → winners */}
      {res && res.awards.map((a, i) => {
        if (a <= 0 || !L[i]) return null;
        const [, , bx, by] = L[i];
        return (
          <div
            key={`win-${t.handNo}-${i}`}
            className="thp-bet thp-award"
            style={{ left: `${bx}%`, top: `${by}%`, "--fx": (POT[0] - bx).toFixed(2), "--fy": ((POT[1] - by) * H).toFixed(2) }}
          >
            <ChipStack amount={a} />
          </div>
        );
      })}

      {/* dealer button (moves between hands) */}
      {t.dealer >= 0 && L[t.dealer] && (
        <span className="thp-dealer" style={{ left: `${dealerSpot(t.dealer)[0]}%`, top: `${dealerSpot(t.dealer)[1]}%` }} aria-label="Dealer button">D</span>
      )}

      {/* seats */}
      {t.players.map((p, i) => {
        if (!L[i]) return null;
        const [sx, sy] = L[i];
        const human = i === 0;
        const active = t.phase === "betting" && t.toAct === i;
        const winner = res && res.winners.includes(i);
        const prof = PROFILES[p.profile];
        const showFace = human || p.revealed;
        const below = !human && sy < 30;
        const order = dealOrder.indexOf(i);
        const label = actionLabel(p.lastAction);
        let made = null;
        if (p.inHand && !p.folded && p.hole.length === 2 && (p.revealed || (human && (t.phase === "showdown" || t.phase === "complete"))) && t.board.length >= 3) {
          made = res?.hands[i] ? res.hands[i].name : handName(scoreHand([...p.hole, ...t.board]));
        }
        return (
          <div
            key={p.id}
            className={`thp-seat${human ? " is-human" : ""}${active ? " is-active" : ""}${p.folded ? " is-folded" : ""}${p.out ? " is-out" : ""}${winner ? " is-winner" : ""}${below ? " cards-below" : ""}${!p.inHand && !p.out ? " is-sitting" : ""}`}
            style={{ left: `${sx}%`, top: `${sy}%` }}
          >
            {p.inHand && p.hole.length > 0 && (
              <div className={`thp-hole${human ? " thp-hole--human" : ""}`}>
                {p.hole.map((c, k) => (
                  <PlayingCard
                    key={`${t.handNo}-${k}`}
                    card={showFace ? c : null}
                    faceUp={showFace}
                    back={back}
                    size={human ? "lg" : "sm"}
                    anim="deal"
                    style={{
                      "--d": `${(k * dealOrder.length + order) * 0.08}s`,
                      "--dx": (CENTER[0] - sx).toFixed(2),
                      "--dy": ((CENTER[1] - sy) * H).toFixed(2),
                    }}
                    win={winCards ? winCards.has(c) && winner : false}
                    dim={!!winCards && !human && !winner && p.revealed}
                  />
                ))}
                {made && <span className={`thp-made${winner ? " is-win" : ""}`}>{made}</span>}
              </div>
            )}
            <div className="thp-plate">
              <Avatar name={p.name} color={human ? "#c9a54a" : prof?.color} frame={human ? cosmetics.frame : null} human={human}>
                {active && timerSeconds > 0 && human && <TimerRing seconds={timerSeconds} seq={timerKey} paused={paused} />}
                {active && !human && <span className="thp-thinking" aria-hidden="true"><i /><i /><i /></span>}
              </Avatar>
              <div className="thp-plate__txt">
                <b>{human ? humanName : p.name}</b>
                <span className="thp-plate__stack">{p.out ? "Eliminated" : p.allIn && t.phase !== "complete" ? "ALL-IN" : fmt(p.stack)}</span>
              </div>
              {t.sbSeat === i && p.inHand && t.phase !== "complete" && <span className="thp-blind thp-blind--sb">SB</span>}
              {t.bbSeat === i && p.inHand && t.phase !== "complete" && <span className="thp-blind thp-blind--bb">BB</span>}
            </div>
            {label && !p.out && t.phase !== "complete" && <span key={`${t.seq}-${label}`} className={`thp-act thp-act--${p.lastAction.type}`}>{label}</span>}
            {res && res.net[i] !== 0 && p.inHand && (
              <span className={`thp-delta ${res.net[i] > 0 ? "is-up" : "is-down"}`}>{res.net[i] > 0 ? "+" : "−"}{fmt(Math.abs(res.net[i]))}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Your own hand right now, in words (for the strength indicator). */
export function describeOwn(table, seat = 0) {
  const p = table.players[seat];
  if (!p || p.hole.length !== 2) return null;
  if (table.board.length >= 3) return evaluate([...p.hole, ...table.board]).desc;
  const [a, b] = p.hole.map((c) => [(c >> 2) + 2, c & 3]).sort((x, y) => y[0] - x[0]);
  const R = ["", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const W = { 14: "Aces", 13: "Kings", 12: "Queens", 11: "Jacks", 10: "Tens", 9: "Nines", 8: "Eights", 7: "Sevens", 6: "Sixes", 5: "Fives", 4: "Fours", 3: "Threes", 2: "Twos" };
  if (a[0] === b[0]) return `Pocket ${W[a[0]]}`;
  return `${R[a[0]]}-${R[b[0]]} ${a[1] === b[1] ? "suited" : "offsuit"}`;
}
