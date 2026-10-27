/**
 * Oceanbound — islands, reefs and the seabed on screen.
 *
 * Each island gets a radial terrain mesh built from the sim's own
 * islandHeight() (so what you see is what you walk on), vertex-coloured per
 * island type, plus one InstancedMesh per (model, material) for its nodes —
 * trees, rocks, pickups, landmarks — and scattered grass/fern decor. A node
 * that is harvested has its instance hidden; chopped trees topple first.
 * Views stream in/out with distance (one build per frame at most).
 *
 * The seabed is a camera-following height-mapped tile (reef mounds
 * included) over a flat far plane.
 */
import * as THREE from "three";
import { islandHeight, islandZone, islandNodes, islandsNear, reefsNear, reefNodes, groundHeight, SEABED } from "../sim/islands.js";
import { hash, rng, smoothstep } from "../sim/util.js";
import { geoParts, MATS, PALM_VARIANTS, crabParts } from "./models.js";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

const TYPE_COL = {
  palm: { grass: "#86b54e", grass2: "#a3c45e", sand: "#ecdcab", rock: "#a49e90" },
  rocky: { grass: "#8a9a5a", grass2: "#7d8a52", sand: "#d9cfae", rock: "#8e8a82" },
  jungle: { grass: "#3f7d2f", grass2: "#4f8f36", sand: "#e3d3a2", rock: "#7d7a6e" },
};

function nodeKey(n) {
  const h = hash(n.id, Math.round(n.x * 10), Math.round(n.z * 10));
  switch (n.type) {
    case "palm":
      return `palm${h % PALM_VARIANTS}`;
    case "jtree":
      return `jtree${h % 3}`;
    case "bamboo":
      return h % 2 ? "bamboo" : "bamboo2";
    case "rock":
      return h % 2 ? "rock" : "rock2";
    case "coral":
      return `coral${h % 4}`;
    default:
      return n.type;
  }
}
function nodeMatrix(n, out) {
  let s = n.s || 1;
  if (n.type === "rock") s = (n.r || 1) * (n.s || 1);
  if (n.type === "boulder") s = 0.95 * (n.s || 1);
  if (n.type === "coral") s = n.s || 1;
  const sink = n.type === "rock" || n.type === "boulder" ? -0.25 * s : n.type === "palm" || n.type === "jtree" ? -0.05 : 0;
  _p.set(n.x, n.y + sink, n.z);
  _e.set(0, n.rot || 0, 0);
  _q.setFromEuler(_e);
  _s.set(s, s, s);
  return out.compose(_p, _q, _s);
}

/* ------------------------------------------------------------------ instanced node sets */
function createNodeSet(nodes, extra = []) {
  const groups = new Map();
  const add = (key, n) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  };
  for (const n of nodes) {
    add(nodeKey(n), n);
    if (n.type === "mango") add("mangoFruit", n);
  }
  for (const [key, list] of extra) for (const n of list) add(key, n);
  const root = new THREE.Group();
  const slots = new Map(); // node id → [{ mesh, index }]
  const base = new Map();
  for (const [key, list] of groups) {
    const parts = geoParts(key);
    if (!parts) continue;
    for (const [geo, mk] of parts) {
      const im = new THREE.InstancedMesh(geo, MATS[mk], list.length);
      im.castShadow = !["stone", "coconut", "clay", "page", "scrap", "tuft", "fern", "coral0", "coral1", "coral2", "coral3"].includes(key) && mk !== "glow";
      im.receiveShadow = true;
      list.forEach((n, i) => {
        const m = n.matrix || nodeMatrix(n, new THREE.Matrix4());
        im.setMatrixAt(i, m);
        if (n.id != null && !n.decor) {
          const k = key === "mangoFruit" ? `f${n.id}` : n.id;
          if (!slots.has(k)) slots.set(k, []);
          slots.get(k).push({ mesh: im, index: i });
          base.set(k, m);
        }
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      root.add(im);
    }
  }
  return {
    root,
    slots,
    base,
    setVisible(k, on) {
      const sl = slots.get(k);
      if (!sl) return;
      for (const { mesh, index } of sl) {
        mesh.setMatrixAt(index, on ? base.get(k) : HIDE);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    setMatrix(k, m) {
      const sl = slots.get(k);
      if (!sl) return;
      for (const { mesh, index } of sl) {
        mesh.setMatrixAt(index, m);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      root.traverse((o) => o.isInstancedMesh && o.dispose());
    },
  };
}

/* ------------------------------------------------------------------ terrain */
function terrainGeo(I, quality) {
  const rings = quality === "low" ? 40 : quality === "high" ? 72 : 56;
  const segs = quality === "low" ? 64 : quality === "high" ? 144 : 104;
  const R = I.r * 2.05;
  const pos = [];
  const uv = [];
  const colr = [];
  const idx = [];
  const C = TYPE_COL[I.type];
  const sand = new THREE.Color(C.sand);
  const grass = new THREE.Color(C.grass);
  const grass2 = new THREE.Color(C.grass2);
  const rockC = new THREE.Color(C.rock);
  const under = new THREE.Color("#d4c39a");
  const radius = (k) => R * Math.pow(k / rings, 1.15);
  const vert = (x, z) => {
    const h = islandHeight(I, x, z);
    pos.push(x - I.x, h, z - I.z);
    uv.push(x * 0.22, z * 0.22);
  };
  vert(I.x, I.z);
  for (let k = 1; k <= rings; k++) {
    const r = radius(k);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      vert(I.x + Math.cos(a) * r, I.z + Math.sin(a) * r);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let k = 1; k < rings; k++) {
    const a0 = 1 + (k - 1) * segs;
    const b0 = 1 + k * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, a0 + s1, b0 + s1, a0 + s, b0 + s1, b0 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const p = g.attributes.position;
  const R0 = rng(I.seed);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + I.x;
    const z = p.getZ(i) + I.z;
    const h = p.getY(i);
    const zone = islandZone(I, x, z);
    const slope = 1 - n.getY(i);
    if (h < -0.3) _c.copy(under);
    else _c.copy(sand);
    const grassK = smoothstep(I.beach + 0.02, I.beach - 0.1, zone) * smoothstep(0.6, 1.4, h);
    _c.lerp(R0() < 0.5 ? grass : grass2, grassK);
    const rockK = smoothstep(0.18, 0.42, slope) * (I.type === "rocky" ? 1 : 0.7) + (I.type === "rocky" ? smoothstep(3, 7, h) * 0.6 : 0);
    _c.lerp(rockC, Math.min(1, rockK));
    const v = 0.93 + R0() * 0.1;
    colr.push(_c.r * v, _c.g * v, _c.b * v);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.computeBoundingSphere();
  return g;
}

/** grass / fern tufts on the island interior */
function decor(I, quality) {
  const R = rng(I.seed ^ 0x77);
  const count = { low: 90, medium: 220, high: 380 }[quality] || 220;
  const tufts = [];
  const ferns = [];
  for (let k = 0, tries = 0; k < count && tries < count * 6; tries++) {
    const a = R() * Math.PI * 2;
    const t = Math.sqrt(R()) * 0.95;
    const x = I.x + Math.cos(a) * I.r * t;
    const z = I.z + Math.sin(a) * I.r * t;
    const zone = islandZone(I, x, z);
    const h = islandHeight(I, x, z);
    if (h < 0.5) continue;
    const inland = zone < I.beach - 0.02;
    if (!inland && R() > 0.15) continue;
    const m = new THREE.Matrix4();
    const s = R.range(0.7, 1.3) * (I.type === "jungle" ? 1.25 : 1);
    _p.set(x, h - 0.03, z);
    _e.set(0, R() * 6.28, 0);
    _q.setFromEuler(_e);
    _s.set(s, s * R.range(0.8, 1.3), s);
    m.compose(_p, _q, _s);
    const item = { decor: true, matrix: m };
    if (I.type === "jungle" ? R() < 0.45 : R() < 0.12) ferns.push(item);
    else if (I.type !== "rocky" || R() < 0.6) tufts.push(item);
    k++;
  }
  return [
    ["tuft", tufts],
    ["fern", ferns],
  ];
}

/* ------------------------------------------------------------------ crabs (ambient) */
function createCrabs(I) {
  if (I.type === "rocky" && I.seed % 2) return null;
  const R = rng(I.seed ^ 0x3c);
  const parts = crabParts();
  const n = 4;
  const ims = parts.map(([g, k]) => {
    const im = new THREE.InstancedMesh(g, MATS[k], n);
    im.castShadow = true;
    im.frustumCulled = false;
    return im;
  });
  const crabs = [];
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2;
    crabs.push({ a, t: R.range(0.82, 0.95), x: 0, z: 0, yaw: R() * 6.28, wait: R() * 3, vx: 0, vz: 0, hide: 0 });
  }
  const group = new THREE.Group();
  ims.forEach((m) => group.add(m));
  const at = (c) => {
    const rn = I.r;
    c.x = I.x + Math.cos(c.a) * rn * c.t;
    c.z = I.z + Math.sin(c.a) * rn * c.t;
  };
  crabs.forEach(at);
  const api = {
    group,
    update(dt, P, time) {
      crabs.forEach((c, i) => {
        const dx = c.x - P.x;
        const dz = c.z - P.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.5) {
          // scuttle away sideways, fast
          c.vx = (dx / d) * 2.6;
          c.vz = (dz / d) * 2.6;
          c.wait = 1.2;
        } else if ((c.wait -= dt) <= 0) {
          const a = Math.random() * 6.28;
          c.vx = Math.cos(a) * 0.5;
          c.vz = Math.sin(a) * 0.5;
          c.wait = 1 + Math.random() * 3;
          if (Math.random() < 0.4) c.vx = c.vz = 0;
        }
        let nx = c.x + c.vx * dt;
        let nz = c.z + c.vz * dt;
        const z = islandZone(I, nx, nz);
        if (z < 0.7 || z > 1.02) {
          c.vx = -c.vx;
          c.vz = -c.vz;
          nx = c.x;
          nz = c.z;
        }
        c.x = nx;
        c.z = nz;
        const moving = Math.hypot(c.vx, c.vz) > 0.05;
        if (moving) c.yaw = Math.atan2(c.vx, c.vz) + Math.PI / 2;
        const y = islandHeight(I, c.x, c.z) + (moving ? Math.abs(Math.sin(time * 22 + i)) * 0.03 : 0);
        _p.set(c.x, y, c.z);
        _e.set(0, c.yaw, moving ? Math.sin(time * 30 + i) * 0.06 : 0);
        _q.setFromEuler(_e);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        for (const im of ims) im.setMatrixAt(i, _m);
      });
      for (const im of ims) im.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      ims.forEach((m) => m.dispose());
    },
  };
  // place them on the beach right away (instances default to the origin)
  api.update(0, { x: 1e9, z: 1e9 }, 0);
  return api;
}

/* ------------------------------------------------------------------ one island */
function createIslandView(G, I, quality) {
  const nodes = islandNodes(G.world, I);
  const group = new THREE.Group();
  const tg = terrainGeo(I, quality);
  const terrain = new THREE.Mesh(tg, MATS.terrain);
  terrain.position.set(I.x, 0, I.z);
  terrain.receiveShadow = true;
  group.add(terrain);
  const set = createNodeSet(nodes, decor(I, quality));
  group.add(set.root);
  const crabs = createCrabs(I);
  if (crabs) group.add(crabs.group);
  const anims = new Map();
  const shown = new Map();
  return {
    id: I.id,
    I,
    group,
    set,
    sync(G, dt, time) {
      const st = G.islandState[I.id];
      for (const n of nodes) {
        if (n.type === "coral" || n.type === "arch" || n.type === "cave" || n.type === "shrine" || n.type === "wreck" || n.type === "rock") continue;
        const gone = !!(st && st.gone && st.gone[n.id] != null);
        if (anims.has(n.id)) continue;
        if (shown.get(n.id) !== !gone) {
          shown.set(n.id, !gone);
          set.setVisible(n.id, !gone);
        }
        if (n.type === "mango") {
          const picked = !!(st && st.fruit && st.fruit[n.id] != null);
          const fk = `f${n.id}`;
          if (shown.get(fk) !== !picked) {
            shown.set(fk, !picked);
            set.setVisible(fk, !picked);
          }
        }
      }
      // felling / wobble animations
      for (const [id, A] of anims) {
        A.t += dt;
        const n = nodes[id];
        const base = set.base.get(id);
        if (A.kind === "wobble") {
          const w = Math.sin(A.t * 40) * 0.05 * (1 - A.t / 0.35);
          _m.makeRotationAxis(A.axis, w);
          _m.premultiply(new THREE.Matrix4().makeTranslation(n.x, n.y, n.z)).multiply(new THREE.Matrix4().makeTranslation(-n.x, -n.y, -n.z));
          set.setMatrix(id, _m.clone().multiply(base));
          if (A.t > 0.35) {
            anims.delete(id);
            set.setMatrix(id, base);
          }
        } else {
          const fall = Math.min(1, (A.t / 1.4) ** 2) * (Math.PI / 2 - 0.12);
          const sink = Math.max(0, A.t - 1.8) * 0.9;
          const sc = Math.max(0, 1 - Math.max(0, A.t - 2.2) * 1.5);
          const piv = new THREE.Matrix4().makeTranslation(n.x, n.y - sink, n.z);
          const rot = new THREE.Matrix4().makeRotationAxis(A.axis, fall);
          const sm = new THREE.Matrix4().makeScale(sc, sc, sc);
          const back = new THREE.Matrix4().makeTranslation(-n.x, -n.y, -n.z);
          set.setMatrix(id, piv.multiply(rot).multiply(sm).multiply(back).multiply(base));
          if (A.t > 2.9) {
            anims.delete(id);
            set.setVisible(id, false);
            shown.set(id, false);
          }
        }
      }
      if (crabs && Math.hypot(G.player.x - I.x, G.player.z - I.z) < I.r + 40) crabs.update(dt, G.player, time);
    },
    event(e, G) {
      if (e.owner !== I.id && !(e.t === "treeFall" || e.t === "rockBreak")) return;
      if (e.t === "chop" || e.t === "mine") {
        if (!anims.has(e.node)) anims.set(e.node, { kind: "wobble", t: 0, axis: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize() });
      }
      if (e.t === "treeFall") {
        // find the node at that position
        const n = nodes.find((q) => Math.abs(q.x - e.x) < 0.01 && Math.abs(q.z - e.z) < 0.01);
        if (!n) return;
        if (n.type === "palm" || n.type === "jtree" || n.type === "bamboo") {
          const P = G.player;
          const away = new THREE.Vector3(n.x - P.x, 0, n.z - P.z).normalize();
          const axis = new THREE.Vector3(away.z, 0, -away.x);
          anims.set(n.id, { kind: "fall", t: 0, axis });
        }
      }
    },
    dispose() {
      tg.dispose();
      set.dispose();
      crabs?.dispose();
    },
  };
}

function createReefView(Rf) {
  const nodes = reefNodes(Rf);
  const set = createNodeSet(nodes);
  return {
    id: Rf.id,
    group: set.root,
    set,
    shown: new Map(),
    sync(G) {
      const st = G.islandState[Rf.id];
      for (const n of nodes) {
        if (n.type === "coral") continue;
        const gone = !!(st && st.gone && st.gone[n.id] != null);
        if (this.shown.get(n.id) !== !gone) {
          this.shown.set(n.id, !gone);
          set.setVisible(n.id, !gone);
        }
      }
    },
    event() {},
    dispose() {
      set.dispose();
    },
  };
}

/* ------------------------------------------------------------------ seabed */
function createSeabed(G) {
  const S = 180;
  const N = 72;
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  const cols = new Float32Array(geo.attributes.position.count * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const near = new THREE.Mesh(geo, MATS.terrain);
  near.receiveShadow = true;
  const farGeo = new THREE.RingGeometry(80, 1800, 48, 4);
  farGeo.rotateX(-Math.PI / 2);
  const fc = new Float32Array(farGeo.attributes.position.count * 3).fill(0.75);
  farGeo.setAttribute("color", new THREE.BufferAttribute(fc, 3));
  const far = new THREE.Mesh(farGeo, MATS.terrain);
  far.position.y = SEABED - 0.6;
  const grp = new THREE.Group();
  grp.add(near, far);
  let cx = Infinity;
  let cz = Infinity;
  const sand = new THREE.Color("#cdbb92");
  const dark = new THREE.Color("#8f8a74");
  const rebuild = (x, z) => {
    cx = Math.round(x / 12) * 12;
    cz = Math.round(z / 12) * 12;
    near.position.set(cx, 0, cz);
    const p = geo.attributes.position;
    const isl = islandsNear(G.world, cx, cz, S);
    for (let i = 0; i < p.count; i++) {
      const wx = p.getX(i) + cx;
      const wz = p.getZ(i) + cz;
      const h = groundHeight(G.world, wx, wz, isl);
      // let island terrain meshes win near the islands
      p.setY(i, Math.min(h, h > -3 ? -6 : h));
      const k = (hash(Math.round(wx), Math.round(wz)) % 100) / 100;
      _c.copy(sand).lerp(dark, k * 0.35 + Math.max(0, h - SEABED) * 0.04);
      cols[i * 3] = _c.r;
      cols[i * 3 + 1] = _c.g;
      cols[i * 3 + 2] = _c.b;
    }
    p.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  return {
    group: grp,
    update(cam) {
      far.position.x = cam.x;
      far.position.z = cam.z;
      if (Math.abs(cam.x - cx) > 24 || Math.abs(cam.z - cz) > 24) rebuild(cam.x, cam.z);
    },
    dispose() {
      geo.dispose();
      farGeo.dispose();
    },
  };
}

/* ------------------------------------------------------------------ manager */
export function createIslandsView(G, scene, quality) {
  const views = new Map();
  const reefs = new Map();
  const seabed = createSeabed(G);
  scene.add(seabed.group);
  let q = quality;
  return {
    views,
    update(G, cam, dt, time) {
      seabed.update(cam);
      // stream islands
      let built = false;
      for (const I of islandsNear(G.world, cam.x, cam.z, 700)) {
        if (views.has(I.id) || built) continue;
        const v = createIslandView(G, I, q);
        views.set(I.id, v);
        scene.add(v.group);
        built = true;
      }
      for (const [id, v] of views) {
        if (Math.hypot(v.I.x - cam.x, v.I.z - cam.z) > 860) {
          scene.remove(v.group);
          v.dispose();
          views.delete(id);
        } else v.sync(G, dt, time);
      }
      for (const Rf of reefsNear(G.world, cam.x, cam.z, 110)) {
        if (reefs.has(Rf.id)) continue;
        const v = createReefView(Rf);
        reefs.set(Rf.id, v);
        scene.add(v.group);
      }
      for (const [id, v] of reefs) {
        const Rf = G.world.reefs.get(id);
        if (!Rf || Math.hypot(Rf.x - cam.x, Rf.z - cam.z) > 160) {
          scene.remove(v.group);
          v.dispose();
          reefs.delete(id);
        } else v.sync(G);
      }
    },
    event(e, G) {
      for (const v of views.values()) v.event(e, G);
    },
    setQuality(nq) {
      if (nq === q) return;
      q = nq;
      for (const [id, v] of views) {
        scene.remove(v.group);
        v.dispose();
        views.delete(id);
      }
    },
    dispose() {
      for (const v of views.values()) {
        scene.remove(v.group);
        v.dispose();
      }
      for (const v of reefs.values()) {
        scene.remove(v.group);
        v.dispose();
      }
      views.clear();
      reefs.clear();
      scene.remove(seabed.group);
      seabed.dispose();
    },
  };
}
