/**
 * Stack Tower — pure placement geometry. No rendering, no timing, no DOM:
 * everything here is deterministic and unit-testable in plain Node.
 *
 * World units: the base footprint is BASE_SIZE × BASE_SIZE on the X/Z plane,
 * Y is up. A block is { x, z, w, d } — centre on X/Z plus width (X extent)
 * and depth (Z extent). The moving block always has the same footprint as
 * the block below it; it only slides along one axis.
 */

export const BASE_SIZE = 10;
export const BLOCK_H = 2;

/** Below this an overlap / remainder is treated as zero (float noise). */
export const EPS = 1e-6;

/**
 * Perfect window, symmetric around the previous block's centre.
 * ~3% of the current dimension, never tighter than 0.12 units (a shrunken
 * block would otherwise need sub-frame timing) and never looser than 10% of
 * the dimension (a sliver block must not auto-perfect).
 */
export function perfectTolerance(size) {
  const t = Math.max(size * 0.03, 0.12);
  return Math.min(t, size * 0.1);
}

/** Size recovery: every RECOVERY_STREAK-th consecutive perfect (5, 10, 15…)
 *  regrows each dimension by 3.5% of BASE_SIZE, never past BASE_SIZE. */
export const RECOVERY_STREAK = 5;
export const RECOVERY_AMOUNT = 0.35;

const AXES = {
  x: { pos: "x", size: "w" },
  z: { pos: "z", size: "d" },
};

/**
 * Resolve one placement.
 *
 *   prev  – the block on top of the tower { x, z, w, d }
 *   cur   – the moving block at the instant of the tap { x, z, w, d }
 *   axis  – "x" | "z", the axis `cur` was moving along
 *   streak – perfect streak BEFORE this placement (for size recovery)
 *
 * Returns
 *   { kind: "miss",    overlap, pieces: [] }
 *   { kind: "perfect", overlap, placed, pieces: [], recovered }
 *   { kind: "cut",     overlap, placed, pieces: [{ x, z, w, d, side }] }
 *
 * Invariants (tested): placed sizes are > 0 and never exceed the previous
 * size along the axis (except recovery, capped at BASE_SIZE); placed + pieces
 * along the axis sum exactly to the current block's extent; pieces never
 * overlap `placed`.
 */
export function resolvePlacement(prev, cur, axis, streak = 0) {
  const { pos, size } = AXES[axis];
  const prevMin = prev[pos] - prev[size] / 2;
  const prevMax = prev[pos] + prev[size] / 2;
  const curMin = cur[pos] - cur[size] / 2;
  const curMax = cur[pos] + cur[size] / 2;

  const overlapMin = Math.max(prevMin, curMin);
  const overlapMax = Math.min(prevMax, curMax);
  const overlapSize = overlapMax - overlapMin;

  if (!(overlapSize > EPS)) return { kind: "miss", overlap: 0, pieces: [] };

  const offset = cur[pos] - prev[pos];
  const tol = perfectTolerance(prev[size]);

  if (Math.abs(offset) <= tol && Math.abs(cur[size] - prev[size]) <= EPS) {
    // Snap exactly onto the block below — no size loss for float noise.
    const placed = { x: prev.x, z: prev.z, w: prev.w, d: prev.d };
    let recovered = false;
    if ((streak + 1) % RECOVERY_STREAK === 0) {
      const w = Math.min(BASE_SIZE, placed.w + RECOVERY_AMOUNT);
      const d = Math.min(BASE_SIZE, placed.d + RECOVERY_AMOUNT);
      recovered = w > placed.w + EPS || d > placed.d + EPS;
      placed.w = w;
      placed.d = d;
    }
    return { kind: "perfect", overlap: prev[size], placed, pieces: [], recovered, offset };
  }

  const placed = { x: cur.x, z: cur.z, w: cur.w, d: cur.d };
  placed[pos] = (overlapMin + overlapMax) / 2;
  placed[size] = overlapSize;

  // Remainders on each side of the overlap. Normally exactly one exists;
  // computing both keeps odd inputs from ever producing negative pieces.
  const pieces = [];
  const addPiece = (min, max, side) => {
    const s = max - min;
    if (!(s > EPS)) return;
    const p = { x: cur.x, z: cur.z, w: cur.w, d: cur.d, side };
    p[pos] = (min + max) / 2;
    p[size] = s;
    pieces.push(p);
  };
  addPiece(curMin, overlapMin, -1);
  addPiece(overlapMax, curMax, 1);

  return { kind: "cut", overlap: overlapSize, placed, pieces, offset };
}

/* --------------------------------------------------------------- motion */

/**
 * Speed (world units / second) for the Nth moving block (1-based).
 * Gentle piecewise ramp, hard-capped. Past ~80 blocks difficulty comes from
 * the shrinking surface, not from velocity.
 */
const SPEED_KEYS = [
  [1, 10.5],
  [10, 11.5],
  [25, 13.5],
  [50, 15.5],
  [75, 17],
  [110, 18],
];
export const MAX_SPEED = 18;

export function speedFor(n) {
  if (n <= SPEED_KEYS[0][0]) return SPEED_KEYS[0][1];
  for (let i = 1; i < SPEED_KEYS.length; i++) {
    const [n1, v1] = SPEED_KEYS[i];
    if (n <= n1) {
      const [n0, v0] = SPEED_KEYS[i - 1];
      return v0 + ((v1 - v0) * (n - n0)) / (n1 - n0);
    }
  }
  return MAX_SPEED;
}

/** Linear run half-length (clears the base on both sides) + easing zone. */
export const TRAVEL_LINEAR = 12;
export const TRAVEL_EASE = 2.5;

/**
 * Analytic ping-pong position — frame-rate independent by construction:
 * the same elapsed time gives the same position at 30, 60 or 144 Hz.
 *
 * Constant speed across the tower (|p| ≤ TRAVEL_LINEAR), then a constant
 * deceleration to a stop at the turning point and back — so the block
 * reverses smoothly, but only well outside the tower where timing doesn't
 * matter. Starts at -TRAVEL_LINEAR moving toward +.
 */
export function oscillate(t, v) {
  const L = TRAVEL_LINEAR;
  const D = TRAVEL_EASE;
  const tLin = (2 * L) / v; // one straight pass
  const tTurn = (4 * D) / v; // decel to 0 over D, accelerate back over D
  const period = 2 * (tLin + tTurn);
  let u = t % period;
  if (u < 0) u += period;
  const a = (v * v) / (2 * D);
  if (u < tLin) return -L + v * u;
  u -= tLin;
  if (u < tTurn) {
    const h = tTurn / 2;
    const s = u < h ? v * u - 0.5 * a * u * u : D - 0.5 * a * (u - h) * (u - h);
    return L + s;
  }
  u -= tTurn;
  if (u < tLin) return L - v * u;
  u -= tLin;
  const h = tTurn / 2;
  const s = u < h ? v * u - 0.5 * a * u * u : D - 0.5 * a * (u - h) * (u - h);
  return -L - s;
}

/** Axis + entry side for the Nth moving block: -X, -Z, +X, +Z, repeat. */
export function entryFor(n) {
  const axis = n % 2 === 1 ? "x" : "z";
  const sign = Math.floor((n - 1) / 2) % 2 === 0 ? 1 : -1;
  return { axis, sign };
}
