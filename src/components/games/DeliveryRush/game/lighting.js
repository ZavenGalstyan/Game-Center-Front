/**
 * Delivery Rush — lighting rig.
 *
 * Three lights for the whole district, whatever the weather: a hemisphere fill
 * that carries the sky/ground bounce, a low ambient so nothing goes black, and
 * one directional sun that casts every shadow in the game.
 *
 * The sun's shadow camera is small (a ~110 m box) and *follows the car*, which
 * is what makes crisp shadows affordable: the shadow map only ever covers the
 * street you are actually on. Night districts do not add point lights at all —
 * lit windows, signage and lamp heads are emissive geometry, and the pools of
 * light on the road are additive decals baked into the city mesh.
 */

import * as THREE from "three";

const SHADOW_SIZE = { low: 0, medium: 1024, high: 2048 };
const SHADOW_RANGE = { low: 0, medium: 78, high: 105 };

export function buildLights(zone, theme, quality = "high") {
  const p = zone.palette;
  const group = new THREE.Group();
  group.name = "lights";

  // HemisphereLight colours every upward-facing surface almost entirely with
  // its "sky" argument (normal.y = 1 -> full sky colour) — and roads, roofs
  // and sidewalks are most of what the camera sees. Feeding it the zone's
  // saturated sky-dome blue at near-full intensity recoloured the whole city;
  // desaturating that colour toward white and halving the intensity keeps the
  // outdoor "sky bounce" feel without tinting every road navy.
  const white = new THREE.Color(0xffffff);
  const skyFill = new THREE.Color(p.hemiSky).lerp(white, 0.55);
  const hemi = new THREE.HemisphereLight(
    skyFill,
    new THREE.Color(p.hemiGround),
    p.hemiIntensity * 0.5,
  );
  group.add(hemi);

  const ambientColor = new THREE.Color(p.hemiSky).lerp(white, 0.7);
  const ambient = new THREE.AmbientLight(ambientColor, p.ambient);
  group.add(ambient);

  const sun = new THREE.DirectionalLight(new THREE.Color(p.sun), p.sunIntensity);
  const dir = new THREE.Vector3(...p.sunPos).normalize();
  sun.position.copy(dir).multiplyScalar(160);
  group.add(sun);
  group.add(sun.target);

  const mapSize = SHADOW_SIZE[quality] ?? 1024;
  const range = SHADOW_RANGE[quality] ?? 78;
  if (mapSize > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(mapSize, mapSize);
    const c = sun.shadow.camera;
    c.left = -range;
    c.right = range;
    c.top = range;
    c.bottom = -range;
    c.near = 20;
    c.far = 420;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.035;
  }

  // a dim bounce from the opposite side stops unlit facades reading as flat —
  // toned toward neutral for the same reason as the hemisphere fill above
  const fillColor = new THREE.Color(p.hemiSky).lerp(new THREE.Color(p.hemiGround), 0.4).lerp(white, 0.35);
  const fill = new THREE.DirectionalLight(fillColor, theme.night ? 0.22 : 0.24);
  fill.position.set(-dir.x * 90, 60, -dir.z * 90);
  group.add(fill);

  const offset = dir.clone().multiplyScalar(150);

  return {
    group,
    sun,
    hemi,
    ambient,
    /** Keep the shadow frustum centred a little ahead of the car. */
    update(target) {
      sun.target.position.set(target.x, 0, target.z);
      sun.target.updateMatrixWorld();
      sun.position.set(target.x + offset.x, offset.y, target.z + offset.z);
      fill.position.set(target.x - offset.x * 0.6, 70, target.z - offset.z * 0.6);
    },
    dispose() {
      sun.dispose?.();
      sun.shadow?.map?.dispose?.();
      group.clear();
    },
  };
}

/** Fog matched to the zone; the sky's horizon band uses the same colour. */
export function buildFog(zone, quality = "high") {
  const p = zone.palette;
  const scale = quality === "low" ? 0.72 : quality === "medium" ? 0.88 : 1;
  return new THREE.Fog(new THREE.Color(p.fog), p.fogNear * scale, p.fogFar * scale);
}
