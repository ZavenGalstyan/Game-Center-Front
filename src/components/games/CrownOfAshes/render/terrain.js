/**
 * Terrain rendering: the heightfield as 16×16 chunks of 64 m with two LODs
 * (2 m and 8 m spacing, skirted so LOD seams never show sky), shaded by a
 * MeshStandardMaterial extended with a splat shader:
 *
 *   grass ⇄ forest floor (forest mask) → field (field mask) → road (road mask)
 *   → ash → snow (snow mask + height) → rock (slope, triplanar) → wet banks
 *
 * Each layer samples two scales of its texture-array slice (anti-tiling) and
 * perturbs the normal from the matching normal-array slice.
 * Also builds the horizon ring of distant peaks and the heightmap texture
 * the grass shader reads.
 */
import * as THREE from "three";
import { groundArrays } from "./textures.js";

const CHUNK = 64;

export function splatTextures(T) {
  const N = T.N;
  const a = new Uint8Array(N * N * 4);
  const b = new Uint8Array(N * N * 4);
  const M = T.masks;
  for (let k = 0; k < N * N; k++) {
    a[k * 4] = M.road[k];
    a[k * 4 + 1] = M.snow[k];
    a[k * 4 + 2] = M.ash[k];
    a[k * 4 + 3] = M.forest[k];
    b[k * 4] = M.field[k];
    b[k * 4 + 1] = M.wet[k];
    b[k * 4 + 2] = 0;
    b[k * 4 + 3] = 255;
  }
  const mk = (d) => {
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const hh = new Uint16Array(N * N);
  for (let k = 0; k < N * N; k++) hh[k] = THREE.DataUtils.toHalfFloat(T.H[k]);
  const ht = new THREE.DataTexture(hh, N, N, THREE.RedFormat, THREE.HalfFloatType);
  ht.magFilter = THREE.LinearFilter;
  ht.minFilter = THREE.LinearFilter;
  ht.needsUpdate = true;
  return { splatA: mk(a), splatB: mk(b), height: ht };
}

export function terrainMaterial(T, tex, shared, fast = false) {
  const g = groundArrays();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const u = {
    uGround: { value: g.map },
    uGroundN: { value: g.normal },
    uSplatA: { value: tex.splatA },
    uSplatB: { value: tex.splatB },
    uHalf: { value: T.half },
    uSnowLine: shared.snowBoost,
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vW;\nvarying vec3 vNW;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNW = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vW; varying vec3 vNW;
uniform highp sampler2DArray uGround; uniform highp sampler2DArray uGroundN;
uniform sampler2D uSplatA; uniform sampler2D uSplatB; uniform float uHalf; uniform float uSnowLine;
float tHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(tHash(i), tHash(i+vec2(1,0)), f.x), mix(tHash(i+vec2(0,1)), tHash(i+vec2(1,1)), f.x), f.y); }
vec4 layer(float L, vec2 uv){
  vec4 a = texture(uGround, vec3(uv, L));
#ifdef COA_FAST
  return a;
#else
  vec4 b = texture(uGround, vec3(uv * 0.23 + vec2(0.37, 0.71), L));
  return mix(a, b * 1.05, 0.38);
#endif
}
vec3 layerN(float L, vec2 uv){ return texture(uGroundN, vec3(uv, L)).xyz * 2.0 - 1.0; }
vec3 gNorm = vec3(0.0, 0.0, 1.0);
float gRough = 0.92;`
      )
      .replace(
        "#include <map_fragment>",
        `{
  vec2 suv = (vW.xz + uHalf) / (2.0 * uHalf);
  vec4 sa = texture2D(uSplatA, suv);
  vec4 sb = texture2D(uSplatB, suv);
  float n1 = tNoise(vW.xz * 0.11);
  float n2 = tNoise(vW.xz * 0.53);
  vec2 uvG = vW.xz / 5.0;
  vec2 uvR = vW.xz / 9.0;
  // weights
  float slope = 1.0 - vNW.y;
  float wRock = smoothstep(0.26, 0.42, slope + (n1 - 0.5) * 0.14);
  float wSnow = smoothstep(0.35, 0.65, sa.g + (n2 - 0.5) * 0.35 + uSnowLine);
  float wAsh = smoothstep(0.3, 0.7, sa.b + (n1 - 0.5) * 0.3);
  float wRoad = smoothstep(0.25, 0.75, sa.r + (n2 - 0.5) * 0.25);
  float wField = sb.r;
  float wForest = smoothstep(0.25, 0.75, sa.a + (n1 - 0.5) * 0.4);
  float wWet = sb.g;
  // each layer is only sampled where it actually shows
  vec4 c = wForest < 0.99 ? layer(0.0, uvG) : vec4(0.0);
  vec3 nn = vec3(0.0, 0.0, 1.0);
  if (wForest > 0.01) c = mix(c, layer(1.0, uvG), wForest);
#ifndef COA_FAST
  nn = layerN(wForest > 0.5 ? 1.0 : 0.0, uvG);
#endif
  float r = mix(0.95, 0.9, wForest);
  if (wField > 0.01) c = mix(c, layer(6.0, vW.xz / 6.0), wField);
  if (wAsh > 0.01) { c = mix(c, layer(5.0, uvG), wAsh); r = mix(r, 0.9, wAsh); }
  if (wRoad > 0.01) {
    c = mix(c, layer(2.0, uvG * 1.3), wRoad);
#ifndef COA_FAST
    nn = mix(nn, layerN(2.0, uvG * 1.3), wRoad);
#endif
    r = mix(r, 0.88, wRoad);
  }
  // wet banks: darker, glossier, muddy
  c.rgb = mix(c.rgb, c.rgb * vec3(0.52, 0.5, 0.45), wWet * 0.85); r = mix(r, 0.42, wWet);
  if (wRock > 0.01) {
#ifdef COA_FAST
    vec4 rc = layer(3.0, abs(vNW.x) > abs(vNW.z) ? vW.zy / 9.0 : vW.xy / 9.0);
    if (vNW.y > 0.75) rc = layer(3.0, uvR);
#else
    // rock: triplanar so cliffs never stretch
    vec3 bw = pow(abs(vNW), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    vec4 rc = layer(3.0, vW.zy / 9.0) * bw.x + layer(3.0, uvR) * bw.y + layer(3.0, vW.xy / 9.0) * bw.z;
    nn = mix(nn, layerN(3.0, uvR), wRock);
#endif
    c = mix(c, rc, wRock);
    r = mix(r, 0.82, wRock);
  }
  // snow settles on flats, slides off cliffs
  float sOnRock = wSnow * (1.0 - smoothstep(0.35, 0.6, slope));
  if (wSnow > 0.01) { c = mix(c, layer(4.0, uvG * 0.8), max(wSnow * (1.0 - wRock), sOnRock)); r = mix(r, 0.62, wSnow); }
  // large-scale tint variation
  c.rgb *= 0.86 + n1 * 0.28;
  diffuseColor.rgb *= c.rgb;
  gNorm = normalize(nn);
  gRough = r;
}`
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n  roughnessFactor = gRough;")
      .replace(
        "#include <normal_fragment_maps>",
        `{
  // world-space bump from the splat normal, tangent frame along world X/Z
  vec3 Nw = normalize(vNW);
  vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
  vec3 Bw = normalize(cross(Tw, Nw));
  vec3 pn = normalize(Tw * gNorm.x * 0.9 - Bw * gNorm.y * 0.9 + Nw * gNorm.z);
  normal = normalize((viewMatrix * vec4(pn, 0.0)).xyz);
}`
      );
  };
  m.defines = fast ? { COA_FAST: "" } : {};
  m.customProgramCacheKey = () => `coa-terrain-${m.defines.COA_FAST != null ? 1 : 0}`;
  return m;
}

/** Geometry for one chunk at `step` grid cells per vertex, with skirts. */
function chunkGeometry(T, ci, cj, step) {
  const per = CHUNK / T.cell; // grid cells per chunk (32)
  const n = per / step; // quads per side
  const i0 = ci * per;
  const j0 = cj * per;
  const verts = (n + 1) * (n + 1) + 4 * (n + 1);
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const idx = [];
  const H = T.H;
  const N = T.N;
  const hAt = (i, j) => H[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  let v = 0;
  const put = (i, j, drop) => {
    const x = T.wx(i);
    const z = T.wx(j);
    pos[v * 3] = x;
    pos[v * 3 + 1] = hAt(i, j) - drop;
    pos[v * 3 + 2] = z;
    const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * T.cell);
    const dz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * T.cell);
    const l = Math.hypot(dx, 1, dz);
    nor[v * 3] = -dx / l;
    nor[v * 3 + 1] = 1 / l;
    nor[v * 3 + 2] = -dz / l;
    return v++;
  };
  for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) put(i0 + a * step, j0 + b * step, 0);
  const id = (a, b) => b * (n + 1) + a;
  for (let b = 0; b < n; b++)
    for (let a = 0; a < n; a++) {
      // diagonal (a+1,b)–(a,b+1) matches the physics sampler
      idx.push(id(a, b), id(a, b + 1), id(a + 1, b));
      idx.push(id(a + 1, b), id(a, b + 1), id(a + 1, b + 1));
    }
  // skirts hang 6 m under each edge
  const edges = [
    (k) => [k, 0],
    (k) => [n, k],
    (k) => [n - k, n],
    (k) => [0, n - k],
  ];
  for (const E of edges) {
    const start = v;
    for (let k = 0; k <= n; k++) {
      const [a, b] = E(k);
      put(i0 + a * step, j0 + b * step, 6);
    }
    for (let k = 0; k < n; k++) {
      const [a0, b0] = E(k);
      const [a1, b1] = E(k + 1);
      const t0 = id(a0, b0);
      const t1 = id(a1, b1);
      const s0 = start + k;
      const s1 = start + k + 1;
      idx.push(t0, t1, s0, t1, s1, s0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function createTerrain(scene, T, shared, quality) {
  const tex = shared.splatA ? { splatA: shared.splatA, splatB: shared.splatB, height: shared.heightTex } : splatTextures(T);
  const mat = terrainMaterial(T, tex, shared, quality !== "high");
  const group = new THREE.Group();
  group.name = "terrain";
  const n = Math.round((T.half * 2) / CHUNK);
  const chunks = [];
  for (let cj = 0; cj < n; cj++)
    for (let ci = 0; ci < n; ci++) {
      const hi = new THREE.Mesh(chunkGeometry(T, ci, cj, 1), mat);
      const lo = new THREE.Mesh(chunkGeometry(T, ci, cj, 2), mat);
      for (const m of [hi, lo]) {
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        group.add(m);
      }
      lo.visible = false;
      chunks.push({ hi, lo, cx: -T.half + (ci + 0.5) * CHUNK, cz: -T.half + (cj + 0.5) * CHUNK });
    }
  // distant peaks beyond the play area, for the skyline
  const ring = horizonRing(T);
  group.add(ring);
  scene.add(group);
  let q = quality;
  return {
    group,
    material: mat,
    tex,
    update(cam) {
      const R = q === "low" ? 80 : q === "medium" ? 110 : 180;
      for (const c of chunks) {
        const d = Math.hypot(c.cx - cam.x, c.cz - cam.z);
        const near = d < R;
        c.hi.visible = near;
        c.lo.visible = !near;
        c.hi.castShadow = q !== "low" && d < 60;
      }
    },
    setQuality(nq) {
      q = nq;
      mat.defines = nq !== "high" ? { COA_FAST: "" } : {};
      mat.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      for (const c of chunks) {
        c.hi.geometry.dispose();
        c.lo.geometry.dispose();
      }
      ring.geometry.dispose();
      ring.material.dispose();
      mat.dispose();
      Object.values(tex).forEach((t) => t.dispose());
    },
  };
}

function horizonRing(T) {
  const segA = 160;
  const segR = 6;
  const pos = [];
  const col = [];
  const idx = [];
  const r0 = T.half + 20;
  const r1 = 1500;
  for (let j = 0; j <= segR; j++)
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const t = j / segR;
      const r = r0 + (r1 - r0) * t;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const ridge = Math.abs(Math.sin(a * 7.3) * 0.6 + Math.sin(a * 17.1 + 1) * 0.3 + Math.sin(a * 41 + 2) * 0.1);
      const north = Math.max(0, -Math.sin(a)); // −Z is north
      const peak = (90 + ridge * 170 + north * 160) * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.75) * 2.2);
      pos.push(x, Math.max(-20, peak + 40 - (j === 0 ? 30 : 0)), z);
      const snow = peak > 200 ? 1 : 0;
      col.push(snow ? 0.72 : 0.2, snow ? 0.75 : 0.22, snow ? 0.82 : 0.27);
    }
  for (let j = 0; j < segR; j++)
    for (let i = 0; i < segA; i++) {
      const a = j * (segA + 1) + i;
      const b = a + segA + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}
