/**
 * Highway Racer — the endless highway and everything around it.
 *
 * Nothing here grows: the road is a fixed pool of 36 m segments laid end to
 * end, repositioned every frame from (distance mod 36), and the lane-marking
 * texture repeats exactly 3× per segment, so seams never show. Roadside props
 * are InstancedMeshes whose instances wrap around a fixed span; the ground
 * texture scrolls; the far hills and sky are static backdrop at "infinity".
 * Everything is built per theme and disposed when the theme changes.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LANE_WIDTH, RAIL_X, ROAD_HALF, SHOULDER } from "../engine/config.js";
import { mulberry32 } from "../engine/run.js";
import { glowMat } from "./materials.js";

export const SEG = 36;
const ROAD_W = (ROAD_HALF + SHOULDER) * 2;
const SPAN = 396; // prop wrap span (multiple of 36 so regular props line up)
const BEHIND = 36;

/* ------------------------------------------------------------------ textures */
function asphaltTextures(env, aniso) {
  const W = 512;
  const H = 1024; // = 36 m
  const pxm = H / SEG;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = env.asphalt.base;
  g.fillRect(0, 0, W, H);
  const rng = mulberry32(42);
  // grain
  for (let i = 0; i < 9000; i++) {
    const v = rng();
    g.fillStyle = v < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
    g.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
  }
  // tyre-worn lane bands (slightly darker)
  const xm = (x) => ((x + ROAD_W / 2) / ROAD_W) * W;
  for (const lx of [-LANE_WIDTH, 0, LANE_WIDTH]) {
    for (const off of [-0.8, 0.8]) {
      g.fillStyle = "rgba(0,0,0,0.07)";
      g.fillRect(xm(lx + off) - 10, 0, 20, H);
    }
  }
  // shoulders a touch lighter
  g.fillStyle = "rgba(255,255,255,0.035)";
  g.fillRect(0, 0, xm(-ROAD_HALF), H);
  g.fillRect(xm(ROAD_HALF), 0, W - xm(ROAD_HALF), H);

  const m = document.createElement("canvas");
  m.width = W;
  m.height = H;
  const mg = m.getContext("2d");
  mg.fillStyle = "#000";
  mg.fillRect(0, 0, W, H);
  const draw = (ctx, color) => {
    ctx.fillStyle = color;
    const lineW = 0.16 * (W / ROAD_W);
    // solid edge lines
    for (const ex of [-ROAD_HALF, ROAD_HALF]) ctx.fillRect(xm(ex) - lineW / 2, 0, lineW, H);
    // dashed lane lines: 3 m dash, 9 m gap → 3 per segment
    for (const lx of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
      for (let k = 0; k < 3; k++) ctx.fillRect(xm(lx) - lineW / 2, (k * 12 + 1) * pxm, lineW, 3 * pxm);
    }
    // rumble strips along the shoulders
    ctx.globalAlpha = 0.18;
    for (const ex of [-ROAD_HALF - 0.45, ROAD_HALF + 0.45]) {
      for (let y = 0; y < H; y += pxm * 0.5) ctx.fillRect(xm(ex) - 0.25 * (W / ROAD_W), y, 0.5 * (W / ROAD_W), pxm * 0.22);
    }
    ctx.globalAlpha = 1;
  };
  draw(g, env.marking);
  draw(mg, "#fff");
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = aniso;
  const glow = new THREE.CanvasTexture(m);
  glow.anisotropy = aniso;
  return { map, glow };
}

function groundTexture(env, aniso) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = env.ground.base;
  g.fillRect(0, 0, S, S);
  const rng = mulberry32(7);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rng() < 0.6 ? env.ground.var : env.ground.speck;
    g.globalAlpha = 0.25 + rng() * 0.35;
    const r = 2 + rng() * 10;
    const x = rng() * S;
    const y = rng() * S;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, r * 1.6, r, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

function cloudTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  const rng = mulberry32(3);
  for (let i = 0; i < 16; i++) {
    const x = 40 + rng() * 176;
    const y = 50 + rng() * 40;
    const r = 18 + rng() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.7)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ sky */
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = `
uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom;
uniform vec3 sunColor; uniform vec3 glowColor; uniform vec3 sunDir; uniform float sunSize; uniform float stars;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, top, smoothstep(0.18, 0.75, h));
  col = mix(col, bottom, smoothstep(0.0, -0.08, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += glowColor * (pow(s, 6.0) * 0.28 + pow(s, 48.0) * 0.45);
  float r = sunSize;
  col = mix(col, sunColor, smoothstep(cos(r * 1.25), cos(r), s));
  if (stars > 0.0 && h > 0.04) {
    vec3 g = floor(d * 260.0);
    float st = hash(g);
    col += vec3(step(0.9975, st) * stars * smoothstep(0.04, 0.3, h) * (0.5 + 0.5 * hash(g + 1.0)));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ prop geometry */
const col = (hex) => new THREE.Color(hex);
function tint(g, color) {
  const c = col(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
const nonIndexed = (g) => (g.index ? g.toNonIndexed() : g);
function merge(list) {
  const flat = list.map((g) => {
    const n = nonIndexed(g);
    if (n !== g) g.dispose();
    for (const k of Object.keys(n.attributes)) if (!["position", "normal", "color"].includes(k)) n.deleteAttribute(k);
    return n;
  });
  const out = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  out.computeVertexNormals();
  return out;
}
const at = (g, x, y, z) => {
  g.translate(x, y, z);
  return g;
};
function jitter(g, amount, seed) {
  const rng = mulberry32(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rng() - 0.5) * amount, p.getY(i) + (rng() - 0.5) * amount, p.getZ(i) + (rng() - 0.5) * amount);
  return g;
}

function propGeometry(kind, env) {
  const [f0, f1, f2] = env.foliage;
  const trunk = "#5a4030";
  switch (kind) {
    case "pine":
      return merge([
        tint(at(new THREE.CylinderGeometry(0.18, 0.26, 2.2, 6), 0, 1.1, 0), trunk),
        tint(at(new THREE.ConeGeometry(2.0, 3.4, 7), 0, 3.4, 0), f0),
        tint(at(new THREE.ConeGeometry(1.55, 2.8, 7), 0, 5.0, 0), f0),
        tint(at(new THREE.ConeGeometry(1.0, 2.2, 7), 0, 6.5, 0), f1),
      ]);
    case "fir":
      return merge([
        tint(at(new THREE.CylinderGeometry(0.16, 0.24, 2.0, 6), 0, 1.0, 0), trunk),
        tint(at(new THREE.ConeGeometry(1.6, 5.5, 7), 0, 4.2, 0), f2),
        tint(at(new THREE.ConeGeometry(1.1, 3.6, 7), 0, 7.2, 0), f0),
      ]);
    case "oak":
      return merge([
        tint(at(new THREE.CylinderGeometry(0.22, 0.32, 2.6, 6), 0, 1.3, 0), trunk),
        tint(at(jitter(new THREE.IcosahedronGeometry(2.1, 0), 0.5, 1), 0, 3.6, 0), f1),
        tint(at(jitter(new THREE.IcosahedronGeometry(1.5, 0), 0.4, 2), 1.1, 4.4, 0.4), f2),
        tint(at(jitter(new THREE.IcosahedronGeometry(1.4, 0), 0.4, 3), -1.0, 4.2, -0.5), f0),
      ]);
    case "bush":
      return merge([
        tint(at(jitter(new THREE.IcosahedronGeometry(0.9, 0), 0.3, 4), 0, 0.6, 0), f1),
        tint(at(jitter(new THREE.IcosahedronGeometry(0.7, 0), 0.25, 5), 0.8, 0.45, 0.2), f0),
      ]);
    case "shrub":
      return merge([
        tint(at(jitter(new THREE.IcosahedronGeometry(0.6, 0), 0.35, 6), 0, 0.4, 0), f1),
        tint(at(jitter(new THREE.IcosahedronGeometry(0.45, 0), 0.3, 7), 0.5, 0.3, 0.1), f0),
      ]);
    case "rock":
      return merge([
        tint(at(jitter(new THREE.DodecahedronGeometry(1.0, 0), 0.45, 8).scale(1.4, 0.75, 1.1), 0, 0.45, 0), env.night ? "#3a4048" : "#8d857a"),
        tint(at(jitter(new THREE.DodecahedronGeometry(0.55, 0), 0.25, 9), 1.0, 0.25, 0.5), env.night ? "#30353c" : "#a0978a"),
      ]);
    case "cactus": {
      const green = "#5e7f3c";
      const arm = (sx, y, h) => [
        tint(at(new THREE.CylinderGeometry(0.17, 0.17, 0.9, 7).rotateZ(Math.PI / 2), sx * 0.55, y, 0), green),
        tint(at(new THREE.CylinderGeometry(0.17, 0.17, h, 7), sx * 1.0, y + h / 2 - 0.1, 0), green),
      ];
      return merge([
        tint(at(new THREE.CylinderGeometry(0.28, 0.3, 4.2, 8), 0, 2.1, 0), green),
        tint(at(new THREE.SphereGeometry(0.28, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 4.2, 0), green),
        ...arm(1, 1.8, 1.4),
        ...arm(-1, 2.4, 1.1),
      ]);
    }
    case "pole": {
      // wooden power pole + crossarm + three wires spanning to the next pole (36 m)
      const wood = env.night ? "#3a3028" : "#6a5240";
      const wire = "#2a2a2e";
      const parts = [
        tint(at(new THREE.CylinderGeometry(0.13, 0.17, 9, 6), 0, 4.5, 0), wood),
        tint(at(new THREE.BoxGeometry(2.4, 0.16, 0.16), 0, 8.4, 0), wood),
      ];
      for (const wx of [-1.05, 0, 1.05]) {
        // sagging wire as a few straight pieces
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          pts.push(new THREE.Vector3(wx, 8.55 - Math.sin(t * Math.PI) * 0.9, -t * SEG));
        }
        for (let i = 0; i < 6; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const len = a.distanceTo(b);
          const seg = new THREE.CylinderGeometry(0.02, 0.02, len, 3);
          seg.rotateX(Math.PI / 2);
          const mid = a.clone().add(b).multiplyScalar(0.5);
          seg.lookAt(b.clone().sub(a));
          seg.translate(mid.x, mid.y, mid.z);
          parts.push(tint(seg, wire));
        }
      }
      return merge(parts);
    }
    case "sign": {
      const parts = [
        tint(at(new THREE.BoxGeometry(4.2, 2.0, 0.1), 0, 4.0, 0), env.night ? "#1d5a36" : "#1f6a40"),
        tint(at(new THREE.BoxGeometry(4.0, 0.06, 0.12), 0, 4.82, 0.01), "#e8efe8"),
        tint(at(new THREE.BoxGeometry(2.6, 0.22, 0.12), -0.3, 4.15, 0.01), "#e8efe8"),
        tint(at(new THREE.BoxGeometry(1.4, 0.22, 0.12), -0.9, 3.6, 0.01), "#e8efe8"),
        tint(at(new THREE.BoxGeometry(0.5, 0.5, 0.12), 1.4, 3.7, 0.01), "#e8efe8"),
      ];
      for (const sx of [-1.4, 1.4]) parts.push(tint(at(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), sx, 1.5, -0.1), "#8a8e94"));
      return merge(parts);
    }
    case "lamp": {
      const metal = "#5a606a";
      return merge([
        tint(at(new THREE.CylinderGeometry(0.09, 0.13, 8, 6), 0, 4, 0), metal),
        tint(at(new THREE.BoxGeometry(2.2, 0.12, 0.12), -1.0, 7.95, 0), metal),
        tint(at(new THREE.BoxGeometry(0.7, 0.14, 0.32), -2.0, 7.86, 0), "#fff1c8"),
      ]);
    }
    case "mound": {
      const g = new THREE.ConeGeometry(30, 14, 9, 2);
      jitter(g, 4, 11);
      return merge([tint(at(g, 0, 5, 0), env.hills.near)]);
    }
    case "mesa": {
      const g = new THREE.CylinderGeometry(22, 30, 26, 9, 2);
      jitter(g, 3, 12);
      return merge([tint(at(g, 0, 11, 0), env.hills.near)]);
    }
    default:
      return merge([tint(new THREE.BoxGeometry(1, 1, 1), "#f0f")]);
  }
}

/* ------------------------------------------------------------------ props layout */
/**
 * Each prop kind: count per quality, lateral band and whether it's laid out
 * regularly (poles, lamps) or scattered.
 */
const KIND = {
  pine: { band: [3, 26], scale: [0.8, 1.35] },
  fir: { band: [3, 30], scale: [0.85, 1.4] },
  oak: { band: [3.5, 28], scale: [0.75, 1.25] },
  bush: { band: [1.8, 16], scale: [0.7, 1.3] },
  shrub: { band: [1.6, 22], scale: [0.7, 1.4] },
  rock: { band: [2.2, 30], scale: [0.6, 1.8] },
  cactus: { band: [3, 26], scale: [0.7, 1.25] },
  pole: { regular: 36, x: RAIL_X + 4.5, sides: [1] },
  lamp: { regular: 44, x: RAIL_X + 0.8, sides: [-1, 1], stagger: true },
  sign: { regular: 396, x: RAIL_X + 3.2, sides: [1] },
  mound: { band: [75, 140], scale: [0.6, 1.3], far: true },
  mesa: { band: [90, 160], scale: [0.6, 1.3], far: true },
};

function scatterCount(kind, weight, quality) {
  const base = { low: 26, medium: 46, high: 70 }[quality] || 46;
  return Math.round(base * weight * 0.25);
}

/* ------------------------------------------------------------------ build */
export function createScenery({ scene, gl, env, quality }) {
  const group = new THREE.Group();
  scene.add(group);
  const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };

  /* sky */
  const sky = new THREE.Mesh(
    keep(new THREE.SphereGeometry(900, 32, 16)),
    keep(
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          top: { value: col(env.sky.top) },
          mid: { value: col(env.sky.mid) },
          horizon: { value: col(env.sky.horizon) },
          bottom: { value: col(env.sky.bottom) },
          sunColor: { value: col(env.sun.color) },
          glowColor: { value: col(env.sun.glow) },
          sunDir: { value: new THREE.Vector3(...env.sun.dir).normalize() },
          sunSize: { value: env.sun.size },
          stars: { value: env.stars ? 0.9 : 0 },
        },
      }),
    ),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  /* far backdrop hills (fog-free, pre-tinted toward the horizon) */
  const backdrop = new THREE.Group();
  {
    const rng = mulberry32(env.id.length * 97);
    const horizon = col(env.fog.color);
    const layers = [
      { n: 14, dist: 760, h: [40, 110], r: [90, 170], color: env.hills.far2, mixK: 0.55 },
      { n: 12, dist: 640, h: [30, 80], r: [70, 140], color: env.hills.far, mixK: 0.35 },
    ];
    for (const L of layers) {
      const c = col(L.color).lerp(horizon, L.mixK);
      const m = keep(new THREE.MeshBasicMaterial({ color: c, fog: false }));
      for (let i = 0; i < L.n; i++) {
        // spread across the forward 200°, a few behind for the menu camera
        const a = -Math.PI / 2 + (i / L.n) * Math.PI * 1.15 - 0.08 + (rng() - 0.5) * 0.1;
        const h = L.h[0] + rng() * (L.h[1] - L.h[0]);
        const r = L.r[0] + rng() * (L.r[1] - L.r[0]);
        const geo = keep(env.mesas && rng() < 0.5 ? new THREE.CylinderGeometry(r * 0.55, r * 0.75, h, 7) : new THREE.ConeGeometry(r, h, 7));
        const mesh = new THREE.Mesh(geo, m);
        const ang = a - Math.PI / 2;
        mesh.position.set(Math.cos(ang) * L.dist * (0.85 + rng() * 0.3), h / 2 - 8, Math.sin(ang) * L.dist * 0.9);
        mesh.scale.set(1, 1, 0.6);
        backdrop.add(mesh);
      }
    }
  }
  group.add(backdrop);

  /* clouds */
  const clouds = [];
  {
    const t = keep(cloudTexture());
    const m = keep(new THREE.MeshBasicMaterial({ map: t, color: env.clouds, transparent: true, depthWrite: false, fog: false, opacity: env.night ? 0.35 : 0.85 }));
    const geo = keep(new THREE.PlaneGeometry(1, 0.5));
    const rng = mulberry32(5);
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(geo, m);
      const w = 120 + rng() * 160;
      c.scale.set(w, w, 1);
      c.position.set(-500 + rng() * 1000, 90 + rng() * 120, -520 - rng() * 220);
      c.renderOrder = -9;
      group.add(c);
      clouds.push(c);
    }
  }

  /* ground */
  const groundTex = keep(groundTexture(env, aniso));
  groundTex.repeat.set(1200 / 14, 1200 / 14);
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(1200, 1200)), keep(new THREE.MeshLambertMaterial({ map: groundTex })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.03, -400);
  ground.receiveShadow = true;
  group.add(ground);

  /* road segments */
  const { map, glow } = asphaltTextures(env, aniso);
  keep(map);
  keep(glow);
  const roadMat = keep(
    new THREE.MeshStandardMaterial({
      map,
      roughness: 0.92,
      metalness: 0,
      emissive: col(env.marking),
      emissiveMap: glow,
      emissiveIntensity: env.markingGlow,
    }),
  );
  const roadGeo = keep(new THREE.PlaneGeometry(ROAD_W, SEG));
  roadGeo.rotateX(-Math.PI / 2);
  // guard rails: W-beam + posts every 4 m, both sides, one merged geometry
  const railParts = [];
  for (const sx of [-1, 1]) {
    railParts.push(at(new THREE.BoxGeometry(0.06, 0.34, SEG), sx * RAIL_X, 0.62, 0));
    railParts.push(at(new THREE.BoxGeometry(0.1, 0.06, SEG), sx * (RAIL_X + 0.03), 0.78, 0));
    for (let i = 0; i < SEG / 4; i++) railParts.push(at(new THREE.BoxGeometry(0.1, 0.72, 0.1), sx * (RAIL_X + 0.12), 0.36, -SEG / 2 + 2 + i * 4));
  }
  const railGeo = keep(mergeGeometries(railParts, false));
  for (const g of railParts) g.dispose();
  const railMat = keep(new THREE.MeshStandardMaterial({ color: env.night ? "#8a909a" : "#b9bec6", metalness: 0.7, roughness: 0.38 }));
  // verge strip between shoulder and rail
  const vergeGeo = keep(new THREE.PlaneGeometry(RAIL_X - (ROAD_HALF + SHOULDER) + 1.6, SEG));
  vergeGeo.rotateX(-Math.PI / 2);
  const vergeMat = keep(new THREE.MeshLambertMaterial({ color: env.verge }));
  const segCount = quality === "low" ? 10 : 12;
  const segments = [];
  for (let i = 0; i < segCount; i++) {
    const s = new THREE.Group();
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true;
    const rails = new THREE.Mesh(railGeo, railMat);
    rails.castShadow = quality === "high";
    rails.receiveShadow = true;
    s.add(road, rails);
    for (const sx of [-1, 1]) {
      const v = new THREE.Mesh(vergeGeo, vergeMat);
      v.position.set(sx * ((ROAD_HALF + SHOULDER + RAIL_X + 1.6) / 2), -0.01, 0);
      v.receiveShadow = true;
      s.add(v);
    }
    group.add(s);
    segments.push(s);
  }

  /* props */
  const propMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const farMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const props = [];
  const rng = mulberry32(env.id.charCodeAt(0) * 131);
  const kinds = { ...env.props };
  if (env.lamps) kinds.lamp = 1;
  kinds[env.mesas ? "mesa" : "mound"] = 1;
  for (const [kind, weight] of Object.entries(kinds)) {
    const K = KIND[kind];
    if (!K) continue;
    const geo = keep(propGeometry(kind, env));
    let items = [];
    if (K.regular) {
      if (kind === "sign" && quality === "low") continue;
      const n = Math.round(SPAN / K.regular);
      for (let i = 0; i < n; i++) {
        for (const side of K.sides) {
          const stagger = K.stagger && side < 0 ? K.regular / 2 : 0;
          items.push({ base: (i * K.regular + stagger) % SPAN, x: side * K.x, s: 1, rot: side < 0 ? Math.PI : 0, fixed: true });
        }
      }
    } else {
      const n = K.far ? (quality === "low" ? 8 : 14) : scatterCount(kind, weight, quality);
      for (let i = 0; i < n; i++) items.push({ base: rng() * SPAN, x: 0, s: 1, rot: 0 });
      for (const it of items) randomize(it, K, rng);
    }
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(geo, K.far ? farMat : propMat, items.length);
    mesh.castShadow = !K.far && quality === "high" && kind !== "pole";
    mesh.frustumCulled = false;
    group.add(mesh);
    props.push({ kind, K, mesh, items, last: [] });
  }

  /* lamp light pools on the road (night) */
  let pools = null;
  if (env.lamps) {
    const n = Math.round(SPAN / KIND.lamp.regular) * 2;
    const geo = keep(new THREE.PlaneGeometry(9, 12));
    geo.rotateX(-Math.PI / 2);
    pools = new THREE.InstancedMesh(geo, glowMat("#ffd89a", 0.32), n);
    pools.frustumCulled = false;
    pools.renderOrder = 2;
    group.add(pools);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();

  function randomize(it, K, r) {
    const side = r() < 0.5 ? -1 : 1;
    const off = K.band[0] + Math.pow(r(), 1.3) * (K.band[1] - K.band[0]);
    it.x = side * (RAIL_X + off);
    it.s = K.scale[0] + r() * (K.scale[1] - K.scale[0]);
    it.rot = r() * Math.PI * 2;
  }

  /** place everything for the current travelled distance */
  function update(distance, camera) {
    const off = ((distance % SEG) + SEG) % SEG;
    for (let i = 0; i < segments.length; i++) segments[i].position.z = SEG * 2 - i * SEG + off - SEG / 2;
    // ground scroll: texture repeats every 14 m
    groundTex.offset.y = ((distance / 14) % 1 + 1) % 1;
    for (const P of props) {
      const { mesh, items, K } = P;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const z = (((it.base + distance) % SPAN) + SPAN) % SPAN - (SPAN - BEHIND);
        if (!it.fixed && P.last[i] !== undefined && z < P.last[i] - 1) randomize(it, K, rng);
        P.last[i] = z;
        e.set(0, it.rot, 0);
        q.setFromEuler(e);
        s3.setScalar(it.s);
        v3.set(it.x, 0, z);
        m4.compose(v3, q, s3);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (pools) {
      let k = 0;
      const lampItems = props.find((p) => p.kind === "lamp");
      if (lampItems) {
        for (let i = 0; i < lampItems.items.length && k < pools.count; i++) {
          const it = lampItems.items[i];
          const z = P_z(it, distance);
          v3.set(Math.sign(it.x) * (ROAD_HALF - 1.2), 0.03, z);
          q.identity();
          s3.setScalar(1);
          m4.compose(v3, q, s3);
          pools.setMatrixAt(k++, m4);
        }
        pools.instanceMatrix.needsUpdate = true;
      }
    }
    if (camera) {
      sky.position.copy(camera.position);
      backdrop.position.set(camera.position.x, 0, camera.position.z);
    }
  }
  const P_z = (it, distance) => (((it.base + distance) % SPAN) + SPAN) % SPAN - (SPAN - BEHIND);

  function drift(dt) {
    for (const c of clouds) {
      c.position.x += dt * 2.2;
      if (c.position.x > 560) c.position.x = -560;
    }
  }

  return {
    group,
    update,
    drift,
    setVisible(v) {
      group.visible = v;
    },
    dispose() {
      scene.remove(group);
      for (const P of props) P.mesh.dispose();
      if (pools) pools.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
