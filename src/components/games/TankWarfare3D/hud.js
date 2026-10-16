/**
 * Tank Warfare 3D — canvas HUD layers, redrawn every frame:
 *
 *   drawHud     — aim circle (where you look), gun reticle at the PREDICTED
 *                 ballistic impact (sim.predictImpact, the same integrator the
 *                 shells use) sized by the current dispersion, reload ring,
 *                 range readout, target info, Phantom X lead marker, enemy &
 *                 objective markers (clamped to the screen edge when off-screen),
 *                 damage-direction arcs and the gunner-sight overlay.
 *   drawMinimap — player-centred map rotated with the camera, static
 *                 background from env.js plus live markers.
 */
import { AMMO } from "./data.js";

const TAU = Math.PI * 2;
const wrapPi = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const AMMO_COL = { ap: "#ffe9a0", he: "#ffa040", smoke: "#d8d8d0" };

function arrow(g, x, y, ang, col, s = 10) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, -s);
  g.lineTo(s * 0.7, s * 0.6);
  g.lineTo(0, s * 0.25);
  g.lineTo(-s * 0.7, s * 0.6);
  g.closePath();
  g.fill();
  g.restore();
}

/**
 * o: { w, h, dpr, cam {mode, yaw, zoom}, fov (deg), aim (aim point), pred (predicted impact),
 *      hits [{ang, t}], time, targeting (bool) }
 */
export function drawHud(g, sim, world, o) {
  const { w, h, dpr } = o;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const p = sim.player;
  if (!p) return;
  const cx = w / 2;
  const cy = h / 2;
  const u = Math.max(0.75, Math.min(1.4, h / 800));
  const gunner = o.cam.mode === "gunner";

  // ---------------- gunner sight overlay
  if (gunner) {
    const r = Math.min(w, h) * (o.cam.zoom ? 0.46 : 0.52);
    g.save();
    g.fillStyle = "rgba(4,8,6,0.82)";
    g.beginPath();
    g.rect(0, 0, w, h);
    g.arc(cx, cy, r, 0, TAU, true);
    g.fill("evenodd");
    g.strokeStyle = "rgba(30,40,34,0.95)";
    g.lineWidth = 6 * u;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.stroke();
    // stadia lines
    g.strokeStyle = "rgba(170,255,190,0.55)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx - r, cy);
    g.lineTo(cx - 30 * u, cy);
    g.moveTo(cx + 30 * u, cy);
    g.lineTo(cx + r, cy);
    g.moveTo(cx, cy + 30 * u);
    g.lineTo(cx, cy + r);
    for (let k = 1; k <= 5; k++) {
      const y = cy + 30 * u + k * 22 * u;
      g.moveTo(cx - (k % 2 ? 6 : 12) * u, y);
      g.lineTo(cx + (k % 2 ? 6 : 12) * u, y);
    }
    g.stroke();
    g.fillStyle = "rgba(170,255,190,0.7)";
    g.font = `${11 * u}px ui-monospace, monospace`;
    g.fillText(o.cam.zoom ? "×4.0" : "×1.2", cx + r * 0.62, cy + r * 0.7);
    g.restore();
  }

  // ---------------- markers (behind the reticles)
  const edge = 34 * u;
  const toEdge = (sx, sy, behind) => {
    let dx = sx - cx;
    let dy = sy - cy;
    if (behind) {
      dx = -dx;
      dy = -dy;
    }
    const k = Math.min((w / 2 - edge) / Math.max(1e-3, Math.abs(dx)), (h / 2 - edge) / Math.max(1e-3, Math.abs(dy)));
    return [cx + dx * Math.min(k, behind ? k : 1), cy + dy * Math.min(k, behind ? k : 1), Math.atan2(dy, dx) + Math.PI / 2];
  };
  for (const m of sim.markers()) {
    const q = world.project(m.x, m.y + (m.kind === "zone" || m.kind === "point" || m.kind === "search" ? 6 : 0), m.z);
    const on = !q.behind && q.x > edge && q.x < w - edge && q.y > edge && q.y < h - edge;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    const col = m.kind === "boss" ? "#ff5a3c" : m.kind === "hq" || m.kind === "escort" ? "#6fb6ff" : m.kind === "search" ? "#ffd166" : m.defend ? "#6fb6ff" : "#ffd166";
    if (on) {
      g.save();
      g.translate(q.x, q.y);
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.fillStyle = "rgba(0,0,0,0.35)";
      const s = 9 * u;
      g.beginPath();
      if (m.kind === "zone" || m.kind === "point" || m.kind === "search") {
        g.arc(0, 0, s, 0, TAU);
        if (m.frac) {
          g.fill();
          g.stroke();
          g.beginPath();
          g.strokeStyle = "#7dff9a";
          g.lineWidth = 3;
          g.arc(0, 0, s + 4, -Math.PI / 2, -Math.PI / 2 + TAU * m.frac);
        }
      } else {
        g.moveTo(0, -s);
        g.lineTo(s, 0);
        g.lineTo(0, s);
        g.lineTo(-s, 0);
        g.closePath();
      }
      g.fill();
      g.stroke();
      g.fillStyle = col;
      g.font = `600 ${11 * u}px Inter, system-ui, sans-serif`;
      g.textAlign = "center";
      g.fillText(`${m.label} · ${Math.round(d)}m`, 0, -s - 7);
      if (m.ref && m.ref.maxHp && (m.kind === "hq" || m.kind === "escort" || m.kind === "target" || m.kind === "boss")) {
        const f = Math.max(0, m.ref.hp / m.ref.maxHp);
        g.fillStyle = "rgba(0,0,0,0.6)";
        g.fillRect(-20 * u, s + 5, 40 * u, 4);
        g.fillStyle = m.kind === "hq" || m.kind === "escort" ? "#6fb6ff" : "#ff5a3c";
        g.fillRect(-20 * u, s + 5, 40 * u * f, 4);
      }
      g.restore();
    } else {
      const [ex, ey, ang] = toEdge(q.x, q.y, q.behind);
      arrow(g, ex, ey, ang, col, 11 * u);
      g.fillStyle = col;
      g.font = `600 ${10 * u}px Inter, system-ui, sans-serif`;
      g.textAlign = "center";
      g.fillText(`${Math.round(d)}m`, ex, ey + 22 * u);
    }
  }
  // spotted enemies: red chevrons with health bars
  for (const t of sim.tanks) {
    if (!t.alive || t.side === "player") continue;
    const enemy = t.side === "enemy";
    if (enemy && !t.spotted) continue;
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (!enemy && d > 140) continue;
    const q = world.project(t.x, t.y + t.L.top * t.scale + 2.3, t.z);
    if (q.behind || q.x < 0 || q.x > w || q.y < 0 || q.y > h) continue;
    const col = enemy ? (t.type === "dummy" ? "#ffb347" : "#ff4b3e") : "#6fdc8c";
    g.save();
    g.translate(q.x, q.y);
    const s = (t.boss ? 9 : 6) * u;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(-s, -s * 0.6);
    g.lineTo(0, s * 0.5);
    g.lineTo(s, -s * 0.6);
    g.lineTo(0, -s * 0.1);
    g.closePath();
    g.fill();
    if (enemy && (d < 160 || t.boss)) {
      const f = Math.max(0, t.hp / t.maxHp);
      const bw = (t.boss ? 46 : 28) * u;
      g.fillStyle = "rgba(0,0,0,0.6)";
      g.fillRect(-bw / 2, -s - 8, bw, 4);
      g.fillStyle = f > 0.5 ? "#ff6a4d" : f > 0.25 ? "#ff9f40" : "#ffd04d";
      g.fillRect(-bw / 2, -s - 8, bw * f, 4);
    }
    g.restore();
  }

  // ---------------- aim circle (camera centre) — skip in the sight, where the stadia do the job
  if (!gunner) {
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, 3 * u, 0, TAU);
    g.stroke();
  }

  // ---------------- gun reticle at the predicted impact
  const pr = o.pred;
  if (pr && p.alive) {
    const q = world.project(pr.x, pr.y, pr.z);
    if (!q.behind) {
      const onEnemy = pr.kind === "tank" && pr.ref && pr.ref.side === "enemy";
      const onStruct = pr.kind === "struct" && pr.ref && !pr.ref.friendly;
      const hot = onEnemy || onStruct;
      const col = hot ? "#ff5a3c" : "#e8f3e0";
      // dispersion radius on screen
      const fovR = ((o.fov || 60) * Math.PI) / 360;
      const rad = Math.max(7 * u, Math.min(120, (Math.tan(p.bloom) / Math.tan(fovR)) * (h / 2)));
      g.strokeStyle = col;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(q.x, q.y, rad, 0, TAU);
      g.stroke();
      // tick marks
      g.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        g.moveTo(q.x + dx * (rad + 2), q.y + dy * (rad + 2));
        g.lineTo(q.x + dx * (rad + 9 * u), q.y + dy * (rad + 9 * u));
      }
      g.stroke();
      g.fillStyle = col;
      g.beginPath();
      g.arc(q.x, q.y, 1.8 * u, 0, TAU);
      g.fill();
      // reload ring
      const rf = p.reloadMax ? 1 - p.reload / p.reloadMax : 1;
      g.strokeStyle = p.reload > 0 ? "rgba(255,255,255,0.25)" : AMMO_COL[p.loaded];
      g.lineWidth = 3;
      g.beginPath();
      g.arc(q.x, q.y, rad + 13 * u, -Math.PI / 2, -Math.PI / 2 + TAU * (p.reload > 0 ? rf : 1));
      g.stroke();
      // range + time of flight
      const dist = Math.hypot(pr.x - p.x, pr.y - p.y, pr.z - p.z);
      g.font = `600 ${11 * u}px ui-monospace, monospace`;
      g.textAlign = "left";
      g.fillStyle = "rgba(0,0,0,0.5)";
      const label = `${Math.round(dist)} m${p.reload > 0 ? `  ${p.reload.toFixed(1)}s` : ""}`;
      g.fillText(label, q.x + rad + 17 * u + 1, q.y + 4 * u + 1);
      g.fillStyle = p.reload > 0 ? "#cfd8dc" : AMMO_COL[p.loaded];
      g.fillText(label, q.x + rad + 17 * u, q.y + 4 * u);
      // a line from the aim point to the gun reticle while the turret catches up
      const dA = Math.hypot(q.x - cx, q.y - cy);
      if (dA > 26 && !gunner) {
        g.strokeStyle = "rgba(255,255,255,0.18)";
        g.setLineDash([4, 5]);
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(q.x, q.y);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }

  // ---------------- target info + Phantom X lead marker
  const tgt = o.target;
  if (tgt && tgt.alive !== false) {
    const name = tgt.name || "Target";
    const f = Math.max(0, tgt.hp / tgt.maxHp);
    const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
    const bw = 220 * u;
    const y = 74 * u;
    g.fillStyle = "rgba(10,14,16,0.65)";
    g.fillRect(cx - bw / 2 - 10, y - 18 * u, bw + 20, 40 * u);
    g.fillStyle = tgt.friendly || tgt.side === "ally" ? "#6fb6ff" : "#ff8a6a";
    g.font = `700 ${12 * u}px Inter, system-ui, sans-serif`;
    g.textAlign = "center";
    g.fillText(`${name.toUpperCase()}  ·  ${Math.round(d)} m`, cx, y - 2 * u);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(cx - bw / 2, y + 6 * u, bw, 7 * u);
    g.fillStyle = f > 0.5 ? "#ff5a3c" : f > 0.25 ? "#ff9f40" : "#ffd04d";
    g.fillRect(cx - bw / 2, y + 6 * u, bw * f, 7 * u);
    if (o.targeting && tgt.L && tgt.side === "enemy") {
      const v = AMMO[p.loaded].speed * (p.st.shellSpeed || 1);
      const tf = d / v;
      const lx = tgt.x + (tgt.vx || 0) * tf;
      const lz = tgt.z + (tgt.vz || 0) * tf;
      if (Math.hypot(tgt.vx || 0, tgt.vz || 0) > 1) {
        const q = world.project(lx, tgt.y + tgt.L.top * tgt.scale * 0.6, lz);
        if (!q.behind) {
          g.strokeStyle = "#40f0ff";
          g.lineWidth = 2;
          g.beginPath();
          const s = 7 * u;
          g.moveTo(q.x, q.y - s);
          g.lineTo(q.x + s, q.y);
          g.lineTo(q.x, q.y + s);
          g.lineTo(q.x - s, q.y);
          g.closePath();
          g.stroke();
          g.fillStyle = "#40f0ff";
          g.font = `600 ${10 * u}px ui-monospace, monospace`;
          g.fillText("LEAD", q.x, q.y - s - 4);
        }
      }
    }
  }

  // ---------------- damage direction arcs
  for (const hit of o.hits) {
    const age = o.time - hit.t;
    if (age > 1.6 || hit.ang == null) continue;
    const rel = wrapPi(hit.ang - o.cam.yaw);
    const a = -Math.PI / 2 - rel; // screen angle (left = positive heading)
    const R = Math.min(w, h) * 0.2;
    g.strokeStyle = `rgba(255,60,40,${(1 - age / 1.6) * 0.9})`;
    g.lineWidth = 7 * u;
    g.beginPath();
    g.arc(cx, cy, R, a - 0.28, a + 0.28);
    g.stroke();
  }
}

/** Minimap: player-centred, rotated so the camera's forward is up. */
export function drawMinimap(g, sim, bg, o) {
  const { size, dpr, yaw } = o;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);
  const r = size / 2;
  const range = 120; // metres from centre to edge
  const k = r / range;
  const p = sim.player;
  g.save();
  g.beginPath();
  g.arc(r, r, r - 1, 0, TAU);
  g.clip();
  g.fillStyle = "#14191c";
  g.fillRect(0, 0, size, size);
  // background: image coords X = (200 − x)/400·S, Y = (200 − z)/400·S
  const S = bg.width;
  const ipx = ((200 - p.x) / 400) * S;
  const ipz = ((200 - p.z) / 400) * S;
  const scale = (k * 400) / S;
  g.translate(r, r);
  g.rotate(yaw);
  g.scale(scale, scale);
  g.translate(-ipx, -ipz);
  g.globalAlpha = 0.95;
  g.drawImage(bg, 0, 0);
  g.globalAlpha = 1;
  g.restore();
  // world → minimap
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const M = (x, z) => {
    const u = -(x - p.x) * k;
    const v = -(z - p.z) * k;
    return [r + u * cs - v * sn, r + u * sn + v * cs];
  };
  g.save();
  g.beginPath();
  g.arc(r, r, r - 1, 0, TAU);
  g.clip();
  // boundary
  g.strokeStyle = "rgba(255,80,60,0.45)";
  g.lineWidth = 1.5;
  g.beginPath();
  for (const [x, z] of [[192, 192], [-192, 192], [-192, -192], [192, -192], [192, 192]]) {
    const [a, b] = M(x, z);
    g.lineTo(a, b);
  }
  g.stroke();
  // smoke clouds
  for (const c of sim.smokes) {
    const [a, b] = M(c.x, c.z);
    g.fillStyle = "rgba(220,220,215,0.35)";
    g.beginPath();
    g.arc(a, b, c.r * k, 0, TAU);
    g.fill();
  }
  // objectives
  for (const m of sim.markers()) {
    const [a, b] = M(m.x, m.z);
    const col = m.kind === "boss" ? "#ff5a3c" : m.kind === "hq" || m.kind === "escort" || m.defend ? "#6fb6ff" : "#ffd166";
    if (m.r) {
      g.strokeStyle = col;
      g.lineWidth = 1.5;
      g.setLineDash(m.kind === "search" ? [3, 3] : []);
      g.beginPath();
      g.arc(a, b, Math.max(4, m.r * k), 0, TAU);
      g.stroke();
      g.setLineDash([]);
    } else {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(a, b - 5);
      g.lineTo(a + 5, b);
      g.lineTo(a, b + 5);
      g.lineTo(a - 5, b);
      g.closePath();
      g.fill();
    }
  }
  // units
  for (const t of sim.tanks) {
    if (!t.alive || t === p || t.escaped) continue;
    if (t.side === "enemy" && !t.spotted) continue;
    const [a, b] = M(t.x, t.z);
    g.fillStyle = t.side === "enemy" ? (t.type === "dummy" ? "#ffb347" : "#ff4b3e") : "#6fdc8c";
    g.beginPath();
    g.arc(a, b, t.boss ? 4.5 : 3.2, 0, TAU);
    g.fill();
  }
  g.restore();
  // player arrow (hull heading) + turret line
  g.save();
  g.translate(r, r);
  const rel = -wrapPi(p.heading - yaw);
  g.rotate(rel);
  g.fillStyle = "#f2f5e8";
  g.beginPath();
  g.moveTo(0, -7);
  g.lineTo(5, 6);
  g.lineTo(0, 3);
  g.lineTo(-5, 6);
  g.closePath();
  g.fill();
  g.restore();
  g.strokeStyle = "rgba(242,245,232,0.6)";
  g.lineWidth = 1;
  g.beginPath();
  const ta = -wrapPi(p.heading + p.tLocal - yaw);
  g.moveTo(r, r);
  g.lineTo(r + Math.sin(ta) * 22, r - Math.cos(ta) * 22);
  g.stroke();
  // view cone
  g.fillStyle = "rgba(255,255,255,0.06)";
  g.beginPath();
  g.moveTo(r, r);
  g.arc(r, r, r, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
  g.closePath();
  g.fill();
  // north marker
  // north (+z) maps to image (0,−1), rotated by yaw → (sin yaw, −cos yaw)
  const nx = r + Math.sin(yaw) * (r - 9);
  const ny = r - Math.cos(yaw) * (r - 9);
  g.fillStyle = "#ffd166";
  g.font = "700 10px Inter, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("N", nx, ny);
  g.textBaseline = "alphabetic";
  // ring
  g.strokeStyle = "rgba(160,200,170,0.4)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(r, r, r - 1, 0, TAU);
  g.stroke();
}
