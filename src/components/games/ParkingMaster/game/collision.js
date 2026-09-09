/**
 * Parking Master — static collision world.
 *
 * Built once per level from the level data. Everything is either an oriented
 * box (walls, columns, barriers, parked cars) or a soft circle (cones). The
 * physics step calls `resolveCircle` for the car's front and rear axle points
 * each sub-step; a hit returns a minimum-translation push plus the surface
 * normal, a penetration depth and a `soft` factor (1 = cone, 0 = concrete).
 *
 * Cones are knocked aside on contact: after a real hit their collision radius
 * collapses so the car can drive through, and `knocked` is set so the renderer
 * can tip them over.
 */

const CONE_R = 0.34;

export function createCollisionWorld(level) {
  const boxes = [];
  const cones = [];

  const addBox = (x, z, hw, hl, heading, soft, tag) => {
    boxes.push({
      x, z, hw, hl,
      s: Math.sin(heading || 0),
      c: Math.cos(heading || 0),
      soft: soft ?? 0,
      tag,
    });
  };

  /* perimeter */
  const { w, l, wall } = level.arena;
  if (wall && wall !== "none") {
    const t = 0.6;
    const hx = w / 2;
    const hz = l / 2;
    addBox(0, hz + t, hx + t, t, 0, 0, "wall");
    addBox(0, -hz - t, hx + t, t, 0, 0, "wall");
    addBox(hx + t, 0, t, hz + t, 0, 0, "wall");
    addBox(-hx - t, 0, t, hz + t, 0, 0, "wall");
  }

  /* parked cars — footprint slightly tighter than the visual body */
  const FP = { compact: [1.7, 3.9], sedan: [1.8, 4.4], suv: [1.9, 4.5] };
  for (const p of level.parked || []) {
    const [fw, fl] = FP[p.body] || FP.sedan;
    addBox(p.pos[0], p.pos[1], fw / 2, fl / 2, p.heading || 0, 0.05, "car");
  }

  /* obstacles */
  for (const o of level.obstacles || []) {
    if (o.type === "cone") {
      cones.push({ x: o.pos[0], z: o.pos[1], knocked: false });
      continue;
    }
    const [sw, sl] = o.size || [1, 1];
    const soft = o.type === "barrier" ? 0.08 : 0.02;
    addBox(o.pos[0], o.pos[1], sw / 2, sl / 2, o.heading || 0, soft, o.type);
  }

  function resolveCircle(cx, cz, r) {
    let best = null;

    for (const b of boxes) {
      // circle centre in box-local space
      const dx = cx - b.x;
      const dz = cz - b.z;
      const lx = dx * b.c + dz * b.s;
      const lz = -dx * b.s + dz * b.c;
      const clx = clamp(lx, -b.hw, b.hw);
      const clz = clamp(lz, -b.hl, b.hl);
      let nlx = lx - clx;
      let nlz = lz - clz;
      let d2 = nlx * nlx + nlz * nlz;

      if (d2 > r * r) continue;

      let depth;
      let nx;
      let nz;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        depth = r - d;
        nlx /= d;
        nlz /= d;
      } else {
        // centre inside the box — push out along the nearest face
        const px = b.hw - Math.abs(lx);
        const pz = b.hl - Math.abs(lz);
        if (px < pz) {
          nlx = Math.sign(lx) || 1;
          nlz = 0;
          depth = r + px;
        } else {
          nlx = 0;
          nlz = Math.sign(lz) || 1;
          depth = r + pz;
        }
      }
      // back to world space
      nx = nlx * b.c - nlz * b.s;
      nz = nlx * b.s + nlz * b.c;

      if (!best || depth > best.depth) {
        best = { px: nx * depth, pz: nz * depth, nx, nz, depth, soft: b.soft, tag: b.tag };
      }
    }

    for (const cn of cones) {
      if (cn.knocked) continue;
      const dx = cx - cn.x;
      const dz = cz - cn.z;
      const d2 = dx * dx + dz * dz;
      const rr = r + CONE_R;
      if (d2 > rr * rr) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const depth = rr - d;
      const nx = dx / d;
      const nz = dz / d;
      cn.knocked = true;
      cn.knockDir = [nx, nz];
      if (!best || best.soft > 0.6) {
        best = { px: nx * depth * 0.4, pz: nz * depth * 0.4, nx, nz, depth: depth * 0.4, soft: 1, tag: "cone" };
      }
    }

    return best;
  }

  return { resolveCircle, cones, boxes };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
