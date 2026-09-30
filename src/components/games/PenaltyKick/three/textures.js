/**
 * Penalty Kick — procedural canvas textures (no image files, no real logos).
 * Every texture is cached by its inputs so venue / ball switches are cheap.
 */
import * as THREE from "three";

const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};
const canvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const finish = (c, { repeat, srgb = true, aniso = 4 } = {}) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = aniso;
  return t;
};
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/**
 * Mown grass: alternating stripes across the pitch (parallel to the goal
 * line), fine blade noise, and a worn patch around the penalty spot / keeper
 * area. Mapped onto a 60 × 60 m plane centred on the goal.
 */
export function pitchTexture(grass, worn = 0.5) {
  return cached(`pitch|${grass.join()}|${worn}`, () => {
    const S = 1024;
    const c = canvas(S, S);
    const g = c.getContext("2d");
    const m = S / 60; // px per metre
    const stripe = 5.5; // metres per stripe
    for (let i = 0; i < 60 / stripe + 1; i++) {
      g.fillStyle = grass[i % 2];
      g.fillRect(0, i * stripe * m, S, stripe * m + 1);
    }
    const r = rng(7);
    for (let i = 0; i < 26000; i++) {
      const x = r() * S;
      const y = r() * S;
      const l = 0.35 + r() * 0.3;
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.03 * l})` : `rgba(0,0,0,${0.06 * l})`;
      g.fillRect(x, y, 1, 2 + r() * 2);
    }
    // wear: goalmouth and the spot; the 60 m plane is centred at z = 18
    const wear = (zx, zz, rx, rz, a) => {
      const cx = S / 2 + zx * m;
      const cy = S / 2 + (zz - 18) * m; // canvas rows run toward +z (texture top = far end behind the goal)
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, rz) * m);
      grd.addColorStop(0, `rgba(140,118,70,${a})`);
      grd.addColorStop(1, "rgba(140,118,70,0)");
      g.save();
      g.translate(cx, cy);
      g.scale(rx / Math.max(rx, rz), rz / Math.max(rx, rz));
      g.translate(-cx, -cy);
      g.fillStyle = grd;
      g.fillRect(cx - rx * m * 2, cy - rz * m * 2, rx * m * 4, rz * m * 4);
      g.restore();
    };
    wear(0, 0.6, 2.4, 1.3, 0.34 * worn + 0.08);
    wear(0, 11, 1.1, 1.1, 0.3 * worn + 0.1);
    wear(-0.4, 12.4, 0.9, 1.5, 0.2 * worn);
    return finish(c, { aniso: 8 });
  });
}

/**
 * Ball skin as an equirectangular map. Patterns are drawn in (lon, lat) space
 * with pole-aware shapes so they read as panels on a sphere.
 */
export function ballTexture(ball) {
  return cached(`ball|${ball.id}`, () => {
    const W = 512;
    const H = 256;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    g.fillStyle = ball.base;
    g.fillRect(0, 0, W, H);
    // spherical helpers: draw a "patch" around a direction by sampling pixels
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const ink = hex(ball.ink);
    const acc = hex(ball.accent);
    const base = hex(ball.base);
    // icosahedron vertex directions (12 pentagon centres of a truncated icosahedron)
    const p = (1 + Math.sqrt(5)) / 2;
    const ico = [
      [-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0],
      [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p],
      [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1],
    ].map((v) => {
      const l = Math.hypot(...v);
      return v.map((x) => x / l);
    });
    for (let y = 0; y < H; y++) {
      const lat = (0.5 - (y + 0.5) / H) * Math.PI;
      for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * Math.PI * 2;
        const v = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
        let col = base;
        let best = -2;
        let second = -2;
        for (const q of ico) {
          const dot = v[0] * q[0] + v[1] * q[1] + v[2] * q[2];
          if (dot > best) {
            second = best;
            best = dot;
          } else if (dot > second) second = dot;
        }
        const seam = best - second < 0.012; // thin stitching between cells
        if (ball.pattern === "classic") {
          if (best > 0.93) col = ink;
          else if (seam) col = mix(base, ink, 0.35);
        } else if (ball.pattern === "hex") {
          if (best > 0.955) col = acc;
          else if (seam) col = ink;
        } else if (ball.pattern === "star") {
          const ang = Math.atan2(v[1], v[0]) * 5;
          if (best > 0.9 + 0.04 * Math.cos(ang)) col = ink;
          else if (best > 0.84 && best < 0.86) col = acc;
        } else if (ball.pattern === "stripe") {
          const s = Math.sin(lat * 3 + Math.sin(lon * 2) * 0.5);
          if (Math.abs(s) < 0.16) col = ink;
          else if (Math.abs(s - 0.62) < 0.06) col = acc;
        } else if (ball.pattern === "swirl") {
          const s = Math.sin(lon * 3 + lat * 4);
          if (s > 0.82) col = ink;
          else if (s < -0.9) col = acc;
          else if (seam) col = mix(base, ink, 0.3);
        }
        const i = (y * W + x) * 4;
        d[i] = col[0];
        d[i + 1] = col[1];
        d[i + 2] = col[2];
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return finish(c, { aniso: 4 });
  });
}
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Perimeter boards: fictional, generic text only (no sponsors, no leagues). */
export function boardTexture(colors, venueName) {
  return cached(`board|${colors.join()}|${venueName}`, () => {
    const c = canvas(2048, 128);
    const g = c.getContext("2d");
    const words = ["PENALTY KICK", venueName.toUpperCase(), "GAME CENTER", "SHOOTOUT", "GOOD LUCK"];
    let x = 0;
    let i = 0;
    while (x < 2048) {
      const w = 410;
      g.fillStyle = i % 2 ? colors[0] : colors[1];
      g.fillRect(x, 0, w, 128);
      g.fillStyle = i % 2 ? colors[1] : colors[0];
      g.font = "900 54px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(words[i % words.length], x + w / 2, 66, w - 30);
      x += w;
      i++;
    }
    return finish(c, { repeat: [1, 1] });
  });
}

/** Crowd shirt noise for the stands (small colour speckle to break up rows). */
export function standTexture(dark) {
  return cached(`stand|${dark}`, () => {
    const c = canvas(256, 256);
    const g = c.getContext("2d");
    g.fillStyle = dark ? "#1d2230" : "#8a8f99";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      g.fillStyle = dark ? "#262d3f" : "#9aa0aa";
      g.fillRect(0, y, 256, 8);
    }
    return finish(c, { repeat: [8, 2] });
  });
}

/** Soft round blob for the ball/players' contact shadows and floodlight glows. */
export function blobTexture() {
  return cached("blob", () => {
    const c = canvas(128, 128);
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return finish(c, { srgb: false });
  });
}

/** Chain-link fence: diamond wire mesh with transparent holes (alpha-tested). */
export function chainLinkTexture() {
  return cached("chainlink", () => {
    const c = canvas(64, 64);
    const g = c.getContext("2d");
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(235,240,242,1)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 32);
    g.lineTo(32, 0);
    g.lineTo(64, 32);
    g.lineTo(32, 64);
    g.closePath();
    g.stroke();
    return finish(c, { repeat: [1, 1] });
  });
}
