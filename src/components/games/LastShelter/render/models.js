/**
 * Last Shelter — stylised furniture and item models built from rounded
 * primitives. Geometries and materials are cached per kit (one kit per
 * world) so hundreds of pieces share a handful of GPU buffers; kit.dispose()
 * frees them all.
 *
 * Builders work in local space: front faces +z, width W along x, depth D
 * along z, sitting on y = 0. house3d.js rotates them into place.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export function createKit(T) {
  const geos = new Map();
  const mats = new Map();
  const g = (key, make) => {
    let x = geos.get(key);
    if (!x) geos.set(key, (x = make()));
    return x;
  };
  const rbox = (w, h, d, r = 0.035) => {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return g(`rb${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${rr.toFixed(3)}`, () => (rr > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d)));
  };
  const cyl = (rt, rb, h, seg = 16) => g(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  const sph = (r, seg = 16) => g(`sp${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75)));
  const mat = (color, o = {}) => {
    const key = `${color}|${o.rough ?? 0.75}|${o.metal ?? 0}|${o.emissive || ""}|${o.ei ?? 0}|${o.map ? o.map.uuid : ""}|${o.opacity ?? 1}|${o.side ?? 0}`;
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0, map: o.map || null });
      if (o.emissive) {
        m.emissive = new THREE.Color(o.emissive);
        m.emissiveIntensity = o.ei ?? 1;
      }
      if (o.opacity != null && o.opacity < 1) {
        m.transparent = true;
        m.opacity = o.opacity;
        m.depthWrite = false;
      }
      if (o.side) m.side = o.side;
      mats.set(key, m);
    }
    return m;
  };
  const mesh = (geo, m, x = 0, y = 0, z = 0, parent) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    if (parent) parent.add(o);
    return o;
  };
  /** Rounded box resting on y (bottom at y). */
  const box = (p, w, h, d, color, x = 0, y = 0, z = 0, o = {}) => mesh(rbox(w, h, d, o.r ?? 0.035), mat(color, o), x, y + h / 2, z, p);
  const shadeOf = (hex, k) => {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, k);
    return `#${c.getHexString()}`;
  };

  /* ---------------------------------------------------------------- furniture */
  const F = {};
  F.bed = (p, W, D, f) => {
    box(p, W, 0.28, D, "#8c5e3c", 0, 0.08, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, 0.08, 0.1, 0.08, "#6b4426", sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06));
    box(p, W - 0.08, 0.16, D - 0.1, "#f4efe6", 0, 0.36, 0.02, { r: 0.06 });
    box(p, W - 0.04, 0.1, D * 0.62, f.color, 0, 0.47, D * 0.17, { r: 0.05 });
    box(p, W - 0.03, 0.05, 0.12, shadeOf(f.color, 0.12), 0, 0.53, D * 0.17 - D * 0.31 + 0.06, { r: 0.025 });
    box(p, W * 0.62, 0.12, 0.3, f.color2 || "#ffffff", 0, 0.51, -D / 2 + 0.28, { r: 0.06 });
    box(p, W, 0.62, 0.08, "#8c5e3c", 0, 0.08, -D / 2 + 0.04, { r: 0.03 });
  };
  F.doublebed = (p, W, D, f) => {
    box(p, W, 0.3, D, "#7a4e30", 0, 0.08, 0);
    box(p, W - 0.08, 0.18, D - 0.1, "#fbf6ee", 0, 0.38, 0.02, { r: 0.07 });
    box(p, W, 0.12, D * 0.6, f.color, 0, 0.5, D * 0.18, { r: 0.06 });
    for (const sx of [-1, 1]) box(p, W * 0.38, 0.13, 0.32, f.color2 || "#fff", sx * W * 0.23, 0.52, -D / 2 + 0.3, { r: 0.07 });
    box(p, W + 0.04, 0.95, 0.1, "#7a4e30", 0, 0.08, -D / 2 + 0.05, { r: 0.04 });
    box(p, W - 0.3, 0.42, 0.05, shadeOf("#7a4e30", 0.08), 0, 0.5, -D / 2 + 0.11, { r: 0.02 });
  };
  F.desk = (p, W, D, f) => {
    box(p, W, 0.05, D, f.color, 0, 0.73, 0);
    for (const sx of [-1, 1]) box(p, 0.05, 0.73, D - 0.05, shadeOf(f.color, -0.1), sx * (W / 2 - 0.04), 0, 0);
    box(p, W * 0.35, 0.35, D - 0.08, shadeOf(f.color, -0.04), W * 0.28, 0.36, 0);
    box(p, 0.12, 0.02, 0.03, "#d8c08a", W * 0.28, 0.55, D / 2 - 0.02);
    if (f.computer) {
      box(p, 0.5, 0.34, 0.06, "#2b2d42", -0.25, 0.86, -D / 2 + 0.16);
      mesh(rbox(0.44, 0.28, 0.01, 0.005), mat("#3a86ff", { emissive: "#3a86ff", ei: 0.6 }), -0.25, 1.03, -D / 2 + 0.195, p);
      box(p, 0.1, 0.08, 0.1, "#2b2d42", -0.25, 0.78, -D / 2 + 0.14);
      box(p, 0.4, 0.02, 0.14, "#edf2f4", -0.25, 0.78, -D / 2 + 0.38);
    } else {
      box(p, 0.22, 0.04, 0.16, "#f4f1de", -0.3, 0.78, 0);
      mesh(cyl(0.05, 0.06, 0.04), mat("#3d405b"), 0.15, 0.8, -0.12, p);
      mesh(cyl(0.008, 0.008, 0.3), mat("#3d405b"), 0.15, 0.95, -0.12, p).rotation.z = 0.4;
      mesh(cyl(0.02, 0.07, 0.08), mat("#f4d35e", { emissive: "#f4d35e", ei: 0.4 }), 0.22, 1.08, -0.12, p);
    }
    // chair
    const ch = new THREE.Group();
    ch.position.set(-0.1, 0, D / 2 + 0.25);
    p.add(ch);
    box(ch, 0.42, 0.06, 0.42, "#e07a5f", 0, 0.42, 0, { r: 0.03 });
    box(ch, 0.42, 0.45, 0.06, "#e07a5f", 0, 0.45, 0.19, { r: 0.03 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(ch, 0.04, 0.42, 0.04, "#6b4426", sx * 0.17, 0, sz * 0.17);
  };
  F.bookshelf = (p, W, D, f) => {
    const H = f.h;
    box(p, W, H, D, f.color, 0, 0, 0, { r: 0.02 });
    const n = Math.max(2, Math.round(H / 0.42));
    const bookMat = mat("#ffffff", { map: T.books, rough: 0.8 });
    for (let i = 0; i < n; i++) {
      const y = 0.06 + i * ((H - 0.1) / n);
      box(p, W - 0.08, 0.03, D - 0.04, shadeOf(f.color, -0.12), 0, y, 0.02, { r: 0.008 });
      const books = new THREE.Mesh(rbox(W - 0.12, (H - 0.1) / n - 0.08, D - 0.12, 0.01), bookMat);
      books.position.set(0, y + 0.03 + ((H - 0.1) / n - 0.08) / 2, 0.04);
      books.castShadow = books.receiveShadow = true;
      p.add(books);
    }
  };
  F.toychest = (p, W, D, f) => {
    box(p, W, f.h - 0.08, D, f.color, 0, 0, 0, { r: 0.05 });
    box(p, W + 0.03, 0.1, D + 0.03, shadeOf(f.color, 0.08), 0, f.h - 0.1, 0, { r: 0.05 });
    mesh(sph(0.11), mat("#f4d35e"), -W * 0.2, f.h + 0.08, 0, p);
    box(p, 0.16, 0.16, 0.16, "#3a86ff", W * 0.22, f.h, 0.02, { r: 0.03 }).rotation.y = 0.5;
  };
  F.plushie = (p) => {
    mesh(sph(0.15), mat("#a7774d"), 0, 0.14, 0, p);
    mesh(sph(0.11), mat("#a7774d"), 0, 0.34, 0.02, p);
    for (const sx of [-1, 1]) mesh(sph(0.045), mat("#8a5f3a"), sx * 0.08, 0.43, 0, p);
    mesh(sph(0.045), mat("#e9d2b0"), 0, 0.32, 0.11, p);
  };
  F.rug = (p, W, D, f) => {
    const m = mat(f.color, { rough: 0.95 });
    const geo = f.shape === "round" ? g(`disc${W},${D}`, () => new THREE.CircleGeometry(0.5, 40)) : g("plane1", () => new THREE.PlaneGeometry(1, 1));
    const o = new THREE.Mesh(geo, m);
    o.rotation.x = -Math.PI / 2;
    o.scale.set(W, D, 1);
    o.position.y = 0.012;
    o.receiveShadow = true;
    p.add(o);
    const inner = new THREE.Mesh(geo, mat(shadeOf(f.color, 0.12), { rough: 0.95 }));
    inner.rotation.x = -Math.PI / 2;
    inner.scale.set(W * 0.78, D * 0.74, 1);
    inner.position.y = 0.016;
    inner.receiveShadow = true;
    p.add(inner);
  };
  F.bathmat = F.rug;
  F.runner = F.rug;
  F.bathtub = (p, W, D) => {
    box(p, W, 0.55, D, "#f7f7f2", 0, 0, 0, { r: 0.12, rough: 0.3 });
    const water = new THREE.Mesh(rbox(W - 0.18, 0.02, D - 0.2, 0.008), mat("#9ad1d4", { rough: 0.1, opacity: 0.85 }));
    water.position.set(0, 0.5, 0);
    p.add(water);
    mesh(cyl(0.03, 0.03, 0.2), mat("#c0c0c0", { metal: 0.8, rough: 0.25 }), 0, 0.62, -D / 2 + 0.08, p);
    mesh(sph(0.07), mat("#f4d35e"), 0.15, 0.55, 0.2, p);
  };
  F.toilet = (p, W, D) => {
    mesh(cyl(0.2, 0.15, 0.4, 20), mat("#f7f7f2", { rough: 0.3 }), 0, 0.2, 0.08, p);
    mesh(cyl(0.22, 0.22, 0.05, 20), mat("#f7f7f2", { rough: 0.3 }), 0, 0.42, 0.08, p);
    box(p, W * 0.9, 0.42, 0.2, "#f7f7f2", 0, 0.32, -D / 2 + 0.1, { r: 0.05, rough: 0.3 });
  };
  F.sink = (p, W, D) => {
    box(p, W, 0.8, D, "#7fb7be", 0, 0, 0, { r: 0.03 });
    box(p, W + 0.04, 0.06, D + 0.04, "#f7f7f2", 0, 0.8, 0, { r: 0.02, rough: 0.3 });
    mesh(cyl(0.025, 0.025, 0.16), mat("#c0c0c0", { metal: 0.8, rough: 0.25 }), 0, 0.92, -D / 2 + 0.08, p);
    box(p, 0.04, 0.55, D * 0.7, "#cfe8ef", 0, 1.15, -D / 2 + 0.01, { emissive: "#dff6ff", ei: 0.2, r: 0.01, rough: 0.05, metal: 0.4 });
  };
  F.cabinet = (p, W, D, f) => {
    box(p, W, f.h, D, f.color, 0, 0, 0, { r: 0.03 });
    box(p, 0.02, f.h - 0.12, 0.02, shadeOf(f.color, -0.2), 0, 0.06, D / 2);
    for (const sx of [-1, 1]) mesh(sph(0.02), mat("#d8c08a", { metal: 0.6 }), sx * 0.08, f.h * 0.6, D / 2 + 0.01, p);
  };
  F.basket = (p, W, D, f) => {
    mesh(cyl(W / 2, W / 2 - 0.05, f.h, 14), mat(f.color, { rough: 0.95 }), 0, f.h / 2, 0, p);
    box(p, W * 0.6, 0.12, D * 0.4, "#81b29a", 0.02, f.h - 0.04, 0, { r: 0.05 });
  };
  F.nightstand = (p, W, D, f) => {
    box(p, W, f.h, D, f.color, 0, 0, 0, { r: 0.03 });
    box(p, W - 0.08, 0.02, 0.02, shadeOf(f.color, -0.2), 0, f.h * 0.5, D / 2);
    mesh(cyl(0.05, 0.07, 0.2), mat("#e9c46a"), 0, f.h + 0.1, -0.05, p);
    mesh(cyl(0.08, 0.13, 0.15), mat("#fff2cc", { emissive: "#ffd27a", ei: 0.6 }), 0, f.h + 0.27, -0.05, p);
  };
  F.wardrobe = (p, W, D, f) => {
    box(p, W, f.h, D, f.color, 0, 0, 0, { r: 0.03 });
    box(p, 0.015, f.h - 0.15, 0.02, shadeOf(f.color, -0.25), 0, 0.08, D / 2);
    for (const sx of [-1, 1]) box(p, 0.03, 0.18, 0.03, "#d8c08a", sx * 0.07, f.h * 0.5, D / 2 + 0.01, { metal: 0.5, r: 0.01 });
    box(p, W + 0.06, 0.06, D + 0.06, shadeOf(f.color, -0.1), 0, f.h - 0.03, 0, { r: 0.02 });
    box(p, 0.3, 0.2, 0.3, "#c8a26b", 0, f.h + 0.03, 0, { r: 0.02 });
  };
  F.dresser = (p, W, D, f) => {
    box(p, W, f.h, D, f.color, 0, 0, 0, { r: 0.03 });
    for (let i = 0; i < 3; i++) {
      box(p, W - 0.1, f.h / 3 - 0.06, 0.02, shadeOf(f.color, 0.06), 0, 0.04 + i * (f.h / 3), D / 2, { r: 0.01 });
      mesh(sph(0.025), mat("#d8c08a", { metal: 0.6 }), 0, 0.04 + i * (f.h / 3) + f.h / 6 - 0.03, D / 2 + 0.02, p);
    }
    box(p, W * 0.6, 0.6, 0.04, "#cfe8ef", 0, f.h + 0.02, -D / 2 + 0.03, { r: 0.02, rough: 0.05, metal: 0.5 });
  };
  F.armchair = (p, W, D, f) => {
    box(p, W, 0.42, D, f.color, 0, 0.06, 0, { r: 0.1 });
    box(p, W, 0.55, 0.22, f.color, 0, 0.35, -D / 2 + 0.11, { r: 0.1 });
    for (const sx of [-1, 1]) box(p, 0.18, 0.28, D - 0.1, shadeOf(f.color, -0.05), sx * (W / 2 - 0.09), 0.42, 0.05, { r: 0.08 });
    box(p, W - 0.4, 0.12, D - 0.3, shadeOf(f.color, 0.08), 0, 0.46, 0.1, { r: 0.05 });
  };
  F.filing = (p, W, D, f) => {
    box(p, W, f.h, D, f.color, 0, 0, 0, { r: 0.02, metal: 0.3, rough: 0.5 });
    for (let i = 0; i < 3; i++) box(p, 0.16, 0.03, 0.02, "#d0d0d0", 0, 0.2 + i * 0.3, D / 2, { r: 0.01, metal: 0.6 });
  };
  F.boxes = (p, W, D, f) => {
    box(p, W * 0.55, f.h * 0.55, D * 0.9, f.color, -W * 0.2, 0, 0, { r: 0.02, rough: 0.95 });
    box(p, W * 0.42, f.h * 0.45, D * 0.8, shadeOf(f.color, 0.06), W * 0.28, 0, 0.02, { r: 0.02, rough: 0.95 });
    box(p, W * 0.45, f.h * 0.42, D * 0.7, shadeOf(f.color, -0.05), -W * 0.12, f.h * 0.55, 0.02, { r: 0.02, rough: 0.95 }).rotation.y = 0.2;
    box(p, W * 0.5, 0.01, 0.06, "#d6c29b", -W * 0.2, f.h * 0.55, 0, { r: 0.004 });
  };
  F.globe = (p) => {
    mesh(cyl(0.12, 0.16, 0.05), mat("#5c4033"), 0, 0.025, 0, p);
    mesh(cyl(0.02, 0.02, 0.7), mat("#5c4033"), 0, 0.4, 0, p);
    mesh(sph(0.18, 20), mat("#3a7ca5", { rough: 0.4 }), 0, 0.85, 0, p);
    mesh(sph(0.1, 10), mat("#6a994e"), 0.1, 0.9, 0.08, p).scale.set(1, 0.6, 0.7);
  };
  F.console = (p, W, D, f) => {
    box(p, W, 0.05, D, f.color, 0, f.h - 0.05, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, 0.04, f.h - 0.05, 0.04, shadeOf(f.color, -0.12), sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05));
    mesh(cyl(0.07, 0.05, 0.18), mat("#4f8a7b"), -W * 0.38, f.h + 0.09, 0, p);
    box(p, 0.2, 0.26, 0.03, "#e9c46a", W * 0.36, f.h, -0.05, { r: 0.01 }).rotation.x = -0.15;
  };
  F.plant = (p, W, D, f) => {
    mesh(cyl(W * 0.42, W * 0.32, 0.38, 14), mat("#c9643b", { rough: 0.9 }), 0, 0.19, 0, p);
    mesh(cyl(W * 0.4, W * 0.4, 0.03, 14), mat("#4a3426"), 0, 0.37, 0, p);
    const lm = mat(f.color, { rough: 0.7 });
    const lm2 = mat(shadeOf(f.color, 0.1), { rough: 0.7 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = mesh(sph(0.16, 10), i % 2 ? lm : lm2, Math.cos(a) * 0.14, 0.55 + (i % 3) * 0.18, Math.sin(a) * 0.14, p);
      leaf.scale.set(0.55, 1.4, 0.3);
      leaf.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    }
    mesh(sph(0.2, 10), lm, 0, f.h - 0.25, 0, p).scale.set(1, 1.2, 1);
  };
  F.tvstand = (p, W, D, f) => {
    box(p, W, f.h, D, f.color, 0, 0, 0, { r: 0.03 });
    box(p, 0.08, 0.06, 0.4, "#2b2d42", 0, f.h, 0);
    box(p, 0.06, 0.62, D * 0.62, "#1d1e2c", 0, f.h + 0.05, 0, { r: 0.02 });
    mesh(rbox(0.01, 0.54, D * 0.58, 0.004), mat("#1b2a41", { emissive: "#4ea8de", ei: 0.25, rough: 0.2 }), 0.035, f.h + 0.36, 0, p);
  };
  F.sofa = (p, W, D, f) => {
    box(p, W, 0.4, D, f.color, 0, 0.06, 0, { r: 0.1 });
    box(p, W, 0.5, 0.24, shadeOf(f.color, -0.04), 0, 0.3, -D / 2 + 0.12, { r: 0.1 });
    for (const sx of [-1, 1]) box(p, 0.22, 0.32, D - 0.05, shadeOf(f.color, -0.06), sx * (W / 2 - 0.11), 0.36, 0.02, { r: 0.1 });
    const n = Math.round((W - 0.4) / 0.85);
    const cw = (W - 0.44) / n;
    for (let i = 0; i < n; i++) box(p, cw - 0.03, 0.14, D - 0.32, shadeOf(f.color, 0.06), -W / 2 + 0.22 + cw * (i + 0.5), 0.44, 0.08, { r: 0.06 });
    box(p, 0.36, 0.3, 0.12, "#f4d35e", -W / 2 + 0.5, 0.56, -D / 2 + 0.3, { r: 0.06 }).rotation.z = 0.25;
    box(p, 0.34, 0.3, 0.12, "#81b29a", W / 2 - 0.5, 0.56, -D / 2 + 0.3, { r: 0.06 }).rotation.z = -0.2;
  };
  F.coffeetable = (p, W, D, f) => {
    box(p, W, 0.06, D, f.color, 0, f.h - 0.06, 0, { r: 0.03 });
    box(p, W - 0.1, 0.03, D - 0.1, shadeOf(f.color, -0.08), 0, 0.12, 0, { r: 0.01 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, 0.05, f.h - 0.06, 0.05, shadeOf(f.color, -0.15), sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06));
    mesh(cyl(0.05, 0.04, 0.09), mat("#f1faee"), 0.2, f.h + 0.045, -0.4, p);
  };
  F.lamp = (p, W, D, f) => {
    mesh(cyl(0.14, 0.16, 0.04), mat("#3d405b"), 0, 0.02, 0, p);
    mesh(cyl(0.015, 0.015, f.h - 0.3), mat("#3d405b", { metal: 0.6 }), 0, (f.h - 0.3) / 2, 0, p);
    mesh(cyl(0.12, 0.22, 0.3, 18), mat("#fff1c1", { emissive: "#ffcf6e", ei: 0.9 }), 0, f.h - 0.15, 0, p);
  };
  F.counter = (p, W, D, f, world) => {
    box(p, W, f.h - 0.05, D, f.color, 0, 0, 0, { r: 0.02 });
    box(p, W + 0.02, 0.05, D + 0.03, f.top || "#5f6b73", 0, f.h - 0.05, 0.01, { r: 0.015, rough: 0.35 });
    const doors = Math.max(1, Math.round(W / 0.6));
    for (let i = 0; i < doors; i++) {
      const x = -W / 2 + (W / doors) * (i + 0.5);
      box(p, W / doors - 0.05, f.h - 0.22, 0.02, shadeOf(f.color, -0.04), x, 0.1, D / 2, { r: 0.01 });
      box(p, 0.1, 0.02, 0.02, "#9aa5ad", x, f.h - 0.26, D / 2 + 0.02, { metal: 0.6, r: 0.005 });
    }
    // world x positions → local x (counters along x face ±z; mirrored when facing north)
    const local = (wx) => (world.rot === 2 ? -(wx - world.x) : wx - world.x);
    if (f.stoveAt != null) {
      const sx = local(f.stoveAt);
      box(p, 0.7, 0.03, D - 0.1, "#2b2d42", sx, f.h, 0, { r: 0.01 });
      for (const [a, b] of [[-0.17, -0.1], [0.17, -0.1], [-0.17, 0.12], [0.17, 0.12]]) mesh(cyl(0.09, 0.09, 0.012, 18), mat("#444", { rough: 0.4 }), sx + a, f.h + 0.035, b, p);
      mesh(cyl(0.12, 0.1, 0.16, 16), mat("#d1495b", { rough: 0.4 }), sx - 0.17, f.h + 0.12, -0.1, p);
    }
    if (f.sinkAt != null) {
      const kx = local(f.sinkAt);
      box(p, 0.6, 0.02, D - 0.2, "#b8c0c8", kx, f.h, 0, { metal: 0.7, rough: 0.25, r: 0.008 });
      mesh(cyl(0.02, 0.02, 0.28), mat("#c0c0c0", { metal: 0.8, rough: 0.2 }), kx, f.h + 0.14, -D / 2 + 0.1, p);
    }
  };
  F.fridge = (p, W, D, f) => {
    box(p, W, f.h, D, f.color, 0, 0, 0, { r: 0.07, rough: 0.35 });
    box(p, W - 0.04, 0.012, 0.02, "#b9c4c9", 0, f.h * 0.62, D / 2, { r: 0.004 });
    for (const y of [f.h * 0.75, f.h * 0.35]) box(p, 0.04, 0.3, 0.04, "#b9c4c9", W / 2 - 0.12, y, D / 2 + 0.02, { metal: 0.6, r: 0.015 });
    for (let i = 0; i < 4; i++) box(p, 0.1, 0.1, 0.01, ["#e63946", "#f4d35e", "#3a86ff", "#81b29a"][i], -0.15 + (i % 2) * 0.16, f.h * 0.72 + Math.floor(i / 2) * 0.14, D / 2 + 0.01, { r: 0.004 });
  };
  F.pantry = (p, W, D, f) => {
    box(p, W, f.h, D, f.color, 0, 0, 0, { r: 0.03 });
    for (const sx of [-1, 1]) box(p, W / 2 - 0.04, f.h - 0.1, 0.02, shadeOf(f.color, 0.06), sx * (W / 4), 0.05, D / 2, { r: 0.01 });
  };
  F.table = (p, W, D, f) => {
    box(p, W, 0.06, D, f.color, 0, f.h - 0.06, 0, { r: 0.03 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, 0.06, f.h - 0.06, 0.06, shadeOf(f.color, -0.15), sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1));
    box(p, W * 0.5, 0.005, D * 0.4, "#f1faee", 0, f.h, 0, { r: 0.002 });
    mesh(cyl(0.08, 0.06, 0.12), mat("#457b9d"), 0, f.h + 0.06, 0, p);
    for (let i = 0; i < 3; i++) mesh(sph(0.05), mat(["#e63946", "#f4a261", "#e9c46a"][i]), Math.cos(i * 2) * 0.03, f.h + 0.14, Math.sin(i * 2) * 0.03, p);
    if (f.chairs)
      for (const [cx, cz, face] of [[-W * 0.25, -D / 2 - 0.32, 0], [W * 0.25, -D / 2 - 0.32, 0], [-W * 0.25, D / 2 + 0.32, Math.PI], [W * 0.25, D / 2 + 0.32, Math.PI]]) {
        const ch = new THREE.Group();
        ch.position.set(cx, 0, cz);
        ch.rotation.y = face;
        p.add(ch);
        box(ch, 0.42, 0.05, 0.42, f.color, 0, 0.44, 0, { r: 0.02 });
        box(ch, 0.42, 0.45, 0.05, f.color, 0, 0.47, -0.19, { r: 0.02 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(ch, 0.04, 0.44, 0.04, shadeOf(f.color, -0.15), sx * 0.17, 0, sz * 0.17);
      }
  };
  F.workbench = (p, W, D, f) => {
    box(p, W, 0.08, D, f.color, 0, f.h - 0.08, 0, { r: 0.015 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, 0.07, f.h - 0.08, 0.07, shadeOf(f.color, -0.15), sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06));
    box(p, W - 0.1, 0.03, D - 0.1, shadeOf(f.color, -0.05), 0, 0.25, 0, { r: 0.01 });
    // pegboard with tools on the wall behind it
    box(p, W + 0.2, 0.9, 0.04, "#c9ad7f", 0, f.h + 0.2, -D / 2 + 0.02, { r: 0.01 });
    box(p, 0.06, 0.32, 0.02, "#e63946", -0.3, f.h + 0.45, -D / 2 + 0.06, { r: 0.01 });
    box(p, 0.25, 0.05, 0.02, "#6c757d", 0.1, f.h + 0.7, -D / 2 + 0.06, { r: 0.01, metal: 0.6 });
    mesh(cyl(0.1, 0.1, 0.03, 16), mat("#f4a261"), 0.4, f.h + 0.5, -D / 2 + 0.06, p).rotation.x = Math.PI / 2;
    box(p, 0.3, 0.12, 0.2, "#e9c46a", 0.25, f.h, 0.05, { r: 0.02 });
  };
  F.shelves = (p, W, D, f) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, 0.04, f.h, 0.04, "#6c757d", sx * (W / 2 - 0.03), 0, sz * (D / 2 - 0.03), { metal: 0.5, r: 0.01 });
    const cols = ["#c8a26b", "#e07a5f", "#3d5a80", "#81b29a", "#f4d35e"];
    for (let i = 0; i < 4; i++) {
      const y = 0.1 + i * 0.6;
      box(p, W, 0.03, D, "#8d99ae", 0, y, 0, { metal: 0.4, r: 0.008 });
      if (i < 3) for (let k = 0; k < 3; k++) box(p, W * 0.3, 0.28, D * 0.28, cols[(i * 3 + k) % 5], -W * 0.3 + k * W * 0.3, y + 0.03, -D * 0.25 + ((i + k) % 2) * D * 0.4, { r: 0.02, rough: 0.95 });
    }
  };
  F.bike = (p, W, D) => {
    const tire = mat("#222", { rough: 0.6 });
    const frame = mat("#2a9d8f", { rough: 0.4, metal: 0.3 });
    for (const sz of [-1, 1]) {
      const t = mesh(g("torus.3", () => new THREE.TorusGeometry(0.3, 0.035, 10, 28)), tire, 0, 0.33, sz * 0.5, p);
      t.rotation.y = Math.PI / 2;
    }
    const bar = mesh(cyl(0.025, 0.025, 1.0), frame, 0, 0.55, 0, p);
    bar.rotation.x = Math.PI / 2;
    mesh(cyl(0.025, 0.025, 0.5), frame, 0, 0.6, 0.35, p).rotation.x = 0.4;
    box(p, 0.12, 0.05, 0.25, "#333", 0, 0.82, -0.3, { r: 0.02 });
    mesh(cyl(0.02, 0.02, 0.5), frame, 0, 0.92, 0.5, p).rotation.z = Math.PI / 2;
  };
  F.barrel = (p, W, D, f) => {
    mesh(cyl(W / 2, W / 2, f.h, 18), mat(f.color, { rough: 0.5, metal: 0.3 }), 0, f.h / 2, 0, p);
    for (const y of [0.15, f.h - 0.15]) mesh(cyl(W / 2 + 0.01, W / 2 + 0.01, 0.04, 18), mat("#7a2d2f", { metal: 0.4 }), 0, y, 0, p);
  };

  /* ---------------------------------------------------------------- items */
  const I = {};
  I.water = (p) => {
    mesh(cyl(0.075, 0.075, 0.3, 14), mat("#8fd3ff", { rough: 0.1, opacity: 0.75 }), 0, 0.15, 0, p);
    mesh(cyl(0.065, 0.065, 0.22, 14), mat("#3fa7e0", { rough: 0.2, opacity: 0.6 }), 0, 0.12, 0, p);
    mesh(cyl(0.04, 0.075, 0.08, 14), mat("#8fd3ff", { rough: 0.1, opacity: 0.75 }), 0, 0.34, 0, p);
    mesh(cyl(0.035, 0.035, 0.04, 12), mat("#1d70b8"), 0, 0.4, 0, p);
    box(p, 0.152, 0.08, 0.152, "#ffffff", 0, 0.1, 0, { r: 0.07, opacity: 0.9 });
  };
  I.food = (p) => {
    const m = mat("#ffffff", { map: T.canLabel, rough: 0.5 });
    const c = mesh(cyl(0.1, 0.1, 0.2, 18), m, 0, 0.1, 0, p);
    c.rotation.y = 0.6;
    for (const y of [0.005, 0.195]) mesh(cyl(0.102, 0.102, 0.012, 18), mat("#b8c0c8", { metal: 0.7, rough: 0.3 }), 0, y, 0, p);
    const c2 = mesh(cyl(0.1, 0.1, 0.2, 18), m, 0.12, 0.1, 0.12, p);
    c2.rotation.y = 2;
    for (const y of [0.005, 0.195]) mesh(cyl(0.102, 0.102, 0.012, 18), mat("#b8c0c8", { metal: 0.7, rough: 0.3 }), 0.12, y, 0.12, p);
  };
  I.medkit = (p) => {
    box(p, 0.4, 0.22, 0.28, "#e04b4b", 0, 0, 0, { r: 0.05 });
    box(p, 0.06, 0.012, 0.18, "#ffffff", 0, 0.22, 0, { r: 0.004 });
    box(p, 0.18, 0.012, 0.06, "#ffffff", 0, 0.22, 0, { r: 0.004 });
    box(p, 0.14, 0.04, 0.03, "#7d1e1e", 0, 0.22, -0.1, { r: 0.012 });
  };
  I.flashlight = (p) => {
    const b = mesh(cyl(0.045, 0.045, 0.3, 14), mat("#f2c94c", { rough: 0.35, metal: 0.2 }), 0, 0.05, 0, p);
    b.rotation.z = Math.PI / 2;
    const h = mesh(cyl(0.075, 0.05, 0.1, 14), mat("#222"), 0.18, 0.05, 0, p);
    h.rotation.z = Math.PI / 2;
    const l = mesh(cyl(0.065, 0.065, 0.01, 14), mat("#fffbe0", { emissive: "#fff3b0", ei: 1.2 }), 0.235, 0.05, 0, p);
    l.rotation.z = Math.PI / 2;
  };
  I.radio = (p) => {
    box(p, 0.5, 0.3, 0.2, "#8a6d4b", 0, 0, 0, { r: 0.05 });
    mesh(cyl(0.09, 0.09, 0.02, 20), mat("#3b2f25"), -0.12, 0.15, 0.1, p).rotation.x = Math.PI / 2;
    box(p, 0.16, 0.08, 0.02, "#f1e3c8", 0.12, 0.17, 0.1, { emissive: "#ffdd88", ei: 0.4, r: 0.01 });
    mesh(sph(0.025), mat("#3b2f25"), 0.08, 0.08, 0.11, p);
    mesh(sph(0.025), mat("#3b2f25"), 0.16, 0.08, 0.11, p);
    const a = mesh(cyl(0.007, 0.007, 0.45), mat("#c0c0c0", { metal: 0.8 }), 0.2, 0.5, -0.05, p);
    a.rotation.z = -0.4;
    box(p, 0.3, 0.03, 0.03, "#3b2f25", 0, 0.31, 0, { r: 0.01 });
  };
  I.toolkit = (p) => {
    box(p, 0.5, 0.2, 0.22, "#c0392b", 0, 0, 0, { r: 0.03, metal: 0.3, rough: 0.45 });
    box(p, 0.5, 0.02, 0.22, "#922b21", 0, 0.12, 0, { r: 0.008 });
    const hd = mesh(g("torusH", () => new THREE.TorusGeometry(0.08, 0.015, 8, 16, Math.PI)), mat("#333"), 0, 0.2, 0, p);
    box(p, 0.06, 0.03, 0.02, "#d4af37", 0, 0.14, 0.115, { r: 0.008, metal: 0.6 });
    hd.castShadow = true;
  };
  I.map = (p) => {
    box(p, 0.38, 0.03, 0.28, "#e2cf9a", 0, 0, 0, { r: 0.012 });
    box(p, 0.12, 0.004, 0.08, "#6a994e", -0.06, 0.03, 0.04, { r: 0.002 });
    box(p, 0.08, 0.004, 0.14, "#3a7ca5", 0.08, 0.03, -0.03, { r: 0.002 });
    box(p, 0.03, 0.004, 0.03, "#e63946", 0.1, 0.034, 0.06, { r: 0.002 });
    const roll = mesh(cyl(0.035, 0.035, 0.3, 12), mat("#d4bf87"), -0.17, 0.035, 0, p);
    roll.rotation.x = Math.PI / 2;
  };
  I.gasmask = (p) => {
    const face = mesh(sph(0.15, 18), mat("#4d5a4a", { rough: 0.6 }), 0, 0.14, 0, p);
    face.scale.set(1, 1.1, 0.75);
    for (const sx of [-1, 1]) {
      const e = mesh(cyl(0.05, 0.05, 0.03, 16), mat("#b8e0d2", { rough: 0.05, metal: 0.4 }), sx * 0.06, 0.19, 0.1, p);
      e.rotation.x = Math.PI / 2;
    }
    const f = mesh(cyl(0.06, 0.06, 0.1, 14), mat("#2f3a2d"), 0, 0.06, 0.13, p);
    f.rotation.x = 1.2;
  };
  I.batteries = (p) => {
    for (let i = 0; i < 3; i++) {
      mesh(cyl(0.035, 0.035, 0.16, 12), mat("#3fa05a", { rough: 0.4 }), -0.08 + i * 0.08, 0.08, 0, p);
      mesh(cyl(0.036, 0.036, 0.04, 12), mat("#222"), -0.08 + i * 0.08, 0.02, 0, p);
      mesh(cyl(0.012, 0.012, 0.02, 8), mat("#d4af37", { metal: 0.7 }), -0.08 + i * 0.08, 0.17, 0, p);
    }
  };
  I.books = (p) => {
    const cols = ["#6b4fa0", "#e07a5f", "#3d5a80"];
    for (let i = 0; i < 3; i++) {
      const b = box(p, 0.3 - i * 0.02, 0.06, 0.22, cols[i], (i - 1) * 0.015, i * 0.062, 0, { r: 0.012 });
      b.rotation.y = (i - 1) * 0.25;
      box(p, 0.27 - i * 0.02, 0.045, 0.005, "#f8f1dc", (i - 1) * 0.015, i * 0.062 + 0.008, 0.11, { r: 0.002 }).rotation.y = (i - 1) * 0.25;
    }
  };
  I.backpack = (p) => {
    box(p, 0.4, 0.5, 0.24, "#7a8f3a", 0, 0, 0, { r: 0.1 });
    box(p, 0.3, 0.22, 0.08, "#5f7030", 0, 0.06, 0.14, { r: 0.05 });
    box(p, 0.4, 0.14, 0.26, "#5f7030", 0, 0.38, 0, { r: 0.06 });
    for (const sx of [-1, 1]) box(p, 0.05, 0.4, 0.03, "#3f4a1f", sx * 0.12, 0.05, -0.13, { r: 0.015 });
  };

  return {
    F,
    I,
    box,
    mesh,
    mat,
    rbox,
    cyl,
    sph,
    g,
    shadeOf,
    dispose() {
      for (const x of geos.values()) x.dispose();
      for (const m of mats.values()) m.dispose();
      geos.clear();
      mats.clear();
    },
  };
}
