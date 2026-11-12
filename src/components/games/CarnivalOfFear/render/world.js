/**
 * Plain Three.js view of the sim. Owns the WebGL renderer, builds the level
 * meshes from the parsed grid, mirrors enemies/doors/items each frame and
 * draws the first-person weapon in a second pass (so it never clips walls).
 *
 * Performance notes: walls are one merged mesh; railings, string lights,
 * hazard plates and ride bulbs are InstancedMeshes; a fixed pool of coloured
 * point lights is re-assigned to the neon lamps nearest the player (a
 * constant light count means no shader recompiles). No shadow maps.
 */
import * as THREE from "three";
import { CELL, EYE, WEAPONS, hazardState, KING } from "../engine/sim.js";
import { THEMES } from "../engine/levels.js";
import { wallTexture, floorTexture, ceilingTexture, doorTexture, glowTexture, flashTexture, splatTexture, ringTexture, skyTexture, skylineTexture, disposeTextures } from "./textures.js";
import { makeEnemy, poseEnemy, disposeEnemy, makeViewmodel, makeItem, makeDeco, makeCarousel, makeFerris, makeArch, makePopup, disposeModels, ITEM_GLOW } from "./models.js";

const LIGHT_POOL = 6;
const TRACERS = 24;
const CONFETTI = [0xff3b5c, 0xffc23b, 0x5a8cff, 0xb04aff, 0x3bffe0, 0xffffff];

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
  renderer.domElement.className = "cf-canvas";
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 140);
  camera.rotation.order = "YXZ";

  // ---------------------------------------------------------- viewmodel scene
  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(62, 1, 0.01, 5);
  const vmAmb = new THREE.AmbientLight(0xb0b8c8, 1.5);
  vmScene.add(vmAmb);
  const vmKey = new THREE.DirectionalLight(0xffe8d0, 2.2);
  vmKey.position.set(1, 2, 1);
  vmScene.add(vmKey);
  const vmNeon = new THREE.PointLight(0xff3b9c, 0, 3, 1.5);
  vmNeon.position.set(-0.6, 0.4, -0.3);
  vmScene.add(vmNeon);
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
  const vmState = { swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0, blasterHue: 0 };
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();

  /* ======================================================== level build */
  function buildLevel(S) {
    disposeLevel();
    const G = S.G;
    const theme = THEMES[S.L.theme] || THEMES.entrance;
    const outdoor = !!theme.outdoor;
    const H = S.H;
    const neon = theme.neon;
    const R = rng(S.id * 991);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.fog);
    scene.fog = new THREE.FogExp2(theme.fog, theme.fogD);
    const disp = [];
    const own = (x) => (disp.push(x), x);
    const W = G.w * CELL, D = G.h * CELL;

    const hemi = new THREE.HemisphereLight(theme.amb, 0x120810, theme.ambI);
    scene.add(hemi);
    if (outdoor) {
      const moon = new THREE.DirectionalLight(0x9aa0e0, 0.8);
      moon.position.set(-20, 40, 10);
      scene.add(moon);
      // sky dome, stars, moon, distant skyline
      const sky = new THREE.Mesh(own(new THREE.SphereGeometry(110, 24, 12)), own(new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })));
      sky.position.set(W / 2, 0, D / 2);
      scene.add(sky);
      const sg = own(new THREE.BufferGeometry());
      const pos = [];
      for (let i = 0; i < 500; i++) {
        const a = R() * Math.PI * 2, e = 0.3 + R() * 1.2, r = 100;
        pos.push(Math.cos(a) * Math.cos(e) * r + W / 2, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r + D / 2);
      }
      sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      scene.add(new THREE.Points(sg, own(new THREE.PointsMaterial({ color: 0xe0d8ff, size: 0.45, fog: false, sizeAttenuation: true }))));
      const moonS = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe8d0, fog: false, depthWrite: false })));
      moonS.scale.set(16, 16, 1);
      moonS.position.set(W / 2 - 50, 55, D / 2 - 60);
      scene.add(moonS);
      const moonCore = new THREE.Mesh(own(new THREE.CircleGeometry(3.2, 24)), own(new THREE.MeshBasicMaterial({ color: 0xfff4e0, fog: false })));
      moonCore.position.copy(moonS.position);
      moonCore.lookAt(W / 2, 0, D / 2);
      scene.add(moonCore);
      const sk = own(new THREE.CylinderGeometry(80, 80, 18, 48, 1, true));
      const skyline = new THREE.Mesh(sk, own(new THREE.MeshBasicMaterial({ map: skylineTexture(), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false })));
      skylineTexture().repeat.set(3, 1);
      skyline.position.set(W / 2, 7, D / 2);
      scene.add(skyline);
    }

    // ---- walls: one merged mesh of the faces that border open cells
    const isSolid = (c, r) => {
      const k = G.at(c, r);
      return k === "#" || k === " ";
    };
    const pos = [], uv = [], nor = [], idx = [];
    // wall textures span four cells; each face picks a quarter so posters and
    // mirrors don't repeat on every 2 m segment
    const quad = (x0, z0, x1, z1, nx, nz, y0, y1) => {
      const b = pos.length / 3;
      pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
      const v0 = y0 / 3.6, v1 = y1 / 3.6;
      const q = Math.floor(hash(x0 * 0.37 + z0 * 0.91 + nx * 3 + nz * 7) * 4) * 0.25;
      uv.push(q, v0, q + 0.25, v0, q + 0.25, v1, q, v1);
      for (let i = 0; i < 4; i++) nor.push(nx, 0, nz);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const walkable = (c, r) => !isSolid(c, r) && c >= 0 && r >= 0 && c < G.w && r < G.h;
    const edges = [];
    for (let r = 0; r < G.h; r++)
      for (let c = 0; c < G.w; c++) {
        if (!isSolid(c, r)) continue;
        const x0 = c * CELL, z0 = r * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        if (walkable(c, r - 1)) {
          quad(x1, z0, x0, z0, 0, -1, 0, H);
          edges.push([x1, z0, x0, z0, 0, -1]);
        }
        if (walkable(c, r + 1)) {
          quad(x0, z1, x1, z1, 0, 1, 0, H);
          edges.push([x0, z1, x1, z1, 0, 1]);
        }
        if (walkable(c - 1, r)) {
          quad(x0, z0, x0, z1, -1, 0, 0, H);
          edges.push([x0, z0, x0, z1, -1, 0]);
        }
        if (walkable(c + 1, r)) {
          quad(x1, z1, x1, z0, 1, 0, 0, H);
          edges.push([x1, z1, x1, z0, 1, 0]);
        }
      }
    const wg = own(new THREE.BufferGeometry());
    wg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    wg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    wg.setIndex(idx);
    const mirror = theme.wall === "mirror";
    const wallMat = own(new THREE.MeshStandardMaterial({ map: wallTexture(theme.wall), roughness: mirror ? 0.45 : 0.88, metalness: mirror ? 0.1 : 0.04, emissive: mirror ? 0x141a34 : 0x000000 }));
    scene.add(new THREE.Mesh(wg, wallMat));
    // wall caps outdoors (so fences have a top edge) + string lights along them
    if (outdoor && edges.length) {
      const capG = own(new THREE.BoxGeometry(1, 0.18, 0.3));
      const capM = own(new THREE.MeshStandardMaterial({ color: 0xb08a2a, roughness: 0.4, metalness: 0.5 }));
      const caps = new THREE.InstancedMesh(capG, capM, edges.length);
      const per = 4;
      const bulbs = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.08, 6, 4)), own(new THREE.MeshBasicMaterial({ color: 0xffffff })), edges.length * per);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      let n = 0;
      edges.forEach(([x0, z0, x1, z1, nx, nz], i) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-(z1 - z0), x1 - x0));
        p.set((x0 + x1) / 2 + nx * 0.1, H + 0.09, (z0 + z1) / 2 + nz * 0.1);
        sc.set(len, 1, 1);
        m4.compose(p, q, sc);
        caps.setMatrixAt(i, m4);
        for (let k = 0; k < per; k++) {
          const t = (k + 0.5) / per;
          const sag = Math.sin(t * Math.PI) * 0.25;
          m4.makeTranslation(x0 + (x1 - x0) * t + nx * 0.25, H - 0.15 - sag, z0 + (z1 - z0) * t + nz * 0.25);
          bulbs.setMatrixAt(n, m4);
          bulbs.setColorAt(n, tmpC.set(neon[(n + i) % neon.length]));
          n++;
        }
      });
      caps.instanceMatrix.needsUpdate = true;
      bulbs.count = n;
      scene.add(caps, bulbs);
    }
    // ---- floor & ceiling
    const fg = own(new THREE.PlaneGeometry(W, D));
    scaleUv(fg, G.w, G.h);
    const floorMat = own(new THREE.MeshStandardMaterial({ map: floorTexture(theme.floor), roughness: theme.floor === "checker" ? 0.35 : 0.9, metalness: theme.floor === "checker" ? 0.1 : 0 }));
    const floor = new THREE.Mesh(fg, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, D / 2);
    scene.add(floor);
    if (outdoor) {
      // ground beyond the walls so the horizon isn't a void
      const og = own(new THREE.PlaneGeometry(260, 260));
      const outer = new THREE.Mesh(og, own(new THREE.MeshStandardMaterial({ color: 0x0c0810, roughness: 1 })));
      outer.rotation.x = -Math.PI / 2;
      outer.position.set(W / 2, -0.02, D / 2);
      scene.add(outer);
    } else {
      const cg = own(new THREE.PlaneGeometry(W, D));
      scaleUv(cg, theme.tent ? G.w / 3 : G.w, theme.tent ? G.h / 3 : G.h);
      const ceil = new THREE.Mesh(cg, own(new THREE.MeshStandardMaterial({ map: ceilingTexture(!!theme.tent), roughness: 1 })));
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(W / 2, H, D / 2);
      scene.add(ceil);
      if (theme.tent) {
        // bunting strings hanging under the big top
        const flagG = own(new THREE.ConeGeometry(0.25, 0.45, 3));
        const N = 60;
        const flags = new THREE.InstancedMesh(flagG, own(new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide })), N * 4);
        const m4 = new THREE.Matrix4();
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI;
          const ex = Math.cos(a) * W * 0.5, ez = Math.sin(a) * D * 0.5;
          for (let i = 0; i < N; i++) {
            const t = i / (N - 1);
            const x = W / 2 - ex + ex * 2 * t, z = D / 2 - ez + ez * 2 * t;
            const y = H - 0.6 - Math.sin(t * Math.PI) * 1.6;
            m4.makeRotationX(Math.PI);
            m4.setPosition(x, y, z);
            flags.setMatrixAt(n, m4);
            flags.setColorAt(n, tmpC.set(CONFETTI[n % 5]));
            n++;
          }
        }
        scene.add(flags);
      }
    }
    // ---- railings (posts + two rails), instanced
    if (G.rails.length) {
      const postG = own(new THREE.CylinderGeometry(0.045, 0.05, 1.1, 6));
      const railG = own(new THREE.BoxGeometry(CELL, 0.07, 0.07));
      const pm = own(new THREE.MeshStandardMaterial({ color: 0xd8a83a, roughness: 0.4, metalness: 0.55 }));
      const rm = own(new THREE.MeshStandardMaterial({ color: 0xb81c2a, roughness: 0.5 }));
      const posts = new THREE.InstancedMesh(postG, pm, G.rails.length * 2);
      const rails = new THREE.InstancedMesh(railG, rm, G.rails.length * 2);
      const m4 = new THREE.Matrix4();
      G.rails.forEach((b, i) => {
        for (let k = 0; k < 2; k++) {
          const o = k ? CELL / 2 - 0.05 : -CELL / 2 + 0.05;
          m4.makeTranslation(b.axis === "x" ? b.x + o : b.x, 0.55, b.axis === "x" ? b.z : b.z + o);
          posts.setMatrixAt(i * 2 + k, m4);
          const rot = new THREE.Matrix4().makeRotationY(b.axis === "z" ? Math.PI / 2 : 0);
          rot.setPosition(b.x, k ? 1.05 : 0.6, b.z);
          rails.setMatrixAt(i * 2 + k, rot);
        }
      });
      scene.add(posts, rails);
    }
    // ---- doors
    const doors = [];
    const frameMat = own(new THREE.MeshStandardMaterial({ color: 0x3a2a2a, roughness: 0.5, metalness: 0.4 }));
    const panelG = own(new THREE.BoxGeometry(1.7, 2.45, 0.12));
    const postG = own(new THREE.BoxGeometry(0.16, 2.6, 0.3));
    const lintelG = own(new THREE.BoxGeometry(CELL, 1, 0.34));
    const lightG = own(new THREE.BoxGeometry(0.16, 0.1, 0.06));
    for (const d of S.doors) {
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      if (d.axis === "z") g.rotation.y = Math.PI / 2;
      const panelMat = own(new THREE.MeshStandardMaterial({ map: doorTexture(d.kind), roughness: 0.55, metalness: d.kind === "door" ? 0.05 : 0.4 }));
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
        const lamp2 = new THREE.Mesh(lightG, lamp.material);
        lamp2.position.z = -0.2;
        g.add(lamp, lamp2);
      }
      scene.add(g);
      doors.push({ d, g, panel, lamp });
      if (d.kind === "exit") {
        // a lit carnival arch over every exit
        const arch = makeArch(2.6, Math.min(H + 0.6, 4.2), neon);
        arch.position.set(d.x, 0, d.z);
        if (d.axis === "z") arch.rotation.y = Math.PI / 2;
        scene.add(arch);
        for (const m of arch.userData.disposables) disp.push(m);
      }
    }
    // ---- extra entrance arches (level 1)
    if (S.id === 1) {
      for (const [c, r] of [[7, 13], [18, 13]]) {
        const arch = makeArch(5.6, 4.6, neon);
        arch.position.set(c * CELL + CELL / 2, 0, r * CELL + CELL / 2);
        scene.add(arch);
        for (const m of arch.userData.disposables) disp.push(m);
      }
    }
    // ---- furniture
    const glows = [];
    for (const dc of G.deco) {
      const m = makeDeco(dc.kind, dc.axis, R, neon, !!theme.tent);
      m.position.set(dc.x, 0, dc.z);
      scene.add(m);
      if (dc.kind === "A") glows.push({ x: dc.x, z: dc.z });
    }
    // ---- big rides
    let prop = null;
    if (G.prop) {
      prop = G.prop.kind === "ferris" ? makeFerris(neon) : makeCarousel(neon);
      prop.root.position.set(G.prop.x, 0, G.prop.z);
      scene.add(prop.root);
      for (const m of prop.disposables) disp.push(m);
    }
    // ---- items
    const items = new Map();
    for (const it of S.items) addItem(scene, items, it);
    // ---- switches (lever boxes)
    const switches = [];
    const swBoxG = own(new THREE.BoxGeometry(0.5, 0.65, 0.16));
    const swLeverG = own(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 6));
    const swKnobG = own(new THREE.SphereGeometry(0.06, 8, 6));
    const swMat = own(new THREE.MeshStandardMaterial({ color: 0x6a1a2a, roughness: 0.5, metalness: 0.3 }));
    const knobMat = own(new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.3, metalness: 0.4 }));
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
      const knob = new THREE.Mesh(swKnobG, knobMat);
      knob.position.y = 0.38;
      lever.add(knob);
      g.add(lever);
      const lamp = new THREE.Mesh(lightG, own(new THREE.MeshBasicMaterial({ color: 0xff2a1a })));
      lamp.position.set(0, 0.42, 0.06);
      g.add(lamp);
      const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc040, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(1.1, 1.1, 1);
      halo.position.z = 0.2;
      g.add(halo);
      scene.add(g);
      switches.push({ s, g, lever, lamp, halo });
    }
    // ---- fortune machines glow
    const fortunes = [];
    for (const f of S.fortunes) {
      const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9a5aff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(1.8, 1.8, 1);
      halo.position.set(f.x, 1.35, f.z);
      scene.add(halo);
      fortunes.push({ f, halo });
    }
    // ---- hazard plates (instanced, colour = state)
    let hazards = null;
    if (G.hazards.length) {
      const grate = new THREE.InstancedMesh(own(new THREE.BoxGeometry(CELL - 0.08, 0.04, CELL - 0.08)), own(new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.4 })), G.hazards.length);
      const glow = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(CELL - 0.2, CELL - 0.2)), own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })), G.hazards.length);
      const m4 = new THREE.Matrix4();
      G.hazards.forEach((hz, i) => {
        m4.makeTranslation(hz.x, 0.02, hz.z);
        grate.setMatrixAt(i, m4);
        const r = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        r.setPosition(hz.x, 0.05, hz.z);
        glow.setMatrixAt(i, r);
        glow.setColorAt(i, tmpC.set(0x000000));
      });
      scene.add(grate, glow);
      hazards = { glow, list: G.hazards };
    }
    // ---- light fixtures + the pooled point lights
    const fixtures = [];
    const tubeG = own(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8));
    const globeG = own(new THREE.SphereGeometry(0.22, 12, 8));
    const alarmG = own(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 10));
    const poleG = own(new THREE.CylinderGeometry(0.07, 0.1, H + 0.2, 8));
    const poleMat = own(new THREE.MeshStandardMaterial({ color: 0x2a2030, metalness: 0.5, roughness: 0.4 }));
    for (const [i, l] of G.lights.entries()) {
      const col = l.kind === "lamp" ? neon[i % neon.length] : 0xff2010;
      const g = new THREE.Group();
      const y = outdoor ? H + 0.3 : H - 0.1;
      g.position.set(l.x, y, l.z);
      const mat = own(new THREE.MeshBasicMaterial({ color: col }));
      let bulb;
      if (l.kind === "lamp") {
        if (outdoor) {
          bulb = new THREE.Mesh(globeG, mat);
          g.add(bulb);
          const pole = new THREE.Mesh(poleG, poleMat);
          pole.position.y = -(H + 0.2) / 2 - 0.1;
          g.add(pole);
        } else {
          bulb = new THREE.Mesh(tubeG, mat);
          bulb.rotation.z = Math.PI / 2;
          bulb.position.y = -0.25;
          g.add(bulb);
          const wire = new THREE.Mesh(own(new THREE.CylinderGeometry(0.01, 0.01, 0.25, 4)), poleMat);
          wire.position.y = -0.12;
          g.add(wire);
        }
      } else {
        bulb = new THREE.Mesh(alarmG, mat);
        bulb.position.y = -0.09;
        g.add(bulb);
      }
      const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(outdoor ? 2.2 : 1.8, outdoor ? 2.2 : 1.8, 1);
      halo.position.y = outdoor ? 0 : -0.25;
      g.add(halo);
      scene.add(g);
      fixtures.push({ l, g, bulb, halo, col, seed: i * 13.7 + 3, base: l.kind === "lamp" ? (outdoor ? 30 : theme.tent ? 34 : 15) : 9, level: 1, y: outdoor ? H : H - 0.5 });
    }
    // arcade screens act as extra (dim) light sources in the pool
    for (const gl of glows) fixtures.push({ l: { x: gl.x, z: gl.z, kind: "screen" }, g: null, bulb: null, halo: null, col: neon[fixtures.length % neon.length], seed: fixtures.length * 7.1, base: 5, level: 1, y: 1.4 });
    if (G.prop) fixtures.push({ l: { x: G.prop.x, z: G.prop.z, kind: "ride" }, g: null, bulb: null, halo: null, col: neon[0], seed: 99, base: G.prop.kind === "ferris" ? 70 : 40, level: 1, y: G.prop.kind === "ferris" ? 8 : 4.2 });
    const pool = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, outdoor ? 22 : theme.tent ? 22 : 14, 1.6);
      scene.add(pl);
      pool.push(pl);
    }
    // flashlight (weak; the neon does most of the work)
    const flash = new THREE.SpotLight(0xfff2dc, 0, 22, 0.55, 0.8, 1.2);
    scene.add(flash, flash.target);
    const muzzle = new THREE.PointLight(0xffb060, 0, 9, 2);
    scene.add(muzzle);
    // ---- splat decals
    const decalG = own(new THREE.PlaneGeometry(1, 1));
    const decalMat = own(new THREE.MeshStandardMaterial({ map: splatTexture(), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }));
    const decals = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(decalG, decalMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      decals.push(m);
    }
    // ---- particles: sparks (additive), goo, confetti (vertex colours)
    const sparks = makeParticles(own, 160, 0xffd080, true, 0.07, false);
    const goo = makeParticles(own, 160, 0xa0102a, false, 0.08, false);
    const confetti = makeParticles(own, 260, 0xffffff, false, 0.055, true);
    scene.add(sparks.points, goo.points, confetti.points);
    // ---- tracers
    const tracerG = own(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true));
    tracerG.rotateX(Math.PI / 2);
    const tracerMats = [0xfff0b0, 0xff5ae0, 0x5ae0ff, 0xffe05a].map((c) => own(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
    const tracers = [];
    for (let i = 0; i < TRACERS; i++) {
      const m = new THREE.Mesh(tracerG, tracerMats[0]);
      m.visible = false;
      scene.add(m);
      tracers.push({ m, t: 9, life: 0.06, r: 0.012 });
    }
    // ---- boss FX pools: shockwave rings, bomb balls + landing marks
    const ringMat = own(new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xff6a20, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const ringG = own(new THREE.PlaneGeometry(2, 2));
    const waveWallG = own(new THREE.CylinderGeometry(1, 1, 0.5, 48, 1, true));
    const waveWallMat = own(new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
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
    const markMat = own(new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xff2030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const fillMat = own(new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    const fillG = own(new THREE.CircleGeometry(1, 24));
    const ballG = own(new THREE.SphereGeometry(0.28, 12, 8));
    const ballMats = [0xff3b5c, 0xffc23b, 0x5a8cff, 0xb04aff, 0x3bffe0].map((c) => own(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.3 })));
    const bombs = [];
    for (let i = 0; i < 8; i++) {
      const mark = new THREE.Mesh(ringG, markMat);
      mark.rotation.x = -Math.PI / 2;
      const fill = new THREE.Mesh(fillG, fillMat);
      fill.rotation.x = -Math.PI / 2;
      const ball = new THREE.Mesh(ballG, ballMats[i % ballMats.length]);
      mark.visible = fill.visible = ball.visible = false;
      scene.add(mark, fill, ball);
      bombs.push({ mark, fill, ball });
    }
    // ---- popup scare + charge warning arrow
    const popup = makePopup();
    popup.root.visible = false;
    scene.add(popup.root);
    const arrowG = own(new THREE.PlaneGeometry(1.6, 1));
    const arrow = new THREE.Mesh(arrowG, own(new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })));
    arrow.rotation.x = -Math.PI / 2;
    arrow.visible = false;
    scene.add(arrow);

    L = { S, scene, disp, doors, items, switches, fortunes, hazards, fixtures, pool, flash, muzzle, decals, decalI: 0, sparks, goo, confetti, tracers, tracerMats, tracerI: 0, rings, bombs, popup, popT: 9, arrow, prop, rigs: new Map(), outdoor, H, theme, hemi, poolT: 0 };
    applyBrightness();
  }

  function addItem(scene, items, it) {
    const m = makeItem(it.kind);
    m.root.position.set(it.x, 0, it.z);
    scene.add(m.root);
    items.set(it.id, m);
  }

  function makeParticles(own, n, color, additive, size, colored) {
    const g = own(new THREE.BufferGeometry());
    const p = new Float32Array(n * 3).fill(-999);
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    let cols = null;
    if (colored) {
      cols = new Float32Array(n * 3).fill(1);
      g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    }
    const m = own(new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: additive ? 1 : 0.95, vertexColors: !!colored }));
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return { points: pts, pos: p, cols, vel: new Float32Array(n * 3), life: new Float32Array(n), i: 0, n, grav: additive ? 6 : colored ? 3.5 : 9, drag: colored ? 1.8 : 0 };
  }
  function burst(P, x, y, z, count, speed, up = 1, palette = null) {
    for (let k = 0; k < count; k++) {
      const i = P.i;
      P.i = (P.i + 1) % P.n;
      P.pos[i * 3] = x;
      P.pos[i * 3 + 1] = y;
      P.pos[i * 3 + 2] = z;
      P.vel[i * 3] = (Math.random() - 0.5) * speed;
      P.vel[i * 3 + 1] = Math.random() * speed * up;
      P.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      P.life[i] = (P.cols ? 0.9 : 0.35) + Math.random() * 0.5;
      if (P.cols) {
        tmpC.set(palette ? palette[k % palette.length] : CONFETTI[Math.floor(Math.random() * CONFETTI.length)]);
        P.cols[i * 3] = tmpC.r;
        P.cols[i * 3 + 1] = tmpC.g;
        P.cols[i * 3 + 2] = tmpC.b;
      }
    }
    if (P.cols) P.points.geometry.attributes.color.needsUpdate = true;
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
      if (P.drag) {
        const k = Math.exp(-P.drag * dt);
        P.vel[i * 3] *= k;
        P.vel[i * 3 + 2] *= k;
        P.vel[i * 3 + 1] = Math.max(P.vel[i * 3 + 1], -1.6); // confetti flutters down
      }
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

  function scaleUv(g, sx, sy) {
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * sx, a.getY(i) * sy);
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
    L.hemi.intensity = L.theme.ambI * (1.3 + brightness * 1.1);
    renderer.toneMappingExposure = 1.0 + brightness * 0.35;
  }

  /** world-space muzzle (approximate) for tracers */
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
        const blaster = e.w === "blaster";
        if (blaster) vmState.blasterHue = (vmState.blasterHue + 1) % 3;
        for (const im of e.impacts) {
          if (blaster) tracer(mx, my, mz, im.x, im.y, im.z, L.tracerMats[1 + vmState.blasterHue], 0.035, 0.09);
          else if (e.w === "pistol" || Math.random() < 0.35) tracer(mx, my, mz, im.x, im.y, im.z, L.tracerMats[0], 0.01, 0.05);
          if (im.surface === "air") continue;
          if (im.surface === "flesh") {
            burst(L.goo, im.x, im.y, im.z, 5, 3.0, 0.8);
            burst(L.confetti, im.x, im.y, im.z, blaster ? 6 : 4, 3, 0.8);
          } else if (im.surface === "armor") burst(L.sparks, im.x, im.y, im.z, 9, 4.5, 0.9);
          else if (blaster) burst(L.confetti, im.x, im.y, im.z, 5, 2.6, 0.7, [0xff5ae0, 0x5ae0ff, 0xffe05a]);
          else burst(L.sparks, im.x, im.y, im.z, 5, 3.5, 0.9);
        }
      } else if (e.type === "edie") {
        const big = e.e.type === "king";
        burst(L.confetti, e.e.x, e.e.D.body * 0.7, e.e.z, big ? 120 : 34, big ? 7 : 4.5, 1.1);
        burst(L.goo, e.e.x, e.e.D.body * 0.6, e.e.z, big ? 30 : 12, 3, 0.8);
        decal(e.e.x + (Math.random() - 0.5) * 0.4, e.e.z + (Math.random() - 0.5) * 0.4, big ? 3.4 : e.e.type === "armored" ? 2 : 1.5);
      } else if (e.type === "ehit" && Math.random() < 0.25) {
        decal(e.e.x + (Math.random() - 0.5), e.e.z + (Math.random() - 0.5), 0.5 + Math.random() * 0.4);
      } else if (e.type === "strike" && e.e.type === "armored") {
        burst(L.sparks, e.e.x - Math.sin(e.e.yaw) * 1.3, 0.1, e.e.z - Math.cos(e.e.yaw) * 1.3, 10, 4, 0.6);
      } else if (e.type === "slam" || e.type === "crash") {
        burst(L.sparks, e.e.x, 0.2, e.e.z, 30, 7, 0.7);
        burst(L.confetti, e.e.x, 0.4, e.e.z, 30, 6, 0.9);
      } else if (e.type === "boom") {
        burst(L.sparks, e.x, 0.3, e.z, 34, 8, 0.9);
        burst(L.confetti, e.x, 0.5, e.z, 40, 6, 1.2);
        decal(e.x, e.z, 2.4);
      } else if (e.type === "spawn") {
        burst(L.confetti, e.e.x, 0.3, e.e.z, 22, 3, 1.4);
      } else if (e.type === "zap") {
        burst(L.sparks, e.x + (Math.random() - 0.5), 0.1, e.z + (Math.random() - 0.5), 18, 5, 1.2);
      } else if (e.type === "scare" && e.kind === "popup") {
        L.popT = 0;
        L.popup.root.position.set(e.x, 0, e.z);
        L.popup.root.rotation.y = e.yaw + Math.PI; // face the player
        burst(L.confetti, e.x, 1.2, e.z, 30, 4, 1.4);
      } else if (e.type === "fortune") {
        burst(L.confetti, e.f.x, 1.6, e.f.z, 40, 3.5, 1.4);
      } else if (e.type === "drop") {
        addItem(L.scene, L.items, e.it);
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
    for (const Dd of L.doors) {
      const d = Dd.d;
      if (d.kind !== "door") Dd.panel.position.y = 1.225 + d.open * 2.3;
      else Dd.panel.position.x = d.open * 1.6;
      if (d.kind === "door" && d.bang > 0 && d.target < 1) Dd.panel.position.z = Math.sin(time * 40) * 0.03 * Math.min(1, d.bang);
      if (Dd.lamp) Dd.lamp.material.color.setHex((d.kind === "exit" ? S.exitOpen : d.target >= 1) ? 0x30ff60 : 0xff2a1a);
    }
    // items
    for (const it of S.items) {
      const m = L.items.get(it.id);
      if (!m) continue;
      m.root.visible = !it.taken;
      if (it.taken) continue;
      m.body.position.y = 0.12 + Math.sin(time * 2.2 + it.id) * 0.06;
      m.body.rotation.y += dt * 0.9;
      m.halo.material.opacity = 0.4 + Math.sin(time * 3 + it.id) * 0.15;
    }
    // switches
    for (const sw of L.switches) {
      sw.lever.rotation.x = sw.s.on ? 1.0 : -0.7;
      sw.lamp.material.color.setHex(sw.s.on ? 0x30ff60 : 0xff2a1a);
      sw.halo.visible = !sw.s.on;
      sw.halo.material.opacity = 0.3 + Math.sin(time * 4) * 0.18;
    }
    for (const fo of L.fortunes) {
      fo.halo.visible = !fo.f.used;
      fo.halo.material.opacity = 0.35 + Math.sin(time * 2.5) * 0.15;
    }
    // hazards
    if (L.hazards) {
      const { glow, list } = L.hazards;
      list.forEach((hz, i) => {
        const st = hazardState(S.t, hz.ph);
        if (st === 2) tmpC.setRGB(0.15 + Math.random() * 0.35, 0.55 + Math.random() * 0.35, 1);
        else if (st === 1) tmpC.setRGB(0.6 * (0.5 + 0.5 * Math.sin(time * 30)), 0.45 * (0.5 + 0.5 * Math.sin(time * 30)), 0);
        else tmpC.setRGB(0.02, 0.02, 0.04);
        glow.setColorAt(i, tmpC);
        if (st === 2 && Math.random() < dt * 4) burst(L.sparks, hz.x + (Math.random() - 0.5) * 1.6, 0.1, hz.z + (Math.random() - 0.5) * 1.6, 2, 3, 1);
      });
      glow.instanceColor.needsUpdate = true;
    }
    // rides
    if (L.prop) L.prop.update(time, S.propOn, dt);
    // lamps: flicker + blackout
    const out = S.blackout > 0;
    for (const f of L.fixtures) {
      let lv;
      if (f.l.kind === "lamp") {
        const n = hash(Math.floor(time * 8 + f.seed));
        lv = n < 0.05 ? 0.1 : n < 0.1 ? 0.55 : 0.92 + Math.sin(time * 29 + f.seed) * 0.05;
        if (f.seed % 3 < 1) lv = 0.85 + 0.15 * Math.sin(time * 2 + f.seed);
      } else if (f.l.kind === "alarm") lv = 0.45 + 0.55 * Math.max(0, Math.sin(time * 3.2 + f.seed));
      else if (f.l.kind === "screen") lv = 0.6 + 0.4 * hash(Math.floor(time * 5 + f.seed));
      else lv = S.propOn ? 1 : 0.35 + (hash(Math.floor(time * 4)) < 0.3 ? 0.4 : 0);
      if (out) lv = f.l.kind === "alarm" ? lv * 0.6 : 0.03;
      f.level = lv;
      if (f.bulb) {
        f.bulb.material.color.set(f.col).multiplyScalar(0.25 + lv * 0.95);
        f.halo.material.opacity = 0.15 + lv * 0.5;
      }
    }
    L.poolT -= dt;
    if (L.poolT <= 0) {
      L.poolT = 0.25;
      const ref = menu ? camera.position : { x: P.x, z: P.z };
      L.near = L.fixtures
        .map((f) => ({ f, d: (f.l.x - ref.x) ** 2 + (f.l.z - ref.z) ** 2 - (f.l.kind === "ride" ? 400 : 0) }))
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
      if (f.l.kind === "ride") pl.color.set(L.theme.neon[Math.floor(time * 1.5) % L.theme.neon.length]);
      else pl.color.set(f.col);
      pl.intensity = f.base * f.level * (0.7 + brightness * 0.3);
    }
    // the viewmodel picks up the nearest neon colour
    const nf = L.near?.[0];
    if (nf) {
      vmNeon.color.set(nf.col);
      vmNeon.intensity = 1.2 * nf.level;
    }
    // tracers
    for (const T of L.tracers) {
      if (!T.m.visible) continue;
      T.t += dt;
      if (T.t > T.life) T.m.visible = false;
      else {
        const k = 1 - T.t / T.life;
        T.m.scale.x = T.m.scale.y = T.r * k;
      }
    }
    // shockwaves
    L.rings.forEach((rg, i) => {
      const R = S.rings[i];
      rg.m.visible = rg.wall.visible = !!R && R.r > 0;
      if (!R || R.r <= 0) return;
      rg.m.position.set(R.x, 0.06, R.z);
      rg.m.scale.set(R.r, R.r, 1);
      rg.wall.position.set(R.x, 0.25, R.z);
      rg.wall.scale.set(R.r, 1, R.r);
      rg.m.material.opacity = 1 - (R.r / R.max) * 0.7;
    });
    // bombs + landing marks
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
      const x = b.sx + (b.tx - b.sx) * k, z = b.sz + (b.tz - b.sz) * k;
      const y = b.sy * (1 - k) + 0.3 + Math.sin(k * Math.PI) * 4.5;
      bm.ball.position.set(x, y, z);
      bm.ball.rotation.x += dt * 8;
    });
    // charge warning: a red lane in front of the king
    const king = S.E.find((e) => e.type === "king" && e.alive);
    if (king && (king.state === "chargeWind" || king.state === "charge")) {
      const fx = -Math.sin(king.yaw), fz = -Math.cos(king.yaw);
      const len = king.state === "charge" ? 6 : 12 * Math.min(1, king.stateT / KING.chargeWind);
      L.arrow.visible = true;
      L.arrow.position.set(king.x + fx * (len / 2 + 0.8), 0.05, king.z + fz * (len / 2 + 0.8));
      L.arrow.rotation.z = king.yaw;
      L.arrow.scale.set(1, len, 1);
      L.arrow.material.opacity = 0.25 + 0.2 * Math.sin(time * 18);
    } else L.arrow.visible = false;
    // popup scare
    if (L.popT < 2) {
      L.popT += dt;
      const t = L.popT;
      const up = t < 0.15 ? t / 0.15 : t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 0.3);
      L.popup.root.visible = up > 0.01;
      L.popup.spring.scale.y = 0.2 + up * 0.8 + Math.sin(t * 30) * 0.05 * up;
      L.popup.spring.position.y = 0.4 + up * 0.5;
      L.popup.head.position.y = 0.6 + up * 1.0 + Math.sin(t * 25) * 0.05 * up;
      L.popup.head.rotation.z = Math.sin(t * 18) * 0.3;
    } else L.popup.root.visible = false;
    stepParticles(L.sparks, dt);
    stepParticles(L.goo, dt);
    stepParticles(L.confetti, dt);
  }

  function updateCamera(S, dt) {
    const P = S.P;
    const bobAmt = Math.min(1, P.moving / 3.9);
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
    const fl = L.flash;
    fl.position.set(P.x + Math.cos(P.yaw) * 0.2, y - 0.15, P.z - Math.sin(P.yaw) * 0.2);
    const cp = Math.cos(pitch);
    const tx = P.x - Math.sin(yaw) * cp * 6, ty = y + Math.sin(pitch) * 6, tz = P.z - Math.cos(yaw) * cp * 6;
    fl.target.position.x += (tx - fl.target.position.x) * Math.min(1, dt * 18);
    fl.target.position.y += (ty - fl.target.position.y) * Math.min(1, dt * 18);
    fl.target.position.z += (tz - fl.target.position.z) * Math.min(1, dt * 18);
    let fi = L.outdoor ? 6 : 10;
    if (S.blackout > 0) fi *= hash(Math.floor(time * 14)) < 0.45 ? 0.05 : 0.8;
    fl.intensity = P.alive ? fi * (0.75 + brightness * 0.25) : fi * 0.3;
    const ft = P.fireT;
    const mcol = P.w === "blaster" ? [0xff5ae0, 0x5ae0ff, 0xffe05a][vmState.blasterHue] : 0xffb060;
    L.muzzle.color.set(mcol);
    L.muzzle.intensity = ft < 0.06 ? (P.w === "shotgun" ? 60 : P.w === "blaster" ? 25 : 35) * (1 - ft / 0.06) : 0;
    L.muzzle.position.set(P.x - Math.sin(yaw) * 0.8, y - 0.1, P.z - Math.cos(yaw) * 0.8);
  }

  function updateViewmodel(S, dt) {
    const P = S.P;
    const wk = P.w;
    for (const k of Object.keys(VM.guns)) VM.guns[k].visible = k === wk;
    VM.root.visible = P.alive;
    // sway from look motion
    const dyaw = P.yaw - vmState.lastYaw, dp = P.pitch - vmState.lastPitch;
    vmState.lastYaw = P.yaw;
    vmState.lastPitch = P.pitch;
    vmState.swayX += (Math.max(-0.08, Math.min(0.08, dyaw * 0.6)) - vmState.swayX) * Math.min(1, dt * 10);
    vmState.swayY += (Math.max(-0.06, Math.min(0.06, -dp * 0.6)) - vmState.swayY) * Math.min(1, dt * 10);
    const bobAmt = Math.min(1, P.moving / 3.9) * (1 - P.aim * 0.8);
    const bx = Math.sin(P.bob * 1.1) * 0.012 * bobAmt, by = Math.abs(Math.sin(P.bob * 1.1)) * 0.014 * bobAmt;
    const air = P.grounded ? -P.land * 0.04 : Math.max(-0.04, Math.min(0.04, -P.vy * 0.006));
    if (!wk) {
      // unarmed: two empty hands, a bit nervous
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
    const ads = isPistol ? [0, -0.125, -0.42] : isShotgun ? [0, -0.155, -0.36] : [0, -0.14, -0.38];
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
    const kickT = isPistol ? 0.12 : isShotgun ? 0.22 : 0.07;
    const kick = Math.max(0, 1 - P.fireT / kickT);
    z += kick * (isPistol ? 0.05 : isShotgun ? 0.09 : 0.025);
    rx += kick * (isPistol ? 0.22 : isShotgun ? 0.32 : 0.06);
    if (!isPistol && !isShotgun) x += (Math.random() - 0.5) * 0.004 * kick;
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
    // blaster energy tank shows the magazine level
    if (wk === "blaster") {
      const A = P.ammo.blaster;
      VM.tank.scale.setScalar(0.25 + 0.75 * (A.mag / WEAPONS.blaster.mag));
      VM.energy.color.setHSL((0.88 + Math.sin(time * 3) * 0.04) % 1, 1, 0.55 + 0.15 * Math.sin(time * 9));
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
      const col = wk === "blaster" ? [0xff5ae0, 0x5ae0ff, 0xffe05a][vmState.blasterHue] : 0xffffff;
      VM.flashMat.color.set(col);
      vmMuzzle.color.set(wk === "blaster" ? col : 0xffb060);
      const s = (isPistol ? 0.16 : isShotgun ? 0.3 : 0.14) * (0.8 + Math.random() * 0.4);
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
    /** slow drift past the entrance for the menu background */
    renderMenu(S, dt) {
      if (!L || L.S !== S) buildLevel(S);
      updateLevel(S, dt, true);
      const t = time;
      camera.position.set(26 + Math.sin(t * 0.07) * 7, 6.4 + Math.sin(t * 0.5) * 0.08, 35);
      camera.rotation.set(-0.2 + Math.sin(t * 0.21) * 0.02, Math.sin(t * 0.09) * 0.35, 0);
      if (camera.fov !== 66) {
        camera.fov = 66;
        camera.updateProjectionMatrix();
      }
      L.flash.intensity = 0;
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
  void ITEM_GLOW;
  return api;
}
