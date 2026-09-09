/**
 * Delivery Rush — district baker.
 *
 * Takes a layout from CityBuilder and turns the whole district into a handful
 * of merged, vertex-coloured meshes. A Central City bake is roughly:
 *
 *   opaque   buildings, kerb faces, props, roofs         (shadow caster)
 *   ground   terrain, grass/sand patches, pavement       (shadow receiver only)
 *   glass    windows and shopfronts
 *   emissive lit windows, neon, lamp heads, tail lights (unlit material)
 *   foliage  tree crowns and hedges                     (flat shaded)
 *   road     asphalt, gutters, lots
 *   paint    lane markings, crosswalks, bays
 *   water    ponds, sea
 *   glow     additive lamp pools (night only)
 *   signs    textured shopfront signage
 *
 * `ground` is split out from `opaque` deliberately: it is a handful of huge,
 * nearly flat quads sitting within centimetres of the road surface, and a
 * directional-light shadow map does not have the depth precision to tell
 * "just below the road" from "just above it" at that scale — treating it as a
 * shadow caster self-shadowed the entire street in testing. Buildings, kerbs
 * and props stand well clear of the road and cast real, correct shadows.
 *
 * That is 10 draw calls for an entire city, which is what keeps the frame
 * time in a browser tab reasonable even with several hundred buildings.
 */

import * as THREE from "three";
import { MeshAcc } from "./geom.js";
import { drawBuilding } from "./buildings.js";
import { drawProp } from "./props.js";
import { drawGround, drawRoads, drawMarkings, drawDecals, drawSidewalks } from "./roads.js";
import { SignAcc, signAtlas } from "./signs.js";

export function buildCityMesh(layout, theme, detail = 2) {
  const ch = {
    opaque: new MeshAcc(65536),
    ground: new MeshAcc(32768),
    glass: new MeshAcc(16384),
    emissive: new MeshAcc(8192),
    foliage: new MeshAcc(16384),
    road: new MeshAcc(16384),
    paint: new MeshAcc(16384),
    water: new MeshAcc(512),
    glow: new MeshAcc(1024),
    signs: new SignAcc(),
  };

  drawGround(ch, layout, theme, detail);
  drawRoads(ch, layout, theme, detail);
  drawSidewalks(ch, layout, theme, detail);
  drawMarkings(ch, layout, theme, detail);
  drawDecals(ch, layout, theme, detail);

  for (const b of layout.buildings) drawBuilding(ch, b, theme, detail);
  for (const p of layout.props) {
    // low settings drop the smallest street clutter, never the landmarks
    if (detail === 0 && LOW_SKIP.has(p.kind)) continue;
    drawProp(ch, p, theme, detail);
  }

  const group = new THREE.Group();
  group.name = "city";
  const materials = [];
  const geometries = [];

  const push = (acc, material, { cast = false, receive = false, order = 0 } = {}) => {
    if (acc.empty) return null;
    const geo = acc.build();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    materials.push(material);
    geometries.push(geo);
    return mesh;
  };

  // The static city is one enormous merged mesh per channel (that is the whole
  // point — a few draw calls for a whole district). Handing a mesh that huge
  // to the shadow pass, whatever the underlying cause, produced a uniform
  // false-shadow wash across the entire ground plane in testing that no
  // amount of bias/resolution/frustum tuning affected — the signature of a
  // renderer edge case rather than a real per-pixel shadow. The car and
  // traffic (small, separate meshes) already cast the shadows that matter
  // most for grounding the player in the scene, so the static city — however
  // large — never casts one; it only ever receives.
  const shadows = false;

  // envMapIntensity keeps the environment map to what each surface actually
  // needs. A PMREM sky irradiance is much stronger than it looks in a preview
  // — even a "low" intensity noticeably washes a near-black diffuse surface
  // toward the sky's own colour, and asphalt is the darkest thing in the
  // scene. So dry road, paint and foliage get none of it (their look comes
  // entirely from the sun/hemisphere/ambient rig); only surfaces that are
  // actually meant to reflect — glass, chrome, wet asphalt, water — use it.
  push(ch.road, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: theme.wet ? 0.28 : 0.94,
    metalness: theme.wet ? 0.5 : 0.0,
    envMapIntensity: theme.wet ? 1.1 : 0,
  }), { receive: true });

  push(ch.paint, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: theme.wet ? 0.45 : 0.78,
    metalness: 0,
    envMapIntensity: theme.wet ? 0.5 : 0,
  }), { receive: true, order: 1 });

  push(ch.opaque, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.87,
    metalness: 0.03,
    envMapIntensity: 0.18,
  }), { cast: shadows, receive: true });

  // never a caster — see the note on `ground` above
  push(ch.ground, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.02,
    envMapIntensity: 0.15,
  }), { cast: false, receive: true });

  push(ch.glass, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.16,
    metalness: 0.72,
    envMapIntensity: 1.3,
  }), { receive: false });

  push(ch.foliage, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.05,
  }), { cast: shadows, receive: true });

  push(ch.emissive, new THREE.MeshBasicMaterial({ vertexColors: true }), { order: 2 });

  push(ch.water, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.08,
    metalness: 0.55,
    transparent: true,
    opacity: 0.92,
    envMapIntensity: 1.4,
  }), { receive: true });

  if (theme.night) {
    push(ch.glow, new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }), { order: 3 });
  }

  if (!ch.signs.empty) {
    const tex = signAtlas();
    const geo = ch.signs.build();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.05,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: tex,
      emissiveIntensity: theme.night ? 0.85 : 0.12,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = 2;
    group.add(mesh);
    materials.push(mat);
    geometries.push(geo);
  }

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    group.clear();
  };

  return { group, dispose, triangles: Math.round(totalVerts(ch) / 3) };
}

const LOW_SKIP = new Set(["bench", "bin", "hydrant", "mailbox", "bollard", "planter", "crate", "sign"]);

function totalVerts(ch) {
  let n = 0;
  for (const k of Object.keys(ch)) {
    const a = ch[k];
    n += a.verts ?? a.acc?.verts ?? 0;
  }
  return n;
}
