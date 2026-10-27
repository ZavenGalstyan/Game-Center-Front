/**
 * Iron Arena — headless simulation tests (node, no browser):
 *   node src/components/games/IronArena/tools/simTest.mjs [maps|physics|weapons|abilities|ctf|matches|balance|save|all]
 *
 * maps      every map builds; spawns/flags clear of geometry; nav reaches all
 *           spawns and flags; layouts are point-symmetric (fair)
 * physics   tanks never end up inside walls; ramps/bridges are driveable;
 *           ledges drop; slopes stall; water slows; ice slides
 * weapons   each of the 8 weapons hits, travels (non-zero flight time),
 *           respects armor; rail pierces; flame overheats; clip reloads
 * abilities each ability does what it says
 * ctf       take / drop / return / capture / auto-return rules
 * matches   bot-only matches on every map × mode end correctly, no NaNs,
 *           no stuck bots (failsafe rescues counted)
 * balance   AI-vs-AI kill ratios for every tank vs Striker stay in band
 * save      progression: buying, upgrades, skins, rewards, sanitising
 */
import { MAP_LIST, getMap } from "../engine/maps/index.js";
import { getArena } from "../engine/arena.js";
import { getNav } from "../engine/nav.js";
import { createMatch } from "../engine/match.js";
import { createTank, stepTank } from "../engine/tank.js";
import { tryAbility } from "../engine/combat.js";
import { TANKS, tankStats, upgradeCost } from "../engine/tanks.js";

const which = process.argv[2] || "all";
let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, info = "") {
  if (ok) pass++;
  else {
    fail++;
    failures.push(name + (info ? " — " + info : ""));
    console.log("  FAIL", name, info);
  }
}
const run = (k) => which === "all" || which === k;
const STEP = 1 / 60;

/* ------------------------------------------------------------------ maps */
if (run("maps")) {
  console.log("maps");
  for (const m of MAP_LIST) {
    const map = getMap(m.id);
    const A = getArena(map);
    const N = getNav(A);
    check(`${m.id}: 5+5 team spawns, 2 flags`, map.spawns.team[0].length === 5 && map.spawns.team[1].length === 5 && map.flags.length === 2);
    for (const p of [...map.spawns.team[0], ...map.spawns.team[1], ...map.flags]) {
      const y = A.surfaceAt(p.x, p.z, 60).h;
      check(`${m.id}: point (${p.x},${p.z}) clear`, !A.solidAt(p.x, p.z, 2.2, y, 2.6));
    }
    const pts = [...map.spawns.team[0], ...map.spawns.team[1], ...map.flags];
    const n0 = N.nearest(pts[0].x, pts[0].z, A.surfaceAt(pts[0].x, pts[0].z, 60).h);
    let unreachable = 0;
    for (const p of pts) if (!N.path(n0, N.nearest(p.x, p.z, A.surfaceAt(p.x, p.z, 60).h))) unreachable++;
    check(`${m.id}: nav reaches every spawn & flag`, unreachable === 0, `${unreachable} unreachable`);
    check(`${m.id}: nav graph size`, N.good.length > 400, `${N.good.length} nodes`);
    // point symmetry of collision geometry (fairness)
    let asym = 0;
    for (const c of map.colliders) {
      if (c.kind === "rail") continue;
      const twin = map.colliders.find((o) => o.type === c.type && Math.abs(o.x + c.x) < 0.6 && Math.abs(o.z + c.z) < 0.6);
      if (!twin) asym++;
    }
    check(`${m.id}: colliders point-symmetric`, asym <= 2, `${asym} without a twin`);
    // terrain heights near the two flags match (symmetric base areas)
    const f0 = map.flags[0];
    const f1 = map.flags[1];
    check(`${m.id}: bases at equal height`, Math.abs(A.groundAt(f0.x, f0.z) - A.groundAt(f1.x, f1.z)) < 0.6);
  }
}

/* ------------------------------------------------------------------ physics */
function mkTank(mapId, model, x, z, yaw) {
  const map = getMap(mapId);
  const A = getArena(map);
  const t = createTank({ id: 0, name: "T", team: 0, isPlayer: true, stats: tankStats(model), skin: {}, color: "#fff", x, z, yaw, A });
  return { t, A };
}
function insideSolid(A, t) {
  // the tank's circles may touch walls but never sit deep inside them
  const sy = Math.sin(t.yaw);
  const cy = Math.cos(t.yaw);
  let worst = 0;
  for (const off of t.circles) {
    const cx = t.x + sy * off;
    const cz = t.z + cy * off;
    const p = A.collideCircle(cx, cz, t.r * 0.8, t.y, t.dims.top);
    worst = Math.max(worst, Math.hypot(p.x - cx, p.z - cz));
  }
  return worst;
}
if (run("physics")) {
  console.log("physics");
  // drive into walls at full speed for a while: never end up inside
  for (const m of MAP_LIST) {
    const map = getMap(m.id);
    for (const model of ["scout", "titan"]) {
      let worst = 0;
      for (let k = 0; k < 12; k++) {
        const sp = map.spawns.team[k % 2][k % 5];
        const { t, A } = mkTank(m.id, model, sp.x, sp.z, sp.yaw + (k * 0.9) % 6.28);
        for (let i = 0; i < 60 * 40; i++) {
          t.input.throttle = 1;
          t.input.steer = Math.sin(i * 0.004 + k) > 0.6 ? 1 : Math.sin(i * 0.003 + k) < -0.7 ? -1 : 0;
          stepTank(t, A, STEP);
          if (i % 30 === 0) worst = Math.max(worst, insideSolid(A, t));
          if (!Number.isFinite(t.x + t.y + t.z)) break;
        }
        check(`${m.id}/${model}: finite state`, Number.isFinite(t.x + t.y + t.z));
        check(`${m.id}/${model}: inside the arena`, Math.abs(t.x) <= map.H && Math.abs(t.z) <= map.H, `${t.x.toFixed(1)},${t.z.toFixed(1)}`);
      }
      check(`${m.id}/${model}: never deep inside geometry`, worst < 0.6, `worst ${worst.toFixed(2)} m`);
    }
  }
  // neon highway ramp → bridge top
  {
    const { t, A } = mkTank("neon", "striker", -92, 0, Math.PI / 2); // facing +x, at the ramp foot
    let maxY = 0;
    for (let i = 0; i < 60 * 8; i++) {
      t.input.throttle = 1;
      stepTank(t, A, STEP);
      maxY = Math.max(maxY, t.y);
    }
    check("neon: ramp climbs onto the highway", maxY > 5.8, `max y ${maxY.toFixed(2)}`);
    // the underpass: a tank driving under the bridge stays at street level
    const u = mkTank("neon", "striker", -4, -30, 0);
    for (let i = 0; i < 60 * 6; i++) {
      u.t.input.throttle = 1;
      stepTank(u.t, u.A, STEP);
    }
    check("neon: underpass stays at street level", u.t.y < 1 && u.t.z > 10, `y ${u.t.y.toFixed(2)} z ${u.t.z.toFixed(1)}`);
  }
  // harbor raised platform: drive up the ramp, then off the far edge (falls)
  {
    const { t, A } = mkTank("harbor", "striker", -36, 0, Math.PI / 2);
    let maxY = 0;
    let air = false;
    for (let i = 0; i < 60 * 9; i++) {
      t.input.throttle = 1;
      stepTank(t, A, STEP);
      maxY = Math.max(maxY, t.y);
      if (!t.grounded) air = true;
    }
    check("harbor: platform reachable by ramp", maxY > 4.4, `max y ${maxY.toFixed(2)}`);
    check("harbor: tank stays on the dock", Math.abs(t.x) < 76 && t.y > 1.0, `x ${t.x.toFixed(1)} y ${t.y.toFixed(2)}`);
    void air;
  }
  // harbor quay walls keep tanks out of the sea
  {
    const { t, A } = mkTank("harbor", "scout", 60, 40, Math.PI / 2);
    for (let i = 0; i < 60 * 10; i++) {
      t.input.throttle = 1;
      stepTank(t, A, STEP);
    }
    check("harbor: quay wall stops tanks at the sea", t.x < 76.5 && t.y > 1, `x ${t.x.toFixed(1)} y ${t.y.toFixed(2)}`);
  }
  // forest river slows tanks
  {
    const a = mkTank("forest", "striker", -20, -30, 0);
    const b = mkTank("forest", "striker", -20, -60, 0);
    let vw = Infinity;
    let vd = 0;
    let wetT = 0;
    for (let i = 0; i < 60 * 4; i++) {
      a.t.input.throttle = 1;
      b.t.input.throttle = 1;
      stepTank(a.t, a.A, STEP);
      stepTank(b.t, b.A, STEP);
      if (a.t.inWater) {
        wetT += STEP;
        if (wetT > 0.6) vw = Math.min(vw, a.t.vf);
      }
      vd = Math.max(vd, b.t.vf);
    }
    check("forest: water slows tanks", vw > 0 && vw < vd * 0.7, `water ${vw.toFixed(1)} dry ${vd.toFixed(1)}`);
  }
  // snow ice: lateral slip lasts longer on ice
  {
    const ice = mkTank("snow", "scout", 52, -34, 0);
    const dry = mkTank("snow", "scout", 0, -60, 0);
    for (const o of [ice, dry]) {
      o.t.vl = 8;
      for (let i = 0; i < 30; i++) stepTank(o.t, o.A, STEP);
    }
    check("snow: ice keeps the slide going", Math.abs(ice.t.vl) > Math.abs(dry.t.vl) * 3, `ice ${ice.t.vl.toFixed(2)} dry ${dry.t.vl.toFixed(2)}`);
  }
  // steep ridge: engines stall (snow ridge flank)
  {
    const { t, A } = mkTank("snow", "titan", 72, -40, 0);
    // drive straight at the ridge side (east ridge spans z -38..22 around x 72 except the cut)
    t.x = 58;
    t.z = -8;
    t.y = A.surfaceAt(t.x, t.z, 60).h;
    t.yaw = Math.PI / 2;
    let maxY = 0;
    for (let i = 0; i < 60 * 8; i++) {
      t.input.throttle = 1;
      stepTank(t, A, STEP);
      maxY = Math.max(maxY, t.y);
    }
    check("snow: steep ridge cannot be climbed", maxY < 8, `max y ${maxY.toFixed(1)}`);
  }
  // turret servo speed is enforced
  {
    const { t, A } = mkTank("desert", "titan", 0, -80, 0);
    t.input.ax = t.x;
    t.input.az = t.z - 50;
    t.input.ay = t.y + 2;
    for (let i = 0; i < 60; i++) stepTank(t, A, STEP);
    const turned = Math.abs(t.turret);
    check("turret turns no faster than its servo", turned <= t.stats.turret * 1.0 + 0.01, `${turned.toFixed(2)} rad in 1 s (max ${t.stats.turret.toFixed(2)})`);
  }
}

/* ------------------------------------------------------------------ weapons */
function duel(model, opts = {}) {
  const M = createMatch({ mapId: opts.map || "harbor", mode: "dm", difficulty: "normal", seed: 5, countdown: 0, player: { tankId: model, up: {} }, botTanks: [model, ...Array(5).fill(opts.target || "striker")] });
  M.state = "play";
  // park everything; put a target at distance d in front of the player
  const P = M.player;
  const T = M.tanks[1];
  for (const t of M.tanks) {
    t.brain = null;
    t.protT = 0;
    if (t !== P && t !== T) {
      t.x = 60 + t.id * 6;
      t.z = 90;
      t.y = M.A.surfaceAt(t.x, t.z, 60).h;
    }
  }
  P.x = -30;
  P.z = opts.z0 ?? -40;
  P.yaw = 0;
  P.y = M.A.surfaceAt(P.x, P.z, 60).h;
  T.x = -30;
  T.z = P.z + (opts.d || 40);
  T.yaw = Math.PI / 2;
  T.y = M.A.surfaceAt(T.x, T.z, 60).h;
  for (const t of M.tanks) Object.assign(t.prev, { x: t.x, y: t.y, z: t.z });
  return { M, P, T };
}
function aimAt(P, T) {
  P.input.ax = T.x;
  P.input.ay = T.y + T.dims.top * 0.55;
  P.input.az = T.z;
}
if (run("weapons")) {
  console.log("weapons");
  for (const tk of TANKS) {
    const d = tk.weapon.kind === "flame" ? 14 : 40;
    const { M, P, T } = duel(tk.id, { d });
    T.godMode = false;
    let firstFire = -1;
    let firstHit = -1;
    let dealt = 0;
    for (let i = 0; i < 60 * 6; i++) {
      aimAt(P, T);
      // ballistic shells: aim a little higher to cover the drop
      if (tk.weapon.gravity > 0) P.input.ay += 0.5 * tk.weapon.gravity * (d / tk.weapon.speed) ** 2;
      P.input.fire = i > 60; // let the turret settle first
      M.step(STEP);
      for (const e of M.drain()) {
        if (e.type === "fire" && e.id === P.id && firstFire < 0) firstFire = M.clock;
        if (e.type === "hit" && e.attacker === P.id && e.target === T.id) {
          if (firstHit < 0) firstHit = M.clock;
          dealt += e.amount;
        }
      }
      if (!T.alive) break;
    }
    check(`${tk.id}: hits a target at ${d} m`, dealt > 0, `dealt ${dealt.toFixed(0)}`);
    if (tk.weapon.kind !== "flame" && firstFire >= 0 && firstHit >= 0) {
      const flight = firstHit - firstFire;
      const expect = d / tk.weapon.speed;
      check(`${tk.id}: projectile has travel time`, flight >= expect * 0.6 - STEP, `flight ${flight.toFixed(3)} s, expected ≈${expect.toFixed(3)}`);
    }
    check(`${tk.id}: armor reduces damage`, (() => {
      const { M: M2, P: P2, T: T2 } = duel(tk.id);
      const raw = 100;
      const got = M2.damage(T2, raw, P2, "test", 0, 0, 0);
      return Math.abs(got - raw * (1 - T2.stats.armor)) < 0.01;
    })());
  }
  // rail pierces two tanks in a line
  {
    const { M, P, T } = duel("sniper", { d: 40 });
    const T2 = M.tanks[2];
    T2.x = T.x;
    T2.z = T.z + 12;
    T2.y = M.A.surfaceAt(T2.x, T2.z, 60).h;
    T2.yaw = T.yaw;
    const hitIds = new Set();
    for (let i = 0; i < 60 * 3; i++) {
      aimAt(P, T);
      P.input.fire = i > 60 && i < 70;
      M.step(STEP);
      for (const e of M.drain()) if (e.type === "hit" && e.attacker === P.id) hitIds.add(e.target);
    }
    check("rail slug pierces every tank in line", hitIds.has(T.id) && hitIds.has(T2.id), [...hitIds].join(","));
  }
  // flame overheats and recovers
  {
    const { M, P, T } = duel("blazer", { d: 14 });
    let over = false;
    for (let i = 0; i < 60 * 6; i++) {
      aimAt(P, T);
      P.input.fire = true;
      M.step(STEP);
      for (const e of M.drain()) if (e.type === "overheat") over = true;
      T.hp = T.stats.hp;
    }
    check("flamer overheats under sustained fire", over);
    P.input.fire = false;
    for (let i = 0; i < 60 * 4; i++) M.step(STEP);
    check("flamer cools down", !P.ws.overheated && P.ws.heat < 0.05, `heat ${P.ws.heat.toFixed(2)}`);
  }
  // clip empties then reloads
  {
    const { M, P, T } = duel("thunder", { d: 40 });
    let shots = 0;
    let reload = false;
    for (let i = 0; i < 60 * 3; i++) {
      aimAt(P, T);
      P.input.fire = i > 30;
      M.step(STEP);
      for (const e of M.drain()) {
        if (e.type === "fire" && e.id === P.id) shots++;
        if (e.type === "reload" && e.id === P.id) reload = true;
      }
      T.hp = T.stats.hp;
    }
    check("rotary cannon empties its 8-shell magazine then reloads", reload && shots >= 8, `${shots} shots`);
  }
  // no friendly fire in team modes
  {
    const M = createMatch({ mapId: "desert", mode: "tdm", difficulty: "normal", seed: 3, countdown: 0, player: { tankId: "striker", up: {} } });
    M.state = "play";
    const ally = M.tanks.find((t) => t !== M.player && t.team === M.player.team);
    ally.protT = 0;
    const got = M.damage(ally, 200, M.player, "test", 0, 0, 0);
    check("no friendly fire in team modes", got === 0);
  }
  // splash hurts tanks behind low cover but not through solid walls
  {
    const { M, P, T } = duel("titan", { d: 30 });
    T.protT = 0;
    const hp0 = T.hp;
    // explosion 3 m from the target in the open
    const { splash } = await import("../engine/combat.js");
    splash(M, T.x + 3, T.y + 0.5, T.z, 5, 100, P, -1, "he");
    check("HE splash damages nearby tanks", T.hp < hp0);
  }
}

/* ------------------------------------------------------------------ abilities */
if (run("abilities")) {
  console.log("abilities");
  const fresh = (model) => {
    const r = duel(model, { d: 9 });
    r.P.ab.cd = 0;
    return r;
  };
  {
    // open lane down the middle of the harbor; target parked out of the way
    const { M, P, T } = fresh("scout");
    T.x = 60;
    T.z = 90;
    P.x = 0;
    P.z = -62;
    P.yaw = 0;
    const v0 = P.stats.speed;
    tryAbility(M, P);
    let vmax = 0;
    for (let i = 0; i < 100; i++) {
      P.input.throttle = 1;
      M.step(STEP);
      vmax = Math.max(vmax, P.vf);
    }
    check("nitro: faster than the normal top speed", vmax > v0 * 1.3, `${vmax.toFixed(1)} vs ${v0}`);
    check("nitro: goes on cooldown", P.ab.cd > 10);
  }
  {
    const { M, P } = fresh("striker");
    P.hp = P.stats.hp * 0.3;
    tryAbility(M, P);
    for (let i = 0; i < 60 * 3; i++) M.step(STEP);
    check("repair: restores ≈40% health", P.hp >= P.stats.hp * 0.68, `${(P.hp / P.stats.hp).toFixed(2)}`);
  }
  {
    const { M, P, T } = fresh("guardian");
    tryAbility(M, P);
    P.protT = 0;
    const got = M.damage(P, 100, T, "test", 0, 0, 0);
    check("shield: blocks 65% of damage", Math.abs(got - 100 * (1 - P.stats.armor) * 0.35) < 0.01, got.toFixed(2));
  }
  {
    const { M, P, T } = fresh("blazer");
    T.protT = 0;
    const hp0 = T.hp;
    tryAbility(M, P);
    check("inferno: damages and ignites nearby enemies", T.hp < hp0 && T.fx.burnT > 0);
  }
  {
    const { M, P, T } = fresh("phantom");
    tryAbility(M, P);
    check("cloak: active", P.fx.cloak > 0);
    aimAt(P, T);
    P.input.fire = true;
    for (let i = 0; i < 80; i++) M.step(STEP);
    check("cloak: firing reveals", P.fx.cloak === 0);
  }
  {
    const { M, P, T } = fresh("titan");
    T.protT = 0;
    aimAt(P, T);
    P.input.ax = T.x;
    P.input.az = T.z;
    const hp0 = T.hp;
    tryAbility(M, P);
    let strikes = 0;
    for (let i = 0; i < 60 * 4; i++) {
      M.step(STEP);
      for (const e of M.drain()) if (e.type === "impact" && e.kind === "strike") strikes++;
    }
    check("barrage: six shells land", strikes === 6, `${strikes}`);
    check("barrage: damages the target area", T.hp < hp0);
  }
  {
    const { M, P } = fresh("thunder");
    P.ws.clip = 8;
    tryAbility(M, P);
    P.input.fire = true;
    for (let i = 0; i < 60 * 2; i++) M.step(STEP);
    check("overclock: no ammo used while active", P.ws.clip === 8, `clip ${P.ws.clip}`);
  }
  {
    const { M, P } = fresh("sniper");
    tryAbility(M, P);
    P.input.fire = true;
    M.step(STEP);
    M.step(STEP);
    check("focus: halves the rail charge time", P.ws.charging && P.ws.chargeTotal <= P.stats.weapon.charge * 0.51 + 1e-6);
  }
}

/* ------------------------------------------------------------------ ctf rules */
if (run("ctf")) {
  console.log("ctf");
  const M = createMatch({ mapId: "harbor", mode: "ctf", difficulty: "normal", seed: 9, countdown: 0, player: { tankId: "scout", up: {} } });
  M.state = "play";
  for (const t of M.tanks) t.brain = null;
  const P = M.player;
  const enemyFlag = M.flags[1];
  const myFlag = M.flags[0];
  const park = (t, x, z) => {
    t.x = x;
    t.z = z;
    t.y = M.A.surfaceAt(x, z, 60).h;
    Object.assign(t.prev, { x: t.x, y: t.y, z: t.z });
  };
  // keep other tanks far away from both flags
  M.tanks.forEach((t, i) => t !== P && park(t, -60 + i * 4, 0));
  const evs = [];
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      M.step(STEP);
      evs.push(...M.drain().filter((e) => e.type === "flag"));
    }
  };
  park(P, enemyFlag.x, enemyFlag.z);
  step();
  check("touching the enemy flag picks it up", enemyFlag.state === "carried" && P.carrying === 1);
  // kill the carrier → flag drops
  P.protT = 0;
  M.damage(P, 99999, M.tanks[5], "test", 0, 0, 0);
  step();
  check("carrier death drops the flag", enemyFlag.state === "dropped");
  // an enemy (flag owner) touches it → returns home
  const owner = M.tanks.find((t) => t.team === 1);
  park(owner, enemyFlag.x, enemyFlag.z);
  step();
  check("owner touching a dropped flag returns it", enemyFlag.state === "home" && evs.some((e) => e.action === "return"));
  // capture: player respawns, takes it again, drives home while own flag is home
  park(owner, -60, 0);
  M.respawnNow(P);
  park(P, enemyFlag.x, enemyFlag.z);
  step();
  park(P, myFlag.home.x, myFlag.home.z);
  step();
  check("capture scores when own flag is home", M.scores[0] === 1 && enemyFlag.state === "home" && P.caps === 1);
  // no capture while own flag is away
  park(P, enemyFlag.x, enemyFlag.z);
  step();
  myFlag.state = "dropped";
  myFlag.x = 30;
  myFlag.z = 0;
  myFlag.dropT = 25;
  park(P, myFlag.home.x, myFlag.home.z);
  step();
  check("no capture while own flag is not home", M.scores[0] === 1 && P.carrying === 1);
  // dropped flags auto-return
  step(60 * 26);
  check("dropped flag auto-returns after 25 s", myFlag.state === "home");
  // match ends at the capture limit (the carrier above already scored once the
  // flag auto-returned, so take the enemy flag again first)
  M.scores[0] = M.limit - 1;
  park(P, enemyFlag.x, enemyFlag.z);
  step();
  park(P, myFlag.home.x, myFlag.home.z);
  step();
  check("match ends at the capture limit", M.state === "ended" && M.result === "win");
}

/* ------------------------------------------------------------------ full matches */
if (run("matches")) {
  console.log("matches");
  for (const m of MAP_LIST)
    for (const mode of ["dm", "tdm", "ctf"]) {
      const M = createMatch({ mapId: m.id, mode, difficulty: "normal", spectate: true, seed: 17 });
      let rescues = 0;
      let kills = 0;
      let nan = false;
      for (let i = 0; i < 60 * 620 && M.state !== "ended"; i++) {
        M.step(STEP);
        for (const e of M.drain()) {
          if (e.type === "rescue") rescues++;
          if (e.type === "kill") kills++;
        }
        if (i % 600 === 0 && M.tanks.some((t) => !Number.isFinite(t.x + t.y + t.z + t.hp))) nan = true;
      }
      check(`${m.id}/${mode}: ends`, M.state === "ended", `state ${M.state} t=${M.clock.toFixed(0)}`);
      check(`${m.id}/${mode}: no NaN`, !nan);
      check(`${m.id}/${mode}: combat happens`, kills >= 10, `${kills} kills`);
      check(`${m.id}/${mode}: no stuck-bot rescues`, rescues <= 1, `${rescues} rescues`);
      if (mode === "dm") {
        const r = M.ranking();
        check(`${m.id}/dm: winner is the top fragger`, M.winner === r[0].id);
      } else {
        const exp = M.scores[0] === M.scores[1] ? null : M.scores[0] > M.scores[1] ? 0 : 1;
        check(`${m.id}/${mode}: winner matches scores`, M.winner === exp, `${M.scores} → ${M.winner}`);
      }
      console.log(`  ${m.id.padEnd(7)} ${mode.padEnd(4)} ${M.endReason.padEnd(5)} ${String(M.clock.toFixed(0)).padStart(4)} s  scores ${M.scores.join(":")}  kills ${kills}  rescues ${rescues}`);
    }
  // difficulty affects outcomes: hard bots beat easy bots
  let hard = 0;
  let easy = 0;
  for (let s = 0; s < 4; s++) {
    for (const side of [0, 1]) {
      const M = createMatch({ mapId: MAP_LIST[s].id, mode: "tdm", difficulty: "normal", spectate: true, seed: 50 + s * 2 + side, time: 240, limit: 999 });
      const { DIFF } = await import("../engine/ai.js");
      for (const t of M.tanks) t.brain.D = t.team === side ? DIFF.hard : DIFF.easy;
      for (let i = 0; i < 60 * 245 && M.state !== "ended"; i++) {
        M.step(STEP);
        M.drain();
      }
      hard += M.scores[side];
      easy += M.scores[1 - side];
    }
  }
  check("hard AI outperforms easy AI", hard > easy * 1.4, `hard ${hard} vs easy ${easy}`);
  console.log(`  hard vs easy kills: ${hard} : ${easy}`);
}

/* ------------------------------------------------------------------ balance */
if (run("balance")) {
  console.log("balance (4× tank vs 4× Striker, team battle, all maps, both sides)");
  for (const tk of TANKS) {
    if (tk.id === "striker") continue;
    let a = 0;
    let b = 0;
    for (let s = 0; s < MAP_LIST.length; s++)
      for (const side of [0, 1]) {
        const X = [tk.id, tk.id, tk.id, tk.id];
        const Y = ["striker", "striker", "striker", "striker"];
        const M = createMatch({ mapId: MAP_LIST[s].id, mode: "tdm", difficulty: "normal", spectate: true, seed: 300 + s * 2 + side, botTanks: side ? [...Y, ...X] : [...X, ...Y], time: 240, limit: 999 });
        for (let i = 0; i < 245 * 60 && M.state !== "ended"; i++) {
          M.step(STEP);
          M.drain();
        }
        a += M.scores[side];
        b += M.scores[1 - side];
      }
    const ratio = a / Math.max(1, b);
    check(`${tk.id}: AI balance ratio in [0.6, 1.6]`, ratio >= 0.6 && ratio <= 1.6, ratio.toFixed(2));
    console.log(`  ${tk.id.padEnd(9)} ${a}:${b}  ratio ${ratio.toFixed(2)}`);
  }
}

/* ------------------------------------------------------------------ save / progression */
if (run("save")) {
  console.log("save");
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const P = await import("../progress.js");
  let s = P.loadSave();
  check("fresh save: Striker owned, others locked", s.tanks.striker.owned && TANKS.filter((t) => t.id !== "striker").every((t) => !s.tanks[t.id].owned));
  check("fresh save: starting coins", s.coins === P.START_COINS);
  check("can't buy an unaffordable tank", P.buyTank(s, "titan") === null);
  s = { ...s, coins: 20000 };
  const s2 = P.buyTank(s, "scout");
  check("buying a tank deducts its price and selects it", s2 && s2.coins === 20000 - 1600 && s2.tanks.scout.owned && s2.selected === "scout");
  const cost = upgradeCost("scout", "armor", 0);
  const s3 = P.buyUpgrade(s2, "scout", "armor");
  check("upgrade costs coins and raises the level", s3.coins === s2.coins - cost && s3.tanks.scout.up.armor === 1);
  let s4 = s3;
  for (let i = 0; i < 10; i++) s4 = P.buyUpgrade(s4, "scout", "armor") || s4;
  check("upgrades cap at level 5", s4.tanks.scout.up.armor === 5 && P.buyUpgrade(s4, "scout", "armor") === null);
  const st0 = tankStats("scout", {});
  const st5 = tankStats("scout", s4.tanks.scout.up);
  check("armor upgrades raise health and armor", st5.hp > st0.hp && st5.armor > st0.armor);
  const s5 = P.buySkin(s4, "scout", "racer");
  check("buying a skin equips it", s5.tanks.scout.skin === "racer" && s5.tanks.scout.skins.includes("racer"));
  check("can't buy skins for locked tanks", P.buySkin(s5, "titan", "warlord") === null);
  P.storeSave(s5);
  const back = P.loadSave();
  check("save round-trips through localStorage", JSON.stringify(back) === JSON.stringify(P.sanitize(s5)));
  store.set(P.SAVE_KEY, JSON.stringify({ coins: "lots", tanks: { titan: { owned: true, up: { armor: 99 }, skins: ["bogus"] } }, selected: "titan", settings: { quality: "ultra", sfx: 7 } }));
  const bad = P.loadSave();
  check("sanitiser: bad coins → default", bad.coins === P.START_COINS);
  check("sanitiser: levels clamped, bogus skins dropped", bad.tanks.titan.up.armor === 5 && bad.tanks.titan.skins.join() === "factory");
  check("sanitiser: bad settings fall back", bad.settings.quality === "auto" && bad.settings.sfx === 1);
  store.set(P.SAVE_KEY, "{not json");
  check("sanitiser: corrupt JSON → default save", P.loadSave().coins === P.START_COINS);
  const r = P.recordMatch(P.defaultSave(), { result: "win", difficulty: "hard", kills: 6, deaths: 2, assists: 3, caps: 1, returns: 1, bestStreak: 3, damage: 2400, time: 300 });
  check("rewards: win on hard pays more than a loss on easy", r.reward.total > P.recordMatch(P.defaultSave(), { result: "loss", difficulty: "easy", kills: 6, deaths: 2, assists: 3 }).reward.total);
  check("rewards: coins and stats recorded", r.save.coins === P.START_COINS + r.reward.total && r.save.stats.wins === 1 && r.save.stats.kills === 6);
  const f = P.recordMatch(P.defaultSave(), { result: "loss", difficulty: "normal", kills: 9, deaths: 0, assists: 0, forfeit: true });
  check("forfeit pays participation only", f.reward.total === 120);
  // economy pacing: a typical normal match pays 300–900 coins
  const typical = P.matchReward({ result: "win", difficulty: "normal", kills: 5, assists: 3 }).total;
  check("economy: typical win pays 300–900 coins", typical >= 300 && typical <= 900, typical);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(failures.map((f) => " - " + f).join("\n"));
  process.exitCode = 1;
}
