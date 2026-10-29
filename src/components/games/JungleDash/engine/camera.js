/**
 * Third-person follow camera (pure maths, no Three.js — so the headless
 * tests can check it never ends up inside level geometry).
 *
 * It sits behind (+z) and above the player looking down the level (−z).
 * Height only follows the ground the player lands on, so jumps don't bob
 * the view; falling below that height is followed at once. Before each
 * frame the line from the player to the camera is tested against every
 * static box and the camera is pulled in front of the first hit.
 */
const DEF = { dist: 7.4, height: 3.5, look: 2.6 };

function zoneAt(L, z) {
  for (const zn of L.camZones || []) if (z <= zn.z0 && z >= zn.z1) return zn;
  return DEF;
}

export function makeCamera(g) {
  const p = g.player;
  const z = zoneAt(g.level, p.z);
  const c = { fx: p.x, fy: p.y, fz: p.z, dist: z.dist ?? DEF.dist, height: z.height ?? DEF.height, look: z.look ?? DEF.look, x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, pull: 1, shake: 0 };
  updateCamera(c, g, 1 / 60, true);
  return c;
}

/** segment (a→b) vs box: entry fraction in [0,1] or Infinity */
function segBox(ax, ay, az, bx, by, bz, s, pad) {
  let t0 = 0, t1 = 1;
  const d = [bx - ax, by - ay, bz - az];
  const o = [ax, ay, az];
  const lo = [s.x0 - pad, s.y0 - pad, s.z0 - pad];
  const hi = [s.x1 + pad, s.y1 + pad, s.z1 + pad];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return Infinity;
    } else {
      let ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

/** everything the camera must stay out of: ground, moving / falling platforms, crushers and rolling logs */
function obstacles(g) {
  const L = g._camObs || (g._camObs = []);
  L.length = 0;
  for (const s of g.statics) L.push(s);
  for (const s of g.movers) L.push(s);
  for (const s of g.fallers) if (s.on) L.push(s);
  for (const h of g.hazards) {
    if (h.t === "crusher") {
      const c = h.cur;
      L.push(h._box ? Object.assign(h._box, { x0: c[0], y0: c[1], z0: c[2], x1: c[3], y1: c[4], z1: c[5] }) : (h._box = { x0: c[0], y0: c[1], z0: c[2], x1: c[3], y1: c[4], z1: c[5] }));
    } else if (h.t === "slider") {
      const [w, hh, d] = h.size, q = h.pos;
      const b = { x0: q[0] - w / 2, y0: q[1], z0: q[2] - d / 2, x1: q[0] + w / 2, y1: q[1] + hh, z1: q[2] + d / 2 };
      L.push(h._box ? Object.assign(h._box, b) : (h._box = b));
    }
  }
  return L;
}

export function clipFraction(g, ax, ay, az, bx, by, bz, pad = 0.25) {
  let best = 1;
  for (const s of obstacles(g)) {
    const t = segBox(ax, ay, az, bx, by, bz, s, pad);
    if (t < best) best = t;
  }
  return best;
}

function insideStatic(g, x, y, z, pad) {
  for (const s of obstacles(g)) if (x > s.x0 - pad && x < s.x1 + pad && y > s.y0 - pad && y < s.y1 + pad && z > s.z0 - pad && z < s.z1 + pad) return true;
  return false;
}

export function updateCamera(c, g, dt, snap = false) {
  const p = g.player;
  const frozen = g.status === "dying" && p.deathKind !== "ko";
  const k = (r) => (snap ? 1 : 1 - Math.exp(-r * dt));
  const zn = zoneAt(g.level, p.z);
  c.dist += ((zn.dist ?? DEF.dist) - c.dist) * k(2);
  c.height += ((zn.height ?? DEF.height) - c.height) * k(2);
  c.look += ((zn.look ?? DEF.look) - c.look) * k(2);
  if (!frozen) {
    c.fx += (p.x - c.fx) * k(6);
    c.fz += (p.z - c.fz) * k(9);
    // vertical: follow landings, not jumps (unless we climb far above the old ground)
    let ty = c.fy;
    if (p.grounded || p.y < c.fy) ty = p.y;
    else if (p.y > c.fy + 2.4) ty = p.y - 2.4;
    c.fy += (ty - c.fy) * k(p.y < c.fy - 0.5 ? 9 : 4.5);
  }
  // pivot near the player's head, camera behind and above (the smoothed
  // pivot can lag into a wall the player is dropping past: use the head then)
  let px = c.fx, py = c.fy + 1.3, pz = c.fz;
  if (insideStatic(g, px, py, pz, 0.3)) {
    px = p.x;
    py = p.y + 1.1;
    pz = p.z;
  }
  const dx = 0, dy = c.height - 1.3 + 0.0, dz = c.dist;
  const want = clipFraction(g, px, py, pz, px + dx, py + dy, pz + dz);
  // pull in immediately, ease back out
  if (want < c.pull || snap) c.pull = want;
  else c.pull += (want - c.pull) * k(3);
  const f = Math.max(0.12, c.pull - 0.03);
  c.x = px + dx * f;
  c.y = py + dy * f;
  c.z = pz + dz * f;
  if (insideStatic(g, c.x, c.y, c.z, 0.05)) {
    c.x = p.x;
    c.y = p.y + 1.1;
    c.z = p.z + 0.2;
  }
  c.lx = c.fx;
  c.ly = c.fy + 1.0;
  c.lz = c.fz - c.look;
  c.shake = Math.max(0, c.shake - dt * 2.5);
  return c;
}
