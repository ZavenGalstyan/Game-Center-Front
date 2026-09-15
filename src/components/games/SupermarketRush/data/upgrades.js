/**
 * Supermarket Rush — upgrades bought with earned money (Upgrades screen).
 * Each has a small number of purchasable levels; `effect(level)` returns the
 * multiplier/bonus engine code reads — see engine/storage.js `upgradeValue`.
 */
export const UPGRADES = [
  {
    id: "restockSpeed",
    name: "Faster Restocking",
    description: "Products move from box to shelf faster.",
    costs: [150, 350, 700],
    effect: (level) => 1 + level * 0.35, // multiplies restock rate
  },
  {
    id: "trolleyCapacity",
    name: "Bigger Trolley",
    description: "Carry more boxes on the trolley at once.",
    costs: [200, 450],
    effect: (level) => 4 + level * 2, // trolley box slots
  },
  {
    id: "moveSpeed",
    name: "Movement Speed",
    description: "Walk a little faster around the store.",
    costs: [180, 400, 800],
    effect: (level) => 1 + level * 0.08,
  },
  {
    id: "shelfCapacity",
    name: "Shelf Capacity",
    description: "Shelves hold more stock before running low.",
    costs: [250, 600],
    effect: (level) => 1 + level * 0.2,
  },
  {
    id: "scannerSpeed",
    name: "Checkout Scanner",
    description: "Scan products at checkout faster.",
    costs: [200, 500],
    effect: (level) => 1 + level * 0.4,
  },
  {
    id: "customerPatience",
    name: "Customer Patience",
    description: "Customers are willing to wait a little longer.",
    costs: [180, 420],
    effect: (level) => 1 + level * 0.25,
  },
];

export function getUpgrade(id) {
  return UPGRADES.find((u) => u.id === id) || null;
}

export function upgradeCost(upgrade, currentLevel) {
  if (currentLevel >= upgrade.costs.length) return null;
  return upgrade.costs[currentLevel];
}

export function upgradeMaxLevel(upgrade) {
  return upgrade.costs.length;
}
