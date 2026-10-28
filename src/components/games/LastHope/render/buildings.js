/**
 * Last Hope — architecture for one location: wall segments (textured, UVs in
 * world metres, windows with frames), interior floors, roofs (one mesh per
 * building so it can fade out while you're inside), the bunker's rock
 * blocks, fences (picket / rail / chain-link).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { surface, materials } from "./materials.js";
import { builder } from "./models/builder.js";

const UVS = 2.5; // metres per texture repeat

/** A box from (along, up, across) dims with UVs in world units. */
function boxUV(L, h, t) {
  const g = new THREE.BoxGeometry(L, h, t);
  const uv = g.attributes.uv;
  // faces: +x, -x, +y, -y, +z, -z — 4 verts each
  const dims = [
    [t, h],
    [t, h],
    [L, t],
    [L, t],
    [L, h],
    [L, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / UVS, (uv.getY(i) * dims[f][1]) / UVS);
    }
  return g;
}

function place(g, x, y, z, yaw) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

export function createArchitecture(map, quality) {
  const group = new THREE.Group();
  group.name = "architecture";
  const byMat = {};
  const push = (mat, g) => (byMat[mat] = byMat[mat] || []).push(g);
  const W = builder(4001);
  const geos = [];
  const roofs = [];

  // ---------------------------------------------------------------- walls
  for (const w of map.walls) {
    if (w.block) {
      const dx = w.x1 - w.x0;
      const dz = w.z1 - w.z0;
      push("bunker", place(boxUV(dx, w.h, dz), w.x0 + dx / 2, w.h / 2, w.z0 + dz / 2, 0));
      push("rocktop", place(new THREE.BoxGeometry(dx, 0.04, dz), w.x0 + dx / 2, w.h + 0.02, w.z0 + dz / 2, 0));
      continue;
    }
    const L = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    const ux = (w.x1 - w.x0) / L;
    const uz = (w.z1 - w.z0) / L;
    const yaw = Math.atan2(-uz, ux);
    push(w.mat, place(boxUV(L, w.h, w.t), (w.x0 + w.x1) / 2, w.h / 2, (w.z0 + w.z1) / 2, yaw));
    // trim at the top / base
    if (w.mat.startsWith("siding") || w.mat === "brick") {
      W.box("m", "#e8e2d4", [L, 0.14, w.t + 0.06], [0, 0, 0], { post: postOf((w.x0 + w.x1) / 2, w.h - 0.07, (w.z0 + w.z1) / 2, yaw) });
      W.box("m", "#6a665e", [L, 0.3, w.t + 0.04], [0, 0, 0], { post: postOf((w.x0 + w.x1) / 2, 0.15, (w.z0 + w.z1) / 2, yaw) });
    }
    for (const [pos, ww] of w.win || []) {
      const cx = w.x0 + ux * pos;
      const cz = w.z0 + uz * pos;
      const wy = w.mat === "corrugated" ? 3.4 : 1.55;
      const wh = w.mat === "corrugated" ? 0.9 : 1.15;
      const P = postOf(cx, wy, cz, yaw);
      W.box("s", "#22303a", [ww, wh, w.t + 0.04], [0, 0, 0], { post: P, jit: 0.02 });
      W.box("m", "#e8e2d4", [ww + 0.16, 0.1, w.t + 0.12], [0, 0, 0], { post: postOf(cx, wy - wh / 2 - 0.05, cz, yaw) });
      W.box("m", "#e8e2d4", [ww + 0.16, 0.08, w.t + 0.08], [0, 0, 0], { post: postOf(cx, wy + wh / 2 + 0.04, cz, yaw) });
      for (const s of [-1, 1]) {
        const ox = cx + ux * s * (ww / 2 + 0.04);
        const oz = cz + uz * s * (ww / 2 + 0.04);
        W.box("m", "#e8e2d4", [0.08, wh, w.t + 0.08], [0, 0, 0], { post: postOf(ox, wy, oz, yaw) });
      }
      W.box("m", "#e8e2d4", [0.04, wh, w.t + 0.06], [0, 0, 0], { post: P });
    }
  }

  // ---------------------------------------------------------------- floors + roofs
  const FLOOR = { wood: "planks", tile: "tile", concrete: "floorconcrete" };
  map.buildings.forEach((b, i) => {
    const fm = FLOOR[b.floor] || "planks";
    push(fm, place(boxUV(b.w - 0.1, 0.05, b.d - 0.1), b.x, 0.025, b.z, b.yaw));
    const r = roofMesh(b, quality);
    if (r) {
      r.userData.bld = i;
      roofs.push(r);
      group.add(r);
    }
    if (b.sign) {
      // a painted sign over the front
      const fx = b.x + Math.sin(b.yaw) * (b.d / 2 + 0.2);
      const fz = b.z + Math.cos(b.yaw) * (b.d / 2 + 0.2);
      W.box("s", b.kind === "store" ? "#b8302a" : "#2a4a7a", [Math.min(6, b.w * 0.5), 0.9, 0.12], [0, 0, 0], { post: postOf(fx, b.h + 0.6, fz, b.yaw) });
      W.box("e", "#fff1c8", [Math.min(5, b.w * 0.42), 0.18, 0.13], [0, 0, 0], { post: postOf(fx, b.h + 0.65, fz, b.yaw) });
    }
  });

  // ---------------------------------------------------------------- fences
  for (const f of map.fences) fence(W, f);

  // ---------------------------------------------------------------- assemble
  for (const [mat, list] of Object.entries(byMat)) {
    const g = mergeGeometries(list, false);
    list.forEach((q) => q.dispose());
    const material = mat === "rocktop" ? new THREE.MeshStandardMaterial({ color: "#0d0e0f", roughness: 1 }) : surface(mat, quality);
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = mat !== "rocktop";
    mesh.receiveShadow = true;
    mesh.userData.mat = mat;
    group.add(mesh);
    geos.push(g);
    if (mat === "rocktop") mesh.userData.ownMat = true;
  }
  const extra = W.build();
  const M = materials();
  for (const [b, g] of Object.entries(extra)) {
    const mesh = new THREE.Mesh(g, M[b]);
    mesh.castShadow = b !== "g";
    mesh.receiveShadow = true;
    group.add(mesh);
    geos.push(g);
  }
  // chain-link mesh panels
  const chain = chainPanels(map);
  if (chain) group.add(chain);

  return {
    group,
    roofs,
    dispose() {
      geos.forEach((g) => g.dispose());
      for (const r of roofs) {
        r.geometry.dispose();
        r.material.dispose();
      }
      group.traverse((o) => {
        if (o.userData.ownMat) o.material.dispose();
      });
      if (chain) {
        chain.geometry.dispose();
        chain.material.map?.dispose();
        chain.material.dispose();
      }
    },
  };
}

const _pm = new THREE.Matrix4();
function postOf(x, y, z, yaw) {
  return _pm.clone().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
}

function roofMesh(b, quality) {
  const parts = [];
  if (b.roof === "gable") {
    const rh = b.kind === "cabin" ? 1.3 : 1.7;
    const over = 0.45;
    const half = b.d / 2 + over;
    const slope = Math.hypot(half, rh + 0.15);
    const ang = Math.atan2(rh + 0.15, half);
    for (const s of [-1, 1]) {
      const g = boxUV(b.w + over * 2, 0.14, slope);
      g.rotateX(s * ang);
      g.translate(0, b.h + rh / 2 - 0.05, (s * half) / 2);
      parts.push(g);
    }
    // gables (triangles) at both ends
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape([new THREE.Vector2(-b.d / 2, 0), new THREE.Vector2(b.d / 2, 0), new THREE.Vector2(0, rh)]);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false });
      g.translate(0, 0, -0.11);
      g.rotateY(Math.PI / 2);
      g.translate((s * (b.w - 0.1)) / 2, b.h, 0);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / UVS, uv.getY(i) / UVS);
      parts.push(g);
    }
  } else {
    const g = boxUV(b.w + 0.3, 0.28, b.d + 0.3);
    g.translate(0, b.h + 0.14, 0);
    parts.push(g);
    if (b.kind === "warehouse")
      for (let k = -2; k <= 2; k++) {
        const v = boxUV(1.6, 0.5, 1.2);
        v.translate(k * (b.w / 6), b.h + 0.5, 0);
        parts.push(v);
      }
  }
  // gable walls take the roof material too: tidy and cheap
  const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  parts.forEach((p) => p.dispose());
  geo.rotateY(b.yaw);
  geo.translate(b.x, 0, b.z);
  const kind = b.roof === "gable" ? (b.kind === "cabin" ? "shingles" : "shingles") : b.kind === "warehouse" ? "metalroof" : "concrete";
  const mat = surface(kind, quality).clone();
  mat.onBeforeCompile = surface(kind, quality).onBeforeCompile;
  mat.customProgramCacheKey = surface(kind, quality).customProgramCacheKey;
  mat.transparent = true;
  mat.color.set(b.roof === "gable" ? ["#8a6a5a", "#5a6a7a", "#6a5a4a", "#7a5a5a"][b.style % 4] : "#ffffff");
  if (b.kind === "cabin") mat.color.set("#7a6a58");
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.fade = 1;
  return m;
}

function fence(W, f) {
  const L = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
  const ux = (f.x1 - f.x0) / L;
  const uz = (f.z1 - f.z0) / L;
  const yaw = Math.atan2(-uz, ux);
  const P = (t, y) => postOf(f.x0 + ux * t, y, f.z0 + uz * t, yaw);
  if (f.kind === "picket") {
    for (let t = 0; t <= L + 0.01; t += 2.4) W.box("m", "#d8d2c4", [0.1, 1.15, 0.1], [0, 0, 0], { post: P(Math.min(t, L), 0.58) });
    for (let t = 0.1; t < L; t += 0.16) W.box("m", "#e4ded0", [0.09, 0.95, 0.025], [0, 0, 0], { post: P(t, 0.48), jit: 0.05 });
    for (const y of [0.3, 0.8]) W.box("m", "#cfc8b8", [L, 0.07, 0.04], [0, 0, 0], { post: postOf((f.x0 + f.x1) / 2, y, (f.z0 + f.z1) / 2, yaw) });
  } else if (f.kind === "wood") {
    for (let t = 0; t <= L + 0.01; t += 2.5) W.box("m", "#5a4230", [0.14, 1.2, 0.14], [0, 0, 0], { post: P(Math.min(t, L), 0.6) });
    for (const y of [0.45, 0.95]) W.box("m", "#6a4d35", [L, 0.12, 0.06], [0, 0, 0], { post: postOf((f.x0 + f.x1) / 2, y, (f.z0 + f.z1) / 2, yaw) });
  } else {
    for (let t = 0; t <= L + 0.01; t += 3) W.cyl("x", "#7a7e84", [0.045, 0.045, 2.3, 6], [0, 0, 0], { post: P(Math.min(t, L), 1.15) });
    W.cyl("x", "#7a7e84", [0.03, 0.03, L, 6], [0, 0, 0], { post: postOf((f.x0 + f.x1) / 2, 2.25, (f.z0 + f.z1) / 2, yaw).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)) });
  }
}

/** One mesh for every chain-link fence panel (alpha-tested diamond texture). */
function chainPanels(map) {
  const list = map.fences.filter((f) => f.kind === "chain");
  if (!list.length || typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "rgba(170,176,182,1)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(64, 64);
  ctx.moveTo(64, 0);
  ctx.lineTo(0, 64);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const parts = [];
  for (const f of list) {
    const L = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
    const g = new THREE.PlaneGeometry(L, 2.2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * L) / 0.18, (uv.getY(i) * 2.2) / 0.18);
    const yaw = Math.atan2(-(f.z1 - f.z0) / L, (f.x1 - f.x0) / L);
    place(g, (f.x0 + f.x1) / 2, 1.12, (f.z0 + f.z1) / 2, yaw);
    parts.push(g);
  }
  const geo = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, color: "#c8ccd0" });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}
