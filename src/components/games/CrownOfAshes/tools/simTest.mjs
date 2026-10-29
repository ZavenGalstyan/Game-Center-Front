/**
 * Crown of Ashes — headless test suite (node, no browser).
 *
 *   node src/components/games/CrownOfAshes/tools/simTest.mjs quick       unit checks
 *   node src/components/games/CrownOfAshes/tools/simTest.mjs campaign    4 bot playthroughs
 *   node src/components/games/CrownOfAshes/tools/simTest.mjs all
 *   node src/components/games/CrownOfAshes/tools/simTest.mjs run knight  one plan, verbose
 *
 * The campaign runs drive the real Game with the same per-step input the
 * keyboard produces (tools/bot.mjs) and cover every main quest, two side
 * quests each, all three crown endings, both dragon fates, all three of
 * Garrick's fates, a mid-campaign save → reload, and the ending event.
 */
import { getTerrain } from "../engine/terrain.js";
import { getWorld } from "../engine/world.js";
import { Game } from "../engine/game.js";
import { newProfile, computeStats, equip, learnSkill, buy, sell, upgrade, addItem, byUid } from "../engine/profile.js";
import { migrate, loadSave, writeSave } from "../engine/save.js";
import { applyDamage } from "../engine/combat.js";
import { check } from "../engine/conditions.js";
import { QUESTS, MAIN_ORDER } from "../data/quests.js";
import { DIALOGUE } from "../data/dialogue.js";
import { ITEMS, CHEST_LOOT } from "../data/items.js";
import { HEROES, ABILITIES } from "../data/heroes.js";
import { ENEMIES } from "../data/enemies.js";
import { INTERIOR_MAPS } from "../data/interiors.js";
import { createBot, PLANS } from "./bot.mjs";

const mode = process.argv[2] || "quick";
let pass = 0;
let fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
  return c;
};
const section = (s) => console.log(`\n■ ${s}`);
const inp = (o = {}) => ({ mx: 0, mz: 0, dYaw: 0, dPitch: 0, attack: {}, ...o });

function quick() {
  section("terrain & world");
  const T = getTerrain();
  ok(T.N === 513, "grid size");
  ok(Math.abs(T.height(0, 150) - 6) < 1, "village sits on its flat");
  ok(Math.abs(T.height(0, -300) - 26) < 1, "castle plateau");
  ok(Math.abs(T.height(310, -330) - 58) < 1.5, "dragon sanctum plateau");
  ok(T.waterAt(46, 120) > -1e8, "river has water");
  const W = getWorld();
  ok(W.trees.length > 3000 && W.rocks.length > 500, `scatter (${W.trees.length} trees, ${W.rocks.length} rocks)`);
  ok(W.interact.length > 40, "interactables");
  for (const R of T.roads) {
    let maxS = 0;
    for (const p of R.pts) if (!(Math.abs(p[0] - 46) < 12 && Math.abs(p[1] - 150) < 12) && !(Math.abs(p[0] - 52) < 12 && Math.abs(p[1] + 11) < 12)) maxS = Math.max(maxS, T.slope(p[0], p[1]));
    ok(maxS < 0.75, `road ${R.id} walkable (max slope ${maxS.toFixed(2)})`);
  }
  section("navigation");
  const P2 = (a, b) => W.nav.path(a[0], a[1], b[0], b[1], 120000);
  for (const [n, a, b] of [
    ["village→castle", [-6, 160], [0, -268]],
    ["village→ashfall gate", [-6, 160], [250, 20]],
    ["village→sanctum", [-6, 160], [312, -318]],
    ["village→red hand", [-6, 160], [-300, 200]],
    ["village→den", [-6, 160], [-330, -80]],
    ["village→ember camp", [-6, 160], [160, 240]],
    ["village→mines", [-6, 160], [-95, -250]],
    ["village→grate", [-6, 160], [334, 100]],
  ]) {
    const p = P2(a, b);
    ok(p && !p.partial, `${n} reachable`);
  }
  for (const [id, map] of Object.entries(INTERIOR_MAPS)) {
    const I = W.interiors[id];
    W.col.setGate("seal", false);
    const tgt = id === "crypt" ? I.altar : I.ladder;
    const p = W.nav.path(I.arrive.x, I.arrive.z, tgt.x, tgt.z, 20000);
    ok(p && !p.partial, `${id}: arrival → ${id === "crypt" ? "altar" : "ladder"} reachable`);
    ok(map.every((r) => r.length === map[0].length), `${id}: rectangular map`);
  }
  section("collision");
  const pos = { x: 0, z: -292 };
  W.col.resolve(pos, 0.4, T.height(0, -292));
  ok(Math.hypot(pos.x, pos.z + 292) > 2.5, "statue pushes you out");
  const bridge = W.layout.find((e) => e.kind === "bridge");
  ok(Math.abs(W.col.ground(bridge.x, bridge.z, bridge.deck) - bridge.deck) < 0.3, "bridge deck is walkable");
  ok(W.col.raycast(24, 30, -230, 0, 0, -1, 40) < 40, "castle walls stop the camera ray");

  section("profile, items, stats");
  for (const h of Object.keys(HEROES)) {
    const P = newProfile(h);
    const S = computeStats(P);
    ok(S.maxHp > 80 && S.atk > 10, `${h}: sane stats (${S.maxHp} hp, ${S.atk} atk)`);
    ok(byUid(P, P.equip.weapon) && ITEMS[byUid(P, P.equip.weapon).id].for === h, `${h}: starts with a class weapon`);
  }
  {
    const P = newProfile("knight");
    const before = computeStats(P).armor;
    const it = addItem(P, "c_plate", 1);
    ok(equip(P, it.uid).ok, "equip plate");
    ok(computeStats(P).armor > before, "plate raises armour");
    const bow = addItem(P, "w_yewbow", 1);
    ok(!equip(P, bow.uid).ok, "knight can't equip a bow");
    P.gold = 1000;
    ok(buy(P, "trader", "p_heal").ok, "buy a potion");
    const sword = addItem(P, "w_steelblade", 1);
    ok(sell(P, "smith", sword.uid).ok, "sell a sword");
    addItem(P, "m_iron", 10);
    addItem(P, "m_ember", 3);
    const w = byUid(P, P.equip.weapon);
    const a0 = computeStats(P).atk;
    ok(upgrade(P, w.uid).ok && w.up === 1, "upgrade weapon to +1");
    ok(computeStats(P).atk > a0, "upgrade raises attack");
    P.sp = 3;
    ok(learnSkill(P, "keenEdge").ok, "learn tier-1 skill");
    ok(!learnSkill(P, "whirlwind").ok, "can't skip prerequisites");
  }
  section("data integrity");
  for (const [id, q] of Object.entries(QUESTS)) {
    for (const st of q.stages) for (const o of st.objectives) {
      if (o.type === "talk") ok(!!DIALOGUE[o.npc], `${id}.${o.id}: talk target ${o.npc} has dialogue`);
      if (o.type === "interact" || o.type === "destroy") for (const e of o.ids) ok(W.byId.has(e) || /^cap\d/.test(e), `${id}.${o.id}: interactable ${e} exists`);
      if (o.type === "defeat") ok(!!ENEMIES[o.enemy], `${id}.${o.id}: enemy ${o.enemy} exists`);
      if (o.type === "collect") ok(!!ITEMS[o.item], `${id}.${o.id}: item ${o.item} exists`);
    }
    for (const n of q.next || []) ok(!!QUESTS[n], `${id}: next quest ${n} exists`);
  }
  for (const [npc, tree] of Object.entries(DIALOGUE)) {
    for (const e of tree.entries) ok(!!tree.nodes[e], `${npc}: entry ${e} exists`);
    for (const [nid, node] of Object.entries(tree.nodes))
      for (const c of node.choices || []) {
        if (c.next) ok(!!tree.nodes[c.next], `${npc}.${nid}: choice → ${c.next} exists`);
        for (const [it] of c.effects?.give || []) ok(!!ITEMS[it], `${npc}.${nid}: gives known item ${it}`);
        if (c.effects?.start) ok(!!QUESTS[c.effects.start], `${npc}.${nid}: starts known quest`);
      }
  }
  for (const id of Object.keys(CHEST_LOOT)) ok(W.byId.has(id), `chest ${id} placed`);
  for (const h of Object.values(HEROES)) for (const k of ["q", "r", "f"]) ok(!!ABILITIES[h.abilities[k]], `${h.id}: ability ${k}`);

  section("combat pipeline");
  {
    const G = new Game(newProfile("knight"), { seed: 3, arrival: "start" });
    const e = G.spawnEnemy("bandit", G.player.x + 2, G.player.z, {});
    const hp0 = e.hp;
    applyDamage(G, G.player, e, 20, { kind: "melee" });
    ok(e.hp < hp0, "damage lands");
    // block
    const p = G.player;
    p.blocking = true;
    p.blockT = 1;
    p.yaw = Math.atan2(e.x - p.x, e.z - p.z);
    const php = p.hp;
    applyDamage(G, e, p, 40, { kind: "melee" });
    ok(php - p.hp < 12, `frontal block soaks the hit (${(php - p.hp).toFixed(1)} taken)`);
    // parry
    p.blockT = 0.05;
    const st0 = e.state;
    const r = applyDamage(G, e, p, 40, { kind: "melee" });
    ok(r?.parried && e.state === "stagger", `perfect parry staggers (${st0} → ${e.state})`);
    p.blocking = false;
    p.iframes = 1;
    ok(applyDamage(G, e, p, 40, {}) === null, "dodge i-frames avoid damage");
    p.iframes = 0;
    // kill → xp + quest progress (raider tag)
    const raider = G.enemies.find((x) => x.tag === "raider");
    const xp0 = G.P.xp + G.P.level * 1000;
    applyDamage(G, p, raider, 9999, {});
    ok(raider.dead, "raider dies");
    ok(G.P.xp + G.P.level * 1000 > xp0, "kill grants XP");
    ok(G.quests.objectives("q_thornwick")[0].n === 1, "kill counts toward the quest");
  }
  section("each class: abilities fire without errors");
  for (const h of Object.keys(HEROES)) {
    const P = newProfile(h);
    P.level = 8;
    P.sp = 0;
    for (const n of HEROES[h].tree) P.skills[n.id] = n.ranks;
    const G = new Game(P, { seed: 5, arrival: "start" });
    const e = G.spawnEnemy("corrupted", G.player.x + 4, G.player.z, {});
    e.alert(G.player);
    G.player.res = 999;
    G.camYaw = Math.atan2(e.x - G.player.x, e.z - G.player.z);
    let errs = 0;
    const hp0 = e.hp;
    for (const k of ["q", "r", "f"]) {
      try {
        G.player.cds[k] = 0;
        G.player.action = null;
        G.camYaw = Math.atan2(e.x - G.player.x, e.z - G.player.z);
        G.step(1 / 60, inp({ [k]: true }));
        for (let i = 0; i < 90; i++) G.step(1 / 60, inp());
      } catch (er) {
        errs++;
        console.log(er);
      }
    }
    // basic attacks
    for (let i = 0; i < 240; i++) {
      G.camYaw = Math.atan2(e.x - G.player.x, e.z - G.player.z);
      G.camPitch = -0.12;
      G.step(1 / 60, inp({ attack: { down: i % 30 < (h === "archer" ? 25 : 3), pressed: i % 30 === 0 } }));
    }
    ok(errs === 0, `${h}: Q/R/F run`);
    ok(e.hp < hp0 || e.dead, `${h}: abilities and attacks hurt the target`);
  }
  section("save / load / migration");
  {
    const P = newProfile("mage");
    P.flags.test = 1;
    P.gold = 77;
    const mem = new Map();
    const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    ok(writeSave(P, store), "write save");
    const L = loadSave(store);
    ok(L.profile && L.profile.gold === 77 && L.profile.flags.test === 1, "round-trips");
    const old = { v: 1, hero: "rogue", factions: { wardens: 5, ember: -3, marches: 12 }, world: { interacted: { cage: true } }, gold: 5, level: 3, inv: [], equip: {} };
    const M = migrate(old);
    ok(M.rep.marches === 12 && M.world.used.cage && M.v >= 3 && M.quests && M.stats, "v1 save migrates forward");
    store.setItem("crown-of-ashes-save", "{not json");
    const C = loadSave(store);
    ok(C.status.corrupt && !C.profile && store.getItem("crown-of-ashes-save-corrupt"), "corrupt save is set aside");
  }
  section("conditions");
  {
    const P = newProfile("rogue");
    ok(check(P, { hero: "rogue" }) && !check(P, { hero: "mage" }), "hero condition");
    P.quests.q_road = { state: "active", stage: 0, prog: {}, done: {} };
    ok(check(P, { q: "q_road.hilda" }), "objective-active condition");
    ok(check(P, { qn: "s_wolves" }) && !check(P, { qd: "q_road" }), "quest state conditions");
    P.flags.crownChoice = "ember";
    ok(check(P, { feq: ["crownChoice", "ember"] }) && check(P, { any: [{ f: "nope" }, { f: "crownChoice" }] }), "flag conditions");
  }
}

function campaign(planName, verbose = false) {
  const plan = PLANS[planName];
  section(`campaign — ${plan.hero}: Garrick ${plan.garrick}, crown → ${plan.crown}, dragon ${plan.dragon}`);
  let P = newProfile(plan.hero);
  let G = new Game(P, { seed: 11 + planName.length, arrival: "start" });
  const log = (s) => verbose && console.log(s);
  let bot = createBot(G, plan, log);
  const t0 = Date.now();
  const limit = 60 * 60 * 3.5; // 3.5 game hours of steps
  let lastQ = null;
  let ended = null;
  let reloaded = false;
  const seen = new Set();
  let steps = 0;
  let lastProgress = 0;
  let lastKey = "";
  for (steps = 0; steps < 60 * limit; steps++) {
    G.step(1 / 60, bot.input());
    for (const e of G.drain()) {
      if (e.type === "questDone") {
        seen.add(e.id);
        log(`  ✓ ${QUESTS[e.id].name}  [t=${(G.P.stats.time / 60).toFixed(1)} min, lvl ${G.P.level}, deaths ${bot.B.deaths}]`);
      }
      if (e.type === "ending") ended = e.ending;
      if (e.type === "levelUp") log(`    level ${e.level}`);
    }
    const cur = G.quests.active()[0];
    const key = `${cur}:${G.P.quests[cur]?.stage}:${JSON.stringify(G.P.quests[cur]?.done || {})}:${Object.keys(G.P.world.used || {}).length}:${Object.keys(G.P.world.destroyed).length}`;
    if (key !== lastKey) {
      lastKey = key;
      lastProgress = steps;
    }
    if (cur !== lastQ) {
      lastQ = cur;
    }
    // reload from a save mid-way (after the testament reaches the Hold)
    if (!reloaded && G.P.quests.q_testament?.state === "done") {
      reloaded = true;
      G.P.pos = G.snapshotPos();
      const json = JSON.stringify({ profile: G.P });
      P = migrate(JSON.parse(json).profile);
      G = new Game(P, { seed: 99, arrival: "saved" });
      const B0 = bot.B;
      bot = createBot(G, plan, log);
      bot.B.deaths = B0.deaths;
      log("  ↺ saved and reloaded");
    }
    if (ended) break;
    if (steps - lastProgress > 60 * 60 * 6) {
      console.log(`  ✗ stalled on ${cur} stage ${G.P.quests[cur]?.stage} — goal: ${bot.B.goalText} — at (${G.player.x.toFixed(0)}, ${G.player.z.toFixed(0)}) interior=${G.player.interior}`);
      for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - G.player.x, e.z - G.player.z) < 45) console.log(`     near: ${e.type} ${e.state} at (${e.x.toFixed(0)}, ${e.z.toFixed(0)}) y=${e.y.toFixed(1)} target=${e.target === G.player} hp=${e.hp.toFixed(0)}`);
      console.log(`     player y=${G.player.y.toFixed(1)} hp=${G.player.hp.toFixed(0)} action=${G.player.action?.type} focus=${G.focus?.label}`);
      break;
    }
  }
  const mins = (G.P.stats.time / 60).toFixed(1);
  console.log(`  finished in ${((Date.now() - t0) / 1000).toFixed(1)} s real, ${mins} game-min, level ${G.P.level}, deaths ${bot.B.deaths}, kills ${G.P.stats.kills}`);
  for (const q of MAIN_ORDER) ok(G.P.quests[q]?.state === "done", `${plan.hero}: ${QUESTS[q].name} completed`);
  for (const q of plan.order.filter((x) => x.startsWith("s_"))) ok(G.P.quests[q]?.state === "done", `${plan.hero}: side quest ${QUESTS[q].name} completed`);
  ok(G.P.flags.garrickFate === plan.garrick, `${plan.hero}: Garrick ${plan.garrick}`);
  ok(G.P.flags.crownChoice === plan.crown, `${plan.hero}: crown pledged to ${plan.crown}`);
  ok(G.P.flags.dragonFate === plan.dragon, `${plan.hero}: dragon ${plan.dragon}`);
  ok(ended && ended.crown === plan.crown, `${plan.hero}: reached the ${plan.crown} ending`);
  ok(reloaded, `${plan.hero}: mid-campaign save/reload continued`);
  ok(bot.B.deaths < 25, `${plan.hero}: deaths reasonable (${bot.B.deaths})`);
  return G;
}

if (mode === "quick" || mode === "all") quick();
if (mode === "campaign" || mode === "all") for (const k of Object.keys(PLANS)) campaign(k);
if (mode === "run") campaign(process.argv[3] || "knight", true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
