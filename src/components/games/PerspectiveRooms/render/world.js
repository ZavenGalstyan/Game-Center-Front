/**
 * Perspective: Impossible Rooms — plain three.js renderer.
 *
 * Static architecture is merged into one mesh per surface style (plus one
 * LineSegments for every crisp edge), so a room is a handful of draw calls.
 * One directional "sun" casts soft shadows on the High setting only. Per-level
 * geometry, materials and textures are tracked and disposed on level change;
 * shared ones on dispose().
 *
 * Optical illusions:
 *   - anamorphic pictures: line fragments scattered in depth along rays from
 *     the viewpoint, so they only line up from there (and fly together into
 *     the finished picture once aligned);
 *   - hidden paths: ghost boxes whose shimmer strengthens the closer you are
 *     to the right angle, solid once revealed.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EYE, ZONES, SHAPES } from "../engine/constants.js";
import { objBox, landingY } from "../engine/sim.js";
import { createTextures } from "./textures.js";

const PASTELS = ["#ff9ec7", "#8fd6ff", "#ffd36b", "#9bffb4", "#c79bff", "#ffb38a", "#7cf7ff"];

/* ------------------------------------------------------------------ anamorph shapes (segments in [-1,1]²) */
function arcPts(cx, cy, rx, ry, a0, a1, n) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return p;
}
function poly(pts, closed = false) {
  const s = [];
  for (let i = 0; i < pts.length - 1; i++) s.push([...pts[i], ...pts[i + 1]]);
  if (closed) s.push([...pts[pts.length - 1], ...pts[0]]);
  return s;
}
const SHAPE_SEGS = {
  arch: () => [...poly([[-0.62, -1], [-0.62, 0.15], ...arcPts(0, 0.15, 0.62, 0.62, Math.PI, 0, 10).slice(1, -1), [0.62, 0.15], [0.62, -1]]), ...poly(arcPts(0, 0.05, 0.22, 0.22, 0, Math.PI * 2, 10))],
  eye: () => [...poly(arcPts(0, -0.55, 1, 1.05, Math.PI * 0.2, Math.PI * 0.8, 10)), ...poly(arcPts(0, 0.55, 1, 1.05, -Math.PI * 0.2, -Math.PI * 0.8, 10)), ...poly(arcPts(0, 0, 0.3, 0.3, 0, Math.PI * 2, 10))],
  star: () => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.42 : 1;
      p.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return poly(p, true);
  },
  key: () => [...poly(arcPts(-0.55, 0, 0.38, 0.38, 0, Math.PI * 2, 12)), [-0.17, 0, 0.95, 0], [0.62, 0, 0.62, -0.35], [0.85, 0, 0.85, -0.3], [0.4, 0, 0.4, -0.22]],
  penrose: () => {
    const o = [[0, 1], [-0.95, -0.65], [0.95, -0.65]];
    const i = [[0, 0.32], [-0.38, -0.33], [0.38, -0.33]];
    return [...poly(o, true), ...poly(i, true), [0, 1, 0.38, -0.33], [-0.95, -0.65, 0, 0.32], [0.95, -0.65, -0.38, -0.33]];
  },
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ------------------------------------------------------------------ helpers */
function boxGeo(b) {
  const w = b.x1 - b.x0,
    h = b.y1 - b.y0,
    d = b.z1 - b.z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // world-scaled UVs so textures tile at a constant size: +x,-x,+y,-y,+z,-z
  const dims = [
    [d, h, b.z0, b.y0],
    [d, h, b.z0, b.y0],
    [w, d, b.x0, b.z0],
    [w, d, b.x0, b.z0],
    [w, h, b.x0, b.y0],
    [w, h, b.x0, b.y0],
  ];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, dims[f][2] + uv.getX(k) * dims[f][0], dims[f][3] + uv.getY(k) * dims[f][1]);
    }
  g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  return g;
}
function edgesInto(arr, b, inset = 0.002) {
  const x0 = b.x0 - inset,
    x1 = b.x1 + inset,
    y0 = b.y0 - inset,
    y1 = b.y1 + inset,
    z0 = b.z0 - inset,
    z1 = b.z1 + inset;
  const P = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, c] of E) arr.push(...P[a], ...P[c]);
}
const col = (c) => new THREE.Color(c);
const mix = (a, b, t) => col(a).lerp(col(b), t);

/* ------------------------------------------------------------------ world */
export function createWorld(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "pir-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
  scene.add(camera);
  const tx = createTextures();

  /* sky dome */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: col("#cfe6ff") }, bottom: { value: col("#ffffff") }, stars: { value: 0 }, time: { value: 0 } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float stars; uniform float time; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float y = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(bottom, top, smoothstep(0.35, 0.95, y));
        c += (1.0 - abs(vP.y)) * 0.06;
        if (stars > 0.0) { vec3 q = floor(vP * 220.0); float s = step(0.9965, h(q)); c += s * stars * (0.6 + 0.4 * sin(time * 2.0 + h(q + 1.0) * 30.0)) * smoothstep(0.45, 0.8, y); }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8c6dd, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(sun.target);
  const exitLight = new THREE.PointLight(0xffffff, 0, 12, 1.6);
  scene.add(exitLight);

  /* shared geometry */
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const roundBox = new RoundedBoxGeometry(1, 1, 1, 3, 0.07);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  const torusGeo = new THREE.TorusGeometry(1, 0.2, 10, 28);
  const sphereGeo = new THREE.SphereGeometry(1, 32, 18);
  const coneGeo = new THREE.ConeGeometry(0.5, 1, 6);
  const hexGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  const shared = [unitBox, roundBox, planeGeo, cylGeo, torusGeo, sphereGeo, coneGeo, hexGeo, skyGeo];

  let quality = "high";
  let level = null; // { group, own: [], objs: [], ... }
  let fov = 75;
  let time = 0;
  const cam = { y: null };
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  function disposeLevel() {
    if (!level) return;
    scene.remove(level.group);
    level.own.forEach((x) => x.dispose());
    level = null;
  }

  function setLevel(L, s) {
    disposeLevel();
    const T = { ...ZONES[L.zone].theme, ...(L.theme || {}) };
    const own = [];
    const keep = (x) => (own.push(x), x);
    const group = new THREE.Group();
    scene.add(group);
    level = { group, own, L, T, objs: [], plates: [], doors: [], exits: [], views: [], hidden: [], deco: [], dropShadow: null };

    // atmosphere
    skyMat.uniforms.top.value.set(T.skyTop);
    skyMat.uniforms.bottom.value.set(T.skyBottom);
    skyMat.uniforms.stars.value = T.dark ? 1 : 0;
    scene.fog = new THREE.Fog(T.fog, 28, T.fogFar);
    hemi.color.set(T.hemiTop);
    hemi.groundColor.set(T.hemiBottom);
    hemi.intensity = T.dark ? 1.35 : 1.1;
    sun.color.set(T.sun);
    sun.intensity = T.dark ? 0.9 : 1.75;
    renderer.toneMappingExposure = T.exposure;
    const bmin = L.bounds.min,
      bmax = L.bounds.max;
    const cx = (bmin[0] + bmax[0]) / 2,
      cz = (bmin[2] + bmax[2]) / 2;
    const span = Math.max(bmax[0] - bmin[0], bmax[2] - bmin[2]) * 0.62 + 6;
    sun.position.set(cx + span * 0.55, bmax[1] + 30, cz + span * 0.8);
    sun.target.position.set(cx, 0, cz);
    const sc = sun.shadow.camera;
    sc.left = -span;
    sc.right = span;
    sc.top = span;
    sc.bottom = -span;
    sc.near = 1;
    sc.far = 120;
    sc.updateProjectionMatrix();
    const shadows = quality === "high";
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;

    // materials per surface style
    const accentDim = mix(T.wall, T.accent, 0.14);
    const mats = {
      wall: keep(new THREE.MeshStandardMaterial({ color: T.wall, map: tx.panels, roughness: 0.92, metalness: 0 })),
      floor: keep(new THREE.MeshStandardMaterial({ color: T.floor, map: tx.grid, roughness: 0.86 })),
      plat: keep(new THREE.MeshStandardMaterial({ color: accentDim, map: tx.grid, roughness: 0.8 })),
      tower: keep(new THREE.MeshStandardMaterial({ color: mix(T.wall, T.accent2, 0.12), map: tx.grid, roughness: 0.8 })),
      terrace: keep(new THREE.MeshStandardMaterial({ color: T.floor, map: tx.grid, roughness: 0.82 })),
      ceiling: keep(new THREE.MeshStandardMaterial({ color: T.wall, roughness: 0.95 })),
      socket: keep(new THREE.MeshStandardMaterial({ color: mix(T.wall, T.accent, 0.3), roughness: 0.6, emissive: col(T.accent), emissiveIntensity: T.dark ? 0.25 : 0.05 })),
    };
    if (T.dark) {
      mats.wall.emissive = col(T.trim);
      mats.wall.emissiveIntensity = 0.12;
    }
    const byStyle = {};
    const edgePts = [];
    for (const b of L.boxes) {
      const st = mats[b.style] ? b.style : "wall";
      (byStyle[st] ||= []).push(boxGeo(b));
      if (b.style !== "ceiling") edgesInto(edgePts, b);
    }
    for (const [st, geos] of Object.entries(byStyle)) {
      const g = keep(mergeGeometries(geos));
      geos.forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, mats[st]);
      m.castShadow = st !== "floor" && st !== "terrace";
      m.receiveShadow = true;
      group.add(m);
    }
    const eg = keep(new THREE.BufferGeometry());
    eg.setAttribute("position", new THREE.Float32BufferAttribute(edgePts, 3));
    const em = keep(new THREE.LineBasicMaterial({ color: T.dark ? T.accent : T.trim, transparent: true, opacity: T.dark ? 0.55 : 0.75 }));
    group.add(new THREE.LineSegments(eg, em));

    // plates
    const plateBase = keep(new THREE.MeshStandardMaterial({ color: mix(T.floor, "#7a849c", 0.35), roughness: 0.5 }));
    for (const p of s.plates) {
      const b = p.box;
      const w = b.x1 - b.x0,
        d = b.z1 - b.z0;
      const g = new THREE.Group();
      g.position.set((b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2);
      const base = new THREE.Mesh(unitBox, plateBase);
      base.scale.set(w, 0.08, d);
      base.position.y = 0.04;
      base.receiveShadow = true;
      g.add(base);
      const glowMat = keep(new THREE.MeshBasicMaterial({ color: T.accent, transparent: true, opacity: 0.5 }));
      const glow = new THREE.Mesh(planeGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.083;
      glow.scale.set(w * 0.86, d * 0.86, 1);
      g.add(glow);
      // what the plate wants, drawn on it
      let icon = null;
      if (p.need === "player") {
        const im = keep(new THREE.MeshBasicMaterial({ map: tx.feet, transparent: true, color: "#ffffff", depthWrite: false }));
        icon = new THREE.Mesh(planeGeo, im);
        icon.scale.set(Math.min(w, d) * 0.7, Math.min(w, d) * 0.7, 1);
      } else {
        const side = p.need === "heavy" ? p.min : Math.min(w, d) * 0.42;
        const pts = [];
        const a = side / 2;
        pts.push(-a, 0, -a, a, 0, -a, a, 0, -a, a, 0, a, a, 0, a, -a, 0, a, -a, 0, a, -a, 0, -a);
        if (p.need === "heavy") {
          const c = a * 0.55;
          pts.push(-c, 0, -c, c, 0, -c, c, 0, -c, c, 0, c, c, 0, c, -c, 0, c, -c, 0, c, -c, 0, -c);
        }
        const lg = keep(new THREE.BufferGeometry());
        lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        icon = new THREE.LineSegments(lg, keep(new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95 })));
      }
      if (icon.isMesh) icon.rotation.x = -Math.PI / 2;
      icon.position.y = 0.09;
      g.add(icon);
      group.add(g);
      level.plates.push({ p, glowMat, on: 0 });
    }

    // doors
    const doorMat = keep(new THREE.MeshStandardMaterial({ color: mix(T.wall, T.trim, 0.35), roughness: 0.45, metalness: 0.1 }));
    for (const d of s.doors) {
      const b = d.b;
      const g = new THREE.Group();
      const panel = new THREE.Mesh(unitBox, doorMat);
      panel.scale.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      g.add(panel);
      const stripeMat = keep(new THREE.MeshBasicMaterial({ color: "#ff6b8a" }));
      const alongX = b.x1 - b.x0 > b.z1 - b.z0;
      for (const sgn of [-1, 1]) {
        const st = new THREE.Mesh(unitBox, stripeMat);
        if (alongX) {
          st.scale.set((b.x1 - b.x0) * 0.8, 0.08, 0.02);
          st.position.set(0, -(b.y1 - b.y0) * 0.5 + 0.35, sgn * ((b.z1 - b.z0) / 2 + 0.011));
        } else {
          st.scale.set(0.02, 0.08, (b.z1 - b.z0) * 0.8);
          st.position.set(sgn * ((b.x1 - b.x0) / 2 + 0.011), -(b.y1 - b.y0) * 0.5 + 0.35, 0);
        }
        g.add(st);
      }
      group.add(g);
      level.doors.push({ d, g, stripeMat });
    }

    // buttons
    for (const bt of s.buttons) {
      const b = bt.box;
      const m = new THREE.Mesh(unitBox, keep(new THREE.MeshBasicMaterial({ color: T.accent2 })));
      m.scale.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
      m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      group.add(m);
      level.buttons = level.buttons || [];
      level.buttons.push({ bt, m });
    }

    // exits: an arch with a living portal
    for (const e of s.exits) {
      const g = new THREE.Group();
      g.position.set(...e.pos);
      g.rotation.y = e.yaw;
      const frameMat = keep(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3, emissive: col(T.accent), emissiveIntensity: 0.35 }));
      for (const [x, y, w, h] of [[-0.95, 1.3, 0.22, 2.6], [0.95, 1.3, 0.22, 2.6], [0, 2.7, 2.12, 0.22]]) {
        const m = new THREE.Mesh(unitBox, frameMat);
        m.scale.set(w, h, 0.3);
        m.position.set(x, y, 0);
        m.castShadow = true;
        g.add(m);
      }
      const portalMat = keep(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: { uTime: { value: 0 }, uColor: { value: col(T.accent) }, uOn: { value: 0 } },
          vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOn; varying vec2 vUv;
            void main(){ vec2 p = vUv - 0.5; p.x *= 1.35; float r = length(p);
              float sw = sin(16.0 * r - uTime * 2.6 + atan(p.y, p.x) * 2.0) * 0.5 + 0.5;
              float edge = smoothstep(0.62, 0.05, r);
              vec3 c = mix(uColor, vec3(1.0), 0.35 + 0.45 * sw * uOn + 0.3 * (1.0 - r));
              float bars = uOn > 0.5 ? 1.0 : step(0.5, fract((vUv.x + vUv.y) * 7.0));
              float a = edge * mix(0.22 * bars, 0.95, uOn) * (0.7 + 0.3 * sw);
              gl_FragColor = vec4(c * mix(0.45, 1.15, uOn), a); }`,
        }),
      );
      const portal = new THREE.Mesh(planeGeo, portalMat);
      portal.scale.set(1.68, 2.5, 1);
      portal.position.y = 1.25;
      g.add(portal);
      group.add(g);
      level.exits.push({ e, g, portalMat, frameMat });
      exitLight.color.set(T.accent);
      exitLight.position.set(e.pos[0], e.pos[1] + 1.6, e.pos[2]);
    }

    // viewpoints
    const fragGeo = unitBox;
    for (const v of s.views) {
      const mk = new THREE.Mesh(planeGeo, keep(new THREE.MeshBasicMaterial({ map: tx.eye, color: T.accent2, transparent: true, depthWrite: false })));
      mk.rotation.x = -Math.PI / 2;
      mk.scale.set(1.15, 1.15, 1);
      mk.position.set(v.eye[0], v.eye[1] + 0.03, v.eye[2]);
      group.add(mk);
      const rec = { v, mk, frag: null, t: 0 };
      if (v.kind === "anamorph") {
        const eye = new THREE.Vector3(v.eye[0], v.eye[1] + EYE, v.eye[2]);
        const tgt = new THREE.Vector3(...v.target);
        const fwd = tgt.clone().sub(eye).normalize();
        const right = new THREE.Vector3().crossVectors(fwd, _up).normalize();
        const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
        const D = tgt.distanceTo(eye);
        const size = v.size * D * 0.16;
        const segs = [];
        for (const [ax, ay, bx, by] of SHAPE_SEGS[v.shape]()) {
          const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.3));
          for (let i = 0; i < n; i++) segs.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, ax + ((bx - ax) * (i + 1)) / n, ay + ((by - ay) * (i + 1)) / n]);
        }
        const r = rng(v.id.length * 977 + L.id * 131);
        const mat = keep(new THREE.MeshBasicMaterial({ color: T.accent, transparent: true, opacity: 0.6, fog: false }));
        const im = keep(new THREE.InstancedMesh(fragGeo, mat, segs.length));
        const data = segs.map(([ax, ay, bx, by]) => {
          const A = tgt.clone().addScaledVector(right, ax * size).addScaledVector(up, ay * size);
          const B = tgt.clone().addScaledVector(right, bx * size).addScaledVector(up, by * size);
          return { A, B, f: 0.3 + r() * 0.62 };
        });
        rec.frag = { im, mat, data, eye, thick: size * 0.05 };
        placeFragments(rec, 0);
        group.add(im);
      }
      if (v.kind === "reveal") {
        const hm = keep(new THREE.MeshStandardMaterial({ color: T.accent, emissive: col(T.accent), emissiveIntensity: 0.6, transparent: true, opacity: 0.05, depthWrite: false, roughness: 0.2 }));
        const hidden = s.hidden.filter((h) => h.view === v.id);
        const geos = hidden.map((h) => boxGeo(h.b));
        const g = keep(mergeGeometries(geos));
        geos.forEach((x) => x.dispose());
        const mesh = new THREE.Mesh(g, hm);
        mesh.receiveShadow = true;
        group.add(mesh);
        const ep = [];
        hidden.forEach((h) => edgesInto(ep, h.b, 0.004));
        const hg = keep(new THREE.BufferGeometry());
        hg.setAttribute("position", new THREE.Float32BufferAttribute(ep, 3));
        const hl = keep(new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 }));
        group.add(new THREE.LineSegments(hg, hl));
        rec.hidden = { mesh, hm, hl };
      }
      level.views.push(rec);
    }

    // grabbable objects
    for (const o of s.objs) {
      const g = new THREE.Group();
      const base = SHAPES[o.shape].base;
      const color = o.color || PASTELS[(o.id + L.id) % PASTELS.length];
      const mats = [];
      const std = (p) => {
        const m = keep(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, ...p }));
        mats.push(m);
        return m;
      };
      let mesh;
      if (o.shape === "cube") mesh = new THREE.Mesh(roundBox, std({ color, roughness: 0.42 }));
      else if (o.shape === "die") mesh = new THREE.Mesh(roundBox, tx.die.map((t) => std({ map: t, roughness: 0.35 })));
      else if (o.shape === "crate") mesh = new THREE.Mesh(unitBox, std({ map: tx.crate, color: mix(color, "#ffe2b8", 0.5) }));
      else if (o.shape === "gift") {
        mesh = new THREE.Mesh(unitBox, std({ map: tx.gift, color }));
        const bowMat = std({ color: "#fff4c2", roughness: 0.4 });
        for (const ry of [0, Math.PI / 2]) {
          const bow = new THREE.Mesh(torusGeo, bowMat);
          bow.scale.set(0.16, 0.16, 0.5);
          bow.rotation.y = ry;
          bow.position.y = 0.56;
          mesh.add(bow);
        }
      } else if (o.shape === "book") {
        const cover = std({ color, roughness: 0.6 });
        const spine = std({ color: mix(color, "#000000", 0.25) });
        const pg = std({ map: tx.pages, roughness: 0.9 });
        mesh = new THREE.Mesh(unitBox, [pg, spine, cover, cover, pg, pg]);
      } else mesh = new THREE.Mesh(unitBox, std({ map: tx.plank, color: mix(color, "#ffe7cc", 0.55) }));
      mesh.scale.set(base[0], base[1], base[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      group.add(g);
      const q = new THREE.Quaternion();
      level.objs.push({ o, g, mats, q, glow: 0 });
    }
    const shadowMat = keep(new THREE.MeshBasicMaterial({ color: T.accent2, transparent: true, opacity: 0.32, depthWrite: false }));
    const dropShadow = new THREE.Mesh(planeGeo, shadowMat);
    dropShadow.rotation.x = -Math.PI / 2;
    dropShadow.visible = false;
    group.add(dropShadow);
    level.dropShadow = dropShadow;

    // décor floating in the void
    for (const d of L.deco) {
      const dg = buildDeco(d, T, keep);
      if (dg) {
        group.add(dg);
        level.deco.push(dg);
      }
    }
    cam.y = null;
    setFov(fov);
  }

  function placeFragments(rec, k) {
    const { im, data, eye, thick } = rec.frag;
    data.forEach((it, i) => {
      const f = it.f + (1 - it.f) * k;
      const A = _v.copy(it.A).sub(eye).multiplyScalar(f).add(eye);
      const B = _v2.copy(it.B).sub(eye).multiplyScalar(f).add(eye);
      const len = A.distanceTo(B) + thick * f;
      const dir = B.clone().sub(A).normalize();
      _q.setFromUnitVectors(_up, dir);
      const mid = A.add(B).multiplyScalar(0.5);
      _m.compose(mid, _q, new THREE.Vector3(thick * f, len, thick * f));
      im.setMatrixAt(i, _m);
    });
    im.instanceMatrix.needsUpdate = true;
  }

  function buildDeco(d, T, keep) {
    const g = new THREE.Group();
    g.position.set(...d.pos);
    g.rotation.y = d.rot || 0;
    g.scale.setScalar(d.scale);
    const m = (c, p = {}) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...p }));
    const add = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      o.rotation.set(rx, ry, rz);
      g.add(o);
      return o;
    };
    const white = m(T.wall),
      acc = m(T.accent, { emissive: col(T.accent), emissiveIntensity: T.dark ? 0.6 : 0.12 }),
      acc2 = m(T.accent2, { emissive: col(T.accent2), emissiveIntensity: T.dark ? 0.5 : 0.1 });
    switch (d.kind) {
      case "floatStairs":
        for (let i = 0; i < 12; i++) {
          const a = i * 0.42;
          add(unitBox, i % 3 ? white : acc, Math.cos(a) * 3, i * 0.55, Math.sin(a) * 3, 1.6, 0.25, 0.9, 0, -a, 0);
        }
        g.userData.anim = (t) => (g.rotation.y = (d.rot || 0) + t * 0.05);
        break;
      case "sphere":
        add(sphereGeo, m(T.accent2, { roughness: 0.25, emissive: col(T.accent2), emissiveIntensity: T.dark ? 0.4 : 0.06 }), 0, 0, 0, 1, 1, 1);
        add(torusGeo, white, 0, 0, 0, 1.6, 1.6, 0.25, 1.2, 0, 0.3);
        g.userData.anim = (t) => (g.position.y = d.pos[1] + Math.sin(t * 0.4) * 0.6);
        break;
      case "cubes":
        for (let i = 0; i < 7; i++) {
          const c = add(roundBox, i % 2 ? acc : i % 3 ? white : acc2, Math.sin(i * 2.1) * 2.4, Math.cos(i * 1.3) * 1.6, Math.cos(i * 2.7) * 2.4, 0.5 + (i % 3) * 0.35, 0.5 + (i % 3) * 0.35, 0.5 + (i % 3) * 0.35);
          c.userData.ph = i;
        }
        g.userData.anim = (t) =>
          g.children.forEach((c) => {
            c.rotation.x = t * 0.3 + c.userData.ph;
            c.rotation.y = t * 0.2 + c.userData.ph;
          });
        break;
      case "arch":
        add(unitBox, white, -2, 2.5, 0, 0.8, 5, 0.8);
        add(unitBox, white, 2, 2.5, 0, 0.8, 5, 0.8);
        add(torusGeo, acc, 0, 5, 0, 2, 2, 2);
        break;
      case "mug":
        add(cylGeo, white, 0, 0, 0, 1.6, 1.8, 1.6);
        add(cylGeo, acc2, 0, 0.92, 0, 1.4, 0.04, 1.4);
        add(torusGeo, white, 0.95, 0, 0, 0.45, 0.5, 0.5);
        g.userData.anim = (t) => (g.rotation.z = Math.sin(t * 0.3) * 0.12);
        break;
      case "pencil":
        add(hexGeo, acc2, 0, 0, 0, 0.5, 5, 0.5);
        add(coneGeo, m("#ffe0b8"), 0, 2.9, 0, 0.5, 0.8, 0.5);
        add(cylGeo, m("#ff9ec7"), 0, -2.75, 0, 0.5, 0.5, 0.5);
        g.rotation.z = 0.9;
        g.userData.anim = (t) => (g.rotation.y = (d.rot || 0) + t * 0.08);
        break;
      case "chair":
        add(unitBox, acc, 0, 1, 0, 2, 0.2, 2);
        for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) add(unitBox, white, x, 0.45, z, 0.18, 1, 0.18);
        add(unitBox, white, 0, 2.1, -0.9, 2, 2, 0.18);
        g.rotation.z = 0.25;
        g.userData.anim = (t) => (g.rotation.x = Math.sin(t * 0.25) * 0.1);
        break;
      case "books":
        for (let i = 0; i < 5; i++) add(unitBox, i % 2 ? acc : i % 3 ? white : acc2, Math.sin(i) * 0.2, i * 0.42, 0, 2.2 - i * 0.12, 0.38, 1.5, 0, i * 0.2, 0);
        break;
      case "ring":
        add(torusGeo, acc, 0, 0, 0, 1, 1, 1);
        add(torusGeo, acc2, 0, 0, 0, 0.7, 0.7, 0.7, Math.PI / 2, 0, 0);
        g.userData.anim = (t) => {
          g.children[0].rotation.y = t * 0.3;
          g.children[1].rotation.x = Math.PI / 2 + t * 0.2;
        };
        break;
      case "penrose": {
        // three bars of an open path that close into a triangle from one direction
        const L = 4;
        add(unitBox, acc, L / 2, 0, 0, L, 0.6, 0.6);
        add(unitBox, white, L, L / 2, 0, 0.6, L, 0.6);
        add(unitBox, acc2, L, L, L / 2, 0.6, 0.6, L);
        g.userData.anim = (t) => (g.rotation.y = (d.rot || 0) + Math.sin(t * 0.15) * 0.25);
        break;
      }
      case "frames": {
        for (let i = 0; i < 3; i++) {
          const fr = add(unitBox, m("#e9e3ff"), (i - 1) * 3, 0, 0, 2.4, 1.8, 0.1);
          const art = new THREE.Mesh(planeGeo, keep(new THREE.MeshBasicMaterial({ map: tx.art[(i + Math.round(d.pos[2])) & 3] })));
          art.scale.set(2.1 / 2.4, 1.5 / 1.8, 1);
          art.position.z = 0.51;
          fr.add(art);
        }
        // hang on the wall: frames face +z in local space
        g.position.x += Math.sin(d.rot || 0) * 0.05;
        break;
      }
      default:
        return null;
    }
    return g;
  }

  /* ------------------------------------------------------------------ per frame */
  function render(s, dt = 1 / 60) {
    time += dt;
    skyMat.uniforms.time.value = time;
    if (level && s) {
      const T = level.T;
      // objects
      for (const r of level.objs) {
        const o = r.o;
        r.g.position.set(o.pos[0], o.pos[1], o.pos[2]);
        r.g.scale.setScalar(o.scale);
        const M = o.rot;
        _m.set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1);
        _q.setFromRotationMatrix(_m);
        if (r.q.lengthSq() === 0 || !r.init) {
          r.q.copy(_q);
          r.init = true;
        } else r.q.slerp(_q, Math.min(1, dt * 14));
        r.g.quaternion.copy(r.q);
        const focused = s.focus && s.focus.kind === "obj" && s.focus.id === o.id;
        const bad = o.held && s.hold && !s.hold.valid;
        const want = bad ? 1 : o.held ? 0.35 : focused ? 0.45 : 0;
        r.glow += (want - r.glow) * Math.min(1, dt * 10);
        const c = bad ? "#ff3b5c" : T.accent;
        for (const m of r.mats) {
          m.emissive.set(c);
          m.emissiveIntensity = r.glow * (bad ? 0.6 + 0.3 * Math.sin(time * 12) : 0.5);
        }
      }
      // drop shadow under the held object
      const ds = level.dropShadow;
      if (s.hold && s.hold.valid) {
        const y = landingY(s);
        if (y !== null) {
          const b = objBox(s.hold.obj);
          ds.visible = true;
          ds.position.set((b.x0 + b.x1) / 2, y + 0.02, (b.z0 + b.z1) / 2);
          ds.scale.set(b.x1 - b.x0, b.z1 - b.z0, 1);
        } else ds.visible = false;
      } else ds.visible = false;
      // plates
      for (const r of level.plates) {
        r.on += ((r.p.on ? 1 : 0) - r.on) * Math.min(1, dt * 8);
        r.glowMat.color.set(r.p.on ? T.accent2 : T.accent);
        r.glowMat.opacity = 0.25 + 0.6 * r.on + 0.08 * Math.sin(time * 3);
      }
      // doors
      for (const r of level.doors) {
        const d = r.d,
          b = d.b,
          h = b.y1 - b.y0;
        r.g.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + d.open * h, (b.z0 + b.z1) / 2);
        r.stripeMat.color.set(d.open > 0.02 || d.when.every((n) => s.signals[n]) ? T.accent2 : "#ff6b8a");
      }
      for (const r of level.buttons || []) r.m.material.color.set(r.bt.on ? T.accent2 : T.accent);
      // exits
      for (const r of level.exits) {
        const on = r.e.unlocked ? 1 : 0;
        r.portalMat.uniforms.uTime.value = time;
        r.portalMat.uniforms.uOn.value += (on - r.portalMat.uniforms.uOn.value) * Math.min(1, dt * 4);
        r.frameMat.emissiveIntensity = 0.2 + 0.6 * r.portalMat.uniforms.uOn.value;
        exitLight.intensity = 6 * r.portalMat.uniforms.uOn.value;
      }
      // viewpoints
      for (const r of level.views) {
        const v = r.v;
        r.mk.material.opacity = v.done ? 0.35 : 0.55 + 0.35 * Math.sin(time * 3);
        if (r.frag) {
          if (v.done) r.t = Math.min(1, r.t + dt * 0.8);
          const e = r.t * r.t * (3 - 2 * r.t);
          placeFragments(r, e);
          r.frag.mat.opacity = Math.min(1, 0.65 + 0.35 * Math.max(v.align, e));
          r.frag.mat.color.set(T.accent).lerp(col("#ffffff"), Math.max(v.align * 0.6, e * 0.8));
        }
        if (r.hidden) {
          if (v.done) r.t = Math.min(1, r.t + dt * 0.9);
          const a = v.done ? 0.35 + 0.55 * r.t : 0.03 + Math.pow(v.align, 2) * 0.5 + (v.align > 0.2 ? 0.04 * Math.sin(time * 9) : 0);
          r.hidden.hm.opacity = a;
          r.hidden.hm.depthWrite = v.done && r.t > 0.9;
          r.hidden.hl.opacity = v.done ? 0.85 * r.t : Math.pow(v.align, 3) * 0.9;
        }
      }
      for (const dg of level.deco) dg.userData.anim?.(time);
      // camera: smooth step-ups, gentle head bob
      const p = s.player;
      const eyeY = p.y + EYE;
      if (cam.y === null || Math.abs(eyeY - cam.y) > 2.5) cam.y = eyeY;
      else cam.y += (eyeY - cam.y) * Math.min(1, dt * (eyeY > cam.y ? 14 : 30));
      const bob = p.ground ? Math.sin(p.bob * 2) * 0.035 * Math.min(1, p.speed / 4) : 0;
      camera.position.set(p.x, cam.y + bob, p.z);
      camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
    }
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function setFov(f) {
    fov = f;
    camera.fov = f;
    camera.updateProjectionMatrix();
  }
  function setQuality(q) {
    quality = q;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.5 : 1));
    const on = q === "high";
    renderer.shadowMap.enabled = on;
    sun.castShadow = on;
  }
  function dispose() {
    disposeLevel();
    shared.forEach((g) => g.dispose());
    skyMat.dispose();
    tx.dispose();
    sun.shadow.map?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
  return { renderer, scene, camera, setLevel, render, resize, setFov, setQuality, dispose, get quality() { return quality; } };
}
