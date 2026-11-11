/**
 * Perspective: Impossible Rooms — the simulation. Pure data + maths (no DOM,
 * no three.js) so the game, the headless route bot and the tests all run the
 * very same code.
 *
 *   const s = createSim(level);
 *   s.update(dt, { mx, mz, jump, lookX, lookY, use, wheel, rotQ, rotR });
 *   s.events → [{ type, ... }] for audio / HUD / renderer
 *
 * Everything solid is an axis-aligned box. Grabbable objects only ever turn
 * in 90° steps, so their boxes stay exact.
 *
 * FORCED PERSPECTIVE. When you pick an object up we store k = scale / distance
 * — how big it looks. While held, the object is pushed out along the view ray
 * from the eye; at distance t its scale is k·t, so on screen it never changes
 * size. computeHold() marches t outward until the growing box first touches
 * anything (fine steps, then bisection), so an object only passes an opening
 * that it is smaller than at that moment, and it always ends up resting
 * against the surface you look at. Letting go leaves it there at that real
 * size, where gravity takes over. A placement that would overlap the player is
 * refused, so an object can never trap you.
 */
import {
  EYE, HEIGHT, RADIUS, WALK, ACCEL_GROUND, ACCEL_AIR, GRAVITY, JUMP_V, STEP, AIR_STEP,
  GRAB_REACH, USE_REACH, MIN_DIM, MAX_DIM, MAX_T, K_EYE, KILL_Y, DOOR_SPEED, PITCH_LIMIT, SHAPES,
} from "./constants.js";

const EPS = 1e-4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------ boxes */
export function box(x0, y0, z0, x1, y1, z1) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1) };
}
export function overlaps(a, b) {
  return a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS;
}
function overlapsXZ(a, b, e = EPS) {
  return a.x0 < b.x1 - e && a.x1 > b.x0 + e && a.z0 < b.z1 - e && a.z1 > b.z0 + e;
}
function areaXZ(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const d = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return w > 0 && d > 0 ? w * d : 0;
}
/** Ray vs box (slab test): distance to entry, or Infinity. */
export function rayBox(o, d, b, maxT = Infinity) {
  let t0 = 0,
    t1 = maxT;
  const mn = [b.x0, b.y0, b.z0],
    mx = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return Infinity;
    } else {
      let a = (mn[i] - o[i]) / d[i],
        c = (mx[i] - o[i]) / d[i];
      if (a > c) [a, c] = [c, a];
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
      if (t0 > t1) return Infinity;
    }
  }
  return t0;
}

/* ------------------------------------------------------------------ orientation (signed permutation matrices) */
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function matMul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
const ROT_Y = [0, 0, 1, 0, 1, 0, -1, 0, 0]; // +90° about world y
const ROT_X = [1, 0, 0, 0, 0, -1, 0, 1, 0]; // +90° about world x
const ROT_Z = [0, -1, 0, 1, 0, 0, 0, 0, 1]; // +90° about world z
export function rotYaw(m, n = 1) {
  let r = m;
  for (let i = 0; i < ((n % 4) + 4) % 4; i++) r = matMul(ROT_Y, r);
  return r;
}
/** Half extents of an object at a given scale, in world axes. */
export function halfExt(o, scale = o.scale) {
  const b = SHAPES[o.shape].base,
    m = o.rot;
  const l = [b[0] * scale * 0.5, b[1] * scale * 0.5, b[2] * scale * 0.5];
  return [0, 1, 2].map((i) => Math.abs(m[i * 3]) * l[0] + Math.abs(m[i * 3 + 1]) * l[1] + Math.abs(m[i * 3 + 2]) * l[2]);
}
export function objBox(o, pos = o.pos, scale = o.scale) {
  const h = halfExt(o, scale);
  return { x0: pos[0] - h[0], y0: pos[1] - h[1], z0: pos[2] - h[2], x1: pos[0] + h[0], y1: pos[1] + h[1], z1: pos[2] + h[2] };
}
export function scaleLimits(o) {
  const b = SHAPES[o.shape].base;
  const big = Math.max(...b);
  return { min: MIN_DIM / big, max: MAX_DIM / big };
}
/** Equivalent cube edge — what heavy plates weigh. */
export function objWeight(o) {
  const b = SHAPES[o.shape].base;
  return Math.cbrt(b[0] * b[1] * b[2]) * o.scale;
}

export function forward(yaw, pitch) {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}
export function aimAt(from, to) {
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/* ------------------------------------------------------------------ sim */
export function createSim(L) {
  const objs = L.objs.map((o, i) => ({
    id: i,
    shape: o.shape,
    color: o.color,
    scale: o.scale,
    rot: o.rot ? o.rot.slice() : IDENT.slice(),
    pos: o.pos.slice(),
    vy: 0,
    held: false,
    home: { scale: o.scale, rot: o.rot ? o.rot.slice() : IDENT.slice(), pos: o.pos.slice() },
    name: SHAPES[o.shape].name,
  }));
  const s = {
    L,
    t: 0,
    state: "play",
    events: [],
    stats: { grabs: 0, falls: 0 },
    player: { x: L.spawn.x, y: L.spawn.y, z: L.spawn.z, vx: 0, vy: 0, vz: 0, yaw: L.spawn.yaw || 0, pitch: 0, ground: false, bob: 0, speed: 0, airT: 0 },
    objs,
    plates: L.plates.map((p) => ({ ...p, on: false })),
    doors: L.doors.map((d) => ({ ...d, open: 0, jam: false })),
    buttons: L.buttons.map((b) => ({ ...b, on: false, left: 0 })),
    exits: L.exits.map((e) => ({ ...e, unlocked: false })),
    views: L.views.map((v) => ({ ...v, align: 0, done: false })),
    hidden: L.hidden.map((h) => ({ ...h })),
    latched: {},
    signals: {},
    hold: null,
    focus: null,
    colliders: [],
  };
  s.update = (dt, input = {}) => update(s, dt, input);
  rebuildColliders(s);
  evalSignals(s);
  for (const d of s.doors) d.open = d.when.every((n) => s.signals[n]) ? 1 : 0;
  rebuildColliders(s);
  return s;
}

function doorBox(d) {
  const h = d.b.y1 - d.b.y0;
  return { x0: d.b.x0, x1: d.b.x1, z0: d.b.z0, z1: d.b.z1, y0: d.b.y0 + d.open * h, y1: d.b.y1 + d.open * h };
}

function rebuildColliders(s) {
  const c = [];
  for (const b of s.L.boxes) c.push(b);
  for (const p of s.plates) c.push(p.box);
  for (const d of s.doors) {
    const b = doorBox(d);
    b.door = d;
    c.push(b);
  }
  for (const h of s.hidden) if (s.latched[h.view]) c.push(h.b);
  for (const b of s.buttons) c.push(b.box);
  s.colliders = c;
}

export function playerBox(p, x = p.x, y = p.y, z = p.z) {
  return { x0: x - RADIUS, x1: x + RADIUS, y0: y, y1: y + HEIGHT, z0: z - RADIUS, z1: z + RADIUS };
}
export function eyeOf(p) {
  return [p.x, p.y + EYE, p.z];
}

function blockersOf(s, b, skipObj = null) {
  const out = [];
  for (const c of s.colliders) if (overlaps(b, c)) out.push(c);
  for (const o of s.objs) if (!o.held && o !== skipObj && overlaps(b, objBox(o))) out.push(objBox(o));
  return out;
}
function hitsAny(s, b, skipObj = null) {
  for (const c of s.colliders) if (overlaps(b, c)) return true;
  for (const o of s.objs) if (!o.held && o !== skipObj && overlaps(b, objBox(o))) return true;
  return false;
}

/* ------------------------------------------------------------------ player movement */
function movePlayer(s, dt, input) {
  const p = s.player;
  const sy = Math.sin(p.yaw),
    cy = Math.cos(p.yaw);
  let wx = -sy * (input.mz || 0) + cy * (input.mx || 0);
  let wz = -cy * (input.mz || 0) - sy * (input.mx || 0);
  const len = Math.hypot(wx, wz);
  if (len > 1) {
    wx /= len;
    wz /= len;
  }
  wx *= WALK;
  wz *= WALK;
  const a = (p.ground ? ACCEL_GROUND : ACCEL_AIR) * dt;
  const dvx = wx - p.vx,
    dvz = wz - p.vz;
  const dl = Math.hypot(dvx, dvz);
  if (dl <= a) {
    p.vx = wx;
    p.vz = wz;
  } else {
    p.vx += (dvx / dl) * a;
    p.vz += (dvz / dl) * a;
  }
  if (input.jump && p.ground) {
    p.vy = JUMP_V;
    p.ground = false;
    s.events.push({ type: "jump" });
  }
  p.vy = Math.max(-40, p.vy - GRAVITY * dt);
  const wasGround = p.ground;
  moveH(s, "x", p.vx * dt, wasGround);
  moveH(s, "z", p.vz * dt, wasGround);
  moveV(s, p.vy * dt);
  p.speed = Math.hypot(p.vx, p.vz);
  if (p.ground) {
    p.bob += p.speed * dt * 1.9;
    if (!wasGround && p.airT > 0.35) s.events.push({ type: "land" });
    p.airT = 0;
  } else p.airT += dt;
}

function moveH(s, axis, d, grounded) {
  if (!d) return;
  const p = s.player;
  const old = p[axis];
  p[axis] += d;
  const bl = blockersOf(s, playerBox(p));
  if (!bl.length) return;
  // step up onto low ledges
  let top = -Infinity;
  for (const b of bl) top = Math.max(top, b.y1);
  const rise = top - p.y;
  if (rise > 0 && rise <= (grounded ? STEP : AIR_STEP) && !hitsAny(s, playerBox(p, p.x, top + 0.001, p.z))) {
    p.y = top + 0.001;
    if (p.vy < 0) p.vy = 0;
    p.stepped = rise;
    return;
  }
  const lo = axis === "x" ? "x0" : "z0",
    hi = axis === "x" ? "x1" : "z1";
  let np = p[axis];
  for (const b of bl) {
    if (d > 0) np = Math.min(np, b[lo] - RADIUS - EPS * 2);
    else np = Math.max(np, b[hi] + RADIUS + EPS * 2);
  }
  if ((d > 0 && np < old) || (d < 0 && np > old)) np = old;
  p[axis] = np;
  if (axis === "x") p.vx = 0;
  else p.vz = 0;
}

function moveV(s, d) {
  const p = s.player;
  const old = p.y;
  p.y += d;
  p.ground = false;
  const bl = blockersOf(s, playerBox(p));
  if (!bl.length) return;
  if (d < 0) {
    let top = -Infinity;
    for (const b of bl) if (b.y1 <= old + 0.05) top = Math.max(top, b.y1);
    if (top > -Infinity) {
      p.y = top;
      p.vy = 0;
      p.ground = true;
    } else p.y = old;
  } else {
    let bot = Infinity;
    for (const b of bl) bot = Math.min(bot, b.y0);
    p.y = Math.max(old, bot - HEIGHT - EPS);
    p.vy = 0;
  }
}

/* ------------------------------------------------------------------ forced-perspective hold */
/**
 * Where the held object would be for a view direction. Pure: used every frame
 * for the live preview, and by the route bot to choose its aim.
 */
export function computeHold(s, yaw = s.player.yaw, pitch = s.player.pitch, limit = s.hold ? s.hold.limit : Infinity) {
  const h = s.hold;
  const o = h.obj;
  const k = h.k;
  const hb = halfExt(o, 1);
  const lim = scaleLimits(o);
  const eye = eyeOf(s.player);
  const dir = forward(yaw, pitch);
  const tLo = Math.max(0.3, lim.min / k);
  let tHi = Math.min(MAX_T, lim.max / k, limit);
  if (tHi < tLo) tHi = tLo;
  const at = (t) => {
    const c = [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
    const e = k * t;
    return { c, b: { x0: c[0] - hb[0] * e, x1: c[0] + hb[0] * e, y0: c[1] - hb[1] * e, y1: c[1] + hb[1] * e, z0: c[2] - hb[2] * e, z1: c[2] + hb[2] * e } };
  };
  const free = (t) => !hitsAny(s, at(t).b, o);
  if (!free(tLo)) {
    const r = at(tLo);
    return { valid: false, reason: "blocked", t: tLo, center: r.c, scale: k * tLo, box: r.b };
  }
  let a = tLo,
    b = null;
  let t = tLo;
  while (t < tHi) {
    const t2 = Math.min(tHi, t + clamp(t * 0.03, 0.03, 0.1));
    if (!free(t2)) {
      b = t2;
      break;
    }
    a = t2;
    t = t2;
  }
  if (b !== null) {
    for (let i = 0; i < 12; i++) {
      const m = (a + b) / 2;
      if (free(m)) a = m;
      else b = m;
    }
  }
  const r = at(a);
  const pb = playerBox(s.player);
  const inflated = { x0: pb.x0 - 0.04, x1: pb.x1 + 0.04, y0: pb.y0 - 0.04, y1: pb.y1 + 0.1, z0: pb.z0 - 0.04, z1: pb.z1 + 0.04 };
  if (overlaps(r.b, inflated)) return { valid: false, reason: "player", t: a, center: r.c, scale: k * a, box: r.b };
  return { valid: true, reason: null, t: a, center: r.c, scale: k * a, box: r.b, touching: b !== null };
}

/** Where the held object would come to rest if dropped now (top surface below its footprint). */
export function landingY(s) {
  const h = s.hold;
  if (!h) return null;
  const b = objBox(h.obj);
  let land = -Infinity;
  const test = (c) => {
    if (overlapsXZ(b, c) && c.y1 <= b.y0 + 2e-3 && c.y1 > land) land = c.y1;
  };
  for (const c of s.colliders) test(c);
  for (const o of s.objs) if (!o.held) test(objBox(o));
  return land > -Infinity ? land : null;
}

function grab(s, o) {
  const eye = eyeOf(s.player);
  const d = Math.max(0.4, Math.hypot(o.pos[0] - eye[0], o.pos[1] - eye[1], o.pos[2] - eye[2]));
  const hb = halfExt(o, 1);
  const kMax = K_EYE / Math.hypot(hb[0], hb[1], hb[2]);
  const k = Math.min(o.scale / d, kMax);
  o.held = true;
  o.vy = 0;
  s.hold = { obj: o, k, limit: Infinity, valid: false, reason: null, t: d, scale: o.scale };
  s.stats.grabs++;
  s.events.push({ type: "grab", obj: o.id });
  refreshHold(s);
}

function refreshHold(s) {
  const h = s.hold;
  if (!h) return;
  const r = computeHold(s);
  h.valid = r.valid;
  h.reason = r.reason;
  h.t = r.t;
  h.scale = r.scale;
  h.touching = !!r.touching;
  h.obj.pos = r.center;
  h.obj.scale = r.scale;
}

function release(s) {
  const h = s.hold;
  if (!h) return false;
  refreshHold(s);
  if (!h.valid) {
    s.events.push({ type: "deny", reason: h.reason });
    return false;
  }
  const o = h.obj;
  o.held = false;
  o.vy = 0;
  s.hold = null;
  s.events.push({ type: "drop", obj: o.id, scale: o.scale, weight: objWeight(o) });
  return true;
}

function rotateHeld(s, kind) {
  const h = s.hold;
  if (!h) return;
  const o = h.obj;
  if (kind === "Q") o.rot = matMul(ROT_Y, o.rot);
  else {
    // tip the object over, about the horizontal axis closest to "camera right"
    const p = s.player;
    const rx = Math.cos(p.yaw),
      rz = -Math.sin(p.yaw);
    if (Math.abs(rx) >= Math.abs(rz)) o.rot = matMul(rx > 0 ? ROT_X : matMul(ROT_X, matMul(ROT_X, ROT_X)), o.rot);
    else o.rot = matMul(rz > 0 ? ROT_Z : matMul(ROT_Z, matMul(ROT_Z, ROT_Z)), o.rot);
  }
  s.events.push({ type: "rotate" });
  refreshHold(s);
}

/* ------------------------------------------------------------------ objects */
function settleObjects(s, dt) {
  const list = s.objs.filter((o) => !o.held).sort((a, b) => objBox(a).y0 - objBox(b).y0);
  const pb = playerBox(s.player);
  for (const o of list) {
    o.vy = Math.max(-40, o.vy - GRAVITY * dt);
    const d = o.vy * dt;
    const b = objBox(o);
    const nb = b.y0 + d;
    let land = -Infinity;
    const test = (c) => {
      if (overlapsXZ(b, c) && c.y1 <= b.y0 + 2e-3 && c.y1 > nb) land = Math.max(land, c.y1);
    };
    for (const c of s.colliders) test(c);
    for (const q of s.objs) if (q !== o && !q.held) test(objBox(q));
    test(pb);
    if (land > -Infinity) {
      if (o.vy < -6) s.events.push({ type: "thud", obj: o.id, weight: objWeight(o) });
      o.pos[1] = land + (b.y1 - b.y0) / 2;
      o.vy = 0;
    } else o.pos[1] += d;
    if (o.pos[1] < (s.L.killY ?? KILL_Y)) respawnObj(s, o);
  }
}

function respawnObj(s, o) {
  o.scale = o.home.scale;
  o.rot = o.home.rot.slice();
  o.pos = o.home.pos.slice();
  o.vy = 0;
  for (let i = 0; i < 30; i++) {
    const b = objBox(o);
    if (!hitsAny(s, b, o) && !overlaps(b, playerBox(s.player))) break;
    o.pos[1] += 0.6;
  }
  s.events.push({ type: "objReturn", obj: o.id });
}

/* ------------------------------------------------------------------ mechanisms */
function plateOn(s, p) {
  const top = p.box.y1;
  if (p.need === "any" || p.need === "player") {
    const pl = s.player;
    if (pl.ground && Math.abs(pl.y - top) < 0.06 && overlapsXZ(playerBox(pl), p.box, 0.02)) return true;
    if (p.need === "player") return false;
  }
  const pa = (p.box.x1 - p.box.x0) * (p.box.z1 - p.box.z0);
  for (const o of s.objs) {
    if (o.held) continue;
    const b = objBox(o);
    if (Math.abs(b.y0 - top) > 0.06) continue;
    const oa = (b.x1 - b.x0) * (b.z1 - b.z0);
    if (areaXZ(b, p.box) < 0.25 * Math.min(pa, oa)) continue;
    if (p.need === "heavy" && objWeight(o) < p.min - 1e-6) continue;
    return true;
  }
  return false;
}

function evalSignals(s) {
  const sig = {};
  const and = (n, v) => (sig[n] = n in sig ? sig[n] && v : v);
  for (const p of s.plates) and(p.signal, p.on);
  for (const b of s.buttons) and(b.signal, b.on);
  for (const n of Object.keys(s.latched)) if (s.latched[n]) sig[n] = true;
  s.signals = sig;
}

function updateMechanisms(s, dt) {
  // viewpoints: stand on the eye mark, look at the target
  const p = s.player;
  const eye = eyeOf(p);
  const dir = forward(p.yaw, p.pitch);
  for (const v of s.views) {
    if (v.done) {
      v.align = Math.min(1, v.align + dt * 2);
      continue;
    }
    const ve = [v.eye[0], v.eye[1] + EYE, v.eye[2]];
    const dist = Math.hypot(eye[0] - ve[0], eye[1] - ve[1], eye[2] - ve[2]);
    const to = [v.target[0] - ve[0], v.target[1] - ve[1], v.target[2] - ve[2]];
    const tl = Math.hypot(...to);
    const cos = (dir[0] * to[0] + dir[1] * to[1] + dir[2] * to[2]) / tl;
    const ang = Math.acos(clamp(cos, -1, 1));
    v.align = clamp(1 - dist / 3.5, 0, 1) * clamp(1 - ang / 0.6, 0, 1);
    v.ang = ang;
    v.dist = dist;
    if (dist <= v.radius && ang <= v.cone && p.ground) {
      v.done = true;
      s.latched[v.id] = true;
      s.events.push({ type: "aligned", view: v.id, kind: v.kind });
    }
  }
  // plates
  for (const pl of s.plates) {
    const on = plateOn(s, pl);
    if (on !== pl.on) {
      pl.on = on;
      s.events.push({ type: on ? "plateOn" : "plateOff", signal: pl.signal });
    }
  }
  // timed switches
  for (const b of s.buttons) {
    if (b.mode === "timed" && b.on) {
      b.left -= dt;
      if (b.left <= 0) {
        b.on = false;
        s.events.push({ type: "switchOff" });
      }
    }
  }
  evalSignals(s);
  // doors: open while every signal holds; can't close onto you or an object
  const pb = playerBox(p);
  for (const d of s.doors) {
    const want = d.when.every((n) => s.signals[n]) ? 1 : 0;
    const h = d.b.y1 - d.b.y0;
    if (want > d.open) {
      if (d.open === 0) s.events.push({ type: "doorOpen" });
      d.open = Math.min(1, d.open + (DOOR_SPEED * dt) / h);
      d.jam = false;
    } else if (want < d.open) {
      let bottom = d.b.y0 + Math.max(0, d.open - (DOOR_SPEED * dt) / h) * h;
      const cur = doorBox(d);
      let jam = false;
      const test = (b) => {
        if (overlapsXZ(b, cur) && b.y0 < cur.y0 + EPS && b.y1 > bottom) {
          bottom = Math.max(bottom, b.y1);
          jam = true;
        }
      };
      for (const o of s.objs) if (!o.held) test(objBox(o));
      test(pb);
      const no = clamp((bottom - d.b.y0) / h, 0, 1);
      if (jam && !d.jam && no > 0.02) s.events.push({ type: "jam" });
      if (!jam && d.open === 1) s.events.push({ type: "doorClose" });
      d.jam = jam && no > 0.02;
      d.open = Math.min(d.open, no);
    }
  }
  rebuildColliders(s);
  // exits
  for (const e of s.exits) {
    const u = e.when.every((n) => s.signals[n]);
    if (u && !e.unlocked) s.events.push({ type: "exitOpen" });
    e.unlocked = u;
    if (u && s.state === "play" && overlaps(pb, e.trigger)) {
      s.state = "complete";
      s.events.push({ type: "complete" });
    }
  }
}

/* ------------------------------------------------------------------ focus (what the crosshair is on) */
/** Nearest thing along a ray: { obj, collider, dist }. */
export function rayPick(s, eye, dir, maxT = 60) {
  let best = Infinity,
    hit = null,
    obj = null;
  for (const c of s.colliders) {
    const t = rayBox(eye, dir, c, maxT);
    if (t < best) {
      best = t;
      hit = c;
    }
  }
  for (const o of s.objs) {
    if (o.held) continue;
    const t = rayBox(eye, dir, objBox(o), maxT);
    if (t < best) {
      best = t;
      obj = o;
      hit = null;
    }
  }
  return best < Infinity ? { obj, collider: hit, dist: best } : null;
}

function updateFocus(s) {
  const p = s.player;
  const eye = eyeOf(p);
  const dir = forward(p.yaw, p.pitch);
  const pick = rayPick(s, eye, dir);
  const best = pick ? pick.dist : Infinity;
  const hit = pick?.collider || null;
  const obj = pick?.obj || null;
  let f = null;
  if (s.hold) f = null;
  else if (obj && best <= GRAB_REACH) f = { kind: "obj", id: obj.id, name: obj.name, dist: best };
  else if (hit) {
    const btn = s.buttons.find((b) => b.box === hit);
    const plate = s.plates.find((pl) => pl.box === hit);
    if (btn && best <= USE_REACH) f = { kind: "button", button: btn, dist: best };
    else if (plate && best <= 14) f = { kind: "plate", plate, dist: best };
  }
  if (!f && !s.hold) {
    for (const e of s.exits) {
      const t = rayBox(eye, dir, e.trigger, 40);
      if (t < best + 0.6 && t < 40) {
        f = { kind: "exit", exit: e, dist: t };
        break;
      }
    }
  }
  s.focus = f;
  s.lookDist = best;
}

function interact(s) {
  if (s.hold) return release(s);
  const f = s.focus;
  if (!f) return false;
  if (f.kind === "obj") {
    grab(s, s.objs[f.id]);
    return true;
  }
  if (f.kind === "button") {
    const b = f.button;
    if (b.mode === "toggle") b.on = !b.on;
    else {
      b.on = true;
      b.left = b.time;
    }
    s.events.push({ type: "switch", on: b.on });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ main step */
function update(s, dt, input) {
  if (s.state !== "play") return;
  s.t += dt;
  const p = s.player;
  if (input.aim) {
    p.yaw = input.aim.yaw;
    p.pitch = clamp(input.aim.pitch, -PITCH_LIMIT, PITCH_LIMIT);
  } else {
    p.yaw -= input.lookX || 0;
    p.pitch = clamp(p.pitch - (input.lookY || 0), -PITCH_LIMIT, PITCH_LIMIT);
  }
  movePlayer(s, dt, input);
  if (p.y < (s.L.killY ?? KILL_Y)) {
    p.x = s.L.spawn.x;
    p.y = s.L.spawn.y;
    p.z = s.L.spawn.z;
    p.vx = p.vy = p.vz = 0;
    p.yaw = s.L.spawn.yaw || 0;
    p.pitch = 0;
    for (let i = 0; i < 30 && hitsAny(s, playerBox(p)); i++) p.y += 0.5;
    s.stats.falls++;
    s.events.push({ type: "fall" });
  }
  settleObjects(s, dt);
  updateMechanisms(s, dt);
  if (s.hold) {
    if (input.wheel) {
      const h = s.hold;
      const base = Number.isFinite(h.limit) ? Math.min(h.limit, h.t) : h.t;
      const next = base * (input.wheel > 0 ? 1.12 : 1 / 1.12);
      h.limit = input.wheel > 0 && next >= computeHold(s, p.yaw, p.pitch, Infinity).t ? Infinity : Math.max(0.3, next);
      s.events.push({ type: "wheel" });
    }
    if (input.limit !== undefined) s.hold.limit = input.limit;
    if (input.rotQ) rotateHeld(s, "Q");
    if (input.rotR) rotateHeld(s, "R");
    refreshHold(s);
  }
  updateFocus(s);
  if (input.use) interact(s);
}
