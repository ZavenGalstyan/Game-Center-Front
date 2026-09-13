/**
 * Stonewild — voxel raycasting (Amanatides & Woo grid traversal).
 *
 * Walks the ray one voxel boundary at a time — exact for axis-aligned unit
 * cells, no mesh intersection needed, so it can never disagree with what's
 * actually rendered (a chunk mesh drifting out of sync with its raycast
 * data is a whole bug category this sidesteps entirely).
 */

function frac(v) {
  return v - Math.floor(v);
}

/**
 * `origin`/`dir` are {x,y,z}; `dir` must be normalized. Returns
 * `{ hit:false }` or `{ hit:true, x,y,z, normal:{x,y,z}, distance }` — `x/y/z`
 * is the solid block hit, `normal` points OUT of that block toward the ray
 * origin (add it to get the adjacent placement cell).
 */
export function raycastVoxels(origin, dir, maxDist, isSolid) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  let tMaxX = dir.x !== 0 ? (dir.x > 0 ? 1 - frac(origin.x) : frac(origin.x)) * tDeltaX : Infinity;
  let tMaxY = dir.y !== 0 ? (dir.y > 0 ? 1 - frac(origin.y) : frac(origin.y)) * tDeltaY : Infinity;
  let tMaxZ = dir.z !== 0 ? (dir.z > 0 ? 1 - frac(origin.z) : frac(origin.z)) * tDeltaZ : Infinity;

  let normal = { x: 0, y: 0, z: 0 };
  let t = 0;
  let guard = 0;

  while (t <= maxDist && guard++ < 256) {
    if (isSolid(x, y, z)) {
      return { hit: true, x, y, z, normal, distance: t };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      normal = { x: -stepX, y: 0, z: 0 };
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      normal = { x: 0, y: -stepY, z: 0 };
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = { x: 0, y: 0, z: -stepZ };
    }
  }
  return { hit: false };
}
