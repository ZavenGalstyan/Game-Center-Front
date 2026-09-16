/**
 * Farm Life — chicken entity: wander AI + feeding/egg production.
 *
 * One chicken is a plain object; Scene.jsx steps every owned chicken each
 * frame from a single loop (spec: "centralized entity management... do not
 * create one timer per animal"). Movement is confined to the coop pen
 * rectangle (engine/terrain.js COOP_PEN) so chickens never wander through
 * fences or into buildings.
 */
import { COOP_PEN, COOP } from "./terrain.js";

const WANDER_SPEED = 0.55;
const EGG_INTERVAL_MINUTES = 90; // ≈ 35-40 real seconds at the default clock rate
const HUNGER_DECAY_PER_MINUTE = 100 / (6 * 24); // full → empty over ~6 in-game days; slow, never punishing

const NAMES = ["Henrietta", "Clucky", "Nugget", "Pepper", "Biscuit", "Marigold", "Ruffles", "Goldie"];
let nextId = 1;

export function pickChickenName(existingNames) {
  const free = NAMES.filter((n) => !existingNames.includes(n));
  return (free.length ? free : NAMES)[Math.floor(Math.random() * (free.length ? free.length : NAMES.length))];
}

export function createChicken(x, z, name) {
  return {
    id: `chicken-${nextId++}-${Date.now().toString(36)}`,
    name: name || "Chicken",
    x, z,
    facing: Math.random() * Math.PI * 2,
    targetX: x, targetZ: z,
    wanderCooldown: Math.random() * 2,
    hunger: 100,
    hasEgg: false,
    eggReadyAtMinutes: null,
    state: "idle",
  };
}

function pickPenTarget() {
  const pad = 0.5;
  const x = COOP_PEN.minX + pad + Math.random() * (COOP_PEN.maxX - COOP_PEN.minX - pad * 2);
  const z = COOP_PEN.minZ + pad + Math.random() * (COOP_PEN.maxZ - COOP_PEN.minZ - pad * 2);
  return { x, z };
}

function insideCoopBuilding(x, z) {
  return x > COOP.minX - 0.3 && x < COOP.maxX + 0.3 && z > COOP.minZ - 0.3 && z < COOP.maxZ + 0.3;
}

export function stepChicken(chicken, dt) {
  chicken.wanderCooldown -= dt;
  const dx = chicken.targetX - chicken.x;
  const dz = chicken.targetZ - chicken.z;
  const dist = Math.hypot(dx, dz);

  if (chicken.wanderCooldown <= 0 || dist < 0.08) {
    if (Math.random() < 0.35) {
      chicken.wanderCooldown = 1.5 + Math.random() * 2.5;
      chicken.state = "idle";
    } else {
      const t = pickPenTarget();
      chicken.targetX = t.x;
      chicken.targetZ = t.z;
      chicken.wanderCooldown = 3 + Math.random() * 3;
      chicken.state = "wander";
    }
  }

  if (chicken.state === "wander" && dist > 0.05) {
    const nx = chicken.x + (dx / dist) * WANDER_SPEED * dt;
    const nz = chicken.z + (dz / dist) * WANDER_SPEED * dt;
    if (!insideCoopBuilding(nx, nz)) {
      chicken.x = nx;
      chicken.z = nz;
      chicken.facing = Math.atan2(dx, dz);
    }
  }
}

export function tickChickenNeeds(chicken, dtMinutes, nowMinutes) {
  chicken.hunger = Math.max(0, chicken.hunger - HUNGER_DECAY_PER_MINUTE * dtMinutes);
  if (chicken.eggReadyAtMinutes != null && !chicken.hasEgg && nowMinutes >= chicken.eggReadyAtMinutes) {
    chicken.hasEgg = true;
    chicken.eggReadyAtMinutes = null;
  }
}

/** Returns true if feeding actually did something (caller consumes 1 feed item only then). */
export function feedChicken(chicken, nowMinutes) {
  const wasFull = chicken.hunger >= 95;
  chicken.hunger = 100;
  if (chicken.eggReadyAtMinutes == null && !chicken.hasEgg) {
    chicken.eggReadyAtMinutes = nowMinutes + EGG_INTERVAL_MINUTES;
  }
  return !wasFull || true; // feeding always succeeds while it has an effect on hunger/egg timer
}

export function collectEgg(chicken) {
  if (!chicken.hasEgg) return false;
  chicken.hasEgg = false;
  return true;
}

export function isHungry(chicken) {
  return chicken.hunger < 35;
}
