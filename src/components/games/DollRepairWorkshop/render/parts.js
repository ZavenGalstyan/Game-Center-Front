/**
 * Small doll parts: glass and button eyes, buttons, shoes and the hats /
 * headpieces / extras. Every builder returns a Group whose origin is the
 * part's mounting point (so the replacement minigame can snap it to a
 * socket), facing +Z with +Y up.
 */
import * as THREE from "three";
import { revolve, profile, tube, V3 } from "./geo.js";
import { surfaceMat, mat } from "./materials.js";
import { irisTex, fabricTex } from "./textures.js";
import { EYE_COLORS, FABRIC_COLORS, SHOE_HEX } from "../data/dolls.js";

const shadow = (o) => {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
};

/* ------------------------------------------------------------------ eyes */
/** Planar-projected UVs on the front hemisphere so a square iris maps cleanly. */
function eyeballGeo(r) {
  const g = new THREE.SphereGeometry(r, 28, 20);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 0) uv.setXY(i, 0.5 + x / (2 * r), 0.5 + y / (2 * r));
    else uv.setXY(i, 0.03, 0.03);
  }
  return g;
}

export function buildEye(plan, { kind = "glass", color = "blue", broken = false, skinHex = "#f2d0c0", lid = 0.25 } = {}) {
  const g = new THREE.Group();
  const r = plan.eyeR;
  if (kind === "button") {
    const btn = buildButton(broken ? "black-broken" : "black", r * 1.15);
    g.add(btn);
    g.userData.kind = "button";
    return shadow(g);
  }
  const hex = EYE_COLORS[color]?.hex || "#3f7fd0";
  const ball = new THREE.Mesh(eyeballGeo(r), new THREE.MeshPhysicalMaterial({ map: irisTex(hex, broken ? "broken" : "ok"), color: irisTex(hex) ? 0xffffff : new THREE.Color(hex), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 }));
  ball.userData.eyeball = true;
  g.add(ball);
  // cornea glint shell
  const cornea = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.45), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: broken ? 0.4 : 0.12, roughness: broken ? 0.6 : 0.02, clearcoat: 1, depthWrite: false }));
  cornea.rotation.x = Math.PI / 2;
  g.add(cornea);
  // eyelid (upper) + lashes
  const lidMat = surfaceMat(plan.kind === "bjd" ? "resin" : plan.type === "porcelain" ? "porcelain" : "vinyl", skinHex, { grime: false });
  const lidGeo = new THREE.SphereGeometry(r * 1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * (0.32 + lid * 0.3));
  const lidM = new THREE.Mesh(lidGeo, lidMat);
  lidM.rotation.x = 0.35;
  g.add(lidM);
  const lashMat = mat("#1b1416", { roughness: 0.5 });
  const lashTh = Math.PI * (0.32 + lid * 0.3);
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8;
    // lid rim point (rotated like the lid)
    const rim = new THREE.Vector3(Math.sin(lashTh) * Math.sin(a) * r * 1.1, Math.cos(lashTh) * r * 1.1, Math.sin(lashTh) * Math.cos(a) * r * 1.1);
    rim.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
    const out = rim.clone().normalize();
    const tip = rim.clone().addScaledVector(out, r * 0.32).add(new THREE.Vector3(Math.sin(a) * r * 0.2, r * 0.3, 0));
    const mid = rim.clone().lerp(tip, 0.5).addScaledVector(out, r * 0.12);
    const lg = tube([rim, mid, tip], (t) => r * 0.035 * (1 - t * 0.85), { radial: 4, tubular: 6 });
    g.add(new THREE.Mesh(lg, lashMat));
  }
  g.userData.kind = "glass";
  return shadow(g);
}

/* --------------------------------------------------------------- buttons */
const BTN = {
  pearl: { color: "#f6f1ea", kind: "pearl" },
  wood: { color: "#a9744a", kind: "wood" },
  red: { color: "#c7384b", kind: "enamel" },
  gold: { color: "#d9b25a", kind: "gold" },
  black: { color: "#19171a", kind: "enamel" },
};

export function buildButton(style, size = 0.012) {
  const g = new THREE.Group();
  const broken = style.endsWith("-broken");
  const s = BTN[style.replace("-broken", "")] || BTN.wood;
  const m = s.kind === "pearl"
    ? new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.18, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color("#ffd9ef"), iridescence: 0.8 })
    : s.kind === "gold" ? new THREE.MeshStandardMaterial({ color: s.color, metalness: 1, roughness: 0.22 })
      : s.kind === "wood" ? new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55 })
        : new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.2, clearcoat: 1 });
  const prof = [[0.0001, 0], [size * 0.85, 0], [size, size * 0.18], [size * 0.95, size * 0.4], [size * 0.6, size * 0.34], [0.0001, size * 0.3]];
  const body = new THREE.Mesh(revolve(profile(prof, 3), { segs: broken ? 14 : 28, a1: broken ? Math.PI * 1.25 : Math.PI * 2 }), m);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  if (s.kind !== "pearl") {
    const holeMat = mat("#0b0a0b", { roughness: 1 });
    for (const [x, y] of [[-0.32, 0.32], [0.32, 0.32], [-0.32, -0.32], [0.32, -0.32]]) {
      if (broken && x > 0) continue;
      const h = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.12, size * 0.02, 10), holeMat);
      h.rotation.x = Math.PI / 2;
      h.position.set(x * size, y * size, size * 0.36);
      g.add(h);
    }
  }
  if (broken) {
    g.rotation.z = 0.7;
    g.position.y -= size * 0.4;
  }
  return shadow(g);
}

/* ----------------------------------------------------------------- shoes */
/**
 * A shoe around a foot whose ankle sits at the origin; the toe points +Z.
 * `footLen` and `footR` come from the leg builder.
 */
export function buildShoe(style, colorKey, footLen, footR, ankleH) {
  const g = new THREE.Group();
  if (style === "none") return g;
  const hex = SHOE_HEX[colorKey] || colorKey || "#24202a";
  const leather = surfaceMat("leather", hex, { grime: true });
  const sole = mat("#2b2220", { roughness: 0.8 });
  const L = footLen * 1.12;
  const R = footR * 1.18;
  // shoe shell: an elongated rounded cup
  const shell = (heightK = 1, toe = 1) => {
    const geo = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const zz = z > 0 ? z * L * 0.62 * toe : z * L * 0.38;
      p.setXYZ(i, x * R, y * R * 0.95 * heightK, zz + L * 0.22);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const yBase = -ankleH;
  if (style === "maryjane" || style === "heels") {
    const heel = style === "heels";
    const body = new THREE.Mesh(shell(0.9, heel ? 1.15 : 1), leather);
    body.position.y = yBase + R * 0.55;
    if (heel) body.rotation.x = 0.28;
    g.add(body);
    const so = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), sole);
    so.scale.set(R * 1.02, R * 0.12, L * 0.52);
    so.position.set(0, yBase + R * 0.06 + (heel ? R * 0.35 : 0), L * 0.24);
    if (heel) so.rotation.x = 0.28;
    g.add(so);
    if (heel) {
      const hs = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.18, R * 0.12, R * 0.9, 10), leather);
      hs.position.set(0, yBase + R * 0.45, -L * 0.12);
      g.add(hs);
    } else {
      // strap + button
      const strap = new THREE.Mesh(new THREE.TorusGeometry(R * 0.95, R * 0.12, 6, 20, Math.PI), leather);
      strap.rotation.set(0, Math.PI / 2, 0);
      strap.position.set(0, yBase + R * 0.95, L * 0.12);
      g.add(strap);
      const b = buildButton("gold", R * 0.22);
      b.position.set(R * 0.95, yBase + R * 1.05, L * 0.12);
      b.rotation.y = Math.PI / 2;
      g.add(b);
    }
  } else if (style === "boots") {
    const body = new THREE.Mesh(shell(0.9, 1), leather);
    body.position.y = yBase + R * 0.55;
    g.add(body);
    const shaft = new THREE.Mesh(revolve(profile([[R * 0.98, yBase + R * 0.6], [R * 0.88, yBase + R * 2.2], [R * 0.95, yBase + R * 3.6]], 3), { segs: 24, squash: 0.95 }), leather);
    shaft.position.z = -L * 0.02;
    g.add(shaft);
    const lace = mat("#f4ead2");
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(R * 0.3, R * 0.05, 4, 10, Math.PI), lace);
      c.position.set(0, yBase + R * (1.2 + k * 0.6), R * 0.88 + L * 0.0);
      c.rotation.x = -0.2;
      g.add(c);
    }
    const so = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), sole);
    so.scale.set(R * 1.04, R * 0.16, L * 0.52);
    so.position.set(0, yBase + R * 0.08, L * 0.24);
    g.add(so);
  } else if (style === "booties") {
    const knit = surfaceMat("fabric", hex, { map: fabricTex("knit") });
    const body = new THREE.Mesh(shell(1.15, 1.05), knit);
    body.position.y = yBase + R * 0.6;
    body.scale.multiplyScalar(1.08);
    g.add(body);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(R * 0.95, R * 0.3, 10, 24), knit);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = yBase + R * 1.6;
    g.add(cuff);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(R * 0.35, 12, 10), knit);
    pom.position.set(0, yBase + R * 1.3, L * 0.62);
    g.add(pom);
  } else if (style === "clogs") {
    const wood = surfaceMat("wood", "#c58a52", { grime: true });
    const body = new THREE.Mesh(shell(1.1, 1.15), wood);
    body.position.y = yBase + R * 0.55;
    body.scale.set(1.12, 1, 1.05);
    g.add(body);
    const so = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), mat("#8a5a34"));
    so.scale.set(R * 1.12, R * 0.3, L * 0.55);
    so.position.set(0, yBase + R * 0.15, L * 0.24);
    g.add(so);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 10, 8), mat(hex));
    dot.position.set(0, yBase + R * 1.15, L * 0.55);
    dot.scale.z = 0.4;
    g.add(dot);
  }
  return shadow(g);
}

/* ------------------------------------------------------------ accessories */
/**
 * Mount transform for an accessory in doll-root space. Hats ride on the
 * head; bow ties and necklaces at the neck; the parasol in the right hand;
 * the puppet crossbar floats above the head.
 */
export function accessoryMount(id, plan, hand) {
  const hr = plan.hr;
  const hc = V3(...plan.headC);
  const teddy = plan.kind === "teddy";
  const m = { pos: hc.clone(), rot: new THREE.Euler(0, 0, 0) };
  switch (id) {
    case "bonnet":
      m.pos.add(V3(0, hr * 0.1, -hr * 0.12));
      m.rot.set(-0.42, 0, 0);
      break;
    case "sunhat":
      m.pos.add(V3(0, hr * (teddy ? 0.82 : 0.78), -hr * 0.05));
      m.rot.set(-0.2, 0, 0.08);
      break;
    case "beret":
      m.pos.add(V3(hr * 0.12, hr * (teddy ? 0.88 : 0.86), -hr * 0.05));
      m.rot.set(-0.15, 0, -0.32);
      break;
    case "tophat":
      m.pos.add(V3(hr * 0.2, hr * (teddy ? 0.88 : 0.9), 0));
      m.rot.set(-0.1, 0, -0.24);
      break;
    case "tiara":
      m.pos.add(V3(0, hr * 0.74, -hr * 0.04));
      m.rot.set(0.22, 0, 0);
      break;
    case "flowercrown":
      m.pos.add(V3(0, hr * 0.62, 0));
      m.rot.set(0.18, 0, 0);
      break;
    case "cap":
      m.pos.add(V3(0, hr * 0.62, -hr * 0.04));
      m.rot.set(-0.12, 0, 0.05);
      break;
    case "bow":
      m.pos.add(teddy ? V3(hr * 0.62, hr * 0.62, 0) : V3(hr * 0.68, hr * 0.7, -hr * 0.16));
      m.rot.set(0, 0.6, -0.5);
      if (teddy) {
        m.pos.set(0, plan.shoulderY + 0.03, plan.chestR * 0.82);
        m.rot.set(-0.1, 0, 0);
      }
      break;
    case "headband":
      m.rot.set(0.32, 0, 0);
      break;
    case "bowtie":
      m.pos.set(0, plan.shoulderY + (teddy ? 0.03 : 0.012), teddy ? plan.chestR * 0.82 : plan.neckR * 1.15);
      m.rot.set(-0.1, 0, 0);
      break;
    case "necklace":
      m.pos.set(0, plan.shoulderY + 0.006, 0);
      break;
    case "pacifier": {
      const el = plan.eyeEl - 0.36;
      m.pos.add(V3(0, Math.sin(el) * hr, Math.cos(el) * hr * 1.0));
      break;
    }
    case "crossbar":
      m.pos.add(V3(0, hr * 2.6, 0));
      break;
    case "parasol":
      if (hand) m.pos.copy(hand);
      m.rot.set(-0.38, 0, 0.12);
      break;
    default:
      break;
  }
  return m;
}

export function buildAccessory(id, accentKey, plan, { broken = false, strings = null } = {}) {
  const g = new THREE.Group();
  g.name = `acc-${id}`;
  const hr = plan.hr * (plan.kind === "teddy" ? 1.12 : 1);
  const accent = FABRIC_COLORS[accentKey]?.hex || "#e98aa6";
  const fab = (hex, k = "cotton") => surfaceMat("fabric", hex, { map: fabricTex(k), grime: false, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: "#e2bb63", metalness: 1, roughness: 0.2 });
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    g.add(o);
    return o;
  };
  const bowShape = (m, s) => {
    const loop = new THREE.TorusGeometry(s * 0.55, s * 0.2, 8, 18);
    add(loop, m, -s * 0.55, 0, 0, 0, 0.4, 0).scale.set(1, 0.65, 0.6);
    add(loop, m, s * 0.55, 0, 0, 0, -0.4, 0).scale.set(1, 0.65, 0.6);
    add(new THREE.SphereGeometry(s * 0.28, 12, 10), m, 0, 0, s * 0.05).scale.set(1, 1, 0.7);
    for (const sx of [-1, 1]) add(tube([V3(0, 0, 0), V3(sx * s * 0.35, -s * 0.6, 0.0), V3(sx * s * 0.5, -s * 1.2, -s * 0.05)], s * 0.16, { radial: 6, tubular: 8, flat: 0.35 }), m);
  };
  switch (id) {
    case "bonnet": {
      const m = fab(FABRIC_COLORS[accentKey] && accentKey !== "white" ? accent : "#f7f5f2", "lace");
      const R = hr * 1.32;
      const shell = revolve(profile([[0.0001, R * 1.0], [R * 0.6, R * 0.86], [R * 0.92, R * 0.42], [R * 1.0, 0.0], [R * 0.98, -R * 0.3]], 4), { segs: 36, a0: Math.PI * 0.6, a1: Math.PI * 1.4, rFn: (a, ring, t, r) => r * (1 + 0.035 * Math.sin(a * 22) * t) });
      add(shell, m);
      const ribbon = fab(accent, "velvet");
      for (const sx of [-1, 1]) add(tube([V3(sx * R * 0.92, -R * 0.25, -R * 0.1), V3(sx * R * 0.85, -R * 0.62, -R * 0.05), V3(sx * R * 0.7, -R * 0.95, -R * 0.12)], hr * 0.05, { radial: 5, tubular: 10, flat: 0.3 }), ribbon);
      break;
    }
    case "sunhat": {
      const straw = fab("#ead9a8", "knit");
      add(revolve(profile([[hr * 1.9, -hr * 0.12], [hr * 1.45, 0.0], [hr * 0.9, hr * 0.06], [hr * 0.82, hr * 0.5], [hr * 0.55, hr * 0.62], [0.0001, hr * 0.64]], 3), { segs: 40 }), straw);
      add(new THREE.TorusGeometry(hr * 0.86, hr * 0.09, 8, 36), fab(accent, "velvet"), 0, hr * 0.12, 0, Math.PI / 2);
      for (let k = 0; k < 3; k++) {
        const f = add(new THREE.SphereGeometry(hr * 0.13, 10, 8), fab(["#f39ac0", "#fff3b0", "#ffffff"][k]), Math.cos(k * 0.6 + 0.9) * hr * 0.86, hr * 0.2, Math.sin(k * 0.6 + 0.9) * hr * 0.86);
        f.scale.set(1, 0.6, 1);
      }
      break;
    }
    case "beret": {
      const m = fab(accent, "velvet");
      add(new THREE.SphereGeometry(hr * 0.95, 32, 16), m).scale.set(1, 0.28, 1);
      add(new THREE.TorusGeometry(hr * 0.72, hr * 0.07, 8, 32), m, 0, -hr * 0.06, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(hr * 0.04, hr * 0.06, hr * 0.14, 8), m, 0, hr * 0.3, 0);
      break;
    }
    case "tophat": {
      const felt = fab("#2c2830", "velvet");
      add(revolve(profile([[hr * 1.0, -hr * 0.02], [hr * 0.92, hr * 0.03], [hr * 0.55, hr * 0.05], [hr * 0.52, hr * 0.4], [hr * 0.55, hr * 0.85], [0.0001, hr * 0.86]], 2), { segs: 32, capTop: false }), felt);
      add(new THREE.CylinderGeometry(hr * 0.555, hr * 0.535, hr * 0.14, 32, 1, true), fab(accent, "satin"), 0, hr * 0.13, 0);
      const fl = add(new THREE.SphereGeometry(hr * 0.12, 10, 8), fab("#f39ac0"), hr * 0.5, hr * 0.18, hr * 0.25);
      fl.scale.set(1, 1, 0.5);
      break;
    }
    case "tiara": {
      const arc = [];
      for (let k = 0; k <= 16; k++) {
        const a = -1.45 + (2.9 * k) / 16;
        arc.push(V3(Math.sin(a) * hr * 0.98, -Math.abs(Math.sin(a)) * hr * 0.12, Math.cos(a) * hr * 0.98));
      }
      add(tube(arc, hr * 0.035, { radial: 6, tubular: 32 }), gold);
      for (let k = -3; k <= 3; k++) {
        const a = k * 0.36;
        const h = hr * (k === 0 ? 0.42 : 0.24 - Math.abs(k) * 0.03);
        const sp = add(new THREE.ConeGeometry(hr * 0.06, h, 6), gold, Math.sin(a) * hr * 0.98, h / 2, Math.cos(a) * hr * 0.98);
        sp.rotation.set(0.25 * Math.cos(a), 0, -0.25 * Math.sin(a));
        const gem = add(new THREE.OctahedronGeometry(hr * (k === 0 ? 0.08 : 0.05)), new THREE.MeshPhysicalMaterial({ color: k % 2 ? "#ff8fc0" : "#9fd8ff", roughness: 0.05, clearcoat: 1, metalness: 0.1 }), Math.sin(a) * hr * 1.01, hr * 0.06, Math.cos(a) * hr * 1.01);
        gem.userData.gem = true;
      }
      break;
    }
    case "flowercrown": {
      const leaf = fab("#7fae84");
      add(new THREE.TorusGeometry(hr * 1.02, hr * 0.04, 6, 48), leaf, 0, 0, 0, Math.PI / 2);
      const cols = ["#f6b3c9", "#fff3b0", "#ffffff", "#c3a8e6", "#f39a7f"];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const fl = new THREE.Group();
        const pm = fab(cols[k % cols.length]);
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * Math.PI * 2;
          const petal = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.07, 8, 6), pm);
          petal.scale.set(1, 0.45, 0.7);
          petal.position.set(Math.cos(pa) * hr * 0.07, 0, Math.sin(pa) * hr * 0.07);
          fl.add(petal);
        }
        const c = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.04, 8, 6), fab("#e8b84a"));
        c.position.y = hr * 0.02;
        fl.add(c);
        fl.position.set(Math.sin(a) * hr * 1.02, hr * 0.03, Math.cos(a) * hr * 1.02);
        fl.lookAt(fl.position.clone().multiplyScalar(2).add(V3(0, hr * 0.6, 0)));
        fl.rotateX(Math.PI / 2);
        g.add(fl);
      }
      break;
    }
    case "cap": {
      const m = fab(accent, "knit");
      add(revolve(profile([[hr * 1.04, 0], [hr * 0.98, hr * 0.35], [hr * 0.6, hr * 0.9], [hr * 0.18, hr * 1.35], [0.0001, hr * 1.42]], 4), { segs: 32 }), m, 0, 0, 0, -0.35, 0, 0);
      add(new THREE.TorusGeometry(hr * 1.03, hr * 0.08, 8, 32), fab("#f4ead2", "knit"), 0, 0, 0, Math.PI / 2);
      add(new THREE.SphereGeometry(hr * 0.13, 10, 8), fab("#f4ead2", "knit"), 0, hr * 1.32, -hr * 0.5);
      break;
    }
    case "bow":
      bowShape(fab(accent, "satin"), hr * (plan.kind === "teddy" ? 0.36 : 0.32));
      break;
    case "headband": {
      const m = fab(accent, "satin");
      add(new THREE.TorusGeometry(hr * 1.06, hr * 0.06, 8, 40, Math.PI * 1.05), m, 0, 0, hr * 0.02, 0, 0, -Math.PI * 0.025);
      const b = new THREE.Group();
      g.add(b);
      break;
    }
    case "bowtie": {
      const m = fab(accent, "satin");
      const s = plan.kind === "teddy" ? hr * 0.42 : hr * 0.28;
      for (const sx of [-1, 1]) {
        const w = add(new THREE.ConeGeometry(s * 0.45, s * 0.9, 4, 1), m, sx * s * 0.42, 0, 0, 0, 0, sx * Math.PI / 2);
        w.scale.set(1, 1, 0.45);
      }
      add(new THREE.SphereGeometry(s * 0.2, 10, 8), m).scale.set(1, 1.1, 0.7);
      break;
    }
    case "necklace": {
      const pm = new THREE.MeshPhysicalMaterial({ color: "#f6f1ea", roughness: 0.15, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color("#ffd9ef") });
      const R = plan.neckR * 1.25;
      const n = 22;
      const pearl = new THREE.SphereGeometry(plan.hr * 0.055, 10, 8);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const dz = Math.cos(a);
        add(pearl, pm, Math.sin(a) * R, -Math.max(0, dz) * plan.hr * 0.12, dz * R * 1.05);
      }
      break;
    }
    case "pacifier": {
      const pm = new THREE.MeshPhysicalMaterial({ color: FABRIC_COLORS[accentKey]?.hex || "#8ec5ec", roughness: 0.2, clearcoat: 1 });
      add(new THREE.CylinderGeometry(hr * 0.24, hr * 0.24, hr * 0.05, 24), pm, 0, 0, hr * 0.04, Math.PI / 2).scale.set(1.25, 1, 1);
      add(new THREE.TorusGeometry(hr * 0.15, hr * 0.035, 8, 20), pm, 0, -hr * 0.05, hr * 0.13);
      add(new THREE.SphereGeometry(hr * 0.08, 10, 8), new THREE.MeshPhysicalMaterial({ color: "#f5d68a", roughness: 0.35, transparent: true, opacity: 0.85 }), 0, 0, -hr * 0.02);
      break;
    }
    case "crossbar": {
      const wood = surfaceMat("wood", "#b07a4a", { grime: false });
      add(new THREE.CylinderGeometry(hr * 0.09, hr * 0.09, hr * 3.0, 12), wood, 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(hr * 0.09, hr * 0.09, hr * 2.0, 12), wood, 0, 0, 0, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(hr * 0.14, 12, 10), wood);
      if (strings) {
        const sm = mat("#efe6d6", { roughness: 0.9 });
        for (const end of strings) {
          const from = end.from.clone();
          const to = end.to.clone();
          g.add(new THREE.Mesh(tube([from, from.clone().lerp(to, 0.5), to], 0.0011, { radial: 3, tubular: 2, capStart: false, capEnd: false }), sm));
        }
      }
      break;
    }
    case "parasol": {
      const lace = fab(accent === "#2c2830" ? "#2c2830" : "#f7f5f2", "lace");
      const shaft = mat("#6b4430");
      const L = plan.height * 0.58;
      add(new THREE.CylinderGeometry(hr * 0.03, hr * 0.03, L, 8), shaft, 0, L * 0.45, 0);
      add(new THREE.TorusGeometry(hr * 0.12, hr * 0.03, 6, 12, Math.PI), shaft, hr * 0.12, -L * 0.05, 0, 0, 0, Math.PI);
      const can = revolve(profile([[hr * 1.8, 0], [hr * 1.2, hr * 0.45], [hr * 0.45, hr * 0.7], [0.0001, hr * 0.76]], 3), { segs: 48, rFn: (a, ring, t, r) => r * (1 - 0.06 * Math.abs(Math.sin(a * 4)) * (1 - t)) });
      add(can, lace, 0, L * 0.92, 0);
      add(new THREE.SphereGeometry(hr * 0.06, 8, 6), gold, 0, L * 0.92 + hr * 0.8, 0);
      break;
    }
    default:
      break;
  }
  if (broken) breakLook(g);
  return shadow(g);
}

/** Visibly broken accessory: dulled, crushed, cracked and knocked askew. */
export function breakLook(g) {
  g.traverse((m) => {
    if (!m.isMesh) return;
    m.material = m.material.clone();
    if (m.material.color) m.material.color.lerp(new THREE.Color("#7a7068"), 0.45);
    if ("metalness" in m.material) m.material.metalness *= 0.4;
    m.material.roughness = Math.min(1, (m.material.roughness || 0.5) + 0.35);
    if (m.userData.gem) m.visible = false;
  });
  g.userData.broken = true;
  g.scale.set(1.0, 0.82, 0.95);
  g.rotation.z += 0.42;
  g.rotation.x += 0.18;
}
