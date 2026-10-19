/**
 * AI opponents.
 *
 * decide(view, ctx) receives ONLY viewFor(state, seat) — its own hole cards,
 * the board, stacks, bets and the public action history; never the deck or
 * anyone else's hidden cards — plus a context:
 *   ctx = { profile, difficulty, rand, memory, tournament }
 * and returns a legal action { type, amount? }.
 *
 * Reasoning:
 *  - Hand equity by Monte Carlo: random completions of the board against the
 *    live opponents' unknown hands. Medium/Hard weight those unknown hands by
 *    the opponent's actions this hand (a preflop raiser holds stronger cards),
 *    Hard also by their tracked tendencies (a maniac's raise means less).
 *  - Pot odds vs equity for calls; value thresholds for bets/raises.
 *  - Position (late position plays looser), stack-to-pot ratio (commit or
 *    shove with low SPR), tournament stage (push/fold when short-stacked).
 *  - Bluffs/semi-bluffs only when fold equity looks real: few opponents, a
 *    dry board, nobody showed strength, position, opponents that fold a lot,
 *    or a draw to fall back on. Easy bluffs blindly and makes sizing/calling
 *    mistakes; Hard selects bluffs and sizes for value.
 *
 * Personalities (PROFILES) shift starting-hand selection, aggression, bluff
 * frequency, calling stations vs nits, bet sizing and risk tolerance.
 */
import { rankOf, suitOf } from "./cards.js";
import { scoreHand } from "./evaluator.js";
import { legalActions, potTotal } from "./table.js";

export const PROFILES = {
  alex:   { id: "alex", name: "Alex", style: "Tight & cautious", color: "#3f7fbf", loose: -0.3, aggr: 0.35, bluff: 0.04, call: 0.35, sizing: 0.55, risk: 0.3, mix: 0.05 },
  mia:    { id: "mia", name: "Mia", style: "Aggressive & unpredictable", color: "#d0476b", loose: 0.2, aggr: 0.85, bluff: 0.32, call: 0.45, sizing: 0.9, risk: 0.85, mix: 0.25 },
  jack:   { id: "jack", name: "Jack", style: "Balanced & strategic", color: "#2f9e72", loose: 0.0, aggr: 0.6, bluff: 0.14, call: 0.5, sizing: 0.65, risk: 0.55, mix: 0.08 },
  sofia:  { id: "sofia", name: "Sofia", style: "Patient & defensive", color: "#9a6ad6", loose: -0.2, aggr: 0.22, bluff: 0.05, call: 0.7, sizing: 0.5, risk: 0.35, mix: 0.05 },
  leo:    { id: "leo", name: "Leo", style: "Loose & bluff-heavy", color: "#e08a2c", loose: 0.35, aggr: 0.6, bluff: 0.42, call: 0.65, sizing: 0.7, risk: 0.7, mix: 0.15 },
  victor: { id: "victor", name: "Victor", style: "Strong & experienced", color: "#c9a54a", loose: -0.05, aggr: 0.7, bluff: 0.18, call: 0.5, sizing: 0.75, risk: 0.6, mix: 0.06, expert: true },
};
export const PROFILE_IDS = Object.keys(PROFILES);

export const DIFFICULTY = {
  easy:   { sims: 140, chenNoise: 2.5, noise: 0.13, potOdds: 0.4, position: 0, ranges: 0, tendencies: false, texture: false, mistakes: 0.12, stack: false },
  medium: { sims: 280, chenNoise: 0.8, noise: 0.05, potOdds: 1, position: 0.04, ranges: 0.6, tendencies: false, texture: true, mistakes: 0.03, stack: true },
  hard:   { sims: 460, chenNoise: 0.3, noise: 0.015, potOdds: 1, position: 0.06, ranges: 1, tendencies: true, texture: true, mistakes: 0, stack: true },
};

/* ------------------------------------------------------------ hand reading */

/** Chen formula for two hole cards (-1 … 20). */
export function chen(hole) {
  const [a, b] = hole;
  const ra = rankOf(a), rb = rankOf(b);
  const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  const pts = (r) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let score = pts(hi);
  if (ra === rb) return Math.max(5, score * 2);
  if (suitOf(a) === suitOf(b)) score += 2;
  const gap = hi - lo - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) score += 1;
  return Math.ceil(score);
}

/**
 * Monte Carlo equity of `hole` vs `nOpp` unknown hands.
 * `weights[k]` (optional) → for opponent k a function(hand) → accept prob.
 * Ties count as a share of the pot.
 */
export function equity(hole, board, nOpp, sims, rand, weights = [], dead = []) {
  if (nOpp <= 0) return 1;
  const used = new Set([...hole, ...board, ...dead]);
  const stub = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) stub.push(c);
  const need = 5 - board.length;
  let total = 0;
  const deck = stub.slice();
  for (let n = 0; n < sims; n++) {
    let top = deck.length;
    const draw = () => {
      const j = Math.floor(rand() * top);
      top--;
      const c = deck[j];
      deck[j] = deck[top];
      deck[top] = c;
      return c;
    };
    const opp = [];
    for (let k = 0; k < nOpp; k++) {
      let h = [draw(), draw()];
      const w = weights[k];
      if (w) {
        for (let tries = 0; tries < 6 && rand() > w(h); tries++) {
          top += 2; // put back and redraw
          h = [draw(), draw()];
        }
      }
      opp.push(h);
    }
    const b = board.slice();
    for (let k = 0; k < need; k++) b.push(draw());
    const mine = scoreHand([...hole, ...b]);
    let ties = 0, lost = false;
    for (const h of opp) {
      const sc = scoreHand([...h, ...b]);
      if (sc > mine) { lost = true; break; }
      if (sc === mine) ties++;
    }
    if (!lost) total += ties ? 1 / (ties + 1) : 1;
  }
  return total / sims;
}

/** Board texture: 0 (dry) … 1 (very wet). */
export function texture(board) {
  if (board.length < 3) return 0.5;
  const suits = [0, 0, 0, 0];
  board.forEach((c) => suits[suitOf(c)]++);
  const maxSuit = Math.max(...suits);
  const ranks = [...new Set(board.map(rankOf))].sort((a, b) => a - b);
  let conn = 0;
  for (let i = 1; i < ranks.length; i++) if (ranks[i] - ranks[i - 1] <= 2) conn++;
  const paired = ranks.length < board.length;
  let t = (maxSuit >= 3 ? 0.45 : maxSuit === 2 ? 0.2 : 0) + Math.min(0.45, conn * 0.15) + (paired ? 0.1 : 0);
  return Math.min(1, t);
}

/** Flush/straight draw outs (rough), only meaningful before the river. */
export function drawOuts(hole, board) {
  if (board.length < 3 || board.length >= 5) return 0;
  const all = [...hole, ...board];
  const suits = [0, 0, 0, 0];
  all.forEach((c) => suits[suitOf(c)]++);
  let outs = 0;
  const fs = suits.findIndex((n) => n === 4);
  if (fs >= 0 && hole.some((c) => suitOf(c) === fs)) outs += 9;
  let mask = 0;
  all.forEach((c) => { mask |= 1 << rankOf(c); if (rankOf(c) === 14) mask |= 2; });
  for (let lo = 1; lo <= 10; lo++) {
    const win = (mask >> lo) & 0x1f;
    const bits = win.toString(2).split("").filter((x) => x === "1").length;
    if (bits === 4) { outs += (win === 0b01111 || win === 0b11110) ? 8 : 4; break; }
  }
  return Math.min(15, outs);
}

/* ------------------------------------------------------------ opponent memory */

/** Fresh tendency record for one seat. Only public information goes in. */
export const blankTendency = () => ({ hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, folds: 0, faced: 0, foldedToBet: 0 });

/**
 * Updates the shared tendency memory from a finished hand's public actions.
 * memory: { [playerId]: tendency }
 */
export function observeHand(memory, table) {
  const m = { ...memory };
  const seen = new Set();
  table.players.forEach((p) => {
    if (!p.inHand) return;
    const t = { ...(m[p.id] || blankTendency()) };
    t.hands++;
    m[p.id] = t;
  });
  let facing = false;
  let street = "preflop";
  for (const a of table.actions) {
    if (a.street !== street) { street = a.street; facing = false; }
    const p = table.players[a.seat];
    if (!p) continue;
    const t = m[p.id];
    if (!t) continue;
    if (a.type === "sb" || a.type === "bb" || a.type === "return") continue;
    const pre = a.street === "preflop";
    if (pre && (a.type === "call" || a.type === "raise" || a.type === "allin" || a.type === "bet") && !seen.has(a.seat)) {
      t.vpip++;
      seen.add(a.seat);
    }
    if (a.type === "raise" || a.type === "bet" || (a.type === "allin" && a.to > 0)) {
      t.bets++;
      if (pre) t.pfr++;
    } else if (a.type === "call") t.calls++;
    else if (a.type === "fold") t.folds++;
    if (facing && !pre) {
      t.faced++;
      if (a.type === "fold") t.foldedToBet++;
    }
    if (a.type === "bet" || a.type === "raise" || a.type === "allin") facing = true;
  }
  return m;
}

const rate = (num, den, prior, weight = 6) => (num + prior * weight) / (den + weight);
export function readTendency(t) {
  t = t || blankTendency();
  return {
    vpip: rate(t.vpip, t.hands, 0.3),
    pfr: rate(t.pfr, t.hands, 0.15),
    aggression: rate(t.bets, t.bets + t.calls, 0.45),
    foldToBet: rate(t.foldedToBet, t.faced, 0.45),
  };
}

/* ------------------------------------------------------------ decision */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Range-weighting function for an opponent given what they did this hand. */
function rangeFor(view, seat, diff, memory) {
  if (!diff.ranges) return null;
  const pid = view.players[seat].id;
  const acts = view.actions.filter((a) => a.seat === seat);
  const preRaise = acts.some((a) => a.street === "preflop" && (a.type === "raise" || (a.type === "allin" && a.to > view.blinds.bb)));
  const preCall = acts.some((a) => a.street === "preflop" && a.type === "call");
  const postAggr = acts.filter((a) => a.street !== "preflop" && (a.type === "bet" || a.type === "raise" || a.type === "allin")).length;
  let thr = preRaise ? 8 : preCall ? 5 : -10;
  thr += postAggr * 1.5;
  if (diff.tendencies) {
    const tend = readTendency(memory?.[pid]);
    // a loose/aggressive player's actions mean less; a nit's mean more
    thr -= (tend.vpip - 0.3) * 10 + (tend.aggression - 0.45) * 4;
  }
  thr *= diff.ranges;
  if (thr <= 0) return null;
  return (h) => 1 / (1 + Math.exp(-(chen(h) - thr) / 1.6));
}

/**
 * Picks an action for view.seat. Pure apart from `rand`.
 * @returns {{type: string, amount?: number, why?: string}}
 */
export function decide(view, ctx) {
  const seat = view.seat;
  const la = legalActions(view, seat);
  if (!la) return null;
  const prof = ctx.profile || PROFILES.jack;
  const diff = DIFFICULTY[ctx.difficulty] || DIFFICULTY.medium;
  const rand = ctx.rand || Math.random;
  const me = view.players[seat];
  const hole = me.hole;
  const board = view.board;
  const bb = view.blinds.bb;
  const pot = potTotal(view);
  const opps = view.players.map((p, i) => i).filter((i) => i !== seat && view.players[i].inHand && !view.players[i].folded);
  const nOpp = opps.length;
  const pre = view.street === "preflop";
  const skill = prof.expert ? Math.min(1, (diff.ranges || 0.5) + 0.3) : diff.ranges;

  // ---- equity (postflop; preflop uses starting-hand charts below)
  let eq = 0;
  if (!pre) {
    const weights = opps.map((i) => (view.players[i].hole.length ? null : rangeFor(view, i, { ...diff, ranges: skill }, ctx.memory)));
    const known = opps.filter((i) => view.players[i].hole.length === 2);
    if (known.length === nOpp && nOpp > 0) {
      // every opponent's cards are face up (all-in run-out): exact-ish equity
      eq = equityVsKnown(hole, board, known.map((i) => view.players[i].hole), ctx.sims || diff.sims, rand);
    } else {
      eq = equity(hole, board, nOpp, ctx.sims || diff.sims, rand, weights);
    }
    eq = clamp(eq + (rand() - 0.5) * 2 * diff.noise, 0, 1);
  }

  const fair = 1 / (nOpp + 1);
  let rel = (eq - fair) / (1 - fair); // -1 … 1, 0 = fair share
  // position: acting last is worth something (medium/hard)
  const n = view.players.length;
  const order = (i) => (i - view.dealer - 1 + n) % n; // postflop acting order, button last
  const inPosition = opps.every((i) => order(i) < order(seat));
  if (diff.position) rel += inPosition ? diff.position : -diff.position * 0.5;
  rel += prof.loose * (pre ? 0.18 : 0.08);

  const toCall = la.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const stackLeft = la.stack;
  const spr = stackLeft / Math.max(1, pot);
  const M = stackLeft / Math.max(1, view.blinds.sb + view.blinds.bb);

  // opponent reads (hard): the aggressor's tendencies
  let aggrRead = null, foldRead = 0.45;
  if (diff.tendencies) {
    const ids = opps.map((i) => view.players[i].id);
    const reads = ids.map((id) => readTendency(ctx.memory?.[id]));
    if (reads.length) foldRead = reads.reduce((a, r) => a + r.foldToBet, 0) / reads.length;
    if (view.lastAggressor >= 0 && view.lastAggressor !== seat) {
      aggrRead = readTendency(ctx.memory?.[view.players[view.lastAggressor].id]);
    }
  }

  const sized = (frac) => {
    let target;
    if (!pre) target = la.bet + toCall + (pot + toCall) * frac;
    else if (view.currentBet <= bb) {
      const limpers = view.actions.filter((a) => a.street === "preflop" && a.type === "call").length;
      target = bb * (2.2 + prof.sizing * 1.3 + limpers);
    } else target = view.currentBet * (2.6 + prof.sizing * 0.8);
    target = Math.round(target);
    let to = clamp(target, la.minTo, la.maxTo);
    // commit rather than leave a sliver behind
    if (diff.stack && to > la.maxTo * 0.7) to = la.maxTo;
    return to;
  };
  const raiseAct = (to, why) => {
    if (to >= la.maxTo && la.canAllIn) return { type: "allin", why };
    if (la.canBet) return { type: "bet", amount: to, why };
    if (la.canRaise) return { type: "raise", amount: to, why };
    return passive(why);
  };
  const passive = (why) => (la.canCheck ? { type: "check", why } : la.canCall ? { type: "call", why } : { type: "fold", why });
  const foldOrCheck = (why) => (la.canCheck ? { type: "check", why } : { type: "fold", why });
  const canAggress = la.canBet || la.canRaise;

  // easy players make outright mistakes now and then
  if (diff.mistakes && rand() < diff.mistakes) {
    const r = rand();
    if (r < 0.45) return finalize(passive("mistake: passive"), la);
    if (r < 0.7 && canAggress) return finalize(raiseAct(la.minTo, "mistake: min-raise"), la);
    return finalize(foldOrCheck("mistake: gives up"), la);
  }

  if (pre) return finalize(preflop({ view, ctx, la, prof, diff, rand, hole, bb, M, raiseAct, sized, aggrRead }), la);

  const mix = (rand() - 0.5) * 2 * prof.mix;
  const valueT = (pre ? 0.3 : 0.26) - prof.aggr * 0.12 + mix;
  const strongT = 0.55 - prof.aggr * 0.08 + mix * 0.5;
  const tex = diff.texture ? texture(board) : 0.5;
  const outs = drawOuts(hole, board);

  // ---- no bet to call: check or bet
  if (la.canCheck) {
    if (canAggress && rel > valueT) {
      // monsters sometimes slow-play (hard/expert, dry board)
      if (rel > 0.75 && diff.tendencies && tex < 0.3 && rand() < 0.3) return finalize({ type: "check", why: "slow-play" }, la);
      if (rand() < 0.45 + prof.aggr * 0.55) return finalize(raiseAct(sized(0.45 + prof.sizing * 0.4), "value bet"), la);
      return finalize({ type: "check", why: "pot control" }, la);
    }
    if (canAggress && !pre) {
      const nobodyBet = !view.actions.some((a) => a.street === view.street && (a.type === "bet" || a.type === "raise"));
      let fe = diff.texture
        ? (1 - tex) * 0.5 + (nOpp === 1 ? 0.35 : nOpp === 2 ? 0.12 : 0) + (inPosition ? 0.15 : 0) + (nobodyBet ? 0.1 : -0.2) + (foldRead - 0.45)
        : 0.6;
      const semi = outs >= 8 ? 0.25 : outs >= 4 ? 0.1 : 0;
      const p = prof.bluff * clamp(fe + semi, 0, 1.2);
      if (rand() < p) return finalize(raiseAct(sized(0.45 + prof.sizing * 0.25), outs >= 8 ? "semi-bluff" : "bluff"), la);
    }
    return finalize({ type: "check", why: "check" }, la);
  }

  // ---- facing a bet: bets (especially big ones) come from stronger ranges
  if (diff.ranges) eq = Math.max(0, eq - diff.ranges * 0.09 * Math.min(1.5, toCall / Math.max(1, pot - toCall)));
  const stackRisk = toCall / Math.max(1, toCall + stackLeft); // share of stack at risk
  let need = potOdds * diff.potOdds + (1 - diff.potOdds) * 0.35;
  need += stackRisk * (0.35 - prof.risk * 0.3); // risk aversion for big calls
  need -= (prof.call - 0.5) * 0.12;
  if (aggrRead) need -= (aggrRead.aggression - 0.45) * 0.2; // maniacs get looser calls
  if (diff.stack && spr < 1.2 && rel > 0.15) need -= 0.08; // pot-committed
  if (outs && !pre && diff.potOdds >= 1) {
    const cardsLeft = board.length === 3 ? 2 : 1;
    const drawEq = 1 - Math.pow(1 - outs / 47, cardsLeft);
    eq = Math.max(eq, drawEq * 0.9);
  }

  if (canAggress && rel > strongT) {
    if (rand() < 0.5 + prof.aggr * 0.5) return finalize(raiseAct(sized(0.6 + prof.sizing * 0.5), "value raise"), la);
    return finalize({ type: "call", why: "trap call" }, la);
  }
  if (eq >= need) {
    // occasional (semi-)bluff raise with a draw or by a bluffy player
    if (canAggress && !pre && outs >= 8 && rand() < prof.bluff * 0.6) return finalize(raiseAct(sized(0.7), "semi-bluff raise"), la);
    return finalize({ type: "call", why: `equity ${(eq * 100) | 0}% ≥ ${(need * 100) | 0}%` }, la);
  }
  if (canAggress && !pre && nOpp === 1 && rand() < prof.bluff * (diff.texture ? (1 - tex) * 0.35 + (foldRead - 0.3) : 0.3)) {
    return finalize(raiseAct(sized(0.8), "bluff raise"), la);
  }
  return finalize({ type: "fold", why: `equity ${(eq * 100) | 0}% < ${(need * 100) | 0}%` }, la);
}

/**
 * Preflop: Chen score vs thresholds shifted by position, table size,
 * personality, raise size and (hard) the raiser's tendencies.
 */
function preflop({ view, ctx, la, prof, diff, rand, hole, bb, M, raiseAct, sized, aggrRead }) {
  const n = view.players.length;
  const seat = view.seat;
  const active = view.players.filter((p) => p.inHand).length;
  let c = chen(hole) + (rand() - 0.5) * 2 * diff.chenNoise;
  // acting order from UTG (0) to big blind (active-1)
  const inHandSeats = view.players.map((p, i) => i).filter((i) => view.players[i].inHand);
  const ord = (i) => (i - view.bbSeat - 1 + n) % n;
  const sorted = inHandSeats.slice().sort((a, b) => ord(a) - ord(b));
  const posFrac = active > 1 ? sorted.indexOf(seat) / (active - 1) : 1;
  const posAdj = diff.position ? (posFrac - 0.5) * 3 : 0;
  const shortAdj = (6 - active) * 0.55;
  const openT = 8.6 - prof.loose * 6 - posAdj - shortAdj;
  const pre = view.actions.filter((a) => a.street === "preflop");
  const raises = pre.filter((a) => a.type === "raise" || a.type === "bet" || (a.type === "allin" && a.to > bb)).length;
  const limpers = pre.filter((a) => a.type === "call").length;
  const late = posFrac >= 0.6;
  const canAggress = la.canBet || la.canRaise;
  const stackAll = la.stack + la.bet;

  // tournament short stack: push or fold (medium & hard)
  if (ctx.tournament && diff.stack && M < 8) {
    const pushT = 9.5 - (8 - M) * 0.6 - prof.loose * 3 - prof.risk * 1.5 - posAdj * 0.6;
    if (raises === 0 && c >= pushT && la.canAllIn) return { type: "allin", why: "short-stack shove" };
    if (la.canCheck) return { type: "check", why: "short stack waits" };
    if (c >= pushT + 1.5 + raises) return la.canAllIn && rand() < 0.6 ? { type: "allin", why: "re-shove" } : { type: "call", why: "short-stack call" };
    return { type: "fold", why: "short stack folds" };
  }

  if (raises === 0) {
    if (c >= openT && canAggress) return raiseAct(sized(0), `open raise (chen ${c.toFixed(1)})`);
    if (la.canCheck) return { type: "check", why: "free look" };
    if (c >= openT - 1.5 - prof.call * 2 && rand() < 0.35 + prof.call * 0.6 - prof.aggr * 0.3) return { type: "call", why: "limp" };
    if (late && limpers === 0 && canAggress && rand() < prof.bluff * 0.6) return raiseAct(sized(0), "steal");
    if (view.sbSeat === seat && la.toCall <= bb / 2 && c >= openT - 3) return { type: "call", why: "complete small blind" };
    return { type: "fold", why: `chen ${c.toFixed(1)} < ${openT.toFixed(1)}` };
  }

  // facing a raise
  const raiseBB = view.currentBet / bb;
  const sizePen = Math.max(0, Math.log2(Math.max(1, raiseBB) / 3)) * 1.3;
  const pressure = la.toCall > 0.35 * stackAll ? (1 - prof.risk) * 2.5 + 1 : 0;
  let threeT = 11.5 - prof.aggr * 2 - prof.loose * 2 + sizePen * 0.5 + (raises - 1) * 1.6;
  let callT = openT + 1.2 - prof.call * 2 + sizePen + pressure + (raises - 1) * 1.2;
  if (diff.mistakes) { callT -= 2; threeT += 1; }
  if (aggrRead) {
    const loose = aggrRead.pfr - 0.15;
    threeT -= loose * 8;
    callT -= loose * 7;
  }
  // cheap to continue (e.g. big blind vs a min-raise): defend wider
  if (la.toCall <= bb * 1.5) callT -= 1.5;
  if (c >= threeT && canAggress) return raiseAct(sized(0), `3-bet (chen ${c.toFixed(1)})`);
  if (c >= callT) return { type: "call", why: `call (chen ${c.toFixed(1)} ≥ ${callT.toFixed(1)})` };
  if (canAggress && late && raises === 1 && rand() < prof.bluff * 0.12) return raiseAct(sized(0), "light 3-bet");
  return la.canCheck ? { type: "check", why: "check" } : { type: "fold", why: `chen ${c.toFixed(1)} < ${callT.toFixed(1)}` };
}

function equityVsKnown(hole, board, hands, sims, rand) {
  const used = new Set([...hole, ...board, ...hands.flat()]);
  const stub = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) stub.push(c);
  const need = 5 - board.length;
  let total = 0;
  const runs = need === 0 ? 1 : sims;
  for (let n = 0; n < runs; n++) {
    const d = stub.slice();
    const b = board.slice();
    for (let k = 0; k < need; k++) b.push(d.splice(Math.floor(rand() * d.length), 1)[0]);
    const mine = scoreHand([...hole, ...b]);
    const others = hands.map((h) => scoreHand([...h, ...b]));
    const best = Math.max(...others);
    if (mine > best) total += 1;
    else if (mine === best) total += 1 / (others.filter((x) => x === best).length + 1);
  }
  return total / runs;
}

/** Forces any proposed action into a legal one (safety net). */
export function finalize(a, la) {
  if (!a || !la) return { type: "fold" };
  const why = a.why;
  switch (a.type) {
    case "check": return la.canCheck ? { type: "check", why } : la.canCall ? { type: "call", why } : { type: "fold", why };
    case "call": return la.canCall ? { type: "call", why } : la.canCheck ? { type: "check", why } : { type: "fold", why };
    case "fold": return { type: "fold", why };
    case "allin": return la.canAllIn ? { type: "allin", why } : la.canCall ? { type: "call", why } : la.canCheck ? { type: "check", why } : { type: "fold", why };
    case "bet":
    case "raise": {
      const ok = la.canBet || la.canRaise;
      if (!ok) return finalize({ type: "call", why }, la);
      const to = clamp(Math.round(a.amount), la.minTo, la.maxTo);
      if (to >= la.maxTo) return { type: "allin", why };
      return { type: la.canBet ? "bet" : "raise", amount: to, why };
    }
    default: return la.canCheck ? { type: "check" } : { type: "fold" };
  }
}

/* ------------------------------------------------------------ practice hints */

/** Equity + plain-language advice for the human (practice mode). */
export function hint(view, rand = Math.random) {
  const la = legalActions(view, view.seat);
  const me = view.players[view.seat];
  const opps = view.players.filter((p, i) => i !== view.seat && p.inHand && !p.folded).length;
  const eq = equity(me.hole, view.board, opps, 600, rand);
  const pot = potTotal(view);
  const res = { equity: eq, opponents: opps, potOdds: 0, advice: "" };
  if (!la) return res;
  if (la.toCall > 0) {
    const po = la.toCall / (pot + la.toCall);
    res.potOdds = po;
    // equity is vs random hands, but a bettor's range is stronger: be conservative
    const fair = 1 / (opps + 1);
    res.advice = eq > po + 0.2 && eq > fair * 1.6 ? "Strong spot — consider raising for value."
      : eq >= po + 0.05 ? `Calling looks profitable: you win about ${Math.round(eq * 100)}% vs random hands and need ${Math.round(po * 100)}%.`
      : eq >= po ? "Close call — the price is right, but a bettor usually holds better than a random hand."
      : `Folding is reasonable: you need ${Math.round(po * 100)}% equity but have about ${Math.round(eq * 100)}%.`;
  } else {
    const fair = 1 / (opps + 1);
    res.advice = eq > fair + 0.2 ? "You're ahead of the field — bet for value."
      : eq > fair ? "Slightly ahead — a small bet or a check both work."
      : "Behind on average — checking is free; bet only as a bluff.";
  }
  return res;
}
