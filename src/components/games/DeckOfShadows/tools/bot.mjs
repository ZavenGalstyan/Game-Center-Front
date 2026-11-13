/**
 * Heuristic card-combat bot (tests + browser harness). Plays like a careful
 * human: blocks what's coming, takes lethal, sets up debuffs before attacks.
 * `skill` 0..1 adds mistakes (random plays) at lower values.
 */
import { cardStats } from "../engine/cards.js";
import { calcDamage, canPlay, intentInfo, playCard, endTurn } from "../engine/combat.js";

function incoming(S) {
  const I = intentInfo(S);
  if (!I || !I.kinds.includes("attack")) return 0;
  return I.dmg * I.hits;
}

export function scoreCard(S, h) {
  const c = cardStats(h.r);
  if (c.kind === "curse") return S.P.energy > 1 ? 0.3 : -1;
  const P = S.P;
  const E = S.E;
  let v = 0;
  const inc = Math.max(0, incoming(S) - P.block);
  if (c.dmg != null) {
    const hits = c.hits || 1;
    const mult = c.execute && E.hp < E.maxHp * 0.3 ? c.execute : 1;
    let d = calcDamage(c.dmg, P.st, E.st, { mult }) * hits;
    if (!c.pierce) d = Math.max(0, d - E.block * 0.7);
    v += d;
    if (d >= E.hp + (c.pierce ? 0 : E.block)) v += 1000;
    if (c.drain) v += Math.min(d / 2, P.maxHp - P.hp) * 0.8;
    if (E.st.thorns) v -= E.st.thorns * hits * 0.8;
  }
  if (c.bleed) v += Math.min(c.bleed * 2, E.hp);
  if (c.vuln) v += E.st.vuln > 0 ? 2 : 6;
  if (c.weak) v += incoming(S) > 0 ? c.weak * 3 : c.weak * 1.5;
  if (c.block) v += Math.min(c.block, inc) * 1.15 + Math.max(0, c.block - inc) * 0.15;
  if (c.thorns) v += c.thorns * 2.5;
  if (c.str) v += c.str * 6;
  if (c.heal) v += Math.min(c.heal, P.maxHp - P.hp) * 0.9;
  if (c.cleanse) v += (P.st.weak + P.st.vuln) * 2 + P.st.bleed;
  if (c.selfDmg) v -= c.selfDmg * (P.hp < 15 ? 3 : 0.6);
  if (c.energy) v += c.energy * 8;
  if (c.draw) v += c.draw * 4;
  return v / Math.max(0.6, c.cost);
}

/** Play one turn: returns the state after ending the turn. */
export function botTurn(S, rnd = Math.random, skill = 1) {
  let guard = 0;
  while (S.phase === "player" && guard++ < 40) {
    const playable = S.hand.filter((h) => !canPlay(S, h.u));
    if (!playable.length) break;
    let best = null;
    let bestV = 0;
    for (const h of playable) {
      let v = scoreCard(S, h);
      if (skill < 1) v *= 1 + (rnd() - 0.5) * (1 - skill) * 2;
      if (v > bestV) {
        bestV = v;
        best = h;
      }
    }
    if (!best) break;
    S = playCard(S, best.u).S;
  }
  if (S.phase === "player") S = endTurn(S).S;
  return S;
}

export function botBattle(S, rnd = Math.random, skill = 1, maxTurns = 80) {
  while ((S.phase === "player" || S.phase === "enemy") && S.turn < maxTurns) S = botTurn(S, rnd, skill);
  return S;
}
