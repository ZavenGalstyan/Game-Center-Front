/**
 * Delivery Rush — the five player vehicles.
 *
 * `stars` are the 1-5 values shown in the garage; `drive` holds the real
 * numbers fed into the arcade physics step (SI-ish units: m/s, m/s^2). The two
 * are hand-tuned to agree — a 5/5 speed car really is the fastest one.
 *
 * `body` describes how world/vehicleModel.js assembles the mesh, so every car
 * is built from one parametric builder instead of five bespoke models.
 */

export const PAINTS = [
  { id: "signal-red", name: "Signal Red", hex: "#e04a3c" },
  { id: "citrus", name: "Citrus", hex: "#f0a333" },
  { id: "mint", name: "Mint", hex: "#31c48d" },
  { id: "azure", name: "Azure", hex: "#2f80d8" },
  { id: "violet", name: "Violet", hex: "#7c5cd6" },
  { id: "graphite", name: "Graphite", hex: "#4a5560" },
  { id: "pearl", name: "Pearl", hex: "#e8e9ec" },
  { id: "sand", name: "Sand", hex: "#d8bd8a" },
];

export const VEHICLES = [
  {
    id: "city-runner",
    name: "City Runner",
    tagline: "Compact delivery car",
    price: 0,
    defaultPaint: "citrus",
    stars: { speed: 2, accel: 3, handling: 4, braking: 4 },
    capacity: "Standard",
    blurb:
      "Nimble little hatchback. Slow on the straights, but it turns on a coin — perfect for learning the streets.",
    drive: {
      maxSpeed: 21, // m/s (~76 km/h)
      reverseSpeed: 7,
      accel: 11.5, // m/s^2
      brake: 24,
      grip: 1.0, // lateral friction multiplier
      steer: 0.95, // max steering angle multiplier
      mass: 1.0,
      handbrakeGrip: 0.42,
    },
    body: {
      kind: "hatch",
      length: 4.0, width: 1.76, wheelR: 0.3,
      sill: 0.2, waist: 0.62, cabinH: 0.56,
      cabinBack: -0.62, cabinFront: 0.72,
      rearSlope: 0.34,
      boxSign: true,
    },
  },
  {
    id: "quick-van",
    name: "Quick Van",
    tagline: "Panel delivery van",
    price: 1500,
    defaultPaint: "mint",
    stars: { speed: 3, accel: 2, handling: 3, braking: 3 },
    capacity: "Higher",
    blurb:
      "More box, more parcels. Slower off the line but it holds speed well and shrugs off a scrape.",
    drive: {
      maxSpeed: 24,
      reverseSpeed: 7.5,
      accel: 9.5,
      brake: 21,
      grip: 0.92,
      steer: 0.86,
      mass: 1.35,
      handbrakeGrip: 0.5,
    },
    body: {
      kind: "van",
      length: 4.9, width: 1.95, wheelR: 0.35,
      sill: 0.24, waist: 0.72, cabinH: 1.02,
      cabinBack: -1.7, cabinFront: 1.3,
      rearSlope: 0.05, panel: true,
      boxSign: true,
    },
  },
  {
    id: "street-sport",
    name: "Street Sport",
    tagline: "Courier coupe",
    price: 4000,
    defaultPaint: "signal-red",
    stars: { speed: 5, accel: 5, handling: 4, braking: 4 },
    capacity: "Small",
    blurb:
      "Absurdly fast for a delivery job. Rewards clean lines and punishes late braking.",
    drive: {
      maxSpeed: 33,
      reverseSpeed: 8,
      accel: 16.5,
      brake: 26,
      grip: 1.02,
      steer: 0.9,
      mass: 0.92,
      handbrakeGrip: 0.34,
    },
    body: {
      kind: "coupe",
      length: 4.3, width: 1.9, wheelR: 0.32,
      sill: 0.17, waist: 0.55, cabinH: 0.45,
      cabinBack: -0.95, cabinFront: 0.4,
      rearSlope: 0.55,
      spoiler: true,
    },
  },
  {
    id: "cargo-master",
    name: "Cargo Master",
    tagline: "Long-wheelbase box van",
    price: 7500,
    defaultPaint: "azure",
    stars: { speed: 3, accel: 2, handling: 2, braking: 3 },
    capacity: "Maximum",
    cargoBonus: 0.15,
    blurb:
      "Built for the big runs. Heavy, wide, and paid accordingly — a cargo bonus rides on every delivery.",
    drive: {
      maxSpeed: 25,
      reverseSpeed: 7,
      accel: 8.6,
      brake: 20,
      grip: 0.86,
      steer: 0.74,
      mass: 1.7,
      handbrakeGrip: 0.55,
    },
    body: {
      kind: "boxvan",
      length: 5.7, width: 2.1, wheelR: 0.4,
      sill: 0.3, waist: 0.66, cabinH: 1.3,
      cabinBack: 0.72, cabinFront: 2.2,
      cargoBox: 1.95, rearSlope: 0,
      boxSign: true,
    },
  },
  {
    id: "night-express",
    name: "Night Express",
    tagline: "Prototype courier",
    price: 12000,
    defaultPaint: "violet",
    stars: { speed: 5, accel: 4, handling: 5, braking: 5 },
    capacity: "Standard",
    blurb:
      "The end-game machine. Grips like it is bolted to the asphalt and stops out of nowhere.",
    drive: {
      maxSpeed: 34,
      reverseSpeed: 9,
      accel: 15,
      brake: 30,
      grip: 1.14,
      steer: 1.0,
      mass: 1.0,
      handbrakeGrip: 0.4,
    },
    body: {
      kind: "wagon",
      length: 4.7, width: 1.94, wheelR: 0.34,
      sill: 0.19, waist: 0.6, cabinH: 0.58,
      cabinBack: -1.5, cabinFront: 0.6,
      rearSlope: 0.12,
      spoiler: true,
      boxSign: true,
      emissiveTrim: true,
    },
  },
];

export const VEHICLE_MAP = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));

export function getVehicle(id) {
  return VEHICLE_MAP[id] || VEHICLES[0];
}

export function getPaintHex(id) {
  return (PAINTS.find((p) => p.id === id) || PAINTS[1]).hex;
}
