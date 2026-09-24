/**
 * Car Wash Studio — seeded interior dirt, trash and crumbs.
 *
 *   dash / console   fine dust film (+ a few sticky marks)
 *   vents            dust packed into the slats
 *   cup holders      sticky rings (only when the job asks for them)
 *   seats            fabric: light dust + stains; leather: stains + dull film
 *   carpet           ground-in dirt / sand
 *   inside glass     haze + finger smudges
 * Trash and crumbs are discrete objects placed inside their zones.
 */
import { fbm, hash2, mulberry32, smoothstep, clamp01 } from "./rng.js";
import { pointInPoly, bbox } from "./geom.js";

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function blobs(x, y, seed, cell, density, rMin, rMax) {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  let best = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      if (hash2(gx, gy, seed) > density) continue;
      const px = (gx + hash2(gx, gy, seed + 3)) * cell;
      const py = (gy + hash2(gx, gy, seed + 5)) * cell;
      const r = rMin + (rMax - rMin) * hash2(gx, gy, seed + 7);
      const wob = 0.8 + 0.4 * fbm(x / 6, y / 6, seed + gx * 7 + gy, 2);
      const d = Math.hypot(x - px, y - py) / (r * wob);
      if (d < 1) best = Math.max(best, smoothstep(1, 0.55, d));
    }
  }
  return best;
}

const B = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0);

export function generateInteriorDirt(surf, model, spec, jobSeed) {
  const seed = (jobSeed ^ strHash(surf.id) ^ 0x5bd1e995) >>> 0;
  const d = spec.dirt;
  const task = surf.panel.task;
  const mat = surf.material;
  let dirt0 = 0;
  for (let v = 0; v < surf.h; v++) {
    for (let u = 0; u < surf.w; u++) {
      const i = v * surf.w + u;
      const [x, y] = surf.posOf(u, v);
      surf.nz[i] = (hash2(u, v, seed) * 255) | 0;
      surf.bub[i] = 128;
      surf.stk[i] = 0;
      surf.gl[i] = 0;
      surf.lm[i] = 128;
      if (!surf.valid[i]) continue;
      const n = fbm(x / 30, y / 30, seed, 3);
      let D = 0;
      let S = 0;
      let SM = 0;
      if (task === "dash") {
        // a light film everywhere, heavier drifts where dust settles
        D = d.dust * (0.18 + 0.6 * smoothstep(0.35, 0.8, n)) * 0.85;
        S = d.stains * 0.6 * blobs(x, y, seed + 1, 60, 0.12, 5, 11);
      } else if (task === "vent") {
        D = d.dust * (0.7 + 0.3 * n) + 0.2;
      } else if (task === "cups") {
        S = spec.cups ? 0.35 + 0.65 * blobs(x, y, seed + 2, 16, 0.8, 6, 12) : 0;
        D = d.dust * 0.4;
      } else if (task === "seat") {
        D = mat === "fabric" ? d.dust * 0.55 * (0.4 + 0.6 * n) : d.dust * 0.3;
        S = d.stains * blobs(x, y, seed + 3, 70, 0.32, 12, 26);
      } else if (task === "floor" || task === "trunk") {
        D = d.floor * (0.35 + 0.65 * fbm(x / 22, y / 22, seed + 4, 3));
        D = Math.max(D, d.floor * blobs(x, y, seed + 5, 45, 0.4, 10, 22));
      } else if (task === "iglass") {
        SM = d.smudge * (0.3 * n + 0.7 * smoothstep(0.52, 0.7, fbm(x / 26, y / 16, seed + 6, 3)));
        SM = Math.max(SM, d.smudge * blobs(x, y, seed + 7, 40, 0.3, 4, 8));
      }
      const db = B(clamp01(D));
      const sb = B(clamp01(S));
      const smb = B(clamp01(SM));
      surf.D[i] = db;
      surf.S[i] = sb;
      surf.SM[i] = smb;
      dirt0 += db + sb + smb;
    }
  }
  surf.dirt0 = dirt0;
  surf.stuck0 = 0;
  surf.markAll();
}

const TRASH_KINDS = ["cup", "receipt", "wrapper", "bottle", "box", "can"];

function samplePoint(zones, rand, avoid = []) {
  for (let tries = 0; tries < 60; tries++) {
    const z = zones[Math.floor(rand() * zones.length)];
    const b = bbox(z);
    const x = b.x0 + rand() * b.w;
    const y = b.y0 + rand() * b.h;
    if (!pointInPoly(x, y, z)) continue;
    if (avoid.some((a) => pointInPoly(x, y, a))) continue;
    return [x, y];
  }
  return null;
}

export function generateTrash(model, spec, jobSeed) {
  const rand = mulberry32(jobSeed * 31 + 7);
  const out = [];
  const plan = spec.trash || {};
  let id = 0;
  for (const view of Object.keys(model.views)) {
    const n = plan[view] || 0;
    const v = model.views[view];
    const avoid = view === "cabin" ? [v.seatL, v.seatR, v.headL, v.headR] : [];
    for (let k = 0; k < n; k++) {
      const p = samplePoint(v.trashZones, rand, avoid);
      if (!p) continue;
      out.push({
        id: id++, view, x: p[0], y: p[1], kind: TRASH_KINDS[Math.floor(rand() * TRASH_KINDS.length)],
        rot: (rand() - 0.5) * 1.6, size: 44 + rand() * 14, hue: rand(), removed: false,
      });
    }
  }
  return out;
}

export function generateCrumbs(model, spec, jobSeed) {
  const rand = mulberry32(jobSeed * 17 + 3);
  const out = [];
  const count = spec.crumbs || {};
  const sand = spec.sand;
  for (const view of Object.keys(model.views)) {
    const n = count[view] || 0;
    const v = model.views[view];
    const avoid = view === "cabin" ? [v.headL, v.headR] : [];
    for (let k = 0; k < n; k++) {
      const p = samplePoint(v.crumbZones, rand, avoid);
      if (!p) continue;
      const tone = rand();
      out.push({
        view, x: p[0], y: p[1], r: 1.4 + rand() * 2.6, rot: rand() * 6.28,
        color: sand ? [214 - tone * 30, 190 - tone * 30, 140 - tone * 30] : [150 - tone * 60, 110 - tone * 45, 70 - tone * 30],
        alive: true, pulled: 0,
      });
    }
  }
  return out;
}
