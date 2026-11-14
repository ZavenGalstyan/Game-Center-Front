/**
 * Headless tests for Deck of Shadows (no browser):
 *   node src/components/games/DeckOfShadows/tools/simTest.mjs [core|cards|save|campaign|all]
 *
 * core      combat rules: damage math, block, statuses, bleed, thorns, phases, end conditions
 * cards     every card's printed text matches what it does
 * save      progression, rewards, sanctum, save/load round-trip
 * campaign  the bot plays all 20 battles in order with a real save (grinding
 *           replays when it loses) — proves every battle is beatable with
 *           progression and reports how hard each one is
 */
import { CARDS, CARD_IDS, STARTER_DECK, cardStats, cardLines } from "../engine/cards.js";
import { ENEMIES } from "../engine/enemies.js";
import { BATTLES } from "../engine/battles.js";
import { createBattle, playCard, endTurn, calcDamage, intentInfo, starsFor } from "../engine/combat.js";
import { freshProgress, profileOf, applyVictory, loadProgress, saveProgress, buyTalent, canTalent, upgradeCard, canUpgrade, takeReward, removeCard, canRemove, buyCard, canBuy, SAVE_KEY, TALENTS } from "../engine/progress.js";
import { botBattle } from "./bot.mjs";

let pass = 0;
let fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.log("FAIL:", m);
  }
};
const mode = process.argv[2] || "all";
const mulberry = (a) => () => {
  let t = (a = (a + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const prof = (deck = STARTER_DECK) => ({ deck, maxHp: 60, energy: 3, drawBonus: 0, startBlock: 0, startStr: 0 });
const handWith = (S, ref) => {
  S.hand.push({ u: ++S.uid, r: ref });
  return S.uid;
};

function core() {
  // damage math
  ok(calcDamage(6, { str: 0 }, {}, {}) === 6, "plain dmg");
  ok(calcDamage(6, { str: 2 }, {}, {}) === 8, "strength adds");
  ok(calcDamage(8, { weak: 1 }, {}, {}) === 6, "weak 25%");
  ok(calcDamage(6, {}, { vuln: 1 }, {}) === 9, "vulnerable 50%");
  ok(calcDamage(10, {}, {}, { mult: 3 }) === 30, "execute mult");

  let { S, ev } = createBattle(1, prof());
  ok(S.hand.length === 5, "draws 5");
  ok(S.P.energy === 3, "3 energy");
  ok(S.phase === "player" && S.turn === 1, "player turn 1");
  ok(ev.some((e) => e.t === "draw"), "draw event");
  ok(intentInfo(S) != null, "enemy has an intent");
  ok(S.E.maxHp === Math.round(ENEMIES.skeleton.hp * BATTLES[0].hpMul), "hpMul applied");

  // play a strike
  S.hand = [];
  const u = handWith(S, "shadow_strike");
  const hp0 = S.E.hp;
  const r = playCard(S, u);
  ok(r.S.E.hp === hp0 - 6, "strike deals 6");
  ok(r.S.P.energy === 2, "costs 1 energy");
  ok(r.S.discard.some((c) => c.u === u), "card discarded");
  ok(S.E.hp === hp0, "original state untouched (pure)");
  ok(r.ev.find((e) => e.t === "hit").snap.ehp === hp0 - 6, "snap carries hp");

  // not enough energy
  S = r.S;
  S.P.energy = 0;
  const u2 = handWith(S, "shadow_strike");
  ok(playCard(S, u2).error === "energy", "energy check");

  // block absorbs, then decays on next player turn
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  const ub = handWith(S, "dark_barrier");
  S = playCard(S, ub).S;
  ok(S.P.block === 5, "block 5");
  S.E.intent = "slash";
  const before = S.P.hp;
  const dmg = calcDamage(Math.round(7 * BATTLES[0].dmgMul), S.E.st, S.P.st, {});
  const r2 = endTurn(S);
  ok(r2.S.P.hp === before - Math.max(0, dmg - 5), `block absorbed (${before}→${r2.S.P.hp}, dmg ${dmg})`);
  ok(r2.S.P.block === 0, "block resets at turn start");
  ok(r2.S.turn === 2 && r2.S.hand.length === 5, "turn 2 drew 5");

  // bleed ticks at enemy turn start and decays
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  S = playCard(S, handWith(S, "blood_slash")).S;
  ok(S.E.st.bleed === 3, "bleed applied");
  const eh = S.E.hp;
  S.E.intent = "rattle";
  const r3 = endTurn(S);
  ok(r3.S.E.hp === eh - 3 && r3.S.E.st.bleed === 2, "bleed ticked 3 and decayed");

  // thorns punish attacks
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  S = playCard(S, handWith(S, "bone_armor")).S;
  ok(S.P.st.thorns === 3 && S.exhaust.length === 1, "power: thorns, removed for battle");
  S.E.intent = "thrust";
  const ehp = S.E.hp;
  S = endTurn(S).S;
  ok(S.E.hp === ehp - 6, "thorns hit twice for 3");

  // vulnerable lasts through the player turn
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  S = playCard(S, handWith(S, "cursed_mark")).S;
  const e0 = S.E.hp;
  S = playCard(S, handWith(S, "shadow_strike")).S;
  ok(e0 - S.E.hp === 9, "vulnerable boosts");

  // multi-hit + execute + pierce + drain
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  S.E.block = 10;
  S = playCard(S, handWith(S, "silver_stake")).S;
  ok(S.E.block === 10 && S.E.maxHp - S.E.hp === 8, "pierce ignores block");
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  S.E.hp = 8;
  S.P.energy = 5;
  const rr = playCard(S, handWith(S, "executioner"));
  ok(rr.S.phase === "won" && rr.ev.some((e) => e.kind === "execute"), "execute below 30% wins");
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  S.P.hp = 30;
  S.P.energy = 5;
  S = playCard(S, handWith(S, "soul_drain")).S;
  ok(S.P.hp === 34, `drain heals half (${S.P.hp})`);
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  S.P.energy = 5;
  const hits = playCard(S, handWith(S, "spectral_blades")).ev.filter((e) => e.t === "hit");
  ok(hits.length === 3 && hits.every((h) => h.dmg === 4), "3 hits of 4");

  // win / lose
  ({ S } = createBattle(1, prof()));
  S.hand = [];
  S.E.hp = 3;
  const w = playCard(S, handWith(S, "shadow_strike"));
  ok(w.S.phase === "won" && w.ev.at(-1).t === "won", "win event");
  ok(starsFor(w.S) === 3, "3 stars at full hp");
  ({ S } = createBattle(1, prof()));
  S.P.hp = 1;
  S.E.intent = "slash";
  const l = endTurn(S);
  ok(l.S.phase === "lost" && l.ev.some((e) => e.t === "lost"), "loss");
  ok(playCard(l.S, 1).error === "wait" && endTurn(l.S).error === "wait", "no actions after loss");

  // boss phase change
  ({ S } = createBattle(5, prof()));
  S.hand = [];
  S.P.energy = 99;
  S.E.hp = Math.floor(S.E.maxHp * 0.5) + 3;
  const ph = playCard(S, handWith(S, "shadow_strike"));
  ok(ph.S.E.stage === 2 && ph.ev.some((e) => e.t === "stage"), "boss phase 2 at 50%");
  ok(ph.S.E.st.str >= 3, "phase gain applied");
  ({ S } = createBattle(20, prof()));
  S.hand = [];
  S.P.energy = 99;
  S.E.hp = Math.floor(S.E.maxHp * 0.25) + 2;
  S.E.stage = 2;
  const p3 = playCard(S, handWith(S, "shadow_strike"));
  ok(p3.S.E.stage === 3, "lord phase 3");

  // dread + mods
  ({ S } = createBattle(8, prof()));
  ok([...S.draw, ...S.hand].filter((c) => c.r === "dread").length === 2, "curse mod adds 2 dread");
  ({ S } = createBattle(6, prof()));
  ok(S.hand.length === 4, "fog draws 4");
  ({ S } = createBattle(4, prof()));
  ok(S.E.block === 12, "armored");
  ({ S } = createBattle(9, prof()));
  S.E.intent = "curse";
  const d = endTurn(S).S;
  ok([...d.discard, ...d.hand, ...d.draw].filter((c) => c.r === "dread").length === 2, "witch curse adds dread");

  // every enemy move resolves without NaN across many turns
  for (const B of BATTLES) {
    let { S: s } = createBattle(B.id, prof());
    for (let t = 0; t < 30 && s.phase === "player"; t++) {
      s.P.hp = s.P.maxHp;
      s = endTurn(s).S;
      ok(Number.isFinite(s.P.hp) && Number.isFinite(s.E.hp) && s.E.intent, `battle ${B.id} turn ${t} sane`);
    }
  }
  // determinism
  const a = botBattle(createBattle(7, prof()).S, mulberry(1));
  const b = botBattle(createBattle(7, prof()).S, mulberry(1));
  ok(JSON.stringify(a) === JSON.stringify(b), "deterministic");
}

function cards() {
  for (const id of Object.keys(CARDS)) {
    for (const ref of [id, `${id}+`]) {
      const c = cardStats(ref);
      ok(c && cardLines(c).length > 0, `${ref} has text`);
      ok(c.cost >= 0 && Number.isFinite(c.cost), `${ref} cost`);
    }
    const { S: S0 } = createBattle(3, prof());
    const S = JSON.parse(JSON.stringify(S0));
    S.hand = [];
    S.P.energy = 9;
    S.P.hp = 30;
    S.E.block = 0;
    S.E.st.vuln = 0;
    const u = handWith(S, id);
    const c = cardStats(id);
    const r = playCard(S, u);
    ok(!r.error, `${id} playable`);
    const R = r.S;
    if (c.dmg != null) ok(S.E.hp - R.E.hp === c.dmg * (c.hits || 1), `${id} deals ${c.dmg}×${c.hits || 1}`);
    if (c.block) ok(R.P.block === c.block, `${id} block`);
    if (c.bleed) ok(R.E.st.bleed === c.bleed, `${id} bleed`);
    if (c.vuln) ok(R.E.st.vuln === c.vuln, `${id} vuln`);
    if (c.weak) ok(R.E.st.weak === c.weak, `${id} weak`);
    if (c.str) ok(R.P.st.str === c.str, `${id} str`);
    if (c.heal && !c.dmg) ok(R.P.hp === Math.min(R.P.maxHp, 30 + c.heal - (c.selfDmg || 0)), `${id} heal`);
    if (c.energy) ok(R.P.energy === 9 - c.cost + c.energy, `${id} energy`);
    if (c.selfDmg) ok(R.P.hp === 30 - c.selfDmg, `${id} self damage`);
    if (c.draw) ok(R.hand.length === Math.min(c.draw, S.draw.length + S.discard.length), `${id} draws`);
    if (c.exhaust || c.kind === "power") ok(R.exhaust.some((x) => x.u === u), `${id} exhausted`);
    else ok(R.discard.some((x) => x.u === u), `${id} discarded`);
  }
}

function save() {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  let p = freshProgress();
  ok(profileOf(p).maxHp === 60 && profileOf(p).energy === 3, "base profile");
  const v = applyVictory(p, 1, 3, mulberry(3));
  p = v.p;
  ok(v.report.first && v.report.unlocked === "wraith_step", "first win unlocks");
  ok(p.collection.includes("wraith_step") && p.deck.includes("wraith_step"), "unlock added");
  ok(p.unlocked === 2 && p.battles[1].stars === 3, "next battle unlocked");
  ok(v.report.choices.length === 3, "3 reward choices");
  const v2 = applyVictory(p, 1, 1, mulberry(4));
  ok(!v2.report.first && v2.report.xp < v.report.xp && v2.p.battles[1].stars === 3, "replay keeps best stars, less xp");
  p = { ...p, level: 5, sp: 5, shards: 999 };
  ok(canTalent(p, "reserves") === "level", "reserves needs level 8");
  p = buyTalent(p, "vitality");
  ok(p.talents.vitality === 1 && p.sp === 4 && profileOf(p).maxHp === 60 + 16 + 8, "vitality");
  p = buyTalent(p, "insight");
  ok(profileOf(p).drawBonus === 1 && p.sp === 2, "insight");
  const i = p.deck.indexOf("shadow_strike");
  ok(!canUpgrade(p, i), "can upgrade");
  p = upgradeCard(p, i);
  ok(p.deck[i] === "shadow_strike+" && cardStats("shadow_strike+").dmg === 9, "upgraded");
  ok(canUpgrade(p, i) === "no", "no double upgrade");
  const n = p.deck.length;
  p = removeCard(p, 0);
  ok(p.deck.length === n - 1, "remove");
  ok(canBuy(p, "doom_ritual") === "locked", "can't buy locked");
  p = buyCard(p, "wraith_step");
  ok(p.deck.length === n, "buy");
  p = takeReward(p, "blood_slash");
  ok(p.deck.length === n + 1, "reward");
  let q = { ...p, deck: p.deck.slice(0, 8) };
  ok(canRemove(q, 0) === "min", "deck min");
  // mid-battle snapshot survives save/load
  const { S } = createBattle(2, profileOf(p));
  p.current = { battleId: 2, S };
  saveProgress(p, store);
  const L = loadProgress(store);
  ok(JSON.stringify(L) === JSON.stringify(p), "round trip");
  ok(L.current.S.hand.length === S.P.drawN, "battle restored");
  mem.set(SAVE_KEY, "{broken");
  ok(loadProgress(store).level === 1, "corrupt save → fresh");
  mem.set(SAVE_KEY, JSON.stringify({ v: 1, level: 3, deck: ["nope"], collection: [], talents: {}, battles: {} }));
  const fixed = loadProgress(store);
  ok(fixed.deck.length >= 8 && fixed.settings.quality, "repairs bad decks / missing settings");
  ok(Object.keys(TALENTS).length === 5, "talents");
}

/** A sensible player between battles: spend points and shards. */
function manage(p, rnd) {
  const order = ["vitality", "insight", "reserves", "might", "vitality", "bulwark", "vitality", "might", "bulwark"];
  for (const k of order) if (!canTalent(p, k)) p = buyTalent(p, k);
  const prio = ["doom_ritual", "executioner", "bone_crusher", "spectral_blades", "hellfire", "soul_drain", "grave_ward", "rage_fallen", "shadow_strike", "blood_slash", "dark_barrier"];
  for (const id of prio) {
    const i = p.deck.indexOf(id);
    if (i >= 0 && !canUpgrade(p, i) && p.shards > 140) p = upgradeCard(p, i);
  }
  // thin the starter cards once better cards are in
  while (p.deck.length > 12 && p.shards > 120) {
    const i = p.deck.findIndex((r) => r === "shadow_strike" || r === "dark_barrier");
    if (i < 0 || canRemove(p, i)) break;
    p = removeCard(p, i);
  }
  void rnd;
  return p;
}

function pickReward(choices) {
  const rank = { legendary: 4, epic: 3, rare: 2, common: 1 };
  const good = choices.filter((id) => !["shadow_strike", "dark_barrier"].includes(id));
  return good.sort((a, b) => rank[CARDS[b].rarity] - rank[CARDS[a].rarity])[0];
}

function campaign(seed = 1, skill = 0.85, verbose = true) {
  const rnd = mulberry(seed);
  let p = freshProgress();
  const rows = [];
  let totalLosses = 0;
  for (const B of BATTLES) {
    let tries = 0;
    let won = false;
    while (!won && tries < 12) {
      tries++;
      const S = botBattle(createBattle(B.id, profileOf(p), Math.floor(rnd() * 1e9)).S, rnd, skill);
      if (S.phase === "won") {
        const r = applyVictory(p, B.id, starsFor(S), rnd);
        p = r.p;
        const pick = pickReward(r.report.choices);
        if (pick && p.deck.length < 22) p = takeReward(p, pick);
        rows.push({ id: B.id, tries, turns: S.turn, hp: `${S.P.hp}/${S.P.maxHp}`, lvl: p.level, deck: p.deck.length });
        won = true;
      } else {
        totalLosses++;
        // grind: replay the previous battle once for XP/shards
        if (B.id > 1) {
          const g = botBattle(createBattle(B.id - 1, profileOf(p), Math.floor(rnd() * 1e9)).S, rnd, skill);
          if (g.phase === "won") p = applyVictory(p, B.id - 1, starsFor(g), rnd).p;
        }
      }
      p = manage(p, rnd);
    }
    ok(won, `seed ${seed}: battle ${B.id} beaten within 12 tries`);
    if (!won) break;
  }
  if (verbose) console.table(rows);
  return { rows, losses: totalLosses, level: p.level };
}

/** Win rate of each battle for a player at the "expected" progression point. */
function difficulty() {
  // build the expected profile by a clean campaign run, then sample each battle
  const rnd = mulberry(99);
  let p = freshProgress();
  const out = [];
  for (const B of BATTLES) {
    let wins = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const S = botBattle(createBattle(B.id, profileOf(p), i * 7717 + 3).S, mulberry(i + 1), 0.85);
      if (S.phase === "won") wins++;
    }
    out.push({ id: B.id, enemy: B.enemy, winRate: `${Math.round((wins / N) * 100)}%`, lvl: p.level, hp: profileOf(p).maxHp, deck: p.deck.length });
    // advance with a win
    for (let t = 0; t < 20; t++) {
      const S = botBattle(createBattle(B.id, profileOf(p), Math.floor(rnd() * 1e9)).S, rnd, 0.85);
      if (S.phase === "won") {
        const r = applyVictory(p, B.id, starsFor(S), rnd);
        p = r.p;
        const pick = pickReward(r.report.choices);
        if (pick && p.deck.length < 22) p = takeReward(p, pick);
        break;
      }
      p = applyVictory(p, Math.max(1, B.id - 1), 1, rnd).p;
    }
    p = manage(p, rnd);
  }
  console.table(out);
  return out;
}

if (mode === "core" || mode === "all") core();
if (mode === "cards" || mode === "all") cards();
if (mode === "save" || mode === "all") save();
if (mode === "campaign" || mode === "all") {
  for (let s = 1; s <= 6; s++) {
    const r = campaign(s, s % 2 ? 0.6 : 0.85, s === 1);
    console.log(`seed ${s}: losses ${r.losses}, final level ${r.level}`);
  }
}
if (mode === "difficulty") difficulty();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
