/**
 * Original playing-card artwork, drawn once per card into canvases:
 *  - vector suit pips (no font glyphs), standard pip layouts, ornate aces
 *  - court cards: a double-ended engraved-style portrait (crown / tiara /
 *    feathered cap, robes in the classic red-blue-gold palette)
 *  - large serif indices for readability at table distance
 *  - ivory card stock with fibres and faint edge wear
 *  - one consistent back: oxblood lattice with a horseshoe-and-star medallion
 * The same canvases feed the 3D cards (textures) and the HTML card overlay.
 */
import * as THREE from "three";

export const CARD_W = 0.0635; // poker size, metres
export const CARD_H = 0.0889;
const RED = "#b0141c";
const BLACK = "#16130f";
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const rankOf = (c) => (c >> 2) + 2;
const suitOf = (c) => c & 3; // 0 clubs, 1 diamonds, 2 hearts, 3 spades
export const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;

/* ------------------------------------------------------------ suit paths (unit box, centred) */
export function suitPath(g, suit, x, y, s) {
  g.beginPath();
  const P = (px, py) => [x + px * s, y + py * s];
  switch (suit) {
    case 2: { // heart
      g.moveTo(...P(0, 0.42));
      g.bezierCurveTo(...P(-0.08, 0.3), ...P(-0.5, 0.05), ...P(-0.5, -0.17));
      g.bezierCurveTo(...P(-0.5, -0.44), ...P(-0.14, -0.52), ...P(0, -0.27));
      g.bezierCurveTo(...P(0.14, -0.52), ...P(0.5, -0.44), ...P(0.5, -0.17));
      g.bezierCurveTo(...P(0.5, 0.05), ...P(0.08, 0.3), ...P(0, 0.42));
      break;
    }
    case 1: { // diamond
      g.moveTo(...P(0, -0.5));
      g.quadraticCurveTo(...P(0.16, -0.2), ...P(0.38, 0));
      g.quadraticCurveTo(...P(0.16, 0.2), ...P(0, 0.5));
      g.quadraticCurveTo(...P(-0.16, 0.2), ...P(-0.38, 0));
      g.quadraticCurveTo(...P(-0.16, -0.2), ...P(0, -0.5));
      break;
    }
    case 3: { // spade
      g.moveTo(...P(0, -0.48));
      g.bezierCurveTo(...P(0.1, -0.32), ...P(0.5, -0.12), ...P(0.5, 0.1));
      g.bezierCurveTo(...P(0.5, 0.33), ...P(0.22, 0.4), ...P(0.05, 0.24));
      g.quadraticCurveTo(...P(0.08, 0.4), ...P(0.2, 0.5));
      g.lineTo(...P(-0.2, 0.5));
      g.quadraticCurveTo(...P(-0.08, 0.4), ...P(-0.05, 0.24));
      g.bezierCurveTo(...P(-0.22, 0.4), ...P(-0.5, 0.33), ...P(-0.5, 0.1));
      g.bezierCurveTo(...P(-0.5, -0.12), ...P(-0.1, -0.32), ...P(0, -0.48));
      break;
    }
    default: { // club
      const r = 0.2;
      g.moveTo(...P(r, -0.24));
      g.arc(...P(0, -0.24), r * s, 0, Math.PI * 2);
      g.moveTo(...P(-0.04 + r, 0.08));
      g.arc(...P(-0.24, 0.08), r * s, 0, Math.PI * 2);
      g.moveTo(...P(0.24 + r, 0.08));
      g.arc(...P(0.24, 0.08), r * s, 0, Math.PI * 2);
      g.moveTo(...P(-0.07, 0.0));
      g.lineTo(...P(0.07, 0.0));
      g.quadraticCurveTo(...P(0.06, 0.38), ...P(0.2, 0.5));
      g.lineTo(...P(-0.2, 0.5));
      g.quadraticCurveTo(...P(-0.06, 0.38), ...P(-0.07, 0.0));
      break;
    }
  }
  g.closePath();
}
export function pip(g, suit, x, y, s, flip = false, color = null) {
  g.save();
  if (flip) {
    g.translate(x, y);
    g.rotate(Math.PI);
    g.translate(-x, -y);
  }
  suitPath(g, suit, x, y, s);
  g.fillStyle = color || (suit === 1 || suit === 2 ? RED : BLACK);
  g.fill();
  g.restore();
}

/* ------------------------------------------------------------ paper */
function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
function paper(g, W, H, seed) {
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, "#f7f2e6");
  grd.addColorStop(1, "#efe7d4");
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // fibres
  g.globalAlpha = 0.05;
  for (let i = 0; i < 260; i++) {
    const x = hash(seed + i) * W, y = hash(seed + i * 1.7) * H, l = 4 + hash(seed - i) * 14, a = hash(i * 3.1) * Math.PI;
    g.strokeStyle = hash(i + seed * 2) > 0.5 ? "#7a6a50" : "#ffffff";
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.globalAlpha = 1;
  // handled edges: faint grime toward the border
  const e = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  e.addColorStop(0, "rgba(90,70,40,0)");
  e.addColorStop(1, "rgba(90,70,40,0.16)");
  g.fillStyle = e;
  g.fillRect(0, 0, W, H);
  // a few scuffs
  g.globalAlpha = 0.07;
  g.strokeStyle = "#5a4a32";
  for (let i = 0; i < 5; i++) {
    const x = hash(seed * 3 + i) * W, y = hash(seed * 5 + i) * H;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 12, y + 4 * hash(i), x + 20 + 30 * hash(seed + i), y + 6);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/* ------------------------------------------------------------ layouts */
const PIPS = {
  2: [[0.5, 0.2], [0.5, 0.8, 1]],
  3: [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8, 1]],
  4: [[0.28, 0.2], [0.72, 0.2], [0.28, 0.8, 1], [0.72, 0.8, 1]],
  5: [[0.28, 0.2], [0.72, 0.2], [0.5, 0.5], [0.28, 0.8, 1], [0.72, 0.8, 1]],
  6: [[0.28, 0.2], [0.72, 0.2], [0.28, 0.5], [0.72, 0.5], [0.28, 0.8, 1], [0.72, 0.8, 1]],
  7: [[0.28, 0.2], [0.72, 0.2], [0.5, 0.35], [0.28, 0.5], [0.72, 0.5], [0.28, 0.8, 1], [0.72, 0.8, 1]],
  8: [[0.28, 0.2], [0.72, 0.2], [0.5, 0.35], [0.28, 0.5], [0.72, 0.5], [0.5, 0.65, 1], [0.28, 0.8, 1], [0.72, 0.8, 1]],
  9: [[0.28, 0.2], [0.72, 0.2], [0.28, 0.4], [0.72, 0.4], [0.5, 0.5], [0.28, 0.6, 1], [0.72, 0.6, 1], [0.28, 0.8, 1], [0.72, 0.8, 1]],
  10: [[0.28, 0.2], [0.72, 0.2], [0.5, 0.3], [0.28, 0.4], [0.72, 0.4], [0.28, 0.6, 1], [0.72, 0.6, 1], [0.5, 0.7, 1], [0.28, 0.8, 1], [0.72, 0.8, 1]],
};

function index(g, W, H, rank, suit) {
  const col = suit === 1 || suit === 2 ? RED : BLACK;
  const label = RANKS[rank - 2];
  const fs = W * (label === "10" ? 0.2 : 0.23);
  const draw = () => {
    g.fillStyle = col;
    g.font = `700 ${fs}px Georgia, "Times New Roman", "DejaVu Serif", serif`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    const cx = W * 0.125;
    if (label === "10") {
      g.save();
      g.translate(cx, H * 0.16);
      g.scale(0.78, 1);
      g.fillText(label, 0, 0);
      g.restore();
    } else g.fillText(label, cx, H * 0.16);
    pip(g, suit, cx, H * 0.225, W * 0.13);
  };
  draw();
  g.save();
  g.translate(W, H);
  g.rotate(Math.PI);
  draw();
  g.restore();
}

/* ------------------------------------------------------------ court figures */
const ROBE = {
  13: ["#b3262a", "#23407a", "#d4a72c"],
  12: ["#23407a", "#b3262a", "#d4a72c"],
  11: ["#d4a72c", "#b3262a", "#23407a"],
};
function courtHalf(g, w, h, rank, suit) {
  // drawn in the top half (0..w, 0..h) with the figure's waist at the bottom edge
  const [c1, c2, c3] = ROBE[rank];
  const skin = "#f1d6b4";
  const ink = "#1a1612";
  g.lineJoin = "round";
  g.lineCap = "round";
  // shoulders / robe
  g.beginPath();
  g.moveTo(w * 0.06, h);
  g.quadraticCurveTo(w * 0.08, h * 0.6, w * 0.3, h * 0.52);
  g.lineTo(w * 0.7, h * 0.52);
  g.quadraticCurveTo(w * 0.92, h * 0.6, w * 0.94, h);
  g.closePath();
  g.fillStyle = c1;
  g.fill();
  // robe panels
  g.save();
  g.clip();
  g.fillStyle = c2;
  g.fillRect(w * 0.42, h * 0.5, w * 0.16, h * 0.5);
  for (let i = 0; i < 7; i++) {
    g.fillStyle = i % 2 ? c3 : ink;
    g.globalAlpha = i % 2 ? 0.9 : 0.25;
    g.fillRect(w * (0.08 + i * 0.05), h * 0.72, w * 0.025, h * 0.3);
  }
  g.globalAlpha = 1;
  // ermine trim
  g.fillStyle = "#f4efe2";
  g.fillRect(0, h * 0.86, w, h * 0.06);
  g.fillStyle = ink;
  for (let i = 0; i < 9; i++) g.fillRect(w * (0.08 + i * 0.1), h * 0.875, w * 0.014, h * 0.03);
  g.restore();
  g.strokeStyle = ink;
  g.lineWidth = w * 0.012;
  g.stroke();
  // collar
  g.beginPath();
  for (let i = 0; i <= 8; i++) {
    const x = w * (0.3 + (i * 0.4) / 8);
    g.lineTo(x, h * (i % 2 ? 0.62 : 0.54));
  }
  g.lineTo(w * 0.7, h * 0.52);
  g.lineTo(w * 0.3, h * 0.52);
  g.closePath();
  g.fillStyle = c3;
  g.fill();
  g.stroke();
  // neck + head
  g.fillStyle = skin;
  g.fillRect(w * 0.44, h * 0.42, w * 0.12, h * 0.12);
  g.beginPath();
  g.ellipse(w * 0.5, h * 0.33, w * 0.14, h * 0.15, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // hair
  g.fillStyle = rank === 12 ? "#d9a441" : rank === 13 ? "#7a5a30" : "#5a3a1e";
  g.beginPath();
  g.ellipse(w * 0.37, h * 0.37, w * 0.045, h * 0.12, 0.15, 0, Math.PI * 2);
  g.ellipse(w * 0.63, h * 0.37, w * 0.045, h * 0.12, -0.15, 0, Math.PI * 2);
  g.fill();
  // face
  g.lineWidth = w * 0.008;
  g.beginPath();
  g.moveTo(w * 0.44, h * 0.3);
  g.lineTo(w * 0.47, h * 0.3);
  g.moveTo(w * 0.53, h * 0.3);
  g.lineTo(w * 0.56, h * 0.3);
  g.moveTo(w * 0.5, h * 0.31);
  g.quadraticCurveTo(w * 0.52, h * 0.36, w * 0.49, h * 0.37);
  g.moveTo(w * 0.47, h * 0.41);
  g.quadraticCurveTo(w * 0.5, h * 0.42, w * 0.53, h * 0.41);
  g.stroke();
  if (rank === 13) {
    // king: beard + moustache
    g.fillStyle = "#7a5a30";
    g.beginPath();
    g.moveTo(w * 0.4, h * 0.36);
    g.quadraticCurveTo(w * 0.42, h * 0.52, w * 0.5, h * 0.54);
    g.quadraticCurveTo(w * 0.58, h * 0.52, w * 0.6, h * 0.36);
    g.quadraticCurveTo(w * 0.5, h * 0.45, w * 0.4, h * 0.36);
    g.fill();
    g.stroke();
  }
  // headwear
  g.lineWidth = w * 0.01;
  if (rank === 13) {
    g.beginPath();
    g.moveTo(w * 0.35, h * 0.22);
    for (let i = 0; i <= 4; i++) {
      g.lineTo(w * (0.35 + i * 0.075), h * (i % 2 ? 0.12 : 0.04));
      if (i < 4) g.lineTo(w * (0.35 + i * 0.075 + 0.0375), h * 0.13);
    }
    g.lineTo(w * 0.65, h * 0.22);
    g.closePath();
    g.fillStyle = "#d4a72c";
    g.fill();
    g.stroke();
    g.fillStyle = c1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(w * (0.42 + i * 0.08), h * 0.18, w * 0.017, 0, Math.PI * 2);
      g.fill();
    }
  } else if (rank === 12) {
    g.beginPath();
    g.moveTo(w * 0.36, h * 0.22);
    g.quadraticCurveTo(w * 0.5, h * 0.05, w * 0.64, h * 0.22);
    g.closePath();
    g.fillStyle = "#d4a72c";
    g.fill();
    g.stroke();
    g.fillStyle = c2;
    g.beginPath();
    g.arc(w * 0.5, h * 0.14, w * 0.025, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // veil
    g.strokeStyle = "rgba(26,22,18,0.6)";
    g.beginPath();
    g.moveTo(w * 0.36, h * 0.22);
    g.quadraticCurveTo(w * 0.28, h * 0.4, w * 0.3, h * 0.52);
    g.moveTo(w * 0.64, h * 0.22);
    g.quadraticCurveTo(w * 0.72, h * 0.4, w * 0.7, h * 0.52);
    g.stroke();
    g.strokeStyle = ink;
  } else {
    // jack: cap with a feather
    g.beginPath();
    g.moveTo(w * 0.34, h * 0.24);
    g.quadraticCurveTo(w * 0.5, h * 0.06, w * 0.68, h * 0.22);
    g.lineTo(w * 0.34, h * 0.24);
    g.fillStyle = c2;
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(w * 0.62, h * 0.16);
    g.quadraticCurveTo(w * 0.8, h * 0.0, w * 0.86, h * 0.12);
    g.quadraticCurveTo(w * 0.78, h * 0.1, w * 0.64, h * 0.2);
    g.fillStyle = "#f4efe2";
    g.fill();
    g.stroke();
  }
  // held item
  g.lineWidth = w * 0.022;
  g.strokeStyle = "#d4a72c";
  g.beginPath();
  if (rank === 13) {
    g.moveTo(w * 0.8, h * 0.98);
    g.lineTo(w * 0.86, h * 0.28);
  } else if (rank === 12) {
    g.moveTo(w * 0.22, h * 0.98);
    g.lineTo(w * 0.2, h * 0.5);
  } else {
    g.moveTo(w * 0.16, h * 0.98);
    g.lineTo(w * 0.12, h * 0.2);
  }
  g.stroke();
  g.lineWidth = w * 0.01;
  g.strokeStyle = ink;
  if (rank === 13) pip(g, suit, w * 0.86, h * 0.24, w * 0.12);
  else if (rank === 12) {
    g.fillStyle = "#b3262a";
    g.beginPath();
    g.arc(w * 0.2, h * 0.46, w * 0.04, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(w * 0.12, h * 0.12);
    g.lineTo(w * 0.07, h * 0.24);
    g.lineTo(w * 0.17, h * 0.24);
    g.closePath();
    g.fillStyle = "#c9c4b8";
    g.fill();
    g.stroke();
  }
  // suit badge on the chest
  pip(g, suit, w * 0.5, h * 0.76, w * 0.11);
}

function court(g, W, H, rank, suit) {
  const x = W * 0.2, y = H * 0.1, w = W * 0.6, h = H * 0.8;
  g.save();
  g.fillStyle = "#fbf6ea";
  g.fillRect(x, y, w, h);
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.save();
  g.translate(x, y);
  courtHalf(g, w, h / 2, rank, suit);
  g.restore();
  g.save();
  g.translate(x + w, y + h);
  g.rotate(Math.PI);
  courtHalf(g, w, h / 2, rank, suit);
  g.restore();
  // divider
  g.strokeStyle = "rgba(26,22,18,0.6)";
  g.lineWidth = W * 0.006;
  g.beginPath();
  g.moveTo(x + w * 0.05, y + h * 0.5 + w * 0.06);
  g.lineTo(x + w * 0.95, y + h * 0.5 - w * 0.06);
  g.stroke();
  g.restore();
  // frame
  const col = suit === 1 || suit === 2 ? RED : BLACK;
  g.strokeStyle = col;
  g.lineWidth = W * 0.008;
  g.strokeRect(x, y, w, h);
  g.strokeStyle = "#c79a3a";
  g.lineWidth = W * 0.004;
  g.strokeRect(x - W * 0.015, y - W * 0.015, w + W * 0.03, h + W * 0.03);
}

function ace(g, W, H, suit) {
  const cx = W / 2, cy = H / 2;
  if (suit === 3) {
    // the ace of spades: big ornate pip in a filigree ring
    g.strokeStyle = BLACK;
    g.lineWidth = W * 0.006;
    for (const r of [0.3, 0.33]) {
      g.beginPath();
      g.arc(cx, cy, W * r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * W * 0.315, cy + Math.sin(a) * W * 0.315, W * 0.012, 0, Math.PI * 2);
      g.fillStyle = BLACK;
      g.fill();
    }
    pip(g, 3, cx, cy, W * 0.46);
    // engraved highlight
    g.save();
    suitPath(g, 3, cx, cy, W * 0.46);
    g.clip();
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = W * 0.004;
    for (let i = -10; i < 10; i++) {
      g.beginPath();
      g.moveTo(cx + i * W * 0.025, cy - W * 0.3);
      g.lineTo(cx + i * W * 0.025 + W * 0.12, cy + W * 0.3);
      g.stroke();
    }
    g.restore();
  } else pip(g, suit, cx, cy, W * 0.34);
}

/* ------------------------------------------------------------ back */
function back(g, W, H) {
  g.fillStyle = "#f4efe2";
  g.fillRect(0, 0, W, H);
  const m = W * 0.06;
  g.fillStyle = "#6a1418";
  g.fillRect(m, m, W - 2 * m, H - 2 * m);
  g.save();
  g.beginPath();
  g.rect(m, m, W - 2 * m, H - 2 * m);
  g.clip();
  // lattice
  g.strokeStyle = "rgba(232,200,140,0.55)";
  g.lineWidth = W * 0.006;
  const step = W * 0.07;
  for (let i = -30; i < 30; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step + H, H);
    g.stroke();
    g.beginPath();
    g.moveTo(i * step, H);
    g.lineTo(i * step + H, 0);
    g.stroke();
  }
  g.fillStyle = "rgba(232,200,140,0.6)";
  for (let y = 0; y < H / step + 1; y++)
    for (let x = 0; x < W / step + 1; x++) {
      g.beginPath();
      g.arc(x * step + (y % 2 ? step / 2 : 0), y * step * 0.5 * 2, W * 0.006, 0, Math.PI * 2);
      g.fill();
    }
  g.restore();
  // inner frame
  g.strokeStyle = "#e8c88c";
  g.lineWidth = W * 0.01;
  g.strokeRect(m * 1.6, m * 1.6, W - 3.2 * m, H - 3.2 * m);
  // medallion: horseshoe + star
  const cx = W / 2, cy = H / 2, R = W * 0.2;
  g.fillStyle = "#6a1418";
  g.beginPath();
  g.arc(cx, cy, R * 1.15, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#e8c88c";
  g.lineWidth = W * 0.012;
  g.stroke();
  g.lineWidth = W * 0.045;
  g.lineCap = "round";
  g.beginPath();
  g.arc(cx, cy + R * 0.05, R * 0.72, Math.PI * 0.72, Math.PI * 2.28);
  g.stroke();
  g.fillStyle = "#6a1418";
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.82 + (i / 6) * Math.PI * 1.36;
    g.beginPath();
    g.arc(cx + Math.cos(a) * R * 0.72, cy + R * 0.05 + Math.sin(a) * R * 0.72, W * 0.01, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#e8c88c";
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? R * 0.18 : R * 0.42;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  // wear
  g.globalCompositeOperation = "source-atop";
  g.globalAlpha = 0.12;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = "#000";
    g.fillRect(hash(i) * W, hash(i * 2.3) * H, 1 + hash(i * 5) * 3, 1);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

/* ------------------------------------------------------------ public */
export function drawCard(g, W, H, card) {
  const r = rankOf(card), s = suitOf(card);
  paper(g, W, H, card + 1);
  if (r >= 11 && r <= 13) court(g, W, H, r, s);
  else if (r === 14) ace(g, W, H, s);
  else {
    const x0 = W * 0.2, w = W * 0.6, y0 = H * 0.12, h = H * 0.76;
    for (const [px, py, f] of PIPS[r]) pip(g, s, x0 + (0.5 + (px - 0.5) * 1.12) * w, y0 + py * h, W * 0.15, !!f);
  }
  index(g, W, H, r, s);
}

let RES = { w: 400, h: 560 };
export function setCardResolution(q) {
  RES = q === "low" ? { w: 224, h: 314 } : q === "medium" ? { w: 320, h: 448 } : { w: 400, h: 560 };
  for (const t of faceCache.values()) t.dispose();
  faceCache.clear();
  backTex?.dispose();
  backTex = null;
}

const faceCache = new Map();
let backTex = null;
let maxAniso = 8;
export const setCardAnisotropy = (n) => (maxAniso = n);

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
export function faceTexture(card) {
  let t = faceCache.get(card);
  if (!t) {
    const c = canvas(RES.w, RES.h);
    drawCard(c.getContext("2d"), RES.w, RES.h, card);
    t = toTex(c);
    faceCache.set(card, t);
  }
  return t;
}
export function backTexture() {
  if (!backTex) {
    const c = canvas(RES.w, RES.h);
    back(c.getContext("2d"), RES.w, RES.h);
    backTex = toTex(c);
  }
  return backTex;
}

/** Small images for the HTML card overlay (data URLs, cached). */
const urlCache = new Map();
export function cardImage(card) {
  const key = card == null ? "back" : card;
  if (!urlCache.has(key)) {
    const c = canvas(200, 280);
    const g = c.getContext("2d");
    if (card == null) back(g, 200, 280);
    else drawCard(g, 200, 280, card);
    urlCache.set(key, c.toDataURL("image/png"));
  }
  return urlCache.get(key);
}

export function disposeCardTextures() {
  for (const t of faceCache.values()) t.dispose();
  faceCache.clear();
  backTex?.dispose();
  backTex = null;
}
