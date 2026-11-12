/**
 * Mechanics checks for the sim (no browser):
 *   node src/components/games/PrisonOfFear/tools/simTest.mjs
 */
import { createSim, step, WEAPONS, ENEMIES, CELL, objectiveInfo } from "../engine/sim.js";
import { LEVELS } from "../engine/levels.js";
import { loadProgress, completeLevel, continueLevel, freshProgress, SAVE_KEY } from "../engine/save.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("FAIL:", msg);
  }
};
const idle = () => ({ mx: 0, mz: 0, dYaw: 0, dPitch: 0 });
const run = (S, sec, inp = idle) => {
  const evs = [];
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) evs.push(...step(S, 1 / 60, typeof inp === "function" ? inp(i) : inp));
  return evs;
};
const cx = (c) => c * CELL + CELL / 2;

/** level 1 with no enemies; player in the corridor facing east */
function arena() {
  const S = createSim(1, { seed: 3 });
  S.E = [];
  S.P.x = cx(10);
  S.P.z = 11;
  S.P.yaw = -Math.PI / 2;
  S.P.pitch = 0;
  S.step = 2; // skip the tutorial steps
  S.targets = [];
  return S;
}
function addEnemy(S, type, x, z, alerted = true) {
  const D = ENEMIES[type];
  const e = { id: 100 + S.E.length, type, D, x, z, hx: x, hz: z, yaw: Math.PI / 2, hp: D.hp, maxHp: D.hp, alive: true, state: alerted ? "chase" : "idle", alerted, stateT: 0, cool: 0, kx: 0, kz: 0, stagger: 0, hitT: 9, deadT: 0, walkPh: 0, speed: 0, thinkT: 0, wanderT: 9, wx: x, wz: z, growlT: 99, enraged: false, spawnT: 0 };
  S.E.push(e);
  return e;
}

// ---------------------------------------------------------------- shooting
{
  const S = arena();
  const e = addEnemy(S, "infected", S.P.x + 8, 11, false);
  e.stagger = 99; // hold still
  const mag0 = S.P.ammo.pistol.mag;
  S.P.pitch = Math.atan2(1.0 - 1.62, 8); // body
  const ev = run(S, 1 / 60, { ...idle(), fireP: true, fire: true });
  ok(S.P.ammo.pistol.mag === mag0 - 1, "pistol shot uses one round");
  ok(ev.some((x) => x.type === "shot" && x.hit), "pistol ray hits the enemy in front");
  ok(e.hp < e.maxHp && e.hp > e.maxHp - 30, `body shot damage ~26 (hp ${e.hp})`);
  ok(e.alerted, "shot enemy becomes alerted");
  const hp1 = e.hp;
  run(S, 0.05, { ...idle(), fireP: true, fire: true });
  ok(e.hp === hp1, "fire-rate cooldown blocks an instant second shot");
  run(S, 0.3);
  S.P.pitch = Math.atan2(ENEMIES.infected.headY - 1.62, 8 - 0.05);
  const hp2 = e.hp;
  const ev2 = run(S, 1 / 60, { ...idle(), fireP: true, fire: true });
  ok(ev2.some((x) => x.type === "shot" && x.head), "aiming at the head registers a headshot");
  ok(hp2 - Math.max(0, e.hp) > 40 || !e.alive, "headshot deals ~2x damage");
}
// ---------------------------------------------------------------- walls block shots
{
  const S = arena();
  // enemy inside the closed cell north of the corridor (c5-7 r1-3), player below its wall
  S.P.x = cx(5);
  S.P.z = 11;
  S.P.yaw = 0; // look north (−Z)
  const e = addEnemy(S, "infected", cx(5), cx(2), false);
  e.stagger = 99;
  run(S, 1 / 60, { ...idle(), fireP: true, fire: true });
  ok(e.hp === e.maxHp, "a concrete wall stops the bullet");
}
// ---------------------------------------------------------------- reload
{
  const S = arena();
  S.P.ammo.pistol.mag = 2;
  S.P.ammo.pistol.res = 30;
  const ev = run(S, 1 / 60, { ...idle(), reload: true });
  ok(ev.some((x) => x.type === "reload") && S.P.reloadT > 0, "R starts a reload");
  run(S, 0.2, { ...idle(), fireP: true, fire: true });
  ok(S.P.ammo.pistol.mag === 2, "can't fire while reloading");
  run(S, WEAPONS.pistol.reload);
  ok(S.P.ammo.pistol.mag === 12 && S.P.ammo.pistol.res === 20, `reload moves 10 rounds (mag ${S.P.ammo.pistol.mag}, res ${S.P.ammo.pistol.res})`);
  S.P.ammo.pistol.mag = 0;
  S.P.ammo.pistol.res = 5;
  run(S, 1 / 60, { ...idle(), fireP: true });
  ok(S.P.reloadT > 0, "clicking with an empty magazine auto-reloads");
  run(S, 2);
  ok(S.P.ammo.pistol.mag === 5 && S.P.ammo.pistol.res === 0, "partial reload uses what's left");
  S.P.ammo.pistol.mag = 0;
  const ev2 = run(S, 1 / 60, { ...idle(), fireP: true });
  ok(ev2.some((x) => x.type === "dry") && ev2.some((x) => x.type === "msg" && /punch/i.test(x.text)), "no ammo at all: dry click + punch hint");
}
// ---------------------------------------------------------------- punching
{
  const S = arena();
  S.P.ammo.pistol.mag = 0;
  S.P.ammo.pistol.res = 0;
  const e = addEnemy(S, "infected", S.P.x + 1.3, 11, true);
  e.cool = 99;
  const x0 = e.x;
  const ev = run(S, 0.2, (i) => ({ ...idle(), punch: i === 0 }));
  ok(ev.some((x) => x.type === "punchHit"), "F punch hits an enemy in reach even with no ammo");
  ok(e.hp === e.maxHp - 20, `jab deals 20 (hp ${e.hp})`);
  ok(e.x > x0 + 0.2, "punch knocks the enemy back");
  ok(e.stagger > 0 || e.state !== "windup", "punch staggers");
  const ev2 = run(S, 0.1, { ...idle(), punch: true });
  ok(!ev2.some((x) => x.type === "punch"), "punch cooldown prevents spamming");
  // combo: 3rd punch is heavy
  const S2 = arena();
  const e2 = addEnemy(S2, "brute", S2.P.x + 1.6, 11, true);
  e2.cool = 99;
  e2.hp = e2.maxHp = 1000;
  let heavy = false;
  for (let k = 0; k < 3; k++) {
    const evs = run(S2, 0.45, (i) => ({ ...idle(), punch: i === 0 }));
    if (evs.some((x) => x.type === "punchHit" && x.heavy)) heavy = k === 2;
    e2.x = S2.P.x + 1.6;
  }
  ok(heavy, "third punch of a combo is a heavy blow");
  // far punch misses
  const S3 = arena();
  addEnemy(S3, "infected", S3.P.x + 3.5, 11, true);
  const ev3 = run(S3, 0.2, (i) => ({ ...idle(), punch: i === 0 }));
  ok(ev3.some((x) => x.type === "punchMiss"), "punch out of reach misses");
}
// ---------------------------------------------------------------- blocking + enemy attacks
{
  const S = arena();
  const e = addEnemy(S, "infected", S.P.x + 1.2, 11, true);
  e.yaw = Math.PI / 2; // faces −X (toward player)
  run(S, 2);
  ok(S.P.hp < 100, `alerted infected in reach attacks (hp ${S.P.hp})`);
  const dmgOpen = 100 - S.P.hp;
  ok(dmgOpen >= 9 && dmgOpen <= 25, `infected hit ~10 dmg (${dmgOpen})`);
  // held block reduces damage
  const S2 = arena();
  const e2 = addEnemy(S2, "infected", S2.P.x + 1.2, 11, true);
  e2.cool = 0;
  run(S2, 0.4, { ...idle(), block: true }); // raise block early (not perfect)
  const ev = run(S2, 1.4, { ...idle(), block: true });
  const hurt = ev.filter((x) => x.type === "hurt");
  ok(hurt.length && hurt.every((x) => x.blocked && !x.perfect), "held block marks the hit as blocked");
  ok(hurt.length && hurt[0].dmg < 5 && hurt[0].dmg > 0, `block cuts damage to ~30% (${hurt[0]?.dmg})`);
  // perfect block
  const S3 = arena();
  const e3 = addEnemy(S3, "infected", S3.P.x + 1.2, 11, true);
  e3.state = "windup";
  e3.stateT = ENEMIES.infected.windup - 0.1;
  const ev3 = run(S3, 0.3, { ...idle(), block: true });
  const h3 = ev3.find((x) => x.type === "hurt");
  ok(h3 && h3.perfect && h3.dmg === 0 && S3.P.hp === 100, "a block raised just before the hit is perfect: no damage");
  ok(e3.stagger > 0.3, "perfect block staggers the attacker");
  // shooting interrupts nothing while blocking
  const S4 = arena();
  run(S4, 0.1, { ...idle(), block: true, fireP: true });
  ok(S4.stats.shots === 0, "can't shoot while blocking");
}
// ---------------------------------------------------------------- no attacks through bars / walls
{
  const S = arena();
  // closed cell c5-7 r1-3 has bars at r4 c6 (z 8..10, bar line at z=9)
  S.P.x = cx(6);
  S.P.z = 9.6;
  const e = addEnemy(S, "infected", cx(6), 8.4, true);
  run(S, 6);
  ok(S.P.hp === 100, `no melee through the bars (hp ${S.P.hp}, enemy at z ${e.z.toFixed(2)})`);
  ok(e.z < 9, "enemy can't pass through the bars");
  // through a wall
  const S2 = arena();
  S2.P.x = cx(5);
  S2.P.z = 10.4;
  const e2 = addEnemy(S2, "creature", cx(5), 7.6, true);
  run(S2, 6);
  ok(S2.P.hp === 100 && e2.z < 8, "no attacks through a wall");
}
// ---------------------------------------------------------------- chase + death
{
  const S = arena();
  const e = addEnemy(S, "infected", S.P.x + 10, 11, false);
  run(S, 0.5);
  ok(e.alerted, "idle enemy with line of sight inside its radius detects the player");
  const d0 = Math.hypot(e.x - S.P.x, e.z - S.P.z);
  run(S, 1.5);
  ok(Math.hypot(e.x - S.P.x, e.z - S.P.z) < d0 - 2, "alerted enemy chases");
  // flow-field chase around walls: enemy in the cell with the broken bars (c9-11 r1-3) reaches the corridor
  const S2 = arena();
  S2.P.x = cx(6);
  S2.P.z = 12;
  const e2 = addEnemy(S2, "infected", cx(10), cx(1), true);
  run(S2, 8);
  ok(Math.hypot(e2.x - S2.P.x, e2.z - S2.P.z) < 2.5, `enemy paths out of its cell around the walls (d ${Math.hypot(e2.x - S2.P.x, e2.z - S2.P.z).toFixed(1)})`);
  // kill it and check it stops
  e2.hp = 1;
  S2.P.yaw = Math.atan2(-(e2.x - S2.P.x), -(e2.z - S2.P.z));
  S2.P.pitch = Math.atan2(1 - 1.62, Math.hypot(e2.x - S2.P.x, e2.z - S2.P.z));
  const evd = run(S2, 1 / 60, { ...idle(), fireP: true });
  ok(!e2.alive && evd.some((x) => x.type === "edie"), "enemy dies at 0 hp");
  const pos = [e2.x, e2.z];
  const hp = S2.P.hp;
  const ev = run(S2, 3);
  ok(!ev.some((x) => x.e === e2 && (x.type === "strike" || x.type === "windup" || x.type === "growl")) && S2.P.hp === hp && Math.hypot(e2.x - pos[0], e2.z - pos[1]) < 0.5, "dead enemies stop all behaviour");
  // player death
  const S3 = arena();
  S3.P.hp = 5;
  addEnemy(S3, "creature", S3.P.x + 1.2, 11, true);
  const ev3 = run(S3, 3);
  ok(S3.status === "dead" && !S3.P.alive && ev3.filter((x) => x.type === "dead").length === 1, "player dies once at 0 hp");
  const after = run(S3, 1, { ...idle(), fireP: true, punch: true });
  ok(!after.some((x) => x.type === "shot" || x.type === "punch"), "no actions after death");
}
// ---------------------------------------------------------------- doors, pickups, interaction
{
  const S = createSim(1, { seed: 1 });
  S.E = [];
  // start cell door at r4 c2; player starts at r3 c2 facing south
  const door = S.doors.find((d) => d.kind === "door" && d.c === 2 && d.r === 4);
  S.P.z = cx(3) + 0.3;
  run(S, 0.1);
  ok(S.prompt?.text === "Open door", `facing the cell door shows "Open door" (${S.prompt?.text})`);
  const z0 = S.P.z;
  run(S, 1, { ...idle(), mz: 1 });
  ok(S.P.z < door.z, "closed door blocks the player");
  run(S, 1 / 60, { ...idle(), interact: true });
  run(S, 1);
  ok(door.open >= 0.85, "E opens the door");
  run(S, 1.5, { ...idle(), mz: 1 });
  ok(S.P.z > door.z + 0.5, `player walks through the open door (z ${S.P.z.toFixed(1)} vs ${z0.toFixed(1)})`);
  // ammo pickup
  const S2 = arena();
  const it = S2.items.find((i) => i.kind === "a");
  const res0 = S2.P.ammo.pistol.res;
  S2.P.x = it.x;
  S2.P.z = it.z;
  run(S2, 0.05);
  ok(it.taken && S2.P.ammo.pistol.res === res0 + 18, "walking over ammo collects +18 rounds");
  // medkit only when hurt
  const S3 = arena();
  const mk = S3.items.find((i) => i.kind === "h");
  S3.P.x = mk.x;
  S3.P.z = mk.z;
  run(S3, 0.1);
  ok(!mk.taken, "medkit stays when health is full");
  S3.P.hp = 50;
  run(S3, 0.1);
  ok(mk.taken && S3.P.hp === 90, "medkit heals 40 when hurt");
  // enemy forces a door
  const S4 = createSim(1, { seed: 2 });
  const inside = S4.E.find((e) => Math.floor(e.x / 2) === 10 && Math.floor(e.z / 2) === 9);
  S4.E = [inside];
  S4.P.x = cx(10);
  S4.P.z = cx(5);
  inside.alerted = true;
  inside.state = "chase";
  const evs = run(S4, 6);
  const d4 = S4.doors.find((d) => d.c === 10 && d.r === 7);
  ok(evs.some((x) => x.type === "doorBang") && d4.target === 1, "an infected bangs on and forces a closed door");
}
// ---------------------------------------------------------------- weapons
{
  const S = arena();
  const ev = run(S, 1 / 60, { ...idle(), weapon: 2 });
  ok(S.P.w === "pistol" && ev.some((x) => x.type === "msg"), "can't equip the shotgun before finding it");
  const S6 = createSim(6, { seed: 1 });
  const sg = S6.items.find((i) => i.kind === "S");
  S6.P.x = sg.x;
  S6.P.z = sg.z + 0.9;
  S6.P.yaw = 0;
  run(S6, 1 / 60, { ...idle(), interact: true });
  ok(sg.taken && S6.P.owned.shotgun && S6.P.w === "shotgun", "E picks up the shotgun and equips it");
  ok(S6.got.S, "shotgun pickup satisfies the item objective");
  // shotgun spread + knockback
  const S7 = createSim(7, { seed: 1 });
  S7.E = [];
  S7.P.x = cx(10);
  S7.P.z = cx(5) + 1;
  S7.P.yaw = -Math.PI / 2;
  S7.P.pitch = Math.atan2(0.9 - 1.62, 3);
  run(S7, 1 / 60, { ...idle(), weapon: 2 });
  run(S7, 0.5);
  const e = { ...addEnemy(S7, "creature", S7.P.x + 3, S7.P.z, true) };
  const en = S7.E[S7.E.length - 1];
  en.cool = 99;
  const x0 = en.x;
  run(S7, 1 / 60, { ...idle(), fireP: true });
  ok(S7.P.ammo.shotgun.mag === 5, "shotgun uses one shell");
  ok(en.hp < en.maxHp - 50 || !en.alive, `close shotgun blast deals heavy damage (hp ${Math.round(en.hp)})`);
  run(S7, 0.2);
  ok(!en.alive || en.x > x0 + 0.3, "shotgun knocks the target back");
  void e;
  // 1/2 switching
  run(S7, 1, { ...idle(), weapon: 1 });
  ok(S7.P.w === "pistol", "1 switches back to the pistol");
}
// ---------------------------------------------------------------- objectives, exit once, gates
{
  const S = createSim(3, { seed: 1 });
  ok(objectiveInfo(S).text.includes("ammunition"), "level 3 starts with the ammo objective");
  S.got.a = true;
  run(S, 0.1);
  ok(S.step === 1, "collecting ammo advances to the switch step");
  const gate = S.doors.find((d) => d.kind === "gate");
  ok(gate.target === 0, "gate starts locked");
  S.switches[0].on = true;
  run(S, 0.1);
  ok(gate.target === 1 && S.step === 2, "switch opens gate 1 and advances");
  run(S, 3);
  ok(gate.open >= 0.85, "gate animates open");
  // exit: locked until exit step, then completes exactly once
  const ex = S.doors.find((d) => d.kind === "exit");
  S.E.forEach((e) => {
    e.alive = false;
    e.state = "dead";
  });
  S.P.x = ex.x;
  S.P.z = ex.z - 1.3;
  S.P.yaw = 0;
  S.P.z = ex.z - 1.2;
  S.P.yaw = Math.PI; // face +Z (south)
  run(S, 0.1);
  ok(S.exitOpen, "exit unlocks once the other steps are done");
  const evs = run(S, 0.5, { ...idle(), interact: true });
  ok(S.status === "complete" && evs.filter((x) => x.type === "complete").length === 1, "exit completes the level exactly once");
  // locked exit refuses
  const S2 = createSim(1, { seed: 1 });
  const ex2 = S2.doors.find((d) => d.kind === "exit");
  S2.E = [];
  S2.P.x = ex2.x;
  S2.P.z = ex2.z - 1.2;
  S2.P.yaw = Math.PI;
  const ev2 = run(S2, 0.1, { ...idle(), interact: true });
  ok(S2.status === "play" && S2.prompt && !S2.prompt.ok && ev2.some((x) => x.type === "denied"), "locked exit refuses early");
}
// ---------------------------------------------------------------- boss
{
  const S = createSim(9, { seed: 1 });
  const b = S.E.find((e) => e.type === "brute");
  ok(b && b.maxHp >= 600, "level 9 has a brute boss");
  b.hp = b.maxHp * 0.49 + 1;
  S.P.x = b.x;
  S.P.z = b.z + 6;
  S.P.yaw = 0;
  S.P.pitch = Math.atan2(1.6 - 1.62, 6);
  const ev = run(S, 1 / 60, { ...idle(), fireP: true });
  ok(ev.some((x) => x.type === "roar") && b.enraged, "brute enrages below half health");
  const S10 = createSim(10, { seed: 1 });
  const b10 = S10.E.find((e) => e.type === "brute");
  const n0 = S10.E.length;
  b10.hp = b10.maxHp * 0.5 + 1;
  S10.P.x = b10.x;
  S10.P.z = b10.z + 5;
  S10.P.yaw = 0;
  run(S10, 1 / 60, { ...idle(), fireP: true });
  ok(S10.E.length > n0, "final brute calls adds at half health");
}
// ---------------------------------------------------------------- all levels sane
for (const L of LEVELS) {
  const S = createSim(L.id);
  ok(S.L.steps.at(-1).t === "exit" && S.doors.some((d) => d.kind === "exit"), `L${L.id} has an exit`);
  ok(S.P.owned.shotgun === L.id > 6, `L${L.id} shotgun ownership`);
  run(S, 2);
  ok(S.status === "play", `L${L.id} survives 2 s idle`);
}
// ---------------------------------------------------------------- save
{
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  let p = loadProgress(st);
  ok(p.unlocked === 1 && continueLevel(p) === 1, "fresh progress starts at level 1");
  p = completeLevel(p, { id: 1, time: 50, kills: 2, accuracy: 60 });
  ok(p.unlocked === 2 && continueLevel(p) === 2, "completing level 1 unlocks level 2");
  p = completeLevel(p, { id: 1, time: 70, kills: 2, accuracy: 60 });
  ok(p.completed[1].time === 50, "best time is kept");
  st.setItem(SAVE_KEY, JSON.stringify(p));
  const q = loadProgress(st);
  ok(q.unlocked === 2 && q.completed[1].time === 50, "progress round-trips through storage");
  st.setItem(SAVE_KEY, "{broken");
  ok(loadProgress(st).unlocked === 1, "corrupt save falls back to fresh");
  st.setItem(SAVE_KEY, JSON.stringify({ unlocked: 99, settings: { quality: "ultra", sens: 50 } }));
  const r = loadProgress(st);
  ok(r.unlocked === 10 && r.settings.quality === "high" && r.settings.sens === 3, "out-of-range save values are clamped");
  ok(completeLevel(freshProgress(), { id: 10, time: 1, kills: 0, accuracy: 0 }).victory, "finishing level 10 marks victory");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
