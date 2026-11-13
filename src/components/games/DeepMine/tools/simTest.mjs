/**
 * Mechanics checks for the sim (no browser):
 *   node src/components/games/DeepMine/tools/simTest.mjs
 */
import { createSim, step, WEAPONS, ENEMIES, CELL, EYE, BRUTE, FLARE, BATTERY_DRAIN, enterCode, cartTarget, objectiveInfo } from "../engine/sim.js";
import { LEVELS } from "../engine/levels.js";
import { loadProgress, saveProgress, completeLevel, continueLevel, freshProgress, SAVE_KEY } from "../engine/save.js";

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
const fireOnce = { ...idle(), fireP: true, fire: true };
const aimAt = (S, y, d) => (S.P.pitch = Math.atan2(y - EYE, d));
function addEnemy(S, type, x, z, alerted = true) {
  const D = ENEMIES[type];
  const e = { id: 100 + S.E.length, type, D, x, z, hx: x, hz: z, yaw: Math.PI / 2, hp: D.hp, maxHp: D.hp, alive: true, state: alerted ? "chase" : "idle", alerted, stateT: 0, cool: 0, kx: 0, kz: 0, stagger: 0, hitT: 9, deadT: 0, walkPh: 0, speed: 0, thinkT: 0, wanderT: 9, wx: x, wz: z, growlT: 99, enraged: false, spawnT: 0, burnT: 0, atkCd: 99, dazed: 0, cdx: 0, cdz: 0, lastAtk: "" };
  S.E.push(e);
  return e;
}
/** level 12 cavern, emptied; player in the open facing north */
function arena() {
  const S = createSim(12, { seed: 3 });
  S.E = [];
  S.P.x = cx(13);
  S.P.z = cx(8);
  S.P.yaw = 0;
  S.step = S.L.steps.length - 1;
  S.targets = [];
  for (const w of ["pistol", "shotgun", "flare"]) {
    S.P.owned[w] = true;
    S.P.ammo[w] = { mag: WEAPONS[w].mag, res: WEAPONS[w].mag * 3 };
  }
  S.P.w = "pistol";
  return S;
}

// ---------------------------------------------------------------- weapons
{
  const S = arena();
  const e = addEnemy(S, "miner", S.P.x, S.P.z - 8, false);
  e.stagger = 99;
  aimAt(S, 1.0, 8);
  const ev = run(S, 1 / 60, fireOnce);
  ok(S.P.ammo.pistol.mag === WEAPONS.pistol.mag - 1, "pistol shot uses one round");
  ok(ev.some((x) => x.type === "shot" && x.hit), "pistol ray hits the miner in front");
  ok(Math.abs(e.maxHp - e.hp - WEAPONS.pistol.dmg) < 0.01, "pistol body damage");
  const hp1 = e.hp;
  run(S, 0.05, fireOnce);
  ok(e.hp === hp1, "fire-rate cooldown blocks an instant second shot");
  for (const w of ["pistol", "shotgun", "flare"]) {
    S.P.w = w;
    S.P.switchT = 0;
    S.P.cool = 0;
    S.P.ammo[w] = { mag: 1, res: 20 };
    run(S, 1 / 60, fireOnce);
    run(S, 1 / 60, { ...idle(), reload: true });
    run(S, WEAPONS[w].reload - 0.1);
    ok(S.P.ammo[w].mag === 0, `${w}: not reloaded early`);
    run(S, 0.2);
    ok(S.P.ammo[w].mag === WEAPONS[w].mag, `${w}: reload fills ${WEAPONS[w].mag}`);
  }
  ok(new Set(Object.values(WEAPONS).map((w) => w.mag)).size === 3 && new Set(Object.values(WEAPONS).map((w) => w.interval)).size === 3, "weapons differ in magazine and fire rate");
  S.P.w = "pistol";
  run(S, 1 / 60, { ...idle(), weapon: 3 });
  ok(S.P.w === "flare", "key 3 selects the flare gun");
  S.P.owned.shotgun = false;
  const ev2 = run(S, 1 / 60, { ...idle(), weapon: 2 });
  ok(S.P.w === "flare" && ev2.some((x) => x.type === "msg"), "unowned weapon refused with a message");
}
{
  // walls stop shots; shots cross pits
  const S = createSim(6, { seed: 1 });
  S.E = [];
  S.step = 4;
  S.P.w = "pistol";
  S.P.ammo.pistol = { mag: 10, res: 0 };
  S.P.x = cx(12);
  S.P.z = cx(5);
  S.P.yaw = 0; // north, across the pit
  const e = addEnemy(S, "miner", cx(12), cx(1), false);
  e.stagger = 99;
  aimAt(S, 1.2, 8);
  run(S, 1 / 60, fireOnce);
  ok(e.hp < e.maxHp, "bullets fly across the open shaft");
  const T = createSim(1, { seed: 1 });
  T.E = [];
  T.P.w = "pistol";
  T.P.owned.pistol = true;
  T.P.ammo.pistol = { mag: 10, res: 0 };
  T.P.x = cx(3);
  T.P.z = cx(2);
  T.P.yaw = Math.PI; // south: rock
  const f = addEnemy(T, "miner", cx(3), cx(6), false);
  f.stagger = 99;
  run(T, 1 / 60, fireOnce);
  ok(f.hp === f.maxHp, "rock stops bullets");
}
{
  // flare gun: direct hit + burning flare keeps hurting nearby enemies
  const S = arena();
  S.P.w = "flare";
  const e = addEnemy(S, "miner", S.P.x, S.P.z - 6, false);
  const f = addEnemy(S, "crawler", S.P.x + 1.2, S.P.z - 6, false);
  e.stagger = f.stagger = 99;
  e.hp = e.maxHp = 300;
  aimAt(S, 1.0, 6);
  run(S, 1 / 60, fireOnce);
  ok(S.flares.length === 1, "a flare is left burning");
  const after = e.hp;
  ok(e.maxHp - after >= WEAPONS.flare.dmg - 0.01, "flare direct hit is heavy");
  run(S, 2);
  ok(e.hp < after && f.hp < f.maxHp, "the burning flare scorches enemies around it");
  run(S, FLARE.life);
  ok(S.flares.length === 0, "flares burn out");
}
{
  // pits block walking
  const S = createSim(6, { seed: 1 });
  S.E = [];
  S.P.x = cx(5);
  S.P.z = cx(3);
  S.P.yaw = -Math.PI / 2; // east, into the shaft
  run(S, 2, { ...idle(), mz: 1 });
  ok(S.P.x < cx(6) - CELL / 2, "the player can't walk into the shaft");
}

// ---------------------------------------------------------------- flashlight
{
  const S = createSim(1, { seed: 1 });
  ok(!S.P.flash, "level 1 starts with the flashlight off");
  run(S, 1 / 60, { ...idle(), flash: true });
  ok(S.P.flash && S.step === 1, "F turns the flashlight on (tutorial step done)");
  const b0 = S.P.battery;
  run(S, 10);
  ok(Math.abs(b0 - S.P.battery - BATTERY_DRAIN * 10) < 0.5, "the battery drains while lit");
  run(S, 1 / 60, { ...idle(), flash: true });
  const b1 = S.P.battery;
  run(S, 5);
  ok(!S.P.flash && S.P.battery === b1, "turning it off saves the battery");
  S.P.battery = 10;
  S.items.push({ kind: "b", x: S.P.x + 0.4, z: S.P.z, c: 0, r: 0, id: 99, taken: false });
  run(S, 1 / 60);
  ok(S.P.battery === 60, "a battery pickup restores 50%");
}

// ---------------------------------------------------------------- escape-room props
{
  // key + locked gate (level 2)
  const S = createSim(2, { seed: 1 });
  S.E = [];
  const lock = S.doors.find((d) => d.kind === "lock");
  S.P.x = lock.x - 1.3;
  S.P.z = lock.z;
  S.P.yaw = -Math.PI / 2;
  run(S, 1 / 60);
  ok(S.prompt && !S.prompt.ok && /key/i.test(S.prompt.text), "locked gate asks for a key");
  run(S, 1 / 60, { ...idle(), interact: true });
  ok(lock.target === 0, "no key, no entry");
  S.keys = 1;
  run(S, 1 / 60);
  ok(S.prompt?.ok, "with a key the gate can be unlocked");
  run(S, 1 / 60, { ...idle(), interact: true });
  run(S, 1);
  ok(lock.open > 0.85 && S.keys === 0, "the key opens the gate and is used up");
}
{
  // generator needs fuel (level 3); starting it powers the lamps and opens the blast door
  const S = createSim(3, { seed: 1 });
  S.E = [];
  ok(!S.power, "the generator level starts dark");
  const g = S.machines[0];
  S.P.x = g.x;
  S.P.z = g.z + 1.6;
  S.P.yaw = 0;
  run(S, 1 / 60);
  ok(S.prompt && !S.prompt.ok && /fuel \(0\/2\)/.test(S.prompt.text), `generator reports missing fuel (${S.prompt?.text})`);
  S.count.u = 2;
  S.step = 1;
  run(S, 1 / 60);
  ok(S.prompt?.ok, "with two fuel cans the generator can start");
  run(S, 1 / 60, { ...idle(), interact: true });
  ok(g.on && S.power, "the generator runs and the power is back");
  run(S, 2);
  ok(S.doors.find((d) => d.gid === "1").open > 0.85, "power opens the blast door");
}
{
  // levers in order (level 8): wrong lever resets, right order opens the boiler room
  const S = createSim(8, { seed: 1 });
  S.E = [];
  const by = (c) => S.switches.find((s) => s.color === c);
  const pull = (s) => {
    S.P.x = s.x + s.nx * 1.2;
    S.P.z = s.z + s.nz * 1.2;
    S.P.yaw = Math.atan2(s.nx, s.nz);
    return run(S, 1 / 60, { ...idle(), interact: true });
  };
  pull(by("blue"));
  ok(S.seqI === 1 && by("blue").on, "first correct lever stays down");
  const ev = pull(by("green"));
  ok(S.seqI === 0 && !by("blue").on && ev.some((e) => e.type === "seqFail"), "a wrong lever resets the panel");
  for (const c of S.L.order) pull(by(c));
  run(S, 1 / 60);
  ok(S.seqDone && S.step === 1, "the posted order solves the panel");
  ok(S.L.notes.some((n) => S.L.order.every((c) => n.text.toUpperCase().includes(c.toUpperCase()))), "a note gives the order");
}
{
  // keypad (level 7)
  const S = createSim(7, { seed: 1 });
  S.E = [];
  const k = S.keypads[0];
  S.P.x = k.x + k.nx * 1.2;
  S.P.z = k.z + k.nz * 1.2;
  S.P.yaw = Math.atan2(k.nx, k.nz);
  run(S, 1 / 60);
  ok(S.prompt?.text === "Enter the code", "keypad prompt");
  const ev = run(S, 1 / 60, { ...idle(), interact: true });
  ok(ev.some((e) => e.type === "keypad"), "E opens the keypad");
  ok(!enterCode(S, k.id, "1234") && !k.solved, "a wrong code is refused");
  const ev2 = run(S, 1 / 60);
  ok(ev2.some((e) => e.type === "codeFail"), "the refusal reaches the next step's events");
  ok(enterCode(S, k.id, "4173") && k.solved, "the code from the notes works");
  S.step = 1;
  run(S, 2);
  ok(S.doors.find((d) => d.gid === "1").open > 0.85, "the camp gate opens");
  const notes = S.L.notes.map((n) => n.text).join(" ");
  ok(notes.includes("41") && notes.includes("73"), "the notes hold both halves of the code");
}
{
  // notes are readable
  const S = createSim(7, { seed: 1 });
  S.E = [];
  const n = S.notes[0];
  S.P.x = n.x + 1.3;
  S.P.z = n.z;
  S.P.yaw = Math.PI / 2;
  run(S, 1 / 60);
  ok(S.prompt?.text === "Read the note", "note prompt");
  const ev = run(S, 1 / 60, { ...idle(), interact: true });
  ok(ev.some((e) => e.type === "note" && e.n.text.length > 20) && n.read, "E reads the note");
}
{
  // mine cart (level 4) rolls along its rails and clears the line
  const S = createSim(4, { seed: 1 });
  S.E = [];
  S.step = 1;
  const c = S.carts[0];
  S.P.x = c.x - 1.4;
  S.P.z = c.z;
  S.P.yaw = -Math.PI / 2;
  run(S, 1 / 60);
  ok(S.prompt?.text === "Push the mine cart", "cart prompt");
  const t = cartTarget(S, c);
  ok(t && t.r < c.r, "the cart would roll up its siding");
  run(S, 1 / 60, { ...idle(), interact: true });
  run(S, 3);
  ok(c.moved && !c.moving && c.r < 5, "the cart rolled away");
  ok(S.step === 2, "the cart objective completes");
  S.P.x = cx(10);
  S.P.z = cx(5);
  run(S, 2.5, { ...idle(), mx: 0, mz: 1 });
  ok(S.P.x > cx(12), "the main line is now clear");
}
{
  // cracked rock (level 9) breaks under fire
  const S = createSim(9, { seed: 1 });
  S.E = [];
  S.step = 1;
  const ck = S.cracks[0];
  S.P.x = ck.x;
  S.P.z = ck.z - CELL;
  S.P.yaw = Math.PI;
  S.P.w = "shotgun";
  S.P.ammo.shotgun = { mag: 6, res: 12 };
  aimAt(S, 1.2, 1.2);
  for (let i = 0; i < 6 && !ck.broken; i++) {
    S.P.cool = 0;
    run(S, 1 / 60, fireOnce);
  }
  ok(ck.broken, "a few shotgun blasts break the cracked rock");
  run(S, 1 / 60);
  ok(S.step === 2 && S.G.at(ck.c, ck.r) === ".", "the hidden passage opens");
}

// ---------------------------------------------------------------- jump + AI
{
  const S = arena();
  run(S, 1 / 60, { ...idle(), jump: true });
  let maxY = 0;
  for (let i = 0; i < 60; i++) {
    step(S, 1 / 60, idle());
    maxY = Math.max(maxY, S.P.y);
  }
  ok(maxY > 0.8 && maxY < 1.3 && S.P.grounded, `jump ~1 m and land (${maxY.toFixed(2)})`);
}
{
  const S = arena();
  S.P.w = null;
  const e = addEnemy(S, "miner", S.P.x, S.P.z - 6, true);
  let hits = 0;
  for (let i = 0; i < 60 * 6; i++) for (const ev of step(S, 1 / 60, idle())) if (ev.type === "hurt") hits++;
  ok(hits >= 2 && hits <= Math.ceil(6 / ENEMIES.miner.cool) + 1, `miner closes in and attacks on a cooldown (${hits})`);
  e.alive = false;
  e.state = "dead";
  const hp = S.P.hp;
  run(S, 3);
  ok(S.P.hp === hp, "dead miners stop attacking");
  ok(ENEMIES.crawler.run > ENEMIES.miner.run * 1.8 && ENEMIES.crawler.hp < ENEMIES.miner.hp && ENEMIES.brute.hp > ENEMIES.miner.hp * 10, "crawler fast and fragile, brute huge");
}
{
  const S = arena();
  S.P.hp = 5;
  S.P.w = null;
  addEnemy(S, "miner", S.P.x, S.P.z - 1.6, true);
  run(S, 3);
  ok(S.status === "dead", "the player can die");
}
{
  // brute: shockwave dodged by jumping, rock throw dodged by moving, can be killed
  const mk = () => {
    const S = createSim(12, { seed: 5 });
    const k = S.E.find((e) => e.type === "brute");
    S.step = 1;
    k.alerted = true;
    S.bossIntro = true;
    k.atkCd = 99;
    S.P.x = k.x;
    S.P.z = k.z + 7;
    return { S, k };
  };
  let { S, k } = mk();
  ok(k.maxHp === S.L.bossHp, "the final brute uses the level's boss health");
  k.state = "slamWind";
  k.stateT = 0;
  const hp0 = S.P.hp;
  run(S, BRUTE.slamWind + 1.5);
  ok(S.P.hp < hp0, "standing in the shockwave hurts");
  ({ S, k } = mk());
  k.state = "slamWind";
  k.stateT = 0;
  let jumped = false;
  const hp1 = S.P.hp;
  for (let i = 0; i < 60 * (BRUTE.slamWind + 1.5); i++) {
    const R = S.rings[0];
    const want = R && !jumped && Math.hypot(S.P.x - R.x, S.P.z - R.z) - R.r < 1.6;
    if (want) jumped = true;
    step(S, 1 / 60, { ...idle(), jump: want });
  }
  ok(S.P.hp === hp1, "jumping clears the shockwave");
  ({ S, k } = mk());
  S.bombs.push({ sx: k.x, sz: k.z, sy: 3, tx: S.P.x + 5, tz: S.P.z, t: 0, T: 0.5, r: BRUTE.bombR, dmg: BRUTE.bombDmg, dud: false });
  const hp2 = S.P.hp;
  run(S, 0.6);
  ok(S.P.hp === hp2, "a rock landing away from you misses");
  ({ S, k } = mk());
  S.P.w = "pistol";
  S.P.owned.pistol = true;
  S.P.ammo.pistol = { mag: 10, res: 10 };
  S.P.yaw = 0;
  k.hp = 1;
  k.state = "recover";
  aimAt(S, 1.4, 7);
  run(S, 1 / 60, fireOnce);
  ok(!k.alive, "the brute can be killed");
  run(S, 1 / 60);
  ok(S.L.steps[S.step].t === "switch", "killing the king moves on to the exit controls");
}
{
  // a dormant boss brute waits for its fight
  const S = createSim(6, { seed: 1 });
  const b = S.E.find((e) => e.type === "brute");
  S.P.x = b.x - 4;
  S.P.z = b.z;
  run(S, 1);
  ok(!b.alerted, "the shaft brute sleeps until its objective");
}
{
  // a wave spawns enemies
  const S = createSim(3, { seed: 4 });
  S.E = [];
  S.step = 2;
  S.wave = { i: -1, queue: [], delay: 0.1, ids: [], of: S.L.steps[2].waves.length, done: false, spawnT: 0 };
  run(S, 6);
  ok(S.E.some((e) => e.alive) && objectiveInfo(S).progress?.kind === "wave", "waves spawn and are shown");
}
{
  // exit only when objectives are done; completes once
  const S = createSim(1, { seed: 1 });
  S.E = [];
  const X = S.doors.find((d) => d.kind === "exit");
  S.P.x = X.x;
  S.P.z = X.z - 1.4;
  S.P.yaw = Math.PI;
  run(S, 1 / 60, { ...idle(), interact: true });
  ok(S.status === "play", "the exit is sealed before the objectives");
  S.step = S.L.steps.length - 1;
  S.exitOpen = true;
  const ev = run(S, 0.5, (i) => ({ ...idle(), interact: i % 5 === 0 }));
  ok(S.status === "complete" && ev.filter((e) => e.type === "complete").length === 1, "the exit completes the level exactly once");
}

// ---------------------------------------------------------------- data + saves
{
  ok(LEVELS.length === 12, "twelve levels");
  ok(new Set(LEVELS.map((l) => l.map.join("|"))).size === 12, "twelve distinct layouts");
  ok(new Set(LEVELS.map((l) => l.theme)).size === 12, "twelve distinct themes");
  ok(LEVELS.at(-1).steps.some((s) => s.t === "boss"), "level 12 is the boss fight");
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  let p = loadProgress(store);
  ok(p.unlocked === 1, "fresh progress");
  p = completeLevel(p, { id: 1, time: 40, kills: 3, accuracy: 50 });
  saveProgress(p, store);
  const q = loadProgress(store);
  ok(q.unlocked === 2 && continueLevel(q) === 2, "completing a level unlocks the next and persists");
  mem.set(SAVE_KEY, "{bad");
  ok(loadProgress(store).unlocked === 1, "corrupt save falls back");
  let all = freshProgress();
  for (let i = 1; i <= 12; i++) all = completeLevel(all, { id: i, time: 30, kills: 1, accuracy: 10 });
  ok(all.victory && all.unlocked === 12, "finishing level 12 marks victory");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
