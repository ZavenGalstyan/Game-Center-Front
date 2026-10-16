/**
 * School Life Simulator 3D — 2D map drawing (full school map + HUD minimap).
 * North (+z) is up. Reads the shared layout and live Sim state.
 */
import { ROOMS, OUTDOOR, ROOM_THEME, F1, BOUNDS, zoneAt } from "./layout.js";
import { getLayout } from "./sim.js";

const OUT_COL = {
  court: "#d9774f",
  field: "#6fb54f",
  track: "#c4664c",
  garden: "#8ccf6a",
  courtyard: "#e7dcc6",
  gate: "#d9cfbd",
};
const FLOOR_OF = (y) => (y > F1 * 0.5 + 0.2 ? 1 : 0);

function roomLabel(r) {
  return r.short.replace("Room ", "").replace(" · ", " ");
}

/**
 * opts: { sim, w, h, scale (dpr), floor (0|1), view: 'full'|'mini', t, highlight (room id) }
 */
export function drawMap(ctx, o) {
  const { sim, w, h, scale = 1, view = "full", t = 0 } = o;
  const campus = o.floor === "campus";
  const floor = campus ? 0 : o.floor || 0;
  const L = getLayout();
  const p = sim ? sim.player : { x: 0, z: -40, y: 0, yaw: 0 };
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // world → canvas
  let s;
  let cx;
  let cz;
  if (view === "mini") {
    s = Math.min(w, h) / 46;
    cx = p.x;
    cz = p.z;
  } else if (floor === 1) {
    s = Math.min(w / 86, h / 34);
    cx = 0;
    cz = 0;
  } else if (!campus) {
    s = Math.min(w / 114, h / 36);
    cx = 14;
    cz = 0;
  } else {
    s = Math.min(w / (BOUNDS.x2 - BOUNDS.x1 + 4), h / (BOUNDS.z2 - BOUNDS.z1 + 4));
    cx = (BOUNDS.x1 + BOUNDS.x2) / 2;
    cz = (BOUNDS.z1 + BOUNDS.z2) / 2;
  }
  const X = (x) => w / 2 + (x - cx) * s;
  const Y = (z) => h / 2 - (z - cz) * s;
  const rect = (x0, x1, z0, z1) => [X(x0), Y(z1), (x1 - x0) * s, (z1 - z0) * s];

  if (view === "mini") {
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
  }
  // background
  ctx.fillStyle = floor === 1 && view === "full" ? "#1d2533" : !campus && view === "full" ? "#5e7f4a" : "#8fc46e";
  ctx.fillRect(0, 0, w, h);
  if (floor === 0 || view === "mini") {
    if (FLOOR_OF(p.y) === 0 || view === "full") {
      // paths & outdoor zones
      ctx.fillStyle = "#e3d9c6";
      for (const v of L.vis) {
        if (v.m === "paving" && v.k === "box") ctx.fillRect(...rect(v.x - v.sx / 2, v.x + v.sx / 2, v.z - v.sz / 2, v.z + v.sz / 2));
      }
      for (const z of OUTDOOR) {
        const c = OUT_COL[z.id];
        if (!c || z.id === "courtyard" || z.id === "gate") continue;
        ctx.fillStyle = c;
        if (z.id === "track") {
          ctx.strokeStyle = c;
          ctx.lineWidth = 6 * s;
          ctx.beginPath();
          ctx.arc(X(30), Y(78), 23 * s, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(X(-30), Y(78 - 23));
          ctx.arc(X(-30), Y(78), 23 * s, Math.PI / 2, (Math.PI * 3) / 2);
          ctx.closePath();
          ctx.stroke();
          continue;
        }
        if (z.id === "court") ctx.fillRect(...rect(5, 35, 18, 35));
        else if (z.id === "field") ctx.fillRect(...rect(-30, 30, 60, 96));
        else ctx.fillRect(...rect(z.x0 + 1, z.x1 - 1, z.z0 + 1, z.z1 - 1));
      }
      // fountain
      ctx.fillStyle = "#6cc3ef";
      ctx.beginPath();
      ctx.arc(X(-6), Y(27), 3 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // building footprints
  ctx.fillStyle = "#3b4352";
  ctx.fillRect(...rect(-40.3, 40.3, -14.3, 14.3));
  ctx.fillRect(...rect(42, 68, -13, 13));
  ctx.fillRect(...rect(40, 42, -2, 2));
  // rooms on the shown floor
  const fl = view === "mini" ? FLOOR_OF(p.y) : floor;
  for (const r of ROOMS) {
    const on = r.both || r.f === fl || (r.tall && fl === 1);
    if (!on) continue;
    if (fl === 1 && (r.id === "gym" || r.id === "gympass")) continue;
    const th = ROOM_THEME[r.id];
    const hall = r.id.startsWith("hall") || r.id === "gympass";
    ctx.fillStyle = hall ? "#e9e3d6" : th ? th.wall : "#e9e3d6";
    if (r.tall && fl === 1) ctx.globalAlpha = 0.45;
    ctx.fillRect(...rect(r.x0 + 0.15, r.x1 - 0.15, r.z0 + 0.15, r.z1 - 0.15));
    ctx.globalAlpha = 1;
    if (th && !hall) {
      ctx.fillStyle = th.band;
      ctx.fillRect(...rect(r.x0 + 0.15, r.x1 - 0.15, r.z0 + 0.15, r.z0 + 0.15 + Math.min(1.2, (r.z1 - r.z0) * 0.12)));
    }
    if (o.highlight === r.id) {
      ctx.strokeStyle = `rgba(255,210,63,${0.6 + Math.sin(t * 5) * 0.4})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(...rect(r.x0 + 0.3, r.x1 - 0.3, r.z0 + 0.3, r.z1 - 0.3));
    }
  }
  // doors
  ctx.fillStyle = "#c08a52";
  for (const d of L.doors) {
    if (FLOOR_OF(d.y + 0.1) !== fl) continue;
    if (d.axis === "x") ctx.fillRect(...rect(d.x - d.w / 2, d.x + d.w / 2, d.z - 0.25, d.z + 0.25));
    else ctx.fillRect(...rect(d.x - 0.25, d.x + 0.25, d.z - d.w / 2, d.z + d.w / 2));
  }
  // stairs
  ctx.fillStyle = "#9aa3b2";
  for (const x of [-22, 16]) {
    for (let k = 0; k < 7; k++) ctx.fillRect(...rect(x + 0.3, x + 5.7, 4 + k * 1.0, 4 + k * 1.0 + 0.45));
  }
  // labels
  if (view === "full") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const r of ROOMS) {
      const on = r.both || r.f === fl;
      if (!on || r.id.startsWith("hall") || r.id === "gympass") continue;
      if (fl === 1 && r.id === "gym") continue;
      const fs = Math.max(8, Math.min(14, s * 1.1));
      ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "#1f2937";
      const txt = roomLabel(r);
      const mx = X((r.x0 + r.x1) / 2);
      const my = Y((r.z0 + r.z1) / 2);
      if ((r.x1 - r.x0) * s > ctx.measureText(txt).width * 0.6) ctx.fillText(txt, mx, my);
    }
    if (campus) {
      ctx.fillStyle = "#14321a";
      ctx.font = `800 ${Math.max(9, s * 2.4)}px Inter, system-ui, sans-serif`;
      for (const [txt, x, z] of [["Basketball Court", 20, 26.5], ["Football Field", 0, 78], ["Garden", -30, 36], ["Courtyard", -6, 33], ["Main Gate", 0, -42], ["Front Yard", -26, -26]]) ctx.fillText(txt, X(x), Y(z));
      ctx.fillStyle = "#ffffff";
      ctx.fillText("Gym", X(55), Y(0));
    }
  }
  // people
  if (sim) {
    for (const n of sim.npcs) {
      if (n.hidden || FLOOR_OF(n.y) !== fl) continue;
      const friend = n.type === "student" && sim.save.friends[n.id] >= 50;
      ctx.fillStyle = n.type === "teacher" ? "#ff9f1c" : friend ? "#4dff88" : n.type === "staff" ? "#c9a7ff" : "#ffffff";
      ctx.beginPath();
      ctx.arc(X(n.x), Y(n.z), view === "mini" ? 3.2 : Math.max(2.2, s * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
    // markers
    for (const m of sim.markers()) {
      if (FLOOR_OF(m.y || 0) !== fl && view === "full") continue;
      const mx = X(m.x);
      const my = Y(m.z);
      if (m.kind === "objective") {
        const r = 7 + Math.sin(t * 4) * 1.5;
        ctx.fillStyle = "#ffd23f";
        ctx.strokeStyle = "#5a3d00";
        ctx.lineWidth = 1.5;
        star(ctx, mx, my, r);
      } else if (m.kind === "notebook") {
        ctx.fillStyle = "#e0457b";
        ctx.fillRect(mx - 4, my - 5, 8, 10);
      } else if (view === "full") {
        ctx.fillStyle = "rgba(255,210,63,0.75)";
        ctx.beginPath();
        ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // player arrow
    if (FLOOR_OF(p.y) === fl || view === "mini") {
      const px = X(p.x);
      const py = Y(p.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.yaw);
      ctx.fillStyle = "#ff4d6d";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const k = view === "mini" ? 1 : 1.2;
      ctx.moveTo(0, -9 * k);
      ctx.lineTo(6 * k, 7 * k);
      ctx.lineTo(0, 3 * k);
      ctx.lineTo(-6 * k, 7 * k);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // objective pointer on the minimap edge
    if (view === "mini") {
      const ob = sim.objective();
      if (ob && ob.target) {
        const dx = ob.target.x - p.x;
        const dz = ob.target.z - p.z;
        const R = Math.min(w, h) / 2 - 9;
        if (Math.hypot(dx, dz) * s > R) {
          const a = Math.atan2(dx, dz);
          ctx.fillStyle = "#ffd23f";
          ctx.strokeStyle = "#5a3d00";
          star(ctx, w / 2 + Math.sin(a) * R, h / 2 - Math.cos(a) * R, 6);
        }
      }
    }
  }
  if (view === "mini") {
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", w / 2, 11);
  }
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
export { zoneAt };
