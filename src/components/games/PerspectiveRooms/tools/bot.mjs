/**
 * Route bot: plays a level through the REAL simulation input (move, look,
 * E, wheel limit, Q/R, jump) following a scripted route (tools/routes.mjs).
 *
 * Placing an object works like a player watching the live preview: the bot
 * searches view directions (and, optionally, a mouse-wheel holding limit)
 * with the sim's own computeHold() until the preview sits where the route
 * wants it, then looks there and presses E.
 *
 * Steps:
 *   { go:[x,z], jump?, tol? }          walk (jump: keep hopping)
 *   { face:[x,y,z] }                   look at a point
 *   { grab: objIndex }                 look at an object and pick it up
 *   { place: spec }                    find an aim for the held object and release it
 *   { rot: "Q" | "R" }                 turn the held object
 *   { wait: seconds }
 *   { until: (s) => bool, timeout? }   wait for a condition
 *   { check: (s) => bool, msg }        assert
 *   { use: [x,y,z] }                   press a switch
 */
import { computeHold, eyeOf, aimAt, halfExt, objWeight, objBox, rayPick, forward } from "../engine/sim.js";

export function placeSearch(s, spec) {
  const eye = eyeOf(s.player);
  const tgt = [spec.x, spec.y ?? 0, spec.z];
  const base = aimAt(eye, tgt);
  const o = s.hold.obj;
  const k = s.hold.k;
  let best = null;
  const tryAim = (yaw, pitch, limit) => {
    if (pitch > 1.5 || pitch < -1.5) return;
    const r = computeHold(s, yaw, pitch, limit);
    if (!r.valid) return;
    const hb = halfExt(o, r.scale);
    const dims = hb.map((v) => v * 2);
    const w = objWeight({ ...o, scale: r.scale });
    if (spec.w && (w < spec.w[0] || w > spec.w[1])) return;
    if (spec.h && (dims[1] < spec.h[0] || dims[1] > spec.h[1])) return;
    if (spec.ok && !spec.ok(r, dims)) return;
    const err = Math.hypot(r.center[0] - spec.x, r.center[2] - spec.z);
    if (!best || err < best.err) best = { yaw, pitch, limit, err, r, dims };
  };
  const limits = [Infinity];
  if (spec.scale) for (const f of [0.8, 0.9, 1, 1.1, 1.2]) limits.push((spec.scale * f) / k);
  const yawSpan = spec.yawSpan ?? 0.5;
  for (let dy = -yawSpan; dy <= yawSpan + 1e-9; dy += 0.05)
    for (let p = -1.45; p <= 1.4; p += 0.04) for (const l of limits) tryAim(base.yaw + dy, p, l);
  if (best) {
    const b0 = best;
    for (let dy = -0.05; dy <= 0.05; dy += 0.01) for (let dp = -0.04; dp <= 0.04; dp += 0.008) tryAim(b0.yaw + dy, b0.pitch + dp, b0.limit);
  }
  return best;
}

export function createBot(route, { log = () => {} } = {}) {
  const st = { i: 0, t: 0, done: false, failed: false, reason: null, phase: 0, data: null, lastPos: null, stuck: 0 };
  const fail = (msg) => {
    st.failed = true;
    st.reason = `step ${st.i}: ${msg}`;
  };
  const next = () => {
    st.i++;
    st.t = 0;
    st.phase = 0;
    st.data = null;
    st.stuck = 0;
    if (st.i >= route.length) st.done = true;
  };
  function bot(s, dt = 1 / 60) {
    const inp = { mx: 0, mz: 0 };
    if (st.done || st.failed) return inp;
    const step = route[st.i];
    st.t += dt;
    const p = s.player;
    const eye = eyeOf(p);
    if (step.go) {
      const [x, z] = step.go;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < (step.tol ?? 0.3)) {
        next();
        return inp;
      }
      inp.aim = { yaw: Math.atan2(-(x - p.x), -(z - p.z)), pitch: step.pitch ?? -0.15 };
      inp.mz = d < 0.6 ? 0.6 : 1;
      if (step.jump && p.ground) inp.jump = true;
      if (st.t > (step.timeout ?? 15)) fail(`could not reach ${x},${z} (at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`);
      return inp;
    }
    if (step.face) {
      inp.aim = aimAt(eye, step.face);
      if (st.t > 0.05) next();
      return inp;
    }
    if (step.grab !== undefined) {
      const o = s.objs[step.grab];
      if (s.hold && s.hold.obj === o) {
        next();
        return inp;
      }
      if (s.hold) {
        fail("already holding something else");
        return inp;
      }
      if (!st.data) {
        // look at any visible part of it, like a player would (centre first, then the top)
        const b = objBox(o);
        const cx = (b.x0 + b.x1) / 2,
          cz = (b.z0 + b.z1) / 2;
        const pts = [[cx, (b.y0 + b.y1) / 2, cz], [cx, b.y1 - 0.04, cz]];
        for (const fx of [0.25, 0.75]) for (const fz of [0.25, 0.75]) pts.push([b.x0 + (b.x1 - b.x0) * fx, b.y1 - 0.04, b.z0 + (b.z1 - b.z0) * fz]);
        st.data = pts.map((q) => aimAt(eye, q)).find((a) => {
          const hit = rayPick(s, eye, forward(a.yaw, a.pitch));
          return hit && hit.obj === o;
        }) || aimAt(eye, pts[0]);
      }
      inp.aim = st.data;
      if (st.phase === 0) st.phase = 1;
      else if (st.phase === 1) {
        inp.use = true;
        st.phase = 2;
      } else if (st.t > 0.5) fail(`could not grab object ${step.grab} (focus ${s.focus ? s.focus.kind : "none"})`);
      return inp;
    }
    if (step.rot) {
      inp.rotQ = step.rot === "Q";
      inp.rotR = step.rot === "R";
      next();
      return inp;
    }
    if (step.place) {
      if (st.phase === 0 && !s.hold) {
        fail("place without holding");
        return inp;
      }
      if (st.phase === 0 && (p.speed > 0.02 || !p.ground)) return inp; // stand still first
      if (st.phase === 0) {
        const r = placeSearch(s, step.place);
        if (!r || r.err > (step.place.tol ?? 0.5)) {
          fail(`no aim found for place ${JSON.stringify({ x: step.place.x, z: step.place.z })} best err ${r ? r.err.toFixed(2) : "none"} k=${s.hold.k.toFixed(3)}`);
          return inp;
        }
        log(`place: err ${r.err.toFixed(2)} scale ${r.r.scale.toFixed(2)} dims ${r.dims.map((v) => v.toFixed(2)).join("x")} center ${r.r.center.map((v) => v.toFixed(2)).join(",")}`);
        st.data = r;
        st.phase = 1;
      }
      const r = st.data;
      inp.aim = { yaw: r.yaw, pitch: r.pitch };
      inp.limit = r.limit;
      if (st.phase === 1) {
        st.phase = 2;
        return inp;
      }
      if (st.phase === 2) {
        if (!s.hold.valid) {
          fail(`preview invalid when releasing (${s.hold.reason})`);
          return inp;
        }
        inp.use = true;
        st.phase = 3;
        st.obj = s.hold.obj;
        return inp;
      }
      // wait for it to settle
      if (st.obj.vy === 0 && st.t > 0.25) next();
      else if (st.t > 4) fail("object never settled");
      return inp;
    }
    if (step.wait !== undefined) {
      if (step.aim) inp.aim = step.aim;
      if (st.t >= step.wait) next();
      return inp;
    }
    if (step.until) {
      if (step.until(s)) next();
      else if (st.t > (step.timeout ?? 6)) fail(`timeout waiting: ${step.msg || "condition"}`);
      return inp;
    }
    if (step.check) {
      if (!step.check(s)) fail(`check failed: ${step.msg || ""}`);
      else next();
      return inp;
    }
    if (step.use) {
      inp.aim = aimAt(eye, step.use);
      if (st.phase === 0) st.phase = 1;
      else {
        inp.use = true;
        next();
      }
      return inp;
    }
    fail("unknown step");
    return inp;
  }
  bot.state = st;
  return bot;
}
