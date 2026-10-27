/**
 * Oceanbound — pooled particles and splash rings.
 *
 * Two point clouds (alpha-blended and additive) with fixed-size pools; each
 * particle type has its own life, size curve, colour, gravity and drag.
 * Expanding foam rings (a small mesh pool) mark splashes on the waves.
 * Nothing is allocated per frame after creation.
 */
import * as THREE from "three";
import { dotTex, ringTex } from "./textures.js";
import { waveHeight } from "../sim/waves.js";

const TYPES = {
  splash: { life: 0.9, size: 0.16, grow: -0.05, col: [0.92, 0.97, 1], a: 0.9, g: 9, drag: 0.6, add: false },
  spray: { life: 0.6, size: 0.1, grow: 0, col: [0.95, 0.98, 1], a: 0.8, g: 7, drag: 1.2, add: false },
  bubble: { life: 2.4, size: 0.07, grow: 0.02, col: [0.85, 0.95, 1], a: 0.65, g: -1.6, drag: 2, add: false, wobble: 1 },
  snow: { life: 5, size: 0.035, grow: 0, col: [0.75, 0.9, 0.9], a: 0.35, g: -0.05, drag: 1, add: false, wobble: 0.4 },
  chip: { life: 1.1, size: 0.07, grow: 0, col: [0.62, 0.45, 0.26], a: 1, g: 9.5, drag: 0.4, add: false },
  dust: { life: 1.2, size: 0.12, grow: 0.25, col: [0.62, 0.6, 0.56], a: 0.6, g: 1.5, drag: 2, add: false },
  leaf: { life: 2.2, size: 0.12, grow: 0, col: [0.36, 0.56, 0.22], a: 1, g: 1.6, drag: 1.6, add: false, wobble: 1.2 },
  smoke: { life: 3.2, size: 0.25, grow: 0.5, col: [0.55, 0.55, 0.56], a: 0.32, g: -0.7, drag: 0.8, add: false, wobble: 0.3 },
  steam: { life: 2.2, size: 0.2, grow: 0.45, col: [0.95, 0.97, 1], a: 0.28, g: -0.8, drag: 0.8, add: false, wobble: 0.3 },
  fire: { life: 0.55, size: 0.16, grow: -0.18, col: [1, 0.55, 0.18], a: 0.95, g: -2.2, drag: 1, add: true, wobble: 0.6 },
  spark: { life: 0.5, size: 0.05, grow: -0.05, col: [1, 0.8, 0.4], a: 1, g: 6, drag: 0.6, add: true },
  glint: { life: 0.8, size: 0.25, grow: -0.2, col: [1, 0.95, 0.7], a: 0.9, g: -0.3, drag: 1, add: true },
  blood: { life: 2.4, size: 0.35, grow: 0.5, col: [0.55, 0.08, 0.08], a: 0.45, g: -0.1, drag: 1.5, add: false },
  wake: { life: 1.3, size: 0.2, grow: 0.25, col: [0.95, 0.98, 1], a: 0.5, g: 0, drag: 2, add: false },
};

const VS = `
attribute float aSize; attribute vec4 aCol;
varying vec4 vCol;
uniform float uScale;
void main(){
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uMap; varying vec4 vCol;
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vCol.rgb, vCol.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;

function makeCloud(n, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const colr = new Float32Array(n * 4);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aCol", new THREE.BufferAttribute(colr, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: dotTex() }, uScale: { value: 600 } },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  const P = [];
  for (let i = 0; i < n; i++) P.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, T: null, ph: 0 });
  return { geo, mat, pts, P, pos, size, colr, next: 0 };
}

export function createFx(scene, quality) {
  const N = { low: 500, medium: 1000, high: 1600 }[quality] || 1000;
  const normal = makeCloud(N, false);
  const add = makeCloud(Math.floor(N / 3), true);
  scene.add(normal.pts, add.pts);
  // splash rings
  const ringGeo = new THREE.PlaneGeometry(1, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, depthWrite: false, opacity: 0 }));
    m.visible = false;
    m.renderOrder = 4;
    scene.add(m);
    rings.push({ m, t: 0, life: 1, s: 1, x: 0, z: 0, alive: false });
  }
  let ringNext = 0;
  let time = 0;

  function emit(type, x, y, z, count = 1, opt = {}) {
    const T = TYPES[type];
    if (!T) return;
    const C = T.add ? add : normal;
    const spread = opt.spread ?? 1;
    for (let k = 0; k < count; k++) {
      const p = C.P[C.next];
      C.next = (C.next + 1) % C.P.length;
      p.alive = true;
      p.T = T;
      p.t = 0;
      p.life = T.life * (0.7 + Math.random() * 0.6);
      p.x = x + (Math.random() - 0.5) * 0.2 * spread;
      p.y = y + (Math.random() - 0.5) * 0.1 * spread;
      p.z = z + (Math.random() - 0.5) * 0.2 * spread;
      const sp = opt.speed ?? 1;
      const up = opt.up ?? 1;
      p.vx = (Math.random() - 0.5) * 3 * sp * spread + (opt.vx || 0);
      p.vz = (Math.random() - 0.5) * 3 * sp * spread + (opt.vz || 0);
      p.vy = (Math.random() * 3.5 + 0.5) * up * sp + (opt.vy || 0);
      if (type === "bubble" || type === "snow" || type === "smoke" || type === "steam" || type === "fire") {
        p.vx *= 0.15;
        p.vz *= 0.15;
        p.vy = type === "fire" ? 0.6 : 0.2;
      }
      if (type === "blood" || type === "wake") {
        p.vy = 0;
        p.vx *= 0.25;
        p.vz *= 0.25;
      }
      p.ph = Math.random() * 6.28;
      p.size = T.size * (0.7 + Math.random() * 0.6) * (opt.size || 1);
    }
  }
  function ring(x, z, s = 1) {
    const r = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    Object.assign(r, { alive: true, t: 0, life: 1.1 + s * 0.4, s, x, z });
    r.m.visible = true;
  }

  function step(C, dt) {
    let n = 0;
    for (const p of C.P) {
      if (!p.alive) continue;
      p.t += dt;
      if (p.t >= p.life) {
        p.alive = false;
        continue;
      }
      const T = p.T;
      const dr = Math.exp(-T.drag * dt);
      p.vx *= dr;
      p.vz *= dr;
      p.vy = p.vy * dr - T.g * dt;
      if (T.wobble) {
        p.vx += Math.sin(time * 3 + p.ph) * T.wobble * dt;
        p.vz += Math.cos(time * 2.6 + p.ph) * T.wobble * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (T === TYPES.bubble && p.y > waveHeight(p.x, p.z, time) - 0.05) {
        p.alive = false;
        continue;
      }
      if ((T === TYPES.splash || T === TYPES.spray) && p.vy < 0 && p.y < waveHeight(p.x, p.z, time)) {
        p.alive = false;
        continue;
      }
      if (T === TYPES.blood || T === TYPES.wake) p.y = waveHeight(p.x, p.z, time) + (T === TYPES.wake ? 0.04 : -0.2);
      const k = p.t / p.life;
      C.pos[n * 3] = p.x;
      C.pos[n * 3 + 1] = p.y;
      C.pos[n * 3 + 2] = p.z;
      C.size[n] = Math.max(0.001, p.size + T.grow * p.t);
      const fade = Math.min(1, (1 - k) * 2.5) * Math.min(1, p.t * 10);
      C.colr[n * 4] = T.col[0];
      C.colr[n * 4 + 1] = T.col[1];
      C.colr[n * 4 + 2] = T.col[2];
      C.colr[n * 4 + 3] = T.a * fade;
      n++;
    }
    C.geo.setDrawRange(0, n);
    C.geo.attributes.position.needsUpdate = true;
    C.geo.attributes.aSize.needsUpdate = true;
    C.geo.attributes.aCol.needsUpdate = true;
  }

  return {
    emit,
    ring,
    /** a splash on the sea surface */
    splash(x, y, z, s = 1) {
      emit("splash", x, y + 0.05, z, Math.round(10 + s * 18), { speed: 0.6 + s * 0.5, up: 0.8 + s * 0.6 });
      emit("spray", x, y + 0.05, z, Math.round(6 + s * 8), { speed: 1 + s * 0.4, up: 0.5 });
      ring(x, z, s);
    },
    update(dt, t, height, pixelRatio) {
      time = t;
      normal.mat.uniforms.uScale.value = height * pixelRatio * 0.9;
      add.mat.uniforms.uScale.value = height * pixelRatio * 0.9;
      step(normal, dt);
      step(add, dt);
      for (const r of rings) {
        if (!r.alive) continue;
        r.t += dt;
        const k = r.t / r.life;
        if (k >= 1) {
          r.alive = false;
          r.m.visible = false;
          continue;
        }
        const sc = (0.6 + k * 2.4) * r.s;
        r.m.scale.set(sc, 1, sc);
        r.m.position.set(r.x, waveHeight(r.x, r.z, t) + 0.03, r.z);
        r.m.material.opacity = (1 - k) * 0.8;
      }
    },
    dispose() {
      for (const C of [normal, add]) {
        scene.remove(C.pts);
        C.geo.dispose();
        C.mat.dispose();
      }
      for (const r of rings) {
        scene.remove(r.m);
        r.m.material.dispose();
      }
      ringGeo.dispose();
    },
  };
}
