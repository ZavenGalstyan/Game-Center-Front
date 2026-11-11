/**
 * Headless mechanics checks:  node src/components/games/BiohazardEscape/tools/simTest.mjs
 * Builds tiny test levels and asserts the rules the 25 real levels rely on:
 * weapons / ammo / reload, armor, head shots, enemy chase + attack + walls,
 * jumping, hazards, doors + cards, keypads, panels, generator order, beams,
 * ion nodes + recharge, boss shields, checkpoints, upgrades and persistence.
 */
import { createSim } from "../engine/sim.js";
import { WEAPONS, statsFor, xpForRank } from "../engine/constants.js";
import { LEVELS } from "../engine/levels.js";

let pass = 0,
  fail = 0;
const ok = (cond, name) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}`);
  }
};
const STEP = 1 / 60;
const run = (s, secs, inp = {}) => {
  for (let i = 0; i < secs * 60; i++) {
    s.update(STEP, typeof inp === "function" ? inp(s, i) : inp);
    s.events.length > 400 && (s.events = []);
  }
};
const evs = (s, type) => s.events.filter((e) => e.type === type);
const lvl = (map, ents = [], more = {}) => ({ id: 99, zone: 0, name: "T", objective: "", hints: ["", ""], map, ents, startDir: "n", ...more });
const room = ["#########", "#.......#", "#.......#", "#.......#", "#.......#", "#...S...#", "#########"];
const aimAt = (s, x, z, y = 1.2) => {
  const p = s.player;
  return { setYaw: Math.atan2(-(x - p.x), -(z - p.z)), setPitch: Math.atan2(y - 1.62 - p.y, Math.hypot(x - p.x, z - p.z)) };
};

/* ---------------------------------------------------------------- weapons */
{
  const s = createSim(lvl(room), { loadout: { weapons: ["pistol", "rifle", "shotgun", "ion"], ammo: { rifle: 40, shells: 4, cells: 0 } } });
  s.update(STEP, { slot: 1 });
  run(s, 0.5);
  ok(s.player.cur === "pistol", "slot 1 equips the pistol");
  run(s, 0.05, { firePress: true });
  ok(s.player.mags.pistol === WEAPONS.pistol.mag - 1, "pistol fires once per press");
  for (let i = 0; i < 30; i++) run(s, 0.3, { firePress: true });
  ok(s.player.mags.pistol < WEAPONS.pistol.mag, "pistol mag drains");
  s.update(STEP, { reload: true });
  run(s, 1.5);
  ok(s.player.mags.pistol === WEAPONS.pistol.mag, "pistol reload is infinite");
  s.update(STEP, { slot: 2 });
  run(s, 0.5);
  run(s, 1, { fire: true });
  ok(s.player.mags.rifle <= 30 - 9 && s.player.mags.rifle >= 30 - 12, "rifle is automatic (~10 rounds/s)");
  run(s, 5, { fire: true });
  ok(s.player.ammo.rifle < 40, "rifle reloads from reserve when empty");
  s.update(STEP, { slot: 3 });
  run(s, 0.5);
  run(s, 0.05, { fire: true });
  ok(evs(s, "shot").some((e) => e.weapon === "shotgun" && e.to.length === 8), "shotgun fires 8 pellets");
  s.player.mags.shotgun = 0;
  s.player.ammo.shells = 0;
  s.events = [];
  run(s, 1.2, { firePress: true });
  ok(evs(s, "dry").length > 0, "empty shotgun dry-fires");
  s.update(STEP, { slot: 4 });
  run(s, 0.5);
  s.player.mags.ion = 0;
  s.player.ammo.cells = 0;
  run(s, 6.5);
  ok(s.player.ammo.cells >= 2, "Ion Lance recharges itself when almost empty");
}

/* ---------------------------------------------------------------- armor + damage */
{
  const s = createSim(lvl(room), { stats: statsFor({}) });
  s.player.armor = 50;
  s.hurtPlayer(20, null, "melee");
  ok(Math.abs(s.player.hp - 92) < 0.01 && Math.abs(s.player.armor - 38) < 0.01, "armor absorbs 60% of a hit");
  s.player.armor = 0;
  s.hurtPlayer(200, null, "melee");
  ok(s.state === "dead", "lethal damage kills");
  s.respawn();
  ok(s.state === "play" && s.player.hp === s.player.maxHp, "respawn restores full health");
}

/* ---------------------------------------------------------------- enemies */
{
  const L = lvl(room, [{ id: "z", t: "enemy", kind: "worker", at: [4, 1], face: "s" }]);
  const s = createSim(L, { loadout: { weapons: ["pistol"], ammo: {} } });
  run(s, 1);
  ok(s.enemies[0].state === "chase", "an enemy that sees you chases");
  const hp0 = s.player.hp + s.player.armor;
  run(s, 4);
  ok(s.player.hp + s.player.armor < hp0, "enemies attack in melee");
  const en = s.enemies[0];
  let head = false,
    t = 0;
  while (!en.dead && t++ < 400) {
    s.update(STEP, { ...aimAt(s, en.x, en.z, 1.6), firePress: true });
    for (const e of s.events) if (e.type === "enemyHurt" && e.crit) head = true;
    s.events = [];
  }
  ok(en.dead, "pistol kills an infected worker");
  ok(head, "aiming at the head lands critical hits");
  ok(s.xp >= 10, "kills give XP");
}
{
  // an enemy behind a closed door cannot reach you; a wall blocks sight
  const map = ["#######", "#..S..#", "###.###", "#.....#", "#######"];
  const L = lvl(map, [{ id: "d", t: "door", at: [3, 2], need: ["never"] }, { id: "z", t: "enemy", kind: "runner", at: [3, 3] }]);
  const s = createSim(L);
  run(s, 3);
  const en = s.enemies[0];
  ok(en.z > 5.2, "enemies do not walk through closed doors");
  ok(s.player.hp === s.player.maxHp, "no damage through a door");
}
{
  // guards resist bullets, the ion lance ignores armor
  const L = lvl(room, [{ id: "g", t: "enemy", kind: "guard", at: [4, 2], face: "n" }]);
  const s = createSim(L);
  const g = s.enemies[0];
  s.damageEnemy(g, 100, {});
  ok(g.hp > g.max - 100, "guard armor reduces bullet damage");
  const hp = g.hp;
  s.damageEnemy(g, 50, { pierce: true });
  ok(Math.abs(hp - g.hp - 50) < 0.01, "ion damage ignores armor");
}

/* ---------------------------------------------------------------- movement + hazards */
{
  const map = ["#####", "#.=.#", "#...#", "#.S.#", "#####"];
  const s = createSim(lvl(map, [], { startDir: "n" }));
  s.player.x = 5;
  s.player.z = 5.0;
  run(s, 1.2, { mz: 1 });
  ok(s.player.z > 4.1, "a low barrier blocks walking");
  s.player.x = 5;
  s.player.z = 5.2;
  run(s, 1.0, (sim, i) => ({ mz: 1, jump: i < 2 }));
  ok(s.player.z < 4.0, "jumping clears a low barrier");
}
{
  const map = ["#####", "#.~.#", "#.S.#", "#####"];
  const s = createSim(lvl(map));
  s.player.z = 3;
  run(s, 1);
  ok(s.player.hp + s.player.armor < s.player.maxHp + 40 && s.counters.taken > 0, "acid burns");
}
{
  const map = ["#####", "#.|.#", "#.S.#", "#####"];
  const s = createSim(lvl(map, [], { legend: { "|": { t: "laser", off: "lz" } } }));
  s.player.z = 3;
  run(s, 0.4);
  ok(s.counters.taken > 0, "active lasers hurt");
  const s2 = createSim(lvl(map, [], { legend: { "|": { t: "laser", off: "lz" } } }));
  s2.flags.add("lz");
  s2.player.z = 3;
  run(s2, 0.4);
  ok(s2.counters.taken === 0, "disabled lasers are harmless");
}

/* ---------------------------------------------------------------- puzzles */
{
  const L = LEVELS[1]; // keypad 4071
  const s = createSim(L);
  ok(!s.enterCode("kp", "1234") && !s.sig("air"), "a wrong code is rejected");
  ok(s.enterCode("kp", "4071") && s.sig("air"), "the right code opens the airlock");
  run(s, 2);
  ok(s.byId.airlock.open === 1, "the airlock door opens");
}
{
  const L = LEVELS[7]; // generator order red, yellow, green, blue
  const s = createSim(L);
  const press = (id) => {
    const e = s.byId[id];
    s.player.x = e.c * 2 + 1 + (e.c < 5 ? 2 : -2);
    s.player.z = e.r * 2 + 1;
    s.update(STEP, { ...aimAt(s, e.c * 2 + 1, e.r * 2 + 1, 1), use: true });
  };
  press("gR");
  press("gG");
  ok(s.enemies && !s.seqs.g.solved && !s.byId.gR.on, "a wrong generator order resets the sequence");
  for (const id of ["gR", "gY", "gG", "gB"]) press(id);
  run(s, 0.05);
  ok(s.seqs.g.solved && s.sig("lift"), "the right generator order powers the lift");
}
{
  const L = LEVELS[6]; // color panel blue, red, yellow
  const s = createSim(L);
  const lock = s.locks.L;
  for (const id of ["p0", "p1", "p2"]) {
    const e = s.byId[id];
    e.cur = lock.symbols.indexOf(lock.code[e.idx]) - 1;
    s.player.x = e.c * 2 + 1;
    s.player.z = e.r * 2 + 1;
    s.update(STEP, { ...aimAt(s, e.c * 2 + 1, e.r * 2 + 2, 1.5), use: true });
  }
  run(s, 0.05);
  ok(lock.solved && s.sig("col"), "color panels set to the clue unlock");
}
{
  const L = LEVELS[9]; // beam lab
  const s = createSim(L);
  run(s, 0.1);
  ok(!s.sig("beam"), "the beam starts misaligned");
  s.byId.pA.rot = 1;
  s.byId.pB.empty = false;
  s.byId.pB.rot = 0;
  run(s, 0.1);
  ok(s.sig("beam"), "aligned prisms light the receiver");
}
{
  const L = LEVELS[16]; // ion nodes
  const s = createSim(L);
  const n = s.byId.n1;
  const b = s.entBox(n);
  s.player.x = 23;
  s.player.z = 17;
  s.player.weapons.push("pistol");
  s.update(STEP, { slot: 1 });
  run(s, 0.5);
  run(s, 0.05, { ...aimAt(s, b.c[0], b.c[2], b.c[1]), firePress: true });
  ok(!n.charged, "bullets do not charge ion nodes");
  s.give("ion");
  run(s, 0.6);
  run(s, 0.05, { ...aimAt(s, b.c[0], b.c[2], b.c[1]), firePress: true });
  ok(n.charged, "the Ion Lance charges an ion node");
}
{
  const L = LEVELS[19]; // hive shields
  const s = createSim(L);
  const boss = s.enemyById.boss;
  s.flags.add("arena");
  run(s, 1.2);
  s.damageEnemy(boss, 500, { pierce: true });
  ok(boss.hp === boss.max, "the Hive Mother is shielded while the tubes stand");
  s.byId.t1.charged = s.byId.t2.charged = true;
  run(s, 0.05);
  s.damageEnemy(boss, 5000, { pierce: true });
  ok(Math.abs(boss.hp - boss.max * 0.5) < 1, "the second shield stops damage at half health");
  s.byId.purge.on = true;
  run(s, 0.05);
  s.damageEnemy(boss, 5000, { pierce: true });
  run(s, 0.05);
  ok(boss.dead && s.sig("hiveDead"), "after the purge the Hive Mother can be killed");
}
{
  const L = LEVELS[24]; // escape countdown
  const s = createSim(L);
  s.enemyById.boss.dead = true;
  run(s, 0.1);
  ok(s.escape && s.escape.left <= 75, "killing Project X starts the evacuation countdown");
  s.escape.left = 0.01;
  run(s, 0.2);
  ok(s.state === "dead", "the countdown reaching zero kills the player");
  s.respawn();
  ok(s.escape.left >= 60 && Math.floor(s.player.x / 2) === 22, "respawn returns to the evacuation checkpoint with time");
}

/* ---------------------------------------------------------------- RPG */
{
  const base = statsFor({});
  const up = statsFor({ vitality: 2, armor: 1, firepower: 3, reflexes: 1 });
  ok(up.maxHp === base.maxHp + 40 && up.maxArmor === base.maxArmor + 20, "vitality and armor ranks raise maxima");
  ok(Math.abs(up.dmgMul - 1.3) < 1e-9 && up.speedMul > 1 && up.reloadMul < 1, "firepower and reflexes ranks apply");
  ok(xpForRank(1) < xpForRank(5), "each rank needs more XP");
}
{
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
  const P = await import("../progress.js");
  let p = P.loadProgress();
  ok(p.unlocked === 1 && p.rank === 1 && p.points === 0, "fresh progress starts at level 1, rank 1");
  const r = P.addXp(p, 500);
  ok(r.gained >= 2 && r.progress.points === r.gained, "XP ranks up and grants points");
  p = P.buyUpgrade(r.progress, "vitality");
  ok(p.up.vitality === 1 && p.points === r.gained - 1, "buying an upgrade spends a point");
  p = P.recordCompletion(p, 1, 42, 3).progress;
  const back = P.loadProgress();
  ok(back.unlocked === 2 && back.up.vitality === 1 && back.xp === 500 && back.done[1].time === 42, "progress survives a reload");
  store["biohazard-escape-progress"] = "{bad json";
  ok(P.loadProgress().unlocked === 1, "corrupt saves fall back to a fresh start");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
