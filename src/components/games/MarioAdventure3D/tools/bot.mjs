/**
 * Mario Adventure 3D — route bot. Plays a level through the SAME raw input
 * the keyboard produces ({ax, ay, sprint, jump, jumpHeld, interact}, camera-
 * relative), so a bot run exercises the real controller, camera maths,
 * platforms, enemies and goal logic.
 *
 * A route is a list of nodes; each is reached before the next starts:
 *   [x, z]                            walk there
 *   { p:[x,z], jump:1|2, sprint }     go there; on arrival jump (2 = double)
 *   { p, jumpAt: d }                  jump when within d of p (for gaps)
 *   { wait: s }                       stand still s seconds
 *   { waitPlat: i, near:[x,z], r }    wait until platform i is near a point
 *   { ride: i, until:[x,z], r }       stay centred on platform i until it is near a point
 *   { interact: true }                press E (pipes, signs)
 *   { stomp: i }                      chase enemy i and jump on it
 *   { goal: true }                    walk into the goal pole
 *
 * Browser:  const {createBot} = await import('/src/components/games/MarioAdventure3D/tools/bot.mjs')
 *           const b = createBot(route); __ma.input.frame = () => b(__ma.W)
 */
import { firebarBalls } from "../engine/hazards.js";

const fb = [];
/** would running straight from p to (tx,tz) at `speed` cross a firebar or an erupting geyser? */
function passIsSafe(W, p, tx, tz, speed) {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const dist = Math.hypot(dx, dz) || 1;
  const T = dist / speed + 0.35;
  for (let t = 0; t <= T; t += 0.05) {
    const k = Math.min(1, (speed * t) / dist);
    const x = p.x + dx * k;
    const z = p.z + dz * k;
    const y = p.y + 0.75;
    for (const h of W.hazards) {
      const d = h.def;
      if (h.kind === "firebar") {
        const save = h.angle;
        h.angle = save + (d.rate ?? 1.6) * t;
        firebarBalls(h, fb);
        h.angle = save;
        for (const b of fb) if (Math.hypot(b[0] - x, b[1] - y, b[2] - z) < 1.0) return false;
      } else if (h.kind === "geyser") {
        const per = d.period ?? 4;
        const ph = (h.st + t) % per;
        if (ph >= per - 2.2 && Math.hypot(d.x - x, d.z - z) < (d.r ?? 1.1) + 1.1) return false;
      }
    }
  }
  return true;
}

export function createBot(route, opts = {}) {
  let i = 0;
  let t = 0;
  let st = 0;
  let jumpQueue = [];
  let held = 0;
  let recover = 0;
  const log = opts.log || (() => {});
  const node = () => route[i];
  const norm = (n) => (Array.isArray(n) ? { p: n } : n);
  /** platform by index, or by its authored [x, z] (nearest moving one) */
  const plat = (W, ref) => {
    if (typeof ref === "number") return W.platforms[ref];
    let best = null;
    let bd = Infinity;
    for (const pl of W.platforms) {
      if (pl.kind === "static") continue;
      const d = Math.hypot(pl.def.x - ref[0], pl.def.z - ref[1]);
      if (d < bd) {
        bd = d;
        best = pl;
      }
    }
    return best;
  };

  function steer(W, tx, tz, sprint) {
    const p = W.player;
    let dx = tx - p.x;
    let dz = tz - p.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) return { ax: 0, ay: 0, sprint: false };
    dx /= L;
    dz /= L;
    const c = W.cam.yaw;
    const fx = Math.sin(c);
    const fz = Math.cos(c);
    const k = Math.min(1, L / 0.8);
    return { ay: (dx * fx + dz * fz) * k, ax: (dx * -fz + dz * fx) * k, sprint: !!sprint };
  }
  const advanceNode = (W, why) => {
    log(`node ${i} done (${why}) at ${W.player.x.toFixed(1)},${W.player.y.toFixed(1)},${W.player.z.toFixed(1)}`);
    i++;
    st = 0;
  };

  const bot = (W, dt = 1 / 60) => {
    t += dt;
    st += dt;
    const p = W.player;
    let out = { ax: 0, ay: 0, sprint: false, jump: false, jumpHeld: held > 0, interact: false };
    if (held > 0) held -= dt;
    // queued jumps (double-jump timing)
    if (jumpQueue.length && t >= jumpQueue[0]) {
      jumpQueue.shift();
      out.jump = true;
      out.jumpHeld = true;
      held = 0.35;
    }
    if (i >= route.length || W.state !== "play") return out;
    // bounced off lava: steer back to the last safe ground (double jump at the apex)
    if (W.sea.kind === "lava" && !p.grounded && p.y < W.sea.y + 0.8) recover = 1.6;
    if (recover > 0) {
      recover -= dt;
      const s = p.lastSafe;
      Object.assign(out, steer(W, s[0], s[2], true));
      if (!p.grounded && p.vy < 1 && p.jumps < 2 && p.y < s[1] + 1.5) {
        out.jump = true;
        out.jumpHeld = true;
        held = 0.4;
      }
      if (p.grounded) recover = 0;
      return out;
    }
    // hop over incoming low projectiles (cannonballs, snowballs, sand)
    if (p.grounded && !(W.boss && W.boss.active)) {
      for (const sh of W.shots) {
        if (sh.dead || sh.y > p.y + 1.6) continue;
        const rx = p.x - sh.x;
        const rz = p.z - sh.z;
        const dd = Math.hypot(rx, rz);
        if (dd < 3.2 && rx * sh.vx + rz * sh.vz > 0) {
          out.jump = true;
          out.jumpHeld = true;
          held = 0.35;
          break;
        }
      }
    }
    // an enemy closing in: jump (usually ends in a stomp)
    const onPipe = p.ground && p.ground.owner && p.ground.owner.kind === "pipe";
    if (p.grounded && !out.jump && !onPipe) {
      for (const e of W.enemies) {
        if (!e.alive || !(e.state === "chase" || e.state === "attack") || (e.type === "armored" && e.state === "attack")) continue;
        const ex = e.x - p.x;
        const ez = e.z - p.z;
        const ed = Math.hypot(ex, ez);
        if (ed < 2.3 && Math.abs(e.y - p.y) < 1.5) {
          out.jump = true;
          out.jumpHeld = true;
          held = 0.35;
          break;
        }
      }
    }
    const n = norm(node());
    if (n.wait != null) {
      if (st > n.wait) advanceNode(W, "wait");
      return out;
    }
    if (n.hop) {
      // jump straight up (2 = double jump at the apex-ish)
      if (p.grounded) {
        out.jump = true;
        out.jumpHeld = true;
        held = 0.6;
        if (n.hop === 2) jumpQueue.push(t + (n.dj ?? 0.32));
        advanceNode(W, "hop");
      }
      return out;
    }
    if (n.interact) {
      out.interact = true;
      advanceNode(W, "interact");
      return out;
    }
    if (n.waitPlat != null) {
      const s = plat(W, n.waitPlat).solid;
      const dirOk = (!n.dir || s.dx * n.dir[0] + s.dz * n.dir[1] > 0) && (n.topBelow == null || s.y + s.hy < n.topBelow) && (n.topAbove == null || s.y + s.hy > n.topAbove) && (n.rising == null || (s.dy > 0) === n.rising);
      if (Math.hypot(s.x - n.near[0], s.z - n.near[1]) < (n.r ?? 0.8) && p.grounded && dirOk) advanceNode(W, "plat near");
      if (n.hold) Object.assign(out, steer(W, n.hold[0], n.hold[1], false));
      return out;
    }
    if (n.boss) {
      // fight: stay ~8 m away and strafe; step out of red rings; jump shock
      // waves; when the boss is dazed run in and land on its head
      const B = W.boss;
      if (!B || B.defeated) {
        advanceNode(W, "boss down");
        return out;
      }
      const dx = p.x - B.x;
      const dz = p.z - B.z;
      const d = Math.hypot(dx, dz) || 1;
      let tx;
      let tz;
      if (B.dazed && B.hitT <= 0) {
        tx = B.x;
        tz = B.z;
        if (p.grounded && d < B.r + 2.6) {
          out.jump = true;
          out.jumpHeld = true;
          held = 0.5;
        }
      } else {
        // orbit: a point `want` metres from the boss, turned round the boss
        // until it lies inside the arena (never backs into the rim)
        const want = B.state === "burrow" ? 11 : 9;
        const base = Math.atan2(dx, dz);
        const drift = Math.sin(t * 0.35) > 0 ? 0.35 : -0.35;
        let best = null;
        for (let k = 0; k < 12 && !best; k++) {
          for (const sgn of [1, -1]) {
            const ang = base + drift + sgn * k * 0.3;
            const cx = B.x + Math.sin(ang) * want;
            const cz = B.z + Math.cos(ang) * want;
            if (Math.hypot(cx - B.cx, cz - B.cz) < B.R - 3.5) {
              best = [cx, cz];
              break;
            }
          }
        }
        tx = best ? best[0] : B.cx;
        tz = best ? best[1] : B.cz;
        // hurt? grab a dropped heart when the way there doesn't pass the boss
        const heart = W.hearts < 3 && W.pickups.find((k) => {
          if (k.taken || k.type !== "heart" || Math.hypot(k.x - B.cx, k.z - B.cz) > B.R - 2) return false;
          for (let u = 0; u <= 1; u += 0.1) {
            if (Math.hypot(p.x + (k.x - p.x) * u - B.x, p.z + (k.z - p.z) * u - B.z) < 5) return false;
          }
          return true;
        });
        if (heart) {
          tx = heart.x;
          tz = heart.z;
        }
        if (B.state === "chargeWind" || B.state === "charge") {
          // get out of the charge line: step sideways relative to its facing
          const yaw = B.state === "charge" ? B.lockYaw : B.yaw;
          const fx = Math.sin(yaw);
          const fz = Math.cos(yaw);
          let side2 = dx * fz - dz * fx >= 0 ? 1 : -1;
          if (Math.hypot(p.x + fz * side2 * 6 - B.cx, p.z - fx * side2 * 6 - B.cz) > B.R - 2.5) side2 = -side2;
          tx = p.x + fz * side2 * 6;
          tz = p.z - fx * side2 * 6;
        }
      }
      // dodging a telegraph beats everything (tangential near the edge)
      for (const m of B.marks) {
        const mx = p.x - m.x;
        const mz = p.z - m.z;
        const md = Math.hypot(mx, mz) || 1;
        if (md < m.r + 2.5) {
          let fx = mx / md;
          let fz = mz / md;
          const ex = p.x + fx * 6 - B.cx;
          const ez = p.z + fz * 6 - B.cz;
          if (Math.hypot(ex, ez) > B.R - 2) {
            const tmp = fx;
            fx = -fz;
            fz = tmp;
            if (Math.hypot(p.x + fx * 6 - B.cx, p.z + fz * 6 - B.cz) > B.R - 2) {
              fx = -fx;
              fz = -fz;
            }
          }
          tx = p.x + fx * 6;
          tz = p.z + fz * 6;
        }
      }
      // sidestep out of the line of an incoming projectile
      if (!(B.dazed && B.hitT <= 0)) {
        for (const sh of W.shots) {
          if (sh.dead) continue;
          const sp = Math.hypot(sh.vx, sh.vz);
          if (sp < 0.5) continue;
          const ux = sh.vx / sp;
          const uz = sh.vz / sp;
          const rx = p.x - sh.x;
          const rz = p.z - sh.z;
          const along = rx * ux + rz * uz;
          const lat = rx * -uz + rz * ux;
          if (along > 0 && along < 9 && Math.abs(lat) < sh.r + 1.4) {
            let sgn = lat >= 0 ? 1 : -1;
            if (Math.hypot(p.x - uz * sgn * 4 - B.cx, p.z + ux * sgn * 4 - B.cz) > B.R - 2.5) sgn = -sgn;
            tx = p.x - uz * sgn * 4;
            tz = p.z + ux * sgn * 4;
            break;
          }
        }
      }
      // sprint only when far from the target, and never toward the rim
      const rim = Math.hypot(p.x - B.cx, p.z - B.cz) > B.R - 4;
      Object.assign(out, steer(W, tx, tz, Math.hypot(tx - p.x, tz - p.z) > 3 && !rim));
      // jump incoming shock rings and low shots
      for (const g of W.rings) {
        if (g.dead) continue;
        const pd = Math.hypot(p.x - g.x, p.z - g.z);
        if (pd - g.r > 0.25 && pd - g.r < 2.2 && p.grounded) {
          out.jump = true;
          out.jumpHeld = true;
          held = 0.4;
        }
      }
      for (const sh of W.shots) {
        if (sh.dead) continue;
        const sd = Math.hypot(p.x - sh.x, p.z - sh.z);
        if (sd < 3.4 && p.grounded && sh.y < p.y + 1.5) {
          out.jump = true;
          out.jumpHeld = true;
          held = 0.4;
        }
      }
      if (st > (n.timeout ?? 150)) advanceNode(W, "boss TIMEOUT");
      return out;
    }
    if (n.waitSafe != null) {
      // stand still until the run to waitSafe is clear of firebars / geysers
      const spd = n.sprint ? 10 : 6.2;
      if (p.grounded && passIsSafe(W, p, n.waitSafe[0], n.waitSafe[1], spd)) advanceNode(W, "safe");
      if (st > (n.timeout ?? 12)) advanceNode(W, "safe TIMEOUT");
      return out;
    }
    if (n.waitCrush != null) {
      // pass under a crusher only while it is rising or has just risen
      let h = null;
      let bd = Infinity;
      for (const hz of W.hazards) {
        if (hz.kind !== "crusher") continue;
        const dd = Math.hypot(hz.def.x - n.waitCrush[0], hz.def.z - n.waitCrush[1]);
        if (dd < bd) {
          bd = dd;
          h = hz;
        }
      }
      const ok = h && ((h.state === "rise" && h.solid.y - h.solid.hy > h.low + 1.9) || (h.state === "up" && h.st < 0.5));
      if (ok && p.grounded) advanceNode(W, "crusher clear");
      return out;
    }
    if (n.waitAlign != null) {
      // a spinning bar lined up with our path (yaw ≡ at, mod π)
      const sy = plat(W, n.waitAlign).solid.yaw;
      let a = sy % Math.PI;
      if (a > Math.PI / 2) a -= Math.PI;
      if (a < -Math.PI / 2) a += Math.PI;
      if (Math.abs(a - (n.at ?? 0)) < (n.tol ?? 0.12) && p.grounded) advanceNode(W, "aligned");
      return out;
    }
    if (n.waitOn != null) {
      // a blink platform that is solid with at least ~0.8 s left before it fades
      const pl = plat(W, n.waitOn);
      const d = pl.def;
      const ph = (((pl.t / (d.period || 4)) % 1) + 1) % 1; // same phase the engine uses
      const left = ((d.on ?? 0.6) - ph) * (d.period || 4);
      if (pl.solid.active && left > (n.left ?? 0.8) && p.grounded) advanceNode(W, "blink on");
      return out;
    }
    if (n.ride != null) {
      const s = plat(W, n.ride).solid;
      Object.assign(out, steer(W, s.x, s.z, false));
      if (p.grounded) {
        out.ax *= 0.6;
        out.ay *= 0.6;
      }
      if (Math.hypot(s.x - n.until[0], s.z - n.until[1]) < (n.r ?? 0.8)) advanceNode(W, "ride");
      return out;
    }
    if (n.stomp != null) {
      const e = W.enemies[n.stomp];
      if (!e.alive) {
        advanceNode(W, "stomped");
        return out;
      }
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (e.type === "armored" && (e.state === "attack" || e.state === "windup")) {
        // spinning spikes: keep away until it stops
        Object.assign(out, steer(W, p.x + (p.x - e.x) * 2, p.z + (p.z - e.z) * 2, true));
        return out;
      }
      Object.assign(out, steer(W, e.x, e.z, n.sprint));
      if (p.grounded && d < (n.jumpAt ?? 2.6) && st > 0.2) {
        out.jump = true;
        out.jumpHeld = true;
        held = 0.3;
      }
      if (st > 12) advanceNode(W, "stomp timeout");
      return out;
    }
    const [tx, tz] = n.p;
    Object.assign(out, steer(W, tx, tz, n.sprint));
    const d = Math.hypot(tx - p.x, tz - p.z);
    if (n.jumpAt != null && d < n.jumpAt && p.grounded) {
      out.jump = true;
      out.jumpHeld = true;
      held = 0.4;
      if (n.jump === 2) jumpQueue.push(t + (n.dj ?? 0.3));
      advanceNode(W, "jumpAt");
      return out;
    }
    if (d < (n.r ?? 0.55) && (n.air || p.grounded || n.jumpAt != null)) {
      if (n.jump) {
        out.jump = true;
        out.jumpHeld = true;
        held = 0.4;
        if (n.jump === 2) jumpQueue.push(t + (n.dj ?? 0.3));
      }
      advanceNode(W, "reached");
    }
    if (st > (n.timeout ?? 15)) advanceNode(W, "TIMEOUT");
    return out;
  };
  bot.done = () => i >= route.length;
  bot.index = () => i;
  return bot;
}
