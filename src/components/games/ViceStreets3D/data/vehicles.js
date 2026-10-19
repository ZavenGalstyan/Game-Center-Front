/**
 * Vice Streets 3D — the eight vehicles (original designs).
 *
 * Physics numbers are SI: accel m/s², top m/s, brake m/s², steer = max
 * front-wheel angle (rad) at low speed, grip = how fast sideways velocity is
 * killed (1/s), hp = vehicle health. len / wid / hgt are body dimensions (m)
 * and also the collision volume. Upgrades (data below) scale these.
 */
export const VEHICLES = [
  {
    id: "compact", name: "Breeze Hatch", cls: "Compact", style: "hatch",
    len: 3.9, wid: 1.76, hgt: 1.48, wheelbase: 2.45, mass: 1050,
    accel: 6.6, top: 41, brake: 15, steer: 0.66, grip: 9.5, hp: 100,
    price: 6000, level: 1, rep: 0, paint: "#5ec8e5",
    blurb: "Nimble city runabout. Cheap to fix, easy to park.",
  },
  {
    id: "sedan", name: "Cortez Sedan", cls: "Sedan", style: "sedan",
    len: 4.75, wid: 1.86, hgt: 1.46, wheelbase: 2.8, mass: 1420,
    accel: 7.1, top: 47, brake: 15.5, steer: 0.6, grip: 9.8, hp: 125,
    price: 11500, level: 2, rep: 0, paint: "#e9e4da",
    blurb: "Comfortable four-door that does everything well enough.",
  },
  {
    id: "taxi", name: "Metro Cab", cls: "Taxi", style: "taxi",
    len: 4.8, wid: 1.86, hgt: 1.5, wheelbase: 2.8, mass: 1450,
    accel: 6.9, top: 45, brake: 15.5, steer: 0.6, grip: 9.6, hp: 135,
    price: 14000, level: 3, rep: 5, paint: "#ffcc1f",
    blurb: "Licensed cab. Lets you take taxi fares anywhere.",
  },
  {
    id: "suv", name: "Ridgeback 4x4", cls: "SUV", style: "suv",
    len: 4.85, wid: 2.0, hgt: 1.86, wheelbase: 2.9, mass: 2050,
    accel: 6.4, top: 45, brake: 14, steer: 0.6, grip: 9, hp: 185,
    price: 22000, level: 4, rep: 15, paint: "#2e4b3f",
    blurb: "Heavy and tough. Shoves smaller cars out of the way.",
  },
  {
    id: "van", name: "Parcel Van", cls: "Delivery Van", style: "van",
    len: 5.3, wid: 2.05, hgt: 2.35, wheelbase: 3.3, mass: 2300,
    accel: 5.2, top: 37, brake: 13, steer: 0.6, grip: 8.4, hp: 210,
    price: 15000, level: 3, rep: 10, paint: "#f2f2ee",
    blurb: "Slow but huge cargo space. Best for delivery jobs.",
  },
  {
    id: "muscle", name: "Thunder V8", cls: "Muscle Car", style: "muscle",
    len: 4.95, wid: 1.96, hgt: 1.34, wheelbase: 2.95, mass: 1620,
    accel: 9.6, top: 57, brake: 15, steer: 0.55, grip: 8.4, hp: 140,
    price: 34000, level: 7, rep: 30, paint: "#c4161c",
    blurb: "Big V8, wild launches, loose rear end on the handbrake.",
  },
  {
    id: "sports", name: "Vento GT", cls: "Sports Coupe", style: "coupe",
    len: 4.45, wid: 1.95, hgt: 1.2, wheelbase: 2.62, mass: 1300,
    accel: 10.8, top: 64, brake: 18, steer: 0.66, grip: 12.5, hp: 95,
    price: 52000, level: 10, rep: 50, paint: "#ff7a00",
    blurb: "Low, light and razor sharp. The fastest thing on the coast.",
  },
  {
    id: "police", name: "Interceptor", cls: "Police Cruiser", style: "police",
    len: 4.95, wid: 1.96, hgt: 1.5, wheelbase: 2.9, mass: 1700,
    accel: 9.4, top: 60, brake: 17, steer: 0.63, grip: 11, hp: 175,
    price: 68000, level: 14, rep: 80, paint: "#16181d",
    blurb: "Decommissioned pursuit car. Fast, tough, sirens removed.",
  },
  // ---- added: wider range, especially fast cars (original designs)
  {
    id: "classic", name: "Pico Classic", cls: "Classic Compact", style: "mini", race: "compact",
    len: 3.35, wid: 1.62, hgt: 1.42, wheelbase: 2.12, mass: 780, accel: 6.9, top: 38, brake: 14, steer: 0.7, grip: 9.2, hp: 85,
    price: 4500, level: 1, rep: 0, paint: "#9fd8c4",
    blurb: "A tiny 60s icon. Round lamps, chrome bumpers, turns on a dime.",
  },
  {
    id: "hothatch", name: "Volt RS", cls: "Modern Hatchback", style: "hothatch", race: "sedan",
    len: 4.2, wid: 1.82, hgt: 1.43, wheelbase: 2.62, mass: 1260, accel: 8.6, top: 50, brake: 16.5, steer: 0.67, grip: 11, hp: 105,
    price: 15500, level: 3, rep: 5, paint: "#d7263d",
    blurb: "A hot hatch with a roof spoiler and a sharp front end. Punchy and planted.",
  },
  {
    id: "luxsedan", name: "Aurelia S", cls: "Luxury Sedan", style: "lux", race: "sedan",
    len: 4.95, wid: 1.9, hgt: 1.45, wheelbase: 2.95, mass: 1750, accel: 8.0, top: 54, brake: 16.5, steer: 0.6, grip: 10.4, hp: 145,
    price: 38000, level: 6, rep: 25, paint: "#1c2a44",
    blurb: "Quiet, quick and smooth. Chrome grille and a full-width light bar.",
  },
  {
    id: "exec", name: "Monarch LWB", cls: "Executive Sedan", style: "exec", race: "sedan",
    len: 5.3, wid: 1.95, hgt: 1.5, wheelbase: 3.25, mass: 2000, accel: 7.5, top: 53, brake: 16, steer: 0.58, grip: 10, hp: 165,
    price: 46000, level: 8, rep: 35, paint: "#0e0f12",
    blurb: "Long-wheelbase limousine for people who sit in the back.",
  },
  {
    id: "crossover", name: "Trailbug", cls: "Compact SUV", style: "cross", race: "suv",
    len: 4.35, wid: 1.84, hgt: 1.64, wheelbase: 2.62, mass: 1450, accel: 7.2, top: 46, brake: 15, steer: 0.62, grip: 9.6, hp: 140,
    price: 17500, level: 3, rep: 5, paint: "#e07a2f",
    blurb: "Raised city crossover. Easy to drive, happy on a kerb.",
  },
  {
    id: "luxsuv", name: "Sovereign V12", cls: "Luxury SUV", style: "luxsuv", race: "suv",
    len: 5.05, wid: 2.02, hgt: 1.82, wheelbase: 3.0, mass: 2350, accel: 7.8, top: 52, brake: 15.5, steer: 0.58, grip: 9.6, hp: 200,
    price: 58000, level: 9, rep: 45, paint: "#d9d4c7",
    blurb: "A palace on wheels with a V12. Heavy, stable and very fast for its size.",
  },
  {
    id: "supercar", name: "Furia SV", cls: "Exotic Supercar", style: "super", race: "sports",
    len: 4.6, wid: 2.03, hgt: 1.12, wheelbase: 2.7, mass: 1450, accel: 12.8, top: 72, brake: 20, steer: 0.66, grip: 14, hp: 100,
    price: 120000, level: 16, rep: 90, paint: "#ffcf1a",
    blurb: "Mid-engined wedge with a cab-forward cockpit. The fastest car in the city.",
  },
  {
    id: "retro", name: "Marina 77", cls: "Retro Sports Car", style: "retro", race: "sports",
    len: 4.35, wid: 1.78, hgt: 1.25, wheelbase: 2.45, mass: 1150, accel: 9.4, top: 56, brake: 16, steer: 0.67, grip: 11.4, hp: 95,
    price: 42000, level: 9, rep: 40, paint: "#e8562a",
    blurb: "Long hood, short tail, round lamps — a 70s grand tourer, beautifully kept.",
  },
  {
    id: "spyder", name: "Brisa Spyder", cls: "Convertible Sports Car", style: "spyder", race: "sports",
    len: 4.4, wid: 1.92, hgt: 1.18, wheelbase: 2.55, mass: 1320, accel: 10.4, top: 62, brake: 18, steer: 0.67, grip: 12.2, hp: 90,
    price: 56000, level: 11, rep: 55, paint: "#2fb3c9",
    blurb: "Open-top two-seater made for the ocean drive at sunset.",
  },
  {
    id: "track", name: "Apex R", cls: "Track Car", style: "track", race: "sports",
    len: 4.5, wid: 1.98, hgt: 1.18, wheelbase: 2.62, mass: 1250, accel: 12.0, top: 66, brake: 21, steer: 0.7, grip: 15, hp: 90,
    price: 88000, level: 14, rep: 75, paint: "#f2f2f2",
    blurb: "Big wing, splitter, slicks-in-spirit. Brakes later and turns in harder than anything.",
  },
  {
    id: "gt", name: "Sable RS", cls: "High-Performance Coupe", style: "gt", race: "sports",
    len: 4.65, wid: 1.97, hgt: 1.26, wheelbase: 2.75, mass: 1550, accel: 11.4, top: 68, brake: 19, steer: 0.64, grip: 13, hp: 115,
    price: 76000, level: 13, rep: 65, paint: "#3a3f8f",
    blurb: "A fastback grand tourer with a ducktail and quad pipes. Fast all day long.",
  },
  {
    id: "pickup", name: "Mesa 2500", cls: "Pickup Truck", style: "pickup", race: "van",
    len: 5.4, wid: 2.0, hgt: 1.85, wheelbase: 3.4, mass: 2200, accel: 6.9, top: 46, brake: 14, steer: 0.57, grip: 8.8, hp: 200,
    price: 21000, level: 4, rep: 10, paint: "#7a1f1f",
    blurb: "Full-size work truck with an open bed. Tough as an old boot.",
  },
  {
    id: "offroad", name: "Dune Raider", cls: "Off-Road 4x4", style: "offroad", race: "suv",
    len: 4.2, wid: 1.92, hgt: 1.9, wheelbase: 2.45, mass: 1800, accel: 7.2, top: 44, brake: 14, steer: 0.63, grip: 9.4, hp: 190,
    price: 26000, level: 5, rep: 15, paint: "#6b7f3a",
    blurb: "Boxy, lifted, big tyres, bull bar and a spare on the back.",
  },
];
export const VEHICLE = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));

export const PAINTS = [
  { id: "stock", name: "Factory", hex: null, price: 0 },
  { id: "flamingo", name: "Flamingo Pink", hex: "#ff6fa8", price: 400 },
  { id: "aqua", name: "Lagoon Aqua", hex: "#28c7c2", price: 400 },
  { id: "sunset", name: "Sunset Orange", hex: "#ff7b29", price: 400 },
  { id: "lemon", name: "Lemon Ice", hex: "#ffe14d", price: 400 },
  { id: "royal", name: "Royal Blue", hex: "#2f55d4", price: 500 },
  { id: "jade", name: "Jade", hex: "#1f8a5b", price: 500 },
  { id: "pearl", name: "Pearl White", hex: "#f3f1ea", price: 600 },
  { id: "midnight", name: "Midnight", hex: "#14161c", price: 600 },
  { id: "violet", name: "Neon Violet", hex: "#8f3cff", price: 700 },
  { id: "chrome", name: "Liquid Silver", hex: "#c6ccd4", price: 900 },
];

/** performance upgrades, 3 ranks each; costs scale with the car's price */
export const UPGRADES = [
  { id: "engine", name: "Engine", desc: "+4% acceleration and +3% top speed per rank" },
  { id: "accel", name: "Acceleration", desc: "+7% acceleration per rank (turbo + gearing)" },
  { id: "top", name: "Top Speed", desc: "+5% top speed per rank (aero + exhaust)" },
  { id: "brakes", name: "Brakes", desc: "+12% braking force per rank" },
  { id: "handling", name: "Handling", desc: "+8% grip and +5% steering per rank" },
  { id: "armor", name: "Durability", desc: "+15% vehicle health, −8% crash damage per rank" },
];
export const MAX_UPGRADE = 3;
export function upgradeCost(vehId, upId, rank) {
  const base = Math.max(6000, VEHICLE[vehId].price);
  const k = { engine: 0.09, accel: 0.07, top: 0.07, brakes: 0.05, handling: 0.06, armor: 0.06 }[upId] || 0.06;
  return Math.round((base * k * (rank + 1) * (1 + rank * 0.35)) / 50) * 50;
}

/** final driving stats of a vehicle with upgrades {engine:0..3, …} */
export function vehicleStats(id, up = {}) {
  const v = VEHICLE[id];
  const r = (k) => Math.max(0, Math.min(MAX_UPGRADE, up[k] | 0));
  return {
    ...v,
    accel: v.accel * (1 + 0.04 * r("engine") + 0.07 * r("accel")),
    top: v.top * (1 + 0.03 * r("engine") + 0.05 * r("top")),
    brake: v.brake * (1 + 0.12 * r("brakes")),
    grip: v.grip * (1 + 0.08 * r("handling")),
    steer: v.steer * (1 + 0.05 * r("handling")),
    hp: v.hp * (1 + 0.15 * r("armor")),
    dmgK: 1 - 0.08 * r("armor"),
  };
}
export const repairCost = (id, missingFrac) => Math.round((60 + VEHICLE[id].price * 0.02) * missingFrac / 5) * 5;

/** what fills the streets (weights) — city-wide fallback */
export const TRAFFIC_MIX = [
  ["compact", 5],
  ["sedan", 6],
  ["taxi", 3],
  ["suv", 3],
  ["van", 2],
  ["muscle", 1],
  ["sports", 1],
  ["hothatch", 2],
  ["crossover", 2],
  ["luxsedan", 1],
];
/**
 * Per-district traffic: business sedans and cabs downtown, sports and open
 * cars on the beach strip, family SUVs and small cars in residential Little
 * Haven, vans and pickups by the industrial docks, luxury in Sunset Hills.
 */
export const DISTRICT_MIX = {
  downtown: [["sedan", 6], ["compact", 3], ["taxi", 4], ["luxsedan", 3], ["exec", 2], ["hothatch", 2], ["crossover", 2], ["suv", 1], ["van", 1], ["gt", 1], ["sports", 1], ["supercar", 0.3]],
  beach: [["sports", 2], ["spyder", 2], ["supercar", 0.8], ["retro", 1], ["gt", 1], ["track", 0.4], ["muscle", 1], ["compact", 2], ["sedan", 3], ["taxi", 2], ["crossover", 2], ["hothatch", 2], ["offroad", 1]],
  haven: [["crossover", 4], ["suv", 3], ["compact", 3], ["sedan", 4], ["classic", 2], ["hothatch", 1], ["pickup", 1], ["van", 1], ["taxi", 1]],
  docks: [["van", 5], ["pickup", 4], ["offroad", 2], ["suv", 1], ["sedan", 2], ["compact", 1], ["muscle", 1]],
  hills: [["luxsuv", 3], ["luxsedan", 3], ["exec", 2], ["gt", 2], ["supercar", 1], ["spyder", 1], ["retro", 0.6], ["suv", 1], ["sedan", 1]],
};
export function pickVehicle(R, district) {
  const mix = DISTRICT_MIX[district] || TRAFFIC_MIX;
  const tot = mix.reduce((t, [, w]) => t + w, 0);
  let x = R() * tot;
  for (const [id, w] of mix) if ((x -= w) <= 0) return id;
  return mix[0][0];
}
export const CIVIL_PAINTS = ["#e9e4da", "#2b2f36", "#9aa3ad", "#b8202a", "#2f55d4", "#5ec8e5", "#f3f1ea", "#1f8a5b", "#ff7b29", "#6b4f3a", "#ff6fa8", "#c6ccd4", "#ffe14d"];
