/**
 * Headless engine tests — node src/components/games/UltimateMMA3D/tools/simTest.mjs [suite…]
 * suites: core (default+) · grapple · rules · ai · fuzz · career · save · all
 */
import { Match, blankButtons } from "../engine/match.js";
import { createAI } from "../engine/ai.js";
import { MOVES } from "../engine/moves.js";
import { OCT_APOTHEM, BODY_R, MIN_SEP, SIM_DT } from "../engine/constants.js";
import { hurtVolumes, resolveHit } from "../engine/combat.js";
import { staMax } from "../engine/fighter.js";
import { scoreRound, decide } from "../engine/scoring.js";
import { FIGHTERS, FIGHTER_BY_ID } from "../data/fighters.js";
import * as GR from "../engine/grapple.js";

let pass = 0;
let fail = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) pass++;
  else {
    fail++;
    fails.push(`${name} ${extra}`);
    console.log("  ✗", name, extra);
  }
}
const section = (n) => console.log(`\n— ${n}`);

function mk(a = "petrosyan", b = "vale", cfg = {}) {
  const m = new Match({ fighters: [{ data: FIGHTER_BY_ID[a] }, { data: FIGHTER_BY_ID[b] }], seed: cfg.seed ?? 7, rounds: 3, roundTime: 120, restTime: 0.2, ...cfg });
  m.begin();
  for (let i = 0; i < 120; i++) m.step();
  return m;
}
/** Step with fixed buttons for both sides (functions get the match). */
function run(m, frames, b0 = null, b1 = null) {
  for (let i = 0; i < frames; i++) {
    m.setButtons(0, { ...blankButtons(), ...(typeof b0 === "function" ? b0(m, i) : b0 || {}) });
    m.setButtons(1, { ...blankButtons(), ...(typeof b1 === "function" ? b1(m, i) : b1 || {}) });
    m.step(SIM_DT);
  }
}
const place = (m, d) => {
  m.f[0].pos = { x: -d / 2, z: 0 };
  m.f[1].pos = { x: d / 2, z: 0 };
  m.f[0].yaw = Math.PI / 2;
  m.f[1].yaw = -Math.PI / 2;
  for (const f of m.f) {
    f.vel = { x: 0, z: 0 };
    f.act = { type: "idle", t: 0 };
  }
};
const D = (m) => Math.hypot(m.f[0].pos.x - m.f[1].pos.x, m.f[0].pos.z - m.f[1].pos.z);
const hits = (m, type = "hit") => m.events.filter((e) => e.type === type);

/* ================================================================== core */
function core() {
  section("fighters");
  ok(FIGHTERS.length === 12, "12 fighters");
  const styles = {};
  for (const f of FIGHTERS) {
    styles[f.style] = (styles[f.style] || 0) + 1;
    ok(Object.values(f.attrs).every((v) => v >= 40 && v <= 99), `attrs in range ${f.id}`);
    ok(f.combos.length >= 2 && f.look && f.ai && f.nation && f.height && f.weight && f.reach, `fields ${f.id}`);
  }
  ok(Object.keys(styles).length === 6 && Object.values(styles).every((n) => n === 2), "6 styles × 2", JSON.stringify(styles));
  ok(new Set(FIGHTERS.map((f) => f.name)).size === 12, "unique names");

  section("movement & boundaries");
  let m = mk();
  place(m, 3);
  const x0 = m.f[0].pos.x;
  run(m, 60, { mz: 1 });
  const sp = (m.f[0].pos.x - x0) / 1;
  ok(sp > 0.9 && sp < 2.0, "forward speed m/s", sp.toFixed(2));
  m = mk();
  place(m, 3);
  m.f[0].hp.legs = 10;
  run(m, 60, { mz: 1 });
  ok(m.f[0].pos.x - -1.5 < sp * 0.8, "leg damage slows movement");
  m = mk();
  place(m, 3);
  run(m, 600, { mz: -1, mx: 0.6 });
  const r = (f) => Math.max(...Array.from({ length: 8 }, (_, i) => f.pos.x * Math.cos((i / 8) * Math.PI * 2 + Math.PI / 8) + f.pos.z * Math.sin((i / 8) * Math.PI * 2 + Math.PI / 8)));
  ok(r(m.f[0]) <= OCT_APOTHEM - BODY_R + 1e-3, "stays inside the octagon", r(m.f[0]).toFixed(3));
  ok(m.f[0].pressedCage, "pressed against the cage flag");
  m = mk();
  place(m, 2);
  let minD = 9;
  run(m, 240, (mm) => (minD = Math.min(minD, D(mm)), { mz: 1 }), { mz: 1 });
  ok(minD >= MIN_SEP - 0.02, "fighters never overlap", minD.toFixed(3));

  section("strikes & hit detection");
  m = mk();
  place(m, 0.95);
  const h0 = m.f[1].hp.head;
  let preHit = false;
  run(m, 1, { attack: "jab" });
  for (let i = 0; i < 5; i++) {
    run(m, 1);
    if (m.f[1].hp.head < h0) preHit = true;
  }
  ok(!preHit, "no damage during startup");
  run(m, 20);
  ok(m.f[1].hp.head < h0, "jab in range lands", (h0 - m.f[1].hp.head).toFixed(2));
  m = mk();
  place(m, 1.9);
  run(m, 1, { attack: "jab" });
  run(m, 30);
  ok(hits(m).length === 0, "jab out of range misses");
  m = mk();
  place(m, 0.95);
  m.f[0].yaw = -Math.PI / 2; // facing away
  run(m, 1, { attack: "cross" });
  run(m, 40);
  ok(hits(m).length === 0, "facing away misses");
  for (const id of ["jab", "cross", "hookL", "hookR", "uppercut", "bodyJab", "bodyCross", "bodyHook", "kickLow", "kickBody", "kickHead", "kickFront"]) {
    m = mk();
    const mv = MOVES[id];
    place(m, Math.max(0.75, mv.path[1][2] * m.f[0].reachK + 0.05));
    run(m, 1, { attack: id });
    run(m, 60);
    const e = hits(m)[0];
    ok(e && e.move === id && e.zone === mv.zone, `${id} lands on ${mv.zone}`, e ? `${e.move} ${e.zone}` : "no hit");
    const sw = m.events.find((x) => x.type === "swing");
    ok(sw && e.t - sw.t >= mv.startup * 0.8, `${id} hit after startup`, e ? (e.t - sw.t).toFixed(3) : "");
  }

  section("defence");
  m = mk();
  place(m, 0.95);
  run(m, 20, null, { guard: true });
  let hh = m.f[1].hp.head;
  run(m, 1, { attack: "cross" }, { guard: true });
  run(m, 40, null, { guard: true });
  const blk = hits(m, "block")[0];
  ok(blk && hh - m.f[1].hp.head < 0.6, "high guard blocks a cross", blk ? (hh - m.f[1].hp.head).toFixed(2) : "no block");
  m = mk();
  place(m, 0.92);
  run(m, 20, null, { guard: true });
  const bb = m.f[1].hp.body;
  run(m, 1, { attack: "bodyCross" }, { guard: true });
  run(m, 40, null, { guard: true });
  ok(m.f[1].hp.body < bb - 0.8 && hits(m).length === 1, "high guard leaves the body open");
  m = mk();
  place(m, 0.92);
  run(m, 20, null, { guard: true, low: true });
  const bb2 = m.f[1].hp.body;
  run(m, 1, { attack: "bodyCross" }, { guard: true, low: true });
  run(m, 40, null, { guard: true, low: true });
  ok(bb2 - m.f[1].hp.body < 0.8, "body guard blocks body shots");
  m = mk();
  place(m, 0.95);
  run(m, 1, { attack: "jab" }, { dodge: "right" });
  run(m, 40);
  ok(hits(m).length === 0 && m.events.some((e) => e.type === "evade"), "slip right evades the jab → counter window");
  m = mk();
  place(m, 0.95);
  run(m, 1, { attack: "hookL" }, { dodge: "duck" });
  run(m, 40);
  ok(hits(m).length === 0, "duck evades the hook");
  m = mk();
  place(m, 1.3);
  run(m, 1, { attack: "kickHead" }, { dodge: "back" });
  run(m, 60);
  ok(hits(m).length === 0, "backstep evades the head kick");
  // counter after evade
  m = mk();
  place(m, 0.95);
  run(m, 1, { attack: "jab" }, { dodge: "right" });
  run(m, 16);
  run(m, 1, null, { attack: "cross" });
  run(m, 40);
  const ce = hits(m)[0];
  ok(ce && ce.counter, "dodge → counter strike flagged as counter");

  section("stamina, fatigue, damage zones");
  m = mk();
  place(m, 3);
  const s0 = m.f[0].sta;
  run(m, 1, { attack: "kickHead" });
  run(m, 3);
  ok(m.f[0].sta < s0 - 10, "kick costs stamina");
  run(m, 300);
  ok(m.f[0].sta > s0 - 3, "stamina recovers when idle");
  m = mk();
  m.f[0].hp.body = 20;
  ok(staMax(m.f[0]) < m.f[0].staMaxBase * 0.8, "body damage lowers max stamina");
  const dmgAt = (sta) => {
    const mm = mk("petrosyan", "vale", { seed: 3 });
    place(mm, 0.95);
    mm.f[0].sta = sta;
    const h = mm.f[1].hp.head;
    run(mm, 1, { attack: "cross" });
    run(mm, 40);
    return h - mm.f[1].hp.head;
  };
  ok(dmgAt(2) < dmgAt(100) * 0.9, "low stamina weakens strikes", `${dmgAt(2).toFixed(2)} vs ${dmgAt(100).toFixed(2)}`);

  section("combos");
  m = mk();
  place(m, 0.92);
  run(m, 1, { btn: "jab" });
  run(m, 14, { btn: "cross" });
  run(m, 50);
  ok(m.events.some((e) => e.type === "combo" && e.id === "1-2"), "jab → cross recognised as One-Two");
  m = mk();
  place(m, 0.92);
  run(m, 1, { btn: "jab" });
  run(m, 14, { btn: "cross" });
  run(m, 18, { btn: "hookL" });
  run(m, 50);
  ok(m.events.some((e) => e.type === "combo" && e.id === "1-2-3"), "jab → cross → hook recognised");
  ok(hits(m).length >= 2, "combo strikes land", String(hits(m).length));

  section("knockdown / knockout");
  m = mk("vale", "takeda", { seed: 11 });
  let kd = false;
  for (let i = 0; i < 40 && !kd; i++) {
    place(m, 0.92);
    run(m, 1, { attack: i % 2 ? "cross" : "hookR" });
    run(m, 40);
    kd = m.events.some((e) => e.type === "knockdown") || !!m.result;
  }
  ok(kd, "repeated power shots knock down");
  if (m.f[1].act.type === "down") {
    run(m, 60 * 8);
    ok(m.f[1].act.type === "idle" || m.f[1].act.type === "move" || !!m.result, "downed fighter gets back up", m.f[1].act.type);
  }
  m = mk();
  place(m, 0.95);
  m.f[1].hp.head = 1;
  m.f[1].daze = 90;
  run(m, 1, { attack: "cross" });
  run(m, 60);
  ok(m.result && (m.result.method === "KO" || m.result.method === "TKO") && m.result.winner === 0, "KO ends the fight", JSON.stringify(m.result?.method));
  run(m, 60 * 5);
  ok(m.phase === "ended", "phase ends after a finish", m.phase);
}

/* ================================================================== grapple */
function grapple() {
  section("clinch");
  let m;
  let got = false;
  for (let s = 1; s < 10 && !got; s++) {
    m = mk("volkov", "vale", { seed: s });
    place(m, 0.8);
    run(m, 1, { btn: "grab" });
    run(m, 30);
    got = !!m.clinch;
  }
  ok(got, "E at close range → clinch");
  run(m, 1, { attack: "knee" });
  run(m, 50);
  ok(hits(m).some((e) => e.move === "knee"), "clinch knee lands");
  ok(!!m.clinch, "still in clinch after a knee");
  let broken = 0;
  for (let s = 1; s <= 10; s++) {
    const mm = mk("volkov", "vale", { seed: s });
    place(mm, 0.6);
    GR.enterClinch(mm, mm.f[0], mm.f[1]);
    for (let i = 0; i < 12 && mm.clinch; i++) {
      run(mm, 1, null, { dodge: "back" });
      run(mm, 40);
    }
    if (!mm.clinch) broken++;
  }
  ok(broken >= 7, "clinch can be broken (even vs a dominant wrestler)", `${broken}/10`);
  m = mk("volkov", "vale", { seed: 2 });
  place(m, 0.8);
  GR.enterClinch(m, m.f[0], m.f[1]);
  run(m, 60 * 11);
  ok(!m.clinch && m.events.some((e) => e.type === "ref" && e.text === "BREAK!"), "referee breaks a clinch stalemate");

  section("takedowns");
  let td = 0;
  let stuffed = 0;
  for (let s = 1; s <= 20; s++) {
    m = mk("volkov", "takeda", { seed: s });
    place(m, 1.5);
    run(m, 1, { btn: "grab" });
    run(m, 90);
    if (m.ground) td++;
  }
  ok(td >= 12, "elite wrestler shot vs striker usually lands", `${td}/20`);
  for (let s = 1; s <= 20; s++) {
    m = mk("volkov", "takeda", { seed: s });
    place(m, 1.5);
    run(m, 1, { btn: "grab" });
    run(m, 8);
    run(m, 1, null, { dodge: "back" });
    run(m, 90);
    if (!m.ground && m.events.some((e) => e.type === "tdStuffed")) stuffed++;
  }
  ok(stuffed >= 18, "sprawl stuffs the shot", `${stuffed}/20`);
  m = mk("volkov", "takeda", { seed: 5 });
  place(m, 3.2);
  run(m, 1, { btn: "grab" });
  run(m, 60);
  ok(!m.ground && m.f[0].act.type !== "shoot", "shot from too far doesn't start / misses");

  section("ground positions");
  m = mk("volkov", "takeda", { seed: 3 });
  GR.enterGround(m, m.f[0], m.f[1], "guard", { x: 0, z: 0 }, 0);
  const seen = new Set(["guard"]);
  for (let i = 0; i < 80 && m.ground && m.ground.pos !== "back"; i++) {
    run(m, 1, { btn: "grapple" });
    run(m, 45);
    if (m.ground) seen.add(m.ground.pos);
  }
  ok(["guard", "half", "side", "mount", "back"].every((p) => seen.has(p)), "top advances guard → half → side → mount → back", [...seen].join(","));
  const gh = m.f[1].hp.head;
  run(m, 1, { btn: "jab" });
  run(m, 50);
  ok(m.f[1].hp.head < gh, "ground strike lands");
  m = mk("petrosyan", "volkov", { seed: 4 });
  GR.enterGround(m, m.f[1], m.f[0], "mount", { x: 0, z: 0 }, 0);
  let esc = false;
  for (let i = 0; i < 40 && !esc; i++) {
    run(m, 1, { btn: "grapple" });
    run(m, 45);
    esc = m.ground && m.ground.pos !== "mount";
  }
  ok(esc, "bottom fighter escapes mount → half guard", m.ground?.pos);
  m = mk("takeda", "volkov", { seed: 5 });
  GR.enterGround(m, m.f[1], m.f[0], "guard", { x: 0, z: 0 }, 0);
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    run(m, 1, { dodge: "back" });
    run(m, 60);
    up = !m.ground;
  }
  ok(up, "bottom fighter can stand up from guard");
  m = mk("takeda", "volkov", { seed: 6 });
  GR.enterGround(m, m.f[1], m.f[0], "side", { x: 0, z: 0 }, 0);
  run(m, 60 * 16);
  ok(!m.ground && m.events.some((e) => e.text === "STAND UP!"), "referee stands up an inactive ground fight");
  // anchor near the fence is pulled inside
  m = mk();
  GR.enterGround(m, m.f[0], m.f[1], "guard", { x: 4.4, z: 0 }, 0);
  ok(Math.hypot(m.f[0].pos.x, m.f[0].pos.z) < OCT_APOTHEM && Math.hypot(m.f[1].pos.x, m.f[1].pos.z) < OCT_APOTHEM, "ground pair kept inside the cage");

  section("submissions");
  const subRun = (attTaps, defTaps, type = "armbar", seed = 1, pair = ["moraes", "vale"]) => {
    const mm = mk(pair[0], pair[1], { seed });
    GR.enterGround(mm, mm.f[1], mm.f[0], "guard", { x: 0, z: 0 }, 0);
    GR.startSub(mm, mm.f[0], mm.f[1], type);
    for (let i = 0; i < 60 * 14 && mm.sub; i++) {
      const s = mm.sub;
      const zone = (side) => Math.abs(s.marker - s.zones[side].c) <= s.zones[side].w / 2;
      run(mm, 1, attTaps && i % 6 === 0 && (attTaps === "mash" || zone(0)) ? { struggle: true } : null, defTaps && i % 6 === 0 && (defTaps === "mash" || zone(1)) ? { struggle: true } : null);
    }
    return mm;
  };
  m = subRun("timed", null);
  ok(m.result?.method === "SUB" && m.result.winner === 0, "timed taps vs passive defender → tap out");
  m = subRun(null, "timed");
  ok(!m.result && !m.sub && m.events.some((e) => e.type === "subEscape"), "defender escapes a passive attacker");
  m = subRun(null, null);
  ok(!m.sub && !m.result, "submission times out (no softlock)");
  ok(m.ground && m.ground.top === 1, "after an escape the defender is on top in guard", JSON.stringify(m.ground && { top: m.ground.top, pos: m.ground.pos }));
  let tw = 0;
  let ew = 0;
  for (let s = 1; s <= 20; s++) {
    const mm = subRun("timed", "timed", "rnc", s, ["petrosyan", "petrosyan"]);
    if (mm.result) tw++;
    else ew++;
  }
  ok(tw > 0 && ew > 0, "evenly timed struggle can go either way", `${tw} taps / ${ew} escapes`);
  {
    // training: a tap-out resets to guard instead of ending the session
    const mm = new Match({ fighters: [{ data: FIGHTER_BY_ID.moraes }, { data: FIGHTER_BY_ID.vale }], seed: 2, rounds: 1, roundTime: Infinity, training: true });
    mm.begin();
    mm.setPhase("fight");
    GR.enterGround(mm, mm.f[1], mm.f[0], "guard", { x: 0, z: 0 }, 0);
    GR.startSub(mm, mm.f[0], mm.f[1], "armbar");
    for (let i = 0; i < 60 * 14 && mm.sub; i++) {
      const s = mm.sub;
      run(mm, 1, i % 6 === 0 && Math.abs(s.marker - s.zones[0].c) <= s.zones[0].w / 2 ? { struggle: true } : null);
    }
    ok(!mm.result && !mm.sub && mm.ground && mm.events.some((e) => e.type === "tap" && e.training), "training tap-out resets instead of ending");
  }
  for (const t of ["armbar", "guillotine", "rnc"]) {
    const mm = subRun("timed", null, t);
    ok(mm.result?.detail && mm.result.method === "SUB", `${t} can finish`, mm.result?.detail);
  }
}

/* ================================================================== rules */
function rules() {
  section("rounds & timer");
  const m = new Match({ fighters: [{ data: FIGHTERS[0] }, { data: FIGHTERS[1] }], seed: 1, rounds: 3, roundTime: 20, restTime: 0.5 });
  m.begin();
  const phases = [];
  for (let i = 0; i < 60 * 120 && m.phase !== "ended"; i++) {
    m.step();
    if (phases[phases.length - 1] !== m.phase) phases.push(m.phase);
  }
  ok(m.phase === "ended" && m.round === 3, "3 rounds then decision", `${m.phase} r${m.round}`);
  ok(phases.filter((p) => p === "rest").length === 2, "two rest periods", phases.join(">"));
  ok(m.cards.length === 3 && m.result.method === "DRAW", "idle fight is scored (draw)", m.result?.detail);
  ok(m.events.filter((e) => e.type === "bell").length >= 6, "bells at start/end of rounds");
  const m5 = new Match({ fighters: [{ data: FIGHTERS[0] }, { data: FIGHTERS[1] }], seed: 1, rounds: 5, roundTime: 5, restTime: 0.1 });
  m5.begin();
  for (let i = 0; i < 60 * 80 && m5.phase !== "ended"; i++) m5.step();
  ok(m5.cards.length === 5, "championship: 5 rounds");

  section("judging");
  const z = { landedSig: 0, thrownSig: 0, dmg: 0, headDmg: 0, td: 0, tdAtt: 0, ctrl: 0, kd: 0, subAtt: 0, subProg: 0, advance: 0, aggr: 0 };
  const win = { ...z, landedSig: 20, dmg: 60, headDmg: 30 };
  const lose = { ...z, landedSig: 12, dmg: 35, headDmg: 15 };
  let c = scoreRound([win, lose]);
  ok(c.judges.every((j) => j[0] === 10 && j[1] === 9), "clear striking round 10-9");
  c = scoreRound([{ ...win, kd: 2, dmg: 90 }, lose]);
  ok(c.judges.every((j) => j[1] === 8), "dominant round with knockdowns 10-8");
  c = scoreRound([z, z]);
  ok(c.judges.every((j) => j[0] === 10 && j[1] === 10), "nothing happens → 10-10");
  c = scoreRound([{ ...z, td: 3, ctrl: 90, advance: 3 }, { ...z, landedSig: 4, dmg: 8 }]);
  ok(c.judges.every((j) => j[0] === 10), "grappling control wins the round");
  const d = decide([{ judges: [[10, 9], [10, 9], [9, 10]] }, { judges: [[10, 9], [9, 10], [9, 10]] }, { judges: [[10, 9], [10, 9], [10, 9]] }]);
  ok(d.winner === 0 && d.label === "Split Decision", "split decision", d.label);
  ok(decide([{ judges: [[10, 9], [10, 9], [10, 9]] }]).label === "Unanimous Decision", "unanimous");
  ok(decide([{ judges: [[10, 9], [10, 10], [10, 9]] }]).label === "Majority Decision", "majority");
}

/* ================================================================== ai */
function playFight(a, b, la, lb, seed, rounds = 3, roundTime = 120) {
  const m = new Match({ fighters: [{ data: FIGHTER_BY_ID[a] }, { data: FIGHTER_BY_ID[b] }], seed, rounds, roundTime, restTime: 0.1 });
  const ais = [createAI(m, 0, la), createAI(m, 1, lb)];
  m.begin();
  for (let i = 0; i < 60 * 60 * 12 && m.phase !== "ended"; i++) {
    for (const x of ais) x.update(SIM_DT);
    m.step(SIM_DT);
  }
  return m;
}
function ai() {
  section("difficulty ladder (same fighters, mirrored corners)");
  const ladder = (hi, lo, n) => {
    let w = 0;
    let games = 0;
    for (let i = 0; i < n; i++) {
      const id = FIGHTERS[i % 12].id;
      const swap = i % 2 === 1;
      const m = swap ? playFight(id, id, lo, hi, 500 + i, 3, 90) : playFight(id, id, hi, lo, 500 + i, 3, 90);
      const hiSide = swap ? 1 : 0;
      if (m.result.winner === hiSide) w++;
      if (m.result.winner >= 0) games++;
    }
    return [w, games];
  };
  let [w, g] = ladder("champion", "easy", 16);
  ok(w / g >= 0.8, "champion beats easy", `${w}/${g}`);
  [w, g] = ladder("hard", "normal", 16);
  ok(w / g >= 0.6, "hard beats normal", `${w}/${g}`);
  [w, g] = ladder("normal", "easy", 16);
  ok(w / g >= 0.6, "normal beats easy", `${w}/${g}`);

  section("AI uses the whole game");
  const ev = {};
  for (let i = 0; i < 12; i++) {
    const m = playFight(FIGHTERS[i].id, FIGHTERS[(i + 5) % 12].id, "hard", "hard", 900 + i);
    for (const e of m.events) ev[e.type] = (ev[e.type] || 0) + 1;
  }
  for (const t of ["block", "dodge", "evade", "combo", "tdTry", "takedown", "sprawl", "clinch", "ground", "gnp", "position", "sub", "standup", "knockdown"]) ok((ev[t] || 0) > 0, `AI produces ${t}`, String(ev[t] || 0));

  section("styles differ");
  const prof = (id) => {
    const acc = { td: 0, kicks: 0, swings: 0, subs: 0 };
    for (let i = 0; i < 6; i++) {
      const m = playFight(id, "petrosyan", "hard", "hard", 1200 + i);
      for (const e of m.events) {
        if (e.side !== 0) continue;
        if (e.type === "tdTry") acc.td++;
        if (e.type === "swing") {
          acc.swings++;
          if (MOVES[e.move]?.kind === "kick") acc.kicks++;
        }
        if (e.type === "sub") acc.subs++;
      }
    }
    return acc;
  };
  const wr = prof("volkov");
  const bx = prof("vale");
  const kb = prof("takeda");
  const bj = prof("moraes");
  ok(wr.td > bx.td * 2, "wrestler shoots far more than the boxer", `${wr.td} vs ${bx.td}`);
  ok(kb.kicks / kb.swings > (bx.kicks / bx.swings) * 2.5, "kickboxer kicks far more than the boxer", `${(kb.kicks / kb.swings).toFixed(2)} vs ${(bx.kicks / bx.swings).toFixed(2)}`);
  ok(bj.subs >= wr.subs, "BJJ hunts submissions", `${bj.subs} vs ${wr.subs}`);

  section("adaptation to a jab-spamming player");
  const m = new Match({ fighters: [{ data: FIGHTER_BY_ID.vale }, { data: FIGHTER_BY_ID.petrosyan }], seed: 77, rounds: 3, roundTime: 90, restTime: 0.1 });
  const bot = createAI(m, 1, "champion");
  m.begin();
  const stat = [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  let thrownKey = null;
  for (let i = 0; i < 60 * 60 * 6 && m.phase !== "ended"; i++) {
    bot.update(SIM_DT);
    const me = m.f[0];
    const d = D(m);
    // scripted "player": walk to jab range and jab whenever possible
    m.setButtons(0, { ...blankButtons(), mz: d > 0.95 ? 1 : 0, attack: me.act.type === "idle" || me.act.type === "move" ? "jab" : null });
    m.step(SIM_DT);
    if (me.act.type === "attack" && me.act.move === "jab") {
      const k = `${me.act.t.toFixed(3)}`;
      thrownKey = k;
    }
  }
  for (const e of m.events) {
    const r = Math.min(2, Math.floor(e.t / 92));
    if (e.by === 0 && e.move === "jab" && e.type === "hit") stat[r][0]++;
    if (e.by === 0 && e.move === "jab" && e.type === "block") stat[r][1]++;
  }
  const rate = (s) => s[0] / Math.max(1, s[0] + s[1]);
  ok(stat[0][0] + stat[0][1] > 5, "spam reached the AI");
  ok(m.events.some((e) => e.type === "evade" && e.side === 1) || stat[2][1] > stat[0][1], "AI starts reading the jab", JSON.stringify(stat));
}

/* ================================================================== fuzz */
function fuzz() {
  section("random-input fuzz (softlocks, NaNs, cage)");
  const btns = ["jab", "cross", "hookL", "hookR", "upper", "kick", "teep", "grab", "grapple", null, null, null];
  const dodges = ["left", "right", "duck", "back"];
  let bad = 0;
  let maxStuck = 0;
  for (let s = 0; s < 24; s++) {
    const m = new Match({ fighters: [{ data: FIGHTERS[s % 12] }, { data: FIGHTERS[(s + 7) % 12] }], seed: 3000 + s, rounds: 3, roundTime: 60, restTime: 0.1 });
    const ai1 = createAI(m, 1, ["easy", "normal", "hard", "champion"][s % 4]);
    m.begin();
    const rng = m.rng;
    let last = ["", ""];
    let since = [0, 0];
    for (let i = 0; i < 60 * 60 * 6 && m.phase !== "ended"; i++) {
      ai1.update(SIM_DT);
      m.setButtons(0, { ...blankButtons(), mx: rng.range(-1, 1), mz: rng.range(-1, 1), guard: rng.chance(0.2), low: rng.chance(0.3), fwd: rng.chance(0.3), dodge: rng.chance(0.03) ? rng.pick(dodges) : null, btn: rng.chance(0.15) ? rng.pick(btns) : null, struggle: rng.chance(0.2) });
      m.step(SIM_DT);
      for (const f of m.f) {
        if (!Number.isFinite(f.pos.x + f.pos.z + f.yaw + f.sta + f.hp.head)) bad++;
        const k = f.act.type + (m.ground ? "g" : "") + (m.clinch ? "c" : "") + (m.sub ? "s" : "");
        if (k === last[f.side] && !["idle", "move", "block", "ground", "clinch", "sub", "ko", "tapped", "subWin"].includes(f.act.type)) since[f.side] += SIM_DT;
        else since[f.side] = 0;
        last[f.side] = k;
        maxStuck = Math.max(maxStuck, since[f.side]);
        const ap = Math.max(...Array.from({ length: 8 }, (_, j) => f.pos.x * Math.cos((j / 8) * Math.PI * 2 + Math.PI / 8) + f.pos.z * Math.sin((j / 8) * Math.PI * 2 + Math.PI / 8)));
        if (ap > OCT_APOTHEM + 0.05) bad++;
      }
    }
    ok(m.phase === "ended", `fuzz fight ${s} finishes`, m.phase);
  }
  ok(bad === 0, "no NaN / out-of-cage frames", String(bad));
  ok(maxStuck < 6, "no action lasts > 6 s", maxStuck.toFixed(2));
}

/* ================================================================== main */
const want = process.argv.slice(2);
const suites = { core, grapple, rules, ai, fuzz };
const extra = {};
try {
  const c = await import("./careerTest.mjs");
  Object.assign(extra, c.suites || {});
} catch {
  /* career tests optional until written */
}
Object.assign(suites, extra);
const list = !want.length || want.includes("all") ? Object.keys(suites) : want;
const t0 = Date.now();
for (const s of list) await suites[s]?.({ ok, section });
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (fail) {
  console.log(fails.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
