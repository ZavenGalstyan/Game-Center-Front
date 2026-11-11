/**
 * Mechanics checks for the Outlaw Legends sim (no browser):
 *   node src/components/games/OutlawLegends/tools/simTest.mjs
 * Builds small controlled situations inside real missions and asserts the
 * shooting, fighting, AI, duel, checkpoint, save and shop rules.
 */
import { createSim, step, respawn, aimInfo, stepProgress } from "../engine/sim.js";
import { playerStats, WEAPONS, ENEMIES, xpForLevel, levelFromXp, weaponUpgradeCost } from "../engine/data.js";
import { freshProgress, sanitize, completeMission, buyWeaponUpgrade, buyCharUpgrade, buyAbility, loadProgress, saveProgress, nextMissionId } from "../engine/save.js";
import { MISSIONS } from "../engine/missions.js";
import { faceAngle, segmentBlocked } from "../engine/geom.js";

let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
};
const ALL = { xp: 0, weapons: ["revolver", "shotgun", "rifle", "dual"], upgrades: {}, abilities: { deadEye: true, counter: true } };
const E0 = { mx: 0, mz: 0, dYaw: 0, dPitch: 0 };
const run = (S, n, inp = E0) => {
  const evs = [];
  for (let i = 0; i < n; i++) evs.push(...step(S, 1 / 60, typeof inp === "function" ? inp(i) : inp));
  return evs;
};
/** Point the camera so its ray hits (x,y,z); iterate since the rig moves with pitch. */
const aimAt = (S, x, y, z) => {
  for (let k = 0; k < 6; k++) {
    step(S, 1 / 60, E0);
    const C = S.cam;
    const dx = x - C.pos[0], dy = y - C.pos[1], dz = z - C.pos[2];
    C.yaw = faceAngle(dx, dz);
    C.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  step(S, 1 / 60, E0);
};

/* ------------------------------------------------------------ 1. shooting */
// use a mission's own enemy and move it into position
function withEnemy(type = "bandit", x = 0, z = 20, opt = {}) {
  const S = createSim(4, { stats: playerStats(ALL), difficulty: "normal", seed: 3 });
  // mission 4 step 0 spawns g1 (bandits + a gunslinger); keep one of the right type
  let e = S.enemies.find((q) => q.type === type) || S.enemies[0];
  e.type = type;
  e.def = ENEMIES[type];
  e.look = ENEMIES[type].look;
  S.enemies = [e];
  e.x = x;
  e.z = z;
  e.rot = opt.rot ?? 0;
  e.alert = !!opt.alert;
  e.hp = e.maxHp = opt.hp ?? e.maxHp;
  e.fireCd = 99;
  e.meleeCd = 99;
  S.step = { type: "reach", at: [999, 999], r: 1, text: "test" };
  S.say = [];
  S.P.x = 0;
  S.P.z = 32;
  S.P.rot = 0;
  return { S, e };
}

{
  const { S, e } = withEnemy("bandit", 0, 22);
  aimAt(S, e.x, 1.2, e.z);
  const hp0 = e.hp;
  const evs = run(S, 2, (i) => (i === 0 ? { ...E0, fireP: true, fire: true, aim: true } : E0));
  const hit = evs.find((v) => v.type === "hit");
  ok(hit && e.hp < hp0, "revolver body shot hits an enemy in the open", JSON.stringify(evs.map((v) => v.type)));
  ok(hit && !hit.head && hit.dmg >= 25 && hit.dmg <= 40, "revolver body damage ~34", hit?.dmg);
}
{
  const { S, e } = withEnemy("bandit", 0, 22, { hp: 500 });
  aimAt(S, e.x, 1.7, e.z);
  // aim settles
  S.cam.aim = 1;
  aimAt(S, e.x, 1.7, e.z);
  const evs = run(S, 2, (i) => (i === 0 ? { ...E0, fireP: true, fire: true, aim: true } : E0));
  const hit = evs.find((v) => v.type === "hit");
  ok(hit?.head && hit.dmg > 60, "headshot deals headMul damage", JSON.stringify(hit));
}
{
  // wall between player and enemy blocks the shot (bank building, mission 4 town)
  const { S, e } = withEnemy("bandit", -21, 10);
  S.P.x = -2;
  S.P.z = 10;
  aimAt(S, e.x, 1.2, e.z);
  const hp0 = e.hp;
  const evs = run(S, 2, (i) => (i === 0 ? { ...E0, fireP: true, fire: true } : E0));
  ok(e.hp === hp0 && evs.some((v) => v.type === "impact"), "bullets don't pass through buildings");
  ok(segmentBlocked(-2, 1.4, 10, -21, 1.4, 10, S.obs) >= 0, "line of sight blocked by building");
}
{
  // range falloff: rifle at 100 m vs 10 m
  const near = withEnemy("bandit", 0, 22, { hp: 999 });
  near.S.P.w = "rifle";
  near.S.cam.aim = 1;
  aimAt(near.S, 0, 1.2, 22);
  const h1 = run(near.S, 2, (i) => (i === 0 ? { ...E0, fireP: true, fire: true, aim: true } : E0)).find((v) => v.type === "hit");
  const far = withEnemy("bandit", 0, -38, { hp: 999 });
  far.S.P.z = 44;
  far.S.P.w = "revolver";
  far.S.cam.aim = 1;
  aimAt(far.S, 0, 1.2, -38);
  const h2 = run(far.S, 2, (i) => (i === 0 ? { ...E0, fireP: true, fire: true, aim: true } : E0)).find((v) => v.type === "hit");
  ok(h1 && h1.dmg >= 60, "rifle full damage up close", h1?.dmg);
  ok(!h2 || h2.dmg < WEAPONS.revolver.dmg, "revolver damage falls off at 80 m", h2?.dmg);
}
{
  // shotgun: pellets + knockback/knockdown at close range
  const { S, e } = withEnemy("bandit", 0, 29, { hp: 999 });
  S.P.w = "shotgun";
  aimAt(S, e.x, 1.1, e.z);
  const evs = run(S, 2, (i) => (i === 0 ? { ...E0, fireP: true, fire: true } : E0));
  const hits = evs.filter((v) => v.type === "hit");
  ok(hits.length >= 4, "shotgun fires multiple pellets that hit", hits.length);
  ok(e.kvz < -1 || e.state === "down", "shotgun knocks the target back");
  ok(S.P.ammo.shotgun.mag === 1, "shotgun uses one shell per shot");
}
{
  // reload + ammo bookkeeping, auto reload when empty
  const { S } = withEnemy("bandit", 30, 40);
  S.P.w = "revolver";
  S.P.ammo.revolver = { mag: 6, res: 10 };
  for (let k = 0; k < 6; k++) run(S, 20, (i) => (i === 0 ? { ...E0, fireP: true, fire: true } : E0));
  ok(S.P.ammo.revolver.mag === 0 || S.P.reloadT > 0, "six shots empty the revolver");
  run(S, 120);
  ok(S.P.ammo.revolver.mag === 6 && S.P.ammo.revolver.res === 4, "empty gun auto-reloads from reserve", JSON.stringify(S.P.ammo.revolver));
  S.P.ammo.revolver.mag = 3;
  run(S, 1, { ...E0, reload: true });
  ok(S.P.reloadT > 0, "R starts a reload");
  run(S, 100);
  ok(S.P.ammo.revolver.mag === 6, "reload fills the magazine");
  // rifle reloads round by round
  S.P.w = "rifle";
  S.P.ammo.rifle = { mag: 5, res: 10 };
  run(S, 1, { ...E0, reload: true });
  run(S, Math.round(WEAPONS.rifle.reload * 60) + 2);
  ok(S.P.ammo.rifle.mag === 6, "rifle loads one round at a time", S.P.ammo.rifle.mag);
}
{
  // weapon switching with keys 1-4 and the wheel; locked weapons can't be selected
  const S = createSim(2, { stats: playerStats({ xp: 0, weapons: ["revolver", "shotgun"], upgrades: {}, abilities: {} }), seed: 2 });
  run(S, 1, { ...E0, weapon: 2 });
  ok(S.P.w === "shotgun", "key 2 selects the shotgun");
  run(S, 1, { ...E0, weapon: 3 });
  ok(S.P.w === "shotgun", "key 3 ignored while the rifle is locked");
  run(S, 30, (i) => (i === 0 ? { ...E0, wheel: 1 } : E0));
  ok(S.P.w === "revolver", "mouse wheel cycles owned weapons");
}
{
  // dual revolvers are automatic
  const { S } = withEnemy("bandit", 30, 40);
  S.P.w = "dual";
  S.P.ammo.dual = { mag: 12, res: 0 };
  run(S, 60, { ...E0, fire: true });
  ok(S.P.ammo.dual.mag <= 5, "holding the trigger fans the dual revolvers", S.P.ammo.dual.mag);
}

/* ------------------------------------------------------------ 2. fighting */
{
  const { S, e } = withEnemy("bandit", 0, 30.6, { hp: 999 });
  e.rot = Math.PI; // facing the player
  S.cam.yaw = 0;
  const hp0 = e.hp;
  let evs = run(S, 30, (i) => (i === 0 ? { ...E0, melee: true } : E0));
  ok(e.hp < hp0 && evs.some((v) => v.type === "punch"), "F punch damages an enemy in front");
  // three-hit combo knocks down
  const S2 = withEnemy("bandit", 0, 30.6, { hp: 999 });
  // keep stepping in behind the punches, like a player would
  const seq = (i) => ({ ...E0, mz: Math.hypot(S2.e.x - S2.S.P.x, S2.e.z - S2.S.P.z) > 1.3 ? 1 : 0, melee: i % 22 === 0 && i < 66 });
  run(S2.S, 90, seq);
  ok(S2.e.state === "down" || S2.e.kvz < 0, "third combo punch knocks the enemy down", S2.e.state);
  // kick
  const S3 = withEnemy("brawler", 0, 30.7, { hp: 999 });
  run(S3.S, 40, (i) => (i === 0 ? { ...E0, kick: true } : E0));
  ok(S3.e.state === "down", "V kick knocks an enemy down");
  // takedown on a knocked-down enemy (walk up to it first)
  run(S3.S, 40, () => ({ ...E0, mz: Math.hypot(S3.e.x - S3.S.P.x, S3.e.z - S3.S.P.z) > 1.2 ? 1 : 0 }));
  const it = S3.S.prompt;
  ok(it?.kind === "takedown", "takedown prompt on a downed enemy", it?.kind);
  run(S3.S, 60, (i) => (i === 0 ? { ...E0, interact: true } : E0));
  ok(!S3.e.alive && S3.S.counters.takedowns === 1, "E performs a takedown");
  // stealth takedown from behind
  const S4 = withEnemy("bandit", 0, 31, { hp: 999 });
  S4.e.rot = 0; // looking away (north)
  S4.S.P.z = 32;
  run(S4.S, 1);
  ok(S4.S.prompt?.kind === "takedown", "takedown from behind an unaware enemy");
  // stamina
  const S5 = withEnemy("bandit", 20, 0);
  const st0 = S5.S.P.st;
  run(S5.S, 1, { ...E0, kick: true });
  ok(S5.S.P.st < st0, "melee costs stamina");
}
{
  // enemy melee: block reduces, dodge roll avoids
  const mk = () => {
    const { S, e } = withEnemy("brawler", 0, 31, { alert: true });
    e.rot = 0;
    e.meleeCd = 0;
    S.P.rot = Math.PI; // facing the brawler (south→north is -z… the brawler is at z 31, player at 32: face -z)
    S.P.rot = 0;
    S.cam.yaw = 0;
    return { S, e };
  };
  const a = mk();
  run(a.S, 60);
  const dmgOpen = a.S.P.maxHp - a.S.P.hp;
  const b = mk();
  run(b.S, 60, { ...E0, block: true });
  const dmgBlock = b.S.P.maxHp - b.S.P.hp;
  ok(dmgOpen > 0, "brawler punches hurt", dmgOpen);
  ok(dmgBlock < dmgOpen * 0.4, "blocking (X) cuts melee damage", `${dmgBlock} vs ${dmgOpen}`);
  const c = mk();
  let rolled = false;
  run(c.S, 60, () => {
    if (!rolled && c.e.atk && c.e.atk.t > c.e.atk.wind - 0.12) {
      rolled = true;
      return { ...E0, dodge: true, mx: 1 };
    }
    return E0;
  });
  ok(c.S.P.hp === c.S.P.maxHp, "dodge roll i-frames avoid a punch", c.S.P.hp);
}

/* ------------------------------------------------------------ 3. AI */
{
  // enemies never hit through walls: player behind a building, enemy on the other side, alert
  const { S, e } = withEnemy("gunslinger", -13.6 - 6, 10, { alert: true });
  e.fireCd = 0;
  S.P.x = 0;
  S.P.z = 10;
  e.hold = true;
  run(S, 60 * 6);
  ok(S.P.hp === S.P.maxHp, "enemy can't shoot through a building", S.P.hp);
}
{
  // crouching behind low cover blocks enemy fire
  const S = createSim(7, { stats: playerStats(ALL), seed: 4 });
  const e = S.enemies[0];
  S.enemies = [e];
  S.step = { type: "reach", at: [999, 999], r: 1, text: "t" };
  // crate stack at (8,6) 1.2 m: put the player right behind it (south side), enemy north
  S.P.x = 8.6;
  S.P.z = 7.2;
  S.P.crouch = true;
  e.x = 8.6;
  e.z = -6;
  e.alert = true;
  e.hold = true;
  e.fireCd = 0;
  e.type = "bandit";
  const blocked = segmentBlocked(e.x, 1.4, e.z + 0.6, S.P.x, 0.8, S.P.z, S.obs) >= 0;
  run(S, 60 * 6);
  ok(blocked && S.P.hp === S.P.maxHp, "crouched behind a crate, enemy bullets hit the crate", `${blocked} ${S.P.hp}`);
}
{
  // navigation around obstacles: an alert brawler reaches a player behind a building
  const { S, e } = withEnemy("brawler", -20, 10, { alert: true });
  S.P.x = 0;
  S.P.z = 10;
  e.lastKnown = [0, 10];
  let reached = false;
  run(S, 60 * 15, () => {
    if (Math.hypot(e.x - S.P.x, e.z - S.P.z) < 2) reached = true;
    return E0;
  });
  ok(reached, "AI paths around buildings to reach the player");
}
{
  // detection: unaware enemy spots a player in front, ignores one behind
  const { S, e } = withEnemy("bandit", 0, 20, { alert: false });
  e.rot = 0; // looking north, player is south (behind)
  S.P.z = 28;
  run(S, 60);
  ok(!e.alert, "unaware enemy doesn't see a player behind it");
  e.rot = Math.PI;
  run(S, 90);
  ok(e.alert, "enemy spots a player in its view cone");
  // gunshots alert nearby enemies
  const t = withEnemy("bandit", 0, 10, { alert: false });
  t.e.rot = 0;
  t.S.P.z = 32;
  run(t.S, 1, { ...E0, fireP: true, fire: true });
  ok(t.e.alert, "gunfire alerts enemies within earshot");
}
{
  // dead enemies stop attacking
  const { S, e } = withEnemy("gunslinger", 0, 24, { alert: true, hp: 10 });
  aimAt(S, e.x, 1.2, e.z);
  run(S, 2, (i) => (i === 0 ? { ...E0, fireP: true, fire: true } : E0));
  ok(!e.alive, "enemy dies");
  const hp0 = S.P.hp;
  run(S, 300);
  ok(S.P.hp >= hp0 && !e.alive, "dead enemies stop attacking");
  ok(S.pickups.some((k) => k.kind === "cash"), "dead enemy drops money");
}

/* ------------------------------------------------------------ 4. duel */
{
  const mk = () => {
    const S = createSim(4, { stats: playerStats(ALL), seed: 7 });
    S.enemies.forEach((e) => (e.alive = false));
    // jump to the duel step through the real flow
    while (S.step.type !== "duel") {
      for (const e of S.enemies) e.alive = false;
      S.P.x = S.step.at?.[0] ?? S.P.x;
      S.P.z = S.step.at?.[1] ?? S.P.z;
      step(S, 1 / 60, E0);
    }
    return S;
  };
  const a = mk();
  ok(a.duel && a.duel.phase === "intro", "duel step starts the duel");
  run(a, 60 * 3);
  ok(a.duel.phase === "ready", "duel waits in the ready phase");
  run(a, 1, { ...E0, fireP: true });
  run(a, 30);
  ok(a.status === "dead" && a.deadReason === "duel", "drawing early loses the duel");
  respawn(a);
  ok(a.status === "play" && a.duel?.phase === "intro", "duel retry restarts the duel");
  // too slow
  const b = mk();
  while (b.duel.phase !== "draw") step(b, 1 / 60, E0);
  run(b, 90);
  ok(b.status === "dead", "not shooting before the reaction time loses");
  // fast and accurate wins; a miss doesn't
  const c = mk();
  while (c.duel.phase !== "draw") step(c, 1 / 60, E0);
  const f = c.duel.foe;
  const C = c.cam;
  const dx = f.x - C.pos[0], dz = f.z - C.pos[2];
  const missYaw = faceAngle(dx, dz) + 0.3;
  run(c, 1, { ...E0, dYaw: missYaw - C.yaw });
  run(c, 1, { ...E0, fireP: true });
  ok(c.duel?.result == null, "a missed shot doesn't win the duel");
  for (let k = 0; k < 4; k++) {
    const yaw = faceAngle(f.x - C.pos[0], f.z - C.pos[2]);
    const pitch = Math.atan2(1.2 - C.pos[1], Math.hypot(f.x - C.pos[0], f.z - C.pos[2]));
    run(c, 1, { ...E0, dYaw: yaw - C.yaw, dPitch: pitch - C.pitch });
  }
  run(c, 18);
  run(c, 1, { ...E0, fireP: true });
  ok(c.duel?.result === "win" && !f.alive, "hitting the opponent first wins the duel", c.duel?.result);
  run(c, 60 * 3);
  ok(c.status === "ending" || c.status === "complete", "winning the final duel step completes the mission", c.status);
}

/* ------------------------------------------------------------ 5. objectives, checkpoints, completion */
{
  const S = createSim(1, { stats: playerStats(ALL), seed: 1 });
  ok(S.step.type === "talk", "M1 starts with talking to the sheriff");
  const hale = S.npcs[0];
  S.P.x = hale.x;
  S.P.z = hale.z + 1.5;
  run(S, 2, (i) => (i === 0 ? { ...E0, interact: true } : E0));
  ok(S.stepI === 1 && S.step.type === "targets", "talking completes the talk step");
  ok(stepProgress(S).need === 5 && stepProgress(S).n === 0, "bottle step tracks 0/5");
  // shoot one bottle
  const b = S.objects.get("b2");
  S.P.x = b.x;
  S.P.z = b.z + 8;
  S.cam.aim = 1;
  aimAt(S, b.x, b.y + 0.15, b.z);
  run(S, 2, (i) => (i === 0 ? { ...E0, fireP: true, fire: true, aim: true } : E0));
  ok(b.done && stepProgress(S).n === 1, "shooting a bottle counts it");
  // death → respawn at the checkpoint
  const cp = S.checkpoint;
  S.P.hp = 1;
  S.P.x = 5;
  S.P.z = 5;
  S.P.alive = false;
  S.status = "dead";
  respawn(S);
  ok(S.status === "play" && S.P.hp > 1 && S.stepI === cp.stepI && Math.hypot(S.P.x - cp.x, S.P.z - cp.z) < 0.01, "respawn returns to the last checkpoint");
  ok(S.objects.get("b2").done, "checkpoint keeps finished objective progress");
}
{
  // defend failure: object destroyed → failed, respawn restores it
  const S = createSim(8, { stats: playerStats(ALL), seed: 1 });
  S.P.x = S.npcs[0].x;
  S.P.z = S.npcs[0].z + 1.2;
  run(S, 2, (i) => (i === 0 ? { ...E0, interact: true } : E0));
  ok(S.step.type === "defend", "M8 reaches the defend step");
  S.objects.get("jail").hp = 0;
  run(S, 2);
  ok(S.status === "failed", "a destroyed jail fails the objective");
  respawn(S);
  ok(S.status === "play" && S.objects.get("jail").hp > 0 && S.stepT < 0.1, "retry restores the defended object and timer");
}
{
  // weapons are given by missions
  const S = createSim(10, { stats: playerStats({ xp: 0, weapons: ["revolver", "shotgun"], upgrades: {}, abilities: {} }), seed: 1 });
  const o = S.objects.get("rifle");
  S.P.x = o.x + 1;
  S.P.z = o.z + 0.8;
  run(S, 40, { ...E0, interactHeld: true });
  ok(S.P.owned.includes("rifle") && S.P.w === "rifle", "M10 gives the Lever-Action Rifle");
}
{
  // every mission has distinct layout & objectives
  const sigs = new Set(MISSIONS.map((m) => `${m.location}|${m.steps.map((s) => s.type).join(",")}|${Object.values(m.groups).flat().length}`));
  ok(sigs.size === 20, "20 missions with distinct location/objective/enemy signatures", sigs.size);
  ok(MISSIONS.filter((m) => m.steps.some((s) => s.type === "duel")).map((m) => m.id).join(",") === "4,12,18,20", "duels in missions 4, 12, 18 and 20");
  ok(MISSIONS[19].final, "mission 20 is the finale");
}

/* ------------------------------------------------------------ 6. RPG, save, shop */
{
  ok(levelFromXp(0) === 1 && levelFromXp(xpForLevel(5)) === 5 && levelFromXp(xpForLevel(5) - 1) === 4, "XP curve → levels");
  const p0 = freshProgress();
  ok(p0.weapons.join() === "revolver" && p0.unlocked === 1, "new save: revolver only, mission 1 unlocked");
  // finishing mission 6 unlocks the shotgun and mission 7
  const S = createSim(6, { stats: playerStats(p0), seed: 1 });
  S.counters.shots = 10;
  S.counters.hits = 8;
  S.earn = { xp: 200, money: 50 };
  const { progress: p1, report } = completeMission({ ...p0, unlocked: 6 }, S);
  ok(p1.weapons.includes("shotgun") && report.newWeapon === "shotgun", "completing M6 unlocks the shotgun");
  ok(p1.unlocked === 7 && p1.completed[6], "completing a mission unlocks the next one");
  ok(p1.money === 50 + 260 && p1.xp === 200 + 400, "mission reward + loot are paid", `${p1.money} ${p1.xp}`);
  const { progress: p2 } = completeMission(p1, S);
  ok(p2.money - p1.money === 50 + 130, "replays pay half the mission reward");
  // shop
  const rich = { ...p1, money: 5000 };
  const q = buyWeaponUpgrade(rich, "revolver", "dmg");
  ok(q && q.upgrades.revolver.dmg === 1 && q.money === 5000 - weaponUpgradeCost("revolver", 0), "buying a damage upgrade");
  ok(playerStats(q).weapons.revolver.dmg > playerStats(rich).weapons.revolver.dmg, "damage upgrade raises revolver damage");
  ok(buyWeaponUpgrade({ ...p1, money: 0 }, "revolver", "dmg") === null, "can't buy without money");
  ok(buyWeaponUpgrade(rich, "rifle", "dmg") === null, "can't upgrade a locked weapon");
  const h = buyCharUpgrade(rich, "health");
  ok(playerStats(h).maxHp === playerStats(rich).maxHp + 20, "health upgrade +20 max health");
  ok(buyAbility({ ...rich, xp: 0 }, "deadEye") === null && buyAbility({ ...rich, xp: xpForLevel(3) }, "deadEye")?.abilities.deadEye, "abilities need the required level");
  // persistence
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveProgress(q, store);
  const back = loadProgress(store);
  ok(back.upgrades.revolver.dmg === 1 && back.weapons.includes("shotgun") && back.completed[6] && back.money === q.money, "progress round-trips through storage");
  ok(sanitize({ unlocked: 99, xp: -5, weapons: ["laser"], settings: { difficulty: "insane", sens: 50 } }).unlocked === 20, "corrupt saves are sanitized");
  ok(nextMissionId({ ...p0, unlocked: 3, completed: { 1: {}, 2: {} } }) === 3, "continue picks the first unfinished mission");
  // upgrades actually change the in-mission player
  const Sx = createSim(3, { stats: playerStats(h), seed: 1 });
  ok(Sx.P.maxHp === playerStats(h).maxHp, "upgraded health applies in missions");
}
{
  // dead eye slows the world, not the player
  const { S, e } = withEnemy("bandit", 10, 20, { alert: true });
  e.hold = true;
  S.deadEye.meter = 1;
  run(S, 1, { ...E0, deadEye: true });
  ok(S.deadEye.on && S.timeScale < 0.5, "Z toggles Dead Eye slow motion");
  run(S, 60);
  ok(S.deadEye.meter < 1, "Dead Eye drains its meter");
}
{
  // out of ammo → supply drop
  const { S } = withEnemy("bandit", 30, 40);
  for (const id of S.P.owned) S.P.ammo[id] = { mag: 0, res: 0 };
  run(S, 60 * 3);
  ok(S.pickups.some((k) => k.kind === "ammo"), "a supply box appears when completely out of ammo");
}
{
  // aim info flags a blocked line of fire
  const { S } = withEnemy("bandit", 30, 40);
  S.P.x = -8.2;
  S.P.z = -14.5; // right next to a building corner
  S.cam.yaw = Math.PI / 2;
  run(S, 2);
  const ai = aimInfo(S);
  ok(ai && typeof ai.blocked === "boolean", "aimInfo reports the crosshair state");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
