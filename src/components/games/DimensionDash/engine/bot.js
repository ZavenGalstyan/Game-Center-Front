/**
 * Dimension Dash — route-following bot. Produces the SAME input object the
 * keyboard does (mx/my/camYaw/jump/...), so headless runs exercise the real
 * controller, zones, rides and rails.
 *
 * It walks the builder's route: steer toward a look-ahead node, fire node
 * actions (jump / hold) when reaching them, jump over enemies / monitors in
 * its path and home onto locked targets while airborne.
 */
import { bossBot } from "./bosses.js";

export function createBot() {
  return { i: 0, holdJump: 0, fired: new Set(), stuckT: 0, lastProg: 0, waitT: 0, hold: null };
}

function along(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return ((p.x - a.x) * dx + (p.z - a.z) * dz) / l;
}

export function botInput(W, bot, dt) {
  const p = W.player;
  const R = W.level.route;
  const inp = { mx: 0, my: 0, camYaw: W.cam ? W.cam.viewYaw ?? W.cam.yaw : 0, jump: false, jumpHeld: false, sprint: p.mode !== "side", spin: false, attack: false, interact: false, leftE: false, rightE: false };
  if (!R.length || p.action === "dead" || W.state !== "play") return inp;
  if (bot.lastRespawn !== W.respawns) {
    // after a respawn: re-sync to the nearest route node
    bot.lastRespawn = W.respawns;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < R.length; i++) {
      const d = Math.hypot(R[i].x - p.x, (R[i].y - p.y) * 2, R[i].z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    bot.i = best;
    for (const k of [...bot.fired]) if (k >= best) bot.fired.delete(k);
    bot.hold = null;
  }

  // leaving a ride / rail can put us far along the route (half loops, long
  // grinds): skip ahead to the nearest node in the next stretch
  if ((bot.lastMode === "ride" || bot.lastMode === "rail") && p.mode !== bot.lastMode) {
    let best = bot.i;
    let bd = Infinity;
    for (let i = bot.i; i < Math.min(R.length, bot.i + 80); i++) {
      const d = Math.hypot(R[i].x - p.x, (R[i].y - p.y) * 1.5, R[i].z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (bd < 12) bot.i = best;
  }
  bot.lastMode = p.mode;

  if (bot.hold) return holdAt(W, bot, p, inp, dt);

  // boss fights: the boss supplies its own dodge / strike policy
  if (W.boss && bossBot(W, W.boss, inp, bot)) {
    if (bot.holdJump > 0) {
      bot.holdJump -= dt;
      inp.jumpHeld = true;
    }
    return inp;
  }

  // parking actions ahead (lifts, moving platforms): start braking early enough
  {
    const sp = Math.hypot(p.vx, p.vz);
    const reach = 2.5 + (sp * sp) / 70;
    for (let k = bot.i; k < Math.min(R.length, bot.i + 10); k++) {
      const n = R[k];
      if ((n.act !== "hold" && n.act !== "waitDyn") || bot.fired.has(k)) continue;
      if (Math.hypot(n.x - p.x, n.z - p.z) < reach && Math.abs(n.y - p.y) < 3 && p.grounded) {
        bot.i = k;
        bot.fired.add(k);
        fire(W, bot, n, p, inp);
        return holdAt(W, bot, p, inp, dt);
      }
      break;
    }
  }

  // advance progress
  let guard = 0;
  while (bot.i < R.length - 1 && guard++ < 40) {
    const a = R[bot.i];
    const b = R[bot.i + 1];
    const near = Math.hypot(p.x - a.x, p.z - a.z) < 1.4 && Math.abs(p.y - a.y) < 3;
    const passed = along(p, a, b) > -0.3 && Math.abs(p.y - a.y) < 6;
    if (a.act && !bot.fired.has(bot.i)) {
      if (!(near || passed)) break;
      const r = fire(W, bot, a, p, inp);
      if (r === "wait") {
        // not able to act yet (airborne) — give up only when well past it
        if (along(p, a, b) > (a.act === "rideDyn" ? 8 : 3)) bot.fired.add(bot.i);
        else break;
      } else bot.fired.add(bot.i);
      if (bot.hold) return holdAt(W, bot, p, inp, dt);
    }
    if (near || passed) bot.i++;
    else break;
  }

  // target a node a little ahead (or the moving platform we're about to ride)
  const look = Math.min(R.length - 1, bot.i + (p.mode === "side" ? 2 : 3));
  let t = R[look];
  const pend = R[bot.i];
  if (pend && pend.act === "rideDyn" && !bot.fired.has(bot.i)) {
    const b = W.geom.dyn.find((d) => d.src === pend.ref);
    if (b) t = { x: b.x, z: b.z, ref: true, vx: b.dx / 0.0083333, vz: b.dz / 0.0083333 };
  }
  if (p.mode === "side" && p.zone) {
    const Z = p.zone;
    const a = (t.x - p.x) * Z.fx + (t.z - p.z) * Z.fz;
    if (t.ref && !p.grounded) {
      // landing on a moving platform: match its velocity, then close the gap
      const vf = p.vx * Z.fx + p.vz * Z.fz;
      const pv = t.vx * Z.fx + t.vz * Z.fz;
      const want = Math.max(-16, Math.min(16, pv + a * 3));
      inp.mx = Math.abs(want - vf) < 0.6 ? 0 : Math.sign(want - vf);
    } else inp.mx = Math.abs(a) < 0.15 ? 0 : Math.sign(a);
  } else if (p.mode === "free" || p.mode === "ride") {
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    if (Math.hypot(dx, dz) > 0.2) {
      inp.camYaw = Math.atan2(dx, dz);
      inp.my = 1;
    }
  }

  // jump over / through enemies and monitors right in front of us
  if (p.grounded && p.mode !== "rail" && p.mode !== "ride") {
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    const lead = 2.2 + p.speed * 0.13;
    const check = (e) => {
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const ahead = dx * fx + dz * fz;
      const lat = Math.abs(-dx * fz + dz * fx);
      return ahead > 0.3 && ahead < lead && lat < 1.4 && Math.abs(e.y + (e.hy || 0.5) - p.y) < 2.4;
    };
    let hit = false;
    for (const e of W.enemies) if (!e.dead && check(e)) hit = true;
    for (const m of W.monitors) if (!m.dead && check(m)) hit = true;
    // incoming projectiles: hop over them
    for (const s of W.shots) {
      const dx = s.x - p.x;
      const dz = s.z - p.z;
      const d = Math.hypot(dx, dz);
      const closing = -(dx * s.vx + dz * s.vz) / (d || 1) + p.speed * 0.5;
      if (d < 3 + Math.max(0, closing) * 0.25 && s.y < p.y + 1.6 && s.y > p.y - 0.5 && closing > 0) hit = true;
    }
    if (hit) {
      inp.jump = true;
      bot.holdJump = 0.22;
    }
  }
  // homing onto locked enemies
  if (!p.grounded && p.lock && p.action === "ball" && p.vy < 6 && !p.lock.monitor) inp.attack = true;
  if (bot.holdJump > 0) {
    bot.holdJump -= dt;
    inp.jumpHeld = true;
  }

  // stuck detection → a hopeful jump
  const prog = bot.i + 0.001 * Math.hypot(p.x, p.z);
  if (Math.abs(prog - bot.lastProg) < 0.002 && p.grounded && (p.mode === "side" || p.mode === "free")) bot.stuckT += dt;
  else bot.stuckT = 0;
  bot.lastProg = prog;
  if (bot.stuckT > 1.5) {
    inp.jump = true;
    bot.holdJump = 0.4;
    bot.stuckT = 0;
  }
  // a fresh jump press is always held for its first frame (no instant jump-cut)
  if (inp.jump) inp.jumpHeld = true;
  return inp;
}

/** park precisely on a node (lift platforms) until the player rises to `until` */
function holdAt(W, bot, p, inp, dt) {
  const h = bot.hold;
  bot.waitT += dt;
  // waiting for a moving platform to come close, then jump onto it
  if (h.dyn != null) {
    const b = h.ref ? W.geom.dyn.find((d) => d.src === h.ref) : W.geom.dyn[h.dyn];
    // go when it is about to arrive (still approaching) or sitting at the stop
    const d = b ? Math.hypot(b.x - h.tx, b.z - h.tz) : 99;
    const approaching = b && (b.dx * (h.tx - b.x) + b.dz * (h.tz - b.z)) > 0;
    const near = b && (d < 0.25 || (approaching && d < (h.ride ? h.near : 2.4))) && (h.minY == null || b.y + (b.hy || 0) >= h.minY);
    // riding: just kill our own (platform-relative) speed; waiting: stay at the edge spot
    if (h.ride) {
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 0.6 && p.grounded) {
        if (p.mode === "side" && p.zone) inp.mx = -Math.sign(p.vx * p.zone.fx + p.vz * p.zone.fz);
        else {
          inp.camYaw = Math.atan2(-p.vx, -p.vz);
          inp.my = 1;
        }
      }
    } else park(p, inp, h.x, h.z);
    const settled = h.ride ? p.grounded : p.grounded && Math.hypot(p.vx, p.vz) < 3;
    if ((near && settled) || bot.waitT > 16) {
      inp.jump = true;
      inp.jumpHeld = true;
      bot.holdJump = h.hold ?? 0.35;
      bot.hold = null;
      bot.waitT = 0;
      bot.i = Math.min(W.level.route.length - 1, bot.i + 1);
    }
    return inp;
  }
  if (p.y >= h.until || bot.waitT > 16) {
    bot.hold = null;
    bot.waitT = 0;
    bot.i = Math.min(W.level.route.length - 1, bot.i + 1);
    return inp;
  }
  park(p, inp, h.x, h.z);
  return inp;
}

/** steer to stop on (x,z): brake against the motion when too fast */
function park(p, inp, x, z) {
  const dx = x - p.x;
  const dz = z - p.z;
  const d = Math.hypot(dx, dz);
  const sp = Math.hypot(p.vx, p.vz);
  const want = Math.min(14, d * 2.2);
  inp.sprint = false;
  if (d <= 0.35) return;
  let ax = 0;
  let az = 0;
  if (sp > want + 1) {
    ax = -p.vx;
    az = -p.vz;
  } else if (sp < want) {
    ax = dx;
    az = dz;
  } else return;
  if (p.mode === "side" && p.zone) {
    const a = ax * p.zone.fx + az * p.zone.fz;
    inp.mx = Math.abs(a) < 1e-3 ? 0 : Math.sign(a);
  } else {
    inp.camYaw = Math.atan2(ax, az);
    inp.my = 1;
  }
}

function fire(W, bot, node, p, inp) {
  switch (node.act) {
    case "jump":
      if (p.mode === "rail" || p.grounded || p.coyote > 0) {
        inp.jump = true;
        bot.holdJump = node.hold ?? 0.3;
        return "done";
      }
      return "wait";
    case "hold":
      bot.hold = { until: node.until, x: node.x, z: node.z };
      bot.waitT = 0;
      return "done";
    case "waitDyn":
    case "rideDyn":
      if (!p.grounded) return "wait";
      bot.hold = { dyn: node.dyn ?? 0, ref: node.ref, tx: node.tx, tz: node.tz, near: node.near ?? 2, minY: node.minY, x: node.x, z: node.z, hold: node.hold, ride: node.act === "rideDyn" };
      bot.waitT = 0;
      return "done";
    default:
      return "done";
  }
}
