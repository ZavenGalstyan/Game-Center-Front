/**
 * Map rendering (2D canvas): a hill-shaded, biome-coloured base image of
 * the whole realm built once from the heightfield, then the rotating
 * minimap and the full world map draw markers on top of it.
 */
import { getWorld } from "../engine/world.js";
import { LOCATIONS, REGIONS } from "../data/worldmap.js";
import { questMarkers } from "../engine/game.js";

let BASE = null;

export function baseMap() {
  if (BASE) return BASE;
  const W = getWorld();
  const T = W.T;
  const N = T.N - 1; // 512 px, 2 m each
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  const img = g.createImageData(N, N);
  const M = T.masks;
  const mix = (a, b, t) => a + (b - a) * t;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = j * T.N + i;
      const h = T.H[k];
      const hx = T.H[k + 1] - T.H[k];
      const hz = T.H[k + T.N] - T.H[k];
      const shade = Math.max(0.35, Math.min(1.3, 1 - (hx * 0.7 + hz * 0.5) * 0.35));
      const slope = Math.hypot(hx, hz) / 2;
      let r = 92;
      let gg = 112;
      let b = 60;
      const f = M.forest[k] / 255;
      r = mix(r, 58, f);
      gg = mix(gg, 84, f);
      b = mix(b, 48, f);
      const fl = M.field[k] / 255;
      r = mix(r, 150, fl * 0.7);
      gg = mix(gg, 128, fl * 0.7);
      b = mix(b, 76, fl * 0.7);
      const rock = Math.min(1, Math.max(0, (slope - 0.35) * 3));
      r = mix(r, 112, rock);
      gg = mix(gg, 106, rock);
      b = mix(b, 98, rock);
      const sn = M.snow[k] / 255;
      r = mix(r, 222, sn * (1 - rock * 0.5));
      gg = mix(gg, 226, sn * (1 - rock * 0.5));
      b = mix(b, 232, sn * (1 - rock * 0.5));
      const ash = M.ash[k] / 255;
      r = mix(r, 78, ash);
      gg = mix(gg, 66, ash);
      b = mix(b, 60, ash);
      const rd = M.road[k] / 255;
      r = mix(r, 168, rd * 0.85);
      gg = mix(gg, 142, rd * 0.85);
      b = mix(b, 100, rd * 0.85);
      // height tint: highlands lighter
      const hk = Math.min(1, Math.max(0, (h - 20) / 120));
      r *= shade * (1 + hk * 0.15);
      gg *= shade * (1 + hk * 0.15);
      b *= shade * (1 + hk * 0.18);
      if (T.water[k] > h) {
        const depth = Math.min(1, (T.water[k] - h) / 2);
        r = mix(70, 40, depth);
        gg = mix(110, 80, depth);
        b = mix(130, 120, depth);
      }
      const o = (j * N + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // structures
  const S = (x) => (x + T.half) / T.cell;
  g.fillStyle = "rgba(40,30,24,0.85)";
  g.strokeStyle = "rgba(40,30,24,0.85)";
  for (const e of W.layout) {
    if (["house", "hall", "chapel", "cabin", "keep", "smithy", "stable", "tent", "ruinKeep", "cryptHut"].includes(e.kind)) {
      g.save();
      g.translate(S(e.x), S(e.z));
      g.rotate(-e.rot);
      const w = (e.w || 5) / T.cell;
      const d = (e.d || 5) / T.cell;
      g.fillRect(-w / 2, -d / 2, w, d);
      g.restore();
    } else if (e.kind === "wall" || e.kind === "palisade") {
      g.save();
      g.translate(S(e.x), S(e.z));
      g.rotate(-e.rot);
      g.fillRect(-e.len / 2 / T.cell, -0.8, e.len / T.cell, 1.6);
      g.restore();
    } else if (e.kind === "tower") {
      g.beginPath();
      g.arc(S(e.x), S(e.z), e.r / T.cell, 0, Math.PI * 2);
      g.fill();
    } else if (e.kind === "bridge") {
      g.save();
      g.translate(S(e.x), S(e.z));
      g.rotate(-e.rot);
      g.fillStyle = "rgba(150,130,100,0.95)";
      g.fillRect(-e.w / 2 / T.cell, -e.len / 2 / T.cell, e.w / T.cell, e.len / T.cell);
      g.restore();
      g.fillStyle = "rgba(40,30,24,0.85)";
    }
  }
  BASE = { canvas: c, N, half: T.half, cell: T.cell };
  return BASE;
}

const ICON_GLYPH = { village: "⌂", inn: "☗", camp: "▲", "camp-hostile": "✕", den: "✕", tower: "♜", lake: "≈", castle: "♜", mine: "⛏", stones: "◎", ruins: "☗", secret: "✦", path: "⋯", dragon: "☬", pavilion: "⛺", mill: "✣", bridge: "═" };

function drawMarkers(g, G, toPx, scale, opts) {
  const P = G.P;
  // discovered locations
  for (const L of LOCATIONS) {
    if (!P.discovered[L.id]) continue;
    const [x, y] = toPx(L.x, L.z);
    g.fillStyle = L.safe ? "#ffd27a" : "#f2e6c8";
    g.strokeStyle = "rgba(20,14,10,0.9)";
    g.lineWidth = 3;
    g.font = `${Math.round(13 * (opts.font || 1))}px Georgia, serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const glyph = ICON_GLYPH[L.icon] || "•";
    g.strokeText(glyph, x, y);
    g.fillText(glyph, x, y);
    if (opts.labels) {
      g.font = `${Math.round(11 * (opts.font || 1))}px Georgia, serif`;
      g.strokeText(L.name, x, y + 14 * (opts.font || 1));
      g.fillText(L.name, x, y + 14 * (opts.font || 1));
    }
  }
  // quest objectives
  for (const m of questMarkers(G)) {
    const [x, y] = toPx(m.x, m.z);
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI / 4);
    g.fillStyle = m.tracked ? "#ffcf3a" : "rgba(255,207,58,0.55)";
    g.strokeStyle = "#2a1a08";
    g.lineWidth = 2;
    const s = (m.tracked ? 7 : 5) * (opts.font || 1);
    g.fillRect(-s / 2, -s / 2, s, s);
    g.strokeRect(-s / 2, -s / 2, s, s);
    g.restore();
  }
  // companion + player
  for (const a of G.allies) {
    if (!a.companion || a.interior) continue;
    const [x, y] = toPx(a.x, a.z);
    g.fillStyle = "#7fd06a";
    g.beginPath();
    g.arc(x, y, 3.5 * (opts.font || 1), 0, Math.PI * 2);
    g.fill();
  }
  void scale;
}

/** Rotating minimap centred on the player (radius in metres). */
export function drawMinimap(cv, G, radius = 85) {
  if (!cv || !G) return;
  const B = baseMap();
  const g = cv.getContext("2d");
  const S = cv.width;
  const p = G.player;
  g.save();
  g.clearRect(0, 0, S, S);
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  g.clip();
  if (p.interior) {
    g.fillStyle = "#1a1612";
    g.fillRect(0, 0, S, S);
    const I = G.W.interiors[p.interior];
    const k = (S / 2 / 30) * 1.0;
    g.translate(S / 2, S / 2);
    g.rotate(G.camYaw + Math.PI);
    g.fillStyle = "#4a4036";
    for (let r = 0; r < I.rows; r++)
      for (let c = 0; c < I.cols; c++) {
        if (I.map[r][c] === "#") continue;
        const pos = I.at(c, r);
        g.fillRect((pos.x - p.x - 1.5) * k, (pos.z - p.z - 1.5) * k, 3 * k + 0.5, 3 * k + 0.5);
      }
    g.restore();
  } else {
    const ppm = S / 2 / radius; // pixels per metre
    g.translate(S / 2, S / 2);
    g.rotate(G.camYaw + Math.PI);
    const px = (p.x + B.half) / B.cell;
    const pz = (p.z + B.half) / B.cell;
    const k = ppm * B.cell;
    g.drawImage(B.canvas, -px * k, -pz * k, B.N * k, B.N * k);
    // markers in world space
    const toPx = (x, z) => [(x - p.x) * ppm, (z - p.z) * ppm];
    // enemies that hunt you
    for (const e of G.enemies) {
      if (e.dead || e.interior) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > radius * 1.2 || (!e.target && d > 30)) continue;
      const [x, y] = toPx(e.x, e.z);
      g.fillStyle = e.target ? "#ff4a3a" : "rgba(255,120,90,0.6)";
      g.beginPath();
      g.arc(x, y, e.boss ? 5 : 3, 0, Math.PI * 2);
      g.fill();
    }
    for (const n of G.npcs) {
      if (n.interior || !n.npc) continue;
      const [x, y] = toPx(n.x, n.z);
      if (Math.abs(x) > S || Math.abs(y) > S) continue;
      g.fillStyle = "#cfe6ff";
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.save();
    drawMarkers(g, G, toPx, ppm, { labels: false, font: 1 });
    g.restore();
    g.restore();
  }
  // player arrow (always up = camera forward)
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(-(p.yaw - G.camYaw));
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#1a1208";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -8);
  g.lineTo(5.5, 6);
  g.lineTo(0, 3);
  g.lineTo(-5.5, 6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  // north tick
  const na = G.camYaw + Math.PI;
  g.save();
  g.translate(S / 2 + Math.sin(-na) * (S / 2 - 10) * -1, S / 2 - Math.cos(na) * (S / 2 - 10));
  g.fillStyle = "#ffd27a";
  g.font = "bold 12px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("N", 0, 0);
  g.restore();
}

/** Full world map. view: {zoom, cx, cz} in world metres. */
export function drawWorldMap(cv, G, view) {
  if (!cv || !G) return;
  const B = baseMap();
  const g = cv.getContext("2d");
  const Wc = cv.width;
  const Hc = cv.height;
  g.fillStyle = "#2a2018";
  g.fillRect(0, 0, Wc, Hc);
  const ppm = (Math.min(Wc, Hc) / (B.half * 2)) * view.zoom;
  const toPx = (x, z) => [Wc / 2 + (x - view.cx) * ppm, Hc / 2 + (z - view.cz) * ppm];
  const [ox, oy] = toPx(-B.half, -B.half);
  g.imageSmoothingEnabled = true;
  g.drawImage(B.canvas, ox, oy, B.N * B.cell * ppm, B.N * B.cell * ppm);
  // parchment wash
  g.fillStyle = "rgba(200,170,110,0.16)";
  g.fillRect(0, 0, Wc, Hc);
  // region names
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const R of REGIONS) {
    const [x, y] = toPx(R.x, R.z);
    g.font = `italic ${Math.round(15 + view.zoom * 2)}px Georgia, serif`;
    g.fillStyle = "rgba(40,28,16,0.55)";
    g.fillText(R.name.toUpperCase(), x, y - 24);
  }
  drawMarkers(g, G, toPx, ppm, { labels: true, font: Math.min(1.6, 0.9 + view.zoom * 0.25) });
  // player
  const p = G.player;
  const pos = p.interior ? (p.interior === "crypt" ? G.W.byId.get("cryptdoor") : G.W.byId.get("grate")) : p;
  const [x, y] = toPx(pos.x, pos.z);
  g.save();
  g.translate(x, y);
  g.rotate(-p.yaw + Math.PI);
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#1a1208";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(7, 8);
  g.lineTo(0, 4);
  g.lineTo(-7, 8);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  return { toPx, ppm };
}
