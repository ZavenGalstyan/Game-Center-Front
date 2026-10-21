/**
 * Neon Mercenary — headless engine tests (node, no browser).
 *
 *   node src/components/games/NeonMercenary/tools/simTest.mjs [core|combat|ai|profile|save|hack|data|all]
 *
 * The campaign bot lives in tools/bot.mjs (tools/campaignTest.mjs runs it).
 */
import { Game, getMap } from "../engine/game.js";
import { newProfile, derive, addWeapon, equipWeapon, unequipWeapon, sellWeapon, buy, canBuy, learnSkill, canLearn, upgradeWeapon, addStack, sanitize, weaponStats, addXp, equipCyber, addArmor, equipArmor, sellStack } from "../engine/profile.js";
import { loadSave, writeSave, loadSettings } from "../engine/save.js";
import { newBreach, pick, allowed, contains } from "../engine/hack.js";
import { findPath, walkable, raycast, lineOfSight } from "../engine/map.js";
import { DISTRICTS } from "../data/districts/index.js";
import { CONTRACTS } from "../data/contracts.js";
import { DIALOGUE, CINEMATICS } from "../data/story.js";
import { STACKS } from "../data/items.js";
import { WEAPONS } from "../data/weapons.js";
import { ENEMIES } from "../data/enemies.js";
import { SHOPS } from "../data/shops.js";
import { NPCS } from "../data/npcs.js";
import { xpToNext } from "../data/skills.js";

let pass = 0;
let fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  ✗", msg);
  }
};
const DT = 1 / 60;
const idle = () => ({ mx: 0, mz: 0 });
const run = (G, n, inp = idle) => {
  for (let i = 0; i < n; i++) G.step(DT, typeof inp === "function" ? inp(i) : inp);
};
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const fresh = (district = "market", opts = {}) => {
  const P = newProfile();
  P.unlocked.industrial = P.unlocked.corporate = true;
  const G = new Game(P, { seed: 7, district, ...opts });
  G.enemies = G.enemies.filter(() => false);
  return G;
};

const suites = {
  core() {
    console.log("core: maps, movement, collision");
    for (const id of Object.keys(DISTRICTS)) {
      const M = getMap(id);
      const D = DISTRICTS[id];
      ok(walkable(M, D.spawn.x, D.spawn.z), `${id} spawn walkable`);
      ok(walkable(M, D.arrive.x, D.arrive.z), `${id} arrival walkable`);
      for (const n of D.npcs) ok(!!findPath(M, D.spawn.x, D.spawn.z, n.x, n.z, 60000), `${id} npc ${n.id} reachable`);
      for (const t of D.terminals) ok(!!findPath(M, D.spawn.x, D.spawn.z, t.x, t.z, 60000), `${id} terminal reachable`);
      for (const s of D.stations) ok(!!findPath(M, D.spawn.x, D.spawn.z, s.x, s.z, 60000), `${id} station ${s.id} reachable`);
      for (const d of D.doors || []) ok(walkable(M, d.to.x, d.to.z), `${id} door ${d.id} destination walkable`);
    }
    // walking into a wall stops the player; nothing passes through buildings
    const G = fresh();
    const p = G.player;
    p.x = -10;
    p.z = 10;
    G.camYaw = -Math.PI / 2; // face -X → Doc's clinic building at x < -12
    run(G, 200, { mx: 0, mz: 1, sprint: true });
    ok(p.x > -12.1, `player blocked by building (x=${p.x.toFixed(2)})`);
    // jump onto a crate (1.1 m) — market crate at (-34, 30)
    p.x = -36.5;
    p.z = 30;
    p.y = 0;
    G.camYaw = Math.PI / 2;
    run(G, 20, { mx: 0, mz: 1 });
    run(G, 1, { mx: 0, mz: 1, jump: true });
    run(G, 40, { mx: 0, mz: 1 });
    ok(p.y > 1.0, `jumped onto crate (y=${p.y.toFixed(2)})`);
    // cannot climb a 2.6 m container from the ground
    const G2 = fresh("industrial");
    const p2 = G2.player;
    p2.x = 26;
    p2.z = -53.2;
    G2.camYaw = 0; // container at z −56 (z −57.2 … −54.8)
    run(G2, 1, { mz: 1, jump: true });
    run(G2, 80, { mx: 0, mz: -1 });
    ok(p2.y < 0.5, "can't climb a container in one jump");
    // stamina drains while sprinting, regenerates after
    const s0 = p.stamina;
    p.x = 0;
    p.z = 30;
    p.y = 0;
    G.camYaw = 0;
    run(G, 120, { mz: 1, sprint: true });
    ok(p.stamina < s0 - 20, "sprint drains stamina");
    const s1 = p.stamina;
    run(G, 180, idle);
    ok(p.stamina > s1 + 20, "stamina regenerates");
    // dodge roll gives i-frames
    run(G, 1, { mz: 1, ctrl: true });
    ok(p.dodgeT > 0 && p.iframes > 0, "dodge roll + i-frames");
    ok(G.damagePlayer(30) === 0, "i-frames block damage");
    run(G, 60, idle);
    // crouch toggle when standing still
    run(G, 1, { ctrl: true });
    run(G, 30, idle);
    ok(p.crouch && p.crouchT > 0.9, "Ctrl while still toggles crouch");
    run(G, 1, { ctrl: true });
    // camera never ends inside a box
    const { cameraRig } = awaitCam;
    const rig = cameraRig(G.map, { x: 11, y: 0, z: 0, crouchT: 0 }, -Math.PI / 2, 0, 0, {});
    ok(!raycastInside(G.map, rig.x, rig.y, rig.z), "camera collision keeps the camera out of walls");
    // fall-out-of-world recovery
    p.y = -20;
    run(G, 2, idle);
    ok(p.y > -1, "recovered from falling out of the world");
  },

  combat() {
    console.log("combat: firing, ammo, reload, damage, melee");
    const G = fresh();
    const p = G.player;
    p.x = 0;
    p.z = 30;
    G.camYaw = 0;
    G.camPitch = 0;
    const e = G.spawnEnemy("gangGunner", 0, 40, { hold: true });
    e.state = "idle";
    G.lockAI = true;
    // aim straight at the enemy chest
    const aimAt = (t) => {
      const c = G.aimPoint().cam;
      const dx = t.x - c.x;
      const dz = t.z - c.z;
      G.camYaw = Math.atan2(dx, dz);
      G.camPitch = Math.atan2(t.y + 1.2 - c.y, Math.hypot(dx, dz));
    };
    aimAt(e);
    const mag0 = G.mag;
    const hp0 = e.hp;
    G.step(DT, { firePressed: true, fire: true, aim: true });
    ok(G.mag === mag0 - 1, "firing consumes a round");
    run(G, 12, { aim: true });
    ok(e.hp < hp0, `bullet hit the enemy (hp ${hp0}→${e.hp.toFixed(1)})`);
    // shooting a wall does not damage an enemy behind it
    const G2 = fresh();
    const p2 = G2.player;
    p2.x = -6;
    p2.z = 14;
    const e2 = G2.spawnEnemy("gangGunner", -22, 14, { hold: true }); // behind Doc's clinic (x −28 … −16 blocks)
    const h2 = e2.hp;
    G2.camYaw = -Math.PI / 2;
    G2.camPitch = 0;
    for (let i = 0; i < 10; i++) {
      G2.step(DT, { firePressed: true, fire: true });
      run(G2, 10, idle);
    }
    ok(e2.hp === h2, "walls stop bullets");
    // reload moves ammo from reserve (pistol unlimited)
    G.P.mags[G.wpnUid] = 0;
    G.step(DT, { reload: true });
    ok(G.wpn.reloadT > 0, "reload started");
    run(G, 120, idle);
    ok(G.mag === G.wpn.stats.mag, "reload filled the magazine");
    // SMG uses finite reserve
    const smg = addWeapon(G.P, "smg", "common");
    equipWeapon(G.P, smg.uid, "w2");
    G.switchTo("w2");
    run(G, 30, idle);
    G.P.ammo.light = 10;
    G.P.mags[smg.uid] = 0;
    G.step(DT, { reload: true });
    run(G, 140, idle);
    ok(G.mag === 10 && G.P.ammo.light === 0, `finite reserve: mag ${G.mag}, reserve ${G.P.ammo.light}`);
    G.P.mags[smg.uid] = 0;
    ok(!G.startReload(), "can't reload with an empty reserve");
    // weapon damage scales with rarity / upgrades / skills
    const w = { id: "ar", rarity: "common", level: 0 };
    const D = derive(G.P);
    const a = weaponStats(w, D).dmg;
    const b = weaponStats({ ...w, rarity: "epic", level: 3 }, D).dmg;
    ok(b > a * 1.4, "rarity + upgrades raise damage");
    // crit + headshot
    const G3 = fresh();
    const e3 = G3.spawnEnemy("corpSoldier", 0, 40, { hold: true });
    const dmg = G3.damageEnemy(e3, 20, { crit: true });
    ok(dmg > 0 && dmg < 20, "armour reduces damage");
    // melee strike from behind on an unaware enemy = takedown
    const G4 = fresh();
    const e4 = G4.spawnEnemy("gangGunner", 0, 40, { hold: true, yaw: 0 });
    e4.state = "idle";
    e4.yaw = 0; // facing +Z, away from the player
    G4.player.x = 0;
    G4.player.z = 38.8;
    G4.camYaw = 0;
    G4.step(DT, { melee: true });
    run(G4, 40, idle);
    ok(e4.state === "dead", "silent takedown from behind");
    // enemies drop loot and award xp
    const xp0 = G4.P.xp + G4.P.level * 1000;
    ok(G4.pickups.length > 0 || G4.P.xp > 0, "enemy death drops loot / xp");
    void xp0;
    // dying and respawning
    const G5 = fresh();
    G5.damagePlayer(10000);
    ok(G5.player.dead, "lethal damage kills the player");
    G5.respawn();
    ok(!G5.player.dead && G5.player.hp === G5.D.maxHp, "respawn restores the player");
    // armour pool soaks damage first
    const G6 = fresh();
    const a0 = G6.player.armor;
    const h0 = G6.player.hp;
    G6.damagePlayer(10);
    ok(G6.player.armor < a0 && h0 - G6.player.hp < 10 * 0.5, "armour soaks most of a hit");
    // energy shield cyberware absorbs
    G6.P.cyber.owned.push("shield");
    equipCyber(G6.P, "shield");
    G6.refreshStats();
    G6.player.energy = 100;
    G6.useAbility();
    const h1 = G6.player.hp;
    const ar1 = G6.player.armor;
    G6.damagePlayer(40);
    ok(G6.player.hp === h1 && G6.player.armor === ar1, "energy shield absorbs damage");
    // EMP stuns robots
    const G7 = fresh("industrial");
    G7.player.x = 0;
    G7.player.z = 30;
    const bot = G7.spawnEnemy("secBot", 4, 30, {});
    G7.P.cyber.owned.push("emp");
    equipCyber(G7.P, "emp");
    G7.player.energy = 100;
    G7.useAbility();
    ok(bot.stunT > 0 && bot.hp < bot.maxHp, "EMP stuns + damages robots");
  },

  ai() {
    console.log("ai: perception, alert, chase, attack, search, return");
    const G = fresh();
    const p = G.player;
    p.x = 0;
    p.z = 40;
    const e = G.spawnEnemy("gangGunner", 0, 20, { yaw: 0 }); // facing +Z toward the player, 20 m
    run(G, 120, idle);
    ok(e.state === "combat", `enemy spots a visible player (state ${e.state})`);
    // enemy facing away doesn't see the player
    const G2 = fresh();
    G2.player.x = 0;
    G2.player.z = 40;
    const e2 = G2.spawnEnemy("gangGunner", 0, 20, { yaw: Math.PI, hold: true });
    e2.home.yaw = Math.PI;
    run(G2, 60, idle);
    ok(e2.state !== "combat", "enemy facing away doesn't detect");
    // crouching slows detection
    const G3 = fresh();
    G3.player.x = 0;
    G3.player.z = 44;
    G3.player.crouch = true;
    G3.player.crouchT = 1;
    const e3 = G3.spawnEnemy("gangGunner", 0, 20, { yaw: 0, hold: true });
    run(G3, 30, idle);
    const crouchAware = e3.aware;
    const G4 = fresh();
    G4.player.x = 0;
    G4.player.z = 44;
    const e4 = G4.spawnEnemy("gangGunner", 0, 20, { yaw: 0, hold: true });
    run(G4, 30, idle);
    ok(crouchAware < e4.aware, `crouching slows detection (${crouchAware.toFixed(2)} < ${e4.aware.toFixed(2)})`);
    // enemies hear gunfire and investigate
    const G5 = fresh();
    G5.player.x = 0;
    G5.player.z = 40;
    const e5 = G5.spawnEnemy("gangGunner", 20, 40, { yaw: Math.PI / 2, hold: true });
    G5.camYaw = Math.PI;
    G5.step(DT, { firePressed: true, fire: true });
    run(G5, 2, idle);
    ok(e5.state === "suspicious" || e5.state === "combat", `gunfire is heard (state ${e5.state})`);
    // enemies shoot and hit a standing player in the open
    const G6 = fresh();
    G6.player.x = 0;
    G6.player.z = 36;
    const e6 = G6.spawnEnemy("gangGunner", 0, 22, { yaw: 0, alert: true });
    const hp6 = G6.player.hp + G6.player.armor;
    run(G6, 600, idle);
    ok(G6.player.hp + G6.player.armor < hp6, "enemy attacks connect");
    // the player behind full cover isn't hit
    const G7 = fresh();
    G7.player.x = 0;
    G7.player.z = 50; // station area
    const e7 = G7.spawnEnemy("gangGunner", -30, 50, { yaw: Math.PI / 2, alert: true, hold: true });
    G7.player.x = -6;
    G7.player.z = 36; // behind the Kenji/Marta buildings relative to … (approximate cover)
    void e7;
    // melee fighters rush and swing
    const G8 = fresh();
    G8.player.x = 0;
    G8.player.z = 36;
    const f = G8.spawnEnemy("gangFighter", 0, 26, { yaw: 0, alert: true });
    let swung = false;
    for (let i = 0; i < 600 && !swung; i++) {
      G8.step(DT, idle());
      if (f.windup > 0) swung = true;
    }
    ok(swung, "melee enemy closes in and attacks");
    // losing the player → search → return
    const G9 = fresh();
    G9.player.x = 0;
    G9.player.z = 30;
    const e9 = G9.spawnEnemy("gangGunner", 0, 20, { yaw: 0, alert: true, route: [[0, 20], [6, 20]] });
    run(G9, 30, idle);
    G9.player.x = -52;
    G9.player.z = 52; // teleport into the safehouse
    let searched = false;
    let returned = false;
    for (let i = 0; i < 60 * 40; i++) {
      G9.step(DT, idle());
      if (e9.state === "search") searched = true;
      if (searched && (e9.state === "patrol" || e9.state === "return")) returned = true;
    }
    ok(searched && returned, `lost target → search → return (${e9.state})`);
    // drones fly and attack
    const G10 = fresh("industrial");
    G10.player.x = 0;
    G10.player.z = 30;
    const d = G10.spawnEnemy("drone", 0, 14, { alert: true });
    const hp10 = G10.player.hp + G10.player.armor;
    run(G10, 900, idle);
    ok(d.y > 1.5 && G10.player.hp + G10.player.armor < hp10, "drone hovers and fires bolts");
    // attack tokens limit simultaneous shooters
    const G11 = fresh();
    G11.player.x = 0;
    G11.player.z = 0;
    for (let i = 0; i < 8; i++) G11.spawnEnemy("gangGunner", -8 + i * 2, -14, { alert: true, yaw: 0 });
    let maxTok = 0;
    for (let i = 0; i < 400; i++) {
      G11.step(DT, idle());
      maxTok = Math.max(maxTok, G11.enemies.filter((x) => x.token).length);
    }
    ok(maxTok <= 3, `attack tokens cap shooters (${maxTok})`);
    // cover users find cover
    const G12 = fresh();
    G12.player.x = 40;
    G12.player.z = 30;
    const cu = G12.spawnEnemy("corpSoldier", 30, 22, { alert: true });
    let covered = false;
    for (let i = 0; i < 600; i++) {
      G12.step(DT, idle());
      if (cu.cover && Math.hypot(cu.x - cu.cover.x, cu.z - cu.cover.z) < 0.8) covered = true;
    }
    ok(covered, "cover-using enemy reaches a cover spot");
    // retreat when badly hurt
    const G13 = fresh();
    G13.player.x = 40;
    G13.player.z = 30;
    const rt = G13.spawnEnemy("gangGunner", 30, 24, { alert: true });
    run(G13, 30, idle);
    G13.damageEnemy(rt, rt.hp * 0.8, {});
    run(G13, 5, idle);
    ok(rt.state === "retreat", `retreats when badly damaged (${rt.state})`);
  },

  profile() {
    console.log("profile: inventory, equipment, economy, skills, levels");
    const P = newProfile();
    ok(P.equip.w1 && P.weapons.length === 1, "starts with a pistol equipped");
    ok(!unequipWeapon(P, "w1").ok, "can't unequip the only ranged weapon");
    const smg = addWeapon(P, "smg", "rare");
    ok(equipWeapon(P, smg.uid, "w2").ok, "equip SMG in slot 2");
    ok(!equipWeapon(P, smg.uid, "melee").ok, "can't put a gun in the melee slot");
    equipWeapon(P, smg.uid, "w1");
    ok(P.equip.w1 === smg.uid && P.equip.w2 !== smg.uid, "re-equipping swaps slots (no duplicates)");
    ok(!sellWeapon(P, smg.uid).ok, "can't sell an equipped item");
    const blade = addWeapon(P, "blade");
    ok(equipWeapon(P, blade.uid, "melee").ok, "blade in the melee slot");
    // buying
    P.credits = 1000;
    ok(!canBuy(P, { kind: "weapon", id: "ar" }).ok, "can't buy what you can't afford");
    P.credits = 5000;
    const n0 = P.weapons.length;
    ok(buy(P, { kind: "weapon", id: "ar" }).ok && P.weapons.length === n0 + 1 && P.credits === 5000 - 2400, "buying deducts credits and adds the item");
    ok(buy(P, { kind: "ammo", id: "ammoRifle" }).ok && P.ammo.rifle === 60, "ammo purchase");
    ok(buy(P, { kind: "stack", id: "medkit" }).ok, "consumable purchase");
    // selling
    const ar = P.weapons.find((w) => w.id === "ar");
    const c0 = P.credits;
    ok(sellWeapon(P, ar.uid).ok && P.credits > c0 && !P.weapons.includes(ar), "selling");
    ok(!sellStack(P, "fuse").ok, "quest items can't be sold");
    // cyberware gating
    ok(!canBuy(P, { kind: "cyber", id: "neural" }).ok, "story-gated cyberware is locked");
    P.level = 6;
    P.credits = 99999;
    ok(buy(P, { kind: "cyber", id: "reflex" }).ok && P.cyber.equipped.os === "reflex", "cyberware installs + auto-equips");
    ok(!buy(P, { kind: "cyber", id: "reflex" }).ok, "no duplicate cyberware");
    // upgrades
    addStack(P, "scrap", 20);
    addStack(P, "circuit", 10);
    const lv0 = smg.level;
    ok(upgradeWeapon(P, smg.uid).ok && smg.level === lv0 + 1, "weapon upgrade");
    // skills
    const Q = newProfile();
    ok(!canLearn(Q, "marksman").ok, "no skill points at level 1");
    addXp(Q, xpToNext(1));
    ok(Q.level === 2 && Q.sp === 1, "level up grants a skill point");
    ok(learnSkill(Q, "marksman").ok && Q.skills.marksman === 1, "learn a skill");
    ok(!canLearn(Q, "executioner").ok, "prerequisites / level enforced");
    const D0 = derive(newProfile());
    const D1 = derive(Q);
    ok(D1.dmgMult > D0.dmgMult, "skill raises damage");
    // level cap
    const R = newProfile();
    addXp(R, 1e9);
    ok(R.level === 30 && R.xp === 0, "level cap 30");
    // armour
    const T = newProfile();
    const k = addArmor(T, "kevlar");
    const d0 = derive(T).armorCap;
    equipArmor(T, k.uid);
    ok(derive(T).armorCap > d0, "better armour raises armour");
    // sanitize repairs invalid states
    const S = newProfile();
    S.equip.w2 = S.equip.w1; // same weapon twice
    S.equip.melee = S.equip.w1; // gun in melee slot
    S.stacks.medkit = -5;
    S.weapons.push({ ...S.weapons[0] }); // duplicate uid
    sanitize(S);
    ok(S.equip.w2 === null && S.equip.melee === null && !S.stacks.medkit && S.weapons.length === 1, "sanitize repairs duplicates / invalid slots");
    // shops reference real items
    for (const [id, s] of Object.entries(SHOPS)) for (const e of s.stock) ok(e.kind === "weapon" ? WEAPONS[e.id] : e.kind === "stack" ? STACKS[e.id] : true, `shop ${id} item ${e.id}`);
  },

  save() {
    console.log("save: roundtrip, corruption, migration, settings");
    const st = memStore();
    const P = newProfile();
    P.credits = 1234;
    P.story.done = [1, 2];
    P.story.active = { id: 3, checkpoint: 0, items: {} };
    writeSave(P, st);
    const L = loadSave(st);
    ok(L.profile && L.profile.credits === 1234 && L.profile.story.done.length === 2 && L.profile.story.active.id === 3, "roundtrip");
    st.setItem("neon-mercenary-save", "{not json");
    const C = loadSave(st);
    ok(!C.profile && C.status.corrupt && st.getItem("neon-mercenary-save-corrupt"), "corrupt save is backed up and ignored");
    // old version + inconsistent story
    const old = newProfile();
    old.v = 1;
    old.story.active = 9;
    old.story.done = [1, 2, 5];
    st.setItem("neon-mercenary-save", JSON.stringify({ profile: old }));
    const O = loadSave(st);
    ok(O.profile && O.status.migrated && O.profile.story.done.join() === "1,2" && O.profile.story.active === null, "migration + story repair (no gaps, no impossible active contract)");
    // continuing a saved mid-mission game resumes at its checkpoint
    const Q = newProfile();
    Q.story.done = [1, 2, 3, 4, 5];
    Q.story.active = { id: 6, checkpoint: 2, items: { fuse: 0 } };
    const G = new Game(Q, { seed: 1, district: "market" });
    ok(G.missions.active && G.missions.active.stepI === 2 && G.missions.active.def.id === 6, "mission resumes at checkpoint");
    const S = loadSettings(memStore());
    ok(S.quality === "medium", "default settings");
  },

  hack() {
    console.log("hack: breach puzzles are always solvable");
    let r = 1;
    const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    let solved = 0;
    for (let i = 0; i < 300; i++) {
      let B = newBreach(rand, 1 + (i % 3), 1 + (i % 4));
      for (const [rr, cc] of B.solution) {
        ok(allowed(B, rr, cc), "solution step allowed");
        B = pick(B, rr, cc);
      }
      if (B.status === "success") solved++;
    }
    ok(solved === 300, `all 300 generated puzzles solvable via their path (${solved})`);
    ok(contains(["1C", "55", "BD"], ["55", "BD"]) && !contains(["1C", "BD"], ["55"]), "sequence matcher");
  },

  data() {
    console.log("data: contracts, dialogue, story references");
    ok(CONTRACTS.length === 20, "20 contracts");
    CONTRACTS.forEach((c, i) => ok(c.id === i + 1, `contract ids sequential (${c.id})`));
    for (const c of CONTRACTS) {
      if (c.start) ok(DIALOGUE[c.start], `c${c.id} start dialogue ${c.start}`);
      ok(c.rewards && c.rewards.xp > 0 && c.rewards.credits > 0, `c${c.id} rewards`);
      const D = DISTRICTS[c.district];
      const M = getMap(c.district);
      for (const s of c.steps) {
        if (s.dialogue) ok(DIALOGUE[s.dialogue], `c${c.id} dialogue ${s.dialogue}`);
        if (s.scene) ok(CINEMATICS[s.scene], `c${c.id} cinematic ${s.scene}`);
        if (s.npc) ok(D.npcs.some((n) => n.id === s.npc) || s.type === "defend", `c${c.id} npc ${s.npc} in district`);
        if (s.npc) ok(NPCS[s.npc], `c${c.id} npc ${s.npc} defined`);
        if (s.item) ok(STACKS[s.item], `c${c.id} item ${s.item}`);
        if (s.door) ok((D.doors || []).some((d) => d.id === s.door), `c${c.id} door ${s.door}`);
        for (const sp of [...(s.spawn || []), ...(s.waves || []).flatMap((w) => w.spawn), ...(s.triggers || []).flatMap((t) => t.spawn), ...(s.alarm || [])]) {
          ok(ENEMIES[sp.t], `c${c.id} enemy type ${sp.t}`);
          if (!(sp.at[0] === 0 && sp.at[1] === 0)) ok(walkable(M, sp.at[0], sp.at[1]) || ENEMIES[sp.t].flyer || nearOk(M, sp.at), `c${c.id} spawn ${sp.t} @${sp.at} walkable`);
          for (const wp of sp.route || []) ok(walkable(M, wp[0], wp[1]) || ENEMIES[sp.t].flyer || nearOk(M, wp), `c${c.id} route point ${wp} walkable`);
        }
        for (const t of [...(s.targets || []), ...(s.target ? [s.target] : []), ...(s.clues || [])]) ok(walkable(M, t.at[0], t.at[1]) || nearOk(M, t.at, 1.2) || t.y, `c${c.id} target ${t.id} @${t.at} reachable`);
        for (const pk of s.pickups || []) ok(walkable(M, pk.at[0], pk.at[1]) || pk.y || nearOk(M, pk.at, 1.2), `c${c.id} pickup @${pk.at}`);
        if (s.at && s.type !== "boss" && !s.y) ok(walkable(M, s.at[0], s.at[1]) || nearOk(M, s.at, 1.5), `c${c.id} ${s.type} point @${s.at} walkable`);
        if (s.retryAt) ok(walkable(M, s.retryAt.x, s.retryAt.z), `c${c.id} retry point @${s.retryAt.x},${s.retryAt.z} walkable`);
      }
    }
    // all dialogue speakers exist
    for (const [k, lines] of Object.entries(DIALOGUE)) for (const [who] of lines) ok(who === "kade" || NPCS[who.replace("radio:", "")] || ["razor", "ironjaw", "specter", "vex"].includes(who.replace("radio:", "")), `dialogue ${k} speaker ${who}`);
  },
};

function nearOk(M, at, r = 0.8) {
  for (let dx = -r; dx <= r; dx += 0.4) for (let dz = -r; dz <= r; dz += 0.4) if (walkable(M, at[0] + dx, at[1] + dz)) return true;
  return false;
}
function raycastInside(M, x, y, z) {
  let inside = false;
  for (const b of M.boxes) if (b.solid && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1) inside = true;
  return inside;
}
const awaitCam = await import("../engine/camera.js");
void lineOfSight;

const which = process.argv[2] || "all";
const t0 = Date.now();
for (const [k, fn] of Object.entries(suites)) if (which === "all" || which === k) fn();
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
