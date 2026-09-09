/**
 * Delivery Rush — building generator.
 *
 * Every building is composed from a shared parametric core (plinth, mass,
 * pilasters, floor bands, window grid, cornice, parapet, rooftop clutter) plus
 * a per-family pass that gives it a silhouette you can recognise at a glance:
 * gable roofs and chimneys on townhouses, curtain-wall glass on offices,
 * ribbed steel and roller doors on warehouses, open decks on car parks.
 *
 * Nothing here creates a mesh — it writes triangles into the shared channel
 * accumulators, so the entire district still bakes down to a few draw calls.
 *
 * Local frame: +X is the building width, +Z is the *front* (street side).
 */

import { makeRng } from "../utils/rng.js";
import { shade, mix, jitter } from "./palette.js";

const STOREY = 3.25;
const SHOP_H = 4.35;

/** Local -> world transform for a building placed at (cx, cz) rotated by yaw. */
function localizer(cx, cz, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    yaw,
    p(lx, ly, lz) {
      return [cx + lx * c + lz * s, ly, cz - lx * s + lz * c];
    },
    /** A box in local space. */
    box(acc, lx, ly, lz, w, h, d, color) {
      acc.add("box", this.p(lx, ly, lz), [w, h, d], color, yaw);
    },
    cyl(acc, name, lx, ly, lz, r, h, color) {
      acc.add(name, this.p(lx, ly, lz), [r * 2, h, r * 2], color, yaw);
    },
    /**
     * A flat panel on one of the four faces.
     * dir: 0 = +Z (front), 1 = +X, 2 = -Z, 3 = -X
     */
    face(acc, dir, u, ly, out, w, h, color) {
      const off = 0.04 + out;
      let lx, lz;
      if (dir === 0) { lx = u; lz = off; }
      else if (dir === 1) { lx = off; lz = -u; }
      else if (dir === 2) { lx = -u; lz = -off; }
      else { lx = -off; lz = u; }
      acc.add("quad", this.p(lx, ly, lz), [w, h, 1], color, yaw + dir * (Math.PI / 2));
    },
  };
}

/** Half-extent of a face along its own width axis. */
function faceHalf(dir, w, d) {
  return dir === 0 || dir === 2 ? w / 2 : d / 2;
}
function faceOut(dir, w, d) {
  return dir === 0 || dir === 2 ? d / 2 : w / 2;
}

/**
 * Draw one building into the channel bundle.
 *
 * ch      { opaque, glass, emissive, foliage, signs }
 * b       building record from CityBuilder
 * theme   baked colour theme for the zone
 * detail  0 = low, 1 = medium, 2 = high
 */
export function drawBuilding(ch, b, theme, detail = 2) {
  const r = makeRng(b.seed + 7);
  const kind = b.kind;
  const L = localizer(b.x, b.z, b.yaw);

  const wall = jitter(theme.buildings[b.pal % theme.buildings.length], r, 0.07);
  const roofCol = theme.roofs[b.roofPal % theme.roofs.length];
  const trim = theme.trim;

  switch (kind) {
    case "townhouse":
    case "house":
      drawPitched(ch, b, theme, L, r, wall, roofCol, trim, detail, kind === "house");
      break;
    case "warehouse":
    case "factory":
      drawWarehouse(ch, b, theme, L, r, wall, roofCol, trim, detail, kind === "factory");
      break;
    case "parking-structure":
      drawParkingDeck(ch, b, theme, L, r, wall, trim, detail);
      break;
    case "gas-station":
      drawGasStation(ch, b, theme, L, r, wall, trim, detail);
      break;
    default:
      drawBlock(ch, b, theme, L, r, wall, roofCol, trim, detail);
  }
}

/* ------------------------------------------------------------------ shared */

/** Plinth + main mass + pilasters + floor bands, shared by most families. */
function drawShell(ch, b, theme, L, r, wall, trim, groundH, floors, floorH, detail) {
  const { w, d } = b;
  const total = groundH + floors * floorH;
  const base = shade(wall, 0.62);

  L.box(ch.opaque, 0, 0.18, 0, w + 0.55, 0.36, d + 0.55, base); // plinth
  L.box(ch.opaque, 0, total / 2, 0, w, total, d, wall); // mass

  if (detail >= 1) {
    // corner pilasters read as structure and break up flat facades
    const pw = Math.min(0.55, w * 0.06);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        L.box(
          ch.opaque,
          sx * (w / 2 - pw / 2 + 0.05),
          total / 2,
          sz * (d / 2 - pw / 2 + 0.05),
          pw + 0.1,
          total,
          pw + 0.1,
          shade(wall, 1.1),
        );
      }
    }
    // storey bands
    for (let f = 0; f <= floors; f++) {
      const y = groundH + f * floorH;
      if (y > total - 0.05) break;
      L.box(ch.opaque, 0, y, 0, w + 0.16, 0.16, d + 0.16, trim);
    }
  }
  return total;
}

/**
 * The window grid. Windows are single quads sitting just proud of the wall —
 * cheap, and at night a fraction of them switch to the emissive channel so the
 * facade lights up without a single extra light source.
 */
function drawWindows(ch, b, theme, L, r, groundH, floors, floorH, detail, opts = {}) {
  const { w, d } = b;
  // The back face looks into the block interior, which the player can never
  // see, so it never gets windows. On low detail only the street face does.
  const { bandStyle = false, sides = detail === 0 ? [0] : [0, 1, 3], winW = 1.15, winH = 1.5 } = opts;
  const glassCol = theme.window;
  const lit = theme.windowGlow;
  const litCol = theme.windowEmissive;

  for (const dir of sides) {
    const half = faceHalf(dir, w, d);
    const out = faceOut(dir, w, d);
    const usable = half * 2 - 1.6;
    if (usable < 1.4) continue;
    const bays = Math.max(1, Math.round(usable / (winW + 0.95)));
    const gap = usable / bays;

    for (let f = 0; f < floors; f++) {
      const y = groundH + f * floorH + floorH * 0.55;
      if (bandStyle) {
        // continuous curtain-wall ribbon
        L.face(ch.glass, dir, 0, y, out - 0.02, half * 2 - 0.9, floorH * 0.62, glassCol);
        if (lit > 0 && r() < 0.55) {
          L.face(ch.emissive, dir, 0, y, out + 0.005, half * 2 - 1.0, floorH * 0.5,
            shade(litCol, 0.55 + r() * 0.5 * lit));
        }
        if (detail >= 2 && dir === 0) {
          // mullions only on the street face — on a 14-storey tower they are
          // the single most expensive detail in the district
          for (let i = 0; i <= bays; i++) {
            const u = -usable / 2 + i * gap;
            L.box(ch.opaque, ...mullion(dir, u, y, out, w, d), theme.trim);
          }
        }
        continue;
      }
      for (let i = 0; i < bays; i++) {
        const u = -usable / 2 + gap * (i + 0.5);
        const isLit = lit > 0 && r() < 0.42 + 0.3 * lit;
        if (isLit) {
          L.face(ch.emissive, dir, u, y, out, winW, winH, shade(litCol, 0.6 + r() * 0.6));
        } else {
          L.face(ch.glass, dir, u, y, out, winW, winH, glassCol);
        }
        if (detail >= 2 && dir === 0) {
          // reveal: a slim frame that gives the street face depth in raking
          // light. Only the front gets one — the sides are never seen close up.
          L.face(ch.opaque, dir, u, y + winH / 2 + 0.09, out - 0.01, winW + 0.34, 0.16, theme.trim);
        }
      }
    }
  }
}

/** A vertical mullion bar placed on face `dir` at offset `u`. */
function mullion(dir, u, y, out, w, d) {
  const t = 0.14;
  if (dir === 0) return [u, y, out - 0.02, t, 2.0, 0.16];
  if (dir === 1) return [out - 0.02, y, -u, 0.16, 2.0, t];
  if (dir === 2) return [-u, y, -(out - 0.02), t, 2.0, 0.16];
  return [-(out - 0.02), y, u, 0.16, 2.0, t];
}

/** Flat roof: slab, parapet, and a little rooftop plant. */
function drawFlatRoof(ch, b, theme, L, r, top, wall, roofCol, trim, detail) {
  const { w, d } = b;
  L.box(ch.opaque, 0, top + 0.09, 0, w + 0.62, 0.2, d + 0.62, trim); // cornice
  L.box(ch.opaque, 0, top + 0.24, 0, w - 0.5, 0.2, d - 0.5, roofCol); // deck
  const ph = 0.55;
  L.box(ch.opaque, 0, top + 0.19 + ph / 2, d / 2 - 0.15, w, ph, 0.3, shade(wall, 0.92));
  L.box(ch.opaque, 0, top + 0.19 + ph / 2, -(d / 2 - 0.15), w, ph, 0.3, shade(wall, 0.92));
  L.box(ch.opaque, w / 2 - 0.15, top + 0.19 + ph / 2, 0, 0.3, ph, d, shade(wall, 0.92));
  L.box(ch.opaque, -(w / 2 - 0.15), top + 0.19 + ph / 2, 0, 0.3, ph, d, shade(wall, 0.92));

  if (detail < 1) return;
  const grey = shade(theme.trim, 0.6);
  const n = 1 + Math.floor(r() * (detail >= 2 ? 3 : 2));
  for (let i = 0; i < n; i++) {
    const ux = (r() - 0.5) * (w - 3);
    const uz = (r() - 0.5) * (d - 3);
    const s = 0.9 + r() * 0.9;
    L.box(ch.opaque, ux, top + 0.34 + s * 0.3, uz, s * 1.6, s * 0.6, s * 1.2, grey);
    L.box(ch.opaque, ux, top + 0.34 + s * 0.62, uz, s * 1.3, s * 0.1, s * 0.95, shade(grey, 1.25));
  }
  if (detail >= 2 && r() < 0.45) {
    // water tank on legs
    const ux = (r() - 0.5) * (w - 4);
    const uz = (r() - 0.5) * (d - 4);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        L.box(ch.opaque, ux + sx * 0.75, top + 0.9, uz + sz * 0.6, 0.14, 1.3, 0.14, grey);
    L.cyl(ch.opaque, "cyl8", ux, top + 2.2, uz, 1.05, 1.7, shade(theme.trim, 0.8));
    L.cyl(ch.opaque, "cone8", ux, top + 3.28, uz, 1.1, 0.5, shade(theme.trim, 0.66));
  }
  if (detail >= 2 && r() < 0.35) {
    const ux = (r() - 0.5) * (w - 3);
    const uz = (r() - 0.5) * (d - 3);
    L.box(ch.opaque, ux, top + 1.5, uz, 2.4, 2.4, 2.2, shade(wall, 0.9));
    L.box(ch.opaque, ux, top + 2.78, uz, 2.7, 0.2, 2.5, trim);
  }
}

/**
 * Street-level frontage: either a glazed shopfront with awning and lit sign,
 * or a residential entrance with a canopy. This is the detail the player is
 * closest to, so it gets the most geometry.
 */
function drawFrontage(ch, b, theme, L, r, groundH, wall, trim, detail, shop) {
  const { w, d } = b;
  const out = d / 2;

  if (!shop) {
    const doorW = Math.min(1.9, w * 0.28);
    L.face(ch.opaque, 0, 0, groundH * 0.36, out, doorW + 0.5, groundH * 0.72, shade(wall, 0.78));
    L.face(ch.glass, 0, 0, groundH * 0.38, out + 0.03, doorW, groundH * 0.62, shade(theme.window, 1.15));
    L.box(ch.opaque, 0, groundH * 0.74, out + 0.45, doorW + 1.5, 0.16, 1.0, trim); // canopy
    L.box(ch.opaque, 0, groundH * 0.36, out + 0.9, doorW + 1.4, 0.12, 0.35, shade(trim, 0.85)); // step
    if (detail >= 2) {
      L.cyl(ch.opaque, "cyl8", -(doorW / 2 + 0.6), groundH * 0.37, out + 0.85, 0.07, groundH * 0.74, shade(trim, 0.7));
      L.cyl(ch.opaque, "cyl8", doorW / 2 + 0.6, groundH * 0.37, out + 0.85, 0.07, groundH * 0.74, shade(trim, 0.7));
    }
    // a couple of ground-floor windows either side of the door
    const side = w / 2 - 1.5;
    if (side > 2.2) {
      for (const sx of [-1, 1]) {
        L.face(ch.glass, 0, sx * (doorW / 2 + 1.6), groundH * 0.55, out, 1.3, 1.5, theme.window);
      }
    }
    return;
  }

  const glassW = w - 1.5;
  const glassH = groundH * 0.62;
  const gy = groundH * 0.45;
  L.face(ch.opaque, 0, 0, gy, out - 0.01, glassW + 0.5, glassH + 0.5, shade(wall, 0.7)); // reveal
  L.face(ch.glass, 0, 0, gy, out + 0.02, glassW, glassH, shade(theme.window, 1.25));
  if (theme.windowGlow > 0) {
    L.face(ch.emissive, 0, 0, gy, out + 0.05, glassW - 0.25, glassH - 0.25,
      shade(theme.windowEmissive, 0.55 + 0.35 * theme.windowGlow));
  }
  // door + mullions
  L.face(ch.opaque, 0, glassW * 0.3, gy - 0.15, out + 0.06, 1.05, glassH * 0.85, shade(trim, 0.75));
  if (detail >= 1) {
    const bays = Math.max(2, Math.round(glassW / 1.7));
    for (let i = 1; i < bays; i++) {
      const u = -glassW / 2 + (glassW / bays) * i;
      L.box(ch.opaque, u, gy, out + 0.05, 0.1, glassH, 0.1, trim);
    }
  }
  L.box(ch.opaque, 0, gy - glassH / 2 - 0.16, out + 0.05, glassW + 0.6, 0.3, 0.28, shade(wall, 0.78)); // stall riser

  // awning: a tilted slab in the accent/sign colour
  const aw = Math.min(w - 0.6, glassW + 0.9);
  const ay = groundH * 0.82;
  const awnCol = theme.signs[b.signPal % theme.signs.length];
  L.box(ch.opaque, 0, ay, out + 0.72, aw, 0.13, 1.55, awnCol);
  L.box(ch.opaque, 0, ay - 0.19, out + 1.44, aw, 0.34, 0.13, shade(awnCol, 0.8));
  if (detail >= 2) {
    for (const sx of [-1, 1]) {
      L.box(ch.opaque, sx * (aw / 2 - 0.1), ay - 0.28, out + 0.36, 0.09, 0.6, 0.8, shade(awnCol, 0.6));
    }
  }

  // sign board above the awning
  const sy = groundH + 0.62;
  const sw = Math.min(w - 1.2, 6.4);
  const sh = 1.05;
  L.box(ch.opaque, 0, sy, out + 0.14, sw + 0.28, sh + 0.24, 0.22, shade(wall, 0.55));
  if (ch.signs) {
    ch.signs.panel(
      ...L.p(0, sy, out + 0.28),
      sw, sh, L.yaw,
      b.seed % 16,
      theme.signTint,
    );
  }
  if (theme.windowGlow > 0.5 && detail >= 1) {
    // neon underline for night districts
    L.box(ch.emissive, 0, sy - sh / 2 - 0.16, out + 0.3, sw, 0.09, 0.07,
      theme.signs[(b.signPal + 2) % theme.signs.length]);
  }
}

/* --------------------------------------------------------------- families */

function drawBlock(ch, b, theme, L, r, wall, roofCol, trim, detail) {
  const office = b.kind === "office" || b.kind === "tower";
  const groundH = b.shop ? SHOP_H : STOREY * 1.15;
  const floors = Math.max(1, b.storeys - 1);
  const floorH = STOREY;
  const total = drawShell(ch, b, theme, L, r, wall, trim, groundH, floors, floorH, detail);

  drawWindows(ch, b, theme, L, r, groundH, floors, floorH, detail, {
    bandStyle: office,
    winW: b.kind === "hotel" ? 1.05 : 1.2,
  });

  if (b.kind === "hotel" && detail >= 1) drawBalconies(ch, b, theme, L, r, groundH, floors, floorH, wall, trim);
  if (b.kind === "apartment" && detail >= 2 && r() < 0.6)
    drawBalconies(ch, b, theme, L, r, groundH, floors, floorH, wall, trim, 0.5);

  drawFrontage(ch, b, theme, L, r, groundH, wall, trim, detail, b.shop);
  drawFlatRoof(ch, b, theme, L, r, total, wall, roofCol, trim, detail);

  if (b.kind === "tower" && detail >= 1) {
    // slim crown + mast so the skyline is not a flat row of boxes
    const cw = b.w * 0.55;
    const cd = b.d * 0.55;
    L.box(ch.opaque, 0, total + 1.8, 0, cw, 3.2, cd, shade(wall, 0.95));
    L.box(ch.opaque, 0, total + 3.5, 0, cw + 0.4, 0.22, cd + 0.4, trim);
    L.cyl(ch.opaque, "cyl6", 0, total + 5.4, 0, 0.13, 3.6, shade(trim, 0.7));
    ch.emissive.add("ico0", L.p(0, total + 7.3, 0), [0.42, 0.42, 0.42], theme.warning);
  }
  if (office && detail >= 2 && r() < 0.5) {
    ch.emissive.add("box", L.p(0, total + 0.9, 0), [b.w * 0.5, 0.1, 0.1], theme.warning);
  }
}

function drawBalconies(ch, b, theme, L, r, groundH, floors, floorH, wall, trim, chance = 1) {
  const out = b.d / 2;
  const bw = Math.min(b.w * 0.44, 3.4);
  for (let f = 0; f < floors; f++) {
    if (r() > chance) continue;
    const y = groundH + f * floorH + 0.15;
    const u = f % 2 === 0 ? -b.w * 0.2 : b.w * 0.2;
    L.box(ch.opaque, u, y, out + 0.62, bw, 0.14, 1.25, shade(wall, 0.85));
    L.box(ch.opaque, u, y + 0.5, out + 1.2, bw, 0.9, 0.09, shade(trim, 0.95));
    L.box(ch.opaque, u - bw / 2, y + 0.5, out + 0.62, 0.09, 0.9, 1.2, shade(trim, 0.95));
    L.box(ch.opaque, u + bw / 2, y + 0.5, out + 0.62, 0.09, 0.9, 1.2, shade(trim, 0.95));
  }
}

/** Townhouses and suburban houses: gable roof, chimney, dormer, stoop. */
function drawPitched(ch, b, theme, L, r, wall, roofCol, trim, detail, isHouse) {
  const storeys = Math.max(1, Math.min(b.storeys, isHouse ? 2 : 4));
  const groundH = b.shop ? SHOP_H : STOREY * 1.05;
  const floors = Math.max(0, storeys - 1);
  const total = drawShell(ch, b, theme, L, r, wall, trim, groundH, floors, STOREY, detail);

  drawWindows(ch, b, theme, L, r, groundH, floors, STOREY, detail, { winW: 1.05, winH: 1.4 });

  // eaves + gable prism (ridge runs along the building width, i.e. local X)
  const rh = Math.min(3.0, b.d * 0.38);
  L.box(ch.opaque, 0, total + 0.14, 0, b.w + 0.85, 0.28, b.d + 0.85, shade(roofCol, 0.8));
  ch.opaque.add("wedge", L.p(0, total + 0.28 + rh / 2, 0), [b.w + 0.7, rh, b.d + 0.7], roofCol, L.yaw);

  if (detail >= 1) {
    const cx = b.w * 0.3 * (r() < 0.5 ? -1 : 1);
    L.box(ch.opaque, cx, total + rh * 0.65, 0, 0.85, rh * 1.25, 0.85, shade(wall, 0.8));
    L.box(ch.opaque, cx, total + rh * 1.3, 0, 1.05, 0.2, 1.05, shade(trim, 0.8));
  }
  if (detail >= 2 && !isHouse && r() < 0.5) {
    // dormer window poking through the front slope
    const dy = total + rh * 0.42;
    L.box(ch.opaque, 0, dy, b.d * 0.16, 1.5, 1.4, 1.5, wall);
    L.face(ch.glass, 0, 0, dy, b.d * 0.16 + 0.76, 0.9, 0.9, theme.window);
    ch.opaque.add("wedge", L.p(0, dy + 0.95, b.d * 0.16), [1.8, 0.8, 1.8], roofCol, L.yaw);
  }
  drawFrontage(ch, b, theme, L, r, groundH, wall, trim, detail, b.shop);
}

/** Depots and factories: ribbed steel, roller doors, loading dock, roof vents. */
function drawWarehouse(ch, b, theme, L, r, wall, roofCol, trim, detail, isFactory) {
  const h = Math.max(6.5, Math.min(b.storeys, 4) * 2.6);
  const { w, d } = b;
  const steel = mix(wall, theme.trim, 0.25);

  L.box(ch.opaque, 0, 0.2, 0, w + 0.5, 0.4, d + 0.5, shade(steel, 0.55));
  L.box(ch.opaque, 0, h / 2, 0, w, h, d, steel);

  if (detail >= 1) {
    // vertical ribs on the two long faces
    const n = Math.max(3, Math.round(w / 2.0));
    for (let i = 0; i <= n; i++) {
      const u = -w / 2 + (w / n) * i;
      L.box(ch.opaque, u, h / 2, d / 2 + 0.06, 0.16, h - 0.4, 0.14, shade(steel, 1.09));
      L.box(ch.opaque, u, h / 2, -d / 2 - 0.06, 0.16, h - 0.4, 0.14, shade(steel, 0.93));
    }
  }
  // clerestory strip
  L.face(ch.glass, 0, 0, h - 1.25, d / 2, w - 2.2, 1.1, theme.window);
  L.face(ch.glass, 2, 0, h - 1.25, d / 2, w - 2.2, 1.1, theme.window);
  if (theme.windowGlow > 0) {
    L.face(ch.emissive, 0, 0, h - 1.25, d / 2 + 0.03, w - 2.4, 0.9, shade(theme.windowEmissive, 0.5));
  }

  // roller doors along the street face
  const doors = Math.max(1, Math.floor(w / 7));
  const dw = Math.min(4.6, (w - 1.5) / doors - 0.8);
  for (let i = 0; i < doors; i++) {
    const u = -((doors - 1) / 2) * (dw + 1.4) + i * (dw + 1.4);
    L.face(ch.opaque, 0, u, 1.85, d / 2, dw, 3.5, shade(trim, 0.62));
    if (detail >= 1) {
      for (let s = 0; s < 6; s++) {
        L.face(ch.opaque, 0, u, 0.55 + s * 0.56, d / 2 + 0.02, dw - 0.1, 0.16, shade(trim, 0.5));
      }
      L.box(ch.opaque, u, 3.95, d / 2 + 0.5, dw + 0.9, 0.18, 1.1, shade(steel, 0.75)); // canopy
      // dock bumpers
      L.box(ch.opaque, u - dw / 2 - 0.2, 1.1, d / 2 + 0.16, 0.24, 0.5, 0.3, theme.rubber);
      L.box(ch.opaque, u + dw / 2 + 0.2, 1.1, d / 2 + 0.16, 0.24, 0.5, 0.3, theme.rubber);
    }
  }

  // shallow mono-pitch roof
  L.box(ch.opaque, 0, h + 0.2, 0, w + 0.7, 0.4, d + 0.7, shade(roofCol, 0.85));
  if (detail >= 1) {
    const vents = Math.max(2, Math.round(w / 6));
    for (let i = 0; i < vents; i++) {
      const u = -w / 2 + (w / vents) * (i + 0.5);
      L.cyl(ch.opaque, "cyl8", u, h + 0.75, (r() - 0.5) * d * 0.4, 0.42, 0.7, shade(trim, 0.62));
      L.cyl(ch.opaque, "cyl8", u, h + 1.18, (r() - 0.5) * d * 0.4, 0.55, 0.18, shade(trim, 0.5));
    }
  }
  if (isFactory && detail >= 1) {
    const cx = w * 0.32;
    L.cyl(ch.opaque, "cyl8", cx, h + 5.0, -d * 0.2, 1.05, 10, shade(steel, 0.8));
    L.cyl(ch.opaque, "cyl8", cx, h + 10.1, -d * 0.2, 1.2, 0.5, shade(steel, 0.6));
    ch.emissive.add("box", L.p(cx, h + 9.2, -d * 0.2), [0.3, 0.3, 0.3], theme.warning);
  }
  if (ch.signs && detail >= 1) {
    ch.signs.panel(...L.p(0, h - 3.0, d / 2 + 0.16), Math.min(w * 0.5, 6.5), 1.1, L.yaw, (b.seed + 13) % 16, theme.signTint);
  }
}

/** Multi-storey car park: open decks, railings, a lit core. */
function drawParkingDeck(ch, b, theme, L, r, wall, trim, detail) {
  const { w, d } = b;
  const decks = Math.max(3, Math.min(b.storeys, 6));
  const dh = 2.85;
  const conc = mix(wall, theme.trim, 0.4);

  L.box(ch.opaque, 0, 0.2, 0, w + 0.5, 0.4, d + 0.5, shade(conc, 0.6));
  for (let i = 0; i <= decks; i++) {
    const y = i * dh;
    L.box(ch.opaque, 0, y + 0.18, 0, w, 0.36, d, shade(conc, i === 0 ? 0.8 : 1));
    if (i < decks) {
      // spandrel band + open gap, the signature car-park stripe
      L.box(ch.opaque, 0, y + 0.95, d / 2 - 0.1, w, 0.85, 0.24, shade(conc, 1.08));
      L.box(ch.opaque, 0, y + 0.95, -d / 2 + 0.1, w, 0.85, 0.24, shade(conc, 0.9));
      L.box(ch.opaque, w / 2 - 0.1, y + 0.95, 0, 0.24, 0.85, d, shade(conc, 0.95));
      L.box(ch.opaque, -w / 2 + 0.1, y + 0.95, 0, 0.24, 0.85, d, shade(conc, 0.95));
      if (theme.windowGlow > 0) {
        L.box(ch.emissive, 0, y + 1.95, 0, w - 3, 0.09, 0.09, shade(theme.windowEmissive, 0.5));
      }
    }
    // corner columns
    if (detail >= 1 && i < decks) {
      const n = Math.max(2, Math.round(w / 6));
      for (let c = 0; c <= n; c++) {
        const u = -w / 2 + (w / n) * c;
        L.box(ch.opaque, u, y + dh / 2, d / 2 - 0.45, 0.4, dh, 0.4, shade(conc, 1.02));
        L.box(ch.opaque, u, y + dh / 2, -d / 2 + 0.45, 0.4, dh, 0.4, shade(conc, 0.92));
      }
    }
  }
  const top = decks * dh;
  L.box(ch.opaque, 0, top + 0.9, 0, w - 3, 1.5, d - 3, shade(conc, 1.05)); // stair core
  L.box(ch.opaque, 0, top + 1.72, 0, w - 2.6, 0.2, d - 2.6, trim);
  // entrance
  L.face(ch.opaque, 0, -w * 0.28, 1.3, d / 2, 4.2, 2.6, shade(conc, 0.55));
  if (ch.signs) {
    ch.signs.panel(...L.p(w * 0.22, 2.4, d / 2 + 0.2), 3.4, 1.1, L.yaw, 3, theme.signTint);
  }
}

/** Forecourt canopy on pillars, pumps and a small shop. */
function drawGasStation(ch, b, theme, L, r, wall, trim, detail) {
  const { w, d } = b;
  const shopW = Math.min(w * 0.42, 9);
  const shopD = Math.min(d * 0.55, 8);
  const sx = -w / 2 + shopW / 2 + 0.5;

  L.box(ch.opaque, sx, 2.0, 0, shopW, 4.0, shopD, wall);
  L.box(ch.opaque, sx, 4.2, 0, shopW + 0.6, 0.4, shopD + 0.6, trim);
  L.face(ch.glass, 0, 0, 2.0, shopD / 2, shopW - 1.2, 2.4, shade(theme.window, 1.2));
  if (theme.windowGlow > 0) {
    L.face(ch.emissive, 0, 0, 2.0, shopD / 2 + 0.04, shopW - 1.6, 2.1, shade(theme.windowEmissive, 0.7));
  }

  const cx = w * 0.18;
  const cw = w * 0.6;
  const cd = Math.min(d * 0.7, 11);
  const cy = 5.0;
  L.box(ch.opaque, cx, cy, 0, cw, 0.55, cd, theme.trim);
  L.box(ch.opaque, cx, cy - 0.42, 0, cw + 0.35, 0.35, cd + 0.35, theme.signs[b.signPal % theme.signs.length]);
  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) {
      L.box(ch.opaque, cx + px * (cw / 2 - 1.1), cy / 2, pz * (cd / 2 - 1.1), 0.42, cy, 0.42, shade(theme.trim, 0.85));
    }
  }
  // pumps under the canopy
  for (const pz of [-1, 1]) {
    const pxx = cx;
    L.box(ch.opaque, pxx, 0.14, pz * cd * 0.22, 3.2, 0.28, 1.5, shade(theme.trim, 0.6));
    for (const o of [-0.8, 0.8]) {
      L.box(ch.opaque, pxx + o, 0.85, pz * cd * 0.22, 0.7, 1.4, 0.55, shade(wall, 1.05));
      ch.emissive.add("box", L.p(pxx + o, 1.35, pz * cd * 0.22 + 0.3), [0.42, 0.3, 0.06], theme.warning);
    }
  }
  if (theme.windowGlow > 0) {
    ch.emissive.add("box", L.p(cx, cy - 0.42, cd / 2 + 0.2), [cw * 0.9, 0.22, 0.06], theme.accent);
  }
  if (ch.signs) {
    ch.signs.panel(...L.p(sx, 5.4, shopD / 2 + 0.2), shopW - 1.0, 1.2, L.yaw, 13, theme.signTint);
  }
}
