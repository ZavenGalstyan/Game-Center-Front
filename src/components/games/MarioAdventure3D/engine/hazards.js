/**
 * Mario Adventure 3D — hazards and projectiles.
 *
 *   spikes    a solid with hurt=true (touch or land on it → damage + bounce)
 *   firebar   a chain of fireballs rotating round a block
 *   crusher   a stone block that shudders, slams down, rests, then rises —
 *             rideable, and the shadow under it is the warning
 *   cannon    fires slow cannonballs along its facing (stompable)
 *   icicle    hangs; shudders when Mario walks under, then drops
 *   geyser    bubbles (warning) then erupts a column of lava / sand / water
 *
 * Projectiles (cannonballs, boss fireballs, snowballs …) and expanding shock
 * rings are generic and shared with the bosses.
 */
import { addSolid } from "./collision.js";
import { P } from "./config.js";

export function createHazard(W, d, idx) {
  const h = { idx, kind: d.type, def: d, t: d.phase || 0, st: 0, state: "idle" };
  switch (d.type) {
    case "spikes": {
      const w = d.w ?? 2;
      const dd = d.d ?? w;
      h.solid = addSolid(W.solids, { x: d.x, y: d.y + 0.3, z: d.z, hx: w / 2, hy: 0.3, hz: dd / 2, hurt: true, surf: "metal", camIgnore: true });
      break;
    }
    case "firebar":
      h.solid = addSolid(W.solids, { x: d.x, y: d.y, z: d.z, hx: 0.5, hy: 0.5, hz: 0.5, surf: "stone" });
      h.angle = d.angle || 0;
      break;
    case "crusher": {
      const s = d.size ?? 2.2;
      h.top = d.y + (d.rise ?? 4.5); // resting high position (bottom y)
      h.low = d.y; // ground it slams to
      h.solid = addSolid(W.solids, { x: d.x, y: h.top + s / 2, z: d.z, hx: s / 2, hy: s / 2, hz: s / 2, surf: "stone" });
      h.state = "up";
      h.st = d.phase || 0;
      break;
    }
    case "cannon":
      h.solid = addSolid(W.solids, { x: d.x, y: d.y + 0.65, z: d.z, hx: 0.7, hy: 0.65, hz: 0.7, surf: "metal" });
      h.st = d.phase || 0;
      break;
    case "icicle":
      h.y = d.y;
      h.state = "hang";
      break;
    case "geyser":
      h.state = "idle";
      h.st = d.phase || 0;
      break;
    default:
  }
  return h;
}

const segDist2 = (px, py, pz, x, y, z) => {
  // distance from point to Mario's vertical body segment
  const cy = y < py + 0.35 ? py + 0.35 : y > py + P.HEIGHT - 0.35 ? py + P.HEIGHT - 0.35 : y;
  const dx = px - x;
  const dy = cy - y;
  const dz = pz - z;
  return dx * dx + dy * dy + dz * dz;
};
export const bodyDist2 = (p, x, y, z) => segDist2(p.x, p.y, p.z, x, y, z);

export function firebarBalls(h, out) {
  const d = h.def;
  const n = d.n ?? 5;
  out.length = 0;
  for (let i = 0; i < n; i++) {
    const r = 0.6 + i * 0.55;
    out.push([d.x + Math.sin(h.angle) * r, d.y, d.z + Math.cos(h.angle) * r]);
  }
  if (d.double) {
    for (let i = 0; i < n; i++) {
      const r = 0.6 + i * 0.55;
      out.push([d.x - Math.sin(h.angle) * r, d.y, d.z - Math.cos(h.angle) * r]);
    }
  }
  return out;
}
const balls = [];

export function stepHazard(W, h, dt) {
  const d = h.def;
  const p = W.player;
  h.t += dt;
  h.st += dt;
  switch (h.kind) {
    case "firebar": {
      h.angle += (d.rate ?? 1.6) * dt;
      firebarBalls(h, balls);
      for (const b of balls) if (bodyDist2(p, b[0], b[1], b[2]) < 0.62 * 0.62) W.hurt(b[0], b[2], "fire");
      break;
    }
    case "crusher": {
      const s = h.solid;
      const half = s.hy;
      const oy = s.y;
      const wait = d.wait ?? 2;
      if (h.state === "up") {
        if (h.st > wait) {
          h.state = "warn";
          h.st = 0;
          W.emit("crusherWarn", { h });
        }
      } else if (h.state === "warn") {
        if (h.st > 0.6) {
          h.state = "slam";
          h.st = 0;
          h.v = 0;
        }
      } else if (h.state === "slam") {
        h.v = (h.v || 0) + 60 * dt;
        s.y -= h.v * dt;
        // crushing: Mario under it
        const under = Math.abs(p.x - s.x) < s.hx + P.RADIUS * 0.6 && Math.abs(p.z - s.z) < s.hz + P.RADIUS * 0.6 && p.y < s.y - half && p.y + P.HEIGHT > s.y - half - 0.1;
        if (under) {
          W.hurt(s.x, s.z, "crush");
          if (p.invuln > 0) {
            // shove Mario out sideways so he isn't stuck under it
            const dx = p.x - s.x || 0.01;
            const dz = p.z - s.z;
            const L = Math.hypot(dx, dz) || 1;
            p.x = s.x + (dx / L) * (Math.max(s.hx, s.hz) * 1.45 + P.RADIUS);
            p.z = s.z + (dz / L) * (Math.max(s.hx, s.hz) * 1.45 + P.RADIUS);
          }
        }
        if (s.y - half <= h.low) {
          s.y = h.low + half;
          h.state = "down";
          h.st = 0;
          W.emit("crusherSlam", { h });
        }
      } else if (h.state === "down") {
        if (h.st > 1.1) {
          h.state = "rise";
          h.st = 0;
        }
      } else if (h.state === "rise") {
        s.y += 2.4 * dt;
        if (s.y - half >= h.top) {
          s.y = h.top + half;
          h.state = "up";
          h.st = 0;
        }
      }
      s.dx = 0;
      s.dz = 0;
      s.dyaw = 0;
      s.dy = s.y - oy;
      break;
    }
    case "cannon": {
      const every = d.every ?? 3;
      if (h.st > every) {
        h.st = 0;
        const yaw = d.yaw || 0;
        spawnShot(W, {
          kind: "cannonball",
          x: d.x + Math.sin(yaw) * 0.9,
          y: d.y + 0.75,
          z: d.z + Math.cos(yaw) * 0.9,
          vx: Math.sin(yaw) * (d.speed ?? 6.5),
          vy: 0,
          vz: Math.cos(yaw) * (d.speed ?? 6.5),
          r: 0.48,
          life: d.range ? d.range / (d.speed ?? 6.5) : 5,
          stompable: true,
        });
        W.emit("cannonFire", { h });
      }
      break;
    }
    case "icicle": {
      if (h.state === "hang") {
        const dx = p.x - d.x;
        const dz = p.z - d.z;
        if (dx * dx + dz * dz < 2.6 * 2.6 && p.y < d.y && p.y > d.y - 12) {
          h.state = "shake";
          h.st = 0;
          W.emit("icicleShake", { h });
        }
      } else if (h.state === "shake") {
        if (h.st > 0.6) {
          h.state = "drop";
          h.st = 0;
          h.v = 0;
        }
      } else if (h.state === "drop") {
        h.v += 30 * dt;
        h.y -= h.v * dt;
        if (bodyDist2(p, d.x, h.y - 0.4, d.z) < 0.55 * 0.55) W.hurt(d.x, d.z, "icicle");
        const g = W.terrain.height(d.x, d.z);
        const floor = Number.isFinite(g) ? g : W.killY;
        if (h.y - 1 < floor || h.st > 3) {
          h.state = "gone";
          h.st = 0;
          W.emit("icicleBreak", { h, y: Math.max(floor, h.y - 1) });
        }
      } else if (h.state === "gone" && h.st > 4) {
        h.state = "hang";
        h.st = 0;
        h.y = d.y;
      }
      break;
    }
    case "geyser": {
      const per = d.period ?? 4;
      const ph = h.st % per;
      const prev = h.state;
      h.state = ph < per - 2.2 ? "idle" : ph < per - 1.2 ? "warn" : "erupt";
      if (h.state !== prev && h.state === "erupt") W.emit("geyser", { h });
      if (h.state === "erupt") {
        const dx = p.x - d.x;
        const dz = p.z - d.z;
        const R = (d.r ?? 1.1) + P.RADIUS * 0.5;
        if (dx * dx + dz * dz < R * R && p.y < d.y + (d.height ?? 5)) W.hurt(d.x, d.z, "fire");
      }
      break;
    }
    default:
  }
}

export function resetHazard(W, h) {
  const d = h.def;
  h.t = d.phase || 0;
  h.st = d.phase || 0;
  if (h.kind === "crusher") {
    h.state = "up";
    h.solid.y = h.top + h.solid.hy;
  } else if (h.kind === "icicle") {
    h.state = "hang";
    h.y = d.y;
  } else if (h.kind === "firebar") h.angle = d.angle || 0;
}

/* ------------------------------------------------------------------ projectiles */
export function spawnShot(W, s) {
  const shot = { grav: 0, bounce: 0, stompable: false, dead: false, t: 0, id: W.shotSeq++, ...s };
  W.shots.push(shot);
  return shot;
}

export function stepShots(W, dt) {
  const p = W.player;
  for (const s of W.shots) {
    if (s.dead) continue;
    s.t += dt;
    s.vy -= s.grav * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.home && s.t < s.home) {
      // gentle homing (boss snowballs / fire wisps) — always dodgeable
      const dx = p.x - s.x;
      const dz = p.z - s.z;
      const L = Math.hypot(dx, dz) || 1;
      const sp = Math.hypot(s.vx, s.vz);
      s.vx += ((dx / L) * sp - s.vx) * dt * 0.9;
      s.vz += ((dz / L) * sp - s.vz) * dt * 0.9;
    }
    const g = W.terrain.height(s.x, s.z);
    if (s.grav > 0 && Number.isFinite(g) && s.y - s.r < g) {
      if (s.bounce > 0 && Math.abs(s.vy) > 2) {
        s.y = g + s.r;
        s.vy = -s.vy * s.bounce;
      } else if (s.roll) {
        s.y = g + s.r;
        s.vy = 0;
      } else {
        s.dead = true;
        W.emit("shotBurst", { s });
        continue;
      }
    }
    if (s.t > s.life || s.y < W.killY - 4) {
      s.dead = true;
      W.emit("shotBurst", { s, quiet: true });
      continue;
    }
    // vs Mario
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const R = s.r + P.RADIUS;
    if (dx * dx + dz * dz < R * R && p.y < s.y + s.r && p.y + P.HEIGHT > s.y - s.r) {
      if (s.stompable && p.vy < 0 && p.y > s.y + s.r * 0.2) {
        s.dead = true;
        W.stompShot(s);
      } else if (!p.dead) {
        if (W.power.star > 0) {
          s.dead = true;
          W.emit("shotBurst", { s });
        } else {
          W.hurt(s.x, s.z, s.kind);
          if (s.kind !== "beam") {
            s.dead = true;
            W.emit("shotBurst", { s });
          }
        }
      }
    }
  }
  if (W.shots.length > 60 || (W.shots.length && W.clock - W.lastShotClean > 2)) {
    W.shots = W.shots.filter((s) => !s.dead);
    W.lastShotClean = W.clock;
  }
}

/** expanding shock rings (boss slams): jump over the wave */
export function spawnRing(W, r) {
  W.rings.push({ t: 0, r: 0.5, dead: false, h: 0.7, speed: 8, max: 18, ...r });
}

export function stepRings(W, dt) {
  const p = W.player;
  for (const g of W.rings) {
    if (g.dead) continue;
    g.t += dt;
    const prev = g.r;
    g.r += g.speed * dt;
    if (g.r > g.max) {
      g.dead = true;
      continue;
    }
    const d = Math.hypot(p.x - g.x, p.z - g.z);
    const band = Math.max(0.5, g.r - prev + 0.45);
    if (Math.abs(d - g.r) < band && p.y < g.y + g.h && p.y > g.y - 1.5) W.hurt(g.x, g.z, "shock");
  }
  if (W.rings.length > 10) W.rings = W.rings.filter((g) => !g.dead);
}
