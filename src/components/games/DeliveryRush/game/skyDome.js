/**
 * Delivery Rush — sky, sun, stars and clouds.
 *
 * The sky is a single inverted sphere with the zone's three sky colours baked
 * into its vertices: no shader, no texture, one draw call, and it reads exactly
 * as the gradient the district was designed around. On top of it sit a sun
 * disc with a soft halo (which is what sells the Sunset Coast light), drifting
 * cloud puffs, and — at night — a field of stars.
 *
 * Everything here is unlit and excluded from fog, so the horizon can be tinted
 * to match the fog colour and the world dissolves into it cleanly.
 */

import * as THREE from "three";
import { rgb, mix, shade } from "../world/palette.js";
import { MeshAcc } from "../world/geom.js";
import { makeRng } from "../utils/rng.js";

const RADIUS = 900;

/** The zone's sky gradient baked into a sphere's vertex colours. */
function gradientDome(zone, radius, segments = 28) {
  const p = zone.palette;
  const geo = new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.64));
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = rgb(p.skyTop);
  const mid = rgb(p.skyMid);
  const bot = rgb(p.skyBottom);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius; // -1 .. 1
    let c;
    if (y >= 0.28) c = mix(mid, top, Math.min(1, (y - 0.28) / 0.72));
    else if (y >= 0) c = mix(bot, mid, y / 0.28);
    else c = mix(bot, shade(bot, 0.82), Math.min(1, -y * 2));
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * A pre-filtered environment map generated from the district's own sky.
 *
 * Without one, every metallic material renders black — which is exactly what
 * shop windows, car glass and chrome are. Generating it from the sky gradient
 * (plus a warm blob where the sun is and the ground colour underneath) costs a
 * few milliseconds once per district and is what makes glass read as glass.
 */
export function buildEnvMap(renderer, zone, theme) {
  const p = zone.palette;
  const envScene = new THREE.Scene();
  const disposables = [];

  const geo = gradientDome(zone, 12, 16);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(geo, mat));
  disposables.push(geo, mat);

  // ground bounce
  const gGeo = new THREE.CircleGeometry(11.6, 20).rotateX(-Math.PI / 2);
  const gMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(...rgb(theme.snow ? "#dbe6f0" : p.ground)),
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.position.y = -1.2;
  envScene.add(ground);
  disposables.push(gGeo, gMat);

  if (!theme.night) {
    const sGeo = new THREE.SphereGeometry(1.5, 10, 8);
    const sMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb(p.sun)) });
    const sun = new THREE.Mesh(sGeo, sMat);
    sun.position.set(...p.sunPos).normalize().multiplyScalar(10);
    envScene.add(sun);
    disposables.push(sGeo, sMat);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02, 0.1, 40);
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  envScene.clear();
  return rt;
}

export function buildSky(zone, theme) {
  const p = zone.palette;
  const group = new THREE.Group();
  group.name = "sky";
  const disposables = [];

  /* ------------------------------------------------------------- gradient */

  const geo = gradientDome(zone, RADIUS, 28);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  group.add(dome);
  disposables.push(geo, mat);

  /* ------------------------------------------------------------------ sun */

  const sunDir = new THREE.Vector3(...p.sunPos).normalize();
  if (!theme.night) {
    const acc = new MeshAcc(256);
    const sunCol = rgb(p.sun);
    const at = sunDir.clone().multiplyScalar(RADIUS * 0.86);
    const low = p.sunPos[1] < 70; // a low sun gets a bigger, warmer halo
    acc.add("ico1", [at.x, at.y, at.z], [low ? 70 : 42, low ? 70 : 42, low ? 70 : 42], sunCol);
    const sunGeo = acc.build();
    const sunMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.renderOrder = -99;
    sun.frustumCulled = false;
    group.add(sun);
    disposables.push(sunGeo, sunMat);

    const haloGeo = new THREE.SphereGeometry(low ? 200 : 120, 16, 12);
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...mix(rgb(p.sun), rgb(p.skyMid), 0.35)),
      transparent: true,
      opacity: low ? 0.34 : 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.copy(at);
    halo.renderOrder = -98;
    halo.frustumCulled = false;
    group.add(halo);
    disposables.push(haloGeo, haloMat);
  }

  /* ---------------------------------------------------------------- stars */

  if (theme.night) {
    const rng = makeRng(zone.seed + 3);
    const n = 420;
    const arr = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const e = Math.acos(rng.range(0.06, 0.98));
      const r = RADIUS * 0.93;
      arr[i * 3] = Math.sin(e) * Math.cos(a) * r;
      arr[i * 3 + 1] = Math.cos(e) * r;
      arr[i * 3 + 2] = Math.sin(e) * Math.sin(a) * r;
      sizes[i] = rng.range(2, 7);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const sm = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 4.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    });
    const stars = new THREE.Points(sg, sm);
    stars.renderOrder = -97;
    stars.frustumCulled = false;
    group.add(stars);
    disposables.push(sg, sm);
  }

  /* --------------------------------------------------------------- clouds */

  const clouds = buildClouds(zone, theme);
  if (clouds) {
    group.add(clouds.mesh);
    disposables.push(...clouds.disposables);
  }

  return {
    group,
    sunDir,
    /** Keep the dome centred on the camera so it never runs out. */
    update(dt, camPos) {
      group.position.set(camPos.x, 0, camPos.z);
      if (clouds) clouds.update(dt);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}

/** Low-poly cloud puffs — a slow drifting layer that gives the sky scale. */
function buildClouds(zone, theme) {
  const p = zone.palette;
  const overcast = zone.timeOfDay === "overcast" || theme.snow;
  const count = theme.night ? 8 : overcast ? 20 : 14;
  if (count === 0) return null;

  const rng = makeRng(zone.seed + 11);
  const acc = new MeshAcc(4096);
  const base = theme.night
    ? mix(rgb(p.skyMid), rgb("#0d1424"), 0.45)
    : overcast
      ? mix(rgb(p.skyMid), rgb("#f0f4f8"), 0.35)
      : mix(rgb(p.skyBottom), rgb("#ffffff"), 0.55);

  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(220, 640);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = rng.range(overcast ? 95 : 130, overcast ? 150 : 230);
    const s = rng.range(0.8, 1.9);
    const puffs = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < puffs; k++) {
      const ox = rng.range(-1, 1) * 42 * s;
      const oz = rng.range(-1, 1) * 26 * s;
      const oy = rng.range(-0.2, 0.35) * 14 * s;
      const rr = rng.range(20, 40) * s;
      acc.add(
        "ico1",
        [cx + ox, cy + oy, cz + oz],
        [rr * 2, rr * 1.1, rr * 1.6],
        shade(base, rng.range(0.9, 1.08)),
        rng.range(0, 6.28),
      );
    }
  }

  const geo = acc.build();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: overcast ? 0.92 : 0.78,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -96;
  mesh.frustumCulled = false;
  return {
    mesh,
    disposables: [geo, mat],
    update(dt) {
      mesh.rotation.y += dt * 0.0035;
    },
  };
}
