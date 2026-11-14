/**
 * The day loop as a pure state machine. Every function takes the state,
 * mutates a structured clone and returns it (React can hold it as-is).
 *
 *   dawn ──draw──▶ play ──endPlay──▶ event ──choose──▶ aftermath ──night──▶ dusk ──next──▶ dawn
 *                                                   └─ (day 15) ──▶ won
 *   any step can end in "dead" when Health reaches 0.
 */
import { CARDS, START_DECK, FREE_CARDS } from "./cards.js";
import { DAYS, dayOf, DAY_COUNT, NIGHT_TEXT, deathKey } from "./days.js";
import { CAPS, RES, rngOf, gain, hurt, heal, addThreat, canPay, pay, totalDefense, takeFx } from "./rules.js";

export const SAVE_VERSION = 1;
export const HAND_SIZE = 3;
export const ACTIONS_PER_DAY = 2;
const TUTORIAL_HAND = ["search_supplies", "barricade_door", "find_water"];

const clone = (S) => structuredClone(S);

function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newGame(seed = (Math.random() * 2 ** 31) | 0) {
  const S = {
    v: SAVE_VERSION,
    seed,
    rng: seed | 0,
    day: 1,
    phase: "dawn",
    res: { hp: 100, food: 6, water: 6, power: 6, scrap: 4 },
    threat: 1,
    defense: 0,
    fortify: 0,
    companion: false,
    status: { sick: 0, generatorBroken: false, contaminated: false, forewarned: false, prepared: false },
    flags: {},
    decisions: {},
    deck: [],
    discard: [],
    hand: [],
    exhausted: [],
    unlocked: [...new Set(START_DECK)],
    actions: ACTIONS_PER_DAY,
    played: [],
    report: null,
    lastCard: null,
    lastEvent: null,
    eventPre: null,
    night: null,
    ending: null,
    cause: null,
    fx: {},
    stats: { cards: 0, damage: 0, nights: 0, breaches: 0 },
  };
  S.deck = shuffle([...START_DECK], rngOf(S));
  return beginDay(S);
}

/** Dawn: consumption, sickness, unlocks. Mutates S (already a clone). */
function beginDay(S) {
  const D = dayOf(S.day);
  const notes = [];
  S.defense = 0;
  S.actions = ACTIONS_PER_DAY;
  S.played = [];
  S.status.forewarned = false;
  S.status.prepared = false;
  S.lastCard = null;
  S.lastEvent = null;
  S.eventPre = null;
  S.night = null;
  takeFx(S);
  if (S.day > 1) {
    const needFood = 1 + (S.companion ? 1 : 0);
    const needPower = 1 + (S.status.generatorBroken ? 1 : 0);
    if (S.res.food >= needFood) gain(S, { food: -needFood });
    else {
      gain(S, { food: -S.res.food });
      hurt(S, 10, "starvation");
      notes.push("starving");
    }
    if (S.res.water >= 1) gain(S, { water: -1 });
    else {
      hurt(S, 14, "thirst");
      notes.push("thirsty");
    }
    if (S.res.power >= needPower) gain(S, { power: -needPower });
    else {
      gain(S, { power: -S.res.power });
      hurt(S, 5, "cold");
      addThreat(S, 1);
      notes.push("dark");
    }
    if (S.status.sick > 0) {
      hurt(S, 6, "sickness");
      S.status.sick--;
      notes.push("sick");
    }
    // a full stomach heals: well fed and watered after the morning ration
    if (S.status.sick === 0 && !notes.length && S.res.food >= 3 && S.res.water >= 3) {
      heal(S, 5);
      notes.push("rested");
    }
    if (S.status.generatorBroken) notes.push("generator");
    if (S.status.contaminated) notes.push("contaminated");
  }
  const unlocked = [];
  for (const id of D.unlock || []) {
    S.deck.push(id);
    if (!S.unlocked.includes(id)) {
      S.unlocked.push(id);
      unlocked.push(id);
    }
  }
  if (unlocked.length) shuffle(S.deck, rngOf(S));
  S.report = { fx: takeFx(S), notes, unlocked };
  S.phase = S.res.hp <= 0 ? "dead" : "dawn";
  return S;
}

function drawOne(S, r, avoid) {
  if (!S.deck.length) {
    S.deck = shuffle(S.discard.splice(0), r);
    if (!S.deck.length) return null;
  }
  // prefer a card not already in hand (fair variety), else take the top one
  let i = S.deck.findIndex((id) => !avoid.includes(id));
  if (i < 0) i = 0;
  return S.deck.splice(i, 1)[0];
}

export function draw(S0) {
  const S = clone(S0);
  if (S.phase !== "dawn") return S;
  const r = rngOf(S);
  const D = dayOf(S.day);
  S.hand = [];
  if (S.day === 1) S.hand = [...TUTORIAL_HAND];
  else {
    if (D.dayCard) S.hand.push(D.dayCard);
    while (S.hand.length < HAND_SIZE) {
      const id = drawOne(S, r, S.hand);
      if (!id) break;
      S.hand.push(id);
    }
    // fairness: never deal a hand with nothing playable
    if (!S.hand.some((id) => canPay(S, CARDS[id].cost))) {
      const free = FREE_CARDS.filter((id) => S.unlocked.includes(id) && !S.exhausted.includes(id));
      const pick = free.length ? free[Math.floor(r() * free.length)] : "search_storage";
      S.discard.push(S.hand.pop());
      S.hand.push(pick);
    }
  }
  S.phase = "play";
  return S;
}

export function cardPlayable(S, id) {
  return S.phase === "play" && S.actions > 0 && canPay(S, CARDS[id].cost);
}

/** Play the hand card at index i. Returns the new state; S.lastCard holds the outcome. */
export function play(S0, i) {
  const id = S0.hand[i];
  if (!id || !cardPlayable(S0, id)) return S0;
  const S = clone(S0);
  const C = CARDS[id];
  takeFx(S);
  pay(S, C.cost);
  const out = C.run(S, rngOf(S));
  S.hand.splice(i, 1);
  if (C.exhaust) S.exhausted.push(id);
  // the day-1 tutorial hand is dealt from outside the deck, so it is not discarded
  else if (S.day > 1) S.discard.push(id);
  S.actions--;
  S.played.push(id);
  S.stats.cards++;
  S.lastCard = { id, ...out, fx: takeFx(S) };
  if (S.res.hp <= 0) S.phase = "dead";
  return S;
}

/** Finish the card phase: the rest of the hand is discarded, the event begins. */
export function endPlay(S0) {
  if (S0.phase !== "play") return S0;
  const S = clone(S0);
  if (S.day > 1) S.discard.push(...S.hand);
  S.hand = [];
  S.lastCard = null;
  takeFx(S);
  dayOf(S.day).begin?.(S);
  S.eventPre = takeFx(S);
  S.phase = S.res.hp <= 0 ? "dead" : "event";
  return S;
}

export function choiceState(S, c) {
  if (c.req && !c.req(S)) return { ok: false, why: c.reqText || "Unavailable" };
  if (c.cost && !canPay(S, c.cost)) return { ok: false, why: "cost" };
  return { ok: true };
}

export function choose(S0, choiceId) {
  if (S0.phase !== "event") return S0;
  const D = dayOf(S0.day);
  const c = D.choices.find((x) => x.id === choiceId);
  if (!c || !choiceState(S0, c).ok) return S0;
  const S = clone(S0);
  takeFx(S);
  if (c.cost) pay(S, c.cost);
  const out = c.run(S, rngOf(S));
  S.decisions[S.day] = choiceId;
  S.lastEvent = { choice: choiceId, ...out, fx: takeFx(S) };
  if (S.res.hp <= 0) S.phase = "dead";
  else if (D.final) S.phase = "won";
  else S.phase = "aftermath";
  return S;
}

/** Night pressure vs defence. */
export function nightForecast(S) {
  const D = dayOf(S.day);
  const pressure = D.nightBase + Math.floor(S.threat / 3) + (S.res.power <= 0 ? 1 : 0);
  return { pressure, defense: totalDefense(S) };
}

export function night(S0) {
  if (S0.phase !== "aftermath") return S0;
  const S = clone(S0);
  const r = rngOf(S);
  takeFx(S);
  const { pressure, defense } = nightForecast(S);
  const diff = pressure - defense;
  let kind;
  if (diff <= 0) kind = pressure <= 1 ? "quiet" : "held";
  else {
    kind = "breach";
    let dmg = diff * 5;
    if (S.status.prepared) dmg = Math.ceil(dmg / 2);
    hurt(S, dmg, "night");
    if (diff >= 2 && S.res.food > 0) gain(S, { food: -1 });
    S.stats.breaches++;
  }
  const lines = NIGHT_TEXT[kind];
  S.night = { kind, text: lines[Math.floor(r() * lines.length)], pressure, defense, fx: takeFx(S) };
  S.stats.nights++;
  S.phase = S.res.hp <= 0 ? "dead" : "dusk";
  return S;
}

export function next(S0) {
  if (S0.phase !== "dusk") return S0;
  const S = clone(S0);
  S.day = Math.min(DAY_COUNT, S.day + 1);
  return beginDay(S);
}

export const deathOf = (S) => deathKey(S.cause);

/* ------------------------------------------------------------------ saves */
export function validSave(S) {
  try {
    if (!S || S.v !== SAVE_VERSION) return false;
    if (!Number.isInteger(S.day) || S.day < 1 || S.day > DAY_COUNT) return false;
    if (!["dawn", "play", "event", "aftermath", "dusk", "dead", "won"].includes(S.phase)) return false;
    for (const k of RES) if (!Number.isFinite(S.res?.[k]) || S.res[k] < 0 || S.res[k] > CAPS[k]) return false;
    for (const key of ["deck", "discard", "hand", "exhausted", "unlocked"]) if (!Array.isArray(S[key]) || S[key].some((id) => !CARDS[id])) return false;
    if (S.hand.length > HAND_SIZE) return false;
    if (!S.status || !S.flags || !S.stats) return false;
    return true;
  } catch {
    return false;
  }
}

export { DAYS };
