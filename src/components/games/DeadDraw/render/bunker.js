/**
 * The bunker: a barrel-vaulted concrete shelter (walls, vault, ribs and end
 * walls built here with tiled Poly Haven PBR sets) furnished with scanned CC0
 * Poly Haven props — metal desk, steel shelving full of supplies, generator,
 * compressor, radio transceiver, CRT security monitors, fluorescent tubes,
 * duct runs, gas mask, bed, manhole hatch — plus the pieces no prop exists
 * for, modelled here: the blast door (extruded slab, hand wheel, hinges,
 * porthole), the storage door, the Sector C bulkhead, the vent grille, the
 * pipe runs, and the airlock corridor behind the door that the CCTV sees.
 *
 * Returns handles for everything the director animates (lights, doors,
 * hatch, vent, monitors, rat) and named camera targets.
 */
import * as THREE from "three";
import { loadProp, loadPart, fitProp, pbr, track } from "./assets.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const ROOM = { w: 6.4, x0: -3.2, x1: 3.2, z0: -5.6, z1: 4.2, wallH: 1.7, vaultR: 3.2, vaultK: 0.55 };
/** Height of the vault above floor at lateral position x. */
export const vaultY = (x) => ROOM.wallH + ROOM.vaultR * ROOM.vaultK * Math.sqrt(Math.max(0, 1 - (x / ROOM.vaultR) ** 2));

export const SEAT = V(0, 1.2, 3.25);

export const TARGETS = {
  desk: { pos: V(0, 1.2, 3.25), look: V(0, 0.55, 0.2) },
  room: { pos: V(0, 1.22, 3.25), look: V(0, 1.05, -4) },
  door: { pos: V(0, 1.25, 2.2), look: V(0, 1.15, -5.5) },
  vent: { pos: V(0.4, 1.25, 2.9), look: V(3.1, 1.4, 0.9) },
  generator: { pos: V(0.3, 1.2, 2.8), look: V(2.6, 0.5, -1.2) },
  monitors: { pos: V(0.35, 1.2, 3.05), look: V(1.75, 1.15, 2.05) },
  radio: { pos: V(-0.1, 1.15, 3.2), look: V(-0.62, 0.86, 2.48) },
  shelves: { pos: V(-0.3, 1.22, 3.0), look: V(-3.0, 1.0, 0.0) },
  storage: { pos: V(-0.4, 1.22, 2.6), look: V(-3.2, 1.0, -2.1) },
  sector: { pos: V(-0.3, 1.22, 2.4), look: V(-3.2, 1.1, -3.9) },
  hatch: { pos: V(0, 1.45, 2.7), look: V(0, 0.4, -2.4) },
  creature: { pos: V(0, 1.4, 2.3), look: V(0, 0.3, -2.4) },
  ceiling: { pos: V(0, 1.2, 3.2), look: V(0, 3.2, -1.5) },
};

/* ------------------------------------------------------------------ helpers */
function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Copy uv → uv2 is not needed in r169 (aoMap uses uv); keep geometry UVs in metres / tile. */
function planeUV(w, h, tile) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  return g;
}

/** Box with UVs scaled to metres so a tiling material doesn't stretch. */
function boxUV(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const [su, sv] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  return g;
}

/** End-wall outline: rectangle + elliptic vault, optionally with a door hole. */
function endWallShape(hole) {
  const { x0, x1, wallH, vaultR, vaultK } = ROOM;
  const s = new THREE.Shape();
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  s.lineTo(x1, wallH);
  const N = 40;
  for (let i = 1; i <= N; i++) {
    const a = (i / N) * Math.PI;
    s.lineTo(Math.cos(a) * vaultR, wallH + Math.sin(a) * vaultR * vaultK);
  }
  s.lineTo(x0, 0);
  if (hole) {
    const { w, h, r } = hole;
    const p = new THREE.Path();
    p.moveTo(-w / 2, 0);
    p.lineTo(w / 2, 0);
    p.lineTo(w / 2, h - r);
    p.quadraticCurveTo(w / 2, h, w / 2 - r, h);
    p.lineTo(-w / 2 + r, h);
    p.quadraticCurveTo(-w / 2, h, -w / 2, h - r);
    p.lineTo(-w / 2, 0);
    s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s, 8);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.2, uv.getY(i) / 2.2);
  return g;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

function extrudeUV(shape, depth, bevel, tile = 1) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return g;
}

/** Diagonal hazard stripes (yellow/black) as a small DataTexture — no text. */
let hazardTex = null;
function hazard() {
  if (hazardTex) return hazardTex;
  const s = 64;
  const d = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const on = ((x + y) % 32) < 16;
      const i = (y * s + x) * 4;
      const grime = 0.75 + 0.25 * Math.sin(x * 0.7) * Math.cos(y * 0.9);
      d[i] = on ? 178 * grime : 20;
      d[i + 1] = on ? 140 * grime : 18;
      d[i + 2] = on ? 30 : 16;
      d[i + 3] = 255;
    }
  hazardTex = track(new THREE.DataTexture(d, s, s));
  hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  hazardTex.magFilter = THREE.LinearFilter;
  hazardTex.generateMipmaps = true;
  hazardTex.minFilter = THREE.LinearMipmapLinearFilter;
  hazardTex.needsUpdate = true;
  return hazardTex;
}

async function place(name, { size = null, axis = "y", pos = V(), rotY = 0, rot = null, parent, ground = true, shadow = true } = {}) {
  const p = await loadProp(name);
  const w = size == null ? fitProp(p, null) : fitProp(p, size, axis, ground);
  w.position.copy(pos);
  w.rotation.y = rotY;
  if (rot) w.rotation.set(rot[0], rot[1], rot[2]);
  w.traverse((o) => {
    if (o.isMesh) o.castShadow = shadow;
  });
  parent.add(w);
  return w;
}

/** Shelf levels of a shelving prop: heights of upward-facing surfaces under its centre. */
function shelfLevels(obj) {
  obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj);
  const c = bb.getCenter(V());
  const rc = new THREE.Raycaster(V(c.x, bb.max.y + 0.5, c.z), V(0, -1, 0));
  const hits = rc.intersectObject(obj, true).filter((h) => h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.6);
  const ys = [];
  for (const h of hits) if (!ys.some((y) => Math.abs(y - h.point.y) < 0.08)) ys.push(h.point.y);
  return ys.sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ build */
export async function buildBunker({ quality = "high", onProgress } = {}) {
  const Q = quality;
  const root = new THREE.Group();
  const H = { root, lights: {}, tubes: [], anim: [], mats: new Set(), geos: new Set() };
  const own = (x) => {
    if (x.isMaterial) H.mats.add(x);
    else H.geos.add(x);
    return x;
  };
  const { x0, x1, z0, z1, wallH, vaultR, vaultK } = ROOM;
  const L = z1 - z0;
  const zc = (z0 + z1) / 2;

  /* ---------------- shell */
  const concrete = pbr("concrete_wall_008", { repeat: [1, 1], color: 0xb9b4aa, normalScale: 1.2, envMapIntensity: 0.35 });
  const concreteDark = pbr("dirty_concrete", { repeat: [1, 1], color: 0x8e8a82, normalScale: 1.1, envMapIntensity: 0.3 });
  const floorMat = pbr("concrete_floor_worn_001", { repeat: [1, 1], color: 0xa8a39a, normalScale: 1.1, envMapIntensity: 0.45 });
  const paint = pbr("painted_concrete", { repeat: [1, 1], color: 0x55604c, normalScale: 1.0, envMapIntensity: 0.3 });
  const rust = pbr("rusty_metal_02", { repeat: [1, 1], metalness: 1, roughness: 1, envMapIntensity: 0.8 });
  const doorPaint = pbr("rusty_painted_metal", { repeat: [1, 1], color: 0x8f9a84, metalness: 1, roughness: 1, envMapIntensity: 0.7 });
  const greenRust = pbr("green_metal_rust", { repeat: [1, 1], metalness: 1, roughness: 1, envMapIntensity: 0.7 });
  const plate = pbr("metal_plate", { repeat: [1, 1], metalness: 1, roughness: 1, envMapIntensity: 0.6, color: 0x9a9a96 });
  const coarse = pbr("rust_coarse_01", { repeat: [1, 1], metalness: 1, roughness: 1, envMapIntensity: 0.5 });
  const ceilMat = pbr("concrete_floor_02", { repeat: [1, 1], color: 0x8d8a84, normalScale: 1.2, envMapIntensity: 0.25, side: THREE.DoubleSide });
  const M = { concrete, concreteDark, floorMat, paint, rust, doorPaint, greenRust, plate, coarse, ceilMat };

  const floor = mesh(own(planeUV(ROOM.w, L, 2.2)), floorMat, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, zc);
  root.add(floor);

  for (const side of [-1, 1]) {
    const wall = mesh(own(planeUV(L, wallH, 2.2)), concrete, { cast: false });
    wall.rotation.y = -side * Math.PI / 2;
    wall.position.set(side * vaultR, wallH / 2, zc);
    root.add(wall);
    // painted lower band, slightly proud of the wall
    const band = mesh(own(planeUV(L, 1.05, 1.6)), paint, { cast: false });
    band.rotation.y = -side * Math.PI / 2;
    band.position.set(side * (vaultR - 0.006), 0.525, zc);
    root.add(band);
    const stripe = mesh(own(new THREE.PlaneGeometry(L, 0.05)), own(new THREE.MeshStandardMaterial({ color: 0x5a1a14, roughness: 0.8 })), { cast: false });
    stripe.rotation.y = -side * Math.PI / 2;
    stripe.position.set(side * (vaultR - 0.008), 1.07, zc);
    root.add(stripe);
  }

  // barrel vault: half cylinder, flattened, seen from inside
  const vg = own(new THREE.CylinderGeometry(vaultR, vaultR, L, 56, 1, true, -Math.PI / 2, Math.PI));
  {
    const uv = vg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * vaultR * 0.8) / 2.2, (uv.getY(i) * L) / 2.2);
  }
  // cylinder vertices: x = r·sinθ, z = r·cosθ (θ ∈ [-π/2, π/2] so z ≥ 0), y along the axis.
  // Remapped straight into room space: z becomes (flattened) height, the axis becomes depth.
  {
    const pos = vg.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i), wallH + pos.getZ(i) * vaultK, pos.getY(i));
    vg.computeVertexNormals();
  }
  const vault = mesh(vg, ceilMat, { cast: false });
  vault.position.set(0, 0, zc);
  root.add(vault);

  // end walls (door hole in the far wall)
  const DOOR = { w: 1.36, h: 2.08, r: 0.32 };
  const far = mesh(own(endWallShape(DOOR)), concrete, { cast: false });
  far.position.set(0, 0, z0);
  root.add(far);
  const near = mesh(own(endWallShape(null)), concrete, { cast: false });
  near.rotation.y = Math.PI;
  near.position.set(0, 0, z1);
  root.add(near);

  // steel ribs following the vault every ~2.3 m, with wall columns
  const ribPts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI;
    ribPts.push(V(Math.cos(a) * (vaultR - 0.07), wallH + Math.sin(a) * (vaultR - 0.07) * vaultK, 0));
  }
  const ribCurve = new THREE.CatmullRomCurve3(ribPts);
  const ribGeo = own(new THREE.TubeGeometry(ribCurve, 48, 0.07, 6, false));
  const colGeo = own(boxUV(0.16, wallH, 0.16, 0.8));
  for (const z of [z0 + 0.25, -3.1, -0.8, 1.5, z1 - 0.25]) {
    const rib = mesh(ribGeo, rust);
    rib.position.z = z;
    root.add(rib);
    for (const s of [-1, 1]) {
      const col = mesh(colGeo, rust);
      col.position.set(s * (vaultR - 0.08), wallH / 2, z);
      root.add(col);
    }
  }
  // floor drain channel down the middle
  const drain = mesh(own(boxUV(0.18, 0.02, L - 1, 0.5)), coarse, { cast: false });
  drain.position.set(0, 0.006, zc - 0.3);
  root.add(drain);
  onProgress?.(0.45);

  /* ---------------- blast door (far wall) */
  const door = new THREE.Group();
  const frameShape = roundedRect(DOOR.w + 0.36, DOOR.h + 0.3, DOOR.r + 0.1);
  frameShape.holes.push(roundedRect(DOOR.w, DOOR.h, DOOR.r));
  const frame = mesh(own(extrudeUV(frameShape, 0.22, 0.03, 0.9)), rust);
  frame.position.set(0, DOOR.h / 2, z0 - 0.08);
  root.add(frame);
  // hazard stripes around the frame
  const hz = own(new THREE.MeshStandardMaterial({ map: hazard(), roughness: 0.75, metalness: 0.2 }));
  const hzMap = hazard();
  for (const [w, h, x, y] of [[0.14, DOOR.h + 0.2, -(DOOR.w / 2 + 0.25), DOOR.h / 2], [0.14, DOOR.h + 0.2, DOOR.w / 2 + 0.25, DOOR.h / 2]]) {
    const g = own(new THREE.PlaneGeometry(w, h));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 4, uv.getY(i) * h * 4);
    const p = mesh(g, hz, { cast: false });
    p.position.set(x, y, z0 + 0.008);
    root.add(p);
  }
  void hzMap;
  // the slab, hinged on its left edge
  const slab = mesh(own(extrudeUV(roundedRect(DOOR.w - 0.04, DOOR.h - 0.04, DOOR.r - 0.02), 0.16, 0.035, 0.85)), doorPaint);
  // porthole
  const port = new THREE.Group();
  const ring = mesh(own(new THREE.TorusGeometry(0.11, 0.028, 10, 32)), rust);
  const glassMat = own(new THREE.MeshPhysicalMaterial({ color: 0x223028, roughness: 0.15, metalness: 0, transmission: 0, transparent: true, opacity: 0.55, envMapIntensity: 1.2 }));
  const glass = mesh(own(new THREE.CircleGeometry(0.11, 28)), glassMat, { cast: false });
  port.add(ring, glass);
  port.position.set(0, 0.52, 0.2);
  // hand wheel
  const wheel = new THREE.Group();
  wheel.add(mesh(own(new THREE.TorusGeometry(0.24, 0.022, 10, 40)), greenRust));
  for (let i = 0; i < 4; i++) {
    const sp = mesh(own(new THREE.CylinderGeometry(0.014, 0.014, 0.48, 8)), greenRust);
    sp.rotation.z = (i * Math.PI) / 4;
    wheel.add(sp);
  }
  wheel.add(mesh(own(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16)).rotateX(Math.PI / 2), rust));
  wheel.position.set(0, -0.05, 0.26);
  // dogs (locking lugs) and reinforcement ribs
  const lugGeo = own(boxUV(0.16, 0.07, 0.07, 0.3));
  const slabGroup = new THREE.Group();
  slabGroup.add(slab, port, wheel);
  for (const y of [-0.75, 0, 0.75]) {
    const lug = mesh(lugGeo, rust);
    lug.position.set(DOOR.w / 2 - 0.1, y, 0.2);
    slabGroup.add(lug);
    const hinge = mesh(own(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 14)), rust);
    hinge.position.set(-DOOR.w / 2 + 0.02, y, 0.08);
    slabGroup.add(hinge);
  }
  for (const y of [-0.42, 0.18]) {
    const rib = mesh(own(boxUV(DOOR.w - 0.3, 0.06, 0.04, 0.4)), doorPaint);
    rib.position.set(0, y, 0.19);
    slabGroup.add(rib);
  }
  slabGroup.position.set(DOOR.w / 2 - 0.02, 0, -0.08);
  door.add(slabGroup);
  door.position.set(-DOOR.w / 2 + 0.02, DOOR.h / 2, z0 - 0.06);
  root.add(door);
  H.door = { pivot: door, wheel, open: 0, target: 0, rattle: 0 };
  H.anim.push((dt, t) => {
    const D = H.door;
    D.open += (D.target - D.open) * Math.min(1, dt * 0.9);
    D.rattle = Math.max(0, D.rattle - dt * 1.8);
    door.rotation.y = D.open * 1.45 + Math.sin(t * 40) * 0.004 * D.rattle;
    door.position.x = -DOOR.w / 2 + 0.02 + Math.sin(t * 53) * 0.003 * D.rattle;
    wheel.rotation.z += dt * D.spin * 2 || 0;
  });
  H.door.spin = 0;

  /* ---------------- airlock corridor behind the door (seen by CCTV / when open) */
  const corridor = new THREE.Group();
  const cw = 2.4;
  const ch = 2.5;
  const cl = 7;
  const cz = z0 - 0.3 - cl / 2;
  const cf = mesh(own(planeUV(cw, cl, 2)), floorMat, { cast: false });
  cf.rotation.x = -Math.PI / 2;
  cf.position.set(0, 0, cz);
  const cc = mesh(own(planeUV(cw, cl, 2)), concreteDark, { cast: false });
  cc.rotation.x = Math.PI / 2;
  cc.position.set(0, ch, cz);
  corridor.add(cf, cc);
  for (const s of [-1, 1]) {
    const w = mesh(own(planeUV(cl, ch, 2)), concreteDark, { cast: false });
    w.rotation.y = -s * Math.PI / 2;
    w.position.set(s * cw / 2, ch / 2, cz);
    corridor.add(w);
  }
  const back = mesh(own(planeUV(cw, ch, 2)), concreteDark, { cast: false });
  back.position.set(0, ch / 2, z0 - 0.3 - cl);
  corridor.add(back);
  root.add(corridor);
  H.corridor = { z: cz, len: cl, end: z0 - 0.3 - cl };

  /* ---------------- side doors: storage (left wall) and Sector C bulkhead */
  const sideDoor = (z, { w = 0.95, h = 1.95, mat = doorPaint, stripes = false } = {}) => {
    const g = new THREE.Group();
    const fr = mesh(own(boxUV(0.14, h + 0.12, w + 0.2, 0.6)), rust);
    fr.position.set(0, (h + 0.12) / 2, 0);
    const hole = mesh(own(new THREE.PlaneGeometry(w - 0.02, h - 0.02)), own(new THREE.MeshBasicMaterial({ color: 0x010101 })), { cast: false });
    hole.rotation.y = Math.PI / 2;
    hole.position.set(0.072, h / 2, 0);
    const leaf = new THREE.Group();
    const lm = mesh(own(boxUV(0.06, h - 0.04, w - 0.04, 0.7)), mat);
    lm.position.set(0, 0, w / 2 - 0.02);
    leaf.add(lm);
    const handle = mesh(own(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8)), rust);
    handle.position.set(0.06, 0, w - 0.14);
    leaf.add(handle);
    leaf.position.set(0.1, h / 2, -w / 2 + 0.02);
    g.add(fr, hole, leaf);
    if (stripes) {
      const sg = own(new THREE.PlaneGeometry(w - 0.1, 0.16));
      const uv = sg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 4, uv.getY(i) * 0.64);
      for (const y of [-0.55, 0.45]) {
        const st = mesh(sg, hz, { cast: false });
        st.rotation.y = Math.PI / 2;
        st.position.set(0.032, y, w / 2 - 0.02);
        leaf.add(st);
      }
    }
    g.position.set(x0 + 0.02, 0, z);
    root.add(g);
    return { g, leaf, open: 0, target: 0 };
  };
  H.storage = sideDoor(-2.05);
  H.sector = sideDoor(-4.25, { w: 1.1, h: 2.0, mat: greenRust, stripes: true });
  H.anim.push((dt) => {
    for (const D of [H.storage, H.sector]) {
      D.open += (D.target - D.open) * Math.min(1, dt * 1.2);
      D.leaf.rotation.y = -D.open * 1.2;
    }
  });

  /* ---------------- vent grille (right wall) + its optional welded plate */
  const vent = new THREE.Group();
  const vf = mesh(own(boxUV(0.06, 0.46, 0.62, 0.4)), rust);
  vent.add(vf);
  const slatGeo = own(boxUV(0.03, 0.02, 0.54, 0.3));
  for (let i = 0; i < 9; i++) {
    const s = mesh(slatGeo, rust);
    s.position.set(-0.035, -0.18 + i * 0.045, 0);
    s.rotation.z = 0.5;
    vent.add(s);
  }
  const ventDark = mesh(own(new THREE.PlaneGeometry(0.58, 0.42)), own(new THREE.MeshBasicMaterial({ color: 0x000000 })), { cast: false });
  ventDark.rotation.y = -Math.PI / 2;
  ventDark.position.x = 0.01;
  vent.add(ventDark);
  const ventPlate = mesh(own(boxUV(0.025, 0.56, 0.72, 0.4)), plate);
  ventPlate.position.x = -0.05;
  ventPlate.visible = false;
  vent.add(ventPlate);
  vent.position.set(x1 - 0.03, 1.38, 0.95);
  root.add(vent);
  H.vent = { g: vent, plate: ventPlate, shake: 0 };
  H.anim.push((dt, t) => {
    H.vent.shake = Math.max(0, H.vent.shake - dt * 0.6);
    vent.position.y = 1.38 + Math.sin(t * 31) * 0.003 * H.vent.shake;
    vent.rotation.x = Math.sin(t * 23) * 0.012 * H.vent.shake;
  });

  /* ---------------- pipes along the vault springing line */
  const pipeRun = (x, y, r, mat, flanges = true) => {
    const p = mesh(own(new THREE.CylinderGeometry(r, r, L - 0.2, 14, 1)), mat);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, y, zc);
    root.add(p);
    if (!flanges) return;
    const fg = own(new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.05, 16));
    for (let z = z0 + 0.6; z < z1 - 0.3; z += 1.6) {
      const f = mesh(fg, rust);
      f.rotation.x = Math.PI / 2;
      f.position.set(x, y, z);
      root.add(f);
      const br = mesh(own(boxUV(Math.abs(x1 - Math.abs(x)) + 0.02, 0.04, 0.05, 0.3)), rust);
      br.position.set((x + Math.sign(x) * x1) / 2, y, z + 0.12);
      root.add(br);
    }
  };
  pipeRun(2.9, 1.95, 0.075, greenRust);
  pipeRun(2.72, 2.1, 0.05, rust);
  pipeRun(2.98, 1.78, 0.04, coarse, false);
  pipeRun(-2.95, 1.86, 0.05, rust, false);
  // cable tray on the left
  const tray = mesh(own(boxUV(0.3, 0.04, L - 0.4, 0.5)), plate);
  tray.position.set(-2.72, 2.12, zc);
  root.add(tray);
  onProgress?.(0.55);

  /* ---------------- props */
  const props = [];
  const P = (name, o) => props.push(place(name, { parent: root, ...o }));
  // desk + things on it
  const desk = place("metal_office_desk", { parent: root, pos: V(0, 0, 2.55), rotY: Math.PI });
  props.push(desk);
  P("vintage_radio_transceiver", { pos: V(-0.62, 0.79, 2.42), rotY: 0.35 });
  P("desk_lamp_arm_01", { size: 0.62, pos: V(0.78, 0.79, 2.35), rotY: -2.2 });
  P("clipboard", { pos: V(0.42, 0.79, 2.72), rotY: 0.25 });
  P("vintage_flashlight", { pos: V(-0.22, 0.79, 2.3), rotY: 1.2 });
  P("russian_food_cans_01", { size: 0.08, pos: V(-0.95, 0.79, 2.28), rotY: 0.6 });
  P("plastic_bottle_gallon", { pos: V(0.95, 0.79, 2.15), rotY: 0.4 });
  P("crowbar_01", { size: 0.56, axis: "y", pos: V(-0.3, 0.8, 2.08), rot: [Math.PI / 2, 0, 1.4], ground: false });
  P("metal_stool_01", { pos: V(-1.6, 0, 3.0), rotY: 0.4 });
  P("metal_toolbox", { pos: V(-1.6, 0.68, 3.0), rotY: 0.9 });
  // monitors rack to the right of the desk, angled at the chair
  const rack = place("worn_metal_rack", { parent: root, pos: V(1.85, 0, 2.15), rotY: -0.95 });
  props.push(rack);
  const tvs = [place("television_02", { parent: root }), place("television_02", { parent: root })];
  props.push(...tvs);
  // left wall: shelving with supplies
  const shelfA = place("steel_frame_shelves_02", { parent: root, pos: V(x0 + 0.3, 0, 1.0), rotY: Math.PI / 2 });
  const shelfB = place("steel_frame_shelves_02", { parent: root, pos: V(x0 + 0.3, 0, 0.35), rotY: Math.PI / 2 });
  const rackC = place("worn_metal_rack", { parent: root, pos: V(x0 + 0.34, 0, -0.65), rotY: Math.PI / 2 });
  props.push(shelfA, shelfB, rackC);
  P("Barrel_01".toLowerCase(), { pos: V(x0 + 0.45, 0, -5.0) });
  P("barrel_01", { pos: V(x0 + 1.05, 0, -5.15), rotY: 1 });
  P("propane_tank", { pos: V(x1 - 0.35, 0, -0.45) });
  P("portable_generator", { pos: V(x1 - 0.55, 0, -1.35), rotY: -Math.PI / 2 });
  P("old_military_compressor", { size: 1.0, pos: V(x1 - 0.45, 0, -2.75), rotY: 0 });
  P("old_bed_frame", { pos: V(x1 - 0.55, 0, -4.4), rotY: 0 });
  P("power_box_01", { pos: V(x1 - 0.06, 1.25, 1.65), rotY: -Math.PI / 2, ground: false });
  P("korean_fire_extinguisher_01", { pos: V(x1 - 0.22, 0, 1.55), rotY: -Math.PI / 2 });
  P("fire_alarm", { pos: V(0.95, 1.55, z0 + 0.02), ground: false });
  P("old_gas_mask", { pos: V(x0 + 0.06, 1.62, 1.65), rotY: Math.PI / 2, ground: false });
  P("security_camera_01", { pos: V(0.9, 2.42, z0 + 0.25), rotY: Math.PI + 0.35, ground: false });
  P("cement_bag", { pos: V(-1.25, 0, z0 + 0.5), rotY: 0.3 });
  P("cement_bag", { pos: V(-1.2, 0.17, z0 + 0.55), rotY: 0.1 });
  P("ammo_box", { pos: V(1.2, 0, z0 + 0.45), rotY: 1.1 });
  P("plastic_crate_01", { pos: V(1.45, 0, z0 + 0.6), rotY: 0.2 });
  P("cardboard_box_01", { pos: V(x1 - 0.4, 0, 0.35), rotY: 0.2 });
  P("metal_jerrycan", { pos: V(x1 - 0.3, 0, -0.1), rotY: -1.4 });
  P("plastic_jerrycan", { pos: V(x0 + 0.85, 0, 1.75), rotY: 0.7 });
  P("binder_notebook", { pos: V(x1 - 0.55, 0.42, -4.2), rotY: 0.5 });
  const crateA = loadPart("old_military_crate", "old_military_crate_a").then((g) => {
    g.position.set(-1.45, 0, -3.0);
    g.rotation.y = 0.15;
    root.add(g);
    return g;
  });
  const lidA = loadPart("old_military_crate", "old_military_crate_lid_a").then((g) => {
    g.position.set(-1.45, 0.24, -3.0);
    g.rotation.y = 0.15;
    root.add(g);
    return g;
  });
  props.push(crateA, lidA);
  // manhole hatch in the floor
  // floor hatch (modelled: lathed steel lid with a rim, dogs and a lifting ring)
  const hatch = Promise.resolve().then(() => {
    const g = new THREE.Group();
    const rim = mesh(own(new THREE.TorusGeometry(0.47, 0.035, 10, 40)), rust);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.012;
    const pit = mesh(own(new THREE.CircleGeometry(0.46, 40)), own(new THREE.MeshBasicMaterial({ color: 0x000000 })), { cast: false });
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 0.002;
    root.add(rim, pit);
    rim.position.set(0, 0.012, -2.4);
    pit.position.set(0, 0.003, -2.4);
    const lid = mesh(own(new THREE.LatheGeometry([V(0, 0.05), V(0.3, 0.048), V(0.42, 0.04), V(0.445, 0.02), V(0.445, 0.0)], 40)), plate);
    g.add(lid);
    const ringH = mesh(own(new THREE.TorusGeometry(0.06, 0.012, 8, 20)), rust);
    ringH.rotation.x = Math.PI / 2;
    ringH.position.set(0.18, 0.055, 0);
    g.add(ringH);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = mesh(own(boxUV(0.07, 0.03, 0.04, 0.2)), rust);
      d.position.set(Math.cos(a) * 0.38, 0.05, Math.sin(a) * 0.38);
      d.rotation.y = -a;
      g.add(d);
    }
    g.position.set(0, 0, -2.4);
    root.add(g);
    return g;
  });
  props.push(hatch);
  // ductwork along the upper left vault
  for (let i = 0; i < 5; i++) {
    props.push(
      loadPart("modular_airduct_rectangular_01", "tripple_01").then((g) => {
        g.position.set(-1.85, 2.72, z0 + 1.1 + i * 1.8);
        g.rotation.y = 0;
        root.add(g);
      }),
    );
  }
  props.push(
    loadPart("modular_airduct_rectangular_01", "vent_01").then((g) => {
      g.rotation.x = Math.PI / 2;
      g.position.set(-1.85, 2.45, -0.4);
      root.add(g);
    }),
  );
  // vertical pipe drops on the right wall
  for (const z of [-3.6, 0.0]) {
    props.push(
      loadPart("modular_industrial_pipes_01", "pipe02").then((g) => {
        g.position.set(x1 - 0.12, 0, z);
        root.add(g);
      }),
    );
  }
  // lights hardware
  const tubeZ = [1.6, -1.2, -3.9];
  // fixtures: a pressed-steel housing holding two scanned tubes
  const housingGeo = own(boxUV(1.12, 0.05, 0.26, 0.5));
  const tubes = tubeZ.map(async (z) => {
    const fx = new THREE.Group();
    const hs = mesh(housingGeo, plate);
    fx.add(hs);
    for (const dz of [-0.06, 0.06]) {
      const t = await loadPart("mounted_fluorescent_lights", "mounted_fluorescent_lights_a");
      t.position.set(0, -0.05, dz);
      t.scale.setScalar(1.15);
      fx.add(t);
    }
    fx.position.set(0, vaultY(0) - 0.035, z);
    root.add(fx);
    return fx;
  });
  props.push(...tubes);
  props.push(place("caged_hanging_light", { parent: root, pos: V(0, vaultY(0) - 0.02, z0 + 1.0), size: 0.9, axis: "x", ground: false }));
  const beacon = place("security_light", { parent: root, pos: V(0, 2.6, z0 + 0.04), ground: false });
  props.push(beacon);
  props.push(place("industrial_wall_lamp", { parent: root, pos: V(x0 + 0.05, 1.5, -3.25), rotY: Math.PI / 2, ground: false }));
  const rat = place("street_rat", { parent: root, pos: V(x1 - 0.5, 0, 1.0), size: 0.26, axis: "z" });
  props.push(rat);

  let done = 0;
  props.forEach((p) => p.then(() => onProgress?.(0.55 + (0.3 * ++done) / props.length)));
  const [deskO, rackO, tv1, tv2, sA, sB, rC, hatchO, ratO, beaconO, ...rest] = await Promise.all([desk, rack, tvs[0], tvs[1], shelfA, shelfB, rackC, hatch, rat, beacon, ...props]);
  void rest;
  void deskO;
  const tubeOs = await Promise.all(tubes);

  // monitors on the rack's shelves, screens toward the chair
  const lv = shelfLevels(rackO);
  // the two shelves nearest seated eye level
  const nearest = (h, skip) => lv.filter((y) => y !== skip).sort((p, q) => Math.abs(p - h) - Math.abs(q - h))[0];
  const topY = nearest(1.25) ?? 1.25;
  const midY = nearest(0.7, topY) ?? 0.7;
  rackO.updateMatrixWorld(true);
  const rackDir = V(Math.sin(rackO.rotation.y), 0, Math.cos(rackO.rotation.y));
  tv1.position.copy(rackO.position).add(V(0, topY, 0)).addScaledVector(rackDir, 0.02);
  tv2.position.copy(rackO.position).add(V(0, midY, 0)).addScaledVector(rackDir, 0.02);
  tv1.rotation.y = tv2.rotation.y = rackO.rotation.y;
  H.screens = [];
  for (const tv of [tv1, tv2]) {
    // measure the set in its own frame: the screen is on its front (+Z) face
    const keepP = tv.position.clone();
    const keepR = tv.rotation.y;
    tv.position.set(0, 0, 0);
    tv.rotation.y = 0;
    tv.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(tv);
    tv.position.copy(keepP);
    tv.rotation.y = keepR;
    const size = bb.getSize(V());
    const scr = mesh(own(new THREE.PlaneGeometry(size.x * 0.66, size.y * 0.5)), null, { cast: false, receive: false });
    scr.position.set(-size.x * 0.06, bb.min.y + size.y * 0.6, bb.max.z + 0.003);
    tv.add(scr);
    H.screens.push({ mesh: scr, tv });
  }

  // supplies on the shelves (rows of real props on detected shelf levels)
  const fill = async (shelf, items) => {
    const levels = shelfLevels(shelf);
    const out = [];
    for (const [lvl, name, dz, extra = {}] of items) {
      const y = levels[Math.min(levels.length - 1, lvl)] ?? 0.4 * lvl;
      out.push(place(name, { parent: root, pos: V(shelf.position.x + (extra.dx || 0), y, shelf.position.z + dz), rotY: extra.rotY ?? Math.PI / 2, size: extra.size ?? null, axis: extra.axis }));
    }
    return Promise.all(out);
  };
  await Promise.all([
    fill(sA, [[1, "long_life_food", 0, { size: 0.42, axis: "x" }], [2, "medical_box", 0, { size: 0.42, axis: "x" }], [3, "plastic_bottle_gallon", -0.12], [3, "plastic_bottle_gallon", 0.12], [0, "plastic_jerrycan", 0], [4, "can_rusted", -0.1], [4, "can_rusted", 0.08]]),
    fill(sB, [[0, "cardboard_box_01", 0, { size: 0.4, axis: "z" }], [1, "russian_food_cans_01", 0, { size: 0.32, axis: "x" }], [2, "pastic_torch_6v", 0.1], [2, "ammo_box", -0.1], [3, "long_life_food", 0, { size: 0.42, axis: "x" }], [4, "metal_jerrycan", 0, { size: 0.3 }]]),
    fill(rC, [[0, "plastic_crate_01", -0.2], [0, "plastic_crate_01", 0.2], [1, "cardboard_box_01", 0, { size: 0.38, axis: "z" }], [2, "metal_toolbox", 0], [3, "plastic_bottle_gallon", 0.15], [3, "pipe_wrench", -0.15, { rotY: 0.4 }]]),
  ]);
  onProgress?.(0.9);

  // fluorescent tubes: find the tube meshes to drive their glow
  for (const t of tubeOs) {
    t.traverse((o) => {
      if (o.isMesh && o.material !== plate) {
        o.material = o.material.clone();
        own(o.material);
        o.material.emissive = new THREE.Color(0xdfe8ff);
        o.material.emissiveIntensity = 0;
        o.castShadow = false;
        H.tubes.push(o.material);
      }
    });
  }
  // beacon glass glows red
  H.beaconMats = [];
  beaconO.traverse((o) => {
    if (o.isMesh && /glass/.test(o.name)) {
      o.material = own(o.material.clone());
      o.material.emissive = new THREE.Color(0xff2a10);
      o.material.emissiveIntensity = 0.3;
      H.beaconMats.push(o.material);
    }
  });

  H.hatch = { obj: hatchO, lift: 0, target: 0, base: hatchO.position.clone() };
  H.anim.push((dt) => {
    const h = H.hatch;
    h.lift += (h.target - h.lift) * Math.min(1, dt * 2.5);
    h.obj.position.set(h.base.x + h.lift * 0.35, h.base.y + h.lift * 0.08, h.base.z + h.lift * 0.15);
    h.obj.rotation.z = h.lift * 0.9;
  });
  H.rat = { obj: ratO, t: -1 };
  ratO.visible = false;
  H.M = M;
  H.hazard = hz;
  return H;
}

export function disposeBunker(H) {
  if (!H) return;
  H.root.removeFromParent();
  for (const g of H.geos) g.dispose();
  for (const m of H.mats) m.dispose();
}
