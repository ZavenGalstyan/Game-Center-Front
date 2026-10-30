/**
 * Headless engine checks for Shadow Arena.
 *   node src/components/games/ShadowArena/tools/simTest.mjs [core|fighters|rounds|ai|arcade|save|all]
 */
import { createMatch, step, NO_INPUT, hurtBox } from "../engine/fight.js";
import { FIGHTERS, BOUND_L, BOUND_R, INTRO_F, OUTRO_F, FIGHTER_BY_ID } from "../engine/data.js";
import { createAI, aiParams, aiInput } from "../engine/ai.js";
import { BATTLES } from "../data/arcade.js";
import { loadSave, writeSave, recordArcade, recordVs, fresh, SAVE_KEY } from "../engine/save.js";

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL", msg);
  }
};
const I = (o = {}) => ({ ...NO_INPUT, ...o });
const fight = (cfg = {}) => {
  const m = createMatch({ fighters: ["flame", "frost"], arena: "temple", ...cfg });
  while (m.phase === "intro") step(m, [NO_INPUT, NO_INPUT]);
  return m;
};
const run = (m, n, a = NO_INPUT, b = NO_INPUT) => {
  const evs = [];
  for (let i = 0; i < n; i++) evs.push(...step(m, [typeof a === "function" ? a(i) : a, typeof b === "function" ? b(i) : b]));
  return evs;
};
const place = (m, x0, x1) => {
  m.f[0].x = x0;
  m.f[1].x = x1;
  m.f[0].face = x1 > x0 ? 1 : -1;
  m.f[1].face = -m.f[0].face;
};
const invariants = (m, tag) => {
  for (const f of m.f) {
    if (!(f.y >= 0)) return ok(false, `${tag}: fighter ${f.side} below ground y=${f.y}`);
    if (!(f.x >= BOUND_L + f.def.w / 2 - 1e-6 && f.x <= BOUND_R - f.def.w / 2 + 1e-6)) return ok(false, `${tag}: fighter ${f.side} out of bounds x=${f.x}`);
    if (!(f.hp >= 0 && f.hp <= f.maxHp)) return ok(false, `${tag}: hp ${f.hp}`);
    if (![f.x, f.y, f.vx, f.vy].every(Number.isFinite)) return ok(false, `${tag}: NaN`);
  }
  return true;
};

function core() {
  console.log("core");
  // both players move simultaneously
  let m = fight();
  const [x0, x1] = [m.f[0].x, m.f[1].x];
  run(m, 10, I({ r: true }), I({ l: true }));
  ok(m.f[0].x > x0 + 20 && m.f[1].x < x1 - 20, "both fighters walk toward each other on the same ticks");
  // simultaneous jump + walk
  m = fight();
  run(m, 1, I({ jump: true, r: true }), I({ jump: true, l: true }));
  run(m, 5, I({ r: true }), I({ l: true }));
  ok(m.f[0].y > 0 && m.f[1].y > 0 && m.f[0].state === "jump" && m.f[1].state === "jump", "both jump on the same tick");
  run(m, 80);
  ok(m.f[0].y === 0 && m.f[1].y === 0 && m.f[0].state === "idle", "both land back on the ground");
  // simultaneous punches at range → clean trade, same damage both sides (mirror)
  m = fight({ fighters: ["flame", "flame"] });
  place(m, 440, 520);
  run(m, 1, I({ punch: true }), I({ punch: true }));
  run(m, 30);
  ok(m.f[0].hp === m.f[1].hp && m.f[0].hp === 100 - 6, `simultaneous punches trade evenly (${m.f[0].hp}/${m.f[1].hp})`);
  // one attack hits at most once
  m = fight();
  place(m, 440, 510);
  const ev = run(m, 40, (i) => I({ punch: i === 0 }));
  ok(ev.filter((e) => e.type === "hit").length === 1 && m.f[1].hp === 94, "a punch hits exactly once");
  // invulnerable right after a hit
  m = fight();
  place(m, 440, 510);
  run(m, 1, I({ punch: true }));
  run(m, 9);
  ok(m.f[1].inv > 0 && m.f[1].state === "hit", "defender is invulnerable during hit-stun");
  // mashing doesn't multiply damage: 60 frames of punch spam
  m = fight();
  place(m, 440, 510);
  run(m, 60, I({ punch: true }));
  ok(100 - m.f[1].hp <= 6 * 3, `punch spam is rate-limited (${100 - m.f[1].hp} dmg in 1 s)`);
  // block
  m = fight();
  place(m, 440, 510);
  run(m, 2, NO_INPUT, I({ block: true }));
  run(m, 30, (i) => I({ punch: i === 0 }), I({ block: true }));
  ok(m.f[1].hp === 100 && m.f[1].stats.blocked === 1, "blocked punch does no damage");
  m = fight();
  place(m, 440, 520);
  run(m, 2, NO_INPUT, I({ block: true }));
  run(m, 40, (i) => I({ kick: i === 0 }), I({ block: true }));
  ok(m.f[1].hp === 100, "blocked kick does no damage");
  // free fighters always face each other, even after a walk-through attempt
  m = fight();
  let wrong = 0;
  for (let i = 0; i < 400; i++) {
    step(m, [I({ r: i % 90 < 60, jump: i % 50 === 0, block: i % 70 > 60 }), I({ l: i % 80 < 50, jump: i % 65 === 0 })]);
    for (const f of m.f) {
      const o = m.f[1 - f.side];
      if (["idle", "walk", "block"].includes(f.state) && Math.abs(o.x - f.x) > 2 && f.face !== Math.sign(o.x - f.x)) wrong++;
    }
  }
  ok(wrong === 0, `grounded fighters always face each other (${wrong} wrong frames)`);
  // attacks pressed while blocking are dropped
  m = fight();
  place(m, 440, 510);
  run(m, 20, I({ block: true, punch: true }));
  ok(m.f[0].state === "block" && m.f[1].hp === 100, "no attacking out of a held block");
  // walls and ground
  m = fight();
  run(m, 400, I({ l: true }), I({ r: true }));
  ok(m.f[0].x === BOUND_L + m.f[0].def.w / 2 && m.f[1].x === BOUND_R - m.f[1].def.w / 2, "walls stop both fighters");
  invariants(m, "walls");
  // pushing: bodies never overlap on the ground
  m = fight();
  let maxOverlap = 0;
  for (let i = 0; i < 200; i++) {
    step(m, [I({ r: true }), I({ l: true })]);
    const a = hurtBox(m.f[0]);
    const b = hurtBox(m.f[1]);
    maxOverlap = Math.max(maxOverlap, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  }
  ok(maxOverlap <= 0.01, `walking into each other never overlaps bodies (${maxOverlap.toFixed(2)})`);
  // pinned in the corner: pushing still never overlaps and nobody leaves the arena
  m = fight();
  place(m, BOUND_L + 27, BOUND_L + 60);
  run(m, 120, I({ l: true }), I({ l: true }));
  invariants(m, "corner");
  ok(m.f[1].x - m.f[0].x >= (m.f[0].def.w + m.f[1].def.w) / 2 - 0.01, "corner push keeps bodies apart");
  // jumping over flips facing on landing
  m = fight({ fighters: ["wind", "stone"] });
  place(m, 430, 520);
  run(m, 1, I({ jump: true, r: true }));
  run(m, 60, I({ r: true }));
  run(m, 3);
  ok(m.f[0].x > m.f[1].x ? m.f[0].face === -1 && m.f[1].face === 1 : m.f[0].face === 1, "facing follows a cross-over");
  invariants(m, "crossover");
  // one air attack per jump
  m = fight();
  place(m, 300, 700);
  const evA = [...run(m, 1, I({ jump: true })), ...run(m, 40, (i) => I({ punch: i % 2 === 0 }))];
  ok(evA.filter((e) => e.type === "swing").length === 1, "only one air attack per jump");
  // projectile: hits once, disappears
  m = fight();
  place(m, 200, 700);
  const evP = run(m, 120, (i) => I({ special: i === 0 }));
  ok(evP.filter((e) => e.type === "hit").length === 1 && m.f[1].hp === 89 && m.projs.length === 0, "fireball hits once and is consumed");
  // special cooldown: can't fire again right away
  m = fight();
  place(m, 200, 700);
  const evC = run(m, 100, I({ special: true }));
  ok(evC.filter((e) => e.type === "proj").length === 1, "special cooldown prevents a second fireball");
  // blocked special → chip damage
  m = fight();
  place(m, 200, 700);
  run(m, 120, (i) => I({ special: i === 0 }), I({ block: true }));
  ok(m.f[1].hp === 100 - Math.round(11 * 0.25), `blocked fireball chips (${m.f[1].hp})`);
  // projectiles clash
  m = fight({ fighters: ["flame", "frost"] });
  place(m, 200, 760);
  const evX = run(m, 120, (i) => I({ special: i === 0 }), (i) => I({ special: i === 0 }));
  ok(evX.some((e) => e.type === "clash") && m.f[0].hp === 100 && m.f[1].hp === 100, "opposing projectiles cancel");
  // damage ownership: P1's hit damages only P2 and credits P1
  m = fight({ fighters: ["stone", "wind"] });
  place(m, 440, 520);
  run(m, 60, (i) => I({ special: i === 0 }));
  ok(m.f[0].hp === m.f[0].maxHp && m.f[1].hp < 100 && m.f[0].stats.dmg === 100 - m.f[1].hp, "damage goes to the defender and is credited to the attacker");
  // hitstop pauses both, inputs during it are buffered
  m = fight();
  place(m, 440, 510);
  run(m, 1, I({ punch: true }));
  let stopped = false;
  for (let i = 0; i < 12; i++) {
    step(m, [NO_INPUT, NO_INPUT]);
    if (m.hitstop > 0) stopped = true;
  }
  ok(stopped, "hit-stop freeze happens on a clean hit");
}

function fighters() {
  console.log("fighters");
  for (const def of FIGHTERS) {
    const range = { projectile: 400, dash: 200, spin: 70, melee: def.id === "thunder" ? 150 : 90 }[def.moves.special.kind];
    for (const opp of FIGHTERS) {
      const m = fight({ fighters: [def.id, opp.id] });
      place(m, 300, 300 + range);
      const ev = run(m, 140, (i) => I({ special: i === 0 }));
      const hits = ev.filter((e) => e.type === "hit");
      const dmg = Math.round(def.moves.special.dmg);
      ok(hits.length === 1 && opp.hp * 1 - m.f[1].hp === dmg, `${def.id} special lands once on ${opp.id} at ${range}px (${hits.length} hits, ${opp.hp - m.f[1].hp} dmg)`);
      invariants(m, `${def.id} special`);
      // punch and kick land at close range
      for (const name of ["punch", "kick"]) {
        const m2 = fight({ fighters: [def.id, opp.id] });
        place(m2, 400, 400 + (def.w + opp.w) / 2 + 10);
        const e2 = run(m2, 50, (i) => I({ [name]: i === 0 }));
        ok(e2.filter((e) => e.type === "hit").length === 1 && opp.hp - m2.f[1].hp === def.moves[name].dmg, `${def.id} ${name} hits ${opp.id} once for ${def.moves[name].dmg}`);
      }
      // P2 side is identical (mirror)
      const m3 = fight({ fighters: [opp.id, def.id] });
      place(m3, 300 + range, 300);
      m3.f[1].face = 1;
      m3.f[0].face = -1;
      const e3 = run(m3, 140, NO_INPUT, (i) => I({ special: i === 0 }));
      ok(e3.filter((e) => e.type === "hit").length === 1 && opp.hp - m3.f[0].hp === dmg, `${def.id} special works from the P2 side vs ${opp.id}`);
    }
    // special whiffs completely out of range and goes on cooldown
    const m = fight({ fighters: [def.id, "flame"] });
    place(m, 100, 860);
    const ev = run(m, 60, (i) => I({ special: i === 0 }));
    ok(ev.some((e) => e.type === "special") && (m.f[0].cd > 0 || m.projs.length === 1), `${def.id} special triggers and starts its cooldown`);
    invariants(m, `${def.id} whiff`);
  }
}

function rounds() {
  console.log("rounds");
  // KO → round over, no hits after KO
  let m = fight();
  place(m, 440, 510);
  m.f[1].hp = 3;
  run(m, 1, I({ punch: true }));
  run(m, 12);
  ok(m.phase === "ko" && m.roundWinner === 0 && m.wins[0] === 1, "KO ends the round for P1");
  const hp0 = m.f[0].hp;
  run(m, 40, I({ punch: true }), I({ punch: true, special: true }));
  ok(m.f[0].hp === hp0 && m.f[1].state === "ko", "no fighting after KO");
  run(m, OUTRO_F);
  ok(m.round === 2 && m.phase === "intro", "next round starts");
  ok(m.f[0].hp === m.f[0].maxHp && m.f[1].hp === m.f[1].maxHp && m.f[0].x === 300 && m.f[1].x === 660 && m.f[0].cd === 0 && m.projs.length === 0, "round reset restores hp, positions, cooldowns");
  ok(m.f[0].buf === null && m.f[1].jbuf === 0 && m.f[0].state === "idle", "round reset clears buffers and states");
  // inputs during intro are ignored
  run(m, 20, I({ r: true, punch: true }));
  ok(m.f[0].x === 300 && m.f[0].state === "idle", "intro ignores input");
  ok(m.stats[0].hits === 1 && m.f[0].stats === m.stats[0], "match stats carry across rounds");
  // second KO wins the match
  while (m.phase === "intro") step(m, [NO_INPUT, NO_INPUT]);
  m.f[1].hp = 0;
  run(m, 1);
  run(m, OUTRO_F + 5);
  ok(m.phase === "over" && m.winner === 0, "two round wins take the match");
  // double KO → draw round
  m = fight({ fighters: ["flame", "flame"] });
  place(m, 440, 520);
  m.f[0].hp = m.f[1].hp = 4;
  run(m, 1, I({ punch: true }), I({ punch: true }));
  run(m, 15);
  ok(m.phase === "ko" && m.roundWinner === -1 && m.roundReason === "double" && m.wins[0] === 0 && m.wins[1] === 0, "simultaneous KO is a draw round");
  // timer expiry
  m = fight({ roundTime: 45 });
  m.f[0].hp = 50;
  run(m, 45 * 60 + 2);
  ok(m.phase === "timeup" && m.roundWinner === 1 && m.wins[1] === 1, "time-out goes to the healthier fighter");
  m = fight({ fighters: ["stone", "flame"] });
  m.f[0].hp = Math.round(m.f[0].maxHp / 2 * 100) / 100;
  m.f[1].hp = 50;
  m.time = 1;
  run(m, 2);
  ok(m.roundWinner === -1, "time-out with equal health % is a draw");
  // draws cap the match at five rounds
  m = fight({ fighters: ["flame", "flame"] });
  for (let r = 0; r < 5; r++) {
    while (m.phase === "intro") step(m, [NO_INPUT, NO_INPUT]);
    m.time = 1;
    run(m, OUTRO_F + 5);
  }
  ok(m.phase === "over" && m.winner === -1 && m.round === 5, `five drawn rounds end the match as a draw (phase ${m.phase}, round ${m.round})`);
  // intro length
  m = createMatch({ fighters: ["flame", "frost"], arena: "temple" });
  run(m, INTRO_F - 1);
  ok(m.phase === "intro", "intro lasts INTRO_F");
  run(m, 1);
  ok(m.phase === "fight", "fight starts after intro");
}

function botMatch(cfg, aiA, aiB, maxFrames = 60 * 60 * 6) {
  const m = createMatch(cfg);
  let f = 0;
  let bad = null;
  while (m.phase !== "over" && f++ < maxFrames) {
    step(m, [aiA(m), aiB(m)]);
    if (!bad) for (const x of m.f) if (x.y < 0 || x.x < BOUND_L || x.x > BOUND_R || !Number.isFinite(x.x) || x.hp < 0) bad = `${x.def.id} ${x.x} ${x.y} ${x.hp}`;
  }
  return { m, bad, frames: f };
}

function ai() {
  console.log("ai");
  // AI vs AI fuzz on every pairing: no crashes or broken invariants, matches finish
  let n = 0;
  for (const a of FIGHTERS)
    for (const b of FIGHTERS) {
      const A = createAI(aiParams(0.7), ++n);
      const B = createAI(aiParams(0.7), n * 7);
      const { m, bad } = botMatch({ fighters: [a.id, b.id], arena: "temple" }, (mm) => aiInput(A, mm, 0), (mm) => aiInput(B, mm, 1));
      ok(!bad, `fuzz ${a.id} v ${b.id}: ${bad}`);
      ok(m.phase === "over", `${a.id} v ${b.id} finishes (${m.phase})`);
    }
  // harder AI beats easier AI most of the time
  let wins = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const a = FIGHTERS[i % 6].id;
    const b = FIGHTERS[(i * 5 + 1) % 6].id;
    const H = createAI(aiParams(1), 1000 + i);
    const E = createAI(aiParams(0), 2000 + i);
    const side = i % 2;
    const { m } = botMatch({ fighters: side ? [b, a] : [a, b], arena: "desert" }, (mm) => aiInput(side ? E : H, mm, 0), (mm) => aiInput(side ? H : E, mm, 1));
    if (m.winner === side) wins++;
  }
  console.log(`  hard AI vs easy AI: ${wins}/${N}`);
  ok(wins / N > 0.7, "hard AI clearly beats easy AI");
}

function arcade() {
  console.log("arcade");
  ok(BATTLES.length === 30, "30 battles");
  ok(BATTLES.every((b, i) => b.id === i + 1 && FIGHTER_BY_ID[b.opp] && ["temple", "rooftop", "desert", "cave"].includes(b.arena)), "battle configs reference real fighters and arenas");
  for (let t = 0; t < 5; t++) ok(new Set(BATTLES.slice(t * 6, t * 6 + 6).map((b) => b.opp)).size === 6, `tier ${t + 1} meets all six fighters`);
  ok(new Set(BATTLES.map((b) => b.arena)).size === 4, "all four arenas used");
  let mono = true;
  for (let i = 1; i < 30; i++) if (BATTLES[i].d < BATTLES[i - 1].d - 0.06) mono = false;
  ok(mono && BATTLES[0].d === 0 && BATTLES[29].d === 1, "difficulty ramps from 0 to 1");
  // beatability: a strong player-proxy (hard AI at 1×) and an average one (d=0.55) vs every battle
  const table = [];
  for (const proxy of [{ name: "strong", d: 1 }, { name: "average", d: 0.55 }]) {
    let worst = 1;
    const rates = [];
    for (const b of BATTLES) {
      let w = 0;
      const N = 12;
      for (let i = 0; i < N; i++) {
        const me = FIGHTERS[i % 6].id;
        const P = createAI(aiParams(proxy.d), 31 * b.id + i);
        const O = createAI(b.ai, 977 * b.id + i);
        const { m, bad } = botMatch({ fighters: [me, b.opp], arena: b.arena, hpMul: [1, b.hpMul], dmgMul: [1, b.dmgMul], roundTime: b.roundTime, mode: "arcade" }, (mm) => aiInput(P, mm, 0), (mm) => aiInput(O, mm, 1));
        ok(!bad, `arcade ${b.id}: ${bad}`);
        if (m.winner === 0) w++;
      }
      rates.push(w / N);
      worst = Math.min(worst, w / N);
    }
    table.push(`${proxy.name.padEnd(8)} ${rates.map((r) => String(Math.round(r * 100)).padStart(3)).join(" ")}`);
    if (proxy.name === "strong") ok(worst >= 0.25, `strong proxy wins every battle at least sometimes (worst ${worst})`);
    if (proxy.name === "strong") ok(rates.slice(0, 6).every((r) => r >= 0.75), "first tier is easy for a strong player");
    if (proxy.name === "average") ok(rates.slice(0, 3).every((r) => r >= 0.6), "opening battles are winnable for an average player");
  }
  console.log("  battle   " + BATTLES.map((b) => String(b.id).padStart(3)).join(" "));
  for (const row of table) console.log("  " + row);
}

function save() {
  console.log("save");
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  ok(JSON.stringify(loadSave(store)) === JSON.stringify(fresh()), "missing save → fresh");
  mem.set(SAVE_KEY, "{not json");
  ok(loadSave(store).arcade.unlocked === 1, "corrupt save → fresh");
  mem.set(SAVE_KEY, JSON.stringify({ settings: { sound: false, roundTime: 77 }, arcade: { unlocked: 99, cleared: [1, 1, 2, 50, "x"], fighter: "nobody" }, stats: { vsP1: -4, vsMatches: 3.7 } }));
  const s = loadSave(store);
  ok(s.settings.sound === false && s.settings.roundTime === 60 && s.arcade.unlocked === 30 && s.arcade.cleared.join() === "1,2" && s.arcade.fighter === "flame" && s.stats.vsP1 === 0 && s.stats.vsMatches === 3, "save values are sanitized");
  let p = fresh();
  p = recordArcade(p, 1, true);
  p = recordArcade(p, 2, false);
  ok(p.arcade.unlocked === 2 && p.arcade.cleared.join() === "1" && p.stats.arcadeWins === 1 && p.stats.arcadeLosses === 1, "arcade results recorded");
  p = recordArcade({ ...p, arcade: { ...p.arcade, unlocked: 30 } }, 30, true);
  ok(p.arcade.completions === 1 && p.arcade.unlocked === 30, "clearing battle 30 counts a completion");
  p = recordVs(recordVs(recordVs(p, 0), 1), -1);
  ok(p.stats.vsMatches === 3 && p.stats.vsP1 === 1 && p.stats.vsP2 === 1 && p.stats.vsDraws === 1, "vs results recorded");
  writeSave(p, store);
  ok(loadSave(store).stats.vsMatches === 3, "round-trips through storage");
}


const which = process.argv[2] || "all";
const suites = { core, fighters, rounds, ai, arcade, save };
for (const [k, fn] of Object.entries(suites)) if (which === "all" || which === k) fn();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
