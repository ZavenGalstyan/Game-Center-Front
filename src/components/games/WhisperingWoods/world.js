/**
 * Whispering Woods — Three.js renderer. Builds the night forest from LAYOUT
 * (instanced trees/rocks/undergrowth, landmark parts, notes, gate, creature)
 * and draws a game state each frame. Holds no game logic.
 */
import * as THREE from "three";
import { LAYOUT, trailDist } from "./sim.js";
import { HALF, GATE, groundY, START } from "./data.js";

const FOG = 0x06090e;

/* ------------------------------------------------------------------ textures */
function noteTexture(text, idx) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const x = c.getContext("2d");
  x.fillStyle = "#d9d2bd";
  x.fillRect(0, 0, 256, 320);
  // stains and grime
  for (let i = 0; i < 26; i++) {
    x.fillStyle = `rgba(${90 + Math.random() * 40},${70 + Math.random() * 30},40,${0.04 + Math.random() * 0.07})`;
    x.beginPath();
    x.arc(Math.random() * 256, Math.random() * 320, 8 + Math.random() * 40, 0, 7);
    x.fill();
  }
  x.strokeStyle = "rgba(60,50,40,0.25)";
  for (let y = 40; y < 320; y += 26) {
    x.beginPath();
    x.moveTo(12, y);
    x.lineTo(244, y);
    x.stroke();
  }
  // hand-written text
  x.fillStyle = "#1b1410";
  x.font = "italic bold 25px Georgia, 'Times New Roman', serif";
  const words = text.toUpperCase().split(" ");
  let line = "", y = 62;
  const lines = [];
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (x.measureText(t).width > 210) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  for (const l of lines) {
    x.save();
    x.translate(22 + Math.random() * 6, y);
    x.rotate((Math.random() - 0.5) * 0.06);
    x.fillText(l, 0, 0);
    x.restore();
    y += 34;
  }
  // a crude scrawled figure: tall body, branch crown
  x.strokeStyle = "#1b1410";
  x.lineWidth = 3;
  const fx = 190 + (idx % 3) * 8, fy = 300;
  x.beginPath();
  x.moveTo(fx, fy);
  x.lineTo(fx, fy - 70);
  x.moveTo(fx - 9, fy);
  x.lineTo(fx, fy - 40);
  x.lineTo(fx + 9, fy);
  x.moveTo(fx - 16, fy - 30);
  x.lineTo(fx, fy - 64);
  x.lineTo(fx + 16, fy - 30);
  for (let i = -2; i <= 2; i++) {
    x.moveTo(fx, fy - 76);
    x.lineTo(fx + i * 7, fy - 94 - Math.abs(i) * -3);
  }
  x.stroke();
  x.beginPath();
  x.arc(fx, fy - 76, 6, 0, 7);
  x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ helpers */
function prismGeo(w, d, h) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

function makeMaterials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o });
  return {
    wood: std(0x4a3a2c),
    darkwood: std(0x2c231b),
    roof: std(0x2a2826),
    glass: std(0x0b0d10, { roughness: 0.25, metalness: 0.3 }),
    rust: std(0x5a3422, { metalness: 0.25, roughness: 0.8 }),
    metal: std(0x3a3b3c, { metalness: 0.5, roughness: 0.6 }),
    tire: std(0x141414),
    tent: std(0x3a4632, { side: THREE.DoubleSide }),
    stone: std(0x55575a),
    char: std(0x121010),
    void: std(0x000000, { roughness: 1 }),
    deadwood: std(0x3b342d),
    rope: std(0x6b5a40),
    cloth: std(0x463a3a),
    logs: std(0x5a4330),
    iron: std(0x1c1d1f, { metalness: 0.6, roughness: 0.5 }),
  };
}

/* ------------------------------------------------------------------ creature */
function buildCreature() {
  const root = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x130f0d, roughness: 1, flatShading: true });
  const bone = new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.7, flatShading: true, emissive: 0x2a2620, emissiveIntensity: 0.6 });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const twig = new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 1, flatShading: true, emissive: 0x0c0a08 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const cyl = (rt, rb, h, m = bark, seg = 6) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(0, -h / 2, 0); // pivot at the top
    return new THREE.Mesh(g, m);
  };
  const joint = (parent, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };
  const hips = joint(root, 0, 1.9, 0);
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = joint(hips, s * 0.13, 0, 0);
    hip.add(cyl(0.075, 0.05, 0.98));
    const knee = joint(hip, 0, -0.98, 0);
    knee.add(cyl(0.05, 0.035, 0.95));
    const foot = joint(knee, 0, -0.95, 0);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 4), bark);
    f.rotation.x = -Math.PI / 2;
    f.position.set(0, -0.02, -0.12);
    foot.add(f);
    legs.push({ hip, knee });
  }
  const spine = joint(hips, 0, 0, 0);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.13, 1.05, 7), bark);
  torso.position.y = 0.52;
  spine.add(torso);
  // ribs
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.19 + i * 0.012, 0.012, 3, 10, Math.PI), bone);
    r.position.set(0, 0.45 + i * 0.13, -0.02);
    r.rotation.set(Math.PI / 2, 0, Math.PI);
    r.scale.set(1, 0.85, 1);
    spine.add(r);
  }
  const chest = joint(spine, 0, 1.02, 0);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = joint(chest, s * 0.3, -0.02, 0);
    sh.add(cyl(0.06, 0.045, 0.85));
    const el = joint(sh, 0, -0.85, 0);
    el.add(cyl(0.045, 0.03, 0.9));
    const hand = joint(el, 0, -0.9, 0);
    for (let f = 0; f < 4; f++) {
      const fg = cyl(0.016, 0.004, 0.36, bark, 4);
      fg.rotation.set(-0.15 + f * 0.04, 0, (f - 1.5) * 0.12 * s);
      fg.position.x = (f - 1.5) * 0.025;
      hand.add(fg);
    }
    arms.push({ sh, el });
  }
  // tattered strips hanging from the shoulders
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 1, side: THREE.DoubleSide });
  const strips = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.PlaneGeometry(0.12, 0.9 + (i % 3) * 0.25);
    g.translate(0, -0.45 - (i % 3) * 0.12, 0);
    const m = new THREE.Mesh(g, stripMat);
    m.position.set((i - 2.5) * 0.1, 0, 0.12 + (i % 2) * 0.03);
    chest.add(m);
    strips.push(m);
  }
  const neck = joint(chest, 0, 0, 0);
  const n = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.3, 5), bark);
  n.position.y = 0.14;
  neck.add(n);
  const head = joint(neck, 0, 0.32, -0.02);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 7), bone);
  skull.scale.set(0.95, 1.45, 1.05);
  skull.position.y = 0.12;
  head.add(skull);
  for (const s of [-1, 1]) {
    const sock = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), black);
    sock.scale.set(1, 1.5, 0.6);
    sock.position.set(s * 0.065, 0.17, -0.15);
    head.add(sock);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.008, 4, 3), eye);
    pupil.position.set(s * 0.065, 0.165, -0.178);
    head.add(pupil);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.02), black);
  mouth.position.set(0, -0.02, -0.165);
  head.add(mouth);
  // crown of twisted branches
  const crown = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const len = 0.6 + ((i * 37) % 5) * 0.12;
    const b = cyl(0.014, 0.045, len, twig, 4);
    b.rotation.set(Math.PI + Math.cos(a) * 0.7 - 0.25, 0, Math.sin(a) * 0.8);
    b.position.set(Math.sin(a) * 0.09, 0.3, Math.cos(a) * 0.06);
    head.add(b);
    const tw = cyl(0.007, 0.02, len * 0.55, twig, 3);
    tw.position.y = -len * 0.7;
    tw.rotation.z = (i % 2 ? 1 : -1) * 0.8;
    b.add(tw);
    crown.push(b);
  }
  root.traverse((o) => {
    o.frustumCulled = false;
  });
  return { root, hips, spine, chest, legs, arms, neck, head, strips, crown };
}

/* ================================================================== world */
export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!container.dataset.preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "ww-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.06);
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 140);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const disposables = [];
  const track = (o) => {
    disposables.push(o);
    return o;
  };

  /* lights */
  const hemi = new THREE.HemisphereLight(0x33415e, 0x0a0907, 0.6);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x7d90c4, 0.3);
  moon.position.set(-30, 60, -20);
  scene.add(moon);
  const flash = new THREE.SpotLight(0xffeccc, 120, 42, 0.5, 0.6, 1.45);
  flash.position.set(0.18, -0.22, 0);
  camera.add(flash);
  const flashTarget = new THREE.Object3D();
  scene.add(flashTarget);
  flash.target = flashTarget;
  const fill = new THREE.PointLight(0x7f8fb5, 0.9, 7, 1.2);
  camera.add(fill);
  const gateLight = new THREE.PointLight(0xffa850, 0, 18, 1.3);
  gateLight.position.set(0, 3.4, GATE.z + 0.6);
  scene.add(gateLight);

  const M = makeMaterials();
  Object.values(M).forEach(track);

  /* sky: moon + stars (ignore fog) */
  const glowTex = track(glowTexture());
  const moonSpr = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: 0xb8c6e8, fog: false, transparent: true, opacity: 0.9, depthWrite: false })));
  moonSpr.scale.set(16, 16, 1);
  scene.add(moonSpr);
  const starGeo = track(new THREE.BufferGeometry());
  {
    const pos = [];
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.35 + Math.random() * 1.1;
      pos.push(Math.cos(a) * Math.cos(e) * 100, Math.sin(e) * 100, Math.sin(a) * Math.cos(e) * 100);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  }
  const stars = new THREE.Points(starGeo, track(new THREE.PointsMaterial({ color: 0x8892aa, size: 0.5, fog: false, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false })));
  scene.add(stars);

  /* ground */
  {
    const S = 210, SEG = 180;
    const g = track(new THREE.PlaneGeometry(S, S, SEG, SEG));
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundY(x, z));
      const td = trailDist(x, z);
      const n = Math.sin(x * 0.9) * Math.cos(z * 1.1) * 0.5 + Math.sin(x * 0.23 + z * 0.31) * 0.5;
      const trail = td < 1.7 ? 1 : td < 2.6 ? (2.6 - td) / 0.9 : 0;
      const grass = new THREE.Color().setHSL(0.24 + n * 0.03, 0.3, 0.085 + n * 0.02);
      const dirt = new THREE.Color().setHSL(0.075, 0.32, 0.2 + n * 0.015);
      c.copy(grass).lerp(dirt, trail * 0.9);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false })));
    scene.add(ground);
  }

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const inst = (geo, mat, count) => {
    const m = new THREE.InstancedMesh(track(geo), mat, count);
    m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    scene.add(m);
    return m;
  };

  /* trees */
  {
    const pines = LAYOUT.trees.filter((t) => !t.dead), dead = LAYOUT.trees.filter((t) => t.dead);
    const trunkMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }));
    const needleMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }));
    const deadMat = track(new THREE.MeshStandardMaterial({ color: 0x2f2a25, roughness: 1, flatShading: true }));
    const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunks = inst(trunkGeo, trunkMat, LAYOUT.trees.length);
    const coneGeo = new THREE.ConeGeometry(1, 1, 7);
    coneGeo.translate(0, 0.5, 0);
    const LAYERS = 4;
    const cones = inst(coneGeo, needleMat, pines.length * LAYERS);
    const branchGeo = new THREE.CylinderGeometry(0.3, 1, 1, 4);
    branchGeo.translate(0, 0.5, 0);
    const branches = inst(branchGeo, deadMat, dead.length * 4);
    let ti = 0, ci = 0, bi = 0;
    for (const t of LAYOUT.trees) {
      const y = groundY(t.x, t.z) - 0.15;
      dummy.position.set(t.x, y, t.z);
      dummy.rotation.set(t.lean, t.rot, t.lean * 0.5);
      dummy.scale.set(t.r, t.dead ? t.h * 0.85 : t.h * 0.75, t.r);
      dummy.updateMatrix();
      trunks.setMatrixAt(ti, dummy.matrix);
      tmpColor.setHSL(0.07, 0.16, 0.042 + (t.rot % 0.5) * 0.03);
      trunks.setColorAt(ti++, tmpColor);
      if (!t.dead) {
        for (let l = 0; l < LAYERS; l++) {
          const f = l / LAYERS;
          const base = t.h * (0.3 + f * 0.17);
          const rad = t.h * 0.2 * (1 - f * 0.22);
          dummy.position.set(t.x, y + base, t.z);
          dummy.rotation.set(t.lean, t.rot + l, 0);
          dummy.scale.set(rad, t.h * (0.34 - f * 0.03), rad);
          dummy.updateMatrix();
          cones.setMatrixAt(ci, dummy.matrix);
          tmpColor.setHSL(0.36 + (t.rot % 0.3) * 0.08, 0.3, 0.06 + f * 0.012 + (t.r - 0.26) * 0.06);
          cones.setColorAt(ci++, tmpColor);
        }
      } else {
        for (let b = 0; b < 4; b++) {
          const a = t.rot + b * 1.7;
          dummy.position.set(t.x, y + t.h * (0.45 + b * 0.1), t.z);
          dummy.rotation.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
          dummy.scale.set(t.r * 0.35, t.h * (0.35 - b * 0.05), t.r * 0.35);
          dummy.updateMatrix();
          branches.setMatrixAt(bi++, dummy.matrix);
        }
      }
    }
    for (const m of [trunks, cones, branches]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  /* rocks */
  {
    const rocks = inst(new THREE.IcosahedronGeometry(1, 0), M.stone, LAYOUT.rocks.length);
    LAYOUT.rocks.forEach((r, i) => {
      dummy.position.set(r.x, groundY(r.x, r.z) - r.r * 0.25, r.z);
      dummy.rotation.set(r.rot, r.rot * 2, 0);
      dummy.scale.set(r.r, r.r * r.sy, r.r * 1.1);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    rocks.computeBoundingSphere();
  }

  /* undergrowth: ferns / grass tufts + fallen branches (no collision) */
  {
    const rnd = (() => {
      let s = 7;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647);
    })();
    const fernGeo = new THREE.ConeGeometry(0.5, 0.6, 5, 1, true);
    fernGeo.translate(0, 0.25, 0);
    const N = 2600;
    const ferns = inst(fernGeo, track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, side: THREE.DoubleSide })), N);
    let k = 0;
    for (let i = 0; i < N * 3 && k < N; i++) {
      const x = (rnd() * 2 - 1) * (HALF + 8), z = (rnd() * 2 - 1) * (HALF + 8);
      if (trailDist(x, z) < 1.8) continue;
      const s = 0.4 + rnd() * 0.9;
      dummy.position.set(x, groundY(x, z) - 0.05, z);
      dummy.rotation.set(Math.PI, rnd() * 6, 0);
      dummy.rotation.x = Math.PI + (rnd() - 0.5) * 0.3;
      dummy.scale.set(s * 1.4, s * 0.8, s * 1.4);
      dummy.updateMatrix();
      ferns.setMatrixAt(k, dummy.matrix);
      tmpColor.setHSL(0.22 + rnd() * 0.12, 0.3, 0.05 + rnd() * 0.04);
      ferns.setColorAt(k++, tmpColor);
    }
    ferns.count = k;
    ferns.computeBoundingSphere();
    const stickGeo = new THREE.CylinderGeometry(0.05, 0.08, 1, 4);
    stickGeo.rotateZ(Math.PI / 2);
    const sticks = inst(stickGeo, M.deadwood, 220);
    for (let i = 0; i < 220; i++) {
      const x = (rnd() * 2 - 1) * HALF, z = (rnd() * 2 - 1) * HALF;
      const s = 1 + rnd() * 2.5;
      dummy.position.set(x, groundY(x, z) + 0.05, z);
      dummy.rotation.set(0, rnd() * 6, (rnd() - 0.5) * 0.1);
      dummy.scale.set(s, 0.6 + rnd() * 0.8, 0.6 + rnd() * 0.8);
      dummy.updateMatrix();
      sticks.setMatrixAt(i, dummy.matrix);
    }
    sticks.computeBoundingSphere();
  }

  /* landmarks */
  const geoCache = new Map();
  const partGeo = (p) => {
    const key = p.k === "box" ? `b${p.w},${p.h},${p.d}` : p.k === "cyl" ? `c${p.rt},${p.rb},${p.h},${p.seg}` : p.k === "prism" ? `p${p.w},${p.d},${p.h}` : `r${p.r}`;
    if (geoCache.has(key)) return geoCache.get(key);
    let g;
    if (p.k === "box") g = new THREE.BoxGeometry(p.w, p.h, p.d);
    else if (p.k === "cyl") g = new THREE.CylinderGeometry(p.rt, p.rb, p.h, p.seg || 8);
    else if (p.k === "prism") g = prismGeo(p.w, p.d, p.h);
    else {
      g = new THREE.IcosahedronGeometry(p.r, 0);
      g.translate(0, p.r * 0.6, 0);
    }
    geoCache.set(key, track(g));
    return g;
  };
  for (const p of LAYOUT.parts) {
    const mesh = new THREE.Mesh(partGeo(p), M[p.m] || M.wood);
    mesh.position.set(p.wx, p.wy, p.wz);
    const e = new THREE.Euler(p.rx || 0, p.rotY, p.rz || 0, "YXZ");
    mesh.rotation.copy(e);
    if (p.k === "rock") mesh.scale.set(1, p.sy || 1, 1.1);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
  }

  /* exit gate */
  const gate = { leaves: [], lamps: [] };
  {
    const gz = GATE.z, gy = groundY(0, gz);
    const pillarGeo = track(new THREE.BoxGeometry(0.7, 3.2, 0.7));
    const capGeo = track(new THREE.BoxGeometry(0.85, 0.2, 0.85));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, M.stone);
      p.position.set(s * 2.65, gy + 1.6, gz);
      scene.add(p);
      const c = new THREE.Mesh(capGeo, M.stone);
      c.position.set(s * 2.65, gy + 3.3, gz);
      scene.add(c);
      const lamp = new THREE.Mesh(track(new THREE.SphereGeometry(0.13, 8, 6)), track(new THREE.MeshStandardMaterial({ color: 0x220a06, emissive: 0x551a0c, emissiveIntensity: 0.6 })));
      lamp.position.set(s * 2.65, gy + 3.6, gz);
      scene.add(lamp);
      gate.lamps.push(lamp);
      // fence wings
      const bars = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4)), M.iron, 36);
      for (let i = 0; i < 36; i++) {
        dummy.position.set(s * (3.2 + i * 0.3), gy + 1.2, gz);
        dummy.rotation.set(0, 0, (i % 7 === 3 ? 0.12 : 0));
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
      }
      bars.computeBoundingSphere();
      scene.add(bars);
      for (const ry of [0.4, 2.2]) {
        const rail = new THREE.Mesh(track(new THREE.BoxGeometry(11, 0.06, 0.06)), M.iron);
        rail.position.set(s * 8.5, gy + ry, gz);
        scene.add(rail);
      }
      // gate leaf: pivot at the pillar
      const pivot = new THREE.Group();
      pivot.position.set(s * 2.3, gy, gz);
      scene.add(pivot);
      const leafBars = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.035, 0.035, 2.8, 4)), M.iron, 8);
      for (let i = 0; i < 8; i++) {
        dummy.position.set(-s * (0.15 + i * 0.29), 1.5, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        leafBars.setMatrixAt(i, dummy.matrix);
      }
      leafBars.computeBoundingSphere();
      pivot.add(leafBars);
      for (const ry of [0.3, 1.5, 2.8]) {
        const r = new THREE.Mesh(track(new THREE.BoxGeometry(2.3, 0.08, 0.06)), M.iron);
        r.position.set(-s * 1.15, ry, 0);
        pivot.add(r);
      }
      gate.leaves.push({ pivot, s });
    }
    const chain = new THREE.Mesh(track(new THREE.TorusGeometry(0.22, 0.04, 4, 10)), M.metal);
    chain.position.set(0, gy + 1.4, gz + 0.08);
    scene.add(chain);
    const lock = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.22, 0.08)), M.rust);
    lock.position.set(0, gy + 1.2, gz + 0.12);
    scene.add(lock);
    gate.chain = [chain, lock];
    // sign
    const sign = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 0.4, 0.05)), M.wood);
    sign.position.set(-4.6, gy + 2.6, gz + 0.12);
    sign.rotation.z = 0.08;
    scene.add(sign);
    // a road beyond the gate
    const road = new THREE.Mesh(track(new THREE.PlaneGeometry(4, 30)), track(new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 })));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, gy + 0.02, gz - 15);
    scene.add(road);
  }

  /* notes */
  const notes = [];
  {
    const geo = track(new THREE.PlaneGeometry(0.3, 0.38));
    for (const n of LAYOUT.notes) {
      const tex = track(noteTexture(n.text, n.i));
      const mat = track(new THREE.MeshStandardMaterial({ map: tex, emissive: 0xfff3d6, emissiveMap: tex, emissiveIntensity: 0.28, roughness: 0.9, side: THREE.FrontSide }));
      const m = new THREE.Mesh(geo, mat);
      m.position.set(n.x, n.y, n.z);
      m.rotation.set(0, n.ry, n.tilt, "YXZ");
      scene.add(m);
      const glow = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })));
      glow.scale.set(0.9, 0.9, 1);
      glow.position.set(n.x + n.nx * 0.06, n.y, n.z + n.nz * 0.06);
      scene.add(glow);
      notes.push({ mesh: m, glow, mat, phase: n.i * 1.7 });
    }
  }

  /* floating motes around the player */
  const motes = (() => {
    const N = 220;
    const geo = track(new THREE.BufferGeometry());
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 24;
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, track(new THREE.PointsMaterial({ color: 0x9aa4b0, map: glowTex, size: 0.06, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, pos, N };
  })();

  /* creature */
  const cr = buildCreature();
  cr.root.visible = false;
  scene.add(cr.root);

  /* menu camera path */
  const menuPath = [[2, 64], [3, 54], [0, 42], [-3, 32], [-6, 22], [-4, 30], [1, 46]];

  /* ------------------------------------------------------------ frame */
  let flick = { t: 0, dip: 0, level: 1, cd: 2 };
  let lightDir = new THREE.Vector3(0, 0, -1);
  let clock = 0;
  let shakeT = 0;
  const fwdV = new THREE.Vector3();

  function updateCreature(g, dt) {
    const m = g.monster;
    const show = m.mode !== "hidden";
    cr.root.visible = show;
    if (!show) return;
    const P = g.player;
    if (m.mode === "lunge") {
      // jump scare: it is right in your face, bending down
      const k = Math.min(1, g.endT / 0.25);
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const d = 2.2 - 1.45 * k;
      cr.root.position.set(P.x + fx * d, P.y - 3.05 + 0.15 * Math.sin(clock * 40) * (1 - k * 0.5), P.z + fz * d);
      cr.root.rotation.set(0, P.yaw + Math.PI, 0);
      cr.spine.rotation.x = 0;
      cr.head.rotation.set(0.1 + Math.sin(clock * 31) * 0.08, Math.sin(clock * 23) * 0.12, Math.sin(clock * 17) * 0.25);
      for (const a of cr.arms) {
        a.sh.rotation.x = 1.5 * k;
        a.el.rotation.x = 0.4;
      }
      return;
    }
    cr.root.position.set(m.x, groundY(m.x, m.z), m.z);
    cr.root.rotation.set(0, m.yaw + Math.PI, 0);
    const chase = m.mode === "chase";
    const ph = m.anim * (chase ? 2.2 : 2.6);
    const amp = Math.min(1, m.speed / 2) * (chase ? 0.75 : 0.45);
    cr.legs[0].hip.rotation.x = Math.sin(ph) * amp;
    cr.legs[1].hip.rotation.x = -Math.sin(ph) * amp;
    cr.legs[0].knee.rotation.x = Math.max(0, -Math.cos(ph)) * amp * 1.2;
    cr.legs[1].knee.rotation.x = Math.max(0, Math.cos(ph)) * amp * 1.2;
    cr.hips.position.y = 1.9 - Math.abs(Math.sin(ph)) * 0.06 * amp;
    const lean = chase ? -0.45 : -0.18;
    cr.spine.rotation.x += (lean - cr.spine.rotation.x) * Math.min(1, dt * 4);
    cr.arms[0].sh.rotation.x = chase ? 0.9 + Math.sin(ph) * 0.3 : -Math.sin(ph) * amp * 0.6;
    cr.arms[1].sh.rotation.x = chase ? 0.9 - Math.sin(ph) * 0.3 : Math.sin(ph) * amp * 0.6;
    for (const a of cr.arms) a.el.rotation.x = chase ? 0.5 : 0.12;
    cr.arms[0].sh.rotation.z = -0.08;
    cr.arms[1].sh.rotation.z = 0.08;
    // head: slow unnatural tilt; twitch when watched
    const tw = m.watched || m.mode === "watch" ? 1 : 0.15;
    cr.head.rotation.z = Math.sin(clock * 0.7) * 0.35 + (Math.random() < 0.08 * tw ? (Math.random() - 0.5) * 0.6 : 0);
    cr.head.rotation.x = -0.25 + (chase ? -0.25 : 0);
    cr.head.rotation.y = (Math.random() < 0.05 * tw ? (Math.random() - 0.5) * 0.5 : cr.head.rotation.y * 0.9);
    cr.strips.forEach((s, i) => {
      s.rotation.x = 0.15 + Math.sin(clock * 1.6 + i) * 0.12 + (chase ? 0.5 : 0);
    });
  }

  function updateFlashlight(g, dt) {
    const P = g.player;
    const on = P.light && P.lightCut <= 0;
    // panic cut-out: the beam fades out smoothly (no strobing) and comes back
    const fade = P.light && P.lightCut > 1.1 ? (P.lightCut - 1.1) / 0.3 : 0;
    flick.cd -= dt;
    const near = g.monster.mode !== "hidden" ? Math.max(0, 1 - g.monster.dist / 16) : 0;
    if (flick.dip > 0) flick.dip -= dt;
    else if (flick.cd <= 0) {
      const chance = 0.04 + near * 0.9;
      if (Math.random() < chance) {
        flick.dip = 0.06 + Math.random() * 0.22;
        flick.level = 0.25 + Math.random() * 0.4;
      }
      flick.cd = 0.25 + Math.random() * (near > 0 ? 0.5 : 4);
    }
    const wobble = 0.97 + Math.sin(clock * 13.7) * 0.015 + Math.sin(clock * 29.3) * 0.01;
    flash.intensity = on ? 120 * wobble * (flick.dip > 0 ? flick.level : 1) : 120 * fade * fade;
    if (g.state === "caught") flash.intensity = 22 * (0.8 + Math.random() * 0.2);
    // beam sways behind the view a little
    camera.getWorldDirection(fwdV);
    lightDir.lerp(fwdV, Math.min(1, dt * 22)).normalize();
    flashTarget.position.copy(camera.position).addScaledVector(lightDir, 10);
  }

  function render(g, dt, opts = {}) {
    if (!(dt >= 0)) dt = 0;
    clock += dt;
    if (g) {
      const P = g.player;
      const sp = Math.min(1, P.speed / 6);
      const bobA = (P.sprinting ? 0.07 : 0.04) * Math.min(1, P.speed / 3);
      let cx = P.x, cy = P.y + Math.sin(P.bob * 2) * bobA, cz = P.z;
      // fear tremor (small) + caught shake
      const fearT = g.fear / 100;
      shakeT = g.state === "caught" ? 1 : Math.max(0, shakeT - dt);
      const sh = 0.012 * fearT * fearT + shakeT * 0.05;
      camera.position.set(cx + (Math.random() - 0.5) * sh, cy + (Math.random() - 0.5) * sh, cz);
      camera.rotation.set(P.pitch, P.yaw, Math.sin(P.bob) * bobA * 0.25 * sp);
      if (g.state === "won") {
        camera.position.y += Math.min(1, g.endT * 0.3) * 0.0;
      }
      updateFlashlight(g, dt);
      updateCreature(g, dt);
      // notes
      g.notes.forEach((n, i) => {
        const v = notes[i];
        v.mesh.visible = v.glow.visible = !n.taken;
        if (!n.taken) {
          const pulse = 0.5 + 0.5 * Math.sin(clock * 1.7 + v.phase);
          v.mat.emissiveIntensity = 0.22 + pulse * 0.18;
          v.glow.material.opacity = 0.08 + pulse * 0.1;
        }
      });
      // gate
      const gt = g.gateT;
      for (const l of gate.leaves) l.pivot.rotation.y = l.s * -gt * 1.75 * (l.s > 0 ? 1 : 1);
      gate.chain.forEach((c) => (c.visible = !g.gateOpen));
      gateLight.intensity = g.gateOpen ? 9 * Math.min(1, gt * 2) * (0.92 + Math.sin(clock * 9) * 0.04) : 0;
      for (const l of gate.lamps) {
        l.material.emissive.setHex(g.gateOpen ? 0xffb35a : 0x551a0c);
        l.material.emissiveIntensity = g.gateOpen ? 2.5 : 0.5 + Math.sin(clock * 2) * 0.15;
      }
    } else {
      // menu: drift slowly along the south trail, looking around
      const t = (clock * 0.018) % (menuPath.length - 1);
      const i = Math.min(menuPath.length - 2, Math.max(0, Math.floor(t))), f = Math.min(1, Math.max(0, t - i));
      const a = menuPath[i], b = menuPath[i + 1];
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      camera.position.set(x, groundY(x, z) + 1.6, z);
      camera.rotation.set(0.02 + Math.sin(clock * 0.21) * 0.05, Math.sin(clock * 0.09) * 0.9, 0);
      flash.intensity = 95 * (0.97 + Math.sin(clock * 13.7) * 0.02) * (Math.random() < 0.01 ? 0.4 : 1);
      camera.getWorldDirection(fwdV);
      lightDir.lerp(fwdV, Math.min(1, dt * 3)).normalize();
      flashTarget.position.copy(camera.position).addScaledVector(lightDir, 10);
      cr.root.visible = false;
      for (const v of notes) v.mesh.visible = v.glow.visible = true;
    }
    // sky follows camera
    moonSpr.position.set(camera.position.x - 40, 55, camera.position.z - 60);
    stars.position.set(camera.position.x, 0, camera.position.z);
    // motes wrap around the camera
    const mp = motes.pos;
    for (let i = 0; i < motes.N; i++) {
      let x = mp[i * 3], y = mp[i * 3 + 1], z = mp[i * 3 + 2];
      y -= dt * 0.12;
      x += Math.sin(clock * 0.5 + i) * dt * 0.08;
      const rx = x + motes.pts.position.x - camera.position.x, rz = z + motes.pts.position.z - camera.position.z;
      if (rx > 12) x -= 24;
      else if (rx < -12) x += 24;
      if (rz > 12) z -= 24;
      else if (rz < -12) z += 24;
      if (y < groundY(camera.position.x, camera.position.z) - 0.5) y += 6;
      mp[i * 3] = x;
      mp[i * 3 + 1] = y;
      mp[i * 3 + 2] = z;
    }
    motes.pts.geometry.attributes.position.needsUpdate = true;
    if (!opts.skip) renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // prime: put the camera at the start so the first frame isn't black
  camera.position.set(START.x, 1.6, START.z);

  function dispose() {
    disposables.forEach((d) => d.dispose?.());
    geoCache.clear();
    cr.root.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { renderer, scene, camera, render, resize, dispose };
}
