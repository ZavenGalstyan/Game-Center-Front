/**
 * Bottle Flip — rigid-body step for the one bottle.
 *
 * Deterministic fixed-step integration (semi-implicit Euler) plus a small
 * sequential-impulse contact solver:
 *   · bottle probe points vs furniture rects (swept against the previous
 *     step so thin shelves can't be tunnelled and side hits stay side hits)
 *   · furniture corners vs the bottle's convex hull (so a bottle tipping off
 *     an edge pivots on the corner instead of sinking through it)
 *
 * No randomness anywhere — the same throw from the same state always lands
 * the same way.
 */
import { PHYS, BOTTLE, BOTTLE_POINTS, BOTTLE_HULL, SURFACES, wrap } from "./constants.js";

export function makeBody(x = 0, y = 0) {
  return { x, y, a: 0, vx: 0, vy: 0, w: 0 };
}

const cos = Math.cos;
const sin = Math.sin;

function toWorld(b, lx, ly, out) {
  const c = cos(b.a);
  const s = sin(b.a);
  out[0] = b.x + lx * c - ly * s;
  out[1] = b.y + lx * s + ly * c;
  return out;
}

const tmpA = [0, 0];
const tmpB = [0, 0];

/**
 * Collect contacts between the body (current pose) and solids.
 * `prev` is the body pose one step earlier (for swept classification).
 */
function findContacts(b, prev, solids, contacts) {
  contacts.length = 0;
  // 1) bottle points inside rects
  for (let i = 0; i < BOTTLE_POINTS.length; i++) {
    const [lx, ly] = BOTTLE_POINTS[i];
    const p = toWorld(b, lx, ly, tmpA);
    const q = toWorld(prev, lx, ly, tmpB);
    const px = p[0];
    const py = p[1];
    for (const s of solids) {
      const inside = px > s.x0 && px < s.x1 && py > s.y0 && py < s.y1;
      // swept: crossed the whole top face in one step (thin shelf)
      const crossedTop = !inside && q[1] >= s.py1 - 0.01 && py <= s.y0 && px > s.x0 && px < s.x1;
      if (!inside && !crossedTop) continue;
      let nx = 0;
      let ny = 0;
      let pen = 0;
      const eps = 0.05;
      if (crossedTop || q[1] >= s.py1 - eps) {
        ny = 1;
        pen = s.y1 - py;
      } else if (q[1] <= s.py0 + eps) {
        ny = -1;
        pen = py - s.y0;
      } else if (q[0] <= s.px0 + eps) {
        nx = -1;
        pen = px - s.x0;
      } else if (q[0] >= s.px1 - eps) {
        nx = 1;
        pen = s.x1 - px;
      } else {
        // already inside last step: least-penetration axis
        const dl = px - s.x0;
        const dr = s.x1 - px;
        const dd = py - s.y0;
        const du = s.y1 - py;
        const m = Math.min(dl, dr, dd, du);
        if (m === du) { ny = 1; pen = du; }
        else if (m === dl) { nx = -1; pen = dl; }
        else if (m === dr) { nx = 1; pen = dr; }
        else { ny = -1; pen = dd; }
      }
      contacts.push({ px, py, nx, ny, pen, s, point: i, top: ny === 1 });
    }
  }
  // 2) furniture corners inside the bottle hull
  const c = cos(b.a);
  const sn = sin(b.a);
  for (const s of solids) {
    // cheap reject
    if (s.x1 < b.x - 16 || s.x0 > b.x + 16 || s.y1 < b.y - 16 || s.y0 > b.y + 16) continue;
    for (let k = 0; k < 4; k++) {
      const cx = k & 1 ? s.x1 : s.x0;
      const cy = k & 2 ? s.y1 : s.y0;
      // corner in body space
      const dx = cx - b.x;
      const dy = cy - b.y;
      const lx = dx * c + dy * sn;
      const ly = -dx * sn + dy * c;
      let best = Infinity;
      let bnx = 0;
      let bny = 0;
      let inside = true;
      for (let e = 0; e < BOTTLE_HULL.length; e++) {
        const [ax, ay] = BOTTLE_HULL[e];
        const [bx2, by2] = BOTTLE_HULL[(e + 1) % BOTTLE_HULL.length];
        let ex = bx2 - ax;
        let ey = by2 - ay;
        const len = Math.hypot(ex, ey);
        ex /= len;
        ey /= len;
        // outward normal of a CCW polygon edge
        const onx = ey;
        const ony = -ex;
        const d = (lx - ax) * onx + (ly - ay) * ony; // >0 outside
        if (d > 0) { inside = false; break; }
        if (-d < best) { best = -d; bnx = onx; bny = ony; }
      }
      if (!inside) continue;
      // push the bottle away from the corner: along -outwardNormal (world)
      const wnx = -(bnx * c - bny * sn);
      const wny = -(bnx * sn + bny * c);
      contacts.push({ px: cx, py: cy, nx: wnx, ny: wny, pen: best, s, point: -1, top: false });
    }
  }
  return contacts;
}

const contactsBuf = [];

/**
 * Advance the bottle one fixed step against the given solids.
 * env: { wind, assist, grip, tolerance, airborne }
 * Returns the contact list of this step (reused buffer — copy if kept).
 */
export function stepBody(b, solids, env) {
  const dt = PHYS.dt;
  const prev = { x: b.x, y: b.y, a: b.a };

  // forces
  b.vy -= PHYS.g * dt;
  if (env.airborne) {
    b.vx += (env.wind || 0) * dt;
    const aw = wrap(b.a);
    // liquid settling: while falling, the water sinks to the base and the
    // spin slows sharply as the bottle swings through upright (the real
    // water-bottle effect — it is what makes a flip learnable)
    const win = PHYS.liquidWindow;
    if (b.vy < 0 && Math.abs(aw) < win) {
      const u = 1 - Math.abs(aw) / win;
      const wgt = u * u * (3 - 2 * u) * (env.assist ?? 1);
      b.w += (-PHYS.liquidPull * sin(aw) - PHYS.liquidDamp * b.w) * wgt * dt;
    }
    b.w *= 1 - PHYS.airAngDamp * dt;
  }

  // integrate
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.a += b.w * dt;

  const contacts = findContacts(b, prev, solids, contactsBuf);
  if (contacts.length === 0) return contacts;

  // ---- velocity solve (sequential impulses) ----
  const invM = BOTTLE.invMass;
  const invI = BOTTLE.invI;
  for (const ct of contacts) {
    const rx = ct.px - b.x;
    const ry = ct.py - b.y;
    ct.rx = rx;
    ct.ry = ry;
    const tx = ct.ny;
    const ty = -ct.nx;
    ct.tx = tx;
    ct.ty = ty;
    const rn = rx * ct.ny - ry * ct.nx;
    const rt = rx * ty - ry * tx;
    ct.kn = 1 / (invM + rn * rn * invI);
    ct.kt = 1 / (invM + rt * rt * invI);
    const vrx = b.vx - b.w * ry - ct.s.vx;
    const vry = b.vy + b.w * rx - ct.s.vy;
    const vn = vrx * ct.nx + vry * ct.ny;
    ct.vn0 = vn;
    const mat = SURFACES[ct.s.surface] || SURFACES.wood;
    ct.mu = mat.mu;
    const upright = ct.top && ct.point >= 0 && ct.point <= 1 && Math.abs(wrap(b.a)) < env.tolerance;
    ct.bias = vn < -PHYS.restThreshold ? -mat.e * (upright ? 0.35 : 1) * vn : 0;
    ct.jn = 0;
    ct.jt = 0;
  }
  for (let it = 0; it < PHYS.iterations; it++) {
    for (const ct of contacts) {
      const { rx, ry } = ct;
      let vrx = b.vx - b.w * ry - ct.s.vx;
      let vry = b.vy + b.w * rx - ct.s.vy;
      const vn = vrx * ct.nx + vry * ct.ny;
      let dj = (ct.bias - vn) * ct.kn;
      const jn = Math.max(0, ct.jn + dj);
      dj = jn - ct.jn;
      ct.jn = jn;
      let Px = dj * ct.nx;
      let Py = dj * ct.ny;
      b.vx += Px * invM;
      b.vy += Py * invM;
      b.w += (rx * Py - ry * Px) * invI;

      vrx = b.vx - b.w * ry - ct.s.vx;
      vry = b.vy + b.w * rx - ct.s.vy;
      const vt = vrx * ct.tx + vry * ct.ty;
      let djt = -vt * ct.kt;
      const lim = ct.mu * ct.jn;
      const jt = Math.max(-lim, Math.min(lim, ct.jt + djt));
      djt = jt - ct.jt;
      ct.jt = jt;
      Px = djt * ct.tx;
      Py = djt * ct.ty;
      b.vx += Px * invM;
      b.vy += Py * invM;
      b.w += (rx * Py - ry * Px) * invI;
    }
  }

  // ---- position correction (translation only, deepest contact per axis) ----
  let upPen = 0;
  let downPen = 0;
  let leftPen = 0;
  let rightPen = 0;
  let ox = 0;
  let oy = 0;
  for (const ct of contacts) {
    const pen = Math.max(0, ct.pen - PHYS.slop);
    if (ct.point >= 0) {
      if (ct.ny === 1) upPen = Math.max(upPen, pen);
      else if (ct.ny === -1) downPen = Math.max(downPen, pen);
      else if (ct.nx === 1) rightPen = Math.max(rightPen, pen);
      else leftPen = Math.max(leftPen, pen);
    } else {
      ox += ct.nx * pen * 0.5;
      oy += ct.ny * pen * 0.5;
    }
  }
  b.x += (rightPen - leftPen) * 0.9 + ox;
  b.y += (upPen - downPen) * 0.9 + oy;

  // grip: the water inside soaks up rocking while the base is down and the
  // bottle is inside the level's upright tolerance. Every base slap (not
  // just the first) absorbs most of the spin — that is the water "catch".
  const aw = wrap(b.a);
  if (Math.abs(aw) < env.tolerance) {
    let baseDown = false;
    let slap = false;
    for (const ct of contacts) {
      if (ct.top && ct.point >= 0 && ct.point <= 1) {
        baseDown = true;
        if (ct.vn0 < -PHYS.slapSpeed) slap = true;
      }
    }
    if (baseDown) {
      if (slap) b.w *= PHYS.catchKeep;
      const mat = SURFACES[contacts[0].s.surface] || SURFACES.wood;
      const k = PHYS.gripDamp * (env.grip ?? 1) + (mat.damp || 0);
      b.w *= Math.exp(-k * dt);
      if (mat.damp) {
        b.vx *= Math.exp(-mat.damp * 0.5 * dt);
        b.vy *= Math.exp(-mat.damp * 0.5 * dt);
      }
    }
  }
  return contacts;
}

/**
 * Initial velocities for a throw.
 * angle: radians from +x (π/2 = straight up). power: 0..1.
 */
export function launchVelocity(angle, power, facing = 1) {
  const p = Math.max(0, Math.min(1, power));
  const a = Math.max(PHYS.minAngle, Math.min(Math.PI - PHYS.minAngle, angle));
  const speed = PHYS.vMin + (PHYS.vMax - PHYS.vMin) * p;
  const vx = Math.cos(a) * speed;
  const vy = Math.sin(a) * speed;
  let dir = Math.sign(vx);
  if (Math.abs(vx) < speed * 0.05) dir = facing >= 0 ? 1 : -1;
  // forward flips: travelling right spins clockwise (negative in y-up)
  const raw = PHYS.spinK * Math.max(0, speed - PHYS.spinFrom);
  // spin levels off for big throws, so long jumps stay a single/double flip
  const w = -dir * PHYS.spinMax * Math.tanh(raw / PHYS.spinMax);
  return { vx, vy, w, speed };
}
