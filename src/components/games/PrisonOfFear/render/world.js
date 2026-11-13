/**
 * Plain Three.js view of the sim. Owns the WebGL renderer, builds the level
 * meshes from the parsed grid, mirrors enemies/doors/items each frame and
 * draws the first-person arms in a second pass (so they never clip walls).
 *
 * Performance notes: walls are one merged mesh, bars one InstancedMesh, and
 * a fixed pool of point lights is re-assigned to the lamps nearest the player
 * (a constant light count means no shader recompiles). No shadow maps.
 */
import * as THREE from "three";
import { CELL, EYE, CEIL, WEAPONS } from "../engine/sim.js";
import { THEMES } from "../engine/levels.js";
import { wallTexture, floorTexture, ceilingTexture, doorTexture, glowTexture, flashTexture, bloodTexture, disposeTextures } from "./textures.js";
import { makeEnemy, poseEnemy, disposeEnemy, makeViewmodel, makeItem, makeDeco, disposeModels } from "./models.js";

const LIGHT_POOL = 6;
const OUT_H = 5.5;

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

export function createWorld(container, { preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.autoClear = false;
  renderer.domElement.className = "pf-canvas";
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);
  camera.rotation.order = "YXZ";

  // ---------------------------------------------------------- viewmodel scene
  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(62, 1, 0.01, 5);
  vmScene.add(new THREE.AmbientLight(0xb0b8c8, 1.6));
  const vmKey = new THREE.DirectionalLight(0xffe8d0, 2.4);
  vmKey.position.set(1, 2, 1);
  vmScene.add(vmKey);
  const vmMuzzle = new THREE.PointLight(0xffb060, 0, 2.5, 2);
  vmScene.add(vmMuzzle);
  const VM = makeViewmodel();
  vmScene.add(VM.root);
  VM.flashMat.map = flashTexture();

  let L = null; // current level build
  let quality = "high";
  let brightness = 1;
  let w = 300, h = 150;
  let time = 0;
  const vmState = { swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0, punchSide: 1 };

  /* ======================================================== level build */
  function buildLevel(S) {
    disposeLevel();
    const G = S.G;
    const theme = THEMES[S.L.theme] || THEMES.block;
    const outdoor = !!theme.outdoor;
    const H = outdoor ? OUT_H : CEIL;
    const R = rng(S.id * 991);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.fog);
    scene.fog = new THREE.FogExp2(theme.fog, theme.fogD);
    const disp = [];
    const own = (x) => (disp.push(x), x);

    const hemi = new THREE.HemisphereLight(theme.amb, 0x0a0806, theme.ambI);
    scene.add(hemi);
    if (outdoor) {
      const moon = new THREE.DirectionalLight(0x8aa0d0, 0.9);
      moon.position.set(-20, 40, 10);
      scene.add(moon);
      // stars
      const sg = own(new THREE.BufferGeometry());
      const pos = [];
      for (let i = 0; i < 400; i++) {
        const a = R() * Math.PI * 2, e = 0.25 + R() * 1.2, r = 70;
        pos.push(Math.cos(a) * Math.cos(e) * r + G.w, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r + G.h);
      }
      sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const stars = new THREE.Points(sg, own(new THREE.PointsMaterial({ color: 0xcfd8ff, size: 0.35, fog: false })));
      scene.add(stars);
    }

    // ---- walls: one merged mesh of the faces that border open cells
    const isSolid = (c, r) => {
      const k = G.at(c, r);
      return k === "#" || k === " ";
    };
    const pos = [], uv = [], nor = [], idx = [];
    const quad = (x0, z0, x1, z1, nx, nz, y0, y1) => {
      const b = pos.length / 3;
      pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
      const v0 = y0 / CEIL, v1 = y1 / CEIL;
      uv.push(0, v0, 1, v0, 1, v1, 0, v1);
      for (let i = 0; i < 4; i++) nor.push(nx, 0, nz);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let r = 0; r < G.h; r++)
      for (let c = 0; c < G.w; c++) {
        if (!isSolid(c, r)) continue;
        const x0 = c * CELL, z0 = r * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        if (!isSolid(c, r - 1) && r > 0) quad(x1, z0, x0, z0, 0, -1, 0, H);
        if (!isSolid(c, r + 1) && r < G.h - 1) quad(x0, z1, x1, z1, 0, 1, 0, H);
        if (!isSolid(c - 1, r) && c > 0) quad(x0, z0, x0, z1, -1, 0, 0, H);
        if (!isSolid(c + 1, r) && c < G.w - 1) quad(x1, z1, x1, z0, 1, 0, 0, H);
      }
    const wg = own(new THREE.BufferGeometry());
    wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    wg.setIndex(idx);
    const wallMat = own(new THREE.MeshStandardMaterial({ map: wallTexture(theme.wall), roughness: 0.92, metalness: 0.05 }));
    scene.add(new THREE.Mesh(wg, wallMat));
    // wall tops outdoors (so the yard walls have thickness when seen from below)
    // ---- floor & ceiling
    const fg = own(new THREE.PlaneGeometry(G.w * CELL, G.h * CELL));
    scaleUv(fg, G.w, G.h);
    const floorMat = own(new THREE.MeshStandardMaterial({ map: floorTexture(theme.floor), roughness: theme.floor === "wet" ? 0.45 : 0.9, metalness: theme.floor === "wet" ? 0.2 : 0 }));
    const floor = new THREE.Mesh(fg, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((G.w * CELL) / 2, 0, (G.h * CELL) / 2);
    scene.add(floor);
    if (!outdoor) {
      const cg = own(new THREE.PlaneGeometry(G.w * CELL, G.h * CELL));
      scaleUv(cg, G.w, G.h);
      const ceil = new THREE.Mesh(cg, own(new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 1 })));
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set((G.w * CELL) / 2, H, (G.h * CELL) / 2);
      scene.add(ceil);
    }
    // ---- puddles
    if (G.puddles.length) {
      const pm = own(new THREE.MeshStandardMaterial({ color: 0x0c1412, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.85 }));
      const pg = own(new THREE.CircleGeometry(0.9, 18));
      for (const p of G.puddles) {
        const m = new THREE.Mesh(pg, pm);
        m.rotation.x = -Math.PI / 2;
        m.position.set(p.x + (R() - 0.5) * 0.5, 0.012, p.z + (R() - 0.5) * 0.5);
        m.scale.set(0.8 + R() * 0.6, 0.6 + R() * 0.6, 1);
        scene.add(m);
      }
    }
    // ---- bars (instanced)
    const barH = outdoor ? 3.2 : H;
    if (G.bars.length) {
      const per = 11;
      const bg = own(new THREE.CylinderGeometry(0.025, 0.025, barH, 6));
      const bm = own(new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.45, metalness: 0.35 }));
      const inst = new THREE.InstancedMesh(bg, bm, G.bars.length * per);
      const m4 = new THREE.Matrix4();
      let n = 0;
      const railG = own(new THREE.BoxGeometry(CELL, 0.08, 0.08));
      for (const b of G.bars) {
        for (let i = 0; i < per; i++) {
          const o = -CELL / 2 + ((i + 0.5) * CELL) / per;
          m4.makeTranslation(b.axis === "x" ? b.x + o : b.x, barH / 2, b.axis === "x" ? b.z : b.z + o);
          inst.setMatrixAt(n++, m4);
        }
        for (const y of [0.1, 1.1, barH - 0.1]) {
          const rail = new THREE.Mesh(railG, bm);
          rail.position.set(b.x, y, b.z);
          if (b.axis === "z") rail.rotation.y = Math.PI / 2;
          scene.add(rail);
        }
      }
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    }
    // ---- doors
    const doors = [];
    const frameMat = own(new THREE.MeshStandardMaterial({ color: 0x3c3e40, roughness: 0.5, metalness: 0.35 }));
    const panelG = own(new THREE.BoxGeometry(1.7, 2.45, 0.12));
    const postG = own(new THREE.BoxGeometry(0.16, 2.6, 0.3));
    const lintelG = own(new THREE.BoxGeometry(CELL, 1, 0.34));
    const lightG = own(new THREE.BoxGeometry(0.16, 0.1, 0.06));
    for (const d of S.doors) {
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      if (d.axis === "z") g.rotation.y = Math.PI / 2;
      const panelMat = own(new THREE.MeshStandardMaterial({ map: doorTexture(d.kind), roughness: 0.6, metalness: 0.25 }));
      const panel = new THREE.Mesh(panelG, panelMat);
      panel.position.y = 1.225;
      g.add(panel);
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(postG, frameMat);
        p.position.set(s * 0.92, 1.3, 0);
        g.add(p);
      }
      const lh = H - 2.6;
      if (lh > 0.01) {
        const lin = new THREE.Mesh(lintelG, wallMat);
        lin.scale.y = lh;
        lin.position.y = 2.6 + lh / 2;
        g.add(lin);
      }
      let lamp = null;
      if (d.kind !== "door") {
        lamp = new THREE.Mesh(lightG, own(new THREE.MeshBasicMaterial({ color: 0xff2a1a })));
        lamp.position.set(0, 2.5, 0.2);
        const lamp2 = lamp.clone();
        lamp2.position.z = -0.2;
        g.add(lamp, lamp2);
        lamp.userData.twin = lamp2;
      }
      scene.add(g);
      doors.push({ d, g, panel, lamp });
    }
    // ---- furniture
    for (const dc of G.deco) {
      const m = makeDeco(dc.kind, dc.axis, R);
      m.position.set(dc.x, 0, dc.z);
      if (dc.kind === "l") {
        // push lockers against the nearest wall
        const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const wd = dirs.find(([a, b]) => G.at(dc.c + a, dc.r + b) === "#");
        if (wd) {
          m.position.x += wd[0] * 0.65;
          m.position.z += wd[1] * 0.65;
          m.rotation.y = wd[0] ? Math.PI / 2 : 0;
        }
      }
      scene.add(m);
    }
    // ---- items
    const items = new Map();
    for (const it of S.items) {
      const m = makeItem(it.kind);
      m.root.position.set(it.x, 0, it.z);
      scene.add(m.root);
      items.set(it.id, m);
    }
    // ---- switches
    const switches = [];
    const swBoxG = own(new THREE.BoxGeometry(0.4, 0.55, 0.12));
    const swLeverG = own(new THREE.BoxGeometry(0.06, 0.26, 0.06));
    const swMat = own(new THREE.MeshStandardMaterial({ color: 0x6c6a4a, roughness: 0.5, metalness: 0.3 }));
    for (const s of S.switches) {
      const g = new THREE.Group();
      g.position.set(s.x, 1.35, s.z);
      g.rotation.y = Math.atan2(s.nx, s.nz);
      g.add(new THREE.Mesh(swBoxG, swMat));
      const lever = new THREE.Mesh(swLeverG, frameMat);
      lever.position.set(0, 0, 0.1);
      g.add(lever);
      const lamp = new THREE.Mesh(lightG, own(new THREE.MeshBasicMaterial({ color: 0xff2a1a })));
      lamp.position.set(0, 0.36, 0.04);
      g.add(lamp);
      const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc040, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(0.9, 0.9, 1);
      halo.position.z = 0.15;
      g.add(halo);
      scene.add(g);
      switches.push({ s, g, lever, lamp, halo });
    }
    // ---- light fixtures + the pooled point lights
    const fixtures = [];
    const lampHouseG = own(new THREE.BoxGeometry(0.9, 0.12, 0.3));
    const lampBulbMat = own(new THREE.MeshBasicMaterial({ color: theme.lamp }));
    const alarmG = own(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 10));
    const alarmMat = own(new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    const poleG = own(new THREE.CylinderGeometry(0.08, 0.1, OUT_H - 0.6, 8));
    for (const [i, l] of G.lights.entries()) {
      const g = new THREE.Group();
      const y = outdoor ? OUT_H - 0.7 : H - 0.06;
      g.position.set(l.x, y, l.z);
      let bulb;
      if (l.kind === "lamp") {
        g.add(new THREE.Mesh(lampHouseG, frameMat));
        bulb = new THREE.Mesh(own(new THREE.BoxGeometry(0.8, 0.03, 0.2)), lampBulbMat.clone());
        own(bulb.material);
        bulb.position.y = -0.07;
        g.add(bulb);
        if (outdoor) {
          const pole = new THREE.Mesh(poleG, frameMat);
          pole.position.y = -(OUT_H - 0.6) / 2;
          g.add(pole);
        }
      } else {
        bulb = new THREE.Mesh(alarmG, alarmMat.clone());
        own(bulb.material);
        bulb.position.y = -0.09;
        g.add(bulb);
        if (outdoor) {
          const pole = new THREE.Mesh(poleG, frameMat);
          pole.position.y = -(OUT_H - 0.6) / 2 - 0.15;
          g.add(pole);
        }
      }
      const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture(), color: l.kind === "lamp" ? theme.lamp : 0xff2010, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(1.4, 1.4, 1);
      halo.position.y = -0.2;
      g.add(halo);
      scene.add(g);
      fixtures.push({ l, g, bulb, halo, seed: i * 13.7 + 3, base: l.kind === "lamp" ? (outdoor ? 34 : 16) : 9, level: 1 });
    }
    const pool = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, outdoor ? 20 : 13, 1.7);
      scene.add(pl);
      pool.push(pl);
    }
    // flashlight
    const flash = new THREE.SpotLight(0xfff2dc, 0, 24, 0.5, 0.75, 1.2);
    scene.add(flash, flash.target);
    const muzzle = new THREE.PointLight(0xffb060, 0, 9, 2);
    scene.add(muzzle);
    // ---- blood decals
    const decalG = own(new THREE.PlaneGeometry(1, 1));
    const decalMat = own(new THREE.MeshStandardMaterial({ map: bloodTexture(), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }));
    const decals = [];
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(decalG, decalMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      decals.push(m);
    }
    // ---- particles
    const sparks = makeParticles(own, 140, 0xffd080, true, 0.07);
    const blood = makeParticles(own, 160, 0x8a0808, false, 0.09);
    scene.add(sparks.points, blood.points);

    L = { S, scene, disp, doors, items, switches, fixtures, pool, flash, muzzle, decals, decalI: 0, sparks, blood, rigs: new Map(), outdoor, H, theme, hemi, poolT: 0 };
    applyBrightness();
  }

  function makeParticles(own, n, color, additive, size) {
    const g = own(new THREE.BufferGeometry());
    const p = new Float32Array(n * 3).fill(-999);
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const m = own(new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.9 }));
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return { points: pts, pos: p, vel: new Float32Array(n * 3), life: new Float32Array(n), i: 0, n, grav: additive ? 6 : 9 };
  }
  function burst(P, x, y, z, count, speed, up = 1) {
    for (let k = 0; k < count; k++) {
      const i = P.i;
      P.i = (P.i + 1) % P.n;
      P.pos[i * 3] = x;
      P.pos[i * 3 + 1] = y;
      P.pos[i * 3 + 2] = z;
      P.vel[i * 3] = (Math.random() - 0.5) * speed;
      P.vel[i * 3 + 1] = Math.random() * speed * up;
      P.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      P.life[i] = 0.35 + Math.random() * 0.4;
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
      if (P.pos[i * 3 + 1] < 0.02) {
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

  function scaleUv(g, sx, sy) {
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * sx, a.getY(i) * sy);
  }

  function disposeLevel() {
    if (!L) return;
    for (const rig of L.rigs.values()) disposeEnemy(rig);
    for (const x of L.disp) x.dispose?.();
    L.scene.clear();
    L = null;
  }

  function applyBrightness() {
    if (!L) return;
    L.hemi.intensity = L.theme.ambI * (1.3 + brightness * 1.1);
    renderer.toneMappingExposure = 1.0 + brightness * 0.35;
  }

  /* ======================================================== events → FX */
  function onEvents(evs) {
    if (!L) return;
    for (const e of evs) {
      if (e.type === "shot") {
        for (const im of e.impacts) {
          if (im.surface === "flesh") burst(L.blood, im.x, im.y, im.z, 7, 3.2, 0.8);
          else burst(L.sparks, im.x, im.y, im.z, 5, 3.5, 0.9);
        }
      } else if (e.type === "punchHit") {
        burst(L.blood, e.x, e.y, e.z, 10, 2.6, 0.6);
      } else if (e.type === "edie") {
        burst(L.blood, e.e.x, e.e.D.body * 0.7, e.e.z, 18, 3, 0.8);
        decal(e.e.x + (Math.random() - 0.5) * 0.4, e.e.z + (Math.random() - 0.5) * 0.4, e.e.type === "brute" ? 2.6 : 1.5);
      } else if (e.type === "ehit" && Math.random() < 0.35) {
        decal(e.e.x + (Math.random() - 0.5), e.e.z + (Math.random() - 0.5), 0.5 + Math.random() * 0.4);
      } else if (e.type === "strike" && e.e.type === "brute") {
        burst(L.sparks, e.e.x - Math.sin(e.e.yaw) * 1.4, 0.1, e.e.z - Math.cos(e.e.yaw) * 1.4, 14, 4, 0.6);
      }
    }
  }

  /* ======================================================== per-frame */
  function updateLevel(S, dt, menu) {
    const P = S.P;
    time += dt;
    // enemies
    const seen = new Set();
    for (const e of S.E) {
      seen.add(e.id);
      let rig = L.rigs.get(e.id);
      if (!rig) {
        rig = makeEnemy(e.type);
        L.scene.add(rig.root);
        L.rigs.set(e.id, rig);
      }
      rig.root.position.set(e.x, rig.root.position.y, e.z);
      rig.root.rotation.y = e.yaw;
      poseEnemy(rig, e, time);
      rig.root.position.x = e.x;
      rig.root.position.z = e.z;
    }
    for (const [id, rig] of L.rigs)
      if (!seen.has(id)) {
        L.scene.remove(rig.root);
        disposeEnemy(rig);
        L.rigs.delete(id);
      }
    // doors
    for (const D of L.doors) {
      const d = D.d;
      if (d.kind === "gate") D.panel.position.y = 1.225 + d.open * 2.3;
      else D.panel.position.x = d.open * 1.6;
      if (d.kind === "door" && d.bang > 0 && d.target < 1) D.panel.position.z = Math.sin(time * 40) * 0.03 * Math.min(1, d.bang);
      if (D.lamp) {
        const green = d.kind === "exit" ? S.exitOpen : d.target >= 1;
        const col = green ? 0x30ff60 : 0xff2a1a;
        D.lamp.material.color.setHex(col);
      }
    }
    // items
    for (const it of S.items) {
      const m = L.items.get(it.id);
      if (!m) continue;
      m.root.visible = !it.taken;
      if (it.taken) continue;
      m.body.position.y = 0.12 + Math.sin(time * 2.2 + it.id) * 0.06;
      m.body.rotation.y += dt * 0.9;
      m.halo.material.opacity = 0.35 + Math.sin(time * 3 + it.id) * 0.15;
    }
    // switches
    for (const sw of L.switches) {
      sw.lever.rotation.x = sw.s.on ? 0.9 : -0.6;
      sw.lamp.material.color.setHex(sw.s.on ? 0x30ff60 : 0xff2a1a);
      sw.halo.visible = !sw.s.on;
      sw.halo.material.opacity = 0.25 + Math.sin(time * 4) * 0.15;
    }
    // lamps: flicker + blackout
    const out = S.blackout > 0;
    for (const f of L.fixtures) {
      let lv;
      if (f.l.kind === "lamp") {
        const n = hash(Math.floor(time * 9 + f.seed));
        lv = n < 0.06 ? 0.08 : n < 0.12 ? 0.55 : 0.92 + Math.sin(time * 31 + f.seed) * 0.04;
        if (f.seed % 3 < 1) lv *= 0.85 + 0.15 * Math.sin(time * 2 + f.seed); // steadier lamps
      } else lv = 0.45 + 0.55 * Math.max(0, Math.sin(time * 3.2 + f.seed));
      if (out) lv = f.l.kind === "alarm" ? lv * 0.6 : 0.02;
      f.level = lv;
      f.bulb.material.color.setScalar(0.25 + lv * 0.9);
      if (f.l.kind === "alarm") f.bulb.material.color.setRGB(0.4 + lv, 0.05, 0.03);
      else f.bulb.material.color.set(L.theme.lamp).multiplyScalar(0.2 + lv * 0.9);
      f.halo.material.opacity = 0.15 + lv * 0.45;
    }
    // light pool: nearest fixtures
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
      pl.position.set(f.l.x, f.g.position.y - 0.35, f.l.z);
      pl.color.set(f.l.kind === "lamp" ? L.theme.lamp : 0xff2010);
      pl.intensity = f.base * f.level * (0.7 + brightness * 0.3);
    }
    stepParticles(L.sparks, dt);
    stepParticles(L.blood, dt);
  }

  function updateCamera(S, dt) {
    const P = S.P;
    const bobAmt = Math.min(1, P.moving / 3.7);
    let y = EYE + Math.sin(P.bob * 2.2) * 0.045 * bobAmt;
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
    const fovT = 72 - P.aim * (P.w === "pistol" ? 16 : 10);
    if (Math.abs(camera.fov - fovT) > 0.01) {
      camera.fov = fovT;
      camera.updateProjectionMatrix();
    }
    // flashlight follows the view with a little lag
    const fl = L.flash;
    fl.position.set(P.x + Math.cos(P.yaw) * 0.2, y - 0.15, P.z - Math.sin(P.yaw) * 0.2);
    const cp = Math.cos(pitch);
    const tx = P.x - Math.sin(yaw) * cp * 6, ty = y + Math.sin(pitch) * 6, tz = P.z - Math.cos(yaw) * cp * 6;
    fl.target.position.x += (tx - fl.target.position.x) * Math.min(1, dt * 18);
    fl.target.position.y += (ty - fl.target.position.y) * Math.min(1, dt * 18);
    fl.target.position.z += (tz - fl.target.position.z) * Math.min(1, dt * 18);
    let fi = L.outdoor ? 12 : 15;
    if (S.blackout > 0) fi *= hash(Math.floor(time * 14)) < 0.45 ? 0.05 : 0.6;
    fl.intensity = P.alive ? fi * (0.75 + brightness * 0.25) : fi * 0.3;
    // muzzle light
    const ft = P.fireT;
    L.muzzle.intensity = ft < 0.06 ? (P.w === "shotgun" ? 60 : 35) * (1 - ft / 0.06) : 0;
    L.muzzle.position.set(P.x - Math.sin(yaw) * 0.8, y - 0.1, P.z - Math.cos(yaw) * 0.8);
  }

  function updateViewmodel(S, dt) {
    const P = S.P;
    const W = WEAPONS[P.w];
    const isPistol = P.w === "pistol";
    VM.pistol.visible = isPistol;
    VM.shotgun.visible = !isPistol;
    const gun = isPistol ? VM.pistol : VM.shotgun;
    // sway from look motion
    const dyaw = P.yaw - vmState.lastYaw, dp = P.pitch - vmState.lastPitch;
    vmState.lastYaw = P.yaw;
    vmState.lastPitch = P.pitch;
    vmState.swayX += (Math.max(-0.08, Math.min(0.08, dyaw * 0.6)) - vmState.swayX) * Math.min(1, dt * 10);
    vmState.swayY += (Math.max(-0.06, Math.min(0.06, -dp * 0.6)) - vmState.swayY) * Math.min(1, dt * 10);
    const bobAmt = Math.min(1, P.moving / 3.7) * (1 - P.aim * 0.8);
    const bx = Math.sin(P.bob * 1.1) * 0.012 * bobAmt, by = Math.abs(Math.sin(P.bob * 1.1)) * 0.014 * bobAmt;
    const hip = isPistol ? [0.2, -0.21, -0.5] : [0.18, -0.2, -0.44];
    const ads = isPistol ? [0, -0.125, -0.42] : [0, -0.155, -0.36];
    const a = P.aim;
    let x = hip[0] + (ads[0] - hip[0]) * a + vmState.swayX + bx;
    let y = hip[1] + (ads[1] - hip[1]) * a + vmState.swayY - by;
    let z = hip[2] + (ads[2] - hip[2]) * a;
    let rx = 0, ry = 0, rz = 0;
    // sprint lowers and tilts
    if (P.sprinting) {
      y -= 0.04;
      rx -= 0.25;
      ry += 0.35;
    }
    // recoil
    const kick = Math.max(0, 1 - P.fireT / (isPistol ? 0.12 : 0.22));
    z += kick * (isPistol ? 0.05 : 0.09);
    rx += kick * (isPistol ? 0.22 : 0.32);
    // switching
    if (P.switchT > 0) {
      y -= (P.switchT / 0.35) * 0.25;
      rx -= (P.switchT / 0.35) * 0.6;
    }
    // reload: tilt down & roll
    let lhReload = 0;
    if (P.reloadT > 0 && P.reloadDur > 0) {
      const k = 1 - P.reloadT / P.reloadDur;
      const s = Math.sin(Math.PI * k);
      rx -= 0.5 * s;
      rz += (isPistol ? 0.6 : 0.35) * s;
      y -= 0.05 * s;
      lhReload = s;
      if (!isPistol) VM.pump.position.z = -0.32 + Math.max(0, Math.sin(k * Math.PI * 6)) * 0.06 * s;
    } else if (!isPistol) {
      // pump after a shot
      const pk = P.fireT > 0.25 && P.fireT < 0.6 ? Math.sin(((P.fireT - 0.25) / 0.35) * Math.PI) : 0;
      VM.pump.position.z = -0.32 + pk * 0.09;
    }
    // block: lower the gun, raise the arms
    const b = P.blockAmt;
    y -= b * 0.18;
    rx -= b * 0.5;
    gun.position.set(x, y, z);
    gun.rotation.set(rx, ry, rz);
    // arms: right hand on the grip, left supports
    const pt = P.punchT, pd = 0.32;
    const punching = pt < pd;
    const ext = punching ? Math.sin(Math.PI * Math.min(1, pt / pd)) : 0;
    const leftPunch = punching && P.combo !== 2;
    const rightPunch = punching && P.combo === 2;
    // right arm follows the gun grip
    VM.armR.position.set(x + 0.02, y - 0.06, z + 0.16);
    VM.armR.rotation.set(rx * 0.6, ry, rz);
    if (rightPunch) {
      gun.position.z -= ext * 0.22;
      gun.position.x -= ext * 0.1;
      gun.rotation.z += ext * 0.7;
      VM.armR.position.z -= ext * 0.22;
      VM.armR.position.x -= ext * 0.1;
    }
    // left arm
    let lx = isPistol ? x - 0.03 : x - 0.04, ly = isPistol ? y - 0.08 : y - 0.04, lz = isPistol ? z + 0.14 : z - 0.1;
    let lrx = rx, lry = 0.25, lrz = 0;
    if (!isPistol) lz = z - 0.12 + (VM.pump.position.z + 0.32);
    if (lhReload) {
      ly -= 0.08 * lhReload;
      lz += 0.06 * lhReload;
    }
    if (leftPunch) {
      const heavy = P.combo === 3;
      lx = -0.12 + ext * 0.1;
      ly = -0.2 + ext * (heavy ? 0.12 : 0.06);
      lz = -0.25 - ext * 0.38;
      lrx = heavy ? ext * 0.7 : 0;
      lry = 0.1;
    }
    if (b > 0.02) {
      // forearms crossed in front of the face
      lx = lx + (-0.06 - lx) * b;
      ly = ly + (-0.07 - ly) * b;
      lz = lz + (-0.28 - lz) * b;
      lry = lry + (1.2 - lry) * b;
      lrz = lrz + (0.3 - lrz) * b;
      VM.armR.position.set(VM.armR.position.x + (0.06 - VM.armR.position.x) * b, VM.armR.position.y + (-0.12 - VM.armR.position.y) * b, VM.armR.position.z + (-0.25 - VM.armR.position.z) * b);
      VM.armR.rotation.y += (-1.2 - VM.armR.rotation.y) * b;
    }
    VM.armL.position.set(lx, ly, lz);
    VM.armL.rotation.set(lrx, lry, lrz);
    // muzzle flash
    const showFlash = P.fireT < 0.05;
    VM.flash.visible = showFlash;
    vmMuzzle.intensity = showFlash ? 3 : 0;
    if (showFlash) {
      const m = VM.muzzles[P.w];
      m.updateWorldMatrix(true, false);
      const wp = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
      VM.flash.position.copy(wp);
      vmMuzzle.position.copy(wp);
      const s = (isPistol ? 0.16 : 0.3) * (0.8 + Math.random() * 0.4);
      VM.flash.scale.set(s, s, 1);
      VM.flashMat.rotation = Math.random() * Math.PI;
    }
    VM.root.visible = P.alive;
    void W;
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
    /** slow drift through the current level for the menu background */
    renderMenu(S, dt) {
      if (!L || L.S !== S) buildLevel(S);
      updateLevel(S, dt, true);
      const t = time;
      const x = 7 + Math.sin(t * 0.07) * 4, z = 11.6;
      camera.position.set(x + 14, 1.7 + Math.sin(t * 0.5) * 0.03, z);
      camera.rotation.set(-0.04 + Math.sin(t * 0.21) * 0.03, Math.PI / 2 + 0.25 + Math.sin(t * 0.13) * 0.35, 0);
      if (camera.fov !== 66) {
        camera.fov = 66;
        camera.updateProjectionMatrix();
      }
      L.flash.position.copy(camera.position);
      L.flash.target.position.set(camera.position.x - 6, 1.2, camera.position.z + Math.sin(t * 0.3) * 2);
      L.flash.intensity = 30 * (hash(Math.floor(t * 6)) < 0.05 ? 0.2 : 1);
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
    /** world → CSS pixels within the canvas; null when behind the camera */
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
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
  return api;
}
