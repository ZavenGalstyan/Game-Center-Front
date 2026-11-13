/**
 * Procedural canvas textures for the prison (no image assets, no text).
 * Every generator is seeded so a level always looks the same, and results
 * are cached for the lifetime of the world.
 */
import * as THREE from "three";

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

/** speckle noise + blotches over a base colour */
function grime(g, w, h, R, { base, speck = 0.18, blotch = 14, blotchA = 0.18, dark = "0,0,0", light = "255,255,255" }) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < blotch; i++) {
    const x = R() * w, y = R() * h, r = 20 + R() * w * 0.35;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = R() < 0.6 ? dark : light;
    gr.addColorStop(0, `rgba(${col},${blotchA * R()})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 255 * speck;
    d[i] = clampB(d[i] + n);
    d[i + 1] = clampB(d[i + 1] + n);
    d[i + 2] = clampB(d[i + 2] + n);
  }
  g.putImageData(img, 0, 0);
}
const clampB = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function drips(g, w, h, R, n, col = "30,22,14", from = 0) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, len = h * (0.15 + R() * 0.5), wd = 2 + R() * 6;
    const gr = g.createLinearGradient(0, from, 0, from + len);
    gr.addColorStop(0, `rgba(${col},${0.25 + R() * 0.3})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(x, from, wd, len);
  }
}

function cracks(g, w, h, R, n, col = "rgba(0,0,0,0.45)") {
  g.strokeStyle = col;
  for (let i = 0; i < n; i++) {
    let x = R() * w, y = R() * h;
    g.lineWidth = 0.6 + R() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (R() - 0.5) * 30;
      y += (R() - 0.3) * 26;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

/** lower wall band (painted dado) common to prison walls */
function band(g, w, h, col, y0) {
  g.fillStyle = col;
  g.fillRect(0, y0, w, h - y0);
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(0, y0 - 3, w, 3);
}

const WALLS = {
  concrete(R, w, h) {
    const [c, g] = canvas(w, h);
    grime(g, w, h, R, { base: "#7d7c76", speck: 0.22, blotch: 22, blotchA: 0.35 });
    // poured-concrete form lines
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = h * 0.25; y < h; y += h * 0.25) g.fillRect(0, y, w, 2);
    band(g, w, h, "rgba(52,64,58,0.92)", h * 0.7);
    grimeOver(g, w, h, R, 0.12);
    drips(g, w, h, R, 9);
    cracks(g, w, h, R, 4);
    return c;
  },
  panel(R, w, h) {
    const [c, g] = canvas(w, h);
    grime(g, w, h, R, { base: "#5d6a6e", speck: 0.12, blotch: 16, blotchA: 0.3 });
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 3;
    for (let x = 0; x <= w; x += w / 2) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, h * 0.62);
    g.lineTo(w, h * 0.62);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.08)";
    for (let x = 4; x < w; x += w / 2) g.fillRect(x, 0, 2, h);
    // rivets
    g.fillStyle = "rgba(20,20,20,0.6)";
    for (let x = 10; x < w; x += w / 2 - 20 + 20) for (let y = 12; y < h; y += 46) g.fillRect(x, y, 3, 3);
    band(g, w, h, "rgba(70,40,32,0.9)", h * 0.78);
    grimeOver(g, w, h, R, 0.1);
    drips(g, w, h, R, 6, "60,30,10");
    return c;
  },
  padded(R, w, h) {
    const [c, g] = canvas(w, h);
    grime(g, w, h, R, { base: "#b9b4a2", speck: 0.1, blotch: 18, blotchA: 0.35, dark: "60,50,30" });
    const cw = w / 3, ch = h / 5;
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 3; x++) {
        const gr = g.createRadialGradient(x * cw + cw / 2, y * ch + ch / 2, 2, x * cw + cw / 2, y * ch + ch / 2, cw * 0.7);
        gr.addColorStop(0, "rgba(255,255,255,0.12)");
        gr.addColorStop(1, "rgba(0,0,0,0.28)");
        g.fillStyle = gr;
        g.fillRect(x * cw, y * ch, cw, ch);
        g.fillStyle = "rgba(40,30,20,0.6)";
        g.fillRect(x * cw + cw / 2 - 2, y * ch - 2, 4, 4);
      }
    // scratches
    g.strokeStyle = "rgba(60,20,15,0.35)";
    for (let i = 0; i < 10; i++) {
      const x = R() * w, y = h * 0.3 + R() * h * 0.5;
      g.lineWidth = 1.4;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        g.moveTo(x + k * 5, y);
        g.lineTo(x + k * 5 + 8, y + 40 + R() * 30);
      }
      g.stroke();
    }
    drips(g, w, h, R, 4, "90,20,15");
    return c;
  },
  brick(R, w, h) {
    const [c, g] = canvas(w, h);
    g.fillStyle = "#2c2622";
    g.fillRect(0, 0, w, h);
    const bh = h / 16, bw = w / 4;
    for (let row = 0; row < 16; row++)
      for (let k = -1; k < 5; k++) {
        const x = k * bw + (row % 2 ? bw / 2 : 0);
        const v = 70 + R() * 40;
        g.fillStyle = `rgb(${v + 30},${v * 0.55},${v * 0.42})`;
        g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      }
    grimeOver(g, w, h, R, 0.2);
    drips(g, w, h, R, 8);
    cracks(g, w, h, R, 3);
    return c;
  },
  stone(R, w, h) {
    const [c, g] = canvas(w, h);
    g.fillStyle = "#1d211d";
    g.fillRect(0, 0, w, h);
    const rows = 7;
    for (let row = 0; row < rows; row++) {
      let x = -R() * 40;
      while (x < w) {
        const bw = 50 + R() * 70;
        const v = 60 + R() * 35;
        g.fillStyle = `rgb(${v * 0.9},${v},${v * 0.85})`;
        g.fillRect(x + 3, (row * h) / rows + 3, bw - 6, h / rows - 6);
        x += bw;
      }
    }
    grimeOver(g, w, h, R, 0.25);
    // moss / damp
    drips(g, w, h, R, 14, "20,40,20");
    g.fillStyle = "rgba(10,30,15,0.35)";
    g.fillRect(0, h * 0.85, w, h * 0.15);
    return c;
  },
  tile(R, w, h) {
    const [c, g] = canvas(w, h);
    g.fillStyle = "#6f7a74";
    g.fillRect(0, 0, w, h);
    const n = 8, s = w / n;
    for (let y = 0; y < h / s; y++)
      for (let x = 0; x < n; x++) {
        const v = 196 + R() * 30;
        g.fillStyle = y * s > h * 0.6 ? `rgb(${v * 0.55},${v * 0.75},${v * 0.68})` : `rgb(${v},${v},${v * 0.96})`;
        g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
        if (R() < 0.06) {
          g.fillStyle = "rgba(0,0,0,0.5)";
          g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
        }
      }
    grimeOver(g, w, h, R, 0.22);
    drips(g, w, h, R, 6, "80,15,10");
    cracks(g, w, h, R, 5);
    return c;
  },
};

function grimeOver(g, w, h, R, a) {
  for (let i = 0; i < 18; i++) {
    const x = R() * w, y = R() * h, r = 10 + R() * w * 0.3;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(20,16,10,${a * R() * 2})`);
    gr.addColorStop(1, "rgba(20,16,10,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  // darker toward the floor
  const gr = g.createLinearGradient(0, h * 0.75, 0, h);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, `rgba(0,0,0,${a * 2.2})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

const FLOORS = {
  concrete(R, s) {
    const [c, g] = canvas(s, s);
    grime(g, s, s, R, { base: "#55534d", speck: 0.2, blotch: 20, blotchA: 0.4 });
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, s, s);
    cracks(g, s, s, R, 3);
    return c;
  },
  tile(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#3b3d3b";
    g.fillRect(0, 0, s, s);
    const n = 4, t = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = (x + y) % 2 ? 150 + R() * 20 : 70 + R() * 15;
        g.fillStyle = `rgb(${v},${v * 1.02},${v * 0.98})`;
        g.fillRect(x * t + 1, y * t + 1, t - 2, t - 2);
      }
    grimeOver(g, s, s, R, 0.25);
    return c;
  },
  asphalt(R, s) {
    const [c, g] = canvas(s, s);
    grime(g, s, s, R, { base: "#3a3b3e", speck: 0.35, blotch: 20, blotchA: 0.35 });
    cracks(g, s, s, R, 5, "rgba(0,0,0,0.55)");
    return c;
  },
  wet(R, s) {
    const [c, g] = canvas(s, s);
    grime(g, s, s, R, { base: "#2f3532", speck: 0.22, blotch: 26, blotchA: 0.5, dark: "0,10,5" });
    cracks(g, s, s, R, 4);
    return c;
  },
};

const cache = new Map();
function tex(key, make, repeat = true) {
  if (cache.has(key)) return cache.get(key);
  const c = make();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

export function wallTexture(kind) {
  return tex(`wall:${kind}`, () => (WALLS[kind] || WALLS.concrete)(rng(kind.length * 977 + 3), 256, 432));
}
export function floorTexture(kind) {
  return tex(`floor:${kind}`, () => (FLOORS[kind] || FLOORS.concrete)(rng(kind.length * 131 + 7), 256));
}
export function ceilingTexture() {
  return tex("ceil", () => {
    const R = rng(55);
    const [c, g] = canvas(256, 256);
    grime(g, 256, 256, R, { base: "#3a3a38", speck: 0.18, blotch: 16, blotchA: 0.5 });
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    g.strokeRect(0, 0, 128, 256);
    return c;
  });
}

export function doorTexture(kind) {
  return tex(`door:${kind}`, () => {
    const R = rng(kind === "exit" ? 91 : kind === "gate" ? 37 : 13);
    const [c, g] = canvas(256, 320);
    const base = kind === "exit" ? "#3d4a3c" : kind === "gate" ? "#4a4740" : "#46505a";
    grime(g, 256, 320, R, { base, speck: 0.14, blotch: 12, blotchA: 0.35 });
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 6;
    g.strokeRect(8, 8, 240, 304);
    if (kind === "gate") {
      // hazard stripes along the bottom and vertical ribs
      for (let x = -40; x < 256; x += 36) {
        g.fillStyle = "#c9a227";
        g.beginPath();
        g.moveTo(x, 320);
        g.lineTo(x + 18, 320);
        g.lineTo(x + 46, 270);
        g.lineTo(x + 28, 270);
        g.fill();
      }
      g.fillStyle = "rgba(0,0,0,0.4)";
      for (let y = 20; y < 260; y += 22) g.fillRect(10, y, 236, 4);
    } else {
      // observation slot
      g.fillStyle = "#0b0d0e";
      g.fillRect(88, 60, 80, 36);
      g.strokeStyle = "rgba(160,170,180,0.5)";
      g.lineWidth = 2;
      g.strokeRect(88, 60, 80, 36);
      for (let x = 98; x < 168; x += 14) g.fillRect(x, 60, 3, 36);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(40, 140, 176, 6);
      g.fillRect(40, 220, 176, 6);
      if (kind === "exit") {
        // green arrow pictogram
        g.fillStyle = "rgba(90,220,120,0.85)";
        g.beginPath();
        g.moveTo(96, 170);
        g.lineTo(150, 170);
        g.lineTo(150, 152);
        g.lineTo(182, 182);
        g.lineTo(150, 212);
        g.lineTo(150, 194);
        g.lineTo(96, 194);
        g.fill();
      }
    }
    drips(g, 256, 320, R, 5, "70,35,15", 20);
    for (let y = 30; y < 300; y += 60)
      for (const x of [20, 236]) {
        g.fillStyle = "rgba(15,15,15,0.7)";
        g.fillRect(x - 3, y, 6, 6);
      }
    return c;
  }, false);
}

/** soft round glow used for item halos, muzzle flashes and light bulbs */
export function glowTexture() {
  return tex("glow", () => {
    const [c, g] = canvas(64, 64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.3, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }, false);
}
export function flashTexture() {
  return tex("flash", () => {
    const [c, g] = canvas(128, 128);
    g.translate(64, 64);
    for (let i = 0; i < 7; i++) {
      g.rotate((Math.PI * 2) / 7);
      const gr = g.createLinearGradient(0, 0, 60, 0);
      gr.addColorStop(0, "rgba(255,250,210,1)");
      gr.addColorStop(1, "rgba(255,170,60,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(62, 0);
      g.lineTo(0, 7);
      g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    gr.addColorStop(0, "rgba(255,255,230,1)");
    gr.addColorStop(1, "rgba(255,190,80,0)");
    g.fillStyle = gr;
    g.fillRect(-64, -64, 128, 128);
    return c;
  }, false);
}
export function bloodTexture() {
  return tex("blood", () => {
    const R = rng(4242);
    const [c, g] = canvas(128, 128);
    g.fillStyle = "rgba(80,4,4,0.95)";
    g.beginPath();
    g.arc(64, 64, 26, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, d = 20 + R() * 36, r = 3 + R() * 9;
      g.beginPath();
      g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }, false);
}
export function skinTexture(kind) {
  return tex(`skin:${kind}`, () => {
    const R = rng(kind.length * 311);
    const [c, g] = canvas(128, 128);
    const base = kind === "creature" ? "#5a2a26" : kind === "brute" ? "#6e6a5c" : "#8a8f74";
    grime(g, 128, 128, R, { base, speck: 0.3, blotch: 14, blotchA: 0.6, dark: kind === "creature" ? "30,0,0" : "40,20,10" });
    // veins
    g.strokeStyle = kind === "creature" ? "rgba(255,90,60,0.35)" : "rgba(40,50,80,0.45)";
    for (let i = 0; i < 9; i++) {
      let x = R() * 128, y = R() * 128;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (R() - 0.5) * 24;
        y += (R() - 0.5) * 24;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  });
}
export function clothTexture(kind) {
  return tex(`cloth:${kind}`, () => {
    const R = rng(kind.length * 71 + 1);
    const [c, g] = canvas(128, 128);
    const base = kind === "jumpsuit" ? "#b0561c" : kind === "rags" ? "#3a3530" : "#30343a";
    grime(g, 128, 128, R, { base, speck: 0.25, blotch: 16, blotchA: 0.6, dark: "40,5,0" });
    // blood stains
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(90,5,5,${0.3 + R() * 0.4})`;
      g.beginPath();
      g.arc(R() * 128, R() * 128, 4 + R() * 14, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
