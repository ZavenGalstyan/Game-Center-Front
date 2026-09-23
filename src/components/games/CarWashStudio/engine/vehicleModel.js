/**
 * Car Wash Studio — vehicle model builder (pure JS, Node-importable).
 *
 * Turns a body design (data/bodies.js) + a job's variant tweaks into:
 *
 *   views   left | right | front | rear — every shape the painter needs, in
 *           VIEW UNITS (1 m = 100 u, y pointing down, ground at y = 0).
 *   panels  logical surfaces (hood, roof, doors, glass, wheels...). Each has
 *           ONE mask in its own pixel space (see engine/surface.js).
 *   regions where a panel appears in a view: clip polygons + the affine that
 *           maps the panel's mask pixels into that view.
 *
 * A panel may appear in more than one view (the roof is seen from the front
 * and from the rear; a mirror from the side and the front; a wheel in its
 * side view and — zoomed — in the wheel detail view). All of them read and
 * write the same mask, so dirt can never "come back" after a view change.
 *
 * The front / rear views are derived from the side profile with a fixed
 * elevated projection, so hood length, windshield rake and roof line agree
 * across every view of the same car.
 */
import { BODIES } from "../data/bodies.js";
import {
  spline, splineClosed, arc, ellipse, roundRect, rect, bbox, band, mapPoly, boxAffine, unionBox,
} from "./geom.js";

const U = 100; // view units per meter
const TILT = (16 * Math.PI) / 180;
const DEPTH = 0.55; // foreshortening of depth in the elevated front/rear views
const CT = Math.cos(TILT);
const ST = Math.sin(TILT);

/** mask pixels per view unit, by material */
const DENSITY = { paint: 1.5, glass: 1.4, wheel: 3.2, trim: 2.4, mirror: 2.4 };

const SIDE_NAMES = { L: "left", R: "right" };

function intersectBoxes(polys) {
  let b = null;
  for (const p of polys) {
    const q = bbox(p);
    if (!b) b = q;
    else {
      const x0 = Math.max(b.x0, q.x0);
      const y0 = Math.max(b.y0, q.y0);
      const x1 = Math.min(b.x1, q.x1);
      const y1 = Math.min(b.y1, q.y1);
      b = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    }
  }
  return b;
}

/* ================================================================== side */

function buildSide(b, d) {
  const S = (p) => [p[0] * d.sx, p[1] * d.sy, p[2]];
  const toV = (x, y) => [x * U, -y * U];
  const V = (poly) => mapPoly(poly, toV);

  const wr = b.wheel.r * d.sr;
  const archR = b.wheel.arch * d.sr;
  const fx = b.wheel.fx * d.sx;
  const rx = b.wheel.rx * d.sx;
  const acy = wr + 0.03 * d.sr;
  const sill = b.sill * d.sy;
  const a0 = 0.16;

  const frontC = spline(b.front.map(S), 10);
  const roofC = spline(b.roof.map(S), 10);
  const rearC = spline(b.rear.map(S), 10);
  const rearArch = arc(rx, acy, archR, -a0, Math.PI + a0, 28);
  const frontArch = arc(fx, acy, archR, -a0, Math.PI + a0, 28);
  const outline = V([
    ...frontC,
    ...roofC.slice(1),
    ...rearC.slice(1),
    ...rearArch,
    [rx - archR * 0.97, sill],
    [fx + archR * 0.97, sill],
    ...frontArch,
  ]);

  const dlo = V(splineClosed(b.dlo.map(S), 8, 0.45));
  const pillars = b.pillars.map((p) => V(p.map(S)));
  const doorLines = b.doorLines.map((l) => V(spline(l.map(S), 6)));

  const [mx, my] = S(b.mirror);
  const mirror = V(splineClosed([
    [mx - 0.02 * d.sx, my], [mx + 0.01 * d.sx, my + 0.09 * d.sy], [mx + 0.12 * d.sx, my + 0.135 * d.sy],
    [mx + 0.25 * d.sx, my + 0.11 * d.sy, 1], [mx + 0.26 * d.sx, my + 0.03 * d.sy], [mx + 0.12 * d.sx, my - 0.005 * d.sy],
  ], 6));
  const mirrorGlass = V(splineClosed([
    [mx + 0.03 * d.sx, my + 0.02 * d.sy], [mx + 0.045 * d.sx, my + 0.085 * d.sy], [mx + 0.12 * d.sx, my + 0.11 * d.sy],
    [mx + 0.2 * d.sx, my + 0.09 * d.sy], [mx + 0.2 * d.sx, my + 0.03 * d.sy],
  ], 5));

  const wheels = [
    { pos: "F", cx: fx * U, cy: -wr * U, r: wr * U, rimR: wr * U * b.wheel.rim, arch: archR * U, acy: -acy * U },
    { pos: "R", cx: rx * U, cy: -wr * U, r: wr * U, rimR: wr * U * b.wheel.rim, arch: archR * U, acy: -acy * U },
  ];

  const side = {
    outline,
    dlo,
    pillars,
    doorLines,
    splitX: b.splitX * d.sx * U,
    noSideGlass: !!b.noSideGlass,
    handles: b.handles.map((h) => toV(...S(h))),
    fuel: b.fuel ? toV(...S(b.fuel)) : null,
    mirror,
    mirrorGlass,
    headlight: V(splineClosed(b.headlight.map(S), 5)),
    taillight: V(splineClosed(b.taillight.map(S), 5)),
    character: V(spline(b.character.map(S), 8)),
    trunkLine: b.trunkLine ? V(spline(b.trunkLine.map(S), 6)) : null,
    wheels,
    sill: -sill * U,
    L: b.L * d.sx * U,
    H: b.H * d.sy * U,
    spoiler: !!b.spoiler,
    cladding: !!b.cladding,
    roofRails: b.roofRails ? b.roofRails.map((x) => x * d.sx * U) : null,
    bed: b.bed ? { x0: b.bed.x0 * d.sx * U, x1: b.bed.x1 * d.sx * U, y: -b.bed.y * d.sy * U } : null,
    slideTrack: b.slideTrack ? [b.slideTrack[0] * d.sx * U, b.slideTrack[1] * d.sx * U, -b.slideTrack[2] * d.sy * U] : null,
    headrests: b.headrests ? b.headrests.map((h) => toV(...S(h))) : null,
    open: !!b.open,
    frontLowY: -b.front[0][1] * d.sy * U,
  };
  side.bbox = bbox(outline);
  // lower plastic lips / rocker: thin bands along the bottom, drawn dark
  side.rocker = [
    [fx * U + archR * U * 0.97, -sill * U],
    [rx * U - archR * U * 0.97, -sill * U],
    [rx * U - archR * U * 1.0, -(sill + 0.065 * d.sy) * U],
    [fx * U + archR * U * 1.0, -(sill + 0.065 * d.sy) * U],
  ];
  return side;
}

function mirrorSide(s) {
  const mx = (p) => [-p[0], p[1]];
  const M = (poly) => poly.map(mx);
  const out = {
    ...s,
    outline: M(s.outline),
    dlo: M(s.dlo),
    pillars: s.pillars.map(M),
    doorLines: s.doorLines.map(M),
    splitX: -s.splitX,
    handles: s.handles.map(mx),
    fuel: null, // fuel door only on one side
    mirror: M(s.mirror),
    mirrorGlass: M(s.mirrorGlass),
    headlight: M(s.headlight),
    taillight: M(s.taillight),
    character: M(s.character),
    trunkLine: s.trunkLine ? M(s.trunkLine) : null,
    wheels: s.wheels.map((w) => ({ ...w, cx: -w.cx })),
    rocker: M(s.rocker),
    roofRails: s.roofRails ? s.roofRails.map((x) => -x) : null,
    bed: s.bed ? { x0: -s.bed.x1, x1: -s.bed.x0, y: s.bed.y } : null,
    slideTrack: s.slideTrack ? [-s.slideTrack[1], -s.slideTrack[0], s.slideTrack[2]] : null,
    headrests: s.headrests ? s.headrests.map(mx) : null,
    mirrored: true,
  };
  out.bbox = bbox(out.outline);
  return out;
}

/* =========================================================== front / rear */

const P = (depth, y) => -(y * CT + depth * ST * DEPTH) * U; // projected, view units (y down)
const pw = (depth) => 1 - depth * 0.035;

/** mirror a right-half point list into a full closed polygon (left half reversed) */
function sym(right) {
  const left = right.map((p) => [-p[0], p[1], p[2]]).reverse();
  return [...right, ...left];
}

function roofU(g0, yb, g1, yt, r1, ytop, pil0, pil1) {
  // inverted-U: roof across the top, pillars down both sides of the glass
  const k = 0.18 * (ytop - yt);
  return [
    [-(g0 + pil0), yb], [-(g1 + pil1), yt], [-(r1 + (g1 + pil1 - r1) * 0.2), yt + (ytop - yt) * 0.45],
    [-r1 * 0.97, ytop - k], [-r1 * 0.8, ytop], [r1 * 0.8, ytop], [r1 * 0.97, ytop - k],
    [r1 + (g1 + pil1 - r1) * 0.2, yt + (ytop - yt) * 0.45], [g1 + pil1, yt], [g0 + pil0, yb],
    [g0, yb], [g1, yt], [-g1, yt], [-g0, yb],
  ];
}

function buildFront(b, d, dims) {
  const S = (p) => [p[0] * d.sx, p[1] * d.sy];
  const hw = (dims.W / 2) * U;
  const yb = P(0, b.front[0][1] * d.sy);
  const [hfx, hfy] = S(b.fv.hf);
  const [cx, cyy] = S(b.fv.cowl);
  const [ax, ay] = S(b.fv.aTop);
  const [rex, rey] = S(b.fv.roofEnd);
  const yF = P(hfx, hfy);
  const yC = P(cx, cyy);
  const yA = P(ax, ay);
  const yR = P(rex, rey);
  const h = yb - yF; // positive height of the face

  const face = splineClosed(sym([
    [0.8 * hw, yb, 1], [0.965 * hw, yb - 0.1 * h], [1.0 * hw, yb - 0.46 * h], [0.985 * hw, yb - 0.83 * h], [0.93 * hw, yF, 1],
  ]).map((p, i, arr) => (i === 0 || i === arr.length - 1 ? [p[0], p[1], 1] : p)), 8, 0.45);

  const hb = 0.93 * hw;
  const ht = 0.8 * hw * pw(cx);
  const hood = splineClosed([
    [-hb, yF, 1], [hb, yF, 1], [hb * 0.985, yF + (yC - yF) * 0.35], [ht, yC, 1], [-ht, yC, 1], [-hb * 0.985, yF + (yC - yF) * 0.35],
  ], 6, 0.3);

  const g0 = 0.78 * hw * pw(cx);
  const g1 = 0.68 * hw * pw(ax);
  const windshield = [[-g0, yC], [g0, yC], [g1, yA], [-g1, yA]];
  const r1 = 0.63 * hw * pw(rex);
  const roof = b.open ? null : splineClosed(roofU(g0, yC, g1, yA, r1, yR, 0.075 * hw, 0.06 * hw).map((p, i) => [p[0], p[1], i >= 10 || i === 0 || i === 9 ? 1 : 0]), 5, 0.35);
  const frame = b.open ? roofU(g0, yC, g1, yA, g1 * 0.98, yA, 0.05 * hw, 0.05 * hw).slice(0, 10) : null;

  const my0 = yC + 0.02 * U;
  const mirrors = [1, -1].map((sgn) => splineClosed([
    [sgn * (g0 + 0.04 * hw), my0 - 0.02 * U], [sgn * (g0 + 0.3 * U), my0 - 0.035 * U], [sgn * (g0 + 0.33 * U), my0 - 0.12 * U],
    [sgn * (g0 + 0.29 * U), my0 - 0.17 * U], [sgn * (g0 + 0.1 * U), my0 - 0.16 * U], [sgn * (g0 + 0.04 * hw), my0 - 0.1 * U],
  ], 5));

  const tireW = 0.12 * U;
  const tireX = 0.84 * hw;
  const tires = [1, -1].map((sgn) => roundRect(sgn * tireX - tireW, yb - 0.24 * U, sgn * tireX + tireW, 0, 0.05 * U));

  const gTop = yb - 0.62 * h;
  const gBot = yb - 0.27 * h;
  const grilleStyle = b.fv.grille;
  const gw = grilleStyle === "wide" ? 0.7 : grilleStyle === "bars" ? 0.6 : 0.56;
  const grille = splineClosed([
    [-gw * hw, gTop, 1], [gw * hw, gTop, 1], [gw * 0.86 * hw, gBot, 1], [-gw * 0.86 * hw, gBot, 1],
  ], 3, 0.1);
  const slot = [[-0.44 * hw, yb - 0.86 * h], [0.44 * hw, yb - 0.86 * h], [0.4 * hw, yb - 0.76 * h], [-0.4 * hw, yb - 0.76 * h]];

  const lampStyle = b.fv.lamp;
  const headlights = [1, -1].map((sgn) => {
    let pts;
    if (lampStyle === "round") {
      return ellipse(sgn * 0.72 * hw, yb - 0.77 * h, 0.16 * hw, 0.13 * h, 20);
    }
    if (lampStyle === "square") {
      pts = [[0.5, 0.64], [0.93, 0.66], [0.93, 0.9], [0.52, 0.88]];
    } else if (lampStyle === "slim") {
      pts = [[0.48, 0.73], [0.94, 0.71], [0.93, 0.84], [0.54, 0.83]];
    } else {
      pts = [[0.46, 0.72], [0.8, 0.7], [0.95, 0.76], [0.93, 0.9], [0.56, 0.86]];
    }
    return splineClosed(pts.map(([x, f]) => [sgn * x * hw, yb - f * h]), 4, 0.25);
  });
  const intakes = [1, -1].map((sgn) => roundRect(
    Math.min(sgn * 0.66 * hw, sgn * 0.88 * hw), yb - 0.27 * h, Math.max(sgn * 0.66 * hw, sgn * 0.88 * hw), yb - 0.13 * h, 0.03 * U,
  ));
  const plateH = 0.11 * U;
  const plate = roundRect(-0.26 * U, yb - 0.07 * h - plateH, 0.26 * U, yb - 0.07 * h, 0.012 * U);

  const view = {
    face, hood, windshield, roof, frame, mirrors, tires, grille, slot, headlights, intakes, plate,
    yb, yF, yC, yA, yR, hw, g0, g1, open: !!b.open, grilleStyle, lampStyle,
    cockpit: b.open ? [[-g1, yA], [g1, yA], [0.66 * hw, yR], [-0.66 * hw, yR]] : null,
  };
  view.bbox = [face, hood, windshield, roof || windshield, ...mirrors, ...tires].map(bbox).reduce(unionBox);
  return view;
}

function buildRear(b, d, dims) {
  const S = (p) => [p[0] * d.sx, p[1] * d.sy];
  const L = dims.L;
  const dr = (x) => L - x;
  const hw = (dims.W / 2) * U;
  const rv = b.rv;
  const yb = P(0, b.rear[b.rear.length - 1][1] * d.sy);
  const [tx, ty] = S(rv.tailTop);
  const yT = P(dr(tx), ty);
  const h = yb - yT;

  let glassBottomY = yT;
  let deckTopHalf = 0.9 * hw;
  let deck = null;
  if (rv.deck && rv.glassBottom) {
    const [gbx, gby] = S(rv.glassBottom);
    glassBottomY = P(dr(gbx), gby);
    deckTopHalf = 0.84 * hw * pw(dr(gbx));
    deck = [glassBottomY, deckTopHalf];
  }
  const right = [[0.8 * hw, yb, 1], [0.965 * hw, yb - 0.1 * h], [1.0 * hw, yb - 0.5 * h], [0.97 * hw, yT + 0.08 * h], [0.9 * hw, yT, deck ? 0 : 1]];
  if (deck) right.push([deckTopHalf, deck[0], 1]);
  const faceRaw = sym(right);
  const face = splineClosed(faceRaw, 7, 0.4);

  let bedArea = null;
  if (rv.bed) {
    const [bx, by] = S(rv.bed);
    const yBed = P(dr(bx), by);
    bedArea = [[-0.86 * hw, yT], [0.86 * hw, yT], [0.8 * hw * pw(dr(bx)), yBed], [-0.8 * hw * pw(dr(bx)), yBed]];
    glassBottomY = yBed;
    deckTopHalf = 0.8 * hw * pw(dr(bx));
  }

  let glass = null;
  let roof = null;
  let yGT = glassBottomY;
  let yRT = glassBottomY;
  const [ax, ay] = S(b.fv.aTop);
  if (rv.glassTop) {
    const [gx, gy] = S(rv.glassTop);
    yGT = P(dr(gx), gy);
    const g0 = (rv.bed ? 0.58 : 0.78) * hw * pw(dr(gx) * 0.3);
    const g1 = (rv.bed ? 0.56 : 0.68) * hw * pw(dr(gx));
    glass = [[-g0, glassBottomY], [g0, glassBottomY], [g1, yGT], [-g1, yGT]];
    yRT = P(dr(ax), ay);
    const r1 = 0.63 * hw * pw(dr(ax));
    const pil0 = Math.max(0.06 * hw, deckTopHalf - g0);
    roof = splineClosed(roofU(g0, glassBottomY, g1, yGT, r1, yRT, pil0, 0.07 * hw).map((p, i) => [p[0], p[1], i >= 10 || i === 0 || i === 9 ? 1 : 0]), 5, 0.35);
  }

  const lamp = rv.lamp;
  const taillights = [1, -1].map((sgn) => {
    let pts;
    if (lamp === "round") return ellipse(sgn * 0.7 * hw, yT + 0.2 * h, 0.12 * hw, 0.1 * h, 18);
    if (lamp === "bar") pts = [[0.2, yT + 0.05 * h], [0.9, yT + 0.03 * h], [0.94, yT + 0.2 * h], [0.2, yT + 0.2 * h]];
    else if (lamp === "vertical") pts = [[0.84, yT + 0.02 * h], [0.97, yT + 0.04 * h], [0.99, yT + 0.46 * h], [0.86, yT + 0.46 * h]];
    else pts = [[0.58, yT + 0.08 * h], [0.93, yT + 0.03 * h], [0.97, yT + 0.3 * h], [0.66, yT + 0.24 * h]];
    return splineClosed(pts.map(([x, y]) => [sgn * x * hw, y]), 3, 0.2);
  });
  const plateH = 0.11 * U;
  const plateY = yT + 0.46 * h;
  const plate = roundRect(-0.26 * U, plateY, 0.26 * U, plateY + plateH, 0.012 * U);
  const bumperLine = yb - 0.36 * h;
  const exhaust = ellipse(0.56 * hw, yb - 0.03 * U, 0.065 * U, 0.038 * U, 22);
  const tireW = 0.12 * U;
  const tireX = 0.84 * hw;
  const tires = [1, -1].map((sgn) => roundRect(sgn * tireX - tireW, yb - 0.24 * U, sgn * tireX + tireW, 0, 0.05 * U));

  const view = {
    face, glass, roof, taillights, plate, bumperLine, exhaust, tires, bedArea,
    yb, yT, yGB: glassBottomY, yGT, yRT, hw, deck: !!deck, wiper: !!rv.wiper, barn: !!rv.barn, open: !!b.open,
    headrestY: b.open ? P(dr(S(b.headrests ? b.headrests[0] : [2.6, 0.9])[0]), 1.05 * d.sy) : null,
    frontFrameY: b.open ? P(dr(ax), ay) : null,
  };
  view.bbox = [face, roof || face, glass || face, ...tires].map(bbox).reduce(unionBox);
  if (b.open) view.bbox = unionBox(view.bbox, { x0: -hw, x1: hw, y0: view.frontFrameY, y1: 0, w: 2 * hw, h: -view.frontFrameY });
  return view;
}

/* ================================================================ panels */

function makePanel(panels, id, material, label, extra = {}) {
  panels[id] = { id, material, label, regions: [], ...extra };
  return panels[id];
}

function addRegion(panels, regions, panelId, view, include, exclude = [], opts = {}) {
  const panel = panels[panelId];
  const box = opts.box || intersectBoxes(include);
  const region = { panel: panelId, view, include, exclude, box, flipX: !!opts.flipX, flipY: !!opts.flipY, primary: !panel.primaryBox };
  if (!panel.primaryBox) {
    panel.primaryBox = box;
    panel.primaryView = view;
    const dens = DENSITY[panel.material] || 1.5;
    panel.w = Math.max(8, Math.ceil(box.w * dens));
    panel.h = Math.max(8, Math.ceil(box.h * dens));
  }
  region.aff = boxAffine(panel.w, panel.h, box, region.flipX, region.flipY);
  regions.push(region);
  panel.regions.push(region);
  return region;
}

export function buildVehicle(spec) {
  const b = BODIES[spec.body];
  if (!b) throw new Error(`unknown body ${spec.body}`);
  const d = { sx: spec.sx ?? 1, sy: spec.sy ?? 1, sr: spec.sr ?? spec.sy ?? 1 };
  const dims = { L: b.L * d.sx, H: b.H * d.sy, W: b.W * (spec.sw ?? d.sx) };

  const left = buildSide(b, d);
  const right = mirrorSide(left);
  const front = buildFront(b, d, dims);
  const rear = buildRear(b, d, dims);

  const panels = {};
  const regions = [];
  const nDoors = left.doorLines.length; // 3 lines → 4 body panels, 2 → 3
  const bodyIds = nDoors >= 3 ? ["fender", "doorF", "doorR", "quarter"] : ["fender", "doorF", "quarter"];
  const bodyLabels = {
    fender: "front fender", doorF: nDoors >= 3 ? "front door" : "door", doorR: "rear door",
    quarter: b.bed ? "bed side" : "rear quarter panel",
  };

  for (const side of ["L", "R"]) {
    const sv = side === "L" ? left : right;
    const vname = side === "L" ? "left" : "right";
    const sgn = side === "L" ? 1 : -1;
    const sideName = SIDE_NAMES[side];

    makePanel(panels, `mirror${side}`, "paint", `${sideName} mirror`, { side });
    // body side panels between the door cut lines
    const lines = sv.doorLines.map((l) => (sgn === 1 ? l : l));
    const farL = [[-1e4, -1e4], [-1e4, 1e4]];
    const farR = [[1e4, -1e4], [1e4, 1e4]];
    for (let i = 0; i < bodyIds.length; i++) {
      const id = `${bodyIds[i]}${side}`;
      makePanel(panels, id, "paint", `${sideName} ${bodyLabels[bodyIds[i]]}`, { side, zone: bodyIds[i] });
      let la = i === 0 ? farL : lines[i - 1];
      let lb = i === bodyIds.length - 1 ? farR : lines[i];
      if (sgn === -1) {
        // mirrored view: the front is on the right, lines run the other way
        la = i === 0 ? farR : lines[i - 1];
        lb = i === bodyIds.length - 1 ? farL : lines[i];
        [la, lb] = [lb, la];
      }
      const bandPoly = band(la, lb);
      addRegion(panels, regions, id, vname, [sv.outline, bandPoly], [sv.dlo, sv.mirror]);
    }
    // side glass
    if (!sv.noSideGlass) {
      const splitAbs = sv.splitX;
      const leftOf = rect(-1e4, -1e4, splitAbs, 1e4);
      const rightOf = rect(splitAbs, -1e4, 1e4, 1e4);
      const frontSide = sgn === 1 ? leftOf : rightOf;
      const rearSide = sgn === 1 ? rightOf : leftOf;
      const hasRear = Math.abs(splitAbs) < 9000 && (sgn === 1 ? splitAbs < sv.bbox.x1 : splitAbs > sv.bbox.x0);
      makePanel(panels, `winF${side}`, "glass", `${sideName} ${hasRear ? "front " : ""}side window`, { side, zone: "winF" });
      addRegion(panels, regions, `winF${side}`, vname, hasRear ? [sv.dlo, frontSide] : [sv.dlo], [...sv.pillars, sv.mirror]);
      if (hasRear) {
        makePanel(panels, `winR${side}`, "glass", `${sideName} rear side window`, { side, zone: "winR" });
        addRegion(panels, regions, `winR${side}`, vname, [sv.dlo, rearSide], sv.pillars);
      }
    }
    addRegion(panels, regions, `mirror${side}`, vname, [sv.mirror]);
    // wheels
    for (const w of sv.wheels) {
      const id = `wheel${w.pos}${side}`;
      makePanel(panels, id, "wheel", `${w.pos === "F" ? "front" : "rear"}-${sideName} wheel`, { side, wheel: w });
      addRegion(panels, regions, id, vname, [ellipse(w.cx, w.cy, w.r, w.r, 48)]);
    }
  }

  // FRONT
  makePanel(panels, "bumperF", "paint", "front bumper");
  addRegion(panels, regions, "bumperF", "front", [front.face], [front.grille]);
  makePanel(panels, "grille", "trim", "front grille", { optionalOnly: true });
  addRegion(panels, regions, "grille", "front", [front.grille]);
  makePanel(panels, "hood", "paint", "hood");
  addRegion(panels, regions, "hood", "front", [front.hood]);
  makePanel(panels, "windshield", "glass", "windshield");
  addRegion(panels, regions, "windshield", "front", [front.windshield]);
  if (front.roof) {
    makePanel(panels, "roof", "paint", "roof");
    addRegion(panels, regions, "roof", "front", [front.roof]);
  }
  // mirrors seen head-on reuse the side mirror masks
  addRegion(panels, regions, "mirrorL", "front", [front.mirrors[1]]);
  addRegion(panels, regions, "mirrorR", "front", [front.mirrors[0]]);

  // REAR
  makePanel(panels, "bumperR", "paint", b.bed ? "tailgate" : "rear end");
  addRegion(panels, regions, "bumperR", "rear", [rear.face], [rear.exhaust]);
  if (rear.glass) {
    makePanel(panels, "rearGlass", "glass", "rear window");
    addRegion(panels, regions, "rearGlass", "rear", [rear.glass]);
  }
  if (rear.roof && panels.roof) addRegion(panels, regions, "roof", "rear", [rear.roof], [], { flipX: true, flipY: true });
  makePanel(panels, "exhaust", "trim", "exhaust tip", { optionalOnly: true });
  addRegion(panels, regions, "exhaust", "rear", [rear.exhaust]);

  const views = { left, right, front, rear };
  for (const v of Object.keys(views)) views[v].regions = regions.filter((r) => r.view === v);

  return { spec, body: spec.body, bodyDef: b, dims, views, panels, regions };
}

/** Rough label for a view, used by hints. */
export const VIEW_LABEL = { left: "left side", right: "right side", front: "front", rear: "rear", wheel: "wheel view", cabin: "front cabin", rearCabin: "rear seats", trunk: "trunk" };
