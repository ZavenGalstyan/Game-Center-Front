/**
 * Metro Rush — pooled particle bursts (one Points draw call), debris chunks
 * (one InstancedMesh) and the shield bubble / magnet ring around the runner.
 */
import * as THREE from "three";
import { glowTexture, track } from "./materials.js";

const MAX = 700;
const DEBRIS = 60;

export function createEffects(scene) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const max = new Float32Array(MAX);
  const base = new Float32Array(MAX * 3);
  const grav = new Float32Array(MAX);
  let head = 0;
  const geom = track(new THREE.BufferGeometry());
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(
    geom,
    track(new THREE.PointsMaterial({ size: 0.35, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })),
  );
  pts.frustumCulled = false;
  scene.add(pts);

  const dGeo = track(new THREE.BoxGeometry(0.22, 0.22, 0.22));
  const dMat = track(new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: false }));
  const debris = new THREE.InstancedMesh(dGeo, dMat, DEBRIS);
  debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEBRIS * 3), 3);
  debris.frustumCulled = false;
  debris.castShadow = true;
  scene.add(debris);
  const D = Array.from({ length: DEBRIS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, s: 1 }));
  let dHead = 0;
  const m4 = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const tc = new THREE.Color();
  for (let i = 0; i < DEBRIS; i++) debris.setMatrixAt(i, m4.makeScale(0, 0, 0));

  function emit(x, y, z, n, color, { speed = 4, up = 2, spread = 1, lifeT = 0.6, g = 6, jitter = 0.2 } = {}) {
    tc.set(color);
    for (let i = 0; i < n; i++) {
      const k = head;
      head = (head + 1) % MAX;
      const o = k * 3;
      pos[o] = x + (Math.random() - 0.5) * jitter;
      pos[o + 1] = y + (Math.random() - 0.5) * jitter;
      pos[o + 2] = z + (Math.random() - 0.5) * jitter;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      vel[o] = Math.cos(a) * s * spread;
      vel[o + 1] = up * (0.4 + Math.random());
      vel[o + 2] = Math.sin(a) * s * spread;
      base[o] = tc.r;
      base[o + 1] = tc.g;
      base[o + 2] = tc.b;
      life[k] = max[k] = lifeT * (0.6 + Math.random() * 0.6);
      grav[k] = g;
    }
  }
  function smash(x, y, z, colors, n = 10) {
    for (let i = 0; i < n; i++) {
      const d = D[dHead];
      dHead = (dHead + 1) % DEBRIS;
      d.p.set(x + (Math.random() - 0.5) * 1.6, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.4);
      d.v.set((Math.random() - 0.5) * 9, 4 + Math.random() * 6, -4 - Math.random() * 6);
      d.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      d.life = 1.2;
      d.s = 0.6 + Math.random() * 1.2;
      tc.set(colors[i % colors.length]);
      debris.setColorAt((dHead + DEBRIS - 1) % DEBRIS, tc);
    }
    debris.instanceColor.needsUpdate = true;
  }

  // shield bubble + magnet ring follow the runner
  const bubble = new THREE.Mesh(
    track(new THREE.SphereGeometry(1.15, 28, 18)),
    track(new THREE.MeshStandardMaterial({ color: "#29d8ff", emissive: "#29d8ff", emissiveIntensity: 0.6, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false })),
  );
  bubble.visible = false;
  scene.add(bubble);
  const ring = new THREE.Mesh(track(new THREE.TorusGeometry(1.0, 0.04, 6, 40)), track(new THREE.MeshBasicMaterial({ color: "#ff4a5a", transparent: true, opacity: 0.7, toneMapped: false })));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  return {
    emit,
    smash,
    bubble,
    ring,
    update(dt, scroll) {
      for (let k = 0; k < MAX; k++) {
        if (life[k] <= 0) continue;
        life[k] -= dt;
        const o = k * 3;
        if (life[k] <= 0) {
          col[o] = col[o + 1] = col[o + 2] = 0;
          pos[o + 1] = -50;
          continue;
        }
        vel[o + 1] -= grav[k] * dt;
        pos[o] += vel[o] * dt;
        pos[o + 1] += vel[o + 1] * dt;
        pos[o + 2] += vel[o + 2] * dt + scroll;
        const f = life[k] / max[k];
        col[o] = base[o] * f;
        col[o + 1] = base[o + 1] * f;
        col[o + 2] = base[o + 2] * f;
      }
      geom.attributes.position.needsUpdate = true;
      geom.attributes.color.needsUpdate = true;
      let any = false;
      for (let i = 0; i < DEBRIS; i++) {
        const d = D[i];
        if (d.life <= 0) continue;
        any = true;
        d.life -= dt;
        d.v.y -= 22 * dt;
        d.p.addScaledVector(d.v, dt);
        d.p.z += scroll;
        if (d.p.y < 0.1) {
          d.p.y = 0.1;
          d.v.y *= -0.35;
          d.v.x *= 0.7;
        }
        d.r.x += d.w.x * dt;
        d.r.y += d.w.y * dt;
        const s = d.life > 0 ? d.s * Math.min(1, d.life * 3) : 0;
        debris.setMatrixAt(i, m4.compose(d.p, qq.setFromEuler(d.r), sc.set(s, s, s)));
      }
      if (any) debris.instanceMatrix.needsUpdate = true;
    },
    clear() {
      life.fill(0);
      col.fill(0);
      for (const d of D) d.life = 0;
      for (let i = 0; i < DEBRIS; i++) debris.setMatrixAt(i, m4.makeScale(0, 0, 0));
      debris.instanceMatrix.needsUpdate = true;
    },
  };
}
