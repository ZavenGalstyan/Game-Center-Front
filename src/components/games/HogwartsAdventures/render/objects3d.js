/**
 * Meshes for the interactive objects and moving platforms, animated from
 * their simulation state: feathers float, the gate swings, the slab rises,
 * symbol pillars turn, the carved wall sinks, the bridge flies back
 * together, the mirror reassembles, braziers burn blue, the Ancient Door
 * opens on its three sigils, chests open, pages and sigils glint, and the
 * Aegis Stone pulses on its pedestal. Lumos-revealed marks fade in.
 */
import * as THREE from "three";
import { surface, runeTex, bannerTex, glowTex } from "./textures.js";
import { boxGeo } from "./geom.js";
import { SYMBOLS } from "../data/objects.js";

export function createObjectViews(scene, G, fx) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = [];
  const geos = [];
  const M = (o) => {
    const m = new THREE.MeshStandardMaterial(o);
    mats.push(m);
    return m;
  };
  const stone = M({ ...surface("hidden"), color: "#c0c0c8", roughness: 0.95 });
  const castle = M({ ...surface("castle"), color: "#d0c8b8", roughness: 0.9 });
  const wood = M({ ...surface("wood"), color: "#a07850", roughness: 0.6 });
  const darkWood = M({ ...surface("darkWood"), color: "#ffffff", roughness: 0.7 });
  const iron = M({ color: "#2a2a2e", roughness: 0.45, metalness: 0.85 });
  const gold = M({ color: "#d8b25a", roughness: 0.25, metalness: 1 });
  const parchment = M({ color: "#efe2c0", roughness: 0.9, emissive: "#3a2a10", emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const glow = glowTex();
  const views = new Map();
  const runeMat = (sym, color) => {
    const m = new THREE.MeshBasicMaterial({ map: runeTex(sym), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    mats.push(m);
    return m;
  };
  const sprite = (color, s = 1) => {
    const m = new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    mats.push(m);
    const sp = new THREE.Sprite(m);
    sp.scale.setScalar(s);
    return sp;
  };
  const mesh = (g, m, cast = true) => {
    geos.push(g);
    const x = new THREE.Mesh(g, m);
    x.castShadow = cast;
    x.receiveShadow = true;
    return x;
  };
  const fires = []; // brazier flame sources for fx

  for (const o of G.objects.list) {
    const d = o.def;
    const root = new THREE.Group();
    root.position.set(o.x, o.y, o.z);
    const v = { root, o, parts: {} };
    switch (o.type) {
      case "feather": {
        const g = new THREE.PlaneGeometry(0.08, 0.36, 1, 4);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 6) * 0.02);
        g.rotateX(-Math.PI / 2);
        const f = mesh(g, M({ color: "#f8f4e8", roughness: 0.8, side: THREE.DoubleSide }), false);
        root.add(f);
        v.parts.f = f;
        break;
      }
      case "cushion": {
        const c = mesh(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 0.4, 1), M({ color: "#8e2a3a", roughness: 0.95 }));
        root.add(c);
        break;
      }
      case "bookItem": {
        const b = mesh(new THREE.BoxGeometry(0.42, 0.12, 0.32), M({ color: "#3a1a40", roughness: 0.6, emissive: "#40205a", emissiveIntensity: 0.4 }));
        root.add(b, sprite("#c69cff", 0.9));
        break;
      }
      case "gate": {
        // two barred leaves hinged at the jambs
        for (const s of [-1, 1]) {
          const hinge = new THREE.Group();
          hinge.position.set(0, 0, s * 2);
          const bars = [];
          for (let k = 0; k <= 6; k++) bars.push(boxGeo(-0.05, 0.05, 0, 3.9, -s * (k * 0.32) - 0.03, -s * (k * 0.32) + 0.03, 1));
          bars.push(boxGeo(-0.06, 0.06, 0.4, 0.5, Math.min(0, -s * 2), Math.max(0, -s * 2), 1), boxGeo(-0.06, 0.06, 3.3, 3.4, Math.min(0, -s * 2), Math.max(0, -s * 2), 1));
          const g = new THREE.BufferGeometry().copy(bars.reduce((a, b) => (a ? mergeTwo(a, b) : b), null));
          hinge.add(mesh(g, iron));
          root.add(hinge);
          v.parts[s < 0 ? "l" : "r"] = hinge;
        }
        // padlock
        const lock = mesh(new THREE.BoxGeometry(0.14, 0.18, 0.1), gold);
        lock.position.set(0.1, 1.5, 0);
        root.add(lock);
        v.parts.lock = lock;
        break;
      }
      case "reveal": {
        if (d.track) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), runeMat("track", "#ffe6a0"));
          geos.push(m.geometry);
          m.rotation.x = -Math.PI / 2;
          m.position.y = 0.04;
          root.add(m);
          v.parts.rune = m;
        } else if (o.id === "tapestry") {
          const t = mesh(new THREE.PlaneGeometry(3.4, 4.2), M({ map: bannerTex("hogwarts"), roughness: 1, side: THREE.DoubleSide }), false);
          t.rotation.y = Math.PI / 2;
          t.position.set(0.2, 0.4, 0);
          root.add(t);
          const rm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), runeMat("eagle", "#ffe6a0"));
          geos.push(rm.geometry);
          rm.rotation.y = Math.PI / 2;
          rm.position.set(0.25, 0.6, 0);
          root.add(rm);
          v.parts.rune = rm;
        } else {
          // wall carving: always faintly visible; glows when revealed
          const rm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), runeMat(d.symbol, "#9fe0ff"));
          geos.push(rm.geometry);
          rm.rotation.y = Math.PI;
          root.add(rm);
          v.parts.rune = rm;
          v.parts.faint = true;
        }
        break;
      }
      case "slab": {
        const s = mesh(boxGeo(-0.55, 0.55, 0, 3.6, -2, 2, 2), castle);
        root.add(s);
        v.parts.s = s;
        break;
      }
      case "pillar": {
        const col = new THREE.Group();
        col.add(mesh(new THREE.CylinderGeometry(0.55, 0.6, 2.4, 12).translate(0, 1.2, 0), stone));
        col.add(mesh(new THREE.BoxGeometry(1.3, 0.2, 1.3).translate(0, 2.5, 0), stone));
        // a symbol on each of four faces
        SYMBOLS.forEach((sym, i) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: runeTex(sym), color: "#ffd890", transparent: true, opacity: 0.9, depthWrite: false }));
          mats.push(m.material);
          geos.push(m.geometry);
          const a = (i / 4) * Math.PI * 2;
          m.position.set(Math.sin(a) * 0.61, 1.6, Math.cos(a) * 0.61);
          m.rotation.y = a;
          col.add(m);
        });
        root.add(col);
        v.parts.col = col;
        v.parts.rot = (o.st.rot / 4) * Math.PI * 2;
        break;
      }
      case "wallSlide": {
        const w = mesh(boxGeo(-2, 2, 0, 7, -0.6, 0.6, 2), stone);
        root.add(w);
        const rm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), runeMat("lion", "#ffd890"));
        geos.push(rm.geometry);
        rm.position.set(0, 2.6, 0.62);
        root.add(rm);
        v.parts.w = w;
        v.parts.rune2 = rm;
        break;
      }
      case "secretDoor": {
        const w = mesh(boxGeo(-0.6, 0.6, 0, 7, -2, 2, 2), stone);
        root.add(w);
        v.parts.w = w;
        break;
      }
      case "bridge": {
        // twelve slabs: scattered in the depths until mended
        const slabs = [];
        for (let i = 0; i < 12; i++) {
          const s = mesh(boxGeo(-2.5, 2.5, -0.6, 0, -0.95, 0.95, 2), castle);
          const home = new THREE.Vector3(0, 0, -15 - 1.9 * i - 0.95 + 15);
          s.userData.home = home;
          s.userData.lost = new THREE.Vector3((Math.random() - 0.5) * 3, -10 - Math.random() * 10, home.z + (Math.random() - 0.5) * 4);
          s.userData.spin = new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          root.add(s);
          slabs.push(s);
        }
        // balustrade posts appear with the slabs
        root.position.set(-87, 0, -14.4);
        v.parts.slabs = slabs;
        break;
      }
      case "mirror": {
        const glass = mesh(new THREE.PlaneGeometry(2.4, 3.6), M({ color: "#c8d8e8", roughness: 0.05, metalness: 1, emissive: "#203048", emissiveIntensity: 0.4 }), false);
        glass.position.set(0, 0.1, 0);
        root.add(glass);
        const shards = [];
        for (let i = 0; i < 9; i++) {
          const s = mesh(new THREE.PlaneGeometry(0.8, 1.2), glass.material, false);
          s.userData.home = new THREE.Vector3(((i % 3) - 1) * 0.8, 0.1 + (Math.floor(i / 3) - 1) * 1.2, 0.01);
          s.userData.lost = new THREE.Vector3((Math.random() - 0.5) * 3, -2.3 + Math.random() * 0.1, 0.6 + Math.random() * 1.2);
          s.userData.rot = (Math.random() - 0.5) * 2;
          root.add(s);
          shards.push(s);
        }
        v.parts.glass = glass;
        v.parts.shards = shards;
        v.parts.light = sprite("#a8c8ff", 3);
        v.parts.light.position.z = 0.4;
        root.add(v.parts.light);
        break;
      }
      case "brazier": {
        const rm = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), runeMat(["I", "II", "III", "IV"][d.rune - 1], "#9fe0ff"));
        geos.push(rm.geometry);
        rm.position.set(0, -0.75, 0.32);
        root.add(rm);
        // face the room centre
        root.rotation.y = Math.atan2(-87 - o.x, -51 - o.z);
        v.parts.rune = rm;
        const src = { x: o.x, y: o.y, z: o.z, kind: "blue", s: 0.8, lit: false };
        fires.push(src);
        v.parts.src = src;
        break;
      }
      case "ancient": {
        const L = new THREE.Group();
        const R = new THREE.Group();
        L.position.set(-2, 0, 0);
        R.position.set(2, 0, 0);
        const leafM = M({ ...surface("darkWood"), color: "#ffffff", roughness: 0.6, metalness: 0.2 });
        L.add(mesh(boxGeo(0, 2, 0, 6.4, -0.25, 0.25, 2), leafM));
        R.add(mesh(boxGeo(-2, 0, 0, 6.4, -0.25, 0.25, 2), leafM));
        for (const [g, s] of [[L, 1], [R, -1]]) for (const y of [1, 3, 5]) g.add(mesh(boxGeo(s > 0 ? 0 : -2, s > 0 ? 2 : 0, y, y + 0.16, -0.32, 0.32, 1), iron));
        root.add(L, R);
        const sockets = [];
        ["sigil_lion", "sigil_eagle", "sigil_badger"].forEach((id, i) => {
          const sym = ["lion", "eagle", "badger"][i];
          const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ map: runeTex(sym), color: "#4a4030", emissive: "#ffd27a", emissiveMap: runeTex(sym), emissiveIntensity: 0.1, roughness: 0.4, metalness: 0.6, transparent: true }));
          mats.push(m.material);
          geos.push(m.geometry);
          m.position.set((i - 1) * 1.15, 3.6, 0.3);
          root.add(m);
          sockets.push(m);
        });
        v.parts.L = L;
        v.parts.R = R;
        v.parts.sockets = sockets;
        break;
      }
      case "pedestal": {
        const gem = mesh(new THREE.OctahedronGeometry(0.32, 0), M({ color: "#9fe8ff", emissive: "#5ac8ff", emissiveIntensity: 2.2, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.9 }), false);
        gem.position.y = 0.55;
        root.add(gem, sprite("#7fd8ff", 2.6));
        root.children[1].position.y = 0.55;
        const light = new THREE.PointLight("#7fd8ff", 6, 12, 1.6);
        light.position.y = 0.8;
        root.add(light);
        v.parts.gem = gem;
        break;
      }
      case "web": {
        const g = new THREE.CircleGeometry(3.4, 12);
        const m = mesh(g, M({ color: "#f0f0e8", transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }), false);
        m.scale.set(1, 1.1, 1);
        root.add(m);
        // radial strands
        const s = [];
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          s.push(boxGeo(-0.015, 0.015, 0, 3.6, -0.01, 0.01, 1).rotateZ(a));
        }
        v.parts.web = m;
        break;
      }
      case "pickup": {
        if (d.item === "dark_mask") {
          const m = mesh(new THREE.SphereGeometry(0.16, 14, 10, -Math.PI / 2, Math.PI, 0, Math.PI * 0.75).scale(1, 1.2, 0.7), M({ color: "#c8ccd4", metalness: 1, roughness: 0.2, side: THREE.DoubleSide }));
          m.rotation.x = -Math.PI / 2;
          m.position.y = 0.05;
          root.add(m, sprite("#c8ccd4", 0.8));
        } else {
          const disc = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20), gold);
          disc.rotation.x = Math.PI / 2;
          disc.position.y = 0.6;
          root.add(disc, sprite("#ffd27a", 1.4));
          root.children[1].position.y = 0.6;
          v.parts.spin = disc;
        }
        break;
      }
      case "lid": {
        const lid = mesh(new THREE.CylinderGeometry(1.2, 1.15, 0.35, 14), stone);
        lid.position.y = 0.95 - o.y + 0.17;
        root.add(lid);
        v.parts.lid = lid;
        break;
      }
      case "chest": {
        const body = mesh(boxGeo(-0.55, 0.55, 0, 0.5, -0.38, 0.38, 1), wood);
        const lidG = new THREE.Group();
        lidG.position.set(0, 0.5, -0.38);
        lidG.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, 0.38), wood));
        const bands = [boxGeo(-0.45, -0.37, 0, 0.52, -0.4, 0.4, 1), boxGeo(0.37, 0.45, 0, 0.52, -0.4, 0.4, 1)];
        for (const b of bands) root.add(mesh(b, gold, false));
        const lock = mesh(new THREE.BoxGeometry(0.12, 0.16, 0.06), gold, false);
        lock.position.set(0, 0.42, 0.41);
        root.add(body, lidG, lock);
        root.rotation.y = d.high ? 0 : Math.atan2(-o.x + (o.x > 0 ? o.x - 1 : o.x + 1), 1) * 0;
        v.parts.lid = lidG;
        v.parts.lock = lock;
        v.parts.sparkle = sprite("#ffd27a", 1.2);
        v.parts.sparkle.position.y = 0.9;
        root.add(v.parts.sparkle);
        break;
      }
      case "page": {
        const pg = mesh(new THREE.PlaneGeometry(0.34, 0.46), parchment, false);
        pg.position.y = 1.1;
        root.add(pg, sprite("#ffe6a0", 1.0));
        root.children[1].position.y = 1.1;
        v.parts.page = pg;
        break;
      }
      case "portkey": {
        const lan = new THREE.Group();
        lan.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 6).translate(0, 0.21, 0), M({ color: "#8a6a3a", metalness: 0.8, roughness: 0.4 })));
        lan.add(mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12).translate(0, 0.5, 0), iron));
        const sp = sprite("#9fe0ff", 1.8);
        sp.position.y = 0.25;
        lan.add(sp);
        root.add(lan);
        v.parts.lan = lan;
        break;
      }
      default:
        break;
    }
    if (root.children.length) {
      group.add(root);
      views.set(o, v);
    }
  }

  // ---------------------------------------------------------- moving platforms
  const platViews = [];
  for (const s of G.col.platforms) {
    const lift = s.def.lift;
    const g = new THREE.Group();
    g.add(mesh(boxGeo(-s.def.w / 2, s.def.w / 2, -0.35, 0, -s.def.d / 2, s.def.d / 2, 2), lift ? wood : stone));
    // glowing rune ring underneath (floating stones)
    if (!lift) {
      const rm = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.4, 24), new THREE.MeshBasicMaterial({ color: "#7fb8ff", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      mats.push(rm.material);
      geos.push(rm.geometry);
      rm.rotation.x = Math.PI / 2;
      rm.position.y = -0.4;
      g.add(rm);
    } else {
      for (const x of [-1.9, 1.9]) g.add(mesh(boxGeo(x - 0.05, x + 0.05, 0, 1.05, -2, 2, 1), iron, false));
    }
    group.add(g);
    platViews.push({ s, g });
  }
  // ---------------------------------------------------------- arena obelisks
  const obelisks = [];
  const obMat = M({ ...surface("hidden"), color: "#5a5866", roughness: 0.8 });
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.6, 1.0, 5, 4).rotateY(Math.PI / 4).translate(0, 2.5, 0), obMat));
    const glowM = new THREE.MeshBasicMaterial({ color: "#3dff8a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    mats.push(glowM);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), glowM);
    geos.push(core.geometry);
    core.position.y = 5.6;
    g.add(core);
    g.visible = false;
    group.add(g);
    obelisks.push({ g, core, glowM });
  }

  let t = 0;
  return {
    fires,
    update(dt) {
      t += dt;
      for (const [o, v] of views) {
        const a = o.anim;
        const vis = G.objects.visible(o) && !o.gone;
        v.root.visible = vis || o.type === "chest";
        if (!vis && o.type !== "chest") continue;
        const P = v.parts;
        switch (o.type) {
          case "feather":
            v.root.position.y = o.y + a.lift * 1.6 + (a.lift > 0 ? Math.sin(t * 2.4 + o.x) * 0.1 : 0);
            P.f.rotation.z = a.lift > 0 ? Math.sin(t * 3 + o.z) * 0.6 : 0;
            break;
          case "cushion":
          case "bookItem":
            if (a.fly > 0 && o.flyFrom) {
              const k = 1 - a.fly;
              const p = G.player;
              v.root.position.set(o.flyFrom.x + (p.x - o.flyFrom.x) * k, o.flyFrom.y + (p.y + 1.3 - o.flyFrom.y) * k + Math.sin(k * Math.PI) * 1.2, o.flyFrom.z + (p.z - o.flyFrom.z) * k);
              v.root.rotation.y += dt * 8;
            }
            break;
          case "gate":
            P.l.rotation.y = -a.lift * 1.6;
            P.r.rotation.y = a.lift * 1.6;
            P.lock.visible = a.lift < 0.05;
            break;
          case "reveal": {
            const target = o.st.revealed ? 1 : 0;
            const m = P.rune.material;
            const base = P.faint ? 0.08 : 0;
            m.opacity += (Math.max(base, target * (0.85 + Math.sin(t * 3) * 0.12)) - m.opacity) * Math.min(1, dt * 3);
            break;
          }
          case "slab":
            P.s.position.y = a.lift * 3.7;
            break;
          case "pillar": {
            const want = (o.st.rot / 4) * Math.PI * 2;
            let d = want - P.rot;
            if (d < -Math.PI) d += Math.PI * 2;
            P.rot += d * Math.min(1, dt * 6);
            P.col.rotation.y = P.rot + Math.PI;
            break;
          }
          case "wallSlide":
          case "secretDoor":
            P.w.position.y = -a.lift * 7.2;
            if (P.rune2) P.rune2.material.opacity = 0.25 + (G.flag("pillarsSolved") ? 0.7 : 0);
            if (P.rune2) P.rune2.position.y = 2.6 - a.lift * 7.2;
            break;
          case "bridge":
            P.slabs.forEach((s, i) => {
              const k = Math.max(0, Math.min(1, a.lift * 1.6 - i * 0.05));
              const e = k * k * (3 - 2 * k);
              s.position.lerpVectors(s.userData.lost, s.userData.home, e);
              s.rotation.set(s.userData.spin.x * (1 - e), s.userData.spin.y * (1 - e), s.userData.spin.z * (1 - e));
              s.visible = e > 0.001 || true;
            });
            break;
          case "mirror":
            P.glass.visible = a.lift > 0.98;
            P.shards.forEach((s) => {
              s.position.lerpVectors(s.userData.lost, s.userData.home, a.lift);
              s.rotation.z = s.userData.rot * (1 - a.lift);
              s.rotation.x = -1.3 * (1 - a.lift);
              s.visible = a.lift < 0.98;
            });
            P.light.material.opacity = a.lift * (0.5 + Math.sin(t * 2) * 0.2);
            break;
          case "brazier":
            P.src.lit = o.st.lit;
            P.rune.material.opacity = Math.max(0.1, o.st.revealed ? 0.85 : 0);
            break;
          case "ancient": {
            const placed = G.flag("sigilsPlaced");
            P.sockets.forEach((s, i) => (s.material.emissiveIntensity = placed ? 2.2 : G.count(["sigil_lion", "sigil_eagle", "sigil_badger"][i]) ? 0.6 + Math.sin(t * 3) * 0.3 : 0.1));
            P.L.rotation.y = -a.lift * 1.4;
            P.R.rotation.y = a.lift * 1.4;
            break;
          }
          case "pedestal":
            P.gem.rotation.y += dt * 1.4;
            P.gem.position.y = 0.6 + Math.sin(t * 2) * 0.08;
            break;
          case "web":
            P.web.material.opacity = 0.55;
            break;
          case "pickup":
            if (P.spin) P.spin.rotation.z += dt * 2;
            break;
          case "lid":
            P.lid.position.y = 0.95 - o.y + 0.17 + a.lift * 2.4 + (a.lift > 0.9 ? Math.sin(t * 2) * 0.1 : 0);
            break;
          case "chest": {
            if (a.fly > 0 && o.flyFrom) {
              const k = 1 - a.fly;
              v.root.position.set(o.flyFrom.x + (o.x - o.flyFrom.x) * k, o.flyFrom.y + (o.y - o.flyFrom.y) * k + Math.sin(k * Math.PI) * 0.8, o.flyFrom.z + (o.z - o.flyFrom.z) * k);
            } else v.root.position.set(o.x, o.y, o.z);
            P.lid.rotation.x += ((o.st.opened ? -1.9 : 0) - P.lid.rotation.x) * Math.min(1, dt * 5);
            P.lock.visible = !(o.st.unlocked || !o.def.locked) || false;
            P.sparkle.visible = !o.st.opened;
            P.sparkle.material.opacity = 0.35 + Math.sin(t * 3 + o.x) * 0.2;
            break;
          }
          case "page":
            P.page.rotation.y += dt;
            P.page.position.y = 1.1 + Math.sin(t * 2 + o.x) * 0.08;
            break;
          case "portkey":
            P.lan.rotation.y += dt * 0.6;
            break;
          default:
            break;
        }
      }
      // emit puffs for revealed tracks / glowing pages occasionally
      for (const { s, g } of platViews) {
        g.position.set((s.x0 + s.x1) / 2, s.y1, (s.z0 + s.z1) / 2);
        g.visible = s.y1 > -50;
      }
      const obs = G.obelisks || [];
      obelisks.forEach((ob, i) => {
        const o = obs[i];
        ob.g.visible = !!o && G.flag("arena");
        if (!o) return;
        ob.g.position.set(o.x, 0, o.z);
        ob.glowM.opacity = o.dead ? 0 : o.active ? 0.8 + Math.sin(t * 6) * 0.2 : 0.15;
        ob.core.rotation.y += dt * 2;
        ob.g.rotation.z = o.dead ? Math.min(0.5, (ob.g.rotation.z || 0) + dt) : 0;
        if (o.active && !o.dead && Math.random() < 0.2) fx.spell(o.x, 5.6, o.z, [0.2, 1, 0.5], 0.5, 0.6, 0.6);
      });
    },
    dispose() {
      scene.remove(group);
      mats.forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
    },
  };
}

function mergeTwo(a, b) {
  const pa = a.attributes.position.array;
  const pb = b.attributes.position.array;
  const na = a.attributes.normal.array;
  const nb = b.attributes.normal.array;
  const ua = a.attributes.uv.array;
  const ub = b.attributes.uv.array;
  const g = new THREE.BufferGeometry();
  const cat = (x, y) => {
    const o = new Float32Array(x.length + y.length);
    o.set(x);
    o.set(y, x.length);
    return o;
  };
  g.setAttribute("position", new THREE.BufferAttribute(cat(pa, pb), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(cat(na, nb), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(cat(ua, ub), 2));
  return g;
}
