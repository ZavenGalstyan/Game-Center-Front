/**
 * Headless gameplay checks for Wild Kingdom 3D (no browser, no Three.js).
 *   node src/components/games/WildKingdom3D/tools/simTest.mjs [group…]
 * Groups: move flight hunt ai combat special family territory progress missions world save (default: all)
 * Every check drives the real Sim with the same input objects the component sends.
 */
import { Sim } from "../sim.js";
import { makeEntity } from "../ai.js";
import { newSave, validateSave, SAVE_KEY, loadSave, writeSave } from "../progress.js";
import { SPECIES, SPECIES_ORDER, MISSIONS, TERRITORIES, WILD, UPGRADES } from "../data.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const want = new Set(process.argv.slice(2));
const run = (g) => want.size === 0 || want.has(g);
let pass = 0;
let fail = 0;
const ok = (cond, msg, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}${extra ? `  (${extra})` : ""}`);
};
const DT = 1 / 60;
const idle = { mx: 0, mz: 0, camYaw: 0, camPitch: 0.3 };
function mk(species, o = {}) {
  const save = o.save || newSave();
  const sim = new Sim({ species, save, seed: o.seed ?? 3, fresh: true });
  if (o.clear !== false) sim.ents = sim.ents.filter((e) => e.role === "companion");
  sim.spawnTimer = 1e9; // no random spawns unless a test wants them
  sim.recruitTimer = 1e9;
  sim.intruderTimer = 1e9;
  return sim;
}
function steps(sim, n, inp = idle) {
  for (let i = 0; i < n; i++) sim.step(typeof inp === "function" ? inp(i) : inp, DT);
}
/** Put the player on open flat ground (meadow near the fox home). */
function place(sim, x = -60, z = 200, yaw = 0) {
  const p = sim.player;
  const pos = sim.findDry(x, z);
  p.x = pos.x;
  p.z = pos.z;
  p.y = sim.terrain.height(p.x, p.z);
  p.yaw = yaw;
  p.speed = 0;
  p.onGround = true;
  p.mode = "ground";
  return p;
}
function spawn(sim, type, dx, dz, o = {}) {
  const p = sim.player;
  const e = makeEntity(sim, type, p.x + dx, p.z + dz, o);
  if (!e.def.water && !e.flying) e.y = sim.terrain.height(e.x, e.z);
  sim.ents.push(e);
  return e;
}
const face = (sim, e) => Math.atan2(e.x - sim.player.x, e.z - sim.player.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/* ================================================================== move */
if (run("move")) {
  console.log("\n[move] ground movement per species");
  const res = {};
  for (const sp of SPECIES_ORDER.filter((s) => s !== "eagle")) {
    const sim = mk(sp);
    const p = place(sim, -60, 200, 0);
    const x0 = p.x;
    const z0 = p.z;
    // run 2 s, then sprint 2 s straight along the camera direction
    let maxRun = 0;
    let maxSpr = 0;
    let t60 = null;
    for (let i = 0; i < 240; i++) {
      sim.step({ ...idle, mz: 1, camYaw: 0, sprint: i >= 120 }, DT);
      if (i < 120) maxRun = Math.max(maxRun, p.speed);
      else maxSpr = Math.max(maxSpr, p.speed);
      if (t60 == null && p.speed >= SPECIES[sp].move.run * 0.9) t60 = i * DT;
    }
    const moved = Math.hypot(p.x - x0, p.z - z0);
    res[sp] = { maxRun, maxSpr, t60, moved, st: p.stamina / p.maxStamina };
    ok(moved > 15, `${sp}: moves (${moved.toFixed(1)} m in 4 s)`);
    ok(Math.abs(maxSpr - SPECIES[sp].move.sprint) < 0.5, `${sp}: reaches its sprint speed`, `${maxSpr.toFixed(1)} m/s`);
    ok(p.stamina < p.maxStamina, `${sp}: sprinting costs stamina`, `${(res[sp].st * 100).toFixed(0)}%`);
    // turn: how long to reverse direction
    const sim2 = mk(sp);
    const q = place(sim2, -60, 200, 0);
    let tt = 0;
    while (Math.abs(((q.yaw - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.1 && tt < 300) {
      sim2.step({ ...idle, mz: -1, camYaw: 0 }, DT);
      tt++;
    }
    res[sp].turn = tt * DT;
    // stamina regenerates when idle
    const before = p.stamina;
    steps(sim, 180);
    ok(p.stamina > before, `${sp}: stamina regenerates at rest`, `${before.toFixed(0)} → ${p.stamina.toFixed(0)}`);
  }
  const sprints = Object.values(res).map((r) => r.maxSpr.toFixed(1));
  ok(new Set(sprints).size === sprints.length, "every ground species has a different top speed", sprints.join(" / "));
  ok(res.fox.turn < res.bear.turn && res.wolf.turn < res.lion.turn, "agile animals turn faster than heavy ones", Object.entries(res).map(([k, v]) => `${k} ${v.turn.toFixed(2)}s`).join(", "));
  ok(res.fox.t60 < res.bear.t60, "fox accelerates faster than bear", `${res.fox.t60.toFixed(2)}s vs ${res.bear.t60.toFixed(2)}s`);
  // jump & slopes
  const sim = mk("tiger");
  const p = place(sim);
  sim.step({ ...idle, jump: true }, DT);
  let peak = p.y;
  for (let i = 0; i < 60; i++) {
    sim.step(idle, DT);
    peak = Math.max(peak, p.y);
  }
  ok(peak - sim.terrain.height(p.x, p.z) > 0.8 && p.onGround, "jump goes up and lands again", `peak +${(peak - sim.terrain.height(p.x, p.z)).toFixed(2)} m`);
  // cliffs: walk into the steep gorge wall below Thunder Peak
  const simC = mk("bear");
  const c = place(simC, 0, -420, Math.PI);
  let steepest = 0;
  for (let i = 0; i < 900; i++) {
    simC.step({ ...idle, mz: 1, camYaw: Math.PI, sprint: true }, DT);
    steepest = Math.max(steepest, 1 - simC.terrain.normal(c.x, c.z).y);
  }
  ok(steepest < 1 - SPECIES.bear.move.climb + 0.2, "slope limit stops climbing cliffs", `steepest ground stood on: normal.y ${(1 - steepest).toFixed(2)}`);
  // swimming
  const simS = mk("bear");
  const s = place(simS, 110, 470, 0); // north shore of Mirror Lake
  let swam = false;
  for (let i = 0; i < 900 && !swam; i++) {
    simS.step({ ...idle, mz: 1, camYaw: 0 }, DT);
    if (s.mode === "swim") swam = true;
  }
  ok(swam, "walking into the lake switches to swimming");
  const sb = s.stamina;
  steps(simS, 120, { ...idle, mz: 1, camYaw: 0 });
  ok(simS.A.stats.swim > 1, "swim distance is tracked", `${simS.A.stats.swim?.toFixed(1)} m`);
  void sb;
}

/* ================================================================== flight */
if (run("flight")) {
  console.log("\n[flight] eagle");
  const sim = mk("eagle");
  const p = place(sim, 60, -80, 0);
  ok(p.mode === "ground", "eagle starts perched on the ground");
  sim.step({ ...idle, jump: true, up: true }, DT);
  ok(p.mode === "air", "Space takes off");
  steps(sim, 240, { ...idle, mz: 1, up: true, camYaw: 0, camPitch: 0 });
  const agl = sim.agl();
  ok(agl > 15, "climbing gains altitude", `${agl.toFixed(1)} m AGL`);
  ok(Math.abs(p.speed - SPECIES.eagle.move.cruise) < 5, "W cruises near cruise speed", `${p.speed.toFixed(1)} m/s`);
  // fast flight
  steps(sim, 180, { ...idle, mz: 1, sprint: true, camYaw: 0, camPitch: 0.25 });
  ok(p.speed > 22, "Shift = fast flight", `${p.speed.toFixed(1)} m/s`);
  // turning follows the camera yaw (A/D rotate the camera)
  const y0 = p.yaw;
  steps(sim, 120, { ...idle, camYaw: 1.2, camPitch: 0.25 });
  ok(Math.abs(p.yaw - 1.2) < 0.2 && Math.abs(y0 - p.yaw) > 0.8, "eagle turns toward the steering direction", `yaw ${p.yaw.toFixed(2)}`);
  // glide (no keys) sinks slowly and records glide distance
  const yG = p.y;
  const gl0 = sim.A.stats.glide || 0;
  steps(sim, 180, { ...idle, camYaw: 1.2, camPitch: 0.25 });
  ok(p.y < yG && (sim.A.stats.glide || 0) > gl0 + 20, "gliding sinks and counts glide distance", `${(yG - p.y).toFixed(1)} m lost, glide ${(sim.A.stats.glide - gl0).toFixed(0)} m`);
  // dive attack hits a rabbit below
  p.stamina = p.maxStamina;
  const r = spawn(sim, "rabbit", Math.sin(p.yaw) * 28, Math.cos(p.yaw) * 28);
  r.state = "graze";
  r.stateT = 99;
  p.y = sim.terrain.height(r.x, r.z) + 22;
  const pitchToR = -Math.atan2(p.y - r.y, dist(p, r));
  const camP = 0.25 - pitchToR / 1.25;
  sim.step({ ...idle, special: true, camYaw: p.yaw, camPitch: camP }, DT);
  ok(!!p.flight.dive, "Q starts a dive");
  let hit = false;
  for (let i = 0; i < 240 && !hit; i++) {
    sim.step({ ...idle, camYaw: Math.atan2(r.x - p.x, r.z - p.z), camPitch: camP }, DT);
    if (r.dead) hit = true;
  }
  ok(hit, "dive kills the rabbit", `diveKills ${sim.A.stats.diveKills || 0}`);
  ok(!!p.carry || sim.A.stats["kill:rabbit"] === 1, "eagle carries the small kill", p.carry ? "carrying" : "on ground");
  // land: descend slowly
  let landed = false;
  for (let i = 0; i < 1800 && !landed; i++) {
    sim.step({ ...idle, mz: -1, down: true, camYaw: p.yaw, camPitch: 0.6 }, DT);
    if (p.mode === "ground") landed = true;
  }
  ok(landed, "descending lands the eagle", `hp ${p.hp.toFixed(0)}/${p.maxHp.toFixed(0)}`);
  if (p.carry) {
    const h0 = (p.hunger = 40);
    sim.step({ ...idle, interact: true }, DT);
    ok(p.hunger > h0 && !p.carry, "E eats the carried prey after landing", `${h0} → ${p.hunger.toFixed(0)}`);
  }
  // dive denied on the ground
  p.cd.special = 0;
  sim.step({ ...idle, special: true }, DT);
  ok(!p.flight.dive && sim.events.some((e) => e.type === "needAir"), "dive needs height");
}

/* ================================================================== hunt */
if (run("hunt")) {
  console.log("\n[hunt] approach, hit, kill, eat");
  const sim = mk("fox");
  const p = place(sim);
  const r = spawn(sim, "rabbit", 0, 30);
  r.state = "graze";
  r.stateT = 99;
  // attack out of range does nothing
  p.yaw = face(sim, r);
  sim.step({ ...idle, atk1: true }, DT);
  steps(sim, 20);
  ok(r.hp === r.maxHp, "an attack out of range does not hit");
  // facing away does nothing even when close
  r.x = p.x + Math.sin(p.yaw) * 0.9;
  r.z = p.z + Math.cos(p.yaw) * 0.9;
  r.alert = 0;
  r.state = "graze";
  p.yaw += Math.PI;
  p.cd.primary = 0;
  sim.step({ ...idle, atk1: true }, DT);
  steps(sim, 20);
  ok(r.hp === r.maxHp, "an attack facing away does not hit");
  // stalk up and bite
  r.x = p.x + Math.sin(p.yaw) * 6;
  r.z = p.z + Math.cos(p.yaw) * 6;
  r.alert = 0;
  r.state = "graze";
  r.stateT = 99;
  sim.step({ ...idle, stalk: true }, DT);
  ok(p.stalking, "X toggles stalking");
  let killed = false;
  for (let i = 0; i < 1200 && !killed; i++) {
    const yaw = face(sim, r);
    const d = dist(p, r);
    sim.step({ ...idle, mz: d > 1.0 ? 1 : 0, camYaw: yaw, sprint: r.state === "flee", atk1: d < 1.6 && i % 6 === 0 }, DT);
    if (r.dead) killed = true;
  }
  ok(killed, "fox catches and kills the rabbit", `${(sim.A.stats["kill:rabbit"] || 0)} rabbit kills`);
  ok(r.meat > 0, "the kill leaves a carcass with food", `${r.meat} food`);
  const xpGot = sim.events.some((e) => e.type === "xp" && /Rabbit/.test(e.why));
  ok(xpGot || sim.A.xp > 0 || sim.A.level > 1, "hunting gives XP");
  // eat
  p.hunger = 30;
  p.x = r.x - Math.sin(p.yaw) * 0.7;
  p.z = r.z - Math.cos(p.yaw) * 0.7;
  p.yaw = face(sim, r);
  steps(sim, 2);
  ok(sim.prompt && sim.prompt.kind === "eat", "E prompt offers the carcass", sim.prompt?.text);
  sim.step({ ...idle, interact: true }, DT);
  steps(sim, 120);
  ok(p.hunger > 45, "eating restores hunger", `30 → ${p.hunger.toFixed(0)}`);
  ok(r.meat < r.maxMeat, "eating uses up the carcass", `${r.meat.toFixed(0)}/${r.maxMeat}`);
  // wrong diet
  const d = spawn(sim, "deer", 2, 0);
  d.dead = true;
  d.meat = 60;
  d.maxMeat = 60;
  d.state = "dead";
  for (const e of sim.ents) if (e !== d) e.gone = true;
  p.yaw = face(sim, d);
  p.x = d.x - Math.sin(p.yaw) * 0.8;
  p.z = d.z - Math.cos(p.yaw) * 0.8;
  p.eating = null;
  steps(sim, 2);
  sim.step({ ...idle, interact: true }, DT);
  ok(sim.prompt && sim.prompt.kind === "eat" && sim.prompt.ok === false && !p.eating, "a fox can't eat a deer carcass", sim.prompt?.text);
  // berries (bear) and drinking
  const simB = mk("bear");
  const pb = simB.player;
  const bi = simB.berryIdx.find((i) => Math.abs(simB.scatter[i].x + 60) < 250 && Math.abs(simB.scatter[i].z - 200) < 250);
  const b = simB.scatter[bi];
  pb.x = b.x - 1.6;
  pb.z = b.z;
  pb.y = simB.terrain.height(pb.x, pb.z);
  pb.yaw = Math.PI / 2;
  pb.hunger = 40;
  simB.step(idle, DT);
  simB.step({ ...idle, interact: true }, DT);
  ok(pb.hunger > 50 && simB.berries.has(bi), "bear eats berries; the bush is emptied", `hunger ${pb.hunger.toFixed(0)}`);
  const simD = mk("wolf");
  const pd = place(simD, 110, 466, 0);
  for (let i = 0; i < 600 && !(simD.prompt && simD.prompt.kind === "drink"); i++) simD.step({ ...idle, mz: 1, camYaw: 0 }, DT);
  pd.thirst = 20;
  steps(simD, 3);
  simD.step({ ...idle, interact: true }, DT);
  steps(simD, 180);
  ok(pd.thirst > 60, "drinking at the lake restores thirst", `20 → ${pd.thirst.toFixed(0)}`);
}

/* ================================================================== ai */
if (run("ai")) {
  console.log("\n[ai] prey flee, predators hunt");
  const sim = mk("wolf");
  const p = place(sim);
  const deer = spawn(sim, "deer", 0, 22);
  deer.state = "graze";
  deer.stateT = 99;
  steps(sim, 20);
  ok(deer.state !== "flee", "grazing deer ignores a still wolf at 22 m", `alert ${deer.alert.toFixed(2)}`);
  const d0 = dist(p, deer);
  for (let i = 0; i < 90; i++) sim.step({ ...idle, mz: 1, sprint: true, camYaw: face(sim, deer) }, DT);
  ok(deer.state === "flee", "a sprinting wolf makes the deer flee");
  steps(sim, 120);
  ok(dist(p, deer) > d0 - 6 && deer.anim.spd > 6, "fleeing deer runs away fast", `${deer.anim.spd.toFixed(1)} m/s`);
  // herd alarm
  const sim2 = mk("lion");
  const p2 = place(sim2, 470, 230);
  const g1 = spawn(sim2, "gazelle", 0, 20);
  const g2 = spawn(sim2, "gazelle", 6, 30);
  for (const g of [g1, g2]) {
    g.state = "graze";
    g.stateT = 99;
  }
  for (let i = 0; i < 120; i++) sim2.step({ ...idle, mz: 1, sprint: true, camYaw: face(sim2, g1) }, DT);
  ok(g1.state === "flee" && g2.state === "flee", "the herd flees together");
  // stealth: stalking gets closer than sprinting
  const sim3 = mk("tiger");
  const p3 = place(sim3, -480, 340);
  const dd = spawn(sim3, "deer", 0, 30);
  dd.state = "graze";
  dd.stateT = 999;
  sim3.step({ ...idle, stalk: true }, DT);
  let closest = 99;
  for (let i = 0; i < 1500 && dd.state !== "flee"; i++) {
    sim3.step({ ...idle, mz: 1, camYaw: face(sim3, dd) }, DT);
    closest = Math.min(closest, dist(p3, dd));
  }
  ok(closest < 12, "a stalking tiger gets close before the deer notices", `${closest.toFixed(1)} m`);
  // predator hunts prey
  const sim4 = mk("bear");
  place(sim4, -420, 100);
  const wolf = spawn(sim4, "wolf", 30, 0);
  wolf.hunger = 1;
  const rab = spawn(sim4, "rabbit", 45, 0);
  rab.state = "graze";
  rab.stateT = 99;
  let hunted = false;
  for (let i = 0; i < 1800 && !hunted; i++) {
    sim4.step(idle, DT);
    if (wolf.state === "hunt" || wolf.state === "eat") hunted = true;
  }
  ok(hunted, "a hungry wild wolf hunts a rabbit");
  // predator attacks a weaker player
  const sim5 = mk("fox");
  const p5 = place(sim5);
  const w5 = spawn(sim5, "wolf", 0, 10);
  w5.hunger = 1;
  const hp0 = p5.hp;
  steps(sim5, 300);
  ok(w5.target === "player" && p5.hp < hp0, "a hungry wolf attacks a fox player", `hp ${hp0.toFixed(0)} → ${p5.hp.toFixed(0)}`);
  // bigger player scares smaller predators
  const sim6 = mk("bear");
  const p6 = place(sim6);
  const f6 = spawn(sim6, "fox", 0, 8);
  steps(sim6, 60);
  ok(f6.state === "flee", "a fox flees from a bear");
  // fish stay in water
  const sim7 = mk("bear");
  place(sim7, 110, 500);
  const fish = spawn(sim7, "fish", 0, 40);
  fish.y = -0.5;
  let dry = 0;
  for (let i = 0; i < 600; i++) {
    sim7.step(idle, DT);
    if (sim7.terrain.height(fish.x, fish.z) > -0.6) dry++;
  }
  ok(dry === 0, "fish never leave deep water");
  // spawning keeps a living world around the player
  const sim8 = new Sim({ species: "wolf", save: newSave(), seed: 9, fresh: true });
  for (let i = 0; i < 60 * 20; i++) sim8.step({ ...idle, mz: 1, camYaw: 0.4 }, DT);
  const alive = sim8.ents.filter((e) => !e.dead);
  ok(alive.length >= 15 && alive.length <= 60, "population stays within limits while travelling", `${alive.length} animals, types: ${[...new Set(alive.map((e) => e.type))].join(",")}`);
  ok(alive.every((e) => dist(e, sim8.player) > 0.2), "no animal spawned inside the player");
}

/* ================================================================== combat */
if (run("combat")) {
  console.log("\n[combat] damage, cooldowns, knockback, death, respawn");
  const sim = mk("lion");
  const p = place(sim, 470, 230);
  const z = spawn(sim, "zebra", 0, 2.1);
  z.state = "graze";
  z.stateT = 99;
  p.yaw = face(sim, z);
  sim.step({ ...idle, atk1: true }, DT);
  const cdSet = p.cd.primary > 0;
  sim.step({ ...idle, atk1: true }, DT);
  steps(sim, 30);
  ok(cdSet && z.hp < z.maxHp, "claw swipe hits the zebra", `${z.hp.toFixed(0)}/${z.maxHp}`);
  const hpAfterOne = z.hp;
  ok(z.maxHp - hpAfterOne < SPECIES.lion.attacks.primary.dmg * 1.2, "cooldown blocks a second instant swipe");
  ok(Math.hypot(z.kx || 0, z.kz || 0) > 0 || dist(p, z) > 2.1, "hit applies knockback");
  steps(sim, 40);
  const st0 = p.stamina;
  p.cd.secondary = 0;
  sim.step({ ...idle, atk2: true }, DT);
  ok(p.stamina < st0, "attacks cost stamina", `${st0.toFixed(0)} → ${p.stamina.toFixed(0)}`);
  // tired: no stamina → no attack
  p.stamina = 1;
  p.cd.secondary = 0;
  p.attack = null;
  sim.step({ ...idle, atk2: true }, DT);
  ok(!p.attack, "no stamina → secondary attack refused");
  p.cd.primary = 0;
  sim.step({ ...idle, atk1: true }, DT);
  ok(p.attack && p.attack.mult < 1 && p.cd.primary > SPECIES.lion.attacks.primary.cd, "exhausted → a weaker, slower primary still works");
  // species attack differences
  const dm = SPECIES_ORDER.map((s) => SPECIES[s].attacks.primary.dmg);
  ok(new Set(SPECIES_ORDER.map((s) => SPECIES[s].attacks.primary.name)).size === 6, "every species has its own primary attack", SPECIES_ORDER.map((s) => SPECIES[s].attacks.primary.name).join(", "));
  ok(SPECIES.fox.attacks.primary.cd < SPECIES.bear.attacks.primary.cd && SPECIES.fox.attacks.primary.dmg < SPECIES.bear.attacks.primary.dmg, "fox: fast & weak, bear: slow & heavy", dm.join("/"));
  // death & respawn
  const simD = mk("fox");
  const pd = place(simD);
  pd.invulnT = 0;
  simD.hurtPlayer(9999, null, { cause: "test" });
  ok(pd.dead && simD.events.some((e) => e.type === "death"), "lethal damage kills the player");
  const xpBefore = (simD.A.xp = 50);
  simD.respawn();
  ok(!pd.dead && pd.hp > 0 && simD.A.xp < xpBefore, "respawn revives with an XP penalty", `hp ${pd.hp.toFixed(0)}, xp 50 → ${simD.A.xp.toFixed(0)}`);
  // starvation & thirst hurt
  const simS = mk("wolf");
  const ps = place(simS);
  ps.hunger = 0;
  ps.thirst = 0;
  const h0 = ps.hp;
  steps(simS, 120);
  ok(ps.hp < h0 - 2, "starving and dehydrated animals lose health", `${h0.toFixed(0)} → ${ps.hp.toFixed(0)}`);
  // fall damage
  const simF = mk("bear");
  const pf = place(simF);
  pf.y += 30;
  pf.onGround = false;
  pf.vy = 0;
  const hf = pf.hp;
  steps(simF, 150);
  ok(pf.hp < hf && pf.onGround, "a long fall hurts", `${hf.toFixed(0)} → ${pf.hp.toFixed(0)}`);
}

/* ================================================================== special */
if (run("special")) {
  console.log("\n[special] abilities");
  // wolf howl buffs companions
  {
    const sim = mk("wolf");
    const p = place(sim);
    const c = spawn(sim, "wolf", 3, -3);
    sim.addFamily(c, "adult");
    const st = p.stamina;
    sim.step({ ...idle, special: true }, DT);
    ok(c.buffT > 0 && p.buff.howl > 0 && p.stamina < st && p.cd.special > 0, "Pack Howl: buffs packmates, costs stamina, cooldown", `buff ${c.buffT.toFixed(1)} s`);
    ok(sim.fx.some((f) => f.type === "ring") || sim.events.some((e) => e.type === "special"), "howl has visual feedback");
    sim.step({ ...idle, special: true }, DT);
    ok(sim.events.some((e) => e.type === "cooldown"), "howl on cooldown is refused");
  }
  // lion roar intimidates weaker predators & freezes prey
  {
    const sim = mk("lion");
    const p = place(sim, 470, 230);
    const h = spawn(sim, "fox", 10, 0);
    const g = spawn(sim, "gazelle", -10, 0);
    sim.step({ ...idle, special: true }, DT);
    ok(h.fearT > 0 && h.state === "flee" && h.weakT > 0, "Mighty Roar: weaker animals flee and hit softer");
    ok(g.stun > 0, "Mighty Roar: prey freezes");
    void p;
  }
  // tiger ambush multiplies damage
  {
    const base = (() => {
      const sim = mk("tiger");
      const p = place(sim, -480, 340);
      const d = spawn(sim, "deer", 0, 2.0);
      d.alert = 2;
      d.state = "flee";
      d.stateT = 99;
      d.fleeFrom = "player";
      d.kx = d.kz = 0;
      p.yaw = face(sim, d);
      sim.rng = () => 0.5;
      sim.step({ ...idle, atk1: true }, DT);
      for (let i = 0; i < 30; i++) {
        d.x = p.x + Math.sin(p.yaw) * 2;
        d.z = p.z + Math.cos(p.yaw) * 2;
        sim.step(idle, DT);
      }
      return d.maxHp - d.hp;
    })();
    const sim = mk("tiger");
    const p = place(sim, -480, 340);
    const d = spawn(sim, "deer", 0, 2.0);
    d.hp = d.maxHp = 500;
    d.state = "graze";
    d.stateT = 99;
    p.yaw = face(sim, d);
    sim.rng = () => 0.5;
    sim.step({ ...idle, special: true }, DT);
    sim.step(idle, DT);
    ok(p.buff.ambush > 0 && p.vis < 0.3, "Ambush: near-invisible stance", `visibility ×${p.vis.toFixed(2)}`);
    sim.step({ ...idle, atk1: true }, DT);
    for (let i = 0; i < 30; i++) {
      d.x = p.x + Math.sin(p.yaw) * 2;
      d.z = p.z + Math.cos(p.yaw) * 2;
      sim.step(idle, DT);
    }
    const amb = d.maxHp - d.hp;
    ok(amb > base * 2.5, "Ambush hit on an unaware deer deals ≥2.5× a normal hit", `${amb.toFixed(0)} vs ${base.toFixed(0)}`);
  }
  // bear heavy strike: big damage + knockback + stun on several targets
  {
    const sim = mk("bear");
    const p = place(sim);
    const a = spawn(sim, "wolf", 0.5, 2.0);
    const b = spawn(sim, "wolf", -0.6, 2.0);
    for (const w of [a, b]) {
      w.hp = w.maxHp = 400;
      w.state = "idle";
      w.stateT = 99;
    }
    p.yaw = 0;
    sim.step({ ...idle, special: true }, DT);
    for (let i = 0; i < 40; i++) sim.step(idle, DT);
    ok(a.hp < 400 && b.hp < 400, "Heavy Strike hits several enemies", `${(400 - a.hp).toFixed(0)} & ${(400 - b.hp).toFixed(0)} dmg`);
    ok((sim.A.stats.heavyKnock || 0) >= 2, "Heavy Strike knocks them back", `heavyKnock ${sim.A.stats.heavyKnock}`);
  }
  // fox dash
  {
    const sim = mk("fox");
    const p = place(sim);
    steps(sim, 90, { ...idle, mz: 1, camYaw: 0, sprint: true });
    const v0 = p.speed;
    sim.step({ ...idle, special: true, mz: 1, camYaw: 0, sprint: true }, DT);
    steps(sim, 40, { ...idle, mz: 1, camYaw: 0, sprint: true });
    ok(p.speed > v0 * 1.5 && p.vis < 0.4, "Silent Dash: faster and nearly undetectable", `${v0.toFixed(1)} → ${p.speed.toFixed(1)} m/s, vis ×${p.vis.toFixed(2)}`);
  }
}

/* ================================================================== family */
if (run("family")) {
  console.log("\n[family] companions, mates, cubs");
  const sim = mk("wolf");
  const p = place(sim);
  sim.A.level = 3;
  sim.recalc();
  sim.recruitTimer = 0;
  sim.spawnTimer = 0;
  steps(sim, 60);
  const r = sim.recruit;
  ok(!!r && r.role === "recruit", "a lone wolf appears to recruit");
  if (r) {
    p.x = r.x + 2;
    p.z = r.z;
    p.y = sim.terrain.height(p.x, p.z);
    sim.spawnTimer = 1e9;
    sim.step(idle, DT);
    sim.step({ ...idle, interact: true }, DT);
    ok(sim.A.family.length === 1 && r.role === "companion", "E recruits it into the pack");
    ok((sim.A.stats.companions || 0) >= 1, "companion stat updates");
    // follow
    for (let i = 0; i < 600; i++) sim.step({ ...idle, mz: 1, camYaw: 0.3 }, DT);
    ok(dist(r, p) < 12, "the packmate follows", `${dist(r, p).toFixed(1)} m behind`);
    // help in a fight
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const deer = spawn(sim, "deer", fx * 1.7, fz * 1.7);
    deer.hp = deer.maxHp = 400;
    deer.state = "graze";
    deer.stateT = 99;
    sim.step({ ...idle, atk1: true }, DT);
    let helped = false;
    const hp0 = deer.hp;
    for (let i = 0; i < 600 && !helped; i++) {
      sim.step(idle, DT);
      deer.x = p.x + fx * 1.7;
      deer.z = p.z + fz * 1.7;
      if (r.target === deer && deer.lastAttacker === r) helped = true;
    }
    ok(helped && deer.hp < hp0, "the packmate attacks your target");
    // badly hurt → home
    r.hp = r.maxHp * 0.2;
    for (let i = 0; i < 2400 && !r.gone; i++) sim.step(idle, DT);
    ok(sim.A.family[0].home === true, "a badly hurt companion returns home to recover");
  }
  // tiger mate & cubs in an owned territory
  const simT = mk("tiger");
  const pt = place(simT, -560, 420);
  simT.A.level = 5;
  simT.recalc();
  simT.A.owned.push("thicket");
  simT.A.found.push("thicket");
  const mate = spawn(simT, "tiger", 2, 0, { role: "recruit" });
  simT.recruit = mate;
  pt.yaw = face(simT, mate);
  simT.step(idle, DT);
  simT.step({ ...idle, interact: true }, DT);
  ok(simT.hasMate(), "tiger courts a mate");
  pt.combatT = 99;
  simT.step({ ...idle, rest: true }, DT);
  for (let i = 0; i < 60 * 8; i++) simT.step(idle, DT);
  const cub = simT.A.family.find((f) => f.role === "cub");
  ok(!!cub && (simT.A.stats.cubs || 0) === 1, "resting at home with a mate brings cubs");
  if (cub) {
    simT.wake();
    steps(simT, 30);
    const ce = simT.ents.find((e) => e.famId === cub.id);
    ok(!!ce && ce.cub && ce.scale < 0.6, "the cub follows as a small tiger", ce ? `scale ${ce.scale.toFixed(2)}` : "");
    for (let k = 0; k < 6 && cub.role === "cub"; k++) {
      const d = spawn(simT, "deer", 1.5, 0);
      d.dead = true;
      d.meat = 60;
      d.state = "dead";
      if (ce) {
        ce.x = pt.x - 2;
        ce.z = pt.z;
      }
      pt.hunger = 0;
      pt.yaw = face(simT, d);
      steps(simT, 2);
      simT.step({ ...idle, interact: true }, DT);
      steps(simT, 60 * 6);
    }
    ok(cub.role === "adult" && (simT.A.stats.cubsRaised || 0) === 1, "feeding near the cub raises it to adulthood");
  }
}

/* ================================================================== territory */
if (run("territory")) {
  console.log("\n[territory] discover, rival, claim, effects");
  for (const sp of ["wolf", "bear", "eagle"]) {
    const sim = mk(sp);
    const T = TERRITORIES.find((t) => t.species.includes(sp) && t.tier === 1);
    const p = place(sim, T.x + 20, T.z + 20);
    if (sp === "eagle") p.y = sim.terrain.height(p.x, p.z);
    steps(sim, 30);
    ok(sim.A.found.includes(T.id), `${sp}: entering ${T.name} discovers it`);
    const rival = sim.rivals.get(T.id);
    ok(!!rival && rival.role === "rival" && rival.type === sp, `${sp}: a rival ${sp} alpha guards it`);
    // claiming before beating the rival is impossible
    ok(!sim.canClaim(T), `${sp}: can't claim while the rival lives`);
    sim.killEnt(rival, "player");
    ok(sim.A.rivalsBeaten.includes(T.id) && (sim.A.stats.killRival || 0) === 1, `${sp}: rival defeated`);
    // species-specific claim
    if (SPECIES[sp].claim.how === "howl" || SPECIES[sp].claim.how === "roar") {
      p.cd.special = 0;
      p.stamina = p.maxStamina;
      sim.step({ ...idle, special: true }, DT);
    } else {
      p.x = T.x + 2;
      p.z = T.z;
      p.y = sim.terrain.height(p.x, p.z);
      p.mode = "ground";
      steps(sim, 2);
      for (let i = 0; i < 200 && !sim.A.owned.includes(T.id); i++) sim.step({ ...idle, interactHeld: true, interact: i === 0 }, DT);
    }
    ok(sim.A.owned.includes(T.id), `${sp}: claimed by ${SPECIES[sp].claim.how}`);
    if (sp === "eagle") ok(!!sim.A.nest, "eagle: claiming builds a nest");
    // effects: safe, faster healing while resting
    const rest = (owned) => {
      const s2 = mk(sp);
      if (owned) s2.A.owned.push(T.id);
      const q = place(s2, T.x + 6, T.z + 6);
      q.hp = q.maxHp * 0.3;
      q.combatT = 99;
      s2.step({ ...idle, rest: true }, DT);
      steps(s2, 300);
      return q.hp / q.maxHp;
    };
    const a = rest(false);
    const b = rest(true);
    ok(b > a + 0.05, `${sp}: resting in owned land heals faster`, `${(a * 100).toFixed(0)}% vs ${(b * 100).toFixed(0)}%`);
  }
  // intruders and losing land
  const sim = mk("wolf");
  sim.A.owned.push("pines");
  const p = place(sim, -470, -200);
  sim.intruderTimer = 0;
  steps(sim, 30);
  ok(!!sim.intruder, "an intruder arrives in your territory");
  if (sim.intruder) {
    sim.killEnt(sim.intruder, "player");
    steps(sim, 30);
    ok((sim.A.stats.defendTerritory || 0) === 1, "killing the intruder counts as defending");
  }
  void p;
}

/* ================================================================== progress */
if (run("progress")) {
  console.log("\n[progress] XP, levels, upgrades");
  const sim = mk("wolf");
  const p = place(sim);
  sim.addXp(100000, "test");
  ok(sim.A.level === 30, "XP raises the level up to 30", `level ${sim.A.level}`);
  ok(sim.A.sp === 29 + 6, "skill points: 1 per level + 1 every 5th", `${sim.A.sp}`);
  ok(sim.A.perks.length === 3, "perks unlock at their levels", sim.A.perks.join(","));
  const hp0 = sim.k.maxHp;
  const sp0 = sim.k.speedMul;
  const dm0 = sim.k.dmgMul;
  for (const u of UPGRADES) sim.buyUpgrade(u.id);
  ok(sim.k.maxHp > hp0 && sim.k.speedMul > sp0 && sim.k.dmgMul > dm0, "upgrades change real stats", `hp ${hp0.toFixed(0)}→${sim.k.maxHp.toFixed(0)}, speed ×${sim.k.speedMul.toFixed(2)}`);
  ok(p.maxHp === sim.k.maxHp, "player max health follows the upgrade");
  // speed upgrade = faster sprint
  const top = (ranks) => {
    const s = mk("wolf");
    s.A.up.speed = ranks;
    s.recalc();
    const q = place(s);
    let m = 0;
    for (let i = 0; i < 180; i++) {
      s.step({ ...idle, mz: 1, sprint: true, camYaw: 0 }, DT);
      m = Math.max(m, q.speed);
    }
    return m;
  };
  const a = top(0);
  const b = top(10);
  ok(b > a * 1.25, "Swiftness 10 sprints ~30% faster", `${a.toFixed(1)} → ${b.toFixed(1)} m/s`);
  const sim2 = mk("fox");
  ok(!sim2.buyUpgrade("attack"), "can't buy without skill points");
}

/* ================================================================== missions */
if (run("missions")) {
  console.log("\n[missions] 30 per species, every stat is produced by the game");
  const src = readFileSync(join(HERE, "../sim.js"), "utf8") + readFileSync(join(HERE, "../ai.js"), "utf8");
  for (const sp of SPECIES_ORDER) {
    const list = MISSIONS[sp];
    ok(list.length === 30 && new Set(list.map((m) => m.id)).size === 30, `${sp}: 30 unique objectives`);
    const bad = list.filter((m) => {
      const s = m.stat;
      if (s === "level" || s.startsWith("kill:") || s.startsWith("biome:") || s.startsWith("landmark:")) return false;
      return !new RegExp(`(bump|setMax)\\("${s}"|stats\\.${s} =`).test(src);
    });
    ok(bad.length === 0, `${sp}: every objective's stat is tracked`, bad.map((m) => m.stat).join(","));
    const kills = list.filter((m) => m.stat.startsWith("kill:")).map((m) => m.stat.slice(5));
    ok(kills.every((k) => WILD[k]), `${sp}: kill objectives name real animals`);
  }
  const titles = SPECIES_ORDER.map((s) => MISSIONS[s].map((m) => m.title).join("|"));
  ok(new Set(titles).size === 6, "the six lists differ");
  // completing an objective through play
  const sim = mk("wolf");
  const p = place(sim, 110, 466, 0);
  for (let i = 0; i < 600 && !(sim.prompt && sim.prompt.kind === "drink"); i++) sim.step({ ...idle, mz: 1, camYaw: 0 }, DT);
  p.thirst = 50;
  sim.step({ ...idle, interact: true }, DT);
  steps(sim, 30);
  ok(sim.A.missions.includes("w02"), "drinking completes 'Fresh Water'");
  const ob = sim.objective();
  ok(ob && ob.id !== "w02", "the current objective moves on", ob?.title);
  ok(sim.events.some((e) => e.type === "mission"), "mission event fires (XP reward)");
}

/* ================================================================== world */
if (run("world")) {
  console.log("\n[world] day/night, weather");
  const sim = mk("wolf");
  place(sim);
  sim.time = 0.7;
  steps(sim, 60 * 60);
  ok(sim.time > 0.79 && sim.isNight(), "the clock reaches night", `t=${sim.time.toFixed(3)}`);
  // nocturnal spawns favoured at night
  sim.setWeather("rain");
  steps(sim, 60 * 20);
  ok(sim.weather.cur === "rain" && sim.weather.rain > 0.9, "weather blends into rain", `rain ${sim.weather.rain.toFixed(2)}`);
  sim.setWeather("storm");
  let bolts = 0;
  for (let i = 0; i < 60 * 60; i++) {
    sim.step(idle, DT);
    bolts += sim.events.filter((e) => e.type === "thunder").length;
    sim.events.length = 0;
  }
  ok(sim.weather.storm > 0.9 && bolts > 0, "storms bring lightning", `${bolts} bolts`);
  const visRain = sim.computeStealth();
  sim.setWeather("clear");
  steps(sim, 60 * 25);
  sim.time = 0.5;
  const visClear = sim.computeStealth();
  ok(visRain < visClear, "bad weather & night hide you better", `${visRain.toFixed(2)} vs ${visClear.toFixed(2)}`);
  // weather changes by itself
  const s2 = mk("fox");
  place(s2);
  const seen = new Set([s2.weather.cur]);
  for (let i = 0; i < 60 * 60 * 25; i++) {
    s2.step(idle, 1 / 20);
    seen.add(s2.weather.cur);
  }
  ok(seen.size >= 3, "weather cycles on its own", [...seen].join(","));
  // sleeping speeds up time
  const s3 = mk("bear");
  const p3 = place(s3);
  p3.combatT = 99;
  s3.time = 0.5;
  s3.step({ ...idle, rest: true }, DT);
  steps(s3, 600);
  ok(s3.time > 0.5 + (600 / 60 / 600) * 5, "resting fast-forwards the clock", `+${((s3.time - 0.5) * 24).toFixed(1)} h in 10 s`);
}

/* ================================================================== save */
if (run("save")) {
  console.log("\n[save] validation, per-animal progress");
  const store = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
  const save = newSave();
  const sim = new Sim({ species: "wolf", save, seed: 1, fresh: true });
  sim.addXp(500, "t");
  sim.A.owned.push("pines");
  sim.player.x += 10;
  sim.exportState();
  writeSave(store, save);
  const back = loadSave(store);
  ok(back.animals.wolf.level === save.animals.wolf.level && back.animals.wolf.owned.includes("pines"), "save → load keeps level & territories");
  ok(Math.abs(back.animals.wolf.pos.x - sim.player.x) < 0.01, "position is saved");
  ok(back.selected === "wolf", "selected animal is saved");
  // switching animals keeps the other's progress
  const sim2 = new Sim({ species: "eagle", save: back, seed: 2, fresh: true });
  sim2.addXp(50, "t");
  sim2.exportState();
  ok(back.animals.wolf.level === save.animals.wolf.level && back.animals.eagle.xp === 50, "switching to the eagle leaves the wolf untouched");
  // corrupt data
  const junk = validateSave({ v: 1, selected: "dragon", settings: { sens: "x", quality: "ultra" }, world: { time: 7, weather: "snow" }, animals: { wolf: { level: 99, xp: -5, up: { health: 50 }, owned: ["pines", "nope", "lionrock"], family: [{ role: "boss" }, { role: "cub", name: 5, growth: 3 }], pos: { x: 1e9, z: "a" } } } });
  ok(junk.selected === null && junk.settings.quality === "high" && junk.world.time === 1 && junk.world.weather === "clear", "bad settings/world fall back to defaults");
  const w = junk.animals.wolf;
  ok(w.level === 30 && w.xp === 0 && w.up.health === 10, "levels and upgrades are clamped");
  ok(w.owned.length === 1 && w.owned[0] === "pines", "unknown or unsuitable territories are dropped", w.owned.join(","));
  ok(w.family.length === 1 && w.family[0].growth === 1 && w.family[0].name === "Companion", "broken family entries are repaired");
  ok(w.pos === null, "an invalid position is discarded");
  ok(validateSave("garbage").v === 1 && validateSave(null).animals.fox.level === 1, "garbage → a fresh save");
  void SAVE_KEY;
}

/* ================================================================== balance */
if (run("balance")) {
  console.log("\n[balance] can each species hunt its signature prey? (stalk → sprint → attack bot)");
  const plans = [
    ["wolf", "deer", -330, 120],
    ["wolf", "rabbit", -60, 200],
    ["lion", "gazelle", 380, 60],
    ["lion", "zebra", 380, 60],
    ["tiger", "deer", -330, 120],
    ["bear", "deer", -330, 120],
    ["fox", "rabbit", -60, 200],
  ];
  for (const [sp, prey, x, z] of plans) {
    let wins = 0;
    const N = 8;
    let secs = 0;
    for (let seed = 1; seed <= N; seed++) {
      const sim = mk(sp, { seed });
      const spot = sim.findClearing(x + seed * 13, z - seed * 7, 4);
      const p = place(sim, spot.x, spot.z);
      const e = spawn(sim, prey, 0, 26);
      e.state = "graze";
      e.stateT = 999;
      sim.step({ ...idle, stalk: true }, DT);
      let t = 0;
      for (; t < 60 * 40 && !e.dead; t++) {
        const d = dist(p, e);
        const yaw = face(sim, e);
        const fleeing = e.state === "flee";
        const sprint = fleeing || d < 9;
        const reach = SPECIES[sp].size.r + SPECIES[sp].attacks.primary.range + e.r;
        const spec = (sp === "lion" && d < 14 && e.stun <= 0) || (sp === "tiger" && d < 18 && !fleeing);
        const sec = d < reach + 2 && d > reach * 0.7 && p.cd.secondary <= 0 && p.stamina > SPECIES[sp].attacks.secondary.cost;
        sim.step({ ...idle, mz: 1, camYaw: yaw, sprint, atk1: d < reach + 0.4 && t % 4 === 0, atk2: sec, special: spec && p.cd.special <= 0 }, DT);
        if (dist(p, e) > 120) break;
      }
      if (e.dead) {
        wins++;
        secs += t / 60;
      }
    }
    ok(wins >= N * 0.5, `${sp} vs ${prey}: hunts succeed ${wins}/${N}`, wins ? `avg ${(secs / wins).toFixed(1)} s` : "");
  }
  // eagle dive vs rabbit from a natural approach
  let ew = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const sim = mk("eagle", { seed });
    const p = place(sim, -60 + seed * 20, 200);
    sim.step({ ...idle, jump: true, up: true }, DT);
    steps(sim, 200, { ...idle, mz: 1, up: true, camYaw: 0, camPitch: 0 });
    const r = spawn(sim, "rabbit", Math.sin(p.yaw) * 45, Math.cos(p.yaw) * 45);
    r.state = "graze";
    r.stateT = 999;
    for (let t = 0; t < 60 * 15 && !r.dead; t++) {
      const h = dist(p, r);
      const yaw = face(sim, r);
      const want = -Math.atan2(p.y - r.y, h);
      sim.step({ ...idle, mz: 1, camYaw: yaw, camPitch: 0.25 - want / 1.25, special: h < 50 && !p.flight.dive && p.cd.special <= 0 && sim.agl() > 8, atk1: Math.hypot(h, p.y - r.y) < 2.5 }, DT);
    }
    if (r.dead) ew++;
  }
  ok(ew >= 3, `eagle vs rabbit (dive): ${ew}/6`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
