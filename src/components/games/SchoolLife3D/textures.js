/**
 * School Life Simulator 3D — procedural canvas textures: tiling surfaces
 * (tile, wood, brick, grass, paving, court, net) and the three decal atlases
 * (signs, posters, boards). No image files are shipped.
 */
import * as THREE from "three";

const mk = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
function rnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function tex(canvas, { repeat = true, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/* ================================================================ surfaces */
export function surfaceTextures(aniso = 4) {
  const R = rnd(7);
  const out = {};
  {
    // floor tiles: 2×2 tiles per texture, light grout
    const c = mk(256, 256);
    const g = c.getContext("2d");
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 2; k++) {
        const v = 236 + Math.floor(R() * 14);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(i * 128, k * 128, 128, 128);
        for (let n = 0; n < 60; n++) {
          const s = 228 + Math.floor(R() * 26);
          g.fillStyle = `rgba(${s},${s},${s},0.5)`;
          g.fillRect(i * 128 + R() * 128, k * 128 + R() * 128, 2 + R() * 4, 2 + R() * 4);
        }
      }
    }
    g.fillStyle = "rgb(190,190,190)";
    for (const p of [0, 128]) {
      g.fillRect(p, 0, 3, 256);
      g.fillRect(0, p, 256, 3);
    }
    out.tile = tex(c, { aniso });
  }
  {
    // wood planks
    const c = mk(256, 256);
    const g = c.getContext("2d");
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const off = R() * 256;
      for (let x = -256; x < 256; x += 128) {
        const v = 205 + Math.floor(R() * 40);
        g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        g.fillRect(x + off, r * 32, 128, 32);
        g.fillStyle = "rgba(90,60,40,0.35)";
        g.fillRect(x + off, r * 32, 2, 32);
      }
      for (let n = 0; n < 14; n++) {
        g.strokeStyle = `rgba(120,80,50,${0.08 + R() * 0.1})`;
        g.lineWidth = 1;
        g.beginPath();
        const y = r * 32 + 3 + R() * 26;
        g.moveTo(0, y);
        g.bezierCurveTo(80, y + R() * 4 - 2, 170, y + R() * 4 - 2, 256, y);
        g.stroke();
      }
      g.fillStyle = "rgba(80,55,35,0.45)";
      g.fillRect(0, r * 32, 256, 2);
    }
    out.wood = tex(c, { aniso });
  }
  {
    // bricks (full colour — the vertex colour on brick faces is white)
    const c = mk(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#e3d9c9";
    g.fillRect(0, 0, 256, 256);
    const bh = 32;
    const bw = 64;
    for (let r = 0; r < 8; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let x = -bw; x < 256 + bw; x += bw) {
        const h = 8 + R() * 10;
        const l = 40 + R() * 10;
        g.fillStyle = `hsl(${h},${48 + R() * 12}%,${l}%)`;
        g.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4);
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(x + off + 2, r * bh + 2, bw - 4, 5);
      }
    }
    out.brick = tex(c, { aniso });
  }
  {
    // grass
    const c = mk(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#e6ecd8";
    g.fillRect(0, 0, 256, 256);
    for (let n = 0; n < 4200; n++) {
      const v = 170 + Math.floor(R() * 85);
      g.fillStyle = `rgba(${v - 30},${v},${v - 60},0.55)`;
      g.fillRect(R() * 256, R() * 256, 1 + R() * 2, 2 + R() * 4);
    }
    out.grass = tex(c, { aniso });
  }
  {
    // paving slabs
    const c = mk(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#cfcac0";
    g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++) {
      const off = r % 2 ? 48 : 0;
      for (let x = -96; x < 256; x += 96) {
        const v = 226 + Math.floor(R() * 26);
        g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
        g.fillRect(x + off + 2, r * 64 + 2, 92, 60);
        for (let n = 0; n < 30; n++) {
          g.fillStyle = `rgba(150,140,130,${R() * 0.15})`;
          g.fillRect(x + off + 2 + R() * 90, r * 64 + 2 + R() * 58, 2, 2);
        }
      }
    }
    out.paving = tex(c, { aniso });
  }
  {
    // sports surface: fine noise
    const c = mk(128, 128);
    const g = c.getContext("2d");
    g.fillStyle = "#eeeeee";
    g.fillRect(0, 0, 128, 128);
    for (let n = 0; n < 2400; n++) {
      const v = 205 + Math.floor(R() * 50);
      g.fillStyle = `rgba(${v},${v},${v},0.6)`;
      g.fillRect(R() * 128, R() * 128, 1, 1);
    }
    out.court = tex(c, { aniso });
  }
  {
    // net grid (alpha)
    const c = mk(64, 64);
    const g = c.getContext("2d");
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= 64; i += 16) {
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
    }
    g.stroke();
    out.net = tex(c, { aniso, srgb: true });
  }
  return out;
}

/* ================================================================ atlas helpers */
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function fitText(g, text, maxW, size, weight = "700", family = "Inter, system-ui, sans-serif") {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > 8) {
    s -= 1;
    g.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

const SIGN_TEXT = {
  storage: ["Storage Room", "🧹", "#6b7280"],
  math101: ["101 · Mathematics", "➗", "#4f8cff"],
  eng102: ["102 · English", "📖", "#ff7a59"],
  exam103: ["103 · Exam Hall", "📝", "#e0457b"],
  tlounge: ["Teachers' Lounge", "☕", "#4a7b5c"],
  cafeteria: ["Cafeteria", "🍽️", "#e3832b"],
  bathG: ["Girls' Restroom", "🚺", "#d26aa0"],
  bathB: ["Boys' Restroom", "🚹", "#4f8cff"],
  nurse: ["Nurse", "➕", "#e05a5a"],
  music: ["Music Room", "🎵", "#a35ad6"],
  lockers: ["Lockers  ·  Courtyard ↑", "🔒", "#3f78b5"],
  principal: ["Principal's Office", "⭐", "#5b3a68"],
  hist201: ["201 · History", "🏛️", "#c58b3a"],
  library: ["Library", "📚", "#7a4b2a"],
  comp: ["Computer Room", "💻", "#8b5cf6"],
  lab: ["Science Lab", "🧪", "#2fbf71"],
  study202: ["202 · Study Room", "✏️", "#22b3c9"],
  art: ["Art Room", "🎨", "#f05f8a"],
  club: ["Club Room", "♟️", "#2a9d8f"],
  slounge: ["Student Lounge", "🛋️", "#f2b20f"],
  stairs: ["Stairs", "⇅", "#3f78b5"],
  gymsign: ["Gymnasium →", "🏀", "#c4302b"],
};
function drawSign(g, key, W, H) {
  if (key === "gate" || key === "facade") {
    g.fillStyle = key === "gate" ? "#1f3b63" : "#f1ebdf";
    g.fillRect(0, 0, W, H);
    g.fillStyle = key === "gate" ? "#f3d27a" : "#1f3b63";
    const s = fitText(g, "MAPLEWOOD HIGH SCHOOL", W * 0.92, H * 0.62, "900", "Georgia, 'Times New Roman', serif");
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("MAPLEWOOD HIGH SCHOOL", W / 2, H / 2 + s * 0.04);
    return;
  }
  if (key === "stone") {
    g.fillStyle = "#d8d0c0";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#3a4a5a";
    g.textAlign = "center";
    g.textBaseline = "middle";
    fitText(g, "Maplewood High", W * 0.86, H * 0.42, "900", "Georgia, serif");
    g.fillText("Maplewood High", W / 2, H * 0.4);
    fitText(g, "LEARN • EXPLORE • LIVE  ·  EST. 1962", W * 0.86, H * 0.18, "700");
    g.fillText("LEARN • EXPLORE • LIVE  ·  EST. 1962", W / 2, H * 0.78);
    return;
  }
  if (key === "scoreboard") {
    g.fillStyle = "#0d0f14";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#ff4d3d";
    g.textAlign = "center";
    g.textBaseline = "middle";
    fitText(g, "HOME 42   ·   GUEST 38", W * 0.9, H * 0.42, "900", "monospace");
    g.fillText("HOME 42   ·   GUEST 38", W / 2, H * 0.36);
    g.fillStyle = "#ffd23f";
    fitText(g, "GO MAPLEWOOD!", W * 0.7, H * 0.3, "900", "monospace");
    g.fillText("GO MAPLEWOOD!", W / 2, H * 0.76);
    return;
  }
  const [text, icon, col] = SIGN_TEXT[key] || [key, "", "#3f78b5"];
  g.fillStyle = col;
  roundRect(g, 2, 2, W - 4, H - 4, H * 0.18);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.fillRect(4, 4, W - 8, H * 0.35);
  g.fillStyle = "#ffffff";
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.font = `${Math.round(H * 0.56)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  g.fillText(icon, H * 0.22, H / 2 + 2);
  fitText(g, text, W - H * 1.3, H * 0.5, "800");
  g.fillText(text, H * 1.05, H / 2 + 2);
}

/* ---------------------------------------------------------------- posters */
const POSTER = {
  p_math: { bg: "#4f8cff", title: "MATH", lines: ["a² + b² = c²", "π ≈ 3.14159", "x = (−b ± √Δ) / 2a"] },
  p_geometry: { bg: "#2f6fd1", title: "SHAPES", shapes: true },
  p_pi: { bg: "#1f3b63", title: "π", big: true, lines: ["3.14159265…"] },
  p_numbers: { bg: "#ffffff", title: "1 2 3 4 5 6 7 8 9 0", dark: true },
  p_reading: { bg: "#ff7a59", title: "READ!", lines: ["Books open", "new worlds"], icon: "📚" },
  p_poetry: { bg: "#f2a65a", title: "POETRY", lines: ["Roses are red,", "violets are blue…"] },
  p_grammar: { bg: "#e76f51", title: "GRAMMAR", lines: ["noun · verb", "adjective · adverb"] },
  p_history: { bg: "#c58b3a", title: "HISTORY", lines: ["Learn from", "the past"], icon: "🏛️" },
  p_map: { bg: "#d9c7a1", title: "WORLD MAP", map: true, dark: true },
  p_egypt: { bg: "#e0b45a", title: "EGYPT", lines: ["2560 BCE"], icon: "🔺" },
  p_code: { bg: "#1d2230", title: "</> CODE", lines: ["for i in range(10):", "    learn()"], mono: true },
  p_binary: { bg: "#0f2a1a", title: "01001000 01001001", mono: true, lines: ["= “HI”"] },
  p_robot: { bg: "#8b5cf6", title: "ROBOTICS", icon: "🤖", lines: ["Club: Thursdays"] },
  p_periodic: { bg: "#ffffff", title: "PERIODIC TABLE", periodic: true, dark: true },
  p_planets: { bg: "#0b1530", title: "SOLAR SYSTEM", planets: true },
  p_cell: { bg: "#2fbf71", title: "THE CELL", icon: "🦠", lines: ["nucleus · mitochondria"] },
  p_science: { bg: "#2fbf71", title: "SCIENCE FAIR", icon: "🔬", lines: ["Friday · Gym"] },
  p_quiet: { bg: "#f7f7f5", title: "QUIET PLEASE", icon: "🤫", dark: true, lines: ["Exam in progress"] },
  p_exam: { bg: "#e0457b", title: "EXAM TIPS", lines: ["Read twice", "Answer once"] },
  p_kindness: { bg: "#f2b20f", title: "BE KIND", icon: "💛", lines: ["Kindness is cool"] },
  p_sports: { bg: "#c4302b", title: "GO TEAM!", icon: "🏆", lines: ["Tryouts Monday"] },
  p_art: { bg: "#f05f8a", title: "ART CLUB", icon: "🎨", lines: ["Express yourself"] },
  p_clubs: { bg: "#2a9d8f", title: "JOIN A CLUB", lines: ["Chess · Robotics", "Drama · Music"], icon: "⭐" },
  p_coffee: { bg: "#6b4a2a", title: "COFFEE", icon: "☕", lines: ["Teachers' fuel"] },
  p_food: { bg: "#e3832b", title: "TODAY", icon: "🍕", lines: ["Pizza · Pasta", "Salad bar"] },
  p_healthy: { bg: "#7cc242", title: "EAT WELL", icon: "🥗", lines: ["5 a day!"] },
  p_health: { bg: "#e05a5a", title: "WASH HANDS", icon: "🧼", lines: ["20 seconds"] },
  p_music: { bg: "#a35ad6", title: "BAND", icon: "🎵", lines: ["Practice 3 PM"] },
  p_principal: { bg: "#5b3a68", title: "EXCELLENCE", lines: ["Maplewood High"], icon: "⭐" },
  p_library: { bg: "#7a4b2a", title: "SILENCE", icon: "🤫" },
  p_study: { bg: "#22b3c9", title: "FOCUS", icon: "🎯", lines: ["Study hard,", "dream big"] },
  p_chess: { bg: "#2a2f3a", title: "CHESS CLUB", icon: "♟️", lines: ["Checkmate!"] },
  notice: { notice: true, title: "NOTICE BOARD" },
  notice2: { notice: true, title: "EVENTS" },
  welcome: { bg: "#3f78b5", title: "WELCOME!", lines: ["Maplewood High"], icon: "👋" },
  crest: { crest: true },
  schoolmap: { schoolmap: true },
  banner1: { bg: "#c4302b", title: "CHAMPIONS", lines: ["2024 · 2025"], icon: "🏆" },
  banner2: { bg: "#1f4fa3", title: "MAPLEWOOD", lines: ["EAGLES"], icon: "🦅" },
  art1: { art: 1 },
  art2: { art: 2 },
  art3: { art: 3 },
};
function drawPoster(g, key, W, H, R) {
  const P = POSTER[key] || { bg: "#3f78b5", title: key };
  if (P.crest) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#1f3b63";
    g.beginPath();
    g.arc(W / 2, H / 2, W * 0.48, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#e8c45a";
    g.lineWidth = W * 0.03;
    g.stroke();
    g.fillStyle = "#e8c45a";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${W * 0.3}px Georgia, serif`;
    g.fillText("M", W / 2, H * 0.47);
    g.font = `700 ${W * 0.06}px Inter, sans-serif`;
    g.fillText("LEARN • EXPLORE • LIVE", W / 2, H * 0.74);
    return;
  }
  if (P.schoolmap) {
    g.fillStyle = "#f7f3ea";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#1f3b63";
    g.lineWidth = 3;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = "#1f3b63";
    g.font = `800 ${H * 0.1}px Inter, sans-serif`;
    g.textAlign = "left";
    g.fillText("SCHOOL MAP", W * 0.04, H * 0.14);
    const cols = ["#4f8cff", "#ff7a59", "#e0457b", "#2fbf71", "#c58b3a", "#8b5cf6", "#e3832b", "#7a4b2a"];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cols[i];
      g.fillRect(W * (0.05 + i * 0.15), H * 0.55, W * 0.13, H * 0.3);
      g.fillStyle = cols[(i + 3) % 8];
      g.fillRect(W * (0.05 + i * 0.15), H * 0.2, W * 0.13, H * 0.25);
    }
    g.fillStyle = "#d8d1c2";
    g.fillRect(W * 0.05, H * 0.46, W * 0.88, H * 0.08);
    g.fillStyle = "#e0453d";
    g.beginPath();
    g.arc(W * 0.5, H * 0.88, H * 0.04, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (P.notice) {
    g.fillStyle = "#b98d55";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#c9a26b";
    g.fillRect(W * 0.03, H * 0.05, W * 0.94, H * 0.9);
    const papers = ["#ffffff", "#fff3a8", "#cfe8ff", "#ffd6e0", "#d8f5d0"];
    for (let i = 0; i < 9; i++) {
      const x = W * (0.06 + (i % 3) * 0.31) + R() * 6;
      const y = H * (0.1 + Math.floor(i / 3) * 0.28) + R() * 6;
      g.save();
      g.translate(x, y);
      g.rotate((R() - 0.5) * 0.12);
      g.fillStyle = papers[i % papers.length];
      g.fillRect(0, 0, W * 0.26, H * 0.24);
      g.fillStyle = "rgba(40,40,60,0.55)";
      for (let l = 0; l < 4; l++) g.fillRect(W * 0.02, H * (0.05 + l * 0.045), W * (0.12 + R() * 0.1), 2);
      g.fillStyle = "#e0453d";
      g.beginPath();
      g.arc(W * 0.13, 4, 4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = "#1f3b63";
    g.font = `800 ${H * 0.07}px Inter, sans-serif`;
    g.textAlign = "center";
    g.fillText(P.title, W / 2, H * 0.06 + H * 0.02);
    return;
  }
  if (P.art) {
    const pal = [["#f4a261", "#2a9d8f", "#e9c46a", "#264653"], ["#ff7eb6", "#7afcff", "#feff9c", "#8f5cff"], ["#87ceeb", "#228b22", "#ffd700", "#ff6347"]][P.art - 1];
    g.fillStyle = pal[0];
    g.fillRect(0, 0, W, H);
    if (P.art === 3) {
      g.fillStyle = pal[0];
      g.fillRect(0, 0, W, H * 0.6);
      g.fillStyle = pal[1];
      g.fillRect(0, H * 0.6, W, H * 0.4);
      g.fillStyle = pal[2];
      g.beginPath();
      g.arc(W * 0.75, H * 0.25, H * 0.12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pal[3];
      g.beginPath();
      g.moveTo(W * 0.1, H * 0.6);
      g.lineTo(W * 0.35, H * 0.25);
      g.lineTo(W * 0.6, H * 0.6);
      g.fill();
    } else {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = pal[i % 4];
        g.globalAlpha = 0.8;
        g.beginPath();
        g.arc(R() * W, R() * H, 10 + R() * W * 0.25, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    return;
  }
  g.fillStyle = P.bg || "#3f78b5";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(0, 0, W, H * 0.06);
  const ink = P.dark ? "#1f2937" : "#ffffff";
  g.fillStyle = ink;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let y = H * 0.17;
  if (P.big) {
    g.font = `900 ${H * 0.45}px Georgia, serif`;
    g.fillText(P.title, W / 2, H * 0.42);
    y = H * 0.75;
  } else {
    fitText(g, P.title, W * 0.88, H * 0.13, "900", P.mono ? "monospace" : undefined);
    g.fillText(P.title, W / 2, y);
    y += H * 0.14;
  }
  if (P.icon) {
    g.font = `${H * 0.3}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    g.fillText(P.icon, W / 2, H * 0.52);
    y = H * 0.76;
  }
  if (P.periodic) {
    const cols = ["#ff9a8a", "#ffd27a", "#9ad7ff", "#b6f0a0", "#d7b6ff"];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) {
      if (r < 2 && c > 1 && c < 10) continue;
      g.fillStyle = cols[(r + c) % 5];
      g.fillRect(W * 0.04 + c * W * 0.077, H * 0.3 + r * H * 0.1, W * 0.07, H * 0.085);
    }
  }
  if (P.planets) {
    const pc = ["#ffcc33", "#b0a8a0", "#e8c48a", "#4a90e2", "#d9573f", "#e8b07a", "#e8d08a", "#8fd3e8"];
    pc.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(W * (0.1 + i * 0.115), H * 0.55, (i === 0 ? 0.09 : 0.025 + (i % 3) * 0.012) * W, 0, Math.PI * 2);
      g.fill();
    });
  }
  if (P.map) {
    g.fillStyle = "#7fb3d5";
    g.fillRect(W * 0.05, H * 0.28, W * 0.9, H * 0.65);
    g.fillStyle = "#8bc34a";
    for (const [x, yy, w, h] of [[0.1, 0.35, 0.22, 0.25], [0.18, 0.62, 0.1, 0.25], [0.42, 0.33, 0.12, 0.2], [0.45, 0.55, 0.12, 0.3], [0.6, 0.32, 0.28, 0.25], [0.78, 0.7, 0.12, 0.12]]) g.fillRect(W * x, H * yy, W * w, H * h);
  }
  if (P.shapes) {
    g.strokeStyle = "#ffffff";
    g.lineWidth = 4;
    g.strokeRect(W * 0.15, H * 0.35, W * 0.25, W * 0.25);
    g.beginPath();
    g.arc(W * 0.7, H * 0.47, W * 0.14, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(W * 0.5, H * 0.65);
    g.lineTo(W * 0.3, H * 0.9);
    g.lineTo(W * 0.7, H * 0.9);
    g.closePath();
    g.stroke();
  }
  if (P.lines) {
    for (const ln of P.lines) {
      fitText(g, ln, W * 0.86, H * 0.075, "600", P.mono ? "monospace" : undefined);
      g.fillText(ln, W / 2, y);
      y += H * 0.095;
    }
  }
}

/* ---------------------------------------------------------------- boards */
const BOARD = {
  board_math: { title: "Mathematics", lines: ["3x + 7 = 22  →  x = 5", "25% of 80 = 20", "Area = w × h"], chalk: true },
  board_english: { title: "English", lines: ["Synonym: happy → joyful", "Antonym: ancient → modern", "“She walks to school.”"], chalk: true },
  board_history: { title: "History", lines: ["1215  Magna Carta", "1492  Columbus", "1969  Moon landing"], chalk: true },
  board_science: { title: "Science Lab", lines: ["H₂O · CO₂ · NaCl", "I = V ÷ R", "Safety goggles ON!"], white: true },
  board_cs: { title: "Computer Science", lines: ["for i in range(3):", "    robot.forward()", "if done: print('yay')"], white: true, mono: true },
  board_exam: { title: "EXAM TODAY", lines: ["Phones in bags", "No talking", "Good luck everyone!"], chalk: true },
  board_menu: { title: "TODAY'S MENU", menu: true },
};
function drawBoard(g, key, W, H, R) {
  const B = BOARD[key] || { title: key, lines: [], chalk: true };
  if (B.menu) {
    g.fillStyle = "#2b2b2b";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#c9a26b";
    g.lineWidth = 10;
    g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = "#ffd23f";
    g.textAlign = "center";
    g.font = `800 ${H * 0.2}px Georgia, serif`;
    g.fillText(B.title, W / 2, H * 0.24);
    g.fillStyle = "#ffffff";
    g.font = `600 ${H * 0.13}px Inter, sans-serif`;
    const items = ["🍕 Pizza 16", "🍝 Pasta 15", "🥪 Sandwich 12", "🥗 Salad 10", "🍱 Combo 24", "🍪 Cookie 5"];
    items.forEach((t, i) => g.fillText(t, W * (0.2 + (i % 3) * 0.3), H * (0.55 + Math.floor(i / 3) * 0.28)));
    return;
  }
  if (B.white) {
    g.fillStyle = "#f7f8fa";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#c9ced6";
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
  } else {
    g.fillStyle = "#2f4a3c";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${R() * 0.035})`;
      g.fillRect(R() * W, R() * H, 4 + R() * 30, 2 + R() * 10);
    }
  }
  const ink = B.white ? ["#1f4fa3", "#c4302b", "#1f7a4a"] : ["#f4f1e6", "#ffe08a", "#bfe3ff"];
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = ink[0];
  g.font = `700 ${H * 0.18}px ${B.white ? "'Comic Sans MS', 'Segoe Print', cursive" : "'Segoe Print', 'Comic Sans MS', cursive"}`;
  g.fillText(B.title, W * 0.04, H * 0.18);
  g.fillRect(W * 0.04, H * 0.29, W * 0.36, 3);
  B.lines.forEach((ln, i) => {
    g.fillStyle = ink[1 + (i % 2)];
    g.font = `600 ${H * 0.135}px ${B.mono ? "monospace" : "'Segoe Print', 'Comic Sans MS', cursive"}`;
    g.fillText(ln, W * 0.06 + (i % 2) * W * 0.02, H * (0.45 + i * 0.18));
  });
  if (!B.white) {
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.fillRect(W * 0.86, H * 0.86, W * 0.06, H * 0.05);
  }
}

/**
 * Builds the three atlases for the decal keys in use.
 * Returns { sign, poster, board } each = { texture, uv(key) → [u0,v0,u1,v1] }.
 */
export function buildAtlases(decals, aniso = 4) {
  const R = rnd(99);
  const groups = { sign: new Map(), poster: new Map(), board: new Map() };
  for (const d of decals) if (!groups[d.atlas].has(d.key)) groups[d.atlas].set(d.key, d.w / d.h);
  const spec = { sign: { size: 2048, cw: 512, ch: 128, draw: drawSign }, poster: { size: 2048, cw: 256, ch: 256, draw: drawPoster }, board: { size: 2048, cw: 1024, ch: 256, draw: drawBoard } };
  const out = {};
  for (const [atlas, keys] of Object.entries(groups)) {
    const S = spec[atlas];
    const c = mk(S.size, S.size);
    const g = c.getContext("2d");
    const cols = S.size / S.cw;
    const map = new Map();
    let i = 0;
    for (const [key, ar] of keys) {
      const cx = (i % cols) * S.cw;
      const cy = Math.floor(i / cols) * S.ch;
      i++;
      // draw in a virtual space with the decal's aspect, squeezed into the cell
      const VW = atlas === "poster" ? 256 * Math.max(0.5, ar) : S.cw;
      const VH = atlas === "poster" ? 256 : S.ch;
      g.save();
      g.beginPath();
      g.rect(cx, cy, S.cw, S.ch);
      g.clip();
      g.translate(cx, cy);
      g.scale(S.cw / VW, S.ch / VH);
      S.draw(g, key, VW, VH, R);
      g.restore();
      const pad = 1.5;
      map.set(key, [(cx + pad) / S.size, 1 - (cy + S.ch - pad) / S.size, (cx + S.cw - pad) / S.size, 1 - (cy + pad) / S.size]);
    }
    const t = tex(c, { repeat: false, aniso });
    t.generateMipmaps = true;
    out[atlas] = { texture: t, uv: (k) => map.get(k) || [0, 0, 0.01, 0.01] };
  }
  return out;
}

/** Clock face texture (shared by every wall clock). */
export function clockTexture() {
  const c = mk(256, 256);
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1f2937";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "700 30px Inter, sans-serif";
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    g.fillText(String(h), 128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92);
  }
  for (let m = 0; m < 60; m++) {
    const a = (m / 60) * Math.PI * 2;
    const r0 = m % 5 ? 112 : 106;
    g.lineWidth = m % 5 ? 2 : 4;
    g.strokeStyle = "#1f2937";
    g.beginPath();
    g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0);
    g.lineTo(128 + Math.sin(a) * 120, 128 - Math.cos(a) * 120);
    g.stroke();
  }
  return tex(c, { repeat: false });
}

/** Speech-bubble / name-tag canvas → texture (re-drawn when the text changes). */
export function drawBubble(canvas, text, kind = "npc") {
  const g = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  g.clearRect(0, 0, W, H);
  const pad = 18;
  const fs = 30;
  g.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  // wrap into ≤ 2 lines
  const words = String(text).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > W - pad * 2 - 10 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = `${lines[2].slice(0, -1)}…`;
  }
  const tw = Math.min(W - 8, Math.max(...lines.map((l) => g.measureText(l).width)) + pad * 2);
  const th = lines.length * (fs + 8) + pad * 1.4;
  const x = (W - tw) / 2;
  const y = H - th - 22;
  const bg = kind === "teacher" ? "#fff7d6" : kind === "friend" ? "#e3f7e8" : kind === "name" ? "rgba(20,28,45,0.82)" : "#ffffff";
  const ink = kind === "name" ? "#ffffff" : "#1f2937";
  g.fillStyle = "rgba(0,0,0,0.18)";
  roundRect(g, x + 3, y + 5, tw, th, 22);
  g.fill();
  g.fillStyle = bg;
  roundRect(g, x, y, tw, th, 22);
  g.fill();
  if (kind !== "name") {
    g.beginPath();
    g.moveTo(W / 2 - 14, y + th - 1);
    g.lineTo(W / 2, y + th + 20);
    g.lineTo(W / 2 + 14, y + th - 1);
    g.fill();
  }
  g.fillStyle = ink;
  g.textAlign = "center";
  g.textBaseline = "top";
  lines.forEach((l, i) => g.fillText(l, W / 2, y + pad * 0.75 + i * (fs + 8)));
  return { w: tw / W, h: (th + 22) / H };
}
