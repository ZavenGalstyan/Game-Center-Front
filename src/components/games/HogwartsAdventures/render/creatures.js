/**
 * Procedural creatures (all original geometry):
 *   dementor   a tattered, rippling cloak with skeletal hands and a void hood
 *   spider     an eight-legged Acromantula with a procedural gait
 *   book       a cursed book that flaps its covers and snaps
 *   dummy      a straw-and-sack training dummy on a post
 * Each returns { root, update(dt, state), setHit(v), setDissolve(v), dispose() }.
 */
import * as THREE from "three";

const disposeAll = (mats, geos) => {
  mats.forEach((m) => m.dispose());
  geos.forEach((g) => g.dispose());
};

/* ================================================================ dementor */
export function createDementor() {
  const root = new THREE.Group();
  const mats = [];
  const geos = [];
  const cloakMat = new THREE.MeshStandardMaterial({ color: "#0b0b0e", roughness: 1, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.96 });
  const u = { uTime: { value: 0 }, uHit: { value: 0 }, uDis: { value: 0 } };
  cloakMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; varying float vY; varying vec2 vUv2;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vY = position.y; vUv2 = uv;
        float lowK = clamp((1.6 - position.y) / 2.4, 0.0, 1.0);
        transformed.x += sin(uTime * 2.3 + position.y * 3.0 + position.z * 4.0) * 0.12 * lowK;
        transformed.z += cos(uTime * 1.9 + position.y * 2.5 + position.x * 5.0) * 0.14 * lowK;
        transformed.y += sin(uTime * 3.1 + position.x * 7.0) * 0.04 * lowK;`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uHit; uniform float uDis; varying float vY; varying vec2 vUv2;\nfloat dh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        // ragged hem: tear strips out of the bottom
        float strip = floor(vUv2.x * 26.0);
        float tear = dh(vec2(strip, 3.0)) * 0.55 + 0.05;
        if (vY < -0.9 + tear * 1.4 && vUv2.y < 0.5) discard;
        if (dh(floor(vUv2 * vec2(40.0, 24.0))) < uDis) discard;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.18, 0.22), uHit);`
      );
  };
  mats.push(cloakMat);
  // body: a lathe of a hooded robe, wider at the shoulders, open hood
  const pts = [];
  const prof = [[0.02, 2.55], [0.2, 2.5], [0.3, 2.35], [0.34, 2.15], [0.42, 1.95], [0.5, 1.7], [0.46, 1.3], [0.5, 0.8], [0.6, 0.2], [0.72, -0.4], [0.82, -0.95]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y - 0.6));
  const body = new THREE.LatheGeometry(pts, 26);
  geos.push(body);
  const cloak = new THREE.Mesh(body, cloakMat);
  cloak.castShadow = true;
  root.add(cloak);
  // hood void
  const voidMat = new THREE.MeshBasicMaterial({ color: "#000000" });
  mats.push(voidMat);
  const vg = new THREE.SphereGeometry(0.2, 12, 10);
  geos.push(vg);
  const face = new THREE.Mesh(vg, voidMat);
  face.position.set(0, 1.55, 0.14);
  face.scale.set(1, 1.2, 0.5);
  root.add(face);
  // sleeves + skeletal hands
  const handMat = new THREE.MeshStandardMaterial({ color: "#6a6e66", roughness: 0.8 });
  mats.push(handMat);
  const sleeveG = new THREE.ConeGeometry(0.13, 0.75, 10, 1, true);
  const fingerG = new THREE.CylinderGeometry(0.008, 0.014, 0.17, 5);
  geos.push(sleeveG, fingerG);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.42, 1.25, 0.05);
    const sl = new THREE.Mesh(sleeveG, cloakMat);
    sl.rotation.x = Math.PI;
    sl.position.y = -0.3;
    arm.add(sl);
    const hand = new THREE.Group();
    hand.position.y = -0.68;
    for (let k = 0; k < 4; k++) {
      const fg = new THREE.Mesh(fingerG, handMat);
      fg.position.set((k - 1.5) * 0.022, -0.08, 0.02);
      fg.rotation.x = 0.35;
      hand.add(fg);
    }
    arm.add(hand);
    root.add(arm);
    arms.push(arm);
  }
  let t = Math.random() * 10;
  return {
    root,
    update(dt, st) {
      t += dt;
      u.uTime.value = t;
      const reach = st?.anim === "glide" ? 1 : 0.3;
      arms.forEach((a, i) => {
        a.rotation.x = -0.9 * reach - 0.2 + Math.sin(t * 1.7 + i) * 0.15;
        a.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * 1.3 + i * 2) * 0.08);
      });
    },
    setHit(v) {
      u.uHit.value = v;
    },
    setDissolve(v) {
      u.uDis.value = v;
      cloakMat.opacity = 0.96 * (1 - v);
    },
    dispose: () => disposeAll(mats, geos),
  };
}

/* ================================================================ spider */
export function createSpider(scale = 1) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mats = [];
  const geos = [];
  const chitin = new THREE.MeshStandardMaterial({ color: "#1a1612", roughness: 0.55, metalness: 0.15 });
  const hair = new THREE.MeshStandardMaterial({ color: "#2a2018", roughness: 1 });
  const eyeM = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ff2a1a", emissiveIntensity: 2.5 });
  mats.push(chitin, hair, eyeM);
  const abdG = new THREE.SphereGeometry(0.55, 16, 12);
  const thoG = new THREE.SphereGeometry(0.33, 14, 10);
  const segG = new THREE.CylinderGeometry(0.045, 0.035, 1, 6);
  const eyeG = new THREE.SphereGeometry(0.035, 6, 5);
  const fangG = new THREE.ConeGeometry(0.03, 0.16, 5);
  geos.push(abdG, thoG, segG, eyeG, fangG);
  const abd = new THREE.Mesh(abdG, hair);
  abd.scale.set(1, 0.8, 1.2);
  abd.position.set(0, 0.85, -0.6);
  abd.castShadow = true;
  body.add(abd);
  const tho = new THREE.Mesh(thoG, chitin);
  tho.scale.set(1, 0.7, 1.1);
  tho.position.set(0, 0.75, 0.05);
  tho.castShadow = true;
  body.add(tho);
  for (let i = 0; i < 6; i++) {
    const e = new THREE.Mesh(eyeG, eyeM);
    e.position.set((i % 3 - 1) * 0.07, 0.86 + Math.floor(i / 3) * 0.05, 0.36);
    body.add(e);
  }
  const fangs = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(fangG, chitin);
    f.position.set(s * 0.06, 0.62, 0.36);
    f.rotation.x = Math.PI * 0.85;
    body.add(f);
    fangs.push(f);
  }
  // legs: hip → knee (up/out) → foot (down), two segments each
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const k = i % 4;
    const hip = new THREE.Group();
    hip.position.set(side * 0.22, 0.75, 0.22 - k * 0.15);
    const baseYaw = side * (Math.PI / 2) + (k - 1.5) * -0.45 * side;
    hip.rotation.y = baseYaw;
    const upper = new THREE.Mesh(segG, chitin);
    upper.scale.set(1, 0.85, 1);
    upper.position.set(0, 0.3, 0.3);
    upper.rotation.x = Math.PI * 0.3;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.set(0, 0.6, 0.6);
    const lower = new THREE.Mesh(segG, hair);
    lower.scale.set(0.8, 1.15, 0.8);
    lower.position.set(0, -0.45, 0.32);
    lower.rotation.x = -Math.PI * 0.2;
    knee.add(lower);
    hip.add(knee);
    body.add(hip);
    legs.push({ hip, knee, phase: (k % 2 === 0 ? 0 : Math.PI) + (side > 0 ? Math.PI : 0), baseYaw });
  }
  root.scale.setScalar(scale);
  let t = 0;
  return {
    root,
    update(dt, st) {
      const sp = st?.speed || 0;
      t += dt * (2 + sp * 2.2);
      for (const L of legs) {
        const s = Math.sin(t + L.phase);
        L.hip.rotation.y = L.baseYaw + s * 0.28 * Math.min(1, sp / 2);
        L.hip.rotation.x = -Math.max(0, Math.cos(t + L.phase)) * 0.25 * Math.min(1, sp / 2);
      }
      body.position.y = Math.sin(t * 2) * 0.03 * Math.min(1, sp / 2);
      const atk = st?.anim === "windup" ? 1 : st?.anim === "attack" ? -0.6 : 0;
      body.rotation.x = -atk * 0.3;
      fangs.forEach((f, i) => (f.rotation.z = (i ? 1 : -1) * (0.2 + Math.sin(t * 3) * 0.1 + (atk > 0 ? 0.3 : 0))));
    },
    setHit(v) {
      chitin.emissive.setRGB(v * 0.6, v * 0.1, v * 0.05);
      hair.emissive.setRGB(v * 0.5, v * 0.1, v * 0.05);
    },
    setDissolve(v) {
      root.scale.setScalar(scale * (1 - v * 0.3));
      body.rotation.z = v * 2.6;
    },
    dispose: () => disposeAll(mats, geos),
  };
}

/* ================================================================ cursed book */
export function createBook() {
  const root = new THREE.Group();
  const mats = [];
  const geos = [];
  const cover = new THREE.MeshStandardMaterial({ color: "#4a1a14", roughness: 0.7 });
  const pages = new THREE.MeshStandardMaterial({ color: "#e8dcc0", roughness: 0.9 });
  const teeth = new THREE.MeshStandardMaterial({ color: "#f4f0e0", roughness: 0.6 });
  const eye = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ffb020", emissiveIntensity: 2.4 });
  mats.push(cover, pages, teeth, eye);
  const coverG = new THREE.BoxGeometry(0.36, 0.03, 0.48);
  const pageG = new THREE.BoxGeometry(0.33, 0.07, 0.45);
  const toothG = new THREE.ConeGeometry(0.02, 0.06, 4);
  const eyeG = new THREE.SphereGeometry(0.03, 6, 5);
  geos.push(coverG, pageG, toothG, eyeG);
  const spine = new THREE.Group();
  root.add(spine);
  const block = new THREE.Mesh(pageG, pages);
  block.position.set(0.16, 0, 0);
  spine.add(block);
  const top = new THREE.Group();
  const bot = new THREE.Group();
  spine.add(top, bot);
  const tc = new THREE.Mesh(coverG, cover);
  tc.position.set(0.18, 0.05, 0);
  top.add(tc);
  const bc = new THREE.Mesh(coverG, cover);
  bc.position.set(0.18, -0.05, 0);
  bot.add(bc);
  for (let i = 0; i < 6; i++) {
    const a = new THREE.Mesh(toothG, teeth);
    a.position.set(0.34, 0.025, -0.18 + i * 0.07);
    a.rotation.z = Math.PI;
    top.add(a);
    const b = new THREE.Mesh(toothG, teeth);
    b.position.set(0.34, -0.025, -0.15 + i * 0.07);
    bot.add(b);
  }
  for (const z of [-0.08, 0.08]) {
    const e = new THREE.Mesh(eyeG, eye);
    e.position.set(0.28, 0.07, z);
    top.add(e);
  }
  spine.rotation.y = -Math.PI / 2;
  spine.position.x = 0;
  let t = Math.random() * 5;
  return {
    root,
    update(dt, st) {
      t += dt;
      const snap = st?.anim === "attack" ? 1 : st?.anim === "windup" ? 0.2 : 0.55 + Math.sin(t * 9) * 0.35;
      top.rotation.z = snap * 0.55;
      bot.rotation.z = -snap * 0.25;
      spine.position.y = Math.sin(t * 4) * 0.05;
    },
    setHit(v) {
      cover.emissive.setRGB(v * 0.7, v * 0.2, v * 0.1);
    },
    setDissolve(v) {
      root.scale.setScalar(1 - v);
    },
    dispose: () => disposeAll(mats, geos),
  };
}

/* ================================================================ training dummy */
export function createDummy() {
  const root = new THREE.Group();
  const mats = [];
  const geos = [];
  const wood = new THREE.MeshStandardMaterial({ color: "#5a3a20", roughness: 0.85 });
  const sack = new THREE.MeshStandardMaterial({ color: "#b8a070", roughness: 1 });
  const strap = new THREE.MeshStandardMaterial({ color: "#6a2420", roughness: 0.8 });
  mats.push(wood, sack, strap);
  const postG = new THREE.CylinderGeometry(0.06, 0.08, 1.9, 8);
  const bodyG = new THREE.CapsuleGeometry(0.24, 0.5, 4, 10);
  const headG = new THREE.SphereGeometry(0.17, 12, 10);
  const armG = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6);
  const baseG = new THREE.CylinderGeometry(0.35, 0.42, 0.12, 12);
  const beltG = new THREE.TorusGeometry(0.25, 0.03, 5, 16);
  geos.push(postG, bodyG, headG, armG, baseG, beltG);
  const swing = new THREE.Group();
  root.add(swing);
  const base = new THREE.Mesh(baseG, wood);
  base.position.y = 0.06;
  root.add(base);
  const post = new THREE.Mesh(postG, wood);
  post.position.y = 0.95;
  swing.add(post);
  const b = new THREE.Mesh(bodyG, sack);
  b.position.y = 1.15;
  b.castShadow = true;
  swing.add(b);
  const h = new THREE.Mesh(headG, sack);
  h.position.y = 1.72;
  h.castShadow = true;
  swing.add(h);
  const a = new THREE.Mesh(armG, wood);
  a.rotation.z = Math.PI / 2;
  a.position.y = 1.36;
  swing.add(a);
  const belt = new THREE.Mesh(beltG, strap);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.0;
  swing.add(belt);
  let wob = 0;
  let wv = 0;
  return {
    root,
    update(dt, st) {
      if (st?.hitT > 0.12) wv += 6;
      wv += -wob * 40 * dt - wv * 3 * dt;
      wob += wv * dt;
      swing.rotation.x = wob * 0.15;
    },
    setHit(v) {
      sack.emissive.setRGB(v * 0.6, v * 0.25, v * 0.1);
    },
    setDissolve() {},
    dispose: () => disposeAll(mats, geos),
  };
}
