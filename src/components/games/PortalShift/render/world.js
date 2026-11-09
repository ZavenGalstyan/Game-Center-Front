/**
 * Portal Shift — Three.js renderer. Builds a chamber's voxel shell once per
 * level (faces merged per material), then each frame mirrors the simulation:
 * camera, portals, cubes, doors, plates, buttons, beams, platforms.
 *
 * Portals are see-through: each open, visible portal renders the view out of
 * its partner into a half-resolution target (virtual camera = portal matrix ×
 * main camera, with an oblique near plane on the partner's surface so walls
 * behind it never show). "Low" portal quality skips that and draws an energy
 * swirl instead. The portal device is drawn in its own pass so it never
 * clips into walls. No shadows; geometry and materials are shared and
 * everything is disposed on level change / unmount.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CELL, EMPTY, WHITE, GLASS, GOO, SECTORS, SIGNAL_COLORS, BEAM_H, PLAYER, isSolidValue } from "../engine/constants.js";
import { FACES, portalMatrix, cross } from "../engine/portalMath.js";
import {
  whitePanelTexture, metalPanelTexture, floorTexture, whiteFloorTexture, ceilingTexture, cubeTextures, glowTexture, stripeTexture,
} from "./textures.js";

const PORTAL_RGB = { blue: new THREE.Color(0x2b8cff), orange: new THREE.Color(0xff8a1c) };
const FACE_LIST = ["px", "nx", "py", "ny", "pz", "nz"];
const BEAM_COL = new THREE.Color(0xff2d55);

const PORTAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const PORTAL_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uHasView;
uniform vec2 uRes;
uniform vec3 uColor;
uniform float uTime;
uniform float uOpen;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float sw = sin(a * 5.0 + r * 9.0 - uTime * 2.6) * 0.5 + 0.5;
  float sw2 = sin(a * 3.0 - r * 14.0 + uTime * 1.7) * 0.5 + 0.5;
  vec3 swirl = uColor * (0.25 + 1.2 * sw * r + 0.5 * sw2 * (1.0 - r));
  float edge = smoothstep(0.72, 1.0, r);
  vec3 col;
  if (uHasView > 0.5) {
    vec3 view = texture2D(uTex, gl_FragCoord.xy / uRes).rgb;
    col = mix(view, uColor * 2.2, edge * 0.9);
    col += uColor * 0.25 * (1.0 - uOpen);
  } else {
    col = swirl + uColor * edge * 1.6;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ring = exp(-pow((r - 0.7) * 9.0, 2.0));
  float halo = r > 0.7 ? exp(-pow((r - 0.7) * 5.0, 1.5)) * 0.4 : 0.0;
  float flick = 0.85 + 0.15 * sin(uTime * 9.0 + r * 20.0);
  float a = (ring + halo) * flick * uAlpha * smoothstep(1.0, 0.85, r);
  gl_FragColor = vec4(uColor * 1.6, a);
}`;
const GOO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
varying vec3 vPos;
float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vPos.xz * 0.9;
  float v = n(p + vec2(uTime * 0.35, uTime * 0.2)) * 0.6 + n(p * 2.3 - vec2(uTime * 0.25, -uTime * 0.4)) * 0.4;
  float caustic = pow(1.0 - abs(v - 0.5) * 2.0, 6.0);
  vec3 col = uColor * (0.35 + v * 0.55) + vec3(1.0) * caustic * 0.35 + uColor * caustic * 0.8;
  gl_FragColor = vec4(col, 0.94);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const GOO_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
uniform float uTime;
void main() {
  vUv = uv;
  vec3 p = position;
  p.y += sin(p.x * 1.7 + uTime * 1.3) * 0.03 + cos(p.z * 1.3 + uTime) * 0.03;
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export function createWorld(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.className = "ps-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.05, 140);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  let pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x1a1f28, 0.9);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(ambient);

  /* ---------------------------------------------------------------- shared resources */
  const disposables = [];
  const track = (o) => (disposables.push(o), o);
  const glowTex = track(glowTexture());
  const stripeTex = track(stripeTexture());
  const cubeTex = { cube: cubeTextures("cube"), reflector: cubeTextures("reflector") };
  for (const k in cubeTex) track(cubeTex[k].map), track(cubeTex[k].emissive);

  const MAT = {
    wall: track(new THREE.MeshStandardMaterial({ map: track(metalPanelTexture()), vertexColors: true, roughness: 0.55, metalness: 0.65, envMapIntensity: 0.55 })),
    floor: track(new THREE.MeshStandardMaterial({ map: track(floorTexture()), vertexColors: true, roughness: 0.6, metalness: 0.55, envMapIntensity: 0.45 })),
    ceil: track(new THREE.MeshStandardMaterial({ map: track(ceilingTexture()), vertexColors: true, roughness: 0.8, metalness: 0.3, envMapIntensity: 0.3 })),
    wwall: track(new THREE.MeshStandardMaterial({ map: track(whitePanelTexture()), vertexColors: true, roughness: 0.42, metalness: 0.05, envMapIntensity: 0.6 })),
    wfloor: track(new THREE.MeshStandardMaterial({ map: track(whiteFloorTexture()), vertexColors: true, roughness: 0.45, metalness: 0.05, envMapIntensity: 0.5 })),
    glass: track(new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 })),
    strip: track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })),
    lamp: track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })),
    hazard: track(new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, metalness: 0.3 })),
    dark: track(new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.5, metalness: 0.7 })),
    steel: track(new THREE.MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.35, metalness: 0.85 })),
    plat: track(new THREE.MeshStandardMaterial({ color: 0x4a5160, roughness: 0.45, metalness: 0.8 })),
    door: track(new THREE.MeshStandardMaterial({ color: 0x59606d, roughness: 0.4, metalness: 0.75, emissive: 0x000000 })),
  };
  const G = {
    box: track(new THREE.BoxGeometry(1, 1, 1)),
    cyl: track(new THREE.CylinderGeometry(1, 1, 1, 20)),
    beam: track(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true)),
    torus: track(new THREE.TorusGeometry(1, 0.06, 10, 72)),
    disc: track(new THREE.CircleGeometry(1, 64)),
    plane: track(new THREE.PlaneGeometry(1, 1)),
    ring: track(new THREE.RingGeometry(0.8, 1, 48)),
    sphere: track(new THREE.SphereGeometry(1, 16, 12)),
    cube: track(new THREE.BoxGeometry(0.8, 0.8, 0.8)),
  };

  /* ---------------------------------------------------------------- portals (persistent) */
  const rtSize = new THREE.Vector2(256, 256);
  const portalRT = {
    blue: track(new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace })),
    orange: track(new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace })),
  };
  const virtualCam = new THREE.PerspectiveCamera();
  const portals = {};
  for (const color of ["blue", "orange"]) {
    const g = new THREE.Group();
    const col = PORTAL_RGB[color];
    const surfMat = track(new THREE.ShaderMaterial({
      uniforms: { uTex: { value: portalRT[color].texture }, uHasView: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uColor: { value: col.clone() }, uTime: { value: 0 }, uOpen: { value: 0 } },
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
    }));
    const surf = new THREE.Mesh(G.disc, surfMat);
    surf.scale.set(0.64, 0.92, 1);
    const glowMat = track(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col.clone() }, uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: PORTAL_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const glow = new THREE.Mesh(G.plane, glowMat);
    glow.scale.set(1.9, 2.55, 1);
    glow.position.z = 0.012;
    const rimMat = track(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2), toneMapped: false }));
    const rim = new THREE.Mesh(G.torus, rimMat);
    rim.scale.set(0.66, 0.94, 0.6);
    rim.position.z = 0.02;
    // orbiting sparks
    const N = 48;
    const pg = track(new THREE.BufferGeometry());
    const seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) seeds[i] = Math.random();
    pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const pm = track(new THREE.PointsMaterial({ map: glowTex, color: col.clone().multiplyScalar(1.8), size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const sparks = new THREE.Points(pg, pm);
    sparks.position.z = 0.04;
    const light = new THREE.PointLight(col, 3, 7, 1.6);
    light.position.z = 0.6;
    g.add(surf, glow, rim, sparks, light);
    g.visible = false;
    scene.add(g);
    portals[color] = { g, surf, surfMat, glowMat, rim, sparks, seeds, light, key: "", open: 0 };
  }

  /* ---------------------------------------------------------------- portal device (separate pass) */
  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.4));
  const vmKey = new THREE.DirectionalLight(0xffffff, 1.6);
  vmKey.position.set(1, 2, 1);
  vmScene.add(vmKey);
  vmScene.environment = envTex;
  const device = new THREE.Group();
  const shellMat = track(new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.35, metalness: 0.2 }));
  const coreMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const blueMat = track(new THREE.MeshBasicMaterial({ color: PORTAL_RGB.blue.clone().multiplyScalar(1.6), toneMapped: false }));
  const orangeMat = track(new THREE.MeshBasicMaterial({ color: PORTAL_RGB.orange.clone().multiplyScalar(1.6), toneMapped: false }));
  {
    const capsule = track(new THREE.CapsuleGeometry(0.05, 0.3, 6, 16));
    const body = new THREE.Mesh(capsule, shellMat);
    body.rotation.x = Math.PI / 2;
    const grip = new THREE.Mesh(G.box, MAT.dark);
    grip.scale.set(0.07, 0.16, 0.08);
    grip.position.set(0, -0.1, 0.1);
    grip.rotation.x = 0.35;
    const barrel = new THREE.Mesh(G.cyl, MAT.dark);
    barrel.scale.set(0.045, 0.16, 0.045);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.0, -0.27);
    const tip = new THREE.Mesh(G.torus, coreMat);
    tip.scale.set(0.06, 0.06, 0.4);
    tip.position.set(0, 0, -0.355);
    const coilA = new THREE.Mesh(G.torus, blueMat);
    coilA.scale.set(0.056, 0.056, 0.35);
    coilA.position.set(0, 0, -0.1);
    const coilB = new THREE.Mesh(G.torus, orangeMat);
    coilB.scale.set(0.056, 0.056, 0.35);
    coilB.position.set(0, 0, -0.03);
    const fin = new THREE.Mesh(G.box, MAT.steel);
    fin.scale.set(0.02, 0.06, 0.22);
    fin.position.set(0, 0.07, 0.02);
    device.add(body, grip, barrel, tip, coilA, coilB, fin);
    device.userData = { tip, coilA, coilB };
  }
  device.scale.setScalar(0.5);
  device.position.set(0.24, -0.2, -0.5);
  device.rotation.set(0.04, 0.08, 0);
  vmScene.add(device);
  const deviceState = { recoil: 0, color: new THREE.Color(0xffffff), bob: 0, flash: 0 };

  /* ---------------------------------------------------------------- per-level content */
  let levelGroup = null;
  let levelDisposables = [];
  const ltrack = (o) => (levelDisposables.push(o), o);
  let L = null;
  let dyn = null;
  let gooMat = null;
  let dust = null;
  const beamPool = [];
  const beamGlowMat = track(new THREE.MeshBasicMaterial({ color: BEAM_COL.clone().multiplyScalar(0.9), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const beamCoreMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0dc).multiplyScalar(1.8), toneMapped: false }));
  const sparkMat = track(new THREE.SpriteMaterial({ map: glowTex, color: BEAM_COL.clone().multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const fxPool = [];

  function signalColor(id) {
    const n = dyn?.signalIndex.get(id);
    return new THREE.Color(SIGNAL_COLORS[(n ?? 0) % SIGNAL_COLORS.length]);
  }

  function clearLevel() {
    if (levelGroup) scene.remove(levelGroup);
    levelDisposables.forEach((d) => d.dispose());
    levelDisposables = [];
    levelGroup = null;
    dyn = null;
    for (const b of beamPool) {
      b.core.visible = b.glow.visible = b.spark.visible = false;
    }
  }

  function setLevel(level) {
    clearLevel();
    L = level;
    const sec = SECTORS[level.sector] || SECTORS[0];
    scene.background = new THREE.Color(sec.fog);
    scene.fog = new THREE.FogExp2(sec.fog, 0.022);
    hemi.color.set(sec.light);
    hemi.groundColor.set(sec.fog).multiplyScalar(1.6);
    MAT.strip.color.set(sec.accent).multiplyScalar(1.5);
    MAT.lamp.color.set(sec.light).multiplyScalar(1.25);
    levelGroup = new THREE.Group();
    scene.add(levelGroup);
    const { nx, ny, nz, grid } = level;
    const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? 1 : grid[i + nx * (j + ny * k)]);

    /* ---- shell ---- */
    const buckets = { wall: [], floor: [], ceil: [], wwall: [], wfloor: [], glass: [], strip: [], lamp: [], hazard: [] };
    const pushQuad = (arr, c, r, u, hw, hh, shade = [1, 1, 1, 1]) => {
      const v = [
        [c[0] - r[0] * hw - u[0] * hh, c[1] - r[1] * hw - u[1] * hh, c[2] - r[2] * hw - u[2] * hh],
        [c[0] + r[0] * hw - u[0] * hh, c[1] + r[1] * hw - u[1] * hh, c[2] + r[2] * hw - u[2] * hh],
        [c[0] + r[0] * hw + u[0] * hh, c[1] + r[1] * hw + u[1] * hh, c[2] + r[2] * hw + u[2] * hh],
        [c[0] - r[0] * hw + u[0] * hh, c[1] - r[1] * hw + u[1] * hh, c[2] - r[2] * hw + u[2] * hh],
      ];
      arr.push({ v, shade });
    };
    const hash = (i, j, k, f) => {
      let h = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791) ^ (f * 2654435761);
      h = (h ^ (h >>> 13)) >>> 0;
      return (h % 1000) / 1000;
    };
    const lampSpots = [];
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const v = at(i, j, k);
          if (!isSolidValue(v)) continue;
          FACE_LIST.forEach((fn, fi) => {
            const n = FACES[fn];
            const nb = at(i + n[0], j + n[1], k + n[2]);
            const open = nb === EMPTY || nb === GOO || (nb === GLASS && v !== GLASS);
            if (!open) return;
            const c = [i * CELL + 1 + n[0], j * CELL + 1 + n[1], k * CELL + 1 + n[2]];
            const up = n[1] === 0 ? [0, 1, 0] : n[1] > 0 ? [0, 0, -1] : [0, 0, 1];
            const r = cross(up, n);
            if (v === GLASS) {
              if (nb !== GLASS) pushQuad(buckets.glass, c, r, up, 1, 1);
              return;
            }
            const white = v === WHITE;
            const tint = 0.93 + hash(i, j, k, fi) * 0.07;
            if (n[1] === 0) {
              const floorBelow = isSolidValue(at(i + n[0], j - 1, k + n[2]));
              const bottom = floorBelow ? 0.72 : 0.9;
              pushQuad(white ? buckets.wwall : buckets.wall, c, r, up, 1, 1, [bottom * tint, bottom * tint, tint, tint]);
              if (floorBelow && !white && nb !== GOO) {
                const sc = [c[0] + n[0] * 0.012, j * CELL + 0.16, c[2] + n[2] * 0.012];
                pushQuad(buckets.strip, sc, r, up, 0.96, 0.025);
              }
              if (nb === GOO) {
                const sc = [c[0] + n[0] * 0.01, j * CELL + 0.65, c[2] + n[2] * 0.01];
                pushQuad(buckets.hazard, sc, r, up, 1, 0.1);
              }
            } else if (n[1] > 0) {
              pushQuad(white ? buckets.wfloor : buckets.floor, c, r, up, 1, 1, [tint, tint, tint, tint]);
            } else {
              pushQuad(white ? buckets.wwall : buckets.ceil, c, r, up, 1, 1, [0.85 * tint, 0.85 * tint, 0.85 * tint, 0.85 * tint]);
              const fi2 = i + n[0], fk = k + n[2];
              if (!white && (fi2 + fk) % 2 === 0) {
                pushQuad(buckets.lamp, [c[0], c[1] - 0.012, c[2]], r, up, 0.55, 0.55);
                lampSpots.push([c[0], c[1] - 0.6, c[2]]);
              }
            }
          });
        }
    const buildMesh = (quads, mat) => {
      if (!quads.length) return;
      const pos = new Float32Array(quads.length * 12);
      const nor = new Float32Array(quads.length * 12);
      const uv = new Float32Array(quads.length * 8);
      const col = new Float32Array(quads.length * 12);
      const idx = [];
      quads.forEach((q, n) => {
        const [a, b, c] = q.v;
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const nn = cross(e1, e2);
        const ln = Math.hypot(...nn) || 1;
        for (let m = 0; m < 4; m++) {
          pos.set(q.v[m], n * 12 + m * 3);
          nor.set([nn[0] / ln, nn[1] / ln, nn[2] / ln], n * 12 + m * 3);
          col.set([q.shade[m], q.shade[m], q.shade[m]], n * 12 + m * 3);
        }
        uv.set([0, 0, 1, 0, 1, 1, 0, 1], n * 8);
        const o = n * 4;
        idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
      });
      const g = ltrack(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false;
      levelGroup.add(m);
      return m;
    };
    buildMesh(buckets.wall, MAT.wall);
    buildMesh(buckets.floor, MAT.floor);
    buildMesh(buckets.ceil, MAT.ceil);
    buildMesh(buckets.wwall, MAT.wwall);
    buildMesh(buckets.wfloor, MAT.wfloor);
    buildMesh(buckets.strip, MAT.strip);
    buildMesh(buckets.lamp, MAT.lamp);
    buildMesh(buckets.hazard, MAT.hazard);
    const gl = buildMesh(buckets.glass, MAT.glass);
    if (gl) gl.renderOrder = 5;

    /* ---- lights: spread over the ceiling lamps ---- */
    const chosen = [];
    lampSpots.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
    for (const s of lampSpots) {
      if (chosen.length >= 6) break;
      if (chosen.every((c) => Math.hypot(c[0] - s[0], c[1] - s[1], c[2] - s[2]) > 7.5)) chosen.push(s);
    }
    if (!chosen.length) chosen.push([level.spawn.pos[0], level.spawn.pos[1] + 3, level.spawn.pos[2]]);
    for (const s of chosen) {
      const pl = new THREE.PointLight(sec.light, 26, 22, 1.5);
      pl.position.set(...s);
      levelGroup.add(pl);
    }

    /* ---- goo ---- */
    const gooQuads = [];
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++)
          if (at(i, j, k) === GOO && at(i, j + 1, k) !== GOO) pushQuad(gooQuads, [i * CELL + 1, j * CELL + 0.4, k * CELL + 1], [1, 0, 0], [0, 0, -1], 1, 1);
    gooMat = null;
    if (gooQuads.length) {
      gooMat = ltrack(new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(sec.goo) }, uTime: { value: 0 } },
        vertexShader: GOO_VERT,
        fragmentShader: GOO_FRAG,
        transparent: true,
        fog: false,
      }));
      buildMesh(gooQuads, gooMat);
      const gl2 = new THREE.PointLight(sec.goo, 6, 9, 1.4);
      const g0 = gooQuads[Math.floor(gooQuads.length / 2)].v[0];
      gl2.position.set(g0[0], g0[1] + 0.8, g0[2]);
      levelGroup.add(gl2);
    }

    /* ---- dust motes ---- */
    {
      const N = 260;
      const pos = new Float32Array(N * 3);
      const empties = [];
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (at(i, j, k) === EMPTY) empties.push([i, j, k]);
      for (let n = 0; n < N; n++) {
        const e = empties[(n * 7919) % empties.length];
        pos[n * 3] = e[0] * CELL + Math.random() * CELL;
        pos[n * 3 + 1] = e[1] * CELL + Math.random() * CELL;
        pos[n * 3 + 2] = e[2] * CELL + Math.random() * CELL;
      }
      const g = ltrack(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const m = ltrack(new THREE.PointsMaterial({ map: glowTex, color: new THREE.Color(sec.accent2).multiplyScalar(0.7), size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      dust = new THREE.Points(g, m);
      dust.userData.base = pos.slice();
      levelGroup.add(dust);
    }

    buildDevices(level, sec);
  }

  /* ---------------------------------------------------------------- devices */
  function buildDevices(level, sec) {
    const signalIndex = new Map();
    [...level.plates, ...level.switches, ...level.receivers].forEach((d, n) => signalIndex.set(d.id, n));
    dyn = { signalIndex, cubes: [], plates: [], doors: [], switches: [], receivers: [], emitters: [], platforms: [], exit: null, checkpoints: [] };
    const add = (o) => (levelGroup.add(o), o);
    const basic = (color, mul = 1.6) => ltrack(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(mul), toneMapped: false }));

    // cubes
    for (const c of level.cubes) {
      const kind = c.kind || "cube";
      const mat = ltrack(new THREE.MeshStandardMaterial({
        map: cubeTex[kind].map,
        emissiveMap: cubeTex[kind].emissive,
        emissive: new THREE.Color(kind === "reflector" ? 0xff5577 : sec.accent),
        emissiveIntensity: 1.4,
        roughness: 0.4,
        metalness: 0.6,
      }));
      const g = new THREE.Group();
      const m = new THREE.Mesh(G.cube, mat);
      m.position.y = 0.4;
      g.add(m);
      let lens = null;
      if (kind === "reflector") {
        lens = new THREE.Mesh(G.cyl, basic(0xff4d6d, 1.2));
        lens.scale.set(0.2, 0.06, 0.2);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.4, -0.42);
        const pivot = new THREE.Group();
        pivot.add(lens);
        g.add(pivot);
        lens = pivot;
      }
      dyn.cubes.push({ g: add(g), mat, lens, kind });
    }

    // plates
    for (const p of level.plates) {
      const [i, j, k] = p.cell;
      const g = new THREE.Group();
      g.position.set(i * CELL + 1, j * CELL, k * CELL + 1);
      const base = new THREE.Mesh(G.cyl, MAT.dark);
      base.scale.set(0.82, 0.08, 0.82);
      base.position.y = 0.04;
      const top = new THREE.Mesh(G.cyl, MAT.steel);
      top.scale.set(0.64, 0.06, 0.64);
      top.position.y = 0.1;
      const ringMat = basic(signalColor(p.id), 0.5);
      const ring = new THREE.Mesh(G.ring, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(p.cubeOnly ? 0.6 : 0.76);
      ring.position.y = 0.085;
      g.add(base, top, ring);
      dyn.plates.push({ g: add(g), top, ringMat, color: signalColor(p.id) });
    }

    // doors (incl. exit)
    for (const d of level.doors) {
      const [i, j, k] = d.cell;
      const g = new THREE.Group();
      g.position.set(i * CELL + 1, j * CELL, k * CELL + 1);
      if (d.axis === 0) g.rotation.y = Math.PI / 2;
      const mat = ltrack(MAT.door.clone());
      const panel = new THREE.Mesh(G.box, mat);
      panel.scale.set(1.98, 1.98, 0.26);
      panel.position.y = 1;
      const stripeMat = basic(d.exit ? 0x3dff8b : sec.accent, 1.2);
      const stripe = new THREE.Mesh(G.box, stripeMat);
      stripe.scale.set(1.6 / 1.98, 0.06 / 1.98, 0.28 / 0.26);
      panel.add(stripe);
      // frame + input pips on both sides
      const frameMat = basic(d.exit ? 0x3dff8b : sec.accent, 1.0);
      for (const side of [-1, 1]) {
        for (const [x, y, w, h] of [[-0.97, 1, 0.06, 2], [0.97, 1, 0.06, 2], [0, 1.97, 2, 0.06]]) {
          const f = new THREE.Mesh(G.box, frameMat);
          f.scale.set(w, h, 0.04);
          f.position.set(x, y, side * 1.0);
          g.add(f);
        }
      }
      const pips = [];
      d.inputs.forEach((id, n) => {
        for (const side of [-1, 1]) {
          const m = new THREE.Mesh(G.sphere, basic(signalColor(id), 1));
          m.scale.setScalar(0.07);
          m.position.set((n - (d.inputs.length - 1) / 2) * 0.24, 1.82, side * 1.03);
          g.add(m);
          pips.push({ m, id, color: signalColor(id) });
        }
      });
      g.add(panel);
      dyn.doors.push({ g: add(g), panel, mat, pips, frameMat, exit: !!d.exit, d });
    }

    // exit marker
    {
      const [i, j, k] = level.exit.goal;
      const g = new THREE.Group();
      g.position.set(i * CELL + 1, j * CELL, k * CELL + 1);
      const ringMat = basic(0x3dff8b, 1.4);
      const ring = new THREE.Mesh(G.torus, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(0.7, 0.7, 0.8);
      ring.position.y = 0.04;
      const beamMat = ltrack(new THREE.MeshBasicMaterial({ color: 0x3dff8b, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      const beam = new THREE.Mesh(G.beam, beamMat);
      beam.scale.set(0.62, 1.95, 0.62);
      beam.position.y = 0.98;
      const light = new THREE.PointLight(0x3dff8b, 4, 6, 1.5);
      light.position.y = 1.2;
      g.add(ring, beam, light);
      dyn.exit = { g: add(g), ringMat, beamMat, light, ring };
    }

    // checkpoints
    for (const c of level.checkpoints) {
      const [i, j, k] = c.cell;
      const m = new THREE.Mesh(G.ring, basic(sec.accent, 0.6));
      m.rotation.x = -Math.PI / 2;
      m.scale.setScalar(0.85);
      m.position.set(i * CELL + 1, j * CELL + 0.02, k * CELL + 1);
      dyn.checkpoints.push(add(m));
    }

    // buttons
    for (const s of level.switches) {
      const g = new THREE.Group();
      g.position.set(...s.pos);
      const post = new THREE.Mesh(G.cyl, MAT.steel);
      post.scale.set(0.16, 0.9, 0.16);
      post.position.y = 0.45;
      const foot = new THREE.Mesh(G.cyl, MAT.dark);
      foot.scale.set(0.3, 0.08, 0.3);
      foot.position.y = 0.04;
      const head = new THREE.Mesh(G.cyl, MAT.dark);
      head.scale.set(0.26, 0.1, 0.26);
      head.position.y = 0.95;
      const col = signalColor(s.id);
      const btnMat = basic(col, 0.6);
      const btn = new THREE.Mesh(G.sphere, btnMat);
      btn.scale.set(0.14, 0.07, 0.14);
      btn.position.y = 1.02;
      const segs = [];
      const N = 20;
      for (let n = 0; n < N; n++) {
        const a = (n / N) * Math.PI * 2;
        const sm = basic(col, 1.4);
        const seg = new THREE.Mesh(G.box, sm);
        seg.scale.set(0.05, 0.02, 0.11);
        seg.position.set(Math.sin(a) * 0.42, 1.0, Math.cos(a) * 0.42);
        seg.rotation.y = a;
        g.add(seg);
        segs.push({ seg, sm });
      }
      g.add(post, foot, head, btn);
      dyn.switches.push({ g: add(g), btn, btnMat, segs, color: col });
    }

    // emitters & receivers
    const wallMount = (cell, face, h) => {
      const n = FACES[face];
      const p = new THREE.Vector3(cell[0] * CELL + 1 + n[0], cell[1] * CELL + 1 + n[1], cell[2] * CELL + 1 + n[2]);
      if (n[1] === 0) p.y = cell[1] * CELL + h;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n));
      return { p, q, n };
    };
    for (const e of level.emitters) {
      const { p, q } = wallMount(e.cell, e.face, BEAM_H);
      const g = new THREE.Group();
      g.position.copy(p);
      g.quaternion.copy(q);
      const housing = new THREE.Mesh(G.box, MAT.dark);
      housing.scale.set(0.7, 0.7, 0.22);
      housing.position.z = 0.11;
      const lens = new THREE.Mesh(G.cyl, basic(BEAM_COL, 1.8));
      lens.rotation.x = Math.PI / 2;
      lens.scale.set(0.16, 0.08, 0.16);
      lens.position.z = 0.24;
      const ring = new THREE.Mesh(G.torus, MAT.steel);
      ring.scale.set(0.24, 0.24, 1);
      ring.position.z = 0.23;
      g.add(housing, lens, ring);
      dyn.emitters.push(add(g));
    }
    for (const r of level.receivers) {
      const { p, q } = wallMount(r.cell, r.face, BEAM_H);
      const g = new THREE.Group();
      g.position.copy(p);
      g.quaternion.copy(q);
      const housing = new THREE.Mesh(G.box, MAT.dark);
      housing.scale.set(0.9, 0.9, 0.16);
      housing.position.z = 0.08;
      const col = signalColor(r.id);
      const ringMat = basic(col, 0.35);
      const ring = new THREE.Mesh(G.torus, ringMat);
      ring.scale.set(0.3, 0.3, 1.4);
      ring.position.z = 0.17;
      const coreMat2 = basic(col, 0.25);
      const core = new THREE.Mesh(G.sphere, coreMat2);
      core.scale.set(0.16, 0.16, 0.08);
      core.position.z = 0.17;
      g.add(housing, ring, core);
      dyn.receivers.push({ g: add(g), ringMat, coreMat: coreMat2, color: col });
    }

    // platforms
    for (const p of level.platforms) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(G.box, MAT.plat);
      body.scale.set(p.size[0], p.size[1], p.size[2]);
      body.position.y = p.size[1] / 2;
      const edgeMat = basic(sec.accent, 1.3);
      for (const [x, z, w, d] of [[0, p.size[2] / 2, p.size[0], 0.05], [0, -p.size[2] / 2, p.size[0], 0.05], [p.size[0] / 2, 0, 0.05, p.size[2]], [-p.size[0] / 2, 0, 0.05, p.size[2]]]) {
        const e = new THREE.Mesh(G.box, edgeMat);
        e.scale.set(w + 0.02, 0.06, d + 0.02);
        e.position.set(x, p.size[1] - 0.04, z);
        g.add(e);
      }
      const arrow = new THREE.Mesh(G.ring, edgeMat);
      arrow.rotation.x = -Math.PI / 2;
      arrow.scale.setScalar(0.35);
      arrow.position.y = p.size[1] + 0.005;
      g.add(body, arrow);
      dyn.platforms.push(add(g));
    }
  }

  /* ---------------------------------------------------------------- beams */
  function beam(n) {
    while (beamPool.length <= n) {
      const core = new THREE.Mesh(G.beam, beamCoreMat);
      const glow = new THREE.Mesh(G.beam, beamGlowMat);
      const spark = new THREE.Sprite(sparkMat);
      spark.scale.setScalar(0.5);
      core.frustumCulled = glow.frustumCulled = false;
      scene.add(core, glow, spark);
      beamPool.push({ core, glow, spark });
    }
    return beamPool[n];
  }
  const UP = new THREE.Vector3(0, 1, 0);
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  /* ---------------------------------------------------------------- fx bursts */
  function burst(point, color, size = 0.9) {
    let f = fxPool.find((x) => x.life <= 0);
    if (!f) {
      const mat = track(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }));
      f = { s: new THREE.Sprite(mat), mat, life: 0 };
      scene.add(f.s);
      fxPool.push(f);
    }
    f.s.position.set(...point);
    f.mat.color.copy(color).multiplyScalar(2);
    f.life = 1;
    f.size = size;
    f.s.visible = true;
  }

  /* ---------------------------------------------------------------- per frame */
  let time = 0;
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const M4 = new THREE.Matrix4();
  const clipPlane = new THREE.Plane();
  const clipV = new THREE.Vector4();
  const qv = new THREE.Vector4();
  const sphere = new THREE.Sphere();
  const size = new THREE.Vector2();
  let quality = "high";
  let lastPortalKey = { blue: "", orange: "" };

  function placePortalMesh(color, p, dt) {
    const P = portals[color];
    if (!p) {
      P.g.visible = false;
      P.key = "";
      return;
    }
    const key = `${p.idx}|${p.n.join()}|${p.up.join()}`;
    if (key !== P.key) {
      P.key = key;
      P.open = 0;
      const n = new THREE.Vector3(...p.n), up = new THREE.Vector3(...p.up), r = new THREE.Vector3().crossVectors(up, n);
      const m = new THREE.Matrix4().makeBasis(r, up, n);
      P.g.quaternion.setFromRotationMatrix(m);
      P.g.position.set(p.center[0] + p.n[0] * 0.015, p.center[1] + p.n[1] * 0.015, p.center[2] + p.n[2] * 0.015);
    }
    P.g.visible = true;
    P.open = Math.min(1, P.open + dt * 4);
    const e = 1 - Math.pow(1 - P.open, 3);
    const s = 0.08 + e * 0.92 + Math.sin(P.open * Math.PI) * 0.08;
    P.g.scale.set(s, s, 1);
    P.surfMat.uniforms.uTime.value = time;
    P.surfMat.uniforms.uOpen.value = e;
    P.glowMat.uniforms.uTime.value = time;
    // sparks orbit the rim
    const arr = P.sparks.geometry.attributes.position.array;
    for (let i = 0; i < P.seeds.length; i++) {
      const sd = P.seeds[i];
      const a = sd * Math.PI * 2 + time * (0.6 + sd * 1.4) * (i % 2 ? 1 : -1);
      const rr = 1 + Math.sin(time * 3 + sd * 20) * 0.04 + (i % 3) * 0.03;
      arr[i * 3] = Math.cos(a) * 0.66 * rr;
      arr[i * 3 + 1] = Math.sin(a) * 0.94 * rr;
      arr[i * 3 + 2] = ((i * 37) % 10) * 0.004;
    }
    P.sparks.geometry.attributes.position.needsUpdate = true;
  }

  function renderPortalView(color, sim) {
    const P = sim.portals[color], Q = sim.portals[color === "blue" ? "orange" : "blue"];
    const mesh = portals[color];
    mesh.surfMat.uniforms.uHasView.value = 0;
    if (!P || !Q || quality !== "high") return;
    // visible and facing us?
    const toCam = tmpV.set(camera.position.x - P.center[0], camera.position.y - P.center[1], camera.position.z - P.center[2]);
    if (toCam.dot(tmpV2.set(...P.n)) <= 0.0) return;
    sphere.center.set(...P.center);
    sphere.radius = 1.45;
    if (!frustum.intersectsSphere(sphere)) return;
    M4.fromArray(portalMatrix(P, Q));
    virtualCam.matrixWorld.multiplyMatrices(M4, camera.matrixWorld);
    virtualCam.matrixWorld.decompose(virtualCam.position, virtualCam.quaternion, virtualCam.scale);
    virtualCam.matrixWorldInverse.copy(virtualCam.matrixWorld).invert();
    virtualCam.projectionMatrix.copy(camera.projectionMatrix);
    // oblique near plane on the exit surface
    clipPlane.setFromNormalAndCoplanarPoint(tmpV.set(...Q.n), tmpV2.set(Q.center[0] - Q.n[0] * 0.01, Q.center[1] - Q.n[1] * 0.01, Q.center[2] - Q.n[2] * 0.01));
    clipPlane.applyMatrix4(virtualCam.matrixWorldInverse);
    clipV.set(clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.constant);
    const pm = virtualCam.projectionMatrix.elements;
    qv.x = (Math.sign(clipV.x) + pm[8]) / pm[0];
    qv.y = (Math.sign(clipV.y) + pm[9]) / pm[5];
    qv.z = -1;
    qv.w = (1 + pm[10]) / pm[14];
    clipV.multiplyScalar(2 / clipV.dot(qv));
    pm[2] = clipV.x;
    pm[6] = clipV.y;
    pm[10] = clipV.z + 1;
    pm[14] = clipV.w;
    virtualCam.projectionMatrixInverse.copy(virtualCam.projectionMatrix).invert();
    portals.blue.surf.visible = portals.orange.surf.visible = false;
    renderer.setRenderTarget(portalRT[color]);
    renderer.clear();
    renderer.render(scene, virtualCam);
    renderer.setRenderTarget(null);
    portals.blue.surf.visible = portals.orange.surf.visible = true;
    mesh.surfMat.uniforms.uHasView.value = 1;
  }

  function render(sim, dt, view = {}) {
    time += dt;
    if (!sim || !dyn) {
      renderer.render(scene, camera);
      return;
    }
    // camera
    const P = sim.player;
    const speed = Math.hypot(P.vel[0], P.vel[2]);
    deviceState.bob += dt * (P.wasGrounded ? speed * 1.9 : 0);
    const bobY = P.wasGrounded ? Math.sin(deviceState.bob) * 0.03 * Math.min(1, speed / 4) : 0;
    camera.position.set(P.pos[0], P.pos[1] + PLAYER.eye + bobY + (view.dip || 0), P.pos[2]);
    camera.rotation.set(sim.pitch, sim.yaw, 0);
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);

    // portals
    placePortalMesh("blue", sim.portals.blue, dt);
    placePortalMesh("orange", sim.portals.orange, dt);
    for (const c of ["blue", "orange"]) {
      const lk = sim.portals[c] ? `${sim.portals[c].idx}${sim.portals[c].n}` : "";
      if (lk !== lastPortalKey[c]) {
        lastPortalKey[c] = lk;
        if (sim.portals[c]) burst(sim.portals[c].center, PORTAL_RGB[c], 1.6);
      }
    }

    // cubes
    sim.cubes.forEach((c, n) => {
      const d = dyn.cubes[n];
      d.g.position.set(c.body.pos[0], c.body.pos[1], c.body.pos[2]);
      if (d.lens) d.lens.rotation.y = Math.atan2(-c.dir[0], -c.dir[2]);
      const held = sim.held === c;
      const pulse = 1.2 + Math.sin(time * 3 + n) * 0.25;
      d.mat.emissiveIntensity = c.powered ? 3.2 : held ? 2.0 : pulse;
    });
    // plates
    sim.plates.forEach((p, n) => {
      const d = dyn.plates[n];
      d.top.position.y = p.on ? 0.06 : 0.1;
      d.ringMat.color.copy(d.color).multiplyScalar(p.on ? 2.2 : 0.45);
    });
    // doors
    sim.doors.forEach((dd, n) => {
      const d = dyn.doors[n];
      d.panel.position.y = 1 + dd.open * 2;
      d.panel.visible = dd.open < 0.995;
      for (const pip of d.pips) pip.m.material.color.copy(pip.color).multiplyScalar(sim.active(pip.id) ? 2.4 : 0.25);
      if (d.exit) d.frameMat.color.set(dd.open > 0.99 ? 0x3dff8b : 0xff3b4d).multiplyScalar(1.3);
    });
    // exit marker
    {
      const open = sim.exitOpen();
      const col = open ? 0x3dff8b : 0xff3b4d;
      dyn.exit.ringMat.color.set(col).multiplyScalar(1.6);
      dyn.exit.beamMat.color.set(col);
      dyn.exit.beamMat.opacity = open ? 0.22 + Math.sin(time * 3) * 0.06 : 0.08;
      dyn.exit.light.color.set(col);
      dyn.exit.ring.rotation.z = time * 0.8;
    }
    dyn.checkpoints.forEach((m, n) => {
      m.material.color.set(n <= sim.checkpoint ? 0x3dff8b : SECTORS[L.sector].accent).multiplyScalar(n <= sim.checkpoint ? 1.2 : 0.5);
    });
    // buttons
    sim.switches.forEach((s, n) => {
      const d = dyn.switches[n];
      const on = s.time > 0 ? s.t > 0 : s.on;
      d.btnMat.color.copy(d.color).multiplyScalar(on ? 2.4 : 0.5);
      d.btn.position.y = on ? 0.99 : 1.02;
      const frac = s.time > 0 ? s.t / s.time : on ? 1 : 0;
      d.segs.forEach((sg, i) => {
        const lit = i / d.segs.length < frac;
        sg.sm.color.copy(d.color).multiplyScalar(lit ? 2 : 0.12);
      });
    });
    // receivers
    sim.receivers.forEach((r, n) => {
      const d = dyn.receivers[n];
      const k = r.on ? 2.6 : 0.3 + Math.sin(time * 2) * 0.05;
      d.ringMat.color.copy(d.color).multiplyScalar(k);
      d.coreMat.color.copy(d.color).multiplyScalar(r.on ? 3 : 0.2);
    });
    // platforms
    sim.platforms.forEach((p, n) => dyn.platforms[n].position.set(...p.cur));
    // beams
    let bi = 0;
    for (const seg of sim.beams) {
      const [a, b, kind] = seg;
      tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = tmpV.length();
      if (len < 1e-3) continue;
      const bm = beam(bi++);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, tmpV.clone().normalize());
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const flick = 1 + Math.sin(time * 40 + bi) * 0.08;
      bm.core.position.set(...mid);
      bm.core.quaternion.copy(q);
      bm.core.scale.set(0.022, len, 0.022);
      bm.glow.position.set(...mid);
      bm.glow.quaternion.copy(q);
      bm.glow.scale.set(0.075 * flick, len, 0.075 * flick);
      bm.core.visible = bm.glow.visible = true;
      bm.spark.visible = kind === "wall" || kind === "block";
      bm.spark.position.set(...b);
      bm.spark.scale.setScalar(0.35 + Math.sin(time * 30 + bi) * 0.08);
    }
    for (let i = bi; i < beamPool.length; i++) beamPool[i].core.visible = beamPool[i].glow.visible = beamPool[i].spark.visible = false;
    // goo + dust
    if (gooMat) gooMat.uniforms.uTime.value = time;
    if (dust) {
      const a = dust.geometry.attributes.position.array, base = dust.userData.base;
      for (let i = 0; i < a.length; i += 3) {
        a[i] = base[i] + Math.sin(time * 0.3 + i) * 0.25;
        a[i + 1] = base[i + 1] + Math.sin(time * 0.21 + i * 0.7) * 0.3;
        a[i + 2] = base[i + 2] + Math.cos(time * 0.27 + i) * 0.25;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }
    // fx
    for (const f of fxPool) {
      if (f.life <= 0) continue;
      f.life -= dt * 2.6;
      f.s.scale.setScalar(f.size * (1.4 - f.life));
      f.mat.opacity = Math.max(0, f.life);
      if (f.life <= 0) f.s.visible = false;
    }

    // portal views (before the main pass)
    renderer.getDrawingBufferSize(size);
    for (const c of ["blue", "orange"]) portals[c].surfMat.uniforms.uRes.value.copy(size);
    renderPortalView("blue", sim);
    renderPortalView("orange", sim);

    renderer.autoClear = true;
    renderer.render(scene, camera);

    // device pass
    if (view.device !== false) {
      deviceState.recoil = Math.max(0, deviceState.recoil - dt * 6);
      deviceState.flash = Math.max(0, deviceState.flash - dt * 3);
      const r = deviceState.recoil;
      device.position.set(0.22 + Math.sin(deviceState.bob * 0.5) * 0.006 * Math.min(1, speed / 4), -0.17 + bobY * 0.3 - Math.abs(Math.cos(deviceState.bob * 0.5)) * 0.005 * Math.min(1, speed / 4), -0.5 + r * 0.04);
      device.rotation.x = 0.04 + r * 0.18;
      const held = !!sim.held;
      device.position.y -= held ? 0.03 : 0;
      device.userData.tip.material.color.copy(deviceState.color).multiplyScalar(1.4 + deviceState.flash * 2.5);
      vmCam.aspect = camera.aspect;
      vmCam.updateProjectionMatrix();
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(vmScene, vmCam);
      renderer.autoClear = true;
    }
  }

  function fx(e) {
    if (e.type === "portal") {
      deviceState.recoil = 1;
      deviceState.flash = 1;
      deviceState.color.copy(PORTAL_RGB[e.color]);
    } else if (e.type === "portalFail") {
      deviceState.recoil = 0.7;
      deviceState.flash = 0.6;
      deviceState.color.copy(PORTAL_RGB[e.color]);
      if (e.point) burst(e.point, new THREE.Color(0x9aa3b5), 0.7);
    }
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(size);
    const rw = Math.max(64, Math.round(size.x / 2)), rh = Math.max(64, Math.round(size.y / 2));
    rtSize.set(rw, rh);
    portalRT.blue.setSize(rw, rh);
    portalRT.orange.setSize(rw, rh);
  }

  function setFov(f) {
    camera.fov = f;
    camera.updateProjectionMatrix();
  }
  function setQuality(q) {
    quality = q;
  }

  // a lost GPU context loses the PMREM environment: rebuild it
  const onRestore = () => {
    envTex.dispose();
    pmrem.dispose();
    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    vmScene.environment = envTex;
  };
  renderer.domElement.addEventListener("webglcontextrestored", onRestore);

  function dispose() {
    renderer.domElement.removeEventListener("webglcontextrestored", onRestore);
    clearLevel();
    disposables.forEach((d) => d.dispose());
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }

  return { renderer, scene, camera, setLevel, render, resize, setFov, setQuality, fx, dispose, burst };
}
