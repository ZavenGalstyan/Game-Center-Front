/**
 * Delivery Rush — ground, carriageway, kerbs and road paint.
 *
 * Roads are ribbons generated from the layout centrelines, so the same code
 * handles the grid streets of Central City and the curving coast road of
 * Sunset Coast. Everything is drawn as flat quads at carefully separated
 * heights instead of relying on polygon offset:
 *
 *   0.000  terrain
 *   0.018  alley / narrow / street / main asphalt (staggered by type)
 *   0.026  junction patch — hides the double-drawn overlap AND the lane paint
 *   0.034  lane markings, stop lines
 *   0.038  crosswalks and bay paint
 *   0.160  kerb top / sidewalk / park level
 *
 * That ordering is what makes intersections read correctly: paint runs up to
 * the junction and stops, exactly like real road marking.
 */

import { makeRng } from "../utils/rng.js";
import { shade, mix } from "./palette.js";
import { SIDEWALK_W, CURB_H } from "./cityBuilder.js";

const Y_ROAD = { alley: 0.016, narrow: 0.018, service: 0.019, street: 0.02, main: 0.022 };
const Y_JUNCTION = 0.027;
const Y_PAINT = 0.034;
const Y_CROSS = 0.039;
const Y_WALK = CURB_H;

/** Terrain + any tagged ground surfaces (grass, sand, lots, water). */
export function drawGround(ch, layout, theme, detail) {
  const b = layout.bounds;
  const pad = 260; // runs out past the district so the horizon is never empty
  ch.ground.quadY(b.minX - pad, b.minZ - pad, b.maxX + pad, b.maxZ + pad, -0.02, theme.ground);

  const r = makeRng(97);
  if (detail >= 1) {
    // broad tonal patches so the ground is never one flat colour
    for (let i = 0; i < 26; i++) {
      const x = r.range(b.minX - 60, b.maxX + 60);
      const z = r.range(b.minZ - 60, b.maxZ + 60);
      const w = r.range(20, 70);
      const d = r.range(20, 70);
      ch.ground.quadY(x, z, x + w, z + d, -0.012, theme.groundAlt);
    }
  }

  for (const s of layout.surfaces) {
    if (s.noRender) continue;
    switch (s.kind) {
      case "water":
        ch.water.quadY(s.x0, s.z0, s.x1, s.z1, s.pond ? Y_WALK - 0.03 : -0.05, theme.water);
        break;
      case "sand":
        ch.ground.quadY(s.x0, s.z0, s.x1, s.z1, 0.006, theme.sand);
        if (detail >= 1) {
          for (let i = 0; i < 22; i++) {
            const x = r.range(s.x0, s.x1 - 8);
            const z = r.range(s.z0, s.z1 - 6);
            ch.ground.quadY(x, z, x + r.range(4, 12), z + r.range(3, 8), 0.008, shade(theme.sand, 1.06));
          }
        }
        break;
      case "grass":
        ch.ground.quadY(s.x0, s.z0, s.x1, s.z1, 0.004, theme.grass);
        break;
      case "lot":
        ch.road.quadY(s.x0, s.z0, s.x1, s.z1, 0.014, shade(theme.asphalt, 1.06));
        break;
      default:
        break;
    }
  }
}

/** Carriageway ribbons + kerb-side gutter tone. */
export function drawRoads(ch, layout, theme, detail) {
  const r = makeRng(31);
  for (const road of layout.roads) {
    const y = Y_ROAD[road.type] ?? 0.02;
    const len = Math.hypot(road.bx - road.ax, road.bz - road.az);
    if (len < 0.5) continue;
    const ux = (road.bx - road.ax) / len;
    const uz = (road.bz - road.az) / len;
    const px = uz;
    const pz = -ux;
    const hw = road.w / 2;

    const A = [road.ax + px * hw, road.az + pz * hw];
    const B = [road.bx + px * hw, road.bz + pz * hw];
    const C = [road.bx - px * hw, road.bz - pz * hw];
    const D = [road.ax - px * hw, road.az - pz * hw];
    ch.road.quadYPoints(A, B, C, D, y, theme.asphalt);

    if (detail >= 1) {
      // gutter strips: subtly darker asphalt where the road meets the kerb
      const g = 1.1;
      ch.road.quadYPoints(
        A, B,
        [B[0] - px * g, B[1] - pz * g], [A[0] - px * g, A[1] - pz * g],
        y + 0.002, theme.asphaltAlt,
      );
      ch.road.quadYPoints(
        [D[0] + px * g, D[1] + pz * g], [C[0] + px * g, C[1] + pz * g],
        C, D,
        y + 0.002, theme.asphaltAlt,
      );
      // occasional resurfacing patches
      const patches = Math.floor(len / 55);
      for (let i = 0; i < patches; i++) {
        const t = r.range(0.1, 0.9);
        const cxp = road.ax + ux * len * t;
        const czp = road.az + uz * len * t;
        const pw = r.range(2.5, 5);
        const pl = r.range(4, 11);
        ch.road.quadYPoints(
          [cxp + ux * pl + px * pw, czp + uz * pl + pz * pw],
          [cxp - ux * pl + px * pw, czp - uz * pl + pz * pw],
          [cxp - ux * pl - px * pw, czp - uz * pl - pz * pw],
          [cxp + ux * pl - px * pw, czp + uz * pl - pz * pw],
          y + 0.003,
          shade(theme.asphalt, r.range(0.88, 1.12)),
        );
      }
    }
  }

  // intersection patch — laid over the overlap so paint stops at the junction
  for (const j of layout.junctions) {
    ch.road.quadY(j.x - j.hw, j.z - j.hd, j.x + j.hw, j.z + j.hd, Y_JUNCTION, shade(theme.asphalt, 1.03));
  }
}

/** Centre lines, lane dividers, edge lines and stop bars. */
export function drawMarkings(ch, layout, theme, detail) {
  const inJunction = (x, z, pad = 1.5) =>
    layout.junctions.some(
      (j) => x > j.x - j.hw - pad && x < j.x + j.hw + pad && z > j.z - j.hd - pad && z < j.z + j.hd + pad,
    );

  const stripe = (cx, cz, ux, uz, half, width, col, y = Y_PAINT) => {
    const px = uz * (width / 2);
    const pz = -ux * (width / 2);
    ch.paint.quadYPoints(
      [cx + ux * half + px, cz + uz * half + pz],
      [cx - ux * half + px, cz - uz * half + pz],
      [cx - ux * half - px, cz - uz * half - pz],
      [cx + ux * half - px, cz + uz * half - pz],
      y,
      col,
    );
  };

  for (const road of layout.roads) {
    if (road.type === "alley") continue;
    const len = Math.hypot(road.bx - road.ax, road.bz - road.az);
    if (len < 6) continue;
    const ux = (road.bx - road.ax) / len;
    const uz = (road.bz - road.az) / len;
    const px = uz;
    const pz = -ux;
    const hw = road.w / 2;
    const main = road.type === "main";

    // dashed centre line (solid double on main roads)
    const dash = 2.4;
    const gap = 3.2;
    for (let t = 3; t < len - 3; t += dash + gap) {
      const cx = road.ax + ux * (t + dash / 2);
      const cz = road.az + uz * (t + dash / 2);
      if (inJunction(cx, cz)) continue;
      if (main) {
        stripe(cx + px * 0.32, cz + pz * 0.32, ux, uz, dash * 1.6, 0.16, theme.marking);
        stripe(cx - px * 0.32, cz - pz * 0.32, ux, uz, dash * 1.6, 0.16, theme.marking);
      } else {
        stripe(cx, cz, ux, uz, dash / 2, 0.17, theme.marking);
      }
    }

    // lane divider on multi-lane roads
    if (main) {
      for (const side of [-1, 1]) {
        for (let t = 3; t < len - 3; t += dash + gap) {
          const cx = road.ax + ux * (t + dash / 2) + px * side * (hw * 0.5);
          const cz = road.az + uz * (t + dash / 2) + pz * side * (hw * 0.5);
          if (inJunction(cx, cz)) continue;
          stripe(cx, cz, ux, uz, dash / 2, 0.14, shade(theme.marking, 0.92));
        }
      }
    }

    // continuous edge lines
    if (detail >= 1) {
      const step = 6;
      for (let t = 1; t < len - 1; t += step) {
        for (const side of [-1, 1]) {
          const cx = road.ax + ux * (t + step / 2) + px * side * (hw - 0.55);
          const cz = road.az + uz * (t + step / 2) + pz * side * (hw - 0.55);
          if (inJunction(cx, cz, 0.5)) continue;
          stripe(cx, cz, ux, uz, step / 2, 0.13, shade(theme.marking, 0.78));
        }
      }
    }
  }

  // stop bars on every junction approach
  for (const j of layout.junctions) {
    const b = 0.55;
    ch.paint.quadY(j.x - j.hw + 0.4, j.z + j.hd + 0.6, j.x - 0.35, j.z + j.hd + 0.6 + b, Y_PAINT, theme.marking);
    ch.paint.quadY(j.x + 0.35, j.z - j.hd - 0.6 - b, j.x + j.hw - 0.4, j.z - j.hd - 0.6, Y_PAINT, theme.marking);
    ch.paint.quadY(j.x - j.hw - 0.6 - b, j.z - j.hd + 0.4, j.x - j.hw - 0.6, j.z - 0.35, Y_PAINT, theme.marking);
    ch.paint.quadY(j.x + j.hw + 0.6, j.z + 0.35, j.x + j.hw + 0.6 + b, j.z + j.hd - 0.4, Y_PAINT, theme.marking);
  }
}

/** Crosswalks, parking bays, park paths and lot outlines. */
export function drawDecals(ch, layout, theme, detail) {
  for (const d of layout.decals) {
    switch (d.kind) {
      case "crosswalk": {
        const along = d.axis === 0 ? "x" : "z";
        const w = d.x1 - d.x0;
        const h = d.z1 - d.z0;
        const n = Math.max(2, Math.floor((along === "x" ? w : h) / 1.15));
        for (let i = 0; i < n; i++) {
          const f0 = i / n + 0.09 / n;
          const f1 = (i + 1) / n - 0.32 / n;
          if (along === "x") {
            ch.paint.quadY(d.x0 + w * f0, d.z0, d.x0 + w * f1, d.z1, Y_CROSS, theme.marking);
          } else {
            ch.paint.quadY(d.x0, d.z0 + h * f0, d.x1, d.z0 + h * f1, Y_CROSS, theme.marking);
          }
        }
        break;
      }
      case "bay":
        ch.paint.quadY(d.x0, d.z0, d.x0 + 0.13, d.z1, Y_CROSS, shade(theme.marking, 0.85));
        ch.paint.quadY(d.x1 - 0.13, d.z0, d.x1, d.z1, Y_CROSS, shade(theme.marking, 0.85));
        ch.paint.quadY(d.x0, d.z1 - 0.13, d.x1, d.z1, Y_CROSS, shade(theme.marking, 0.85));
        break;
      case "lot":
        ch.paint.quadY(d.x0, d.z0, d.x1, d.z0 + 0.18, Y_CROSS, shade(theme.marking, 0.7));
        ch.paint.quadY(d.x0, d.z1 - 0.18, d.x1, d.z1, Y_CROSS, shade(theme.marking, 0.7));
        break;
      case "path":
        ch.road.quadY(d.x0, d.z0, d.x1, d.z1, Y_WALK + 0.004, theme.path);
        break;
      default:
        break;
    }
  }
}

/** Kerbs, pavement slabs, paving pattern and park lawns. */
export function drawSidewalks(ch, layout, theme, detail) {
  const r = makeRng(613);
  for (const wk of layout.walks) {
    const { x0, z0, x1, z1 } = wk;
    const kerb = theme.curb;

    // kerb faces: a raised ring the player can feel when they clip a corner
    ch.opaque.boxRect(x0, z0 - 0.001, x1, z0 + 0.34, 0, Y_WALK, kerb);
    ch.opaque.boxRect(x0, z1 - 0.34, x1, z1 + 0.001, 0, Y_WALK, kerb);
    ch.opaque.boxRect(x0 - 0.001, z0, x0 + 0.34, z1, 0, Y_WALK, kerb);
    ch.opaque.boxRect(x1 - 0.34, z0, x1 + 0.001, z1, 0, Y_WALK, kerb);

    if (wk.park) {
      // pavement border, lawn in the middle
      const inner = wk.inner;
      ch.ground.quadY(x0, z0, x1, inner.z0, Y_WALK, theme.sidewalk);
      ch.ground.quadY(x0, inner.z1, x1, z1, Y_WALK, theme.sidewalk);
      ch.ground.quadY(x0, inner.z0, inner.x0, inner.z1, Y_WALK, theme.sidewalk);
      ch.ground.quadY(inner.x1, inner.z0, x1, inner.z1, Y_WALK, theme.sidewalk);
      ch.ground.quadY(inner.x0, inner.z0, inner.x1, inner.z1, Y_WALK - 0.01, theme.grass);
      if (detail >= 1) {
        for (let i = 0; i < 18; i++) {
          const gx = r.range(inner.x0, inner.x1 - 9);
          const gz = r.range(inner.z0, inner.z1 - 7);
          ch.ground.quadY(gx, gz, gx + r.range(5, 11), gz + r.range(4, 9), Y_WALK - 0.006, shade(theme.grass, 1.07));
        }
      }
      continue;
    }

    ch.ground.quadY(x0, z0, x1, z1, Y_WALK, theme.sidewalk);

    if (detail >= 1) {
      // paving joints: alternating tone bands along each pavement edge
      const step = 2.4;
      for (let x = x0; x < x1 - step; x += step * 2) {
        ch.ground.quadY(x, z0 + 0.34, Math.min(x + step, x1), z0 + SIDEWALK_W, Y_WALK + 0.004, theme.sidewalkAlt);
        ch.ground.quadY(x, z1 - SIDEWALK_W, Math.min(x + step, x1), z1 - 0.34, Y_WALK + 0.004, theme.sidewalkAlt);
      }
      for (let z = z0; z < z1 - step; z += step * 2) {
        ch.ground.quadY(x0 + 0.34, z, x0 + SIDEWALK_W, Math.min(z + step, z1), Y_WALK + 0.004, theme.sidewalkAlt);
        ch.ground.quadY(x1 - SIDEWALK_W, z, x1 - 0.34, Math.min(z + step, z1), Y_WALK + 0.004, theme.sidewalkAlt);
      }
    }

    if (theme.snow) {
      // ploughed snow banked against the kerb
      const s = 1.0;
      ch.ground.boxRect(x0 + 0.2, z0 + 0.2, x1 - 0.2, z0 + s, Y_WALK, 0.16, theme.snowCol);
      ch.ground.boxRect(x0 + 0.2, z1 - s, x1 - 0.2, z1 - 0.2, Y_WALK, 0.16, theme.snowCol);
      ch.ground.boxRect(x0 + 0.2, z0 + 0.2, x0 + s, z1 - 0.2, Y_WALK, 0.16, theme.snowCol);
      ch.ground.boxRect(x1 - s, z0 + 0.2, x1 - 0.2, z1 - 0.2, Y_WALK, 0.16, theme.snowCol);
    }
  }
}
