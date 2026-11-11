/**
 * Mechanics checks on the real simulation:  node src/components/games/DeepSeaEscape/tools/simTest.mjs
 * Each check builds a small purpose-made level (or a real one) and asserts the
 * rules: swimming and oxygen, stations / tanks / drowning, drains, stranded
 * eels, pipe boards, keypads, valve order, gauges, keycards, crates & pads,
 * reflectors, weapon behaviour (underwater bonus / penalty, drone bonus,
 * stagger, piercing, conduits), weapon mods, Shock Pulse, boss shields,
 * artifacts, loadouts and save sanitising.
 */
import { createSim, defaultLoadout } from "../engine/sim.js";
import { LEVELS } from "../engine/levels.js";
import { statsFor, WEAPONS, ABILITY, BASE_O2, WALL_H, EYE, cellCenter, DIR_YAW } from "../engine/constants.js";
import { solveBoard } from "./bot.mjs";

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
const place = (s, c, r, dir = "n", pitch = -0.25) => {
  const [x, z] = cellCenter(c, r);
  s.player.x = x;
  s.player.z = z;
  s.player.yaw = DIR_YAW[dir];
  s.player.pitch = pitch;
};
const use = (s) => {
  step(s, 1);
  step(s, 1, { use: true });
  step(s, 2);
};
const ROOM = ["#########", "#.......#", "#.S.....#", "#.......#", "#.......#", "#......X#", "#########"];
const POOL = ["#########", "#S..~~~.#", "#...~~~.#", "#...www.#", "#......X#", "#########"];

/* ---------------------------------------------------------- swimming & oxygen */
{
  const s = createSim(level(POOL, []));
  place(s, 5, 1);
  step(s, 30);
  ok(s.player.swim && s.player.under, "deep water: swimming with the head underwater");
  const o0 = s.player.o2;
  step(s, 120);
  ok(Math.abs(o0 - s.player.o2 - 2) < 0.2, "oxygen drains 1 s per second underwater");
  step(s, 90, { up: true });
  ok(s.player.y > 1.5 && s.player.y <= WALL_H - EYE - 0.3 + 1e-6, "Space swims up, capped below the ceiling");
  step(s, 120, { down: true });
  ok(s.player.y < 0.05, "Ctrl / C swims down to the floor");
  place(s, 5, 3);
  step(s, 120, { up: true });
  ok(!s.player.under, "surfacing in an air pocket lifts the head out of the water");
  s.player.o2 = 20;
  const o1 = s.player.o2;
  step(s, 60, { up: true });
  ok(s.player.o2 > o1, "breathing at the surface refills oxygen");
  place(s, 1, 4);
  s.player.y = 0;
  step(s, 10);
  ok(!s.player.swim && !s.player.under, "dry floor: walking again");
  ok(s.player.o2 <= s.player.maxO2, "oxygen never exceeds its maximum");
}
{
  // drowning, oxygen station, tank, respawn
  const s = createSim(level(POOL, [{ id: "st", t: "o2", at: [2, 1] }, { id: "tk", t: "item", item: "o2tank", at: [7, 2] }]));
  place(s, 5, 1);
  s.player.o2 = 0.5;
  const hp = s.player.hp;
  step(s, 180);
  ok(s.player.hp < hp, "out of oxygen: gradual drowning damage");
  ok(s.events.some((e) => e.type === "o2Low"), "low-oxygen warning event");
  s.events = [];
  place(s, 3, 1, "w", -0.3);
  s.player.y = 0;
  s.player.o2 = 5;
  step(s, 2);
  use(s);
  ok(s.player.o2 === s.player.maxO2, "oxygen station refills to full");
  s.player.o2 = 5;
  place(s, 7, 2);
  step(s, 3);
  ok(s.player.o2 >= 5 + s.player.maxO2 * 0.5 - 0.1 && s.byId.tk.gone, "oxygen tank refills half the tank");
  s.player.hp = 1;
  place(s, 5, 2);
  s.player.o2 = 0;
  step(s, 120);
  ok(s.state === "dead", "drowning can kill");
  s.respawn();
  ok(s.player.o2 === s.player.maxO2 && s.state === "play", "respawn restores full oxygen");
}
ok(statsFor({ lungs: 3 }, ["coralLung"]).maxO2 === BASE_O2 + 30 + 15, "oxygen upgrades and the Coral Lung add capacity");

/* ---------------------------------------------------------- drains & stranded eels */
{
  const map = ["#########", "#S..ddd.#", "#...ddd.#", "#......X#", "#########"];
  const s = createSim(level(map, [{ id: "lv", t: "switch", at: [1, 1], dir: "n", sig: "pump" }, { id: "e", t: "enemy", kind: "eel", at: [5, 1] }], { legend: { d: { t: "floor", wl: WALL_H, drain: "pump", drainTo: 0 } } }));
  place(s, 1, 1, "n", -0.1);
  ok(s.tileAt(5, 1).wl === WALL_H, "drainable cells start flooded");
  use(s);
  step(s, 60 * 6);
  ok(s.tileAt(5, 1).wl === 0 && s.sig("dry:pump"), "drain empties the water and raises dry:<signal>");
  ok(s.enemies[0].dead, "a swimmer stranded by a drain dies");
}

/* ---------------------------------------------------------- pipe boards */
{
  const L7 = LEVELS[6];
  const s = createSim(L7);
  const b = s.boards.P;
  ok(!b.solved, "pipe board starts unsolved");
  const before = b.cells[1].rot;
  ok(s.rotatePipe("P", 1) === false && b.cells[1].rot === (before + 1) % 4, "rotating a piece turns it a quarter");
  ok(s.rotatePipe("P", 0) === false && b.cells[0].rot === Number(L7.boards.P.rot[0][0]) + 1, "elbow pieces rotate too");
  const src = b.cells.findIndex((c) => c.ch === "S");
  const r0 = b.cells[src].rot;
  s.rotatePipe("P", src);
  ok(b.cells[src].rot === r0, "source and outlet pieces are fixed");
  const solved = solveBoard(s, "P");
  step(s, 1);
  ok(solved && s.sig("pumps"), "authored solution solves the board and sets its signal");
}

/* ---------------------------------------------------------- keypads, valves, gauges, keycards */
{
  const s = createSim(level(ROOM, [{ id: "kp", t: "keypad", at: [3, 1], dir: "n", code: "0683", sig: "k" }, { id: "d", t: "door", at: [8, 3], need: ["k"] }]));
  ok(!s.enterCode("kp", "0682") && !s.sig("k"), "wrong keypad code rejected");
  ok(s.enterCode("kp", "0683") && s.sig("k"), "right keypad code (leading zero) accepted");
}
{
  const s = createSim(level(ROOM, [{ id: "a", t: "gen", kind: "valve", at: [2, 3], seq: "v", order: 1 }, { id: "b", t: "gen", kind: "valve", at: [4, 3], seq: "v", order: 2 }], { seqs: { v: { count: 2, sig: "vv" } } }));
  place(s, 4, 2, "s", -0.5);
  const hp = s.player.hp;
  use(s);
  ok(!s.sig("vv") && s.events.some((e) => e.type === "overload") && s.player.hp < hp, "valve out of order vents steam and resets");
  place(s, 2, 2, "s", -0.5);
  use(s);
  place(s, 4, 2, "s", -0.5);
  use(s);
  ok(s.sig("vv"), "valves in order solve the sequence");
}
{
  const L9 = LEVELS[8];
  const s = createSim(L9);
  for (const e of s.ents.filter((x) => x.t === "panel")) {
    const lk = s.locks[e.lock];
    while (lk.symbols[e.cur] !== lk.code[e.idx]) {
      place(s, e.c, e.r, e.dir, 0.0);
      use(s);
    }
  }
  ok(s.sig("gauge"), "pressure gauges at the logged readings unlock the bulkhead");
}
{
  const s = createSim(level(ROOM, [{ id: "d", t: "door", at: [8, 3], key: "blueCard" }]));
  ok(s.byId.d.unlocked === false, "security door starts locked");
  s.give("blueCard");
  place(s, 7, 3, "e", 0);
  use(s);
  ok(s.byId.d.unlocked && !s.has("blueCard"), "keycard opens the security door and is consumed");
}
{
  // crates on heavy pads
  const s = createSim(level(ROOM, [{ id: "b", t: "block", at: [3, 2] }, { id: "p", t: "plate", at: [5, 2], sig: "pl", heavy: true }]));
  place(s, 2, 2, "e", -0.1);
  use(s);
  place(s, 3, 2, "e", -0.1);
  use(s);
  step(s, 30);
  ok(s.byId.b.c === 5 && s.sig("pl"), "cargo crate on a heavy pad presses it");
}
{
  // reflector beam
  const s = createSim(LEVELS[10]);
  ok(!s.byId.recv.lit, "laser receiver starts dark");
  s.byId.m1.rot = 0;
  s.byId.m2.empty = false;
  s.byId.m2.rot = 0;
  step(s, 2);
  ok(s.byId.recv.lit && s.sig("beam"), "reflectors guide the laser into the receiver");
}

/* ---------------------------------------------------------- weapons */
const shootAt = (s, en, weapon) => {
  const p = s.player;
  p.weapons = ["pistol", "harpoon", "pulse", "cannon"];
  p.cur = weapon;
  p.mags[weapon] = 9;
  p.fireT = 0;
  p.switchT = 0;
  const h = Math.hypot(en.x - p.x, en.z - p.z);
  s.update(1 / 60, { setYaw: Math.atan2(-(en.x - p.x), -(en.z - p.z)), setPitch: Math.atan2(en.y + en.def.h * 0.5 - (EYE + p.y), h), fire: true });
};
{
  const map = ["##########", "#S.~~~~..#", "#..~~~~..#", "#.......X#", "##########"];
  const mk = () => createSim(level(map, [{ id: "e", t: "enemy", kind: "eel", at: [5, 1], hpMul: 10 }]), { seed: 3 });
  const dmg = (weapon, under) => {
    const s = mk();
    place(s, 4, 1, "e", 0);
    s.player.y = under ? 0.3 : 0;
    step(s, 2);
    const en = s.enemies[0];
    en.state = "idle";
    const hp = en.hp;
    shootAt(s, en, weapon);
    return hp - en.hp;
  };
  const pu = dmg("pistol", true),
    hu = dmg("harpoon", true);
  ok(Math.abs(pu - WEAPONS.pistol.dmg * WEAPONS.pistol.water) < 1, "pistol loses damage underwater");
  ok(Math.abs(hu - WEAPONS.harpoon.dmg * WEAPONS.harpoon.water) < 1, "harpoon deals extra damage underwater");
}
{
  const s = createSim(level(ROOM, [{ id: "d", t: "enemy", kind: "drone", at: [5, 2] }, { id: "r", t: "enemy", kind: "researcher", at: [5, 4] }]), { seed: 1 });
  place(s, 2, 2, "e", 0);
  step(s, 60);
  place(s, 2, 2, "e", 0);
  const d = s.enemies[0];
  d.state = "idle";
  ok(d.y > 0.8, "drones hover");
  const hp = d.hp;
  shootAt(s, d, "pulse");
  ok(Math.abs(hp - d.hp - WEAPONS.pulse.dmg * WEAPONS.pulse.shock * (1 - d.def.armor)) < 1, "Pulse Rifle bonus against drones");
  place(s, 2, 4, "e", 0);
  step(s, 2);
  const r = s.enemies[1];
  shootAt(s, r, "harpoon");
  ok(r.dead || r.stun > 0.3, "harpoon staggers what it hits");
}
{
  // conduits only take their own weapon
  const s = createSim(level(ROOM, [{ id: "n", t: "node", at: [5, 1], dir: "n", sig: "c", by: "cannon" }]));
  place(s, 5, 3, "n", 0);
  const box = s.entBox(s.byId.n);
  const aim = () => ({ setYaw: 0, setPitch: Math.atan2(box.c[1] - EYE, s.player.z - box.c[2]) });
  s.player.weapons = ["pistol", "pulse", "cannon"];
  s.player.cur = "pulse";
  s.update(1 / 60, { ...aim(), fire: true });
  ok(!s.sig("c"), "Pulse Rifle can't wake an abyss conduit");
  s.player.cur = "cannon";
  s.player.fireT = 0;
  s.update(1 / 60, { ...aim(), fire: true });
  ok(s.sig("c"), "Abyss Cannon wakes an abyss conduit");
}
{
  const st = statsFor({}, [], { pulse: 2 });
  const s = createSim(level(ROOM, []), { stats: st, loadout: { weapons: ["pulse"], ammo: { cells: 100 } } });
  ok(s.player.mags.pulse === Math.round(WEAPONS.pulse.mag * 1.5), "weapon mods enlarge the magazine");
  ok(Math.abs(st.mod.pulse.dmg - 1.3) < 1e-9 && Math.abs(st.mod.pulse.reload - 0.8) < 1e-9, "weapon mods add damage and cut reload time");
}
{
  const s = createSim(level(ROOM, [{ id: "a", t: "enemy", kind: "drone", at: [4, 2], hpMul: 5 }, { id: "b", t: "enemy", kind: "brute", at: [3, 3] }]), { ability: true });
  place(s, 3, 2);
  const [a, b] = s.enemies;
  const ha = a.hp,
    hb = b.hp;
  step(s, 1, { ability: true });
  if (!(ha - a.hp > hb - b.hp && b.stun > 0)) console.log("  shock:", ha - a.hp, hb - b.hp, b.stun, a.y);
  ok(ha - a.hp > hb - b.hp && b.stun > 0, "Shock Pulse stuns everything close and hurts drones most");
  ok(s.player.abilityT > ABILITY.cooldown * 0.9, "Shock Pulse goes on cooldown");
}

/* ---------------------------------------------------------- bosses, artifacts, loadouts */
{
  const s = createSim(LEVELS[7]);
  const boss = s.enemyById.boss;
  boss.state = "chase";
  s.damageEnemy(boss, 5000, { pierce: true });
  ok(Math.abs(boss.hp - boss.max * 0.66) < 1 && s.isShielded(boss), "boss shield stops damage at its threshold");
  s.flags.add("coolant");
  s.damageEnemy(boss, 5000, { pierce: true });
  ok(Math.abs(boss.hp - boss.max * 0.33) < 1, "solving the first puzzle opens the next band");
}
{
  const s = createSim(LEVELS[2]);
  s.give("pearl");
  ok(s.relics.includes("pearl") && s.events.some((e) => e.type === "relic"), "artifact pickup is recorded");
}
ok(defaultLoadout(1).weapons.length === 0 && defaultLoadout(7).weapons.join() === "pistol,harpoon" && defaultLoadout(20).weapons.length === 4, "loadouts follow the weapon levels");
{
  // a big boss is never shoved out of the map
  const s = createSim(LEVELS[19]);
  const b = s.enemyById.boss;
  b.state = "chase";
  for (let i = 0; i < 600; i++) {
    s.update(1 / 60, {});
    s.events = [];
  }
  const t = s.tileAt(Math.floor(b.x / 2), Math.floor(b.z / 2));
  ok(t && !["wall", "void", "pillar"].includes(t.t), "large bosses stay inside walkable cells");
}

/* ---------------------------------------------------------- save sanitising */
{
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  const P = await import("../progress.js");
  store["deep-sea-escape-progress"] = JSON.stringify({ unlocked: 99, xp: 0, up: { vitality: 5 }, mods: { pulse: 3 }, relics: ["pearl", "bogus", "pearl"] });
  const p = P.loadProgress();
  ok(p.unlocked === 20 && p.up.vitality === 0 && p.mods.pulse === 0 && p.relics.join() === "pearl", "tampered save is clamped (levels, unearned points, artifacts)");
  const q = P.buyMod({ ...P.emptyProgress(), points: 1 }, "harpoon");
  ok(q.mods.harpoon === 1 && q.points === 0, "buying a weapon mod spends a point");
  ok(P.refundUpgrades(q).points === 1, "refund returns weapon-mod points too");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
