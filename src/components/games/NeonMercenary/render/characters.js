/**
 * Humanoid characters: a clone of the CC0 Quaternius body, dressed in code.
 *
 *  • Bodysuit shader — the skin material is extended so everything except the
 *    head and hands (decided from the un-skinned bind position) becomes a
 *    tactical suit: base / jacket colours, panel seams, emissive neon piping,
 *    fabric vs leather roughness. Robots get the whole body in brushed metal.
 *  • Gear — rigid armour, visors, masks, collars, boots, cyber implants and
 *    weapons are small procedural meshes parented to bones.
 *  • Animator — three layers (lower body, upper body, full-body one-shots)
 *    blended by weight, plus procedural aim pitch / torso twist.
 */
import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LOOP_CLIPS } from "./assets.js";

const BIND = {
  m: { neck: 1.535, wrist: 0.69 },
  f: { neck: 1.5, wrist: 0.625 },
};

/* ================================================================ materials */
function suitMaterial(src, look, assets, body) {
  const m = src.clone();
  if (look.skin === "dark") m.map = assets.dark[body];
  m.color = new THREE.Color(look.skinTint || "#ffffff");
  m.metalness = 1;
  m.roughness = 1;
  m.envMapIntensity = look.robot ? 1.2 : 0.7;
  m.normalScale = new THREE.Vector2(0.75, 0.75);
  const B = BIND[body];
  const u = {
    uSuit: { value: new THREE.Color(look.suit || "#16161c") },
    uCoat: { value: new THREE.Color(look.coat || look.suit || "#16161c") },
    uTrim: { value: new THREE.Color(look.trim || "#19f0ff") },
    uTrimI: { value: look.trimI ?? (look.robot ? 1.8 : 1.3) },
    uNeck: { value: look.robot ? -9 : B.neck },
    uWrist: { value: look.gloves || look.robot ? 0.55 : B.wrist },
    uRobot: { value: look.robot ? 1 : 0 },
    uCloak: { value: 0 },
    uHit: { value: 0 },
    uTime: { value: 0 },
    uHolo: { value: look.holo ? 1 : 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vBind;
uniform vec3 uSuit; uniform vec3 uCoat; uniform vec3 uTrim; uniform float uTrimI;
uniform float uNeck; uniform float uWrist; uniform float uRobot; uniform float uCloak; uniform float uHit; uniform float uTime; uniform float uHolo;
float suitMask = 0.0; float trimMask = 0.0; float seam = 0.0;
float line(float v, float at, float w) { return 1.0 - smoothstep(0.0, w, abs(v - at)); }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    vec3 b = vBind;
    float ax = abs(b.x);
    suitMask = step(b.y, uNeck) * step(ax, uWrist);
    // regions: torso+arms wear the coat colour, legs the suit colour
    float upper = smoothstep(0.9, 0.98, b.y);
    vec3 cloth = mix(uSuit, uCoat, upper);
    // seams / panels
    seam = max(line(b.y, 0.96, 0.012), line(b.y, 0.52, 0.01));
    seam = max(seam, line(ax, 0.11, 0.006) * step(b.y, 0.92) * step(0.12, b.y));
    seam = max(seam, line(b.y, 1.32, 0.01) * step(ax, 0.2));
    seam = max(seam, line(ax + (1.3 - b.y) * 0.35, 0.16, 0.008) * step(1.05, b.y) * step(b.y, 1.42) * step(ax, 0.2));
    seam = max(seam, line(b.y, 1.43, 0.008) * step(0.25, ax));
    // neon piping: outer arms, outer legs, chest diagonal, belt
    trimMask = line(b.z, -0.02, 0.006) * step(0.3, ax) * step(ax, uWrist - 0.02);
    trimMask = max(trimMask, line(ax, 0.175, 0.005) * step(0.1, b.y) * step(b.y, 0.9) * step(b.z, 0.0));
    trimMask = max(trimMask, line(ax + (1.3 - b.y) * 0.35, 0.16, 0.004) * step(1.05, b.y) * step(b.y, 1.42) * step(0.05, b.z) * step(ax, 0.2));
    trimMask = max(trimMask, line(b.y, 0.99, 0.005) * step(0.0, b.z));
    float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 suitCol = cloth * (0.75 + 0.5 * lum) * (1.0 - seam * 0.55);
    if (uRobot > 0.5) {
      // brushed metal plating with panel lines
      float panel = max(line(fract(b.y * 6.0), 0.5, 0.02), line(fract(ax * 9.0), 0.5, 0.03));
      suitCol = uSuit * (0.85 + 0.3 * lum) * (1.0 - panel * 0.5);
      suitMask = 1.0;
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, suitCol, suitMask);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.25, 0.25), uHit * 0.6);
  }`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, mix(0.82, 0.42, smoothstep(0.9, 0.98, vBind.y)), suitMask);
  roughnessFactor = mix(roughnessFactor, 0.32, uRobot);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
  metalnessFactor = mix(0.0, 0.85, uRobot);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `vec3 nmBaseN = normal;
#include <normal_fragment_maps>
  normal = normalize(mix(normal, nmBaseN, suitMask * (1.0 - uRobot) * 0.75));`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += uTrim * uTrimI * trimMask * suitMask;
  totalEmissiveRadiance += uTrim * uHolo * (0.4 + 0.3 * sin(vBind.y * 80.0 + uTime * 9.0));
  totalEmissiveRadiance += vec3(1.0, 0.3, 0.2) * uHit * 0.8;`
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
  if (uCloak > 0.0) {
    float sh = 0.5 + 0.5 * sin(vBind.y * 40.0 + uTime * 6.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.6, 0.9, 1.0) * sh, uCloak);
    gl_FragColor.a = mix(1.0, 0.07 + 0.08 * sh, uCloak);
  }
  if (uHolo > 0.0) gl_FragColor.a = 0.55 + 0.25 * sin(vBind.y * 60.0 - uTime * 7.0);`
      );
  };
  m.customProgramCacheKey = () => "nm-suit";
  if (look.holo || look.cloakable) m.transparent = true;
  return m;
}

/* ================================================================ garments */
/**
 * Clothing as skinned shells: copies of the body's triangles inside a bind-pose
 * region, pushed out along the normal, bound to the same skeleton — so a
 * jacket or trousers deform exactly like the body underneath.
 */
const GARMENT_GEO = new Map();
function garmentGeometry(src, body, kind) {
  const key = `${body}:${kind}`;
  if (GARMENT_GEO.has(key)) return GARMENT_GEO.get(key);
  const B = BIND[body];
  const pos = src.attributes.position;
  const nor = src.attributes.normal;
  const idx = src.index;
  const R = {
    jacket: (x, y) => y > 0.87 && y < B.neck - 0.004 && Math.abs(x) < B.wrist - 0.13,
    coat: (x, y) => y > 0.42 && y < B.neck - 0.004 && Math.abs(x) < B.wrist - 0.13,
    vest: (x, y) => y > 0.9 && y < B.neck - 0.03 && Math.abs(x) < 0.21,
    pants: (x, y) => y > 0.075 && y < 1.0 && Math.abs(x) < 0.3,
  }[kind];
  const off = { jacket: 0.016, coat: 0.02, vest: 0.026, pants: 0.0075 }[kind];
  const map = new Int32Array(pos.count).fill(-1);
  const keep = [];
  const tri = [];
  const inR = (i) => R(pos.getX(i), pos.getY(i));
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const c = idx.getX(t + 2);
    if (!inR(a) || !inR(b) || !inR(c)) continue;
    for (const v of [a, b, c]) {
      if (map[v] < 0) {
        map[v] = keep.length;
        keep.push(v);
      }
      tri.push(map[v]);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    const n = attr.itemSize;
    const Arr = attr.array.constructor;
    const out = new Arr(keep.length * n);
    keep.forEach((v, i) => {
      for (let k = 0; k < n; k++) out[i * n + k] = attr.array[v * n + k];
    });
    g.setAttribute(name, new THREE.BufferAttribute(out, n, attr.normalized));
  }
  const p = g.attributes.position;
  const nn = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    // looser around the waist / hem for coats and jackets
    const y = p.getY(i);
    const flare = kind === "coat" ? Math.max(0, 0.95 - y) * 0.06 : kind === "jacket" ? Math.max(0, 0.98 - y) * 0.08 : 0;
    p.setXYZ(i, p.getX(i) + nn.getX(i) * (off + flare), y + nn.getY(i) * off, p.getZ(i) + nn.getZ(i) * (off + flare));
  }
  g.setIndex(tri);
  g.computeBoundingSphere();
  void nor;
  GARMENT_GEO.set(key, g);
  return g;
}
function garmentMaterial(look, kind) {
  const col = kind === "pants" ? look.pants || "#1b1c22" : look.coat || look.suit || "#2a2a34";
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: kind === "pants" ? 0.85 : 0.5, metalness: kind === "pants" ? 0.02 : 0.12, side: THREE.DoubleSide });
  const u = { uTrim: { value: new THREE.Color(look.trim || "#19f0ff") }, uKind: { value: { jacket: 0, coat: 1, vest: 2, pants: 3 }[kind] } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vG;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvG = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vG; uniform vec3 uTrim; uniform float uKind; float gTrim = 0.0;\nfloat gl1(float v, float a, float w) { return 1.0 - smoothstep(0.0, w, abs(v - a)); }")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
  {
    float ax = abs(vG.x);
    float seam = 0.0;
    if (uKind < 2.5) {
      // zipper + collar + cuffs + hem
      gTrim = gl1(vG.x, 0.0, 0.006) * step(0.0, vG.z) * step(0.95, vG.y);
      seam = max(gl1(ax, 0.12, 0.006) * step(1.0, vG.y), gl1(vG.y, 1.36, 0.006) * step(ax, 0.22));
      gTrim = max(gTrim, gl1(ax, 0.5, 0.008) * step(1.3, vG.y));
      float pocket = step(0.07, ax) * step(ax, 0.17) * step(0.98, vG.y) * step(vG.y, 1.08) * step(0.0, vG.z);
      seam = max(seam, pocket * 0.6);
    } else {
      seam = max(gl1(vG.y, 0.52, 0.01), gl1(ax, 0.12, 0.006));
      gTrim = gl1(ax, 0.175, 0.004) * step(vG.z, 0.0) * step(0.2, vG.y) * step(vG.y, 0.9) * 0.6;
    }
    diffuseColor.rgb *= 1.0 - seam * 0.45;
  }`
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += uTrim * gTrim * 1.6;");
  };
  m.customProgramCacheKey = () => "nm-garment";
  return m;
}
function garmentsFor(look) {
  if (look.robot || look.noClothes) return [];
  if (look.garments) return look.garments;
  const coat = ["razor", "vex", "doc", "broker"].includes(look.gear) || (look.gear === "civ" && look.coat);
  return [coat ? "coat" : "jacket", "pants"];
}

/* ================================================================ gear geometry */
const G = {};
function geo(k) {
  if (G[k]) return G[k];
  let g;
  const rb = (w, h, d, r = 0.02, s = 2) => {
    // rounded box from a capsule-like lathe would be heavy; bevelled box via extrude
    const shape = new THREE.Shape();
    const x = w / 2 - r;
    const y = h / 2 - r;
    shape.moveTo(-x, -h / 2);
    shape.lineTo(x, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
    shape.lineTo(w / 2, y);
    shape.quadraticCurveTo(w / 2, h / 2, x, h / 2);
    shape.lineTo(-x, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
    shape.lineTo(-w / 2, -y);
    shape.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
    const e = new THREE.ExtrudeGeometry(shape, { depth: d - r * 2, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: s, curveSegments: 3 });
    e.translate(0, 0, -(d - r * 2) / 2);
    e.computeVertexNormals();
    return e;
  };
  switch (k) {
    case "plate": g = rb(0.27, 0.24, 0.045, 0.02); break;
    case "plateBig": g = rb(0.33, 0.31, 0.07, 0.03); break;
    case "backPlate": g = rb(0.26, 0.3, 0.04, 0.018); break;
    case "pad": {
      g = new THREE.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1, 0.7, 1.15);
      break;
    }
    case "padBig": {
      g = new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1.05, 0.75, 1.2);
      break;
    }
    case "spike": g = new THREE.ConeGeometry(0.025, 0.12, 6); break;
    case "bracer": g = new THREE.CylinderGeometry(0.048, 0.042, 0.2, 12); break;
    case "shin": g = rb(0.1, 0.22, 0.06, 0.02); break;
    case "knee": {
      g = new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1, 0.6, 1);
      break;
    }
    case "boot": g = rb(0.105, 0.1, 0.25, 0.03); break;
    case "belt": {
      g = new THREE.TorusGeometry(0.155, 0.02, 6, 28);
      g.scale(1, 0.74, 1);
      break;
    }
    case "pouch": g = rb(0.07, 0.08, 0.05, 0.012); break;
    case "collar": g = new THREE.CylinderGeometry(0.075, 0.095, 0.08, 16, 1, true); break;
    case "collarHigh": g = new THREE.CylinderGeometry(0.09, 0.13, 0.16, 16, 1, true, -Math.PI * 0.85, Math.PI * 1.7); break;
    case "visor": {
      g = new THREE.CylinderGeometry(0.105, 0.105, 0.045, 20, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
      break;
    }
    case "helmet": {
      g = new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
      g.scale(1, 1.05, 1.12);
      break;
    }
    case "faceplate": g = rb(0.17, 0.09, 0.05, 0.02); break;
    case "maskLow": {
      g = new THREE.CylinderGeometry(0.098, 0.088, 0.075, 16, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
      break;
    }
    case "jaw": g = rb(0.17, 0.08, 0.15, 0.025); break;
    case "eyeImplant": g = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8); break;
    case "halo": g = new THREE.TorusGeometry(0.15, 0.008, 6, 40); break;
    case "spineFrame": g = rb(0.06, 0.5, 0.04, 0.015); break;
    case "pack": g = rb(0.24, 0.26, 0.1, 0.03); break;
    case "robotHead": {
      g = rb(0.2, 0.24, 0.22, 0.05, 3);
      break;
    }
    case "apron": g = rb(0.34, 0.5, 0.02, 0.01); break;
    case "cannon": {
      const a = new THREE.CylinderGeometry(0.11, 0.13, 0.55, 14);
      const b = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8);
      b.translate(0.05, 0.4, 0.05);
      const c = b.clone();
      c.translate(-0.1, 0, 0);
      const d = b.clone();
      d.translate(-0.05, 0, -0.09);
      g = mergeGeometries([a, b, c, d]);
      break;
    }
    case "tail": g = rb(0.36, 0.55, 0.02, 0.01); break;
  }
  G[k] = g;
  return g;
}

/* ================================================================ weapons */
const WGEO = {};
function boxG(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function cylG(r, l, x = 0, y = 0, z = 0, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, l, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
/** Weapon geometry in "gun space": barrel along +Z, top along +Y, grip at the origin. */
export function weaponGeometry(kind) {
  if (WGEO[kind]) return WGEO[kind];
  let body = [];
  let accent = [];
  switch (kind) {
    case "pistol":
      body = [boxG(0.035, 0.05, 0.2, 0, 0.05, 0.06), boxG(0.03, 0.1, 0.045, 0, -0.01, -0.01), cylG(0.009, 0.04, 0, 0.06, 0.175)];
      accent = [boxG(0.037, 0.008, 0.12, 0, 0.078, 0.06)];
      break;
    case "heavyPistol":
      body = [boxG(0.045, 0.065, 0.26, 0, 0.055, 0.08), boxG(0.036, 0.11, 0.05, 0, -0.01, -0.01), cylG(0.017, 0.06, 0, 0.055, 0.23), boxG(0.03, 0.03, 0.08, 0, 0.098, 0.02)];
      accent = [boxG(0.047, 0.01, 0.05, 0, 0.03, 0.15)];
      break;
    case "smg":
      body = [boxG(0.05, 0.075, 0.34, 0, 0.05, 0.08), boxG(0.032, 0.11, 0.045, 0, -0.02, -0.0), boxG(0.03, 0.14, 0.04, 0, -0.04, 0.13), cylG(0.012, 0.08, 0, 0.055, 0.28), boxG(0.03, 0.04, 0.16, 0, 0.04, -0.16)];
      accent = [boxG(0.052, 0.012, 0.18, 0, 0.09, 0.1)];
      break;
    case "shotgun":
      body = [boxG(0.055, 0.07, 0.5, 0, 0.05, 0.16), cylG(0.02, 0.36, 0, 0.075, 0.5), cylG(0.017, 0.28, 0, 0.035, 0.44), boxG(0.034, 0.1, 0.045, 0, -0.02, 0), boxG(0.045, 0.07, 0.26, 0, 0.02, -0.2)];
      accent = [boxG(0.06, 0.012, 0.12, 0, 0.035, 0.36)];
      break;
    case "ar":
      body = [boxG(0.05, 0.08, 0.5, 0, 0.05, 0.14), cylG(0.013, 0.24, 0, 0.06, 0.48), boxG(0.032, 0.12, 0.045, 0, -0.02, 0), boxG(0.035, 0.16, 0.06, 0, -0.06, 0.13), boxG(0.04, 0.07, 0.24, 0, 0.04, -0.2), boxG(0.03, 0.05, 0.12, 0, 0.115, 0.1)];
      accent = [boxG(0.052, 0.012, 0.2, 0, 0.012, 0.25), boxG(0.032, 0.02, 0.02, 0, 0.115, 0.165)];
      break;
    case "energy":
      body = [boxG(0.06, 0.09, 0.56, 0, 0.05, 0.16), boxG(0.032, 0.12, 0.045, 0, -0.02, 0), boxG(0.045, 0.06, 0.22, 0, 0.04, -0.2), cylG(0.03, 0.12, 0, 0.05, 0.47, 14)];
      accent = [boxG(0.064, 0.02, 0.36, 0, 0.1, 0.14), cylG(0.034, 0.03, 0, 0.05, 0.53, 14), boxG(0.066, 0.03, 0.03, 0, 0.05, 0.3)];
      break;
    case "blade":
      body = [boxG(0.03, 0.03, 0.24, 0, 0, -0.02), boxG(0.1, 0.02, 0.02, 0, 0, 0.1)];
      accent = [boxG(0.006, 0.035, 0.85, 0, 0, 0.53)];
      break;
    case "pipe":
      body = [cylG(0.02, 0.75, 0, 0, 0.3)];
      accent = [boxG(0.05, 0.05, 0.08, 0, 0, 0.62)];
      break;
    case "minigun":
      body = [cylG(0.08, 0.5, 0, 0.0, 0.2, 12), cylG(0.02, 0.5, 0.04, 0.04, 0.6), cylG(0.02, 0.5, -0.04, 0.04, 0.6), cylG(0.02, 0.5, 0, -0.05, 0.6)];
      accent = [cylG(0.085, 0.04, 0, 0, 0.42, 12)];
      break;
    default:
      body = [boxG(0.04, 0.05, 0.2)];
  }
  WGEO[kind] = { body: mergeGeometries(body), accent: accent.length ? mergeGeometries(accent) : null, muzzle: { pistol: 0.2, heavyPistol: 0.27, smg: 0.33, shotgun: 0.68, ar: 0.6, energy: 0.56, minigun: 0.85 }[kind] || 0.3 };
  return WGEO[kind];
}
const WEAPON_STYLE = {
  pistol: { color: "#2a2d33", accent: "#19f0ff" },
  heavyPistol: { color: "#3a3028", accent: "#ffb02e" },
  smg: { color: "#22262c", accent: "#4de0ff" },
  shotgun: { color: "#2c2622", accent: "#ff8a3d" },
  ar: { color: "#262a26", accent: "#b0ff4d" },
  energy: { color: "#dfe4ee", accent: "#7b8cff" },
  blade: { color: "#1a1a1e", accent: "#ff2bd6" },
  pipe: { color: "#5a5048", accent: "#7a6a58" },
  minigun: { color: "#33302c", accent: "#ff8a1f" },
};
export function createWeaponMesh(kind, accentColor) {
  const g = weaponGeometry(kind);
  const st = WEAPON_STYLE[kind] || WEAPON_STYLE.pistol;
  const grp = new THREE.Group();
  const m1 = new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.38, metalness: 0.8 });
  const body = new THREE.Mesh(g.body, m1);
  body.castShadow = true;
  grp.add(body);
  let m2 = null;
  if (g.accent) {
    m2 = new THREE.MeshStandardMaterial({ color: accentColor || st.accent, emissive: accentColor || st.accent, emissiveIntensity: kind === "blade" ? 3.2 : 1.6, roughness: 0.3, metalness: 0.2, toneMapped: kind !== "blade" });
    grp.add(new THREE.Mesh(g.accent, m2));
  }
  grp.userData = { muzzle: g.muzzle, mats: [m1, m2].filter(Boolean), kind };
  return grp;
}

/* ================================================================ outfits */
function gearSet(look) {
  // returns [{g, bone, p:[x,y,z], r:[x,y,z], s?, mat:'armor'|'trim'|'dark'|'glow'|'metal'}]
  const out = [];
  const A = (g, bone, p, r = [0, 0, 0], mat = "armor", s = 1) => out.push({ g, bone, p, r, mat, s });
  const gear = look.gear || "civ";
  const armored = ["player", "corp", "elite", "heavy", "razor", "ironjaw", "specter", "vex", "android"].includes(gear);
  // universal: boots + belt
  // bone frames (bind pose): spine/neck/head X=left Y=up Z=fwd · upperarm_l X=down Y=out ·
  // upperarm_r X=up Y=out · calf Y=down Z=back · foot Y=toes Z=down-back · pelvis Y=up Z=fwd
  A("boot", "foot_l", [0, 0.07, 0.025], [-Math.PI / 2, 0, 0], "dark");
  A("boot", "foot_r", [0, 0.07, 0.025], [-Math.PI / 2, 0, 0], "dark");
  if (gear !== "doc" && gear !== "civ") A("belt", "pelvis", [0, 0.05, 0.0], [Math.PI / 2, 0, 0], "dark");
  const chest = (big) => A(big ? "plateBig" : "plate", "spine_03", [0, big ? 0.03 : 0.05, big ? 0.12 : 0.105], [0.08, 0, 0], "armor");
  const back = () => A("backPlate", "spine_03", [0, 0.04, -0.12], [0, 0, 0], "armor");
  const pads = (big) => {
    A(big ? "padBig" : "pad", "upperarm_l", [-0.035, 0.06, 0], [0, 0, Math.PI / 2], "armor");
    A(big ? "padBig" : "pad", "upperarm_r", [0.035, 0.06, 0], [0, 0, -Math.PI / 2], "armor");
  };
  const bracers = () => {
    A("bracer", "lowerarm_l", [0, 0.13, 0], [0, 0, 0], "armor");
    A("bracer", "lowerarm_r", [0, 0.13, 0], [0, 0, 0], "armor");
  };
  const knees = () => {
    A("knee", "calf_l", [0, 0.03, -0.065], [-Math.PI / 2, 0, 0], "armor");
    A("knee", "calf_r", [0, 0.03, -0.065], [-Math.PI / 2, 0, 0], "armor");
    A("shin", "calf_l", [0, 0.17, -0.06], [0, 0, 0], "armor");
    A("shin", "calf_r", [0, 0.17, -0.06], [0, 0, 0], "armor");
  };
  const collar = (high) => A(high ? "collarHigh" : "collar", "neck_01", [0, 0.02, 0], [0, 0, 0], "dark");
  const pouches = () => {
    A("pouch", "pelvis", [0.14, 0.03, 0.08], [0, 0, 0], "dark");
    A("pouch", "pelvis", [-0.14, 0.03, 0.08], [0, 0, 0], "dark");
  };
  switch (gear) {
    case "player": {
      const b = look.bodyArmor || "jacket";
      collar(b === "weave");
      if (b === "kevlar" || b === "tactical" || b === "aegis") {
        chest(b !== "kevlar");
        back();
      }
      if (b === "tactical" || b === "aegis") pouches();
      if (b === "aegis") {
        pads(true);
        A("spineFrame", "spine_02", [0, 0.1, -0.14], [0, 0, 0], "metal");
      } else pads(false);
      bracers();
      knees();
      A("eyeImplant", "Head", [0.045, 0.085, 0.09], [Math.PI / 2, 0, 0], "glow");
      const h = look.headArmor;
      if (h === "visor" || h === "smartVisor") A("visor", "Head", [0, 0.09, 0.0], [0, 0, 0], "glow");
      if (h === "helmet") A("helmet", "Head", [0, 0.06, -0.005], [0, 0, 0], "armor");
      if (h === "kitsune") A("faceplate", "Head", [0, 0.06, 0.1], [0, 0, 0], "trim");
      if (h === "halo") A("halo", "Head", [0, 0.2, -0.02], [Math.PI / 2, 0, 0], "glow");
      break;
    }
    case "gang":
      collar(false);
      A("pad", "upperarm_l", [-0.04, 0.05, 0], [0, 0, Math.PI / 2], "armor");
      A("spike", "upperarm_l", [-0.11, 0.05, 0.04], [0, 0, Math.PI / 2], "metal");
      A("spike", "upperarm_l", [-0.11, 0.05, -0.04], [0, 0, Math.PI / 2], "metal");
      bracers();
      if (look.mask) A("maskLow", "Head", [0, 0.05, 0.005], [0, 0, 0], "trim");
      break;
    case "heavy":
      collar(true);
      chest(true);
      back();
      pads(true);
      bracers();
      knees();
      A("maskLow", "Head", [0, 0.05, 0.005], [0, 0, 0], "dark");
      A("eyeImplant", "Head", [-0.045, 0.085, 0.09], [Math.PI / 2, 0, 0], "glow");
      break;
    case "corp":
    case "elite":
      collar(gear === "elite");
      chest(gear === "elite");
      back();
      pads(gear === "elite");
      bracers();
      knees();
      pouches();
      if (look.helmet) {
        A("helmet", "Head", [0, 0.06, -0.005], [0, 0, 0], "armor");
        A("visor", "Head", [0, 0.085, 0.012], [0, 0, 0], "glow");
      }
      break;
    case "android":
      A("robotHead", "Head", [0, 0.1, 0.0], [0, 0, 0], "metal");
      A("visor", "Head", [0, 0.1, 0.02], [0, 0, 0], "glow", 1.08);
      chest(true);
      back();
      pads(false);
      knees();
      break;
    case "razor":
      collar(true);
      A("padBig", "upperarm_l", [-0.04, 0.05, 0], [0, 0, Math.PI / 2], "trim");
      for (let k = 0; k < 3; k++) A("spike", "upperarm_l", [-0.16, 0.05, -0.07 + k * 0.07], [0, 0, Math.PI / 2], "metal");
      bracers();
      A("maskLow", "Head", [0, 0.05, 0.005], [0, 0, 0], "trim");
      A("tail", "pelvis", [0, -0.22, -0.14], [-0.12, 0, 0], "coat");
      break;
    case "ironjaw":
      chest(true);
      back();
      pads(true);
      for (let k = 0; k < 3; k++) A("spike", "upperarm_r", [0.17, 0.05, -0.08 + k * 0.08], [0, 0, -Math.PI / 2], "metal");
      A("jaw", "Head", [0, 0.01, 0.07], [0, 0, 0], "metal");
      A("eyeImplant", "Head", [0.045, 0.085, 0.09], [Math.PI / 2, 0, 0], "glow", 1.4);
      A("eyeImplant", "Head", [-0.045, 0.085, 0.09], [Math.PI / 2, 0, 0], "glow", 1.4);
      A("cannon", "lowerarm_r", [0, 0.2, 0.0], [0, 0, 0], "metal");
      A("pack", "spine_03", [0, 0.0, -0.2], [0, 0, 0], "metal", 1.5);
      knees();
      break;
    case "specter":
      collar(true);
      A("visor", "Head", [0, 0.09, 0.005], [0, 0, 0], "glow", 1.05);
      A("pad", "upperarm_r", [0.04, 0.05, 0], [0, 0, -Math.PI / 2], "armor");
      bracers();
      knees();
      break;
    case "vex":
      collar(true);
      chest(true);
      back();
      pads(true);
      bracers();
      A("halo", "Head", [0, 0.22, -0.02], [Math.PI / 2, 0, 0], "glow", 1.2);
      A("eyeImplant", "Head", [0.045, 0.085, 0.09], [Math.PI / 2, 0, 0], "glow");
      A("spineFrame", "spine_02", [0, 0.1, -0.15], [0, 0, 0], "glow");
      A("tail", "pelvis", [0, -0.24, -0.15], [-0.1, 0, 0], "coat", 1.1);
      knees();
      break;
    case "broker":
      collar(true);
      A("eyeImplant", "Head", [0.045, 0.085, 0.09], [Math.PI / 2, 0, 0], "glow");
      break;
    case "vendor":
      collar(false);
      if (look.apron) A("apron", "pelvis", [0, -0.18, 0.16], [0.08, 0, 0], "coat");
      break;
    case "doc":
      collar(true);
      A("visor", "Head", [0, 0.09, 0.0], [0, 0, 0], "glow", 1.02);
      A("tail", "pelvis", [0, -0.22, -0.14], [-0.1, 0, 0], "coat");
      break;
    case "street":
      collar(false);
      A("eyeImplant", "Head", [0.045, 0.085, 0.09], [Math.PI / 2, 0, 0], "glow");
      A("pack", "spine_03", [0, 0.0, -0.16], [0, 0, 0], "dark", 0.8);
      break;
    default:
      if (look.coat) collar(false);
  }
  void armored;
  return out;
}

/* ================================================================ animator */
function createLayered(model, set) {
  const mixer = new THREE.AnimationMixer(model);
  const layers = { lower: new Map(), upper: new Map(), full: new Map() };
  const want = { lower: null, upper: null, full: null };
  const wantOpts = { lower: {}, upper: {}, full: {} };
  let fullW = 0;
  function act(layer, name) {
    const L = layers[layer];
    let e = L.get(name);
    if (!e) {
      const clip = set[layer][name];
      if (!clip) return null;
      const a = mixer.clipAction(clip);
      a.setLoop(LOOP_CLIPS.has(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(0);
      a.play();
      e = { a, w: 0 };
      L.set(name, e);
    }
    return e;
  }
  return {
    mixer,
    /** layer: 'lower'|'upper'|'full'; name: clip or null; o: {speed, restart, time, fade} */
    set(layer, name, o = {}) {
      if (want[layer] !== name || o.restart) {
        const e = name ? act(layer, name) : null;
        if (e && (o.restart || (!LOOP_CLIPS.has(name) && e.w < 0.05))) e.a.reset().play();
        want[layer] = name;
      }
      wantOpts[layer] = o;
      const e = name && layers[layer].get(name);
      if (e) {
        if (o.time != null) {
          e.a.time = Math.max(0, Math.min(e.a.getClip().duration - 1e-3, o.time));
          e.a.timeScale = 0;
        } else e.a.timeScale = o.speed ?? 1;
      }
    },
    playing(layer) {
      return want[layer];
    },
    progress(layer) {
      const n = want[layer];
      const e = n && layers[layer].get(n);
      return e ? e.a.time / e.a.getClip().duration : 1;
    },
    update(dt) {
      const fullTarget = want.full ? 1 : 0;
      const fFade = wantOpts.full.fade ?? 0.12;
      fullW += (fullTarget - fullW) * Math.min(1, dt / fFade);
      for (const layer of ["lower", "upper", "full"]) {
        const fade = wantOpts[layer].fade ?? 0.18;
        const k = Math.min(1, dt / fade);
        let sum = 0;
        for (const [n, e] of layers[layer]) {
          const t = n === want[layer] ? 1 : 0;
          e.w += (t - e.w) * k;
          if (t === 0 && e.w < 0.003) e.w = 0;
          sum += e.w;
        }
        const scale = layer === "full" ? fullW : 1 - fullW;
        for (const [, e] of layers[layer]) e.a.setEffectiveWeight(sum > 0 ? (e.w / sum) * scale : 0);
      }
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}

/* ================================================================ character */
const HAIRS = ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard", "Hair_Long", "Hair_Buns", "Hair_BuzzedFemale"];

export function createCharacter(assets, look = {}) {
  const body = look.body === "f" ? "f" : "m";
  const src = assets.bodies[body];
  const root = new THREE.Group();
  const model = skClone(src.scene);
  root.add(model);
  const B = {};
  const meshes = [];
  model.traverse((o) => {
    if (o.isBone) B[o.name] = o;
    if (o.isMesh) meshes.push(o);
  });
  model.updateMatrixWorld(true);
  const headInv = B.Head.matrixWorld.clone().invert();
  const mats = [];
  const robot = look.robot === "android";
  const hairMat = new THREE.MeshStandardMaterial({ color: look.hairColor || "#1a1410", roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  mats.push(hairMat);
  let suit = null;
  for (const o of meshes) {
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    if (HAIRS.includes(o.name)) {
      const want = !robot && !look.helmet && (o.name === look.hair || (o.name === "Hair_Beard" && look.beard));
      if (!want) {
        o.parent.remove(o);
        continue;
      }
      o.material = hairMat;
      o.matrix.copy(headInv).multiply(o.matrixWorld);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
      B.Head.add(o);
      continue;
    }
    if (o.isSkinnedMesh && /superhero/i.test(o.name)) {
      suit = suitMaterial(o.material, { ...look, robot }, assets, body);
      o.material = suit;
      mats.push(suit);
    } else if (o.material?.name === "Hair") {
      if (robot) o.visible = false;
      o.material = hairMat;
    } else {
      o.material = o.material.clone();
      if (robot) o.visible = false;
      mats.push(o.material);
    }
  }
  // clothing shells bound to the body's skeleton
  const bodyMesh = meshes.find((o) => o.isSkinnedMesh && /superhero/i.test(o.name));
  if (bodyMesh)
    for (const kind of garmentsFor({ ...look, robot })) {
      const gm = new THREE.SkinnedMesh(garmentGeometry(bodyMesh.geometry, body, kind), garmentMaterial(look, kind));
      gm.position.copy(bodyMesh.position);
      gm.quaternion.copy(bodyMesh.quaternion);
      gm.scale.copy(bodyMesh.scale);
      gm.bind(bodyMesh.skeleton, bodyMesh.bindMatrix);
      gm.castShadow = true;
      gm.receiveShadow = true;
      gm.frustumCulled = false;
      bodyMesh.parent.add(gm);
      mats.push(gm.material);
    }
  const s = look.scale || 1;
  const gth = look.girth || 1;
  model.scale.set(s * gth, s, s * gth);

  // ---------------------------------------------------------- gear
  const trimCol = new THREE.Color(look.trim || "#19f0ff");
  const GM = {
    armor: new THREE.MeshStandardMaterial({ color: look.armor || (robot ? look.paint : "#2c2f37"), roughness: 0.45, metalness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: "#121216", roughness: 0.7, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: robot ? look.paint || "#4a4f5a" : "#6a6e78", roughness: 0.3, metalness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: trimCol, emissive: trimCol, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.3 }),
    glow: new THREE.MeshStandardMaterial({ color: trimCol, emissive: trimCol, emissiveIntensity: 1.3, roughness: 0.2, metalness: 0.1 }),
    coat: new THREE.MeshStandardMaterial({ color: look.coat || "#202028", roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide }),
  };
  for (const m of Object.values(GM)) mats.push(m);
  const gearMeshes = [];
  for (const p of gearSet({ ...look, gear: robot ? "android" : look.gear })) {
    const bone = B[p.bone];
    if (!bone) continue;
    const mesh = new THREE.Mesh(geo(p.g), GM[p.mat]);
    mesh.position.set(...p.p);
    mesh.rotation.set(...p.r);
    if (p.s !== 1) mesh.scale.setScalar(p.s);
    // gear sizes are authored in metres: cancel the bone's world scale (the
    // model root rotation/scale is inherited through the skeleton)
    mesh.castShadow = true;
    bone.add(mesh);
    gearMeshes.push(mesh);
  }
  fixBoneSpace(model, gearMeshes);

  // fingers are never animated (the library has no finger tracks): curl them into a grip
  {
    const qq = new THREE.Quaternion();
    for (const side of ["l", "r"]) {
      for (const f of ["index", "middle", "ring", "pinky"])
        for (let j = 1; j <= 3; j++) {
          const b = B[`${f}_0${j}_${side}`];
          if (b) b.quaternion.multiply(qq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (f === "index" && side === "r" ? 0.75 : 1.05) + (j > 1 ? 0.25 : 0)));
        }
      for (let j = 1; j <= 3; j++) {
        const b = B[`thumb_0${j}_${side}`];
        if (b) b.quaternion.multiply(qq.setFromAxisAngle(new THREE.Vector3(0, 0, side === "l" ? 1 : -1), 0.35));
      }
    }
  }
  // ---------------------------------------------------------- weapon socket
  const socket = new THREE.Group();
  B.hand_r.add(socket);
  // gun space → hand space: barrel (+Z) along the fingers (+Y), top (+Y) toward the thumb (+Z)
  socket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  socket.position.set(-0.01, 0.07, -0.045);
  fixBoneSpace(model, [socket]);
  let weapon = null;
  let weaponKind = null;

  const anim = createLayered(model, assets.clips[body]);
  const spine = [B.spine_01, B.spine_02, B.spine_03];
  const q = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);

  return {
    root,
    model,
    bones: B,
    body,
    suit,
    uniforms: suit?.userData.u,
    anim,
    setWeapon(kind, accent) {
      if (kind === weaponKind) return;
      if (weapon) {
        socket.remove(weapon);
        weapon.userData.mats.forEach((m) => m.dispose());
      }
      weapon = kind ? createWeaponMesh(kind, accent) : null;
      weaponKind = kind;
      if (weapon) socket.add(weapon);
    },
    get weapon() {
      return weapon;
    },
    muzzleWorld(out) {
      if (!weapon) return B.hand_r.getWorldPosition(out);
      out.set(0, 0.05, weapon.userData.muzzle);
      return weapon.localToWorld(out);
    },
    /** Procedural aim: pitch the spine (radians, + up) and twist it (yaw). */
    aim(pitch, twist = 0) {
      const p = pitch / 3;
      const t = twist / 3;
      for (const b of spine) {
        if (!b) continue;
        q.setFromAxisAngle(axisX, -p);
        b.quaternion.multiply(q);
        if (t) {
          q.setFromAxisAngle(axisY, t);
          b.quaternion.multiply(q);
        }
      }
    },
    setHit(v) {
      if (this.uniforms) this.uniforms.uHit.value = v;
    },
    setCloak(v) {
      if (this.uniforms) this.uniforms.uCloak.value = v;
      for (const m of gearMeshes) m.visible = v < 0.5;
      if (weapon) weapon.visible = v < 0.5;
      hairMat.transparent = v > 0;
      hairMat.opacity = 1 - v * 0.9;
    },
    tick(t) {
      if (this.uniforms) this.uniforms.uTime.value = t;
    },
    dispose() {
      anim.dispose();
      model.traverse((o) => o.isSkinnedMesh && o.skeleton.dispose());
      mats.forEach((m) => m.dispose());
      weapon?.userData.mats.forEach((m) => m.dispose());
    },
  };
}

/**
 * Gear is authored in metres in the bone's local frame, but the UBC skeleton
 * carries a 0.01 / ×100 scale chain from its FBX origins on some bones —
 * compensate so a 0.3 m plate is 0.3 m in the world.
 */
function fixBoneSpace(model, objs) {
  model.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  const ms = new THREE.Vector3();
  model.getWorldScale(ms);
  for (const o of objs) {
    o.parent.getWorldScale(s);
    const k = ms.x / (s.x || 1);
    if (Math.abs(k - 1) > 0.01) {
      o.scale.multiplyScalar(k);
      o.position.multiplyScalar(k);
    }
  }
}
