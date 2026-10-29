/**
 * Headless test-suite for the Kung Fu Panda engine.
 *   node src/components/games/KungFuPanda/tools/simTest.mjs [all|static|units|bot]
 * Exits non-zero on any failure.
 */
import { Game, EMPTY_INPUT } from "../engine/game.js";
import { LEVELS } from "../data/levels.js";
import { MISSIONS } from "../data/missions.js";
import { HERO_ORDER, HEROES } from "../data/heroes.js";
import { buildColliders, buildNav, blockedAt, navDistance } from "../engine/world.js";
import { createBot, botInput } from "./bot.mjs";
import { loadProgress, saveProgress, completeMission } from "../engine/save.js";

const which = process.argv[2] || "all";
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL:", msg);
  }
};
const DT = 1 / 60;

function insideAny(col, a) {
  for (const c of col.circles) if (Math.hypot(a.x - c.x, a.z - c.z) < c.r + a.r - 0.02) return true;
  for (const b of col.boxes) {
    const cx = Math.max(b.x0, Math.min(b.x1, a.x)), cz = Math.max(b.z0, Math.min(b.z1, a.z));
    if (Math.hypot(a.x - cx, a.z - cz) < a.r - 0.02) return true;
  }
  return false;
}

/* ------------------------------------------------------------ static */
if (which === "all" || which === "static") {
  console.log("static: level layouts");
  for (const L of Object.values(LEVELS)) {
    const col = buildColliders(L);
    const nav = buildNav(col);
    const pts = [
      ["spawn", L.spawn],
      ...L.dummies.map((d) => ["dummy", d]),
      ...L.npcs.map((d) => ["npc", d]),
      ...L.items.map((d) => [d.kind, d]),
      ...L.enemySpawns.map((d) => ["enemySpawn", d]),
      ...(L.guards || []).map((d) => ["guard", d]),
      ...(L.boss ? [["boss", L.boss]] : []),
    ];
    for (const [k, p] of pts) {
      ok(!blockedAt(col, p.x, p.z, 0.5), `${L.id} ${k} (${p.x},${p.z}) is inside a collider`);
      const nd = navDistance(nav, L.spawn.x, L.spawn.z, p.x, p.z);
      ok(Number.isFinite(nd), `${L.id} ${k} (${p.x},${p.z}) unreachable from spawn`);
    }
    const open = nav.blocked.reduce((a, b) => a + (b ? 0 : 1), 0);
    ok(open > 150, `${L.id} has too little walkable space (${open} cells)`);
  }
}

/* ------------------------------------------------------------ units */
if (which === "all" || which === "units") {
  console.log("units: movement, combat, camera, save");
  // random input fuzz: never leaves bounds, never inside colliders, no NaN
  for (const M of MISSIONS)
    for (const h of HERO_ORDER) {
      const g = new Game({ missionId: M.id, heroId: h, seed: 7 });
      let r = 12345;
      const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      let bad = 0;
      for (let i = 0; i < 60 * 40 && g.status === "play"; i++) {
        const inp = { mx: rnd() * 2 - 1, mz: rnd() * 2 - 1, dYaw: (rnd() - 0.5) * 0.1, dPitch: (rnd() - 0.5) * 0.05, jump: rnd() < 0.03, dodge: rnd() < 0.02, punch: rnd() < 0.08, kick: rnd() < 0.04, special: rnd() < 0.01, interact: rnd() < 0.02 };
        g.step(DT, inp);
        const P = g.player;
        if (!Number.isFinite(P.x + P.z + P.y) || P.y < -0.001 || insideAny(g.col, P)) bad++;
        for (const e of g.enemies) if (!Number.isFinite(e.x + e.z) || (!e.dead && e.state !== "leap" && insideAny(g.col, e))) bad++;
        const c = g.cam;
        const cx = c.target.x - c.fwd.x * c.dist, cy = c.target.y - c.fwd.y * c.dist, cz = c.target.z - c.fwd.z * c.dist;
        if (cy < 0.3 || c.dist > 6.2 * HEROES[h].cam + 1e-6) bad++;
        for (const cc of g.col.circles) if (cc.h > 0.5 && cy < cc.h && Math.hypot(cx - cc.x, cz - cc.z) < cc.r) bad++;
      }
      ok(bad === 0, `fuzz ${M.id}/${h}: ${bad} bad frames`);
    }

  // a punch in front of a dummy registers; behind does not
  {
    const g = new Game({ missionId: "training", heroId: "po" });
    g.stepI = 4; // punch step
    const P = g.player;
    const d = g.dummies[1];
    Object.assign(P, { x: d.x, z: d.z - 1.5, facing: 0 });
    g.step(DT, { punch: true });
    for (let i = 0; i < 30; i++) g.step(DT);
    ok(g.counts[4] === 1, `punch on dummy counted (${g.counts[4]})`);
    Object.assign(P, { x: d.x, z: d.z - 5, facing: Math.PI, state: "move" });
    g.step(DT, { punch: true });
    for (let i = 0; i < 30; i++) g.step(DT);
    ok(g.counts[4] === 1, "punch at nothing not counted");
  }
  // steps are ordered: kicking during the move step does nothing
  {
    const g = new Game({ missionId: "training", heroId: "tigress" });
    const d = g.dummies[0];
    Object.assign(g.player, { x: d.x, z: d.z - 1.4, facing: 0 });
    g.step(DT, { kick: true });
    for (let i = 0; i < 40; i++) g.step(DT);
    ok(g.stepI === 0 && g.counts.every((c) => c === 0), "out-of-order step not counted");
  }
  // every hero's special hits a dummy in front and counts once
  for (const h of HERO_ORDER) {
    const g = new Game({ missionId: "training", heroId: h });
    g.stepI = 6;
    const d = g.dummies[1];
    Object.assign(g.player, { x: d.x, z: d.z - 1.6, facing: 0 });
    g.step(DT, { special: true });
    for (let i = 0; i < 70; i++) g.step(DT);
    ok(g.stepI === 7, `${h} special counted on dummy`);
    ok(g.player.state === "move" && g.player.y === 0, `${h} back to move & grounded after special (${g.player.state}, y=${g.player.y})`);
    ok(g.player.specialCd > 0, `${h} special on cooldown`);
    g.step(DT, { special: true });
    ok(g.player.state !== "special", `${h} special blocked by cooldown`);
  }
  // dodge gives i-frames, wolves hurt, death -> gameover
  {
    const g = new Game({ missionId: "valley", heroId: "mantis", seed: 3 });
    let over = false;
    for (let i = 0; i < 60 * 120 && !over; i++) over = g.step(DT).some((e) => e.type === "gameover");
    ok(over && g.status === "lost", "idle hero eventually loses (game over)");
    ok(g.aliveEnemies().length <= 3, "never more than 3 wolves alive");
  }
  {
    const g = new Game({ missionId: "valley", heroId: "po", seed: 3 });
    const P = g.player;
    const e = g.enemies[0];
    Object.assign(e, { x: P.x, z: P.z + 1.5, state: "strike", st: 0.09, hitDone: 0, facing: Math.PI });
    P.iframes = 0.3;
    g.step(DT);
    ok(P.hp === P.maxHp, "i-frames block a wolf strike");
    Object.assign(e, { x: P.x, z: P.z + 1.5, state: "strike", st: 0.09, hitDone: 0, facing: Math.PI });
    P.iframes = 0;
    g.step(DT);
    ok(P.hp === P.maxHp - 10, `wolf strike deals 10 (${P.maxHp - P.hp})`);
  }
  // boss: invulnerable during intro, phase 2 at half hp, pounce happens
  {
    const g = new Game({ missionId: "arena", heroId: "po" });
    const b = g.boss;
    g.damage(b, 50, 0, 1, 0, 0, g.player, "punch");
    ok(b.hp === b.maxHp, "Tai Lung invulnerable during intro");
    for (let i = 0; i < 160; i++) g.step(DT);
    ok(b.state !== "intro", "intro ends");
    g.damage(b, b.maxHp / 2 + 1, 0, 1, 0, 0, g.player, "punch");
    ok(b.phase === 2 && b.state === "roar", "phase 2 + roar at half health");
    let leapt = false;
    for (let i = 0; i < 60 * 30 && !leapt; i++) {
      g.player.hp = g.player.maxHp;
      leapt = g.step(DT).some((e) => e.type === "leap");
    }
    ok(leapt, "Tai Lung pounces");
  }
  // save
  {
    const mem = new Map();
    const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    let p = loadProgress(store);
    ok(p.unlocked.join() === "po,tigress,monkey" && p.completed.length === 0, "fresh progress");
    p = completeMission(p, "training", 42);
    saveProgress(p, store);
    p = loadProgress(store);
    ok(p.unlocked.includes("crane") && p.completed.includes("training") && p.best.training === 42, "training reward persisted");
    mem.set("kung-fu-panda-progress", "{broken");
    p = loadProgress(store);
    ok(p.unlocked.length === 3, "corrupt save falls back to fresh");
  }
}

/* ------------------------------------------------------------ bot */
if (which === "all" || which === "bot") {
  console.log("bot: every mission with every hero");
  const LIMIT = { training: 90, valley: 200, forest: 260, arena: 260 };
  for (const M of MISSIONS)
    for (const h of HERO_ORDER) {
      let won = false, secs = 0, maxAlive = 0, spawned = 0, info = "";
      for (const seed of [1, 2]) {
        const g = new Game({ missionId: M.id, heroId: h, seed });
        const B = createBot();
        const ids = new Set();
        let i = 0;
        for (; i < 60 * LIMIT[M.id] && g.status === "play"; i++) {
          const ev = g.step(DT, botInput(g, B, DT));
          void ev;
          for (const e of g.enemies) ids.add(e.id);
          maxAlive = Math.max(maxAlive, g.aliveEnemies().length);
        }
        spawned = ids.size;
        secs = i / 60;
        info = `status=${g.status} step=${g.cur?.id} counts=${g.counts.join("/")} hp=${g.player.hp} boss=${g.boss ? g.boss.hp : "-"}`;
        if (g.status === "won") {
          won = true;
          break;
        }
      }
      ok(won, `${M.id}/${h} not won: ${info}`);
      if (M.id === "valley") ok(spawned === 5 && maxAlive <= 3, `${M.id}/${h} spawned ${spawned}, max alive ${maxAlive}`);
      console.log(`  ${M.id.padEnd(9)} ${h.padEnd(8)} ${won ? "won " : "LOST"} ${secs.toFixed(1)}s  ${info}`);
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
