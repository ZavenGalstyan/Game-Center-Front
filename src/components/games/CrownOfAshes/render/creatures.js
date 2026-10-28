/**
 * Procedural creatures (no external models): wolves, deer and the dragon.
 * Each is a small hierarchy of shaded primitives animated in code —
 * trotting/galloping gaits from speed, crouch-and-lunge attacks, howls,
 * deaths — and, for Vaelith, a membrane wing mesh rebuilt every frame from
 * the wing bones so the flaps fold and spread properly.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { surface } from "./textures.js";

/* ================================================================ shared */
function furMaterial(color, rough = 0.95) {
  const s = surface("hide");
  const m = new THREE.MeshStandardMaterial({ color, map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: rough, metalness: 0 });
  m.userData.u = { uHit: { value: 0 }, uDissolve: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vOP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvOP = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vOP; uniform float uHit; uniform float uDissolve;\nfloat fh(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }")
      .replace("#include <map_fragment>", "#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.3, 0.25), uHit * 0.55);\n  if (uDissolve > 0.0 && fh(vOP * 30.0) < uDissolve) discard;");
  };
  m.customProgramCacheKey = () => "coa-fur";
  return m;
}
const cap = (r, len, seg = 10) => {
  const g = new THREE.CapsuleGeometry(r, len, 4, seg);
  return g;
};
function mesh(g, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/* ================================================================ quadrupeds */
function buildQuadruped(o) {
  const root = new THREE.Group();
  const body = pivot(root, 0, o.hipH, 0);
  const fur = furMaterial(o.color);
  const dark = furMaterial(o.dark || "#2a2420");
  const belly = furMaterial(o.belly || o.color);
  const mats = [fur, dark, belly];
  // torso
  mesh(cap(o.bodyR, o.bodyL, 12), fur, body, 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 1);
  mesh(new THREE.SphereGeometry(o.bodyR * 1.12, 14, 10), fur, body, 0, o.bodyR * 0.1, o.bodyL * 0.42, 0, 0, 0, 1, 1.05, 1.1);
  mesh(new THREE.SphereGeometry(o.bodyR * 0.95, 12, 8), belly, body, 0, -o.bodyR * 0.25, 0.05, 0, 0, 0, 0.85, 0.7, 1.6);
  // neck + head
  const neck = pivot(body, 0, o.bodyR * 0.45, o.bodyL * 0.55);
  mesh(cap(o.bodyR * 0.55, o.neckL, 10), fur, neck, 0, o.neckL * 0.35, o.neckL * 0.35, -0.75, 0, 0);
  const head = pivot(neck, 0, o.neckL * 0.75, o.neckL * 0.7);
  mesh(new THREE.SphereGeometry(o.headR, 14, 10), fur, head, 0, 0, 0, 0, 0, 0, 0.95, 0.9, 1.05);
  const snout = mesh(new THREE.ConeGeometry(o.headR * 0.55, o.snoutL, 10), fur, head, 0, -o.headR * 0.18, o.headR * 0.6 + o.snoutL * 0.45, Math.PI / 2, 0, 0, 1, 1, 0.8);
  mesh(new THREE.SphereGeometry(o.headR * 0.16, 8, 6), dark, head, 0, -o.headR * 0.12, o.headR * 0.62 + o.snoutL * 0.92);
  const jaw = pivot(head, 0, -o.headR * 0.45, o.headR * 0.3);
  mesh(new THREE.ConeGeometry(o.headR * 0.42, o.snoutL * 0.85, 8), belly, jaw, 0, 0, o.snoutL * 0.42, Math.PI / 2, 0, 0, 1, 0.5, 1);
  for (const s of [-1, 1]) {
    mesh(new THREE.ConeGeometry(o.headR * 0.32, o.earL, 6), dark, head, s * o.headR * 0.5, o.headR * 0.8, -o.headR * 0.1, -0.2, 0, s * -0.25);
    const eye = mesh(new THREE.SphereGeometry(o.headR * 0.1, 6, 4), new THREE.MeshStandardMaterial({ color: o.eye || "#e8c040", emissive: o.eye || "#e8c040", emissiveIntensity: o.eyeGlow || 0.4 }), head, s * o.headR * 0.42, o.headR * 0.18, o.headR * 0.72);
    mats.push(eye.material);
  }
  if (o.antlers) {
    for (const s of [-1, 1]) {
      const a = pivot(head, s * o.headR * 0.35, o.headR * 0.85, -o.headR * 0.1);
      a.rotation.z = s * -0.5;
      const bone = new THREE.MeshStandardMaterial({ color: "#d8c8a8", roughness: 0.8 });
      mats.push(bone);
      mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.6, 5), bone, a, 0, 0.3, 0);
      mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.35, 5), bone, a, 0, 0.45, 0.12, 0.8, 0, 0);
      mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.32, 5), bone, a, s * 0.1, 0.62, 0, 0, 0, s * -0.7);
    }
  }
  // tail
  const tail = pivot(body, 0, o.bodyR * 0.4, -o.bodyL * 0.55);
  const tailSeg = [];
  let tp = tail;
  for (let i = 0; i < 2; i++) {
    const seg = pivot(tp, 0, 0, i === 0 ? 0 : -o.tailL / 2);
    mesh(cap(o.tailR * (1 - i * 0.3), o.tailL / 2, 8), i ? dark : fur, seg, 0, 0, -o.tailL / 4, Math.PI / 2, 0, 0);
    tailSeg.push(seg);
    tp = seg;
  }
  tail.rotation.x = o.tailUp ?? -0.6;
  // legs: [x, z] at hips/shoulders
  const legs = [];
  for (const [sx, sz, front] of [
    [-1, 1, true],
    [1, 1, true],
    [-1, -1, false],
    [1, -1, false],
  ]) {
    const hip = pivot(body, sx * o.bodyR * 0.62, -o.bodyR * 0.15, sz * o.bodyL * 0.4);
    const up = mesh(cap(o.legR, o.upL * 0.75, 8), fur, hip, 0, -o.upL / 2, 0);
    void up;
    const knee = pivot(hip, 0, -o.upL, 0);
    mesh(cap(o.legR * 0.7, o.loL * 0.8, 8), front ? fur : fur, knee, 0, -o.loL / 2, 0);
    mesh(new THREE.SphereGeometry(o.legR * 1.05, 8, 6), dark, knee, 0, -o.loL, 0.03, 0, 0, 0, 1, 0.6, 1.4);
    legs.push({ hip, knee, front, side: sx });
  }
  root.traverse((x) => x.isMesh && (x.castShadow = true));
  return { root, body, neck, head, jaw, tail, tailSeg, legs, mats, snout };
}

export function createWolf(o = {}) {
  const s = o.scale || 1;
  const Q = buildQuadruped({ hipH: 0.72, bodyR: 0.27, bodyL: 0.8, neckL: 0.32, headR: 0.2, snoutL: 0.28, earL: 0.16, tailR: 0.08, tailL: 0.62, legR: 0.07, upL: 0.36, loL: 0.36, color: o.snow ? "#d8dce0" : o.alpha ? "#8a8a88" : "#6a6258", dark: o.snow ? "#9aa0a8" : "#2e2a26", belly: o.snow ? "#eef0f2" : "#a09a90", eye: o.alpha ? "#ff6a2a" : "#e8c040", eyeGlow: o.alpha ? 2 : 0.5, tailUp: -0.4 });
  Q.root.scale.setScalar(s);
  let phase = Math.random() * 6;
  return {
    root: Q.root,
    kind: "wolf",
    mats: Q.mats,
    update(dt, st) {
      const sp = st.speed || 0;
      const run = sp > 3.5;
      phase += dt * (run ? 11 : 6.5) * Math.max(0.35, Math.min(1.6, sp / (run ? 7 : 2)));
      const stride = sp > 0.2 ? (run ? 0.85 : 0.5) : 0;
      Q.legs.forEach((L, i) => {
        // trot: diagonal pairs; gallop: front pair then back pair
        const off = run ? (L.front ? 0 : Math.PI) + (L.side > 0 ? 0.35 : 0) : (i === 0 || i === 3 ? 0 : Math.PI);
        const a = Math.sin(phase + off);
        L.hip.rotation.x = a * stride;
        L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.cos(phase + off)) * stride * 0.9;
      });
      Q.body.position.y = 0.72 + (sp > 0.2 ? Math.abs(Math.sin(phase)) * (run ? 0.07 : 0.03) : 0);
      Q.body.rotation.x = run ? Math.sin(phase * 2) * 0.05 : 0;
      // states
      let crouch = 0;
      let lunge = 0;
      let headUp = 0;
      if (st.windup) crouch = Math.min(1, st.windupK * 1.5);
      if (st.lunging) lunge = 1;
      if (st.howl) headUp = 1;
      Q.body.position.y -= crouch * 0.18;
      Q.body.rotation.x += -crouch * 0.12 + lunge * 0.22;
      Q.neck.rotation.x = -crouch * 0.4 + headUp * -0.9 + lunge * -0.2;
      Q.jaw.rotation.x = st.windup || st.lunging || st.howl ? 0.5 : 0.05 + Math.sin(phase * 0.5) * 0.03;
      Q.tail.rotation.x = -0.4 + crouch * 0.5 - (run ? 0.3 : 0) + Math.sin(phase) * 0.15;
      Q.tail.rotation.y = Math.sin(phase * 0.8) * 0.25;
      if (st.dead) {
        Q.root.rotation.z = Math.min(Math.PI / 2, (st.deadT || 0) * 4) * 0.95;
        Q.root.position.y = -0.25 * Math.min(1, (st.deadT || 0) * 3);
        Q.legs.forEach((L) => (L.hip.rotation.x = 0.3));
      } else {
        Q.root.rotation.z = 0;
        Q.root.position.y = 0;
      }
      for (const m of Q.mats) if (m.userData.u) {
        m.userData.u.uHit.value = st.hit || 0;
        m.userData.u.uDissolve.value = st.dissolve || 0;
      }
    },
    dispose() {
      Q.root.traverse((x) => x.isMesh && x.geometry.dispose());
      Q.mats.forEach((m) => m.dispose());
    },
  };
}

export function createDeer() {
  const Q = buildQuadruped({ hipH: 0.95, bodyR: 0.24, bodyL: 0.85, neckL: 0.55, headR: 0.15, snoutL: 0.24, earL: 0.18, tailR: 0.06, tailL: 0.18, legR: 0.045, upL: 0.48, loL: 0.48, color: "#8a5a34", dark: "#3a2414", belly: "#e8dcc8", eye: "#1a1410", antlers: true, tailUp: 0.4 });
  let phase = Math.random() * 6;
  return {
    root: Q.root,
    kind: "deer",
    mats: Q.mats,
    update(dt, st) {
      const sp = st.speed || 0;
      const run = sp > 3;
      phase += dt * (run ? 9 : 5) * Math.max(0.4, Math.min(1.5, sp / (run ? 8 : 1.4)));
      const stride = sp > 0.2 ? (run ? 0.9 : 0.4) : 0;
      Q.legs.forEach((L) => {
        const off = run ? (L.front ? 0 : 2.4) : L.front === L.side > 0 ? 0 : Math.PI;
        L.hip.rotation.x = Math.sin(phase + off) * stride;
        L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.cos(phase + off)) * stride;
      });
      Q.body.position.y = 0.95 + (run ? Math.abs(Math.sin(phase)) * 0.18 : 0);
      // graze: head to the ground
      const graze = st.graze ? 1 : 0;
      Q.neck.rotation.x = graze * 1.1 + (run ? -0.2 : 0);
      if (st.dead) {
        Q.root.rotation.z = Math.min(Math.PI / 2, (st.deadT || 0) * 4) * 0.95;
        Q.root.position.y = -0.3 * Math.min(1, (st.deadT || 0) * 3);
      }
      for (const m of Q.mats) if (m.userData.u) {
        m.userData.u.uHit.value = st.hit || 0;
        m.userData.u.uDissolve.value = st.dissolve || 0;
      }
    },
    dispose() {
      Q.root.traverse((x) => x.isMesh && x.geometry.dispose());
      Q.mats.forEach((m) => m.dispose());
    },
  };
}

/* ================================================================ dragon */
function scaleMaterial() {
  const s = surface("rock");
  const m = new THREE.MeshStandardMaterial({ color: "#3a2a2a", map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.55, metalness: 0.25 });
  const u = { uHit: { value: 0 }, uGlow: { value: 0.4 }, uTime: { value: 0 }, uDissolve: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vOP; varying vec3 vON;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvOP = position; vON = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vOP; varying vec3 vON; uniform float uHit; uniform float uGlow; uniform float uTime; uniform float uDissolve; float glowM = 0.0;
float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float dn(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(dh(i), dh(i+vec3(1,0,0)), f.x), mix(dh(i+vec3(0,1,0)), dh(i+vec3(1,1,0)), f.x), f.y), mix(mix(dh(i+vec3(0,0,1)), dh(i+vec3(1,0,1)), f.x), mix(dh(i+vec3(0,1,1)), dh(i+vec3(1,1,1)), f.x), f.y), f.z); }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    // overlapping scale cells
    vec3 q = vOP * 3.2;
    float cell = fract(q.x + floor(q.y) * 0.5);
    float sc = smoothstep(0.0, 0.25, cell) * smoothstep(1.0, 0.75, cell) * smoothstep(0.0, 0.3, fract(q.y));
    diffuseColor.rgb *= 0.65 + 0.45 * sc;
    // pale underbelly
    float under = smoothstep(0.1, -0.6, vON.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.42, 0.32) * (0.8 + 0.3 * sc), under * 0.7);
    // ember veins
    float v = dn(vOP * 1.4 + vec3(0.0, uTime * 0.15, 0.0));
    glowM = smoothstep(0.47, 0.5, v) * smoothstep(0.53, 0.5, v) * (0.4 + under);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.3, 0.25), uHit * 0.5);
    if (uDissolve > 0.0 && dn(vOP * 4.0) < uDissolve) discard;
  }`
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.35, 0.08) * glowM * uGlow * (0.8 + 0.2 * sin(uTime * 3.0));");
  };
  m.customProgramCacheKey = () => "coa-dragon";
  return m;
}

export function createDragonModel() {
  const root = new THREE.Group();
  const scale = scaleMaterial();
  const horn = new THREE.MeshStandardMaterial({ color: "#1a1416", roughness: 0.35, metalness: 0.2 });
  const eyeM = new THREE.MeshStandardMaterial({ color: "#ffb040", emissive: "#ff8a20", emissiveIntensity: 3 });
  const membrane = new THREE.MeshStandardMaterial({ color: "#5a2420", roughness: 0.7, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.97 });
  membrane.userData.u = { uHit: { value: 0 } };
  const mouthM = new THREE.MeshStandardMaterial({ color: "#3a0806", emissive: "#ff5a10", emissiveIntensity: 0.6 });
  const mats = [scale, horn, eyeM, membrane, mouthM];
  const body = pivot(root, 0, 3.2, 0);
  // torso: chest + belly + hips
  mesh(new THREE.SphereGeometry(2.4, 24, 16), scale, body, 0, 0.3, 1.2, 0, 0, 0, 1.0, 0.95, 1.3);
  mesh(new THREE.SphereGeometry(2.2, 22, 14), scale, body, 0, 0, -1.6, 0, 0, 0, 0.95, 0.9, 1.4);
  // spine spikes
  for (let k = 0; k < 9; k++) mesh(new THREE.ConeGeometry(0.22, 0.9 - k * 0.04, 6), horn, body, 0, 2.3 - Math.abs(k - 3) * 0.12, 2.6 - k * 0.75, -0.35, 0, 0);
  // neck chain → head
  const neckSegs = [];
  let parent = pivot(body, 0, 1.0, 3.6);
  const neckBase = parent;
  for (let i = 0; i < 5; i++) {
    const seg = pivot(parent, 0, 0, i === 0 ? 0 : 1.0);
    mesh(new THREE.SphereGeometry(0.95 - i * 0.1, 14, 10), scale, seg, 0, 0, 0.5, 0, 0, 0, 1, 1, 1.25);
    mesh(new THREE.ConeGeometry(0.15, 0.6, 5), horn, seg, 0, 0.85 - i * 0.08, 0.4, -0.5, 0, 0);
    neckSegs.push(seg);
    parent = seg;
  }
  const head = pivot(parent, 0, 0.1, 1.3);
  mesh(new THREE.BoxGeometry(1.25, 0.95, 1.9, 2, 2, 2), scale, head, 0, 0.1, 0.3);
  mesh(new THREE.ConeGeometry(0.62, 1.6, 8), scale, head, 0, 0.0, 1.85, Math.PI / 2, Math.PI / 8, 0, 1, 1, 0.7);
  const jaw = pivot(head, 0, -0.35, -0.2);
  mesh(new THREE.BoxGeometry(1.0, 0.3, 2.4), scale, jaw, 0, -0.1, 1.3);
  mesh(new THREE.BoxGeometry(0.9, 0.08, 2.2), mouthM, jaw, 0, 0.06, 1.3);
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.06, 0.25, 4), horn, jaw, s * 0.4, 0.15, 0.4 + k * 0.35, 0, 0, 0);
  for (const s of [-1, 1]) {
    const h1 = pivot(head, s * 0.45, 0.5, -0.4);
    h1.rotation.set(-0.9, 0, s * -0.25);
    mesh(new THREE.ConeGeometry(0.2, 1.8, 7), horn, h1, 0, 0.9, 0);
    mesh(new THREE.ConeGeometry(0.1, 0.8, 5), horn, head, s * 0.66, 0.0, 0.2, -0.2, 0, s * -1.1);
    mesh(new THREE.SphereGeometry(0.13, 8, 6), eyeM, head, s * 0.5, 0.32, 0.75);
  }
  // tail chain
  const tailSegs = [];
  parent = pivot(body, 0, 0.2, -3.8);
  const tailBase = parent;
  for (let i = 0; i < 9; i++) {
    const seg = pivot(parent, 0, 0, i === 0 ? 0 : -1.05);
    const r = 1.1 * (1 - i / 10);
    mesh(new THREE.SphereGeometry(r, 12, 8), scale, seg, 0, 0, -0.5, 0, 0, 0, 1, 0.85, 1.35);
    mesh(new THREE.ConeGeometry(0.12 * (1 - i / 12), 0.5, 5), horn, seg, 0, r * 0.85, -0.5, -0.6, 0, 0);
    tailSegs.push(seg);
    parent = seg;
  }
  mesh(new THREE.ConeGeometry(0.5, 1.2, 4), horn, parent, 0, 0, -1.4, -Math.PI / 2, 0, 0, 1, 0.3, 1);
  // legs
  const legs = [];
  for (const [sx, sz, front] of [
    [-1, 1.6, true],
    [1, 1.6, true],
    [-1, -2.2, false],
    [1, -2.2, false],
  ]) {
    const hip = pivot(body, sx * 1.8, -0.4, sz);
    mesh(cap(0.55, 1.4, 10), scale, hip, 0, -0.9, 0);
    const knee = pivot(hip, 0, -1.8, 0.1);
    mesh(cap(0.38, 1.1, 8), scale, knee, 0, -0.7, 0);
    const foot = pivot(knee, 0, -1.35, 0.2);
    mesh(new THREE.SphereGeometry(0.5, 10, 6), scale, foot, 0, 0, 0.15, 0, 0, 0, 1, 0.45, 1.5);
    for (let c = -1; c <= 1; c++) mesh(new THREE.ConeGeometry(0.08, 0.45, 5), horn, foot, c * 0.25, -0.05, 0.75, Math.PI / 2, 0, 0);
    legs.push({ hip, knee, foot, front, side: sx });
  }
  // wings: shoulder → elbow → wrist → 4 finger tips; membrane rebuilt per frame
  const wings = [];
  for (const s of [-1, 1]) {
    const shoulder = pivot(body, s * 1.6, 1.6, 1.4);
    const upper = pivot(shoulder, 0, 0, 0);
    mesh(cap(0.25, 3.2, 8), scale, upper, s * 1.8, 0, 0, 0, 0, Math.PI / 2);
    const elbow = pivot(upper, s * 3.6, 0, 0);
    mesh(cap(0.18, 3.8, 8), scale, elbow, s * 2.0, 0, 0, 0, 0, Math.PI / 2);
    const wrist = pivot(elbow, s * 4.2, 0, 0);
    mesh(new THREE.ConeGeometry(0.25, 0.7, 5), horn, wrist, s * 0.1, 0.3, 0.2, 0, 0, s * 0.3);
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const fg = pivot(wrist, 0, 0, 0);
      const len = [6.5, 6.0, 5.2, 4.0][f];
      const ang = [-0.15, -0.6, -1.05, -1.45][f];
      fg.rotation.y = s > 0 ? -ang - Math.PI / 2 + Math.PI / 2 : ang;
      const tipObj = pivot(fg, s * len, 0, 0);
      mesh(cap(0.08, len - 0.2, 6), horn, fg, s * len * 0.5, 0, 0, 0, 0, Math.PI / 2);
      fingers.push({ fg, tip: tipObj, ang, len });
    }
    // membrane mesh in body space
    const geo = new THREE.BufferGeometry();
    const N = 7; // shoulder, elbow, wrist, 4 tips + body anchors
    const pos = new Float32Array(3 * 3 * 7);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mem = new THREE.Mesh(geo, membrane);
    mem.castShadow = true;
    mem.frustumCulled = false;
    body.add(mem);
    wings.push({ s, shoulder, upper, elbow, wrist, fingers, mem, geo, N });
  }
  root.traverse((x) => x.isMesh && (x.castShadow = true));
  const tmp = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  function rebuildMembrane(w) {
    body.updateMatrixWorld(true);
    inv.copy(body.matrixWorld).invert();
    const P = (o) => o.getWorldPosition(tmp).applyMatrix4(inv).clone();
    const sh = P(w.shoulder);
    const el = P(w.elbow);
    const wr = P(w.wrist);
    const tips = w.fingers.map((f) => P(f.tip));
    const hip = new THREE.Vector3(w.s * 1.3, 0.6, -3.2);
    // fan of triangles: shoulder-elbow-tip0, elbow-wrist-tip0, then wrist fans to tips, last tip back to the hip
    const tris = [
      [sh, el, tips[0]],
      [el, wr, tips[0]],
      [wr, tips[0], tips[1]],
      [wr, tips[1], tips[2]],
      [wr, tips[2], tips[3]],
      [wr, tips[3], hip],
      [sh, wr, hip],
    ];
    const a = w.geo.attributes.position.array;
    let k = 0;
    for (const t of tris) for (const v of t) {
      a[k++] = v.x;
      a[k++] = v.y;
      a[k++] = v.z;
    }
    w.geo.attributes.position.needsUpdate = true;
    w.geo.computeVertexNormals();
    w.geo.computeBoundingSphere();
  }

  let walk = 0;
  let flapT = 0;
  return {
    root,
    kind: "dragon",
    mats,
    head,
    jaw,
    headWorld(out) {
      return jaw.getWorldPosition(out);
    },
    update(dt, st) {
      // st: {speed, flying, flap, neck, tail, jaw, breath, down, roar, phase, hit, dissolve, t}
      walk += dt * Math.min(1.5, (st.speed || 0) / 3);
      flapT += dt * (st.flying ? 2.6 : 0.5);
      const fl = st.flying ? 1 : 0;
      // body pose
      body.position.y = 3.2 - (st.down ? 1.6 : 0) + (fl ? Math.sin(flapT * 2) * 0.35 : Math.abs(Math.sin(walk * 3)) * 0.08);
      body.rotation.x = fl ? -0.08 : st.down ? 0.12 : 0;
      body.rotation.z = st.down ? 0.35 : fl ? Math.sin(flapT) * 0.05 : 0;
      // neck: idle sway, breath aim, bite strike
      const sway = Math.sin((st.t || 0) * 0.9) * 0.08;
      neckBase.rotation.x = -0.45 - (st.neck || 0) * 0.25 + (st.down ? 0.8 : 0) + (st.roar ? -0.4 : 0) + (st.breath ? 0.15 : 0);
      neckSegs.forEach((s, i) => {
        s.rotation.x = 0.06 + (st.down ? 0.12 : 0) - (st.roar ? 0.08 : 0) + (st.breath ? 0.05 : 0);
        s.rotation.y = sway * (i + 1) * 0.4;
      });
      head.rotation.x = 0.35 + (st.breath ? -0.3 : 0) + (st.roar ? -0.4 : 0) + (st.down ? 0.4 : 0);
      jaw.rotation.x = st.breath || st.roar ? 0.55 : (st.jaw || 0) * 0.6 + 0.05;
      // tail
      tailBase.rotation.x = 0.15 + (fl ? 0.1 : 0);
      tailSegs.forEach((s, i) => {
        s.rotation.y = Math.sin((st.t || 0) * 1.3 - i * 0.5) * 0.08 + (st.tail || 0) * 0.18 * Math.sin(i * 0.3 + 1);
        s.rotation.x = fl ? 0.02 : -0.04;
      });
      // legs: walk cycle on the ground, tucked in flight
      legs.forEach((L, i) => {
        if (fl) {
          L.hip.rotation.x = L.front ? 0.9 : -0.7;
          L.knee.rotation.x = L.front ? -1.2 : 1.3;
        } else {
          const off = i === 0 || i === 3 ? 0 : Math.PI;
          const a = Math.sin(walk * 3 + off) * Math.min(1, (st.speed || 0) / 3) * 0.5;
          L.hip.rotation.x = a + (st.down ? (L.front ? -0.6 : 0.6) : 0);
          L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.cos(walk * 3 + off)) * 0.4 * Math.min(1, (st.speed || 0) / 3);
        }
      });
      // wings: folded on the ground, flapping aloft, spread when roaring
      for (const w of wings) {
        const s = w.s;
        const spread = fl ? 1 : st.roar ? 0.8 : st.down ? 0.5 : 0.05;
        const flap = fl ? Math.sin(flapT * 2) : 0;
        w.shoulder.rotation.set(0, s * (0.3 - spread * 0.2), s * (-0.25 + flap * 0.65 + (1 - spread) * 0.6));
        w.upper.rotation.set(0, s * (-1.0 + spread * 0.9), 0);
        w.elbow.rotation.set(0, s * (2.2 - spread * 1.9), s * flap * 0.25);
        w.wrist.rotation.set(0, s * (-1.6 + spread * 1.4), 0);
        for (const f of w.fingers) f.fg.rotation.set(0, s > 0 ? -(f.ang * (0.3 + spread * 0.7)) : f.ang * (0.3 + spread * 0.7), 0);
        rebuildMembrane(w);
      }
      const u = scale.userData.u;
      u.uHit.value = st.hit || 0;
      u.uGlow.value = 0.4 + (st.phase || 1) * 0.35 + (st.breath ? 0.6 : 0);
      u.uTime.value = st.t || 0;
      u.uDissolve.value = st.dissolve || 0;
      mouthM.emissiveIntensity = st.breath ? 4 : st.roar ? 2 : 0.6;
    },
    dispose() {
      root.traverse((x) => x.isMesh && x.geometry.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

export { mergeGeometries };
