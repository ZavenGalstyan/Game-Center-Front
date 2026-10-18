/**
 * Vice Streets 3D — Club Neon, the walk-in nightclub on Coral Key.
 *
 * The city (engine/city.js `club`) gives the footprint, the door gap, the bar,
 * the DJ stage, the booths and the dance floor; the walls / furniture there are
 * real colliders. This draws it: a neon-trimmed shell with a big sign and an
 * entrance canopy (red carpet, rope posts), and inside a reflective dark floor,
 * a 12 × 10 LED dance floor that changes pattern on every beat (124 BPM, the
 * same tempo as the music and the dancers), a DJ stage with decks and an LED
 * wall, speaker stacks, a lit back bar with bottles, stools, velvet booths, a
 * lighting truss with sweeping beams and a spinning mirror ball.
 * `update()` reports whether the camera target is inside, so the renderer can
 * dim the daylight in there.
 */
import * as THREE from "three";
import { CURB } from "../engine/city.js";

const BPM = 124;
const NEON = ["#ff2fa0", "#2fe8ff", "#b44bff", "#ffe14d", "#39ff7a", "#ff6a2f"];

function signTexture(text) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0)";
  g.fillRect(0, 0, 512, 128);
  g.font = "italic 900 92px Arial Black, Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "#ff2fa0";
  g.shadowBlur = 24;
  g.fillStyle = "#ff8fd0";
  g.fillText(text, 256, 66);
  g.shadowBlur = 0;
  g.lineWidth = 3;
  g.strokeStyle = "#ffffff";
  g.strokeText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildClub(scene, city) {
  const C = city.club;
  if (!C) return null;
  const root = new THREE.Group();
  scene.add(root);
  const inside = new THREE.Group(); // interior detail (hidden when far)
  root.add(inside);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const basic = (o) => keep(new THREE.MeshBasicMaterial({ toneMapped: false, ...o }));
  const y0 = CURB;
  const H = C.h;
  const box = (parent, mat, x0, ya, z0, x1, yb, z1) => {
    const g = keep(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(yb - ya), Math.abs(z1 - z0)));
    const m = new THREE.Mesh(g, mat);
    m.position.set((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2);
    parent.add(m);
    return m;
  };

  /* ---------------- shell ---------------- */
  const wallOut = std({ color: "#2a1240", roughness: 0.55, metalness: 0.2 });
  const wallIn = std({ color: "#120a1c", roughness: 0.9 });
  const roofMat = std({ color: "#1a1024", roughness: 0.8 });
  const W = C.wall;
  // west wall in two parts round the door; the rest whole
  box(root, wallOut, C.x0, y0, C.z0, C.x0 + W, H, C.doorZ0);
  box(root, wallOut, C.x0, y0, C.doorZ1, C.x0 + W, H, C.z1);
  box(root, wallOut, C.x0, 3.2, C.doorZ0, C.x0 + W, H, C.doorZ1); // lintel
  box(root, wallOut, C.x0, y0, C.z0, C.x1, H, C.z0 + W);
  box(root, wallOut, C.x0, y0, C.z1 - W, C.x1, H, C.z1);
  box(root, wallOut, C.x1 - W, y0, C.z0, C.x1, H, C.z1);
  // interior skins (dark), ceiling, roof
  box(inside, wallIn, C.x0 + W, y0, C.z0 + W, C.x0 + W + 0.04, H - 0.4, C.doorZ0);
  box(inside, wallIn, C.x0 + W, y0, C.doorZ1, C.x0 + W + 0.04, H - 0.4, C.z1 - W);
  box(inside, wallIn, C.x0 + W, y0, C.z0 + W, C.x1 - W, H - 0.4, C.z0 + W + 0.04);
  box(inside, wallIn, C.x0 + W, y0, C.z1 - W - 0.04, C.x1 - W, H - 0.4, C.z1 - W);
  box(inside, wallIn, C.x1 - W - 0.04, y0, C.z0 + W, C.x1 - W, H - 0.4, C.z1 - W);
  box(root, roofMat, C.x0 - 0.3, H, C.z0 - 0.3, C.x1 + 0.3, H + 0.45, C.z1 + 0.3);
  // neon trim round the outside, top and bottom
  const trimPink = basic({ color: "#ff2fa0" });
  const trimCyan = basic({ color: "#2fe8ff" });
  for (const [mat, y] of [[trimPink, H - 0.25], [trimCyan, 0.55]]) {
    box(root, mat, C.x0 - 0.06, y, C.z0, C.x0, y + 0.12, C.z1);
    box(root, mat, C.x1, y, C.z0, C.x1 + 0.06, y + 0.12, C.z1);
    box(root, mat, C.x0, y, C.z0 - 0.06, C.x1, y + 0.12, C.z0);
    box(root, mat, C.x0, y, C.z1, C.x1, y + 0.12, C.z1 + 0.06);
  }
  // the sign over the door and the canopy, carpet, ropes
  const signTex = keep(signTexture("CLUB NEON"));
  const sign = new THREE.Mesh(keep(new THREE.PlaneGeometry(14, 3.5)), basic({ map: signTex, transparent: true, side: THREE.DoubleSide }));
  sign.position.set(C.x0 - 0.12, H - 1.9, C.door.z);
  sign.rotation.y = -Math.PI / 2;
  root.add(sign);
  const canopy = std({ color: "#14081f", roughness: 0.5 });
  box(root, canopy, C.x0 - 4.5, 3.25, C.doorZ0 - 1.2, C.x0, 3.45, C.doorZ1 + 1.2);
  box(root, trimPink, C.x0 - 4.55, 3.18, C.doorZ0 - 1.25, C.x0, 3.25, C.doorZ0 - 1.15);
  box(root, trimPink, C.x0 - 4.55, 3.18, C.doorZ1 + 1.15, C.x0, 3.25, C.doorZ1 + 1.25);
  box(root, trimCyan, C.x0 - 4.6, 3.18, C.doorZ0 - 1.25, C.x0 - 4.5, 3.25, C.doorZ1 + 1.25);
  box(root, std({ color: "#9b1020", roughness: 0.9 }), C.x0 - 6, y0 + 0.005, C.doorZ0 + 0.6, C.x0 + 4, y0 + 0.02, C.doorZ1 - 0.6);
  const brass = std({ color: "#d8b45a", metalness: 1, roughness: 0.25 });
  const rope = std({ color: "#b0182a", roughness: 0.6 });
  for (const zz of [C.doorZ0 - 0.6, C.doorZ1 + 0.6]) {
    for (let k = 0; k < 3; k++) box(root, brass, C.x0 - 1.6 - k * 1.6, y0, zz - 0.06, C.x0 - 1.48 - k * 1.6, y0 + 1, zz + 0.06);
    box(root, rope, C.x0 - 4.8, y0 + 0.82, zz - 0.035, C.x0 - 1.5, y0 + 0.88, zz + 0.035);
  }

  /* ---------------- floor + dance floor ---------------- */
  const floorMat = std({ color: "#0d0a12", roughness: 0.22, metalness: 0.35 });
  box(inside, floorMat, C.x0 + W, y0 - 0.05, C.z0 + W, C.x1 - W, y0 + 0.012, C.z1 - W);
  const D = C.dance;
  const NX = 12;
  const NZ = 10;
  const tw = (D.x1 - D.x0) / NX;
  const tz = (D.z1 - D.z0) / NZ;
  const tileGeo = keep(new THREE.BoxGeometry(tw * 0.94, 0.04, tz * 0.94));
  const tiles = new THREE.InstancedMesh(tileGeo, basic({ color: "#ffffff" }), NX * NZ);
  const _m = new THREE.Matrix4();
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    _m.makeTranslation(D.x0 + (i + 0.5) * tw, y0 + 0.03, D.z0 + (j + 0.5) * tz);
    tiles.setMatrixAt(i * NZ + j, _m);
    tiles.setColorAt(i * NZ + j, new THREE.Color("#222"));
  }
  inside.add(tiles);
  const tileCols = NEON.map((h) => new THREE.Color(h));
  const dark = new THREE.Color("#100818");
  const _c = new THREE.Color();

  /* ---------------- DJ stage ---------------- */
  const J = C.dj;
  const stageMat = std({ color: "#1b1b22", roughness: 0.5, metalness: 0.4 });
  box(inside, stageMat, J.x0, y0, J.z0, J.x1, y0 + 0.75, J.z1);
  box(inside, trimCyan, J.x0 - 0.05, y0 + 0.6, J.z0, J.x0, y0 + 0.7, J.z1);
  const deskMat = std({ color: "#0b0b10", roughness: 0.35, metalness: 0.5 });
  box(inside, deskMat, J.x0 + 0.6, y0 + 0.75, J.z0 + 4, J.x0 + 1.6, y0 + 1.75, J.z1 - 4);
  const deckMat = std({ color: "#c9ced6", metalness: 0.9, roughness: 0.3 });
  for (const dz of [-1.6, 1.6]) {
    const disc = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 24)), deckMat);
    disc.position.set(J.x0 + 1.1, y0 + 1.78, (J.z0 + J.z1) / 2 + dz);
    inside.add(disc);
  }
  // LED wall behind the DJ
  const LX = 16;
  const LY = 6;
  const ledGeo = keep(new THREE.PlaneGeometry(((J.z1 - J.z0) / LX) * 0.92, (4.5 / LY) * 0.92));
  const led = new THREE.InstancedMesh(ledGeo, basic({ color: "#ffffff", side: THREE.DoubleSide }), LX * LY);
  const ledQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < LX; i++) for (let j = 0; j < LY; j++) {
    _p.set(C.x1 - W - 0.08, y0 + 1.6 + (j + 0.5) * (4.5 / LY), J.z0 + (i + 0.5) * ((J.z1 - J.z0) / LX));
    _m.compose(_p, ledQ, _s);
    led.setMatrixAt(i * LY + j, _m);
    led.setColorAt(i * LY + j, dark);
  }
  inside.add(led);
  // speaker stacks either side of the stage
  const spk = std({ color: "#0a0a0c", roughness: 0.7 });
  const cone = std({ color: "#2a2a30", roughness: 0.4, metalness: 0.3 });
  for (const zz of [J.z0 - 1.6, J.z1 + 0.4]) {
    box(inside, spk, J.x0 + 1, y0, zz, J.x0 + 2.4, y0 + 3.2, zz + 1.2);
    for (const yy of [0.8, 1.9, 2.8]) {
      const c2 = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 20)), cone);
      c2.rotation.z = Math.PI / 2;
      c2.position.set(J.x0 + 0.98, y0 + yy, zz + 0.6);
      inside.add(c2);
    }
  }

  /* ---------------- bar ---------------- */
  const B = C.bar;
  const wood = std({ color: "#2b1810", roughness: 0.45, metalness: 0.1 });
  box(inside, wood, B.x0, y0, B.z0, B.x1, y0 + 1.1, B.z1);
  box(inside, std({ color: "#e6e2dc", roughness: 0.15, metalness: 0.2 }), B.x0 - 0.1, y0 + 1.1, B.z0 - 0.1, B.x1 + 0.1, y0 + 1.16, B.z1 + 0.15);
  box(inside, trimPink, B.x0, y0 + 0.15, B.z1, B.x1, y0 + 0.22, B.z1 + 0.02);
  // back bar: lit shelves with bottles
  const backZ = C.z0 + W;
  box(inside, std({ color: "#1a1015", roughness: 0.6 }), B.x0, y0, backZ, B.x1, y0 + 2.6, backZ + 0.8);
  for (const yy of [1.35, 1.95]) box(inside, basic({ color: "#ffb36b" }), B.x0 + 0.3, y0 + yy - 0.03, backZ + 0.82, B.x1 - 0.3, y0 + yy, backZ + 0.85);
  const bottleGeo = keep(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 8));
  const bottles = new THREE.InstancedMesh(bottleGeo, keep(new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.1, emissive: "#331a00", transparent: true, opacity: 0.9 })), 60);
  for (let k = 0; k < 60; k++) {
    _m.makeTranslation(B.x0 + 0.6 + (k % 30) * ((B.x1 - B.x0 - 1.2) / 29), y0 + (k < 30 ? 1.53 : 2.13), backZ + 0.55);
    bottles.setMatrixAt(k, _m);
    bottles.setColorAt(k, new THREE.Color(["#3fa34d", "#c9a227", "#8a1f2b", "#d9d9d9", "#2f6fb5"][k % 5]));
  }
  inside.add(bottles);
  // stools
  const stoolMat = std({ color: "#c9ced6", metalness: 0.9, roughness: 0.3 });
  const seatMat = std({ color: "#8a1f3d", roughness: 0.6 });
  for (let x = B.x0 + 1.5; x < B.x1 - 1; x += 2.4) {
    box(inside, stoolMat, x - 0.04, y0, B.z1 + 0.65, x + 0.04, y0 + 0.75, B.z1 + 0.73);
    const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14)), seatMat);
    top.position.set(x, y0 + 0.79, B.z1 + 0.69);
    inside.add(top);
  }

  /* ---------------- booths ---------------- */
  const velvet = std({ color: "#5a0f2e", roughness: 0.85 });
  const tableMat = std({ color: "#111", roughness: 0.2, metalness: 0.6 });
  for (const b of C.booths) {
    box(inside, velvet, b.x0, y0, b.z0, b.x1, y0 + 0.45, b.z1);
    box(inside, velvet, b.x0, y0 + 0.45, b.z1 - 0.35, b.x1, y0 + 1.25, b.z1);
    for (let x = b.x0 + 2; x < b.x1 - 1; x += 4.5) box(inside, tableMat, x - 0.5, y0 + 0.6, b.z0 - 1.6, x + 0.5, y0 + 0.66, b.z0 - 0.7);
  }

  /* ---------------- lights: neon strips, truss, beams, mirror ball ---------------- */
  const strip = (mat, x0, z0, x1, z1, y) => box(inside, mat, x0, y, z0, x1, y + 0.08, z1);
  strip(trimPink, C.x0 + W + 0.05, C.z0 + 1, C.x0 + W + 0.08, C.z1 - 1, 4.8);
  strip(trimCyan, C.x0 + W + 1, C.z1 - W - 0.08, C.x1 - W - 1, C.z1 - W - 0.05, 4.4);
  strip(trimCyan, C.x0 + W + 1, C.z0 + W + 0.85, C.x1 - W - 1, C.z0 + W + 0.88, 4.4);
  const truss = std({ color: "#9aa0a8", metalness: 0.8, roughness: 0.4 });
  const ty = H - 1.0;
  box(inside, truss, D.x0, ty, D.z0 - 0.1, D.x1, ty + 0.25, D.z0 + 0.1);
  box(inside, truss, D.x0, ty, D.z1 - 0.1, D.x1, ty + 0.25, D.z1 + 0.1);
  box(inside, truss, D.x0 - 0.1, ty, D.z0, D.x0 + 0.1, ty + 0.25, D.z1);
  box(inside, truss, D.x1 - 0.1, ty, D.z0, D.x1 + 0.1, ty + 0.25, D.z1);
  // sweeping beams: long thin additive cones from fixtures on the truss
  const beamGeo = keep(new THREE.ConeGeometry(0.9, 7, 18, 1, true));
  beamGeo.translate(0, -3.5, 0);
  const beams = [];
  const fixtures = [];
  for (let k = 0; k < 8; k++) {
    const onZ0 = k < 4;
    const fx = D.x0 + 3 + (k % 4) * ((D.x1 - D.x0 - 6) / 3);
    const fz = onZ0 ? D.z0 : D.z1;
    const mat = keep(new THREE.MeshBasicMaterial({ color: NEON[k % NEON.length], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const piv = new THREE.Group();
    piv.position.set(fx, ty - 0.05, fz);
    const m = new THREE.Mesh(beamGeo, mat);
    piv.add(m);
    inside.add(piv);
    beams.push({ piv, mat, k, side: onZ0 ? 1 : -1 });
    fixtures.push(box(inside, deskMat, fx - 0.2, ty - 0.3, fz - 0.2, fx + 0.2, ty, fz + 0.2));
  }
  // mirror ball
  const ball = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.7, 2)), std({ color: "#e8eef6", metalness: 1, roughness: 0.08, flatShading: true }));
  ball.position.set((D.x0 + D.x1) / 2, H - 1.6, (D.z0 + D.z1) / 2);
  inside.add(ball);
  box(inside, truss, ball.position.x - 0.02, H - 0.95, ball.position.z - 0.02, ball.position.x + 0.02, H - 0.4, ball.position.z + 0.02);
  // sparkles thrown by the ball: small additive dots on the walls
  const sparkGeo = keep(new THREE.PlaneGeometry(0.1, 0.1));
  const sparkMat = basic({ color: "#ffffff", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const NS = 90;
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, NS);
  const sparkDirs = [];
  for (let k = 0; k < NS; k++) sparkDirs.push({ a: (k / NS) * Math.PI * 2 * 7.3, y: 1 + ((k * 37) % 40) / 10 });
  inside.add(sparks);

  // club lighting: two colour washes over the floor and warm light over the
  // bar. Always in the scene (so no shader rebuilds), only lit near the club.
  const washA = new THREE.PointLight("#ff3fb0", 0, 34, 1.2);
  washA.position.set(D.x0 + 6, H - 1.3, (D.z0 + D.z1) / 2);
  const washB = new THREE.PointLight("#3fe0ff", 0, 34, 1.2);
  washB.position.set(D.x1 - 4, H - 1.3, (D.z0 + D.z1) / 2);
  const barLight = new THREE.PointLight("#ffb46b", 0, 22, 1.4);
  barLight.position.set((B.x0 + B.x1) / 2, 3.2, B.z1 + 1.5);
  root.add(washA, washB, barLight);
  let lastBeat = -1;
  const api = {
    /** returns true when (x, z) is inside the club (lights dimmed by the caller) */
    update(t, F, sim) {
      const dx = F.x - (C.x0 + C.x1) / 2;
      const dz = F.z - (C.z0 + C.z1) / 2;
      const far = Math.hypot(dx, dz);
      root.visible = far < 320;
      inside.visible = far < 110;
      const isIn = sim ? sim.inClub(F.x, F.z) : false;
      const near = Math.max(0, Math.min(1, 1 - (far - 30) / 50));
      if (!inside.visible) {
        washA.intensity = washB.intensity = barLight.intensity = 0;
        return isIn;
      }
      const beatF = (t * BPM) / 60;
      const beat = Math.floor(beatF);
      const pulse = Math.pow(1 - (beatF - beat), 3);
      // dance floor: a new pattern every 8 beats, colours step on every beat
      if (beat !== lastBeat) {
        lastBeat = beat;
        const pat = Math.floor(beat / 8) % 4;
        for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
          let on;
          let ci;
          if (pat === 0) {
            on = (i + j + beat) % 2 === 0;
            ci = beat % NEON.length;
          } else if (pat === 1) {
            on = Math.abs(((i + beat) % NX) - j) < 2;
            ci = (i + beat) % NEON.length;
          } else if (pat === 2) {
            const r = Math.hypot(i - NX / 2 + 0.5, j - NZ / 2 + 0.5);
            on = Math.floor(r - beat) % 3 === 0;
            ci = Math.floor(r) % NEON.length;
          } else {
            on = ((i * 7 + j * 13 + beat * 5) % 5) < 2;
            ci = (i + j) % NEON.length;
          }
          tiles.setColorAt(i * NZ + j, on ? tileCols[ci] : dark);
        }
        tiles.instanceColor.needsUpdate = true;
        // LED wall: a bar graph that jumps on the beat
        for (let i = 0; i < LX; i++) {
          const hgt = 1 + ((i * 5 + beat * 3) % LY);
          for (let j = 0; j < LY; j++) led.setColorAt(i * LY + j, j < hgt ? tileCols[(j + (beat >> 2)) % NEON.length] : dark);
        }
        led.instanceColor.needsUpdate = true;
      }
      // the beat glows through the tiles, beams pulse and sweep
      tiles.material.color.setScalar(0.65 + pulse * 0.35);
      for (const b of beams) {
        const sw = Math.sin(t * (0.6 + b.k * 0.07) + b.k) * 0.7;
        b.piv.rotation.set(b.side * (0.45 + Math.sin(t * 0.9 + b.k * 1.3) * 0.25), 0, sw);
        b.mat.opacity = 0.08 + pulse * 0.14;
      }
      ball.rotation.y = t * 0.6;
      washA.intensity = near * (26 + pulse * 22);
      washB.intensity = near * (26 + (1 - pulse) * 18);
      washA.color.set(NEON[(beat >> 2) % NEON.length]);
      barLight.intensity = near * 30;
      // mirror-ball sparkles travel round the walls
      for (let k = 0; k < NS; k++) {
        const s = sparkDirs[k];
        const a = s.a + t * 0.6;
        const rx = Math.cos(a);
        const rz = Math.sin(a);
        // project onto the inside of the walls
        const hx = rx > 0 ? (C.x1 - W - 0.1 - ball.position.x) / rx : (C.x0 + W + 0.1 - ball.position.x) / rx;
        const hz = rz > 0 ? (C.z1 - W - 0.1 - ball.position.z) / rz : (C.z0 + W + 0.1 - ball.position.z) / rz;
        const L = Math.min(Math.abs(hx), Math.abs(hz));
        _p.set(ball.position.x + rx * L, s.y + Math.sin(t + k) * 0.2, ball.position.z + rz * L);
        _m.makeRotationY(Math.abs(hx) < Math.abs(hz) ? Math.PI / 2 : 0).setPosition(_p);
        sparks.setMatrixAt(k, _m);
      }
      sparks.instanceMatrix.needsUpdate = true;
      sparkMat.opacity = 0.25 + pulse * 0.4;
      _c.copy(tileCols[(lastBeat >> 1) % NEON.length]);
      trimPink.color.setHex(0xff2fa0).multiplyScalar(0.7 + pulse * 0.3);
      return isIn;
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose?.();
    },
  };
  return api;
}
