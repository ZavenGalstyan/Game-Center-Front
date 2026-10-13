/**
 * Headless checks for Zoo Simulator 3D's rules (no browser, no Three.js).
 *   node src/components/games/ZooSimulator3D/tools/simTest.mjs [core|balance|all]
 */
import { Zoo } from "../sim.js";
import { ENC_BY_ID, SPECIES, MISSIONS, ZONES, STORAGE, TAPS, gatePoints, EYE } from "../data.js";

const mode = process.argv[2] || "all";
let fails = 0;
let passes = 0;
const ok = (cond, msg) => {
  if (cond) passes++;
  else {
    fails++;
    console.log("  FAIL:", msg);
  }
};
const run = (zoo, secs, dt = 1 / 30) => {
  for (let t = 0; t < secs; t += dt) zoo.update(dt);
};
/** Walk the player toward (x,z) with real input for up to `secs`. */
function walkTo(zoo, x, z, secs = 30, sprint = false) {
  const p = zoo.player;
  for (let t = 0; t < secs; t += 1 / 60) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.hypot(dx, dz) < 0.3) return true;
    p.yaw = Math.atan2(-dx, -dz);
    zoo.stepPlayer({ f: 1, sprint }, 1 / 60);
  }
  return Math.hypot(x - p.x, z - p.z) < 0.5;
}
/** Aim the crosshair at an interactable and press E. */
function use(zoo, key) {
  const it = zoo.interactables().find((i) => i.key === key);
  if (!it) return { err: "missing " + key };
  const p = zoo.player;
  const eye = { x: p.x, y: EYE, z: p.z };
  const d = { x: it.x - eye.x, y: it.y - eye.y, z: it.z - eye.z };
  const l = Math.hypot(d.x, d.y, d.z);
  const dir = { x: d.x / l, y: d.y / l, z: d.z / l };
  const hit = zoo.pick(eye, dir);
  if (!hit) return { err: "nothing picked for " + key + " at dist " + Math.hypot(it.x - p.x, it.z - p.z).toFixed(2) };
  return zoo.interact(hit) || {};
}
const drain = (zoo) => zoo.events.splice(0);

function core() {
  console.log("core");
  // ---------- movement & collision
  let zoo = new Zoo(null, { seed: 3 });
  const p = zoo.player;
  const x0 = p.z;
  zoo.stepPlayer({ f: 1 }, 1 / 60);
  for (let i = 0; i < 60; i++) zoo.stepPlayer({ f: 1 }, 1 / 60);
  ok(p.z < x0 - 3, "W walks forward (north) ~4 m/s, moved " + (x0 - p.z).toFixed(2));
  const walked = x0 - p.z;
  Object.assign(p, { x: 0, z: 31, vx: 0, vz: 0, yaw: 0 });
  for (let i = 0; i < 61; i++) zoo.stepPlayer({ f: 1, sprint: true }, 1 / 60);
  ok(31 - p.z > walked * 1.4, "sprint is faster: " + (31 - p.z).toFixed(2) + " vs " + walked.toFixed(2));
  Object.assign(p, { x: 0, z: 20, vx: 0, vz: 0, yaw: Math.PI / 2 }); // facing west (-x)
  for (let i = 0; i < 60; i++) zoo.stepPlayer({ f: 1 }, 1 / 60);
  ok(Math.abs(p.x - -1) > 0.5 && p.x < -1, "yaw π/2 walks west");
  // strafe right while facing north → +x
  Object.assign(p, { x: 0, z: 20, vx: 0, vz: 0, yaw: 0 });
  for (let i = 0; i < 30; i++) zoo.stepPlayer({ r: 1 }, 1 / 60);
  ok(p.x > 1, "D strafes right (east) when facing north");
  // rabbit fence at x=-5 (gate at z 18.5) — walk west at z=14 → blocked
  Object.assign(p, { x: -2, z: 14, vx: 0, vz: 0 });
  walkTo(zoo, -12, 14, 5);
  ok(p.x > -5, "fence blocks: x=" + p.x.toFixed(2));
  // through the gate works
  Object.assign(p, { x: -2, z: 18.5, vx: 0, vz: 0 });
  ok(walkTo(zoo, -9, 18.5, 6), "walk in through the rabbit gate: " + p.x.toFixed(2));
  // building
  Object.assign(p, { x: -6, z: 32, vx: 0, vz: 0 });
  walkTo(zoo, -15, 32, 5);
  ok(p.x > -10.2, "gift shop wall blocks");
  // bounds
  Object.assign(p, { x: 0, z: 30, vx: 0, vz: 0 });
  walkTo(zoo, 0, 60, 8, true);
  ok(p.z < 36.7, "can't leave through the entrance: z=" + p.z.toFixed(2));
  Object.assign(p, { x: -30, z: 0, vx: 0, vz: 0 });
  walkTo(zoo, -80, 0, 10, true);
  ok(p.x > -44.6, "west bound: x=" + p.x.toFixed(2));
  // locked zone barrier
  Object.assign(p, { x: 0, z: -15, vx: 0, vz: 0 });
  walkTo(zoo, 0, -40, 8, true);
  ok(p.z > -21.3, "savanna barrier blocks while locked: z=" + p.z.toFixed(2));
  Object.assign(p, { x: 38, z: 6, vx: 0, vz: 0 });
  walkTo(zoo, 60, 6, 8, true);
  ok(p.x < 44, "valley barrier blocks while locked: x=" + p.x.toFixed(2));
  // tunnelling at high dt
  Object.assign(p, { x: -2, z: 14, vx: 0, vz: 0, yaw: Math.PI / 2 });
  for (let i = 0; i < 10; i++) zoo.stepPlayer({ f: 1, sprint: true }, 0.1);
  ok(p.x > -5, "no tunnelling with big dt");

  // ---------- animals exist, needs drop, stay inside
  zoo = new Zoo(null, { seed: 4 });
  ok(zoo.animals.filter((a) => a.species === "rabbit").length === 3 && zoo.animals.filter((a) => a.species === "deer").length === 2, "starter animals");
  const h0 = zoo.animals[0].hunger;
  run(zoo, 30);
  ok(zoo.animals[0].hunger < h0, "hunger drops over time");
  run(zoo, 120);
  ok(zoo.animals.every((a) => {
    const r = ENC_BY_ID[a.enc].rect;
    return a.x > r.x0 && a.x < r.x1 && a.z > r.z0 && a.z < r.z1;
  }), "animals stay inside");
  ok(zoo.animals.some((a) => a.state === "walk" || a.state === "rest" || a.state === "idle"), "animals have behaviour states");

  // ---------- feeding loop
  zoo = new Zoo(null, { seed: 5 });
  const pl = zoo.player;
  let r = use(zoo, "trough:rabbit");
  ok(r.err || !r.done, "can't fill trough with no food");
  ok(walkTo(zoo, 6.6, -12.5, 30), "walk to the barn");
  const m0 = zoo.money;
  r = use(zoo, "food");
  ok(r.done && pl.food === 6 && zoo.money === m0, "collect food is free: " + JSON.stringify(r) + " money " + zoo.money);
  ok(walkTo(zoo, -3.6, 15.2, 40), "walk to the rabbit pen");
  r = use(zoo, "trough:rabbit");
  ok(r.done && zoo.enc.rabbit.trough === 1 && pl.food === 5, "fill trough uses 1 portion: trough " + zoo.enc.rabbit.trough + " food " + pl.food);
  const fed0 = zoo.stats.fed;
  run(zoo, 30);
  ok(zoo.stats.fed - fed0 >= 2, "animals walk to the trough and eat: " + (zoo.stats.fed - fed0));
  // hand-feed a deer
  const deer = zoo.animals.find((a) => a.species === "deer");
  Object.assign(pl, { x: 3.6, z: deer.z });
  deer.x = 6.5;
  deer.hunger = 0.4;
  ok(zoo.handFeed(deer.id), "hand-feed works when close");
  run(zoo, 1);
  ok(zoo.mission >= 1, "mission 1 (feed 3) done: mission=" + zoo.mission);
  // water
  ok(walkTo(zoo, 2.6, -3.5, 40), "walk to tap");
  r = use(zoo, "tap0");
  ok(r.done && pl.water === 4 && pl.tool === 1, "fill jug at tap");
  ok(walkTo(zoo, -3.6, 22.2, 40), "walk to rabbit basin");
  r = use(zoo, "basin:rabbit");
  ok(r.done && zoo.enc.rabbit.basin === 1, "refill basin");
  ok(walkTo(zoo, 3.6, 24, 30), "walk to deer basin");
  r = use(zoo, "basin:deer");
  ok(r.done, "refill deer basin");
  run(zoo, 1);
  ok(zoo.mission >= 2, "mission 2 (water 2) done: mission=" + zoo.mission);
  // cleaning: walk into the rabbit pen and sweep every pile
  const gp = gatePoints(ENC_BY_ID.rabbit);
  walkTo(zoo, gp.outside.x, gp.outside.z, 30);
  walkTo(zoo, gp.inside.x, gp.inside.z, 10);
  let guard = 0;
  while (zoo.enc.rabbit.dirt.length && guard++ < 10) {
    const d = zoo.enc.rabbit.dirt[0];
    walkTo(zoo, d.x + 1.2, d.z, 15);
    const rr = use(zoo, "dirt:" + d.id);
    if (rr.err) console.log("   ", rr.err);
  }
  ok(!zoo.enc.rabbit.dirt.length, "rabbit pen swept clean (" + zoo.enc.rabbit.dirt.length + " left)");
  run(zoo, 1);
  ok(zoo.mission >= 3, "mission 3 (clean) done: mission=" + zoo.mission);
  // guide marker points at the next step of the current mission
  zoo.mission = 4; // buy an animal
  const g = zoo.guide();
  ok(g && /sign/.test(g.label), "guide points at an info sign: " + JSON.stringify(g));
  zoo.mission = 8;
  ok(/Savanna/.test(zoo.guide().label), "guide points at the savanna barrier");
  // E on a hungry animal with food in the bucket feeds it directly
  const bun = zoo.animals.find((a) => a.species === "rabbit");
  bun.hunger = 0.3;
  pl.food = 2;
  Object.assign(bun, { x: -7.5, z: 18.6, state: "idle", timer: 99, reactCd: 99 });
  Object.assign(pl, { x: -3.6, z: 18.6 });
  const fedBefore = zoo.stats.fed;
  r = use(zoo, "animal:" + bun.id);
  ok(r.done && zoo.stats.fed === fedBefore + 1 && pl.food === 1, "E on a hungry animal hand-feeds it " + JSON.stringify(r));

  // ---------- economy: visitors pay
  zoo = new Zoo(null, { seed: 6 });
  const before = zoo.money;
  run(zoo, 120);
  ok(zoo.money > before + 100, "visitors bring money in 2 min: +" + (zoo.money - before));
  ok(zoo.visitors.length > 3, "visitors walking around: " + zoo.visitors.length);
  ok(zoo.today.tickets > 0 && zoo.today.tips > 0, "tickets and tips: " + JSON.stringify(zoo.today));
  run(zoo, 400);
  ok(zoo.satN > 5, "visitors leave and rate the zoo: n=" + zoo.satN + " sat=" + zoo.sat.toFixed(2));

  // ---------- purchases & funds
  zoo = new Zoo(null, { seed: 7 });
  zoo.money = 900;
  ok(!zoo.build("zebra") && zoo.money === 900 && !zoo.enc.zebra.built, "insufficient funds blocks building");
  ok(zoo.events.some((e) => e.type === "error"), "error event on insufficient funds");
  zoo.money = 1200;
  ok(zoo.build("zebra") && zoo.money === 200 && zoo.animalsIn("zebra").length === 2, "build zebra deducts $1000 and adds 2 zebras");
  ok(zoo.colliders.rects.length > 0 && zoo.interactables().some((i) => i.key === "trough:zebra"), "new habitat active (trough interactable)");
  ok(!zoo.build("giraffe"), "can't build in a locked zone");
  zoo.money = 5000;
  ok(zoo.unlockZone("savanna") && zoo.money === 3500, "unlock savanna");
  const p2 = zoo.player;
  Object.assign(p2, { x: 0, z: -15, vx: 0, vz: 0 });
  ok(walkTo(zoo, 0, -40, 10, true), "barrier removed after unlock");
  ok(zoo.buyAnimal("rabbit") && zoo.animalsIn("rabbit").length === 4, "buy a rabbit");
  zoo.money = 50;
  ok(!zoo.buyAnimal("rabbit") && zoo.animalsIn("rabbit").length === 4, "insufficient funds blocks animal purchase");
  zoo.money = 99999;
  while (zoo.animalsIn("rabbit").length < SPECIES.rabbit.max) zoo.buyAnimal("rabbit");
  const mBefore = zoo.money;
  ok(!zoo.buyAnimal("rabbit") && zoo.money === mBefore, "capacity limit");
  ok(zoo.buyUpgrade("bucket") && zoo.foodCap === 12 && !zoo.buyUpgrade("bucket"), "upgrade once");
  zoo.money = 10;
  ok(!zoo.hire("keeper") && !zoo.staff.keeper, "can't hire without money");

  // ---------- staff automation
  zoo = new Zoo(null, { seed: 8 });
  zoo.money = 5000;
  zoo.hire("keeper");
  zoo.hire("cleaner");
  zoo.enc.deer.trough = 0;
  zoo.enc.deer.basin = 0;
  const dirt0 = zoo.enc.rabbit.dirt.length + zoo.enc.deer.dirt.length;
  run(zoo, 90);
  ok(zoo.enc.deer.trough > 0.4 || zoo.enc.rabbit.trough > 0.4, "zookeeper refills troughs: deer " + zoo.enc.deer.trough.toFixed(2) + " rabbit " + zoo.enc.rabbit.trough.toFixed(2));
  ok(zoo.enc.rabbit.dirt.length + zoo.enc.deer.dirt.length < dirt0, "cleaner sweeps droppings");
  const m1 = zoo.money;
  zoo.dayT = 179.9;
  zoo.update(0.2);
  ok(zoo.events.some((e) => e.type === "day") && zoo.day === 2, "day ends");
  ok(zoo.money <= m1 - 55 + 30, "wages deducted at day end");
  zoo.money = 0;
  zoo.dayT = 179.9;
  zoo.update(0.2);
  ok(zoo.staff.keeper && zoo.npcs.keeper && zoo.money >= 0, "staff stay (and money never goes negative) when wages can't be paid");

  // ---------- save round-trip & validation
  zoo = new Zoo(null, { seed: 9 });
  zoo.money = 4321;
  zoo.build("zebra");
  zoo.hire("cleaner");
  zoo.buyUpgrade("shoes");
  zoo.mission = 4;
  run(zoo, 20);
  const s = JSON.parse(JSON.stringify(zoo.serialize()));
  const z2 = new Zoo(s, { seed: 10 });
  ok(z2.money === Math.round(zoo.money) && z2.enc.zebra.built && z2.staff.cleaner && z2.upgrades.shoes && z2.mission === 4, "save round-trip");
  ok(z2.animals.length === zoo.animals.length, "animals restored");
  ok(Math.abs(z2.animals[0].hunger - zoo.animals[0].hunger) < 0.01, "animal needs restored");
  let threw = false;
  try { new Zoo({ v: 99 }); } catch { threw = true; }
  ok(threw, "bad version rejected");
  threw = false;
  try { new Zoo({ v: 1, money: "lots" }); } catch { threw = true; }
  ok(threw, "bad money rejected");
  const evil = { ...s, animals: [...s.animals, { s: "dragon" }, { s: "lion", x: 1e9 }], player: { x: NaN, z: -60 }, ticketPrice: 999 };
  const z3 = new Zoo(evil, { seed: 1 });
  ok(z3.animals.every((a) => SPECIES[a.species]) && !z3.animals.some((a) => a.species === "lion"), "invalid animals dropped");
  ok(z3.player.z === 31 && z3.ticketPrice === 12, "player in locked zone reset; price sanitised");
  ok(Object.keys(ZONES).length === 3 && MISSIONS.length === 10, "data sanity");
  ok(STORAGE.food && TAPS.length === 3, "storage + taps");
}

/** A diligent player: keeps pens stocked/clean, buys in mission order. */
function balance() {
  console.log("balance");
  const zoo = new Zoo(null, { seed: 11 });
  const P = zoo.player;
  const times = {};
  let t = 0;
  const step = 1 / 10;
  let chore = 0;
  for (; t < 60 * 60; t += step) {
    zoo.update(step);
    chore -= step;
    if (chore <= 0) {
      chore = 20; // a chore round every 20 s (walking time abstracted)
      for (const [id, st] of Object.entries(zoo.enc)) {
        if (!zoo.encOpen(id)) continue;
        if (st.trough < 0.5 && zoo.money > 10) { zoo.money -= 6; st.trough = 1; zoo.stats.troughFills++; }
        if (st.basin < 0.5) { st.basin = 1; zoo.stats.watered++; }
        if (st.dirt.length >= 2) { zoo.stats.cleaned += st.dirt.length; st.dirt = []; zoo.stats.pensCleaned++; zoo.money -= 3; }
      }
      const buy = () => {
        if (!zoo.enc.zebra.built && zoo.money >= 1300) return zoo.build("zebra");
        if (zoo.stats.animalsBought < 1 && zoo.money > 300) return zoo.buyAnimal("rabbit");
        if (!zoo.upgrades.benches && zoo.money >= 500) return zoo.buyUpgrade("benches");
        if (!zoo.staff.keeper && zoo.money >= 600) return zoo.hire("keeper");
        if (!zoo.zones.savanna && zoo.money >= 1800) return zoo.unlockZone("savanna");
        if (zoo.zones.savanna && !zoo.enc.lion.built && zoo.money >= 3200) return zoo.build("lion");
        if (zoo.enc.lion.built && !zoo.enc.giraffe.built && zoo.money >= 2300) return zoo.build("giraffe");
        if (zoo.enc.giraffe.built && !zoo.zones.valley && zoo.money >= 2800) return zoo.unlockZone("valley");
        if (zoo.zones.valley && !zoo.enc.elephant.built && zoo.money >= 4800) return zoo.build("elephant");
        return false;
      };
      while (buy());
      P.food = 0;
    }
    if (zoo.mission > 0 && zoo.stats.fed < 3) zoo.stats.fed = 3;
    for (const e of zoo.events.splice(0)) {
      if (e.type === "mission") times["M" + e.index + " " + e.msg] = (t / 60).toFixed(1) + "m";
      if (e.type === "purchase") times[e.msg.slice(0, 40)] = (t / 60).toFixed(1) + "m";
    }
    if (zoo.enc.elephant.built && zoo.mission >= MISSIONS.length) break;
  }
  for (const [k, v] of Object.entries(times)) console.log("  ", v.padStart(6), k);
  console.log(`   end ${(t / 60).toFixed(1)}m money=${Math.round(zoo.money)} sat=${zoo.sat.toFixed(2)} visitors=${zoo.visitors.length} interval=${zoo.spawnInterval().toFixed(1)}s mission=${zoo.mission}`);
  ok(zoo.mission >= 7, "missions progress in a balance run");
  ok(t / 60 < 50, "full progression within 50 minutes");
}

if (mode === "core" || mode === "all") core();
if (mode === "balance" || mode === "all") balance();
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
