/**
 * Lumberjack Life — tools, vehicles and sawmill upgrades.
 *
 * Tools: four axes (swing → impact frame → damage once) and three chainsaws
 * (hold to cut, continuous damage). `tier` gates which species a tool can
 * fell (species.minTier). Each tool has its own look in three/tools3d.js —
 * nothing here is "just a damage number".
 */
export const TOOLS = [
  {
    id: "old-axe", name: "Old Axe", kind: "axe", tier: 1, price: 0,
    damage: 14, swing: 0.86, reach: 1.35,
    look: { handle: "#7a5634", grip: "#3b2a1c", head: "#6f6a63", edge: "#b9b3a8", headSize: 1.0, rust: true },
    blurb: "Your grandfather's axe. Dull, heavy, honest.",
  },
  {
    id: "iron-axe", name: "Iron Axe", kind: "axe", tier: 2, price: 260,
    damage: 21, swing: 0.8, reach: 1.4,
    look: { handle: "#9b6b3c", grip: "#5a3a22", head: "#5d6166", edge: "#d4d7da", headSize: 1.06 },
    blurb: "Fresh iron head. Bites into oak and spruce.",
  },
  {
    id: "steel-axe", name: "Steel Axe", kind: "axe", tier: 3, price: 750,
    damage: 29, swing: 0.74, reach: 1.45,
    look: { handle: "#c08a4e", grip: "#1f2a36", head: "#7d8a96", edge: "#eef2f5", headSize: 1.1 },
    blurb: "Balanced steel. Faster swings, deeper cuts.",
  },
  {
    id: "pro-axe", name: "Professional Axe", kind: "axe", tier: 4, price: 1650,
    damage: 40, swing: 0.68, reach: 1.5,
    look: { handle: "#2a2a2e", grip: "#d0432b", head: "#c7362a", edge: "#f4f4f4", headSize: 1.16, pro: true },
    blurb: "Composite handle, forged bit. Felling made easy.",
  },
  {
    id: "basic-chainsaw", name: "Basic Chainsaw", kind: "chainsaw", tier: 5, price: 2700,
    dps: 46, bar: 0.42,
    look: { body: "#d9822b", accent: "#2b2b2b", bar: "#9aa1a8", size: 1.0 },
    blurb: "Pull-start two-stroke. Hold to cut — no more swinging.",
  },
  {
    id: "heavy-chainsaw", name: "Heavy Chainsaw", kind: "chainsaw", tier: 6, price: 5200,
    dps: 74, bar: 0.52,
    look: { body: "#3f7f3a", accent: "#1d1d1d", bar: "#aab1b8", size: 1.12 },
    blurb: "Longer bar, bigger engine. Built for frostwood.",
  },
  {
    id: "pro-chainsaw", name: "Professional Chainsaw", kind: "chainsaw", tier: 7, price: 9400,
    dps: 112, bar: 0.6,
    look: { body: "#e6e6e2", accent: "#c7362a", bar: "#c2c8cd", size: 1.2, pro: true },
    blurb: "Pro forestry saw. Golden giants fall in seconds.",
  },
];
export const toolById = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];

/**
 * Vehicles. The hand cart is pulled on foot; the rest are driven (F).
 * Capacity is visible: every slot is a real log on the bed.
 */
export const VEHICLES = [
  {
    id: "hand-cart", name: "Hand Cart", kind: "cart", price: 0, capacity: 5,
    unlock: "Reward for your first order",
    blurb: "Two wheels and a sturdy bed. Pull it with E.",
  },
  {
    id: "small-tractor", name: "Small Tractor + Trailer", kind: "tractor", price: 1900, capacity: 9,
    speed: 7.5, accel: 4.2, look: { body: "#c7362a", trim: "#f0e6d0", size: 1.0 },
    blurb: "A trusty red tractor with a log trailer.",
  },
  {
    id: "logging-tractor", name: "Logging Tractor", kind: "tractor", price: 5600, capacity: 14,
    speed: 9, accel: 5, look: { body: "#3e7a3a", trim: "#f2d14a", size: 1.15 },
    blurb: "Bigger engine, bigger trailer, better on slopes.",
  },
  {
    id: "logging-truck", name: "Logging Truck", kind: "truck", price: 12500, capacity: 22,
    speed: 11, accel: 5.5, look: { body: "#2f5d8a", trim: "#d9dde0", size: 1.0 },
    blurb: "The flagship. Carries a whole stand of timber.",
  },
];
export const vehicleById = (id) => VEHICLES.find((v) => v.id === id) || null;

/**
 * Sawmill upgrades (global — every region's mill uses them). Each level is
 * also a visible change in three/sawmillMesh.js.
 */
export const UPGRADES = [
  {
    id: "conveyor", name: "Conveyor Speed", levels: [1, 1.35, 1.75, 2.2], prices: [450, 1200, 2800],
    fmt: (v) => `${Math.round(v * 100)}%`, blurb: "Faster belts and powered rollers.",
  },
  {
    id: "saw", name: "Saw Speed", levels: [1, 1.4, 1.85, 2.4], prices: [600, 1500, 3400],
    fmt: (v) => `${Math.round(v * 100)}%`, blurb: "A bigger blade and a stronger motor.",
  },
  {
    id: "intake", name: "Intake Capacity", levels: [4, 6, 9, 12], prices: [350, 1000, 2400],
    fmt: (v) => `${v} logs`, blurb: "A longer log deck in front of the saw.",
  },
  {
    id: "storage", name: "Storage Capacity", levels: [40, 80, 160, 320], prices: [400, 1100, 2600],
    fmt: (v) => `${v} planks`, blurb: "More timber racks in the yard.",
  },
];
export const upgradeValue = (upgrades, id) => {
  const u = UPGRADES.find((x) => x.id === id);
  const lvl = Math.max(0, Math.min(u.levels.length - 1, (upgrades && upgrades[id]) || 0));
  return u.levels[lvl];
};
