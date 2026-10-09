/**
 * Stunt Racer 3D — turns a level's piece list into a sampled stunt track.
 *
 * A level is ONE linear route built by a turtle from pieces:
 *
 *   S     straight               len, rise? (smooth height change), bank?
 *   C     constant-radius curve  len, ang (deg, + = left), rise?, bank? (auto)
 *   ramp  launch ramp            len, rise (quadratic: steepest at the lip),
 *                                ang? (curved ramp), minKmh? (sign + validation)
 *   gap   open air (no road)     len, drop? (landing lower than the lip),
 *                                ang? (turning gap), shift? (sideways transfer)
 *   land  landing pad            len, drop? (starts steep, eases flat)
 *   loop  360° loop              R, side? (±1: which way the exit is offset)
 *
 * Any piece can also carry: w (road width), rails (true|false|"L"|"R"),
 * tunnel, fall (crumbling tiles), cp (checkpoint at its start), finish (the
 * finish gate at its start), x (items: [kind, at, ...] with `at` in metres
 * from the piece start — negative counts from its end).
 *
 * Every 1 m sample stores the centre point and an orthonormal frame:
 *   T  tangent (direction of travel)
 *   U  road normal (up for the driving surface — towards the centre in a loop)
 *   N  left = U × T
 * plus width, rails, kind ("start" | "road" | "ramp" | "gap" | "land" |
 * "loop" | "finish"), horizontal / vertical curvature (kh: + = turning left,
 * kv: + = surface curving towards U). The car drives in this frame
 * (engine/car.js), which is what makes loops, banks and ramps reliable.
 */
import { clamp, smoothstep } from "./util.js";

export const DEFAULT_WIDTH = 12;
export const RAIL_H = 1.1;
export const G = 16; // arcade gravity, m/s²
/** Grip margin that keeps a car glued to a loop slightly below the textbook speed. */
export const LOOP_ASSIST = 0.3;
/** Rolling resistance + air drag while coasting: a = −(C0 + C2·v²). */
export const COAST_C0 = 1.1;
export const COAST_C2 = 0.0032;

const DEG = Math.PI / 180;

function samplePiece(pc, st, out, level) {
  const t = pc.t;
  const w = pc.w ?? level.width ?? DEFAULT_WIDTH;
  // crumbling tiles never carry rails (nothing would hold them up)
  const railsDef = pc.fall ? false : pc.rails ?? level.rails ?? true;
  const railL = railsDef === true || railsDef === "L";
  const railR = railsDef === true || railsDef === "R";
  const base = { w, railL, railR, piece: st.pieceIndex, tunnel: !!pc.tunnel, fall: !!pc.fall };

  if (t === "loop") {
    const R = pc.R ?? 10;
    const side = pc.side ?? 1;
    const off = pc.off ?? w * 1.25 + 1;
    const n = Math.max(24, Math.round(2 * Math.PI * R));
    const fx = Math.sin(st.h);
    const fz = Math.cos(st.h);
    const lx = Math.cos(st.h);
    const lz = -Math.sin(st.h);
    const x0 = st.x;
    const y0 = st.y;
    const z0 = st.z;
    for (let k = 0; k < n; k++) {
      const th = (2 * Math.PI * k) / n;
      const drift = side * off * ((th - Math.sin(th)) / (2 * Math.PI));
      const x = x0 + fx * R * Math.sin(th) + lx * drift;
      const z = z0 + fz * R * Math.sin(th) + lz * drift;
      const y = y0 + R * (1 - Math.cos(th));
      // centre of the circle at this point (moves sideways with the drift)
      const cx = x0 + lx * drift;
      const cz = z0 + lz * drift;
      const cy = y0 + R;
      out.push({ ...base, x, y, z, upHint: { x: cx - x, y: cy - y, z: cz - z }, kind: "loop", railL: true, railR: true, loopR: R });
    }
    st.x = x0 + lx * side * off;
    st.z = z0 + lz * side * off;
    return;
  }

  const len = Math.max(1, Math.round(pc.len ?? 20));
  const ang = (pc.ang ?? 0) * DEG;
  const rise = pc.rise ?? 0;
  const drop = pc.drop ?? 0;
  const shift = pc.shift ?? 0;
  let bank = 0;
  if (t === "C") bank = pc.bank != null ? pc.bank * DEG : Math.sign(ang) * Math.min(12 * DEG, (Math.abs(ang) / len) * 420 * DEG);
  else if (pc.bank != null) bank = pc.bank * DEG;
  const y0 = st.y;
  const h0 = st.h;
  // lateral axis at the piece start (for a sideways transfer)
  const lx0 = Math.cos(h0);
  const lz0 = -Math.sin(h0);
  let kind = t === "ramp" ? "ramp" : t === "gap" ? "gap" : t === "land" ? "land" : "road";
  if (pc.start) kind = "start";
  let px = st.x;
  let pz = st.z;
  let shPrev = 0;
  for (let k = 0; k < len; k++) {
    const u = k / len;
    let y = y0;
    if (t === "ramp") y = y0 + rise * u * u;
    else if (t === "gap") y = y0 - drop * u; // centreline only (no road here)
    else if (t === "land") y = y0 - drop * (1 - (1 - u) * (1 - u));
    else y = y0 + rise * (1 - Math.cos(Math.PI * u)) * 0.5;
    const bk = bank * Math.min(1, smoothstep(0, 0.3, u) * smoothstep(1, 0.7, u) * 1.0);
    out.push({ ...base, x: px, y, z: pz, h: st.h, bank: bk, kind, upHint: null });
    // advance one metre
    const hMid = h0 + ang * ((k + 0.5) / len);
    px += Math.sin(hMid);
    pz += Math.cos(hMid);
    if (shift) {
      const sh = shift * smoothstep(0, 1, (k + 1) / len);
      px += lx0 * (sh - shPrev);
      pz += lz0 * (sh - shPrev);
      shPrev = sh;
    }
    st.h = h0 + ang * ((k + 1) / len);
  }
  st.x = px;
  st.z = pz;
  if (t === "ramp") st.y = y0 + rise;
  else if (t === "gap") st.y = y0 - drop;
  else if (t === "land") st.y = y0 - drop;
  else st.y = y0 + rise;
}

/** Linear-interpolated frame on a sample array. */
function frameAt(S, s) {
  const n = S.length;
  const sc = clamp(s, 0, n - 1.0001);
  const i = Math.floor(sc);
  const f = sc - i;
  let a = S[i];
  let b = S[Math.min(n - 1, i + 1)];
  // the metre between road and open air uses the road's own frame, so a
  // lip launches at exactly the ramp's angle and a pad starts at its slope
  if (b.kind === "gap" && a.kind !== "gap") b = { ...a, x: a.x + a.tx, y: a.y + a.ty, z: a.z + a.tz };
  else if (a.kind === "gap" && b.kind !== "gap") a = { ...b, x: b.x - b.tx, y: b.y - b.ty, z: b.z - b.tz, kind: "gap", road: false };
  const L = (p, q) => p + (q - p) * f;
  let tx = L(a.tx, b.tx);
  let ty = L(a.ty, b.ty);
  let tz = L(a.tz, b.tz);
  let ux = L(a.ux, b.ux);
  let uy = L(a.uy, b.uy);
  let uz = L(a.uz, b.uz);
  let l = Math.hypot(tx, ty, tz) || 1;
  tx /= l;
  ty /= l;
  tz /= l;
  // re-orthogonalise U against T
  const d = ux * tx + uy * ty + uz * tz;
  ux -= d * tx;
  uy -= d * ty;
  uz -= d * tz;
  l = Math.hypot(ux, uy, uz) || 1;
  ux /= l;
  uy /= l;
  uz /= l;
  return {
    i,
    f,
    x: L(a.x, b.x),
    y: L(a.y, b.y),
    z: L(a.z, b.z),
    tx,
    ty,
    tz,
    ux,
    uy,
    uz,
    nx: uy * tz - uz * ty,
    ny: uz * tx - ux * tz,
    nz: ux * ty - uy * tx,
    w: L(a.w, b.w),
    kh: L(a.kh, b.kh),
    kv: L(a.kv, b.kv),
    a,
    b,
  };
}

/** Builds the immutable track for a level definition. */
export function buildTrack(level) {
  const S = [];
  const st = { x: 0, y: level.y0 ?? 60, z: 0, h: level.h0 ?? 0, pieceIndex: 0 };
  const pieceStart = [];
  level.pieces.forEach((pc, idx) => {
    st.pieceIndex = idx;
    pieceStart.push(S.length);
    samplePiece(pc, st, S, level);
  });
  pieceStart.push(S.length);
  // final sample closes the last piece
  const last = S[S.length - 1];
  S.push({ ...last, x: st.x, y: st.y, z: st.z, upHint: last.upHint });
  const n = S.length;

  // --- frames -------------------------------------------------------------------
  // one-sided differences where the road meets open air, so a ramp keeps
  // its own launch angle right up to the lip (and a landing pad its slope)
  const isGap = (k) => S[k] && S[k].kind === "gap";
  const nb = (i) => {
    let a = Math.max(0, i - 1);
    let b = Math.min(n - 1, i + 1);
    if (!isGap(i) && isGap(b)) b = i;
    if (!isGap(i) && isGap(a)) a = i;
    if (a === b) b = Math.min(n - 1, a + 1);
    return [a, b];
  };
  for (let i = 0; i < n; i++) {
    const [ia, ib] = nb(i);
    const p = S[ia];
    const q = S[ib];
    let tx = q.x - p.x;
    let ty = q.y - p.y;
    let tz = q.z - p.z;
    let l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    let hx = 0;
    let hy = 1;
    let hz = 0;
    if (S[i].upHint) {
      hx = S[i].upHint.x;
      hy = S[i].upHint.y;
      hz = S[i].upHint.z;
    }
    const d = hx * tx + hy * ty + hz * tz;
    let ux = hx - d * tx;
    let uy = hy - d * ty;
    let uz = hz - d * tz;
    l = Math.hypot(ux, uy, uz) || 1;
    ux /= l;
    uy /= l;
    uz /= l;
    let nx = uy * tz - uz * ty;
    let ny = uz * tx - ux * tz;
    let nz = ux * ty - uy * tx;
    const b = S[i].bank || 0;
    if (b) {
      const c = Math.cos(b);
      const s = Math.sin(b);
      const ux2 = ux * c + nx * s;
      const uy2 = uy * c + ny * s;
      const uz2 = uz * c + nz * s;
      nx = nx * c - ux * s;
      ny = ny * c - uy * s;
      nz = nz * c - uz * s;
      ux = ux2;
      uy = uy2;
      uz = uz2;
    }
    Object.assign(S[i], { i, s: i, tx, ty, tz, ux, uy, uz, nx, ny, nz });
  }
  // width smoothing over road samples (bridges narrow gradually)
  const w0 = S.map((p) => p.w);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let c = 0;
    for (let k = -6; k <= 6; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      if ((S[j].kind === "loop") !== (S[i].kind === "loop")) continue;
      sum += w0[j];
      c++;
    }
    S[i].w = sum / c;
  }
  // curvature
  for (let i = 0; i < n; i++) {
    const [ia, ib] = nb(i);
    const p = S[ia];
    const q = S[ib];
    const ds = Math.max(1, ib - ia);
    const dx = (q.tx - p.tx) / ds;
    const dy = (q.ty - p.ty) / ds;
    const dz = (q.tz - p.tz) / ds;
    const P = S[i];
    P.kh = dx * P.nx + dy * P.ny + dz * P.nz;
    P.kv = dx * P.ux + dy * P.uy + dz * P.uz;
    P.road = P.kind !== "gap";
  }

  const T = {
    level,
    samples: S,
    N: n,
    L: n - 1,
    pieceStart,
    frameAt: (s) => frameAt(S, s),
    pointAt(s, lat = 0, h = 0) {
      const f = frameAt(S, s);
      return { x: f.x + f.nx * lat + f.ux * h, y: f.y + f.ny * lat + f.uy * h, z: f.z + f.nz * lat + f.uz * h };
    },
  };
  collectFeatures(T);
  return T;
}

// --- features ---------------------------------------------------------------------
function resolveAt(T, idx, at) {
  const a = T.pieceStart[idx];
  const b = T.pieceStart[idx + 1];
  const s = at < 0 ? b + at : a + at;
  return clamp(s, a, b);
}

function collectFeatures(T) {
  const { level, samples: S } = T;
  const F = {
    start: 10,
    checkpoints: [],
    finish: null,
    ramps: [],
    loops: [],
    gaps: [],
    boosts: [],
    nitros: [],
    stars: [],
    obstacles: [],
    signs: [],
    falls: [],
    tunnels: [],
  };
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of S) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  level.pieces.forEach((pc, idx) => {
    const a = T.pieceStart[idx];
    const b = T.pieceStart[idx + 1];
    if (pc.start) F.start = a + 9;
    if (pc.cp) F.checkpoints.push({ s: a + (typeof pc.cp === "number" ? pc.cp : 4) });
    if (pc.finish) F.finish = a + (typeof pc.finish === "number" ? pc.finish : 6);
    if (pc.t === "ramp") F.ramps.push({ s0: a, lip: b, minKmh: pc.minKmh ?? null, piece: idx, rise: pc.rise });
    if (pc.t === "gap") F.gaps.push({ s0: a, s1: b, piece: idx });
    if (pc.t === "loop") {
      const R = pc.R ?? 10;
      const vMin = loopMinSpeed(S, a, b) * 1.04; // small safety margin
      F.loops.push({ s0: a, s1: b, R, side: pc.side ?? 1, vMin, minKmh: Math.ceil((vMin * 3.6) / 5) * 5, piece: idx });
    }
    if (pc.fall) {
      const tiles = [];
      for (let s = a; s < b - 1; s += 6) tiles.push({ s0: s, s1: Math.min(b, s + 6) });
      F.falls.push({ s0: a, s1: b, tiles });
    }
    if (pc.tunnel) F.tunnels.push({ s0: a, s1: b });
    for (const it of pc.x || []) {
      const [kind, at] = it;
      const s = resolveAt(T, idx, at);
      if (kind === "star") F.stars.push({ s, lat: it[2] ?? 0, h: it[3] ?? 1.1 });
      else if (kind === "air") F.stars.push({ s, lat: it[2] ?? 0, h: null, air: true, vd: it[3] ?? null });
      else if (kind === "nitro") F.nitros.push({ s, lat: it[2] ?? 0 });
      else if (kind === "boost") F.boosts.push({ s, lat: it[2] ?? 0, len: 7, w: it[3] ?? 4.5 });
      else if (kind === "cp") F.checkpoints.push({ s });
      else if (kind === "sign") F.signs.push({ s, text: it[2], side: it[3] ?? 1 });
      else if (kind === "ob") F.obstacles.push({ s, ...it[2] });
    }
  });
  F.checkpoints.sort((p, q) => p.s - q.s);
  if (F.finish == null) F.finish = T.L - 40;
  // auto signs: minimum speed before loops and long jumps
  for (const lp of F.loops) F.signs.push({ s: Math.max(0, lp.s0 - 70), text: `LOOP · ${lp.minKmh} KM/H`, side: 1, auto: true, kind: "loop" });
  for (const r of F.ramps) if (r.minKmh) F.signs.push({ s: Math.max(0, r.s0 - 60), text: `JUMP · ${r.minKmh} KM/H`, side: -1, auto: true, kind: "jump" });
  // air stars sit on the arc a car takes from the ramp before their gap
  for (const st of F.stars) {
    if (!st.air) continue;
    const ramp = [...F.ramps].reverse().find((r) => r.lip <= st.s + 0.5);
    if (!ramp) {
      st.h = 1.2;
      st.air = false;
      continue;
    }
    st.ramp = ramp;
    const lip = S[Math.min(T.N - 1, ramp.lip)];
    const fr = frameAt(S, ramp.lip - 0.5);
    const vd = st.vd ?? ramp.vd ?? 39; // lip speed of a full-throttle approach
    const vx = vd * Math.hypot(fr.tx, fr.tz);
    const vy = vd * fr.ty;
    const p = T.pointAt(st.s, st.lat, 0);
    const dh = Math.hypot(p.x - lip.x, p.z - lip.z);
    const t = dh / Math.max(1, vx);
    const yArc = lip.y + vy * t - 0.5 * G * t * t + 0.75;
    st.h = yArc - p.y;
    st.pos = { x: p.x, y: yArc, z: p.z };
  }
  for (const st of F.stars) if (!st.pos) st.pos = T.pointAt(st.s, st.lat, st.h);
  F.minY = minY;
  F.maxY = maxY;
  Object.assign(T, F);
}

/**
 * Lowest entry speed that coasts all the way round a loop (no throttle):
 * integrates v² along the real samples with gravity and drag, and requires
 * the normal force to stay above the loop grip assist. The sign rounds up.
 */
function loopMinSpeed(S, a, b) {
  const ok = (v0) => {
    let v2 = v0 * v0;
    for (let i = a; i < b; i++) {
      const p = S[i];
      const v = Math.sqrt(Math.max(0, v2));
      v2 += 2 * (-G * p.ty - (COAST_C0 + COAST_C2 * v * v));
      if (v2 <= 0) return false;
      if (v2 * p.kv + G * p.uy < -G * LOOP_ASSIST) return false;
    }
    return true;
  };
  let lo = 5;
  let hi = 80;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (ok(m)) hi = m;
    else lo = m;
  }
  return hi;
}

/**
 * Nearest point on the track to a world position, searched in a window
 * around a hint sample (or everywhere with hint < 0). Returns the
 * interpolated frame plus lat (along N) and h (height above the surface,
 * along U).
 */
export function locate(T, x, y, z, hint = -1, back = 40, ahead = 160) {
  const S = T.samples;
  const lo = hint < 0 ? 0 : Math.max(0, hint - back);
  const hi = hint < 0 ? T.N - 1 : Math.min(T.N - 1, hint + ahead);
  let best = Infinity;
  let bi = lo;
  for (let i = lo; i <= hi; i++) {
    const p = S[i];
    const dx = x - p.x;
    const dy = y - p.y;
    const dz = z - p.z;
    const d = dx * dx + dy * dy * 0.6 + dz * dz;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  const p = S[bi];
  const along = (x - p.x) * p.tx + (y - p.y) * p.ty + (z - p.z) * p.tz;
  const s = clamp(bi + clamp(along, -1, 1), 0, T.L);
  const f = frameAt(S, s);
  const dx = x - f.x;
  const dy = y - f.y;
  const dz = z - f.z;
  return { s, i: Math.floor(s), f, lat: dx * f.nx + dy * f.ny + dz * f.nz, h: dx * f.ux + dy * f.uy + dz * f.uz, d2: best };
}

/** Is there drivable road at (s, lat)? (ignores crumbled tiles — the run checks those). */
export function roadAt(T, s, lat) {
  const S = T.samples;
  const i = clamp(Math.floor(s), 0, T.N - 1);
  const a = S[i];
  const b = S[Math.min(T.N - 1, i + 1)];
  if (!a.road || !b.road) {
    // the last metre of a ramp / road before a gap still holds the car
    if (!(a.road && s - i < 0.999)) return false;
  }
  const hw = a.w * 0.5;
  return Math.abs(lat) <= hw + 0.15;
}
