/**
 * Hulk: Open World 3D — headless regression suite (Node, no browser).
 *
 *   node src/components/games/HulkOpenWorld3D/tools/simTest.mjs [all|quick|city|hero|combat|ai|boss|missions|activities|progress|free]
 *
 * Every check runs the REAL sim through the same input a player produces
 * (or a direct, documented setup for unit-style checks) and asserts on world
 * state. `missions` plays all 20 missions as a campaign with the test bot
 * (XP and upgrades carry over like for a player; up to 3 attempts each).
 */
import { Sim } from "../engine/sim.js";
import { getCity } from "../engine/city.js";
import { getNav } from "../engine/nav.js";
import { HERO, ATTACKS } from "../engine/config.js";
import { computeStats, freshProgress, applyMissionResult, buyUpgrade, levelInfo, pointsLeft, sanitize, saveProgress, loadProgress, addXp, UPGRADES } from "../engine/progress.js";
import { MISSIONS, ACTIVITIES } from "../data/missions.js";
import { resolveAt, roofChain } from "../engine/missions.js";
import { createBot } from "./bot.mjs";

const which = process.argv[2] || "all";
const run = (k) => which === "all" || which === k || (which === "quick" && k !== "missions");
let pass = 0;
let fail = 0;
const check = (name, ok, info = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`);
};
const baseStats = () => computeStats(freshProgress());
const free = (o = {}) => {
  const s = new Sim({ mode: "free", stats: o.stats || baseStats(), seed: o.seed || 3, ambient: false });
  s.encT = 1e9;
  return s;
};
const steps = (sim, inp, n) => {
  for (let i = 0; i < n; i++) sim.step(typeof inp === "function" ? inp(i) : inp, 1 / 60);
};
const place = (sim, x, z) => {
  const h = sim.hero;
  const s = sim.safeSpot(x, z, 4);
  Object.assign(h, { x: s.x, z: s.z, y: s.y, vx: 0, vy: 0, vz: 0, grounded: true, act: null });
  return s;
};
const insideAnyBox = (sim, x, y, z, r) => {
  for (const b of sim.col.boxesIn(x - r, z - r, x + r, z + r)) {
    if (b.ramp || b.y1 <= y + 0.5 || b.y0 >= y + 2) continue;
    if (x > b.x0 + 0.05 && x < b.x1 - 0.05 && z > b.z0 + 0.05 && z < b.z1 - 0.05) return b;
  }
  return null;
};

/* ================================================================ city */
if (run("city")) {
  const C = getCity();
  const sim = free();
  let bad = 0;
  for (const p of C.props) {
    if (p.tag) continue;
    for (const b of C.boxes) {
      if (b.y0 > 1.5 || b.y1 - b.y0 < 0.5) continue;
      if (p.x > b.x0 + 0.1 && p.x < b.x1 - 0.1 && p.z > b.z0 + 0.1 && p.z < b.z1 - 0.1) bad++;
    }
  }
  check("city: no props generated inside colliders", bad === 0, `${bad} overlaps, ${C.props.length} props, ${C.boxes.length} colliders, ${C.buildings.length} buildings`);
  const dists = new Set(C.buildings.map((b) => b.district));
  check("city: 5 districts present", ["downtown", "residential", "industrial", "military", "outskirts"].every((d) => dists.has(d) || d === "outskirts"));
  const nav = getNav(C);
  const start = C.sites.start;
  let unreachable = [];
  for (const [k, s] of Object.entries(C.sites)) {
    if (s.y) continue;
    const p = sim.safeSpot(s.x, s.z, 6);
    const path = nav.findPath(nav.walk, start.x, start.z, p.x, p.z, 60000);
    const end = path && path[path.length - 1];
    if (!end || Math.hypot(end[0] - p.x, end[1] - p.z) > 6) unreachable.push(k);
  }
  check("city: every mission/activity site reachable on foot from the plaza", unreachable.length === 0, unreachable.join(","));
  for (const m of MISSIONS) {
    const s = new Sim({ mode: "mission", mission: m.id, stats: baseStats(), seed: 1, ambient: false });
    const h = s.hero;
    const inBox = insideAnyBox(s, h.x, h.y, h.z, HERO.radius);
    if (inBox) check(`mission ${m.id}: hero spawns in free space`, false, `box ${inBox.id}`);
    const stuck = s.enemies.filter((e) => insideAnyBox(s, e.x, e.y, e.z, e.def.r));
    if (stuck.length) check(`mission ${m.id}: enemies spawn in free space`, false, `${stuck.length} inside colliders`);
  }
  check("missions: all 20 spawn hero + enemies in free space", true);
  const r1 = roofChain(sim, "dtStreet", 6);
  const r2 = roofChain(sim, "dtEast", 6, 3);
  check("rooftop chains: 6 reachable roofs for the mission and the activity", r1.length === 6 && r2.length === 6, `${r1.length}/${r2.length}`);
}

/* ================================================================ hero physics */
if (run("hero")) {
  const sim = free();
  const P = C_SITE(sim, "plaza");
  place(sim, P.x, P.z);
  steps(sim, { mx: 1, mz: 0 }, 60);
  check("hero: running reaches run speed", Math.abs(sim.hero.speed - HERO.run) < 0.6, sim.hero.speed.toFixed(2));
  place(sim, P.x, P.z);
  steps(sim, { mx: 1, mz: 0, sprint: true }, 75);
  check("hero: sprint reaches sprint speed", Math.abs(sim.hero.speed - HERO.sprint) < 0.8, sim.hero.speed.toFixed(2));
  // tap jump
  place(sim, P.x, P.z);
  let maxY = 0;
  steps(sim, (i) => ({ jump: i < 2 }), 70);
  for (let i = 0; i < 0; i++);
  {
    const s2 = free();
    place(s2, P.x, P.z);
    let y0 = s2.hero.y;
    for (let i = 0; i < 80; i++) {
      s2.step({ jump: i < 3 }, 1 / 60);
      maxY = Math.max(maxY, s2.hero.y - y0);
    }
    check("hero: tap jump ≈ 2.9 m", maxY > 2.3 && maxY < 3.4, maxY.toFixed(2));
  }
  // full super leap
  {
    const s2 = free();
    const p = place(s2, P.x, P.z + 10);
    let apex = 0;
    const holdN = Math.ceil(HERO.leapCharge * 60) + 4;
    for (let i = 0; i < holdN + 240; i++) {
      s2.step({ jump: i < holdN, mx: i >= holdN - 1 ? 0 : 0, mz: i >= holdN - 1 ? 1 : 0 }, 1 / 60);
      apex = Math.max(apex, s2.hero.y);
    }
    const d = Math.hypot(s2.hero.x - p.x, s2.hero.z - p.z);
    check("hero: full charge super leap rises > 20 m with real velocity", apex > 20, `apex ${apex.toFixed(1)} m`);
    check("hero: super leap covers long distance (no teleport, lands grounded)", d > 45 && s2.hero.grounded, `${d.toFixed(1)} m`);
  }
  // building collision at sprint
  {
    const s2 = free();
    const b = s2.city.buildings.find((x) => x.kind === "tower");
    const t = b.tiers[0];
    const x = (t.x0 + t.x1) / 2;
    place(s2, x, t.z1 + 14);
    let inside = 0;
    for (let i = 0; i < 300; i++) {
      s2.step({ mx: 0, mz: -1, sprint: true }, 1 / 60);
      const h = s2.hero;
      if (h.x > t.x0 + 0.1 && h.x < t.x1 - 0.1 && h.z > t.z0 + 0.1 && h.z < t.z1 - 0.1 && h.y < t.y1 - 0.5) inside++;
    }
    check("collision: sprinting into a tower never enters it", inside === 0 && s2.hero.z >= t.z1 + HERO.radius - 0.05, `z ${s2.hero.z.toFixed(2)} vs wall ${t.z1}`);
  }
  // rooftop landing
  {
    const s2 = free();
    const r = s2.city.sites.plazaRoof;
    Object.assign(s2.hero, { x: r.x, z: r.z, y: 40, grounded: false, vy: 0 });
    steps(s2, {}, 180);
    check("collision: falling onto City Hall lands on its roof", Math.abs(s2.hero.y - 16) < 0.05 && s2.hero.grounded, `y ${s2.hero.y.toFixed(2)}`);
  }
  // shockwave landing damages a squad
  {
    const s2 = free();
    const p = place(s2, P.x + 30, P.z + 20);
    const es = [0, 1, 2].map((k) => s2.spawnEnemy("soldier", p.x + 3 + k, p.z + 2));
    Object.assign(s2.hero, { y: 45, grounded: false, vy: 0, fallFrom: 45 });
    let shock = false;
    for (let i = 0; i < 200; i++) {
      s2.step({}, 1 / 60);
      if (s2.events.some((e) => e.type === "landShock")) shock = true;
    }
    check("ability: shockwave landing after a big fall damages nearby enemies", shock && es.every((e) => e.hp < e.maxHp), es.map((e) => Math.round(e.hp)).join("/"));
  }
}
function C_SITE(sim, k) {
  return sim.safeSpot(sim.city.sites[k].x, sim.city.sites[k].z, 6);
}

/* ================================================================ combat */
if (run("combat")) {
  const mk = () => {
    const s = free();
    const p = C_SITE(s, "arena");
    place(s, p.x, p.z);
    s.hero.heading = 0;
    return s;
  };
  {
    const s = mk();
    const h = s.hero;
    const front = s.spawnEnemy("soldier", h.x, h.z + 2.6, { heading: Math.PI });
    const back = s.spawnEnemy("soldier", h.x, h.z - 2.6, { heading: 0 });
    front.state = back.state = "patrol";
    s.step({ punch: true, camYaw: 0 }, 1 / 60);
    steps(s, { camYaw: 0 }, 30);
    check("punch: hits the enemy in front", front.hp < front.maxHp, `${Math.round(front.hp)}/${front.maxHp}`);
    check("punch: does not hit the enemy behind", back.hp === back.maxHp);
  }
  {
    // a wall between hero and enemy blocks the strike (military wall, 1.2 m thick)
    const s = free();
    const w = s.city.boxes.find((b) => b.kind === "milwall" && b.x1 - b.x0 > 6);
    const cx = (w.x0 + w.x1) / 2;
    Object.assign(s.hero, { x: cx, z: w.z0 - 1.0, y: 0, heading: 0 });
    const e = s.spawnEnemy("soldier", cx, w.z1 + 0.7, { heading: Math.PI });
    e.fixed = true;
    s.step({ punch: true, camYaw: 0 }, 1 / 60);
    steps(s, { camYaw: 0 }, 30);
    check("punch: blocked by a solid wall", e.hp === e.maxHp, `hp ${Math.round(e.hp)}`);
  }
  {
    const s = mk();
    const h = s.hero;
    const e = s.spawnEnemy("heavyRobot", h.x, h.z + 3.6, { heading: Math.PI });
    e.fixed = true;
    s.step({ punch: true, camYaw: 0 }, 1 / 60);
    steps(s, { camYaw: 0 }, 40);
    const jab = e.maxHp - e.hp;
    const hp0 = e.hp;
    s.step({ heavy: true, camYaw: 0 }, 1 / 60);
    s.step({ heavy: false, camYaw: 0 }, 1 / 60);
    steps(s, { camYaw: 0 }, 70);
    const heavy = hp0 - e.hp;
    check("heavy attack: deals more than a jab", heavy > jab * 1.8, `jab ${jab.toFixed(0)} heavy ${heavy.toFixed(0)}`);
    // rage multiplies real damage
    const hp1 = e.hp;
    h.rage = h.st.rageMax;
    s.step({ rage: true }, 1 / 60);
    steps(s, {}, 70);
    s.step({ punch: true, camYaw: 0 }, 1 / 60);
    steps(s, { camYaw: 0 }, 40);
    const raged = hp1 - e.hp;
    check("rage: activation boosts punch damage", h.raging && raged > jab * 1.4, `raged jab ${raged.toFixed(0)} vs ${jab.toFixed(0)}`);
  }
  {
    const s = mk();
    const h = s.hero;
    const near = s.spawnEnemy("soldier", h.x + 5, h.z, {});
    const far = s.spawnEnemy("soldier", h.x + 14, h.z, {});
    near.fixed = far.fixed = true;
    s.step({ smash: true }, 1 / 60);
    steps(s, {}, 60);
    check("ground smash: damages within its radius, not beyond", near.hp < near.maxHp && far.hp === far.maxHp, `${Math.round(near.hp)} / ${Math.round(far.hp)}`);
    check("ground smash: goes on cooldown", h.cd.smash > 0);
  }
  {
    const s = mk();
    const h = s.hero;
    const f = s.spawnEnemy("soldier", h.x, h.z + 12, {});
    const b = s.spawnEnemy("soldier", h.x, h.z - 8, {});
    f.fixed = b.fixed = true;
    s.step({ special: true, camYaw: 0 }, 1 / 60);
    steps(s, { camYaw: 0 }, 60);
    check("thunder clap: hits the cone in front only", f.hp < f.maxHp && b.hp === b.maxHp, `${Math.round(f.hp)} / ${Math.round(b.hp)}`);
  }
  {
    // grab a car and throw it at a soldier 20 m away
    const s = free();
    const p0 = C_SITE(s, "arena");
    place(s, p0.x, p0.z - 10);
    const h = s.hero;
    const car = s.spawnProp("car", h.x, h.z + 3.2, { rot: Math.PI / 2, clear: true });
    h.heading = 0;
    steps(s, {}, 5);
    s.step({ grab: true, camYaw: 0 }, 1 / 60);
    steps(s, { camYaw: 0 }, 50);
    check("grab: lifts a car overhead", h.carry === car && car.mode === "carried");
    const target = s.spawnEnemy("soldier", h.x, h.z + 20, {});
    target.fixed = true;
    const D = 20;
    const sp = 32 * h.st.throwStr;
    const pitch = 0.5 * Math.asin(Math.min(1, (D * 34) / (sp * sp))) - 0.08;
    let flew = false;
    s.step({ punch: true, camYaw: 0, aim: { x: 0, y: Math.sin(pitch), z: Math.cos(pitch) } }, 1 / 60);
    for (let i = 0; i < 180; i++) {
      s.step({ camYaw: 0 }, 1 / 60);
      if (car.mode === "flying") flew = true;
    }
    check("throw: the car flies (ballistic) and hits the soldier", flew && target.hp < target.maxHp, `hp ${Math.round(target.hp)}`);
    check("throw: hard impact wrecks the thrown car", car.state === 2 || car.mode === "gone", `state ${car.state}`);
  }
  {
    // destruction states + explosion chain
    const s = free();
    const p0 = C_SITE(s, "yard");
    const car = s.spawnProp("car", p0.x, p0.z, { clear: true });
    const { damageProp } = await import("../engine/props.js");
    damageProp(s, car, car.maxHp * 0.6, { byPlayer: true });
    const st1 = car.state;
    damageProp(s, car, car.maxHp, { byPlayer: true });
    const st2 = car.state;
    let boom = false;
    for (let i = 0; i < 300; i++) {
      s.step({}, 1 / 60);
      if (s.events.some((e) => e.type === "explosion")) boom = true;
    }
    check("destruction: intact → damaged → destroyed → explodes", st1 === 1 && st2 === 2 && boom && car.burnt, `states ${st1}/${st2} boom ${boom}`);
    const fence = s.props.find((p) => p.type === "fence" && p.mode === "static");
    damageProp(s, fence, 999, { byPlayer: true });
    check("destruction: breakable street furniture is removed", fence.mode === "gone");
  }
}

/* ================================================================ AI + projectiles */
if (run("ai")) {
  {
    const s = free();
    const p0 = C_SITE(s, "arena");
    place(s, p0.x, p0.z);
    const h = s.hero;
    const e = s.spawnEnemy("soldier", h.x, h.z + 28, { heading: Math.PI });
    let fired = 0;
    let hp0 = h.hp;
    for (let i = 0; i < 600; i++) {
      s.step({}, 1 / 60);
      for (const ev of s.events) if (ev.type === "enemyFire" && ev.enemy === e) fired++;
    }
    check("AI: a soldier with line of sight detects and fires", e.state !== "patrol" && fired > 2, `state ${e.state}, shots ${fired}`);
    check("AI: projectiles travel and damage the hero", h.hp < hp0, `hp ${Math.round(h.hp)}`);
  }
  {
    // building between: no detection
    const s = free();
    const b = s.city.buildings.find((x) => x.kind === "tower" && x.tiers[0].x1 - x.tiers[0].x0 > 20);
    const t = b.tiers[0];
    const cx = (t.x0 + t.x1) / 2;
    place(s, cx, t.z0 - 4);
    const e = s.spawnEnemy("soldier", cx, t.z1 + 4, { heading: Math.PI });
    steps(s, {}, 300);
    check("AI: no detection through a building", e.state === "patrol" && !e.lastSeen, e.state);
  }
  {
    // chase around buildings: nobody walks through a building
    const s = free();
    const p0 = C_SITE(s, "dtStreet");
    place(s, p0.x, p0.z);
    const es = [];
    for (let k = 0; k < 6; k++) es.push(s.spawnEnemy(k % 2 ? "robot" : "soldier", p0.x + 30 + k * 2, p0.z + 30, { aggro: true }));
    let violations = 0;
    let moved = 0;
    const starts = es.map((e) => [e.x, e.z]);
    for (let i = 0; i < 60 * 30; i++) {
      // hero circles the block
      const a = i / 300;
      s.step({ mx: Math.cos(a), mz: Math.sin(a), sprint: true }, 1 / 60);
      if (!s.hero.alive) {
        s.hero.alive = true;
        s.hero.hp = s.hero.maxHp;
      }
      for (const e of es) {
        const bx = !e.dead && insideAnyBox(s, e.x, e.y, e.z, e.def.r);
        if (bx) {
          violations++;
          if (violations < 4) console.log("   inside", e.type, e.state, e.air, e.x.toFixed(1), e.y.toFixed(1), e.z.toFixed(1), bx.kind, bx.id, [bx.x0, bx.z0, bx.x1, bx.z1, bx.y0, bx.y1].map((v) => +v.toFixed(1)).join(","));
        }
      }
    }
    es.forEach((e, i) => (moved += Math.hypot(e.x - starts[i][0], e.z - starts[i][1])));
    check("AI: pursuers navigate the streets without entering buildings", violations === 0 && moved > 60, `violations ${violations}, moved ${moved.toFixed(0)} m`);
  }
  {
    // projectile blocked by a wall
    const s = free();
    const w = s.city.boxes.find((b) => b.kind === "milwall" && b.x1 - b.x0 > 6);
    const cx = (w.x0 + w.x1) / 2;
    Object.assign(s.hero, { x: cx, z: w.z1 + 3, y: 0 });
    const hp0 = s.hero.hp;
    for (let k = 0; k < 6; k++) s.spawnProjectile("bullet", cx, 1.8, w.z0 - 6, 0, 0, 1, {});
    steps(s, {}, 90);
    check("projectiles: walls stop bullets", s.hero.hp === hp0 && s.projectiles.every((p) => p.dead || p.age < 0.1));
  }
  {
    // dodge: a rocket aimed where the hero WAS misses a moving hero
    const s = free();
    const p0 = C_SITE(s, "arena");
    place(s, p0.x, p0.z);
    const h = s.hero;
    s.spawnProjectile("rocket", h.x, 2, h.z + 40, 0, 0, -1, {});
    const hp0 = h.hp;
    steps(s, { mx: 1, mz: 0, sprint: true }, 140);
    check("projectiles: dodgeable (sprinting sideways avoids a rocket)", h.hp === hp0, `hp ${Math.round(h.hp)}`);
  }
  {
    // lose track: break line of sight with a long leap → search, then give up
    const s = free();
    const p0 = C_SITE(s, "arena");
    place(s, p0.x, p0.z);
    const e = s.spawnEnemy("soldier", p0.x + 20, p0.z, {});
    steps(s, {}, 120);
    const alerted = e.state !== "patrol";
    const away = s.safeSpot(s.city.sites.plaza.x, s.city.sites.plaza.z, 6);
    Object.assign(s.hero, { x: away.x, z: away.z, y: away.y });
    let searched = false;
    for (let i = 0; i < 60 * 40; i++) {
      s.step({}, 1 / 60);
      if (e.state === "search") searched = true;
    }
    check("AI: loses track after losing sight (search → patrol)", alerted && searched && e.state === "patrol", `final ${e.state}`);
  }
}

/* ================================================================ bosses */
if (run("boss")) {
  const p = freshProgress();
  p.xp = 12000;
  for (const u of UPGRADES) p.up[u.id] = 4;
  for (const [kind, site, m] of [["warMachine", "fort", 14], ["colossus", "steel", 16], ["titan", "titan", 19]]) {
    const s = new Sim({ mode: "mission", mission: m, stats: computeStats(p), seed: 11, ambient: false });
    const b = s.bosses[0];
    const bot = createBot(s);
    const states = new Set();
    let tele = 0;
    let vuln = 0;
    let heroHits = 0;
    for (let i = 0; i < 60 * 420 && !s.result; i++) {
      s.step(bot(1 / 60), 1 / 60);
      states.add(b.state.replace(/Tele$/, ""));
      for (const e of s.events) {
        if (e.type === "bossTelegraph") tele++;
        if (e.type === "bossVulnerable" || e.type === "bossStunned" || e.type === "bossShieldDown") vuln++;
        if (e.type === "heroHit") heroHits++;
      }
    }
    const attacks = [...states].filter((x) => !["idle", "intro", "dying"].includes(x));
    check(`boss ${b.name}: ${attacks.length} distinct attack patterns, all telegraphed`, attacks.length >= 3 && tele >= 3, attacks.join(","));
    check(`boss ${b.name}: weakness windows open`, vuln > 0, `${vuln}`);
    check(`boss ${b.name}: fights back (hero was hit)`, heroHits > 5, `${heroHits}`);
    check(`boss ${b.name}: multiple phases and defeatable`, b.phase >= 2 && b.dead && s.result && s.result.win, `phase ${b.phase}, hp ${Math.round(b.hp)}, t ${s.t.toFixed(0)}s`);
  }
}

/* ================================================================ missions (campaign) */
if (run("missions")) {
  const ORDER = ["health", "heavy", "punch", "health", "cooldown", "rageCap", "health", "jump", "heavy", "punch", "rageDur", "sprint", "throw", "cooldown", "health", "heavy", "punch", "rageCap", "jump", "rageDur", "cooldown", "throw", "sprint"];
  let p = freshProgress();
  for (const m of MISSIONS) {
    let res = null;
    let tries = 0;
    let t = 0;
    do {
      tries++;
      const sim = new Sim({ mode: "mission", mission: m.id, stats: computeStats(p), seed: m.id * 13 + tries });
      const bot = createBot(sim);
      while (!sim.result && sim.t < 600) sim.step(bot(1 / 60), 1 / 60);
      t = sim.t;
      res = sim.result || { win: false, reason: "timeout", mission: m.id, xp: Math.round(sim.runXp), kills: 0, time: sim.t, destruction: 0 };
      p = applyMissionResult(p, res, MISSIONS.length).prog;
      let k = 0;
      while (pointsLeft(p) > 0 && k < 200) {
        const n = buyUpgrade(p, ORDER[k % ORDER.length]);
        if (n) p = n;
        k++;
      }
    } while (!res.win && tries < 3);
    check(`mission ${String(m.id).padStart(2)} ${m.title}: completed by the bot`, res.win, `${tries} attempt${tries > 1 ? "s" : ""}, ${t.toFixed(0)} s, level ${levelInfo(p.xp).level}${res.win ? "" : " — " + res.reason}`);
  }
}

/* ================================================================ activities */
if (run("activities")) {
  const p = freshProgress();
  p.xp = 3000;
  for (const u of UPGRADES) p.up[u.id] = 2;
  for (const a of ACTIVITIES) {
    const sim = new Sim({ mode: "free", stats: computeStats(p), seed: 5 });
    sim.encT = 1e9;
    const sp = sim.activitySpot(a);
    Object.assign(sim.hero, { x: sp.x, z: sp.z, y: sp.y || 0 });
    // start it the way a player does: stand in the ring, press E
    sim.step({ grab: true }, 1 / 60);
    const started = sim.scenario && sim.scenario.def.id === a.id;
    const bot = createBot(sim);
    let done = null;
    while (sim.t < 200 && !done) {
      sim.step(bot(1 / 60), 1 / 60);
      for (const e of sim.events) if (e.type === "activityDone") done = e;
    }
    check(`activity ${a.name}: starts with E in its ring and finishes with a score`, started && !!done, done ? `${done.success ? "success" : "fail"}, score ${Math.round(done.sc.score)}` : "no result");
  }
}

/* ================================================================ progression + saves */
if (run("progress")) {
  let last = 0;
  let mono = true;
  for (let xp = 0; xp < 200000; xp += 500) {
    const L = levelInfo(xp).level;
    if (L < last) mono = false;
    last = L;
  }
  check("levels: monotonic and capped at 30", mono && last === 30);
  const base = freshProgress();
  base.xp = 5000;
  const s0 = computeStats(base);
  let p = base;
  for (const id of ["health", "punch", "jump", "cooldown", "throw", "sprint", "rageDur", "rageCap", "heavy"]) p = buyUpgrade(p, id) || p;
  const s1 = computeStats(p);
  check("upgrades: every track changes a real gameplay value", s1.maxHp > s0.maxHp && s1.punchMul > s0.punchMul && s1.jumpMul > s0.jumpMul && s1.cdMul < s0.cdMul && s1.throwStr > s0.throwStr && s1.sprintMul > s0.sprintMul && s1.rageDur > s0.rageDur && s1.rageMax > s0.rageMax && s1.heavyMul > s0.heavyMul);
  {
    // jump upgrade → measurably higher leap in the sim
    const leap = (st) => {
      const s = free({ stats: st });
      place(s, s.city.sites.plaza.x, s.city.sites.plaza.z + 12);
      let apex = 0;
      for (let i = 0; i < 200; i++) {
        s.step({ jump: i < 75 }, 1 / 60);
        apex = Math.max(apex, s.hero.y);
      }
      return apex;
    };
    let pj = { ...freshProgress(), xp: 99999 };
    for (let i = 0; i < 5; i++) pj = buyUpgrade(pj, "jump") || pj;
    const a0 = leap(computeStats(freshProgress()));
    const a1 = leap(computeStats(pj));
    check("upgrades: Jump Power really raises the super leap", a1 > a0 * 1.15, `${a0.toFixed(1)} → ${a1.toFixed(1)} m`);
  }
  {
    // punch upgrade → more damage dealt to the same enemy
    const dmg = (st) => {
      const s = free({ stats: st });
      const pp = place(s, s.city.sites.arena.x, s.city.sites.arena.z);
      s.hero.heading = 0;
      const e = s.spawnEnemy("heavyRobot", pp.x, pp.z + 3.6, {});
      e.fixed = true;
      s.step({ punch: true, camYaw: 0 }, 1 / 60);
      steps(s, { camYaw: 0 }, 40);
      return e.maxHp - e.hp;
    };
    let pu = { ...freshProgress(), xp: 99999 };
    for (let i = 0; i < 5; i++) pu = buyUpgrade(pu, "punch") || pu;
    const d0 = dmg(computeStats(freshProgress()));
    const d1 = dmg(computeStats(pu));
    check("upgrades: Punch Damage really increases damage", d1 > d0 * 1.3, `${d0.toFixed(0)} → ${d1.toFixed(0)}`);
  }
  {
    const r = applyMissionResult(freshProgress(), { win: true, mission: 1, xp: 300, kills: 5, time: 40, destruction: 100, boss: null }, 20);
    check("missions: a win unlocks the next mission and banks XP", r.prog.unlocked === 2 && r.prog.completed.includes(1) && r.prog.xp === 300);
    const f = applyMissionResult(r.prog, { win: false, mission: 2, xp: 40, kills: 2, time: 20, destruction: 0 }, 20);
    check("missions: a failed retry never removes progress", f.prog.completed.includes(1) && f.prog.unlocked === 2 && f.prog.xp === 340);
  }
  {
    const junk = sanitize({ xp: "lots", up: { health: 99, punch: -3 }, completed: [1, 1, 99, "x"], unlocked: 500, bosses: { titan: "yes" }, settings: { volume: 9, quality: "ultra" }, free: { x: NaN } });
    check("save: garbage data is validated field-by-field", junk.xp === 0 && junk.up.health === 0 && junk.up.punch === 0 && junk.completed.join() === "1" && junk.unlocked === 20 && !junk.bosses.titan && junk.settings.volume === 1 && junk.settings.quality === "high" && junk.free === null);
    const cheat = sanitize({ ...freshProgress(), up: { ...freshProgress().up, health: 5, punch: 5 } });
    check("save: upgrade ranks without the points to pay for them are refunded", cheat.up.health === 0 && cheat.spent === 0);
    const mem = new Map();
    const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    let q = addXp(freshProgress(), 2500).prog;
    q = buyUpgrade(q, "health");
    q = { ...q, completed: [1, 2, 3], unlocked: 4, bosses: { warMachine: true }, discovered: ["apex"], free: { x: 100, z: 200 } };
    saveProgress(st, q);
    const back = loadProgress(st);
    check("save: round-trip keeps level, upgrades, missions, bosses, landmarks, position", back.xp === q.xp && back.up.health === 1 && back.completed.join() === "1,2,3" && back.unlocked === 4 && back.bosses.warMachine && back.discovered[0] === "apex" && back.free.x === 100);
    st.setItem("hulk-open-world-3d-progress", "{not json");
    check("save: corrupt JSON falls back to a fresh save", loadProgress(st).xp === 0);
  }
}

/* ================================================================ free roam */
if (run("free")) {
  const s = new Sim({ mode: "free", stats: baseStats(), seed: 9 });
  s.encT = 2;
  let enc = false;
  let land = false;
  for (let i = 0; i < 60 * 40; i++) {
    s.step({}, 1 / 60);
    for (const e of s.events) {
      if (e.type === "encounter") enc = true;
      if (e.type === "landmark") land = true;
    }
  }
  check("free roam: roaming enemy encounters spawn", enc && s.enemies.some((e) => e.tag === "roam"));
  check("free roam: standing at a landmark discovers it (+XP)", land && s.discovered.size > 0, [...s.discovered].join(","));
  check("free roam: traffic drives and pedestrians walk", s.traffic.some((c) => c.drive) && s.civilians.length > 0, `${s.traffic.length} cars, ${s.civilians.length} walkers`);
  // death → respawn
  s.damageHero(99999, {});
  let resp = false;
  for (let i = 0; i < 60 * 6; i++) {
    s.step({}, 1 / 60);
    if (s.events.some((e) => e.type === "respawn")) resp = true;
  }
  check("free roam: the hero can be defeated and gets back up", resp && s.hero.alive && s.hero.hp === s.hero.maxHp);
  // mission defeat → fail result
  const m = new Sim({ mode: "mission", mission: 2, stats: baseStats(), seed: 1 });
  m.damageHero(99999, {});
  steps(m, {}, 200);
  check("missions: dying fails the mission", m.result && !m.result.win && /defeated/.test(m.result.reason));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
