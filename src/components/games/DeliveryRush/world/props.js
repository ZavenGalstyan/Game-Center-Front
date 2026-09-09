/**
 * Delivery Rush — street furniture, planting and static vehicles.
 *
 * Same contract as buildings.js: props write triangles into the shared channel
 * accumulators instead of creating meshes, so a district full of lamp posts,
 * benches, hydrants and trees still costs no extra draw calls.
 *
 * Prop yaw follows the same convention as buildings: 0 means the prop faces
 * +Z, which the layout builder points at the road.
 */

import { makeRng } from "../utils/rng.js";
import { shade, mix } from "./palette.js";

export function drawProp(ch, p, theme, detail = 2) {
  const r = makeRng(Math.round((p.x * 73856093) ^ (p.z * 19349663)) >>> 0);
  const f = PROPS[p.kind];
  if (f) f(ch, p, theme, r, detail);
}

/* --------------------------------------------------------------- helpers */

/** Rotate a local offset into world space around the prop origin. */
function W(p, lx, ly, lz) {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return [p.x + lx * c + lz * s, ly, p.z - lx * s + lz * c];
}

function box(acc, p, lx, ly, lz, w, h, d, col) {
  acc.add("box", W(p, lx, ly, lz), [w, h, d], col, p.yaw);
}
function cyl(acc, p, name, lx, ly, lz, r, h, col, rot) {
  acc.add(name, W(p, lx, ly, lz), [r * 2, h, r * 2], col, rot ?? p.yaw);
}

/* ------------------------------------------------------------------ props */

const PROPS = {
  /**
   * Street lamp: tapered column, curved arm, luminaire. At night the head is
   * emissive and a soft additive disc is dropped on the road, which reads as
   * lighting for a fraction of the cost of a real point light.
   */
  streetlight(ch, p, theme, r, detail) {
    const s = p.scale || 1;
    const h = 6.4 * s;
    const metal = theme.metal;
    box(ch.opaque, p, 0, 0.1, 0, 0.52, 0.2, 0.52, shade(metal, 0.7));
    cyl(ch.opaque, p, "taper8", 0, h / 2, 0, 0.13 * s, h, metal);
    // arm reaching out over the carriageway
    box(ch.opaque, p, 0, h - 0.1, 0.62, 0.13, 0.16, 1.35, metal);
    box(ch.opaque, p, 0, h - 0.42, 1.2, 0.5, 0.22, 0.85, shade(metal, 0.85));
    ch.emissive.add("box", W(p, 0, h - 0.56, 1.2), [0.42, 0.08, 0.7], theme.lampLight);
    if (theme.night && ch.glow) {
      ch.glow.quadY(p.x - 5.2, p.z - 5.2 + 1.2, p.x + 5.2, p.z + 5.2 + 1.2, 0.045, theme.lampPool);
    }
    if (detail >= 2 && r() < 0.4) {
      // a small banner on the pole — the kind every city hangs
      box(ch.opaque, p, 0.28, h * 0.62, 0, 0.5, 1.2, 0.06, theme.signs[Math.floor(r() * theme.signs.length)]);
    }
  },

  "traffic-light": function (ch, p, theme, r, detail) {
    const metal = theme.metal;
    box(ch.opaque, p, 0, 0.12, 0, 0.6, 0.24, 0.6, shade(metal, 0.7));
    cyl(ch.opaque, p, "cyl8", 0, 2.6, 0, 0.14, 5.2, metal);
    box(ch.opaque, p, 0, 5.15, 0.9, 0.14, 0.14, 1.9, metal);
    // head hanging over the stop line
    box(ch.opaque, p, 0, 4.55, 1.75, 0.52, 1.35, 0.42, shade(metal, 0.6));
    const lights = [theme.tlRed, theme.tlAmber, theme.tlGreen];
    for (let i = 0; i < 3; i++) {
      ch.emissive.add("cyl8", W(p, 0, 5.02 - i * 0.42, 1.96), [0.26, 0.06, 0.26],
        i === 2 ? lights[i] : shade(lights[i], 0.28), [Math.PI / 2, p.yaw, 0]);
    }
    if (detail >= 1) {
      box(ch.opaque, p, 0, 3.3, 0.16, 0.5, 0.7, 0.16, shade(metal, 0.8)); // pedestrian head
      ch.emissive.add("box", W(p, 0, 3.3, 0.26), [0.3, 0.42, 0.05], theme.tlRed);
    }
  },

  /** Deciduous street tree: tapered trunk, two offset crown blobs. */
  tree(ch, p, theme, r, detail) {
    const s = (p.scale || 1) * (0.9 + r() * 0.35);
    const trunkH = 2.5 * s;
    cyl(ch.opaque, p, "taper8", 0, trunkH / 2, 0, 0.19 * s, trunkH, theme.trunk);
    const leaf = theme.trees[Math.floor(r() * theme.trees.length)];
    const cr = 1.9 * s;
    ch.foliage.add("ico1", [p.x, trunkH + cr * 0.62, p.z], [cr * 2, cr * 1.85, cr * 2], leaf, r() * 6.28);
    if (detail >= 1) {
      ch.foliage.add(
        "ico0",
        [p.x + (r() - 0.5) * cr * 0.8, trunkH + cr * 1.25, p.z + (r() - 0.5) * cr * 0.8],
        [cr * 1.25, cr * 1.15, cr * 1.25],
        shade(leaf, 1.14),
        r() * 6.28,
      );
    }
    if (theme.snow) {
      ch.foliage.add("ico0", [p.x, trunkH + cr * 1.35, p.z], [cr * 1.4, cr * 0.5, cr * 1.4], theme.snowCol, r() * 6.28);
    }
    if (detail >= 1) {
      // tree pit + grate so the trunk does not grow straight out of concrete
      ch.opaque.add("box", [p.x, 0.09, p.z], [1.5, 0.18, 1.5], shade(theme.curb, 0.85));
      ch.opaque.add("box", [p.x, 0.19, p.z], [1.2, 0.06, 1.2], theme.soil);
    }
  },

  pine(ch, p, theme, r, detail) {
    const s = (p.scale || 1) * (1.0 + r() * 0.4);
    const trunkH = 1.5 * s;
    cyl(ch.opaque, p, "taper8", 0, trunkH / 2, 0, 0.2 * s, trunkH, theme.trunk);
    const leaf = theme.trees[Math.floor(r() * theme.trees.length)];
    const tiers = 3;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const rr = (2.1 - t * 1.15) * s;
      const y = trunkH + i * 1.55 * s + 0.9 * s;
      ch.foliage.add("cone8", [p.x, y, p.z], [rr * 2, 2.5 * s, rr * 2], shade(leaf, 1 - i * 0.06), r());
      if (theme.snow) {
        ch.foliage.add("cone8", [p.x, y + 0.42 * s, p.z], [rr * 1.55, 1.1 * s, rr * 1.55], theme.snowCol, r());
      }
    }
  },

  palm(ch, p, theme, r, detail) {
    const s = (p.scale || 1) * (1.0 + r() * 0.3);
    const h = 6.5 * s;
    const lean = 0.06 + r() * 0.05;
    // segmented, slightly leaning trunk
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      const t = (i + 0.5) / segs;
      cyl(
        ch.opaque, p, "cyl6",
        Math.sin(p.yaw) * 0 + lean * h * t * 0.6, h * t, lean * h * t * 0.3,
        (0.24 - t * 0.09) * s, (h / segs) * 1.06, shade(theme.trunk, 1 - t * 0.1),
      );
    }
    const leaf = theme.trees[0];
    const tipX = lean * h * 0.6;
    const tipZ = lean * h * 0.3;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r();
      ch.foliage.add(
        "cone6",
        [p.x + tipX + Math.cos(a) * 1.7 * s, h + 0.15 * s - 0.35 * s, p.z + tipZ + Math.sin(a) * 1.7 * s],
        [1.15 * s, 3.5 * s, 0.42 * s],
        shade(leaf, 0.9 + (i % 3) * 0.08),
        [Math.PI / 2.35, -a, 0],
      );
    }
    ch.foliage.add("ico0", [p.x + tipX, h + 0.1 * s, p.z + tipZ], [0.7 * s, 0.6 * s, 0.7 * s], shade(leaf, 0.75));
  },

  bush(ch, p, theme, r) {
    const s = (p.scale || 1) * (0.7 + r() * 0.5);
    const leaf = shade(theme.trees[Math.floor(r() * theme.trees.length)], 0.9);
    ch.foliage.add("ico0", [p.x, 0.5 * s, p.z], [1.7 * s, 1.1 * s, 1.6 * s], leaf, r() * 6.28);
    ch.foliage.add("ico0", [p.x + 0.5 * s, 0.42 * s, p.z - 0.4 * s], [1.15 * s, 0.85 * s, 1.1 * s], shade(leaf, 1.12), r() * 6.28);
    if (theme.snow) ch.foliage.add("ico0", [p.x, 0.85 * s, p.z], [1.5 * s, 0.4 * s, 1.4 * s], theme.snowCol, r());
  },

  bench(ch, p, theme, r, detail) {
    const wood = theme.wood;
    const metal = shade(theme.metal, 0.75);
    for (const sx of [-0.78, 0.78]) {
      box(ch.opaque, p, sx, 0.22, 0, 0.1, 0.44, 0.52, metal);
      box(ch.opaque, p, sx, 0.62, -0.2, 0.1, 0.5, 0.1, metal);
    }
    for (let i = 0; i < 3; i++) box(ch.opaque, p, 0, 0.46, -0.18 + i * 0.19, 1.85, 0.07, 0.15, wood);
    for (let i = 0; i < 3; i++) box(ch.opaque, p, 0, 0.62 + i * 0.16, -0.24, 1.85, 0.12, 0.07, wood);
    if (theme.snow) box(ch.opaque, p, 0, 0.53, -0.02, 1.85, 0.06, 0.44, theme.snowCol);
  },

  bin(ch, p, theme, r) {
    const c = shade(theme.metal, 0.62);
    cyl(ch.opaque, p, "cyl8", 0, 0.44, 0, 0.36, 0.88, c);
    cyl(ch.opaque, p, "cyl8", 0, 0.92, 0, 0.4, 0.1, shade(c, 1.35));
    box(ch.opaque, p, 0, 0.72, 0.34, 0.42, 0.2, 0.05, shade(c, 0.5));
  },

  hydrant(ch, p, theme) {
    const c = theme.hydrant;
    cyl(ch.opaque, p, "cyl8", 0, 0.02, 0, 0.3, 0.06, shade(c, 0.6));
    cyl(ch.opaque, p, "cyl8", 0, 0.33, 0, 0.19, 0.62, c);
    cyl(ch.opaque, p, "cyl8", 0, 0.7, 0, 0.23, 0.14, shade(c, 1.15));
    cyl(ch.opaque, p, "cyl6", 0, 0.79, 0, 0.11, 0.12, shade(c, 0.8));
    for (const sx of [-1, 1]) cyl(ch.opaque, p, "cyl6", sx * 0.2, 0.48, 0, 0.08, 0.14, shade(c, 0.75), [0, p.yaw, Math.PI / 2]);
  },

  mailbox(ch, p, theme) {
    const c = theme.mailbox;
    box(ch.opaque, p, 0, 0.2, 0, 0.16, 0.4, 0.16, shade(theme.metal, 0.5));
    box(ch.opaque, p, 0, 0.85, 0, 0.66, 0.9, 0.5, c);
    cyl(ch.opaque, p, "cyl8", 0, 1.3, 0, 0.33, 0.66, c, [0, p.yaw, Math.PI / 2]);
    box(ch.opaque, p, 0, 1.12, 0.27, 0.42, 0.08, 0.04, shade(c, 0.55));
  },

  bollard(ch, p, theme) {
    cyl(ch.opaque, p, "cyl8", 0, 0.42, 0, 0.11, 0.84, shade(theme.metal, 0.6));
    cyl(ch.opaque, p, "cyl8", 0, 0.86, 0, 0.13, 0.08, theme.accent);
  },

  planter(ch, p, theme, r) {
    const c = shade(theme.curb, 0.92);
    box(ch.opaque, p, 0, 0.28, 0, 1.9, 0.56, 1.9, c);
    box(ch.opaque, p, 0, 0.58, 0, 1.72, 0.08, 1.72, theme.soil);
    const leaf = theme.trees[Math.floor(r() * theme.trees.length)];
    for (let i = 0; i < 3; i++) {
      ch.foliage.add(
        "ico0",
        [p.x + (r() - 0.5) * 1.1, 0.85 + r() * 0.2, p.z + (r() - 0.5) * 1.1],
        [0.85, 0.7, 0.85],
        shade(leaf, 0.9 + r() * 0.3),
        r() * 6.28,
      );
    }
  },

  "bus-stop": function (ch, p, theme, r, detail) {
    const metal = theme.metal;
    box(ch.opaque, p, 0, 0.06, 0, 4.4, 0.12, 1.8, shade(theme.curb, 1.02));
    for (const sx of [-2, 2]) box(ch.opaque, p, sx, 1.3, -0.7, 0.12, 2.6, 0.12, metal);
    box(ch.opaque, p, 0, 2.68, -0.15, 4.5, 0.14, 1.9, shade(metal, 0.8));
    box(ch.opaque, p, 0, 1.3, -0.78, 4.2, 2.5, 0.06, theme.window); // rear glass
    box(ch.opaque, p, 0, 0.55, -0.45, 3.4, 0.1, 0.45, theme.wood); // bench
    box(ch.opaque, p, 1.9, 1.5, 0.55, 0.72, 1.9, 0.1, shade(metal, 0.55)); // timetable panel
    ch.emissive.add("box", W(p, 1.9, 1.5, 0.62), [0.6, 1.6, 0.04], theme.busGlow);
    if (ch.signs && detail >= 1) {
      ch.signs.panel(...W(p, -0.6, 2.95, -0.15), 2.6, 0.7, p.yaw, 4, theme.signTint);
    }
  },

  kiosk(ch, p, theme, r, detail) {
    const c = theme.signs[Math.floor(r() * theme.signs.length)];
    box(ch.opaque, p, 0, 1.25, 0, 3.0, 2.5, 2.4, shade(c, 0.85));
    box(ch.opaque, p, 0, 2.58, 0, 3.4, 0.2, 2.8, shade(c, 0.6));
    box(ch.opaque, p, 0, 1.5, 1.21, 2.3, 1.3, 0.06, theme.window);
    box(ch.opaque, p, 0, 2.05, 1.75, 3.1, 0.12, 1.1, c); // awning
    if (theme.windowGlow > 0) ch.emissive.add("box", W(p, 0, 1.5, 1.26), [2.1, 1.15, 0.04], theme.windowEmissive);
    if (ch.signs) ch.signs.panel(...W(p, 0, 2.75, 1.3), 2.2, 0.6, p.yaw, 9, theme.signTint);
  },

  /** A parked civilian car — same silhouette family as the traffic fleet. */
  "parked-car": function (ch, p, theme, r, detail) {
    const col = theme.carPaint[(p.variant ?? 0) % theme.carPaint.length];
    drawStaticCar(ch, p, theme, col, detail);
  },

  container(ch, p, theme, r, detail) {
    const col = theme.containers[Math.floor(r() * theme.containers.length)];
    const stack = 1 + (r() < 0.35 ? 1 : 0);
    for (let i = 0; i < stack; i++) {
      const y = 1.32 + i * 2.6;
      box(ch.opaque, p, 0, y, 0, 6.1, 2.55, 2.45, col);
      box(ch.opaque, p, 0, y + 1.3, 0, 6.2, 0.12, 2.55, shade(col, 0.7));
      box(ch.opaque, p, 0, y - 1.3, 0, 6.2, 0.12, 2.55, shade(col, 0.55));
      if (detail >= 1) {
        for (let k = -5; k <= 5; k++) {
          box(ch.opaque, p, k * 0.55, y, 1.24, 0.16, 2.3, 0.08, shade(col, 1.09));
          box(ch.opaque, p, k * 0.55, y, -1.24, 0.16, 2.3, 0.08, shade(col, 0.88));
        }
        box(ch.opaque, p, 3.04, y, 0, 0.08, 2.3, 2.3, shade(col, 0.75));
      }
      if (theme.snow) box(ch.opaque, p, 0, y + 1.4, 0, 6.1, 0.1, 2.45, theme.snowCol);
    }
  },

  crate(ch, p, theme, r) {
    const c = theme.wood;
    const s = 0.8 + r() * 0.6;
    box(ch.opaque, p, 0, s * 0.5, 0, s * 1.5, s, s * 1.4, c);
    box(ch.opaque, p, 0, s * 0.5, 0, s * 1.55, s * 0.16, s * 1.45, shade(c, 0.75));
  },

  fence(ch, p, theme, r, detail) {
    const len = p.len || 8;
    const c = shade(theme.metal, 0.7);
    box(ch.opaque, p, 0, 1.05, 0, 0.08, 2.1, len, c);
    box(ch.opaque, p, 0, 2.05, 0, 0.14, 0.12, len, shade(c, 1.2));
    box(ch.opaque, p, 0, 0.12, 0, 0.2, 0.24, len, shade(c, 0.7));
    if (detail >= 1) {
      const n = Math.max(2, Math.round(len / 2.4));
      for (let i = 0; i <= n; i++) {
        box(ch.opaque, p, 0, 1.1, -len / 2 + (len / n) * i, 0.16, 2.2, 0.16, shade(c, 1.15));
      }
    }
  },

  wall(ch, p, theme, r, detail) {
    const len = p.len || 8;
    const c = shade(theme.curb, 0.86);
    box(ch.opaque, p, 0, 1.15, 0, 0.55, 2.3, len, c);
    box(ch.opaque, p, 0, 2.36, 0, 0.72, 0.16, len, shade(c, 1.12));
  },

  guardrail(ch, p, theme, r, detail) {
    const len = p.len || 10;
    const c = shade(theme.metal, 1.05);
    box(ch.opaque, p, 0, 0.72, 0, 0.14, 0.34, len, c);
    box(ch.opaque, p, 0, 0.52, 0, 0.1, 0.16, len, shade(c, 0.7));
    const n = Math.max(2, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      box(ch.opaque, p, 0, 0.4, -len / 2 + (len / n) * i, 0.16, 0.8, 0.16, shade(c, 0.6));
    }
  },

  /** Cafe terrace: table, chairs and a parasol. */
  terrace(ch, p, theme, r, detail) {
    const metal = shade(theme.metal, 0.65);
    cyl(ch.opaque, p, "cyl8", 0, 0.36, 0, 0.06, 0.72, metal);
    cyl(ch.opaque, p, "cyl12", 0, 0.74, 0, 0.5, 0.07, theme.wood);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const cx = Math.cos(a) * 1.0;
      const cz = Math.sin(a) * 1.0;
      box(ch.opaque, p, cx, 0.24, cz, 0.42, 0.48, 0.42, metal);
      box(ch.opaque, p, cx, 0.46, cz, 0.46, 0.06, 0.46, theme.wood);
      box(ch.opaque, p, cx + Math.cos(a) * 0.2, 0.7, cz + Math.sin(a) * 0.2, 0.42, 0.5, 0.06, theme.wood);
    }
    if (detail >= 1) {
      const c = theme.signs[Math.floor(r() * theme.signs.length)];
      cyl(ch.opaque, p, "cyl8", 0, 1.35, 0, 0.05, 2.7, metal);
      ch.opaque.add("cone8", [p.x, 2.62, p.z], [4.2, 0.72, 4.2], c, p.yaw);
      ch.opaque.add("cone8", [p.x, 2.9, p.z], [1.1, 0.3, 1.1], shade(c, 0.8), p.yaw);
    }
  },

  /** Standing street sign — direction plate on a slim post. */
  sign(ch, p, theme, r, detail) {
    cyl(ch.opaque, p, "cyl8", 0, 1.25, 0, 0.06, 2.5, shade(theme.metal, 0.7));
    const c = theme.signs[(p.variant ?? 0) % theme.signs.length];
    box(ch.opaque, p, 0.45, 2.3, 0, 1.5, 0.34, 0.06, c);
    box(ch.opaque, p, 0.45, 1.88, 0, 1.2, 0.3, 0.06, shade(c, 0.8));
  },

  /** Snow heap / gravel pile — cheap terrain interest for Frost & Industrial. */
  mound(ch, p, theme, r) {
    const s = p.scale || 1;
    const c = p.snow ? theme.snowCol : theme.soil;
    ch.opaque.add("ico0", [p.x, 0.3 * s, p.z], [3.2 * s, 1.1 * s, 2.6 * s], c, r() * 6.28);
  },
};

/**
 * The shared low-poly car silhouette used for parked cars. The traffic fleet
 * uses its own instanced version in trafficModel.js; this one is baked into the
 * static city so a parked street never costs an update.
 */
function drawStaticCar(ch, p, theme, col, detail) {
  const glass = theme.carGlass;
  const tyre = theme.rubber;
  box(ch.opaque, p, 0, 0.52, 0, 1.78, 0.62, 4.05, col);
  box(ch.opaque, p, 0, 0.95, -0.15, 1.62, 0.66, 2.05, shade(col, 0.94));
  box(ch.opaque, p, 0, 1.02, -0.15, 1.5, 0.5, 1.9, glass);
  box(ch.opaque, p, 0, 0.3, 0, 1.86, 0.22, 3.9, shade(col, 0.6));
  if (detail >= 1) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ch.opaque.add(
          "cyl8",
          W(p, sx * 0.85, 0.33, sz * 1.32),
          [0.66, 0.24, 0.66],
          tyre,
          [0, p.yaw, Math.PI / 2],
        );
      }
    }
    ch.emissive.add("box", W(p, 0.55, 0.62, 2.02), [0.42, 0.16, 0.06], theme.headlight);
    ch.emissive.add("box", W(p, -0.55, 0.62, 2.02), [0.42, 0.16, 0.06], theme.headlight);
    ch.emissive.add("box", W(p, 0.6, 0.68, -2.02), [0.42, 0.18, 0.06], theme.taillight);
    ch.emissive.add("box", W(p, -0.6, 0.68, -2.02), [0.42, 0.18, 0.06], theme.taillight);
  }
  if (theme.snow) box(ch.opaque, p, 0, 1.3, -0.15, 1.5, 0.08, 1.9, theme.snowCol);
}
