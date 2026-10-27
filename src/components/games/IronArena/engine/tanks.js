/**
 * Iron Arena — the eight tanks, their weapons, special abilities, skins and
 * upgrade paths. Everything gameplay-relevant about a tank lives here; the
 * 3D model builder (three/tankModel.js) reads `model` for its silhouette.
 *
 * Units: metres, seconds, radians/s for turn rates (written in deg/s and
 * converted by tankStats). Armor is a flat damage reduction fraction.
 */
import { DEG } from "./util.js";

/** weapon kinds:
 *  shell  — single ballistic shell with a small splash
 *  burst  — fast light shells fired in bursts
 *  rail   — charges, then a near-instant piercing slug
 *  flame  — short-range energy stream with heat build-up (overheats)
 *  clip   — rapid-fire magazine, then a long reload
 *  plasma — straight-flying (no gravity) plasma bolts with a small splash
 *  he     — heavy high-explosive shell, big splash, slow reload */
export const TANKS = [
  {
    id: "striker",
    name: "Striker",
    cls: "Medium",
    role: "Balanced combat tank",
    blurb: "A dependable all-rounder. Good armor, good gun, field repairs keep it in the fight.",
    price: 0,
    hp: 820,
    armor: 0.15,
    speed: 12,
    accel: 9,
    turn: 74,
    turret: 92,
    weapon: { kind: "shell", name: "105mm Cannon", damage: 125, reload: 2.0, speed: 150, gravity: 6, range: 170, splash: 2.6, splashMul: 0.35, spread: 0.0035, recoil: 0.6 },
    ability: "repair",
    model: "striker",
  },
  {
    id: "scout",
    name: "Scout",
    cls: "Light",
    role: "Fast flanker",
    blurb: "Paper-thin armor, blistering speed. Burst autocannon and a nitro dash to hit and vanish.",
    price: 1600,
    hp: 700,
    armor: 0.1,
    speed: 16.5,
    accel: 15,
    turn: 98,
    turret: 150,
    weapon: { kind: "burst", name: "30mm Autocannon", damage: 33, burst: 3, burstGap: 0.08, reload: 0.95, speed: 185, gravity: 4, range: 125, splash: 0, spread: 0.005, recoil: 0.18 },
    ability: "nitro",
    model: "scout",
  },
  {
    id: "phantom",
    name: "Phantom",
    cls: "Light",
    role: "Stealth hunter",
    blurb: "Angular low-profile hull and a plasma projector. Cloak to slip past the front line.",
    price: 3400,
    hp: 720,
    armor: 0.1,
    speed: 15,
    accel: 13,
    turn: 102,
    turret: 132,
    weapon: { kind: "plasma", name: "Plasma Projector", damage: 94, reload: 1.1, speed: 130, gravity: 0, range: 135, splash: 2.0, splashMul: 0.4, spread: 0.004, recoil: 0.25 },
    ability: "cloak",
    model: "phantom",
  },
  {
    id: "blazer",
    name: "Blazer",
    cls: "Medium",
    role: "Close-range brawler",
    blurb: "Pours a searing energy stream at short range. Sets targets ablaze; Inferno blasts everything nearby.",
    price: 3000,
    hp: 1000,
    armor: 0.22,
    speed: 13.5,
    accel: 11.5,
    turn: 82,
    turret: 115,
    weapon: { kind: "flame", name: "Ion Flamer", dps: 170, rate: 18, speed: 34, gravity: -1.5, range: 27, heatTime: 4.2, coolTime: 2.6, spread: 0.07, burn: 2.5, burnDps: 14, recoil: 0 },
    ability: "inferno",
    model: "blazer",
  },
  {
    id: "thunder",
    name: "Thunder",
    cls: "Medium",
    role: "Rapid-fire suppressor",
    blurb: "Rotary cannon with an 8-shell magazine. Shreds anything caught in the open, then reloads.",
    price: 4400,
    hp: 860,
    armor: 0.15,
    speed: 11.5,
    accel: 9,
    turn: 72,
    turret: 104,
    weapon: { kind: "clip", name: "Rotary Cannon", damage: 37, clip: 8, gap: 0.21, reload: 3.4, speed: 155, gravity: 5, range: 135, splash: 0.9, splashMul: 0.3, spread: 0.007, recoil: 0.22 },
    ability: "overclock",
    model: "thunder",
  },
  {
    id: "guardian",
    name: "Guardian",
    cls: "Heavy",
    role: "Armored anchor",
    blurb: "Thick sloped armor and an energy shield. Holds a choke point against anything.",
    price: 5200,
    hp: 1120,
    armor: 0.26,
    speed: 8.8,
    accel: 6.2,
    turn: 56,
    turret: 62,
    weapon: { kind: "shell", name: "120mm Cannon", damage: 150, reload: 3.0, speed: 135, gravity: 6, range: 160, splash: 3.0, splashMul: 0.35, spread: 0.004, recoil: 0.9 },
    ability: "shield",
    model: "guardian",
  },
  {
    id: "sniper",
    name: "Sniper",
    cls: "Tank destroyer",
    role: "Long-range precision",
    blurb: "Electromagnetic rail cannon: charge, then a slug that pierces every tank in its path.",
    price: 6000,
    hp: 700,
    armor: 0.12,
    speed: 11,
    accel: 8,
    turn: 66,
    turret: 70,
    weapon: { kind: "rail", name: "Rail Cannon", damage: 245, charge: 0.55, reload: 3.2, speed: 650, gravity: 0, range: 280, splash: 0, spread: 0.0008, recoil: 1.0, pierce: true },
    ability: "focus",
    model: "sniper",
  },
  {
    id: "titan",
    name: "Titan",
    cls: "Super-heavy",
    role: "Heavy assault",
    blurb: "A rolling fortress with a high-explosive howitzer. Calls an artillery barrage on its target.",
    price: 9000,
    hp: 1300,
    armor: 0.28,
    speed: 7.6,
    accel: 5.2,
    turn: 48,
    turret: 52,
    weapon: { kind: "he", name: "155mm HE Howitzer", damage: 195, reload: 4.0, speed: 108, gravity: 9, range: 155, splash: 5.0, splashMul: 0.45, spread: 0.005, recoil: 1.2 },
    ability: "barrage",
    model: "titan",
  },
];

export const TANK_BY_ID = Object.fromEntries(TANKS.map((t) => [t.id, t]));
export const tankById = (id) => TANK_BY_ID[id] || TANKS[0];

/** special abilities: dur = active seconds, cd = cooldown after use */
export const ABILITIES = {
  nitro: { name: "Nitro Dash", key: "nitro", dur: 3.5, cd: 14, blurb: "+65% speed and double acceleration for 3.5 s." },
  repair: { name: "Field Repair", key: "repair", dur: 2.5, cd: 20, blurb: "Restores 40% health over 2.5 s." },
  shield: { name: "Energy Shield", key: "shield", dur: 5, cd: 18, blurb: "Blocks 65% of incoming damage for 5 s." },
  focus: { name: "Focus Mode", key: "focus", dur: 6, cd: 18, blurb: "Half charge time, +35% damage for 6 s." },
  inferno: { name: "Inferno Blast", key: "inferno", dur: 0.6, cd: 16, blurb: "Fiery shockwave: up to 140 damage within 10 m, sets targets ablaze." },
  overclock: { name: "Overclock", key: "overclock", dur: 5, cd: 18, blurb: "Double fire rate, no ammo used for 5 s." },
  cloak: { name: "Cloak", key: "cloak", dur: 7, cd: 18, blurb: "Invisible beyond 12 m for 7 s. Firing reveals you." },
  barrage: { name: "Artillery Barrage", key: "barrage", dur: 2.4, cd: 24, blurb: "Six shells rain down around your aim point." },
};

/* ------------------------------------------------------------------ upgrades */
export const UPGRADE_KEYS = ["armor", "speed", "damage"];
export const UPGRADE_MAX = 5;
export const UPGRADE_INFO = {
  armor: { name: "Armor", blurb: "+6% health, +2.5% armor per level" },
  speed: { name: "Mobility", blurb: "+4% speed, +5% accel & turning per level" },
  damage: { name: "Firepower", blurb: "+6% weapon damage per level" },
};
const UP_BASE = [350, 650, 1050, 1550, 2200];
export function upgradeCost(tankId, key, level) {
  if (level >= UPGRADE_MAX) return Infinity;
  const t = tankById(tankId);
  const k = key === "damage" ? 1.1 : 1;
  return Math.round((UP_BASE[level] * (1 + t.price / 12000) * k) / 50) * 50;
}

/** final gameplay numbers for a tank with upgrade levels {armor, speed, damage} */
export function tankStats(id, up = {}) {
  const t = tankById(id);
  const a = Math.max(0, Math.min(UPGRADE_MAX, up.armor | 0));
  const s = Math.max(0, Math.min(UPGRADE_MAX, up.speed | 0));
  const d = Math.max(0, Math.min(UPGRADE_MAX, up.damage | 0));
  const w = t.weapon;
  const dmgMul = 1 + 0.06 * d;
  return {
    id: t.id,
    name: t.name,
    hp: Math.round(t.hp * (1 + 0.06 * a)),
    armor: Math.min(0.55, t.armor + 0.025 * a),
    speed: t.speed * (1 + 0.04 * s),
    accel: t.accel * (1 + 0.05 * s),
    turn: t.turn * (1 + 0.05 * s) * DEG,
    turret: t.turret * DEG,
    weapon: { ...w, damage: w.damage ? w.damage * dmgMul : 0, dps: w.dps ? w.dps * dmgMul : 0, burnDps: w.burnDps ? w.burnDps * dmgMul : 0 },
    ability: t.ability,
    model: t.model,
    up: { armor: a, speed: s, damage: d },
  };
}

/** sustained damage per second (for the garage stat bars) */
export function weaponDps(w) {
  switch (w.kind) {
    case "flame":
      return w.dps + (w.burnDps || 0) * 0.5;
    case "burst":
      return (w.damage * w.burst) / (w.reload + w.burstGap * (w.burst - 1));
    case "clip":
      return (w.damage * w.clip) / (w.gap * (w.clip - 1) + w.reload);
    case "rail":
      return w.damage / (w.reload + w.charge);
    default:
      return (w.damage * (1 + (w.splash ? 0.15 : 0))) / w.reload;
  }
}
/** damage of a single trigger pull (for the garage) */
export function weaponAlpha(w) {
  if (w.kind === "flame") return w.dps;
  if (w.kind === "burst") return w.damage * w.burst;
  if (w.kind === "clip") return w.damage * w.clip;
  return w.damage;
}

/* ------------------------------------------------------------------ skins */
/** pattern: plain | digital | tiger | hex | splinter | blocks | wave
 *  base/accent/detail are paint colours; trim is the emissive light colour */
export const SKINS = {
  striker: [
    { id: "factory", name: "Factory Olive", cost: 0, base: "#5d6b45", accent: "#3f4a2e", detail: "#2a2f22", pattern: "plain", trim: "#9fe6ff" },
    { id: "woodland", name: "Woodland", cost: 900, base: "#58653f", accent: "#2f3a24", detail: "#8a7a4e", pattern: "splinter", trim: "#9fe6ff" },
    { id: "royal", name: "Royal Guard", cost: 1800, base: "#24365e", accent: "#c9a24a", detail: "#121a2c", pattern: "wave", trim: "#ffd27a" },
  ],
  scout: [
    { id: "factory", name: "Sand Runner", cost: 0, base: "#b99a68", accent: "#8a6f45", detail: "#4a3b24", pattern: "plain", trim: "#ffcf7a" },
    { id: "digital", name: "Digital Dune", cost: 900, base: "#c2a573", accent: "#7d6440", detail: "#e3d0a5", pattern: "digital", trim: "#ffcf7a" },
    { id: "racer", name: "Racer Red", cost: 1800, base: "#b5241f", accent: "#f2f2f2", detail: "#1b1b1f", pattern: "blocks", trim: "#ff5a3d" },
  ],
  phantom: [
    { id: "factory", name: "Graphite", cost: 0, base: "#34383e", accent: "#1e2126", detail: "#5a6069", pattern: "plain", trim: "#a77bff" },
    { id: "night", name: "Night Hex", cost: 1100, base: "#272a35", accent: "#3b3f52", detail: "#141620", pattern: "hex", trim: "#7b9bff" },
    { id: "venom", name: "Venom", cost: 2200, base: "#1d2a20", accent: "#59ff9b", detail: "#0d140f", pattern: "splinter", trim: "#59ff9b" },
  ],
  blazer: [
    { id: "factory", name: "Furnace", cost: 0, base: "#6e3a26", accent: "#2e2523", detail: "#c2632a", pattern: "plain", trim: "#ff8a2a" },
    { id: "ember", name: "Ember Tiger", cost: 1000, base: "#8a4422", accent: "#1d1716", detail: "#d98a3d", pattern: "tiger", trim: "#ff8a2a" },
    { id: "magma", name: "Magma", cost: 2000, base: "#1a1414", accent: "#ff4a12", detail: "#3a1a10", pattern: "wave", trim: "#ff5a12" },
  ],
  thunder: [
    { id: "factory", name: "Steel Grey", cost: 0, base: "#5a6168", accent: "#363b40", detail: "#20242a", pattern: "plain", trim: "#ffe06a" },
    { id: "urban", name: "Urban Blocks", cost: 1100, base: "#7a8088", accent: "#4a4f56", detail: "#2a2e33", pattern: "blocks", trim: "#ffe06a" },
    { id: "storm", name: "Storm Front", cost: 2200, base: "#253046", accent: "#f2c230", detail: "#141a26", pattern: "digital", trim: "#ffd23a" },
  ],
  guardian: [
    { id: "factory", name: "Fortress Green", cost: 0, base: "#4a5640", accent: "#2f3729", detail: "#1d221a", pattern: "plain", trim: "#7affc8" },
    { id: "arctic", name: "Arctic", cost: 1200, base: "#d9dee2", accent: "#8f9aa3", detail: "#4c565e", pattern: "splinter", trim: "#9fe6ff" },
    { id: "bulwark", name: "Bulwark Gold", cost: 2400, base: "#2a2620", accent: "#c79a3a", detail: "#14120f", pattern: "hex", trim: "#ffcf6a" },
  ],
  sniper: [
    { id: "factory", name: "Field Tan", cost: 0, base: "#8a7d5c", accent: "#5a5139", detail: "#2c281d", pattern: "plain", trim: "#6ad8ff" },
    { id: "ghillie", name: "Ghillie", cost: 1200, base: "#5c6a3d", accent: "#384223", detail: "#8c8b55", pattern: "tiger", trim: "#6ad8ff" },
    { id: "ice", name: "Cryo", cost: 2400, base: "#e8eef2", accent: "#3aa8e0", detail: "#20303c", pattern: "wave", trim: "#4ad0ff" },
  ],
  titan: [
    { id: "factory", name: "Iron", cost: 0, base: "#4d4f4c", accent: "#2d2f2d", detail: "#6d5a3a", pattern: "plain", trim: "#ff6a3a" },
    { id: "desert", name: "Desert Storm", cost: 1500, base: "#a8885a", accent: "#6a5236", detail: "#d4b98a", pattern: "digital", trim: "#ffb04a" },
    { id: "warlord", name: "Warlord", cost: 3000, base: "#1a1a1c", accent: "#b81f1f", detail: "#3a3a3e", pattern: "tiger", trim: "#ff3a2a" },
  ],
};
export const skinFor = (tankId, skinId) => {
  const list = SKINS[tankId] || SKINS.striker;
  return list.find((s) => s.id === skinId) || list[0];
};

/** team paint overrides (AI tanks in team modes wear team colours) */
export const TEAM_SKIN = [
  { id: "team0", name: "Blue Team", base: "#2f5b8f", accent: "#1c3554", detail: "#9ec3e6", pattern: "splinter", trim: "#4ab0ff" },
  { id: "team1", name: "Red Team", base: "#8f2f2a", accent: "#4e1a17", detail: "#e6a49e", pattern: "splinter", trim: "#ff5a4a" },
];
export const TEAM_COLORS = ["#3fa9ff", "#ff5245"];
export const DM_COLORS = ["#ffc23d", "#ff5245", "#3fd17a", "#b07bff", "#3fd4ff", "#ff8ad8", "#ff8a2a", "#c8e05a"];
