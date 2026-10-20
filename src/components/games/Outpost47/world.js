/**
 * Outpost 47 — plain Three.js renderer.
 *
 * Builds the whole world once from layout.js + data.js (static geometry is
 * merged per region and material, so the station is a few dozen draw calls),
 * then every frame mirrors the sim: camera, doors, pickups, power-dependent
 * materials, a pooled set of point lights assigned to the nearest lit
 * fixtures, the flashlight, fog/ambience per environment, snow and steam.
 * No shadow maps — the fixtures + flashlight + fog carry the mood cheaply.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createMaterials, Builder, BUILD } from "./props.js";
import { LAYOUT } from "./sim.js";
import { roomAt } from "./layout.js";
import { ROOMS, FIXTURES, FIXTURE_GROUPS, FIXTURE_LOOK, INTERACT, DRIFT, UX, terrain, DOOR_H, ITEMS, WALL_T } from "./data.js";

const POOL = 8;
const ENV_LOOK = {
  outdoor: { fog: 0x1a2532, dens: 0.03, amb: 0x9fb6d0, ambI: 0.62, hemi: 0.55 },
  indoorDark: { fog: 0x06080b, dens: 0.045, amb: 0x5a6a80, ambI: 0.07, hemi: 0.03 },
  indoorLit: { fog: 0x10151a, dens: 0.022, amb: 0xc0ccd8, ambI: 0.2, hemi: 0.12 },
  shelter: { fog: 0x0d0c0b, dens: 0.03, amb: 0xffd2a0, ambI: 0.14, hemi: 0.05 },
  cave: { fog: 0x0b2233, dens: 0.038, amb: 0x6fb8e8, ambI: 0.26, hemi: 0.12 },
  tunnel: { fog: 0x0a0b0c, dens: 0.04, amb: 0xd0a070, ambI: 0.08, hemi: 0.04 },
  labDark: { fog: 0x140606, dens: 0.035, amb: 0xff8070, ambI: 0.06, hemi: 0.03 },
  labLit: { fog: 0x0c1116, dens: 0.016, amb: 0xd8ecff, ambI: 0.24, hemi: 0.12 },
  hangar: { fog: 0x0c0f13, dens: 0.016, amb: 0xc8d4e0, ambI: 0.32, hemi: 0.16 },
  menu: { fog: 0x1a2532, dens: 0.022, amb: 0x9fb6d0, ambI: 0.55, hemi: 0.5 },
};
const WALL_MAT = { station: "wall_station", industrial: "wall_industrial", clinic: "wall_clinic", shed: "wall_shed", tunnel: "wall_tunnel", lab: "wall_lab", ice: "wall_ice" };
const FLOOR_MAT = { station: "floor_station", industrial: "floor_industrial", clinic: "floor_clinic", shed: "floor_shed", tunnel: "floor_tunnel", lab: "floor_lab", ice: "floor_ice" };

export function createWorld(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "o47-canvas";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a2532, 0.03);
  scene.background = new THREE.Color(0x1a2532);
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 320);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const { M, signs, sign } = createMaterials();
  const mat = (k) => (k.startsWith("sign:") ? signs[k.slice(5)] : M[k] || signs[k]);

  /* ---------------------------------------------------------------- lights */
  const amb = new THREE.AmbientLight(0x9fb6d0, 0.5);
  const hemi = new THREE.HemisphereLight(0xb8cde6, 0x2a2f36, 0.4);
  scene.add(amb, hemi);
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 2);
    l.userData = { cur: null, val: 0 };
    scene.add(l);
    pool.push(l);
  }
  const flash = new THREE.SpotLight(0xfff4e0, 0, 34, 0.48, 0.55, 1.4);
  flash.position.set(0.12, -0.12, 0);
  flash.target.position.set(0, -0.2, -5);
  camera.add(flash, flash.target);
  const flashFill = new THREE.PointLight(0xfff0dc, 0, 4.5, 2);
  camera.add(flashFill);

  /* ---------------------------------------------------------------- static build */
  const B = new Builder();
  const groups = { s: new THREE.Group(), u: new THREE.Group() };
  scene.add(groups.s, groups.u);
  const regionOf = (x) => (x > UX - 100 ? "u" : "s");

  for (const r of ROOMS) {
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2, w = r.x2 - r.x1, d = r.z2 - r.z1;
    B.at(cx, 0, cz);
    B.box(FLOOR_MAT[r.theme], 0, -0.1, 0, w + WALL_T, 0.2, d + WALL_T, { uv: r.theme === "ice" ? 4 : 2 });
    B.box(r.theme === "ice" ? "ceil_ice" : "ceil", 0, r.h + 0.1, 0, w + WALL_T, 0.2, d + WALL_T, { uv: r.theme === "ice" ? 4 : 2 });
    if (regionOf(cx) === "s") B.box("roof", 0, r.h + 0.33, 0, w + 0.9, 0.26, d + 0.9, { uv: 4 });
  }
  for (const wl of LAYOUT.walls) {
    const r = ROOMS.find((q) => q.id === wl.room);
    const cx = (wl.x1 + wl.x2) / 2, cz = (wl.z1 + wl.z2) / 2;
    B.at(cx, 0, cz);
    B.box(WALL_MAT[r.theme], 0, (wl.y1 + wl.y2) / 2, 0, wl.x2 - wl.x1, wl.y2 - wl.y1, wl.z2 - wl.z1, { uv: r.theme === "ice" ? 3 : 2.4 });
    if (regionOf(cx) !== "s") continue;
    // exterior cladding where nothing is on the other side
    const nx = wl.side === "w" ? -1 : wl.side === "e" ? 1 : 0, nz = wl.side === "n" ? -1 : wl.side === "s" ? 1 : 0;
    if (roomAt(cx + nx * 0.6, cz + nz * 0.6)) continue;
    const horiz = !nx;
    const len = horiz ? wl.x2 - wl.x1 : wl.z2 - wl.z1;
    const ext = r.theme === "shed" ? "extShed" : "ext";
    const y1 = wl.lintel ? wl.y1 : -0.3;
    const y2 = r.h + 0.45;
    B.at(cx + nx * (WALL_T / 2 + 0.03), 0, cz + nz * (WALL_T / 2 + 0.03), horiz ? 0 : 1);
    B.box(ext, 0, (y1 + y2) / 2, 0, len + (horiz ? 0.06 : 0.06), y2 - y1, 0.06, { uv: 3 });
    // windows
    if (!wl.lintel && len > 3) {
      const n = Math.floor((len - 1.5) / 4);
      for (let i = 0; i < n; i++) {
        const t = -((n - 1) * 4) / 2 + i * 4;
        const lit = r.theme === "shed" ? "winShed" : "winMain";
        const out = horiz ? nz : nx;
        B.box("metalDark", t, 1.75, out * 0.04, 1.2, 0.85, 0.05);
        B.plane(lit, t, 1.75, out * 0.07, 1.0, 0.65, { ry: out > 0 ? 0 : Math.PI });
        B.plane("winNight", t, 1.75, -out * (WALL_T + 0.04), 1.0, 0.65, { ry: out > 0 ? Math.PI : 0 });
      }
    }
  }
  // door frames + name signs
  const doorMeshes = {};
  for (const d of Object.values(LAYOUT.doors)) {
    B.at(d.x, 0, d.z, d.axis === "x" ? 0 : 1);
    const fm = d.style === "ice" ? "rock" : "metalDark";
    B.box(fm, -d.w / 2 - 0.08, DOOR_H / 2, 0, 0.16, DOOR_H, WALL_T + 0.08);
    B.box(fm, d.w / 2 + 0.08, DOOR_H / 2, 0, 0.16, DOOR_H, WALL_T + 0.08);
    B.box(fm, 0, DOOR_H + 0.08, 0, d.w + 0.32, 0.16, WALL_T + 0.08);
    if (d.heavy) B.box("hazard", 0, DOOR_H + 0.08, 0, d.w + 0.33, 0.1, WALL_T + 0.1);
    if (d.style !== "ice") {
      sign("door:" + d.id, [[d.name.toUpperCase(), "bold 46px Arial"]], { w: 512, h: 96, bg: "#151a20", fg: "#cfe6ff", glow: 0.45 });
      for (const s of [1, -1]) B.plane("sign:door:" + d.id, 0, DOOR_H + 0.38, s * (WALL_T / 2 + 0.02), Math.min(2.2, d.w + 0.6), 0.36, { ry: s > 0 ? 0 : Math.PI });
    }
  }
  // props
  for (const p of LAYOUT.props) {
    const fn = BUILD[p.type];
    if (!fn) continue;
    const y = regionOf(p.x) === "s" && !roomAt(p.x, p.z) ? terrain(p.x, p.z) : 0;
    B.at(p.x, p.opts.onDesk ? 0 : y, p.z, p.rot);
    fn(B, p.opts);
  }
  // marker flags along the arrival path
  for (let z = 64, i = 0; z > 27; z -= 5.5, i++) {
    const x = i % 2 ? 3.2 : -3.2;
    B.at(x, terrain(x, z), z);
    BUILD.flag(B);
  }
  // entrance sign
  B.at(0, 0, 24.2);
  B.plane("sign:outpost", 0, 2.85, 0.06, 3.6, 0.9);
  // the north ridge: cliff wall with a recess for the cave door
  for (let x = -60; x <= 64; x += 5) {
    if (x > 0 && x < 12) continue;
    const h = 9 + Math.abs(Math.sin(x * 0.37)) * 6;
    B.at(x, 0, -62 - Math.abs(Math.cos(x * 0.21)) * 2);
    B.sph("rock", 0, h * 0.35, 0, 4.2, { sx: 1.1, sy: h / 4.2, sz: 1, seg: 7 });
    B.sph("snow", 0.4, h * 0.82, 0.8, 2.6, { sy: 0.5, seg: 7 });
  }
  B.at(6, 0, -60);
  B.box("rock", -4.5, 6, -1.5, 3.2, 12, 4, { uv: 3 });
  B.box("rock", 4.5, 6, -1.5, 3.2, 12, 4, { uv: 3 });
  B.box("rock", 0, 8.5, -1.5, 6.2, 7, 4, { uv: 3 });
  B.box("snow", 0, 12.1, -1.5, 12, 0.4, 4.4);
  B.box("rock", 0, 3.8, -1.6, 6.2, 2.8, 3.8, { uv: 3 });
  B.box("rock", 0, 1.2, -2.6, 6.2, 2.6, 2, { uv: 3 });
  B.box("steel", 0, 1.2, -0.25, 2.2, 2.4, 0.15);
  B.box("rust", 0, 1.2, -0.15, 2.0, 2.2, 0.06);
  B.box("hazard", 0, 2.5, -0.2, 2.4, 0.15, 0.1);
  // hangar vehicle bay door (east wall)
  B.at(UX + 53.82, 0, -56, 1);
  B.box("metalDark", 0, 2.6, 0, 8.4, 5.2, 0.12);
  for (let i = 0; i < 8; i++) B.box("steel", 0, 0.35 + i * 0.65, 0.07, 8.2, 0.08, 0.04);
  B.box("hazard", 0, 5.35, 0.07, 8.6, 0.3, 0.05);
  // distant mountains (silhouettes in the storm)
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const R = 210 + (i % 3) * 30;
    const h = 50 + ((i * 37) % 40);
    B.at(Math.cos(a) * R, -2, 10 + Math.sin(a) * R);
    B.cone("rock", 0, h / 2, 0, 50 + (i % 4) * 10, h, { seg: 7 });
    B.cone("snow", 0, h * 0.82, 0, 18 + (i % 4) * 3.6, h * 0.36, { seg: 7 });
  }
  // documents: paper / books / wall sheets where no notice board already exists
  const nearNotice = (x, z) => LAYOUT.props.some((p) => ["notice", "whiteboard", "mapwall", "tag"].includes(p.type) && Math.hypot(p.x - x, p.z - z) < 0.6);
  for (const it of INTERACT) {
    if (!it.doc) continue;
    const [x, y, z] = it.pos;
    if (y < 1.3) {
      const book = /diary|log$/.test(it.id);
      const yy = y < 0.3 ? 0.01 : y - 0.07;
      B.at(x, yy, z, 0, x * 1.7);
      if (book) {
        B.box("paintRed", 0, 0.02, 0, 0.18, 0.04, 0.24);
        B.box("paper", 0.005, 0.02, 0, 0.17, 0.035, 0.235);
      } else B.box("paper", 0, 0.004, 0, 0.21, 0.006, 0.29);
    } else if (!nearNotice(x, z)) {
      // find the wall it hangs on
      let best = null, bd = 9;
      for (const w of LAYOUT.walls) {
        const cx = Math.max(w.x1, Math.min(x, w.x2)), cz = Math.max(w.z1, Math.min(z, w.z2));
        const dd = Math.hypot(cx - x, cz - z);
        if (dd < bd) {
          bd = dd;
          best = { nx: x - cx, nz: z - cz };
        }
      }
      const ang = best ? Math.atan2(best.nx, best.nz) : 0;
      B.at(x, 0, z, 0, ang);
      B.plane(it.id === "photo" ? "fabricGrey" : "paper", 0, y, 0.01, it.id === "photo" ? 0.25 : 0.3, it.id === "photo" ? 0.2 : 0.4);
    }
  }
  // fixtures (emissive bodies; the light comes from the pool)
  const fixtures = FIXTURES.map((f) => ({ ...f }));
  for (const p of LAYOUT.props) {
    if (p.opts.fx) fixtures.push({ x: p.x, y: terrain(p.x, p.z) + 4.35, z: p.z + 0.4, group: p.opts.fx, flicker: 0 });
  }
  const fxMats = {};
  for (const g of Object.keys(FIXTURE_GROUPS)) {
    const look = FIXTURE_LOOK[g];
    fxMats[g] = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: look.color, emissiveIntensity: 0.05, roughness: 0.4 });
    M["fx_" + g] = fxMats[g];
  }
  for (const f of fixtures) {
    B.at(f.x, 0, f.z);
    if (f.group === "ice") continue;
    if (f.group === "emg" || f.group === "labemg") {
      B.box("fx_" + f.group, 0, f.y, 0, 0.3, 0.14, 0.14);
      B.box("metalDark", 0, f.y + 0.1, 0, 0.36, 0.06, 0.2);
    } else if (f.group === "tun") {
      B.cyl("fx_tun", 0, f.y - 0.05, 0, 0.14, 0.14, 0.18, { seg: 10 });
      B.box("metalDark", 0, f.y + 0.06, 0, 0.36, 0.06, 0.36);
    } else if (f.group === "tower") {
      B.sph("fx_tower", 0, f.y, 0, 0.35, { seg: 10 });
    } else if (f.group === "yard") {
      B.box("fx_yard", 0, f.y, 0, 0.18, 0.06, 0.5);
    } else if (f.group === "shed" || f.group === "hut") {
      B.sph("fx_" + f.group, 0, f.y - 0.1, 0, 0.12, { seg: 8 });
      B.cone("metalDark", 0, f.y + 0.05, 0, 0.28, 0.18, { seg: 10 });
    } else {
      B.box("fx_" + f.group, 0, f.y, 0, 1.3, 0.05, 0.32);
      B.box("metalDark", 0, f.y + 0.05, 0, 1.4, 0.06, 0.42);
    }
  }
  // terrain
  {
    const size = 460, seg = 150;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 2, z = pos.getZ(i) + 10;
      pos.setXYZ(i, x, terrain(x, z) - 0.02, z);
      uv.setXY(i, x / 6, z / 6);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.snow);
    groups.s.add(m);
  }
  // cave-region rock shell so the underground never shows a void beyond its walls
  // (rooms are closed boxes; nothing else needed)

  // merge buckets
  for (const b of B.buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    b.geos.forEach((gg) => gg.dispose());
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat(b.mat));
    m.matrixAutoUpdate = false;
    groups[b.region].add(m);
  }

  /* ---------------------------------------------------------------- dynamic: doors */
  const doorMat = {
    panel: new THREE.MeshStandardMaterial({ color: 0x77828e, roughness: 0.45, metalness: 0.6 }),
    heavy: new THREE.MeshStandardMaterial({ color: 0x59626c, roughness: 0.5, metalness: 0.7 }),
    win: new THREE.MeshStandardMaterial({ color: 0x0c1824, emissive: 0x0b1a2a, emissiveIntensity: 0.6, roughness: 0.1 }),
  };
  for (const d of Object.values(LAYOUT.doors)) {
    const root = new THREE.Group();
    root.position.set(d.x, 0, d.z);
    root.rotation.y = d.axis === "x" ? 0 : Math.PI / 2;
    const leaves = [];
    if (d.style === "ice") {
      const ice = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.2, DOOR_H + 0.3, 0.9), M.iceWall);
      ice.position.y = (DOOR_H + 0.3) / 2;
      root.add(ice);
      leaves.push({ m: ice, dir: 0 });
    } else {
      const two = d.w >= 1.8;
      const lw = two ? d.w / 2 : d.w;
      for (const s of two ? [-1, 1] : [1]) {
        const leaf = new THREE.Group();
        const pm = d.heavy ? doorMat.heavy : doorMat.panel;
        const body = new THREE.Mesh(new THREE.BoxGeometry(lw, DOOR_H, d.heavy ? 0.16 : 0.1), pm);
        body.position.y = DOOR_H / 2;
        leaf.add(body);
        const win = new THREE.Mesh(new THREE.BoxGeometry(lw * 0.5, 0.35, (d.heavy ? 0.16 : 0.1) + 0.01), doorMat.win);
        win.position.set(0, 1.65, 0);
        leaf.add(win);
        if (d.heavy) {
          const hz = new THREE.Mesh(new THREE.BoxGeometry(lw, 0.22, 0.18), M.hazard);
          hz.position.y = 0.4;
          leaf.add(hz);
        }
        leaf.position.x = two ? (s * lw) / 2 : 0;
        root.add(leaf);
        leaves.push({ m: leaf, dir: s, home: leaf.position.x, lw });
      }
    }
    // lock lights on both faces
    const led = new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xff2010, emissiveIntensity: 2 });
    for (const s of [1, -1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.05), led);
      l.position.set(d.w / 2 + 0.3, 1.35, s * (WALL_T / 2 + 0.03));
      root.add(l);
    }
    groups[regionOf(d.x)].add(root);
    doorMeshes[d.id] = { root, leaves, led, d };
  }

  /* ---------------------------------------------------------------- dynamic: pickups, drift, beacon */
  const pick = {};
  const glint = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x9fdcff, emissiveIntensity: 0.4, roughness: 0.4 });
  const pickMats = { card: M.white, battery: M.paintGreen, tool: M.paintOrange, part: M.steel, gear: M.steel, sample: M.cryoGlass, code: M.paper };
  for (const it of INTERACT) {
    if (!it.pickup) continue;
    const item = ITEMS[it.pickup];
    const g = new THREE.Group();
    const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
      const mm = new THREE.Mesh(geo, m);
      mm.position.set(x, y, z);
      mm.rotation.set(rx, 0, rz);
      g.add(mm);
      return mm;
    };
    const ic = item.icon;
    if (ic === "card") {
      add(new THREE.BoxGeometry(0.09, 0.004, 0.055), it.pickup === "card_l5" ? M.paintRed : it.pickup === "card_security" ? M.paintBlue : M.white, 0, 0.003);
      add(new THREE.BoxGeometry(0.03, 0.005, 0.02), glint, 0.02, 0.004, 0);
    } else if (ic === "battery") {
      for (let i = 0; i < (it.id === "bat_cont" ? 3 : 1); i++) {
        add(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10), M.paintGreen, i * 0.09, 0.035, 0, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), glint, i * 0.09 + 0.08, 0.035, 0, 0, Math.PI / 2);
      }
    } else if (ic === "tool") {
      if (it.pickup === "shovel") {
        add(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), M.wood, 0, 0.5, 0, 0.15);
        add(new THREE.BoxGeometry(0.28, 0.34, 0.03), M.metal, 0, 0.1, 0.07, 0.15);
      } else if (it.pickup === "wrench") {
        add(new THREE.BoxGeometry(0.5, 0.03, 0.05), M.steel, 0, 0.02, 0);
        add(new THREE.TorusGeometry(0.05, 0.015, 6, 12), M.steel, 0.27, 0.02, 0, Math.PI / 2);
      } else {
        add(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), M.paintOrange, 0, 0.02, 0, 0, Math.PI / 2);
        add(new THREE.BoxGeometry(0.04, 0.03, 0.22), M.steel, 0.24, 0.02, 0);
      }
    } else if (ic === "part") {
      if (it.pickup === "fuse") add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), M.white, 0, 0.03, 0, 0, Math.PI / 2);
      else if (it.pickup === "coil") add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12), M.paintRed, 0, 0.08, 0);
      else add(new THREE.BoxGeometry(0.16, 0.12, 0.12), M.plastic, 0, 0.06, 0);
      add(new THREE.BoxGeometry(0.04, 0.02, 0.04), glint, 0, 0.13, 0);
    } else if (ic === "gear") {
      const r = { gear_s: 0.08, gear_m: 0.13, gear_l: 0.19 }[it.pickup];
      add(new THREE.CylinderGeometry(r, r, 0.04, 16), M.steel, 0, 0.02, 0);
      const teeth = { gear_s: 10, gear_m: 20, gear_l: 30 }[it.pickup];
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        const t = add(new THREE.BoxGeometry(0.03, 0.04, 0.03), M.steel, Math.cos(a) * (r + 0.012), 0.02, Math.sin(a) * (r + 0.012));
        t.rotation.y = -a;
      }
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), glint, 0, 0.03, 0);
    } else if (ic === "sample") {
      add(new THREE.CylinderGeometry(0.035, 0.035, it.pickup === "core" ? 0.4 : 0.12, 10), M.cryoGlass, 0, 0.04, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.02, 0.02, it.pickup === "core" ? 0.36 : 0.08, 8), M.specimen, 0, 0.04, 0, 0, Math.PI / 2);
    }
    const [x, y, z] = it.pos;
    g.position.set(x, y - (ic === "tool" && it.pickup === "shovel" ? 0.8 : 0.03), z);
    if (it.pickup === "shovel") g.rotation.z = 0.25;
    g.rotation.y = x * 2.3;
    groups[regionOf(x)].add(g);
    pick[it.id] = g;
  }
  const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.snow);
  drift.scale.set(4, 2.2, 2.6);
  drift.position.set((DRIFT.x1 + DRIFT.x2) / 2, 0, -58.8);
  groups.s.add(drift);
  const caveGlow = new THREE.PointLight(0x48c8ff, 0, 7, 2);
  caveGlow.position.set(6, 1.5, -58.6);
  groups.s.add(caveGlow);

  /* ---------------------------------------------------------------- particles */
  const SN = 2600;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SN * 3);
  const snowVel = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 50;
    snowPos[i * 3 + 1] = Math.random() * 22;
    snowPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    snowVel[i] = 1.6 + Math.random() * 2.4;
  }
  snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
  const snowMat = new THREE.PointsMaterial({ size: 0.11, color: 0xeef6ff, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true });
  const spriteTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  snowMat.map = spriteTexture;
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  scene.add(snow);
  const snowOrigin = new THREE.Vector3();

  const MN = 500;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MN * 3);
  for (let i = 0; i < MN; i++) {
    motePos[i * 3] = UX + (Math.random() - 0.5) * 20;
    motePos[i * 3 + 1] = Math.random() * 5;
    motePos[i * 3 + 2] = 18 + Math.random() * 44;
  }
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.06, map: spriteTexture, color: 0x7fe0ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false;
  groups.u.add(motes);

  const STN = 160;
  const steamGeo = new THREE.BufferGeometry();
  const steamPos = new Float32Array(STN * 3);
  const steamLife = new Float32Array(STN);
  steamGeo.setAttribute("position", new THREE.BufferAttribute(steamPos, 3));
  const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ size: 0.9, map: spriteTexture, color: 0xdde8f0, transparent: true, opacity: 0, depthWrite: false }));
  steam.frustumCulled = false;
  groups.u.add(steam);

  /* ---------------------------------------------------------------- per-frame state */
  const fogCol = new THREE.Color(0x1a2532), ambCol = new THREE.Color(0x9fb6d0), tmpC = new THREE.Color();
  let fogDens = 0.03, ambI = 0.5, hemiI = 0.4;
  let t = 0, poolTimer = 0, menuT = 0;
  let w = 1, h = 1;
  const flick = fixtures.map(() => ({ v: 1, next: Math.random() * 3 }));

  function envLook(game, menu) {
    if (menu) return ENV_LOOK.menu;
    const f = game.f, env = game.zone.env;
    if (env === "outdoor") return ENV_LOOK.outdoor;
    if (env === "indoor") return f.power ? ENV_LOOK.indoorLit : ENV_LOOK.indoorDark;
    if (env === "shelter") return ENV_LOOK.shelter;
    if (env === "cave") return ENV_LOOK.cave;
    if (env === "tunnel") return ENV_LOOK.tunnel;
    if (env === "lab") return f.lockdownOff ? ENV_LOOK.labLit : ENV_LOOK.labDark;
    return ENV_LOOK.hangar;
  }

  function update(game, dt, opts = {}) {
    t += dt;
    const menu = !!opts.menu;
    const f = menu ? {} : game.f;
    const p = game.player;
    let region = regionOf(p.x);
    // ---- camera
    if (menu) {
      menuT += dt;
      const a = menuT * 0.035 + 0.6;
      camera.position.set(Math.sin(a) * 38, 7 + Math.sin(menuT * 0.2) * 1.2, 6 + Math.cos(a) * 38);
      camera.lookAt(0, 2.5, 0);
      region = "s";
      camera.fov = 60;
    } else {
      const e = game.eye();
      const bobAmt = opts.headBob === false ? 0 : Math.min(1, p.moving / 4) * (p.ground ? 1 : 0);
      const by = Math.sin(p.bob * 2) * 0.035 * bobAmt, bx = Math.cos(p.bob) * 0.025 * bobAmt;
      camera.position.set(e[0] + Math.cos(p.yaw) * bx, e[1] + by, e[2] - Math.sin(p.yaw) * bx);
      camera.rotation.set(p.pitch, p.yaw, 0);
      const tf = 72 + (p.sprinting && p.moving > 4 ? 5 : 0);
      camera.fov += (tf - camera.fov) * Math.min(1, dt * 6);
      if (game.temp < 25) camera.rotation.z = Math.sin(t * 13) * 0.004 * (25 - game.temp) * 0.2;
    }
    camera.updateProjectionMatrix();
    groups.s.visible = region === "s";
    groups.u.visible = region === "u";

    // ---- environment look
    const look = envLook(game, menu);
    const k = 1 - Math.exp(-dt * 2.5);
    fogCol.lerp(tmpC.setHex(look.fog), k);
    ambCol.lerp(tmpC.setHex(look.amb), k);
    const gust = look === ENV_LOOK.outdoor ? 1 + Math.sin(t * 0.7) * 0.12 + Math.sin(t * 2.3) * 0.08 : 1;
    fogDens += (look.dens * gust - fogDens) * k;
    ambI += (look.ambI - ambI) * k;
    hemiI += (look.hemi - hemiI) * k;
    scene.fog.color.copy(fogCol);
    scene.fog.density = fogDens;
    scene.background.copy(fogCol);
    amb.color.copy(ambCol);
    amb.intensity = ambI;
    hemi.intensity = hemiI;

    // ---- power-dependent materials
    const on = (x, v) => (x ? v : 0.03);
    M.screen.emissiveIntensity = on(f.power, 1.1);
    M.screenBlue.emissiveIntensity = on(f.power, 1.0);
    M.screenLab.emissiveIntensity = on(f.lockdownOff, 1.1);
    M.winMain.emissiveIntensity = on(f.power, 1.2);
    M.specimen.emissiveIntensity = 1.8 + Math.sin(t * 1.3) * 0.6;
    M.iceGlow.emissiveIntensity = 1.3 + Math.sin(t * 0.8) * 0.3;
    for (const g in fxMats) {
      const lit = menu ? g === "shed" || g === "hut" || g === "emg" : FIXTURE_GROUPS[g](f);
      let v = lit ? 2.4 : 0.04;
      if (g === "tower" && lit) v = (t % 1.6) < 0.5 ? 4 : 0.2;
      if ((g === "emg" || g === "labemg") && lit) v = 1.4 + Math.sin(t * 3) * 0.6;
      fxMats[g].emissiveIntensity = v;
    }

    // ---- doors
    for (const id in doorMeshes) {
      const dm = doorMeshes[id];
      const a = menu ? 0 : game.doorAnim[id] ?? 0;
      const e = a * a * (3 - 2 * a);
      for (const lf of dm.leaves) {
        if (dm.d.style === "ice") {
          lf.m.scale.set(1, Math.max(0.001, 1 - e), 1);
          lf.m.position.y = ((DOOR_H + 0.3) * (1 - e)) / 2;
          lf.m.visible = a < 0.999;
        } else lf.m.position.x = lf.home + lf.dir * lf.lw * 0.95 * e * (dm.leaves.length > 1 ? 1 : 1);
      }
      const open = !menu && game.doorsOpen[id];
      const usable = open || (!menu && !dm.d.lock && (!dm.d.power || f.power));
      dm.led.emissive.setHex(open ? 0x20ff60 : usable ? 0xffa020 : 0xff2010);
    }
    // ---- pickups / drift
    const pulse = 0.25 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.9;
    glint.emissiveIntensity = pulse;
    for (const id in pick) pick[id].visible = !menu && !game.f["took_" + id];
    if (menu) for (const id in pick) pick[id].visible = false;
    drift.visible = menu || !game.f.caveOpen;
    caveGlow.intensity = !menu && game.f.caveOpen ? 6 : 0;

    // ---- particles
    const outdoor = !menu ? game.zone.env === "outdoor" : true;
    snowMat.opacity += ((outdoor && region === "s" ? 0.85 : 0) - snowMat.opacity) * Math.min(1, dt * 4);
    snow.visible = snowMat.opacity > 0.02;
    if (snow.visible) {
      snowOrigin.copy(camera.position);
      const wind = 5 + Math.sin(t * 0.5) * 3;
      for (let i = 0; i < SN; i++) {
        let x = snowPos[i * 3], y = snowPos[i * 3 + 1], z = snowPos[i * 3 + 2];
        y -= snowVel[i] * dt;
        x += wind * dt * (0.6 + (i % 5) * 0.12);
        z += Math.sin(t + i) * dt * 0.6;
        if (y < -2) y += 22;
        if (x > 25) x -= 50;
        snowPos[i * 3] = x;
        snowPos[i * 3 + 1] = y;
        snowPos[i * 3 + 2] = z;
      }
      snow.position.set(snowOrigin.x, snowOrigin.y - 8, snowOrigin.z); // particle box rides with the camera
      snowGeo.attributes.position.needsUpdate = true;
    }
    if (region === "u") {
      for (let i = 0; i < MN; i++) {
        motePos[i * 3 + 1] += Math.sin(t * 0.5 + i) * dt * 0.08;
        motePos[i * 3] += Math.cos(t * 0.3 + i * 0.7) * dt * 0.05;
      }
      moteGeo.attributes.position.needsUpdate = true;
      // steam at the ice wall while it melts
      const a = menu ? 1 : game.doorAnim.d_icewall ?? 0;
      const melting = a > 0 && a < 1;
      steam.material.opacity += ((melting ? 0.35 : 0) - steam.material.opacity) * Math.min(1, dt * 2);
      if (steam.material.opacity > 0.01) {
        for (let i = 0; i < STN; i++) {
          steamLife[i] -= dt;
          if (steamLife[i] <= 0) {
            steamLife[i] = 1 + Math.random() * 1.5;
            steamPos[i * 3] = UX + (Math.random() - 0.5) * 6;
            steamPos[i * 3 + 1] = Math.random() * 2;
            steamPos[i * 3 + 2] = 40.5 + Math.random() * 0.6;
          }
          steamPos[i * 3 + 1] += dt * 1.2;
          steamPos[i * 3 + 2] += dt * 0.4;
        }
        steamGeo.attributes.position.needsUpdate = true;
      }
    }

    // ---- fixture flicker + light pool
    for (let i = 0; i < fixtures.length; i++) {
      const fx = fixtures[i];
      if (!fx.flicker) continue;
      const fl = flick[i];
      fl.next -= dt;
      if (fl.next <= 0) {
        fl.v = Math.random() < 0.5 ? 0.15 + Math.random() * 0.4 : 1;
        fl.next = fl.v < 1 ? 0.04 + Math.random() * 0.12 : 0.5 + Math.random() * 4;
      }
    }
    poolTimer -= dt;
    if (poolTimer <= 0) {
      poolTimer = 0.15;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const cand = [];
      for (let i = 0; i < fixtures.length; i++) {
        const fx = fixtures[i];
        if (regionOf(fx.x) !== region) continue;
        const lit = menu ? fx.group === "shed" || fx.group === "hut" || fx.group === "emg" : FIXTURE_GROUPS[fx.group](f);
        if (!lit) continue;
        const d = (fx.x - cx) ** 2 + (fx.y - cy) ** 2 * 0.5 + (fx.z - cz) ** 2;
        const range = FIXTURE_LOOK[fx.group].range;
        if (d > (range + 22) ** 2) continue;
        cand.push({ i, d: d / (range * range) });
      }
      cand.sort((a, b) => a.d - b.d);
      const want = new Set(cand.slice(0, POOL).map((c) => c.i));
      // keep lights that are still wanted, re-home the rest
      const free = [];
      for (const l of pool) {
        if (l.userData.cur !== null && want.has(l.userData.cur)) want.delete(l.userData.cur);
        else free.push(l);
      }
      for (const i of want) {
        const l = free.pop();
        if (!l) break;
        const fx = fixtures[i], look2 = FIXTURE_LOOK[fx.group];
        l.userData.cur = i;
        l.position.set(fx.x, fx.y - 0.25, fx.z);
        l.color.setHex(look2.color);
        l.distance = look2.range;
        l.userData.val = 0;
      }
      for (const l of free) l.userData.cur = null;
    }
    for (const l of pool) {
      const i = l.userData.cur;
      let target = 0;
      if (i !== null) {
        const fx = fixtures[i];
        target = FIXTURE_LOOK[fx.group].power * 16 * (fx.flicker ? flick[i].v : 1);
        // no shadow maps: damp interior lights while standing outside so they don't glow through walls
        if (outdoor && !menu && fx.group !== "yard" && fx.group !== "tower") target *= 0.25;
        if (fx.group === "tower") target *= (t % 1.6) < 0.5 ? 1.5 : 0.05;
        if (fx.group === "emg" || fx.group === "labemg") target *= 0.75 + Math.sin(t * 3) * 0.25;
        if (fx.group === "ice") target *= 0.8 + Math.sin(t * 0.9 + i) * 0.2;
      }
      l.userData.val += (target - l.userData.val) * Math.min(1, dt * (target < l.userData.val ? 18 : 5));
      l.intensity = l.userData.val;
    }
    // ---- flashlight
    const s = menu ? 0 : game.lightStrength;
    flash.intensity = s * 30;
    flash.distance = 18 + s * 14;
    flashFill.intensity = s * 0.5;
  }

  function render() {
    renderer.render(scene, camera);
  }
  function resize(nw, nh) {
    w = Math.max(1, nw);
    h = Math.max(1, nh);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function dispose() {
    const seen = new Set();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const key of ["map", "emissiveMap"]) if (m[key]) m[key].dispose();
        m.dispose();
      }
    });
    for (const m of Object.values(M)) m.dispose();
    for (const m of Object.values(signs)) {
      m.map?.dispose();
      m.dispose();
    }
    spriteTexture.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  }
  return { update, render, resize, dispose, renderer, camera };
}
