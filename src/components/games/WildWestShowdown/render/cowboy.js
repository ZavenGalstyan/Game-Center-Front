/**
 * The seated cowboys.
 *
 * Body: the CC0 Quaternius "Universal Base Characters" mesh (natural adult
 * proportions, 65-bone skeleton, PBR skin with normal map) driven by the CC0
 * Quaternius "Universal Animation Library" (Sit, Talk, Yes, No, FoldArms,
 * Consume, Interact …) through Deck of Shadows' Rig (bind-pose sculpting,
 * bone attachment).
 *
 * Clothing is generated here, no extra assets:
 *  - the body is re-sculpted for cloth thickness (shirt, vest/coat, trousers,
 *    boots), and an outfit shader paints garments per vertex (skin weights +
 *    bind-pose landmarks) with procedural weave/fibre relief, per-fabric
 *    roughness and seams, keeping the textured skin on face and hands;
 *  - hats (cattleman, gambler, sheriff, outlaw, derby, stetson) are lathed
 *    felt with dents, pinches and curled brims; moustaches, bandanas,
 *    belts with buckles, holsters, sheriff stars, cigars are built along bones.
 *
 * Animation (Seat): lower body holds the Sit clip; the upper body cross-fades
 * between the seated pose and upper-body-only clips (talk, nod, head shake,
 * folded arms, drink). A procedural layer adds breathing, leaning, head
 * tracking and two-bone arm IK for reaching the cards, pushing chips,
 * thinking (hand to chin) and raking a pot.
 */
import * as THREE from "three";
import { Rig } from "../../DeckOfShadows/render/monsters.js";
import { creatureMaterial, creatureUniforms } from "../../DeckOfShadows/render/materials.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const UPPER = /^(spine_0[123]|neck_01|Head|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|hand_[lr]|(index|middle|ring|pinky|thumb)_0\d_[lr])$/;

/** Clip with only the tracks whose bone matches `re`. */
function filterClip(clip, re, name) {
  const tracks = clip.tracks.filter((t) => re.test(t.name.split(".")[0]));
  return new THREE.AnimationClip(name || clip.name, clip.duration, tracks);
}

/* =================================================================== outfit */
const KIND = { shirt: 0, wool: 1, trousers: 2, leather: 3, skin: 4 };
const ROUGH = [0.82, 0.92, 0.88, 0.5];

function outfitMaterial(rig, look, U) {
  const o = rig.body.material;
  const L0 = rig.landmarks;
  const dark = look.skin > 0.55;
  const skinTint = new THREE.Color().setRGB(1, 1, 1).lerp(new THREE.Color(0.78, 0.62, 0.5), clamp(dark ? (look.skin - 0.55) * 1.4 : look.skin * 0.9, 0, 1));
  const m = new THREE.MeshStandardMaterial({
    map: dark && rig.darkMap ? rig.darkMap : o.map,
    normalMap: o.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: o.roughnessMap,
    metalnessMap: o.metalnessMap,
    roughness: 1,
    metalness: o.metalness ?? 1,
    color: skinTint,
    envMapIntensity: 0.7,
  });
  m.userData.uniforms = { uAge: { value: look.age || 0 } };
  m.customProgramCacheKey = () => `wws-outfit:${L0.neckBase.toFixed(4)}`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms, { uRimColor: U.uRimColor, uRim: U.uRim });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aCloth;\nattribute float aKind;\nvarying vec4 vCloth;\nvarying float vKind;\nvarying vec3 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCloth = aCloth; vKind = aKind; vBind = position; vCover = aCover;")
      .replace("varying vec3 vBind;", "varying vec3 vBind;\nattribute float aCover;\nvarying float vCover;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vCloth; varying float vKind; varying vec3 vBind; varying float vCover;
uniform float uAge; uniform vec3 uRimColor; uniform float uRim;
float cwH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cwN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cwH(i), cwH(i + vec3(1,0,0)), f.x), mix(cwH(i + vec3(0,1,0)), cwH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cwH(i + vec3(0,0,1)), cwH(i + vec3(1,0,1)), f.x), mix(cwH(i + vec3(0,1,1)), cwH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float cwF(vec3 p){ return 0.5 * cwN(p) + 0.25 * cwN(p * 2.07 + 3.1) + 0.125 * cwN(p * 4.13 + 7.7); }
/* fabric relief height: weave for cotton/denim, felted noise for wool, grain for leather */
float cwHeight(vec3 p, float k){
  if (k < 0.5) return 0.45 * cwF(p * 140.0) + 0.5 * cwF(vec3(p.x * 8.0, p.y * 55.0, p.z * 8.0));
  if (k < 1.5) return cwF(p * 180.0) * 0.7 + cwF(p * 22.0) * 0.6;
  if (k < 2.5) return 0.4 * cwF(p * 150.0) + 0.6 * cwF(vec3(p.x * 9.0, p.y * 45.0, p.z * 9.0));
  return cwF(p * 260.0) * 0.6 + cwF(p * 18.0) * 0.8;
}
`,
      )
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vCover > 0.995) discard;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
float cw = clamp(vCloth.a, 0.0, 1.0);
float cwLow = cwF(vBind * 9.0);
vec3 fab = vCloth.rgb * (0.82 + 0.3 * cwLow);
// wear: lighter on edges of leather, dust on trousers low down
if (vKind > 2.5) fab *= 0.85 + 0.35 * cwF(vBind * 40.0);
if (vKind > 1.5 && vKind < 2.5) fab = mix(fab, vec3(0.55, 0.47, 0.38), smoothstep(0.55, 0.15, vBind.y) * 0.25);
// open shirt collar (analytic, smooth edge)
if (vBind.z > 0.0 && vKind < 0.5) { float w = max(0.0, (vBind.y - ${(L0.neckBase - 0.11).toFixed(4)}) / 0.11) * 0.042; cw *= smoothstep(w - 0.004, w + 0.004, abs(vBind.x)); }
diffuseColor.rgb = mix(diffuseColor.rgb, fab, cw);
// age: a little grey stubble/sallowness on the face
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.93, 0.9, 0.88), uAge * (1.0 - cw) * 0.5);
`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float cwR = vKind < 0.5 ? ${ROUGH[0].toFixed(2)} : vKind < 1.5 ? ${ROUGH[1].toFixed(2)} : vKind < 2.5 ? ${ROUGH[2].toFixed(2)} : ${ROUGH[3].toFixed(2)};
if (vKind > 2.5) cwR -= 0.18 * cwF(vBind * 30.0);
roughnessFactor = mix(roughnessFactor * (0.92 + uAge * 0.1), cwR, cw);
`,
      )
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, cw);")
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nvec3 cwGeoN = normal;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
normal = normalize(mix(normal, cwGeoN, cw * 0.9));
{
  float h = cwHeight(vBind, vKind) * cw * (vKind > 2.5 ? 0.0016 : 0.0009);
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - g);
}
`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{ float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0); totalEmissiveRadiance += uRimColor * rim * uRim; }`,
      );
  };
  return m;
}

/** Garment painting + sculpt per vertex. Returns radial factor fn for Rig.sculpt. */
function dressBody(rig, look) {
  const geo = rig.body.geometry;
  const skel = rig.body.skeleton;
  const names = skel.bones.map((b) => b.name);
  const grp = names.map((n) =>
    /^(Head|neck_01)$/.test(n) ? "head" : /hand|index|middle|ring|pinky|thumb/.test(n) ? "hand" : /clavicle/.test(n) ? "shoulder" : /upperarm|lowerarm/.test(n) ? "arm" : /spine/.test(n) ? "torso" : /pelvis|thigh|root/.test(n) ? "hip" : /calf/.test(n) ? "calf" : /foot|ball/.test(n) ? "foot" : "torso",
  );
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const n = pos.count;
  const cloth = new Float32Array(n * 4);
  const kind = new Float32Array(n);
  const group = new Array(n);
  const C = (h) => new THREE.Color(h);
  const shirt = C(look.shirt ?? 0xd8cdb4);
  const vest = look.vest != null ? C(look.vest) : null;
  const trousers = C(look.trousers ?? 0x3a3a40);
  const boots = C(look.boots ?? (look.trousers && C(look.trousers).getHSL({}).l < 0.12 ? 0x17120f : 0x3a2516));
  const band = look.bandana != null ? C(look.bandana) : null;
  // landmarks (bind pose, metres): from the skeleton
  const L = rig.landmarks;
  const P = V();
  const col = new THREE.Color();
  for (let v = 0; v < n; v++) {
    P.fromBufferAttribute(pos, v);
    const w = { head: 0, hand: 0, shoulder: 0, arm: 0, torso: 0, hip: 0, calf: 0, foot: 0 };
    for (let k = 0; k < 4; k++) {
      const wt = sw.getComponent(v, k);
      if (wt > 0) w[grp[si.getComponent(v, k)]] += wt;
    }
    col.setRGB(0, 0, 0);
    let cw = 1 - w.head - w.hand;
    let kd = KIND.shirt;
    const add = (c, wt) => col.add(c.clone().multiplyScalar(wt));
    const front = P.z > 0.02;
    const vNeck = front && Math.abs(P.x) < 0.002 + Math.max(0, (P.y - (L.neckBase - 0.12)) / 0.12) * 0.045; // open shirt collar
    // torso + arms
    // the vest and coat are separate shells; underneath it is all shirt
    const torsoC = shirt, torsoK = KIND.shirt;
    void vNeck;
    void vest;
    add(torsoC, w.torso);
    add(shirt, w.arm + w.shoulder);
    // hips: trousers (coat skirt for long coats on the back/sides of the hips)
    add(trousers, w.hip);
    // calves: boots below the boot top
    const bootTop = L.knee - 0.08;
    const bt = smooth(bootTop + 0.015, bootTop - 0.015, P.y);
    add(trousers.clone().lerp(boots, bt), w.calf);
    add(boots, w.foot);
    const sumCloth = w.torso + w.shoulder + w.arm + w.hip + w.calf + w.foot;
    if (sumCloth > 1e-4) col.multiplyScalar(1 / sumCloth);
    cw = sumCloth;
    // neck: bandana / shirt collar over the lower neck
    if (w.head > 0 && P.y < L.neckBase + 0.07) {
      const isBand = band && P.y > L.neckBase - 0.06;
      const t = isBand ? smooth(L.neckBase + 0.075, L.neckBase + 0.055, P.y) : smooth(L.neckBase + 0.03, L.neckBase + 0.01, P.y);
      const c = isBand ? band : shirt;
      if (sumCloth > 1e-4) col.lerp(c, t * w.head);
      else col.copy(c);
      cw = Math.max(cw, t);
    }
    // fabric kind by dominant group
    const dom = Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];
    if (dom === "torso") kd = torsoK;
    else if (dom === "arm" || dom === "shoulder") kd = KIND.shirt;
    else if (dom === "hip") kd = KIND.trousers;
    else if (dom === "calf") kd = bt > 0.5 ? KIND.leather : KIND.trousers;
    else if (dom === "foot") kd = KIND.leather;
    else kd = band ? KIND.shirt : KIND.shirt;
    cloth[v * 4] = col.r;
    cloth[v * 4 + 1] = col.g;
    cloth[v * 4 + 2] = col.b;
    cloth[v * 4 + 3] = clamp(cw, 0, 1);
    kind[v] = kd;
    group[v] = dom;
  }
  return { cloth, kind, group };
}

/* =================================================================== cloth geometry */
/** Groups of vertices sharing a position (UV seams), so smoothing never opens cracks. */
function weldGroups(pos) {
  const map = new Map();
  const rep = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    if (!map.has(k)) map.set(k, i);
    rep[i] = map.get(k);
  }
  return rep;
}
function adjacency(index, rep, n) {
  const sets = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < index.count; t += 3) {
    const a = rep[index.getX(t)], b = rep[index.getX(t + 1)], c = rep[index.getX(t + 2)];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  return sets.map((s) => [...s]);
}
/**
 * Taubin smoothing (λ/μ, no shrinking) of the vertices with weight w[v] > 0:
 * washes the anatomy (muscles, ribs) out from under clothing.
 */
function smoothWeighted(geo, w, iters = 8) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const rep = weldGroups(pos);
  const adj = adjacency(geo.index, rep, n);
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    P[i * 3] = pos.getX(i);
    P[i * 3 + 1] = pos.getY(i);
    P[i * 3 + 2] = pos.getZ(i);
  }
  const reps = [...new Set(rep)];
  const pass = (lam) => {
    const D = new Float32Array(n * 3);
    for (const i of reps) {
      const nb = adj[i];
      if (!nb.length || w[i] <= 0) continue;
      let x = 0, y = 0, z = 0;
      for (const j of nb) {
        x += P[j * 3];
        y += P[j * 3 + 1];
        z += P[j * 3 + 2];
      }
      const k = lam * w[i];
      D[i * 3] = (x / nb.length - P[i * 3]) * k;
      D[i * 3 + 1] = (y / nb.length - P[i * 3 + 1]) * k;
      D[i * 3 + 2] = (z / nb.length - P[i * 3 + 2]) * k;
    }
    for (const i of reps) {
      P[i * 3] += D[i * 3];
      P[i * 3 + 1] += D[i * 3 + 1];
      P[i * 3 + 2] += D[i * 3 + 2];
    }
  };
  for (let it = 0; it < iters; it++) {
    pass(0.55);
    pass(-0.58);
  }
  for (let i = 0; i < n; i++) {
    const r = rep[i];
    pos.setXYZ(i, P[r * 3], P[r * 3 + 1], P[r * 3 + 2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * A garment shell: the body triangles inside `region(x, y, z)`, pushed out
 * along the normals (plus `flare` below the waist), smoothed, skinned to the
 * same skeleton.
 */
function shellGeometry(body, region, { off = 0.012, smoothIters = 10, flare = null, cut = null } = {}) {
  const src = body.geometry;
  const pos = src.attributes.position;
  const nor = src.attributes.normal;
  const idx = src.index;
  const map = new Int32Array(pos.count).fill(-1);
  const keep = [];
  const tri = [];
  const inR = (i) => region(i, pos.getX(i), pos.getY(i), pos.getZ(i));
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    if (!inR(a) || !inR(b) || !inR(c)) continue;
    if (cut) {
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (cut(cx, cy, cz)) continue;
    }
    for (const v of [a, b, c]) {
      if (map[v] < 0) {
        map[v] = keep.length;
        keep.push(v);
      }
      tri.push(map[v]);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "skinIndex", "skinWeight"]) {
    const attr = src.attributes[name];
    const k = attr.itemSize;
    const out = new attr.array.constructor(keep.length * k);
    keep.forEach((v, i) => {
      for (let j = 0; j < k; j++) out[i * k + j] = attr.array[v * k + j];
    });
    g.setAttribute(name, new THREE.BufferAttribute(out, k, attr.normalized));
  }
  g.setIndex(tri);
  // body vertices fully inside the garment (every triangle around them kept) are hidden under it
  {
    const total = new Uint16Array(pos.count), kept = new Uint16Array(pos.count);
    for (let t = 0; t < idx.count; t++) total[idx.getX(t)]++;
    for (const v of keep) kept[v] = 0;
    for (let t = 0; t < tri.length; t++) kept[keep[tri[t]]]++;
    g.userData.covered = keep.filter((v) => kept[v] === total[v]);
    g.userData.keep = keep;
  }
  g.computeVertexNormals();
  if (smoothIters) smoothWeighted(g, new Float32Array(keep.length).fill(1), smoothIters);
  const p = g.attributes.position, nn = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const f = off + (flare ? flare(p.getX(i), p.getY(i), p.getZ(i)) : 0);
    p.setXYZ(i, p.getX(i) + nn.getX(i) * f, p.getY(i) + nn.getY(i) * off, p.getZ(i) + nn.getZ(i) * f);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  void nor;
  return g;
}

/**
 * Analytic garment outline in bind-pose space (so cut edges are smooth curves,
 * not triangle steps): hem, top seam, front V opening, armholes, cuffs.
 */
function garmentKeep(sp, x, y, z, margin = 0) {
  const ax = Math.abs(x);
  if (y < sp.hem + margin || y > sp.top - margin) return false;
  if (z > 0 && ax < sp.vMin + Math.max(0, (y - sp.vTop) / (sp.top - sp.vTop)) * sp.vW + margin) return false;
  if (sp.arm) {
    const [a0, a1, c0, c1] = sp.arm;
    const t = Math.min(1, Math.max(0, (y - c0) / (c1 - c0)));
    if (ax > a0 + (a1 - a0) * t * t * (3 - 2 * t) - margin) return false;
  }
  if (sp.cuff && ax > sp.cuff - margin) return false;
  return true;
}
function garmentGLSL(sp) {
  const f = (x) => x.toFixed(4);
  let g = `{ float ax = abs(vBind.x);
  if (vBind.y < ${f(sp.hem)} || vBind.y > ${f(sp.top)}) discard;
  if (vBind.z > 0.0 && ax < ${f(sp.vMin)} + max(0.0, (vBind.y - ${f(sp.vTop)}) / ${f(sp.top - sp.vTop)}) * ${f(sp.vW)}) discard;`;
  if (sp.arm) g += `\n  if (ax > mix(${f(sp.arm[0])}, ${f(sp.arm[1])}, smoothstep(${f(sp.arm[2])}, ${f(sp.arm[3])}, vBind.y))) discard;`;
  if (sp.cuff) g += `\n  if (ax > ${f(sp.cuff)}) discard;`;
  return g + " }";
}

/** Fabric material for shells (no UVs: relief from bind-pose position). */
function fabricMaterial(color, kind, U, { buttons = false, mask = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: ROUGH[kind] ?? 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.55 });
  // the generated GLSL differs per garment: three.js must not share one program between them
  const key = `wws-fabric:${JSON.stringify({ buttons, mask: mask && { ...mask, flare: undefined } })}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRimColor: U.uRimColor, uRim: U.uRim });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBind;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vBind; uniform vec3 uRimColor; uniform float uRim;
float fbH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fbN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fbH(i), fbH(i + vec3(1,0,0)), f.x), mix(fbH(i + vec3(0,1,0)), fbH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fbH(i + vec3(0,0,1)), fbH(i + vec3(1,0,1)), f.x), mix(fbH(i + vec3(0,1,1)), fbH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbF(vec3 p){ return 0.5 * fbN(p) + 0.25 * fbN(p * 2.07 + 3.1) + 0.125 * fbN(p * 4.13 + 7.7); }`,
      )
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${mask ? garmentGLSL(mask) : ""}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb *= 0.8 + 0.32 * fbF(vBind * 8.0);
${mask ? `{ float ax = abs(vBind.x); float e = min(min(vBind.y - ${mask.hem.toFixed(4)}, ${mask.top.toFixed(4)} - vBind.y), vBind.z > 0.0 ? ax - (${mask.vMin.toFixed(4)} + max(0.0, (vBind.y - ${mask.vTop.toFixed(4)}) / ${(mask.top - mask.vTop).toFixed(4)}) * ${mask.vW.toFixed(4)}) : 1.0); diffuseColor.rgb *= 0.78 + 0.22 * smoothstep(0.0, 0.012, e); }` : ""}
${buttons ? `if (vBind.z > 0.0 && vBind.y > ${buttons[0].toFixed(3)} && vBind.y < ${buttons[1].toFixed(3)}) { float yb = fract((vBind.y - ${buttons[0].toFixed(3)}) / 0.042); float d = length(vec2(vBind.x - 0.012, (yb - 0.5) * 0.042)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.5, 0.3), smoothstep(0.0055, 0.0038, d)); diffuseColor.rgb *= 1.0 - 0.35 * smoothstep(0.004, 0.0, abs(vBind.x)); }` : ""}`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  float h = (fbF(vBind * 160.0) * 0.6 + fbF(vBind * 18.0) * 0.9 + 0.35 * fbF(vec3(vBind.x * 6.0, vBind.y * 40.0, vBind.z * 6.0))) * 0.0011;
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  normal = normalize(abs(det) * normal - sign(det) * (dH.x * r1 + dH.y * r2));
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{ float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0); totalEmissiveRadiance += uRimColor * rim * uRim; }`,
      );
  };
  return m;
}

/* =================================================================== accessories */
function feltMaterial(U, color, rough = 0.95) {
  return creatureMaterial({ color: new THREE.Color(color), roughness: rough, metalness: 0, envMapIntensity: 0.5 }, { bump: [160, 0.0012, 3], blotch: [0x000000, 9, 0.12], cavity: 0.15 }, U);
}
function leatherMaterial(U, color) {
  return creatureMaterial({ color: new THREE.Color(color), roughness: 0.55, metalness: 0, envMapIntensity: 0.7 }, { bump: [220, 0.0009, 3], wet: [14, 0.35], blotch: [0x000000, 12, 0.18] }, U);
}
function metalMaterial(color, rough = 0.32) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 1, envMapIntensity: 1.1 });
}
function hairMaterial(U, color) {
  return creatureMaterial({ color: new THREE.Color(color), roughness: 0.72, metalness: 0, envMapIntensity: 0.4 }, { bump: [900, 0.0006, 2] }, U);
}

const HATS = {
  //            crown h, crown r(x), top r, brim r, curl, dent, pinch, ellip
  cattleman: { h: 0.125, r: 0.092, top: 0.075, brim: 0.205, curl: 0.045, dent: 0.032, pinch: 0.3, droop: 0.0 },
  sheriff: { h: 0.14, r: 0.094, top: 0.08, brim: 0.225, curl: 0.04, dent: 0.03, pinch: 0.22, droop: 0.0 },
  outlaw: { h: 0.11, r: 0.093, top: 0.076, brim: 0.24, curl: 0.012, dent: 0.025, pinch: 0.15, droop: 0.018 },
  stetson: { h: 0.135, r: 0.092, top: 0.084, brim: 0.2, curl: 0.006, dent: 0.0, pinch: 0.0, droop: 0.0 },
  gambler: { h: 0.095, r: 0.092, top: 0.088, brim: 0.17, curl: 0.004, dent: 0.0, pinch: 0.0, droop: 0.0, flat: true },
  derby: { h: 0.1, r: 0.09, top: 0.0, brim: 0.135, curl: 0.022, dent: 0.0, pinch: 0.0, droop: 0.0, dome: true },
};

/** Hat geometry: crown + brim lathe (built at the brim plane y=0, crown up), dented and curled. */
function hatGeometry(type) {
  const S = HATS[type] || HATS.cattleman;
  const pts = [];
  const t = 0.006; // brim thickness
  // underside of brim (outer → inner), up the inside? we close the crown: outer surface only + brim both sides
  pts.push([S.r - 0.004, -0.004]);
  pts.push([S.brim, -t * 0.5]);
  pts.push([S.brim + 0.003, 0]);
  pts.push([S.brim, t * 0.5]);
  pts.push([S.r + 0.004, t * 0.6]);
  // crown
  if (S.dome) {
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      pts.push([S.r * Math.cos(a) * (1 - 0.06 * Math.sin(a)) + 0.002, t + S.h * Math.sin(a)]);
    }
  } else {
    pts.push([S.r + 0.002, 0.02]);
    pts.push([S.r - 0.001, S.h * 0.55]);
    pts.push([S.top + 0.004, S.h * 0.96]);
    pts.push([S.top - 0.008, S.h]);
    pts.push([S.top * 0.6, S.h + 0.002]);
    pts.push([0.001, S.h + 0.002]);
  }
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i) * 1.16;
    const r = Math.hypot(x, z / 1.16);
    // brim curl: sides up, front/back slightly down (droop)
    if (r > S.r + 0.005) {
      const f = (r - S.r) / (S.brim - S.r);
      const side = Math.abs(x) / Math.max(r, 1e-5);
      y += S.curl * f * f * Math.pow(side, 1.5) - S.droop * f * f * (1 - side);
    } else if (y > S.h * 0.5 && !S.dome && !S.flat) {
      // crown: centre crease + front pinch
      const k = smooth(S.h * 0.5, S.h, y);
      y -= S.dent * k * Math.exp(-(x * x) / (0.022 * 0.022));
      if (z > 0) x *= 1 - S.pinch * k * smooth(0, 0.09, z);
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const band = new THREE.CylinderGeometry(S.r + 0.0045, S.r + 0.0055, S.dome ? 0.016 : 0.024, 48, 1, true);
  band.scale(1, 1, 1.16);
  band.translate(0, (S.dome ? 0.016 : 0.024) / 2 + t * 0.5, 0);
  return { hat: g, band, S };
}

/** Moustache as merged ellipsoids (and curled tips for a handlebar). */
function moustache(style) {
  const parts = [];
  const blob = (sx, sy, sz, x, y, z, rz = 0) => {
    const s = new THREE.SphereGeometry(1, 14, 10);
    s.scale(sx, sy, sz);
    s.rotateZ(rz);
    s.translate(x, y, z);
    parts.push(s.toNonIndexed());
  };
  if (style === "walrus") {
    blob(0.024, 0.011, 0.012, -0.018, -0.006, 0, 0.35);
    blob(0.024, 0.011, 0.012, 0.018, -0.006, 0, -0.35);
    blob(0.016, 0.01, 0.012, 0, 0.0, 0.002);
  } else if (style === "handlebar") {
    blob(0.016, 0.006, 0.009, -0.012, -0.002, 0, 0.15);
    blob(0.016, 0.006, 0.009, 0.012, -0.002, 0, -0.15);
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([V(0.022 * s, -0.003, -0.002), V(0.034 * s, -0.004, -0.006), V(0.042 * s, 0.004, -0.01), V(0.04 * s, 0.012, -0.012)]);
      const tg = new THREE.TubeGeometry(curve, 10, 0.0032, 6, false);
      parts.push(tg.toNonIndexed());
    }
  } else if (style === "pencil") {
    blob(0.022, 0.0028, 0.006, 0, 0, 0);
  } else {
    // chevron
    blob(0.026, 0.008, 0.01, 0, -0.002, 0);
  }
  const keep = (g) => {
    g.deleteAttribute("uv");
    return g;
  };
  return mergeGeometries(parts.map(keep));
}

function starGeometry(r = 0.026) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.0012, bevelSegments: 2 });
  const ring = new THREE.TorusGeometry(r * 1.04, 0.0018, 6, 30);
  ring.translate(0, 0, 0.0015);
  return mergeGeometries([g.toNonIndexed(), ring.toNonIndexed()].map((x) => (x.deleteAttribute("uv"), x)));
}

/* =================================================================== landmarks */
function landmarks(rig) {
  const b = (n) => rig.rest[n]?.pos || V();
  const L = {
    neckBase: b("neck_01").y,
    head: b("Head").y,
    chest: b("spine_03").y,
    waist: b("spine_01").y,
    hip: b("pelvis").y,
    knee: (b("calf_l").y + b("calf_r").y) / 2,
    wrist: Math.abs(b("hand_l").x),
    shoulder: Math.abs(b("upperarm_l").x),
  };
  // face points from the head mesh: nose tip, crown
  const geo = rig.body.geometry;
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const headIdx = rig.body.skeleton.bones.findIndex((x) => x.name === "Head");
  let nose = null, top = -1, P = V();
  let minX = 1, maxX = -1, minZ = 1, maxZ = -1;
  for (let v = 0; v < pos.count; v++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === headIdx) w += sw.getComponent(v, k);
    if (w < 0.9) continue;
    P.fromBufferAttribute(pos, v);
    if (P.y > top) top = P.y;
    if (Math.abs(P.x) < 0.01 && (!nose || P.z > nose.z) && P.y > L.head) nose = P.clone();
    if (P.y > L.head + 0.07) {
      minX = Math.min(minX, P.x);
      maxX = Math.max(maxX, P.x);
      minZ = Math.min(minZ, P.z);
      maxZ = Math.max(maxZ, P.z);
    }
  }
  L.top = top;
  L.nose = nose || V(0, L.head + 0.08, 0.1);
  L.headCx = (minX + maxX) / 2;
  L.headCz = (minZ + maxZ) / 2;
  L.headRx = (maxX - minX) / 2;
  L.headRz = (maxZ - minZ) / 2;
  return L;
}

/* =================================================================== build */
/**
 * rigs = DeckOfShadows loadRigs() → { male, female, clips, fclips }.
 * Returns a Cowboy controller: { root, update(dt, ctx), say … }.
 */
export function buildCowboy(rigs, rival, { darkMaps = {}, shadows = true, stand = false } = {}) {
  const look = rival.look;
  const female = look.rig === "f";
  const rig = new Rig(female ? rigs.female : rigs.male, rigs, female);
  rig.darkMap = darkMaps[female ? "f" : "m"] || null;
  rig.landmarks = landmarks(rig);
  const L = rig.landmarks;
  const U = creatureUniforms();
  U.uRimColor.value.set(0xffc58a);
  U.uRim.value = 0.06;
  const build = look.build || 1;
  const coat = look.coat && look.coat !== "none";
  // cloth thickness + build
  rig.sculpt({
    radial: (n) =>
      /Head/.test(n) ? 1
      : /neck/.test(n) ? (look.bandana != null ? 1.12 : 1.03)
      : /hand|index|middle|ring|pinky|thumb/.test(n) ? 1.0
      : /spine_03/.test(n) ? (coat ? 1.1 : look.vest != null ? 1.07 : 1.05) * build
      : /spine_0[12]/.test(n) ? (coat ? 1.1 : look.vest != null ? 1.08 : 1.06) * (1 + (build - 1) * 1.1)
      : /pelvis/.test(n) ? 1.08 * build
      : /clavicle|upperarm/.test(n) ? (coat ? 1.12 : 1.07) * (0.97 + (build - 1) * 0.8)
      : /lowerarm/.test(n) ? (coat ? 1.12 : 1.06)
      : /thigh/.test(n) ? 1.08 * (0.98 + (build - 1) * 0.8)
      : /calf/.test(n) ? 1.12
      : /foot|ball/.test(n) ? 1.16
      : 1,
  });
  const { cloth, kind, group } = dressBody(rig, look);
  rig.body.geometry.setAttribute("aCloth", new THREE.BufferAttribute(cloth, 4));
  rig.body.geometry.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
  // clothes hide the anatomy: smooth everything under fabric (not face, hands)
  {
    const w = new Float32Array(kind.length);
    for (let i = 0; i < w.length; i++) w[i] = Math.pow(cloth[i * 4 + 3], 2) * (group[i] === "foot" ? 0.4 : 1);
    smoothWeighted(rig.body.geometry, w, 10);
  }
  rig.body.material = outfitMaterial(rig, look, U);

  const owned = new Set();
  const own = (x) => (owned.add(x), x);

  // hair meshes ride on the head bone (they are loose in the file)
  rig.scene.updateMatrixWorld(true);
  for (const h of rig.hair) rig.bones.Head.attach(h);

  // vest / coat shells over the painted shirt
  const shellGeos = [];
  const isArm = (i) => group[i] === "arm" || group[i] === "shoulder";
  // chest/shoulder vertices skinned to the clavicle, upper arm (pectorals) or neck still belong to the torso garment
  const isShoulder = (i, x, y) =>
    ((group[i] === "shoulder" || group[i] === "arm") && Math.abs(x) < L.shoulder - 0.035 && y > L.chest - 0.2) ||
    (group[i] === "head" && y < L.neckBase - 0.015 && Math.abs(x) > 0.035);
  const isTorso = (i) => group[i] === "torso";
  const isHip = (i) => group[i] === "hip";
  const addShell = (spec, region, color, opts2) => {
    const g = shellGeometry(rig.body, region, { off: spec.off, smoothIters: 0, flare: spec.flare });
    // body vertices hidden under the garment: inside the shell AND well inside the garment's outline
    g.userData.covered = g.userData.covered.filter((v) => {
      const P = rig.body.geometry.attributes.position;
      return garmentKeep(spec, P.getX(v), P.getY(v), P.getZ(v), 0.025);
    });
    shellGeos.push(g);
    const m = new THREE.SkinnedMesh(own(g), own(fabricMaterial(color, KIND.wool, U, { ...opts2, mask: spec })));
    m.bind(rig.body.skeleton, rig.body.bindMatrix);
    m.position.copy(rig.body.position);
    m.quaternion.copy(rig.body.quaternion);
    m.scale.copy(rig.body.scale);
    m.castShadow = shadows;
    m.receiveShadow = true;
    m.frustumCulled = false;
    rig.body.parent.add(m);
  };
  if (coat) {
    const long = look.coat === "duster";
    const spec = {
      off: 0.017,
      hem: L.hip - (long ? 0.2 : 0.12),
      top: L.neckBase + 0.035,
      vTop: L.neckBase - 0.3,
      vMin: 0.012,
      vW: 0.1,
      cuff: L.wrist - 0.05,
      flare: (x, y) => Math.max(0, L.waist - y) * 0.12,
    };
    addShell(spec, (i, x, y) => (isTorso(i) || isShoulder(i, x, y) || isArm(i) || isHip(i) || group[i] === "head") && y > spec.hem - 0.05 && y < spec.top + 0.03 && Math.abs(x) < spec.cuff + 0.04, look.coatColor ?? 0x3a3530, {});
  }
  if (look.vest != null) {
    const spec = {
      off: coat ? 0.011 : 0.013,
      hem: L.hip + 0.05,
      top: L.neckBase - 0.025,
      vTop: L.neckBase - 0.24,
      vMin: 0.002,
      vW: 0.085,
      arm: [0.3, L.shoulder - 0.062, L.chest - 0.14, L.chest + 0.02],
    };
    addShell(spec, (i, x, y) => (isTorso(i) || isShoulder(i, x, y) || group[i] === "head" || group[i] === "arm") && y > spec.hem - 0.04 && y < spec.top + 0.03 && Math.abs(x) < 0.3, look.vest, { buttons: [spec.hem + 0.02, spec.vTop - 0.01] });
  }

  // hair, brows
  const hairCol = new THREE.Color(look.hairColor ?? 0x3a2a1e);
  const hairName = look.hair ? (female && look.hair === "Buzzed" ? "Hair_BuzzedFemale" : `Hair_${look.hair}`) : null;
  for (const h of rig.hair) {
    const want = h.name === hairName || (h.name === "Hair_Beard" && !!look.beard);
    h.visible = want;
    if (want) {
      h.material = own(h.material.clone());
      h.material.color = hairCol.clone().multiplyScalar(1.6);
      h.material.roughness = 0.7;
      h.castShadow = shadows;
    }
  }
  if (rig.brows) {
    rig.brows.material = own(rig.brows.material.clone());
    rig.brows.material.color = hairCol.clone().multiplyScalar(1.4);
  }

  // hide the body wherever a garment shell fully covers it (no poke-through)
  {
    const cover = new Float32Array(rig.body.geometry.attributes.position.count);
    for (const g of shellGeos) for (const v of g.userData.covered) cover[v] = 1;
    rig.body.geometry.setAttribute("aCover", new THREE.BufferAttribute(cover, 1));
  }

  // hat
  let hat = null;
  if (look.hat && look.hat !== "none") {
    const { hat: hg, band: bg, S } = hatGeometry(look.hat);
    const g = new THREE.Group();
    const felt = own(feltMaterial(U, look.hatColor ?? 0x5a4632));
    const hm = new THREE.Mesh(own(hg), felt);
    const bandMat = own(leatherMaterial(U, new THREE.Color(look.hatColor ?? 0x5a4632).multiplyScalar(0.35)));
    const bm = new THREE.Mesh(own(bg), bandMat);
    hm.castShadow = bm.castShadow = shadows;
    g.add(hm, bm);
    // fit over the head: brim plane just above the brows, crown covering the skull
    const sx = (L.headRx + 0.012) / S.r;
    const sz = (L.headRz + 0.014) / (S.r * 1.16);
    g.scale.set(Math.max(1, sx), 1, Math.max(1, sz));
    const y = L.top - 0.074;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0));
    rig.atWorld("Head", g, V(L.headCx, y, L.headCz - 0.008), q);
    hat = g;
    // hide long hair crown poking through (keep the back/sides)
  }

  // moustache
  if (look.stache && look.stache !== "none") {
    const mg = own(moustache(look.stache));
    const mm = new THREE.Mesh(mg, own(hairMaterial(U, hairCol)));
    mm.castShadow = false;
    rig.atWorld("Head", mm, V(0, L.nose.y - 0.03, L.nose.z - 0.016));
  }

  // bandana knot + flap
  if (look.bandana != null) {
    const bandMat = own(creatureMaterial({ color: new THREE.Color(look.bandana), roughness: 0.85 }, { bump: [300, 0.0006, 2] }, U));
    const flap = new THREE.ConeGeometry(0.06, 0.09, 3, 1);
    flap.rotateX(Math.PI);
    flap.scale(1, 1, 0.25);
    const fm = new THREE.Mesh(own(flap), bandMat);
    rig.atWorld("neck_01", fm, V(0, L.neckBase - 0.0, 0.065), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0, 0)));
  }

  // belt + buckle (+ holster)
  {
    const beltMat = own(leatherMaterial(U, 0x2a1a10));
    const yb = L.hip + 0.07;
    // measure the sculpted body at the belt line
    const pos = rig.body.geometry.attributes.position;
    let rx = 0.15, rz = 0.11;
    {
      let mx = 0, mz = 0;
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        if (Math.abs(y - yb) > 0.02) continue;
        mx = Math.max(mx, Math.abs(pos.getX(v)));
        mz = Math.max(mz, Math.abs(pos.getZ(v)));
      }
      if (mx > 0.08) rx = mx + 0.004;
      if (mz > 0.06) rz = mz + 0.004;
    }
    const belt = new THREE.CylinderGeometry(1, 1, 0.042, 40, 1, true);
    belt.scale(rx, 1, rz);
    const bm = new THREE.Mesh(own(belt), beltMat);
    bm.castShadow = shadows;
    rig.atWorld("pelvis", bm, V(0, yb, 0));
    const buckle = new THREE.Mesh(own(new THREE.BoxGeometry(0.06, 0.045, 0.008)), own(metalMaterial(look.badge ? 0xc8c2b4 : 0xb8933e, 0.35)));
    rig.atWorld("pelvis", buckle, V(0, yb, rz + 0.003));
    if (rival.archetype === "outlaw" || rival.archetype === "sheriff") {
      const hol = new THREE.Mesh(own(new THREE.BoxGeometry(0.035, 0.16, 0.07)), beltMat);
      rig.atWorld("thigh_r", hol, V(-rx - 0.012, yb - 0.1, 0.0));
      const grip = new THREE.Mesh(own(new THREE.CylinderGeometry(0.012, 0.014, 0.08, 10)), own(new THREE.MeshStandardMaterial({ color: 0x3a2516, roughness: 0.5 })));
      grip.rotation.z = 0.5;
      rig.atWorld("thigh_r", grip, V(-rx - 0.012, yb + 0.0, 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.4)));
    }
  }

  // sheriff star
  if (look.badge) {
    const st = new THREE.Mesh(own(starGeometry()), own(metalMaterial(0xd9cfb4, 0.28)));
    const zc = (() => {
      const pos = rig.body.geometry.attributes.position;
      let mz = 0.1;
      for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getY(v) - (L.chest + 0.03)) < 0.02 && Math.abs(pos.getX(v) - 0.09) < 0.02) mz = Math.max(mz, pos.getZ(v));
      return mz;
    })();
    rig.atWorld("spine_03", st, V(0.09, L.chest + 0.03, zc + 0.002));
  }

  // cigar
  if (look.cigar) {
    const cg = new THREE.CylinderGeometry(0.0065, 0.0075, 0.09, 10);
    cg.rotateX(Math.PI / 2);
    const cm = new THREE.Mesh(own(cg), own(new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 0.8 })));
    rig.atWorld("Head", cm, V(-0.02, L.nose.y - 0.055, L.nose.z + 0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, -0.35, 0)));
  }

  for (const o of [rig.body, rig.brows, rig.eyes]) if (o) o.castShadow = shadows;

  const seat = new Seat(rig, rival, U, stand);
  const C = {
    root: rig.root,
    rig,
    seat,
    hat,
    U,
    rival,
    update: (dt, ctx) => seat.update(dt, ctx),
    headPos: (out = V()) => rig.bones.Head.getWorldPosition(out),
    dispose() {
      rig.mixer.stopAllAction();
      rig.mixer.uncacheRoot(rig.scene);
      rig.root.traverse((o) => {
        if (o.isSkinnedMesh) o.skeleton?.dispose?.();
      });
      rig.ownGeo?.dispose();
      rig.body.material.dispose();
      for (const x of owned) x.dispose?.();
      rig.root.removeFromParent();
    },
  };
  return C;
}

/* =================================================================== seated animation */
class Seat {
  constructor(rig, rival, U, stand = false) {
    this.rig = rig;
    this.stand = stand;
    this.U = U;
    this.rival = rival;
    this.t = Math.random() * 10;
    const src = rig.female ? rig.clips.fclips : rig.clips.clips;
    const mk = (name, re, as) => (src[name] ? filterClip(src[name], re, as) : null);
    const NOT_UPPER = { test: (n) => !UPPER.test(n) };
    this.clips = {
      sitLower: mk(stand ? "Idle" : "Sit", NOT_UPPER, "sitLower"),
      sit: mk(stand ? "Idle" : "Sit", UPPER, "sitUpper"),
    };
    for (const n of ["Talk", "Yes", "No", "FoldArms", "Consume", "Interact", "Idle", "Lean"]) {
      const c = mk(n, { test: (b) => UPPER.test(b) && !/^spine_01$/.test(b) }, n);
      if (c) this.clips[n] = c;
    }
    this.mixer = rig.mixer;
    this.base = this.mixer.clipAction(this.clips.sitLower);
    this.base.play();
    this.cur = this.mixer.clipAction(this.clips.sit);
    this.cur.play();
    this.curName = "sit";
    this.overlayEnd = 0;
    // procedural state
    this.lean = 0;
    this.leanT = 0;
    this.headW = 0.8;
    this.look = V(0, 1.2, 0);
    this.lookT = V(0, 1.2, 0);
    this.lookJitter = V();
    this.nextGlance = 1 + Math.random() * 3;
    this.arms = { l: { w: 0, wT: 0, tgt: V(), tgtT: V(), free: true }, r: { w: 0, wT: 0, tgt: V(), tgtT: V(), free: true } };
    this.restW = stand ? 0 : 0.85;
    this.armSpeed = 4;
    this.gestures = [];
    this.anchors = null; // world anchors set by the table: { cards, stack, bet, chin, rest }
    this.mood = "idle";
    this.idleTimer = 2 + Math.random() * 4;
  }

  /** Cross-fade the upper body to a clip (or back to the seated pose with name "sit"). */
  upper(name, { fade = 0.35, loop = true, timeScale = 1, hold = 0 } = {}) {
    const clip = this.clips[name] || this.clips.sit;
    const a = this.mixer.clipAction(clip);
    if (a === this.cur && a.isRunning()) return;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.timeScale = timeScale;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.crossFadeFrom(this.cur, fade, true);
    a.play();
    this.cur = a;
    this.curName = name;
    this.overlayEnd = loop ? (hold ? this.t + hold : Infinity) : this.t + clip.duration / timeScale - fade;
  }

  /** Arm IK toward a world point (weight 0 releases the arm to the clip). */
  reach(side, target, w = 1, speed = 4) {
    const A = this.arms[side];
    A.free = !target;
    if (target) A.tgtT.copy(target);
    if (A.w < 0.02 && target) A.tgt.copy(target);
    A.wT = w;
    this.armSpeed = speed;
  }

  setAnchors(a) {
    this.anchors = a;
  }

  /** A short scripted gesture: list of [time, fn] keyed from now. */
  gesture(steps) {
    // additive: a new gesture never cancels callbacks still pending from another one
    const t0 = this.t;
    for (const [dt, fn] of steps) this.gestures.push({ at: t0 + dt, fn });
  }

  /* ---------------- high-level actions used by the table director */
  peek() {
    const A = this.anchors;
    if (!A) return;
    this.lookAt(A.cards, 0.6);
    this.gesture([
      [0, () => this.reach("l", A.cards.clone().add(V(0.02, 0.02, 0)), 1, 5)],
      [0.55, () => this.reach("l", A.cards.clone().add(V(0.0, 0.06, 0.03)), 1, 3)],
      [1.25, () => this.reach("l", A.rest.l, 0.6, 2.5)],
      [1.9, () => this.reach("l", null, 0, 2)],
    ]);
  }
  think(sec = 1.2) {
    const A = this.anchors;
    if (!A) return;
    this.leanT = 0.12;
    this.lookAt(A.pot, 0.6);
    this.reach("r", A.chin(), 1, 3);
    this.gesture([[sec, () => this.reach("r", null, 0, 2.5)], [sec, () => (this.leanT = 0)]]);
  }
  chips(onPush) {
    const A = this.anchors;
    if (!A) return;
    this.lookAt(A.bet, 0.5);
    this.gesture([
      [0, () => this.reach("r", A.stack.clone().add(V(0, 0.05, 0)), 1, 6)],
      [0.35, () => this.reach("r", A.stack.clone().add(V(0, 0.015, 0)), 1, 6)],
      [0.55, () => {
        this.reach("r", A.bet.clone().add(V(0, 0.03, 0)), 1, 3.5);
        onPush?.();
      }],
      [1.15, () => this.reach("r", A.rest.r, 0.5, 2.5)],
      [1.7, () => this.reach("r", null, 0, 2)],
    ]);
  }
  check() {
    const A = this.anchors;
    if (!A) return;
    this.gesture([
      [0, () => this.reach("r", A.rest.r.clone().add(V(0, 0.07, 0)), 1, 6)],
      [0.22, () => this.reach("r", A.rest.r.clone().add(V(0, 0.0, 0)), 1, 9)],
      [0.36, () => this.reach("r", A.rest.r.clone().add(V(0, 0.06, 0)), 1, 7)],
      [0.5, () => this.reach("r", A.rest.r.clone(), 1, 9)],
      [0.8, () => this.reach("r", null, 0, 2)],
    ]);
  }
  fold() {
    const A = this.anchors;
    if (!A) return;
    this.gesture([
      [0, () => this.reach("l", A.cards.clone().add(V(0, 0.02, 0)), 1, 5)],
      [0.45, () => this.reach("l", A.muck.clone().add(V(0, 0.03, 0)), 1, 4)],
      [0.9, () => {
        this.reach("l", null, 0, 2);
        this.upper("FoldArms", { fade: 0.6 });
        this.leanT = -0.1;
      }],
    ]);
  }
  win(big) {
    const A = this.anchors;
    this.leanT = -0.06;
    this.lookAt(A?.pot || V(0, 0.8, 0), 0.4);
    this.gesture([
      [0, () => A && this.reach("l", A.pot.clone().lerp(A.cards, 0.35).add(V(0.12, 0.03, 0)), 1, 3)],
      [0, () => A && this.reach("r", A.pot.clone().lerp(A.cards, 0.35).add(V(-0.12, 0.03, 0)), 1, 3)],
      [0.7, () => A && this.reach("l", A.stack.clone().add(V(0.12, 0.03, 0)), 1, 2.5)],
      [0.7, () => A && this.reach("r", A.stack.clone().add(V(-0.05, 0.03, 0)), 1, 2.5)],
      [1.4, () => {
        this.reach("l", null, 0, 2);
        this.reach("r", null, 0, 2);
        if (big) this.upper("Yes", { loop: false, fade: 0.3 });
      }],
      [2.4, () => (this.leanT = 0)],
    ]);
  }
  lose(busted) {
    this.leanT = 0.08;
    this.upper("No", { loop: false, fade: 0.25 });
    this.gesture([[1.6, () => {
      this.leanT = busted ? -0.12 : 0;
      if (busted) this.upper("FoldArms", { fade: 0.6 });
    }]]);
  }
  talk(sec = 2.2) {
    this.upper("Talk", { fade: 0.3, hold: sec });
  }
  drink() {
    this.upper("Consume", { loop: false, fade: 0.35 });
  }
  nod() {
    this.upper("Yes", { loop: false, fade: 0.25 });
  }
  newHand() {
    if (this.curName === "FoldArms") this.upper("sit", { fade: 0.6 });
    this.leanT = 0;
  }
  lookAt(p, hold = 1.5) {
    if (!p) return;
    this.lookT.copy(p);
    this.lookHold = this.t + hold;
  }

  /* ---------------- per frame */
  update(dt, ctx = {}) {
    this.t += dt;
    for (const g of this.gestures) if (!g.done && this.t >= g.at) {
      g.done = true;
      g.fn();
    }
    this.gestures = this.gestures.filter((g) => !g.done);
    if (this.curName !== "sit" && this.curName !== "FoldArms" && this.t > this.overlayEnd) this.upper("sit", { fade: 0.45 });

    // idle life: glances, drinks, settling
    const fid = ctx.fidget ?? 0.6;
    if (!this.lookHold || this.t > this.lookHold) {
      this.nextGlance -= dt;
      if (this.nextGlance <= 0 && ctx.lookTargets?.length) {
        const k = ctx.lookTargets[Math.floor(Math.random() * ctx.lookTargets.length)];
        this.lookT.copy(k);
        this.nextGlance = 1.5 + Math.random() * 3.5;
      }
    }
    this.idleTimer -= dt * fid;
    if (this.idleTimer <= 0 && ctx.idle && this.curName === "sit" && !this.gestures.length) {
      this.idleTimer = 6 + Math.random() * 8;
      if (Math.random() < 0.35) this.drink();
      else if (Math.random() < 0.5) this.leanT = (Math.random() - 0.3) * 0.08;
    }

    // restore bind pose for bones without tracks (prevents additive drift), then the clips
    for (const [bone, q] of this.rig.bindQ) bone.quaternion.copy(q);
    this.mixer.update(dt);
    const B = this.rig.bones;
    // procedural: lean + breathing
    this.lean += (this.leanT - this.lean) * Math.min(1, dt * 2.5);
    const br = Math.sin(this.t * 1.55);
    B.spine_01?.rotateX(this.lean * 0.5);
    B.spine_02?.rotateX(this.lean * 0.5 + br * 0.012);
    B.spine_03?.rotateX(br * 0.02);
    for (const s of ["l", "r"]) B[`clavicle_${s}`]?.rotateZ(br * 0.012 * (s === "l" ? 1 : -1));
    this.rig.root.updateMatrixWorld(true);
    // head look
    this.look.lerp(this.lookT, Math.min(1, dt * 3));
    this.headLook(this.look, 0.85);
    // arms
    const armsBusy = { FoldArms: "lr", Talk: "lr", Consume: "r", Interact: "r" }[this.curName] || "";
    for (const s of ["l", "r"]) {
      const A = this.arms[s];
      if (A.free) {
        // idle: forearms rest on the rail unless a clip needs the arm
        const rest = this.anchors && this.restW > 0 && !armsBusy.includes(s);
        if (rest) A.tgtT.copy(this.anchors.rest[s]);
        A.wT = rest ? this.restW : 0;
      }
      A.w += (A.wT - A.w) * Math.min(1, dt * (A.free ? 2.5 : this.armSpeed));
      A.tgt.lerp(A.tgtT, Math.min(1, dt * this.armSpeed * 1.4));
      if (A.w > 0.01) this.ik(s, A.tgt, A.w);
    }
  }

  headLook(target, amount) {
    const head = this.rig.bones.Head;
    const neck = this.rig.bones.neck_01;
    if (!head || !neck) return;
    for (const [bone, k] of [[neck, 0.4], [head, 0.6]]) {
      bone.updateWorldMatrix(true, false);
      const hp = bone.getWorldPosition(V());
      const want = target.clone().sub(hp).normalize();
      const restQ = this.rig.rest.Head.quat;
      const fLocal = V(0, 0, 1).applyQuaternion(restQ.clone().invert());
      const curQ = bone.getWorldQuaternion(Q());
      // forward of the head in world
      const fw = fLocal.clone().applyQuaternion(head.getWorldQuaternion(Q())).normalize();
      const q = Q().setFromUnitVectors(fw, want);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      const lim = 0.9;
      if (ang > lim) q.slerp(Q(), 1 - lim / ang);
      q.slerp(Q(), 1 - amount * k);
      const parentQ = bone.parent.getWorldQuaternion(Q());
      bone.quaternion.copy(parentQ.invert().multiply(q.multiply(curQ)));
      bone.updateWorldMatrix(false, true);
    }
  }

  /** Two-bone IK for upperarm → lowerarm → hand, blended by w. */
  ik(side, T, w) {
    const B = this.rig.bones;
    const ua = B[`upperarm_${side}`], la = B[`lowerarm_${side}`], hd = B[`hand_${side}`];
    if (!ua || !la || !hd) return;
    const qUa0 = ua.quaternion.clone(), qLa0 = la.quaternion.clone(), qHd0 = hd.quaternion.clone();
    ua.updateWorldMatrix(true, true);
    const A = ua.getWorldPosition(V()), Bp = la.getWorldPosition(V()), Cp = hd.getWorldPosition(V());
    const a = A.distanceTo(Bp), b = Bp.distanceTo(Cp);
    const toT = T.clone().sub(A);
    const d = clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const dir = toT.normalize();
    // pole: elbows out to the side, down and back
    const root = this.rig.root;
    const side3 = V(side === "l" ? 1 : -1, 0, 0).applyQuaternion(root.getWorldQuaternion(Q()));
    const back = V(0, 0, -1).applyQuaternion(root.getWorldQuaternion(Q()));
    const pole = side3.multiplyScalar(0.7).add(V(0, -1, 0)).add(back.multiplyScalar(0.35));
    const pdir = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const alpha = Math.acos(cosA);
    const E = A.clone().add(dir.clone().multiplyScalar(Math.cos(alpha) * a)).add(pdir.multiplyScalar(Math.sin(alpha) * a));
    const rotateBoneTo = (bone, from, to) => {
      const q = Q().setFromUnitVectors(from.normalize(), to.normalize());
      const wq = bone.getWorldQuaternion(Q());
      const pq = bone.parent.getWorldQuaternion(Q());
      bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
      bone.updateWorldMatrix(false, true);
    };
    rotateBoneTo(ua, Bp.clone().sub(A), E.clone().sub(A));
    const B2 = la.getWorldPosition(V()), C2 = hd.getWorldPosition(V());
    rotateBoneTo(la, C2.clone().sub(B2), T.clone().sub(B2));
    // hand: palm down, fingers toward the target direction
    const fwd = T.clone().sub(A).setY(0).normalize();
    const hq = Q().setFromRotationMatrix(new THREE.Matrix4().lookAt(V(), fwd, V(0, 1, 0)));
    const restH = this.rig.rest[`hand_${side}`].quat;
    // rest pose hand points along the arm (T-pose): map rest "along arm" to fwd, palm down
    const restDir = V(side === "l" ? 1 : -1, 0, 0);
    const qAlong = Q().setFromUnitVectors(restDir, fwd);
    const want = qAlong.multiply(restH.clone());
    void hq;
    const pq = hd.parent.getWorldQuaternion(Q());
    const handLocal = pq.invert().multiply(want);
    // blend with the animated pose
    const tUa = ua.quaternion.clone(), tLa = la.quaternion.clone();
    ua.quaternion.copy(qUa0).slerp(tUa, w);
    la.quaternion.copy(qLa0).slerp(tLa, w);
    hd.quaternion.copy(qHd0).slerp(handLocal, w * 0.85);
    ua.updateWorldMatrix(false, true);
  }
}
