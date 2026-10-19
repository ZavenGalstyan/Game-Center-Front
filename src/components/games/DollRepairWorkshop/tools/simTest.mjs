/**
 * Headless tests for Doll Repair Workshop (real model geometry + session).
 *   node src/components/games/DollRepairWorkshop/tools/simTest.mjs [campaign|skill|save|economy|all] [orderIds…]
 * campaign: a fresh workshop plays all 30 orders in sequence with the bot,
 *   buying the tools/supplies/parts it needs (walk-in jobs fill level gaps).
 * skill: a sloppy bot must score clearly lower than a careful one.
 * save:  snapshot → rebuild → restore reproduces the job; save validation.
 * economy: purchases deduct money, refuse when poor / level-gated, storage caps.
 */
import { buildDoll } from "../render/dollModel.js";
import { RepairSession } from "../engine/session.js";
import { ORDERS, ORDER_BY_ID, walkInOrder } from "../data/orders.js";
import * as P from "../engine/progress.js";
import { makeBot } from "./bot.mjs";

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("  ✗", msg); } };
const mode = process.argv[2] || "all";
const only = process.argv.slice(3).map(Number).filter(Boolean);

function runJob(save, order, skill = 0.92, seed = 5) {
  P.acceptOrder(save, order);
  const model = buildDoll({ type: order.type, look: order.look, damage: order.damage, seed: P.seedOf(order) });
  const session = new RepairSession({ order, model, ctx: P.makeCtx(save), seed });
  const bot = makeBot(session, { skill, seed });
  const out = bot.play(save);
  if (!out.ok) { save.active = null; return { ok: false, out, session }; }
  const res = session.result;
  const done = P.completeOrder(save, order, res, { snap: session.snapshot() });
  return { ok: true, res, pay: done.pay, levels: done.levels, session };
}

if (mode === "campaign" || mode === "all") {
  console.log("— campaign");
  const save = P.freshSave();
  let walkins = 0;
  const t0 = Date.now();
  for (const o of ORDERS) {
    if (only.length && !only.includes(o.id)) continue;
    if (only.length) { save.level = Math.max(save.level, o.level); save.money += 3000; }
    let guard = 0;
    while (save.level < o.level && guard++ < 40) {
      const w = walkInOrder(save.walkSeed, save.level);
      const r = runJob(save, w);
      ok(r.ok, `walk-in ${w.id} (${w.type}) failed: ${JSON.stringify(r.out?.pending || r.out)}`);
      walkins++;
    }
    const money0 = save.money;
    const r = runJob(save, o);
    ok(r.ok, `order ${o.id} ${o.title} not completable: ${JSON.stringify(r.out?.pending)} ${JSON.stringify(r.out?.tasks)}`);
    if (r.ok) {
      console.log(`${String(o.id).padStart(2)} ${o.title.padEnd(28)} L${String(save.level).padStart(2)} q=${String(r.res.quality).padStart(3)} ★${r.res.stars} insp ${r.res.inspection} tasks ${r.res.taskScore} prefs ${r.res.prefScore ?? "-"}  +$${r.pay.balance}+dep  xp+${r.pay.xp}  $${money0}→$${save.money}  ${((r.res.elapsed) | 0)}s`);
      ok(r.res.quality >= 70, `order ${o.id}: careful bot quality ${r.res.quality} < 70`);
      ok(r.res.quality < 100 || r.res.tasks.every((t) => t.score >= 98), `order ${o.id}: perfect score without near-perfect tasks`);
      const low = r.res.tasks.filter((t) => t.score < 60);
      if (low.length) console.log("     low tasks:", low.map((t) => `${t.id}=${t.score}`).join(" "));
    }
  }
  console.log(`walk-ins needed: ${walkins}; final level ${save.level}, money $${save.money}, gallery ${save.gallery.length}, ${(Date.now() - t0) / 1000}s`);
}

if (mode === "skill" || mode === "all") {
  console.log("— skill");
  for (const id of only.length ? only : [5, 10, 13, 17, 24]) {
    const o = ORDER_BY_ID[id];
    const scores = [];
    for (const skill of [0.95, 0.3]) {
      const save = P.freshSave();
      save.level = 25;
      save.money = 99999;
      const r = runJob(save, o, skill, 11);
      ok(r.ok, `skill ${skill} order ${id} failed ${JSON.stringify(r.out?.pending)}`);
      scores.push(r.ok ? r.res.quality : 0);
    }
    console.log(`${id} ${o.title.padEnd(26)} careful ${scores[0]}  sloppy ${scores[1]}`);
    ok(scores[0] - scores[1] >= 10, `order ${id}: sloppy (${scores[1]}) not clearly below careful (${scores[0]})`);
  }
}

if (mode === "save" || mode === "all") {
  console.log("— save");
  const o = ORDER_BY_ID[24];
  const save = P.freshSave();
  save.level = 25; save.money = 99999;
  P.acceptOrder(save, o);
  const model = buildDoll({ type: o.type, look: o.look, damage: o.damage, seed: P.seedOf(o) });
  const s = new RepairSession({ order: o, model, ctx: P.makeCtx(save), seed: 3 });
  const bot = makeBot(s, { skill: 0.95 });
  bot.inspect();
  bot.shop(save);
  bot.clean(s.tasks.find((t) => t.kind === "clean"));
  bot.place(s.tasks.find((t) => t.kind === "part"), save);
  bot.sew(s.tasks.find((t) => t.kind === "sew"));
  const snap = s.snapshot();
  const json = JSON.stringify(snap);
  ok(json.length < 120000, `snapshot too big ${json.length}`);
  const model2 = buildDoll({ type: o.type, look: o.look, damage: o.damage, seed: P.seedOf(o) });
  const s2 = new RepairSession({ order: o, model: model2, ctx: P.makeCtx(save), seed: 3 });
  s2.restore(JSON.parse(json));
  const sum = (mm, c) => mm.grime.reduce((a, g) => { let t = 0; for (let i = 0; i < g.n; i++) t += g.attr.array[i * 4 + c]; return a + t; }, 0);
  ok(Math.abs(sum(model, 0) - sum(model2, 0)) < sum(model, 0) * 0.08 + 2, `grime restore mismatch ${sum(model, 0)} vs ${sum(model2, 0)}`);
  ok(s2.phase === "repair" && s2.tasks.filter((t) => t.done).length === s.tasks.filter((t) => t.done).length, "task state restore");
  ok(model2.sockets.armL.filled === "arm:porcelain" && !model2.sockets.armL.broken, "replaced arm restored");
  ok(model2.tears[0].stitched === model.tears[0].stitched, "stitches restored");
  // save validation
  const bad = P.validateSave({ v: 1, money: -5, level: 99, tools: { fake: true, sponge: true }, inv: { thread: "x", "arm:porcelain": 2 }, upgrades: { stage: 9 } });
  ok(bad.money === 0 && bad.level === 25 && bad.tools.sponge && !bad.tools.fake && bad.inv["arm:porcelain"] === 2 && !bad.inv.thread && bad.upgrades.stage === 2, "validateSave clamps junk");
  ok(P.validateSave(null).money === P.freshSave().money, "null save → fresh");
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  save.active.snap = snap;
  P.writeSave(mem, save);
  const back = P.loadSave(mem);
  ok(back.active && back.active.snap && back.active.snap.tasks.length === snap.tasks.length && back.money === save.money, "write/load roundtrip with active job");
  // restart refund
  const before = P.qty(save, "thread");
  P.refund(save, s.used);
  ok(P.qty(save, "thread") >= before, "refund returns used supplies");
}

if (mode === "economy" || mode === "all") {
  console.log("— economy");
  const s = P.freshSave();
  ok(!P.buyTool(s, "glue").ok, "glue gated by level 4");
  s.level = 4;
  s.money = 50;
  const m0 = s.money;
  ok(!P.buyTool(s, "glue").ok && s.money === m0, "can't afford glue with $50");
  s.money = 500;
  ok(P.buyTool(s, "glue").ok && s.money === 410 && s.tools.glue, "glue bought, $90 deducted");
  ok(!P.buyTool(s, "glue").ok, "can't buy twice");
  ok(P.buySupply(s, "adhesive").ok && P.qty(s, "adhesive") === 2 && s.money === 390, "adhesive pack");
  for (let i = 0; i < 10; i++) P.buySupply(s, "adhesive");
  ok(P.qty(s, "adhesive") <= 8, `storage cap holds (${P.qty(s, "adhesive")})`);
  s.money = 0;
  ok(!P.buyPart(s, "arm:baby").ok, "can't buy part with $0");
  s.money = 1000; s.level = 6;
  ok(P.buyUpgrade(s, "stage").ok && s.upgrades.stage === 1 && s.money === 350, "studio upgrade deducts $650");
  ok(!P.buyUpgrade(s, "stage").ok, "boutique gated (level/money)");
  const ch = P.ensureChallenges(s, "2026-10-19");
  ok(ch.list.length === 3, "3 daily challenges");
  const id = ch.list[0].id;
  P.trackChallenge(s, P.CHALLENGES[id].event, 999);
  const money1 = s.money;
  const cl = P.claimChallenge(s, id);
  ok(cl.ok && s.money === money1 + P.CHALLENGES[id].money, "claim pays out");
  ok(!P.claimChallenge(s, id).ok, "no double claim");
  ok(P.ensureChallenges(s, "2026-10-20").day === "2026-10-20", "challenges roll over by date");
  const lv = P.addXp(P.freshSave(), 10000);
  ok(lv.length > 10, "XP levels up");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
