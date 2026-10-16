/**
 * Tank Warfare 3D — headless checks. Run from the repo root:
 *   node src/components/games/TankWarfare3D/tools/simTest.mjs [core|maps|missions|modes|all] [difficulty] [ids…]
 */
import { Sim, solveElev } from "../sim.js";
import { buildMap } from "../map.js";
import { MISSIONS, TRAINING, SURVIVAL, AMMO, tankStats } from "../data.js";
import { createBot } from "./bot.mjs";
import { applyResult, freshProgress, sanitize, buyUpgrade, buyTank, canBuyTank } from "../progress.js";

const DT = 1 / 60;
let pass = 0;
let fail = 0;
const ok = (cond, name, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "  ok " : "FAIL "} ${name}${extra ? "  — " + extra : ""}`);
};
const run = (sim, inp, secs) => {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    sim.step(typeof inp === "function" ? inp(i) : inp, DT);
    sim.events.length = 0;
    sim.fx.length = 0;
  }
};
/** Mission 1 with its stage emptied: an open desert test range. */
function range(o = {}) {
  const s = new Sim({ mode: "campaign", mission: 1, seed: 7, ...o });
  s.tanks = [s.player];
  s.stage = { def: { type: "test", label: "test" }, t: 0, units: [] };
  s.updateStage = () => {};
  return s;
}
const place = (s, t, x, z, h = 0) => {
  t.x = x;
  t.z = z;
  t.heading = h;
  t.y = s.map.groundAt(x, z);
};

function core() {
  console.log("— movement");
  {
    const s = range();
    const p = s.player;
    place(s, p, 0, -160, 0);
    run(s, { throttle: 1 }, 4);
    ok(p.z > -160 + 25, "W drives forward through the world", `moved ${(p.z + 160).toFixed(1)} m in 4 s`);
    const zf = p.z;
    run(s, { throttle: -1 }, 5);
    ok(p.z < zf - 8, "S brakes and reverses", `${(zf - p.z).toFixed(1)} m back`);
    ok(Math.abs(p.speed) <= p.st.revSpeed * 1.05 + 0.5, "reverse speed is limited", `${p.speed.toFixed(2)} m/s (max ${p.st.revSpeed})`);
    const s2 = range();
    place(s2, s2.player, 0, -160, 0);
    run(s2, { throttle: 1 }, 8);
    ok(Math.abs(s2.player.speed - s2.player.st.maxSpeed) < 1.2, "accelerates to top speed", `${s2.player.speed.toFixed(2)} / ${s2.player.st.maxSpeed}`);
  }
  {
    const s = range();
    const p = s.player;
    place(s, p, 0, -160, 0);
    run(s, { throttle: 0.6, steer: 1 }, 1.2);
    // heading decreasing = turning right (x goes negative for a +z facing tank)
    ok(p.heading < -0.4 && p.x < 0, "D turns right", `heading ${p.heading.toFixed(2)}, x ${p.x.toFixed(1)}`);
    const s2 = range();
    place(s2, s2.player, 0, -160, 0);
    run(s2, { steer: -1 }, 1.5);
    ok(s2.player.heading > 0.6 && Math.hypot(s2.player.x, s2.player.z + 160) < 1.5, "A pivots left on the spot (neutral steer)", `heading ${s2.player.heading.toFixed(2)}`);
  }
  {
    const s = range();
    const p = s.player;
    place(s, p, 0, -160, 0);
    let boosted = 0;
    run(s, (i) => {
      boosted = Math.max(boosted, p.speed);
      return { throttle: 1, boost: true };
    }, 5);
    ok(boosted > p.st.maxSpeed * 1.2, "Shift boost raises top speed", `${boosted.toFixed(1)} vs ${p.st.maxSpeed}`);
    ok(p.boost < 0.1 || p.boost < 1, "boost drains", p.boost.toFixed(2));
  }
  console.log("— turret, gun, aim");
  {
    const s = range();
    const p = s.player;
    place(s, p, 0, -160, 0);
    const aim = { x: p.x + 100, y: p.y + 2, z: p.z };
    run(s, { aim }, 3);
    ok(Math.abs(p.heading) < 1e-6, "hull keeps its heading while aiming", p.heading.toFixed(3));
    ok(Math.abs(Math.abs(p.tLocal) - Math.PI / 2) < 0.05, "turret rotates independently (90° to the side)", `local yaw ${p.tLocal.toFixed(2)}`);
    const s2 = range();
    const p2 = s2.player;
    place(s2, p2, 0, -160, 0);
    run(s2, { aim: { x: p2.x + 100, y: p2.y, z: p2.z }, steer: 1 }, 1);
    const t0 = p2.heading + p2.tLocal;
    run(s2, { aim: { x: p2.x + 100, y: p2.y, z: p2.z } }, 0.3);
    ok(Math.abs(p2.tLocal) > 0.2, "turret yaw is decoupled from the hull turning", `world yaw ${t0.toFixed(2)}`);
    const t1 = p2.st.traverse;
    const s3 = range();
    place(s3, s3.player, 0, -160, 0);
    run(s3, { aim: { x: 0, y: s3.player.y, z: -160 - 100 } }, 0.5);
    ok(Math.abs(s3.player.tLocal) <= t1 * 0.5 + 0.02, "turret traverse is rate limited", `${s3.player.tLocal.toFixed(2)} rad in 0.5 s (rate ${t1})`);
  }
  {
    const s = range();
    const p = s.player;
    place(s, p, 0, -160, 0);
    run(s, { aim: { x: 0, y: p.y + 2, z: p.z + 300 } }, 2);
    const eFar = p.elev;
    run(s, { aim: { x: 0, y: p.y + 2, z: p.z + 40 } }, 2);
    ok(eFar > p.elev + 0.005, "cannon elevates for distant targets", `${eFar.toFixed(3)} vs ${p.elev.toFixed(3)} rad`);
    const e = solveElev(200, 0, 235);
    ok(e > 0.01 && e < 0.05, "ballistic solve is sane", `${(e * 57.3).toFixed(2)}° for 200 m`);
  }
  console.log("— shells");
  {
    const s = range();
    const p = s.player;
    place(s, p, 0, -100, 0);
    p.bloom = 0;
    p.st = { ...p.st, dispersion: 0 };
    run(s, { aim: { x: 0, y: p.y + 2, z: p.z + 150 } }, 2.5);
    s.step({ aim: { x: 0, y: p.y + 2, z: p.z + 150 }, fire: true }, DT);
    ok(s.shells.length === 1, "left click fires a shell", `${s.shells.length} shells`);
    const sh = s.shells[0];
    const y0 = sh.y;
    const z0 = sh.z;
    s.step({}, DT);
    const vy1 = s.shells[0]?.vy;
    s.step({}, DT);
    ok(s.shells[0] && s.shells[0].z > z0 + 6, "shell travels through 3D space (not hitscan)", `+${(s.shells[0]?.z - z0).toFixed(1)} m in 2 steps`);
    ok(s.shells[0] && s.shells[0].vy < vy1, "gravity pulls the shell down", `vy ${vy1?.toFixed(2)} → ${s.shells[0]?.vy.toFixed(2)}`);
    ok(p.reload > 0 && p.ammo.ap === AMMO.ap.count - 1, "firing starts the reload and uses ammo", `reload ${p.reload.toFixed(2)} ammo ${p.ammo.ap}`);
    const r0 = p.reload;
    s.step({ fire: true }, DT);
    ok(s.shells.length === 1 || s.stats.shots === 1, "cannot fire again while reloading", `${s.stats.shots} shots`);
    run(s, {}, r0 + 0.1);
    ok(p.reload === 0, "reload completes", "");
    ok(y0 > 0, "shell spawns at the muzzle", y0.toFixed(2));
  }
  {
    // swept collision: a target 5 cm thick-equivalent can't be skipped at 235 m/s (3.9 m/step)
    const s = range();
    const p = s.player;
    place(s, p, 0, -100, 0);
    p.bloom = 0;
    p.st = { ...p.st, dispersion: 0 };
    const e = s.spawnUnit("dummy", 0, -40, { order: "dummy", heading: Math.PI / 2 });
    place(s, e, 0, -40, Math.PI / 2);
    const aim = { x: 0, y: e.y + 1, z: -40 };
    run(s, { aim }, 2.5);
    const hp0 = e.hp;
    s.step({ aim, fire: true }, DT);
    run(s, { aim }, 1);
    ok(e.hp < hp0, "AP shell hits the target (swept test)", `hp ${hp0} → ${e.hp.toFixed(1)}`);
  }
  {
    // buildings stop shells
    const s = new Sim({ mode: "campaign", mission: 11, seed: 3 });
    s.tanks = [s.player];
    s.updateStage = () => {};
    const b = s.map.obstacles.find((o) => o.kind === "building" && o.h > 15 && Math.abs(o.x) > 20);
    const p = s.player;
    // stand 40 m south of the building, target 30 m north of it
    place(s, p, b.x, b.z - b.hz - 40, 0);
    const e = s.spawnUnit("dummy", b.x, b.z + b.hz + 30, { order: "dummy" });
    place(s, e, b.x, b.z + b.hz + 30, 0);
    s.obAlive.fill(1);
    let hitB = null;
    const aim = { x: e.x, y: e.y + 1, z: e.z };
    run(s, { aim }, 3);
    const hp0 = e.hp;
    s.step({ aim, fire: true }, DT);
    for (let i = 0; i < 120; i++) {
      s.step({ aim }, DT);
      for (const ev of s.events) if (ev.type === "impact") hitB = ev.kind;
      s.events.length = 0;
    }
    ok(e.hp === hp0 && hitB === "obstacle", "shells do not pass through buildings", `impact on ${hitB}, target hp ${e.hp}`);
  }
  console.log("— damage model");
  {
    const mk = (face) => {
      const s = range();
      const p = s.player;
      place(s, p, 0, -100, 0);
      p.bloom = 0;
      p.st = { ...p.st, dispersion: 0 };
      const ang = face === "front" ? Math.PI : face === "rear" ? 0 : Math.PI / 2;
      const e = s.spawnUnit("raider", 0, -50, { order: "dummy" });
      e.brain.order = "dummy";
      place(s, e, 0, -50, ang);
      const aim = { x: 0, y: e.y + 1.1, z: -50 };
      run(s, { aim }, 2.5);
      s.step({ aim, fire: true }, DT);
      run(s, { aim }, 0.8);
      return e.maxHp - e.hp;
    };
    const f = mk("front");
    const sd = mk("side");
    const r = mk("rear");
    ok(f > 0 && sd > f && r > sd, "direction-based armour: rear > side > front damage", `front ${f.toFixed(1)} side ${sd.toFixed(1)} rear ${r.toFixed(1)}`);
  }
  {
    // HE splash damages a group; AP barely splashes
    const test = (ammo) => {
      const s = range();
      const p = s.player;
      place(s, p, 0, -100, 0);
      p.bloom = 0;
      p.st = { ...p.st, dispersion: 0 };
      const units = [[0, -45], [4.5, -47], [-4.5, -47]].map(([x, z]) => {
        const u = s.spawnUnit("scout", x, z, { order: "dummy" });
        u.brain.order = "dummy";
        place(s, u, x, z, Math.PI);
        return u;
      });
      const aim = { x: 0, y: s.map.groundAt(0, -43) + 0.2, z: -43 };
      run(s, { ammo }, 0.1);
      run(s, { aim }, 3);
      s.step({ aim, fire: true }, DT);
      run(s, { aim }, 1.5);
      return units.slice(1).reduce((a, u) => a + (u.maxHp - u.hp), 0);
    };
    const he = test("he");
    const ap = test("ap");
    ok(he > 8 && he > ap * 3, "HE splash damages nearby tanks", `HE splash ${he.toFixed(1)} vs AP ${ap.toFixed(1)}`);
  }
  {
    const s = range();
    const p = s.player;
    p.hp = 40;
    const k0 = p.kits;
    s.step({ repair: true }, DT);
    ok(p.hp === Math.min(p.maxHp, 40 + p.st.repair) && p.kits === k0 - 1, "R uses a repair kit", `hp ${p.hp} kits ${p.kits}`);
    p.hp = p.maxHp;
    run(s, {}, 2.1);
    s.step({ repair: true }, DT);
    ok(p.kits === k0 - 1, "no kit wasted when undamaged", `kits ${p.kits}`);
  }
  {
    const s = range();
    const e = s.spawnUnit("raider", 0, -60, { order: "dummy" });
    e.brain.order = "dummy";
    s.damage(e, 500, { from: s.player });
    ok(!e.alive && s.stats.kills === 1 && s.wrecks.length === 1, "enemy destroyed at zero health, leaves a wreck", `alive ${e.alive} wrecks ${s.wrecks.length}`);
  }
  console.log("— smoke");
  {
    const s = range();
    const p = s.player;
    place(s, p, 0, -100, 0);
    const ax = 0;
    const az = -20;
    const ay = s.map.groundAt(ax, az) + 2;
    const before = s.los(p.x, p.y + 2.5, p.z, ax, ay, az);
    s.smokes.push({ x: 0, y: s.map.groundAt(0, -60) + 2.5, z: -60, r: 10, maxR: 10, life: 10, max: 10, age: 0 });
    const after = s.los(p.x, p.y + 2.5, p.z, ax, ay, az);
    ok(before && !after, "smoke blocks line of sight", `before ${before} after ${after}`);
    // smoke shell creates a cloud
    p.bloom = 0;
    run(s, { ammo: "smoke" }, 0.1);
    const aim = { x: 0, y: p.y, z: p.z + 50 };
    run(s, { aim }, 3);
    s.step({ aim, fire: true }, DT);
    run(s, {}, 1.5);
    ok(s.smokes.length === 2, "smoke shell deploys a cloud", `${s.smokes.length} clouds`);
  }
  console.log("— destructibles");
  {
    const s = range();
    const p = s.player;
    const crate = s.map.obstacles.find((o) => o.destruct === "crate");
    // drive into it
    const dx = crate.x;
    const dz = crate.z - 20;
    place(s, p, dx, dz, 0);
    run(s, () => {
      const diff = Math.atan2(crate.x - p.x, crate.z - p.z) - p.heading;
      return { throttle: 1, steer: -diff * 2 };
    }, 4);
    ok(!s.obAlive[crate.i], "tank crushes a crate", `alive ${s.obAlive[crate.i]}`);
    const tower = s.map.obstacles.find((o) => o.destruct === "tower");
    s.splash(tower.x, tower.base + 2, tower.z, 7.5, 60, p);
    ok(!s.obAlive[tower.i], "explosion destroys a watchtower", "");
    const barrel = s.map.obstacles.find((o) => o.destruct === "barrel");
    const e = s.spawnUnit("scout", barrel.x + 3, barrel.z, { order: "dummy" });
    e.brain.order = "dummy";
    place(s, e, barrel.x + 3, barrel.z, 0);
    s.obHp[barrel.i] = 0.1;
    s.destroyObstacle(barrel, p);
    ok(e.hp < e.maxHp, "fuel barrel explodes and damages nearby tanks", `hp ${e.hp.toFixed(1)}`);
  }
  console.log("— collision");
  {
    const s = new Sim({ mode: "campaign", mission: 11, seed: 3 });
    s.tanks = [s.player];
    s.updateStage = () => {};
    const b = s.map.obstacles.find((o) => o.kind === "building" && Math.abs(o.x) > 20);
    const p = s.player;
    place(s, p, b.x, b.z - b.hz - 12, 0);
    run(s, { throttle: 1 }, 5);
    ok(p.z < b.z - b.hz, "tank cannot drive through a building", `front at ${(p.z + p.L.hz).toFixed(1)}, wall at ${(b.z - b.hz).toFixed(1)}`);
    const s2 = range();
    const q = s2.player;
    place(s2, q, 0, -150, 0);
    const e = s2.spawnUnit("bulwark", 0, -138, { order: "dummy" });
    e.brain.order = "dummy";
    place(s2, e, 0, -138, 0);
    run(s2, { throttle: 1 }, 3);
    ok(Math.hypot(q.x - e.x, q.z - e.z) > 5, "tanks cannot drive through each other", `gap ${Math.hypot(q.x - e.x, q.z - e.z).toFixed(1)} m`);
  }
  console.log("— enemy AI");
  {
    const s = range();
    const p = s.player;
    place(s, p, 0, -185, 0);
    const e = s.spawnUnit("raider", 0, 20, { order: "patrol", patrol: [[-40, 20], [40, 20]] });
    const x0 = e.x;
    run(s, {}, 6);
    ok(Math.abs(e.x - x0) > 8 && !e.brain.aware, "enemy tanks drive (patrol) while unaware", `moved ${Math.abs(e.x - x0).toFixed(1)} m`);
    place(s, p, 0, -100, 0);
    e.brain.patrol = [[0, -60], [0, -40]];
    e.brain.path = null;
    let fired = 0;
    let turretOff = 0;
    for (let i = 0; i < 60 * 25; i++) {
      s.step({}, DT);
      for (const ev of s.events) if (ev.type === "fire" && ev.tank === e) fired++;
      if (Math.abs(e.tLocal) > 0.3) turretOff++;
      s.events.length = 0;
    }
    ok(e.brain.aware, "enemy detects the player", `state ${e.brain.state}`);
    ok(fired >= 2, "enemy aims and fires repeatedly (with reloads)", `${fired} shots`);
    ok(p.hp < p.maxHp, "player takes damage from enemy shells", `hp ${p.hp.toFixed(1)}`);
    ok(turretOff > 30, "enemy turret rotates independently of its hull", `${turretOff} frames off-axis`);
  }
  {
    // accuracy differs by difficulty, nobody is perfect
    const hitRate = (diff) => {
      let shots = 0;
      let hits = 0;
      for (let seed = 1; seed <= 3; seed++) {
        const s = range({ difficulty: diff, seed });
        const p = s.player;
        p.st = { ...p.st, hp: 1e6 };
        p.hp = p.maxHp = 1e6;
        place(s, p, 0, -150, Math.PI / 2);
        const e = s.spawnUnit("raider", 0, -50, { order: "hold" });
        place(s, e, 0, -50, Math.PI);
        for (let i = 0; i < 60 * 40; i++) {
          s.step({ throttle: i % 480 < 240 ? 0.7 : -0.7 }, DT);
          for (const ev of s.events) {
            if (ev.type === "fire" && ev.tank === e) shots++;
            if (ev.type === "playerHit" && ev.kind === "shell") hits++;
          }
          s.events.length = 0;
        }
      }
      return { shots, hits, rate: hits / Math.max(1, shots) };
    };
    const ez = hitRate("easy");
    const hd = hitRate("hard");
    ok(ez.rate < hd.rate, "hard enemies are more accurate than easy ones", `easy ${ez.hits}/${ez.shots}, hard ${hd.hits}/${hd.shots}`);
    ok(hd.rate < 0.98, "even hard enemies miss sometimes", `hard ${(hd.rate * 100).toFixed(0)}%`);
  }
  {
    // obstacle avoidance: path around a building to reach the player
    const s = new Sim({ mode: "campaign", mission: 11, seed: 5, god: true });
    s.tanks = [s.player];
    s.updateStage = () => {};
    const p = s.player;
    place(s, p, 0, -75, 0);
    const e = s.spawnUnit("raider", -112, -100, { order: "hunt" });
    let insideBuilding = false;
    let minD = Infinity;
    for (let i = 0; i < 60 * 40; i++) {
      s.step({}, DT);
      s.events.length = 0;
      for (const o of s.map.obstacles) {
        if (o.kind !== "building") continue;
        const dx = e.x - o.x;
        const dz = e.z - o.z;
        if (Math.abs(dx) < o.hx - 0.5 && Math.abs(dz) < o.hz - 0.5) insideBuilding = true;
      }
      minD = Math.min(minD, Math.hypot(e.x - p.x, e.z - p.z));
    }
    ok(!insideBuilding, "enemy never drives through buildings", "");
    ok(minD < 100, "enemy navigates the streets towards the player", `closest ${minD.toFixed(0)} m`);
  }
  {
    // retreat when heavily damaged
    const s = range({ god: true });
    const p = s.player;
    place(s, p, 0, -150, 0);
    const e = s.spawnUnit("raider", 0, -80, { order: "guard" });
    run(s, {}, 3);
    s.damage(e, e.maxHp * 0.75, { from: p, kind: "shell" });
    run(s, {}, 0.1);
    ok(e.brain.state === "retreat", "enemy retreats when heavily damaged", e.brain.state);
    const d0 = Math.hypot(e.x - p.x, e.z - p.z);
    run(s, {}, 5);
    ok(Math.hypot(e.x - p.x, e.z - p.z) > d0 + 10, "retreating enemy moves away", `${d0.toFixed(0)} → ${Math.hypot(e.x - p.x, e.z - p.z).toFixed(0)} m`);
  }
  {
    // smoke breaks the enemy's line of sight
    const s = range({ god: true });
    const p = s.player;
    place(s, p, 0, -150, 0);
    const e = s.spawnUnit("raider", 0, -80, { order: "hold" });
    run(s, {}, 4);
    const seenBefore = e.brain.visible;
    s.smokes.push({ x: 0, y: s.map.groundAt(0, -140) + 2.5, z: -140, r: 10, maxR: 10, life: 30, max: 30, age: 0 });
    run(s, {}, 1);
    let shotsInSmoke = 0;
    for (let i = 0; i < 60 * 8; i++) {
      s.step({}, DT);
      for (const ev of s.events) if (ev.type === "fire" && ev.tank === e) shotsInSmoke++;
      s.events.length = 0;
    }
    ok(seenBefore && !e.brain.visible && shotsInSmoke === 0, "smoke hides the player from enemy tanks", `visible ${e.brain.visible}, shots ${shotsInSmoke}`);
  }
  console.log("— upgrades / progression");
  {
    const base = tankStats("fox", {});
    const up = tankStats("fox", { engine: 5, cannon: 5, reload: 5, armor: 5, turret: 5, repair: 5 });
    ok(up.maxSpeed > base.maxSpeed * 1.25 && up.dmg > base.dmg * 1.3 && up.reload < base.reload * 0.75 && up.armor.front > base.armor.front && up.traverse > base.traverse * 1.5 && up.kits === base.kits + 3, "upgrades change real stats", `speed ${base.maxSpeed}→${up.maxSpeed.toFixed(1)}, reload ${base.reload}→${up.reload.toFixed(2)}`);
    const a = range();
    place(a, a.player, 0, -160, 0);
    run(a, { throttle: 1 }, 6);
    const b = range({ up: { engine: 5 } });
    place(b, b.player, 0, -160, 0);
    run(b, { throttle: 1 }, 6);
    ok(b.player.z > a.player.z + 5, "engine upgrade makes the tank faster in play", `${(a.player.z + 160).toFixed(0)} vs ${(b.player.z + 160).toFixed(0)} m`);
    let prog = freshProgress();
    ok(!prog.tanks.viper && prog.tanks.fox, "only Iron Fox starts unlocked", "");
    prog.credits = 99999;
    ok(!canBuyTank(prog, "viper").ok, "Desert Viper locked before its mission milestone", canBuyTank(prog, "viper").why);
    for (let id = 1; id <= 4; id++) prog = applyResult(prog, { mode: "campaign", mission: id, win: true, kills: 3, hpLeft: 0.5, time: 100 }).prog;
    ok(canBuyTank(prog, "viper").ok, "Viper available after mission 4", "");
    prog = buyTank(prog, "viper");
    ok(prog.tanks.viper, "Viper purchase unlocks it", "");
    const c0 = prog.credits;
    prog = buyUpgrade(prog, "viper", "engine");
    ok(prog.up.viper.engine === 1 && prog.credits < c0, "upgrade purchase spends credits", `${c0} → ${prog.credits}`);
    const round = sanitize(JSON.parse(JSON.stringify(prog)));
    ok(round.tanks.viper && round.up.viper.engine === 1 && round.unlocked === prog.unlocked, "save/load round-trips progression", `unlocked ${round.unlocked}`);
    const bad = sanitize({ credits: "lots", tanks: { fox: false }, up: { fox: { armor: 99 } }, unlocked: -4 });
    ok(bad.credits === 0 && bad.tanks.fox && bad.up.fox.armor === 5 && bad.unlocked === 1, "corrupted saves are sanitized", "");
  }
}

function maps() {
  console.log("— battlefield reachability");
  for (const w of ["desert", "forest", "city"]) {
    const m = buildMap(w);
    const pts = [];
    for (const mis of MISSIONS.filter((x) => x.world === w)) {
      pts.push([`M${mis.id} start`, mis.start]);
      for (const st of mis.stages) {
        if (st.point) pts.push([`M${mis.id} point`, st.point]);
        if (st.zone) pts.push([`M${mis.id} zone`, st.zone]);
        for (const g of [...(st.spawn || []), ...(st.waves || []).flatMap((x) => x.spawn), ...(st.ambush || []).flatMap((x) => x.spawn)]) {
          pts.push([`M${mis.id} ${g.type}`, g.at]);
          for (const q of g.patrol || []) pts.push([`M${mis.id} patrol`, q]);
        }
        if (st.convoy) for (const q of st.convoy.path) pts.push([`M${mis.id} convoy`, q]);
        for (const t of st.targets || []) pts.push([`M${mis.id} target`, t.at]);
      }
    }
    for (const q of SURVIVAL.spawns[w]) pts.push(["survival spawn", q]);
    pts.push(["survival start", SURVIVAL.starts[w]]);
    if (w === "desert") for (const t of TRAINING.tasks) for (const q of [...(t.gates || []), ...(t.dummies || []), ...(t.movers || [])]) pts.push(["training", q]);
    let bad = [];
    for (const [name, q] of pts) {
      const [fx, fz] = m.nav.nearestFree(q[0], q[1], 6);
      if (!m.nav.inMain(fx, fz) || Math.hypot(fx - q[0], fz - q[1]) > 12) bad.push(`${name} (${q[0]},${q[1]})`);
    }
    ok(bad.length === 0, `${w}: every mission point is on reachable ground`, bad.slice(0, 6).join(", ") || `${pts.length} points`);
    const t0 = performance.now();
    let n = 0;
    for (let k = 0; k < 20; k++) {
      const a = pts[(k * 7) % pts.length][1];
      const b = pts[(k * 13 + 5) % pts.length][1];
      if (m.nav.findPath(a[0], a[1], b[0], b[1])) n++;
      else console.log("      no path", a, "→", b);
    }
    const ms = (performance.now() - t0) / 20;
    ok(n >= 19, `${w}: A* finds paths between mission points`, `${n}/20, ${ms.toFixed(1)} ms avg`);
  }
}

function playMission(id, diff = "medium", tank = "fox", up = {}, seed = 1) {
  const s = new Sim({ mode: "campaign", mission: id, difficulty: diff, tank, up, seed });
  const bot = createBot(s);
  const limit = 60 * 60 * 9;
  let i = 0;
  for (; i < limit && !s.result; i++) {
    s.step(bot(DT), DT);
    s.events.length = 0;
    s.fx.length = 0;
  }
  return s;
}

function missions(diff = "medium", ids = null) {
  console.log(`— campaign (${diff})`);
  const list = ids && ids.length ? ids : MISSIONS.map((m) => m.id);
  for (const id of list) {
    const m = MISSIONS.find((x) => x.id === id);
    // the bot uses a tank you'd plausibly own at that point in the campaign
    const tank = id >= 13 ? "phantom" : id >= 9 ? "titan" : id >= 5 ? "viper" : "fox";
    const lv = Math.min(5, Math.floor(id / 3));
    const up = { armor: lv, engine: lv, cannon: lv, reload: lv, turret: lv, repair: lv };
    let s = null;
    let wins = 0;
    const tries = [];
    const N = Number(process.env.SEEDS || 4);
    for (let seed = 1; seed <= N; seed++) {
      s = playMission(id, diff, tank, up, seed);
      tries.push(s);
      if (s.result?.win) wins++;
    }
    const r = tries.map((x) => (x.result ? `${x.result.win ? "WIN" : "FAIL"} ${x.t.toFixed(0)}s hp${Math.round(x.result.hpLeft * 100)}% k${x.result.kills} acc${Math.round((100 * x.stats.hits) / Math.max(1, x.stats.shots))}%${x.result.win ? "" : " (" + x.result.reason + ")"}` : `TIMEOUT stage ${x.stageIdx} ${x.stage?.def.type}`)).join(" | ");
    ok(wins >= Math.ceil(N / 2), `M${id} ${m.title} completable (${wins}/${N} bot wins)`, r);
  }
}

function modes() {
  console.log("— survival");
  {
    const s = new Sim({ mode: "survival", world: "city", tank: "titan", up: { armor: 4, cannon: 4, reload: 4, repair: 4, engine: 3, turret: 3 }, seed: 4 });
    const bot = createBot(s);
    let maxWave = 0;
    for (let i = 0; i < 60 * 60 * 7 && !s.result; i++) {
      s.step(bot(DT), DT);
      for (const e of s.events) if (e.type === "waveClear") maxWave = e.n;
      s.events.length = 0;
      s.fx.length = 0;
    }
    ok(maxWave >= 3, "survival waves spawn, get cleared and escalate", `cleared ${maxWave} waves, reached wave ${s.wave}${s.result ? "" : " (still alive)"}`);
    for (const w of ["desert", "forest"]) {
      const s2 = new Sim({ mode: "survival", world: w, seed: 2, god: true });
      run(s2, {}, 5);
      ok(s2.wave === 1 && s2.enemiesAlive() > 0, `survival starts in ${w}`, `${s2.enemiesAlive()} enemies`);
    }
  }
  console.log("— training");
  {
    const s = new Sim({ mode: "training", seed: 3 });
    const bot = createBot(s);
    const seen = [];
    for (let i = 0; i < 60 * 60 * 6 && !s.result; i++) {
      s.step(bot(DT), DT);
      for (const e of s.events) if (e.type === "objective") seen.push(e.label);
      s.events.length = 0;
      s.fx.length = 0;
    }
    ok(s.result?.win, "training course completes", `${seen.length}/${TRAINING.tasks.length} drills in ${s.t.toFixed(0)} s; ${s.result ? "" : "stuck on " + s.stage.def.id}`);
    const npc = new Sim({ mode: "training", seed: 1 });
    run(npc, {}, 5);
    ok(npc.player.hp === npc.player.maxHp, "training targets never shoot back", "");
  }
}

const what = process.argv[2] || "all";
const diff = ["easy", "medium", "hard"].includes(process.argv[3]) ? process.argv[3] : "medium";
const ids = process.argv.slice(["easy", "medium", "hard"].includes(process.argv[3]) ? 4 : 3).map(Number).filter(Boolean);
const t0 = Date.now();
if (what === "core" || what === "all") core();
if (what === "maps" || what === "all") maps();
if (what === "missions" || what === "all") missions(diff, ids);
if (what === "modes" || what === "all") modes();
console.log(`\n${pass} passed, ${fail} failed  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
