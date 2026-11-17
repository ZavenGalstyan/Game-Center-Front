/**
 * The poker table and everything on it.
 *
 *  - Table: velvet felt (Poly Haven velour_velvet, tinted per saloon) with a
 *    printed betting line and medallion, cherry racetrack, padded leather rail
 *    (Poly Haven brown_leather), wooden apron and turned pedestal.
 *  - Cards: rounded-corner card stock meshes (front/back), dealt with arcs from
 *    the button, flipped, peeked, mucked, raised + lit for the winning hand.
 *  - Chips: seven original denominations rendered as InstancedMeshes (one draw
 *    call per denomination). Piles (stacks, bets, pot) lay chips out in
 *    columns; transfers fly chips along arcs and land before the totals change.
 *  - Dealer button.
 *
 * Seat geometry (anchors) lives here too, so characters and the HUD agree on
 * where everything is.
 */
import * as THREE from "three";
import { pbr, track } from "./assets.js";
import { CARD_W, CARD_H, faceTexture, backTexture } from "./cardFaces.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export const TABLE_Y = 0.76;
export const FELT_R = 0.8;
export const CARD_SCALE = 1.22;
const CW = CARD_W * CARD_SCALE;
const CH = CARD_H * CARD_SCALE;

/* ------------------------------------------------------------ seats */
/** Unit direction (x,z) from the table centre to each seat; seat 0 = the human (+Z). Clockwise from above. */
export function seatDirs(n) {
  const deg = n === 2 ? [0, 180] : n === 3 ? [0, 145, 215] : [0, 115, 180, 245];
  return deg.map((d) => {
    const a = (d * Math.PI) / 180;
    return V(-Math.sin(a), 0, Math.cos(a));
  });
}

/** World anchors for seat i. */
export function seatAnchors(dir) {
  const side = V(dir.z, 0, -dir.x); // the seat's right hand, looking at the table centre
  const at = (r, lat = 0, y = TABLE_Y) => dir.clone().multiplyScalar(r).add(side.clone().multiplyScalar(lat)).setY(y);
  return {
    dir,
    side,
    chair: dir.clone().multiplyScalar(1.2),
    face: Math.atan2(-dir.x, -dir.z),
    // side = the seat's right hand (looking at the centre)
    cards: at(0.7, -0.02),
    stack: at(0.72, 0.25),
    bet: at(0.48, 0.08),
    button: at(0.66, -0.24),
    muck: at(0.2, -0.12),
    rest: { l: at(0.86, -0.19, TABLE_Y + 0.045), r: at(0.86, 0.19, TABLE_Y + 0.045) },
    plate: at(0.97, 0, TABLE_Y + 0.07),
  };
}
export const POT_POS = V(0, TABLE_Y, -0.13);
export const BOARD_POS = V(0, TABLE_Y, 0.07);

/* ------------------------------------------------------------ table */
function feltDecal(colorHex) {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d");
  const col = new THREE.Color(colorHex);
  const light = `rgba(${Math.round(255 * Math.min(1, col.r * 1.8 + 0.25))},${Math.round(255 * Math.min(1, col.g * 1.8 + 0.22))},${Math.round(255 * Math.min(1, col.b * 1.6 + 0.15))},`;
  g.clearRect(0, 0, 1024, 1024);
  g.strokeStyle = `${light}0.5)`;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(512, 512, 395, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(512, 512, 382, 0, Math.PI * 2);
  g.stroke();
  // medallion: horseshoe + star (faint print on the felt)
  g.globalAlpha = 0.22;
  g.lineWidth = 16;
  g.lineCap = "round";
  g.beginPath();
  g.arc(512, 512, 64, Math.PI * 0.72, Math.PI * 2.28);
  g.stroke();
  g.fillStyle = `${light}1)`;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 14 : 34;
    g.lineTo(512 + Math.cos(a) * r, 512 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildTable({ felt = 0x1f5a34, fancy = false } = {}) {
  const root = new THREE.Group();
  root.name = "pokerTable";
  // velvet relief + roughness from the Poly Haven set, colour from the saloon (the set's albedo is red)
  const feltMat = pbr("velour_velvet", { repeat: [7, 7], color: new THREE.Color(felt).multiplyScalar(1.15), roughness: 1, normalScale: 0.5, envMapIntensity: 0.2 });
  feltMat.map = null;
  feltMat.sheen = 0;
  const top = new THREE.Mesh(track(new THREE.CircleGeometry(FELT_R + 0.01, 96)), feltMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = TABLE_Y;
  top.receiveShadow = true;
  root.add(top);
  const decal = new THREE.Mesh(
    track(new THREE.CircleGeometry(FELT_R, 64)),
    track(new THREE.MeshStandardMaterial({ map: feltDecal(felt), transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = TABLE_Y + 0.0005;
  decal.receiveShadow = true;
  root.add(decal);

  const woodSet = fancy ? "lacquered_cherry_wood" : "wood_table_worn";
  const wood = pbr(woodSet, { repeat: [10, 1], roughness: fancy ? 0.6 : 1, envMapIntensity: 0.8 });
  const woodV = pbr(woodSet, { repeat: [3, 2], roughness: fancy ? 0.6 : 1, envMapIntensity: 0.8 });
  const leather = pbr("brown_leather", { repeat: [26, 1.2], roughness: 0.9, envMapIntensity: 0.7, color: fancy ? 0x7a3a2a : 0xffffff });
  const lathe = (pts, mat, seg = 96) => {
    const g = track(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  // racetrack (wood) between felt and rail
  lathe([[FELT_R + 0.005, TABLE_Y - 0.002], [FELT_R + 0.006, TABLE_Y + 0.004], [FELT_R + 0.06, TABLE_Y + 0.006], [FELT_R + 0.062, TABLE_Y + 0.01]], wood);
  // padded leather rail
  const rail = [];
  const r0 = FELT_R + 0.062, r1 = FELT_R + 0.19;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    rail.push([r0 + (r1 - r0) * t, TABLE_Y + 0.008 + 0.036 * Math.pow(Math.sin(Math.PI * t), 0.6)]);
  }
  lathe([...rail, [r1 + 0.002, TABLE_Y - 0.005]], leather);
  // wooden edge + apron
  lathe([[r1, TABLE_Y - 0.006], [r1 + 0.02, TABLE_Y - 0.004], [r1 + 0.025, TABLE_Y - 0.03], [r1 + 0.018, TABLE_Y - 0.05], [r1 - 0.02, TABLE_Y - 0.13], [r1 - 0.05, TABLE_Y - 0.15]], wood);
  // pedestal
  lathe([[0.32, TABLE_Y - 0.15], [0.12, TABLE_Y - 0.17], [0.09, TABLE_Y - 0.22], [0.085, 0.42], [0.12, 0.38], [0.1, 0.32], [0.08, 0.2], [0.15, 0.1], [0.2, 0.05], [0.2, 0.0]], woodV, 32);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const foot = new THREE.Mesh(track(new THREE.BoxGeometry(0.46, 0.06, 0.09)), woodV);
    foot.position.set(Math.cos(a) * 0.32, 0.05, Math.sin(a) * 0.32);
    foot.rotation.y = -a;
    foot.castShadow = foot.receiveShadow = true;
    root.add(foot);
  }
  return { root, feltMat };
}

/* ------------------------------------------------------------ cards */
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function cardGeometry() {
  const shape = roundedRect(CW, CH, 0.0042 * CARD_SCALE);
  const face = new THREE.ShapeGeometry(shape, 6);
  const uv = face.attributes.uv, p = face.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / CW + 0.5, p.getY(i) / CH + 0.5);
  face.rotateX(-Math.PI / 2); // lie flat, face +Y; card "top" toward -Z
  face.translate(0, 0.0002, 0);
  const back = face.clone();
  back.rotateZ(Math.PI); // face -Y
  // mirror back uv so the pattern isn't flipped (symmetrical anyway)
  const edge = new THREE.ExtrudeGeometry(shape, { depth: 0.0004, bevelEnabled: false, curveSegments: 6 });
  edge.rotateX(-Math.PI / 2);
  edge.translate(0, -0.0002, 0);
  return { face: track(face), back: track(back), edge: track(edge) };
}

export class Cards {
  constructor(scene, { shadows = true } = {}) {
    this.scene = scene;
    this.geo = cardGeometry();
    this.backMat = track(new THREE.MeshStandardMaterial({ map: backTexture(), color: 0xdcd6ca, roughness: 0.45, metalness: 0, envMapIntensity: 0.4 }));
    this.edgeMat = track(new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.7 }));
    this.faceMats = new Map();
    this.pool = [];
    this.active = new Map(); // key → card object
    this.shadows = shadows;
    this.glow = track(new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const gg = new THREE.PlaneGeometry(CW * 1.18, CH * 1.12);
    gg.rotateX(-Math.PI / 2);
    this.glowGeo = track(gg);
  }
  faceMat(card) {
    let m = this.faceMats.get(card);
    if (!m) {
      m = track(new THREE.MeshStandardMaterial({ map: faceTexture(card), color: 0xd9d3c6, roughness: 0.45, metalness: 0, envMapIntensity: 0.4 }));
      this.faceMats.set(card, m);
    }
    return m;
  }
  make() {
    const g = new THREE.Group();
    const face = new THREE.Mesh(this.geo.face, this.backMat);
    const back = new THREE.Mesh(this.geo.back, this.backMat);
    const edge = new THREE.Mesh(this.geo.edge, this.edgeMat);
    const glow = new THREE.Mesh(this.glowGeo, this.glow.clone());
    glow.position.y = -0.0006;
    glow.renderOrder = 2;
    for (const m of [face, back, edge]) {
      m.castShadow = this.shadows;
      m.receiveShadow = true;
    }
    g.add(face, back, edge, glow);
    this.scene.add(g);
    return { g, face, back, edge, glowMesh: glow, card: -1, anim: null, glowT: 0, glowV: 0, lift: 0, liftT: 0 };
  }
  /** Show `key` (e.g. "h1.0", "b2") with `card` (or -1 = unknown face). */
  get(key) {
    let c = this.active.get(key);
    if (!c) {
      c = this.pool.pop() || this.make();
      c.g.visible = true;
      this.active.set(key, c);
    }
    return c;
  }
  setFace(c, card) {
    if (c.card === card) return;
    c.card = card;
    c.face.material = card >= 0 ? this.faceMat(card) : this.backMat;
  }
  /** Place instantly. pose = { pos, yaw, up (true = face up), tilt } */
  place(key, card, pose) {
    const c = this.get(key);
    this.setFace(c, card);
    c.anim = null;
    this.apply(c, pose);
    c.pose = pose;
    return c;
  }
  apply(c, pose, extraY = 0) {
    c.g.position.copy(pose.pos).add(V(0, 0.0008 + (pose.z || 0) * 0.0005 + extraY, 0));
    c.g.rotation.set(0, 0, 0);
    c.g.rotateY(pose.yaw || 0);
    if (pose.tilt) c.g.rotateX(pose.tilt);
    if (!pose.up) c.g.rotateZ(Math.PI);
  }
  /** Animate to a pose: arc + optional flip. Resolves when landed. */
  move(key, card, pose, { from = null, dur = 0.45, delay = 0, arc = 0.08, spin = 0 } = {}) {
    const c = this.get(key);
    this.setFace(c, card);
    const start = from || c.pose || pose;
    return new Promise((res) => {
      c.anim = { from: { ...start, pos: start.pos.clone() }, to: { ...pose, pos: pose.pos.clone() }, t: -delay, dur, arc, spin, res };
      c.pose = pose;
      if (from) this.apply(c, start);
    });
  }
  flip(key, up = true, { dur = 0.4, delay = 0 } = {}) {
    const c = this.active.get(key);
    if (!c) return Promise.resolve();
    return this.move(key, c.card, { ...c.pose, up }, { dur, delay, arc: 0.06 });
  }
  /** Peek: lift the near corner of a face-down card. */
  peek(key, hold = 1.0) {
    const c = this.active.get(key);
    if (!c) return;
    c.liftT = 1;
    setTimeout(() => (c.liftT = 0), hold * 1000);
  }
  highlight(key, on) {
    const c = this.active.get(key);
    if (c) c.glowT = on ? 1 : 0;
  }
  release(key) {
    const c = this.active.get(key);
    if (!c) return;
    c.g.visible = false;
    c.anim?.res?.();
    c.anim = null;
    c.glowT = c.glowV = 0;
    c.card = -2;
    c.pose = null;
    this.active.delete(key);
    this.pool.push(c);
  }
  clear() {
    for (const k of [...this.active.keys()]) this.release(k);
  }
  update(dt) {
    for (const c of this.active.values()) {
      if (c.anim) {
        const A = c.anim;
        A.t += dt;
        if (A.t >= 0) {
          const k = Math.min(1, A.t / A.dur);
          const e = ease(k);
          const p = A.from.pos.clone().lerp(A.to.pos, e);
          p.y += Math.sin(Math.PI * k) * A.arc;
          // orientation: slerp between the two quaternions (flip happens through this)
          const qa = this.poseQuat(A.from), qb = this.poseQuat(A.to);
          if (A.from.up !== A.to.up) {
            // turn over around the long axis, via an upright mid pose
            const mid = qa.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2 * (A.from.up ? 1 : -1)));
            const q = k < 0.5 ? qa.clone().slerp(mid, ease(k * 2)) : mid.clone().slerp(qb, ease((k - 0.5) * 2));
            c.g.quaternion.copy(q);
          } else c.g.quaternion.copy(qa.slerp(qb, e));
          if (A.spin) c.g.rotateY(A.spin * (1 - e));
          c.g.position.copy(p).add(V(0, 0.0008 + (A.to.z || 0) * 0.0005, 0));
          if (k >= 1) {
            c.anim = null;
            this.apply(c, A.to);
            A.res();
          }
        }
      } else if (c.pose && (c.lift > 0.001 || c.liftT > 0)) {
        c.lift += (c.liftT - c.lift) * Math.min(1, dt * 7);
        this.apply(c, { ...c.pose, tilt: (c.pose.tilt || 0) - c.lift * 0.45 }, c.lift * 0.012);
      }
      c.glowV += (c.glowT - c.glowV) * Math.min(1, dt * 5);
      c.glowMesh.material.opacity = c.glowV * 0.55;
      c.glowMesh.visible = c.glowV > 0.01;
    }
  }
  poseQuat(pose) {
    const o = new THREE.Object3D();
    o.rotateY(pose.yaw || 0);
    if (pose.tilt) o.rotateX(pose.tilt);
    if (!pose.up) o.rotateZ(Math.PI);
    return o.quaternion.clone();
  }
  dispose() {
    this.clear();
    for (const c of this.pool) c.g.removeFromParent();
    this.pool = [];
    for (const m of this.faceMats.values()) m.dispose();
    this.faceMats.clear();
  }
}

/* ------------------------------------------------------------ chips */
export const DENOMS = [
  { v: 5000, base: "#c2601e", spot: "#f4ead2", ink: "#3a1a08", label: "5K" },
  { v: 1000, base: "#d9b23a", spot: "#2a2a2a", ink: "#2a1a06", label: "1K" },
  { v: 500, base: "#5a2f78", spot: "#f0e6d8", ink: "#f0e6d8", label: "500" },
  { v: 100, base: "#1c1c1e", spot: "#e8dcc0", ink: "#e8dcc0", label: "100" },
  { v: 25, base: "#1f6a3c", spot: "#f2eadb", ink: "#f2eadb", label: "25" },
  { v: 5, base: "#a8231f", spot: "#f2eadb", ink: "#f2eadb", label: "5" },
  { v: 1, base: "#e9e3d6", spot: "#2c4a8a", ink: "#2c4a8a", label: "1" },
];
const CHIP_R = 0.0195 * 1.18;
const CHIP_H = 0.0034 * 1.18;

function chipFaceTexture(d) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = d.base;
  g.beginPath();
  g.arc(128, 128, 128, 0, Math.PI * 2);
  g.fill();
  // edge spots
  g.fillStyle = d.spot;
  for (let i = 0; i < 8; i++) {
    g.save();
    g.translate(128, 128);
    g.rotate((i * Math.PI) / 4);
    g.fillRect(-14, -128, 28, 30);
    g.restore();
  }
  // inlay ring
  g.strokeStyle = d.spot;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(128, 128, 82, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.06)";
  g.beginPath();
  g.arc(128, 128, 78, 0, Math.PI * 2);
  g.fill();
  // stars on the ring
  g.fillStyle = d.spot;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    g.beginPath();
    g.arc(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98, 4, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = d.ink;
  g.font = `700 ${d.label.length > 2 ? 54 : 64}px Georgia, "Times New Roman", serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(d.label, 128, 132);
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function chipSideTexture(d) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 16;
  const g = c.getContext("2d");
  g.fillStyle = d.base;
  g.fillRect(0, 0, 256, 16);
  g.fillStyle = d.spot;
  for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 9, 0, 14, 16);
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Visual breakdown of an amount: few enough chips to read, enough to look like a stack. */
export function breakdown(amount, maxChips = 40) {
  const out = [];
  if (amount <= 0) return out;
  const asc = DENOMS.slice().reverse();
  let topIdx = 0;
  for (let i = 0; i < asc.length; i++) if (amount >= asc[i].v * 7) topIdx = i;
  let a = amount;
  for (let i = topIdx; i >= 0; i--) {
    const d = asc[i];
    const n = Math.floor(a / d.v);
    for (let k = 0; k < n; k++) out.push(asc.length - 1 - i);
    a -= n * d.v;
  }
  if (out.length > maxChips) {
    // too many: re-run with a higher top denomination
    let b = amount;
    const res = [];
    for (let i = 0; i < DENOMS.length; i++) {
      const n = Math.floor(b / DENOMS[i].v);
      for (let k = 0; k < n; k++) res.push(i);
      b -= n * DENOMS[i].v;
    }
    return res;
  }
  return out; // indices into DENOMS
}

export class Chips {
  constructor(scene, { shadows = true, capacity = 900 } = {}) {
    this.meshes = DENOMS.map((d) => {
      const geo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 32, 1, false);
      track(geo);
      const side = track(new THREE.MeshStandardMaterial({ map: chipSideTexture(d), roughness: 0.42, metalness: 0, envMapIntensity: 0.6 }));
      const face = track(new THREE.MeshStandardMaterial({ map: chipFaceTexture(d), roughness: 0.38, metalness: 0, envMapIntensity: 0.6 }));
      const m = new THREE.InstancedMesh(geo, [side, face, face], capacity);
      m.count = 0;
      m.castShadow = shadows;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    });
    this.piles = new Map();
    this.flights = [];
    this.dirty = true;
    this.tmp = new THREE.Object3D();
  }
  /** A pile at `pos`; `face` = yaw so columns line up across the seat; kind = stack | bet | pot. */
  pile(key, pos, { yaw = 0, kind = "stack" } = {}) {
    let p = this.piles.get(key);
    if (!p) {
      p = { key, pos: pos.clone(), yaw, kind, amount: 0, chips: [] };
      this.piles.set(key, p);
    } else {
      p.pos.copy(pos);
      p.yaw = yaw;
    }
    return p;
  }
  set(key, amount) {
    const p = this.piles.get(key);
    if (!p || p.amount === amount) return;
    p.amount = Math.max(0, Math.round(amount));
    this.layout(p);
    this.dirty = true;
  }
  layout(p) {
    const idx = breakdown(p.amount, p.kind === "pot" ? 60 : 40);
    // group by denomination into columns of up to 20
    const cols = [];
    let cur = null;
    for (const d of idx) {
      if (!cur || cur.d !== d || cur.n >= (p.kind === "bet" ? 12 : 20)) {
        cur = { d, n: 0 };
        cols.push(cur);
      }
      cur.n++;
    }
    const gap = CHIP_R * 2.08;
    const per = p.kind === "pot" ? 4 : p.kind === "bet" ? 3 : 4;
    const rows = Math.ceil(cols.length / per);
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    p.chips = [];
    let seed = p.key.length * 13.7 + p.amount * 0.013;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    cols.forEach((c, i) => {
      const row = Math.floor(i / per), col = i % per;
      const inRow = Math.min(per, cols.length - row * per);
      const lx = (col - (inRow - 1) / 2) * gap + (row % 2 ? gap * 0.5 : 0) * (p.kind === "pot" ? 1 : 0);
      const lz = (row - (rows - 1) / 2) * gap * 0.95;
      const x = p.pos.x + lx * cos + lz * sin, z = p.pos.z - lx * sin + lz * cos;
      for (let k = 0; k < c.n; k++) {
        p.chips.push({ d: c.d, x: x + (rnd() - 0.5) * 0.0018, y: p.pos.y + CHIP_H * (k + 0.5) + 0.0004, z: z + (rnd() - 0.5) * 0.0018, r: rnd() * 6.28 });
      }
    });
  }
  /** Animate `amount` from pile a to pile b; totals change when the chips land. */
  transfer(from, to, amount, { delay = 0, dur = 0.5 } = {}) {
    const A = this.piles.get(from), B = this.piles.get(to);
    if (!A || !B || amount <= 0) return Promise.resolve();
    return new Promise((res) => {
      const start = () => {
        this.set(from, A.amount - amount);
        const vis = breakdown(amount, 14).slice(0, 14);
        const chips = vis.map((d, i) => {
          const sx = A.pos.x + (Math.random() - 0.5) * 0.04, sz = A.pos.z + (Math.random() - 0.5) * 0.04;
          return { d, from: V(sx, A.pos.y + CHIP_H * (i * 0.3 + 1), sz), to: V(B.pos.x + (Math.random() - 0.5) * 0.03, B.pos.y + CHIP_H * (i + 1), B.pos.z + (Math.random() - 0.5) * 0.03), r: Math.random() * 6.28, t: -i * 0.025 };
        });
        this.flights.push({ chips, dur, res: () => {
          this.set(to, B.amount + amount);
          res();
        } });
      };
      if (delay > 0) setTimeout(start, delay * 1000);
      else start();
    });
  }
  update(dt) {
    let busy = this.flights.length > 0;
    for (const f of this.flights) {
      let done = true;
      for (const c of f.chips) {
        c.t += dt;
        if (c.t < f.dur) done = false;
      }
      if (done) {
        f.done = true;
        f.res();
      }
    }
    this.flights = this.flights.filter((f) => !f.done);
    if (!this.dirty && !busy) return;
    this.dirty = false;
    const counts = new Array(DENOMS.length).fill(0);
    const T = this.tmp;
    const put = (d, x, y, z, r, tilt = 0) => {
      const m = this.meshes[d];
      if (counts[d] >= m.instanceMatrix.count) return;
      T.position.set(x, y, z);
      T.rotation.set(tilt, r, 0);
      T.updateMatrix();
      m.setMatrixAt(counts[d]++, T.matrix);
    };
    for (const p of this.piles.values()) for (const c of p.chips) put(c.d, c.x, c.y, c.z, c.r);
    for (const f of this.flights)
      for (const c of f.chips) {
        const k = Math.max(0, Math.min(1, c.t / f.dur));
        const e = easeOut(k);
        const x = c.from.x + (c.to.x - c.from.x) * e, z = c.from.z + (c.to.z - c.from.z) * e;
        const y = c.from.y + (c.to.y - c.from.y) * e + Math.sin(Math.PI * k) * 0.06;
        put(c.d, x, y, z, c.r + k * 3, Math.sin(Math.PI * k) * 0.6);
      }
    this.meshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
    });
  }
  busy() {
    return this.flights.length > 0;
  }
  dispose() {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.dispose();
    }
  }
}

/* ------------------------------------------------------------ dealer button */
export function dealerButton(label = "DEALER") {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(110, 100, 10, 128, 128, 128);
  grd.addColorStop(0, "#fffdf6");
  grd.addColorStop(1, "#e2dccb");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(128, 128, 128, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#1c1a18";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(128, 128, 112, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#1c1a18";
  g.font = "700 120px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("D", 128, 120);
  g.font = "700 28px Georgia, serif";
  g.fillText(label, 128, 196);
  const t = track(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const geo = track(new THREE.CylinderGeometry(0.032, 0.032, 0.009, 40));
  const side = track(new THREE.MeshStandardMaterial({ color: 0xe6e0d0, roughness: 0.35 }));
  const top = track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }));
  const m = new THREE.Mesh(geo, [side, top, side]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export { CW as CARD_WIDTH, CH as CARD_HEIGHT, CHIP_H };
