/**
 * Mountain Journey — the backdrop: a gradient sky dome with a sun glow,
 * three rings of distant mountain silhouettes (atmospheric tint per layer,
 * snow caps, a landmark summit standing ahead along the trail), drifting
 * cloud sprites and — up high — a sea of clouds below the trail.
 * None of it is fogged by the scene fog; each layer carries its own haze.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cloudTex } from "./textures.js";
import { ridged, fbm, mulberry32, smoothstep } from "../engine/rng.js";

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w * 0.99999;
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uCloud;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
    col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.25, h));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(s, 900.0) * 6.0 * (1.0 - uCloud * 0.7) + pow(s, 10.0) * 0.28 + pow(s, 3.0) * 0.08);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function SkyDome({ env }) {
  const ref = useRef();
  const { camera } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(env.skyTop) },
          uHorizon: { value: new THREE.Color(env.skyHorizon) },
          uSunColor: { value: new THREE.Color(env.sunColor) },
          uSunDir: { value: env.sunDir.clone() },
          uCloud: { value: env.clouds },
        },
      }),
    [env],
  );
  const geo = useMemo(() => new THREE.SphereGeometry(2400, 32, 16), []);
  useEffect(
    () => () => {
      mat.dispose();
      geo.dispose();
    },
    [mat, geo],
  );
  useFrame(() => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={-10} frustumCulled={false} />;
}

/** One ring of mountains around (cx, cz). */
function ringGeometry({ cx, cz, radius, base, height, seed, haze, hazeAmt, rock, snow, snowLine, peak }) {
  const seg = 220;
  const pos = [];
  const col = [];
  const idx = [];
  const cRock = new THREE.Color(rock);
  const cSnow = new THREE.Color(snow);
  const cHaze = new THREE.Color(haze);
  const tmp = new THREE.Color();
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    let hgt = ridged(Math.cos(a) * 3 + seed, Math.sin(a) * 3, seed, 5) * height + fbm(a * 4, seed, seed + 3, 3) * height * 0.25;
    if (peak) {
      // the landmark summit: a tall massif centred on the trail's heading
      let d = Math.abs(a - peak.a);
      d = Math.min(d, Math.PI * 2 - d);
      hgt += Math.max(0, 1 - d / peak.width) ** 1.6 * peak.h;
    }
    const r = radius * (0.92 + fbm(a * 6, seed + 9, seed, 2) * 0.16);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    // base vertex, mid (rock) and crest
    const top = base + hgt;
    const pts = [base - 60, base + hgt * 0.45, base + hgt * 0.78, top];
    pts.forEach((y, k) => {
      const rr = r * (1 + (3 - k) * 0.01);
      pos.push(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
      tmp.copy(cRock);
      if (y > snowLine) tmp.lerp(cSnow, smoothstep(snowLine, snowLine + 40, y));
      if (k === 0) tmp.multiplyScalar(0.7);
      tmp.lerp(cHaze, hazeAmt + (k === 0 ? 0.15 : 0));
      col.push(tmp.r, tmp.g, tmp.b);
    });
    void x;
    void z;
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let k = 0; k < 3; k++) idx.push(a + k, b + k, a + k + 1, b + k, b + k + 1, a + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function Mountains({ L, env, peakAngle }) {
  const { minX, minZ, maxX, maxZ } = L.terrain.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const N = L.paths[0].nodes;
  const end = N[N.length - 1];
  const head = peakAngle ?? Math.atan2(end.z - N[0].z, end.x - N[0].x);
  const rid = L.region.id;
  const geos = useMemo(() => {
    const base = L.lowY - 60;
    const fog = env.fog;
    const layers = [
      { radius: 620, height: 70 + rid * 18, haze: 0.22, snowLine: base + 125 - rid * 12 },
      { radius: 1000, height: 120 + rid * 22, haze: 0.36, snowLine: base + 150 - rid * 12, peak: { a: head + 0.3, width: 0.45, h: 110 + rid * 30 } },
      { radius: 1500, height: 170 + rid * 25, haze: 0.48, snowLine: base + 170, peak: { a: head - 0.08, width: 0.3, h: 260 + rid * 60 } },
    ];
    return layers.map((ly, i) =>
      ringGeometry({ cx, cz, radius: ly.radius, base, height: ly.height, seed: L.def.seed + i * 13, haze: new THREE.Color(fog).lerp(new THREE.Color(env.skyTop), 0.3).getStyle(), hazeAmt: ly.haze, rock: rid >= 4 ? "#5d6676" : "#4f5d5c", snow: "#f4f7fb", snowLine: ly.snowLine, peak: ly.peak }),
    );
  }, [L, env, cx, cz, head, rid]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }), []);
  useEffect(
    () => () => {
      geos.forEach((g) => g.dispose());
      mat.dispose();
    },
    [geos, mat],
  );
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} renderOrder={-9 + i * -1} frustumCulled={false} />
      ))}
    </group>
  );
}

/** Far land: a polar grid under / beyond the level terrain — valley floor
 *  rising into forested foothills that meet the mountain rings. Fogged. */
function FarLand({ L, env }) {
  const { minX, minZ, maxX, maxZ } = L.terrain.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const inner = Math.max(maxX - minX, maxZ - minZ) / 2 + 110;
  const rid = L.region.id;
  const geo = useMemo(() => {
    const P = L.region.palette;
    const floor = L.lowY - (L.def.valley ?? 30) + 1.5;
    const RINGS = 40;
    const SEG = 96;
    const pos = [];
    const col = [];
    const idx = [];
    const cV = new THREE.Color(P.valley);
    const cF = new THREE.Color(rid >= 5 ? "#c9d3de" : rid >= 4 ? "#6f7d62" : "#2f5a32");
    const cR = new THREE.Color(rid >= 4 ? "#6e7480" : "#5d6460");
    const cS = new THREE.Color("#eef3f8");
    const cH = new THREE.Color(env.fog).lerp(new THREE.Color(env.skyTop), 0.3);
    const tmp = new THREE.Color();
    for (let i = 0; i <= RINGS; i++) {
      const k = i / RINGS;
      const r = inner * 0.55 + (Math.max(inner + 120, 610) - inner * 0.55) * k * k;
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const rise = smoothstep(inner + 40, Math.max(inner + 120, 610), r);
        const n = fbm(x * 0.006, z * 0.006, L.def.seed + 77, 4);
        let y = floor + rise * rise * (18 + n * 55) + n * 6;
        if (r < inner) y = floor - 10; // tucked under the level terrain
        pos.push(x, y, z);
        const speck = fbm(x * 0.05, z * 0.05, L.def.seed + 78, 2);
        tmp.copy(cV).lerp(cF, smoothstep(0.35, 0.6, speck) * 0.8);
        tmp.lerp(cR, smoothstep(40, 110, y - floor));
        if (rid >= 3) tmp.lerp(cS, smoothstep(90 - rid * 12, 150 - rid * 12, y - floor));
        // its own atmospheric haze (unfogged, like the ranges)
        tmp.lerp(cH, smoothstep(inner, 620, r) * 0.3);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = i * SEG + j;
        const b = i * SEG + ((j + 1) % SEG);
        const c = a + SEG;
        const d = b + SEG;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [L, env, cx, cz, inner, rid]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} receiveShadow={false} renderOrder={-4} />;
}

function Clouds({ L, env, reduced }) {
  const group = useRef();
  const { minX, minZ, maxX, maxZ } = L.terrain.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const list = useMemo(() => {
    const rand = mulberry32(L.def.seed + 501);
    const n = Math.round(10 + env.clouds * 18);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 300 + rand() * 600;
      out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: L.lowY + 110 + rand() * 140, s: 45 + rand() * 70, sp: 0.6 + rand() * 1.2 });
    }
    return out;
  }, [L, env, cx, cz]);
  const mat = useMemo(() => {
    const tint = new THREE.Color(env.sunColor).lerp(new THREE.Color("#ffffff"), 0.55);
    if (env.clouds > 0.8) tint.lerp(new THREE.Color("#c3cbd3"), 0.4);
    return new THREE.SpriteMaterial({ map: cloudTex(), color: tint, transparent: true, opacity: 0.5 + env.clouds * 0.3, depthWrite: false, fog: false });
  }, [env]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    if (!group.current || reduced) return;
    group.current.children.forEach((s, i) => {
      s.position.x += list[i].sp * dt;
      if (s.position.x > cx + 750) s.position.x = cx - 750;
    });
  });
  return (
    <group ref={group}>
      {list.map((c, i) => (
        <sprite key={i} material={mat} position={[c.x, c.y, c.z]} scale={[c.s * 1.8, c.s * 0.7, 1]} renderOrder={-5} />
      ))}
    </group>
  );
}

const SEA_FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uShade;
  varying vec2 vUv;
  varying vec3 vWorld;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += n(p) * a; p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec2 p = vWorld.xz * 0.012 + vec2(uTime * 0.01, uTime * 0.004);
    float c = fbm(p) * 0.75 + fbm(p * 2.7 - uTime * 0.015) * 0.35;
    float edge = smoothstep(0.5, 0.35, length(vUv - 0.5));
    vec3 col = mix(uShade, uColor, smoothstep(0.35, 0.85, c));
    gl_FragColor = vec4(col, smoothstep(0.28, 0.6, c) * edge * 0.95);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
const SEA_VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

function CloudSea({ L, env }) {
  const { minX, minZ, maxX, maxZ } = L.terrain.bounds;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SEA_VERT,
        fragmentShader: SEA_FRAG,
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          { uTime: { value: 0 }, uColor: { value: new THREE.Color("#ffffff").lerp(new THREE.Color(env.sunColor), 0.2) }, uShade: { value: new THREE.Color(env.fog).multiplyScalar(0.92) } },
        ]),
      }),
    [env],
  );
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1600, 1600, 1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(
    () => () => {
      mat.dispose();
      geo.dispose();
    },
    [mat, geo],
  );
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return <mesh geometry={geo} material={mat} position={[(minX + maxX) / 2, L.lowY - L.def.valley * 0.55, (minZ + maxZ) / 2]} renderOrder={1} />;
}

export default function Sky({ L, env, reduced, peakAngle }) {
  const sea = L.region.id >= 4 || L.def.cloudSea;
  return (
    <group>
      <SkyDome env={env} />
      <Mountains L={L} env={env} peakAngle={peakAngle} />
      <FarLand L={L} env={env} />
      <Clouds L={L} env={env} reduced={reduced} />
      {sea && <CloudSea L={L} env={env} />}
    </group>
  );
}
