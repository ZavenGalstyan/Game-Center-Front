/**
 * Rooftop Sniper — 5 sniper rifles. Stats are balanced knobs consumed by the
 * mission engine (engine/missionEngine.js) and the ballistics step
 * (engine/ballistics.js), not flavour text:
 *
 *  - stability      0..1  higher = less scope sway
 *  - zoomLevels     the zoom steps available while scoped (mouse wheel cycles)
 *  - velocity       bullet muzzle speed in m/s (higher = flatter, faster travel)
 *  - reloadTime     seconds for a full reload
 *  - magazine       rounds per magazine
 *
 * Unlocked by mission progression/stars — no shop, no currency.
 */
export const RIFLES = [
  {
    id: "trainee-m1",
    name: "TRAINEE M1",
    tagline: "Balanced starter rifle",
    stability: 0.55,
    zoomLevels: [2, 4],
    velocity: 260,
    reloadTime: 2.1,
    magazine: 5,
    unlockMission: 1,
  },
  {
    id: "falcon-v2",
    name: "FALCON V2",
    tagline: "Faster bullet velocity",
    stability: 0.55,
    zoomLevels: [2, 4, 6],
    velocity: 320,
    reloadTime: 2.3,
    magazine: 5,
    unlockMission: 11,
  },
  {
    id: "sentinel-ts",
    name: "SENTINEL TS",
    tagline: "Steadier hands, sharper glass",
    stability: 0.72,
    zoomLevels: [2, 4, 6],
    velocity: 300,
    reloadTime: 2.4,
    magazine: 5,
    unlockMission: 21,
  },
  {
    id: "longshot-x",
    name: "LONGSHOT X",
    tagline: "Built for long range",
    stability: 0.68,
    zoomLevels: [4, 6, 8],
    velocity: 370,
    reloadTime: 2.7,
    magazine: 4,
    unlockMission: 31,
  },
  {
    id: "apex-precision",
    name: "APEX PRECISION",
    tagline: "Final advanced precision rifle",
    stability: 0.85,
    zoomLevels: [2, 4, 6, 8],
    velocity: 400,
    reloadTime: 2.5,
    magazine: 5,
    unlockMission: 51,
  },
];

export function getRifle(id) {
  return RIFLES.find((r) => r.id === id) || RIFLES[0];
}

export function isRifleUnlocked(state, rifle) {
  return state.unlockedMission >= rifle.unlockMission;
}
