/**
 * Boxing Club — career validator + AI balance simulation (Node):
 *   node src/components/games/BoxingClub/tools/validateOpponents.mjs          validate + quick sim
 *   node .../validateOpponents.mjs --full                                    more fights per matchup
 *
 * 1. Structure: 30 opponents, 6 per tier, unique ids, valid arena / stats /
 *    AI profile / combos / appearance, sensible progression order.
 * 2. Balance: scripted player "bots" of three skill levels (they also see the
 *    opponent through a reaction delay — no cheating either way) fight every
 *    opponent over several seeds, through the real engine. We check that
 *    difficulty climbs across tiers and that the champion is beatable by
 *    good play but not by button mashing.
 */
import { OPPONENTS, TIERS, ARCHETYPES } from "../data/opponents.js";
import { ARENAS } from "../data/arenas.js";
import { ATTACKS } from "../engine/attacks.js";
import { createFight, stepFight } from "../engine/fight.js";
import { canAct } from "../engine/fighter.js";
import { rng } from "../engine/rng.js";

const FULL = process.argv.includes("--full");
const HIST = process.argv.includes("--why") ? {} : null;
let errors = 0;
const err = (m) => {
  errors++;
  console.error("✗", m);
};

/* ------------------------------------------------------------ structure */
if (OPPONENTS.length !== 30) err(`expected 30 opponents, got ${OPPONENTS.length}`);
const ids = new Set();
for (const [i, o] of OPPONENTS.entries()) {
  const tag = `${i + 1}. ${o.name}`;
  if (ids.has(o.id)) err(`${tag}: duplicate id ${o.id}`);
  ids.add(o.id);
  if (o.tier !== Math.floor(i / 6) + 1) err(`${tag}: tier ${o.tier} out of order`);
  if (!ARENAS.some((a) => a.id === o.arena)) err(`${tag}: bad arena ${o.arena}`);
  if (TIERS[o.tier - 1].arena !== o.arena) err(`${tag}: arena doesn't match tier`);
  if (!ARCHETYPES[o.arch]) err(`${tag}: bad archetype`);
  for (const k of ["power", "speed", "stamina", "recovery"]) {
    const v = o.stats[k];
    if (!Number.isInteger(v) || v < 1 || v > 10) err(`${tag}: stat ${k}=${v}`);
  }
  if (!(o.maxHealth >= 80 && o.maxHealth <= 130)) err(`${tag}: health ${o.maxHealth}`);
  const p = o.profile;
  for (const k of ["aggression", "blockRate", "dodgeRate", "counterRate", "guardHabit", "bodyRate", "discipline", "pressure", "footwork", "toughness"]) {
    if (!(p[k] >= 0 && p[k] <= 1)) err(`${tag}: profile.${k}=${p[k]}`);
  }
  if (!(p.reaction >= 150 && p.reaction <= 450)) err(`${tag}: reaction ${p.reaction}`);
  if (!(p.preferredRange >= 0.8 && p.preferredRange <= 1.25)) err(`${tag}: range ${p.preferredRange}`);
  if (!p.combos?.length || p.combos.some((c) => !c.length || c.some((a) => !ATTACKS[a]))) err(`${tag}: bad combos`);
  for (const k of ["powerMul", "timeMul", "moveMul"]) if (p[k] !== undefined && !(p[k] >= 0.8 && p[k] <= 1.25)) err(`${tag}: ${k} ${p[k]} outside fair range`);
  const L = o.look;
  if (!/^#[0-9a-f]{6}$/i.test(L.skin) || !/^#[0-9a-f]{6}$/i.test(L.shorts) || !L.gloves?.base || !L.hair) err(`${tag}: bad look`);
  if (!o.name || !o.nickname || !o.record || !o.bio) err(`${tag}: missing text`);
}
const tierReact = [1, 2, 3, 4, 5].map((t) => OPPONENTS.filter((o) => o.tier === t).reduce((a, o) => a + o.profile.reaction, 0) / 6);
for (let t = 1; t < 5; t++) if (tierReact[t] >= tierReact[t - 1]) err(`tier ${t + 1} reacts no faster than tier ${t}`);
if (OPPONENTS[29].id !== "darius") err("final fight must be the champion");
console.log(`structure: ${OPPONENTS.length} opponents checked, ${errors} problems`);
console.log(`avg reaction by tier: ${tierReact.map((r) => Math.round(r)).join(" → ")} ms`);

/* ------------------------------------------------------------ bot player */
const BOTS = {
  masher: { reaction: 999, block: 0, dodge: 0, counter: 0, range: 0.95, discipline: 0, mash: true },
  novice: { reaction: 330, block: 0.3, dodge: 0.05, counter: 0.15, range: 1.0, discipline: 0.2 },
  average: { reaction: 250, block: 0.45, dodge: 0.15, counter: 0.35, range: 1.02, discipline: 0.5 },
  expert: { reaction: 190, block: 0.5, dodge: 0.35, counter: 0.7, range: 1.05, discipline: 0.8 },
};

function makeBot(level, seed) {
  const b = BOTS[level];
  const r = rng(seed);
  const hist = [];
  let seenUid = 0;
  let blockT = 0;
  let pendingDodge = null;
  let plan = [];
  let cd = 0;
  let lastCounterUid = 0;
  let wasInRange = false;
  let entryDelay = 0;
  return (fight, dt) => {
    const me = fight.player;
    const op = fight.opponent;
    const out = { move: 0, block: false, attack: null, body: false, dodge: null };
    hist.push({ t: fight.time, x: op.x, atk: op.attack ? { id: op.attack.id, uid: op.attack.uid, t: op.attack.t, su: op.attack.su, ac: op.attack.ac, whiff: op.attack.whiff } : null, guard: op.state === "block" });
    while (hist.length > 150) hist.shift();
    if (fight.phase !== "fight") return out;
    let seen = hist[0];
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].t <= fight.time - b.reaction) { seen = hist[i]; break; }
    const d = op.x - me.x;
    if (b.mash) {
      out.attack = ["jab", "cross", "hookL"][Math.floor(r() * 3)];
      out.move = d > 0.8 ? 1 : 0;
      return out;
    }
    if (blockT > 0) blockT -= dt;
    if (cd > 0) cd -= dt;
    const sa = seen.atk;
    if (sa && sa.uid !== seenUid && sa.t < sa.su + sa.ac) {
      seenUid = sa.uid;
      const timeLeft = sa.su - (sa.t + b.reaction);
      const worthIt = level === "novice" || timeLeft > 30;
      if (d <= ATTACKS[sa.id].reach + 0.2 && worthIt) {
        const roll = r();
        if (roll < b.dodge && ATTACKS[sa.id].target === "head") pendingDodge = r() < 0.5 ? "in" : "back";
        else if (roll < b.dodge + b.block) blockT = 420;
      }
    }
    if (sa && (sa.whiff || sa.t >= sa.su + sa.ac) && sa.uid !== lastCounterUid && r() < b.counter) {
      lastCounterUid = sa.uid;
      plan = [d < 0.85 ? "hookL" : "cross"];
    }
    if (me.counterT > 0 && !plan.length && r() < b.counter) plan = ["cross"];
    if (pendingDodge && (me.state === "neutral" || me.state === "block")) {
      out.dodge = pendingDodge;
      pendingDodge = null;
      return out;
    }
    if (blockT > 0 && me.state !== "attack") {
      out.block = true;
      return out;
    }
    const tired = me.stamina < 20 + 30 * b.discipline;
    if (plan.length && canAct(me)) {
      if (d <= ATTACKS[plan[0]].reach - 0.02) out.attack = plan.shift();
      else out.move = 1;
      return out;
    }
    // human initiation latency: a short beat after coming into range
    if (d <= 1.05 && !wasInRange) entryDelay = 100 + r() * 150;
    wasInRange = d <= 1.05;
    if (entryDelay > 0) entryDelay -= dt;
    if (!plan.length && cd <= 0 && entryDelay <= 0 && !tired && d <= 1.05 && canAct(me)) {
      cd = 250 + r() * 300;
      const c = r();
      plan = c < 0.45 ? ["jab"] : c < 0.75 ? ["jab", "cross"] : c < 0.88 ? ["jab", "bodyCross"] : ["jab", "cross", "hookL"];
      if (seen.guard && r() < 0.5) plan = ["bodyJab", "bodyCross"];
    }
    const want = tired ? 1.6 : b.range;
    if (d > want + 0.08) out.move = 1;
    else if (d < want - 0.12) out.move = -1;
    return out;
  };
}

export function simulate(opp, level, seed) {
  const f = createFight({ seed, rounds: 3, roundTime: 75, player: { name: "Bot", stats: { power: 1 + opp.tier, speed: 1 + opp.tier, stamina: 1 + opp.tier, recovery: 1 + opp.tier } }, opponent: { name: opp.name, maxHealth: opp.maxHealth, stats: opp.stats, profile: opp.profile } });
  const bot = makeBot(level, seed * 13 + 1);
  let guard = 0;
  while (!f.over && guard++ < 20000) {
    // the bot decides once per frame (60 Hz); knockdown recovery pressed on time
    const inp = bot(f, 1000 / 60);
    if (f.phase === "knockdown" && f.kd?.who === "player") {
      const k = f.kd;
      const good = level !== "masher" && Math.abs(k.marker - k.zoneAt) < k.zone / 2 - 0.02 && (level !== "novice" || (f.time % 700) < 350);
      inp.recover = good || (level === "masher" && Math.random() < 0.5);
    }
    if (f.phase === "corner") inp.skip = true;
    const before = f.opponent.state + (f.opponent.attack ? ":" + f.opponent.attack.id + ":" + (f.opponent.attack.t < f.opponent.attack.su ? "startup" : f.opponent.attack.t < f.opponent.attack.su + f.opponent.attack.ac ? "active" : "recovery") + (f.opponent.attack.fromCounter ? "(ctrwin)" : "") : "");
    const evs = stepFight(f, 1000 / 60, inp);
    if (HIST) for (const e of evs) if (e.type === "hit" && e.who === "player") HIST[before + (e.counter ? " (counter)" : "") + " ← " + e.attack] = (HIST[before + (e.counter ? " (counter)" : "") + " ← " + e.attack] || 0) + 1;
  }
  return { ...f.result, stats: { p: pick(f.stats.player), o: pick(f.stats.opponent) } };
}
const pick = (s) => ({ thr: s.thrown, land: s.landed, whf: s.whiffs, blkd: s.blocked, blocks: s.blocks, ev: s.evades, ctr: s.counters, kd: s.knockdowns, dmg: Math.round(s.damage) });

if (process.argv.includes("--trace")) {
  const o = OPPONENTS[Number(process.argv[process.argv.indexOf("--trace") + 1]) - 1];
  for (const lv of ["novice", "average", "expert"]) {
    const res = simulate(o, lv, 7);
    const s = res.stats || {};
    console.log(lv, res.winner, res.method, "round", res.round, JSON.stringify(res.stats));
  }
  if (HIST) console.log(Object.entries(HIST).sort((a, b) => b[1] - a[1]).slice(0, 14));
  process.exit(0);
}
const levels = ["masher", "novice", "average", "expert"];
const seeds = FULL ? 10 : 4;
const table = [];
for (const o of OPPONENTS) {
  const row = { name: `${o.tier}. ${o.name}`.padEnd(22) };
  for (const lv of levels) {
    let w = 0;
    let ko = 0;
    for (let s = 1; s <= seeds; s++) {
      const res = simulate(o, lv, s * 97 + o.id.length);
      if (res?.winner === "player") w++;
      if (res && (res.method === "KO" || res.method === "TKO")) ko++;
    }
    row[lv] = w / seeds;
    row[lv + "KO"] = ko;
  }
  table.push(row);
}
console.log(`\nwin rate of scripted player bots (${seeds} fights each; bot attributes grow with the tier like a real player's):`);
console.log(`${"opponent".padEnd(22)} masher novice average expert`);
for (const r of table) console.log(`${r.name} ${pad(r.masher)}  ${pad(r.novice)}  ${pad(r.average)}   ${pad(r.expert)}`);
function pad(v) {
  return `${Math.round(v * 100)}%`.padStart(5);
}
const tierAvg = (lv) => [1, 2, 3, 4, 5].map((t) => table.filter((_, i) => OPPONENTS[i].tier === t).reduce((a, r) => a + r[lv], 0) / 6);
for (const lv of levels) console.log(`${lv.padEnd(8)} by tier: ${tierAvg(lv).map((v) => Math.round(v * 100) + "%").join(" → ")}`);

// balance expectations
const nov = tierAvg("novice");
const avg = tierAvg("average");
const exp = tierAvg("expert");
if (table[0].novice < 0.5) err("a novice should usually beat the first opponent");
if (!(avg[0] > avg[4])) err("average bot should find the championship harder than the local gym");
if (exp[4] <= 0) err("the champion tier must be beatable by expert play");
if (tierAvg("masher")[4] > 0.25) err("mashing shouldn't beat the championship tier");
if (nov[4] > avg[4] + 0.2) err("skill should matter at the top");
console.log(`\n${errors ? errors + " problems" : "all checks passed"}`);
process.exit(errors ? 1 : 0);
