/**
 * Vice Streets 3D — procedural vehicle models (original designs).
 *
 * Each style is a side profile (rear → front) extruded across the body width
 * with rounded (bevelled) edges and real wheel-arch cut-outs, plus:
 *   a tinted glass greenhouse with a painted roof and pillars,
 *   an interior (seats, dashboard, steering wheel) visible through the glass,
 *   tyres + alloy rims on spinning / steering hubs,
 *   headlights, tail/brake/reverse lights (per-car emissive materials),
 *   bumpers, grille, mirrors, door seams, handles, number plates,
 *   style details: taxi roof sign, police light bar + livery, sports wing,
 *   muscle scoop + stripes, SUV roof rails + spare wheel, van sliding door,
 *   and for the newer styles: round / slim lamps, full-width tail bars,
 *   chrome trim, a supercar's wedge with intakes and diffuser, a track car's
 *   wing and splitter, a GT's ducktail and quad pipes, an open convertible
 *   cockpit with windscreen and roll hoops, a pickup's bed and roll bar and
 *   an off-roader's flares, bull bar, rack and spare.
 * Geometry is shared per vehicle type; only paint and light materials are
 * per car. Local frame: +z forward, +x = left side, y up, origin on the ground.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { VEHICLE } from "../data/vehicles.js";

/** profile (fractions of length / height) per style: rear bottom → … → front bottom */
const PROFILES = {
  hatch: { belt: 0.6, pts: [[-0.5, 0.22], [-0.5, 0.58], [-0.47, 0.64], [-0.44, 0.97], [-0.3, 1.0], [0.05, 0.99], [0.23, 0.67], [0.43, 0.6], [0.5, 0.5], [0.5, 0.22]], cabin: [[-0.45, 0.62], [-0.43, 0.95], [-0.3, 0.985], [0.05, 0.975], [0.21, 0.66]] },
  sedan: { belt: 0.62, pts: [[-0.5, 0.22], [-0.5, 0.55], [-0.47, 0.63], [-0.36, 0.66], [-0.22, 0.97], [0.1, 1.0], [0.27, 0.68], [0.45, 0.62], [0.5, 0.52], [0.5, 0.22]], cabin: [[-0.34, 0.65], [-0.21, 0.955], [0.09, 0.985], [0.255, 0.67]] },
  taxi: null,
  police: null,
  coupe: { belt: 0.6, pts: [[-0.5, 0.24], [-0.5, 0.6], [-0.46, 0.66], [-0.3, 0.7], [-0.14, 0.98], [0.07, 1.0], [0.25, 0.7], [0.46, 0.56], [0.5, 0.46], [0.5, 0.24]], cabin: [[-0.28, 0.69], [-0.13, 0.965], [0.06, 0.985], [0.235, 0.7]] },
  muscle: { belt: 0.64, pts: [[-0.5, 0.22], [-0.5, 0.6], [-0.48, 0.67], [-0.33, 0.69], [-0.2, 0.98], [0.06, 1.0], [0.22, 0.71], [0.47, 0.66], [0.5, 0.56], [0.5, 0.22]], cabin: [[-0.31, 0.685], [-0.19, 0.965], [0.05, 0.985], [0.205, 0.7]] },
  suv: { belt: 0.6, pts: [[-0.5, 0.24], [-0.5, 0.62], [-0.48, 0.97], [-0.4, 1.0], [0.12, 1.0], [0.27, 0.66], [0.46, 0.6], [0.5, 0.5], [0.5, 0.24]], cabin: [[-0.47, 0.62], [-0.46, 0.96], [-0.4, 0.985], [0.11, 0.985], [0.255, 0.65]] },
  van: { belt: 0.5, pts: [[-0.5, 0.2], [-0.5, 0.98], [-0.47, 1.0], [0.2, 1.0], [0.33, 0.62], [0.47, 0.45], [0.5, 0.38], [0.5, 0.2]], cabin: [[0.17, 0.5], [0.18, 0.96], [0.2, 0.975], [0.32, 0.62], [0.36, 0.5]] },
  // classic compact: upright glass, short nose, flat roof
  mini: { belt: 0.62, pts: [[-0.5, 0.2], [-0.5, 0.6], [-0.48, 0.64], [-0.45, 0.96], [-0.38, 1.0], [0.2, 1.0], [0.28, 0.66], [0.47, 0.62], [0.5, 0.52], [0.5, 0.2]], cabin: [[-0.44, 0.63], [-0.43, 0.95], [-0.37, 0.985], [0.19, 0.985], [0.265, 0.66]] },
  // hot hatch: lower, raked windscreen and tailgate
  hothatch: { belt: 0.6, pts: [[-0.5, 0.22], [-0.5, 0.58], [-0.47, 0.66], [-0.4, 0.95], [-0.25, 1.0], [0.05, 0.99], [0.26, 0.66], [0.45, 0.58], [0.5, 0.47], [0.5, 0.22]], cabin: [[-0.38, 0.65], [-0.24, 0.975], [0.04, 0.97], [0.245, 0.66]] },
  // luxury sedan: long hood, fast rear screen
  lux: { belt: 0.63, pts: [[-0.5, 0.22], [-0.5, 0.56], [-0.47, 0.63], [-0.33, 0.66], [-0.17, 0.98], [0.12, 1.0], [0.29, 0.68], [0.47, 0.62], [0.5, 0.52], [0.5, 0.22]], cabin: [[-0.31, 0.65], [-0.16, 0.96], [0.11, 0.985], [0.275, 0.67]] },
  // executive: long wheelbase, formal upright rear window
  exec: { belt: 0.63, pts: [[-0.5, 0.22], [-0.5, 0.56], [-0.47, 0.64], [-0.36, 0.67], [-0.26, 0.99], [0.12, 1.0], [0.27, 0.68], [0.46, 0.63], [0.5, 0.53], [0.5, 0.22]], cabin: [[-0.34, 0.66], [-0.25, 0.97], [0.11, 0.985], [0.255, 0.67]] },
  // compact SUV / crossover: raised, sloping rear
  cross: { belt: 0.6, pts: [[-0.5, 0.26], [-0.5, 0.62], [-0.47, 0.72], [-0.42, 0.96], [-0.3, 1.0], [0.1, 1.0], [0.27, 0.67], [0.46, 0.6], [0.5, 0.5], [0.5, 0.26]], cabin: [[-0.44, 0.62], [-0.4, 0.95], [-0.3, 0.985], [0.09, 0.985], [0.255, 0.66]] },
  // luxury SUV: long, tall, gently raked D-pillar
  luxsuv: { belt: 0.61, pts: [[-0.5, 0.25], [-0.5, 0.62], [-0.48, 0.9], [-0.42, 1.0], [0.12, 1.0], [0.28, 0.67], [0.47, 0.62], [0.5, 0.52], [0.5, 0.25]], cabin: [[-0.46, 0.62], [-0.44, 0.93], [-0.41, 0.985], [0.11, 0.985], [0.265, 0.66]] },
  // supercar: mid-engine wedge, cab forward, nose falling to the road
  super: { belt: 0.66, pts: [[-0.5, 0.26], [-0.5, 0.6], [-0.46, 0.67], [-0.3, 0.68], [-0.13, 1.0], [0.05, 0.99], [0.22, 0.68], [0.37, 0.69], [0.47, 0.5], [0.5, 0.42], [0.5, 0.24]], cabin: [[-0.28, 0.67], [-0.12, 0.97], [0.04, 0.965], [0.21, 0.67]] },
  // retro 70s GT: long hood, short tail, fastback
  retro: { belt: 0.64, pts: [[-0.5, 0.22], [-0.5, 0.58], [-0.47, 0.64], [-0.35, 0.66], [-0.17, 0.95], [-0.06, 1.0], [0.03, 1.0], [0.12, 0.7], [0.46, 0.64], [0.5, 0.56], [0.5, 0.22]], cabin: [[-0.32, 0.65], [-0.16, 0.93], [-0.06, 0.985], [0.02, 0.985], [0.11, 0.68]] },
  // convertible: no roof — the cabin line only places the windscreen and seats
  spyder: { belt: 0.71, open: true, pts: [[-0.5, 0.24], [-0.5, 0.62], [-0.46, 0.69], [-0.28, 0.71], [0.1, 0.71], [0.2, 0.7], [0.46, 0.55], [0.5, 0.46], [0.5, 0.24]], cabin: [[-0.26, 0.7], [-0.16, 0.93], [0.02, 0.95], [0.17, 0.7]] },
  // track car: low coupe (wing, splitter and skirts are added below)
  track: { belt: 0.6, pts: [[-0.5, 0.24], [-0.5, 0.62], [-0.46, 0.67], [-0.3, 0.69], [-0.13, 0.98], [0.06, 1.0], [0.24, 0.69], [0.46, 0.52], [0.5, 0.42], [0.5, 0.22]], cabin: [[-0.28, 0.68], [-0.12, 0.965], [0.05, 0.985], [0.225, 0.69]] },
  // high-performance coupe: fastback with a long hood
  gt: { belt: 0.62, pts: [[-0.5, 0.24], [-0.5, 0.6], [-0.46, 0.67], [-0.32, 0.69], [-0.12, 0.98], [0.06, 1.0], [0.24, 0.68], [0.46, 0.55], [0.5, 0.45], [0.5, 0.24]], cabin: [[-0.3, 0.68], [-0.11, 0.965], [0.05, 0.985], [0.225, 0.68]] },
  // pickup: crew cab up front, open bed behind
  pickup: { belt: 0.62, pts: [[-0.5, 0.24], [-0.5, 0.62], [-0.47, 0.64], [-0.06, 0.64], [-0.03, 0.98], [0.2, 1.0], [0.3, 0.68], [0.47, 0.63], [0.5, 0.55], [0.5, 0.24]], cabin: [[-0.03, 0.63], [-0.02, 0.96], [0.19, 0.985], [0.29, 0.66]] },
  // off-roader: boxy, upright screen, tall
  offroad: { belt: 0.62, pts: [[-0.5, 0.3], [-0.5, 0.96], [-0.47, 1.0], [0.1, 1.0], [0.17, 0.66], [0.47, 0.64], [0.5, 0.56], [0.5, 0.3]], cabin: [[-0.46, 0.62], [-0.45, 0.96], [-0.42, 0.985], [0.09, 0.985], [0.16, 0.65]] },
};
PROFILES.taxi = PROFILES.sedan;
PROFILES.police = PROFILES.sedan;

const WHEEL_R = { hatch: 0.31, sedan: 0.33, taxi: 0.33, police: 0.34, coupe: 0.34, muscle: 0.36, suv: 0.4, van: 0.37, mini: 0.27, hothatch: 0.33, lux: 0.35, exec: 0.35, cross: 0.37, luxsuv: 0.41, super: 0.34, retro: 0.32, spyder: 0.34, track: 0.35, gt: 0.36, pickup: 0.41, offroad: 0.45 };
/** tyre width (m) */
const TYRE_W = { super: 0.32, track: 0.32, gt: 0.3, spyder: 0.28, muscle: 0.28, offroad: 0.32, pickup: 0.28, luxsuv: 0.28 };
/** spokes per rim */
const SPOKES = { coupe: 10, super: 10, track: 6, gt: 7, spyder: 10, lux: 12, exec: 12, luxsuv: 8, van: 6, suv: 6, pickup: 6, offroad: 5, mini: 4, retro: 8 };
const TWO_DOOR = new Set(["hatch", "coupe", "muscle", "mini", "hothatch", "super", "retro", "spyder", "track", "gt", "offroad"]);
const TWO_SEAT = new Set(["coupe", "van", "super", "spyder", "track"]);
const ROUND_LAMPS = new Set(["mini", "retro", "offroad"]);
const SLIM_LAMPS = new Set(["super", "track", "gt", "spyder", "hothatch", "lux", "exec", "luxsuv"]);
const BAR_TAIL = new Set(["lux", "exec", "luxsuv", "super", "gt"]);
const CHROME = new Set(["mini", "retro", "lux", "exec", "luxsuv"]);

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  SHARED = {
    glass: new THREE.MeshPhysicalMaterial({ color: "#1d2c3a", roughness: 0.04, metalness: 0.55, transparent: true, opacity: 0.68, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
    tyre: std({ color: "#17181b", roughness: 0.92 }),
    rim: std({ color: "#c9ced6", roughness: 0.28, metalness: 0.9 }),
    darkRim: std({ color: "#2a2d33", roughness: 0.35, metalness: 0.8 }),
    trim: std({ color: "#1d1f24", roughness: 0.6, metalness: 0.2 }),
    chrome: std({ color: "#e6e9ee", roughness: 0.15, metalness: 1 }),
    interior: std({ color: "#4a403a", roughness: 0.85 }),
    seat: std({ color: "#5a4a3f", roughness: 0.8 }),
    plate: std({ color: "#f4f1e6", roughness: 0.6 }),
    white: std({ color: "#f3f3f0", roughness: 0.45, metalness: 0.1 }),
    under: std({ color: "#121316", roughness: 1 }),
    shadow: new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.38, depthWrite: false }),
    taxiSign: null,
    geo: new Map(),
    paints: new Map(),
  };
  // taxi roof sign texture
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = "#fff7d0";
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = "#1b1b1b";
  g.font = "bold 24px Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TAXI", 64, 17);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  SHARED.taxiSign = new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.4 });
  // blob shadow texture
  const s = document.createElement("canvas");
  s.width = s.height = 64;
  const sg = s.getContext("2d");
  const grd = sg.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,1)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  sg.fillStyle = grd;
  sg.fillRect(0, 0, 64, 64);
  SHARED.shadow.map = new THREE.CanvasTexture(s);
  return SHARED;
}

export function paintMaterial(hex) {
  const S = shared();
  if (!S.paints.has(hex)) S.paints.set(hex, new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 }));
  return S.paints.get(hex);
}

/** a closed shape from profile points (z, y in metres) with wheel arches cut out of the bottom edge */
function profileShape(pts, arches, r) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  // bottom edge, front → rear, with arches (arcs over the wheels)
  const bottom = pts[0][1];
  const sorted = [...arches].sort((a, b) => b - a);
  for (const z of sorted) {
    s.lineTo(z + r, bottom);
    s.absarc(z, bottom - 0.02, r, 0, Math.PI, false);
  }
  s.lineTo(pts[0][0], bottom);
  return s;
}
/** the part of a closed polygon below y = yb (Sutherland–Hodgman against one line) */
function clipBelow(pts, yb) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ain = a[1] <= yb;
    const bin = b[1] <= yb;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (yb - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, yb]);
    }
  }
  return out;
}
/** extrude a (z, y) shape across the car (x), centred */
function extrudeAcross(shape, width, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}
const box = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

/**
 * Shape a straight extrusion into a car body: sides lean inward toward the roof
 * (tumblehome) and the corners round off in plan view, so nothing reads as a box.
 */
function sculpt(g, L, W, H, belt, k = 1) {
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const y = P.getY(i);
    const z = P.getZ(i);
    const ends = Math.pow(Math.min(1, Math.abs(z) / (L / 2)), 5);
    const plan = 1 - 0.14 * ends;
    const lean = 1 - 0.1 * k * Math.min(1, Math.max(0, (y - belt * 0.55) / (H - belt * 0.55)));
    const skirt = 1 - 0.04 * Math.max(0, 1 - y / (H * 0.3));
    P.setX(i, x * plan * lean * skirt);
    // ends drop a touch toward the bumpers
    if (y > belt * 0.7) P.setY(i, y - 0.05 * ends);
  }
  g.computeVertexNormals();
  return g;
}

function buildGeometry(type) {
  const S = shared();
  if (S.geo.has(type)) return S.geo.get(type);
  const V = VEHICLE[type];
  const style = V.style;
  const P = PROFILES[style];
  const L = V.len;
  const H = V.hgt;
  const W = V.wid;
  const r = WHEEL_R[style];
  const wb = V.wheelbase;
  const pts = P.pts.map(([z, y]) => [z * L, y * H]);
  // bulge the nose and tail faces a little so they aren't flat walls
  {
    const n = pts.length;
    const f0 = pts[n - 2];
    const f1 = pts[n - 1];
    pts.splice(n - 1, 0, [f0[0] + 0.05, (f0[1] + f1[1]) / 2]);
    const r0 = pts[0];
    const r1 = pts[1];
    pts.splice(1, 0, [r0[0] - 0.05, (r0[1] + r1[1]) / 2]);
  }
  const arches = [-wb / 2 + (style === "van" ? -0.1 : 0), wb / 2];
  const archR = r + 0.07;
  // lower body up to the belt line (the cabin above it is glass); the van keeps
  // its full box and gets its windows on the surface instead
  const bodyPts = style === "van" ? pts : clipBelow(pts, P.belt * H);
  const body = sculpt(extrudeAcross(profileShape(bodyPts, arches, archR), W, 0.12), L, W, H, P.belt * H, style === "van" ? 0.4 : 1);
  // greenhouse (glass) and its roof / pillars
  const cab = P.cabin.map(([z, y]) => [z * L, y * H]);
  const cs = new THREE.Shape();
  cs.moveTo(cab[0][0], cab[0][1] - 0.04);
  for (const [z, y] of cab) cs.lineTo(z, y);
  cs.lineTo(cab[cab.length - 1][0], cab[cab.length - 1][1] - 0.04);
  const glassW = style === "van" ? W + 0.03 : W * 0.9;
  let glass;
  if (P.open) {
    // windscreen only: a raked pane from the scuttle up to the frame
    const f = cab[cab.length - 1];
    const t = cab[cab.length - 2];
    const len = Math.hypot(f[0] - t[0], f[1] - t[1]);
    const g = new THREE.BoxGeometry(W * 0.84, 0.025, len);
    g.rotateX(Math.atan2(t[1] - f[1], f[0] - t[0]) - Math.PI);
    g.translate(0, (f[1] + t[1]) / 2, (f[0] + t[0]) / 2);
    glass = g;
  } else glass = sculpt(extrudeAcross(cs, glassW, 0.03), L, W, H, P.belt * H, style === "van" ? 0.4 : 1.6);
  // roof slab: the top edge of the cabin, slightly proud
  const top = cab.filter((p, i) => i > 0 && i < cab.length - 1);
  const rs = new THREE.Shape();
  const ry = Math.max(...top.map((p) => p[1]));
  // the roof skin follows the roofline (a fastback's slope included), 6.5 cm thick
  const flat = top.filter((p) => p[1] >= ry - 0.025);
  rs.moveTo(top[0][0] - 0.02, top[0][1] - 0.03);
  for (const [z, y] of top) rs.lineTo(z, y + 0.035);
  rs.lineTo(top[top.length - 1][0] + 0.02, top[top.length - 1][1] + 0.035);
  rs.lineTo(top[top.length - 1][0] + 0.02, top[top.length - 1][1] - 0.03);
  for (let i = top.length - 1; i >= 0; i--) rs.lineTo(top[i][0], top[i][1] - 0.03);
  const roof = sculpt(extrudeAcross(rs, glassW + 0.04, 0.05), L, W, H, P.belt * H, style === "van" ? 0.4 : 1.6);
  // pillars (B pillar + edges) as thin boxes on both sides
  const paintParts = P.open ? [body] : [body, roof];
  const midZ = (cab[0][0] + cab[cab.length - 1][0]) / 2 + (style === "van" ? 0 : -0.05 * L);
  // A- and C-pillars along the windscreen and rear-window edges (the roof never floats)
  const pillar = (z0, y0, z1, y1, x) => {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const g = new THREE.BoxGeometry(0.07, 0.07, len + 0.04);
    g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
    g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
    return sculpt(g, L, W, H, P.belt * H, style === "van" ? 0.4 : 1.6);
  };
  if (style !== "van" && !P.open) {
    const front = cab[cab.length - 1];
    const rear = cab[0];
    const tf = top[top.length - 1];
    const tr = top[0];
    for (const sx of [1, -1]) {
      const x = (sx * glassW) / 2 - sx * 0.01;
      paintParts.push(pillar(front[0], front[1] - 0.02, tf[0], tf[1], x));
      paintParts.push(pillar(rear[0], rear[1] - 0.02, tr[0], tr[1], x));
    }
  }
  if (style !== "van" && !P.open && style !== "pickup") for (const sx of [1, -1]) paintParts.push(sculpt(box(0.05, ry - P.belt * H, 0.1, (sx * glassW) / 2 + sx * 0.008, (ry + P.belt * H) / 2, midZ), L, W, H, P.belt * H, 1.6));
  const paint = mergeGeometries(paintParts.map((g) => g.toNonIndexed()));
  // trim: bumpers, grille, sills, door seams, handles, mirrors
  const trim = [];
  const zF = L / 2;
  const zR = -L / 2;
  const by = 0.22 * H + 0.12;
  trim.push(box(W * 0.98, 0.16, 0.12, 0, by, zF + 0.02));
  trim.push(box(W * 0.98, 0.16, 0.12, 0, by, zR - 0.02));
  trim.push(box(W * 0.46, 0.12, 0.04, 0, P.pts.at(-2)[1] * H - 0.12, zF + 0.035)); // grille
  for (const sx of [1, -1]) {
    trim.push(box(0.025, 0.05, L * 0.46, (sx * W) / 2 + sx * 0.004, 0.22 * H + 0.06, 0)); // sill
    // door seams + handles
    const doors = TWO_DOOR.has(style) ? [0.12] : style === "van" ? [0.2] : style === "exec" ? [0.2, -0.1] : style === "pickup" ? [0.24, 0.04] : [0.18, -0.12];
    for (const dz of doors) {
      trim.push(box(0.012, P.belt * H - 0.3, 0.02, (sx * W) / 2 + sx * 0.012, (P.belt * H + 0.3) / 2 + 0.05, dz * L));
      trim.push(box(0.02, 0.03, 0.12, (sx * W) / 2 + sx * 0.02, P.belt * H - 0.08, dz * L - 0.25));
    }
    // mirrors
    const mz = cab[cab.length - 1][0] - 0.05;
    trim.push(box(0.11, 0.07, 0.07, sx * (W / 2 + 0.03), P.belt * H + 0.05, mz));
  }
  // under-body (hides the inside when seen from low angles)
  const under = box(W * 0.92, 0.12, L * 0.92, 0, 0.22 * H, 0);
  // interior: two front seats, rear bench, dashboard, steering wheel
  const inner = [];
  const seatY = Math.max(0.36, P.belt * H - 0.38);
  const dashZ = cab[cab.length - 1][0] - 0.12;
  inner.push(box(W * 0.84, 0.2, 0.3, 0, P.belt * H - 0.05, dashZ)); // dashboard
  const seatZ = dashZ - 0.95;
  for (const sx of [1, -1]) {
    inner.push(box(0.5, 0.12, 0.5, sx * W * 0.21, seatY, seatZ));
    inner.push(box(0.5, 0.62, 0.12, sx * W * 0.21, seatY + 0.34, seatZ - 0.28));
  }
  if (!TWO_SEAT.has(style) && style !== "pickup") inner.push(box(W * 0.8, 0.5, 0.3, 0, seatY + 0.2, seatZ - 0.95));
  const wheelG = new THREE.TorusGeometry(0.17, 0.025, 6, 18);
  wheelG.rotateX(Math.PI / 2 - 0.35);
  wheelG.translate(W * 0.21, P.belt * H + 0.04, dashZ - 0.32);
  const innerG = mergeGeometries([...inner.map((g) => g.toNonIndexed()), wheelG.toNonIndexed()]);
  // lights
  const headY = P.pts.at(-2)[1] * H - 0.06;
  const head = [];
  const tail = [];
  // tail lamps sit low on tall, boxy bodies (not up at the roof corner)
  const tailY = (style === "offroad" ? 0.56 : P.pts[1][1]) * H - 0.07;
  for (const sx of [1, -1]) {
    if (ROUND_LAMPS.has(style)) {
      const c = new THREE.CylinderGeometry(0.095, 0.095, 0.08, 16);
      c.rotateX(Math.PI / 2);
      c.translate(sx * (W / 2 - 0.25), headY, zF + 0.04);
      head.push(c);
    } else if (SLIM_LAMPS.has(style)) head.push(box(0.46, 0.065, 0.08, sx * (W / 2 - 0.3), headY + 0.03, zF + 0.04));
    else head.push(box(0.36, 0.11, 0.08, sx * (W / 2 - 0.27), headY, zF + 0.05));
    if (!BAR_TAIL.has(style)) tail.push(box(0.34, 0.1, 0.08, sx * (W / 2 - 0.25), tailY, zR - 0.05));
  }
  if (BAR_TAIL.has(style)) tail.push(box(W * 0.86, 0.06, 0.08, 0, tailY + 0.02, zR - 0.05));
  const plates = mergeGeometries([box(0.42, 0.11, 0.02, 0, by + 0.02, zF + 0.09), box(0.42, 0.11, 0.02, 0, by + 0.02, zR - 0.09)].map((g) => g.toNonIndexed()));
  // style extras
  const extraPaint = [];
  const extraTrim = [];
  const extraWhite = [];
  let sign = null;
  let bar = null;
  if (style === "taxi") sign = box(0.62, 0.2, 0.26, 0, ry + 0.13, -0.15);
  if (style === "police") {
    bar = { y: ry + 0.1, w: W * 0.6 };
    for (const sx of [1, -1]) extraWhite.push(box(0.02, P.belt * H - 0.36, L * 0.42, sx * (W / 2 + 0.008), (P.belt * H + 0.36) / 2, 0.02 * L));
    extraTrim.push(box(W * 0.9, 0.22, 0.14, 0, by + 0.05, zF + 0.1)); // push bar
  }
  if (style === "coupe") {
    extraTrim.push(box(W * 0.92, 0.04, 0.32, 0, P.pts[2][1] * H + 0.2, zR + 0.2));
    for (const sx of [1, -1]) extraTrim.push(box(0.05, 0.18, 0.08, sx * W * 0.32, P.pts[2][1] * H + 0.1, zR + 0.22));
    for (const sx of [1, -1]) extraTrim.push(box(0.02, 0.12, 0.5, sx * (W / 2 + 0.01), 0.42 * H, -0.12 * L));
  }
  if (style === "muscle") {
    const hoodY = P.pts.at(-3)[1] * H;
    extraTrim.push(box(0.5, 0.09, 0.7, 0, hoodY + 0.04, 0.33 * L));
    // twin racing stripes over the hood, roof and boot
    for (const sx of [1, -1]) {
      extraWhite.push(box(0.14, 0.012, 0.26 * L, sx * 0.16, hoodY + 0.075, 0.36 * L));
      extraWhite.push(box(0.14, 0.012, (top[top.length - 1][0] - top[0][0]) * 0.95, sx * 0.16, ry + 0.04, (top[0][0] + top[top.length - 1][0]) / 2));
      extraWhite.push(box(0.14, 0.012, 0.16 * L, sx * 0.16, P.belt * H + 0.012, -0.41 * L));
    }
  }
  if (style === "suv") {
    for (const sx of [1, -1]) extraTrim.push(box(0.05, 0.05, L * 0.55, sx * W * 0.4, ry + 0.08, -0.12 * L));
    const sp = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 18);
    sp.rotateX(Math.PI / 2);
    sp.translate(0, 0.5 * H, zR - 0.12);
    extraTrim.push(sp);
  }
  const chrome = [];
  const hoodY = P.pts.at(-3)[1] * H;
  const deckY = P.pts[2][1] * H;
  const exhaust = (x, z, r = 0.05) => {
    const c = new THREE.CylinderGeometry(r, r, 0.14, 12);
    c.rotateX(Math.PI / 2);
    c.translate(x, 0.22 * H + 0.06, z);
    return c;
  };
  if (CHROME.has(style)) {
    // chrome grille surround and a bright strip along the window line
    chrome.push(box(W * 0.5, 0.16, 0.035, 0, P.pts.at(-2)[1] * H - 0.12, zF + 0.04));
    for (const sx of [1, -1]) chrome.push(box(0.015, 0.02, L * 0.5, sx * (W / 2 + 0.01), P.belt * H + 0.005, -0.03 * L));
  }
  if (style === "mini" || style === "retro") {
    // chrome blade bumpers instead of plastic ones
    chrome.push(box(W * 1.0, 0.07, 0.07, 0, by + 0.02, zF + 0.09));
    chrome.push(box(W * 1.0, 0.07, 0.07, 0, by + 0.02, zR - 0.09));
  }
  if (style === "mini") extraWhite.push(sculpt(box(glassW - 0.02, 0.02, flat[flat.length - 1][0] - flat[0][0], 0, ry + 0.045, (flat[0][0] + flat[flat.length - 1][0]) / 2), L, W, H, P.belt * H, 1.6)); // contrast roof
  if (style === "retro") {
    // rear-window louvres
    for (let k = 0; k < 5; k++) extraTrim.push(box(glassW * 0.8, 0.02, 0.03, 0, (cab[0][1] + (cab[1][1] - cab[0][1]) * (0.2 + k * 0.15)), cab[0][0] + (cab[1][0] - cab[0][0]) * (0.2 + k * 0.15)));
  }
  if (style === "hothatch") {
    extraTrim.push(box(glassW * 0.92, 0.04, 0.26, 0, ry + 0.02, top[0][0] - 0.08)); // roof spoiler
    extraTrim.push(box(W * 0.6, 0.08, 0.12, 0, 0.22 * H + 0.04, zR - 0.06)); // diffuser
    chrome.push(exhaust(-0.18, zR - 0.08), exhaust(0.18, zR - 0.08));
  }
  if (style === "cross") {
    // black cladding along the sills and round the arches, roof rails
    for (const sx of [1, -1]) {
      extraTrim.push(box(0.03, 0.16, L * 0.86, sx * (W / 2 + 0.015), 0.22 * H + 0.12, 0));
      extraTrim.push(box(0.04, 0.04, L * 0.5, sx * W * 0.38, ry + 0.06, -0.1 * L));
    }
  }
  if (style === "luxsuv") for (const sx of [1, -1]) chrome.push(box(0.04, 0.04, L * 0.55, sx * W * 0.39, ry + 0.07, -0.12 * L));
  if (style === "super") {
    // side intakes behind the doors, louvred engine cover, diffuser, centre exhaust
    for (const sx of [1, -1]) extraTrim.push(box(0.035, 0.22, 0.5, sx * (W / 2 + 0.005), 0.45 * H, -0.2 * L));
    for (let k = 0; k < 4; k++) extraTrim.push(box(W * 0.5, 0.012, 0.05, 0, deckY + 0.012, -0.36 * L + k * 0.08));
    for (let k = 0; k < 5; k++) extraTrim.push(box(0.03, 0.12, 0.25, -0.4 + k * 0.2, 0.22 * H + 0.02, zR + 0.06));
    extraTrim.push(box(W * 0.9, 0.03, 0.2, 0, deckY + 0.06, zR + 0.12)); // ducktail lip
    chrome.push(exhaust(0, zR - 0.06, 0.07));
  }
  if (style === "track") {
    // big rear wing on two struts, front splitter, side skirts, twin bonnet stripes
    for (const sx of [1, -1]) extraTrim.push(box(0.04, 0.32, 0.12, sx * W * 0.3, deckY + 0.16, zR + 0.24));
    extraTrim.push(box(W * 0.98, 0.035, 0.36, 0, deckY + 0.34, zR + 0.22));
    for (const sx of [1, -1]) extraTrim.push(box(0.04, 0.14, 0.4, sx * W * 0.49, deckY + 0.3, zR + 0.22));
    extraTrim.push(box(W * 1.02, 0.025, 0.28, 0, 0.22 * H, zF + 0.08));
    for (const sx of [1, -1]) {
      extraTrim.push(box(0.05, 0.05, L * 0.5, sx * (W / 2 + 0.02), 0.22 * H + 0.03, 0));
      extraTrim.push(box(0.16, 0.01, 0.3 * L, sx * 0.14, hoodY + 0.035, 0.34 * L));
      extraTrim.push(box(0.16, 0.01, (top[top.length - 1][0] - top[0][0]) * 0.95, sx * 0.14, ry + 0.04, (top[0][0] + top[top.length - 1][0]) / 2));
    }
    chrome.push(exhaust(0.1, zR - 0.06), exhaust(-0.1, zR - 0.06));
  }
  if (style === "gt") {
    // ducktail, side vents, quad exhausts
    extraPaint.push(box(W * 0.86, 0.05, 0.2, 0, deckY + 0.03, zR + 0.12));
    for (const sx of [1, -1]) extraTrim.push(box(0.03, 0.1, 0.32, sx * (W / 2 + 0.005), 0.5 * H, 0.27 * L));
    for (const x of [-0.42, -0.3, 0.3, 0.42]) chrome.push(exhaust(x, zR - 0.06, 0.045));
  }
  if (style === "spyder") {
    // windscreen frame, roll hoops behind the seats, humped rear deck, low screen top
    const f = cab[cab.length - 1];
    const t = cab[cab.length - 2];
    extraTrim.push(box(W * 0.86, 0.04, 0.05, 0, t[1], t[0]));
    for (const sx of [1, -1]) {
      const len = Math.hypot(f[0] - t[0], f[1] - t[1]);
      const g = new THREE.BoxGeometry(0.05, 0.05, len);
      g.rotateX(Math.atan2(t[1] - f[1], f[0] - t[0]) - Math.PI);
      g.translate(sx * W * 0.43, (f[1] + t[1]) / 2, (f[0] + t[0]) / 2);
      extraTrim.push(g);
      const hump = new THREE.CylinderGeometry(0.16, 0.2, 0.9, 12, 1, false, 0, Math.PI);
      hump.rotateX(Math.PI / 2);
      hump.rotateZ(-Math.PI / 2);
      hump.translate(sx * W * 0.21, P.belt * H - 0.02, -0.3 * L);
      extraPaint.push(hump);
      extraTrim.push(box(0.05, 0.36, 0.05, sx * W * 0.21, P.belt * H + 0.16, -0.1 * L));
    }
    extraTrim.push(box(W * 0.5, 0.05, 0.05, 0, P.belt * H + 0.33, -0.1 * L));
  }
  if (style === "pickup") {
    // the open bed seen from above, bed rails, tailgate seam, roll bar behind the cab
    const bedZ0 = zR + 0.08;
    const bedZ1 = -0.07 * L;
    extraTrim.push(box(W * 0.84, 0.012, bedZ1 - bedZ0, 0, P.belt * H + 0.012, (bedZ0 + bedZ1) / 2));
    for (const sx of [1, -1]) extraTrim.push(box(0.06, 0.05, bedZ1 - bedZ0, sx * W * 0.45, P.belt * H + 0.03, (bedZ0 + bedZ1) / 2));
    extraTrim.push(box(W * 0.9, 0.012, 0.02, 0, P.belt * H - 0.12, zR - 0.012));
    for (const sx of [1, -1]) extraTrim.push(box(0.06, 0.42, 0.06, sx * W * 0.4, P.belt * H + 0.21, bedZ1 - 0.12));
    extraTrim.push(box(W * 0.86, 0.06, 0.06, 0, P.belt * H + 0.42, bedZ1 - 0.12));
  }
  if (style === "offroad") {
    // fender flares, bull bar, roof rack, snorkel, spare wheel on the tailgate
    for (const sx of [1, -1]) {
      for (const az of [-wb / 2, wb / 2]) {
        extraTrim.push(box(0.12, 0.07, archR * 2.3, sx * (W / 2 + 0.03), r * 2 + 0.1, az));
        for (const e of [-1, 1]) extraTrim.push(box(0.12, 0.22, 0.07, sx * (W / 2 + 0.03), r + 0.24, az + e * archR * 1.12));
      }
      extraTrim.push(box(0.05, 0.05, L * 0.6, sx * W * 0.42, ry + 0.12, -0.08 * L));
    }
    extraTrim.push(box(W * 0.9, 0.06, 0.06, 0, by + 0.25, zF + 0.16));
    for (const sx of [1, -1]) extraTrim.push(box(0.06, 0.4, 0.06, sx * W * 0.3, by + 0.08, zF + 0.16));
    for (let k = 0; k < 4; k++) extraTrim.push(box(W * 0.8, 0.03, 0.04, 0, ry + 0.15, -0.35 * L + k * 0.16 * L));
    extraTrim.push(box(0.1, 0.62, 0.1, -W / 2 - 0.02, P.belt * H + 0.25, cab[cab.length - 1][0] - 0.05));
    const sp = new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.26, 18);
    sp.rotateX(Math.PI / 2);
    sp.translate(0, 0.55 * H, zR - 0.15);
    extraTrim.push(sp);
  }
  if (style === "van") {
    extraTrim.push(box(0.012, 0.95 * H - 0.5, 0.02, -W / 2 - 0.012, 0.6 * H, -0.05 * L));
    extraTrim.push(box(0.012, 0.95 * H - 0.5, 0.02, -W / 2 - 0.012, 0.6 * H, -0.32 * L));
    extraTrim.push(box(0.02, 0.95 * H - 0.4, 0.012, 0, 0.6 * H, zR - 0.012));
  }
  const geo = {
    paint: extraPaint.length ? mergeGeometries([paint, ...extraPaint.map((g) => g.toNonIndexed())]) : paint,
    chrome: chrome.length ? sculpt(mergeGeometries(chrome.map((g) => g.toNonIndexed())), L, W, H, P.belt * H, 0) : null,
    glass,
    trim: sculpt(mergeGeometries([...trim, ...extraTrim].map((g) => g.toNonIndexed())), L, W, H, P.belt * H, 0),
    under,
    inner: innerG,
    head: sculpt(mergeGeometries(head.map((g) => g.toNonIndexed())), L, W, H, P.belt * H, 0),
    tail: sculpt(mergeGeometries(tail.map((g) => g.toNonIndexed())), L, W, H, P.belt * H, 0),
    plates,
    white: extraWhite.length ? mergeGeometries(extraWhite.map((g) => g.toNonIndexed())) : null,
    sign,
    bar,
    stripe: style === "muscle",
    r,
    wheel: wheelGeometry(r, style),
    tyreW: TYRE_W[style] || 0.24,
    seatY,
    seatZ,
    dashZ,
    ry,
    W,
    L,
    H,
    wb,
  };
  S.geo.set(type, geo);
  return geo;
}

function wheelGeometry(r, style) {
  const w = TYRE_W[style] || 0.24;
  // low-profile tyres on sports cars (bigger rims), chunky sidewalls off-road
  const rimK = { super: 0.76, track: 0.76, gt: 0.74, spyder: 0.72, lux: 0.7, luxsuv: 0.7, offroad: 0.56, pickup: 0.6, mini: 0.6 }[style] || 0.66;
  const tyre = new THREE.CylinderGeometry(r, r, w, 22, 1);
  tyre.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * rimK, r * rimK, w + 0.01, 18, 1);
  rim.rotateZ(Math.PI / 2);
  const spokes = [];
  const n = SPOKES[style] || 5;
  for (let i = 0; i < n; i++) {
    const s = new THREE.BoxGeometry(0.03, r * rimK * 1.8, n > 8 ? 0.035 : 0.05);
    s.rotateX((i / n) * Math.PI);
    s.translate(w / 2 + 0.008, 0, 0);
    spokes.push(s.toNonIndexed());
  }
  return { tyre, rim, spokes: mergeGeometries(spokes) };
}

/**
 * Build one vehicle model. Returns { group, body, wheels[], update(v, t, night), dispose() }.
 */
export function createCarModel(v, opts = {}) {
  const S = shared();
  const G = buildGeometry(v.type);
  const group = new THREE.Group();
  const body = new THREE.Group(); // suspension (pitch / roll / bounce) moves this
  group.add(body);
  const paint = paintMaterial(v.paint);
  const headMat = new THREE.MeshStandardMaterial({ color: "#fffbe8", emissive: "#fff2c4", emissiveIntensity: 0.15, roughness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: "#7a0d10", emissive: "#ff1a1a", emissiveIntensity: 0.25, roughness: 0.3 });
  const mk = (geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && !!opts.shadows;
    m.receiveShadow = false;
    body.add(m);
    return m;
  };
  const paintMesh = mk(G.paint, paint);
  mk(G.glass, S.glass, false);
  mk(G.trim, S.trim);
  mk(G.under, S.under, false);
  const inner = mk(G.inner, S.interior, false);
  mk(G.head, headMat, false);
  mk(G.tail, tailMat, false);
  mk(G.plates, S.plate, false);
  if (G.chrome) mk(G.chrome, S.chrome, false);
  if (G.white) mk(G.white, v.type === "muscle" ? S.white : S.white, false);
  let signMesh = null;
  if (G.sign) signMesh = mk(G.sign, S.taxiSign, false);
  let barL = null;
  let barR = null;
  if (G.bar) {
    const red = new THREE.MeshStandardMaterial({ color: "#5a0000", emissive: "#ff2020", emissiveIntensity: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: "#00105a", emissive: "#2050ff", emissiveIntensity: 0.2 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(G.bar.w, 0.07, 0.24), S.trim);
    base.position.set(0, G.bar.y - 0.03, -0.1);
    body.add(base);
    barL = new THREE.Mesh(new THREE.BoxGeometry(G.bar.w * 0.45, 0.1, 0.22), red);
    barL.position.set(G.bar.w * 0.25, G.bar.y + 0.04, -0.1);
    barR = new THREE.Mesh(new THREE.BoxGeometry(G.bar.w * 0.45, 0.1, 0.22), blue);
    barR.position.set(-G.bar.w * 0.25, G.bar.y + 0.04, -0.1);
    body.add(barL, barR);
  }
  // wheels: hub (steer) → spin → tyre + rim
  const wheels = [];
  const rimMat = v.type === "police" || v.type === "van" || v.type === "offroad" || v.type === "track" || v.type === "pickup" ? S.darkRim : S.rim;
  for (const [sx, front] of [[1, 1], [-1, 1], [1, 0], [-1, 0]]) {
    const hub = new THREE.Group();
    hub.position.set(sx * (G.W / 2 - G.tyreW / 2 - 0.05), G.r, front ? G.wb / 2 : -G.wb / 2 + (v.type === "van" ? -0.1 : 0));
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(G.wheel.tyre, S.tyre);
    tyre.castShadow = !!opts.shadows;
    const rim = new THREE.Mesh(G.wheel.rim, rimMat);
    const spokes = new THREE.Mesh(G.wheel.spokes, rimMat);
    spokes.scale.x = sx;
    spin.add(tyre, rim, spokes);
    hub.add(spin);
    group.add(hub);
    wheels.push({ hub, spin, front: !!front });
  }
  // soft contact shadow
  const sh = new THREE.Mesh(sharedPlane(), S.shadow);
  sh.rotation.x = -Math.PI / 2;
  sh.scale.set(G.W * 1.5, G.L * 1.25, 1);
  sh.position.y = 0.03;
  sh.renderOrder = -1;
  group.add(sh);
  // a driver mannequin slot (renderer parents people here)
  const seat = new THREE.Group();
  seat.position.set(G.W * 0.21, G.seatY + 0.06, G.seatZ + 0.05);
  body.add(seat);
  const passenger = new THREE.Group();
  passenger.position.set(-G.W * 0.21, G.seatY + 0.06, G.seatZ + 0.05);
  body.add(passenger);

  let lastPaint = v.paint;
  let wreckT = 0;
  const model = {
    group,
    body,
    seat,
    passenger,
    wheels,
    inner,
    geo: G,
    update(veh, t, night, dt, alpha = 1) {
      if (veh.paint !== lastPaint) {
        lastPaint = veh.paint;
        paintMesh.material = paintMaterial(veh.paint);
      }
      if (veh.wrecked && !wreckT) {
        wreckT = 1;
        paintMesh.material = paintMaterial("#2a2523");
      } else if (!veh.wrecked && wreckT) {
        wreckT = 0;
        paintMesh.material = paintMaterial(veh.paint);
      }
      // drawn between the previous and the current physics step (see Sim.snapshot)
      const P = veh._prev;
      const k = P ? alpha : 1;
      const L = (a, b) => (P ? a + (b - a) * k : b);
      const dh = P ? Math.atan2(Math.sin(veh.h - P.h), Math.cos(veh.h - P.h)) : 0;
      group.position.set(L(P?.x, veh.x), L(P?.y, veh.y), L(P?.z, veh.z));
      // heading first, then the hill pitch about the car's own lateral axis
      group.rotation.set(-L(P?.slope, veh.slope || 0), P ? P.h + dh * k : veh.h, 0, "YXZ");
      body.position.y = L(P?.bounce, veh.bounce || 0);
      body.rotation.x = -L(P?.pitch, veh.pitch || 0);
      body.rotation.z = L(P?.roll, veh.roll || 0);
      const wr = L(P?.wheelRot, veh.wheelRot);
      const ws = L(P?.steer, veh.wheelSteer || 0);
      for (const w of wheels) {
        w.spin.rotation.x = wr;
        if (w.front) w.hub.rotation.y = -ws;
      }
      const lights = veh.lights && !veh.wrecked;
      headMat.emissiveIntensity = lights ? 2.2 : night ? 0.25 : 0.12;
      tailMat.emissiveIntensity = veh.wrecked ? 0 : veh.brakeLight ? 2.4 : lights ? 0.9 : 0.2;
      if (veh.reverseLight) headMat.emissiveIntensity = Math.max(headMat.emissiveIntensity, 0.8);
      if (signMesh) S.taxiSign.emissiveIntensity = night ? 1.2 : 0.4;
      if (barL) {
        const on = veh.siren;
        const ph = Math.floor(t * 6) % 2;
        barL.material.emissiveIntensity = on ? (ph ? 4 : 0.2) : 0.15;
        barR.material.emissiveIntensity = on ? (ph ? 0.2 : 4) : 0.15;
      }
      void dt;
    },
    setDetail(level) {
      inner.visible = level === 0;
      for (const w of wheels) w.spin.children[2].visible = level === 0;
    },
    dispose() {
      headMat.dispose();
      tailMat.dispose();
      if (barL) {
        barL.material.dispose();
        barR.material.dispose();
        barL.geometry.dispose();
        barR.geometry.dispose();
      }
    },
  };
  return model;
}
let PLANE = null;
const sharedPlane = () => PLANE || (PLANE = new THREE.PlaneGeometry(1, 1));

export function disposeCarCache() {
  if (!SHARED) return;
  for (const G of SHARED.geo.values()) {
    for (const k of ["paint", "glass", "trim", "under", "inner", "head", "tail", "plates", "white", "sign", "chrome"]) G[k]?.dispose?.();
    G.wheel.tyre.dispose();
    G.wheel.rim.dispose();
    G.wheel.spokes.dispose();
  }
  for (const m of SHARED.paints.values()) m.dispose();
  for (const k of ["glass", "tyre", "rim", "darkRim", "trim", "chrome", "interior", "seat", "plate", "white", "under", "shadow"]) SHARED[k].dispose();
  SHARED.taxiSign.map.dispose();
  SHARED.taxiSign.dispose();
  SHARED.shadow.map?.dispose();
  PLANE?.dispose();
  PLANE = null;
  SHARED = null;
}
