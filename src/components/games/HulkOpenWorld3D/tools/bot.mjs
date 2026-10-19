/**
 * Hulk: Open World 3D — automated test player.
 *
 * Plays missions / activities through the SAME input a human produces
 * (move vector, camera yaw, held Space for super leaps, mouse buttons, Q /
 * F / E / R) — it never touches sim state directly. Used by simTest.mjs to
 * prove every mission is completable and every boss is fightable.
 *
 *   const bot = createBot(sim); sim.step(bot(dt), dt)
 */
import { HERO, GRAVITY, ATTACKS } from "../engine/config.js";
import { wrapA } from "../engine/util.js";

const lerp = (a, b, t) => a + (b - a) * t;

export function createBot(sim, o = {}) {
  const B = {
    path: null,
    pathI: 0,
    pathGoal: null,
    repath: 0,
    leap: null, // {target, charge, hold, dir}
    t: 0,
    punchT: 0,
    jumpHeld: false,
    stuck: 0,
    lastPos: null,
    mode: "",
    heavyT: 0,
    useAbilities: o.abilities !== false,
    log: o.log || null,
  };
  const h = () => sim.hero;

  function pathTo(x, z) {
    const H = h();
    B.repath -= 1 / 60;
    if (!B.path || B.repath <= 0 || !B.pathGoal || Math.hypot(B.pathGoal.x - x, B.pathGoal.z - z) > 5) {
      B.path = sim.nav.findPath(sim.nav.walk, H.x, H.z, x, z, 6000) || [[x, z]];
      B.pathI = 0;
      B.pathGoal = { x, z };
      B.repath = 1.2;
    }
    let wp = B.path[B.pathI];
    while (wp && Math.hypot(wp[0] - H.x, wp[1] - H.z) < 2.2 && B.pathI < B.path.length - 1) wp = B.path[++B.pathI];
    if (!wp) return [0, 0];
    const dx = wp[0] - H.x;
    const dz = wp[1] - H.z;
    const d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  }

  /** ballistic search for the leap charge that lands at (D horizontal, H vertical) */
  function solveLeap(D, Hh) {
    const jm = h().st.jumpMul;
    let best = null;
    for (let c = 0; c <= 1.0001; c += 0.02) {
      const vy = lerp(HERO.leapMinV, HERO.leapMaxV, c) * Math.sqrt(jm);
      const vh = lerp(HERO.leapMinH, HERO.leapMaxH, c) * jm;
      const apex = (vy * vy) / (2 * GRAVITY);
      if (apex < Hh + 1.5) continue;
      // descending crossing of height Hh
      const disc = vy * vy - 2 * GRAVITY * Hh;
      if (disc < 0) continue;
      const t2 = (vy + Math.sqrt(disc)) / GRAVITY;
      const reach = vh * t2;
      const err = reach - (D + 1.5);
      if (err >= -0.5 && (!best || err < best.err)) best = { c, err, t2, vh, vy };
    }
    return best;
  }
  function chargeFor(c) {
    return HERO.leapThreshold + c * (HERO.leapCharge - HERO.leapThreshold);
  }

  /** go to a (possibly elevated) point; returns input */
  function goTo(x, z, y = null, inp, sprint = true) {
    const H = h();
    const dist = Math.hypot(x - H.x, z - H.z);
    const elevated = y != null && y - H.y > 1.1;
    // in flight: air-steer toward the target, brake when on top of it
    if (!H.grounded) {
      const vx = H.vx;
      const vz = H.vz;
      const sp = Math.hypot(vx, vz);
      const tTouch = Math.max(0.1, (H.vy + Math.sqrt(Math.max(0, H.vy * H.vy + 2 * GRAVITY * Math.max(0, H.y - (y ?? H.groundY))))) / GRAVITY);
      const proj = sp * tTouch;
      const dx = (x - H.x) / (dist || 1);
      const dz = (z - H.z) / (dist || 1);
      if (dist > proj * 0.9) {
        inp.mx = dx;
        inp.mz = dz;
      } else if (sp > 0.5) {
        inp.mx = -vx / sp;
        inp.mz = -vz / sp;
      }
      return inp;
    }
    if (B.leap) {
      const L = B.leap;
      L.hold += 1 / 60;
      inp.jump = true;
      inp.mx = 0;
      inp.mz = 0;
      if (L.hold >= L.need) {
        // release: the stick sets the direction
        inp.jump = false;
        inp.mx = L.dir[0];
        inp.mz = L.dir[1];
        B.leap = null;
        B.jumpHeld = false;
      }
      return inp;
    }
    // roof → roof: leap from where we stand, else walk to the roof edge facing the target
    if (y != null && y > 1.5 && H.y > 2 && dist > 5 && Math.abs(y - H.y) > 0.3 || (y != null && y > 1.5 && H.y > 2 && dist > 12)) {
      const s = solveLeap(dist, y - H.y);
      if (s && clearArc(H, x, z, y, s)) {
        B.leap = { need: chargeFor(s.c), hold: 0, dir: [(x - H.x) / dist, (z - H.z) / dist] };
        inp.jump = true;
        return inp;
      }
      const dx = (x - H.x) / dist;
      const dz = (z - H.z) / dist;
      const ahead = sim.col.groundAt(H.x + dx * 2.2, H.z + dz * 2.2, H.y + 0.5, 0.6, 0.5, false).y;
      if (Math.abs(ahead - H.y) < 0.6) {
        inp.mx = dx;
        inp.mz = dz;
        return inp;
      }
      // at the edge and no clean arc: biggest leap toward it
      const s2 = solveLeap(dist, Math.max(0, y - H.y) + 2);
      B.leap = { need: chargeFor(s2 ? Math.min(1, s2.c + 0.08) : 1), hold: 0, dir: [dx, dz] };
      inp.jump = true;
      return inp;
    }
    if (elevated) {
      // launch from here if a leap can make it and the path is open
      const Hh = y - H.y;
      const roofEdge = o.edgeOf ? o.edgeOf(x, z) : null;
      void roofEdge;
      if (dist < 70 && dist > 4) {
        const s = solveLeap(dist, Hh);
        if (s && clearArc(H, x, z, y, s)) {
          B.leap = { need: chargeFor(s.c), hold: 0, dir: [(x - H.x) / dist, (z - H.z) / dist] };
          inp.jump = true;
          return inp;
        }
      }
      // walk to a launch spot ~ (Hh+8) m away from the target on open ground
      const spot = launchSpot(x, z, y);
      if (spot) {
        const d2 = Math.hypot(spot.x - H.x, spot.z - H.z);
        if (d2 > 1.5) {
          const [mx, mz] = pathTo(spot.x, spot.z);
          inp.mx = mx;
          inp.mz = mz;
          inp.sprint = sprint && d2 > 8;
          return inp;
        }
        // at the spot but the arc was blocked: try a stronger charge
        const s = solveLeap(dist, Hh + 3);
        if (s) {
          B.leap = { need: chargeFor(Math.min(1, s.c + 0.1)), hold: 0, dir: [(x - H.x) / dist, (z - H.z) / dist] };
          inp.jump = true;
        }
        return inp;
      }
    }
    if (dist < 1.2) return inp;
    // drop off a roof toward a ground target: walk straight off the edge
    if (H.y > (y ?? 0) + 3 && H.groundY > 2) {
      inp.mx = (x - H.x) / dist;
      inp.mz = (z - H.z) / dist;
      inp.sprint = true;
      return inp;
    }
    const [mx, mz] = pathTo(x, z);
    inp.mx = mx;
    inp.mz = mz;
    inp.sprint = sprint && dist > 6;
    // long trip on the ground: super leap along the path for speed
    if (dist > 60 && B.useAbilities && H.grounded && !H.carry && B.t % 4 < 0.02 && sim.col.losClear(H.x, H.y + 3, H.z, H.x + mx * 40, H.y + 3, H.z + mz * 40)) {
      B.leap = { need: chargeFor(0.6), hold: 0, dir: [mx, mz] };
    }
    return inp;
  }
  function clearArc(H, x, z, y, s) {
    const D = Math.hypot(x - H.x, z - H.z);
    const dx = (x - H.x) / D;
    const dz = (z - H.z) / D;
    let px = H.x;
    let py = H.y + 1.6;
    let pz = H.z;
    const n = 16;
    for (let k = 1; k <= n; k++) {
      const t = (s.t2 * k) / n;
      const qx = H.x + dx * s.vh * t;
      const qz = H.z + dz * s.vh * t;
      const qy = H.y + 1.6 + s.vy * t - 0.5 * GRAVITY * t * t;
      if (!sim.col.losClear(px, py, pz, qx, qy, qz)) return false;
      px = qx;
      py = qy;
      pz = qz;
    }
    return true;
  }
  function launchSpot(x, z, y) {
    const key = `${x.toFixed(0)},${z.toFixed(0)}`;
    if (B.spotKey === key && B.spot) return B.spot;
    const H = h();
    let best = null;
    let bs = Infinity;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
      for (const r of [14, 20, 26, 32]) {
        const sx = x + Math.sin(a) * r;
        const sz = z + Math.cos(a) * r;
        const c = sim.nav.cellOf(sx, sz);
        if (sim.nav.blocked(sim.nav.walk, c[0], c[1])) continue;
        const gy = sim.col.groundAt(sx, sz, 2, 1.2, 0.8, false).y;
        if (gy > 1.5) continue;
        const s = solveLeap(r, y - gy);
        if (!s) continue;
        if (!clearArc({ x: sx, y: gy, z: sz }, x, z, y, s)) continue;
        const cost = Math.hypot(sx - H.x, sz - H.z) + r * 0.5;
        if (cost < bs) {
          bs = cost;
          best = { x: sx, z: sz };
        }
      }
    }
    B.spotKey = key;
    B.spot = best;
    return best;
  }

  /* ---------------------------------------------------------------- combat */
  function nearestEnemy(pref) {
    const H = h();
    let best = null;
    let bs = Infinity;
    for (const e of sim.enemies) {
      if (e.dead) continue;
      let d = Math.hypot(e.x - H.x, e.z - H.z) + Math.abs(e.y - H.y) * 2;
      if (pref && pref(e)) d -= 40;
      if (d < bs) {
        bs = d;
        best = e;
      }
    }
    return best;
  }
  function fight(target, inp, extraReach = 0) {
    const H = h();
    const tx = target.x;
    const tz = target.z;
    const ty = target.y || 0;
    const d = Math.hypot(tx - H.x, tz - H.z) - (target.def ? target.def.r || 0 : 0) - extraReach;
    inp.camYaw = Math.atan2(tx - H.x, tz - H.z);
    if (ty - H.y > 2.5 && target.fixed !== false && target.def && target.def.h < 5) {
      // up on a roof: leap to it
      return goTo(tx, tz, ty, inp);
    }
    if (d > 2.4) {
      goTo(tx, tz, null, inp, d > 8);
      // punch whatever is in the way when we're stuck
      if (B.stuck > 1) inp.punch = (B.t % 0.4) < 0.02;
      return inp;
    }
    const dd = Math.hypot(tx - H.x, tz - H.z) || 1;
    const push = d > 0.6 ? 0.45 : 0;
    inp.mx = ((tx - H.x) / dd) * push;
    inp.mz = ((tz - H.z) / dd) * push;
    // abilities
    const near = sim.enemies.filter((e) => !e.dead && Math.hypot(e.x - H.x, e.z - H.z) < 8.5).length;
    if (B.useAbilities) {
      if (H.rage >= H.st.rageMax && !H.raging && near >= 1) inp.rage = true;
      else if (near >= 2 && H.cd.smash <= 0) inp.smash = true;
      else if (near >= 2 && H.cd.clap <= 0) inp.special = true;
      else if (target.def && (target.def.hp >= 600 || target.maxHp > 1000) && H.cd.ragePunch <= 0 && !H.act) {
        B.heavyT += 1 / 60;
        inp.heavy = B.heavyT < 0.85;
        return inp;
      }
    }
    B.heavyT = 0;
    B.punchT -= 1 / 60;
    if (B.punchT <= 0 && (!H.act || H.act.kind.startsWith("jab"))) {
      inp.punch = true;
      B.punchT = 0.15;
    }
    return inp;
  }

  /* ---------------------------------------------------------------- boss dodging */
  function dodge(inp) {
    const H = h();
    for (const b of sim.bosses) {
      if (b.dead) continue;
      // telegraphed ground circles
      for (const m of b.markers) {
        if (m.done) continue;
        const d = Math.hypot(H.x - m.x, H.z - m.z);
        if (d < m.r + 1.5) {
          const a = d > 0.1 ? Math.atan2(H.x - m.x, H.z - m.z) : Math.atan2(H.x - b.x, H.z - b.z);
          inp.mx = Math.sin(a);
          inp.mz = Math.cos(a);
          inp.sprint = true;
          return true;
        }
      }
      // shockwave rings: jump them
      if (b.ring) {
        const d = Math.hypot(H.x - b.ring.x, H.z - b.ring.z);
        const gap = d - b.ring.r;
        if (gap > 0 && gap < b.ring.speed * 0.28 && H.grounded) {
          inp.jump = true;
          B.tapJump = 2;
        }
      }
      const db = Math.hypot(H.x - b.x, H.z - b.z);
      // titan beam / war machine sight: get behind the boss
      if ((b.state === "beamTele" || b.state === "beam") && db < 40) {
        const behind = b.heading + Math.PI;
        const tx = b.x + Math.sin(behind) * (b.def.r + 4);
        const tz = b.z + Math.cos(behind) * (b.def.r + 4);
        const ang = Math.abs(wrapA(Math.atan2(H.x - b.x, H.z - b.z) - b.heading));
        if (ang < 2.2) {
          // circle around (keep a radius) instead of running through the beam
          const a = Math.atan2(H.x - b.x, H.z - b.z) + (wrapA(Math.atan2(H.x - b.x, H.z - b.z) - b.heading) > 0 ? 0.6 : -0.6);
          const rr = Math.max(db, b.def.r + 5);
          inp.mx = b.x + Math.sin(a) * rr - H.x;
          inp.mz = b.z + Math.cos(a) * rr - H.z;
          const n = Math.hypot(inp.mx, inp.mz) || 1;
          inp.mx /= n;
          inp.mz /= n;
          inp.sprint = true;
          if (b.state === "beam" && H.grounded && H.y - b.y < 1) inp.jump = true;
          return true;
        }
        void tx;
        void tz;
      }
      if (b.state === "chargeTele" || b.state === "charge") {
        const f = [Math.sin(b.heading), Math.cos(b.heading)];
        const rx = H.x - b.x;
        const rz = H.z - b.z;
        const along = rx * f[0] + rz * f[1];
        const side = rx * f[1] - rz * f[0];
        if (along > -2 && Math.abs(side) < b.def.r + 4) {
          const s = side >= 0 ? 1 : -1;
          inp.mx = f[1] * s;
          inp.mz = -f[0] * s;
          inp.sprint = true;
          return true;
        }
      }
      if (b.state === "magnet" || (b.state === "magnetTele" && db < 16)) {
        inp.mx = (H.x - b.x) / (db || 1);
        inp.mz = (H.z - b.z) / (db || 1);
        inp.sprint = true;
        return true;
      }
      if (b.state === "sweep" && db < 12 && H.grounded && b.stT > 0.3 && b.stT < 0.6) {
        inp.jump = true;
        return true;
      }
      if ((b.state === "stompTele") && db < b.def.r + 5) {
        inp.mx = (H.x - b.x) / (db || 1);
        inp.mz = (H.z - b.z) / (db || 1);
        inp.sprint = true;
        return true;
      }
    }
    // incoming rockets / missiles marked on the ground handled above
    return false;
  }

  /* ---------------------------------------------------------------- objectives */
  function propTarget(p, inp) {
    return fight({ x: p.x, z: p.z, y: p.y, def: { r: Math.max(p.def.hx, p.def.hz) } }, inp, 0.3);
  }

  function missionStep(inp) {
    const sc = sim.scenario;
    if (!sc || sc.done || sc.failed) return inp;
    if (sc.kind === "activity") return activity(sc, inp);
    const st = sc.st;
    const step = st.step;
    const H = h();
    switch (step.type) {
      case "reach":
        return goTo(st.p.x, st.p.z, step.minY != null ? st.p.y ?? step.minY : null, inp);
      case "destroyAny": {
        // nearest breakable prop
        let best = null;
        let bs = Infinity;
        for (const p of sim.col.propsIn(H.x - 30, H.z - 30, H.x + 30, H.z + 30)) {
          if (p.mode !== "static" || p.state === 2 || p.inert) continue;
          const d = Math.hypot(p.x - H.x, p.z - H.z) + (p.def.hp > 60 ? 15 : 0);
          if (d < bs) {
            bs = d;
            best = p;
          }
        }
        return best ? propTarget(best, inp) : inp;
      }
      case "destroy": {
        const enemiesNear = sim.enemies.filter((e) => !e.dead && (Math.hypot(e.x - H.x, e.z - H.z) < 6 || (e.seesHero && Math.hypot(e.x - H.x, e.z - H.z) < 40 && Math.abs(e.y - H.y) < 3))).sort((a, b) => Math.hypot(a.x - H.x, a.z - H.z) - Math.hypot(b.x - H.x, b.z - H.z));
        if (enemiesNear.length) return fight(enemiesNear[0], inp);
        const t = st.props.filter((p) => p.state < 2 && p.mode !== "gone").sort((a, b) => Math.hypot(a.x - H.x, a.z - H.z) - Math.hypot(b.x - H.x, b.z - H.z))[0];
        if (t) return propTarget(t, inp);
        const e = nearestEnemy();
        return e ? fight(e, inp) : inp;
      }
      case "rescue": {
        const g = st.groups.find((x) => !x.freed);
        const close = sim.enemies.filter((e) => !e.dead && Math.hypot(e.x - H.x, e.z - H.z) < 10);
        if (close.length) return fight(close[0], inp);
        if (g) {
          const d = g.debris.filter((p) => p.state < 2 && p.mode !== "gone").sort((a, b) => Math.hypot(a.x - H.x, a.z - H.z) - Math.hypot(b.x - H.x, b.z - H.z))[0];
          if (d) return propTarget(d, inp);
        }
        // escort: kill whatever is near the runners
        const runner = st.civs.find((c) => !c.dead && c.state === "run");
        const e = nearestEnemy(runner ? (x) => Math.hypot(x.x - runner.x, x.z - runner.z) < 25 : null);
        if (e) return fight(e, inp);
        if (runner) return goTo(runner.x, runner.z, null, inp);
        return inp;
      }
      case "roofs": {
        const p = st.chain[st.i];
        if (!p) return inp;
        return goTo(p.x, p.z, p.y, inp);
      }
      case "convoy": {
        const t = st.convoy.filter((e) => !e.dead).sort((a, b) => b.routeI - a.routeI || a.x - b.x)[0];
        return t ? fight(t, inp) : inp;
      }
      case "boss": {
        const b = st.boss;
        if (b.shield) {
          const g = b.gens.filter((x) => x.state < 2 && x.mode !== "gone").sort((a, c) => Math.hypot(a.x - H.x, a.z - H.z) - Math.hypot(c.x - H.x, c.z - H.z))[0];
          if (g) return propTarget(g, inp);
        }
        const adds = sim.enemies.filter((e) => !e.dead && Math.hypot(e.x - H.x, e.z - H.z) < 7);
        if (adds.length) return fight(adds[0], inp);
        if (b.dead) return inp;
        return fight(b, inp, 0.6);
      }
      case "protect":
      case "defend": {
        const zone = st.zone;
        const e = nearestEnemy((x) => (zone ? Math.hypot(x.x - zone.x, x.z - zone.z) < zone.r + 10 : x.target && x.target !== "hero"));
        if (e) return fight(e, inp);
        if (zone) return goTo(zone.x, zone.z, null, inp);
        return inp;
      }
      default: {
        const e = nearestEnemy();
        if (e) return fight(e, inp);
        if (st.markers && st.markers[0]) return goTo(st.markers[0].x, st.markers[0].z, null, inp);
        return inp;
      }
    }
  }

  function activity(sc, inp) {
    const H = h();
    switch (sc.def.id) {
      case "destruction": {
        let best = null;
        let bs = Infinity;
        for (const p of sim.col.propsIn(H.x - 40, H.z - 40, H.x + 40, H.z + 40)) {
          if (p.mode !== "static" || p.state === 2 || p.inert) continue;
          const d = Math.hypot(p.x - H.x, p.z - H.z) - p.def.score * 0.2;
          if (d < bs) {
            bs = d;
            best = p;
          }
        }
        return best ? propTarget(best, inp) : inp;
      }
      case "longjump": {
        const pad = sc.pad;
        const d = Math.hypot(pad.x - H.x, pad.z - H.z);
        if (!H.grounded) return inp;
        if (d > 2) return goTo(pad.x, pad.z, null, inp, false);
        if (!B.leap) B.leap = { need: HERO.leapCharge + 0.05, hold: 0, dir: [1, 0] };
        return goTo(pad.x + 80, pad.z, 50, inp);
      }
      case "arena": {
        const e = nearestEnemy();
        return e ? fight(e, inp) : goTo(sc.site.x, sc.site.z, null, inp);
      }
      case "rooftop": {
        const p = sc.chain[sc.i];
        return p ? goTo(p.x, p.z, p.y, inp) : inp;
      }
      case "throwing": {
        if (sc.throws >= sc.def.throws) return inp;
        const ring = sc.rings[sc.throws % 3 === 0 ? 2 : sc.throws % 3 === 1 ? 1 : 0];
        if (H.carry) {
          // throw from the line, aiming the arc at the ring
          const dx = ring.x - H.x;
          const dz = ring.z - H.z;
          const D = Math.hypot(dx, dz);
          const sp = lerp(44, 32, Math.min(1.3, H.carry.def.weight) / 1.3) * H.st.throwStr;
          // pitch for range D at speed sp (low angle solution)
          const s = Math.min(1, (D * GRAVITY) / (sp * sp));
          const pitch = 0.5 * Math.asin(s) - 0.1;
          inp.camYaw = Math.atan2(dx, dz);
          inp.aim = { x: (Math.cos(pitch) * dx) / D, y: Math.sin(pitch), z: (Math.cos(pitch) * dz) / D };
          B.throwWait = (B.throwWait || 0) + 1 / 60;
          if (B.throwWait > 0.4) {
            inp.punch = true;
            B.throwWait = 0;
          }
          return inp;
        }
        // grab the nearest car near the line
        let best = null;
        let bs = Infinity;
        for (const p of sim.col.propsIn(H.x - 30, H.z - 30, H.x + 30, H.z + 30)) {
          if (p.mode !== "static" || !p.def.grab || p.def.weight < 0.9) continue;
          const d = Math.hypot(p.x - H.x, p.z - H.z);
          if (d < bs) {
            bs = d;
            best = p;
          }
        }
        if (!best) return inp;
        if (bs > 3.2) return goTo(best.x, best.z, null, inp, false);
        inp.camYaw = Math.atan2(best.x - H.x, best.z - H.z);
        inp.mx = (best.x - H.x) / bs * 0.3;
        inp.mz = (best.z - H.z) / bs * 0.3;
        if (!H.act) inp.grab = (B.t % 0.5) < 0.02;
        return inp;
      }
      default:
        return inp;
    }
  }

  return function botInput(dt) {
    B.t += dt;
    const H = h();
    const inp = { mx: 0, mz: 0, camYaw: H.heading, sprint: false, jump: false, punch: false, heavy: false, smash: false, grab: false, rage: false, special: false, aim: null };
    // stuck detection
    if (B.lastPos) {
      const moved = Math.hypot(H.x - B.lastPos.x, H.z - B.lastPos.z);
      if (moved < 0.02 && H.grounded && !B.leap && B.wantMove) B.stuck += dt;
      else B.stuck = Math.max(0, B.stuck - dt * 2);
    }
    B.lastPos = { x: H.x, z: H.z };
    if (!H.alive) return inp;
    if (B.tapJump > 0) {
      B.tapJump--;
      inp.jump = true;
    }
    if (!B.leap && dodge(inp)) return inp;
    missionStep(inp);
    B.wantMove = Math.hypot(inp.mx, inp.mz) > 0.3;
    if (inp.mx || inp.mz) {
      if (!inp.camYaw || Math.abs(inp.camYaw - H.heading) < 1e-9) inp.camYaw = Math.atan2(inp.mx, inp.mz);
    }
    if (B.stuck > 2.5 && !B.leap && H.grounded) {
      // unstick: a medium super leap in the current direction
      B.leap = { need: chargeFor(0.5), hold: 0, dir: [Math.sin(H.heading + 0.6), Math.cos(H.heading + 0.6)] };
      B.stuck = 0;
      B.path = null;
    }
    return inp;
  };
}
