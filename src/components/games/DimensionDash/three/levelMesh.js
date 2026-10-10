/**
 * Dimension Dash — static level meshes built from builder data:
 * road ribbons (top / curbs / skirts / underside / guard rails), 2.5D ground
 * slabs (grass top + checkered cliff faces), one-way ledges, boxes by style,
 * discs, loop / corkscrew ribbons, grind rails with pylons, shift gates and
 * speed tunnels. Everything that moves is made in props.js instead.
 */
import * as THREE from "three";

/* ------------------------------------------------------------------ tiny geometry helper */
class Geo {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.i = [];
  }
  v(x, y, z, nx, ny, nz, u, w) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.uv.push(u, w);
    return this.p.length / 3 - 1;
  }
  quad(a, b, c, d) {
    this.i.push(a, b, c, a, c, d);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
  get empty() {
    return this.i.length === 0;
  }
}

/** strip between two polylines (arrays of [x,y,z]); fills normals by cross product */
function strip(G, A, B, uA, uB, vs, flip = false) {
  const base = G.p.length / 3;
  for (let k = 0; k < A.length; k++) {
    const a = A[k];
    const b = B[k];
    const nxt = A[Math.min(A.length - 1, k + 1)];
    const prv = A[Math.max(0, k - 1)];
    const tx = nxt[0] - prv[0];
    const ty = nxt[1] - prv[1];
    const tz = nxt[2] - prv[2];
    const sx = b[0] - a[0];
    const sy = b[1] - a[1];
    const sz = b[2] - a[2];
    let nx = sy * tz - sz * ty;
    let ny = sz * tx - sx * tz;
    let nz = sx * ty - sy * tx;
    const l = Math.hypot(nx, ny, nz) || 1;
    if (flip) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    G.v(a[0], a[1], a[2], nx / l, ny / l, nz / l, uA, vs[k]);
    G.v(b[0], b[1], b[2], nx / l, ny / l, nz / l, uB, vs[k]);
  }
  for (let k = 0; k < A.length - 1; k++) {
    const i0 = base + k * 2;
    if (flip) G.quad(i0, i0 + 2, i0 + 3, i0 + 1);
    else G.quad(i0, i0 + 1, i0 + 3, i0 + 2);
  }
}

function meshOf(G, mat, { shadows, cast = false, receive = true } = {}) {
  const m = new THREE.Mesh(G.build(), mat);
  m.receiveShadow = shadows && receive;
  m.castShadow = shadows && cast;
  return m;
}

/* ------------------------------------------------------------------ ribbons */
function ribbonMeshes(r, M, out, shadows, theme) {
  const pts = r.pts;
  const top = new Geo();
  const side = new Geo();
  const curb = new Geo();
  const L = [];
  const Rr = [];
  const Lb = [];
  const Rb = [];
  const Lc = [];
  const Rc = [];
  const vs = [];
  let cum = 0;
  const th = r.thick || 1.4;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) cum += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z);
    vs.push(cum / 6);
    const e = (lat, dy = 0) => [p.x + p.rx * lat, p.y + lat * p.bank + dy, p.z + p.rz * lat];
    L.push(e(-p.hw));
    Rr.push(e(p.hw));
    Lb.push(e(-p.hw, -th));
    Rb.push(e(p.hw, -th));
    Lc.push(e(-p.hw + 0.45, 0.02));
    Rc.push(e(p.hw - 0.45, 0.02));
  }
  const w = (pts[0].hw * 2) / 6;
  // top surface (normals up): order so that cross gives +y
  strip(top, L, Rr, 0, w, vs);
  // curbs
  strip(curb, Lc.map((q, i) => [q[0], q[1], q[2]]), L.map((q) => [q[0], q[1] + 0.03, q[2]]), 0, 0.1, vs, true);
  strip(curb, Rr.map((q) => [q[0], q[1] + 0.03, q[2]]), Rc, 0, 0.1, vs, true);
  // skirts + underside
  strip(side, Lb, L, 0, th / 4, vs.map((v) => v * 1.5));
  strip(side, Rr, Rb, 0, th / 4, vs.map((v) => v * 1.5));
  strip(side, Rb, Lb, 0, w, vs);
  out.push(meshOf(top, M.top, { shadows }));
  out.push(meshOf(curb, M.edge, { shadows }));
  out.push(meshOf(side, M.side, { shadows, receive: false }));
  if (r.guard) {
    for (const edge of [L, Rr]) {
      const ctrl = edge.filter((_, i) => i % 2 === 0 || i === edge.length - 1).map((q) => new THREE.Vector3(q[0], q[1] + 0.95, q[2]));
      if (ctrl.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(ctrl);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, ctrl.length * 2), 0.07, 6, false), M.railPost);
      out.push(tube);
      // glass panel
      const glass = new Geo();
      strip(glass, edge.map((q) => [q[0], q[1] + 0.95, q[2]]), edge.map((q) => [q[0], q[1] + 0.05, q[2]]), 0, 1, vs);
      const gm = meshOf(glass, M.glass, { shadows: false });
      gm.material = M.glass;
      out.push(gm);
    }
  }
  void theme;
}

/* ------------------------------------------------------------------ slabs */
function slabMeshes(s, M, out, shadows) {
  const n = s.hs.length;
  const thick = s.thick > 4 ? 16 : s.thick;
  const top = new Geo();
  const face = new Geo();
  const F = [];
  const B = [];
  const Fb = [];
  const Bb = [];
  const Fl = [];
  const vs = [];
  const P = (a, h, d) => [s.ox + s.fx * a + s.nx * d, s.oy + h, s.oz + s.fz * a + s.nz * d];
  for (let i = 0; i < n; i++) {
    const a = s.s0 + i * s.ds;
    const h = s.hs[i];
    F.push(P(a, h, s.dh));
    B.push(P(a, h, -s.dh));
    Fb.push(P(a, h - thick, s.dh));
    Bb.push(P(a, h - thick, -s.dh));
    Fl.push(P(a, h - 0.32, s.dh + 0.06));
    vs.push(a / 4.8);
  }
  const big = s.thick > 4;
  // top
  strip(top, B, F, 0, (s.dh * 2) / 4.8, vs);
  // front (camera side) + back faces
  const vF = vs;
  if (big) {
    // grass lip on the front edge, checkered cliff below it
    const lip = new Geo();
    strip(lip, Fl, F.map((q) => [q[0] + s.nx * 0.06, q[1] + 0.02, q[2] + s.nz * 0.06]), 0, 0.1, vF, true);
    out.push(meshOf(lip, M.edge, { shadows }));
  }
  strip(face, F, Fb, 0, thick / 4.8, vF);
  strip(face, Bb, B, 0, thick / 4.8, vF);
  // end caps
  for (const k of [0, n - 1]) {
    const cap = [B[k], F[k], Fb[k], Bb[k]];
    const sg = k === 0 ? -1 : 1;
    const nx = s.fx * sg;
    const nz = s.fz * sg;
    const b = face.p.length / 3;
    face.v(...cap[0], nx, 0, nz, 0, 0);
    face.v(...cap[1], nx, 0, nz, (s.dh * 2) / 4.8, 0);
    face.v(...cap[2], nx, 0, nz, (s.dh * 2) / 4.8, thick / 4.8);
    face.v(...cap[3], nx, 0, nz, 0, thick / 4.8);
    if (sg > 0) face.quad(b, b + 1, b + 2, b + 3);
    else face.quad(b, b + 3, b + 2, b + 1);
  }
  if (!big) {
    const bot = new Geo();
    strip(bot, Fb, Bb, 0, 1, vs);
    out.push(meshOf(bot, M.under, { shadows: false }));
  }
  out.push(meshOf(top, big ? M.top : M.platform, { shadows, cast: !big }));
  out.push(meshOf(face, big ? M.side : M.platSide, { shadows, cast: !big, receive: true }));
}

/* ------------------------------------------------------------------ boxes */
const BOXGEO = new THREE.BoxGeometry(1, 1, 1);
function uvBox(hx, hy, hz, scale = 3) {
  const g = BOXGEO.clone();
  const uv = g.attributes.uv;
  // faces: +x,-x,+y,-y,+z,-z (4 verts each)
  const dims = [
    [hz, hy],
    [hz, hy],
    [hx, hz],
    [hx, hz],
    [hx, hy],
    [hx, hy],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0] * 2) / scale, (uv.getY(i) * dims[f][1] * 2) / scale);
    }
  }
  return g;
}

export function boxMesh(b, M, shadows) {
  const g = uvBox(b.hx, b.hy, b.hz, b.style === "rock" ? 6 : 4.8);
  let mat;
  switch (b.style) {
    case "plaza":
    case "cliff":
      mat = [M.side, M.side, M.top, M.under, M.side, M.side];
      break;
    case "rock":
      mat = M.rock;
      break;
    case "lift":
    case "mover":
      mat = [M.darkMetal, M.darkMetal, M.lift, M.darkMetal, M.darkMetal, M.darkMetal];
      break;
    case "crumble":
      mat = M.crumble;
      break;
    case "gate":
      mat = M.gate;
      break;
    default:
      mat = M.block;
  }
  const m = new THREE.Mesh(g, mat);
  m.scale.set(b.hx * 2, b.hy * 2, b.hz * 2);
  m.position.set(b.x, b.y, b.z);
  m.rotation.y = b.yaw || 0;
  m.castShadow = shadows && b.style !== "plaza" && b.style !== "cliff";
  m.receiveShadow = shadows;
  return m;
}

function discMesh(d, M, shadows) {
  const depth = Math.max(0.6, d.y - (d.y0 ?? d.y - 2));
  const g = new THREE.CylinderGeometry(d.r, d.r * 0.92, depth, 40, 1);
  const m = new THREE.Mesh(g, [M.side, M.top, M.under]);
  m.position.set(d.x, d.y - depth / 2, d.z);
  m.receiveShadow = shadows;
  return m;
}

/* ------------------------------------------------------------------ rides (loops etc.) */
function rideMesh(r, M, out, shadows) {
  const pts = r.pts;
  const ups = r.ups;
  const n = pts.length;
  const w = r.kind === "corkscrew" ? 2.6 : 1.9;
  const A = [];
  const B = [];
  const Ao = [];
  const Bo = [];
  const vs = [];
  let cum = 0;
  const i0 = r.kind === "loop" ? Math.floor(n * 0.05) : 0;
  const i1 = r.kind === "loop" ? Math.ceil(n * 0.95) : n - 1;
  for (let i = i0; i <= i1; i++) {
    const p = pts[i];
    const q = pts[Math.min(n - 1, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    const tx = q[0] - o[0];
    const ty = q[1] - o[1];
    const tz = q[2] - o[2];
    const u = ups[i];
    // lateral = T × up
    let lx = ty * u[2] - tz * u[1];
    let ly = tz * u[0] - tx * u[2];
    let lz = tx * u[1] - ty * u[0];
    const l = Math.hypot(lx, ly, lz) || 1;
    lx /= l;
    ly /= l;
    lz /= l;
    if (i > i0) cum += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
    vs.push(cum / 4.8);
    A.push([p[0] - lx * w, p[1] - ly * w, p[2] - lz * w]);
    B.push([p[0] + lx * w, p[1] + ly * w, p[2] + lz * w]);
    Ao.push([p[0] - lx * w - u[0] * 0.55, p[1] - ly * w - u[1] * 0.55, p[2] - lz * w - u[2] * 0.55]);
    Bo.push([p[0] + lx * w - u[0] * 0.55, p[1] + ly * w - u[1] * 0.55, p[2] + lz * w - u[2] * 0.55]);
  }
  const top = new Geo();
  strip(top, A, B, 0, (w * 2) / 4.8, vs);
  const sides = new Geo();
  strip(sides, Ao, A, 0, 0.2, vs);
  strip(sides, B, Bo, 0, 0.2, vs);
  strip(sides, Bo, Ao, 0, 1, vs);
  out.push(meshOf(top, M.loop, { shadows, cast: true }));
  out.push(meshOf(sides, M.loopSide, { shadows, cast: true }));
}

/* ------------------------------------------------------------------ rails */
function railMeshes(rail, M, out, shadows) {
  const ctrl = rail.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(ctrl);
  const segs = Math.max(16, Math.ceil(curve.getLength() / 0.8));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.1, 8, false), M.rail);
  tube.castShadow = shadows;
  out.push(tube);
  // pylons every ~9 m reaching down out of view
  const len = curve.getLength();
  const n = Math.max(2, Math.round(len / 9));
  for (let k = 0; k <= n; k++) {
    const p = curve.getPointAt(k / n);
    const post = new THREE.Mesh(PYLON, M.railPost);
    post.position.set(p.x, p.y - 0.32, p.z);
    out.push(post);
    const leg = new THREE.Mesh(LEG, M.darkMetal);
    leg.position.set(p.x, p.y - 7, p.z);
    out.push(leg);
  }
  // end caps
  for (const t of [0, 1]) {
    const p = curve.getPointAt(t);
    const cap = new THREE.Mesh(CAP, M.railPost);
    cap.position.copy(p);
    out.push(cap);
  }
}
const PYLON = new THREE.CylinderGeometry(0.06, 0.12, 0.5, 8);
const LEG = new THREE.CylinderGeometry(0.11, 0.18, 13, 8);
const CAP = new THREE.SphereGeometry(0.16, 10, 8);

/* ------------------------------------------------------------------ tunnels / gates */
const HEX = new THREE.TorusGeometry(4.6, 0.22, 6, 6);
const HEX_IN = new THREE.CylinderGeometry(4.4, 4.4, 1, 6, 1, true);
const ARCH = new THREE.TorusGeometry(5, 0.28, 8, 24, Math.PI);

function tunnelMeshes(t, M, out, anim) {
  const g = new THREE.Group();
  g.position.set(t.x, t.y, t.z);
  g.rotation.y = t.h;
  if (t.kind === "shift") {
    // glowing hexagonal shift gate: rings + a scrolling hex-grid sleeve
    const rings = [];
    for (let k = 0; k <= 3; k++) {
      const r = new THREE.Mesh(HEX, k % 2 ? M.gateRingB : M.gateRing);
      r.position.set(0, 3.2, (k / 3) * t.len);
      r.rotation.z = Math.PI / 6;
      g.add(r);
      rings.push(r);
    }
    const sleeve = new THREE.Mesh(HEX_IN, M.gateGlow);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.rotation.y = Math.PI / 6;
    sleeve.scale.set(1, t.len, 1);
    sleeve.position.set(0, 3.2, t.len / 2);
    g.add(sleeve);
    anim.push({ kind: "shift", rings, sleeve });
  } else {
    const n = Math.max(2, Math.round(t.len / 6));
    const arches = [];
    for (let k = 0; k <= n; k++) {
      const a = new THREE.Mesh(ARCH, M.speedRing);
      a.position.set(0, 0, (k / n) * t.len);
      a.scale.setScalar((t.w || 9) / 10 + 0.05);
      g.add(a);
      arches.push(a);
    }
    anim.push({ kind: "speed", arches });
  }
  out.push(g);
}

/* ------------------------------------------------------------------ public */
export function buildLevelMeshes(L, mats, { shadows }) {
  const M = mats.M;
  const out = [];
  const anim = [];
  for (const r of L.ribbons) ribbonMeshes(r, M, out, shadows, L.meta.theme);
  for (const s of L.slabs) slabMeshes(s, M, out, shadows);
  for (const b of L.boxes) if (!b.mover && !b.crumble && b.style !== "gate") out.push(boxMesh(b, M, shadows));
  for (const d of L.discs) if (!d.mover) out.push(discMesh(d, M, shadows));
  for (const r of L.rides) rideMesh(r, M, out, shadows);
  for (const r of L.rails) railMeshes(r, M, out, shadows);
  for (const t of L.tunnels) tunnelMeshes(t, M, out, anim);
  const group = new THREE.Group();
  group.name = "levelStatic";
  for (const o of out) group.add(o);
  let t = 0;
  function update(dt) {
    t += dt;
    M.gateGlow.map.offset.y = -t * 0.6;
    M.gateGlow.opacity = 0.42 + Math.sin(t * 4) * 0.12;
    for (const a of anim) {
      if (a.kind === "shift") a.rings.forEach((r, i) => (r.rotation.z = Math.PI / 6 + Math.sin(t * 1.5 + i) * 0.25));
    }
    M.speedRing.opacity = 0.4 + Math.sin(t * 8) * 0.15;
  }
  function dispose() {
    group.traverse((o) => {
      if (o.isMesh && o.geometry !== BOXGEO && o.geometry !== PYLON && o.geometry !== LEG && o.geometry !== CAP && o.geometry !== HEX && o.geometry !== HEX_IN && o.geometry !== ARCH) o.geometry.dispose();
    });
  }
  return { group, update, dispose };
}

export { discMesh };
