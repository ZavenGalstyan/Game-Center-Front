/**
 * Archery Master 3D — plain Three.js presentation. One renderer for the whole
 * session; each world is rebuilt from procedural geometry + canvas textures
 * when the level's world changes. Targets and obstacles are posed every frame
 * from the same posAt()/targetNormal() the physics uses, so what you see is
 * exactly what the arrow collides with.
 */
import * as THREE from "three";
import { EYE, posAt, targetNormal, TARGET_DEPTH } from "./physics.js";

/* ---------------------------------------------------------------- themes */
const THEMES = [
  {
    // Forest Training — bright morning, mowed lane, pines
    sky: ["#3f8fd6", "#bfe0ef", "#e9f3e4"],
    sunGlow: "#fff3cf",
    fog: ["#cfe3d8", 35, 190],
    sun: ["#fff1d6", 2.7, [-24, 34, 22]],
    hemi: ["#d6ecff", "#4c6b2e", 0.75],
    exposure: 1.0,
    ground: "#5d8e3a",
    lane: "forest",
    mountain: "#6f8fa0",
    particle: { kind: "pollen", color: "#fff6c4", size: 0.07, count: 140 },
    banner: "#2f7d3a",
  },
  {
    // Castle Grounds — golden hour against the keep
    sky: ["#34407e", "#f0a35e", "#f8c98c"],
    sunGlow: "#ffd09a",
    fog: ["#d8a27e", 40, 200],
    sun: ["#ffc68f", 2.5, [-34, 16, 18]],
    hemi: ["#ffd6ad", "#3a3022", 0.62],
    exposure: 1.0,
    ground: "#6a7a3e",
    lane: "castle",
    mountain: "#6c5a78",
    particle: { kind: "pollen", color: "#ffe2b0", size: 0.06, count: 90 },
    banner: "#a3202c",
  },
  {
    // Desert Winds — hard noon light and heat haze
    sky: ["#2a7fd1", "#f4dcae", "#f3d6a0"],
    sunGlow: "#fff6dc",
    fog: ["#efd5a3", 45, 230],
    sun: ["#fff0cc", 3.1, [14, 42, 14]],
    hemi: ["#fff3da", "#b98a4a", 0.82],
    exposure: 0.98,
    ground: "#ddb276",
    lane: "desert",
    mountain: "#c99c66",
    particle: { kind: "sand", color: "#f2d39a", size: 0.05, count: 260 },
    banner: "#d08a1c",
  },
  {
    // Frozen Peaks — overcast and snowing
    sky: ["#88aed6", "#e6eef7", "#eef3f9"],
    sunGlow: "#ffffff",
    fog: ["#e2ebf4", 22, 150],
    sun: ["#eef4ff", 1.7, [-12, 28, 16]],
    hemi: ["#ffffff", "#9fb6d2", 1.05],
    exposure: 1.0,
    ground: "#eef4fb",
    lane: "frozen",
    mountain: "#8ea6c2",
    particle: { kind: "snow", color: "#ffffff", size: 0.09, count: 420 },
    banner: "#2a6fb8",
  },
  {
    // Champion's Temple — dusk, braziers and gold
    sky: ["#0d0a24", "#5b2f5e", "#c76a3c"],
    sunGlow: "#ff9a5a",
    fog: ["#2c1b33", 34, 170],
    sun: ["#ffb377", 1.7, [22, 14, 12]],
    hemi: ["#7465b8", "#2a170e", 0.6],
    exposure: 1.08,
    ground: "#3b3140",
    lane: "temple",
    mountain: "#2d2238",
    particle: { kind: "ember", color: "#ffb35a", size: 0.07, count: 160 },
    banner: "#c99a2e",
  },
];

/* ---------------------------------------------------------------- helpers */
function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function speckle(x, w, h, r, n, light, dark, size = 2) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = r() < 0.5 ? light : dark;
    x.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
}

function groundCanvas(theme, seed) {
  const [c, x] = canvas(512, 512);
  const r = rand(seed);
  x.fillStyle = theme.ground;
  x.fillRect(0, 0, 512, 512);
  if (theme.lane === "desert") {
    for (let i = 0; i < 60; i++) {
      x.strokeStyle = `rgba(${r() < 0.5 ? "255,240,210" : "150,100,50"},${0.08 + r() * 0.1})`;
      x.lineWidth = 2 + r() * 3;
      const y0 = r() * 512;
      x.beginPath();
      for (let s = 0; s <= 32; s++) x.lineTo(s * 16, y0 + Math.sin(s * 0.5 + i) * 6);
      x.stroke();
    }
    speckle(x, 512, 512, r, 5000, "rgba(255,245,220,0.25)", "rgba(120,80,40,0.18)", 1.5);
  } else if (theme.lane === "frozen") {
    speckle(x, 512, 512, r, 3000, "rgba(255,255,255,0.8)", "rgba(160,185,215,0.25)", 2);
  } else if (theme.lane === "temple") {
    speckle(x, 512, 512, r, 6000, "rgba(255,255,255,0.05)", "rgba(0,0,0,0.18)", 2);
  } else {
    for (let i = 0; i < 9000; i++) {
      const v = r();
      x.strokeStyle = v < 0.5 ? `rgba(40,70,20,${0.25 + r() * 0.3})` : `rgba(170,210,90,${0.15 + r() * 0.25})`;
      x.lineWidth = 1;
      const px = r() * 512, py = r() * 512;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (r() - 0.5) * 3, py - 3 - r() * 5);
      x.stroke();
    }
  }
  return c;
}

function laneCanvas(kind, seed) {
  const [c, x] = canvas(512, 1024);
  const r = rand(seed);
  if (kind === "forest") {
    for (let i = 0; i < 8; i++) {
      x.fillStyle = i % 2 ? "#6aa046" : "#5f953e";
      x.fillRect(0, i * 128, 512, 128);
    }
    for (let i = 0; i < 7000; i++) {
      x.strokeStyle = r() < 0.5 ? "rgba(40,80,20,0.35)" : "rgba(190,230,110,0.25)";
      const px = r() * 512, py = r() * 1024;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (r() - 0.5) * 2, py - 2 - r() * 4);
      x.stroke();
    }
  } else if (kind === "castle") {
    x.fillStyle = "#5c5348";
    x.fillRect(0, 0, 512, 1024);
    for (let row = 0; row < 32; row++) {
      for (let col = 0; col < 10; col++) {
        const w = 46 + r() * 8, h = 28 + r() * 4;
        const px = col * 52 + (row % 2) * 26 - 10 + r() * 3, py = row * 32 + r() * 3;
        const v = 95 + r() * 45;
        x.fillStyle = `rgb(${v + 12},${v + 4},${v - 8})`;
        x.beginPath();
        x.roundRect(px, py, w, h, 9);
        x.fill();
      }
    }
    speckle(x, 512, 1024, r, 4000, "rgba(255,255,255,0.08)", "rgba(0,0,0,0.15)", 2);
  } else if (kind === "desert") {
    x.fillStyle = "#e4c08a";
    x.fillRect(0, 0, 512, 1024);
    speckle(x, 512, 1024, r, 9000, "rgba(255,245,220,0.3)", "rgba(140,95,50,0.2)", 1.6);
    for (let i = 0; i < 40; i++) {
      x.fillStyle = "rgba(120,80,40,0.12)";
      x.beginPath();
      x.ellipse(r() * 512, r() * 1024, 6 + r() * 14, 3 + r() * 6, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
  } else if (kind === "frozen") {
    const g = x.createLinearGradient(0, 0, 512, 1024);
    g.addColorStop(0, "#d6e9f7");
    g.addColorStop(1, "#bcd7ee");
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 1024);
    x.strokeStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < 70; i++) {
      x.lineWidth = 0.6 + r() * 1.2;
      let px = r() * 512, py = r() * 1024;
      x.beginPath();
      x.moveTo(px, py);
      for (let s = 0; s < 5; s++) {
        px += (r() - 0.5) * 60;
        py += (r() - 0.5) * 60;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    speckle(x, 512, 1024, r, 2500, "rgba(255,255,255,0.6)", "rgba(120,160,200,0.15)", 1.5);
  } else {
    // temple marble tiles with gold seams
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const v = (row + col) % 2 ? 222 : 196;
        x.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        x.fillRect(col * 128, row * 128, 128, 128);
        for (let k = 0; k < 6; k++) {
          x.strokeStyle = `rgba(120,110,120,${0.08 + r() * 0.1})`;
          x.lineWidth = 1 + r() * 2;
          x.beginPath();
          let px = col * 128 + r() * 128, py = row * 128 + r() * 128;
          x.moveTo(px, py);
          for (let s = 0; s < 4; s++) x.lineTo((px += (r() - 0.5) * 50), (py += (r() - 0.5) * 50));
          x.stroke();
        }
      }
    }
    x.strokeStyle = "#c99a2e";
    x.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      x.beginPath();
      x.moveTo(i * 128, 0);
      x.lineTo(i * 128, 1024);
      x.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      x.beginPath();
      x.moveTo(0, i * 128);
      x.lineTo(512, i * 128);
      x.stroke();
    }
  }
  return c;
}

/** FITA-style face: gold / red / blue / black / white pairs, centre X. */
function faceCanvas() {
  const S = 512;
  const [c, x] = canvas(S, S);
  const cols = ["#f4f1e8", "#f4f1e8", "#1b1b1f", "#1b1b1f", "#1f7fd0", "#1f7fd0", "#e0322f", "#e0322f", "#ffd23c", "#ffd23c"];
  for (let i = 0; i < 10; i++) {
    const rr = (S / 2) * (1 - i / 10);
    x.fillStyle = cols[i];
    x.beginPath();
    x.arc(S / 2, S / 2, rr, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = i === 2 || i === 3 ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
    x.lineWidth = 1.6;
    x.stroke();
  }
  x.strokeStyle = "rgba(0,0,0,0.6)";
  x.lineWidth = 1.2;
  x.beginPath();
  x.arc(S / 2, S / 2, (S / 2) * 0.05, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.moveTo(S / 2 - 5, S / 2);
  x.lineTo(S / 2 + 5, S / 2);
  x.moveTo(S / 2, S / 2 - 5);
  x.lineTo(S / 2, S / 2 + 5);
  x.stroke();
  return c;
}

function strawCanvas() {
  const [c, x] = canvas(256, 64);
  x.fillStyle = "#c9a35a";
  x.fillRect(0, 0, 256, 64);
  const r = rand(77);
  for (let i = 0; i < 900; i++) {
    x.strokeStyle = r() < 0.5 ? "rgba(120,85,30,0.5)" : "rgba(250,225,150,0.5)";
    const px = r() * 256, py = r() * 64;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + 6 + r() * 10, py + (r() - 0.5) * 3);
    x.stroke();
  }
  return c;
}

function plankCanvas(seed, hue = 28, light = 34) {
  const [c, x] = canvas(256, 256);
  const r = rand(seed);
  for (let i = 0; i < 4; i++) {
    x.fillStyle = `hsl(${hue + r() * 6}, ${40 + r() * 10}%, ${light + r() * 8}%)`;
    x.fillRect(0, i * 64, 256, 64);
    for (let g = 0; g < 10; g++) {
      x.strokeStyle = `rgba(40,20,5,${0.08 + r() * 0.12})`;
      x.lineWidth = 0.8 + r();
      const o = i * 64 + r() * 64;
      x.beginPath();
      for (let s = 0; s <= 16; s++) x.lineTo(s * 16, o + Math.sin(s * 0.6 + g) * 2);
      x.stroke();
    }
    x.fillStyle = "rgba(20,10,0,0.6)";
    x.fillRect(0, i * 64, 256, 3);
  }
  return c;
}

function brickCanvas(seed, base, mortar) {
  const [c, x] = canvas(256, 256);
  const r = rand(seed);
  x.fillStyle = mortar;
  x.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 5; col++) {
      const px = col * 64 + (row % 2) * 32 + 2, py = row * 32 + 2;
      const v = (r() - 0.5) * 30;
      const b = new THREE.Color(base);
      x.fillStyle = `rgb(${Math.max(0, b.r * 255 + v)},${Math.max(0, b.g * 255 + v)},${Math.max(0, b.b * 255 + v)})`;
      x.fillRect(px, py, 60, 28);
    }
  }
  speckle(x, 256, 256, r, 1500, "rgba(255,255,255,0.08)", "rgba(0,0,0,0.15)", 2);
  return c;
}

function shieldCanvas(color, accent) {
  const [c, x] = canvas(256, 256);
  x.fillStyle = color;
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = accent;
  x.fillRect(0, 0, 256, 18);
  x.fillRect(0, 238, 256, 18);
  x.fillRect(0, 0, 18, 256);
  x.fillRect(238, 0, 18, 256);
  x.beginPath();
  x.moveTo(128, 50);
  x.lineTo(190, 80);
  x.lineTo(180, 160);
  x.lineTo(128, 205);
  x.lineTo(76, 160);
  x.lineTo(66, 80);
  x.closePath();
  x.fill();
  x.fillStyle = color;
  x.font = "bold 90px Georgia, serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("✦", 128, 132);
  return c;
}

function flagCanvas(color) {
  const [c, x] = canvas(128, 64);
  x.fillStyle = color;
  x.fillRect(0, 0, 128, 64);
  x.fillStyle = "rgba(255,255,255,0.85)";
  x.fillRect(0, 26, 128, 12);
  return c;
}

function signCanvas(text) {
  const [c, x] = canvas(128, 64);
  x.fillStyle = "#2b2016";
  x.fillRect(0, 0, 128, 64);
  x.strokeStyle = "#e3b65a";
  x.lineWidth = 4;
  x.strokeRect(3, 3, 122, 58);
  x.fillStyle = "#ffe2a0";
  x.font = "bold 34px Arial, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, 64, 34);
  return c;
}

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 glow; uniform vec3 sunDir; uniform float stars; varying vec3 vDir;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y,0.0,1.0), 0.55)) : mix(mid, bot, clamp(-y*4.0,0.0,1.0));
 float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += glow * (pow(s, 280.0) * 1.4 + pow(s, 8.0) * 0.25);
 if (stars > 0.0 && y > 0.05) { vec3 q = floor(vDir * 260.0); float r = h(q); c += vec3(step(0.9975, r) * stars * (0.5 + 0.5 * h(q + 1.0))); }
 gl_FragColor = vec4(c, 1.0); }`;

/**
 * Fade a material out as it nears the lens (view depth near → far). The drawn
 * string and nocked arrow pass a few cm from the eye; unfaded they smear into
 * big stripes across the view.
 */
function nearFade(mat, near, far) {
  mat.transparent = true;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vViewZ;").replace("#include <project_vertex>", "#include <project_vertex>\nvViewZ = -mvPosition.z;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vViewZ;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(${near.toFixed(3)}, ${far.toFixed(3)}, vViewZ);`);
  };
  mat.customProgramCacheKey = () => `nearFade-${near}-${far}`;
  return mat;
}

/* ---------------------------------------------------------------- arrow model */
function arrowParts() {
  // built along +z with the TIP at the origin (z = 0) and the nock at z = -0.78
  const shaft = new THREE.CylinderGeometry(0.0045, 0.0045, 0.72, 6).rotateX(Math.PI / 2).translate(0, 0, -0.42);
  const head = new THREE.ConeGeometry(0.011, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0, -0.035);
  const nock = new THREE.CylinderGeometry(0.006, 0.005, 0.03, 6).rotateX(Math.PI / 2).translate(0, 0, -0.785);
  const vane = new THREE.BufferGeometry();
  const pos = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const p = (r, z) => [ca * r, sa * r, z];
    pos.push(...p(0.004, -0.7), ...p(0.028, -0.74), ...p(0.004, -0.6));
    pos.push(...p(0.004, -0.7), ...p(0.028, -0.74), ...p(0.028, -0.765));
    pos.push(...p(0.004, -0.7), ...p(0.028, -0.765), ...p(0.004, -0.77));
  }
  vane.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  vane.computeVertexNormals();
  return { shaft, head, nock, vane };
}

/* ---------------------------------------------------------------- scene */
export function createScene(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#ccc", 30, 180);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.02, 600);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const persistentTex = [];
  const T = (c, list, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    list.push(t);
    return t;
  };

  /* lights */
  const hemi = new THREE.HemisphereLight("#fff", "#444", 0.7);
  const sun = new THREE.DirectionalLight("#fff", 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 46;
  sc.bottom = -46;
  sc.near = 1;
  sc.far = 160;
  scene.add(hemi, sun, sun.target);
  sun.target.position.set(0, 0, -32);

  /* sky */
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, stars: { value: 0 } },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  /* shared materials / geometry that live for the whole session */
  const faceTex = T(faceCanvas(), persistentTex);
  const strawTex = T(strawCanvas(), persistentTex);
  strawTex.wrapS = THREE.RepeatWrapping;
  strawTex.repeat.set(6, 1);
  const faceMats = [
    new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1 }),
  ];
  const faceGeo = new THREE.CylinderGeometry(1, 1, TARGET_DEPTH, 48).rotateX(Math.PI / 2);
  const legGeo = new THREE.BoxGeometry(0.07, 1, 0.07).translate(0, 0.5, 0);
  const woodTex = T(plankCanvas(3), persistentTex);
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: "#8a7350", roughness: 1 });
  const glowMat = new THREE.MeshBasicMaterial({ color: "#ffd66b", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const hoverRing = new THREE.TorusGeometry(1.08, 0.03, 8, 64);
  const ringFx = new THREE.RingGeometry(0.85, 1, 48);

  /* ground (geometry persistent, textures per world) */
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
  // polygon offset keeps the lane from z-fighting the ground at range
  const laneMat = new THREE.MeshStandardMaterial({ roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(12, 84).rotateX(-Math.PI / 2), laneMat);
  lane.position.set(0, 0.01, -38);
  lane.receiveShadow = true;
  scene.add(lane);

  /* ---------------------------------------------------------------- bow (camera rig) */
  const bowRig = new THREE.Group();
  camera.add(bowRig);
  const bowWood = new THREE.MeshStandardMaterial({ color: "#4a2a18", roughness: 0.4, metalness: 0.05 });
  const bowLimb = new THREE.MeshStandardMaterial({ color: "#8a4a26", roughness: 0.38, metalness: 0.05 });
  const bowGold = new THREE.MeshStandardMaterial({ color: "#e0ad4a", roughness: 0.28, metalness: 1 });
  const grip = new THREE.MeshStandardMaterial({ color: "#7a4a2a", roughness: 0.95 });
  const riser = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.26, 0.04), bowWood);
  const riserTrim = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.042), bowGold);
  riserTrim.position.y = 0.11;
  const riserTrim2 = riserTrim.clone();
  riserTrim2.position.y = -0.11;
  bowRig.add(riserTrim, riserTrim2);
  const gripM = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.1, 10), grip);
  gripM.position.set(0, -0.02, 0.01);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.03), bowGold);
  shelf.position.set(0.02, 0.045, 0);
  bowRig.add(riser, gripM, shelf);
  const limbCurve = (s) =>
    new THREE.CatmullRomCurve3([[0, 0.12, 0], [0, 0.26, -0.035], [0, 0.42, -0.045], [0, 0.55, -0.01], [0, 0.6, 0.03]].map(([x, y, z]) => new THREE.Vector3(x, y * s, z)));
  const limbTop = new THREE.Mesh(new THREE.TubeGeometry(limbCurve(1), 24, 0.011, 6), bowLimb);
  const limbBot = new THREE.Mesh(new THREE.TubeGeometry(limbCurve(-1), 24, 0.011, 6), bowLimb);
  limbTop.scale.x = limbBot.scale.x = 1.35;
  const tipCap = new THREE.SphereGeometry(0.008, 8, 6);
  const tipTop = new THREE.Mesh(tipCap, bowGold);
  tipTop.position.set(0, 0.6, 0.03);
  const tipBot = new THREE.Mesh(tipCap, bowGold);
  tipBot.position.set(0, -0.6, 0.03);
  bowRig.add(limbTop, limbBot, tipTop, tipBot);
  const stringMat = nearFade(new THREE.MeshBasicMaterial({ color: "#f3ead8", opacity: 0.85, depthWrite: false }), 0.3, 0.5);
  const strGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 1, 4).translate(0, 0.5, 0);
  const strA = new THREE.Mesh(strGeo, stringMat);
  const strB = new THREE.Mesh(strGeo, stringMat);
  bowRig.add(strA, strB);
  const sightPin = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshBasicMaterial({ color: "#7dff9a" }));
  sightPin.position.set(-0.03, 0.09, -0.02);
  bowRig.add(sightPin);

  /* arrows */
  const AP = arrowParts();
  const shaftMat = new THREE.MeshStandardMaterial({ color: "#2b2b30", roughness: 0.4, metalness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({ color: "#cfd4dc", roughness: 0.25, metalness: 1 });
  const nockMat = new THREE.MeshStandardMaterial({ color: "#ffcc33", roughness: 0.5 });
  const vaneMat = new THREE.MeshStandardMaterial({ color: "#e23b3b", roughness: 0.6, side: THREE.DoubleSide, emissive: "#5a0a0a", emissiveIntensity: 0.3 });
  const makeArrow = (mats = [shaftMat, headMat, nockMat, vaneMat]) => {
    const g = new THREE.Group();
    [AP.shaft, AP.head, AP.nock, AP.vane].forEach((geo, i) => {
      const mesh = new THREE.Mesh(geo, mats[i]);
      mesh.castShadow = true;
      g.add(mesh);
    });
    return g;
  };
  const nockedMats = [shaftMat, headMat, nockMat, vaneMat].map((m) => nearFade(m.clone(), 0.2, 0.42));
  const nocked = makeArrow(nockedMats);
  bowRig.add(nocked);
  const flyer = makeArrow();
  flyer.visible = false;
  scene.add(flyer);
  const stuckPool = [];
  const stuck = []; // { g, ref: {kind, index}, off: Vector3 }

  /* trail */
  const TRAIL = 28;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailCol = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  trail.frustumCulled = false;
  scene.add(trail);
  let trailN = 0;

  /* burst particles */
  const PN = 360;
  const pPos = new Float32Array(PN * 3);
  const pCol = new Float32Array(PN * 3);
  const pVel = new Float32Array(PN * 3);
  const pLife = new Float32Array(PN);
  const pBase = new Float32Array(PN * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  particles.frustumCulled = false;
  scene.add(particles);
  let pNext = 0;
  for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -999;

  /* ambient particles (pollen / sand / snow / embers) */
  const AN = 420;
  const aPos = new Float32Array(AN * 3);
  const aSeed = new Float32Array(AN);
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute("position", new THREE.BufferAttribute(aPos, 3));
  const aMat = new THREE.PointsMaterial({ size: 0.07, transparent: true, opacity: 0.8, depthWrite: false });
  const ambient = new THREE.Points(aGeo, aMat);
  ambient.frustumCulled = false;
  scene.add(ambient);
  {
    const r = rand(99);
    for (let i = 0; i < AN; i++) {
      aPos[i * 3] = (r() - 0.5) * 40;
      aPos[i * 3 + 1] = r() * 12;
      aPos[i * 3 + 2] = 4 - r() * 70;
      aSeed[i] = r() * 100;
    }
  }

  /* hit ring flashes */
  const flashes = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(ringFx, new THREE.MeshBasicMaterial({ color: "#ffe27a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false;
    scene.add(m);
    return { m, t: 0 };
  });

  /* ---------------------------------------------------------------- per-world / per-level content */
  let worldId = -1;
  let theme = THEMES[0];
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);
  let worldTex = [];
  const levelGroup = new THREE.Group();
  scene.add(levelGroup);
  let levelTex = [];
  let level = null;
  let targetObjs = [];
  let obstacleObjs = [];
  const flags = [];
  const lights = []; // flickering brazier lights

  function disposeGroup(g, texList) {
    g.traverse((o) => {
      if (o.geometry && !o.userData.shared) o.geometry.dispose();
      if (o.material && !o.userData.sharedMat) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    g.clear();
    texList.forEach((t) => t.dispose());
    texList.length = 0;
  }

  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const vS = new THREE.Vector3();
  const vP = new THREE.Vector3();
  const tmpCol = new THREE.Color();

  /** InstancedMesh from a list of [x, y, z, rotY, sx, sy, sz, color?]. */
  function instances(geo, mat, list, { cast = true, receive = false } = {}) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, col], i) => {
      e.set(0, ry, 0);
      q.setFromEuler(e);
      mtx.compose(vP.set(x, y, z), q, vS.set(sx, sy, sz));
      m.setMatrixAt(i, mtx);
      if (col) m.setColorAt(i, tmpCol.set(col));
    });
    m.castShadow = cast;
    m.receiveShadow = receive;
    worldGroup.add(m);
    return m;
  }

  /** Scatter points off the shooting lane. */
  function scatter(r, n, { minX = 9, maxX = 70, zNear = 14, zFar = -130 } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side * (minX + r() * (maxX - minX));
      const z = zNear + r() * (zFar - zNear);
      out.push([x, z, r()]);
    }
    return out;
  }

  function mountains(r, color, snow) {
    // they sit beyond the fog's far plane, so skip fog and pre-blend toward
    // the haze instead: silhouettes keep their shading
    const geo = new THREE.ConeGeometry(1, 1, 7, 1);
    const tint = new THREE.Color(color).lerp(new THREE.Color(theme.fog[0]), 0.35);
    const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 1, flatShading: true, fog: false });
    const list = [];
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.95 + (i / 25) * Math.PI * 0.9 + (r() - 0.5) * 0.08;
      const d = 240 + r() * 100;
      const h = 26 + r() * 34;
      list.push([Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d - 40, r() * 3, 36 + r() * 40, h, 36 + r() * 40]);
    }
    instances(geo, mat, list, { cast: false });
    if (snow) {
      const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#f7fbff").lerp(new THREE.Color(theme.fog[0]), 0.25), roughness: 0.9, flatShading: true, fog: false });
      instances(geo, capMat, list.map(([x, y, z, ry, sx, h, sz]) => [x, y + h * 0.3, z, ry, sx * 0.42, h * 0.42, sz * 0.42]), { cast: false });
    }
  }

  function pines(r, pts, trunkCol, leafCol, capCol) {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 6).translate(0, 0.5, 0);
    const coneGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: trunkCol, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, flatShading: true });
    const trunks = [], cones = [], caps = [];
    for (const [x, z, k] of pts) {
      const s = 0.8 + k * 0.9;
      trunks.push([x, 0, z, 0, s, 1.6 * s, s]);
      for (let t = 0; t < 3; t++) {
        const w = (2.0 - t * 0.5) * s, y = (1.2 + t * 1.25) * s;
        const c = new THREE.Color(leafCol).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.08);
        cones.push([x, y, z, r() * 3, w, 2.2 * s, w, c]);
        if (capCol && t === 2) caps.push([x, y + 1.0 * s, z, r() * 3, w * 0.55, 1.25 * s, w * 0.55, capCol]);
      }
    }
    instances(trunkGeo, trunkMat, trunks);
    instances(coneGeo, leafMat, cones);
    if (caps.length) instances(coneGeo, leafMat.clone(), caps);
  }

  function roundTrees(r, pts) {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1, 6).translate(0, 0.5, 0);
    const crown = new THREE.IcosahedronGeometry(1, 1);
    const trunks = [], crowns = [];
    for (const [x, z, k] of pts) {
      const s = 0.9 + k * 0.8;
      trunks.push([x, 0, z, 0, s, 2.2 * s, s]);
      const c = new THREE.Color("#4f8f35").offsetHSL((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.12);
      crowns.push([x, 3.1 * s, z, r() * 3, 1.7 * s, 1.5 * s, 1.7 * s, c]);
    }
    instances(trunkGeo, new THREE.MeshStandardMaterial({ color: "#5a3d24", roughness: 1 }), trunks);
    instances(crown, new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.9, flatShading: true }), crowns);
  }

  function rocks(r, pts, color, scale = 1) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    instances(geo, new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.95, flatShading: true }), pts.map(([x, z, k]) => [x, 0.2, z, r() * 6, (0.6 + k) * scale, (0.4 + k * 0.6) * scale, (0.7 + r()) * scale, new THREE.Color(color).offsetHSL(0, 0, (r() - 0.5) * 0.1)]), { receive: true });
  }

  function flagPole(x, z, color) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 5, 8), new THREE.MeshStandardMaterial({ color: "#c9c2b4", metalness: 0.6, roughness: 0.4 }));
    pole.position.set(x, 2.5, z);
    pole.castShadow = true;
    worldGroup.add(pole);
    const tex = T(flagCanvas(color), worldTex);
    const geo = new THREE.PlaneGeometry(1.4, 0.7, 10, 4).translate(0.7, 0, 0);
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    const pivot = new THREE.Group();
    pivot.position.set(x, 4.6, z);
    pivot.add(flag);
    worldGroup.add(pivot);
    flags.push({ pivot, geo, base: geo.attributes.position.array.slice(), ph: x + z });
  }

  function distanceSigns() {
    const post = new THREE.BoxGeometry(0.08, 1, 0.08).translate(0, 0.5, 0);
    for (let d = 10; d <= 60; d += 10) {
      const p = new THREE.Mesh(post, woodMat);
      p.userData.sharedMat = true;
      p.position.set(-6.6, 0, -d);
      worldGroup.add(p);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshStandardMaterial({ map: T(signCanvas(`${d}m`), worldTex), roughness: 0.8 }));
      s.position.set(-6.6, 1.1, -d + 0.05);
      s.rotation.y = 0.35;
      worldGroup.add(s);
    }
  }

  function fenceRows(color) {
    const posts = [], rails = [];
    for (const side of [-1, 1]) {
      for (let z = 2; z > -72; z -= 4) posts.push([side * 6.2, 0, z, 0, 1, 1, 1]);
      for (let z = 0; z > -72; z -= 4) rails.push([side * 6.2, 0.75, z, 0, 1, 1, 1]);
    }
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    instances(new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(0, 0.55, 0), mat, posts);
    instances(new THREE.BoxGeometry(0.06, 0.1, 4), mat, rails);
  }

  function brazier(x, z, scale = 1) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * scale, 0.2 * scale, 0.35 * scale, 12), new THREE.MeshStandardMaterial({ color: "#b8862e", metalness: 0.9, roughness: 0.35 }));
    bowl.position.set(x, 1.6 * scale, z);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.12 * scale, 1.5 * scale, 8), new THREE.MeshStandardMaterial({ color: "#3a2a1c", metalness: 0.4, roughness: 0.6 }));
    stand.position.set(x, 0.75 * scale, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3 * scale, 0.8 * scale, 10), new THREE.MeshBasicMaterial({ color: "#ffb347", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.set(x, 2.1 * scale, z);
    bowl.castShadow = stand.castShadow = true;
    worldGroup.add(bowl, stand, flame);
    lights.push({ flame, light: null, ph: x * 3 + z });
  }

  function buildWorld(w) {
    flags.length = 0;
    lights.length = 0;
    disposeGroup(worldGroup, worldTex);
    worldId = w;
    theme = THEMES[w];
    const r = rand(1000 + w * 17);

    // sky / fog / light
    skyMat.uniforms.top.value.set(theme.sky[0]);
    skyMat.uniforms.mid.value.set(theme.sky[1]);
    skyMat.uniforms.bot.value.set(theme.sky[2]);
    skyMat.uniforms.glow.value.set(theme.sunGlow);
    skyMat.uniforms.sunDir.value.set(...theme.sun[2]).normalize();
    skyMat.uniforms.stars.value = w === 4 ? 1 : 0;
    scene.fog.color.set(theme.fog[0]);
    scene.fog.near = theme.fog[1];
    scene.fog.far = theme.fog[2];
    sun.color.set(theme.sun[0]);
    sun.intensity = theme.sun[1];
    sun.position.set(theme.sun[2][0], theme.sun[2][1], theme.sun[2][2] - 32);
    hemi.color.set(theme.hemi[0]);
    hemi.groundColor.set(theme.hemi[1]);
    hemi.intensity = theme.hemi[2];
    renderer.toneMappingExposure = theme.exposure;

    // ground + lane
    const gt = T(groundCanvas(theme, 7 + w), worldTex);
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(90, 90);
    groundMat.map = gt;
    groundMat.color.set("#ffffff");
    groundMat.needsUpdate = true;
    const lt = T(laneCanvas(theme.lane, 11 + w), worldTex);
    lt.wrapS = lt.wrapT = THREE.RepeatWrapping;
    lt.repeat.set(1, w === 4 ? 10.5 : 7);
    laneMat.map = lt;
    laneMat.roughness = w === 3 ? 0.25 : w === 4 ? 0.35 : 0.9;
    laneMat.metalness = w === 3 ? 0.1 : 0;
    laneMat.needsUpdate = true;

    aMat.color.set(theme.particle.color);
    aMat.size = theme.particle.size;
    ambient.geometry.setDrawRange(0, theme.particle.count);
    aMat.blending = theme.particle.kind === "ember" ? THREE.AdditiveBlending : THREE.NormalBlending;
    aMat.needsUpdate = true;

    mountains(r, theme.mountain, w === 3 || w === 0);
    distanceSigns();
    flagPole(-7.6, -15, theme.banner);
    flagPole(7.4, -34, theme.banner);

    if (w === 0) {
      pines(r, scatter(r, 70, { minX: 10 }), "#4a3220", "#2f6b34");
      roundTrees(r, scatter(r, 40, { minX: 11 }));
      rocks(r, scatter(r, 30, { minX: 8, maxX: 30 }), "#8b8b80", 0.6);
      fenceRows("#7a5534");
      // hay-bale backstop
      const bale = new THREE.CylinderGeometry(0.7, 0.7, 1.6, 16).rotateZ(Math.PI / 2);
      const baleMat = new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1 });
      const list = [];
      for (let i = -6; i <= 6; i++) list.push([i * 1.7, 0.7, -66, 0, 1, 1, 1]);
      for (let i = -5; i <= 5; i++) list.push([i * 1.7 + 0.85, 1.9, -66.3, 0, 1, 1, 1]);
      instances(bale, baleMat, list, { receive: true });
    } else if (w === 1) {
      // keep wall with merlons and towers
      const stoneTex = T(brickCanvas(21, "#9a8f80", "#5b544b"), worldTex);
      stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
      stoneTex.repeat.set(30, 3);
      const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(150, 11, 3), stone);
      wall.position.set(0, 5.5, -88);
      wall.receiveShadow = true;
      worldGroup.add(wall);
      const merl = [];
      for (let x = -74; x <= 74; x += 2.4) merl.push([x, 11.6, -88, 0, 1, 1, 1]);
      instances(new THREE.BoxGeometry(1.3, 1.3, 3), new THREE.MeshStandardMaterial({ color: "#9a8f80", roughness: 0.9 }), merl);
      const towerTex = T(brickCanvas(22, "#a39886", "#5b544b"), worldTex);
      towerTex.wrapS = towerTex.wrapT = THREE.RepeatWrapping;
      towerTex.repeat.set(6, 4);
      const tMat = new THREE.MeshStandardMaterial({ map: towerTex, roughness: 0.9 });
      const roofMat = new THREE.MeshStandardMaterial({ color: "#3b4f86", roughness: 0.7 });
      for (const x of [-48, -20, 20, 48]) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 18, 16), tMat);
        t.position.set(x, 9, -88);
        t.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 7, 16), roofMat);
        roof.position.set(x, 21.5, -88);
        worldGroup.add(t, roof);
        const ban = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5), new THREE.MeshStandardMaterial({ map: T(shieldCanvas(theme.banner, "#e7b94c"), worldTex), side: THREE.DoubleSide }));
        ban.position.set(x, 12, -83.5);
        worldGroup.add(ban);
      }
      const gate = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 3.4), new THREE.MeshStandardMaterial({ color: "#2b211a", roughness: 1 }));
      gate.position.set(0, 4, -87.8);
      worldGroup.add(gate);
      // low side walls along the lists
      const low = [];
      for (const s of [-1, 1]) for (let z = 0; z > -76; z -= 4) low.push([s * 7.2, 0.5, z, 0, 1, 1, 1]);
      instances(new THREE.BoxGeometry(0.8, 1, 4), stone, low, { receive: true });
      roundTrees(r, scatter(r, 26, { minX: 12, zFar: -80 }));
      for (const z of [-4, -24, -44]) {
        brazier(-6.8, z, 0.8);
        brazier(6.8, z, 0.8);
      }
    } else if (w === 2) {
      // dunes: displaced planes on both sides + behind
      const duneMat = new THREE.MeshStandardMaterial({ color: "#e0b06c", roughness: 1, flatShading: false });
      for (const [x, z, sx, sz] of [[-45, -40, 70, 140], [45, -40, 70, 140], [0, -120, 200, 60]]) {
        const geo = new THREE.PlaneGeometry(sx, sz, 40, 40).rotateX(-Math.PI / 2);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const px = p.getX(i) + x, pz = p.getZ(i) + z;
          const edge = Math.min(1, Math.max(0, (Math.abs(px) - 10) / 14));
          p.setY(i, edge * (3 + 2.5 * Math.sin(px * 0.09 + pz * 0.05) + 1.8 * Math.sin(pz * 0.13 - px * 0.04)));
        }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, duneMat);
        m.position.set(x, 0, z);
        m.receiveShadow = true;
        worldGroup.add(m);
      }
      rocks(r, scatter(r, 40, { minX: 8, maxX: 40 }), "#b9824a", 0.9);
      // cacti
      const cactusMat = new THREE.MeshStandardMaterial({ color: "#4f8a3e", roughness: 0.8 });
      const body = new THREE.CapsuleGeometry(0.28, 2.6, 4, 8).translate(0, 1.6, 0);
      const arm = new THREE.CapsuleGeometry(0.18, 0.9, 4, 8);
      const cpts = scatter(r, 22, { minX: 9, maxX: 34 });
      instances(body, cactusMat, cpts.map(([x, z, k]) => [x, 0, z, k * 6, 1, 0.8 + k * 0.5, 1]));
      instances(arm, cactusMat, cpts.flatMap(([x, z, k]) => [[x + 0.45, 1.9 + k, z, 0, 1, 1, 1], [x - 0.45, 1.4 + k * 0.6, z, 0, 1, 0.8, 1]]));
      // ruined sandstone columns + pyramid
      const sand = new THREE.MeshStandardMaterial({ map: T(brickCanvas(31, "#d9b07a", "#a27a48"), worldTex), roughness: 0.95 });
      const col = new THREE.CylinderGeometry(0.6, 0.7, 1, 12).translate(0, 0.5, 0);
      const cl = [];
      for (let i = 0; i < 8; i++) cl.push([(i % 2 ? 1 : -1) * (12 + r() * 4), 0, -10 - i * 9, 0, 1, 2 + r() * 4, 1]);
      instances(col, sand, cl);
      const pyr = new THREE.Mesh(new THREE.ConeGeometry(45, 38, 4), new THREE.MeshStandardMaterial({ color: "#d4a265", roughness: 1, flatShading: true }));
      pyr.position.set(60, 18, -170);
      pyr.rotation.y = Math.PI / 4;
      worldGroup.add(pyr);
      // palms around a small oasis
      const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 6, 6).translate(0, 3, 0);
      const leafGeo = new THREE.ConeGeometry(0.45, 3.2, 3).rotateX(Math.PI / 2).translate(0, 0, 1.6);
      const palmT = [], palmL = [];
      for (const [x, z] of [[-14, -18], [-16, -22], [-12, -25], [15, -48], [17, -52]]) {
        palmT.push([x, 0, z, r() * 6, 1, 1, 1]);
        for (let k = 0; k < 6; k++) {
          e.set(0.5, (k / 6) * Math.PI * 2, 0, "YXZ");
          q.setFromEuler(e);
          palmL.push({ x, z, q: q.clone() });
        }
      }
      instances(trunkGeo, new THREE.MeshStandardMaterial({ color: "#7a5a36", roughness: 1 }), palmT);
      const lm = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: "#3f7d34", roughness: 0.8, flatShading: true, side: THREE.DoubleSide }), palmL.length);
      palmL.forEach((p, i) => {
        mtx.compose(vP.set(p.x, 6, p.z), p.q, vS.set(1, 1, 1));
        lm.setMatrixAt(i, mtx);
      });
      lm.castShadow = true;
      worldGroup.add(lm);
      const pond = new THREE.Mesh(new THREE.CircleGeometry(4, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#2b8fb8", roughness: 0.1, metalness: 0.3 }));
      pond.position.set(-14, 0.03, -22);
      worldGroup.add(pond);
    } else if (w === 3) {
      pines(r, scatter(r, 90, { minX: 9 }), "#3d2c22", "#2a4f3c", "#f4f8fc");
      // ice crystals
      const crystal = new THREE.OctahedronGeometry(1, 0);
      const iceMat = new THREE.MeshStandardMaterial({ color: "#bfe6ff", roughness: 0.1, metalness: 0.2, emissive: "#3c7fb0", emissiveIntensity: 0.25, flatShading: true });
      instances(crystal, iceMat, scatter(r, 28, { minX: 8, maxX: 30 }).map(([x, z, k]) => [x, 0.6 + k, z, k * 6, 0.5 + k * 0.5, 1.4 + k * 1.5, 0.5 + k * 0.5]));
      rocks(r, scatter(r, 30, { minX: 8, maxX: 40 }), "#d9e4ef", 0.8);
    } else {
      // temple: column rows, ziggurat, braziers, obelisks
      const marbleTex = T(laneCanvas("temple", 41), worldTex);
      const marble = new THREE.MeshStandardMaterial({ map: marbleTex, roughness: 0.4 });
      const gold = new THREE.MeshStandardMaterial({ color: "#d9a441", metalness: 1, roughness: 0.3 });
      const colGeo = new THREE.CylinderGeometry(0.55, 0.6, 9, 16).translate(0, 4.5, 0);
      const capGeo = new THREE.BoxGeometry(1.6, 0.45, 1.6);
      const cols = [], caps = [];
      for (const s of [-1, 1]) {
        for (let z = -2; z > -76; z -= 8) {
          cols.push([s * 9, 0, z, 0, 1, 1, 1]);
          caps.push([s * 9, 9.2, z, 0, 1, 1, 1]);
          caps.push([s * 9, 0.22, z, 0, 1, 1, 1]);
        }
      }
      instances(colGeo, marble, cols);
      instances(capGeo, gold, caps);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 80), marble);
      beam.position.set(-9, 9.8, -38);
      const beam2 = beam.clone();
      beam2.position.x = 9;
      worldGroup.add(beam, beam2);
      for (let i = 0; i < 6; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(60 - i * 8, 3, 30 - i * 4), marble);
        step.position.set(0, 1.5 + i * 3, -100 - i);
        step.receiveShadow = true;
        worldGroup.add(step);
      }
      const shrine = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 6), gold);
      shrine.position.set(0, 21, -105);
      worldGroup.add(shrine);
      const ob = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0);
      instances(ob, gold, [[-20, 0, -60, 0.78, 1.2, 12, 1.2], [20, 0, -60, 0.78, 1.2, 12, 1.2], [-26, 0, -20, 0.78, 1, 9, 1], [26, 0, -20, 0.78, 1, 9, 1]]);
      for (const z of [-6, -30, -54]) {
        brazier(-7.2, z);
        brazier(7.2, z);
      }
      const pl = [];
      for (const z of [-18, -50]) {
        const p = new THREE.PointLight("#ff9a4a", 30, 26, 1.6);
        p.position.set(0, 4, z);
        worldGroup.add(p);
        pl.push(p);
      }
      lights.forEach((l, i) => (l.light = pl[i] || null));
    }
  }

  function buildLevel(L) {
    disposeGroup(levelGroup, levelTex);
    clearArrows();
    level = L;
    targetObjs = L.targets.map((tg) => {
      const g = new THREE.Group();
      const face = new THREE.Mesh(faceGeo, faceMats);
      face.userData.shared = face.userData.sharedMat = true;
      face.scale.set(tg.r, tg.r, 1);
      face.position.z = -TARGET_DEPTH / 2;
      face.castShadow = true;
      g.add(face);
      const n = targetNormal(tg);
      g.rotation.y = Math.atan2(n.x, n.z);
      const m = tg.motion;
      if (!m) {
        // three-legged easel down to the ground
        const legH = tg.y + 0.1;
        for (const [lx, lz, tilt] of [[-0.6, -0.15, 0.12], [0.6, -0.15, -0.12], [0, -0.55, 0]]) {
          const leg = new THREE.Mesh(legGeo, woodMat);
          leg.userData.shared = leg.userData.sharedMat = true;
          leg.scale.y = legH;
          leg.position.set(lx * tg.r, -tg.y, lz);
          leg.rotation.z = tilt;
          if (lz < -0.3) leg.rotation.x = -0.2;
          leg.castShadow = true;
          g.add(leg);
        }
      } else if (m.k === "slide") {
        // hangs from a rail: ropes travel with it, the rail is static (added below)
        const ropeH = 0.7;
        for (const lx of [-0.55, 0.55]) {
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ropeH, 5), ropeMat);
          rope.userData.sharedMat = true;
          rope.position.set(lx * tg.r, tg.r + ropeH / 2, -TARGET_DEPTH / 2);
          g.add(rope);
        }
      } else {
        const ring = new THREE.Mesh(hoverRing, glowMat);
        ring.userData.shared = ring.userData.sharedMat = true;
        ring.scale.setScalar(tg.r);
        ring.position.z = -TARGET_DEPTH / 2;
        g.add(ring);
      }
      levelGroup.add(g);
      if (m && m.k === "slide") {
        const span = m.a + tg.r + 0.6;
        const top = tg.y + tg.r + 0.7;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 0.12, 0.12), woodMat);
        beam.userData.sharedMat = true;
        beam.position.set(tg.x, top, tg.z - TARGET_DEPTH / 2);
        beam.castShadow = true;
        levelGroup.add(beam);
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(legGeo, woodMat);
          post.userData.shared = post.userData.sharedMat = true;
          post.scale.set(1.6, top + 0.1, 1.6);
          post.position.set(tg.x + s * span, 0, tg.z - TARGET_DEPTH / 2);
          post.castShadow = true;
          levelGroup.add(post);
        }
      }
      // soft hover shadow for floaters
      return { g, tg, hit: 0 };
    });
    const w = L.world;
    const mats = {
      wood: new THREE.MeshStandardMaterial({ map: T(plankCanvas(55, 26, 30), levelTex), roughness: 0.85 }),
      stone: new THREE.MeshStandardMaterial({ map: T(brickCanvas(56, ["#8f8a80", "#9d9182", "#d0a875", "#cfe3f2", "#e6ddd0"][w], "#4f4a44"), levelTex), roughness: 0.9 }),
      ice: new THREE.MeshPhysicalMaterial({ color: "#bfe4fb", roughness: 0.08, metalness: 0, transparent: true, opacity: 0.82, clearcoat: 1 }),
      shield: new THREE.MeshStandardMaterial({ map: T(shieldCanvas(["#2f6b34", "#7a1a22", "#9a5a1c", "#1f4f8a", "#4a2a6e"][w], "#e2b44c"), levelTex), roughness: 0.6, metalness: 0.2 }),
    };
    obstacleObjs = L.obstacles.map((ob) => {
      const shield = ob.d <= 0.4;
      const mat = shield ? mats.shield : w === 3 ? mats.ice : w === 0 ? mats.wood : mats.stone;
      const m = new THREE.Mesh(new THREE.BoxGeometry(ob.w, ob.h, ob.d), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      levelGroup.add(m);
      return { m, ob };
    });
    // unused materials still need disposing
    Object.values(mats).forEach((m) => {
      if (!obstacleObjs.some((o) => o.m.material === m)) m.dispose();
    });
    poseLevel(0);
  }

  const cTmp = { x: 0, y: 0, z: 0 };
  function poseLevel(t) {
    if (!level) return;
    for (const o of targetObjs) {
      posAt(o.tg, t, cTmp);
      o.g.position.set(cTmp.x, cTmp.y, cTmp.z);
      if (o.hit > 0) {
        o.hit = Math.max(0, o.hit - 1 / 60);
        o.g.position.z -= Math.sin(o.hit * 40) * o.hit * 0.08;
      }
    }
    for (const o of obstacleObjs) {
      posAt(o.ob, t, cTmp);
      o.m.position.set(cTmp.x, cTmp.y, cTmp.z);
    }
  }

  /* ---------------------------------------------------------------- arrows in the world */
  function clearArrows() {
    for (const s of stuck) {
      s.g.visible = false;
      s.g.removeFromParent();
      stuckPool.push(s.g);
    }
    stuck.length = 0;
    flyer.visible = false;
    trailN = 0;
    trail.visible = false;
  }

  const qa = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const vd = new THREE.Vector3();
  function orient(obj, v) {
    vd.set(v.x, v.y, v.z).normalize();
    qa.setFromUnitVectors(zAxis, vd);
    obj.quaternion.copy(qa);
  }

  /* ---------------------------------------------------------------- camera */
  const cam = { mode: "menu", t: 0, intro: 0, yaw: 0, pitch: 0, fov: 58, kick: 0 };
  let time = 0;
  let levelTime = 0;
  const size = { w: 1, h: 1 };
  const vProj = new THREE.Vector3();
  let windNow = { x: 0, z: 0, s: 0 };

  function updateCamera(dt, st) {
    if (cam.mode === "menu") {
      const a = time * 0.05;
      camera.position.set(Math.sin(a) * 5, 3.2 + Math.sin(a * 0.7) * 0.6, 6);
      camera.fov = 52;
      camera.rotation.set(-0.06, Math.sin(a) * 0.12, 0);
      bowRig.visible = false;
    } else {
      bowRig.visible = true;
      // intro swoop: from high behind to the archer's eye
      const k = cam.intro > 0 ? 1 - Math.pow(cam.intro, 2) : 1;
      cam.intro = Math.max(0, cam.intro - dt / 1.4);
      const ease = k * k * (3 - 2 * k);
      camera.position.set(EYE.x + (1 - ease) * 2.5, EYE.y + (1 - ease) * 6, EYE.z + (1 - ease) * 8);
      cam.kick = Math.max(0, cam.kick - dt * 5);
      camera.rotation.set(st.pitch + (1 - ease) * -0.35 + cam.kick * 0.03, -st.yaw, 0);
      const want = 58 - 16 * st.power - (st.zoom ? 6 : 0);
      cam.fov += (want - cam.fov) * (1 - Math.exp(-dt * 8));
      camera.fov = cam.fov;
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /* bow pose: idle low, raised + string drawn while aiming */
  const nockV = new THREE.Vector3();
  const tipT = new THREE.Vector3(0, 0.6, 0.03);
  const tipB = new THREE.Vector3(0, -0.6, 0.03);
  const yUp = new THREE.Vector3(0, 1, 0);
  let raise = 0;
  function updateBow(dt, st) {
    // 0 = lowered to the lower right, 1 = raised with the riser just left of
    // the line of sight so the target stays visible beside it
    const want = st.drawing ? 1 : st.ready ? 0.3 : 0;
    raise += (want - raise) * (1 - Math.exp(-dt * 9));
    const p = st.power;
    bowRig.position.set(0.27 - raise * 0.355, -0.5 + raise * 0.4, -0.6 - raise * 0.06);
    bowRig.rotation.set(0, 0.06 - raise * 0.1, -0.62 + raise * 0.74);
    // limbs flex inward a touch as they load
    limbTop.scale.z = limbBot.scale.z = 1 + p * 0.25;
    tipT.set(0, 0.6 - p * 0.02, 0.03 + p * 0.012);
    tipB.set(0, -0.6 + p * 0.02, 0.03 + p * 0.012);
    tipTop.position.copy(tipT);
    tipBot.position.copy(tipB);
    const brace = 0.17;
    // anchor short of the eye: a string drawn right to the lens smears into a
    // thick stripe across the corner of the view
    const pull = st.loaded ? p * 0.36 : 0;
    const vib = st.twang > 0 ? Math.sin(st.twang * 90) * st.twang * 0.02 : 0;
    nockV.set(0.012, 0.03, brace + pull + vib);
    for (const [m, tip] of [[strA, tipT], [strB, tipB]]) {
      vd.subVectors(tip, nockV);
      m.position.copy(nockV);
      m.scale.set(1, vd.length(), 1);
      qa.setFromUnitVectors(yUp, vd.normalize());
      m.quaternion.copy(qa);
    }
    nocked.visible = st.loaded;
    if (st.loaded) {
      // nock on the string, tip pointing at the aim far away
      nocked.position.set(nockV.x, nockV.y, nockV.z);
      bowRig.updateMatrixWorld();
      vProj.set(0, 0, -40).applyMatrix4(camera.matrixWorld); // far aim point in world
      bowRig.worldToLocal(vProj);
      vd.subVectors(vProj, nocked.position).normalize();
      nocked.quaternion.setFromUnitVectors(zAxis, vd);
      nocked.position.addScaledVector(vd, 0.78);
    }
  }

  function updateFlags(dt) {
    const s = windNow.s;
    const ang = Math.atan2(-windNow.z, windNow.x); // compass angle the wind blows to
    for (const f of flags) {
      f.pivot.rotation.y = s > 0.2 ? ang : 0.6;
      f.pivot.rotation.z = -(1 - Math.min(1, s / 3)) * 1.1; // limp when calm
      const p = f.geo.attributes.position;
      const amp = 0.04 + Math.min(1, s / 5) * 0.12;
      for (let i = 0; i < p.count; i++) {
        const bx = f.base[i * 3];
        p.setZ(i, Math.sin(bx * 4 - time * (4 + s * 1.5) + f.ph) * amp * bx);
      }
      p.needsUpdate = true;
    }
    for (const l of lights) {
      const k = 0.85 + Math.sin(time * 13 + l.ph) * 0.08 + Math.sin(time * 23 + l.ph * 2) * 0.07;
      l.flame.scale.set(1, k, 1);
      if (l.light) l.light.intensity = 26 * k;
    }
  }

  function updateAmbient(dt) {
    const kind = theme.particle.kind;
    const n = theme.particle.count;
    const wx = windNow.x, wz = windNow.z;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const sd = aSeed[i];
      if (kind === "snow") {
        aPos[j] += (wx * 0.5 + Math.sin(time + sd) * 0.3) * dt;
        aPos[j + 1] -= (0.8 + (sd % 1) * 0.6) * dt;
        aPos[j + 2] += wz * 0.5 * dt;
      } else if (kind === "sand") {
        aPos[j] += (wx * 1.4 + 0.3) * dt;
        aPos[j + 1] += Math.sin(time * 2 + sd) * 0.2 * dt - 0.05 * dt;
        aPos[j + 2] += wz * 1.4 * dt;
      } else if (kind === "ember") {
        aPos[j] += (wx * 0.3 + Math.sin(time * 0.8 + sd) * 0.25) * dt;
        aPos[j + 1] += 0.45 * dt;
        aPos[j + 2] += wz * 0.3 * dt;
      } else {
        aPos[j] += (wx * 0.4 + Math.sin(time * 0.5 + sd) * 0.2) * dt;
        aPos[j + 1] += Math.sin(time * 0.7 + sd * 2) * 0.12 * dt;
        aPos[j + 2] += wz * 0.4 * dt;
      }
      if (aPos[j] > 20) aPos[j] -= 40;
      if (aPos[j] < -20) aPos[j] += 40;
      if (aPos[j + 1] < 0) aPos[j + 1] += 12;
      if (aPos[j + 1] > 12) aPos[j + 1] -= 12;
      if (aPos[j + 2] < -66) aPos[j + 2] += 70;
      if (aPos[j + 2] > 4) aPos[j + 2] -= 70;
    }
    aGeo.attributes.position.needsUpdate = true;
  }

  function updateParticles(dt) {
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) continue;
      const j = i * 3;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pPos[j + 1] = -999;
        continue;
      }
      pVel[j + 1] -= 6 * dt;
      pPos[j] += pVel[j] * dt;
      pPos[j + 1] += pVel[j + 1] * dt;
      pPos[j + 2] += pVel[j + 2] * dt;
      const f = Math.min(1, pLife[i] * 2);
      pCol[j] = pBase[j] * f;
      pCol[j + 1] = pBase[j + 1] * f;
      pCol[j + 2] = pBase[j + 2] * f;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  function emit(p, n, color, speed, life, spread = 1) {
    tmpCol.set(color);
    for (let k = 0; k < n; k++) {
      const i = pNext;
      pNext = (pNext + 1) % PN;
      const j = i * 3;
      pPos[j] = p.x;
      pPos[j + 1] = p.y;
      pPos[j + 2] = p.z;
      const a = Math.random() * Math.PI * 2, b = Math.random() * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      pVel[j] = Math.cos(a) * b * s;
      pVel[j + 1] = Math.abs(Math.sin(a)) * s * 0.8 + s * 0.3;
      pVel[j + 2] = Math.sin(a) * b * s * 0.6 + s * 0.4;
      pBase[j] = tmpCol.r;
      pBase[j + 1] = tmpCol.g;
      pBase[j + 2] = tmpCol.b;
      pLife[i] = life * (0.6 + Math.random() * 0.6);
    }
  }

  /* ---------------------------------------------------------------- frame */
  function update(dt, st) {
    time += dt;
    if (st.levelTime !== undefined) levelTime = st.levelTime;
    windNow = st.wind || windNow;
    updateCamera(dt, st);
    if (cam.mode !== "menu") updateBow(dt, st);
    poseLevel(levelTime);
    // stuck arrows ride along with moving targets / shields
    for (const s of stuck) {
      if (s.ref.kind === "target") {
        posAt(level.targets[s.ref.index], levelTime, cTmp);
        s.g.position.set(cTmp.x + s.off.x, cTmp.y + s.off.y, cTmp.z + s.off.z);
      } else if (s.ref.kind === "obstacle") {
        posAt(level.obstacles[s.ref.index], levelTime, cTmp);
        s.g.position.set(cTmp.x + s.off.x, cTmp.y + s.off.y, cTmp.z + s.off.z);
      }
      if (s.wob > 0) {
        s.wob = Math.max(0, s.wob - dt * 3);
        s.g.quaternion.copy(s.base);
        s.g.rotateX(Math.sin(s.wob * 34) * s.wob * 0.06);
      }
    }
    for (const f of flashes) {
      if (!f.m.visible) continue;
      f.t += dt;
      const k = f.t / 0.55;
      if (k >= 1) {
        f.m.visible = false;
        continue;
      }
      f.m.scale.setScalar(f.r * (0.3 + k * 1.6));
      f.m.material.opacity = (1 - k) * 0.9;
    }
    updateFlags(dt);
    updateAmbient(dt);
    updateParticles(dt);
  }

  return {
    setLevel(L) {
      if (L.world !== worldId) buildWorld(L.world);
      buildLevel(L);
    },
    /** Preview a world in the menus without placing level content. */
    setWorld(w) {
      if (w !== worldId) buildWorld(w);
    },
    setCamMode(mode) {
      cam.mode = mode;
      if (mode === "play") cam.intro = 1;
    },
    skipIntro() {
      cam.intro = 0;
    },
    introDone: () => cam.intro <= 0,
    update,
    render: () => renderer.render(scene, camera),
    /** Flying arrow pose (null hides it). */
    setFlight(p, v) {
      if (!p) {
        flyer.visible = false;
        return;
      }
      flyer.visible = true;
      flyer.position.set(p.x, p.y, p.z);
      orient(flyer, v);
      // trail: shift and push
      if (!trail.visible) {
        trail.visible = true;
        trailN = 0;
      }
      for (let i = Math.min(trailN, TRAIL - 1); i > 0; i--) {
        trailPos[i * 3] = trailPos[(i - 1) * 3];
        trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
        trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
      }
      trailPos[0] = p.x;
      trailPos[1] = p.y;
      trailPos[2] = p.z;
      trailN = Math.min(TRAIL, trailN + 1);
      for (let i = 0; i < TRAIL; i++) {
        const k = i < trailN ? (1 - i / TRAIL) * 0.55 : 0;
        trailCol[i * 3] = k;
        trailCol[i * 3 + 1] = k * 0.92;
        trailCol[i * 3 + 2] = k * 0.75;
      }
      for (let i = trailN; i < TRAIL; i++) {
        trailPos[i * 3] = p.x;
        trailPos[i * 3 + 1] = p.y;
        trailPos[i * 3 + 2] = p.z;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
    },
    /** Leave the arrow where it struck, plus particles/flash for the impact. */
    impact(hit) {
      flyer.visible = false;
      trail.visible = false;
      const pt = hit.point;
      if (hit.kind !== "lost") {
        const g = stuckPool.pop() || makeArrow();
        g.visible = true;
        scene.add(g);
        orient(g, hit.velocity);
        vd.set(hit.velocity.x, hit.velocity.y, hit.velocity.z).normalize();
        const depth = hit.kind === "target" ? 0.1 : hit.kind === "ground" ? 0.22 : 0.05;
        g.position.set(pt.x + vd.x * depth, pt.y + vd.y * depth, pt.z + vd.z * depth);
        const s = { g, ref: { kind: hit.kind, index: hit.index }, off: new THREE.Vector3(), base: g.quaternion.clone(), wob: 1 };
        if (hit.center) s.off.set(g.position.x - hit.center.x, g.position.y - hit.center.y, g.position.z - hit.center.z);
        stuck.push(s);
      }
      if (hit.kind === "target") {
        const o = targetObjs[hit.index];
        if (o) o.hit = 0.3;
        emit(pt, 18, "#e8c56a", 2.2, 0.6);
        if (hit.score >= 10) emit(pt, 40, "#ffe27a", 4, 0.9);
        if (hit.score >= 9) {
          const f = flashes.find((x) => !x.m.visible) || flashes[0];
          f.m.visible = true;
          f.t = 0;
          f.r = level.targets[hit.index].r;
          f.m.position.set(hit.center.x, hit.center.y, hit.center.z);
          const n = targetNormal(level.targets[hit.index]);
          f.m.position.x += n.x * 0.02;
          f.m.position.z += n.z * 0.02;
          f.m.rotation.set(0, Math.atan2(n.x, n.z), 0);
          f.m.material.color.set(hit.perfect ? "#ffffff" : "#ffe27a");
        }
      } else if (hit.kind === "obstacle") {
        emit(pt, 22, ["#b8925c", "#b4aa9a", "#e1c08a", "#dff2ff", "#f0e4c8"][worldId], 2.4, 0.5);
      } else if (hit.kind === "ground") {
        emit(pt, 16, ["#6d8a42", "#7b7a52", "#e7c48c", "#ffffff", "#8a7f86"][worldId], 1.6, 0.6);
      }
    },
    kick() {
      cam.kick = 1;
    },
    clearArrows,
    /** CSS-pixel screen position of a world point (null if behind the camera). */
    project(p) {
      vProj.set(p.x, p.y, p.z).project(camera);
      if (vProj.z > 1) return null;
      return { x: ((vProj.x + 1) / 2) * size.w, y: ((1 - vProj.y) / 2) * size.h };
    },
    resize(w, h) {
      size.w = w;
      size.h = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    dispose() {
      disposeGroup(worldGroup, worldTex);
      disposeGroup(levelGroup, levelTex);
      const geos = new Set();
      const mats = new Set();
      scene.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      });
      stuckPool.forEach((g) => g.traverse((o) => o.geometry && geos.add(o.geometry)));
      [faceGeo, legGeo, hoverRing, ringFx, strGeo, tipCap, ...Object.values(AP)].forEach((g) => geos.add(g));
      [...faceMats, ...nockedMats, woodMat, ropeMat, glowMat, shaftMat, headMat, nockMat, vaneMat].forEach((m) => mats.add(m));
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      persistentTex.forEach((t) => t.dispose());
      groundMat.map = laneMat.map = null;
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
