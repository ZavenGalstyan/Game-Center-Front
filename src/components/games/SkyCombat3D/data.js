/**
 * Sky Combat 3D — static game data: aircraft, enemy/ground unit stats,
 * upgrades, worlds and the 15 missions. Everything here is plain data the
 * simulation (sim.js) interprets; nothing renders.
 *
 * Mission stages run in order. Each stage has one goal:
 *   destroy {tag, count}        – kill that many entities carrying `tag`
 *   reach {at:[x,y,z], r}       – fly into the marked sphere
 *   checkpoints {points, r, ceiling?} – fly through rings in order (optional radar ceiling)
 *   survive {time}              – stay alive for `time` seconds
 *   escort {tag, dest:[x,z], r} – a tagged friendly must reach the destination
 *   kills {count}               – enemy aircraft shot down by anyone on your side
 * plus optional `spawn` (on stage start), `waves` [{t, spawn}] and
 * `keep` {kinds, active, total, ring} (top up enemies around the player).
 * Mission-level `fails`: protect {tag, min} · leak {tag, dest, r} (enemy got through).
 */
import { PADS, VALLEY, heightAt } from "./terrain.js";

export const SAVE_KEY = "sky-combat-3d-progress";

/* ------------------------------------------------------------------ player jets */
export const JETS = {
  falcon: {
    id: "falcon", name: "Falcon F1", role: "Multirole fighter", desc: "Balanced speed and armor. Reliable in any fight.",
    maxSpeed: 265, minSpeed: 78, stallSpeed: 70, accel: 0.9,
    pitchRate: 1.3, rollRate: 2.9, yawRate: 0.42,
    hp: 100, gunAmmo: 700, gunDamage: 7, gunRate: 16, missiles: 8, missileDamage: 120, lockTime: 1.2,
    bombs: 4, flares: 10,
    unlock: { mission: 0, cost: 0 },
    look: { body: 0x8d99a6, accent: 0x3d4a58, stripe: 0x5fd6ff, tails: 1, engines: 1, canards: false, sweep: 0.42, span: 10, length: 15 },
  },
  viper: {
    id: "viper", name: "Viper X", role: "Air superiority", desc: "Fast and agile. Lighter armor, quicker missile lock.",
    maxSpeed: 305, minSpeed: 82, stallSpeed: 72, accel: 1.15,
    pitchRate: 1.58, rollRate: 3.7, yawRate: 0.52,
    hp: 85, gunAmmo: 600, gunDamage: 6.5, gunRate: 20, missiles: 8, missileDamage: 115, lockTime: 0.85,
    bombs: 2, flares: 12,
    unlock: { mission: 5, cost: 2600 },
    look: { body: 0x2a3550, accent: 0x161d2e, stripe: 0x37e0ff, tails: 2, engines: 2, canards: true, sweep: 0.6, span: 11, length: 16.5 },
  },
  thunder: {
    id: "thunder", name: "Thunder S", role: "Heavy strike fighter", desc: "Heavy weapons and strong armor. Carries a huge payload.",
    maxSpeed: 248, minSpeed: 76, stallSpeed: 68, accel: 0.78,
    pitchRate: 1.12, rollRate: 2.35, yawRate: 0.38,
    hp: 150, gunAmmo: 950, gunDamage: 9, gunRate: 14, missiles: 10, missileDamage: 150, lockTime: 1.3,
    bombs: 8, flares: 10,
    unlock: { mission: 10, cost: 5200 },
    look: { body: 0x5d6650, accent: 0x343a2c, stripe: 0xffb347, tails: 2, engines: 2, canards: false, sweep: 0.38, span: 13, length: 18.5 },
  },
};
export const JET_ORDER = ["falcon", "viper", "thunder"];

/* ------------------------------------------------------------------ upgrades */
export const UPGRADES = {
  engine: { name: "Engine", desc: "+5% top speed and acceleration per level", cost: [250, 500, 800, 1200, 1800] },
  maneuver: { name: "Maneuverability", desc: "+6% pitch, roll and yaw rate per level", cost: [250, 500, 800, 1200, 1800] },
  armor: { name: "Armor", desc: "+10% hull strength per level", cost: [300, 550, 850, 1250, 1850] },
  gun: { name: "Gun Damage", desc: "+12% machine-gun damage per level", cost: [250, 500, 800, 1200, 1800] },
  missile: { name: "Missile Capacity", desc: "+1 guided missile per level", cost: [350, 650, 950, 1350, 1900] },
  flares: { name: "Countermeasures", desc: "+2 flare charges per level", cost: [200, 400, 650, 950, 1400] },
};
export const UPGRADE_ORDER = ["engine", "maneuver", "armor", "gun", "missile", "flares"];
export const MAX_UPGRADE = 5;

/** Final stats of a jet after upgrades (+ mission loadout bonus). */
export function jetStats(jetId, up = {}, bonus = {}) {
  const j = JETS[jetId] || JETS.falcon;
  const L = (k) => Math.max(0, Math.min(MAX_UPGRADE, up[k] | 0));
  const eng = 1 + 0.05 * L("engine");
  const man = 1 + 0.06 * L("maneuver");
  return {
    ...j,
    maxSpeed: j.maxSpeed * eng,
    accel: j.accel * eng,
    pitchRate: j.pitchRate * man,
    rollRate: j.rollRate * man,
    yawRate: j.yawRate * man,
    hp: Math.round(j.hp * (1 + 0.1 * L("armor"))),
    gunDamage: j.gunDamage * (1 + 0.12 * L("gun")),
    missiles: j.missiles + L("missile") + (bonus.missiles || 0),
    bombs: j.bombs + (bonus.bombs || 0),
    flares: j.flares + 2 * L("flares"),
  };
}

/* ------------------------------------------------------------------ enemy / friendly aircraft */
// speed m/s · turn rad/s · acc 0..1 (gun accuracy) · aggr 0..1 · gunDmg per hit
export const AIR = {
  scout: { name: "Scout", hp: 45, speed: 205, turn: 0.72, acc: 0.3, aggr: 0.45, gunDmg: 1.5, missiles: 0, flares: 0, radius: 7, look: "light" },
  raider: { name: "Raider", hp: 75, speed: 222, turn: 0.78, acc: 0.45, aggr: 0.6, gunDmg: 1.9, missiles: 1, flares: 0, radius: 7.5, look: "fighter" },
  interceptor: { name: "Interceptor", hp: 95, speed: 250, turn: 0.88, acc: 0.55, aggr: 0.85, gunDmg: 2.2, missiles: 2, flares: 1, radius: 8, look: "heavy" },
  elite: { name: "Black Wolf", hp: 150, speed: 262, turn: 1.0, acc: 0.68, aggr: 0.92, gunDmg: 2.5, missiles: 2, flares: 4, radius: 8, look: "elite" },
  leader: { name: "Wolf Leader", hp: 320, speed: 268, turn: 1.04, acc: 0.72, aggr: 0.95, gunDmg: 2.7, missiles: 4, flares: 6, radius: 8.5, look: "elite" },
  ace: { name: "Red Scythe", hp: 1100, speed: 280, turn: 1.15, acc: 0.78, aggr: 1, gunDmg: 2.9, missiles: 99, flares: 99, radius: 9, look: "ace", boss: true },
  bomber: { name: "Bomber", hp: 260, speed: 132, turn: 0.4, acc: 0.4, aggr: 0, gunDmg: 1.6, missiles: 0, flares: 0, radius: 16, look: "bomber", role: "bomber" },
  torpedo: { name: "Torpedo Bomber", hp: 110, speed: 168, turn: 0.7, acc: 0.3, aggr: 0, gunDmg: 1.2, missiles: 0, flares: 0, radius: 10, look: "attacker", role: "torpedo" },
  // friendly
  cargo: { name: "Atlas Cargo", hp: 200, speed: 106, turn: 0.35, radius: 18, look: "cargo", role: "path", friend: true },
  gunship: { name: "Hornet Gunship", hp: 240, speed: 135, turn: 0.55, radius: 12, look: "gunship", role: "gunship", friend: true },
  wingman: { name: "Wingman", hp: 170, speed: 235, turn: 1.05, acc: 0.42, aggr: 0.7, gunDmg: 4, missiles: 2, radius: 7.5, look: "wingman", role: "fighter", friend: true },
};

/* ------------------------------------------------------------------ ground units */
// armor = machine-gun damage multiplier · weapon: aa (flak gun) / sam (missile site)
export const GROUND = {
  radar: { name: "Radar Station", hp: 160, radius: 20, armor: 0.55, look: "radar" },
  sam: { name: "SAM Site", hp: 120, radius: 14, armor: 0.5, look: "sam", weapon: "sam" },
  aa: { name: "AA Gun", hp: 70, radius: 9, armor: 0.7, look: "aa", weapon: "aa" },
  hangar: { name: "Hangar", hp: 240, radius: 30, armor: 0.3, look: "hangar" },
  fuel: { name: "Fuel Depot", hp: 90, radius: 15, armor: 0.9, look: "fuel" },
  tower: { name: "Control Tower", hp: 150, radius: 12, armor: 0.4, look: "tower" },
  tank: { name: "Tank", hp: 80, radius: 8, armor: 0.45, look: "tank" },
  truck: { name: "Supply Truck", hp: 40, radius: 7, armor: 1, look: "truck" },
  bunker: { name: "Bunker", hp: 220, radius: 17, armor: 0.32, look: "bunker" },
  artillery: { name: "Artillery", hp: 90, radius: 10, armor: 0.6, look: "artillery" },
  boat: { name: "Patrol Boat", hp: 120, radius: 15, armor: 0.7, look: "boat", weapon: "aa", naval: true },
  frigate: { name: "Frigate", hp: 380, radius: 40, armor: 0.32, look: "frigate", weapon: "aa", sam: true, naval: true },
  destroyer: { name: "Destroyer", hp: 720, radius: 58, armor: 0.25, look: "destroyer", weapon: "aa", sam: true, naval: true },
  freighter: { name: "Allied Freighter", hp: 420, radius: 46, armor: 0.4, look: "freighter", naval: true, friend: true, weapon: "aa" },
};

/* ------------------------------------------------------------------ worlds */
export const WORLDS = {
  desert: {
    id: "desert", name: "Desert Warzone", short: "World 1",
    sky: { top: 0x1d5fc0, horizon: 0xd9dfe6, ground: 0xc9a77a }, fog: 0xd8d2c6, fogFar: 12500,
    sun: { dir: [0.45, 0.62, -0.3], color: 0xfff1d6, intensity: 3.1 }, hemi: [0xbfd8ff, 0x9b7a50, 1.15],
    water: 0x2a7f8f, cloud: 0.32,
  },
  mountain: {
    id: "mountain", name: "Mountain Front", short: "World 2",
    sky: { top: 0x1c56b4, horizon: 0xcfe0ef, ground: 0x7a8a92 }, fog: 0xc6d6e4, fogFar: 11500,
    sun: { dir: [-0.35, 0.55, -0.5], color: 0xfff6ea, intensity: 2.9 }, hemi: [0xcfe2ff, 0x5d6b5a, 1.2],
    water: 0x2f5f7a, cloud: 0.55,
  },
  ocean: {
    id: "ocean", name: "Ocean Conflict", short: "World 3",
    sky: { top: 0x1654b8, horizon: 0xc2e2f4, ground: 0x2a5d7a }, fog: 0xb7d6ea, fogFar: 13000,
    sun: { dir: [0.25, 0.42, 0.55], color: 0xffe6c4, intensity: 3.0 }, hemi: [0xc8e4ff, 0x31526a, 1.15],
    water: 0x1a5f8c, cloud: 0.45,
  },
};

/* ------------------------------------------------------------------ helpers for missions */
const P = (w, k) => PADS[w][k];
/** Absolute altitude `agl` metres above the terrain at x,z. */
const alt = (w, x, z, agl) => Math.max(0, heightAt(w, x, z)) + agl;
const ring = (cx, cz, r, n, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(a0 + (i / n) * Math.PI * 2) * r, cz + Math.sin(a0 + (i / n) * Math.PI * 2) * r]);
const valleyPts = (agl) => VALLEY.map(([x, z]) => [x, alt("mountain", x, z, agl), z]);

/* ------------------------------------------------------------------ missions */
const d = PADS.desert;
const m = PADS.mountain;
const o = PADS.ocean;

export const MISSIONS = [
  /* ============================ WORLD 1 — DESERT WARZONE */
  {
    id: 1, world: "desert", title: "First Contact", tag: "Air patrol",
    brief: "Enemy scouts are probing our airspace over the dunes. Find the patrol, shoot it down, then return to base.",
    start: { at: [-2600, 900, 2200], heading: [1, 0, -1] },
    reward: 450,
    stages: [
      {
        type: "destroy", tag: "patrol", count: 4, label: "Destroy the enemy patrol",
        say: [["AWACS", "Four bandits patrolling near the oasis ridge. Weapons free."]],
        spawn: [{ air: "scout", at: [-300, 800, 300], count: 4, spread: 260, tag: "patrol", patrol: ring(-300, 300, 1400, 5) }],
      },
      { type: "reach", at: [d.homeBase.x, 500, d.homeBase.z], r: 700, label: "Return to Home Base", say: [["AWACS", "Patrol eliminated. Return to base."]] },
    ],
  },
  {
    id: 2, world: "desert", title: "Guardian Angel", tag: "Protect friendly aircraft",
    brief: "An Atlas cargo plane is carrying critical supplies home. Stay close — enemy fighters will try to bring it down.",
    start: { at: [3000, 1000, 2700], heading: [-0.6, 0, -1] },
    reward: 650,
    fails: [{ type: "protect", tag: "cargo", min: 1, label: "Atlas cargo must survive" }],
    stages: [
      {
        type: "escort", tag: "cargo", dest: [d.homeBase.x, d.homeBase.z], r: 700, label: "Escort the Atlas cargo plane home",
        say: [["ATLAS", "Atlas 1 here. Glad to have you on our wing, Falcon."]],
        spawn: [{ air: "cargo", side: "friend", at: [3200, 900, 2400], tag: "cargo", path: [[1200, 900, -600], [-1400, 900, -400], [-2400, 800, 1800], [d.homeBase.x, 500, d.homeBase.z]] }],
        waves: [
          { t: 8, say: [["AWACS", "Three scouts inbound from the north — they're going for Atlas!"]], spawn: [{ air: "scout", at: [600, 1000, -3200], count: 3, spread: 300, targetTag: "cargo" }] },
          { t: 42, say: [["AWACS", "Raiders closing from the east."]], spawn: [{ air: "raider", at: [4200, 1100, -1600], count: 3, spread: 300, targetTag: "cargo" }] },
          { t: 74, say: [["ATLAS", "More contacts! Keep them off us!"]], spawn: [{ air: "raider", at: [-3600, 1200, -2600], count: 2, spread: 300, targetTag: "cargo" }, { air: "interceptor", at: [-3200, 1300, -3000], targetTag: "cargo" }] },
        ],
      },
    ],
  },
  {
    id: 3, world: "desert", title: "Blind the Eye", tag: "Ground strike",
    brief: "Three radar stations on the mesas guide enemy fighters. Destroy all three. They are defended by AA guns — use bombs or missiles.",
    start: { at: [-3200, 1100, 1600], heading: [1, 0, -0.7] },
    reward: 750,
    stages: [
      {
        type: "destroy", tag: "radar", count: 3, label: "Destroy the radar stations",
        say: [["AWACS", "Radar sites marked. Watch the flak — come in fast and bomb from altitude."]],
        spawn: [
          { ground: "radar", at: [d.radarA.x, d.radarA.z], tag: "radar" },
          { ground: "radar", at: [d.radarB.x, d.radarB.z], tag: "radar" },
          { ground: "radar", at: [d.radarC.x, d.radarC.z], tag: "radar" },
          { ground: "aa", at: [d.radarA.x + 90, d.radarA.z + 40] }, { ground: "aa", at: [d.radarA.x - 80, d.radarA.z - 70] },
          { ground: "aa", at: [d.radarB.x + 70, d.radarB.z - 90] }, { ground: "aa", at: [d.radarB.x - 100, d.radarB.z + 50] },
          { ground: "aa", at: [d.radarC.x + 90, d.radarC.z + 70] },
          { ground: "truck", at: [d.radarB.x + 30, d.radarB.z + 120] },
          { air: "raider", at: [400, 1000, -1800], count: 2, spread: 200, patrol: ring(300, -1500, 1600, 4) },
        ],
      },
    ],
  },
  {
    id: 4, world: "desert", title: "Sandstorm Ambush", tag: "Survival",
    brief: "Your flight was ambushed inside a sandstorm. Visibility is poor and the enemy keeps coming. Survive until reinforcements arrive.",
    start: { at: [0, 1200, 1500], heading: [0, 0, -1] },
    reward: 800, weather: "sandstorm",
    stages: [
      {
        type: "survive", time: 120, label: "Survive the ambush",
        say: [["AWACS", "Multiple contacts on all sides! Hold on for two minutes, help is coming."]],
        spawn: [{ air: "raider", ring: 2600, count: 3 }],
        keep: { kinds: ["scout", "raider", "raider", "interceptor"], active: 4, total: 11, ring: 3000 },
      },
    ],
  },
  {
    id: 5, world: "desert", title: "Hammerfall", tag: "Airbase strike",
    brief: "Strike the enemy airbase. Knock out its air defences first, then flatten the hangars and fuel depots before their interceptors get airborne.",
    start: { at: [-1200, 1300, 600], heading: [1, 0, -1] },
    reward: 1200, unlock: "viper", loadout: { bombs: 2 },
    stages: [
      {
        type: "destroy", tag: "defense", count: 4, label: "Destroy the base air defences",
        say: [["AWACS", "Two SAM sites and two flak guns guard the base. Expect missile locks — use flares!"]],
        spawn: [
          { ground: "sam", at: [d.enemyBase.x - 380, d.enemyBase.z + 260], tag: "defense" },
          { ground: "sam", at: [d.enemyBase.x + 360, d.enemyBase.z - 320], tag: "defense" },
          { ground: "aa", at: [d.enemyBase.x - 120, d.enemyBase.z + 380], tag: "defense" },
          { ground: "aa", at: [d.enemyBase.x + 260, d.enemyBase.z + 180], tag: "defense" },
          { ground: "hangar", at: [d.enemyBase.x - 200, d.enemyBase.z - 200], yaw: 0.5, tag: "base" },
          { ground: "hangar", at: [d.enemyBase.x - 40, d.enemyBase.z - 300], yaw: 0.5, tag: "base" },
          { ground: "hangar", at: [d.enemyBase.x + 120, d.enemyBase.z - 400], yaw: 0.5, tag: "base" },
          { ground: "fuel", at: [d.enemyBase.x + 260, d.enemyBase.z + 20], tag: "base" },
          { ground: "fuel", at: [d.enemyBase.x + 310, d.enemyBase.z - 40], tag: "base" },
          { ground: "fuel", at: [d.enemyBase.x + 220, d.enemyBase.z - 80], tag: "base" },
          { ground: "tower", at: [d.enemyBase.x + 40, d.enemyBase.z + 120] },
          { ground: "tank", at: [d.enemyBase.x - 300, d.enemyBase.z + 60], count: 2, spread: 40 },
        ],
      },
      {
        type: "destroy", tag: "base", count: 6, label: "Destroy hangars and fuel depots",
        say: [["AWACS", "Defences down! Interceptors are scrambling from the runway — hit the hangars!"]],
        spawn: [{ air: "interceptor", at: [d.enemyBase.x - 200, d.enemyBase.h + 60, d.enemyBase.z + 300], count: 2, spread: 80, scramble: true }],
        waves: [{ t: 45, spawn: [{ air: "raider", at: [4600, 1200, -5000], count: 2, spread: 200 }] }],
      },
    ],
  },

  /* ============================ WORLD 2 — MOUNTAIN FRONT */
  {
    id: 6, world: "mountain", title: "Intercept", tag: "Intercept bombers",
    brief: "A bomber formation is heading for our mountain base under fighter escort. Shoot down all three bombers before they arrive.",
    start: { at: [-3000, 1700, 2600], heading: [1, 0, -1] },
    reward: 900,
    fails: [{ type: "leak", tag: "bomber", dest: [m.homeBase.x, m.homeBase.z], r: 1100, label: "Stop the bombers before they reach base" }],
    stages: [
      {
        type: "destroy", tag: "bomber", count: 3, label: "Shoot down the bombers",
        say: [["AWACS", "Bombers bearing north-east, escorts on top. The bombers are the priority!"]],
        spawn: [
          { air: "bomber", at: [3800, 1900, -3800], count: 3, spread: 240, tag: "bomber", path: [[0, 1900, -400], [m.homeBase.x, 1700, m.homeBase.z]] },
          { air: "raider", at: [3700, 2200, -3600], count: 2, spread: 260, tag: "escort" },
          { air: "interceptor", at: [3900, 2300, -4000], count: 1, tag: "escort" },
        ],
      },
    ],
  },
  {
    id: 7, world: "mountain", title: "Valley Run", tag: "Low-level navigation",
    brief: "Fly the canyon under the enemy radar ceiling and pass every gate. Climb too high and the radar will spot you. At the end, destroy the SAM battery.",
    start: { at: [-4100, 470, 3500], heading: [0.9, 0, -0.6] },
    reward: 950,
    stages: [
      {
        type: "checkpoints", points: valleyPts(190), r: 110, ceiling: 680, label: "Fly through the valley gates",
        say: [["AWACS", "Radar ceiling is 680 metres. Stay in the canyon and thread every gate."]],
      },
      {
        type: "destroy", tag: "sam", count: 3, label: "Destroy the SAM battery",
        say: [["AWACS", "Target ahead — three SAM launchers. Take them out before they lock you."]],
        spawn: [
          { ground: "sam", at: [m.samValley.x - 120, m.samValley.z - 80], tag: "sam" },
          { ground: "sam", at: [m.samValley.x + 130, m.samValley.z + 40], tag: "sam" },
          { ground: "sam", at: [m.samValley.x + 10, m.samValley.z + 150], tag: "sam" },
          { ground: "radar", at: [m.samValley.x - 40, m.samValley.z + 30] },
          { ground: "aa", at: [m.samValley.x + 200, m.samValley.z - 120] },
          { ground: "truck", at: [m.samValley.x - 160, m.samValley.z + 110], count: 2, spread: 25 },
        ],
      },
    ],
  },
  {
    id: 8, world: "mountain", title: "Iron Mountain", tag: "Destroy installations",
    brief: "The mountain fortress shells our troops. Silence its SAM sites, then destroy the bunkers and artillery. Bunkers need bombs or missiles.",
    start: { at: [-1500, 1800, 1000], heading: [1, 0, -1] },
    reward: 1100, loadout: { bombs: 2, missiles: 1 },
    stages: [
      {
        type: "destroy", tag: "fortsam", count: 2, label: "Destroy the fortress SAM sites",
        say: [["AWACS", "Two SAM sites cover the fortress. Hit them first."]],
        spawn: [
          { ground: "sam", at: [m.fort.x - 260, m.fort.z + 180], tag: "fortsam" },
          { ground: "sam", at: [m.fort.x + 240, m.fort.z - 200], tag: "fortsam" },
          { ground: "aa", at: [m.fort.x, m.fort.z + 300] }, { ground: "aa", at: [m.fort.x - 320, m.fort.z - 160] },
          { ground: "bunker", at: [m.fort.x - 100, m.fort.z - 60], tag: "fort" },
          { ground: "bunker", at: [m.fort.x + 120, m.fort.z + 40], yaw: 1.1, tag: "fort" },
          { ground: "bunker", at: [m.fort.x + 20, m.fort.z - 260], yaw: 0.4, tag: "fort" },
          { ground: "artillery", at: [m.fort.x - 200, m.fort.z + 40], tag: "fort" },
          { ground: "artillery", at: [m.fort.x + 200, m.fort.z + 160], tag: "fort" },
          { ground: "artillery", at: [m.fort.x + 280, m.fort.z - 40], tag: "fort" },
          { air: "raider", at: [1800, 1600, -1600], count: 2, spread: 200, patrol: ring(m.fort.x, m.fort.z, 1500, 5) },
        ],
      },
      {
        type: "destroy", tag: "fort", count: 6, label: "Destroy the bunkers and artillery",
        say: [["AWACS", "SAMs down. Now the bunkers and the guns. Rearm over home base if you run dry."]],
        waves: [{ t: 30, say: [["AWACS", "Two interceptors launching from the north."]], spawn: [{ air: "interceptor", at: [3000, 2000, -5200], count: 2, spread: 200 }] }],
      },
    ],
  },
  {
    id: 9, world: "mountain", title: "Shepherd", tag: "Escort",
    brief: "Two Hornet gunships are flying to strike an enemy supply depot. Escort them there and cover the attack. At least one gunship must survive.",
    start: { at: [-3600, 1300, 3000], heading: [0.6, 0, -1] },
    reward: 1150,
    fails: [{ type: "protect", tag: "gunship", min: 1, label: "At least one gunship must survive" }],
    stages: [
      {
        type: "escort", tag: "gunship", dest: [m.depot.x, m.depot.z], r: 900, label: "Escort the gunships to the depot",
        say: [["HORNET", "Hornet flight rolling out. Keep the fighters off us."]],
        spawn: [{ air: "gunship", side: "friend", at: [-3500, 1100, 2700], count: 2, spread: 120, tag: "gunship", path: [[-3300, 1200, 300], [-1800, 1200, -2000], [m.depot.x, 950, m.depot.z]] }],
        waves: [
          { t: 12, say: [["AWACS", "Bandits diving on the gunships!"]], spawn: [{ air: "raider", at: [-600, 1600, -1800], count: 2, spread: 200, targetTag: "gunship" }] },
          { t: 38, spawn: [{ air: "interceptor", at: [1600, 1700, -1000], count: 2, spread: 200, targetTag: "gunship" }] },
        ],
      },
      {
        type: "destroy", tag: "depot", count: 6, label: "Destroy the supply depot",
        say: [["HORNET", "On target! Rockets away — help us finish the depot."]],
        spawn: [
          { ground: "truck", at: [m.depot.x - 60, m.depot.z + 40], count: 3, spread: 60, tag: "depot" },
          { ground: "tank", at: [m.depot.x + 80, m.depot.z - 60], count: 2, spread: 50, tag: "depot" },
          { ground: "fuel", at: [m.depot.x - 20, m.depot.z - 120], tag: "depot" },
          { ground: "aa", at: [m.depot.x + 180, m.depot.z + 100] },
          { air: "raider", at: [1200, 1700, -5200], count: 2, spread: 200, targetTag: "gunship" },
        ],
      },
    ],
  },
  {
    id: 10, world: "mountain", title: "Black Wolves", tag: "Elite squadron",
    brief: "The Black Wolves — the enemy's best squadron — have come for you. They use flares and fly hard. Defeat the squadron and its leader.",
    start: { at: [-1600, 2000, 1600], heading: [1, 0, -1] },
    reward: 1500, unlock: "thunder",
    stages: [
      {
        type: "destroy", tag: "wolves", count: 4, label: "Defeat the Black Wolves",
        say: [["WOLF", "Black Wolves, engage. This one is ours."], ["AWACS", "Four elite fighters. They will dodge missiles — get on their tails."]],
        spawn: [{ air: "elite", at: [2200, 2100, -2200], count: 4, spread: 280, tag: "wolves" }],
      },
      {
        type: "destroy", tag: "leader", count: 1, label: "Shoot down the Wolf Leader",
        say: [["WOLF LEADER", "You killed my pack. Now you face me."]],
        spawn: [{ air: "leader", at: [3000, 2400, -3200], tag: "leader" }, { air: "interceptor", at: [3200, 2300, -3400], count: 2, spread: 200 }],
      },
    ],
  },

  /* ============================ WORLD 3 — OCEAN CONFLICT */
  {
    id: 11, world: "ocean", title: "Coastal Patrol", tag: "Patrol",
    brief: "Patrol the coastline. Check each waypoint and destroy whatever enemy forces you find there.",
    start: { at: [-4200, 900, 2000], heading: [1, 0, -0.2] },
    reward: 1000,
    stages: [
      { type: "reach", at: [-1500, 500, 1700], r: 650, label: "Patrol waypoint Alpha" },
      {
        type: "destroy", tag: "boats", count: 3, label: "Sink the enemy patrol boats",
        say: [["AWACS", "Enemy fast boats off the coast. Sink them."]],
        spawn: [{ ground: "boat", at: [-400, 1200], count: 3, spread: 260, tag: "boats", path: ring(-400, 1200, 700, 6) }],
      },
      { type: "reach", at: [-1400, 600, -1300], r: 650, label: "Patrol waypoint Bravo" },
      {
        type: "destroy", tag: "scouts", count: 3, label: "Intercept the recon flight",
        say: [["AWACS", "Recon aircraft heading for the cape!"]],
        spawn: [{ air: "scout", at: [1200, 900, -2600], count: 3, spread: 220, tag: "scouts" }],
      },
      {
        type: "destroy", tag: "cape", count: 3, label: "Destroy the coastal outpost at the cape",
        say: [["AWACS", "Final target: the radar outpost on the cape."]],
        spawn: [
          { ground: "radar", at: [o.cape.x, o.cape.z], tag: "cape" },
          { ground: "aa", at: [o.cape.x + 90, o.cape.z + 60], tag: "cape" },
          { ground: "aa", at: [o.cape.x - 80, o.cape.z - 70], tag: "cape" },
        ],
      },
    ],
  },
  {
    id: 12, world: "ocean", title: "Iron Shield", tag: "Defend ships",
    brief: "An allied convoy is crossing the strait. Torpedo bombers and fighters will try to sink it. At least two of the three freighters must survive.",
    start: { at: [-1800, 900, 3600], heading: [1, 0, -0.3] },
    reward: 1250,
    fails: [{ type: "protect", tag: "convoy", min: 2, label: "Keep at least 2 freighters afloat" }],
    stages: [
      {
        type: "survive", time: 150, label: "Defend the convoy",
        say: [["CONVOY", "Convoy Iron Shield under way. We're counting on you."]],
        spawn: [{ ground: "freighter", at: [-1200, 3000], count: 3, spread: 320, line: [1, 0], tag: "convoy", path: [[4200, 2600]], speed: 11 }],
        waves: [
          { t: 6, say: [["AWACS", "Torpedo bombers low on the water, bearing north!"]], spawn: [{ air: "torpedo", at: [600, 120, -2200], count: 2, spread: 200, targetTag: "convoy" }, { air: "raider", at: [800, 1200, -2400] }] },
          { t: 45, spawn: [{ air: "torpedo", at: [3800, 120, -1000], count: 2, spread: 200, targetTag: "convoy" }, { air: "scout", at: [3600, 1000, -1200], count: 2, spread: 200 }] },
          { t: 85, say: [["AWACS", "Another strike wave!"]], spawn: [{ air: "torpedo", at: [-600, 120, -2800], count: 3, spread: 220, targetTag: "convoy" }, { air: "interceptor", at: [-400, 1300, -3000] }] },
          { t: 118, spawn: [{ air: "torpedo", at: [5200, 120, 3200], count: 2, spread: 200, targetTag: "convoy" }] },
        ],
      },
    ],
  },
  {
    id: 13, world: "ocean", title: "Steel Tide", tag: "Naval strike",
    brief: "An enemy task force is anchored by the island. Sink the patrol boats, then the frigates, then the destroyer. Warships launch missiles — keep flares ready.",
    start: { at: [-600, 1500, 800], heading: [1, 0, -1] },
    reward: 1400, loadout: { bombs: 4, missiles: 2 },
    stages: [
      {
        type: "destroy", tag: "boats", count: 3, label: "Sink the patrol boats",
        spawn: [
          { ground: "boat", at: [1400, -1100], count: 3, spread: 300, tag: "boats", path: ring(1400, -1100, 600, 5) },
          { ground: "frigate", at: [2600, -1100], yaw: 1.2, tag: "frigates" },
          { ground: "frigate", at: [1200, -3000], yaw: 0.3, tag: "frigates" },
          { ground: "destroyer", at: [3600, -2000], yaw: 0.8, tag: "destroyer" },
          { air: "raider", at: [3000, 1300, -3000], count: 2, spread: 200, patrol: ring(2400, -2200, 1700, 5) },
        ],
        say: [["AWACS", "Task force in sight. Boats first — they'll screen the big ships."]],
      },
      { type: "destroy", tag: "frigates", count: 2, label: "Sink the frigates", say: [["AWACS", "Boats down. Hit the frigates — bombs work best."]] },
      {
        type: "destroy", tag: "destroyer", count: 1, label: "Sink the destroyer",
        say: [["AWACS", "Only the destroyer left. It's heavily armored."]],
        spawn: [{ air: "interceptor", at: [5400, 1500, -4600], count: 2, spread: 200 }],
      },
    ],
  },
  {
    id: 14, world: "ocean", title: "Storm of Wings", tag: "Large air battle",
    brief: "The skies over the strait are full of aircraft. Fight alongside your wingmen and win air superiority: 16 enemy aircraft must go down.",
    start: { at: [-2200, 1500, 1800], heading: [1, 0, -1] },
    reward: 1700,
    stages: [
      {
        type: "kills", count: 16, label: "Win air superiority",
        say: [["AWACS", "All flights, engage! Clear the sky!"]],
        spawn: [
          { air: "wingman", side: "friend", at: [-2300, 1500, 1950], count: 3, spread: 140 },
          { air: "raider", at: [1400, 1600, -1600], count: 3, spread: 300 },
          { air: "interceptor", at: [1800, 1800, -1800], count: 2, spread: 300 },
        ],
        keep: { kinds: ["scout", "raider", "raider", "interceptor", "elite"], active: 7, total: 22, ring: 3600 },
      },
    ],
  },
  {
    id: 15, world: "ocean", title: "The Last Ace", tag: "Final duel",
    brief: "The enemy's greatest pilot, Red Scythe, has challenged you over the island. Destroy his escort, then defeat the ace himself.",
    start: { at: [-1800, 1800, 1200], heading: [1, 0, -1] },
    reward: 2200,
    stages: [
      {
        type: "destroy", tag: "escort", count: 4, label: "Destroy the ace's escort",
        say: [["RED SCYTHE", "So you are the one they talk about. My escort will test you first."]],
        spawn: [{ air: "interceptor", at: [2000, 1800, -2200], count: 2, spread: 260, tag: "escort" }, { air: "elite", at: [2400, 2000, -2600], count: 2, spread: 260, tag: "escort" }],
      },
      {
        type: "destroy", tag: "ace", count: 1, label: "Defeat Red Scythe",
        say: [["RED SCYTHE", "Impressive. Now — dance with me."]],
        spawn: [{ air: "ace", at: [3200, 2200, -3200], tag: "ace" }],
      },
    ],
  },
];

export const WORLD_ORDER = ["desert", "mountain", "ocean"];
export const missionById = (id) => MISSIONS.find((x) => x.id === id) || MISSIONS[0];

/** Default progression state. */
export function freshProgress() {
  return { v: 1, credits: 0, unlocked: 1, completed: {}, best: {}, jets: { falcon: true }, jet: "falcon", up: {}, settings: { assist: true, sens: 1, invert: false, view: "chase" } };
}
