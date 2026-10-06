/**
 * Lost Toy — pooled particles in ONE THREE.Points draw call.
 *
 *   puff     soft dust from footsteps / landings (tiny: the toy is small)
 *   fluff    pillow / cushion fibres on a bounce
 *   sparkle  warm glints around Memory Buttons, checkpoints, respawn
 *   splash   water droplets
 *   confetti paper bits at the finish
 *
 * Counts scale with graphics quality; nothing allocates per frame.
 */
import * as THREE from "three";

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

export function createEffects(scene, { quality = "medium", motion = true } = {}) {
  const MAX = quality === "high" ? 900 : quality === "medium" ? 600 : 260;
  const scale = quality === "high" ? 1 : quality === "medium" ? 0.75 : 0.45;
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const alpha = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  const mtl = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false });
  const pts = new THREE.Points(geo, mtl);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  scene.add(pts);

  const P = [];
  for (let i = 0; i < MAX; i++) P.push({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.1, r: 1, g: 1, b: 1, drag: 1, grav: 0, fade: 1, grow: 0, add: false });
  let cursor = 0;
  const tmpC = new THREE.Color();

  function spawn(x, y, z, vx, vy, vz, life, s, color, o = {}) {
    const p = P[cursor];
    cursor = (cursor + 1) % MAX;
    p.live = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = 0;
    p.max = life;
    p.s = s;
    tmpC.set(color);
    p.r = tmpC.r;
    p.g = tmpC.g;
    p.b = tmpC.b;
    p.drag = o.drag ?? 2;
    p.grav = o.grav ?? 0;
    p.grow = o.grow ?? 0;
    p.a0 = o.alpha ?? 0.8;
  }
  const R = () => Math.random() - 0.5;
  const n = (k) => Math.max(1, Math.round(k * scale));

  const fx = {
    puff(x, y, z, count, color = "#e8dccb", spread = 0.5) {
      for (let i = 0; i < n(count); i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = spread * (0.5 + Math.random());
        spawn(x + R() * 0.2, y + 0.05, z + R() * 0.2, Math.cos(a) * sp, 0.25 + Math.random() * 0.35, Math.sin(a) * sp, 0.45 + Math.random() * 0.35, 0.09 + Math.random() * 0.07, color, { drag: 3.5, grow: 0.12, alpha: 0.55 });
      }
    },
    fluff(x, y, z, count, color = "#fffaf0") {
      for (let i = 0; i < n(count); i++) {
        spawn(x + R() * 0.8, y + 0.1, z + R() * 0.8, R() * 1.4, 0.8 + Math.random() * 1.6, R() * 1.4, 0.9 + Math.random() * 0.6, 0.06 + Math.random() * 0.05, color, { drag: 1.6, grav: -2.2, alpha: 0.9 });
      }
    },
    sparkle(x, y, z, count, color = "#ffd36e", spread = 1.2) {
      for (let i = 0; i < n(count); i++) {
        const a = Math.random() * Math.PI * 2;
        const e = (Math.random() - 0.3) * Math.PI;
        const sp = spread * (0.4 + Math.random());
        spawn(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 0.4, Math.sin(a) * Math.cos(e) * sp, 0.5 + Math.random() * 0.5, 0.07 + Math.random() * 0.06, color, { drag: 2.4, grav: -0.6, alpha: 1 });
      }
    },
    splash(x, y, z, count) {
      for (let i = 0; i < n(count); i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.6 + Math.random() * 1.6;
        spawn(x, y + 0.05, z, Math.cos(a) * sp, 2 + Math.random() * 2.5, Math.sin(a) * sp, 0.6 + Math.random() * 0.3, 0.06 + Math.random() * 0.05, Math.random() > 0.5 ? "#cfeaff" : "#ffffff", { drag: 0.6, grav: -14, alpha: 0.85 });
      }
    },
    confetti(x, y, z, count) {
      const cols = ["#e85d4a", "#f2c14e", "#4fb3a8", "#3f7fd6", "#f28da0", "#8a5aa8"];
      for (let i = 0; i < n(count); i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.8 + Math.random() * 2.2;
        spawn(x, y + 1.2, z, Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp, 1.6 + Math.random() * 1.2, 0.08 + Math.random() * 0.06, cols[i % cols.length], { drag: 1.4, grav: -5, alpha: 1 });
      }
    },
    trail(x, y, z, color = "#ffd36e") {
      spawn(x + R() * 0.15, y + R() * 0.15, z + R() * 0.15, R() * 0.2, 0.3, R() * 0.2, 0.5, 0.06, color, { drag: 2, alpha: 0.8 });
    },
    clear() {
      for (const p of P) p.live = false;
    },
    update(dt, camera, pxH) {
      mtl.uniforms.uScale.value = pxH || 600;
      for (let i = 0; i < MAX; i++) {
        const p = P[i];
        if (!p.live) {
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        p.life += dt;
        if (p.life >= p.max) {
          p.live = false;
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vz *= k;
        p.vy = p.vy * k + p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.02 && p.grav < 0) {
          p.y = 0.02;
          p.vy = 0;
          p.vx *= 0.5;
          p.vz *= 0.5;
        }
        const u = p.life / p.max;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r;
        col[i * 3 + 1] = p.g;
        col[i * 3 + 2] = p.b;
        size[i] = (p.s + p.grow * u) * (motion ? 1 : 0.8);
        alpha[i] = p.a0 * (1 - u * u);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    },
    dispose() {
      scene.remove(pts);
      geo.dispose();
      mtl.dispose();
    },
  };
  return fx;
}
