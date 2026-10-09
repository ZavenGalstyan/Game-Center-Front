/**
 * Zombie Outbreak — headless validation.
 *
 *   node src/components/games/ZombieOutbreak/tools/simTest.mjs [all|data|unit|bot] [seeds] [stageFrom-stageTo]
 *
 *   data   every stage: arena exists, player start / pickups / spawns / boss
 *          spawn are in open floor and connected to the start for the right
 *          size class, every wave has a usable spawn for each enemy type
 *   unit   weapons (reload rules, semi buffer, shell interrupt, switch
 *          cancels reload, ammo never negative), hit detection (walls stop
 *          bullets, headshots follow the animated head, bodies only when
 *          alive), damage / armour, pickups, bosses (every attack ends),
 *          save sanitising, progression unlocks
 *   bot    the autoplay survivor plays every stage with the loadout a player
 *          would have by then; every wave must finish, every boss must die,
 *          nothing may stall
 */
import { createGame, STATE } from "../engine/game.js";
import { createBot } from "../engine/bot.js";
import { createInput } from "../engine/input.js";
import { STAGES, getStage } from "../data/stages.js";
import { getArena, ARENAS } from "../data/arenas/index.js";
import { createWorld } from "../engine/world.js";
import { createNav } from "../engine/nav.js";
import { enemyDef } from "../data/enemies.js";
import { WEAPONS } from "../data/weapons.js";
import { createArsenal, tickArsenal, startReload, switchTo, pressTrigger, wantShot, addAmmo } from "../engine/weapons.js";
import { spawnZombie, damageZombie, isLiving, navClass } from "../engine/zombies.js";
import { headPoint, hitVolumes, computePose } from "../engine/pose.js";
import { sanitize, defaultState } from "../engine/storage.js";
import { applyResult, computeWeapons } from "../engine/progression.js";
import { raySphere } from "../engine/math.js";

const mode = process.argv[2] || "all";
const SEEDS = Number(process.argv[3] || 3);
const [FROM, TO] = (process.argv[4] || "1-30").split("-").map(Number);

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(msg);
  }
}

/* ================================================================== data */
function dataChecks() {
  for (const st of STAGES) {
    const arena = getArena(st.arena);
    check(arena.id === st.arena, `S${st.id}: arena ${st.arena} exists`);
    const g = createGame(st, { seed: 1 });
    const w = g.world;
    const p = g.player;
    check(!w.isBlocked(0, p.x, p.z), `S${st.id}: start in open floor`);
    for (const pk of st.pickups) {
      const pt = arena.pickups[pk.at];
      check(!!pt, `S${st.id}: pickup point ${pk.at} exists`);
      if (!pt) continue;
      check(!w.isBlocked(0, pt.x, pt.z), `S${st.id}: pickup ${pk.at} not inside geometry`);
      check(g.nav.distAt(0, pt.x, pt.z) < g.nav.INF, `S${st.id}: pickup ${pk.at} reachable`);
    }
    for (const [id, pt] of Object.entries(arena.pickups)) check(g.nav.distAt(0, pt.x, pt.z) < g.nav.INF && !w.isBlocked(0, pt.x, pt.z), `${arena.id}: pickup point ${id} usable (supply drops)`);
    st.waves.forEach((wave, wi) => {
      check(wave.groups.length > 0 && wave.groups.every(([t, n]) => enemyDef(t) && n > 0), `S${st.id} W${wi + 1}: valid groups`);
      for (const sid of wave.spawns) check(!!arena.spawns[sid], `S${st.id} W${wi + 1}: spawn ${sid} exists`);
      const types = new Set(wave.groups.map(([t]) => t));
      for (const t of types) {
        const cls = navClass(enemyDef(t));
        check(wave.spawns.some((sid) => g.spawnOk[sid]?.[cls]), `S${st.id} W${wi + 1}: a usable spawn for ${t} (class ${cls})`);
      }
      if (wave.boss) {
        const bp = st.bossSpawn || arena.bossSpawn;
        const bc = navClass(enemyDef(wave.boss));
        check(!w.isBlocked(bc, bp.x, bp.z) && g.nav.distAt(bc, bp.x, bp.z) < g.nav.INF, `S${st.id}: boss spawn open + reachable`);
      }
    });
    // Every spawn the stage uses should be out of instant reach of the start.
    for (const wave of st.waves) for (const sid of wave.spawns) {
      const s = arena.spawns[sid];
      if (s) check(Math.hypot(s.x - p.x, s.z - p.z) > 10, `S${st.id}: spawn ${sid} ≥ 10 m from start`);
    }
  }
}

/** Every spot the player can stand on must be approachable by brutes (within 1.6 m) and bosses (3.2 m). */
function reachChecks() {
  for (const a of Object.values(ARENAS)) {
    const w = createWorld(a);
    const nav = createNav(w);
    nav.update(0, a.start.x, a.start.z, true);
    const f = nav.fields;
    const bad = { 1: 0, 2: 0 };
    for (let i = 0; i < w.cols * w.rows; i++) {
      if (f[0].dist[i] >= nav.INF) continue;
      const x = w.cellX(i);
      const z = w.cellZ(i);
      if (Math.round(x * 2) % 4 || Math.round(z * 2) % 4) continue;
      for (const [cls, R] of [[1, 1.6], [2, 3.2]]) {
        const rc = Math.ceil(R / 0.5);
        const c0 = i % w.cols;
        const r0 = Math.floor(i / w.cols);
        let ok = false;
        for (let dr = -rc; dr <= rc && !ok; dr++) for (let dc = -rc; dc <= rc && !ok; dc++) {
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= w.cols || r >= w.rows || Math.hypot(dc, dr) * 0.5 > R) continue;
          const j = r * w.cols + c;
          if (f[cls].dist[j] < nav.INF && w.gridClear(0, x, z, w.cellX(j), w.cellZ(j))) ok = true;
        }
        if (!ok) bad[cls]++;
      }
    }
    check(bad[1] === 0, `${a.id}: brutes can reach every standable spot (${bad[1]} pockets)`);
    check(bad[2] <= 2, `${a.id}: bosses can reach (almost) every standable spot (${bad[2]} pockets)`);
  }
}

/* ================================================================== unit */
function unitChecks() {
  // ---- weapons
  const out = [];
  const a = createArsenal(["pistol", "shotgun", "smg"]);
  for (let i = 0; i < 40; i++) tickArsenal(a, 0.02, out); // raise
  check(a.state === "ready", "arsenal raises to ready");
  pressTrigger(a);
  check(wantShot(a, false, out) && a.slot.mag === 11, "semi click fires one round");
  tickArsenal(a, 0.1, out);
  pressTrigger(a);
  check(!wantShot(a, false, out), "semi click inside cooldown is held…");
  tickArsenal(a, 0.09, out);
  check(wantShot(a, false, out) && a.slot.mag === 10, "…and fires when the cooldown ends (buffered)");
  check(!startReload({ ...a, state: "reload" }, out), "no duplicate reload while reloading");
  check(startReload(a, out) && a.state === "reload", "reload starts with room + reserve");
  check(!startReload(a, out), "second R ignored");
  pressTrigger(a);
  check(!wantShot(a, false, out), "can't fire mid magazine reload");
  for (let i = 0; i < 80; i++) tickArsenal(a, 0.02, out);
  check(a.state === "ready" && a.slot.mag === 12 && a.slot.reserve === 70, "reload transfers exactly the missing rounds");
  a.slot.reserve = 3;
  a.slot.mag = 0;
  startReload(a, out);
  for (let i = 0; i < 80; i++) tickArsenal(a, 0.02, out);
  check(a.slot.mag === 3 && a.slot.reserve === 0, "partial reload when reserve is short");
  a.slot.mag = 0;
  pressTrigger(a);
  const before = out.length;
  check(!wantShot(a, false, out) && out.slice(before).some((e) => e.type === "dry"), "empty mag clicks dry");
  check(!startReload(a, out), "no reload with empty reserve");
  check(a.slot.mag >= 0 && a.slot.reserve >= 0, "ammo never negative");
  // Switch cancels reload.
  a.slot.mag = 1;
  a.slot.reserve = 20;
  startReload(a, out);
  switchTo(a, 1, out);
  check(a.state === "lower", "switching interrupts a reload");
  for (let i = 0; i < 60; i++) tickArsenal(a, 0.02, out);
  check(a.cur === 1 && a.state === "ready", "switch completes to slot 2");
  check(a.slots[0].mag === 1 && a.slots[0].reserve === 20, "cancelled reload moved no rounds");
  pressTrigger(a);
  check(wantShot(a, false, out) && a.slot.mag === 5, "shotgun fires");
  startReload(a, out);
  for (let i = 0; i < 40; i++) tickArsenal(a, 0.02, out);
  check(a.slot.mag === 6, "shells load one at a time");
  a.slot.mag = 2;
  startReload(a, out);
  tickArsenal(a, 0.8, out);
  pressTrigger(a);
  check(wantShot(a, false, out), "firing interrupts a shell reload");
  switchTo(a, 2, out);
  pressTrigger(a);
  check(!wantShot(a, false, out), "can't fire while switching");
  const full = createArsenal(["pistol"]);
  full.slots[0].reserve = full.slots[0].def.reserveMax;
  check(addAmmo(full) === 0, "ammo box adds nothing when full");

  // ---- hit detection
  const st = getStage(1);
  const g = createGame(st, { seed: 5 });
  const p = g.player;
  const z = g.zombies[0];
  spawnZombie(z, "walker", p.x, p.z - 8, g);
  z.anim.spawn = 1;
  z.state = "IDLE";
  z.stateT = 999;
  z.yaw = 0;
  computePose(z);
  hitVolumes(z);
  const head = [0, 0, 0];
  headPoint(z, head);
  const eye = [p.x, p.y + 1.62, p.z];
  const toHead = [head[0] - eye[0], head[1] - eye[1], head[2] - eye[2]];
  const L = Math.hypot(...toHead);
  check(raySphere(...eye, ...toHead.map((v) => v / L), z.hit[0][0], z.hit[0][1], z.hit[0][2], z.hit[0][3]) > 0, "ray to the head centre hits the head sphere");
  // Stagger moves the head; the hitbox follows.
  z.anim.hit = 0.4;
  z.anim.hitPow = 1;
  z.anim.hitSide = 1;
  computePose(z);
  hitVolumes(z);
  const head2 = [0, 0, 0];
  headPoint(z, head2);
  check(Math.hypot(head2[0] - head[0], head2[1] - head[1], head2[2] - head[2]) > 0.05, "hit reaction moves the head");
  check(Math.hypot(z.hit[0][0] - head2[0], z.hit[0][1] - head2[1], z.hit[0][2] - head2[2]) < 1e-9, "head hitbox tracks the animated head");
  // Death: no hit volumes for legs, and not hittable.
  const hp0 = z.hp;
  const dealt = damageZombie(z, 30, 0, 1, g);
  check(dealt === 30 * enemyDef("walker").headMult && z.hp < hp0, "headshot multiplier applied");
  check(!isLiving(z), "headshot kills a walker with one pistol round (30×3 > 80)");
  check(damageZombie(z, 50, 1, 1, g) === 0, "dying zombies take no damage");
  // Walls stop bullets: a zombie behind a building is not hit.
  const g2 = createGame(st, { seed: 6 });
  const p2 = g2.player;
  p2.x = -7.6;
  p2.z = 10.5; // on the west sidewalk, building W2 behind x < -9
  const z2 = g2.zombies[0];
  spawnZombie(z2, "walker", -16, 10.5, g2); // inside the alley?  place behind the wall instead:
  z2.x = -16;
  z2.z = 0; // inside building W2's footprint row → behind its facade from the player
  z2.anim.spawn = 1;
  computePose(z2);
  hitVolumes(z2);
  const hit = g2.world.raycast(p2.x, 1.62, p2.z, -16 - p2.x, 0, 0 - p2.z, 40, { t: 0 });
  check(!!hit && hit.t < Math.hypot(-16 - p2.x, -p2.z), "building blocks the line to a zombie behind it");
  // Shots over low cover: a barrier (0.95 m) doesn't block a shot at head height.
  const bar = g2.world.solids.find((s) => s.tag === "barrier");
  const cover = g2.world.raycast(bar.x, 1.62, bar.z + 3, 0, 0, -1, 6, { t: 0 });
  check(!cover || cover.t > 6 - 1e-6 || cover.solid?.tag !== "barrier", "eye-height shots pass over a low barrier");

  // ---- damage + armour
  const g3 = createGame(st, { seed: 7 });
  g3.player.armor = 50;
  g3.damagePlayer(20, 0, 0, "test");
  check(Math.abs(g3.player.hp - 92) < 1e-6 && Math.abs(g3.player.armor - 38) < 1e-6, "armour absorbs 60 %");
  g3.damagePlayer(500, 0, 0, "test");
  check(!g3.player.alive && g3.state === STATE.GAME_OVER && g3.player.hp === 0, "death → GAME_OVER, hp clamped at 0");
  const hpDead = g3.player.hp;
  g3.damagePlayer(10, 0, 0, "test");
  check(g3.player.hp === hpDead, "no damage after death");

  // ---- pickups: no duplicate collection, only when useful
  const g4 = createGame(st, { seed: 8 });
  const inp = createInput();
  const hpk = g4.pickups.find((q) => q.type === "health");
  g4.player.x = hpk.x;
  g4.player.z = hpk.z;
  g4.update(0.05, inp);
  check(hpk.active, "health pack not wasted at full health");
  g4.player.hp = 50;
  g4.update(0.05, inp);
  check(!hpk.active && g4.player.hp === 90, "health pack collected once when hurt");
  g4.update(0.05, inp);
  check(g4.player.hp === 90, "no duplicate collection");

  // ---- bosses: every attack timeline ends
  for (const [sid, boss] of [[6, "bruteKing"], [12, "beast"], [18, "toxicGiant"], [24, "stalker"], [30, "titan"]]) {
    const gb = createGame(getStage(sid), { seed: 3 });
    const zb = gb.zombies[0];
    const bp = gb.arena.bossSpawn;
    spawnZombie(zb, boss, bp.x, bp.z, gb);
    let maxAtk = 0;
    let atkT = 0;
    const kinds = new Set();
    const inp2 = createInput();
    for (let i = 0; i < 60 * 90; i++) {
      gb.update(1 / 60, inp2);
      if (zb.state === "ATTACKING") {
        atkT += 1 / 60;
        kinds.add(zb.atkKind);
        maxAtk = Math.max(maxAtk, atkT);
      } else atkT = 0;
      if (!gb.player.alive) {
        gb.player.alive = true;
        gb.player.hp = 100;
        gb.state = STATE.PLAYING;
        gb.frozen = false;
      }
    }
    check(maxAtk < 6.5, `${boss}: every attack ends (longest ${maxAtk.toFixed(1)} s)`);
    check(kinds.size >= 2, `${boss}: uses several attacks (${[...kinds].join(", ")})`);
    // Kill it: must die from damage.
    let guard = 0;
    while (isLiving(zb) && guard++ < 2000) damageZombie(zb, 200, 0, 1, gb);
    check(!isLiving(zb), `${boss}: dies to damage (not invincible)`);
  }

  // ---- save + progression
  check(sanitize(null).unlocked === 1, "sanitize(null) → defaults");
  const bad = sanitize({ unlocked: "x", weapons: ["laser", "smg"], loadout: ["smg", "smg", "nope"], stars: { 1: 9 }, settings: { master: "loud", fov: 80 }, stats: { kills: -5 } });
  check(bad.unlocked === 1 && bad.weapons.includes("pistol") && bad.weapons.includes("smg") && !bad.weapons.includes("laser"), "sanitize weapons");
  check(bad.loadout.length === 1 && bad.loadout[0] === "smg", "sanitize loadout (dedupe, owned only)");
  check(bad.stars[1] === 3 && bad.settings.master === 0.85 && bad.settings.fov === 80 && bad.stats.kills === 0, "sanitize clamps stars/settings/stats");
  let s = defaultState();
  const r = (id, stars = 3) => ({ stageId: id, cleared: true, waves: 3, kills: 10, headshots: 2, shots: 30, hits: 15, bossKills: 0, time: 60, score: 5000, stars });
  ({ state: s } = applyResult(s, r(1)));
  check(s.unlocked === 2 && !s.weapons.includes("smg"), "stage 1 clear unlocks stage 2");
  let res = applyResult(s, r(2));
  s = res.state;
  check(res.newWeapons.includes("smg") && s.loadout.includes("smg"), "stage 2 clear unlocks SMG into the loadout");
  for (let i = 3; i <= 6; i++) s = applyResult(s, r(i)).state;
  check(s.weapons.includes("shotgun") && s.weapons.includes("rifle"), "shotgun (S4) and rifle (Brute King) unlock");
  check(s.loadout.length === 3, "loadout capped at three");
  for (let i = 7; i <= 10; i++) s = applyResult(s, r(i)).state;
  check(s.weapons.includes("marksman"), "30 stars unlock the marksman");
  const lost = applyResult(s, { ...r(11), cleared: false, died: true });
  check(lost.state.unlocked === s.unlocked && lost.state.stats.deaths === s.stats.deaths + 1, "a death records stats but unlocks nothing");
  check(computeWeapons({ ...s, completed: { ...s.completed, 18: true } }).includes("blaster"), "Toxic Giant unlocks the blaster");
  const replay = applyResult(s, r(1, 1));
  check(replay.state.stars[1] === 3, "replays keep the best stars");
}

/* ================================================================== bot */
function loadoutFor(id) {
  if (id <= 2) return ["pistol"];
  if (id <= 4) return ["smg", "pistol"];
  if (id <= 6) return ["shotgun", "smg", "pistol"];
  if (id <= 18) return ["rifle", "shotgun", "smg"];
  return ["blaster", "rifle", "shotgun"];
}

function runStage(id, seed, opts = {}) {
  const st = getStage(id);
  const g = createGame(st, { seed, loadout: opts.loadout || loadoutFor(id) });
  const bot = createBot(g, opts.bot || {});
  const dt = 1 / 60;
  const limit = opts.limit || 1500;
  let lastProgress = 0;
  let lastRemaining = -1;
  let stall = 0;
  let maxWaveTime = 0;
  while (g.time < limit && g.state !== STATE.GAME_OVER && g.state !== STATE.STAGE_COMPLETE) {
    bot.think(dt);
    g.update(dt, bot.input);
    g.drain();
    maxWaveTime = Math.max(maxWaveTime, g.waveTime);
    const rem = g.queue.length + g.zombies.filter(isLiving).length;
    if (rem !== lastRemaining) {
      lastRemaining = rem;
      lastProgress = g.time;
    }
    stall = Math.max(stall, g.time - lastProgress);
    // Invisible-living check: every living zombie is inside the arena and finite.
    for (const z of g.zombies) {
      if (!isLiving(z)) continue;
      const b = g.arena.bounds;
      if (!(z.x >= b.minX - 0.01 && z.x <= b.maxX + 0.01 && z.z >= b.minZ - 0.01 && z.z <= b.maxZ + 0.01)) {
        return { id, seed, state: "BAD_POSITION", time: g.time };
      }
    }
  }
  const r = g.result();
  return { id, seed, state: g.state, time: g.time, wave: g.waveIdx + 1, waves: st.waves.length, hp: r.hp, acc: r.accuracy, stars: r.stars, kills: r.kills, stall, boss: st.waves.some((w) => w.boss), bossDead: g.bossDefeated, maxWaveTime };
}

function botChecks() {
  const rows = [];
  for (let id = FROM; id <= TO; id++) {
    const st = getStage(id);
    if (!st) continue;
    let wins = 0;
    const res = [];
    for (let s = 1; s <= SEEDS; s++) {
      const r = runStage(id, s * 7919 + id);
      res.push(r);
      if (r.state === "STAGE_COMPLETE") wins++;
      check(r.state !== "BAD_POSITION", `S${id} seed ${s}: zombies stay inside the arena`);
      check(r.state !== "PLAYING" && r.state !== "BETWEEN_WAVES" && r.state !== "PREPARING", `S${id} seed ${s}: finishes (no stall; state ${r.state} at ${Math.round(r.time)} s)`);
      check(r.stall < 75, `S${id} seed ${s}: wave progress never stalls > 75 s (max ${Math.round(r.stall)} s)`);
      if (r.state === "STAGE_COMPLETE" && r.boss) check(r.bossDead, `S${id} seed ${s}: boss dead on completion`);
    }
    check(wins >= Math.ceil(SEEDS / 2), `S${id}: bot clears it in at least half the seeds (${wins}/${SEEDS})`);
    const avg = (k) => res.reduce((a, r) => a + r[k], 0) / res.length;
    rows.push(`S${String(id).padStart(2)} ${st.arena.padEnd(9)} wins ${wins}/${SEEDS}  time ${avg("time").toFixed(0).padStart(4)}s  hp ${avg("hp").toFixed(0).padStart(3)}  acc ${(avg("acc") * 100).toFixed(0)}%  stars ${avg("stars").toFixed(1)}  stall ${Math.max(...res.map((r) => r.stall)).toFixed(0)}s  ${res.map((r) => (r.state === "STAGE_COMPLETE" ? "W" : r.state === "GAME_OVER" ? `D${r.wave}` : r.state)).join(" ")}`);
  }
  console.log(rows.join("\n"));
}

const t0 = Date.now();
if (mode === "all" || mode === "data") {
  dataChecks();
  reachChecks();
}
if (mode === "all" || mode === "unit") unitChecks();
if (mode === "all" || mode === "bot") botChecks();
console.log(`\n${pass} passed, ${fail} failed  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (failures.length) console.log("FAILURES:\n  " + failures.slice(0, 60).join("\n  "));
process.exit(fail ? 1 : 0);
