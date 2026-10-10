/**
 * Dimension Dash — collision geometry. ONE world for both play modes: the
 * 2.5D sections are ordinary 3D floors/solids, the side mode only adds a
 * plane constraint on top (see player.js).
 *
 * Floor sources (all one-way from above, so you can jump up through them):
 *   ribbon  sampled road strip (centre line, right vector, half width, bank)
 *   slab    a 2.5D ground profile h(s), extruded across the plane depth
 *   box     yaw-rotated box; solid walls + top floor + bottom ceiling
 *           (solid:false → a floating pad: top floor only)
 *   disc    flat round top (plazas, pillars, islands)
 *
 * Everything static is bucketed into an 8 m xz grid; moving / crumbling
 * pieces live in `dyn` and are always checked.
 */
const CELL = 8;
const key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

export function createGeom() {
  return { cells: new Map(), dyn: [], ribbons: [], slabs: [], boxes: [], discs: [], all: [] };
}

function addToCells(G, x0, z0, x1, z1, entry) {
  const ix0 = Math.floor(x0 / CELL);
  const ix1 = Math.floor(x1 / CELL);
  const iz0 = Math.floor(z0 / CELL);
  const iz1 = Math.floor(z1 / CELL);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      const k = key(ix, iz);
      let c = G.cells.get(k);
      if (!c) G.cells.set(k, (c = []));
      c.push(entry);
    }
  }
}

/* ------------------------------------------------------------------ registration */

/** r: { pts:[{x,y,z,rx,rz,hw,bank,nx,ny,nz}], guard, surf } — samples ~1 m apart */
export function addRibbon(G, r) {
  r.kind = "ribbon";
  r.id = G.all.length;
  G.all.push(r);
  G.ribbons.push(r);
  const pts = r.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const pad = Math.max(a.hw, b.hw) + 1.2;
    addToCells(G, Math.min(a.x, b.x) - pad, Math.min(a.z, b.z) - pad, Math.max(a.x, b.x) + pad, Math.max(a.z, b.z) + pad, { f: r, i });
  }
  return r;
}

/** s: { ox,oy,oz, fx,fz (forward), nx,nz (depth axis), s0, s1, ds, hs[], dh, thick } */
export function addSlab(G, s) {
  s.kind = "slab";
  s.id = G.all.length;
  G.all.push(s);
  G.slabs.push(s);
  const pts = [
    [s.s0, -s.dh],
    [s.s0, s.dh],
    [s.s1, -s.dh],
    [s.s1, s.dh],
  ].map(([a, d]) => [s.ox + s.fx * a + s.nx * d, s.oz + s.fz * a + s.nz * d]);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  addToCells(G, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), { f: s, i: 0 });
  return s;
}

/** b: { x,y,z centre, hx,hy,hz half sizes, yaw, solid, mover, crumble } */
export function addBox(G, b) {
  b.kind = "box";
  b.id = G.all.length;
  b.yaw = b.yaw || 0;
  b.c = Math.cos(b.yaw);
  b.s = Math.sin(b.yaw);
  if (b.solid === undefined) b.solid = true;
  b.bx = b.x;
  b.by = b.y;
  b.bz = b.z;
  b.dx = b.dy = b.dz = 0; // last-step motion (movers)
  b.on = true;
  G.all.push(b);
  G.boxes.push(b);
  if (b.mover || b.crumble) G.dyn.push(b);
  else {
    const e = Math.abs(b.hx * b.c) + Math.abs(b.hz * b.s);
    const f = Math.abs(b.hx * b.s) + Math.abs(b.hz * b.c);
    addToCells(G, b.x - e - 0.6, b.z - f - 0.6, b.x + e + 0.6, b.z + f + 0.6, { f: b, i: 0 });
  }
  return b;
}

/** d: { x,y (top),z, r, solid (cylinder walls down to y0), y0 } */
export function addDisc(G, d) {
  d.kind = "disc";
  d.id = G.all.length;
  d.bx = d.x;
  d.by = d.y;
  d.bz = d.z;
  d.dx = d.dy = d.dz = 0;
  d.on = true;
  G.all.push(d);
  G.discs.push(d);
  if (d.mover) G.dyn.push(d);
  else addToCells(G, d.x - d.r - 0.6, d.z - d.r - 0.6, d.x + d.r + 0.6, d.z + d.r + 0.6, { f: d, i: 0 });
  return d;
}

/* ------------------------------------------------------------------ queries */

const seen = new Set();
function forCell(G, x, z, fn) {
  const c = G.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (c) for (let k = 0; k < c.length; k++) fn(c[k].f, c[k].i);
  const d = G.dyn;
  for (let k = 0; k < d.length; k++) fn(d[k], 0);
}

/** surface sample of one ribbon segment at (x,z); returns y or NaN, fills n */
function ribbonAt(r, i, x, z, n) {
  const pts = r.pts;
  const a = pts[i];
  const b = pts[i + 1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-9) return NaN;
  let u = ((x - a.x) * dx + (z - a.z) * dz) / l2;
  if (u < 0) {
    if (i > 0 || u < -0.02) return NaN;
    u = 0;
  } else if (u > 1) {
    if (i < pts.length - 2 || u > 1.02) return NaN;
    u = 1;
  }
  const cx = a.x + dx * u;
  const cz = a.z + dz * u;
  const rx = a.rx + (b.rx - a.rx) * u;
  const rz = a.rz + (b.rz - a.rz) * u;
  const lat = (x - cx) * rx + (z - cz) * rz;
  const hw = a.hw + (b.hw - a.hw) * u;
  if (lat > hw || lat < -hw) return NaN;
  const bank = a.bank + (b.bank - a.bank) * u;
  if (n) {
    n.x = a.nx + (b.nx - a.nx) * u;
    n.y = a.ny + (b.ny - a.ny) * u;
    n.z = a.nz + (b.nz - a.nz) * u;
    n.lat = lat;
    n.hw = hw;
    n.u = i + u;
  }
  return a.y + (b.y - a.y) * u + lat * bank;
}

function slabAt(s, x, z, n) {
  const px = x - s.ox;
  const pz = z - s.oz;
  const a = px * s.fx + pz * s.fz;
  if (a < s.s0 || a > s.s1) return NaN;
  const d = px * s.nx + pz * s.nz;
  if (d > s.dh || d < -s.dh) return NaN;
  const t = (a - s.s0) / s.ds;
  let i = Math.floor(t);
  const last = s.hs.length - 1;
  if (i >= last) i = last - 1;
  if (i < 0) i = 0;
  const f = Math.min(1, Math.max(0, t - i));
  const h0 = s.hs[i];
  const h1 = s.hs[i + 1];
  if (n) {
    const slope = (h1 - h0) / s.ds;
    const inv = 1 / Math.sqrt(1 + slope * slope);
    n.x = -s.fx * slope * inv;
    n.y = inv;
    n.z = -s.fz * slope * inv;
  }
  return s.oy + h0 + (h1 - h0) * f;
}

function boxLocal(b, x, z) {
  const px = x - b.x;
  const pz = z - b.z;
  // inverse yaw rotation (box local +X = (c, -s), +Z = (s, c)) — matches three rotation.y
  return [px * b.c - pz * b.s, px * b.s + pz * b.c];
}

/**
 * Highest floor top with yBot <= top <= yTop under (x,z).
 * out: { y, nx, ny, nz, src, lat, hw }. Returns true when found.
 */
export function floorBelow(G, x, z, yTop, yBot, out) {
  let best = -Infinity;
  let src = null;
  const n = floorBelow.n || (floorBelow.n = { x: 0, y: 1, z: 0, lat: 0, hw: 0, u: 0 });
  let bnx = 0;
  let bny = 1;
  let bnz = 0;
  let blat = 0;
  let bhw = 0;
  let bu = 0;
  seen.clear();
  forCell(G, x, z, (f, i) => {
    let y = NaN;
    if (f.kind === "ribbon") {
      y = ribbonAt(f, i, x, z, n);
    } else {
      if (seen.has(f.id)) return;
      seen.add(f.id);
      if (f.kind === "slab") y = slabAt(f, x, z, n);
      else if (f.kind === "box") {
        if (!f.on) return;
        const [lx, lz] = boxLocal(f, x, z);
        if (lx > f.hx || lx < -f.hx || lz > f.hz || lz < -f.hz) return;
        y = f.y + f.hy;
        n.x = 0;
        n.y = 1;
        n.z = 0;
      } else if (f.kind === "disc") {
        if (!f.on) return;
        const dx = x - f.x;
        const dz = z - f.z;
        if (dx * dx + dz * dz > f.r * f.r) return;
        y = f.y;
        n.x = 0;
        n.y = 1;
        n.z = 0;
      }
    }
    if (!(y <= yTop && y >= yBot) || y <= best) return;
    best = y;
    src = f;
    bnx = n.x;
    bny = n.y;
    bnz = n.z;
    blat = f.kind === "ribbon" ? n.lat : 0;
    bhw = f.kind === "ribbon" ? n.hw : 0;
    bu = f.kind === "ribbon" ? n.u : 0;
  });
  if (!src) return false;
  out.y = best;
  const l = Math.hypot(bnx, bny, bnz) || 1;
  out.nx = bnx / l;
  out.ny = bny / l;
  out.nz = bnz / l;
  out.src = src;
  out.lat = blat;
  out.hw = bhw;
  out.u = bu;
  return true;
}

/** convenience: any floor near y (used by builders/tests) */
export function groundAt(G, x, z, y = 1e4, below = 1e4) {
  const o = {};
  return floorBelow(G, x, z, y, y - below, o) ? o.y : NaN;
}

/**
 * Horizontal push-out of a vertical capsule (feet..head, radius r) against
 * solid boxes, plus ribbon guard walls. Mutates pos; returns the summed
 * outward wall normal (x,z) in `hit` (zero length when nothing touched).
 */
export function pushOut(G, pos, r, feet, head, stepUp, hit) {
  hit.x = 0;
  hit.z = 0;
  hit.n = 0;
  seen.clear();
  forCell(G, pos.x, pos.z, (f, i) => {
    if (f.kind === "box") {
      if (seen.has(f.id) || !f.on || !f.solid) return;
      seen.add(f.id);
      const top = f.y + f.hy;
      const bot = f.y - f.hy;
      if (feet >= top - stepUp || head <= bot) return; // stand on it / pass under
      const [lx, lz] = boxLocal(f, pos.x, pos.z);
      const ex = f.hx + r;
      const ez = f.hz + r;
      if (lx >= ex || lx <= -ex || lz >= ez || lz <= -ez) return;
      // nearest face; rounded corners would be nicer but boxes are axis-y only
      const px = ex - Math.abs(lx);
      const pz = ez - Math.abs(lz);
      let nlx = 0;
      let nlz = 0;
      let d;
      if (px < pz) {
        nlx = Math.sign(lx) || 1;
        d = px;
      } else {
        nlz = Math.sign(lz) || 1;
        d = pz;
      }
      // local → world normal (rotation.y by yaw)
      const wx = nlx * f.c + nlz * f.s;
      const wz = -nlx * f.s + nlz * f.c;
      pos.x += wx * d;
      pos.z += wz * d;
      hit.x += wx;
      hit.z += wz;
      hit.n++;
    } else if (f.kind === "disc" && f.solid) {
      if (seen.has(f.id) || !f.on) return;
      seen.add(f.id);
      if (feet >= f.y - stepUp || head <= f.y0) return;
      const dx = pos.x - f.x;
      const dz = pos.z - f.z;
      const d = Math.hypot(dx, dz);
      const R = f.r + r;
      if (d >= R || d < 1e-6) return;
      const nx = dx / d;
      const nz = dz / d;
      pos.x = f.x + nx * R;
      pos.z = f.z + nz * R;
      hit.x += nx;
      hit.z += nz;
      hit.n++;
    } else if (f.kind === "ribbon" && f.guard) {
      const pts = f.pts;
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      const u = ((pos.x - a.x) * dx + (pos.z - a.z) * dz) / l2;
      if (u < 0 || u > 1) return;
      const cx = a.x + dx * u;
      const cz = a.z + dz * u;
      const rx = a.rx + (b.rx - a.rx) * u;
      const rz = a.rz + (b.rz - a.rz) * u;
      const lat = (pos.x - cx) * rx + (pos.z - cz) * rz;
      const hw = a.hw + (b.hw - a.hw) * u;
      const al = Math.abs(lat);
      const lim = hw - r * 0.5;
      if (al <= lim || al > hw + 1.4) return;
      const y = a.y + (b.y - a.y) * u + lat * (a.bank + (b.bank - a.bank) * u);
      if (feet < y - 0.8 || feet > y + 1.6) return;
      const sg = Math.sign(lat);
      const d = al - lim;
      pos.x -= rx * sg * d;
      pos.z -= rz * sg * d;
      hit.x -= rx * sg;
      hit.z -= rz * sg;
      hit.n++;
    }
  });
  return hit.n > 0;
}

/** lowest solid-box bottom the head would cross moving up (yOld→yNew); NaN if none */
export function ceilingAbove(G, x, z, r, headOld, headNew) {
  let best = NaN;
  seen.clear();
  forCell(G, x, z, (f) => {
    if (f.kind !== "box" || seen.has(f.id) || !f.on || !f.solid) return;
    seen.add(f.id);
    const bot = f.y - f.hy;
    if (bot < headOld - 0.05 || bot > headNew) return;
    const [lx, lz] = boxLocal(f, x, z);
    const ex = f.hx + r * 0.6;
    const ez = f.hz + r * 0.6;
    if (lx >= ex || lx <= -ex || lz >= ez || lz <= -ez) return;
    if (!(bot >= best)) best = bot;
  });
  return best;
}

/** true when the segment a→b passes through a solid box or under terrain */
export function blocked(G, ax, ay, az, bx, by, bz) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(2, Math.ceil(len / 0.6));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const z = az + (bz - az) * t;
    let hit = false;
    seen.clear();
    forCell(G, x, z, (f) => {
      if (hit || f.kind !== "box" || seen.has(f.id) || !f.on || !f.solid) return;
      seen.add(f.id);
      if (y > f.y + f.hy - 0.05 || y < f.y - f.hy + 0.05) return;
      const [lx, lz] = boxLocal(f, x, z);
      if (Math.abs(lx) < f.hx - 0.05 && Math.abs(lz) < f.hz - 0.05) hit = true;
    });
    if (hit) return true;
    if (insideTerrain(G, x, y, z)) return true;
  }
  return false;
}

/** is the point buried inside a ground slab / road deck (below its top, within its thickness)? */
export function insideTerrain(G, x, y, z) {
  let inside = false;
  const n = { x: 0, y: 1, z: 0 };
  seen.clear();
  forCell(G, x, z, (f, i) => {
    if (inside) return;
    let top = NaN;
    if (f.kind === "ribbon") top = ribbonAt(f, i, x, z, n);
    else if (f.kind === "slab") {
      if (seen.has(f.id)) return;
      seen.add(f.id);
      top = slabAt(f, x, z, n);
    } else return;
    const th = f.thick || 1.2;
    if (y < top - 0.25 && y > top - th) inside = true;
  });
  return inside;
}

/** step every mover / crumbler (records per-step deltas for riders) */
export function stepDynamic(G, t, dt) {
  for (const b of G.dyn) {
    const ox = b.x;
    const oy = b.y;
    const oz = b.z;
    const m = b.mover;
    if (m) {
      // ping-pong between base and base+to with eased motion, or a circle
      const ph = ((t + (m.phase || 0) * m.period) % m.period) / m.period;
      if (m.circle) {
        const a = ph * Math.PI * 2;
        b.x = b.bx + Math.cos(a) * m.circle;
        b.z = b.bz + Math.sin(a) * m.circle;
        b.y = b.by;
      } else {
        const k = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
        b.x = b.bx + m.to[0] * k;
        b.y = b.by + m.to[1] * k;
        b.z = b.bz + m.to[2] * k;
      }
    }
    const c = b.crumble;
    if (c) {
      if (c.state === "shake") {
        c.t -= dt;
        if (c.t <= 0) {
          c.state = "fall";
          c.t = 0;
          c.vy = 0;
        }
      } else if (c.state === "fall") {
        c.vy -= 30 * dt;
        b.y += c.vy * dt;
        c.t += dt;
        if (c.t > 0.5) b.on = false;
        if (c.t > c.respawn) {
          c.state = "idle";
          b.x = b.bx;
          b.y = b.by;
          b.z = b.bz;
          b.on = true;
        }
      }
    }
    b.dx = b.x - ox;
    b.dy = b.y - oy;
    b.dz = b.z - oz;
  }
}
