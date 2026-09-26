/**
 * Car Wash Studio — seeded dirt generation.
 *
 * Fills a panel Surface's layers from the job's dirt profile. Every value is
 * a pure function of (seed, panel id, pixel position in its primary view), so
 * the same job always starts with the same dirt, and Before/After can rebuild
 * the exact starting state.
 *
 * Dirt is placed where a real car collects it, not sprinkled uniformly:
 *   dust    soft translucent haze, heavier on horizontal surfaces
 *   mud     irregular splash patches + spatter droplets, low and behind arches
 *   grime   road film concentrated on lower panels, streaked with airflow,
 *           plus thin vertical run-off streaks under the windows
 *   spots   small bug / tar spots, mostly on front-facing surfaces
 *   smudge  cloudy marks + wiper arcs on glass
 */
import { fbm, vnoise, hash2, worley, smoothstep, clamp01 } from "./rng.js";

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** spatter droplets: returns 0..1 coverage at (x,y) from a jittered grid */
function spatter(x, y, cell, density, seed, rMin, rMax) {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  let best = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      if (hash2(gx, gy, seed) > density) continue;
      const px = (gx + hash2(gx, gy, seed + 11)) * cell;
      const py = (gy + hash2(gx, gy, seed + 23)) * cell;
      const r = rMin + (rMax - rMin) * hash2(gx, gy, seed + 37);
      // slightly elongated drops
      const dx = (x - px) * 0.85;
      const dy = y - py;
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      if (d < 1) best = Math.max(best, 1 - d * d * 0.6);
    }
  }
  return best;
}

const B = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0);

export function generateDirt(surf, model, prof, jobSeed) {
  const seed = (jobSeed ^ strHash(surf.id)) >>> 0;
  const panel = surf.panel;
  const view = model.views[surf.primary.view];
  const mat = surf.material;
  const isSide = surf.primary.view === "left" || surf.primary.view === "right";
  const zone = panel.id;
  const topSurface = zone === "hood" || zone === "roof";
  const frontFacing = zone === "bumperF" || zone === "hood" || zone === "grille" || zone.startsWith("mirror");
  const wheels = isSide ? view.wheels : [];
  const beltY = isSide ? Math.max(...view.dlo.map((p) => p[1])) : -1e4;
  const box = panel.primaryBox;
  const wheel = panel.wheel;
  const dirMul = view.mirrored ? -1 : 1;
  let dirt0 = 0;
  let stuck0 = 0;

  for (let v = 0; v < surf.h; v++) {
    for (let u = 0; u < surf.w; u++) {
      const i = v * surf.w + u;
      const [x, y] = surf.posOf(u, v);
      // static look textures — filled for every pixel (cheap, keeps edges clean)
      surf.nz[i] = (hash2(u, v, seed) * 255) | 0;
      const wb = worley(x / 3.6, y / 3.6, seed + 5);
      const wb2 = worley(x / 1.7, y / 1.7, seed + 9);
      surf.bub[i] = B(0.35 + 0.65 * smoothstep(0.2, 0.75, wb) * 0.7 + 0.3 * smoothstep(0.25, 0.7, wb2));
      surf.stk[i] = B(smoothstep(0.55, 0.95, vnoise(x / 1.9, y / 26, seed + 13)));
      surf.gl[i] = B(smoothstep(0.35, 0.9, vnoise((x * 0.8 + y * 0.55) / 55, 0.5, seed + 17)));
      surf.lm[i] = B(fbm(x / 11, y / 9, seed + 19, 3) * 1.25 - 0.1);
      if (!surf.valid[i]) continue;

      const h = -y / 100; // meters above ground (projected for front/rear)
      const n1 = fbm(x / 38, y / 38, seed + 1, 3);
      let D = 0;
      let ML = 0;
      let MS = 0;
      let G = 0;
      let S = 0;
      let SM = 0;

      if (mat === "paint") {
        const low = smoothstep(0.9, 0.18, h);
        D = prof.dust * (0.3 + 0.7 * n1) * (0.55 + 0.35 * low + (topSurface ? 0.55 : 0));
        // mud: low body + fan-shaped spray behind each wheel
        let arch = 0;
        for (const w of wheels) {
          const dx = (x - w.cx) * dirMul;
          const dy = y - w.acy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const edge = Math.abs(dist - w.arch - 6);
          let a = Math.exp(-(edge * edge) / (18 * 18));
          if (dx > 0) a *= 1.25; // thrown backwards
          if (dy < -w.arch * 0.7) a *= 0.5;
          arch = Math.max(arch, a);
        }
        const m = prof.mud * (low * 0.85 + arch * 0.9 + (zone === "bumperR" ? 0.25 * low : 0));
        const patch = fbm(x / 15, y / 10.5, seed + 2, 3) + m * 0.5 - 0.64;
        let mud = smoothstep(0, 0.16, patch) * Math.min(1, m * 1.7);
        mud = Math.max(mud, spatter(x, y, 7, Math.min(0.55, m * 0.45), seed + 3, 0.7, 2.3) * Math.min(1, m * 1.5));
        ML = mud * 0.45;
        MS = mud * 0.6;
        // road grime
        G = prof.grime * smoothstep(0.75, 0.22, h) * (0.45 + 0.55 * vnoise(x / 42, y / 3.5, seed + 4));
        if (isSide && y > beltY + 2 && h > 0.35) {
          const st = vnoise(x / 2.3, y / 48, seed + 6);
          if (st > 0.7) G += (st - 0.7) * 2.6 * (prof.grime * 0.8 + 0.12) * smoothstep(beltY, beltY + 40, y);
        }
        if (prof.salt) G += prof.salt * smoothstep(0.55, 0.15, h) * (0.4 + 0.6 * vnoise(x / 25, y / 6, seed + 8));
        // bug / tar spots
        const sd = prof.spots * (frontFacing ? (zone === "hood" ? smoothstep(-0.9, -0.2, (y - box.y1) / Math.max(1, box.h)) * 0.9 : 1) : 0.12);
        S = spatter(x, y, 5, sd * 0.3, seed + 7, 0.5, 1.25) * 0.95;
      } else if (mat === "glass") {
        D = prof.dust * 0.55 * (0.4 + 0.6 * n1);
        SM = prof.smudge * (0.25 + 0.75 * smoothstep(0.48, 0.74, fbm(x / 16, y / 11, seed + 5, 3)));
        if (zone === "windshield" || zone === "rearGlass") {
          // wiper arcs
          for (const f of zone === "windshield" ? [0.3, 0.72] : [0.5]) {
            const cx = box.x0 + box.w * f;
            const cy = box.y1 + 3;
            const R = box.h * 0.92;
            const dd = Math.abs(Math.hypot(x - cx, y - cy) - R);
            if (y < cy) SM = Math.max(SM, prof.smudge * 0.85 * smoothstep(5, 1, dd) * (0.5 + 0.5 * vnoise(x / 6, y / 6, seed)));
          }
        }
        ML = prof.mud * 0.3 * smoothstep(0.6, 0.95, fbm(x / 12, y / 12, seed + 3, 2)) * smoothstep(1.2, 0.8, h);
      } else if (mat === "wheel") {
        const dx = x - wheel.cx;
        const dy = y - wheel.cy;
        const rr = Math.sqrt(dx * dx + dy * dy) / wheel.r;
        const rimK = wheel.rimR / wheel.r;
        const lower = smoothstep(-0.4, 0.9, dy / wheel.r);
        D = prof.dust * 0.7 * (0.4 + 0.6 * n1);
        if (rr < rimK) {
          G = prof.wheel * (0.4 + 0.6 * fbm(x / 7, y / 7, seed + 2, 3)) * (0.75 + 0.35 * lower) * (rr < rimK * 0.25 ? 0.6 : 1);
        } else {
          const m = prof.mud * 0.8 + prof.wheel * 0.25;
          ML = m * lower * smoothstep(0.35, 0.6, fbm(x / 6, y / 6, seed + 3, 3)) * 0.5;
          MS = m * lower * smoothstep(0.42, 0.62, fbm(x / 6, y / 6, seed + 3, 3)) * 0.7;
          G = prof.wheel * 0.45 * (0.5 + 0.5 * n1);
        }
      } else if (mat === "trim") {
        if (zone === "grille") {
          S = prof.bugs ? spatter(x, y, 3.2, 0.5, seed + 7, 0.6, 1.4) : 0;
          G = prof.bugs ? 0.35 * n1 : 0;
          D = prof.dust * 0.5;
        } else if (zone === "exhaust") {
          G = prof.soot ? 0.75 + 0.25 * n1 : 0;
          D = prof.dust * 0.4;
        }
      }
      const d = B(clamp01(D));
      const ml = B(clamp01(ML));
      const ms = B(clamp01(MS));
      const g = B(clamp01(G));
      const s = B(clamp01(S));
      const sm = B(clamp01(SM));
      surf.D[i] = d;
      surf.ML[i] = ml;
      surf.MS[i] = ms;
      surf.G[i] = g;
      surf.S[i] = s;
      surf.SM[i] = sm;
      dirt0 += d + ml + ms + g + s + sm;
      stuck0 += ms + g + s;
    }
  }
  surf.dirt0 = dirt0;
  surf.stuck0 = stuck0;
  surf.markAll();
}
