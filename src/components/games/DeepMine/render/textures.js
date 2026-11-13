/**
 * Procedural canvas textures for the mine (no image assets, no text).
 * Every generator is seeded so a level always looks the same; results are
 * cached for the lifetime of the world.
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
const clampB = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function speckle(g, w, h, R, amt) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 255 * amt;
    d[i] = clampB(d[i] + n);
    d[i + 1] = clampB(d[i + 1] + n);
    d[i + 2] = clampB(d[i + 2] + n);
  }
  g.putImageData(img, 0, 0);
}
function blotches(g, w, h, R, n, col, a) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = 10 + R() * w * 0.3;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},${a * R()})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
}
function cracks(g, w, h, R, n, col = "rgba(0,0,0,0.5)") {
  g.strokeStyle = col;
  for (let i = 0; i < n; i++) {
    let x = R() * w, y = R() * h;
    g.lineWidth = 0.7 + R() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (R() - 0.5) * 34;
      y += (R() - 0.3) * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

/** rock face: layered strata, chisel marks, mineral veins */
const ROCK = {
  sand: { base: [118, 96, 72], vein: "200,170,110" },
  brown: { base: [92, 72, 56], vein: "170,120,70" },
  grey: { base: [86, 86, 90], vein: "150,150,160" },
  dark: { base: [52, 50, 56], vein: "120,90,90" },
  blue: { base: [60, 70, 92], vein: "110,200,255" },
};
function rockCanvas(kind, R, w, h) {
  const [c, g] = canvas(w, h);
  const P = ROCK[kind] || ROCK.brown;
  const [br, bg, bb] = P.base;
  // strata bands
  let y = 0;
  while (y < h) {
    const bh = 14 + R() * 40;
    const v = 0.75 + R() * 0.45;
    g.fillStyle = `rgb(${br * v},${bg * v},${bb * v})`;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + (R() - 0.5) * 10);
    g.lineTo(w, y + bh);
    for (let x = w; x >= 0; x -= 32) g.lineTo(x, y + bh + (R() - 0.5) * 10);
    g.fill();
    y += bh;
  }
  // boulders / facets
  for (let i = 0; i < 70; i++) {
    const x = R() * w, yy = R() * h, r = 6 + R() * 26;
    const light = R() < 0.5;
    g.fillStyle = light ? "rgba(255,240,220,0.07)" : "rgba(0,0,0,0.18)";
    g.beginPath();
    g.moveTo(x, yy - r);
    g.lineTo(x + r * (0.6 + R() * 0.5), yy);
    g.lineTo(x, yy + r * (0.5 + R() * 0.5));
    g.lineTo(x - r * (0.6 + R() * 0.5), yy);
    g.fill();
  }
  // pick marks
  g.strokeStyle = "rgba(0,0,0,0.3)";
  for (let i = 0; i < 40; i++) {
    const x = R() * w, yy = R() * h;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, yy);
    g.lineTo(x + 6 + R() * 10, yy + 2 + R() * 4);
    g.stroke();
  }
  // mineral veins
  g.strokeStyle = `rgba(${P.vein},0.45)`;
  for (let i = 0; i < 4; i++) {
    let x = R() * w, yy = R() * h;
    g.lineWidth = 1 + R() * 2;
    g.beginPath();
    g.moveTo(x, yy);
    for (let k = 0; k < 10; k++) {
      x += (R() - 0.3) * 30;
      yy += (R() - 0.5) * 20;
      g.lineTo(x, yy);
    }
    g.stroke();
  }
  cracks(g, w, h, R, 8);
  blotches(g, w, h, R, 14, "10,6,4", 0.4);
  // damp streaks
  for (let i = 0; i < 8; i++) {
    const x = R() * w, len = h * (0.2 + R() * 0.5);
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, "rgba(10,14,12,0.35)");
    gr.addColorStop(1, "rgba(10,14,12,0)");
    g.fillStyle = gr;
    g.fillRect(x, 0, 3 + R() * 6, len);
  }
  speckle(g, w, h, R, 0.16);
  return c;
}

/** lab walls: white tiles, grime and old stains */
function tileWall(R, w, h) {
  const [c, g] = canvas(w, h);
  g.fillStyle = "#5c6664";
  g.fillRect(0, 0, w, h);
  const s = w / 8;
  for (let y = 0; y < h / s; y++)
    for (let x = 0; x < 8; x++) {
      const v = 190 + R() * 30;
      g.fillStyle = y * s > h * 0.62 ? `rgb(${v * 0.45},${v * 0.6},${v * 0.58})` : `rgb(${v},${v},${v * 0.97})`;
      g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
      if (R() < 0.05) {
        g.fillStyle = "rgba(0,0,0,0.55)";
        g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
      }
    }
  blotches(g, w, h, R, 18, "40,30,10", 0.4);
  for (let i = 0; i < 6; i++) {
    const x = R() * w, len = h * (0.15 + R() * 0.4);
    const gr = g.createLinearGradient(0, h * 0.2, 0, h * 0.2 + len);
    gr.addColorStop(0, "rgba(60,90,40,0.45)");
    gr.addColorStop(1, "rgba(60,90,40,0)");
    g.fillStyle = gr;
    g.fillRect(x, h * 0.2, 4 + R() * 6, len);
  }
  cracks(g, w, h, R, 6);
  return c;
}

const FLOORS = {
  dirt(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#4a3c2e";
    g.fillRect(0, 0, s, s);
    blotches(g, s, s, R, 20, "20,14,8", 0.5);
    blotches(g, s, s, R, 10, "120,96,70", 0.25);
    for (let i = 0; i < 160; i++) {
      const v = 60 + R() * 70;
      g.fillStyle = `rgb(${v},${v * 0.85},${v * 0.7})`;
      g.beginPath();
      g.arc(R() * s, R() * s, 0.8 + R() * 2.4, 0, Math.PI * 2);
      g.fill();
    }
    speckle(g, s, s, R, 0.18);
    return c;
  },
  gravel(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#3c3834";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      const v = 50 + R() * 90;
      g.fillStyle = `rgb(${v},${v * 0.95},${v * 0.9})`;
      g.beginPath();
      g.ellipse(R() * s, R() * s, 1 + R() * 3.5, 1 + R() * 2.5, R() * 3, 0, Math.PI * 2);
      g.fill();
    }
    blotches(g, s, s, R, 14, "10,8,6", 0.5);
    speckle(g, s, s, R, 0.12);
    return c;
  },
  concrete(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#585652";
    g.fillRect(0, 0, s, s);
    blotches(g, s, s, R, 22, "10,10,10", 0.45);
    g.strokeStyle = "rgba(0,0,0,0.4)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, s, s);
    // yellow safety stripe on one edge
    g.fillStyle = "rgba(200,160,30,0.6)";
    g.fillRect(0, s - 10, s, 6);
    cracks(g, s, s, R, 4);
    speckle(g, s, s, R, 0.18);
    return c;
  },
  planks(R, s) {
    const [c, g] = canvas(s, s);
    for (let y = 0; y < s; y += 32) {
      const v = 56 + R() * 24;
      g.fillStyle = `rgb(${v * 1.05},${v * 0.72},${v * 0.48})`;
      g.fillRect(0, y, s, 32);
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(0, y + 30, s, 2);
      g.fillRect(R() * s, y, 2, 30);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = "rgba(30,15,5,0.3)";
        g.fillRect(R() * s, y + 6 + R() * 20, 40 + R() * 80, 1.5);
      }
    }
    blotches(g, s, s, R, 14, "10,6,2", 0.5);
    return c;
  },
  metal(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#4a4c50";
    g.fillRect(0, 0, s, s);
    // diamond plate
    g.fillStyle = "rgba(255,255,255,0.12)";
    for (let y = 8; y < s; y += 16)
      for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) {
        g.save();
        g.translate(x, y);
        g.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
        g.fillRect(-5, -1.2, 10, 2.4);
        g.restore();
      }
    blotches(g, s, s, R, 20, "90,40,10", 0.45); // rust
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 3;
    g.strokeRect(1, 1, s - 2, s - 2);
    speckle(g, s, s, R, 0.1);
    return c;
  },
  tile(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#2c3030";
    g.fillRect(0, 0, s, s);
    const n = 4, t = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = (x + y) % 2 ? 140 + R() * 20 : 110 + R() * 15;
        g.fillStyle = `rgb(${v * 0.92},${v},${v * 0.98})`;
        g.fillRect(x * t + 1.5, y * t + 1.5, t - 3, t - 3);
      }
    blotches(g, s, s, R, 16, "30,20,10", 0.45);
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
  return tex(`wall:${kind}`, () => (kind === "tile" ? tileWall(rng(91), 512, 432) : rockCanvas(kind, rng(kind.length * 977 + 3), 512, 432)));
}
export function floorTexture(kind) {
  return tex(`floor:${kind}`, () => (FLOORS[kind] || FLOORS.dirt)(rng(kind.length * 131 + 7), 256));
}
export function ceilingTexture(kind) {
  return tex(`ceil:${kind}`, () => {
    if (kind === "tile") {
      const [c, g] = canvas(256, 256);
      g.fillStyle = "#3a403e";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.lineWidth = 3;
      for (let x = 0; x <= 256; x += 64) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 256);
        g.moveTo(0, x);
        g.lineTo(256, x);
        g.stroke();
      }
      blotches(g, 256, 256, rng(4), 14, "10,10,6", 0.5);
      return c;
    }
    const c = rockCanvas(kind, rng(kind.length * 17 + 99), 256, 256);
    const g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 0, 256, 256);
    return c;
  });
}
/** rough-sawn timber for supports, doors and props */
export function timberTexture() {
  return tex("timber", () => {
    const R = rng(77);
    const [c, g] = canvas(128, 256);
    g.fillStyle = "#5a3e26";
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 60; i++) {
      const x = R() * 128;
      g.strokeStyle = `rgba(${R() < 0.5 ? "30,18,8" : "120,84,50"},${0.25 + R() * 0.3})`;
      g.lineWidth = 0.6 + R() * 1.6;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (R() - 0.5) * 12, 80, x + (R() - 0.5) * 12, 170, x + (R() - 0.5) * 8, 256);
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const x = 20 + R() * 88, y = R() * 256;
      g.fillStyle = "rgba(30,16,6,0.6)";
      g.beginPath();
      g.ellipse(x, y, 5, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
    blotches(g, 128, 256, R, 10, "10,6,2", 0.5);
    speckle(g, 128, 256, R, 0.12);
    return c;
  });
}
/** rusty painted metal (carts, generators, machinery) */
export function rustTexture(col = "#3a5a4a") {
  return tex(`rust:${col}`, () => {
    const R = rng(col.length * 13 + col.charCodeAt(2));
    const [c, g] = canvas(128, 128);
    g.fillStyle = col;
    g.fillRect(0, 0, 128, 128);
    blotches(g, 128, 128, R, 26, "110,50,15", 0.7);
    blotches(g, 128, 128, R, 10, "20,10,5", 0.5);
    g.fillStyle = "rgba(20,12,6,0.6)";
    for (let i = 0; i < 12; i++) g.fillRect(R() * 128, R() * 128, 2.5, 2.5);
    speckle(g, 128, 128, R, 0.2);
    return c;
  });
}

export function doorTexture(kind) {
  return tex(
    `door:${kind}`,
    () => {
      const R = rng(kind.length * 31);
      const [c, g] = canvas(256, 320);
      if (kind === "door") {
        for (let x = 0; x < 256; x += 32) {
          const v = 60 + R() * 26;
          g.fillStyle = `rgb(${v * 1.1},${v * 0.75},${v * 0.5})`;
          g.fillRect(x, 0, 32, 320);
          g.fillStyle = "rgba(0,0,0,0.45)";
          g.fillRect(x, 0, 2, 320);
        }
        g.fillStyle = "#3a3632";
        for (const y of [40, 260]) g.fillRect(0, y, 256, 18);
        g.save();
        g.translate(128, 160);
        g.rotate(-0.75);
        g.fillRect(-170, -9, 340, 18);
        g.restore();
      } else if (kind === "gate" || kind === "exit") {
        // riveted blast door with hazard stripes
        g.fillStyle = kind === "exit" ? "#3a4a3e" : "#4a4a48";
        g.fillRect(0, 0, 256, 320);
        blotches(g, 256, 320, R, 30, "110,50,15", 0.55);
        for (let x = -40; x < 256; x += 36) {
          g.fillStyle = "#c9a227";
          g.beginPath();
          g.moveTo(x, 320);
          g.lineTo(x + 18, 320);
          g.lineTo(x + 46, 272);
          g.lineTo(x + 28, 272);
          g.fill();
        }
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.fillRect(0, 140, 256, 6);
        g.fillStyle = "rgba(20,20,20,0.8)";
        for (let x = 14; x < 256; x += 32)
          for (const y of [14, 126, 156, 258]) g.fillRect(x, y, 5, 5);
        if (kind === "exit") {
          g.fillStyle = "rgba(120,255,160,0.95)";
          g.beginPath();
          g.moveTo(128, 50);
          g.lineTo(168, 95);
          g.lineTo(144, 95);
          g.lineTo(144, 125);
          g.lineTo(112, 125);
          g.lineTo(112, 95);
          g.lineTo(88, 95);
          g.fill();
        }
      } else {
        // locked mine gate: dark backing, iron bars
        g.fillStyle = "#121010";
        g.fillRect(0, 0, 256, 320);
        g.fillStyle = "#5a504a";
        for (let x = 12; x < 256; x += 28) g.fillRect(x, 0, 9, 320);
        for (const y of [30, 160, 290]) g.fillRect(0, y, 256, 12);
        blotches(g, 256, 320, R, 20, "110,50,15", 0.6);
      }
      speckle(g, 256, 320, R, 0.1);
      return c;
    },
    false,
  );
}

export function glowTexture() {
  return tex(
    "glow",
    () => {
      const [c, g] = canvas(64, 64);
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.3, "rgba(255,255,255,0.55)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return c;
    },
    false,
  );
}
export function flashTexture() {
  return tex(
    "flash",
    () => {
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
    },
    false,
  );
}
export function splatTexture() {
  return tex(
    "splat",
    () => {
      const R = rng(4242);
      const [c, g] = canvas(128, 128);
      g.fillStyle = "rgba(60,30,12,0.95)";
      g.beginPath();
      g.arc(64, 64, 24, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 16; i++) {
        const a = R() * Math.PI * 2, d = 20 + R() * 36, r = 3 + R() * 9;
        g.beginPath();
        g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, Math.PI * 2);
        g.fill();
      }
      return c;
    },
    false,
  );
}
export function ringTexture() {
  return tex(
    "ring",
    () => {
      const [c, g] = canvas(128, 128);
      const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(0.7, "rgba(255,255,255,0.35)");
      gr.addColorStop(0.9, "rgba(255,255,255,1)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return c;
    },
    false,
  );
}
/** creature skin: grey-green flesh with crystal-dust blotches */
export function skinTexture(kind) {
  return tex(`skin:${kind}`, () => {
    const R = rng(kind.length * 311);
    const [c, g] = canvas(128, 128);
    g.fillStyle = kind === "crawler" ? "#8a8274" : kind === "brute" ? "#5a5650" : "#7a8068";
    g.fillRect(0, 0, 128, 128);
    blotches(g, 128, 128, R, 16, "30,20,20", 0.6);
    blotches(g, 128, 128, R, 8, kind === "brute" ? "255,110,60" : "90,200,255", 0.35);
    g.strokeStyle = "rgba(40,60,90,0.45)";
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
    speckle(g, 128, 128, R, 0.25);
    return c;
  });
}
/** torn miner's overalls */
export function clothTexture(kind) {
  return tex(`cloth:${kind}`, () => {
    const R = rng(kind.length * 71 + 1);
    const [c, g] = canvas(128, 128);
    g.fillStyle = kind === "overalls" ? "#3a4a66" : "#5a4a36";
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 4) {
      g.fillStyle = "rgba(255,255,255,0.03)";
      g.fillRect(0, y, 128, 1);
    }
    blotches(g, 128, 128, R, 22, "20,14,8", 0.75);
    // reflective strip
    if (kind === "overalls") {
      g.fillStyle = "rgba(200,190,120,0.55)";
      g.fillRect(0, 60, 128, 8);
    }
    speckle(g, 128, 128, R, 0.2);
    return c;
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
