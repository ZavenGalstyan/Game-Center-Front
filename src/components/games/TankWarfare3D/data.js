/**
 * Tank Warfare 3D — static game data: player tanks, ammunition, enemy types,
 * structures, destructibles, upgrades, AI difficulty, the 15 campaign
 * missions, survival waves and the training course.
 *
 * Coordinates are metres on the ground plane (x east, z north, y up) and
 * refer to the hand-laid battlefield layouts in map.js. A heading of 0 faces
 * +z (north). Everything here is plain data — sim.js interprets it.
 */

export const SAVE_KEY = "tank-warfare-3d-progress";
export const SAVE_VERSION = 1;
export const G = 9.8;
export const MAX_UPGRADE = 5;

/* ------------------------------------------------------------------ player tanks */
export const TANKS = {
  fox: {
    id: "fox",
    name: "Iron Fox",
    role: "Balanced main battle tank",
    blurb: "A dependable all-rounder. Good armour, steady gun, forgiving handling — the tank every crew learns on.",
    hp: 100,
    armor: { front: 0.42, side: 0.27, rear: 0.14, turret: 0.45 },
    maxSpeed: 13, revSpeed: 6, accel: 6.5, turn: 1.05,
    traverse: 1.15, elevRate: 0.55,
    reload: 3.0, dmg: 36, shellSpeed: 1.0, dispersion: 0.006,
    kits: 3, repair: 35, boost: 1.35,
    unlock: null, cost: 0,
    paint: 0x56603f, accent: 0x3a4229,
  },
  viper: {
    id: "viper",
    name: "Desert Viper",
    role: "Fast light tank",
    blurb: "Lightly armoured and very quick. Flank, strike the thin side armour and be gone before the reply lands.",
    hp: 88,
    armor: { front: 0.3, side: 0.19, rear: 0.1, turret: 0.32 },
    maxSpeed: 17.5, revSpeed: 8.5, accel: 9.5, turn: 1.45,
    traverse: 1.45, elevRate: 0.65,
    reload: 2.45, dmg: 29, shellSpeed: 1.05, dispersion: 0.0075,
    kits: 3, repair: 32, boost: 1.4,
    unlock: { mission: 4 }, cost: 1200,
    paint: 0xb59a68, accent: 0x7c6542,
  },
  titan: {
    id: "titan",
    name: "Steel Titan",
    role: "Heavy breakthrough tank",
    blurb: "A rolling fortress. Thick sloped armour and a huge gun — slow to turn, slow to reload, devastating when it hits.",
    hp: 135,
    armor: { front: 0.58, side: 0.4, rear: 0.24, turret: 0.6 },
    maxSpeed: 9.6, revSpeed: 4.6, accel: 4.2, turn: 0.76,
    traverse: 0.78, elevRate: 0.42,
    reload: 4.3, dmg: 56, shellSpeed: 1.08, dispersion: 0.0062,
    kits: 4, repair: 40, boost: 1.3,
    unlock: { mission: 8 }, cost: 2600,
    paint: 0x5d6670, accent: 0x3b4249,
  },
  phantom: {
    id: "phantom",
    name: "Phantom X",
    role: "Advanced targeting tank",
    blurb: "Next-generation fire control: tight dispersion, a lead marker on moving targets and the fastest loader in the field.",
    hp: 105,
    armor: { front: 0.46, side: 0.3, rear: 0.17, turret: 0.48 },
    maxSpeed: 14, revSpeed: 7, accel: 7.2, turn: 1.15,
    traverse: 1.65, elevRate: 0.7,
    reload: 2.1, dmg: 33, shellSpeed: 1.15, dispersion: 0.0036,
    kits: 3, repair: 36, boost: 1.35,
    targeting: true,
    unlock: { mission: 12 }, cost: 4200,
    paint: 0x2f3439, accent: 0x1c2024,
  },
};
export const TANK_ORDER = ["fox", "viper", "titan", "phantom"];

/* ------------------------------------------------------------------ ammunition */
export const AMMO = {
  ap: { id: "ap", key: "1", name: "Armor-Piercing", short: "AP", speed: 235, dmgMul: 1, armorUse: 0.85, splashR: 1.6, splashMul: 0.12, structMul: 0.7, count: 50, reloadMul: 1, color: 0xfff1b0 },
  he: { id: "he", key: "2", name: "High-Explosive", short: "HE", speed: 140, dmgMul: 0.8, armorUse: 1.35, splashR: 7.5, splashMul: 0.62, structMul: 1.7, count: 15, reloadMul: 1.1, color: 0xffa040 },
  smoke: { id: "smoke", key: "3", name: "Smoke", short: "SMK", speed: 110, dmgMul: 0, armorUse: 1, splashR: 0, splashMul: 0, structMul: 0, count: 4, reloadMul: 0.8, color: 0xd8d8d0, cloudR: 10, cloudLife: 16 },
};
export const AMMO_ORDER = ["ap", "he", "smoke"];

/* ------------------------------------------------------------------ enemy / NPC vehicles */
export const UNITS = {
  scout: { name: "Jackal Scout", look: "scout", hp: 50, armor: { front: 0.2, side: 0.12, rear: 0.06, turret: 0.2 }, maxSpeed: 14.5, revSpeed: 7, accel: 9, turn: 1.5, traverse: 1.6, elevRate: 0.7, reload: 2.7, dmg: 12, shellSpeed: 0.95, range: 115, pref: 55, sight: 135, weak: { he: 1.25 }, credits: 40 },
  raider: { name: "Raider MBT", look: "raider", hp: 78, armor: { front: 0.36, side: 0.22, rear: 0.12, turret: 0.38 }, maxSpeed: 11, revSpeed: 5.5, accel: 6, turn: 1.0, traverse: 1.0, elevRate: 0.5, reload: 3.5, dmg: 16, shellSpeed: 1, range: 150, pref: 80, sight: 145, weak: {}, credits: 60 },
  bulwark: { name: "Bulwark Heavy", look: "bulwark", hp: 130, armor: { front: 0.5, side: 0.32, rear: 0.1, turret: 0.5 }, maxSpeed: 7.6, revSpeed: 4, accel: 4, turn: 0.7, traverse: 0.7, elevRate: 0.4, reload: 4.6, dmg: 24, shellSpeed: 1, range: 160, pref: 70, sight: 140, weak: { rear: 1.35 }, credits: 90 },
  lancer: { name: "Lancer Tank Destroyer", look: "lancer", hp: 80, armor: { front: 0.5, side: 0.14, rear: 0.1, turret: 0.46 }, maxSpeed: 9, revSpeed: 5, accel: 5, turn: 0.85, traverse: 0.55, elevRate: 0.45, reload: 5.0, dmg: 27, shellSpeed: 1.15, range: 215, pref: 130, sight: 175, weak: { side: 1.3 }, credits: 80, sniper: true },
  warlord: { name: "Warlord", look: "warlord", hp: 300, armor: { front: 0.55, side: 0.4, rear: 0.24, turret: 0.6 }, maxSpeed: 9, revSpeed: 5, accel: 5, turn: 0.85, traverse: 0.95, elevRate: 0.5, reload: 3.0, dmg: 22, shellSpeed: 1.05, range: 190, pref: 70, sight: 190, weak: { rear: 1.2 }, credits: 300, boss: true },
  truck: { name: "Supply Truck", look: "truck", hp: 45, armor: { front: 0.05, side: 0.05, rear: 0.05, turret: 0.05 }, maxSpeed: 9, revSpeed: 4, accel: 4, turn: 0.9, traverse: 0, elevRate: 0, reload: 99, dmg: 0, range: 0, pref: 0, sight: 0, weak: { he: 1.3 }, credits: 30, unarmed: true },
  convoy: { name: "Allied Convoy Truck", look: "convoy", hp: 130, armor: { front: 0.22, side: 0.2, rear: 0.2, turret: 0.2 }, maxSpeed: 7.5, revSpeed: 4, accel: 3.5, turn: 0.8, traverse: 0, elevRate: 0, reload: 99, dmg: 0, range: 0, pref: 0, sight: 0, weak: {}, credits: 0, unarmed: true },
  ally: { name: "Allied Iron Fox", look: "ally", hp: 140, armor: { front: 0.42, side: 0.27, rear: 0.14, turret: 0.45 }, maxSpeed: 11, revSpeed: 5.5, accel: 6, turn: 1.0, traverse: 1.0, elevRate: 0.5, reload: 3.6, dmg: 22, shellSpeed: 1, range: 160, pref: 75, sight: 150, weak: {}, credits: 0 },
  dummy: { name: "Target Hull", look: "dummy", hp: 50, armor: { front: 0.1, side: 0.1, rear: 0.1, turret: 0.1 }, maxSpeed: 7, revSpeed: 3, accel: 4, turn: 0.9, traverse: 0, elevRate: 0, reload: 99, dmg: 0, range: 0, pref: 0, sight: 0, weak: {}, credits: 0, unarmed: true },
};

/* ------------------------------------------------------------------ vehicle dimensions
 * Shared by the sim (hit boxes, turret pivot, muzzle) and models.js (meshes).
 * hx/hz hull half width/length, top = hull roof height, ty = turret pivot
 * height, tz = turret pivot offset along the hull, tr = turret half size,
 * th = turret height, barrel = trunnion→muzzle length.
 */
export const LOOKS = {
  fox: { hx: 1.75, hz: 3.35, top: 1.72, ty: 2.02, tz: -0.35, tr: 1.35, th: 0.72, barrel: 4.7, wheels: 6 },
  viper: { hx: 1.55, hz: 3.0, top: 1.5, ty: 1.78, tz: -0.2, tr: 1.12, th: 0.6, barrel: 4.1, wheels: 5 },
  titan: { hx: 1.98, hz: 3.8, top: 1.92, ty: 2.26, tz: -0.5, tr: 1.6, th: 0.86, barrel: 5.3, wheels: 7 },
  phantom: { hx: 1.75, hz: 3.4, top: 1.62, ty: 1.92, tz: -0.4, tr: 1.4, th: 0.64, barrel: 5.0, wheels: 6 },
  scout: { hx: 1.45, hz: 2.8, top: 1.45, ty: 1.72, tz: 0, tr: 1.0, th: 0.55, barrel: 3.4, wheels: 5 },
  raider: { hx: 1.72, hz: 3.3, top: 1.7, ty: 2.0, tz: -0.3, tr: 1.3, th: 0.72, barrel: 4.5, wheels: 6 },
  bulwark: { hx: 1.98, hz: 3.75, top: 1.9, ty: 2.25, tz: -0.4, tr: 1.62, th: 0.9, barrel: 4.9, wheels: 7 },
  lancer: { hx: 1.8, hz: 3.5, top: 1.45, ty: 1.66, tz: 0.6, tr: 1.25, th: 0.55, barrel: 5.8, wheels: 6 },
  warlord: { hx: 2.15, hz: 4.1, top: 2.0, ty: 2.4, tz: -0.5, tr: 1.75, th: 0.95, barrel: 5.6, wheels: 8 },
  truck: { hx: 1.3, hz: 3.6, top: 3.0, ty: 0, tz: 0, tr: 0, th: 0, barrel: 0, wheels: 3 },
  convoy: { hx: 1.35, hz: 3.8, top: 3.2, ty: 0, tz: 0, tr: 0, th: 0, barrel: 0, wheels: 3 },
  ally: { hx: 1.75, hz: 3.35, top: 1.72, ty: 2.02, tz: -0.35, tr: 1.35, th: 0.72, barrel: 4.7, wheels: 6 },
  dummy: { hx: 1.7, hz: 3.2, top: 1.6, ty: 0, tz: 0, tr: 0, th: 0, barrel: 0, wheels: 0 },
};

/* ------------------------------------------------------------------ AI difficulty */
export const DIFFICULTY = {
  easy: { id: "easy", name: "Easy", aimErr: 0.05, rangeFloor: 1.05, errMin: 0.95, lead: 0, react: 1.5, fireMul: 1.5, aggression: 0.3, dmgMul: 0.7, sightMul: 0.85, cover: 0.25 },
  medium: { id: "medium", name: "Medium", aimErr: 0.04, rangeFloor: 0.9, errMin: 0.7, lead: 0.55, react: 0.85, fireMul: 1.2, aggression: 0.6, dmgMul: 1, sightMul: 1, cover: 0.55 },
  hard: { id: "hard", name: "Hard", aimErr: 0.024, rangeFloor: 0.7, errMin: 0.35, lead: 0.9, react: 0.45, fireMul: 0.95, aggression: 0.9, dmgMul: 1.15, sightMul: 1.15, cover: 0.85 },
};
export const DIFF_ORDER = ["easy", "medium", "hard"];

/* ------------------------------------------------------------------ structures (mission targets) */
export const STRUCTURES = {
  depot: { name: "Fuel Depot", hp: 80, hx: 4, hz: 3, h: 3.4, explode: 1.6 },
  bunker: { name: "Bunker", hp: 170, hx: 5, hz: 4, h: 3.2, explode: 1.2 },
  aa: { name: "AA Battery", hp: 75, hx: 2.6, hz: 2.6, h: 3.2, explode: 1.1 },
  comms: { name: "Comms Tower", hp: 70, hx: 2.2, hz: 2.2, h: 14, explode: 1.0 },
  checkpoint: { name: "Checkpoint Barricade", hp: 120, hx: 5, hz: 1.4, h: 2.6, explode: 1.0 },
  hq: { name: "Allied HQ", hp: 720, hx: 8, hz: 6, h: 6, explode: 2.2, friendly: true },
};

/* ------------------------------------------------------------------ destructible props */
export const DESTRUCT = {
  fence: { hp: 8, crush: true, debris: 5, color: 0x8a6a45 },
  crate: { hp: 8, crush: true, debris: 6, color: 0x9c7a48 },
  barricade: { hp: 40, crush: false, debris: 8, color: 0xb9a57a },
  tower: { hp: 45, crush: false, debris: 10, color: 0x7a5d3c },
  barrel: { hp: 6, crush: true, debris: 4, color: 0xb2452f, explode: { r: 6.5, dmg: 34 } },
};

/* ------------------------------------------------------------------ upgrades */
export const UPGRADES = {
  armor: { name: "Armor", desc: "+3.5% armor on every face and +5 hull HP per level", base: 180 },
  engine: { name: "Engine", desc: "+6% top speed, acceleration and turn rate per level", base: 160 },
  cannon: { name: "Cannon Damage", desc: "+7% shell damage per level", base: 200 },
  reload: { name: "Reload Speed", desc: "-6% reload time per level", base: 190 },
  turret: { name: "Turret Rotation", desc: "+12% turret traverse and gun elevation speed per level", base: 120 },
  repair: { name: "Repair Capacity", desc: "+1 repair kit at levels 1/3/5 and +5 HP per kit per level", base: 140 },
};
export const UPGRADE_ORDER = ["armor", "engine", "cannon", "reload", "turret", "repair"];
export const TANK_COST_MUL = { fox: 1, viper: 1.1, titan: 1.3, phantom: 1.4 };

export function upgradeCost(tankId, key, level) {
  return Math.round((UPGRADES[key].base * (1 + level * 0.65) * (TANK_COST_MUL[tankId] || 1)) / 10) * 10;
}

/** Final gameplay stats for a player tank with its upgrade levels applied. */
export function tankStats(id, up = {}) {
  const t = TANKS[id] || TANKS.fox;
  const L = (k) => Math.max(0, Math.min(MAX_UPGRADE, up[k] | 0));
  const a = 1 + 0.035 * L("armor");
  const e = 1 + 0.06 * L("engine");
  const armor = {};
  for (const f of ["front", "side", "rear", "turret"]) armor[f] = Math.min(0.78, t.armor[f] * a);
  return {
    ...t,
    hp: t.hp + 5 * L("armor"),
    armor,
    maxSpeed: t.maxSpeed * e,
    revSpeed: t.revSpeed * e,
    accel: t.accel * e,
    turn: t.turn * (1 + 0.04 * L("engine")),
    dmg: t.dmg * (1 + 0.07 * L("cannon")),
    reload: t.reload * (1 - 0.06 * L("reload")),
    traverse: t.traverse * (1 + 0.12 * L("turret")),
    elevRate: t.elevRate * (1 + 0.12 * L("turret")),
    kits: t.kits + Math.ceil(L("repair") / 2),
    repair: t.repair + 5 * L("repair"),
  };
}

/* ------------------------------------------------------------------ worlds */
export const WORLDS = {
  desert: { id: "desert", name: "Desert Warzone", short: "Desert", blurb: "Wind-carved dunes, rocky mesas and fortified outposts under a blazing sun." },
  forest: { id: "forest", name: "Forest Front", short: "Forest", blurb: "Misty pine hills, a winding river, timber bridges and hidden camps." },
  city: { id: "city", name: "Ruined City", short: "City", blurb: "Shattered streets, gutted towers and an industrial district fought block by block." },
};
export const WORLD_ORDER = ["desert", "forest", "city"];

/* ------------------------------------------------------------------ campaign
 * Stage types (sim.js):
 *   destroy   — kill every unit spawned by the stage
 *   intercept — kill unarmed trucks before `maxEscape` reach the end of their route
 *   targets   — destroy the listed structures
 *   reach     — drive into the marked circle
 *   survive   — last `time` seconds while `waves` arrive, then clear the rest
 *   defendZone— keep enemies out of a zone for `time` s (fails at `maxHold` s of enemy presence)
 *   defendHQ  — keep the allied HQ standing for `time` s
 *   escort    — get `need` of the convoy trucks to the end of `path`
 *   capture   — hold the zone (no enemies inside) for `time` s
 *   boss      — destroy the elite tank (it may call reinforcements)
 * Spawn group: { type, n, at:[x,z], spread, order, patrol?, name?, hp? , hidden? }
 *   order: patrol | guard | hunt | assault | hold | convoy | escape | ambush
 */
export const MISSIONS = [
  /* ---------------- DESERT WARZONE ---------------- */
  {
    id: 1, world: "desert", title: "First Contact",
    brief: "Scouts have been spotted probing the dunes north of our staging area. Roll out, find them and destroy all three. Use the mouse to aim the turret, left click to fire — lead moving targets.",
    start: [0, -160, 0],
    reward: 400,
    stages: [
      { type: "destroy", label: "Destroy the enemy scouts", spawn: [{ type: "scout", n: 3, at: [10, -55], spread: 22, order: "patrol", patrol: [[-30, -50], [40, -60], [30, -20], [-20, -15]] }] },
    ],
  },
  {
    id: 2, world: "desert", title: "Enemy Patrol",
    brief: "An armoured patrol is sweeping the old supply road. Move up to the road, then ambush the column before it reaches our lines.",
    start: [0, -160, 0],
    reward: 520,
    stages: [
      { type: "reach", label: "Move to the supply road", point: [-40, -55], r: 14 },
      { type: "destroy", label: "Destroy the patrol column", spawn: [
        { type: "scout", n: 2, at: [60, 60], spread: 10, order: "patrol", patrol: [[60, 60], [10, 10], [-40, -40], [10, 10]] },
        { type: "raider", n: 2, at: [75, 80], spread: 10, order: "patrol", patrol: [[75, 80], [25, 25], [-30, -30], [25, 25]] },
      ] },
    ],
  },
  {
    id: 3, world: "desert", title: "Supply Route",
    brief: "Enemy supply trucks are running fuel down the road towards the western outposts. Intercept them — if two get through, the mission fails. Then torch their fuel depots.",
    start: [0, -160, 0],
    reward: 650,
    stages: [
      { type: "intercept", label: "Destroy the supply trucks", maxEscape: 2, spawn: [
        { type: "truck", n: 4, at: [150, 170], spread: 0, order: "escape", route: "road", gap: 16 },
        { type: "scout", n: 2, at: [120, 140], spread: 8, order: "guard" },
      ] },
      { type: "targets", label: "Destroy the fuel depots", targets: [{ kind: "depot", at: [-92, 46] }, { kind: "depot", at: [-130, 88] }], spawn: [
        { type: "raider", n: 1, at: [-110, 62], spread: 6, order: "guard" },
        { type: "scout", n: 1, at: [-95, 90], spread: 6, order: "guard" },
      ] },
    ],
  },
  {
    id: 4, world: "desert", title: "Desert Ambush",
    brief: "Our recon column has been caught in the open. Enemy armour is closing from several directions. Survive the ambush, then wipe out what is left. Smoke shells (3) can break their line of sight.",
    start: [-40, -40, 0.8],
    reward: 760,
    stages: [
      { type: "survive", label: "Survive the ambush", time: 110, waves: [
        { at: 0, spawn: [{ type: "scout", n: 3, at: [120, -60], spread: 16, order: "hunt" }] },
        { at: 32, spawn: [{ type: "raider", n: 2, at: [-20, 110], spread: 12, order: "hunt" }] },
        { at: 66, spawn: [{ type: "raider", n: 1, at: [-150, -40], spread: 8, order: "hunt" }, { type: "lancer", n: 1, at: [-70, 40], spread: 4, order: "hold" }] },
      ] },
      { type: "destroy", label: "Eliminate the remaining ambushers", spawn: [] },
    ],
  },
  {
    id: 5, world: "desert", title: "Outpost Assault",
    brief: "Outpost Alpha anchors the enemy's desert line. Break its outer guard, take the compound — and be ready: their commander, the Sand Warlord, will come for it.",
    start: [0, -160, 0.5],
    reward: 1000,
    stages: [
      { type: "destroy", label: "Break the outer guard", spawn: [
        { type: "raider", n: 1, at: [62, 52], spread: 6, order: "guard" },
        { type: "scout", n: 1, at: [70, 40], spread: 6, order: "guard" },
        { type: "bulwark", n: 1, at: [40, 70], spread: 4, order: "guard" },
      ] },
      { type: "capture", label: "Capture Outpost Alpha", zone: [100, 108], r: 18, time: 14, spawn: [
        { type: "raider", n: 1, at: [108, 100], spread: 4, order: "guard" },
        { type: "scout", n: 1, at: [96, 120], spread: 6, order: "guard" },
      ] },
      { type: "boss", label: "Destroy the Sand Warlord", spawn: [
        { type: "warlord", n: 1, at: [160, 168], spread: 0, order: "hunt", name: "Sand Warlord", hp: 240, boss: true },
        { type: "scout", n: 1, at: [150, 150], spread: 8, order: "hunt" },
      ] },
    ],
  },

  /* ---------------- FOREST FRONT ---------------- */
  {
    id: 6, world: "forest", title: "Forest Patrol",
    brief: "Patrol the western forest roads. Check the crossroads, clear the logging camp, cross the old bridge and sweep the enemy picket on the far bank.",
    start: [0, -175, 0],
    reward: 820,
    stages: [
      { type: "reach", label: "Check the crossroads", point: [0, -80], r: 14 },
      { type: "destroy", label: "Clear the western camp", spawn: [
        { type: "scout", n: 2, at: [-112, -52], spread: 8, order: "guard" },
        { type: "raider", n: 1, at: [-120, -40], spread: 4, order: "guard" },
      ] },
      { type: "reach", label: "Cross the old bridge", point: [-130, 34], r: 14 },
      { type: "destroy", label: "Destroy the enemy picket", spawn: [
        { type: "raider", n: 2, at: [-110, 95], spread: 12, order: "guard" },
        { type: "lancer", n: 1, at: [-145, 110], spread: 2, order: "hold" },
      ] },
    ],
  },
  {
    id: 7, world: "forest", title: "Bridge Defense",
    brief: "The main bridge is our only heavy crossing. Enemy armour is coming down the north road to seize it. Keep them off the bridge for three minutes — an allied tank will hold the line with you.",
    start: [0, -8, 0],
    reward: 920,
    allies: [{ type: "ally", at: [14, -14], order: "defend", zone: [0, 25] }],
    stages: [
      { type: "defendZone", label: "Hold the bridge", zone: [0, 25], r: 20, time: 170, maxHold: 18, waves: [
        { at: 0, spawn: [{ type: "raider", n: 2, at: [0, 160], spread: 12, order: "assault" }, { type: "scout", n: 1, at: [30, 150], spread: 6, order: "assault" }] },
        { at: 45, spawn: [{ type: "scout", n: 2, at: [-60, 150], spread: 8, order: "assault" }, { type: "bulwark", n: 1, at: [0, 175], spread: 2, order: "assault" }] },
        { at: 90, spawn: [{ type: "raider", n: 2, at: [130, 110], spread: 10, order: "assault" }, { type: "lancer", n: 1, at: [30, 120], spread: 2, order: "hold" }] },
        { at: 130, spawn: [{ type: "bulwark", n: 1, at: [-40, 170], spread: 2, order: "assault" }, { type: "raider", n: 2, at: [20, 175], spread: 10, order: "assault" }] },
      ] },
      { type: "destroy", label: "Destroy the remaining attackers", spawn: [] },
    ],
  },
  {
    id: 8, world: "forest", title: "Hidden Armor",
    brief: "Camouflaged tank destroyers are dug in across the valley. They will not show on radar until you are close or they open fire. Search the marked areas and destroy all four.",
    start: [0, -175, 0],
    reward: 1000,
    stages: [
      { type: "destroy", label: "Find and destroy the hidden tank destroyers", search: true, spawn: [
        { type: "lancer", n: 1, at: [-62, -118], spread: 0, order: "hold", hidden: true },
        { type: "lancer", n: 1, at: [92, -36], spread: 0, order: "hold", hidden: true },
        { type: "lancer", n: 1, at: [-72, 112], spread: 0, order: "hold", hidden: true },
        { type: "lancer", n: 1, at: [108, 72], spread: 0, order: "hold", hidden: true },
        { type: "scout", n: 2, at: [0, -40], spread: 10, order: "patrol", patrol: [[0, -40], [-60, -70], [0, -110], [60, -70]], escort: false },
      ] },
    ],
  },
  {
    id: 9, world: "forest", title: "Convoy Escort",
    brief: "Three supply trucks must reach the lumber yard by the eastern ford. Ambushes are expected along the route. The trucks halt when enemies are close — clear the way. At least two must arrive.",
    start: [0, -150, 0],
    reward: 1120,
    stages: [
      { type: "escort", label: "Escort the convoy to the lumber yard", need: 2, convoy: { n: 3, path: [[0, -160], [0, -80], [70, -90], [130, -100], [136, -40], [135, 25], [132, 70], [120, 118]] }, ambush: [
        { at: 0.18, spawn: [{ type: "scout", n: 2, at: [60, -140], spread: 8, order: "convoyAttack" }] },
        { at: 0.4, spawn: [{ type: "raider", n: 2, at: [165, -60], spread: 8, order: "convoyAttack" }] },
        { at: 0.62, spawn: [{ type: "raider", n: 1, at: [170, 60], spread: 4, order: "convoyAttack" }, { type: "lancer", n: 1, at: [95, 60], spread: 2, order: "hold" }] },
        { at: 0.85, spawn: [{ type: "scout", n: 2, at: [150, 150], spread: 8, order: "convoyAttack" }] },
      ] },
    ],
  },
  {
    id: 10, world: "forest", title: "Forest Stronghold",
    brief: "The enemy's forest stronghold shelters their air defence. Destroy both AA batteries and the comms tower, then face the Forest Warlord leading their counter-attack.",
    start: [0, -60, 0],
    reward: 1300,
    stages: [
      { type: "targets", label: "Destroy the AA batteries and comms tower", targets: [{ kind: "aa", at: [-26, 128] }, { kind: "aa", at: [26, 128] }, { kind: "comms", at: [0, 162] }], spawn: [
        { type: "raider", n: 2, at: [0, 118], spread: 14, order: "guard" },
        { type: "bulwark", n: 1, at: [0, 148], spread: 2, order: "guard" },
        { type: "scout", n: 1, at: [-40, 90], spread: 6, order: "patrol", patrol: [[-40, 90], [40, 90]] },
      ] },
      { type: "boss", label: "Destroy the Forest Warlord", spawn: [
        { type: "warlord", n: 1, at: [60, 178], spread: 0, order: "hunt", name: "Forest Warlord", hp: 320, boss: true },
        { type: "lancer", n: 1, at: [-50, 160], spread: 2, order: "hold" },
      ] },
    ],
  },

  /* ---------------- RUINED CITY ---------------- */
  {
    id: 11, world: "city", title: "City Entrance",
    brief: "The southern highway into the city is blocked by a fortified checkpoint. Blast the barricades, then push up and secure the first intersection.",
    start: [0, -185, 0],
    reward: 1300,
    stages: [
      { type: "targets", label: "Destroy the checkpoint barricades", targets: [{ kind: "checkpoint", at: [-6, -140] }, { kind: "checkpoint", at: [7, -140] }], spawn: [
        { type: "raider", n: 2, at: [0, -118], spread: 6, order: "guard" },
        { type: "lancer", n: 1, at: [-2, -100], spread: 1, order: "hold" },
      ] },
      { type: "capture", label: "Secure the intersection", zone: [0, -75], r: 15, time: 12, spawn: [
        { type: "raider", n: 2, at: [-30, -75], spread: 6, order: "guard" },
        { type: "scout", n: 1, at: [30, -78], spread: 4, order: "guard" },
      ] },
    ],
  },
  {
    id: 12, world: "city", title: "Street Ambush",
    brief: "You have pushed deep into the old quarter — too deep. Enemy armour is pouring out of the side streets. Hold out, use the ruins for cover, then finish them.",
    start: [0, -75, 0],
    reward: 1420,
    stages: [
      { type: "survive", label: "Survive the street ambush", time: 140, waves: [
        { at: 0, spawn: [{ type: "scout", n: 2, at: [150, -75], spread: 6, order: "hunt" }, { type: "raider", n: 1, at: [-150, -75], spread: 4, order: "hunt" }] },
        { at: 35, spawn: [{ type: "raider", n: 2, at: [0, 75], spread: 8, order: "hunt" }] },
        { at: 70, spawn: [{ type: "bulwark", n: 1, at: [75, 0], spread: 2, order: "hunt" }, { type: "scout", n: 2, at: [-75, 0], spread: 6, order: "hunt" }] },
        { at: 105, spawn: [{ type: "raider", n: 2, at: [150, 0], spread: 8, order: "hunt" }, { type: "lancer", n: 1, at: [-75, -150], spread: 2, order: "hold" }] },
      ] },
      { type: "destroy", label: "Destroy the remaining enemies", spawn: [] },
    ],
  },
  {
    id: 13, world: "city", title: "Defend the Base",
    brief: "Our forward HQ has been located. Waves of enemy armour will try to level it. Keep the HQ standing for three and a half minutes — it cannot take much punishment.",
    start: [-37, -88, 0],
    reward: 1520,
    allies: [{ type: "ally", at: [-20, -95], order: "defend", zone: [-37, -112] }],
    stages: [
      { type: "defendHQ", label: "Defend the HQ", hq: [-37, -116], time: 200, waves: [
        { at: 0, spawn: [{ type: "raider", n: 2, at: [-37, 30], spread: 8, order: "assault" }] },
        { at: 40, spawn: [{ type: "scout", n: 2, at: [75, -112], spread: 6, order: "assault" }, { type: "raider", n: 1, at: [75, -80], spread: 4, order: "assault" }] },
        { at: 85, spawn: [{ type: "bulwark", n: 1, at: [-150, -75], spread: 2, order: "assault" }, { type: "raider", n: 2, at: [-150, -30], spread: 8, order: "assault" }] },
        { at: 130, spawn: [{ type: "lancer", n: 1, at: [-75, -10], spread: 2, order: "hold" }, { type: "raider", n: 2, at: [0, 20], spread: 8, order: "assault" }, { type: "scout", n: 1, at: [75, -40], spread: 4, order: "assault" }] },
        { at: 170, spawn: [{ type: "bulwark", n: 1, at: [75, -150], spread: 2, order: "assault" }, { type: "raider", n: 1, at: [-150, -150], spread: 4, order: "assault" }] },
      ] },
      { type: "destroy", label: "Destroy the remaining attackers", spawn: [] },
    ],
  },
  {
    id: 14, world: "city", title: "Armored Offensive",
    brief: "Lead three allied tanks through the city centre. Capture the central intersection, then push into the industrial district and take the factory yard.",
    start: [0, -150, 0],
    reward: 1700,
    allies: [
      { type: "ally", at: [-10, -162], order: "follow" },
      { type: "ally", at: [10, -162], order: "follow" },
      { type: "ally", at: [0, -172], order: "follow" },
    ],
    stages: [
      { type: "capture", label: "Capture the central intersection", zone: [0, 0], r: 17, time: 15, spawn: [
        { type: "raider", n: 3, at: [0, 15], spread: 16, order: "guard" },
        { type: "bulwark", n: 1, at: [0, 40], spread: 2, order: "guard" },
      ] },
      { type: "capture", label: "Capture the factory yard", zone: [112, 106], r: 18, time: 18, spawn: [
        { type: "bulwark", n: 2, at: [112, 118], spread: 10, order: "guard" },
        { type: "raider", n: 2, at: [75, 100], spread: 10, order: "guard" },
        { type: "lancer", n: 1, at: [150, 75], spread: 2, order: "hold" },
      ] },
    ],
  },
  {
    id: 15, world: "city", title: "Final Steel Battle",
    brief: "Everything they have left is gathered in the north. Smash the heavy escort, then destroy the Iron Colossus — their super-heavy command tank. It will call for help when wounded. End this war.",
    start: [0, -110, 0],
    reward: 2500,
    stages: [
      { type: "destroy", label: "Destroy the heavy escort", spawn: [
        { type: "raider", n: 2, at: [-20, 60], spread: 10, order: "guard" },
        { type: "bulwark", n: 2, at: [20, 80], spread: 10, order: "guard" },
      ] },
      { type: "boss", label: "Destroy the Iron Colossus", spawn: [
        { type: "warlord", n: 1, at: [112, 150], spread: 0, order: "hunt", name: "Iron Colossus", hp: 450, boss: true, scale: 1.25 },
        { type: "lancer", n: 2, at: [75, 150], spread: 14, order: "hold" },
      ] },
    ],
  },
];

export const missionById = (id) => MISSIONS.find((m) => m.id === id) || MISSIONS[0];

/* ------------------------------------------------------------------ survival */
export const SURVIVAL = {
  starts: { desert: [0, -10, 0], forest: [0, -100, 0], city: [0, -75, 0] },
  spawns: {
    desert: [[150, 150], [-150, 120], [170, -60], [-170, -40], [0, 175], [100, -170], [-120, -150]],
    forest: [[0, 175], [-150, 120], [150, 110], [170, -60], [-170, -80], [120, -170], [-120, -170]],
    city: [[150, 150], [-150, 150], [150, -150], [-150, -150], [0, 150], [150, 0], [-150, 0]],
  },
  break: 10,
};

/** Unit mix for survival wave n (1-based). */
export function survivalWave(n) {
  const count = Math.min(9, 2 + Math.floor(n * 0.75));
  const list = [];
  for (let i = 0; i < count; i++) {
    const r = (i * 7 + n * 13) % 10;
    let type = "scout";
    if (n >= 2 && r >= 3) type = "raider";
    if (n >= 4 && r >= 7) type = "bulwark";
    if (n >= 3 && r === 9) type = "lancer";
    list.push(type);
  }
  if (n % 5 === 0) list.push("warlord");
  return list;
}

/* ------------------------------------------------------------------ training */
export const TRAINING = {
  world: "desert",
  start: [0, -160, 0],
  reward: 300,
  tasks: [
    { id: "drive", label: "Drive through the four gates", gates: [[0, -130], [34, -110], [6, -84], [-30, -104]] },
    { id: "static", label: "Destroy the stationary targets", dummies: [[-24, -48], [0, -40], [26, -46], [52, -60]] },
    { id: "moving", label: "Destroy the moving targets", movers: [[70, -100], [100, -130], [130, -100], [100, -70]], n: 3 },
    { id: "he", label: "Destroy the target cluster with an HE shell (2)", cluster: [-62, -78] },
    { id: "smoke", label: "Fire a smoke shell (3)" },
  ],
};
