/**
 * Lightweight impact effects: sweat / spray bursts on clean hits, a glove-
 * contact flash, and a soft contact shadow under each fighter (in addition to
 * the real shadow map — grounds the feet on every quality preset).
 */
import * as THREE from "three";

const MAX = 240;

export function createFx(scene) {
  // pooled point sprites
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 300 } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord-0.5; float a = smoothstep(0.5,0.1,length(d)); if(a<0.02) discard; gl_FragColor = vec4(vC*a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const parts = Array.from({ length: MAX }, () => ({ life: 0, v: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color(), s: 0 }));
  let next = 0;

  // contact shadows
  const blobTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.75)");
    gr.addColorStop(0.5, "rgba(0,0,0,0.35)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 });
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const blobs = [0, 1].map(() => {
    const b = new THREE.Mesh(blobGeo, blobMat);
    b.position.y = 0.006;
    b.renderOrder = 1;
    scene.add(b);
    return b;
  });

  return {
    burst(p, { n = 14, color = "#e8f1ff", speed = 2.2, sz = 0.05, up = 0.6, dir = null } = {}) {
      const c = new THREE.Color(color);
      for (let i = 0; i < n; i++) {
        const q = parts[next];
        next = (next + 1) % MAX;
        q.life = 0.35 + Math.random() * 0.35;
        q.p.set(p.x, p.y, p.z);
        q.v.set(Math.random() - 0.5, Math.random() * up, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
        if (dir) q.v.addScaledVector(dir, speed * 0.8);
        q.c.copy(c);
        q.s = sz * (0.6 + Math.random() * 0.8);
      }
    },
    /** blobs: [{x,z,spread,strength}] for the two fighters */
    update(dt, blobInfo = []) {
      for (let i = 0; i < MAX; i++) {
        const q = parts[i];
        if (q.life > 0) {
          q.life -= dt;
          q.v.y -= 6 * dt;
          q.p.addScaledVector(q.v, dt);
          if (q.p.y < 0.01) {
            q.p.y = 0.01;
            q.v.set(0, 0, 0);
          }
        }
        const k = Math.max(0, q.life);
        pos[i * 3] = q.p.x;
        pos[i * 3 + 1] = q.p.y;
        pos[i * 3 + 2] = q.p.z;
        col[i * 3] = q.c.r * Math.min(1, k * 3);
        col[i * 3 + 1] = q.c.g * Math.min(1, k * 3);
        col[i * 3 + 2] = q.c.b * Math.min(1, k * 3);
        size[i] = k > 0 ? q.s : 0;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      blobInfo.forEach((b, i) => {
        if (!blobs[i]) return;
        blobs[i].position.x = b.x;
        blobs[i].position.z = b.z;
        blobs[i].scale.set(b.sx, 1, b.sz);
        blobs[i].rotation.y = b.yaw || 0;
      });
    },
    setScale(h) {
      mat.uniforms.uScale.value = h * 0.5;
    },
    dispose() {
      scene.remove(points);
      blobs.forEach((b) => scene.remove(b));
      geo.dispose();
      mat.dispose();
      blobTex.dispose();
      blobMat.dispose();
      blobGeo.dispose();
    },
  };
}
