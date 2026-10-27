/**
 * Iron Arena — map construction helpers. A map module describes its terrain
 * as a height function plus "flats" (levelled pads for bases and structures)
 * and places everything through the builder `b`, which records both the
 * collision shape (engine) and a render item (three/mapView.js) per object.
 *
 * Everything is deterministic (seeded), so node tests and the browser build
 * byte-identical maps.
 */
import { clamp, rng, smooth } from "../util.js";

/** distance outside an (optionally rotated) rectangle or circle, ≤ 0 inside */
function flatDist(f, x, z) {
  if (f.r != null) return Math.hypot(x - f.x, z - f.z) - f.r;
  const c = Math.cos(f.rot || 0);
  const s = Math.sin(f.rot || 0);
  const dx = x - f.x;
  const dz = z - f.z;
  const lx = Math.abs(dx * c - dz * s) - f.hw;
  const lz = Math.abs(dx * s + dz * c) - f.hd;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0);
}

export function makeMap(spec) {
  const flats = spec.flats || [];
  const base = spec.base;
  const height = (x, z) => {
    let h = base(x, z);
    for (let i = 0; i < flats.length; i++) {
      const f = flats[i];
      const d = flatDist(f, x, z);
      if (d >= f.fall) continue;
      const w = d <= 0 ? 1 : 1 - smooth(d / f.fall);
      const target = f.add != null ? h + f.add : f.h;
      h += (target - h) * w * (f.strength ?? 1);
    }
    return h;
  };

  const colliders = [];
  const items = [];
  const lights = [];
  const paths = [];
  const zones = []; // keep-clear zones for scatter
  const spawns = { dm: [], team: [[], []] };
  const flags = [];
  const R = rng(spec.seed || 1);

  const minGround = (x, z, hw, hd, rot = 0) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    let m = Infinity;
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const lx = u * hw;
      const lz = v * hd;
      m = Math.min(m, height(x + lx * c + lz * s, z - lx * s + lz * c));
    }
    return m;
  };

  const b = {
    R,
    height,
    /** solid oriented box */
    box(kind, x, z, w, d, h, o = {}) {
      const rot = o.rot || 0;
      const y = o.y != null ? o.y : minGround(x, z, w / 2, d / 2, rot) - (o.sink ?? 0.25);
      const item = { kind, x, z, w, d, h, rot, y, ...o };
      if (o.solid !== false) colliders.push({ type: "box", x, z, hw: w / 2, hd: d / 2, rot, y0: o.y0 ?? y, y1: y + h, kind, surface: o.surface });
      items.push(item);
      if (o.clear !== false) zones.push({ x, z, r: Math.hypot(w, d) / 2 + 1.5 });
      return item;
    },
    /** solid vertical cylinder */
    cyl(kind, x, z, r, h, o = {}) {
      const y = o.y != null ? o.y : minGround(x, z, r * 0.7, r * 0.7) - (o.sink ?? 0.2);
      const item = { kind, x, z, r, h, y, ...o };
      if (o.solid !== false) colliders.push({ type: "cyl", x, z, r: o.colR ?? r, y0: y, y1: y + h, kind });
      items.push(item);
      if (o.clear !== false) zones.push({ x, z, r: r + 1.5 });
      return item;
    },
    /** driveable slab / ramp; top rises from ya (local -z end) to yb (+z end) */
    deck(kind, x, z, w, d, ya, yb = ya, o = {}) {
      const rot = o.rot || 0;
      const thick = o.thick ?? 0.7;
      colliders.push({ type: "deck", x, z, hw: w / 2, hd: d / 2, rot, ya, yb, thick, kind, surface: o.surface || "metal" });
      const item = { kind, x, z, w, d, ya, yb, rot, thick, deck: true, ...o };
      items.push(item);
      if (o.rails) {
        // guard rails as narrow sloped walls along both long sides
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        for (const side of [-1, 1]) {
          const lx = side * (w / 2 + 0.25);
          colliders.push({ type: "deck", x: x + lx * c, z: z - lx * s, hw: 0.25, hd: d / 2, rot, ya: ya + 1.15, yb: yb + 1.15, thick: 1.15 + thick, kind: "rail", surface: "metal" });
        }
      }
      zones.push({ x, z, r: Math.hypot(w, d) / 2 + 1 });
      return item;
    },
    rock(x, z, r, h, o = {}) {
      return b.cyl("rock", x, z, r, h, { colR: r * 0.88, seed: R.int(1, 99999), sink: 0.6, ...o });
    },
    tree(x, z, s = 1, o = {}) {
      return b.cyl("tree", x, z, 0.32 * s, 9 * s, { colR: 0.42 * s, s, seed: R.int(1, 99999), sink: 0.3, clear: false, ...o, y: o.y ?? height(x, z) - 0.3 });
    },
    /** render-only decoration */
    decor(kind, x, z, o = {}) {
      const item = { kind, x, z, y: o.y ?? height(x, z), rot: o.rot ?? R() * Math.PI * 2, s: o.s ?? 1, seed: R.int(1, 99999), decor: true, ...o };
      items.push(item);
      return item;
    },
    light(x, y, z, color, intensity = 30, dist = 26) {
      lights.push({ x, y, z, color, intensity, dist });
    },
    path(points, width = 7, kind = "road") {
      paths.push({ points, width, kind });
    },
    /** keep an area free of scatter (spawn pads, lanes) */
    clear(x, z, r) {
      zones.push({ x, z, r });
    },
    /** line of boxes along a polyline, with optional gaps [t0,t1] (0..1 per segment) */
    wall(kind, pts, thick, h, o = {}) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const rot = Math.atan2(bx - ax, bz - az);
        const gaps = (o.gaps && o.gaps[i]) || [];
        // pieces between gaps
        let t = 0;
        const cuts = [...gaps, [1, 1]];
        for (const [g0, g1] of cuts) {
          if (g0 > t + 0.001) {
            const t0 = t;
            const t1 = g0;
            const mx = ax + (bx - ax) * ((t0 + t1) / 2);
            const mz = az + (bz - az) * ((t0 + t1) / 2);
            b.box(kind, mx, mz, thick, len * (t1 - t0), h, { ...o, rot, gaps: undefined });
          }
          t = g1;
        }
      }
    },
    spawn(team, x, z, yaw) {
      if (team < 0) spawns.dm.push({ x, z, yaw });
      else spawns.team[team].push({ x, z, yaw });
      zones.push({ x, z, r: 5 });
    },
    flag(team, x, z) {
      flags[team] = { x, z };
      zones.push({ x, z, r: 7 });
    },
    /** is (x,z) far enough from structures, paths and keep-clear zones? */
    free(x, z, r = 1, pathPad = 1.5) {
      if (Math.abs(x) > spec.H - 2 || Math.abs(z) > spec.H - 2) return false;
      for (const zn of zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.r + r) return false;
      for (const p of paths)
        for (let i = 0; i < p.points.length - 1; i++) {
          const [ax, az] = p.points[i];
          const [bx, bz] = p.points[i + 1];
          const dx = bx - ax;
          const dz = bz - az;
          const L = dx * dx + dz * dz || 1;
          const t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
          if (Math.hypot(ax + dx * t - x, az + dz * t - z) < p.width / 2 + r + pathPad) return false;
        }
      return true;
    },
    /** like scatter, but every placement also gets its point-mirrored twin (−x, −z),
     *  so both halves of the map get identical cover */
    scatterSym(n, region, r, fn, tries = 30) {
      let placed = 0;
      for (let i = 0; i < n * tries && placed < n; i++) {
        const x = region.r != null ? region.x + Math.cos(R() * 6.283) * Math.sqrt(R()) * region.r : region.x0 + R() * (region.x1 - region.x0);
        const z = region.r != null ? region.z + Math.sin(R() * 6.283 + 1.7) * Math.sqrt(R()) * region.r : region.z0 + R() * (region.z1 - region.z0);
        if (!b.free(x, z, r) || !b.free(-x, -z, r)) continue;
        const seed = R();
        if (fn(x, z, placed, seed) === false || fn(-x, -z, placed, seed) === false) continue;
        zones.push({ x, z, r }, { x: -x, z: -z, r });
        placed++;
      }
      return placed;
    },
    /** place `n` things inside a region with rejection sampling */
    scatter(n, region, r, fn, tries = 30) {
      let placed = 0;
      for (let i = 0; i < n * tries && placed < n; i++) {
        const x = region.r != null ? region.x + Math.cos(R() * 6.283) * Math.sqrt(R()) * region.r : region.x0 + R() * (region.x1 - region.x0);
        const z = region.r != null ? region.z + Math.sin(R() * 6.283 + 1.7) * Math.sqrt(R()) * region.r : region.z0 + R() * (region.z1 - region.z0);
        if (!b.free(x, z, r)) continue;
        if (fn(x, z, placed) === false) continue;
        zones.push({ x, z, r });
        placed++;
      }
      return placed;
    },
  };

  spec.build(b);

  return {
    id: spec.id,
    name: spec.name,
    theme: spec.theme,
    blurb: spec.blurb,
    H: spec.H,
    outer: spec.outer ?? 70,
    seed: spec.seed,
    height,
    water: spec.water || null,
    surface: spec.surface,
    paint: spec.paint,
    colliders,
    items,
    lights,
    paths,
    spawns,
    flags,
    sun: spec.sun,
  };
}

/** distance from (x,z) to the nearest path centreline of a given kind (for paint) */
export function pathDistance(paths, x, z, kind) {
  let best = Infinity;
  let width = 0;
  for (const p of paths) {
    if (kind && p.kind !== kind) continue;
    for (let i = 0; i < p.points.length - 1; i++) {
      const [ax, az] = p.points[i];
      const [bx, bz] = p.points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const L = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - p.width / 2;
      if (d < best) {
        best = d;
        width = p.width;
      }
    }
  }
  return { d: best, width };
}
