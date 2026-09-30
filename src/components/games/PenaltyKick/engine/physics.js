/**
 * Penalty Kick — ball physics. Pure functions over plain arrays, no Three.js.
 *
 * ONE step() advances the authoritative ball; the 3D ball is drawn exactly at
 * ball.p with ball.q (orientation integrated from ball.w). There is no second,
 * "animated" path anywhere.
 *
 * Collisions are resolved in PK.SUB substeps per PK.DT step (≤ 3.5 cm of travel
 * each at max shot speed, far below every collider's combined radius), and in
 * each substep the DEEPEST contact is resolved first — a thin post, the bar and
 * a keeper's glove can never be tunnelled.
 */
import { PK, WOODWORK } from "./constants.js";

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

export function makeBall(p) {
  return { p: [...p], v: [0, 0, 0], w: [0, 0, 0], q: [0, 0, 0, 1], moving: false, rest: false };
}

/** Closest point on segment ab to point p. */
function closestOnSeg(a, b, p) {
  const ab = v3.sub(b, a);
  const t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, a), ab) / v3.dot(ab, ab)));
  return v3.add(a, v3.mul(ab, t));
}

/** Roof of the net at depth z (slopes down toward the back). */
export const netRoofY = (z) => PK.GOAL_H + (PK.NET_TOP_BACK_H - PK.GOAL_H) * Math.min(1, Math.max(0, -z / PK.NET_DEPTH));

/** Integrate the ball's orientation quaternion by angular velocity w over dt. */
function integrateQ(q, w, dt) {
  const [x, y, z, s] = q;
  const [wx, wy, wz] = w;
  const hx = 0.5 * dt;
  const nq = [x + hx * (wx * s + wy * z - wz * y), y + hx * (wy * s + wz * x - wx * z), z + hx * (wz * s + wx * y - wy * x), s - hx * (wx * x + wy * y + wz * z)];
  const l = Math.hypot(...nq) || 1;
  return nq.map((c) => c / l);
}

/**
 * Advance the ball one PK.DT step.
 * colliders: [{ id, kind:"hand"|"body", c:[x,y,z], r, v:[vx,vy,vz] }] (keeper, this step)
 * Returns an array of contact events for THIS step, in the order they happened.
 */
export function stepBall(ball, colliders = [], opts = {}) {
  const events = [];
  if (!ball.moving) return events;
  const R = PK.BALL_R;
  const h = PK.DT / PK.SUB;
  for (let s = 0; s < PK.SUB; s++) {
    const p0 = ball.p;
    // forces: gravity, quadratic drag, capped Magnus (curve)
    const v = ball.v;
    const speed = v3.len(v);
    let a = [0, -PK.G, 0];
    a = v3.add(a, v3.mul(v, -PK.DRAG * speed));
    if (!ball.onGround) {
      // only side-spin bends the flight (readable arcade curve); topspin is visual roll
      let m = v3.mul(v3.cross([0, ball.w[1], 0], v), PK.MAGNUS);
      const ml = v3.len(m);
      if (ml > PK.MAX_CURVE_ACC) m = v3.mul(m, PK.MAX_CURVE_ACC / ml);
      a = v3.add(a, m);
    }
    ball.v = v3.add(v, v3.mul(a, h));
    ball.p = v3.add(p0, v3.mul(ball.v, h));

    if (opts.free) continue; // aim solver: forces only, no world

    // ---- contacts: collect every penetration, resolve the deepest first ----
    const hits = [];
    for (const w of WOODWORK) {
      const c = closestOnSeg(w.a, w.b, ball.p);
      const d = v3.sub(ball.p, c);
      const dist = v3.len(d);
      const pen = R + PK.POST_R - dist;
      if (pen > 0) hits.push({ pen, kind: w.kind, id: w.id, n: v3.norm(d), cv: [0, 0, 0], e: PK.E_POST });
    }
    for (const col of colliders) {
      const d = v3.sub(ball.p, col.c);
      const dist = v3.len(d);
      const pen = R + col.r - dist;
      if (pen > 0) hits.push({ pen, kind: col.kind, id: col.id, n: v3.norm(d), cv: col.v, e: col.kind === "hand" ? PK.E_HAND : PK.E_BODY });
    }
    hits.sort((x, y) => y.pen - x.pen);
    const handled = new Set();
    for (const hit of hits) {
      if (handled.has(hit.kind === "hand" || hit.kind === "body" ? "keeper" : hit.id)) continue;
      handled.add(hit.kind === "hand" || hit.kind === "body" ? "keeper" : hit.id);
      const vrel = v3.sub(ball.v, hit.cv);
      const vn = v3.dot(vrel, hit.n);
      ball.p = v3.add(ball.p, v3.mul(hit.n, hit.pen + 1e-4));
      if (vn < 0) {
        const vN = v3.mul(hit.n, vn);
        const vT = v3.sub(vrel, vN);
        const out = v3.add(v3.mul(vN, -hit.e), v3.mul(vT, hit.kind === "hand" ? 0.6 : 0.85));
        ball.v = v3.add(out, hit.cv);
        // contact scrubs spin and adds a little roll from the tangential slip
        ball.w = v3.add(v3.mul(ball.w, 0.45), v3.mul(v3.cross(hit.n, vT), 0.15 / R));
        // a deflection must not turn into a banana shot: cap the curving side-spin
        const ws = PK.SPIN_MAX * 0.35;
        ball.w[1] = Math.max(-ws, Math.min(ws, ball.w[1]));
        events.push({ type: "contact", kind: hit.kind, id: hit.id, speed: -vn, n: hit.n, p: [...ball.p], cv: hit.cv });
      }
    }

    // ---- ground ----
    if (ball.p[1] < R) {
      ball.p[1] = R;
      if (ball.v[1] < -0.6) {
        events.push({ type: "ground", speed: -ball.v[1], p: [...ball.p] });
        ball.v[1] = -ball.v[1] * PK.E_GROUND;
        ball.v[0] *= 0.9;
        ball.v[2] *= 0.9;
        ball.onGround = false;
      } else {
        ball.v[1] = 0;
        ball.onGround = true;
        ball.v[0] *= 1 - 1.4 * h;
        ball.v[2] *= 1 - 1.4 * h;
        // rolling: spin follows the ground speed
        ball.w = [-ball.v[2] / R, ball.w[1] * 0.98, ball.v[0] / R];
      }
    } else if (ball.p[1] > R + 0.02) ball.onGround = false;

    // ---- the goal line: the WHOLE ball past z = 0 (centre past −R) ----
    const zc = -R;
    if (p0[2] >= zc && ball.p[2] < zc) {
      const f = (p0[2] - zc) / (p0[2] - ball.p[2]);
      const x = p0[0] + (ball.p[0] - p0[0]) * f;
      const y = p0[1] + (ball.p[1] - p0[1]) * f;
      const inside = Math.abs(x) <= PK.GOAL_HALF_W && y <= PK.GOAL_H;
      events.push({ type: inside ? "goalLine" : "outLine", p: [x, y, zc], speed: v3.len(ball.v) });
    }

    // ---- the net (inside the goal frame, behind the line) ----
    const inNetX = Math.abs(ball.p[0]) < PK.GOAL_HALF_W + 0.3;
    if (inNetX && p0[2] < 0 && ball.p[2] > -PK.NET_DEPTH - 0.5 && ball.p[1] < PK.GOAL_H + 0.3) {
      const back = -PK.NET_DEPTH + R;
      const roof = netRoofY(ball.p[2]) - R;
      const side = PK.GOAL_HALF_W - R;
      const wasInside = Math.abs(p0[0]) <= PK.GOAL_HALF_W && p0[1] <= netRoofY(p0[2]);
      let n = null;
      if (wasInside && ball.p[2] < back) n = [0, 0, 1];
      else if (wasInside && ball.p[1] > roof && ball.p[2] < 0) n = [0, -1, 0];
      else if (wasInside && Math.abs(ball.p[0]) > side && ball.p[2] < 0) n = [-Math.sign(ball.p[0]), 0, 0];
      if (n) {
        const vn = v3.dot(ball.v, n);
        if (vn < 0) {
          events.push({ type: "net", speed: -vn, p: [...ball.p], n });
          const vN = v3.mul(n, vn);
          const vT = v3.sub(ball.v, vN);
          ball.v = v3.add(v3.mul(vN, -PK.E_NET), v3.mul(vT, 0.35));
          ball.w = v3.mul(ball.w, 0.3);
        }
        // the bagging net keeps dragging on a ball that has hit it
        ball.netted = true;
        // clamp back inside the net volume
        if (n[2] === 1) ball.p[2] = back;
        if (n[1] === -1) ball.p[1] = roof;
        if (n[0] !== 0) ball.p[0] = Math.sign(ball.p[0]) * side;
      }
      if (ball.netted) {
        const k = 1 - 2.2 * h;
        ball.v = [ball.v[0] * k, ball.v[1], ball.v[2] * k];
      }
    }
  }
  ball.q = integrateQ(ball.q, ball.w, PK.DT);
  if (opts.stopWhenSlow && ball.onGround && v3.len(ball.v) < 0.15) {
    ball.moving = false;
    ball.rest = true;
  }
  return events;
}
