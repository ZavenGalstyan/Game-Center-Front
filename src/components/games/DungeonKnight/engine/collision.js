/**
 * Dungeon Knight — room collision. Rooms are small, so everything is a list
 * of solid AABB boxes (walls, door leaves, crates, pillar bases …) and
 * vertical cylinders (barrels, round pillars). Door leaves are boxes with an
 * `on` flag: a closed door is solid, an open one is not.
 *
 *   resolveCircle   push a moving body (player / enemy) out of every solid
 *   raycast         3D ray vs boxes + cylinders (camera boom, line of sight)
 *   segBlocked      is a horizontal segment at height y cut by a solid?
 *   pointSolid      is a point inside a solid (blade tip in a wall?)
 */

export function createColliders() {
  return { boxes: [], cyls: [] };
}

/** b: { x0, x1, z0, z1, y0 = 0, y1, cam = true, on = true, tag } */
export function addBox(C, b) {
  const box = { y0: 0, y1: 4, cam: true, on: true, ...b };
  C.boxes.push(box);
  return box;
}
export function addCyl(C, c) {
  const cyl = { y0: 0, y1: 2, cam: true, on: true, ...c };
  C.cyls.push(cyl);
  return cyl;
}

/**
 * Push circle (x, z, r) out of every solid that overlaps body height
 * [y0, y1]. Two passes resolve corners. Returns the corrected position in `out`.
 */
export function resolveCircle(C, x, z, r, out, y0 = 0, y1 = 1.8) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of C.boxes) {
      if (!b.on || b.y1 <= y0 || b.y0 >= y1) continue;
      const cx = x < b.x0 ? b.x0 : x > b.x1 ? b.x1 : x;
      const cz = z < b.z0 ? b.z0 : z > b.z1 ? b.z1 : z;
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // centre inside the box: leave along the shallowest axis
        const l = x - b.x0;
        const rr = b.x1 - x;
        const n = z - b.z0;
        const s = b.z1 - z;
        const m = Math.min(l, rr, n, s);
        if (m === l) x = b.x0 - r;
        else if (m === rr) x = b.x1 + r;
        else if (m === n) z = b.z0 - r;
        else z = b.z1 + r;
      }
      moved = true;
    }
    for (const c of C.cyls) {
      if (!c.on || c.y1 <= y0 || c.y0 >= y1) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-4;
      x = c.x + (dx / d) * rr;
      z = c.z + (dz / d) * rr;
      moved = true;
    }
    if (!moved) break;
  }
  out[0] = x;
  out[1] = z;
  return out;
}

/** Ray vs AABB (slab). Returns entry distance or Infinity. */
function rayBox(ox, oy, oz, dx, dy, dz, b, pad) {
  let tmin = -Infinity;
  let tmax = Infinity;
  const lo = [b.x0 - pad, b.y0 - pad, b.z0 - pad];
  const hi = [b.x1 + pad, b.y1 + pad, b.z1 + pad];
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return Infinity;
    } else {
      let t1 = (lo[i] - o[i]) / d[i];
      let t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  if (tmax < 0) return Infinity;
  return tmin < 0 ? 0 : tmin;
}

/** Ray vs vertical cylinder. */
function rayCyl(ox, oy, oz, dx, dy, dz, c, pad) {
  const r = c.r + pad;
  const fx = ox - c.x;
  const fz = oz - c.z;
  const a = dx * dx + dz * dz;
  let t;
  if (a < 1e-10) {
    if (fx * fx + fz * fz > r * r) return Infinity;
    t = 0;
  } else {
    const b = 2 * (fx * dx + fz * dz);
    const cc = fx * fx + fz * fz - r * r;
    if (cc <= 0) t = 0;
    else {
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return Infinity;
      t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0) return Infinity;
    }
  }
  const y = oy + dy * t;
  if (y < c.y0 - pad || y > c.y1 + pad) return Infinity;
  return t;
}

/**
 * Distance along (dx, dy, dz) (unit) from the origin to the first solid,
 * capped at `max`. `camOnly` respects the `cam` flag (low rubble doesn't pull
 * the camera in).
 */
export function raycast(C, ox, oy, oz, dx, dy, dz, max, pad = 0, camOnly = false) {
  let best = max;
  for (const b of C.boxes) {
    if (!b.on || (camOnly && !b.cam)) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz, b, pad);
    if (t < best) best = t;
  }
  for (const c of C.cyls) {
    if (!c.on || (camOnly && !c.cam)) continue;
    const t = rayCyl(ox, oy, oz, dx, dy, dz, c, pad);
    if (t < best) best = t;
  }
  return best;
}

/** Is the segment (a → b) at height y blocked by a solid taller than y? */
export function segBlocked(C, ax, az, bx, bz, y = 1.2) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  const t = raycast(C, ax, y, az, dx / len, 0, dz / len, len, 0, false);
  return t < len - 1e-4;
}

export function pointSolid(C, x, y, z, pad = 0) {
  for (const b of C.boxes) {
    if (!b.on) continue;
    if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad && y > b.y0 - pad && y < b.y1 + pad) return b;
  }
  for (const c of C.cyls) {
    if (!c.on) continue;
    if (y < c.y0 - pad || y > c.y1 + pad) continue;
    if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return c;
  }
  return null;
}
