/**
 * Lumberjack Life — the world around the gameplay: terrain, sky, lights,
 * distant mountains, backdrop forest and instanced ground cover.
 *
 * The playable terrain mesh is built from the engine's height grid with the
 * same triangle split per cell as `terrain.heightAt`, so feet, logs and
 * trunks sit exactly on the ground you see.
 *
 * Quality (low / medium / high) scales grass/flower/litter density and the
 * backdrop forest; LOW meaningfully cuts instanced vegetation (~35%).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GRID_HALF, GRID_N } from "../engine/terrain.js";
import { createRng, fbm, smoothstep, hashString } from "../engine/math.js";
import { PLAY_RADIUS, MILL, leafColors } from "../data/regions.js";
import { speciesById } from "../data/species.js";
import { blocksAsTrunk } from "../engine/trees.js";
import { groundDetailTexture } from "./textures.js";
import { windPatch, WORLD_UNIFORMS } from "./shaders.js";
import { backdropTreeGeometry } from "./treeMesh.js";

const DENSITY = { low: 0.35, medium: 0.7, high: 1 };

const col = (h) => new THREE.Color(h);

/* ------------------------------------------------------------ terrain */
function terrainColors(region, terrain, world, x, z, out) {
  const G = region.ground;
  const n1 = fbm(x * 0.08, z * 0.08, 5, 3) * 0.5 + 0.5;
  const n2 = fbm(x * 0.35, z * 0.35, 9, 2) * 0.5 + 0.5;
  const gi = Math.min(3, Math.floor(n1 * 3.99));
  out.copy(col(G.grass[gi])).lerp(col(G.grass[(gi + 1) % 4]), n2 * 0.5);
  // slopes → rock
  const nrm = terrain.normalAt(x, z);
  const slope = 1 - nrm[1];
  if (slope > 0.08) out.lerp(col(G.rock), smoothstep(0.08, 0.3, slope) * 0.85);
  // dirt roads + mill yard
  const road = terrain.roadAt(x, z);
  const pad = 1 - smoothstep(12, 17, terrain.padDist(x, z));
  const dirtK = Math.max(road * (0.75 + n2 * 0.25), pad * 0.85);
  if (dirtK > 0) out.lerp(col(n2 > 0.5 ? G.dirt : G.dirt2), dirtK);
  // ground cover
  if (G.cover === "snow") {
    const k = (1 - smoothstep(0.12, 0.35, slope)) * (1 - road * 0.6) * (1 - pad * 0.5);
    out.lerp(col("#f4f8fb"), k * (0.75 + n2 * 0.25));
  } else if (G.cover === "leaves") {
    if (n2 > 0.55 && dirtK < 0.5) out.lerp(col(n1 > 0.5 ? "#c46a2a" : "#a8572a"), (n2 - 0.55) * 1.4);
  } else if (G.cover === "needles") {
    if (n1 > 0.55 && dirtK < 0.5) out.lerp(col("#7a5d3e"), (n1 - 0.55) * 1.2);
  } else if (G.cover === "gold") {
    if (n2 > 0.6 && dirtK < 0.5) out.lerp(col("#d9a740"), (n2 - 0.6) * 1.3);
  }
  // darker soil around trunks (cheap ambient occlusion)
  let ao = 0;
  for (const t of world.trees) {
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < 3.2) ao = Math.max(ao, 1 - d / 3.2);
  }
  if (ao > 0) out.multiplyScalar(1 - ao * 0.28);
  // brighten the play area slightly vs the backdrop
  return out;
}

function buildTerrainMesh(region, terrain, world) {
  const N = GRID_N;
  const pos = new Float32Array(N * N * 3);
  const colors = new Float32Array(N * N * 3);
  const uv = new Float32Array(N * N * 2);
  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = i - GRID_HALF;
      const z = j - GRID_HALF;
      pos[k * 3] = x;
      pos[k * 3 + 1] = terrain.grid[k];
      pos[k * 3 + 2] = z;
      terrainColors(region, terrain, world, x, z, c);
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
      uv[k * 2] = x / 3;
      uv[k * 2 + 1] = z / 3;
    }
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let p = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i;
      const d = a + 1;
      const b = a + N;
      const cc = b + 1;
      // same split as heightAt: (a,b,d) + (b,c,d)  — CCW from above
      idx[p++] = a;
      idx[p++] = b;
      idx[p++] = d;
      idx[p++] = b;
      idx[p++] = cc;
      idx[p++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundDetailTexture(), roughness: 0.97, metalness: 0 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** far ring of terrain out to the horizon (analytic heights, coarser) */
function buildOuterTerrain(region, terrain) {
  const rings = 34;
  const segs = 96;
  const r0 = 69;
  const r1 = 360;
  const pos = [];
  const colors = [];
  const c = new THREE.Color();
  const G = region.ground;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = r0 + (r1 - r0) * t * t;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrain.analytic(x, z) - (j === 0 ? 0.08 : 0);
      pos.push(x, y, z);
      const n = fbm(x * 0.05, z * 0.05, 3, 2) * 0.5 + 0.5;
      c.copy(col(G.grass[Math.floor(n * 3.99)])).multiplyScalar(0.92);
      if (G.cover === "snow") c.lerp(col("#eef3f6"), 0.8);
      const hk = smoothstep(14, 40, y);
      if (hk > 0) c.lerp(col(G.rock), hk * 0.5);
      colors.push(c.r, c.g, c.b);
    }
  }
  const idx = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure faces point up (flip if the ring winding came out downward)
  const nrm = g.attributes.normal;
  if (nrm.getY(segs + 5) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = false;
  return mesh;
}

function buildMountains(region) {
  const rng = createRng(hashString(region.id) ^ 77);
  const parts = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng() * 0.2;
    const r = 250 + rng() * 60;
    const h = 45 + rng() * (region.id === "pine-mountain" || region.id === "snowy-timberland" ? 85 : 45);
    const g = new THREE.ConeGeometry(45 + rng() * 40, h, 7, 3);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      if (y < h / 2 - 0.1) {
        p.setX(k, p.getX(k) * (0.85 + rng() * 0.3));
        p.setZ(k, p.getZ(k) * (0.85 + rng() * 0.3));
        p.setY(k, y + (rng() - 0.5) * h * 0.08);
      }
    }
    g.translate(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const g = mergeGeometries(parts);
  parts.forEach((x) => x.dispose());
  g.computeVertexNormals();
  // vertex colour: base → peaks (snow on the tall ones)
  const p = g.attributes.position;
  const cs = new Float32Array(p.count * 3);
  const base = col(region.mountains);
  const snow = col("#f3f6f8");
  const c = new THREE.Color();
  for (let k = 0; k < p.count; k++) {
    const y = p.getY(k);
    c.copy(base);
    if (y > 55) c.lerp(snow, smoothstep(55, 80, y));
    cs[k * 3] = c.r;
    cs[k * 3 + 1] = c.g;
    cs[k * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cs, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, flatShading: true });
  // atmospheric haze toward the horizon colour
  const haze = col(region.light.skyHorizon);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = { value: haze };
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uHaze;")
      .replace("#include <dithering_fragment>", "gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, 0.55);\n#include <dithering_fragment>");
  };
  return new THREE.Mesh(g, mat);
}

function buildSky(region) {
  const L = region.light;
  const g = new THREE.SphereGeometry(420, 32, 16);
  const sunDir = new THREE.Vector3(Math.cos(L.sunAzim) * Math.cos(L.sunElev), Math.sin(L.sunElev), Math.sin(L.sunAzim) * Math.cos(L.sunElev)).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: col(L.skyTop) },
      uHorizon: { value: col(L.skyHorizon) },
      uSun: { value: sunDir },
      uSunCol: { value: col(L.sun) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunCol; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.6, h), 0.75));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        c += uSunCol * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return { mesh: m, sunDir };
}

/* ------------------------------------------------------------ instanced ground cover */
function grassGeometry() {
  // a tuft: 5 blades, each a bent triangle strip; vertex colour dark root → light tip
  const pos = [];
  const colr = [];
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7;
    const r = 0.06 + (b % 2) * 0.05;
    const h = 0.32 + ((b * 37) % 10) / 40;
    const w = 0.045;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const lean = 0.12;
    const tx = bx + Math.cos(a) * lean;
    const tz = bz + Math.sin(a) * lean;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    // two triangles (root quad → tip)
    const mx = (bx + tx) / 2;
    const mz = (bz + tz) / 2;
    const v = [
      [bx - px, 0, bz - pz], [bx + px, 0, bz + pz], [mx + px * 0.6, h * 0.55, mz + pz * 0.6],
      [bx - px, 0, bz - pz], [mx + px * 0.6, h * 0.55, mz + pz * 0.6], [mx - px * 0.6, h * 0.55, mz - pz * 0.6],
      [mx - px * 0.6, h * 0.55, mz - pz * 0.6], [mx + px * 0.6, h * 0.55, mz + pz * 0.6], [tx, h, tz],
    ];
    for (const p of v) {
      pos.push(...p);
      const k = p[1] / h;
      colr.push(0.45 + k * 0.6, 0.45 + k * 0.6, 0.45 + k * 0.6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  // normals pointing mostly up so tufts light like the ground they grow from
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) {
    n[i] = 0;
    n[i + 1] = 1;
    n[i + 2] = 0;
  }
  g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  return g;
}

function flowerGeometry() {
  const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.28, 3);
  stem.translate(0, 0.14, 0);
  const head = new THREE.IcosahedronGeometry(0.045, 0);
  head.scale(1, 0.55, 1);
  head.translate(0, 0.29, 0);
  const parts = [stem.toNonIndexed(), head.toNonIndexed()];
  const cs = [];
  for (let i = 0; i < parts[0].attributes.position.count; i++) cs.push(0.35, 0.55, 0.25);
  for (let i = 0; i < parts[1].attributes.position.count; i++) cs.push(1, 1, 1);
  const g = mergeGeometries(parts.map((p) => {
    p.deleteAttribute("uv");
    return p;
  }));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cs, 3));
  stem.dispose();
  head.dispose();
  return g;
}

function fernGeometry() {
  const pos = [];
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2;
    const len = 0.55 + (f % 3) * 0.08;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * 0.07;
    const pz = dx * 0.07;
    const seg = 4;
    for (let s = 0; s < seg; s++) {
      const t0 = s / seg;
      const t1 = (s + 1) / seg;
      const y0 = Math.sin(t0 * Math.PI * 0.75) * 0.32;
      const y1 = Math.sin(t1 * Math.PI * 0.75) * 0.32;
      const w0 = 1 - t0 * 0.8;
      const w1 = 1 - t1 * 0.8;
      const a0 = [dx * len * t0, y0, dz * len * t0];
      const a1 = [dx * len * t1, y1, dz * len * t1];
      pos.push(a0[0] - px * w0, a0[1], a0[2] - pz * w0, a0[0] + px * w0, a0[1], a0[2] + pz * w0, a1[0] + px * w1, a1[1], a1[2] + pz * w1);
      pos.push(a0[0] - px * w0, a0[1], a0[2] - pz * w0, a1[0] + px * w1, a1[1], a1[2] + pz * w1, a1[0] - px * w1, a1[1], a1[2] - pz * w1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function bushGeometry(rng) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.IcosahedronGeometry(0.45 + rng() * 0.25, 1);
    const p = s.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const n = 1 + fbm(p.getX(k) * 3 + i, p.getZ(k) * 3, 4, 2) * 0.25;
      p.setXYZ(k, p.getX(k) * n, p.getY(k) * n * 0.8, p.getZ(k) * n);
    }
    s.translate((rng() - 0.5) * 0.8, 0.32 + rng() * 0.15, (rng() - 0.5) * 0.8);
    const ni = s.toNonIndexed();
    ni.deleteAttribute("uv");
    parts.push(ni);
    s.dispose();
  }
  const g = mergeGeometries(parts);
  parts.forEach((x) => x.dispose());
  g.computeVertexNormals();
  const p = g.attributes.position;
  const cs = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const v = 0.55 + Math.min(1, p.getY(k) / 0.9) * 0.6;
    cs[k * 3] = cs[k * 3 + 1] = cs[k * 3 + 2] = v;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cs, 3));
  return g;
}

function rockGeometry(seed, r) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k);
    const y = p.getY(k);
    const z = p.getZ(k);
    const n = 1 + fbm(x * 1.6 + seed, z * 1.6 + y, seed, 3) * 0.35;
    p.setXYZ(k, x * r * n * 1.15, Math.max(-0.3, y) * r * n * 0.7, z * r * n);
  }
  const ni = g.toNonIndexed();
  g.dispose();
  ni.computeVertexNormals();
  return ni;
}

/** can ground cover grow here? (not on roads / the mill yard / under trunks) */
function freeSpot(terrain, world, x, z, { road = 0.35, pad = 15, trunk = 0.9 } = {}) {
  if (Math.hypot(x, z) > PLAY_RADIUS + 18) return false;
  if (terrain.roadAt(x, z) > road) return false;
  if (terrain.padDist(x, z) < pad) return false;
  for (const t of world.trees) if (Math.abs(t.x - x) < 2 && Math.abs(t.z - z) < 2 && Math.hypot(t.x - x, t.z - z) < t.radius * 1.3 + trunk) return false;
  for (const r of world.rocks) if (Math.hypot(r.x - x, r.z - z) < r.r * 1.1) return false;
  return true;
}

function scatter(count, rng, terrain, world, opts, fn) {
  let made = 0;
  for (let i = 0; i < count * 4 && made < count; i++) {
    let x;
    let z;
    if (opts.nearTrees && world.trees.length && rng() < opts.nearTrees) {
      const t = world.trees[Math.floor(rng() * world.trees.length)];
      const a = rng() * Math.PI * 2;
      const r = 1.2 + rng() * 3.5;
      x = t.x + Math.cos(a) * r;
      z = t.z + Math.sin(a) * r;
    } else {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * (opts.radius || PLAY_RADIUS + 14);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    if (!freeSpot(terrain, world, x, z, opts)) continue;
    fn(x, terrain.heightAt(x, z), z, rng);
    made++;
  }
  return made;
}

/* ------------------------------------------------------------ build */
export function buildEnvironment(region, world, settings) {
  const terrain = world.terrain;
  const q = DENSITY[settings.graphics] || 0.7;
  const shadows = settings.shadows && settings.graphics !== "low";
  const group = new THREE.Group();
  const disposables = [];
  const rng = createRng(hashString(region.id) ^ 0xabc);
  const own = (o) => {
    if (o.geometry) disposables.push(o.geometry);
    if (o.material) disposables.push(o.material);
    group.add(o);
    return o;
  };

  own(buildTerrainMesh(region, terrain, world));
  own(buildOuterTerrain(region, terrain));
  own(buildMountains(region));
  const sky = buildSky(region);
  own(sky.mesh);

  const D = region.deco;
  const dummy = new THREE.Object3D();
  const tmpC = new THREE.Color();

  // grass tufts (wind)
  const grassN = Math.round(9000 * q * D.grass);
  if (grassN > 0) {
    const g = grassGeometry();
    const m = windPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), { heightRef: 0.45, amp: 0.07, base: 0 });
    const inst = new THREE.InstancedMesh(g, m, grassN);
    const gc = region.ground.grass.map(col);
    let i = 0;
    scatter(grassN, rng, terrain, world, { nearTrees: 0.25, trunk: 0.5, road: 0.25, pad: 14 }, (x, y, z, r) => {
      if (i >= grassN) return;
      dummy.position.set(x, y - 0.02, z);
      dummy.rotation.set(0, r() * 6.28, 0);
      const s = 0.75 + r() * 0.7;
      dummy.scale.set(s, s * (0.8 + r() * 0.5), s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      tmpC.copy(gc[Math.floor(r() * 4)]).multiplyScalar(region.ground.cover === "snow" ? 0.9 : 1.05);
      if (region.ground.cover === "snow") tmpC.lerp(col("#7b8d6a"), 0.7);
      inst.setColorAt(i, tmpC);
      i++;
    });
    inst.count = i;
    inst.receiveShadow = true;
    own(inst);
  }

  // flowers
  const flowerN = Math.round(700 * q * D.flowers);
  if (flowerN > 0) {
    const g = flowerGeometry();
    const m = windPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), { heightRef: 0.3, amp: 0.05 });
    const inst = new THREE.InstancedMesh(g, m, flowerN);
    const palette = region.id === "golden-forest" ? ["#f6d55c", "#ffffff", "#e8833a"] : ["#ffffff", "#f6d55c", "#d36ba6", "#8fa7e8", "#f08c5a"];
    let i = 0;
    scatter(flowerN, rng, terrain, world, { road: 0.2, pad: 15 }, (x, y, z, r) => {
      if (i >= flowerN) return;
      // flowers grow in little patches
      const cx = x;
      const cz = z;
      const pc = col(palette[Math.floor(r() * palette.length)]);
      for (let k = 0; k < 4 && i < flowerN; k++) {
        const fx = cx + (r() - 0.5) * 1.2;
        const fz = cz + (r() - 0.5) * 1.2;
        dummy.position.set(fx, terrain.heightAt(fx, fz), fz);
        dummy.rotation.set((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3);
        dummy.scale.setScalar(0.7 + r() * 0.6);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, pc);
        i++;
      }
    });
    inst.count = i;
    own(inst);
  }

  // ferns (shady, near trees)
  const fernN = Math.round(160 * Math.max(0.5, q) * D.ferns);
  if (fernN > 0) {
    const g = fernGeometry();
    const leaf = region.ground.cover === "snow" ? "#5f7a5a" : region.id === "autumn-woods" ? "#9a8a3a" : "#4f7f36";
    const m = windPatch(new THREE.MeshStandardMaterial({ color: leaf, roughness: 0.85, side: THREE.DoubleSide }), { heightRef: 0.4, amp: 0.05 });
    const inst = new THREE.InstancedMesh(g, m, fernN);
    let i = 0;
    scatter(fernN, rng, terrain, world, { nearTrees: 0.85, trunk: 0.6 }, (x, y, z, r) => {
      if (i >= fernN) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, r() * 6.28, 0);
      dummy.scale.setScalar(0.8 + r() * 0.8);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      i++;
    });
    inst.count = i;
    inst.castShadow = false;
    inst.receiveShadow = true;
    own(inst);
  }

  // bushes
  const bushN = Math.round(70 * D.bushes * (0.6 + q * 0.4));
  if (bushN > 0) {
    const g = bushGeometry(rng);
    const sp = speciesById(region.species[0][0]);
    const bc = leafColors(region, sp)[2];
    const m = windPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { heightRef: 1, amp: 0.04 });
    const inst = new THREE.InstancedMesh(g, m, bushN);
    let i = 0;
    scatter(bushN, rng, terrain, world, { nearTrees: 0.6, trunk: 1.4, road: 0.15, pad: 16 }, (x, y, z, r) => {
      if (i >= bushN) return;
      dummy.position.set(x, y - 0.05, z);
      dummy.rotation.set(0, r() * 6.28, 0);
      const s = 0.7 + r() * 0.8;
      dummy.scale.set(s, s * (0.8 + r() * 0.4), s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      tmpC.set(bc).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.1);
      if (region.ground.cover === "snow") tmpC.lerp(col("#e8eef2"), 0.35);
      inst.setColorAt(i, tmpC);
      i++;
    });
    inst.count = i;
    inst.castShadow = shadows;
    inst.receiveShadow = true;
    own(inst);
  }

  // fallen branches
  const brN = Math.round(60 * D.branches);
  if (brN > 0) {
    const g = new THREE.CylinderGeometry(0.035, 0.05, 1.6, 5);
    g.rotateZ(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: "#5a4433", roughness: 0.95 });
    const inst = new THREE.InstancedMesh(g, m, brN);
    let i = 0;
    scatter(brN, rng, terrain, world, { nearTrees: 0.7, trunk: 0.8, road: 0.4 }, (x, y, z, r) => {
      if (i >= brN) return;
      dummy.position.set(x, y + 0.03, z);
      dummy.rotation.set(0, r() * 6.28, (r() - 0.5) * 0.1);
      dummy.scale.set(0.5 + r() * 0.9, 0.7 + r() * 0.6, 0.7 + r() * 0.6);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      i++;
    });
    inst.count = i;
    inst.receiveShadow = true;
    own(inst);
  }

  // pebbles
  const pebN = Math.round(160 * Math.max(0.5, q) * Math.max(0.5, D.rocks));
  {
    const g = rockGeometry(3, 0.16);
    const m = new THREE.MeshStandardMaterial({ color: region.ground.rock, roughness: 0.95, flatShading: true });
    const inst = new THREE.InstancedMesh(g, m, pebN);
    let i = 0;
    scatter(pebN, rng, terrain, world, { road: 1.1, pad: 9, trunk: 0.5 }, (x, y, z, r) => {
      if (i >= pebN) return;
      dummy.position.set(x, y - 0.03, z);
      dummy.rotation.set(r() * 3, r() * 6.28, r() * 3);
      dummy.scale.setScalar(0.5 + r() * 1.3);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      tmpC.set(region.ground.rock).offsetHSL(0, 0, (r() - 0.5) * 0.15);
      inst.setColorAt(i, tmpC);
      i++;
    });
    inst.count = i;
    inst.receiveShadow = true;
    own(inst);
  }

  // leaf litter (autumn / golden)
  const litN = Math.round(2400 * q * D.leafLitter);
  if (litN > 0) {
    const g = new THREE.PlaneGeometry(0.13, 0.09);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(g, m, litN);
    const pal = region.id === "golden-forest" ? ["#e3b23c", "#c99528", "#f0c95a"] : ["#d2582a", "#e57a2e", "#b8421f", "#d89a35", "#8f5a22"];
    let i = 0;
    scatter(litN, rng, terrain, world, { nearTrees: 0.7, trunk: 0.3, road: 0.6, pad: 10 }, (x, y, z, r) => {
      if (i >= litN) return;
      dummy.position.set(x, y + 0.015, z);
      dummy.rotation.set((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4);
      dummy.scale.setScalar(0.8 + r() * 0.8);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, tmpC.set(pal[Math.floor(r() * pal.length)]));
      i++;
    });
    inst.count = i;
    inst.receiveShadow = true;
    own(inst);
  }

  // mushrooms near trunks (a touch of charm)
  {
    const n = Math.round(40 * Math.max(0.5, q));
    const stem = new THREE.CylinderGeometry(0.025, 0.03, 0.1, 6);
    stem.translate(0, 0.05, 0);
    const capG = new THREE.SphereGeometry(0.07, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    capG.translate(0, 0.09, 0);
    const parts = [stem.toNonIndexed(), capG.toNonIndexed()];
    const cs = [];
    for (let k = 0; k < parts[0].attributes.position.count; k++) cs.push(0.93, 0.9, 0.82);
    for (let k = 0; k < parts[1].attributes.position.count; k++) cs.push(0.75, 0.2, 0.15);
    const g = mergeGeometries(parts);
    g.setAttribute("color", new THREE.Float32BufferAttribute(cs, 3));
    stem.dispose();
    capG.dispose();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const inst = new THREE.InstancedMesh(g, m, n);
    let i = 0;
    scatter(n, rng, terrain, world, { nearTrees: 1, trunk: 0.45 }, (x, y, z, r) => {
      if (i >= n) return;
      dummy.position.set(x, y - 0.01, z);
      dummy.rotation.set(0, r() * 6.28, 0);
      dummy.scale.setScalar(0.7 + r() * 0.8);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      i++;
    });
    inst.count = i;
    own(inst);
  }

  // big rocks (the engine's colliders)
  {
    const m = new THREE.MeshStandardMaterial({ color: region.ground.rock, roughness: 0.92, flatShading: true });
    disposables.push(m);
    for (const rk of world.rocks) {
      const g = rockGeometry(rk.seed % 97, rk.r);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(rk.x, rk.y - rk.r * 0.18, rk.z);
      mesh.rotation.y = rk.rot;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      disposables.push(g);
      group.add(mesh);
      if (region.ground.cover === "snow") {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(rk.r * 0.95, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.32), new THREE.MeshStandardMaterial({ color: "#f4f8fb", roughness: 0.8 }));
        cap.position.set(rk.x, rk.y + rk.r * 0.18, rk.z);
        cap.scale.set(1.1, 0.9, 1.0);
        disposables.push(cap.geometry, cap.material);
        group.add(cap);
      }
    }
  }

  // backdrop forest on the hills (instanced, non-interactive)
  {
    const sp = region.species.map(([id]) => speciesById(id));
    const conN = Math.round(420 * (0.5 + q * 0.5));
    const broadN = conN;
    const conMat = new THREE.MeshLambertMaterial({ vertexColors: false });
    const mk = (conifer, n, filter) => {
      const g = backdropTreeGeometry(conifer);
      const inst = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial(), n);
      const pal = sp.filter(filter).flatMap((s) => leafColors(region, s));
      const fallback = conifer ? ["#2f5e3c", "#2a5236"] : ["#5f8e3a", "#6e9a42"];
      const colors = pal.length ? pal : fallback;
      let i = 0;
      let tries = 0;
      while (i < n && tries++ < n * 8) {
        const a = rng() * Math.PI * 2;
        const r = PLAY_RADIUS + 4 + Math.pow(rng(), 0.7) * 95;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (terrain.roadDist(x, z) < 4) continue;
        const y = terrain.analytic(x, z);
        dummy.position.set(x, y - 0.3, z);
        dummy.rotation.set(0, rng() * 6.28, 0);
        const s = (1.1 + rng() * 0.9) * region.treeScale;
        dummy.scale.set(s, s * (0.9 + rng() * 0.4), s);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        tmpC.set(colors[Math.floor(rng() * colors.length)]).offsetHSL(0, 0, (rng() - 0.5) * 0.08);
        if (region.ground.cover === "snow") tmpC.lerp(col("#e9eef2"), 0.3);
        inst.setColorAt(i, tmpC);
        i++;
      }
      inst.count = i;
      inst.castShadow = false;
      own(inst);
    };
    const hasConifer = sp.some((s) => ["pine", "fir", "spruce"].includes(s.form));
    const hasBroad = sp.some((s) => !["pine", "fir", "spruce"].includes(s.form));
    if (hasConifer) mk(true, hasBroad ? conN * 0.6 : conN * 1.3, (s) => ["pine", "fir", "spruce"].includes(s.form));
    if (hasBroad) mk(false, hasConifer ? broadN * 0.6 : broadN * 1.3, (s) => !["pine", "fir", "spruce"].includes(s.form));
    conMat.dispose();
  }

  /* ---------------------------------------------------------- lights */
  const L = region.light;
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(L.sun, L.sunIntensity);
  sun.position.copy(sky.sunDir).multiplyScalar(60);
  sun.castShadow = shadows;
  const res = settings.graphics === "high" ? 2048 : 1024;
  sun.shadow.mapSize.set(res, res);
  const S = settings.graphics === "high" ? 34 : 28;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  group.add(sun);
  group.add(sun.target);
  const fill = new THREE.DirectionalLight(L.hemiSky, 0.25);
  fill.position.set(-sky.sunDir.x * 50, 30, -sky.sunDir.z * 50);
  group.add(fill);

  const fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);

  return {
    group,
    sun,
    sky: sky.mesh,
    fog,
    background: col(L.skyHorizon),
    /** keep the shadow frustum + sky centred on what the camera looks at */
    update(focus, camPos) {
      sun.position.set(focus.x + sky.sunDir.x * 60, focus.y + sky.sunDir.y * 60, focus.z + sky.sunDir.z * 60);
      sun.target.position.set(focus.x, focus.y, focus.z);
      // texel snapping kills shadow shimmer while walking
      const texel = (S * 2) / res;
      sun.target.position.x = Math.round(sun.target.position.x / texel) * texel;
      sun.target.position.z = Math.round(sun.target.position.z / texel) * texel;
      sun.position.x = sun.target.position.x + sky.sunDir.x * 60;
      sun.position.z = sun.target.position.z + sky.sunDir.z * 60;
      sun.target.updateMatrixWorld();
      if (camPos) sky.mesh.position.copy(camPos);
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
      sun.dispose();
      if (sun.shadow && sun.shadow.map) sun.shadow.map.dispose();
    },
  };
}

export { WORLD_UNIFORMS, MILL };
