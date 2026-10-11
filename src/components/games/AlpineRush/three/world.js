/**
 * Alpine Rush — builds every static mesh of a course once (plain Three.js,
 * no React). Returns { group, update(t, race), dispose() }.
 *
 *   terrain    chunks of the heightfield (engine/terrain.js), decimated far
 *              from the piste, skirts hide LOD seams; vertex colours from the
 *              world palette (drift noise, blue shade on steep faces, rock on
 *              cliffs, forest tint far away)
 *   piste      the groomed run as a corduroy ribbon on the locked band
 *              (exactly the physics height, rollers included)
 *   edges      orange safety nets on posts along net sides, rock outcrops
 *              and marker poles along cliff sides
 *   scenery    instanced forest, rocks, bushes, chalets, a chair lift with
 *              moving chairs, distant flags
 *   furniture  start house + wand, finish arch, checkered line, gates
 *              (two poles + numbered panels, flex when skied past, green
 *              when passed, grey when missed), kickers, snow fences, snow
 *              cannons, ice / powder / mogul patches, bridges, signs, banners
 * Shadows: only the furniture near the piste casts; scenery is unshadowed
 * (the skier gets its own shadow in the scene) — keeps the frame cheap.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { locate, rampLift, rollerLift, RAMP_SHOULDER, NET_MARGIN, DROP_MARGIN, BUFFER, FENCE_H } from "../engine/course.js";
import { mulberry32, fbm, smoothstep } from "../engine/rng.js";
import { propGeo, windMaterial, colorize, place } from "./geo.js";
import { pisteTex, grainTex, woodTex, netTex, bannerTex, checkerTex, arrowTex, iceTex, gatePanelTex, softDot } from "./textures.js";

const CH = 44;
const TILE = 120;
const C = (hex) => new THREE.Color(hex);

export function buildWorld(T, G, world, quality = "medium") {
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
  const rollers = T.feats.filter((f) => f.type === "roller");
  const liftAt = (s) => {
    let l = 0;
    for (const r of rollers) l = Math.max(l, rollerLift(r, s));
    return l;
  };

  // --- terrain ------------------------------------------------------------------------------
  {
    const pal = world.snow;
    const cA = C(pal.a);
    const cB = C(pal.b);
    const cShade = C(pal.shade);
    const cRock = C(pal.rock);
    const cForest = C(pal.forest);
    const { H, D, nx, nz, x0, z0, cell } = G;
    const tmp = new THREE.Color();
    const colorAt = (ix, iz) => {
      const k = iz * nx + ix;
      const d = D[k];
      const x = x0 + ix * cell;
      const z = z0 + iz * cell;
      const hx = H[iz * nx + Math.min(nx - 1, ix + 1)] - H[iz * nx + Math.max(0, ix - 1)];
      const hz = H[Math.min(nz - 1, iz + 1) * nx + ix] - H[Math.max(0, iz - 1) * nx + ix];
      const slope = Math.hypot(hx, hz) / (2 * cell);
      tmp.copy(cA).lerp(cB, fbm(x / 26, z / 26, 3));
      tmp.lerp(cShade, smoothstep(0.35, 1.0, slope) * 0.7);
      if (d > 25) tmp.lerp(cForest, 0.35 * smoothstep(25, 120, d) * (1 - smoothstep(0.7, 1.2, slope)));
      tmp.lerp(cRock, smoothstep(1.05, 1.6, slope));
      return tmp;
    };
    // single-sided: the top surface winds counter-clockwise seen from above (half the
    // fragments of DoubleSide); the chunk skirts below get both windings instead
    const mat = own(new THREE.MeshLambertMaterial({ vertexColors: true, map: grainTex() }));
    mat.map.repeat.set(1, 1);
    const near = lowQ ? 2 : 1;
    for (let cz = 0; cz < nz - 1; cz += CH) {
      for (let cx = 0; cx < nx - 1; cx += CH) {
        const ex = Math.min(cx + CH, nx - 1);
        const ez = Math.min(cz + CH, nz - 1);
        let minD = Infinity;
        for (let iz = cz; iz <= ez; iz += 4) for (let ix = cx; ix <= ex; ix += 4) minD = Math.min(minD, D[iz * nx + ix]);
        const st = minD < 90 ? near : minD < 220 ? near * 2 : 4;
        const xs = [];
        for (let ix = cx; ix < ex; ix += st) xs.push(ix);
        xs.push(ex);
        const zs = [];
        for (let iz = cz; iz < ez; iz += st) zs.push(iz);
        zs.push(ez);
        const W = xs.length;
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
          uv.push(x / 9, z / 9);
          return pos.length / 3 - 1;
        };
        for (const iz of zs) for (const ix of xs) vert(ix, iz);
        for (let j = 0; j < zs.length - 1; j++)
          for (let i = 0; i < W - 1; i++) {
            const a = j * W + i;
            idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
          }
        const edge = (list) => {
          const base = [];
          for (const [ix, iz] of list) base.push(vert(ix, iz, 10));
          for (let i = 0; i < list.length - 1; i++) {
            const ta = zs.indexOf(list[i][1]) * W + xs.indexOf(list[i][0]);
            const tb = zs.indexOf(list[i + 1][1]) * W + xs.indexOf(list[i + 1][0]);
            idx.push(ta, base[i], tb, tb, base[i], base[i + 1]);
            idx.push(ta, tb, base[i], tb, base[i + 1], base[i]);
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

  // --- piste ribbon ---------------------------------------------------------------------------
  const bridges = T.feats.filter((f) => f.type === "bridge");
  const inBridge = (s) => bridges.some((b) => s > b.s0 - 0.2 && s < b.s1 + 0.2);
  const pisteMat = own(new THREE.MeshLambertMaterial({ map: pisteTex(world.piste), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  function ribbon(samples, mat, widthOf, vScale = 10, lift = 0.04, yOf = (p) => p.y + liftAt(p.s)) {
    const runs = [];
    let cur = [];
    for (const p of samples) {
      if (inBridge(p.s)) {
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
        const y = yOf(p) + lift;
        pos.push(p.x + p.nx * wl, y, p.z + p.nz * wl, p.x - p.nx * wr, y, p.z - p.nz * wr);
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
  ribbon(T.samples, pisteMat, (p) => [p.w + (p.dropL ? 0.4 : 0.8), p.w + (p.dropR ? 0.4 : 0.8)]);

  // --- scenery (instanced) --------------------------------------------------------------------
  const inst = new Map();
  const put = (kind, x, y, z, s = 1, ry = rand() * Math.PI * 2, sy = 1) => {
    if (!inst.has(kind)) inst.set(kind, []);
    inst.get(kind).push([x, y, z, s, ry, sy]);
  };
  const clearOfPiste = (x, z, margin) => {
    const q = locate(T, x, z, -1);
    if (Math.abs(q.lat) < q.barrier + margin && q.s > 0.5 && q.s < T.length - 0.5) return false;
    for (const b of bridges) if (q.s > b.s0 - 8 && q.s < b.s1 + 8 && Math.abs(q.lat) < 40) return false;
    return true;
  };
  const furnS = [T.sGate, T.sFinish];
  const nearFurniture = (s) => furnS.some((f) => Math.abs(s - f) < 8);
  const trees = world.trees;
  const props = world.props;
  // nets (posts instanced; mesh strips per run) + cliff rocks
  const netRuns = { 1: [], [-1]: [] };
  const netCur = { 1: [], [-1]: [] };
  for (let s = 1; s < T.length - 1; s += 2) {
    const p = T.sampleAtS(s);
    for (const side of [1, -1]) {
      const drop = side > 0 ? p.dropL : p.dropR;
      const skip = drop || inBridge(p.s) || s < T.sGate - 6;
      if (skip) {
        if (netCur[side].length > 1) netRuns[side].push(netCur[side]);
        netCur[side] = [];
        if (drop && rand() < 0.6) {
          const lat = (p.w + DROP_MARGIN + 0.6) * side;
          put("cliffrock", p.x + p.nx * lat, p.y - 0.4, p.z + p.nz * lat, 0.5 + rand() * 0.5);
          if (Math.floor(s) % 12 === 0) put("flag", p.x + p.nx * (p.w + 0.6) * side, p.y, p.z + p.nz * (p.w + 0.6) * side, 0.5, p.h);
        }
        continue;
      }
      netCur[side].push(p);
    }
  }
  for (const side of [1, -1]) if (netCur[side].length > 1) netRuns[side].push(netCur[side]);
  const netMat = own(new THREE.MeshLambertMaterial({ map: netTex(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: true }));
  const postList = [];
  for (const side of [1, -1]) {
    for (const run of netRuns[side]) {
      const pos = [];
      const uv = [];
      const idx = [];
      let u = 0;
      run.forEach((p, i) => {
        const lat = (p.w + NET_MARGIN + 0.15) * side;
        const x = p.x + p.nx * lat;
        const z = p.z + p.nz * lat;
        const y = G.heightAt(x, z);
        if (i > 0) u += 2;
        pos.push(x, y + 0.05, z, x, y + 1.35, z);
        uv.push(u / 2.5, 0, u / 2.5, 1);
        if (i > 0) {
          const a = (i - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        if (i % 3 === 0) postList.push([x, y, z]);
      });
      const g = own(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, netMat));
    }
  }
  if (postList.length) {
    const pg = own(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5));
    pg.translate(0, 0.75, 0);
    const pm = new THREE.InstancedMesh(pg, own(new THREE.MeshLambertMaterial({ color: "#e8eef6" })), postList.length);
    const m4 = new THREE.Matrix4();
    postList.forEach(([x, y, z], i) => pm.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    pm.instanceMatrix.needsUpdate = true;
    pm.computeBoundingSphere();
    group.add(pm);
  }
  // tree line just beyond the nets
  for (let s = 2; s < T.length - 1; s += lowQ ? 5 : 3.2) {
    const p = T.sampleAtS(s);
    if (inBridge(p.s) || nearFurniture(p.s)) continue;
    for (const side of [1, -1]) {
      if (side > 0 ? p.dropL : p.dropR) continue;
      const lat = (p.w + NET_MARGIN + 1.6 + rand() * 6) * side;
      const x = p.x + p.nx * lat;
      const z = p.z + p.nz * lat;
      if (!clearOfPiste(x, z, 1)) continue;
      const y = G.heightAt(x, z);
      const r = rand();
      if (r < (world.theme === "frozen" || world.theme === "summit" ? 0.35 : 0.62)) put(trees[Math.floor(rand() * trees.length)], x, y - 0.2, z, 0.75 + rand() * 0.55);
      else if (r < 0.8) {
        const k = props[Math.floor(rand() * props.length)];
        put(k === "cabin" ? "snowbush" : k, x, y - 0.1, z, k === "flag" ? 0.8 : 0.6 + rand() * 0.8);
      }
    }
  }
  // the forest beyond
  {
    const { D, H, nx, nz, x0, z0, cell } = G;
    const stride = lowQ ? 4 : highQ ? 2 : 3;
    const dens = { sunny: 0.26, pine: 0.55, frozen: 0.12, blizzard: 0.3, summit: 0.1 }[world.theme] ?? 0.3;
    const top = T.samples[0].y;
    for (let iz = 0; iz < nz; iz += stride) {
      for (let ix = 0; ix < nx; ix += stride) {
        const k = iz * nx + ix;
        const d = D[k];
        if (d < 2 || d > 150) continue;
        const pr = dens * (1 - smoothstep(50, 150, d)) * (lowQ ? 0.6 : 1);
        if (rand() > pr) continue;
        const x = x0 + (ix + (rand() - 0.5) * stride) * cell;
        const z = z0 + (iz + (rand() - 0.5) * stride) * cell;
        const hx = H[iz * nx + Math.min(nx - 1, ix + 1)] - H[k];
        const hz = H[Math.min(nz - 1, iz + 1) * nx + ix] - H[k];
        const y = G.heightAt(x, z);
        if (Math.hypot(hx, hz) / cell > 0.95) {
          if (rand() < 0.2) put("cliffrock", x, y - 0.5, z, 1.4 + rand() * 2.6);
          continue;
        }
        if (y - top > 60 && world.theme !== "pine") continue; // above the tree line
        if (d < 26 && !clearOfPiste(x, z, 1.2)) continue;
        if (rand() < 0.86) put(trees[Math.floor(rand() * trees.length)], x, y - 0.25, z, 0.8 + rand() * 0.8);
        else put(rand() < 0.5 ? "snowrock" : "snowbush", x, y - 0.2, z, 0.8 + rand() * 1.6);
      }
    }
  }
  // chalets near the piste (scenic), one near the finish
  {
    const spots = [T.sFinish + 30, ...[0.3, 0.62].map((f) => T.sGate + f * T.raceLen)];
    spots.forEach((s, i) => {
      const p = T.sampleAtS(s);
      const side = i % 2 ? 1 : -1;
      if (side > 0 ? p.dropL : p.dropR) return;
      for (const extra of [12, 18, 26]) {
        const lat = (p.w + NET_MARGIN + extra) * side;
        const x = p.x + p.nx * lat;
        const z = p.z + p.nz * lat;
        if (!clearOfPiste(x, z, 6)) continue;
        put("cabin", x, G.heightAt(x, z) - 0.3, z, 1, p.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2));
        break;
      }
    });
  }
  // chair lift: towers along a line beside the course, cables, moving chairs
  let chairs = null;
  if (world.lift) {
    const side = (T.def.seed % 2) * 2 - 1;
    const off = 34;
    const line = [];
    for (let s = 6; s < T.length - 10; s += 4) {
      const p = T.sampleAtS(s);
      const lat = (p.w + off) * side;
      line.push([p.x + p.nx * lat, p.z + p.nz * lat]);
    }
    // straighten into a few long spans (real lifts run straight)
    const spans = [];
    const step = Math.max(1, Math.floor(line.length / 5));
    for (let i = 0; i < line.length; i += step) spans.push(line[i]);
    spans.push(line[line.length - 1]);
    const towers = [];
    for (let i = 0; i < spans.length - 1; i++) {
      const [ax, az] = spans[i];
      const [bx, bz] = spans[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 55));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        if (clearOfPiste(x, z, 4)) towers.push([x, G.heightAt(x, z), z, Math.atan2(bx - ax, bz - az)]);
      }
    }
    if (towers.length > 2) {
      for (const [x, y, z, h] of towers) put("liftTower", x, y - 0.2, z, 1, h + Math.PI / 2);
      const cableMat = own(new THREE.LineBasicMaterial({ color: "#2a2d34" }));
      const paths = [-2.5, 2.5].map((lat) => {
        const pts = towers.map(([x, y, z, h]) => new THREE.Vector3(x + Math.cos(h) * lat, y + 11.4, z - Math.sin(h) * lat));
        const g = own(new THREE.BufferGeometry().setFromPoints(pts));
        group.add(new THREE.Line(g, cableMat));
        return pts;
      });
      // chairs ride both cables (up one side, down the other)
      const count = lowQ ? 10 : 22;
      const im = new THREE.InstancedMesh(propGeo("chair"), own(new THREE.MeshLambertMaterial({ vertexColors: true })), count);
      group.add(im);
      const segLen = paths.map((pts) => {
        const L = [0];
        for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
        return L;
      });
      const m4 = new THREE.Matrix4();
      const q4 = new THREE.Quaternion();
      const e4 = new THREE.Euler();
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3(1, 1, 1);
      chairs = (t) => {
        for (let c = 0; c < count; c++) {
          const pi = c % 2;
          const pts = paths[pi];
          const L = segLen[pi];
          const total = L[L.length - 1];
          let d = ((c / count) * total + t * 2.2 * (pi ? 1 : -1)) % total;
          if (d < 0) d += total;
          let i = 1;
          while (i < L.length - 1 && L[i] < d) i++;
          const f = (d - L[i - 1]) / Math.max(1e-3, L[i] - L[i - 1]);
          v.lerpVectors(pts[i - 1], pts[i], f);
          v.y -= Math.sin(f * Math.PI) * 1.2; // cable sag
          e4.set(0, Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) + Math.PI / 2, 0);
          q4.setFromEuler(e4);
          im.setMatrixAt(c, m4.compose(v, q4, sc));
        }
        im.instanceMatrix.needsUpdate = true;
      };
      im.frustumCulled = false;
    }
  }
  // instanced meshes
  const tiles = [];
  const windMat = own(windMaterial());
  const plainMat = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
  {
    const m4 = new THREE.Matrix4();
    const q4 = new THREE.Quaternion();
    const e4 = new THREE.Euler();
    const v4 = new THREE.Vector3();
    const s4 = new THREE.Vector3();
    for (const [k, all] of inst) {
      const swaying = ["snowpine", "pine", "fir", "snowfir", "snowbush", "flag"].includes(k);
      const byTile = new Map();
      for (const it of all) {
        const key = Math.floor(it[0] / TILE) + "," + Math.floor(it[2] / TILE);
        if (!byTile.has(key)) byTile.set(key, []);
        byTile.get(key).push(it);
      }
      for (const list of byTile.values()) {
        const im = new THREE.InstancedMesh(propGeo(k), swaying ? windMat : plainMat, list.length);
        let cx = 0;
        let cz = 0;
        list.forEach(([x, y, z, sc, ry, sy], i) => {
          e4.set(0, ry, 0);
          q4.setFromEuler(e4);
          m4.compose(v4.set(x, y, z), q4, s4.set(sc, sc * sy, sc));
          im.setMatrixAt(i, m4);
          cx += x / list.length;
          cz += z / list.length;
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
        tiles.push({ m: im, x: cx, z: cz });
      }
    }
  }

  // --- furniture -------------------------------------------------------------------------------
  const wood = own(new THREE.MeshLambertMaterial({ map: woodTex("#9a6a3c") }));
  const woodDark = own(new THREE.MeshLambertMaterial({ map: woodTex("#6e4a2a") }));
  const metal = own(new THREE.MeshLambertMaterial({ color: "#d9dde3" }));
  const accent = own(new THREE.MeshLambertMaterial({ color: world.accent }));
  const frame = (s, lat = 0, dy = 0) => {
    const p = T.pointAt(s, lat);
    return { x: p.x, y: p.y + liftAt(s) + dy, z: p.z, h: p.h };
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
  const bannerMesh = (text, bg, fg, w, f, y, back = false) => {
    const mat = own(new THREE.MeshBasicMaterial({ map: bannerTex(text, bg, fg), side: THREE.DoubleSide }));
    const g = own(new THREE.PlaneGeometry(w, w * (96 / 512) * 1.3));
    const m = new THREE.Mesh(g, mat);
    m.position.set(f.x, f.y + y, f.z);
    m.rotation.y = f.h + (back ? 0 : Math.PI);
    group.add(m);
    return m;
  };
  const gantry = (s, text, bg, fg, postMat, extra = 0) => {
    const p = T.sampleAtS(s);
    const half = p.w + 1.2 + extra;
    const f = frame(s);
    const parts = [];
    for (const side of [1, -1]) parts.push(place(new THREE.BoxGeometry(0.5, 6.5, 0.5), half * side, 3.25, 0));
    parts.push(place(new THREE.BoxGeometry(half * 2 + 0.5, 0.5, 0.5), 0, 6.5, 0));
    addMesh(mergeGeometries(parts), postMat, f);
    parts.forEach((g) => g.dispose());
    bannerMesh(text, bg, fg, Math.min(half * 2 - 0.6, 18), f, 5.6);
    const b2 = bannerMesh(text, bg, fg, Math.min(half * 2 - 0.6, 18), f, 5.6, true);
    b2.position.x += Math.sin(f.h) * 0.06;
    b2.position.z += Math.cos(f.h) * 0.06;
  };
  // start house: timber hut over the start, wand across the gate
  let wand = null;
  {
    const f = frame(T.sGate - 5);
    const p = T.sampleAtS(T.sGate);
    const half = Math.min(p.w, 9) + 0.8;
    const parts = [];
    parts.push(place(new THREE.BoxGeometry(half * 2, 0.3, 10), 0, -0.1, 0));
    // an open timber canopy (four posts, low rails) — the countdown camera sees through it
    for (const sx of [1, -1]) {
      for (const sz of [4.6, -4.6]) parts.push(place(new THREE.BoxGeometry(0.4, 4.2, 0.4), half * sx, 2.1, sz));
      parts.push(place(new THREE.BoxGeometry(0.16, 0.16, 9.4), half * sx, 0.9, 0));
    }
    addMesh(mergeGeometries(parts), woodDark, f);
    parts.forEach((g) => g.dispose());
    const roof = new THREE.BoxGeometry(half * 2 + 1.4, 0.5, 11);
    roof.translate(0, 4.4, -1);
    addMesh(roof, own(new THREE.MeshLambertMaterial({ color: "#f4f8fc" })), f);
    const wg = new THREE.BoxGeometry(half * 2 - 0.4, 0.1, 0.1);
    wg.translate(0, 0.55, 0);
    wand = addMesh(wg, accent, frame(T.sGate));
    bannerMesh("START", "#0d2a52", "#ffd21f", Math.min(half * 2, 10), frame(T.sGate + 0.1), 5.0);
  }
  // finish arch + checkered line + flags
  {
    gantry(T.sFinish, "FINISH", "#ffd21f", "#0d2a52", metal, 0.4);
    const p = T.sampleAtS(T.sFinish);
    const cm = own(new THREE.MeshLambertMaterial({ map: checkerTex(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    cm.map.repeat.set(Math.round(p.w * 1.2), 1);
    const g = own(new THREE.PlaneGeometry(p.w * 2, 1.2));
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, cm);
    const f = frame(T.sFinish, 0, 0.07);
    m.position.set(f.x, f.y, f.z);
    m.rotation.y = f.h;
    group.add(m);
    for (let k = 0; k < 10; k++) {
      const pp = T.pointAt(T.sFinish - 30 + k * 7, (p.w + 1.6) * (k % 2 ? 1 : -1));
      put2("flag", pp.x, pp.y, pp.z);
    }
    // sponsor boards along the finish area
    for (const side of [1, -1]) {
      const pp = frame(T.sFinish - 14, (p.w + 0.9) * side);
      const b = bannerMesh(world.name.toUpperCase(), "#0d2a52", "#ffffff", 8, pp, 0.7);
      b.rotation.y = pp.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  function put2(kind, x, y, z) {
    const m = new THREE.Mesh(propGeo(kind), windMat);
    m.position.set(x, y, z);
    m.rotation.y = rand() * 6;
    group.add(m);
  }

  // gates: two poles + numbered panels + a corridor line in the snow
  const gateMeshes = [];
  {
    const poleGeo = own(new THREE.CylinderGeometry(0.045, 0.05, 2.6, 6));
    poleGeo.translate(0, 1.3, 0);
    const panelGeo = own(new THREE.PlaneGeometry(1.15, 0.85));
    const redPole = own(new THREE.MeshLambertMaterial({ color: "#e8283a" }));
    const bluePole = own(new THREE.MeshLambertMaterial({ color: "#1f5fff" }));
    const doneMat = own(new THREE.MeshBasicMaterial({ color: "#3ddc6a", transparent: true, opacity: 0.55, depthWrite: false }));
    const missMat = own(new THREE.MeshBasicMaterial({ color: "#ff3c4a", transparent: true, opacity: 0.55, depthWrite: false }));
    for (const g of T.gates) {
      const gr = new THREE.Group();
      const f = frame(g.s, g.lat);
      gr.position.set(f.x, f.y, f.z);
      gr.rotation.y = f.h;
      const poleMat = g.color === "red" ? redPole : bluePole;
      const panelMat = own(new THREE.MeshLambertMaterial({ map: gatePanelTex(g.color, g.n), side: THREE.DoubleSide }));
      const poles = [];
      for (const side of [1, -1]) {
        const pg = new THREE.Group();
        pg.position.set(g.hw * side, 0, 0);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.castShadow = true;
        pg.add(pole);
        // the panel hangs between this pole and a second (outer) pole, like a GS gate
        const outer = new THREE.Mesh(poleGeo, poleMat);
        outer.position.set(1.2 * side, 0, 0);
        pg.add(outer);
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0.6 * side, 1.95, 0);
        panel.rotation.y = Math.PI;
        pg.add(panel);
        gr.add(pg);
        poles.push(pg);
      }
      // corridor line (subtle) between the inner poles
      const lineG = own(new THREE.PlaneGeometry(g.hw * 2, 0.3));
      lineG.rotateX(-Math.PI / 2);
      const lineMat = own(new THREE.MeshBasicMaterial({ color: g.color === "red" ? "#ff6a78" : "#6a9aff", transparent: true, opacity: 0.45, depthWrite: false }));
      const line = new THREE.Mesh(lineG, lineMat);
      line.position.y = 0.06;
      gr.add(line);
      group.add(gr);
      const wps = [1, -1].map((side) => {
        const q = frame(g.s, g.lat + g.hw * side);
        return [q.x, q.y, q.z];
      });
      gateMeshes.push({ g, gr, poles, wps, line, lineMat, panelMat, state: 0, flex: [0, 0], flexV: [0, 0], doneMat, missMat });
    }
  }
  // next-gate marker: a bobbing chevron above the corridor
  const marker = new THREE.Mesh(own(new THREE.ConeGeometry(0.35, 0.7, 4)), own(new THREE.MeshBasicMaterial({ color: "#ffd21f", transparent: true, opacity: 0.9, fog: false })));
  marker.rotation.x = Math.PI;
  group.add(marker);

  // kickers (snow ramps): a deck with sloped shoulders (matches rampLift exactly)
  for (const r of T.ramps) {
    const hw = r.full ? T.sampleAtS(r.s0).w + 0.6 : r.hw;
    const lats = r.full ? [hw, -hw] : [hw, hw - RAMP_SHOULDER, -(hw - RAMP_SHOULDER), -hw];
    const pos = [];
    const idx = [];
    const n = 12;
    const base = frame(r.s0);
    const toLocal = (P) => {
      const dx = P.x - base.x;
      const dz = P.z - base.z;
      return [dx * Math.cos(-base.h) + dz * Math.sin(-base.h), dx * -Math.sin(-base.h) + dz * Math.cos(-base.h)];
    };
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const s = r.s0 + (r.len * i) / n;
      rows.push(
        lats.map((dl) => {
          const P = T.pointAt(s, r.lat + dl);
          const [lx, lz] = toLocal(P);
          return [lx, P.y - base.y + rampLift(r, s, r.lat + dl) + 0.05, lz, P.y - base.y];
        }),
      );
    }
    const v = (x, y, z) => (pos.push(x, y, z), pos.length / 3 - 1);
    const C = lats.length;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < C - 1; c++) {
        const A = v(...rows[i][c].slice(0, 3));
        const B = v(...rows[i][c + 1].slice(0, 3));
        const Cc = v(...rows[i + 1][c].slice(0, 3));
        const D = v(...rows[i + 1][c + 1].slice(0, 3));
        idx.push(A, B, Cc, B, D, Cc);
      }
      if (r.full) {
        for (const k of [0, C - 1]) {
          const t0 = rows[i][k];
          const t1 = rows[i + 1][k];
          const A = v(t0[0], t0[1], t0[2]);
          const B = v(t1[0], t1[1], t1[2]);
          const Cc = v(t0[0], t0[3] - 0.1, t0[2]);
          const D = v(t1[0], t1[3] - 0.1, t1[2]);
          if (k === 0) idx.push(A, Cc, B, B, Cc, D);
          else idx.push(A, B, Cc, B, D, Cc);
        }
      }
    }
    // lip face (the drop at the end of the deck)
    for (let c = 0; c < C - 1; c++) {
      const tl = rows[n][c];
      const tr = rows[n][c + 1];
      const A = v(tl[0], tl[1], tl[2]);
      const B = v(tr[0], tr[1], tr[2]);
      const Cc = v(tl[0], tl[3] - 0.1, tl[2]);
      const D = v(tr[0], tr[3] - 0.1, tr[2]);
      idx.push(A, Cc, B, B, Cc, D);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = addMesh(g, own(new THREE.MeshLambertMaterial({ color: "#f8fbff", side: THREE.DoubleSide })), base);
    m.castShadow = true;
    // blue lip line + marker flags
    const lipW = r.full ? hw * 2 : (hw - RAMP_SHOULDER) * 2;
    const lm = new THREE.Mesh(own(new THREE.BoxGeometry(lipW, 0.08, 0.35)), own(new THREE.MeshLambertMaterial({ color: "#1f5fff" })));
    const P = T.pointAt(r.s1 - 0.2, r.lat);
    lm.position.set(P.x, P.y + r.h + 0.04, P.z);
    lm.rotation.y = P.h;
    group.add(lm);
    for (const side of [1, -1]) put2("flag", ...Object.values(frame(r.s1, r.lat + (hw + 0.6) * side)).slice(0, 3));
  }
  // obstacles, fences, patches, signs, banners, bridges
  const solidMat = own(windMaterial());
  for (const f of T.feats) {
    if (f.type === "rock") {
      const m = new THREE.Mesh(propGeo("snowrock"), solidMat);
      m.position.set(f.x, f.y - 0.25 * f.r, f.z);
      m.scale.set(f.r, f.r * 1.1, f.r);
      m.rotation.y = f.s;
      m.castShadow = true;
      group.add(m);
    } else if (f.type === "tree") {
      const m = new THREE.Mesh(propGeo(trees[0]), solidMat);
      m.position.set(f.x, f.y - 0.1, f.z);
      m.scale.setScalar(0.85);
      m.castShadow = true;
      group.add(m);
    } else if (f.type === "cannon") {
      const m = new THREE.Mesh(propGeo("cannon"), solidMat);
      m.position.set(f.x, f.y, f.z);
      m.rotation.y = f.h + (f.lat > 0 ? -Math.PI / 2 : Math.PI / 2);
      m.castShadow = true;
      group.add(m);
    } else if (f.type === "fence") {
      // a slatted snow fence (orange) across part of the piste
      const parts = [];
      const len = f.lat1 - f.lat0;
      const n = Math.max(2, Math.round(len / 0.35));
      for (let k = 0; k <= n; k++) parts.push(place(new THREE.BoxGeometry(0.12, FENCE_H, 0.05), -len / 2 + (len * k) / n, FENCE_H / 2, 0));
      for (const y of [0.35, 0.85]) parts.push(place(new THREE.BoxGeometry(len, 0.08, 0.06), 0, y, 0.04));
      const fr = frame(f.s, (f.lat0 + f.lat1) / 2);
      const m = addMesh(mergeGeometries(parts), own(new THREE.MeshLambertMaterial({ color: "#ff7a1a" })), fr);
      m.rotation.y = fr.h;
      parts.forEach((g) => g.dispose());
    } else if (f.type === "patch") {
      const surf = f.surf;
      const mat = own(
        surf === "ice"
          ? new THREE.MeshLambertMaterial({ map: iceTex(), transparent: true, opacity: 0.78, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, depthWrite: false })
          : new THREE.MeshLambertMaterial({ color: surf === "powder" ? "#ffffff" : surf === "rough" ? "#cfdbe8" : "#e8f0f8", transparent: true, opacity: surf === "powder" ? 0.9 : 0.75, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, depthWrite: false }),
      );
      const pos = [];
      const uv = [];
      const idx = [];
      for (let s = f.s0, i = 0; s <= f.s1; s += 1, i++) {
        const S0 = T.sampleAtS(s);
        const wob = Math.sin(s * 0.6) * 0.4;
        const A = T.pointAt(s, Math.min(f.lat1, S0.w + 0.6) + wob);
        const B = T.pointAt(s, Math.max(f.lat0, -S0.w - 0.6) - wob);
        const y = A.y + liftAt(s) + 0.09;
        pos.push(A.x, y, A.z, B.x, y, B.z);
        uv.push(0, s / 6, 1, s / 6);
        if (i > 0) {
          const k = (i - 1) * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const g = own(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, mat));
      // moguls / powder mounds as little bumps
      if (surf === "rough" || surf === "powder") {
        const bump = own(new THREE.SphereGeometry(0.7, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2));
        const list = [];
        for (let s = f.s0 + 1; s < f.s1; s += surf === "rough" ? 2.2 : 3.5) {
          const S0 = T.sampleAtS(s);
          for (let lat = Math.max(f.lat0, -S0.w) + 0.8; lat < Math.min(f.lat1, S0.w) - 0.5; lat += 2.4) {
            const P = T.pointAt(s, lat + (rand() - 0.5));
            list.push([P.x, P.y + liftAt(s), P.z, 0.6 + rand() * 0.6]);
          }
        }
        if (list.length) {
          const im = new THREE.InstancedMesh(bump, own(new THREE.MeshLambertMaterial({ color: surf === "rough" ? "#e2ebf4" : "#ffffff" })), list.length);
          const m4 = new THREE.Matrix4();
          list.forEach(([x, y, z, s], i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y - 0.05, z), new THREE.Quaternion(), new THREE.Vector3(s * 1.3, s * 0.35, s))));
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          group.add(im);
        }
      }
    } else if (f.type === "sign") {
      const seg = T.segs[f.seg + 1];
      const left = seg ? seg.curv > 0 : f.left;
      const p = T.sampleAtS(f.s);
      const side = left ? -1 : 1;
      const P = frame(f.s, (p.w + 1.2) * side);
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(2.4, 0.9)), own(new THREE.MeshBasicMaterial({ map: arrowTex(left) })));
      m.position.set(P.x, P.y + 1.5, P.z);
      m.rotation.y = P.h + Math.PI;
      group.add(m);
      const pm = new THREE.Mesh(own(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 5)), metal);
      pm.position.set(P.x, P.y + 0.75, P.z);
      group.add(pm);
    } else if (f.type === "banner") {
      gantry(f.s, f.text || "GO!", world.accent, "#0d2a52", woodDark);
    } else if (f.type === "bridge") {
      addBridge(f.s0, f.s1);
    }
  }
  function addBridge(s0, s1) {
    const parts = [];
    const posts = [];
    for (let s = s0; s <= s1; s += 1.2) {
      const P = T.pointAt(s, 0);
      const w = T.sampleAtS(s).w + 0.5;
      const deck = new THREE.BoxGeometry(w * 2, 0.2, 1.1);
      deck.rotateY(P.h);
      deck.translate(P.x, P.y - 0.06, P.z);
      parts.push(deck);
    }
    for (let s = s0; s <= s1; s += 3) {
      const w = T.sampleAtS(s).w + 0.5;
      for (const side of [1, -1]) {
        const Q = T.pointAt(s, w * side);
        const post = new THREE.BoxGeometry(0.22, 1.2, 0.22);
        post.translate(Q.x, Q.y + 0.55, Q.z);
        posts.push(post);
        const leg = new THREE.BoxGeometry(0.35, 18, 0.35);
        leg.translate(Q.x, Q.y - 9, Q.z);
        posts.push(leg);
      }
    }
    const dg = own(mergeGeometries(parts));
    parts.forEach((g) => g.dispose());
    const dm = new THREE.Mesh(dg, wood);
    dm.receiveShadow = true;
    group.add(dm);
    const pg = own(mergeGeometries(posts));
    posts.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(pg, woodDark));
    // rails + snow on the deck edges
    for (const side of [1, -1]) {
      const pts = [];
      for (let s = s0; s <= s1; s += 1) {
        const P = T.pointAt(s, (T.sampleAtS(s).w + 0.5) * side);
        pts.push(new THREE.Vector3(P.x, P.y + 1.1, P.z));
      }
      const g = own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.07, 5, false));
      group.add(new THREE.Mesh(g, woodDark));
    }
    // frozen creek below
    const P = T.pointAt((s0 + s1) / 2);
    const cg = own(new THREE.PlaneGeometry(120, Math.max(10, s1 - s0 - 4)));
    cg.rotateX(-Math.PI / 2);
    const cm = new THREE.Mesh(cg, own(new THREE.MeshLambertMaterial({ map: iceTex(), color: "#d8f0ff" })));
    cm.position.set(P.x, P.y - 17.5, P.z);
    cm.rotation.y = P.h;
    group.add(cm);
  }

  // snow cannons puff a little mist (sprites)
  const puffs = [];
  {
    const sm = own(new THREE.SpriteMaterial({ map: softDot(), color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false }));
    for (const f of T.feats.filter((x) => x.type === "cannon")) {
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Sprite(sm);
        sp.userData = { f, k };
        group.add(sp);
        puffs.push(sp);
      }
    }
  }

  function update(t, race) {
    for (const fn of animated) fn(t);
    if (chairs) chairs(t);
    for (const sp of puffs) {
      const { f, k } = sp.userData;
      const u = (t * 0.6 + k / 4) % 1;
      const dir = f.lat > 0 ? -1 : 1;
      const P = T.pointAt(f.s + u * 3, f.lat + dir * (1 + u * 6));
      sp.position.set(P.x, f.y + 2.2 + u * 1.5, P.z);
      sp.scale.setScalar(1 + u * 4);
      sp.material.opacity = 0.45;
    }
    if (wand && race) wand.visible = race.state === "COUNTDOWN";
    if (!race) return;
    const P = race.player;
    const px = P.sk.x;
    const pz = P.sk.z;
    // anything past the fog is the fog colour anyway: skip drawing it
    const far2 = (world.sky.fogFar + TILE) ** 2;
    for (const tl of tiles) tl.m.visible = (tl.x - px) ** 2 + (tl.z - pz) ** 2 < far2;
    const skiers = race.racers.map((r) => r.sk);
    const gatesOn = !race.free;
    const gFar2 = Math.min(world.sky.fogFar, 260) ** 2;
    for (const gm of gateMeshes) {
      const [gx, , gz] = gm.wps[0];
      gm.gr.visible = gatesOn && (gx - px) ** 2 + (gz - pz) ** 2 < gFar2;
      if (!gm.gr.visible) continue;
      const idx = gm.g.i;
      let st = 0;
      if (idx < P.nextGate) st = P.passed.includes(idx) ? 1 : 2;
      if (st !== gm.state) {
        gm.state = st;
        gm.line.material = st === 1 ? gm.doneMat : st === 2 ? gm.missMat : gm.lineMat;
        gm.panelMat.color.set(st === 0 ? "#ffffff" : st === 1 ? "#9fffbf" : "#777777");
        for (const pl of gm.poles) pl.visible = true;
      }
      // pole flex: a skier brushing past knocks the pole, which springs back
      for (let k = 0; k < 2; k++) {
        const pl = gm.poles[k];
        const [wx, wy, wz] = gm.wps[k];
        for (const K of skiers) {
          const d = Math.hypot(K.x - wx, K.z - wz);
          if (d < 0.9 && Math.abs(K.y - wy) < 2) gm.flexV[k] += (0.9 - d) * 0.9 * Math.sign(k ? -1 : 1);
        }
        gm.flexV[k] += (-gm.flex[k] * 70 - gm.flexV[k] * 6) * (1 / 60);
        gm.flex[k] += gm.flexV[k] * (1 / 60);
        pl.rotation.x = Math.max(-1.2, Math.min(1.2, gm.flex[k]));
      }
    }
    // marker over the next gate
    const g = gatesOn ? T.gates[P.nextGate] : null;
    marker.visible = !!g && race.state !== "FINISHED";
    if (g) {
      const f = frame(g.s, g.lat);
      marker.position.set(f.x, f.y + 3.6 + Math.sin(t * 4) * 0.18, f.z);
      marker.rotation.y = t * 2;
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

void BUFFER;
void colorize;
