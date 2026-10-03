/**
 * Lumberjack Life — terrain. The playable area is a 1 m height GRID that the
 * renderer turns into the visible mesh vertex-for-vertex, and `heightAt`
 * interpolates over the SAME two triangles per cell the mesh draws. So the
 * ground the engine stands players, logs and trees on is exactly the ground
 * on screen — nothing can float or sink by interpolation error.
 *
 * Shape: fbm rolling hills (region amp/freq) + small bumps, flattened under
 * the sawmill pad and smoothed along the dirt roads, rising into hills past
 * the play radius. Outside the grid a coarser analytic version is used for the
 * distant backdrop.
 */
import { fbm, smoothstep, lerp, pointSegDist, clamp } from "./math.js";
import { MILL, PLAY_RADIUS } from "../data/regions.js";

export const GRID_HALF = 72; // grid covers [-72, 72]² at 1 m
export const GRID_N = GRID_HALF * 2 + 1;

export function createTerrain(region) {
  const T = region.terrain;
  const seed = T.seed;
  const roads = region.roads;

  const roadDist = (x, z) => {
    let best = 1e9;
    for (const poly of roads) {
      for (let i = 0; i < poly.length - 1; i++) {
        const d = pointSegDist(x, z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]).d;
        if (d < best) best = d;
      }
    }
    return best;
  };
  // the mill pad: an ellipse around the sawmill (local x is the long axis)
  const padDist = (x, z) => Math.hypot((x - MILL.x) / 1.35, z - (MILL.z + 0.5));

  const base = (x, z) => T.amp * fbm(x * T.freq, z * T.freq, seed, 4) + T.rough * 0.45 * fbm(x * 0.22, z * 0.22, seed + 7, 2);
  const smoothBase = (x, z) => T.amp * fbm(x * T.freq, z * T.freq, seed, 2);
  const padH = smoothBase(MILL.x, MILL.z);

  /** analytic height (used to fill the grid and for the far backdrop) */
  const analytic = (x, z) => {
    let h = base(x, z);
    const r = Math.hypot(x, z);
    const edge = smoothstep(PLAY_RADIUS - 6, PLAY_RADIUS + 46, r);
    if (edge > 0) h += edge * T.hill * (0.75 + 0.45 * fbm(x * 0.018, z * 0.018, seed + 3, 3));
    const rd = roadDist(x, z);
    const wr = 1 - smoothstep(1.4, 3.6, rd);
    if (wr > 0) h = lerp(h, smoothBase(x, z) - 0.04, wr * 0.7);
    const pd = padDist(x, z);
    const wp = 1 - smoothstep(13, 21, pd);
    if (wp > 0) h = lerp(h, padH, wp);
    return h;
  };

  const grid = new Float32Array(GRID_N * GRID_N);
  const road = new Float32Array(GRID_N * GRID_N);
  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      const x = i - GRID_HALF;
      const z = j - GRID_HALF;
      grid[j * GRID_N + i] = analytic(x, z);
      road[j * GRID_N + i] = 1 - smoothstep(1.2, 2.6, roadDist(x, z));
    }
  }

  /** triangle-exact height (matches the mesh: cell split along (i,j+1)-(i+1,j)) */
  const heightAt = (x, z) => {
    const gx = x + GRID_HALF;
    const gz = z + GRID_HALF;
    if (gx < 0 || gz < 0 || gx >= GRID_N - 1 || gz >= GRID_N - 1) return analytic(x, z);
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const u = gx - i;
    const v = gz - j;
    const ha = grid[j * GRID_N + i];
    const hd = grid[j * GRID_N + i + 1];
    const hb = grid[(j + 1) * GRID_N + i];
    const hc = grid[(j + 1) * GRID_N + i + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  };

  const normalAt = (x, z) => {
    const e = 0.6;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    const nx = -dx / (2 * e);
    const nz = -dz / (2 * e);
    const l = Math.hypot(nx, 1, nz);
    return [nx / l, 1 / l, nz / l];
  };

  /** slope (rise per metre) along a horizontal direction */
  const slopeAlong = (x, z, dx, dz) => {
    const e = 0.5;
    return (heightAt(x + dx * e, z + dz * e) - heightAt(x - dx * e, z - dz * e)) / (2 * e);
  };

  const roadAt = (x, z) => {
    const gx = clamp(Math.round(x + GRID_HALF), 0, GRID_N - 1);
    const gz = clamp(Math.round(z + GRID_HALF), 0, GRID_N - 1);
    return road[gz * GRID_N + gx];
  };

  return { heightAt, normalAt, slopeAlong, analytic, roadAt, roadDist, padDist, grid, road, padH };
}
