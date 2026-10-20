/**
 * Headless checks for Dinosaur Island 3D (no browser, no Three.js):
 *   node src/components/games/DinosaurIsland3D/tools/simTest.mjs [core|survival|dinos|campaign|fair|all]
 * `campaign` runs the bot through all five missions in god mode (route
 * check); `fair` runs it with real damage/hunger (it may respawn).
 */
import { Sim, LAYOUT, inCave, inLab, inStation } from "../sim.js";
import { height, freshWaterAt, SITES, LAKE } from "../terrain.js";
import { DINOS, MISSIONS, RECIPES } from "../data.js";
import { createBot } from "./bot.mjs";

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  ✗", msg);
  }
};
const run = (s, sec, inp = {}) => {
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) s.update(1 / 60, typeof inp === "function" ? inp(i) : inp);
};
const fresh = (seed = 7) => {
  const s = new Sim({ seed });
  // park every dino far away unless a test wants them
  for (const d of s.dinos) {
    d.x = 250;
    d.z = 250;
    d.home = { x: 250, z: 250, r: 5 };
  }
  return s;
};
const clearSpot = (s, x, z) => {
  for (const t of s.trees) if (Math.hypot(t.x - x, t.z - z) < 14) t.alive = false;
  for (const b of s.boulders) b.x += Math.hypot(b.x - x, b.z - z) < 14 ? 1000 : 0;
};

function core() {
  console.log("core: movement, jump, collision, camera-relative input");
  let s = fresh();
  const p0 = { ...s.player };
  run(s, 2, { mz: 1, camYaw: Math.PI });
  ok(s.player.z < p0.z - 8, `walking forward (yaw π) moves -z: dz=${(s.player.z - p0.z).toFixed(2)}`);
  ok(Math.abs(s.player.y - height(s.player.x, s.player.z)) < 0.05, "player stays on the ground");
  const walkD = p0.z - s.player.z;
  s = fresh();
  run(s, 2, { mz: 1, camYaw: Math.PI, sprint: true });
  ok(p0.z - s.player.z > walkD * 1.4, `sprint is faster (${(p0.z - s.player.z).toFixed(1)} vs ${walkD.toFixed(1)})`);
  ok(s.player.stamina < 70, `sprint drains stamina (${s.player.stamina.toFixed(0)})`);
  s = fresh();
  s.update(1 / 60, { crouch: true, camYaw: Math.PI });
  ok(s.player.crouch, "C toggles crouch");
  run(s, 2, { mz: 1, camYaw: Math.PI });
  ok(p0.z - s.player.z < walkD * 0.6, "crouch is slower");
  // strafing: mx>0 at yaw 0 (facing +z) goes to -x (right)
  s = fresh();
  const x0 = s.player.x;
  run(s, 1, { mx: 1, camYaw: 0 });
  ok(s.player.x < x0 - 2, `strafe right at yaw 0 moves -x (${(s.player.x - x0).toFixed(2)})`);
  // jump
  s = fresh();
  s.update(1 / 60, { jump: true, camYaw: 0 });
  let peak = 0;
  for (let i = 0; i < 90; i++) {
    s.update(1 / 60, {});
    peak = Math.max(peak, s.player.y - height(s.player.x, s.player.z));
  }
  ok(peak > 1.1 && peak < 1.8, `jump height ${peak.toFixed(2)}`);
  ok(s.player.onGround, "lands again");
  // tree collision
  s = fresh();
  const t = s.trees.find((t) => t.kind === "jungle" && height(t.x, t.z) > 3);
  s.player.x = t.x;
  s.player.z = t.z - 3;
  s.player.y = height(s.player.x, s.player.z);
  run(s, 2, { mz: 1, camYaw: 0 });
  const d = Math.hypot(s.player.x - t.x, s.player.z - t.z);
  ok(d > 0.7, `can't walk through a tree trunk (d=${d.toFixed(2)})`);
  // sea is blocked
  s = fresh();
  run(s, 12, { mz: 1, camYaw: 0 });
  ok(height(s.player.x, s.player.z) > -1.05, `can't walk into the deep sea (h=${height(s.player.x, s.player.z).toFixed(2)})`);
  // fence / lab walls
  s = fresh();
  Object.assign(s.player, { x: LAYOUT.lab.x - LAYOUT.lab.hx - 3, z: LAYOUT.lab.z - 3, y: height(LAYOUT.lab.x - 9, LAYOUT.lab.z - 3) });
  run(s, 3, { mz: 1, camYaw: Math.PI / 2 });
  ok(!inLab(s.player.x, s.player.z), "lab wall blocks (no door there)");
  Object.assign(s.player, { x: LAYOUT.lab.x - LAYOUT.lab.hx - 3, z: LAYOUT.lab.z });
  run(s, 2, { mz: 1, camYaw: Math.PI / 2 });
  ok(inLab(s.player.x, s.player.z), "lab door lets you in");
  // cave ring has an opening facing +z
  s = fresh();
  const cv = LAYOUT.cave;
  Object.assign(s.player, { x: cv.x, z: cv.z + cv.r + 5 });
  s.player.y = height(s.player.x, s.player.z);
  run(s, 4, { mz: 1, camYaw: Math.PI });
  ok(inCave(s.player.x, s.player.z), "walk into the cave through its mouth");
  Object.assign(s.player, { x: cv.x + cv.r + 4, z: cv.z - 2 });
  run(s, 4, { mz: 1, camYaw: -Math.PI / 2 });
  ok(!inCave(s.player.x, s.player.z), "cave wall blocks from the side");
  // steep slopes are slower but walkable
  s = fresh();
  Object.assign(s.player, { x: 15, z: -80 });
  s.player.y = height(15, -80);
  const y0 = s.player.y;
  run(s, 6, { mz: 1, camYaw: Math.PI });
  ok(s.player.y > y0 + 4, `climbs the mountain slope (${(s.player.y - y0).toFixed(1)}m)`);
  // world features
  ok(freshWaterAt(LAKE.x, LAKE.z) !== null, "lake has fresh water");
  ok(freshWaterAt(-128, 52) !== null, "river has fresh water");
  ok(freshWaterAt(0, 150) === null, "no fresh water in the jungle");
  for (const c of new Sim().crates) ok(height(c.x, c.z) > 0.8, `crate at ${c.x},${c.z} is on dry sand`);
  ok(inStation(SITES.station.x, SITES.station.z) && height(SITES.station.x, SITES.station.z) > 5, "station plateau");
}

function survival() {
  console.log("survival: gathering, inventory, crafting, tools, stats, death");
  let s = fresh();
  const stick = s.pickups.find((o) => o.kind === "stick" && Math.hypot(o.x - s.player.x, o.z - s.player.z) < 45);
  Object.assign(s.player, { x: stick.x, z: stick.z + 1.2, y: height(stick.x, stick.z + 1.2) });
  s.update(1 / 60, { camYaw: Math.PI });
  ok(s.focus && s.focus.kind === "pickup", `focus on branches (${s.focus?.kind})`);
  s.update(1 / 60, { interact: true, camYaw: Math.PI });
  ok(s.inv.wood === 1 && stick.taken, "E picks up branches → +1 wood");
  // crate
  const c = s.crates[0];
  Object.assign(s.player, { x: c.x, z: c.z + 1.5 });
  s.update(1 / 60, { camYaw: Math.PI });
  s.update(1 / 60, { interact: true, camYaw: Math.PI });
  ok(c.opened && s.inv.bandage === 1 && s.inv.berries === 2, "crate gives its loot");
  // bush
  const b = s.bushes[0];
  Object.assign(s.player, { x: b.x, z: b.z + 1.3 });
  s.update(1 / 60, { camYaw: Math.PI });
  s.update(1 / 60, { interact: true, camYaw: Math.PI });
  ok(!b.ripe && s.inv.berries === 4, "bush gives 2 berries");
  // eat / drink / heal
  s.player.hunger = 50;
  s.update(1 / 60, { eat: true });
  ok(s.player.hunger > 64 && s.inv.berries === 3, "Q eats berries");
  s.player.hp = 40;
  s.update(1 / 60, { heal: true });
  ok(s.player.hp > 74 && s.inv.bandage === 0, "F applies a bandage");
  s.update(1 / 60, { drink: true });
  ok(s.events.some((e) => e.type === "toast" && /No water/.test(e.text)), "R without water warns");
  // water at the lake
  Object.assign(s.player, { x: LAKE.x, z: LAKE.z + LAKE.r - 1.5 });
  s.player.y = height(s.player.x, s.player.z);
  s.player.thirst = 30;
  s.update(1 / 60, { camYaw: Math.PI });
  ok(s.focus && s.focus.kind === "water", `focus water at the shore (${s.focus?.kind})`);
  s.update(1 / 60, { interact: true, camYaw: Math.PI });
  ok(s.player.thirst > 99 && s.inv.water === 1, "E at water: drink + fill a flask");
  s.player.thirst = 40;
  s.update(1 / 60, { drink: true });
  ok(s.player.thirst > 70 && s.inv.water === 0, "R drinks a flask");
  // crafting
  s = fresh();
  ok(!s.craft("axe"), "can't craft an axe without materials");
  s.inv.wood = 3;
  s.inv.stone = 2;
  ok(s.craft("axe") && s.tools.axe && s.inv.wood === 0 && s.equipped === "axe", "craft axe consumes materials & equips");
  s.inv.wood = 4;
  s.inv.stone = 1;
  ok(s.craft("spear") && s.tools.spear, "craft spear");
  s.inv.wood = 5;
  s.inv.stone = 3;
  ok(s.craft("campfire") && s.campfires.length === 1, "craft & place a campfire");
  ok(s.respawnAt.fire, "campfire becomes the respawn point");
  // chop: hands vs axe
  const chopCount = (tool) => {
    const s2 = fresh();
    s2.tools.axe = true;
    s2.equipped = tool;
    const t = s2.trees.find((t) => t.kind === "jungle" && height(t.x, t.z) > 3);
    const a = 0.3;
    Object.assign(s2.player, { x: t.x + Math.sin(a) * 1.6, z: t.z + Math.cos(a) * 1.6 });
    s2.player.y = height(s2.player.x, s2.player.z);
    const yaw = Math.atan2(t.x - s2.player.x, t.z - s2.player.z);
    let swings = 0;
    for (let i = 0; i < 3000 && s2.inv.wood < 3; i++) {
      s2.player.stamina = 100;
      const before = s2.events.length;
      s2.update(1 / 60, { attack: true, camYaw: yaw });
      if (s2.events.slice(before).some((e) => e.type === "swing")) swings++;
    }
    return { swings, felled: !t.alive, wood: s2.inv.wood };
  };
  const hand = chopCount("hands");
  const axe = chopCount("axe");
  ok(hand.wood === 3 && axe.wood === 3, `both gather wood (${hand.wood}, ${axe.wood})`);
  ok(axe.swings * 2 < hand.swings, `axe chops much faster (${axe.swings} vs ${hand.swings} swings)`);
  ok(axe.felled, "tree falls after its wood is taken");
  // boulder needs an axe
  s = fresh();
  const bo = s.boulders.find((b) => height(b.x, b.z) > 2 && b.s < 1.6);
  const place = () => {
    Object.assign(s.player, { x: bo.x, z: bo.z + bo.s * 0.95 + 1.0 });
    s.player.y = height(s.player.x, s.player.z);
  };
  place();
  for (let i = 0; i < 120; i++) s.update(1 / 60, { attack: true, camYaw: Math.PI });
  ok(s.inv.stone === 0, "hands can't break boulders");
  s.tools.axe = true;
  s.equipped = "axe";
  place();
  for (let i = 0; i < 240; i++) {
    s.player.stamina = 100;
    s.update(1 / 60, { attack: true, camYaw: Math.PI });
  }
  ok(s.inv.stone >= 2, `axe mines stone from boulders (${s.inv.stone})`);
  // hunger / thirst → death
  s = fresh();
  run(s, 60, {});
  ok(s.player.hunger < 90 && s.player.thirst < 87, `hunger ${s.player.hunger.toFixed(0)} / thirst ${s.player.thirst.toFixed(0)} drop over time`);
  s.player.thirst = 0;
  s.player.hunger = 0;
  run(s, 40, {});
  ok(s.player.dead && s.events.some((e) => e.type === "death"), "starving & thirst kill you");
  s.respawn();
  ok(!s.player.dead && s.player.hp > 50 && s.player.hunger >= 55, "respawn restores the survivor");
  // campfire heals and rest skips the night
  s = fresh();
  s.inv.wood = 5;
  s.inv.stone = 3;
  Object.assign(s.player, { x: 0, z: 120 });
  s.player.y = height(0, 120);
  clearSpot(s, 0, 120);
  ok(s.craft("campfire"), "campfire placed in the jungle");
  s.player.hp = 50;
  run(s, 5, {});
  ok(s.player.hp > 58, `campfire heals (${s.player.hp.toFixed(1)})`);
  s.clock = 0.9;
  const f = s.campfires[0];
  Object.assign(s.player, { x: f.x, z: f.z + 1.5 });
  s.update(1 / 60, { camYaw: Math.PI });
  ok(s.focus?.kind === "fire", "campfire is interactable");
  s.update(1 / 60, { interact: true, camYaw: Math.PI });
  ok(s.clock > 0.25 && s.clock < 0.3 && s.day === 2, `resting at night skips to dawn (clock ${s.clock.toFixed(2)}, day ${s.day})`);
}

function dinos() {
  console.log("dinos: detection, chase, attack, damage, death, safety");
  const setup = (kind, dz = 14, seed = 7) => {
    const s = fresh(seed);
    const d = s.dinos.find((d) => d.kind === kind);
    const px = 0;
    const pz = 120;
    clearSpot(s, px, pz);
    Object.assign(s.player, { x: px, z: pz, y: height(px, pz) });
    Object.assign(d, { x: px, z: pz - dz, yaw: 0, state: "idle", t: 5, home: { x: px, z: pz - dz, r: 10 } });
    d.y = height(d.x, d.z);
    s.player.invuln = 0;
    return { s, d };
  };
  // raptor notices a standing player in front of it at 14m and chases
  let { s, d } = setup("raptor", 14);
  run(s, 1.5, { camYaw: Math.PI });
  ok(["alert", "chase", "attack", "recover"].includes(d.state), `raptor detects you (${d.state})`);
  ok(s.events.some((e) => e.type === "dinoCall" && e.call === "screech"), "raptor screeches when it spots you");
  run(s, 4, { camYaw: Math.PI });
  ok(s.player.hp < 100, `raptor attack damages you (hp ${s.player.hp.toFixed(0)})`);
  // crouching halves the range
  ({ s, d } = setup("raptor", 14));
  s.update(1 / 60, { crouch: true });
  run(s, 3, {});
  ok(d.state === "idle" || d.state === "roam", `crouching at 14m stays hidden (${d.state})`);
  // sprinting raises it
  ({ s, d } = setup("raptor", 26));
  run(s, 1, { mz: 1, mx: 0, camYaw: Math.PI / 2, sprint: true });
  ok(d.state !== "idle" && d.state !== "roam", `sprinting at 26m gets noticed (${d.state})`);
  // spear kills a raptor in two hits
  ({ s, d } = setup("raptor", 3.2));
  s.tools.spear = true;
  s.equipped = "spear";
  d.state = "chase";
  let hits = 0;
  for (let i = 0; i < 300 && d.alive; i++) {
    s.player.hp = 100;
    const before = s.events.length;
    s.update(1 / 60, { attack: true, camYaw: Math.atan2(d.x - s.player.x, d.z - s.player.z) });
    hits += s.events.slice(before).filter((e) => e.type === "dinoHit").length;
  }
  ok(!d.alive && hits <= 3, `spear kills a raptor (${hits} hits)`);
  ok(s.tally.raptors === 1, "kill is tallied");
  run(s, 26, {});
  ok(d.gone, "carcass despawns");
  // T-Rex: big range, heavy bite
  ({ s, d } = setup("trex", 34));
  run(s, 2.5, { camYaw: Math.PI });
  ok(d.state !== "idle" && d.state !== "roam", `T-Rex notices you at 34m (${d.state})`);
  ok(s.events.some((e) => e.call === "roar"), "T-Rex roars");
  let minHp = 100;
  for (let i = 0; i < 60 * 12; i++) {
    s.update(1 / 60, {});
    minHp = Math.min(minHp, s.player.hp);
    if (s.player.dead) break;
  }
  ok(minHp <= 100 - DINOS.trex.dmg + 1, `T-Rex bite hurts (${minHp.toFixed(0)})`);
  // outrun the T-Rex by sprinting? it's slower than a sprint
  ok(DINOS.trex.run < 9.4 && DINOS.raptor.run < 9.4 && DINOS.raptor.run > 5.4, "sprint outruns predators, walking doesn't outrun raptors");
  // campfire keeps predators away
  ({ s, d } = setup("raptor", 14));
  s.inv.wood = 5;
  s.inv.stone = 3;
  s.craft("campfire");
  const f = s.campfires[0];
  Object.assign(s.player, { x: f.x + 1.5, z: f.z });
  d.state = "chase";
  let closest = 99;
  for (let i = 0; i < 600; i++) {
    s.update(1 / 60, {});
    closest = Math.min(closest, Math.hypot(d.x - f.x, d.z - f.z));
  }
  ok(closest > 9 && s.player.hp === 100, `raptor won't enter the campfire circle (closest ${closest.toFixed(1)})`);
  // T-Rex can't follow you into the cave
  ({ s, d } = setup("trex", 20));
  const cv = LAYOUT.cave;
  Object.assign(s.player, { x: cv.x, z: cv.z - 2 });
  s.player.y = height(s.player.x, s.player.z);
  Object.assign(d, { x: cv.x, z: cv.z + cv.r + 14, state: "chase" });
  for (let i = 0; i < 600; i++) s.update(1 / 60, {});
  ok(Math.hypot(d.x - cv.x, d.z - cv.z) > cv.r + 1 && s.player.hp === 100, "T-Rex can't reach you inside the cave");
  // herbivore flees when hit and drops meat
  ({ s, d } = setup("herb", 2.6));
  s.tools.spear = true;
  s.equipped = "spear";
  s.update(1 / 60, { attack: true, camYaw: Math.PI });
  for (let i = 0; i < 40; i++) s.update(1 / 60, { camYaw: Math.PI });
  ok(d.state === "flee", `herbivore flees (${d.state})`);
  d.hp = 1;
  Object.assign(d, { x: s.player.x, z: s.player.z - 2.6, state: "idle", t: 9 });
  for (let i = 0; i < 60; i++) s.update(1 / 60, { attack: true, camYaw: Math.PI });
  ok(!d.alive && s.inv.meat === 2, `herbivore gives meat (${s.inv.meat})`);
  // raptors give up past their leash
  ({ s, d } = setup("raptor", 10));
  d.state = "chase";
  for (let i = 0; i < 60 * 30; i++) {
    s.player.stamina = 100;
    s.player.hp = 100;
    s.update(1 / 60, { mz: 1, camYaw: 0, sprint: true });
  }
  ok(d.state === "return" || d.state === "idle" || d.state === "roam", `raptor gives up the chase (${d.state})`);
  // death by dino → respawn at campfire
  ({ s, d } = setup("trex", 6));
  s.player.hp = 10;
  d.state = "chase";
  run(s, 6, {});
  ok(s.player.dead && s.deathCause === "trex", "a T-Rex can kill you");
  s.respawn();
  ok(!s.player.dead, "respawn after death");
  // performance
  s = new Sim({ seed: 3 });
  const t0 = performance.now();
  run(s, 30, (i) => ({ mz: 1, camYaw: (i / 300) % 6.28 }));
  const ms = (performance.now() - t0) / 1800;
  ok(ms < 1.5, `sim step cost ${ms.toFixed(3)} ms/frame`);
}

function campaign(god = true, seed = 7) {
  console.log(`campaign (${god ? "god-mode route check" : "fair"}, seed ${seed})`);
  const s = new Sim({ seed });
  const logs = [];
  const bot = createBot(s, { god, log: (m) => logs.push(m) });
  const seen = [];
  let frames = 0;
  while (!s.won && frames < 60 * 60 * 40) {
    s.update(1 / 60, bot.step(1 / 60));
    for (const e of s.events) if (e.type === "mission") seen.push(`${e.mission + 1}@${s.time.toFixed(0)}s`);
    s.events.length = 0;
    frames++;
    if (bot.done && !s.won) break;
  }
  if (!s.won || process.argv.includes("--verbose")) console.log(logs.join("\n"));
  console.log(`  missions: ${seen.join(" ")} · deaths ${s.tally.deaths} · kills ${s.tally.kills} · day ${s.day}`);
  ok(s.won, `bot completes all ${MISSIONS.length} missions (stuck at mission ${s.mission + 1}: ${JSON.stringify(s.objectiveState().map((o) => [o.id, o.count, o.n]))})`);
}

const which = process.argv[2] || "all";
if (which === "core" || which === "all") core();
if (which === "survival" || which === "all") survival();
if (which === "dinos" || which === "all") dinos();
if (which === "campaign" || which === "all") {
  campaign(true, 7);
  campaign(true, 12345);
}
if (which === "fair") for (const seed of [7, 99, 2024]) campaign(false, seed);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
