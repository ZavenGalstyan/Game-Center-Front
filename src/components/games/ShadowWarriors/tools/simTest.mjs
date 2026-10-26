/**
 * Shadow Warriors — headless rules tests.
 *   node src/components/games/ShadowWarriors/tools/simTest.mjs [core|weapons|ai|bosses|fuzz|progress|data|all]
 */
import { createFight, stepFight, canBlock } from "../engine/fight.js";
import { BLANK, isNeutral } from "../engine/fighter.js";
import { moveReaches } from "../engine/ai.js";
import { BOSSES } from "../engine/bosses.js";
import { WEAPONS, ARMORS, ABILITIES, weaponById, armorById } from "../data/gear.js";
import { BATTLES, CHAPTERS } from "../data/campaign.js";
import { fightConfig } from "../data/loadout.js";
import { freshSave, sanitize, applyResult, buy, upgrade, equip, isBattleOpen, upgradePrice } from "../progress.js";
import { WALK, WALK_BACK, WALL, PARRY_F, COMBO_CAP } from "../engine/constants.js";

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  ✗ " + msg);
  }
};
const section = (n) => console.log(`\n# ${n}`);

// ------------------------------------------------------------------ helpers
const cfgOf = (w = "fists", a = "gi", extra = {}) => ({ weapon: weaponById(w), armor: armorById(a), ...extra });
/** A fight with both fighters under manual control, already in the 'fight' phase. */
function duel(w1 = "fists", w2 = "fists", { x1 = -60, x2 = 60, a1 = "gi", a2 = "gi", hp2 = 1 } = {}) {
  const F = createFight({ player: cfgOf(w1, a1), enemy: cfgOf(w2, a2, { hpMul: hp2 }), enemyManual: true, seed: 1 });
  while (F.phase !== "fight") step(F);
  F.p1.x = x1;
  F.p2.x = x2;
  step(F);
  return F;
}
function step(F, n = 1, i1 = {}, i2 = {}) {
  for (let k = 0; k < n; k++) {
    Object.assign(F.p1.inp, BLANK, typeof i1 === "function" ? i1(k) : i1);
    Object.assign(F.p2.inp, BLANK, typeof i2 === "function" ? i2(k) : i2);
    stepFight(F);
    F.log = (F.log || []).concat(F.events);
    F.events.length = 0;
  }
  return F;
}
const evs = (F, type, who) => (F.log || []).filter((e) => e.type === type && (!who || e.who === who));
const clearLog = (F) => (F.log = []);
/** press a button for one frame (with optional held keys), then release */
const press = (F, btn, held = {}, who = 1) => (who === 1 ? step(F, 1, { ...held, [btn]: true }) : step(F, 1, {}, { ...held, [btn]: true }));
const waitNeutral = (F, max = 200) => {
  for (let i = 0; i < max && !(isNeutral(F.p1) && isNeutral(F.p2)); i++) step(F);
};

// ------------------------------------------------------------------ core
function core() {
  section("movement");
  {
    const F = duel("fists", "fists", { x1: -300, x2: 300 });
    const x0 = F.p1.x;
    step(F, 60, { r: true });
    const v = F.p1.x - x0;
    ok(Math.abs(v - WALK) < 12, `walk forward ≈ ${WALK}/s (got ${v.toFixed(1)})`);
    const x1 = F.p1.x;
    step(F, 30, { l: true });
    ok(Math.abs((x1 - F.p1.x) * 2 - WALK_BACK) < 14, `walk back ≈ ${WALK_BACK}/s (got ${((x1 - F.p1.x) * 2).toFixed(1)})`);
    ok(WALK_BACK < WALK, "walking back is slower than forward");
    // jump
    step(F, 10);
    let peak = 0;
    let air = 0;
    press(F, "u");
    for (let i = 0; i < 90; i++) {
      step(F);
      peak = Math.max(peak, F.p1.y);
      if (F.p1.y > 0) air++;
    }
    ok(peak > 130 && peak < 170, `jump peak ~150 (got ${peak.toFixed(0)})`);
    ok(air > 34 && air < 48, `airtime ~41 frames (got ${air})`);
    ok(isNeutral(F.p1) || F.p1.state === "land", "back on the ground after the jump");
    // crouch & block
    step(F, 5, { d: true });
    ok(F.p1.state === "crouch", "S/down crouches");
    step(F, 3, { d: true, b: true });
    ok(F.p1.state === "cblock", "down + block = crouch block");
    step(F, 3, { b: true });
    ok(F.p1.state === "block", "block stands");
    // dash (double tap)
    step(F, 10);
    const xd = F.p1.x;
    step(F, 1, { r: true });
    step(F, 2);
    step(F, 1, { r: true });
    ok(F.p1.state === "dash", "double-tap forward dashes");
    step(F, 20);
    ok(F.p1.x - xd > 100, `dash covers ground (moved ${(F.p1.x - xd).toFixed(0)})`);
    // walls
    step(F, 400, { r: true });
    ok(F.p1.x <= WALL + 0.001 && F.p2.x <= WALL + 0.001, "fighters stay inside the walls");
    ok(Math.abs(F.p2.x - F.p1.x) >= 60, "pushboxes keep fighters apart");
  }

  section("attacks: frame data, reach, single hit per swing");
  {
    const F = duel("fists", "fists", { x1: -50, x2: 50 });
    const jab = F.p1.set.jab;
    press(F, "p");
    let hitAt = -1;
    for (let i = 1; i < 30; i++) {
      step(F);
      if (hitAt < 0 && evs(F, "hit").length) hitAt = i;
    }
    ok(hitAt === jab.s, `jab connects on its first active frame (frame ${jab.s}, got ${hitAt})`);
    ok(evs(F, "hit").length === 1, "one swing → exactly one hit (no duplicate hits)");
    ok(F.p2.hp < F.p2.maxHp, "damage applied");
    // out of range whiff
    const G = duel("fists", "fists", { x1: -200, x2: 200 });
    press(G, "p");
    step(G, 30);
    ok(evs(G, "hit").length === 0 && G.p2.hp === G.p2.maxHp, "jab out of range whiffs");
  }

  section("blocking rules");
  {
    // standing block: blocks mid & high & overhead, not low
    for (const [move, mod, height] of [["jab", {}, "high"], ["kick", {}, "mid"], ["sweep", { d: true }, "low"], ["lowPunch", { d: true }, "low"]]) {
      const F = duel("fists", "fists", { x1: -55, x2: 55 });
      step(F, 3, {}, { b: true });
      step(F, 1, { ...mod, [move === "kick" || move === "sweep" ? "k" : "p"]: true }, { b: true });
      step(F, 30, mod.d ? { d: true } : {}, { b: true });
      const blocked = evs(F, "block").length + evs(F, "parry").length > 0;
      ok(blocked === (height !== "low"), `standing block vs ${move} (${height}) → ${height !== "low" ? "blocked" : "hits"}`);
    }
    // crouch block: blocks low, loses to overhead (air attack)
    {
      const F = duel("fists", "fists", { x1: -55, x2: 55 });
      step(F, 3, {}, { b: true, d: true });
      step(F, 1, { d: true, k: true }, { b: true, d: true });
      step(F, 30, { d: true }, { b: true, d: true });
      ok(evs(F, "block").length + evs(F, "parry").length > 0, "crouch block stops a low sweep");
    }
    {
      const F = duel("fists", "fists", { x1: -120, x2: 40 });
      step(F, 3, {}, { b: true, d: true });
      press(F, "u", { r: true });
      step(F, 12, { r: true }, { b: true, d: true });
      step(F, 1, { k: true }, { b: true, d: true });
      step(F, 40, {}, { b: true, d: true });
      ok(evs(F, "hit", F.p2).length > 0, "a jump kick (overhead) beats crouch block");
    }
    // highs whiff over crouchers
    {
      const F = duel("fists", "fists", { x1: -55, x2: 55 });
      step(F, 3, {}, { d: true });
      press(F, "p");
      step(F, 25, {}, { d: true });
      ok(evs(F, "hit").length === 0 && evs(F, "block").length === 0, "a high jab whiffs over a crouching fighter");
    }
    ok(canBlock({ state: "cblock", inp: { b: true, d: true } }, "low") && !canBlock({ state: "block", inp: { b: true } }, "low"), "canBlock height table");
  }

  section("parry and guard break");
  {
    const F = duel("fists", "fists", { x1: -55, x2: 55 });
    press(F, "k");
    // press block 3 frames before the kick lands
    const kick = F.p1.set.kick;
    step(F, kick.s - 4);
    step(F, 1, {}, { b: true });
    step(F, 10, {}, { b: true });
    ok(evs(F, "parry").length === 1 && F.p1.state === "parried", "block pressed just before impact parries and staggers the attacker");
    ok(F.p2.hp === F.p2.maxHp, "parry takes no damage");
    // held block (pressed long before) is a normal block
    const G = duel("fists", "fists", { x1: -55, x2: 55 });
    step(G, PARRY_F + 10, {}, { b: true });
    press(G, "k", {}, 1);
    step(G, 30, {}, { b: true });
    ok(evs(G, "block").length === 1 && evs(G, "parry").length === 0, "a long-held block blocks without parrying");
    ok(G.p2.st < G.p2.maxSt, "blocking costs stamina");
    // guard break
    const H = duel("hammer", "fists", { x1: -90, x2: 40 });
    H.p2.st = 12;
    step(H, 12, {}, { b: true });
    press(H, "w");
    step(H, 60, {}, { b: true });
    ok(evs(H, "guardbreak").length === 1 && (H.p2.state === "guardbreak" || evs(H, "hit", H.p2).length > 0), "blocking with no stamina left breaks the guard");
  }

  section("strings, cancels and combo limits");
  {
    // chain only after active frames, and only into the move's own follow-up
    const F = duel("fists", "fists", { x1: -55, x2: 55 });
    press(F, "p");
    step(F, 1);
    press(F, "p"); // pressed during jab startup → buffered
    const jab = F.p1.set.jab;
    let chainedAt = -1;
    for (let i = 0; i < 30; i++) {
      step(F);
      if (chainedAt < 0 && F.p1.move?.id === "cross") chainedAt = F.frame;
    }
    ok(chainedAt > 0, "J,J chains jab → cross");
    ok(evs(F, "chain").length >= 1, "chain event fired");
    // no cancelling into block/jump during an attack
    const G = duel("fists", "fists", { x1: -200, x2: 200 });
    press(G, "w");
    const m = G.p1.move;
    step(G, 4, { b: true, u: true });
    ok(G.p1.state === "attack" && G.p1.move === m, "holding block/jump does not cancel an attack");
    step(G, m.total + 4, { b: true });
    ok(G.p1.state === "block", "block comes out once recovery ends");
    // stamina gating
    const H = duel("fists", "fists", { x1: -200, x2: 200 });
    H.p1.st = 1;
    H.p1.stDelay = 999;
    press(H, "w");
    ok(H.p1.state !== "attack" && evs(H, "tired", H.p1).length === 1, "no stamina → heavy attack refused (tired)");
    // one air attack per jump
    const J = duel("fists", "fists", { x1: -300, x2: 300 });
    press(J, "u");
    step(J, 6);
    press(J, "k");
    step(J, 18);
    const swings = evs(J, "swing", J.p1).length;
    press(J, "k");
    step(J, 2);
    ok(evs(J, "swing", J.p1).length === swings, "only one attack per jump");
    // combo cap: the 7th consecutive hit forces a knockdown, scaling shrinks damage
    const K = duel("daggers", "fists", { x1: -60, x2: 60, hp2: 20 });
    const dmgs = [];
    for (let i = 0; i < 400 && K.p2.state !== "fall" && K.p2.state !== "down"; i++) {
      step(K, 1, { w: i % 2 === 0 });
      for (const e of K.events) if (e.type === "hit") dmgs.push(e.dmg);
      const hits = evs(K, "hit", K.p2);
      if (hits.length && hits.length !== dmgs.length) dmgs.splice(0, dmgs.length, ...hits.map((h) => h.dmg));
    }
    const hits = evs(K, "hit", K.p2);
    ok(hits.length <= COMBO_CAP, `combo stops by ${COMBO_CAP} hits (got ${hits.length} before knockdown)`);
    ok(hits.length >= 2 && hits[hits.length - 1].dmg / hits[hits.length - 1].combo <= hits[0].dmg * 1.01, "combo damage is scaled down");
    // knockdown + get-up are invulnerable
    const L = duel("fists", "fists", { x1: -55, x2: 55 });
    press(L, "k", { d: true });
    step(L, 20, { d: true });
    ok(["fall", "down"].includes(L.p2.state), "sweep knocks down");
    clearLog(L);
    for (let i = 0; i < 70; i++) step(L, 1, { p: i % 6 === 0, d: true });
    ok(evs(L, "hit", L.p2).length === 0, "no hits land on a downed / rising fighter");
    waitNeutral(L);
    ok(isNeutral(L.p2), "the downed fighter gets back up");
  }

  section("projectiles and ground zones");
  {
    const F = duel("fists", "fists", { x1: -300, x2: 200 });
    F.p1.ability = { id: "wave", cost: 50, name: "Shadow Wave" };
    F.p1.meter = 100;
    step(F, 5, {}, { b: true });
    press(F, "s");
    ok(F.p1.meter === 50, "the ability spent its meter cost");
    step(F, 80, {}, { b: true });
    ok(evs(F, "block", F.p2).length === 1 && F.p2.hp === F.p2.maxHp, "Shadow Wave is blockable");
    const G = duel("fists", "fists", { x1: -300, x2: 120 });
    G.p1.ability = { id: "wave", cost: 50, name: "Shadow Wave" };
    G.p1.meter = 100;
    press(G, "s");
    // jump about a third of a second before the wave arrives
    while (!G.projectiles.length) step(G);
    const p = G.projectiles[0];
    const eta = Math.round(((G.p2.x - 30 - p.x) / p.vx) * 60);
    step(G, Math.max(0, eta - 16));
    press(G, "u", {}, 2);
    step(G, 60);
    ok(evs(G, "hit", G.p2).length === 0, "Shadow Wave can be jumped");
    const H = duel("fists", "fists", { x1: -300, x2: 300 });
    H.p1.ability = { id: "wave", cost: 50, name: "Shadow Wave" };
    H.p1.meter = 0;
    press(H, "s");
    ok(H.p1.state !== "attack" && evs(H, "nometer").length === 1, "abilities need meter");
    // telegraphed zone: no damage during the warning, avoidable by stepping out
    const Z = duel("fists", "fists", { x1: -300, x2: 0 });
    Z.zones.push({ kind: "geyser", side: 0, x: 0, warn: 40, active: 10, w: 116, h: 240, dmg: 10, power: 1, height: "mid", unblockable: true, kd: true, kb: { vx: 0, vy: 600 }, hit: false, hitstun: 20, push: 0 });
    step(Z, 36, {}, { r: true });
    ok(Z.p2.hp === Z.p2.maxHp, "no damage while a zone is only telegraphed");
    step(Z, 30, {}, { r: true });
    ok(Z.p2.hp === Z.p2.maxHp, "walking out of a telegraphed geyser avoids it");
    const Y = duel("fists", "fists", { x1: -300, x2: 0 });
    Y.zones.push({ kind: "geyser", side: 0, x: 0, warn: 20, active: 10, w: 116, h: 240, dmg: 10, power: 1, height: "mid", unblockable: true, kd: true, kb: { vx: 0, vy: 600 }, hit: false, hitstun: 20, push: 0 });
    step(Y, 40);
    ok(Y.p2.hp < Y.p2.maxHp, "standing in it after the warning hurts");
  }

  section("rounds and match flow");
  {
    const F = duel("fists", "fists", { x1: -60, x2: 60 });
    F.p2.hp = 1;
    press(F, "p");
    step(F, 20);
    ok(F.phase === "ko" && F.wins[0] === 1, "KO awards the round");
    step(F, 140);
    ok(F.round === 2 && F.p2.hp === F.p2.maxHp && F.phase === "intro", "next round resets health");
    while (F.phase !== "fight") step(F);
    F.timer = 0.02;
    F.p2.hp = F.p2.maxHp * 0.5;
    step(F, 3);
    ok(F.phase === "ko" && F.wins[0] === 2, "time out → the healthier fighter wins the round");
    step(F, 140);
    ok(F.phase === "over" && F.winner === F.p1, "two round wins take the match");
  }
}

// ------------------------------------------------------------------ weapons
function weapons() {
  section("weapons have distinct, sensible stats");
  const rows = WEAPONS.map((w) => {
    const F = createFight({ player: cfgOf(w.id), enemy: cfgOf("fists"), enemyManual: true });
    const R = moveReaches(F.p1);
    const set = F.p1.set;
    return { id: w.id, reach: Math.round(R.w1?.reach || R.jab.reach), s: set.w1.s, total: set.w1.total, dmg: +(set.w1.dmg).toFixed(1), heavy: set.wHeavy.dmg, stam: set.w1.stam };
  });
  console.table(rows);
  const sig = new Set(rows.map((r) => `${r.reach}|${r.s}|${r.dmg}|${r.total}`));
  ok(sig.size === rows.length, "every weapon has a unique reach/speed/damage profile");
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  ok(by.chain.reach > by.spear.reach * 0.95 && by.spear.reach > by.katana.reach && by.katana.reach > by.daggers.reach && by.daggers.reach > by.fists.reach, "reach order: chain/spear > katana > daggers > fists");
  ok(by.daggers.s < by.katana.s && by.katana.s < by.hammer.s, "speed order: daggers < katana < hammer");
  ok(by.hammer.heavy > by.katana.heavy && by.katana.heavy > by.daggers.heavy, "heavy damage order: hammer > katana > daggers");
  ok(by.hammer.total > by.staff.total, "hammer recovers slower than staff");
  // every weapon can land every attack on a standing target somewhere in range
  for (const w of WEAPONS) {
    const F = createFight({ player: cfgOf(w.id), enemy: cfgOf("fists"), enemyManual: true });
    const R = moveReaches(F.p1);
    const missing = ["jab", "kick", "sweep", "w1", "wHeavy", "wLow"].filter((id) => !R[id] || R[id].reach < 40);
    ok(missing.length === 0, `${w.id}: all core attacks have reach (${missing.join(",") || "ok"})`);
  }
  // each weapon's heavy attack really lands in a scripted duel
  for (const w of WEAPONS) {
    const F = duel(w.id, "fists", { x1: -60, x2: 60 });
    press(F, "w", { r: true });
    step(F, 60);
    ok(evs(F, "hit", F.p2).length >= 1, `${w.id}: forward+L connects at close range`);
    const G = duel(w.id, "fists", { x1: -60, x2: 60 });
    press(G, "w");
    step(G, 60);
    ok(evs(G, "hit", G.p2).length >= 1, `${w.id}: L connects at close range`);
  }
  // armor: defense and stamina effects are real
  const hit = (armor) => {
    const F = duel("katana", "fists", { x1: -60, x2: 60, a2: armor });
    press(F, "w");
    step(F, 40);
    return evs(F, "hit", F.p2)[0]?.dmg || 0;
  };
  ok(hit("dragon") < hit("leather") && hit("leather") < hit("gi"), "heavier armor takes less damage");
  const silk = createFight({ player: cfgOf("fists", "silk"), enemy: cfgOf("fists"), enemyManual: true }).p1;
  const iron = createFight({ player: cfgOf("fists", "iron"), enemy: cfgOf("fists"), enemyManual: true }).p1;
  ok(silk.maxSt > iron.maxSt && silk.regen > iron.regen && silk.speed > iron.speed, "silk = stamina/agility, iron = defense (trade-off)");
  ok(ARMORS.every((a, i) => i === 0 || a.price > ARMORS[i - 1].price || a.id === "silk"), "armor prices rise along the campaign");
}

// ------------------------------------------------------------------ ai
function ai() {
  section("AI fairness and behaviour");
  // the AI never reads the opponent's input object: run the enemy's think step
  // ourselves with the opponent's keys booby-trapped, then step the fight
  {
    const { thinkAI } = AI_MOD;
    const G = createFight({ player: cfgOf("katana"), enemy: cfgOf("staff"), playerAI: { style: "trickster", level: 0.8 }, ai: { style: "duelist", level: 0.8 }, boss: "viper", seed: 9 });
    let leaked = 0;
    let thinks = 0;
    for (let i = 0; i < 60 * 120 && G.phase !== "over"; i++) {
      const real = G.p1.inp;
      if (G.phase === "fight") {
        G.p1.inp = new Proxy(real, { get: (t, k) => { leaked++; return t[k]; } });
        thinkAI(G, G.p2, G.p1);
        G.p1.inp = real;
        thinks++;
      }
      const ai = G.p2.ai;
      G.p2.ai = null; // already thought this frame
      stepFight(G);
      G.p2.ai = ai;
      G.events.length = 0;
    }
    ok(thinks > 1000 && leaked === 0, `enemy AI never reads the opponent's held keys (${thinks} thinks, ${leaked} reads)`);
  }
  // the AI attacks, blocks and can be defeated
  const tally = { swing: 0, block: 0, parry: 0, ko: 0, dash: 0, jump: 0, enemyLost: 0, fights: 0 };
  for (const style of ["brawler", "defender", "zoner", "trickster", "berserker", "duelist"]) {
    for (let k = 0; k < 3; k++) {
      const F = createFight({ player: cfgOf("katana"), enemy: cfgOf("staff"), playerAI: { style: "duelist", level: 0.9 }, ai: { style, level: 0.4 }, seed: 31 + k });
      while (F.phase !== "over" && F.frame < 60 * 400) {
        stepFight(F);
        for (const e of F.events) {
          if (e.type === "swing" && e.who === F.p2) tally.swing++;
          if ((e.type === "block" || e.type === "parry") && e.who === F.p2) tally[e.type]++;
          if ((e.type === "dash" || e.type === "jump") && e.who === F.p2) tally[e.type]++;
        }
        F.events.length = 0;
      }
      tally.fights++;
      if (F.winner === F.p1) tally.enemyLost++;
    }
  }
  console.log("  enemy AI over 18 fights:", JSON.stringify(tally));
  ok(tally.swing > 200, "enemy AI attacks");
  ok(tally.block + tally.parry > 30, "enemy AI blocks / parries");
  ok(tally.dash + tally.jump > 10, "enemy AI moves (dash / jump)");
  ok(tally.enemyLost >= 12, "a skilled opponent beats low-level AIs most of the time");
  // difficulty scaling: higher level AI beats lower level AI with equal gear
  let hiWins = 0;
  for (let k = 0; k < 12; k++) {
    const F = createFight({ player: cfgOf("katana"), enemy: cfgOf("katana"), playerAI: { style: "duelist", level: 0.85 }, ai: { style: "duelist", level: 0.15 }, seed: 70 + k });
    while (F.phase !== "over" && F.frame < 60 * 400) {
      stepFight(F);
      F.events.length = 0;
    }
    if (F.winner === F.p1) hiWins++;
  }
  ok(hiWins >= 9, `AI level matters: 0.85 beats 0.15 in ${hiWins}/12`);
}
const AI_MOD = await import("../engine/ai.js");

// ------------------------------------------------------------------ bosses
function bosses() {
  section("five bosses with distinct mechanics");
  const want = {
    monk: ["ripple", "ironStance"],
    witch: ["thorns", "vanish"],
    viper: ["clone", "flurry"],
    sultan: ["erupt", "storm"],
    emperor: ["eclipse", "spikes"],
  };
  const ids = BATTLES.filter((b) => b.boss).map((b) => [b.id, b.boss]);
  ok(JSON.stringify(ids) === JSON.stringify([[10, "monk"], [20, "witch"], [30, "viper"], [40, "sultan"], [50, "emperor"]]), "bosses at battles 10/20/30/40/50");
  for (const [id, boss] of ids) {
    const b = BATTLES[id - 1];
    const seen = new Set();
    const extra = { phases: new Set(), zones: 0, proj: new Set(), appear: 0, storm: 0, armor: 0, frost: 0, vamp: 0, multi: 0 };
    for (let k = 0; k < 4; k++) {
      const save = freshSave();
      save.eq.weapon = "katana";
      save.owned.weapon.push("katana");
      save.lv.weapon.katana = 4;
      const cfg = fightConfig(save, b, 300 + k);
      cfg.playerAI = { style: "defender", level: 0.85 };
      const F = createFight(cfg);
      while (F.phase !== "over" && F.frame < 60 * 400) {
        stepFight(F);
        for (const e of F.events) {
          if (e.type === "telegraph") seen.add(e.move);
          if (e.type === "phase") extra.phases.add(e.phase);
          if (e.type === "appear") extra.appear++;
          if (e.type === "storm") extra.storm++;
          if (e.type === "zone") extra.zones++;
          if (e.type === "hit" && e.who === F.p1 && e.by === F.p2 && F.p2.move?.multi) extra.multi++;
        }
        for (const p of F.projectiles) extra.proj.add(p.kind);
        if (F.p2.buffs.armor > 60) extra.armor++;
        if (F.p1.buffs.frost > 0) extra.frost++;
        if (F.p2.buffs.vamp > 0) extra.vamp++;
        F.events.length = 0;
      }
    }
    const missing = want[boss].filter((m) => !seen.has(m));
    ok(missing.length === 0, `${BOSSES[boss].name}: uses ${want[boss].join(" + ")}${missing.length ? " (missing " + missing.join(",") + ")" : ""}`);
    ok(extra.phases.has(2), `${boss}: reaches phase 2`);
    if (boss === "monk") ok(extra.proj.has("ripple") && extra.armor > 0, "monk: ripple waves + iron stance armor");
    if (boss === "witch") ok(extra.appear > 0 && extra.proj.has("thorn"), "witch: teleports + thorn volleys");
    if (boss === "viper") ok(extra.proj.has("clone") && extra.multi > 0, "viper: shadow clone + multi-hit flurry");
    if (boss === "sultan") ok(extra.zones > 0 && extra.storm > 0, "sultan: geysers + sandstorm");
    if (boss === "emperor") ok(extra.proj.has("eclipse") && extra.zones > 0 && extra.frost > 0, "emperor: eclipse slash + frost spikes + frost aura");
  }
  // every boss special has a wind-up of at least half a second
  for (const id of ["ripple", "ironStance", "thorns", "vanish", "clone", "flurry", "erupt", "storm", "eclipse", "spikes"]) {
    for (const w of WEAPONS) {
      const G = createFight({ player: cfgOf("fists"), enemy: cfgOf(w.id), enemyManual: true });
      ok(G.p2.set[id].s >= 17, `${id} with ${w.id}: wind-up ${G.p2.set[id].s} frames ≥ 17`);
    }
  }
}

// ------------------------------------------------------------------ fuzz
function fuzz() {
  section("fuzz: random inputs never break the simulation");
  let frames = 0;
  let stuck = 0;
  let bad = 0;
  const states = new Set();
  for (let k = 0; k < WEAPONS.length * 3; k++) {
    const w1 = WEAPONS[k % WEAPONS.length].id;
    const w2 = WEAPONS[(k * 3 + 1) % WEAPONS.length].id;
    const F = createFight({ player: cfgOf(w1, ARMORS[k % ARMORS.length].id, { ability: ABILITIES[k % 5].id }), enemy: cfgOf(w2), enemyManual: true, boss: k % 4 === 0 ? ["monk", "witch", "viper", "sultan", "emperor"][k % 5] : null, seed: k });
    if (F.p2.boss) F.p2.ai = AI_MOD.createAI({ style: "trickster", level: 0.5 }, F.rng, F.p2);
    let r = k * 977 + 1;
    const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const keys = ["l", "r", "u", "d", "p", "k", "w", "b", "s"];
    for (let i = 0; i < 60 * 120 && F.phase !== "over"; i++) {
      const a = {};
      const b = {};
      for (const key of keys) {
        if (rnd() < 0.12) a[key] = true;
        if (!F.p2.ai && rnd() < 0.12) b[key] = true;
      }
      F.p1.meter = Math.max(F.p1.meter, i % 300 === 0 ? 100 : 0);
      Object.assign(F.p1.inp, BLANK, a);
      if (!F.p2.ai) Object.assign(F.p2.inp, BLANK, b);
      stepFight(F);
      F.events.length = 0;
      frames++;
      for (const f of F.fighters) {
        states.add(f.state);
        if (![f.x, f.y, f.vx, f.vy, f.hp, f.st, f.meter].every(Number.isFinite)) bad++;
        if (f.x < -WALL - 0.01 || f.x > WALL + 0.01 || f.y < -0.01 || f.hp > f.maxHp + 0.01 || f.st > f.maxSt + 0.01 || f.meter > 100) bad++;
        for (const k2 of Object.keys(f.J)) if (typeof f.J[k2] === "object" && !(Number.isFinite(f.J[k2].x) && Number.isFinite(f.J[k2].y))) bad++;
      }
    }
    // release everything: both fighters must return to a neutral state
    if (F.phase === "fight") {
      let n = 0;
      while (n < 400 && F.phase === "fight" && !(["idle", "walk", "crouch", "block", "cblock", "win", "ko"].includes(F.p1.state) && (F.p2.ai || ["idle", "walk", "crouch", "block", "cblock", "win", "ko"].includes(F.p2.state)))) {
        Object.assign(F.p1.inp, BLANK);
        if (!F.p2.ai) Object.assign(F.p2.inp, BLANK);
        stepFight(F);
        F.events.length = 0;
        n++;
      }
      if (n >= 400) {
        stuck++;
        console.log("   stuck:", F.p1.state, F.p2.state);
      }
    }
  }
  console.log(`  ${frames} frames, states seen: ${[...states].sort().join(" ")}`);
  ok(bad === 0, `no NaN / out-of-bounds values (${bad})`);
  ok(stuck === 0, `fighters always return to neutral (${stuck} stuck)`);
  ok(["attack", "hit", "blockstun", "fall", "down", "getup", "air", "dash", "parried"].every((s) => states.has(s)), "fuzz reached all major states");
}

// ------------------------------------------------------------------ progress
function progress() {
  section("save data, rewards and shop");
  let s = freshSave();
  ok(isBattleOpen(s, 1) && !isBattleOpen(s, 2), "only battle 1 is open on a fresh save");
  const r1 = applyResult(s, 1, { won: true, perfect: true, time: 30 });
  s = r1.save;
  ok(r1.coins === BATTLES[0].reward + Math.round((BATTLES[0].reward * 0.25) / 5) * 5, "first win pays reward + perfect bonus");
  ok(isBattleOpen(s, 2) && s.cleared === 1 && s.last === 2, "winning opens the next battle");
  const r2 = applyResult(s, 1, { won: true, perfect: false, time: 30 });
  ok(r2.coins < BATTLES[0].reward && !r2.first, "replays pay less");
  const lose = applyResult(s, 2, { won: false });
  ok(lose.coins > 0 && lose.save.cleared === 1, "a loss pays a small consolation and unlocks nothing");
  // unlocks
  let t = freshSave();
  for (let i = 1; i <= 10; i++) t = applyResult(t, i, { won: true }).save;
  ok(t.owned.ability.includes("iron"), "beating boss 1 teaches Iron Body");
  ok(t.cleared === 10 && isBattleOpen(t, 11) && !isBattleOpen(t, 12), "chapter 2 opens after the boss");
  // shop
  const poor = { ...freshSave(), coins: 10 };
  ok(!buy(poor, "weapon", "staff").ok, "can't buy without coins");
  const locked = { ...freshSave(), coins: 99999 };
  ok(!buy(locked, "weapon", "chain").ok, "can't buy locked items");
  t.coins = 5000;
  const b = buy(t, "weapon", "katana");
  ok(b.ok && b.save.coins === 5000 - 900 && b.save.eq.weapon === "katana", "buying spends coins and equips");
  ok(!buy(b.save, "weapon", "katana").ok, "can't buy twice");
  const u = upgrade(b.save, "weapon", "katana");
  ok(u.ok && u.save.lv.weapon.katana === 1 && u.save.coins === b.save.coins - upgradePrice(b.save, "weapon", "katana"), "upgrade raises level and costs coins");
  let m = u.save;
  for (let i = 0; i < 10; i++) {
    m.coins = 99999;
    const x = upgrade(m, "weapon", "katana");
    if (x.ok) m = x.save;
  }
  ok(m.lv.weapon.katana === 5 && !upgrade(m, "weapon", "katana").ok, "upgrades stop at +5");
  ok(equip(m, "weapon", "fists").ok && !equip(m, "weapon", "chain").ok, "equip only owned items");
  // sanitize
  const junk = sanitize({ coins: -5, cleared: 999, owned: { weapon: ["laser", "katana"] }, eq: { weapon: "laser" }, settings: { touch: "maybe", music: "yes" } });
  ok(junk.coins === 0 && junk.cleared === 50 && junk.owned.weapon.includes("katana") && !junk.owned.weapon.includes("laser") && junk.eq.weapon === "fists" && junk.settings.touch === "auto" && junk.settings.music === true, "corrupt saves are repaired");
  ok(JSON.stringify(sanitize(JSON.parse(JSON.stringify(m)))) === JSON.stringify(sanitize(m)), "save round-trips through JSON");
  ok(sanitize(null).coins === 0, "missing save → fresh save");
}

// ------------------------------------------------------------------ data
function data() {
  section("campaign data");
  ok(BATTLES.length === 50 && CHAPTERS.length === 5, "50 battles in 5 chapters");
  for (let c = 0; c < 5; c++) ok(BATTLES.filter((b) => b.chapter === c).length === 10, `chapter ${c + 1} has 10 battles`);
  ok(new Set(BATTLES.map((b) => b.name)).size === 50, "every opponent is unique");
  ok(BATTLES.every((b) => WEAPONS.some((w) => w.id === b.weapon) && ARMORS.some((a) => a.id === b.armor)), "enemy gear exists");
  ok(new Set(BATTLES.map((b) => b.weapon)).size === WEAPONS.length, "every weapon appears in enemy hands");
  ok(new Set(BATTLES.map((b) => b.style)).size === 6, "all six fighting styles appear");
  let mono = true;
  for (let i = 1; i < 50; i++) if (BATTLES[i].chapter === BATTLES[i - 1].chapter && !BATTLES[i - 1].boss && !BATTLES[i].boss && BATTLES[i].level < BATTLES[i - 1].level) mono = false;
  ok(mono, "difficulty rises within each chapter");
  ok(BATTLES[49].level > BATTLES[0].level + 0.5, "the campaign gets much harder overall");
  ok(new Set(CHAPTERS.map((c) => c.arena)).size === 5, "five distinct arenas");
  ok(WEAPONS.length === 8 && ARMORS.length === 6 && ABILITIES.length === 5, "8 weapons, 6 armors, 5 abilities");
}

const which = process.argv[2] || "all";
const SUITES = { core, weapons, ai, bosses, fuzz, progress, data };
for (const [k, fn] of Object.entries(SUITES)) if (which === "all" || which === k) fn();
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
