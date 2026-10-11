/**
 * Alpine Rush — course geometry, shared by physics, AI, race logic, terrain
 * and meshes. Framework-free (runs in Node for tools/simTest.mjs).
 *
 * A course is authored as a turtle path of segments
 *
 *   ["S", length, opts]            straight
 *   ["L", degrees, radius, opts]   left arc     ["R", …] right arc
 *
 * expanded into samples every 1 m { x, z, y, s, h, tx, tz, nx, nz, w, grade,
 * curv, dropL, dropR, surf } — t is the skiing direction, n the LEFT normal,
 * curvature + = turning left. Height comes from the grade (positive = going
 * downhill, negative = a short climb), integrated along the piste. A start
 * pad (start house) sits before the start wand and a run-out that climbs
 * gently after the finish brings everyone to a stop.
 *
 * Edges: every sample has a "net" (safety netting at w + NET_MARGIN, deep
 * powder between the piste edge and the net) or a "drop" edge (rocky cliff:
 * ski off it and you fall — a respawn at the last checkpoint).
 *
 * Per-segment opts: grade, w, surface, gates / slalom, ramp, rollers, trees,
 * rocks, fences, ice / powder / rough / packed patches, bridge, drop, banner,
 * sign. Gates are ordered by distance; each is a corridor between two poles
 * (centre lat, half-width hw) that must be skied through.
 */
import { clamp } from "./rng.js";

export const START_PAD = 18;
export const RUNOUT = 80;
export const NET_MARGIN = 3.4; // powder strip between the piste edge and the safety net
export const DROP_MARGIN = 0.8;
export const BUFFER = 5; // flat snow beyond the net (terrain)
export const G = 9.81;
export const FENCE_H = 1.1;
export const RAMP_SIZES = {
  small: { len: 4.5, h: 0.75, hw: 3.2 },
  medium: { len: 6, h: 1.3, hw: 4.0 },
  big: { len: 7.5, h: 2.1, hw: 5.0 },
};
const RAMP_EXP = 1.7;
export const GATE_HW = { slalom: 2.7, gs: 3.8, speed: 5.2 };

/**
 * Snow surfaces. grip: lateral hold · mu: sliding friction (× g) · drag:
 * extra resistance (m/s² per m/s) · brake: snowplough effectiveness · cap:
 * top-speed factor · turn: carve authority · bump: roughness (jolts) ·
 * spray: particle amount.
 */
export const SURFACES = {
  normal: { name: "Groomed", grip: 1, mu: 0.045, drag: 0, brake: 1, cap: 1, turn: 1, bump: 0.08, spray: 1 },
  packed: { name: "Packed", grip: 1.08, mu: 0.034, drag: 0, brake: 1, cap: 1.04, turn: 1.04, bump: 0.04, spray: 0.6 },
  powder: { name: "Powder", grip: 0.92, mu: 0.11, drag: 0.035, brake: 1.25, cap: 0.82, turn: 0.9, bump: 0.18, spray: 2.4 },
  ice: { name: "Ice", grip: 0.4, mu: 0.018, drag: 0, brake: 0.38, cap: 1.06, turn: 0.72, bump: 0.03, spray: 0.35 },
  rough: { name: "Rough", grip: 0.86, mu: 0.07, drag: 0.01, brake: 1, cap: 0.9, turn: 0.92, bump: 0.95, spray: 1.3 },
  wood: { name: "Bridge", grip: 0.9, mu: 0.07, drag: 0, brake: 0.9, cap: 0.96, turn: 0.95, bump: 0.25, spray: 0.4 },
};

function smooth(arr, win) {
  const n = arr.length;
  const out = new Array(n);
  const half = Math.floor(win / 2);
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

export const RAMP_SHOULDER = 1.2;
/** Kicker lift at progress s (0 outside); `lat` tapers it over the sloped shoulders. */
export function rampLift(r, s, lat = null) {
  if (s < r.s0 || s > r.s1) return 0;
  const along = r.h * Math.pow((s - r.s0) / r.len, RAMP_EXP);
  if (lat == null || r.full) return along;
  return along * clamp((r.hw - Math.abs(lat - r.lat)) / RAMP_SHOULDER, 0, 1);
}
/** Roller (snow wave) lift: a smooth bump. */
export function rollerLift(r, s) {
  if (s <= r.s0 || s >= r.s1) return 0;
  const u = Math.sin((Math.PI * (s - r.s0)) / r.len);
  return r.h * u * u;
}

export function buildCourse(def) {
  const segs = def.segs.map(parseSeg);
  const W0 = def.width ?? 12;
  const startSeg = { type: "S", len: START_PAD, curv: 0, o: { grade: 0.07, w: Math.max(W0, 8) }, pad: "start" };
  const endSeg = { type: "S", len: RUNOUT, curv: 0, o: { grade: -0.05, w: Math.max(W0, 10), surface: "packed" }, pad: "end" };
  const all = [startSeg, ...segs, endSeg];
  const baseSurf = def.surface || "normal";
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
      gr.push(sg.o.grade ?? def.grade ?? 0.2);
      wd.push(sg.o.w ?? W0);
      dL.push(d === "L" || d === "B" || !!sg.o.bridge);
      dR.push(d === "R" || d === "B" || !!sg.o.bridge);
      segIdx.push(k);
      surf.push(sg.o.bridge ? "wood" : sg.o.surface || baseSurf);
    }
    acc += n;
  });
  // a cliff edge starts / ends 6 m inside its segment so the width has settled
  for (const arr of [dL, dR]) {
    const src = arr.slice();
    for (let i = 0; i < arr.length; i++) {
      if (!src[i]) continue;
      for (let k = -6; k <= 6; k++) {
        const j = i + k;
        if (j < 0 || j >= arr.length || !src[j]) {
          arr[i] = false;
          break;
        }
      }
    }
  }
  const ks = smooth(kap, 11);
  const gs = smooth(gr, 31);
  const ws = smooth(wd, 21);
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

  // --- features ----------------------------------------------------------------------
  const feats = [];
  const add = (f) => {
    f.id = feats.length;
    feats.push(f);
    return f;
  };
  const gateKind = def.gateKind || (def.mode === "slalom" ? "slalom" : "gs");
  const gateList = [];
  for (const sg of all) {
    const o = sg.o;
    const sAt = (t) => sg.s0 + clamp(t, 0, 1) * sg.n;
    if (o.ramp) {
      const spec = typeof o.ramp === "string" ? { size: o.ramp } : o.ramp;
      const R = RAMP_SIZES[spec.size || "medium"];
      const s0 = sAt(spec.at ?? 0.45);
      add({ type: "ramp", size: spec.size || "medium", s0, s1: s0 + R.len, len: R.len, h: R.h, lat: spec.lat ?? 0, hw: spec.full ? 99 : R.hw, full: !!spec.full, seg: sg.index });
    }
    for (const r of o.rollers || []) {
      const len = r[2] ?? 14;
      const s0 = sAt(r[0]) - len / 2;
      add({ type: "roller", s0, s1: s0 + len, len, h: r[1] ?? 1.2, seg: sg.index });
    }
    for (const r of o.rocks || []) add({ type: "rock", s: sAt(r[0]), lat: r[1], r: r[2] ?? 0.9, seg: sg.index });
    for (const r of o.trees || []) add({ type: "tree", s: sAt(r[0]), lat: r[1], r: 0.55, seg: sg.index });
    for (const r of o.fences || []) add({ type: "fence", s: sAt(r[0]), lat0: Math.min(r[1], r[2]), lat1: Math.max(r[1], r[2]), seg: sg.index });
    for (const r of o.ice || []) add({ type: "patch", surf: "ice", s0: sAt(r[0]), s1: sAt(r[1]), lat0: r[2] ?? -99, lat1: r[3] ?? 99, seg: sg.index });
    for (const r of o.powder || []) add({ type: "patch", surf: "powder", s0: sAt(r[0]), s1: sAt(r[1]), lat0: r[2] ?? -99, lat1: r[3] ?? 99, seg: sg.index });
    for (const r of o.rough || []) add({ type: "patch", surf: "rough", s0: sAt(r[0]), s1: sAt(r[1]), lat0: r[2] ?? -99, lat1: r[3] ?? 99, seg: sg.index });
    for (const r of o.packed || []) add({ type: "patch", surf: "packed", s0: sAt(r[0]), s1: sAt(r[1]), lat0: r[2] ?? -99, lat1: r[3] ?? 99, seg: sg.index });
    if (o.bridge) add({ type: "bridge", s0: sg.s0, s1: sg.s0 + sg.n, seg: sg.index });
    if (o.sign) add({ type: "sign", s: sAt(0) - 18, left: sg.curv > 0, seg: sg.index });
    if (o.banner) add({ type: "banner", s: sAt(typeof o.banner === "number" ? o.banner : 0.5), text: typeof o.banner === "string" ? o.banner : null, seg: sg.index });
    if (o.cannon) for (const r of o.cannon) add({ type: "cannon", s: sAt(r[0]), lat: r[1], r: 0.6, seg: sg.index });
    // gates: explicit [[t, lat, hw?]] or a slalom run { n, amp, from, to, phase, hw, off }
    for (const gd of o.gates || []) gateList.push({ s: sAt(gd[0]), lat: gd[1] ?? 0, hw: gd[2] ?? def.gateHw ?? GATE_HW[gateKind], seg: sg.index });
    if (o.slalom) {
      const sl = o.slalom;
      const n = sl.n;
      const a = sl.from ?? 0.15;
      const b = sl.to ?? 0.85;
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? (a + b) / 2 : a + ((b - a) * k) / (n - 1);
        const side = (k + (sl.phase ?? 0)) % 2 === 0 ? 1 : -1;
        gateList.push({ s: sAt(t), lat: (sl.off ?? 0) + side * (sl.amp ?? 4), hw: sl.hw ?? def.gateHw ?? GATE_HW[gateKind], seg: sg.index });
      }
    }
  }
  // patches / fences clamp to the piste; resolve world positions
  for (const f of feats) {
    if (f.lat0 != null) {
      const w = interp(f.s ?? f.s0).a.w;
      f.lat0 = Math.max(f.lat0, -w - NET_MARGIN);
      f.lat1 = Math.min(f.lat1, w + NET_MARGIN);
    }
    if (f.s != null) {
      const p = pointAt(f.s, f.lat ?? (f.lat0 != null ? (f.lat0 + f.lat1) / 2 : 0));
      f.x = p.x;
      f.z = p.z;
      f.y = p.y;
      f.h = p.h;
    }
  }
  // gates: ordered, numbered, alternating red / blue
  gateList.sort((a, b) => a.s - b.s);
  const gates = gateList.map((g, i) => {
    const p = pointAt(g.s, g.lat);
    const S0 = interp(g.s).a;
    const hw = Math.min(g.hw, S0.w + 1.5);
    const lat = clamp(g.lat, -S0.w + hw * 0.6, S0.w - hw * 0.6);
    const q = pointAt(g.s, lat);
    return { i, n: i + 1, s: g.s, lat, hw, color: i % 2 === 0 ? "red" : "blue", kind: gateKind, x: q.x, z: q.z, y: q.y, h: p.h, seg: g.seg };
  });

  // index: features touching each sample (for the per-step ground / collision queries)
  const featAt = Array.from({ length: N }, () => []);
  for (const f of feats) {
    const a = Math.floor((f.s0 ?? f.s) - 3);
    const b = Math.ceil((f.s1 ?? f.s) + 3);
    for (let i = Math.max(0, a); i <= Math.min(N - 1, b); i++) featAt[i].push(f);
  }

  // --- respawn checkpoints (invisible; clear of features, every ~140 m) ----------------------
  const cps = [];
  const busy = (s) => {
    const q = interp(s).a;
    if (q.dropL || q.dropR || q.surf === "wood" || Math.abs(q.curv) > 1 / 30) return true;
    for (const f of feats) {
      if (f.type === "sign" || f.type === "banner" || f.type === "patch") continue;
      const a = (f.s0 ?? f.s) - 14;
      const b = (f.s1 ?? f.s) + 10;
      if (s > a && s < b) return true;
    }
    for (const g of gates) if (Math.abs(g.s - s) < 4) return true;
    return false;
  };
  const nCp = Math.max(3, Math.round(raceLen / 140));
  for (let k = 1; k <= nCp; k++) {
    const want = sGate + (k / (nCp + 1)) * raceLen;
    let best = null;
    for (let d = 0; d <= 70 && best == null; d += 2) {
      for (const sg of [want - d, want + d]) {
        if (sg > sGate + 30 && sg < sFinish - 25 && !busy(sg) && (!cps.length || sg > cps[cps.length - 1].s + 50)) {
          best = sg;
          break;
        }
      }
    }
    if (best == null) continue;
    const p = pointAt(best);
    cps.push({ s: best, x: p.x, z: p.z, y: p.y, h: p.h, n: cps.length + 1 });
  }

  // --- start grid: four racers abreast in the start house ---------------------------------
  const sp = Math.min(3.2, (S[sGate].w - 1) / 2);
  const grid = [-1.5 * sp, -0.5 * sp, 0.5 * sp, 1.5 * sp].map((lat) => {
    const p = pointAt(sGate - 2.5, lat);
    return { x: p.x, z: p.z, y: p.y, h: p.h, s: sGate - 2.5, lat };
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
    gates,
    ramps: feats.filter((f) => f.type === "ramp"),
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

/**
 * Nearest point on the piste (local search from `hint`). Returns progress s,
 * signed lateral offset (+ = left), the piste half-width, the edge kind and
 * the barrier distance, and the sample index (the next hint).
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
  if (hint < 0 || bd > 1600) {
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
  const drop = lat >= 0 ? p.dropL : p.dropR;
  return { i: bi, s, lat, w: p.w, drop, barrier: p.w + (drop ? DROP_MARGIN : NET_MARGIN) };
}

/**
 * Ground under a located point: { y, trailY, surf, ramp, fall }.
 * Off the groomed piste (beyond w, before the net) is deep powder; beyond a
 * drop edge there is no ground at all (`fall`).
 */
export function groundAt(T, loc) {
  const out = { y: 0, lift: 0, surf: "normal", ramp: null, fall: false, trailY: 0 };
  const q = T.interp(loc.s);
  out.trailY = q.y;
  out.surf = q.a.surf;
  if (Math.abs(loc.lat) > q.a.w && out.surf !== "wood") out.surf = "powder";
  for (const f of T.featAt[q.i]) {
    if (f.type === "ramp") {
      if (loc.s >= f.s0 && loc.s <= f.s1 && Math.abs(loc.lat - f.lat) <= f.hw) {
        const lift = rampLift(f, loc.s, loc.lat);
        if (lift > out.lift) {
          out.lift = lift;
          out.ramp = f;
        }
      }
    } else if (f.type === "roller") {
      const l = rollerLift(f, loc.s);
      if (l > out.lift) out.lift = l;
    } else if (f.type === "patch") {
      if (loc.s >= f.s0 && loc.s <= f.s1 && loc.lat >= f.lat0 && loc.lat <= f.lat1) out.surf = f.surf;
    }
  }
  if (loc.drop && Math.abs(loc.lat) > loc.barrier) out.fall = true;
  out.y = out.trailY + out.lift;
  if (out.fall) out.y = out.trailY - 80;
  return out;
}

/**
 * Structural validation (geometry only — race / bot checks live in the test
 * suite): no self-overlap, sane corners, length, grades, widths; jumps on
 * straights with clear landings; every obstacle leaves a line past it;
 * gates inside the piste, ordered and spaced; checkpoints ordered.
 */
export function validateCourse(T) {
  const issues = [];
  const S = T.samples;
  const N = T.N;
  const ext = (p) => p.w + NET_MARGIN + BUFFER;
  for (let i = 0; i < N; i += 3) {
    for (let j = i + 3; j < N; j += 3) {
      const ds = Math.abs(S[i].s - S[j].s);
      if (ds < (ext(S[i]) + ext(S[j])) * 2.4) continue;
      const d = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z);
      if (d < ext(S[i]) + ext(S[j]) + 4) {
        issues.push(`course overlaps itself near s=${S[i].s.toFixed(0)} / ${S[j].s.toFixed(0)}`);
        i = N;
        break;
      }
    }
  }
  let maxCurv = 0;
  for (const p of S) maxCurv = Math.max(maxCurv, Math.abs(p.curv));
  if (maxCurv > 1 / 17) issues.push(`a corner is too tight (radius ${(1 / maxCurv).toFixed(1)} m)`);
  if (T.raceLen < 650 || T.raceLen > 2600) issues.push(`race length ${T.raceLen.toFixed(0)} m outside 650–2600`);
  for (const p of S) {
    if (p.grade < -0.09 || p.grade > 0.62) {
      issues.push(`grade ${p.grade.toFixed(2)} out of range at s=${p.s}`);
      break;
    }
    if (p.w < 4.5 || p.w > 24) {
      issues.push(`width ${p.w.toFixed(1)} out of range at s=${p.s}`);
      break;
    }
  }
  if (S[0].y - S[N - 1].y < 50) issues.push("course barely descends");
  for (const g of T.grid) if (Math.abs(g.lat) > S[Math.round(g.s)].w - 0.8) issues.push("start grid outside the piste");
  for (const f of T.feats) {
    if (f.type === "ramp") {
      let k = 0;
      for (let i = Math.max(0, Math.floor(f.s0 - 8)); i <= Math.min(N - 1, Math.ceil(f.s1 + 30)); i++) k = Math.max(k, Math.abs(S[i].curv));
      if (k > 1 / 60) issues.push(`jump at s=${f.s0.toFixed(0)} sits on a bend (radius ${(1 / k).toFixed(0)} m)`);
      if (f.s0 < T.sGate + 30 || f.s1 > T.sFinish - 30) issues.push(`jump at s=${f.s0.toFixed(0)} too close to start / finish`);
      for (const o of T.feats) {
        if (o === f || !["rock", "tree", "fence", "cannon"].includes(o.type)) continue;
        if (o.s > f.s0 - 8 && o.s < f.s1 + 34) issues.push(`${o.type} at s=${o.s.toFixed(0)} blocks the jump at s=${f.s0.toFixed(0)}`);
      }
      for (const g of T.gates) if (g.s > f.s0 - 6 && g.s < f.s1 + 22) issues.push(`gate ${g.n} sits on the jump at s=${f.s0.toFixed(0)}`);
    }
    if (f.type === "rock" || f.type === "tree" || f.type === "cannon") {
      const p = S[Math.round(f.s)];
      if (Math.abs(f.lat) > p.w + NET_MARGIN) issues.push(`${f.type} at s=${f.s.toFixed(0)} is beyond the net`);
      const clear = p.w * 2 - (f.r * 2 + 0.6);
      if (clear < 5) issues.push(`${f.type} at s=${f.s.toFixed(0)} leaves no line past it`);
      for (const g of T.gates) {
        if (Math.abs(g.s - f.s) < 6 && Math.abs(g.lat - f.lat) < g.hw + f.r + 0.8) issues.push(`${f.type} at s=${f.s.toFixed(0)} blocks gate ${g.n}`);
      }
    }
    if (f.type === "fence") {
      const p = S[Math.round(f.s)];
      const free = Math.max(p.w - f.lat1, f.lat0 + p.w);
      if (free < 4) issues.push(`fence at s=${f.s.toFixed(0)} leaves no way past (${free.toFixed(1)} m)`);
      for (const g of T.gates) if (Math.abs(g.s - f.s) < 8) issues.push(`fence at s=${f.s.toFixed(0)} is on top of gate ${g.n}`);
    }
  }
  const gs = T.gates;
  for (const g of gs) {
    const p = S[Math.round(g.s)];
    if (Math.abs(g.lat) + g.hw > p.w + 1.6) issues.push(`gate ${g.n} sticks out of the piste`);
    if (g.s < T.sGate + 20 || g.s > T.sFinish - 12) issues.push(`gate ${g.n} too close to start / finish`);
    if (p.dropL || p.dropR) issues.push(`gate ${g.n} on a cliff edge`);
  }
  for (let k = 1; k < gs.length; k++) {
    if (gs[k].s - gs[k - 1].s < 13) issues.push(`gates ${gs[k - 1].n} and ${gs[k].n} only ${(gs[k].s - gs[k - 1].s).toFixed(0)} m apart`);
  }
  if (T.def.mode !== "free" && gs.length < 6) issues.push(`only ${gs.length} gates`);
  if (T.checkpoints.length < 3) issues.push(`only ${T.checkpoints.length} checkpoints`);
  for (let k = 1; k < T.checkpoints.length; k++) if (T.checkpoints[k].s <= T.checkpoints[k - 1].s) issues.push("checkpoints out of order");
  return issues;
}
