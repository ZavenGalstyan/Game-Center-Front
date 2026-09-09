/**
 * Delivery Rush — grid helpers shared by the district layouts.
 *
 * Four of the five districts are built on an irregular street grid (the coast
 * road in Sunset Coast is the exception). These helpers lay the carriageways
 * and hand back the *inner* block rectangles — already inset by the road half
 * width and the sidewalk — so a layout file can get on with deciding what goes
 * in each block instead of doing arithmetic.
 */

import { ROAD_W, SIDEWALK_W } from "../cityBuilder.js";

/** Lay every road of a grid. `mainX` / `mainZ` are indices promoted to boulevards. */
export function gridRoads(b, xs, zs, { mainX = [], mainZ = [], type = "street" } = {}) {
  const z0 = zs[0];
  const z1 = zs[zs.length - 1];
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  xs.forEach((x, i) => b.road(x, z0, x, z1, mainX.includes(i) ? "main" : type));
  zs.forEach((z, j) => b.road(x0, z, x1, z, mainZ.includes(j) ? "main" : type));
}

export function halfWidths(coords, mains, type = "street") {
  return coords.map((_, i) => (mains.includes(i) ? ROAD_W.main : ROAD_W[type]) / 2);
}

/**
 * The buildable rectangle of grid cell (i, j) — the area a call to
 * builder.block() should cover.
 */
export function cell(xs, zs, hwX, hwZ, i, j, pad = 0) {
  return {
    x0: xs[i] + hwX[i] + SIDEWALK_W + pad,
    x1: xs[i + 1] - hwX[i + 1] - SIDEWALK_W - pad,
    z0: zs[j] + hwZ[j] + SIDEWALK_W + pad,
    z1: zs[j + 1] - hwZ[j + 1] - SIDEWALK_W - pad,
  };
}

/** Split a cell rect in two with a service alley running through it. */
export function splitCellX(b, rect, alleyType = "alley") {
  const mid = (rect.x0 + rect.x1) / 2;
  const hw = ROAD_W[alleyType] / 2;
  b.road(mid, rect.z0 - SIDEWALK_W - 6, mid, rect.z1 + SIDEWALK_W + 6, alleyType);
  return [
    { ...rect, x1: mid - hw - SIDEWALK_W },
    { ...rect, x0: mid + hw + SIDEWALK_W },
  ];
}

export function splitCellZ(b, rect, alleyType = "alley") {
  const mid = (rect.z0 + rect.z1) / 2;
  const hw = ROAD_W[alleyType] / 2;
  b.road(rect.x0 - SIDEWALK_W - 6, mid, rect.x1 + SIDEWALK_W + 6, mid, alleyType);
  return [
    { ...rect, z1: mid - hw - SIDEWALK_W },
    { ...rect, z0: mid + hw + SIDEWALK_W },
  ];
}

/** A marker position sitting in the near lane of a road, ready to drive into. */
export function kerbside(coord, hw, side, along) {
  return side > 0 ? coord + hw * 0.52 : coord - hw * 0.52;
}

/** Traffic lights on all four corners of a junction. */
export function signalise(b, x, z, hw, hd) {
  b.prop("traffic-light", x - hw - 1.6, z - hd - 1.6, 0);
  b.prop("traffic-light", x + hw + 1.6, z + hd + 1.6, Math.PI);
  b.prop("traffic-light", x - hw - 1.6, z + hd + 1.6, Math.PI / 2);
  b.prop("traffic-light", x + hw + 1.6, z - hd - 1.6, -Math.PI / 2);
}
