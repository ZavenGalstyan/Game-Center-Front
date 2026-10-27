/**
 * Oceanbound — the raft on screen.
 *
 * Foundations are instanced (planks, cross-beams, floats, rope lashings) and
 * rebuilt whenever the raft's version changes; damaged foundations darken,
 * lose planks and shake while the shark is biting. Every other piece is a
 * small group of shared-geometry meshes; stations show their live state
 * (fire, steam, water, food on the grill, ingots, catches), the sail billows
 * and turns to its heading, the anchor rope pays out into the sea.
 * Also owns the translucent green / red build ghost.
 */
import * as THREE from "three";
import { CELL, WALL_H, MAX_CELLS, stairsDir, edgeBox, isEdgeCell } from "../sim/raft.js";
import { STATIONS } from "../data/items.js";
import { hash, rng } from "../sim/util.js";
import { dotTex } from "./textures.js";
import { geoParts, getModel, MATS, RAFT_PLANKS, sailClothGeo, anchorStoneGeo, meshes } from "./models.js";

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const PLANK_COLS = ["#f2dcc0", "#e6ceb0", "#f8e6cc", "#dcc6a8", "#ecd8bc"].map((c) => new THREE.Color(c));
let GLOW_MAT = null;
const FLOAT_COLS = ["#2f77c4", "#e08a2e", "#e9e6df", "#3d9a6a"].map((c) => new THREE.Color(c));

function instanced(key, count) {
  return geoParts(key).map(([g, k]) => {
    const im = new THREE.InstancedMesh(g, MATS[k], count);
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = 0;
    im.frustumCulled = false;
    return im;
  });
}

/** world-agnostic: placement transform of a piece inside the raft group */
export function pieceTransform(p, obj) {
  const y = (p.level || 0) * WALL_H;
  if (p.kind === "edge") {
    if (p.side === "z") obj.position.set((p.i + 0.5) * CELL, y, p.j * CELL);
    else obj.position.set(p.i * CELL, y, (p.j + 0.5) * CELL);
    if (p.type === "net" || p.type === "trap") {
      const out = p.out || 1;
      obj.rotation.set(0, p.side === "z" ? (out > 0 ? 0 : Math.PI) : out > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    } else obj.rotation.set(0, p.side === "z" ? 0 : Math.PI / 2, 0);
  } else {
    obj.position.set((p.i + 0.5) * CELL, p.type === "roof" ? 0 : y, (p.j + 0.5) * CELL);
    obj.rotation.set(0, ((p.rot || 0) * Math.PI) / 2, 0);
  }
}

function makePiece(p) {
  const grp = new THREE.Group();
  const v = { group: grp, type: p.type };
  if (p.type === "door") {
    grp.add(getModel("doorFrame"));
    const pivot = new THREE.Group();
    pivot.position.set(-0.47, 0, 0);
    pivot.add(getModel("doorLeaf"));
    grp.add(pivot);
    v.leaf = pivot;
    v.open = p.state.open ? 1 : 0;
  } else if (p.type === "sail") {
    const mast = getModel("sail");
    const pivot = new THREE.Group();
    pivot.add(mast);
    const cloth = meshes([[sailClothGeo()[0][0].clone(), "cloth"]]);
    pivot.add(cloth);
    grp.add(pivot);
    v.pivot = pivot;
    v.cloth = cloth.children[0];
    v.base = Float32Array.from(v.cloth.geometry.attributes.position.array);
    v.furl = 0;
  } else if (p.type === "anchor") {
    grp.add(getModel("anchor"));
    const stone = meshes(anchorStoneGeo());
    grp.add(stone);
    v.stone = stone;
    v.drop = 0;
  } else {
    const m = getModel(p.type === "window" ? "window" : p.type);
    if (m) grp.add(m);
  }
  // station extras
  if (["purifier", "purifier2", "grill", "grill2", "smelter"].includes(p.type)) {
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 7, 1, true), MATS.fire);
    fire.position.set(p.type === "smelter" ? 0 : 0, p.type === "smelter" ? 0.42 : p.type === "grill2" || p.type === "purifier2" ? 0.35 : 0.12, p.type === "smelter" ? 0.5 : 0);
    fire.visible = false;
    grp.add(fire);
    v.fire = fire;
    // a soft additive glow sprite instead of a real light (lights force shader recompiles)
    const glow = new THREE.Sprite(GLOW_MAT);
    glow.position.copy(fire.position);
    glow.position.y += 0.15;
    glow.scale.setScalar(1.3);
    glow.visible = false;
    grp.add(glow);
    v.glow = glow;
  }
  if (p.type === "purifier" || p.type === "purifier2") {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.02, 10), MATS.waterIn);
    w.position.set(p.type === "purifier" ? 0.42 : 0.62, p.type === "purifier" ? 0.12 : 0.55, 0);
    w.visible = false;
    grp.add(w);
    v.water = w;
  }
  if (p.type === "grill" || p.type === "grill2") {
    v.food = [];
    for (let k = 0; k < 2; k++) {
      const f = getModel("f_fish_raw", { shadow: false });
      f.scale.setScalar(2.2);
      f.position.set(k ? 0.22 : -0.12, p.type === "grill" ? 0.62 : 0.72, 0);
      f.rotation.y = Math.PI / 2;
      f.visible = false;
      grp.add(f);
      v.food.push(f);
    }
    v.foodCooked = [];
    for (let k = 0; k < 2; k++) {
      const f = getModel("f_fish_cooked", { shadow: false });
      f.scale.setScalar(2.2);
      f.position.copy(v.food[k].position);
      f.rotation.y = Math.PI / 2;
      f.visible = false;
      grp.add(f);
      v.foodCooked.push(f);
    }
  }
  if (p.type === "smelter") {
    const ing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.1), MATS.metal);
    ing.position.set(0.5, 0.05, 0.4);
    ing.visible = false;
    grp.add(ing);
    v.ingot = ing;
  }
  if (p.type === "net") {
    v.catch = [];
    for (let k = 0; k < 4; k++) {
      const m = getModel(["d_plank", "d_plastic", "d_leaf", "d_barrel"][k], { shadow: false });
      m.scale.setScalar(0.6);
      m.position.set(-0.45 + k * 0.3, -0.25, 0.75);
      m.visible = false;
      grp.add(m);
      v.catch.push(m);
    }
  }
  if (p.type === "trap") {
    v.fish = [];
    for (let k = 0; k < 3; k++) {
      const m = getModel("f_fish_raw", { shadow: false });
      m.scale.setScalar(1.6);
      m.position.set(-0.25 + k * 0.25, -0.35, 0.55);
      m.visible = false;
      grp.add(m);
      v.fish.push(m);
    }
  }
  pieceTransform(p, grp);
  return v;
}

export function createRaftView(scene) {
  GLOW_MAT = new THREE.SpriteMaterial({ map: dotTex(), color: "#ff9a4a", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const root = new THREE.Group();
  scene.add(root);
  const parts = {
    plank: instanced("r_plank", MAX_CELLS * RAFT_PLANKS),
    beam: instanced("r_beam", MAX_CELLS * 2),
    float: instanced("r_float", MAX_CELLS),
    rope: instanced("r_rope", MAX_CELLS * 2),
  };
  for (const list of Object.values(parts)) for (const im of list) root.add(im);
  const pieces = new Map();
  let version = -1;
  let cellList = [];
  let ghost = null;
  let ghostKey = "";
  const ghostRoot = new THREE.Group();
  root.add(ghostRoot);

  function rebuildFoundations(R, bite) {
    cellList = [...R.cells.values()];
    let np = 0;
    let nb = 0;
    let nf = 0;
    let nr = 0;
    for (const c of cellList) {
      const h = hash(c.i + 100, c.j + 100);
      const dmg = 1 - c.hp / 100;
      const shake = bite && bite.i === c.i && bite.j === c.j ? 0.035 : 0;
      for (let k = 0; k < RAFT_PLANKS; k++) {
        if (dmg > 0.62 && k === (h % RAFT_PLANKS)) continue; // a missing plank
        const z = c.j * CELL + ((k + 0.5) / RAFT_PLANKS) * CELL;
        const r = rng(h + k * 7);
        _p.set((c.i + 0.5) * CELL + r.range(-0.02, 0.02) + (shake ? (Math.random() - 0.5) * shake : 0), r.range(-0.012, 0.01) - dmg * 0.03 * (k % 2), z);
        _e.set(r.range(-0.012, 0.012) + dmg * 0.05 * (k % 2 ? 1 : -1), r.range(-0.02, 0.02), r.range(-0.01, 0.01));
        _q.setFromEuler(_e);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        _c.copy(PLANK_COLS[(h + k) % PLANK_COLS.length]).multiplyScalar(1 - dmg * 0.45);
        for (const im of parts.plank) {
          im.setMatrixAt(np, _m);
          im.setColorAt(np, _c);
        }
        np++;
      }
      for (const off of [0.18, CELL - 0.18]) {
        _m.makeTranslation(c.i * CELL + off, 0, (c.j + 0.5) * CELL);
        for (const im of parts.beam) im.setMatrixAt(nb, _m);
        nb++;
      }
      _m.makeTranslation((c.i + 0.5) * CELL, 0, (c.j + 0.5) * CELL);
      _c.copy(FLOAT_COLS[h % FLOAT_COLS.length]);
      for (const im of parts.float) {
        im.setMatrixAt(nf, _m);
        im.setColorAt(nf, _c);
      }
      nf++;
      if (isEdgeCell(R, c.i, c.j)) {
        for (const [ox, oz] of [
          [0.18, 0.12],
          [CELL - 0.18, CELL - 0.12],
        ]) {
          _m.makeTranslation(c.i * CELL + ox, 0, c.j * CELL + oz);
          for (const im of parts.rope) im.setMatrixAt(nr, _m);
          nr++;
        }
      }
    }
    const fin = (list, n) => {
      for (const im of list) {
        im.count = n;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    };
    fin(parts.plank, np);
    fin(parts.beam, nb);
    fin(parts.float, nf);
    fin(parts.rope, nr);
  }

  function syncPieces(R) {
    for (const [id, v] of pieces) {
      if (!R.pieces.has(id)) {
        root.remove(v.group);
        pieces.delete(id);
      }
    }
    for (const p of R.pieces.values()) {
      if (!pieces.has(p.id)) {
        const v = makePiece(p);
        pieces.set(p.id, v);
        root.add(v.group);
      }
    }
  }

  let lastHp = "";
  return {
    root,
    pieces,
    update(G, dt, time, fx) {
      const R = G.raft;
      root.position.set(R.x, R.y, R.z);
      root.rotation.set(R.pitch || 0, 0, R.roll || 0);
      const S = G.shark;
      const bite = S.state === "bite" && S.target ? S.target : null;
      const hpKey = cellList.map((c) => Math.round(c.hp / 10)).join(",");
      if (R.version !== version || bite || hpKey !== lastHp) {
        if (R.version !== version) syncPieces(R);
        version = R.version;
        rebuildFoundations(R, bite);
        lastHp = cellList.map((c) => Math.round(c.hp / 10)).join(",");
      }
      // live station state
      for (const p of R.pieces.values()) {
        const v = pieces.get(p.id);
        if (!v) continue;
        const s = p.state;
        if (v.leaf) {
          v.open += ((s.open ? 1 : 0) - v.open) * Math.min(1, dt * 7);
          v.leaf.rotation.y = -v.open * 1.75;
        }
        if (v.fire) {
          const def = STATIONS[p.type];
          const active = p.type.startsWith("purifier") ? s.water > 0 && def.fuel > 0 : p.type.startsWith("grill") ? s.items.some((x) => !x.done) : s.ore > 0;
          const hot = active || (p.type === "purifier2" && s.water > 0);
          v.fire.visible = active;
          if (active) {
            const f = 0.8 + Math.sin(time * 17 + p.id) * 0.12 + Math.sin(time * 31) * 0.08;
            v.fire.scale.set(f, f * (1.1 + Math.sin(time * 9) * 0.15), f);
          }
          v.glow.visible = active;
          if (active) v.glow.scale.setScalar(1.2 + Math.sin(time * 13 + p.id) * 0.12);
          if (hot && fx) {
            const w = v.group.localToWorld(_p.copy(v.fire.position));
            if (Math.random() < dt * (active ? 9 : 0)) fx.emit("fire", w.x, w.y + 0.1, w.z, 1);
            if (Math.random() < dt * 3) fx.emit(p.type.startsWith("purifier") ? "steam" : "smoke", w.x, w.y + (p.type === "smelter" ? 0.9 : 0.6), w.z, 1);
          }
        }
        if (v.water) v.water.visible = s.fresh > 0;
        if (v.food) {
          for (let k = 0; k < 2; k++) {
            const it = s.items[k];
            v.food[k].visible = !!it && !it.done;
            v.foodCooked[k].visible = !!it && it.done;
            if (it && it.id && it.id.startsWith("shark")) {
              v.food[k].scale.setScalar(2.6);
            }
          }
        }
        if (v.ingot) v.ingot.visible = s.ingots > 0;
        if (v.catch) {
          const tot = Object.values(s.items).reduce((a, b) => a + b, 0);
          v.catch.forEach((m, k) => (m.visible = tot > k * 3));
        }
        if (v.fish) v.fish.forEach((m, k) => (m.visible = s.fish > k));
        if (v.pivot) {
          // the whole rig turns toward the sail heading (relative to the raft's fixed axes)
          const target = R.sail.heading;
          let cur = v.pivot.rotation.y;
          let d = ((target - cur + Math.PI) % (Math.PI * 2)) - Math.PI;
          if (d < -Math.PI) d += Math.PI * 2;
          v.pivot.rotation.y = cur + d * Math.min(1, dt * 1.5);
          v.furl += ((R.sail.open ? 0 : 1) - v.furl) * Math.min(1, dt * 2);
          const pos = v.cloth.geometry.attributes.position;
          const b = v.base;
          const wind = R.sail.open ? 1 : 0.15;
          for (let i = 0; i < pos.count; i++) {
            const x = b[i * 3];
            const y = b[i * 3 + 1];
            const u = x / 1.2;
            const vv = (y - 1.42) / 3.2;
            const bil = (1 - u * u) * Math.sin(Math.max(0, Math.min(1, vv)) * Math.PI) * 0.55 * wind;
            const flutter = Math.sin(time * 5 + x * 3 + y * 2) * 0.03 * (1 - wind * 0.5);
            const fy = 4.62 - (4.62 - y) * (1 - v.furl * 0.92);
            pos.setXYZ(i, x * (1 - v.furl * 0.05), fy, b[i * 3 + 2] - bil + flutter);
          }
          pos.needsUpdate = true;
          v.cloth.geometry.computeVertexNormals();
        }
        if (v.stone) {
          v.drop += ((R.anchored ? 1 : 0) - v.drop) * Math.min(1, dt * 1.2);
          const depth = 0.2 + v.drop * 4.5;
          v.stone.position.set(0.0, 0.5 - depth, 0.62);
          v.stone.children.forEach((m, k) => {
            if (k === 1) {
              m.scale.set(1, depth + 0.2, 1);
              m.position.y = 0;
            }
          });
        }
      }
    },
    /** build preview */
    setGhost(g, R) {
      if (!g) {
        ghostRoot.visible = false;
        return;
      }
      const key = g.type;
      if (key !== ghostKey) {
        ghostRoot.clear();
        ghostKey = key;
        let model;
        if (key === "foundation") {
          model = new THREE.Group();
          const m = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.12, CELL), MATS.ghostOk);
          m.position.set(0, -0.06, 0);
          model.add(m);
        } else if (key === "door") {
          model = new THREE.Group();
          model.add(getModel("doorFrame", { shadow: false }));
          const leaf = getModel("doorLeaf", { shadow: false });
          leaf.position.x = -0.47;
          model.add(leaf);
        } else if (key === "sail") {
          model = getModel("sail", { shadow: false });
          model.add(meshes(sailClothGeo(), { shadow: false }));
        } else model = getModel(key, { shadow: false });
        ghost = model;
        ghostRoot.add(model);
      }
      ghost.traverse((o) => {
        if (o.isMesh) o.material = g.ok ? MATS.ghostOk : MATS.ghostBad;
      });
      const p = { ...g.slot, type: g.type, rot: g.rot, out: 1 };
      if (g.slot.kind === "edge" && (g.type === "net" || g.type === "trap")) {
        const cs = g.slot.side === "x" ? [[g.slot.i - 1, g.slot.j], [g.slot.i, g.slot.j]] : [[g.slot.i, g.slot.j - 1], [g.slot.i, g.slot.j]];
        p.out = R.cells.has(`${cs[1][0]}:${cs[1][1]}`) ? -1 : 1;
      }
      if (g.type === "foundation") ghostRoot.position.set((g.slot.i + 0.5) * CELL, 0, (g.slot.j + 0.5) * CELL);
      else {
        pieceTransform(p, ghostRoot);
        ghostRoot.rotation.y = p.kind === "edge" ? ghostRoot.rotation.y : ((g.rot || 0) * Math.PI) / 2;
      }
      ghostRoot.visible = true;
    },
    dispose() {
      scene.remove(root);
      for (const list of Object.values(parts)) for (const im of list) im.dispose();
      GLOW_MAT.dispose();
    },
  };
}
export { stairsDir, edgeBox };
