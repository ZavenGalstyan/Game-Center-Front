/**
 * Time-driven level machinery shared by the simulation, the renderer and the
 * test bot. Every moving platform and hazard is a pure function of the level
 * clock `t`, so the bot can look ahead ("will this spot be safe in 0.4 s?")
 * and a restart always replays the exact same timing.
 *
 * Player collider: an axis-aligned box HW wide each side, PH tall, feet at y.
 */
export const HW = 0.34;
export const PH = 1.3;
const TAU = Math.PI * 2;

/** 0..1 position inside a repeating cycle */
export const cyc = (t, period, ph = 0) => ((((t / period + ph) % 1) + 1) % 1);

/** eased back-and-forth 0→1→0 (velocity is zero at both ends) */
export const pingPong = (t, period, ph = 0) => 0.5 - 0.5 * Math.cos(TAU * cyc(t, period, ph));

/** centre of a moving platform at time t (mover: {ax,ay,az,bx,by,bz,period,ph}) */
export function moverAt(m, t, out = {}) {
  const s = pingPong(t, m.period, m.ph);
  out.x = m.ax + (m.bx - m.ax) * s;
  out.y = m.ay + (m.by - m.ay) * s;
  out.z = m.az + (m.bz - m.az) * s;
  out.s = s;
  return out;
}

const DROP = { warn: 1.3, fall: 0.2, hit: 0.3, rest: 0.6 }; // falling icicles / rocks timeline (s)

/** render-friendly state of a hazard at time t */
export function hazardState(h, t) {
  switch (h.type) {
    case "spikes": {
      if (!h.period) return { up: 1 };
      const c = cyc(t, h.period, h.ph);
      // rise over the first 8% of the "on" window, sink over the last 8%
      const on = h.on;
      let up = 0;
      if (c < on) up = Math.min(1, c / 0.08, (on - c) / 0.08);
      const warn = c > 1 - 0.6 / h.period; // rattle before they rise
      return { up: Math.max(0, up), warn };
    }
    case "bar":
      return { a: h.w * t + h.ph };
    case "saw": {
      const s = pingPong(t, h.period, h.ph);
      return { x: h.ax + (h.bx - h.ax) * s, z: h.az + (h.bz - h.az) * s };
    }
    case "fire": {
      const c = cyc(t, h.period, h.ph);
      const warnFrac = 0.7 / h.period;
      return { on: c < h.on, warn: c >= 1 - warnFrac, k: c < h.on ? Math.min(1, c / 0.06, (h.on - c) / 0.06) : 0 };
    }
    case "drop": {
      const tau = cyc(t, h.period, h.ph) * h.period;
      const { warn, fall, hit, rest } = DROP;
      if (tau < warn) return { stage: "warn", k: tau / warn, y: h.top };
      if (tau < warn + fall) {
        const k = (tau - warn) / fall;
        return { stage: "fall", k, y: h.top + (h.y - h.top) * k * k };
      }
      if (tau < warn + fall + hit) return { stage: "hit", k: (tau - warn - fall) / hit, y: h.y };
      if (tau < warn + fall + hit + rest) return { stage: "rest", k: (tau - warn - fall - hit) / rest, y: h.y };
      return { stage: "idle", k: 0, y: h.top };
    }
    default:
      return {};
  }
}

/** does hazard h touch a player whose feet are at (px,py,pz) at time t? */
export function hazardHits(h, t, px, py, pz) {
  switch (h.type) {
    case "spikes": {
      if (h.period && hazardState(h, t).up < 0.5) return false;
      return px + HW > h.x0 + 0.08 && px - HW < h.x1 - 0.08 && pz + HW > h.z0 + 0.08 && pz - HW < h.z1 - 0.08 && py < h.y + 0.42 && py + PH > h.y;
    }
    case "bar": {
      const by = h.y + 0.5; // bar height above the pad
      if (py > by + 0.05 || py + PH < by - 0.15) return false;
      const a = h.w * t + h.ph;
      const ux = Math.cos(a), uz = Math.sin(a);
      const dx = px - h.x, dz = pz - h.z;
      let k = dx * ux + dz * uz;
      k = Math.max(-h.len, Math.min(h.len, k));
      return Math.hypot(dx - ux * k, dz - uz * k) < HW + 0.17;
    }
    case "saw": {
      const s = pingPong(t, h.period, h.ph);
      const cx = h.ax + (h.bx - h.ax) * s, cz = h.az + (h.bz - h.az) * s, cy = h.y + h.r;
      const nx = Math.max(px - HW, Math.min(cx, px + HW));
      const ny = Math.max(py, Math.min(cy, py + PH));
      const nz = Math.max(pz - HW, Math.min(cz, pz + HW));
      return Math.hypot(nx - cx, ny - cy, nz - cz) < h.r * 0.85;
    }
    case "fire": {
      if (!(cyc(t, h.period, h.ph) < h.on)) return false;
      return Math.hypot(px - h.x, pz - h.z) < h.r + HW * 0.5 && py < h.y + 2.4 && py + PH > h.y;
    }
    case "drop": {
      const tau = cyc(t, h.period, h.ph) * h.period;
      const t0 = DROP.warn + DROP.fall * 0.5, t1 = DROP.warn + DROP.fall + DROP.hit;
      if (tau < t0 || tau > t1) return false;
      return Math.hypot(px - h.x, pz - h.z) < h.r + HW * 0.4 && py < h.y + 1.3;
    }
    default:
      return false;
  }
}

/** true if any hazard of the list touches the player at (px,py,pz,t) */
export function anyHazard(list, t, px, py, pz) {
  for (const h of list) if (hazardHits(h, t, px, py, pz)) return h;
  return null;
}
