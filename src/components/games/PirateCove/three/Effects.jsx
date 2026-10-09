/**
 * Pirate Cove — effects. Everything is pooled and fixed-size (no allocation
 * per shot, nothing to leak):
 *
 *   smoke   normal-blended puffs (cannon smoke, damage smoke, sand, dust)
 *   glow    additive (muzzle flash, fire, sparks, treasure glints)
 *   spray   water (splashes, bow spray, wake foam)
 *   debris  instanced wood chunks — tumble, then float on the swell and sink
 *   coins   instanced gold coins for chest bursts
 *   wakes   one foam ribbon per ship, widening and fading with age
 *
 * `fx` is a plain object the scene's event handler calls (fx.muzzle(...)).
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { softDot, puffSprite, foamTexture } from "./textures.js";
import { waveHeight } from "../engine/waves.js";
import { forwardOf, rightOf } from "../engine/ship.js";
import { M } from "./materials.js";

const pVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aRot;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  uniform float uScale;
  #include <fog_pars_vertex>
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vRot = aRot;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const pFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uTint;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  #include <fog_pars_fragment>
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vRot); float s = sin(vRot);
    uv = mat2(c, -s, s, c) * uv + 0.5;
    vec4 t = texture2D(uMap, uv);
    gl_FragColor = vec4(vColor * uTint * t.rgb, t.a * vAlpha);
    if (gl_FragColor.a < 0.004) discard;
    #include <fog_fragment>
  }
`;

function makePool(n, map, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aRot", new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({
    vertexShader: pVert,
    fragmentShader: pFrag,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: map }, uScale: { value: 600 }, uTint: { value: new THREE.Color(1, 1, 1) } }]),
    transparent: true,
    depthWrite: false,
    blending,
    fog: true,
  });
  mat.uniforms.uMap.value = map;
  const P = {
    n,
    geo,
    mat,
    next: 0,
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    vz: new Float32Array(n),
    life: new Float32Array(n),
    max: new Float32Array(n),
    s0: new Float32Array(n),
    s1: new Float32Array(n),
    a0: new Float32Array(n),
    r: new Float32Array(n),
    g: new Float32Array(n),
    b: new Float32Array(n),
    drag: new Float32Array(n),
    grav: new Float32Array(n),
    rot: new Float32Array(n),
    spin: new Float32Array(n),
  };
  return P;
}

const tmpC = new THREE.Color();
function emit(P, o) {
  const i = P.next;
  P.next = (P.next + 1) % P.n;
  P.x[i] = o.x;
  P.y[i] = o.y;
  P.z[i] = o.z;
  P.vx[i] = o.vx || 0;
  P.vy[i] = o.vy || 0;
  P.vz[i] = o.vz || 0;
  P.life[i] = 0;
  P.max[i] = o.life || 1;
  P.s0[i] = o.s0 ?? 1;
  P.s1[i] = o.s1 ?? P.s0[i];
  P.a0[i] = o.a ?? 1;
  tmpC.set(o.color || "#ffffff");
  P.r[i] = tmpC.r;
  P.g[i] = tmpC.g;
  P.b[i] = tmpC.b;
  P.drag[i] = o.drag ?? 1;
  P.grav[i] = o.grav ?? 0;
  P.rot[i] = Math.random() * 6.28;
  P.spin[i] = (Math.random() - 0.5) * (o.spin ?? 1);
}

function stepPool(P, dt, fade = "out") {
  const pos = P.geo.attributes.position.array;
  const sz = P.geo.attributes.aSize.array;
  const al = P.geo.attributes.aAlpha.array;
  const co = P.geo.attributes.aColor.array;
  const ro = P.geo.attributes.aRot.array;
  for (let i = 0; i < P.n; i++) {
    if (P.life[i] >= P.max[i]) {
      al[i] = 0;
      continue;
    }
    P.life[i] += dt;
    const k = Math.exp(-P.drag[i] * dt);
    P.vx[i] *= k;
    P.vz[i] *= k;
    P.vy[i] = P.vy[i] * k - P.grav[i] * dt;
    P.x[i] += P.vx[i] * dt;
    P.y[i] += P.vy[i] * dt;
    P.z[i] += P.vz[i] * dt;
    P.rot[i] += P.spin[i] * dt;
    const u = Math.min(1, P.life[i] / P.max[i]);
    pos[i * 3] = P.x[i];
    pos[i * 3 + 1] = P.y[i];
    pos[i * 3 + 2] = P.z[i];
    sz[i] = P.s0[i] + (P.s1[i] - P.s0[i]) * Math.sqrt(u);
    al[i] = P.a0[i] * (fade === "inout" ? Math.min(1, u * 8) * (1 - u) * (1 - u) : (1 - u) * (1 - u * 0.5));
    co[i * 3] = P.r[i];
    co[i * 3 + 1] = P.g[i];
    co[i * 3 + 2] = P.b[i];
    ro[i] = P.rot[i];
  }
  P.geo.attributes.position.needsUpdate = true;
  P.geo.attributes.aSize.needsUpdate = true;
  P.geo.attributes.aAlpha.needsUpdate = true;
  P.geo.attributes.aColor.needsUpdate = true;
  P.geo.attributes.aRot.needsUpdate = true;
}

const R = () => Math.random() - 0.5;

/** Creates the effect API + pools. Called once per scene. */
export function createFX(quality = "medium") {
  const q = quality === "low" ? 0.5 : quality === "high" ? 1.25 : 1;
  const smoke = makePool(Math.round(700 * q), puffSprite(), THREE.NormalBlending);
  const glow = makePool(Math.round(500 * q), softDot(), THREE.AdditiveBlending);
  const spray = makePool(Math.round(900 * q), softDot(), THREE.NormalBlending);
  const nDebris = 90;
  const debris = { n: nDebris, next: 0, items: Array.from({ length: nDebris }, () => ({ alive: false })) };
  const nCoins = 60;
  const coins = { n: nCoins, next: 0, items: Array.from({ length: nCoins }, () => ({ alive: false })) };
  const env = { time: 0, waveAmp: 1, scale: 1 };
  const N = (c) => Math.max(1, Math.round(c * q));

  const fx = {
    pools: { smoke, glow, spray },
    debris,
    coins,
    env,
    muzzle(x, y, z, dx, dz, big) {
      for (let i = 0; i < 3; i++) emit(glow, { x: x + dx * 0.6, y, z: z + dz * 0.6, vx: dx * 6, vz: dz * 6, life: 0.14 + i * 0.03, s0: big ? 9 : 6, s1: big ? 12 : 8, color: "#ffd27a", drag: 4 });
      for (let i = 0; i < N(10); i++) {
        const sp = 6 + Math.random() * 10;
        emit(smoke, { x: x + dx * 0.8, y: y + R() * 0.4, z: z + dz * 0.8, vx: dx * sp + R() * 2, vy: 0.6 + Math.random() * 1.6, vz: dz * sp + R() * 2, life: 2.4 + Math.random() * 1.8, s0: 2.2, s1: 7 + Math.random() * 4, color: "#e8e4dc", a: 0.55, drag: 1.6, spin: 0.6 });
      }
      for (let i = 0; i < N(6); i++) emit(glow, { x, y, z, vx: dx * (12 + Math.random() * 10) + R() * 4, vy: Math.random() * 4, vz: dz * (12 + Math.random() * 10) + R() * 4, life: 0.35, s0: 0.6, s1: 0.2, color: "#ffb04a", drag: 2, grav: 6 });
    },
    splash(x, y, z, big) {
      const s = big ? 1.5 : 1;
      for (let i = 0; i < N(22); i++) {
        const a = Math.random() * 6.28;
        const r = Math.random() * 1.2;
        emit(spray, { x: x + Math.cos(a) * r * 0.4, y, z: z + Math.sin(a) * r * 0.4, vx: Math.cos(a) * r * 2.4, vy: (5 + Math.random() * 7) * s, vz: Math.sin(a) * r * 2.4, life: 1 + Math.random() * 0.5, s0: 1.4 * s, s1: 2.6 * s, color: "#f2fbff", a: 0.85, drag: 0.6, grav: 14 });
      }
      for (let i = 0; i < N(12); i++) {
        const a = (i / 12) * 6.28;
        emit(spray, { x, y: y + 0.1, z, vx: Math.cos(a) * 3.5, vy: 0.3, vz: Math.sin(a) * 3.5, life: 1.6, s0: 1.8, s1: 4.2, color: "#e8f6ff", a: 0.55, drag: 2.2 });
      }
    },
    hit(x, y, z, vx = 0, vz = 0) {
      const l = Math.hypot(vx, vz) || 1;
      for (let i = 0; i < N(6); i++) {
        const d = debris.items[debris.next];
        debris.next = (debris.next + 1) % debris.n;
        Object.assign(d, { alive: true, x, y: y + 0.5, z, vx: (vx / l) * (3 + Math.random() * 5) + R() * 5, vy: 4 + Math.random() * 6, vz: (vz / l) * (3 + Math.random() * 5) + R() * 5, rx: Math.random() * 6, ry: Math.random() * 6, sx: R() * 12, sy: R() * 12, life: 0, max: 7 + Math.random() * 4, s: 0.35 + Math.random() * 0.45 });
      }
      for (let i = 0; i < N(6); i++) emit(smoke, { x, y: y + 0.6, z, vx: R() * 3, vy: 1 + Math.random() * 2, vz: R() * 3, life: 1.6, s0: 1.5, s1: 4.5, color: "#7a6e60", a: 0.6, drag: 1.4 });
      for (let i = 0; i < N(10); i++) emit(glow, { x, y: y + 0.6, z, vx: R() * 10, vy: Math.random() * 7, vz: R() * 10, life: 0.4, s0: 0.5, s1: 0.15, color: "#ffb04a", drag: 1.5, grav: 12 });
    },
    landHit(x, y, z) {
      for (let i = 0; i < N(10); i++) emit(smoke, { x, y: y + 0.3, z, vx: R() * 5, vy: 1.5 + Math.random() * 3, vz: R() * 5, life: 1.8, s0: 1.2, s1: 4, color: "#c9b48a", a: 0.6, drag: 1.5, grav: 1 });
    },
    damageSmoke(x, y, z, heavy, fire) {
      emit(smoke, { x: x + R() * 2, y, z: z + R() * 2, vx: R() * 0.6, vy: 2.5 + Math.random() * 1.5, vz: R() * 0.6, life: 3.5, s0: 2, s1: 8, color: heavy ? "#3a3632" : "#6a645c", a: 0.5, drag: 0.4 });
      if (fire) emit(glow, { x: x + R() * 1.5, y: y - 0.3, z: z + R() * 1.5, vx: R() * 0.4, vy: 2 + Math.random() * 2, vz: R() * 0.4, life: 0.6, s0: 2.2, s1: 0.6, color: "#ff8a2a", drag: 0.5 });
    },
    wakeSpray(x, y, z, vx, vz, k) {
      emit(spray, { x, y: y + 0.2, z, vx, vy: 1 + Math.random() * 2 * k, vz, life: 0.9, s0: 1, s1: 2.6, color: "#ffffff", a: 0.45 * k, drag: 1.5, grav: 6 });
    },
    sparkle(x, y, z, color = "#ffe08a", n = 12) {
      for (let i = 0; i < N(n); i++) emit(glow, { x: x + R() * 0.8, y: y + Math.random() * 0.5, z: z + R() * 0.8, vx: R() * 1.5, vy: 1.5 + Math.random() * 2.5, vz: R() * 1.5, life: 1.2 + Math.random() * 0.6, s0: 0.5, s1: 0.1, color, drag: 1.2 });
    },
    chestBurst(x, y, z) {
      fx.sparkle(x, y + 0.6, z, "#ffd36a", 28);
      for (let i = 0; i < 18; i++) {
        const c = coins.items[coins.next];
        coins.next = (coins.next + 1) % coins.n;
        const a = Math.random() * 6.28;
        Object.assign(c, { alive: true, x, y: y + 0.7, z, vx: Math.cos(a) * (1 + Math.random() * 2), vy: 4 + Math.random() * 3, vz: Math.sin(a) * (1 + Math.random() * 2), rx: 0, sx: R() * 20, life: 0, max: 2.2, floor: y + 0.05 });
      }
    },
    dust(x, y, z, color = "#d8c49a", n = 8) {
      for (let i = 0; i < N(n); i++) emit(smoke, { x: x + R() * 0.6, y: y + 0.2, z: z + R() * 0.6, vx: R() * 2.5, vy: 0.8 + Math.random() * 1.6, vz: R() * 2.5, life: 1, s0: 0.5, s1: 1.8, color, a: 0.55, drag: 2, grav: 1 });
    },
    sparks(x, y, z, color = "#ffd27a", n = 10) {
      for (let i = 0; i < N(n); i++) emit(glow, { x, y, z, vx: R() * 7, vy: Math.random() * 5, vz: R() * 7, life: 0.3, s0: 0.35, s1: 0.1, color, drag: 2, grav: 10 });
    },
    boneDust(x, y, z, color = "#d8d2c0") {
      for (let i = 0; i < N(16); i++) emit(smoke, { x: x + R(), y: y + Math.random() * 1.6, z: z + R(), vx: R() * 1.5, vy: 0.5 + Math.random(), vz: R() * 1.5, life: 1.8, s0: 0.6, s1: 2.2, color, a: 0.5, drag: 1.2 });
    },
    sinkBurst(x, y, z) {
      for (let i = 0; i < N(26); i++) emit(spray, { x: x + R() * 12, y, z: z + R() * 12, vx: R() * 2, vy: 3 + Math.random() * 6, vz: R() * 2, life: 1.6, s0: 2, s1: 4, color: "#f2fbff", a: 0.7, drag: 0.5, grav: 9 });
      for (let i = 0; i < 10; i++) fx.hit(x + R() * 8, y + 1, z + R() * 8, R(), R());
    },
    reset() {
      for (const P of [smoke, glow, spray]) P.life.fill(99);
      for (const d of debris.items) d.alive = false;
      for (const c of coins.items) c.alive = false;
    },
    dispose() {
      for (const P of [smoke, glow, spray]) {
        P.geo.dispose();
        P.mat.dispose();
      }
    },
  };
  for (const P of [smoke, glow, spray]) P.life.fill(99);
  return fx;
}

const debrisGeo = new THREE.BoxGeometry(1, 0.22, 0.32);
const coinGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10);

export function Effects({ fx }) {
  const deb = useRef();
  const coin = useRef();
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => fx.dispose(), [fx]);
  useFrame(({ size }, dt) => {
    const d = Math.min(dt, 0.05);
    for (const P of Object.values(fx.pools)) P.mat.uniforms.uScale.value = size.height * 0.9;
    stepPool(fx.pools.smoke, d);
    stepPool(fx.pools.glow, d);
    stepPool(fx.pools.spray, d);
    const E = fx.env;
    if (deb.current) {
      let i = 0;
      for (const p of fx.debris.items) {
        if (p.alive) {
          p.life += d;
          const w = waveHeight(p.x, p.z, E.time, E.waveAmp);
          if (p.y > w || p.vy > 0) {
            p.vy -= 18 * d;
            p.x += p.vx * d;
            p.y += p.vy * d;
            p.z += p.vz * d;
            p.rx += p.sx * d;
            p.ry += p.sy * d;
          } else {
            // floating
            p.vx *= 0.97;
            p.vz *= 0.97;
            p.vy = 0;
            p.x += p.vx * d;
            p.z += p.vz * d;
            const sink = Math.max(0, p.life - p.max + 2) * 0.4;
            p.y = w - 0.05 - sink;
            p.sx *= 0.95;
            p.sy *= 0.95;
            p.rx += p.sx * d;
          }
          if (p.life > p.max) p.alive = false;
        }
        e.set(p.rx || 0, p.ry || 0, 0);
        q.setFromEuler(e);
        v.set(p.x || 0, p.alive ? p.y : -999, p.z || 0);
        s.setScalar(p.alive ? p.s : 0.001);
        m.compose(v, q, s);
        deb.current.setMatrixAt(i++, m);
      }
      deb.current.instanceMatrix.needsUpdate = true;
    }
    if (coin.current) {
      let i = 0;
      for (const c of fx.coins.items) {
        if (c.alive) {
          c.life += d;
          c.vy -= 16 * d;
          c.x += c.vx * d;
          c.y += c.vy * d;
          c.z += c.vz * d;
          if (c.y < c.floor) {
            c.y = c.floor;
            c.vy *= -0.35;
            c.vx *= 0.6;
            c.vz *= 0.6;
          }
          c.rx += c.sx * d;
          if (c.life > c.max) c.alive = false;
        }
        e.set(c.rx || 0, 0, 0.4);
        q.setFromEuler(e);
        v.set(c.x || 0, c.alive ? c.y : -999, c.z || 0);
        s.setScalar(c.alive ? 1 : 0.001);
        m.compose(v, q, s);
        coin.current.setMatrixAt(i++, m);
      }
      coin.current.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group>
      <points geometry={fx.pools.spray.geo} material={fx.pools.spray.mat} frustumCulled={false} renderOrder={5} />
      <points geometry={fx.pools.smoke.geo} material={fx.pools.smoke.mat} frustumCulled={false} renderOrder={6} />
      <points geometry={fx.pools.glow.geo} material={fx.pools.glow.mat} frustumCulled={false} renderOrder={7} />
      <instancedMesh ref={deb} args={[debrisGeo, M.wood(), fx.debris.n]} frustumCulled={false} castShadow />
      <instancedMesh ref={coin} args={[coinGeo, M.gold(), fx.coins.n]} frustumCulled={false} />
    </group>
  );
}

// ---------------------------------------------------------------- wakes

const wakeVert = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vAlpha = aAlpha;
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const wakeFrag = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    float edge = sin(vUv.x * 3.14159);
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vAlpha * (0.35 + 0.65 * edge);
    gl_FragColor = vec4(vec3(1.0), a);
    if (a < 0.01) discard;
    #include <fog_fragment>
  }
`;

const WAKE_N = 44;

export function Wake({ ship, env, fx }) {
  const pts = useRef([]);
  const acc = useRef(0);
  const sprayAcc = useRef(0);
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(WAKE_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(WAKE_N * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(WAKE_N * 2 * 2);
    for (let i = 0; i < WAKE_N; i++) {
      uv[i * 4] = 0;
      uv[i * 4 + 1] = i / 6;
      uv[i * 4 + 2] = 1;
      uv[i * 4 + 3] = i / 6;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let i = 0; i < WAKE_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.ShaderMaterial({
      vertexShader: wakeVert,
      fragmentShader: wakeFrag,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null } }]),
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    m.uniforms.uMap.value = foamTexture();
    m.uniforms.uMap.value.wrapT = THREE.RepeatWrapping;
    return { geo: g, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame((_, dt) => {
    const s = ship;
    const L = s.stats.length;
    const f = forwardOf(s.heading);
    const r = rightOf(s.heading);
    const spd = Math.abs(s.speed);
    const k = Math.min(1, spd / (s.stats.maxSpeed * 0.8));
    acc.current += dt;
    if (acc.current > 0.11 && !s.removed) {
      acc.current = 0;
      pts.current.unshift({ x: s.x - f.x * L * 0.45, z: s.z - f.z * L * 0.45, rx: r.x, rz: r.z, age: 0, k: s.alive ? k : 0 });
      if (pts.current.length > WAKE_N) pts.current.length = WAKE_N;
    }
    for (const p of pts.current) p.age += dt;
    // bow spray
    sprayAcc.current += dt * k * 18;
    while (sprayAcc.current > 1 && fx) {
      sprayAcc.current -= 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      const bx = s.x + f.x * L * 0.42 + r.x * side * s.stats.beam * 0.35;
      const bz = s.z + f.z * L * 0.42 + r.z * side * s.stats.beam * 0.35;
      fx.wakeSpray(bx, s.y, bz, r.x * side * 3 + f.x * spd * 0.3, r.z * side * 3 + f.z * spd * 0.3, k);
    }
    const pos = geo.attributes.position.array;
    const al = geo.attributes.aAlpha.array;
    const B = s.stats.beam;
    for (let i = 0; i < WAKE_N; i++) {
      const p = pts.current[i] || pts.current[pts.current.length - 1];
      if (!p) {
        al[i * 2] = al[i * 2 + 1] = 0;
        continue;
      }
      const w = B * 0.45 + p.age * 1.9;
      const y = waveHeight(p.x, p.z, env.time, env.waveAmp) + 0.09;
      pos[i * 6] = p.x - p.rx * w;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = p.z - p.rz * w;
      pos[i * 6 + 3] = p.x + p.rx * w;
      pos[i * 6 + 4] = y;
      pos[i * 6 + 5] = p.z + p.rz * w;
      const a = Math.max(0, 1 - p.age / 4.6) * p.k * (i === 0 ? 0 : 1) * (pts.current[i] ? 1 : 0);
      al[i * 2] = al[i * 2 + 1] = a * 0.85;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />;
}
