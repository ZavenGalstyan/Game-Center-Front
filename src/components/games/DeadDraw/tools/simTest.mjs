/**
 * Headless rules suite for Dead Draw. Run from the repo root:
 *   node src/components/games/DeadDraw/tools/simTest.mjs [all|quick]
 * Checks data validity, invariants on every step of thousands of games
 * played by a random bot and a sensible bot, that all 15 days + every
 * ending + every card + every event choice are reachable, death conditions,
 * save validation, and prints the win rates the balance is tuned against.
 */
import { CARDS, CARD_IDS, START_DECK } from "../engine/cards.js";
import { DAYS, ENDINGS } from "../engine/days.js";
import { CAPS, RES } from "../engine/rules.js";
import { newGame, draw, play, endPlay, choose, night, next, cardPlayable, choiceState, nightForecast, validSave } from "../engine/game.js";

const mode = process.argv[2] || "all";
let fails = 0;
let checks = 0;
const ok = (c, msg) => {
  checks++;
  if (!c) {
    fails++;
    if (fails < 40) console.log("FAIL:", msg);
  }
};

/* ---------------------------------------------------------------- data */
ok(CARD_IDS.length >= 20, `>=20 cards (${CARD_IDS.length})`);
for (const id of CARD_IDS) {
  const C = CARDS[id];
  ok(C.name && C.desc && C.cat && C.risk && C.art && typeof C.run === "function", `card ${id} complete`);
}
for (const cat of ["resource", "defense", "explore", "recovery", "risk"]) ok(CARD_IDS.filter((id) => CARDS[id].cat === cat).length >= 4, `category ${cat} >= 4`);
ok(DAYS.length === 15, "15 days");
DAYS.forEach((D, i) => {
  ok(D.n === i + 1, `day ${i + 1} numbered`);
  ok(D.title && D.objective && D.intro && D.scene, `day ${D.n} text`);
  ok(D.choices.length >= 2, `day ${D.n} >= 2 choices`);
  ok(D.choices.some((c) => !c.req && !c.cost), `day ${D.n} has an always-available choice`);
  for (const id of [...(D.unlock || []), D.dayCard].filter(Boolean)) ok(CARDS[id], `day ${D.n} card ${id} exists`);
});
ok(new Set(DAYS.map((d) => d.intro)).size === 15, "15 distinct events");
const unlockable = new Set([...START_DECK, ...DAYS.flatMap((d) => d.unlock || [])]);
for (const id of CARD_IDS) ok(unlockable.has(id), `card ${id} obtainable`);

/* ---------------------------------------------------------------- invariants */
function inv(S, where) {
  for (const k of RES) ok(Number.isInteger(S.res[k]) && S.res[k] >= 0 && S.res[k] <= CAPS[k], `${where}: ${k}=${S.res[k]}`);
  ok(S.threat >= 0 && S.threat <= 10, `${where}: threat`);
  ok(S.fortify >= 0 && S.fortify <= 3, `${where}: fortify`);
  ok(S.hand.length <= 3, `${where}: hand size`);
  ok(S.actions >= 0 && S.actions <= 2, `${where}: actions`);
  ok(S.day >= 1 && S.day <= 15, `${where}: day`);
  if (S.res.hp <= 0) ok(S.phase === "dead", `${where}: hp 0 means dead (${S.phase})`);
  ok(validSave(JSON.parse(JSON.stringify(S))), `${where}: save valid`);
}

/* ---------------------------------------------------------------- bots */
function score(S) {
  if (S.phase === "dead") return -1000;
  const r = S.res;
  const need = (v, w) => Math.min(v, 6) * w + Math.max(0, v - 6) * w * 0.3;
  return r.hp * 1.0 + need(r.food, 6) + need(r.water, 6) + need(r.power, 5) + need(r.scrap, 3) - S.threat * 3 + S.fortify * 6 + (S.companion ? 10 : 0) + (S.flags.radioContact ? 15 : 0) + (S.flags.keycard ? 5 : 0) - S.status.sick * 6 - (S.status.generatorBroken ? 8 : 0) - (S.status.contaminated ? 6 : 0);
}
function expected(S, f, n = 6) {
  let t = 0;
  for (let k = 0; k < n; k++) {
    const T = structuredClone(S);
    T.rng = (T.rng ^ (k * 2654435761)) | 0;
    const R = f(T);
    let v = score(R);
    if (R.phase === "aftermath") {
      const N = night(R);
      v = score(N);
    }
    t += v;
  }
  return t / n;
}

const BOTS = {
  random(S, r) {
    if (S.phase === "play") {
      const opts = S.hand.map((id, i) => i).filter((i) => cardPlayable(S, S.hand[i]));
      if (!opts.length || S.actions === 0 || r() < 0.1) return endPlay(S);
      return play(S, opts[Math.floor(r() * opts.length)]);
    }
    const D = DAYS[S.day - 1];
    const opts = D.choices.filter((c) => choiceState(S, c).ok);
    return choose(S, opts[Math.floor(r() * opts.length)].id);
  },
  smart(S) {
    if (S.phase === "play") {
      if (S.actions === 0) return endPlay(S);
      let best = { v: expected(S, (T) => endPlay(T), 1) - 4, f: (T) => endPlay(T) };
      S.hand.forEach((id, i) => {
        if (!cardPlayable(S, id)) return;
        // look ahead to the night: defence matters
        const v = expected(S, (T) => {
          const P = play(T, i);
          if (P.phase === "dead") return P;
          const fc = nightForecast(P);
          P.res.hp -= Math.max(0, fc.pressure - fc.defense) * 5;
          P.res.hp = Math.max(1, P.res.hp);
          return P;
        });
        if (v > best.v) best = { v, f: (T) => play(T, i) };
      });
      return best.f(S);
    }
    const D = DAYS[S.day - 1];
    let best = null;
    for (const c of D.choices) {
      if (!choiceState(S, c).ok) continue;
      const v = expected(S, (T) => choose(T, c.id));
      if (!best || v > best.v) best = { v, id: c.id };
    }
    return choose(S, best.id);
  },
};

function runGame(bot, seed, coverage) {
  let S = newGame(seed);
  let br = seed;
  const r = () => {
    br = (br * 1103515245 + 12345) & 0x7fffffff;
    return br / 0x7fffffff;
  };
  inv(S, "new");
  let guard = 0;
  while (S.phase !== "dead" && S.phase !== "won" && guard++ < 400) {
    const before = S.phase;
    if (S.phase === "dawn") S = draw(S);
    else if (S.phase === "play" || S.phase === "event") {
      const prev = S;
      S = BOTS[bot](S, r);
      if (before === "play" && S.lastCard && S !== prev) coverage.cards.add(S.lastCard.id);
      if (before === "event" && S.lastEvent) coverage.choices.add(`${S.day}:${S.lastEvent.choice}`);
    } else if (S.phase === "aftermath") S = night(S);
    else if (S.phase === "dusk") S = next(S);
    coverage.days.add(S.day);
    inv(S, `${bot}#${seed} d${S.day} ${before}->${S.phase}`);
  }
  ok(guard < 400, "game terminates");
  return S;
}

const N = mode === "quick" ? 300 : 2500;
const coverage = { days: new Set(), cards: new Set(), choices: new Set() };
const endings = {};
const deaths = {};
for (const bot of ["random", "smart"]) {
  let won = 0;
  let dayHist = new Array(16).fill(0);
  for (let s = 1; s <= N; s++) {
    const S = runGame(bot, s * 7919 + (bot === "smart" ? 13 : 0), coverage);
    if (S.phase === "won") {
      won++;
      endings[S.ending] = (endings[S.ending] || 0) + 1;
      ok(ENDINGS[S.ending], `ending ${S.ending} defined`);
    } else {
      deaths[S.cause] = (deaths[S.cause] || 0) + 1;
      dayHist[S.day]++;
    }
  }
  console.log(`${bot}: win ${((won / N) * 100).toFixed(1)}%  deaths by day ${dayHist.slice(1).join(" ")}`);
  if (bot === "smart") ok(won / N > 0.6, `smart bot wins often (${won / N})`);
  if (bot === "random") ok(won / N < 0.6, `random play is punished (${won / N})`);
}
console.log("endings", endings, "\ndeath causes", deaths);
ok(coverage.days.size === 15, `all 15 days reached (${coverage.days.size})`);
for (const id of CARD_IDS) ok(coverage.cards.has(id), `card ${id} played by a bot`);
DAYS.forEach((D) => D.choices.forEach((c) => ok(coverage.choices.has(`${D.n}:${c.id}`), `choice ${D.n}:${c.id} taken`)));
for (const e of Object.keys(ENDINGS)) ok(endings[e], `ending ${e} reached`);

/* ---------------------------------------------------------------- targeted */
{
  // costs are never paid partially; unaffordable cards are refused
  let S = draw(newGame(42));
  S.res.power = 0;
  const i = S.hand.indexOf("search_supplies");
  const T = play(S, i);
  ok(T === S, "unaffordable card refused");
  // starvation / thirst penalties instead of negatives
  S = newGame(5);
  S.res.food = 0;
  S.res.water = 0;
  S.phase = "dusk";
  S = next(S);
  ok(S.res.food === 0 && S.res.water === 0 && S.res.hp === 76, `starve+thirst = -24 hp (${S.res.hp})`);
  ok(S.report.notes.includes("starving") && S.report.notes.includes("thirsty"), "dawn report notes shortages");
  // death by hunger
  S.res.hp = 5;
  S.phase = "dusk";
  S = next(S);
  ok(S.phase === "dead" && S.cause === "starvation", `death by starvation (${S.phase} ${S.cause})`);
  // day 15 needs radio contact for the hatch
  S = newGame(9);
  S.day = 15;
  S.phase = "event";
  ok(!choiceState(S, DAYS[14].choices[0]).ok, "hatch locked without contact");
  S.flags.radioContact = true;
  ok(choiceState(S, DAYS[14].choices[0]).ok, "hatch open with contact");
  S = choose(S, "hatch");
  ok(S.phase === "won" && S.ending === "rescued", "rescue ending");
  // corrupted saves rejected
  ok(!validSave({ v: 1, day: 99 }), "bad day rejected");
  ok(!validSave(null), "null rejected");
  const G = newGame(3);
  G.res.food = -3;
  ok(!validSave(G), "negative resource rejected");
  const H = newGame(3);
  H.hand = ["nope"];
  ok(!validSave(H), "unknown card rejected");
  // determinism
  const a = JSON.stringify(runGame("smart", 777, coverage));
  const b = JSON.stringify(runGame("smart", 777, coverage));
  ok(a === b, "deterministic replay");
}

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
