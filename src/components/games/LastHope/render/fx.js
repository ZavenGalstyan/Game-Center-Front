/**
 * Last Hope — effects.
 *
 *  particles   two pooled GPU-billboard systems (alpha / additive) driven on
 *              the CPU: dust, wood & stone chips, sparks, smoke, flames,
 *              toxic gas, ash puffs for hits (no blood), muzzle flashes,
 *              explosions, rain splashes
 *  rings       ground telegraphs under winding-up zombies, slam warnings
 *  glows       additive light pools on the ground under lamps and fires
 */
import * as THREE from "three";
import { tex } from "./textures.js";

const VS = `
attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aSR;
varying vec4 vCol; varying vec2 vUv;
void main() {
  vUv = uv; vCol = aCol;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(aSR.y), s = sin(aSR.y);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSR.x;
  vec3 w = aPos + right * p.x + up * p.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FS = `
uniform sampler2D map; varying vec4 vCol; varying vec2 vUv;
void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a * t.r); if (gl_FragColor.a < 0.004) discard; }`;

function system(scene, max, additive, map) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute("position", quad.attributes.position);
  geo.setAttribute("uv", quad.attributes.uv);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const aSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
  aPos.setUsage(THREE.DynamicDrawUsage);
  aCol.setUsage(THREE.DynamicDrawUsage);
  aSR.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aPos", aPos);
  geo.setAttribute("aCol", aCol);
  geo.setAttribute("aSR", aSR);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map } },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 6 : 5;
  scene.add(mesh);
  const P = [];
  return {
    mesh,
    P,
    max,
    spawn(p) {
      if (P.length >= max) P.shift();
      P.push(p);
    },
    update(dt) {
      let n = 0;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.t += dt;
        if (p.t >= p.life) {
          P.splice(i, 1);
          continue;
        }
        p.vy -= (p.g || 0) * dt;
        const dr = Math.exp(-(p.drag || 0) * dt);
        p.vx *= dr;
        p.vy *= dr;
        p.vz *= dr;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.floor != null && p.y < p.floor) {
          p.y = p.floor;
          p.vy *= -0.3;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }
        p.rot += (p.spin || 0) * dt;
      }
      for (const p of P) {
        const k = p.t / p.life;
        const fadeIn = Math.min(1, p.t / (p.fin || 0.06));
        const a = (p.a ?? 1) * fadeIn * (1 - Math.pow(k, p.fe || 1.6));
        const size = p.s0 + (p.s1 - p.s0) * k;
        aPos.array[n * 3] = p.x;
        aPos.array[n * 3 + 1] = p.y;
        aPos.array[n * 3 + 2] = p.z;
        const c = p.c;
        const cr = p.c2 ? c[0] + (p.c2[0] - c[0]) * k : c[0];
        const cg = p.c2 ? c[1] + (p.c2[1] - c[1]) * k : c[1];
        const cb = p.c2 ? c[2] + (p.c2[2] - c[2]) * k : c[2];
        aCol.array[n * 4] = cr;
        aCol.array[n * 4 + 1] = cg;
        aCol.array[n * 4 + 2] = cb;
        aCol.array[n * 4 + 3] = a;
        aSR.array[n * 2] = size;
        aSR.array[n * 2 + 1] = p.rot;
        n++;
      }
      geo.instanceCount = n;
      aPos.needsUpdate = true;
      aCol.needsUpdate = true;
      aSR.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      quad.dispose();
      mat.dispose();
    },
  };
}

const rnd = (a, b) => a + Math.random() * (b - a);
const C = {
  dust: [0.62, 0.55, 0.45],
  ash: [0.32, 0.31, 0.3],
  wood: [0.62, 0.45, 0.28],
  stone: [0.55, 0.54, 0.5],
  leaf: [0.32, 0.5, 0.22],
  metal: [0.75, 0.72, 0.65],
  spark: [1.0, 0.75, 0.35],
  fire: [1.0, 0.55, 0.18],
  smoke: [0.28, 0.27, 0.26],
  toxic: [0.55, 0.9, 0.25],
  ichor: [0.2, 0.22, 0.16],
  white: [1, 1, 1],
};

export function createFx(scene, quality = "medium") {
  const cap = quality === "low" ? 0.5 : quality === "high" ? 1.4 : 1;
  const soft = tex("soft", 64).map;
  const smokeT = tex("smoke", 64).map;
  const alpha = system(scene, Math.round(900 * cap), false, smokeT);
  const add = system(scene, Math.round(700 * cap), true, soft);
  const chips = system(scene, Math.round(300 * cap), false, soft);

  // ------------------------------------------------------------ rings
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 40);
  discGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ff3a2a", transparent: true, opacity: 0.8, depthWrite: false }));
    const d = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: "#ff2a1a", transparent: true, opacity: 0.25, depthWrite: false }));
    g.add(r, d);
    g.visible = false;
    g.renderOrder = 4;
    scene.add(g);
    rings.push({ g, r, d });
  }
  let ringN = 0;

  // ------------------------------------------------------------ ground glows (light pools)
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ map: soft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffd9a0" });
  const glowIM = new THREE.InstancedMesh(glowGeo, glowMat, 160);
  glowIM.count = 0;
  glowIM.frustumCulled = false;
  glowIM.renderOrder = 3;
  glowIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3);
  scene.add(glowIM);
  const _m = new THREE.Matrix4();
  const _c = new THREE.Color();

  const api = {
    /* -------- emitters */
    puff(x, y, z, kind = "dust", n = 8, o = {}) {
      for (let i = 0; i < n * cap; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rnd(0.4, o.spread ?? 1.6);
        alpha.spawn({ x: x + rnd(-0.15, 0.15), y: y + rnd(0, 0.2), z: z + rnd(-0.15, 0.15), vx: Math.cos(a) * sp, vy: rnd(0.2, o.up ?? 1.2), vz: Math.sin(a) * sp, drag: 3, g: -0.3, t: 0, life: rnd(0.5, o.life ?? 1.1), s0: o.s0 ?? 0.35, s1: o.s1 ?? 1.2, c: C[kind] || C.dust, a: o.a ?? 0.55, rot: Math.random() * 6, spin: rnd(-1, 1) });
      }
    },
    chips(x, y, z, kind = "wood", n = 8) {
      for (let i = 0; i < n * cap; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rnd(1.5, 4);
        chips.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: rnd(2, 4.5), vz: Math.sin(a) * sp, g: 12, drag: 0.6, floor: 0.03, t: 0, life: rnd(0.6, 1.2), s0: rnd(0.07, 0.14), s1: 0.05, c: C[kind] || C.wood, a: 1, fe: 4, rot: Math.random() * 6, spin: rnd(-12, 12) });
      }
    },
    sparks(x, y, z, n = 10, dir = null) {
      for (let i = 0; i < n * cap; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rnd(2, 6);
        let vx = Math.cos(a) * sp;
        let vz = Math.sin(a) * sp;
        if (dir) {
          vx = vx * 0.4 + dir[0] * sp;
          vz = vz * 0.4 + dir[1] * sp;
        }
        add.spawn({ x, y, z, vx, vy: rnd(1, 4), vz, g: 9, drag: 1, floor: 0.02, t: 0, life: rnd(0.2, 0.5), s0: 0.09, s1: 0.03, c: C.spark, a: 1, rot: 0 });
      }
    },
    hit(x, y, z, kind = "flesh", crit = false) {
      // blood-free impact: a dark ash puff + a bright flash
      api.puff(x, y, z, kind === "toxic" ? "toxic" : "ash", crit ? 9 : 5, { spread: 1.4, up: 0.8, s0: 0.25, s1: 0.8, life: 0.6, a: 0.7 });
      add.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, t: 0, life: 0.12, s0: crit ? 1.1 : 0.7, s1: 0.2, c: crit ? [1, 0.85, 0.5] : [1, 1, 1], a: crit ? 0.9 : 0.6, rot: 0 });
      if (kind === "armored") api.sparks(x, y, z, 6);
    },
    muzzle(x, y, z, yaw, big = false) {
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      add.spawn({ x: x + dx * 0.1, y, z: z + dz * 0.1, vx: dx * 2, vy: 0, vz: dz * 2, t: 0, life: 0.07, s0: big ? 0.9 : 0.6, s1: 0.3, c: [1, 0.8, 0.45], a: 1, rot: Math.random() * 6 });
      alpha.spawn({ x: x + dx * 0.2, y, z: z + dz * 0.2, vx: dx * 1.2, vy: 0.4, vz: dz * 1.2, drag: 3, t: 0, life: 0.6, s0: 0.2, s1: 0.8, c: [0.6, 0.6, 0.6], a: 0.35, rot: Math.random() * 6 });
    },
    fire(x, y, z, k = 1) {
      // called every frame for each fire; rate scaled by k
      if (Math.random() < 0.55 * k * cap)
        add.spawn({ x: x + rnd(-0.18, 0.18), y: y + 0.05, z: z + rnd(-0.18, 0.18), vx: rnd(-0.1, 0.1), vy: rnd(0.9, 1.6), vz: rnd(-0.1, 0.1), drag: 1, t: 0, life: rnd(0.4, 0.7), s0: rnd(0.35, 0.55), s1: 0.08, c: [1, 0.7, 0.3], c2: [1, 0.25, 0.05], a: 0.9, fe: 1.2, rot: Math.random() * 6, spin: rnd(-2, 2) });
      if (Math.random() < 0.12 * k * cap) alpha.spawn({ x: x + rnd(-0.1, 0.1), y: y + 0.7, z: z + rnd(-0.1, 0.1), vx: rnd(-0.2, 0.2), vy: rnd(0.6, 1.0), vz: rnd(-0.2, 0.2), drag: 0.4, t: 0, life: rnd(1.8, 2.8), s0: 0.4, s1: 1.6, c: C.smoke, a: 0.32, rot: Math.random() * 6, spin: rnd(-0.5, 0.5) });
      if (Math.random() < 0.08 * k * cap) add.spawn({ x, y: y + 0.3, z, vx: rnd(-0.4, 0.4), vy: rnd(1.5, 2.6), vz: rnd(-0.4, 0.4), g: -0.2, t: 0, life: rnd(0.8, 1.4), s0: 0.06, s1: 0.02, c: C.spark, a: 1, rot: 0 });
    },
    gas(x, y, z, r = 1.5) {
      if (Math.random() < 0.5 * cap) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        alpha.spawn({ x: x + Math.cos(a) * d, y: y + 0.2, z: z + Math.sin(a) * d, vx: rnd(-0.2, 0.2), vy: rnd(0.1, 0.4), vz: rnd(-0.2, 0.2), drag: 0.5, t: 0, life: rnd(1.4, 2.2), s0: 0.6, s1: 1.6, c: C.toxic, a: 0.32, fin: 0.4, rot: Math.random() * 6, spin: rnd(-0.4, 0.4) });
      }
    },
    explosion(x, z, r = 4) {
      add.spawn({ x, y: 1, z, vx: 0, vy: 0, vz: 0, t: 0, life: 0.25, s0: r * 1.4, s1: r * 2.2, c: [1, 0.85, 0.5], a: 1, rot: 0 });
      for (let i = 0; i < 40 * cap; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rnd(2, 8);
        add.spawn({ x, y: 0.6, z, vx: Math.cos(a) * sp, vy: rnd(1, 6), vz: Math.sin(a) * sp, drag: 2.5, g: 2, t: 0, life: rnd(0.35, 0.8), s0: rnd(0.8, 1.6), s1: 0.3, c: [1, 0.6, 0.2], c2: [0.8, 0.15, 0.02], a: 0.95, rot: Math.random() * 6 });
      }
      for (let i = 0; i < 26 * cap; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rnd(1, 4);
        alpha.spawn({ x, y: 1, z, vx: Math.cos(a) * sp, vy: rnd(1, 3), vz: Math.sin(a) * sp, drag: 1.4, g: -0.4, t: 0, life: rnd(2, 3.6), s0: 1, s1: 3.4, c: [0.2, 0.19, 0.18], a: 0.6, fin: 0.2, rot: Math.random() * 6, spin: rnd(-0.6, 0.6) });
      }
      api.sparks(x, 0.6, z, 30);
      api.chips(x, 0.5, z, "metal", 12);
    },
    slamDust(x, z, r) {
      for (let i = 0; i < 36 * cap; i++) {
        const a = (i / 36) * Math.PI * 2;
        alpha.spawn({ x: x + Math.cos(a) * r * 0.3, y: 0.2, z: z + Math.sin(a) * r * 0.3, vx: Math.cos(a) * r * 2.2, vy: rnd(0.2, 0.9), vz: Math.sin(a) * r * 2.2, drag: 3.5, t: 0, life: rnd(0.8, 1.3), s0: 0.5, s1: 1.6, c: C.dust, a: 0.6, rot: Math.random() * 6 });
      }
    },
    splash(x, z) {
      add.spawn({ x, y: 0.05, z, vx: 0, vy: 0, vz: 0, t: 0, life: 0.18, s0: 0.05, s1: 0.22, c: [0.7, 0.75, 0.8], a: 0.35, rot: 0 });
    },
    sparkle(x, y, z, color = [1, 0.9, 0.5]) {
      add.spawn({ x: x + rnd(-0.3, 0.3), y: y + rnd(0, 0.4), z: z + rnd(-0.3, 0.3), vx: 0, vy: rnd(0.3, 0.7), vz: 0, t: 0, life: rnd(0.6, 1), s0: 0.12, s1: 0.02, c: color, a: 0.9, rot: 0 });
    },
    levelUp(x, z) {
      for (let i = 0; i < 40 * cap; i++) {
        const a = Math.random() * Math.PI * 2;
        add.spawn({ x: x + Math.cos(a) * 0.6, y: rnd(0, 0.3), z: z + Math.sin(a) * 0.6, vx: Math.cos(a) * 0.3, vy: rnd(1.5, 3.5), vz: Math.sin(a) * 0.3, drag: 1, t: 0, life: rnd(0.8, 1.4), s0: 0.14, s1: 0.03, c: [1, 0.86, 0.4], a: 1, rot: 0 });
      }
    },

    /* -------- rings: call beginRings() each frame, then ring(...) per telegraph */
    beginRings() {
      ringN = 0;
    },
    ring(x, z, r, fill, color = "#ff3a2a", alphaK = 1) {
      if (ringN >= rings.length) return;
      const R = rings[ringN++];
      R.g.visible = true;
      R.g.position.set(x, 0.04, z);
      R.r.scale.setScalar(r);
      R.d.scale.setScalar(Math.max(0.01, r * fill));
      R.r.material.color.set(color);
      R.d.material.color.set(color);
      R.r.material.opacity = 0.75 * alphaK;
      R.d.material.opacity = (0.18 + 0.25 * fill) * alphaK;
    },
    endRings() {
      for (let i = ringN; i < rings.length; i++) rings[i].g.visible = false;
    },

    /* -------- ground glows */
    setGlows(list) {
      let n = 0;
      for (const g of list) {
        if (n >= 160) break;
        _m.makeScale(g.r * 2, 1, g.r * 2);
        _m.setPosition(g.x, 0.03 + n * 0.0001, g.z);
        glowIM.setMatrixAt(n, _m);
        _c.set(g.color).multiplyScalar(g.k);
        glowIM.setColorAt(n, _c);
        n++;
      }
      glowIM.count = n;
      glowIM.instanceMatrix.needsUpdate = true;
      if (glowIM.instanceColor) glowIM.instanceColor.needsUpdate = true;
    },

    update(dt) {
      alpha.update(dt);
      add.update(dt);
      chips.update(dt);
    },
    clear() {
      alpha.P.length = 0;
      add.P.length = 0;
      chips.P.length = 0;
    },
    dispose() {
      alpha.dispose();
      add.dispose();
      chips.dispose();
      for (const R of rings) {
        scene.remove(R.g);
        R.r.material.dispose();
        R.d.material.dispose();
      }
      ringGeo.dispose();
      discGeo.dispose();
      scene.remove(glowIM);
      glowGeo.dispose();
      glowMat.dispose();
    },
  };
  return api;
}
