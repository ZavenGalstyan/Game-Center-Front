/**
 * Mario Adventure 3D — analytic terrain.
 *
 * A level's ground is a handful of ISLANDS (rounded super-ellipses with a
 * wobbly coastline and a flat base height) plus HILLS (smooth bumps / flat-
 * topped mesas) that raise any island they sit on. Outside every island is
 * void (a pit, the sea, or lava — whatever the world shows down there).
 *
 *   height(x, z)   top of the ground, or -Infinity over the void
 *
 * The SAME function feeds collision and the terrain mesh (three/terrainMesh),
 * so what you see is what you stand on. Steep hill flanks and the step between
 * two islands of different height act as walls (see player slope rules).
 */
export const VOID = -Infinity;

function wobble(isl, th) {
  const w = isl.wob ?? 0.05;
  if (!w) return 1;
  const s = isl.seed ?? 0;
  return 1 + w * (Math.sin(3 * th + s) * 0.6 + Math.sin(5 * th + 2.1 * s) * 0.4);
}

/** distance from island centre along the polar angle to the coast, in world units */
export function coastRadius(isl, th) {
  const p = isl.p ?? 2.6;
  const c = Math.abs(Math.cos(th)) / isl.rx;
  const s = Math.abs(Math.sin(th)) / isl.rz;
  const r = 1 / Math.pow(Math.pow(c, p) + Math.pow(s, p), 1 / p);
  return r * wobble(isl, th);
}

/** island-local coordinates (rotation `rot` around its centre) */
function local(isl, x, z) {
  const dx = x - isl.x;
  const dz = z - isl.z;
  const r = isl.rot || 0;
  if (!r) return [dx, dz];
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [dx * c + dz * s, -dx * s + dz * c];
}

export function insideIsland(isl, x, z) {
  const [lx, lz] = local(isl, x, z);
  if (Math.abs(lx) > isl.rx * 1.3 || Math.abs(lz) > isl.rz * 1.3) return false;
  const d = Math.hypot(lx, lz);
  if (d < 1e-6) return true;
  return d < coastRadius(isl, Math.atan2(lz, lx));
}

/** world position of polar (th, s) on the island — s = 0 centre, 1 coast */
export function islandPoint(isl, th, s) {
  const r = coastRadius(isl, th) * s;
  const lx = Math.cos(th) * r;
  const lz = Math.sin(th) * r;
  const ro = isl.rot || 0;
  if (!ro) return [isl.x + lx, isl.z + lz];
  const c = Math.cos(ro);
  const sn = Math.sin(ro);
  return [isl.x + lx * c - lz * sn, isl.z + lx * sn + lz * c];
}

function hillAt(h, x, z) {
  const dx = (x - h.x) / (h.rx ?? h.r);
  const dz = (z - h.z) / (h.rz ?? h.r);
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= 1) return 0;
  const flat = h.flat ?? 0;
  if (d <= flat) return h.h;
  const t = (d - flat) / (1 - flat);
  return h.h * 0.5 * (1 + Math.cos(Math.PI * t));
}

export function createTerrain(level) {
  const islands = (level.islands || []).map((i, k) => ({ ...i, id: k }));
  const hills = level.hills || [];
  function islandHeight(isl, x, z) {
    let y = isl.h;
    for (let k = 0; k < hills.length; k++) {
      const h = hills[k];
      if (h.island != null && h.island !== isl.id) continue;
      y += hillAt(h, x, z);
    }
    return y;
  }
  function height(x, z) {
    let best = VOID;
    for (let k = 0; k < islands.length; k++) {
      const isl = islands[k];
      if (!insideIsland(isl, x, z)) continue;
      const y = islandHeight(isl, x, z);
      if (y > best) best = y;
    }
    return best;
  }
  function islandAt(x, z) {
    let best = null;
    let by = VOID;
    for (const isl of islands) {
      if (!insideIsland(isl, x, z)) continue;
      const y = islandHeight(isl, x, z);
      if (y > by) {
        by = y;
        best = isl;
      }
    }
    return best;
  }
  /** steepness (rise/run) and downhill direction at a point */
  function slope(x, z) {
    const e = 0.25;
    const h0 = height(x, z);
    const hx = height(x + e, z);
    const hz = height(x, z + e);
    if (!Number.isFinite(h0) || !Number.isFinite(hx) || !Number.isFinite(hz)) return { s: 0, gx: 0, gz: 0 };
    const gx = (hx - h0) / e;
    const gz = (hz - h0) / e;
    return { s: Math.hypot(gx, gz), gx, gz };
  }
  return { islands, hills, height, islandHeight, islandAt, slope };
}
