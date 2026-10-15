/**
 * Sky Combat 3D — procedural models (no asset files). Every builder caches
 * its merged geometry per look, so ten raiders share one set of buffers and
 * one set of materials. Aircraft are built nose-forward along −Z with the
 * canopy up (+Y), matching the simulation's quaternions.
 *
 * Jet groups expose userData:
 *   exhaust[]  – afterburner cones (scale with throttle)
 *   lights[]   – nav lights {mesh, blink}
 *   missiles[] – visible missiles on the pylons (hidden as they're fired)
 *   bombs[]    – bombs under the belly
 *   gear       – landing gear group (hangar only)
 *   cockpit    – local position of the pilot's eye
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------------ material kit */
export class Kit {
  constructor() {
    this.mats = new Map();
    this.geos = new Map();
  }
  std(key, color, o = {}) {
    const k = "s:" + key;
    if (!this.mats.has(k)) {
      this.mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.35, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat, envMapIntensity: o.env ?? 1 }));
    }
    return this.mats.get(k);
  }
  basic(key, color, o = {}) {
    const k = "b:" + key;
    if (!this.mats.has(k)) {
      this.mats.set(k, new THREE.MeshBasicMaterial({ color, transparent: !!o.transparent, opacity: o.opacity ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add && !o.transparent, fog: o.fog ?? true, side: o.side ?? THREE.FrontSide, toneMapped: o.toneMapped ?? true }));
    }
    return this.mats.get(k);
  }
  geo(key, make) {
    if (!this.geos.has(key)) this.geos.set(key, make());
    return this.geos.get(key);
  }
  dispose() {
    for (const m of this.mats.values()) m.dispose();
    for (const g of this.geos.values()) {
      if (g.isBufferGeometry) g.dispose();
      else if (g && typeof g === "object") for (const x of Object.values(g)) x?.isBufferGeometry && x.dispose();
    }
    this.mats.clear();
    this.geos.clear();
  }
}

/* ------------------------------------------------------------------ geometry helpers */
const prep = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  if (!n.attributes.uv) n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  for (const k of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(k)) n.deleteAttribute(k);
  return n;
};
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
};
/** Lathe profile [[r, y]…] (auto-ordered bottom→top so faces point outward). */
function lathe(pts, seg = 14) {
  const o = [...pts].sort((a, b) => a[1] - b[1]);
  return new THREE.LatheGeometry(o.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg);
}
/** Flat planform polygon [[x, z]…] extruded to `t` thickness, lying in the XZ plane. */
function plate(pts, t = 0.16, bevel = 0.05) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel * 0.6, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -t / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}
/** Fin in the YZ plane: [[z, y]…]. */
function fin(pts, t = 0.12) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 1 });
  g.translate(0, 0, -t / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
/** Cylinder lying along Z. */
const tubeZ = (r, len, s = 10) => cyl(r, r, len, s).rotateX(Math.PI / 2);

function mergeInto(groups) {
  const out = {};
  for (const [k, list] of Object.entries(groups)) if (list.length) out[k] = mergeGeometries(list.map(prep), false);
  return out;
}

/* ------------------------------------------------------------------ weapons */
export function missileGeometry(kit) {
  return kit.geo("missile", () => {
    const body = lathe([[0.001, -1.7], [0.14, -1.35], [0.15, 1.5], [0.12, 1.7]], 8).rotateX(-Math.PI / 2);
    const fins = [];
    for (let i = 0; i < 4; i++) {
      const f = box(0.02, 0.42, 0.42);
      f.translate(0, 0.22, 0);
      f.rotateZ((i * Math.PI) / 2 + Math.PI / 4);
      f.translate(0, 0, 1.45);
      fins.push(f);
    }
    return mergeGeometries([body, ...fins].map(prep));
  });
}
export function bombGeometry(kit) {
  return kit.geo("bomb", () => {
    const body = lathe([[0.001, -1.2], [0.24, -0.8], [0.27, 0.4], [0.12, 1.1], [0.1, 1.2]], 10).rotateX(-Math.PI / 2);
    const fins = [];
    for (let i = 0; i < 4; i++) {
      const f = box(0.02, 0.5, 0.36);
      f.translate(0, 0.22, 0);
      f.rotateZ((i * Math.PI) / 2);
      f.translate(0, 0, 1.0);
      fins.push(f);
    }
    return mergeGeometries([body, ...fins].map(prep));
  });
}

/* ------------------------------------------------------------------ jets */
export const LOOKS = {
  light: { body: 0xa08a6a, accent: 0x6e5c45, stripe: 0xd8382a, tails: 1, engines: 1, canards: false, sweep: 0.5, span: 9, length: 13, enemy: true },
  fighter: { body: 0x7a7468, accent: 0x45423c, stripe: 0xd8322a, tails: 2, engines: 2, canards: false, sweep: 0.45, span: 12, length: 17, enemy: true },
  heavy: { body: 0x5c636c, accent: 0x30353b, stripe: 0xff4a2a, tails: 2, engines: 2, canards: true, sweep: 0.55, span: 13, length: 19, enemy: true },
  elite: { body: 0x23262c, accent: 0x121417, stripe: 0xffc400, tails: 2, engines: 2, canards: true, sweep: 0.6, span: 12.5, length: 18, enemy: true },
  ace: { body: 0x6a1014, accent: 0x1d0607, stripe: 0xf2f2f2, tails: 2, engines: 2, canards: true, sweep: 0.62, span: 13.5, length: 19.5, enemy: true },
  wingman: { body: 0x8195aa, accent: 0x4a5a6a, stripe: 0x5fd6ff, tails: 1, engines: 1, canards: false, sweep: 0.42, span: 10, length: 15 },
};

function jetGeometry(kit, key, L) {
  return kit.geo("jet:" + key, () => {
    const len = L.length;
    const half = len / 2;
    const R = len * 0.062; // fuselage radius
    const G = { body: [], accent: [], stripe: [], glass: [], dark: [], light: [] };
    // fuselage (lathe along Y, then nose → −Z)
    const fus = lathe([
      [R * 0.62, 0], [R * 0.86, len * 0.08], [R, len * 0.3], [R * 1.02, len * 0.55], [R * 0.86, len * 0.72],
      [R * 0.55, len * 0.86], [R * 0.24, len * 0.95], [0.02, len],
    ], 16);
    fus.rotateX(-Math.PI / 2).translate(0, 0, half);
    fus.scale(L.engines === 2 ? 1.35 : 1.1, 0.82, 1);
    G.body.push(fus);
    // dorsal spine + belly keel
    G.accent.push(at(box(R * 0.9, R * 0.5, len * 0.5), 0, R * 0.55, len * 0.02));
    // nose radome tip
    G.dark.push(at(lathe([[0.001, 0], [R * 0.3, len * 0.08]], 10), 0, 0, -half + len * 0.04, -Math.PI / 2, 0, 0, 1, 1, 1));
    // canopy
    G.glass.push(at(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, R * 0.55, -half + len * 0.3, 0, 0, 0, R * 0.62, R * 0.75, len * 0.12));
    G.dark.push(at(box(R * 1.15, 0.06, 0.1), 0, R * 0.62, -half + len * 0.33)); // canopy frame
    // intakes
    for (const s of [-1, 1]) {
      G.accent.push(at(box(R * 0.55, R * 0.9, len * 0.24), s * R * (L.engines === 2 ? 1.25 : 1.0), -R * 0.25, -half + len * 0.47));
      G.dark.push(at(box(R * 0.4, R * 0.7, 0.05), s * R * (L.engines === 2 ? 1.25 : 1.0), -R * 0.25, -half + len * 0.35));
    }
    // wings (both sides in one polygon)
    const S = L.span / 2;
    const zRoot = -half + len * 0.42;
    const chord = len * 0.36;
    const sw = L.sweep * S;
    const tipC = chord * 0.26;
    G.accent.push(plate([[-S, zRoot + sw + tipC], [-S, zRoot + sw], [0, zRoot - chord * 0.15], [S, zRoot + sw], [S, zRoot + sw + tipC], [0, zRoot + chord]], 0.2, 0.06).translate(0, -R * 0.15, 0));
    // wingtip rails
    for (const s of [-1, 1]) G.dark.push(at(tubeZ(0.08, tipC + 1.2, 6), s * S, -R * 0.15, zRoot + sw + tipC * 0.5));
    // horizontal stabilisers
    const hs = S * 0.45;
    const zT = half - len * 0.13;
    G.accent.push(plate([[-hs, zT + 1.5], [-hs, zT + 0.6], [0, zT - len * 0.07], [hs, zT + 0.6], [hs, zT + 1.5], [0, zT + 1.2]], 0.14, 0.04).translate(0, -R * 0.05, 0));
    // vertical tails
    const fh = len * 0.2;
    const fz = half - len * 0.2;
    const vt = fin([[fz, 0], [fz + len * 0.06 + fh * 0.6, fh], [fz + len * 0.06 + fh * 0.6 + len * 0.06, fh], [fz + len * 0.21, 0]], 0.14);
    if (L.tails === 2) {
      for (const s of [-1, 1]) {
        const g = vt.clone();
        g.rotateZ(-s * 0.32);
        g.translate(s * R * 0.95, R * 0.45, 0);
        G.body.push(g);
        const st = fin([[fz + fh * 0.62, fh * 0.75], [fz + fh * 0.62 + len * 0.07, fh * 0.75], [fz + fh * 0.62 + len * 0.075, fh * 0.92], [fz + fh * 0.62 + len * 0.005, fh * 0.92]], 0.17);
        st.rotateZ(-s * 0.32);
        st.translate(s * R * 0.95, R * 0.45, 0);
        G.stripe.push(st);
      }
      vt.dispose();
    } else {
      vt.translate(0, R * 0.55, 0);
      G.body.push(vt);
      G.stripe.push(at(fin([[fz + fh * 0.62, fh * 0.72], [fz + fh * 0.62 + len * 0.07, fh * 0.72], [fz + fh * 0.62 + len * 0.075, fh * 0.9], [fz + fh * 0.62 + len * 0.005, fh * 0.9]], 0.17), 0, R * 0.55, 0));
    }
    // canards
    if (L.canards) {
      const zc = -half + len * 0.3;
      G.accent.push(plate([[-R - 1.6, zc + 0.9], [-R - 1.6, zc + 0.4], [0, zc - 0.6], [R + 1.6, zc + 0.4], [R + 1.6, zc + 0.9], [0, zc + 0.9]], 0.1, 0.03).translate(0, R * 0.1, 0));
    }
    // engines / nozzles
    const ex = L.engines === 2 ? [-R * 0.6, R * 0.6] : [0];
    for (const x of ex) {
      G.dark.push(at(cyl(R * 0.48, R * 0.56, len * 0.08, 14, true), x, 0, half + len * 0.02, Math.PI / 2));
      G.dark.push(at(cyl(R * 0.3, R * 0.3, 0.1, 12), x, 0, half - len * 0.01, Math.PI / 2));
    }
    // fuselage side stripe
    for (const s of [-1, 1]) G.stripe.push(at(box(0.04, R * 0.18, len * 0.22), s * R * 1.02 * (L.engines === 2 ? 1.35 : 1.1), R * 0.05, -half + len * 0.2));
    // pylons
    const pyl = [];
    for (const f of [0.45, 0.72]) for (const s of [-1, 1]) {
      const x = s * S * f;
      const z = zRoot + sw * f + chord * 0.15 * (1 - f);
      G.dark.push(at(box(0.12, 0.35, 1.6), x, -R * 0.15 - 0.25, z + 0.6));
      pyl.push([x, -R * 0.15 - 0.62, z + 0.6]);
    }
    const g = mergeInto(G);
    g.pylons = pyl;
    g.R = R;
    g.half = half;
    g.exhaust = ex.map((x) => [x, 0, half + len * 0.06]);
    g.lights = [[-S, -R * 0.15, zRoot + sw + 0.3, 0xff2a2a], [S, -R * 0.15, zRoot + sw + 0.3, 0x2aff5a], [0, R * 0.55 + fh, fz + len * 0.1, 0xffffff]];
    g.cockpit = [0, R * 0.95, -half + len * 0.29];
    return g;
  });
}

function gearGeometry(kit, key, L) {
  return kit.geo("gear:" + key, () => {
    const half = L.length / 2;
    const R = L.length * 0.062;
    const parts = [];
    const wheel = (x, y, z, r) => parts.push(at(cyl(r, r, r * 0.7, 12), x, y, z, 0, 0, Math.PI / 2));
    const strut = (x, z, h) => parts.push(at(cyl(0.07, 0.07, h, 6), x, -R * 0.6 - h / 2, z));
    strut(0, -half + L.length * 0.2, 1.4);
    wheel(0, -R * 0.6 - 1.45, -half + L.length * 0.2, 0.3);
    for (const s of [-1, 1]) {
      strut(s * R * 1.3, L.length * 0.08, 1.5);
      wheel(s * R * 1.3, -R * 0.6 - 1.55, L.length * 0.08, 0.42);
    }
    return mergeGeometries(parts.map(prep));
  });
}

/** Exhaust cone (unit length along +Z, base at origin). */
function exhaustGeometry(kit) {
  return kit.geo("exhaust", () => {
    const g = new THREE.ConeGeometry(1, 1, 12, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.5);
    return g;
  });
}

/**
 * A fighter jet group. `look` is a JETS[].look object or a LOOKS key.
 * opts: {missiles: n visible, bombs: n, gear: bool}
 */
export function buildJet(kit, lookKey, lookObj = null, opts = {}) {
  const L = lookObj || LOOKS[lookKey] || LOOKS.fighter;
  const key = lookObj ? "p:" + lookKey : lookKey;
  const geo = jetGeometry(kit, key, L);
  const grp = new THREE.Group();
  const mats = {
    body: kit.std("jb:" + key, L.body, { metal: 0.55, rough: 0.42 }),
    accent: kit.std("ja:" + key, L.accent, { metal: 0.5, rough: 0.5 }),
    stripe: kit.std("js:" + key, L.stripe, { metal: 0.3, rough: 0.4, emissive: L.stripe, ei: 0.12 }),
    glass: kit.std("glass" + (L.enemy ? "R" : "B"), L.enemy ? 0x3a1a10 : 0x10243a, { metal: 0.95, rough: 0.08, emissive: L.enemy ? 0x401000 : 0x06202e, ei: 0.6 }),
    dark: kit.std("jdark", 0x2a2d31, { metal: 0.7, rough: 0.45 }),
  };
  for (const [k, g] of Object.entries(geo)) {
    if (!g?.isBufferGeometry || !mats[k]) continue;
    grp.add(new THREE.Mesh(g, mats[k]));
  }
  const ud = (grp.userData = { exhaust: [], lights: [], missiles: [], bombs: [], R: geo.R, cockpit: geo.cockpit, length: L.length });
  // afterburner cones
  const exG = exhaustGeometry(kit);
  const exM = kit.basic("exhaust" + (L.enemy ? "R" : "B"), L.enemy ? 0xff7a30 : 0x6fc8ff, { add: true, transparent: true, opacity: 0.85 });
  const exCore = kit.basic("exhaustCore", 0xfff2c8, { add: true, transparent: true, opacity: 0.9 });
  for (const [x, y, z] of geo.exhaust) {
    const outer = new THREE.Mesh(exG, exM);
    outer.position.set(x, y, z);
    outer.scale.set(geo.R * 0.42, geo.R * 0.42, 3);
    const core = new THREE.Mesh(exG, exCore);
    core.position.set(x, y, z);
    core.scale.set(geo.R * 0.22, geo.R * 0.22, 1.6);
    grp.add(outer, core);
    ud.exhaust.push(outer, core);
  }
  // nav lights
  const lg = kit.geo("navlight", () => new THREE.SphereGeometry(0.16, 6, 4));
  for (const [x, y, z, c] of geo.lights) {
    const m = new THREE.Mesh(lg, kit.basic("nav" + c, c, { toneMapped: false }));
    m.position.set(x, y, z);
    grp.add(m);
    ud.lights.push({ mesh: m, blink: c === 0xffffff });
  }
  // missiles on pylons
  const mg = missileGeometry(kit);
  const mm = kit.std("missileW", 0xe8eaec, { metal: 0.2, rough: 0.5 });
  const nm = Math.min(opts.missiles ?? 4, geo.pylons.length);
  for (let i = 0; i < geo.pylons.length; i++) {
    const [x, y, z] = geo.pylons[[0, 1, 2, 3][i]];
    const m = new THREE.Mesh(mg, mm);
    m.position.set(x, y, z);
    m.visible = i < nm;
    grp.add(m);
    ud.missiles.push(m);
  }
  // bombs under the belly
  const bg = bombGeometry(kit);
  const bm = kit.std("bombG", 0x5b6150, { metal: 0.3, rough: 0.6 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(bg, bm);
    b.position.set(s * geo.R * 0.7, -geo.R * 0.95 - 0.25, 0.5);
    b.visible = (opts.bombs ?? 0) > 0;
    grp.add(b);
    ud.bombs.push(b);
  }
  if (opts.gear) {
    const gear = new THREE.Mesh(gearGeometry(kit, key, L), kit.std("gear", 0x2c2f33, { metal: 0.6, rough: 0.5 }));
    grp.add(gear);
    ud.gear = gear;
  }
  return grp;
}

/* ------------------------------------------------------------------ big aircraft */
const BIG = {
  bomber: { body: 0x6c6a5f, accent: 0x3f3d37, stripe: 0xd0302a, len: 34, span: 46, engines: 4, high: false, ttail: false },
  cargo: { body: 0x9aa7b4, accent: 0x5a6774, stripe: 0x5fd6ff, len: 36, span: 42, engines: 4, high: true, ttail: true },
  attacker: { body: 0x77705c, accent: 0x4a4536, stripe: 0xd8382a, len: 18, span: 20, engines: 2, high: false, ttail: false },
  gunship: { body: 0x7a8c70, accent: 0x46523f, stripe: 0x5fd6ff, len: 20, span: 22, engines: 2, high: true, ttail: false },
};
export function buildBig(kit, kind) {
  const L = BIG[kind] || BIG.bomber;
  const geo = kit.geo("big:" + kind, () => {
    const G = { body: [], accent: [], stripe: [], glass: [], dark: [] };
    const len = L.len;
    const half = len / 2;
    const R = len * 0.075;
    const fus = lathe([[R * 0.3, 0], [R * 0.9, len * 0.12], [R, len * 0.3], [R, len * 0.75], [R * 0.8, len * 0.9], [R * 0.3, len * 0.99], [0.05, len]], 16);
    fus.rotateX(-Math.PI / 2).translate(0, 0, half);
    G.body.push(fus);
    G.glass.push(at(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, R * 0.55, -half + len * 0.08, 0, 0, 0, R * 0.7, R * 0.5, len * 0.05));
    const S = L.span / 2;
    const wy = L.high ? R * 0.8 : -R * 0.3;
    const zw = -half + len * 0.38;
    const c = len * 0.18;
    G.accent.push(plate([[-S, zw + c * 0.9 + S * 0.12], [-S, zw + S * 0.12], [0, zw], [S, zw + S * 0.12], [S, zw + c * 0.9 + S * 0.12], [0, zw + c]], 0.4, 0.1).translate(0, wy, 0));
    // engines on the wings
    const n = L.engines;
    for (let i = 0; i < n; i++) {
      const f = n === 4 ? [-0.62, -0.32, 0.32, 0.62][i] : [-0.36, 0.36][i];
      const x = f * S;
      const z = zw + Math.abs(f) * S * 0.12 - 1;
      G.dark.push(at(tubeZ(R * 0.32, len * 0.16, 12), x, wy - R * 0.45, z));
      G.accent.push(at(tubeZ(R * 0.36, len * 0.05, 12), x, wy - R * 0.45, z - len * 0.06));
    }
    // tail
    const zt = half - len * 0.12;
    const th = len * 0.24;
    G.body.push(at(fin([[zt - len * 0.06, 0], [zt + len * 0.05, th], [zt + len * 0.13, th], [zt + len * 0.12, 0]], 0.3), 0, R * 0.6, 0));
    G.stripe.push(at(fin([[zt + len * 0.05, th * 0.8], [zt + len * 0.125, th * 0.8], [zt + len * 0.13, th], [zt + len * 0.05, th]], 0.34), 0, R * 0.6, 0));
    const hs = S * 0.36;
    const hy = L.ttail ? R * 0.6 + th : R * 0.3;
    G.accent.push(plate([[-hs, zt + len * 0.1], [-hs, zt + len * 0.05], [0, zt - len * 0.02], [hs, zt + len * 0.05], [hs, zt + len * 0.1], [0, zt + len * 0.1]], 0.22, 0.05).translate(0, hy, len * 0.02));
    const g = mergeInto(G);
    g.R = R;
    g.props = [];
    g.lights = [[-S, wy, zw + S * 0.12 + 0.5, 0xff2a2a], [S, wy, zw + S * 0.12 + 0.5, 0x2aff5a], [0, R * 0.6 + th, zt + len * 0.12, 0xffffff]];
    g.engines = Array.from({ length: n }, (_, i) => {
      const f = n === 4 ? [-0.62, -0.32, 0.32, 0.62][i] : [-0.36, 0.36][i];
      return [f * S, wy - R * 0.45, zw + Math.abs(f) * S * 0.12 - 1 + len * 0.08];
    });
    return g;
  });
  const grp = new THREE.Group();
  const mats = {
    body: kit.std("bb:" + kind, L.body, { metal: 0.45, rough: 0.5 }),
    accent: kit.std("ba:" + kind, L.accent, { metal: 0.45, rough: 0.55 }),
    stripe: kit.std("bs:" + kind, L.stripe, { metal: 0.2, rough: 0.45 }),
    glass: kit.std("glassB", 0x10243a, { metal: 0.95, rough: 0.08, emissive: 0x06202e, ei: 0.6 }),
    dark: kit.std("jdark", 0x2a2d31, { metal: 0.7, rough: 0.45 }),
  };
  for (const [k, g] of Object.entries(geo)) if (g?.isBufferGeometry && mats[k]) grp.add(new THREE.Mesh(g, mats[k]));
  const ud = (grp.userData = { exhaust: [], lights: [], missiles: [], bombs: [], R: geo.R, length: L.len, engines: geo.engines });
  const lg = kit.geo("navlight", () => new THREE.SphereGeometry(0.16, 6, 4));
  for (const [x, y, z, c] of geo.lights) {
    const m = new THREE.Mesh(lg, kit.basic("nav" + c, c, { toneMapped: false }));
    m.position.set(x, y, z);
    m.scale.setScalar(2);
    grp.add(m);
    ud.lights.push({ mesh: m, blink: c === 0xffffff });
  }
  return grp;
}

/* ------------------------------------------------------------------ ground units */
/** Ground/naval unit group + userData {spin: mesh to rotate (radar dish), turret}. */
export function buildGround(kit, kind, side = "enemy") {
  const geo = kit.geo("gnd:" + kind, () => groundParts(kind));
  const grp = new THREE.Group();
  const M = {
    concrete: kit.std("g-concrete", 0xa8a294, { rough: 0.95, metal: 0 }),
    olive: kit.std("g-olive", 0x5d6045, { rough: 0.8, metal: 0.15 }),
    sand: kit.std("g-sand", 0x9a8b6a, { rough: 0.85, metal: 0.1 }),
    steel: kit.std("g-steel", 0x6f767e, { rough: 0.5, metal: 0.6 }),
    dark: kit.std("g-dark", 0x2b2e31, { rough: 0.7, metal: 0.4 }),
    white: kit.std("g-white", 0xe4e6e6, { rough: 0.5, metal: 0.2 }),
    red: kit.std("g-red", 0xb3302a, { rough: 0.6, metal: 0.2 }),
    navy: kit.std("g-navy", 0x5a6670, { rough: 0.55, metal: 0.4 }),
    hull: kit.std("g-hull", 0x3e464e, { rough: 0.6, metal: 0.3 }),
    friendHull: kit.std("g-fhull", 0x2c4a66, { rough: 0.6, metal: 0.3 }),
    glass: kit.std("g-glass", 0x14303f, { rough: 0.1, metal: 0.9, emissive: 0x0a3040, ei: 0.5 }),
    c1: kit.std("g-c1", 0xc8562e, { rough: 0.7 }),
    c2: kit.std("g-c2", 0x2e7cc8, { rough: 0.7 }),
    c3: kit.std("g-c3", 0xd9b23a, { rough: 0.7 }),
  };
  for (const [k, g] of Object.entries(geo)) if (g?.isBufferGeometry && M[k]) grp.add(new THREE.Mesh(g, M[k]));
  grp.userData = {};
  if (geo.dish) {
    const dish = new THREE.Group();
    dish.position.set(0, geo.dishY, 0);
    dish.add(new THREE.Mesh(geo.dish, M.white));
    grp.add(dish);
    grp.userData.spin = dish;
  }
  return grp;
}

function groundParts(kind) {
  const G = { concrete: [], olive: [], sand: [], steel: [], dark: [], white: [], red: [], navy: [], hull: [], friendHull: [], glass: [], c1: [], c2: [], c3: [] };
  let dish = null;
  let dishY = 0;
  const hullShape = (len, beam) => {
    const s = new THREE.Shape();
    s.moveTo(0, -len / 2);
    s.quadraticCurveTo(beam * 0.55, -len * 0.25, beam / 2, 0);
    s.lineTo(beam / 2, len * 0.45);
    s.lineTo(beam * 0.4, len / 2);
    s.lineTo(-beam * 0.4, len / 2);
    s.lineTo(-beam / 2, len * 0.45);
    s.lineTo(-beam / 2, 0);
    s.quadraticCurveTo(-beam * 0.55, -len * 0.25, 0, -len / 2);
    return s;
  };
  const hull = (len, beam, h) => {
    const g = new THREE.ExtrudeGeometry(hullShape(len, beam), { depth: h, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, h - 1, 0);
    return g;
  };
  switch (kind) {
    case "radar": {
      G.concrete.push(at(box(26, 3, 26), 0, 1.5, 0));
      G.steel.push(at(cyl(1.6, 2.4, 16, 8), 0, 11, 0));
      G.dark.push(at(box(8, 5, 6), 9, 5.5, 6));
      dish = at(new THREE.SphereGeometry(9, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), 0, 0, 0, Math.PI / 2 + 0.35, 0, 0, 1, 0.45, 1);
      dishY = 20;
      break;
    }
    case "sam": {
      G.olive.push(at(box(6, 2.4, 12), 0, 1.8, 0));
      G.dark.push(at(box(5.6, 1.6, 2.6), 0, 2.4, -5));
      for (const x of [-1.3, 1.3]) for (const y of [0, 1.5]) G.olive.push(at(tubeZ(0.7, 8, 8), x, 4.4 + y, 1.4, -0.55));
      for (const x of [-2.6, 2.6]) for (const z of [-4, 0, 4]) G.dark.push(at(cyl(0.8, 0.8, 0.8, 10), x, 0.8, z, 0, 0, Math.PI / 2));
      break;
    }
    case "aa": {
      G.sand.push(at(new THREE.TorusGeometry(5, 1.3, 6, 16), 0, 0.9, 0, Math.PI / 2));
      G.olive.push(at(cyl(2, 2.4, 1.8, 10), 0, 1.4, 0));
      for (const x of [-0.8, 0.8]) G.dark.push(at(tubeZ(0.25, 7, 6), x, 3, -2.8, -0.6));
      G.olive.push(at(box(2.6, 1.6, 2.4), 0, 2.8, 0));
      break;
    }
    case "hangar": {
      const shell = new THREE.CylinderGeometry(22, 22, 52, 18, 1, true, -Math.PI / 2, Math.PI);
      G.steel.push(at(shell, 0, 0, 0, Math.PI / 2, 0, 0, 1, 0.75, 1));
      G.dark.push(at(new THREE.CircleGeometry(22, 18, 0, Math.PI), 0, 0, -26, 0, Math.PI, 0, 1, 0.75, 1));
      G.steel.push(at(new THREE.CircleGeometry(22, 18, 0, Math.PI), 0, 0, 26, 0, 0, 0, 1, 0.75, 1));
      G.concrete.push(at(box(48, 0.6, 58), 0, 0.3, 0));
      break;
    }
    case "fuel": {
      for (const [x, z] of [[-7, 0], [7, 0], [0, 10]]) {
        G.white.push(at(cyl(5, 5, 9, 16), x, 4.5, z));
        G.steel.push(at(new THREE.SphereGeometry(5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), x, 9, z, 0, 0, 0, 1, 0.3, 1));
        G.red.push(at(cyl(5.05, 5.05, 1, 16, true), x, 6.5, z));
      }
      break;
    }
    case "tower": {
      G.concrete.push(at(box(8, 22, 8), 0, 11, 0));
      G.glass.push(at(cyl(7, 6, 5, 8), 0, 24.5, 0));
      G.dark.push(at(cyl(7.6, 7.6, 1, 8), 0, 27.5, 0));
      G.red.push(at(cyl(0.2, 0.2, 6, 4), 0, 31, 0));
      break;
    }
    case "tank": {
      G.olive.push(at(box(6.4, 1.8, 9.5), 0, 1.6, 0));
      G.dark.push(at(box(1.4, 1.5, 10), -3.3, 0.9, 0));
      G.dark.push(at(box(1.4, 1.5, 10), 3.3, 0.9, 0));
      G.olive.push(at(cyl(2.3, 2.6, 1.4, 10), 0, 3.2, 0.5));
      G.dark.push(at(tubeZ(0.22, 7, 6), 0, 3.3, -3.8));
      break;
    }
    case "truck": {
      G.olive.push(at(box(3, 2.4, 3), 0, 2, -3.6));
      G.glass.push(at(box(2.8, 1, 0.1), 0, 2.6, -5.1));
      G.sand.push(at(box(3.2, 3, 6.4), 0, 2.6, 1.2));
      for (const z of [-3.6, 0, 3]) for (const x of [-1.5, 1.5]) G.dark.push(at(cyl(0.7, 0.7, 0.6, 10), x, 0.7, z, 0, 0, Math.PI / 2));
      break;
    }
    case "bunker": {
      G.concrete.push(at(box(30, 6, 22), 0, 3, 0));
      G.concrete.push(at(box(24, 3, 16), 0, 7.5, 0));
      G.dark.push(at(box(18, 1, 0.4), 0, 4.5, -11.1));
      G.dark.push(at(box(6, 4, 0.4), 0, 2, 11.1));
      break;
    }
    case "artillery": {
      G.olive.push(at(box(5, 1.2, 6), 0, 0.9, 0));
      G.olive.push(at(box(2.4, 2, 2.4), 0, 2.4, 0));
      G.dark.push(at(tubeZ(0.35, 11, 8), 0, 4.2, -4.2, -0.5));
      for (const x of [-2.4, 2.4]) G.dark.push(at(cyl(1, 1, 0.6, 10), x, 1, 1.5, 0, 0, Math.PI / 2));
      break;
    }
    case "boat": {
      G.hull.push(hull(28, 7, 3));
      G.navy.push(at(box(5, 3, 8), 0, 3.5, 2));
      G.glass.push(at(box(4.8, 0.8, 0.2), 0, 4.2, -2.1));
      G.dark.push(at(tubeZ(0.2, 4, 6), 0, 3.4, -8, -0.2));
      G.steel.push(at(cyl(0.15, 0.15, 6, 4), 0, 6.5, 3));
      break;
    }
    case "frigate":
    case "destroyer": {
      const big = kind === "destroyer";
      const len = big ? 120 : 88;
      const beam = big ? 15 : 12;
      G.hull.push(hull(len, beam, 7));
      G.navy.push(at(box(beam * 0.7, 7, len * 0.22), 0, 9.5, len * 0.04));
      G.navy.push(at(box(beam * 0.55, 5, len * 0.14), 0, 15, -len * 0.02));
      G.glass.push(at(box(beam * 0.56, 1, 0.3), 0, 16, -len * 0.09));
      G.navy.push(at(cyl(2.2, 2.6, 8, 8), 0, 10, len * 0.22));
      G.steel.push(at(cyl(0.4, 0.6, 20, 6), 0, 25, -len * 0.02));
      G.steel.push(at(box(8, 0.4, 0.4), 0, 31, -len * 0.02));
      const guns = big ? [-len * 0.32, -len * 0.2, len * 0.36] : [-len * 0.3, len * 0.34];
      for (const z of guns) {
        G.navy.push(at(cyl(2.4, 3, 2.4, 10), 0, 7, z));
        G.dark.push(at(tubeZ(0.3, 8, 6), 0, 7.6, z + (z < 0 ? -4.5 : 4.5)));
      }
      G.dark.push(at(box(beam * 0.5, 3, 10), 0, 8, len * 0.32));
      break;
    }
    case "freighter": {
      G.friendHull.push(hull(110, 18, 9));
      G.white.push(at(box(15, 12, 12), 0, 14, 42));
      G.glass.push(at(box(15.2, 1.4, 0.3), 0, 18, 35.8));
      const cs = ["c1", "c2", "c3"];
      for (let i = 0; i < 12; i++) {
        const z = -40 + (i % 6) * 12;
        const x = i < 6 ? -4.2 : 4.2;
        const h = 2 + ((i * 7) % 3);
        for (let j = 0; j < h; j++) G[cs[(i + j) % 3]].push(at(box(7.6, 2.5, 11.4), x, 9.4 + j * 2.6, z));
      }
      G.dark.push(at(cyl(1.5, 1.8, 8, 8), 0, 23, 44));
      break;
    }
    default:
      G.olive.push(box(4, 4, 4));
  }
  const g = mergeInto(G);
  if (dish) {
    g.dish = dish;
    g.dishY = dishY;
  }
  return g;
}

/** Destroyed-unit rubble (shared). */
export function buildWreck(kit, radius) {
  const g = kit.geo("wreck", () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      parts.push(at(new THREE.DodecahedronGeometry(0.35 + (i % 3) * 0.12, 0), Math.cos(a) * 0.5, 0.15, Math.sin(a) * 0.5, i, i * 2, 0, 1, 0.6, 1));
    }
    parts.push(at(new THREE.CircleGeometry(1.2, 12), 0, 0.03, 0, -Math.PI / 2));
    return mergeGeometries(parts.map(prep));
  });
  const m = new THREE.Mesh(g, kit.std("wreck", 0x1d1b19, { rough: 1, metal: 0.1 }));
  m.scale.setScalar(radius);
  return m;
}
