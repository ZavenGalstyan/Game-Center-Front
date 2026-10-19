/**
 * AIEngine — bidding and card play for the three computer seats.
 *
 * The AI only ever receives `viewFor(match, seat)` (engine/match.js): its own
 * hand plus public facts (auction, played cards, announced declarations,
 * shown declaration cards, Belote calls). It never sees another hand.
 * Every card it plays comes from the same `legalMoves` the human UI uses.
 *
 * Difficulty changes strategy only:
 *  - easy:   hand-evaluation bidding with noise; play remembers only the
 *            current trick, and sometimes picks a random legal card;
 *  - medium: remembers every played card, infers voids, plays masters,
 *            feeds points to a partner who is winning, saves trumps;
 *  - hard:   medium's knowledge plus Monte Carlo — it deals the unseen
 *            cards many times, consistent with everything public (voids,
 *            shown cards, Belote), plays each candidate card out to the end
 *            of the hand with the medium policy and keeps the best average.
 */
import { suitOf, rankOf, makeCard, RJ, R9, RA, R10, RK, RQ, R7, R8 } from "./deck.js";
import { isTrump, strength, cardPoints, isSuitStrain, NT, AT, strainsFor, LAST_TRICK_BONUS } from "./rules.js";
import { legalMoves, winningIndex, beats, teamOf, partnerOf, nextSeat } from "./play.js";
import { legalBids } from "./bidding.js";
import { detectDeclarations, resolveDeclarations } from "./declarations.js";
import { scoreHand } from "./scoring.js";

/* ================================================================ bidding */

const has = (hand, rank, suit) => hand.includes(makeCard(rank, suit));
const ofSuit = (hand, s) => hand.filter((c) => suitOf(c) === s);

/** Estimated raw points this hand brings to its side if `strain` were the contract. */
export function evaluateHand(hand, strain, rules) {
  let pts = 0;
  if (isSuitStrain(strain)) {
    const t = strain;
    const n = ofSuit(hand, t).length;
    const J = has(hand, RJ, t), N = has(hand, R9, t), A = has(hand, RA, t), T = has(hand, R10, t);
    if (J) pts += 32;
    if (N) pts += J ? 24 : n >= 3 ? 17 : 8;
    if (A) pts += 15;
    if (T) pts += J || N || A ? 12 : 6;
    if (has(hand, RK, t)) pts += 5;
    if (has(hand, RQ, t)) pts += 5;
    if (has(hand, R8, t)) pts += 3;
    if (has(hand, R7, t)) pts += 3;
    if (n >= 4) pts += (n - 3) * 10;
    if (n <= 1) pts -= 30;
    else if (n === 2 && !J) pts -= 14;
    for (let s = 0; s < 4; s++) {
      if (s === t) continue;
      const cs = ofSuit(hand, s);
      const a = has(hand, RA, s), ten = has(hand, R10, s), k = has(hand, RK, s);
      if (a) pts += 17;
      if (ten) pts += a ? 13 : k || cs.length >= 3 ? 5 : 1;
      if (k && a && ten) pts += 5;
      if (!cs.length && n >= 3) pts += 8;
      else if (cs.length === 1 && !a && n >= 3) pts += 3;
    }
    if (rules.belote && has(hand, RK, t) && has(hand, RQ, t)) pts += 18;
  } else if (strain === NT) {
    for (let s = 0; s < 4; s++) {
      const cs = ofSuit(hand, s);
      const a = has(hand, RA, s), ten = has(hand, R10, s), k = has(hand, RK, s);
      if (a) pts += 25;
      if (ten) pts += a ? 16 : k || cs.length >= 3 ? 5 : 0;
      if (k) pts += a && ten ? 7 : 1;
      if (a && ten && cs.length > 3) pts += (cs.length - 3) * 9;
      if (!a && !(ten && cs.length >= 2) && cs.length) pts -= 7;
      if (!cs.length) pts -= 5;
    }
  } else if (strain === AT) {
    for (let s = 0; s < 4; s++) {
      const cs = ofSuit(hand, s);
      const J = has(hand, RJ, s), N = has(hand, R9, s);
      if (J) pts += 20;
      if (N) pts += J ? 13 : cs.length >= 3 ? 8 : 2;
      if (has(hand, RA, s)) pts += J && N ? 6 : 3;
      if (cs.length >= 4) pts += (cs.length - 3) * 6;
      if (!J && cs.length && cs.length <= 2) pts -= 4;
    }
  }
  const decl = detectDeclarations(hand, strain, rules).reduce((t, d) => t + d.value, 0);
  pts += decl * 0.75;
  return pts;
}

const NOISE = { easy: 18, medium: 6, hard: 0 };
/** Bidding margins (raw points kept in reserve) and contra thresholds; exported for tools/aiSim.mjs tuning. */
export const TUNE = { margin: { easy: -4, medium: -2, hard: -4 }, contra: { medium: 70, hard: 55 }, partner: 34 };
const MARGIN = TUNE.margin;

/** Partner's expected contribution, read from the auction (public). */
function partnerSupport(view, strain) {
  const p = partnerOf(view.seat);
  let v = TUNE.partner;
  for (const h of view.auction.history) {
    if (h.seat !== p) continue;
    if (h.type === "bid" || h.type === "kaput") v = Math.max(v, h.strain === strain ? 48 + (h.level || 12) - 8 : 36);
  }
  return v;
}

/** Bidding decision. Returns an action legal for this seat. */
export function chooseBid(view, rng = Math.random) {
  const rules = view.rules;
  const lb = legalBids(view.auction, view.seat, rules);
  const diff = view.difficulty || "medium";
  const noise = () => (rng() * 2 - 1) * NOISE[diff];
  const est = {};
  for (const s of strainsFor(rules)) est[String(s)] = evaluateHand(view.hand, s, rules) + partnerSupport(view, s) + noise();
  const high = view.auction.high;
  const me = view.seat;

  if (view.auction.stage === "contra") {
    if (lb.recontra && est[String(high.strain)] >= high.level * 10 + 28 && diff !== "easy") return { type: "recontra" };
    return { type: "pass" };
  }

  // best strain and the highest level we'd commit to
  let best = null;
  for (const s of strainsFor(rules)) {
    const e = est[String(s)];
    if (!best || e > best.e) best = { s, e };
  }
  const maxLevel = Math.min(rules.maxBid, Math.floor((best.e - MARGIN[diff]) / 10));

  // Kaput only with a hand that has no losers: J+9 and 5+ trumps, every side card an ace
  if (lb.kaput.length && diff !== "easy" && isSuitStrain(best.s)) {
    const t = best.s, trumps = ofSuit(view.hand, t);
    const side = view.hand.filter((c) => suitOf(c) !== t);
    if (trumps.length >= 5 && has(view.hand, RJ, t) && has(view.hand, R9, t) && side.every((c) => rankOf(c) === RA)) return { type: "kaput", strain: t };
  }

  const partnerHigh = high && teamOf(high.seat) === teamOf(me);
  if (partnerHigh) {
    // raise the partner only when the opponents are competing and we can back it
    const competed = view.auction.history.some((h) => teamOf(h.seat) !== teamOf(me) && (h.type === "bid" || h.type === "kaput"));
    const e = est[String(high.strain)] + 12;
    const lv = Math.min(rules.maxBid, Math.floor((e - MARGIN[diff]) / 10));
    const want = high.level + rules.bidStep;
    if (competed && !high.kaput && lv >= want && lb.bids.some((b) => b.level === want && b.strain === high.strain)) return { type: "bid", level: want, strain: high.strain };
    return { type: "pass" };
  }

  if (high) {
    // opponents hold the bid: overcall, contra, or pass
    const want = high.kaput ? null : high.level + rules.bidStep;
    if (want != null && maxLevel >= want && lb.bids.some((b) => b.level === want && b.strain === best.s)) return { type: "bid", level: want, strain: best.s };
    if (lb.contra && diff !== "easy") {
      const theirs = high.strain;
      const def = defensiveValue(view.hand, theirs, rules) + 34;
      const total = theirs === AT ? 166 : 162;
      const need = high.kaput ? 162 : high.level * 10;
      if (total - def < need - TUNE.contra[diff]) return { type: "contra" };
    }
    return { type: "pass" };
  }

  // opening
  if (maxLevel >= rules.minBid) {
    const level = maxLevel >= rules.minBid + 2 ? maxLevel - 1 : rules.minBid;
    if (lb.bids.some((b) => b.level === level && b.strain === best.s)) return { type: "bid", level, strain: best.s };
  }
  return { type: "pass" };
}

/** Raw points a defending hand expects to take against `strain`. */
function defensiveValue(hand, strain, rules) {
  let v = 0;
  for (let s = 0; s < 4; s++) {
    if (isSuitStrain(strain) && s === strain) {
      if (has(hand, RJ, s)) v += 28;
      if (has(hand, R9, s)) v += has(hand, RJ, s) || ofSuit(hand, s).length >= 3 ? 18 : 6;
      if (ofSuit(hand, s).length >= 3) v += 8;
      continue;
    }
    if (has(hand, RA, s)) v += strain === NT ? 24 : 15;
    if (has(hand, R10, s)) v += has(hand, RA, s) ? 11 : 3;
  }
  return v + (rules ? 0 : 0);
}

/* ================================================================ knowledge */

/** Public knowledge derived from a view: played cards, voids, known holdings. */
export function buildKnowledge(view) {
  const strain = view.contract ? view.contract.strain : null;
  const rules = view.rules;
  const played = new Set();
  const voids = [0, 1, 2, 3].map(() => [false, false, false, false]);
  const all = view.tricks.map((t) => t.cards).concat(view.trick.length ? [view.trick] : []);
  for (const plays of all) {
    const led = suitOf(plays[0].card);
    for (let i = 0; i < plays.length; i++) {
      const p = plays[i];
      played.add(p.card);
      if (i === 0) continue;
      const s = suitOf(p.card);
      if (s !== led) {
        voids[p.seat][led] = true;
        if (isSuitStrain(strain) && led !== strain && s !== strain && rules.mustTrump) {
          const sofar = plays.slice(0, i);
          const wi = winningIndex(sofar, strain);
          const partnerWin = teamOf(sofar[wi].seat) === teamOf(p.seat);
          const trickHasTrump = sofar.some((x) => suitOf(x.card) === strain);
          if (!(partnerWin && rules.partnerException) && !trickHasTrump) voids[p.seat][strain] = true;
        }
      }
    }
  }
  const mine = new Set(view.hand);
  const known = [[], [], [], []];
  for (let s = 0; s < 4; s++) for (const c of view.shown[s] || []) if (!played.has(c) && s !== view.seat) known[s].push(c);
  if (view.belote && view.belote.seat != null && view.belote.played === 1 && isSuitStrain(strain) && view.belote.seat !== view.seat) {
    for (const r of [RK, RQ]) {
      const c = makeCard(r, strain);
      if (!played.has(c) && !mine.has(c) && !known[view.belote.seat].includes(c)) known[view.belote.seat].push(c);
    }
  }
  const unseen = [];
  for (let c = 0; c < 32; c++) if (!played.has(c) && !mine.has(c)) unseen.push(c);
  return { strain, played, voids, known, unseen: new Set(unseen), unseenList: unseen, mine };
}

/** Is `card` the highest remaining card of its suit (all stronger ones played or ours)? */
function isMaster(card, k, strain) {
  const s = suitOf(card), st = strength(card, strain);
  for (const c of k.unseen) if (suitOf(c) === s && strength(c, strain) > st) return false;
  return true;
}

/* ================================================================ card play policy */

/**
 * The heuristic policy (medium). `k` is knowledge; with `forgetful` (easy)
 * masters are judged without the played-card memory.
 */
function heuristicPlay(view, legal, k, rng, forgetful = false) {
  if (legal.length === 1) return legal[0];
  const strain = view.contract.strain;
  const me = view.seat, myTeam = teamOf(me);
  const trick = view.trick;
  const trumpSuit = isSuitStrain(strain) ? strain : null;
  const pts = (c) => cardPoints(c, strain);
  const str = (c) => strength(c, strain);
  const unseenOf = (s) => k.unseenList.filter((c) => suitOf(c) === s);
  const master = (c) => (forgetful ? isMasterForgetful(c, view.hand, strain) : isMaster(c, k, strain));
  const contractSide = teamOf(view.contract.seat) === myTeam;
  const opps = [0, 1, 2, 3].filter((s) => teamOf(s) !== myTeam);
  const cheapest = (cs) => cs.slice().sort((a, b) => pts(a) - pts(b) || str(a) - str(b))[0];
  const priciest = (cs) => cs.slice().sort((a, b) => pts(b) - pts(a) || str(b) - str(a))[0];
  // a "safe low" discard: low points, from a suit where we don't keep a master/guard
  const discard = (cs) => {
    const scored = cs.map((c) => {
      let cost = pts(c) * 2 + str(c) * 0.3;
      if (trumpSuit != null && suitOf(c) === trumpSuit) cost += 18; // keep trumps
      if (master(c)) cost += 10;
      const len = view.hand.filter((x) => suitOf(x) === suitOf(c)).length;
      cost += len * 0.6; // shorten short suits first
      return { c, cost };
    });
    scored.sort((a, b) => a.cost - b.cost);
    return scored[0].c;
  };
  const oppMayRuff = (s) => trumpSuit != null && s !== trumpSuit && unseenOf(trumpSuit).length > 0 && opps.some((o) => k.voids[o][s] && !k.voids[o][trumpSuit]);

  /* ----- leading */
  if (!trick.length) {
    if (trumpSuit != null) {
      const myTrumps = legal.filter((c) => suitOf(c) === trumpSuit);
      const outTrumps = unseenOf(trumpSuit).length;
      const oppsHaveTrump = opps.some((o) => !k.voids[o][trumpSuit]);
      if (contractSide && myTrumps.length && outTrumps > 0 && oppsHaveTrump) {
        const m = myTrumps.filter(master);
        if (m.length) return m.sort((a, b) => str(b) - str(a))[0];
        if (view.contract.seat === me && myTrumps.length >= 3) return myTrumps.sort((a, b) => str(a) - str(b))[0];
      }
    }
    // cash side-suit masters the opponents can't ruff
    const cash = legal.filter((c) => (trumpSuit == null || suitOf(c) !== trumpSuit) && master(c) && !oppMayRuff(suitOf(c)) && unseenOf(suitOf(c)).length > 0);
    if (cash.length) return priciest(cash);
    // lead into a suit partner is void in (partner ruffs) when we're not drawing trumps
    if (trumpSuit != null) {
      const p = partnerOf(me);
      const ruffable = legal.filter((c) => suitOf(c) !== trumpSuit && k.voids[p][suitOf(c)] && !k.voids[p][trumpSuit] && !opps.some((o) => k.voids[o][suitOf(c)]));
      if (ruffable.length) return cheapest(ruffable);
    }
    // otherwise a low card, never an unguarded ten or a lone trump honour
    const nonTrump = legal.filter((c) => trumpSuit == null || suitOf(c) !== trumpSuit);
    const pool = nonTrump.length ? nonTrump : legal;
    return discard(pool);
  }

  /* ----- following */
  const led = suitOf(trick[0].card);
  const wi = winningIndex(trick, strain);
  const winCard = trick[wi].card;
  const partnerWinning = teamOf(trick[wi].seat) === myTeam;
  const last = trick.length === 3;
  const trickPts = trick.reduce((t, p) => t + pts(p.card), 0);
  const winners = legal.filter((c) => beats(c, winCard, led, strain));
  // players still to act after me
  const behind = [];
  for (let s = nextSeat(me), i = trick.length + 1; i < 4; s = nextSeat(s), i++) behind.push(s);
  const oppBehind = behind.filter((s) => teamOf(s) !== myTeam);

  /** Can `card` (winning now) still be beaten by an opponent who plays after me? */
  const safeWinner = (card) => {
    if (!oppBehind.length) return true;
    const s = suitOf(card);
    const cardIsTrump = trumpSuit != null && s === trumpSuit;
    for (const o of oppBehind) {
      if (!k.voids[o][led]) {
        // they follow the led suit: higher card of that suit, if the winner is in the led suit
        if (s === led && !master(card)) return false;
      } else if (trumpSuit != null && led !== trumpSuit && !k.voids[o][trumpSuit]) {
        if (!cardIsTrump) return false;
        if (!master(card)) return false;
      }
    }
    return true;
  };

  if (partnerWinning) {
    const secure = last || safeWinner(winCard);
    if (secure) {
      // feed points, but never a master trump or the trump jack/nine
      const feed = legal.filter((c) => !(trumpSuit != null && suitOf(c) === trumpSuit) && !(master(c) && pts(c) >= 10 && unseenOf(suitOf(c)).length > 2));
      if (feed.length) return priciest(feed);
    }
    return discard(legal);
  }

  if (winners.length) {
    const trickValue = trickPts;
    if (last) {
      // cheapest winning card; take points if any
      const w = winners.slice().sort((a, b) => str(a) + pts(a) * 0.5 - (str(b) + pts(b) * 0.5))[0];
      if (trickValue > 0 || pts(w) <= 4 || trumpSuit == null || suitOf(w) !== trumpSuit) return w;
      // a pointless trick: don't waste a trump honour
      const nonWin = legal.filter((c) => !winners.includes(c));
      return nonWin.length ? discard(nonWin) : w;
    }
    const safe = winners.filter(safeWinner);
    if (safe.length) {
      // win safely; with a point-rich master (A/10) take the most points
      const sorted = safe.slice().sort((a, b) => pts(b) - pts(a));
      if (trumpSuit != null && suitOf(sorted[0]) === trumpSuit) return safe.slice().sort((a, b) => str(a) - str(b))[0];
      return sorted[0];
    }
    // can win now but may be overtaken: only spend low-value winners
    if (trickValue >= 10) {
      const cheap = winners.filter((c) => pts(c) <= 4);
      if (cheap.length) return cheap.sort((a, b) => str(b) - str(a))[0];
    }
    if (winners.length === legal.length) return winners.slice().sort((a, b) => pts(a) - pts(b) || str(a) - str(b))[0];
    return discard(legal.filter((c) => !winners.includes(c)));
  }
  return discard(legal);
}

function isMasterForgetful(card, hand, strain) {
  // easy AI: assumes only the A (or trump J) is a master
  if (isTrump(card, strain) && strain !== NT) return rankOf(card) === RJ;
  return rankOf(card) === RA;
}

/* ================================================================ Monte Carlo (hard) */

/** Deals the unseen cards to the other seats consistently with public knowledge. */
export function sampleHands(view, k, rng) {
  const sizes = view.handSizes;
  for (let attempt = 0; attempt < 30; attempt++) {
    const hands = [[], [], [], []];
    hands[view.seat] = view.hand.slice();
    const need = sizes.slice();
    need[view.seat] = 0;
    const pool = new Set(k.unseenList);
    let ok = true;
    for (let s = 0; s < 4; s++) {
      for (const c of k.known[s]) {
        if (!pool.has(c)) continue;
        hands[s].push(c);
        pool.delete(c);
        need[s]--;
        if (need[s] < 0) ok = false;
      }
    }
    if (!ok) break;
    const relax = attempt >= 20; // last resort: ignore inferred voids
    const cards = [...pool];
    const elig = (c) => [0, 1, 2, 3].filter((s) => s !== view.seat && need[s] > 0 && (relax || !k.voids[s][suitOf(c)]));
    // most constrained first, random among equals
    const order = cards.map((c) => ({ c, r: rng(), n: elig(c).length })).sort((a, b) => a.n - b.n || a.r - b.r);
    for (const { c } of order) {
      const e = elig(c);
      if (!e.length) { ok = false; break; }
      // weight by remaining capacity → uniform-ish deals
      let tot = 0;
      for (const s of e) tot += need[s];
      let x = rng() * tot;
      let pick = e[e.length - 1];
      for (const s of e) { x -= need[s]; if (x < 0) { pick = s; break; } }
      hands[pick].push(c);
      need[pick]--;
    }
    if (ok && need.every((n) => n === 0)) return hands;
  }
  return null;
}

/** Plays the rest of the hand from a full-information sample and scores it for `team`. */
function rollout(view, hands, firstCard, rng) {
  const rules = view.rules, strain = view.contract.strain;
  const hs = hands.map((h) => h.slice());
  let trick = view.trick.slice();
  const tricks = view.tricks.map((t) => ({ cards: t.cards, winner: t.winner }));
  const cards = view.cards.slice(), won = view.won.slice();
  let seat = view.seat;
  let card = firstCard;
  const playedSet = new Set();
  for (const t of view.tricks) for (const p of t.cards) playedSet.add(p.card);
  for (const p of view.trick) playedSet.add(p.card);
  for (let guard = 0; guard < 40; guard++) {
    hs[seat] = hs[seat].filter((c) => c !== card);
    trick.push({ seat, card });
    playedSet.add(card);
    if (trick.length === 4) {
      const w = trick[winningIndex(trick, strain)].seat;
      const last = tricks.length === 7;
      const p = trick.reduce((t, x) => t + cardPoints(x.card, strain), 0) + (last ? LAST_TRICK_BONUS : 0);
      cards[teamOf(w)] += p;
      won[teamOf(w)]++;
      tricks.push({ cards: trick, winner: w });
      trick = [];
      if (last) break;
      seat = w;
    } else seat = nextSeat(seat);
    // next decision with a light full-information-free policy (each seat sees only its own cards + played)
    const legal = legalMoves(hs[seat], trick, strain, seat, rules);
    const unseenList = [];
    for (let c = 0; c < 32; c++) if (!playedSet.has(c) && !hs[seat].includes(c)) unseenList.push(c);
    const kk = { played: playedSet, voids: [0, 1, 2, 3].map(() => [false, false, false, false]), known: [[], [], [], []], unseen: new Set(unseenList), unseenList };
    const v = { seat, hand: hs[seat], trick, contract: view.contract, rules };
    card = heuristicPlay(v, legal, kk, rng);
  }
  return { cards, won };
}

function evalOutcome(view, out, declApprox, beloteTeam) {
  const myTeam = teamOf(view.seat);
  const r = scoreHand({ contract: view.contract, cards: out.cards, tricks: out.won, decl: declApprox, beloteTeam }, view.rules);
  return (r.score[myTeam] - r.score[1 - myTeam]) * 10 + (out.cards[myTeam] - out.cards[1 - myTeam]) * 0.15;
}

function monteCarlo(view, legal, k, rng, samples) {
  const totals = new Map(legal.map((c) => [c, 0]));
  let n = 0;
  for (let i = 0; i < samples; i++) {
    const hands = sampleHands(view, k, rng);
    if (!hands) break;
    // declarations: use the resolved result when known, else resolve on the sample
    let decl = view.declResult || null;
    if (!decl) {
      const orig = hands.map((h, s) => h.concat(view.tricks.flatMap((t) => t.cards.filter((p) => p.seat === s).map((p) => p.card))).concat(view.trick.filter((p) => p.seat === s).map((p) => p.card)));
      decl = resolveDeclarations(orig.map((h) => detectDeclarations(h, view.contract.strain, view.rules)), view.contract.strain, view.leader, view.rules);
    }
    let beloteTeam = null;
    if (view.beloteHolderGuess != null) beloteTeam = teamOf(view.beloteHolderGuess);
    for (const c of legal) totals.set(c, totals.get(c) + evalOutcome(view, rollout(view, hands, c, rng), decl, beloteTeam));
    n++;
  }
  if (!n) return null;
  let best = legal[0], bv = -Infinity;
  for (const c of legal) { const v = totals.get(c) / n; if (v > bv) { bv = v; best = c; } }
  return best;
}

/** Card-play decision for the seat in `view`. Always returns a legal card. */
export function choosePlay(view, rng = Math.random) {
  const legal = legalMoves(view.hand, view.trick, view.contract.strain, view.seat, view.rules);
  if (legal.length <= 1) return legal[0];
  const diff = view.difficulty || "medium";
  const k = buildKnowledge(view);
  if (diff === "easy") {
    if (rng() < 0.25) return legal[Math.floor(rng() * legal.length)];
    const kEasy = { ...k, voids: [0, 1, 2, 3].map(() => [false, false, false, false]) };
    return heuristicPlay(view, legal, kEasy, rng, true);
  }
  if (diff === "hard") {
    // Belote holder (if called) counts for that side in the sampled outcomes
    const v = { ...view, beloteHolderGuess: holderGuess(view) };
    const mc = monteCarlo(v, legal, k, rng, view.samples || 28);
    if (mc != null) return mc;
  }
  return heuristicPlay(view, legal, k, rng);
}

function holderGuess(view) {
  const strain = view.contract.strain;
  if (!isSuitStrain(strain)) return null;
  if (view.belote && view.belote.seat != null) return view.belote.seat;
  if (has(view.hand, RK, strain) && has(view.hand, RQ, strain)) return view.seat;
  return null;
}

/** One AI decision for whatever phase the view is in. */
export function decide(view, rng = Math.random) {
  if (view.phase === "bidding") return { kind: "bid", action: chooseBid(view, rng) };
  if (view.phase === "play") return { kind: "play", card: choosePlay(view, rng) };
  return null;
}

/* ================================================================ Practice hints */

/** Suggested bid and card for the human (Practice mode), using the medium AI. */
export function hintFor(view) {
  const v = { ...view, difficulty: "medium" };
  if (view.phase === "bidding") return { kind: "bid", action: chooseBid(v, () => 0.5) };
  if (view.phase === "play") return { kind: "play", card: choosePlay(v, () => 0.5) };
  return null;
}
