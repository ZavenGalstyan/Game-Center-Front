/**
 * Arena Gladiator — procedural canvas textures (no image files). Every
 * texture is generated once per parameter set and cached; the cache is
 * process-wide so remounting a fight (Restart) never regenerates them.
 */
import * as THREE from "three";

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(c, { repeat = null, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

const hex = (c) => new THREE.Color(c);
function shade(color, k) {
  const c = hex(color);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/* ------------------------------------------------------------------ sand floor */
/** Circular arena floor: raked sand, darker trodden centre ring, footprints, stones. */
export function sandTexture(base, dark, size = 1024, kind = "sand") {
  return cached(`sand|${base}|${dark}|${size}|${kind}`, () => {
    const c = canvas(size);
    const g = c.getContext("2d");
    const r = rand(size + base.length);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    // large soft blotches
    for (let i = 0; i < 90; i++) {
      const x = r() * size;
      const y = r() * size;
      const rad = size * (0.04 + r() * 0.12);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = r() < 0.5 ? dark : shade(base, 1.08);
      grd.addColorStop(0, col + "55");
      grd.addColorStop(1, col + "00");
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const cx = size / 2;
    if (kind === "stone") {
      // flagstones in concentric rings, sand in the joints
      g.strokeStyle = shade(dark, 0.8) + "cc";
      g.lineWidth = size / 400;
      for (let ring = 1; ring < 12; ring++) {
        const rr = (ring / 12) * cx;
        g.beginPath();
        g.arc(cx, cx, rr, 0, Math.PI * 2);
        g.stroke();
        const n = 6 + ring * 5;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + ring * 0.37;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr);
          g.lineTo(cx + Math.cos(a) * (rr - cx / 12), cx + Math.sin(a) * (rr - cx / 12));
          g.stroke();
        }
      }
      for (let i = 0; i < 700; i++) {
        g.fillStyle = (r() < 0.5 ? shade(base, 0.85) : shade(base, 1.12)) + "40";
        const x = r() * size;
        const y = r() * size;
        g.fillRect(x, y, size * 0.02 * r(), size * 0.02 * r());
      }
    } else {
      // raked arcs
      g.strokeStyle = dark + "22";
      g.lineWidth = size / 500;
      for (let i = 0; i < 160; i++) {
        const rr = r() * cx;
        const a0 = r() * Math.PI * 2;
        g.beginPath();
        g.arc(cx, cx, rr, a0, a0 + 0.3 + r() * 0.8);
        g.stroke();
      }
    }
    // trodden fighting ring
    const ring = g.createRadialGradient(cx, cx, cx * 0.1, cx, cx, cx * 0.72);
    ring.addColorStop(0, dark + "30");
    ring.addColorStop(0.7, dark + "18");
    ring.addColorStop(1, dark + "00");
    g.fillStyle = ring;
    g.fillRect(0, 0, size, size);
    // footprints
    for (let i = 0; i < 140; i++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * cx * 0.75;
      const x = cx + Math.cos(a) * rr;
      const y = cx + Math.sin(a) * rr;
      g.save();
      g.translate(x, y);
      g.rotate(r() * Math.PI * 2);
      g.fillStyle = dark + "30";
      g.beginPath();
      g.ellipse(0, 0, size * 0.004, size * 0.009, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // pebbles & grain
    for (let i = 0; i < size * 12; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
      g.fillRect(r() * size, r() * size, 1.5, 1.5);
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = shade(base, 0.6 + r() * 0.5);
      g.beginPath();
      g.ellipse(r() * size, r() * size, 1 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return tex(c, { aniso: 8 });
  });
}

/** Tileable grain/noise used as a bump map. */
export function noiseTexture(size = 256, seed = 7, contrast = 80) {
  return cached(`noise|${size}|${seed}|${contrast}`, () => {
    const c = canvas(size);
    const g = c.getContext("2d");
    const img = g.createImageData(size, size);
    const r = rand(seed);
    for (let i = 0; i < size * size; i++) {
      const v = 128 + (r() - 0.5) * contrast;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { repeat: [1, 1], srgb: false });
  });
}

/* ------------------------------------------------------------------ stone wall */
export function stoneTexture(color, w = 512, h = 256, seed = 3) {
  return cached(`stone|${color}|${w}|${h}|${seed}`, () => {
    const c = canvas(w, h);
    const g = c.getContext("2d");
    const r = rand(seed);
    g.fillStyle = shade(color, 0.55);
    g.fillRect(0, 0, w, h);
    const rows = 6;
    const bh = h / rows;
    for (let row = 0; row < rows; row++) {
      let x = row % 2 ? -bh * 0.8 : 0;
      while (x < w) {
        const bw = bh * (1.4 + r() * 1.3);
        const k = 0.82 + r() * 0.3;
        g.fillStyle = shade(color, k);
        const inset = 2;
        g.beginPath();
        g.roundRect ? g.roundRect(x + inset, row * bh + inset, bw - inset * 2, bh - inset * 2, 4) : g.rect(x + inset, row * bh + inset, bw - inset * 2, bh - inset * 2);
        g.fill();
        // weathering
        for (let i = 0; i < 18; i++) {
          g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
          g.fillRect(x + r() * bw, row * bh + r() * bh, 2 + r() * 8, 1 + r() * 4);
        }
        // top highlight / bottom shadow
        g.fillStyle = "rgba(255,255,255,0.08)";
        g.fillRect(x + inset, row * bh + inset, bw - inset * 2, 3);
        g.fillStyle = "rgba(0,0,0,0.14)";
        g.fillRect(x + inset, row * bh + bh - inset - 4, bw - inset * 2, 4);
        x += bw;
      }
    }
    // damp stain at the base
    const grd = g.createLinearGradient(0, h * 0.7, 0, h);
    grd.addColorStop(0, "rgba(40,30,20,0)");
    grd.addColorStop(1, "rgba(40,30,20,0.35)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    return tex(c, { repeat: [1, 1] });
  });
}

/* ------------------------------------------------------------------ wood */
export function woodTexture(color = "#6d4c2e", planks = 6, seed = 11) {
  return cached(`wood|${color}|${planks}|${seed}`, () => {
    const w = 256;
    const h = 256;
    const c = canvas(w, h);
    const g = c.getContext("2d");
    const r = rand(seed);
    const pw = w / planks;
    for (let i = 0; i < planks; i++) {
      g.fillStyle = shade(color, 0.8 + r() * 0.35);
      g.fillRect(i * pw, 0, pw, h);
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`;
        g.lineWidth = 1;
        g.beginPath();
        const x = i * pw + r() * pw;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (r() - 0.5) * 8, h * 0.3, x + (r() - 0.5) * 8, h * 0.6, x + (r() - 0.5) * 6, h);
        g.stroke();
      }
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(i * pw, 0, 2, h);
      // nails
      g.fillStyle = "#2b2622";
      g.fillRect(i * pw + pw / 2 - 2, 14, 4, 4);
      g.fillRect(i * pw + pw / 2 - 2, h - 18, 4, 4);
    }
    return tex(c, { repeat: [1, 1] });
  });
}

/* ------------------------------------------------------------------ fabric */
/** Hanging banner: dyed cloth, border, and an original emblem. */
export function bannerTexture(color, trim, emblem = 0) {
  return cached(`banner|${color}|${trim}|${emblem}`, () => {
    const w = 128;
    const h = 256;
    const c = canvas(w, h);
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const r = rand(emblem + 5);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)";
      g.fillRect(0, r() * h, w, 1);
    }
    g.strokeStyle = trim;
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 40);
    g.fillStyle = trim;
    // emblem: laurel ring + crossed blades / sun / tower (original simple marks)
    g.save();
    g.translate(w / 2, h * 0.42);
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, 34, Math.PI * 0.65, Math.PI * 2.35);
    g.stroke();
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.7 + (i / 8) * Math.PI * 1.6;
      g.beginPath();
      g.ellipse(Math.cos(a) * 34, Math.sin(a) * 34, 7, 3, a + 0.8, 0, Math.PI * 2);
      g.fill();
    }
    if (emblem % 3 === 0) {
      g.rotate(Math.PI / 4);
      g.fillRect(-3, -26, 6, 52);
      g.rotate(-Math.PI / 2);
      g.fillRect(-3, -26, 6, 52);
    } else if (emblem % 3 === 1) {
      g.beginPath();
      g.arc(0, 0, 12, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 12; i++) {
        g.rotate(Math.PI / 6);
        g.fillRect(-2, 15, 4, 10);
      }
    } else {
      g.fillRect(-14, -18, 28, 36);
      g.fillStyle = color;
      g.fillRect(-4, 4, 8, 14);
      g.fillRect(-14, -22, 6, 6);
      g.fillRect(-3, -22, 6, 6);
      g.fillRect(8, -22, 6, 6);
    }
    g.restore();
    // swallow-tail cut is done with alpha
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(w / 2, h - 30);
    g.lineTo(w, h);
    g.fill();
    return tex(c);
  });
}

/** Painted shield face. */
export function shieldTexture(color, trim, pattern = 0) {
  return cached(`shield|${color}|${trim}|${pattern}`, () => {
    const s = 256;
    const c = canvas(s);
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.fillRect(0, 0, s, s);
    const r = rand(pattern + 9);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)";
      g.fillRect(r() * s, r() * s, 2 + r() * 5, 1 + r() * 2);
    }
    g.strokeStyle = trim;
    g.fillStyle = trim;
    g.lineWidth = 10;
    g.translate(s / 2, s / 2);
    if (pattern % 3 === 0) {
      for (let i = 0; i < 4; i++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.moveTo(22, 0);
        g.quadraticCurveTo(70, 30, 100, 0);
        g.stroke();
      }
    } else if (pattern % 3 === 1) {
      g.beginPath();
      g.arc(0, 0, 72, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        g.rotate(Math.PI / 4);
        g.fillRect(-4, 30, 8, 28);
      }
    } else {
      g.lineWidth = 14;
      g.beginPath();
      g.moveTo(-100, -60);
      g.lineTo(100, 60);
      g.moveTo(-100, 60);
      g.lineTo(100, -60);
      g.stroke();
    }
    // scuffs
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      const x = r() * s;
      const y = r() * s;
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 12);
      g.stroke();
    }
    return tex(c);
  });
}

/** Overlapping scale armour (lorica-like), tileable. */
export function scaleTexture(color) {
  return cached(`scale|${color}`, () => {
    const s = 128;
    const c = canvas(s);
    const g = c.getContext("2d");
    g.fillStyle = shade(color, 0.4);
    g.fillRect(0, 0, s, s);
    const rows = 8;
    const cw = s / 6;
    const rh = s / rows;
    for (let row = -1; row < rows + 1; row++) {
      for (let col = -1; col < 7; col++) {
        const x = col * cw + (row % 2 ? cw / 2 : 0);
        const y = row * rh;
        const grd = g.createLinearGradient(x, y, x, y + rh * 1.6);
        grd.addColorStop(0, shade(color, 1.25));
        grd.addColorStop(1, shade(color, 0.7));
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + cw, y);
        g.lineTo(x + cw, y + rh * 0.9);
        g.quadraticCurveTo(x + cw / 2, y + rh * 1.9, x, y + rh * 0.9);
        g.closePath();
        g.fill();
        g.strokeStyle = "rgba(0,0,0,0.35)";
        g.lineWidth = 1;
        g.stroke();
      }
    }
    return tex(c, { repeat: [3, 2] });
  });
}

/** Leather with stitching and wear. */
export function leatherTexture(color) {
  return cached(`leather|${color}`, () => {
    const s = 128;
    const c = canvas(s);
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.fillRect(0, 0, s, s);
    const r = rand(color.length * 13);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)";
      g.beginPath();
      g.arc(r() * s, r() * s, 0.5 + r() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(20,12,6,0.55)";
    g.setLineDash([3, 3]);
    g.lineWidth = 1;
    g.strokeRect(4, 4, s - 8, s - 8);
    return tex(c, { repeat: [2, 2] });
  });
}

/* ------------------------------------------------------------------ sky */
export function skyTexture(top, bottom, night = false) {
  return cached(`sky|${top}|${bottom}|${night}`, () => {
    const c = canvas(32, 512);
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, top);
    grd.addColorStop(0.55, bottom);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 512);
    if (night) {
      const r = rand(99);
      for (let i = 0; i < 120; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
        g.fillRect(r() * 32, r() * 230, 0.6, 0.6);
      }
    }
    const t = tex(c);
    return t;
  });
}

/** Soft round sprite (dust, sparks, glow). */
export function glowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  return cached(`glow|${inner}|${outer}`, () => {
    const c = canvas(64);
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return tex(c);
  });
}

/** Crowd strip: rows of seated silhouettes in muted clothing colours. */
export function crowdTexture(night = false, seed = 1) {
  return cached(`crowd|${night}|${seed}`, () => {
    const w = 512;
    const h = 128;
    const c = canvas(w, h);
    const g = c.getContext("2d");
    const r = rand(seed * 31);
    g.fillStyle = night ? "#0c0c12" : "#3b3128";
    g.fillRect(0, 0, w, h);
    const cols = night
      ? ["#2a2430", "#35283a", "#2d3340", "#3a3024", "#402a2a"]
      : ["#8a3b2e", "#c8b58a", "#5a6b7a", "#7a6a3a", "#e0d6c0", "#6b4a6b", "#4a6a4a", "#a0522d"];
    for (let row = 0; row < 2; row++) {
      for (let x = 0; x < w; x += 14 + r() * 6) {
        const y = row * 64 + 18 + r() * 8;
        const body = cols[Math.floor(r() * cols.length)];
        g.fillStyle = body;
        g.beginPath();
        g.ellipse(x + 7, y + 30, 8, 18, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = night ? "#3a2e28" : ["#c79a74", "#8a5a3c", "#e0b896", "#5e3a26"][Math.floor(r() * 4)];
        g.beginPath();
        g.arc(x + 7, y + 8, 6, 0, Math.PI * 2);
        g.fill();
        if (r() < 0.15) {
          // raised arm
          g.fillStyle = body;
          g.fillRect(x + 11, y - 12, 3, 20);
        }
      }
    }
    return tex(c, { repeat: [1, 1] });
  });
}
