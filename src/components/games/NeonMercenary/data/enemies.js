/**
 * Enemy archetypes (bosses live in data/bosses.js).
 *
 *  hp / armor        armor = fraction of damage ignored (robots, heavies)
 *  shield            regenerating barrier (elite guards); EMP breaks it
 *  speed / run       m/s patrolling / pursuing
 *  weapon            kind: melee | hitscan | pellets | bolt (visible projectile)
 *                    dmg per hit, rate (shots/s), burst (shots per burst),
 *                    spread (radians), range (m), reach (melee)
 *  detect / fov      sight range (m) and field of view (degrees)
 *  reaction          seconds from full awareness to first shot
 *  aggression        0..1 (pushes forward vs holds cover)
 *  retreatAt         health fraction at which it falls back (0 = never)
 *  cover             uses cover spots      flank   tries to flank
 *  robot / flyer     EMP-able machine / hovering drone
 *  look              render description (render/characters.js, robots.js)
 */
export const ENEMIES = {
  gangFighter: {
    name: "Red Fang Brawler", faction: "gang", hp: 70, armor: 0, speed: 1.6, run: 5.4,
    weapon: { kind: "melee", dmg: 13, rate: 0.9, reach: 1.7, windup: 0.42 },
    detect: 22, fov: 120, reaction: 0.35, aggression: 0.95, retreatAt: 0, cover: false, flank: true,
    xp: 22, credits: [18, 40], drops: { scrap: 0.35, medkit: 0.12 },
    look: { body: "m", hair: "Hair_Buzzed", suit: "#1a1418", trim: "#ff3b5c", gear: "gang", mask: true, weapon: "pipe" },
  },
  gangGunner: {
    name: "Red Fang Gunner", faction: "gang", hp: 65, armor: 0, speed: 1.5, run: 4.4,
    weapon: { kind: "hitscan", dmg: 6, rate: 2.4, burst: 3, burstGap: 0.9, spread: 0.06, range: 34 },
    detect: 28, fov: 110, reaction: 0.6, aggression: 0.45, retreatAt: 0.25, cover: true, flank: false,
    xp: 25, credits: [20, 45], drops: { scrap: 0.3, medkit: 0.1, ammo: 0.6 },
    look: { body: "f", hair: "Hair_BuzzedFemale", suit: "#18121a", trim: "#ff2bd6", gear: "gang", weapon: "smg" },
  },
  gangHeavy: {
    name: "Red Fang Enforcer", faction: "gang", hp: 190, armor: 0.25, speed: 1.3, run: 3.3,
    weapon: { kind: "pellets", dmg: 4.5, pellets: 6, rate: 0.75, spread: 0.11, range: 16 },
    detect: 24, fov: 100, reaction: 0.7, aggression: 0.8, retreatAt: 0, cover: false, flank: false, heavy: true,
    xp: 60, credits: [60, 110], drops: { scrap: 0.8, medkit: 0.35, ammo: 0.9 },
    look: { body: "m", hair: "Hair_Beard", suit: "#221a14", trim: "#ffb02e", gear: "heavy", scale: 1.12, girth: 1.18, weapon: "shotgun" },
  },
  secBot: {
    name: "Sentinel Security Robot", faction: "machine", hp: 150, armor: 0.3, speed: 1.4, run: 3.6,
    weapon: { kind: "hitscan", dmg: 7, rate: 4, burst: 4, burstGap: 1.2, spread: 0.05, range: 40 },
    detect: 30, fov: 100, reaction: 0.55, aggression: 0.6, retreatAt: 0, cover: false, flank: true, robot: true,
    xp: 40, credits: [30, 60], drops: { circuit: 0.4, scrap: 0.6, ammo: 0.6 },
    look: { robot: "android", body: "m", paint: "#3a3f4a", trim: "#ffb02e", weapon: "ar" },
  },
  drone: {
    name: "Hornet Attack Drone", faction: "machine", hp: 45, armor: 0, speed: 4, run: 7.5,
    weapon: { kind: "bolt", dmg: 8, rate: 1.4, burst: 2, burstGap: 1.1, spread: 0.04, range: 30, boltSpeed: 30 },
    detect: 32, fov: 360, reaction: 0.4, aggression: 0.8, retreatAt: 0, cover: false, flank: true, robot: true, flyer: true,
    xp: 22, credits: [10, 25], drops: { circuit: 0.25, scrap: 0.3 },
    look: { robot: "drone", paint: "#2a2e36", trim: "#ff3b5c" },
  },
  corpSoldier: {
    name: "Halcyon Security Trooper", faction: "corp", hp: 120, armor: 0.15, speed: 1.6, run: 4.8,
    weapon: { kind: "hitscan", dmg: 8, rate: 5, burst: 4, burstGap: 0.9, spread: 0.045, range: 48 },
    detect: 32, fov: 110, reaction: 0.45, aggression: 0.55, retreatAt: 0.2, cover: true, flank: true,
    xp: 48, credits: [40, 80], drops: { scrap: 0.4, circuit: 0.2, medkit: 0.15, ammo: 0.7 },
    look: { body: "m", hair: null, suit: "#1b2230", trim: "#19f0ff", gear: "corp", helmet: true, weapon: "ar" },
  },
  eliteGuard: {
    name: "Halcyon Elite Guard", faction: "corp", hp: 170, armor: 0.2, shield: 80, speed: 1.6, run: 4.4,
    weapon: { kind: "bolt", dmg: 14, rate: 2.4, burst: 3, burstGap: 1.0, spread: 0.03, range: 55, boltSpeed: 42, energy: true },
    detect: 36, fov: 120, reaction: 0.4, aggression: 0.7, retreatAt: 0, cover: true, flank: true,
    xp: 85, credits: [80, 150], drops: { circuit: 0.4, nanofiber: 0.2, medkit: 0.2, ammo: 0.8 },
    look: { body: "f", hair: null, suit: "#141a28", trim: "#7b8cff", gear: "elite", helmet: true, weapon: "energy" },
  },
};
