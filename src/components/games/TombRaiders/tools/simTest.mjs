/**
 * Mechanics checks on the real simulation:  node src/components/games/TombRaiders/tools/simTest.mjs
 * Each check builds a small purpose-made level (or a real one) and asserts the
 * rules: blocks & plates, reset levers, statues, glyph tablets, cartouches,
 * brazier order, mirrors, crystals by weapon, Sun Staff splash, Scepter pierce,
 * Wrath of Ra, boss wards, relics, traps, loadouts and save sanitising.
 */
import { createSim, defaultLoadout } from "../engine/sim.js";
import { LEVELS } from "../engine/levels.js";
import { statsFor, WEAPONS, ABILITY, RELIC_ORDER, cellCenter, DIR_YAW } from "../engine/constants.js";

let pass = 0,
  fail = 0;
const ok = (cond, name) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}`);
  }
};
const step = (s, n = 1, inp = {}) => {
  for (let i = 0; i < n; i++) s.update(1 / 60, inp);
};
const level = (map, ents, more = {}) => ({ id: 99, zone: 0, name: "t", objective: "", hints: ["", ""], map, ents, ...more });
const place = (s, c, r, dir = "n") => {
  const [x, z] = cellCenter(c, r);
  s.player.x = x;
  s.player.z = z;
  s.player.yaw = DIR_YAW[dir];
  s.player.pitch = -0.25;
};
const use = (s) => {
  step(s, 1);
  step(s, 1, { use: true });
  step(s, 2);
};
const ROOM = ["#########", "#.......#", "#.S.....#", "#.......#", "#.......#", "#......X#", "#########"];

/* ---------------------------------------------------------- blocks & plates */
{
  const s = createSim(level(ROOM, [{ id: "b", t: "block", at: [3, 2] }, { id: "p", t: "plate", at: [5, 2], sig: "pl", heavy: true }, { id: "rs", t: "switch", at: [1, 1], dir: "n", reset: true }]));
  place(s, 2, 2, "e");
  s.player.pitch = -0.1;
  use(s);
  ok(s.byId.b.c === 4 && s.byId.b.r === 2, "block pushed one cell away from the player");
  ok(!s.sig("pl"), "plate not pressed yet");
  place(s, 3, 2, "e");
  s.player.pitch = -0.1;
  use(s);
  step(s, 30);
  ok(s.byId.b.c === 5 && s.sig("pl"), "block on heavy plate presses it");
  place(s, 4, 2, "e");
  s.player.pitch = -0.1;
  use(s);
  ok(s.byId.b.c === 6, "block keeps sliding east");
  step(s, 30);
  ok(!s.sig("pl"), "plate releases when the block leaves");
  place(s, 5, 2, "e");
  s.player.pitch = -0.1;
  use(s);
  ok(s.byId.b.c === 7, "block slides to the last floor cell");
  place(s, 6, 2, "e");
  s.player.pitch = -0.1;
  use(s);
  ok(s.byId.b.c === 7, "block can't be pushed into a wall");
  place(s, 1, 1, "n");
  s.player.pitch = 0.1;
  use(s);
  ok(s.byId.b.c === 3 && s.byId.b.r === 2, "reset lever returns the block home");
}
{
  // a light plate takes the player's weight; a heavy one does not
  const s = createSim(level(ROOM, [{ id: "p", t: "plate", at: [4, 3], sig: "a" }, { id: "h", t: "plate", at: [5, 3], sig: "b", heavy: true }]));
  place(s, 4, 3);
  step(s, 5);
  ok(s.sig("a"), "light plate pressed by the player");
  place(s, 5, 3);
  step(s, 5);
  ok(!s.sig("b"), "heavy plate ignores the player");
}

/* ---------------------------------------------------------- statues & tablets */
{
  const s = createSim(
    level(ROOM, [{ id: "st", t: "statue", at: [3, 3], lock: "S", idx: 0 }, { id: "gl", t: "panel", at: [5, 1], dir: "n", lock: "G", idx: 0, kind: "glyph" }], {
      locks: { S: { symbols: ["n", "e", "s", "w"], code: ["s"], sig: "gaze" }, G: { symbols: ["ankh", "eye", "sun"], code: ["sun"], sig: "glyph" } },
    }),
  );
  place(s, 3, 4, "n");
  s.player.pitch = 0;
  use(s);
  ok(s.byId.st.cur === 1 && !s.sig("gaze"), "statue turns one step (east) — not solved");
  use(s);
  ok(s.byId.st.cur === 2 && s.sig("gaze"), "statue facing south solves its lock");
  place(s, 5, 1, "n");
  s.player.pitch = 0;
  use(s);
  ok(!s.sig("glyph"), "tablet on eye: wrong");
  use(s);
  ok(s.sig("glyph"), "tablet on sun: solved");
}

/* ---------------------------------------------------------- cartouche */
{
  const s = createSim(level(ROOM, [{ id: "kp", t: "keypad", at: [4, 1], dir: "n", code: ["ankh", "eye", "sun", "moon"], palette: ["ankh", "eye", "sun", "moon"], sig: "c" }]));
  ok(!s.enterCode("kp", ["eye", "ankh", "sun", "moon"]) && !s.sig("c"), "wrong glyph order rejected");
  ok(s.enterCode("kp", ["ankh", "eye", "sun", "moon"]), "right glyph order accepted");
  step(s, 1);
  ok(s.sig("c"), "cartouche signal latched");
}

/* ---------------------------------------------------------- braziers */
{
  const s = createSim(
    level(ROOM, [{ id: "a", t: "gen", at: [2, 4], seq: "q", order: 1 }, { id: "b", t: "gen", at: [4, 4], seq: "q", order: 2, fuse: true }, { id: "u", t: "locker", at: [6, 1], item: "oil" }], { seqs: { q: { count: 2, sig: "fire" } } }),
  );
  const hp = s.player.hp;
  place(s, 4, 3, "s");
  s.events = [];
  use(s);
  ok(!s.byId.b.filled && s.events.some((e) => e.type === "needItem" && e.item === "oil"), "empty brazier asks for oil");
  s.give("oil");
  use(s);
  ok(s.byId.b.filled, "oil fills the brazier");
  use(s);
  ok(!s.byId.b.on && s.player.hp < hp, "lighting out of order resets and the curse hurts");
  place(s, 2, 3, "s");
  use(s);
  place(s, 4, 3, "s");
  use(s);
  step(s, 2);
  ok(s.sig("fire"), "braziers lit in order solve the sequence");
}

/* ---------------------------------------------------------- mirrors */
{
  const map = ["#########", "#.......#", "#.S.....#", "#.......#", "#.......#", "#......X#", "#########"];
  const s = createSim(level(map, [{ id: "sh", t: "emitter", at: [1, 1], dir: "w" }, { id: "m", t: "prism", at: [5, 1], rot: 0 }, { id: "d", t: "receiver", at: [5, 4], sig: "sun" }]));
  step(s, 2);
  ok(!s.sig("sun"), "'/' mirror sends the light north, disc dark");
  place(s, 5, 2, "n");
  s.player.pitch = 0;
  use(s);
  step(s, 2);
  ok(s.sig("sun"), "turned mirror sends light south into the disc");
  ok(s.beams.length >= 2, "beam has a reflected segment");
}

/* ---------------------------------------------------------- weapons */
const arena = ["###########", "#.........#", "#.S.......#", "#.........#", "#........X#", "###########"];
function shootAt(s, en, weapon, frames = 30) {
  s.player.weapons = ["bow", "scarab", "sun", "scepter"];
  s.player.ammo = { scarab: 200, sun: 30, soul: 40 };
  s.player.cur = weapon;
  s.player.switchT = 0;
  const p = s.player;
  for (let i = 0; i < frames; i++) {
    const yaw = Math.atan2(-(en.x - p.x), -(en.z - p.z));
    const pitch = Math.atan2(en.def.h * 0.5 - 1.62, Math.hypot(en.x - p.x, en.z - p.z));
    s.update(1 / 60, { setYaw: yaw, setPitch: pitch, fire: true, firePress: true });
  }
}
{
  const s = createSim(level(arena, [{ t: "enemy", id: "a", kind: "stone", at: [6, 2], face: "w" }, { t: "enemy", id: "b", kind: "stone", at: [8, 2], face: "w" }]));
  place(s, 2, 2, "e");
  const a = s.enemyById.a,
    b = s.enemyById.b;
  a.stun = b.stun = 999;
  shootAt(s, a, "scepter", 1);
  ok(a.hp < a.max && b.hp < b.max, "Scepter pierces both guardians in a line");
  ok(a.max - a.hp >= WEAPONS.scepter.dmg * 0.99, "Scepter ignores stone armor");
}
{
  const s = createSim(level(arena, [{ t: "enemy", id: "a", kind: "stone", at: [6, 2], face: "w" }]));
  place(s, 2, 2, "e");
  const a = s.enemyById.a;
  a.stun = 999;
  shootAt(s, a, "bow", 1);
  const dealt = a.max - a.hp;
  ok(dealt > 0 && dealt < WEAPONS.bow.dmg * 2.2, "arrows are blunted by stone armor");
}
{
  const s = createSim(level(arena, [{ t: "enemy", id: "a", kind: "skeleton", at: [6, 2], face: "w" }, { t: "enemy", id: "b", kind: "skeleton", at: [6, 3], face: "w" }]));
  place(s, 2, 2, "e");
  const a = s.enemyById.a,
    b = s.enemyById.b;
  a.stun = b.stun = 999;
  shootAt(s, a, "sun", 1);
  ok(b.hp < b.max, "Sun Staff orb splashes a neighbouring guardian");
  ok(s.events.some((e) => e.type === "burst"), "Sun Staff emits a burst");
}
{
  const s = createSim(level(arena, [{ id: "n", t: "node", at: [6, 1], dir: "n", sig: "cr", by: "sun" }]));
  place(s, 2, 2, "e");
  const box = s.entBox(s.byId.n);
  const fakeEn = { x: box.c[0], z: box.c[2], def: { h: box.c[1] * 2 } };
  shootAt(s, fakeEn, "scarab", 10);
  ok(!s.byId.n.charged, "sun crystal ignores the Scarab Blaster");
  shootAt(s, fakeEn, "sun", 50);
  step(s, 1);
  ok(s.byId.n.charged && s.sig("cr"), "Sun Staff ignites the sun crystal");
}
{
  const s = createSim(level(arena, [{ t: "enemy", id: "a", kind: "skeleton", at: [3, 2] }, { t: "enemy", id: "b", kind: "swarm", at: [2, 3] }, { t: "enemy", id: "c", kind: "skeleton", at: [8, 2] }]), { ability: true });
  place(s, 2, 2, "e");
  step(s, 1, { ability: true });
  const [a, b, c] = ["a", "b", "c"].map((k) => s.enemyById[k]);
  ok(a.hp < a.max && b.hp < b.max && c.hp === c.max, "Wrath of Ra hits only enemies in its radius");
  ok(s.player.abilityT > 0, "Wrath of Ra goes on cooldown");
  const before = a.hp;
  step(s, 1, { ability: true });
  ok(a.hp >= before - 6, "Wrath of Ra can't be recast during cooldown");
  ok(createSim(LEVELS[0]).player.ability === false && createSim(LEVELS[ABILITY.level - 1]).player.ability === true, "Wrath of Ra unlocks at its level");
}

/* ---------------------------------------------------------- boss wards */
{
  const L = LEVELS[12];
  const s = createSim(L);
  const boss = s.enemyById.boss;
  s.flags.add("arena");
  step(s, 5);
  boss.emerge = 0;
  for (let i = 0; i < 40; i++) s.damageEnemy(boss, 80, { pierce: true });
  ok(Math.abs(boss.hp - boss.max * 0.66) < 1 && s.isShielded(boss), "boss ward holds at 66% until its puzzle is solved");
  for (const g of s.ents.filter((e) => e.t === "gen")) g.on = true;
  s.seqs.fires.solved = true;
  step(s, 1);
  for (let i = 0; i < 40; i++) s.damageEnemy(boss, 80, { pierce: true });
  ok(Math.abs(boss.hp - boss.max * 0.33) < 1, "second ward holds at 33%");
  s.flags.add("light");
  for (let i = 0; i < 40; i++) s.damageEnemy(boss, 80, { pierce: true });
  ok(boss.dead, "boss dies once both wards are broken");
}

/* ---------------------------------------------------------- traps, relics, loadouts */
{
  const map = ["#######", "#.S^..#", "#....X#", "#######"];
  const s = createSim(level(map, []));
  place(s, 3, 1);
  const hp = s.player.hp;
  step(s, 30);
  ok(s.player.hp < hp, "spikes hurt");
  const pulse = createSim(level(["#######", "#.S1..#", "#....X#", "#######"], [], { legend: { 1: { t: "spikes", period: 2, phase: 0 } } }));
  const t = pulse.tileAt(3, 1);
  const states = new Set();
  for (let i = 0; i < 150; i++) {
    step(pulse, 1);
    states.add(pulse.spikesOn(t));
  }
  ok(states.size === 2, "breathing spikes rise and fall");
}
{
  const s = createSim(level(ROOM, [{ id: "r", t: "item", item: "eyeHorus", at: [3, 2] }]));
  place(s, 3, 3, "n");
  s.player.pitch = -0.5;
  use(s);
  ok(s.relics.includes("eyeHorus") && s.events.length >= 0, "relic pickup recorded");
  const st = statsFor({}, ["eyeHorus", "sunDisk", "ankhLife", "lotusBloom"]);
  ok(Math.abs(st.dmgMul - 1.12) < 1e-9 && st.maxHp === 115 && st.extraElixir === 1 && st.abilityCd < ABILITY.cooldown, "relic bonuses stack into stats");
  ok(createSim(LEVELS[3], { stats: st }).player.medkits === 2, "Lotus gives an extra elixir");
}
{
  ok(defaultLoadout(1).weapons.length === 0, "level 1 starts unarmed (bow is found)");
  ok(defaultLoadout(8).weapons.join() === "bow,scarab", "Scarab Blaster carried from level 8");
  ok(defaultLoadout(17).weapons.includes("sun") && !defaultLoadout(17).weapons.includes("scepter"), "Sun Staff carried from level 17");
  ok(defaultLoadout(22).weapons.length === 4, "all four weapons from level 22");
  ok(RELIC_ORDER.every((r) => LEVELS.some((L) => L.ents.some((e) => e.item === r))), "every artifact is placed in some level");
  ok(LEVELS.length === 25 && new Set(LEVELS.map((L) => L.name)).size === 25, "25 levels with unique names");
  ok(new Set(LEVELS.map((L) => L.map.join("\n"))).size === 25, "25 distinct layouts");
}

/* ---------------------------------------------------------- save sanitising */
{
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
  const P = await import("../progress.js");
  store["tomb-raiders-progress"] = "{not json";
  ok(P.loadProgress().unlocked === 1, "corrupt save falls back to a fresh one");
  store["tomb-raiders-progress"] = JSON.stringify({ unlocked: 99, xp: 0, up: { vitality: 5, power: 5 }, relics: ["eyeHorus", "fake", "eyeHorus"] });
  const p = P.loadProgress();
  ok(p.unlocked === 25 && p.up.vitality === 0 && p.points === 0 && p.relics.join() === "eyeHorus", "tampered save is clamped (levels, unearned upgrades, relics)");
  let q = P.emptyProgress();
  q = P.addXp(q, 500).progress;
  ok(q.rank > 1 && q.points === q.rank - 1, "XP grants ranks and points");
  q = P.buyUpgrade(q, "vitality");
  ok(q.up.vitality === 1 && JSON.parse(store["tomb-raiders-progress"]).up.vitality === 1, "upgrade persists");
  q = P.recordCompletion(q, 3, 42, 5).progress;
  ok(q.unlocked === 4 && q.done[3].time === 42, "completion unlocks the next level");
  q = P.addRelic(q, "featherMaat");
  ok(P.loadProgress().relics.includes("featherMaat"), "relic persists");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
