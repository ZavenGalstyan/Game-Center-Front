/**
 * Arena Gladiator — headless engine tests. From this folder:
 *   node tools/simTest.mjs [basic|parry|dodge|weapons|framerate|torture|fairness|balance|all]
 *
 * Drives the REAL engine (engine/fight.js + engine/ai.js) with scripted
 * controllers that produce the same intents the keyboard does.
 */
import { createFight, step, advance, drainEvents, STAT_KEYS } from "../engine/fight.js";
import { createAI } from "../engine/ai.js";
import { createRng } from "../engine/math.js";
import { SIM_DT, FIGHTER_GAP, BODY } from "../engine/constants.js";
import { ENEMIES } from "../data/enemies.js";
import { WEAPONS } from "../data/weapons.js";

const which = process.argv[2] || "all";
let failures = 0;
let passes = 0;
const ok = (cond, msg) => {
  if (cond) passes++;
  else {
    failures++;
    console.log("  ✗ FAIL:", msg);
  }
};
const section = (s) => console.log(`\n== ${s}`);

const ARENA = { radius: 8.6, pillars: [] };
const NEUTRAL = { mx: 0, mz: 0, yaw: null, sprint: false, block: false, light: false, heavy: false, dodge: false, kick: false };

/** script: (t, fight, f) → partial intent */
const scripted = (script) => (fight, f) => ({ ...NEUTRAL, ...(script(fight.time, fight, f) || {}) });
/** press helper: true exactly on the first step at/after time `at` */
function press(at) {
  let done = false;
  return (t) => {
    if (!done && t >= at) {
      done = true;
      return true;
    }
    return false;
  };
}

function duel({ dist = 1.5, pw = "sword_shield", ow = "sword_shield", p = () => ({}), o = () => ({}), oYaw = Math.PI, oArmor = "balanced", oHp = 100 }) {
  const fight = createFight({
    player: { weapon: pw, armor: "balanced", hp: 100 },
    enemy: { weapon: ow, armor: oArmor, hp: oHp },
    arena: ARENA,
    introDur: 0,
    controllers: { p: scripted(p), o: scripted(o) },
  });
  fight.P.z = -dist / 2;
  fight.O.z = dist / 2;
  fight.O.yaw = oYaw;
  return fight;
}

function run(fight, sec, onEvent) {
  const all = [];
  const n = Math.round(sec / SIM_DT);
  for (let i = 0; i < n; i++) {
    step(fight, SIM_DT);
    for (const e of drainEvents(fight)) {
      all.push(e);
      onEvent && onEvent(e, fight);
    }
  }
  return all;
}
const count = (ev, type, extra = () => true) => ev.filter((e) => e.type === type && extra(e)).length;

/* ======================================================================== basic */
function basic() {
  section("light attack range / single hit / timing");
  {
    const lp = press(0.2);
    const f = duel({ dist: 3.2, p: (t) => ({ light: lp(t) }) });
    const ev = run(f, 1.5);
    ok(count(ev, "hit") === 0, "light attack from 3.2 m must not hit");
    ok(f.O.hp === 100, "enemy HP unchanged out of range");
    ok(count(ev, "whiff") === 1, "out-of-range swing reports one whiff");
  }
  let impact = 0;
  {
    const lp = press(0.2);
    let start = 0;
    const f = duel({ dist: 1.5, p: (t) => ({ light: lp(t) }) });
    const ev = run(f, 1.5, (e) => {
      if (e.type === "attackStart") start = e.t;
      if (e.type === "hit") impact = e.t;
    });
    const hits = count(ev, "hit");
    ok(hits === 1, `light attack in range hits exactly once (got ${hits})`);
    const atk = WEAPONS[0].light[0];
    const rel = impact - start;
    ok(rel >= atk.startup - 1e-6 && rel <= atk.startup + atk.active + SIM_DT + 1e-6, `hit lands inside ACTIVE window (at +${rel.toFixed(3)}s, active ${atk.startup}–${(atk.startup + atk.active).toFixed(2)})`);
    ok(f.O.hp === 100 - Math.round(atk.damage * (1 - 0.1)), `damage applied once (${100 - f.O.hp})`);
    console.log(`  light slash impact at +${rel.toFixed(3)}s after press`);
  }
  {
    // stamina: heavy costs more than light
    const f1 = duel({ dist: 3.5, p: (t) => ({ light: t > 0.1 && t < 0.12 }) });
    run(f1, 0.3);
    const f2 = duel({ dist: 3.5, p: (t) => ({ heavy: t > 0.1 && t < 0.12 }) });
    run(f2, 0.3);
    ok(100 - f2.P.stamina > 100 - f1.P.stamina, `heavy costs more stamina (${(100 - f2.P.stamina).toFixed(0)} vs ${(100 - f1.P.stamina).toFixed(0)})`);
  }
  {
    // heavy hits and does more damage
    const hp = press(0.2);
    const f = duel({ dist: 1.6, p: (t) => ({ heavy: hp(t) }) });
    const ev = run(f, 2);
    ok(count(ev, "hit") === 1, "heavy attack hits once");
    ok(100 - f.O.hp >= 17, `heavy damage ${100 - f.O.hp}`);
  }
  {
    // mash: 30 presses over 3 s against a statue — no swing hits twice
    const f = duel({ dist: 1.5, p: (t) => ({ light: Math.floor(t * 10) % 1 === 0 && Math.round(t * 120) % 12 === 0 }), oHp: 5000 });
    const perSeq = new Map();
    const ev = run(f, 3, (e, fg) => {
      if (e.type === "hit" && e.by === "p") {
        const seq = fg.P.act?.seq;
        perSeq.set(seq, (perSeq.get(seq) || 0) + 1);
      }
    });
    ok([...perSeq.values()].every((v) => v === 1), "no swing damages the same target twice");
    ok(f.P.stamina >= 0, "stamina never negative under mashing");
    console.log(`  mashing 3s: ${count(ev, "attackStart")} swings, ${count(ev, "hit")} hits, stamina ${f.P.stamina.toFixed(1)}`);
  }
  section("block");
  {
    const lp = press(0.6);
    const f = duel({ dist: 1.5, p: (t) => ({ light: lp(t) }), o: () => ({ block: true }) });
    const ev = run(f, 1.5);
    ok(count(ev, "block") === 1 && count(ev, "parry") === 0, "held guard blocks a front attack (not a parry)");
    ok(f.O.hp === 100, "blocked attack deals no damage");
    ok(f.O.stamina < 100, "blocking costs stamina");
  }
  {
    const lp = press(0.6);
    const f = duel({ dist: 1.5, oYaw: 0, p: (t) => ({ light: lp(t) }), o: () => ({ block: true }) });
    const ev = run(f, 1.5);
    ok(count(ev, "hit") === 1, "attack from behind bypasses a raised shield");
    ok(ev.find((e) => e.type === "hit")?.flank === true, "rear hit flagged as flank");
  }
  {
    // guard break: heavy into a guard with low stamina
    const hp = press(0.6);
    const f = duel({ dist: 1.5, p: (t) => ({ heavy: hp(t) }), o: (t, fg, me) => {
      me.stamina = Math.min(me.stamina, 10); // keep the defender drained
      return { block: true };
    } });
    const ev = run(f, 2);
    ok(count(ev, "guardBreak") === 1, "heavy vs exhausted guard breaks it");
    ok(f.O.act == null || f.O.act.type !== "stagger" || f.O.act.dur < 1, "guard break stagger is short");
  }
  {
    const kp = press(0.6);
    const f = duel({ dist: 1.2, p: (t) => ({ kick: kp(t) }), o: () => ({ block: true }) });
    const ev = run(f, 1.5);
    ok(count(ev, "guardBreak") === 1, "kick breaks a raised guard");
  }
  return impact;
}

/* ======================================================================== parry */
function parry() {
  section("parry timing");
  // measure impact time against an unguarded target
  const lp0 = press(0.5);
  let impact = 0;
  run(duel({ dist: 1.5, p: (t) => ({ light: lp0(t) }) }), 1.5, (e) => {
    if (e.type === "hit") impact = e.t;
  });
  const cases = [
    { name: "early (0.4s before)", at: impact - 0.4, expect: "block" },
    { name: "window (0.15s before)", at: impact - 0.15, expect: "parry" },
    { name: "window (0.05s before)", at: impact - 0.05, expect: "parry" },
    { name: "late (after impact)", at: impact + 0.02, expect: "hit" },
  ];
  for (const c of cases) {
    const lp = press(0.5);
    const f = duel({ dist: 1.5, p: (t) => ({ light: lp(t) }), o: (t) => ({ block: t >= c.at && t < c.at + 0.6 }) });
    const ev = run(f, 1.5);
    const got = count(ev, "parry") ? "parry" : count(ev, "block") ? "block" : count(ev, "hit") ? "hit" : "none";
    ok(got === c.expect, `parry ${c.name}: expected ${c.expect}, got ${got}`);
  }
  {
    // guard tapping: released only 0.2 s before re-raising → not re-armed → plain block
    const lp = press(0.5);
    const f = duel({
      dist: 1.5,
      p: (t) => ({ light: lp(t) }),
      o: (t) => ({ block: (t >= 0.1 && t < impact - 0.3) || (t >= impact - 0.1 && t < impact + 0.5) }),
    });
    const ev = run(f, 1.5);
    ok(count(ev, "parry") === 0 && count(ev, "block") === 1, "guard-tap spam can't parry (re-arm needed)");
  }
  {
    // after a parry, the attacker is open and the parrier's heavy is a faster counter
    const lp = press(0.5);
    const hp = press(impact + 0.1);
    const f = duel({ dist: 1.5, p: (t) => ({ light: lp(t) }), o: (t) => ({ block: t >= impact - 0.12 && t < impact + 0.08, heavy: hp(t) }) });
    const ev = run(f, 2.5);
    ok(count(ev, "parry") === 1, "parry then counter: parried");
    const h = ev.find((e) => e.type === "hit" && e.by === "o");
    ok(!!h && h.counter, "heavy counter after parry lands as COUNTER");
  }
}

/* ======================================================================== dodge */
function dodge() {
  section("dodge");
  const lp0 = press(0.5);
  let impact = 0;
  run(duel({ dist: 1.5, p: (t) => ({ light: lp0(t) }) }), 1.5, (e) => {
    if (e.type === "hit") impact = e.t;
  });
  {
    const lp = press(0.5);
    const dp = press(impact - 0.08);
    const f = duel({ dist: 1.5, p: (t) => ({ light: lp(t) }), o: (t) => ({ dodge: dp(t), mx: 0, mz: 1 }) });
    const ev = run(f, 1.5);
    ok(count(ev, "hit") === 0, "back-dodge just before impact avoids the hit");
    ok(f.O.stamina < 100, "dodge costs stamina");
  }
  {
    // dodge spam: pressing every step for 4 s
    const f = duel({ dist: 4, o: () => ({ dodge: true, mx: 1, mz: 0 }) });
    const starts = [];
    let minSta = 999;
    const ev = run(f, 4, (e, fg) => {
      if (e.type === "dodge" && e.id === "o") starts.push(e.t);
      minSta = Math.min(minSta, fg.O.stamina);
    });
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    ok(gaps.every((g) => g >= 0.38 + 0.14 - 1e-6), "dodges can't overlap (duration + cooldown)");
    ok(starts.length <= 7, `spam limited by stamina (${starts.length} dodges in 4s)`);
    ok(minSta >= 0, "stamina never negative");
    ok(count(ev, "denied", (e) => e.what === "dodge") > 0, "exhausted dodge is refused");
    const r = Math.hypot(f.O.x, f.O.z);
    ok(r <= ARENA.radius - BODY.radius + 1e-6, `dodging into the wall stays inside the arena (r=${r.toFixed(2)})`);
  }
}

/* ======================================================================== weapons */
function weapons() {
  section("every weapon: in-range hit, out-of-range miss, single hit");
  for (const w of WEAPONS) {
    for (const kind of ["light", "heavy"]) {
      const near = w.id === "spear" ? 2.1 : 1.5;
      const hp = press(0.3);
      const f = duel({ dist: near, pw: w.id, p: (t) => ({ [kind]: hp(t) }), oHp: 500 });
      const ev = run(f, 2);
      ok(count(ev, "hit") === 1, `${w.id} ${kind} hits once at ${near} m (got ${count(ev, "hit")})`);
      const hp2 = press(0.3);
      const far = w.id === "spear" ? 3.6 : 3.0;
      const f2 = duel({ dist: far, pw: w.id, p: (t) => ({ [kind]: hp2(t) }), oHp: 500 });
      const ev2 = run(f2, 2);
      ok(count(ev2, "hit") === 0, `${w.id} ${kind} misses at ${far} m`);
    }
  }
  for (const w of WEAPONS) {
    // every attack of the light chain connects against a planted target
    const near = w.id === "spear" ? 2.1 : 1.5;
    const times = [0.3];
    for (let i = 1; i < w.light.length; i++) {
      const prev = w.light[i - 1];
      times.push(times[i - 1] + prev.startup + prev.active + (prev.chainAt || 0.1) + 0.02);
    }
    const presses = times.map((t) => press(t));
    const f = duel({ dist: near, pw: w.id, p: (t) => ({ light: presses.some((pp) => pp(t)) }), o: (t, fg, me) => { me.immobile = true; me.x = 0; me.z = near / 2; }, oHp: 500 });
    const ev = run(f, 3);
    ok(count(ev, "hit") === w.light.length, `${w.id} light chain: ${w.light.length} attacks → ${count(ev, "hit")} hits`);
  }
  {
    // spear: only the head cuts — hugging the target misses
    const hp = press(0.3);
    const f = duel({ dist: 0.75, pw: "spear", p: (t) => ({ light: hp(t) }), oHp: 500 });
    const ev = run(f, 1.2);
    ok(count(ev, "hit") === 0, "spear thrust at point-blank range passes beyond the target");
  }
}

/* ======================================================================== frame rate */
function framerate() {
  section("frame-rate independence / tunnelling");
  for (const fps of [20, 30, 60, 144, 240]) {
    const lp = press(0.2);
    const f = duel({ dist: 1.5, p: (t) => ({ light: lp(t) }) });
    let hits = 0;
    for (let i = 0; i < fps * 1.5; i++) {
      advance(f, 1 / fps);
      for (const e of drainEvents(f)) if (e.type === "hit") hits++;
    }
    ok(hits === 1, `${fps} fps: exactly one hit (got ${hits})`);
  }
  {
    // a 5 s lag spike is clamped, not simulated
    const f = duel({ dist: 3 });
    advance(f, 5);
    ok(f.time <= 0.11, `huge frame delta clamped (advanced ${f.time.toFixed(3)}s)`);
  }
}

/* ======================================================================== torture */
function randomPlayer(rng) {
  let hold = 0;
  let mx = 0;
  let mz = 0;
  let block = false;
  return (fight, f) => {
    const o = fight.O;
    const yaw = Math.atan2(o.x - f.x, o.z - f.z);
    if (fight.time > hold) {
      hold = fight.time + rng.range(0.1, 0.7);
      const a = rng() * Math.PI * 2;
      const m = rng() < 0.3 ? 0 : 1;
      mx = Math.cos(a) * m;
      mz = Math.sin(a) * m;
      block = rng() < 0.25;
    }
    return {
      ...NEUTRAL,
      mx,
      mz,
      yaw,
      sprint: rng() < 0.1,
      block,
      light: rng() < 0.05,
      heavy: rng() < 0.015,
      dodge: rng() < 0.01,
      kick: rng() < 0.005,
    };
  };
}

function torture() {
  section("torture: AI vs random player, invariants on every step");
  const rng = createRng(1234);
  let steps = 0;
  let attacks = 0;
  let hits = 0;
  let fights = 0;
  const problems = new Map();
  const bad = (k) => problems.set(k, (problems.get(k) || 0) + 1);
  for (const e of ENEMIES) {
    for (let rep = 0; rep < 8; rep++) {
      const fight = createFight({
        player: { weapon: rng.pick(WEAPONS).id, armor: rng.pick(["light", "balanced", "heavy"]), hp: 100 },
        enemy: { weapon: e.weapon, armor: e.armor, hp: e.hp, damageMul: e.damageMul, tempo: e.tempo, moveMul: e.moveMul, recoveryMul: e.recoveryMul },
        arena: { radius: 8.6 + (e.n % 5) * 0.5, pillars: e.arena === "sun_temple" ? [{ x: 6.4, z: 0, r: 0.5 }, { x: -6.4, z: 0, r: 0.5 }, { x: 0, z: 6.4, r: 0.5 }, { x: 0, z: -6.4, r: 0.5 }] : [] },
        introDur: 1,
        controllers: { p: randomPlayer(rng), o: createAI(e.ai, createRng(rep * 97 + e.n)) },
      });
      fights++;
      let ends = 0;
      let koAt = null;
      const seqHits = new Map();
      for (let i = 0; i < 120 * 90 && !fight.ended; i++) {
        step(fight, SIM_DT);
        steps++;
        for (const ev of drainEvents(fight)) {
          if (ev.type === "attackStart") attacks++;
          if (ev.type === "hit") {
            hits++;
            if (koAt != null) bad("hit after KO");
            const A = ev.by === "p" ? fight.P : fight.O;
            const key = `${ev.by}:${A.act ? A.act.seq : "x"}`;
            if (A.act && A.act.type === "attack") {
              if (seqHits.has(key)) bad("double hit in one swing");
              seqHits.set(key, 1);
            }
          }
          if (ev.type === "attackStart" && (koAt != null || ev.t < 1)) bad("attack outside the live bout (intro / after KO)");
          if (ev.type === "ko") koAt = fight.time;
          if (ev.type === "end") ends++;
        }
        for (const f of [fight.P, fight.O]) {
          if (![f.x, f.z, f.yaw, f.hp, f.stamina, f.vx, f.vz].every(Number.isFinite)) bad("NaN");
          if (f.hp < 0 || f.hp > f.maxHp) bad("hp out of range");
          if (f.stamina < -1e-9 || f.stamina > f.maxStamina + 1e-9) bad("stamina out of range");
          if (Math.hypot(f.x, f.z) > fight.arena.radius - BODY.radius + 1e-3) bad("outside arena");
          for (const p of fight.arena.pillars) if (Math.hypot(f.x - p.x, f.z - p.z) < p.r + BODY.radius - 1e-3) bad("inside pillar");
          if (f.defeated && f.act && f.act.type === "attack") bad("defeated fighter attacking");
        }
        if (Math.hypot(fight.P.x - fight.O.x, fight.P.z - fight.O.z) < FIGHTER_GAP - 0.02) bad("fighters overlap");
      }
      if (fight.ended && ends !== 1) bad(`end fired ${ends}x`);
    }
  }
  console.log(`  ${fights} fights, ${steps} steps, ${attacks} attacks, ${hits} hits`);
  for (const [k, v] of problems) console.log(`  problem: ${k} ×${v}`);
  ok(problems.size === 0, "no invariant violations");
}

/* ======================================================================== fairness */
function fairness() {
  section("AI fairness: reacts only after its perception delay");
  const rng = createRng(77);
  let worst = Infinity;
  let reactions = 0;
  for (const e of [ENEMIES[0], ENEMIES[9], ENEMIES[24]]) {
    for (let rep = 0; rep < 40; rep++) {
      let nextAt = 1 + rng() * 0.5;
      const ai = createAI({ ...e.ai, parryRate: 0.5, blockRate: 0.5, dodgeRate: 0, aggression: 0, guardUp: 0 }, createRng(rep + 1));
      const fight = createFight({
        player: { weapon: "sword_shield", hp: 100 },
        enemy: { weapon: e.weapon, hp: 5000, tempo: e.tempo },
        arena: ARENA,
        introDur: 0,
        controllers: {
          // walks in and swings whenever in range, at irregular intervals
          p: scripted((t, fg, f) => {
            const dx = fg.O.x - f.x;
            const dz = fg.O.z - f.z;
            const d = Math.hypot(dx, dz);
            const out = { yaw: Math.atan2(dx, dz), mx: d > 1.6 ? dx / d : 0, mz: d > 1.6 ? dz / d : 0 };
            if (d < 1.9 && t >= nextAt && !f.act) {
              out.light = true;
              nextAt = t + 0.8 + rng() * 1.2;
            }
            return out;
          }),
          o: ai,
        },
      });
      fight.P.z = -0.8;
      fight.O.z = 0.8;
      let started = null;
      let wasHeld = false;
      for (let i = 0; i < 120 * 12; i++) {
        step(fight, SIM_DT);
        for (const ev of drainEvents(fight)) {
          if (ev.type === "attackStart" && ev.id === "p") started = ev.t;
        }
        const held = fight.O.blockHeld;
        if (held && !wasHeld && started != null) {
          reactions++;
          worst = Math.min(worst, fight.time - started - e.ai.reaction);
          started = null;
        }
        wasHeld = held;
      }
    }
  }
  console.log(`  ${reactions} guarded reactions; earliest reaction − perception delay = ${worst.toFixed(3)}s`);
  ok(worst >= -SIM_DT - 1e-9, "AI never guards before it could have seen the wind-up");
}

/* ======================================================================== balance */
function balance() {
  section("difficulty curve: a competent scripted player vs each opponent");
  const rng = createRng(5);
  // a 'decent player': circles, blocks readable attacks with a human 0.3 s delay, punishes recoveries
  const decentAI = () => createAI({ reaction: 0.3, aggression: 0.55, blockRate: 0.55, parryRate: 0.12, dodgeRate: 0.12, counterRate: 0.6, kickRate: 0.2, turn: 12, patience: 1.2, combos: [["L", "L"], ["L", "L", "H"], ["H"], ["L"]] }, createRng(Math.floor(rng() * 1e9)));
  for (const e of ENEMIES) {
    let wins = 0;
    let time = 0;
    const N = 20;
    for (let rep = 0; rep < N; rep++) {
      const fight = createFight({
        player: { weapon: "sword_shield", armor: "balanced", hp: 100 + Math.floor((e.n - 1) / 5) * 10 },
        enemy: { weapon: e.weapon, armor: e.armor, hp: e.hp, damageMul: e.damageMul, tempo: e.tempo, moveMul: e.moveMul, recoveryMul: e.recoveryMul },
        arena: ARENA,
        introDur: 0,
        controllers: { p: decentAI(), o: createAI(e.ai, createRng(rep * 31 + e.n)) },
      });
      for (let i = 0; i < 120 * 150 && !fight.ended; i++) step(fight, SIM_DT);
      if (fight.winner === "p") wins++;
      time += fight.elapsed;
      drainEvents(fight);
    }
    console.log(`  #${String(e.n).padStart(2)} ${e.first.padEnd(9)} ${e.weapon.padEnd(12)} win ${String(Math.round((wins / N) * 100)).padStart(3)}%  avg ${(time / N).toFixed(0)}s`);
  }
}

const suites = { basic, parry, dodge, weapons, framerate, torture, fairness, balance };
if (which === "all") for (const k of ["basic", "parry", "dodge", "weapons", "framerate", "fairness", "torture"]) suites[k]();
else suites[which]();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
