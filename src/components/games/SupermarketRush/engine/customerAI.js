/**
 * Supermarket Rush — customer AI. Pure logic, no Three.js: a small state
 * machine per customer (enter → walk to each item on their list → walk to
 * checkout & queue, or straight to the exit if this shift has no checkout
 * yet → pay → leave) driven by straight-line waypoints. `routeTo` is the
 * one piece of "pathfinding" this needs — see its header — and it's enough
 * to reliably avoid every shelf, by design of the store layout.
 *
 * Cross-customer concerns (which checkout queue to join, when the front of
 * the queue actually gets served) are NOT decided here — that needs a view
 * of every customer at once, so the adapter (three/CustomersLayer.jsx) owns
 * the queue arrays and calls `sendToCheckoutQueue` / `startPaying` /
 * `sendToExit` at the right moments. This module just moves one customer
 * along whatever path it's been given and reports what happened.
 */
import { CUSTOMER_SPEED, CUSTOMER_SHOP_TIME, CUSTOMER_BASE_PATIENCE } from "./constants.js";

export const CUSTOMER_TYPES = [
  { kind: "young", color: "#3b82c4", speedMult: 1.1, patienceMult: 0.9 },
  { kind: "parent", color: "#c4703b", speedMult: 0.9, patienceMult: 1.2 },
  { kind: "elderly", color: "#8a7bab", speedMult: 0.72, patienceMult: 1.4 },
  { kind: "office", color: "#3c3c46", speedMult: 1.15, patienceMult: 0.8 },
  { kind: "student", color: "#4f9d5b", speedMult: 1.05, patienceMult: 1.0 },
];

let uid = 0;
export function nextCustomerId() {
  return `cust-${++uid}`;
}

/**
 * A straight line is only safe below the aisles (open floor). Two points on
 * the same lane (same x) can walk straight along it. Anything else leaves
 * its current lane to the front cross-aisle, crosses to the target's lane,
 * then walks in — see data/tiers.js / engine/storeBuild.js for why that
 * strip is always clear.
 */
export function routeTo(cur, target, frontZ) {
  if (Math.abs(cur.x - target.x) < 0.05) return [{ x: target.x, z: target.z }];
  const path = [];
  if (cur.z > frontZ + 0.05) path.push({ x: cur.x, z: frontZ });
  const midZ = Math.min(frontZ, target.z);
  path.push({ x: target.x, z: midZ });
  if (Math.abs(midZ - target.z) > 0.05) path.push({ x: target.x, z: target.z });
  return path;
}

function pickShoppingList(world, rng) {
  const lanes = world.nav.lanes.filter((l) => l.stops.length);
  if (!lanes.length) return [];
  const count = Math.min(lanes.length + 1, 1 + Math.floor(rng() * 3)); // 1-3 stops
  const picked = [];
  const laneCopy = [...lanes];
  for (let i = 0; i < count && laneCopy.length; i++) {
    const idx = Math.floor(rng() * laneCopy.length);
    const lane = laneCopy.splice(idx, 1)[0];
    const stop = lane.stops[Math.floor(rng() * lane.stops.length)];
    picked.push({ ...stop, taken: false });
  }
  return picked;
}

export function spawnCustomer(world, rng, wantsHelp) {
  const type = CUSTOMER_TYPES[Math.floor(rng() * CUSTOMER_TYPES.length)];
  const list = pickShoppingList(world, rng);
  const door = world.nav.door;
  return {
    id: nextCustomerId(),
    kind: type.kind,
    color: type.color,
    speed: CUSTOMER_SPEED * type.speedMult,
    patience: CUSTOMER_BASE_PATIENCE * type.patienceMult,
    x: door.x + (rng() - 0.5) * 0.6,
    z: door.z - 1.2,
    yaw: 0,
    state: "entering",
    path: [{ x: door.x, z: door.z }],
    shoppingList: list,
    stopIndex: 0,
    timer: 0,
    wantsHelp: Boolean(wantsHelp) && list.length > 0,
    helpAnswered: false,
    checkoutId: null,
    queueSlot: -1,
    queueWaitTime: 0,
    satisfactionBanked: false,
  };
}

function moveAlongPath(c, dt) {
  if (!c.path.length) return true;
  const target = c.path[0];
  const dx = target.x - c.x, dz = target.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.08) {
    c.path.shift();
    return c.path.length === 0;
  }
  const step = Math.min(d, c.speed * dt);
  c.x += (dx / d) * step;
  c.z += (dz / d) * step;
  c.yaw = Math.atan2(-dx, -dz);
  return false;
}

/**
 * Advances one customer by `dt`. Returns an array of events for the
 * adapter to react to: { type: 'takeItem'|'doneShopping'|'servedFinished' }.
 */
export function stepCustomer(c, dt, world) {
  const events = [];
  if (c.state === "shopping" || c.state === "paying") {
    c.timer -= dt;
    if (c.timer > 0) return events;
    if (c.state === "shopping") {
      c.stopIndex += 1;
      const next = c.shoppingList[c.stopIndex];
      if (next) {
        c.state = "toAisle";
        c.path = routeTo({ x: c.x, z: c.z }, next, world.nav.frontCrossZ);
      } else {
        c.state = "doneShopping";
        events.push({ type: "doneShopping", customerId: c.id });
      }
    } else {
      // finished paying
      c.state = "toExit";
      c.path = routeTo({ x: c.x, z: c.z }, world.nav.door, world.nav.frontCrossZ);
      events.push({ type: "paid", customerId: c.id });
    }
    return events;
  }
  if (c.state === "queueWait" || c.state === "doneShopping" || c.state === "done") return events;

  const arrived = moveAlongPath(c, dt);
  if (!arrived) return events;

  if (c.state === "entering") {
    const first = c.shoppingList[0];
    if (first) {
      c.state = "toAisle";
      c.path = routeTo({ x: c.x, z: c.z }, first, world.nav.frontCrossZ);
    } else {
      c.state = "doneShopping";
      events.push({ type: "doneShopping", customerId: c.id });
    }
  } else if (c.state === "toAisle") {
    const stop = c.shoppingList[c.stopIndex];
    if (stop && !stop.taken) {
      stop.taken = true;
      events.push({ type: "takeItem", customerId: c.id, shelfId: stop.shelfId, productId: stop.productId });
    }
    c.state = "shopping";
    c.timer = CUSTOMER_SHOP_TIME[0] + Math.random() * (CUSTOMER_SHOP_TIME[1] - CUSTOMER_SHOP_TIME[0]);
  } else if (c.state === "queue") {
    c.state = "queueWait";
  } else if (c.state === "toExit") {
    c.state = "done";
    events.push({ type: "exited", customerId: c.id });
  }
  return events;
}

/** Adapter calls this once a customer has decided to head for a checkout queue slot. */
export function sendToCheckoutQueue(c, checkoutId, slotPoint, world) {
  c.state = "queue";
  c.checkoutId = checkoutId;
  c.path = routeTo({ x: c.x, z: c.z }, slotPoint, world.nav.frontCrossZ);
}

/** Adapter calls this to move a queued customer up one slot. */
export function advanceInQueue(c, slotPoint) {
  c.state = "queue";
  c.path = [{ x: slotPoint.x, z: slotPoint.z }];
}

export function sendToExit(c, world) {
  c.state = "toExit";
  c.path = routeTo({ x: c.x, z: c.z }, world.nav.door, world.nav.frontCrossZ);
}

export function startPaying(c, seconds) {
  c.state = "paying";
  c.timer = seconds;
}
