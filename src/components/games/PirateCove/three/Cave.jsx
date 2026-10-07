/**
 * Pirate Cove — cave interior mesh from the engine's cave SDF:
 *   floor + ceiling   grid cells inside the SDF, heights from caveFloor/caveCeil
 *   walls             marching-squares contour of SDF = 0, extruded floor→ceiling,
 *                     noise-displaced and flat-shaded so it reads as rock
 * Same SDF as the collision, so what you see is what blocks you.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { caveSDF, caveFloor, caveCeil } from "../engine/cave.js";
import { fbm } from "../engine/rng.js";
import { M } from "./materials.js";
import { PropMesh } from "./Props.jsx";

const CELL = 0.6;

function buildCave(C) {
  const b = C.bounds;
  const nx = Math.ceil((b.maxX - b.minX) / CELL) + 1;
  const nz = Math.ceil((b.maxZ - b.minZ) / CELL) + 1;
  const ox = C.origin.x;
  const oz = C.origin.z;
  const sdf = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) sdf[j * nx + i] = caveSDF(C, b.minX + i * CELL, b.minZ + j * CELL);
  const at = (i, j) => sdf[j * nx + i];

  // ---- floor + ceiling
  const fp = [];
  const fc = [];
  const cp = [];
  const col = new THREE.Color();
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const m = Math.min(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
      if (m > 0.9) continue;
      const corners = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ].map(([a, c]) => {
        const lx = b.minX + a * CELL;
        const lz = b.minZ + c * CELL;
        return { lx, lz, f: caveFloor(C, lx, lz) - 0.02, c: caveCeil(C, lx, lz) };
      });
      const tri = [0, 2, 1, 0, 3, 2]; // counter-clockwise from above → faces up
      for (const k of tri) {
        const q = corners[k];
        fp.push(ox + q.lx, q.f, oz + q.lz);
        const n = fbm(q.lx * 0.3, q.lz * 0.3, C.seed + 21, 2);
        col.set(n > 0.6 ? "#9a8460" : "#6e665a").multiplyScalar(0.85 + n * 0.4);
        fc.push(col.r, col.g, col.b);
      }
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const q = corners[k];
        cp.push(ox + q.lx, q.c, oz + q.lz);
      }
    }
  }
  const floor = new THREE.BufferGeometry();
  floor.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
  floor.setAttribute("color", new THREE.Float32BufferAttribute(fc, 3));
  floor.setAttribute("uv", new THREE.Float32BufferAttribute(fp.filter((_, i) => i % 3 !== 1).map((v) => v * 0.25), 2));
  floor.computeVertexNormals();
  const ceil = new THREE.BufferGeometry();
  ceil.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
  ceil.computeVertexNormals();

  // ---- walls (marching squares on SDF = 0)
  const segs = [];
  const lerpPt = (i0, j0, i1, j1) => {
    const a = at(i0, j0);
    const c = at(i1, j1);
    const t = a / (a - c);
    return [b.minX + (i0 + (i1 - i0) * t) * CELL, b.minZ + (j0 + (j1 - j0) * t) * CELL];
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v0 = at(i, j) < 0 ? 1 : 0;
      const v1 = at(i + 1, j) < 0 ? 2 : 0;
      const v2 = at(i + 1, j + 1) < 0 ? 4 : 0;
      const v3 = at(i, j + 1) < 0 ? 8 : 0;
      const k = v0 | v1 | v2 | v3;
      if (k === 0 || k === 15) continue;
      const e = {
        b: () => lerpPt(i, j, i + 1, j),
        r: () => lerpPt(i + 1, j, i + 1, j + 1),
        t: () => lerpPt(i, j + 1, i + 1, j + 1),
        l: () => lerpPt(i, j, i, j + 1),
      };
      const table = {
        1: [["l", "b"]],
        2: [["b", "r"]],
        3: [["l", "r"]],
        4: [["r", "t"]],
        5: [
          ["l", "t"],
          ["b", "r"],
        ],
        6: [["b", "t"]],
        7: [["l", "t"]],
        8: [["t", "l"]],
        9: [["t", "b"]],
        10: [
          ["t", "r"],
          ["l", "b"],
        ],
        11: [["t", "r"]],
        12: [["r", "l"]],
        13: [["r", "b"]],
        14: [["b", "l"]],
      };
      for (const [a, c] of table[k]) segs.push([e[a](), e[c]()]);
    }
  }
  const wp = [];
  const wc = [];
  const ROWS = 7;
  // displacement varies as much with height as along the wall → lumpy rock, not curtains
  const disp = (lx, y, lz, nxv, nzv) => {
    const n = fbm(lx * 0.32 + y * 0.55, lz * 0.32 + y * 0.48, C.seed + 7, 3) - 0.5;
    const m = fbm(y * 0.9 + lx * 0.1, lz * 0.1 - y * 0.7, C.seed + 13, 2) - 0.5;
    // outward only: rock never intrudes into the space the collision allows
    const k = 0.1 + Math.abs(n * 1.3 + m * 0.8);
    return [lx + nxv * k, y + m * 0.25, lz + nzv * k];
  };
  for (const [p, q] of segs) {
    // outward normal (toward rock = SDF increasing)
    const mx = (p[0] + q[0]) / 2;
    const mz = (p[1] + q[1]) / 2;
    const gx = caveSDF(C, mx + 0.2, mz) - caveSDF(C, mx - 0.2, mz);
    const gz = caveSDF(C, mx, mz + 0.2) - caveSDF(C, mx, mz - 0.2);
    const gl = Math.hypot(gx, gz) || 1;
    const nxv = gx / gl;
    const nzv = gz / gl;
    const f0 = caveFloor(C, p[0], p[1]) - 0.3;
    const f1 = caveFloor(C, q[0], q[1]) - 0.3;
    const c0 = caveCeil(C, p[0], p[1]) + 0.6;
    const c1 = caveCeil(C, q[0], q[1]) + 0.6;
    for (let r = 0; r < ROWS; r++) {
      const ta = r / ROWS;
      const tb = (r + 1) / ROWS;
      // walls lean outward toward the ceiling (dome-ish)
      const lean = (t) => Math.sin(t * Math.PI * 0.5) * 1.2;
      const P = (pt, f, c, t) => disp(pt[0] + nxv * lean(t), f + (c - f) * t, pt[1] + nzv * lean(t), nxv, nzv);
      const a = P(p, f0, c0, ta);
      const bb = P(q, f1, c1, ta);
      const c = P(q, f1, c1, tb);
      const d = P(p, f0, c0, tb);
      // winding so the face points into the cave (−normal)
      const quad = [a, c, bb, a, d, c];
      const cross = (bb[0] - a[0]) * (d[2] - a[2]) - (bb[2] - a[2]) * (d[0] - a[0]);
      const ordered = cross * 1 > 0 ? quad : [a, bb, c, a, c, d];
      for (const v of ordered) {
        wp.push(ox + v[0], v[1], oz + v[2]);
        const n = fbm(v[0] * 0.2, v[2] * 0.2 + v[1] * 0.3, C.seed + 3, 2);
        col.set(n > 0.6 ? "#6a7482" : v[1] < 0.6 ? "#4e463c" : "#6a6054").multiplyScalar(0.8 + n * 0.5);
        wc.push(col.r, col.g, col.b);
      }
    }
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
  walls.setAttribute("color", new THREE.Float32BufferAttribute(wc, 3));
  walls.computeVertexNormals();
  return { floor, ceil, walls };
}

export default function Cave({ isl }) {
  const C = isl.cave;
  const g = useMemo(() => buildCave(C), [C]);
  useEffect(
    () => () => {
      g.floor.dispose();
      g.ceil.dispose();
      g.walls.dispose();
    },
    [g],
  );
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }), []);
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), []);
  const ceilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3a3632", roughness: 1, flatShading: true, side: THREE.DoubleSide }), []);
  useEffect(
    () => () => {
      rockMat.dispose();
      floorMat.dispose();
      ceilMat.dispose();
    },
    [rockMat, floorMat, ceilMat],
  );
  const e = isl.caveEntry;
  return (
    <group>
      <mesh geometry={g.floor} material={floorMat} receiveShadow />
      <mesh geometry={g.ceil} material={ceilMat} />
      <mesh geometry={g.walls} material={rockMat} receiveShadow />
      {C.props.map((p) => (
        <PropMesh key={p.key} p={p} />
      ))}
      {/* daylight falling in at the way out */}
      <mesh position={[e.x, 3, e.z - 2.4]}>
        <cylinderGeometry args={[1.4, 2.4, 6, 12, 1, true]} />
        <meshBasicMaterial color="#bfe0ff" transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} fog={false} />
      </mesh>
      <mesh position={[e.x, 0.05, e.z - 2.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 20]} />
        <meshBasicMaterial color="#cfe6ff" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <pointLight position={[e.x, 3, e.z - 2.4]} color="#9cc4ff" intensity={6} distance={14} decay={1.6} />
      <pointLight position={[C.origin.x + (C.bounds.minX + C.bounds.maxX) / 2, 3, C.origin.z + (C.bounds.minZ + C.bounds.maxZ) / 2]} color="#3a6aa8" intensity={4} distance={40} decay={1} />
    </group>
  );
}
