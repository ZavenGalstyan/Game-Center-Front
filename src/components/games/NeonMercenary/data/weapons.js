/**
 * Weapon definitions. Instances in the inventory are {uid, id, rarity, level};
 * engine/profile.js → weaponStats() combines base × rarity × upgrade × player.
 *
 *  dmg      damage per bullet (per pellet for shotguns)
 *  rpm      rounds per minute          mag      magazine size
 *  reload   seconds                     spread   cone half-angle (degrees, hip)
 *  range    metres (damage falls to 55% at max range)
 *  recoil   camera kick per shot (degrees)
 *  ammo     reserve pool ('pistol' is unlimited so the player never runs dry)
 */
export const RARITY = ["common", "uncommon", "rare", "epic", "legendary"];
export const RARITY_LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
export const RARITY_COLOR = { common: "#c9ced8", uncommon: "#4dff9a", rare: "#3fb6ff", epic: "#c26bff", legendary: "#ffb02e" };
export const RARITY_MULT = { common: 1, uncommon: 1.08, rare: 1.17, epic: 1.27, legendary: 1.38 };
export const MAX_UPGRADE = 5;

export const AMMO = {
  pistol: { name: "Pistol Rounds", unlimited: true, max: 999 },
  light: { name: "Light Rounds", max: 360 },
  heavy: { name: "Heavy Rounds", max: 72 },
  shell: { name: "Shells", max: 64 },
  rifle: { name: "Rifle Rounds", max: 300 },
  cell: { name: "Energy Cells", max: 160 },
};

export const WEAPONS = {
  pistol: { name: "M-10 Standard Pistol", short: "M-10", type: "pistol", slot: "ranged", dmg: 18, rpm: 330, auto: false, mag: 12, reload: 1.25, spread: 1.5, range: 45, recoil: 1.1, ammo: "pistol", price: 200, color: "#9aa3b5", sound: "pistol", desc: "Reliable sidearm. Never runs out of ammo." },
  heavyPistol: { name: "Kongō Heavy Pistol", short: "Kongō", type: "heavyPistol", slot: "ranged", dmg: 44, rpm: 125, auto: false, mag: 6, reload: 1.7, spread: 1.0, range: 55, recoil: 3.4, ammo: "heavy", price: 900, color: "#e0a050", sound: "heavy", desc: "Hand cannon. Slow, brutal, accurate." },
  smg: { name: "Viper SMG", short: "Viper", type: "smg", slot: "ranged", dmg: 11, rpm: 780, auto: true, mag: 32, reload: 1.8, spread: 3.4, range: 30, recoil: 0.7, ammo: "light", price: 1100, color: "#4de0ff", sound: "smg", desc: "Spray-and-pray street favourite." },
  shotgun: { name: "Breaker Shotgun", short: "Breaker", type: "shotgun", slot: "ranged", dmg: 11, pellets: 8, rpm: 72, auto: false, mag: 6, reload: 2.3, spread: 6.5, range: 18, recoil: 4.6, ammo: "shell", price: 1400, color: "#ff8a3d", sound: "shotgun", desc: "Eight pellets of close-quarters persuasion." },
  ar: { name: "Ronin AR-7", short: "Ronin", type: "ar", slot: "ranged", dmg: 19, rpm: 610, auto: true, mag: 30, reload: 2.1, spread: 1.9, range: 70, recoil: 1.2, ammo: "rifle", price: 2400, color: "#b0ff4d", sound: "ar", desc: "Military assault rifle with a stable recoil pattern." },
  energy: { name: "Halcyon LX Energy Rifle", short: "LX-9", type: "energy", slot: "ranged", dmg: 36, rpm: 230, auto: false, mag: 18, reload: 2.4, spread: 0.55, range: 90, recoil: 1.0, ammo: "cell", pierce: 2, vsRobot: 1.35, price: 4200, color: "#7b8cff", sound: "energy", desc: "Corporate beam rifle. Pierces two targets; extra damage to machines and shields." },
  blade: { name: "Cyber Blade", short: "Blade", type: "blade", slot: "melee", dmg: 42, rpm: 140, auto: true, melee: true, reach: 2.6, arc: 110, ammo: null, mag: 0, reload: 0, spread: 0, range: 2.6, recoil: 0, price: 1600, color: "#ff2bd6", sound: "blade", desc: "Monomolecular katana. Three-hit combo; the third slash staggers." },
  // boss rewards (unique variants of the base types)
  fangspitter: { name: "Fangspitter", base: "smg", type: "smg", slot: "ranged", dmg: 13, rpm: 900, auto: true, mag: 40, reload: 1.6, spread: 3.0, range: 32, recoil: 0.7, ammo: "light", price: 3200, unique: true, color: "#ff3b5c", sound: "smg", desc: "Razor's custom SMG. Absurd fire rate, oversized drum." },
  jawbreaker: { name: "Jawbreaker", base: "shotgun", type: "shotgun", slot: "ranged", dmg: 14, pellets: 9, rpm: 90, auto: false, mag: 8, reload: 2.0, spread: 5.5, range: 22, recoil: 4.2, ammo: "shell", price: 4400, unique: true, color: "#ffb02e", sound: "shotgun", desc: "Ironjaw's arm-cannon, refitted for human hands." },
  wraith: { name: "Wraith", base: "heavyPistol", type: "heavyPistol", slot: "ranged", dmg: 58, rpm: 140, auto: false, mag: 7, reload: 1.5, spread: 0.6, range: 70, recoil: 3.0, ammo: "heavy", critBonus: 0.15, price: 6000, unique: true, color: "#9fe7ff", sound: "heavy", desc: "Specter-9's sidearm. +15% critical chance." },
  sovereign: { name: "Sovereign", base: "energy", type: "energy", slot: "ranged", dmg: 46, rpm: 300, auto: true, mag: 24, reload: 2.0, spread: 0.6, range: 95, recoil: 0.9, ammo: "cell", pierce: 3, vsRobot: 1.4, price: 9000, unique: true, color: "#ff2bd6", sound: "energy", desc: "Director Vex's personal rifle. Fully automatic beam." },
};

/** Upgrade cost to go from `level` to `level+1`. */
export function upgradeCost(def, rarity, level) {
  const r = RARITY.indexOf(rarity);
  const credits = Math.round((def.price * 0.35 + 150) * (1 + level * 0.6) * (1 + r * 0.15));
  const mats = { scrap: 2 + level * 2 };
  if (level >= 1) mats.circuit = level;
  if (level >= 3) mats.nanofiber = level - 2;
  if (level >= 4) mats.quantum = 1;
  return { credits, mats };
}
