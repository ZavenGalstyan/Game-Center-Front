/**
 * Procedural canvas textures (no image files): weathered planks, sand, red
 * earth, rock, crates, adobe, canvas tents, painted pictogram shop signs and
 * a wanted-poster sketch. Signs deliberately use pictures, not words, so the
 * game never bakes English text into the 3D world.
 */
import * as THREE from "three";

let seed = 1;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function make(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  seed = 1234;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

function noise(g, w, h, n, colors, rmin = 1, rmax = 3, alpha = 0.25) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = rmin + rnd() * (rmax - rmin);
    g.fillRect(rnd() * w, rnd() * h, r, r * (0.6 + rnd()));
  }
  g.globalAlpha = 1;
}

export const PLANK_TONES = ["#a07a52", "#8a4a32", "#6d7f86", "#5e4130", "#7b7469", "#c79a6a"];

export function plankTexture(tone = 0, vertical = true) {
  const base = PLANK_TONES[tone % PLANK_TONES.length];
  return make(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const k = 0.8 + rnd() * 0.35;
      g.fillStyle = shade(base, k);
      if (vertical) g.fillRect((i * w) / n, 0, w / n, h);
      else g.fillRect(0, (i * h) / n, w, h / n);
      // grain
      g.strokeStyle = shade(base, k * 0.78);
      g.globalAlpha = 0.35;
      for (let j = 0; j < 6; j++) {
        g.beginPath();
        if (vertical) {
          const x = (i * w) / n + rnd() * (w / n);
          g.moveTo(x, 0);
          g.bezierCurveTo(x + rnd() * 4 - 2, h * 0.3, x + rnd() * 4 - 2, h * 0.7, x, h);
        } else {
          const y = (i * h) / n + rnd() * (h / n);
          g.moveTo(0, y);
          g.bezierCurveTo(w * 0.3, y + rnd() * 4 - 2, w * 0.7, y + rnd() * 4 - 2, w, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      // seams
      g.fillStyle = shade(base, 0.45);
      if (vertical) g.fillRect((i * w) / n, 0, 2, h);
      else g.fillRect(0, (i * h) / n, w, 2);
      // nails
      g.fillStyle = "#2a2522";
      if (vertical) {
        g.fillRect((i * w) / n + 6, 10, 3, 3);
        g.fillRect((i * w) / n + 6, h - 14, 3, 3);
      }
    }
    noise(g, w, h, 900, [shade(base, 0.6), shade(base, 1.25)], 1, 2, 0.3);
  }, { repeat: [1, 1] });
}

export function groundTexture(kind) {
  const pal = {
    sand: ["#d6b07a", "#c9a06a", "#e2c28f", "#b98f5e"],
    dirt: ["#a4835e", "#957452", "#b39370", "#7f6346"],
    red: ["#b8714a", "#a8633f", "#c88560", "#8f5235"],
    rock: ["#4c4440", "#5a514b", "#3c3532", "#676058"],
    town: ["#c4a171", "#b8936a", "#d4b388", "#a68259"],
  }[kind] || ["#c4a171", "#b8936a", "#d4b388", "#a68259"];
  return make(512, 512, (g, w, h) => {
    g.fillStyle = pal[0];
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, pal[1 + Math.floor(rnd() * 3)]);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.5;
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    noise(g, w, h, 9000, pal, 1, 2.5, 0.5);
    // pebbles
    for (let i = 0; i < 260; i++) {
      g.fillStyle = shade(pal[3], 0.7 + rnd() * 0.5);
      g.beginPath();
      g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat: [40, 40] });
}

export function roadTexture() {
  return make(256, 512, (g, w, h) => {
    g.fillStyle = "#a88a62";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 5000, ["#977a54", "#b89a70", "#8a6e4b"], 1, 3, 0.55);
    // wheel ruts
    for (const x of [w * 0.3, w * 0.7]) {
      const gr = g.createLinearGradient(x - 14, 0, x + 14, 0);
      gr.addColorStop(0, "rgba(90,66,40,0)");
      gr.addColorStop(0.5, "rgba(90,66,40,0.55)");
      gr.addColorStop(1, "rgba(90,66,40,0)");
      g.fillStyle = gr;
      g.fillRect(x - 14, 0, 28, h);
    }
    // hoof prints
    g.fillStyle = "rgba(80,60,38,0.4)";
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.ellipse(w * 0.5 + (rnd() - 0.5) * 40, rnd() * h, 4, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat: [1, 8] });
}

export function rockTexture(tone = 0) {
  const base = ["#9a6e4e", "#b0704a", "#a35f3e", "#6e6460"][tone % 4];
  return make(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // strata
    for (let y = 0; y < h; y += 6 + rnd() * 14) {
      g.fillStyle = shade(base, 0.75 + rnd() * 0.45);
      g.globalAlpha = 0.6;
      g.fillRect(0, y, w, 2 + rnd() * 8);
    }
    g.globalAlpha = 1;
    noise(g, w, h, 3000, [shade(base, 0.6), shade(base, 1.3), shade(base, 0.85)], 1, 4, 0.4);
    g.strokeStyle = shade(base, 0.45);
    g.globalAlpha = 0.5;
    for (let i = 0; i < 20; i++) {
      g.beginPath();
      let x = rnd() * w, y = rnd() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rnd() - 0.5) * 40;
        y += rnd() * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }, { repeat: [1, 1] });
}

export function crateTexture() {
  return make(128, 128, (g, w, h) => {
    g.fillStyle = "#a57a48";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = shade("#a57a48", 0.85 + rnd() * 0.3);
      g.fillRect(0, (i * h) / 4, w, h / 4 - 2);
    }
    noise(g, w, h, 600, ["#7d5a32", "#c49a66"], 1, 2, 0.4);
    g.strokeStyle = "#6b4a28";
    g.lineWidth = 12;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.beginPath();
    g.moveTo(10, 10);
    g.lineTo(w - 10, h - 10);
    g.stroke();
    g.strokeStyle = "#8c6538";
    g.lineWidth = 8;
    g.strokeRect(6, 6, w - 12, h - 12);
  });
}

export function adobeTexture() {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = "#cf9f72";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 6000, ["#c08f62", "#dbb086", "#b78456"], 1, 4, 0.4);
    g.globalAlpha = 0.25;
    g.strokeStyle = "#8f6440";
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      const x = rnd() * w, y = rnd() * h;
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 30, y + rnd() * 20);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, { repeat: [1, 1] });
}

export function logTexture() {
  return make(128, 256, (g, w, h) => {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x0 = (i * w) / n;
      const gr = g.createLinearGradient(x0, 0, x0 + w / n, 0);
      gr.addColorStop(0, "#4a3220");
      gr.addColorStop(0.5, "#8a6440");
      gr.addColorStop(1, "#4a3220");
      g.fillStyle = gr;
      g.fillRect(x0, 0, w / n, h);
    }
    noise(g, w, h, 900, ["#3a2616", "#a07a50"], 1, 3, 0.35);
  }, { repeat: [1, 1] });
}

export function canvasTexture(color = "#e6dcc4") {
  return make(128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 1500, [shade(color, 0.85), shade(color, 1.08)], 1, 2, 0.5);
    g.strokeStyle = shade(color, 0.7);
    g.globalAlpha = 0.4;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(rnd() * w, 0);
      g.lineTo(rnd() * w, h);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

export function woodFloorTexture() {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = "#6a4528";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = shade("#6a4528", 0.8 + rnd() * 0.4);
      g.fillRect(0, (i * h) / 8, w, h / 8 - 2);
      g.fillStyle = "#3b2414";
      g.fillRect(rnd() * w, (i * h) / 8, 2, h / 8);
    }
    noise(g, w, h, 1600, ["#4e321c", "#8a6038"], 1, 2, 0.35);
  }, { repeat: [10, 10] });
}

/* ------------------------------------------------------------ pictogram signs */

function signBase(g, w, h, paint = "#2b1c12", edge = "#d9b26a") {
  g.fillStyle = paint;
  g.fillRect(0, 0, w, h);
  noise(g, w, h, 900, [shade(paint, 0.7), shade(paint, 1.4)], 1, 3, 0.4);
  g.strokeStyle = edge;
  g.lineWidth = 8;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.lineWidth = 3;
  g.strokeRect(20, 20, w - 40, h - 40);
}

function star(g, cx, cy, r, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

const ICONS = {
  saloon(g, w, h, c) {
    // bottle and glass
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(w * 0.32, h * 0.78);
    g.lineTo(w * 0.32, h * 0.45);
    g.quadraticCurveTo(w * 0.32, h * 0.36, w * 0.38, h * 0.33);
    g.lineTo(w * 0.38, h * 0.2);
    g.lineTo(w * 0.44, h * 0.2);
    g.lineTo(w * 0.44, h * 0.33);
    g.quadraticCurveTo(w * 0.5, h * 0.36, w * 0.5, h * 0.45);
    g.lineTo(w * 0.5, h * 0.78);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(w * 0.56, h * 0.48);
    g.lineTo(w * 0.7, h * 0.48);
    g.lineTo(w * 0.67, h * 0.78);
    g.lineTo(w * 0.59, h * 0.78);
    g.closePath();
    g.fill();
  },
  bank(g, w, h, c) {
    g.fillStyle = c;
    for (let i = 0; i < 3; i++) {
      g.fillRect(w * 0.27, h * (0.62 - i * 0.12), w * 0.2, h * 0.09);
      g.fillRect(w * 0.53, h * (0.62 - i * 0.12) + h * 0.06, w * 0.2, h * 0.09);
    }
    g.beginPath();
    g.arc(w * 0.62, h * 0.32, h * 0.13, 0, Math.PI * 2);
    g.fill();
  },
  sheriff(g, w, h, c) {
    g.fillStyle = c;
    star(g, w / 2, h / 2, h * 0.32, 6);
    g.fill();
    g.fillStyle = "#2b1c12";
    g.beginPath();
    g.arc(w / 2, h / 2, h * 0.09, 0, Math.PI * 2);
    g.fill();
  },
  store(g, w, h, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(w * 0.36, h * 0.3);
    g.quadraticCurveTo(w * 0.5, h * 0.18, w * 0.64, h * 0.3);
    g.quadraticCurveTo(w * 0.74, h * 0.6, w * 0.64, h * 0.8);
    g.lineTo(w * 0.36, h * 0.8);
    g.quadraticCurveTo(w * 0.26, h * 0.6, w * 0.36, h * 0.3);
    g.fill();
    g.fillStyle = "#2b1c12";
    g.fillRect(w * 0.42, h * 0.27, w * 0.16, h * 0.04);
  },
  hotel(g, w, h, c) {
    g.fillStyle = c;
    g.fillRect(w * 0.25, h * 0.5, w * 0.5, h * 0.14);
    g.fillRect(w * 0.25, h * 0.36, w * 0.06, h * 0.42);
    g.fillRect(w * 0.69, h * 0.44, w * 0.06, h * 0.34);
    g.beginPath();
    g.ellipse(w * 0.38, h * 0.44, w * 0.06, h * 0.06, 0, 0, Math.PI * 2);
    g.fill();
  },
  stable(g, w, h, c) {
    g.strokeStyle = c;
    g.lineWidth = h * 0.09;
    g.beginPath();
    g.arc(w / 2, h * 0.45, h * 0.24, Math.PI * 0.85, Math.PI * 2.15);
    g.stroke();
  },
  gunsmith(g, w, h, c) {
    g.fillStyle = c;
    g.fillRect(w * 0.24, h * 0.36, w * 0.42, h * 0.1);
    g.fillRect(w * 0.5, h * 0.33, w * 0.16, h * 0.2);
    g.beginPath();
    g.moveTo(w * 0.58, h * 0.5);
    g.lineTo(w * 0.7, h * 0.5);
    g.lineTo(w * 0.76, h * 0.78);
    g.lineTo(w * 0.64, h * 0.78);
    g.closePath();
    g.fill();
  },
  barber(g, w, h) {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 3 === 0 ? "#c0392b" : i % 3 === 1 ? "#f4f0e6" : "#2e5d9e";
      g.beginPath();
      g.moveTo(w * 0.4, h * (0.2 + i * 0.1));
      g.lineTo(w * 0.6, h * (0.15 + i * 0.1));
      g.lineTo(w * 0.6, h * (0.25 + i * 0.1));
      g.lineTo(w * 0.4, h * (0.3 + i * 0.1));
      g.fill();
    }
  },
  undertaker(g, w, h, c) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(w * 0.44, h * 0.18);
    g.lineTo(w * 0.56, h * 0.18);
    g.lineTo(w * 0.62, h * 0.34);
    g.lineTo(w * 0.56, h * 0.84);
    g.lineTo(w * 0.44, h * 0.84);
    g.lineTo(w * 0.38, h * 0.34);
    g.closePath();
    g.fill();
  },
  church(g, w, h, c) {
    g.fillStyle = c;
    g.fillRect(w * 0.46, h * 0.18, w * 0.08, h * 0.64);
    g.fillRect(w * 0.34, h * 0.34, w * 0.32, h * 0.08);
  },
  station(g, w, h, c) {
    g.fillStyle = c;
    g.fillRect(w * 0.22, h * 0.4, w * 0.42, h * 0.24);
    g.fillRect(w * 0.56, h * 0.28, w * 0.18, h * 0.36);
    g.fillRect(w * 0.3, h * 0.26, w * 0.07, h * 0.14);
    for (const x of [0.3, 0.46, 0.64]) {
      g.beginPath();
      g.arc(w * x, h * 0.7, h * 0.07, 0, Math.PI * 2);
      g.fill();
    }
  },
  assay(g, w, h, c) {
    g.strokeStyle = c;
    g.lineWidth = h * 0.07;
    g.beginPath();
    g.moveTo(w * 0.32, h * 0.78);
    g.lineTo(w * 0.62, h * 0.32);
    g.stroke();
    g.beginPath();
    g.arc(w * 0.6, h * 0.5, h * 0.26, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  },
};

export function signTexture(kind) {
  const icon = ICONS[kind];
  return make(256, 128, (g, w, h) => {
    signBase(g, w, h, kind === "barber" ? "#3a2a1c" : kind === "church" ? "#e7dcc6" : "#2b1c12", "#d9b26a");
    if (icon) {
      // icon in a centred square
      g.save();
      g.translate((w - h) / 2, 0);
      icon(g, h, h, kind === "church" ? "#5a3b20" : "#e8c27a");
      g.restore();
      // ornament dots
      g.fillStyle = "#d9b26a";
      for (const x of [w * 0.16, w * 0.84]) {
        star(g, x, h / 2, 10, 5);
        g.fill();
      }
    }
  });
}

/** Wanted poster: aged paper, bordered portrait silhouette, bounty coins, bullet holes. */
export function posterTexture() {
  return make(128, 180, (g, w, h) => {
    g.fillStyle = "#e8d6a8";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 1800, ["#c9b07a", "#f3e6c2", "#b89a62"], 1, 3, 0.45);
    const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 110);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(90,60,20,0.45)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#5a3d1e";
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    // header bars instead of a word
    g.fillStyle = "#3c2814";
    g.fillRect(16, 16, w - 32, 12);
    g.fillRect(28, 32, w - 56, 5);
    // portrait
    g.fillStyle = "#cbb27c";
    g.fillRect(24, 44, w - 48, 74);
    g.fillStyle = "#3c2814";
    g.beginPath();
    g.ellipse(w / 2, 86, 16, 20, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(w / 2 - 30, 64, 60, 7);
    g.fillRect(w / 2 - 15, 50, 30, 16);
    g.beginPath();
    g.moveTo(w / 2 - 28, 118);
    g.quadraticCurveTo(w / 2, 96, w / 2 + 28, 118);
    g.fill();
    // bounty coins
    g.fillStyle = "#a8781e";
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(26 + i * 19, 136, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#3c2814";
    g.fillRect(20, 152, w - 40, 4);
    g.fillRect(34, 160, w - 68, 4);
    // bullet holes
    g.fillStyle = "#2a1c0c";
    for (const [x, y] of [[94, 58], [34, 104]]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/* ------------------------------------------------------------ fx sprites */
export function softDot() {
  return make(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.7)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

export function flashTexture() {
  return make(128, 128, (g) => {
    g.translate(64, 64);
    for (let i = 0; i < 9; i++) {
      g.rotate((Math.PI * 2) / 9 + 0.2);
      const gr = g.createLinearGradient(0, 0, 60, 0);
      gr.addColorStop(0, "rgba(255,250,220,1)");
      gr.addColorStop(0.4, "rgba(255,190,80,0.8)");
      gr.addColorStop(1, "rgba(255,120,20,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(58 * (0.6 + (i % 3) * 0.2), 0);
      g.lineTo(0, 5);
      g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 26);
    gr.addColorStop(0, "rgba(255,255,240,1)");
    gr.addColorStop(1, "rgba(255,200,90,0)");
    g.fillStyle = gr;
    g.fillRect(-30, -30, 60, 60);
  });
}

export function smokeTexture() {
  return make(64, 64, (g) => {
    for (let i = 0; i < 9; i++) {
      const x = 20 + rnd() * 24, y = 20 + rnd() * 24, r = 10 + rnd() * 14;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.45)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    }
  });
}

export function blobShadow() {
  return make(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, "rgba(0,0,0,0.55)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

export function markerTexture() {
  return make(64, 64, (g) => {
    g.fillStyle = "#ffd36a";
    g.strokeStyle = "#5a2e08";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(32, 58);
    g.lineTo(10, 24);
    g.lineTo(22, 24);
    g.lineTo(22, 6);
    g.lineTo(42, 6);
    g.lineTo(42, 24);
    g.lineTo(54, 24);
    g.closePath();
    g.stroke();
    g.fill();
  });
}

export function alertTexture() {
  return make(64, 64, (g) => {
    g.fillStyle = "#ffcf3a";
    g.strokeStyle = "#3a0a00";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(32, 4);
    g.lineTo(60, 58);
    g.lineTo(4, 58);
    g.closePath();
    g.stroke();
    g.fill();
    g.fillStyle = "#3a0a00";
    g.fillRect(28, 20, 8, 22);
    g.fillRect(28, 46, 8, 7);
  });
}
