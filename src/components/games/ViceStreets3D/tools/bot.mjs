/**
 * Vice Streets 3D — test bot. Plays through the SAME input frames a human
 * produces (move vector, E/F/Space edges, throttle/steer/handbrake), reading
 * only the current run goal (engine/missions.js `goal()`) and public sim
 * state. Used by tools/simTest.mjs (Node) and, via window.__vsBot, in the
 * browser QA harness.
 */
import { planRoute, followRoute } from "../engine/nav.js";
import { zoneAt } from "../engine/city.js";
import { headingOf, wrapA, clamp, dist } from "../engine/util.js";

export function createBot() {
  const B = { route: null, routeKey: "", replan: 0, edgeT: 0, stuckT: 0, park: null, esc: null, lastGoal: "", tgtCar: null };

  /** drive the player's car along a planned route to (x, z) — returns the input frame */
  function driveTo(sim, car, x, z, o = {}) {
    const key = `${Math.round(x / 4)},${Math.round(z / 4)}`;
    B.replan -= 1 / 60;
    if (!B.route || B.routeKey !== key || B.replan <= 0) {
      B.route = planRoute(sim.city, car.x, car.z, car.h, x, z, { blocked: (e) => sim.edgeBlocked(e), exact: o.exact !== false, goalH: o.goalH });
      // racing through checkpoints: plan on past this one so the next corner is braked for
      if (o.next) {
        const end = B.route.pts[B.route.pts.length - 1];
        const prev = B.route.pts[B.route.pts.length - 2] || { x: car.x, z: car.z };
        const h2 = Math.atan2(end.x - prev.x, end.z - prev.z);
        const r2 = planRoute(sim.city, end.x, end.z, h2, o.next.x, o.next.z, { blocked: (e) => sim.edgeBlocked(e), exact: false });
        B.route.pts = B.route.pts.concat(r2.pts.slice(1));
      }
      B.route.i = 0;
      B.routeKey = key;
      B.replan = o.replan || 6;
    }
    const save = { ...car.input };
    const r = followRoute(sim, car, B.route, 1 / 60, { speed: o.speed || 15, cornerSpeed: o.corner || 8.5, arriveR: o.arriveR || 3, ignore: o.ignore, ram: o.ram, lights: !!o.lights, ignoreRole: o.ignoreRole, overtake: !!o.overtake });
    const inp = toInput(car);
    Object.assign(car.input, save);
    if (r === "arrived" && o.stop !== false) {
      inp.throttle = car.vf > 0.4 ? -1 : 0;
      inp.steer = 0;
    }
    // wedged behind something for a while: back off and re-plan
    B.realV = (B.realV ?? 5) + ((car.moved || 0) * 60 - (B.realV ?? 5)) * 0.04;
    if (B.realV < 0.5 && inp.throttle > 0.2) B.stuckT += 1 / 60;
    else B.stuckT = Math.max(0, B.stuckT - 1 / 30);
    if (B.stuckT > 3) {
      B.unstick = 1.0;
      B.stuckT = 0;
      B.route = null;
    }
    if (B.unstick > 0) {
      B.unstick -= 1 / 60;
      return { throttle: -1, steer: -inp.steer || 0.6 };
    }
    return inp;
  }
  function toInput(car) {
    const I = car.input;
    let throttle = I.throttle;
    if (I.brake > 0.05 && I.throttle <= 0) throttle = car.vf > 0.6 ? -I.brake : 0;
    return { throttle, steer: I.steer, handbrake: false };
  }
  /** walk toward (x, z): straight when the line is clear, else along the streets */
  function walkTo(sim, x, z, sprint = true) {
    const pl = sim.player;
    let tx = x;
    let tz = z;
    const blocked = sim.col.segBlocked(pl.x, pl.z, pl.y + 0.9, x, z, sim.city.surfaceAt(x, z) + 0.9);
    if (blocked && dist(pl.x, pl.z, x, z) > 6) {
      const key = `w${Math.round(x)},${Math.round(z)}`;
      if (!B.route || B.routeKey !== key) {
        B.route = planRoute(sim.city, pl.x, pl.z, pl.h, x, z, { blocked: (e) => sim.edgeBlocked(e), center: true });
        B.route.i = 0;
        B.routeKey = key;
      }
      const P = B.route.pts;
      while (B.route.i < P.length - 1 && dist(pl.x, pl.z, P[B.route.i].x, P[B.route.i].z) < 2.5) B.route.i++;
      // skip ahead to any waypoint already in plain sight
      for (let k = P.length - 1; k > B.route.i; k--) {
        if (!sim.col.segBlocked(pl.x, pl.z, pl.y + 0.9, P[k].x, P[k].z, pl.y + 0.9)) {
          B.route.i = k;
          break;
        }
      }
      tx = P[B.route.i].x;
      tz = P[B.route.i].z;
    }
    // fenced parks: go in / out through the nearest path gap
    for (const zn of sim.city.zones) {
      if (zn.kind !== "park") continue;
      const inside = (px, pz) => px > zn.x0 + 1.4 && px < zn.x1 - 1.4 && pz > zn.z0 + 1.4 && pz < zn.z1 - 1.4;
      if (inside(pl.x, pl.z) === inside(tx, tz)) continue;
      const cx = (zn.x0 + zn.x1) / 2;
      const cz = (zn.z0 + zn.z1) / 2;
      const gaps = [{ x: cx, z: zn.z0 + 0.8 }, { x: cx, z: zn.z1 - 0.8 }, { x: zn.x0 + 0.8, z: cz }, { x: zn.x1 - 0.8, z: cz }];
      let g = gaps[0];
      for (const q of gaps) if (dist(pl.x, pl.z, q.x, q.z) + dist(q.x, q.z, tx, tz) < dist(pl.x, pl.z, g.x, g.z) + dist(g.x, g.z, tx, tz)) g = q;
      if (dist(pl.x, pl.z, g.x, g.z) > 1.2) {
        tx = g.x;
        tz = g.z;
      }
      break;
    }
    const dx = tx - pl.x;
    const dz = tz - pl.z;
    const d = Math.hypot(dx, dz) || 1;
    // wedged against a car or a wall: side-step for a moment, alternating sides
    if (B.detour && B.detour.t > 0) {
      B.detour.t -= 1 / 60;
      return { mx: B.detour.mx, mz: B.detour.mz, sprint };
    }
    // progress measured by actual displacement (pushing into a car keeps some velocity)
    const moved = B.lastP ? Math.hypot(pl.x - B.lastP.x, pl.z - B.lastP.z) * 60 : 3;
    B.lastP = { x: pl.x, z: pl.z };
    B.walkV = (B.walkV ?? 3) + (moved - (B.walkV ?? 3)) * 0.08;
    if (B.walkV < 0.8) B.stuckT += 1 / 60;
    else B.stuckT = 0;
    if (B.stuckT > 0.5) {
      B.side = -(B.side || 1);
      B.stuckT = 0;
      const s = B.side;
      B.detour = { mx: (-dz / d) * s * 0.9 - (dx / d) * 0.3, mz: (dx / d) * s * 0.9 - (dz / d) * 0.3, t: 0.6 + (B.tries = (B.tries || 0) + 1) * 0.15 };
      if (B.tries > 8) B.tries = 0;
    }
    return { mx: dx / d, mz: dz / d, sprint };
  }
  const edge = () => {
    B.edgeT -= 1 / 60;
    if (B.edgeT <= 0) {
      B.edgeT = 0.35;
      return true;
    }
    return false;
  };

  function getIn(sim, v) {
    const pl = sim.player;
    if (pl.mode === "enter" || pl.mode === "exit") return {};
    if (pl.mode === "car") {
      if (!v || pl.car === v) return null;
      return { interact: Math.hypot(pl.car.vx, pl.car.vz) < 1 && edge(), throttle: pl.car.vf > 0.4 ? -1 : 0 };
    }
    if (!v) v = pickCar(sim);
    if (!v) return walkTo(sim, sim.city.places.taxiCurb.x, sim.city.places.taxiCurb.z);
    B.tgtCar = v;
    const door = sim.doorPoint(v, 1);
    if (sim.enterCandidate() === v) return { interact: edge() };
    return walkTo(sim, door.x, door.z);
  }
  function pickCar(sim) {
    const P = sim.focus();
    let best = null;
    for (const v of sim.vehicles) {
      if (v.wrecked || v.locked || v.chaseTarget || v.fixed) continue;
      if (v.role === "police" || v.role === "racer" || v.role === "rival") continue;
      if (v.driver === "ai" && (v.role !== "traffic" || Math.hypot(v.vx, v.vz) > 2)) continue;
      if (v.driver === "player") continue;
      const d = dist(v.x, v.z, P.x, P.z) - (v.owner === "player" ? 25 : 0) - (v.role === "mission" ? 40 : 0);
      if (!best || d < best.d) best = { v, d };
    }
    return best ? best.v : null;
  }

  const step = function step(sim) {
    const pl = sim.player;
    if (sim.ending) return {};
    if (sim.dialog) return { interact: edge() };
    const run = sim.run;
    if (!run || run.result) return {};
    const g = run.goal();
    const gk = `${run.idx}:${g.act}`;
    if (gk !== B.lastGoal) {
      B.lastGoal = gk;
      B.route = null;
      B.park = null;
      B.esc = null;
      B.stuckT = 0;
    }
    const car = pl.mode === "car" ? pl.car : null;
    let out = {};
    switch (g.act) {
      case "wait":
        if (car) out = { throttle: car.vf > 0.4 ? -1 : 0 };
        break;
      case "dialog":
        out = { interact: edge() };
        break;
      case "jump":
        out = { jump: edge() };
        break;
      case "walk": {
        if (car) {
          out = { interact: Math.hypot(car.vx, car.vz) < 3 && edge(), throttle: car.vf > 0.5 ? -1 : 0 };
          break;
        }
        out = walkTo(sim, g.x, g.z, true);
        break;
      }
      case "talk":
      case "interact": {
        if (car) {
          // drive close first when it's far, then get out
          if (dist(car.x, car.z, g.x, g.z) > 25 && g.far !== false) {
            out = driveTo(sim, car, g.x, g.z, { stop: true, arriveR: 6 });
            break;
          }
          out = { interact: Math.hypot(car.vx, car.vz) < 3 && edge(), throttle: car.vf > 0.5 ? -1 : 0 };
          break;
        }
        if (pl.mode !== "foot") break;
        if (g.far && dist(pl.x, pl.z, g.x, g.z) > 60) {
          out = getIn(sim, null) || {};
          break;
        }
        if (dist(pl.x, pl.z, g.x, g.z) > 1.6) out = walkTo(sim, g.x, g.z, true);
        else out = { interact: edge() };
        break;
      }
      case "enter": {
        let v = g.vehicle;
        if (!v && g.kind) v = sim.vehicles.filter((q) => q.type === g.kind && !q.driver && !q.wrecked && !q.locked).sort((a, b) => dist(a.x, a.z, pl.x, pl.z) - dist(b.x, b.z, pl.x, pl.z))[0];
        out = getIn(sim, v) || {};
        break;
      }
      case "drive": {
        if (!car) {
          out = getIn(sim, null) || {};
          break;
        }
        const through = g.through;
        const speed = g.race || through ? car.st.top * 0.92 : run.cargoKey ? 12 : 17;
        // a careful driver: lights are obeyed unless racing the clock
        const lawful = !through && !g.race && !(run.timer() != null && run.timer() < 90) && sim.police.wanted === 0;
        const chased = sim.police.wanted > 0;
        out = driveTo(sim, car, g.x, g.z, { stop: !through, speed: chased ? car.st.top * 0.9 : speed, arriveR: through ? 2 : 2.5, corner: g.race || chased ? 10.5 : 8.5, replan: g.race || through ? 999 : chased ? 3 : 6, lights: lawful, goalH: g.h, ignoreRole: chased ? "police" : null, exact: !through, overtake: through || chased || !!g.race, next: through ? g.next : null });
        if (g.hold && Math.hypot(car.vx, car.vz) < 3 && dist(car.x, car.z, g.x, g.z) < 9) out = { throttle: car.vf > 0.3 ? -1 : 0 };
        break;
      }
      case "stopCar":
        if (car) out = { throttle: car.vf > 0.3 ? -1 : 0 };
        break;
      case "ram": {
        if (!car) {
          out = getIn(sim, null) || {};
          break;
        }
        const T = g.vehicle;
        const d = dist(car.x, car.z, T.x, T.z);
        if (d > 45 || sim.col.segBlocked(car.x, car.z, car.y + 1, T.x, T.z, T.y + 1)) {
          out = driveTo(sim, car, T.x, T.z, { stop: false, speed: car.st.top * 0.95, corner: 10, replan: 1.2, ignore: T, ram: true });
        } else {
          const lead = clamp(d / 30, 0, 0.8);
          const want = headingOf(T.x + T.vx * lead - car.x, T.z + T.vz * lead - car.z);
          const err = wrapA(want - car.h);
          out = { throttle: Math.abs(err) > 2 ? -1 : 1, steer: clamp(-err * 2.5 * (Math.abs(err) > 2 ? -1 : 1), -1, 1) };
          if (Math.abs(car.vf) < 0.5) B.stuckT += 1 / 60;
          else B.stuckT = 0;
          if (B.stuckT > 1.2) {
            B.unstick = 0.9;
            B.stuckT = 0;
          }
          if (B.unstick > 0) {
            B.unstick -= 1 / 60;
            out = { throttle: -1, steer: -out.steer };
          }
        }
        break;
      }
      case "follow": {
        if (!car) {
          out = getIn(sim, null) || {};
          break;
        }
        const T = g.vehicle;
        const d = dist(car.x, car.z, T.x, T.z);
        const sees = d < 50 && !sim.col.segBlocked(car.x, car.z, car.y + 1, T.x, T.z, T.y + 1);
        if (sees && d > 12) {
          // in sight: drive straight after it, matching its pace
          const want = headingOf(T.x - car.x, T.z - car.z);
          const err = wrapA(want - car.h);
          const tgt = d > g.keep ? Math.hypot(T.vx, T.vz) + 4 : Math.hypot(T.vx, T.vz) - 1;
          out = { steer: clamp(-err * 2.2, -1, 1), throttle: car.vf < tgt ? 1 : car.vf > tgt + 2 ? -0.6 : 0 };
          if (Math.abs(err) > 1.4) out.throttle = car.vf > 3 ? -1 : 0.6;
          B.route = null;
        } else out = driveTo(sim, car, T.x, T.z, { stop: false, speed: d > 45 ? 18 : 12, replan: 1, ignore: T });
        if (d < 12) out.throttle = car.vf > 1 ? -0.6 : 0;
        break;
      }
      case "escape": {
        if (!car) {
          // on foot: get a car
          out = getIn(sim, null) || {};
          break;
        }
        // while a cruiser sees you or is close: run to a junction far from all of them;
        // once unseen, slip into a garage if one is near, otherwise pull over and wait
        const P = sim.city.places;
        const cops = sim.police.units.filter((u) => !u.wrecked);
        const near = cops.reduce((m, u) => Math.min(m, dist(u.x, u.z, car.x, car.z)), 1e9);
        const hot = sim.police.seen || near < 60;
        B.escT = (B.escT || 0) - 1 / 60;
        if (hot) {
          if (!B.esc || B.esc.kind !== "run" || B.escT <= 0 || dist(car.x, car.z, B.esc.x, B.esc.z) < 25) {
            // the cruisers out-accelerate you between corners: run down a long straight
            // (same avenue, far end, away from the cops) where top speed wins
            let best = null;
            for (const n of sim.city.nodes) {
              if (!n.grid || !sim.districtOpen(sim.city.districtAt(n.x, n.z))) continue;
              const d = dist(n.x, n.z, car.x, car.z);
              if (d < 160) continue;
              const straight = Math.min(Math.abs(n.x - car.x), Math.abs(n.z - car.z)) < 8;
              const fromCops = cops.reduce((m, u) => Math.min(m, dist(u.x, u.z, n.x, n.z)), 1e9);
              const ahead = ((n.x - car.x) * Math.sin(car.h) + (n.z - car.z) * Math.cos(car.h)) / d;
              const score = (straight ? 400 : 0) + d * 0.6 + fromCops * 0.5 + ahead * 120 + Math.random() * 20;
              if (!best || score > best.score) best = { x: n.x, z: n.z, score };
            }
            B.esc = { kind: "run", x: best.x, z: best.z };
            B.escT = 9;
          }
          out = driveTo(sim, car, B.esc.x, B.esc.z, { stop: false, speed: car.st.top * 0.9, corner: 11, replan: 2, ignoreRole: "police" });
        } else if (B.esc && B.esc.kind === "run" && (B.coolT = (B.coolT ?? 4) - 1 / 60) > 0) {
          // just out of sight: keep going a little further before hiding
          out = driveTo(sim, car, B.esc.x, B.esc.z, { stop: false, speed: car.st.top * 0.9, corner: 11, replan: 2, ignoreRole: "police" });
        } else {
          B.coolT = 4;
          if (!B.esc || B.esc.kind !== "hide") {
            const hides = [{ x: P.garageBay.x + 2, z: P.garageBay.z }];
            if (sim.districtOpen("hills")) hides.push({ x: P.hillGarage.x - 7, z: P.hillGarage.z - 1 });
            const ahead = (h) => ((h.x - car.x) * Math.sin(car.h) + (h.z - car.z) * Math.cos(car.h)) / (dist(h.x, h.z, car.x, car.z) || 1);
            const h = hides.filter((q) => dist(q.x, q.z, car.x, car.z) < 200 && ahead(q) > 0.3).sort((a, b) => dist(a.x, a.z, car.x, car.z) - dist(b.x, b.z, car.x, car.z))[0];
            // no garage ahead: pull over where you are and wait it out
            B.esc = h ? { kind: "hide", ...h } : { kind: "hide", x: car.x, z: car.z, here: true };
          }
          const inside = zoneAt(sim.city, car.x, car.z, "hideout");
          if (inside || B.esc.here) out = { throttle: car.vf > 0.3 ? -1 : 0 };
          else out = driveTo(sim, car, B.esc.x, B.esc.z, { stop: true, speed: 16, corner: 9, arriveR: 2 });
        }
        break;
      }
      case "park": {
        if (!car) {
          out = getIn(sim, null) || {};
          break;
        }
        // like a person: reach the lot (via its entrance), stop square in front of
        // the bay, then creep in lined up with it (backing out to retry if badly off)
        const fx = Math.sin(g.h);
        const fz = Math.cos(g.h);
        const ax = g.x - fx * 11;
        const az = g.z - fz * 11;
        const lot = sim.city.places.parkingLot.rect;
        const inLot = car.x > lot.x0 && car.x < lot.x1 && car.z > lot.z0 && car.z < lot.z1;
        if (!B.park) B.park = { phase: dist(car.x, car.z, g.x, g.z) < 4 ? "in" : g.via && !inLot ? "via0" : g.via ? "aisle" : "approach", t: 0, prog: 0, best: 1e9 };
        const P = B.park;
        P.t += 1 / 60;
        if (P.back > 0) {
          P.back -= 1 / 60;
          out = { throttle: -0.55, steer: P.backSteer || 0 };
          break;
        }
        if (P.phase === "via0") {
          out = driveTo(sim, car, g.via[0].x, g.via[0].z, { stop: true, speed: 13, arriveR: 3 });
          if (dist(car.x, car.z, g.via[0].x, g.via[0].z) < 4.5) P.phase = "via1";
        } else if (P.phase === "via1") {
          const err = wrapA(headingOf(g.via[1].x - car.x, g.via[1].z - car.z) - car.h);
          out = { throttle: car.vf < 4 ? 0.5 : 0, steer: clamp(-err * 2, -1, 1) };
          if (dist(car.x, car.z, g.via[1].x, g.via[1].z) < 3) P.phase = "aisle";
        } else if (P.phase === "aisle") {
          // inside the lot: steer straight for the spot in front of the bay
          const err = wrapA(headingOf(ax - car.x, az - car.z) - car.h);
          out = { throttle: car.vf < 3 ? 0.45 : 0, steer: clamp(-err * 2, -1, 1) };
          if (dist(car.x, car.z, ax, az) < 2.2) P.phase = "in";
        } else if (P.phase === "approach") {
          out = driveTo(sim, car, ax, az, { stop: true, speed: 12, arriveR: 2.5 });
          if (dist(car.x, car.z, ax, az) < 3.2 && Math.hypot(car.vx, car.vz) < 2.5) P.phase = "in";
        } else {
          const d = dist(car.x, car.z, g.x, g.z);
          const err = wrapA((d > 2 ? headingOf(g.x - car.x, g.z - car.z) : g.h) - car.h);
          // the bay marker reports "Hold still…" once the car is fully inside and lined up
          if (run.st.ok) out = { throttle: car.vf > 0.15 ? -1 : 0 };
          else out = { throttle: car.vf < 2 ? 0.4 : 0, steer: clamp(-err * 2, -1, 1) };
          if (d < P.best - 0.25) {
            P.best = d;
            P.prog = 0;
          } else P.prog += 1 / 60;
          const past = (car.x - g.x) * fx + (car.z - g.z) * fz > 1.5;
          if (!run.st.ok && (P.prog > 2.5 || past || (Math.abs(err) > 1.3 && d < 6))) {
            // back out toward the line-up spot, steering to straighten up
            P.back = 2.2;
            P.backSteer = clamp(wrapA(g.h - car.h) * 1.5, -1, 1);
            P.best = 1e9;
            P.prog = 0;
            P.phase = g.via ? "aisle" : "approach";
          }
        }
        break;
      }
      default:
    }
    if (B.jumpNow) {
      B.jumpNow = false;
      out.jump = true;
    }
    // pinned by a cruiser while wanted: back away at once instead of waiting to be cuffed
    if (car && sim.police.wanted > 0 && g.act !== "park") {
      const sp = Math.hypot(car.vx, car.vz);
      const cop = sim.police.units.find((u) => !u.wrecked && dist(u.x, u.z, car.x, car.z) < 9);
      if (B.evade > 0) {
        B.evade -= 1 / 60;
        return { throttle: B.evadeDir, steer: B.evadeSteer };
      }
      if (cop && sp < 2) {
        B.pinT = (B.pinT || 0) + 1 / 60;
        if (B.pinT > 0.6) {
          B.pinT = 0;
          // reverse if the cop is in front, otherwise floor it forward; steer away from it
          const front = (cop.x - car.x) * Math.sin(car.h) + (cop.z - car.z) * Math.cos(car.h) > 0;
          const side = (cop.x - car.x) * -Math.cos(car.h) + (cop.z - car.z) * Math.sin(car.h);
          B.evadeDir = front ? -1 : 1;
          B.evadeSteer = side > 0 ? -1 : 1;
          if (front) B.evadeSteer = -B.evadeSteer;
          B.evade = 1.1;
          B.route = null;
        }
      } else B.pinT = 0;
    }
    return out;
  };
  step.state = B;
  return step;
}
