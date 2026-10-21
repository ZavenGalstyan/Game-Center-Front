/**
 * Career mode — pure state transitions (no React, no storage).
 *
 * A career walks six tiers: Amateur Debut → Regional → Professional League →
 * National → International → World. Each tier needs `wins` victories; the last
 * three tiers then put a belt on the line (title fights go five rounds) against
 * a recurring rival. Losing never ends the career: you stay in the tier, lose
 * ranking places, and earn a rematch by winning again.
 *
 * Between fights the player picks one of two contract offers (a safer fight or
 * a riskier, better-paid one against a higher-ranked opponent) and spends
 * training points on capped attribute upgrades.
 */
import { FIGHTERS } from "../data/fighters.js";
import { TIERS, RIVALS, RIVAL_BY_ID, TRAINING, TRAIN_STEP, TRAIN_MAX_LEVEL, ATTR_CAP, trainCost, MILESTONES, COSMETICS, NAMES, STYLE_TEMPLATES, BELTS } from "../data/career.js";
import { makeRng, clamp } from "./constants.js";

export const CAREER_VERSION = 1;
const ATTRS = ["power", "speed", "cardio", "footwork", "defense", "chin", "grappling", "tdd", "subs"];

/** New career from the creation screen. fighter = {name, nick, nation, flag, style, look} */
export function newCareer(fighter, seed = Date.now() % 1e9) {
  const base = { ...STYLE_TEMPLATES[fighter.style] };
  const c = {
    version: CAREER_VERSION,
    seed,
    created: Date.now(),
    fighter: { ...fighter, base },
    levels: Object.fromEntries(TRAINING.map((t) => [t.id, 0])),
    points: 2,
    earnings: 0,
    tier: 0,
    tierWins: 0,
    titleShot: false,
    rank: { 3: 10, 4: 10, 5: 10 },
    record: { w: 0, l: 0, d: 0, ko: 0, sub: 0, dec: 0 },
    streak: 0,
    history: [],
    belts: { national: false, international: false, world: false },
    defenses: 0,
    rivals: Object.fromEntries(RIVALS.map((r) => [r.id, { met: false, w: 0, l: 0 }])),
    milestones: [],
    equipped: { shorts: "shorts-red", gloves: "gloves-black" },
    story: { intro: false, contract: false, nationalShot: false, internationalShot: false, worldShot: false, ending: false },
    offers: null,
    fightNo: 0,
    complete: false,
  };
  c.offers = makeOffers(c);
  return c;
}

/** Effective attributes = style base + training (each level +3, capped). */
export function careerAttrs(c) {
  const out = { ...c.fighter.base };
  for (const t of TRAINING) out[t.attr] = Math.min(ATTR_CAP, out[t.attr] + (c.levels[t.id] || 0) * TRAIN_STEP);
  // general development: defence grows with experience (fights fought), capped
  out.defense = Math.min(ATTR_CAP, out.defense + Math.min(18, c.fightNo * 1.6));
  return out;
}

/** The player's fighter as a fighter-data object (for Match / rigs). */
export function careerFighterData(c) {
  const sh = COSMETICS.find((x) => x.id === c.equipped.shorts) || COSMETICS[0];
  const gl = COSMETICS.find((x) => x.id === c.equipped.gloves) || COSMETICS.find((x) => x.kind === "gloves");
  const f = c.fighter;
  return {
    id: "career",
    name: f.name,
    nick: f.nick,
    nation: f.nation,
    flag: f.flag,
    height: f.height || 183,
    weight: f.weight || 77,
    reach: f.reach || 188,
    style: f.style,
    record: [c.record.w, c.record.l],
    attrs: careerAttrs(c),
    combos: { boxer: ["1-2-3", "1-1-2"], kickboxer: ["2-lk", "1-2-bk"], wrestler: ["1-2", "1-2-up"], bjj: ["1-2", "2-lk"], muaythai: ["2-lk", "body-head"], mma: ["1-2-3", "jab-body-head"] }[f.style],
    ai: { aggression: 0.6, patience: 0.5, kicks: 0.35, body: 0.3, grapple: 0.35, subHunt: 0.4, clinch: 0.3 },
    look: { ...f.look, shorts: sh.color, accent: sh.accent, gloves: gl.color, gloveTrim: gl.trim },
  };
}

export function canTrain(c, id) {
  const t = TRAINING.find((x) => x.id === id);
  if (!t) return { ok: false, why: "Unknown" };
  const lv = c.levels[id] || 0;
  if (lv >= TRAIN_MAX_LEVEL) return { ok: false, why: "Maxed" };
  if (c.fighter.base[t.attr] + lv * TRAIN_STEP >= ATTR_CAP) return { ok: false, why: "At cap" };
  const cost = trainCost(lv);
  if (c.points < cost) return { ok: false, why: `Needs ${cost} pts`, cost };
  return { ok: true, cost };
}

export function train(c, id) {
  const chk = canTrain(c, id);
  if (!chk.ok) return c;
  return { ...c, points: c.points - chk.cost, levels: { ...c.levels, [id]: (c.levels[id] || 0) + 1 } };
}

/* ------------------------------------------------------------ opponents */
function genOpponent(c, rng, tier, strength = 0) {
  const T = TIERS[tier];
  const tpl = rng.pick(FIGHTERS);
  const style = rng.chance(0.7) ? tpl.style : rng.pick(Object.keys(STYLE_TEMPLATES));
  const roster = rng.chance(tier >= 2 ? 0.55 : 0.1);
  const src = roster ? tpl : null;
  const scale = T.oppScale + strength * 0.04;
  const base = src ? src.attrs : { ...STYLE_TEMPLATES[style] };
  const attrs = Object.fromEntries(ATTRS.map((k) => [k, clamp(Math.round((src ? base[k] : base[k] * 1.12) * scale + rng.range(-3, 3)), 40, 97)]));
  const name = src ? src.name : `${rng.pick(NAMES.first)} ${rng.pick(NAMES.last)}`;
  const shorts = ["#7a0019", "#003b6f", "#1b5e20", "#4a148c", "#e65100", "#263238", "#f9a825", "#880e4f"];
  const w = 6 + tier * 3 + Math.floor(rng() * 6);
  return {
    id: src ? src.id : `gen-${name.toLowerCase().replace(/\W+/g, "-")}`,
    roster: !!src,
    name,
    nick: src ? src.nick : rng.pick(NAMES.nick),
    nation: src ? src.nation : tpl.nation,
    flag: src ? src.flag : tpl.flag,
    height: tpl.height,
    weight: tpl.weight,
    reach: tpl.reach,
    style: src ? src.style : style,
    record: src ? src.record : [w, Math.floor(rng() * 4)],
    attrs,
    combos: tpl.combos,
    ai: tpl.ai,
    look: src ? tpl.look : { ...tpl.look, shorts: rng.pick(shorts), accent: "#f0f0f0", hair: rng.pick(["Hair_Buzzed", "Hair_SimpleParted", "Hair_Long", null]), beard: rng.chance(0.5) },
  };
}

function rivalOpp(id, tier) {
  const r = RIVAL_BY_ID[id];
  const scale = tier <= 1 ? 0.8 : tier === 3 ? 0.93 : 1;
  return { ...r, rival: true, attrs: Object.fromEntries(Object.entries(r.attrs).map(([k, v]) => [k, Math.round(v * scale)])) };
}

/** Rival scheduled for this tier, if the story wants one now. */
function rivalFor(c) {
  if (c.tier === 1 && !c.rivals.morrison.met && c.tierWins === 1) return "morrison";
  if (c.titleShot) return { 3: "morrison", 4: "orlov", 5: "kross" }[c.tier];
  return null;
}

/** Fight contracts for the next bout (1 if it's a title fight / rival bout, else 2). */
export function makeOffers(c) {
  const T = TIERS[c.tier];
  const rng = makeRng((c.seed + c.fightNo * 7919 + c.tier * 131) >>> 0);
  const rivalId = rivalFor(c);
  if (rivalId) {
    const opp = rivalOpp(rivalId, c.tier);
    const title = c.titleShot ? T.title : null;
    return [{ id: "rival", opp, tier: c.tier, rounds: title ? 5 : 3, title, arena: T.arena, purse: T.purse * (title ? 3 : 1.5), points: T.points + (title ? 3 : 1), risk: "Main Event", rival: rivalId }];
  }
  const safe = genOpponent(c, rng, c.tier, -1);
  const risky = genOpponent(c, rng, c.tier, 1);
  return [
    { id: "safe", opp: safe, tier: c.tier, rounds: T.rounds, title: null, arena: T.arena, purse: T.purse, points: T.points, risk: "Steady", rankJump: 2 },
    { id: "risky", opp: risky, tier: c.tier, rounds: T.rounds, title: null, arena: T.arena, purse: Math.round(T.purse * 1.6), points: T.points + 1, risk: "High Risk", rankJump: 4 },
  ];
}

/** Which story scene (if any) should play before the next offer. */
export function pendingScene(c) {
  if (!c.story.intro) return "intro";
  if (c.tier >= 2 && !c.story.contract) return "contract";
  if (c.tier === 3 && !c.story.nationalShot) return "nationalShot";
  if (c.tier === 4 && !c.story.internationalShot) return "internationalShot";
  if (c.tier === 5 && !c.story.worldShot) return "worldShot";
  if (c.belts.world && !c.story.ending) return "ending";
  return null;
}
export const markScene = (c, id) => ({ ...c, story: { ...c.story, [id]: true } });

/**
 * Apply a fight result. result = { won: bool|null(draw), method, round, dmgTaken }
 * Returns { career, notes: [strings], unlocked: [ids], belt: id|null, tierUp: bool }
 */
export function applyResult(c0, offer, result) {
  const c = structuredCloneSafe(c0);
  const notes = [];
  const unlocked = [];
  let belt = null;
  let tierUp = false;
  const T = TIERS[c.tier];
  c.fightNo++;
  const won = result.won === true;
  const draw = result.won === null;
  c.history.unshift({ n: c.fightNo, opp: offer.opp.name, oppId: offer.opp.id, tier: c.tier, title: offer.title, won: result.won, method: result.method, round: result.round });
  c.history = c.history.slice(0, 40);
  if (offer.rival) {
    const r = c.rivals[offer.rival];
    r.met = true;
    if (won) r.w++;
    else if (!draw) r.l++;
  }
  if (won) {
    c.record.w++;
    if (result.method === "KO" || result.method === "TKO") c.record.ko++;
    else if (result.method === "SUB") c.record.sub++;
    else c.record.dec++;
    c.streak++;
    const finish = result.method !== "DEC";
    const pts = offer.points + (finish ? 1 : 0) + (result.dmgTaken < 15 ? 1 : 0);
    c.points += pts;
    c.earnings += Math.round(offer.purse * (finish ? 1.25 : 1));
    notes.push(`+${pts} training points`);
    if (offer.title) {
      c.belts[offer.title] = true;
      belt = offer.title;
      notes.push(`${BELTS[offer.title].name}!`);
      c.titleShot = false;
      c.tierWins = 0;
      if (c.tier < TIERS.length - 1) {
        c.tier++;
        tierUp = true;
      } else {
        c.defenses += c.complete ? 1 : 0;
        c.complete = true;
      }
    } else {
      c.tierWins++;
      if (c.rank[c.tier]) c.rank[c.tier] = Math.max(1, c.rank[c.tier] - (offer.rankJump || 3));
      if (c.tierWins >= T.wins) {
        if (T.title) {
          c.titleShot = true;
          c.rank[c.tier] = 1;
          notes.push("Title shot earned!");
        } else {
          c.tier++;
          c.tierWins = 0;
          tierUp = true;
        }
      }
    }
    if (tierUp) notes.push(`Promoted to ${TIERS[c.tier].name}`);
  } else if (draw) {
    c.record.d++;
    c.streak = 0;
    c.points += 1;
    c.earnings += Math.round(offer.purse * 0.5);
    notes.push("+1 training point");
  } else {
    c.record.l++;
    c.streak = 0;
    c.points += 1;
    c.earnings += Math.round(offer.purse * 0.4);
    notes.push("+1 training point");
    if (c.rank[c.tier]) c.rank[c.tier] = Math.min(10, c.rank[c.tier] + 2);
    if (offer.title) {
      // lost the title fight: one more contender win earns the rematch
      c.titleShot = false;
      c.tierWins = Math.max(0, T.wins - 1);
      notes.push("One more win earns a rematch.");
    }
  }
  // milestones
  const has = (id) => c.milestones.includes(id);
  const grant = (id) => {
    if (!has(id)) {
      c.milestones.push(id);
      unlocked.push(id);
    }
  };
  if (won) grant("firstWin");
  if (won && (result.method === "KO" || result.method === "TKO")) grant("firstKO");
  if (won && result.method === "SUB") grant("firstSub");
  if (c.tier >= 2) grant("pro");
  if (c.streak >= 3) grant("streak3");
  if (c.streak >= 5) grant("streak5");
  if (c.belts.national) grant("nationalBelt");
  if (c.belts.international) grant("internationalBelt");
  if (c.belts.world) grant("worldBelt");
  if (won && offer.rival === "morrison") grant("rivalMorrison");
  if (won && offer.rival === "orlov") grant("rivalOrlov");
  if (won && offer.rival === "kross") grant("rivalKross");
  if (offer.title && result.round >= 5) grant("fiveRounds");
  if (won && result.dmgTaken < 15) grant("flawless");
  c.offers = makeOffers(c);
  return { career: c, notes, unlocked, belt, tierUp };
}

export function pickOffer(c, id) {
  return c.offers?.find((o) => o.id === id) || null;
}

/** Cosmetics the career has unlocked. */
export const unlockedCosmetics = (c) => COSMETICS.filter((x) => !x.unlock || c.milestones.includes(x.unlock));
export function equip(c, id) {
  const it = unlockedCosmetics(c).find((x) => x.id === id);
  if (!it) return c;
  return { ...c, equipped: { ...c.equipped, [it.kind]: id } };
}

/** Arenas open in Quick Fight thanks to this career (by tier reached). */
export function unlockedArenaTier(c) {
  return c ? c.tier + (c.belts.world ? 1 : 0) : 0;
}

/** Ranking table for a title tier: 10 names with the player inserted at their rank. */
export function rankingTable(c, tier) {
  const rng = makeRng(c.seed + tier * 977);
  const pool = FIGHTERS.slice();
  const rows = [];
  const champ = { 3: "morrison", 4: "orlov", 5: "kross" }[tier];
  const champName = c.belts[TIERS[tier].title] ? `${c.fighter.name} (YOU)` : RIVAL_BY_ID[champ]?.name;
  for (let i = 0; i < 10; i++) {
    const f = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    rows.push({ name: f.name, flag: f.flag, record: `${f.record[0]}-${f.record[1]}` });
  }
  const r = c.tier === tier && !c.belts[TIERS[tier].title] ? c.rank[tier] : tier < c.tier ? null : null;
  if (r) rows.splice(r - 1, 0, { name: c.fighter.name, flag: c.fighter.flag, record: `${c.record.w}-${c.record.l}`, you: true });
  return { champion: champName, rows: rows.slice(0, 10) };
}

export function tierName(c) {
  return TIERS[c.tier].name;
}

/** Validate / repair a loaded career; returns null if unusable. */
export function sanitizeCareer(c) {
  if (!c || typeof c !== "object" || c.version !== CAREER_VERSION) return null;
  if (!c.fighter?.name || !STYLE_TEMPLATES[c.fighter.style]) return null;
  if (!Number.isInteger(c.tier) || c.tier < 0 || c.tier >= TIERS.length) return null;
  c.levels = { ...Object.fromEntries(TRAINING.map((t) => [t.id, 0])), ...(c.levels || {}) };
  for (const t of TRAINING) c.levels[t.id] = clamp(Math.floor(c.levels[t.id] || 0), 0, TRAIN_MAX_LEVEL);
  c.points = Math.max(0, Math.floor(c.points || 0));
  c.milestones = Array.isArray(c.milestones) ? c.milestones.filter((m) => MILESTONES.some((x) => x.id === m)) : [];
  c.belts = { national: !!c.belts?.national, international: !!c.belts?.international, world: !!c.belts?.world };
  c.record = { w: 0, l: 0, d: 0, ko: 0, sub: 0, dec: 0, ...(c.record || {}) };
  c.rank = { 3: 10, 4: 10, 5: 10, ...(c.rank || {}) };
  c.story = { intro: false, contract: false, nationalShot: false, internationalShot: false, worldShot: false, ending: false, ...(c.story || {}) };
  c.rivals = { ...Object.fromEntries(RIVALS.map((r) => [r.id, { met: false, w: 0, l: 0 }])), ...(c.rivals || {}) };
  c.history = Array.isArray(c.history) ? c.history.slice(0, 40) : [];
  c.equipped = { shorts: "shorts-red", gloves: "gloves-black", ...(c.equipped || {}) };
  if (!Array.isArray(c.offers) || !c.offers.length) c.offers = makeOffers(c);
  return c;
}

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}

export { TIERS, BELTS };
