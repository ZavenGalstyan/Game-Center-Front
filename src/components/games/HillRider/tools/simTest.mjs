/**
 * Headless checks: `node src/components/games/HillRider/tools/simTest.mjs [terrain|physics|game|upgrades|drive|save|all]`
 */
import { MAPS, VEHICLES, UPGRADES, MAX_LEVEL, tunedVehicle, upgradeCost, loadSave, writeSave, defaultSave, SAVE_KEY } from "../data.js";
import { createTerrain } from "../terrain.js";
import { createRun, stepWorld, toWorld } from "../physics.js";
import { botInput } from "./bot.mjs";

const which = process.argv[2] || "all";
let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails++;
};
const sim = (w, secs, input = {}) => {
  for (let k = 0; k < secs * 60 && !(w.over && w.overTimer <= 0); k++) stepWorld(w, 1 / 60, typeof input === "function" ? input(w) : input);
  return w;
};
const has = (w, type) => w.events.some((e) => e.type === type);

if (which === "terrain" || which === "all") {
  for (const [id, map] of Object.entries(MAPS)) {
    const a = createTerrain(map), b = createTerrain(map);
    let same = true, maxJump = 0, maxSlope = 0, prev = a.h(0);
    for (let x = 0; x < 4000; x += 0.25) {
      const h = a.h(x);
      if (Math.abs(h - b.h(x)) > 1e-9) same = false;
      maxJump = Math.max(maxJump, Math.abs(h - prev));
      maxSlope = Math.max(maxSlope, Math.abs(a.at(x).dy));
      prev = h;
    }
    // numeric vs analytic slope
    let dErr = 0;
    for (let x = 1; x < 2000; x += 3.7) dErr = Math.max(dErr, Math.abs((a.h(x + 1e-4) - a.h(x - 1e-4)) / 2e-4 - a.at(x).dy));
    check(`${id}: deterministic, continuous, smooth (max step ${maxJump.toFixed(2)} m / 0.25 m, slope ≤ ${maxSlope.toFixed(2)}, deriv err ${dErr.toExponential(1)})`, same && maxJump < 0.4 && maxSlope < 1.35 && dErr < 1e-3);
    const gaps = a.cans.filter((c) => c.x < 4000).map((c, i, l) => (i ? c.x - l[i - 1].x : c.x));
    check(`${id}: ${a.coins.filter((c) => c.x < 4000).length} coins + ${gaps.length} fuel cans in 4 km, max can gap ${Math.max(...gaps).toFixed(0)} m`, gaps.length > 8 && Math.max(...gaps) < 520);
  }
}

if (which === "physics" || which === "all") {
  for (const id of Object.keys(VEHICLES)) {
    const w = createRun("green", id);
    sim(w, 4);
    const c = w.chassis, v = w.v;
    const still = Math.hypot(c.vx, c.vy) < 0.05 && Math.abs(c.w) < 0.05;
    const exts = w.wheels.map((wh) => {
      const [ax, ay] = toWorld(c, wh.ax, wh.ay);
      return (wh.x - ax) * Math.sin(c.a) - (wh.y - ay) * Math.cos(c.a);
    });
    const onGround = w.wheels.every((wh) => wh.contact && Math.abs(wh.y - w.terrain.h(wh.x) - wh.r) < 0.03);
    check(`${id}: settles at rest — still, level, wheels on the ground, suspension within travel (${exts.map((e) => e.toFixed(2)).join("/")})`, still && Math.abs(c.a) < 0.02 && onGround && exts.every((e) => e >= v.travel[0] - 0.01 && e <= v.travel[1] + 0.01));
    // drop from height: suspension absorbs it
    const d = createRun("green", id);
    d.chassis.y += 3;
    d.wheels.forEach((wh) => (wh.y += 3));
    let minExt = 9, pen = 0;
    for (let k = 0; k < 120; k++) {
      stepWorld(d, 1 / 60, {});
      const cc = d.chassis;
      d.wheels.forEach((wh) => {
        const [ax, ay] = toWorld(cc, wh.ax, wh.ay);
        minExt = Math.min(minExt, (wh.x - ax) * Math.sin(cc.a) - (wh.y - ay) * Math.cos(cc.a));
        pen = Math.max(pen, d.terrain.h(wh.x) + wh.r - wh.y);
      });
    }
    check(`${id}: 3 m drop compresses the suspension (min ${minExt.toFixed(2)} m), wheels never sink > 3 cm, no crash, landing event`, minExt < v.rest - 0.1 && pen < 0.03 && !d.over && has(d, "land"));
  }
  // gas, brake, reverse, wheel rolling
  const w = sim(createRun("green", "jeep"), 3, { gas: true });
  const v0 = w.chassis.vx;
  const roll = w.wheels.every((wh) => Math.abs(wh.s * wh.r - wh.vx) < 1.5);
  check(`gas accelerates (${v0.toFixed(1)} m/s after 3 s) and wheels roll with the ground`, v0 > 8 && roll);
  sim(w, 1.2, { brake: true });
  check(`brake slows down (${w.chassis.vx.toFixed(1)} m/s)`, w.chassis.vx < v0 - 5);
  sim(w, 3, { brake: true });
  check(`holding brake when stopped reverses (${w.chassis.vx.toFixed(1)} m/s)`, w.chassis.vx < -1);
  // air control + flip
  const f = createRun("green", "bike");
  f.chassis.y += 30;
  f.wheels.forEach((wh) => (wh.y += 30));
  f.chassis.vx = 6;
  f.wheels.forEach((wh) => (wh.vx = 6));
  sim(f, 0.5, { gas: true });
  const spin = f.chassis.w;
  sim(f, 1.5, { gas: true });
  check(`gas in the air rotates backwards (ω ${spin.toFixed(1)}), full turn = flip event`, spin > 1 && has(f, "flip"));
  // rollover
  const r = createRun("green", "jeep");
  r.chassis.a = Math.PI;
  r.chassis.y += 1.2;
  sim(r, 3);
  check(`landing upside down is a crash (${r.over})`, r.over === "crash" && has(r, "done"));
  // terrain collision of chassis: no tunnelling at speed
  const t = createRun("snow", "monster");
  let worst = 0;
  sim(t, 30, (ww) => {
    for (const [lx, ly] of ww.v.body) {
      const [x, y] = toWorld(ww.chassis, lx, ly);
      worst = Math.max(worst, ww.terrain.h(x) - y);
    }
    return botInput(ww);
  });
  check(`chassis points never sink deep into terrain (worst ${worst.toFixed(2)} m)`, worst < 0.25);
}

if (which === "game" || which === "all") {
  // fuel drains, stalls, ends the run
  const w = createRun("green", "jeep");
  w.fuel = 0.02;
  sim(w, 30, { gas: true });
  check(`running out of fuel ends the run (${w.over}, fuelOut event)`, w.over === "fuel" && has(w, "fuelOut") && has(w, "done"));
  // full tank lasts ~fuelTime of throttle
  const d = createRun("green", "jeep");
  sim(d, 10, { gas: true });
  const used = 1 - d.fuel;
  check(`tank drains ~${(10 / d.v.fuelTime * 100).toFixed(0)}% per 10 s of gas (used ${(used * 100).toFixed(0)}%) minus refills`, used > 0 || has(d, "fuel"));
  // fuel can refills
  const c = createRun("green", "jeep");
  c.terrain.extend(600);
  const can = c.terrain.cans[0];
  c.fuel = 0.7; // enough to reach the first can, low enough that a refill shows
  sim(c, 60, (ww) => (ww.chassis.x < can.x + 3 ? botInput(ww) : {}));
  check(`driving over the first fuel can (${can.x.toFixed(0)} m) refills the tank`, can.got && has(c, "fuel"));
  // coins
  const k = sim(createRun("green", "jeep"), 25, botInput);
  const got = k.terrain.coins.filter((x) => x.got).reduce((s, x) => s + x.v, 0);
  check(`coins collected along the way (${k.coins} = sum of picked coins ${got})`, k.coins > 0 && k.coins === got);
  check(`distance is metres from the start (${k.dist} m, x ${k.chassis.x.toFixed(0)})`, Math.abs(k.dist - (k.maxX - 6)) < 1);
  // airtime bonus
  const a = createRun("desert", "jeep");
  a.chassis.y += 12;
  a.wheels.forEach((wh) => (wh.y += 12));
  sim(a, 3);
  check(`airtime over 1.2 s pays a bonus`, has(a, "air") && a.bonus > 0);
}

if (which === "upgrades" || which === "all") {
  const run = (id, up, map = "green", secs = 6) => sim(createRun(map, id, up), secs, { gas: true });
  const base = run("jeep", {}), eng = run("jeep", { engine: 5 });
  check(`engine upgrade: faster (${base.chassis.x.toFixed(0)} m → ${eng.chassis.x.toFixed(0)} m in 6 s)`, eng.chassis.x > base.chassis.x + 5);
  check(`fuel upgrade: bigger tank (${tunedVehicle("jeep").fuelTime.toFixed(0)} s → ${tunedVehicle("jeep", { fuel: 5 }).fuelTime.toFixed(0)} s)`, tunedVehicle("jeep", { fuel: 5 }).fuelTime > tunedVehicle("jeep").fuelTime * 1.8);
  // tyres: launch on icy snow spins less
  const slipOf = (up) => {
    const w = createRun("snow", "jeep", up);
    let s = 0;
    for (let k = 0; k < 60; k++) (stepWorld(w, 1 / 60, { gas: true }), (s += w.wheels.reduce((a, wh) => a + (wh.slip || 0), 0)));
    return [s, w.chassis.vx];
  };
  const [s0, v0] = slipOf({}), [s5, v5] = slipOf({ tires: 5 });
  check(`tyre upgrade: more grip on snow (wheelspin ${s0.toFixed(0)} → ${s5.toFixed(0)}, 1 s speed ${v0.toFixed(1)} → ${v5.toFixed(1)})`, s5 < s0 && v5 > v0);
  // suspension: settles with less sag
  const sag = (up) => {
    const w = sim(createRun("green", "jeep", up), 3);
    return w.chassis.y - w.terrain.h(w.chassis.x);
  };
  check(`suspension upgrade: stiffer (ride height ${sag({}).toFixed(3)} → ${sag({ suspension: 5 }).toFixed(3)} m)`, sag({ suspension: 5 }) > sag({}) + 0.01);
  check(`upgrade costs rise per level and per vehicle`, upgradeCost("jeep", 1) > upgradeCost("jeep", 0) && upgradeCost("monster", 0) > upgradeCost("jeep", 0));
  check(`4 upgrades x ${MAX_LEVEL} levels`, Object.keys(UPGRADES).length === 4);
}

if (which === "drive" || which === "all") {
  // bot drives every vehicle on every map
  for (const m of Object.keys(MAPS))
    for (const id of Object.keys(VEHICLES)) {
      const w = createRun(m, id, { engine: 2, suspension: 2, tires: 2, fuel: 2 });
      sim(w, 150, botInput);
      console.log(`info: ${m}/${id}: ${w.dist} m, ${w.coins} coins, ${w.bonus} bonus, end: ${w.over || "still driving"}`);
      check(`${m}/${id}: bot gets past 400 m`, w.dist > 400);
    }
}

if (which === "save" || which === "all") {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
  check("fresh save: jeep + green hills only", JSON.stringify(loadSave()) === JSON.stringify(defaultSave()));
  const s = { ...defaultSave(), coins: 1234, owned: { jeep: true, bike: true }, maps: { green: true, snow: true }, upgrades: { jeep: { engine: 2 }, bike: {}, monster: {} }, best: { green: 812 }, vehicle: "bike", map: "snow" };
  writeSave(s);
  const r = loadSave();
  check("save round-trips coins, unlocks, upgrades, bests, selection", r.coins === 1234 && r.owned.bike && r.maps.snow && r.upgrades.jeep.engine === 2 && r.best.green === 812 && r.vehicle === "bike" && r.map === "snow");
  store[SAVE_KEY] = "{broken";
  check("corrupt save falls back to defaults", loadSave().coins === 0);
  store[SAVE_KEY] = JSON.stringify({ vehicle: "monster", owned: { jeep: true } });
  check("selected vehicle must be owned", loadSave().vehicle === "jeep");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
