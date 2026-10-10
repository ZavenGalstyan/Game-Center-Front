/**
 * Dimension Dash — level construction kit.
 *
 * Levels are written as a walk of a cursor (position + heading) through
 * reusable pieces, so every level is connected by construction and the
 * builder can emit a bot route alongside the geometry:
 *
 *   const L = createBuilder(meta);
 *   L.side({...}, (S) => { S.run(30); S.loop(); S.gap(5); ... });   // 2.5D section
 *   L.road(40); L.turn(60, 30, { bank: 12 }); L.rails({...});        // full 3D
 *   L.goal(); return L.done();
 *
 * Side sections become a zone (plane frame + extent). Inside a zone the
 * player is in 2.5D mode; leaving through an open end restores 3D. A glowing
 * "shift gate" tunnel is placed at every open end — the visual signal for
 * the camera / control change.
 *
 * Output is plain data (see done()); world.js turns it into collision
 * geometry and runtime entities, three/ turns it into meshes.
 */
import { createGeom, addRibbon, addSlab, addBox, addDisc, floorBelow } from "./geom.js";

const D2R = Math.PI / 180;
export const fwd = (h) => [Math.sin(h), Math.cos(h)];
export const right = (h) => [-Math.cos(h), Math.sin(h)];
const smooth = (t) => t * t * (3 - 2 * t);

function rng(seed) {
  let s = (seed * 2654435761) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createBuilder(meta) {
  const D = {
    meta: { ...meta },
    ribbons: [],
    slabs: [],
    boxes: [],
    discs: [],
    zones: [],
    rides: [],
    rails: [],
    rings: [],
    monitors: [],
    springs: [],
    boosts: [],
    dashRings: [],
    checkpoints: [],
    redStars: [],
    goal: null,
    spikes: [],
    enemies: [],
    tunnels: [],
    deco: [],
    route: [],
    switches: [],
    gates: [],
    lasers: [],
    boss: null,
    spawn: null,
    killY: -40,
  };
  const C = { x: 0, y: 0, z: 0, h: 0 };
  const R = rng(meta.id * 7 + 3);
  let rib = null; // open road ribbon
  let routeStep = 0;
  const pend = []; // placements resolved in done()

  /* ------------------------------------------------------------ helpers */
  const toWorld = (f, r, up = 0, base = C) => {
    const [fx, fz] = fwd(base.h);
    const [rx, rz] = right(base.h);
    return [base.x + fx * f + rx * r, base.y + up, base.z + fz * f + rz * r];
  };
  function route(x, y, z, mode, extra) {
    D.route.push({ x, y, z, mode, ...extra });
  }
  function routeAct(act, extra = {}) {
    const last = D.route[D.route.length - 1];
    D.route.push({ ...last, act, ...extra });
  }

  /* ------------------------------------------------------------ 3D roads */
  function openRibbon(opts = {}) {
    if (!rib) {
      rib = { pts: [], guard: !!opts.guard, surf: opts.surf || D.meta.theme, thick: opts.thick || 1.4, style: opts.style || "road" };
      D.ribbons.push(rib);
    }
    return rib;
  }
  function closeRibbon() {
    if (rib && rib.pts.length < 2) D.ribbons.splice(D.ribbons.indexOf(rib), 1);
    rib = null;
  }
  function addRoadPt(x, y, z, h, hw, bankTan) {
    const r = openRibbon();
    const [rx, rz] = right(h);
    const last = r.pts[r.pts.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 0.05 && Math.abs(last.y - y) < 0.05) {
      last.hw = hw;
      last.bank = bankTan;
      return;
    }
    r.pts.push({ x, y, z, rx, rz, hw, bank: bankTan, h, nx: 0, ny: 1, nz: 0 });
  }
  // decorative islets / pylons floating beside 3D roads (visual only)
  let isleStep = 6;
  function isleTick(dist, hw) {
    if (D.meta.islets === false) return;
    isleStep -= dist;
    if (isleStep > 0) return;
    isleStep = 11 + R() * 9;
    const side = R() < 0.5 ? -1 : 1;
    const lat = side * (hw + 5 + R() * 9);
    const [x, y, z] = toWorld(0, lat, -(3 + R() * 7));
    D.deco.push({ t: "islet", x, y, z, s: 0.8 + R() * 0.8, r: R() * 6.28, seed: R() });
  }
  function routeTick(mode, dist) {
    routeStep += dist;
    if (routeStep >= 2) {
      routeStep = 0;
      route(C.x, C.y, C.z, mode);
    }
  }

  /** straight road; dh eased (or linear with `ramp`) */
  function road(len, o = {}) {
    const w0 = o.w0 ?? (rib && rib.pts.length ? rib.pts[rib.pts.length - 1].hw * 2 : o.w ?? 10);
    const w1 = o.w ?? w0;
    const dh = o.dh || 0;
    if (o.guard) openRibbon().guard = true;
    if (o.style) openRibbon().style = o.style;
    const n = Math.max(2, Math.ceil(len));
    const y0 = C.y;
    const x0 = C.x;
    const z0 = C.z;
    const [fx, fz] = fwd(C.h);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const k = o.ramp ? t * t * 0.15 + t * 0.85 : smooth(t);
      const x = x0 + fx * len * t;
      const z = z0 + fz * len * t;
      const y = y0 + dh * (o.ramp ? Math.min(1, k) : k);
      if (i > 0) {
        C.x = x;
        C.y = y;
        C.z = z;
        routeTick("free", len / n);
        isleTick(len / n, (w0 + (w1 - w0) * t) / 2);
      }
      addRoadPt(x, y, z, C.h, (w0 + (w1 - w0) * t) / 2, 0);
    }
    return L;
  }

  /** constant-radius turn; deg > 0 turns right */
  function turn(deg, radius, o = {}) {
    const hw = (o.w ?? (rib && rib.pts.length ? rib.pts[rib.pts.length - 1].hw * 2 : 10)) / 2;
    const dir = deg > 0 ? 1 : -1; // 1 = right
    const total = Math.abs(deg) * D2R;
    const arc = total * radius;
    const n = Math.max(4, Math.ceil(arc));
    const [rx, rz] = right(C.h);
    const cx = C.x + rx * radius * dir;
    const cz = C.z + rz * radius * dir;
    const h0 = C.h;
    const y0 = C.y;
    const dh = o.dh || 0;
    const bank = Math.tan((o.bank || 0) * D2R) * (dir > 0 ? -1 : 1);
    if (o.guard) openRibbon().guard = true;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const h = h0 - dir * total * t;
      // the cursor sits at centre - right(h)*radius*dir
      const [hx, hz] = right(h);
      C.x = cx - hx * radius * dir;
      C.z = cz - hz * radius * dir;
      C.y = y0 + dh * smooth(t);
      C.h = h;
      // bank eases in / out over the first / last 25%
      const be = Math.min(1, Math.min(t, 1 - t) / 0.25);
      addRoadPt(C.x, C.y, C.z, C.h, hw, bank * smooth(be));
      routeTick("free", arc / n);
      isleTick(arc / n, hw);
    }
    return L;
  }

  /** gap in the road: cursor jumps forward (and dh), ribbon breaks */
  function gap(len, dh = 0, o = {}) {
    closeRibbon();
    if (o.jump !== false) {
      // jump just before the edge
      const [fx, fz] = fwd(C.h);
      route(C.x - fx * (o.early ?? 1.2), C.y, C.z - fz * (o.early ?? 1.2), "free", { act: "jump", hold: o.hold ?? 0.3 });
    }
    const [fx, fz] = fwd(C.h);
    C.x += fx * len;
    C.z += fz * len;
    C.y += dh;
    route(C.x, C.y, C.z, "free", { air: true });
    return L;
  }

  /** a launch ramp (linear rise) — follow with gap() */
  function ramp(len, rise, o = {}) {
    road(len, { ...o, dh: rise, ramp: true });
    return L;
  }

  /** open plaza: a wide box top, cursor goes to its far edge */
  function plaza(o = {}) {
    closeRibbon();
    const w = o.w || 40;
    const l = o.l || 40;
    const [fx, fz] = fwd(C.h);
    const cx = C.x + fx * l * 0.5;
    const cz = C.z + fz * l * 0.5;
    if (o.disc) D.discs.push({ x: cx, y: C.y, z: cz, r: Math.max(w, l) / 2, solid: true, y0: C.y - (o.depth || 4), style: o.style || "plaza" });
    else D.boxes.push({ x: cx, y: C.y - (o.depth || 4) / 2, z: cz, hx: w / 2, hy: (o.depth || 4) / 2, hz: l / 2, yaw: C.h, solid: true, style: o.style || "plaza" });
    const base = { ...C };
    const P = {
      base,
      at: (f, r, up = 0) => toWorld(f, r, up, base),
    };
    if (o.fill) o.fill(P);
    // route across the middle
    for (let f = 2; f <= l; f += 2) {
      const [x, y, z] = toWorld(f, 0, 0, base);
      route(x, y, z, "free");
    }
    C.x += fx * l;
    C.z += fz * l;
    return P;
  }

  /** place relative to the cursor (3D): f forward, r right, up above ground (snapped) */
  function at(f, r = 0, up = 0) {
    return toWorld(f, r, up);
  }
  function pendGround(obj, x, y, z, up, list) {
    obj.x = x;
    obj.y = NaN;
    obj.z = z;
    obj._hint = y + 4;
    obj._up = up;
    list.push(obj);
    pend.push(obj);
    return obj;
  }

  /* ------------------------------------------------------------ 3D pieces */
  function loop3d(r = 6, o = {}) {
    // flat run-up and run-out under the loop
    road(r + 6, { w: o.w ?? 9 });
    const entry = { ...C };
    makeLoopRide(entry, r, o.bulge ?? 3.2, "free", o);
    road(r + 8);
    return L;
  }
  function makeLoopRide(base, r, bulge, mode, o = {}) {
    const [fx, fz] = fwd(base.h);
    const [rx, rz] = right(base.h);
    const pts = [];
    const ups = [];
    const N = 96;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const th = -Math.PI / 2 + t * Math.PI * 2;
      const a = r * Math.cos(th);
      const b = r + r * Math.sin(th);
      const lat = bulge * Math.sin(Math.PI * t);
      pts.push([base.x + fx * a + rx * lat, base.y + b, base.z + fz * a + rz * lat]);
      const ua = -Math.cos(th);
      const ub = -Math.sin(th);
      ups.push([fx * ua, ub, fz * ua]);
    }
    D.rides.push({ kind: "loop", pts, ups, entry: { x: base.x, y: base.y, z: base.z, dx: fx, dz: fz }, hw: o.hw ?? 1.8, mode, min: 0 });
    if (o.rings !== false) {
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        const th = -Math.PI / 2 + t * Math.PI * 2;
        const a = r * Math.cos(th) * 0.78;
        const b = r + r * Math.sin(th) * 0.78;
        const lat = bulge * Math.sin(Math.PI * t);
        D.rings.push([base.x + fx * a + rx * lat, base.y + b, base.z + fz * a + rz * lat]);
      }
    }
  }

  /**
   * half loop (Immelmann): up and over a half loop, then a half roll so you
   * come out upright on an upper road heading BACK the way you came. The
   * lower road ends in a wall just past the entry; the cursor continues on
   * the upper road (heading reversed) — follow it with a U-turn.
   */
  function halfLoop(r = 6, o = {}) {
    const lead = o.lead ?? 14;
    road(4, { w: o.w ?? 9 });
    D.boosts.push({ ...toWorldObj(2, 0, 0.02), h: C.h, speed: o.boost ?? 36, w: 3.4, l: 3 });
    road(lead - 4);
    const base = { ...C };
    const [fx, fz] = fwd(base.h);
    const [rx, rz] = right(base.h);
    const rt = o.roll ?? 1.6;
    const rollLen = o.rollLen ?? 12;
    const pts = [];
    const ups = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const th = -Math.PI / 2 + (i / N) * Math.PI;
      const a = r * Math.cos(th);
      const b = r + r * Math.sin(th);
      pts.push([base.x + fx * a, base.y + b, base.z + fz * a]);
      ups.push([fx * -Math.cos(th), -Math.sin(th), fz * -Math.cos(th)]);
    }
    // half roll heading backwards (-F): up turns from down to up around the travel axis
    const M = 30;
    for (let i = 1; i <= M; i++) {
      const t = i / M;
      const ph = Math.PI + Math.PI * smooth(t);
      const back = rollLen * t;
      const lat = -Math.sin(ph) * rt;
      const vert = 2 * r - rt - Math.cos(ph) * rt;
      pts.push([base.x - fx * back + rx * lat, base.y + vert, base.z - fz * back + rz * lat]);
      ups.push([rx * Math.sin(ph), Math.cos(ph), rz * Math.sin(ph)]);
    }
    D.rides.push({ kind: "half", pts, ups, entry: { x: base.x, y: base.y, z: base.z, dx: fx, dz: fz }, hw: 2.4, mode: "free", min: 0, radius: r });
    if (o.rings !== false) for (let i = 1; i < 6; i++) {
      const th = -Math.PI / 2 + (i / 6) * Math.PI;
      D.rings.push([base.x + fx * r * 0.75 * Math.cos(th), base.y + r + r * 0.75 * Math.sin(th), base.z + fz * r * 0.75 * Math.cos(th)]);
    }
    // the lower road runs a little past the entry and ends in a wall (no route nodes there)
    const rl = D.route.length;
    road(r + 3);
    D.route.length = rl;
    D.boxes.push({ ...toWorldObj(1, 0, 0), y: C.y + 1.5, hx: (o.w ?? 9) / 2 + 0.5, hy: 2.2, hz: 0.6, yaw: C.h, solid: true, style: "block" });
    closeRibbon();
    // bot: run the loop (the ride carries it), then continue from the upper road
    C.x = base.x - fx * rollLen;
    C.z = base.z - fz * rollLen;
    C.y = base.y + 2 * r - 2 * rt;
    C.h = base.h + Math.PI;
    route(C.x, C.y, C.z, "free", { air: true });
    return L;
  }
  function toWorldObj(f, r, up) {
    const [x, y, z] = toWorld(f, r, up);
    return { x, y, z };
  }

  /** corkscrew: a full twist around the forward axis over `len` */
  function corkscrew(len = 36, r = 4, o = {}) {
    road(4, { w: o.w ?? 8 });
    const base = { ...C };
    const [fx, fz] = fwd(base.h);
    const [rx, rz] = right(base.h);
    const pts = [];
    const ups = [];
    const N = 120;
    const dir = o.left ? -1 : 1;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = smooth(t) * Math.PI * 2;
      const lat = dir * r * Math.sin(a);
      const up = r * (1 - Math.cos(a));
      const f = len * t;
      pts.push([base.x + fx * f + rx * lat, base.y + up, base.z + fz * f + rz * lat]);
      // up = toward the screw axis
      const ul = -dir * Math.sin(a);
      const uu = Math.cos(a);
      ups.push([rx * ul, uu, rz * ul]);
    }
    D.rides.push({ kind: "corkscrew", pts, ups, entry: { x: base.x, y: base.y, z: base.z, dx: fx, dz: fz }, hw: 2.2, mode: "free", min: 0 });
    // the road itself continues underneath as the exit
    closeRibbon();
    C.x += fx * len;
    C.z += fz * len;
    route(C.x, C.y, C.z, "free", { air: true });
    road(10, { w: o.w ?? 10 });
    return L;
  }

  /**
   * grind rails over a void: rails start `lead` ahead at `start` height over
   * the cursor, run `len` with dh / curve; cursor lands after them.
   */
  function rails(o = {}) {
    const len = o.len || 40;
    const count = o.count || 1;
    const spacing = o.spacing || 3.4;
    const lead = o.lead ?? 3;
    const start = o.start ?? 1.6; // rail height above the road at its start
    const dh = o.dh || 0;
    const curve = (o.curve || 0) * D2R; // total heading change
    // run-up road to the rail start
    road(lead + 2);
    closeRibbon();
    const h0 = C.h;
    const base = { ...C };
    const lines = [];
    for (let k = 0; k < count; k++) lines.push([]);
    const N = Math.ceil(len / 1.5);
    let hx = base.x;
    let hz = base.z;
    let h = h0;
    const step = len / N;
    // centre line walked with gradual heading change, rails offset sideways
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = base.y + start + dh * smooth(t) + (o.wave ? Math.sin(t * Math.PI * 2) * o.wave : 0);
      const [rx, rz] = right(h);
      for (let k = 0; k < count; k++) {
        const off = (k - (count - 1) / 2) * spacing + (o.offset || 0);
        lines[k].push([hx + rx * off, y, hz + rz * off]);
      }
      if (i < N) {
        h = h0 - curve * smooth((i + 1) / N);
        const [fx, fz] = fwd(h);
        hx += fx * step;
        hz += fz * step;
      }
      if (i % 2 === 0) route(hx, y, hz, "rail");
    }
    // high rail starts need a hop; low ones (ramp launches) catch you by themselves
    const r0 = D.route.length - Math.ceil((N + 1) / 2);
    if (start > 0.9 && D.route[r0 - 1]) D.route[r0 - 1].act = "jump";
    for (const pts of lines) D.rails.push({ pts, ringed: o.rings !== false });
    if (o.rings !== false) {
      const ln = lines[Math.floor(count / 2)];
      for (let i = 4; i < ln.length - 2; i += 3) D.rings.push([ln[i][0], ln[i][1] + 1.1, ln[i][2]]);
    }
    C.x = hx;
    C.z = hz;
    C.h = h;
    C.y = base.y + start + dh - (o.drop ?? 1.6);
    route(C.x, C.y, C.z, "free", { air: true });
    return { lines, end: { ...C } };
  }

  /** visual tunnel arches over the next road; speed tunnels add boost strips */
  function tunnel(len, o = {}) {
    D.tunnels.push({ x: C.x, y: C.y, z: C.z, h: C.h, len, kind: o.kind || "speed", w: o.w || 9 });
    if (o.kind !== "shift" && o.boost !== false) {
      const [fx, fz] = fwd(C.h);
      for (let f = 4; f < len - 2; f += 12) {
        D.boosts.push({ x: C.x + fx * f, y: C.y + 0.02, z: C.z + fz * f, h: C.h, speed: o.speed || 36, w: 3.4, l: 3 });
      }
    }
    road(len, { w: o.w || 9, guard: true });
    return L;
  }

  /* ------------------------------------------------------------ 2.5D sections */
  function side(o, fn) {
    closeRibbon();
    const base = { ...C };
    const [fx, fz] = fwd(base.h);
    const [nx, nz] = right(base.h);
    const Z = {
      ox: base.x,
      oy: base.y,
      oz: base.z,
      fx,
      fz,
      nx,
      nz,
      h: base.h,
      s0: 0,
      s1: 0,
      dh: o.depth ?? 3.6,
      openStart: o.openStart ?? D.zones.length > 0,
      openEnd: o.openEnd ?? true,
      cam: { dist: o.camDist ?? 15, height: o.camHeight ?? 2.2 },
      boss: !!o.boss,
      dormant: !!o.dormant,
      idx: D.zones.length,
    };
    D.zones.push(Z);
    const prof = []; // [{s,h}] main ground polyline points, NaN-separated by gaps
    let cur = null; // open slab points
    const S = { s: 0, h: 0, zone: Z };
    const W2 = (s, h, d = 0) => [Z.ox + fx * s + nx * d, Z.oy + h, Z.oz + fz * s + nz * d];
    S.world = W2;
    const routeS = (s, h, extra) => {
      const [x, y, z] = W2(s, h);
      route(x, y, z, "side", { zone: Z.idx, s, ...extra });
    };
    const pushG = (s, h) => {
      if (!cur) {
        cur = [];
        prof.push(cur);
      }
      const l = cur[cur.length - 1];
      if (l && Math.abs(l[0] - s) < 1e-6) {
        l[1] = h;
        return;
      }
      cur.push([s, h]);
    };
    const closeG = () => {
      cur = null;
    };
    /** main ground height at s (NaN in a gap) */
    S.g = (s) => {
      for (const seg of prof) {
        if (s < seg[0][0] - 1e-6 || s > seg[seg.length - 1][0] + 1e-6) continue;
        for (let i = 0; i < seg.length - 1; i++) {
          const a = seg[i];
          const b = seg[i + 1];
          if (s >= a[0] - 1e-6 && s <= b[0] + 1e-6) {
            const t = b[0] > a[0] ? (s - a[0]) / (b[0] - a[0]) : 0;
            return a[1] + (b[1] - a[1]) * t;
          }
        }
        return seg[seg.length - 1][1];
      }
      return NaN;
    };
    S.run = (len, r = {}) => {
      const dh = r.dh || 0;
      const n = Math.max(2, Math.ceil(len / 0.5));
      const s0 = S.s;
      const h0 = S.h;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        let k;
        if (r.shape === "line") k = t;
        else k = smooth(t);
        let h = h0 + dh * k;
        if (r.hill) h += r.hill * Math.sin(Math.PI * t) ** 2;
        if (r.wave) h += r.wave * Math.sin(Math.PI * 2 * t * (r.waves || 1));
        pushG(s0 + len * t, h);
        if (i > 0 && i % 4 === 0) routeS(s0 + len * t, h);
      }
      S.s = s0 + len;
      S.h = h0 + dh;
      return S;
    };
    /** break the ground profile here (a sheer step up / down follows) */
    S.cut = () => {
      closeG();
      return S;
    };
    S.gap = (len, dh = 0, r = {}) => {
      if (r.jump !== false) routeS(S.s - (r.early ?? 1.4), S.h, { act: "jump", hold: r.hold ?? 0.35 });
      closeG();
      S.s += len;
      S.h += dh;
      routeS(S.s + 0.5, S.h, { air: true });
      return S;
    };
    /** classic loop: flat ground with the loop entry in the middle */
    S.loop = (r = 4.6, x = {}) => {
      const lead = x.lead ?? 10;
      if (x.boost !== false) S.boost(lead - 7, x.boostSpeed ?? 34);
      S.run(lead);
      const [ex, ey, ez] = W2(S.s, S.h);
      const pts = [];
      const ups = [];
      const N = 90;
      const bulge = x.bulge ?? -2.6; // away from the camera
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const th = -Math.PI / 2 + t * Math.PI * 2;
        const a = r * Math.cos(th);
        const b = r + r * Math.sin(th);
        const d = bulge * Math.sin(Math.PI * t);
        pts.push(W2(S.s + a, S.h + b, d));
        const ua = -Math.cos(th);
        const ub = -Math.sin(th);
        ups.push([fx * ua, ub, fz * ua]);
      }
      D.rides.push({ kind: "loop", pts, ups, entry: { x: ex, y: ey, z: ez, dx: fx, dz: fz }, hw: Z.dh, mode: "side", zone: Z.idx, min: 0 });
      if (x.rings !== false) {
        for (let i = 1; i < 12; i++) {
          const t = i / 12;
          const th = -Math.PI / 2 + t * Math.PI * 2;
          D.rings.push(W2(S.s + r * 0.74 * Math.cos(th), S.h + r + r * 0.74 * Math.sin(th), bulge * Math.sin(Math.PI * t)));
        }
      }
      S.run(r + (x.tail ?? 8));
      return S;
    };
    /** half loop: carries you up and over onto a ledge running back the other way */
    S.halfLoop = (r = 4.2, x = {}) => {
      S.run(x.lead ?? 6);
      const s0 = S.s;
      const [ex, ey, ez] = W2(s0, S.h);
      const pts = [];
      const ups = [];
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const th = -Math.PI / 2 + (i / N) * Math.PI;
        pts.push(W2(s0 + r * Math.cos(th), S.h + r + r * Math.sin(th), 0));
        ups.push([fx * -Math.cos(th), -Math.sin(th), fz * -Math.cos(th)]);
      }
      D.rides.push({ kind: "half", pts, ups, entry: { x: ex, y: ey, z: ez, dx: fx, dz: fz }, hw: Z.dh, mode: "side", zone: Z.idx, min: 0 });
      // upper ledge running backwards from the top of the half loop
      S.platform(-(x.ledge ?? 14), 2 * r - 0.02, (x.ledge ?? 14), { from: s0 });
      // a wall beyond the half loop so the lower path doesn't continue under it
      return { top: [s0, S.h + 2 * r] };
    };
    /** one-way floating platform: s offset from cursor (or `from`), h above cursor height */
    S.platform = (sOff, hOff, len, x = {}) => {
      const s = (x.from ?? S.s) + sOff;
      const hb = (x.hBase ?? S.h) + hOff;
      if (x.mover || x.crumble) {
        const [cx, cy, cz] = W2(s + len / 2, hb - 0.35);
        const b = { x: cx, y: cy, z: cz, hx: Math.min(Z.dh, 2.2), hy: 0.35, hz: len / 2, yaw: Z.h, solid: false, style: x.crumble ? "crumble" : "mover" };
        if (x.mover) {
          const [ds, dhh] = x.mover.to;
          b.mover = { to: [fx * ds, dhh, fz * ds], period: x.mover.period || 4, phase: x.mover.phase || 0 };
        }
        if (x.crumble) b.crumble = { state: "idle", t: 0, respawn: 4 };
        D.boxes.push(b);
        return b;
      }
      const hs = [];
      const n = Math.max(2, Math.ceil(len / 0.5));
      for (let i = 0; i <= n; i++) hs.push(hb + (x.dh || 0) * (i / n));
      const sl = { ox: Z.ox, oy: Z.oy, oz: Z.oz, fx, fz, nx, nz, s0: s, s1: s + len, ds: len / n, hs, dh: x.depth ?? 2.4, thick: x.thick ?? 0.7, style: x.style || "platform", zone: Z.idx };
      D.slabs.push(sl);
      return sl;
    };
    /** solid block standing on the ground at s offset */
    S.block = (sOff, w, hgt, x = {}) => {
      const s = S.s + sOff;
      const g = x.base ?? (Number.isFinite(S.g(s)) ? S.g(s) : S.h);
      const [cx, cy, cz] = W2(s, g + hgt / 2 - (x.sink ?? 0.4) / 2);
      D.boxes.push({ x: cx, y: cy, z: cz, hx: x.depth ?? Z.dh, hy: hgt / 2 + (x.sink ?? 0.4) / 2, hz: w / 2, yaw: Z.h, solid: true, style: x.style || "block" });
      return S;
    };
    const ground = (list, obj, sOff, up, x = {}) => {
      const s = (x.from ?? S.s) + sOff;
      obj._side = { Z, s, up, abs: x.h, d: x.d || 0, S };
      list.push(obj);
      pend.push(obj);
      return obj;
    };
    S.rings = (sA, sB, n, up = 1, x = {}) => {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const arc = x.arc ? Math.sin(Math.PI * t) * x.arc : 0;
        const o = { ring: true };
        ground(D.rings, o, sA + (sB - sA) * t, up + arc, { ...x, h: x.h != null ? x.h + arc : undefined });
      }
      return S;
    };
    S.enemy = (kind, sOff, x = {}) => ground(D.enemies, { kind, range: x.range ?? 4, ...x.props }, sOff, x.up ?? 0, x);
    S.spring = (sOff, x = {}) => {
      const ang = (x.angle || 0) * D2R; // tilt toward +F
      const v = x.v ?? 24;
      return ground(D.springs, { vf: Math.sin(ang) * v, vy: Math.cos(ang) * v, h: Z.h, angle: ang, lock: x.lock ?? 0.35, power: v }, sOff, 0, x);
    };
    S.boost = (sOff, speed = 34, x = {}) => ground(D.boosts, { h: x.back ? Z.h + Math.PI : Z.h, speed, w: 2.6, l: 2.6 }, sOff, 0.02, x);
    S.spikes = (sOff, n = 3, x = {}) => ground(D.spikes, { h: Z.h, n, w: n * 0.9 }, sOff, 0, x);
    S.monitor = (sOff, kind, x = {}) => ground(D.monitors, { kind }, sOff, x.up ?? 0, x);
    S.redStar = (sOff, x = {}) => ground(D.redStars, {}, sOff, x.up ?? 1.2, x);
    S.checkpoint = (sOff = 0, x = {}) => ground(D.checkpoints, { h: Z.h, mode: "side", zone: Z.idx }, sOff, 0, x);
    S.dashRing = (sOff, up, x = {}) => {
      const ang = (x.angle ?? 45) * D2R;
      const v = x.v ?? 30;
      return ground(D.dashRings, { vf: Math.cos(ang) * v, vy: Math.sin(ang) * v, h: Z.h, lock: 0.4, power: v }, sOff, up, x);
    };
    S.goal = (sOff = 0) => {
      const o = { h: Z.h };
      ground([], o, sOff, 0);
      D.goal = o;
      return S;
    };
    S.act = (sOff, act, extra = {}) => {
      const s = S.s + sOff;
      const g = S.g(s);
      routeS(s, Number.isFinite(g) ? g : S.h, { act, ...extra });
      return S;
    };
    S.deco = (sOff, t, x = {}) => {
      const o = { t, s: x.s || 1, r: x.r || 0, deco: true };
      ground(D.deco, o, sOff, x.up || 0, { ...x, d: x.d ?? -6 });
      return S;
    };

    // let the section author build
    fn(S);
    closeG();

    // slabs from the profile
    for (const seg of prof) {
      if (seg.length < 2) continue;
      const s0 = seg[0][0];
      const s1 = seg[seg.length - 1][0];
      const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
      const hs = [];
      for (let i = 0; i <= n; i++) {
        const s = s0 + ((s1 - s0) * i) / n;
        hs.push(S.g(s));
      }
      D.slabs.push({ ox: Z.ox, oy: Z.oy, oz: Z.oz, fx, fz, nx, nz, s0, s1, ds: (s1 - s0) / n, hs, dh: o.groundDepth ?? 3.8, thick: 40, style: "ground", zone: Z.idx });
    }
    Z.s1 = S.s;
    // vertical extent of the section's ground (zone capture ignores roads passing high above)
    let hMin = Infinity;
    let hMax = -Infinity;
    for (const seg of prof) for (const [, h] of seg) {
      hMin = Math.min(hMin, h);
      hMax = Math.max(hMax, h);
    }
    Z.hMin = Number.isFinite(hMin) ? hMin : 0;
    Z.hMax = Number.isFinite(hMax) ? hMax : 0;
    // shift gates at open ends
    if (Z.openStart && !Z.dormant) D.tunnels.push({ x: Z.ox, y: Z.oy, z: Z.oz, h: Z.h, len: 7, kind: "shift", w: 8, zone: Z.idx, at: "start" });
    if (Z.openEnd && !Z.dormant) {
      const [x, y, z] = W2(S.s - 7, S.h);
      D.tunnels.push({ x, y, z, h: Z.h, len: 7, kind: "shift", w: 8, zone: Z.idx, at: "end" });
    }
    // auto background deco behind the plane
    if (o.deco !== false) {
      for (let s = 4; s < S.s; s += 5 + R() * 6) {
        const g = S.g(s);
        if (!Number.isFinite(g)) continue;
        D.deco.push({ t: "auto", x: NaN, y: NaN, z: NaN, _side: { Z, s, up: 0, d: -(4.6 + R() * 7), S }, s: 0.8 + R() * 0.7, r: R() * 6.28, seed: R() });
        pend.push(D.deco[D.deco.length - 1]);
      }
    }
    // continue the 3D cursor from the section end
    C.x = Z.ox + fx * S.s;
    C.z = Z.oz + fz * S.s;
    C.y = Z.oy + S.h;
    return S;
  }

  /* ------------------------------------------------------------ 3D placements */
  const B = {};
  B.rings = (fA, rA, fB, rB, n, up = 1, x = {}) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const [px, py, pz] = toWorld(fA + (fB - fA) * t, rA + (rB - rA) * t, 0, x.base || C);
      const arc = x.arc ? Math.sin(Math.PI * t) * x.arc : 0;
      if (x.h != null) D.rings.push([px, (x.base || C).y + x.h + arc, pz]);
      else pendGround({ ring: true }, px, py + (x.hint || 0), pz, up + arc, D.rings);
    }
    return L;
  };
  B.ringCircle = (f, r, rad, n, up = 1, x = {}) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const [px, py, pz] = toWorld(f + Math.cos(a) * rad, r + Math.sin(a) * rad, 0, x.base || C);
      pendGround({ ring: true }, px, py, pz, up, D.rings);
    }
    return L;
  };
  B.enemy = (kind, f, r, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    const o = { kind, range: x.range ?? 5, h: (x.base || C).h, ...x.props };
    if (x.h != null) {
      Object.assign(o, { x: px, y: (x.base || C).y + x.h, z: pz });
      D.enemies.push(o);
      return o;
    }
    return pendGround(o, px, py + (x.hint || 0), pz, x.up ?? 0, D.enemies);
  };
  B.spring = (f, r, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    const ang = (x.angle || 0) * D2R;
    const v = x.v ?? 24;
    const h = (x.base || C).h + (x.yaw || 0) * D2R;
    const [fx, fz] = fwd(h);
    const o = { vx: fx * Math.sin(ang) * v, vz: fz * Math.sin(ang) * v, vy: Math.cos(ang) * v, h, angle: ang, lock: x.lock ?? 0.45, power: v };
    if (x.h != null) {
      Object.assign(o, { x: px, y: (x.base || C).y + x.h, z: pz });
      D.springs.push(o);
      return o;
    }
    return pendGround(o, px, py + (x.hint || 0), pz, 0, D.springs);
  };
  B.boost = (f, r = 0, speed = 36, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    return pendGround({ h: (x.base || C).h + (x.yaw || 0) * D2R, speed, w: x.w || 3.4, l: 3 }, px, py, pz, 0.02, D.boosts);
  };
  B.dashRing = (f, r, up, x = {}) => {
    const [px, py, pz] = toWorld(f, r, up, x.base || C);
    const h = (x.base || C).h + (x.yaw || 0) * D2R;
    const ang = (x.angle ?? 30) * D2R;
    const v = x.v ?? 32;
    const [fx, fz] = fwd(h);
    D.dashRings.push({ x: px, y: py, z: pz, h, vx: fx * Math.cos(ang) * v, vz: fz * Math.cos(ang) * v, vy: Math.sin(ang) * v, lock: 0.5, power: v, angle: ang });
    return L;
  };
  B.monitor = (f, r, kind, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    if (x.h != null) {
      D.monitors.push({ kind, x: px, y: (x.base || C).y + x.h, z: pz });
      return L;
    }
    return pendGround({ kind }, px, py + (x.hint || 0), pz, 0, D.monitors);
  };
  B.redStar = (f, r, up = 1.2, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    if (x.h != null) {
      D.redStars.push({ x: px, y: (x.base || C).y + x.h, z: pz });
      return L;
    }
    return pendGround({}, px, py + (x.hint || 0), pz, up, D.redStars);
  };
  B.checkpoint = (f = 0, r = 0, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    return pendGround({ h: (x.base || C).h, mode: "free" }, px, py, pz, 0, D.checkpoints);
  };
  B.spikes = (f, r, n = 3, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    return pendGround({ h: (x.base || C).h + (x.yaw || 0) * D2R, n, w: n * 0.9 }, px, py, pz, 0, D.spikes);
  };
  B.box = (f, r, w, l, hgt, x = {}) => {
    const base = x.base || C;
    const [px, py, pz] = toWorld(f, r, 0, base);
    const yb = base.y + (x.lift || 0);
    const b = { x: px, y: yb + hgt / 2 - 0.2, z: pz, hx: w / 2, hy: hgt / 2 + 0.2, hz: l / 2, yaw: base.h + (x.yaw || 0) * D2R, solid: x.solid ?? true, style: x.style || "block" };
    if (x.mover) {
      const [mf, mr, mu] = x.mover.to;
      const [fx, fz] = fwd(base.h);
      const [rx, rz] = right(base.h);
      b.mover = { to: [fx * mf + rx * mr, mu, fz * mf + rz * mr], period: x.mover.period || 4, phase: x.mover.phase || 0, circle: x.mover.circle };
    }
    if (x.crumble) b.crumble = { state: "idle", t: 0, respawn: 4 };
    D.boxes.push(b);
    return b;
  };
  B.disc = (f, r, rad, lift = 0, x = {}) => {
    const base = x.base || C;
    const [px, , pz] = toWorld(f, r, 0, base);
    const d = { x: px, y: base.y + lift, z: pz, r: rad, solid: x.solid ?? true, y0: base.y + lift - (x.depth ?? 2), style: x.style || "pillar" };
    if (x.mover) {
      const [fx, fz] = fwd(base.h);
      const [rx, rz] = right(base.h);
      const [mf, mr, mu] = x.mover.to || [0, 0, 0];
      d.mover = { to: [fx * mf + rx * mr, mu, fz * mf + rz * mr], period: x.mover.period || 4, phase: x.mover.phase || 0, circle: x.mover.circle };
    }
    D.discs.push(d);
    return d;
  };
  B.deco = (f, r, t, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    return pendGround({ t, s: x.s || 1, r: x.rot ?? R() * 6.28, seed: R(), deco: true }, px, py + (x.hint || 0), pz, x.up || 0, D.deco);
  };
  /** a floor switch (press E) that opens `box` (made with B.box, style "gate") */
  B.switchGate = (f, r, box, x = {}) => {
    const [px, py, pz] = toWorld(f, r, 0, x.base || C);
    box.style = "gate";
    const sw = pendGround({ gate: D.gates.length }, px, py, pz, 0, D.switches);
    D.gates.push({ box: D.boxes.indexOf(box) });
    return sw;
  };
  B.laser = (f, r, x = {}) => {
    const base = x.base || C;
    const [px, py, pz] = toWorld(f, r, 0, base);
    D.lasers.push({ x: px, y: py, z: pz, h: base.h + (x.yaw || 0) * D2R, w: x.w || 8, on: x.on ?? 1.6, off: x.off ?? 1.4, phase: x.phase || 0, hgt: x.hgt ?? 0.6 });
    return L;
  };
  B.act = (act, extra = {}) => {
    route(C.x, C.y, C.z, "free", { act, ...extra });
    return L;
  };
  /** explicit bot route node relative to the cursor */
  B.node = (f, r, up, extra = {}) => {
    const [x, y, z] = toWorld(f, r, up);
    route(x, y, z, "free", extra);
    return L;
  };

  /* ------------------------------------------------------------ level meta */
  function spawn(o = {}) {
    D.spawn = { x: C.x, y: C.y, z: C.z, h: C.h, mode: o.side ? "side" : "free", zone: o.side ? o.zone ?? D.zones.length : null, ...o };
    return L;
  }
  function goal(f = 6) {
    road(f + 8);
    const [x, y, z] = toWorld(-8, 0, 0);
    D.goal = { x, y, z, h: C.h };
    return L;
  }
  function moveTo(x, y, z, h) {
    closeRibbon();
    C.x = x;
    C.y = y;
    C.z = z;
    if (h != null) C.h = h;
    return L;
  }
  function boss(cfg) {
    D.boss = { ...cfg };
    return L;
  }

  /* ------------------------------------------------------------ finalize */
  function done() {
    closeRibbon();
    // ribbon normals from neighbouring samples
    for (const r of D.ribbons) {
      const p = r.pts;
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)];
        const b = p[Math.min(p.length - 1, i + 1)];
        let tx = b.x - a.x;
        let ty = b.y - a.y;
        let tz = b.z - a.z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        const c = 1 / Math.sqrt(1 + p[i].bank * p[i].bank);
        const sx = p[i].rx * c;
        const sy = p[i].bank * c;
        const sz = p[i].rz * c;
        // n = S × T
        let nx = sy * tz - sz * ty;
        let ny = sz * tx - sx * tz;
        let nz = sx * ty - sy * tx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        if (ny < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        p[i].nx = nx / nl;
        p[i].ny = ny / nl;
        p[i].nz = nz / nl;
      }
    }
    // collision geometry for snapping
    const G = buildGeom(D);
    const o = {};
    for (const it of pend) {
      if (it._side) {
        const { Z, s, up, abs, d } = it._side;
        let h;
        if (abs != null) h = abs;
        else {
          const g = it._side.S.g(s);
          h = (Number.isFinite(g) ? g : it._side.S.h) + up;
        }
        it.x = Z.ox + Z.fx * s + Z.nx * d;
        it.y = Z.oy + h;
        it.z = Z.oz + Z.fz * s + Z.nz * d;
        if (it.deco || it.t === "auto") {
          // deco behind the plane: find whatever ground is there
          const g = floorBelow(G, it.x, it.z, it.y + 2, it.y - 30, o) ? o.y : Z.oy + h - 0;
          it.y = g + (up || 0);
        }
        it.zone = Z.idx;
        it.along = s;
        delete it._side;
      } else {
        const ok = floorBelow(G, it.x, it.z, it._hint, it._hint - 40, o);
        it.y = (ok ? o.y : it._hint - 4) + it._up;
        if (!ok) it.floating = true;
        delete it._hint;
        delete it._up;
      }
      if (it.ring) D.rings[D.rings.indexOf(it)] = [it.x, it.y, it.z];
    }
    D.rings = D.rings.map((r) => (Array.isArray(r) ? r : [r.x, r.y, r.z]));
    // kill plane well under the lowest floor
    let lo = Infinity;
    for (const r of D.ribbons) for (const p of r.pts) lo = Math.min(lo, p.y);
    for (const s of D.slabs) for (const h of s.hs) lo = Math.min(lo, s.oy + h);
    for (const b of D.boxes) lo = Math.min(lo, b.y + b.hy);
    for (const d of D.discs) lo = Math.min(lo, d.y);
    D.killY = (Number.isFinite(lo) ? lo : 0) - 22;
    D.lowY = lo;
    // bounds
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of D.route) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    D.bounds = { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 };
    return D;
  }

  const L = {
    C,
    D,
    R,
    road,
    turn,
    gap,
    ramp,
    plaza,
    at,
    loop3d,
    corkscrew,
    halfLoop,
    rails,
    tunnel,
    side,
    spawn,
    goal,
    moveTo,
    boss,
    route: routeAct,
    done,
    ...B,
  };
  return L;
}

/** collision geometry from level data (fresh objects; data stays pristine) */
export function buildGeom(D) {
  const G = createGeom();
  for (const r of D.ribbons) addRibbon(G, { pts: r.pts, guard: r.guard, thick: r.thick, src: r });
  for (const s of D.slabs) addSlab(G, { ...s, hs: s.hs });
  for (const b of D.boxes) addBox(G, { ...b, mover: b.mover ? { ...b.mover } : null, crumble: b.crumble ? { ...b.crumble } : null, src: b });
  for (const d of D.discs) addDisc(G, { ...d, mover: d.mover ? { ...d.mover } : null, src: d });
  return G;
}
