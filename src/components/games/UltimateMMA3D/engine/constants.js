/**
 * Simulation constants shared by the engine and the renderer.
 * Distances in metres, times in seconds.
 */
export const SIM_DT = 1 / 60;
/** Octagon: inner circumradius of the fighting surface (fence posts at OCT_R + 0.08). */
export const OCT_R = 4.6;
export const OCT_APOTHEM = OCT_R * Math.cos(Math.PI / 8);
export const BODY_R = 0.3; // fighter collision radius
export const MIN_SEP = 0.62; // closest two standing fighters may be (centre to centre)
export const CLINCH_SEP = 0.5;
export const CLINCH_RANGE = 1.0;
export const SHOOT_RANGE = [0.9, 2.3];

/**
 * Ground layout: where the TOP fighter's root sits relative to the BOTTOM
 * fighter's root (bottom faces `dir`, lying with feet toward `dir`), and the
 * top fighter's facing offset. Shared with render/clips.js (poses are authored
 * in these frames).
 */
export const GROUND_LAYOUT = {
  guard: { yaw: Math.PI, off: [0, 0, 0.32] },
  half: { yaw: Math.PI, off: [0.05, 0, 0.26] },
  side: { yaw: -Math.PI / 2, off: [0.42, 0, -0.18] },
  mount: { yaw: Math.PI, off: [0, 0, 0.02] },
  back: { yaw: 0, off: [0, 0, -0.32] },
};

export const GROUND_NAMES = { guard: "Full Guard", half: "Half Guard", side: "Side Control", mount: "Mount", back: "Back Control" };
export const SUB_NAMES = { armbar: "Armbar", guillotine: "Guillotine Choke", rnc: "Rear-Naked Choke" };

export const DIFFICULTIES = ["easy", "normal", "hard", "champion"];
export const DIFF_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard", champion: "Champion" };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Seeded RNG (mulberry32). */
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.gauss = () => {
    let u = 0;
    for (let i = 0; i < 4; i++) u += r();
    return (u - 2) / 0.577;
  };
  return r;
}
