/**
 * Car Wash Studio — interior model (pure JS, Node-importable).
 *
 * Three stylised interior camera views, each a 1000 x 560 view-unit scene:
 *   cabin      from the rear bench looking forward: windshield (inside),
 *              dashboard, vents, center console + cup holders, footwell
 *              mats, the backs of the front seats
 *   rearCabin  from the front seats looking back: rear window, rear bench
 *              back + cushion, rear floor mats
 *   trunk      cargo floor seen through the open tailgate
 *
 * Same panel / region / mask contract as the exterior, so the same brush
 * engine, compositor, progress and hints work unchanged.
 */
import { splineClosed, ellipse, roundRect, bbox, boxAffine } from "./geom.js";

const DENS = { dash: 0.8, vent: 1.4, fabric: 0.8, leather: 0.8, carpet: 0.75, iglass: 0.7 };

function makePanel(panels, id, material, label, task) {
  panels[id] = { id, material, label, task, regions: [] };
}

function addRegion(panels, regions, id, view, include, exclude = []) {
  const p = panels[id];
  const b = include.map(bbox).reduce((a, q) => (a ? { x0: Math.max(a.x0, q.x0), y0: Math.max(a.y0, q.y0), x1: Math.min(a.x1, q.x1), y1: Math.min(a.y1, q.y1) } : q), null);
  b.w = b.x1 - b.x0;
  b.h = b.y1 - b.y0;
  const primary = !p.primaryBox;
  if (primary) {
    p.primaryBox = b;
    p.primaryView = view;
    const d = DENS[p.material] || 1;
    p.w = Math.max(8, Math.ceil(b.w * d));
    p.h = Math.max(8, Math.ceil(b.h * d));
  }
  const r = { panel: id, view, include, exclude, box: b, primary, aff: boxAffine(p.w, p.h, b) };
  p.regions.push(r);
  regions.push(r);
}

export function buildInterior(spec, vehicleSpec) {
  const panels = {};
  const regions = [];
  const seatMat = spec.style === "leather" ? "leather" : "fabric";
  const views = {};

  /* ---------------------------------------------------------- cabin */
  const ws = splineClosed([[190, 26, 1], [810, 26, 1], [905, 188, 1], [95, 188, 1]], 4, 0.2);
  const dash = splineClosed([
    [40, 205, 1], [120, 178], [500, 166], [880, 178], [960, 205, 1], [955, 300], [900, 318, 1],
    [600, 322, 1], [400, 322, 1], [100, 318, 1], [45, 300],
  ], 6, 0.35);
  const vents = [
    roundRect(78, 222, 158, 262, 10), roundRect(842, 222, 922, 262, 10),
    roundRect(418, 236, 484, 268, 8), roundRect(516, 236, 582, 268, 8),
  ];
  const wheelHub = ellipse(300, 318, 34, 30, 24);
  const console_ = splineClosed([[405, 318, 1], [595, 318, 1], [625, 560, 1], [375, 560, 1]], 3, 0.15);
  const cups = [ellipse(466, 436, 24, 17, 22), ellipse(534, 436, 24, 17, 22)];
  const cupsZone = roundRect(432, 412, 568, 460, 20);
  const seatL = splineClosed([[30, 410], [70, 388], [290, 384], [322, 410], [335, 560, 1], [20, 560, 1]], 6, 0.35);
  const seatR = splineClosed([[678, 410], [710, 384], [930, 388], [970, 410], [980, 560, 1], [665, 560, 1]], 6, 0.35);
  const headL = roundRect(122, 330, 232, 398, 26);
  const headR = roundRect(768, 330, 878, 398, 26);
  const matL = splineClosed([[120, 330, 1], [398, 330, 1], [388, 470, 1], [100, 470, 1]], 3, 0.1);
  const matR = splineClosed([[602, 330, 1], [880, 330, 1], [900, 470, 1], [612, 470, 1]], 3, 0.1);

  makePanel(panels, "iWindshield", "iglass", "inside of the windshield", "iglass");
  addRegion(panels, regions, "iWindshield", "cabin", [ws]);
  makePanel(panels, "dash", "dash", "dashboard", "dash");
  addRegion(panels, regions, "dash", "cabin", [dash], [...vents, wheelHub]);
  vents.forEach((v, i) => {
    makePanel(panels, `vent${i}`, "vent", i < 2 ? `${i === 0 ? "left" : "right"} air vent` : "center air vents", "vent");
    addRegion(panels, regions, `vent${i}`, "cabin", [v]);
  });
  makePanel(panels, "console", "dash", "center console", "dash");
  addRegion(panels, regions, "console", "cabin", [console_], [cupsZone]);
  makePanel(panels, "cups", "dash", "cup holders", "cups");
  addRegion(panels, regions, "cups", "cabin", [cupsZone]);
  makePanel(panels, "matFL", "carpet", "driver floor mat", "floor");
  addRegion(panels, regions, "matFL", "cabin", [matL], [seatL, headL]);
  makePanel(panels, "matFR", "carpet", "passenger floor mat", "floor");
  addRegion(panels, regions, "matFR", "cabin", [matR], [seatR, headR]);
  makePanel(panels, "seatFL", seatMat, "driver seat", "seat");
  addRegion(panels, regions, "seatFL", "cabin", [seatL]);
  makePanel(panels, "seatFR", seatMat, "passenger seat", "seat");
  addRegion(panels, regions, "seatFR", "cabin", [seatR]);

  views.cabin = {
    kind: "cabin", ws, dash, vents, wheelHub, console: console_, cups, cupsZone, seatL, seatR, headL, headR, matL, matR,
    bbox: { x0: 0, y0: 0, x1: 1000, y1: 560, w: 1000, h: 560 },
    trashZones: [matL, matR], crumbZones: [matL, matR, seatL, seatR],
  };

  /* ------------------------------------------------------ rear cabin */
  if (spec.rows >= 2) {
    const rw = splineClosed([[250, 34, 1], [750, 34, 1], [815, 150, 1], [185, 150, 1]], 4, 0.2);
    const back = splineClosed([[120, 205], [170, 168], [500, 160], [830, 168], [880, 205], [890, 330, 1], [110, 330, 1]], 6, 0.35);
    const cushion = splineClosed([[95, 330, 1], [905, 330, 1], [925, 400], [880, 425, 1], [120, 425, 1], [75, 400]], 6, 0.35);
    const mL = splineClosed([[110, 440, 1], [455, 440, 1], [445, 560, 1], [85, 560, 1]], 3, 0.1);
    const mR = splineClosed([[545, 440, 1], [890, 440, 1], [915, 560, 1], [555, 560, 1]], 3, 0.1);
    makePanel(panels, "iRearGlass", "iglass", "inside of the rear window", "iglass");
    addRegion(panels, regions, "iRearGlass", "rearCabin", [rw]);
    makePanel(panels, "benchBack", seatMat, "rear seat back", "seat");
    addRegion(panels, regions, "benchBack", "rearCabin", [back]);
    makePanel(panels, "bench", seatMat, "rear seat cushion", "seat");
    addRegion(panels, regions, "bench", "rearCabin", [cushion]);
    makePanel(panels, "matRL", "carpet", "rear-left floor mat", "floor");
    addRegion(panels, regions, "matRL", "rearCabin", [mL]);
    makePanel(panels, "matRR", "carpet", "rear-right floor mat", "floor");
    addRegion(panels, regions, "matRR", "rearCabin", [mR]);
    views.rearCabin = {
      kind: "rearCabin", rw, back, cushion, mL, mR,
      heads: [roundRect(190, 118, 290, 176, 22), roundRect(450, 122, 550, 172, 22), roundRect(710, 118, 810, 176, 22)],
      bbox: { x0: 0, y0: 0, x1: 1000, y1: 560, w: 1000, h: 560 },
      trashZones: [cushion, mL, mR], crumbZones: [cushion, mL, mR],
    };
  }

  /* ----------------------------------------------------------- trunk */
  if (spec.trunk) {
    const floor = splineClosed([[190, 250, 1], [810, 250, 1], [915, 520, 1], [85, 520, 1]], 3, 0.1);
    makePanel(panels, "trunkFloor", "carpet", "trunk floor", "trunk");
    addRegion(panels, regions, "trunkFloor", "trunk", [floor]);
    views.trunk = {
      kind: "trunk", floor,
      bbox: { x0: 0, y0: 0, x1: 1000, y1: 560, w: 1000, h: 560 },
      trashZones: [floor], crumbZones: [floor],
    };
  }

  for (const v of Object.keys(views)) views[v].regions = regions.filter((r) => r.view === v);
  return { spec, views, panels, regions, seatMat };
}
