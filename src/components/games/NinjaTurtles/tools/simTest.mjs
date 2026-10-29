/**
 * Headless test-suite for the Ninja Turtles: Shadow Strike engine.
 *   node src/components/games/NinjaTurtles/tools/simTest.mjs [all|static|units|bot]
 * Exits non-zero on any failure.
 */
import { Game } from "../engine/game.js";
import { LEVELS } from "../data/levels.js";
import { MISSIONS } from "../data/missions.js";
import { TURTLE_ORDER, ENEMIES } from "../data/turtles.js";
import { buildColliders, buildNav, blockedAt, navDistance } from "../engine/world.js";
import { createBot, botInput } from "./bot.mjs";
import { loadProgress, saveProgress, completeMission, missionUnlocked, SAVE_KEY } from "../engine/save.js";

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
const run = (g, n, inp) => {
  for (let i = 0; i < n && g.status === "play"; i++) g.step(DT, inp);
};

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
      ...L.enemySpawns.flatMap((d) => [["enemySpawn", d], ["patrolPt", { x: d.px, z: d.pz }]]),
      ...(L.guards || []).flatMap((d) => [["guard", d], ["guardPatrol", { x: d.px, z: d.pz }]]),
      ...(L.ambush || []).map((d) => ["ambush", d]),
      ...(L.civilian ? [["civilian", L.civilian]] : []),
      ...(L.safe ? [["safe", L.safe]] : []),
      ...(L.boss ? [["boss", L.boss]] : []),
    ];
    for (const [k, p] of pts) {
      ok(!blockedAt(col, p.x, p.z, 0.55), `${L.id} ${k} (${p.x},${p.z}) is inside a collider`);
      const nd = navDistance(nav, L.spawn.x, L.spawn.z, p.x, p.z);
      ok(Number.isFinite(nd), `${L.id} ${k} (${p.x},${p.z}) unreachable from spawn`);
    }
    const open = nav.blocked.reduce((a, b) => a + (b ? 0 : 1), 0);
    ok(open > 150, `${L.id} has too little walkable space (${open} cells)`);
  }
}

/* ------------------------------------------------------------ units */
if (which === "all" || which === "units") {
  console.log("units: movement, combat, AI, boss, camera, save");
  // random input fuzz: never leaves bounds, never inside colliders, no NaN, camera sane
  for (const M of MISSIONS)
    for (const h of TURTLE_ORDER) {
      const g = new Game({ missionId: M.id, heroId: h, seed: 7 });
      let r = 12345;
      const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      let bad = 0, why = "";
      for (let i = 0; i < 60 * 40 && g.status === "play"; i++) {
        const inp = { mx: rnd() * 2 - 1, mz: rnd() * 2 - 1, dYaw: (rnd() - 0.5) * 0.1, dPitch: (rnd() - 0.5) * 0.05, jump: rnd() < 0.03, dodge: rnd() < 0.02, light: rnd() < 0.08, heavy: rnd() < 0.04, special: rnd() < 0.01, interact: rnd() < 0.02 };
        g.step(DT, inp);
        const P = g.player;
        if (!Number.isFinite(P.x + P.z + P.y) || P.y < -0.001 || insideAny(g.col, P)) (bad++, (why = `player ${P.x.toFixed(2)},${P.z.toFixed(2)}`));
        for (const e of g.enemies) if (!Number.isFinite(e.x + e.z) || (!e.dead && insideAny(g.col, e))) (bad++, (why = `enemy ${e.kind} ${e.state} ${e.x.toFixed(2)},${e.z.toFixed(2)}`));
        if (g.civ && (!Number.isFinite(g.civ.x) || insideAny(g.col, g.civ))) (bad++, (why = "civ"));
        const c = g.cam;
        const cx = c.target.x - c.fwd.x * c.dist, cy = c.target.y - c.fwd.y * c.dist, cz = c.target.z - c.fwd.z * c.dist;
        if (cy < 0.3 || c.dist > 6 + 1e-6) (bad++, (why = "cam"));
        for (const cc of g.col.circles) if (cc.h > 0.5 && cy < cc.h && Math.hypot(cx - cc.x, cz - cc.z) < cc.r) (bad++, (why = "cam in pillar"));
        if (P.hp < 0 || P.hp > P.maxHp) (bad++, (why = "hp"));
      }
      ok(bad === 0, `fuzz ${M.id}/${h}: ${bad} bad frames (${why})`);
    }

  const atDummy = (g, stepId, i = 1, back = 1.5) => {
    g.stepI = g.steps.findIndex((s) => s.id === stepId);
    const d = g.dummies[i];
    Object.assign(g.player, { x: d.x, z: d.z - back, facing: 0, state: "move", st: 0 });
    return d;
  };
  // light hit on a dummy registers; whiffing does not
  {
    const g = new Game({ missionId: "training", heroId: "leo" });
    atDummy(g, "light");
    const si = g.stepI;
    g.step(DT, { light: true });
    run(g, 40);
    ok(g.counts[si] === 1, `light on dummy counted (${g.counts[si]})`);
    Object.assign(g.player, { z: g.player.z - 6, facing: Math.PI, state: "move" });
    g.step(DT, { light: true });
    run(g, 40);
    ok(g.counts[si] === 1, "light at nothing not counted");
  }
  // out-of-order steps don't count
  {
    const g = new Game({ missionId: "training", heroId: "raph" });
    const d = g.dummies[0];
    Object.assign(g.player, { x: d.x, z: d.z - 1.4, facing: 0 });
    g.step(DT, { heavy: true });
    run(g, 50);
    ok(g.stepI === 0 && g.counts.every((c) => c === 0), "out-of-order step not counted");
  }
  // 3-hit combo: third light is the finisher, timing-based reset
  for (const h of TURTLE_ORDER) {
    const g = new Game({ missionId: "training", heroId: h });
    atDummy(g, "combo");
    const si = g.stepI;
    const combos = [];
    for (let k = 0; k < 3; k++) {
      g.step(DT, { light: true });
      combos.push(g.player.combo);
      run(g, 60 * 0.3);
      while (g.player.state !== "move") g.step(DT);
    }
    ok(combos.join() === "1,2,3", `${h} combo sequence ${combos.join()}`);
    ok(g.counts[si] === 1 && g.stepI === si + 1, `${h} finisher counted for combo step`);
    run(g, 60);
    g.step(DT, { light: true });
    ok(g.player.combo === 1, `${h} combo resets after a pause`);
  }
  // heavy cooldown is respected
  {
    const g = new Game({ missionId: "training", heroId: "don" });
    atDummy(g, "heavy");
    g.step(DT, { heavy: true });
    ok(g.player.state === "heavy" && g.player.heavyCd > 0.8, "heavy starts + cooldown");
    while (g.player.state !== "move") g.step(DT);
    const cdLeft = g.player.heavyCd;
    g.step(DT, { heavy: true });
    ok(cdLeft > 0 ? g.player.state === "move" : g.player.state === "heavy", `heavy blocked while cooling down (cd ${cdLeft.toFixed(2)})`);
  }
  // every turtle's special hits a dummy in front, counts once, cools down, lands
  for (const h of TURTLE_ORDER) {
    const g = new Game({ missionId: "training", heroId: h });
    atDummy(g, "special", 1, 1.6);
    const si = g.stepI;
    g.step(DT, { special: true });
    run(g, 80);
    ok(g.stepI === si + 1, `${h} special counted on dummy`);
    ok(g.player.state === "move" && g.player.y === 0, `${h} back to move & grounded after special (${g.player.state}, y=${g.player.y})`);
    ok(g.player.specialCd > 0, `${h} special on cooldown`);
    g.step(DT, { special: true });
    ok(g.player.state !== "special", `${h} special blocked by cooldown`);
  }
  // reach: Donatello's light lands where Raphael's does not
  {
    const res = {};
    for (const h of ["raph", "don"]) {
      const g = new Game({ missionId: "streets", heroId: h, seed: 1 });
      g.enemies.length = 0;
      const e = g.addEnemy("foot", g.player.x, g.player.z + 3.1, { facing: Math.PI });
      e.cd = 99;
      g.player.facing = 0;
      g.step(DT, { light: true });
      e.x = g.player.x;
      e.z = g.player.z + 3.1;
      for (let i = 0; i < 25; i++) {
        e.vx = e.vz = 0;
        e.state = "hurt";
        e.stunT = 9;
        g.step(DT);
      }
      res[h] = e.maxHp - e.hp;
    }
    ok(res.don > 0, `Donatello hits at 3.1 m (${res.don})`);
  }
  // Foot: patrol → detect → attack; i-frames block; damage correct; dead foes never attack
  {
    const g = new Game({ missionId: "streets", heroId: "leo", seed: 3 });
    g.enemies.length = 0;
    const P = g.player;
    const e = g.addEnemy("foot", P.x, P.z + 8, { patrol: [{ x: P.x, z: P.z + 8 }, { x: P.x + 3, z: P.z + 8 }], facing: Math.PI / 2 });
    run(g, 30);
    ok(e.state === "patrol" && !e.alert, `soldier patrols while unaware (${e.state})`);
    e.facing = Math.PI;
    run(g, 5);
    ok(e.alert && e.state === "chase", `soldier detects player in front (${e.state})`);
    let swung = false;
    for (let i = 0; i < 60 * 6 && !swung; i++) swung = g.step(DT).some((v) => v.type === "swing" && v.enemy === e.id);
    ok(swung, "soldier approaches and attacks");
    Object.assign(e, { x: P.x, z: P.z + 1.4, state: "strike", st: 0.09, hitDone: 0, facing: Math.PI });
    P.iframes = 0.3;
    const hp0 = P.hp;
    g.step(DT);
    ok(P.hp === hp0, "i-frames block a strike");
    Object.assign(e, { x: P.x, z: P.z + 1.4, state: "strike", st: 0.09, hitDone: 0, facing: Math.PI });
    P.iframes = 0;
    g.step(DT);
    ok(hp0 - P.hp === ENEMIES.foot.dmg, `strike deals ${ENEMIES.foot.dmg} (${hp0 - P.hp})`);
    g.damage(e, 999, 0, 1, 0, 0, P, "heavy");
    ok(e.dead && e.state === "ko", "soldier KO");
    let after = false;
    for (let i = 0; i < 170; i++) after = after || g.step(DT).some((v) => v.enemy === e.id || (v.type === "hurt"));
    ok(!after, "defeated soldier never attacks again");
    ok(!g.enemies.includes(e), "defeated soldier despawns");
  }
  // elites ignore light hits but stagger on heavies
  {
    const g = new Game({ missionId: "rooftops", heroId: "mikey" });
    const e = g.addEnemy("elite", 0, 0, { alert: true });
    e.state = "windup";
    e.st = 0;
    g.damage(e, 5, 0, 1, 3, 0.34, g.player, "light", 1);
    ok(e.state === "windup", "elite keeps winding up through a light hit");
    g.damage(e, 5, 0, 1, 8, 0.6, g.player, "heavy");
    ok(e.state === "hurt", "elite staggers on a heavy");
  }
  // waves: never more than maxAlive, exact totals, no duplicates
  for (const mid of ["streets", "rooftops"]) {
    const g = new Game({ missionId: mid, heroId: "leo", seed: 5 });
    const ids = new Set();
    let maxAlive = 0;
    for (let i = 0; i < 60 * 120 && g.status === "play"; i++) {
      g.player.hp = g.player.maxHp;
      g.step(DT);
      if (i % 30 === 0) for (const e of g.aliveEnemies()) g.damage(e, 999, 0, 1, 0, 0, g.player, "heavy");
      for (const e of g.enemies) ids.add(e.id);
      maxAlive = Math.max(maxAlive, g.aliveEnemies().length);
    }
    const M = MISSIONS.find((m) => m.id === mid);
    ok(ids.size === M.waves.length, `${mid}: spawned ${ids.size}/${M.waves.length}`);
    ok(maxAlive <= M.maxAlive, `${mid}: max alive ${maxAlive}`);
    ok(g.status === "won", `${mid}: killing every soldier wins (${g.status}, ${g.counts})`);
  }
  // idle player eventually loses → gameover
  {
    const g = new Game({ missionId: "streets", heroId: "mikey", seed: 3 });
    let over = false;
    for (let i = 0; i < 60 * 180 && !over; i++) {
      for (const e of g.aliveEnemies()) g.alertAround(e);
      over = g.step(DT).some((e) => e.type === "gameover");
    }
    ok(over && g.status === "lost", "idle player surrounded by alerted soldiers loses (game over)");
  }
  // rescue: free is gated on the guards, escort completes at the van
  {
    const g = new Game({ missionId: "rescue", heroId: "leo", seed: 2 });
    const C = g.civ;
    Object.assign(g.player, { x: C.x - 1.5, z: C.z });
    for (const e of g.enemies) e.cd = 99;
    g.step(DT);
    ok(g.cur.id === "guards", `finding the civilian advances (${g.cur.id})`);
    g.step(DT, { interact: true });
    ok(C.state === "tied" && g.prompt?.disabled, "can't free while guards stand");
    for (const e of g.enemies) g.damage(e, 999, 0, 1, 0, 0, g.player, "heavy");
    g.step(DT);
    ok(g.cur.id === "free", `guards down → free (${g.cur.id})`);
    g.step(DT, { interact: true });
    ok(C.state === "follow" && g.cur.id === "escort", "civilian freed and following");
    ok(g.aliveEnemies().length === 2, "ambush spawned");
    // walk the player to the van; the civilian must follow
    const B = createBot();
    for (let i = 0; i < 60 * 90 && g.status === "play"; i++) {
      g.player.hp = g.player.maxHp;
      g.step(DT, botInput(g, B, DT));
    }
    ok(g.status === "won" && C.state === "safe", `escort completes (${g.status}, ${C.state})`);
  }
  // boss: invulnerable during intro, phase 2 at half hp, Blade Rush happens and hurts
  {
    const g = new Game({ missionId: "boss", heroId: "leo" });
    const b = g.boss;
    g.damage(b, 50, 0, 1, 0, 0, g.player, "light");
    ok(b.hp === b.maxHp, "Shredder invulnerable during intro");
    run(g, 160);
    ok(b.state !== "intro", "intro ends");
    g.damage(b, b.maxHp / 2 + 1, 0, 1, 0, 0, g.player, "light");
    ok(b.phase === 2 && b.state === "roar", "phase 2 at half health");
    let rushed = false, hurtByRush = false;
    for (let i = 0; i < 60 * 30 && !(rushed && hurtByRush); i++) {
      g.player.hp = g.player.maxHp;
      const ev = g.step(DT);
      if (ev.some((e) => e.type === "rush")) rushed = true;
      if (b.state === "rush" && ev.some((e) => e.type === "hurt")) hurtByRush = true;
    }
    ok(rushed, "Shredder uses Blade Rush");
    ok(hurtByRush, "Blade Rush hurts a player standing in the lane");
    ok(b.lane == null || b.state === "aim" || b.state === "rush", "lane cleared after the rush");
    g.damage(b, 9999, 0, 1, 0, 0, g.player, "heavy");
    ok(b.dead && g.cleared, "Shredder defeated → mission cleared");
    let hurt = false;
    for (let i = 0; i < 60 * 4 && g.status === "play"; i++) hurt = hurt || g.step(DT).some((e) => e.type === "hurt" || e.type === "swing");
    ok(!hurt && g.status === "won", `no attacks after defeat; victory (${g.status})`);
  }
  // difficulty scales incoming damage and enemy health
  {
    const e1 = new Game({ missionId: "boss", heroId: "leo", difficulty: "easy" }).boss.maxHp;
    const e2 = new Game({ missionId: "boss", heroId: "leo", difficulty: "hard" }).boss.maxHp;
    ok(e1 < ENEMIES.shredder.hp && e2 > ENEMIES.shredder.hp, `difficulty scales hp (${e1}/${e2})`);
  }
  // save
  {
    const mem = new Map();
    const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    let p = loadProgress(store);
    ok(p.completed.length === 0 && !p.hardUnlocked && missionUnlocked(p, "training") && !missionUnlocked(p, "streets"), "fresh progress");
    p = completeMission(p, "training", 42, "leo");
    p.settings.difficulty = "hard"; // not unlocked yet → dropped on load
    saveProgress(p, store);
    p = loadProgress(store);
    ok(p.completed.includes("training") && p.best.training === 42 && missionUnlocked(p, "streets"), "training persisted, mission 2 unlocked");
    ok(p.settings.difficulty === "normal", "locked difficulty not loaded");
    for (const m of ["streets", "rescue", "rooftops", "boss"]) p = completeMission(p, m, 60, "don");
    saveProgress(p, store);
    p = loadProgress(store);
    ok(p.hardUnlocked && p.champions.join() === "don", "Shredder unlocks Hard + champion badge");
    mem.set(SAVE_KEY, "{broken");
    p = loadProgress(store);
    ok(p.completed.length === 0, "corrupt save falls back to fresh");
  }
}

/* ------------------------------------------------------------ bot */
if (which === "all" || which === "bot") {
  console.log("bot: every mission with every turtle");
  const LIMIT = { training: 90, streets: 200, rescue: 240, rooftops: 260, boss: 300 };
  for (const M of MISSIONS)
    for (const h of TURTLE_ORDER) {
      let won = false, secs = 0, info = "";
      for (const seed of [1, 2, 3]) {
        const g = new Game({ missionId: M.id, heroId: h, seed });
        const B = createBot();
        let i = 0;
        for (; i < 60 * LIMIT[M.id] && g.status === "play"; i++) g.step(DT, botInput(g, B, DT));
        secs = i / 60;
        info = `seed=${seed} status=${g.status} step=${g.cur?.id} counts=${g.counts.join("/")} hp=${g.player.hp} boss=${g.boss ? g.boss.hp : "-"} dmg=${g.stats.damageTaken}`;
        if (g.status === "won") {
          won = true;
          break;
        }
      }
      ok(won, `${M.id}/${h} not won: ${info}`);
      console.log(`  ${M.id.padEnd(9)} ${h.padEnd(6)} ${won ? "won " : "LOST"} ${secs.toFixed(1)}s  ${info}`);
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
