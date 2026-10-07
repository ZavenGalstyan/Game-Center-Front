/**
 * Highway Racer — the six player cars (original fictional designs).
 *
 * Stats are 1-5 and deliberately close together: SPEED nudges the top speed,
 * HANDLING the lane-change time, BOOST the boost duration. The free starter
 * is a perfectly good car.
 *
 * `look` drives the procedural model in three/carModel.js.
 */
export const CARS = [
  {
    id: "street-one",
    name: "Street One",
    blurb: "Light, honest hatch-coupe. Easy to read, easy to drive.",
    price: 0,
    stats: { speed: 2, handling: 3, boost: 2 },
    look: { style: "hatch", paint: "#d8342c", accent: "#1a1c22", rim: "#c9ced6", spoiler: "none", stripe: null },
  },
  {
    id: "falcon-gt",
    name: "Falcon GT",
    blurb: "Long-nose grand tourer with a calm, planted feel.",
    price: 500,
    stats: { speed: 3, handling: 3, boost: 3 },
    look: { style: "gt", paint: "#2f6fd6", accent: "#15181e", rim: "#d6dae0", spoiler: "lip", stripe: "#f2f4f7" },
  },
  {
    id: "vortex-r",
    name: "Vortex R",
    blurb: "Short wheelbase, quick hands. Lane changes snap into place.",
    price: 1500,
    stats: { speed: 3, handling: 5, boost: 2 },
    look: { style: "wedge", paint: "#f2b632", accent: "#14161b", rim: "#2a2d33", spoiler: "wing", stripe: "#14161b" },
  },
  {
    id: "nightline",
    name: "Nightline",
    blurb: "Stealth coupe built around a big, long boost.",
    price: 3000,
    stats: { speed: 3, handling: 3, boost: 5 },
    look: { style: "coupe", paint: "#262a35", accent: "#0c0d10", rim: "#8a5cff", spoiler: "duck", stripe: "#8a5cff" },
  },
  {
    id: "apex-rs",
    name: "Apex RS",
    blurb: "Track-bred wedge. Fast, sharp and eager.",
    price: 6000,
    stats: { speed: 4, handling: 4, boost: 4 },
    look: { style: "wedge", paint: "#f4f5f7", accent: "#16181d", rim: "#e04a2f", spoiler: "wing", stripe: "#e04a2f" },
  },
  {
    id: "phantom-x",
    name: "Phantom X",
    blurb: "The flagship hyper-coupe. Highest top speed on the road.",
    price: 10000,
    stats: { speed: 5, handling: 4, boost: 4 },
    look: { style: "hyper", paint: "#18b88f", accent: "#0f1114", rim: "#1d2026", spoiler: "wing", stripe: "#0f1114" },
  },
];

export const STARTER_CAR = CARS[0].id;
export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

/** Gameplay numbers derived from the 1-5 stats. */
export function carTuning(car) {
  const s = car.stats;
  return {
    topSpeed: 56 + s.speed * 1.6, // 59.2 … 64 m/s  (213 … 230 km/h)
    laneTime: 0.43 - (s.handling - 1) * 0.032, // 0.43 … 0.30 s
    boostDuration: 2.4 + s.boost * 0.3, // 2.7 … 3.9 s
  };
}
