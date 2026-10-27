/**
 * Strike Force — material library. Map data names materials by id (`m`);
 * this resolves them to cached MeshStandardMaterials built on procedural
 * textures. Geometry carries world-scaled UVs (1 UV unit = `scale` metres)
 * and a vertex colour that tints the albedo, so e.g. every container colour
 * shares one corrugated material.
 *
 * Quality: low → 256 px albedo only; medium → 512 px + normal + roughness;
 * high → 1024 px for the big surfaces + normal + roughness.
 */
import * as THREE from "three";
import { getTextureSet } from "./textures.js";

export const MAT_DEFS = {
  concrete: { tex: "concrete", scale: 3, color: "#ffffff", rough: 1 },
  concreteDark: { tex: "concrete", texOpts: { color: "#7e7c78" }, scale: 3, rough: 1 },
  concreteYard: { tex: "concrete", texOpts: { color: "#8f8d88", seams: true, seed: 1 }, scale: 6, rough: 1, big: true },
  concreteFloor: { tex: "concrete", texOpts: { color: "#a19e97", seams: true, seed: 2 }, scale: 4, rough: 1 },
  quay: { tex: "quay", scale: 5, rough: 1, big: true },
  quayEdge: { tex: "paintedMetal", scale: 2, color: "#e2b324", rough: 1 },
  asphalt: { tex: "asphalt", scale: 5, rough: 1, big: true },
  asphaltWorn: { tex: "asphalt", texOpts: { wet: 0.25 }, scale: 6, color: "#d8d8d8", rough: 1, big: true },
  wetAsphalt: { tex: "asphalt", texOpts: { wet: 1 }, scale: 7, rough: 1, big: true, envBoost: 1.6 },
  sidewalk: { tex: "tiles", texOpts: { tiles: 4, color: "#8d8a84" }, scale: 2.4, rough: 1 },
  plaster: { tex: "plaster", scale: 3, color: "#d9d2c3", rough: 1 },
  plasterBlue: { tex: "plaster", scale: 3, color: "#8fa6b4", rough: 1 },
  plasterWhite: { tex: "plaster", scale: 3, color: "#e2e0da", rough: 1 },
  plasterSand: { tex: "plaster", scale: 3, color: "#cbb48e", rough: 1 },
  plasterGreen: { tex: "plaster", scale: 3, color: "#7f8f78", rough: 1 },
  brick: { tex: "brick", scale: 2.6, rough: 1 },
  brickDark: { tex: "brick", texOpts: { color: "#5e3a30" }, scale: 2.6, rough: 1 },
  corrugatedWall: { tex: "corrugated", texOpts: { ridges: 12 }, scale: 4, color: "#9aa3a6", rough: 1, metal: 0.45 },
  metalRoof: { tex: "corrugated", texOpts: { ridges: 10 }, scale: 4, color: "#7d8589", rough: 1, metal: 0.5 },
  corrugated: { tex: "corrugated", texOpts: { ridges: 16 }, scale: 2.6, rough: 1, metal: 0.35, tinted: true },
  paintedMetal: { tex: "paintedMetal", scale: 2, rough: 1, metal: 0.55, tinted: true },
  rackMetal: { tex: "paintedMetal", scale: 1.5, color: "#3d5d8c", rough: 1, metal: 0.5 },
  metalGrate: { tex: "grate", scale: 1.2, color: "#9aa0a4", rough: 1, metal: 0.7 },
  steel: { tex: "paintedMetal", scale: 1.5, color: "#7c8389", rough: 0.8, metal: 0.85 },
  wood: { tex: "wood", scale: 2, rough: 1 },
  woodDark: { tex: "wood", texOpts: { color: "#5e4430" }, scale: 2, rough: 1 },
  logs: { tex: "bark", texOpts: { color: "#6b5038" }, scale: 1.4, rough: 1 },
  crateWood: { tex: "crate", scale: 1.2, rough: 1, tinted: true, faceUV: true },
  crateMetal: { tex: "paintedMetal", scale: 1.3, color: "#56664a", rough: 1, metal: 0.4 },
  sandbag: { tex: "sandbag", scale: 1.6, rough: 1 },
  hesco: { tex: "hesco", scale: 1.1, rough: 1, faceUV: true },
  barrel: { tex: "paintedMetal", scale: 1, rough: 1, metal: 0.5, tinted: true },
  bark: { tex: "bark", scale: 1.5, rough: 1 },
  rock: { tex: "rock", scale: 3, rough: 1 },
  rockMoss: { tex: "rock", texOpts: { lichen: true }, scale: 3, rough: 1 },
  rockSand: { tex: "rock", texOpts: { color: "#a88b66" }, scale: 3, rough: 1 },
  sand: { tex: "sand", scale: 7, rough: 1, big: true },
  sandDark: { tex: "sand", texOpts: { color: "#a88a60" }, scale: 6, rough: 1, big: true },
  snow: { tex: "snow", scale: 6, rough: 1, big: true },
  snowPacked: { tex: "snow", scale: 4, color: "#dfe6ec", rough: 1, big: true },
  grass: { tex: "grass", scale: 5, rough: 1, big: true },
  forestFloor: { tex: "grass", texOpts: { color: "#4a5a2e", leaves: true }, scale: 5, rough: 1, big: true },
  dirt: { tex: "dirt", scale: 4, rough: 1, big: true },
  dirtPath: { tex: "dirt", texOpts: { color: "#7a6448" }, scale: 3.5, rough: 1 },
  gravel: { tex: "dirt", texOpts: { color: "#7d7a72" }, scale: 2.5, rough: 1 },
  tile: { tex: "tiles", texOpts: { tiles: 4 }, scale: 2, rough: 1 },
  tileDark: { tex: "tiles", texOpts: { tiles: 6, color: "#55575a" }, scale: 2, rough: 1 },
  chainlink: { tex: "chainlink", scale: 1.2, rough: 0.6, metal: 0.6, alphaTest: 0.5, side: THREE.DoubleSide },
  facade: { tex: "facade", scale: 3.2, rough: 1, faceUV: "facade" },
  glassPane: { color: "#9fb8c8", rough: 0.05, metal: 0.2 },
  rubber: { color: "#1b1c1e", rough: 0.92, metal: 0 },
  glass: { color: "#1d2a33", rough: 0.08, metal: 0.4, envBoost: 1.5 },
  chrome: { color: "#c9ccd0", rough: 0.2, metal: 1 },
  darkMetal: { color: "#2a2d31", rough: 0.55, metal: 0.7 },
  vehicle: { color: "#ffffff", rough: 0.35, metal: 0.55, tinted: true, clearcoat: true },
  none: { color: "#ff00ff" },
};

export const FACADE_STYLES = {
  office: { wx0: 0.1, wx1: 0.9, wy0: 0.18, wy1: 0.8, wall: "#9a9893", glass: "#25323c", litChance: 0.45, seed: 1 },
  apartment: { wx0: 0.24, wx1: 0.76, wy0: 0.26, wy1: 0.72, wall: "#b3a493", glass: "#1f2a33", litChance: 0.38, seed: 2, mullion: false },
  tower: { wx0: 0.03, wx1: 0.97, wy0: 0.05, wy1: 0.95, wall: "#5d6872", glass: "#2c4152", litChance: 0.5, seed: 3 },
};

export function createMaterialLib(quality = "medium", theme = {}) {
  const mats = new Map();
  const tracked = new Set();
  const lowQ = quality === "low";
  const sizeFor = (def) => (lowQ ? 256 : (quality === "high" && def.big) || def.tex === "facade" ? 1024 : 512);

  function get(id, variant = "") {
    const key = id + "|" + variant;
    if (mats.has(key)) return mats.get(key);
    const def = { ...(MAT_DEFS[id] || MAT_DEFS.concrete), ...((theme.mats && theme.mats[id]) || {}) };
    const opts = {
      color: new THREE.Color(def.color || "#ffffff"),
      roughness: def.rough ?? 0.8,
      metalness: def.metal ?? 0,
      vertexColors: true,
    };
    if (def.tex) {
      const [style, nv] = id === "facade" ? variant.split("|") : ["", variant];
      const texOpts = { ...(def.texOpts || {}), ...(id === "facade" ? FACADE_STYLES[style] || FACADE_STYLES.office : {}), ...(nv === "night" ? { night: true } : {}) };
      const set = getTextureSet(def.tex, sizeFor(def), texOpts);
      opts.map = set.map;
      if (!lowQ) {
        if (set.normalMap) opts.normalMap = set.normalMap;
        if (set.roughnessMap) opts.roughnessMap = set.roughnessMap;
      }
      if (set.emissiveMap) {
        opts.emissiveMap = set.emissiveMap;
        opts.emissive = new THREE.Color("#ffffff");
        opts.emissiveIntensity = theme.windowGlow ?? 1.4;
      }
    }
    const m = def.clearcoat && !lowQ ? new THREE.MeshPhysicalMaterial({ ...opts, clearcoat: 0.6, clearcoatRoughness: 0.25 }) : new THREE.MeshStandardMaterial(opts);
    if (def.alphaTest) {
      m.alphaTest = def.alphaTest;
      m.transparent = false;
    }
    if (def.side) m.side = def.side;
    m.envMapIntensity = (def.envBoost || 1) * (theme.envIntensity ?? 1);
    if (opts.normalMap) m.normalScale = new THREE.Vector2(def.normalScale ?? 1, def.normalScale ?? 1);
    mats.set(key, m);
    tracked.add(m);
    return m;
  }

  /** plain (untextured) cached material */
  function plain(color, { rough = 0.7, metal = 0, emissive = null, ei = 1, transparent = false, opacity = 1, vc = false, side = THREE.FrontSide, flat = false } = {}) {
    const key = `plain|${color}|${rough}|${metal}|${emissive}|${ei}|${transparent}|${opacity}|${vc}|${side}|${flat}`;
    if (mats.has(key)) return mats.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, transparent, opacity, vertexColors: vc, side, flatShading: flat });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = ei;
    }
    if (transparent) m.depthWrite = false;
    m.envMapIntensity = theme.envIntensity ?? 1;
    mats.set(key, m);
    tracked.add(m);
    return m;
  }

  /** unlit glowing material (neon, lamps, screens) */
  function glow(color, intensity = 1, { transparent = false, opacity = 1, map = null, side = THREE.FrontSide, additive = false } = {}) {
    const key = `glow|${color}|${intensity}|${transparent}|${opacity}|${map ? map.uuid : ""}|${side}|${additive}`;
    if (mats.has(key)) return mats.get(key);
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: transparent || additive, opacity, map, side, toneMapped: false });
    if (additive) {
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
    }
    mats.set(key, m);
    tracked.add(m);
    return m;
  }

  function track(m) {
    tracked.add(m);
    return m;
  }

  function dispose() {
    for (const m of tracked) m.dispose();
    tracked.clear();
    mats.clear();
  }
  return { get, plain, glow, track, dispose, quality, def: (id) => MAT_DEFS[id] || MAT_DEFS.concrete };
}
