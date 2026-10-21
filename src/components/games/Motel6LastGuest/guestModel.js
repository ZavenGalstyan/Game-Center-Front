/**
 * Motel 6: Last Guest — procedural, rigged 3D guests.
 *
 * Built from the same face spec as the ID photo (skin, hair colour + style,
 * eyes, beard, glasses, marks, face shape, age) plus body/outfit hints. The
 * head is a sculpted sphere (jaw taper, flat face, fuller skull) with real
 * geometry for eyes (iris, pupil, blinking lids), brows, nose, lips, ears,
 * hair, beard and glasses. The body has hips/knees/shoulders/elbows so guests
 * walk with bent knees and rest their hands on the counter (2-bone IK).
 *
 * Behaviour moods: calm (blinks, glances around, shifts weight), nervous
 * (fidgets, darting looks, fast blinks) and still (never blinks, stares).
 * Variants for the CCTV body: twisted (face on the back of the head, long
 * neck) and other (featureless).
 */
import * as THREE from "three";
import { SKIN, HAIR } from "./guests.js";

const EYE = { brown: 0x4a2c18, blue: 0x3a6fa8, green: 0x3f7a4a, gray: 0x6d7a80, black: 0x050505, white: 0xe8e8e2 };
const PANTS = [0x23252b, 0x2f3440, 0x3b3328, 0x1c1c1f, 0x4a4538, 0x2b3a4a, 0x3a3f36];
const SHIRTS = [0xd9d4c8, 0x8fa3b8, 0xb8a07a, 0xe8e2d6, 0x6a7a5a, 0xa85a4a, 0xcfc6b0, 0x5a6a7a];
const SHOES = [0x1a1412, 0x2a1d14, 0x111111, 0x3a2a1a];
const TIES = [0x6a1a1a, 0x1a2a4a, 0x2a2a2a, 0x4a3a1a];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const col = (c) => new THREE.Color(c);
function mix(a, b, t) {
  return col(a).lerp(col(b), t);
}
function std(color, rough = 0.78, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
}

/* ------------------------------------------------------------------ head sculpt */
// Head half-extents (m). Face looks down +Z.
function headDims(f) {
  switch (f.shape) {
    case "round": return { x: 0.099, y: 0.12, z: 0.108, jaw: 0.2 };
    case "long": return { x: 0.089, y: 0.132, z: 0.106, jaw: 0.3 };
    case "square": return { x: 0.096, y: 0.124, z: 0.106, jaw: 0.14 };
    default: return { x: 0.094, y: 0.125, z: 0.107, jaw: 0.27 };
  }
}
/** Deform a unit sphere into a skull + jaw. `grow` inflates it (hair, beard). */
function sculpt(geo, d, grow = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) {
      const k = Math.pow(Math.max(0, -y), 1.4);
      x *= 1 - d.jaw * k;
      z *= z < 0 ? 1 - 0.28 * k : 1 - 0.04 * k;
    }
    if (z > 0) z *= 0.9; // flatter face
    if (y > 0.25 && z < 0) z *= 1.07; // fuller back of the skull
    p.setXYZ(i, x * d.x * grow, y * d.y * grow, z * d.z * grow);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ skin texture */
// Sphere UVs: u = 0.25 is the face (+Z); canvas 256×128 → face centre x = 64.
function skinTexture(f, variant) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  const skin = SKIN[f.skin] || SKIN[1];
  g.fillStyle = variant === "blank" ? "#e6e2da" : skin;
  g.fillRect(0, 0, 256, 128);
  if (variant !== "blank") {
    const fx = 64;
    const radial = (x, y, r, color) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, color);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // cheeks, eye sockets, jaw shadow, forehead sheen
    radial(fx - 22, 72, 16, "rgba(190,80,70,0.16)");
    radial(fx + 22, 72, 16, "rgba(190,80,70,0.16)");
    radial(fx - 14, 59, 9, "rgba(60,30,30,0.16)");
    radial(fx + 14, 59, 9, "rgba(60,30,30,0.16)");
    radial(fx, 38, 22, "rgba(255,240,225,0.10)");
    const jaw = g.createLinearGradient(0, 84, 0, 128);
    jaw.addColorStop(0, "rgba(0,0,0,0)");
    jaw.addColorStop(1, "rgba(40,20,10,0.22)");
    g.fillStyle = jaw;
    g.fillRect(0, 84, 256, 44);
    const hair = HAIR[f.hair] || HAIR.brown;
    if (f.beard !== "none") {
      // shaved/stubble shadow under any facial hair
      g.globalAlpha = f.beard === "stubble" ? 0.42 : 0.22;
      g.fillStyle = hair;
      g.beginPath();
      g.ellipse(fx, 96, 34, 22, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(fx, 84, 13, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    if (f.mark === "freckles") {
      g.fillStyle = "rgba(110,60,30,0.45)";
      for (let i = 0; i < 38; i++) {
        const a = (i * 2.4) % 6.28, r = 6 + (i * 7) % 18;
        g.beginPath();
        g.arc(fx + Math.cos(a) * r * 1.4, 68 + Math.sin(a) * r * 0.4, 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (f.mark === "mole") {
      g.fillStyle = "#3a2418";
      g.beginPath();
      g.arc(fx + 17, 79, 1.6, 0, Math.PI * 2);
      g.fill();
    }
    if (f.mark === "scar") {
      g.strokeStyle = "rgba(200,140,120,0.9)";
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(fx + 8, 44);
      g.lineTo(fx + 19, 60);
      g.stroke();
    }
    if (f.age >= 2) {
      g.strokeStyle = "rgba(60,30,20,0.28)";
      g.lineWidth = 1;
      for (const y of [34, 38, 42]) {
        g.beginPath();
        g.moveTo(fx - 16, y);
        g.quadraticCurveTo(fx, y - 2, fx + 16, y);
        g.stroke();
      }
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(fx + s * 10, 70);
        g.quadraticCurveTo(fx + s * 15, 80, fx + s * 13, 88);
        g.stroke();
        g.beginPath();
        g.moveTo(fx + s * 21, 58);
        g.lineTo(fx + s * 26, 56);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function hairTexture(hex) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 220; i++) {
    const v = 150 + ((i * 97) % 105);
    g.strokeStyle = `rgba(${v},${v},${v},0.6)`;
    g.lineWidth = 1;
    const x = (i * 13.7) % 64;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 3, 20, x - 3, 44, x + 1, 64);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
  void hex;
  return t;
}

/* ------------------------------------------------------------------ builders */
function lathe(points, mat, phiStart = 0, phiLength = Math.PI * 2, zScale = 0.64) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 22, phiStart, phiLength);
  const m = new THREE.Mesh(g, mat);
  m.scale.z = zScale;
  return m;
}
function cyl(rt, rb, h, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  return m;
}
function ball(r, mat, sx = 1, sy = 1, sz = 1, seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), mat);
  m.scale.set(sx, sy, sz);
  return m;
}

function buildHead(f, variant, mats) {
  const d = headDims(f);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(sculpt(new THREE.SphereGeometry(1, 40, 28), d), mats.face);
  head.add(skull);
  const parts = { head, eyes: [], lids: [], brows: [], mouth: null, lowerLip: null, features: [] };
  const blank = variant === "blank";
  // ears
  for (const s of [-1, 1]) {
    const ear = ball(0.024, mats.skin, 0.38, 1, 0.62, 10);
    ear.position.set(s * (d.x - 0.004), -0.004, -0.006);
    ear.rotation.y = s * 0.25;
    head.add(ear);
  }
  if (!blank) {
    const eyeY = 0.012, eyeX = d.x * 0.36, eyeZ = d.z * 0.745;
    for (const s of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(s * eyeX, eyeY, eyeZ);
      const white = ball(0.0128, mats.white, 1, 1, 1, 16);
      eg.add(white);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0064, 18), mats.iris);
      iris.position.z = 0.0127;
      eg.add(iris);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0027, 12), mats.pupil);
      pupil.position.z = 0.01285;
      eg.add(pupil);
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 8), mats.glint);
      glint.position.set(0.002, 0.0022, 0.0129);
      eg.add(glint);
      // upper eyelid: a skin cap that rotates down over the eye to blink
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0138, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.skin);
      lid.rotation.x = -0.85;
      eg.add(lid);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0136, 14, 6, 0, Math.PI * 2, Math.PI * 0.72, Math.PI * 0.28), mats.skin);
      eg.add(lower);
      head.add(eg);
      parts.eyes.push({ white, iris, pupil, glint });
      parts.lids.push(lid);
      // brow
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0048, 0.009), mats.brow);
      brow.position.set(s * eyeX, eyeY + 0.022, eyeZ + 0.012);
      brow.rotation.z = s * (f.mouth === "frown" ? 0.12 : -0.07);
      brow.rotation.y = s * -0.2;
      head.add(brow);
      parts.brows.push(brow);
    }
    // nose: bridge + tip + nostrils
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.042, 0.02), mats.skin);
    bridge.position.set(0, -0.006, d.z * 0.86);
    bridge.rotation.x = -0.22;
    head.add(bridge);
    const tip = ball(0.012, mats.skin, 1.05, 0.85, 0.95, 12);
    tip.position.set(0, -0.027, d.z * 0.96);
    head.add(tip);
    for (const s of [-1, 1]) {
      const nos = ball(0.0078, mats.skin, 1, 0.8, 0.9, 10);
      nos.position.set(s * 0.0095, -0.031, d.z * 0.91);
      head.add(nos);
    }
    // mouth: lips + corners + a dark mouth that opens when talking
    const mouthY = -0.053, mouthZ = d.z * 0.86;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.011, 16), mats.mouth);
    mouth.scale.set(1.3, 0.12, 1);
    mouth.position.set(0, mouthY - 0.004, mouthZ - 0.002);
    head.add(mouth);
    parts.mouth = mouth;
    const thin = f.mouth === "thin" ? 0.7 : 1;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.0038 * thin, 0.026, 4, 10), mats.lip);
    upper.rotation.z = Math.PI / 2;
    upper.position.set(0, mouthY + 0.002, mouthZ + 0.001);
    head.add(upper);
    const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0048 * thin, 0.022, 4, 10), mats.lip);
    lowerLip.rotation.z = Math.PI / 2;
    lowerLip.position.set(0, mouthY - 0.006, mouthZ);
    head.add(lowerLip);
    parts.lowerLip = lowerLip;
    parts.lowerLipY = lowerLip.position.y;
    const lift = f.mouth === "smile" ? 0.0045 : f.mouth === "frown" ? -0.004 : 0;
    for (const s of [-1, 1]) {
      const corner = ball(0.0036 * thin, mats.lip, 1, 1, 1, 8);
      corner.position.set(s * 0.0175, mouthY - 0.002 + lift, mouthZ - 0.004);
      head.add(corner);
    }
    parts.features.push(bridge, tip, upper, lowerLip, mouth);
  }
  addHair(head, f, d, mats);
  if (!blank) {
    addBeard(head, f, d, mats);
    addGlasses(head, f, d, mats);
  }
  return parts;
}

/**
 * Hair shell: the sculpted skull inflated by `grow`, with everything below a
 * hairline tilted back by `tilt` tucked inside the skull (so the forehead and
 * face stay clear and the shell follows the head exactly).
 */
function hairCap(d, mat, theta = 1.44, tilt = 0.385, grow = 1.06) {
  const g = new THREE.SphereGeometry(1, 40, 28);
  const cut = Math.cos(theta);
  const p = g.attributes.position;
  const ct = Math.cos(tilt), stt = Math.sin(tilt);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const v = y * ct - z * stt;
    const k = Math.min(1, Math.max(0, (v - cut) / 0.06 + 0.5));
    const sc = k <= 0 ? 0.9 : k >= 1 ? 1 : 0.9 + 0.1 * k;
    p.setXYZ(i, x * sc, y * sc, z * sc);
  }
  sculpt(g, d, grow);
  return new THREE.Mesh(g, mat);
}
function addHair(head, f, d, mats) {
  const m = mats.hair;
  const style = f.style;
  if (style === "bald") {
    if (f.age >= 2) {
      for (let i = 0; i < 9; i++) {
        const phi = Math.PI * (0.58 + (i / 8) * 0.84);
        const tuft = ball(0.024, m, 1, 0.65, 0.8, 8);
        tuft.position.set(Math.sin(phi) * d.x * 0.98, -0.006, Math.cos(phi) * d.z * 0.98);
        head.add(tuft);
      }
    }
    return;
  }
  if (style === "buzz") {
    head.add(hairCap(d, mats.buzz, 1.42, 0.36, 1.012));
    return;
  }
  if (style === "cap") {
    head.add(hairCap(d, m, 1.5, 0.3, 1.04));
    const dome = hairCap(d, mats.capCloth, 1.28, 0.18, 1.09);
    head.add(dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), mats.capCloth);
    brim.scale.set(1.15, 1, 1.1);
    brim.position.set(0, 0.058, d.z * 0.9);
    brim.rotation.x = 0.16;
    head.add(brim);
    return;
  }
  const cap = hairCap(d, m, style === "slick" ? 1.4 : 1.44, style === "slick" ? 0.42 : 0.385, style === "curly" ? 1.1 : 1.06);
  head.add(cap);
  if (style === "long" || style === "bob") {
    const h = style === "long" ? 0.3 : 0.14;
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(d.x * 1.12, d.x * (style === "long" ? 1.38 : 1.2), h, 26, 1, true, Math.PI * 0.3, Math.PI * 1.4), mats.hairSide);
    drape.scale.z = 1.08;
    drape.position.set(0, 0.03 - h / 2, -0.006);
    head.add(drape);
    // fringe for the bob
    if (style === "bob") {
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.18, Math.PI * 0.22), m);
      fringe.geometry = sculpt(fringe.geometry, d, 1.08);
      fringe.rotation.y = 0;
      head.add(fringe);
    }
  }
  if (style === "bun") {
    const bun = ball(0.042, m, 1, 0.9, 1, 14);
    bun.position.set(0, 0.085, -0.075);
    head.add(bun);
  }
  if (style === "curly") {
    for (let i = 0; i < 22; i++) {
      const y = 1 - (i / 21) * 1.1;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.39996;
      const z = Math.cos(a) * r, x = Math.sin(a) * r;
      if (z > 0.55 && y < 0.6) continue; // keep the forehead clear
      const curl = ball(0.03, m, 1, 1, 1, 10);
      curl.position.set(x * d.x * 1.08, y * d.y * 1.02 + 0.006, z * d.z * 1.06 - 0.008);
      head.add(curl);
    }
  }
  if (style === "slick") {
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.004, 0.09), mats.part);
    part.position.set(0.032, d.y * 1.0, 0.0);
    part.rotation.z = -0.35;
    head.add(part);
  }
}
function addBeard(head, f, d, mats) {
  const m = mats.beard;
  if (f.beard === "full") {
    const chin = new THREE.Mesh(sculpt(new THREE.SphereGeometry(1, 26, 14, Math.PI * 0.5 - 1.45, 2.9, 2.05, 1.0), d, 1.07), m);
    head.add(chin);
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(sculpt(new THREE.SphereGeometry(1, 14, 10, s > 0 ? Math.PI * 0.5 - 1.5 : Math.PI * 0.5 + 0.62, 0.88, 1.55, 0.6), d, 1.05), m);
      head.add(cheek);
    }
  }
  if (f.beard === "goatee") {
    const g = new THREE.Mesh(sculpt(new THREE.SphereGeometry(1, 14, 10, Math.PI * 0.5 - 0.45, 0.9, 2.2, 0.75), d, 1.06), m);
    head.add(g);
  }
  if (f.beard === "mustache" || f.beard === "full" || f.beard === "goatee") {
    for (const s of [-1, 1]) {
      const ms = new THREE.Mesh(new THREE.CapsuleGeometry(f.beard === "goatee" ? 0.0035 : 0.0055, 0.018, 4, 8), m);
      ms.rotation.z = Math.PI / 2 + s * 0.32;
      ms.position.set(s * 0.011, -0.043, d.z * 0.9);
      head.add(ms);
    }
  }
}
function addGlasses(head, f, d, mats) {
  if (f.glasses === "none") return;
  const g = new THREE.Group();
  const eyeX = d.x * 0.36;
  for (const s of [-1, 1]) {
    const ring = f.glasses === "round"
      ? new THREE.Mesh(new THREE.TorusGeometry(0.0165, 0.0017, 6, 22), mats.frame)
      : new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0019, 4, 4), mats.frame);
    if (f.glasses !== "round") {
      ring.rotation.z = Math.PI / 4;
      ring.scale.set(1.1, 0.75, 1);
    }
    ring.position.set(s * eyeX, 0.012, d.z * 0.86);
    g.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), mats.lens);
    lens.position.copy(ring.position);
    lens.position.z -= 0.001;
    g.add(lens);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.003, d.z * 0.85), mats.frame);
    temple.position.set(s * (d.x - 0.002), 0.012, d.z * 0.42);
    temple.rotation.y = s * 0.06;
    g.add(temple);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0025, 0.003), mats.frame);
  bridge.position.set(0, 0.016, d.z * 0.88);
  g.add(bridge);
  head.add(g);
}

/* ------------------------------------------------------------------ body */
function torsoPoints(fem) {
  return fem
    ? [[0.13, 0.88], [0.152, 0.96], [0.125, 1.08], [0.138, 1.2], [0.15, 1.3], [0.14, 1.39], [0.1, 1.45], [0.05, 1.48]]
    : [[0.135, 0.88], [0.15, 0.98], [0.152, 1.1], [0.163, 1.22], [0.168, 1.32], [0.157, 1.4], [0.11, 1.46], [0.055, 1.49]];
}
function garmentPoints(outfit, fem) {
  const t = torsoPoints(fem).map(([r, y]) => [r + 0.014, y]);
  if (outfit === "coat") return [[fem ? 0.23 : 0.21, 0.4], [0.19, 0.6], [0.172, 0.8], ...t.filter(([, y]) => y > 0.85)];
  if (outfit === "hoodie") return [[0.15, 0.86], ...t.filter(([, y]) => y > 0.9)];
  return [[0.158, 0.84], ...t.filter(([, y]) => y > 0.88)];
}

/**
 * Build a guest. opts: { variant: normal|twisted|other, mood: calm|nervous|still, seed }
 * Returns { root, update(dt, state), setVoid(on), talk(sec) }.
 */
export function buildGuest(f, { variant = "normal", mood = "calm", seed = "x" } = {}) {
  const h = hash(seed + (f.hair || ""));
  const fem = f.body === "f";
  const outfit = variant === "other" ? "coat" : f.outfit || (f.age >= 2 ? "coat" : "jacket");
  const height = f.height || (fem ? 1.58 + (h % 15) / 100 : 1.68 + (h % 20) / 100);
  const H = (height / 1.75) * (variant === "other" ? 1.1 : 1);
  const build = 0.94 + ((h >> 5) % 14) / 100;
  const skinHex = SKIN[f.skin] || SKIN[1];
  const hairHex = HAIR[f.hair] || HAIR.brown;
  const blank = variant === "other";

  const skinCol = col(variant === "twisted" ? mix(skinHex, "#9a948a", 0.5) : blank ? 0xe6e2da : skinHex);
  const mats = {
    face: std(0xffffff, 0.58, { map: skinTexture(f, blank ? "blank" : "normal"), emissive: skinCol, emissiveIntensity: 0.025 }),
    skin: std(skinCol, 0.58, { emissive: skinCol, emissiveIntensity: 0.025 }),
    white: std(0xeeeae2, 0.3),
    iris: std(EYE[f.eyes] || EYE.brown, 0.3),
    pupil: new THREE.MeshBasicMaterial({ color: 0x050505 }),
    glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    brow: std(mix(hairHex, "#000", f.hair === "white" || f.hair === "gray" ? 0.1 : 0.15), 0.9),
    lip: std(mix(skinHex, "#8a3a38", 0.32), 0.45),
    mouth: new THREE.MeshBasicMaterial({ color: 0x1a0606, side: THREE.DoubleSide }),
    hair: std(hairHex, f.style === "slick" ? 0.32 : 0.6, { map: hairTexture(hairHex) }),
    hairSide: std(hairHex, 0.62, { side: THREE.DoubleSide }),
    buzz: std(mix(hairHex, skinHex, 0.38), 0.85),
    part: std(skinHex, 0.8),
    beard: std(hairHex, 0.85),
    capCloth: std(0x7a2420, 0.85),
    frame: std(0x141414, 0.4),
    lens: new THREE.MeshStandardMaterial({ color: 0xaac0d0, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
    coat: std(blank ? 0x0e0e10 : f.coat, outfit === "suit" ? 0.6 : 0.88, { side: THREE.DoubleSide }),
    coatDark: std(mix(blank ? "#0e0e10" : f.coat, "#000", 0.3), 0.85),
    shirt: std(outfit === "suit" ? 0xe8e4dc : outfit === "dress" ? f.coat : SHIRTS[h % SHIRTS.length], 0.85),
    pants: std(outfit === "dress" ? 0x2a2226 : PANTS[(h >> 3) % PANTS.length], 0.9),
    shoe: std(SHOES[(h >> 7) % SHOES.length], 0.45),
    tie: std(TIES[(h >> 9) % TIES.length], 0.6),
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(H);
  root.add(body);

  /* legs */
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * (fem ? 0.085 : 0.09), 0.92, 0);
    const thigh = cyl(0.068, 0.054, 0.43, mats.pants);
    thigh.position.y = -0.215;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    const shin = cyl(0.05, 0.04, 0.41, mats.pants);
    shin.position.y = -0.205;
    knee.add(shin);
    const shoe = new THREE.Group();
    shoe.position.y = -0.445;
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.2), mats.shoe);
    sole.position.set(0, 0.0, 0.035);
    shoe.add(sole);
    const toe = ball(0.046, mats.shoe, 1, 0.65, 1.2, 10);
    toe.position.set(0, 0.0, 0.12);
    shoe.add(toe);
    knee.add(shoe);
    hip.add(knee);
    body.add(hip);
    legs.push({ hip, knee, s });
  }
  const pelvis = ball(0.16, mats.pants, fem ? 1.08 : 1, 0.5, 0.68, 16);
  pelvis.position.y = 0.93;
  body.add(pelvis);

  /* spine: torso, garment, arms, neck, head */
  const spine = new THREE.Group();
  spine.position.y = 0.98;
  body.add(spine);
  const off = -0.98;
  const torso = lathe(torsoPoints(fem), mats.shirt);
  torso.position.y = off;
  spine.add(torso);
  if (outfit === "dress") {
    const skirt = lathe([[fem ? 0.24 : 0.22, 0.48], [0.2, 0.62], [0.17, 0.8], [0.15, 0.95], [0.14, 1.0]], mats.shirt, 0, Math.PI * 2, 0.75);
    skirt.position.y = off;
    spine.add(skirt);
  } else {
    const open = outfit === "hoodie" ? 0 : outfit === "suit" ? 0.17 : 0.22;
    const garment = lathe(garmentPoints(outfit, fem), mats.coat, open, Math.PI * 2 - open * 2, 0.66);
    garment.position.y = off;
    spine.add(garment);
    if (outfit !== "hoodie") {
      for (const s of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.17, 0.007), mats.coatDark);
        lapel.position.set(s * 0.048, 1.35 + off, 0.098);
        lapel.rotation.set(0.12, -s * 0.25, s * 0.38);
        spine.add(lapel);
      }
    } else {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 18, Math.PI * 1.3), mats.coat);
      hood.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.85);
      hood.scale.set(1, 1.1, 0.9);
      hood.position.set(0, 1.44 + off, -0.035);
      spine.add(hood);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.01), mats.coatDark);
      pocket.position.set(0, 1.0 + off, 0.115);
      spine.add(pocket);
    }
    if (outfit === "suit") {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.3, 0.008), mats.tie);
      tie.position.set(0, 1.27 + off, 0.104);
      tie.rotation.x = 0.06;
      spine.add(tie);
    }
    const belt = cyl(0.152, 0.152, 0.03, mats.coatDark, 18);
    belt.scale.z = 0.66;
    belt.position.y = 0.9 + off;
    spine.add(belt);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 16), outfit === "hoodie" ? mats.coat : mats.shirt);
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1, 0.9, 1);
  collar.position.y = 1.475 + off;
  spine.add(collar);

  const S = fem ? 0.155 : 0.178;
  const arms = [];
  const longArm = variant === "twisted" ? 1.45 : 1;
  for (const s of [-1, 1]) {
    const pad = ball(0.058, mats.coat, 1.05, 0.78, 0.92, 14);
    pad.position.set(s * S, 1.405 + off, 0);
    spine.add(pad);
    const shoulder = new THREE.Group();
    shoulder.position.set(s * (S + 0.01), 1.41 + off, 0);
    const upper = cyl(0.05, 0.044, 0.3, mats.coat);
    upper.position.y = -0.15;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    const fore = cyl(0.044, 0.036, 0.25 * longArm, mats.coat);
    fore.position.y = -0.125 * longArm;
    elbow.add(fore);
    const cuff = cyl(0.036, 0.034, 0.02, mats.shirt);
    cuff.position.y = -0.252 * longArm;
    elbow.add(cuff);
    const hand = new THREE.Group();
    hand.position.y = -0.265 * longArm;
    const palm = ball(0.03, mats.skin, 0.95, 1.35, 0.5, 10);
    palm.position.y = -0.035;
    hand.add(palm);
    const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.03, 3, 8), mats.skin);
    fingers.scale.set(1.9, 1, 0.75);
    fingers.position.set(0, -0.08, 0.004);
    fingers.rotation.x = 0.25;
    hand.add(fingers);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.026, 3, 6), mats.skin);
    thumb.position.set(-s * 0.026, -0.04, 0.01);
    thumb.rotation.z = -s * 0.5;
    hand.add(thumb);
    elbow.add(hand);
    shoulder.add(elbow);
    spine.add(shoulder);
    arms.push({ shoulder, elbow, hand, s });
  }
  const neckLen = variant === "twisted" ? 0.34 : 0.13;
  const neck = cyl(0.05, 0.056, neckLen, mats.skin);
  neck.position.y = 1.42 + neckLen / 2 + off;
  spine.add(neck);
  const headParts = buildHead(f, blank ? "blank" : "normal", mats);
  const head = headParts.head;
  head.position.y = 1.42 + neckLen + 0.06 + off;
  spine.add(head);

  root.traverse((o) => {
    if (o.isMesh) o.frustumCulled = true;
  });

  /* ---------------------------------------------------------------- void face */
  let voidOn = false;
  const saved = { white: mats.white.color.getHex(), iris: mats.iris.color.getHex() };
  function setVoidMats(on) {
    mats.white.color.setHex(on ? 0x020202 : saved.white);
    mats.iris.color.setHex(on ? 0x020202 : saved.iris);
    headParts.brows.forEach((b) => (b.visible = !on));
    if (headParts.mouth) headParts.mouth.scale.set(on ? 1.9 : 1.3, on ? 0.9 : 0.12, 1);
  }
  if (variant === "twisted") {
    head.rotation.set(0.15, Math.PI, 0.38);
    setVoidMats(true);
  }
  function setVoid(on) {
    if (voidOn === on || variant !== "normal") return;
    voidOn = on;
    setVoidMats(on);
  }

  /* ---------------------------------------------------------------- animation */
  const st = {
    t: (h % 100) / 10, walk: 0, idleW: 0, blinkT: 1 + (h % 30) / 10, blink: 0, glanceT: 3, glance: 0, glanceP: 0,
    lookY: 0, lookP: 0, talk: 0, fidget: 0,
  };
  const still = mood === "still" || variant !== "normal";
  const nervous = mood === "nervous";
  // 2-bone IK target for hands resting on the counter (body-local, unscaled)
  const L1 = 0.3, L2 = 0.3 * longArm;
  function ik(shY, tY, tZ) {
    const dy = shY - tY, dz = tZ;
    const dist = Math.min(L1 + L2 - 0.001, Math.hypot(dy, dz));
    const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))));
    const base = Math.atan2(dz, dy); // angle from straight down toward +z
    const shoulderX = -(base - a); // upper arm hangs, forearm reaches forward
    const elbowBend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2))));
    return { shoulderX, elbowX: elbowBend };
  }
  const counterTop = 1.19 / H, counterZ = 0.47 / H;
  const pose = ik(1.41, counterTop, counterZ);

  /** state: { moving, idle (bool: standing at the desk), lookYaw, lookPitch } */
  function update(dt, s = {}) {
    st.t += dt;
    const moving = !!s.moving;
    if (moving) st.walk += dt * 6.4;
    const wantIdle = s.idle && !moving ? 1 : 0;
    st.idleW += (wantIdle - st.idleW) * Math.min(1, dt * 2.4);
    const w = st.idleW;
    const ph = st.walk;
    const amp = moving ? 1 : 0;
    // legs
    for (const L of legs) {
      const sw = Math.sin(ph + (L.s > 0 ? Math.PI : 0));
      L.hip.rotation.x = -sw * 0.42 * amp;
      L.knee.rotation.x = Math.max(0, Math.cos(ph + (L.s > 0 ? Math.PI : 0))) * 0.75 * amp;
    }
    body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.018 : 0;
    // weight shift / breathing
    const breathe = Math.sin(st.t * (nervous ? 2.6 : 1.6));
    spine.scale.set(1 + breathe * (still ? 0.002 : 0.007), 1, 1 + breathe * (still ? 0.002 : 0.01));
    const sway = still ? 0 : Math.sin(st.t * 0.45) * (nervous ? 0.018 : 0.01);
    body.position.x = sway * (1 - amp);
    spine.rotation.z = -sway * 0.6;
    spine.rotation.x = (f.age >= 2 ? 0.07 : 0.015) + w * 0.06 + (moving ? 0.04 : 0);
    // arms: walk swing ⇄ hands on the counter
    if (nervous && w > 0.5) st.fidget += dt * 9;
    for (const A of arms) {
      const sw = Math.sin(ph + (A.s > 0 ? 0 : Math.PI));
      const walkX = sw * 0.32 * amp, walkE = -0.18 - (moving ? 0.1 : 0);
      const tap = nervous ? Math.max(0, Math.sin(st.fidget + A.s)) * 0.06 : 0;
      A.shoulder.rotation.x = walkX * (1 - w) + (pose.shoulderX + 0.06) * w;
      A.elbow.rotation.x = walkE * (1 - w) + -(pose.elbowX - tap) * w;
      A.shoulder.rotation.z = A.s * (0.06 - w * 0.14);
      A.hand.rotation.x = w * 0.5;
    }
    // head: look at the clerk, with glances away (calm/nervous)
    let gy = s.lookYaw || 0, gp = s.lookPitch || 0;
    if (!still && w > 0.5) {
      st.glanceT -= dt;
      if (st.glanceT <= 0) {
        if (st.glance) { st.glance = 0; st.glanceT = nervous ? 0.8 + Math.random() * 1.5 : 3 + Math.random() * 5; }
        else { st.glance = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.4); st.glanceP = (Math.random() - 0.6) * 0.25; st.glanceT = nervous ? 0.5 + Math.random() * 0.6 : 1 + Math.random() * 1.2; }
      }
      gy += st.glance;
      gp += st.glance ? st.glanceP : 0;
    }
    if (variant === "normal") {
      const k = Math.min(1, dt * (nervous ? 9 : 4));
      st.lookY += (gy * w - st.lookY) * k;
      st.lookP += (gp * w - st.lookP) * k;
      head.rotation.y = st.lookY;
      head.rotation.x = st.lookP + (f.age >= 2 ? 0.06 : 0);
      head.rotation.z = nervous ? Math.sin(st.t * 1.3) * 0.03 : 0;
    }
    // blinking (the still ones never blink)
    if (!still && headParts.lids.length) {
      st.blinkT -= dt;
      if (st.blinkT <= 0) { st.blink = 0.14; st.blinkT = nervous ? 0.8 + Math.random() * 1.6 : 2 + Math.random() * 3.5; }
      if (st.blink > 0) st.blink -= dt;
      const closed = st.blink > 0 ? Math.sin((st.blink / 0.14) * Math.PI) : 0;
      for (const lid of headParts.lids) lid.rotation.x = -0.85 + closed * 1.6;
    }
    // talking: the jaw/lower lip moves
    if (headParts.lowerLip) {
      if (st.talk > 0) st.talk -= dt;
      const open = st.talk > 0 ? Math.abs(Math.sin(st.t * 15)) * Math.abs(Math.sin(st.t * 4.3)) : 0;
      headParts.lowerLip.position.y = headParts.lowerLipY - open * 0.007;
      if (!voidOn && headParts.mouth) headParts.mouth.scale.set(1.3, 0.12 + open * 0.75, 1);
    }
  }
  return {
    root, update, setVoid,
    talk: (sec) => { if (variant === "normal") st.talk = Math.max(st.talk, sec); },
    height: height * (variant === "other" ? 1.1 : 1),
  };
}
