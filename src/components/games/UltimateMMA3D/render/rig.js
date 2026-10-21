/**
 * A renderable fighter: a clone of the CC0 Superhero_Male rig dressed for MMA.
 *
 *  • Skin: light or dark albedo texture, tinted per fighter; PBR roughness from
 *    the asset, lowered by a `sweat` uniform as the fight goes on (wet sheen).
 *  • Shorts: the asset's grey underwear islands (mask in the R channel of the
 *    metal/rough texture) are recoloured in the shader with the fighter's
 *    shorts colour + a waistband / side-stripe accent.
 *  • Damage: a `bruise` uniform reddens the face UV island (head damage).
 *  • 4 oz MMA gloves: padded knuckle shell + wrist wrap parented to each hand
 *    bone; fingers are curled into a fist once (no clip animates fingers).
 *  • Hair: static meshes from the pack, re-parented to the Head bone.
 *
 * Proportions per fighter: overall scale (height) and a mild girth scale.
 */
import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";

const HAIRS = ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard", "Hair_Long"];

function skinMaterial(src, look, darkTex) {
  const m = src.clone();
  if (look.skinTex === "dark" && darkTex) m.map = darkTex;
  m.color = new THREE.Color(look.skinTint || "#ffffff");
  m.metalness = 1; // metalnessMap.b is 0 everywhere → dielectric
  m.roughness = 1;
  m.envMapIntensity = 0.55;
  const u = {
    uShorts: { value: new THREE.Color(look.shorts || "#b3141e") },
    uAccent: { value: new THREE.Color(look.accent || "#f2f2f2") },
    uSweat: { value: 0 },
    uBruise: { value: 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uShorts; uniform vec3 uAccent; uniform float uSweat; uniform float uBruise; float mmaMask = 0.0;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
#ifdef USE_METALNESSMAP
  mmaMask = smoothstep(0.25, 0.75, texture2D( metalnessMap, vMetalnessMapUv ).r);
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec2 suv = vMetalnessMapUv;
  float band = step(0.5, fract(suv.y * 9.0 + suv.x * 0.0)) * 0.0;
  vec3 shorts = uShorts * (0.55 + 1.1 * lum);
  // accent stripe along island edges (waistband / side panels)
  float edge = 1.0 - smoothstep(0.55, 0.95, texture2D( metalnessMap, vMetalnessMapUv + vec2(0.0, 0.012) ).r * texture2D( metalnessMap, vMetalnessMapUv - vec2(0.0, 0.012) ).r);
  shorts = mix(shorts, uAccent * (0.6 + 0.8 * lum), edge * 0.85 + band);
  diffuseColor.rgb = mix(diffuseColor.rgb, shorts, mmaMask);
  // bruising on the face island (upper-left of the atlas)
  float face = smoothstep(0.02, 0.0, abs(vMapUv.x - 0.23) - 0.17) * smoothstep(0.02, 0.0, abs(vMapUv.y - 0.2) - 0.15);
  float blotch = 0.5 + 0.5 * sin(vMapUv.x * 61.0) * sin(vMapUv.y * 47.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 0.62, 0.62), uBruise * face * (0.45 + 0.55 * blotch) * (1.0 - mmaMask));
#endif`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, mix(roughnessFactor * 0.5, 0.82, mmaMask), uSweat);
  roughnessFactor = mix(roughnessFactor, 0.85, mmaMask * (1.0 - uSweat));`
      );
  };
  m.customProgramCacheKey = () => "mma-skin";
  return m;
}

/** Rounded MMA glove geometry (local to the hand bone: +Y runs along the fingers). */
let gloveGeo = null;
function gloveGeometries() {
  if (gloveGeo) return gloveGeo;
  // padded fist: a squashed capsule-ish lathe, knuckle pad thicker on top
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    prof.push(new THREE.Vector2(Math.sin(a) * 0.058 + 0.004, -Math.cos(a) * 0.075));
  }
  const fist = new THREE.LatheGeometry(prof, 18);
  fist.scale(1.12, 1, 0.82);
  fist.translate(0, 0.085, 0.004);
  const cuff = new THREE.CylinderGeometry(0.047, 0.05, 0.075, 18, 1, true);
  cuff.translate(0, 0.012, 0);
  const strap = new THREE.CylinderGeometry(0.052, 0.053, 0.026, 18);
  strap.translate(0, 0.022, 0);
  gloveGeo = { fist, cuff, strap };
  return gloveGeo;
}

function addGloves(B, look) {
  const g = gloveGeometries();
  const leather = new THREE.MeshStandardMaterial({ color: look.gloves || "#1a1a1a", roughness: 0.42, metalness: 0, envMapIntensity: 0.9 });
  const wrap = new THREE.MeshStandardMaterial({ color: look.gloveTrim || "#d8d8d8", roughness: 0.7 });
  const out = [];
  for (const side of ["l", "r"]) {
    const hand = B[`hand_${side}`];
    const grp = new THREE.Group();
    grp.name = `glove_${side}`;
    const fist = new THREE.Mesh(g.fist, leather);
    const cuff = new THREE.Mesh(g.cuff, leather);
    const strap = new THREE.Mesh(g.strap, wrap);
    for (const m of [fist, cuff, strap]) {
      m.castShadow = true;
      grp.add(m);
    }
    hand.add(grp);
    out.push(grp);
  }
  return { groups: out, materials: [leather, wrap] };
}

/** Curl the fingers into a fist (fingers are never animated by clips). */
function makeFists(B) {
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  for (const side of ["l", "r"]) {
    for (const f of ["index", "middle", "ring", "pinky"])
      for (let j = 1; j <= 3; j++) {
        const b = B[`${f}_0${j}_${side}`];
        if (b) b.quaternion.multiply(q.setFromAxisAngle(ax, j === 1 ? 1.25 : 1.45));
      }
    for (let j = 1; j <= 3; j++) {
      const b = B[`thumb_0${j}_${side}`];
      if (b) b.quaternion.multiply(q.setFromAxisAngle(new THREE.Vector3(0, 0, side === "l" ? 1 : -1), 0.45));
    }
  }
}

/**
 * Build a fighter rig.
 * look = { skinTex: 'light'|'dark', skinTint, shorts, accent, gloves, gloveTrim,
 *          hair: 'Hair_Buzzed'|…|null, beard: bool, hairColor, scale, girth }
 */
export function createRig(assets, look = {}) {
  const root = new THREE.Group();
  const model = skClone(assets.fighter.scene);
  root.add(model);
  const B = {};
  let skinned = null;
  const mats = [];
  model.traverse((o) => {
    if (o.isBone) B[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  model.updateMatrixWorld(true);
  const headRest = B.Head.matrixWorld.clone();
  const headInv = headRest.clone().invert();

  const hairMat = new THREE.MeshStandardMaterial({ color: look.hairColor || "#2a1b10", roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  const meshes = [];
  model.traverse((o) => o.isMesh && meshes.push(o));
  for (const o of meshes) {
    const mn = o.material.name;
    if (HAIRS.includes(o.name)) {
      const want = o.name === look.hair || (o.name === "Hair_Beard" && look.beard);
      if (!want) {
        o.parent.remove(o);
        continue;
      }
      o.material = hairMat;
      // origin-at-0 mesh → parent to the head bone, keeping its rest placement
      o.matrix.copy(headInv).multiply(o.matrixWorld);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
      B.Head.add(o);
      continue;
    }
    if (o.isSkinnedMesh && mn === "Skin") {
      o.material = skinMaterial(o.material, look, assets.darkTex);
      skinned = o;
      mats.push(o.material);
    } else if (mn === "Hair") {
      o.material = hairMat; // brows
    } else {
      o.material = o.material.clone();
      mats.push(o.material);
    }
  }
  makeFists(B);
  const gloves = addGloves(B, look);
  const s = look.scale || 1;
  const g = look.girth || 1;
  model.scale.set(s * g, s, s * g);
  return {
    root,
    model,
    bones: B,
    skinned,
    skinUniforms: skinned?.material.userData.u,
    setSweat(v) {
      if (this.skinUniforms) this.skinUniforms.uSweat.value = v;
    },
    setBruise(v) {
      if (this.skinUniforms) this.skinUniforms.uBruise.value = v;
    },
    dispose() {
      root.traverse((o) => {
        if (o.isSkinnedMesh) o.skeleton.dispose(); // per-clone bone texture
        if (o.isMesh && o.material) {
          // geometries are shared with the cached asset → only per-rig materials
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      hairMat.dispose();
      gloves.materials.forEach((m) => m.dispose());
    },
  };
}
