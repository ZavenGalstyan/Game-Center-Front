/**
 * Last Hope — the static scene for one location: ground, roads, water,
 * architecture, instanced props, harvestable nodes (with per-instance hide /
 * stump / wobble), loot containers, explosive drums, scattered grass, and the
 * list of light emitters. Shared model geometry is cached across locations;
 * everything location-specific is disposed on leave.
 */
import * as THREE from "three";
import { NATURE } from "./models/nature.js";
import { PROPS, CONTAINER_NO_MODEL } from "./models/props.js";
import { materials } from "./materials.js";
import { createGround, createRoadMarks, createWater, buildSplat, minimapImage, SPLAT_PPM } from "./ground.js";
import { createArchitecture } from "./buildings.js";
import { insideBuilding } from "../engine/game.js";

const MODEL_CACHE = new Map();
/** Geometry buckets for a model key (shared, never disposed per location). */
export function modelGeo(t, v = 0, p = null) {
  const key = `${t}:${v}:${p?.h || ""}:${p?.c || ""}`;
  if (MODEL_CACHE.has(key)) return MODEL_CACHE.get(key);
  const f = NATURE[t] || PROPS[t];
  const g = f ? f(v, p) : null;
  MODEL_CACHE.set(key, g);
  return g;
}
export function disposeModelCache() {
  for (const g of MODEL_CACHE.values()) if (g) for (const b of Object.values(g)) b.dispose();
  MODEL_CACHE.clear();
}

const NO_SHADOW = new Set(["grass_tuft", "fern", "reeds", "rug", "branch", "stones", "mushroom", "debris"]);
const TREE_NODES = new Set(["tree", "pine", "birch"]);
const VARIANTS = { tree: 4, pine: 4, birch: 3, rock: 4, boulder: 3, bush: 3, berry: 2, scrap: 3, stones: 2, branch: 2, mushroom: 2, fern: 3, grass_tuft: 2, pine_big: 3, tree_big: 3, cliff: 3, log_fallen: 2, hedge: 2, trash_bag: 2, debris: 3, pallets: 2, metal_crate: 2, chem_barrel: 2, mil_crate: 2, crate: 2 };
const vOf = (t, n, salt = 0) => (n.v != null ? n.v : Math.abs(Math.floor((n.x * 13.1 + n.z * 7.7 + salt) % (VARIANTS[t] || 1))));

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** One InstancedMesh per bucket for a list of transforms. */
function instanced(group, geos, list, shadow = true, M = materials()) {
  const out = [];
  for (const [b, g] of Object.entries(geos)) {
    const im = new THREE.InstancedMesh(g, M[b], list.length);
    list.forEach((tr, i) => {
      _e.set(tr.rx || 0, tr.yaw || 0, tr.rz || 0);
      _q.setFromEuler(_e);
      const s = tr.s || 1;
      _m.compose(_p.set(tr.x, tr.y || 0, tr.z), _q, _s.set(s, tr.sy || s, s));
      im.setMatrixAt(i, _m);
    });
    im.castShadow = shadow && b !== "g" && b !== "b";
    im.receiveShadow = b !== "e";
    im.frustumCulled = false;
    im.userData.bucket = b;
    group.add(im);
    out.push(im);
  }
  return out;
}

export function buildLocation(map, quality, collider) {
  const group = new THREE.Group();
  group.name = `loc-${map.id}`;
  const disposers = [];
  // ---------------------------------------------------------------- terrain
  const splat = buildSplat(map);
  const ground = createGround(map, splat, quality);
  group.add(ground.mesh);
  disposers.push(ground.dispose);
  const roads = createRoadMarks(map);
  group.add(roads.group);
  disposers.push(roads.dispose);
  const water = createWater(map);
  group.add(water.group);
  disposers.push(water.dispose);
  const arch = createArchitecture(map, quality);
  group.add(arch.group);
  disposers.push(arch.dispose);

  // ---------------------------------------------------------------- static props
  const byKey = new Map();
  for (const p of map.props) {
    const v = vOf(p.t, p);
    const key = `${p.t}|${v}|${p.h || ""}|${p.c || ""}`;
    if (!byKey.has(key)) byKey.set(key, { t: p.t, v, p, list: [] });
    byKey.get(key).list.push({ x: p.x, z: p.z, yaw: p.yaw, s: p.t === "porch" || p.t === "door_open" || p.t === "rollup" ? 1 : p.s });
  }
  for (const { t, v, p, list } of byKey.values()) {
    const geo = modelGeo(t, v, p);
    if (!geo) continue;
    const ims = instanced(group, geo, list, !NO_SHADOW.has(t));
    disposers.push(() => ims.forEach((im) => im.dispose()));
  }

  // ---------------------------------------------------------------- grass scatter (render only)
  const density = { low: 0.25, medium: 0.6, high: 1.1 }[quality] ?? 0.6;
  const tuftSlots = []; // {x, z, ims, i}
  if (map.base === "grass" || map.biome === "camp" || map.biome === "forest") {
    const tufts = [];
    const target = Math.round(map.w * map.d * 0.09 * density);
    let seed = 77;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let k = 0; k < target * 3 && tufts.length < target; k++) {
      const x = (rnd() - 0.5) * map.w;
      const z = (rnd() - 0.5) * map.d;
      const sx = Math.min(splat.W - 1, Math.floor((x + map.w / 2) * SPLAT_PPM));
      const sz = Math.min(splat.H - 1, Math.floor((z + map.d / 2) * SPLAT_PPM));
      const i = (sz * splat.W + sx) * 4;
      const paved = splat.data[i + 1] + splat.data[i + 2];
      const dirt = splat.data[i];
      if (paved > 60 || dirt > 150 + rnd() * 100) continue;
      if (collider.overlaps(x, z, 0.35)) continue;
      if (insideBuilding(map, x, z) != null) continue;
      tufts.push({ x, z, yaw: rnd() * 6.28, s: 0.8 + rnd() * 0.7, sy: 0.55 + rnd() * 0.6 });
    }
    for (let v = 0; v < 2; v++) {
      const sub = tufts.filter((_, i) => i % 2 === v);
      if (!sub.length) continue;
      const ims = instanced(group, modelGeo("grass_tuft", v), sub, false);
      ims.forEach((im) => im.instanceMatrix.setUsage(THREE.DynamicDrawUsage));
      sub.forEach((t, i) => {
        const base = new THREE.Matrix4();
        ims[0].getMatrixAt(i, base);
        tuftSlots.push({ x: t.x, z: t.z, ims, i, base, hidden: false });
      });
      disposers.push(() => ims.forEach((im) => im.dispose()));
    }
  }

  // ---------------------------------------------------------------- forest beyond the edge (render only)
  if (map.biome !== "bunker") {
    const band = [];
    let seed = 991;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const per = { low: 34, medium: 22, high: 15 }[quality] ?? 22; // m² per tree
    const out = 40;
    const hw = map.w / 2;
    const hd = map.d / 2;
    const area = (map.w + out * 2) * (map.d + out * 2) - map.w * map.d;
    const n = Math.round(area / per);
    for (let k = 0; k < n * 2 && band.length < n; k++) {
      const x = (rnd() - 0.5) * (map.w + out * 2);
      const z = (rnd() - 0.5) * (map.d + out * 2);
      if (Math.abs(x) < hw + 1 && Math.abs(z) < hd + 1) continue;
      band.push({ x, z, yaw: rnd() * 6.28, s: 0.95 + rnd() * 0.6, k: rnd() < (map.biome === "industrial" ? 0.5 : 0.7) ? 0 : 1 });
    }
    for (const [k, t] of [
      [0, "pine_lod"],
      [1, "tree_lod"],
    ]) {
      const list = band.filter((b) => b.k === k);
      for (let v = 0; v < 2; v++) {
        const sub = list.filter((_, i) => i % 2 === v);
        if (!sub.length) continue;
        const ims = instanced(group, modelGeo(t, v), sub, false);
        disposers.push(() => ims.forEach((im) => im.dispose()));
      }
    }
  }

  // ---------------------------------------------------------------- nodes (dynamic per instance)
  const nodeSlots = new Map(); // node id → [{im, i}], base matrix
  const stumpSlots = new Map();
  const groups = new Map();
  for (const n of map.nodes) {
    const v = vOf(n.t, n, 3);
    const key = `${n.t}|${v}`;
    if (!groups.has(key)) groups.set(key, { t: n.t, v, list: [] });
    groups.get(key).list.push(n);
  }
  const nodeMeshes = [];
  for (const { t, v, list } of groups.values()) {
    const geo = modelGeo(t, v);
    if (!geo) continue;
    const ims = instanced(
      group,
      geo,
      list.map((n) => ({ x: n.x, z: n.z, yaw: n.yaw, s: n.s })),
      !NO_SHADOW.has(t),
    );
    ims.forEach((im) => (im.instanceMatrix.setUsage(THREE.DynamicDrawUsage), nodeMeshes.push(im)));
    list.forEach((n, i) => {
      const base = new THREE.Matrix4();
      ims[0]?.getMatrixAt(i, base);
      nodeSlots.set(n.id, { ims, i, base, n, hidden: false, wob: 0 });
    });
    disposers.push(() => ims.forEach((im) => im.dispose()));
  }
  // stumps for trees (hidden until felled)
  const trees = map.nodes.filter((n) => TREE_NODES.has(n.t));
  if (trees.length) {
    const ims = instanced(
      group,
      modelGeo("stump", 0),
      trees.map((n) => ({ x: n.x, z: n.z, yaw: n.yaw, s: n.s * 0.9 })),
    );
    ims.forEach((im) => im.instanceMatrix.setUsage(THREE.DynamicDrawUsage));
    trees.forEach((n, i) => {
      const base = new THREE.Matrix4();
      ims[0].getMatrixAt(i, base);
      stumpSlots.set(n.id, { ims, i, base, shown: true });
    });
    disposers.push(() => ims.forEach((im) => im.dispose()));
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function setSlot(slot, m) {
    for (const im of slot.ims) {
      im.setMatrixAt(slot.i, m);
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- containers
  const cGroups = new Map();
  for (const c of map.containers) {
    if (CONTAINER_NO_MODEL.has(c.t)) continue;
    const v = vOf(c.t, c, 5);
    const key = `${c.t}|${v}`;
    if (!cGroups.has(key)) cGroups.set(key, { t: c.t, v, list: [] });
    cGroups.get(key).list.push({ x: c.x, z: c.z, yaw: c.yaw });
  }
  for (const { t, v, list } of cGroups.values()) {
    const geo = modelGeo(t, v);
    if (!geo) continue;
    const ims = instanced(group, geo, list, true);
    disposers.push(() => ims.forEach((im) => im.dispose()));
  }

  // ---------------------------------------------------------------- drums
  const drumSlots = new Map();
  if (map.hazards.length) {
    const ims = instanced(
      group,
      modelGeo("drum", 0),
      map.hazards.map((h) => ({ x: h.x, z: h.z, yaw: h.x * 0.7 })),
    );
    ims.forEach((im) => im.instanceMatrix.setUsage(THREE.DynamicDrawUsage));
    map.hazards.forEach((h, i) => drumSlots.set(h.id, { ims, i, gone: false }));
    disposers.push(() => ims.forEach((im) => im.dispose()));
  }

  // ---------------------------------------------------------------- lights
  const lights = map.lights.map((l) => ({ ...l }));
  const mini = minimapImage(map, splat);

  return {
    group,
    roofs: arch.roofs,
    groundUniforms: ground.uniforms,
    water,
    lights,
    minimap: mini,
    splat,
    /** Sync node visibility / stumps / wobble with the sim. */
    syncNodes(R, t) {
      for (const n of R.nodes) {
        const slot = nodeSlots.get(n.id);
        if (!slot) continue;
        const hide = !n.alive;
        if (hide !== slot.hidden) {
          slot.hidden = hide;
          setSlot(slot, hide ? zero : slot.base);
          const st = stumpSlots.get(n.id);
          if (st) setSlot(st, slot.base);
        }
        if (!hide && n.shake > 0) {
          const k = n.shake;
          const w = Math.sin(t * 38) * 0.06 * k;
          const m = slot.base.clone().multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0.4).normalize(), w));
          setSlot(slot, m);
          slot.wob = 1;
        } else if (slot.wob && !hide) {
          slot.wob = 0;
          setSlot(slot, slot.base);
        }
      }
      // stumps only where a tree is felled
      for (const [id, st] of stumpSlots) {
        const n = R.nodeById.get(id);
        const show = n && !n.alive;
        if (show !== st.shown) {
          st.shown = show;
          setSlot(st, show ? st.base : zero);
        }
      }
    },
    /** Hide grass under camp structures (floors, furniture, walls). */
    hideGrassUnder(structures) {
      for (const t of tuftSlots) {
        let hide = false;
        for (const s of structures) {
          const r = s.kind === "wall" || s.kind === "door" ? 0.6 : 1.15;
          if (Math.abs(t.x - s.x) < r && Math.abs(t.z - s.z) < r) {
            hide = true;
            break;
          }
        }
        if (hide !== t.hidden) {
          t.hidden = hide;
          setSlot(t, hide ? zero : t.base);
        }
      }
    },
    syncDrums(R) {
      for (const h of R.hazards) {
        const s = drumSlots.get(h.id);
        if (s && !h.alive && !s.gone) {
          s.gone = true;
          setSlot(s, zero);
        }
      }
    },
    nodeGeo(id) {
      const s = nodeSlots.get(id);
      return s ? { geo: modelGeo(s.n.t, vOf(s.n.t, s.n, 3)), n: s.n } : null;
    },
    dispose() {
      for (const d of disposers) d();
    },
  };
}
