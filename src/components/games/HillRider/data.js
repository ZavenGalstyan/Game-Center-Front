/**
 * Hill Rider — vehicles, maps, upgrades and the save format.
 * Units: metres, seconds, radians; y points up.
 */

/**
 * Vehicle stats. Body points are chassis-local collision points; `head` is
 * the driver's head (touching the ground ends the run).
 */
export const VEHICLES = {
  jeep: {
    name: "Jeep", blurb: "Balanced 4x4 — steady on any slope.", price: 0, color: "#ff6b35", trim: "#ffd166",
    mass: 10, wheelMass: 1, radius: 0.42, anchors: [[-1.15, -0.3], [1.15, -0.3]], rest: 0.5, travel: [0.22, 0.72],
    spring: 480, damp: 30, torque: 30, vmax: 21, drive: [1, 1], grip: 1, air: 4.2, fuel: 1,
    body: [[-1.55, -0.25], [1.6, -0.25], [1.6, 0.35], [-1.55, 0.45], [0.5, 0.75], [-0.8, 0.95]], head: [-0.25, 1.15], headR: 0.27,
  },
  bike: {
    name: "Dirt Bike", blurb: "Light and fast. Flips in a heartbeat.", price: 3000, color: "#3a86ff", trim: "#e0f2ff",
    mass: 5, wheelMass: 0.6, radius: 0.4, anchors: [[-0.8, -0.2], [0.85, -0.2]], rest: 0.45, travel: [0.2, 0.65],
    spring: 250, damp: 16, torque: 15.5, vmax: 29, drive: [1, 0], grip: 1.05, air: 6.5, fuel: 0.85,
    body: [[-0.9, -0.1], [0.95, -0.1], [0.6, 0.35], [-0.6, 0.35]], head: [-0.05, 1.35], headR: 0.25,
  },
  monster: {
    name: "Monster Truck", blurb: "Huge tyres, huge torque, huge fun.", price: 8000, color: "#8338ec", trim: "#06d6a0",
    mass: 16, wheelMass: 2.2, radius: 0.72, anchors: [[-1.3, -0.35], [1.3, -0.35]], rest: 0.75, travel: [0.35, 1.05],
    spring: 620, damp: 46, torque: 62, vmax: 19, drive: [1, 1], grip: 1.1, air: 3, fuel: 1.25,
    body: [[-1.7, -0.2], [1.75, -0.2], [1.75, 0.45], [-1.7, 0.55], [0.4, 0.9], [-0.9, 1.05]], head: [-0.3, 1.3], headR: 0.28,
  },
};

/** Terrain + look per map. maxSlope ramps from slope[0] to slope[1] over `ramp` metres. */
export const MAPS = {
  green: {
    name: "Green Hills", blurb: "Rolling meadows — a gentle start.", price: 0, seed: 11, seg: 4, rough: 0.34, slope: [0.3, 0.85], ramp: 2500, friction: 1, gravity: 14,
    sky: ["#7cc6ff", "#d9f1ff"], far: "#9cc3e6", mid: "#6fbf73", ground: ["#7a4b2a", "#4e2f1a"], top: "#4caf50", topHi: "#8be06b", dust: "#a87a4f", tree: "round",
  },
  desert: {
    name: "Desert Dunes", blurb: "Long dunes, big jumps, slippery sand.", price: 2000, seed: 23, seg: 7, rough: 0.28, slope: [0.35, 0.8], ramp: 2200, friction: 0.88, gravity: 14,
    sky: ["#ffb36b", "#ffe9b8"], far: "#e8a76a", mid: "#e2b46b", ground: ["#d8a24a", "#a86f2c"], top: "#f2c46d", topHi: "#ffe1a1", dust: "#f0cf8f", tree: "cactus",
  },
  snow: {
    name: "Snow Mountains", blurb: "Steep icy peaks. Mind the grip.", price: 5000, seed: 37, seg: 4, rough: 0.42, slope: [0.38, 0.95], ramp: 2000, friction: 0.72, gravity: 14,
    sky: ["#5b7bb5", "#cfe3f7"], far: "#8fa8cf", mid: "#b9cde6", ground: ["#7d8fa8", "#4b5a70"], top: "#f4f8ff", topHi: "#ffffff", dust: "#ffffff", tree: "pine",
  },
};

export const UPGRADES = {
  engine: { name: "Engine", desc: "More torque and top speed" },
  suspension: { name: "Suspension", desc: "Stiffer, better damped springs" },
  tires: { name: "Tyres", desc: "More grip on every surface" },
  fuel: { name: "Fuel Tank", desc: "Drive longer between cans" },
};
export const MAX_LEVEL = 5;
export const upgradeCost = (vehicleId, level) => Math.round([300, 700, 1400, 2600, 4400][level] * (vehicleId === "jeep" ? 1 : vehicleId === "bike" ? 1.3 : 1.6));

/** Stats after upgrades — this is what the physics actually uses. */
export function tunedVehicle(id, up = {}) {
  const v = VEHICLES[id];
  const e = up.engine || 0, s = up.suspension || 0, t = up.tires || 0, f = up.fuel || 0;
  return {
    ...v,
    id,
    torque: v.torque * (1 + 0.12 * e),
    vmax: v.vmax * (1 + 0.05 * e),
    spring: v.spring * (1 + 0.12 * s),
    damp: v.damp * (1 + 0.15 * s),
    grip: v.grip * (1 + 0.07 * t),
    fuelTime: 22 * v.fuel * (1 + 0.25 * f), // seconds of full throttle per tank
  };
}

export const SAVE_KEY = "hill-rider-save";
export function defaultSave() {
  return {
    coins: 0,
    vehicle: "jeep",
    map: "green",
    owned: { jeep: true },
    maps: { green: true },
    upgrades: { jeep: {}, bike: {}, monster: {} },
    best: {},
  };
}
export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || typeof s !== "object") return defaultSave();
    const d = defaultSave();
    return {
      ...d,
      ...s,
      owned: { ...d.owned, ...s.owned },
      maps: { ...d.maps, ...s.maps },
      upgrades: { ...d.upgrades, ...s.upgrades },
      best: { ...s.best },
      vehicle: VEHICLES[s.vehicle] && s.owned?.[s.vehicle] ? s.vehicle : "jeep",
      map: MAPS[s.map] && s.maps?.[s.map] ? s.map : "green",
    };
  } catch {
    return defaultSave();
  }
}
export function writeSave(s) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}
