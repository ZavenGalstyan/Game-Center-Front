/**
 * Castle Rush — battlefield geometry shared by the engine and the renderer.
 *
 * The lane runs along X: the player castle on the left (−X), the enemy castle
 * on the right (+X). Z is the small sideways spread inside the road.
 */
export const FIELD = {
  wallX: 15, // |x| of each castle's front wall face
  gateInnerX: 16.2, // |x| where a fresh unit appears inside the gate
  gateOuterX: 14.8, // |x| where SPAWNING ends (unit has left the gate)
  castleX: 18.4, // |x| of each castle's centre
  roadHalf: 2.3,
  lanes: [0, 0.82, -0.82, 1.64, -1.64],
};

export const SIDES = ["player", "enemy"];
export const DIR = { player: 1, enemy: -1 };
export const other = (side) => (side === "player" ? "enemy" : "player");

/** Hard cap on living soldiers per side (keeps 40 active units worst case). */
export const ARMY_CAP = 20;

export const STEP = 1 / 60;
export const MAX_FRAME = 0.1;
export const MAX_STEPS = 24;

export const SPAWN_TIME = 0.55;
export const DYING_TIME = 1.25;
export const ENDING_TIME = 1.9;

/** Treasury upgrade (in-battle income): cost per level and income gained. */
export const TREASURY = { costs: [120, 200, 300], perLevel: 3 };

/**
 * Each castle's wall archer: a modest, symmetric defence so a lone survivor
 * can't grind a castle down for free and sieges need a real army. Fires
 * visible arrows (same projectile rules as Archers) at the closest attacker.
 */
export const TOWER = { range: 8.6, damage: 14, cooldown: 1.4, windup: 0.35, projectileSpeed: 16, height: 4.6 };

/** castle walls shrug off part of every blow (siege takes a committed push) */
export const CASTLE_ARMOR = 0.45;
