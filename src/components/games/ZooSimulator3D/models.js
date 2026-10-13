/**
 * Zoo Simulator 3D — lightweight procedural models (no asset files).
 *
 * Every model is a THREE.Group facing +Z built from shared, cached geometries
 * and materials (`Kit`), with an `update()` that reads the sim's animation
 * channels (move, phase, head, lie) — legs swing, heads dip, bodies lie down.
 */
import * as THREE from "three";

/* ------------------------------------------------------------------ cache */
export class Kit {
  constructor() {
    this.geos = new Map();
    this.mats = new Map();
    this.tex = new Map();
  }
  geo(key, make) {
    let g = this.geos.get(key);
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g;
  }
  mat(color, o = {}) {
    const key = `${color}|${o.map ? o.map.uuid : ""}|${o.flat ? 1 : 0}|${o.side ?? 0}|${o.emissive ?? ""}|${o.opacity ?? 1}|${o.lambert ? 1 : 0}|${o.rough ?? ""}|${o.metal ?? ""}`;
    let m = this.mats.get(key);
    if (!m) {
      const P = o.lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
      m = new P({ color, map: o.map || null, flatShading: !!o.flat, side: o.side ?? THREE.FrontSide });
      if (o.emissive != null) {
        m.emissive = new THREE.Color(o.emissive);
        m.emissiveIntensity = o.ei ?? 1;
      }
      if (o.opacity != null && o.opacity < 1) {
        m.transparent = true;
        m.opacity = o.opacity;
        m.depthWrite = false;
      }
      if (!o.lambert) {
        m.roughness = o.rough ?? 0.82;
        m.metalness = o.metal ?? 0;
      }
      this.mats.set(key, m);
    }
    return m;
  }
  sphere(w = 12, h = 9) {
    return this.geo(`s${w}${h}`, () => new THREE.SphereGeometry(1, w, h));
  }
  box() {
    return this.geo("box", () => new THREE.BoxGeometry(1, 1, 1));
  }
  /** Tapered cylinder of length 1 hanging DOWN from its origin. */
  limb(rt, rb, seg = 7) {
    return this.geo(`l${rt}${rb}${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg).translate(0, -0.5, 0));
  }
  /** Tapered cylinder of length 1 growing UP from its origin. */
  rod(rb, rt, seg = 8) {
    return this.geo(`r${rb}${rt}${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg).translate(0, 0.5, 0));
  }
  cone(seg = 6) {
    return this.geo(`c${seg}`, () => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0));
  }
  canvasTex(key, w, h, draw, repeat = null) {
    let t = this.tex.get(key);
    if (!t) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      draw(c.getContext("2d"), w, h);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (repeat) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat[0], repeat[1]);
      }
      this.tex.set(key, t);
    }
    return t;
  }
  dispose() {
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.tex.values()) t.dispose();
    this.geos.clear();
    this.mats.clear();
    this.tex.clear();
  }
}

/** Mesh helper: geometry, material, position, scale, rotation; casts shadows. */
export function mesh(geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  if (typeof s === "number") m.scale.setScalar(s);
  else m.scale.set(s[0], s[1], s[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}
const grp = (p = [0, 0, 0]) => {
  const g = new THREE.Group();
  g.position.set(p[0], p[1], p[2]);
  return g;
};

/* ------------------------------------------------------------------ textures */
function zebraTex(kit, vertical) {
  return kit.canvasTex(vertical ? "zebraV" : "zebraH", 128, 128, (g, w, h) => {
    g.fillStyle = "#f4f1ea";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1b1b1f";
    const n = 9;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      const c = (i + 0.5) * (w / n);
      for (let t = 0; t <= h; t += 4) {
        const wob = Math.sin(t * 0.09 + i) * 3;
        const thick = 4.2 + Math.sin(t * 0.05 + i * 2) * 1.6;
        if (vertical) g.rect(c + wob - thick / 2, t, thick, 4);
        else g.rect(t, c + wob - thick / 2, 4, thick);
      }
      g.fill();
    }
  });
}
function giraffeTex(kit) {
  return kit.canvasTex("giraffe", 128, 128, (g, w, h) => {
    g.fillStyle = "#f3dfa8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#b8682a";
    const cells = 6;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const cx = (i + 0.5 + (j % 2) * 0.5) * (w / cells);
        const cy = (j + 0.5) * (h / cells);
        g.beginPath();
        const r = w / cells / 2 - 2.5;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + (i * 7 + j) * 0.3;
          const rr = r * (0.75 + ((i * 13 + j * 7 + k * 5) % 5) * 0.06);
          g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      }
    }
  });
}

/** Soft fur/skin grain (white, multiplied by the material colour). */
function furTex(kit, kind = "fur") {
  return kit.canvasTex("fur-" + kind, 256, 256, (g, w, h) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    let seed = kind === "fur" ? 11 : 23;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (kind === "fur") {
      for (let i = 0; i < 2600; i++) {
        const x = R() * w;
        const y = R() * h;
        const v = 200 + Math.floor(R() * 55);
        g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (R() - 0.5) * 3, y + 4 + R() * 5);
        g.stroke();
      }
    } else {
      // wrinkled elephant skin
      for (let i = 0; i < 260; i++) {
        const y = R() * h;
        const v = 175 + Math.floor(R() * 50);
        g.strokeStyle = `rgba(${v},${v},${v},0.6)`;
        g.lineWidth = 1 + R();
        g.beginPath();
        g.moveTo(R() * w, y);
        g.bezierCurveTo(R() * w, y + (R() - 0.5) * 12, R() * w, y + (R() - 0.5) * 12, R() * w, y + (R() - 0.5) * 8);
        g.stroke();
      }
    }
  });
}

/* ------------------------------------------------------------------ quadrupeds */
/**
 * cfg: hip (hip height), body [rx, ry, rz], legs [x, zFront, zBack], legR,
 * neck { y, z, len, r, tilt }, head { s:[rx,ry,rz], z }, mats { body, leg, hoof, head, dark }.
 */
function quadruped(kit, cfg) {
  const root = new THREE.Group();
  const body = grp([0, cfg.hip, 0]);
  root.add(body);
  const torso = mesh(kit.sphere(24, 16), cfg.mats.body, [0, 0, 0], cfg.body);
  body.add(torso);
  if (cfg.belly) body.add(mesh(kit.sphere(12, 8), cfg.belly, [0, -cfg.body[1] * 0.35, 0], [cfg.body[0] * 0.85, cfg.body[1] * 0.7, cfg.body[2] * 0.85]));
  const legs = [];
  const [lx, lzf, lzb] = cfg.legs;
  const legSpec = [
    [lx, lzf, 0], [-lx, lzf, Math.PI], [lx, lzb, Math.PI], [-lx, lzb, 0],
  ];
  for (const [x, z, off] of legSpec) {
    const pivot = grp([x, -cfg.body[1] * 0.25, z]);
    const len = cfg.hip - cfg.body[1] * 0.25;
    pivot.add(mesh(kit.limb(cfg.legR, cfg.legR * 0.7), cfg.mats.leg, [0, 0, 0], [1, len - 0.06, 1]));
    pivot.add(mesh(kit.limb(cfg.legR * 0.78, cfg.legR * 0.85), cfg.mats.hoof, [0, -(len - 0.06), 0], [1, 0.07, 1]));
    pivot.userData.off = off;
    pivot.userData.front = z > 0;
    body.add(pivot);
    legs.push(pivot);
  }
  const neck = grp([0, cfg.neck.y, cfg.neck.z]);
  neck.rotation.x = cfg.neck.tilt;
  body.add(neck);
  if (cfg.neck.len > 0.05) neck.add(mesh(kit.rod(cfg.neck.r, cfg.neck.r * 0.72), cfg.mats.neck || cfg.mats.body, [0, 0, 0], [1, cfg.neck.len, 1]));
  const head = grp([0, cfg.neck.len, 0]);
  head.rotation.x = -cfg.neck.tilt + (cfg.head.pitch || 0);
  neck.add(head);
  head.add(mesh(kit.sphere(18, 12), cfg.mats.head || cfg.mats.body, [0, 0, cfg.head.z], cfg.head.s));
  // eyes
  const eyeMat = kit.mat(0x111111, { rough: 0.15 });
  const shine = kit.mat(0xffffff, { emissive: 0xffffff, ei: 0.6 });
  const es = cfg.head.s;
  const er = cfg.head.eye || 0.028;
  for (const sx of [-1, 1]) {
    const ex = sx * es[0] * 0.82;
    const ey = es[1] * 0.25;
    const ez = cfg.head.z + es[2] * 0.35;
    head.add(mesh(kit.sphere(8, 6), eyeMat, [ex, ey, ez], er, null, false));
    head.add(mesh(kit.sphere(5, 4), shine, [ex + sx * er * 0.45, ey + er * 0.45, ez + er * 0.55], er * 0.32, null, false));
  }
  const tail = grp([0, cfg.body[1] * 0.35, -cfg.body[2] * 0.95]);
  body.add(tail);
  return { root, body, legs, neck, head, tail, torso, baseTilt: cfg.neck.tilt, hip: cfg.hip };
}

function animateQuad(rig, a, dt, o = {}) {
  const move = a.move || 0;
  const amp = (o.amp ?? 0.55) * Math.min(1, move * 1.6);
  for (const l of rig.legs) {
    const fold = rig.lie * (l.userData.front ? -1.35 : 1.35);
    l.rotation.x = Math.sin(a.phase * (o.gait ?? 1) + l.userData.off) * amp * (1 - rig.lie) + fold;
  }
  const lie = rig.lie;
  rig.body.position.y = rig.hip * (1 - lie * (o.lieDrop ?? 0.62)) + Math.abs(Math.sin(a.phase)) * 0.03 * move;
  // head: down to eat/drink/graze; idle sway
  const down = a.head || 0;
  const t = a.phase * 0.35;
  rig.neck.rotation.x = rig.baseTilt + down * (o.neckDown ?? 1.4) + Math.sin(t) * 0.04 * (1 - down) - lie * 0.25;
  rig.head.rotation.y = Math.sin(t * 0.7) * 0.25 * (1 - move) * (1 - down);
  if (rig.tailMesh) rig.tail.rotation.z = Math.sin(a.phase * 1.7) * 0.35;
}

/* ------------------------------------------------------------------ species */
function makeRabbit(kit, a) {
  const tint = [0x9c8b78, 0xd9d2c8, 0x6f5f52, 0xb59877][a.id % 4];
  const fur = kit.mat(tint, { map: furTex(kit) });
  const light = kit.mat(0xf2ede6);
  const root = new THREE.Group();
  const body = grp([0, 0.16, 0]);
  root.add(body);
  body.add(mesh(kit.sphere(), fur, [0, 0, -0.02], [0.14, 0.14, 0.2]));
  body.add(mesh(kit.sphere(8, 6), fur, [0.08, -0.08, -0.08], [0.05, 0.05, 0.11]));
  body.add(mesh(kit.sphere(8, 6), fur, [-0.08, -0.08, -0.08], [0.05, 0.05, 0.11]));
  body.add(mesh(kit.sphere(8, 6), light, [0, 0.02, -0.21], 0.05));
  const head = grp([0, 0.1, 0.15]);
  body.add(head);
  head.add(mesh(kit.sphere(), fur, [0, 0, 0.03], [0.085, 0.085, 0.1]));
  head.add(mesh(kit.sphere(6, 5), kit.mat(0xd98c96), [0, -0.01, 0.125], 0.014, null, false));
  for (const sx of [-1, 1]) head.add(mesh(kit.sphere(6, 5), kit.mat(0x111111), [sx * 0.06, 0.025, 0.07], 0.016, null, false));
  const ears = [];
  for (const sx of [-1, 1]) {
    const e = grp([sx * 0.035, 0.06, -0.01]);
    e.rotation.z = -sx * 0.18;
    e.add(mesh(kit.sphere(8, 6), fur, [0, 0.09, 0], [0.025, 0.1, 0.012]));
    e.add(mesh(kit.sphere(6, 5), kit.mat(0xe8b4b8), [0, 0.09, 0.007], [0.014, 0.075, 0.006], null, false));
    head.add(e);
    ears.push(e);
  }
  return {
    root,
    update(a2, dt) {
      const hop = Math.abs(Math.sin(a2.phase * 0.5)) * 0.13 * Math.min(1, a2.move * 2);
      body.position.y = 0.16 + hop - (a2.lie || 0) * 0.05;
      body.rotation.x = -hop * 1.2;
      head.rotation.x = (a2.head || 0) * 0.6;
      const twitch = Math.sin(a2.phase * 3.1) > 0.97 ? 0.3 : 0;
      ears.forEach((e, i) => (e.rotation.x = -0.2 + hop * 2 + (i ? twitch : 0) - (a2.state === "flee" ? 0.7 : 0)));
    },
  };
}

function makeDeer(kit, a) {
  const rig = quadruped(kit, {
    hip: 0.88, body: [0.24, 0.27, 0.56], legs: [0.13, 0.36, -0.38], legR: 0.045,
    neck: { y: 0.1, z: 0.42, len: 0.5, r: 0.09, tilt: 0.45 },
    head: { s: [0.1, 0.11, 0.2], z: 0.08, pitch: 0.9 },
    mats: { body: kit.mat(0xa0663a, { map: furTex(kit) }), leg: kit.mat(0x8a5530, { map: furTex(kit) }), hoof: kit.mat(0x2a211c, { rough: 0.4 }) },
    belly: kit.mat(0xe7d3b3, { map: furTex(kit) }),
  });
  rig.head.add(mesh(kit.sphere(8, 6), kit.mat(0x2a211c), [0, -0.02, 0.27], [0.04, 0.035, 0.035], null, false));
  for (const sx of [-1, 1]) {
    rig.head.add(mesh(kit.cone(5), kit.mat(0x8a5530), [sx * 0.08, 0.08, 0.0], [0.035, 0.13, 0.02], [0, 0, -sx * 0.9]));
    if (a.male) {
      const ant = grp([sx * 0.05, 0.09, 0.02]);
      ant.rotation.z = -sx * 0.35;
      ant.rotation.x = -0.25;
      const antM = kit.mat(0xd9c8a5);
      ant.add(mesh(kit.rod(0.014, 0.008, 5), antM, [0, 0, 0], [1, 0.32, 1]));
      ant.add(mesh(kit.rod(0.011, 0.006, 5), antM, [0, 0.12, 0], [1, 0.15, 1], [0.7, 0, 0]));
      ant.add(mesh(kit.rod(0.011, 0.006, 5), antM, [0, 0.22, 0], [1, 0.14, 1], [-0.6, 0, sx * 0.3]));
      rig.head.add(ant);
    }
  }
  rig.tail.add(mesh(kit.sphere(8, 6), kit.mat(0xf3eee6), [0, 0, -0.02], [0.05, 0.08, 0.04]));
  return withQuad(rig, { amp: 0.6, neckDown: 1.5 });
}

function makeZebra(kit) {
  const bodyMat = kit.mat(0xffffff, { map: zebraTex(kit, true) });
  const legMat = kit.mat(0xffffff, { map: zebraTex(kit, false) });
  const rig = quadruped(kit, {
    hip: 1.0, body: [0.32, 0.36, 0.78], legs: [0.17, 0.52, -0.52], legR: 0.07,
    neck: { y: 0.14, z: 0.58, len: 0.62, r: 0.15, tilt: 0.55 },
    head: { s: [0.12, 0.14, 0.3], z: 0.12, pitch: 1.0, eye: 0.03 },
    mats: { body: bodyMat, leg: legMat, hoof: kit.mat(0x1a1a1a), neck: bodyMat, head: bodyMat },
  });
  rig.head.add(mesh(kit.sphere(8, 6), kit.mat(0x1d1d1f), [0, -0.03, 0.39], [0.085, 0.09, 0.08]));
  for (const sx of [-1, 1]) rig.head.add(mesh(kit.cone(5), kit.mat(0xf1eee8), [sx * 0.07, 0.13, -0.02], [0.04, 0.13, 0.025], [0, 0, -sx * 0.35]));
  rig.neck.add(mesh(kit.box(), kit.mat(0x1d1d1f), [0, 0.32, -0.11], [0.04, 0.68, 0.09], [-0.12, 0, 0]));
  rig.tail.add(mesh(kit.limb(0.025, 0.02, 5), kit.mat(0xe8e4dc), [0, 0, 0], [1, 0.45, 1], [-0.25, 0, 0]));
  rig.tail.add(mesh(kit.sphere(6, 5), kit.mat(0x1d1d1f), [0, -0.45, -0.1], [0.05, 0.1, 0.05]));
  rig.tailMesh = true;
  return withQuad(rig, { amp: 0.55, neckDown: 1.45 });
}

function makeGiraffe(kit) {
  const tex = giraffeTex(kit);
  const coat = kit.mat(0xffffff, { map: tex });
  const rig = quadruped(kit, {
    hip: 1.75, body: [0.36, 0.42, 0.8], legs: [0.18, 0.5, -0.5], legR: 0.075,
    neck: { y: 0.25, z: 0.6, len: 1.85, r: 0.17, tilt: 0.32 },
    head: { s: [0.12, 0.14, 0.3], z: 0.1, pitch: 1.25, eye: 0.032 },
    mats: { body: coat, leg: coat, hoof: kit.mat(0x3a2a1f), neck: coat, head: kit.mat(0xe8c98b) },
  });
  rig.body.rotation.x = -0.12;
  for (const sx of [-1, 1]) {
    rig.head.add(mesh(kit.rod(0.022, 0.018, 5), kit.mat(0x6b4a2c), [sx * 0.05, 0.1, -0.02], [1, 0.16, 1], [-0.2, 0, -sx * 0.2]));
    rig.head.add(mesh(kit.sphere(6, 5), kit.mat(0x2a1d14), [sx * 0.085, 0.25, -0.05], 0.032));
    rig.head.add(mesh(kit.cone(5), kit.mat(0xe8c98b), [sx * 0.1, 0.05, -0.05], [0.04, 0.12, 0.02], [0, 0, -sx * 1.1]));
  }
  rig.head.add(mesh(kit.sphere(8, 6), kit.mat(0x8c6a4a), [0, -0.02, 0.37], [0.08, 0.08, 0.07]));
  rig.neck.add(mesh(kit.box(), kit.mat(0x8d5527), [0, 0.95, -0.15], [0.035, 1.8, 0.06]));
  rig.tail.add(mesh(kit.limb(0.02, 0.015, 5), kit.mat(0xe8c98b), [0, 0, 0], [1, 0.75, 1], [-0.15, 0, 0]));
  rig.tail.add(mesh(kit.sphere(6, 5), kit.mat(0x2a1d14), [0, -0.75, -0.1], [0.05, 0.12, 0.05]));
  rig.tailMesh = true;
  return withQuad(rig, { amp: 0.42, neckDown: 0.75, lieDrop: 0.5, gait: 0.8 });
}

function makeLion(kit, a) {
  const coat = kit.mat(0xc99a52, { map: furTex(kit) });
  const rig = quadruped(kit, {
    hip: 0.74, body: [0.26, 0.29, 0.74], legs: [0.15, 0.48, -0.48], legR: 0.08,
    neck: { y: 0.12, z: 0.6, len: 0.12, r: 0.16, tilt: 0.9 },
    head: { s: [0.19, 0.19, 0.2], z: 0.08, pitch: 0.9, eye: 0.03 },
    mats: { body: coat, leg: coat, hoof: kit.mat(0xb08443) },
    belly: kit.mat(0xe2c18a),
  });
  rig.head.add(mesh(kit.sphere(10, 8), kit.mat(0xe2c18a), [0, -0.05, 0.21], [0.11, 0.09, 0.1]));
  rig.head.add(mesh(kit.sphere(6, 5), kit.mat(0x3a2418), [0, 0.0, 0.31], [0.04, 0.03, 0.025], null, false));
  for (const sx of [-1, 1]) rig.head.add(mesh(kit.sphere(6, 5), coat, [sx * 0.14, 0.15, 0.0], [0.06, 0.06, 0.03]));
  if (a.male) {
    rig.head.add(mesh(kit.geo("mane", () => new THREE.IcosahedronGeometry(1, 1)), kit.mat(0x7c4a1f, { flat: true }), [0, 0.01, -0.02], [0.36, 0.36, 0.26]));
  }
  const tailMat = kit.mat(0xc99a52);
  rig.tail.add(mesh(kit.limb(0.025, 0.018, 5), tailMat, [0, 0, 0], [1, 0.75, 1], [-0.7, 0, 0]));
  rig.tail.add(mesh(kit.sphere(6, 5), kit.mat(0x5b3518), [0, -0.5, -0.56], 0.06));
  rig.tailMesh = true;
  return withQuad(rig, { amp: 0.5, neckDown: 0.9, lieDrop: 0.6 });
}

function makeElephant(kit) {
  const skin = kit.mat(0x8f8b88, { map: furTex(kit, "skin"), rough: 0.95 });
  const rig = quadruped(kit, {
    hip: 1.55, body: [0.85, 0.95, 1.45], legs: [0.48, 0.85, -0.85], legR: 0.3,
    neck: { y: 0.35, z: 1.25, len: 0.1, r: 0.4, tilt: 0.2 },
    head: { s: [0.6, 0.62, 0.55], z: 0.15, pitch: 0, eye: 0.05 },
    mats: { body: skin, leg: skin, hoof: kit.mat(0xd8d2c8) },
  });
  const ears = [];
  for (const sx of [-1, 1]) {
    const e = grp([sx * 0.5, 0.1, -0.05]);
    e.add(mesh(kit.geo("ear", () => new THREE.CircleGeometry(1, 14)), kit.mat(0x9a8f8f, { side: THREE.DoubleSide }), [sx * 0.35, -0.15, 0], [0.45, 0.6, 1], [0, sx * 1.35, 0]));
    rig.head.add(e);
    ears.push(e);
  }
  // trunk: chain of segments
  const segs = [];
  let parent = grp([0, -0.15, 0.62]);
  rig.head.add(parent);
  let r = 0.17;
  for (let i = 0; i < 5; i++) {
    const s = grp([0, 0, 0]);
    s.add(mesh(kit.limb(r, r * 0.85), skin, [0, 0, 0], [1, 0.32, 1]));
    parent.add(s);
    segs.push(s);
    const next = grp([0, -0.3, 0]);
    s.add(next);
    parent = next;
    r *= 0.85;
  }
  const ivory = kit.mat(0xf3ecdc);
  for (const sx of [-1, 1]) rig.head.add(mesh(kit.cone(6), ivory, [sx * 0.22, -0.3, 0.42], [0.06, 0.5, 0.06], [2.2, 0, 0]));
  rig.tail.add(mesh(kit.limb(0.04, 0.03, 5), skin, [0, 0, 0], [1, 0.7, 1], [-0.2, 0, 0]));
  rig.tailMesh = true;
  const q = withQuad(rig, { amp: 0.32, neckDown: 0.35, lieDrop: 0.45, gait: 0.7 });
  const base = q.update;
  q.update = (a, dt) => {
    base(a, dt);
    const t = a.phase;
    const eat = a.head || 0;
    segs.forEach((s, i) => {
      s.rotation.x = 0.12 + Math.sin(t * 0.6 + i * 0.6) * 0.1 + eat * (i < 2 ? 0.05 : -0.55);
    });
    ears.forEach((e, i) => (e.rotation.y = (i ? -1 : 1) * Math.sin(t * 0.8) * 0.15));
  };
  return q;
}

function withQuad(rig, o) {
  rig.lie = 0;
  return {
    root: rig.root,
    update(a, dt) {
      rig.lie = a.lie || 0;
      animateQuad(rig, a, dt, o);
    },
  };
}

const MAKERS = { rabbit: makeRabbit, deer: makeDeer, zebra: makeZebra, giraffe: makeGiraffe, lion: makeLion, elephant: makeElephant };

/** { root, update(animal, dt) } — root faces +Z. */
export function createAnimal(kit, a) {
  return MAKERS[a.species](kit, a);
}

/* ------------------------------------------------------------------ people */
const SKINS = [0xf1c9a5, 0xe0ac84, 0xc68c5e, 0x8d5a3b, 0x5c3a24, 0xf6d7bf];
const SHIRTS = [0xe85d4a, 0x3c8dde, 0xf2b632, 0x55b06a, 0x9b59d0, 0xf07fb0, 0x2fb8b0, 0xffffff, 0xff8f3a, 0x4a5bd4];
const PANTS = [0x2e3a59, 0x4a4a4a, 0x6b4f3a, 0x1f5f8b, 0xc9b38f, 0x333333];
const HAIR = [0x2a1d14, 0x4a3020, 0x7a5230, 0xc9a050, 0x111111, 0x8a8a8a];

/**
 * look: { seed, kid, uniform?: color, hat?: color, carry?: "bucket"|"broom" }.
 * update(walker) reads move/phase/rot.
 */
export function createPerson(kit, look) {
  let s = look.seed || 1;
  const pick = (arr) => arr[(s = (s * 9301 + 49297) % 233280) % arr.length];
  const skin = kit.mat(pick(SKINS));
  const shirt = kit.mat(look.uniform ?? pick(SHIRTS));
  const pants = kit.mat(look.uniform ? 0x3b3f46 : pick(PANTS));
  const hairM = kit.mat(pick(HAIR));
  const sc = look.kid ? 0.68 : 1;
  const root = new THREE.Group();
  const fig = grp([0, 0, 0]);
  fig.scale.setScalar(sc);
  root.add(fig);
  const hipY = 0.92;
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = grp([sx * 0.1, hipY, 0]);
    l.add(mesh(kit.limb(0.075, 0.06), pants, [0, 0, 0], [1, hipY - 0.06, 1]));
    l.add(mesh(kit.box(), kit.mat(0x2b2b2b), [0, -hipY + 0.04, 0.04], [0.11, 0.08, 0.22]));
    fig.add(l);
    legs.push(l);
  }
  fig.add(mesh(kit.rod(0.19, 0.2, 9), shirt, [0, hipY - 0.04, 0], [1, 0.58, 0.8]));
  fig.add(mesh(kit.sphere(10, 6), shirt, [0, hipY + 0.52, 0], [0.21, 0.08, 0.16]));
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = grp([sx * 0.25, hipY + 0.5, 0]);
    a.add(mesh(kit.limb(0.055, 0.045), shirt, [0, 0, 0], [1, 0.3, 1]));
    a.add(mesh(kit.limb(0.045, 0.04), skin, [0, -0.3, 0], [1, 0.26, 1]));
    a.add(mesh(kit.sphere(6, 5), skin, [0, -0.58, 0], 0.05, null, false));
    fig.add(a);
    arms.push(a);
  }
  const head = grp([0, hipY + 0.72, 0]);
  fig.add(head);
  head.add(mesh(kit.rod(0.05, 0.05, 6), skin, [0, -0.14, 0], [1, 0.1, 1], null, false));
  head.add(mesh(kit.sphere(12, 9), skin, [0, 0, 0], [0.13, 0.15, 0.135]));
  head.add(mesh(kit.sphere(10, 6), hairM, [0, 0.04, -0.015], [0.14, 0.13, 0.14]));
  for (const sx of [-1, 1]) head.add(mesh(kit.sphere(5, 4), kit.mat(0x1a1a1a), [sx * 0.045, 0.01, 0.12], 0.017, null, false));
  if (look.hat != null || (!look.uniform && (s % 5 === 0))) {
    const hc = kit.mat(look.hat ?? pick(SHIRTS));
    head.add(mesh(kit.rod(0.145, 0.14, 10), hc, [0, 0.07, -0.01], [1, 0.08, 1]));
    head.add(mesh(kit.sphere(10, 6), hc, [0, 0.12, -0.01], [0.145, 0.07, 0.145]));
    head.add(mesh(kit.box(), hc, [0, 0.08, 0.13], [0.2, 0.02, 0.12]));
  }
  let tool = null;
  if (look.carry === "bucket") {
    tool = grp([0, -0.6, 0.02]);
    tool.add(mesh(kit.rod(0.09, 0.11, 10), kit.mat(0x8f9aa3), [0, -0.22, 0], [1, 0.22, 1]));
    tool.add(mesh(kit.rod(0.085, 0.085, 10), kit.mat(0xc9a35a), [0, -0.03, 0], [1, 0.02, 1], null, false));
    arms[1].add(tool);
  } else if (look.carry === "broom") {
    tool = grp([0, -0.58, 0.05]);
    tool.rotation.x = 0.5;
    tool.add(mesh(kit.rod(0.02, 0.02, 5), kit.mat(0xa77b4a), [0, -0.8, 0], [1, 1.3, 1]));
    tool.add(mesh(kit.box(), kit.mat(0xd8b85a), [0, -0.85, 0], [0.32, 0.12, 0.08]));
    arms[1].add(tool);
  }
  return {
    root,
    update(w, dt) {
      const move = w.move || 0;
      const sw = Math.sin(w.phase || 0) * 0.55 * move;
      legs[0].rotation.x = sw;
      legs[1].rotation.x = -sw;
      arms[0].rotation.x = -sw * 0.8;
      arms[1].rotation.x = tool ? 0.1 + (w.act ? Math.sin((w.phase || 0) * 6 + performance.now() * 0.012) * 0.5 : 0) : sw * 0.8;
      fig.position.y = Math.abs(Math.cos(w.phase || 0)) * 0.035 * move;
      if (w.wave) {
        arms[0].rotation.z = -2.4 + Math.sin(performance.now() * 0.008) * 0.35;
        arms[0].rotation.x = 0;
      } else arms[0].rotation.z = 0;
      head.rotation.y = w.state === "watch" ? Math.sin((w.timer || 0) * 0.8) * 0.3 : 0;
    },
  };
}

/* ------------------------------------------------------------------ first-person tools */
/** Held-tool models parented to the camera; returns { group, set(kind), update(dt, info) }. */
export function createHands(kit) {
  const group = new THREE.Group();
  const hand = grp([0.3, -0.12, -0.55]);
  group.add(hand);

  const tools = {};
  // food bucket
  {
    const g = grp([0.04, -0.13, -0.02]);
    g.rotation.x = 0.4;
    g.scale.setScalar(0.72);
    const metal = kit.mat(0xa9b4bc, { std: true, rough: 0.45, metal: 0.3 });
    const shell = kit.geo("bucket", () => new THREE.CylinderGeometry(0.15, 0.115, 0.24, 16, 1, true).translate(0, -0.12, 0));
    g.add(mesh(shell, kit.mat(0xd5dde3, { side: THREE.DoubleSide, rough: 0.35, metal: 0.55 }), [0, 0, 0], 1, null, false));
    g.add(mesh(kit.rod(0.115, 0.115, 16), metal, [0, -0.245, 0], [1, 0.01, 1], null, false));
    const fill = mesh(kit.geo("feed", () => new THREE.CylinderGeometry(0.142, 0.12, 0.2, 14).translate(0, 0.1, 0)), kit.mat(0xc8a24a, { flat: true }), [0, -0.235, 0], 1, null, false);
    g.add(fill);
    const pellets = mesh(kit.geo("pell", () => new THREE.IcosahedronGeometry(1, 0)), kit.mat(0x9c6b2f, { flat: true }), [0.03, -0.01, 0.02], [0.06, 0.03, 0.05], null, false);
    g.add(pellets);
    const handle = mesh(kit.geo("handle", () => new THREE.TorusGeometry(0.15, 0.008, 5, 16, Math.PI)), metal, [0, 0.0, 0], 1, null, false);
    g.add(handle);
    g.userData.fill = [fill, pellets];
    tools[0] = g;
  }
  // water jug
  {
    const g = grp([0.05, -0.1, 0]);
    g.scale.setScalar(0.7);
    const blue = kit.mat(0x3b8fd9, { std: true, rough: 0.3 });
    g.add(mesh(kit.box(), blue, [0, -0.1, 0], [0.2, 0.26, 0.13], null, false));
    g.add(mesh(kit.rod(0.035, 0.03, 8), kit.mat(0xf4f4f4), [0.05, 0.03, 0], [1, 0.06, 1], null, false));
    g.add(mesh(kit.box(), kit.mat(0x2a6fb0), [-0.03, 0.05, 0], [0.12, 0.03, 0.04], null, false));
    const water = mesh(kit.box(), kit.mat(0x8fd3ff, { opacity: 0.7 }), [0, -0.1, 0.066], [0.17, 0.2, 0.004], null, false);
    g.add(water);
    g.userData.water = water;
    tools[1] = g;
  }
  // broom
  {
    const g = grp([-0.02, 0.06, 0]);
    g.rotation.set(0.55, 0, 0.18);
    g.add(mesh(kit.rod(0.016, 0.016, 6), kit.mat(0xb58550), [0, -1.0, 0], [1, 1.08, 1], null, false));
    g.add(mesh(kit.box(), kit.mat(0xd9302a), [0, -1.0, 0], [0.12, 0.06, 0.07], null, false));
    g.add(mesh(kit.box(), kit.mat(0xe7c35b), [0, -1.1, 0], [0.26, 0.16, 0.06], null, false));
    tools[2] = g;
  }
  for (const k of [0, 1, 2]) {
    tools[k].visible = false;
    hand.add(tools[k]);
  }
  let cur = -1;
  let swap = 1;
  let use = 0;
  let bobT = 0;
  return {
    group,
    use() {
      use = 1;
    },
    update(dt, info) {
      if (info.tool !== cur) {
        cur = info.tool;
        swap = 0;
        for (const k of [0, 1, 2]) tools[k].visible = k === cur;
      }
      swap = Math.min(1, swap + dt * 4);
      use = Math.max(0, use - dt * 2.2);
      bobT += dt * (info.moving > 0.3 ? (info.sprint ? 13 : 9) : 1.5);
      const amp = info.moving > 0.3 ? (info.sprint ? 0.028 : 0.016) : 0.004;
      const u = Math.sin(use * Math.PI);
      hand.position.set(0.3 + Math.cos(bobT * 0.5) * amp, -0.12 - (1 - swap) * 0.4 + Math.abs(Math.sin(bobT * 0.5)) * amp - u * 0.05, -0.55 - u * 0.12);
      hand.rotation.set(cur === 2 ? -u * 1.1 : -u * 0.5, cur === 2 ? u * 0.6 : 0, cur === 0 ? u * 0.7 : 0);
      const [fill, pel] = tools[0].userData.fill;
      const f = info.food / info.foodCap;
      fill.visible = pel.visible = f > 0;
      fill.scale.y = Math.max(0.05, f);
      pel.position.y = -0.235 + 0.2 * f;
      const w = tools[1].userData.water;
      const wf = Math.max(0.05, info.water / info.waterCap);
      w.visible = info.water > 0;
      w.scale.y = 0.2 * wf;
      w.position.y = -0.2 + 0.1 * wf;
    },
  };
}
