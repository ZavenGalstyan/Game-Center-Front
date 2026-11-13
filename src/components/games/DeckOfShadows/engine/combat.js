/**
 * Turn-based card combat — framework-free and deterministic (seeded RNG kept
 * in the state), so it runs the same in the browser, in tests and in bots.
 *
 * Every action returns { S, ev }: a NEW state plus the list of events that
 * produced it. Each event carries `snap`, the HP/Block/status numbers right
 * after it happened, so the UI can play events one by one (card flight,
 * monster reaction, damage numbers) and show the matching numbers while the
 * true state is already final. The whole state is plain JSON (saved mid-battle).
 */
import { cardStats, CARDS } from "./cards.js";
import { ENEMIES } from "./enemies.js";
import { BATTLE_BY_ID } from "./battles.js";

export const HAND_MAX = 10;

/* ------------------------------------------------------------------ rng */
function rand(S) {
  let t = (S.seed = (S.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(S, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(S) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const clone = (S) => JSON.parse(JSON.stringify(S));
const st0 = () => ({ str: 0, weak: 0, vuln: 0, bleed: 0, thorns: 0, ritual: 0, regen: 0 });

function snap(S) {
  return {
    php: S.P.hp,
    pmax: S.P.maxHp,
    pblock: S.P.block,
    pst: { ...S.P.st },
    energy: S.P.energy,
    ehp: S.E.hp,
    emax: S.E.maxHp,
    eblock: S.E.block,
    est: { ...S.E.st },
  };
}
function emit(S, ev, e) {
  e.snap = snap(S);
  ev.push(e);
}

/* ------------------------------------------------------------------ setup */
/**
 * profile: { deck: [refs], maxHp, energy, drawBonus, startBlock, startStr }
 */
export function createBattle(battleId, profile, seed = battleId * 7919 + 13) {
  const B = BATTLE_BY_ID[battleId];
  const D = ENEMIES[B.enemy];
  const S = {
    v: 1,
    battleId,
    seed: seed | 0,
    turn: 0,
    phase: "player",
    mods: [...B.mods],
    uid: 0,
    P: {
      hp: profile.maxHp,
      maxHp: profile.maxHp,
      block: 0,
      energy: 0,
      maxEnergy: profile.energy,
      drawN: 5 + (profile.drawBonus || 0) - (B.mods.includes("fog") ? 1 : 0),
      startBlock: profile.startBlock || 0,
      st: st0(),
    },
    E: {
      key: B.enemy,
      name: D.name,
      hp: Math.round(D.hp * B.hpMul),
      maxHp: Math.round(D.hp * B.hpMul),
      block: 0,
      st: st0(),
      dmgMul: B.dmgMul,
      stage: 1,
      last: null,
      streak: 0,
      intent: null,
    },
    draw: [],
    hand: [],
    discard: [],
    exhaust: [],
    stats: { dealt: 0, taken: 0, played: 0, turns: 0 },
  };
  S.P.st.str = profile.startStr || 0;
  if (B.mods.includes("bloodmoon")) S.E.st.str += 2;
  if (B.mods.includes("armored")) S.E.block = 12;
  if (B.mods.includes("frenzy")) S.E.st.ritual = 1;
  if (B.mods.includes("ember")) S.E.st.thorns = 3;
  const refs = [...profile.deck];
  if (B.mods.includes("curse")) refs.push("dread", "dread");
  S.draw = shuffle(
    S,
    refs.map((r) => ({ u: ++S.uid, r })),
  );
  const ev = [];
  pickIntent(S, true);
  startPlayerTurn(S, ev);
  return { S, ev };
}

/* ------------------------------------------------------------------ enemy moves */
function movesOf(E) {
  const D = ENEMIES[E.key];
  if (E.stage === 3 && D.phase3) return D.phase3.moves;
  if (E.stage >= 2 && D.phase2) return D.phase2.moves;
  return D.moves;
}

function pickIntent(S, first = false) {
  const E = S.E;
  const moves = movesOf(E);
  let pool = moves.filter((m) => (m.hpBelow == null || E.hp / E.maxHp < m.hpBelow) && !(E.last === m.id && E.streak >= (m.max ?? 9)));
  if (first) {
    const f = moves.find((m) => m.first);
    if (f) pool = [f];
  }
  if (!pool.length) pool = moves;
  const total = pool.reduce((a, m) => a + (m.w || 1), 0);
  let r = rand(S) * total;
  let m = pool[0];
  for (const x of pool) {
    r -= x.w || 1;
    if (r <= 0) {
      m = x;
      break;
    }
  }
  E.intent = m.id;
}

export function intentMove(S) {
  return movesOf(S.E).find((m) => m.id === S.E.intent) || null;
}

/** What the intent icon shows: damage per hit (after Strength/Weak/Vulnerable), hits, and effect kinds. */
export function intentInfo(S) {
  const m = intentMove(S);
  if (!m) return null;
  const kinds = [];
  let dmg = 0;
  if (m.dmg) {
    dmg = calcDamage(scaled(S, m.dmg), S.E.st, S.P.st, {});
    kinds.push("attack");
  }
  if (m.block || m.thorns) kinds.push("defend");
  if (m.str || m.ritual || m.regen) kinds.push("buff");
  if (m.weak || m.vuln || m.dread || (m.bleed && !m.dmg)) kinds.push("debuff");
  if (m.heal || m.drain) kinds.push("heal");
  return { id: m.id, name: m.name, dmg, hits: m.hits || 1, kinds, move: m };
}

const scaled = (S, n) => Math.max(1, Math.round(n * S.E.dmgMul));

/* ------------------------------------------------------------------ damage */
export function calcDamage(base, srcSt, tgtSt, opts) {
  let d = base + (srcSt.str || 0);
  if (srcSt.weak > 0) d = Math.floor(d * 0.75);
  if (tgtSt.vuln > 0) d = Math.floor(d * 1.5);
  if (opts.mult) d *= opts.mult;
  return Math.max(0, d);
}

function applyHit(S, ev, who, amount, opts = {}) {
  const U = who === "E" ? S.E : S.P;
  let blocked = 0;
  if (!opts.pierce && U.block > 0) {
    blocked = Math.min(U.block, amount);
    U.block -= blocked;
  }
  const loss = Math.min(U.hp, amount - blocked);
  U.hp -= loss;
  if (who === "E") S.stats.dealt += loss;
  else S.stats.taken += loss;
  emit(S, ev, { t: "hit", who, dmg: amount, blocked, loss, kind: opts.kind || "attack", fx: opts.fx, i: opts.i || 0, n: opts.n || 1 });
  return loss;
}

function loseHp(S, ev, who, n, kind) {
  const U = who === "E" ? S.E : S.P;
  const loss = Math.min(U.hp, n);
  U.hp -= loss;
  if (who === "E") S.stats.dealt += loss;
  else S.stats.taken += loss;
  emit(S, ev, { t: "hit", who, dmg: n, blocked: 0, loss, kind });
  return loss;
}

function heal(S, ev, who, n) {
  const U = who === "E" ? S.E : S.P;
  const h = Math.min(n, U.maxHp - U.hp);
  U.hp += h;
  if (h > 0) emit(S, ev, { t: "heal", who, n: h });
  return h;
}

function addStatus(S, ev, who, key, n) {
  if (!n) return;
  const U = who === "E" ? S.E : S.P;
  U.st[key] = (U.st[key] || 0) + n;
  emit(S, ev, { t: "status", who, key, n });
}

function gainBlock(S, ev, who, n) {
  if (!n) return;
  const U = who === "E" ? S.E : S.P;
  U.block += n;
  emit(S, ev, { t: "block", who, n });
}

/** End the battle if someone is down. Returns true when it ended. */
function checkEnd(S, ev) {
  if (S.phase === "won" || S.phase === "lost") return true;
  if (S.E.hp <= 0) {
    S.phase = "won";
    emit(S, ev, { t: "won" });
    return true;
  }
  if (S.P.hp <= 0) {
    S.phase = "lost";
    emit(S, ev, { t: "lost" });
    return true;
  }
  return false;
}

function checkStage(S, ev) {
  const E = S.E;
  const D = ENEMIES[E.key];
  const next = E.stage === 1 ? D.phase2 : E.stage === 2 ? D.phase3 : null;
  if (!next || E.hp <= 0 || E.hp / E.maxHp > next.at) return;
  E.stage += 1;
  const g = next.gain || {};
  if (g.cleanse) {
    E.st.weak = 0;
    E.st.vuln = 0;
    E.st.bleed = 0;
  }
  emit(S, ev, { t: "stage", stage: E.stage, text: next.text });
  if (g.str) addStatus(S, ev, "E", "str", g.str);
  if (g.ritual) addStatus(S, ev, "E", "ritual", g.ritual);
  if (g.regen) addStatus(S, ev, "E", "regen", g.regen);
  if (g.block) gainBlock(S, ev, "E", g.block);
  E.last = null;
  E.streak = 0;
  if (S.phase === "player") {
    pickIntent(S);
    emit(S, ev, { t: "intent" });
  }
}

/* ------------------------------------------------------------------ cards */
function drawCards(S, ev, n) {
  const got = [];
  for (let i = 0; i < n; i++) {
    if (S.hand.length >= HAND_MAX) break;
    if (!S.draw.length) {
      if (!S.discard.length) break;
      S.draw = shuffle(S, S.discard);
      S.discard = [];
      emit(S, ev, { t: "shuffle" });
    }
    const c = S.draw.pop();
    S.hand.push(c);
    got.push(c.u);
  }
  if (got.length) emit(S, ev, { t: "draw", uids: got });
}

export function canPlay(S, u) {
  if (S.phase !== "player") return "wait";
  const c = S.hand.find((h) => h.u === u);
  if (!c) return "missing";
  const st = cardStats(c.r);
  if (st.cost > S.P.energy) return "energy";
  return null;
}

export function playCard(S0, u) {
  const why = canPlay(S0, u);
  if (why) return { S: S0, ev: [], error: why };
  const S = clone(S0);
  const ev = [];
  const idx = S.hand.findIndex((h) => h.u === u);
  const [card] = S.hand.splice(idx, 1);
  const c = cardStats(card.r);
  S.P.energy -= c.cost;
  S.stats.played++;
  emit(S, ev, { t: "play", u, ref: c.ref, fx: c.fx, kind: c.kind });

  if (c.selfDmg) loseHp(S, ev, "P", c.selfDmg, "pact");
  if (checkEnd(S, ev)) return finishPlay(S, ev, card, c);

  if (c.dmg != null) {
    const hits = c.hits || 1;
    let total = 0;
    for (let i = 0; i < hits; i++) {
      const mult = c.execute && S.E.hp < S.E.maxHp * 0.3 ? c.execute : 1;
      const amt = calcDamage(c.dmg, S.P.st, S.E.st, { mult });
      total += applyHit(S, ev, "E", amt, { pierce: c.pierce, fx: c.fx, i, n: hits, kind: mult > 1 ? "execute" : "attack" });
      if (S.E.st.thorns > 0 && S.P.hp > 0) {
        loseHp(S, ev, "P", S.E.st.thorns, "thorns");
      }
      if (checkEnd(S, ev)) return finishPlay(S, ev, card, c);
      checkStage(S, ev);
    }
    if (c.drain) heal(S, ev, "P", Math.floor(total / 2));
  }
  if (c.bleed) addStatus(S, ev, "E", "bleed", c.bleed);
  if (c.vuln) addStatus(S, ev, "E", "vuln", c.vuln);
  if (c.weak) addStatus(S, ev, "E", "weak", c.weak);
  if (c.block) gainBlock(S, ev, "P", c.block);
  if (c.thorns) addStatus(S, ev, "P", "thorns", c.thorns);
  if (c.str) addStatus(S, ev, "P", "str", c.str);
  if (c.heal) heal(S, ev, "P", c.heal);
  if (c.cleanse) {
    S.P.st.weak = 0;
    S.P.st.vuln = 0;
    S.P.st.bleed = 0;
    emit(S, ev, { t: "cleanse", who: "P" });
  }
  if (c.energy) {
    S.P.energy += c.energy;
    emit(S, ev, { t: "energy", n: c.energy });
  }
  if (c.draw) drawCards(S, ev, c.draw);
  return finishPlay(S, ev, card, c);
}

function finishPlay(S, ev, card, c) {
  if (c.exhaust || c.kind === "power") S.exhaust.push(card);
  else S.discard.push(card);
  return { S, ev };
}

/* ------------------------------------------------------------------ turns */
function startPlayerTurn(S, ev) {
  S.turn += 1;
  S.stats.turns = S.turn;
  S.phase = "player";
  S.P.block = S.turn === 1 ? S.P.startBlock : 0;
  emit(S, ev, { t: "turn", turn: S.turn });
  if (S.P.st.bleed > 0) {
    loseHp(S, ev, "P", S.P.st.bleed, "bleed");
    S.P.st.bleed -= 1;
    if (checkEnd(S, ev)) return;
  }
  if (S.mods.includes("hallowed")) heal(S, ev, "P", 2);
  if (S.P.st.regen > 0) heal(S, ev, "P", S.P.st.regen);
  S.P.energy = S.P.maxEnergy;
  drawCards(S, ev, S.P.drawN);
}

export function endTurn(S0) {
  if (S0.phase !== "player") return { S: S0, ev: [], error: "wait" };
  const S = clone(S0);
  const ev = [];
  // discard the hand; statuses on the player tick down at the end of their turn
  S.discard.push(...S.hand);
  S.hand = [];
  emit(S, ev, { t: "endTurn" });
  if (S.P.st.weak > 0) S.P.st.weak--;
  if (S.P.st.vuln > 0) S.P.st.vuln--;
  S.phase = "enemy";
  enemyTurn(S, ev);
  if (S.phase === "enemy") {
    pickIntent(S);
    startPlayerTurn(S, ev);
  }
  return { S, ev };
}

function enemyTurn(S, ev) {
  const E = S.E;
  E.block = 0;
  emit(S, ev, { t: "enemyTurn" });
  if (E.st.bleed > 0) {
    loseHp(S, ev, "E", E.st.bleed, "bleed");
    E.st.bleed -= 1;
    if (checkEnd(S, ev)) return;
    checkStage(S, ev);
  }
  if (E.st.regen > 0) heal(S, ev, "E", E.st.regen);
  const m = intentMove(S);
  if (!m) return;
  E.streak = E.last === m.id ? E.streak + 1 : 1;
  E.last = m.id;
  emit(S, ev, { t: "move", id: m.id, name: m.name, anim: m.anim, fx: m.fx });
  if (m.block) gainBlock(S, ev, "E", m.block);
  if (m.dmg) {
    const hits = m.hits || 1;
    let total = 0;
    for (let i = 0; i < hits; i++) {
      const amt = calcDamage(scaled(S, m.dmg), E.st, S.P.st, {});
      total += applyHit(S, ev, "P", amt, { fx: m.fx, i, n: hits });
      if (S.P.st.thorns > 0 && E.hp > 0) {
        loseHp(S, ev, "E", S.P.st.thorns, "thorns");
        if (checkEnd(S, ev)) return;
      }
      if (checkEnd(S, ev)) return;
    }
    if (m.drain) heal(S, ev, "E", total);
  }
  if (m.bleed) addStatus(S, ev, "P", "bleed", m.bleed);
  if (m.weak) addStatus(S, ev, "P", "weak", m.weak);
  if (m.vuln) addStatus(S, ev, "P", "vuln", m.vuln);
  if (m.str) addStatus(S, ev, "E", "str", m.str);
  if (m.thorns) addStatus(S, ev, "E", "thorns", m.thorns);
  if (m.heal) heal(S, ev, "E", m.heal);
  if (m.dread) {
    for (let i = 0; i < m.dread; i++) S.discard.push({ u: ++S.uid, r: "dread" });
    emit(S, ev, { t: "dread", n: m.dread });
  }
  if (E.st.ritual > 0) addStatus(S, ev, "E", "str", E.st.ritual);
  if (E.st.weak > 0) E.st.weak--;
  if (E.st.vuln > 0) E.st.vuln--;
  emit(S, ev, { t: "enemyDone" });
  checkEnd(S, ev);
}

/** Stars for a win: by HP left. */
export function starsFor(S) {
  const f = S.P.hp / S.P.maxHp;
  return f >= 0.7 ? 3 : f >= 0.35 ? 2 : 1;
}

export { CARDS };
