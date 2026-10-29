/**
 * Last Hope — terrain: one ground mesh per location.
 *
 * The layout's paint ops are composited (in order, "over") into a splat map
 * at 2 px per metre: R dirt, G asphalt, B concrete, A moss; whatever is left
 * is the location's base surface. The ground material samples five tiled
 * textures (two scales each, to kill visible tiling), blends their normal
 * maps, breaks splat edges up with noise and gets wet / darker in the rain.
 * The same splat image feeds the minimap.
 */
import * as THREE from "three";
import { tex } from "./textures.js";

const CH = { dirt: 0, asphalt: 1, concrete: 2, moss: 3, grass: -1 };
export const SPLAT_PPM = 2;

/** Composite paint ops → RGBA Uint8 splat (w*ppm × d*ppm). */
export function buildSplat(map, ppm = SPLAT_PPM) {
  const W = Math.round(map.w * ppm);
  const H = Math.round(map.d * ppm);
  const w = new Float32Array(W * H * 4);
  const ox = -map.w / 2;
  const oz = -map.d / 2;
  const apply = (i, c, ch) => {
    const k = i * 4;
    for (let q = 0; q < 4; q++) w[k + q] = w[k + q] * (1 - c) + (q === ch ? c : 0);
  };
  const ss = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6)));
    return t * t * (3 - 2 * t);
  };
  for (const op of map.paint) {
    const ch = CH[op.ch] ?? -1;
    const soft = Math.max(0.05, op.soft);
    let x0;
    let x1;
    let z0;
    let z1;
    if (op.shape === "rect") [x0, z0, x1, z1] = [op.x0 - soft, op.z0 - soft, op.x1 + soft, op.z1 + soft];
    else if (op.shape === "circle") [x0, z0, x1, z1] = [op.x - op.r - soft, op.z - op.r - soft, op.x + op.r + soft, op.z + op.r + soft];
    else {
      const xs = op.points.map((p) => p[0]);
      const zs = op.points.map((p) => p[1]);
      const pad = op.width / 2 + soft;
      [x0, z0, x1, z1] = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad];
    }
    const i0 = Math.max(0, Math.floor((x0 - ox) * ppm));
    const i1 = Math.min(W - 1, Math.ceil((x1 - ox) * ppm));
    const j0 = Math.max(0, Math.floor((z0 - oz) * ppm));
    const j1 = Math.min(H - 1, Math.ceil((z1 - oz) * ppm));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = ox + (i + 0.5) / ppm;
        const z = oz + (j + 0.5) / ppm;
        let d;
        if (op.shape === "rect") {
          const dx = Math.max(op.x0 - x, 0, x - op.x1);
          const dz = Math.max(op.z0 - z, 0, z - op.z1);
          d = Math.hypot(dx, dz);
        } else if (op.shape === "circle") d = Math.max(0, Math.hypot(x - op.x, z - op.z) - op.r);
        else {
          d = 1e9;
          for (let s = 0; s < op.points.length - 1; s++) {
            const [ax, az] = op.points[s];
            const [bx, bz] = op.points[s + 1];
            const dx = bx - ax;
            const dz = bz - az;
            const l2 = dx * dx + dz * dz || 1e-9;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
            d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
          }
          d = Math.max(0, d - op.width / 2);
        }
        const c = (1 - ss(0, soft, d)) * op.a;
        if (c > 0.002) apply(j * W + i, c, ch);
      }
  }
  const out = new Uint8Array(W * H * 4);
  for (let k = 0; k < out.length; k++) out[k] = Math.round(Math.max(0, Math.min(1, w[k])) * 255);
  return { data: out, W, H };
}

const BASE_OF = { grass: "grass", dirt: "dirt", concrete: "concrete" };

export function createGround(map, splat, quality) {
  const T = (n) => tex(n, quality === "low" ? 256 : 512);
  const base = T(BASE_OF[map.base] || "grass");
  const L = [T("dirt"), T("asphalt"), T("concrete"), T("moss")];
  const st = new THREE.DataTexture(splat.data, splat.W, splat.H, THREE.RGBAFormat);
  st.magFilter = THREE.LinearFilter;
  st.minFilter = THREE.LinearFilter;
  st.flipY = false;
  st.needsUpdate = true;
  const u = {
    tSplat: { value: st },
    tB: { value: base.map },
    tB_n: { value: base.normal },
    t0: { value: L[0].map },
    t1: { value: L[1].map },
    t2: { value: L[2].map },
    t3: { value: L[3].map },
    t0n: { value: L[0].normal },
    t1n: { value: L[1].normal },
    t2n: { value: L[2].normal },
    t3n: { value: L[3].normal },
    uSize: { value: new THREE.Vector2(map.w, map.d) },
    uWet: { value: 0 },
    uBaseRough: { value: map.base === "concrete" ? 0.82 : 0.95 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vGW;
uniform sampler2D tSplat, tB, tB_n, t0, t1, t2, t3, t0n, t1n, t2n, t3n;
uniform vec2 uSize; uniform float uWet; uniform float uBaseRough;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y); }
vec3 gTex(sampler2D t, vec2 uv) { return mix(texture2D(t, uv).rgb, texture2D(t, uv * 0.23 + 0.37).rgb, 0.35); }
vec4 gW; vec3 gN;`
      )
      .replace(
        "#include <map_fragment>",
        `{
  vec2 suv = (vGW + uSize * 0.5) / uSize;
  float n1 = gNoise(vGW * 0.9);
  float n2 = gNoise(vGW * 3.1 + 7.0);
  vec2 jitter = (vec2(n1, n2) - 0.5) * (1.6 / uSize);
  vec4 s = texture2D(tSplat, suv + jitter);
  // crisper, noisy transitions
  s = clamp((s - 0.5) * 1.6 + 0.5 + (n2 - 0.5) * 0.35, 0.0, 1.0) * step(0.004, s);
  float sum = s.r + s.g + s.b + s.a;
  if (sum > 1.0) s /= sum;
  float b = max(0.0, 1.0 - (s.r + s.g + s.b + s.a));
  gW = s;
  vec2 uv = vGW / 4.0;
  vec3 c = gTex(tB, uv * 0.7) * b + gTex(t0, uv) * s.r + gTex(t1, uv * 0.8) * s.g + gTex(t2, uv * 0.6) * s.b + gTex(t3, uv * 0.8) * s.a;
  // large-scale tint variation
  float macro = gNoise(vGW * 0.05) * 0.6 + gNoise(vGW * 0.17) * 0.4;
  c *= mix(0.84, 1.1, macro);
  c *= mix(1.0, 0.62, uWet * (0.6 + 0.4 * s.g + 0.3 * s.b));
  diffuseColor.rgb *= c;
  vec3 nb = texture2D(tB_n, uv).xyz * b + texture2D(t0n, uv).xyz * s.r + texture2D(t1n, uv * 0.8).xyz * s.g + texture2D(t2n, uv * 0.6).xyz * s.b + texture2D(t3n, uv).xyz * s.a;
  gN = normalize(nb * 2.0 - 1.0);
}`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = uBaseRough * (1.0 - (gW.r + gW.g + gW.b + gW.a)) + 0.97 * gW.r + 0.86 * gW.g + 0.8 * gW.b + 0.98 * gW.a;
  roughnessFactor = mix(roughnessFactor, 0.28, uWet * (0.5 + 0.5 * (gW.g + gW.b)));`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
  normal = normalize((viewMatrix * vec4(normalize(vec3(gN.x * 0.9, gN.z, -gN.y * 0.9)), 0.0)).xyz);`
      );
  };
  mat.customProgramCacheKey = () => "lh-ground";
  // the ground runs well past the playable edge (the splat clamps at its border)
  const pad = map.biome === "bunker" ? 0 : 140;
  const geo = new THREE.PlaneGeometry(map.w + pad * 2, map.d + pad * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "ground";
  return { mesh, uniforms: u, dispose: () => (geo.dispose(), mat.dispose(), st.dispose()) };
}

/* ---------------------------------------------------------------- road markings */
export function createRoadMarks(map) {
  const g = new THREE.Group();
  const dash = [];
  const edge = [];
  const curb = [];
  for (const r of map.roads) {
    if (r.kind === "dirt") continue;
    for (let s = 0; s < r.points.length - 1; s++) {
      const [ax, az] = r.points[s];
      const [bx, bz] = r.points[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const nx = -uz;
      const nz = ux;
      const yaw = Math.atan2(ux, uz);
      if (r.lines)
        for (let t = 1.5; t < len - 1; t += 6) dash.push([ax + ux * t, az + uz * t, yaw, 0.16, 2.6]);
      for (const side of [-1, 1]) {
        edge.push([ax + ux * len * 0.5 + nx * side * (r.width / 2 - 0.35), az + uz * len * 0.5 + nz * side * (r.width / 2 - 0.35), yaw, 0.12, len]);
        if (r.curb) curb.push([ax + ux * len * 0.5 + nx * side * (r.width / 2 + 0.05), az + uz * len * 0.5 + nz * side * (r.width / 2 + 0.05), yaw, 0.22, len]);
      }
    }
  }
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.rotateX(-Math.PI / 2);
  const add = (list, color, y, h = 0) => {
    if (!list.length) return null;
    const geo = h ? new THREE.BoxGeometry(1, h, 1) : quad;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: h ? 0.85 : 0.7, polygonOffset: !h, polygonOffsetFactor: -2 });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    list.forEach(([x, z, yaw, w, l], i) => {
      e.set(0, yaw, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(w, 1, l));
      im.setMatrixAt(i, m);
    });
    im.receiveShadow = true;
    im.castShadow = !!h;
    g.add(im);
    return im;
  };
  add(dash, "#d6b23c", 0.012);
  add(edge, "#c8c4b8", 0.011);
  add(curb, "#9a968c", 0, 0.16);
  return {
    group: g,
    dispose: () => g.traverse((o) => (o.geometry?.dispose(), o.material?.dispose())),
  };
}

/* ---------------------------------------------------------------- water */
export function createWater(map) {
  const g = new THREE.Group();
  const mats = [];
  for (const w of map.water || []) {
    const u = { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, 0.8, 0.3) }, uSky: { value: new THREE.Color("#9ec6dc") }, uDeep: { value: new THREE.Color("#1d3d3c") }, uShallow: { value: new THREE.Color("#4f7a62") }, uR: { value: w.r } };
    const mat = new THREE.MeshStandardMaterial({ color: "#2f5a55", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.92 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vWL;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWL = position.xz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vWL; uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uR;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
  float rr = length(vWL) / uR;
  diffuseColor.rgb = mix(uDeep, uShallow, smoothstep(0.55, 1.0, rr));
  diffuseColor.a = mix(0.95, 0.55, smoothstep(0.85, 1.0, rr));`
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
  {
    vec2 p = vWL;
    float t = uTime;
    vec2 d = vec2(sin(p.x * 1.7 + t * 1.3) + sin(p.y * 2.3 - t * 1.1) * 0.7 + sin((p.x + p.y) * 3.1 + t * 2.1) * 0.35,
                  cos(p.y * 1.9 + t * 1.2) + cos(p.x * 2.1 + t * 0.9) * 0.6 + cos((p.x - p.y) * 2.9 - t * 1.7) * 0.35);
    vec3 nW = normalize(vec3(d.x * 0.06, 1.0, d.y * 0.06));
    normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  }`
        );
    };
    mat.customProgramCacheKey = () => "lh-water";
    const geo = new THREE.CircleGeometry(w.r, 48);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(w.x, 0.04, w.z);
    m.receiveShadow = true;
    g.add(m);
    mats.push(u);
  }
  return {
    group: g,
    update(t) {
      for (const u of mats) u.uTime.value = t;
    },
    dispose: () => g.traverse((o) => (o.geometry?.dispose(), o.material?.dispose())),
  };
}

/** Minimap base image (canvas) from the splat + map features. */
export function minimapImage(map, splat) {
  if (typeof document === "undefined") return null;
  const S = 2; // px per metre on the minimap image
  const c = document.createElement("canvas");
  c.width = Math.round(map.w * S);
  c.height = Math.round(map.d * S);
  const ctx = c.getContext("2d");
  const base = { grass: [72, 96, 56], dirt: [110, 92, 70], concrete: [120, 120, 116] }[map.base] || [72, 96, 56];
  const pal = [
    [128, 104, 76],
    [60, 62, 66],
    [140, 138, 132],
    [52, 74, 44],
  ];
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const sx = Math.min(splat.W - 1, Math.floor((x / c.width) * splat.W));
      const sy = Math.min(splat.H - 1, Math.floor((y / c.height) * splat.H));
      const k = (sy * splat.W + sx) * 4;
      const w = [splat.data[k] / 255, splat.data[k + 1] / 255, splat.data[k + 2] / 255, splat.data[k + 3] / 255];
      const b = Math.max(0, 1 - w[0] - w[1] - w[2] - w[3]);
      const i = (y * c.width + x) * 4;
      for (let q = 0; q < 3; q++) img.data[i + q] = base[q] * b + pal[0][q] * w[0] + pal[1][q] * w[1] + pal[2][q] * w[2] + pal[3][q] * w[3];
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const X = (x) => (x + map.w / 2) * S;
  const Z = (z) => (z + map.d / 2) * S;
  // water
  ctx.fillStyle = "#3d6f7e";
  for (const w of map.water || []) {
    ctx.beginPath();
    ctx.arc(X(w.x), Z(w.z), w.r * S, 0, Math.PI * 2);
    ctx.fill();
  }
  // trees (dark dots) for texture
  ctx.fillStyle = "rgba(24,44,24,0.55)";
  for (const n of map.nodes) if (n.t === "tree" || n.t === "pine" || n.t === "birch") ctx.fillRect(X(n.x) - 1.5, Z(n.z) - 1.5, 3, 3);
  for (const p of map.props) if (p.t === "pine_big" || p.t === "tree_big") ctx.fillRect(X(p.x) - 2, Z(p.z) - 2, 4, 4);
  // buildings / walls
  for (const b of map.buildings) {
    ctx.save();
    ctx.translate(X(b.x), Z(b.z));
    ctx.rotate(-b.yaw);
    ctx.fillStyle = b.kind === "warehouse" ? "#5b5f66" : b.kind === "cabin" ? "#6b5038" : "#8a7a68";
    ctx.fillRect((-b.w / 2) * S, (-b.d / 2) * S, b.w * S, b.d * S);
    ctx.restore();
  }
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 1.2;
  for (const w of map.walls) {
    if (w.block) {
      ctx.fillStyle = "#1c1d1f";
      ctx.fillRect(X(w.x0), Z(w.z0), (w.x1 - w.x0) * S, (w.z1 - w.z0) * S);
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(X(w.x0), Z(w.z0));
    ctx.lineTo(X(w.x1), Z(w.z1));
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(220,210,190,0.55)";
  ctx.lineWidth = 1;
  for (const f of map.fences) {
    ctx.beginPath();
    ctx.moveTo(X(f.x0), Z(f.z0));
    ctx.lineTo(X(f.x1), Z(f.z1));
    ctx.stroke();
  }
  return { canvas: c, scale: S };
}
