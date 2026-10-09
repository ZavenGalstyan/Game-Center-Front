/**
 * Downhill Riders — trail geometry, shared by physics, AI, race logic,
 * terrain and meshes. Framework-free (runs in Node for tools/simTest.mjs).
 *
 * A trail is authored as a turtle path: a list of segments
 *
 *   ["S", length, opts]            straight
 *   ["L", degrees, radius, opts]   left arc     ["R", …] right arc
 *
 * expanded into samples every 1 m { x, z, y, s, h, tx, tz, nx, nz, w, grade,
 * curv, dropL, dropR, surf } — t is the riding direction, n the LEFT normal,
 * curvature + = turning left. Height comes from the downhill grade (positive
 * = descending), integrated along the trail. A start pad is added before the
 * gate and a flat run-out after the finish.
 *
 * Sides: every sample has a "wall" or "drop" edge on each side. Walls (trees,
 * rocks, fences) push riders back at w + WALL_MARGIN; drops (cliffs, bridges)
 * let them fall off at w + DROP_MARGIN — a crash and a checkpoint respawn.
 *
 * Features (per segment opts): ramps (+ gaps), rocks, logs, roots, mud,
 * trees, boost orbs, bridges, arches, signs. An optional shortcut is its own
 * narrow band between two points of the main trail; progress along it maps
 * linearly onto the stretch it skips, so positions stay continuous.
 */
import { clamp } from "./rng.js";

export const START_PAD = 16;
export const RUNOUT = 70;
export const WALL_MARGIN = 3.2;
export const DROP_MARGIN = 0.7;
export const BUFFER = 4.5; // flat ground beyond a wall-side barrier (terrain)
export const G = 20; // arcade gravity in the air (m/s²)
export const LOG_H = 0.45;
export const RAMP_SIZES = {
  small: { len: 5, h: 0.75, hw: 2.1 },
  medium: { len: 6, h: 1.25, hw: 2.5 },
  big: { len: 7.5, h: 2.0, hw: 3.0 },
};
const RAMP_EXP = 1.6;

/** Surfaces: grip multiplier, rolling drag (m/s²), speed cap (× top speed), bumpiness. */
export const SURFACES = {
  dirt: { grip: 1, drag: 0, cap: 1, bump: 0.15 },
  dust: { grip: 0.94, drag: 0, cap: 1, bump: 0.2 },
  rock: { grip: 1.02, drag: 0, cap: 1, bump: 0.3 },
  snow: { grip: 0.78, drag: 0.15, cap: 0.98, bump: 0.12 },
  ice: { grip: 0.5, drag: -0.1, cap: 1, bump: 0.05 },
  wood: { grip: 1, drag: 0, cap: 1, bump: 0.25 },
  grass: { grip: 0.85, drag: 2.6, cap: 0.72, bump: 0.45 },
  mud: { grip: 0.6, drag: 5.0, cap: 0.6, bump: 0.35 },
  roots: { grip: 0.85, drag: 1.4, cap: 0.85, bump: 0.9 },
};

function smooth(arr, win) {
  const n = arr.length;
  const out = new Array(n);
  const half = Math.floor(win / 2);
  // prefix sums for an O(n) centred moving average (edges clamp)
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

function parseSeg(sg) {
  const type = sg[0];
  if (type === "S") return { type, len: sg[1], curv: 0, o: sg[2] || {} };
  const deg = sg[1];
  const r = sg[2];
  return { type, len: (Math.abs(deg) * Math.PI * r) / 180, curv: (type === "L" ? 1 : -1) / r, o: sg[3] || {}, deg, r };
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Open Catmull-Rom through pts, evenly resampled every `step` m. */
function sampleOpen(pts, step = 1) {
  const n = pts.length;
  const dense = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < 32; k++) {
      const t = k / 32;
      dense.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  dense.push(pts[n - 1]);
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
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
  const last = pts[n - 1];
  if (Math.hypot(out[out.length - 1][0] - last[0], out[out.length - 1][1] - last[1]) > step * 0.4) out.push(last);
  return out;
}

/** Ramp lift at progress s (0 outside). */
export function rampLift(r, s) {
  if (s < r.s0 || s > r.s1) return 0;
  return r.h * Math.pow((s - r.s0) / r.len, RAMP_EXP);
}

/** Launch speed needed for a ramp of lip height h / lip slope rs to carry `dist` metres. */
function launchFor(h, rs, dist) {
  let lo = 4;
  let hi = 40;
  for (let k = 0; k < 40; k++) {
    const v = (lo + hi) / 2;
    const t = (v * rs + Math.sqrt((v * rs) ** 2 + 2 * G * h)) / G;
    if (v * t >= dist) hi = v;
    else lo = v;
  }
  return hi;
}

export function buildTrail(def) {
  const segs = def.segs.map(parseSeg);
  const startSeg = { type: "S", len: START_PAD, curv: 0, o: { grade: 0.03, w: Math.max(def.width ?? 5.5, 5.5) }, pad: "start" };
  const endSeg = { type: "S", len: RUNOUT, curv: 0, o: { grade: 0.01, w: Math.max(def.width ?? 5.5, 5.5) }, pad: "end" };
  const all = [startSeg, ...segs, endSeg];
  const baseSurf = def.surface || "dirt";
  const kap = [];
  const gr = [];
  const wd = [];
  const dL = [];
  const dR = [];
  const segIdx = [];
  const surf = [];
  let acc = 0;
  all.forEach((sg, k) => {
    const n = Math.max(1, Math.round(sg.len));
    sg.n = n;
    sg.s0 = acc;
    sg.index = k - 1; // authored index (−1 = start pad)
    const d = sg.o.drop || "";
    for (let i = 0; i < n; i++) {
      kap.push((sg.curv * sg.len) / n);
      gr.push(sg.o.grade ?? def.grade ?? 0.12);
      wd.push(sg.o.w ?? def.width ?? 5.5);
      dL.push(d === "L" || d === "B");
      dR.push(d === "R" || d === "B");
      segIdx.push(k);
      surf.push(sg.o.surface || baseSurf);
    }
    acc += n;
  });
  // a ledge (drop edge) starts and ends 5 m inside its narrowed segment, so
  // the width has settled before there is nothing beside the trail
  for (const arr of [dL, dR]) {
    const src = arr.slice();
    for (let i = 0; i < arr.length; i++) {
      if (!src[i]) continue;
      for (let k = -5; k <= 5; k++) {
        const j = i + k;
        if (j < 0 || j >= arr.length || !src[j]) {
          arr[i] = false;
          break;
        }
      }
    }
  }
  const ks = smooth(kap, 9);
  const gs = smooth(gr, 25);
  const ws = smooth(wd, 13);
  const N = kap.length + 1;
  const S = [];
  let x = def.x ?? 0;
  let z = def.z ?? 0;
  let h = ((def.heading ?? 0) * Math.PI) / 180;
  let y = def.y0 ?? 0;
  for (let i = 0; i < N; i++) {
    const j = Math.min(i, kap.length - 1);
    const hh = h + ks[j] / 2;
    S.push({
      i,
      s: i,
      x,
      z,
      y,
      h: hh,
      tx: Math.sin(hh),
      tz: Math.cos(hh),
      nx: Math.cos(hh),
      nz: -Math.sin(hh),
      w: ws[j],
      grade: gs[j],
      curv: ks[j],
      dropL: dL[j],
      dropR: dR[j],
      seg: segIdx[j],
      surf: surf[j],
    });
    if (i < kap.length) {
      x += Math.sin(hh);
      z += Math.cos(hh);
      h += ks[i];
      y -= gs[i];
    }
  }
  const L = N - 1;
  const sGate = START_PAD;
  const sFinish = L - RUNOUT;
  const raceLen = sFinish - sGate;

  const interp = (s) => {
    const c = clamp(s, 0, L);
    const i = Math.min(L - 1, Math.floor(c));
    const f = c - i;
    const a = S[i];
    const b = S[i + 1];
    return { a, b, f, i, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f };
  };
  const pointAt = (s, lat = 0) => {
    const q = interp(s);
    return { x: q.x + q.a.nx * lat, z: q.z + q.a.nz * lat, y: q.y, h: q.a.h, sample: q.a };
  };

  // --- features ------------------------------------------------------------------
  const feats = [];
  const add = (f) => {
    f.id = feats.length;
    feats.push(f);
    return f;
  };
  for (const sg of all) {
    const o = sg.o;
    const sAt = (t) => sg.s0 + clamp(t, 0, 1) * sg.n;
    if (o.ramp) {
      const spec = typeof o.ramp === "string" ? { size: o.ramp } : o.ramp;
      const R = RAMP_SIZES[spec.size || "medium"];
      const s0 = sAt(spec.at ?? 0.45);
      const full = !!o.gap || spec.full;
      const rs = (RAMP_EXP * R.h) / R.len;
      const ramp = add({ type: "ramp", size: spec.size || "medium", s0, s1: s0 + R.len, len: R.len, h: R.h, rs, lat: full ? 0 : spec.lat ?? 0, hw: full ? 99 : R.hw, full, gap: null, minLaunch: 0, seg: sg.index });
      if (o.gap) {
        const glen = typeof o.gap === "number" ? o.gap : o.gap.len;
        ramp.gap = add({ type: "gap", s0: ramp.s1, s1: ramp.s1 + glen, len: glen, depth: 7, water: o.water !== false, ramp: ramp.id, seg: sg.index });
        ramp.minLaunch = launchFor(R.h, rs, glen + 3.5) * 1.06;
      }
    }
    for (const r of o.rocks || []) add({ type: "rock", s: sAt(r[0]), lat: r[1], r: r[2] ?? 0.8, seg: sg.index });
    for (const r of o.trees || []) add({ type: "tree", s: sAt(r[0]), lat: r[1], r: 0.42, seg: sg.index });
    for (const r of o.logs || []) add({ type: "log", s: sAt(r[0]), lat0: r[1] ?? -99, lat1: r[2] ?? 99, seg: sg.index });
    for (const r of o.roots || []) add({ type: "patch", surf: "roots", s0: sAt(r[0]), s1: sAt(r[1]), lat0: r[2] ?? -99, lat1: r[3] ?? 99, seg: sg.index });
    for (const r of o.mud || []) add({ type: "patch", surf: "mud", s0: sAt(r[0]), s1: sAt(r[1]), lat0: r[2] ?? -99, lat1: r[3] ?? 99, seg: sg.index });
    for (const r of o.ice || []) add({ type: "patch", surf: "ice", s0: sAt(r[0]), s1: sAt(r[1]), lat0: r[2] ?? -99, lat1: r[3] ?? 99, seg: sg.index });
    for (const r of o.orbs || []) add({ type: "orb", s: sAt(r[0]), lat: r[1] ?? 0, seg: sg.index });
    if (o.bridge) add({ type: "bridge", kind: o.bridge, s0: sg.s0, s1: sg.s0 + sg.n, seg: sg.index });
    if (o.arch) add({ type: "arch", s: sAt(o.arch === true ? 0.5 : o.arch), seg: sg.index });
    if (o.sign) add({ type: "sign", s: sAt(0.0) - 14, left: sg.curv > 0, seg: sg.index });
    if (o.banner) add({ type: "banner", s: sAt(typeof o.banner === "number" ? o.banner : 0.5), text: typeof o.banner === "string" ? o.banner : null, seg: sg.index });
  }
  // patches / logs clamp to the trail band; resolve world positions
  for (const f of feats) {
    if (f.lat0 != null) {
      const w = interp(f.s ?? f.s0).a.w;
      f.lat0 = Math.max(f.lat0, -w - 0.5);
      f.lat1 = Math.min(f.lat1, w + 0.5);
    }
    if (f.s != null) {
      const p = pointAt(f.s, f.lat ?? 0);
      f.x = p.x;
      f.z = p.z;
      f.y = p.y;
      f.h = p.h;
    }
  }
  // index: features touching each sample (for the per-step ground / collision queries)
  const featAt = Array.from({ length: N }, () => []);
  for (const f of feats) {
    const a = Math.floor((f.s0 ?? f.s) - 3);
    const b = Math.ceil((f.s1 ?? f.s) + 3);
    for (let i = Math.max(0, a); i <= Math.min(N - 1, b); i++) featAt[i].push(f);
  }

  // --- shortcut ------------------------------------------------------------------------
  let shortcut = null;
  if (def.shortcut) shortcut = buildShortcut(def.shortcut, { S, L, sGate, raceLen, all, interp, pointAt, feats, add });

  // --- checkpoints (ordered; clear of features; never inside a shortcut's skip) ------------
  const nCp = def.checkpoints ?? clamp(Math.round(raceLen / 260), 4, 11);
  const cps = [];
  const busy = (s) => {
    if (shortcut && s > shortcut.s0 - 10 && s < shortcut.s1 + 10) return true;
    const q = interp(s).a;
    if (q.dropL || q.dropR || q.w < 3.5 || Math.abs(q.curv) > 1 / 22) return true;
    for (const f of feats) {
      const a = (f.s0 ?? f.s) - 16;
      const b = (f.s1 ?? f.s) + 12;
      if (f.type === "sign" || f.type === "banner" || f.type === "orb") continue;
      if (s > a && s < b) return true;
    }
    return false;
  };
  for (let k = 1; k <= nCp; k++) {
    const want = sGate + (k / (nCp + 1)) * raceLen;
    let best = null;
    for (let d = 0; d <= 90 && best == null; d += 2) {
      for (const sg of [want + d, want - d]) {
        if (sg > sGate + 40 && sg < sFinish - 40 && !busy(sg) && (!cps.length || sg > cps[cps.length - 1].s + 60)) {
          best = sg;
          break;
        }
      }
    }
    if (best == null) continue;
    const p = pointAt(best);
    cps.push({ s: best, x: p.x, z: p.z, y: p.y, h: p.h, n: cps.length + 1 });
  }

  // --- start grid: four riders abreast behind the gate ----------------------------------------
  const grid = [-3.0, -1.0, 1.0, 3.0].map((lat) => {
    const p = pointAt(sGate - 3.5, lat);
    return { x: p.x, z: p.z, y: p.y, h: p.h, s: sGate - 3.5, lat };
  });

  return {
    def,
    samples: S,
    N,
    length: L,
    sGate,
    sFinish,
    raceLen,
    feats,
    featAt,
    ramps: feats.filter((f) => f.type === "ramp"),
    shortcut,
    checkpoints: cps,
    grid,
    segs: all,
    interp,
    pointAt,
    sampleAtS(s) {
      return S[clamp(Math.round(s), 0, L)];
    },
  };
}

function buildShortcut(sc, ctx) {
  const { S, L, sGate, raceLen, all, pointAt } = ctx;
  const toS = (v) => (Array.isArray(v) ? all[v[0] + 1].s0 + clamp(v[1] ?? 0, 0, 1) * all[v[0] + 1].n : sGate + v * raceLen);
  const sA = toS(sc.from);
  const sB = toS(sc.to);
  const A = pointAt(sA);
  const B = pointAt(sB);
  const ta = [Math.sin(A.h), Math.cos(A.h)];
  const tb = [Math.sin(B.h), Math.cos(B.h)];
  const lead = sc.lead ?? 16;
  const pts = [[A.x, A.z], [A.x + ta[0] * lead, A.z + ta[1] * lead]];
  for (const v of sc.via || []) {
    // via: [u, offset] — u along A→B (0..1), offset to the left of that line
    const ux = B.x - A.x;
    const uz = B.z - A.z;
    const l = Math.hypot(ux, uz) || 1;
    pts.push([A.x + ux * v[0] + (uz / l) * v[1], A.z + uz * v[0] - (ux / l) * v[1]]);
  }
  pts.push([B.x - tb[0] * lead, B.z - tb[1] * lead], [B.x, B.z]);
  // evenly spaced control points (Catmull-Rom overshoots on uneven spans)
  const even = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 12));
    for (let k = 1; k <= n; k++) even.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  const raw = sampleOpen(even, 1);
  const n = raw.length;
  const SS = [];
  let s = 0;
  const kind = sc.kind || "forest";
  const drop = kind === "bridge" || kind === "cliff";
  const surf = { forest: "roots", tunnel: "rock", bridge: "wood", cliff: "rock", snow: "ice", canyon: "dust" }[kind] || "dirt";
  for (let i = 0; i < n; i++) {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (i > 0) s += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    SS.push({ i, x: raw[i][0], z: raw[i][1], s, tx, tz, nx: tz, nz: -tx, h: Math.atan2(tx, tz), w: sc.width ?? 2.2, curv: 0, grade: 0, dropL: false, dropR: false, surf });
  }
  const len = s;
  for (let i = 0; i < n; i++) {
    const p = SS[i];
    const u = p.s / len;
    p.y = A.y + (B.y - A.y) * u;
    p.grade = (A.y - B.y) / len;
    // mouths blend in from the trail width; drop edges only away from the mouths
    const e = Math.min(p.s, len - p.s);
    const mw = Math.max(S[Math.round(sA)].w, S[Math.round(sB)].w);
    p.w = (sc.width ?? 2.2) + Math.max(0, mw - (sc.width ?? 2.2)) * clamp(1 - e / 12, 0, 1);
    p.dropL = p.dropR = drop && e > 14;
    const a2 = SS[Math.max(0, i - 3)];
    const b2 = SS[Math.min(n - 1, i + 3)];
    const da = Math.atan2(b2.tx, b2.tz) - Math.atan2(a2.tx, a2.tz);
    p.curv = Math.atan2(Math.sin(da), Math.cos(da)) / Math.max(1, b2.s - a2.s);
  }
  const feats = [];
  if (sc.ramp) {
    const R = RAMP_SIZES[sc.ramp.size || "medium"];
    const s0 = (sc.ramp.at ?? 0.5) * len;
    const rs = (RAMP_EXP * R.h) / R.len;
    const ramp = { type: "ramp", size: sc.ramp.size || "medium", s0, s1: s0 + R.len, len: R.len, h: R.h, rs, lat: 0, hw: 99, full: true, gap: null, minLaunch: 0, onShort: true };
    if (sc.ramp.gap) {
      ramp.gap = { type: "gap", s0: ramp.s1, s1: ramp.s1 + sc.ramp.gap, len: sc.ramp.gap, depth: 7, water: false, onShort: true };
      ramp.minLaunch = launchFor(R.h, rs, sc.ramp.gap + 3.5) * 1.06;
    }
    feats.push(ramp);
    if (ramp.gap) feats.push(ramp.gap);
  }
  return {
    samples: SS,
    length: len,
    s0: sA,
    s1: sB,
    kind,
    width: sc.width ?? 2.2,
    surf,
    feats,
    tunnel: kind === "tunnel",
    mapS: (u) => sA + (sB - sA) * clamp(u / len, 0, 1),
    interp(u) {
      const c = clamp(u, 0, len);
      let i = Math.min(n - 2, Math.floor(c));
      while (i > 0 && SS[i].s > c) i--;
      while (i < n - 2 && SS[i + 1].s < c) i++;
      const a = SS[i];
      const b = SS[i + 1];
      const f = clamp((c - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
      return { a, b, f, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f };
    },
  };
}

/**
 * Nearest point on the main trail (local search from `hint`) and, when the
 * trail has one, on the shortcut. Returns progress `s` (mapped through the
 * shortcut when the rider is on it), signed lateral offset (+ = left), the
 * band edges and the main sample index (the next hint).
 */
export function locate(T, x, z, hint = -1) {
  const S = T.samples;
  const N = T.N;
  let bi = 0;
  let bd = Infinity;
  if (hint >= 0) {
    for (let k = -30; k <= 30; k++) {
      const i = hint + k;
      if (i < 0 || i >= N) continue;
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
  }
  if (hint < 0 || bd > 900) {
    for (let i = 0; i < N; i += 4) {
      const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    for (let k = -4; k <= 4; k++) {
      const i = bi + k;
      if (i < 0 || i >= N) continue;
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
  const s = clamp(p.s + along, 0, T.length);
  const left = lat >= 0;
  const drop = left ? p.dropL : p.dropR;
  const out = {
    i: bi,
    s,
    sMain: s,
    lat,
    w: p.w,
    drop,
    barrier: p.w + (drop ? DROP_MARGIN : WALL_MARGIN),
    onShort: false,
    shortU: 0,
    shortLat: 0,
    shortSample: null,
    shortBarrier: 0,
    shortDrop: false,
  };
  const SC = T.shortcut;
  if (SC) {
    const SS = SC.samples;
    let sb = Infinity;
    let si = 0;
    for (let i = 0; i < SS.length; i += 2) {
      const d = (SS[i].x - x) ** 2 + (SS[i].z - z) ** 2;
      if (d < sb) {
        sb = d;
        si = i;
      }
    }
    for (let k = -2; k <= 2; k++) {
      const i = clamp(si + k, 0, SS.length - 1);
      const d = (SS[i].x - x) ** 2 + (SS[i].z - z) ** 2;
      if (d < sb) {
        sb = d;
        si = i;
      }
    }
    const q = SS[si];
    const ddx = x - q.x;
    const ddz = z - q.z;
    const slat = ddx * q.nx + ddz * q.nz;
    const u = clamp(q.s + ddx * q.tx + ddz * q.tz, 0, SC.length);
    const sdrop = slat >= 0 ? q.dropL : q.dropR;
    out.shortLat = slat;
    out.shortU = u;
    out.shortSample = q;
    out.shortDrop = sdrop;
    out.shortBarrier = q.w + (sdrop ? DROP_MARGIN : 1.0);
    const inMain = Math.abs(lat) <= out.barrier;
    if (!inMain && Math.abs(slat) <= out.shortBarrier + 0.6 && u > 0.5 && u < SC.length - 0.5) {
      out.onShort = true;
      out.s = SC.mapS(u);
    }
  }
  return out;
}

/** Feature lift / gap on a band at progress s, lateral lat. */
function bandFeatures(list, s, lat, out) {
  for (const f of list) {
    if (f.type === "ramp") {
      if (s >= f.s0 && s <= f.s1 && Math.abs(lat - f.lat) <= f.hw) {
        const lift = rampLift(f, s);
        if (lift > out.lift) {
          out.lift = lift;
          out.ramp = f;
        }
      }
    } else if (f.type === "gap") {
      if (s > f.s0 && s < f.s1) out.gap = f;
    } else if (f.type === "patch") {
      if (s >= f.s0 && s <= f.s1 && lat >= f.lat0 && lat <= f.lat1) out.surf = f.surf;
    } else if (f.type === "bridge") {
      if (s >= f.s0 && s <= f.s1) out.surf = "wood";
    }
  }
}

/**
 * Ground under a located point: { y, surf, ramp, gap, band, fall }.
 * `fall` = beyond a drop edge (no ground at all).
 */
export function groundAt(T, loc) {
  const out = { y: 0, lift: 0, surf: "dirt", ramp: null, gap: null, band: "main", fall: false, trailY: 0 };
  if (loc.onShort) {
    const SC = T.shortcut;
    const q = SC.interp(loc.shortU);
    out.band = "short";
    out.trailY = q.y;
    out.surf = q.a.surf;
    bandFeatures(SC.feats, loc.shortU, loc.shortLat, out);
    if (Math.abs(loc.shortLat) > q.a.w) out.surf = SC.tunnel ? "rock" : "grass";
    if (loc.shortDrop && Math.abs(loc.shortLat) > loc.shortBarrier) out.fall = true;
  } else {
    const q = T.interp(loc.sMain);
    out.trailY = q.y;
    out.surf = q.a.surf;
    if (Math.abs(loc.lat) > q.a.w) {
      // the shoulder — unless this is where the shortcut peels away
      const SC = T.shortcut;
      const onPath = SC && Math.abs(loc.shortLat) <= SC.width + 0.3 && loc.shortU > 0.5 && loc.shortU < SC.length - 0.5;
      out.surf = onPath ? SC.surf : "grass";
    }
    bandFeatures(T.featAt[q.i], loc.sMain, loc.lat, out);
    if (loc.drop && Math.abs(loc.lat) > loc.barrier) {
      // over the edge — unless the shortcut band catches the rider here
      const inShort = T.shortcut && Math.abs(loc.shortLat) <= loc.shortBarrier && loc.shortU > 0.5 && loc.shortU < T.shortcut.length - 0.5;
      if (!inShort) out.fall = true;
    }
  }
  out.y = out.trailY + out.lift;
  if (out.gap) out.y = out.trailY - out.gap.depth;
  if (out.fall) out.y = out.trailY - 60;
  return out;
}

/**
 * Structural validation (geometry only — race / bot checks live in the
 * test suite): no self-overlap, sane corners, length, grades, a shortcut
 * clear of the main band and shorter, ordered checkpoints, ramps on
 * straights with clear landings.
 */
export function validateTrail(T) {
  const issues = [];
  const S = T.samples;
  const N = T.N;
  const ext = (p) => p.w + Math.max(p.dropL || p.dropR ? DROP_MARGIN : WALL_MARGIN, WALL_MARGIN) + BUFFER;
  for (let i = 0; i < N; i += 2) {
    for (let j = i + 2; j < N; j += 2) {
      const ds = Math.abs(S[i].s - S[j].s);
      if (ds < (ext(S[i]) + ext(S[j])) * 2.4) continue;
      const d = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z);
      if (d < ext(S[i]) + ext(S[j]) + 3) {
        issues.push(`trail overlaps itself near s=${S[i].s.toFixed(0)} / ${S[j].s.toFixed(0)} (gap ${(d - ext(S[i]) - ext(S[j])).toFixed(1)} m)`);
        i = N;
        break;
      }
    }
  }
  let maxCurv = 0;
  for (const p of S) maxCurv = Math.max(maxCurv, Math.abs(p.curv));
  if (maxCurv > 1 / 10.5) issues.push(`a corner is too tight (radius ${(1 / maxCurv).toFixed(1)} m)`);
  if (T.raceLen < 1200 || T.raceLen > 3400) issues.push(`race length ${T.raceLen.toFixed(0)} m outside 1200–3400`);
  for (const p of S) {
    if (p.grade < -0.06 || p.grade > 0.42) {
      issues.push(`grade ${p.grade.toFixed(2)} out of range at s=${p.s}`);
      break;
    }
    if (p.w < 1.4 || p.w > 9) {
      issues.push(`width ${p.w.toFixed(1)} out of range at s=${p.s}`);
      break;
    }
  }
  if (S[0].y - S[N - 1].y < 60) issues.push("trail barely descends");
  for (const g of T.grid) if (Math.abs(g.lat) > S[Math.round(g.s)].w - 0.6) issues.push("start grid outside the trail");
  // features
  for (const f of T.feats) {
    if (f.type === "ramp") {
      const a = Math.floor(f.s0 - 6);
      const b = Math.ceil((f.gap ? f.gap.s1 : f.s1) + 14);
      let k = 0;
      for (let i = Math.max(0, a); i <= Math.min(N - 1, b); i++) k = Math.max(k, Math.abs(S[i].curv));
      if (k > 1 / 45) issues.push(`ramp at s=${f.s0.toFixed(0)} sits on a bend (radius ${(1 / k).toFixed(0)} m)`);
      if (f.gap) {
        for (let i = Math.floor(f.s0 - 2); i <= Math.ceil(f.gap.s1 + 2); i++) if (S[i].dropL || S[i].dropR) issues.push(`gap at s=${f.s0.toFixed(0)} has a drop edge`);
      }
      if (f.s0 < T.sGate + 30 || (f.gap ? f.gap.s1 : f.s1) > T.sFinish - 20) issues.push(`ramp at s=${f.s0.toFixed(0)} too close to start / finish`);
      // nothing solid on the take-off or landing
      for (const o of T.feats) {
        if (o === f || o === f.gap || !["rock", "tree", "log"].includes(o.type)) continue;
        if (o.s > f.s0 - 8 && o.s < (f.gap ? f.gap.s1 : f.s1) + 22) issues.push(`${o.type} at s=${o.s.toFixed(0)} blocks the ramp at s=${f.s0.toFixed(0)}`);
      }
    }
    if (f.type === "rock" || f.type === "tree" || f.type === "orb") {
      const p = S[Math.round(f.s)];
      if (Math.abs(f.lat) > p.w + 2) issues.push(`${f.type} at s=${f.s.toFixed(0)} is off the trail`);
      if (f.type !== "orb") {
        // there must be a rideable line past every solid obstacle
        const clear = p.w * 2 - (f.r * 2 + 0.6);
        if (clear < 2.2) issues.push(`${f.type} at s=${f.s.toFixed(0)} leaves no line past it`);
      }
    }
  }
  const SC = T.shortcut;
  if (SC) {
    let inside = 0;
    for (const q of SC.samples) {
      if (q.s < 34 || q.s > SC.length - 34) continue;
      const loc = locate(T, q.x, q.z, -1);
      if (Math.abs(loc.lat) < loc.barrier + q.w + 2) inside++;
    }
    if (inside > 0) issues.push(`shortcut runs inside the main trail for ${inside} m`);
    if (SC.length >= (SC.s1 - SC.s0) * 0.92) issues.push(`shortcut is not shorter (${SC.length.toFixed(0)} vs ${(SC.s1 - SC.s0).toFixed(0)} m)`);
    if (SC.samples[0].grade > 0.36) issues.push(`shortcut too steep (${SC.samples[0].grade.toFixed(2)})`);
    let k = 0;
    for (const q of SC.samples) if (q.s > 6 && q.s < SC.length - 6) k = Math.max(k, Math.abs(q.curv));
    if (k > 1 / 10) issues.push(`shortcut bend too tight (radius ${(1 / k).toFixed(1)} m)`);
    if (SC.s0 < T.sGate + 40 || SC.s1 > T.sFinish - 40) issues.push("shortcut too close to start / finish");
  }
  if (T.checkpoints.length < 3) issues.push(`only ${T.checkpoints.length} checkpoints`);
  for (let k = 1; k < T.checkpoints.length; k++) if (T.checkpoints[k].s <= T.checkpoints[k - 1].s) issues.push("checkpoints out of order");
  return issues;
}
