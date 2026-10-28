/**
 * Headless tests for Hogwarts Adventures (node, no browser):
 *
 *   node src/components/games/HogwartsAdventures/tools/simTest.mjs [units|campaign|all] [hero]
 *
 * units     collision, navigation, spell validation, Protego timing,
 *           combos, resistances, puzzles, progression, save/load + resume,
 *           hero switching, the protect encounter and the boss phases
 * campaign  the bot plays all 15 quests through real input for each hero
 */
import { Game } from "../engine/game.js";
import { newProfile, heroStats, buyTalent, upgradeSpell, equip, addItem } from "../engine/profile.js";
import { cast, shield, spawnBolt, hurtEnemy } from "../engine/combat.js";
import { loadSave, writeSave } from "../engine/save.js";
import { Bot, playCampaign } from "./bot.mjs";
import { HERO_IDS } from "../data/heroes.js";
import { QUEST_ORDER } from "../data/quests.js";
import { BRAZIER_ORDER } from "../data/objects.js";

const mode = process.argv[2] || "all";
const only = process.argv[3];
let pass = 0;
let fail = 0;
const ok = (cond, name, extra = "") => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
};
const DT = 1 / 60;
const idle = () => ({ mx: 0, mz: 0, dYaw: 0, dPitch: 0, sprint: false, dodge: false, cast: { down: false, pressed: false }, aim: false, interact: false, shield: false, q: false, r: false, potion: 0, lumos: false, slot: null, cycle: 0 });
const fresh = (hero = "harry", P) => new Game(P || newProfile(hero), { arrival: "new", seed: 3 });
const run = (G, sec, inpFn = idle) => {
  for (let i = 0; i < Math.round(sec / DT); i++) G.step(DT, inpFn());
  return G.drain();
};
const place = (G, x, z, yaw = Math.PI) => {
  Object.assign(G.player, { x, z, y: G.col.ground(x, z, 20), vy: 0, safe: { x, z, y: 0 } });
  G.camYaw = yaw;
  G.camPitch = -0.05;
  run(G, 0.05);
};
const lookAt = (G, x, y, z) => {
  const p = G.player;
  G.camYaw = Math.atan2(x - p.x, z - p.z);
  G.camPitch = Math.atan2(y - (p.y + 1.6), Math.hypot(x - p.x, z - p.z));
  run(G, 0.05);
};
const learnAll = (G) => ["incendio", "levioso", "accio", "alohomora", "reparo", "lumos", "patronum"].forEach((s) => (G.P.spells[s] = 1));

function units() {
  console.log("— collision & movement");
  {
    const G = fresh();
    place(G, 0, -19, Math.PI);
    run(G, 3, () => ({ ...idle(), mz: 1 }));
    ok(G.player.z < -25, "walks through the Great Hall door", G.player.z.toFixed(1));
    place(G, 6, -19, Math.PI);
    run(G, 3, () => ({ ...idle(), mz: 1 }));
    ok(G.player.z > -21.9, "the wall beside the door blocks", G.player.z.toFixed(1));
    place(G, 0, -54, Math.PI);
    run(G, 2, () => ({ ...idle(), mz: 1 }));
    ok(G.player.y > 0.5, "steps up onto the dais", G.player.y.toFixed(2));
    place(G, -10, -40, -Math.PI / 2);
    run(G, 2, () => ({ ...idle(), mz: 1 }));
    ok(G.player.x > -9.3 || G.player.x < -10.7 || G.player.z !== -40, "house tables block", G.player.x.toFixed(2));
    // pit fall → back on safe ground with a little damage
    G.objects.byId.slab.st.open = true;
    G.col.enable("slab", false);
    G.objects.byId.moving_wall.st.open = true;
    G.col.enable("moving_wall", false);
    place(G, -87, -12, Math.PI);
    const hp = G.player.hp;
    let fell = false;
    for (let i = 0; i < 300 && !fell; i++) {
      G.step(DT, { ...idle(), mz: 1 });
      fell = G.drain().some((e) => e.type === "fellOut");
    }
    run(G, 1);
    ok(fell && G.player.hp < hp && G.player.y > -1 && G.player.z > -14, "falling into the chasm returns you to safe ground", `${G.player.z.toFixed(1)} hp ${G.player.hp}`);
  }
  console.log("— navigation");
  {
    const G = fresh();
    ok(!!G.nav.findPath(0, 10, -40, 0, 20000), "path: courtyard → library");
    ok(!!G.nav.findPath(0, 10, -45, 84, 20000), "path: courtyard → Hagrid's hut");
    const p1 = G.nav.findPath(-81, 84, -95, 115, 20000);
    const last = p1 && p1[p1.length - 1];
    ok(!last || Math.hypot(last.x + 95, last.z - 115) > 3, "web blocks the forest path");
    G.objects.byId.web.st.burned = true;
    G.col.enable("web", false);
    const p2 = G.nav.findPath(-81, 84, -95, 115, 20000);
    ok(p2 && Math.hypot(p2[p2.length - 1].x + 95, p2[p2.length - 1].z - 115) < 1, "burned web opens the forest path");
  }
  console.log("— spell validation & effects");
  {
    const G = fresh();
    learnAll(G);
    place(G, 0, 10);
    G.P.equipped = "alohomora";
    const before = G.player.mana;
    cast(G, "alohomora");
    const ev = G.drain();
    ok(ev.some((e) => e.type === "deny") && G.player.mana === before, "Alohomora with nothing to unlock is refused, costs nothing");
    // gate
    place(G, -52, 0, -Math.PI / 2);
    lookAt(G, -56, 2, 0);
    ok(cast(G, "alohomora") && G.objects.byId.gate_restricted.st.unlocked, "Alohomora opens the Restricted Section gate");
    ok(!G.col.getDynamic("gate_restricted").on, "the opened gate stops blocking");
    // ancient door refuses
    place(G, -144, -60, Math.PI);
    lookAt(G, -144, 2.6, -64);
    G.player.cds = {};
    cast(G, "alohomora");
    ok(G.drain().some((e) => e.type === "deny" && /older magic/.test(e.text)), "the Ancient Door resists Alohomora");
    // cooldown + mana
    place(G, 0, 10);
    G.player.cds = {};
    G.player.mana = 100;
    cast(G, "stupefy");
    const m1 = G.player.mana;
    const again = cast(G, "stupefy");
    ok(!again && G.player.mana === m1, "cooldown blocks an immediate recast");
    ok(m1 === 100 - 8, "Stupefy costs 8 magic", m1);
    G.player.mana = 2;
    G.player.cds = {};
    ok(!cast(G, "incendio"), "not enough magic → no cast");
  }
  console.log("— Protego, combos, resistances");
  {
    const G = fresh();
    learnAll(G);
    place(G, 0, 10);
    const e = (G.spawnUnits([["darkWizard", 0, 0]], "t"), G.enemies.at(-1));
    // perfect block reflects
    shield(G);
    spawnBolt(G, { team: "enemy", kind: "dark", x: 0, y: 1.4, z: 6, dx: 0, dy: 0, dz: 1, speed: 30, dmg: 10, src: e, color: "#a35cff" });
    run(G, 0.9);
    ok(e.hp < e.maxHp, "a perfectly timed Protego reflects the bolt into its caster", e.hp);
    // late block only absorbs
    G.player.cds = {};
    G.player.mana = 100;
    shield(G);
    run(G, 0.5);
    const hp0 = e.hp;
    const php = G.player.hp;
    spawnBolt(G, { team: "enemy", kind: "dark", x: 0, y: 1.4, z: 7.5, dx: 0, dy: 0, dz: 1, speed: 30, dmg: 10, src: e, color: "#a35cff" });
    run(G, 0.2);
    ok(e.hp === hp0 && G.player.hp === php, "a late Protego blocks without reflecting");
    // no shield → damage
    G.player.shieldT = 0;
    spawnBolt(G, { team: "enemy", kind: "dark", x: 0, y: 1.4, z: 7.5, dx: 0, dy: 0, dz: 1, speed: 30, dmg: 10, src: e, color: "#a35cff" });
    run(G, 0.2);
    ok(G.player.hp < php, "unshielded bolts hurt");
    // levioso combo
    const w = (G.spawnUnits([["darkWizard", 3, 3]], "t2"), G.enemies.at(-1));
    w.liftT = 2;
    const a = hurtEnemy(G, w, 10, "stupefy");
    const lifted = w.maxHp - w.hp;
    const w2 = (G.spawnUnits([["darkWizard", -3, 3]], "t3"), G.enemies.at(-1));
    G.chain.t = 0;
    G.chain.n = 0;
    hurtEnemy(G, w2, 10, "stupefy");
    const plain = w2.maxHp - w2.hp;
    ok(a === "hit" && lifted >= plain * 1.8, "a levitated foe takes double damage", `${lifted} vs ${plain}`);
    // shields: only Expelliarmus breaks them
    w2.shieldT = 2;
    ok(hurtEnemy(G, w2, 10, "stupefy") === "shielded", "an enemy shield absorbs Stupefy");
    hurtEnemy(G, w2, 10, "expelliarmus");
    ok(w2.shieldT === 0, "Expelliarmus breaks the shield");
    // dementor resistances
    const d = (G.spawnUnits([["dementor", 6, 0]], "t4"), G.enemies.at(-1));
    hurtEnemy(G, d, 20, "stupefy");
    ok(d.hp > d.maxHp - 6, "Dementors shrug off ordinary spells", d.hp);
    hurtEnemy(G, d, 12, "patronum");
    ok(d.dead, "the Patronus destroys a Dementor");
    // heavy foes ignore levioso
    const ar = (G.spawnUnits([["armour", 0, 4]], "t5"), G.enemies.at(-1));
    lookAt(G, ar.x, 1.2, ar.z);
    G.player.cds = {};
    G.player.mana = 100;
    cast(G, "levioso");
    ok(!(ar.liftT > 0) && G.drain().some((x) => x.type === "deny"), "armour is too heavy for Levioso");
  }
  console.log("— puzzles");
  {
    const G = fresh();
    learnAll(G);
    G.objects.byId.secret_door.st.open = false;
    place(G, -87, -51);
    const lightIt = (id) => {
      const o = G.objects.byId[id];
      G.objects.apply(o, "incendio");
    };
    lightIt(BRAZIER_ORDER[1]);
    ok(!G.objects.byId[BRAZIER_ORDER[1]].st.lit, "lighting a brazier out of order puts it out");
    for (const id of BRAZIER_ORDER) lightIt(id);
    ok(G.flag("braziersSolved") && G.objects.byId.secret_door.st.open && !G.col.getDynamic("secret_door").on, "the correct order opens the secret door");
    // pillars
    for (const i of [1, 2, 3]) {
      const o = G.objects.byId[`pillar_${i}`];
      let guard = 0;
      while (!G.flag("pillarsSolved") && guard++ < 4) {
        G.objects.use(o);
        if (["eagle", "lion", "badger"][i - 1] === ["lion", "serpent", "eagle", "badger"][o.st.rot]) break;
      }
    }
    ok(G.flag("pillarsSolved") && !G.col.getDynamic("moving_wall").on, "matching the carvings sinks the wall");
    // slab needs the tapestry first
    const slab = G.objects.byId.slab;
    ok(G.objects.apply(slab, "levioso").ok === false, "the slab won't lift before the tapestry is revealed");
    G.objects.reveal(G.objects.byId.tapestry);
    ok(G.objects.apply(slab, "levioso").ok && !G.col.getDynamic("slab").on, "after Lumos, Levioso lifts the slab");
    // reparo bridge makes a floor
    G.objects.apply(G.objects.byId.bridge, "reparo");
    ok(G.col.ground(-87, -25, 0.3) > -1, "Reparo rebuilds the bridge you can walk on");
  }
  console.log("— progression, items, save/load");
  {
    const G = fresh();
    const lvl = G.P.heroes.harry.level;
    G.grantXp(400);
    ok(G.P.heroes.harry.level > lvl && G.P.heroes.harry.sp > 0, "XP raises the level and grants skill points");
    ok(G.P.heroes.ron.xp > 0 || G.P.heroes.ron.level > 1, "the rest of the party shares XP");
    const hp0 = heroStats(G.P).maxHp;
    ok(buyTalent(G.P, "vitality").ok && heroStats(G.P).maxHp > hp0, "Vitality raises maximum health");
    G.P.heroes.harry.sp = 1;
    ok(upgradeSpell(G.P, "stupefy").ok && G.P.spells.stupefy === 2, "a skill point upgrades a spell rank");
    addItem(G.P, "wand_yew", 1);
    const d0 = heroStats(G.P).dmgMul;
    ok(equip(G.P, "wand_yew").ok && heroStats(G.P).dmgMul > d0, "equipping the Yew wand raises spell power");
    // save + load
    const mem = new Map();
    const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    G.P.pos = G.snapshot();
    writeSave(G.P, store);
    const L = loadSave(store);
    ok(L.profile && L.profile.heroes.harry.level === G.P.heroes.harry.level && L.profile.inv.wand_yew === 1, "save/load round-trips the profile");
    mem.set("hogwarts-adventures-save", "{broken json");
    const L2 = loadSave(store);
    ok(!L2.profile && L2.status.corrupt && [...mem.keys()].some((k) => k.includes("damaged")), "a corrupt save is set aside, not crashed on");
    // resume mid-quest: book stage 2 with one book already killed → two respawn
    const P = newProfile("hermione");
    for (const q of ["meet", "explore", "lesson"]) P.quests[q] = { state: "done", stage: 0, prog: [] };
    P.quests.book = { state: "active", stage: 2, prog: [1] };
    Object.assign(P.spells, { levioso: 1, accio: 1, alohomora: 1, lumos: 1 });
    const G2 = new Game(P, { arrival: "checkpoint" });
    ok(G2.enemies.filter((e) => e.group === "books").length === 2, "loading mid-fight respawns only the books still owed");
    // hero switching
    const G3 = fresh();
    place(G3, 0, 8);
    ok(G3.switchHero("ron") && G3.P.hero === "ron" && G3.stats.maxHp > 140, "switching to Ron applies his stats");
    G3.spawnUnits([["darkWizard", 2, 6]], "x");
    G3.enemies.at(-1).aggro = true;
    ok(!G3.switchHero("draco"), "can't switch heroes mid-fight");
  }
  console.log("— protect encounter & boss");
  {
    const P = newProfile("harry");
    for (const q of QUEST_ORDER.slice(0, 8)) P.quests[q] = { state: "done", stage: 0, prog: [] };
    P.quests.defend = { state: "active", stage: 0, prog: [] };
    Object.assign(P.spells, { incendio: 1, levioso: 1, accio: 1, alohomora: 1, reparo: 1, lumos: 1, patronum: 1 });
    const G = new Game(P, { arrival: "checkpoint" });
    G.quests.resume();
    G.quests.onTalk("neville");
    ok(G.questStage("defend") === 1 && G.protect?.id === "neville", "talking to Neville starts the defence");
    G.hurtAlly(G.protect, 999);
    run(G, 3);
    ok(G.questStage("defend") === 1 && !G.protect.down && G.protect.hp === G.protect.maxHp, "if Neville falls the wave restarts");
    // boss
    const B0 = newProfile("draco");
    B0.quests.finale = { state: "active", stage: 0, prog: [] };
    B0.flags.arena = true;
    const GB = new Game(B0, { arrival: "checkpoint" });
    GB.godMode = true;
    run(GB, 8);
    const B = GB.boss;
    ok(B && B.phase === 1 && !B.e.invuln, "the duel begins after the intro");
    B.e.hp = B.e.maxHp * 0.6;
    run(GB, 0.5);
    ok(B.phase === 2 && B.sphere && B.e.invuln && GB.obelisks.every((o) => o.active), "at 66% he shields himself and wakes the obelisks");
    ok(hurtEnemy(GB, B.e, 50, "stupefy") === "shielded", "the sphere makes him immune");
    for (const o of GB.obelisks) GB.hurtObelisk(o, 999);
    ok(!B.sphere && B.e.stunT > 0, "destroying the obelisks breaks the sphere and dazes him");
    B.e.hp = B.e.maxHp * 0.3;
    B.e.stunT = 0;
    run(GB, 0.5);
    ok(B.phase === 3, "below 33% he enrages");
    B.e.hp = 1;
    run(GB, 0.2);
    ok(B.e.state === "finish", "at the end he falls to one knee");
    ok(hurtEnemy(GB, B.e, 30, "stupefy") === "shielded" && !B.e.dead, "only Expelliarmus can finish him");
    hurtEnemy(GB, B.e, 10, "expelliarmus");
    run(GB, 0.1);
    ok(B.e.dead && GB.questState("finale") === "done" && GB.victory, "Expelliarmus wins the duel");
    // dying mid-fight restores the boss to the phase checkpoint
    const B1 = newProfile("ron");
    B1.quests.finale = { state: "active", stage: 0, prog: [] };
    B1.flags.arena = true;
    const GD = new Game(B1, { arrival: "checkpoint" });
    run(GD, 8);
    GD.boss.e.hp = GD.boss.e.maxHp * 0.6;
    run(GD, 0.3);
    GD.playerDie();
    GD.respawn();
    run(GD, 2);
    ok(GD.boss.e.hp <= GD.boss.e.maxHp * 0.67 && GD.boss.e.hp > GD.boss.e.maxHp * 0.5 && !GD.player.dead, "falling in phase 2 restarts at the phase checkpoint");
  }
}

function campaign() {
  const heroes = only ? [only] : HERO_IDS;
  for (const h of heroes) {
    const t0 = Date.now();
    const bot = new Bot(h, { seed: 11 });
    let err = null;
    try {
      playCampaign(bot);
    } catch (e) {
      err = e;
    }
    const G = bot.G;
    const done = QUEST_ORDER.filter((q) => G.questState(q) === "done").length;
    ok(!err && done === 15 && G.victory, `campaign as ${h}: all 15 quests + victory`, err ? `(${err.message}; ${done}/15)` : `${done}/15`);
    console.log(`  ${h}: ${done}/15 quests · ${Math.round(G.time)} s game time · level ${G.P.heroes[h].level} · ${bot.deaths} deaths · ${Date.now() - t0} ms`);
  }
}

if (mode === "units" || mode === "all") units();
if (mode === "campaign" || mode === "all") campaign();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
