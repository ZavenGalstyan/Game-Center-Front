/**
 * Hair: a scalp cap plus individual locks (tapered, flattened tubes) laid
 * over the head and draped around the shoulders, merged into ONE mesh with a
 * per-vertex lock id so the brush can tell which lock it touched.
 *
 * Every lock carries live state the session drives:
 *   tangle 0..1  — frizz/kinks (precomputed per-vertex offsets) + dull colour
 *   wet    0..1  — darker, calmer frizz
 *   growth 0..1  — rerooted locks grow out from the scalp
 * Bald patches are skin-coloured scalp overlays that fade as hair regrows.
 */
import * as THREE from "three";
import { tube, sphereish, filterTris, dirAE } from "./geo.js";
import { hairTex } from "./textures.js";
import { mulberry, noise3, smooth, clamp } from "../engine/rng.js";

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

/** Hairline elevation by azimuth — high at the forehead, low at the nape. */
export function hairlineEl(az, style) {
  const a = Math.abs(az);
  if (style === "pixie") return 0.25 + 0.15 * smooth(0, 2.5, a) * -1;
  return 0.42 - 0.95 * smooth(0.45, 2.7, a);
}

/**
 * Builds the hair. `head` = { c: Vector3 centre, surf(dir, lift): Vector3 }
 * `body` = capsules [{a, b, r}] the hanging locks must clear.
 */
export function buildHair({ style, hex, plan, head, body, seed = 1, skinHex = "#f2d0c0" }) {
  const group = new THREE.Group();
  group.name = "hair";
  const r = mulberry(seed * 31 + 7);
  const hr = plan.hr;
  const hc = head.c;
  const locks = [];
  const H = plan.height;
  const yarn = style === "yarn";
  const lockR = yarn ? hr * 0.075 : hr * (style === "pixie" ? 0.12 : 0.21);

  const pushOut = (p, margin = 0) => {
    // head
    tmp.copy(p).sub(hc);
    const d = tmp.length();
    const minD = hr * 1.07 + margin;
    if (d < minD) p.copy(hc).addScaledVector(tmp.normalize(), minD);
    for (const c of body) {
      // capsule push
      const ab = tmp.copy(c.b).sub(c.a);
      const t = clamp(new THREE.Vector3().copy(p).sub(c.a).dot(ab) / ab.lengthSq(), 0, 1);
      const q = new THREE.Vector3().copy(c.a).addScaledVector(ab, t);
      const off = new THREE.Vector3().copy(p).sub(q);
      const L = off.length();
      const need = c.r + margin + 0.006;
      if (L < need) {
        if (L < 1e-5) off.set(0, 0, -1);
        p.copy(q).addScaledVector(off.normalize(), need);
      }
    }
    return p;
  };

  /** A lock that flows over the scalp along gravity, then hangs. */
  function flowLock(az, el, { length, hang = 1, bias = -0.3, wave = 0, curl = 0, curlR = 0.02, endCurl = 0, minY = -Infinity, rad = lockR, lift = 0.006 }) {
    const pts = [];
    const d = dirAE(az, el);
    let p = head.surf(d, lift);
    pts.push(p.clone());
    let travelled = 0;
    const step = hr * 0.16;
    // surface phase
    for (let k = 0; k < 24 && travelled < length; k++) {
      const g = new THREE.Vector3(0, -1, 0).addScaledVector(d, d.y);
      if (g.lengthSq() < 1e-4) g.set(d.x, 0, d.z);
      if (g.lengthSq() < 1e-6) g.set(0, 0, -1);
      g.normalize();
      d.addScaledVector(g, step / hr).normalize();
      const np = head.surf(d, lift + k * 0.0006);
      travelled += np.distanceTo(p);
      p = np;
      pts.push(p.clone());
      if (d.y < -0.2 + (Math.abs(az) > 2.2 ? -0.35 : 0) || p.y < minY) break;
    }
    if (hang > 0 && travelled < length) {
      const out = new THREE.Vector3(p.x - hc.x, 0, p.z - hc.z).normalize();
      const dir = new THREE.Vector3(out.x * 0.15, -1, bias + out.z * 0.15).normalize();
      const rem = length - travelled;
      const n = Math.max(3, Math.round(rem / (hr * 0.14)));
      const axis = p.clone();
      const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
      if (side.lengthSq() < 0.1) side.set(1, 0, 0);
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        axis.addScaledVector(dir, rem / n);
        if (axis.y < minY) axis.y = minY;
        const q = axis.clone();
        if (wave) q.addScaledVector(side, Math.sin(t * 9 + az * 3) * wave * (0.3 + t));
        if (curl) {
          const ang = t * curl * Math.PI * 2 + az * 2;
          q.addScaledVector(side, Math.cos(ang) * curlR * (0.5 + t * 0.6)).addScaledVector(out, Math.sin(ang) * curlR * (0.5 + t * 0.6));
        }
        if (endCurl && t > 0.6) {
          const e = (t - 0.6) / 0.4;
          q.addScaledVector(out, -endCurl * e * e).y += endCurl * 0.6 * e * e;
        }
        pushOut(q);
        pts.push(q);
        // the next segment continues from the pushed point so locks drape
        if (!curl) axis.copy(q).addScaledVector(side, -(wave ? Math.sin(t * 9 + az * 3) * wave * (0.3 + t) : 0));
      }
    }
    return addLock(pts, rad, az, el);
  }

  /** A lock gathered over the scalp to a tie point (ponytails, buns, braids). */
  function gatherLock(az, el, tieDir, rad = lockR * 0.8) {
    const a = dirAE(az, el);
    const pts = [];
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const d = new THREE.Vector3().copy(a).lerp(tieDir, t).normalize();
      pts.push(head.surf(d, 0.004 + 0.003 * Math.sin(t * Math.PI)));
    }
    return addLock(pts, (t) => rad * (1 - 0.4 * t), az, el, 1);
  }

  function freeLock(pts, rad, az = 0, el = 0, flatK = 0.55) {
    return addLock(pts, rad, az, el, flatK);
  }

  function addLock(pts, rad, az, el, flatK = yarn ? 1 : 0.42) {
    if (pts.length < 2) return null;
    const radius = typeof rad === "function" ? rad : (t) => rad * (yarn ? 1 - 0.15 * t : 1 - 0.78 * Math.pow(t, 1.4)) + 0.0006;
    const rootP = pts[0].clone();
    const outward = rootP.clone().sub(hc).normalize();
    const g = tube(pts, radius, { radial: yarn ? 6 : 7, tubular: Math.max(6, Math.min(30, pts.length * 2)), capStart: true, capEnd: true, flat: flatK, upHint: outward });
    const tip = pts[pts.length - 1];
    locks.push({
      geo: g,
      root: rootP,
      tip: tip.clone(),
      dir: tip.clone().sub(rootP).normalize(),
      az,
      el,
      present: true,
      growth: 1,
      tangle: 0,
      wet: 0,
      washed: false,
    });
    return locks[locks.length - 1];
  }

  /* -------------------------------------------------------------- styles */
  const fringe = (n = 7, depth = 0.4) => {
    depth = Math.max(depth, 0.4);
    for (let i = 0; i < n; i++) {
      const az = -0.6 + (1.2 * i) / (n - 1) + (r() - 0.5) * 0.05;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const el = 0.95 - t * (0.95 - (plan.eyeEl + depth));
        const a = az * (0.6 + 0.4 * t);
        pts.push(head.surf(dirAE(a, el), 0.006 + 0.004 * Math.sin(t * Math.PI)));
      }
      addLock(pts, lockR * 0.85, az, 0.9);
    }
  };
  const ring = (n, fn) => {
    for (let i = 0; i < n; i++) {
      const az = -Math.PI + ((i + 0.5) / n) * Math.PI * 2;
      fn(az, i);
    }
  };
  const backLen = H * 0.42;

  switch (style) {
    case "long":
    case "wavy":
    case "ringlets": {
      const curl = style === "ringlets" ? 3.2 : 0;
      const wave = style === "wavy" ? hr * 0.1 : 0;
      const len = style === "ringlets" ? backLen * 0.82 : backLen;
      ring(28, (az) => {
        if (Math.abs(az) < 0.62) return;
        const front = Math.abs(az) < 1.25;
        const el = Math.max(hairlineEl(az) + 0.04, 0.12);
        flowLock(az, el, {
          length: len * (front ? 0.82 : 1) * (0.92 + r() * 0.12),
          bias: front ? 0.18 : -0.32,
          wave,
          curl,
          curlR: hr * 0.13,
          rad: lockR * (style === "ringlets" ? 0.8 : 1),
        });
      });
      // crown layer for volume
      ring(10, (az) => {
        if (Math.abs(az) < 1.0) return;
        flowLock(az + 0.15, 0.7, { length: len * 0.75, bias: -0.35, wave, curl, curlR: hr * 0.12, lift: 0.012 });
      });
      fringe(style === "ringlets" ? 6 : 7, style === "wavy" ? 0.33 : 0.3);
      break;
    }
    case "bob": {
      const chin = hc.y - hr * 1.08;
      ring(24, (az) => {
        if (Math.abs(az) < 0.62) return;
        const el = Math.max(hairlineEl(az) + 0.04, 0.12);
        flowLock(az, el, { length: hr * 2.2, bias: -0.05, endCurl: hr * 0.18, minY: chin, rad: lockR * 1.1 });
      });
      ring(10, (az) => {
        if (Math.abs(az) < 1.0) return;
        flowLock(az + 0.15, 0.72, { length: hr * 1.9, bias: -0.05, endCurl: hr * 0.15, minY: chin + 0.01, lift: 0.012 });
      });
      fringe(9, 0.26);
      break;
    }
    case "ponytail":
    case "bun":
    case "twintails":
    case "braids": {
      const ties = style === "twintails" ? [dirAE(1.85, 0.32), dirAE(-1.85, 0.32)]
        : style === "braids" ? [dirAE(2.25, -0.12), dirAE(-2.25, -0.12)]
          : style === "bun" ? [dirAE(Math.PI, 0.82)] : [dirAE(Math.PI, 0.22)];
      ring(26, (az) => {
        if (Math.abs(az) < 0.6) return;
        const el = Math.max(hairlineEl(az) + 0.03, 0.1);
        const tie = ties.length === 2 ? ties[az > 0 ? 0 : 1] : ties[0];
        gatherLock(az, el, tie);
      });
      ring(12, (az) => {
        const tie = ties.length === 2 ? ties[az > 0 ? 0 : 1] : ties[0];
        gatherLock(az * 0.7, 0.9, tie, lockR * 0.7);
      });
      fringe(style === "bun" ? 5 : 7, 0.32);
      for (const tieDir of ties) {
        const tieP = head.surf(tieDir, 0.012);
        const out = tieP.clone().sub(hc).normalize();
        if (style === "bun") {
          // coiled bun — a spiral lock wound around the tie point
          const pts = [];
          const axisN = out.clone();
          const t1 = new THREE.Vector3().crossVectors(axisN, new THREE.Vector3(1, 0, 0)).normalize();
          const t2 = new THREE.Vector3().crossVectors(axisN, t1).normalize();
          for (let k = 0; k <= 60; k++) {
            const t = k / 60;
            const ang = t * Math.PI * 2 * 3.2;
            const rad = hr * (0.42 - t * 0.3);
            const h = hr * (0.08 + t * 0.32);
            pts.push(tieP.clone().addScaledVector(t1, Math.cos(ang) * rad).addScaledVector(t2, Math.sin(ang) * rad).addScaledVector(axisN, h));
          }
          freeLock(pts, (t) => hr * (0.15 - t * 0.04), Math.PI, 0.8, 0.8);
          continue;
        }
        if (style === "braids") {
          const len = H * 0.33;
          for (let s = 0; s < 3; s++) {
            const pts = [];
            for (let k = 0; k <= 34; k++) {
              const t = k / 34;
              const ph = t * Math.PI * 2 * 4.5 + (s * Math.PI * 2) / 3;
              const base = tieP.clone().add(new THREE.Vector3(out.x * 0.02 * t, -len * t, (out.z * 0.4 + 0.05) * 0.04 * t));
              base.x += Math.sin(ph) * hr * 0.11;
              base.z += Math.sin(2 * ph) * hr * 0.05;
              pushOut(base, 0.005);
              pts.push(base);
            }
            freeLock(pts, (t) => hr * (0.085 - t * 0.02), out.x > 0 ? 2.2 : -2.2, -0.1, 0.9);
          }
          // tuft at the end
          const end = tieP.clone().add(new THREE.Vector3(out.x * 0.02, -len, 0.003));
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            freeLock([end.clone(), end.clone().add(new THREE.Vector3(Math.cos(a) * 0.012, -0.03, Math.sin(a) * 0.012)), end.clone().add(new THREE.Vector3(Math.cos(a) * 0.02, -0.06, Math.sin(a) * 0.02))], hr * 0.05, 0, -1);
          }
          continue;
        }
        // tails (ponytail / twin tails)
        const n = style === "twintails" ? 7 : 9;
        const len = style === "twintails" ? H * 0.32 : H * 0.36;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const spread = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(hr * 0.06);
          const pts = [tieP.clone().add(spread)];
          const p = tieP.clone().add(spread).addScaledVector(out, hr * 0.25);
          pts.push(p.clone());
          const down = new THREE.Vector3(out.x * 0.35, -1, out.z * 0.35 - 0.1).normalize();
          for (let s = 1; s <= 7; s++) {
            p.addScaledVector(down, len / 7);
            p.addScaledVector(out, 0.004 * (4 - s));
            const q = p.clone().addScaledVector(spread, s * 0.1);
            pushOut(q, 0.004);
            pts.push(q);
          }
          freeLock(pts, (t) => hr * 0.13 * (1 - 0.7 * t * t) + 0.0008, out.x > 0 ? 1.85 : -1.85, 0.3);
        }
      }
      break;
    }
    case "pixie": {
      // soft baby wisps
      for (let i = 0; i < 22; i++) {
        const az = -Math.PI + r() * Math.PI * 2;
        const el = 0.35 + r() * 0.55;
        const d0 = dirAE(az, el);
        const pts = [head.surf(d0, 0.003)];
        const d = d0.clone();
        const flow = new THREE.Vector3(Math.sin(az), -0.6, Math.cos(az)).normalize();
        for (let k = 1; k <= 5; k++) {
          d.addScaledVector(flow, 0.09).normalize();
          pts.push(head.surf(d, 0.004 + k * 0.004));
        }
        addLock(pts, lockR, az, el);
      }
      // forehead curl
      const c0 = head.surf(dirAE(0.05, 0.62), 0.004);
      const pts = [c0];
      for (let k = 1; k <= 12; k++) {
        const a = k * 0.55;
        pts.push(c0.clone().add(new THREE.Vector3(Math.sin(a) * hr * 0.12, -k * hr * 0.012 - Math.cos(a) * hr * 0.08 + hr * 0.08, Math.cos(a) * hr * 0.1 + hr * 0.04)));
      }
      freeLock(pts, (t) => lockR * (1 - 0.7 * t), 0, 0.6);
      break;
    }
    case "yarn": {
      ring(30, (az) => {
        const el = Math.max(hairlineEl(az, "yarn") + 0.02, 0.05);
        const front = Math.abs(az) < 1.3;
        if (Math.abs(az) < 0.55) return;
        flowLock(az, el, { length: H * (front ? 0.24 : 0.3), bias: front ? 0.12 : -0.3, rad: lockR, wave: hr * 0.04 });
      });
      ring(12, (az) => {
        if (Math.abs(az) < 1.0) return;
        flowLock(az + 0.13, 0.75, { length: H * 0.26, bias: -0.3, rad: lockR, lift: 0.012 });
      });
      fringe(9, 0.3);
      break;
    }
    default:
      break;
  }

  /* --------------------------------------------------------- merge locks */
  let vCount = 0;
  let iCount = 0;
  for (const L of locks) {
    vCount += L.geo.attributes.position.count;
    iCount += L.geo.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const base = new Float32Array(vCount * 3);
  const frz = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3).fill(1);
  const lockId = new Float32Array(vCount);
  const along = new Float32Array(vCount);
  const index = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
  let vo = 0;
  let io = 0;
  locks.forEach((L, li) => {
    const g = L.geo;
    const P = g.attributes.position.array;
    const N = g.attributes.normal.array;
    const U = g.attributes.uv.array;
    const n = g.attributes.position.count;
    L.start = vo;
    L.count = n;
    L.rows = g.userData.rows;
    L.cols = g.userData.cols;
    for (let i = 0; i < n; i++) {
      const o = (vo + i) * 3;
      pos[o] = base[o] = P[i * 3];
      pos[o + 1] = base[o + 1] = P[i * 3 + 1];
      pos[o + 2] = base[o + 2] = P[i * 3 + 2];
      nrm[o] = N[i * 3];
      nrm[o + 1] = N[i * 3 + 1];
      nrm[o + 2] = N[i * 3 + 2];
      uv[(vo + i) * 2] = U[i * 2];
      uv[(vo + i) * 2 + 1] = U[i * 2 + 1];
      lockId[vo + i] = li;
      const t = U[i * 2 + 1];
      along[vo + i] = t;
      // frizz: smooth kinks along the lock + per-vertex fuzz, stronger at tips
      const s = li * 13.7;
      const amp = hr * (0.03 + 0.17 * t);
      frz[o] = (noise3(t * 7, s, 0.5, seed) - 0.5) * 2 * amp + (r() - 0.5) * hr * 0.05 * t;
      frz[o + 1] = (noise3(t * 7, s, 3.5, seed) - 0.5) * amp * 0.8;
      frz[o + 2] = (noise3(t * 7, s, 7.5, seed) - 0.5) * 2 * amp + (r() - 0.5) * hr * 0.05 * t;
    }
    const I = g.index.array;
    for (let i = 0; i < I.length; i++) index[io + i] = I[i] + vo;
    io += I.length;
    vo += n;
    g.dispose();
    delete L.geo;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aLock", new THREE.BufferAttribute(lockId, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    map: hairTex(yarn ? "yarn" : "silk"),
    roughness: yarn ? 0.9 : 0.46,
    sheen: yarn ? 0.4 : 0.85,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(hex).offsetHSL(0, -0.1, 0.25),
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.userData.part = "hair";
  group.add(mesh);

  // scalp cap
  let cap = null;
  if (locks.length) {
    const capGeo = sphereish(hr, (dir, out) => out.copy(head.surf(dir, 0.0035)).sub(hc), 56, 40);
    filterTris(capGeo, (c) => {
      const d = c.clone().normalize();
      const az = Math.atan2(d.x, d.z);
      const el = Math.asin(clamp(d.y, -1, 1));
      return el > hairlineEl(az, style) - (Math.abs(az) < 0.62 ? 0 : 0.02);
    });
    capGeo.computeVertexNormals();
    capGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(capGeo.attributes.position.count * 3).fill(0.92), 3));
    cap = new THREE.Mesh(capGeo, material);
    cap.position.copy(hc);
    cap.userData.part = "hair";
    cap.userData.cap = true;
    cap.castShadow = true;
    group.add(cap);
  }

  /* -------------------------------------------------------- state update */
  const tint = new THREE.Color();
  function writeLock(i) {
    const L = locks[i];
    const g = L.present ? L.growth : 0;
    const k = L.tangle * (1 - 0.55 * L.wet);
    const shade = 1 - 0.3 * L.tangle - 0.28 * L.wet;
    const cols = L.cols;
    for (let v = L.start; v < L.start + L.count; v++) {
      const o = v * 3;
      pos[o] = base[o] + frz[o] * k;
      pos[o + 1] = base[o + 1] + frz[o + 1] * k;
      pos[o + 2] = base[o + 2] + frz[o + 2] * k;
      col[o] = col[o + 1] = col[o + 2] = shade * (1 - 0.15 * L.tangle * along[v]);
    }
    // growth: rows beyond the grown length collapse onto the last grown ring
    let rc = -1;
    for (let row = 0; row < L.rows; row++) if (along[L.start + row * cols] <= g + 1e-4) rc = row;
    if (rc < L.rows - 1) {
      let cx = L.root.x, cy = L.root.y, cz = L.root.z;
      if (rc >= 0) {
        cx = cy = cz = 0;
        for (let c = 0; c < cols; c++) {
          const o = (L.start + rc * cols + c) * 3;
          cx += pos[o];
          cy += pos[o + 1];
          cz += pos[o + 2];
        }
        cx /= cols;
        cy /= cols;
        cz /= cols;
      }
      for (let row = rc + 1; row < L.rows; row++) for (let c = 0; c < cols; c++) {
        const o = (L.start + row * cols + c) * 3;
        pos[o] = cx;
        pos[o + 1] = cy;
        pos[o + 2] = cz;
      }
    }
  }
  let dirty = false;
  const api = {
    group,
    mesh,
    cap,
    locks,
    material,
    style,
    patches: [],
    lockAt(faceVertex) {
      return lockId[faceVertex] | 0;
    },
    setLock(i, st) {
      const L = locks[i];
      if (!L) return;
      Object.assign(L, st);
      writeLock(i);
      dirty = true;
    },
    flush() {
      if (!dirty) return;
      dirty = false;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      for (const p of api.patches) p.update();
    },
    recolor(h) {
      material.color.set(h);
      material.sheenColor.set(h).offsetHSL(0, -0.1, 0.25);
    },
    /** Bald patches: locks near `centers` (az, el) removed, scalp overlay added. */
    makePatches(centers) {
      const out = [];
      for (const [az, el] of centers) {
        const cd = dirAE(az, el);
        const ids = [];
        locks.forEach((L, i) => {
          const ld = L.root.clone().sub(hc).normalize();
          if (ld.angleTo(cd) < 0.36) ids.push(i);
        });
        if (!ids.length) {
          // nearest lock at least
          let best = 0, bd = 9;
          locks.forEach((L, i) => {
            const a = L.root.clone().sub(hc).normalize().angleTo(cd);
            if (a < bd) {
              bd = a;
              best = i;
            }
          });
          ids.push(best);
        }
        const patch = scalpPatch(head, hc, cd, 0.36, skinHex);
        group.add(patch.mesh);
        const P = { az, el, ids, center: head.surf(cd, 0.004), mesh: patch.mesh, update: () => {
          const g = ids.reduce((s, i) => s + (locks[i].present ? locks[i].growth : 0), 0) / ids.length;
          patch.mesh.material.opacity = clamp(1 - g * 1.1, 0, 1);
          patch.mesh.visible = patch.mesh.material.opacity > 0.01;
        } };
        api.patches.push(P);
        out.push(P);
      }
      return out;
    },
    dispose() {
      geo.dispose();
      material.dispose();
      if (cap) cap.geometry.dispose();
      for (const p of api.patches) {
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
    },
  };
  return api;
}

/** A skin-coloured scalp overlay with rooting holes (bald patch). */
function scalpPatch(head, hc, cd, ang, skinHex) {
  const rings = 6;
  const segs = 16;
  const pos = [];
  const uv = [];
  const idx = [];
  const t1 = new THREE.Vector3().crossVectors(cd, Math.abs(cd.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
  const t2 = new THREE.Vector3().crossVectors(cd, t1).normalize();
  for (let j = 0; j <= rings; j++) {
    const a = (j / rings) * ang;
    for (let i = 0; i <= segs; i++) {
      const b = (i / segs) * Math.PI * 2;
      const d = cd.clone().multiplyScalar(Math.cos(a)).addScaledVector(t1, Math.sin(a) * Math.cos(b)).addScaledVector(t2, Math.sin(a) * Math.sin(b)).normalize();
      const p = head.surf(d, 0.0052);
      pos.push(p.x, p.y, p.z);
      uv.push(0.5 + (Math.sin(a) / Math.sin(ang)) * 0.5 * Math.cos(b), 0.5 + (Math.sin(a) / Math.sin(ang)) * 0.5 * Math.sin(b));
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i;
    const b = a + 1;
    const c = a + segs + 1;
    const d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinHex), map: patchTex(), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.part = "scalp";
  mesh.renderOrder = 2;
  return { mesh };
}

let _patchTex = null;
function patchTex() {
  if (typeof document === "undefined") return null;
  if (_patchTex) return _patchTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.75, "rgba(255,255,255,0.95)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(90,60,50,0.55)";
  for (let y = 14; y < 120; y += 11) for (let x = 14 + ((y / 11) % 2) * 5; x < 120; x += 11) {
    if (Math.hypot(x - 64, y - 64) > 46) continue;
    g.beginPath();
    g.arc(x, y, 1.6, 0, Math.PI * 2);
    g.fill();
  }
  _patchTex = new THREE.CanvasTexture(c);
  _patchTex.colorSpace = THREE.SRGBColorSpace;
  return _patchTex;
}
