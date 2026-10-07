/**
 * Dungeon Knight — procedural canvas textures (no image files). Each texture
 * is drawn once, greyscale-ish, and tinted per dungeon by material colour, so
 * five themes share a handful of textures. Cached; disposeTextures() frees them.
 */
import * as THREE from "three";

const cache = new Map();

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function make(key, size, draw, { repeat = true, srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

function speckle(g, size, r, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 200 + r() * 55 : r() * 70;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    const s = 1 + r() * 2.5;
    g.fillRect(r() * size, r() * size, s, s);
  }
}

/** Stone floor flags: irregular slabs with dark grout, worn centres. */
export function floorTexture() {
  return make("floor", 512, (g, S) => {
    const r = seeded(11);
    g.fillStyle = "#3a3632";
    g.fillRect(0, 0, S, S);
    const rows = 4;
    const h = S / rows;
    for (let y = 0; y < rows; y++) {
      let x = (y % 2) * -h * 0.5;
      while (x < S) {
        const w = h * (0.8 + r() * 0.7);
        const v = 150 + r() * 50;
        const grad = g.createLinearGradient(x, y * h, x + w, y * h + h);
        grad.addColorStop(0, `rgb(${v + 10},${v + 6},${v})`);
        grad.addColorStop(1, `rgb(${v - 18},${v - 20},${v - 24})`);
        g.fillStyle = grad;
        const gap = 3 + r() * 2;
        const rr = 6;
        const x0 = x + gap;
        const y0 = y * h + gap;
        const ww = w - gap * 2;
        const hh = h - gap * 2;
        g.beginPath();
        g.moveTo(x0 + rr, y0);
        g.lineTo(x0 + ww - rr, y0);
        g.quadraticCurveTo(x0 + ww, y0, x0 + ww, y0 + rr);
        g.lineTo(x0 + ww, y0 + hh - rr);
        g.quadraticCurveTo(x0 + ww, y0 + hh, x0 + ww - rr, y0 + hh);
        g.lineTo(x0 + rr, y0 + hh);
        g.quadraticCurveTo(x0, y0 + hh, x0, y0 + hh - rr);
        g.lineTo(x0, y0 + rr);
        g.quadraticCurveTo(x0, y0, x0 + rr, y0);
        g.fill();
        // cracks
        if (r() < 0.35) {
          g.strokeStyle = "rgba(30,26,22,0.55)";
          g.lineWidth = 1.2;
          g.beginPath();
          let cx = x0 + r() * ww;
          let cy = y0 + r() * hh;
          g.moveTo(cx, cy);
          for (let k = 0; k < 4; k++) {
            cx += (r() - 0.5) * 30;
            cy += (r() - 0.5) * 30;
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
        x += w;
      }
    }
    speckle(g, S, r, 2600, 0.35);
    speckle(g, S, r, 900, 0.25, true);
  });
}

/** Wall blocks: staggered ashlar courses with deep mortar. */
export function wallTexture() {
  return make("wall", 512, (g, S) => {
    const r = seeded(23);
    g.fillStyle = "#2c2925";
    g.fillRect(0, 0, S, S);
    const rows = 6;
    const h = S / rows;
    for (let y = 0; y < rows; y++) {
      let x = (y % 2) * -h * 0.9;
      while (x < S) {
        const w = h * (1.3 + r() * 0.8);
        const v = 130 + r() * 50;
        const grad = g.createLinearGradient(0, y * h, 0, y * h + h);
        grad.addColorStop(0, `rgb(${v + 14},${v + 10},${v + 4})`);
        grad.addColorStop(0.7, `rgb(${v},${v - 4},${v - 10})`);
        grad.addColorStop(1, `rgb(${v - 30},${v - 32},${v - 36})`);
        g.fillStyle = grad;
        g.fillRect(x + 3, y * h + 3, w - 6, h - 6);
        if (r() < 0.3) {
          g.fillStyle = "rgba(20,18,16,0.35)";
          g.fillRect(x + 3 + r() * (w - 20), y * h + 3 + r() * (h - 16), 6 + r() * 14, 3 + r() * 6);
        }
        x += w;
      }
    }
    speckle(g, S, r, 2400, 0.35);
    speckle(g, S, r, 700, 0.2, true);
  });
}

/** Wood planks with grain (crates, doors, barrels). */
export function woodTexture() {
  return make("wood", 256, (g, S) => {
    const r = seeded(37);
    const planks = 4;
    const w = S / planks;
    for (let i = 0; i < planks; i++) {
      const v = 120 + r() * 40;
      g.fillStyle = `rgb(${v},${v * 0.72},${v * 0.48})`;
      g.fillRect(i * w, 0, w, S);
      g.strokeStyle = "rgba(40,24,12,0.35)";
      for (let k = 0; k < 14; k++) {
        g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath();
        const x = i * w + r() * w;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (r() - 0.5) * 10, S * 0.33, x + (r() - 0.5) * 10, S * 0.66, x + (r() - 0.5) * 6, S);
        g.stroke();
      }
      g.fillStyle = "rgba(25,15,8,0.8)";
      g.fillRect(i * w, 0, 2.5, S);
    }
    speckle(g, S, r, 500, 0.25);
  });
}

/** Brushed / hammered metal. */
export function metalTexture() {
  return make("metal", 256, (g, S) => {
    const r = seeded(51);
    g.fillStyle = "#b8b8b8";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const v = 150 + r() * 90;
      g.strokeStyle = `rgba(${v},${v},${v},0.25)`;
      g.lineWidth = 0.5 + r();
      const y = r() * S;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(S, y + (r() - 0.5) * 6);
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,60,60,${0.08 + r() * 0.1})`;
      g.beginPath();
      g.arc(r() * S, r() * S, 2 + r() * 8, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Soft radial blob (glows, dust, shadows). */
export function glowTexture() {
  return make(
    "glow",
    128,
    (g, S) => {
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.6)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
    },
    { repeat: false },
  );
}

/** Torch flame: a teardrop with a hot core. */
export function flameTexture() {
  return make(
    "flame",
    128,
    (g, S) => {
      const grad = g.createRadialGradient(S / 2, S * 0.62, 2, S / 2, S * 0.55, S * 0.45);
      grad.addColorStop(0, "rgba(255,250,220,1)");
      grad.addColorStop(0.3, "rgba(255,200,90,0.95)");
      grad.addColorStop(0.65, "rgba(255,110,30,0.5)");
      grad.addColorStop(1, "rgba(255,60,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(S / 2, S * 0.04);
      g.bezierCurveTo(S * 0.85, S * 0.45, S * 0.86, S * 0.95, S / 2, S * 0.96);
      g.bezierCurveTo(S * 0.14, S * 0.95, S * 0.15, S * 0.45, S / 2, S * 0.04);
      g.fill();
    },
    { repeat: false },
  );
}

/** Moss / frost / ash patch (alpha decal). */
export function patchTexture() {
  return make(
    "patch",
    256,
    (g, S) => {
      const r = seeded(77);
      for (let i = 0; i < 220; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * S * 0.42;
        const x = S / 2 + Math.cos(a) * d;
        const y = S / 2 + Math.sin(a) * d;
        const rad = 4 + r() * 16 * (1 - d / (S * 0.5));
        g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    },
    { repeat: false },
  );
}

/** Danger decal for enemy telegraphs: soft-edged fill with a bright rim. */
export function dangerTexture() {
  return make(
    "danger",
    256,
    (g, S) => {
      const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grad.addColorStop(0, "rgba(255,255,255,0.22)");
      grad.addColorStop(0.82, "rgba(255,255,255,0.4)");
      grad.addColorStop(0.93, "rgba(255,255,255,0.95)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
    },
    { repeat: false },
  );
}

/** Lava / ember crack network (emissive). */
export function crackTexture() {
  return make(
    "cracks",
    512,
    (g, S) => {
      const r = seeded(91);
      g.fillStyle = "#000";
      g.fillRect(0, 0, S, S);
      g.lineCap = "round";
      for (let i = 0; i < 26; i++) {
        let x = r() * S;
        let y = r() * S;
        const w = 1.5 + r() * 4;
        for (let k = 0; k < 7; k++) {
          const nx = x + (r() - 0.5) * 90;
          const ny = y + (r() - 0.5) * 90;
          g.strokeStyle = `rgba(255,${120 + r() * 80},40,${0.5 + r() * 0.5})`;
          g.lineWidth = w * (1 - k / 9);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(nx, ny);
          g.stroke();
          x = nx;
          y = ny;
        }
      }
    },
    { repeat: true },
  );
}

/**
 * Room-type symbols above the exit doors (and on the door select cards).
 * Drawn as clean vector icons — no emoji, no fonts.
 */
export function symbolTexture(kind) {
  return make(
    `sym:${kind}`,
    256,
    (g, S) => {
      const c = S / 2;
      // stone plaque
      g.fillStyle = "rgba(20,18,24,0.0)";
      g.fillRect(0, 0, S, S);
      g.lineJoin = "round";
      g.lineCap = "round";
      const col = { combat: "#ffcf8a", treasure: "#ffd45e", healing: "#7fffb0", elite: "#ff7a7a", boss: "#ff5a5a", exit: "#bfe3ff" }[kind] || "#fff";
      g.shadowColor = col;
      g.shadowBlur = 18;
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 12;
      if (kind === "combat") {
        // crossed swords
        for (const s of [-1, 1]) {
          g.save();
          g.translate(c, c);
          g.rotate(s * Math.PI * 0.25);
          g.beginPath();
          g.moveTo(0, -84);
          g.lineTo(0, 52);
          g.stroke();
          g.beginPath();
          g.moveTo(-26, 46);
          g.lineTo(26, 46);
          g.stroke();
          g.beginPath();
          g.moveTo(0, 52);
          g.lineTo(0, 78);
          g.stroke();
          g.restore();
        }
      } else if (kind === "treasure") {
        g.lineWidth = 10;
        g.strokeRect(c - 70, c - 18, 140, 74);
        g.beginPath();
        g.moveTo(c - 70, c - 18);
        g.quadraticCurveTo(c, c - 92, c + 70, c - 18);
        g.stroke();
        g.fillRect(c - 12, c - 6, 24, 30);
      } else if (kind === "healing") {
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(c - 18, c - 76);
        g.lineTo(c + 18, c - 76);
        g.moveTo(c - 12, c - 76);
        g.lineTo(c - 12, c - 40);
        g.quadraticCurveTo(c - 62, c - 20, c - 58, c + 26);
        g.quadraticCurveTo(c - 52, c + 74, c, c + 76);
        g.quadraticCurveTo(c + 52, c + 74, c + 58, c + 26);
        g.quadraticCurveTo(c + 62, c - 20, c + 12, c - 40);
        g.lineTo(c + 12, c - 76);
        g.stroke();
        g.lineWidth = 11;
        g.beginPath();
        g.moveTo(c, c - 4);
        g.lineTo(c, c + 46);
        g.moveTo(c - 25, c + 21);
        g.lineTo(c + 25, c + 21);
        g.stroke();
      } else if (kind === "elite" || kind === "boss") {
        // skull with a crown (elite) / horned skull (boss)
        g.beginPath();
        g.arc(c, c + 6, 52, Math.PI * 0.95, Math.PI * 0.05);
        g.lineTo(c + 40, c + 52);
        g.lineTo(c - 40, c + 52);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "#1b1418";
        g.beginPath();
        g.arc(c - 20, c + 12, 13, 0, Math.PI * 2);
        g.arc(c + 20, c + 12, 13, 0, Math.PI * 2);
        g.fill();
        g.fillRect(c - 5, c + 30, 10, 14);
        g.fillStyle = col;
        g.shadowBlur = 18;
        if (kind === "elite") {
          g.beginPath();
          g.moveTo(c - 48, c - 34);
          g.lineTo(c - 48, c - 78);
          g.lineTo(c - 22, c - 54);
          g.lineTo(c, c - 86);
          g.lineTo(c + 22, c - 54);
          g.lineTo(c + 48, c - 78);
          g.lineTo(c + 48, c - 34);
          g.closePath();
          g.fill();
        } else {
          g.lineWidth = 14;
          for (const s of [-1, 1]) {
            g.beginPath();
            g.moveTo(c + s * 40, c - 26);
            g.quadraticCurveTo(c + s * 92, c - 46, c + s * 82, c - 104);
            g.stroke();
          }
        }
      } else {
        // exit: an arch with an upward arrow
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(c - 56, c + 70);
        g.lineTo(c - 56, c - 20);
        g.arc(c, c - 20, 56, Math.PI, 0);
        g.lineTo(c + 56, c + 70);
        g.stroke();
        g.beginPath();
        g.moveTo(c, c + 48);
        g.lineTo(c, c - 36);
        g.moveTo(c - 24, c - 12);
        g.lineTo(c, c - 38);
        g.lineTo(c + 24, c - 12);
        g.stroke();
      }
    },
    { repeat: false },
  );
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
