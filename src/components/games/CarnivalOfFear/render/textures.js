/**
 * Procedural canvas textures for the carnival (no image assets, no text).
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
const clampB = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** speckle noise + soft blotches */
function grime(g, w, h, R, { speck = 0.14, blotch = 14, blotchA = 0.25, dark = "10,6,4" } = {}) {
  for (let i = 0; i < blotch; i++) {
    const x = R() * w, y = R() * h, r = 20 + R() * w * 0.35;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${dark},${blotchA * R()})`);
    gr.addColorStop(1, `rgba(${dark},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  if (speck > 0) {
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
}
function floorShade(g, w, h, a) {
  const gr = g.createLinearGradient(0, h * 0.72, 0, h);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
function drips(g, w, h, R, n, col = "30,10,8") {
  for (let i = 0; i < n; i++) {
    const x = R() * w, len = h * (0.1 + R() * 0.4), wd = 2 + R() * 5;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, `rgba(${col},${0.25 + R() * 0.3})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(x, 0, wd, len);
  }
}
function star(g, x, y, r, n = 5, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
/** a simple painted clown face (poster art) */
function clownFace(g, x, y, s, R) {
  g.fillStyle = "#efe6d8";
  g.beginPath();
  g.ellipse(x, y, s * 0.42, s * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ["#e0402a", "#3a8ae0", "#9a3ae0", "#e0b02a"][Math.floor(R() * 4)];
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(x + sx * s * 0.42, y - s * 0.18, s * 0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#111";
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(x + sx * s * 0.2, y - s * 0.28);
    g.lineTo(x + sx * s * 0.08, y - s * 0.05);
    g.lineTo(x + sx * s * 0.28, y - s * 0.05);
    g.fill();
  }
  g.fillStyle = "#d0201a";
  g.beginPath();
  g.arc(x, y + s * 0.03, s * 0.08, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#a0101a";
  g.lineWidth = s * 0.06;
  g.beginPath();
  g.arc(x, y + s * 0.05, s * 0.26, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
}

const WALLS = {
  /** tall painted carnival boarding (outdoor) */
  fence(R, w, h) {
    const [c, g] = canvas(w, h);
    const cols = ["#5a1f2e", "#2a2450", "#5a3a18", "#1f4048"];
    const n = 32, bw = w / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[(Math.floor(i / 3) + Math.floor(R() * 2)) % cols.length];
      g.fillRect(i * bw, 0, bw, h);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(i * bw, 0, 2, h);
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.fillRect(i * bw + 3, 0, 2, h);
    }
    // gold trim band + pennant zig-zag
    g.fillStyle = "#b08a2a";
    g.fillRect(0, h * 0.06, w, h * 0.025);
    g.fillRect(0, h * 0.62, w, h * 0.02);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = ["#d8312a", "#e8c23a", "#3a6ad8", "#9a3ad8"][(x / 32) % 4];
      g.beginPath();
      g.moveTo(x, h * 0.085);
      g.lineTo(x + 32, h * 0.085);
      g.lineTo(x + 16, h * 0.16);
      g.fill();
    }
    // a poster
    const px = w * 0.125, py = h * 0.3;
    g.fillStyle = "#e8d8b0";
    g.fillRect(px - 50, py - 64, 100, 128);
    g.fillStyle = "#c8301f";
    g.fillRect(px - 46, py - 60, 92, 18);
    g.fillRect(px - 46, py + 44, 92, 16);
    clownFace(g, px, py + 2, 70, R);
    g.fillStyle = "#e8c23a";
    star(g, px - 34, py - 51, 6);
    star(g, px + 34, py - 51, 6);
    grime(g, w, h, R, { speck: 0.12, blotch: 18, blotchA: 0.45 });
    drips(g, w, h, R, 6);
    floorShade(g, w, h, 0.6);
    return c;
  },
  /** wooden ticket-hall boards with gold stripes */
  boards(R, w, h) {
    const [c, g] = canvas(w, h);
    for (let y = 0; y < h; y += 24) {
      const v = 70 + R() * 30;
      g.fillStyle = `rgb(${v * 1.15},${v * 0.6},${v * 0.42})`;
      g.fillRect(0, y, w, 24);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(0, y + 22, w, 2);
      for (let k = 0; k < 3; k++) {
        g.fillStyle = "rgba(40,20,10,0.25)";
        g.fillRect(R() * w, y + 4 + R() * 14, 30 + R() * 60, 1.5);
      }
    }
    // wainscot
    g.fillStyle = "#4a1420";
    g.fillRect(0, h * 0.68, w, h * 0.32);
    g.fillStyle = "#c09a3a";
    g.fillRect(0, h * 0.68, w, 5);
    for (let x = 16; x < w; x += 64) {
      g.strokeStyle = "rgba(200,160,70,0.5)";
      g.lineWidth = 2;
      g.strokeRect(x, h * 0.72, 40, h * 0.22);
    }
    // faded poster
    const px = w * 0.625, py = h * 0.36;
    g.fillStyle = "#d8c8a0";
    g.fillRect(px - 44, py - 56, 88, 112);
    g.fillStyle = "#3a6ad8";
    g.fillRect(px - 40, py - 52, 80, 14);
    clownFace(g, px, py + 6, 60, R);
    grime(g, w, h, R, { speck: 0.1, blotch: 16, blotchA: 0.5 });
    floorShade(g, w, h, 0.5);
    return c;
  },
  /** mirror panels: silvery glass with ghostly reflected shapes */
  mirror(R, w, h) {
    const [c, g] = canvas(w, h);
    const pw = w / 4;
    for (let k = 0; k < 4; k++) {
      g.save();
      g.translate(k * pw, 0);
      mirrorPanel(g, R, pw, h, k);
      g.restore();
    }
    grime(g, w, h, R, { speck: 0.05, blotch: 14, blotchA: 0.3 });
    return c;
  },
  /** red and cream circus canvas */
  canvas(R, w, h) {
    const [c, g] = canvas(w, h);
    const n = 6, sw = w / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? "#e8dcc0" : "#a8201c";
      g.fillRect(i * sw, 0, sw, h);
    }
    // folds
    for (let i = 0; i < n * 2; i++) {
      const x = (i + 0.5) * (sw / 2);
      const gr = g.createLinearGradient(x - sw / 4, 0, x + sw / 4, 0);
      gr.addColorStop(0, "rgba(0,0,0,0)");
      gr.addColorStop(0.5, "rgba(0,0,0,0.18)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - sw / 4, 0, sw / 2, h);
    }
    g.fillStyle = "#e8c23a";
    g.fillRect(0, h * 0.82, w, 6);
    for (let x = 12; x < w; x += 42) star(g, x, h * 0.9, 8);
    grime(g, w, h, R, { speck: 0.08, blotch: 20, blotchA: 0.45 });
    drips(g, w, h, R, 8, "40,8,6");
    floorShade(g, w, h, 0.5);
    return c;
  },
  /** dark arcade walls with neon trim */
  arcade(R, w, h) {
    const [c, g] = canvas(w, h);
    g.fillStyle = "#14101e";
    g.fillRect(0, 0, w, h);
    // geometric 80s pattern
    for (let i = 0; i < 26; i++) {
      g.fillStyle = ["rgba(255,59,208,0.25)", "rgba(59,208,255,0.25)", "rgba(255,224,59,0.2)"][i % 3];
      const x = R() * w, y = R() * h * 0.6;
      if (i % 2) g.fillRect(x, y, 14 + R() * 20, 4);
      else {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 14, y + 22);
        g.lineTo(x - 10, y + 20);
        g.fill();
      }
    }
    for (const [y, col] of [[h * 0.66, "#ff3bd0"], [h * 0.7, "#3bd0ff"]]) {
      g.fillStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 12;
      g.fillRect(0, y, w, 4);
    }
    g.shadowBlur = 0;
    g.fillStyle = "#0a0812";
    g.fillRect(0, h * 0.72, w, h * 0.28);
    grime(g, w, h, R, { speck: 0.06, blotch: 10, blotchA: 0.4 });
    return c;
  },
  /** funhouse: dizzy stripes, swirls and polka dots */
  funhouse(R, w, h) {
    const [c, g] = canvas(w, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(0.5);
    for (let i = -20; i < 20; i++) {
      g.fillStyle = ["#7a2a8a", "#e8c23a", "#2a8a6a", "#d8402a"][(i + 40) % 4];
      g.fillRect(i * 26, -h, 26, h * 2);
    }
    g.restore();
    // swirls
    for (let k = 0; k < 2; k++) {
      const x0 = w * (0.3 + k * 0.4), y0 = h * (0.3 + k * 0.2);
      g.strokeStyle = "rgba(10,6,14,0.55)";
      g.lineWidth = 6;
      g.beginPath();
      for (let a = 0; a < 18; a += 0.2) g.lineTo(x0 + Math.cos(a) * a * 3.2, y0 + Math.sin(a) * a * 3.2);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.25)";
    for (let i = 0; i < 30; i++) {
      g.beginPath();
      g.arc(R() * w, R() * h, 3 + R() * 6, 0, Math.PI * 2);
      g.fill();
    }
    // big painted grin
    g.fillStyle = "#1a0a12";
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.5, w * 0.3, h * 0.08, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = "#efe6d8";
    for (let i = -4; i <= 4; i++) g.fillRect(w * 0.5 + i * 14 - 5, h * 0.5, 10, 12);
    grime(g, w, h, R, { speck: 0.1, blotch: 22, blotchA: 0.5 });
    floorShade(g, w, h, 0.55);
    return c;
  },
  /** backstage velvet curtains */
  curtain(R, w, h) {
    const [c, g] = canvas(w, h);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w, ww = w / n;
      const gr = g.createLinearGradient(x, 0, x + ww, 0);
      gr.addColorStop(0, "#3a0608");
      gr.addColorStop(0.5, "#8a1418");
      gr.addColorStop(1, "#3a0608");
      g.fillStyle = gr;
      g.fillRect(x, 0, ww, h);
    }
    g.fillStyle = "#b08a2a";
    g.fillRect(0, 0, w, 10);
    for (let x = 6; x < w; x += 20) {
      g.beginPath();
      g.arc(x, 14, 5, 0, Math.PI * 2);
      g.fill();
    }
    grime(g, w, h, R, { speck: 0.08, blotch: 22, blotchA: 0.55 });
    floorShade(g, w, h, 0.65);
    return c;
  },
  /** the king's arena: royal purple and gold diamonds */
  royal(R, w, h) {
    const [c, g] = canvas(w, h);
    g.fillStyle = "#2a0e3a";
    g.fillRect(0, 0, w, h);
    const s = 48;
    for (let y = 0; y < h + s; y += s)
      for (let x = (y / s) % 2 ? s / 2 : 0; x < w + s; x += s) {
        g.fillStyle = (x + y) % (s * 2) ? "#4a1a5a" : "#3a1248";
        g.beginPath();
        g.moveTo(x, y - s / 2);
        g.lineTo(x + s / 2, y);
        g.lineTo(x, y + s / 2);
        g.lineTo(x - s / 2, y);
        g.fill();
      }
    g.fillStyle = "#c8a03a";
    g.fillRect(0, h * 0.78, w, 8);
    for (let x = 16; x < w; x += 48) {
      g.beginPath();
      g.moveTo(x - 10, h * 0.78);
      g.lineTo(x, h * 0.74);
      g.lineTo(x + 10, h * 0.78);
      g.fill();
    }
    grime(g, w, h, R, { speck: 0.08, blotch: 20, blotchA: 0.5 });
    drips(g, w, h, R, 6, "60,6,10");
    floorShade(g, w, h, 0.6);
    return c;
  },
};

function mirrorPanel(g, R, w, h, k) {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, "#8a96bc");
  gr.addColorStop(0.45, "#d0d8f0");
  gr.addColorStop(0.55, "#a0acd0");
  gr.addColorStop(1, "#5e6890");
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // one distorted figure per panel (a stretched or squashed silhouette)
  const sx = [0.7, 1.5, 1, 0.55][k], sy = [1.4, 0.7, 1.1, 1.6][k];
  g.fillStyle = `rgba(30,22,50,${0.22 + R() * 0.15})`;
  g.beginPath();
  g.ellipse(w / 2, h * 0.34, 22 * sx, 26 * sy, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(w / 2, h * 0.66, 36 * sx, 70 * sy, 0, 0, Math.PI * 2);
  g.fill();
  if (k === 2) {
    // a grinning reflection that isn't yours
    g.fillStyle = "rgba(255,240,120,0.5)";
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(w / 2 + s * 8, h * 0.32, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(200,30,40,0.45)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(w / 2, h * 0.34, 14, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 2; i++) {
    const x = R() * w;
    const sg = g.createLinearGradient(x - 20, 0, x + 20, 0);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, "rgba(255,255,255,0.2)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sg;
    g.fillRect(x - 20, 0, 40, h);
  }
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "#8a6a2a";
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.strokeStyle = "#e8c860";
  g.lineWidth = 2;
  g.strokeRect(10, 10, w - 20, h - 20);
}

const FLOORS = {
  cobble(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#1e1a20";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 24)
      for (let x = (y / 24) % 2 ? 12 : 0; x < s + 24; x += 24) {
        const v = 55 + R() * 30;
        g.fillStyle = `rgb(${v},${v * 0.92},${v * 1.02})`;
        g.beginPath();
        g.ellipse(x, y + 12, 10.5, 10, R(), 0, Math.PI * 2);
        g.fill();
      }
    grime(g, s, s, R, { speck: 0.18, blotch: 18, blotchA: 0.5 });
    // popcorn & confetti litter
    for (let i = 0; i < 20; i++) {
      g.fillStyle = ["#e8d8a0", "#d8402a", "#3a8ae0", "#e8c23a"][i % 4];
      g.fillRect(R() * s, R() * s, 2 + R() * 3, 2 + R() * 3);
    }
    return c;
  },
  planks(R, s) {
    const [c, g] = canvas(s, s);
    for (let y = 0; y < s; y += 32) {
      const v = 60 + R() * 26;
      g.fillStyle = `rgb(${v * 1.05},${v * 0.66},${v * 0.42})`;
      g.fillRect(0, y, s, 32);
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(0, y + 30, s, 2);
      g.fillRect(R() * s, y, 2, 30);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = "rgba(30,15,5,0.3)";
        g.fillRect(R() * s, y + 6 + R() * 20, 40 + R() * 80, 1.5);
      }
    }
    grime(g, s, s, R, { speck: 0.1, blotch: 14, blotchA: 0.45 });
    return c;
  },
  checker(R, s) {
    const [c, g] = canvas(s, s);
    const n = 4, t = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? "#e0d8d0" : "#1a1420";
        g.fillRect(x * t, y * t, t, t);
      }
    grime(g, s, s, R, { speck: 0.1, blotch: 14, blotchA: 0.5 });
    return c;
  },
  sawdust(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#6a4a2a";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 90 + R() * 80;
      g.fillStyle = `rgba(${v + 40},${v},${v * 0.55},0.6)`;
      g.fillRect(R() * s, R() * s, 1 + R() * 3, 1);
    }
    grime(g, s, s, R, { speck: 0.12, blotch: 20, blotchA: 0.45 });
    return c;
  },
  carpet(R, s) {
    const [c, g] = canvas(s, s);
    g.fillStyle = "#120a22";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = ["#ff3bd0", "#3bd0ff", "#ffe03b", "#7a3bff"][i % 4];
      g.lineWidth = 2;
      const x = R() * s, y = R() * s, r = 4 + R() * 10;
      if (i % 3 === 0) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.stroke();
      } else if (i % 3 === 1) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + r * 1.5, y + r);
        g.lineTo(x - r, y + r * 1.4);
        g.closePath();
        g.stroke();
      } else {
        g.beginPath();
        g.moveTo(x - r, y);
        for (let k = 0; k < 4; k++) g.lineTo(x - r + k * r * 0.7, y + (k % 2 ? r * 0.6 : 0));
        g.stroke();
      }
    }
    grime(g, s, s, R, { speck: 0.08, blotch: 14, blotchA: 0.5 });
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
  return tex(`wall:${kind}`, () => (WALLS[kind] || WALLS.fence)(rng(kind.length * 977 + 3), 1024, 432));
}
export function floorTexture(kind) {
  return tex(`floor:${kind}`, () => (FLOORS[kind] || FLOORS.cobble)(rng(kind.length * 131 + 7), 256));
}
export function ceilingTexture(tent) {
  return tex(`ceil:${tent ? 1 : 0}`, () => {
    const R = rng(55);
    const [c, g] = canvas(256, 256);
    if (tent) {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#5a1210" : "#3a2a24";
        g.fillRect(i * 32, 0, 32, 256);
      }
      grime(g, 256, 256, R, { speck: 0.1, blotch: 20, blotchA: 0.5 });
    } else {
      g.fillStyle = "#1c1618";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(0,0,0,0.6)";
      g.lineWidth = 3;
      for (let x = 0; x <= 256; x += 64) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 256);
        g.stroke();
      }
      grime(g, 256, 256, R, { speck: 0.14, blotch: 16, blotchA: 0.5 });
    }
    return c;
  });
}

export function doorTexture(kind) {
  return tex(
    `door:${kind}`,
    () => {
      const R = rng(kind === "exit" ? 91 : kind === "gate" ? 37 : 13);
      const [c, g] = canvas(256, 320);
      if (kind === "door") {
        // painted wooden door with a star
        for (let x = 0; x < 256; x += 32) {
          const v = 70 + R() * 30;
          g.fillStyle = `rgb(${v * 1.3},${v * 0.5},${v * 0.6})`;
          g.fillRect(x, 0, 32, 320);
          g.fillStyle = "rgba(0,0,0,0.4)";
          g.fillRect(x, 0, 2, 320);
        }
        g.fillStyle = "#e8c23a";
        star(g, 128, 120, 40);
        g.fillStyle = "#2a1a10";
        g.fillRect(0, 60, 256, 10);
        g.fillRect(0, 250, 256, 10);
      } else {
        // wrought-iron gate with gold finials on a dark backing
        g.fillStyle = kind === "exit" ? "#0e1a14" : "#140e1a";
        g.fillRect(0, 0, 256, 320);
        g.fillStyle = kind === "exit" ? "#3aa060" : "#c8a03a";
        for (let x = 14; x < 256; x += 26) g.fillRect(x, 20, 6, 300);
        g.fillRect(0, 30, 256, 8);
        g.fillRect(0, 290, 256, 8);
        for (let x = 17; x < 256; x += 26) {
          g.beginPath();
          g.moveTo(x - 7, 22);
          g.lineTo(x, 4);
          g.lineTo(x + 7, 22);
          g.fill();
        }
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 6;
        g.beginPath();
        g.arc(128, 160, 50, 0, Math.PI * 2);
        g.stroke();
        if (kind === "exit") {
          // arrow pictogram
          g.fillStyle = "rgba(120,255,160,0.95)";
          g.beginPath();
          g.moveTo(98, 150);
          g.lineTo(140, 150);
          g.lineTo(140, 132);
          g.lineTo(170, 162);
          g.lineTo(140, 192);
          g.lineTo(140, 174);
          g.lineTo(98, 174);
          g.fill();
        } else {
          g.fillStyle = "#c8a03a";
          star(g, 128, 160, 26);
        }
      }
      grime(g, 256, 320, R, { speck: 0.1, blotch: 12, blotchA: 0.4 });
      return c;
    },
    false,
  );
}

/** soft round glow used for halos, flashes and bulbs */
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
/** confetti/paint splat for floor decals */
export function splatTexture() {
  return tex(
    "splat",
    () => {
      const R = rng(4242);
      const [c, g] = canvas(128, 128);
      g.fillStyle = "rgba(120,10,30,0.95)";
      g.beginPath();
      g.arc(64, 64, 24, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 16; i++) {
        const a = R() * Math.PI * 2, d = 20 + R() * 36, r = 3 + R() * 9;
        g.beginPath();
        g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 24; i++) {
        g.fillStyle = ["#e8c23a", "#3a8ae0", "#e04a8a", "#5ae08a"][i % 4];
        g.fillRect(R() * 128, R() * 128, 3 + R() * 4, 3 + R() * 4);
      }
      return c;
    },
    false,
  );
}
/** ring for bomb landing marks and shockwaves */
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
/** night sky gradient for outdoor levels */
export function skyTexture() {
  return tex(
    "sky",
    () => {
      const [c, g] = canvas(16, 256);
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, "#05030c");
      gr.addColorStop(0.45, "#1a0e2e");
      gr.addColorStop(0.62, "#3a1a3a");
      gr.addColorStop(0.7, "#120a1c");
      gr.addColorStop(1, "#0a0610");
      g.fillStyle = gr;
      g.fillRect(0, 0, 16, 256);
      return c;
    },
    false,
  );
}
/** distant carnival skyline silhouettes (tents, coaster, towers) */
export function skylineTexture() {
  return tex("skyline", () => {
    const R = rng(808);
    const [c, g] = canvas(1024, 128);
    g.fillStyle = "#06040a";
    let x = 0;
    while (x < 1024) {
      const kind = R();
      if (kind < 0.35) {
        // tent
        const w = 60 + R() * 70, h = 40 + R() * 40;
        g.beginPath();
        g.moveTo(x, 128);
        g.lineTo(x + w * 0.1, 128 - h * 0.5);
        g.lineTo(x + w / 2, 128 - h);
        g.lineTo(x + w * 0.9, 128 - h * 0.5);
        g.lineTo(x + w, 128);
        g.fill();
        g.fillRect(x + w / 2 - 1, 128 - h - 10, 2, 10);
        x += w + 10;
      } else if (kind < 0.6) {
        // coaster lattice
        const w = 120 + R() * 80;
        g.strokeStyle = "#06040a";
        g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k <= 20; k++) {
          const px = x + (k / 20) * w, py = 128 - 40 - Math.sin((k / 20) * Math.PI * 2) * 25 - 20;
          g.lineTo(px, py);
        }
        g.stroke();
        for (let k = 0; k <= 10; k++) {
          const px = x + (k / 10) * w, py = 128 - 40 - Math.sin((k / 10) * Math.PI * 2) * 25 - 20;
          g.fillRect(px - 1, py, 2, 128 - py);
        }
        x += w + 10;
      } else {
        const w = 14 + R() * 10, h = 50 + R() * 50;
        g.fillRect(x, 128 - h, w, h);
        g.beginPath();
        g.moveTo(x - 4, 128 - h);
        g.lineTo(x + w / 2, 128 - h - 16);
        g.lineTo(x + w + 4, 128 - h);
        g.fill();
        x += w + 20;
      }
    }
    // distant bulbs
    for (let i = 0; i < 160; i++) {
      g.fillStyle = ["#ffc23b", "#ff3b5c", "#5a8cff", "#b04aff"][i % 4];
      g.fillRect(R() * 1024, 60 + R() * 60, 2, 2);
    }
    return c;
  });
}
export function skinTexture(kind) {
  return tex(`skin:${kind}`, () => {
    const R = rng(kind.length * 311);
    const [c, g] = canvas(128, 128);
    g.fillStyle = kind === "pale" ? "#e8e0d4" : kind === "king" ? "#dcd4e8" : "#d8cfc0";
    g.fillRect(0, 0, 128, 128);
    grime(g, 128, 128, R, { speck: 0.12, blotch: 12, blotchA: 0.35, dark: "60,40,50" });
    // cracked greasepaint
    g.strokeStyle = "rgba(70,40,40,0.4)";
    for (let i = 0; i < 8; i++) {
      let x = R() * 128, y = R() * 128;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (R() - 0.5) * 20;
        y += (R() - 0.5) * 20;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  });
}
/** costume fabric: polka (clown), diamonds (jester), plate (armored), velvet (king) */
export function costumeTexture(kind) {
  return tex(`cos:${kind}`, () => {
    const R = rng(kind.length * 71 + 1);
    const [c, g] = canvas(128, 128);
    if (kind === "polka") {
      g.fillStyle = "#c8a83a";
      g.fillRect(0, 0, 64, 128);
      g.fillStyle = "#2a5ab0";
      g.fillRect(64, 0, 64, 128);
      for (let y = 8; y < 128; y += 22)
        for (let x = 8; x < 128; x += 22) {
          g.fillStyle = x < 64 ? "#d8302a" : "#efe6d8";
          g.beginPath();
          g.arc(x + ((y / 22) % 2 ? 11 : 0), y, 6, 0, Math.PI * 2);
          g.fill();
        }
    } else if (kind === "diamond") {
      const s = 32;
      for (let y = -s; y < 128 + s; y += s / 2)
        for (let x = 0; x < 128 + s; x += s) {
          const ox = ((y / (s / 2)) % 2 ? s / 2 : 0) + x;
          g.fillStyle = ((y / (s / 2)) & 1) ^ ((x / s) & 1) ? "#6a1a8a" : "#1a7a4a";
          g.beginPath();
          g.moveTo(ox, y - s / 2);
          g.lineTo(ox + s / 2, y);
          g.lineTo(ox, y + s / 2);
          g.lineTo(ox - s / 2, y);
          g.fill();
        }
    } else if (kind === "plate") {
      g.fillStyle = "#6a6458";
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 32) {
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(0, y, 128, 3);
        for (let x = 8; x < 128; x += 24) {
          g.fillStyle = "#a8a090";
          g.beginPath();
          g.arc(x, y + 10, 2.5, 0, Math.PI * 2);
          g.fill();
        }
      }
      // rust + painted stripe
      g.fillStyle = "rgba(200,40,40,0.55)";
      g.fillRect(0, 54, 128, 16);
      grime(g, 128, 128, R, { speck: 0.15, blotch: 16, blotchA: 0.6, dark: "90,40,10" });
      return c;
    } else {
      // velvet with gold embroidery
      g.fillStyle = "#4a0e5a";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#c8a03a";
      for (let y = 16; y < 128; y += 32)
        for (let x = 16; x < 128; x += 32) star(g, x + ((y / 32) % 2 ? 16 : 0), y, 6);
    }
    grime(g, 128, 128, R, { speck: 0.12, blotch: 14, blotchA: 0.45, dark: "20,4,10" });
    return c;
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
