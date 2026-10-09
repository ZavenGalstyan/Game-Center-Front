/**
 * Mario Adventure 3D — platform behaviours. Each platform entity owns one
 * collision solid and moves it in place every step, recording the step's
 * motion on the solid (dx, dy, dz, dyaw) so whoever stands on it is carried
 * exactly (player.js "ride").
 *
 *   static   never moves
 *   move     ping-pongs smoothly between `from` and `to` (period seconds),
 *            or loops a `path` of points at constant speed
 *   spin     rotates about its centre (rate rad/s) — discs and bars
 *   fall     shakes when stood on, drops, then respawns
 *   bounce   a spring pad: landing launches Mario (solid.bounce)
 *   blink    appears / vanishes on a timer, flickering before it goes
 */
import { addSolid, setYaw } from "./collision.js";
import { P } from "./config.js";

export function createPlatform(W, d) {
  const shape = d.shape || "box";
  const h = d.h ?? 1;
  const cx = d.x;
  const cy = d.top - h / 2;
  const cz = d.z;
  const solid = addSolid(W.solids, {
    shape,
    x: cx,
    y: cy,
    z: cz,
    hx: (d.w ?? 2) / 2,
    hy: h / 2,
    hz: (d.d ?? d.w ?? 2) / 2,
    r: d.r ?? (d.w ?? 2) / 2,
    yaw: d.yaw || 0,
    surf: d.surf || surfFor(d.style, W.level.theme),
    oneWay: !!d.oneWay,
    bounce: d.type === "bounce" ? d.power ?? P.SPRING_V : 0,
    camIgnore: !!d.camIgnore || (shape === "cyl" && (d.r ?? 1) < 0.6),
  });
  const pl = {
    kind: d.type || "static",
    def: d,
    solid,
    t: d.phase || 0,
    base: { x: cx, y: cy, z: cz, yaw: d.yaw || 0 },
    state: "idle",
    st: 0,
    fade: 1,
    squash: 0,
    warn: 0,
  };
  solid.owner = pl;
  if (pl.kind === "move" && d.path) {
    // closed polyline of centres (given as tops) at constant speed
    pl.pts = d.path.map((q) => [q[0], q[1] - h / 2, q[2]]);
    let L = 0;
    pl.seg = [];
    for (let i = 0; i < pl.pts.length; i++) {
      const a = pl.pts[i];
      const b = pl.pts[(i + 1) % pl.pts.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      pl.seg.push(l);
      L += l;
    }
    pl.len = L;
  }
  return pl;
}

function surfFor(style, theme) {
  if (style === "ice") return "ice";
  if (style === "wood" || style === "log" || style === "plank") return "wood";
  if (style === "cloud") return "cloud";
  if (style === "metal") return "metal";
  if (style === "grass") return "grass";
  if (style === "sand" || style === "sandstone") return "sand";
  if (style === "snow") return "snow";
  if (theme === "snow" && style === "block") return "snow";
  return "stone";
}

function placeOnPath(pl, dist) {
  let d = ((dist % pl.len) + pl.len) % pl.len;
  for (let i = 0; i < pl.seg.length; i++) {
    const l = pl.seg[i];
    if (d <= l || i === pl.seg.length - 1) {
      const a = pl.pts[i];
      const b = pl.pts[(i + 1) % pl.pts.length];
      const k = l > 0 ? Math.min(1, d / l) : 0;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    d -= l;
  }
  return pl.pts[0];
}

export function stepPlatform(W, pl, dt) {
  const s = pl.solid;
  const d = pl.def;
  const ox = s.x;
  const oy = s.y;
  const oz = s.z;
  const oyaw = s.yaw;
  pl.t += dt;
  if (pl.squash > 0) pl.squash = Math.max(0, pl.squash - dt * 4);
  switch (pl.kind) {
    case "move": {
      if (pl.pts) {
        const q = placeOnPath(pl, pl.t * (d.speed || 2.5));
        s.x = q[0];
        s.y = q[1];
        s.z = q[2];
      } else {
        const per = d.period || 5;
        const k = 0.5 - 0.5 * Math.cos((pl.t / per) * Math.PI * 2);
        const to = d.to;
        s.x = pl.base.x + (to[0] - d.x) * k;
        s.y = pl.base.y + (to[1] - d.top) * k;
        s.z = pl.base.z + (to[2] - d.z) * k;
      }
      break;
    }
    case "spin":
      setYaw(s, s.yaw + (d.rate || 0.8) * dt);
      break;
    case "fall": {
      if (pl.state === "shake") {
        pl.st += dt;
        if (pl.st > (d.delay ?? 0.6)) {
          pl.state = "drop";
          pl.st = 0;
          pl.vy = 0;
          W.emit("platformFall", { pl });
        }
      } else if (pl.state === "drop") {
        pl.st += dt;
        pl.vy -= 26 * dt;
        s.y += pl.vy * dt;
        if (pl.st > 2.2) {
          pl.state = "gone";
          pl.st = 0;
          s.active = false;
        }
      } else if (pl.state === "gone") {
        pl.st += dt;
        if (pl.st > (d.respawn ?? 3)) {
          pl.state = "idle";
          pl.st = 0;
          s.x = pl.base.x;
          s.y = pl.base.y;
          s.z = pl.base.z;
          s.active = !blockedByPlayer(W, s);
          if (!s.active) pl.state = "gone";
          else pl.fade = 0;
        }
      }
      if (pl.fade < 1) pl.fade = Math.min(1, pl.fade + dt * 3);
      break;
    }
    case "blink": {
      const per = d.period || 4;
      const on = d.on ?? 0.6;
      const ph = ((pl.t / per) % 1 + 1) % 1;
      const want = ph < on;
      pl.warn = want && ph > on - 0.22 ? 1 : 0;
      if (want !== s.active) {
        if (want && blockedByPlayer(W, s)) break; // don't materialise inside Mario
        s.active = want;
        W.emit(want ? "blinkOn" : "blinkOff", { pl });
      }
      pl.fade = s.active ? Math.min(1, pl.fade + dt * 8) : Math.max(0, pl.fade - dt * 8);
      break;
    }
    default:
  }
  s.dx = s.x - ox;
  s.dy = s.y - oy;
  s.dz = s.z - oz;
  s.dyaw = s.yaw - oyaw;
}

function blockedByPlayer(W, s) {
  const p = W.player;
  if (p.y > s.y + s.hy || p.y + P.HEIGHT < s.y - s.hy) return false;
  const dx = p.x - s.x;
  const dz = p.z - s.z;
  const R = s.br + P.RADIUS;
  return dx * dx + dz * dz < R * R;
}

export function standOnPlatform(W, pl) {
  if (pl.kind === "fall" && pl.state === "idle") {
    pl.state = "shake";
    pl.st = 0;
    W.emit("platformShake", { pl });
  }
}

export function resetPlatform(pl) {
  const s = pl.solid;
  s.x = pl.base.x;
  s.y = pl.base.y;
  s.z = pl.base.z;
  setYaw(s, pl.base.yaw);
  s.active = true;
  s.dx = s.dy = s.dz = s.dyaw = 0;
  pl.t = pl.def.phase || 0;
  pl.state = "idle";
  pl.st = 0;
  pl.fade = 1;
}
