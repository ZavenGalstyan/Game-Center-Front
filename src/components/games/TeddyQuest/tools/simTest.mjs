/**
 * Core rule checks for Teddy Quest (headless, no browser):
 *   node src/components/games/TeddyQuest/tools/simTest.mjs [core|save|camera|all]
 * core   — jump height, walking/falling through floors, step-up, movers carry,
 *          crumbles, springs, sand, spikes, enemies (swipe / stomp / contact),
 *          checkpoints, respawn, game over + continue, chests, friend cage,
 *          locked portal, completion, boss reset.
 * save   — progress sanitising, best results, unlocks, corrupt data.
 * camera — follows every level's bot run and counts frames where a platform
 *          or wall blocks the line between the camera and the bear.
 */
import { Game, PHYS, MAX_STEP } from "../engine/game.js";
import { buildLevel } from "../data/build.js";
import { getLevel, LEVEL_COUNT } from "../data/levels.js";
import { sanitize, recordResult, defaultProgress, totals, levelUnlocked } from "../engine/save.js";
import { createCamera, snapCamera, updateCamera, rayBoxes } from "../engine/camera.js";
import { createBot } from "./bot.mjs";

const which = process.argv[2] || "all";
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
};
const run = (g, secs, inp = {}) => {
  const evs = [];
  for (let i = 0; i < Math.round(secs * 60); i++) evs.push(...g.frame(1 / 60, typeof inp === "function" ? inp(g, i) : inp));
  return evs;
};
const flat = (author, extra = {}) => buildLevel({ id: 99, name: "test", world: 1, theme: "valley", ...extra }, author);

if (which === "core" || which === "all") {
  console.log("core");
  // jump height & airtime on a flat floor
  {
    const g = new Game(flat((b) => b.start(30, 10).goal()));
    let top = 0;
    run(g, 1.2, (gg, i) => {
      top = Math.max(top, gg.player.y);
      return { jump: i === 0, jumpHeld: true };
    });
    ok(top > 1.95 && top < 2.2, `full jump apex ${top.toFixed(2)} ≈ 2.05`);
    ok(g.player.grounded && Math.abs(g.player.y) < 1e-6, "lands exactly on the floor");
    const g2 = new Game(flat((b) => b.start(30, 10).goal()));
    let top2 = 0;
    run(g2, 1, (gg, i) => {
      top2 = Math.max(top2, gg.player.y);
      return { jump: i === 0, jumpHeld: i < 3 };
    });
    ok(top2 < 1.2, `short hop when released early (${top2.toFixed(2)})`);
  }
  // never through the floor: fall from high with max speed, many frame sizes
  for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.05]) {
    const g = new Game(flat((b) => b.start(10, 10).goal()));
    g.player.y = 40;
    for (let i = 0; i < 400; i++) g.frame(dt, {});
    ok(g.player.y === 0 && g.player.grounded, `fall from 40 m at dt=${dt.toFixed(3)} lands on floor (y=${g.player.y.toFixed(3)})`);
  }
  // walls block, low ledges step up, sprint is faster
  {
    const g = new Game(flat((b) => b.start(8, 6).pad(6, { dy: 1.5 }).pad(6, { dy: 0.3 }).goal()));
    run(g, 3, { mz: 1 });
    ok(g.player.y === 0 && g.player.z < 8, `1.5 m wall stops walking (z=${g.player.z.toFixed(2)})`);
    const g2 = new Game(flat((b) => b.start(8, 6).pad(8, { dy: 0.3 }).goal()));
    run(g2, 2.5, { mz: 1 });
    ok(Math.abs(g2.player.y - 0.3) < 1e-6, "0.3 m ledge is stepped up automatically");
    const a = new Game(flat((b) => b.start(40, 6).goal()));
    const c = new Game(flat((b) => b.start(40, 6).goal()));
    run(a, 2, { mz: 1 });
    run(c, 2, { mz: 1, sprint: true });
    ok(c.player.z > a.player.z * 1.4, `sprint is faster (${a.player.z.toFixed(1)} vs ${c.player.z.toFixed(1)})`);
  }
  // pit: fall costs one heart and respawns at the start / checkpoint
  {
    const g = new Game(flat((b) => b.start(4, 4).pad(4, { gap: 6 }).goal()));
    const evs = run(g, 5, (gg) => ({ mz: gg.status === "play" && gg.stats.falls === 0 ? 1 : 0 }));
    ok(evs.some((e) => e.type === "fall"), "walking off the edge falls");
    ok(evs.some((e) => e.type === "respawn") && g.player.hp === 2 && g.status === "play", `respawned with 2 hearts (hp ${g.player.hp})`);
    ok(Math.hypot(g.player.x, g.player.z) < 0.01, "respawn at the start point");
  }
  // checkpoint activates and becomes the respawn point
  {
    const g = new Game(flat((b) => b.start(4, 4).pad(6).checkpoint(-3).pad(3, { gap: 8 }).goal()));
    let cp = false;
    run(g, 6, (gg) => {
      if (gg.frameEvents?.some((e) => e.type === "checkpoint")) cp = true;
      return { mz: 1 };
    });
    ok(cp, "checkpoint touched");
    ok(g.player.z > 5 && g.player.z < 8.5, `respawn at checkpoint (z=${g.player.z.toFixed(2)})`);
  }
  // game over after three falls, continue gives full health
  {
    const g = new Game(flat((b) => b.start(3, 4).pad(4, { gap: 9 }).goal()));
    let over = false;
    for (let i = 0; i < 60 * 30 && !over; i++) {
      g.frame(1 / 60, { mz: 1 });
      if (g.status === "over") over = true;
    }
    ok(over, "three falls → game over");
    g.continueFromCheckpoint();
    ok(g.status === "play" && g.player.hp === 3, "continue → full health, playing");
  }
  // moving platform carries the bear, never drops it
  {
    const g = new Game(flat((b) => b.start(4, 4).mover(6, { period: 4 }).pad(4, { gap: 0.7 }).goal()));
    const m = g.movers[0];
    g.player.x = (m.x0 + m.x1) / 2;
    g.player.z = (m.z0 + m.z1) / 2;
    g.player.y = m.y1 + 0.5;
    let off = 0, rel = null, drift = 0;
    for (let i = 0; i < 60 * 8; i++) {
      g.frame(1 / 60, {});
      if (g.player.grounded && g.player.ground !== m) off++;
      if (g.player.ground === m) {
        const r = g.player.z - (m.z0 + m.z1) / 2;
        if (rel === null) rel = r;
        drift = Math.max(drift, Math.abs(r - rel));
      }
    }
    ok(off === 0 && g.status === "play", "rider stays on the moving platform for two full trips");
    ok(rel !== null && drift < 0.02, `rider moves with the platform (drift ${drift.toFixed(3)} m)`);
  }
  // elevator going down keeps the bear grounded (no fall state flicker)
  {
    const g = new Game(flat((b) => b.start(4, 4).elevator(3, { period: 4 }).pad(4, { gap: 0.7 }).goal()));
    const m = g.movers[0];
    g.player.x = (m.x0 + m.x1) / 2;
    g.player.z = (m.z0 + m.z1) / 2;
    g.player.y = m.y1;
    let air = 0;
    for (let i = 0; i < 60 * 8; i++) {
      g.frame(1 / 60, {});
      if (!g.player.grounded) air++;
    }
    ok(air < 3, `elevator rider grounded all the way (${air} airborne frames)`);
  }
  // crumble falls after standing, comes back later
  {
    const g = new Game(flat((b) => b.start(4, 4).crumbles(1, 1, 3).pad(6, { gap: 1 }).goal()));
    const cb = g.crumbles[0];
    g.player.x = (cb.x0 + cb.x1) / 2;
    g.player.z = (cb.z0 + cb.z1) / 2;
    g.player.y = cb.y1;
    const evs = run(g, 1.5, {});
    ok(evs.some((e) => e.type === "crumble") && cb.fallen, "crumbling stone breaks under the bear");
    run(g, 4, {});
    ok(!cb.fallen && cb.solid, "crumbling stone returns");
  }
  // spring
  {
    const g = new Game(flat((b) => b.start(8, 6).spring(-4, 0).goal()));
    let top = 0;
    run(g, 2, (gg) => {
      top = Math.max(top, gg.player.y);
      return { mz: gg.player.z < 3.9 ? 1 : 0 };
    });
    ok(top > 4, `spring launches high (${top.toFixed(1)} m)`);
  }
  // quicksand sinks a bear that stands still
  {
    const g = new Game(flat((b) => b.start(4, 4).pad(6, { surface: "sand" }).goal()));
    g.player.z = 7;
    const evs = run(g, 4, {});
    ok(evs.some((e) => e.type === "fall" && e.kind === "sand"), "standing in sand → sinks");
  }
  // static spikes hurt, jumping over them doesn't
  {
    const g = new Game(flat((b) => b.start(12, 4).spikes(-6, 1).goal()));
    const evs = run(g, 2, { mz: 1 });
    ok(evs.some((e) => e.type === "hurt"), "walking into spikes hurts");
    const g2 = new Game(flat((b) => b.start(12, 4).spikes(-6, 1).goal()));
    const evs2 = run(g2, 2, (gg) => ({ mz: 1, jump: gg.player.z > 4.5 && gg.player.z < 4.8 && gg.player.grounded, jumpHeld: true }));
    ok(!evs2.some((e) => e.type === "hurt"), "jumping over spikes is safe");
  }
  // enemies: swipe kills a patrol, chaser needs two swipes, contact hurts, stomp works
  {
    const g = new Game(flat((b) => b.start(12, 6).patrol().goal()));
    const e = g.enemies[0];
    g.player.x = e.x;
    g.player.z = e.z - 1.2;
    g.enemies[0].speed = 0;
    run(g, 0.5, (gg, i) => ({ attack: i === 0 }));
    ok(!e.alive, "one swipe defeats a Grumblebug");
    const g2 = new Game(flat((b) => b.start(14, 6).chaser().goal()));
    const c = g2.enemies[0];
    g2.player.z = c.z - 1.3;
    g2.player.x = c.x;
    const evs2 = run(g2, 3, (gg) => ({ attack: gg.player.attackCd <= 0 && c.alive }));
    const hits = evs2.filter((x) => x.type === "enemyHit" || x.type === "enemyDie").length;
    ok(!c.alive && hits === 2, `Thornling takes two hits (${hits})`);
    const g3 = new Game(flat((b) => b.start(14, 6).chaser().goal()));
    g3.player.z = 2;
    const evs3 = run(g3, 2.5, {});
    ok(evs3.some((x) => x.type === "enemyAlert") && evs3.some((x) => x.type === "hurt"), "chaser notices, closes in and hurts");
    ok(g3.player.hp === 2 || g3.player.hp === 1, `contact damage respects invulnerability (hp ${g3.player.hp})`);
    const g4 = new Game(flat((b) => b.start(12, 6).patrol().goal()));
    const e4 = g4.enemies[0];
    e4.speed = 0;
    g4.player.x = e4.x;
    g4.player.z = e4.z;
    g4.player.y = 3;
    const evs4 = run(g4, 1, {});
    ok(!e4.alive && evs4.some((x) => x.type === "enemyDie" && x.stomp) && g4.player.hp === 3, "stomping from above defeats without damage");
  }
  // chests, friend cage, locked portal, completion
  {
    const g = new Game(flat((b) => b.start(6, 6).secret("R", { dist: 1 }).pad(8).rescue("Pip", "bunny", -4).goal()));
    ok(!g.portal.open, "portal starts locked in a rescue level");
    const ch = g.chests[0];
    g.player.x = ch.x;
    g.player.z = ch.z;
    run(g, 0.2, {});
    ok(ch.open && g.stats.coins >= 5, "touching a chest opens it (+5 coins)");
    const f = g.friend;
    g.player.x = f.x;
    g.player.z = f.z - 1.2;
    g.player.y = f.y;
    run(g, 1.2, (gg) => ({ attack: gg.player.attackCd <= 0 }));
    ok(f.freed && g.portal.open, "two swipes free the friend and open the portal");
    g.player.x = g.portal.x;
    g.player.z = g.portal.z;
    g.player.y = g.portal.y;
    run(g, 0.2, {});
    ok(g.status === "complete" && g.result && g.result.friend === true, "entering the open portal completes the level");
  }
  // boss: reset on continue, gate closes, damage window
  {
    const L = getLevel(30);
    const g = new Game(L);
    const B = g.boss;
    g.player.x = B.def.cx;
    g.player.z = B.def.cz - 4;
    g.player.y = B.def.y;
    run(g, 0.3, {});
    ok(B.awake && g.boxes[B.def.gate].solid, "boss wakes and the gate closes");
    B.set("stun");
    g.player.x = B.x;
    g.player.z = B.z - 2.2;
    g.player.face = 0;
    g.player.inv = 5;
    run(g, 1.5, (gg) => ({ attack: gg.player.attackCd <= 0 }));
    ok(B.hp === 9 && B.state === "recover", `max 3 hits per window (hp ${B.hp}, state ${B.state})`);
    g.status = "over";
    g.continueFromCheckpoint();
    ok(B.hp === 12 && B.state === "sleep" && !g.boxes[B.def.gate].solid, "continue resets the boss fight");
  }
  // structure of every level: MAX_STEP sanity
  ok(MAX_STEP <= 1 / 120 && PHYS.maxFall * MAX_STEP < 0.4, "sub-step can't skip a 0.4 m floor");
  console.log(`  ${pass} passed, ${fail} failed`);
}

if (which === "save" || which === "all") {
  console.log("save");
  const p0 = defaultProgress();
  ok(p0.unlocked === 1 && levelUnlocked(p0, 1) && !levelUnlocked(p0, 2), "fresh save: only level 1");
  const r = { levelId: 1, coins: 20, coinTotal: 30, chests: 1, chestTotal: 1, time: 100, friend: null };
  let p = recordResult(p0, r);
  ok(p.unlocked === 2 && p.levels[1].coins === 20, "finishing level 1 unlocks level 2");
  p = recordResult(p, { ...r, coins: 10, time: 80 });
  ok(p.levels[1].coins === 20 && p.levels[1].time === 80, "keeps best coins and best time");
  ok(totals(p).coins === 20, "totals use best results");
  const back = sanitize(JSON.parse(JSON.stringify(p)));
  ok(JSON.stringify(back) === JSON.stringify(p), "round-trips through JSON");
  ok(sanitize("garbage").unlocked === 1, "garbage → defaults");
  ok(sanitize({ unlocked: 999 }).unlocked === 30, "clamps unlocked");
  ok(sanitize({ unlocked: 1, levels: { 5: { done: true, coins: -5 } } }).unlocked === 6, "derives unlocks from finished levels");
  ok(sanitize({ levels: { 5: { done: true, coins: -5 } } }).levels[5].coins === 0, "clamps negative coins");
  ok(sanitize({ settings: { sens: 99, touch: "x" } }).settings.sens === 2.5, "clamps settings");
  let p30 = defaultProgress();
  for (let i = 1; i <= 30; i++) p30 = recordResult(p30, { ...r, levelId: i });
  ok(p30.won && p30.unlocked === 30, "beating level 30 marks the game won");
  console.log(`  ${pass} passed, ${fail} failed`);
}

if (which === "camera" || which === "all") {
  console.log("camera (line of sight during each level's bot run)");
  let worst = 0;
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    const L = getLevel(id);
    const g = new Game(L, { god: true });
    const bot = createBot(L.route);
    const cam = createCamera();
    snapCamera(cam, g);
    let frames = 0, blocked = 0, run = 0, maxRun = 0;
    for (let f = 0; f < 60 * 240 && g.status !== "complete"; f++) {
      g.frame(1 / 60, bot(g));
      cam.want = g.boss && g.boss.awake ? 9.5 : 7.2;
      updateCamera(cam, g, 1 / 60);
      if (g.status !== "play") continue;
      frames++;
      const p = g.player;
      const hx = p.x, hy = p.y + 0.9, hz = p.z;
      const dx = cam.x - hx, dy = cam.y - hy, dz = cam.z - hz;
      const d = Math.hypot(dx, dy, dz);
      const hit = rayBoxes(g.boxes, hx, hy, hz, dx / d, dy / d, dz / d, d);
      if (hit < d - 0.1) {
        blocked++;
        run++;
        maxRun = Math.max(maxRun, run);
      } else run = 0;
    }
    const pct = (100 * blocked) / Math.max(1, frames);
    worst = Math.max(worst, pct);
    ok(pct < 2 && maxRun < 45, `L${id} bear hidden ${pct.toFixed(1)}% of frames (longest ${maxRun} frames)`);
  }
  console.log(`  worst level: ${worst.toFixed(2)}% blocked`);
  console.log(`  ${pass} passed, ${fail} failed`);
}
process.exit(fail ? 1 : 0);
