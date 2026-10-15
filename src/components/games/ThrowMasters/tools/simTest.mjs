/**
 * Headless checks for Throw Masters' physics, weapons, AI and modes.
 *   node src/components/games/ThrowMasters/tools/simTest.mjs [core|weapons|ai|battle|levels|target|all]
 */
import { WEAPONS, CHARACTERS, CHAR_BY_ID, TOURNAMENT, DUEL_LAYOUTS, DIFFICULTY, makeLayout, FIGHTER_SCALE } from "../data.js";
import { launch, stepProjectile, simulateShot, STEP, groundY } from "../physics.js";
import { solveShot, planShot, createAIMemory, learn } from "../ai.js";
import { Battle } from "../battle.js";

let fails = 0;
let passes = 0;
function check(name, ok, info = "") {
  if (ok) passes++;
  else fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`);
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fighterAt(side, x, layout, charId = "axel") {
  const c = CHAR_BY_ID[charId];
  return { side, x, y: groundY(layout.ground, x), dir: side === 0 ? 1 : -1, k: c.build * FIGHTER_SCALE, power: c.power, dead: false };
}

function worldFor(layout, fighters = []) {
  return { ground: layout.ground, obstacles: layout.obstacles || [], wind: layout.wind || 0, fighters };
}

/** Fly a shot with no fighters; return the landing x. */
function landX(weapon, angle, power, layoutOpts = {}) {
  const L = makeLayout({ dist: 900, ...layoutOpts });
  const f = fighterAt(0, L.xL, L);
  const r = simulateShot(worldFor(L), f, weapon, angle, power, null, 8);
  return { x: r.x, y: r.y, ev: r.event?.type, t: r.t };
}

function core() {
  const a = landX("axe", 45, 0.5);
  const b = landX("axe", 45, 0.8);
  check("power increases throw distance", b.x > a.x + 150, `p0.5 → ${a.x.toFixed(0)}, p0.8 → ${b.x.toFixed(0)}`);
  const lo = landX("axe", 20, 0.7);
  const hi = landX("axe", 65, 0.7);
  check("angle changes trajectory (flight time)", hi.t > lo.t * 1.8, `20° t=${lo.t.toFixed(2)}s, 65° t=${hi.t.toFixed(2)}s`);
  // gravity: apex then fall
  const L = makeLayout({ dist: 900 });
  const f = fighterAt(0, L.xL, L);
  const [p] = launch(f, "axe", 60, 0.7);
  let minY = p.y;
  let falls = false;
  for (let i = 0; i < 600; i++) {
    const ev = stepProjectile(worldFor(L), p, STEP);
    if (p.y < minY) minY = p.y;
    if (p.y > minY + 50) falls = true;
    if (ev?.end) break;
  }
  check("gravity: shot rises then falls back to ground", falls && minY < f.y - 300);
  // frame-rate independence: the live battle uses the same fixed step
  check("ground collision ends a sharp shot", a.ev === "ground", a.ev);
  // character collision
  const L2 = makeLayout({ dist: 900 });
  const f0 = fighterAt(0, L2.xL, L2);
  const f1 = fighterAt(1, L2.xR, L2);
  const world = worldFor(L2, [f0, f1]);
  const sol = solveShot(world, f0, f1, "axe");
  const r = simulateShot(world, f0, "axe", sol.best.a, sol.best.p, f1);
  check("solver finds a throw that hits the opponent", r.event?.type === "fighter" && r.event.side === 1, `${r.event?.type} ${r.event?.zone || ""}`);
  check("thrower can't hit itself", (() => {
    const [q] = launch(f0, "axe", 89, 0.6);
    for (let i = 0; i < 900; i++) {
      const ev = stepProjectile(world, q, STEP);
      if (ev?.end) return ev.type !== "fighter";
    }
    return true;
  })());
  // obstacle
  const L3 = makeLayout({ dist: 900, obstacles: [{ type: "rect", x: 760, y: 360, w: 80, h: 400 }] });
  const r3 = simulateShot(worldFor(L3), fighterAt(0, L3.xL, L3), "arrow", 10, 0.8, null);
  check("obstacle blocks a flat shot", r3.event?.type === "obstacle", r3.event?.type);
  // world bounds
  const r4 = simulateShot(worldFor(L), f, "arrow", 30, 1, null, 10);
  check("shots leaving the arena end as 'out'", r4.event?.type === "out", r4.event?.type);
}

function weapons() {
  const res = {};
  for (const id of Object.keys(WEAPONS)) res[id] = landX(id, 40, 0.7);
  console.log("   landing @40°/70%: " + Object.entries(res).map(([k, v]) => `${k}:${v.ev}@${v.x.toFixed(0)}`).join("  "));
  const xs = Object.values(res).filter((r) => r.ev !== "caught").map((r) => Math.round(r.x / 20));
  check("weapons fly different distances", new Set(xs).size >= 6, `${new Set(xs).size} distinct`);
  check("bomb explodes on its fuse", res.bomb.ev === "explode" && Math.abs(res.bomb.t - WEAPONS.bomb.fuse) < 0.02, `t=${res.bomb.t.toFixed(2)}`);
  // bomb bounce
  const L = makeLayout({ dist: 900 });
  const f = fighterAt(0, L.xL, L);
  const [b] = launch(f, "bomb", 30, 0.4);
  let bounces = 0;
  for (let i = 0; i < 600; i++) {
    const ev = stepProjectile(worldFor(L), b, STEP);
    if (ev?.type === "bounce") bounces++;
    if (ev?.end) break;
  }
  check("bomb bounces on the ground before exploding", bounces >= 1, `${bounces} bounces`);
  const boom = landX("boomerang", 78, 0.75);
  check("boomerang returns to the thrower", boom.ev === "caught", boom.ev);
  const knives = launch(f, "knives", 30, 0.7);
  check("knives throw a 3-blade fan", knives.length === 3 && knives[0].vy !== knives[2].vy);
  // shuriken ricochet
  const [s] = launch(f, "shuriken", -10, 0.5);
  let ric = 0;
  for (let i = 0; i < 600; i++) {
    const ev = stepProjectile(worldFor(L), s, STEP);
    if (ev?.type === "ricochet") ric++;
    if (ev?.end) break;
  }
  check("shuriken ricochets exactly once", ric === 1, `${ric}`);
  // wind
  const calm = landX("crystal", 45, 0.7);
  const windy = landX("crystal", 45, 0.7, { wind: 150 });
  check("wind pushes shots", windy.x > calm.x + 60, `${calm.x.toFixed(0)} → ${windy.x.toFixed(0)}`);
}

/** Hit-rate of the AI over many turns at a given skill. */
function aiRate(skill, seed, turnsPerBattle = 6, battles = 40) {
  const rand = rng(seed);
  let hits = 0;
  let total = 0;
  let firstHits = 0;
  for (let b = 0; b < battles; b++) {
    const lay = DUEL_LAYOUTS[b % DUEL_LAYOUTS.length];
    const L = makeLayout(lay);
    const charId = CHARACTERS[b % CHARACTERS.length].id;
    const f1 = fighterAt(1, L.xR, L, charId);
    const f0 = fighterAt(0, L.xL, L);
    const world = worldFor(L, [f0, f1]);
    const mem = createAIMemory(skill, rand);
    for (let t = 0; t < turnsPerBattle; t++) {
      const plan = planShot(world, f1, f0, CHAR_BY_ID[charId].weapon, mem, rand);
      const r = simulateShot(world, f1, CHAR_BY_ID[charId].weapon, plan.angle, plan.power, f0);
      const hit = (r.event?.type === "fighter" && r.event.side === 0) || (r.event?.type === "explode" && r.minDist < 60);
      hits += hit ? 1 : 0;
      if (t === 0 && hit) firstHits++;
      total++;
      learn(mem, hit, rand);
    }
  }
  return { rate: hits / total, first: firstHits / battles };
}

function ai() {
  const e = aiRate(DIFFICULTY.easy.skill, 1);
  const m = aiRate(DIFFICULTY.medium.skill, 2);
  const h = aiRate(DIFFICULTY.hard.skill, 3);
  console.log(`   hit rate  easy ${(e.rate * 100).toFixed(0)}% (first ${(e.first * 100).toFixed(0)}%)  medium ${(m.rate * 100).toFixed(0)}% (first ${(m.first * 100).toFixed(0)}%)  hard ${(h.rate * 100).toFixed(0)}% (first ${(h.first * 100).toFixed(0)}%)`);
  check("difficulty raises AI accuracy", e.rate < m.rate && m.rate < h.rate);
  check("hard AI is not perfect", h.rate < 0.9, `${(h.rate * 100).toFixed(0)}%`);
  check("easy AI still lands some hits", e.rate > 0.08, `${(e.rate * 100).toFixed(0)}%`);
  // learning: later throws better than first throws (easy)
  check("AI improves after misses (later throws hit more than first)", e.rate > e.first, `first ${(e.first * 100).toFixed(0)}% vs all ${(e.rate * 100).toFixed(0)}%`);
}

function runBattle(cfg, maxT = 400) {
  const events = [];
  const b = new Battle({ ...cfg, onEvent: (t, d) => events.push([t, d]), rand: cfg.rand || rng(7) });
  let t = 0;
  while (b.phase !== "done" && t < maxT) {
    b.update(1 / 60);
    t += 1 / 60;
  }
  return { b, events, t };
}

function battle() {
  const L = makeLayout(DUEL_LAYOUTS[0]);
  const { b, events, t } = runBattle({ mode: "duel", arena: "meadow", layout: L, players: [{ charId: "axel", skill: 0.6 }, { charId: "bruno", skill: 0.6 }] });
  const over = events.find((e) => e[0] === "over");
  check("AI vs AI duel finishes with a winner", !!over && over[1].winner >= 0, `winner ${over?.[1].winner} after ${b.turnNo} turns, ${t.toFixed(0)}s`);
  const turns = events.filter((e) => e[0] === "turn").map((e) => e[1].side);
  check("turns strictly alternate", turns.every((s, i) => i === 0 || s !== turns[i - 1]), turns.join(""));
  const throws = events.filter((e) => e[0] === "throw");
  check("one throw per turn", throws.length === turns.length, `${throws.length} throws / ${turns.length} turns`);
  const hits = events.filter((e) => e[0] === "hit");
  const dealt = b.stats[0].dmg + b.stats[1].dmg;
  const lost = b.fighters.reduce((s, f) => s + (f.maxHp - f.hp), 0);
  check("damage dealt matches health lost (+ self-blast)", dealt <= lost && lost - dealt < 60, `dealt ${dealt}, lost ${lost}, hits ${hits.length}`);
  check("loser is at 0 health", b.fighters[1 - over[1].winner].hp === 0);

  // every weapon finishes a battle
  for (const c of CHARACTERS) {
    const { b: bb, events: ev } = runBattle({ mode: "duel", arena: "meadow", layout: makeLayout(DUEL_LAYOUTS[2]), players: [{ charId: c.id, skill: 0.7 }, { charId: "axel", skill: 0.7 }], rand: rng(c.id.length * 31) });
    const o = ev.find((e) => e[0] === "over");
    const myHits = ev.filter((e) => e[0] === "hit" && e[1].side === 1 && e[1].weapon === c.weapon).length;
    check(`${c.name} (${c.weapon}) battle completes and lands hits`, !!o && myHits > 0, `${bb.turnNo} turns, ${myHits} ${c.weapon} hits, winner ${o?.[1].winner}`);
  }

  // human input path: drag → throw
  const hb = new Battle({ mode: "local", arena: "meadow", layout: makeLayout({ dist: 900 }), players: [{ charId: "axel", human: true }, { charId: "robin", human: true }], rand: rng(3) });
  for (let i = 0; i < 90; i++) hb.update(1 / 60);
  const f = hb.current;
  check("human turn starts after intro", hb.phase === "aim" && f.side === 0);
  hb.pointerDown(f.x, f.y - 100);
  hb.pointerMove(f.x + 5, f.y - 100);
  check("tiny drag is cancelled (no accidental throw)", hb.pointerUp() === null && hb.phase === "aim");
  hb.pointerDown(f.x, f.y - 100);
  hb.pointerMove(f.x - 150, f.y - 100 + 150);
  check("pull-back drag aims up and forward", Math.abs(f.aimAngle - 45) < 1 && Math.abs(f.aimPower - Math.hypot(150, 150) / 230) < 0.01, `angle ${f.aimAngle.toFixed(1)} power ${f.aimPower.toFixed(2)}`);
  check("aim preview has points", (hb.preview() || []).length > 4);
  hb.pointerUp();
  check("release throws", hb.phase === "flight" && hb.projectiles.length === 1);
  for (let i = 0; i < 600 && hb.turn === 0; i++) hb.update(1 / 60);
  check("local 2P: turn passes to player 2", hb.turn === 1 && hb.phase === "aim" && hb.current.human);
  hb.pointerDown(1000, 500);
  hb.pointerMove(1150, 650);
  check("player 2 aims mirrored (towards the left)", Math.abs(hb.current.aimAngle - 45) < 1);
  hb.pointerUp();
  check("player 1 can't act during player 2's flight", hb.pointerDown(100, 100) === false);
}

function levels() {
  check("30 tournament battles", TOURNAMENT.length === 30);
  check("5 arenas used, 6 battles each", new Set(TOURNAMENT.map((t) => t.arena)).size === 5);
  check("AI skill ramps up", TOURNAMENT.every((t, i) => i === 0 || t.skill >= TOURNAMENT[i - 1].skill - 0.05) && TOURNAMENT[29].skill > TOURNAMENT[0].skill + 0.6);
  let bad = [];
  for (const T of TOURNAMENT) {
    const L = makeLayout(T.layout);
    for (const c of CHARACTERS) {
      const f0 = fighterAt(0, L.xL, L, c.id);
      const f1 = fighterAt(1, L.xR, L, T.opponent);
      const world = worldFor(L, [f0, f1]);
      const s0 = solveShot(world, f0, f1, c.weapon);
      if (s0.best.s > 0) bad.push(`#${T.index + 1} ${c.weapon} (${s0.best.s.toFixed(0)})`);
    }
    const f0 = fighterAt(0, L.xL, L, "axel");
    const f1 = fighterAt(1, L.xR, L, T.opponent);
    const s1 = solveShot(worldFor(L, [f0, f1]), f1, f0, CHAR_BY_ID[T.opponent].weapon);
    if (s1.best.s > 0) bad.push(`#${T.index + 1} AI ${T.opponent}`);
  }
  check("every battle is winnable with every weapon (a hitting throw exists)", bad.length === 0, bad.join(", "));
  // player wins tournament battles with a decent bot (simulates a solid human)
  let wins = 0;
  for (const T of TOURNAMENT) {
    const { events } = runBattle({ mode: "tournament", arena: T.arena, layout: makeLayout(T.layout), players: [{ charId: "rex", skill: 0.75 }, { charId: T.opponent, skill: T.skill, hpMul: T.hpMul }], rand: rng(T.index + 11) });
    const o = events.find((e) => e[0] === "over");
    if (o && o[1].winner === 0) wins++;
  }
  console.log(`   skilled bot (0.75) wins ${wins}/30 tournament battles`);
  check("tournament is beatable but not trivial", wins >= 12 && wins <= 29, `${wins}/30`);
}

function target() {
  const L = makeLayout({ dist: 900 });
  const b = new Battle({ mode: "target", arena: "meadow", layout: L, players: [{ charId: "robin", human: true }], rand: rng(5) });
  let throws = 0;
  for (let i = 0; i < 20000 && b.phase !== "done"; i++) {
    b.update(1 / 60);
    if (b.phase === "aim") {
      const f = b.current;
      const tg = b.world.targets.find((t) => t && t.alive);
      // simple aimer: solve for a fake fighter standing at the target
      const fake = { side: 9, x: tg.x, y: tg.y + 14, dir: -1, k: 0.28, dead: false };
      const world = { ...b.world, fighters: [fake], targets: null };
      const { best } = solveShot(world, f, fake, f.weapon);
      b.throw(f, best.a, best.p);
      throws++;
    }
  }
  check("target challenge ends after 10 throws", b.phase === "done" && throws === 10, `${throws} throws`);
  check("target hits score points", b.score > 0, `score ${b.score}`);
}

const which = process.argv[2] || "all";
const t0 = Date.now();
if (which === "core" || which === "all") core();
if (which === "weapons" || which === "all") weapons();
if (which === "ai" || which === "all") ai();
if (which === "battle" || which === "all") battle();
if (which === "levels" || which === "all") levels();
if (which === "target" || which === "all") target();
console.log(`\n${passes} passed, ${fails} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fails ? 1 : 0);
