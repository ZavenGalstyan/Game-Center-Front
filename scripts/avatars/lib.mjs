// Shared building blocks for the avatar artwork generator (generate.mjs).
// Every avatar is a full-bleed 128x128 SVG: a lit backdrop, an optional
// atmosphere layer, the subject, then a vignette so all 50 crop cleanly to a
// circle and share the same framing and lighting.

/** Deterministic PRNG so atmosphere layers are stable between runs. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

function stops(list) {
  return list
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ""}/>`)
    .join("");
}

/** Linear gradient (objectBoundingBox coords). */
export const L = (id, x1, y1, x2, y2, ...s) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;

/** Radial gradient (objectBoundingBox coords). */
export const R = (id, cx, cy, r, ...s) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;

/** Radial gradient in user-space coords (for glows not tied to a shape's box). */
export const RU = (id, cx, cy, r, ...s) =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;

/* ------------------------------ Atmosphere ------------------------------ */

export function rays(color, { n = 12, cx = 64, cy = 60, op = 0.12, len = 110, w = 7 } = {}) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + (w * Math.PI) / 180;
    out += `M${cx} ${cy}L${r1(cx + Math.cos(a) * len)} ${r1(cy + Math.sin(a) * len)}L${r1(cx + Math.cos(b) * len)} ${r1(cy + Math.sin(b) * len)}Z`;
  }
  return `<path d="${out}" fill="${color}" opacity="${op}"/>`;
}

export function stars(seed, { n = 30, color = "#fff", maxR = 1.2, yMax = 128, op = 0.8 } = {}) {
  const rand = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += `<circle cx="${r1(rand() * 128)}" cy="${r1(rand() * yMax)}" r="${r1(0.3 + rand() * maxR)}" opacity="${r1(0.3 + rand() * 0.7)}"/>`;
  }
  return `<g fill="${color}" opacity="${op}">${out}</g>`;
}

export function embers(seed, { n = 18, color = "#ffb347", yMin = 0, yMax = 128, op = 0.9 } = {}) {
  const rand = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = rand() * 128;
    const y = yMin + rand() * (yMax - yMin);
    const s = 0.6 + rand() * 1.6;
    out += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(s)}" height="${r1(s)}" transform="rotate(45 ${r1(x)} ${r1(y)})" opacity="${r1(0.35 + rand() * 0.65)}"/>`;
  }
  return `<g fill="${color}" opacity="${op}">${out}</g>`;
}

/** Synthwave perspective floor from `horizon` down. */
export function grid(color, { horizon = 86, op = 0.55 } = {}) {
  let d = "";
  for (let i = -8; i <= 8; i++) d += `M${64 + i * 4} ${horizon}L${64 + i * 26} 128`;
  let y = horizon;
  for (let k = 1; k < 9; k++) {
    y += k * 1.6;
    if (y > 128) break;
    d += `M0 ${r1(y)}H128`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width=".8" fill="none" opacity="${op}"/>`;
}

export function hexes(color, { op = 0.14, size = 9 } = {}) {
  let d = "";
  const h = size * Math.sqrt(3);
  for (let row = -1; row < 128 / h + 1; row++) {
    for (let col = -1; col < 128 / (size * 1.5) + 1; col++) {
      const cx = col * size * 1.5;
      const cy = row * h + (col % 2 ? h / 2 : 0);
      let p = "";
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        p += `${k ? "L" : "M"}${r1(cx + Math.cos(a) * size * 0.92)} ${r1(cy + Math.sin(a) * size * 0.92)}`;
      }
      d += p + "Z";
    }
  }
  return `<path d="${d}" stroke="${color}" stroke-width=".7" fill="none" opacity="${op}"/>`;
}

export function rain(seed, { n = 40, color = "#9fb8d6", op = 0.35, slant = -4 } = {}) {
  const rand = rng(seed);
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = rand() * 140 - 6;
    const y = rand() * 128;
    const l = 5 + rand() * 7;
    d += `M${r1(x)} ${r1(y)}l${slant} ${r1(l)}`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width=".7" stroke-linecap="round" opacity="${op}"/>`;
}

/** Horizontal speed streaks. */
export function speed(seed, { n = 14, color = "#fff", op = 0.35, yMin = 20, yMax = 110 } = {}) {
  const rand = rng(seed);
  let d = "";
  for (let i = 0; i < n; i++) {
    const y = yMin + rand() * (yMax - yMin);
    const x = rand() * 100;
    d += `M${r1(x)} ${r1(y)}h${r1(12 + rand() * 30)}`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width="1" stroke-linecap="round" opacity="${op}"/>`;
}

/** Circuit traces radiating to the edges. */
export function circuit(seed, { color = "#38e1ff", op = 0.3, n = 14 } = {}) {
  const rand = rng(seed);
  let d = "";
  let dots = "";
  for (let i = 0; i < n; i++) {
    const side = i % 4;
    let x = side === 0 ? 0 : side === 1 ? 128 : rand() * 128;
    let y = side === 2 ? 0 : side === 3 ? 128 : rand() * 128;
    d += `M${r1(x)} ${r1(y)}`;
    const steps = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < steps; k++) {
      x += (64 - x) * (0.25 + rand() * 0.2);
      if (k % 2) y += (60 - y) * 0.3;
      d += `L${r1(x)} ${r1(y)}`;
    }
    dots += `<circle cx="${r1(x)}" cy="${r1(y)}" r="1.4"/>`;
  }
  return `<g opacity="${op}"><path d="${d}" stroke="${color}" stroke-width=".9" fill="none"/><g fill="${color}">${dots}</g></g>`;
}

/** Binary-ish code rain drawn with tiny rects (no font dependency). */
export function codeRain(seed, { color = "#3dff8c", op = 0.35, cols = 14 } = {}) {
  const rand = rng(seed);
  let out = "";
  for (let c = 0; c < cols; c++) {
    const x = 3 + c * 9 + rand() * 2;
    let y = rand() * -20;
    while (y < 128) {
      const one = rand() > 0.5;
      out += one
        ? `<rect x="${r1(x)}" y="${r1(y)}" width="1.3" height="5" opacity="${r1(0.3 + rand() * 0.7)}"/>`
        : `<rect x="${r1(x - 1)}" y="${r1(y)}" width="3.4" height="5" rx="1.5" fill="none" stroke="${color}" stroke-width=".9" opacity="${r1(0.3 + rand() * 0.7)}"/>`;
      y += 11 + rand() * 5;
    }
  }
  return `<g fill="${color}" opacity="${op}">${out}</g>`;
}

/* -------------------------------- Frame -------------------------------- */

/**
 * @param {object} o
 * @param {[string,string,string]} o.bg  inner / mid / outer backdrop colours
 * @param {string} [o.light] backdrop light centre, "cx cy" in %
 * @param {string} [o.defs]  subject gradients/filters
 * @param {string} [o.fx]    atmosphere layer (behind subject)
 * @param {string} o.body    the subject
 * @param {string} [o.front] overlay drawn above the subject, under the vignette
 */
export function frame({ bg, light = "50% 40%", defs = "", fx = "", body, front = "" }) {
  const [cx, cy] = light.split(" ");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
    `<defs>` +
    `<radialGradient id="bg" cx="${cx}" cy="${cy}" r="78%">${stops([[0, bg[0]], [0.52, bg[1]], [1, bg[2]]])}</radialGradient>` +
    `<radialGradient id="vig" cx="50%" cy="50%" r="72%">${stops([[0.62, "#000", 0], [1, "#000", 0.6]])}</radialGradient>` +
    `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>` +
    `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5"/></filter>` +
    defs +
    `</defs>` +
    `<rect width="128" height="128" fill="url(#bg)"/>` +
    fx +
    body +
    front +
    `<rect width="128" height="128" fill="url(#vig)"/>` +
    `</svg>`
  );
}

/** Mirror a path/group horizontally around x=64. */
export const mirror = (inner) => `<g transform="matrix(-1 0 0 1 128 0)">${inner}</g>`;
