/**
 * Geometry helpers for the procedural dolls and the workshop.
 *  revolve()  — surface of revolution whose radius may vary with the angle
 *               (pleated skirts, scalloped collars, wavy hems)
 *  tube()     — tapered tube along a smooth curve with rounded caps (limbs,
 *               hair locks, threads, handles)
 *  sphereish()— a sphere with a per-vertex deform function (heads, hands)
 * All return non-indexed-safe indexed BufferGeometry with normals and UVs.
 */
import * as THREE from "three";

const TAU = Math.PI * 2;

/**
 * rings: [{ y, r, [z0] }] bottom→top, or a function ring(t) → {y, r}.
 * rFn(angle, ring, t) optional radius modifier. Options: segs, a0, a1 (angle
 * range for open panels), squash (z scale), capBottom/capTop (closing fans).
 */
export function revolve(rings, { segs = 48, a0 = 0, a1 = TAU, rFn = null, squash = 1, capTop = false, capBottom = false, flip = false } = {}) {
  const n = rings.length;
  const closed = Math.abs(a1 - a0 - TAU) < 1e-6;
  const cols = closed ? segs + 1 : segs + 1;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j < n; j++) {
    const ring = rings[j];
    const t = j / (n - 1);
    for (let i = 0; i < cols; i++) {
      const u = i / segs;
      const a = a0 + (a1 - a0) * u;
      let r = ring.r;
      if (rFn) r = rFn(a, ring, t, r);
      // a=0 points to +Z (front of the doll)
      pos.push(Math.sin(a) * r, ring.y, Math.cos(a) * r * squash);
      uv.push(u, t);
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const addCap = (j, up) => {
    const ring = rings[j];
    const center = pos.length / 3;
    pos.push(0, ring.y + (up ? (ring.capH || 0) : -(ring.capH || 0)), 0);
    uv.push(0.5, up ? 1 : 0);
    for (let i = 0; i < segs; i++) {
      const a = j * cols + i;
      const b = a + 1;
      if (up !== flip) idx.push(a, b, center);
      else idx.push(b, a, center);
    }
  };
  if (capTop) addCap(n - 1, true);
  if (capBottom) addCap(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closed) fixSeamNormals(g, n, cols);
  return g;
}

/** Average the normals across the u=0/u=1 seam of a closed revolve. */
function fixSeamNormals(g, rows, cols) {
  const nrm = g.attributes.normal;
  for (let j = 0; j < rows; j++) {
    const a = j * cols;
    const b = a + cols - 1;
    const x = nrm.getX(a) + nrm.getX(b);
    const y = nrm.getY(a) + nrm.getY(b);
    const z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l);
    nrm.setXYZ(b, x / l, y / l, z / l);
  }
}

/** Smooth profile helper: [[r, y], ...] → rings, Catmull-Rom resampled. */
export function profile(points, steps = 4) {
  const v = points.map(([r, y]) => new THREE.Vector2(r, y));
  if (v.length < 3) return v.map((p) => ({ r: p.x, y: p.y }));
  const curve = new THREE.SplineCurve(v);
  return curve.getPoints((v.length - 1) * steps).map((p) => ({ r: Math.max(0, p.x), y: p.y }));
}

/**
 * Tapered tube along points (Vector3[]), radius(t) in model units. `flat`
 * squashes the cross-section (ribbons, flat hair locks). Rounded caps close
 * the ends. Returns geometry with uv.v running along the tube.
 */
export function tube(points, radius, { radial = 10, tubular = 24, capStart = true, capEnd = true, flat = 1, twist = 0, closedCurve = false, upHint = null } = {}) {
  const curve = points.isCurve ? points : new THREE.CatmullRomCurve3(points, closedCurve, "centripetal");
  const frames = computeFrames(curve, tubular, upHint);
  const pos = [];
  const uv = [];
  const idx = [];
  const rad = typeof radius === "function" ? radius : () => radius;
  const capRings = 4;
  const P = new THREE.Vector3();
  const pushRing = (pt, N, B, T, r, v, shrink = 1, push = 0) => {
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      P.copy(pt)
        .addScaledVector(N, c * r * shrink)
        .addScaledVector(B, s * r * shrink * flat)
        .addScaledVector(T, push);
      pos.push(P.x, P.y, P.z);
      uv.push(i / radial, v);
    }
  };
  let rows = 0;
  const r0 = rad(0);
  const r1 = rad(1);
  if (capStart && r0 > 0) {
    for (let k = 0; k < capRings; k++) {
      const ang = ((capRings - k) / capRings) * (Math.PI / 2);
      pushRing(frames.points[0], frames.normals[0], frames.binormals[0], frames.tangents[0], r0, 0, Math.cos(ang) || 0.001, -Math.sin(ang) * r0);
      rows++;
    }
  }
  for (let j = 0; j <= tubular; j++) {
    const t = j / tubular;
    const tw = twist * t;
    let N = frames.normals[j], B = frames.binormals[j];
    if (tw) {
      const n2 = N.clone().multiplyScalar(Math.cos(tw)).addScaledVector(B, Math.sin(tw));
      const b2 = B.clone().multiplyScalar(Math.cos(tw)).addScaledVector(N, -Math.sin(tw));
      N = n2;
      B = b2;
    }
    pushRing(frames.points[j], N, B, frames.tangents[j], rad(t), t);
    rows++;
  }
  if (capEnd && r1 > 0) {
    const j = tubular;
    for (let k = 1; k <= capRings; k++) {
      const ang = (k / capRings) * (Math.PI / 2);
      pushRing(frames.points[j], frames.normals[j], frames.binormals[j], frames.tangents[j], r1, 1, Math.cos(ang) || 0.001, Math.sin(ang) * r1);
      rows++;
    }
  }
  const cols = radial + 1;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.rows = rows;
  g.userData.cols = cols;
  return g;
}

/** Rotation-minimizing frames (stable for nearly straight curves). */
function computeFrames(curve, segs, upHint) {
  const points = [];
  const tangents = [];
  const normals = [];
  const binormals = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    points.push(curve.getPointAt(t));
    tangents.push(curve.getTangentAt(t).normalize());
  }
  let up = upHint ? upHint.clone() : new THREE.Vector3(0, 0, 1);
  if (Math.abs(up.dot(tangents[0])) > 0.9) up = new THREE.Vector3(1, 0, 0);
  let N = new THREE.Vector3().crossVectors(tangents[0], up).normalize();
  for (let i = 0; i <= segs; i++) {
    if (i > 0) {
      // project previous normal onto the new tangent's plane
      N = N.clone().addScaledVector(tangents[i], -N.dot(tangents[i])).normalize();
    }
    normals.push(N);
    binormals.push(new THREE.Vector3().crossVectors(tangents[i], N).normalize());
  }
  return { points, tangents, normals, binormals };
}

/**
 * Sphere whose vertices pass through deform(dir:Vector3, out:Vector3).
 * Keeps SphereGeometry UVs (u=0.25 faces +Z), so face textures line up.
 */
export function sphereish(radius, deform, ws = 64, hs = 48) {
  const g = new THREE.SphereGeometry(radius, ws, hs);
  const p = g.attributes.position;
  const dir = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    dir.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    if (deform) deform(dir, out);
    else out.copy(dir).multiplyScalar(radius);
    p.setXYZ(i, out.x, out.y, out.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Direction on a unit sphere from azimuth (0 = +Z, + = toward +X) and elevation. */
export function dirAE(az, el, out = new THREE.Vector3()) {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/** SphereGeometry UV for a unit direction (matches three's SphereGeometry). */
export function sphereUV(dir) {
  // three: x = -cos(phi) sin(theta), z = sin(phi) sin(theta), y = cos(theta)
  const theta = Math.acos(Math.max(-1, Math.min(1, dir.y)));
  let phi = Math.atan2(dir.z, -dir.x);
  if (phi < 0) phi += TAU;
  return { u: phi / TAU, v: 1 - theta / Math.PI };
}

/** Adds the 4-channel grime attribute (dust, dirt, stain, wet) to a geometry. */
export function addGrime(g) {
  if (!g.attributes.aGrime) g.setAttribute("aGrime", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4));
  return g;
}

/** Remove triangles whose centroid fails keep(centroid) — used for hairlines. */
export function filterTris(g, keep) {
  const p = g.attributes.position;
  const ix = g.index.array;
  const out = [];
  const c = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    c.set(
      (p.getX(ix[i]) + p.getX(ix[i + 1]) + p.getX(ix[i + 2])) / 3,
      (p.getY(ix[i]) + p.getY(ix[i + 1]) + p.getY(ix[i + 2])) / 3,
      (p.getZ(ix[i]) + p.getZ(ix[i + 1]) + p.getZ(ix[i + 2])) / 3,
    );
    if (keep(c)) out.push(ix[i], ix[i + 1], ix[i + 2]);
  }
  g.setIndex(out);
  return g;
}

/** Jagged polyline on a surface (cracks, tears) from a start, direction and length. */
export function jagged(rand, n, amp) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push((rand() - 0.5) * 2 * amp * (i === 0 || i === n ? 0.3 : 1));
  return pts;
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
