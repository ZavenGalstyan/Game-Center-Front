/**
 * Mountain Journey — the analytic terrain shared by physics, the camera and
 * the meshes, so what you see is exactly what you stand on.
 *
 * A level's ground is carved out of a high "hill" field G(x, z) by its trails:
 *
 *   trails  polylines of nodes { x, z, y, w (half width), l, r (bank kinds),
 *           surf, cave, cap }. Every segment contributes a candidate height
 *           inside its perpendicular band: the trail height across the
 *           corridor, then the bank profile beyond the edge (wall / low /
 *           drop / cave). Regular joints add a disc candidate so bends stay
 *           round; dead ends use the node's `cap` kind in a cone beyond.
 *           "Cliff" segments (a big rise over a few centimetres: ledges,
 *           ladder faces, gap edges) get no discs, so the step stays crisp.
 *   rivers  polylines { x, z, y (surface), w, depth } carved as channels.
 *   lakes   discs { x, z, y, r, depth } carved to a basin.
 *
 *   H(x, z) = min(G, trail candidates, river channels, lakes)
 *
 * Wall banks rise far steeper than PHYS.maxSlope, so they are walls the
 * explorer can't walk up; drop banks fall to a deep valley (falling there is
 * a checkpoint respawn). Every query — physics, camera and mesh vertices —
 * goes through the same spatial buckets, so they agree exactly.
 * tools/simTest.mjs validates trail heights and wall enclosure per level.
 */
import { clamp, fbm, lerp, smoothstep, ridged } from "./rng.js";

const CELL = 8;
const REACH = 34; // wall-type segments matter this far from a cell
const DROP_REACH = 190; // drop banks carve whole valleys
const MARGIN = 140;

function bankRise(kind, e, n, valley) {
  // e = distance outside the corridor edge (negative = inside the corridor)
  switch (kind) {
    case "drop": {
      if (e < 0.45) return 0;
      const f = (e - 0.45) * 2.6 + (e - 0.45) * (e - 0.45) * 0.12;
      return -Math.min(valley + n * 3, f);
    }
    case "low":
      if (e < 0) return 0;
      if (e < 5.5) return e * 0.1;
      return 0.55 + (e - 5.5) * 1.75 + n * 0.6;
    case "cave":
      if (e < 0) return 0;
      return 0.3 + e * 3.4;
    case "wall":
    default:
      // a walkable, forested shoulder, then a slope too steep to climb
      if (e < 0) return 0;
      if (e < 3.5) return 0.1 * e + 0.065 * e * e;
      return 1.15 + (e - 3.5) * 1.55 + n * 1.1 * smoothstep(3.5, 9, e);
  }
}

export function createTerrain(spec) {
  const seed = spec.seed || 1;
  const hillAmp = spec.hillAmp ?? 14;
  const hillBase = spec.hillBase ?? 8.5;
  const valley = spec.valleyDepth ?? 34;
  const segs = [];
  const discs = [];
  const nodes = [];
  const paths = spec.paths || [];

  paths.forEach((path, pi) => {
    const N = path.nodes;
    const seg0 = segs.length;
    for (let i = 0; i < N.length; i++) nodes.push(N[i]);
    const cliff = [];
    for (let i = 0; i < N.length - 1; i++) {
      const a = N[i];
      const b = N[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      cliff.push(len < 0.4 && Math.abs(b.y - a.y) > 0.6);
    }
    for (let i = 0; i < N.length - 1; i++) {
      const a = N[i];
      const b = N[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.max(1e-6, Math.hypot(dx, dz));
      segs.push({
        path: pi,
        i,
        a,
        b,
        dx: dx / len,
        dz: dz / len,
        len,
        cliff: cliff[i],
        drop: a.l === "drop" || a.r === "drop",
      });
    }
    for (let i = 0; i < N.length; i++) {
      if ((i > 0 && cliff[i - 1]) || (i < N.length - 1 && cliff[i])) continue;
      const p = N[Math.max(0, i - 1)];
      const q = N[Math.min(N.length - 1, i + 1)];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const l = Math.max(1e-6, Math.hypot(dx, dz));
      const end = i === 0 || i === N.length - 1;
      discs.push({
        n: N[i],
        dx: dx / l,
        dz: dz / l,
        end,
        first: i === 0,
        path: pi,
        drop: N[i].l === "drop" || N[i].r === "drop" || (end && N[i].cap === "drop"),
        prev: i > 0 ? segs[seg0 + i - 1] : null,
        next: i < N.length - 1 ? segs[seg0 + i] : null,
      });
    }
  });

  const rivers = (spec.rivers || []).map((r) => {
    const s = [];
    for (let i = 0; i < r.nodes.length - 1; i++) {
      const a = r.nodes[i];
      const b = r.nodes[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.max(1e-6, Math.hypot(dx, dz));
      s.push({ a, b, dx: dx / len, dz: dz / len, len });
    }
    return { ...r, segs: s };
  });
  const lakes = spec.lakes || [];

  // --- spatial buckets (shared by every query) -----------------------------
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minZ = Math.min(minZ, n.z);
    maxX = Math.max(maxX, n.x);
    maxZ = Math.max(maxZ, n.z);
  }
  const bounds = { minX, minZ, maxX, maxZ };
  const gx0 = Math.floor((minX - MARGIN) / CELL);
  const gz0 = Math.floor((minZ - MARGIN) / CELL);
  const gw = Math.ceil((maxX + MARGIN) / CELL) - gx0 + 1;
  const gh = Math.ceil((maxZ + MARGIN) / CELL) - gz0 + 1;
  const buckets = new Array(gw * gh);
  const half = CELL * 0.7072;

  function segDist(s, x, z) {
    const px = x - s.a.x;
    const pz = z - s.a.z;
    const t = clamp((px * s.dx + pz * s.dz) / s.len, 0, 1);
    return Math.hypot(x - (s.a.x + s.dx * s.len * t), z - (s.a.z + s.dz * s.len * t));
  }
  for (let gz = 0; gz < gh; gz++) {
    for (let gx = 0; gx < gw; gx++) {
      const cx = (gx0 + gx + 0.5) * CELL;
      const cz = (gz0 + gz + 0.5) * CELL;
      const sb = [];
      for (const s of segs) if (segDist(s, cx, cz) < (s.drop ? DROP_REACH : REACH) + half) sb.push(s);
      const db = [];
      for (const d of discs) if (Math.hypot(d.n.x - cx, d.n.z - cz) < (d.drop ? DROP_REACH : REACH) + half) db.push(d);
      const nb = [];
      let minY = Infinity;
      for (const n of nodes) {
        if (Math.hypot(n.x - cx, n.z - cz) < 80 + half) {
          nb.push(n);
          if (n.y < minY) minY = n.y;
        }
      }
      buckets[gz * gw + gx] = { segs: sb, discs: db, nodes: nb.length ? nb : nodes, minY: nb.length ? minY : -Infinity };
    }
  }
  const everything = { segs, discs, nodes, minY: -Infinity };
  function bucketAt(x, z) {
    const gx = Math.floor(x / CELL) - gx0;
    const gz = Math.floor(z / CELL) - gz0;
    if (gx < 0 || gz < 0 || gx >= gw || gz >= gh) return everything;
    return buckets[gz * gw + gx];
  }

  /** Smooth reference elevation: inverse-distance weighted trail heights. */
  function refY(x, z, list) {
    let wsum = 0;
    let ysum = 0;
    for (const n of list) {
      const d2 = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z) + 16;
      const w = 1 / (d2 * d2);
      wsum += w;
      ysum += n.y * w;
    }
    return wsum > 0 ? ysum / wsum : 0;
  }

  function hillField(x, z, list, dTrail) {
    const far = smoothstep(8, 90, dTrail);
    const n = fbm(x * 0.021, z * 0.021, seed, 4);
    const r = ridged(x * 0.008, z * 0.008, seed + 5, 3);
    return refY(x, z, list) + hillBase + n * hillAmp * (0.5 + far * 0.9) + r * far * hillAmp * 1.8;
  }

  function riverAt(r, x, z) {
    let bd = Infinity;
    let bs = null;
    let bt = 0;
    for (const s of r.segs) {
      const px = x - s.a.x;
      const pz = z - s.a.z;
      const t = clamp((px * s.dx + pz * s.dz) / s.len, 0, 1);
      const d = Math.hypot(x - (s.a.x + s.dx * s.len * t), z - (s.a.z + s.dz * s.len * t));
      if (d < bd) {
        bd = d;
        bs = s;
        bt = t;
      }
    }
    if (!bs) return null;
    const w = lerp(bs.a.w, bs.b.w, bt);
    const level = lerp(bs.a.y, bs.b.y, bt);
    const depth = lerp(bs.a.depth, bs.b.depth, bt);
    let h;
    if (bd < w) h = level - depth * (1 - (bd / w) * (bd / w) * 0.55);
    else h = level - depth * 0.45 + (bd - w) * (r.bankSlope ?? 1.3);
    return { h, level, inWater: bd < w + 0.1, dist: bd, w, dirX: bs.dx, dirZ: bs.dz, river: r };
  }

  /**
   * The one height query. `info` (optional) receives corridor data for the
   * nearest trail: e (distance outside its edge), node, seg, t, d, water.
   */
  function sample(x, z, info) {
    const B = bucketAt(x, z);
    let best = Infinity;
    let nearE = Infinity;
    let nearD = Infinity;
    let nearNode = null;
    let nearSeg = null;
    let nearT = 0;
    const nz = fbm(x * 0.15, z * 0.15, seed + 3, 2);
    for (const s of B.segs) {
      const px = x - s.a.x;
      const pz = z - s.a.z;
      const t = (px * s.dx + pz * s.dz) / s.len;
      if (t < 0 || t > 1) {
        // drop sides open out in a fan beyond the segment ends (wide valleys,
        // not slot canyons) — only well away from the trail itself
        if (!s.drop) continue;
        const perp = px * s.dz - pz * s.dx;
        const kind = perp > 0 ? s.a.l : s.a.r;
        if (kind !== "drop") continue;
        const over = t < 0 ? -t * s.len : (t - 1) * s.len;
        const ap = Math.abs(perp);
        if (ap < 11 + over * 1.6) continue;
        const n = t < 0 ? s.a : s.b;
        const h = n.y + bankRise("drop", Math.hypot(over, ap) - n.w, nz, valley);
        if (h < best) best = h;
        continue;
      }
      const perp = px * s.dz - pz * s.dx; // > 0 → left of travel
      const d = Math.abs(perp);
      const w = lerp(s.a.w, s.b.w, t);
      const e = d - w;
      const h = lerp(s.a.y, s.b.y, t) + bankRise(perp > 0 ? s.a.l : s.a.r, e, nz, valley);
      if (h < best) best = h;
      if (e < nearE) {
        nearE = e;
        nearD = d;
        nearNode = t < 0.5 ? s.a : s.b;
        nearSeg = s;
        nearT = t;
      }
    }
    for (const c of B.discs) {
      const px = x - c.n.x;
      const pz = z - c.n.z;
      // a joint disc only fills the wedge past its incoming segment's end and
      // before its outgoing segment's start (bends, dead ends)
      if (c.prev && (x - c.prev.a.x) * c.prev.dx + (z - c.prev.a.z) * c.prev.dz <= c.prev.len) continue;
      if (c.next && (x - c.next.a.x) * c.next.dx + (z - c.next.a.z) * c.next.dz >= 0) continue;
      const d = Math.hypot(px, pz);
      const e = d - c.n.w;
      let kind = px * c.dz - pz * c.dx > 0 ? c.n.l : c.n.r;
      if (c.end) {
        // dead ends: the cap kind only applies in a cone beyond the end
        const along = (px * c.dx + pz * c.dz) * (c.first ? -1 : 1);
        kind = c.n.cap && along > 0.45 * d ? c.n.cap : c.first ? "wall" : px * c.dz - pz * c.dx > 0 ? c.n.l : c.n.r;
      }
      const h = c.n.y + bankRise(kind, e, nz, valley);
      if (h < best) best = h;
      if (e < nearE) {
        nearE = e;
        nearD = d;
        nearNode = c.n;
        nearSeg = null;
        nearT = 0;
      }
    }
    let h = best;
    // the hill field can only matter when it could be lower than the trails' carve
    if (best > B.minY + hillBase - 0.01) h = Math.min(best, hillField(x, z, B.nodes, nearD));
    let water = null;
    for (const r of rivers) {
      const rr = riverAt(r, x, z);
      if (!rr) continue;
      if (rr.h < h) h = rr.h;
      if (rr.inWater && (!water || rr.level > water.level)) water = rr;
    }
    for (const L of lakes) {
      const d = Math.hypot(x - L.x, z - L.z);
      if (d < L.r + 8) {
        // a frozen pool is a flat ice floor, not water
        const lh = L.frozen ? L.y - 0.03 + Math.max(0, d - L.r) * 1.35 : L.y - 0.12 - L.depth * (1 - smoothstep(L.r * 0.35, L.r, d)) + Math.max(0, d - L.r) * 1.35;
        if (lh < h) h = lh;
        if (!L.frozen && d < L.r && (!water || L.y > water.level)) water = { level: L.y, inWater: true, lake: L, dist: d, w: L.r, dirX: 0, dirZ: 0 };
      }
    }
    if (info) {
      info.h = h;
      info.e = nearE;
      info.d = nearD;
      info.node = nearNode;
      info.seg = nearSeg;
      info.t = nearT;
      info.water = water;
    }
    return h;
  }

  const info0 = {};
  return {
    seed,
    segs,
    discs,
    nodes,
    rivers,
    lakes,
    bounds,
    valley,
    sample,
    height: (x, z) => sample(x, z, null),
    /** Height + corridor info (reuses one object — copy what you keep). */
    query(x, z) {
      sample(x, z, info0);
      return info0;
    },
    /** Gradient (rise per metre) at (x, z). */
    slope(x, z, h0) {
      const e = 0.18;
      const h = h0 ?? sample(x, z, null);
      const gx = (sample(x + e, z, null) - sample(x - e, z, null)) / (2 * e);
      const gz = (sample(x, z + e, null) - sample(x, z - e, null)) / (2 * e);
      return { g: Math.hypot(gx, gz), gx, gz, h };
    },
    /** Water at (x, z): { level } when standing in a river or lake, else null. */
    waterAt(x, z) {
      let best = null;
      for (const r of rivers) {
        const rr = riverAt(r, x, z);
        if (rr && rr.inWater && (!best || rr.level > best.level)) best = rr;
      }
      for (const L of lakes) {
        if (!L.frozen && Math.hypot(x - L.x, z - L.z) < L.r && (!best || L.y > best.level)) best = { level: L.y, lake: L };
      }
      return best;
    },
    /** Distance to the nearest river / lake surface edge (for audio). */
    waterNear(x, z) {
      let best = Infinity;
      let fall = Infinity;
      for (const r of rivers) {
        const rr = riverAt(r, x, z);
        if (rr) best = Math.min(best, Math.max(0, rr.dist - rr.w));
        for (const f of r.falls || []) fall = Math.min(fall, Math.hypot(x - f.x, z - f.z));
      }
      for (const L of lakes) best = Math.min(best, Math.max(0, Math.hypot(x - L.x, z - L.z) - L.r));
      return { water: best, fall };
    },
  };
}

/** Surface kind at a corridor query (used for footsteps and traction). */
export function surfaceAt(q, region) {
  if (q.e < 0.7 && q.node) return q.node.surf || region.surf || "dirt";
  return region.offSurf || "grass";
}

/** Cave roof height above a corridor query, or null in the open. */
export function caveRoofAt(q) {
  const n = q.node;
  if (!n || q.e > 2.5) return null;
  const s = q.seg;
  if (s) {
    if (!s.a.cave && !s.b.cave) return null;
    const a = s.a.cave ? s.a : s.b;
    const b = s.b.cave ? s.b : s.a;
    return lerp(a.y + a.cave.h, b.y + b.cave.h, q.t);
  }
  return n.cave ? n.y + n.cave.h : null;
}
