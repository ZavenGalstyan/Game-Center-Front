/**
 * Water: the Silverrun as a ribbon following the carved channel (its UVs run
 * downstream so the ripple normal map flows with the current) and the lakes
 * as discs. Low roughness + the sky environment gives sky reflections; the
 * frozen pond uses an icy matte material instead.
 */
import * as THREE from "three";
import { surface } from "./textures.js";

export function createWater(scene, T, shared) {
  const group = new THREE.Group();
  group.name = "water";
  const rip = surface("ripple", 256);
  const nm = rip.normalMap.clone();
  nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  nm.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#2d5560"), roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.86, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.2 });
  const u = { uTime: shared.time };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <normal_fragment_maps>", "vec3 mapN = texture2D(normalMap, vNormalMapUv + vec2(0.0, -uTime * 0.12)).xyz * 2.0 - 1.0;\nvec3 mapN2 = texture2D(normalMap, vNormalMapUv * 0.37 + vec2(uTime * 0.03, -uTime * 0.05)).xyz * 2.0 - 1.0;\nmapN = normalize(mapN + mapN2);\nmapN.xy *= normalScale;\nnormal = normalize(tbn * mapN);");
  };
  // river ribbon
  const pts = T.river.pts;
  const pos = [];
  const uv = [];
  const idx = [];
  let s = 0;
  const half = T.river.w / 2 + 2.2;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const y = pts[i][2];
    pos.push(pts[i][0] - dz * half, y, pts[i][1] + dx * half, pts[i][0] + dz * half, y, pts[i][1] - dx * half);
    uv.push(0, s / 8, half / 4, s / 8);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals point up whichever way the strip winds
  const n = g.attributes.normal;
  let flip = false;
  if (n.getY(0) < 0) flip = true;
  if (flip) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  g.computeTangents?.();
  const river = new THREE.Mesh(g, mat);
  river.receiveShadow = true;
  river.renderOrder = 2;
  group.add(river);
  // lakes
  const ice = new THREE.MeshStandardMaterial({ color: new THREE.Color("#cfe2ee"), roughness: 0.25, metalness: 0.05, envMapIntensity: 0.8 });
  for (const L of T.lakes) {
    const lg = new THREE.CircleGeometry(L.r + 4, 48);
    lg.rotateX(-Math.PI / 2);
    const p = lg.attributes.position;
    const uvs = lg.attributes.uv;
    for (let i = 0; i < p.count; i++) uvs.setXY(i, p.getX(i) / 6, p.getZ(i) / 6);
    const m = new THREE.Mesh(lg, L.frozen ? ice : mat);
    m.position.set(L.x, L.surf + (L.frozen ? 0.05 : 0), L.z);
    m.receiveShadow = true;
    m.renderOrder = 2;
    group.add(m);
  }
  scene.add(group);
  return {
    group,
    update(interior) {
      group.visible = !interior;
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => o.geometry?.dispose());
      mat.dispose();
      ice.dispose();
      nm.dispose();
    },
  };
}
