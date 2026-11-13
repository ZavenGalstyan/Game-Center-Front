/**
 * Mechanics checks for the sim (no browser):
 *   node src/components/games/CarnivalOfFear/tools/simTest.mjs
 */
import { createSim, step, WEAPONS, ENEMIES, CELL, EYE, KING, HAZARD, hazardState, objectiveInfo } from "../engine/sim.js";
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

/** level 3 plaza, nobody around; player in the open south part facing east */
function arena(id = 3) {
  const S = createSim(id, { seed: 3 });
  S.E = [];
  S.P.x = cx(5);
  S.P.z = cx(13);
  S.P.yaw = -Math.PI / 2;
  S.P.pitch = 0;
  S.step = S.L.steps.findIndex((s) => s.t === "exit");
  S.targets = [];
  S.wave = null;
  for (const w of ["pistol", "shotgun", "blaster"]) {
    S.P.owned[w] = true;
    S.P.ammo[w] = { mag: WEAPONS[w].mag, res: WEAPONS[w].mag * 3 };
  }
  S.P.w = "pistol";
  return S;
}
function addEnemy(S, type, x, z, alerted = true) {
  const D = ENEMIES[type];
  const e = { id: 100 + S.E.length, type, D, x, z, hx: x, hz: z, yaw: Math.PI / 2, hp: D.hp, maxHp: D.hp, alive: true, state: alerted ? "chase" : "idle", alerted, stateT: 0, cool: 0, kx: 0, kz: 0, stagger: 0, hitT: 9, deadT: 0, walkPh: 0, speed: 0, thinkT: 0, wanderT: 9, wx: x, wz: z, growlT: 99, enraged: false, spawnT: 0, dodgeT: 0, dodgeCd: 99, dodgeDir: 1, atkCd: 99, dazed: 0, cdx: 0, cdz: 0, lastAtk: "" };
  S.E.push(e);
  return e;
}
const aimAt = (S, y, d) => (S.P.pitch = Math.atan2(y - EYE, d));

// ---------------------------------------------------------------- weapons
{
  const S = arena();
  const e = addEnemy(S, "clown", S.P.x + 8, S.P.z, false);
  e.stagger = 99;
  aimAt(S, 1.0, 8);
  const ev = run(S, 1 / 60, fireOnce);
  ok(S.P.ammo.pistol.mag === 11, "pistol shot uses one round");
  ok(ev.some((x) => x.type === "shot" && x.hit), "pistol ray hits the clown in front");
  ok(Math.abs(e.maxHp - e.hp - WEAPONS.pistol.dmg) < 0.01, `pistol body damage = ${WEAPONS.pistol.dmg} (took ${e.maxHp - e.hp})`);
  ok(e.alerted, "shot enemy becomes alerted");
  const hp1 = e.hp;
  run(S, 0.05, fireOnce);
  ok(e.hp === hp1, "fire-rate cooldown blocks an instant second shot");
  // headshot
  run(S, 0.3);
  e.hp = e.maxHp;
  aimAt(S, ENEMIES.clown.headY, 8);
  S.P.aim = 1;
  run(S, 1 / 60, { ...fireOnce, aim: true });
  ok(e.maxHp - e.hp > WEAPONS.pistol.dmg * 2, `headshot deals double+ damage (${(e.maxHp - e.hp).toFixed(1)})`);
}
{
  // magazines, reload times, switching
  const S = arena();
  for (const w of ["pistol", "shotgun", "blaster"]) {
    S.P.w = w;
    S.P.switchT = 0;
    S.P.cool = 0;
    S.P.ammo[w] = { mag: 1, res: 50 };
    run(S, 1 / 60, fireOnce);
    ok(S.P.ammo[w].mag === 0, `${w}: fired the last round`);
    run(S, 1 / 60, { ...idle(), reload: true });
    ok(S.P.reloadT > 0, `${w}: R starts a reload`);
    run(S, WEAPONS[w].reload - 0.1);
    ok(S.P.ammo[w].mag === 0, `${w}: magazine not refilled before reload time ${WEAPONS[w].reload}s`);
    run(S, 0.2);
    ok(S.P.ammo[w].mag === WEAPONS[w].mag && S.P.ammo[w].res === 50 - WEAPONS[w].mag, `${w}: reload fills the magazine to ${WEAPONS[w].mag}`);
  }
  const mags = new Set(Object.values(WEAPONS).map((w) => w.mag));
  const dmgs = new Set(Object.values(WEAPONS).map((w) => w.dmg * w.pellets));
  ok(mags.size === 3 && dmgs.size === 3, "each weapon has distinct magazine and damage");
  S.P.w = "pistol";
  const ev = run(S, 1 / 60, { ...idle(), weapon: 3 });
  ok(S.P.w === "blaster" && ev.some((e) => e.type === "switch"), "key 3 switches to the blaster");
  run(S, 1 / 60, { ...idle(), weapon: 2 });
  ok(S.P.w === "shotgun", "key 2 switches to the shotgun");
  run(S, 1 / 60, { ...idle(), wheel: 1 });
  ok(S.P.w === "blaster", "mouse wheel cycles weapons");
  S.P.owned.shotgun = false;
  const ev2 = run(S, 1 / 60, { ...idle(), weapon: 2 });
  ok(S.P.w === "blaster" && ev2.some((e) => e.type === "msg"), "unowned weapon can't be selected and says why");
}
{
  // blaster auto fire, shotgun pellets + knockback
  const S = arena();
  S.P.w = "blaster";
  run(S, 0.4);
  const m0 = S.P.ammo.blaster.mag;
  run(S, 1.0, (i) => ({ ...idle(), fire: true, fireP: i === 0 }));
  const fired = m0 - S.P.ammo.blaster.mag;
  ok(fired >= 9 && fired <= 11, `blaster fires automatically while held (~10/s, got ${fired})`);
  S.P.ammo.pistol.mag = 12;
  S.P.w = "pistol";
  run(S, 0.4);
  run(S, 1.0, (i) => ({ ...idle(), fire: true, fireP: i === 0 }));
  ok(S.P.ammo.pistol.mag === 11, "pistol is semi-automatic (one shot per click)");
  const T = arena();
  const e = addEnemy(T, "clown", T.P.x + 3, T.P.z, false);
  e.stagger = 99;
  T.P.w = "shotgun";
  run(T, 0.4);
  aimAt(T, 1.0, 3);
  const x0 = e.x;
  run(T, 1 / 60, fireOnce);
  ok(e.maxHp - e.hp > 60, `point-blank shotgun blast is heavy (${(e.maxHp - e.hp).toFixed(0)})`);
  run(T, 0.3);
  ok(e.x > x0 + 0.3, "shotgun knocks the clown back");
}
{
  // armor: body shots reduced, headshots and the blaster are not
  const S = arena();
  const a = addEnemy(S, "armored", S.P.x + 8, S.P.z, false);
  a.stagger = 99;
  aimAt(S, 1.0, 8);
  run(S, 1 / 60, fireOnce);
  const body = a.maxHp - a.hp;
  ok(Math.abs(body - WEAPONS.pistol.dmg * WEAPONS.pistol.armor) < 0.01, `armored body shot reduced (${body.toFixed(1)})`);
  a.hp = a.maxHp;
  S.P.w = "blaster";
  S.P.switchT = 0;
  run(S, 0.4);
  aimAt(S, 1.0, 8);
  run(S, 1 / 60, fireOnce);
  ok(Math.abs(a.maxHp - a.hp - WEAPONS.blaster.dmg) < 0.01, "blaster ignores armor");
}
{
  // walls stop bullets; railings don't
  const S = createSim(1, { seed: 1 });
  S.E = [];
  S.P.w = "pistol";
  S.P.owned.pistol = true;
  S.P.ammo.pistol = { mag: 12, res: 0 };
  S.P.x = cx(12);
  S.P.z = cx(11);
  S.P.yaw = 0; // north, through the gate railing line at row 9
  const e = addEnemy(S, "clown", cx(4), cx(7), false); // behind railing, not the gate
  e.stagger = 99;
  S.P.x = cx(4);
  aimAt(S, 1.0, Math.abs(S.P.z - e.z));
  run(S, 1 / 60, fireOnce);
  ok(e.hp < e.maxHp, "bullets pass through railings");
  const f = addEnemy(S, "clown", cx(12), cx(15), false); // south of the arch wall
  f.stagger = 99;
  S.P.x = cx(12);
  S.P.z = cx(11);
  S.P.yaw = Math.PI;
  S.P.cool = 0;
  aimAt(S, 1.0, 8);
  run(S, 1 / 60, fireOnce);
  ok(f.hp === f.maxHp, "walls stop bullets");
}

// ---------------------------------------------------------------- unarmed start / pickups
{
  const S = createSim(1, { seed: 2 });
  ok(S.P.w === null && !S.P.owned.pistol, "level 1 starts unarmed");
  const ev = run(S, 1 / 60, fireOnce);
  ok(ev.some((e) => e.type === "msg"), "clicking while unarmed explains why");
  const G = S.items.find((i) => i.kind === "G");
  S.P.x = G.x;
  S.P.z = G.z + 1.2;
  S.P.yaw = 0;
  S.step = 1;
  run(S, 1 / 60);
  ok(S.prompt?.ok && /pistol/i.test(S.prompt.text), `E prompt on the pistol (${S.prompt?.text})`);
  run(S, 1 / 60, { ...idle(), interact: true });
  ok(S.P.w === "pistol" && S.P.ammo.pistol.mag === 12, "E picks up the pistol");
  run(S, 2);
  ok(S.doors.filter((d) => d.gid === "1").every((d) => d.open > 0.85), "picking up the pistol opens the plaza gate");
  ok(S.L.steps[S.step].t === "kill" && S.targets.length === 3, `kill step targets all 3 plaza clowns (${S.targets?.length})`);
}
{
  const S = arena();
  S.P.hp = 50;
  S.items.push({ kind: "h", x: S.P.x + 0.5, z: S.P.z, c: 0, r: 0, id: 99, taken: false });
  S.items.push({ kind: "e", x: S.P.x + 0.5, z: S.P.z, c: 0, r: 0, id: 98, taken: false });
  const r0 = S.P.ammo.blaster.res;
  run(S, 1 / 60);
  ok(S.P.hp === 90, "medkit heals 40");
  ok(S.P.ammo.blaster.res === r0 + 45, "energy cells add blaster ammo");
  S.P.hp = 100;
  S.items.push({ kind: "h", x: S.P.x + 0.5, z: S.P.z, c: 0, r: 0, id: 97, taken: false });
  run(S, 1 / 60);
  ok(!S.items.find((i) => i.id === 97).taken, "medkit stays when health is full");
}

// ---------------------------------------------------------------- jump
{
  const S = arena();
  run(S, 1 / 60, { ...idle(), jump: true });
  let maxY = 0;
  for (let i = 0; i < 60; i++) {
    step(S, 1 / 60, idle());
    maxY = Math.max(maxY, S.P.y);
  }
  ok(maxY > 0.9 && maxY < 1.3, `jump apex ~1 m (${maxY.toFixed(2)})`);
  ok(S.P.y === 0 && S.P.grounded, "player lands again");
  run(S, 1 / 60, { ...idle(), jump: true });
  const y1 = S.P.y;
  run(S, 1 / 60, { ...idle(), jump: true });
  ok(S.P.y > y1, "no double jump boost mid-air (still rising)");
}

// ---------------------------------------------------------------- enemy AI
{
  // clown chases, winds up, hits with cooldown, respects walls
  const S = arena();
  S.P.w = null;
  const e = addEnemy(S, "clown", S.P.x + 6, S.P.z, true);
  let hits = 0, winds = 0;
  for (let i = 0; i < 60 * 6; i++) for (const ev of step(S, 1 / 60, idle())) {
    if (ev.type === "hurt") hits++;
    if (ev.type === "windup") winds++;
  }
  ok(winds >= 2 && hits >= 2, `clown approaches and lands repeated melee hits (${hits} hits, ${winds} windups)`);
  ok(hits <= Math.ceil(6 / ENEMIES.clown.cool) + 1, "clown attacks respect the cooldown");
  e.alive = false;
  e.state = "dead";
  const hp = S.P.hp;
  run(S, 3);
  ok(S.P.hp === hp, "dead clowns stop attacking");
}
{
  // can't attack through a wall: level 2 cell wall between start room and hall
  const S = createSim(2, { seed: 1 });
  S.E = [];
  S.P.x = cx(3);
  S.P.z = cx(2);
  const e = addEnemy(S, "clown", cx(7), cx(2), true);
  // close the door so the wall line blocks
  const d = S.doorAt.get(2 * S.G.w + 6);
  d.target = 0;
  d.open = 0;
  e.x = cx(7);
  e.z = cx(1);
  const hp = S.P.hp;
  for (let i = 0; i < 60 * 1.5; i++) step(S, 1 / 60, idle());
  ok(S.P.hp === hp, "clown on the other side of a wall can't hit");
}
{
  // jester dodges when aimed at
  const S = arena();
  const j = addEnemy(S, "jester", S.P.x + 10, S.P.z, true);
  j.dodgeCd = 0;
  S.P.pitch = 0;
  let dodged = false;
  for (let i = 0; i < 30; i++) for (const ev of step(S, 1 / 60, idle())) if (ev.type === "dodge") dodged = true;
  ok(dodged, "jester sidesteps when the player aims at it");
  ok(ENEMIES.jester.run > ENEMIES.clown.run * 1.8 && ENEMIES.jester.hp < ENEMIES.clown.hp, "jester is faster and weaker than the clown");
  ok(ENEMIES.armored.hp > ENEMIES.clown.hp * 3 && ENEMIES.armored.dmg > ENEMIES.clown.dmg && ENEMIES.armored.run < ENEMIES.clown.run, "armored clown is slow, tough and hits harder");
}
{
  // hit reactions + death
  const S = arena();
  const e = addEnemy(S, "clown", S.P.x + 6, S.P.z, false);
  aimAt(S, 1.0, 6);
  let died = false;
  for (let k = 0; k < 6 && !died; k++) {
    S.P.cool = 0;
    for (const ev of step(S, 1 / 60, fireOnce)) if (ev.type === "edie") died = true;
    ok(e.hitT < 0.1 || died, "hit enemy plays a hit reaction");
  }
  ok(died && !e.alive, "clown dies after enough pistol shots");
  ok(S.stats.kills === 1, "kill counted");
}

// ---------------------------------------------------------------- hazards
{
  const S = createSim(6, { seed: 1 });
  S.E = [];
  const hz = S.G.hazards[0];
  S.P.x = hz.x;
  S.P.z = hz.z;
  // find a live moment and an off moment
  let tLive = -1, tOff = -1;
  for (let t = 0; t < 4; t += 0.01) {
    const st = hazardState(t, hz.ph);
    if (st === 2 && tLive < 0) tLive = t;
    if (st === 0 && tOff < 0) tOff = t;
  }
  S.t = tOff;
  S.P.hazT = 0;
  const hp0 = S.P.hp;
  step(S, 1 / 60, idle());
  ok(S.P.hp === hp0, "dark electric floor is safe");
  S.t = tLive;
  step(S, 1 / 60, idle());
  ok(S.P.hp === hp0 - HAZARD.dmg, "live electric floor shocks");
  S.P.hazT = 0;
  S.t = tLive;
  S.P.y = 0.8;
  S.P.grounded = false;
  S.P.vy = 0.1;
  const hp1 = S.P.hp;
  step(S, 1 / 60, idle());
  ok(S.P.hp === hp1, "jumping over a live floor avoids the shock");
}

// ---------------------------------------------------------------- the Clown King
function kingArena() {
  const S = createSim(10, { seed: 5 });
  const k = S.E.find((e) => e.type === "king");
  S.step = 1;
  S.P.x = k.x;
  S.P.z = k.z + 7;
  return { S, k };
}
{
  const { S, k } = kingArena();
  ok(k.maxHp === ENEMIES.king.hp, "the king has a large health pool");
  const ev = run(S, 1 / 60);
  void ev;
  k.alerted = false;
  S.bossIntro = false;
  S.step = 0;
  S.P.x = k.x;
  S.P.z = k.z + 10;
  const ev2 = run(S, 0.5);
  ok(ev2.some((e) => e.type === "bossIntro") && S.bossIntro, "the king announces himself when he sees the player");
}
{
  // shockwave: standing gets hit, jumping clears it
  const { S, k } = kingArena();
  k.alerted = true;
  S.bossIntro = true;
  k.state = "slamWind";
  k.stateT = 0;
  k.atkCd = 99;
  const hp0 = S.P.hp;
  run(S, KING.slamWind + 1.5);
  ok(S.P.hp < hp0, `standing player is hit by the shockwave (${hp0 - S.P.hp})`);
  const T = kingArena();
  T.k.alerted = true;
  T.S.bossIntro = true;
  T.k.state = "slamWind";
  T.k.stateT = 0;
  T.k.atkCd = 99;
  const hp1 = T.S.P.hp;
  let jumped = false;
  for (let i = 0; i < 60 * (KING.slamWind + 1.5); i++) {
    const R = T.S.rings[0];
    const want = R && !jumped && Math.hypot(T.S.P.x - R.x, T.S.P.z - R.z) - R.r < 1.6;
    if (want) jumped = true;
    step(T.S, 1 / 60, { ...idle(), jump: want });
  }
  ok(T.S.P.hp === hp1, "jumping over the shockwave avoids it");
}
{
  // bombs: landing inside the mark hurts, outside doesn't
  const { S, k } = kingArena();
  k.alerted = true;
  S.bossIntro = true;
  k.state = "chase";
  k.atkCd = 99;
  S.bombs.push({ sx: k.x, sz: k.z, sy: 3, tx: S.P.x, tz: S.P.z, t: 0, T: 0.5, r: KING.bombR, dmg: KING.bombDmg, dud: false });
  const hp0 = S.P.hp;
  run(S, 0.6);
  ok(S.P.hp < hp0, "bomb landing on the player hurts");
  S.bombs.push({ sx: k.x, sz: k.z, sy: 3, tx: S.P.x + 5, tz: S.P.z, t: 0, T: 0.5, r: KING.bombR, dmg: KING.bombDmg, dud: false });
  const hp1 = S.P.hp;
  run(S, 0.6);
  ok(S.P.hp === hp1, "bombs can be dodged by standing outside the mark");
}
{
  // charge: telegraph → dash; hits the player; crashing into a wall dazes him
  const { S, k } = kingArena();
  k.alerted = true;
  S.bossIntro = true;
  k.state = "chargeWind";
  k.stateT = 0;
  k.atkCd = 99;
  const hp0 = S.P.hp;
  run(S, KING.chargeWind + 1.2);
  ok(S.P.hp < hp0, "standing in the charge lane gets you hit");
  const T = kingArena();
  T.k.alerted = true;
  T.S.bossIntro = true;
  T.k.state = "chargeWind";
  T.k.stateT = 0;
  T.k.atkCd = 99;
  const hp1 = T.S.P.hp;
  let side = false;
  for (let i = 0; i < 60 * (KING.chargeWind + 1.5); i++) {
    const strafe = T.k.state === "chargeWind" && T.k.stateT > KING.chargeWind * 0.8 ? 1 : T.k.state === "charge" ? 1 : 0;
    if (strafe) side = true;
    step(T.S, 1 / 60, { ...idle(), mx: strafe, sprint: true });
  }
  ok(T.S.P.hp === hp1 && side, "sidestepping the charge avoids it");
  // put the king in front of a wall and charge into it
  const U = kingArena();
  U.k.alerted = true;
  U.S.bossIntro = true;
  U.k.x = cx(14);
  U.k.z = cx(5);
  U.S.P.x = cx(14);
  U.S.P.z = cx(3);
  U.k.state = "chargeWind";
  U.k.stateT = 0;
  U.k.atkCd = 99;
  let dazed = false;
  for (let i = 0; i < 60 * 3; i++) {
    // player hops out of the way at the last moment
    const inp = U.k.state === "charge" ? { ...idle(), mx: 1, sprint: true } : idle();
    step(U.S, 1 / 60, inp);
    if (U.k.state === "dazed") dazed = true;
  }
  ok(dazed, "the king is dazed after charging into a wall");
  U.k.state = "dazed";
  U.k.dazed = 1;
  U.k.stateT = 0;
  U.S.P.x = U.k.x;
  U.S.P.z = U.k.z + 8;
  U.S.P.yaw = 0;
  U.S.P.w = "pistol";
  U.S.P.owned.pistol = true;
  U.S.P.ammo.pistol = { mag: 12, res: 0 };
  U.S.P.cool = 0;
  U.S.P.switchT = 0;
  aimAt(U.S, 1.4, 8);
  const h0 = U.k.hp;
  step(U.S, 1 / 60, fireOnce);
  ok(Math.abs(h0 - U.k.hp - WEAPONS.pistol.dmg * 1.5) < 0.01, `dazed king takes 1.5x damage (${(h0 - U.k.hp).toFixed(1)})`);
}
{
  // phases: summons adds at 66% and 33%, enrages at 50%; dying ends the boss step
  const { S, k } = kingArena();
  k.alerted = true;
  S.bossIntro = true;
  k.state = "chase";
  k.atkCd = 99;
  S.P.x = k.x;
  S.P.z = k.z + 12;
  const before = S.E.length;
  k.hp = k.maxHp * 0.665;
  S.P.w = "pistol";
  S.P.owned.pistol = true;
  S.P.ammo.pistol = { mag: 12, res: 24 };
  S.P.yaw = 0;
  aimAt(S, 1.4, 12);
  run(S, 1 / 60, fireOnce);
  ok(k.state === "summon", "the king starts summoning below 66% health");
  run(S, KING.summon + 0.2);
  ok(S.E.length > before && S.addsDone === 1, `the king's court arrives (${S.E.length - before} adds)`);
  k.hp = k.maxHp * 0.45;
  S.P.cool = 0;
  run(S, 1 / 60, fireOnce);
  ok(k.enraged, "the king enrages below 50%");
  k.hp = 1;
  S.P.cool = 0;
  S.P.reloadT = 0;
  S.P.ammo.pistol.mag = 5;
  k.state = "recover";
  run(S, 1 / 60, fireOnce);
  ok(!k.alive, "the king can be killed");
  run(S, 1 / 60);
  ok(S.L.steps[S.step].t === "exit" && S.exitOpen, "killing the king opens the exit");
}

// ---------------------------------------------------------------- doors / exit / death
{
  const S = createSim(2, { seed: 1 });
  S.E = [];
  const d = S.doorAt.get(2 * S.G.w + 6);
  S.P.x = cx(5);
  S.P.z = cx(2);
  S.P.yaw = -Math.PI / 2;
  run(S, 1 / 60);
  ok(S.prompt?.text === "Open door", "E prompt at a door");
  run(S, 1 / 60, { ...idle(), interact: true });
  run(S, 0.6);
  ok(d.open >= 0.85, "E opens doors");
  const gate = S.doors.find((x) => x.gid === "1");
  S.P.x = gate.x;
  S.P.z = gate.z - 1.4;
  S.P.yaw = Math.PI;
  run(S, 1 / 60);
  ok(S.prompt && !S.prompt.ok, "locked gate refuses until its switch is pulled");
  const X = S.doors.find((x) => x.kind === "exit");
  S.P.x = X.x;
  S.P.z = X.z - 1.4;
  run(S, 1 / 60, { ...idle(), interact: true });
  ok(S.status === "play", "exit is locked before the objectives are done");
  S.step = S.L.steps.length - 1;
  S.exitOpen = true;
  run(S, 1 / 60, { ...idle(), interact: true });
  ok(S.status === "complete", "E at the open exit completes the level");
}
{
  const S = arena();
  S.P.w = null;
  S.P.hp = 5;
  const e = addEnemy(S, "armored", S.P.x + 1.6, S.P.z, true);
  void e;
  run(S, 3);
  ok(S.status === "dead" && !S.P.alive, "player can die");
}
{
  // fortune machine (level 6) gives a gift once
  const S = createSim(6, { seed: 1 });
  S.E = [];
  const f = S.fortunes[0];
  S.P.x = f.x + 1.4;
  S.P.z = f.z;
  S.P.yaw = Math.PI / 2;
  S.P.hp = 50;
  run(S, 1 / 60);
  ok(S.prompt?.text === "Use the fortune machine", "fortune machine prompt");
  run(S, 1 / 60, { ...idle(), interact: true });
  ok(S.P.hp === 75 && f.used, "fortune machine heals once");
}
{
  // a wave spawns enemies and finishes when they're dead
  const S = createSim(3, { seed: 4 });
  S.E = [];
  S.step = 1;
  S.wave = { i: -1, queue: [], delay: 0.1, ids: [], of: S.L.steps[1].waves.length, done: false, spawnT: 0 };
  run(S, 6);
  ok(S.E.filter((e) => e.alive).length > 0, "wave spawns enemies");
  ok(objectiveInfo(S).progress?.kind === "wave", "wave progress shown in the objective");
}

// ---------------------------------------------------------------- level data
{
  ok(LEVELS.length === 10, "ten levels");
  ok(new Set(LEVELS.map((l) => l.map.join("|"))).size === 10, "ten distinct layouts");
  ok(new Set(LEVELS.map((l) => l.theme)).size === 10, "ten distinct themes");
  ok(LEVELS[9].steps.some((s) => s.t === "boss"), "level 10 is the boss fight");
  ok(LEVELS.every((l) => l.steps.at(-1).t === "exit"), "every level ends at an exit");
}

// ---------------------------------------------------------------- saves
{
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  let p = loadProgress(store);
  ok(p.unlocked === 1 && !Object.keys(p.completed).length, "fresh progress");
  p = completeLevel(p, { id: 1, time: 40, kills: 3, accuracy: 50 });
  saveProgress(p, store);
  const q = loadProgress(store);
  ok(q.unlocked === 2 && q.completed[1].time === 40, "completing a level unlocks the next and persists");
  ok(continueLevel(q) === 2, "continue goes to the first unfinished level");
  const r = completeLevel(q, { id: 1, time: 60, kills: 3, accuracy: 50 });
  ok(r.completed[1].time === 40, "best time kept");
  mem.set(SAVE_KEY, "{not json");
  ok(loadProgress(store).unlocked === 1, "corrupt save falls back to fresh progress");
  mem.set(SAVE_KEY, JSON.stringify({ unlocked: 99, settings: { volume: "x", quality: "ultra", difficulty: 3 } }));
  const z = loadProgress(store);
  ok(z.unlocked === 10 && z.settings.volume === 0.8 && z.settings.quality === "high" && z.settings.difficulty === "normal", "out-of-range save values are clamped");
  ok(loadProgress({ getItem: () => { throw new Error("blocked"); } }).unlocked === 1, "blocked storage is survivable");
  let all = freshProgress();
  for (let i = 1; i <= 10; i++) all = completeLevel(all, { id: i, time: 30, kills: 1, accuracy: 10 });
  ok(all.victory && all.unlocked === 10, "finishing level 10 marks victory");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
