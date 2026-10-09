/**
 * Stunt Racer 3D — a driving bot. Used by tools/simTest.mjs to prove every
 * level is completable (and to measure the reference times the medal
 * thresholds come from), and by the ?srtest=1 QA hooks to drive the real
 * game in a browser. It sees exactly what a player sees: the road ahead,
 * the obstacles' visible patterns, the speed signs.
 *
 *   steering  pure pursuit on a point ahead (lane chosen to collect road
 *             stars and dodge obstacles at the moment it will arrive)
 *   speed     full throttle, lifts / brakes for corners it can't make,
 *             holds back for an obstacle that would be in the way
 *   nitro     before loops / signed jumps when short of the posted speed,
 *             otherwise on clear straights — never just before a plain ramp
 *   air       steers to land straight, centred
 */
import { collide } from "./obstacles.js";
import { clamp, wrapAngle } from "./util.js";

export function createBot(opts = {}) {
  const skill = opts.skill ?? 1;
  const useNitro = opts.nitro !== false;
  const seekStars = opts.stars !== false;
  const mem = { lane: 0 };
  return function drive(run) {
    const car = run.car;
    const T = run.T;
    const p = car.p;
    const out = { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false, reset: false };
    if (car.mode === "fall") return out;
    const v = Math.max(1, car.mode === "ground" ? car.fwd : Math.hypot(car.vx, car.vz));
    const s = car.s;

    if (car.mode === "air") {
      // land straight and centred: aim at the road 25 m ahead of us
      const tp = T.pointAt(Math.min(T.L, s + 25), 0, 0);
      const want = Math.atan2(tp.x - car.x, tp.z - car.z);
      out.steer = clamp(wrapAngle(want - car.h) * 2.5, -1, 1);
      return out;
    }
    const f = T.frameAt(s);
    const hw = f.w / 2;
    if (f.a.kind === "loop") {
      out.steer = clamp(-car.lat * 0.25 - car.psi * 2, -1, 1);
      out.nitro = useNitro && car.nitro > 0.05 && v < 30;
      return out;
    }

    // --- lane choice ------------------------------------------------------------------
    let lane = 0;
    if (seekStars) {
      for (let i = 0; i < T.stars.length; i++) {
        const st = T.stars[i];
        if (run.stars.has(i)) continue;
        const ds = st.s - s;
        if (ds > 2 && ds < 70) {
          const fr = T.frameAt(st.s);
          if (fr.a.kind === "loop") break;
          lane = clamp(st.lat, -hw + 1.5, hw - 1.5);
          break;
        }
      }
    }
    // obstacles: pick the free lane nearest the wanted one at our arrival time
    let wait = false;
    for (const o of run.obstacles) {
      const ds = o.s - s;
      if (ds < -4 || ds > 55) continue;
      const tArr = run.clock + Math.max(0, ds) / v;
      const lanes = [];
      for (let y = -o.hw + 1.3; y <= o.hw - 1.3 + 1e-6; y += 0.5) lanes.push(y);
      const free = (y, t) => {
        for (let k = -1; k <= 1; k++) if (collide(o, t + k * 0.14, o.hw, 0, y, 0, 0, 0.35)) return false;
        return true;
      };
      let best = null;
      for (const y of lanes) if (free(y, tArr) && (best == null || Math.abs(y - lane) < Math.abs(best - lane))) best = y;
      if (best != null) lane = best;
      else if (ds < 30 && ds > 3) wait = true;
      break;
    }
    mem.lane += (lane - mem.lane) * 0.08;

    // --- steering: pure pursuit ----------------------------------------------------------
    const La = clamp(v * 0.5, 7, 26);
    const tp = T.pointAt(Math.min(T.L, s + La), mem.lane, 0);
    const want = Math.atan2(tp.x - car.x, tp.z - car.z);
    const err = wrapAngle(want - car.h);
    out.steer = clamp(err * 3.2, -1, 1);

    // --- speed --------------------------------------------------------------------------
    let kMax = 0;
    const horizon = Math.min(T.L, s + Math.max(25, v * 1.6));
    for (let q = s + 3; q < horizon; q += 2) {
      const fr = T.frameAt(q);
      if (fr.a.kind === "loop") break;
      kMax = Math.max(kMax, Math.abs(fr.kh));
    }
    const yawCap = p.yawMax * 0.88 * skill;
    const vSafe = kMax > 1e-4 ? yawCap / (kMax + (0.5 * yawCap) / p.vmax) : Infinity;
    if (v > vSafe + 4) {
      out.throttle = 0;
      out.brake = 1;
    } else if (v > vSafe) out.throttle = 0;
    if (wait && v > 12) {
      out.throttle = 0;
      out.brake = v > 20 ? 1 : 0;
    }

    // --- nitro --------------------------------------------------------------------------
    if (useNitro && car.nitro > 0.05 && out.throttle > 0) {
      let need = 0;
      let plainRamp = false;
      for (const lp of T.loops) if (lp.s0 > s && lp.s0 - s < 180) need = Math.max(need, lp.vMin + 2);
      for (const r of T.ramps) {
        const d = r.s0 - s;
        if (d > -2 && d < 140) {
          if (r.minKmh) need = Math.max(need, r.minKmh / 3.6 + 1.5);
          else if (d < 110) plainRamp = true;
        }
      }
      if (need > 0 && v < need + 3) out.nitro = true;
      else if (!plainRamp && kMax < 0.004 && car.nitro > 0.6 && !wait) out.nitro = true;
    }
    return out;
  };
}
