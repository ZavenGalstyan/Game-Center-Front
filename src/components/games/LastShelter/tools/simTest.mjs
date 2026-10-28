/**
 * Last Shelter — headless test suite. Run from the repo root:
 *   node src/components/games/LastShelter/tools/simTest.mjs [all|data|house|scavenge|shelter|endings|save] [runs]
 *
 * data      events/expeditions are well-formed: ≥80 events, ≥2 real choices
 *           each, every chained id exists, every choice runs at low/high rolls
 * house     every item, hiding spot and the hatch are reachable on foot
 * scavenge  an A* bot plays the real 60-second sim over many seeds
 * shelter   thousands of simulated days with mixed strategies: no negative
 *           stock, no NaN, stats in range, events always answerable
 * endings   targeted strategies reach every one of the 9 endings
 * save      serialise mid-run → JSON → continue == uninterrupted run
 */
import { pathToFileURL } from "node:url";
import { createScavenge, tickScavenge, resolve, summary, colliders, RADIUS, REACH, TIME_LIMIT, serializeScavenge, restoreScavenge } from "../engine/scavenge.js";
import { createShelter, endDay, chooseEvent, choiceState, suggestPlan, doAction, actionState, present, serializeShelter, sanitize, validShelter, applyFx, ACTIONS } from "../engine/shelter.js";
import { startExpedition, canSend, destState, riskOf } from "../engine/expedition.js";
import { EVENTS, EVENT_BY_ID } from "../data/events/index.js";
import { DESTS, DEST_BY_ID } from "../data/expeditions.js";
import { ENDING_IDS } from "../engine/endings.js";
import { HATCH, HIDING, SPAWNS, HOUSE_W, HOUSE_D, PLAYER_START } from "../data/house.js";
import { RES_KEYS } from "../data/items.js";

const which = process.argv[2] || "all";
const RUNS = +process.argv[3] || 0;
let fails = 0;
let checks = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) {
    fails++;
    console.log("  FAIL", msg);
  }
};
const section = (n) => console.log(`\n== ${n}`);

/* ------------------------------------------------------------------ data */
function testData() {
  section("data");
  ok(EVENTS.length >= 80, `≥80 events (have ${EVENTS.length})`);
  const ids = new Set();
  for (const e of EVENTS) {
    ok(!ids.has(e.id), `unique id ${e.id}`);
    ids.add(e.id);
    ok(Array.isArray(e.choices) && e.choices.length >= 2, `${e.id}: ≥2 choices`);
    ok(typeof e.title === "string" && typeof e.text === "string" && e.text.length > 30, `${e.id}: has writing`);
  }
  const cats = new Set(EVENTS.map((e) => e.cat));
  for (const c of ["noises", "visitor", "equipment", "radio", "spoilage", "illness", "leak", "discovery", "dilemma", "family", "mystery", "rescue", "expedition", "hazard"]) ok(cats.has(c), `category ${c} present`);
  // chained ids referenced by queue fx and by engine code exist
  const src = EVENTS.map((e) => e.choices.map((c) => c.run.toString()).join("\n")).join("\n");
  for (const m of src.matchAll(/id: "([a-z_]+)"/g)) ok(EVENT_BY_ID[m[1]], `queued event ${m[1]} exists`);
  for (const id of ["radio_relief", "cedar_talk", "deep_line", "raiders_hatch"]) ok(EVENT_BY_ID[id], `engine-queued ${id} exists`);
  // every choice runs at a low and high roll from a rich state without throwing, and choices differ
  let fake = 0;
  for (const e of EVENTS) {
    const outs = [];
    for (let ci = 0; ci < e.choices.length; ci++) {
      for (const r of [0.05, 0.5, 0.95]) {
        const S = richState(7);
        const c = { who: "hollis", who2: "june", away: "remy" };
        S.fam.remy.away = true;
        S.exp = { who: "remy", dest: "store", gear: [], days: 3, left: 2, start: S.day - 2, risk: 0.2 };
        try {
          const res = e.choices[ci].run(S, c, r);
          ok(res && typeof res.text === "string", `${e.id}#${ci} returns text`);
          applyFx(S, res.fx, c);
          if (r === 0.5) outs.push(JSON.stringify(res.fx) + res.text);
          for (const k of RES_KEYS) ok(S.res[k] >= 0, `${e.id}#${ci} keeps ${k} ≥ 0`);
        } catch (err) {
          ok(false, `${e.id}#${ci} r=${r} threw ${err.message}`);
        }
      }
    }
    if (new Set(outs).size < outs.length) fake++;
  }
  ok(fake === 0, `no event has two identical choices (${fake})`);
  ok(DESTS.length >= 5, "≥5 expedition destinations");
  console.log(`  ${EVENTS.length} events in ${cats.size} categories, ${DESTS.length} destinations`);
}
function richState(seed) {
  const S = createShelter({ seed, summary: { runner: "hollis", survivors: ["hollis", "june", "remy", "pip"], saved: ["june", "remy", "pip"], lost: [], delivered: { water: 6, food: 6, medkit: 2, flashlight: 1, radio: 1, toolkit: 1, map: 1, gasmask: 1, batteries: 2, books: 1, backpack: 1 } } });
  S.day = 12;
  return S;
}

/* ------------------------------------------------------------------ house grid / pathing */
const CELL = 0.2;
const GW = Math.round(HOUSE_W / CELL);
const GD = Math.round(HOUSE_D / CELL);
let FREE = null;
function freeGrid() {
  if (FREE) return FREE;
  FREE = new Uint8Array(GW * GD);
  for (let j = 0; j < GD; j++)
    for (let i = 0; i < GW; i++) {
      const x = (i + 0.5) * CELL;
      const z = (j + 0.5) * CELL;
      const [rx, rz] = resolve(x, z, RADIUS + 0.04);
      FREE[j * GW + i] = Math.hypot(rx - x, rz - z) < 1e-6 ? 1 : 0;
    }
  return FREE;
}
const cellOf = (x, z) => [Math.min(GW - 1, Math.max(0, Math.floor(x / CELL))), Math.min(GD - 1, Math.max(0, Math.floor(z / CELL)))];
function nearestFree(x, z) {
  const F = freeGrid();
  const [ci, cj] = cellOf(x, z);
  for (let r = 0; r < 20; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i >= 0 && j >= 0 && i < GW && j < GD && F[j * GW + i]) return [i, j];
      }
  return null;
}
/** A* on the free grid; goal = any cell within `reach` of (gx, gz). Returns world points. */
function path(sx, sz, gx, gz, reach) {
  const F = freeGrid();
  const s = nearestFree(sx, sz);
  if (!s) return null;
  const N = GW * GD;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = [];
  const si = s[1] * GW + s[0];
  g[si] = 0;
  open.push([0, si]);
  const H = (i, j) => Math.max(0, Math.hypot((i + 0.5) * CELL - gx, (j + 0.5) * CELL - gz) - reach);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open.splice(bi, 1)[0];
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % GW;
    const cj = (cur / GW) | 0;
    if (Math.hypot((ci + 0.5) * CELL - gx, (cj + 0.5) * CELL - gz) <= reach) {
      const pts = [];
      for (let c = cur; c >= 0; c = came[c]) pts.push({ x: ((c % GW) + 0.5) * CELL, z: (((c / GW) | 0) + 0.5) * CELL });
      return pts.reverse();
    }
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GD) continue;
        const n = nj * GW + ni;
        if (!F[n] || closed[n]) continue;
        if (di && dj && (!F[cj * GW + ni] || !F[nj * GW + ci])) continue;
        const ng = g[cur] + (di && dj ? 1.414 : 1) * CELL;
        if (ng < g[n]) {
          g[n] = ng;
          came[n] = cur;
          open.push([ng + H(ni, nj), n]);
        }
      }
  }
  return null;
}
const pathLen = (p) => p.reduce((a, q, i) => (i ? a + Math.hypot(q.x - p[i - 1].x, q.z - p[i - 1].z) : 0), 0);

function testHouse() {
  section("house");
  const C = colliders();
  ok(C.length > 40, `colliders built (${C.length})`);
  const [sx, sz] = resolve(PLAYER_START.x, PLAYER_START.z);
  ok(Math.hypot(sx - PLAYER_START.x, sz - PLAYER_START.z) < 1e-6, "player start is free");
  let worst = 0;
  for (const sp of SPAWNS) {
    const p = path(PLAYER_START.x, PLAYER_START.z, sp.x, sp.z, REACH - 0.1);
    ok(!!p, `spawn ${sp.room} (${sp.x},${sp.z}) reachable`);
    if (p) worst = Math.max(worst, pathLen(p));
  }
  for (const [id, spots] of Object.entries(HIDING))
    for (const h of spots) {
      const [hx, hz] = resolve(h.x, h.z);
      ok(Math.hypot(hx - h.x, hz - h.z) < 0.05, `${id} hiding (${h.x},${h.z}) not inside furniture`);
      const p = path(PLAYER_START.x, PLAYER_START.z, h.x, h.z, REACH);
      ok(!!p, `${id} hiding (${h.x},${h.z}) reachable`);
      const back = path(h.x, h.z, HATCH.x, HATCH.z, HATCH.r - 0.3);
      ok(!!back, `${id} hiding → hatch reachable`);
    }
  const ph = path(PLAYER_START.x, PLAYER_START.z, HATCH.x, HATCH.z, HATCH.r - 0.3);
  ok(!!ph, "hatch reachable from start");
  console.log(`  ${SPAWNS.length} spawns, farthest item walk ${worst.toFixed(1)} m, start→hatch ${ph ? pathLen(ph).toFixed(1) : "?"} m`);
}

/* ------------------------------------------------------------------ scavenge bot */
export function runScavengeBot(seed, { greedItems = 2, runner = "hollis", stopAt = 0 } = {}) {
  const S = createScavenge({ seed, runner });
  const dt = 1 / 30;
  let route = null;
  let goal = null;
  let interactQ = false;
  let itemsTrips = 0;
  const pickGoal = () => {
    // escort the closest waiting family member first, then grab loot by value
    const P = S.P;
    if (S.escort || S.carry.length >= S.cap - 0 || (S.carry.length && (S.family.some((f) => f.state === "waiting") || itemsTrips >= greedItems + 1)))
      if (S.escort || S.carry.length) return { x: HATCH.x, z: HATCH.z, reach: HATCH.r - 0.5, kind: "hatch" };
    const left = S.limit - S.t;
    const wait = S.family.filter((f) => f.state === "waiting");
    if (wait.length) {
      wait.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
      return { x: wait[0].x, z: wait[0].z, reach: REACH, kind: "family", id: wait[0].id };
    }
    const value = { water: 3, food: 3, medkit: 2.5, toolkit: 2.4, radio: 2.2, flashlight: 2, map: 1.8, batteries: 1.5, gasmask: 1.4, backpack: 3.5, books: 1 };
    const cand = S.items.filter((i) => !i.taken).map((i) => ({ i, d: Math.hypot(i.x - P.x, i.z - P.z) + Math.hypot(i.x - HATCH.x, i.z - HATCH.z) }));
    cand.sort((a, b) => b.i && value[b.i.kind] / (b.d + 4) - value[a.i.kind] / (a.d + 4));
    if (left < 9 || !cand.length) return { x: HATCH.x, z: HATCH.z, reach: HATCH.r - 0.5, kind: "hatch" };
    for (const c of cand) {
      const slots = c.i.kind === "radio" || c.i.kind === "toolkit" ? 2 : c.i.kind === "backpack" ? 0 : 1;
      if (S.carry.length + slots <= S.cap) return { x: c.i.x, z: c.i.z, reach: REACH - 0.15, kind: "item", id: c.i.id };
    }
    return { x: HATCH.x, z: HATCH.z, reach: HATCH.r - 0.5, kind: "hatch" };
  };
  let steps = 0;
  let stuck = 0;
  while (!S.ended && steps++ < 60 * 40) {
    if (stopAt && S.t >= stopAt) break;
    if (!goal || !route) {
      goal = pickGoal();
      route = path(S.P.x, S.P.z, goal.x, goal.z, goal.reach) || [];
    }
    let mx = 0;
    let mz = 0;
    // skip to the nearest upcoming waypoint (look-ahead steering cuts corners)
    let near = 0;
    for (let k = 1; k < Math.min(route.length, 10); k++) if (Math.hypot(route[k].x - S.P.x, route[k].z - S.P.z) < Math.hypot(route[near].x - S.P.x, route[near].z - S.P.z)) near = k;
    if (near) route.splice(0, near);
    while (route.length && Math.hypot(route[0].x - S.P.x, route[0].z - S.P.z) < 0.15) route.shift();
    if (route.length) {
      const look = route[Math.min(2, route.length - 1)];
      mx = look.x - S.P.x;
      mz = look.z - S.P.z;
      const m = Math.hypot(mx, mz) || 1;
      mx /= m;
      mz /= m;
    }
    if (process.env.BOTDBG && steps % 15 === 0) console.log(S.t.toFixed(2), S.P.x.toFixed(2), S.P.z.toFixed(2), goal && goal.kind, route && route.length, mx.toFixed(2), mz.toFixed(2), route && route[0] && route[0].x.toFixed(2)+","+route[0].z.toFixed(2));
    const prev = { x: S.P.x, z: S.P.z };
    const evBefore = S.saved.length + S.carry.length;
    tickScavenge(S, { mx, mz, interact: interactQ, descend: false }, dt);
    interactQ = false;
    if (S.intro > 0) continue;
    if (Math.hypot(S.P.x - prev.x, S.P.z - prev.z) < 1e-3 && route.length) {
      if (++stuck > 20) {
        route = null;
        stuck = 0;
      }
    } else stuck = 0;
    if (!route.length) {
      if (goal.kind === "hatch") {
        if (S.inHatch) {
          if (S.carry.length === 0 && !S.escort) {
            if (goal.kind === "hatch" && S.limit - S.t < 9) {
              // wait it out on the hatch
            } else {
              itemsTrips++;
              goal = null;
            }
          }
        } else route = null;
      } else {
        interactQ = true;
        goal = null;
      }
    }
    if (S.saved.length + S.carry.length !== evBefore) goal = null;
    S.events.length = 0;
  }
  return S;
}

function testScavenge() {
  section("scavenge");
  const N = RUNS || 40;
  let safe = 0;
  let allFam = 0;
  let items = 0;
  for (let k = 0; k < N; k++) {
    const S = runScavengeBot(1000 + k * 7919, { runner: k % 2 ? "june" : "hollis" });
    const sum = summary(S);
    if (S.ended === "safe") safe++;
    if (sum.saved.length === 3) allFam++;
    items += Object.values(sum.delivered).reduce((a, b) => a + b, 0);
    ok(S.t <= TIME_LIMIT + 0.05, `seed ${k}: timer bounded`);
  }
  ok(safe === N, `bot reaches the hatch every run (${safe}/${N})`);
  ok(allFam >= N * 0.9, `bot can save the whole family in ≥90% of layouts (${allFam}/${N})`);
  console.log(`  ${N} runs: safe ${safe}, whole family ${allFam}, avg items ${(items / N).toFixed(1)}`);
  // a runner who dawdles fails
  const S = createScavenge({ seed: 5 });
  for (let i = 0; i < 70 * 30; i++) tickScavenge(S, { mx: -1, mz: 0 }, 1 / 30);
  ok(S.ended === "failed", "standing away from the hatch at 0:00 fails");
  // capacity and escort rules
  const T = createScavenge({ seed: 9 });
  T.intro = 0;
  const it = T.items.find((i) => i.kind === "water");
  T.P.x = it.x;
  T.P.z = it.z + 0.6;
  T.carry = ["food", "food", "food", "food"];
  tickScavenge(T, { mx: 0, mz: 0, interact: true }, 1 / 30);
  ok(!it.taken || T.carry.length <= T.cap, "full hands can't pick more");
  // collision: walk into a wall for 3 s
  const W = createScavenge({ seed: 3 });
  W.intro = 0;
  W.P.x = 3.9;
  W.P.z = 9.6;
  for (let i = 0; i < 90; i++) tickScavenge(W, { mx: -1, mz: 0 }, 1 / 30);
  ok(W.P.x >= 0.4 && Math.abs(W.P.z - 9.6) < 1e-6, "solid collision stops the runner at the wall");
  // save/restore mid-run
  const A = runScavengeBot(4242, { stopAt: 20 });
  const B = restoreScavenge(JSON.parse(JSON.stringify(serializeScavenge(A))));
  ok(B && Math.abs(B.t - A.t) < 1e-9 && B.items.length === A.items.length, "scavenge state survives serialise/restore");
}

/* ------------------------------------------------------------------ shelter strategies */
const PREFS = {
  sensible: [],
  rescue: ["Signal", "Keep listening", "fire", "Rush up", "Write down"],
  cedar: ["prove", "Leave 2 Medicine", "Send", "Ask how", "Study"],
  garden: ["Keep them safe", "Build proper", "Improvise", "Build a proper", "tarp"],
  discovery: ["Tap back", "Break through", "Chip", "Follow", "Move the family", "Find where", "Write them all", "Let Remy decode", "Go down"],
  caravan: ["Leave with them", "Go with them"],
  random: [],
};
function chooseIndex(S, strat, rand) {
  const ev = EVENT_BY_ID[S.event.id];
  const avail = ev.choices.map((c, i) => [c, i]).filter(([c]) => choiceState(S, c) === true);
  ok(avail.length >= 1, `event ${ev.id} on day ${S.day} has an available choice`);
  if (!avail.length) return -1;
  if (strat === "random") return avail[Math.floor(rand() * avail.length)][1];
  for (const kw of PREFS[strat] || []) {
    const hit = avail.find(([c]) => c.label.toLowerCase().includes(kw.toLowerCase()));
    if (hit) return hit[1];
  }
  // avoid self-destructive choices for a "sensible" family
  const avoid = /Leave with|Go with them|Move the family|Go down|Let .* go|Ignore|Close the hatch|Turn .* away/;
  const safe = avail.filter(([c]) => !avoid.test(c.label));
  const pool = safe.length ? safe : avail;
  return pool[Math.floor(rand() * pool.length)][1];
}
function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function playShelter(seed, strat = "sensible", delivered = null, maxDays = 80) {
  const rand = makeRand(seed * 31 + 7);
  const d = delivered || { water: 5, food: 5, medkit: 1, flashlight: 1, radio: 1, toolkit: 1, map: 1, gasmask: 1, batteries: 1, books: 1, backpack: 1 };
  const S = createShelter({ seed, summary: { runner: "hollis", survivors: ["hollis", "june", "remy", "pip"], saved: ["june", "remy", "pip"], lost: [], delivered: d } });
  while (!S.ending && S.day < maxDays) {
    check(S);
    if (S.event && !S.event.quiet && !S.event.done) {
      const i = chooseIndex(S, strat, rand);
      if (i >= 0) chooseEvent(S, i);
      if (S.ending) break;
    }
    // actions
    const act = strat === "rescue" || strat === "cedar" ? "listen" : S.shelter < 70 ? "repairShelter" : S.radio < 40 ? "repairRadio" : "storytime";
    if (actionState(S, act) === true) doAction(S, act);
    else if (actionState(S, "rest") === true && rand() < 0.3) doAction(S, "rest");
    suggestPlan(S);
    // expeditions when stock is getting low
    if (!S.exp && strat !== "random") {
      const low = S.res.food + S.res.water < 7;
      const destId = strat === "cedar" && !S.flags.cedarFreq ? "mast" : strat === "discovery" && S.flags.tunnelOpen && !S.flags.deepSeen ? "tunnels" : low ? (S.day > 10 ? "elm" : "store") : null;
      if (destId) {
        const who = present(S)
          .filter((id) => canSend(S, id) === true && destState(S, DEST_BY_ID[destId], id) === true)
          .sort((a, b) => S.fam[b].hp - S.fam[a].hp)[0];
        if (who && present(S).length >= 2 && S.fam[who].hp > 60) {
          const gear = ["map", "gasmask", "flashlight", "backpack"].filter((g) => S.items[g]);
          startExpedition(S, who, destId, gear);
        }
      }
    } else if (!S.exp && strat === "random" && rand() < 0.15) {
      const dests = DESTS.filter((x) => destState(S, x, "hollis") === true);
      const who = present(S)[Math.floor(rand() * present(S).length)];
      if (who && dests.length) startExpedition(S, who, dests[Math.floor(rand() * dests.length)].id, ["flashlight", "map"].filter((g) => S.items[g]));
    }
    endDay(S);
  }
  check(S);
  return S;
}
function check(S) {
  for (const k of RES_KEYS) ok(Number.isInteger(S.res[k]) && S.res[k] >= 0, `day ${S.day}: ${k}=${S.res[k]} is a non-negative integer`);
  ok(S.shelter >= 0 && S.shelter <= 100 && !Number.isNaN(S.shelter), `shelter in range (${S.shelter})`);
  for (const m of Object.values(S.fam)) {
    for (const k of ["hp", "hunger", "thirst", "morale", "fatigue"]) ok(m[k] >= 0 && m[k] <= 100 && !Number.isNaN(m[k]), `${m.id}.${k}=${m[k]} in range`);
    ok(m.sick >= 0 && m.sick <= 3 && m.injured >= 0 && m.injured <= 2, `${m.id} sick/injured in range`);
    if (!m.alive) ok(!m.away, `${m.id} dead is not away`);
  }
  if (S.exp) ok(S.fam[S.exp.who]?.alive && S.fam[S.exp.who].away, "expedition member is alive and away");
  ok(Object.values(S.fam).filter((m) => m.away).length <= 1, "at most one person away");
  if (!S.ending && present(S).length) ok(!!S.event, `day ${S.day} has an event or quiet day`);
}

function testShelter() {
  section("shelter");
  const N = RUNS || 300;
  const dist = {};
  const daysBy = {};
  for (const strat of ["sensible", "random"]) {
    let days = 0;
    for (let k = 0; k < N; k++) {
      const S = playShelter(k + 1, strat);
      const e = S.ending ? S.ending.id : "ongoing";
      dist[`${strat}:${e}`] = (dist[`${strat}:${e}`] || 0) + 1;
      days += S.day;
    }
    daysBy[strat] = (days / N).toFixed(1);
  }
  console.log("  avg days:", daysBy);
  console.log("  endings:", dist);
  ok(+daysBy.sensible >= 25, `a careful family lasts weeks even without chasing a story (avg ${daysBy.sensible} days)`);
  ok(+daysBy.sensible > +daysBy.random + 8, "careful play clearly beats random play");
  ok((dist["random:exhaustion"] || 0) + (dist["random:collapse"] || 0) + (dist["random:lost_expedition"] || 0) > N * 0.1, "random play is punished");
  // starting with nothing is hard but not hopeless
  let poorDays = 0;
  for (let k = 0; k < 100; k++) poorDays += playShelter(5000 + k, "sensible", { water: 0, food: 0, medkit: 0, flashlight: 0, radio: 0, toolkit: 0, map: 0, gasmask: 0, batteries: 0, books: 0, backpack: 0 }).day;
  console.log(`  empty-handed start survives ${(poorDays / 100).toFixed(1)} days on average`);
  ok(poorDays / 100 >= 6, "an empty-handed family is not doomed on day 2");
  // rations matter: never feeding anyone is fatal
  const S = createShelter({ seed: 3, summary: { runner: "hollis", survivors: ["hollis", "june"], saved: ["june"], lost: ["remy", "pip"], delivered: { water: 9, food: 9 } } });
  let d = 0;
  while (!S.ending && d++ < 60) {
    if (S.event && !S.event.quiet && !S.event.done) {
      const ev = EVENT_BY_ID[S.event.id];
      const i = ev.choices.findIndex((c) => choiceState(S, c) === true && !/Leave|Go with|Move the family|Go down/.test(c.label));
      if (i >= 0) chooseEvent(S, i);
    }
    endDay(S);
  }
  ok(S.ending && ["exhaustion", "lost_expedition", "collapse"].includes(S.ending.id) && S.day < 25, `starving everyone ends badly (${S.ending?.id} day ${S.day})`);
}

function testEndings() {
  section("endings");
  const found = {};
  const strats = ["rescue", "cedar", "garden", "discovery", "caravan", "random", "sensible", "poor"];
  const EMPTY = { water: 1, food: 1, medkit: 0, flashlight: 0, radio: 0, toolkit: 0, map: 0, gasmask: 0, batteries: 0, books: 0, backpack: 0 };
  const GOOD = { rescue: "rescued", cedar: "settlement", garden: "selfsufficient", discovery: "discovery", caravan: "caravan" };
  for (const strat of strats) {
    let hit = 0;
    const n = RUNS || 250;
    for (let k = 0; k < n; k++) {
      const S = strat === "poor" ? playShelter(9000 + k * 13, "sensible", EMPTY) : playShelter(9000 + k * 13, strat);
      if (S.ending) (found[S.ending.id] ||= []).push(`${strat}#${k}@${S.ending.day}`);
      if (S.ending && S.ending.id === GOOD[strat]) hit++;
    }
    if (GOOD[strat] && strat !== "garden") ok(hit >= n * 0.3, `pursuing ${GOOD[strat]} works at least 30% of the time (${hit}/${n})`);
  }
  // failed evacuation comes from the house phase
  const F = createScavenge({ seed: 1 });
  for (let i = 0; i < 70 * 30; i++) tickScavenge(F, { mx: 0, mz: -1 }, 1 / 30);
  if (F.ended === "failed") (found.failed_evac ||= []).push("scavenge");
  for (const id of ENDING_IDS) ok(found[id], `ending ${id} reachable${found[id] ? ` (e.g. ${found[id][0]}, ${found[id].length}×)` : ""}`);
  console.log("  reached:", Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length])));
}

function testSave() {
  section("save");
  for (const seed of [11, 22, 33]) {
    const A = playShelter(seed, "sensible", null, 9);
    if (A.ending) continue;
    const json = JSON.stringify(serializeShelter(A));
    const B = sanitize(JSON.parse(json));
    ok(validShelter(B), "save validates");
    // advance both identically
    const step = (S) => {
      for (let i = 0; i < 6 && !S.ending; i++) {
        if (S.event && !S.event.quiet && !S.event.done) {
          const ev = EVENT_BY_ID[S.event.id];
          const ci = ev.choices.findIndex((c) => choiceState(S, c) === true);
          chooseEvent(S, ci);
        }
        suggestPlan(S);
        endDay(S);
      }
      return JSON.stringify(S);
    };
    ok(step(A) === step(B), `seed ${seed}: loaded game continues identically`);
  }
  ok(!validShelter({ v: 99 }), "rejects foreign saves");
  const bad = sanitize({ ...JSON.parse(JSON.stringify(playShelter(5, "sensible", null, 4))), res: { food: -3, water: "x", meds: 2.7, batteries: null } });
  ok(bad.res.food === 0 && bad.res.water === 0 && bad.res.meds === 2 && bad.res.batteries === 0, "sanitize repairs broken numbers");
  ok(Object.keys(ACTIONS).length >= 4, "shelter actions defined");
}

const MAIN = import.meta.url === pathToFileURL(process.argv[1] || "").href;
const T0 = Date.now();
if (!MAIN) {
  // imported by another script (e.g. the browser harness): run nothing
} else {
if (which === "all" || which === "data") testData();
if (which === "all" || which === "house") testHouse();
if (which === "all" || which === "scavenge") testScavenge();
if (which === "all" || which === "shelter") testShelter();
if (which === "all" || which === "endings") testEndings();
if (which === "all" || which === "save") testSave();
console.log(`\n${checks - fails}/${checks} checks passed in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fails ? 1 : 0);
}
