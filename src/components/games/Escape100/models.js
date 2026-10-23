/**
 * Escape 100 — procedural 3D models for inventory items (≈0.2 m, origin at
 * the item's centre). The same builders feed pickups in the room, container
 * contents, items placed in sockets, the inventory icons (rendered once to
 * images) and the rotating 3D inspect view.
 */
import * as THREE from "three";

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.5, metalness: o.m ?? 0, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: o.t != null, opacity: o.t ?? 1 });
const metal = (color, r = 0.35) => std(color, { m: 0.9, r });

function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

function gearGeo(r = 0.08, teeth = 12, depth = 0.025, hole = 0.025) {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.82 : r;
    if (i === 0) s.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    s.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    s.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}
export { gearGeo };

const BUILD = {
  key(c) {
    const g = new THREE.Group(), m = metal(c, 0.4);
    g.add(mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 20), m, -0.07, 0, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.13, 8), m, 0.03, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.04, 0.01), m, 0.08, -0.02, 0));
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.028, 0.01), m, 0.055, -0.014, 0));
    return g;
  },
  keyHalf(c) {
    const g = new THREE.Group(), m = metal(c, 0.4);
    g.add(mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 20), m, -0.04, 0, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8), m, 0.015, 0, 0, 0, 0, Math.PI / 2));
    return g;
  },
  keyBlade(c) {
    const g = new THREE.Group(), m = metal(c, 0.4);
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 8), m, 0, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.04, 0.01), m, 0.035, -0.02, 0));
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.028, 0.01), m, 0.01, -0.014, 0));
    return g;
  },
  card(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.15, 0.004, 0.095), std(c, { r: 0.35 })));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.005, 0.024), metal("#e0c060", 0.3), -0.04, 0.001, -0.01));
    g.add(mesh(new THREE.BoxGeometry(0.15, 0.005, 0.014), std("#222"), 0, 0.001, 0.03));
    return g;
  },
  battery(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 16), std(c, { r: 0.3, m: 0.3 }), 0, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.04, 16), std("#c8a020", { r: 0.3, m: 0.5 }), 0.04, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 10), metal("#ccc"), 0.066, 0, 0, 0, 0, Math.PI / 2));
    return g;
  },
  cell(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 16), std(c, { e: c, ei: 1.2, t: 0.85, r: 0.1 }), 0, 0, 0, 0, 0, Math.PI / 2));
    for (const x of [-0.065, 0.065]) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16), metal("#9aa"), x, 0, 0, 0, 0, Math.PI / 2));
    return g;
  },
  fuse(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 14), std("#e8f4ff", { t: 0.5, r: 0.05 }), 0, 0, 0, 0, 0, Math.PI / 2));
    for (const x of [-0.05, 0.05]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 14), metal(c), x, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 4), metal("#888"), 0, 0, 0, 0, 0, Math.PI / 2));
    return g;
  },
  bulb(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.045, 16, 12), std(c, { t: 0.7, e: c, ei: 0.3, r: 0.1 }), 0, 0.03, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 12), metal("#bbb"), 0, -0.025, 0));
    return g;
  },
  screwdriver(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.09, 10), std(c, { r: 0.4 }), -0.05, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.11, 8), metal("#ccc"), 0.05, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.012, 0.003), metal("#ccc"), 0.108, 0, 0));
    return g;
  },
  crowbar(c) {
    const g = new THREE.Group(), m = std(c, { m: 0.6, r: 0.4 });
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 8), m, 0, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12, Math.PI), m, -0.12, 0.03, 0, 0, 0, Math.PI / 2));
    return g;
  },
  hammer(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 8), std(c), 0, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), metal("#777"), 0.1, 0, 0));
    return g;
  },
  wrench(c) {
    const g = new THREE.Group(), m = metal(c, 0.3);
    g.add(mesh(new THREE.BoxGeometry(0.17, 0.018, 0.008), m));
    g.add(mesh(new THREE.TorusGeometry(0.025, 0.01, 6, 12, Math.PI * 1.4), m, 0.095, 0, 0, 0, 0, -0.7));
    return g;
  },
  pliers(c) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(0.11, 0.012, 0.01), std(c), -0.04, s * 0.012, 0, 0, 0, s * 0.18));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), metal("#aaa"), 0.05, s * 0.004, 0, 0, 0, -s * 0.12));
    }
    return g;
  },
  gear(c, s = 1) {
    const g = new THREE.Group();
    g.add(mesh(gearGeo(0.075 * s, 12), metal(c, 0.35)));
    return g;
  },
  crank(c) {
    const g = new THREE.Group(), m = metal(c, 0.5);
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), m, 0, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8), m, 0.08, 0.04, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 10), std("#5a3a1e"), 0.08, 0.09, 0));
    return g;
  },
  handle(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8), metal(c, 0.5)));
    g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), std("#c03028"), 0, 0.1, 0));
    return g;
  },
  valve(c) {
    const g = new THREE.Group(), m = std(c, { m: 0.6, r: 0.4 });
    g.add(mesh(new THREE.TorusGeometry(0.07, 0.01, 8, 24), m));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.14, 0.01, 0.01), m, 0, 0, 0, 0, 0, (i * Math.PI) / 4));
    return g;
  },
  gem(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.OctahedronGeometry(0.05, 0), std(c, { r: 0.05, m: 0.1, e: c, ei: 0.25 })));
    return g;
  },
  lens(c) {
    const g = new THREE.Group();
    const l = mesh(new THREE.SphereGeometry(0.06, 20, 10), std(c, { t: 0.45, r: 0.02 }));
    l.scale.set(1, 1, 0.25);
    g.add(l);
    g.add(mesh(new THREE.TorusGeometry(0.06, 0.006, 6, 24), metal("#c9a14a")));
    return g;
  },
  torch(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12), std(c, { m: 0.4, r: 0.4 }), 0, 0, 0, 0, 0, Math.PI / 2));
    g.add(mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.04, 12), std("#333", { m: 0.5 }), 0.075, 0, 0, 0, 0, Math.PI / 2));
    return g;
  },
  matches(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.02, 0.05), std(c)));
    g.add(mesh(new THREE.BoxGeometry(0.081, 0.006, 0.03), std("#3a2a1a"), 0, 0.008, 0));
    return g;
  },
  candle(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.13, 12), std(c, { r: 0.8 })));
    g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.02, 4), std("#222"), 0, 0.075, 0));
    return g;
  },
  coin(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 24), metal(c, 0.3), 0, 0, 0, Math.PI / 2, 0, 0));
    return g;
  },
  fragment(c) {
    const s = new THREE.Shape();
    s.moveTo(0, -0.06);
    s.absarc(0, 0, 0.06, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(0.01, 0.03);
    s.lineTo(-0.008, 0);
    s.lineTo(0.01, -0.03);
    s.lineTo(0, -0.06);
    const g = new THREE.Group();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false });
    g.add(mesh(geo, metal(c, 0.3), 0, 0, -0.005));
    return g;
  },
  medal(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 28), metal(c, 0.3), 0, 0, 0, Math.PI / 2, 0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.06, 0.006, 6, 28), metal("#fff0b0", 0.2)));
    return g;
  },
  disc(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 24), std(c, { r: 0.9 }), 0, 0, 0, Math.PI / 2, 0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.045, 0.004, 4, 24), std("#5a4a30"), 0, 0, 0.011));
    return g;
  },
  idol(c) {
    const g = new THREE.Group(), m = metal(c, 0.25);
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 10), m, 0, -0.03, 0));
    g.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), m, 0, 0.035, 0));
    return g;
  },
  chip(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.09, 0.006, 0.06), std(c, { r: 0.4 })));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.008, 0.03), std("#111"), 0, 0.004, 0));
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.006, 0.007, 0.012), metal("#e0c060"), -0.035 + i * 0.014, 0.001, 0.03));
    return g;
  },
  tape(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.012, 0.065), std(c)));
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.013, 0.03), std("#e8e0c8"), 0, 0, -0.005));
    return g;
  },
  rope(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 20), std(c, { r: 0.95 }), 0, 0, 0, Math.PI / 2, 0, 0));
    g.add(mesh(new THREE.TorusGeometry(0.038, 0.014, 8, 20), std(c, { r: 0.95 }), 0, 0.02, 0, Math.PI / 2, 0, 0));
    return g;
  },
  hook(c) {
    const g = new THREE.Group(), m = metal("#666", 0.5);
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), m, 0, 0.02, 0));
    g.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 14, Math.PI * 1.2), m, 0.0, -0.05, 0, 0, 0, Math.PI));
    if (c !== "#555") g.add(mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 16), std(c, { r: 0.95 }), 0, 0.09, 0, Math.PI / 2, 0, 0));
    return g;
  },
  magnet(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.04, 0.014, 8, 16, Math.PI), std(c, { r: 0.4 }), 0, 0, 0, 0, 0, Math.PI));
    for (const x of [-0.04, 0.04]) g.add(mesh(new THREE.BoxGeometry(0.03, 0.025, 0.03), metal("#ccc"), x, 0.012, 0));
    return g;
  },
  stick(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 8), std("#a07a4a"), 0, 0, 0, 0, 0, Math.PI / 2));
    if (c !== "#a07a4a") g.add(mesh(new THREE.TorusGeometry(0.025, 0.01, 8, 12, Math.PI), std(c), 0.14, 0, 0, 0, 0, -Math.PI / 2));
    return g;
  },
  flask(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.045, 16, 12), std("#e8f8ff", { t: 0.35, r: 0.05 }), 0, -0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 10), std("#e8f8ff", { t: 0.35, r: 0.05 }), 0, 0.04, 0));
    if (c !== "#cfefff") g.add(mesh(new THREE.SphereGeometry(0.038, 14, 10, 0, Math.PI * 2, Math.PI * 0.35), std(c, { e: c, ei: 0.3, r: 0.2 }), 0, -0.022, 0));
    return g;
  },
  weight(c, s, it) {
    const g = new THREE.Group();
    const k = 0.7 + (it?.weight ?? 1) * 0.12;
    g.add(mesh(new THREE.CylinderGeometry(0.035 * k, 0.045 * k, 0.05 * k, 6), metal(c, 0.6)));
    g.add(mesh(new THREE.TorusGeometry(0.015 * k, 0.005, 6, 12), metal("#999"), 0, 0.03 * k, 0));
    return g;
  },
  orb(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.05, 20, 16), std(c, { t: 0.75, e: c, ei: 0.6, r: 0.1 })));
    return g;
  },
  crystal(c) {
    const g = new THREE.Group();
    const m = std(c, { t: 0.8, e: c, ei: 0.35, r: 0.1 });
    g.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 6), m, 0, 0.02, 0));
    g.add(mesh(new THREE.ConeGeometry(0.02, 0.07, 6), m, 0.03, -0.01, 0, 0, 0, -0.5));
    return g;
  },
  bell(c) {
    const g = new THREE.Group(), m = metal(c, 0.25);
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.07, 16, 1, true), m, 0, 0, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), std("#3a2a1a"), 0, 0.06, 0));
    return g;
  },
  book(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.13, 0.03, 0.1), std(c, { r: 0.7 })));
    g.add(mesh(new THREE.BoxGeometry(0.122, 0.024, 0.094), std("#f0e8d0"), 0.005, 0, 0));
    return g;
  },
  feather(c) {
    const g = new THREE.Group();
    const f = mesh(new THREE.SphereGeometry(0.06, 10, 6), std(c, { r: 0.9 }));
    f.scale.set(0.3, 1.4, 0.06);
    f.rotation.z = 0.5;
    g.add(f);
    return g;
  },
  oilcan(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 14), std(c, { m: 0.5, r: 0.4 })));
    g.add(mesh(new THREE.CylinderGeometry(0.004, 0.01, 0.1, 6), metal("#bbb"), 0.03, 0.06, 0, 0, 0, -0.8));
    return g;
  },
  mask(c) {
    const g = new THREE.Group(), m = std(c, { r: 0.9 });
    const f = mesh(new THREE.SphereGeometry(0.06, 16, 12, 0, Math.PI), m);
    f.scale.set(1, 1.3, 0.5);
    g.add(f);
    for (const x of [-0.022, 0.022]) g.add(mesh(new THREE.SphereGeometry(0.01, 8, 6), std("#111"), x, 0.015, 0.028));
    return g;
  },
  note(c) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.003, 0.09), std(c, { r: 0.9 }), 0, 0, 0, 0, 0.1, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.004, 0.004), std("#6a5a40"), 0, 0.001, -0.02));
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.004, 0.004), std("#6a5a40"), 0, 0.001, 0));
    return g;
  },
};

/** A fresh model group for an item id (using its catalog entry). */
export function itemModel(it) {
  const b = BUILD[it?.model] || BUILD.note;
  const g = b(it?.color || "#ccc", it?.scale || 1, it);
  g.userData.item = true;
  return g;
}

export function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) for (const m of [].concat(n.material)) (m.map?.dispose(), m.dispose());
  });
}
