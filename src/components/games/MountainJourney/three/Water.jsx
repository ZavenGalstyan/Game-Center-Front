/**
 * Mountain Journey — water: flowing river / stream ribbons, still lakes and
 * pools, waterfalls (scrolling streak sheets with foam and drifting mist)
 * and their frozen variant in the snow region. One small custom shader:
 * two scrolling normal samples, fresnel sky tint, a sun glint, edge foam.
 * No simulation — cheap enough for every level.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { waterNormal, fallTex, softDot } from "./textures.js";

const VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aFoam;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vFoam;
  void main() {
    vUv = uv;
    vFoam = aFoam;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uFlow;
  uniform float uLake;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform sampler2D uNormal;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vFoam;
  void main() {
    vec2 base = uLake > 0.5 ? vWorld.xz * 0.06 : vUv;
    vec2 uv1 = vec2(base.x * 1.3, base.y - uTime * uFlow * 0.45);
    vec2 uv2 = vec2(base.x * 0.7 + 0.31, base.y * 0.6 - uTime * uFlow * 0.27);
    if (uLake > 0.5) { uv1 += vec2(uTime * 0.012, uTime * 0.008); uv2 -= vec2(uTime * 0.01, -uTime * 0.006); }
    vec3 n1 = texture2D(uNormal, uv1).xyz * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormal, uv2).xyz * 2.0 - 1.0;
    vec3 n = normalize(vec3(n1.x + n2.x, 2.6, n1.y + n2.y));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(V, n), 0.0), 3.0);
    float edgeD = uLake > 0.5 ? 0.5 - length(vUv - 0.5) : min(vUv.x, 1.0 - vUv.x);
    float edge = 1.0 - smoothstep(0.0, uLake > 0.5 ? 0.04 : 0.16, edgeD);
    float ripple = 0.55 + 0.45 * sin(vUv.y * 14.0 - uTime * uFlow * 4.0 + vUv.x * 23.0 + n1.x * 3.0);
    float foam = clamp(edge * 0.75 + vFoam, 0.0, 1.0) * ripple;
    vec3 col = mix(uShallow, uDeep, smoothstep(0.05, 0.45, edgeD));
    col = mix(col, uSky, clamp(fres * 0.75, 0.0, 0.8));
    vec3 H = normalize(normalize(uSunDir) + V);
    float spec = pow(max(dot(n, H), 0.0), 140.0);
    col += uSun * spec * 1.6;
    col = mix(col, vec3(0.93, 0.97, 1.0), foam * 0.75);
    gl_FragColor = vec4(col, 0.78 + fres * 0.18 + foam * 0.1);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function waterMaterial(env, { flow = 1, lake = false }) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uFlow: { value: flow },
        uLake: { value: lake ? 1 : 0 },
        uDeep: { value: new THREE.Color(env.deep) },
        uShallow: { value: new THREE.Color(env.shallow) },
        uSky: { value: new THREE.Color(env.sky) },
        uSun: { value: new THREE.Color(env.sunColor) },
        uSunDir: { value: env.sunDir.clone() },
        uNormal: { value: waterNormal() },
      },
    ]),
  });
}

/** Ribbons for one river, split at waterfalls. */
function riverGeometries(river, T) {
  const N = river.nodes;
  const parts = [];
  let cur = [];
  for (let i = 0; i < N.length; i++) {
    if (i > 0 && Math.hypot(N[i].x - N[i - 1].x, N[i].z - N[i - 1].z) < 0.4 && Math.abs(N[i].y - N[i - 1].y) > 0.5) {
      parts.push(cur);
      cur = [];
    }
    cur.push(N[i]);
  }
  parts.push(cur);
  const geos = [];
  for (const P of parts) {
    if (P.length < 2) continue;
    const pts = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i];
      const b = P[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(len / 1.5));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t });
      }
    }
    const l = P[P.length - 1];
    pts.push({ x: l.x, z: l.z, y: l.y, w: l.w });
    // only where the water really sits in its channel (not floating over a
    // valley it has run off into, nor buried inside a hill)
    const runs = [];
    let run = [];
    for (const p of pts) {
      const g = T.height(p.x, p.z);
      const ok = g < p.y - 0.05 && g > p.y - 6;
      if (ok) run.push(p);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);
    for (const R of runs) if (R.length >= 2) geos.push(ribbon(R, parts.indexOf(P) > 0));
  }
  return geos;
}

/** One water ribbon along a run of river samples. */
function ribbon(pts, afterFall) {
    const pos = [];
    const uv = [];
    const foam = [];
    const idx = [];
    let along = 0;
    pts.forEach((p, k) => {
      const q = pts[Math.min(pts.length - 1, k + 1)];
      const o = pts[Math.max(0, k - 1)];
      let dx = q.x - o.x;
      let dz = q.z - o.z;
      const ll = Math.hypot(dx, dz) || 1;
      dx /= ll;
      dz /= ll;
      if (k > 0) along += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z);
      const W = p.w + 0.3;
      for (const s of [-1, 1]) {
        pos.push(p.x - dz * W * s, p.y, p.z + dx * W * s);
        uv.push(s < 0 ? 0 : 1, along / 4);
        // foam right below a drop (start of a part that follows a fall)
        foam.push(afterFall ? Math.max(0, 1 - along / 6) : 0);
      }
    });
    for (let k = 0; k < pts.length - 1; k++) {
      const a = k * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("aFoam", new THREE.Float32BufferAttribute(foam, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
}

function lakeGeometry(L) {
  const g = new THREE.CircleGeometry(L.r + 0.6, 48);
  g.rotateX(-Math.PI / 2);
  g.translate(L.x, L.y, L.z);
  g.setAttribute("aFoam", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}

function Waterfall({ f, env }) {
  const sheet = useRef();
  const mist = useRef();
  const H = f.top - f.bottom;
  const geo = useMemo(() => {
    // a slightly bulging sheet: lip curls out, then drops
    const seg = 14;
    const pos = [];
    const uv = [];
    const idx = [];
    const W = f.w * 1.05;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const y = f.top - H * t;
      const out = 0.55 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) + t * 0.3;
      for (const s of [-1, 1]) {
        pos.push(s * W * (1 - t * 0.12), y, out);
        uv.push(s < 0 ? 0 : 1, (t * H) / 6);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [f, H]);
  const mat = useMemo(() => {
    const t = fallTex().clone();
    t.needsUpdate = true;
    t.repeat.set(1, 1);
    if (f.frozen)
      return new THREE.MeshStandardMaterial({ color: "#d8eef8", map: t, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.95, side: THREE.DoubleSide, emissive: "#9fc9e0", emissiveIntensity: 0.15 });
    return new THREE.MeshBasicMaterial({ color: "#e8f6ff", map: t, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, fog: true });
  }, [f.frozen]);
  const N = f.frozen ? 0 : 36;
  const mistData = useMemo(() => {
    const p = new Float32Array(N * 3);
    const s = [];
    for (let i = 0; i < N; i++) s.push({ t: Math.random() * 3, a: Math.random() * Math.PI * 2, r: Math.random() });
    return { p, s };
  }, [N]);
  const mistGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mistData.p, 3));
    return g;
  }, [mistData]);
  const mistMat = useMemo(() => new THREE.PointsMaterial({ map: softDot(), size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0.32, depthWrite: false, color: "#f2fbff", fog: true }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.map?.dispose();
      mat.dispose();
      mistGeo.dispose();
      mistMat.dispose();
    },
    [geo, mat, mistGeo, mistMat],
  );
  useFrame((_, dt) => {
    if (!f.frozen && mat.map) mat.map.offset.y += dt * 1.25;
    if (mist.current && N) {
      const p = mistData.p;
      mistData.s.forEach((m, i) => {
        m.t += dt * (0.35 + m.r * 0.3);
        if (m.t > 3) {
          m.t = 0;
          m.a = Math.random() * Math.PI * 2;
        }
        const k = m.t / 3;
        p[i * 3] = Math.cos(m.a) * (0.5 + k * f.w * 1.6);
        p[i * 3 + 1] = f.bottom - f.top + 0.2 + k * 2.2;
        p[i * 3 + 2] = 0.8 + Math.sin(m.a) * (0.4 + k * 1.6) + k * 1.4;
      });
      mist.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  return (
    <group position={[f.x, 0, f.z]} rotation={[0, Math.atan2(f.dirX, f.dirZ), 0]}>
      <mesh ref={sheet} geometry={geo} material={mat} position={[0, 0, -0.35]} />
      {N > 0 && <points ref={mist} geometry={mistGeo} material={mistMat} position={[0, f.top, 0]} frustumCulled={false} />}
    </group>
  );
}

/** Frozen water: a pale, glossy ice sheet instead of the flowing shader. */
function iceMaterial() {
  return new THREE.MeshStandardMaterial({ color: "#cfe6f2", roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.92, side: THREE.DoubleSide, emissive: "#9cc6dc", emissiveIntensity: 0.12 });
}

export default function Water({ L, env }) {
  const mats = useMemo(() => [], []);
  const rivers = useMemo(() => {
    const list = [];
    for (const r of L.rivers) {
      const frozen = r.frozen || (r.falls || []).some((f) => f.frozen);
      // frozen falls feed icy, slow (still liquid — and still too deep) water
      const m = waterMaterial(frozen ? { ...env, deep: "#3f6f86", shallow: "#a9d3e3" } : env, { flow: (r.kind === "falls" ? -1 : 1) * (r.kind === "stream" ? 1.4 : r.kind === "gorge" ? 1.8 : 1.1) * (frozen ? 0.4 : 1) });
      mats.push(m);
      for (const g of riverGeometries(r, L.terrain)) list.push({ g, m });
    }
    return list;
  }, [L, env, mats]);
  const lakes = useMemo(() => {
    const m = waterMaterial(env, { flow: 0.2, lake: true });
    const ice = iceMaterial();
    mats.push(m, ice);
    return L.lakes.map((lk) => ({ g: lakeGeometry(lk), m: lk.frozen || L.region.id >= 5 ? ice : m }));
  }, [L, env, mats]);
  useEffect(
    () => () => {
      rivers.forEach((r) => r.g.dispose());
      lakes.forEach((r) => r.g.dispose());
      mats.forEach((m) => m.dispose());
    },
    [rivers, lakes, mats],
  );
  useFrame(({ clock }) => {
    for (const m of mats) if (m.uniforms) m.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <group>
      {rivers.map((r, i) => (
        <mesh key={`r${i}`} geometry={r.g} material={r.m} renderOrder={2} />
      ))}
      {lakes.map((r, i) => (
        <mesh key={`l${i}`} geometry={r.g} material={r.m} renderOrder={2} />
      ))}
      {L.falls.map((f, i) => (
        <Waterfall key={`f${i}`} f={f} env={env} />
      ))}
    </group>
  );
}
