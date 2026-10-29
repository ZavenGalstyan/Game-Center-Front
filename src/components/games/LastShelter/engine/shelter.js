/**
 * Last Shelter — Phase B: the underground shelter (framework-free sim).
 *
 * A day is: read the morning report → answer the day's event card → plan
 * rations / medicine / one shelter action / an expedition → End Day. End Day
 * applies the plan, ages everyone (hunger, thirst, sickness, injuries,
 * fatigue, morale), advances the expedition, resolves deaths, checks the
 * endings and rolls the next morning. Every roll uses the state's own seeded
 * RNG, so a saved game continues exactly where it stopped.
 */
import { roll, chance, randInt, weighted, clamp, pickOne } from "./rng.js";
import { BY_ID, FAMILY } from "../data/family.js";
import { RES_KEYS, TOOL_KEYS, RES_NAMES, TOOL_NAMES } from "../data/items.js";
import { EVENTS, EVENT_BY_ID } from "../data/events/index.js";
import { startExpedition, advanceExpedition } from "./expedition.js";
import { checkEnding } from "./endings.js";

export const SAVE_VERSION = 1;
export const STATS = ["hp", "hunger", "thirst", "morale", "fatigue"];

/* ------------------------------------------------------------------ helpers */
export const name = (id) => BY_ID[id]?.name || id;
export const members = (S) => Object.keys(S.fam);
export const alive = (S) => members(S).filter((id) => S.fam[id].alive);
export const present = (S) => alive(S).filter((id) => !S.fam[id].away);
export const has = (S, k) => (TOOL_KEYS.includes(k) ? (S.items[k] | 0) > 0 : (S.res[k] | 0) > 0);
export const radioWorks = (S) => has(S, "radio") && S.radio > 0;

/** Readable state labels for a member — the UI and the art both use them. */
export function conditions(m) {
  const out = [];
  if (!m.alive) return ["dead"];
  if (m.hunger >= 75) out.push("starving");
  else if (m.hunger >= 45) out.push("hungry");
  if (m.thirst >= 75) out.push("dehydrated");
  else if (m.thirst >= 45) out.push("thirsty");
  if (m.sick >= 2) out.push("very sick");
  else if (m.sick >= 1) out.push("sick");
  if (m.injured >= 2) out.push("badly hurt");
  else if (m.injured >= 1) out.push("injured");
  if (m.fatigue >= 70) out.push("exhausted");
  else if (m.fatigue >= 45) out.push("tired");
  if (m.morale <= 15) out.push("despairing");
  else if (m.morale <= 35) out.push("low spirits");
  if (m.hp <= 25) out.push("near death");
  return out;
}
export function mood(m) {
  if (!m.alive) return "dead";
  if (m.sick >= 1 || m.hp <= 30) return "sick";
  if (m.morale <= 25) return "sad";
  if (m.hunger >= 60 || m.thirst >= 60 || m.fatigue >= 70 || m.injured) return "worried";
  if (m.morale >= 65) return "happy";
  return "calm";
}

/* ------------------------------------------------------------------ create */
export function createShelter({ seed = 1, summary }) {
  const S = {
    v: SAVE_VERSION,
    seed,
    rng: (seed ^ 0x9e3779b9) >>> 0,
    day: 1,
    runner: summary.runner,
    fam: {},
    lostInHouse: summary.lost.slice(),
    res: { food: 0, water: 0, meds: 0, batteries: 0 },
    items: { flashlight: 0, radio: 0, toolkit: 0, map: 0, gasmask: 0, books: 0, backpack: 0 },
    radio: 100,
    shelter: 100,
    exp: null,
    event: null,
    plan: emptyPlan(),
    action: null,
    flags: {},
    seen: {},
    queue: [],
    history: [],
    journal: [],
    report: [],
    ending: null,
    stats: { meals: 0, drinks: 0, expeditions: 0, events: 0, deaths: 0, scavenged: 0 },
  };
  for (const id of summary.survivors) {
    const c = BY_ID[id];
    S.fam[id] = { id, alive: true, away: false, hp: 100, hunger: 8 + randInt(S, 0, 8), thirst: 10 + randInt(S, 0, 8), morale: 62, sick: 0, injured: 0, fatigue: 20, cause: null, diedDay: 0, diedAway: false, sickDays: 0, injDays: 0, ate: 0, drank: 0, c: c.id };
  }
  const d = summary.delivered;
  S.res.food = (d.food | 0) + 1;
  S.res.water = (d.water | 0) + 1;
  S.res.meds = (d.medkit | 0) * 2;
  S.res.batteries = (d.batteries | 0) * 3;
  for (const k of TOOL_KEYS) S.items[k] = d[k] ? 1 : 0;
  S.stats.scavenged = Object.values(d).reduce((a, b) => a + (b | 0), 0);
  // morale reflects who made it down
  const lost = summary.lost.length;
  for (const id of present(S)) S.fam[id].morale = clamp(S.fam[id].morale - lost * 12, 10, 100);
  S.report = morningReport(S, true);
  rollEvent(S);
  return S;
}
export const emptyPlan = () => ({ food: {}, water: {}, meds: {} });

/* ------------------------------------------------------------------ effects */
const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

/**
 * Apply an effect object. Returns readable changes for the feedback strip.
 * fx: { food, water, meds, batteries, shelter, radio, item:{k:±},
 *       all:{stat:±}, who:{stat:±}, who2:{…}, m:{id:{…}}, flag:{k:v},
 *       queue:[{id, in}], kill:'who'|id, cause, ending, expDays }
 */
export function applyFx(S, fx, ctx = {}) {
  const out = [];
  if (!fx) return out;
  for (const k of RES_KEYS) {
    if (!fx[k]) continue;
    const before = S.res[k];
    S.res[k] = Math.max(0, before + fx[k]);
    const d = S.res[k] - before;
    if (d) out.push({ text: `${sign(d)} ${RES_NAMES[k]}`, good: d > 0, k });
  }
  if (fx.shelter) {
    const b = S.shelter;
    S.shelter = clamp(b + fx.shelter, 0, 100);
    const d = Math.round(S.shelter - b);
    if (d) out.push({ text: `Shelter ${sign(d)}%`, good: d > 0, k: "shelter" });
  }
  if (fx.radio && has(S, "radio")) {
    const b = S.radio;
    S.radio = clamp(b + fx.radio, 0, 100);
    const d = Math.round(S.radio - b);
    if (d) out.push({ text: S.radio <= 0 ? "Radio broken" : `Radio ${sign(d)}%`, good: d > 0, k: "radio" });
  }
  if (fx.item) {
    for (const [k, v] of Object.entries(fx.item)) {
      const b = S.items[k] | 0;
      S.items[k] = clamp(b + v, 0, 1);
      if (S.items[k] !== b) {
        out.push({ text: `${S.items[k] > b ? "Gained" : "Lost"}: ${TOOL_NAMES[k]}`, good: S.items[k] > b, k });
        if (k === "radio" && S.items.radio && b === 0) S.radio = Math.max(S.radio, 70);
      }
    }
  }
  const target = (id, mods) => {
    const m = S.fam[id];
    if (!m || !m.alive) return;
    for (const [k, v] of Object.entries(mods)) {
      if (!v) continue;
      if (k === "sick") {
        const b = m.sick;
        m.sick = clamp(b + v, 0, 3);
        if (m.sick > b) out.push({ text: `${name(id)} ${b ? "sicker" : "got sick"}`, good: false, k: "sick" });
        else if (m.sick < b) out.push({ text: `${name(id)} ${m.sick ? "feels better" : "recovered"}`, good: true, k: "sick" });
        if (!m.sick) m.sickDays = 0;
      } else if (k === "injured") {
        const b = m.injured;
        m.injured = clamp(b + v, 0, 2);
        if (m.injured > b) out.push({ text: `${name(id)} ${b ? "badly hurt" : "injured"}`, good: false, k: "injured" });
        else if (m.injured < b) out.push({ text: `${name(id)}'s wounds healing`, good: true, k: "injured" });
        if (!m.injured) m.injDays = 0;
      } else if (STATS.includes(k)) {
        let delta = v;
        if (k === "morale" && v < 0) delta = v * BY_ID[id].moraleSwing;
        const b = m[k];
        m[k] = clamp(b + delta, 0, 100);
        const d = Math.round(m[k] - b);
        if (Math.abs(d) >= 1) {
          const good = k === "hp" || k === "morale" ? d > 0 : d < 0;
          const label = { hp: "health", hunger: "hunger", thirst: "thirst", morale: "morale", fatigue: "fatigue" }[k];
          out.push({ text: `${name(id)} ${label} ${sign(d)}`, good, k, minor: true });
        }
      }
    }
  };
  if (fx.all) for (const id of present(S)) target(id, fx.all);
  if (fx.who && ctx.who) target(ctx.who, fx.who);
  if (fx.who2 && ctx.who2) target(ctx.who2, fx.who2);
  if (fx.m) for (const [id, mods] of Object.entries(fx.m)) target(id, mods);
  if (fx.flag) Object.assign(S.flags, fx.flag);
  if (fx.queue) for (const q of fx.queue) S.queue.push({ id: q.id, day: S.day + (q.in || 1), who: q.who || ctx.who });
  if (fx.kill) {
    const id = fx.kill === "who" ? ctx.who : fx.kill;
    if (S.fam[id]?.alive) {
      killMember(S, id, fx.cause || "lost");
      out.push({ text: `${name(id)} is gone`, good: false, k: "death" });
    }
  }
  if (fx.leave) {
    const id = fx.leave === "who" ? ctx.who : fx.leave;
    if (S.fam[id]?.alive) {
      killMember(S, id, fx.cause || "left the shelter", true);
      out.push({ text: `${name(id)} left the shelter`, good: false, k: "death" });
    }
  }
  if (fx.expDays && S.exp) {
    S.exp.left = Math.max(1, S.exp.left + fx.expDays);
    out.push({ text: `Expedition ${fx.expDays > 0 ? "delayed" : "sped up"}`, good: fx.expDays < 0 });
  }
  if (fx.expBonus && S.exp) S.exp.bonus = true;
  if (fx.startExp && ctx.who) {
    const gear = ["map", "flashlight", "backpack"].filter((g) => S.items[g]);
    if (startExpedition(S, ctx.who, fx.startExp.dest, gear)) out.push({ text: `${name(ctx.who)} left on an expedition`, good: true });
  }
  if (fx.ending) S.pendingEnding = fx.ending;
  // pure flavour pairs → collapse minor morale lines when many members changed
  return compact(out);
}
function compact(list) {
  const minor = list.filter((x) => x.minor);
  if (minor.length <= 3) return list;
  const major = list.filter((x) => !x.minor);
  const byKey = {};
  for (const x of minor) {
    const label = x.text.replace(/^\S+ /, "").replace(/ [+-]\d+$/, "");
    const n = +x.text.match(/([+-]\d+)$/)[1];
    (byKey[label] ||= { label, sum: 0, n: 0, good: x.good }).sum += n;
    byKey[label].n++;
  }
  for (const b of Object.values(byKey)) major.push({ text: `Family ${b.label} ${sign(Math.round(b.sum / b.n))}`, good: b.good, minor: true });
  return major;
}

export function killMember(S, id, cause, left = false) {
  const m = S.fam[id];
  if (!m || !m.alive) return;
  m.alive = false;
  m.hp = 0;
  m.cause = cause;
  m.left = left;
  m.diedDay = S.day;
  m.diedAway = !!m.away;
  m.away = false;
  S.stats.deaths++;
  if (S.exp && S.exp.who === id) S.exp = null;
  for (const o of present(S)) S.fam[o].morale = clamp(S.fam[o].morale - (left ? 18 : 28) * BY_ID[o].moraleSwing, 0, 100);
}

/* ------------------------------------------------------------------ events */
function ctxFor(S, ev, who) {
  const pres = present(S);
  const pick = ev.pick || "any";
  let pool = pres;
  if (pick === "adult") pool = pres.filter((id) => id === "hollis" || id === "june");
  else if (pick === "kid") pool = pres.filter((id) => id === "remy" || id === "pip");
  else if (pick === "sick") pool = pres.filter((id) => S.fam[id].sick > 0);
  else if (pick === "hurt") pool = pres.filter((id) => S.fam[id].injured > 0);
  else if (pick === "sad") pool = pres.slice().sort((a, b) => S.fam[a].morale - S.fam[b].morale).slice(0, 1);
  else if (pick === "weak") pool = pres.slice().sort((a, b) => S.fam[a].hp - S.fam[b].hp).slice(0, 1);
  else if (pick === "strong") pool = pres.slice().sort((a, b) => S.fam[b].hp - S.fam[a].hp).slice(0, 1);
  if (!pool.length) pool = pres;
  const c = { who: who && S.fam[who]?.alive && !S.fam[who].away ? who : pickOne(S, pool) };
  const others = pres.filter((id) => id !== c.who);
  c.who2 = others.length ? pickOne(S, others) : null;
  c.away = S.exp ? S.exp.who : null;
  return c;
}
export function eventEligible(S, ev) {
  if (ev.chainOnly) return false;
  if (ev.minDay && S.day < ev.minDay) return false;
  if (ev.maxDay && S.day > ev.maxDay) return false;
  if (ev.once !== false && S.seen[ev.id]) return false;
  if (ev.once === false && S.seen[ev.id] && S.day - S.seen[ev.id] < (ev.cooldown || 10)) return false;
  if (ev.needPresent && present(S).length < ev.needPresent) return false;
  if (ev.needItem && !has(S, ev.needItem)) return false;
  try {
    return ev.when ? !!ev.when(S) : true;
  } catch {
    return false;
  }
}

/** Pick today's event: queued chain events first, then a weighted draw. */
export function rollEvent(S) {
  S.event = null;
  if (S.ending || !present(S).length) return;
  const qi = S.queue.findIndex((q) => q.day <= S.day && EVENT_BY_ID[q.id] && (!EVENT_BY_ID[q.id].when || EVENT_BY_ID[q.id].when(S)));
  let ev = null;
  let who = null;
  if (qi >= 0) {
    ev = EVENT_BY_ID[S.queue[qi].id];
    who = S.queue[qi].who;
    S.queue.splice(qi, 1);
  } else {
    // drop stale queue entries whose condition can never hold any more
    S.queue = S.queue.filter((q) => S.day - q.day < 6);
    if (S.day > 2 && chance(S, 0.12)) {
      S.event = { id: "quiet", quiet: true };
      return;
    }
    const pool = EVENTS.filter((e) => eventEligible(S, e));
    ev = weighted(S, pool, (e) => (typeof e.weight === "function" ? e.weight(S) : e.weight ?? 1));
  }
  if (!ev) {
    S.event = { id: "quiet", quiet: true };
    return;
  }
  S.seen[ev.id] = S.day;
  const c = ctxFor(S, ev, who);
  S.event = { id: ev.id, ctx: c, done: false, result: null };
}

/** Choice availability: true or a short reason string. */
export function choiceState(S, ch) {
  const ctx = S.event?.ctx || {};
  if (!ch.req) return true;
  try {
    const r = ch.req(S, ctx);
    return r === true || r === undefined ? true : r || "Not possible";
  } catch {
    return "Not possible";
  }
}

export function chooseEvent(S, index) {
  const E = S.event;
  if (!E || E.done || E.quiet) return null;
  const ev = EVENT_BY_ID[E.id];
  const ch = ev.choices[index];
  if (!ch || choiceState(S, ch) !== true) return null;
  const r = roll(S);
  let res = ch.run(S, E.ctx, r) || { text: "" };
  const changes = applyFx(S, res.fx, E.ctx);
  E.done = true;
  E.choice = index;
  E.result = { text: fill(res.text, E.ctx), changes };
  S.stats.events++;
  S.history.push({ day: S.day, id: ev.id, title: fill(ev.title, E.ctx), choice: fill(ch.label, E.ctx), result: E.result.text });
  if (S.history.length > 120) S.history.shift();
  const end = checkEnding(S);
  if (end) S.ending = end;
  return E.result;
}

/** {A}/{B} → names; {a.s}/{a.o}/{a.p} → pronouns of who, {b.*} of who2; {X} → expedition member. */
export function fill(text, ctx = {}) {
  if (typeof text !== "string") return "";
  return text.replace(/\{([ABX])\}|\{([abx])\.([sop])\}/g, (_, N, n, p) => {
    const key = N || n;
    const id = key.toLowerCase() === "a" ? ctx.who : key.toLowerCase() === "b" ? ctx.who2 : ctx.away;
    if (N) return name(id);
    return BY_ID[id]?.pron[p] || "they";
  });
}

/* ------------------------------------------------------------------ actions */
export const ACTIONS = {
  repairShelter: { label: "Patch the shelter", need: "toolkit", note: "+14% shelter, tires the worker" },
  repairRadio: { label: "Fix the radio", need: "toolkit", note: "Repairs the radio (Remy is best at it)" },
  listen: { label: "Scan the radio", note: "Uses 1 battery. News, warnings, maybe a voice." },
  storytime: { label: "Family story night", note: "Books lift spirits" },
  rest: { label: "Rest day", note: "Everyone sleeps it off: fatigue down" },
};
export function actionState(S, key) {
  if (S.action) return "One task per day";
  if (!present(S).length) return "Nobody is here";
  if (key === "repairShelter") return !has(S, "toolkit") ? "Needs Tool Kit" : S.shelter >= 100 ? "Shelter is solid" : true;
  if (key === "repairRadio") return !has(S, "radio") ? "No radio" : !has(S, "toolkit") ? "Needs Tool Kit" : S.radio >= 100 ? "Radio works fine" : true;
  if (key === "listen") return !has(S, "radio") ? "No radio" : S.radio <= 0 ? "Radio is broken" : S.res.batteries <= 0 ? "No batteries" : true;
  if (key === "storytime") return !has(S, "books") ? "Needs Books" : true;
  if (key === "rest") return true;
  return "Unknown";
}
export function doAction(S, key) {
  if (actionState(S, key) !== true) return null;
  const pres = present(S);
  let text = "";
  let fx = {};
  if (key === "repairShelter") {
    const worker = pres.includes("hollis") ? "hollis" : pres.slice().sort((a, b) => S.fam[b].hp - S.fam[a].hp)[0];
    const amt = 12 + Math.round(BY_ID[worker].repair * 12) + randInt(S, 0, 4);
    text = `${name(worker)} spent the day shoring up cracks and re-packing the vent seals.`;
    fx = { shelter: amt, m: { [worker]: { fatigue: 18 } } };
  } else if (key === "repairRadio") {
    const worker = pres.includes("remy") ? "remy" : pres[0];
    const ok = chance(S, worker === "remy" ? 0.95 : 0.6 + BY_ID[worker].repair);
    text = ok ? `${name(worker)} rewired the radio's tuner. It crackles back to life.` : `${name(worker)} took the radio apart and put it back together. It still hums, but no better.`;
    fx = { radio: ok ? 70 : 10, m: { [worker]: { fatigue: 8 } } };
  } else if (key === "listen") {
    S.res.batteries -= 1;
    const r = roll(S);
    if (!S.flags.relief && !S.flags.reliefHeard && S.day >= 7 && r < 0.55) {
      text = "Between bands of static, a calm voice repeats a call sign: Ridgeline Relief. You write it down.";
      S.queue.push({ id: "radio_relief", day: S.day + 1 });
      S.flags.reliefHeard = true;
      fx = { all: { morale: 6 } };
    } else if (S.flags.cedarFreq && !S.flags.cedarContact && S.day >= 10) {
      text = "You dial in the frequency from the mast. A woman answers: “This is Cedar Hollow. Who's out there?”";
      S.queue.push({ id: "cedar_talk", day: S.day + 1 });
      S.flags.cedarContact = true;
      fx = { all: { morale: 10 } };
    } else if (r < 0.35) {
      text = "A weather bulletin: dust storms moving east. Keep the vents shut for a few days.";
      S.flags.stormWarned = S.day;
      fx = { all: { morale: 2 } };
    } else if (r < 0.6) {
      text = "Old music on a looping tape. Nobody says much, but everyone listens to the end.";
      fx = { all: { morale: 7 } };
    } else {
      text = "Only static tonight, and once, very faintly, someone counting numbers.";
      fx = { all: { morale: -1 } };
    }
  } else if (key === "storytime") {
    text = pres.includes("pip") ? "Pip picked the book. Everyone did the voices. Even Hollis." : "You read aloud by lamplight until the words blurred.";
    fx = { all: { morale: 9 } };
  } else if (key === "rest") {
    text = "Nobody did anything today, on purpose. It helped.";
    fx = { all: { fatigue: -22, morale: 2 } };
  }
  const changes = applyFx(S, fx, {});
  S.action = { key, text, changes };
  return S.action;
}

/* ------------------------------------------------------------------ planning */
export function planCost(S) {
  let food = 0;
  let water = 0;
  let meds = 0;
  for (const id of present(S)) {
    if (S.plan.food[id]) food++;
    if (S.plan.water[id]) water++;
    if (S.plan.meds[id]) meds++;
  }
  return { food, water, meds };
}
export function togglePlan(S, kind, id) {
  const m = S.fam[id];
  if (!m || !m.alive || m.away) return false;
  const p = S.plan[kind];
  if (p[id]) {
    delete p[id];
    return true;
  }
  const cost = planCost(S);
  if (cost[kind] + 1 > S.res[kind]) return false;
  if (kind === "meds" && !m.sick && !m.injured) return false;
  p[id] = true;
  return true;
}
/** A sensible default ration plan (the "Suggest" button and the bot). */
export function suggestPlan(S) {
  S.plan = emptyPlan();
  const pres = present(S).slice();
  const byNeed = (k) => pres.slice().sort((a, b) => S.fam[b][k] - S.fam[a][k]);
  let food = S.res.food;
  let water = S.res.water;
  let meds = S.res.meds;
  for (const id of byNeed("thirst")) if (water > 0 && S.fam[id].thirst >= 40) (S.plan.water[id] = true), water--;
  for (const id of byNeed("hunger")) if (food > 0 && S.fam[id].hunger >= 45) (S.plan.food[id] = true), food--;
  for (const id of pres.slice().sort((a, b) => S.fam[a].hp - S.fam[b].hp)) {
    const m = S.fam[id];
    if (meds > 0 && (m.sick >= 1 || m.injured >= 2 || (m.injured && m.hp < 50))) (S.plan.meds[id] = true), meds--;
  }
}

export { startExpedition };

/* ------------------------------------------------------------------ end of day */
export function endDay(S) {
  if (S.ending) return S;
  const lines = [];
  const pres = present(S);
  const hasJune = pres.includes("june");
  // 1. the plan
  for (const id of pres) {
    const m = S.fam[id];
    if (S.plan.food[id] && S.res.food > 0) {
      S.res.food--;
      m.hunger = Math.max(0, m.hunger - 58);
      m.morale = clamp(m.morale + 2, 0, 100);
      m.ate = S.day;
      S.stats.meals++;
    }
    if (S.plan.water[id] && S.res.water > 0) {
      S.res.water--;
      m.thirst = Math.max(0, m.thirst - 62);
      m.drank = S.day;
      S.stats.drinks++;
    }
    if (S.plan.meds[id] && S.res.meds > 0 && (m.sick || m.injured)) {
      S.res.meds--;
      const power = hasJune ? 2 : 1;
      if (m.sick) m.sick = Math.max(0, m.sick - power);
      else m.injured = Math.max(0, m.injured - power);
      m.hp = clamp(m.hp + (hasJune ? 12 : 6), 0, 100);
      lines.push(`${name(id)} took medicine${hasJune && id !== "june" ? " — June made sure it was the right dose" : ""}.`);
      if (!m.sick) m.sickDays = 0;
    }
  }
  // 2. long-running projects
  if (S.flags.garden && S.day % 3 === 0) {
    S.res.food++;
    lines.push("The mushroom beds gave a small harvest. +1 Food");
  }
  if (S.flags.collector && S.day % 2 === 0 && !S.flags.collectorBroken) {
    S.res.water++;
    lines.push("The rain collector filled a bottle overnight. +1 Water");
  }
  // 3. bodies age a day
  const cheer = pres.includes("pip") && S.fam.pip.morale > 40;
  const books = has(S, "books");
  for (const id of pres) {
    const m = S.fam[id];
    const c = BY_ID[id];
    m.hunger = clamp(m.hunger + c.hungerRate, 0, 100);
    m.thirst = clamp(m.thirst + c.thirstRate, 0, 100);
    m.fatigue = clamp(m.fatigue - 10, 0, 100);
    let dmg = Math.max(0, m.hunger - 55) * 0.36 + Math.max(0, m.thirst - 50) * 0.46;
    if (m.sick) {
      dmg += 5 * m.sick;
      m.sickDays++;
      const recover = 0.1 + c.sickResist * 0.3 + (hasJune ? 0.06 : 0) - (m.hunger > 60 ? 0.05 : 0);
      if (chance(S, recover)) {
        m.sick--;
        lines.push(m.sick ? `${name(id)}'s fever eased a little.` : `${name(id)} shook off the sickness.`);
      } else if (m.sickDays > 4 && chance(S, 0.18)) {
        m.sick = Math.min(3, m.sick + 1);
        lines.push(`${name(id)}'s sickness is getting worse.`);
      }
    }
    if (m.injured) {
      dmg += 3 * m.injured;
      m.injDays++;
      if (m.injDays >= 3 && chance(S, 0.22 + (hasJune ? 0.12 : 0))) {
        m.injured--;
        m.injDays = 0;
        lines.push(`${name(id)}'s wounds are knitting.`);
      }
    }
    if (dmg <= 0 && m.hunger < 45 && m.thirst < 45) m.hp = clamp(m.hp + 6, 0, 100);
    m.hp = clamp(m.hp - dmg, 0, 100);
    let dm = 0;
    if (m.hunger >= 60) dm -= 4;
    if (m.thirst >= 60) dm -= 4;
    if (m.sick) dm -= 3;
    if (books) dm += 2.5;
    if (cheer && id !== "pip") dm += 1.5;
    if (S.shelter < 35) dm -= 2;
    if (m.morale > 70) dm -= 1;
    if (m.morale < 30) dm += 1; // you get used to it
    m.morale = clamp(m.morale + (dm < 0 ? dm * c.moraleSwing : dm), 0, 100);
  }
  // sickness spreads in close quarters
  const sickNow = pres.filter((id) => S.fam[id].sick);
  if (sickNow.length) {
    for (const id of pres) {
      if (S.fam[id].sick) continue;
      if (chance(S, 0.07 * sickNow.length - BY_ID[id].sickResist * 0.1)) {
        S.fam[id].sick = 1;
        lines.push(`${name(id)} caught ${name(sickNow[0])}'s cough.`);
      }
    }
  }
  // the shelter slowly settles
  S.shelter = clamp(S.shelter - 0.7 - (S.flags.leak ? 1.5 : 0), 0, 100);
  // 4. the expedition
  if (S.exp) lines.push(...advanceExpedition(S));
  // 5. deaths
  for (const id of members(S)) {
    const m = S.fam[id];
    if (!m.alive || m.hp > 0) continue;
    const cause = m.thirst >= 80 ? "dehydration" : m.hunger >= 80 ? "starvation" : m.sick ? "sickness" : m.injured ? "untreated wounds" : "hunger and thirst";
    killMember(S, id, cause);
    lines.push(`${name(id)} did not wake up. (${cause})`);
  }
  S.journal.push({ day: S.day, lines: [...S.report, ...lines], event: S.event?.result?.text || null, action: S.action?.text || null });
  if (S.journal.length > 80) S.journal.shift();
  // 6. a new morning
  S.day++;
  S.plan = emptyPlan();
  S.action = null;
  const end = checkEnding(S);
  if (end) {
    S.ending = end;
    S.event = null;
    S.report = lines;
    return S;
  }
  S.report = [...lines, ...morningReport(S)];
  rollEvent(S);
  return S;
}

function morningReport(S, first = false) {
  const out = [];
  if (first) {
    const n = present(S).length;
    out.push(n === 4 ? "The whole family made it down. The hatch is sealed. Somewhere above, the world went quiet." : `The hatch is sealed. ${n === 1 ? "You are alone down here." : `${n} of you made it down.`}`);
    for (const id of S.lostInHouse) out.push(`${name(id)} never reached the hatch.`);
    return out;
  }
  for (const id of present(S)) {
    const m = S.fam[id];
    const bits = [];
    if (m.thirst >= 75) bits.push("is badly dehydrated");
    else if (m.thirst >= 50) bits.push("is thirsty");
    if (m.hunger >= 75) bits.push("is starving");
    else if (m.hunger >= 55) bits.push("is hungry");
    if (m.hp <= 25) bits.push("looks close to collapse");
    if (m.fatigue >= 70) bits.push("can barely keep their eyes open");
    if (m.morale <= 15) bits.push("has stopped talking");
    if (bits.length) out.push(`${name(id)} ${bits.join(" and ")}.`);
  }
  if (S.res.food === 0) out.push("The food shelf is empty.");
  if (S.res.water === 0) out.push("There is no water left.");
  if (S.shelter <= 30) out.push("Dust trickles from the ceiling. The shelter groans at night.");
  if (has(S, "radio") && S.radio <= 0) out.push("The radio is dead.");
  return out;
}

/* ------------------------------------------------------------------ save */
export function serializeShelter(S) {
  return JSON.parse(JSON.stringify(S));
}
export function validShelter(d) {
  return !!(d && typeof d === "object" && d.v === SAVE_VERSION && d.fam && d.res && Number.isFinite(d.day) && d.day >= 1);
}
/** Repair anything a hand-edited or partial save could break. */
export function sanitize(S) {
  for (const k of RES_KEYS) S.res[k] = Math.max(0, Math.floor(Number(S.res[k]) || 0));
  for (const k of TOOL_KEYS) S.items[k] = S.items[k] ? 1 : 0;
  S.shelter = clamp(Number(S.shelter) || 0, 0, 100);
  S.radio = clamp(Number(S.radio) || 0, 0, 100);
  for (const m of Object.values(S.fam)) for (const k of STATS) m[k] = clamp(Number(m[k]) || 0, 0, 100);
  if (S.event && !S.event.quiet && !EVENT_BY_ID[S.event.id]) rollEvent(S);
  if (S.exp && !S.fam[S.exp.who]?.alive) S.exp = null;
  S.plan ||= emptyPlan();
  S.queue ||= [];
  return S;
}
export const familyList = () => FAMILY;
