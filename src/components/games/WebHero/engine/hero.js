/**
 * Web Hero — the hero controller.
 *
 * mode:   ground · air · climb · wallrun · ledge · swing
 * action: none · attack · dodge · web · hurt · knockdown · rescue · victory · special
 *
 * Movement is camera-relative. Web swinging is a real pendulum: an anchor is
 * found by raycasting the city (only building faces / roof edges / special
 * structures are valid), the rope is a distance constraint, gravity + pumping
 * + steering act on the hero, and releasing keeps the velocity.
 */
import { H, GRAVITY } from "./config.js";
import { floorAt, pushOut, wallContact, raycast, lineClear, overWater } from "./collide.js";

const fl = { y: 0, box: null };
const hit = { nx: 0, nz: 0, n: 0, box: null };
const wc = { nx: 0, nz: 0, box: null, d: 0 };
const rc = {};

const fwd = (h) => [Math.sin(h), Math.cos(h)];
const right = (h) => [-Math.cos(h), Math.sin(h)];

export function createHero(spawn, up = {}) {
  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: spawn.h || 0,
    mode: "ground",
    action: "none",
    actT: 0,
    grounded: true,
    coyote: 0,
    buffer: 0,
    jumpsUsed: 0,
    jumpCut: false,
    hp: H.maxHp + (up.health || 0) * 20,
    maxHp: H.maxHp + (up.health || 0) * 20,
    iframes: 0,
    wall: null,
    wallT: 0,
    swing: null,
    ledge: null,
    dodgeDir: [0, 0],
    dodgeCd: 0,
    perfectT: 0,
    counterT: 0,
    trick: 0,
    landImpact: 0,
    speed: 0,
    safe: { x: spawn.x, y: spawn.y, z: spawn.z },
    anchorHint: null,
    airT: 0,
    up,
  };
}

/** camera-relative wish direction from raw input */
function wish(inp) {
  const [fx, fz] = fwd(inp.camYaw || 0);
  const [rx, rz] = right(inp.camYaw || 0);
  let x = fx * inp.my + rx * inp.mx;
  let z = fz * inp.my + rz * inp.mx;
  const m = Math.hypot(x, z);
  if (m > 1e-6) {
    x /= m;
    z /= m;
  }
  return { x, z, m: Math.min(1, m) };
}

/* ------------------------------------------------------------------ anchors */

const YAWS = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1.0, 1.0, -1.25, 1.25, -1.5, 1.5];
const ELEVS = [0.3, 0.45, 0.6, 0.78, 0.98, 1.2];

/**
 * Best swing anchor for the hero: raycasts in a fan ahead and above (travel
 * direction when moving fast, else camera forward). Only hits on anchor-able
 * boxes count; points must be above the hero, within range, with a clear line.
 */
export function findAnchor(W, h, camYaw) {
  const G = W.geo;
  const range = H.webRange + (h.up.range || 0) * 8;
  const sp = Math.hypot(h.vx, h.vz);
  const base = sp > 6 ? Math.atan2(h.vx, h.vz) : camYaw;
  const fx = Math.sin(base);
  const fz = Math.cos(base);
  const ox = h.x;
  const oy = h.y + 1.5;
  const oz = h.z;
  let best = null;
  let bs = -Infinity;
  // a good anchor puts the bottom of the arc AHEAD: high above, and ahead by
  // roughly its height (so the pendulum carries the hero forward and up)
  const rate = (x, y, z) => {
    const above = y - oy;
    const ddx = x - ox;
    const ddz = z - oz;
    const f = ddx * fx + ddz * fz;
    const lat = Math.abs(ddx * fz - ddz * fx);
    if (f < 2 || above < 3) return -Infinity;
    const want = Math.max(8, above * 0.85);
    return 3 - Math.abs(above - 20) / 12 - Math.abs(f - want) / 14 - Math.max(0, lat - 12) / 9 - Math.max(0, 6 - lat) / 14;
  };
  for (const yo of YAWS) {
    for (const el of ELEVS) {
      const yaw = base + yo;
      const c = Math.cos(el);
      const dx = Math.sin(yaw) * c;
      const dy = Math.sin(el);
      const dz = Math.cos(yaw) * c;
      // the ray stops at the FIRST solid box: a web never passes through geometry
      if (!raycast(G, ox, oy, oz, dx, dy, dz, range, rc)) continue;
      if (!rc.box || !rc.box.anchor || rc.y < oy + 3) continue;
      const dist = rc.t;
      if (dist < 8) continue;
      const score = rate(rc.x, rc.y, rc.z) + (rc.ny === 0 ? 0.25 : 0);
      if (score > bs) {
        bs = score;
        best = { x: rc.x, y: rc.y, z: rc.z, box: rc.box, dist, nx: rc.nx, ny: rc.ny, nz: rc.nz };
      }
    }
  }
  // special swing points (crane beams, bridge pylons …)
  for (const a of W.city.anchors) {
    const dx = a.x - ox;
    const dy = a.y - oy;
    const dz = a.z - oz;
    const d = Math.hypot(dx, dy, dz);
    if (d > range || d < 8 || dy < 3) continue;
    if (!lineClear(G, ox, oy, oz, a.x - (dx / d) * 1.5, a.y - (dy / d) * 1.5, a.z - (dz / d) * 1.5)) continue;
    const score = rate(a.x, a.y, a.z) + 0.4;
    if (score > bs) {
      bs = score;
      best = { x: a.x, y: a.y, z: a.z, box: null, special: true, dist: d, nx: 0, ny: -1, nz: 0 };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ step */

export function stepHero(W, inp, dt) {
  const h = W.hero;
  h.iframes = Math.max(0, h.iframes - dt);
  h.dodgeCd = Math.max(0, h.dodgeCd - dt);
  h.perfectT = Math.max(0, h.perfectT - dt);
  h.counterT = Math.max(0, h.counterT - dt);
  h.trick = Math.max(0, h.trick - dt);
  h.landImpact = 0;
  h.actT += dt;
  if (inp.jump) h.buffer = H.buffer;
  else h.buffer = Math.max(0, h.buffer - dt);

  if (h.action === "knockdown" || h.action === "hurt" || h.action === "victory" || h.action === "rescue" || h.action === "defeated") {
    const lim = h.action === "knockdown" ? H.knockdownTime : h.action === "hurt" ? 0.35 : Infinity;
    if (h.actT > lim && (h.action === "knockdown" || h.action === "hurt")) h.action = "none";
    if (h.mode === "swing") release(W, h, false);
    if (h.mode === "climb" || h.mode === "wallrun") h.mode = "air";
    const k = h.grounded ? Math.max(0, 1 - 8 * dt) : 1;
    h.vx *= k;
    h.vz *= k;
    integrate(W, h, dt);
    return;
  }

  // dodge (Ctrl) from ground / air / swing
  if (inp.dodge && h.dodgeCd <= 0 && h.action !== "dodge" && h.mode !== "ledge") {
    startDodge(W, h, inp);
  }

  switch (h.mode) {
    case "swing":
      return stepSwing(W, h, inp, dt);
    case "climb":
      return stepClimb(W, h, inp, dt);
    case "wallrun":
      return stepWallrun(W, h, inp, dt);
    case "ledge":
      return stepLedge(W, h, dt);
    default:
      break;
  }

  // web swing (hold Q)
  if (inp.swing && !inp.swingWas && h.action !== "attack") {
    const a = findAnchor(W, h, inp.camYaw);
    if (a) {
      attach(W, h, a);
      return;
    }
    W.events.push({ type: "noAnchor" });
  }

  const m = wish(inp);
  const busy = h.action === "attack" || h.action === "web" || h.action === "special";
  if (h.action === "dodge") {
    h.vx = h.dodgeDir[0] * H.dodgeSpeed;
    h.vz = h.dodgeDir[1] * H.dodgeSpeed;
    if (h.actT > H.dodgeTime) h.action = "none";
  } else if (h.grounded) {
    groundMove(h, m, inp, dt, busy);
  } else {
    airMove(h, m, dt, busy);
  }

  // jump / double jump
  if (h.buffer > 0 && !busy) {
    if (h.grounded || h.coyote > 0) {
      h.vy = H.jumpV;
      h.grounded = false;
      h.mode = "air";
      h.coyote = 0;
      h.jumpsUsed = 1;
      h.jumpCut = false;
      h.buffer = 0;
      h.airT = 0;
      W.events.push({ type: "jump" });
    } else if (h.jumpsUsed < 2) {
      h.vy = H.doubleV;
      h.jumpsUsed = 2;
      h.jumpCut = true;
      h.buffer = 0;
      h.trick = 0.5;
      W.events.push({ type: "doubleJump" });
    }
  }
  if (!h.grounded && !h.jumpCut && !inp.jumpHeld && h.vy > H.jumpCut && h.jumpsUsed === 1) {
    h.vy = H.jumpCut;
    h.jumpCut = true;
  }

  const was = h.grounded;
  integrate(W, h, dt, m, inp);
  if (!was && !h.grounded && h.mode === "air") h.airT += dt;
}

function groundMove(h, m, inp, dt, busy) {
  let top = inp.sprint ? H.sprint : H.run;
  if (busy) top = 2;
  const sp = Math.hypot(h.vx, h.vz);
  if (m.m > 0.1) {
    const tx = m.x * top;
    const tz = m.z * top;
    const k = Math.min(1, (H.accel * dt) / Math.max(0.01, Math.hypot(tx - h.vx, tz - h.vz)));
    h.vx += (tx - h.vx) * k;
    h.vz += (tz - h.vz) * k;
    // face where we go
    if (!busy) h.facing = turn(h.facing, Math.atan2(m.x, m.z), H.turnRate * dt);
  } else {
    const ns = Math.max(0, sp - H.friction * dt);
    if (sp > 1e-6) {
      h.vx *= ns / sp;
      h.vz *= ns / sp;
    }
  }
}

function airMove(h, m, dt, busy) {
  if (busy && h.action !== "attack") return;
  const acc = H.airAccel * (1 + (h.up.air || 0) * 0.3);
  if (m.m > 0.1) {
    const sp = Math.hypot(h.vx, h.vz);
    const top = Math.max(H.run, sp);
    h.vx += m.x * acc * dt;
    h.vz += m.z * acc * dt;
    const ns = Math.hypot(h.vx, h.vz);
    if (ns > top) {
      h.vx *= top / ns;
      h.vz *= top / ns;
    }
    h.facing = turn(h.facing, Math.atan2(h.vx, h.vz), 6 * dt);
  }
}

function turn(a, b, max) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-max, Math.min(max, d));
}

/* ------------------------------------------------------------------ integration */

function integrate(W, h, dt, m, inp) {
  const G = W.geo;
  if (!h.grounded) h.vy = Math.max(-H.maxFall, h.vy - GRAVITY * dt);
  const subs = Math.max(1, Math.ceil((Math.hypot(h.vx, h.vy, h.vz) * dt) / 0.25));
  const sdt = dt / subs;
  for (let s = 0; s < subs; s++) {
    const oy = h.y;
    h.x += h.vx * sdt;
    h.z += h.vz * sdt;
    h.y += h.vy * sdt;
    // ceiling (rising into a box bottom)
    if (h.vy > 0) {
      for (const b of nearBoxes(W, h)) {
        if (h.x > b.x0 && h.x < b.x1 && h.z > b.z0 && h.z < b.z1 && oy + H.height <= b.y0 + 0.01 && h.y + H.height > b.y0) {
          h.y = b.y0 - H.height - 0.01;
          h.vy = 0;
        }
      }
    }
    if (pushOut(G, h, H.radius, h.y + 0.05, h.y + H.height, H.stepUp, hit)) {
      const l = Math.hypot(hit.nx, hit.nz) || 1;
      const nx = hit.nx / l;
      const nz = hit.nz / l;
      const vn = h.vx * nx + h.vz * nz;
      if (vn < 0) {
        h.vx -= nx * vn;
        h.vz -= nz * vn;
      }
      // walls: climb / wall-run / ledge
      if (m && inp && h.action !== "attack" && h.action !== "dodge" && hit.box && hit.box.climb && hit.box.y1 - h.y > 1.2) {
        if (tryWall(W, h, m, inp, nx, nz, hit.box, -vn)) return;
      }
    }
    // floor
    if (h.grounded) {
      if (floorAt(G, h.x, h.z, h.y + H.stepUp, h.y - 0.45, fl)) {
        h.y = fl.y;
        h.floorBox = fl.box;
      } else {
        h.grounded = false;
        h.coyote = H.coyote;
        h.mode = "air";
        h.airT = 0;
      }
    } else if (h.vy <= 0) {
      if (floorAt(G, h.x, h.z, Math.max(oy, h.y) + 0.06, h.y - 0.02, fl)) {
        land(W, h, fl);
      } else if (m && inp && tryLedge(W, h)) return;
    }
    // never below the street (safety net for any contact edge case)
    if (!h.grounded && h.y < G.groundY && !overWater(G, h.x, h.z)) land(W, h, { y: G.groundY, box: null });
  }
  h.coyote = Math.max(0, h.coyote - dt);
  // city bounds
  const B = W.city.bounds;
  if (h.x < B.x0) (h.x = B.x0), (h.vx = Math.max(0, h.vx));
  if (h.x > B.x1) (h.x = B.x1), (h.vx = Math.min(0, h.vx));
  if (h.z < B.z0) (h.z = B.z0), (h.vz = Math.max(0, h.vz));
  if (h.z > B.z1) (h.z = B.z1), (h.vz = Math.min(0, h.vz));
  h.speed = Math.hypot(h.vx, h.vz);
  // remember safe ground; water / void → back to it
  // (only well inside a surface — a respawn must never sit on the very edge)
  if (h.grounded && h.speed < 30 && solidAround(G, h.x, h.y, h.z)) {
    h.safe.x = h.x;
    h.safe.y = h.y;
    h.safe.z = h.z;
  }
  if (h.y < (W.city.water ? W.city.water.y : -30)) {
    W.events.push({ type: "splash", x: h.x, y: h.y, z: h.z });
    Object.assign(h, { x: h.safe.x, y: h.safe.y + 0.5, z: h.safe.z, vx: 0, vy: 0, vz: 0, mode: "air", grounded: false });
    W.damageHero(10, h.x, h.z, "fall", true);
  }
}

const sa = {};
function solidAround(G, x, y, z) {
  for (const [dx, dz] of [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]]) {
    if (!floorAt(G, x + dx, z + dz, y + 0.3, y - 0.3, sa)) return false;
  }
  return true;
}

function nearBoxes(W, h) {
  const out = [];
  const G = W.geo;
  const k = (ix, iz) => (ix + 2048) * 4096 + (iz + 2048);
  const c = G.cells.get(k(Math.floor(h.x / 16), Math.floor(h.z / 16)));
  if (c) for (const b of c) if (!b.off) out.push(b);
  return out;
}

function land(W, h, f) {
  const impact = -h.vy;
  h.grounded = true;
  h.y = f.y;
  h.floorBox = f.box;
  h.vy = 0;
  h.mode = "ground";
  h.jumpsUsed = 0;
  h.coyote = 0;
  h.landImpact = impact;
  h.airT = 0;
  if (h.action === "attack" && h.atk && h.atk.air) h.action = "none";
  W.events.push({ type: "land", impact, x: h.x, y: h.y, z: h.z });
}

/* ------------------------------------------------------------------ walls */

function tryWall(W, h, m, inp, nx, nz, box, into) {
  // only flat faces: a corner push-out normal is diagonal and has no face to
  // hold — confirm the face and use its axis-aligned normal
  if (!wallContact(W.geo, h.x, h.y + 0.9, h.z, H.radius, wc)) return false;
  nx = wc.nx;
  nz = wc.nz;
  box = wc.box;
  if (box.y1 - h.y < 1.2) return false;
  const along = m.x * -nx + m.z * -nz; // input pushing into the wall
  const sp = Math.hypot(h.vx, h.vz);
  const parallel = Math.abs(h.vx * nx + h.vz * nz) / (sp || 1);
  // wall run: airborne, fast, travelling along the wall while sprinting
  if (!h.grounded && inp.sprint && sp > H.wallRunMin * 0.7 && along > -0.2 && parallel < 0.6 && box.y1 - h.y > 3) {
    const tx = -nz;
    const tz = nx;
    const dir = h.vx * tx + h.vz * tz >= 0 ? 1 : -1;
    h.mode = "wallrun";
    h.wall = { nx, nz, box, tx: tx * dir, tz: tz * dir };
    h.wallT = 0;
    h.vy = Math.max(h.vy, 1.5);
    h.jumpsUsed = 1;
    W.events.push({ type: "wallrun" });
    return true;
  }
  // climb: pushing into the wall
  if (along > 0.55) {
    startClimb(W, h, nx, nz, box);
    return true;
  }
  void into;
  return false;
}

function startClimb(W, h, nx, nz, box) {
  h.mode = "climb";
  h.grounded = false;
  h.wall = { nx, nz, box };
  h.vx = 0;
  h.vz = 0;
  h.vy = 0;
  h.jumpsUsed = 0;
  h.facing = Math.atan2(-nx, -nz);
  W.events.push({ type: "climbStart" });
}

function stepClimb(W, h, inp, dt) {
  const w = h.wall;
  const b = w.box;
  // stick to the face: re-detect (handles corners and the wall ending)
  if (!wallContact(W.geo, h.x, h.y + 0.9, h.z, H.radius, wc) || wc.box.y1 < h.y + 0.6) {
    // top reached or wall ended
    if (b && h.y + 0.6 >= b.y1 - 0.2) return startLedge(W, h, b, w.nx, w.nz);
    h.mode = "air";
    h.wall = null;
    return;
  }
  if (wc.nx !== w.nx || wc.nz !== w.nz || wc.box !== b) {
    h.wall = { nx: wc.nx, nz: wc.nz, box: wc.box };
    h.facing = Math.atan2(-wc.nx, -wc.nz);
  }
  const { nx, nz } = h.wall;
  // camera-relative-ish: W/S = up/down, A/D = along the wall
  const tx = -nz; // wall "right" when facing into the wall (-n): right(facing)
  const tz = nx;
  const rx = -Math.cos(h.facing);
  const rz = Math.sin(h.facing);
  const side = rx * tx + rz * tz >= 0 ? 1 : -1;
  const sp = inp.sprint ? 1.45 : 1;
  h.vy = inp.my * H.climbSpeed * sp;
  const lat = inp.mx * H.climbSideSpeed * sp * side;
  h.vx = tx * lat;
  h.vz = tz * lat;
  h.climbMove = Math.abs(inp.my) + Math.abs(inp.mx);
  // jump: up the wall (holding W) or away from it
  if (h.buffer > 0) {
    h.buffer = 0;
    if (inp.my > 0.5) {
      h.vy = 13;
      W.events.push({ type: "wallLeap" });
    } else {
      h.mode = "air";
      h.wall = null;
      h.vx = nx * H.wallJumpOut;
      h.vz = nz * H.wallJumpOut;
      h.vy = H.wallJumpUp;
      h.jumpsUsed = 1;
      h.facing = Math.atan2(nx, nz);
      W.events.push({ type: "jump" });
      return;
    }
  }
  h.x += h.vx * dt;
  h.z += h.vz * dt;
  h.y += h.vy * dt;
  // keep snug against the face
  const box = h.wall.box;
  if (nx) h.x = nx < 0 ? box.x0 - H.radius - 0.02 : box.x1 + H.radius + 0.02;
  if (nz) h.z = nz < 0 ? box.z0 - H.radius - 0.02 : box.z1 + H.radius + 0.02;
  // corners: slid past the face edge → wrap around onto the side face
  if (nx) {
    if (h.z < box.z0 - 0.1) wrap(h, box, 0, -1);
    else if (h.z > box.z1 + 0.1) wrap(h, box, 0, 1);
  } else {
    if (h.x < box.x0 - 0.1) wrap(h, box, -1, 0);
    else if (h.x > box.x1 + 0.1) wrap(h, box, 1, 0);
  }
  // reached the top → vault over the ledge
  if (h.y + 1.2 >= box.y1) {
    const above = floorAt(W.geo, h.x - nx * 0.9, h.z - nz * 0.9, box.y1 + 0.05, box.y1 - 0.05, fl);
    if (above) return startLedge(W, h, box, nx, nz);
  }
  // feet on the ground → walk away
  if (h.vy < 0 && floorAt(W.geo, h.x, h.z, h.y + 0.05, h.y - 0.1, fl)) {
    h.y = fl.y;
    h.floorBox = fl.box;
    h.mode = "ground";
    h.grounded = true;
    h.wall = null;
  }
  h.speed = Math.hypot(h.vx, h.vy);
}

function wrap(h, box, nx, nz) {
  h.wall = { nx, nz, box };
  h.facing = Math.atan2(-nx, -nz);
  if (nx) h.x = nx < 0 ? box.x0 - H.radius - 0.02 : box.x1 + H.radius + 0.02;
  if (nz) h.z = nz < 0 ? box.z0 - H.radius - 0.02 : box.z1 + H.radius + 0.02;
}

function stepWallrun(W, h, inp, dt) {
  const w = h.wall;
  h.wallT += dt;
  const sp = H.wallRunSpeed * (inp.sprint ? 1 : 0.85);
  h.vx = w.tx * sp;
  h.vz = w.tz * sp;
  h.vy = Math.max(-3, h.vy - 7 * dt);
  h.facing = Math.atan2(w.tx, w.tz);
  if (h.buffer > 0) {
    h.buffer = 0;
    h.mode = "air";
    h.vx = w.tx * sp * 0.8 + w.nx * 8;
    h.vz = w.tz * sp * 0.8 + w.nz * 8;
    h.vy = 10;
    h.jumpsUsed = 1;
    h.trick = 0.4;
    h.wall = null;
    W.events.push({ type: "jump" });
    return;
  }
  h.x += h.vx * dt;
  h.z += h.vz * dt;
  h.y += h.vy * dt;
  // keep on the face; end when the wall ends / time runs out / no longer sprinting
  const box = w.box;
  if (w.nx) h.x = w.nx < 0 ? box.x0 - H.radius - 0.02 : box.x1 + H.radius + 0.02;
  if (w.nz) h.z = w.nz < 0 ? box.z0 - H.radius - 0.02 : box.z1 + H.radius + 0.02;
  const off = w.nx ? h.z < box.z0 - 0.3 || h.z > box.z1 + 0.3 : h.x < box.x0 - 0.3 || h.x > box.x1 + 0.3;
  if (off || h.wallT > H.wallRunTime || !inp.sprint || h.y > box.y1 - 0.5) {
    h.mode = "air";
    h.wall = null;
    return;
  }
  if (floorAt(W.geo, h.x, h.z, h.y + 0.05, h.y - 0.1, fl)) {
    h.y = fl.y;
    h.mode = "ground";
    h.grounded = true;
    h.wall = null;
  }
  h.speed = sp;
}

/* ------------------------------------------------------------------ ledges */

function tryLedge(W, h) {
  if (h.vy > 3) return false;
  if (!wallContact(W.geo, h.x, h.y + 1.0, h.z, H.radius, wc)) return false;
  const b = wc.box;
  const rise = b.y1 - h.y;
  if (rise < 0.6 || rise > 2.3) return false;
  if (!floorAt(W.geo, h.x - wc.nx * 0.9, h.z - wc.nz * 0.9, b.y1 + 0.05, b.y1 - 0.05, fl)) return false;
  startLedge(W, h, b, wc.nx, wc.nz);
  return true;
}

function startLedge(W, h, b, nx, nz) {
  h.mode = "ledge";
  h.ledge = { t: 0, fx: h.x, fy: h.y, fz: h.z, tx: h.x - nx * 0.9, ty: b.y1, tz: h.z - nz * 0.9, box: b };
  h.vx = h.vy = h.vz = 0;
  h.wall = null;
  h.facing = Math.atan2(-nx, -nz);
  W.events.push({ type: "vault" });
}

function stepLedge(W, h, dt) {
  const L = h.ledge;
  L.t += dt / 0.34;
  const t = Math.min(1, L.t);
  const up = Math.min(1, t * 1.6);
  const fw = Math.max(0, (t - 0.35) / 0.65);
  h.x = L.fx + (L.tx - L.fx) * fw;
  h.z = L.fz + (L.tz - L.fz) * fw;
  h.y = L.fy + (L.ty - L.fy) * up;
  if (t >= 1) {
    h.mode = "ground";
    h.grounded = true;
    h.y = L.ty;
    h.floorBox = floorAt(W.geo, h.x, h.z, L.ty + 0.05, L.ty - 0.05, fl) ? fl.box : L.box;
    h.ledge = null;
    h.jumpsUsed = 0;
    const [fx, fz] = fwd(h.facing);
    h.vx = fx * 4;
    h.vz = fz * 4;
  }
}

/* ------------------------------------------------------------------ swinging */

function attach(W, h, a) {
  const dx = h.x - a.x;
  const dy = h.y + 1.5 - a.y;
  const dz = h.z - a.z;
  // the rope starts at the true distance (no snap); it reels in smoothly in stepSwing
  const len = Math.max(H.swingMinLen, Math.hypot(dx, dy, dz));
  // the arc must clear whatever is under it: the rope reels in (smoothly, in
  // stepSwing) until its lowest point is ~1 m above that floor
  const ox = a.x + (a.nx || 0) * 1.6;
  const oz = a.z + (a.nz || 0) * 1.6;
  let floor = W.geo.groundY;
  if (floorAt(W.geo, ox, oz, a.y - 2, -60, fl)) floor = fl.y;
  else if (W.city.water) floor = W.city.water.y;
  const clear = Math.max(H.swingMinLen, a.y - floor - 2.6);
  h.mode = "swing";
  h.swing = { ax: a.x, ay: a.y, az: a.z, len, target: Math.min(len, clear), t: 0, box: a.box };
  // the tug of a fresh line: a little speed toward the anchor's side of travel
  const hl = Math.hypot(a.x - h.x, a.z - h.z) || 1;
  h.vx += ((a.x - h.x) / hl) * 3;
  h.vz += ((a.z - h.z) / hl) * 3;
  if (h.grounded) {
    h.vy = Math.max(h.vy, 9);
    h.grounded = false;
  }
  h.jumpsUsed = 1;
  h.action = h.action === "dodge" ? "none" : h.action;
  W.stats.swings++;
  W.events.push({ type: "webAttach", x: a.x, y: a.y, z: a.z });
}

function release(W, h, jump) {
  const sp = Math.hypot(h.vx, h.vy, h.vz) || 1;
  const k = H.releaseBoost / sp;
  h.vx += h.vx * k;
  h.vz += h.vz * k;
  h.vy += H.releaseUp + (jump ? 4 : 0);
  h.mode = "air";
  h.swing = null;
  h.jumpsUsed = jump ? 1 : 1;
  h.jumpCut = true;
  if (sp > 14) h.trick = 0.6;
  h.airT = 0;
  W.events.push({ type: "webRelease", speed: sp });
}

function stepSwing(W, h, inp, dt) {
  const s = h.swing;
  s.t += dt;
  // let go: Q released, or jump
  if (!inp.swing || h.buffer > 0) {
    const j = h.buffer > 0;
    h.buffer = 0;
    release(W, h, j);
    return;
  }
  const m = wish(inp);
  const boost = 1 + (h.up.swing || 0) * 0.08;
  h.vy -= H.swingGravity * dt;
  // rope direction (anchor → hero hand)
  let rx = h.x - s.ax;
  let ry = h.y + 1.5 - s.ay;
  let rz = h.z - s.az;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // steering: input projected onto the plane perpendicular to the rope
  if (m.m > 0.1) {
    const d = m.x * rx + m.z * rz;
    const px = m.x - rx * d;
    const py = -ry * d;
    const pz = m.z - rz * d;
    h.vx += px * H.swingSteer * dt;
    h.vy += py * H.swingSteer * dt;
    h.vz += pz * H.swingSteer * dt;
    // pumping: push along the current motion low in the arc
    const sp = Math.hypot(h.vx, h.vz) || 1;
    const along = (m.x * h.vx + m.z * h.vz) / sp;
    if (along > 0 && ry < -0.5) {
      h.vx += (h.vx / sp) * H.swingPump * boost * along * dt;
      h.vz += (h.vz / sp) * H.swingPump * boost * along * dt;
    }
  }
  // integrate
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.z += h.vz * dt;
  // rope constraint (taut rope only pulls)
  let dx = h.x - s.ax;
  let dy = h.y + 1.5 - s.ay;
  let dz = h.z - s.az;
  const d = Math.hypot(dx, dy, dz);
  if (d > s.len) {
    dx /= d;
    dy /= d;
    dz /= d;
    h.x = s.ax + dx * s.len;
    h.y = s.ay + dy * s.len - 1.5;
    h.z = s.az + dz * s.len;
    const vr = h.vx * dx + h.vy * dy + h.vz * dz;
    if (vr > 0) {
      h.vx -= dx * vr;
      h.vy -= dy * vr;
      h.vz -= dz * vr;
    }
  }
  // reel in: a touch at the start for a snappy launch, then down to the
  // ground-clearance length (gradual — the constraint never snaps the hero)
  if (s.t < 0.35) s.len = Math.max(H.swingMinLen, s.len - 5 * dt);
  if (s.len > s.target) s.len = Math.max(s.target, s.len - 14 * dt);
  const sp3 = Math.hypot(h.vx, h.vy, h.vz);
  const cap = H.swingMax * boost;
  if (sp3 > cap) {
    h.vx *= cap / sp3;
    h.vy *= cap / sp3;
    h.vz *= cap / sp3;
  }
  if (Math.hypot(h.vx, h.vz) > 1) h.facing = Math.atan2(h.vx, h.vz);
  // collisions: walls stop the swing (and grab the wall if pushing into it)
  if (pushOut(W.geo, h, H.radius, h.y + 0.05, h.y + H.height, 0.3, hit)) {
    const l = Math.hypot(hit.nx, hit.nz) || 1;
    const nx = hit.nx / l;
    const nz = hit.nz / l;
    const vn = h.vx * nx + h.vz * nz;
    if (vn < -6 && hit.box && hit.box.climb) {
      h.swing = null;
      W.events.push({ type: "webRelease", speed: sp3 });
      startClimb(W, h, nx, nz, hit.box);
      return;
    }
    if (vn < 0) {
      h.vx -= nx * vn;
      h.vz -= nz * vn;
    }
  }
  // swung up level with the anchor, or touched down → release / land
  if (h.y + 1.5 > s.ay - 0.8) {
    release(W, h, false);
    return;
  }
  if (h.vy <= 0 && floorAt(W.geo, h.x, h.z, h.y + 0.1, h.y - 0.05, fl)) {
    h.swing = null;
    land(W, h, fl);
    return;
  }
  h.speed = Math.hypot(h.vx, h.vz);
}

/* ------------------------------------------------------------------ dodge */

function startDodge(W, h, inp) {
  const m = wish(inp);
  let dx = m.x;
  let dz = m.z;
  if (m.m < 0.1) {
    dx = -Math.sin(h.facing);
    dz = -Math.cos(h.facing);
  }
  if (h.mode === "swing") release(W, h, false);
  if (h.mode === "climb" || h.mode === "wallrun") {
    h.mode = "air";
    h.wall = null;
  }
  h.action = "dodge";
  h.actT = 0;
  h.dodgeDir = [dx, dz];
  h.iframes = Math.max(h.iframes, H.dodgeIframes);
  h.dodgeCd = H.dodgeCd;
  h.atk = null;
  W.stats.dodges++;
  // a dodge right as an attack lands is a perfect dodge → counter window
  const win = H.perfectWindow + (h.up.dodge || 0) * 0.08;
  if (W.threatWithin && W.threatWithin(win)) {
    h.perfectT = 0.4;
    h.counterT = H.counterWindow;
    W.gainEnergy(10);
    W.stats.perfect++;
    W.events.push({ type: "perfectDodge", x: h.x, y: h.y, z: h.z });
  } else W.events.push({ type: "dodge" });
}

export { wish, fwd, right };
