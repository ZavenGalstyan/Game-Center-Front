/**
 * Pirate Cove — caves. A cave interior is a signed-distance field built from
 * chambers (circles) and tunnels (capsules), in cave-local metres. The same
 * SDF gives the walkable floor (engine), the rock walls / floor / ceiling
 * mesh (three/caveGeo.js, marching squares) and the camera clamp.
 *
 * Cave interiors are placed far from the sea region (`origin`) so the two
 * worlds can never overlap; the renderer only draws the area you're in.
 */
import { fbm, smoothstep } from "./rng.js";

export function prepareCave(def, index) {
  const shapes = def.shapes.map((s) => (s.b ? { a: s.a, b: s.b, r: s.r } : { c: s.c, r: s.r }));
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const s of shapes) {
    const pts = s.c ? [s.c] : [s.a, s.b];
    for (const p of pts) {
      minX = Math.min(minX, p[0] - s.r - 3);
      minZ = Math.min(minZ, p[1] - s.r - 3);
      maxX = Math.max(maxX, p[0] + s.r + 3);
      maxZ = Math.max(maxZ, p[1] + s.r + 3);
    }
  }
  return {
    ...def,
    shapes,
    index,
    origin: { x: 6000 + index * 600, z: 6000 },
    bounds: { minX, minZ, maxX, maxZ },
    ceiling: def.ceiling ?? 5.2,
    seed: def.seed ?? 11 + index * 7,
  };
}

function segDist(px, pz, a, b) {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t));
}

/** Local SDF: < 0 inside the cave's open space. Wobbled walls so it reads as rock, not CSG. */
export function caveSDF(C, lx, lz) {
  let d = Infinity;
  for (const s of C.shapes) {
    const v = s.c ? Math.hypot(lx - s.c[0], lz - s.c[1]) - s.r : segDist(lx, lz, s.a, s.b) - s.r;
    if (v < d) d = v;
  }
  return d + (fbm(lx * 0.22, lz * 0.22, C.seed, 2) - 0.5) * 1.4;
}

export function caveFloor(C, lx, lz) {
  return (fbm(lx * 0.12, lz * 0.12, C.seed + 3, 2) - 0.5) * 0.5;
}

export function caveCeil(C, lx, lz) {
  const n = fbm(lx * 0.15, lz * 0.15, C.seed + 9, 2);
  const d = caveSDF(C, lx, lz);
  // ceiling sags toward the walls
  return C.ceiling + n * 1.6 - smoothstep(-4, 0, d) * 2.2;
}

export function toCaveWorld(C, p) {
  return { x: C.origin.x + p[0], z: C.origin.z + p[1] };
}
