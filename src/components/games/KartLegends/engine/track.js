/**
 * Kart Legends — track geometry, shared by physics, AI, race logic and meshes.
 *
 * A track is a closed Catmull-Rom loop through authored control points,
 * resampled every ~1 m into samples { x, z, y, s, tx, tz, nx, nz, w, curv }:
 *   s      distance along the lap (0 = finish line)
 *   t / n  unit tangent (racing direction) and left normal
 *   w      road half-width; the off-road band runs to w + margin, where the
 *          barrier stands
 * An optional shortcut is its own narrow band leaving the main road at
 * fraction `from` and rejoining at `to`; progress along it maps linearly
 * onto that stretch of the lap, so positions and laps stay continuous.
 *
 * Drivable = inside the main barrier band OR inside the shortcut band.
 */
import { clamp } from "./rng.js";

// shortcut surfaces that are bumpy: top speed capped there (the risk)
const ROUGH = new Set(["dirt", "sand", "snow"]);

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sampleLoop(pts, step, closed = true) {
  const n = pts.length;
  const dense = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      dense.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  if (!closed) dense.push(pts[n - 1]);
  // even resample by arc length
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i <= dense.length - (closed ? 0 : 1); i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let ax = a[0];
    let az = a[1];
    while (acc + seg >= step) {
      const f = (step - acc) / seg;
      ax += (b[0] - ax) * f;
      az += (b[1] - az) * f;
      out.push([ax, az]);
      seg = Math.hypot(b[0] - ax, b[1] - az);
      acc = 0;
    }
    acc += seg;
  }
  if (closed && Math.hypot(out[out.length - 1][0] - out[0][0], out[out.length - 1][1] - out[0][1]) < step * 0.5) out.pop();
  return out;
}

function frames(raw, closed) {
  const n = raw.length;
  const S = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = raw[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = raw[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (i > 0) s += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    S.push({ x: raw[i][0], z: raw[i][1], s, tx, tz, nx: tz, nz: -tx, y: 0, w: 6, curv: 0 }); // n = left
  }
  const L = closed ? s + Math.hypot(raw[0][0] - raw[n - 1][0], raw[0][1] - raw[n - 1][1]) : s;
  // signed curvature (+ = turning left)
  for (let i = 0; i < n; i++) {
    const a = S[closed ? (i - 3 + n) % n : Math.max(0, i - 3)];
    const b = S[closed ? (i + 3) % n : Math.min(n - 1, i + 3)];
    const da = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
    const d = Math.atan2(Math.sin(da), Math.cos(da));
    S[i].curv = d / 6;
  }
  return { S, L };
}

export function buildTrack(def) {
  const scale = def.scale || 1;
  const pts = def.pts.map(([x, z]) => [x * scale, z * scale]);
  const { S, L } = frames(sampleLoop(pts, 1.0, true), true);
  const N = S.length;
  const baseW = def.width ?? 6.2;
  const margin = def.margin ?? 4.2;
  const hills = def.hills || 0;
  for (const p of S) {
    const f = p.s / L;
    let w = baseW;
    for (const [a, b, ww] of def.narrow || []) {
      if (f >= a && f <= b) {
        const e = Math.min(f - a, b - f) * L;
        w = baseW + (ww - baseW) * clamp(e / 12, 0, 1);
      }
    }
    p.w = w;
    p.y = hills ? hills * (Math.sin(f * Math.PI * 2 * 2 + 0.6) * 0.6 + Math.sin(f * Math.PI * 2 * 3 + 1.9) * 0.4) * Math.min(1, Math.min(f, 1 - f) * 12) : 0;
    p.slip = 0;
    for (const [a, b] of def.slippery || []) if (f >= a && f <= b) p.slip = 1;
  }
  const at = (frac) => S[Math.floor((((frac % 1) + 1) % 1) * N) % N];

  // --- shortcut ---------------------------------------------------------------
  let shortcut = null;
  if (def.shortcut) {
    const sc = def.shortcut;
    // mouths: lap fractions, or the samples nearest authored coordinates
    const nearest = (xy) => {
      let bi = 0;
      let bd = Infinity;
      for (const p of S) {
        const d = (p.x - xy[0] * scale) ** 2 + (p.z - xy[1] * scale) ** 2;
        if (d < bd) {
          bd = d;
          bi = p;
        }
      }
      return bi;
    };
    const A = sc.fromXY ? nearest(sc.fromXY) : at(sc.from);
    const B = sc.toXY ? nearest(sc.toXY) : at(sc.to);
    const via = sc.via.map(([x, z]) => [x * scale, z * scale]);
    const pathPts = [[A.x, A.z], ...via, [B.x, B.z]];
    const { S: SS, L: SL } = frames(sampleLoop(pathPts, 1.0, false), false);
    const s0 = A.s;
    let s1 = B.s;
    if (s1 < s0) s1 += L;
    for (const p of SS) {
      const t = p.s / SL;
      p.y = A.y + (B.y - A.y) * t;
      p.w = sc.width ?? 3.4;
    }
    shortcut = { samples: SS, length: SL, s0, s1, kind: sc.kind || "dirt", rough: ROUGH.has(sc.kind || "dirt"), width: sc.width ?? 3.4, from: s0 / L, to: (s1 % L) / L };
  }

  // --- checkpoints (ordered; none inside the stretch a shortcut skips) -----------
  const nCp = def.checkpoints || 8;
  const cps = [];
  for (let k = 1; k <= nCp; k++) {
    let s = (k / (nCp + 1)) * L;
    if (shortcut) {
      const inSkip = (v) => {
        const a = shortcut.s0 % L;
        const b = shortcut.s1 % L;
        return a < b ? v > a - 4 && v < b + 4 : v > a - 4 || v < b + 4;
      };
      let guard = 0;
      while (inSkip(s) && guard++ < 400) s = (s + 3) % L;
    }
    cps.push(s);
  }
  cps.sort((a, b) => a - b);

  // --- features -----------------------------------------------------------------
  // pads snap to the straightest spot within ±5 % of where they were authored
  const pads = (def.pads || []).map((p) => {
    const f0 = Array.isArray(p) ? p[0] : p;
    const lat = Array.isArray(p) ? p[1] : 0;
    let q = at(f0);
    let best = Infinity;
    for (let df = -0.05; df <= 0.05; df += 0.0025) {
      const c = at(f0 + df);
      let k = 0;
      for (let d = -6; d <= 14; d += 2) k = Math.max(k, Math.abs(S[(((Math.floor(((f0 + df) % 1 + 1) % 1 * N) + d) % N) + N) % N].curv));
      const score = k + Math.abs(df) * 0.02;
      if (score < best) {
        best = score;
        q = c;
      }
    }
    return { s: q.s, lat, x: q.x + q.nx * lat, z: q.z + q.nz * lat, y: q.y, h: Math.atan2(q.tx, q.tz), len: 5, hw: 2.1 };
  });
  const pickups = [];
  for (const f of def.pickups || []) {
    const q = at(f);
    for (const lat of [-q.w * 0.55, 0, q.w * 0.55]) pickups.push({ s: q.s, x: q.x + q.nx * lat, z: q.z + q.nz * lat, y: q.y + 0.9 });
  }

  // starting grid: two staggered columns behind the line
  const grid = [];
  for (let k = 0; k < 4; k++) {
    const row = Math.floor(k / 2);
    const back = 7 + row * 7 + (k % 2) * 3.2;
    const lat = (k % 2 ? -1 : 1) * 2.6;
    const q = S[(N - Math.round(back) + N) % N];
    grid.push({ x: q.x + q.nx * lat, z: q.z + q.nz * lat, y: q.y, h: Math.atan2(q.tx, q.tz), s: q.s - L });
  }

  const T = {
    def,
    samples: S,
    N,
    length: L,
    margin,
    shortcut,
    checkpoints: cps,
    pads,
    pickups,
    grid,
    at,
    sampleAtS(s) {
      const i = Math.floor((((s % L) + L) % L) / L * N) % N;
      return S[i];
    },
  };
  return T;
}

/**
 * Nearest point on the main loop (local search from `hint` when given) and,
 * if the track has one, on the shortcut. Returns progress `s` (mapped through
 * the shortcut when the kart is on it), signed lateral offset (+ = left),
 * band info and the main sample index (the next hint).
 */
export function locate(T, x, z, hint = -1) {
  const S = T.samples;
  const N = T.N;
  let bi = 0;
  let bd = Infinity;
  if (hint >= 0) {
    for (let k = -40; k <= 40; k++) {
      const i = (hint + k + N) % N;
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
  }
  if (hint < 0 || bd > 400) {
    for (let i = 0; i < N; i += 4) {
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    for (let k = -4; k <= 4; k++) {
      const i = (bi + k + N) % N;
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
  }
  const p = S[bi];
  const dx = x - p.x;
  const dz = z - p.z;
  const along = dx * p.tx + dz * p.tz;
  const lat = dx * p.nx + dz * p.nz;
  let s = p.s + along;
  const out = { i: bi, s, lat, w: p.w, y: p.y, onShort: false, shortLat: 0, shortT: 0, slip: p.slip, barrier: p.w + T.margin };
  const SC = T.shortcut;
  if (SC) {
    let sb = Infinity;
    let si = 0;
    for (let i = 0; i < SC.samples.length; i += 2) {
      const q = SC.samples[i];
      const d = (q.x - x) ** 2 + (q.z - z) ** 2;
      if (d < sb) {
        sb = d;
        si = i;
      }
    }
    for (let k = -2; k <= 2; k++) {
      const i = clamp(si + k, 0, SC.samples.length - 1);
      const q = SC.samples[i];
      const d = (q.x - x) ** 2 + (q.z - z) ** 2;
      if (d < sb) {
        sb = d;
        si = i;
      }
    }
    const q = SC.samples[si];
    const slat = (x - q.x) * q.nx + (z - q.z) * q.nz;
    out.shortLat = slat;
    out.shortT = q.s / SC.length;
    out.shortSample = q;
    // on the shortcut once we're outside the main band and within its band
    const inMain = Math.abs(lat) <= out.barrier;
    if (!inMain && Math.abs(slat) <= SC.width + 1.5 && q.s > 0.5 && q.s < SC.length - 0.5) {
      out.onShort = true;
      out.s = SC.s0 + (SC.s1 - SC.s0) * out.shortT;
      out.y = q.y;
    }
  }
  return out;
}

/**
 * Structural validation: no self-overlap of barrier bands, sane curvature,
 * shortcut clear of the main band between its mouths, checkpoints ordered.
 */
export function validateTrack(T) {
  const issues = [];
  const S = T.samples;
  const N = T.N;
  const band = (i) => S[i].w + T.margin;
  for (let i = 0; i < N; i += 3) {
    for (let j = i + 1; j < N; j += 3) {
      let ds = Math.abs(S[i].s - S[j].s);
      ds = Math.min(ds, T.length - ds);
      if (ds < (band(i) + band(j)) * 2.2) continue;
      const d = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z);
      if (d < band(i) + band(j) + 2) {
        issues.push(`track overlaps itself near s=${S[i].s.toFixed(0)} / ${S[j].s.toFixed(0)} (gap ${(d - band(i) - band(j)).toFixed(1)} m)`);
        return issues;
      }
    }
  }
  let maxCurv = 0;
  for (const p of S) maxCurv = Math.max(maxCurv, Math.abs(p.curv));
  if (maxCurv > 1 / 9) issues.push(`a corner is too tight (radius ${(1 / maxCurv).toFixed(1)} m)`);
  if (T.length < 380) issues.push(`lap too short (${T.length.toFixed(0)} m)`);
  const SC = T.shortcut;
  if (SC) {
    let clear = 0;
    for (const q of SC.samples) {
      if (q.s < 22 || q.s > SC.length - 22) continue;
      const loc = locate(T, q.x, q.z, -1);
      if (Math.abs(loc.lat) < loc.barrier + SC.width * 0.6) clear++;
    }
    if (clear > 0) issues.push(`shortcut runs inside the main track for ${clear} m`);
    if (SC.length >= SC.s1 - SC.s0) issues.push(`shortcut is not shorter (${SC.length.toFixed(0)} vs ${(SC.s1 - SC.s0).toFixed(0)} m)`);
  }
  for (let k = 1; k < T.checkpoints.length; k++) if (T.checkpoints[k] <= T.checkpoints[k - 1]) issues.push("checkpoints out of order");
  return issues;
}
