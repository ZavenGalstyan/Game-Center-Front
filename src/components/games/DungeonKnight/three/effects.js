/**
 * Dungeon Knight — combat feedback: sparks, goo, bone chips, dust, heal and
 * loot sparkles (one pooled GPU particle system each for additive and normal
 * blending), the sword trail ribbon, expanding impact rings (slams, level up)
 * and enemy projectiles. Counts scale with the Particles setting; nothing here
 * affects gameplay.
 */
import * as THREE from "three";
import { glowTexture } from "./textures.js";

const VERT = `
attribute float size;
attribute vec4 pcolor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vColor;
uniform sampler2D uMap;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
}`;

function particleSystem(max, additive) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 4);
  const size = new Float32Array(max);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("pcolor", new THREE.BufferAttribute(col, 4));
  g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uScale: { value: 400 }, uMap: { value: glowTexture() } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  const P = [];
  for (let i = 0; i < max; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s0: 0.1, s1: 0, r: 1, gC: 1, b: 1, a: 1 });
  let cursor = 0;
  return {
    pts,
    spawn(o) {
      const p = P[cursor];
      cursor = (cursor + 1) % max;
      Object.assign(p, { drag: 0, g: 0, s1: 0, a: 1, ...o });
      p.life = p.max;
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.life <= 0) {
          size[i] = 0;
          continue;
        }
        p.life -= dt;
        const k = 1 - Math.max(0, p.life) / p.max;
        p.vy -= p.g * dt;
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr;
        p.vy *= dr;
        p.vz *= dr;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.03) {
          p.y = 0.03;
          p.vy *= -0.25;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        col[i * 4] = p.r;
        col[i * 4 + 1] = p.gC;
        col[i * 4 + 2] = p.b;
        col[i * 4 + 3] = p.a * (1 - k * k);
        size[i] = p.s0 + (p.s1 - p.s0) * k;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.pcolor.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
    },
    dispose() {
      g.dispose();
      m.dispose();
    },
  };
}

const C3 = new THREE.Color();
function rgb(hex) {
  C3.set(hex);
  return { r: C3.r, gC: C3.g, b: C3.b };
}

export function createEffects(scene, { particles = "normal", quality = "medium", reducedMotion = false } = {}) {
  const many = particles !== "low";
  const mul = particles === "low" ? 0.35 : quality === "high" ? 1.25 : 1;
  const add = particleSystem(many ? 700 : 260, true);
  const norm = particleSystem(many ? 500 : 200, false);
  scene.add(add.pts, norm.pts);
  const n = (k) => Math.max(1, Math.round(k * mul));
  const rnd = (a) => (Math.random() * 2 - 1) * a;

  /* ---------------- sword trail */
  const TR = 14;
  const trailPos = new Float32Array(TR * 2 * 3);
  const trailCol = new Float32Array(TR * 2 * 3);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  tg.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
  const idx = [];
  for (let i = 0; i < TR - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  tg.setIndex(idx);
  const tm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const trail = new THREE.Mesh(tg, tm);
  trail.frustumCulled = false;
  trail.renderOrder = 6;
  scene.add(trail);
  const samples = [];
  let trailColor = rgb("#cfe8ff");
  let trailFade = 0;

  /* ---------------- rings (slam dust, level up, shrine) */
  const rings = [];
  const ringG = new THREE.RingGeometry(0.8, 1, 48);
  ringG.rotateX(-Math.PI / 2);
  function ring(x, z, color, r0, r1, life, y = 0.05) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(ringG, m);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    rings.push({ mesh, r0, r1, life, max: life });
  }

  /* ---------------- projectiles */
  const orbs = new Map();
  const orbG = new THREE.SphereGeometry(1, 12, 10);
  const orbHalo = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const ORB_COL = { mage: "#a68bff", warden: "#9fff6a", frost: "#bff2ff", jailer: "#ff8a3a", king: "#c39bff", knight: "#c39bff" };

  const api = {
    /** sword hits a body: material-specific burst */
    hit(x, y, z, kind, heavy, dirYaw = 0) {
      const k = heavy ? 1.6 : 1;
      if (kind === "slime") {
        for (let i = 0; i < n(14 * k); i++) norm.spawn({ x, y, z, vx: rnd(2.6) + Math.sin(dirYaw) * 1.5, vy: 1 + Math.random() * 3, vz: rnd(2.6) + Math.cos(dirYaw) * 1.5, g: 9, drag: 1, max: 0.5 + Math.random() * 0.3, s0: 0.12, s1: 0.05, ...rgb("#5fe0b0"), a: 0.9 });
        for (let i = 0; i < n(6); i++) add.spawn({ x, y, z, vx: rnd(1), vy: rnd(1), vz: rnd(1), max: 0.25, s0: 0.4, s1: 0.1, ...rgb("#9fffd8"), a: 0.6 });
      } else if (kind === "bone") {
        for (let i = 0; i < n(10 * k); i++) norm.spawn({ x, y, z, vx: rnd(3), vy: 1 + Math.random() * 3, vz: rnd(3), g: 12, drag: 0.5, max: 0.6, s0: 0.07, s1: 0.05, ...rgb("#efe6cf"), a: 1 });
        for (let i = 0; i < n(8); i++) add.spawn({ x, y, z, vx: rnd(4), vy: rnd(3), vz: rnd(4), drag: 4, max: 0.18, s0: 0.12, s1: 0.02, ...rgb("#fff4d6"), a: 1 });
      } else if (kind === "armor" || kind === "stone") {
        for (let i = 0; i < n(16 * k); i++) add.spawn({ x, y, z, vx: rnd(6), vy: rnd(4) + 1.5, vz: rnd(6), g: 10, drag: 2, max: 0.35 + Math.random() * 0.2, s0: 0.08, s1: 0.02, ...rgb(kind === "stone" ? "#ffd9a8" : "#ffb04a"), a: 1 });
        if (kind === "stone") for (let i = 0; i < n(8); i++) norm.spawn({ x, y, z, vx: rnd(2), vy: Math.random() * 2, vz: rnd(2), g: 10, max: 0.6, s0: 0.1, s1: 0.06, ...rgb("#8a8278"), a: 1 });
      } else {
        for (let i = 0; i < n(10 * k); i++) add.spawn({ x, y, z, vx: rnd(4), vy: rnd(3) + 1, vz: rnd(4), g: 6, drag: 3, max: 0.3, s0: 0.1, s1: 0.02, ...rgb("#ffe2b0"), a: 1 });
        for (let i = 0; i < n(6); i++) norm.spawn({ x, y, z, vx: rnd(1.6), vy: Math.random() * 1.6, vz: rnd(1.6), g: 3, drag: 1.5, max: 0.5, s0: 0.12, s1: 0.2, ...rgb("#4a3a3a"), a: 0.7 });
      }
      // a white flash at the contact point
      add.spawn({ x, y, z, max: 0.12, s0: heavy ? 1.3 : 0.9, s1: 0.2, r: 1, gC: 1, b: 1, a: 0.9 });
    },
    /** sword on shield / stone, or a blocked enemy hit on the knight's shield */
    sparks(x, y, z, color = "#ffd27a", count = 18) {
      for (let i = 0; i < n(count); i++) add.spawn({ x, y, z, vx: rnd(5), vy: rnd(3) + 2, vz: rnd(5), g: 12, drag: 2.5, max: 0.3 + Math.random() * 0.25, s0: 0.07, s1: 0.015, ...rgb(color), a: 1 });
      add.spawn({ x, y, z, max: 0.1, s0: 0.7, s1: 0.1, ...rgb(color), a: 0.9 });
    },
    dust(x, z, count = 6, color = "#8a7f72", spread = 0.6, y = 0.08) {
      for (let i = 0; i < n(count); i++) norm.spawn({ x: x + rnd(spread * 0.3), y, z: z + rnd(spread * 0.3), vx: rnd(spread * 1.5), vy: 0.3 + Math.random() * 0.6, vz: rnd(spread * 1.5), drag: 2.5, max: 0.6 + Math.random() * 0.4, s0: 0.25, s1: 0.7, ...rgb(color), a: 0.35 });
    },
    heal(x, z, color = "#7dff9a") {
      for (let i = 0; i < n(26); i++) add.spawn({ x: x + rnd(0.5), y: 0.2 + Math.random() * 1.4, z: z + rnd(0.5), vx: rnd(0.2), vy: 0.8 + Math.random() * 1.2, vz: rnd(0.2), max: 0.9 + Math.random() * 0.5, s0: 0.12, s1: 0.03, ...rgb(color), a: 0.95 });
    },
    loot(x, y, z) {
      for (let i = 0; i < n(40); i++) add.spawn({ x: x + rnd(0.4), y, z: z + rnd(0.3), vx: rnd(1.2), vy: 2 + Math.random() * 3, vz: rnd(1.2), g: 3, drag: 0.8, max: 1.2 + Math.random() * 0.6, s0: 0.1, s1: 0.03, ...rgb(Math.random() < 0.7 ? "#ffd45e" : "#fff2c0"), a: 1 });
    },
    goldBurst(x, z) {
      for (let i = 0; i < n(12); i++) add.spawn({ x, y: 0.5, z, vx: rnd(1.5), vy: 2 + Math.random() * 2, vz: rnd(1.5), g: 9, max: 0.7, s0: 0.09, s1: 0.04, ...rgb("#ffd45e"), a: 1 });
    },
    death(x, z, color, big = false) {
      for (let i = 0; i < n(big ? 40 : 18); i++) norm.spawn({ x: x + rnd(0.5), y: 0.2 + Math.random() * (big ? 2 : 1), z: z + rnd(0.5), vx: rnd(0.8), vy: 0.4 + Math.random() * 0.8, vz: rnd(0.8), drag: 1.2, max: 1 + Math.random() * 0.8, s0: 0.3, s1: 0.9, ...rgb(color), a: 0.35 });
      for (let i = 0; i < n(big ? 30 : 10); i++) add.spawn({ x: x + rnd(0.6), y: 0.3 + Math.random() * (big ? 2.4 : 1.2), z: z + rnd(0.6), vx: rnd(0.4), vy: 0.6 + Math.random(), vz: rnd(0.4), max: 1.2, s0: 0.08, s1: 0.02, ...rgb("#ffe9b0"), a: 0.8 });
    },
    slam(x, z, r, color = "#ff8a3a") {
      ring(x, z, color, r * 0.3, r * 1.15, 0.45);
      api.dust(x, z, 14, "#6a6058", r, 0.1);
    },
    levelUp(x, z) {
      ring(x, z, "#ffd45e", 0.3, 2.6, 0.9);
      ring(x, z, "#7fe6ff", 0.2, 1.8, 0.7, 0.08);
      for (let i = 0; i < n(40); i++) {
        const a = Math.random() * Math.PI * 2;
        add.spawn({ x: x + Math.cos(a) * 0.6, y: 0.1, z: z + Math.sin(a) * 0.6, vx: 0, vy: 1.5 + Math.random() * 2.5, vz: 0, max: 1.1, s0: 0.12, s1: 0.03, ...rgb(i % 2 ? "#ffd45e" : "#9ff0ff"), a: 1 });
      }
    },
    shrine(x, z) {
      ring(x, z, "#5fffc0", 0.4, 2.4, 0.9);
      api.heal(x, z, "#5fffc0");
    },
    evade(x, z) {
      ring(x, z, "#bfe3ff", 0.2, 1.0, 0.3, 0.06);
    },
    /** sword trail: feed the blade's hilt/tip each frame while swinging */
    trailPush(hx, hy, hz, tx, ty, tz, color) {
      if (color) trailColor = rgb(color);
      samples.unshift([hx, hy, hz, tx, ty, tz]);
      if (samples.length > TR) samples.length = TR;
      trailFade = 1;
    },
    trailStop() {
      // let it fade rather than vanish
    },
    syncOrbs(list) {
      const seen = new Set();
      for (const o of list) {
        seen.add(o.id);
        let v = orbs.get(o.id);
        if (!v) {
          const color = ORB_COL[o.theme] || "#c39bff";
          const m = new THREE.MeshBasicMaterial({ color });
          const mesh = new THREE.Mesh(orbG, m);
          const halo = new THREE.Sprite(orbHalo.clone());
          halo.material.color.set(color);
          halo.scale.setScalar(o.r * 5);
          mesh.add(halo);
          halo.scale.setScalar(5);
          scene.add(mesh);
          v = { mesh, color };
          orbs.set(o.id, v);
        }
        v.mesh.position.set(o.x, o.y, o.z);
        v.mesh.scale.setScalar(o.r * (0.85 + Math.sin(performance.now() / 60 + o.id) * 0.1));
        if (Math.random() < 0.6) add.spawn({ x: o.x, y: o.y, z: o.z, vx: rnd(0.3), vy: rnd(0.3), vz: rnd(0.3), max: 0.35, s0: o.r * 1.6, s1: 0.02, ...rgb(v.color), a: 0.7 });
      }
      for (const [id, v] of orbs) {
        if (!seen.has(id)) {
          scene.remove(v.mesh);
          v.mesh.material.dispose();
          v.mesh.children[0].material.dispose();
          orbs.delete(id);
        }
      }
    },
    burst(x, y, z, color) {
      for (let i = 0; i < n(16); i++) add.spawn({ x, y, z, vx: rnd(3), vy: rnd(3), vz: rnd(3), drag: 3, max: 0.4, s0: 0.15, s1: 0.02, ...rgb(color), a: 1 });
    },
    setScale(viewH, fovDeg) {
      const s = viewH / (2 * Math.tan((fovDeg * Math.PI) / 360));
      add.pts.material.uniforms.uScale.value = s;
      norm.pts.material.uniforms.uScale.value = s;
    },
    update(dt) {
      add.update(dt);
      norm.update(dt);
      // trail
      trailFade = Math.max(0, trailFade - dt * 5);
      if (trailFade <= 0 && samples.length) samples.length = Math.max(0, samples.length - 2);
      for (let i = 0; i < TR; i++) {
        const s = samples[Math.min(i, samples.length - 1)];
        const a = samples.length ? (1 - i / TR) * trailFade * (i < samples.length ? 1 : 0) : 0;
        for (let j = 0; j < 2; j++) {
          const v = (i * 2 + j) * 3;
          if (s) {
            trailPos[v] = s[j * 3];
            trailPos[v + 1] = s[j * 3 + 1];
            trailPos[v + 2] = s[j * 3 + 2];
          }
          const w = j ? a : a * 0.15;
          trailCol[v] = trailColor.r * w;
          trailCol[v + 1] = trailColor.gC * w;
          trailCol[v + 2] = trailColor.b * w;
        }
      }
      tg.attributes.position.needsUpdate = true;
      tg.attributes.color.needsUpdate = true;
      trail.visible = samples.length > 1 && !reducedMotion;
      // rings
      for (let i = rings.length - 1; i >= 0; i--) {
        const R = rings[i];
        R.life -= dt;
        const k = 1 - R.life / R.max;
        const s = R.r0 + (R.r1 - R.r0) * (1 - (1 - k) ** 2);
        R.mesh.scale.setScalar(s);
        R.mesh.material.opacity = 0.8 * (1 - k);
        if (R.life <= 0) {
          scene.remove(R.mesh);
          R.mesh.material.dispose();
          rings.splice(i, 1);
        }
      }
    },
    clear() {
      for (const R of rings) {
        scene.remove(R.mesh);
        R.mesh.material.dispose();
      }
      rings.length = 0;
      api.syncOrbs([]);
      samples.length = 0;
    },
    dispose() {
      api.clear();
      scene.remove(add.pts, norm.pts, trail);
      add.dispose();
      norm.dispose();
      tg.dispose();
      tm.dispose();
      ringG.dispose();
      orbG.dispose();
      orbHalo.dispose();
    },
  };
  return api;
}
