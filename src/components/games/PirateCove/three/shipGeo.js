/**
 * Pirate Cove — procedural ship geometry (cached per class + look).
 *
 * Ship-local axes: +z = bow, +x = port (left), y up, waterline at y = 0.
 * The hull is lofted from stations along the keel; each station is a
 * cross-section from the keel up through the turn of the bilge to the
 * gunwale with a little tumblehome. Paint is baked into vertex colours
 * (bottom paint below the waterline, wood, an accent stripe on the gun
 * deck, a dark wale at the rail) so one plank texture serves every ship.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SHIP_CLASSES } from "../data/ships.js";

export const SHIP_SHAPES = {
  sloop: {
    draft: 1.35,
    free: 1.55,
    sheer: 0.55,
    castle: 0,
    fore: 0,
    bulwark: 0.8,
    bowsprit: 5,
    masts: [{ z: 0.06, h: 14, sails: [{ y: 6.6, w: 7.2, h: 5.3 }, { y: 11.4, w: 5.0, h: 3.4 }] }],
    jib: true,
    windows: 0,
  },
  brig: {
    draft: 1.75,
    free: 1.85,
    sheer: 0.65,
    castle: 1.15,
    fore: 0.5,
    bulwark: 0.9,
    bowsprit: 6.5,
    masts: [
      { z: 0.25, h: 16.5, sails: [{ y: 7.4, w: 8.2, h: 5.6 }, { y: 12.8, w: 6.2, h: 4 }] },
      { z: -0.08, h: 18.5, sails: [{ y: 7.8, w: 9.2, h: 6 }, { y: 13.6, w: 7, h: 4.3 }, { y: 17.2, w: 4.6, h: 2.2 }] },
    ],
    jib: true,
    windows: 3,
  },
  galleon: {
    draft: 2.3,
    free: 2.25,
    sheer: 0.8,
    castle: 2.3,
    fore: 1.2,
    bulwark: 1.0,
    bowsprit: 8,
    masts: [
      { z: 0.28, h: 20, sails: [{ y: 8.8, w: 10.5, h: 6.6 }, { y: 15, w: 8, h: 4.6 }] },
      { z: 0.0, h: 23.5, sails: [{ y: 9.4, w: 12, h: 7.2 }, { y: 16.2, w: 9.2, h: 5 }, { y: 20.6, w: 6, h: 2.6 }] },
      { z: -0.28, h: 17, sails: [{ y: 9.6, w: 7.6, h: 5 }, { y: 14.4, w: 5.6, h: 3.2 }] },
    ],
    jib: true,
    windows: 5,
  },
};

const PROFILE = [
  [0, -1],
  [0.42, -0.95],
  [0.74, -0.77],
  [0.93, -0.44],
  [1, -0.06],
  [1.0, 0.34],
  [0.985, 0.7],
  [0.955, 1],
];

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function hullDims(clsId) {
  const C = SHIP_CLASSES[clsId];
  const S = SHIP_SHAPES[clsId];
  const L = C.length;
  const B = C.beam;
  const halfBeam = (u) => {
    const b = u < 0.38 ? 0.74 + 0.26 * Math.sin((u / 0.38) * Math.PI * 0.5) : Math.pow(Math.cos(((u - 0.38) / 0.62) * Math.PI * 0.5), 0.72);
    return Math.max(0.025, b) * B * 0.5;
  };
  const draft = (u) => S.draft * (u < 0.8 ? 1 : 1 - ((u - 0.8) / 0.2) * 0.55) * (u < 0.06 ? 0.86 + u * 2.3 : 1);
  const top = (u) =>
    S.free + S.sheer * Math.pow((u - 0.42) / 0.58, 2) + S.castle * sstep(0.29, 0.22, u) + S.fore * sstep(0.8, 0.88, u);
  const z = (u) => (u - 0.5) * L;
  return { C, S, L, B, halfBeam, draft, top, z };
}

const geoCache = new Map();

export function disposeShipGeometry() {
  for (const g of geoCache.values()) for (const v of Object.values(g)) if (v && v.dispose) v.dispose();
  geoCache.clear();
}

function hexColor(h) {
  return new THREE.Color(h);
}

/** Builds (or returns cached) geometries for a class + paint scheme. */
export function shipGeometry(clsId, look) {
  const key = `${clsId}|${look.hullColor}|${look.accent}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const D = hullDims(clsId);
  const { L, S, halfBeam, draft, top, z } = D;
  const stations = 34;
  const wood = hexColor(look.hullColor || "#6b4428");
  const bottom = hexColor("#3a2219").lerp(hexColor("#2a1a14"), 0.4);
  const stripe = hexColor(look.accent || "#2f6f8f");
  const wale = wood.clone().multiplyScalar(0.45);

  // ---------------------------------------------------------------- hull skin
  const ring = [];
  for (let i = PROFILE.length - 1; i >= 0; i--) ring.push([-PROFILE[i][0], PROFILE[i][1]]); // starboard (−x) top → keel
  for (let i = 1; i < PROFILE.length; i++) ring.push([PROFILE[i][0], PROFILE[i][1]]); // port keel → top
  const R = ring.length;
  const pos = [];
  const col = [];
  const uv = [];
  for (let s = 0; s <= stations; s++) {
    const u = s / stations;
    const hb = halfBeam(u);
    const dr = draft(u);
    const tp = top(u);
    for (let r = 0; r < R; r++) {
      const [px, py] = ring[r];
      const y = py < 0 ? py * dr : py * tp;
      const x = px * hb;
      pos.push(x, y, z(u));
      uv.push(z(u) / 2.6, y / 5.2);
      let c;
      if (y < 0.12) c = bottom;
      else if (y > tp * 0.9) c = wale;
      else if (y > tp * 0.42 && y < tp * 0.64) c = stripe;
      else c = wood;
      col.push(c.r, c.g, c.b);
    }
  }
  const idx = [];
  for (let s = 0; s < stations; s++) {
    for (let r = 0; r < R - 1; r++) {
      const a = s * R + r;
      const b = a + 1;
      const c = a + R;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // transom (u = 0) — fan from its centre
  const tc = pos.length / 3;
  const tTop = top(0);
  pos.push(0, tTop * 0.35, z(0) - 0.02);
  uv.push(0, 0);
  col.push(wood.r * 0.85, wood.g * 0.85, wood.b * 0.85);
  for (let r = 0; r < R - 1; r++) idx.push(tc, r + 1, r);
  const hull = new THREE.BufferGeometry();
  hull.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  hull.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  hull.setIndex(idx);
  hull.computeVertexNormals();

  // ---------------------------------------------------------------- deck + bulwark inner + rail cap
  const deckPos = [];
  const deckUv = [];
  const deckIdx = [];
  const inPos = [];
  const inIdx = [];
  const railPos = [];
  const railIdx = [];
  for (let s = 0; s <= stations; s++) {
    const u = s / stations;
    const hb = halfBeam(u) * 0.955;
    const tp = top(u);
    const dy = tp - S.bulwark;
    const w = Math.max(0.02, hb - 0.14);
    deckPos.push(-w, dy, z(u), w, dy, z(u));
    deckUv.push(0, z(u) / 4, 1, z(u) / 4);
    inPos.push(-w, dy, z(u), -w, tp, z(u), w, dy, z(u), w, tp, z(u));
    railPos.push(-hb - 0.03, tp + 0.04, z(u), -w, tp + 0.04, z(u), w, tp + 0.04, z(u), hb + 0.03, tp + 0.04, z(u));
    if (s < stations) {
      const a = s * 2;
      deckIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      const q = s * 4;
      inIdx.push(q, q + 1, q + 4, q + 1, q + 5, q + 4); // starboard inner face (faces +x)
      inIdx.push(q + 2, q + 6, q + 3, q + 3, q + 6, q + 7); // port inner face (faces −x)
      railIdx.push(q, q + 4, q + 1, q + 1, q + 4, q + 5, q + 2, q + 6, q + 3, q + 3, q + 6, q + 7);
    }
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute("position", new THREE.Float32BufferAttribute(deckPos, 3));
  deck.setAttribute("uv", new THREE.Float32BufferAttribute(deckUv, 2));
  deck.setIndex(deckIdx);
  deck.computeVertexNormals();
  const inner = new THREE.BufferGeometry();
  inner.setAttribute("position", new THREE.Float32BufferAttribute(inPos, 3));
  inner.setIndex(inIdx);
  inner.computeVertexNormals();
  const rail = new THREE.BufferGeometry();
  rail.setAttribute("position", new THREE.Float32BufferAttribute(railPos, 3));
  rail.setIndex(railIdx);
  rail.computeVertexNormals();

  // ---------------------------------------------------------------- gunports + cannons (per side)
  const n = D.C.perSide;
  const ports = [];
  const barrels = { left: [], right: [] };
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0 : i / (n - 1) - 0.5;
    const along = -frac * L * 0.62 + L * 0.04;
    const u = along / L + 0.5;
    const hb = halfBeam(u);
    const tp = top(u);
    const y = Math.min(tp * 0.53, D.C.deckY * 0.85);
    for (const side of [1, -1]) {
      const port = new THREE.BoxGeometry(0.06, 0.55, 0.62);
      port.translate(side * (hb + 0.02), y, along);
      ports.push(port);
      const lid = new THREE.BoxGeometry(0.05, 0.5, 0.6);
      lid.translate(0, 0.25, 0);
      lid.rotateZ(side * 0.9);
      lid.translate(side * (hb + 0.05), y + 0.3, along);
      ports.push(lid);
      const b = new THREE.CylinderGeometry(0.11, 0.15, 1.5, 10);
      b.rotateZ(Math.PI / 2);
      b.translate(side * (hb - 0.2), y, along);
      const muzzle = new THREE.TorusGeometry(0.13, 0.04, 6, 10);
      muzzle.rotateY(Math.PI / 2);
      muzzle.translate(side * (hb + 0.55), y, along);
      barrels[side === 1 ? "left" : "right"].push(b, muzzle);
    }
  }
  const portGeo = mergeGeometries(ports.map((g) => g.toNonIndexed()));
  ports.forEach((g) => g.dispose());
  const cannonL = mergeGeometries(barrels.left.map((g) => g.toNonIndexed()));
  const cannonR = mergeGeometries(barrels.right.map((g) => g.toNonIndexed()));
  [...barrels.left, ...barrels.right].forEach((g) => g.dispose());

  // ---------------------------------------------------------------- masts, yards, bowsprit, rudder
  const spars = [];
  const mastTops = [];
  const sails = [];
  for (const m of S.masts) {
    const mz = m.z * L;
    const base = top(m.z + 0.5) - S.bulwark;
    const mast = new THREE.CylinderGeometry(0.13 + m.h * 0.004, 0.2 + m.h * 0.008, m.h, 10);
    mast.translate(0, base + m.h / 2, mz);
    spars.push(mast);
    mastTops.push({ x: 0, y: base + m.h, z: mz, base });
    for (const sl of m.sails) {
      const yard = new THREE.CylinderGeometry(0.08, 0.1, sl.w + 0.6, 8);
      yard.rotateZ(Math.PI / 2);
      yard.translate(0, base + sl.y, mz + 0.25);
      spars.push(yard);
      sails.push({ x: 0, y: base + sl.y, z: mz + 0.32, w: sl.w, h: sl.h });
    }
    // crow's nest on the tallest mast
    if (m === S.masts.reduce((a, b) => (b.h > a.h ? b : a))) {
      const nest = new THREE.CylinderGeometry(0.75, 0.6, 0.5, 12, 1, true);
      nest.translate(0, base + m.h * 0.68, mz);
      spars.push(nest);
      const floor = new THREE.CylinderGeometry(0.75, 0.75, 0.08, 12);
      floor.translate(0, base + m.h * 0.68 - 0.24, mz);
      spars.push(floor);
    }
  }
  const bowU = 1;
  const bowY = top(bowU) - 0.1;
  const sprit = new THREE.CylinderGeometry(0.07, 0.16, S.bowsprit, 8);
  sprit.translate(0, S.bowsprit / 2, 0);
  sprit.rotateX(Math.PI / 2 - 0.32);
  sprit.translate(0, bowY, L / 2 - 0.4);
  spars.push(sprit);
  const spritTip = { x: 0, y: bowY + Math.sin(0.32) * S.bowsprit, z: L / 2 - 0.4 + Math.cos(0.32) * S.bowsprit };
  const rudder = new THREE.BoxGeometry(0.16, draft(0) * 1.1 + top(0) * 0.4, 1.1);
  rudder.translate(0, (top(0) * 0.4 - draft(0) * 1.1) / 2, -L / 2 - 0.45);
  spars.push(rudder);
  const sparGeo = mergeGeometries(spars.map((g) => g.toNonIndexed()));
  spars.forEach((g) => g.dispose());

  // ---------------------------------------------------------------- rigging (line segments)
  const rig = [];
  for (const t of mastTops) {
    const uM = t.z / L + 0.5;
    const hb = halfBeam(uM);
    const rail = top(uM);
    for (const side of [1, -1]) {
      for (let k = -1; k <= 1; k++) {
        rig.push(0, t.y * 0.96, t.z, side * hb * 0.97, rail, t.z + k * 1.1 - 0.6);
      }
    }
  }
  // fore-and-aft stays: bowsprit → foremast top → next mast tops → stern
  const order = [...mastTops].sort((a, b) => b.z - a.z);
  rig.push(spritTip.x, spritTip.y, spritTip.z, order[0].x, order[0].y * 0.97, order[0].z);
  for (let i = 0; i < order.length - 1; i++) rig.push(order[i].x, order[i].y * 0.9, order[i].z, order[i + 1].x, order[i + 1].y * 0.97, order[i + 1].z);
  const last = order[order.length - 1];
  rig.push(last.x, last.y * 0.9, last.z, 0, top(0) + 0.1, -L / 2 + 0.3);
  const rigGeo = new THREE.BufferGeometry();
  rigGeo.setAttribute("position", new THREE.Float32BufferAttribute(rig, 3));

  // ---------------------------------------------------------------- jib (bowsprit tip → foremast)
  let jib = null;
  if (S.jib) {
    const fm = order[0];
    const a = new THREE.Vector3(spritTip.x, spritTip.y, spritTip.z);
    const b = new THREE.Vector3(0, fm.base + (fm.y - fm.base) * 0.6, fm.z + 0.3);
    const c = new THREE.Vector3(0, top(0.92) + 0.4, L * 0.42);
    jib = triangleSail(a, b, c);
  }

  const stern = { y: top(0), z: -L / 2, hb: halfBeam(0), windows: S.windows };
  const out = { hull, deck, inner, rail, portGeo, cannonL, cannonR, sparGeo, rigGeo, jib, sails, mastTops, stern, dims: D, spritTip };
  geoCache.set(key, out);
  return out;
}

/** Billowed triangle (jib) from three points. */
function triangleSail(a, b, c) {
  const steps = 8;
  const pos = [];
  const uv = [];
  const idx = [];
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  if (n.x < 0) n.negate();
  let k = 0;
  const rows = [];
  for (let i = 0; i <= steps; i++) {
    const row = [];
    for (let j = 0; j <= steps - i; j++) {
      const u = i / steps;
      const v = j / steps;
      const w = 1 - u - v;
      const p = new THREE.Vector3().addScaledVector(a, w).addScaledVector(b, u).addScaledVector(c, v);
      const bil = Math.sin(Math.PI * Math.min(1, (u + 0.05) * 1.6)) * Math.sin(Math.PI * Math.min(1, w * 1.4 + 0.05)) * 0.9;
      p.addScaledVector(new THREE.Vector3(0.0, 0, 1), bil * 0.6).addScaledVector(n, bil * 0.4);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
      row.push(k++);
    }
    rows.push(row);
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps - i; j++) {
      idx.push(rows[i][j], rows[i + 1][j], rows[i][j + 1]);
      if (j < steps - i - 1) idx.push(rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const sailCache = new Map();
/** A square sail hanging from its yard (top edge at y = 0), billowed toward +z. */
export function squareSailGeometry(w, h) {
  const key = `${w.toFixed(2)}x${h.toFixed(2)}`;
  if (sailCache.has(key)) return sailCache.get(key);
  const g = new THREE.PlaneGeometry(w, h, 10, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i) - h / 2; // 0 at top → −h at foot
    const u = x / w + 0.5;
    const v = -y / h;
    // the foot is a touch narrower than the head; belly bulges forward
    const narrow = 1 - v * 0.12;
    const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.12)) * Math.min(w, h) * 0.17;
    p.setXYZ(i, x * narrow, y, belly);
  }
  g.computeVertexNormals();
  sailCache.set(key, g);
  return g;
}

export function disposeSailGeometry() {
  for (const g of sailCache.values()) g.dispose();
  sailCache.clear();
}
