/**
 * Fishing Journey — fishing rods (the only upgrade track in this version).
 *
 * Stats are 0..1 and feed the gameplay directly:
 *   power         faster catch-progress gain while the fish is in the zone
 *   control       wider green zone + calmer fish in the reeling mini-game
 *   castDistance  small nudge toward rarer / heavier fish when one bites
 *
 * The Wooden Rod is owned from the start; the rest are bought with coins.
 */

export const RODS = [
  {
    id: "wooden",
    name: "Wooden Rod",
    price: 0,
    blurb: "A humble starter rod. Gets the job done on a calm lake.",
    power: 0.25,
    control: 0.3,
    castDistance: 0.2,
  },
  {
    id: "lake",
    name: "Lake Rod",
    price: 500,
    blurb: "Balanced fibreglass build — noticeably steadier on a bite.",
    power: 0.45,
    control: 0.5,
    castDistance: 0.4,
  },
  {
    id: "pro-angler",
    name: "Pro Angler",
    price: 1200,
    blurb: "Tournament-grade graphite. Strong pull, forgiving control.",
    power: 0.7,
    control: 0.68,
    castDistance: 0.62,
  },
  {
    id: "ocean-master",
    name: "Ocean Master",
    price: 2500,
    blurb: "Heavy offshore rig built to haul monsters out of deep water.",
    power: 0.92,
    control: 0.85,
    castDistance: 0.9,
  },
];

export const ROD_BY_ID = Object.fromEntries(RODS.map((r) => [r.id, r]));

export function getRod(id) {
  return ROD_BY_ID[id] || RODS[0];
}
