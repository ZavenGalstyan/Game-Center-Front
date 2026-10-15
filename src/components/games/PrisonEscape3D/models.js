/**
 * Prison Escape 3D — procedural models + textures (no asset files).
 *
 * `Kit` caches geometries, materials and canvas textures so the whole prison
 * shares a few dozen of each. Prop builders return a THREE.Group whose
 * origin sits on the floor at the prop's centre with its front facing +z;
 * the world rotates it to the prop's facing. Characters are small rigs with
 * pivoting limbs, animated by `animatePerson`.
 */
import * as THREE from "three";

/* ================================================================== kit */
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
  /** Standard material cache. o: map, rough, metal, emissive, ei, opacity, side, alphaTest, add */
  mat(color, o = {}) {
    const key = `${color}|${o.map?.uuid || ""}|${o.rough ?? ""}|${o.metal ?? ""}|${o.emissive ?? ""}|${o.ei ?? ""}|${o.opacity ?? ""}|${o.side ?? ""}|${o.alphaTest ?? ""}|${o.add ? 1 : 0}|${o.basic ? 1 : 0}|${o.tag || ""}`;
    let m = this.mats.get(key);
    if (!m) {
      if (o.basic) {
        m = new THREE.MeshBasicMaterial({ color, map: o.map || null, side: o.side ?? THREE.FrontSide });
      } else {
        m = new THREE.MeshStandardMaterial({ color, map: o.map || null, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide });
        if (o.emissive != null) {
          m.emissive = new THREE.Color(o.emissive);
          m.emissiveIntensity = o.ei ?? 1;
        }
      }
      if (o.opacity != null && o.opacity < 1) {
        m.transparent = true;
        m.opacity = o.opacity;
        m.depthWrite = false;
      }
      if (o.alphaTest) m.alphaTest = o.alphaTest;
      if (o.add) {
        m.transparent = true;
        m.blending = THREE.AdditiveBlending;
        m.depthWrite = false;
      }
      this.mats.set(key, m);
    }
    return m;
  }
  box() {
    return this.geo("box", () => new THREE.BoxGeometry(1, 1, 1));
  }
  cyl(seg = 10) {
    return this.geo("cyl" + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg));
  }
  sphere(seg = 12) {
    return this.geo("sph" + seg, () => new THREE.SphereGeometry(0.5, seg, Math.max(6, seg * 0.6 | 0)));
  }
  plane() {
    return this.geo("plane", () => new THREE.PlaneGeometry(1, 1));
  }
  canvas(key, w, h, draw, repeat = null) {
    let t = this.tex.get(key);
    if (!t) {
      const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
      c.width = w;
      c.height = h;
      draw(c.getContext("2d"), w, h);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
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

/** Mesh helper: m(kit.box(), mat, [x,y,z], [sx,sy,sz], [rx,ry,rz]) */
export function mesh(geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = null) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(p[0], p[1], p[2]);
  if (typeof s === "number") o.scale.setScalar(s);
  else o.scale.set(s[0], s[1], s[2]);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  return o;
}

/* ================================================================== textures */
function rnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function speckle(g, w, h, R, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${R() * alpha})`;
    const s = R() * 2.5 + 0.5;
    g.fillRect(R() * w, R() * h, s, s);
  }
}
export function textures(kit) {
  const T = {};
  T.concrete = kit.canvas("concrete", 512, 512, (g, w, h) => {
    const R = rnd(11);
    g.fillStyle = "#c8c8c8";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = R() * w;
      const y = R() * h;
      const r = 30 + R() * 90;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = R() < 0.5;
      grd.addColorStop(0, `rgba(${dark ? "40,40,40" : "255,255,255"},${0.05 + R() * 0.06})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, w, h, R, 9000, 0.18);
    speckle(g, w, h, R, 4000, 0.12, true);
    // cinder-block joints
    g.strokeStyle = "rgba(60,60,60,0.35)";
    g.lineWidth = 3;
    for (let y = 0; y <= h; y += 128) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      const off = (y / 128) % 2 ? 128 : 0;
      for (let x = off; x <= w; x += 256) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 128);
        g.stroke();
      }
    }
  }, true);
  T.floor = kit.canvas("floor", 512, 512, (g, w, h) => {
    const R = rnd(21);
    g.fillStyle = "#bdbdbd";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, R, 12000, 0.14);
    for (let i = 0; i < 18; i++) {
      const x = R() * w;
      const y = R() * h;
      const r = 20 + R() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(30,30,30,${0.06 + R() * 0.08})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = "rgba(40,40,40,0.4)";
    g.lineWidth = 3;
    g.strokeRect(1, 1, w - 2, h - 2);
  }, true);
  T.tiles = kit.canvas("tiles", 256, 256, (g, w, h) => {
    const R = rnd(31);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? "#d9d4c7" : "#8f9a8c";
        g.fillRect(x * 64, y * 64, 64, 64);
      }
    }
    speckle(g, w, h, R, 3000, 0.1);
    g.strokeStyle = "rgba(50,50,50,0.35)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, h);
      g.moveTo(0, i * 64);
      g.lineTo(w, i * 64);
      g.stroke();
    }
  }, true);
  T.lino = kit.canvas("lino", 256, 256, (g, w, h) => {
    const R = rnd(41);
    g.fillStyle = "#b4b7ae";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, R, 5000, 0.16);
    g.strokeStyle = "rgba(40,40,40,0.25)";
    g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * 128, 0);
      g.lineTo(i * 128, h);
      g.moveTo(0, i * 128);
      g.lineTo(w, i * 128);
      g.stroke();
    }
  }, true);
  T.asphalt = kit.canvas("asphalt", 512, 512, (g, w, h) => {
    const R = rnd(51);
    g.fillStyle = "#7a7a7a";
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, R, 22000, 0.25);
    speckle(g, w, h, R, 6000, 0.12, true);
    g.strokeStyle = "rgba(20,20,20,0.35)";
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = R() * w;
      let y = R() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (R() - 0.5) * 60;
        y += (R() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, true);
  T.grass = kit.canvas("grass", 256, 256, (g, w, h) => {
    const R = rnd(61);
    g.fillStyle = "#6f7f5c";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${R() < 0.5 ? "40,60,30" : "150,170,110"},${R() * 0.35})`;
      g.fillRect(R() * w, R() * h, 1, 2 + R() * 3);
    }
  }, true);
  T.gravel = kit.canvas("gravel", 256, 256, (g, w, h) => {
    const R = rnd(71);
    g.fillStyle = "#8a857c";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const v = 80 + R() * 120;
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      g.beginPath();
      g.arc(R() * w, R() * h, 0.8 + R() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }, true);
  T.grate = kit.canvas("grate", 128, 128, (g, w, h) => {
    g.fillStyle = "#777";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#2a2a2a";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fillRect(x * 16 + 3, y * 16 + 3, 10, 10);
  }, true);
  T.chain = kit.canvas("chain", 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(200,205,210,1)";
    g.lineWidth = 3;
    for (let i = -4; i < 8; i++) {
      g.beginPath();
      g.moveTo(i * 32, 0);
      g.lineTo(i * 32 + 128, 128);
      g.moveTo(i * 32 + 128, 0);
      g.lineTo(i * 32, 128);
      g.stroke();
    }
  }, true);
  T.hazard = kit.canvas("hazard", 128, 32, (g, w, h) => {
    g.fillStyle = "#e3b02a";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1d1d1d";
    for (let x = -32; x < w + 32; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 16 + h, h);
      g.lineTo(x + h, h);
      g.fill();
    }
  }, true);
  T.poster = kit.canvas("poster", 256, 360, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#d7a46b");
    grd.addColorStop(0.55, "#e9d2a2");
    grd.addColorStop(0.56, "#3d7f8f");
    grd.addColorStop(1, "#2b5966");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f6e9c9";
    g.beginPath();
    g.arc(w * 0.62, h * 0.38, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2a3b2a";
    g.fillRect(w * 0.15, h * 0.28, 8, h * 0.3);
    g.beginPath();
    g.ellipse(w * 0.15 + 4, h * 0.28, 40, 14, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.font = "bold 30px Georgia, serif";
    g.textAlign = "center";
    g.fillText("PARADISE", w / 2, h - 46);
    g.font = "16px Georgia, serif";
    g.fillText("one day…", w / 2, h - 22);
    g.fillStyle = "rgba(120,100,70,0.25)";
    for (let i = 0; i < 400; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  });
  T.screen = kit.canvas("screen", 256, 160, (g, w, h) => {
    g.fillStyle = "#0d1a14";
    g.fillRect(0, 0, w, h);
    const R = rnd(81);
    for (let k = 0; k < 4; k++) {
      const x = (k % 2) * 128;
      const y = Math.floor(k / 2) * 80;
      g.fillStyle = `rgb(${30 + R() * 30},${60 + R() * 40},${50 + R() * 30})`;
      g.fillRect(x + 4, y + 4, 120, 72);
      g.strokeStyle = "rgba(160,255,200,0.5)";
      g.strokeRect(x + 4, y + 4, 120, 72);
      g.fillStyle = "rgba(220,255,230,0.7)";
      g.font = "10px monospace";
      g.fillText(`CAM 0${k + 1}`, x + 8, y + 16);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(x + 20 + R() * 60, y + 30, 18, 36);
    }
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(0, y, w, 1);
    }
  });
  T.vending = kit.canvas("vending", 128, 256, (g, w, h) => {
    g.fillStyle = "#1a2433";
    g.fillRect(0, 0, w, h);
    const cols = ["#d94a3a", "#3a7bd9", "#e3b02a", "#4caf50", "#f08a24"];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
      g.fillStyle = cols[(r * 4 + c) % cols.length];
      g.fillRect(10 + c * 22, 18 + r * 32, 16, 24);
    }
    g.fillStyle = "#cfe8ff";
    g.font = "bold 16px sans-serif";
    g.fillText("SNACKS", 30, 240);
  });
  return T;
}

/** A sign texture: text on a plate. style: info | warn | danger */
export function signTexture(kit, text, style) {
  return kit.canvas("sign:" + text + style, 512, 128, (g, w, h) => {
    const bg = style === "danger" ? "#b3261e" : style === "warn" ? "#e3b02a" : "#22313f";
    const fg = style === "warn" ? "#141414" : "#f2f2f2";
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg;
    let size = 54;
    g.font = `800 ${size}px "Inter", "Arial Narrow", Arial, sans-serif`;
    while (g.measureText(text).width > w - 50 && size > 20) {
      size -= 2;
      g.font = `800 ${size}px "Inter", "Arial Narrow", Arial, sans-serif`;
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

/** Floating "?" / "!" alert icon for guards. */
export function alertTexture(kit, ch) {
  return kit.canvas("alert:" + ch, 64, 64, (g) => {
    g.fillStyle = ch === "!" ? "#ff3b30" : "#ffcc00";
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#111";
    g.font = "900 44px Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(ch, 32, 35);
  });
}

/* ================================================================== palette */
export function palette(kit, T) {
  const P = {};
  P.steel = kit.mat(0x8c939b, { rough: 0.45, metal: 0.55 });
  P.darkSteel = kit.mat(0x3c434b, { rough: 0.5, metal: 0.5 });
  P.bars = kit.mat(0x5d656e, { rough: 0.4, metal: 0.7 });
  P.paintSteel = kit.mat(0x4f6b5e, { rough: 0.6, metal: 0.25 });
  P.blueSteel = kit.mat(0x415a73, { rough: 0.55, metal: 0.3 });
  P.orange = kit.mat(0xd9702a, { rough: 0.7 });
  P.yellow = kit.mat(0xe0b02a, { rough: 0.6 });
  P.red = kit.mat(0xa82a24, { rough: 0.6 });
  P.green = kit.mat(0x3e5c43, { rough: 0.7 });
  P.white = kit.mat(0xd6dadc, { rough: 0.35, metal: 0.1 });
  P.wood = kit.mat(0x7b5a3a, { rough: 0.8 });
  P.crate = kit.mat(0x8a6a42, { rough: 0.85 });
  P.mattress = kit.mat(0x8693a0, { rough: 0.95 });
  P.blanket = kit.mat(0x3b4d63, { rough: 0.95 });
  P.pillow = kit.mat(0xc9cdd0, { rough: 0.95 });
  P.cloth = kit.mat(0xd06a28, { rough: 0.95 });
  P.canvasBag = kit.mat(0x5f6f7f, { rough: 0.95 });
  P.black = kit.mat(0x1a1c1f, { rough: 0.6 });
  P.rubber = kit.mat(0x222222, { rough: 0.9 });
  P.glassDark = kit.mat(0x1d2a33, { rough: 0.1, metal: 0.3 });
  P.paper = kit.mat(0xe9e4d6, { rough: 0.9 });
  P.cardboard = kit.mat(0xa7835a, { rough: 0.95 });
  P.screen = kit.mat(0xffffff, { map: T.screen, emissive: 0xffffff, ei: 0.0, basic: true });
  P.vending = kit.mat(0xffffff, { map: T.vending, basic: true });
  P.poster = kit.mat(0xffffff, { map: T.poster, rough: 0.9 });
  P.hazard = kit.mat(0xffffff, { map: T.hazard, rough: 0.8 });
  P.lampOn = kit.mat(0xfff4dc, { basic: true });
  P.lampWarm = kit.mat(0xffc477, { basic: true });
  P.lampRed = kit.mat(0xff3a2a, { basic: true });
  P.lampOff = kit.mat(0x6a6a66, { rough: 0.5 });
  P.ledRed = kit.mat(0xff2a1a, { basic: true });
  P.ledGreen = kit.mat(0x38ff6a, { basic: true });
  P.chain = kit.mat(0xc4c9ce, { map: T.chain, alphaTest: 0.5, side: THREE.DoubleSide, rough: 0.5, metal: 0.6 });
  return P;
}

/* ================================================================== props */
const box = (kit, mat, x, y, z, sx, sy, sz, r) => mesh(kit.box(), mat, [x, y + sy / 2, z], [sx, sy, sz], r);
const cyl = (kit, mat, x, y, z, rad, h, seg = 10) => mesh(kit.cyl(seg), mat, [x, y + h / 2, z], [rad * 2, h, rad * 2]);

/** Builds one prop (local space, front = +z). Returns { group, dyn? }. */
export function buildProp(kit, P, p, w, d, h, R) {
  const g = new THREE.Group();
  const add = (o) => (g.add(o), o);
  switch (p.t) {
    case "bunk": {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(kit, P.steel, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), 0.06, h, 0.06));
      for (const y of [0.38, 1.28]) {
        add(box(kit, P.steel, 0, y, 0, w, 0.06, d));
        add(box(kit, P.mattress, 0, y + 0.06, 0, w - 0.08, 0.13, d - 0.06));
        add(box(kit, P.blanket, 0.25, y + 0.19, 0, w * 0.62, 0.03, d - 0.02));
        add(box(kit, P.pillow, -w / 2 + 0.28, y + 0.19, 0, 0.36, 0.08, d * 0.62));
      }
      for (let i = 0; i < 4; i++) add(box(kit, P.steel, w / 2 - 0.04, 0.5 + i * 0.22, d / 2 + 0.03, 0.04, 0.03, 0.04));
      break;
    }
    case "toilet":
      add(cyl(kit, P.steel, 0, 0, 0.05, 0.2, 0.42, 14));
      add(box(kit, P.steel, 0, 0, -d / 2 + 0.07, 0.38, 0.62, 0.14));
      add(mesh(kit.cyl(14), P.black, [0, 0.43, 0.05], [0.32, 0.01, 0.32]));
      break;
    case "sink":
      add(box(kit, P.steel, 0, 0.66, 0, w, 0.22, d));
      add(mesh(kit.box(), P.darkSteel, [0, 0.885, 0.02], [w - 0.1, 0.01, d - 0.12]));
      add(box(kit, P.steel, 0, 0.88, -d / 2 + 0.06, 0.05, 0.16, 0.05));
      add(box(kit, P.steel, 0, 1.02, -d / 2 + 0.12, 0.04, 0.03, 0.14));
      add(box(kit, P.white, 0, 1.25, -d / 2 + 0.01, 0.34, 0.44, 0.02)); // steel mirror
      break;
    case "celldesk":
      add(box(kit, P.steel, 0, 0.72, 0, w, 0.04, d));
      add(box(kit, P.steel, -w / 2 + 0.05, 0, 0, 0.04, 0.72, d - 0.05));
      add(cyl(kit, P.steel, 0.1, 0, d / 2 + 0.25, 0.17, 0.45, 12));
      add(box(kit, P.paper, 0.15, 0.74, 0.02, 0.22, 0.03, 0.3, [0, 0.3, 0])); // handbook
      add(box(kit, P.orange, -0.2, 0.74, -0.05, 0.12, 0.08, 0.08));
      break;
    case "steeltable":
      add(cyl(kit, P.steel, 0, 0.72, 0, 0.55, 0.05, 16));
      add(cyl(kit, P.steel, 0, 0, 0, 0.07, 0.72, 8));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        add(cyl(kit, P.steel, Math.cos(a) * 0.72, 0.42, Math.sin(a) * 0.72, 0.17, 0.04, 12));
        add(cyl(kit, P.steel, Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72, 0.03, 0.42, 6));
      }
      break;
    case "table":
      add(box(kit, P.steel, 0, 0.73, 0, w, 0.05, 0.85));
      add(box(kit, P.darkSteel, 0, 0, 0, 0.12, 0.73, 0.5));
      for (const sz of [-1, 1]) {
        add(box(kit, P.paintSteel, 0, 0.42, sz * 0.78, w, 0.05, 0.36));
        for (const sx of [-1, 1]) add(box(kit, P.darkSteel, sx * (w / 2 - 0.3), 0, sz * 0.78, 0.06, 0.42, 0.06));
      }
      for (let i = 0; i < 4; i++) {
        const x = -w / 2 + 0.45 + i * (w - 0.9) / 3;
        add(box(kit, P.steel, x, 0.76, (i % 2 ? 1 : -1) * 0.2, 0.34, 0.03, 0.26));
        add(box(kit, P.cloth, x + 0.05, 0.79, (i % 2 ? 1 : -1) * 0.2, 0.08, 0.03, 0.08));
      }
      break;
    case "counter":
      add(box(kit, P.paintSteel, 0, 0, 0, w, 0.95, d));
      add(box(kit, P.steel, 0, 0.95, 0, w + 0.04, 0.06, d + 0.06));
      add(box(kit, kit.mat(0xbfd6de, { opacity: 0.25, rough: 0.05 }), 0, 1.01, 0.12, w, 0.4, 0.02));
      for (let x = -w / 2 + 0.8; x < w / 2 - 0.4; x += 1.4) add(box(kit, P.darkSteel, x, 0.9, -0.05, 0.5, 0.08, 0.34));
      break;
    case "stove":
      add(box(kit, P.steel, 0, 0, 0, w, h, d));
      for (const sx of [-0.22, 0.22]) for (const sz of [-0.18, 0.18]) add(mesh(kit.cyl(12), P.black, [sx, h + 0.01, sz], [0.24, 0.02, 0.24]));
      add(box(kit, P.darkSteel, 0, 0.25, d / 2, w - 0.1, 0.4, 0.02));
      break;
    case "island":
      add(box(kit, P.steel, 0, h - 0.06, 0, w, 0.06, d));
      add(box(kit, P.darkSteel, 0, 0.12, 0, w - 0.1, 0.04, d - 0.1));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(kit, P.steel, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.05, h, 0.05));
      add(box(kit, P.darkSteel, 0, 0.16, 0, w - 0.2, h - 0.3, d - 0.25)); // closed cabinets (blocks sight)
      for (let i = 0; i < 5; i++) add(cyl(kit, P.steel, -w / 2 + 0.6 + i * 1.1, h, 0, 0.16, 0.18, 12));
      break;
    case "fridge":
      add(box(kit, P.white, 0, 0, 0, w, h, d));
      add(box(kit, P.steel, 0.36, 0.9, d / 2 + 0.02, 0.04, 0.6, 0.04));
      add(box(kit, P.darkSteel, 0, 1.2, d / 2 + 0.005, w - 0.02, 0.015, 0.01));
      break;
    case "kshelf":
    case "shelf": {
      const levels = p.t === "kshelf" ? 4 : 4;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(kit, P.steel, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), 0.05, h, 0.05));
      for (let i = 0; i < levels; i++) {
        const y = 0.12 + i * ((h - 0.2) / (levels - 1));
        add(box(kit, P.darkSteel, 0, y, 0, w, 0.03, d));
        if (i === levels - 1) continue;
        let x = -w / 2 + 0.1;
        while (x < w / 2 - 0.3) {
          const bw = 0.25 + R() * 0.45;
          const bh = 0.18 + R() * 0.3;
          if (R() < 0.8 && x + bw < w / 2 - 0.05) {
            const kind = R();
            const mat = p.t === "kshelf" ? (kind < 0.5 ? P.cardboard : kind < 0.75 ? P.white : P.red) : kind < 0.55 ? P.cardboard : kind < 0.75 ? P.blueSteel : kind < 0.9 ? P.crate : P.yellow;
            add(box(kit, mat, x + bw / 2, y + 0.015, (R() - 0.5) * 0.08, bw, Math.min(bh, (h - 0.2) / (levels - 1) - 0.06), d * 0.8));
          }
          x += bw + 0.04;
        }
      }
      break;
    }
    case "washer":
    case "dryer": {
      add(box(kit, p.t === "washer" ? P.white : kit.mat(0xb8bec4, { rough: 0.4, metal: 0.2 }), 0, 0, 0, w - 0.02, h, d - 0.02));
      add(mesh(kit.cyl(20), P.steel, [0, 0.52, d / 2 - 0.005], [0.5, 0.03, 0.5], [Math.PI / 2, 0, 0]));
      add(mesh(kit.cyl(20), P.glassDark, [0, 0.52, d / 2 + 0.01], [0.38, 0.02, 0.38], [Math.PI / 2, 0, 0]));
      add(box(kit, P.darkSteel, 0, h - 0.14, d / 2 - 0.02, w - 0.08, 0.1, 0.03));
      add(mesh(kit.sphere(8), P.ledGreen, [w / 2 - 0.12, h - 0.09, d / 2 + 0.005], [0.03, 0.03, 0.02]));
      break;
    }
    case "cart":
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mesh(kit.cyl(8), P.rubber, [sx * (w / 2 - 0.08), 0.06, sz * (d / 2 - 0.08)], [0.12, 0.05, 0.12], [Math.PI / 2, 0, 0]));
      add(box(kit, P.steel, 0, 0.1, 0, w, 0.04, d));
      add(box(kit, P.canvasBag, 0, 0.14, 0, w - 0.06, h - 0.18, d - 0.06));
      add(box(kit, P.cloth, 0, h - 0.06, 0, w - 0.2, 0.06, d - 0.2));
      add(box(kit, P.steel, 0, h - 0.04, 0, w, 0.04, 0.04));
      break;
    case "foldtable":
      add(box(kit, P.steel, 0, h - 0.05, 0, w, 0.05, d));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(kit, P.steel, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.05, h - 0.05, 0.05));
      for (let i = 0; i < 5; i++) {
        const n = 2 + Math.floor(R() * 4);
        for (let k = 0; k < n; k++) add(box(kit, k % 3 === 2 ? P.pillow : P.cloth, -w / 2 + 0.35 + i * 0.58, h + k * 0.06, (R() - 0.5) * 0.3, 0.42, 0.055, 0.32));
      }
      break;
    case "rack":
      for (const sx of [-1, 1]) add(box(kit, P.steel, sx * (w / 2 - 0.03), 0, 0, 0.04, h, 0.04));
      add(mesh(kit.cyl(6), P.steel, [0, h - 0.05, 0], [0.03, w, 0.03], [0, 0, Math.PI / 2]));
      for (let i = 0; i < 7; i++) add(box(kit, P.cloth, -w / 2 + 0.25 + i * 0.25, h - 0.95, 0, 0.04, 0.85, 0.5));
      for (const sx of [-1, 1]) add(box(kit, P.steel, sx * (w / 2 - 0.03), 0, 0, 0.06, 0.04, d));
      break;
    case "crate":
    case "crate2": {
      const n = p.t === "crate2" ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const s = i ? 0.92 : 1;
        const y = i * (h / n);
        add(box(kit, P.crate, 0, y, 0, w * s, h / n - 0.01, d * s, [0, i ? 0.2 : 0, 0]));
        add(box(kit, P.wood, 0, y + h / n - 0.1, d * s / 2 + 0.005, w * s, 0.06, 0.02, [0, i ? 0.2 : 0, 0]));
      }
      break;
    }
    case "locker":
    case "lockers": {
      const n = p.n || 1;
      const lw = w / n;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + lw / 2 + i * lw;
        add(box(kit, P.blueSteel, x, 0, 0, lw - 0.02, h, d));
        for (let k = 0; k < 4; k++) add(box(kit, P.black, x, h - 0.25 - k * 0.05, d / 2 + 0.004, lw * 0.5, 0.02, 0.01));
        add(box(kit, P.steel, x + lw / 2 - 0.1, 1.0, d / 2 + 0.01, 0.03, 0.14, 0.03));
      }
      break;
    }
    case "desk":
      add(box(kit, P.wood, 0, h - 0.04, 0, w, 0.04, d));
      add(box(kit, P.darkSteel, -w / 2 + 0.25, 0, 0, 0.45, h - 0.04, d - 0.05));
      add(box(kit, P.darkSteel, w / 2 - 0.03, 0, 0, 0.04, h - 0.04, d - 0.05));
      add(box(kit, P.paper, 0.2, h, 0.05, 0.3, 0.01, 0.22, [0, 0.2, 0]));
      add(cyl(kit, P.white, -0.5, h, -0.15, 0.04, 0.1, 8));
      // chair
      add(box(kit, P.black, 0.1, 0.45, d / 2 + 0.35, 0.45, 0.06, 0.45));
      add(box(kit, P.black, 0.1, 0.5, d / 2 + 0.56, 0.45, 0.5, 0.05));
      add(cyl(kit, P.steel, 0.1, 0, d / 2 + 0.35, 0.03, 0.45, 6));
      break;
    case "gdesk":
      add(box(kit, P.wood, 0, h - 0.04, 0, w, 0.04, d));
      add(box(kit, P.darkSteel, 0, 0, -d / 2 + 0.05, w, h - 0.04, 0.06));
      for (const sx of [-1, 1]) add(box(kit, P.darkSteel, sx * (w / 2 - 0.03), 0, 0, 0.05, h - 0.04, d));
      for (let i = 0; i < 3; i++) {
        const x = -0.9 + i * 0.6;
        add(box(kit, P.black, x, h, -0.18, 0.5, 0.34, 0.04, [0, (i - 1) * -0.25, 0]));
        add(mesh(kit.plane(), P.screen, [x, h + 0.17, -0.155], [0.46, 0.3, 1], [0, (i - 1) * -0.25, 0]));
      }
      add(box(kit, P.black, 0.4, h, 0.15, 0.45, 0.02, 0.15));
      add(cyl(kit, P.white, 1.2, h, 0.1, 0.045, 0.11, 8));
      add(box(kit, P.paper, -1.15, h, 0.15, 0.25, 0.015, 0.32));
      // chair (behind the desk = +z side when the desk faces north)
      add(box(kit, P.black, 0, 0.45, -d / 2 - 0.55, 0.5, 0.07, 0.5));
      add(box(kit, P.black, 0, 0.5, -d / 2 - 0.82, 0.5, 0.6, 0.06));
      add(cyl(kit, P.steel, 0, 0, -d / 2 - 0.55, 0.03, 0.45, 6));
      break;
    case "cabinet":
      add(box(kit, P.paintSteel, 0, 0, 0, w, h, d));
      for (let i = 0; i < 4; i++) add(box(kit, P.steel, 0, 0.18 + i * 0.3, d / 2 + 0.01, 0.16, 0.025, 0.02));
      break;
    case "vending":
      add(box(kit, P.red, 0, 0, 0, w, h, d));
      add(mesh(kit.plane(), P.vending, [-0.1, h * 0.55, d / 2 + 0.005], [w * 0.7, h * 0.75, 1]));
      add(box(kit, P.black, 0.36, 0.2, d / 2 + 0.01, 0.2, 0.15, 0.02));
      break;
    case "bench":
      add(box(kit, P.wood, 0, h - 0.05, 0, w, 0.05, d));
      for (const sx of [-1, 1]) add(box(kit, P.darkSteel, sx * (w / 2 - 0.15), 0, 0, 0.06, h - 0.05, d - 0.05));
      break;
    case "generator":
      add(box(kit, P.yellow, 0, 0.1, 0, w, h - 0.1, d));
      add(box(kit, P.darkSteel, 0, 0, 0, w + 0.1, 0.1, d + 0.1));
      for (let i = 0; i < 8; i++) add(box(kit, P.darkSteel, -w / 2 + 0.3 + i * 0.33, 0.5, d / 2 + 0.005, 0.18, 0.8, 0.02));
      add(cyl(kit, P.darkSteel, w / 2 - 0.4, h, -0.4, 0.12, 0.7, 10));
      add(box(kit, P.hazard, 0, h - 0.25, d / 2 + 0.01, w, 0.12, 0.01));
      break;
    case "boiler":
      add(cyl(kit, P.paintSteel, 0, 0, 0, w / 2, h, 18));
      add(mesh(kit.sphere(14), P.paintSteel, [0, h, 0], [w, 0.5, w]));
      for (const a of [0, 1.6, 3.2]) add(mesh(kit.cyl(8), P.steel, [Math.cos(a) * 0.6, h - 0.4, Math.sin(a) * 0.6], [0.14, 1.2, 0.14], [0, 0, 0.6]));
      add(mesh(kit.cyl(14), P.white, [0, 1.4, w / 2 + 0.01], [0.24, 0.03, 0.24], [Math.PI / 2, 0, 0]));
      break;
    case "workbench":
      add(box(kit, P.wood, 0, h - 0.06, 0, w, 0.06, d));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(kit, P.darkSteel, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.06, h - 0.06, 0.06));
      add(box(kit, P.darkSteel, 0, 0.2, 0, w - 0.1, 0.03, d - 0.1));
      add(box(kit, P.red, -1.2, h, 0, 0.5, 0.2, 0.25));
      add(box(kit, P.darkSteel, 1.4, h, 0, 0.18, 0.15, 0.18));
      add(box(kit, P.paintSteel, 0, h, -d / 2 - 0.01, w, 1.0, 0.03)); // pegboard
      add(box(kit, P.paper, 0, h, 0.05, 0.3, 0.03, 0.22)); // logbook
      break;
    case "conveyor":
      add(box(kit, P.darkSteel, 0, 0, 0, w, 0.75, d));
      add(box(kit, P.rubber, 0, 0.75, 0, w - 0.1, 0.04, d));
      add(box(kit, P.blueSteel, 0, 0.8, 0, w + 0.1, 0.9, 1.0));
      add(box(kit, P.black, 0, 0.8, 0.505, w - 0.2, 0.55, 0.01));
      break;
    case "detector": {
      const pw = 0.22;
      for (const sx of [-1, 1]) add(box(kit, P.white, sx * (w / 2 - pw / 2), 0, 0, pw, h, d));
      add(box(kit, P.white, 0, h - 0.18, 0, w, 0.18, d));
      add(mesh(kit.sphere(8), P.ledGreen, [0, h - 0.09, d / 2 + 0.01], [0.05, 0.05, 0.02]));
      break;
    }
    case "bleachers":
      for (let i = 0; i < 3; i++) {
        add(box(kit, P.darkSteel, 0, 0, -d / 2 + 0.55 + i * 1.05, w, 0.45 + i * 0.42, 0.06));
        add(box(kit, P.wood, 0, 0.42 + i * 0.42, -d / 2 + 0.55 + i * 1.05, w, 0.05, 0.5));
      }
      add(box(kit, P.darkSteel, 0, 0, d / 2 - 0.2, w, h, 0.4));
      break;
    case "hoop":
      add(cyl(kit, P.darkSteel, 0, 0, 0, 0.1, 3.1, 8));
      add(box(kit, P.white, 0, 2.7, 0.35, 1.5, 1.0, 0.05));
      add(mesh(kit.geo("torus", () => new THREE.TorusGeometry(0.23, 0.015, 6, 16)), P.orange, [0, 3.05, 0.62], [1, 1, 1], [Math.PI / 2, 0, 0]));
      break;
    case "weights":
      add(box(kit, P.black, 0, 0.35, 0, w, 0.12, 0.35));
      for (const sx of [-1, 1]) add(box(kit, P.darkSteel, sx * 0.5, 0, 0, 0.06, 0.35, 0.3));
      add(mesh(kit.cyl(8), P.steel, [0, 0.95, 0], [0.04, 1.6, 0.04], [0, 0, Math.PI / 2]));
      for (const sx of [-1, 1]) add(mesh(kit.cyl(14), P.black, [sx * 0.65, 0.95, 0], [0.36, 0.07, 0.36], [0, 0, Math.PI / 2]));
      for (const sx of [-1, 1]) add(box(kit, P.steel, sx * 0.45, 0.35, -0.12, 0.04, 0.6, 0.04));
      break;
    case "picnic":
      add(box(kit, P.wood, 0, 0.72, 0, w, 0.05, 0.8));
      for (const sz of [-1, 1]) add(box(kit, P.wood, 0, 0.42, sz * 0.68, w, 0.05, 0.3));
      for (const sx of [-1, 1]) add(box(kit, P.darkSteel, sx * (w / 2 - 0.2), 0, 0, 0.06, 0.72, 1.6));
      break;
    case "dumpster":
      add(box(kit, P.green, 0, 0.12, 0, w, h - 0.12, d));
      add(box(kit, kit.mat(0x2f4734, { rough: 0.7 }), 0, h, 0, w + 0.05, 0.06, d + 0.05, [0.06, 0, 0]));
      for (const sx of [-1, 1]) add(mesh(kit.cyl(8), P.rubber, [sx * (w / 2 - 0.2), 0.08, d / 2 - 0.15], [0.16, 0.08, 0.16], [Math.PI / 2, 0, 0]));
      break;
    case "pole":
      add(cyl(kit, P.darkSteel, 0, 0, 0, 0.12, h, 8));
      add(box(kit, P.darkSteel, 0, h - 0.1, 0, 0.9, 0.08, 0.08));
      break;
    case "tower": {
      const o = w / 2 - 0.2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(kit, P.darkSteel, sx * o, 0, sz * o, 0.25, 6.2, 0.25));
      for (let y = 1.5; y < 6; y += 1.8) {
        add(box(kit, P.darkSteel, 0, y, o, w - 0.3, 0.08, 0.08));
        add(box(kit, P.darkSteel, 0, y, -o, w - 0.3, 0.08, 0.08));
        add(box(kit, P.darkSteel, o, y, 0, 0.08, 0.08, w - 0.3));
        add(box(kit, P.darkSteel, -o, y, 0, 0.08, 0.08, w - 0.3));
      }
      add(box(kit, kit.mat(0x6c7178, { map: textures(kit).concrete }), 0, 6.2, 0, w + 0.3, 0.25, w + 0.3));
      add(box(kit, P.blueSteel, 0, 6.45, 0, w, 0.9, w));
      add(box(kit, kit.mat(0x9fc4d6, { emissive: 0x6b8a99, ei: 0.4, rough: 0.1 }), 0, 7.35, 0, w - 0.1, 0.9, w - 0.1));
      add(box(kit, P.darkSteel, 0, 8.25, 0, w + 0.5, 0.18, w + 0.5));
      add(mesh(kit.geo("roof", () => new THREE.ConeGeometry(1, 1, 4)), P.darkSteel, [0, 8.75, 0], [w * 0.8, 0.8, w * 0.8], [0, Math.PI / 4, 0]));
      break;
    }
    case "tires":
      for (let i = 0; i < 3; i++) add(mesh(kit.geo("tire", () => new THREE.TorusGeometry(0.36, 0.14, 8, 16)), P.rubber, [0, 0.15 + i * 0.28, 0], [1, 1, 1], [Math.PI / 2, 0, i * 0.4]));
      break;
    case "pallet":
      add(box(kit, P.wood, 0, 0, 0, w, 0.12, d));
      add(box(kit, P.cardboard, 0, 0.12, 0, w - 0.1, h - 0.12, d - 0.1));
      add(box(kit, kit.mat(0xd8dde4, { opacity: 0.35, rough: 0.2 }), 0, 0.12, 0, w - 0.06, h - 0.1, d - 0.06));
      break;
    case "barrier":
      add(box(kit, P.hazard, 0, 0.6, 0, w, 0.25, 0.08));
      for (const sx of [-1, 1]) add(box(kit, P.darkSteel, sx * (w / 2 - 0.1), 0, 0, 0.12, 1.0, 0.3));
      break;
    case "pipes":
      for (let i = 0; i < 3; i++) add(cyl(kit, i === 1 ? P.red : P.paintSteel, (i - 1) * 0.16, 0, 0, 0.06, 3.3, 8));
      break;
    default:
      add(box(kit, P.crate, 0, 0, 0, w, h, d));
  }
  return g;
}

/* ================================================================== people */
/**
 * A simple humanoid rig. o: {shirt, pants, skin, hair, cap, guard, beard}
 * Children are pivots so limbs can swing: legs at the hips, arms at the
 * shoulders. Height ≈ 1.8 m.
 */
export function createPerson(kit, o) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shirt = kit.mat(o.shirt, { rough: 0.9 });
  const pants = kit.mat(o.pants ?? o.shirt, { rough: 0.9 });
  const skin = kit.mat(o.skin, { rough: 0.8 });
  const hair = kit.mat(o.hair ?? 0x222222, { rough: 0.9 });
  const boots = kit.mat(0x1c1c1e, { rough: 0.7 });
  const B = kit.box();
  const S = kit.sphere(12);
  const L = kit.geo("limb", () => new THREE.CylinderGeometry(0.5, 0.42, 1, 8).translate(0, -0.5, 0));
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  const torso = mesh(B, shirt, [0, 0.32, 0], [0.44, 0.62, 0.25]);
  hips.add(torso);
  hips.add(mesh(B, pants, [0, 0.0, 0], [0.42, 0.16, 0.24]));
  if (o.guard) {
    hips.add(mesh(B, kit.mat(0x111111, { rough: 0.6 }), [0, 0.06, 0], [0.46, 0.06, 0.27])); // belt
    hips.add(mesh(B, kit.mat(0x111111), [0.2, 0.07, 0.08], [0.07, 0.12, 0.1])); // radio
    hips.add(mesh(B, kit.mat(0xd8b54a, { metal: 0.6, rough: 0.3 }), [0.1, 0.5, 0.13], [0.07, 0.07, 0.01])); // badge
    hips.add(mesh(B, kit.mat(0x1d2533, { rough: 0.8 }), [0, 0.52, 0], [0.47, 0.12, 0.27])); // shoulder yoke
  } else {
    hips.add(mesh(B, kit.mat(0xffffff, { rough: 0.9 }), [-0.12, 0.5, 0.127], [0.1, 0.05, 0.005])); // number patch
  }
  const neck = new THREE.Group();
  neck.position.y = 0.66;
  hips.add(neck);
  neck.add(mesh(kit.cyl(8), skin, [0, 0.05, 0], [0.11, 0.1, 0.11]));
  const head = new THREE.Group();
  head.position.y = 0.2;
  neck.add(head);
  head.add(mesh(S, skin, [0, 0, 0], [0.22, 0.26, 0.24]));
  head.add(mesh(S, skin, [0, -0.03, 0.115], [0.05, 0.06, 0.05])); // nose
  for (const sx of [-1, 1]) head.add(mesh(S, kit.mat(0x111111), [sx * 0.05, 0.03, 0.105], [0.03, 0.025, 0.02]));
  if (o.cap) {
    head.add(mesh(kit.cyl(14), kit.mat(o.cap, { rough: 0.7 }), [0, 0.1, 0], [0.25, 0.09, 0.26]));
    head.add(mesh(B, kit.mat(0x111111, { rough: 0.5 }), [0, 0.07, 0.14], [0.2, 0.02, 0.1]));
    head.add(mesh(B, kit.mat(0xd8b54a, { metal: 0.6, rough: 0.3 }), [0, 0.12, 0.125], [0.05, 0.04, 0.01]));
  } else {
    head.add(mesh(S, hair, [0, 0.05, -0.015], [0.235, 0.21, 0.25]));
  }
  if (o.beard) head.add(mesh(S, hair, [0, -0.09, 0.06], [0.18, 0.12, 0.14]));
  const limb = (x, y, len, mat, thick, end) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const upper = mesh(L, mat, [0, 0, 0], [thick, len * 0.5, thick]);
    pivot.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -len * 0.5;
    pivot.add(knee);
    knee.add(mesh(L, mat, [0, 0, 0], [thick * 0.9, len * 0.5, thick * 0.9]));
    if (end) knee.add(end(len));
    return { pivot, knee };
  };
  const legs = [-1, 1].map((sx) => limb(sx * 0.11, -0.02, 0.93, pants, 0.16, (len) => mesh(B, boots, [0, -len * 0.5 - 0.02, 0.04], [0.13, 0.08, 0.26])));
  const arms = [-1, 1].map((sx) => limb(sx * 0.29, 0.58, 0.66, shirt, 0.12, (len) => mesh(S, skin, [0, -len * 0.5 - 0.04, 0], [0.09, 0.11, 0.09])));
  for (const l of legs) hips.add(l.pivot);
  for (const a of arms) hips.add(a.pivot);
  // guards carry a flashlight (lit at night)
  let torch = null;
  if (o.guard) {
    torch = new THREE.Group();
    torch.add(mesh(kit.cyl(8), kit.mat(0x111111, { rough: 0.5 }), [0, 0, 0], [0.05, 0.22, 0.05], [Math.PI / 2, 0, 0]));
    const lens = mesh(kit.cyl(10), kit.mat(0xfff2c8, { basic: true }), [0, 0, 0.115], [0.06, 0.01, 0.06], [Math.PI / 2, 0, 0]);
    torch.add(lens);
    torch.position.set(0, -0.66 * 0.5 - 0.06, 0.06);
    torch.rotation.x = Math.PI / 2; // point along the forearm
    arms[1].knee.add(torch);
    torch.userData.lens = lens;
  }
  root.userData.rig = { body, hips, head, neck, legs, arms, torch };
  root.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = false;
    }
  });
  return root;
}

/** Drives a rig: speed (m/s), phase (distance-based), pose 'stand'|'sit', look (rad). */
export function animatePerson(root, { speed = 0, phase = 0, pose = "stand", t = 0, torch = false, alert = 0, crouch = false }) {
  const R = root.userData.rig;
  const walk = Math.min(1, speed / 1.6);
  const run = Math.max(0, Math.min(1, (speed - 2.2) / 2));
  const sw = Math.sin(phase * 2.2);
  if (pose === "sit") {
    R.hips.position.y = 0.5;
    for (const l of R.legs) {
      l.pivot.rotation.x = -Math.PI / 2;
      l.knee.rotation.x = Math.PI / 2;
    }
    R.arms.forEach((a, i) => {
      a.pivot.rotation.x = -0.6 + Math.sin(t * 1.3 + i) * 0.05;
      a.knee.rotation.x = -0.5;
      a.pivot.rotation.z = 0;
    });
    R.hips.rotation.x = 0;
    R.head.rotation.x = 0.15 + Math.sin(t * 0.7) * 0.05;
    return;
  }
  const amp = 0.55 * walk + 0.35 * run;
  R.hips.position.y = 0.95 + Math.abs(Math.cos(phase * 2.2)) * 0.04 * walk - (crouch ? 0.25 : 0);
  R.hips.rotation.x = run * 0.18;
  R.legs[0].pivot.rotation.x = sw * amp;
  R.legs[1].pivot.rotation.x = -sw * amp;
  R.legs[0].knee.rotation.x = Math.max(0, -sw) * amp * 1.2 + 0.05;
  R.legs[1].knee.rotation.x = Math.max(0, sw) * amp * 1.2 + 0.05;
  const breathe = Math.sin(t * 1.6) * 0.03;
  R.arms[0].pivot.rotation.x = -sw * amp * 0.8 + breathe;
  R.arms[0].knee.rotation.x = -0.2 - run * 0.9;
  R.arms[0].pivot.rotation.z = -0.06;
  if (torch) {
    // flashlight arm held forward
    R.arms[1].pivot.rotation.x = -1.25 - alert * 0.15;
    R.arms[1].knee.rotation.x = -0.1;
    R.arms[1].pivot.rotation.z = 0.15;
  } else {
    R.arms[1].pivot.rotation.x = sw * amp * 0.8 - breathe;
    R.arms[1].knee.rotation.x = -0.2 - run * 0.9;
    R.arms[1].pivot.rotation.z = 0.06;
  }
  R.head.rotation.x = 0;
}
