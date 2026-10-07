/**
 * Highway Racer — reusable traffic patterns.
 *
 * Lanes 0 / 1 / 2 = left / centre / right. `dz` is extra metres beyond the
 * spawn distance. Patterns are mirrored at random (lane l → 2 - l), and every
 * placement is still run through the fairness check before it appears —
 * patterns only describe shapes, they never bypass validation.
 *
 * `tier` = minimum difficulty tier (0: 0-30 s, 1: 30-60 s, 2: 60-120 s,
 * 3: 120 s+). `w` = relative weight.
 */
export const PATTERNS = [
  { id: "single", tier: 0, w: 5, cars: [{ lane: "any" }] },
  { id: "pair-lc", tier: 0, w: 2, cars: [{ lane: 0 }, { lane: 1 }] },
  { id: "pair-lr", tier: 0, w: 1.5, cars: [{ lane: 0 }, { lane: 2 }] },
  { id: "pair-split", tier: 1, w: 2, cars: [{ lane: 1 }, { lane: 0, dz: 26 }] },
  { id: "stagger", tier: 1, w: 1.5, cars: [{ lane: 0 }, { lane: 1, dz: 24 }, { lane: 2, dz: 48 }] },
  { id: "truck-car", tier: 1, w: 1.6, cars: [{ lane: "any", type: "truck" }, { lane: "other", dz: 32 }] },
  { id: "funnel", tier: 2, w: 1.3, cars: [{ lane: 1 }, { lane: 0, dz: 34 }, { lane: 2, dz: 34 }] },
  { id: "double-pair", tier: 2, w: 1.2, cars: [{ lane: 0 }, { lane: 1 }, { lane: 2, dz: 30 }, { lane: 1, dz: 30 }] },
  { id: "truck-wall", tier: 3, w: 1, cars: [{ lane: 0, type: "truck" }, { lane: 2, type: "truck", dz: 4 }] },
  { id: "slalom", tier: 3, w: 1, cars: [{ lane: 0 }, { lane: 1 }, { lane: 1, dz: 28 }, { lane: 2, dz: 28 }, { lane: 0, dz: 56 }] },
];

/** Vehicle mix per tier (weights). Trucks appear from tier 1 on. */
export const TYPE_MIX = [
  { sedan: 5, hatch: 4 },
  { sedan: 5, hatch: 3, suv: 2, van: 1, truck: 0.6 },
  { sedan: 4, hatch: 3, suv: 2.5, van: 1.5, truck: 1 },
  { sedan: 4, hatch: 3, suv: 3, van: 2, truck: 1.4 },
];

export function tierAt(t) {
  return t < 30 ? 0 : t < 60 ? 1 : t < 120 ? 2 : 3;
}

export function weighted(rng, entries) {
  let sum = 0;
  for (const [, w] of entries) sum += w;
  let r = rng() * sum;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** Concrete car list for one pattern: [{lane, dz, type}]. */
export function realize(pattern, rng, tier) {
  const mirror = rng() < 0.5;
  const all = Object.entries(TYPE_MIX[tier]);
  // big groups stay readable: trucks only come from explicit slots or lone cars
  const mix = pattern.cars.length > 1 ? all.filter(([k]) => k !== "truck") : all;
  const anyLane = Math.floor(rng() * 3);
  return pattern.cars.map((c) => {
    let lane = c.lane;
    if (lane === "any") lane = anyLane;
    else if (lane === "other") lane = (anyLane + 1 + Math.floor(rng() * 2)) % 3;
    else if (mirror) lane = 2 - lane;
    return { lane, dz: c.dz || 0, type: c.type || weighted(rng, mix) };
  });
}
