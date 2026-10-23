/**
 * Gravity Sketch — physics core (Matter.js). Pure JS with no DOM access so the
 * same code runs in the browser and in the headless level tests (./tools).
 *
 * The world is a fixed 1600×900 design space. A level is plain data (see
 * ./levels.js): objects, a goal (conditions that must all hold for `hold`
 * seconds), optional fail conditions, an ink budget and a star par.
 *
 * The simulation is frozen until the player commits their first shape, so a
 * puzzle can be read before anything moves. It always advances in fixed
 * steps, which keeps the game and the headless solver deterministic.
 */
import Matter from "matter-js";

const { Engine, Bodies, Body, Composite, Constraint, Query, Events } = Matter;

export const W = 1600;
export const H = 900;
export const FRAME = 1 / 60; // seconds per game frame
const SUB = 2; // physics sub-steps per frame (fast balls vs. thin lines)
export const INK_W = 12; // stroke thickness in world units
export const DOT_R = 16; // a tap makes a small ball
const MIN_PT = 5; // min spacing of raw stroke points
const MAX_PARTS = 48;
const GONE_Y = H + 260;

const rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------------- stroke geometry ---------------- */

/** Ramer–Douglas–Peucker on [{x,y}] */
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1e-9;
  let best = -1, bi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = len < 1e-6 ? dist(p, a) : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
    if (d > best) (best = d), (bi = i);
  }
  if (best <= eps) return [a, b];
  return rdp(pts.slice(0, bi + 1), eps).slice(0, -1).concat(rdp(pts.slice(bi), eps));
}

export function strokeLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** Simplify a raw stroke into at most MAX_PARTS segments. */
export function simplify(raw) {
  let eps = 2.2, out = rdp(raw, eps);
  while (out.length - 1 > MAX_PARTS) out = rdp(raw, (eps *= 1.5));
  // drop zero-length segments
  return out.filter((p, i) => i === 0 || dist(p, out[i - 1]) > 2);
}

/* ---------------- world construction ---------------- */

const STATIC_OPTS = { isStatic: true, friction: 0.7, restitution: 0.05 };

/** Matter scales inertia ×4 for stability, which makes balls roll like syrup;
 *  give circles their true solid-disc inertia so they roll freely. */
function rollable(b) {
  Body.setInertia(b, (b.mass * b.circleRadius * b.circleRadius) / 2);
  return b;
}

/** Real moment of inertia for a drawn compound (Matter sums part inertias
 *  scaled ×4 and skips the parallel-axis term, so drawn wheels wouldn't roll). */
function trueInertia(body) {
  const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
  let I = 0;
  for (const p of parts) {
    const w = p.gsLen, h = INK_W;
    const dx = p.position.x - body.position.x, dy = p.position.y - body.position.y;
    I += (p.mass * (w * w + h * h)) / 12 + p.mass * (dx * dx + dy * dy);
  }
  Body.setInertia(body, I * 1.2);
}

function makeBody(o) {
  const common = {
    friction: o.f ?? 0.5,
    frictionAir: o.air ?? (o.k === "ball" ? 0.0012 : 0.003),
    restitution: o.e ?? 0.12,
    density: o.d ?? 0.001,
    angle: rad(o.a ?? 0),
  };
  let b;
  if (o.k === "ball") b = rollable(Bodies.circle(o.x, o.y, o.r, { ...common, frictionStatic: 0.6 }));
  else {
    b = Bodies.rectangle(o.x, o.y, o.w, o.h, { ...common, chamfer: o.cham ? { radius: o.cham } : undefined });
    // true box inertia (Matter's ×4 default makes dominoes and crates refuse to tip)
    Body.setInertia(b, (b.mass * (o.w * o.w + o.h * o.h)) / 12);
  }
  if (o.s) Body.setStatic(b, true);
  if (o.s && o.f != null) b.friction = o.f;
  return b;
}

/**
 * Builds a fresh simulation for a level.
 * sim.objs is the render list: { o (level data), body?, parts?, kind }.
 */
export function createSim(level) {
  const engine = Engine.create({ enableSleeping: false });
  engine.gravity.y = level.g ?? 1;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  engine.constraintIterations = 4;
  const sim = {
    level,
    engine,
    objs: [],
    byId: new Map(), // level id → body
    objById: new Map(),
    drawn: [], // { body, pts (local), dot, ink }
    blockers: [], // bodies you can't draw through
    nodraw: [],
    zones: new Map(),
    time: 0,
    started: false,
    state: "ready", // ready | running | won | failed
    hold: 0,
    goalMet: false,
    hit: new Set(),
    pressed: new Set(),
    opened: new Set(),
    inkUsed: 0,
    contacts: new Map(), // "idA:idB" → last sim time the pair was in contact
    events: [],
    failReason: "",
    frames: 0,
  };
  let group = 0;
  const add = (body, o, kind = o.k) => {
    Composite.add(engine.world, body);
    const rec = { o, body, kind, alpha: 1 };
    sim.objs.push(rec);
    if (o.id) {
      sim.byId.set(o.id, body);
      sim.objById.set(o.id, rec);
    }
    body.gsKind = kind;
    body.gsId = o.id || null;
    sim.blockers.push(body);
    return rec;
  };

  for (const o of level.objs) {
    switch (o.k) {
      case "box":
      case "ball":
      case "gate": {
        const b = makeBody(o.k === "gate" ? { ...o, s: true } : o);
        const rec = add(b, o);
        if (o.held) {
          // dynamic body pinned in place until a switch releases it
          if (!o.s) Body.setStatic(b, true);
          rec.held = true;
        }
        if (o.k !== "gate" && !o.s && !o.held) b.gsDynamic = true;
        break;
      }
      case "cup": {
        const t = o.t ?? 14, { x, y, w, h } = o; // x,y = bottom centre
        const parts = [
          Bodies.rectangle(x, y - t / 2, w, t),
          Bodies.rectangle(x - w / 2 + t / 2, y - h / 2, t, h),
          Bodies.rectangle(x + w / 2 - t / 2, y - h / 2, t, h),
        ];
        const b = Body.create({ parts, ...STATIC_OPTS });
        add(b, o);
        sim.zones.set(o.id ? o.id + ":in" : `cup${sim.objs.length}`, { x: x - w / 2 + t, y: y - h, w: w - 2 * t, h: h - t });
        if (o.id) sim.zones.set(o.id, { x: x - w / 2 + t, y: y - h, w: w - 2 * t, h: h - t });
        break;
      }
      case "seesaw": {
        group -= 1;
        const ph = o.h ?? 16, cx = o.x + (o.off ?? 0);
        const popts = { friction: 0.8, density: o.d ?? 0.002, collisionFilter: { group }, frictionAir: o.air ?? 0.01 };
        let plank;
        if (o.lips) {
          // end lips keep a ball in the cup of the plank (a catapult)
          const parts = [
            Bodies.rectangle(cx, o.y, o.w, ph, popts),
            Bodies.rectangle(cx - o.w / 2 + 6, o.y - ph / 2 - 14, 12, 28, popts),
            Bodies.rectangle(cx + o.w / 2 - 6, o.y - ph / 2 - 14, 12, 28, popts),
          ];
          plank = Body.create({ parts, ...popts });
          Body.setPosition(plank, { x: plank.position.x, y: plank.position.y });
          Body.rotate(plank, rad(o.a ?? 0), { x: o.x, y: o.y });
        } else plank = Bodies.rectangle(cx, o.y, o.w, ph, { ...popts, angle: rad(o.a ?? 0) });
        const rec = add(plank, o);
        plank.gsDynamic = true;
        const sh = o.stand ?? 70;
        const stand = Bodies.trapezoid(o.x, o.y + 6 + sh / 2, 70, sh, 0.7, { ...STATIC_OPTS, collisionFilter: { group } });
        Composite.add(engine.world, stand);
        sim.objs.push({ o: { k: "stand", c: o.c }, body: stand, kind: "stand", alpha: 1 });
        sim.blockers.push(stand);
        const pin = Constraint.create({ pointA: { x: o.x, y: o.y }, bodyB: plank, pointB: { x: o.x - plank.position.x, y: o.y - plank.position.y }, length: 0, stiffness: 1 });
        Composite.add(engine.world, pin);
        rec.pivot = { x: o.x, y: o.y };
        break;
      }
      case "pend": {
        const a = rad(o.a ?? 0);
        const bx = o.ax + Math.sin(a) * o.len, by = o.ay + Math.cos(a) * o.len;
        const ball = rollable(Bodies.circle(bx, by, o.r, { friction: 0.3, restitution: 0.3, density: o.d ?? 0.004, frictionAir: 0.002 }));
        const rec = add(ball, o);
        ball.gsDynamic = true;
        const rope = Constraint.create({ pointA: { x: o.ax, y: o.ay }, bodyB: ball, length: o.len, stiffness: 1 });
        Composite.add(engine.world, rope);
        rec.anchor = { x: o.ax, y: o.ay };
        if (o.held) {
          Body.setStatic(ball, true);
          rec.held = true;
        }
        break;
      }
      case "switch": {
        const b = Bodies.rectangle(o.x, o.y, o.w ?? 90, 16, { ...STATIC_OPTS, angle: rad(o.a ?? 0) });
        add(b, o);
        break;
      }
      case "target": {
        const b = Bodies.circle(o.x, o.y, o.r ?? 28, { isStatic: true, isSensor: true });
        add(b, o);
        break;
      }
      case "mover":
      case "spin": {
        const b = Bodies.rectangle(o.x, o.y, o.w, o.h, { ...STATIC_OPTS, angle: rad(o.a ?? 0) });
        const rec = add(b, o);
        rec.base = { x: o.x, y: o.y, a: rad(o.a ?? 0) };
        break;
      }
      case "zone":
        sim.zones.set(o.id, { x: o.x, y: o.y, w: o.w, h: o.h });
        sim.objs.push({ o, kind: "zone", alpha: 1 });
        break;
      case "nodraw":
        sim.nodraw.push(o);
        sim.objs.push({ o, kind: "nodraw", alpha: 1 });
        break;
      default:
        throw new Error(`unknown object kind ${o.k}`);
    }
  }

  Events.on(engine, "collisionStart", (e) => {
    for (const p of e.pairs) {
      if (p.isSensor) continue;
      const A = p.bodyA.parent, B = p.bodyB.parent;
      const vx = A.velocity.x - B.velocity.x, vy = A.velocity.y - B.velocity.y;
      const v = Math.hypot(vx, vy);
      if (v > 3) sim.events.push({ type: "bump", v, x: p.collision.supports?.[0]?.x ?? A.position.x, y: p.collision.supports?.[0]?.y ?? A.position.y });
    }
  });
  return sim;
}

/* ---------------- drawing rules ---------------- */

const inRect = (p, r, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
const liveBlockers = (sim) => sim.blockers.filter((b) => !b.gsGone);

/** Can a stroke point sit here? (inside the world, outside every body and no-draw zone) */
export function pointFree(sim, p) {
  if (p.x < INK_W || p.x > W - INK_W || p.y < INK_W || p.y > H - INK_W) return false;
  if (sim.nodraw.some((r) => inRect(p, r, INK_W / 2))) return false;
  const probe = Bodies.circle(p.x, p.y, INK_W / 2 + 1);
  return Query.collides(probe, liveBlockers(sim)).length === 0;
}

/** Can a stroke segment a→b be drawn? */
export function segmentFree(sim, a, b) {
  if (!pointFree(sim, b)) return false;
  const L = dist(a, b);
  if (L < 0.5) return true;
  // sample no-draw zones along the segment
  const n = Math.ceil(L / 6);
  for (let i = 1; i < n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
    if (sim.nodraw.some((r) => inRect(p, r, INK_W / 2))) return false;
  }
  const ray = Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, L, INK_W + 2, { angle: Math.atan2(b.y - a.y, b.x - a.x) });
  return Query.collides(ray, liveBlockers(sim)).length === 0;
}

export const inkLeft = (sim) => Math.max(0, sim.level.ink - sim.inkUsed);

/**
 * A stroke-in-progress helper used by the UI and the solver. Feeds raw points,
 * stops at the first blocked segment or when the ink runs out.
 */
export function createStroke(sim) {
  // blocked points are skipped (st.blocked flags it for feedback) so the pen can
  // slide along an obstacle instead of the whole stroke ending there
  const st = { pts: [], ink: 0, blocked: false, dead: false };
  st.add = (p) => {
    if (st.dead) return false;
    st.blocked = false;
    const last = st.pts[st.pts.length - 1];
    if (!last) {
      if (inkLeft(sim) < 1) return (st.dead = true), false;
      if (!pointFree(sim, p)) return (st.blocked = true), false;
      st.pts.push({ x: p.x, y: p.y });
      return true;
    }
    let d = dist(last, p);
    if (d < MIN_PT) return true;
    const left = inkLeft(sim) - st.ink;
    if (left <= 0) return (st.dead = true), false;
    let q = p;
    if (d > left) {
      q = { x: last.x + ((p.x - last.x) * left) / d, y: last.y + ((p.y - last.y) * left) / d };
      d = left;
    }
    // long jumps (fast pointer) are checked in small hops so we stop right at an obstacle
    const hops = Math.max(1, Math.ceil(d / 14));
    let prev = last, moved = false;
    for (let i = 1; i <= hops; i++) {
      const h = { x: last.x + ((q.x - last.x) * i) / hops, y: last.y + ((q.y - last.y) * i) / hops };
      if (!segmentFree(sim, prev, h)) {
        st.blocked = true;
        break;
      }
      st.ink += dist(prev, h);
      prev = h;
      moved = true;
    }
    if (moved) st.pts.push(prev);
    if (inkLeft(sim) - st.ink <= 0.5) st.dead = true;
    return moved && !st.blocked;
  };
  return st;
}

/** Turns finished stroke points into a dynamic body. Returns the drawn record or null. */
export function commitStroke(sim, pts) {
  if (sim.state === "won" || sim.state === "failed" || !pts.length) return null;
  const L = strokeLength(pts);
  let body, local, dot = false, ink = L;
  if (L < 14) {
    // a tap → small ball
    const c = pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }), { x: 0, y: 0 });
    if (!pointFree(sim, c)) return null;
    const probe = Bodies.circle(c.x, c.y, DOT_R);
    if (Query.collides(probe, liveBlockers(sim)).length) return null;
    ink = Math.max(L, 40);
    if (inkLeft(sim) < ink) return null;
    body = rollable(Bodies.circle(c.x, c.y, DOT_R, { density: 0.002, friction: 0.6, restitution: 0.15, frictionAir: 0.0012 }));
    dot = true;
    local = [];
  } else {
    const s = simplify(pts);
    const parts = [];
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i], len = dist(a, b);
      const part = Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + INK_W * 0.9, INK_W, {
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        chamfer: { radius: INK_W * 0.45 },
      });
      part.gsLen = len + INK_W * 0.9;
      parts.push(part);
    }
    if (!parts.length) return null;
    body = parts.length === 1 ? parts[0] : Body.create({ parts });
    // Matter reads friction/restitution from the parent body, not the parts
    for (const p of body.parts) Object.assign(p, { friction: 1, frictionStatic: 3, restitution: 0.05, frictionAir: 0.002 });
    Body.setDensity(body, 0.002);
    trueInertia(body);
    local = s.map((p) => ({ x: p.x - body.position.x, y: p.y - body.position.y }));
  }
  body.gsKind = "drawn";
  body.gsDynamic = true;
  Composite.add(sim.engine.world, body);
  sim.blockers.push(body);
  const rec = { body, pts: local, dot, ink, born: sim.time };
  sim.drawn.push(rec);
  sim.inkUsed += ink;
  if (!sim.started) {
    sim.started = true;
    sim.state = "running";
    sim.events.push({ type: "start" });
  }
  return rec;
}

export function undo(sim) {
  const rec = sim.drawn.pop();
  if (!rec) return false;
  Composite.remove(sim.engine.world, rec.body);
  rec.body.gsGone = true;
  sim.blockers = sim.blockers.filter((b) => b !== rec.body);
  sim.inkUsed = Math.max(0, sim.inkUsed - rec.ink);
  return true;
}

/* ---------------- goals ---------------- */

const isOut = (b) => !b || b.gsGone || b.position.y > H + 40 || b.position.x < -60 || b.position.x > W + 60;
const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function touching(sim, a, b) {
  const A = sim.byId.get(a), B = sim.byId.get(b);
  if (!A || !B || A.gsGone || B.gsGone) return false;
  // resting contacts flicker in and out frame to frame; remember them briefly
  const seen = sim.contacts.get(key(A.id, B.id));
  return seen != null && sim.time - seen < 0.15;
}
function inZone(sim, a, z) {
  const b = sim.byId.get(a), r = sim.zones.get(z);
  return !!b && !b.gsGone && !!r && inRect(b.position, r);
}
function angleOff(b) {
  let a = b.angle % Math.PI;
  if (a > Math.PI / 2) a -= Math.PI;
  if (a < -Math.PI / 2) a += Math.PI;
  return Math.abs(a);
}

export function condMet(sim, c) {
  switch (c.t) {
    case "touch":
      return touching(sim, c.a, c.b);
    case "in":
      return [].concat(c.a).every((a) => inZone(sim, a, c.zone));
    case "out":
      return [].concat(c.a).every((a) => isOut(sim.byId.get(a)));
    case "lost":
      return [].concat(c.a).some((a) => isOut(sim.byId.get(a)));
    case "hit":
      return [].concat(c.ids).every((id) => sim.hit.has(id));
    case "press":
      return [].concat(c.id).every((id) => sim.pressed.has(id));
    case "level": {
      const b = sim.byId.get(c.a);
      return !!b && angleOff(b) <= rad(c.tol ?? 5);
    }
    case "up": {
      const b = sim.byId.get(c.a);
      return !!b && !b.gsGone && b.position.y < c.y;
    }
    case "still": {
      const b = sim.byId.get(c.a);
      return !!b && !b.gsGone && b.speed < (c.v ?? 0.6);
    }
    case "time":
      return sim.time >= c.s;
    default:
      return false;
  }
}

/** 0..1 progress for the HUD (fraction of goal conditions currently true) */
export function goalProgress(sim) {
  const all = sim.level.goal.all;
  return all.filter((c) => condMet(sim, c)).length / all.length;
}

/* ---------------- stepping ---------------- */

function updateKinematics(sim, t) {
  for (const rec of sim.objs) {
    if (rec.kind === "mover") {
      const { dx = 0, dy = 0, period = 4, phase = 0 } = rec.o;
      const s = Math.sin(((t + phase) / period) * Math.PI * 2);
      Body.setPosition(rec.body, { x: rec.base.x + dx * s, y: rec.base.y + dy * s }, true);
    } else if (rec.kind === "spin") {
      Body.setAngle(rec.body, rec.base.a + (rec.o.spin ?? 1) * t, true);
    }
  }
}

function applyActs(sim, acts = []) {
  for (const act of acts) {
    if (act.open) {
      const b = sim.byId.get(act.open);
      if (b && !b.gsGone) {
        Composite.remove(sim.engine.world, b);
        b.gsGone = true;
        sim.opened.add(act.open);
        sim.events.push({ type: "open", id: act.open });
      }
    }
    if (act.release) {
      const b = sim.byId.get(act.release), rec = sim.objById.get(act.release);
      if (b && rec?.held) {
        Body.setStatic(b, false);
        b.gsDynamic = true;
        rec.held = false;
        sim.events.push({ type: "release", id: act.release });
      }
    }
  }
}

function refreshContacts(sim) {
  for (const p of sim.engine.pairs.list) {
    if (!p.isActive) continue;
    const A = p.bodyA.parent, B = p.bodyB.parent;
    sim.contacts.set(key(A.id, B.id), sim.time);
    // targets & switches
    for (const [S, O] of [[A, B], [B, A]]) {
      if (S.gsKind === "target" && !sim.hit.has(S.gsId) && !O.isStatic) {
        const o = sim.objById.get(S.gsId).o;
        if (!o.by || [].concat(o.by).includes(O.gsId)) {
          sim.hit.add(S.gsId);
          sim.events.push({ type: "hit", id: S.gsId, x: S.position.x, y: S.position.y });
        }
      }
      if (S.gsKind === "switch" && !sim.pressed.has(S.gsId) && !O.isStatic) {
        sim.pressed.add(S.gsId);
        sim.events.push({ type: "press", id: S.gsId, x: S.position.x, y: S.position.y });
        applyActs(sim, sim.objById.get(S.gsId).o.acts);
      }
    }
  }
}

/** Advance one game frame (1/60 s). No-op until the first shape is drawn. */
export function step(sim) {
  if (sim.state !== "running") return;
  const dt = (FRAME * 1000) / SUB;
  for (let i = 0; i < SUB; i++) {
    sim.time += FRAME / SUB;
    updateKinematics(sim, sim.time);
    Engine.update(sim.engine, dt);
    refreshContacts(sim);
  }
  sim.frames++;
  // retire bodies that left the world
  for (const b of Composite.allBodies(sim.engine.world)) {
    if (!b.isStatic && (b.position.y > GONE_Y || b.position.x < -400 || b.position.x > W + 400)) {
      Composite.remove(sim.engine.world, b);
      b.gsGone = true;
      sim.blockers = sim.blockers.filter((x) => x !== b);
    }
  }
  // fail?
  const lv = sim.level;
  for (const c of lv.fail ?? []) {
    if (condMet(sim, c)) {
      sim.state = "failed";
      sim.failReason = c.why || "Try again!";
      sim.events.push({ type: "fail" });
      return;
    }
  }
  // goal
  const met = lv.goal.all.every((c) => condMet(sim, c));
  sim.goalMet = met;
  if (met) {
    sim.hold += FRAME;
    if (sim.hold >= (lv.goal.hold ?? 1.5)) {
      sim.state = "won";
      sim.events.push({ type: "win" });
    }
  } else sim.hold = 0;
}

export function starsFor(level, shapes, hinted = false) {
  const [p3, p2] = level.par;
  let s = shapes <= p3 ? 3 : shapes <= p2 ? 2 : 1;
  if (hinted) s = Math.min(s, 2);
  return s;
}

/* ---------------- scripted play (solutions, tests, hints) ---------------- */

/** Feeds a solution stroke's points through the real drawing rules. */
export function drawPoints(sim, pts) {
  const st = createStroke(sim);
  const dense = densify(pts.map(([x, y]) => ({ x, y })), 8);
  for (const p of dense) {
    st.add(p);
    if (st.dead) break;
  }
  return commitStroke(sim, st.pts);
}

export function densify(pts, step = 8) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/**
 * Runs a level with a solution: [{ t: seconds after start, pts: [[x,y],…] }].
 * Returns { won, failed, time, shapes, drawn, sim }.
 */
export function runSolution(level, sol, { maxTime = 25, jitter = 0, rng = Math.random } = {}) {
  const sim = createSim(level);
  const queue = sol.map((s) => ({ ...s, pts: jitter ? s.pts.map(([x, y]) => [x + (rng() * 2 - 1) * jitter, y + (rng() * 2 - 1) * jitter]) : s.pts }));
  let qi = 0, okDraws = 0;
  const drawDue = () => {
    while (qi < queue.length && (sim.time >= queue[qi].t || (!sim.started && qi === 0))) {
      if (drawPoints(sim, queue[qi].pts)) okDraws++;
      qi++;
    }
  };
  drawDue();
  if (!sim.started) return { won: false, failed: false, time: 0, shapes: 0, drawn: okDraws, sim };
  while (sim.state === "running" && sim.time < maxTime) {
    drawDue();
    step(sim);
    sim.events.length = 0;
  }
  return { won: sim.state === "won", failed: sim.state === "failed", time: sim.time, shapes: sim.drawn.length, drawn: okDraws, sim };
}
