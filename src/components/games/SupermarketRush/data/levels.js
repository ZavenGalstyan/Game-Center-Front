/**
 * Supermarket Rush — the 15 shifts.
 *
 * Each level names a tier (see data/tiers.js) and picks which of that
 * tier's shelves are open for the shift (`stock`, keyed by shelfId — see
 * `tierTaskShelves` for the id scheme: "<aisleId>-<productId>" or
 * "dairy-<productId>"), how many customers show up, and which secondary
 * mechanics are switched on (checkout lanes, carts, spills, the trolley,
 * a delivery truck). Nothing here draws geometry — engine/storeBuild.js
 * turns a level + its tier layout into the actual runtime world.
 */

import { buildTierLayout } from "./tiers.js";

function stock(pairs) {
  // pairs: { shelfId: [capacity, start] }
  const out = {};
  for (const [id, [capacity, start]] of Object.entries(pairs)) out[id] = { capacity, start };
  return out;
}

export const LEVELS = [
  {
    id: 1, tier: "small", name: "First Day",
    tutorial: true,
    stock: stock({ "dairy-milk": [4, 0], "breakfast-cereal": [4, 0] }),
    customers: 0, checkoutLanes: 0, carts: false, spill: false, fallen: false, trolley: false, delivery: false,
    targetTimeSec: null, basePay: 60,
  },
  {
    id: 2, tier: "small", name: "More Shelves",
    stock: stock({
      "dairy-milk": [4, 2], "breakfast-cereal": [4, 2],
      "drinks-water": [6, 1], "drinks-soda": [6, 1],
      "snacks-chips": [6, 1], "snacks-cookies": [6, 1],
    }),
    customers: 0, checkoutLanes: 0, carts: false, spill: false, fallen: false, trolley: false, delivery: false,
    targetTimeSec: null, basePay: 75,
  },
  {
    id: 3, tier: "small", name: "First Customers",
    stock: stock({
      "dairy-milk": [6, 3], "breakfast-cereal": [6, 3], "breakfast-bread": [4, 2],
      "drinks-water": [8, 4], "drinks-juice": [6, 3], "snacks-chips": [6, 3],
    }),
    customers: 3, checkoutLanes: 0, carts: false, spill: false, fallen: false, trolley: false, delivery: false,
    targetTimeSec: null, basePay: 90,
  },
  {
    id: 4, tier: "small", name: "Shopping Carts",
    stock: stock({
      "dairy-milk": [6, 3], "dairy-yogurt": [6, 3], "breakfast-cereal": [6, 3], "breakfast-coffee": [4, 2],
      "drinks-water": [8, 4], "drinks-soda": [6, 3], "snacks-cookies": [6, 3], "snacks-chocolate": [6, 3],
    }),
    customers: 4, checkoutLanes: 0, carts: true, cartsTarget: 3, spill: false, fallen: true, trolley: false, delivery: false,
    targetTimeSec: null, basePay: 100,
  },
  {
    id: 5, tier: "small", name: "Checkout",
    stock: stock({
      "dairy-milk": [6, 2], "dairy-yogurt": [6, 3], "dairy-cheese": [6, 3],
      "breakfast-cereal": [6, 2], "breakfast-bread": [4, 2], "breakfast-coffee": [4, 2],
      "drinks-water": [8, 3], "drinks-juice": [6, 3], "drinks-soda": [8, 4],
      "snacks-chips": [6, 3], "snacks-cookies": [6, 3], "snacks-chocolate": [8, 4],
      "household-paperTowels": [4, 2], "household-soap": [6, 3], "household-cleaner": [4, 2],
    }),
    customers: 5, checkoutLanes: 1, carts: true, cartsTarget: 3, spill: false, fallen: false, trolley: false, delivery: false,
    targetTimeSec: null, basePay: 120,
  },

  {
    id: 6, tier: "neighborhood", name: "Delivery Day",
    stock: stock({
      "dairy-milk": [8, 0], "breakfast-cereal": [8, 0], "breakfast-bread": [6, 0],
      "drinks-water": [10, 2], "snacks-chips": [8, 2],
    }),
    customers: 3, checkoutLanes: 1, carts: false, spill: false, fallen: false, trolley: false, delivery: true,
    targetTimeSec: null, basePay: 130,
  },
  {
    id: 7, tier: "neighborhood", name: "Spills",
    stock: stock({
      "dairy-milk": [8, 3], "dairy-yogurt": [8, 4], "breakfast-cereal": [8, 3], "breakfast-coffee": [6, 3],
      "drinks-juice": [8, 3], "drinks-soda": [10, 5], "snacks-cookies": [8, 4], "household-soap": [8, 4],
    }),
    customers: 4, checkoutLanes: 1, carts: false, spill: true, fallen: true, trolley: false, delivery: false,
    targetTimeSec: 420, basePay: 140,
  },
  {
    id: 8, tier: "neighborhood", name: "Busy Morning",
    stock: stock({
      "dairy-milk": [8, 1], "dairy-yogurt": [8, 2], "dairy-cheese": [6, 1],
      "breakfast-cereal": [8, 1], "breakfast-bread": [6, 1], "breakfast-coffee": [6, 2],
      "drinks-water": [10, 2], "drinks-juice": [8, 2], "drinks-soda": [10, 2],
      "snacks-chips": [8, 2], "snacks-cookies": [8, 2],
    }),
    customers: 7, checkoutLanes: 2, carts: true, cartsTarget: 4, spill: false, fallen: false, trolley: false, delivery: false,
    targetTimeSec: 480, basePay: 155,
  },
  {
    id: 9, tier: "neighborhood", name: "The Trolley",
    stock: stock({
      "dairy-milk": [8, 1], "dairy-yogurt": [8, 1], "dairy-cheese": [6, 1],
      "breakfast-cereal": [8, 1], "breakfast-bread": [6, 1], "breakfast-coffee": [6, 1],
      "drinks-water": [10, 2], "drinks-juice": [8, 1], "snacks-chocolate": [10, 2],
      "household-paperTowels": [6, 1], "household-cleaner": [6, 1],
    }),
    customers: 5, checkoutLanes: 2, carts: true, cartsTarget: 3, spill: false, fallen: false, trolley: true, delivery: false,
    targetTimeSec: 480, basePay: 165,
  },
  {
    id: 10, tier: "neighborhood", name: "Store Expansion",
    stock: stock({
      "dairy-milk": [8, 0], "dairy-yogurt": [8, 1], "dairy-cheese": [6, 0],
      "breakfast-cereal": [8, 0], "breakfast-bread": [6, 0], "breakfast-coffee": [6, 1],
      "drinks-water": [10, 1], "drinks-juice": [8, 1], "drinks-soda": [10, 1],
      "snacks-chips": [8, 1], "snacks-cookies": [8, 0], "snacks-chocolate": [10, 1],
      "household-paperTowels": [6, 0], "household-soap": [8, 1], "household-cleaner": [6, 0],
    }),
    customers: 6, checkoutLanes: 2, carts: true, cartsTarget: 4, spill: true, fallen: true, trolley: true, delivery: true,
    targetTimeSec: 520, basePay: 190,
  },

  {
    id: 11, tier: "supermarket", name: "Grand Opening",
    stock: stock({
      "dairy-milk": [10, 2], "dairy-yogurt": [10, 3], "breakfast-cereal": [10, 3], "breakfast-bread": [8, 2],
      "drinks-water": [12, 4], "drinks-soda": [12, 4], "snacks-chips": [10, 3], "household-soap": [10, 3],
    }),
    customers: 5, checkoutLanes: 2, carts: true, cartsTarget: 4, spill: false, fallen: false, trolley: true, delivery: false,
    targetTimeSec: 480, basePay: 200,
  },
  {
    id: 12, tier: "supermarket", name: "Full Aisles",
    stock: stock({
      "dairy-milk": [10, 1], "dairy-yogurt": [10, 2], "dairy-cheese": [8, 1],
      "breakfast-cereal": [10, 1], "breakfast-bread": [8, 1], "breakfast-coffee": [8, 2],
      "drinks-water": [12, 2], "drinks-juice": [10, 2], "drinks-soda": [12, 2],
      "snacks-chips": [10, 1], "snacks-cookies": [10, 1], "snacks-chocolate": [12, 2],
    }),
    customers: 8, checkoutLanes: 3, carts: true, cartsTarget: 5, spill: true, fallen: true, trolley: true, delivery: false,
    targetTimeSec: 520, basePay: 220,
  },
  {
    id: 13, tier: "supermarket", name: "Big Delivery",
    stock: stock({
      "dairy-milk": [10, 0], "dairy-yogurt": [10, 0], "dairy-cheese": [8, 0],
      "breakfast-cereal": [10, 0], "breakfast-bread": [8, 0], "breakfast-coffee": [8, 0],
      "household-paperTowels": [8, 0], "household-soap": [10, 0], "household-cleaner": [8, 0],
    }),
    customers: 6, checkoutLanes: 2, carts: false, spill: false, fallen: false, trolley: true, delivery: true,
    targetTimeSec: 540, basePay: 235,
  },
  {
    id: 14, tier: "supermarket", name: "Checkout Rush",
    stock: stock({
      "dairy-milk": [10, 3], "dairy-yogurt": [10, 3], "dairy-cheese": [8, 2],
      "breakfast-cereal": [10, 3], "breakfast-bread": [8, 2], "breakfast-coffee": [8, 3],
      "drinks-water": [12, 4], "drinks-juice": [10, 3], "drinks-soda": [12, 4],
      "snacks-chips": [10, 3], "snacks-cookies": [10, 3], "snacks-chocolate": [12, 4],
      "household-paperTowels": [8, 2], "household-soap": [10, 3], "household-cleaner": [8, 2],
    }),
    customers: 10, checkoutLanes: 3, carts: true, cartsTarget: 5, spill: false, fallen: false, trolley: true, delivery: false,
    targetTimeSec: 560, basePay: 250,
  },
  {
    id: 15, tier: "supermarket", name: "Full Supermarket",
    stock: stock({
      "dairy-milk": [10, 1], "dairy-yogurt": [10, 1], "dairy-cheese": [8, 1],
      "breakfast-cereal": [10, 1], "breakfast-bread": [8, 1], "breakfast-coffee": [8, 1],
      "drinks-water": [12, 2], "drinks-juice": [10, 1], "drinks-soda": [12, 2],
      "snacks-chips": [10, 1], "snacks-cookies": [10, 1], "snacks-chocolate": [12, 2],
      "household-paperTowels": [8, 1], "household-soap": [10, 1], "household-cleaner": [8, 1],
    }),
    customers: 12, checkoutLanes: 3, carts: true, cartsTarget: 6, spill: true, fallen: true, trolley: true, delivery: true,
    targetTimeSec: 600, basePay: 300,
  },
];

export const TOTAL_LEVELS = LEVELS.length;

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

export function levelLayout(level) {
  return buildTierLayout(level.tier);
}

/** Groups levels by tier for the level-select screen, in tier order. */
export function levelsByTier() {
  const order = ["small", "neighborhood", "supermarket"];
  return order.map((tierId) => ({ tierId, levels: LEVELS.filter((l) => l.tier === tierId) }));
}
