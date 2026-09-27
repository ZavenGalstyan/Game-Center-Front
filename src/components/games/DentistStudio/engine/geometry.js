/**
 * Dentist Studio — mouth geometry (pure math, no DOM).
 *
 * The treatment view is a stylised FRONT view of an open mouth in a fixed
 * world space (WORLD.w x WORLD.h units). Each jaw is 12 crowns — central,
 * lateral, canine, two premolars and a molar per side — laid out along an
 * arch: teeth further round the arch are pushed back in depth, so they get
 * smaller, foreshortened and pulled toward the mouth's vertical centre.
 *
 * Every tooth is ONE polygon in tooth-local units (x ∈ [-w/2, w/2], y from
 * under the gum (-GUM_HIDE) to the biting edge (h)). The renderer draws
 * exactly this polygon and the engine hit-tests exactly this polygon, so
 * what the player sees and what the tool treats can never disagree.
 *
 * Tooth ids follow the patient's perspective: `upper-right-1` is the
 * patient's right upper central incisor (which sits on the viewer's LEFT).
 */

export const WORLD = { w: 1000, h: 660, cx: 500, cy: 350 };
export const GRID_W = 24;
export const GRID_H = 32;
export const GUM_HIDE = 14;

const F = 950; // perspective focal length (world units)
const GAP = 3; // tiny gap between neighbouring crowns

const KINDS = ["central", "lateral", "canine", "premolar", "premolar", "molar"];

export const JAWS = {
  upper: { dir: 1, gumY: 196, R: 520, dims: [[82, 106], [66, 94], [66, 104], [60, 88], [58, 84], [76, 80]] },
  lower: { dir: -1, gumY: 500, R: 470, dims: [[56, 86], [58, 88], [62, 98], [60, 86], [60, 82], [78, 76]] },
};

export const KIND_LABEL = { central: "front tooth", lateral: "front tooth", canine: "canine", premolar: "premolar", molar: "molar" };

/* ------------------------------------------------------------ polygons */

function chaikin(pts, iterations) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p;
}

/**
 * Crown outline control points (then Chaikin-smoothed). Left side runs down
 * from under the gum, the biting edge is shaped per tooth type, the right
 * side runs back up; the top edge is hidden under the gum.
 */
function crownOutline(kind, w, h, jaw) {
  const hw = w / 2;
  const top = -GUM_HIDE;
  const lowerJaw = jaw === "lower";
  let side;
  let edge;
  switch (kind) {
    case "central":
      side = [[0.74, top], [0.84, h * 0.22], [0.97, h * 0.58], [0.99, h * 0.84]];
      edge = lowerJaw
        ? [[0.9, h * 0.97], [0.5, h * 1.0], [0, h * 1.0]]
        : [[0.88, h * 0.98], [0.5, h * 1.01], [0, h * 1.015]];
      break;
    case "lateral":
      side = [[0.72, top], [0.84, h * 0.26], [0.96, h * 0.62], [0.93, h * 0.86]];
      edge = [[0.74, h * 0.97], [0.36, h * 1.0], [0, h * 1.0]];
      break;
    case "canine":
      side = [[0.7, top], [0.88, h * 0.26], [0.99, h * 0.56], [0.84, h * 0.78]];
      edge = [[0.56, h * 0.9], [0.22, h * 0.98], [0, h * 1.0]];
      break;
    case "premolar":
      side = [[0.7, top], [0.9, h * 0.26], [0.99, h * 0.6], [0.88, h * 0.84]];
      edge = [[0.62, h * 0.95], [0.26, h * 0.99], [0, h * 1.0]];
      break;
    default: // molar — two soft cusps
      side = [[0.78, top], [0.94, h * 0.28], [0.99, h * 0.66], [0.9, h * 0.9]];
      edge = [[0.66, h * 1.0], [0.38, h * 0.99], [0.14, h * 0.92], [0, h * 0.91]];
      break;
  }
  const left = [...side, ...edge].map(([u, y]) => [-u * hw, y]);
  const right = [...side, ...edge].reverse().map(([u, y]) => [u * hw, y]);
  // de-duplicate the shared centre point
  right.shift();
  return chaikin([...left, ...right], 3);
}

/** Gum line in tooth-local y: highest at the tooth centre, dipping between teeth. */
export function gumEdge(lx, hw) {
  const u = lx / hw;
  return -2 + 14 * u * u;
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Squared distance from point to segment. */
export function dist2ToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

/* -------------------------------------------------------------- layout */

function layoutJaw(jaw) {
  const J = JAWS[jaw];
  const teeth = [];
  for (const side of [-1, 1]) {
    let edgeX = WORLD.cx + (side * GAP) / 2;
    let arc = 0;
    J.dims.forEach(([w, h], i) => {
      const sMid = arc + w / 2;
      const th = sMid / J.R;
      const z = J.R * (1 - Math.cos(th));
      const p = F / (F + z);
      const fore = 0.55 + 0.45 * Math.cos(th);
      const sx = p * fore;
      const sy = p;
      const appW = w * sx;
      const x = edgeX + (side * appW) / 2;
      edgeX += side * (appW + GAP * p);
      arc += w + GAP;
      const yGum = WORLD.cy + (J.gumY - WORLD.cy) * p;
      const id = `${jaw}-${side < 0 ? "right" : "left"}-${i + 1}`;
      teeth.push({ id, jaw, side, index: i, kind: KINDS[i], w, h, sx, sy, x, yGum, dir: J.dir, z, p });
    });
  }
  // screen order, left → right
  teeth.sort((a, b) => a.x - b.x);
  return teeth;
}

/** local → world */
export function toWorld(t, lx, ly) {
  return [t.x + lx * t.sx, t.yGum + t.dir * ly * t.sy];
}
/** world → local */
export function toLocal(t, x, y) {
  return [(x - t.x) / t.sx, ((y - t.yGum) * t.dir) / t.sy];
}

function buildTooth(base) {
  const t = { ...base };
  const hw = t.w / 2;
  t.poly = crownOutline(t.kind, t.w, t.h, t.jaw);
  t.wpoly = t.poly.map(([lx, ly]) => toWorld(t, lx, ly));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of t.wpoly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  t.bbox = { minX, minY, maxX, maxY };
  t.appW = maxX - minX;
  // cell grid over the local rect [-hw, hw] x [-GUM_HIDE, h]
  const n = GRID_W * GRID_H;
  t.n = n;
  t.cw = t.w / GRID_W;
  t.ch = (t.h + GUM_HIDE) / GRID_H;
  t.valid = new Uint8Array(n);
  t.cellX = new Float32Array(n);
  t.cellY = new Float32Array(n);
  t.cellU = new Float32Array(n); // -1..1 across the crown
  t.cellV = new Float32Array(n); // 0 at the gum .. 1 at the biting edge
  let vc = 0;
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) {
      const k = j * GRID_W + i;
      const lx = -hw + (i + 0.5) * t.cw;
      const ly = -GUM_HIDE + (j + 0.5) * t.ch;
      const [wx, wy] = toWorld(t, lx, ly);
      t.cellX[k] = wx;
      t.cellY[k] = wy;
      t.cellU[k] = lx / hw;
      t.cellV[k] = Math.max(0, Math.min(1, ly / t.h));
      if (ly > gumEdge(lx, hw) + 0.6 && pointInPoly(lx, ly, t.poly)) {
        t.valid[k] = 1;
        vc++;
      }
    }
  }
  t.vc = vc;
  return t;
}

/** Scalloped gum band for a jaw, as a world polygon. */
function gumPolygon(teeth, jaw) {
  const dir = JAWS[jaw].dir;
  const margin = [];
  for (const t of teeth) {
    const hw = t.w / 2;
    for (let s = 0; s <= 10; s++) {
      const lx = -hw + (s / 10) * t.w;
      margin.push(toWorld(t, lx, gumEdge(lx, hw)));
    }
  }
  const first = teeth[0];
  const last = teeth[teeth.length - 1];
  const band = (t) => 74 * t.p;
  const out = [];
  // extend beyond the outer molars toward the cheeks
  out.push([first.bbox.minX - 60, first.yGum + dir * 18]);
  out.push(...margin);
  out.push([last.bbox.maxX + 60, last.yGum + dir * 18]);
  out.push([last.bbox.maxX + 60, last.yGum - dir * band(last)]);
  for (let i = teeth.length - 1; i >= 0; i--) {
    const t = teeth[i];
    out.push([t.x, t.yGum - dir * band(t)]);
  }
  out.push([first.bbox.minX - 60, first.yGum - dir * band(first)]);
  out.margin = margin;
  return out;
}

/** Superellipse mouth opening (inner lip line), sampled. `smile` curls the corners up. */
export function mouthOpening(M, smile = 0, samples = 120) {
  const pts = [];
  const n = 2.7;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = M.cx + M.rx * Math.sign(c) * Math.abs(c) ** (2 / n);
    let y = M.cy + (s < 0 ? M.ryTop : M.ryBot) * Math.sign(s) * Math.abs(s) ** (2 / n);
    const ex = Math.abs(x - M.cx) / M.rx;
    y -= smile * 26 * ex ** 5;
    pts.push([x, y]);
  }
  return pts;
}

let cached = null;

/** The (static) mouth layout. Teeth are fresh objects each call; geometry is shared. */
export function buildMouth() {
  if (!cached) {
    const upper = layoutJaw("upper").map(buildTooth);
    const lower = layoutJaw("lower").map(buildTooth);
    const all = [...upper, ...lower];
    const minX = Math.min(...all.map((t) => t.bbox.minX));
    const maxX = Math.max(...all.map((t) => t.bbox.maxX));
    const M = {
      cx: WORLD.cx,
      cy: 356,
      rx: (maxX - minX) / 2 + 70,
      ryTop: 356 - 128,
      ryBot: 590 - 356,
    };
    cached = {
      upper,
      lower,
      gums: { upper: gumPolygon(upper, "upper"), lower: gumPolygon(lower, "lower") },
      mouth: M,
      opening: mouthOpening(M),
      tongue: { cx: WORLD.cx, cy: 440, rx: 262, ry: 88 },
      pool: { cx: WORLD.cx, cy: 402 },
    };
  }
  return cached;
}

/** Every tooth, screen order within each jaw (upper first). */
export function allTeeth(mouth) {
  return [...mouth.upper, ...mouth.lower];
}

/** Human-friendly screen-space description of a tooth ("lower left back teeth"). */
export function describeTooth(t) {
  const jaw = t.jaw === "upper" ? "upper" : "lower";
  const rel = t.x - WORLD.cx;
  const side = Math.abs(rel) < 70 ? "" : rel < 0 ? " left" : " right";
  const group = t.index <= 1 ? "front" : t.index === 2 ? "side" : "back";
  if (group === "front") return `${jaw} front teeth`;
  return `${jaw}${side} ${group} teeth`;
}

/** The gaps between neighbouring crowns (floss targets). */
export function buildGaps(mouth) {
  const gaps = [];
  for (const jaw of ["upper", "lower"]) {
    const row = mouth[jaw];
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i];
      const b = row[i + 1];
      const x = (a.bbox.maxX + b.bbox.minX) / 2;
      const dir = a.dir;
      const reach = Math.min(a.h * a.sy, b.h * b.sy);
      // start below the papilla (the gum dips between crowns)
      const y0 = dir > 0 ? Math.max(a.yGum, b.yGum) : Math.min(a.yGum, b.yGum);
      const yA = y0 + dir * 14;
      const yB = y0 + dir * reach * 0.86;
      gaps.push({
        id: `${a.id}|${b.id}`,
        jaw,
        a: a.id,
        b: b.id,
        x,
        yMin: Math.min(yA, yB),
        yMax: Math.max(yA, yB),
        front: a.index <= 2 && b.index <= 2,
      });
    }
  }
  return gaps;
}
