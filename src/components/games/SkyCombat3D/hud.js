/**
 * Sky Combat 3D — the 2D HUD layer (one canvas over the WebGL view, redrawn
 * every frame) and the radar scope. Everything drawn comes from live sim
 * state: marker positions are projected through the real camera, the radar
 * plots real offsets from the player.
 */
import * as THREE from "three";

const CY = "#5fe8ff";
const CY_DIM = "rgba(95,232,255,0.55)";
const RED = "#ff4b3e";
const ORANGE = "#ffa040";
const GREEN = "#7dff9a";
const BLUE = "#6fb6ff";
const P = {};
const P2 = {};
const v = new THREE.Vector3();

function fmtDist(m) {
  return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + " km" : Math.round(m) + " m";
}

/** Clamp an off-screen marker to an ellipse around the screen centre; returns angle. */
function edge(w, h, p) {
  let dx = p.dx;
  let dy = -p.dy;
  if (!p.front && Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
  const a = Math.atan2(dy, dx);
  const rx = w * 0.44;
  const ry = h * 0.4;
  return { x: w / 2 + Math.cos(a) * rx, y: h / 2 + Math.sin(a) * ry, a };
}
function arrow(g, x, y, a, col, s = 9) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(s, 0);
  g.lineTo(-s * 0.7, s * 0.75);
  g.lineTo(-s * 0.35, 0);
  g.lineTo(-s * 0.7, -s * 0.75);
  g.closePath();
  g.fill();
  g.restore();
}
function brackets(g, x, y, r, col, lw = 1.6) {
  const k = r * 0.45;
  g.strokeStyle = col;
  g.lineWidth = lw;
  g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.moveTo(x + sx * r, y + sy * (r - k));
    g.lineTo(x + sx * r, y + sy * r);
    g.lineTo(x + sx * (r - k), y + sy * r);
  }
  g.stroke();
}
function diamond(g, x, y, r, col, fill = false) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath();
  if (fill) {
    g.fillStyle = col;
    g.fill();
  } else {
    g.strokeStyle = col;
    g.stroke();
  }
}
function label(g, text, x, y, col, align = "center", size = 11) {
  g.font = `600 ${size}px "Rajdhani", "Inter", system-ui, sans-serif`;
  g.textAlign = align;
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillText(text, x + 1, y + 1);
  g.fillStyle = col;
  g.fillText(text, x, y);
}

/**
 * Draw the combat HUD.
 * o: {w, h, scale (device px), view, aim (Vector3|null), assist, time}
 */
export function drawHud(g, sim, world, o) {
  const { w, h } = o;
  g.setTransform(o.scale, 0, 0, o.scale, 0, 0);
  g.clearRect(0, 0, w, h);
  const p = sim.player;
  if (!p.alive || sim.result?.win === true) return;
  const u = Math.max(0.75, Math.min(1.6, h / 720));
  g.lineCap = "round";
  g.lineJoin = "round";
  const proj = (x, y, z, out = P) => world.project(x, y, z, out);
  // ---- markers: targets, friends, waypoints
  const objTag = sim.stage?.def.type === "destroy" ? sim.stage.def.tag : null;
  const L = p.lock;
  for (const e of sim.hostiles()) {
    const d = e.pos.distanceTo(p.pos);
    if (d > 9000 && e.tag !== objTag) continue;
    const yOff = e.cat === "ground" ? e.radius * 0.8 : 0;
    const s = proj(e.pos.x, e.pos.y + yOff, e.pos.z);
    const isObj = e.tag && e.tag === objTag;
    const isSel = L.target === e;
    const col = isObj ? ORANGE : RED;
    if (s.on && s.x > -20 && s.x < w + 20 && s.y > -20 && s.y < h + 20) {
      if (isSel) continue; // drawn below
      const r = Math.max(6, Math.min(18, (e.radius * 600) / Math.max(1, d))) * u;
      if (e.cat === "air") brackets(g, s.x, s.y, r + 4, col, 1.4);
      else diamond(g, s.x, s.y, r * 0.8 + 4, col);
      if (isObj || d < 3000) label(g, (isObj ? "◆ " : "") + fmtDist(d), s.x, s.y + r + 16 * u, col, "center", 10.5 * u);
    } else if (isObj) {
      const ed = edge(w, h, s);
      arrow(g, ed.x, ed.y, ed.a, ORANGE, 9 * u);
    }
  }
  for (const m of sim.markers()) {
    if (m.kind === "target") continue;
    const s = proj(m.x, m.y, m.z);
    const d = v.set(m.x, m.y, m.z).distanceTo(p.pos);
    const col = m.kind === "friend" ? BLUE : CY;
    if (s.on && s.x > 0 && s.x < w && s.y > 0 && s.y < h) {
      if (m.kind === "friend") {
        g.lineWidth = 1.5;
        g.strokeStyle = BLUE;
        g.beginPath();
        g.arc(s.x, s.y, 12 * u, 0, Math.PI * 2);
        g.stroke();
        const e = m.ent;
        const f = Math.max(0, e.hp / e.maxHp);
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.fillRect(s.x - 18 * u, s.y + 16 * u, 36 * u, 4 * u);
        g.fillStyle = f < 0.35 ? RED : BLUE;
        g.fillRect(s.x - 18 * u, s.y + 16 * u, 36 * u * f, 4 * u);
        label(g, e.name.toUpperCase(), s.x, s.y - 16 * u, BLUE, "center", 10 * u);
      } else if (m.kind !== "gate-next") {
        g.lineWidth = 2;
        diamond(g, s.x, s.y, 9 * u, col);
        label(g, (m.kind === "gate" ? `GATE ${m.n}  ` : "WAYPOINT  ") + fmtDist(d), s.x, s.y - 14 * u, col, "center", 11 * u);
      }
    } else if (m.kind !== "gate-next") {
      const ed = edge(w, h, s);
      arrow(g, ed.x, ed.y, ed.a, col, 9 * u);
    }
  }
  // ---- selected target: box, lock progress, info
  const T = L.target;
  if (T && T.alive) {
    const yOff = T.cat === "ground" ? T.radius * 0.6 : 0;
    const s = proj(T.pos.x, T.pos.y + yOff, T.pos.z);
    const d = T.pos.distanceTo(p.pos);
    const col = L.locked ? RED : CY;
    if (s.on && s.x > 0 && s.x < w && s.y > 0 && s.y < h) {
      const r = 20 * u;
      g.lineWidth = 2;
      g.strokeStyle = col;
      g.strokeRect(s.x - r, s.y - r, r * 2, r * 2);
      // lock progress arc
      const st = Math.min(1, L.t / sim.stats.lockTime);
      if (st > 0) {
        g.lineWidth = 3;
        g.beginPath();
        g.arc(s.x, s.y, r * 1.55, -Math.PI / 2, -Math.PI / 2 + st * Math.PI * 2);
        g.stroke();
      }
      if (L.locked) {
        g.lineWidth = 2;
        diamond(g, s.x, s.y, r * 0.75, RED);
        label(g, "LOCK", s.x, s.y - r * 1.75, RED, "center", 13 * u);
      } else if (st > 0) label(g, "LOCKING", s.x, s.y - r * 1.75, CY, "center", 11 * u);
      label(g, T.name.toUpperCase(), s.x + r + 8, s.y - 4, col, "left", 11 * u);
      label(g, fmtDist(d), s.x + r + 8, s.y + 10 * u, col, "left", 11 * u);
      const f = Math.max(0, T.hp / T.maxHp);
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(s.x + r + 8, s.y + 15 * u, 46 * u, 4 * u);
      g.fillStyle = f < 0.35 ? RED : f < 0.66 ? ORANGE : GREEN;
      g.fillRect(s.x + r + 8, s.y + 15 * u, 46 * u * f, 4 * u);
    } else {
      const ed = edge(w, h, s);
      arrow(g, ed.x, ed.y, ed.a, col, 12 * u);
      label(g, fmtDist(d), ed.x - Math.cos(ed.a) * 20 * u, ed.y - Math.sin(ed.a) * 20 * u + 4, col, "center", 11 * u);
    }
    // gun lead pipper
    const lead = sim.gunLead(T);
    if (lead) {
      const q = proj(p.pos.x + lead.x * d, p.pos.y + lead.y * d, p.pos.z + lead.z * d, P2);
      if (q.on) {
        g.lineWidth = 1.6;
        g.strokeStyle = GREEN;
        g.beginPath();
        g.arc(q.x, q.y, 7 * u, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = GREEN;
        g.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
      }
    }
  }
  // ---- bomb impact point (CCIP)
  if (p.ccip && (sim.ground.some((e) => e.alive && e.side === "enemy" && e.pos.distanceTo(p.pos) < 6000))) {
    const q = proj(p.ccip.x, p.ccip.y, p.ccip.z, P2);
    const n = proj(p.pos.x + p.dir.x * 1500, p.pos.y + p.dir.y * 1500, p.pos.z + p.dir.z * 1500, P);
    if (q.on && q.x > 0 && q.x < w && q.y > 0 && q.y < h) {
      g.setLineDash([5, 5]);
      g.strokeStyle = CY_DIM;
      g.lineWidth = 1.2;
      g.beginPath();
      if (n.on) g.moveTo(n.x, n.y);
      g.lineTo(q.x, q.y);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = CY;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(q.x, q.y, 10 * u, 0, Math.PI * 2);
      g.moveTo(q.x - 15 * u, q.y);
      g.lineTo(q.x - 6 * u, q.y);
      g.moveTo(q.x + 6 * u, q.y);
      g.lineTo(q.x + 15 * u, q.y);
      g.stroke();
      label(g, "BOMB", q.x, q.y + 24 * u, CY, "center", 10 * u);
    }
  }
  // ---- incoming missiles
  for (const m of p.threats) {
    const s = proj(m.pos.x, m.pos.y, m.pos.z);
    const d = m.pos.distanceTo(p.pos);
    const blink = (o.time * 6) % 1 < 0.6;
    if (s.on && s.x > 0 && s.x < w && s.y > 0 && s.y < h) {
      g.strokeStyle = RED;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(s.x, s.y, 10 * u, 0, Math.PI * 2);
      g.stroke();
      if (blink) label(g, "MISSILE " + fmtDist(d), s.x, s.y - 16 * u, RED, "center", 11 * u);
    } else {
      const ed = edge(w, h, s);
      if (blink) arrow(g, ed.x, ed.y, ed.a, RED, 14 * u);
    }
  }
  // ---- boresight (gun cross) + mouse-aim circle
  const nose = proj(p.pos.x + p.dir.x * 1500, p.pos.y + p.dir.y * 1500, p.pos.z + p.dir.z * 1500);
  if (nose.on) {
    g.strokeStyle = CY;
    g.lineWidth = 2;
    const r = 10 * u;
    g.beginPath();
    g.moveTo(nose.x - r * 2, nose.y);
    g.lineTo(nose.x - r * 0.6, nose.y);
    g.moveTo(nose.x + r * 0.6, nose.y);
    g.lineTo(nose.x + r * 2, nose.y);
    g.moveTo(nose.x, nose.y - r * 0.6);
    g.lineTo(nose.x, nose.y - r * 1.4);
    g.stroke();
    g.beginPath();
    g.arc(nose.x, nose.y, 2, 0, Math.PI * 2);
    g.fillStyle = CY;
    g.fill();
  }
  if (o.aim && o.assist) {
    const a = proj(p.pos.x + o.aim.x * 1500, p.pos.y + o.aim.y * 1500, p.pos.z + o.aim.z * 1500, P2);
    if (a.on) {
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(a.x, a.y, 13 * u, 0, Math.PI * 2);
      g.stroke();
      if (nose.on && Math.hypot(a.x - nose.x, a.y - nose.y) > 20) {
        g.setLineDash([3, 6]);
        g.strokeStyle = "rgba(255,255,255,0.3)";
        g.beginPath();
        g.moveTo(nose.x, nose.y);
        g.lineTo(a.x, a.y);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }
  if (o.view === "cockpit") drawCockpitHud(g, sim, w, h, u, nose);
}

function drawCockpitHud(g, sim, w, h, u, nose) {
  const p = sim.player;
  const cx = w / 2;
  const cy = h / 2;
  g.save();
  g.beginPath();
  g.rect(cx - 220 * u, cy - 170 * u, 440 * u, 340 * u);
  g.clip();
  // pitch ladder rotated by bank
  const pitch = Math.asin(Math.max(-1, Math.min(1, p.dir.y)));
  const pxPerRad = (h / 2) / Math.tan((72 * Math.PI) / 360);
  g.translate(cx, cy);
  g.rotate(-p.bank);
  g.strokeStyle = GREEN;
  g.fillStyle = GREEN;
  g.lineWidth = 1.4;
  g.font = `600 ${10 * u}px "Rajdhani", system-ui, sans-serif`;
  for (let deg = -80; deg <= 80; deg += 10) {
    const y = (pitch - (deg * Math.PI) / 180) * pxPerRad;
    if (Math.abs(y) > 160 * u) continue;
    const half = deg === 0 ? 140 * u : 55 * u;
    if (deg < 0) g.setLineDash([6, 5]);
    g.beginPath();
    g.moveTo(-half, y);
    g.lineTo(-18 * u, y);
    g.moveTo(18 * u, y);
    g.lineTo(half, y);
    g.stroke();
    g.setLineDash([]);
    if (deg !== 0) {
      g.textAlign = "right";
      g.fillText(String(Math.abs(deg)), -half - 4, y + 4);
    }
  }
  g.restore();
  // heading tape
  const hdg = ((Math.atan2(p.dir.x, -p.dir.z) * 180) / Math.PI + 360) % 360;
  g.save();
  g.strokeStyle = GREEN;
  g.fillStyle = GREEN;
  g.font = `600 ${11 * u}px "Rajdhani", system-ui, sans-serif`;
  g.textAlign = "center";
  const ty = cy - 150 * u;
  for (let d = -30; d <= 30; d += 5) {
    const val = Math.round(hdg / 5) * 5 + d;
    const x = cx + (val - hdg) * 6 * u;
    g.beginPath();
    g.moveTo(x, ty);
    g.lineTo(x, ty + (val % 10 === 0 ? 8 : 4));
    g.stroke();
    if (val % 10 === 0) g.fillText(String(((val % 360) + 360) % 360).padStart(3, "0"), x, ty - 4);
  }
  g.strokeRect(cx - 20 * u, ty + 10 * u, 40 * u, 16 * u);
  g.fillText(String(Math.round(hdg)).padStart(3, "0"), cx, ty + 22 * u);
  // speed / altitude boxes
  g.textAlign = "right";
  g.strokeRect(cx - 200 * u, cy - 10 * u, 60 * u, 20 * u);
  g.fillText(String(Math.round(p.speed * 3.6)), cx - 144 * u, cy + 5 * u);
  g.textAlign = "left";
  g.strokeRect(cx + 140 * u, cy - 10 * u, 60 * u, 20 * u);
  g.fillText(String(Math.round(p.pos.y)), cx + 146 * u, cy + 5 * u);
  g.restore();
}

/**
 * Radar scope, heading-up. Plots real sim offsets (5 km range).
 * o: {size (css px), scale, time, range}
 */
export function drawRadar(g, sim, o) {
  const S = o.size;
  const R = S / 2 - 3;
  const range = o.range || 5000;
  g.setTransform(o.scale, 0, 0, o.scale, 0, 0);
  g.clearRect(0, 0, S, S);
  const c = S / 2;
  g.save();
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.fillStyle = "rgba(4,14,24,0.78)";
  g.fill();
  g.clip();
  g.strokeStyle = "rgba(95,232,255,0.22)";
  g.lineWidth = 1;
  for (const k of [0.33, 0.66]) {
    g.beginPath();
    g.arc(c, c, R * k, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(c, c - R);
  g.lineTo(c, c + R);
  g.moveTo(c - R, c);
  g.lineTo(c + R, c);
  g.stroke();
  // sweep
  const sw = (o.time * 1.6) % (Math.PI * 2);
  const grad = g.createConicGradient ? g.createConicGradient(sw - 0.6, c, c) : null;
  if (grad) {
    grad.addColorStop(0, "rgba(95,232,255,0)");
    grad.addColorStop(0.095, "rgba(95,232,255,0.16)");
    grad.addColorStop(0.1, "rgba(95,232,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  const p = sim.player;
  const hd = Math.atan2(p.dir.x, -p.dir.z);
  const cs = Math.cos(-hd);
  const sn = Math.sin(-hd);
  const k = R / range;
  const toScope = (dx, dz) => {
    // world dx (east) / dz (south) → heading-up scope coords
    const x = dx * cs - dz * sn;
    const z = dx * sn + dz * cs;
    return [c + x * k, c + z * k];
  };
  // waypoint / gate / home base hints (clamped to the rim)
  const pins = sim.markers().filter((m) => m.kind === "waypoint" || m.kind === "gate");
  const hb = sim.homeBase();
  pins.push({ x: hb.x, z: hb.z, kind: "home" });
  for (const m of pins) {
    let [x, y] = toScope(m.x - p.pos.x, m.z - p.pos.z);
    const dd = Math.hypot(x - c, y - c);
    if (dd > R - 6) {
      x = c + ((x - c) / dd) * (R - 6);
      y = c + ((y - c) / dd) * (R - 6);
    }
    if (m.kind === "home") {
      g.strokeStyle = GREEN;
      g.lineWidth = 1.5;
      g.strokeRect(x - 3.5, y - 3.5, 7, 7);
    } else {
      g.lineWidth = 1.5;
      diamond(g, x, y, 5, CY, true);
    }
  }
  for (const t of sim.radarContacts(range * 1.05)) {
    const [x, y] = toScope(t.dx, t.dz);
    let col = t.kind === "friend" || t.kind === "friendGround" ? BLUE : t.kind === "ground" ? ORANGE : t.kind === "threat" ? RED : t.kind === "missile" ? "rgba(255,255,255,0.7)" : RED;
    if (t.obj) col = ORANGE;
    if (t.kind === "threat") {
      if ((o.time * 6) % 1 < 0.6) {
        g.fillStyle = RED;
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
      continue;
    }
    if (t.kind === "missile") {
      g.fillStyle = col;
      g.fillRect(x - 1, y - 1, 2, 2);
      continue;
    }
    g.fillStyle = col;
    if (t.kind === "air" || t.kind === "friend") {
      g.save();
      g.translate(x, y);
      g.rotate((t.heading ?? 0) - hd);
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(3.6, 4);
      g.lineTo(-3.6, 4);
      g.closePath();
      g.fill();
      g.restore();
      if (t.boss) {
        g.strokeStyle = RED;
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.stroke();
      }
    } else g.fillRect(x - 3, y - 3, 6, 6);
    if (t.sel) {
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(x, y, 7.5, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
  // own aircraft
  g.fillStyle = CY;
  g.beginPath();
  g.moveTo(c, c - 7);
  g.lineTo(c + 5, c + 5);
  g.lineTo(c, c + 2);
  g.lineTo(c - 5, c + 5);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(95,232,255,0.6)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.stroke();
  label(g, "N", c + Math.sin(-hd) * (R - 9), c - Math.cos(-hd) * (R - 9) + 4, "rgba(95,232,255,0.8)", "center", 10);
  label(g, (range / 1000).toFixed(0) + "KM", S - 6, S - 6, "rgba(95,232,255,0.6)", "right", 9);
}
