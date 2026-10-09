/**
 * Stunt Racer 3D — builds everything that belongs to the track itself from
 * the engine's sampled frames (so what you see is exactly what you drive on):
 *
 *   deck       top surface per material (road / ramp / start), sides with a
 *              light strip, underside — loops are the same ribbon, inside up
 *   rails      glass (beginner), barrier (desert / extreme), neon (city)
 *   supports   pillars down into the clouds / to the ground
 *   gates      start, checkpoints (turn green when passed), finish
 *   items      boost pads (scrolling arrows), signs, stars, nitro canisters
 *   obstacles  meshes posed every frame from obstacles.shapesAt() — the same
 *              shapes the collision uses
 *   tiles      crumbling floor tiles (shake, then drop)
 *   tunnels    neon arches
 *
 * Static parts are merged by material; returns { group, update, dispose }.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAIL_H } from "../engine/track.js";
import { shapesAt } from "../engine/obstacles.js";
import { roadTex, rampTex, startTex, sideTex, checkerTex, boostTex, hazardTex, labelTex, softDot } from "./textures.js";

const DECK = 0.9;

/** Frame of sample k, or a virtual point one metre past a road end into a gap. */
function runPoints(S, a, b) {
  const pts = [];
  const pick = (p, shift = 0) => ({
    x: p.x + p.tx * shift,
    y: p.y + p.ty * shift,
    z: p.z + p.tz * shift,
    tx: p.tx,
    ty: p.ty,
    tz: p.tz,
    nx: p.nx,
    ny: p.ny,
    nz: p.nz,
    ux: p.ux,
    uy: p.uy,
    uz: p.uz,
    w: p.w,
    s: p.s + shift,
    kind: p.kind,
    railL: p.railL,
    railR: p.railR,
  });
  for (let k = a; k <= b; k++) pts.push(pick(S[k]));
  if (S[b + 1] && S[b + 1].kind === "gap") pts.push(pick(S[b], 1));
  return pts;
}

/** Contiguous road runs (no gaps), optionally split where `cut(k)` is true. */
function roadRuns(S, cut = () => false) {
  const runs = [];
  let a = -1;
  for (let k = 0; k < S.length; k++) {
    const good = S[k].kind !== "gap" && !cut(k);
    if (good && a < 0) a = k;
    if ((!good || k === S.length - 1) && a >= 0) {
      const b = good ? k : k - 1;
      if (b > a) runs.push([a, b]);
      a = -1;
    }
  }
  return runs;
}

/** Generic ribbon: rows of [x,y,z,u,v] → indexed geometry with smooth normals. */
function ribbon(rows) {
  const n = rows.length;
  if (n < 2) return null;
  const m = rows[0].length;
  const pos = new Float32Array(n * m * 3);
  const uv = new Float32Array(n * m * 2);
  const idx = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const v = rows[i][j];
      const o = i * m + j;
      pos[o * 3] = v[0];
      pos[o * 3 + 1] = v[1];
      pos[o * 3 + 2] = v[2];
      uv[o * 2] = v[3];
      uv[o * 2 + 1] = v[4];
    }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = (i + 1) * m + j;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const off = (p, lat, h) => [p.x + p.nx * lat + p.ux * h, p.y + p.ny * lat + p.uy * h, p.z + p.nz * lat + p.uz * h];

/** Deck of one run of points: { top: {kind: [rows]}, sides, bottom, strips }. */
function deckRows(pts, kindOf) {
  const tops = {};
  const left = [];
  const right = [];
  const bottom = [];
  const stripL = [];
  const stripR = [];
  let cur = null;
  let rows = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const hw = p.w / 2;
    const k = kindOf(p, i);
    const vScale = k === "ramp" ? 8 : k === "start" ? 6 : 16;
    const row = [
      [...off(p, -hw, 0), 0, p.s / vScale],
      [...off(p, hw, 0), 1, p.s / vScale],
    ];
    if (k !== cur) {
      // close the previous material run on this row (shared edge, no seam)
      if (rows) rows.push([
        [...off(p, -hw, 0), 0, p.s / (cur === "ramp" ? 8 : cur === "start" ? 6 : 16)],
        [...off(p, hw, 0), 1, p.s / (cur === "ramp" ? 8 : cur === "start" ? 6 : 16)],
      ]);
      cur = k;
      rows = [];
      (tops[k] = tops[k] || []).push(rows);
    }
    rows.push(row);
    const d = p.kind === "loop" ? 0.6 : DECK;
    left.push([
      [...off(p, hw, 0), p.s / 8, 1],
      [...off(p, hw, -d), p.s / 8, 0],
    ]);
    right.push([
      [...off(p, -hw, -d), p.s / 8, 0],
      [...off(p, -hw, 0), p.s / 8, 1],
    ]);
    bottom.push([
      [...off(p, hw, -d), 0, p.s / 8],
      [...off(p, -hw, -d), 1, p.s / 8],
    ]);
    // light strips just under the deck lip
    stripL.push([
      [...off(p, hw + 0.03, -0.08), 0, 0],
      [...off(p, hw + 0.03, -0.26), 0, 1],
    ]);
    stripR.push([
      [...off(p, -hw - 0.03, -0.26), 0, 1],
      [...off(p, -hw - 0.03, -0.08), 0, 0],
    ]);
  }
  return { tops, left, right, bottom, stripL, stripR };
}

function railRows(pts, side) {
  // runs of this side's rail flag
  const out = [];
  let cur = null;
  for (const p of pts) {
    const has = side > 0 ? p.railL || p.kind === "loop" : p.railR || p.kind === "loop";
    if (has) {
      if (!cur) {
        cur = [];
        out.push(cur);
      }
      cur.push(p);
    } else cur = null;
  }
  return out.filter((r) => r.length > 1);
}

function makeMaterials(world, quality) {
  const R = world.road;
  const night = !!world.sky.night;
  const m = {};
  const road = roadTex(R, night);
  m.road = new THREE.MeshStandardMaterial({ map: road, roughness: 0.82, metalness: 0.05, emissive: night ? "#ffffff" : "#000000", emissiveMap: night ? road : null, emissiveIntensity: night ? 0.22 : 0 });
  const ramp = rampTex(R);
  m.ramp = new THREE.MeshStandardMaterial({ map: ramp, roughness: 0.7, metalness: 0.05, emissive: night ? "#ffffff" : "#000000", emissiveMap: night ? ramp : null, emissiveIntensity: night ? 0.3 : 0 });
  m.start = new THREE.MeshStandardMaterial({ map: startTex(R), roughness: 0.8 });
  m.loop = m.road;
  m.side = new THREE.MeshStandardMaterial({ map: sideTex(R), roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  m.under = new THREE.MeshStandardMaterial({ color: R.under, roughness: 0.9 });
  m.strip = new THREE.MeshBasicMaterial({ color: R.accent, fog: true, side: THREE.DoubleSide });
  m.strip2 = new THREE.MeshBasicMaterial({ color: R.edge2, fog: true, side: THREE.DoubleSide });
  if (R.rail === "glass") {
    m.rail = new THREE.MeshStandardMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
    m.railTop = new THREE.MeshStandardMaterial({ color: "#e9f2fb", metalness: 0.8, roughness: 0.25 });
  } else if (R.rail === "neon") {
    m.rail = new THREE.MeshBasicMaterial({ color: R.edge, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    m.railTop = new THREE.MeshBasicMaterial({ color: R.edge2 });
  } else {
    m.rail = new THREE.MeshStandardMaterial({ map: hazardTex(R.edge, "#f5f1ea"), roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
    m.railTop = new THREE.MeshStandardMaterial({ color: "#d9dde3", metalness: 0.85, roughness: 0.3 });
  }
  m.post = new THREE.MeshStandardMaterial({ color: night ? "#2a2540" : "#c8ced8", metalness: 0.7, roughness: 0.35 });
  m.pillar = new THREE.MeshStandardMaterial({ color: R.pillar, roughness: 0.75, metalness: 0.1 });
  m.hazard = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.55, metalness: 0.2 });
  m.metal = new THREE.MeshStandardMaterial({ color: "#3a3f4a", metalness: 0.8, roughness: 0.35 });
  m.red = new THREE.MeshStandardMaterial({ color: "#e0262f", roughness: 0.4, metalness: 0.3 });
  m.chrome = new THREE.MeshStandardMaterial({ color: "#d9dde3", metalness: 1, roughness: 0.2 });
  m.boost = new THREE.MeshBasicMaterial({ map: boostTex().clone(), transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  m.boost.map.needsUpdate = true;
  m.checker = new THREE.MeshStandardMaterial({ map: checkerTex(8), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  m.star = new THREE.MeshStandardMaterial({ color: "#ffcc1a", emissive: "#ffae00", emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.25 });
  m.glow = new THREE.SpriteMaterial({ map: softDot(), color: "#ffd84a", transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  m.nitro = new THREE.MeshStandardMaterial({ color: "#1f7bff", emissive: "#0a4bd6", emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.3 });
  m.nitroCap = new THREE.MeshStandardMaterial({ color: "#eef4ff", metalness: 0.9, roughness: 0.2 });
  m.nitroGlow = new THREE.SpriteMaterial({ map: softDot(), color: "#5ac8ff", transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  m.tile = new THREE.MeshStandardMaterial({ map: road, color: "#ffcfb0", roughness: 0.85 });
  m.tileEdge = new THREE.MeshStandardMaterial({ map: hazardTex("#ff7a1a", "#2a1a10"), roughness: 0.6 });
  m.tunnel = new THREE.MeshBasicMaterial({ color: R.edge });
  m.tunnel2 = new THREE.MeshBasicMaterial({ color: R.edge2 });
  m.tunnelFrame = new THREE.MeshStandardMaterial({ color: "#1b1828", metalness: 0.6, roughness: 0.4 });
  void quality;
  return m;
}

function basisMatrix(p, lat = 0, h = 0) {
  const m = new THREE.Matrix4();
  m.makeBasis(new THREE.Vector3(p.nx, p.ny, p.nz), new THREE.Vector3(p.ux, p.uy, p.uz), new THREE.Vector3(p.tx, p.ty, p.tz));
  const o = off(p, lat, h);
  m.setPosition(o[0], o[1], o[2]);
  return m;
}

/** A gate: two pylons and a banner beam across the road. */
function buildGate(f, kind, world, mats, label) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  g.matrix.copy(basisMatrix(f));
  const hw = f.w / 2 + 0.9;
  const H = kind === "finish" ? 8 : 6.6;
  const colorA = kind === "finish" ? "#ffffff" : kind === "start" ? world.road.accent : "#ffc21a";
  const pyl = new THREE.MeshStandardMaterial({ color: kind === "finish" ? "#16181d" : "#1d2130", metalness: 0.5, roughness: 0.4 });
  const glow = new THREE.MeshBasicMaterial({ color: colorA });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), pyl);
    p.position.set(sx * hw, H / 2, 0);
    p.castShadow = true;
    g.add(p);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, H - 1, 0.95), glow);
    s.position.set(sx * (hw - 0.5), H / 2, 0);
    g.add(s);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.9, 1.7, 0.7), pyl);
  beam.position.set(0, H - 0.4, 0);
  g.add(beam);
  const tex = kind === "finish" ? checkerTex(10) : labelTex(label, { accent: colorA, bg: "#121520", w: 1024, h: 160, font: 96 });
  const banner = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 - 0.4, 1.45), banner);
  front.position.set(0, H - 0.4, -0.37);
  front.rotation.y = Math.PI;
  g.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 - 0.4, 1.45), banner);
  back.position.set(0, H - 0.4, 0.37);
  g.add(back);
  if (kind === "finish") {
    const word = new THREE.MeshBasicMaterial({ map: labelTex("FINISH", { accent: "#ffcc1a", bg: "#101218", w: 512, h: 128 }), side: THREE.DoubleSide, toneMapped: false });
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), word);
    wm.position.set(0, H + 1.1, -0.1);
    wm.rotation.y = Math.PI;
    g.add(wm);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.7, 0.4), pyl);
    pole.position.set(0, H + 1.1, 0.12);
    g.add(pole);
  }
  // checkered / painted line on the road
  if (kind !== "checkpoint") {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(f.w, kind === "finish" ? 2.4 : 1.2), mats.checker);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.03, 0);
    g.add(line);
  }
  g.updateMatrixWorld(true);
  return { group: g, glow, pyl, banner };
}

function buildSign(f, side, text, world) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  const lat = side * (f.w / 2 + 1.6);
  g.matrix.copy(basisMatrix(f, lat, 0));
  const accent = /LOOP/.test(text) ? "#ff3b5c" : /JUMP/.test(text) ? "#ffb21a" : world.road.accent;
  const mat = new THREE.MeshBasicMaterial({ map: labelTex(text, { accent, bg: "#0f1220", w: 512, h: 160, font: 64 }), toneMapped: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.7), mat);
  panel.position.set(0, 3.4, 0);
  panel.rotation.y = Math.PI; // faces the oncoming car
  const backMat = new THREE.MeshStandardMaterial({ color: "#20242e", metalness: 0.4, roughness: 0.5 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.9, 0.12), backMat);
  back.position.set(0, 3.4, 0.08);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.6, 0.22), backMat);
  post.position.set(0, 1.2, 0.1);
  // little cantilever from the deck edge
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.6), backMat);
  arm.position.set(-side * 0.9, -0.25, 0.1);
  g.add(panel, back, post, arm);
  g.updateMatrixWorld(true);
  return { group: g, mats: [mat, backMat] };
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.42 : 1.0;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
  g.translate(0, 0, -0.11);
  return g;
}

/** Obstacle visuals posed from the same shapes the collision uses. */
function buildObstacle(o, f, mats) {
  const g = new THREE.Group();
  g.matrixAutoUpdate = false;
  g.matrix.copy(basisMatrix(f));
  const parts = [];
  const hw = o.hw;
  const geos = [];
  const keep = (geo) => {
    geos.push(geo);
    return geo;
  };
  let update = () => {};
  if (o.type === "spinner" || o.type === "arm") {
    const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.6, 0.75, 3, 16)), mats.metal);
    post.position.set(o.lat, 1.5, 0);
    const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 16)), mats.red);
    cap.position.set(o.lat, 3.05, 0);
    const len = o.type === "spinner" ? o.len * 2 : o.len;
    const barGeo = keep(new THREE.BoxGeometry(0.84, 0.95, len));
    if (o.type === "arm") barGeo.translate(0, 0, len / 2);
    const bar = new THREE.Mesh(barGeo, mats.hazard);
    bar.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(o.lat, 0.95, 0);
    pivot.add(bar);
    g.add(post, cap, pivot);
    update = (t) => {
      const sh = shapesAt(o, t, hw)[1];
      pivot.rotation.y = Math.atan2(sh.by - sh.ay, sh.bx - sh.ax);
    };
  } else if (o.type === "hammer" || o.type === "ball") {
    const pivotH = 1.05 + o.len;
    const gw = hw + 1.0;
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(keep(new THREE.BoxGeometry(0.7, pivotH + 1.2, 0.7)), mats.metal);
      p.position.set(sx * gw, (pivotH + 1.2) / 2, 0);
      p.castShadow = true;
      g.add(p);
    }
    const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(gw * 2 + 0.7, 0.8, 0.9)), mats.hazard);
    beam.position.set(0, pivotH + 0.8, 0);
    g.add(beam);
    const pend = new THREE.Group();
    pend.position.set(o.lat, pivotH, 0);
    const rod = new THREE.Mesh(keep(new THREE.CylinderGeometry(o.type === "ball" ? 0.07 : 0.16, o.type === "ball" ? 0.07 : 0.16, o.len, 8)), o.type === "ball" ? mats.chrome : mats.metal);
    rod.position.y = -o.len / 2;
    pend.add(rod);
    if (o.type === "hammer") {
      const head = new THREE.Mesh(keep(new THREE.BoxGeometry(2.3, 2.2, 2.5)), mats.red);
      head.position.y = -o.len;
      head.castShadow = true;
      const band = new THREE.Mesh(keep(new THREE.BoxGeometry(2.36, 0.5, 2.56)), mats.hazard);
      band.position.y = -o.len;
      pend.add(head, band);
    } else {
      const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(o.r, 24, 16)), mats.metal);
      ball.position.y = -o.len;
      ball.castShadow = true;
      pend.add(ball);
    }
    g.add(pend);
    update = (t) => {
      const sh = shapesAt(o, t, hw)[0];
      pend.rotation.z = sh.phi;
    };
  } else {
    // generic boxes (slider / gate / doors / wall) + an overhead frame
    const boxes = [];
    const n = shapesAt(o, 0, hw).length;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(keep(new THREE.BoxGeometry(1, 1, 1)), mats.hazard);
      m.castShadow = true;
      g.add(m);
      boxes.push(m);
    }
    if (o.type !== "slider") {
      const top = o.type === "gate" ? 3.4 : 3.8;
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, top + 1.4, 0.5)), mats.metal);
        p.position.set(sx * (hw + 1.6), (top + 1.4) / 2, 0);
        g.add(p);
      }
      const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(hw * 2 + 3.6, 0.5, 0.6)), mats.metal);
      beam.position.set(0, top + 1.2, 0);
      g.add(beam);
    } else {
      const track = new THREE.Mesh(keep(new THREE.BoxGeometry(hw * 2, 0.06, 0.5)), mats.metal);
      track.position.set(0, 0.03, 0);
      g.add(track);
    }
    update = (t) => {
      const shapes = shapesAt(o, t, hw);
      for (let i = 0; i < boxes.length; i++) {
        const sh = shapes[i];
        const b = boxes[i];
        b.visible = sh.hy > 0.06;
        b.scale.set(Math.max(0.01, sh.hy * 2), sh.top, sh.hx * 2);
        b.position.set(sh.y, sh.top / 2, sh.x);
      }
    };
  }
  g.updateMatrixWorld(true);
  return { group: g, update, dispose: () => geos.forEach((x) => x.dispose()), parts };
}

export function buildTrackMesh(T, world, quality = "medium", opts = {}) {
  const S = T.samples;
  const group = new THREE.Group();
  const mats = makeMaterials(world, quality);
  const geos = [];
  const disposers = [];
  const meshOf = (geo, mat, { shadow = false, receive = true } = {}) => {
    if (!geo) return null;
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = receive;
    group.add(m);
    return m;
  };
  const merge = (list) => {
    const l = list.filter(Boolean);
    if (!l.length) return null;
    const out = mergeGeometries(l, false);
    l.forEach((x) => x.dispose());
    return out;
  };

  // --- deck ----------------------------------------------------------------------------
  const isTile = (k) => S[k].fall;
  const runs = roadRuns(S, isTile);
  const topBuckets = { road: [], ramp: [], start: [], loop: [] };
  const sides = [];
  const bottoms = [];
  const strips = [];
  const allRuns = [];
  for (const [a, b] of runs) {
    const pts = runPoints(S, a, b);
    allRuns.push(pts);
    const D = deckRows(pts, (p) => (p.kind === "ramp" ? "ramp" : p.kind === "start" ? "start" : p.kind === "loop" ? "loop" : "road"));
    for (const [k, list] of Object.entries(D.tops)) for (const rows of list) topBuckets[k].push(ribbon(rows));
    sides.push(ribbon(D.left), ribbon(D.right));
    bottoms.push(ribbon(D.bottom));
    strips.push(ribbon(D.stripL), ribbon(D.stripR));
  }
  for (const [k, list] of Object.entries(topBuckets)) meshOf(merge(list), mats[k], { receive: true });
  meshOf(merge(sides), mats.side);
  meshOf(merge(bottoms), mats.under);
  meshOf(merge(strips), mats.strip, { receive: false });

  // --- rails ---------------------------------------------------------------------------
  const railPanels = [];
  const railTops = [];
  const postGeos = [];
  for (const pts of allRuns) {
    for (const side of [1, -1]) {
      for (const r of railRows(pts, side)) {
        const panel = [];
        const top = [];
        for (const p of r) {
          const lat = side * (p.w / 2 - 0.08);
          const h = p.kind === "loop" ? RAIL_H + 0.3 : RAIL_H;
          panel.push(
            side > 0
              ? [
                  [...off(p, lat, 0), p.s / 4, 0],
                  [...off(p, lat, h), p.s / 4, 1],
                ]
              : [
                  [...off(p, lat, h), p.s / 4, 1],
                  [...off(p, lat, 0), p.s / 4, 0],
                ],
          );
          top.push([
            [...off(p, lat - side * 0.11, h + 0.06), 0, 0],
            [...off(p, lat + side * 0.11, h + 0.06), 1, 0],
          ]);
        }
        railPanels.push(ribbon(panel));
        railTops.push(ribbon(top));
        // posts every 4 m
        for (let i = 0; i < r.length; i += 4) {
          const p = r[i];
          const lat = side * (p.w / 2 - 0.08);
          const geo = new THREE.BoxGeometry(0.14, (p.kind === "loop" ? RAIL_H + 0.3 : RAIL_H) + 0.08, 0.14);
          geo.translate(0, ((p.kind === "loop" ? RAIL_H + 0.3 : RAIL_H) + 0.08) / 2, 0);
          geo.applyMatrix4(basisMatrix(p, lat, 0));
          postGeos.push(geo);
        }
      }
    }
  }
  const railMesh = meshOf(merge(railPanels), mats.rail, { receive: false });
  if (railMesh) railMesh.renderOrder = 2;
  meshOf(merge(railTops), mats.railTop, { receive: false });
  meshOf(merge(postGeos), mats.post, { receive: false });

  // --- supports ------------------------------------------------------------------------
  const groundY = opts.groundY ?? T.minY - 90;
  const pillarGeos = [];
  for (let k = 20; k < S.length - 10; k += 34) {
    const p = S[k];
    if (!p.road || p.kind === "loop" || p.fall) continue;
    let near = false;
    for (let j = k - 8; j <= k + 8; j++) if (S[j] && (S[j].kind === "gap" || S[j].kind === "loop")) near = true;
    if (near) continue;
    const bottom = off(p, 0, -DECK);
    const h = bottom[1] - groundY;
    if (h < 2) continue;
    const col = new THREE.CylinderGeometry(0.9, 1.3, h, 12, 1);
    col.translate(bottom[0], bottom[1] - h / 2, bottom[2]);
    pillarGeos.push(col);
    const cap = new THREE.BoxGeometry(p.w * 0.8, 0.9, 1.6);
    cap.applyMatrix4(basisMatrix(p, 0, -DECK - 0.45));
    pillarGeos.push(cap);
  }
  // loop braces: from the ring's two sides (outside it, never across the
  // opening) diagonally down and out to the ground / cloud layer
  for (const lp of T.loops) {
    const c = T.frameAt(lp.s0);
    const fh = Math.hypot(c.tx, c.tz) || 1;
    const fx = c.tx / fh;
    const fz = c.tz / fh;
    const mid = T.frameAt(lp.s0 + (lp.s1 - lp.s0) * 0.25); // ring side at mid-height
    const mid2 = T.frameAt(lp.s0 + (lp.s1 - lp.s0) * 0.75);
    for (const [m, sx] of [
      [mid, 1],
      [mid2, -1],
    ]) {
      const top = new THREE.Vector3(m.x - m.ux * 0.9, m.y - m.uy * 0.9, m.z - m.uz * 0.9);
      const h = top.y - groundY;
      for (const side of [-1, 1]) {
        const foot = new THREE.Vector3(top.x + fx * sx * h * 0.28 + m.nx * side * 3, groundY, top.z + fz * sx * h * 0.28 + m.nz * side * 3);
        const dir = foot.clone().sub(top);
        const len = dir.length();
        const leg = new THREE.CylinderGeometry(0.45, 0.8, len, 8);
        leg.translate(0, -len / 2, 0);
        leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize()));
        leg.translate(top.x, top.y, top.z);
        pillarGeos.push(leg);
      }
    }
  }
  meshOf(merge(pillarGeos), mats.pillar, { receive: false });

  // --- gates ---------------------------------------------------------------------------
  const gates = [];
  const addGate = (s, kind, label) => {
    const g = buildGate(T.frameAt(s), kind, world, mats, label);
    group.add(g.group);
    gates.push({ ...g, s, kind });
    return g;
  };
  addGate(T.start + 4, "start", "START");
  const allGates = opts.gates !== "start";
  const cps = allGates ? T.checkpoints.map((cp, i) => addGate(cp.s, "checkpoint", `CHECKPOINT ${i + 1}`)) : [];
  if (allGates) addGate(T.finish, "finish", "FINISH");

  // --- signs ---------------------------------------------------------------------------
  for (const sg of T.signs) {
    const b = buildSign(T.frameAt(sg.s), sg.side, sg.text, world);
    group.add(b.group);
    disposers.push(() => b.mats.forEach((m) => m.dispose()));
  }

  // --- boost pads ----------------------------------------------------------------------
  const padRows = [];
  for (const b of T.boosts) {
    const rows = [];
    for (let s = b.s; s <= b.s + b.len + 1e-6; s += 1) {
      const f = T.frameAt(s);
      rows.push([
        [...off(f, b.lat - b.w / 2, 0.04), 0, (s - b.s) / b.len],
        [...off(f, b.lat + b.w / 2, 0.04), 1, (s - b.s) / b.len],
      ]);
    }
    padRows.push(ribbon(rows));
  }
  meshOf(merge(padRows), mats.boost, { receive: false });

  // --- stars ---------------------------------------------------------------------------
  const starGeo = starGeometry();
  geos.push(starGeo);
  const stars = T.stars.map((st) => {
    const g = new THREE.Group();
    g.position.set(st.pos.x, st.pos.y, st.pos.z);
    const m = new THREE.Mesh(starGeo, mats.star);
    m.scale.setScalar(0.95);
    m.castShadow = false;
    const glow = new THREE.Sprite(mats.glow);
    glow.scale.setScalar(3.6);
    g.add(glow, m);
    group.add(g);
    return { g, m, base: st.pos };
  });

  // --- nitro canisters -----------------------------------------------------------------
  const canGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 16);
  const capGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.14, 16);
  geos.push(canGeo, capGeo);
  const nitros = T.nitros.map((nt) => {
    const p = T.pointAt(nt.s, nt.lat, 1.0);
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    const body = new THREE.Mesh(canGeo, mats.nitro);
    const c1 = new THREE.Mesh(capGeo, mats.nitroCap);
    c1.position.y = 0.5;
    const c2 = new THREE.Mesh(capGeo, mats.nitroCap);
    c2.position.y = -0.5;
    const inner = new THREE.Group();
    inner.rotation.z = 0.5;
    inner.add(body, c1, c2);
    const glow = new THREE.Sprite(mats.nitroGlow);
    glow.scale.setScalar(2.8);
    g.add(glow, inner);
    group.add(g);
    return { g, inner, base: p };
  });

  // --- obstacles -----------------------------------------------------------------------
  const obstacles = (opts.obstacles || []).map((o) => {
    const b = buildObstacle(o, T.frameAt(o.s), mats);
    group.add(b.group);
    return { ...b, o };
  });

  // --- crumbling tiles -----------------------------------------------------------------
  const tiles = (opts.tiles || []).map((tl) => {
    const pts = [];
    for (let s = tl.s0; s <= tl.s1 + 1e-6; s += 1) {
      const f = T.frameAt(Math.min(s, tl.s1 - 0.02));
      pts.push({ x: f.x, y: f.y, z: f.z, tx: f.tx, ty: f.ty, tz: f.tz, nx: f.nx, ny: f.ny, nz: f.nz, ux: f.ux, uy: f.uy, uz: f.uz, w: f.w, s, kind: "road" });
    }
    // small gap between tiles so they read as separate slabs
    const shrink = (p, k) => ({ ...p, x: p.x + p.tx * k, y: p.y + p.ty * k, z: p.z + p.tz * k });
    pts[0] = shrink(pts[0], 0.12);
    pts[pts.length - 1] = shrink(pts[pts.length - 1], -0.12);
    const D = deckRows(pts, () => "road");
    const gTop = ribbon(D.tops.road[0]);
    const gSide = merge([ribbon(D.left), ribbon(D.right), ribbon(D.bottom)]);
    geos.push(gTop, gSide);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(gTop, mats.tile), new THREE.Mesh(gSide, mats.tileEdge));
    g.children[0].receiveShadow = true;
    group.add(g);
    return { g, tl };
  });

  // --- neon tunnels --------------------------------------------------------------------
  const archGeos = [];
  const arch2 = [];
  let archN = 0;
  for (const tn of T.tunnels) {
    for (let s = tn.s0 + 2; s < tn.s1 - 1; s += 6) {
      const f = T.frameAt(s);
      const R = f.w / 2 + 1.2;
      // smooth half ring, a little flattened, standing on the deck edges
      const ring = new THREE.TorusGeometry(R, 0.2, 6, 28, Math.PI);
      ring.scale(1, 0.78, 1);
      ring.translate(0, 0.25, 0);
      ring.applyMatrix4(basisMatrix(f));
      (archN++ % 2 ? archGeos : arch2).push(ring);
    }
  }
  meshOf(merge(archGeos), mats.tunnel, { receive: false });
  meshOf(merge(arch2), mats.tunnel2, { receive: false });

  // --- per-frame updates -----------------------------------------------------------------
  let boostScroll = 0;
  function update(run, dt, clock) {
    boostScroll = (boostScroll - dt * 2.2) % 1;
    mats.boost.map.offset.y = boostScroll;
    const t = clock;
    stars.forEach((s, i) => {
      const taken = run && run.stars.has(i);
      s.g.visible = !taken;
      if (!taken) {
        s.m.rotation.y = t * 2.2 + i;
        s.g.position.y = s.base.y + Math.sin(t * 2.4 + i) * 0.18;
      }
    });
    nitros.forEach((n, i) => {
      const gone = run && run.clock - run.nitroTaken[i] < 12;
      n.g.visible = !gone;
      n.inner.rotation.y = t * 1.6 + i;
      n.g.position.y = n.base.y + Math.sin(t * 2 + i * 2) * 0.15;
    });
    for (const ob of obstacles) ob.update(run ? run.clock : t);
    for (const tile of tiles) {
      const tl = run ? run.tiles.find((x) => x.s0 === tile.tl.s0) : null;
      if (!tl) continue;
      const shaking = tl.trig >= 0 && tl.drop === 0;
      tile.g.position.set(shaking ? (Math.random() - 0.5) * 0.06 : 0, -tl.drop + (shaking ? (Math.random() - 0.5) * 0.05 : 0), 0);
      tile.g.visible = tl.drop < 120;
    }
    if (run) {
      cps.forEach((g, i) => {
        const done = i < run.cpIndex;
        const c = done ? "#3ddc6a" : "#ffc21a";
        if (g.glow.color.getHexString() !== c.slice(1)) g.glow.color.set(c);
      });
    }
  }

  return {
    group,
    update,
    mats,
    dispose() {
      for (const g of geos) g && g.dispose();
      for (const ob of obstacles) ob.dispose();
      for (const d of disposers) d();
      for (const gt of gates) {
        gt.glow.dispose();
        gt.pyl.dispose();
        gt.banner.dispose();
        gt.group.traverse((o) => o.isMesh && o.geometry.dispose());
      }
      for (const m of Object.values(mats)) {
        if (m === mats.boost) m.map.dispose();
        m.dispose();
      }
    },
  };
}
