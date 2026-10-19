/**
 * Vice Streets 3D — the city (deterministic, framework-free).
 *
 * One connected tropical city, about 720 × 690 m:
 *
 *            SUNSET HILLS  (winding roads climbing a ridge, mansions,
 *                           Sunset Point viewpoint, Sterling Estate)
 *   ───────────── hedge wall + gates (z ≈ −191) ──────────────────────
 *   LITTLE HAVEN  │  DOWNTOWN          │ OCEAN BEACH │ sand │ ocean
 *   houses, park, │  towers, plaza,    │ hotels,     │      │
 *   hospital,     │  police HQ,        │ café, shops │      │
 *   garage        │  dealership, taxis │             │      │
 *   ──────── fence + gates (z ≈ 100) ─┤             │      │
 *   INDUSTRIAL DOCKS  warehouses, containers, cranes, quay   │
 *   ───────────────────────────────── harbour water ──────────────────
 *
 *   CORAL KEY: an island east of Ocean Beach (x 412…718), its own 4 × 5
 *   street grid (columns ICOLS, the same rows as the mainland) joined to the
 *   beach road by two causeway bridges (z = 0 and z = 180). Casino, resort,
 *   marina, shops, gardens and villas. Island grid indices start at 100
 *   (gridNode(100 + i, j)), so every mainland index is unchanged.
 *
 * Streets are a grid (8 columns × 6 rows of intersections, 90 m apart) plus
 * curved hill roads built as chains of short segments. Everything a system
 * needs comes from here:
 *   nodes / edges          road graph (traffic, police, GPS)
 *   lights                 traffic-light timing per intersection
 *   buildings / solids     axis-aligned boxes for rendering and collision
 *   props                  palms, lamps, benches, containers … (render + solids)
 *   walks / crossings      pedestrian sidewalk loops and crosswalks
 *   parking                parked-car slots
 *   places                 named gameplay locations (garage, dealership …)
 *   gates                  district gates (closed while a district is locked)
 *   groundAt / districtAt / roadQuery
 */
import { clamp, rng, smoothstep, segClosest, headingOf } from "./util.js";

export const COLS = [-360, -270, -180, -90, 0, 90, 180, 270];
export const ROWS = [-180, -90, 0, 90, 180, 270];
export const ROAD_HALF = 6;
export const HILL_HALF = 5;
export const WALK_OFF = 8.2; // sidewalk walking line, from the road centre
export const LANE_OFF = 2.2; // traffic lane centre, right of the road centre
export const CURB = 0.12; // sidewalks / lots sit this much above the road
export const BOUNDS = { x0: -373, x1: 724, z0: -402, z1: 284 };
export const WATER = { east: 342, south: 283 };
/** Coral Key: island street columns, land rectangle and the bridge rows */
export const ICOLS = [430, 520, 610, 700];
export const ISLAND = { x0: 412, x1: 718, z0: -198, z1: 198 };
export const BRIDGES = [0, 180];
/** x of grid column i (mainland 0…7, island 100…103) */
export const colX = (i) => (i >= 100 ? ICOLS[i - 100] : COLS[i]);

export const DISTRICTS = {
  beach: { id: "beach", name: "Ocean Beach", color: "#ff8fb1" },
  downtown: { id: "downtown", name: "Downtown", color: "#7fb8ff" },
  haven: { id: "haven", name: "Little Haven", color: "#ffd166" },
  docks: { id: "docks", name: "Industrial Docks", color: "#9aa7b5" },
  hills: { id: "hills", name: "Sunset Hills", color: "#c79bff" },
  key: { id: "key", name: "Coral Key", color: "#5ce1e6" },
};

export function districtAt(x, z) {
  if (x > 380) return "key";
  if (z < -186) return "hills";
  if (x >= 180) return "beach";
  if (z > 90) return "docks";
  if (x < -90) return "haven";
  return "downtown";
}

/** terrain height: flat city, the hills climb north of the wall */
export function groundAt(x, z) {
  if (z > -192) return 0;
  const k = smoothstep(-192, -372, z);
  const bump = Math.sin(x / 37) * Math.sin(z / 29) * 2.4 * smoothstep(-200, -250, z);
  return 18 * k + bump;
}

/* ------------------------------------------------------------------ graph */
function buildGraph() {
  const nodes = [];
  const edges = [];
  const key = new Map();
  const addNode = (x, z, tag = {}) => {
    const n = { id: nodes.length, x, z, y: groundAt(x, z), edges: [], ...tag };
    nodes.push(n);
    return n;
  };
  const addEdge = (a, b, tag = {}) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const e = { id: edges.length, a: a.id, b: b.id, len, dx: dx / len, dz: dz / len, half: ROAD_HALF, kind: "grid", gate: null, ...tag };
    e.district = districtAt((a.x + b.x) / 2, (a.z + b.z) / 2);
    edges.push(e);
    a.edges.push(e.id);
    b.edges.push(e.id);
    return e;
  };
  // grid
  COLS.forEach((x, i) => ROWS.forEach((z, j) => key.set(`${i},${j}`, addNode(x, z, { gi: i, gj: j, grid: true }))));
  const G = (i, j) => key.get(`${i},${j}`);
  for (let j = 0; j < ROWS.length; j++) for (let i = 0; i < COLS.length - 1; i++) addEdge(G(i, j), G(i + 1, j), { axis: "ew" });
  for (let i = 0; i < COLS.length; i++) for (let j = 0; j < ROWS.length - 1; j++) addEdge(G(i, j), G(i, j + 1), { axis: "ns" });
  // hills: four climbing roads joined by Crest Drive (s = 90) and Ridge Road (s = 180)
  const CLIMBS = [
    { x0: -270, f: (s) => -270 + 15 * Math.sin(s / 31) },
    { x0: -90, f: (s) => -90 - 14 * Math.sin(s / 34) },
    { x0: 90, f: (s) => 90 + 15 * Math.sin(s / 29) },
    { x0: 270, f: (s) => 270 - 0.42 * s + 10 * Math.sin(s / 27) },
  ];
  const climbAt = [];
  CLIMBS.forEach((c, ci) => {
    let prev = G(COLS.indexOf(c.x0), 0);
    const pts = {};
    for (let s = 15; s <= 180; s += 15) {
      const n = addNode(c.f(s), -180 - s, { hill: true });
      const e = addEdge(prev, n, { kind: "hill", half: HILL_HALF, axis: "ns" });
      if (s === 15) e.gate = "hills";
      prev = n;
      pts[s] = n;
    }
    climbAt[ci] = pts;
  });
  const chain = (list, amp) => {
    for (let k = 0; k < list.length - 1; k++) {
      const A = list[k];
      const B = list[k + 1];
      let prev = A;
      const steps = Math.max(2, Math.round(Math.hypot(B.x - A.x, B.z - A.z) / 24));
      for (let q = 1; q < steps; q++) {
        const f = q / steps;
        const n = addNode(A.x + (B.x - A.x) * f, A.z + (B.z - A.z) * f + amp * Math.sin(Math.PI * 2 * f) * (k % 2 ? -1 : 1), { hill: true });
        addEdge(prev, n, { kind: "hill", half: HILL_HALF, axis: "ew" });
        prev = n;
      }
      addEdge(prev, B, { kind: "hill", half: HILL_HALF, axis: "ew" });
    }
  };
  chain(climbAt.map((p) => p[90]), 9);
  // Ridge Road runs from Sunset Point (a dead-end lookout) along the top
  const point = addNode(-338, -372, { hill: true, lookout: true });
  chain([point, ...climbAt.map((p) => p[180])], 7);
  // Coral Key grid and the two causeways from the beach road
  ICOLS.forEach((x, i) => ROWS.slice(0, 5).forEach((z, j) => key.set(`${100 + i},${j}`, addNode(x, z, { gi: 100 + i, gj: j, grid: true, island: true }))));
  for (let j = 0; j < 5; j++) for (let i = 0; i < ICOLS.length - 1; i++) addEdge(G(100 + i, j), G(101 + i, j), { axis: "ew" });
  for (let i = 0; i < ICOLS.length; i++) for (let j = 0; j < 4; j++) addEdge(G(100 + i, j), G(100 + i, j + 1), { axis: "ns" });
  for (const bz of BRIDGES) addEdge(G(COLS.indexOf(270), ROWS.indexOf(bz)), G(100, ROWS.indexOf(bz)), { axis: "ew", bridge: true });
  for (const n of nodes) n.y = groundAt(n.x, n.z);
  return { nodes, edges, G };
}

/* ------------------------------------------------------------------ lights */
/** Traffic light state for an approach: "green" | "yellow" | "red". */
export const LIGHT = { green: 13, yellow: 3, allRed: 1.5 };
export const LIGHT_CYCLE = 2 * (LIGHT.green + LIGHT.yellow + LIGHT.allRed);
export function lightState(node, axis, t) {
  if (!node.light) return "green";
  const c = (((t + node.light.offset) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  const half = LIGHT.green + LIGHT.yellow + LIGHT.allRed;
  const local = axis === "ns" ? c : (c + half) % LIGHT_CYCLE;
  if (local < LIGHT.green) return "green";
  if (local < LIGHT.green + LIGHT.yellow) return "yellow";
  return "red";
}
/** may a pedestrian cross a road running along `axis` at this node? */
export function walkSignal(node, roadAxis, t) {
  if (!node.light) return true;
  return lightState(node, roadAxis, t) === "red" && lightState(node, roadAxis === "ns" ? "ew" : "ns", t) === "green";
}

/* ------------------------------------------------------------------ city build */
let CITY = null;
export function getCity() {
  if (!CITY) CITY = buildCity();
  return CITY;
}

const PASTEL = ["#f7c6d0", "#bfe3e8", "#f9e1a8", "#c9e4c5", "#f4c7a1", "#d8c8f0", "#a8d8ea", "#ffd3b6", "#e3f0b5", "#f6b8c4"];
const TOWER = ["#d7dde6", "#c4d3e6", "#e6e1d6", "#bcc7d1", "#e9d8c4", "#cfe0dc", "#d9cfe4"];
const WAREHOUSE = ["#8a97a6", "#a07e62", "#6f8a8a", "#9b8f7a", "#7c8794", "#a3a39a"];
const CONTAINER = ["#c8483b", "#2f6fb5", "#e0a12b", "#2f8f5a", "#7a4ba0", "#d06a2b", "#3a9ab0"];

function buildCity() {
  const R = rng(20251018);
  const { nodes, edges, G } = buildGraph();
  const buildings = [];
  const solids = [];
  const props = [];
  const parking = [];
  const walks = [];
  const crossings = [];
  const zones = [];
  const places = {};
  const landmarks = [];
  let club = null;

  const solid = (x0, z0, x1, z1, y1, kind, extra = {}) => {
    const s = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0: groundAt((x0 + x1) / 2, (z0 + z1) / 2) - 1, y1, kind, ...extra };
    s.y1 = s.y0 + 1 + y1;
    solids.push(s);
    return s;
  };
  const building = (b) => {
    const rec = { color: R.pick(PASTEL), roof: "flat", stripes: false, ...b };
    rec.y = Math.min(groundAt(rec.x0, rec.z0), groundAt(rec.x1, rec.z1), groundAt(rec.x0, rec.z1), groundAt(rec.x1, rec.z0)) - 0.4;
    rec.cx = (rec.x0 + rec.x1) / 2;
    rec.cz = (rec.z0 + rec.z1) / 2;
    buildings.push(rec);
    rec.solid = solid(rec.x0, rec.z0, rec.x1, rec.z1, rec.h + 0.4, "building", { b: buildings.length - 1 });
    return rec;
  };
  const prop = (type, x, z, extra = {}) => {
    const p = { type, x, z, y: groundAt(x, z) + CURB, rot: 0, ...extra };
    props.push(p);
    let s = null;
    if (type === "picket" || type === "barrier") {
      // a run along x (rot 0) or along z (rot π/2)
      const half = (p.len || 1.6) / 2;
      const alongX = Math.abs(Math.sin(p.rot)) < 0.5;
      s = alongX ? solid(x - half, z - 0.12, x + half, z + 0.12, 1.1, "pole") : solid(x - 0.12, z - half, x + 0.12, z + half, 1.1, "pole");
    } else {
      const r = { palm: 0.35, lamp: 0.18, tree: 0.45, bench: 0, hydrant: 0.2, signal: 0.2, bin: 0.3, sign: 0.1 }[type];
      if (r) s = solid(x - r, z - r, x + r, z + r, type === "palm" ? 9 : BREAKABLE[type] ? BREAKABLE[type].h : 4, "pole");
    }
    if (s && BREAKABLE[type]) {
      p.id = props.length - 1;
      p.solid = s;
      s.prop = p;
    }
    return p;
  };
  const block = (i, j) => ({ x0: colX(i) + 10, x1: colX(i + 1) - 10, z0: ROWS[j] + 10, z1: ROWS[j + 1] - 10, cx: (colX(i) + colX(i + 1)) / 2, cz: (ROWS[j] + ROWS[j + 1]) / 2 });
  /** a point on a block's sidewalk walking line: side N/S/E/W, t 0..1 along it */
  const walkPt = (i, j, side, t) => {
    const b = block(i, j);
    const x = side === "W" ? colX(i) + WALK_OFF : side === "E" ? colX(i + 1) - WALK_OFF : b.x0 + (b.x1 - b.x0) * t;
    const z = side === "N" ? ROWS[j] + WALK_OFF : side === "S" ? ROWS[j + 1] - WALK_OFF : b.z0 + (b.z1 - b.z0) * t;
    return { x, z };
  };
  /** a kerbside stopping point on the road next to a block side (for pick-ups, parking) */
  const curbPt = (i, j, side, t) => {
    const p = walkPt(i, j, side, t);
    if (side === "N") p.z = ROWS[j] + 4.6;
    if (side === "S") p.z = ROWS[j + 1] - 4.6;
    if (side === "W") p.x = colX(i) + 4.6;
    if (side === "E") p.x = colX(i + 1) - 4.6;
    // heading = traffic direction on that kerb (right-hand traffic)
    const h = side === "N" ? headingOf(1, 0) : side === "S" ? headingOf(-1, 0) : side === "W" ? headingOf(0, -1) : headingOf(0, 1);
    return { x: p.x, z: p.z, h };
  };
  const place = (id, def) => {
    places[id] = { id, y: groundAt(def.x, def.z), district: districtAt(def.x, def.z), ...def };
    return places[id];
  };

  /* ---------------- street furniture along every grid sidewalk ---------------- */
  for (let i = 0; i < COLS.length - 1; i++) {
    for (let j = 0; j < ROWS.length - 1; j++) {
      const d = districtAt((COLS[i] + COLS[i + 1]) / 2, (ROWS[j] + ROWS[j + 1]) / 2);
      // walking loop (clockwise seen from above: N edge west→east …)
      const x0 = COLS[i] + WALK_OFF;
      const x1 = COLS[i + 1] - WALK_OFF;
      const z0 = ROWS[j] + WALK_OFF;
      const z1 = ROWS[j + 1] - WALK_OFF;
      walks.push({ id: walks.length, i, j, district: d, pts: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] });
      // lamps + palms near the kerb, every ~22 m
      for (const side of ["N", "S", "W", "E"]) {
        for (let t = 0.08; t < 0.95; t += 0.28) {
          const p = walkPt(i, j, side, t);
          const ox = side === "W" ? -1.6 : side === "E" ? 1.6 : 0;
          const oz = side === "N" ? -1.6 : side === "S" ? 1.6 : 0;
          const facing = side === "N" ? Math.PI : side === "S" ? 0 : side === "W" ? -Math.PI / 2 : Math.PI / 2;
          const nearCorner = t < 0.1 || t > 0.9;
          if (Math.abs(t - 0.64) < 0.01) {
            // mid-block kerb furniture: a road sign on N/S sides, a trash can on E/W sides
            const q = walkPt(i, j, side, 0.5);
            const kx = side === "W" ? -1.1 : side === "E" ? 1.1 : 0;
            const kz = side === "N" ? -1.1 : side === "S" ? 1.1 : 0;
            if (side === "N" || side === "S") prop("sign", q.x + kx, q.z + kz, { rot: facing, kind: (i + j) % 3 });
            else prop("bin", q.x + kx, q.z + kz, { rot: facing });
          }
          if (nearCorner) prop("lamp", p.x + ox, p.z + oz, { rot: facing });
          else if (d === "beach" || d === "downtown" || (d === "haven" && R() < 0.6)) prop("palm", p.x + ox, p.z + oz, { s: R.range(0.85, 1.2), lean: R.range(-0.12, 0.12) });
          else if (d === "docks" && R() < 0.4) prop("lamp", p.x + ox, p.z + oz, { rot: facing });
        }
      }
    }
  }
  // crosswalks at every lit intersection: one per arm, between the sidewalk corners
  for (const n of nodes) {
    if (!n.grid) continue;
    const deg = n.edges.length;
    if (deg >= 3) n.light = { offset: ((n.gi * 7 + n.gj * 11) % 6) * 4.5 };
    if (n.light) {
      // a signal pole on the right-hand kerb of every approach
      for (const eid of n.edges) {
        const e = edges[eid];
        if (e.kind !== "grid") continue;
        const o = n.id === e.a ? 1 : -1;
        const ax = e.dx * o;
        const az = e.dz * o;
        prop("signal", n.x + ax * 10.6 + az * 6.6, n.z + az * 10.6 - ax * 6.6, { face: Math.atan2(ax, az), node: n.id, axis: e.axis });
      }
    }
    for (const eid of n.edges) {
      const e = edges[eid];
      if (e.kind !== "grid" || (e.bridge && n.island)) continue;
      const o = n.id === e.a ? 1 : -1;
      const ax = e.dx * o;
      const az = e.dz * o;
      // crosswalk centre 8.2 m along the arm, spanning the road across
      const cx = n.x + ax * WALK_OFF;
      const cz = n.z + az * WALK_OFF;
      crossings.push({ node: n.id, edge: eid, axis: e.axis, x: cx, z: cz, ax: -az, az: ax, a: { x: cx - az * WALK_OFF, z: cz + ax * WALK_OFF }, b: { x: cx + az * WALK_OFF, z: cz - ax * WALK_OFF } });
    }
  }

  /* ---------------- districts ---------------- */
  const SPECIAL = {
    "4,1": "plaza",
    "3,0": "police",
    "5,2": "dealer",
    "4,0": "taxi",
    "4,2": "parkinglot",
    "5,1": "vane",
    "1,1": "park",
    "2,2": "garage",
    "0,0": "hospital",
    "1,2": "market",
    "6,0": "flamingo",
    "6,1": "cafe",
    "6,2": "coral",
    "6,3": "post",
    "6,4": "marina",
    "2,4": "pier9",
    "4,4": "secure",
    "5,3": "truckdepot",
    "0,3": "yard",
  };
  for (let i = 0; i < COLS.length - 1; i++) {
    for (let j = 0; j < ROWS.length - 1; j++) {
      const b = block(i, j);
      const d = districtAt(b.cx, b.cz);
      const sp = SPECIAL[`${i},${j}`];
      if (sp) buildSpecial(sp, i, j, b, d);
      else if (d === "downtown") downtownBlock(b);
      else if (d === "haven") havenBlock(b);
      else if (d === "beach") beachBlock(b);
      else if (d === "docks") docksBlock(b, i, j);
    }
  }

  function downtownBlock(b) {
    const v = R.int(0, 2);
    const tall = () => R.range(34, 86);
    if (v === 0) {
      for (const [ax, az] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x0 = b.x0 + 1 + ax * 37;
        const z0 = b.z0 + 1 + az * 37;
        building({ x0, z0, x1: x0 + 31, z1: z0 + 31, h: tall(), style: "tower", color: R.pick(TOWER), district: "downtown" });
      }
    } else if (v === 1) {
      building({ x0: b.x0 + 8, z0: b.z0 + 8, x1: b.x1 - 8, z1: b.z1 - 8, h: R.range(60, 105), style: "tower", color: R.pick(TOWER), district: "downtown", crown: true });
      for (const [x, z] of [[b.x0 + 3, b.z0 + 3], [b.x1 - 3, b.z1 - 3], [b.x0 + 3, b.z1 - 3], [b.x1 - 3, b.z0 + 3]]) prop("tree", x, z);
    } else {
      building({ x0: b.x0 + 1, z0: b.z0 + 1, x1: b.x0 + 36, z1: b.z1 - 1, h: tall(), style: "tower", color: R.pick(TOWER), district: "downtown" });
      building({ x0: b.x0 + 42, z0: b.z0 + 1, x1: b.x1 - 1, z1: b.z0 + 30, h: R.range(14, 24), style: "shop", color: R.pick(PASTEL), district: "downtown", sign: R.int(0, 9) });
      building({ x0: b.x0 + 42, z0: b.z0 + 38, x1: b.x1 - 1, z1: b.z1 - 1, h: R.range(18, 40), style: "tower", color: R.pick(TOWER), district: "downtown" });
    }
  }
  function house(x0, z0, w, d, district = "haven", extra = {}) {
    return building({ x0, z0, x1: x0 + w, z1: z0 + d, h: R.pick([5.5, 6, 8.5, 9]), style: "house", roof: R() < 0.6 ? "pitched" : "flat", color: R.pick(PASTEL), district, ...extra });
  }
  function havenBlock(b) {
    // 3 × 3 lots; the middle lot is a shared yard
    const lw = (b.x1 - b.x0) / 3;
    for (let a = 0; a < 3; a++) {
      for (let c = 0; c < 3; c++) {
        const lx = b.x0 + a * lw;
        const lz = b.z0 + c * lw;
        if (a === 1 && c === 1) {
          prop("tree", lx + lw / 2, lz + lw / 2);
          continue;
        }
        const w = R.range(11, 14);
        const dd = R.range(9, 12);
        // push the house toward the street it faces
        const fx = a === 0 ? 1.5 : a === 2 ? lw - w - 1.5 : (lw - w) / 2;
        const fz = c === 0 ? 1.5 : c === 2 ? lw - dd - 1.5 : (lw - dd) / 2;
        house(lx + fx, lz + fz, w, dd);
        if (R() < 0.5) prop("tree", lx + (a === 2 ? 3 : lw - 3), lz + (c === 2 ? 3 : lw - 3));
      }
    }
  }
  function beachBlock(b) {
    building({ x0: b.x0 + 2, z0: b.z0 + 4, x1: b.x0 + 30, z1: b.z1 - 4, h: R.range(22, 40), style: "hotel", color: R.pick(PASTEL), district: "beach", stripes: true, sign: R.int(0, 9) });
    building({ x0: b.x0 + 40, z0: b.z0 + 4, x1: b.x1 - 3, z1: b.z0 + 26, h: 7, style: "shop", color: R.pick(PASTEL), district: "beach", sign: R.int(0, 9), awning: true });
    building({ x0: b.x0 + 40, z0: b.z1 - 26, x1: b.x1 - 3, z1: b.z1 - 4, h: 8, style: "shop", color: R.pick(PASTEL), district: "beach", sign: R.int(0, 9), awning: true });
    for (let t = 0.2; t < 0.9; t += 0.3) prop("palm", b.x0 + 35, b.z0 + (b.z1 - b.z0) * t, { s: 1.1 });
  }
  function containers(x0, z0, cols, rows, levels) {
    for (let a = 0; a < cols; a++) {
      for (let c = 0; c < rows; c++) {
        const x = x0 + a * 13.4;
        const z = z0 + c * 3.0;
        const lv = R.int(1, levels);
        const stack = [];
        for (let l = 0; l < lv; l++) stack.push(R.pick(CONTAINER));
        props.push({ type: "container", x: x + 6.1, z: z + 1.25, y: CURB, colors: stack, rot: 0 });
        solid(x, z, x + 12.2, z + 2.5, lv * 2.6, "container");
      }
    }
  }
  function docksBlock(b, i, j) {
    if ((i + j) % 2 === 0) {
      building({ x0: b.x0 + 2, z0: b.z0 + 3, x1: b.x1 - 2, z1: b.z0 + 31, h: R.range(10, 14), style: "warehouse", color: R.pick(WAREHOUSE), district: "docks" });
      containers(b.x0 + 4, b.z0 + 42, 4, 3, 3);
    } else {
      containers(b.x0 + 4, b.z0 + 4, 4, 3, 3);
      building({ x0: b.x0 + 2, z0: b.z1 - 30, x1: b.x1 - 2, z1: b.z1 - 3, h: R.range(10, 14), style: "warehouse", color: R.pick(WAREHOUSE), district: "docks" });
    }
  }

  function buildSpecial(kind, i, j, b, d) {
    switch (kind) {
      case "plaza": {
        landmarks.push({ id: "plaza", name: "Liberty Plaza", x: b.cx, z: b.cz, r: 30 });
        props.push({ type: "fountain", x: b.cx, z: b.cz, y: CURB });
        solid(b.cx - 5, b.cz - 5, b.cx + 5, b.cz + 5, 1.2, "fountain");
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          prop("palm", b.cx + Math.cos(ang) * 22, b.cz + Math.sin(ang) * 22, { s: 1.15 });
          props.push({ type: "bench", x: b.cx + Math.cos(ang + 0.39) * 14, z: b.cz + Math.sin(ang + 0.39) * 14, y: CURB, rot: -ang - Math.PI / 2 + 0.39 });
        }
        zones.push({ kind: "plaza", x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
        break;
      }
      case "police": {
        const bd = building({ x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x1 - 2, z1: b.z0 + 34, h: 16, style: "police", color: "#e8edf2", district: d, name: "Downtown Police HQ" });
        bd.door = "S";
        for (let a = 0; a < 5; a++) parking.push({ x: b.x0 + 8 + a * 12, z: b.z0 + 52, h: Math.PI, lot: "police", police: true });
        place("police", { name: "Downtown Police Station", x: bd.cx, z: bd.z1 + 4, icon: "police", h: 0 });
        zones.push({ kind: "policeLot", x0: b.x0, z0: b.z0 + 36, x1: b.x1, z1: b.z1 });
        break;
      }
      case "dealer": {
        const bd = building({ x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x1 - 2, z1: b.z0 + 26, h: 11, style: "showroom", color: "#ffffff", district: d, name: "Sunrise Motors" });
        bd.door = "S";
        place("dealer", { name: "Sunrise Motors", x: bd.cx, z: bd.z1 + 4, icon: "dealer", h: 0 });
        place("dealerSpawn", { name: "Sunrise Motors lot", x: b.cx + 8, z: b.z1 - 10, h: Math.PI / 2 });
        for (let a = 0; a < 4; a++) parking.push({ x: b.x0 + 10 + a * 14, z: b.z0 + 40, h: 0, lot: "dealer", display: true });
        break;
      }
      case "taxi": {
        const bd = building({ x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x0 + 40, z1: b.z1 - 2, h: R.range(40, 70), style: "tower", color: R.pick(TOWER), district: d });
        void bd;
        building({ x0: b.x0 + 46, z0: b.z0 + 2, x1: b.x1 - 2, z1: b.z0 + 22, h: 7, style: "depot", color: "#f6c945", district: d, name: "Metro Cab Co." });
        place("taxiDepot", { name: "Metro Cab Depot", x: b.x0 + 57, z: b.z0 + 30, icon: "taxi", h: 0 });
        for (let a = 0; a < 3; a++) parking.push({ x: b.x0 + 49 + a * 8, z: b.z0 + 45, h: 0, lot: "taxi", kind: "taxi" });
        break;
      }
      case "parkinglot": {
        building({ x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x1 - 2, z1: b.z0 + 24, h: R.range(30, 55), style: "tower", color: R.pick(TOWER), district: d });
        // two rows of bays facing the aisle between them
        for (let a = 0; a < 7; a++) for (let c = 0; c < 2; c++) parking.push({ x: b.x0 + 6 + a * 9.5, z: b.z0 + 36 + c * 18, h: c ? 0 : Math.PI, lot: "public", bay: true });
        place("parkingLot", { name: "Bayfront Parking", x: b.cx, z: b.z0 + 45, icon: "parking", h: 0, rect: { x0: b.x0, z0: b.z0 + 28, x1: b.x1, z1: b.z1 } });
        break;
      }
      case "vane": {
        const bd = building({ x0: b.x0 + 10, z0: b.z0 + 10, x1: b.x1 - 10, z1: b.z1 - 10, h: 128, style: "tower", color: "#bcd3e6", district: d, crown: true, name: "Vane Tower" });
        bd.door = "W";
        landmarks.push({ id: "vane", name: "Vane Tower", x: bd.cx, z: bd.cz, r: 45 });
        place("vaneLobby", { name: "Vane Tower lobby", x: bd.x0 - 4, z: bd.cz, icon: "contact", h: -Math.PI / 2 });
        for (const [x, z] of [[b.x0 + 4, b.z0 + 4], [b.x1 - 4, b.z1 - 4], [b.x0 + 4, b.z1 - 4], [b.x1 - 4, b.z0 + 4]]) prop("palm", x, z, { s: 1.2 });
        break;
      }
      case "park": {
        landmarks.push({ id: "park", name: "Haven Park", x: b.cx, z: b.cz, r: 30 });
        zones.push({ kind: "park", x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
        for (let a = 0; a < 14; a++) prop("tree", R.range(b.x0 + 4, b.x1 - 4), R.range(b.z0 + 4, b.z0 + 26));
        props.push({ type: "court", x: b.cx, z: b.z1 - 20, y: CURB });
        for (let a = 0; a < 6; a++) props.push({ type: "bench", x: b.x0 + 8 + a * 11, z: b.cz + 2, y: CURB, rot: 0, seat: true });
        // white picket fence round the park, with gaps for the paths
        for (let x = b.x0 + 1; x + 3.5 <= b.x1 - 1; x += 3.6) {
          if (Math.abs(x + 1.75 - b.cx) < 5) continue;
          prop("picket", x + 1.75, b.z0 + 0.8, { len: 3.5, rot: 0 });
          prop("picket", x + 1.75, b.z1 - 0.8, { len: 3.5, rot: 0 });
        }
        for (let z = b.z0 + 2; z + 3.5 <= b.z1 - 2; z += 3.6) {
          if (Math.abs(z + 1.75 - b.cz) < 5) continue;
          prop("picket", b.x0 + 0.8, z + 1.75, { len: 3.5, rot: Math.PI / 2 });
          prop("picket", b.x1 - 0.8, z + 1.75, { len: 3.5, rot: Math.PI / 2 });
        }
        break;
      }
      case "garage": {
        // workshop set back from the street behind an open forecourt with the service bay
        const bd = building({ x0: b.x1 - 50, z0: b.z0 + 4, x1: b.x1 - 20, z1: b.z0 + 30, h: 8, style: "garage", color: "#e8a04a", district: d, name: "Tío Ramón's Garage" });
        bd.door = "E";
        const bz = b.z0 + 17;
        place("garage", { name: "Tío Ramón's Garage", x: b.x1 - 15, z: b.z0 + 6, icon: "garage", h: Math.PI / 2 });
        place("garageBay", { name: "Service bay", x: b.x1 - 15.5, z: bz, h: -Math.PI / 2, rect: { x0: b.x1 - 20, z0: bz - 3.6, x1: b.x1 - 11, z1: bz + 3.6 } });
        place("garageSpawn", { name: "Garage lot", x: b.x1 - 12, z: b.z0 + 44, h: 0 });
        props.push({ type: "bayMark", x: b.x1 - 15.5, z: bz, y: CURB, rot: -Math.PI / 2 });
        house(b.x0 + 2, b.z0 + 2, 16, 14);
        house(b.x0 + 2, b.z1 - 16, 16, 14);
        house(b.x0 + 24, b.z1 - 16, 18, 14);
        for (let a = 0; a < 3; a++) parking.push({ x: b.x1 - 22, z: b.z0 + 52 + a * 7, h: Math.PI / 2, lot: "garage", owned: true });
        zones.push({ kind: "hideout", name: "Garage", x0: b.x1 - 21, z0: b.z0 + 3, x1: b.x1 + 2, z1: b.z0 + 31 });
        break;
      }
      case "hospital": {
        const bd = building({ x0: b.x0 + 4, z0: b.z0 + 4, x1: b.x1 - 4, z1: b.z0 + 40, h: 24, style: "hospital", color: "#f3f6f8", district: d, name: "St. Marisol Hospital" });
        bd.door = "S";
        place("hospital", { name: "St. Marisol Hospital", x: bd.cx, z: bd.z1 + 5, icon: "hospital", h: 0 });
        for (let a = 0; a < 4; a++) parking.push({ x: b.x0 + 10 + a * 14, z: b.z1 - 12, h: Math.PI, lot: "hospital" });
        break;
      }
      case "market": {
        const names = ["Bodega Luz", "Haven Hardware", "Mango Bakery", "Paz Pharmacy"];
        for (let a = 0; a < 4; a++) building({ x0: b.x0 + 1 + a * 17.5, z0: b.z0 + 1, x1: b.x0 + 16 + a * 17.5, z1: b.z0 + 14, h: R.range(6, 9), style: "shop", color: R.pick(PASTEL), district: d, sign: a, awning: true, name: names[a] });
        for (let a = 0; a < 4; a++) building({ x0: b.x0 + 1 + a * 17.5, z0: b.z1 - 14, x1: b.x0 + 16 + a * 17.5, z1: b.z1 - 1, h: R.range(6, 9), style: "shop", color: R.pick(PASTEL), district: d, sign: a + 4, awning: true });
        for (let a = 0; a < 3; a++) {
          const q = walkPt(i, j, "S", 0.62 + a * 0.04);
          prop("barrier", q.x, q.z + 1.1, { len: 1.6, rot: 0 });
        }
        place("market", { name: "Bodega Luz", x: b.x0 + 8.5, z: b.z0 - 3.5 + 0.2, icon: "shop", h: Math.PI });
        for (let a = 0; a < 3; a++) props.push({ type: "bench", x: b.x0 + 18 + a * 16, z: b.cz, y: CURB, rot: 0, seat: true });
        break;
      }
      case "flamingo": {
        const bd = building({ x0: b.x0 + 2, z0: b.z0 + 4, x1: b.x1 - 14, z1: b.z1 - 4, h: 46, style: "hotel", color: "#ff9fb8", district: d, stripes: true, name: "Flamingo Grand", neon: "#ff4fa0" });
        bd.door = "E";
        landmarks.push({ id: "flamingo", name: "Flamingo Grand Hotel", x: bd.cx, z: bd.cz, r: 40 });
        place("flamingo", { name: "Flamingo Grand", x: b.x1 + 0.5, z: b.cz, icon: "contact", h: Math.PI / 2 });
        break;
      }
      case "cafe": {
        const cafe = building({ x0: b.x1 - 26, z0: b.z0 + 4, x1: b.x1 - 3, z1: b.z0 + 24, h: 6.5, style: "shop", color: "#7fd6c2", district: d, awning: true, name: "Rosa's Café", sign: 2, neon: "#3fffd8" });
        cafe.door = "E";
        place("cafe", { name: "Rosa's Café", x: b.x1 + 0.6, z: b.z0 + 14, icon: "food", h: Math.PI / 2 });
        const cl = building({ x0: b.x1 - 26, z0: b.z1 - 24, x1: b.x1 - 3, z1: b.z1 - 4, h: 7, style: "shop", color: "#f7c6e0", district: d, awning: true, name: "Tide & Thread", sign: 5, neon: "#ff7ad9" });
        cl.door = "E";
        place("clothes", { name: "Tide & Thread", x: b.x1 + 0.6, z: b.z1 - 14, icon: "clothes", h: Math.PI / 2 });
        building({ x0: b.x0 + 2, z0: b.z0 + 4, x1: b.x0 + 30, z1: b.z1 - 4, h: 30, style: "hotel", color: "#bfe3e8", district: d, stripes: true, sign: 1 });
        for (let a = 0; a < 3; a++) parking.push({ x: b.x0 + 38 + a * 0, z: b.z0 + 32 + a * 6, h: Math.PI / 2, lot: "cafe" });
        break;
      }
      case "coral": {
        const bd = building({ x0: b.x0 + 2, z0: b.z0 + 4, x1: b.x1 - 14, z1: b.z1 - 4, h: 34, style: "hotel", color: "#a8e6cf", district: d, stripes: true, name: "Coral Palms Hotel", neon: "#40e0ff" });
        bd.door = "E";
        break;
      }
      case "post": {
        const bd = building({ x0: b.x0 + 2, z0: b.z0 + 4, x1: b.x0 + 36, z1: b.z0 + 30, h: 9, style: "depot", color: "#ffd166", district: d, name: "Sunny Post" });
        bd.door = "N";
        place("postDepot", { name: "Sunny Post Depot", x: bd.cx, z: bd.z0 - 3.6, icon: "delivery", h: 0 });
        building({ x0: b.x0 + 2, z0: b.z1 - 28, x1: b.x0 + 32, z1: b.z1 - 4, h: 22, style: "hotel", color: R.pick(PASTEL), district: d, stripes: true });
        building({ x0: b.x0 + 44, z0: b.z1 - 24, x1: b.x1 - 3, z1: b.z1 - 4, h: 7, style: "shop", color: R.pick(PASTEL), district: d, awning: true, sign: 7 });
        for (let a = 0; a < 2; a++) parking.push({ x: b.x0 + 50 + a * 8, z: b.z0 + 12, h: 0, lot: "post", kind: "van" });
        break;
      }
      case "marina": {
        landmarks.push({ id: "marina", name: "Marina Point Lighthouse", x: b.x1 - 12, z: b.z1 - 12, r: 25 });
        props.push({ type: "lighthouse", x: b.x1 - 12, z: b.z1 - 12, y: CURB });
        solid(b.x1 - 16, b.z1 - 16, b.x1 - 8, b.z1 - 8, 24, "lighthouse");
        building({ x0: b.x0 + 2, z0: b.z0 + 4, x1: b.x0 + 34, z1: b.z0 + 34, h: 12, style: "shop", color: "#c9e4f5", district: d, awning: true, sign: 3, name: "Marina Grill", neon: "#ffb347" });
        for (let a = 0; a < 6; a++) prop("palm", b.x0 + 44 + (a % 2) * 10, b.z0 + 10 + Math.floor(a / 2) * 16);
        break;
      }
      case "pier9": {
        const bd = building({ x0: b.x0 + 4, z0: b.z0 + 8, x1: b.x1 - 4, z1: b.z0 + 44, h: 14, style: "warehouse", color: "#b0563f", district: d, name: "Pier 9 Warehouse" });
        bd.door = "S";
        place("pier9", { name: "Pier 9 Warehouse", x: bd.cx, z: bd.z1 + 4, icon: "contact", h: 0 });
        containers(b.x0 + 4, b.z1 - 16, 4, 2, 2);
        break;
      }
      case "secure": {
        // fenced customs yard: restricted (wanted) unless a mission allows it
        const f = 0.4;
        solid(b.x0, b.z0, b.x1, b.z0 + f, 3, "fence");
        solid(b.x0, b.z1 - f, b.x1, b.z1, 3, "fence");
        solid(b.x0, b.z0, b.x0 + f, b.z1, 3, "fence");
        solid(b.x1 - f, b.z0, b.x1, b.z0 + 24, 3, "fence");
        solid(b.x1 - f, b.z0 + 38, b.x1, b.z1, 3, "fence");
        props.push({ type: "fenceRun", x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, gap: { side: "E", a: b.z0 + 24, b: b.z0 + 38 } });
        containers(b.x0 + 6, b.z0 + 6, 3, 4, 3);
        building({ x0: b.x0 + 6, z0: b.z1 - 26, x1: b.x0 + 40, z1: b.z1 - 6, h: 10, style: "warehouse", color: "#5c6a78", district: d, name: "Customs Store" });
        zones.push({ kind: "restricted", name: "Customs Yard", x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
        place("customs", { name: "Customs Yard", x: b.x1 - 10, z: b.z0 + 31, icon: "restricted", h: Math.PI / 2 });
        break;
      }
      case "truckdepot": {
        building({ x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x0 + 30, z1: b.z0 + 20, h: 8, style: "depot", color: "#9aa7b5", district: d, name: "Harbor Freight" });
        place("truckDepot", { name: "Harbor Freight Depot", x: b.x0 + 45, z: b.z0 + 30, icon: "delivery", h: 0 });
        for (let a = 0; a < 3; a++) parking.push({ x: b.x0 + 40 + a * 9, z: b.z0 + 48, h: 0, lot: "depot", kind: "van" });
        containers(b.x0 + 4, b.z1 - 12, 2, 2, 2);
        break;
      }
      case "yard": {
        containers(b.x0 + 4, b.z0 + 4, 5, 5, 4);
        props.push({ type: "crane", x: b.cx, z: b.z1 - 8, y: CURB });
        solid(b.cx - 7, b.z1 - 10, b.cx - 5, b.z1 - 6, 30, "crane");
        solid(b.cx + 5, b.z1 - 10, b.cx + 7, b.z1 - 6, 30, "crane");
        landmarks.push({ id: "crane", name: "Big Bertha Crane", x: b.cx, z: b.z1 - 8, r: 25 });
        break;
      }
      default:
    }
  }

  /* ---------------- quay cranes, beach, hills ---------------- */
  for (let x = -330; x < 170; x += 95) {
    props.push({ type: "crane", x, z: 288, y: 0, quay: true });
  }
  // beach promenade + sand
  for (let z = -175; z < 280; z += 18) {
    prop("palm", 283.5, z + R.range(-3, 3), { s: R.range(0.9, 1.25), lean: R.range(-0.2, 0.2) });
    if (R() < 0.35) props.push({ type: "umbrella", x: R.range(300, 330), z: z + R.range(-6, 6), y: 0.05, color: R.pick(["#ff6b6b", "#ffd93d", "#4ecdc4", "#ff9ff3", "#54a0ff"]) });
  }
  for (let z = -160; z < 270; z += 60) props.push({ type: "bench", x: 280, z: z + 9, y: CURB, rot: -Math.PI / 2, seat: true });
  // the causeways cross the promenade and the sand: nothing stands in their way
  for (let k = props.length - 1; k >= 0; k--) {
    const p = props[k];
    if (p.x > 262 && p.x < 345 && BRIDGES.some((bz) => Math.abs(p.z - bz) < ROAD_HALF + 3.5) && !p.solid) props.splice(k, 1);
  }
  for (let k = solids.length - 1; k >= 0; k--) {
    const o = solids[k];
    if (o.kind === "pole" && !o.prop && o.x0 > 274 && o.x1 < 345 && BRIDGES.some((bz) => o.z1 > bz - ROAD_HALF - 2 && o.z0 < bz + ROAD_HALF + 2)) solids.splice(k, 1);
  }
  walks.push({ id: walks.length, promenade: true, district: "beach", pts: [{ x: 281, z: -176 }, { x: 281, z: 268 }], line: true });
  landmarks.push({ id: "beach", name: "Ocean Beach", x: 315, z: 40, r: 40 });
  zones.push({ kind: "beach", x0: 286, z0: -190, x1: WATER.east, z1: WATER.south });

  // benches are solid (people and cars go round them, nobody walks through a
  // seat): three small boxes along the bench so angled benches fit too
  for (const b of props) {
    if (b.type !== "bench" || b.solids) continue;
    const ax = Math.cos(b.rot || 0);
    const az = -Math.sin(b.rot || 0);
    b.solids = [-0.6, 0, 0.6].map((u) => solid(b.x + ax * u - 0.24, b.z + az * u - 0.24, b.x + ax * u + 0.24, b.z + az * u + 0.24, 0.9, "pole", { bench: true }));
  }

  // hills: the estate, the safehouse garage and the lookout first, then mansions where nothing else is
  const nearRoad = (x, z, r) => edges.some((e) => {
    const A = nodes[e.a];
    const B = nodes[e.b];
    return segClosest(x, z, A.x, A.z, B.x, B.z).d2 < r * r;
  });
  const reserved = [];
  {
    // Sterling Estate: on the ridge, south of Ridge Road, facing it
    const top = nodes.filter((n) => n.hill && n.z < -350).sort((a, b) => b.x - a.x)[1];
    const sx = top.x - 46;
    const rq = (x) => nodes.filter((n) => n.hill && n.z < -345).reduce((b, n) => (Math.abs(n.x - x) < Math.abs(b.x - x) ? n : b));
    const roadZ = rq(sx).z;
    const sz = roadZ + 24;
    const est = building({ x0: sx - 15, z0: sz - 2, x1: sx + 15, z1: sz + 16, h: 12, style: "mansion", roof: "flat", color: "#fff8e8", district: "hills", name: "Sterling Estate" });
    est.door = "N";
    reserved.push({ x0: sx - 34, z0: sz - 16, x1: sx + 40, z1: sz + 30 });
    place("estate", { name: "Sterling Estate", x: sx, z: sz - 5, icon: "contact", h: Math.PI });
    place("estateGarage", { name: "Sterling Estate garage", x: sx + 24, z: sz + 2, h: 0, rect: { x0: sx + 20.5, z0: sz - 2, x1: sx + 27.5, z1: sz + 6.5 } });
    place("estateGarageOut", { name: "Estate drive", x: sx - 24, z: sz + 1, h: Math.PI });
    props.push({ type: "bayMark", x: sx + 24, z: sz + 2, y: groundAt(sx + 24, sz + 2) + CURB, rot: 0 });
    props.push({ type: "pool", x: sx, z: sz + 23, y: groundAt(sx, sz + 23) });
    for (const dx of [-18, 18]) prop("palm", sx + dx, sz - 6, { s: 1.25 });
    landmarks.push({ id: "estate", name: "Sterling Estate", x: sx, z: sz + 6, r: 30 });
  }
  {
    const look = nodes.find((n) => n.lookout);
    landmarks.push({ id: "lookout", name: "Sunset Point", x: look.x, z: look.z, r: 18 });
    place("lookout", { name: "Sunset Point", x: look.x + 4, z: look.z + 7, icon: "view", h: 0 });
    props.push({ type: "railing", x: look.x - 8, z: look.z, y: look.y });
    reserved.push({ x0: look.x - 30, z0: look.z - 30, x1: look.x + 30, z1: look.z + 30 });
  }
  {
    // a safehouse garage on Crest Drive
    const crest = nodes.filter((n) => n.hill && Math.abs(n.z + 270) < 16 && n.x > -60 && n.x < 60).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
    const gx = crest.x;
    const gz = crest.z + 16;
    const bd = building({ x0: gx - 10, z0: gz, x1: gx + 10, z1: gz + 12, h: 6, style: "garage", color: "#d9b38c", district: "hills", name: "Hillside Garage" });
    bd.door = "N";
    place("hillGarage", { name: "Hillside Garage", x: gx + 7, z: gz - 3, icon: "garage", h: Math.PI });
    zones.push({ kind: "hideout", name: "Hillside Garage", x0: gx - 10, z0: gz - 7, x1: gx + 10, z1: gz });
    reserved.push({ x0: gx - 22, z0: gz - 10, x1: gx + 22, z1: gz + 24 });
  }
  for (let z = -372; z < -205; z += 34) {
    for (let x = -350; x < 290; x += 36) {
      const cx = x + R.range(-6, 6);
      const cz = z + R.range(-5, 5);
      if (nearRoad(cx, cz, 22) || cx > 280) continue;
      const w = R.range(16, 22);
      const dd = R.range(12, 16);
      if (reserved.some((q) => cx + w / 2 + 4 > q.x0 && cx - w / 2 - 4 < q.x1 && cz + dd / 2 + 12 > q.z0 && cz - dd / 2 - 4 < q.z1)) continue;
      house(cx - w / 2, cz - dd / 2, w, dd, "hills", { style: "mansion", h: R.range(7, 11), roof: R() < 0.5 ? "pitched" : "flat", color: R.pick(["#f5efe3", "#fbe3d0", "#e7f3f0", "#f6e7f3", "#fff4d6"]) });
      props.push({ type: "pool", x: cx, z: cz + dd / 2 + 6, y: groundAt(cx, cz + dd / 2 + 6) });
      if (R() < 0.7) prop("palm", cx + w / 2 + 3, cz, { s: 1.1 });
    }
  }

  /* ---------------- walls, fences, gates ---------------- */
  const walls = [];
  const wall = (x0, z0, x1, z1, h, kind) => {
    walls.push({ x0, z0, x1, z1, h, kind });
    solid(x0, z0, x1, z1, h, kind);
  };
  // world edges
  wall(BOUNDS.x0 - 2, BOUNDS.z0, BOUNDS.x0, BOUNDS.z1, 6, "edge");
  wall(BOUNDS.x0, BOUNDS.z0 - 2, BOUNDS.x1, BOUNDS.z0, 6, "edge");
  {
    const gap = ROAD_HALF + 0.6;
    let z = BOUNDS.z0;
    for (const bz of [...BRIDGES].sort((a, b) => a - b)) {
      wall(WATER.east, z, WATER.east + 2, bz - gap, 3, "water");
      z = bz + gap;
    }
    wall(WATER.east, z, WATER.east + 2, BOUNDS.z1 + 2, 3, "water");
    // causeway railings
    for (const bz of BRIDGES) {
      wall(WATER.east, bz - gap - 0.4, ISLAND.x0, bz - gap, 1.1, "rail");
      wall(WATER.east, bz + gap, ISLAND.x0, bz + gap + 0.4, 1.1, "rail");
    }
    // Coral Key shore (west side open only at the causeways)
    let zz = ISLAND.z0 - 2;
    for (const bz of [...BRIDGES].sort((a, b) => a - b)) {
      if (bz - gap > zz) wall(ISLAND.x0 - 2, zz, ISLAND.x0, bz - gap, 3, "water");
      zz = bz + gap;
    }
    if (zz < ISLAND.z1 + 2) wall(ISLAND.x0 - 2, zz, ISLAND.x0, ISLAND.z1 + 2, 3, "water");
    wall(ISLAND.x1, ISLAND.z0 - 2, ISLAND.x1 + 2, ISLAND.z1 + 2, 3, "water");
    wall(ISLAND.x0, ISLAND.z0 - 2, ISLAND.x1, ISLAND.z0, 3, "water");
    wall(ISLAND.x0, ISLAND.z1, ISLAND.x1, ISLAND.z1 + 2, 3, "water");
  }
  wall(BOUNDS.x0, WATER.south, WATER.east, WATER.south + 2, 3, "water");
  wall(298, BOUNDS.z0, 300, -191, 8, "hedge");
  // hills hedge along z = -191 with gaps where the climbs start
  const climbStarts = edges.filter((e) => e.gate === "hills");
  const hedgeZ = -191.5;
  const gaps = climbStarts
    .map((e) => {
      const A = nodes[e.a];
      const B = nodes[e.b];
      const t = (hedgeZ - A.z) / (B.z - A.z);
      return A.x + (B.x - A.x) * t;
    })
    .sort((a, b) => a - b);
  let cur = BOUNDS.x0;
  for (const gx of gaps) {
    wall(cur, hedgeZ - 0.6, gx - HILL_HALF - 1.2, hedgeZ + 0.6, 2.2, "hedge");
    cur = gx + HILL_HALF + 1.2;
  }
  wall(cur, hedgeZ - 0.6, 300, hedgeZ + 0.6, 2.2, "hedge");
  // docks fence: z = 100 (north side) and x = 172 (east side), gaps at the roads
  for (let i = 0; i < 6; i++) {
    const a = i === 0 ? BOUNDS.x0 : COLS[i] + ROAD_HALF + 4.2;
    const bnd = COLS[i + 1] - ROAD_HALF - 4.2;
    wall(a, 99.6, bnd, 100.4, 3.2, "fence");
  }
  wall(171.6, 100, 172.4, 180 - ROAD_HALF - 4.2, 3.2, "fence");
  wall(171.6, 180 + ROAD_HALF + 4.2, 172.4, 270 - ROAD_HALF - 4.2, 3.2, "fence");
  wall(171.6, 270 + ROAD_HALF + 4.2, 172.4, WATER.south, 3.2, "fence");
  // gates (closed while the district is locked)
  const gates = [];
  for (let i = 0; i < 6; i++) {
    const e = edges.find((q) => q.axis === "ns" && q.kind === "grid" && nodes[q.a].x === COLS[i] && nodes[q.a].z === 90 && nodes[q.b].z === 180);
    e.gate = "docks";
    gates.push({ district: "docks", edge: e.id, x0: COLS[i] - ROAD_HALF - 4.2, z0: 99.5, x1: COLS[i] + ROAD_HALF + 4.2, z1: 100.5, axis: "x" });
  }
  for (const z of [180, 270]) {
    const e = edges.find((q) => q.axis === "ew" && q.kind === "grid" && nodes[q.a].x === 90 && nodes[q.b].x === 180 && nodes[q.a].z === z);
    e.gate = "docks";
    gates.push({ district: "docks", edge: e.id, x0: 171.5, z0: z - ROAD_HALF - 4.2, x1: 172.5, z1: z + ROAD_HALF + 4.2, axis: "z" });
  }
  climbStarts.forEach((e, k) => {
    const gx = gaps[k];
    gates.push({ district: "hills", edge: e.id, x0: gx - HILL_HALF - 1.2, z0: hedgeZ - 0.5, x1: gx + HILL_HALF + 1.2, z1: hedgeZ + 0.5, axis: "x" });
  });
  for (const g of gates) g.y = groundAt((g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2);

  /* ---------------- on-street parking ---------------- */
  for (let i = 0; i < COLS.length - 1; i++) {
    for (let j = 0; j < ROWS.length - 1; j++) {
      const d = districtAt((COLS[i] + COLS[i + 1]) / 2, (ROWS[j] + ROWS[j + 1]) / 2);
      for (const side of ["N", "S", "W", "E"]) {
        if (R() > (d === "haven" ? 0.55 : d === "beach" ? 0.5 : 0.35)) continue;
        const t = R.range(0.35, 0.65);
        const p = curbPt(i, j, side, t);
        // parked right against the kerb, clear of the traffic lane
        const o = 0.75;
        if (side === "N") p.z += o;
        if (side === "S") p.z -= o;
        if (side === "W") p.x += o;
        if (side === "E") p.x -= o;
        parking.push({ x: p.x, z: p.z, h: p.h, lot: "street", district: d });
      }
    }
  }
  // hills mansions' driveways
  for (const n of nodes.filter((q) => q.hill && q.edges.length === 2).filter((_, k) => k % 5 === 2)) {
    const e = edges[n.edges[0]];
    const rx = -e.dz;
    const rz = e.dx;
    parking.push({ x: n.x + rx * 4.2, z: n.z + rz * 4.2, h: headingOf(e.dx, e.dz), lot: "street", district: "hills" });
  }

  /* ---------------- named gameplay places ---------------- */
  const P = (id, name, i, j, side, t, icon, extra = {}) => {
    const p = walkPt(i, j, side, t);
    return place(id, { name, x: p.x, z: p.z, icon, h: 0, ...extra });
  };
  const C = (id, name, i, j, side, t, icon, extra = {}) => {
    const p = curbPt(i, j, side, t);
    return place(id, { name, x: p.x, z: p.z, h: p.h, icon, curb: true, ...extra });
  };
  // story + activity anchors (kerbside unless on foot)
  P("startBeach", "Ocean Beach promenade", 6, 1, "E", 0.15, null);
  places.startBeach.x = 281;
  places.startBeach.z = -85;
  C("cafeCurb", "Rosa's Café kerb", 6, 1, "E", 0.55, null);
  C("hotelCurb", "Flamingo Grand drive", 6, 0, "E", 0.6, null);
  C("coralCurb", "Coral Palms kerb", 6, 2, "E", 0.5, null);
  C("marinaCurb", "Marina Grill", 6, 4, "W", 0.5, null);
  C("garageCurb", "Garage kerb", 2, 2, "E", 0.55, null);
  C("hospitalCurb", "Hospital kerb", 0, 0, "S", 0.5, null);
  C("marketCurb", "Market street", 1, 2, "N", 0.3, null);
  C("parkCurb", "Haven Park kerb", 1, 1, "W", 0.5, null);
  C("plazaCurb", "Liberty Plaza kerb", 4, 1, "N", 0.5, null);
  C("vaneCurb", "Vane Tower drive", 5, 1, "W", 0.5, null);
  C("dealerCurb", "Sunrise Motors kerb", 5, 2, "S", 0.6, null);
  C("policeCurb", "Police HQ kerb", 3, 0, "S", 0.3, null);
  C("taxiCurb", "Taxi rank", 4, 0, "E", 0.4, null);
  C("postCurb", "Sunny Post kerb", 6, 3, "N", 0.27, null);
  C("pier9Curb", "Pier 9 kerb", 2, 4, "S", 0.5, null);
  C("depotCurb", "Freight depot kerb", 5, 3, "S", 0.5, null);
  C("yardCurb", "Container yard kerb", 0, 3, "E", 0.5, null);
  C("customsCurb", "Customs gate", 4, 4, "E", 0.45, null);
  C("quayWest", "West quay", 0, 4, "S", 0.3, null);
  C("quayEast", "East quay", 4, 4, "S", 0.7, null);
  C("havenNW", "Haven north", 0, 0, "N", 0.6, null);
  C("havenSW", "Haven south-west", 0, 2, "W", 0.6, null);
  C("downtownN", "Downtown north", 4, 0, "N", 0.4, null);
  C("beachS", "South boulevard", 6, 4, "E", 0.6, null);
  C("beachN", "North boulevard", 6, 0, "E", 0.2, null);
  C("docksMid", "Dock road", 3, 3, "S", 0.5, null);
  C("docksWest", "Dock west", 0, 4, "W", 0.5, null);
  C("raceFlag", "Boulevard race start", 5, 0, "E", 0.82, "race");
  C("trialFlag", "Coastal time trial", 6, 0, "E", 0.42, "trial");
  // on-foot spots: doors, fares, search spots
  const foot = (id, name, x, z, extra = {}) => place(id, { name, x, z, h: 0, foot: true, ...extra });
  foot("marinaDoor", "Marina Grill door", COLS[6] + 8.6, ROWS[4] + 10 + 19);
  foot("plazaFare", "Liberty Plaza", 45, ROWS[1] + WALK_OFF + 0.4);
  foot("parkFare", "Haven Park", COLS[1] + WALK_OFF + 0.4, -45);
  foot("vaneFare", "Vane Tower", COLS[5] + WALK_OFF + 0.4, -45);
  foot("customsCase", "Customs yard", 70, 221);
  foot("quayWestFoot", "West quay", places.quayWest.x, 279.5);
  foot("parkSpot1", "Park benches", -240, -47.5);
  foot("parkSpot2", "Basketball court", -238, -18);
  foot("parkSpot3", "Under the trees", -204, -62);
  props.push({ type: "boat", x: places.quayWest.x, z: 291, y: -0.4 });
  // kerb in front of the Sterling Estate (lane on the estate side of Ridge Road)
  {
    const E = places.estate;
    let best = null;
    for (const e of edges) {
      if (e.kind !== "hill") continue;
      const A = nodes[e.a];
      const B = nodes[e.b];
      const c = segClosest(E.x, E.z - 4, A.x, A.z, B.x, B.z);
      if (!best || c.d2 < best.c.d2) best = { c, e };
    }
    const { c, e } = best;
    // the lane whose right side faces the estate
    let dx = e.dx;
    let dz = e.dz;
    if (-dz * (E.x - c.x) + dx * (E.z - c.z) < 0) {
      dx = -dx;
      dz = -dz;
    }
    place("estateCurb", { name: "Sterling Estate drive", x: c.x - dz * 3.4, z: c.z + dx * 3.4, h: headingOf(dx, dz), curb: true });
  }
  // nudge on-foot places out of anything solid (trees, kiosks)
  for (const p of Object.values(places)) {
    if (p.curb) continue;
    const hit = (x, z) => solids.some((s) => x > s.x0 - 0.6 && x < s.x1 + 0.6 && z > s.z0 - 0.6 && z < s.z1 + 0.6);
    if (!hit(p.x, p.z)) continue;
    let done = false;
    for (let r = 0.5; r < 8 && !done; r += 0.5) {
      for (let a = 0; a < 16 && !done; a++) {
        const x = p.x + Math.cos((a / 16) * Math.PI * 2) * r;
        const z = p.z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (!hit(x, z)) {
          p.x = x;
          p.z = z;
          done = true;
        }
      }
    }
  }
  // hills waypoints (for drives, races and the map)
  {
    const hill = nodes.filter((n) => n.hill);
    const near = (x, z) => hill.reduce((b, n) => (Math.hypot(n.x - x, n.z - z) < Math.hypot(b.x - x, b.z - z) ? n : b));
    const hp = (id, name, x, z) => {
      const n = near(x, z);
      place(id, { name, x: n.x, z: n.z, h: 0, node: n.id });
    };
    hp("hillsGate", "Hills gate", -90, -200);
    hp("crestWest", "Crest Drive west", -270, -270);
    hp("crestMid", "Crest Drive", -90, -270);
    hp("crestEast", "Crest Drive east", 90, -270);
    hp("ridgeWest", "Ridge Road west", -270, -360);
    hp("ridgeMid", "Ridge Road", -90, -360);
    hp("ridgeEast", "Ridge Road east", 90, -360);
    hp("coastClimb", "Coast climb", 230, -280);
  }

  /* ---------------- Coral Key ---------------- */
  {
    const RI = rng(7311);
    const KEY_PASTEL = ["#fbe3d0", "#e7f3f0", "#f6e7f3", "#fff4d6", "#d9f0ff", "#ffe0ec"];
    const IB = (i, j) => block(100 + i, j);
    // sidewalks, lamps, palms, bins and signs round every island block
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        const gi = 100 + i;
        const x0 = colX(gi) + WALK_OFF;
        const x1 = colX(gi + 1) - WALK_OFF;
        const z0 = ROWS[j] + WALK_OFF;
        const z1 = ROWS[j + 1] - WALK_OFF;
        walks.push({ id: walks.length, i: gi, j, district: "key", pts: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] });
        for (const side of ["N", "S", "W", "E"]) {
          for (let t = 0.08; t < 0.95; t += 0.28) {
            const p = walkPt(gi, j, side, t);
            const ox = side === "W" ? -1.6 : side === "E" ? 1.6 : 0;
            const oz = side === "N" ? -1.6 : side === "S" ? 1.6 : 0;
            const facing = side === "N" ? Math.PI : side === "S" ? 0 : side === "W" ? -Math.PI / 2 : Math.PI / 2;
            if (Math.abs(t - 0.64) < 0.01) {
              const q = walkPt(gi, j, side, 0.5);
              const kx = side === "W" ? -1.1 : side === "E" ? 1.1 : 0;
              const kz = side === "N" ? -1.1 : side === "S" ? 1.1 : 0;
              if (side === "N" || side === "S") prop("sign", q.x + kx, q.z + kz, { rot: facing, kind: (i + j) % 3 });
              else prop("bin", q.x + kx, q.z + kz, { rot: facing });
            }
            if (t < 0.1 || t > 0.9) prop("lamp", p.x + ox, p.z + oz, { rot: facing });
            else prop("palm", p.x + ox, p.z + oz, { s: RI.range(0.9, 1.25), lean: RI.range(-0.12, 0.12) });
          }
        }
        // kerbside parking
        for (const side of ["N", "S", "W", "E"]) {
          if (RI() > 0.45) continue;
          const p = curbPt(gi, j, side, RI.range(0.35, 0.65));
          if (side === "N") p.z += 0.75;
          if (side === "S") p.z -= 0.75;
          if (side === "W") p.x += 0.75;
          if (side === "E") p.x -= 0.75;
          parking.push({ x: p.x, z: p.z, h: p.h, lot: "street", district: "key" });
        }
      }
    }
    const KC = (id, name, i, j, side, t) => {
      const p = curbPt(100 + i, j, side, t);
      return place(id, { name, x: p.x, z: p.z, h: p.h, icon: null, curb: true });
    };
    const villa = (b, n = 2) => {
      // big white villas with a pool each, hedged gardens, palms
      const w = (b.x1 - b.x0 - 6) / n;
      for (let k = 0; k < n; k++) {
        const x0 = b.x0 + 3 + k * w;
        const vw = Math.min(26, w - 8);
        const vd = RI.range(16, 22);
        building({ x0: x0 + 4, z0: b.z0 + 6, x1: x0 + 4 + vw, z1: b.z0 + 6 + vd, h: RI.range(7, 11), style: "mansion", roof: RI() < 0.5 ? "flat" : "pitched", color: RI.pick(KEY_PASTEL), district: "key" });
        props.push({ type: "pool", x: x0 + 4 + vw / 2, z: b.z1 - 16, y: CURB, rot: 0 });
        for (const [px, pz] of [[x0 + 3, b.z1 - 4], [x0 + w - 4, b.z1 - 4], [x0 + w - 4, b.z0 + 4]]) prop("palm", px, pz, { s: RI.range(1, 1.3), lean: RI.range(-0.2, 0.2) });
      }
    };
    const shops = (b) => {
      building({ x0: b.x0 + 2, z0: b.z0 + 2, x1: b.x1 - 2, z1: b.z0 + 26, h: 9, style: "shop", color: RI.pick(KEY_PASTEL), district: "key", awning: true, sign: RI.int(0, 9), name: "Palm Court", neon: "#5ce1e6" });
      building({ x0: b.x0 + 2, z0: b.z1 - 26, x1: b.x0 + 34, z1: b.z1 - 2, h: 8, style: "shop", color: RI.pick(KEY_PASTEL), district: "key", awning: true, sign: RI.int(0, 9) });
      building({ x0: b.x1 - 34, z0: b.z1 - 26, x1: b.x1 - 2, z1: b.z1 - 2, h: 8, style: "shop", color: RI.pick(KEY_PASTEL), district: "key", awning: true, sign: RI.int(0, 9) });
      for (let k = 0; k < 4; k++) props.push({ type: "bench", x: b.x0 + 18 + k * 12, z: b.cz, y: CURB, rot: 0, seat: true });
      zones.push({ kind: "plaza", x0: b.x0 + 4, z0: b.z0 + 30, x1: b.x1 - 4, z1: b.z1 - 30 });
    };
    // (0,1) Coral Casino — the island's landmark
    {
      const b = IB(0, 1);
      const cas = building({ x0: b.x0 + 4, z0: b.z0 + 6, x1: b.x1 - 4, z1: b.z0 + 44, h: 24, style: "glass", color: "#ffe9a8", district: "key", name: "Coral Casino", neon: "#ffd23f", crown: true });
      cas.door = "S";
      props.push({ type: "fountain", x: b.x1 - 12, z: b.z1 - 13, y: CURB });
      landmarks.push({ id: "casino", name: "Coral Casino", x: cas.cx, z: cas.cz, r: 40 });
      place("casino", { name: "Coral Casino", x: b.cx, z: b.z0 + 45.5, icon: "contact", h: 0, foot: true });
      for (let k = 0; k < 4; k++) parking.push({ x: b.x0 + 8 + k * 6, z: b.z1 - 4, h: 0, lot: "casino", bay: true, district: "key" });
    }
    // (1,1) Azure Resort: twin hotel towers and a pool deck
    {
      const b = IB(1, 1);
      building({ x0: b.x0 + 2, z0: b.z0 + 4, x1: b.x0 + 28, z1: b.z1 - 4, h: 58, style: "hotel", color: "#bfe3e8", district: "key", stripes: true, name: "Azure Resort", neon: "#3fd8ff", sign: 3 });
      building({ x0: b.x1 - 28, z0: b.z0 + 4, x1: b.x1 - 2, z1: b.z1 - 4, h: 44, style: "hotel", color: "#d9f0ff", district: "key", stripes: true });
      props.push({ type: "pool", x: b.cx, z: b.cz - 12, y: CURB, rot: 0 });
      props.push({ type: "pool", x: b.cx, z: b.cz + 14, y: CURB, rot: 0 });
      landmarks.push({ id: "resort", name: "Azure Resort", x: b.cx, z: b.cz, r: 38 });
    }
    // (0,2) Key Marina: harbour office, boats in the channel, a lot
    {
      const b = IB(0, 2);
      const m = building({ x0: b.x0 + 4, z0: b.z0 + 4, x1: b.x0 + 32, z1: b.z0 + 22, h: 7, style: "shop", color: "#e7f3f0", district: "key", awning: true, name: "Key Marina", neon: "#5ce1e6", sign: 6 });
      m.door = "E";
      place("keyMarina", { name: "Key Marina office", x: b.x0 + 33.6, z: b.z0 + 13, icon: "contact", h: Math.PI / 2, foot: true });
      for (let k = 0; k < 5; k++) props.push({ type: "boat", x: 392, z: 22 + k * 16, y: -0.4 });
      for (let k = 0; k < 6; k++) parking.push({ x: b.x0 + 46 + (k % 3) * 6, z: b.z0 + 16 + Math.floor(k / 3) * 12, h: 0, lot: "marinaKey", bay: true, district: "key" });
      landmarks.push({ id: "keymarina", name: "Key Marina", x: b.cx, z: b.cz, r: 34 });
    }
    // (1,0) Coral Gardens: trees, benches, a fountain
    {
      const b = IB(1, 0);
      zones.push({ kind: "park", x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
      for (let k = 0; k < 16; k++) prop("tree", RI.range(b.x0 + 5, b.x1 - 5), RI.range(b.z0 + 5, b.z1 - 5));
      props.push({ type: "fountain", x: b.cx, z: b.cz, y: CURB });
      for (let k = 0; k < 4; k++) props.push({ type: "bench", x: b.cx - 18 + k * 12, z: b.cz + 10, y: CURB, rot: 0, seat: true });
      landmarks.push({ id: "gardens", name: "Coral Gardens", x: b.cx, z: b.cz, r: 30 });
      place("gardens", { name: "Coral Gardens", x: b.cx, z: b.z1 + 0.6, icon: null, h: 0, foot: true });
    }
    // (1,2) Palm Court shops
    shops(IB(1, 2));
    // the rest: villas
    for (const [i, j] of [[0, 0], [2, 0], [2, 2], [0, 3], [1, 3], [2, 3]]) villa(IB(i, j), i === 1 ? 3 : 2);
    // (2,1) Club Neon: a real walk-in nightclub. Only its walls are solid (a
    // door gap on the street side), so you can go inside: dance floor, bar,
    // raised DJ stage, booths. render/club.js draws it.
    {
      const C = { x0: 624, x1: 678, z0: -68, z1: -22, h: 7.2, doorZ0: -48.5, doorZ1: -41.5, wall: 0.6 };
      const rec = building({ x0: C.x0, z0: C.z0, x1: C.x1, z1: C.z1, h: C.h, style: "club", color: "#2a1240", district: "key", name: "Club Neon", hollow: true });
      solids.splice(solids.indexOf(rec.solid), 1);
      rec.solid = null;
      const W = C.wall;
      const wallS = (x0, z0, x1, z1) => solid(x0, z0, x1, z1, C.h, "building");
      wallS(C.x0, C.z0, C.x0 + W, C.doorZ0);
      wallS(C.x0, C.doorZ1, C.x0 + W, C.z1);
      wallS(C.x0, C.z0, C.x1, C.z0 + W);
      wallS(C.x0, C.z1 - W, C.x1, C.z1);
      wallS(C.x1 - W, C.z0, C.x1, C.z1);
      // interior: bar counter (north), raised DJ stage (east), booths (south)
      const bar = { x0: 632, x1: 662, z0: -63.6, z1: -62.4 };
      solid(bar.x0, bar.z0, bar.x1, bar.z1, 1.1, "furniture");
      solid(bar.x0, C.z0 + W, bar.x1, C.z0 + W + 0.8, 2.6, "furniture"); // back bar
      const dj = { x0: 666, x1: 674, z0: -52, z1: -36 };
      solid(dj.x0, dj.z0, dj.x1, dj.z1, 0.75, "furniture");
      const booths = [
        { x0: 630, x1: 646, z0: -25.8, z1: -24.2 },
        { x0: 652, x1: 668, z0: -25.8, z1: -24.2 },
      ];
      for (const b2 of booths) solid(b2.x0, b2.z0, b2.x1, b2.z1, 0.8, "furniture");
      club = { ...C, bar, dj, booths, dance: { x0: 636, x1: 660, z0: -55, z1: -35 }, door: { x: C.x0, z: (C.doorZ0 + C.doorZ1) / 2 }, name: "Club Neon" };
      place("clubDoor", { name: "Club Neon entrance", x: C.x0 - 2.2, z: club.door.z, icon: "contact", h: -Math.PI / 2, foot: true });
      place("clubBar", { name: "Club Neon bar", x: 647, z: -61.2, icon: null, h: Math.PI, foot: true });
      place("clubFloor", { name: "Club Neon dance floor", x: 648, z: -45, icon: null, h: 0, foot: true });
      place("clubDJ", { name: "Club Neon DJ booth", x: 664.8, z: -44, icon: null, h: -Math.PI / 2, foot: true });
      KC("clubCurb", "Club Neon kerb", 2, 1, "W", 0.5);
      landmarks.push({ id: "club", name: "Club Neon", x: 651, z: -45, r: 26 });
    }
    // places for missions (kerbside unless on foot)
    KC("casinoCurb", "Coral Casino drive", 0, 1, "W", 0.72);
    KC("resortCurb", "Azure Resort drive", 1, 1, "W", 0.5);
    KC("keyMarinaCurb", "Key Marina kerb", 0, 2, "W", 0.6);
    KC("palmCourtCurb", "Palm Court", 1, 2, "N", 0.4);
    KC("gardensCurb", "Coral Gardens kerb", 1, 0, "S", 0.5);
    KC("villaNE", "Villa row north", 2, 0, "W", 0.5);
    KC("villaSE", "Villa row south", 2, 3, "N", 0.5);
    KC("keySouth", "Key south road", 1, 3, "S", 0.5);
    KC("keyEast", "Key east road", 2, 1, "E", 0.5);
    place("causeway", { name: "Causeway", x: 377, z: -2.2, h: Math.PI / 2, icon: null, curb: true });
    place("causewaySouth", { name: "South causeway", x: 377, z: 182.2, h: -Math.PI / 2, icon: null, curb: true });
    // on-foot spots on the sidewalk in front of the buildings (reachable from the kerb)
    {
      const p = walkPt(101, 2, "N", 0.5);
      place("palmCourt", { name: "Palm Court shops", x: p.x, z: p.z - 0.4, icon: null, h: 0, foot: true });
      const q = walkPt(102, 3, "N", 0.3);
      place("villaDoor", { name: "Villa gate", x: q.x, z: q.z - 0.4, icon: null, h: 0, foot: true });
    }
  }

  /* ---------------- bus shelters on the busier streets ---------------- */
  {
    const RB = rng(5150);
    for (const w of walks) {
      if (w.line || w.district === "hills" || w.district === "docks") continue;
      for (const side of ["N", "S", "W", "E"]) {
        if (RB() > 0.22) continue;
        const q = walkPt(w.i, w.j, side, 0.3);
        const kx = side === "W" ? -1.6 : side === "E" ? 1.6 : 0;
        const kz = side === "N" ? -1.6 : side === "S" ? 1.6 : 0;
        const x = q.x + kx;
        const z = q.z + kz;
        if (props.some((p) => Math.abs(p.x - x) < 3.2 && Math.abs(p.z - z) < 3.2)) continue;
        if (crossings.some((c) => Math.hypot(c.x - x, c.z - z) < 7)) continue;
        if (solids.some((o) => x + 1.8 > o.x0 && x - 1.8 < o.x1 && z + 1.8 > o.z0 && z - 1.8 < o.z1)) continue;
        const rot = side === "N" ? Math.PI : side === "S" ? 0 : side === "W" ? -Math.PI / 2 : Math.PI / 2;
        props.push({ type: "busstop", x, z, y: groundAt(x, z) + CURB, rot });
        // the back panel is solid (open towards the road)
        const bx = x - Math.sin(rot) * 0.55;
        const bz = z - Math.cos(rot) * 0.55;
        const along = side === "N" || side === "S";
        solid(along ? bx - 1.7 : bx - 0.12, along ? bz - 0.12 : bz - 1.7, along ? bx + 1.7 : bx + 0.12, along ? bz + 0.12 : bz + 1.7, 2.5, "pole");
      }
    }
  }

  /* ---------------- road spatial index ---------------- */
  const RC = 30;
  const rcell = new Map();
  for (const e of edges) {
    const A = nodes[e.a];
    const B = nodes[e.b];
    const pad = e.half + 6;
    const i0 = Math.floor((Math.min(A.x, B.x) - pad) / RC);
    const i1 = Math.floor((Math.max(A.x, B.x) + pad) / RC);
    const j0 = Math.floor((Math.min(A.z, B.z) - pad) / RC);
    const j1 = Math.floor((Math.max(A.z, B.z) + pad) / RC);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = `${i},${j}`;
        if (!rcell.has(k)) rcell.set(k, []);
        rcell.get(k).push(e.id);
      }
    }
  }
  /** nearest road at a point → { edge, t, d (distance from the centre line), x, z } or null when > 16 m */
  function roadQuery(x, z) {
    const list = rcell.get(`${Math.floor(x / RC)},${Math.floor(z / RC)}`);
    if (!list) return null;
    let best = null;
    for (const id of list) {
      const e = edges[id];
      const A = nodes[e.a];
      const B = nodes[e.b];
      const c = segClosest(x, z, A.x, A.z, B.x, B.z);
      if (!best || c.d2 < best.d2) best = { edge: e, t: c.t, d2: c.d2, x: c.x, z: c.z };
    }
    if (!best) return null;
    best.d = Math.sqrt(best.d2);
    return best.d < 16 ? best : null;
  }
  /** on a road surface (not the sidewalk)? also true inside intersections */
  const onRoad = (x, z) => {
    const q = roadQuery(x, z);
    return !!q && q.d < q.edge.half + 0.2;
  };
  /** walkable surface height (sidewalks and lots are raised by a kerb) */
  const surfaceAt = (x, z) => groundAt(x, z) + (onRoad(x, z) ? 0 : CURB);

  const city = {
    nodes,
    edges,
    lightsAt: nodes.filter((n) => n.light),
    buildings,
    solids,
    props,
    parking,
    walks,
    crossings,
    zones,
    places,
    landmarks,
    gates,
    walls,
    bounds: BOUNDS,
    groundAt,
    districtAt,
    roadQuery,
    onRoad,
    surfaceAt,
    gridNode: (i, j) => G(i, j),
    island: ISLAND,
    club,
    walkPt,
    curbPt,
  };
  return city;
}

/**
 * Lightweight street furniture a car can knock down: impact speed (m/s) needed
 * to break it (`at`), the share of the car's speed it costs (`loss`), the car
 * damage it does (`dmg`, scaled by impact) and its height. Anything not listed
 * (buildings, walls, gates, trees, palms) stays solid.
 */
export const BREAKABLE = {
  lamp: { at: 6.5, loss: 0.12, dmg: 5, h: 6.2, name: "streetlight" },
  signal: { at: 7.5, loss: 0.15, dmg: 6, h: 5.2, name: "traffic light" },
  sign: { at: 2.5, loss: 0.03, dmg: 1, h: 2.8, name: "road sign" },
  bin: { at: 1, loss: 0.02, dmg: 0.3, h: 1, name: "trash can" },
  barrier: { at: 1.2, loss: 0.04, dmg: 0.8, h: 1.1, name: "barrier" },
  picket: { at: 2.2, loss: 0.06, dmg: 1.5, h: 1.1, name: "fence" },
};

/** zone lookup (restricted yards, hideouts, parks…) */
export function zoneAt(city, x, z, kind) {
  for (const zn of city.zones) if ((!kind || zn.kind === kind) && x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
  return null;
}
export { clamp };
