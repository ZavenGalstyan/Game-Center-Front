/**
 * Last Hope — collision world for one location.
 *
 * Shapes: circles {k:'c', x, z, r} and oriented boxes {k:'b', x, z, hw, hd, a}
 * (hw along the box's local x, hd along local z, `a` = yaw). Static solids
 * come from the layout; dynamic ones (camp structures, locked doors) are
 * swapped in with setDynamic(). Both live in one uniform spatial hash.
 */
const CELL = 4;

export function createCollider(map) {
  const W = map.w;
  const D = map.d;
  const nx = Math.ceil(W / CELL) + 1;
  const nz = Math.ceil(D / CELL) + 1;
  const ox = -W / 2;
  const oz = -D / 2;
  let buckets = [];
  let statics = map.solids.map(prep);
  let dyn = [];
  let stamp = 1;

  function prep(s) {
    const o = { ...s };
    if (o.k === "b") {
      o.c = Math.cos(o.a || 0);
      o.s = Math.sin(o.a || 0);
      o.br = Math.hypot(o.hw, o.hd);
    } else o.br = o.r;
    o.m = 0;
    return o;
  }
  function rebuild() {
    buckets = Array.from({ length: nx * nz }, () => []);
    const put = (s) => {
      const i0 = Math.max(0, Math.floor((s.x - s.br - ox) / CELL));
      const i1 = Math.min(nx - 1, Math.floor((s.x + s.br - ox) / CELL));
      const j0 = Math.max(0, Math.floor((s.z - s.br - oz) / CELL));
      const j1 = Math.min(nz - 1, Math.floor((s.z + s.br - oz) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[j * nx + i].push(s);
    };
    statics.forEach(put);
    dyn.forEach(put);
  }
  rebuild();

  /** Candidates overlapping the square around (x,z) with half-size r. */
  function query(x, z, r, out = []) {
    out.length = 0;
    stamp++;
    const i0 = Math.max(0, Math.floor((x - r - ox) / CELL));
    const i1 = Math.min(nx - 1, Math.floor((x + r - ox) / CELL));
    const j0 = Math.max(0, Math.floor((z - r - oz) / CELL));
    const j1 = Math.min(nz - 1, Math.floor((z + r - oz) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const b = buckets[j * nx + i];
        for (let k = 0; k < b.length; k++) {
          const s = b[k];
          if (s.m === stamp) continue;
          s.m = stamp;
          out.push(s);
        }
      }
    return out;
  }

  const tmp = [];
  const res = { x: 0, z: 0, hit: false, nx: 0, nz: 0, solid: null };
  /**
   * Push a circle out of every solid it overlaps (a few relaxation passes).
   * `skip(s)` can exclude shapes (e.g. open doors). Returns a shared result.
   */
  function resolve(x, z, r, skip = null) {
    res.hit = false;
    res.solid = null;
    res.nx = 0;
    res.nz = 0;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      query(x, z, r + 0.5, tmp);
      for (const s of tmp) {
        if (skip && skip(s)) continue;
        if (s.k === "c") {
          const dx = x - s.x;
          const dz = z - s.z;
          const rr = r + s.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4;
            const push = rr - d;
            const ux = d > 1e-4 ? dx / d : 1;
            const uz = d > 1e-4 ? dz / d : 0;
            x += ux * push;
            z += uz * push;
            res.nx = ux;
            res.nz = uz;
            res.hit = true;
            res.solid = s;
            moved = true;
          }
        } else {
          // into box local space (local x = c·dx - s·dz, local z = s·dx + c·dz)
          const dx = x - s.x;
          const dz = z - s.z;
          const lx = s.c * dx - s.s * dz;
          const lz = s.s * dx + s.c * dz;
          const cx = lx < -s.hw ? -s.hw : lx > s.hw ? s.hw : lx;
          const cz = lz < -s.hd ? -s.hd : lz > s.hd ? s.hd : lz;
          let px = lx - cx;
          let pz = lz - cz;
          const d2 = px * px + pz * pz;
          if (d2 < r * r) {
            let ux;
            let uz;
            let push;
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              ux = px / d;
              uz = pz / d;
              push = r - d;
            } else {
              // centre inside the box: leave along the shallowest axis
              const ex = s.hw - Math.abs(lx);
              const ez = s.hd - Math.abs(lz);
              if (ex < ez) {
                ux = lx < 0 ? -1 : 1;
                uz = 0;
                push = ex + r;
              } else {
                ux = 0;
                uz = lz < 0 ? -1 : 1;
                push = ez + r;
              }
            }
            // back to world
            const wx = s.c * ux + s.s * uz;
            const wz = -s.s * ux + s.c * uz;
            x += wx * push;
            z += wz * push;
            res.nx = wx;
            res.nz = wz;
            res.hit = true;
            res.solid = s;
            moved = true;
          }
          void px;
          void pz;
        }
      }
      if (!moved) break;
    }
    const m = 0.6;
    x = Math.max(-W / 2 + m, Math.min(W / 2 - m, x));
    z = Math.max(-D / 2 + m, Math.min(D / 2 - m, z));
    res.x = x;
    res.z = z;
    return res;
  }

  /** Does a circle overlap any solid? */
  function overlaps(x, z, r, skip = null) {
    query(x, z, r + 0.5, tmp);
    for (const s of tmp) {
      if (skip && skip(s)) continue;
      if (s.k === "c") {
        if ((x - s.x) ** 2 + (z - s.z) ** 2 < (r + s.r) ** 2) return s;
      } else {
        const dx = x - s.x;
        const dz = z - s.z;
        const lx = s.c * dx - s.s * dz;
        const lz = s.s * dx + s.c * dz;
        const cx = lx < -s.hw ? -s.hw : lx > s.hw ? s.hw : lx;
        const cz = lz < -s.hd ? -s.hd : lz > s.hd ? s.hd : lz;
        if ((lx - cx) ** 2 + (lz - cz) ** 2 < r * r) return s;
      }
    }
    return null;
  }

  /** Does an oriented box overlap any solid? (conservative: circle-sampled) */
  function boxBlocked(x, z, hw, hd, a, skip = null) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r = Math.min(hw, hd);
    const nxs = Math.max(1, Math.round(hw / r));
    const nzs = Math.max(1, Math.round(hd / r));
    for (let i = 0; i < nxs; i++)
      for (let j = 0; j < nzs; j++) {
        const lx = -hw + r + (i * (2 * hw - 2 * r)) / Math.max(1, nxs - 1);
        const lz = -hd + r + (j * (2 * hd - 2 * r)) / Math.max(1, nzs - 1);
        const wx = x + lx * c + lz * s;
        const wz = z - lx * s + lz * c;
        const hit = overlaps(wx, wz, r * 0.92, skip);
        if (hit) return hit;
      }
    return null;
  }

  /**
   * Segment cast against solids. Returns the hit fraction (1 = clear).
   * `opaque` limits the test to sight-blocking shapes.
   */
  function raycast(ax, az, bx, bz, opaque = false, skip = null, pad = 0) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return 1;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    query(mx, mz, len / 2 + 1, tmp);
    let best = 1;
    for (const s of tmp) {
      if (opaque && !s.op) continue;
      if (skip && skip(s)) continue;
      let t;
      if (s.k === "c") t = rayCircle(ax, az, dx, dz, s.x, s.z, s.r + pad);
      else t = rayBox(ax, az, dx, dz, s, pad);
      if (t != null && t < best) {
        best = t;
        res.solid = s;
      }
    }
    return best;
  }

  return {
    query,
    resolve,
    overlaps,
    boxBlocked,
    raycast,
    lastSolid: () => res.solid,
    setDynamic(list) {
      dyn = list.map(prep);
      rebuild();
    },
    get dynamic() {
      return dyn;
    },
    get statics() {
      return statics;
    },
  };
}

function rayCircle(ax, az, dx, dz, cx, cz, r) {
  const fx = ax - cx;
  const fz = az - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  if (c < 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
function rayBox(ax, az, dx, dz, s, pad) {
  // into local space
  const rx = ax - s.x;
  const rz = az - s.z;
  const ox = s.c * rx - s.s * rz;
  const oz = s.s * rx + s.c * rz;
  const vx = s.c * dx - s.s * dz;
  const vz = s.s * dx + s.c * dz;
  const hw = s.hw + pad;
  const hd = s.hd + pad;
  let t0 = 0;
  let t1 = 1;
  for (const [o, v, h] of [
    [ox, vx, hw],
    [oz, vz, hd],
  ]) {
    if (Math.abs(v) < 1e-9) {
      if (o < -h || o > h) return null;
    } else {
      let ta = (-h - o) / v;
      let tb = (h - o) / v;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
  }
  return t0;
}
