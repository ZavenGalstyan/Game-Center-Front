/**
 * Supermarket Rush — turns a level + its tier layout (data/tiers.js) into
 * the actual runtime world: which shelves exist this shift and how full
 * they start, collision colliders for the player, and the waypoint "lanes"
 * the customer AI walks along. Nothing here is React or Three.js — the
 * scene just reads this object and the gameStore mutations it drives.
 */
import { buildTierLayout, tierAllShelves } from "../data/tiers.js";
import { getProduct } from "../data/products.js";

const APPROACH = 1.1; // how far in front of a shelf's face the walking lane / interact point sits
const SHELF_HALF_WIDTH = 0.52;
const SHELF_DEPTH = 0.5;
const WALL_T = 0.3;
const FRONT_CROSS_BUFFER = 0.7;

function approachX(shelf) {
  return shelf.facing === "+x" ? shelf.x + APPROACH : shelf.x - APPROACH;
}

function shelfCollider(shelf) {
  return shelf.facing === "+x"
    ? { minX: shelf.x - SHELF_DEPTH, maxX: shelf.x, minZ: shelf.z - SHELF_HALF_WIDTH, maxZ: shelf.z + SHELF_HALF_WIDTH }
    : { minX: shelf.x, maxX: shelf.x + SHELF_DEPTH, minZ: shelf.z - SHELF_HALF_WIDTH, maxZ: shelf.z + SHELF_HALF_WIDTH };
}

/** Slot layout (row/column grid on the shelf face) for a given capacity. */
export function buildSlots(capacity) {
  const rows = capacity > 12 ? 3 : capacity > 6 ? 2 : 1;
  const cols = Math.max(1, Math.ceil(capacity / rows));
  const rowHeights = rows === 1 ? [0.78] : rows === 2 ? [0.44, 0.98] : [0.34, 0.74, 1.14];
  const spacing = Math.min(0.17, 0.92 / cols);
  const slots = [];
  let i = 0;
  for (let r = 0; r < rows && i < capacity; r++) {
    for (let c = 0; c < cols && i < capacity; c++) {
      slots.push({ zOff: (c - (cols - 1) / 2) * spacing, y: rowHeights[r] });
      i++;
    }
  }
  return slots;
}

function buildShelfRuntime(def, plan, deco) {
  const product = getProduct(def.productId);
  const capacity = deco ? Math.max(4, plan?.capacity ?? product.boxCapacity) : plan.capacity;
  const stock = deco ? capacity : Math.min(plan.start, capacity);
  return {
    shelfId: def.shelfId,
    productId: def.productId,
    aisleId: def.aisleId,
    aisleLabel: def.aisleLabel || null,
    x: def.x,
    z: def.z,
    facing: def.facing,
    deco,
    capacity,
    stock,
    slots: buildSlots(capacity),
    collider: shelfCollider(def),
    interactPoint: { x: approachX(def), z: def.z },
  };
}

function checkoutRuntime(def, index) {
  const cx = def.x, cz = def.z;
  return {
    id: def.id,
    x: cx,
    z: cz,
    collider: { minX: cx, maxX: cx + 0.6, minZ: cz - 0.6, maxZ: cz + 0.6 },
    operatePoint: { x: cx - 0.45, z: cz },
    queuePoint: (k) => ({ x: cx + 1.15 + k * 0.78, z: cz }),
    index,
  };
}

/**
 * Builds the full runtime world for a level: active shelves (with starting
 * stock), the collider list for player movement, checkout counters, the
 * warehouse, cart corral, decorative sections, and the nav data the
 * customer AI needs to walk realistic, collision-free routes.
 */
export function buildWorld(level) {
  const layout = buildTierLayout(level.tier);
  const activeIds = new Set(Object.keys(level.stock));
  const all = tierAllShelves(layout);

  const shelves = [];
  for (const s of all) {
    if (s.deco) {
      if (!activeIds.has(s.pairId)) continue;
      const basePlan = level.stock[s.pairId];
      shelves.push(buildShelfRuntime(s, basePlan, true));
    } else {
      if (!activeIds.has(s.shelfId)) continue;
      shelves.push(buildShelfRuntime(s, level.stock[s.shelfId], false));
    }
  }

  const checkouts = layout.checkouts.slice(0, level.checkoutLanes).map(checkoutRuntime);

  const walls = [
    { minX: -layout.halfWidth - WALL_T, maxX: -layout.halfWidth, minZ: -WALL_T, maxZ: layout.bounds.depth + WALL_T },
    { minX: layout.halfWidth, maxX: layout.halfWidth + WALL_T, minZ: -WALL_T, maxZ: layout.bounds.depth + WALL_T },
    { minX: -layout.halfWidth, maxX: -layout.entrance.halfWidth, minZ: -WALL_T, maxZ: 0 },
    { minX: layout.entrance.halfWidth, maxX: layout.halfWidth, minZ: -WALL_T, maxZ: 0 },
    { minX: -layout.halfWidth, maxX: layout.halfWidth, minZ: layout.bounds.depth, maxZ: layout.bounds.depth + WALL_T },
  ];

  const pallets = layout.warehouse.pallets.map((p, i) => ({
    id: `pallet-${i}`,
    x: p.x,
    z: p.z,
    collider: { minX: p.x - 0.55, maxX: p.x + 0.55, minZ: p.z - 0.55, maxZ: p.z + 0.55 },
  }));

  const shelfColliders = shelves.map((s) => s.collider);
  const checkoutColliders = checkouts.map((c) => c.collider);
  const palletColliders = pallets.map((p) => p.collider);
  const colliders = [...walls, ...shelfColliders, ...checkoutColliders, ...palletColliders];

  // Nav lanes: group active, non-deco shelves by aisle/fridge so the
  // customer AI can walk "into" one lane, visit each stop, then leave via
  // the open front cross-aisle — see engine/customerAI.js `routeTo`.
  const laneGroups = new Map();
  for (const s of shelves) {
    if (s.deco) continue;
    const key = s.aisleId;
    if (!laneGroups.has(key)) laneGroups.set(key, { id: key, laneX: approachX(s), stops: [] });
    laneGroups.get(key).stops.push({ shelfId: s.shelfId, productId: s.productId, x: approachX(s), z: s.z });
  }
  const lanes = Array.from(laneGroups.values()).map((g) => ({
    ...g,
    stops: g.stops.sort((a, b) => a.z - b.z),
  }));
  const zStarts = [];
  for (const aisle of layout.aisles) if (laneGroups.has(aisle.id)) zStarts.push(aisle.zStart);
  if (laneGroups.has("dairy")) zStarts.push(layout.fridge.zStart);
  const frontCrossZ = (zStarts.length ? Math.min(...zStarts) : 2.0) - FRONT_CROSS_BUFFER;

  const nav = {
    door: { x: 0, z: 1.2 },
    frontCrossZ,
    lanes,
    checkouts: checkouts.map((c) => ({ id: c.id, x: c.x, z: c.z, queuePoint: c.queuePoint, operatePoint: c.operatePoint })),
  };

  return {
    level,
    layout,
    shelves,
    checkouts,
    walls,
    pallets,
    colliders,
    nav,
    cartCorral: layout.cartCorral,
    decorSpots: layout.decorSpots,
    warehouse: layout.warehouse,
    trolleyAvailable: level.trolley && layout.trolleyAvailable,
    playerSpawn: { x: 0, z: 1.5, yaw: Math.PI },
  };
}

export function findShelf(world, shelfId) {
  return world.shelves.find((s) => s.shelfId === shelfId) || null;
}

let entityUid = 0;

/** Loose carts, a spill and a fallen item to start the shift with, per the level's flags. */
export function buildShiftEntities(world, level) {
  const carts = [];
  if (level.carts) {
    const count = level.cartsTarget || 3;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      carts.push({
        id: `cart-${++entityUid}`,
        x: world.layout.entrance.x + Math.cos(angle) * 2.2,
        z: 2.8 + Math.sin(angle) * 1.4,
        yaw: 0,
        carried: false,
        returned: false,
      });
    }
  }

  const spills = [];
  if (level.spill) {
    const spot = world.shelves.find((s) => !s.deco) || null;
    spills.push({
      id: `spill-${++entityUid}`,
      x: spot ? spot.interactPoint.x + 0.6 : 0,
      z: spot ? spot.interactPoint.z + 0.9 : world.nav.frontCrossZ,
      progress: 0,
      cleaned: false,
    });
  }

  const fallen = [];
  if (level.fallen) {
    const candidates = world.shelves.filter((s) => !s.deco);
    const shelf = candidates[Math.floor(Math.random() * candidates.length)];
    if (shelf) {
      const dx = shelf.facing === "+x" ? 0.8 : -0.8;
      fallen.push({
        id: `fallen-${++entityUid}`,
        x: shelf.interactPoint.x + dx * 0.3,
        z: shelf.interactPoint.z + 0.3,
        productId: shelf.productId,
        shelfId: shelf.shelfId,
        state: "onFloor",
        resolved: false,
        spin: Math.random() * Math.PI,
      });
    }
  }

  return { carts, spills, fallen };
}

/** Applies the Shelf Capacity upgrade to a level's stock plan before building the world/tasks. */
export function withCapacityUpgrade(level, mult) {
  if (mult === 1) return level;
  const stock = {};
  for (const [id, plan] of Object.entries(level.stock)) {
    stock[id] = { capacity: Math.max(plan.capacity, Math.round(plan.capacity * mult)), start: plan.start };
  }
  return { ...level, stock };
}
