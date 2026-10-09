/**
 * Kart Legends — race effects, all pooled (no per-frame allocation):
 *
 *   Particles   one Points cloud for tyre smoke, drift sparks (blue → orange
 *               → purple with the drift tier), boost flame puffs, off-road
 *               dust / snow spray and pad bursts
 *   SkidMarks   a ring buffer of dark quads laid behind sliding rear wheels
 *               (drifting, or sliding on ice)
 * Both read the engine racers directly every frame.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { softDot } from "./textures.js";

const MAX = 900;
const SPARK = ["#7fd4ff", "#ffa531", "#d76bff"];

const P_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * 340.0 / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const P_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor, t.a * vAlpha);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

function makePool(blending) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const alpha = new Float32Array(MAX);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const m = new THREE.ShaderMaterial({
    vertexShader: P_VERT,
    fragmentShader: P_FRAG,
    uniforms: { uMap: { value: softDot() } },
    transparent: true,
    depthWrite: false,
    blending,
  });
  const parts = [];
  for (let i = 0; i < MAX; i++) parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.3, s1: 1, a0: 1, r: 1, g: 1, b: 1, drag: 1, grav: 0 });
  return { g, m, parts, cursor: 0, pos, col, size, alpha };
}

const tmpC = new THREE.Color();
function spawn(pool, o) {
  const p = pool.parts[pool.cursor];
  pool.cursor = (pool.cursor + 1) % MAX;
  p.life = p.max = o.life;
  p.x = o.x;
  p.y = o.y;
  p.z = o.z;
  p.vx = o.vx || 0;
  p.vy = o.vy || 0;
  p.vz = o.vz || 0;
  p.s0 = o.s0;
  p.s1 = o.s1;
  p.a0 = o.a ?? 1;
  tmpC.set(o.color);
  p.r = tmpC.r;
  p.g = tmpC.g;
  p.b = tmpC.b;
  p.drag = o.drag ?? 1.5;
  p.grav = o.grav ?? 0;
}

function integrate(pool, dt) {
  const { parts, pos, col, size, alpha } = pool;
  for (let i = 0; i < MAX; i++) {
    const p = parts[i];
    if (p.life <= 0) {
      alpha[i] = 0;
      continue;
    }
    p.life -= dt;
    const k = Math.max(0, p.life / p.max);
    const d = Math.exp(-p.drag * dt);
    p.vx *= d;
    p.vz *= d;
    p.vy = p.vy * d - p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    col[i * 3] = p.r;
    col[i * 3 + 1] = p.g;
    col[i * 3 + 2] = p.b;
    size[i] = p.s1 + (p.s0 - p.s1) * k;
    alpha[i] = p.a0 * Math.min(1, k * 2.5);
  }
  for (const a of ["position", "aColor", "aSize", "aAlpha"]) pool.g.attributes[a].needsUpdate = true;
}

/** Rear wheel world positions for kart K (left, right). */
function rearWheels(K, out) {
  const s = Math.sin(K.h);
  const c = Math.cos(K.h);
  const back = -0.85;
  const half = 0.62;
  out[0] = K.x + s * back + c * half;
  out[1] = K.z + c * back - s * half;
  out[2] = K.x + s * back - c * half;
  out[3] = K.z + c * back + s * half;
  return out;
}

export function Particles({ race, world, bus, quality }) {
  const smoke = useMemo(() => makePool(THREE.NormalBlending), []);
  const glow = useMemo(() => makePool(THREE.AdditiveBlending), []);
  useEffect(
    () => () => {
      for (const p of [smoke, glow]) {
        p.g.dispose();
        p.m.dispose();
      }
    },
    [smoke, glow],
  );
  const acc = useRef(new Map());
  const wh = useMemo(() => [0, 0, 0, 0], []);
  const theme = world.theme;
  const dust = theme === "snow" ? "#f4f8ff" : theme === "desert" ? "#e2b98a" : theme === "tropical" ? "#e8d6a8" : theme === "neon" ? "#8a7cff" : "#ffffff";
  const rate = quality === "low" ? 0.5 : 1;
  // dark scenes read smoke as heavy grey blobs: thinner there
  const smokeA = theme === "neon" ? 0.4 : 1;

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    // event bursts (pads, bumps, walls, mini-turbos)
    const evs = bus.current;
    while (evs.length) {
      const e = evs.shift();
      const n = Math.round((e.n || 14) * rate);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (e.speed || 4) * (0.4 + Math.random() * 0.8);
        (e.add ? glow : smoke) === glow
          ? spawn(glow, { x: e.x, y: e.y + 0.4, z: e.z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 3, vz: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4, s0: 0.35, s1: 0.05, color: e.color, grav: 6, drag: 2 })
          : spawn(smoke, { x: e.x, y: e.y + 0.3, z: e.z, vx: Math.cos(a) * sp, vy: 0.6 + Math.random(), vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, s0: 0.6, s1: 2.2, a: 0.55, color: e.color, drag: 3 });
      }
    }
    for (const r of race.racers) {
      const K = r.kart;
      const v = Math.abs(K.vF);
      let a = acc.current.get(r.id) || 0;
      a += dt * rate;
      const every = 1 / 40;
      while (a > every) {
        a -= every;
        rearWheels(K, wh);
        const fs = Math.sin(K.h);
        const fc = Math.cos(K.h);
        const sliding = K.drift.on || (K.ice && Math.abs(K.vS) > 2.5);
        if (sliding && v > 6) {
          for (let w = 0; w < 2; w++) {
            const x = wh[w * 2];
            const z = wh[w * 2 + 1];
            if (Math.random() < 0.7) spawn(smoke, { x, y: K.y + 0.25, z, vx: -fs * v * 0.15 + (Math.random() - 0.5), vy: 0.5 + Math.random() * 0.6, vz: -fc * v * 0.15 + (Math.random() - 0.5), life: 0.7 + Math.random() * 0.4, s0: 0.5, s1: 2, a: (K.ice ? 0.35 : 0.45) * smokeA, color: K.ice ? "#eaf6ff" : theme === "neon" ? "#b9a8ff" : "#e9e6e1", drag: 2.5 });
            if (K.drift.on && K.drift.tier > 0) {
              const col = SPARK[K.drift.tier - 1];
              const sp = 2 + Math.random() * 3;
              const ang = Math.random() * Math.PI * 2;
              spawn(glow, { x, y: K.y + 0.15, z, vx: Math.cos(ang) * sp - fs * 2, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(ang) * sp - fc * 2, life: 0.25 + Math.random() * 0.25, s0: 0.28 + K.drift.tier * 0.04, s1: 0.04, color: col, grav: 9, drag: 1 });
            }
          }
        }
        if (K.offroad && v > 5 && Math.random() < 0.8) {
          const w = Math.random() < 0.5 ? 0 : 1;
          spawn(smoke, { x: wh[w * 2], y: K.y + 0.2, z: wh[w * 2 + 1], vx: -fs * v * 0.2 + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 1.5, vz: -fc * v * 0.2 + (Math.random() - 0.5) * 2, life: 0.6 + Math.random() * 0.3, s0: 0.5, s1: 1.8, a: 0.5 * smokeA, color: dust, drag: 2.5, grav: 1.5 });
        }
        if (K.boostT > 0 && Math.random() < 0.9) {
          const bx = K.x - fs * 1.15;
          const bz = K.z - fc * 1.15;
          spawn(glow, { x: bx + (Math.random() - 0.5) * 0.5, y: K.y + 0.5, z: bz + (Math.random() - 0.5) * 0.5, vx: -fs * 4, vy: 0.4, vz: -fc * 4, life: 0.18 + Math.random() * 0.12, s0: 0.55, s1: 0.1, color: K.boostKind === "pad" ? "#ffb21a" : K.boostKind === "meter" ? "#5ad8ff" : "#ff7a2a", drag: 3 });
        }
      }
      acc.current.set(r.id, a);
    }
    integrate(smoke, dt);
    integrate(glow, dt);
  });
  return (
    <group>
      <points geometry={smoke.g} material={smoke.m} frustumCulled={false} renderOrder={2} />
      <points geometry={glow.g} material={glow.m} frustumCulled={false} renderOrder={3} />
    </group>
  );
}

const SKID_MAX = 1400;
export function SkidMarks({ race, world }) {
  const ref = useRef();
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.28, 0.75);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: world.theme === "snow" ? "#9fb0c4" : world.theme === "neon" ? "#000000" : "#1a1a1a", transparent: true, opacity: world.theme === "snow" ? 0.45 : 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), [world.theme]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const st = useRef({ cursor: 0, count: 0, last: new Map() });
  const o = useMemo(() => new THREE.Object3D(), []);
  const wh = useMemo(() => [0, 0, 0, 0], []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    o.position.set(0, -1000, 0);
    o.updateMatrix();
    for (let i = 0; i < SKID_MAX; i++) m.setMatrixAt(i, o.matrix);
    m.instanceMatrix.needsUpdate = true;
  }, [o]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const S = st.current;
    let dirty = false;
    for (const r of race.racers) {
      const K = r.kart;
      const sliding = (K.drift.on || (K.ice && Math.abs(K.vS) > 2.5) || (Math.abs(K.vS) > 4 && !K.offroad)) && Math.abs(K.vF) > 6;
      const last = S.last.get(r.id);
      if (!sliding || K.offroad) {
        S.last.delete(r.id);
        continue;
      }
      if (last && Math.hypot(K.x - last.x, K.z - last.z) < 0.55) continue;
      S.last.set(r.id, { x: K.x, z: K.z });
      rearWheels(K, wh);
      // mark heading = direction of travel (not the kart's nose)
      const vx = Math.sin(K.h) * K.vF + Math.cos(K.h) * K.vS;
      const vz = Math.cos(K.h) * K.vF - Math.sin(K.h) * K.vS;
      const yaw = Math.atan2(vx, vz);
      for (let w = 0; w < 2; w++) {
        o.position.set(wh[w * 2], K.y + 0.035, wh[w * 2 + 1]);
        o.rotation.set(0, yaw, 0);
        o.updateMatrix();
        m.setMatrixAt(S.cursor, o.matrix);
        S.cursor = (S.cursor + 1) % SKID_MAX;
      }
      dirty = true;
    }
    if (dirty) m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, SKID_MAX]} frustumCulled={false} renderOrder={1} />;
}
