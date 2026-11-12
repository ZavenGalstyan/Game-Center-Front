/**
 * Plain Three.js view of the sim. Owns the WebGL renderer, builds the level
 * meshes from the parsed grid, mirrors enemies/doors/props each frame and
 * draws the first-person weapon in a second pass (so it never clips walls).
 *
 * Rock walls are one merged mesh whose vertices are displaced by a function
 * of world position, so neighbouring faces stay sealed while the tunnels
 * look hand-hewn. Supports, rails and railings are InstancedMeshes; a fixed
 * pool of point lights follows the lamps nearest the player and a second
 * small pool follows burning flares (constant light counts = no shader
 * recompiles). The flashlight is a single SpotLight. No shadow maps.
 */
import * as THREE from "three";
import { CELL, EYE, WEAPONS, BRUTE, FLARE } from "../engine/sim.js";
import { THEMES } from "../engine/levels.js";
import { wallTexture, floorTexture, ceilingTexture, doorTexture, glowTexture, flashTexture, splatTexture, ringTexture, timberTexture, disposeTextures } from "./textures.js";
import { makeEnemy, poseEnemy, disposeEnemy, makeViewmodel, makeItem, makeNote, makeDeco, makeCart, disposeModels } from "./models.js";

const LIGHT_POOL = 6;
const FLARE_POOL = 3;
const TRACERS = 20;
const LEVER_COL = { red: 0xff3020, blue: 0x3a7aff, green: 0x30e060, yellow: 0xffd020 };

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
/** smooth-ish 3D value noise from hashes, used to roughen the rock */
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a, b, c) => hash(a * 157.31 + b * 311.7 + c * 74.7);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
const rockOffset = (x, y, z) => [(noise3(x * 0.9, y * 0.9, z * 0.9) - 0.5) * 0.5, (noise3(x * 1.3 + 9, y * 1.3, z * 1.3) - 0.5) * 0.25, (noise3(x * 0.9 + 4, y * 0.9 + 2, z * 0.9 + 7) - 0.5) * 0.5];

export function createWorld(container, { preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.autoClear = false;
  renderer.domElement.className = "dm-canvas";
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
  camera.rotation.order = "YXZ";

  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(62, 1, 0.01, 5);
  vmScene.add(new THREE.AmbientLight(0xb0b8c8, 0.9));
  const vmKey = new THREE.DirectionalLight(0xd8e4ff, 1.8);
  vmKey.position.set(1, 2, 1);
  vmScene.add(vmKey);
  const vmWarm = new THREE.PointLight(0xffb060, 0, 3, 1.5);
  vmWarm.position.set(-0.6, 0.4, -0.3);
  vmScene.add(vmWarm);
  const vmMuzzle = new THREE.PointLight(0xffb060, 0, 2.5, 2);
  vmScene.add(vmMuzzle);
  const VM = makeViewmodel();
  vmScene.add(VM.root);
  VM.flashMat.map = flashTexture();

  let L = null;
  let quality = "high";
  let brightness = 1;
  let w = 300, h = 150;
  let time = 0;
  const vmState = { swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0 };
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();

  /* ======================================================== level build */
  function buildLevel(S) {
    disposeLevel();
    const G = S.G;
    const theme = THEMES[S.L.theme] || THEMES.entrance;
    const H = S.H;
    const R = rng(S.id * 991);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.fog);
    scene.fog = new THREE.FogExp2(theme.fog, theme.fogD);
    const disp = [];
    const own = (x) => (disp.push(x), x);
    const W = G.w * CELL, D = G.h * CELL;
    const hemi = new THREE.HemisphereLight(theme.amb, 0x0a0806, theme.ambI);
    scene.add(hemi);

    const solid = (c, r) => {
      const k = G.at(c, r);
      return k === "#" || k === " ";
    };
    const open = (c, r) => c >= 0 && r >= 0 && c < G.w && r < G.h && !solid(c, r);
    const pit = (c, r) => G.at(c, r) === "O";
    const tile = theme.rock === "tile";

    // ---- rock walls: subdivided faces, displaced by world-position noise
    const pos = [], uv = [], idx = [];
    const face = (x0, z0, x1, z1, nx, nz, y0, y1, sub) => {
      const nu = 4, nv = Math.max(3, Math.round((y1 - y0) / 0.8));
      const b = pos.length / 3;
      for (let j = 0; j <= nv; j++)
        for (let i = 0; i <= nu; i++) {
          const t = i / nu, s = j / nv;
          let x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * s, z = z0 + (z1 - z0) * t;
          if (sub) {
            const o = rockOffset(x, y, z);
            // push mostly into the rock so the walkable space never shrinks much
            const into = Math.abs(o[0] * nx + o[2] * nz);
            x += o[0] * (1 - Math.abs(nx)) - nx * into;
            z += o[2] * (1 - Math.abs(nz)) - nz * into;
            y += y > 0.05 && y < H - 0.05 ? o[1] : 0;
          }
          pos.push(x, y, z);
          uv.push((Math.abs(nx) > 0 ? z : x) / 4, y / 3.6);
        }
      for (let j = 0; j < nv; j++)
        for (let i = 0; i < nu; i++) {
          const a = b + j * (nu + 1) + i;
          idx.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
        }
    };
    const wallY0 = (c, r) => (pit(c, r) ? -24 : 0);
    for (let r = 0; r < G.h; r++)
      for (let c = 0; c < G.w; c++) {
        if (!solid(c, r)) continue;
        const x0 = c * CELL, z0 = r * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        if (open(c, r - 1)) face(x1, z0, x0, z0, 0, -1, wallY0(c, r - 1), H, !tile);
        if (open(c, r + 1)) face(x0, z1, x1, z1, 0, 1, wallY0(c, r + 1), H, !tile);
        if (open(c - 1, r)) face(x0, z0, x0, z1, -1, 0, wallY0(c - 1, r), H, !tile);
        if (open(c + 1, r)) face(x1, z1, x1, z0, 1, 0, wallY0(c + 1, r), H, !tile);
      }
    // pit walls: the shaft drops away below every floor edge
    for (let r = 0; r < G.h; r++)
      for (let c = 0; c < G.w; c++) {
        if (!pit(c, r)) continue;
        const x0 = c * CELL, z0 = r * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        const edge = (cc, rr) => open(cc, rr) && !pit(cc, rr);
        if (edge(c, r - 1)) face(x0, z0, x1, z0, 0, 1, -24, 0, true);
        if (edge(c, r + 1)) face(x1, z1, x0, z1, 0, -1, -24, 0, true);
        if (edge(c - 1, r)) face(x0, z1, x0, z0, 1, 0, -24, 0, true);
        if (edge(c + 1, r)) face(x1, z0, x1, z1, -1, 0, -24, 0, true);
      }
    const wg = own(new THREE.BufferGeometry());
    wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    wg.setIndex(idx);
    wg.computeVertexNormals();
    const wallMat = own(new THREE.MeshStandardMaterial({ map: wallTexture(theme.rock), roughness: tile ? 0.55 : 0.95, metalness: 0 }));
    scene.add(new THREE.Mesh(wg, wallMat));

    // ---- floor + ceiling: one quad per open cell (pits get no floor)
    const fpos = [], fuv = [], fidx = [], cpos = [], cuv = [], cidx = [];
    const quad = (P, U, I, x0, z0, y, up) => {
      const b = P.length / 3;
      P.push(x0, y, z0, x0 + CELL, y, z0, x0 + CELL, y, z0 + CELL, x0, y, z0 + CELL);
      U.push(x0 / CELL, z0 / CELL, x0 / CELL + 1, z0 / CELL, x0 / CELL + 1, z0 / CELL + 1, x0 / CELL, z0 / CELL + 1);
      if (up) I.push(b, b + 2, b + 1, b, b + 3, b + 2);
      else I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let r = 0; r < G.h; r++)
      for (let c = 0; c < G.w; c++) {
        if (!open(c, r)) continue;
        if (!pit(c, r)) quad(fpos, fuv, fidx, c * CELL, r * CELL, 0, true);
        quad(cpos, cuv, cidx, c * CELL, r * CELL, H, false);
      }
    const mk = (P, U, I) => {
      const g = own(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
      g.setIndex(I);
      g.computeVertexNormals();
      return g;
    };
    const floorMat = own(new THREE.MeshStandardMaterial({ map: floorTexture(theme.floor), roughness: theme.floor === "metal" || theme.floor === "tile" ? 0.5 : 0.95, metalness: theme.floor === "metal" ? 0.4 : 0 }));
    scene.add(new THREE.Mesh(mk(fpos, fuv, fidx), floorMat));
    scene.add(new THREE.Mesh(mk(cpos, cuv, cidx), own(new THREE.MeshStandardMaterial({ map: ceilingTexture(theme.rock), roughness: 1 }))));
    // pit bottoms: pure black, far down
    if (G.pits.length) {
      const bottom = new THREE.Mesh(own(new THREE.PlaneGeometry(W, D)), own(new THREE.MeshBasicMaterial({ color: 0x000000 })));
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.set(W / 2, -24, D / 2);
      scene.add(bottom);
    }

    // ---- timber supports in narrow tunnels (instanced posts + caps)
    const timberMat = own(new THREE.MeshStandardMaterial({ map: timberTexture(), roughness: 0.9 }));
    if (theme.timber) {
      const spots = [];
      for (let r = 0; r < G.h; r++)
        for (let c = 0; c < G.w; c++) {
          if (!open(c, r) || pit(c, r) || S.doorAt.has(r * G.w + c)) continue;
          const k = G.at(c, r);
          if (k !== "." && k !== "_" && k !== "*") continue;
          const ns = solid(c, r - 1) && solid(c, r + 1);
          const ew = solid(c - 1, r) && solid(c + 1, r);
          if ((ns || ew) && hash(c * 13.1 + r * 7.7) < 0.5) spots.push({ c, r, along: ns ? "x" : "z" });
        }
      const post = own(new THREE.BoxGeometry(0.24, H, 0.24));
      const capG = own(new THREE.BoxGeometry(CELL + 0.1, 0.26, 0.28));
      const posts = new THREE.InstancedMesh(post, timberMat, spots.length * 2);
      const caps = new THREE.InstancedMesh(capG, timberMat, spots.length);
      const m4 = new THREE.Matrix4();
      spots.forEach((sp, i) => {
        const x = sp.c * CELL + CELL / 2, z = sp.r * CELL + CELL / 2;
        // the frame spans the tunnel: posts against both walls, cap under the roof
        for (let k = 0; k < 2; k++) {
          const o = k ? CELL / 2 - 0.14 : -CELL / 2 + 0.14;
          m4.makeRotationZ((k ? 1 : -1) * 0.03);
          m4.setPosition(sp.along === "z" ? x + o : x, H / 2, sp.along === "z" ? z : z + o);
          posts.setMatrixAt(i * 2 + k, m4);
        }
        m4.makeRotationY(sp.along === "z" ? 0 : Math.PI / 2);
        m4.setPosition(x, H - 0.13, z);
        caps.setMatrixAt(i, m4);
      });
      scene.add(posts, caps);
    }
    // ---- rails: sleepers + two steel rails per rail cell
    const railCells = [];
    for (let r = 0; r < G.h; r++) for (let c = 0; c < G.w; c++) if (G.at(c, r) === "_") railCells.push({ c, r, axis: G.at(c - 1, r) === "_" || G.at(c + 1, r) === "_" ? "x" : "z" });
    if (railCells.length) {
      const sleeperG = own(new THREE.BoxGeometry(0.22, 0.08, 1.5));
      const railG = own(new THREE.BoxGeometry(CELL, 0.07, 0.06));
      const sleepers = new THREE.InstancedMesh(sleeperG, timberMat, railCells.length * 3);
      const rails = new THREE.InstancedMesh(railG, own(new THREE.MeshStandardMaterial({ color: 0x6a5a50, metalness: 0.7, roughness: 0.45 })), railCells.length * 2);
      const m4 = new THREE.Matrix4();
      railCells.forEach((rc, i) => {
        const x = rc.c * CELL + CELL / 2, z = rc.r * CELL + CELL / 2;
        const rot = rc.axis === "x" ? 0 : Math.PI / 2;
        for (let k = 0; k < 3; k++) {
          const o = -0.66 + k * 0.66;
          m4.makeRotationY(rot + (hash(i * 3 + k) - 0.5) * 0.15);
          m4.setPosition(rc.axis === "x" ? x + o : x, 0.04, rc.axis === "x" ? z : z + o);
          sleepers.setMatrixAt(i * 3 + k, m4);
        }
        for (let k = 0; k < 2; k++) {
          const o = k ? 0.5 : -0.5;
          m4.makeRotationY(rot);
          m4.setPosition(rc.axis === "x" ? x : x + o, 0.11, rc.axis === "x" ? z + o : z);
          rails.setMatrixAt(i * 2 + k, m4);
        }
      });
      scene.add(sleepers, rails);
    }
    // ---- railings
    if (G.rails.length) {
      const postG = own(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6));
      const barG = own(new THREE.BoxGeometry(CELL, 0.08, 0.08));
      const posts = new THREE.InstancedMesh(postG, timberMat, G.rails.length * 2);
      const bars = new THREE.InstancedMesh(barG, timberMat, G.rails.length * 2);
      const m4 = new THREE.Matrix4();
      G.rails.forEach((b, i) => {
        for (let k = 0; k < 2; k++) {
          const o = k ? CELL / 2 - 0.05 : -CELL / 2 + 0.05;
          m4.makeTranslation(b.axis === "x" ? b.x + o : b.x, 0.55, b.axis === "x" ? b.z : b.z + o);
          posts.setMatrixAt(i * 2 + k, m4);
          const rot = new THREE.Matrix4().makeRotationY(b.axis === "z" ? Math.PI / 2 : 0);
          rot.setPosition(b.x, k ? 1.05 : 0.6, b.z);
          bars.setMatrixAt(i * 2 + k, rot);
        }
      });
      scene.add(posts, bars);
    }
    // ---- shaft edge: low timber kerbs where the floor meets the pit
    if (G.pits.length) {
      const kerbs = [];
      for (const p of G.pits)
        for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (open(p.c + dc, p.r + dr) && !pit(p.c + dc, p.r + dr)) kerbs.push({ x: p.x + dc * (CELL / 2), z: p.z + dr * (CELL / 2), along: dc ? "z" : "x" });
      const kg = own(new THREE.BoxGeometry(CELL, 0.18, 0.18));
      const km = new THREE.InstancedMesh(kg, timberMat, kerbs.length);
      const m4 = new THREE.Matrix4();
      kerbs.forEach((k, i) => {
        m4.makeRotationY(k.along === "z" ? Math.PI / 2 : 0);
        m4.setPosition(k.x, 0.09, k.z);
        km.setMatrixAt(i, m4);
      });
      scene.add(km);
    }

    // ---- doors
    const doors = [];
    const frameMat = own(new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.5, metalness: 0.5 }));
    const panelG = own(new THREE.BoxGeometry(1.7, 2.45, 0.14));
    const postG = own(new THREE.BoxGeometry(0.22, 2.7, 0.32));
    const lintelG = own(new THREE.BoxGeometry(CELL + 0.2, 1, 0.36));
    const lightG = own(new THREE.BoxGeometry(0.16, 0.1, 0.06));
    for (const d of S.doors) {
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      if (d.axis === "z") g.rotation.y = Math.PI / 2;
      const panelMat = own(new THREE.MeshStandardMaterial({ map: doorTexture(d.kind), roughness: 0.6, metalness: d.kind === "door" ? 0.05 : 0.45 }));
      const panel = new THREE.Mesh(panelG, panelMat);
      panel.position.y = 1.225;
      g.add(panel);
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(postG, d.kind === "door" || d.kind === "lock" ? timberMat : frameMat);
        p.position.set(s * 0.95, 1.35, 0);
        g.add(p);
      }
      const lh = H - 2.7;
      if (lh > 0.01) {
        const lin = new THREE.Mesh(lintelG, d.kind === "door" || d.kind === "lock" ? timberMat : wallMat);
        lin.scale.y = lh;
        lin.position.y = 2.7 + lh / 2;
        g.add(lin);
      }
      let lamp = null;
      if (d.kind !== "door") {
        lamp = new THREE.Mesh(lightG, own(new THREE.MeshBasicMaterial({ color: 0xff2a1a })));
        lamp.position.set(0, 2.6, 0.22);
        const lamp2 = new THREE.Mesh(lightG, lamp.material);
        lamp2.position.z = -0.22;
        g.add(lamp, lamp2);
      }
      let padlock = null;
      if (d.kind === "lock") {
        padlock = new THREE.Group();
        const brass = own(new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.7, roughness: 0.3 }));
        const body = new THREE.Mesh(own(new THREE.BoxGeometry(0.22, 0.2, 0.08)), brass);
        const shackle = new THREE.Mesh(own(new THREE.TorusGeometry(0.07, 0.02, 6, 12, Math.PI)), brass);
        shackle.position.y = 0.1;
        padlock.add(body, shackle);
        padlock.position.set(0, 1.2, 0.12);
        g.add(padlock);
      }
      scene.add(g);
      doors.push({ d, g, panel, lamp, padlock });
    }
    // ---- furniture / props
    const spinners = [];
    const machineLamps = new Map();
    for (const dc of G.deco) {
      const m = makeDeco(dc.kind, dc.axis, R, theme);
      m.position.set(dc.x, 0, dc.z);
      scene.add(m);
      if (m.userData.spin) spinners.push(m.userData.spin);
      for (const x of m.userData.disposables || []) disp.push(x);
      if (m.userData.lamp) machineLamps.set(dc.r * G.w + dc.c, m.userData.lamp);
    }
    const machines = S.machines.map((mm) => ({ m: mm, lamp: machineLamps.get(mm.r * G.w + mm.c) }));
    // ---- carts
    const carts = S.carts.map((c) => {
      const m = makeCart();
      const axisX = G.at(c.c - 1, c.r) === "_" || G.at(c.c + 1, c.r) === "_";
      m.root.rotation.y = axisX ? Math.PI / 2 : 0;
      m.root.position.set(c.x, 0, c.z);
      scene.add(m.root);
      return { c, m, lx: c.x, lz: c.z };
    });
    // ---- cracked rock (hidden passages)
    const cracks = S.cracks.map((ck) => {
      const g = new THREE.Group();
      const block = new THREE.Mesh(own(new THREE.BoxGeometry(CELL, H, CELL)), wallMat);
      block.position.y = H / 2;
      g.add(block);
      const glowMat = own(new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.85 }));
      for (let i = 0; i < 6; i++) {
        const line = new THREE.Mesh(own(new THREE.BoxGeometry(0.05, 0.5 + R() * 0.7, CELL + 0.02)), glowMat);
        line.position.set(0, 0.6 + i * 0.3, (R() - 0.5) * 0.9);
        line.rotation.x = (R() - 0.5) * 1.2;
        const l2 = line.clone();
        l2.rotation.y = Math.PI / 2;
        g.add(line, l2);
      }
      g.position.set(ck.x, 0, ck.z);
      scene.add(g);
      return { ck, g, glowMat };
    });
    // ---- items + notes
    const items = new Map();
    for (const it of S.items) addItem(scene, items, it);
    const notes = S.notes.map((n) => {
      const m = makeNote();
      m.root.position.set(n.x, 0, n.z);
      m.root.rotation.y = hash(n.c * 3 + n.r) * 6;
      scene.add(m.root);
      return { n, m };
    });
    // ---- levers + keypads (wall mounted)
    const switches = [];
    const swBoxG = own(new THREE.BoxGeometry(0.5, 0.65, 0.16));
    const swLeverG = own(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 6));
    const swKnobG = own(new THREE.SphereGeometry(0.07, 8, 6));
    const swMat = own(new THREE.MeshStandardMaterial({ color: 0x4a4a46, roughness: 0.5, metalness: 0.5 }));
    for (const s of S.switches) {
      const g = new THREE.Group();
      g.position.set(s.x, 1.35, s.z);
      g.rotation.y = Math.atan2(s.nx, s.nz);
      g.add(new THREE.Mesh(swBoxG, swMat));
      const lever = new THREE.Group();
      lever.position.set(0, -0.05, 0.1);
      const stick = new THREE.Mesh(swLeverG, frameMat);
      stick.position.y = 0.19;
      lever.add(stick);
      const knob = new THREE.Mesh(swKnobG, own(new THREE.MeshStandardMaterial({ color: s.color ? LEVER_COL[s.color] : 0xff4020, roughness: 0.35, emissive: s.color ? new THREE.Color(LEVER_COL[s.color]).multiplyScalar(0.35) : 0x200000 })));
      knob.position.y = 0.38;
      lever.add(knob);
      g.add(lever);
      // a coloured plate under coloured levers
      if (s.color) {
        const plate = new THREE.Mesh(own(new THREE.BoxGeometry(0.42, 0.1, 0.02)), own(new THREE.MeshBasicMaterial({ color: LEVER_COL[s.color] })));
        plate.position.set(0, -0.26, 0.09);
        g.add(plate);
      }
      const lamp = new THREE.Mesh(lightG, own(new THREE.MeshBasicMaterial({ color: 0xff2a1a })));
      lamp.position.set(0, 0.42, 0.06);
      g.add(lamp);
      const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc040, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(1, 1, 1);
      halo.position.z = 0.2;
      g.add(halo);
      scene.add(g);
      switches.push({ s, g, lever, lamp, halo });
    }
    const keypads = S.keypads.map((k) => {
      const g = new THREE.Group();
      g.position.set(k.x, 1.4, k.z);
      g.rotation.y = Math.atan2(k.nx, k.nz);
      g.add(new THREE.Mesh(own(new THREE.BoxGeometry(0.42, 0.6, 0.1)), swMat));
      const screen = new THREE.Mesh(own(new THREE.BoxGeometry(0.3, 0.1, 0.02)), own(new THREE.MeshBasicMaterial({ color: 0xff3020 })));
      screen.position.set(0, 0.18, 0.06);
      g.add(screen);
      const keyMat = own(new THREE.MeshStandardMaterial({ color: 0xc8c8c0, roughness: 0.5 }));
      const keyG = own(new THREE.BoxGeometry(0.07, 0.06, 0.02));
      for (let i = 0; i < 12; i++) {
        const b = new THREE.Mesh(keyG, keyMat);
        b.position.set(-0.09 + (i % 3) * 0.09, 0.05 - Math.floor(i / 3) * 0.075, 0.06);
        g.add(b);
      }
      scene.add(g);
      return { k, screen };
    });
    // ---- light fixtures + pooled point lights
    const fixtures = [];
    const lanternG = own(new THREE.CylinderGeometry(0.11, 0.13, 0.26, 8));
    const cageG = own(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 6, 1, true));
    const alarmG = own(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 10));
    for (const [i, l] of G.lights.entries()) {
      const col = l.kind === "lamp" ? theme.lamp : l.kind === "alarm" ? 0xff2010 : theme.crystal || 0x5ad8ff;
      const g = new THREE.Group();
      let bulb = null, halo = null;
      if (l.kind !== "crystal") {
        // in tall caverns lanterns hang on long chains so their light reaches the floor
        const hang = Math.min(H, 4.5);
        g.position.set(l.x, hang - (l.kind === "lamp" ? 0.75 : 0.12), l.z);
        const mat = own(new THREE.MeshBasicMaterial({ color: col }));
        if (l.kind === "lamp") {
          bulb = new THREE.Mesh(lanternG, mat);
          g.add(bulb);
          g.add(new THREE.Mesh(cageG, own(new THREE.MeshStandardMaterial({ color: 0x2a2620, wireframe: true }))));
          const wireLen = 0.6 + (H - hang);
          const wire = new THREE.Mesh(own(new THREE.CylinderGeometry(0.012, 0.012, wireLen, 4)), frameMat);
          wire.position.y = 0.15 + wireLen / 2;
          g.add(wire);
        } else {
          bulb = new THREE.Mesh(alarmG, mat);
          g.add(bulb);
        }
        halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })));
        halo.scale.set(1.6, 1.6, 1);
        g.add(halo);
        scene.add(g);
      }
      fixtures.push({ l, g, bulb, halo, col, seed: i * 13.7 + 3, base: l.kind === "lamp" ? 16 : l.kind === "alarm" ? 9 : 10, level: 1, y: l.kind === "crystal" ? 1.4 : Math.min(H, 4.5) - 1.0, swing: hash(i) * 6 });
    }
    const pool = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, H > 5 ? 20 : 14, 1.6);
      scene.add(pl);
      pool.push(pl);
    }
    const flarePool = [];
    for (let i = 0; i < FLARE_POOL; i++) {
      const pl = new THREE.PointLight(0xff5a20, 0, 14, 1.6);
      scene.add(pl);
      flarePool.push(pl);
    }
    // flashlight: cold, focused
    const flash = new THREE.SpotLight(0xdce8ff, 0, 26, 0.48, 0.55, 1.1);
    scene.add(flash, flash.target);
    const muzzle = new THREE.PointLight(0xffb060, 0, 9, 2);
    scene.add(muzzle);
    // ---- decals
    const decalG = own(new THREE.PlaneGeometry(1, 1));
    const decalMat = own(new THREE.MeshStandardMaterial({ map: splatTexture(), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    const decals = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(decalG, decalMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      decals.push(m);
    }
    // ---- particles: sparks, dark blood, rock debris, ambient dust motes
    const sparks = makeParticles(own, 160, 0xffd080, true, 0.07, 6);
    const goo = makeParticles(own, 160, 0x3a1a0a, false, 0.08, 9);
    const debris = makeParticles(own, 220, 0x8a7a6a, false, 0.08, 9);
    const embers = makeParticles(own, 120, 0xff7a30, true, 0.08, -0.6);
    scene.add(sparks.points, goo.points, debris.points, embers.points);
    const motesN = 260;
    const motesG = own(new THREE.BufferGeometry());
    const motesP = new Float32Array(motesN * 3);
    for (let i = 0; i < motesN; i++) {
      motesP[i * 3] = S.P.x + (R() - 0.5) * 16;
      motesP[i * 3 + 1] = R() * H;
      motesP[i * 3 + 2] = S.P.z + (R() - 0.5) * 16;
    }
    motesG.setAttribute("position", new THREE.BufferAttribute(motesP, 3));
    const motes = new THREE.Points(motesG, own(new THREE.PointsMaterial({ color: 0xd8d0c0, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false })));
    motes.frustumCulled = false;
    scene.add(motes);
    // ---- tracers, flares
    const tracerG = own(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true));
    tracerG.rotateX(Math.PI / 2);
    const tracerMats = [0xfff0b0, 0xff7a30].map((c) => own(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
    const tracers = [];
    for (let i = 0; i < TRACERS; i++) {
      const m = new THREE.Mesh(tracerG, tracerMats[0]);
      m.visible = false;
      scene.add(m);
      tracers.push({ m, t: 9, life: 0.06, r: 0.012 });
    }
    const flareSprites = [];
    const flareMat = own(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a20, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const flareCore = own(new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    const flareCoreG = own(new THREE.SphereGeometry(0.06, 8, 6));
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(flareMat);
      s.scale.set(1.6, 1.6, 1);
      const core = new THREE.Mesh(flareCoreG, flareCore);
      s.visible = core.visible = false;
      scene.add(s, core);
      flareSprites.push({ s, core });
    }
    // ---- boss FX: dust shockwave rings, thrown rocks + landing marks, charge lane
    const ringMat = own(new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xc8a070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const ringG = own(new THREE.PlaneGeometry(2, 2));
    const waveWallG = own(new THREE.CylinderGeometry(1, 1, 0.6, 48, 1, true));
    const waveWallMat = own(new THREE.MeshBasicMaterial({ color: 0xb08a60, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    const rings = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(ringG, ringMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      const wall = new THREE.Mesh(waveWallG, waveWallMat);
      wall.visible = false;
      scene.add(m, wall);
      rings.push({ m, wall });
    }
    const markMat = own(new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const fillMat = own(new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    const fillG = own(new THREE.CircleGeometry(1, 24));
    const rockG = own(new THREE.DodecahedronGeometry(0.4, 0));
    const rockMat = own(new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 1, flatShading: true }));
    const bombs = [];
    for (let i = 0; i < 8; i++) {
      const mark = new THREE.Mesh(ringG, markMat);
      mark.rotation.x = -Math.PI / 2;
      const fill = new THREE.Mesh(fillG, fillMat);
      fill.rotation.x = -Math.PI / 2;
      const ball = new THREE.Mesh(rockG, rockMat);
      mark.visible = fill.visible = ball.visible = false;
      scene.add(mark, fill, ball);
      bombs.push({ mark, fill, ball });
    }
    const arrow = new THREE.Mesh(own(new THREE.PlaneGeometry(1.8, 1)), own(new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })));
    arrow.rotation.x = -Math.PI / 2;
    arrow.visible = false;
    scene.add(arrow);

    L = { S, scene, disp, doors, items, notes, switches, keypads, machines, carts, cracks, fixtures, pool, flarePool, flash, muzzle, decals, decalI: 0, sparks, goo, debris, embers, motes, motesP, tracers, tracerMats, tracerI: 0, flareSprites, rings, bombs, arrow, spinners, rigs: new Map(), H, theme, hemi, poolT: 0 };
    applyBrightness();
  }

  function addItem(scene, items, it) {
    const m = makeItem(it.kind);
    m.root.position.set(it.x, 0, it.z);
    scene.add(m.root);
    items.set(it.id, m);
  }

  function makeParticles(own, n, color, additive, size, grav) {
    const g = own(new THREE.BufferGeometry());
    const p = new Float32Array(n * 3).fill(-999);
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const m = own(new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.95 }));
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return { points: pts, pos: p, vel: new Float32Array(n * 3), life: new Float32Array(n), i: 0, n, grav };
  }
  function burst(P, x, y, z, count, speed, up = 1, life = 0.5) {
    for (let k = 0; k < count; k++) {
      const i = P.i;
      P.i = (P.i + 1) % P.n;
      P.pos[i * 3] = x;
      P.pos[i * 3 + 1] = y;
      P.pos[i * 3 + 2] = z;
      P.vel[i * 3] = (Math.random() - 0.5) * speed;
      P.vel[i * 3 + 1] = Math.random() * speed * up;
      P.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      P.life[i] = life * (0.6 + Math.random() * 0.8);
    }
  }
  function stepParticles(P, dt) {
    let any = false;
    for (let i = 0; i < P.n; i++) {
      if (P.life[i] <= 0) continue;
      any = true;
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        P.pos[i * 3 + 1] = -999;
        continue;
      }
      P.vel[i * 3 + 1] -= P.grav * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt;
      P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt;
      P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      if (P.pos[i * 3 + 1] < 0.02 && P.grav > 0) {
        P.pos[i * 3 + 1] = 0.02;
        P.vel[i * 3] *= 0.3;
        P.vel[i * 3 + 2] *= 0.3;
        P.vel[i * 3 + 1] = 0;
      }
    }
    if (any || P.dirty) P.points.geometry.attributes.position.needsUpdate = true;
    P.dirty = any;
  }
  function decal(x, z, s) {
    const m = L.decals[L.decalI];
    L.decalI = (L.decalI + 1) % L.decals.length;
    m.visible = true;
    m.position.set(x, 0.015 + L.decalI * 0.0004, z);
    m.rotation.z = Math.random() * Math.PI * 2;
    m.scale.set(s, s, 1);
  }
  function tracer(x0, y0, z0, x1, y1, z1, mat, r, life) {
    const T = L.tracers[L.tracerI];
    L.tracerI = (L.tracerI + 1) % L.tracers.length;
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    if (len < 0.3) return;
    T.m.material = mat;
    T.m.visible = true;
    T.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    T.m.lookAt(x1, y1, z1);
    T.m.scale.set(r, r, len);
    T.t = 0;
    T.life = life;
    T.r = r;
  }
  /** a cloud of falling dust from the ceiling around (x,z) */
  function dustFall(x, z, n = 40) {
    for (let k = 0; k < n; k++) {
      const i = L.debris.i;
      L.debris.i = (L.debris.i + 1) % L.debris.n;
      L.debris.pos[i * 3] = x + (Math.random() - 0.5) * 4;
      L.debris.pos[i * 3 + 1] = L.H - 0.1 - Math.random() * 0.3;
      L.debris.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 4;
      L.debris.vel[i * 3] = (Math.random() - 0.5) * 0.4;
      L.debris.vel[i * 3 + 1] = -Math.random() * 0.5;
      L.debris.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
      L.debris.life[i] = 1.2 + Math.random();
    }
  }

  function disposeLevel() {
    if (!L) return;
    for (const rig of L.rigs.values()) disposeEnemy(rig);
    for (const x of L.disp) x.dispose?.();
    L.scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    L.scene.clear();
    L = null;
  }

  function applyBrightness() {
    if (!L) return;
    L.hemi.intensity = L.theme.ambI * (1.2 + brightness * 1.1);
    renderer.toneMappingExposure = 1.0 + brightness * 0.4;
  }

  function muzzleWorld(S) {
    const P = S.P;
    const cp = Math.cos(P.pitch);
    const fx = -Math.sin(P.yaw) * cp, fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * cp;
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const side = 0.17 * (1 - P.aim);
    return [P.x + fx * 0.7 + rx * side, EYE + P.y + fy * 0.7 - 0.15 * (1 - P.aim * 0.5), P.z + fz * 0.7 + rz * side];
  }

  /* ======================================================== events → FX */
  function onEvents(evs) {
    if (!L) return;
    const S = L.S;
    for (const e of evs) {
      if (e.type === "shot") {
        const [mx, my, mz] = muzzleWorld(S);
        for (const im of e.impacts) {
          if (e.w === "flare") tracer(mx, my, mz, im.x, im.y, im.z, L.tracerMats[1], 0.05, 0.25);
          else if (e.w === "pistol" || Math.random() < 0.35) tracer(mx, my, mz, im.x, im.y, im.z, L.tracerMats[0], 0.01, 0.05);
          if (im.surface === "air") continue;
          if (im.surface === "flesh") burst(L.goo, im.x, im.y, im.z, 6, 3.0, 0.8);
          else {
            burst(L.sparks, im.x, im.y, im.z, 5, 3.5, 0.9, 0.4);
            burst(L.debris, im.x, im.y, im.z, 4, 2.4, 0.8, 0.7);
          }
        }
      } else if (e.type === "edie") {
        const big = e.e.type === "brute";
        burst(L.goo, e.e.x, e.e.D.body * 0.6, e.e.z, big ? 40 : 16, 3, 0.8, 0.8);
        burst(L.debris, e.e.x, e.e.D.body * 0.6, e.e.z, big ? 60 : 10, big ? 5 : 3, 1, 1);
        decal(e.e.x + (Math.random() - 0.5) * 0.4, e.e.z + (Math.random() - 0.5) * 0.4, big ? 3.4 : 1.5);
      } else if (e.type === "ehit" && Math.random() < 0.25) {
        decal(e.e.x + (Math.random() - 0.5), e.e.z + (Math.random() - 0.5), 0.5 + Math.random() * 0.4);
      } else if (e.type === "slam" || e.type === "crash") {
        burst(L.debris, e.e.x, 0.3, e.e.z, 50, 7, 0.7, 1);
        dustFall(e.e.x, e.e.z, 60);
      } else if (e.type === "boom") {
        burst(L.debris, e.x, 0.4, e.z, 40, 6, 1, 1);
        burst(L.sparks, e.x, 0.3, e.z, 14, 5, 0.9);
        decal(e.x, e.z, 2.2);
      } else if (e.type === "spawn") {
        burst(L.debris, e.e.x, 0.3, e.e.z, 26, 3, 1.4, 0.9);
      } else if (e.type === "scare" && (e.kind === "dust" || e.kind === "rocks")) {
        dustFall(e.x, e.z, e.kind === "rocks" ? 90 : 70);
        if (e.kind === "rocks") burst(L.debris, e.x, L.H - 0.5, e.z, 30, 2, 0.2, 1.4);
      } else if (e.type === "crackHit") {
        burst(L.debris, e.ck.x, 1.2, e.ck.z, 8, 3, 0.8, 0.7);
      } else if (e.type === "crack") {
        burst(L.debris, e.ck.x, 1.4, e.ck.z, 90, 6, 1, 1.2);
        dustFall(e.ck.x, e.ck.z, 60);
      } else if (e.type === "machine") {
        burst(L.sparks, e.m.x, 1.2, e.m.z, 30, 4, 1);
      } else if (e.type === "drop") {
        addItem(L.scene, L.items, e.it);
      }
    }
  }

  /* ======================================================== per-frame */
  function updateLevel(S, dt, menu) {
    const P = S.P;
    time += dt;
    const seen = new Set();
    for (const e of S.E) {
      seen.add(e.id);
      let rig = L.rigs.get(e.id);
      if (!rig) {
        rig = makeEnemy(e.type);
        L.scene.add(rig.root);
        L.rigs.set(e.id, rig);
      }
      rig.root.rotation.y = e.yaw;
      poseEnemy(rig, e, time);
      rig.root.position.x = e.x;
      rig.root.position.z = e.z;
      if (e.burnT > 0 && e.alive && Math.random() < dt * 20) burst(L.embers, e.x + (Math.random() - 0.5) * 0.5, e.D.body * Math.random(), e.z + (Math.random() - 0.5) * 0.5, 1, 0.6, 1, 0.8);
    }
    for (const [id, rig] of L.rigs)
      if (!seen.has(id)) {
        L.scene.remove(rig.root);
        disposeEnemy(rig);
        L.rigs.delete(id);
      }
    for (const Dd of L.doors) {
      const d = Dd.d;
      if (d.kind === "door") Dd.panel.position.x = d.open * 1.6;
      else Dd.panel.position.y = 1.225 + d.open * 2.35;
      if (Dd.padlock) Dd.padlock.visible = d.target < 1;
      if (d.kind === "door" && d.bang > 0 && d.target < 1) Dd.panel.position.z = Math.sin(time * 40) * 0.03 * Math.min(1, d.bang);
      if (Dd.lamp) Dd.lamp.material.color.setHex((d.kind === "exit" ? S.exitOpen : d.target >= 1) ? 0x30ff60 : 0xff2a1a);
    }
    for (const it of S.items) {
      const m = L.items.get(it.id);
      if (!m) continue;
      m.root.visible = !it.taken;
      if (it.taken) continue;
      m.body.position.y = 0.12 + Math.sin(time * 2.2 + it.id) * 0.06;
      m.body.rotation.y += dt * 0.9;
      m.halo.material.opacity = 0.4 + Math.sin(time * 3 + it.id) * 0.15;
    }
    for (const nt of L.notes) nt.m.halo.material.opacity = nt.n.read ? 0.12 : 0.3 + Math.sin(time * 2.5) * 0.12;
    for (const sw of L.switches) {
      sw.lever.rotation.x = sw.s.on ? 1.0 : -0.7;
      sw.lamp.material.color.setHex(sw.s.on ? 0x30ff60 : 0xff2a1a);
      sw.halo.visible = !sw.s.on;
      sw.halo.material.opacity = 0.25 + Math.sin(time * 4) * 0.15;
    }
    for (const kp of L.keypads) kp.screen.material.color.setHex(kp.k.solved ? 0x30ff60 : Math.sin(time * 4) > 0 ? 0xff3020 : 0x801008);
    for (const mm of L.machines) if (mm.lamp) mm.lamp.material.color.setHex(mm.m.on ? 0x30ff60 : 0xff2a1a);
    for (const sp of L.spinners) sp.rotation.x += dt * (S.power ? 3 : 0.2);
    for (const cr of L.cracks) {
      cr.g.visible = !cr.ck.broken;
      cr.glowMat.opacity = 0.55 + 0.35 * Math.sin(time * 2 + cr.ck.id);
      cr.g.position.x = cr.ck.x + (cr.ck.hp < 110 ? Math.sin(time * 50) * 0.01 : 0);
    }
    for (const ct of L.carts) {
      const moved = Math.hypot(ct.c.x - ct.lx, ct.c.z - ct.lz);
      ct.lx = ct.c.x;
      ct.lz = ct.c.z;
      ct.m.root.position.set(ct.c.x, 0, ct.c.z);
      for (const wh of ct.m.wheels) wh.rotation.x += moved / 0.17;
    }
    // lights: lanterns flicker, emergency beacons pulse; dark levels wait for the generator
    const out = S.blackout > 0;
    for (const f of L.fixtures) {
      let lv;
      if (f.l.kind === "lamp") {
        const n = hash(Math.floor(time * 8 + f.seed));
        lv = n < 0.04 ? 0.15 : n < 0.08 ? 0.6 : 0.9 + Math.sin(time * 23 + f.seed) * 0.06;
        if (!S.power) lv = 0;
        if (f.g) f.g.rotation.z = Math.sin(time * 0.9 + f.swing) * 0.06;
      } else if (f.l.kind === "alarm") lv = 0.4 + 0.6 * Math.max(0, Math.sin(time * 3.2 + f.seed));
      else lv = 0.75 + 0.25 * Math.sin(time * 1.3 + f.seed);
      if (out) lv = f.l.kind === "alarm" ? lv * 0.6 : lv * 0.05;
      f.level = lv;
      if (f.bulb) {
        f.bulb.material.color.set(f.col).multiplyScalar(0.12 + lv * 0.95);
        f.halo.material.opacity = 0.05 + lv * 0.55;
      }
    }
    L.poolT -= dt;
    if (L.poolT <= 0) {
      L.poolT = 0.25;
      const ref = menu ? camera.position : { x: P.x, z: P.z };
      L.near = L.fixtures
        .map((f) => ({ f, d: (f.l.x - ref.x) ** 2 + (f.l.z - ref.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, LIGHT_POOL)
        .map((o) => o.f);
    }
    for (let i = 0; i < LIGHT_POOL; i++) {
      const pl = L.pool[i];
      const f = L.near?.[i];
      if (!f) {
        pl.intensity = 0;
        continue;
      }
      pl.position.set(f.l.x, f.y, f.l.z);
      pl.color.set(f.col);
      pl.intensity = f.base * f.level * (0.7 + brightness * 0.3);
    }
    const nf = L.near?.[0];
    if (nf) {
      vmWarm.color.set(nf.col);
      vmWarm.intensity = 1.0 * nf.level;
    }
    // flares
    L.flareSprites.forEach((fs, i) => {
      const f = S.flares[S.flares.length - 1 - i];
      fs.s.visible = fs.core.visible = !!f;
      if (!f) return;
      const k = Math.min(1, (f.life - f.t) / 1.2);
      fs.s.position.set(f.x, f.y + 0.1, f.z);
      fs.core.position.set(f.x, f.y + 0.05, f.z);
      const fl = 1.3 + Math.sin(time * 30 + i) * 0.25;
      fs.s.scale.set(fl * k + 0.2, fl * k + 0.2, 1);
      if (Math.random() < dt * 25) burst(L.embers, f.x, f.y + 0.1, f.z, 1, 1.2, 1.5, 0.9);
    });
    for (let i = 0; i < FLARE_POOL; i++) {
      const pl = L.flarePool[i];
      const f = S.flares[S.flares.length - 1 - i];
      if (!f) {
        pl.intensity = 0;
        continue;
      }
      const k = Math.min(1, (f.life - f.t) / 1.2);
      pl.position.set(f.x, f.y + 0.4, f.z);
      pl.intensity = (18 + Math.sin(time * 37 + i) * 4) * k;
    }
    for (const T of L.tracers) {
      if (!T.m.visible) continue;
      T.t += dt;
      if (T.t > T.life) T.m.visible = false;
      else {
        const k = 1 - T.t / T.life;
        T.m.scale.x = T.m.scale.y = T.r * k;
      }
    }
    L.rings.forEach((rg, i) => {
      const R = S.rings[i];
      rg.m.visible = rg.wall.visible = !!R && R.r > 0;
      if (!R || R.r <= 0) return;
      rg.m.position.set(R.x, 0.06, R.z);
      rg.m.scale.set(R.r, R.r, 1);
      rg.wall.position.set(R.x, 0.3, R.z);
      rg.wall.scale.set(R.r, 1, R.r);
      rg.m.material.opacity = 1 - (R.r / R.max) * 0.7;
    });
    L.bombs.forEach((bm, i) => {
      const b = S.bombs[i];
      bm.mark.visible = bm.fill.visible = bm.ball.visible = !!b;
      if (!b) return;
      const k = Math.min(1, b.t / b.T);
      bm.mark.position.set(b.tx, 0.05, b.tz);
      bm.mark.scale.set(b.r, b.r, 1);
      bm.fill.position.set(b.tx, 0.045, b.tz);
      bm.fill.scale.set(b.r * k, b.r * k, 1);
      bm.mark.material.opacity = 0.6 + 0.4 * Math.sin(time * 20);
      bm.ball.position.set(b.sx + (b.tx - b.sx) * k, b.sy * (1 - k) + 0.4 + Math.sin(k * Math.PI) * 4, b.sz + (b.tz - b.sz) * k);
      bm.ball.rotation.x += dt * 6;
      bm.ball.rotation.z += dt * 4;
    });
    const brute = S.E.find((e) => e.type === "brute" && e.alive);
    if (brute && (brute.state === "chargeWind" || brute.state === "charge")) {
      const fx = -Math.sin(brute.yaw), fz = -Math.cos(brute.yaw);
      const len = brute.state === "charge" ? 6 : 12 * Math.min(1, brute.stateT / BRUTE.chargeWind);
      L.arrow.visible = true;
      L.arrow.position.set(brute.x + fx * (len / 2 + 0.8), 0.05, brute.z + fz * (len / 2 + 0.8));
      L.arrow.rotation.z = brute.yaw;
      L.arrow.scale.set(1, len, 1);
      L.arrow.material.opacity = 0.25 + 0.2 * Math.sin(time * 18);
    } else L.arrow.visible = false;
    // dust motes drift around the viewer
    const ref = menu ? camera.position : { x: P.x, z: P.z };
    const mp = L.motesP;
    for (let i = 0; i < mp.length; i += 3) {
      mp[i] += Math.sin(time * 0.3 + i) * dt * 0.08;
      mp[i + 1] -= dt * 0.05;
      mp[i + 2] += Math.cos(time * 0.27 + i) * dt * 0.08;
      if (mp[i + 1] < 0 || Math.abs(mp[i] - ref.x) > 9 || Math.abs(mp[i + 2] - ref.z) > 9) {
        mp[i] = ref.x + (Math.random() - 0.5) * 16;
        mp[i + 1] = L.H * (0.4 + Math.random() * 0.6);
        mp[i + 2] = ref.z + (Math.random() - 0.5) * 16;
      }
    }
    L.motes.geometry.attributes.position.needsUpdate = true;
    stepParticles(L.sparks, dt);
    stepParticles(L.goo, dt);
    stepParticles(L.debris, dt);
    stepParticles(L.embers, dt);
  }

  function updateCamera(S, dt) {
    const P = S.P;
    const bobAmt = Math.min(1, P.moving / 3.8);
    let y = EYE + P.y + Math.sin(P.bob * 2.2) * 0.045 * bobAmt - P.land * 0.12;
    let roll = Math.sin(P.bob * 1.1) * 0.006 * bobAmt;
    let pitch = P.pitch + P.recoil * 0.035;
    let yaw = P.yaw;
    if (!P.alive) {
      L.deathT = (L.deathT || 0) + dt;
      const k = Math.min(1, L.deathT / 0.8);
      y = EYE - k * 1.3;
      roll += k * 0.9;
      pitch += k * 0.4;
    } else L.deathT = 0;
    const sh = S.shake + P.hurtT * 0.4;
    if (sh > 0) {
      yaw += (Math.random() - 0.5) * sh * 0.05;
      pitch += (Math.random() - 0.5) * sh * 0.05;
    }
    camera.position.set(P.x, y, P.z);
    camera.rotation.set(pitch, yaw, roll);
    const fovT = 74 - P.aim * (P.w === "shotgun" ? 10 : 18) + (P.sprinting ? 3 : 0);
    if (Math.abs(camera.fov - fovT) > 0.01) {
      camera.fov += (fovT - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    // flashlight: follows the view with a little lag; dims (never dies) when the battery is flat
    const fl = L.flash;
    fl.position.set(P.x + Math.cos(P.yaw) * 0.22, y - 0.12, P.z - Math.sin(P.yaw) * 0.22);
    const cp = Math.cos(pitch);
    const tx = P.x - Math.sin(yaw) * cp * 6, ty = y + Math.sin(pitch) * 6, tz = P.z - Math.cos(yaw) * cp * 6;
    fl.target.position.x += (tx - fl.target.position.x) * Math.min(1, dt * 18);
    fl.target.position.y += (ty - fl.target.position.y) * Math.min(1, dt * 18);
    fl.target.position.z += (tz - fl.target.position.z) * Math.min(1, dt * 18);
    let fi = P.flash ? 30 * (P.battery > 0 ? 0.55 + 0.45 * Math.min(1, P.battery / 25) : 0.35) : 0;
    if (P.flash && P.battery < 10 && P.battery > 0 && hash(Math.floor(time * 12)) < 0.12) fi *= 0.3; // dying battery stutters
    if (S.blackout > 0) fi *= hash(Math.floor(time * 14)) < 0.45 ? 0.1 : 0.8;
    fl.intensity = P.alive ? fi * (0.8 + brightness * 0.2) : fi * 0.3;
    const ft = P.fireT;
    L.muzzle.color.set(P.w === "flare" ? 0xff6a20 : 0xffb060);
    L.muzzle.intensity = ft < 0.06 ? (P.w === "shotgun" ? 60 : P.w === "flare" ? 45 : 35) * (1 - ft / 0.06) : 0;
    L.muzzle.position.set(P.x - Math.sin(yaw) * 0.8, y - 0.1, P.z - Math.cos(yaw) * 0.8);
  }

  function updateViewmodel(S, dt) {
    const P = S.P;
    const wk = P.w;
    for (const k of Object.keys(VM.guns)) VM.guns[k].visible = k === wk;
    VM.root.visible = P.alive;
    const dyaw = P.yaw - vmState.lastYaw, dp = P.pitch - vmState.lastPitch;
    vmState.lastYaw = P.yaw;
    vmState.lastPitch = P.pitch;
    vmState.swayX += (Math.max(-0.08, Math.min(0.08, dyaw * 0.6)) - vmState.swayX) * Math.min(1, dt * 10);
    vmState.swayY += (Math.max(-0.06, Math.min(0.06, -dp * 0.6)) - vmState.swayY) * Math.min(1, dt * 10);
    const bobAmt = Math.min(1, P.moving / 3.8) * (1 - P.aim * 0.8);
    const bx = Math.sin(P.bob * 1.1) * 0.012 * bobAmt, by = Math.abs(Math.sin(P.bob * 1.1)) * 0.014 * bobAmt;
    const air = P.grounded ? -P.land * 0.04 : Math.max(-0.04, Math.min(0.04, -P.vy * 0.006));
    // lit by the flashlight when it's on, otherwise only by the nearby lamps
    vmKey.intensity = P.flash ? 1.8 : 0.5;
    if (!wk) {
      VM.armR.position.set(0.2 + vmState.swayX + bx, -0.27 + vmState.swayY - by + air, -0.5);
      VM.armR.rotation.set(0.35, 0.25, -0.2);
      VM.armL.position.set(-0.2 + vmState.swayX + bx, -0.27 + vmState.swayY - by + air, -0.5);
      VM.armL.rotation.set(0.35, -0.25, 0.2);
      VM.flash.visible = false;
      vmMuzzle.intensity = 0;
      return;
    }
    const gun = VM.guns[wk];
    const isPistol = wk === "pistol", isShotgun = wk === "shotgun";
    const hip = isPistol ? [0.2, -0.21, -0.5] : isShotgun ? [0.18, -0.2, -0.44] : [0.19, -0.21, -0.46];
    const ads = isPistol ? [0, -0.125, -0.42] : isShotgun ? [0, -0.155, -0.36] : [0, -0.15, -0.4];
    const a = P.aim;
    let x = hip[0] + (ads[0] - hip[0]) * a + vmState.swayX + bx;
    let y = hip[1] + (ads[1] - hip[1]) * a + vmState.swayY - by + air;
    let z = hip[2] + (ads[2] - hip[2]) * a;
    let rx = 0, ry = 0, rz = 0;
    if (P.sprinting) {
      y -= 0.04;
      rx -= 0.25;
      ry += 0.35;
    }
    const kick = Math.max(0, 1 - P.fireT / (isPistol ? 0.12 : 0.24));
    z += kick * (isPistol ? 0.05 : 0.09);
    rx += kick * (isPistol ? 0.22 : 0.34);
    if (P.switchT > 0) {
      y -= (P.switchT / 0.35) * 0.25;
      rx -= (P.switchT / 0.35) * 0.6;
    }
    let lhReload = 0;
    if (P.reloadT > 0 && P.reloadDur > 0) {
      const k = 1 - P.reloadT / P.reloadDur;
      const s = Math.sin(Math.PI * k);
      rx -= 0.5 * s;
      rz += (isPistol ? 0.6 : 0.35) * s;
      y -= 0.05 * s;
      lhReload = s;
      if (isShotgun) VM.pump.position.z = -0.32 + Math.max(0, Math.sin(k * Math.PI * 6)) * 0.06 * s;
    } else if (isShotgun) {
      const pk = P.fireT > 0.25 && P.fireT < 0.6 ? Math.sin(((P.fireT - 0.25) / 0.35) * Math.PI) : 0;
      VM.pump.position.z = -0.32 + pk * 0.09;
    }
    if (wk === "flare") {
      const A = P.ammo.flare;
      VM.glowM.color.setRGB(1, 0.35 + 0.1 * Math.sin(time * 8), 0.1).multiplyScalar(A.mag > 0 ? 1 : 0.2);
    }
    gun.position.set(x, y, z);
    gun.rotation.set(rx, ry, rz);
    VM.armR.position.set(x + 0.02, y - 0.06, z + 0.16);
    VM.armR.rotation.set(rx * 0.6, ry, rz);
    let lx = isPistol ? x - 0.03 : x - 0.04, ly = isPistol ? y - 0.08 : y - 0.04, lz = isPistol ? z + 0.14 : z - 0.1;
    if (isShotgun) lz = z - 0.12 + (VM.pump.position.z + 0.32);
    if (lhReload) {
      ly -= 0.08 * lhReload;
      lz += 0.06 * lhReload;
    }
    VM.armL.position.set(lx, ly, lz);
    VM.armL.rotation.set(rx, 0.25, 0);
    const showFlash = P.fireT < 0.05;
    VM.flash.visible = showFlash;
    vmMuzzle.intensity = showFlash ? 3 : 0;
    if (showFlash) {
      const m = VM.muzzles[wk];
      m.updateWorldMatrix(true, false);
      tmpV.setFromMatrixPosition(m.matrixWorld);
      VM.flash.position.copy(tmpV);
      vmMuzzle.position.copy(tmpV);
      VM.flashMat.color.set(wk === "flare" ? 0xff8a40 : 0xffffff);
      const s = (isPistol ? 0.16 : isShotgun ? 0.3 : 0.26) * (0.8 + Math.random() * 0.4);
      VM.flash.scale.set(s, s, 1);
      VM.flashMat.rotation = Math.random() * Math.PI;
    }
  }

  /* ======================================================== API */
  const api = {
    renderer,
    camera,
    setLevel(S) {
      buildLevel(S);
      vmState.lastYaw = S.P.yaw;
      vmState.lastPitch = S.P.pitch;
    },
    level: () => L,
    onEvents,
    render(S, dt) {
      if (!L || L.S !== S) buildLevel(S);
      updateLevel(S, dt, false);
      updateCamera(S, dt);
      updateViewmodel(S, dt);
      draw(true);
    },
    /** slow drift down the haulage tunnel for the menu background */
    renderMenu(S, dt) {
      if (!L || L.S !== S) buildLevel(S);
      updateLevel(S, dt, true);
      const t = time;
      camera.position.set(4 + ((t * 0.6) % 40), 1.7 + Math.sin(t * 0.5) * 0.04, 3);
      camera.rotation.set(-0.03 + Math.sin(t * 0.21) * 0.03, -Math.PI / 2 + Math.sin(t * 0.13) * 0.25, 0);
      if (camera.fov !== 66) {
        camera.fov = 66;
        camera.updateProjectionMatrix();
      }
      const fl = L.flash;
      fl.position.copy(camera.position);
      fl.target.position.set(camera.position.x + 6, 1.2 + Math.sin(t * 0.4) * 0.4, camera.position.z + Math.sin(t * 0.3) * 1.2);
      fl.intensity = 26 * (hash(Math.floor(t * 6)) < 0.04 ? 0.25 : 1);
      L.muzzle.intensity = 0;
      draw(false);
    },
    resize(nw, nh) {
      w = Math.max(1, nw | 0);
      h = Math.max(1, nh | 0);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      vmCam.aspect = w / h;
      vmCam.updateProjectionMatrix();
    },
    setQuality(q) {
      quality = q;
      renderer.setPixelRatio(q === "low" ? 0.75 : q === "medium" ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w, h, false);
    },
    setBrightness(b) {
      brightness = b;
      applyBrightness();
    },
    project(x, y, z) {
      const v = tmpV.set(x, y, z).project(camera);
      if (v.z > 1) return null;
      return { x: ((v.x + 1) / 2) * renderer.domElement.clientWidth, y: ((1 - v.y) / 2) * renderer.domElement.clientHeight, ok: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
    },
    dispose() {
      disposeLevel();
      VM.root.traverse((o) => o.geometry?.dispose());
      for (const m of VM.mats) m.dispose();
      disposeModels();
      disposeTextures();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };

  function draw(withVm) {
    renderer.clear();
    renderer.render(L.scene, camera);
    if (withVm) {
      renderer.clearDepth();
      renderer.render(vmScene, vmCam);
    }
  }
  void quality;
  void WEAPONS;
  void FLARE;
  return api;
}
