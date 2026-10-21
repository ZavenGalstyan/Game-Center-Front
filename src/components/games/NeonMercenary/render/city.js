/**
 * District renderer: turns a compiled map (engine/map.js) into a lit, rainy
 * neon city. Everything static is merged into a handful of draw calls:
 *
 *   ground      wet asphalt shader (procedural puddles + animated ripples)
 *   buildings   one merged mesh, facade shader draws windows / storefronts
 *   skyline     distant towers (own haze so the fog doesn't swallow them)
 *   props       merged boxes per material bucket (world-space UVs)
 *   signs       neon sign quads from a canvas atlas + halos + wet-street
 *               reflections, flicker in the shader
 *   lamps, light pools, a few real point lights, steam, holograms, traffic
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { walkable, CELL } from "../engine/map.js";
import { rng } from "../engine/math.js";
import { signAtlas, glowTex, streakTex, softTex, tileTex } from "./textures.js";

const C = (h) => new THREE.Color(h);

/* =============================================================== shaders */
const NOISE = `
float nmHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nmNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nmHash(i), nmHash(i + vec2(1, 0)), f.x), mix(nmHash(i + vec2(0, 1)), nmHash(i + vec2(1, 1)), f.x), f.y);
}
float nmFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * nmNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

function groundMaterial(palette, kind = "asphalt", time) {
  const base = kind === "asphalt" ? palette.ground : kind === "tiles" ? "#2a2b31" : kind === "marble" ? "#c8ccd4" : kind === "office" ? "#2a2e38" : kind === "server" ? "#101319" : kind === "roof" ? "#2a2c32" : "#1c1a18";
  const tex = kind === "tiles" ? tileTex("tiles") : kind === "marble" ? tileTex("marble") : kind === "server" || kind === "office" ? tileTex("grate") : kind === "tunnel" || kind === "roof" ? tileTex("concrete") : null;
  const m = new THREE.MeshStandardMaterial({ color: C(base), roughness: 0.7, metalness: 0.0, map: tex });
  if (tex) {
    tex.repeat.set(1, 1);
  }
  const wet = kind === "asphalt" || kind === "roof" ? 1 : kind === "tunnel" ? 0.6 : 0.25;
  const u = { uTime: time, uWet: { value: wet }, uTile: { value: kind === "tiles" ? 0.25 : kind === "marble" ? 0.2 : 0.33 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vGW; uniform float uTime; uniform float uWet; uniform float uTile;\n${NOISE}\nfloat nmPuddle = 0.0;`)
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  diffuseColor *= texture2D(map, vGW.xz * uTile);
#endif
  float n1 = nmFbm(vGW.xz * 0.11);
  float n2 = nmNoise(vGW.xz * 1.7);
  nmPuddle = smoothstep(0.52, 0.6, n1) * uWet;
  diffuseColor.rgb *= (0.82 + 0.3 * n2) * mix(1.0, 0.55, nmPuddle);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(mix(0.62, 0.42, uWet) + 0.12 * n2, 0.03, nmPuddle);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
  if (nmPuddle > 0.01) {
    // rain ripples: expanding rings on a jittered grid
    vec2 g = vGW.xz * 1.6;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = nmHash(id);
    float t = fract(uTime * 0.9 + h * 7.0);
    vec2 o = vec2(nmHash(id + 3.1), nmHash(id + 7.7)) - 0.5;
    float d = length(f - o * 0.5);
    float ring = sin((d - t * 0.45) * 60.0) * smoothstep(0.45 * t + 0.06, 0.45 * t, d) * (1.0 - t);
    vec2 dir = (f - o * 0.5) / max(d, 1e-3);
    vec3 rip = vec3(dir.x * ring, 0.0, dir.y * ring) * 0.35 * nmPuddle;
    normal = normalize(normal + (viewMatrix * vec4(rip, 0.0)).xyz);
  }`
      );
  };
  m.customProgramCacheKey = () => `nm-ground-${kind}`;
  return m;
}

function facadeMaterial(style, palette, time, distant = false) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.1, vertexColors: true, fog: !distant });
  const neon = palette.neon.map((h) => C(h));
  const u = {
    uTime: time,
    uN0: { value: neon[0] },
    uN1: { value: neon[1] },
    uN2: { value: neon[2] },
    uN3: { value: neon[3] },
    uStyle: { value: style === "corporate" ? 2 : style === "industrial" ? 1 : 0 },
    uFogC: { value: C(palette.fog) },
    uDistant: { value: distant ? 1 : 0 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSeed; varying float vSeed; varying vec3 vFW; varying vec3 vFN;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz; vFN = normalize(mat3(modelMatrix) * objectNormal); vSeed = aSeed;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vSeed; varying vec3 vFW; varying vec3 vFN;
uniform float uTime; uniform vec3 uN0; uniform vec3 uN1; uniform vec3 uN2; uniform vec3 uN3; uniform float uStyle; uniform vec3 uFogC; uniform float uDistant;
${NOISE}
vec3 nmEmit = vec3(0.0); float nmGlass = 0.0;`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  // interpolated per-building seed jitters in the last bits → quantise before hashing
  float sd = floor(vSeed * 1000.0 + 0.5) / 1000.0;
  vec3 nn = normalize(vFN);
  if (abs(nn.y) < 0.5) {
    float u = abs(nn.x) > 0.5 ? vFW.z * sign(nn.x) : -vFW.x * sign(nn.z);
    float v = vFW.y;
    float cw = uStyle > 1.5 ? 1.6 : mix(2.1, 3.3, fract(sd * 7.13));
    float ch = uStyle > 1.5 ? 3.6 : 3.3;
    vec2 cell = vec2(u / cw, v / ch);
    vec2 id = floor(cell); vec2 f = fract(cell);
    float wx0 = uStyle > 1.5 ? 0.08 : (uStyle > 0.5 ? 0.32 : 0.24);
    float wy0 = uStyle > 1.5 ? 0.14 : (uStyle > 0.5 ? 0.38 : 0.3);
    float win = step(wx0, f.x) * step(f.x, 1.0 - wx0) * step(wy0, f.y) * step(f.y, 0.88);
    float h = nmHash(id + sd * 37.0);
    float h2 = nmHash(id * 1.7 + sd * 11.0);
    float floorBand = step(v, 4.6);
    float lit = step(uStyle > 1.5 ? 0.45 : (uStyle > 0.5 ? 0.78 : 0.58), h) * win * (1.0 - floorBand);
    // rare flicker
    lit *= 1.0 - step(0.985, h2) * step(0.5, fract(uTime * 3.0 + h * 10.0));
    vec3 warm = vec3(1.0, 0.72, 0.42);
    vec3 cool = vec3(0.55, 0.78, 1.0);
    vec3 wc = h2 < 0.45 ? warm : (h2 < 0.75 ? cool : (h2 < 0.85 ? uN0 : (h2 < 0.93 ? uN1 : uN2)));
    if (uStyle > 0.5 && uStyle < 1.5) wc = h2 < 0.7 ? vec3(1.0, 0.6, 0.25) : vec3(0.9, 0.85, 0.7);
    if (uStyle > 1.5) wc = h2 < 0.6 ? vec3(0.75, 0.88, 1.0) : (h2 < 0.85 ? vec3(0.5, 0.7, 1.0) : uN0);
    float dim = 0.35 + 0.65 * h;
    // facade colour: concrete / panel noise, vertical rain streaks
    float grime = nmFbm(vec2(u * 0.35, v * 0.08) + sd * 9.0);
    vec3 wall = diffuseColor.rgb * (0.55 + 0.6 * grime);
    wall *= 1.0 - 0.25 * step(0.92, fract(v / ch));
    vec3 glassC = uStyle > 1.5 ? vec3(0.05, 0.09, 0.15) : vec3(0.03, 0.035, 0.05);
    diffuseColor.rgb = mix(wall, glassC, win);
    nmGlass = win;
    nmEmit += lit * wc * dim * (uStyle > 1.5 ? 0.7 : 0.85);
    // street-level storefronts: glowing glass + a neon strip
    if (floorBand > 0.5) {
      float sid = floor(u / 6.0);
      float sh = nmHash(vec2(sid, sd * 13.0));
      float shopOpen = step(0.25, sh);
      float gl = step(0.6, v) * step(v, 3.6) * step(0.08, fract(u / 6.0)) * step(fract(u / 6.0), 0.92);
      vec3 sc = sh < 0.5 ? uN0 : (sh < 0.75 ? uN1 : (sh < 0.9 ? uN3 : uN2));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04), gl);
      nmGlass = max(nmGlass, gl);
      nmEmit += gl * shopOpen * mix(vec3(1.0, 0.85, 0.65) * 0.5, sc * 0.6, 0.5) * (0.5 + 0.3 * nmNoise(vec2(u * 2.0, v * 3.0)));
      float strip = step(3.75, v) * step(v, 3.95) * shopOpen;
      nmEmit += strip * sc * 3.0;
    }
    // occasional vertical neon edge strip
    float edge = step(0.93, fract(sd * 3.7)) * step(abs(fract(u / 40.0) - 0.5), 0.004) ;
    nmEmit += edge * uN1 * 2.0;
  } else {
    // roofs: dark with a little noise
    diffuseColor.rgb *= 0.35 + 0.25 * nmNoise(vFW.xz * 0.5);
  }`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, uStyle > 1.5 ? 0.08 : 0.15, nmGlass);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, uStyle > 1.5 ? 0.9 : 0.6, nmGlass);`
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += nmEmit;")
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
  if (uDistant > 0.5) {
    float d = length(vFW.xz - cameraPosition.xz);
    float hz = 1.0 - exp(-d * 0.0042);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogC * 1.6, hz * 0.85);
  }`
      );
  };
  m.customProgramCacheKey = () => `nm-facade-${style}-${distant ? 1 : 0}`;
  return m;
}

/* =============================================================== geometry helpers */
/** Box with world-scaled UVs (texScale = tiles per metre) and an optional vertex colour. */
function wbox(x0, y0, z0, x1, y1, z1, texScale = 0.5, color = null) {
  const w = Math.max(0.001, x1 - x0);
  const h = Math.max(0.001, y1 - y0);
  const d = Math.max(0.001, z1 - z0);
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order +x -x +y -y +z -z, 4 verts each
  const dims = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] * texScale, uv.getY(i) * dims[f][1] * texScale);
    }
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const col = new THREE.Color(color || "#ffffff");
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) {
    cols[i] = col.r;
    cols[i + 1] = col.g;
    cols[i + 2] = col.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}
function wcyl(x, z, r, y0, y1, color = null, seg = 16, horizontalAlong = null, len = 0) {
  let g;
  if (horizontalAlong) {
    g = new THREE.CylinderGeometry(r, r, len, seg);
    if (horizontalAlong === "x") g.rotateZ(Math.PI / 2);
    else g.rotateX(Math.PI / 2);
    g.translate(x, y0, z);
  } else {
    g = new THREE.CylinderGeometry(r, r, y1 - y0, seg);
    g.translate(x, (y0 + y1) / 2, z);
  }
  const col = new THREE.Color(color || "#ffffff");
  const cols = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < cols.length; i += 3) {
    cols[i] = col.r;
    cols[i + 1] = col.g;
    cols[i + 2] = col.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}

const CAR_COLORS = ["#7a1020", "#14323f", "#cfd3da", "#1d1f26", "#3a2a5a"];
const CONTAINER_COLORS = ["#8a2a1a", "#1f4f7a", "#2f6a3a", "#9a7a20", "#5a2a6a", "#7a7a80"];

/* =============================================================== district */
export function buildDistrict(G, quality, shared) {
  const M = G.map;
  const def = G.def;
  const pal = def.palette;
  const group = new THREE.Group();
  group.name = `district-${def.id}`;
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const time = shared.time; // {value}
  const R = rng(def.id.length * 977 + 13);
  const Q = { low: 0, medium: 1, high: 2 }[quality] ?? 1;

  /* ---------------------------------------------------- ground + floors */
  const city = { x0: M.origin[0], z0: M.origin[1], x1: M.origin[0] + M.cityW, z1: M.origin[1] + M.cityD };
  {
    const g = keep(new THREE.PlaneGeometry(city.x1 - city.x0 + 40, city.z1 - city.z0 + 40));
    g.rotateX(-Math.PI / 2);
    g.translate((city.x0 + city.x1) / 2, 0, (city.z0 + city.z1) / 2);
    const mesh = new THREE.Mesh(g, keep(groundMaterial(pal, "asphalt", time)));
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const a of def.areas || []) {
      const fg = keep(new THREE.PlaneGeometry(a.x1 - a.x0, a.z1 - a.z0));
      fg.rotateX(-Math.PI / 2);
      fg.translate((a.x0 + a.x1) / 2, 0.001, (a.z0 + a.z1) / 2);
      const fm = new THREE.Mesh(fg, keep(groundMaterial(pal, a.floor || "tiles", time)));
      fm.receiveShadow = true;
      group.add(fm);
    }
  }

  /* ---------------------------------------------------- buildings */
  const bgeos = [];
  const sidewalk = [];
  const tint = def.buildingStyle === "corporate" ? ["#5a6474", "#7a8494", "#4a5262", "#8a94a4"] : def.buildingStyle === "industrial" ? ["#5a5048", "#4a4440", "#6a5a4a", "#3e3a38"] : ["#4a4652", "#5a5060", "#3e3a46", "#62586a"];
  for (const b of M.buildings) {
    const g = wbox(b.x0, 0, b.z0, b.x1, b.y1, b.z1, 1, tint[Math.floor(R() * tint.length)]);
    const seed = new Float32Array(g.attributes.position.count).fill(R());
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    bgeos.push(g);
    // set-back crown / rooftop box for skyline variety
    if (b.y1 > 18 && R() < 0.6) {
      const inset = Math.min(b.x1 - b.x0, b.z1 - b.z0) * (0.15 + R() * 0.15);
      const g2 = wbox(b.x0 + inset, b.y1, b.z0 + inset, b.x1 - inset, b.y1 + 3 + R() * 9, b.z1 - inset, 1, tint[Math.floor(R() * tint.length)]);
      g2.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(g2.attributes.position.count).fill(R()), 1));
      bgeos.push(g2);
    }
    // sidewalk ring (visual)
    sidewalk.push(wbox(b.x0 - 2.2, 0, b.z0 - 2.2, b.x1 + 2.2, 0.06, b.z1 + 2.2, 0.5));
  }
  const facadeMat = keep(facadeMaterial(def.buildingStyle, pal, time));
  if (bgeos.length) {
    const g = keep(mergeGeometries(bgeos));
    bgeos.forEach((x) => x.dispose());
    const mesh = new THREE.Mesh(g, facadeMat);
    mesh.castShadow = Q > 0;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (sidewalk.length && def.buildingStyle !== "industrial") {
    const g = keep(mergeGeometries(sidewalk));
    sidewalk.forEach((x) => x.dispose());
    const mat = keep(new THREE.MeshStandardMaterial({ map: tileTex("tiles"), color: C(def.buildingStyle === "corporate" ? "#4a4e58" : "#3a3840"), roughness: 0.35, metalness: 0.0 }));
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  } else sidewalk.forEach((x) => x.dispose());

  /* ---------------------------------------------------- skyline */
  {
    const sk = [];
    const cx = (city.x0 + city.x1) / 2;
    const cz = (city.z0 + city.z1) / 2;
    const n = [40, 80, 130][Q];
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const r = 105 + R() * 170;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const w = 14 + R() * 26;
      const d = 14 + R() * 26;
      const h = 40 + R() * R() * 190;
      const g = wbox(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, 1, tint[Math.floor(R() * tint.length)]);
      g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(R()), 1));
      sk.push(g);
      if (h > 120 && R() < 0.5) {
        const g2 = wbox(x - w * 0.3, h, z - d * 0.3, x + w * 0.3, h + 20 + R() * 30, z + d * 0.3, 1, "#444");
        g2.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(g2.attributes.position.count).fill(R()), 1));
        sk.push(g2);
      }
    }
    const g = keep(mergeGeometries(sk));
    sk.forEach((x) => x.dispose());
    group.add(new THREE.Mesh(g, keep(facadeMaterial(def.buildingStyle, pal, time, true))));
  }

  /* ---------------------------------------------------- props (merged buckets) */
  const style = def.buildingStyle;
  const B = { concrete: [], metal: [], paint: [], crate: [], container: [], hazard: [], iwall: [], ceiling: [], glass: [], emit: [], screen: [], server: [], wood: [] };
  const E = (x0, y0, z0, x1, y1, z1, col) => B.emit.push(wbox(x0, y0, z0, x1, y1, z1, 1, col));
  const neon = pal.neon;
  const pick = (a) => a[Math.floor(R() * a.length)];
  const lamps = [];
  const pools = [];
  const steamAt = [];
  const holos = [];
  for (const b of M.boxes) {
    const { x0, x1, z0, z1, y0, y1 } = b;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = x1 - x0;
    const d = z1 - z0;
    const alongX = w >= d;
    switch (b.kind) {
      case "building":
        break;
      case "wall":
        B.concrete.push(wbox(x0, y0, z0, x1, y1, z1, 0.3, style === "industrial" ? "#7a6e60" : "#6a6670"));
        B.emit.push(wbox(x0 - 0.02, y1 - 0.25, z0 - 0.02, x1 + 0.02, y1 - 0.15, z1 + 0.02, 1, pick(neon)));
        break;
      case "barrier":
        B.concrete.push(wbox(x0, 0, z0, x1, y1 * 0.8, z1, 0.5, "#8a8a8e"));
        B.hazard.push(wbox(x0 - 0.01, y1 * 0.45, z0 - 0.01, x1 + 0.01, y1 * 0.7, z1 + 0.01, 1.2));
        B.concrete.push(wbox(x0 + 0.1, y1 * 0.8, z0 + 0.1, x1 - 0.1, y1, z1 - 0.1, 0.5, "#8a8a8e"));
        break;
      case "gate":
        B.hazard.push(wbox(x0, y0, z0, x1, y1, z1, 0.6));
        E(x0, y1 - 0.2, z0 - 0.03, x1, y1 - 0.08, z1 + 0.03, "#ff3b5c");
        break;
      case "crate":
        if (y1 > 2) B.container.push(wbox(x0, y0, z0, x1, y1, z1, 0.25, pick(CONTAINER_COLORS)));
        else B.crate.push(wbox(x0, y0, z0, x1, y1, z1, 0.8));
        break;
      case "container":
        B.container.push(wbox(x0, y0, z0, x1, y1, z1, 0.25, CONTAINER_COLORS[(b.color ?? 0) % CONTAINER_COLORS.length]));
        B.metal.push(wbox(x0 - 0.03, y1 - 0.08, z0 - 0.03, x1 + 0.03, y1, z1 + 0.03, 1, "#333"));
        if (b.id === "hd0447") E(cx - 0.6, 1.6, z1 + 0.01, cx + 0.6, 1.9, z1 + 0.03, "#ff3b5c");
        if (y1 > 3) B.metal.push(wbox(x0 - 0.03, 2.55, z0 - 0.03, x1 + 0.03, 2.65, z1 + 0.03, 1, "#222"));
        break;
      case "dumpster":
        B.paint.push(wbox(x0, 0.1, z0, x1, y1 - 0.12, z1, 1, "#24402c"));
        B.metal.push(wbox(x0 - 0.04, y1 - 0.12, z0 - 0.04, x1 + 0.04, y1, z1 + 0.04, 1, "#1b2a20"));
        B.metal.push(wbox(x0 + 0.1, 0, z0 + 0.1, x1 - 0.1, 0.1, z1 - 0.1, 1, "#111"));
        break;
      case "car":
      case "truck": {
        const col = CAR_COLORS[(b.color ?? 0) % CAR_COLORS.length];
        const ax = alongX;
        const L = ax ? w : d;
        const lo = 0.25;
        B.paint.push(wbox(x0, lo, z0, x1, b.kind === "truck" ? y1 * 0.45 : 0.85, z1, 1, col));
        if (b.kind === "car") {
          const ix = ax ? L * 0.2 : 0.18;
          const iz = ax ? 0.18 : L * 0.2;
          B.glass.push(wbox(x0 + ix, 0.85, z0 + iz, x1 - ix, y1, z1 - iz, 1));
          B.paint.push(wbox(x0 + ix + (ax ? 0.2 : 0.05), y1 - 0.05, z0 + iz + (ax ? 0.05 : 0.2), x1 - ix - (ax ? 0.2 : 0.05), y1, z1 - iz - (ax ? 0.05 : 0.2), 1, col));
        } else {
          B.paint.push(wbox(ax ? x0 + L * 0.28 : x0, y1 * 0.45, ax ? z0 : z0 + L * 0.28, x1, y1, z1, 1, "#5a5a60"));
          B.glass.push(wbox(ax ? x0 : x0 + 0.1, y1 * 0.45, ax ? z0 + 0.1 : z0, ax ? x0 + L * 0.27 : x1 - 0.1, y1 * 0.8, ax ? z1 - 0.1 : z0 + L * 0.27, 1));
        }
        // wheels
        for (const s of [0.18, 0.82])
          for (const t of [0, 1]) {
            const wx = ax ? x0 + w * s : t ? x1 - 0.1 : x0 + 0.1;
            const wz = ax ? (t ? z1 - 0.1 : z0 + 0.1) : z0 + d * s;
            B.metal.push(wcyl(wx, wz, 0.32, 0.32, 0, "#111", 12, ax ? "z" : "x", 0.24));
          }
        // lights: white front, red back, neon underglow
        const fwd = ax ? [x1 - 0.02, 0.55, cz] : [cx, 0.55, z1 - 0.02];
        if (ax) {
          E(x1 - 0.04, 0.55, z0 + 0.2, x1 + 0.01, 0.7, z0 + 0.5, "#fff6e0");
          E(x1 - 0.04, 0.55, z1 - 0.5, x1 + 0.01, 0.7, z1 - 0.2, "#fff6e0");
          E(x0 - 0.01, 0.6, z0 + 0.15, x0 + 0.04, 0.72, z1 - 0.15, "#ff2030");
        } else {
          E(x0 + 0.2, 0.55, z1 - 0.04, x0 + 0.5, 0.7, z1 + 0.01, "#fff6e0");
          E(x1 - 0.5, 0.55, z1 - 0.04, x1 - 0.2, 0.7, z1 + 0.01, "#fff6e0");
          E(x0 + 0.15, 0.6, z0 - 0.01, x1 - 0.15, 0.72, z0 + 0.04, "#ff2030");
        }
        void fwd;
        if (R() < 0.6) pools.push({ x: cx, z: cz, r: 3.2, color: pick(neon), k: 0.5 });
        break;
      }
      case "stall": {
        const col = pick(neon);
        B.wood.push(wbox(x0, 0, z0, x1, y1, z1, 0.8));
        B.metal.push(wbox(x0 - 0.05, y1, z0 - 0.05, x1 + 0.05, y1 + 0.06, z1 + 0.05, 1, "#555"));
        for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.metal.push(wbox(px - 0.04, 0, pz - 0.04, px + 0.04, 2.5, pz + 0.04, 1, "#444"));
        B.paint.push(wbox(x0 - 0.6, 2.5, z0 - 0.4, x1 + 0.6, 2.62, z1 + 0.4, 1, R() < 0.5 ? "#5a1a3a" : "#1a3a5a"));
        E(x0 - 0.6, 2.42, z0 - 0.42, x1 + 0.6, 2.5, z0 - 0.38, col);
        E(x0 - 0.6, 2.42, z1 + 0.38, x1 + 0.6, 2.5, z1 + 0.42, col);
        pools.push({ x: cx, z: cz, r: 4, color: col, k: 0.9 });
        lamps.push({ x: cx, y: 2.3, z: cz, color: col, small: true });
        break;
      }
      case "counter": {
        B.wood.push(wbox(x0, 0, z0, x1, y1, z1, 0.8));
        E(x0, y1 - 0.08, z1 - 0.01, x1, y1 - 0.02, z1 + 0.02, "#ff2bd6");
        B.paint.push(wbox(x0 - 0.3, 2.6, z0 - 1.2, x1 + 0.3, 2.72, z1 + 0.3, 1, "#6a1838"));
        for (const px of [x0, x1]) B.metal.push(wbox(px - 0.05, 0, z0 - 1.2, px + 0.05, 2.6, z0 - 1.1, 1, "#444"));
        E(x0 - 0.3, 2.5, z1 + 0.28, x1 + 0.3, 2.6, z1 + 0.32, "#ffb02e");
        pools.push({ x: cx, z: cz + 1, r: 4.5, color: "#ffb02e", k: 1 });
        steamAt.push({ x: cx - 1.5, y: 1.2, z: cz, rate: 0.6, small: true });
        break;
      }
      case "kiosk":
        B.metal.push(wbox(x0, 0, z0, x1, y1, z1, 1, "#2a2e36"));
        B.screen.push(wbox(x0 - 0.02, 0.9, z0 + 0.15, x1 + 0.02, y1 - 0.3, z1 - 0.15, 1));
        B.screen.push(wbox(x0 + 0.15, 0.9, z0 - 0.02, x1 - 0.15, y1 - 0.3, z1 + 0.02, 1));
        E(x0, y1, z0, x1, y1 + 0.06, z1, pick(neon));
        holos.push({ x: cx, y: y1 + 1.4, z: cz, s: 1.2, color: pick(neon), kind: "ring" });
        break;
      case "desk":
      case "labtable":
        B[b.kind === "labtable" ? "metal" : "paint"].push(wbox(x0, y1 - 0.08, z0, x1, y1, z1, 1, b.kind === "labtable" ? "#c8ced8" : "#3a3238"));
        B.metal.push(wbox(x0 + 0.08, 0, z0 + 0.08, x1 - 0.08, y1 - 0.08, z1 - 0.08, 1, "#24262c"));
        B.screen.push(wbox(cx - 0.35, y1, cz - 0.05, cx + 0.35, y1 + 0.45, cz + 0.05, 1));
        break;
      case "terminal":
      case "console":
      case "gateTerm": {
        B.metal.push(wbox(x0, y0, z0, x1, y1, z1, 1, "#2a2e36"));
        const sy0 = y0 + (y1 - y0) * 0.45;
        B.screen.push(wbox(x0 - 0.02, sy0, z0 + 0.06, x1 + 0.02, y1 - 0.08, z1 - 0.06, 1));
        B.screen.push(wbox(x0 + 0.06, sy0, z0 - 0.02, x1 - 0.06, y1 - 0.08, z1 + 0.02, 1));
        E(x0, y1, z0, x1, y1 + 0.04, z1, b.kind === "gateTerm" ? "#ffb02e" : "#19f0ff");
        pools.push({ x: cx, z: cz, r: 2.4, color: "#19f0ff", k: 0.8 });
        break;
      }
      case "machine": {
        B.metal.push(wbox(x0, 0, z0, x1, y1, z1, 0.5, "#3a3630"));
        B.metal.push(wbox(x0 + 0.4, y1, z0 + 0.4, x1 - 0.4, y1 + 0.8, z1 - 0.4, 0.5, "#2a2622"));
        E(x0 - 0.02, 1.2, z1 - 0.01, x1 + 0.02, 1.35, z1 + 0.02, "#ff8a1f");
        E(x0 - 0.02, 2.6, z0 - 0.02, x1 + 0.02, 2.7, z1 + 0.02, "#ff5a1a");
        B.screen.push(wbox(cx - 0.6, 1.6, z1 - 0.02, cx + 0.6, 2.3, z1 + 0.05, 1));
        for (let k = 0; k < 3; k++) B.metal.push(wcyl(x0 + 1 + k * 2, cz, 0.18, y1 + 0.8, y1 + 3.5, "#4a443c", 8));
        steamAt.push({ x: cx, y: y1 + 1, z: cz, rate: 1 });
        pools.push({ x: cx, z: z1 + 1.5, r: 4.5, color: "#ff8a1f", k: 0.9 });
        break;
      }
      case "conveyor":
        B.metal.push(wbox(x0, 0, z0, x1, y1 - 0.15, z1, 0.5, "#2c2c30"));
        B.paint.push(wbox(x0, y1 - 0.15, z0 + 0.1, x1, y1, z1 - 0.1, 1, "#111"));
        break;
      case "pipe":
        for (let k = 0; k < 2; k++) B.metal.push(wcyl(cx, cz + (alongX ? (k - 0.5) * 0.45 : 0), Math.min(w, d) * 0.22, y1 * 0.5 + k * 0.4, 0, "#5a544a", 12, alongX ? "x" : "z", Math.max(w, d)));
        for (let s = x0 + 1; alongX && s < x1; s += 3) B.metal.push(wbox(s - 0.1, 0, z0, s + 0.1, y1, z1, 1, "#333"));
        break;
      case "booth":
        B.concrete.push(wbox(x0, 0, z0, x1, 1.1, z1, 0.5, "#7a7a80"));
        B.glass.push(wbox(x0 + 0.05, 1.1, z0 + 0.05, x1 - 0.05, y1 - 0.3, z1 - 0.05, 1));
        B.concrete.push(wbox(x0 - 0.2, y1 - 0.3, z0 - 0.2, x1 + 0.2, y1, z1 + 0.2, 0.5, "#6a6a70"));
        E(x0 - 0.2, y1 - 0.34, z0 - 0.2, x1 + 0.2, y1 - 0.3, z1 + 0.2, "#ffb02e");
        lamps.push({ x: cx, y: y1 + 0.2, z: cz, color: "#ffb02e" });
        break;
      case "pillar":
        B.concrete.push(wbox(x0, 0, z0, x1, y1, z1, 0.5, "#6a6a72"));
        if (y1 > 4) E(x0 - 0.02, y1 - 1.2, z0 - 0.02, x1 + 0.02, y1 - 1.0, z1 + 0.02, pick(neon));
        break;
      case "canopy":
        B.concrete.push(wbox(x0, y0, z0, x1, y1, z1, 0.3, "#3a3a42"));
        for (let s = x0 + 2; s < x1 - 1; s += 4) E(s, y0 - 0.06, z0 + 1, s + 0.25, y0, z1 - 1, "#e8f4ff");
        lamps.push({ x: cx, y: y0 - 0.5, z: cz, color: "#cfe8ff", big: true });
        break;
      case "platform":
        B.concrete.push(wbox(x0, y0, z0, x1, y1, z1, 0.4, "#4a4a52"));
        E(x0, y1 - 0.04, z0 - 0.01, x1, y1 + 0.005, z0 + 0.12, "#ffb02e");
        break;
      case "stairs":
        B.concrete.push(wbox(x0, 0, z0, x1, y1, z1, 0.5, "#55555c"));
        E(x0, y1 - 0.02, z0, x0 + 0.06, y1 + 0.005, z1, "#19f0ff");
        break;
      case "mast":
        B.metal.push(wbox(x0 + 0.6, y0, z0 + 0.6, x1 - 0.6, y1, z1 - 0.6, 1, "#44464e"));
        for (let yy = y0 + 1.5; yy < y1; yy += 1.6) B.metal.push(wbox(x0, yy, z0, x1, yy + 0.08, z1, 1, "#3a3c44"));
        B.metal.push(wcyl(cx, cz - 1.2, 0.9, y1 - 2.5, 0, "#555", 16, "z", 0.2));
        E(cx - 0.12, y1, cz - 0.12, cx + 0.12, y1 + 0.25, cz + 0.12, "#ff2030");
        break;
      case "dropbox":
      case "jammer":
      case "locker":
      case "valve":
      case "node":
      case "uplink":
      case "elevator":
      case "acunit":
      case "antenna":
      case "forklift":
      case "tank":
      case "rack":
      case "core":
      case "cryopod":
      case "bed":
      case "planter":
      case "bench":
      case "holo":
      case "fountain":
      case "helipad":
      case "barrierPost":
      case "crane":
        propDetail(b, B, E, { cx, cz, w, d, alongX, pick, neon, holos, pools, steamAt, lamps, R });
        break;
      case "hatch":
        B.metal.push(wbox(x0, 0, z0, x1, 0.06, z1, 1, "#3a3a3a"));
        E(x0, 0.06, z0, x1, 0.07, z0 + 0.08, "#ffb02e");
        break;
      case "iwall":
        B.iwall.push(wbox(x0, y0, z0, x1, y1, z1, 0.25));
        break;
      case "ceiling":
        B.ceiling.push(wbox(x0, y0, z0, x1, y1, z1, 0.25));
        break;
      case "glass":
        B.glass.push(wbox(x0, y0, z0, x1, y1, z1, 1));
        B.metal.push(wbox(x0, y1 - 0.08, z0, x1, y1, z1, 1, "#9aa0aa"));
        break;
      case "parapet":
        B.concrete.push(wbox(x0, y0, z0, x1, y1, z1, 0.5, "#5a5c64"));
        E(x0, y1, z0, x1, y1 + 0.04, z1, "#19f0ff");
        break;
      default:
        B.metal.push(wbox(x0, y0, z0, x1, y1, z1, 0.5, "#3a3c44"));
    }
  }

  const iwallTex = style === "corporate" ? tileTex("whitePanel") : style === "industrial" ? tileTex("rust") : tileTex("panel");
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ map: tileTex("concrete"), vertexColors: true, roughness: 0.85, metalness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.75 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.45 }),
    crate: new THREE.MeshStandardMaterial({ map: tileTex("crate"), roughness: 0.8, metalness: 0.0 }),
    wood: new THREE.MeshStandardMaterial({ map: tileTex("crate"), color: C("#8a7a6a"), roughness: 0.7, metalness: 0.0 }),
    container: new THREE.MeshStandardMaterial({ map: tileTex("container"), vertexColors: true, roughness: 0.55, metalness: 0.5 }),
    hazard: new THREE.MeshStandardMaterial({ map: tileTex("hazard"), roughness: 0.6, metalness: 0.2 }),
    iwall: new THREE.MeshStandardMaterial({ map: iwallTex, roughness: style === "corporate" ? 0.35 : 0.75, metalness: style === "industrial" ? 0.4 : 0.1 }),
    ceiling: new THREE.MeshStandardMaterial({ map: tileTex("panel"), color: C("#5a5c64"), roughness: 0.8, emissive: C(style === "industrial" ? "#ffcf9a" : "#dff0ff"), emissiveMap: tileTex("ceilingLights"), emissiveIntensity: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: C("#9fd8ff"), roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.32, depthWrite: false }),
    emit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    screen: new THREE.MeshBasicMaterial({ map: tileTex("screen"), toneMapped: false, color: C("#c8f6ff") }),
    server: new THREE.MeshStandardMaterial({ map: tileTex("server"), emissiveMap: tileTex("server"), emissive: C("#ffffff"), emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.6 }),
  };
  tileTex("ceilingLights").repeat.set(1, 1);
  for (const [k, list] of Object.entries(B)) {
    if (!list.length) continue;
    const g = keep(mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => cleanAttrs(x))));
    list.forEach((x) => x.dispose());
    const mat = keep(mats[k]);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = Q > 0 && !["emit", "glass", "screen", "ceiling"].includes(k);
    mesh.receiveShadow = k !== "emit";
    if (k === "glass") mesh.renderOrder = 2;
    group.add(mesh);
  }
  for (const m of Object.values(mats)) if (!disposables.includes(m)) m.dispose();

  /* ---------------------------------------------------- neon signs */
  const atlas = signAtlas(def.id, neon);
  const sPos = [];
  const sUv = [];
  const sCol = [];
  const sFlick = [];
  const haloPos = [];
  const haloCol = [];
  const reflPos = [];
  const reflUv = [];
  const reflCol = [];
  const quad = (arr, uvArr, p0, p1, p2, p3, uv) => {
    arr.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    if (uvArr) uvArr.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[1], uv[2], uv[3], uv[0], uv[3]);
  };
  const pushCol = (arr, col, n = 6) => {
    const c = C(col);
    for (let i = 0; i < n; i++) arr.push(c.r, c.g, c.b);
  };
  const maxSigns = (def.signs || 30) * [1, 1.6, 2.2][Q];
  let nSigns = 0;
  const facesOf = (b) => [
    { n: [1, 0], o: [b.x1, (b.z0 + b.z1) / 2], len: b.z1 - b.z0, t: [0, 1], a: b.z0 },
    { n: [-1, 0], o: [b.x0, (b.z0 + b.z1) / 2], len: b.z1 - b.z0, t: [0, -1], a: b.z1 },
    { n: [0, 1], o: [(b.x0 + b.x1) / 2, b.z1], len: b.x1 - b.x0, t: [-1, 0], a: b.x1 },
    { n: [0, -1], o: [(b.x0 + b.x1) / 2, b.z0], len: b.x1 - b.x0, t: [1, 0], a: b.x0 },
  ];
  const signList = [];
  for (const b of M.buildings) {
    for (const f of facesOf(b)) {
      if (nSigns >= maxSigns) break;
      // street-facing? sample just outside the face
      const sx = f.o[0] + f.n[0] * 3;
      const sz = f.o[1] + f.n[1] * 3;
      if (!walkable(M, sx, sz)) continue;
      const count = Math.max(1, Math.floor(f.len / 7));
      for (let k = 0; k < count && nSigns < maxSigns; k++) {
        if (R() < 0.35) continue;
        const slot = atlas.slots[Math.floor(R() * atlas.slots.length)];
        const along = (k + 0.5) / count - 0.5 + (R() - 0.5) * 0.2;
        const px = f.o[0] + f.t[0] * along * f.len * -1;
        const pz = f.o[1] + f.t[1] * along * f.len * -1;
        const blade = slot.vertical;
        const sw = blade ? 0.95 : 3.2 + R() * 1.6;
        const sh = blade ? 3.6 : sw * 0.5;
        const y = 4.4 + R() * Math.min(10, b.y1 - 7) + sh / 2;
        if (y + sh / 2 > b.y1 - 0.5) continue;
        nSigns++;
        signList.push({ x: px, z: pz, y, n: f.n, t: f.t, w: sw, h: sh, blade, slot });
      }
    }
  }
  const flickT = [];
  for (const s of signList) {
    const { n, t, w, h, y, slot } = s;
    // tangent along the face (perpendicular to n)
    const tx = -n[1];
    const tz = n[0];
    let p0, p1, p2, p3;
    if (s.blade) {
      // blade sign sticks out of the wall, faces along the street (both sides)
      const ox = s.x + n[0] * 0.9;
      const oz = s.z + n[1] * 0.9;
      const hw = 0.75;
      p0 = [ox - n[0] * hw, y - h / 2, oz - n[1] * hw];
      p1 = [ox + n[0] * hw, y - h / 2, oz + n[1] * hw];
      p2 = [ox + n[0] * hw, y + h / 2, oz + n[1] * hw];
      p3 = [ox - n[0] * hw, y + h / 2, oz - n[1] * hw];
      // vertical text: rotate uv
      const { u0, v0, u1, v1 } = slot;
      sPos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      sUv.push(u1, v0, u1, v1, u0, v1, u1, v0, u0, v1, u0, v0);
      sPos.push(...p1, ...p0, ...p3, ...p1, ...p3, ...p2);
      sUv.push(u1, v0, u1, v1, u0, v1, u1, v0, u0, v1, u0, v0);
      pushCol(sCol, "#ffffff", 12);
      const f = R() < 0.18 ? 1 : 0;
      for (let i = 0; i < 12; i++) sFlick.push(f, R());
    } else {
      const ox = s.x + n[0] * 0.08;
      const oz = s.z + n[1] * 0.08;
      p0 = [ox - tx * w / 2, y - h / 2, oz - tz * w / 2];
      p1 = [ox + tx * w / 2, y - h / 2, oz + tz * w / 2];
      p2 = [ox + tx * w / 2, y + h / 2, oz + tz * w / 2];
      p3 = [ox - tx * w / 2, y + h / 2, oz - tz * w / 2];
      quad(sPos, sUv, p0, p1, p2, p3, [slot.u0, slot.v0, slot.u1, slot.v1]);
      pushCol(sCol, "#ffffff");
      const f = R() < 0.15 ? 1 : 0;
      const ph = R();
      for (let i = 0; i < 6; i++) sFlick.push(f, ph);
    }
    // halo
    const hx = s.x + n[0] * 0.05;
    const hz = s.z + n[1] * 0.05;
    const hw2 = (s.blade ? 1.8 : w) * 0.9;
    const hh2 = h * 1.4;
    quad(haloPos, null, [hx - tx * hw2, y - hh2, hz - tz * hw2], [hx + tx * hw2, y - hh2, hz + tz * hw2], [hx + tx * hw2, y + hh2, hz + tz * hw2], [hx - tx * hw2, y + hh2, hz - tz * hw2]);
    pushCol(haloCol, slot.color);
    // wet-street reflection streak + light pool
    if (y < 13 && style !== "industrial") {
      const len = 4 + y * 0.55;
      const rw = (s.blade ? 1.2 : w * 0.7) / 2;
      const bx = s.x + n[0] * 0.5;
      const bz = s.z + n[1] * 0.5;
      const ex = bx + n[0] * len;
      const ez = bz + n[1] * len;
      const yy = 0.035;
      reflPos.push(bx - tx * rw, yy, bz - tz * rw, bx + tx * rw, yy, bz + tz * rw, ex + tx * rw, yy, ez + tz * rw, bx - tx * rw, yy, bz - tz * rw, ex + tx * rw, yy, ez + tz * rw, ex - tx * rw, yy, ez - tz * rw);
      reflUv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      pushCol(reflCol, slot.color);
      pools.push({ x: s.x + n[0] * 3, z: s.z + n[1] * 3, r: 3 + R() * 2, color: slot.color, k: 0.45 });
    }
    if (R() < 0.12) lamps.push({ x: s.x + n[0] * 1.5, y: y - 1, z: s.z + n[1] * 1.5, color: slot.color, sign: true });
  }
  void flickT;
  const signMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas.tex }, uTime: time },
      vertexShader: `attribute vec2 aFlick; varying vec2 vUv; varying float vF; uniform float uTime;
        void main(){ vUv = uv; float on = 1.0;
          if (aFlick.x > 0.5) { float t = fract(uTime * 0.37 + aFlick.y * 9.0); on = step(0.12, t) * (0.6 + 0.4 * step(0.5, fract(t * 17.0))) ; }
          vF = on; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vF;
        void main(){ vec4 c = texture2D(map, vUv); float a = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c.rgb * 2.6 * vF, a * (0.25 + 0.75 * vF)); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  if (sPos.length) {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(sPos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(sUv, 2));
    g.setAttribute("aFlick", new THREE.Float32BufferAttribute(sFlick, 2));
    const mesh = new THREE.Mesh(g, signMat);
    mesh.renderOrder = 3;
    group.add(mesh);
    // dark backing boards so signs read as objects
    const back = keep(new THREE.BufferGeometry());
    back.setAttribute("position", new THREE.Float32BufferAttribute(sPos.map((v, i) => v), 3));
  }
  const glowMat = keep(new THREE.MeshBasicMaterial({ map: glowTex(), vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
  if (haloPos.length) {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(haloPos, 3));
    const uvs = [];
    for (let i = 0; i < haloPos.length / 18; i++) uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(haloCol, 3));
    const mesh = new THREE.Mesh(g, glowMat);
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  if (reflPos.length) {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(reflPos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(reflUv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(reflCol, 3));
    const m = keep(new THREE.MeshBasicMaterial({ map: streakTex(), vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  /* ---------------------------------------------------- street lamps (authored lines) */
  for (const [x0, z0, x1, z1, step] of streetLampLines(def.id)) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(L / step));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      lamps.push({ x, y: 6.2, z, color: style === "industrial" ? "#ffb36b" : style === "corporate" ? "#cfe8ff" : pick(["#ff6bd6", "#6bf0ff", "#ffd08a"]), pole: true });
    }
  }
  {
    const poles = [];
    const heads = [];
    for (const l of lamps) {
      if (!l.pole) continue;
      poles.push(wcyl(l.x, l.z, 0.08, 0, l.y + 0.2, "#22242a", 8));
      poles.push(wbox(l.x - 0.6, l.y + 0.1, l.z - 0.12, l.x + 0.6, l.y + 0.25, l.z + 0.12, 1, "#22242a"));
      heads.push(wbox(l.x - 0.5, l.y, l.z - 0.08, l.x + 0.5, l.y + 0.1, l.z + 0.08, 1, l.color));
      pools.push({ x: l.x, z: l.z, r: 5.5, color: l.color, k: 1.1 });
    }
    if (poles.length) {
      const g = keep(mergeGeometries(poles.map(cleanAttrs)));
      const mesh = new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.8 })));
      mesh.castShadow = Q > 0;
      group.add(mesh);
      const gh = keep(mergeGeometries(heads.map(cleanAttrs)));
      group.add(new THREE.Mesh(gh, keep(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))));
    }
    poles.forEach((x) => x.dispose());
    heads.forEach((x) => x.dispose());
  }

  /* ---------------------------------------------------- light pools (additive decals) */
  if (pools.length) {
    const pos = [];
    const uv = [];
    const col = [];
    for (const p of pools) {
      const r = p.r;
      const y = 0.04;
      pos.push(p.x - r, y, p.z - r, p.x + r, y, p.z - r, p.x + r, y, p.z + r, p.x - r, y, p.z - r, p.x + r, y, p.z + r, p.x - r, y, p.z + r);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      const c = C(p.color).multiplyScalar(p.k * 0.55);
      for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = keep(new THREE.MeshBasicMaterial({ map: glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  /* ---------------------------------------------------- real point lights (few) */
  const lights = [];
  {
    const maxL = [3, 7, 11][Q];
    const cand = [];
    for (const n of def.npcs || []) cand.push({ x: n.x, y: 3.2, z: n.z, color: "#ffd9b0", i: 26, d: 11 });
    for (const t of def.terminals || []) cand.push({ x: t.x, y: 2.6, z: t.z, color: "#7ff6ff", i: 18, d: 9 });
    for (const l of lamps) if (l.big) cand.push({ x: l.x, y: l.y, z: l.z, color: l.color, i: 40, d: 16 });
    for (const l of lamps) if (l.pole && R() < 0.4) cand.push({ x: l.x, y: l.y - 0.4, z: l.z, color: l.color, i: 30, d: 14 });
    for (const l of lamps) if (l.sign) cand.push({ x: l.x, y: l.y, z: l.z, color: l.color, i: 30, d: 12 });
    // spread them out
    const chosen = [];
    for (const c of cand) {
      if (chosen.length >= maxL) break;
      if (chosen.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 14)) continue;
      chosen.push(c);
    }
    for (const c of chosen) {
      const L = new THREE.PointLight(C(c.color), c.i, c.d, 2);
      L.position.set(c.x, c.y, c.z);
      group.add(L);
      lights.push(L);
    }
  }

  /* ---------------------------------------------------- steam vents */
  for (const v of streetVents(def.id)) steamAt.push(v);
  const steam = makeSteam(steamAt, [80, 180, 320][Q], pal, time);
  if (steam) {
    keep(steam.geometry);
    keep(steam.material);
    group.add(steam.points);
    // grate decals on the ground
    const gr = [];
    for (const v of steamAt) if (!v.small && v.y < 0.5) gr.push(wbox(v.x - 0.6, 0.0, v.z - 0.6, v.x + 0.6, 0.05, v.z + 0.6, 1.5));
    if (gr.length) {
      const g = keep(mergeGeometries(gr.map(cleanAttrs)));
      group.add(new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ map: tileTex("grate"), roughness: 0.5, metalness: 0.8 }))));
      gr.forEach((x) => x.dispose());
    }
  }

  /* ---------------------------------------------------- holograms */
  for (const h of hologramSpots(def.id)) holos.push(h);
  const holoMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { uTime: time, map: { value: atlas.tex } },
      vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform sampler2D map; varying vec2 vUv; varying vec3 vP; uniform vec3 uColor;
        void main(){ float scan = 0.65 + 0.35 * sin(vP.y * 30.0 - uTime * 6.0);
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          float glitch = step(0.97, fract(sin(floor(uTime * 8.0) * 12.9898) * 43758.5)) * 0.5;
          gl_FragColor = vec4(vec3(0.4, 0.9, 1.0) * scan * (1.0 + glitch), 0.35 * edge * scan); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  const holoMeshes = [];
  for (const h of holos) {
    const col = C(h.color || "#19f0ff");
    if (h.kind === "ring") {
      const g = keep(new THREE.TorusGeometry(h.s * 0.6, 0.02, 6, 36));
      const m = keep(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false }));
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(h.x, h.y, h.z);
      mesh.rotation.x = Math.PI / 2;
      mesh.userData.spin = 1.2;
      group.add(mesh);
      holoMeshes.push(mesh);
      const m2 = new THREE.Mesh(g, m);
      m2.position.set(h.x, h.y + 0.25, h.z);
      m2.scale.setScalar(0.7);
      m2.rotation.x = Math.PI / 2;
      m2.userData.spin = -1.8;
      group.add(m2);
      holoMeshes.push(m2);
    } else if (h.kind === "board") {
      const g = keep(new THREE.PlaneGeometry(h.w, h.h));
      const slot = atlas.slots[(h.slot ?? 0) % atlas.slots.length];
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, slot.u0 + uv.getX(i) * (slot.u1 - slot.u0), slot.v0 + uv.getY(i) * (slot.v1 - slot.v0));
      const m = keep(
        new THREE.ShaderMaterial({
          uniforms: { uTime: time, map: { value: atlas.tex }, uColor: { value: col } },
          vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform float uTime; uniform sampler2D map; uniform vec3 uColor; varying vec2 vUv; varying vec3 vP;
            void main(){ vec4 c = texture2D(map, vUv); float a = max(c.r, max(c.g, c.b));
              float scan = 0.7 + 0.3 * sin(vP.y * 18.0 - uTime * 5.0);
              float flick = 0.85 + 0.15 * sin(uTime * 23.0);
              gl_FragColor = vec4((c.rgb * 1.6 + uColor * 0.25) * scan * flick, (a * 0.85 + 0.06) * scan); }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      );
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(h.x, h.y, h.z);
      mesh.rotation.y = h.rot || 0;
      mesh.userData.spin = h.spin || 0;
      group.add(mesh);
      holoMeshes.push(mesh);
    } else if (h.kind === "pillar") {
      const g = keep(new THREE.CylinderGeometry(h.s, h.s * 1.2, h.h || 6, 24, 1, true));
      const mesh = new THREE.Mesh(g, holoMat);
      mesh.position.set(h.x, h.y, h.z);
      mesh.userData.spin = 0.4;
      group.add(mesh);
      holoMeshes.push(mesh);
    }
  }

  /* ---------------------------------------------------- traffic */
  const traffic = makeTraffic(city, [24, 48, 80][Q], R, pal);
  keep(traffic.body.geometry);
  keep(traffic.body.material);
  keep(traffic.lights.geometry);
  keep(traffic.lights.material);
  group.add(traffic.body, traffic.lights);

  /* ---------------------------------------------------- sky */
  const sky = makeSky(pal);
  keep(sky.geometry);
  keep(sky.material);
  group.add(sky);

  return {
    group,
    lights,
    steam,
    update(t, camPos) {
      for (const m of holoMeshes) if (m.userData.spin) m.rotation[m.geometry.type === "TorusGeometry" ? "z" : "y"] += m.userData.spin * 0.016;
      traffic.update(t);
      steam?.update(t);
      sky.position.set(camPos.x, 0, camPos.z);
    },
    dispose() {
      for (const d of disposables) d.dispose?.();
      group.clear();
    },
  };
}

function cleanAttrs(g) {
  // mergeGeometries needs identical attribute sets
  if (!g.attributes.color) {
    const cols = new Float32Array(g.attributes.position.count * 3).fill(1);
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  }
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

/* ---------------------------------------------------- prop details */
function propDetail(b, B, E, o) {
  const { x0, x1, z0, z1, y0, y1 } = b;
  const { cx, cz, w, d, pick, neon, holos, pools, steamAt } = o;
  switch (b.kind) {
    case "dropbox":
      B.metal.push(wbox(x0, 0, z0, x1, y1, z1, 1, "#3a4048"));
      E(x0 - 0.01, y1 - 0.35, z0 + 0.3, x1 + 0.01, y1 - 0.3, z1 - 0.3, "#4dff9a");
      break;
    case "jammer":
      B.metal.push(wbox(x0, 0, z0, x1, y1, z1, 1, "#2a2a2e"));
      B.metal.push(wcyl(cx, cz, 0.03, y1, y1 + 1.6, "#555", 6));
      E(cx - 0.12, y1 + 1.55, cz - 0.12, cx + 0.12, y1 + 1.7, cz + 0.12, "#ff2030");
      E(x0 - 0.01, y1 - 0.4, z0 - 0.01, x1 + 0.01, y1 - 0.3, z1 + 0.01, "#ff2030");
      pools.push({ x: cx, z: cz, r: 3, color: "#ff2030", k: 0.8 });
      break;
    case "locker":
      B.paint.push(wbox(x0, 0, z0, x1, y1, z1, 1, "#3a4a5a"));
      E(x0 + 0.1, y1 - 0.3, z0 - 0.01, x0 + 0.25, y1 - 0.2, z0, "#4dff9a");
      break;
    case "valve":
      B.metal.push(wbox(x0 + 0.2, 0, z0 + 0.2, x1 - 0.2, y1 - 0.2, z1 - 0.2, 1, "#5a4a30"));
      B.paint.push(wcyl(cx, cz, 0.38, y1, 0, "#a02020", 16, w > d ? "x" : "z", 0.06));
      break;
    case "node":
      B.metal.push(wbox(x0, 0, z0, x1, y1, z1, 1, "#1e2430"));
      E(x0 - 0.02, y1 - 0.5, z0 - 0.02, x1 + 0.02, y1 - 0.35, z1 + 0.02, "#ff2030");
      B.metal.push(wcyl(cx, cz, 0.25, y1, y1 + 0.5, "#2a3240", 12));
      E(cx - 0.12, y1 + 0.5, cz - 0.12, cx + 0.12, y1 + 0.62, cz + 0.12, "#ff2030");
      pools.push({ x: cx, z: cz, r: 3, color: "#ff2030", k: 0.7 });
      break;
    case "uplink":
      B.metal.push(wbox(x0, 0, z0, x1, y1 * 0.6, z1, 1, "#d8dce4"));
      B.metal.push(wcyl(cx, cz, 0.8, y1, 0, "#e8ecf2", 20, "z", 0.08));
      E(cx - 0.1, y1 * 0.6, cz - 0.1, cx + 0.1, y1 + 0.2, cz + 0.1, "#7b8cff");
      break;
    case "elevator":
      B.metal.push(wbox(x0, 0, z0, x1, y1, z1, 1, "#2a3240"));
      E(x0 + 0.4, 0, z1 - 0.01, x1 - 0.4, y1 - 0.3, z1 + 0.02, "#19f0ff");
      E(x0, y1, z0, x1, y1 + 0.08, z1, "#19f0ff");
      break;
    case "acunit":
      B.metal.push(wbox(x0, 0, z0, x1, y1, z1, 1, "#6a6e76"));
      B.metal.push(wcyl(cx, cz, Math.min(w, d) * 0.35, y1, y1 + 0.05, "#222", 16));
      steamAt.push({ x: cx, y: y1 + 0.2, z: cz, rate: 0.5, small: true });
      break;
    case "antenna":
      B.metal.push(wcyl(cx, cz, 0.12, 0, y1, "#555a62", 8));
      for (let yy = 2; yy < y1; yy += 2) B.metal.push(wbox(cx - 0.6, yy, cz - 0.04, cx + 0.6, yy + 0.06, cz + 0.04, 1, "#555a62"));
      E(cx - 0.1, y1, cz - 0.1, cx + 0.1, y1 + 0.2, cz + 0.1, "#ff2030");
      break;
    case "forklift":
      B.paint.push(wbox(x0, 0.2, z0, x1, 1.2, z1, 1, "#c8a020"));
      B.metal.push(wbox(x0 + 0.1, 1.2, z0 + 0.2, x1 - 0.1, y1, z0 + 0.3, 1, "#222"));
      B.metal.push(wbox(x0 + 0.2, 0, z1, x1 - 0.2, 0.1, z1 + 1.0, 1, "#333"));
      break;
    case "tank":
      B.metal.push(wcyl(cx, cz, Math.min(w, d) / 2, 0, y1, "#6a6a5e", 20));
      E(cx - 0.05, 0.5, z1 - 0.02, cx + 0.05, y1 - 0.4, z1 + 0.02, "#7dff3a");
      break;
    case "rack":
      B.server.push(wbox(x0, 0, z0, x1, y1, z1, 0.5));
      E(x0, y1, z0, x1, y1 + 0.03, z1, "#19f0ff");
      break;
    case "core":
      B.metal.push(wcyl(cx, cz, Math.min(w, d) * 0.55, 0, 0.8, "#1a1e28", 24));
      E(cx - 0.6, 0.8, cz - 0.6, cx + 0.6, y1, cz + 0.6, "#ff2bd6");
      B.metal.push(wcyl(cx, cz, Math.min(w, d) * 0.45, y1 - 0.6, y1, "#1a1e28", 24));
      for (let k = 0; k < 4; k++) B.metal.push(wbox(cx - 0.12 + (k % 2 ? 1.8 : -1.8), 0, cz - 0.12 + (k > 1 ? 1.8 : -1.8), cx + 0.12 + (k % 2 ? 1.8 : -1.8), y1 - 0.4, cz + 0.12 + (k > 1 ? 1.8 : -1.8), 1, "#2a2e3a"));
      pools.push({ x: cx, z: cz, r: 9, color: "#ff2bd6", k: 1.2 });
      holos.push({ kind: "pillar", x: cx, y: y1 / 2 + 1, z: cz, s: 1.6, h: y1 + 2 });
      break;
    case "cryopod":
      B.metal.push(wbox(x0, 0, z0, x1, 0.3, z1, 1, "#c8ced8"));
      B.glass.push(wbox(x0 + 0.1, 0.3, z0 + 0.1, x1 - 0.1, y1 - 0.2, z1 - 0.1, 1));
      E(x0 + 0.3, 0.32, z0 + 0.3, x1 - 0.3, 0.4, z1 - 0.3, "#9fe7ff");
      B.metal.push(wbox(x0, y1 - 0.2, z0, x1, y1, z1, 1, "#c8ced8"));
      break;
    case "bed":
      B.metal.push(wbox(x0, 0, z0, x1, 0.35, z1, 1, "#2a2a30"));
      B.paint.push(wbox(x0 + 0.05, 0.35, z0 + 0.05, x1 - 0.05, y1, z1 - 0.05, 1, "#3a2a4a"));
      E(x0, 0.05, z0 - 0.01, x1, 0.1, z0 + 0.01, "#a64dff");
      break;
    case "planter":
      B.concrete.push(wbox(x0, 0, z0, x1, y1, z1, 0.5, "#5a5e66"));
      B.paint.push(wbox(x0 + 0.1, y1, z0 + 0.1, x1 - 0.1, y1 + 0.5, z1 - 0.1, 1, "#14301e"));
      E(x0, y1, z0, x1, y1 + 0.03, z1, pick(neon));
      break;
    case "bench":
      B.metal.push(wbox(x0, y1 - 0.08, z0, x1, y1, z1, 1, "#3a3e46"));
      B.metal.push(wbox(x0 + 0.2, 0, z0 + 0.2, x0 + 0.3, y1, z1 - 0.2, 1, "#222"));
      B.metal.push(wbox(x1 - 0.3, 0, z0 + 0.2, x1 - 0.2, y1, z1 - 0.2, 1, "#222"));
      break;
    case "holo":
      B.metal.push(wbox(x0, 0, z0, x1, 0.4, z1, 1, "#2a3240"));
      E(x0, 0.4, z0, x1, 0.45, z1, "#19f0ff");
      holos.push({ kind: "board", x: cx, y: 2.6, z: cz, w: 2.6, h: 1.3, slot: Math.floor(o.R() * 64), spin: 0.5, color: "#19f0ff" });
      break;
    case "fountain":
      B.concrete.push(wbox(x0, 0, z0, x1, y1, z1, 0.5, "#8a8e98"));
      B.glass.push(wbox(x0 + 0.3, y1 - 0.15, z0 + 0.3, x1 - 0.3, y1 - 0.05, z1 - 0.3, 1));
      E(x0, y1, z0, x1, y1 + 0.03, z1, "#19f0ff");
      holos.push({ kind: "pillar", x: cx, y: y1 + 3.2, z: cz, s: 1.4, h: 6 });
      holos.push({ kind: "ring", x: cx, y: y1 + 6.5, z: cz, s: 4, color: "#7b8cff" });
      pools.push({ x: cx, z: cz, r: 8, color: "#19f0ff", k: 1 });
      break;
    case "helipad":
      B.concrete.push(wbox(x0, 0, z0, x1, y1, z1, 0.5, "#3a3c44"));
      E(cx - 1.5, y1, cz - 0.15, cx + 1.5, y1 + 0.01, cz + 0.15, "#ffb02e");
      E(cx - 1.5, y1, cz - 1.5, cx - 1.2, y1 + 0.01, cz + 1.5, "#ffb02e");
      E(cx + 1.2, y1, cz - 1.5, cx + 1.5, y1 + 0.01, cz + 1.5, "#ffb02e");
      break;
    case "barrierPost":
      B.metal.push(wbox(x0, 0, z0, x1, y1, z1, 1, "#2a2e36"));
      E(x0, y1 - 0.15, z0, x1, y1, z1, "#19f0ff");
      break;
    case "crane":
      B.paint.push(wbox(x0, y0, z0, x1, y1, z1, 1, "#c8a020"));
      for (const px of [x0 + 0.5, x1 - 0.5]) B.paint.push(wbox(px - 0.4, 0, z0, px + 0.4, y0, z1, 1, "#c8a020"));
      E(cx - 0.2, y0 - 0.1, cz - 0.2, cx + 0.2, y0, cz + 0.2, "#ff2030");
      break;
  }
  void y0;
}

/* ---------------------------------------------------- authored street furniture */
function streetLampLines(id) {
  if (id === "market")
    return [
      [-12.5, -56, -12.5, 44, 16],
      [12.5, -50, 12.5, 6, 16],
      [-56, -8.5, -20, -8.5, 18],
      [20, 8.5, 56, 8.5, 18],
      [26, 14, 26, 54, 20],
    ];
  if (id === "industrial")
    return [
      [-12.5, -6, -12.5, 6, 12],
      [-56, -15.5, -24, -15.5, 16],
      [20, 7.5, 56, 7.5, 18],
      [12.5, 12, 12.5, 44, 16],
      [-8, 44, -8, 30, 14],
    ];
  return [
    [-28.5, -14, -28.5, 16, 15],
    [24.5, -14, 24.5, 16, 15],
    [-20, -16, 20, -16, 20],
    [-60, 18, -36, 18, 12],
    [36, 18, 60, 18, 12],
    [-8, 30, -8, 46, 16],
    [8, 30, 8, 46, 16],
  ];
}
function streetVents(id) {
  if (id === "market") return [{ x: -6, y: 0.05, z: -36, rate: 1 }, { x: 7, y: 0.05, z: 2, rate: 1 }, { x: -40, y: 0.05, z: -30, rate: 1 }, { x: 36, y: 0.05, z: -2, rate: 1 }, { x: -3, y: 0.05, z: 30, rate: 1 }, { x: 44, y: 0.05, z: 46, rate: 1 }];
  if (id === "industrial") return [{ x: -20, y: 0.05, z: 0, rate: 1.4 }, { x: 18, y: 0.05, z: -2, rate: 1.4 }, { x: -40, y: 0.05, z: 20, rate: 1.6 }, { x: -40, y: 0.05, z: 36, rate: 1.6 }, { x: 40, y: 0.05, z: 30, rate: 1.2 }, { x: 0, y: 0.05, z: 90, rate: 1 }, { x: -14, y: 0.05, z: 110, rate: 1 }];
  return [{ x: -20, y: 0.05, z: 4, rate: 0.7 }, { x: 20, y: 0.05, z: 4, rate: 0.7 }, { x: 0, y: 0.05, z: 30, rate: 0.7 }];
}
function hologramSpots(id) {
  if (id === "market")
    return [
      { kind: "board", x: 0, y: 14, z: 0, w: 9, h: 4.5, slot: 13, spin: 0.25, color: "#ff2bd6" },
      { kind: "board", x: -40, y: 12, z: 2, w: 6, h: 3, slot: 6, rot: Math.PI / 2, color: "#19f0ff" },
      { kind: "board", x: 40, y: 13, z: 30, w: 7, h: 3.5, slot: 21, rot: 0.6, color: "#a64dff" },
    ];
  if (id === "industrial") return [{ kind: "board", x: 0, y: 12, z: -2, w: 8, h: 4, slot: 1, rot: 0, color: "#ff8a1f" }];
  return [
    { kind: "board", x: 0, y: 20, z: -28.5, w: 14, h: 7, slot: 0, rot: 0, color: "#19f0ff" },
    { kind: "board", x: -40, y: 16, z: 18, w: 8, h: 4, slot: 9, rot: 0.3, color: "#7b8cff", spin: 0.15 },
  ];
}

/* ---------------------------------------------------- steam */
function makeSteam(emitters, max, pal, time) {
  if (!emitters.length) return null;
  const per = Math.max(6, Math.floor(max / emitters.length));
  const n = per * emitters.length;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 2);
  const base = new Float32Array(n * 4);
  let k = 0;
  for (const e of emitters)
    for (let i = 0; i < per; i++, k++) {
      base[k * 4] = e.x;
      base[k * 4 + 1] = e.y;
      base[k * 4 + 2] = e.z;
      base[k * 4 + 3] = e.small ? 0.5 : 1;
      seed[k * 2] = Math.random();
      seed[k * 2 + 1] = e.rate || 1;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aBase", new THREE.BufferAttribute(base, 4));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 2));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: time, map: { value: softTex() }, uColor: { value: new THREE.Color(pal.hemiTop).lerp(new THREE.Color("#ffffff"), 0.6) }, uScale: { value: 300 } },
    vertexShader: `attribute vec4 aBase; attribute vec2 aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ float life = fract(uTime * 0.18 * aSeed.y + aSeed.x);
        vec3 p = aBase.xyz + vec3(sin(aSeed.x * 40.0 + life * 3.0) * 0.6 * life, life * 4.5 * aBase.w, cos(aSeed.x * 30.0) * 0.5 * life + life * 0.8);
        vA = smoothstep(0.0, 0.15, life) * (1.0 - life) * 0.55;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * (0.6 + life * 2.2) * aBase.w / -mv.z;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uColor; varying float vA;
      void main(){ vec4 c = texture2D(map, gl_PointCoord); gl_FragColor = vec4(uColor, c.a * vA); }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  return {
    points,
    geometry: g,
    material: m,
    update() {},
    setScale(h) {
      m.uniforms.uScale.value = h * 0.45;
    },
  };
}

/* ---------------------------------------------------- traffic */
function makeTraffic(city, n, R, pal) {
  const cx = (city.x0 + city.x1) / 2;
  const cz = (city.z0 + city.z1) / 2;
  const bodyG = new THREE.BoxGeometry(4.2, 0.9, 1.9);
  const top = new THREE.BoxGeometry(2.2, 0.6, 1.6);
  top.translate(-0.3, 0.7, 0);
  const body = new THREE.InstancedMesh(mergeGeometries([bodyG, top]), new THREE.MeshStandardMaterial({ color: "#14161c", roughness: 0.3, metalness: 0.9 }), n);
  const lg = [];
  const l1 = new THREE.BoxGeometry(0.1, 0.18, 1.6);
  l1.translate(2.12, 0, 0);
  const l2 = new THREE.BoxGeometry(0.1, 0.16, 1.7);
  l2.translate(-2.12, 0.05, 0);
  const l3 = new THREE.BoxGeometry(3.6, 0.06, 1.7);
  l3.translate(0, -0.48, 0);
  lg.push(l1, l2, l3);
  const lightsGeo = mergeGeometries(lg);
  const col = new Float32Array(lightsGeo.attributes.position.count * 3);
  const cnt = [l1, l2, l3].map((g) => g.attributes.position.count);
  const cs = [new THREE.Color("#fff3d6").multiplyScalar(2.5), new THREE.Color("#ff2030").multiplyScalar(2.5), new THREE.Color(pal.neon[1]).multiplyScalar(1.5)];
  let o = 0;
  cnt.forEach((c, i) => {
    for (let k = 0; k < c; k++, o++) {
      col[o * 3] = cs[i].r;
      col[o * 3 + 1] = cs[i].g;
      col[o * 3 + 2] = cs[i].b;
    }
  });
  lightsGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const lights = new THREE.InstancedMesh(lightsGeo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), n);
  bodyG.dispose();
  top.dispose();
  lg.forEach((g) => g.dispose());
  const cars = [];
  for (let i = 0; i < n; i++) {
    const lane = i % 4;
    if (lane < 3) cars.push({ type: "ring", r: 95 + lane * 22 + R() * 6, h: 28 + lane * 14 + R() * 10, sp: (0.05 + R() * 0.04) * (i % 2 ? 1 : -1), ph: R() * 6.28 });
    else cars.push({ type: "line", a: R() * Math.PI, h: 58 + R() * 18, sp: 18 + R() * 12, ph: R() * 400 });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  body.frustumCulled = false;
  lights.frustumCulled = false;
  return {
    body,
    lights,
    update(t) {
      cars.forEach((c, i) => {
        let yaw;
        if (c.type === "ring") {
          const a = c.ph + t * c.sp;
          p.set(cx + Math.cos(a) * c.r, c.h + Math.sin(a * 3 + i) * 1.5, cz + Math.sin(a) * c.r);
          yaw = -a + (c.sp > 0 ? -Math.PI / 2 : Math.PI / 2);
        } else {
          const L = 420;
          const d = ((c.ph + t * c.sp) % L) - L / 2;
          p.set(cx + Math.cos(c.a) * d, c.h, cz + Math.sin(c.a) * d);
          yaw = -c.a;
        }
        q.setFromAxisAngle(up, yaw);
        m4.compose(p, q, s);
        body.setMatrixAt(i, m4);
        lights.setMatrixAt(i, m4);
      });
      body.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---------------------------------------------------- sky dome */
function makeSky(pal) {
  const g = new THREE.SphereGeometry(420, 32, 16);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: C(pal.sky) }, uHorizon: { value: C(pal.fog).multiplyScalar(1.8) }, uGlow: { value: C(pal.neon[1]).multiplyScalar(0.25) } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; varying vec3 vP;
      void main(){ float h = normalize(vP).y; float k = smoothstep(-0.05, 0.5, h);
        vec3 c = mix(uHorizon + uGlow * (1.0 - smoothstep(0.0, 0.25, h)), uTop, k);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export { CELL };
