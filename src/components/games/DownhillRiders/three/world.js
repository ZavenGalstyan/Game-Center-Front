/**
 * Downhill Riders — builds every static mesh of a track once (plain Three.js,
 * no React): terrain chunks, trail ribbons, scenery, track furniture, water.
 * Returns { group, update(t, race), dispose() }.
 *
 *   terrain    48-cell chunks of the heightfield (engine/terrain.js); chunks
 *              far from the trail are decimated, skirts hide LOD seams;
 *              vertex colours from the region palette (grass, shoulder, rock
 *              on steep slopes, snow line, dense-forest tint far away)
 *   ribbons    the trail and the shortcut as textured strips on the locked
 *              band (exactly the physics height)
 *   scenery    instanced trees / rocks / bushes / grass (wind shader): a
 *              dense tree line along every wall edge, a forest beyond,
 *              edge stones on drops, fences where the ground falls away
 *   furniture  start house, finish arch, checkpoint gates, ramps, logs,
 *              obstacle rocks / trees, mud & roots, bridges, arches,
 *              tunnels, bend chevrons, banners
 *   water      rivers in gaps / under bridges, decorative waterfalls
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { locate, rampLift, WALL_MARGIN, DROP_MARGIN, BUFFER } from "../engine/trail.js";
import { mulberry32, fbm, smoothstep, clamp } from "../engine/rng.js";
import { propGeo, windMaterial, colorize, place } from "./geo.js";
import { trailTex, grainTex, woodTex, barkTex, bannerTex, checkerTex, arrowTex, waterTex, waterfallTex, softDot } from "./textures.js";

const CH = 48;
const C = (hex) => new THREE.Color(hex);

export function buildWorld(T, G, region, quality = "medium") {
  const group = new THREE.Group();
  const disposables = [];
  const animated = [];
  const own = (x) => {
    disposables.push(x);
    return x;
  };
  const rand = mulberry32((T.def.seed || 1) * 7 + 3);
  const lowQ = quality === "low";
  const highQ = quality === "high";

  // --- terrain --------------------------------------------------------------------------
  {
    const pal = region.ground;
    const cGrass = C(pal.grass);
    const cGrass2 = C(pal.grass2);
    const cRock = C(pal.rock);
    const cHigh = C(pal.high);
    const cShoulder = C(pal.shoulder);
    const cSnow = C("#f3f7fb");
    const cForest = region.theme === "forest" || region.theme === "alpine" ? C(region.theme === "forest" ? "#2c5a2c" : "#3d6438") : null;
    const top = T.samples[0].y;
    const { H, D, nx, nz, x0, z0, cell } = G;
    const tmp = new THREE.Color();
    const colorAt = (ix, iz) => {
      const k = iz * nx + ix;
      const h = H[k];
      const d = D[k];
      const x = x0 + ix * cell;
      const z = z0 + iz * cell;
      const hx = H[iz * nx + Math.min(nx - 1, ix + 1)] - H[iz * nx + Math.max(0, ix - 1)];
      const hz = H[Math.min(nz - 1, iz + 1) * nx + ix] - H[Math.max(0, iz - 1) * nx + ix];
      const slope = Math.hypot(hx, hz) / (2 * cell);
      tmp.copy(cGrass).lerp(cGrass2, fbm(x / 30, z / 30, 3));
      if (region.theme === "canyon") tmp.lerp(cHigh, 0.35 + 0.35 * Math.sin(h * 0.35 + fbm(x / 60, z / 60, 4) * 4));
      if (d < 5) tmp.lerp(cShoulder, 0.3 * (1 - d / 5));
      if (cForest && d > 30) tmp.lerp(cForest, 0.55 * smoothstep(30, 110, d) * (1 - smoothstep(0.9, 1.4, slope)));
      tmp.lerp(cRock, smoothstep(0.75, 1.35, slope));
      if (pal.snowLine != null) {
        const rel = h - top;
        tmp.lerp(cSnow, smoothstep(pal.snowLine, pal.snowLine + 25, rel) * (1 - 0.6 * smoothstep(1.2, 2, slope)));
      }
      if (h < top - 1e3) tmp.copy(cRock);
      return tmp;
    };
    const mat = own(new THREE.MeshLambertMaterial({ vertexColors: true, map: grainTex(), side: THREE.DoubleSide }));
    const near = lowQ ? 2 : 1;
    for (let cz = 0; cz < nz - 1; cz += CH) {
      for (let cx = 0; cx < nx - 1; cx += CH) {
        const ex = Math.min(cx + CH, nx - 1);
        const ez = Math.min(cz + CH, nz - 1);
        let minD = Infinity;
        for (let iz = cz; iz <= ez; iz += 4) for (let ix = cx; ix <= ex; ix += 4) minD = Math.min(minD, D[iz * nx + ix]);
        const st = minD < 110 ? near : minD < 240 ? near * 2 : 4;
        const xs = [];
        for (let ix = cx; ix < ex; ix += st) xs.push(ix);
        xs.push(ex);
        const zs = [];
        for (let iz = cz; iz < ez; iz += st) zs.push(iz);
        zs.push(ez);
        const W = xs.length;
        const Hh = zs.length;
        const pos = [];
        const col = [];
        const uv = [];
        const idx = [];
        const vert = (ix, iz, drop = 0) => {
          const k = iz * nx + ix;
          const x = x0 + ix * cell;
          const z = z0 + iz * cell;
          pos.push(x, H[k] - drop, z);
          const c = colorAt(ix, iz);
          col.push(c.r, c.g, c.b);
          uv.push(x / 7, z / 7);
          return pos.length / 3 - 1;
        };
        for (const iz of zs) for (const ix of xs) vert(ix, iz);
        for (let j = 0; j < Hh - 1; j++)
          for (let i = 0; i < W - 1; i++) {
            const a = j * W + i;
            const b = a + 1;
            const c = a + W;
            const d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        // skirts along the four edges
        const edge = (list) => {
          const base = [];
          for (const [ix, iz] of list) base.push(vert(ix, iz, 12));
          for (let i = 0; i < list.length - 1; i++) {
            const [ax, az] = list[i];
            const [bx, bz] = list[i + 1];
            const ta = zs.indexOf(az) * W + xs.indexOf(ax);
            const tb = zs.indexOf(bz) * W + xs.indexOf(bx);
            idx.push(ta, base[i], tb, tb, base[i], base[i + 1]);
          }
        };
        edge(xs.map((ix) => [ix, cz]));
        edge(xs.map((ix) => [ix, ez]));
        edge(zs.map((iz) => [cx, iz]));
        edge(zs.map((iz) => [ex, iz]));
        const g = own(new THREE.BufferGeometry());
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        group.add(m);
      }
    }
  }

  // --- trail ribbons ------------------------------------------------------------------------
  const skipRanges = T.feats.filter((f) => f.type === "gap" || f.type === "bridge").map((f) => [f.s0 - (f.type === "gap" ? 0.2 : 0), f.s1 + (f.type === "gap" ? 0.2 : 0)]);
  const inSkip = (s) => skipRanges.some(([a, b]) => s > a && s < b);
  const kind = region.theme === "snow" ? "snow" : region.theme === "summit" ? "rock" : "dirt";
  const trailMat = own(new THREE.MeshLambertMaterial({ map: trailTex(region.trail, region.ground.shoulder, kind), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  function ribbon(samples, mat, widthOf, vScale = 8, lift = 0.05) {
    const runs = [];
    let cur = [];
    for (const p of samples) {
      if (inSkip(p.s) && samples === T.samples) {
        if (cur.length > 1) runs.push(cur);
        cur = [];
        continue;
      }
      cur.push(p);
    }
    if (cur.length > 1) runs.push(cur);
    for (const run of runs) {
      const pos = [];
      const uv = [];
      const idx = [];
      run.forEach((p, i) => {
        const [wl, wr] = widthOf(p);
        pos.push(p.x + p.nx * wl, p.y + lift, p.z + p.nz * wl, p.x - p.nx * wr, p.y + lift, p.z - p.nz * wr);
        uv.push(0, p.s / vScale, 1, p.s / vScale);
        if (i > 0) {
          const a = (i - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      });
      const g = own(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      group.add(m);
    }
  }
  ribbon(T.samples, trailMat, (p) => [p.w + (p.dropL ? 0.35 : 1.1), p.w + (p.dropR ? 0.35 : 1.1)]);
  const SC = T.shortcut;
  if (SC && SC.kind !== "bridge") {
    const scCol = { forest: { base: "#6b5236", dark: "#4a3824", light: "#8a6c48" }, tunnel: { base: "#7a7570", dark: "#5a5550", light: "#9a958e" }, cliff: { base: "#8a7a66", dark: "#665848", light: "#a8987f" }, snow: { base: "#cfe3f0", dark: "#a8c6dc", light: "#eef6fb" }, canyon: { base: "#c48a55", dark: "#9a6a3f", light: "#ddb07a" } }[SC.kind] || region.trail;
    const scMat = own(new THREE.MeshLambertMaterial({ map: trailTex(scCol, region.ground.shoulder, SC.kind === "tunnel" || SC.kind === "cliff" ? "rock" : "dirt"), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const gapS = SC.feats.find((f) => f.type === "gap");
    ribbon(
      SC.samples.filter((q) => !gapS || q.s <= gapS.s0 || q.s >= gapS.s1),
      scMat,
      (q) => [q.w + 0.5, q.w + 0.5],
      6,
      0.07,
    );
  }

  // --- scenery (instanced) -----------------------------------------------------------------
  const inst = new Map();
  const put = (kind2, x, y, z, s = 1, ry = rand() * Math.PI * 2, sy = 1) => {
    if (!inst.has(kind2)) inst.set(kind2, []);
    inst.get(kind2).push([x, y, z, s, ry, sy]);
  };
  const clearOfTrail = (x, z, margin) => {
    const q = locate(T, x, z, -1);
    if (Math.abs(q.lat) < q.barrier + margin && q.s > 0.5 && q.s < T.length - 0.5) return false;
    if (SC && Math.abs(q.shortLat) < q.shortBarrier + margin + 1.2 && q.shortU > 0.5 && q.shortU < SC.length - 0.5) return false;
    for (const [a, b] of skipRanges) if (q.s > a - 6 && q.s < b + 6 && Math.abs(q.lat) < 60) return false;
    return true;
  };
  const furnitureS = [T.sGate, T.sFinish, ...T.checkpoints.map((c) => c.s)];
  const nearFurniture = (s) => furnitureS.some((f) => Math.abs(s - f) < 4);
  const trees = region.trees;
  const props = region.props;
  const treeScale = region.theme === "canyon" ? 0.9 : 1;
  // tree line / edge stones / fences along every edge
  for (let s = 2; s < T.length - 1; s += lowQ ? 4.5 : 3.0) {
    const p = T.sampleAtS(s);
    if (inSkip(p.s) || nearFurniture(p.s)) continue;
    for (const side of [1, -1]) {
      const drop = side > 0 ? p.dropL : p.dropR;
      if (drop) {
        const lat = (p.w + DROP_MARGIN + 0.35) * side;
        if (rand() < 0.55) put(props.includes("redrock") ? "redrock" : region.theme === "snow" ? "snowrock" : "greyrock", p.x + p.nx * lat, p.y - 0.25, p.z + p.nz * lat, 0.35 + rand() * 0.3);
        continue;
      }
      const barrier = p.w + WALL_MARGIN;
      // does the ground beyond fall away? then a fence marks the edge
      const fx = p.x + p.nx * (barrier + BUFFER + 5) * side;
      const fz = p.z + p.nz * (barrier + BUFFER + 5) * side;
      const lower = G.heightAt(fx, fz) < p.y - 1.5;
      if (lower && Math.floor(s / 3) % 1 === 0) {
        const lat = (barrier + 0.45) * side;
        put("fence", p.x + p.nx * lat, p.y, p.z + p.nz * lat, 1, p.h, 1);
        continue;
      }
      const lat = (barrier + 0.6 + rand() * 3.4) * side;
      const x = p.x + p.nx * lat;
      const z = p.z + p.nz * lat;
      if (!clearOfTrail(x, z, 0.3)) continue;
      const r = rand();
      if (r < (region.theme === "canyon" ? 0.25 : 0.62)) put(trees[Math.floor(rand() * trees.length)], x, p.y - 0.1, z, (0.75 + rand() * 0.5) * treeScale);
      else if (r < 0.82) {
        const k = props[Math.floor(rand() * props.length)];
        // big props (cabins) never crowd the trail edge
        put(k === "cabin" ? "snowbush" : k, x, p.y - 0.05, z, 0.6 + rand() * 0.8);
      }
      else if (!lowQ) put("bush", x, p.y, z, 0.7 + rand() * 0.6);
    }
  }
  // grass tufts on the shoulders
  if (!lowQ && region.theme !== "snow" && region.theme !== "summit") {
    for (let s = 2; s < T.length - 1; s += highQ ? 0.9 : 1.5) {
      const p = T.sampleAtS(s);
      if (inSkip(p.s)) continue;
      for (const side of [1, -1]) {
        if (side > 0 ? p.dropL : p.dropR) continue;
        const lat = (p.w + 1.0 + rand() * (WALL_MARGIN + 1.5)) * side;
        put(region.theme === "canyon" ? "dry" : "grass", p.x + p.nx * lat, p.y, p.z + p.nz * lat, 0.7 + rand() * 0.7);
      }
    }
  }
  // the forest beyond
  {
    const { D, H, nx, nz, x0, z0, cell } = G;
    const stride = lowQ ? 4 : highQ ? 2 : 3;
    const dens = region.theme === "canyon" ? 0.1 : region.theme === "summit" ? 0.16 : region.theme === "alpine" ? 0.32 : 0.45;
    const top = T.samples[0].y;
    for (let iz = 0; iz < nz; iz += stride) {
      for (let ix = 0; ix < nx; ix += stride) {
        const k = iz * nx + ix;
        const d = D[k];
        if (d < 1.5 || d > 140) continue;
        const pr = dens * (1 - smoothstep(40, 140, d)) * (lowQ ? 0.6 : 1);
        if (rand() > pr) continue;
        const x = x0 + (ix + (rand() - 0.5) * stride) * cell;
        const z = z0 + (iz + (rand() - 0.5) * stride) * cell;
        const hx = H[iz * nx + Math.min(nx - 1, ix + 1)] - H[k];
        const hz = H[Math.min(nz - 1, iz + 1) * nx + ix] - H[k];
        if (Math.hypot(hx, hz) / cell > 1.1) {
          if (rand() < 0.15) put(props.includes("redrock") ? "redrock" : "greyrock", x, G.heightAt(x, z) - 0.3, z, 1.2 + rand() * 2.5);
          continue;
        }
        const y = G.heightAt(x, z);
        if (region.ground.snowLine != null && region.ground.snowLine > -100 && y - top > region.ground.snowLine + 10) continue;
        if (d < 30 && !clearOfTrail(x, z, 0.8)) continue;
        const r = rand();
        if (r < 0.8) put(trees[Math.floor(rand() * trees.length)], x, y - 0.2, z, (0.8 + rand() * 0.7) * treeScale);
        else {
          const k = props[Math.floor(rand() * props.length)];
          if (k === "cabin" && d < 14) continue;
          put(k, x, y - 0.1, z, k === "cabin" ? 1 : 0.8 + rand() * 1.4);
        }
      }
    }
  }
  // waterfalls (scenic, never on the trail)
  const falls = [];
  if (region.theme === "alpine" || region.theme === "forest" || region.theme === "snow") {
    const want = region.theme === "alpine" ? 3 : region.theme === "snow" ? 2 : 1;
    for (let s = 120; s < T.length - 120 && falls.length < want; s += 140) {
      const p = T.sampleAtS(s);
      for (const side of [1, -1]) {
        if (falls.length >= want) break;
        const lat = (p.w + 40) * side;
        const x = p.x + p.nx * lat;
        const z = p.z + p.nz * lat;
        const hTop = G.heightAt(x + p.nx * side * 18, z + p.nz * side * 18);
        const hBase = G.heightAt(x, z);
        if (hTop - hBase > 9 && hTop - p.y > 14 && clearOfTrail(x, z, 8)) {
          falls.push({ x, z, yb: hBase, yt: hTop, h: Math.atan2(-p.nx * side, -p.nz * side) });
          s += 260;
        }
      }
    }
  }
  // instanced meshes
  const windMat = own(windMaterial());
  const plainMat = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const e4 = new THREE.Euler();
  const v4 = new THREE.Vector3();
  const s4 = new THREE.Vector3();
  const fenceGeo = own(fenceGeometry());
  const dryGeo = own(dryGrass());
  for (const [k, list] of inst) {
    const geo = k === "fence" ? fenceGeo : k === "dry" ? dryGeo : propGeo(k);
    const swaying = !["fence", "rock", "greyrock", "redrock", "snowrock", "cabin", "stump"].includes(k);
    const im = new THREE.InstancedMesh(geo, swaying ? windMat : plainMat, list.length);
    list.forEach(([x, y, z, sc, ry, sy], i) => {
      e4.set(0, ry, 0);
      q4.setFromEuler(e4);
      m4.compose(v4.set(x, y, z), q4, s4.set(sc, sc * sy, sc));
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = false;
    im.receiveShadow = k === "fence";
    group.add(im);
  }

  // --- furniture -------------------------------------------------------------------------------
  const wood = own(new THREE.MeshLambertMaterial({ map: woodTex() }));
  const woodDark = own(new THREE.MeshLambertMaterial({ map: woodTex("#7a5230") }));
  const metal = own(new THREE.MeshLambertMaterial({ color: "#d9dde3" }));
  const accent = own(new THREE.MeshLambertMaterial({ color: region.accent }));
  const frame = (s, lat = 0, dy = 0) => {
    const p = T.pointAt(s, lat);
    return { x: p.x, y: p.y + dy, z: p.z, h: p.h };
  };
  const addMesh = (geo, mat, f, cast = true) => {
    own(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(f.x, f.y, f.z);
    m.rotation.y = f.h;
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const bannerMesh = (text, bg, fg, w, f, y) => {
    const mat = own(new THREE.MeshBasicMaterial({ map: bannerTex(text, bg, fg), side: THREE.DoubleSide }));
    const g = own(new THREE.PlaneGeometry(w, w * (96 / 512) * 1.4));
    const m = new THREE.Mesh(g, mat);
    m.position.set(f.x, f.y + y, f.z);
    m.rotation.y = f.h + Math.PI;
    group.add(m);
    return m;
  };
  const gantry = (s, text, bg, fg, postMat, extra = 0) => {
    const p = T.sampleAtS(s);
    const half = p.w + 1.6 + extra;
    const f = frame(s);
    const parts = [];
    for (const side of [1, -1]) parts.push(place(new THREE.BoxGeometry(0.5, 6, 0.5), half * side, 3, 0));
    parts.push(place(new THREE.BoxGeometry(half * 2 + 0.5, 0.5, 0.5), 0, 6, 0));
    addMesh(mergeGeometries(parts), postMat, f);
    parts.forEach((g) => g.dispose());
    bannerMesh(text, bg, fg, half * 2 - 0.6, f, 5.1);
    const back = bannerMesh(text, bg, fg, half * 2 - 0.6, f, 5.1);
    back.rotation.y = f.h;
    back.position.x += Math.sin(f.h) * 0.06;
    back.position.z += Math.cos(f.h) * 0.06;
  };
  // start house: deck, roof, gate bar, banner
  {
    const f = frame(T.sGate - 4);
    const p = T.sampleAtS(T.sGate);
    const half = p.w + 1.4;
    const parts = [];
    parts.push(place(new THREE.BoxGeometry(half * 2, 0.25, 10), 0, -0.05, 0));
    for (const sx of [1, -1]) for (const sz of [-4.6]) parts.push(place(new THREE.BoxGeometry(0.35, 6.4, 0.35), half * sx, 3.2, sz));
    parts.push(place(new THREE.BoxGeometry(half * 2 + 1, 0.3, 3.2), 0, 6.3, -3.6, -0.12, 0, 0));
    parts.push(place(new THREE.BoxGeometry(half * 2, 1.8, 0.2), 0, 0.9, -4.9));
    addMesh(mergeGeometries(parts), woodDark, f);
    parts.forEach((g) => g.dispose());
    const gate = frame(T.sGate);
    addMesh(place(new THREE.BoxGeometry(half * 2, 0.12, 0.12), 0, 0.75, 0), accent, gate);
    gantry(T.sGate + 0.5, "START", "#1d2230", "#ffd21f", metal);
  }
  // finish arch + chequered line
  {
    gantry(T.sFinish, "FINISH", "#ffd21f", "#1d2230", metal, 0.6);
    const p = T.sampleAtS(T.sFinish);
    const cm = own(new THREE.MeshLambertMaterial({ map: checkerTex(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    checkerTex().repeat.set(Math.round(p.w * 1.2), 1);
    const g = own(new THREE.PlaneGeometry(p.w * 2, 1.2));
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, cm);
    const f = frame(T.sFinish, 0, 0.07);
    m.position.set(f.x, f.y, f.z);
    m.rotation.y = f.h;
    group.add(m);
    // flags beyond the line
    for (let k = 0; k < 8; k++) {
      const pp = T.pointAt(T.sFinish + 6 + k * 6, (p.w + 2.2) * (k % 2 ? 1 : -1));
      put("flag", pp.x, pp.y, pp.z, 1, rand() * 6);
    }
  }
  // checkpoint gates (colour changes when the player passes them)
  const cpMeshes = T.checkpoints.map((cp) => {
    const p = T.sampleAtS(cp.s);
    const half = p.w + 1.2;
    const mat = own(new THREE.MeshLambertMaterial({ color: region.accent, emissive: region.accent, emissiveIntensity: 0.25 }));
    const parts = [];
    for (const side of [1, -1]) {
      parts.push(place(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 6), half * side, 2.1, 0));
      parts.push(place(new THREE.BoxGeometry(0.08, 1.4, 1.0), half * side, 3.4, 0.5));
    }
    const m = addMesh(mergeGeometries(parts), mat, frame(cp.s), false);
    parts.forEach((g) => g.dispose());
    return { mesh: m, mat, cp };
  });
  // ramps
  for (const r of T.ramps) addRamp(r, T.samples, (s, lat) => T.pointAt(s, lat), r.full ? T.sampleAtS(r.s0).w + WALL_MARGIN - 0.3 : r.hw);
  if (SC) for (const r of SC.feats.filter((f) => f.type === "ramp")) addRamp(r, null, (u, lat) => { const q = SC.interp(u); return { x: q.x + q.a.nx * lat, z: q.z + q.a.nz * lat, y: q.y, h: q.a.h }; }, SC.width + 0.6);
  function addRamp(r, _S, at, hw) {
    const pos = [];
    const uv = [];
    const idx = [];
    const n = 12;
    const base = at(r.s0, 0);
    const toLocal = (P) => {
      const dx = P.x - base.x;
      const dz = P.z - base.z;
      return [dx * Math.cos(-base.h) + dz * Math.sin(-base.h), dx * -Math.sin(-base.h) + dz * Math.cos(-base.h)];
    };
    // deck (top), with sides and a back face, in world → local of the base frame
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const s = r.s0 + (r.len * i) / n;
      const row = [];
      for (const lat of [hw + r.lat, -hw + r.lat]) {
        const P = at(s, lat);
        const [lx, lz] = toLocal(P);
        row.push([lx, P.y - base.y + rampLift(r, s) + 0.04, lz]);
      }
      rows.push(row);
    }
    const v = (p, u, w) => {
      pos.push(p[0], p[1], p[2]);
      uv.push(u, w);
      return pos.length / 3 - 1;
    };
    for (let i = 0; i < n; i++) {
      const a = v(rows[i][0], 0, i / 2);
      const b = v(rows[i][1], hw / 2, i / 2);
      const c = v(rows[i + 1][0], 0, (i + 1) / 2);
      const d = v(rows[i + 1][1], hw / 2, (i + 1) / 2);
      idx.push(a, b, c, b, d, c);
      // sides
      for (const sIdx of [0, 1]) {
        const t0 = rows[i][sIdx];
        const t1 = rows[i + 1][sIdx];
        const b0 = [t0[0], t0[1] - rampLift(r, r.s0 + (r.len * i) / n) - 0.1, t0[2]];
        const b1 = [t1[0], t1[1] - rampLift(r, r.s0 + (r.len * (i + 1)) / n) - 0.1, t1[2]];
        const A = v(t0, 0, t0[1]);
        const B = v(t1, 1, t1[1]);
        const Cc = v(b0, 0, b0[1]);
        const Dd = v(b1, 1, b1[1]);
        if (sIdx === 0) idx.push(A, Cc, B, B, Cc, Dd);
        else idx.push(A, B, Cc, B, Dd, Cc);
      }
    }
    // lip face
    const tl = rows[n][0];
    const tr = rows[n][1];
    const a = v(tl, 0, 0);
    const b = v(tr, 1, 0);
    const c = v([tl[0], tl[1] - r.h - 0.1, tl[2]], 0, 1);
    const d = v([tr[0], tr[1] - r.h - 0.1, tr[2]], 1, 1);
    idx.push(a, c, b, b, c, d);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = addMesh(g, own(new THREE.MeshLambertMaterial({ map: woodTex("#b98247"), side: THREE.DoubleSide })), base);
    m.castShadow = true;
    // yellow lip stripe
    const lip = own(new THREE.BoxGeometry(hw * 2, 0.12, 0.3));
    const lm = new THREE.Mesh(lip, accent);
    const P = at(r.s1 - 0.15, r.lat);
    lm.position.set(P.x, P.y + r.h + 0.05, P.z);
    lm.rotation.y = P.h;
    group.add(lm);
    if (r.gap) {
      // far edge: a timber retaining wall so the landing reads
      const F = at(r.gap.s1, 0);
      const wall = own(new THREE.BoxGeometry(hw * 2, r.gap.depth, 0.6));
      const wm = new THREE.Mesh(wall, woodDark);
      wm.position.set(F.x, F.y - r.gap.depth / 2, F.z);
      wm.rotation.y = F.h;
      group.add(wm);
      const N = at(r.gap.s0, 0);
      const wn = new THREE.Mesh(wall, woodDark);
      wn.position.set(N.x, N.y - r.gap.depth / 2, N.z);
      wn.rotation.y = N.h;
      group.add(wn);
    }
  }
  // obstacles, logs, patches, signs, banners, bridges, arches
  const rockMat = own(windMaterial());
  for (const f of T.feats) {
    if (f.type === "rock") {
      const g = propGeo(region.theme === "canyon" ? "redrock" : region.theme === "snow" ? "snowrock" : "greyrock");
      const m = new THREE.Mesh(g, rockMat);
      m.position.set(f.x, f.y - 0.2 * f.r, f.z);
      m.scale.set(f.r * 1.0, f.r * 1.15, f.r * 1.0);
      m.rotation.y = f.s;
      m.castShadow = true;
      group.add(m);
    } else if (f.type === "tree") {
      const m = new THREE.Mesh(propGeo(trees[0]), rockMat);
      m.position.set(f.x, f.y - 0.1, f.z);
      m.scale.setScalar(0.9);
      m.castShadow = true;
      group.add(m);
    } else if (f.type === "log") {
      const p = T.sampleAtS(f.s);
      const a = Math.max(f.lat0, -p.w - 0.6);
      const b = Math.min(f.lat1, p.w + 0.6);
      const g = own(new THREE.CylinderGeometry(0.26, 0.3, b - a + 0.6, 9));
      g.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ map: barkTex() })));
      const P = T.pointAt(f.s, (a + b) / 2);
      m.position.set(P.x, P.y + 0.26, P.z);
      m.rotation.y = P.h;
      m.castShadow = true;
      group.add(m);
    } else if (f.type === "patch") {
      const mat = own(new THREE.MeshLambertMaterial({ color: f.surf === "mud" ? "#4a3522" : f.surf === "ice" ? "#cfefff" : "#5a4028", transparent: true, opacity: f.surf === "ice" ? 0.75 : 0.9, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, depthWrite: false }));
      const pos = [];
      const idx = [];
      for (let s = f.s0, i = 0; s <= f.s1; s += 1, i++) {
        const p = T.pointAt(s, 0);
        const S0 = T.sampleAtS(s);
        const wob = f.surf === "roots" ? 0 : Math.sin(s * 0.7) * 0.4;
        const A = T.pointAt(s, clamp(f.lat1, -S0.w - 0.4, S0.w + 0.4) + wob);
        const B = T.pointAt(s, clamp(f.lat0, -S0.w - 0.4, S0.w + 0.4) - wob);
        pos.push(A.x, p.y + 0.08, A.z, B.x, p.y + 0.08, B.z);
        if (i > 0) {
          const k = (i - 1) * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const g = own(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, mat));
      if (f.surf === "roots") {
        // gnarled roots across the trail
        const rm = own(new THREE.MeshLambertMaterial({ color: "#5a3c22" }));
        for (let s = f.s0 + 0.7; s < f.s1; s += 1.6) {
          const S0 = T.sampleAtS(s);
          const g2 = own(new THREE.CylinderGeometry(0.07, 0.1, S0.w * 1.6, 5));
          g2.rotateZ(Math.PI / 2);
          const P = T.pointAt(s, (rand() - 0.5) * 2);
          const m = new THREE.Mesh(g2, rm);
          m.position.set(P.x, P.y + 0.06, P.z);
          m.rotation.y = P.h + (rand() - 0.5) * 0.6;
          group.add(m);
        }
      }
    } else if (f.type === "sign") {
      const seg = T.segs[f.seg + 1];
      const left = seg ? seg.curv > 0 : f.left;
      const p = T.sampleAtS(f.s);
      const side = left ? -1 : 1; // on the outside of the bend
      const P = T.pointAt(f.s, (p.w + 1.4) * side);
      const mat = own(new THREE.MeshBasicMaterial({ map: arrowTex(left) }));
      const g = own(new THREE.PlaneGeometry(2.4, 0.9));
      const m = new THREE.Mesh(g, mat);
      m.position.set(P.x, P.y + 1.3, P.z);
      m.rotation.y = P.h + Math.PI;
      group.add(m);
      const post = own(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 5));
      const pm = new THREE.Mesh(post, woodDark);
      pm.position.set(P.x, P.y + 0.65, P.z);
      group.add(pm);
    } else if (f.type === "banner") {
      gantry(f.s, f.text || "GO!", region.accent, "#ffffff", woodDark);
    } else if (f.type === "bridge") {
      addBridge(f.s0, f.s1, f.kind, (s, lat) => T.pointAt(s, lat), (s) => T.sampleAtS(s).w);
    } else if (f.type === "arch") {
      const p = T.sampleAtS(f.s);
      const R0 = p.w + 3.2;
      const g = own(new THREE.TorusGeometry(R0, 1.6, 6, 14, Math.PI));
      const P = frame(f.s);
      const m = new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ color: region.theme === "canyon" ? "#b0603a" : "#8a8a86" })));
      m.position.set(P.x, P.y + 1.0, P.z);
      m.rotation.y = P.h;
      m.castShadow = true;
      group.add(m);
    }
  }
  if (SC && SC.kind === "bridge") {
    const run = SC.samples.filter((q) => q.dropL);
    if (run.length > 2) addBridge(run[0].s - 1, run[run.length - 1].s + 1, "wood", (u, lat) => { const q = SC.interp(u); return { x: q.x + q.a.nx * lat, z: q.z + q.a.nz * lat, y: q.y, h: q.a.h }; }, () => SC.width);
    ribbon(SC.samples.filter((q) => !q.dropL), own(new THREE.MeshLambertMaterial({ map: trailTex({ base: "#6b5236", dark: "#4a3824", light: "#8a6c48" }, region.ground.shoulder) })), (q) => [q.w + 0.5, q.w + 0.5], 6, 0.07);
  }
  if (SC && SC.tunnel) {
    // a rock tube over the shortcut
    const pos = [];
    const idx = [];
    const seg = 10;
    const list = SC.samples.filter((q, i) => i % 2 === 0 && q.s > 8 && q.s < SC.length - 8);
    list.forEach((q, i) => {
      const r = q.w + 1.6;
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI;
        const lat = Math.cos(a) * r;
        const up = Math.sin(a) * (r + 0.8);
        const n = 1 + (fbm(q.s * 0.3, k * 0.7, 5) - 0.5) * 0.3;
        pos.push(q.x + q.nx * lat * n, q.y + up * n - 0.3, q.z + q.nz * lat * n);
      }
      if (i > 0) {
        const a0 = (i - 1) * (seg + 1);
        const b0 = i * (seg + 1);
        for (let k = 0; k < seg; k++) idx.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1);
      }
    });
    const g = own(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ color: region.theme === "canyon" ? "#9a5634" : "#7d7a76", side: THREE.DoubleSide }))));
  }
  function addBridge(s0, s1, kind2, at, wOf) {
    const parts = [];
    const posts = [];
    for (let s = s0; s <= s1; s += 1.2) {
      const P = at(s, 0);
      const w = wOf(s) + 0.45;
      const deck = new THREE.BoxGeometry(w * 2, 0.16, 1.1);
      deck.rotateY(P.h);
      deck.translate(P.x, P.y - 0.04, P.z);
      parts.push(deck);
    }
    for (let s = s0; s <= s1; s += 6) {
      const P = at(s, 0);
      const w = wOf(s) + 0.45;
      for (const side of [1, -1]) {
        const Q = at(s, w * side);
        const len = kind2 === "suspended" ? 1.2 : 16;
        const post = new THREE.BoxGeometry(0.25, len, 0.25);
        post.translate(Q.x, kind2 === "suspended" ? Q.y + 0.6 : Q.y - len / 2, Q.z);
        posts.push(post);
      }
      if (kind2 !== "suspended") {
        const beam = new THREE.BoxGeometry(w * 2, 0.25, 0.25);
        beam.rotateY(P.h);
        beam.translate(P.x, P.y - 2.5, P.z);
        posts.push(beam);
      }
    }
    const deckG = own(mergeGeometries(parts));
    parts.forEach((g) => g.dispose());
    const dm = new THREE.Mesh(deckG, wood);
    dm.receiveShadow = true;
    group.add(dm);
    if (posts.length) {
      const pg = own(mergeGeometries(posts));
      posts.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(pg, woodDark));
    }
    if (kind2 === "suspended") {
      for (const side of [1, -1]) {
        const pts = [];
        for (let s = s0; s <= s1; s += 1) {
          const P = at(s, (wOf(s) + 0.45) * side);
          const sag = Math.sin(((s - s0) / (s1 - s0)) * Math.PI) * 0.35;
          pts.push(new THREE.Vector3(P.x, P.y + 1.1 - sag, P.z));
        }
        const g = own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.05, 4, false));
        group.add(new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ color: "#d8c49a" }))));
      }
      // towers at both ends
      for (const s of [s0 - 1, s1 + 1]) {
        for (const side of [1, -1]) {
          const P = at(s, (wOf(s) + 0.6) * side);
          const g = own(new THREE.BoxGeometry(0.45, 3.2, 0.45));
          const m = new THREE.Mesh(g, woodDark);
          m.position.set(P.x, P.y + 1.6, P.z);
          group.add(m);
        }
      }
    }
  }

  // --- water ------------------------------------------------------------------------------------
  const waterMat = own(new THREE.MeshLambertMaterial({ map: waterTex(region.water), transparent: true, opacity: 0.88 }));
  waterMat.map.repeat.set(6, 2);
  const waterAt = (sMid, y, half, depthAlong, h) => {
    const g = own(new THREE.PlaneGeometry(half * 2, depthAlong));
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, waterMat);
    const P = T.pointAt(sMid, 0);
    m.position.set(P.x, y, P.z);
    m.rotation.y = h;
    group.add(m);
  };
  for (const f of T.feats) {
    if (f.type === "gap" && f.water) {
      const P = T.pointAt((f.s0 + f.s1) / 2);
      waterAt((f.s0 + f.s1) / 2, P.y - f.depth + 0.7, 70, f.len + 2, P.h);
    }
    if (f.type === "bridge" && f.kind !== "suspended") {
      const P = T.pointAt((f.s0 + f.s1) / 2);
      waterAt((f.s0 + f.s1) / 2, P.y - 15, 60, Math.max(8, f.s1 - f.s0 - 6), P.h);
    }
  }
  animated.push((t) => {
    waterMat.map.offset.set(t * 0.02, t * 0.08);
  });
  for (const fl of falls) {
    const frozen = region.theme === "snow";
    const mat = own(new THREE.MeshBasicMaterial({ map: waterfallTex(frozen), transparent: true, opacity: frozen ? 0.95 : 0.85, side: THREE.DoubleSide, fog: true }));
    const h = fl.yt - fl.yb + 2;
    const g = own(new THREE.PlaneGeometry(7, h, 1, 1));
    const m = new THREE.Mesh(g, mat);
    m.position.set(fl.x, fl.yb + h / 2 - 1, fl.z);
    m.rotation.y = fl.h;
    group.add(m);
    if (!frozen) {
      mat.map.repeat.set(1, h / 14);
      animated.push((t) => (mat.map.offset.y = t * 0.9));
    }
    // pool + mist
    const pg = own(new THREE.CircleGeometry(6, 16));
    pg.rotateX(-Math.PI / 2);
    const pm = new THREE.Mesh(pg, waterMat);
    pm.position.set(fl.x, fl.yb + 0.15, fl.z);
    group.add(pm);
    if (!frozen) {
      const sm = own(new THREE.SpriteMaterial({ map: softDot(), color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false }));
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Sprite(sm);
        sp.position.set(fl.x + (rand() - 0.5) * 6, fl.yb + 1 + rand() * 2, fl.z + (rand() - 0.5) * 6);
        sp.scale.setScalar(5 + rand() * 4);
        group.add(sp);
      }
    }
  }

  // --- boost orbs (the player's collected ones hide while cooling down) ---------------------------------
  const orbs = T.feats.filter((f) => f.type === "orb");
  let orbMesh = null;
  if (orbs.length) {
    const g = own(new THREE.IcosahedronGeometry(0.42, 1));
    const mat = own(new THREE.MeshLambertMaterial({ color: "#5ad8ff", emissive: "#2aa8ff", emissiveIntensity: 1.1 }));
    orbMesh = new THREE.InstancedMesh(g, mat, orbs.length);
    group.add(orbMesh);
    const halo = own(new THREE.SpriteMaterial({ map: softDot(), color: "#7fe0ff", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    orbs.forEach((o) => {
      const sp = new THREE.Sprite(halo);
      sp.position.set(o.x, o.y + 1.2, o.z);
      sp.scale.setScalar(2.2);
      sp.userData.orb = o;
      group.add(sp);
      o.halo = sp;
    });
  }

  function update(t, race) {
    for (const fn of animated) fn(t);
    if (orbMesh) {
      const P = race?.player;
      orbs.forEach((o, i) => {
        const hidden = P && (P.orbCool.get(o.id) || 0) > 0;
        const s = hidden ? 0.001 : 1;
        e4.set(t * 1.3, t * 2 + i, 0);
        q4.setFromEuler(e4);
        m4.compose(v4.set(o.x, o.y + 1.2 + Math.sin(t * 2.5 + i) * 0.18, o.z), q4, s4.set(s, s, s));
        orbMesh.setMatrixAt(i, m4);
        o.halo.visible = !hidden;
      });
      orbMesh.instanceMatrix.needsUpdate = true;
    }
    if (race) {
      const passed = race.player.nextCp;
      cpMeshes.forEach((c, i) => {
        const done = i < passed;
        if (c.done !== done) {
          c.done = done;
          c.mat.color.set(done ? "#3ddc6a" : region.accent);
          c.mat.emissive.set(done ? "#3ddc6a" : region.accent);
        }
      });
    }
  }

  return {
    group,
    update,
    dispose() {
      for (const d of disposables) d.dispose?.();
      group.clear();
    },
  };
}

function fenceGeometry() {
  const parts = [];
  parts.push(colorize(place(new THREE.BoxGeometry(0.16, 1.2, 0.16), 0, 0.6, 0), "#7a5230", 0.04));
  parts.push(colorize(place(new THREE.BoxGeometry(0.08, 0.12, 3.1), 0, 0.95, 0), "#9a6a3c", 0.04));
  parts.push(colorize(place(new THREE.BoxGeometry(0.08, 0.12, 3.1), 0, 0.5, 0), "#9a6a3c", 0.04));
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

function dryGrass() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(0.8, 0.6, 1, 1);
    g.translate(0, 0.3, 0);
    parts.push(colorize(place(g, 0, 0, 0, 0, (k / 3) * Math.PI, 0), "#c8a868", 0.12, Math.random, [0, 0.6]));
  }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}
