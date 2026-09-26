/**
 * Supermarket Rush — store tiers.
 *
 * A "tier" is one of the three store sizes the player progresses through
 * (Small Market → Neighborhood Store → Supermarket, see data/levels.js for
 * which levels belong to which). Each tier is a *procedural* layout: one
 * aisle per non-dairy category plus a dairy fridge, laid out along evenly
 * spaced corridors, a checkout row near the entrance, and a warehouse at
 * the back. Bigger tiers get more headroom, bigger shelf capacities, more
 * checkout lanes and a couple of decorative-only sections (produce/frozen)
 * for visual richness — see the "decorative" flag below.
 *
 * A level (data/levels.js) doesn't get its own hand-placed geometry; it
 * just picks *which* of its tier's aisles/fridge/checkouts are open for
 * that shift (`activeAisles`, `activeFridge`, `activeCheckouts`) and what
 * the starting/target stock is. That's what makes Level 1 a tiny store and
 * Level 5 a fully-open one without either needing its own layout.
 */

import { ALL_PRODUCT_IDS } from "./products.js";

const AISLE_DEFS = [
  { id: "breakfast", label: "AISLE 1 — BREAKFAST", products: ["cereal", "bread", "coffee"] },
  { id: "drinks", label: "AISLE 2 — DRINKS", products: ["water", "juice", "soda"] },
  { id: "snacks", label: "AISLE 3 — SNACKS", products: ["chips", "cookies", "chocolate"] },
  { id: "household", label: "AISLE 4 — HOUSEHOLD", products: ["paperTowels", "soap", "cleaner"] },
];
const FRIDGE_PRODUCTS = ["milk", "yogurt", "cheese"];

const SHELF_SPACING = 2.6;
const AISLE_Z_START = 3.6;
const CORRIDOR_HALF_WIDTH = 1.35;

function buildAisle(def, corridorX) {
  const shelves = def.products.map((productId, i) => {
    const z = AISLE_Z_START + i * SHELF_SPACING;
    return {
      shelfId: `${def.id}-${productId}`,
      productId,
      x: corridorX - CORRIDOR_HALF_WIDTH,
      z,
      facing: "+x", // faces into the corridor
      deco: false,
    };
  });
  // A mirrored, always-fully-stocked decorative run on the far side of the
  // corridor — real aisles are two-sided; only the near side is a task shelf.
  const decoShelves = def.products.map((productId, i) => ({
    shelfId: `${def.id}-${productId}-deco`,
    pairId: `${def.id}-${productId}`,
    productId,
    x: corridorX + CORRIDOR_HALF_WIDTH,
    z: AISLE_Z_START + i * SHELF_SPACING,
    facing: "-x",
    deco: true,
  }));
  const zEnd = AISLE_Z_START + (def.products.length - 1) * SHELF_SPACING + 1.3;
  return { id: def.id, label: def.label, corridorX, shelves: [...shelves, ...decoShelves], zStart: AISLE_Z_START - 1.3, zEnd };
}

function buildFridge(x, zStart) {
  const shelves = FRIDGE_PRODUCTS.map((productId, i) => ({
    shelfId: `dairy-${productId}`,
    productId,
    x,
    z: zStart + i * SHELF_SPACING,
    facing: "-x",
    deco: false,
  }));
  return { id: "dairy", label: "DAIRY", x, shelves, zStart: zStart - 1.3, zEnd: zStart + (FRIDGE_PRODUCTS.length - 1) * SHELF_SPACING + 1.3 };
}

const TIER_DEFS = {
  small: {
    id: "small",
    name: "Small Market",
    corridors: [-6, -2, 2, 6],
    halfWidth: 9,
    capacityMult: 1,
    maxCheckouts: 1,
    trolley: false,
    decor: { produce: false, frozen: false },
  },
  neighborhood: {
    id: "neighborhood",
    name: "Neighborhood Store",
    corridors: [-9, -3, 3, 9],
    halfWidth: 13,
    capacityMult: 1.5,
    maxCheckouts: 2,
    trolley: true,
    decor: { produce: true, frozen: false },
  },
  supermarket: {
    id: "supermarket",
    name: "Supermarket",
    corridors: [-12, -4, 4, 12],
    halfWidth: 17,
    capacityMult: 2,
    maxCheckouts: 3,
    trolley: true,
    decor: { produce: true, frozen: true },
  },
};

const cache = new Map();

/** Builds (and memoizes) the full static layout for a tier. */
export function buildTierLayout(tierId) {
  if (cache.has(tierId)) return cache.get(tierId);
  const def = TIER_DEFS[tierId];
  if (!def) throw new Error(`Unknown tier: ${tierId}`);

  const aisles = AISLE_DEFS.map((a, i) => buildAisle(a, def.corridors[i]));
  const aisleZEnd = Math.max(...aisles.map((a) => a.zEnd));
  const fridgeX = def.halfWidth - 1.0;
  const fridge = buildFridge(fridgeX, AISLE_Z_START + 1.4);

  const crossBackZ = Math.max(aisleZEnd, fridge.zEnd) + 1.6;
  const warehouseDepth = 6 + def.maxCheckouts * 1.2;
  const warehouse = {
    x: 0,
    zStart: crossBackZ,
    zEnd: crossBackZ + warehouseDepth,
    boxSpawns: Array.from({ length: def.maxCheckouts + 1 }, (_, i) => ({
      x: -def.halfWidth + 2.5 + i * 3.2,
      z: crossBackZ + warehouseDepth * 0.55,
    })),
    backDoor: { x: 0, z: crossBackZ + warehouseDepth - 0.2 },
    pallets: Array.from({ length: def.maxCheckouts + 2 }, (_, i) => ({
      x: def.halfWidth - 2.2,
      z: crossBackZ + 1.5 + i * 1.8,
    })),
  };

  // Checkouts hug the left wall (facing +x, into the store) and cart return
  // hugs the right wall — both clear of the aisle corridors and the open
  // cross-aisle in front of the entrance, so queues never block foot traffic.
  const checkoutX = -def.halfWidth + 1.3;
  const checkoutSpacing = 2.4;
  const checkouts = Array.from({ length: def.maxCheckouts }, (_, i) => ({
    id: `checkout-${i + 1}`,
    x: checkoutX,
    z: 2.1 + i * checkoutSpacing,
  }));

  const cartCorral = { x: def.halfWidth - 1.3, z: 2.2 };

  const decorSpots = [];
  if (def.decor.produce) decorSpots.push({ kind: "produce", x: -def.halfWidth + 1.6, z: crossBackZ - 1.6 });
  if (def.decor.frozen) decorSpots.push({ kind: "frozen", x: def.halfWidth - 1.6, z: crossBackZ - 1.6 });

  const bounds = { width: def.halfWidth * 2, depth: warehouse.zEnd + 1.5 };

  const layout = {
    tierId,
    name: def.name,
    bounds,
    halfWidth: def.halfWidth,
    entrance: { x: 0, z: 0, halfWidth: 1.4 },
    aisles,
    fridge,
    checkouts,
    warehouse,
    cartCorral,
    decorSpots,
    trolleyAvailable: def.trolley,
    capacityMult: def.capacityMult,
  };
  cache.set(tierId, layout);
  return layout;
}

/** All shelf definitions in a tier (aisles + fridge), task shelves only (no deco). */
export function tierTaskShelves(layout) {
  const shelves = [];
  for (const aisle of layout.aisles) for (const s of aisle.shelves) if (!s.deco) shelves.push({ ...s, aisleId: aisle.id, aisleLabel: aisle.label });
  for (const s of layout.fridge.shelves) shelves.push({ ...s, aisleId: "dairy", aisleLabel: layout.fridge.label });
  return shelves;
}

/** Every shelf, including decorative mirrors — for rendering. */
export function tierAllShelves(layout) {
  const shelves = [];
  for (const aisle of layout.aisles) for (const s of aisle.shelves) shelves.push({ ...s, aisleId: aisle.id });
  for (const s of layout.fridge.shelves) shelves.push({ ...s, aisleId: "dairy" });
  return shelves;
}

export function tierIds() {
  return Object.keys(TIER_DEFS);
}

export { ALL_PRODUCT_IDS };
