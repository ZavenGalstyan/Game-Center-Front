/**
 * Hulk: Open World 3D — deterministic city generator (framework-free).
 *
 * One connected 960 m × 960 m city on a 96 m road grid (x east, z south,
 * y up). Block (bx, bz) sits between road centre-lines bx·96 … (bx+1)·96.
 *
 *            bx 0 1 2 | 3 4 5 6 | 7 8 9
 *   bz 0-1   RESIDENTIAL ......  | INDUSTRIAL
 *   bz 2-5   RESID. | DOWNTOWN   | INDUSTRIAL
 *   bz 6     ~~~~~~~~~~~ RIVER (bridges at x = 192, 480, 768) ~~~~~~~~~~
 *   bz 7-9   OUTSKIRTS (hills, highway) | MILITARY ZONE (walled)
 *
 * Output (everything the sim and the renderer need):
 *   boxes      static colliders {id,x0,y0,z0,x1,y1,z1,kind,ramp?}
 *   buildings  render records (tiers, skin, roof style)
 *   props      initial destructible / grabbable props
 *   trees      decorative trees (their trunks are static colliders)
 *   sites      named mission / activity locations
 *   landmarks  discoverable places
 *   terrainH(x,z), water(x,z), district(x,z), roadAt(x,z)
 * Changing generation order shifts ids — missions only reference `sites`.
 */
import { rng, clamp, smooth } from "./util.js";

export const PITCH = 96;
export const N = 10;
export const SIZE = PITCH * N; // 960
export const ROAD_HW = 9; // road half width
export const WALK = 4; // sidewalk width
export const LOT = ROAD_HW + WALK; // lot edge offset from a road centre-line
export const RIVER = { z0: 585, z1: 663, bed: -4.2, water: -1.5 };
export const BRIDGES = [192, 480, 768];
export const BOUNDS = { min: -26, max: SIZE + 26 };
export const HIGHWAY = { z: 960, hw: 10, x0: 70, x1: 500, ramp: 64, top: 9 };

export const DISTRICTS = {
  downtown: { name: "Downtown", color: "#5aa9ff" },
  residential: { name: "Residential", color: "#8fd46a" },
  industrial: { name: "Industrial", color: "#f2a541" },
  military: { name: "Military Zone", color: "#e0574a" },
  outskirts: { name: "City Outskirts", color: "#c9b37a" },
};

export function blockDistrict(bx, bz) {
  if (bz === 6) return "outskirts";
  if (bz >= 7) return bx >= 6 ? "military" : "outskirts";
  if (bx >= 7) return "industrial";
  if (bx >= 3 && bx <= 6 && bz >= 2) return "downtown";
  return "residential";
}

/* special blocks */
const RESERVED = {
  "4,3": "plaza", // City Hall Plaza
  "5,3": "apex", // Apex Tower
  "3,5": "arena", // Liberty Square (combat arena / downtown battle)
  "1,2": "park", // Maple Park
  "8,2": "yard", // Dockside yard
  "8,1": "steel", // Steelworks yard (Iron Colossus arena)
  "8,4": "foundry", // The Foundry (factory assault)
  "8,8": "fort", // Fort Bastion parade ground (War Machine arena)
  "1,8": "field", // Long-jump field
  "3,7": "titan", // Titan proving grounds
  "4,8": "range", // vehicle throwing range
  "2,9": "radio", // Radio Hill
  "7,7": "depot", // armour depot
};
const HILL_FREE = new Set(["1,8", "3,7", "4,8", "3,8", "2,7"]);

let CITY = null;
/** the city is generated once and shared (it is immutable after build) */
export function getCity() {
  if (!CITY) CITY = buildCity();
  return CITY;
}

function buildCity() {
  const R = rng(20240917);
  const boxes = [];
  const buildings = [];
  const props = [];
  const trees = [];
  const decor = []; // non-colliding visual bits {type,x,y,z,rot,s}
  const sites = {};
  const landmarks = [];
  const hills = new Map(); // "bx,bz" → [{x,z,r,h}]

  const box = (x0, y0, z0, x1, y1, z1, kind = "bld", extra) => {
    const b = { id: boxes.length, x0: Math.min(x0, x1), y0, z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1, z1: Math.max(z0, z1), kind, ...extra };
    boxes.push(b);
    return b;
  };
  const prop = (type, x, z, rot = 0, extra) => {
    const p = { id: props.length, type, x, y: 0, z, rot, ...extra };
    props.push(p);
    return p;
  };
  const tree = (x, z, s = 1, kind = "round") => {
    trees.push({ x, z, s, kind });
    box(x - 0.45 * s, 0, z - 0.45 * s, x + 0.45 * s, 5.5 * s, z + 0.45 * s, "tree");
  };
  /** building made of stacked tiers (each a collider) */
  const building = (kind, x0, z0, x1, z1, h, skin, o = {}) => {
    const b = { id: buildings.length, kind, x0, z0, x1, z1, h, skin, roof: o.roof || "flat", district: o.district, tiers: [], name: o.name, detail: o.detail || 0, seed: (R() * 1e6) | 0 };
    const tiers = o.tiers || [{ x0, z0, x1, z1, y0: 0, y1: h }];
    for (const t of tiers) {
      b.tiers.push(t);
      box(t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, "bld", { bld: b.id });
    }
    // gable / hip roofs: the collider steps up to the ridge in the middle
    if (b.roof === "gable" || b.roof === "hip") {
      const along = x1 - x0 >= z1 - z0 ? "x" : "z";
      const rh = o.roofH || 2.4;
      b.roofH = rh;
      b.ridge = along;
      if (along === "x") {
        const m = (z1 - z0) * 0.25;
        box(x0 + 0.4, h, z0 + m, x1 - 0.4, h + rh * 0.55, z1 - m, "roof", { bld: b.id });
      } else {
        const m = (x1 - x0) * 0.25;
        box(x0 + m, h, z0 + 0.4, x1 - m, h + rh * 0.55, z1 - 0.4, "roof", { bld: b.id });
      }
    }
    if (b.roof === "vault") {
      b.roofH = o.roofH || 4;
      box(x0 + (x1 - x0) * 0.2, h, z0, x1 - (x1 - x0) * 0.2, h + b.roofH * 0.8, z1, "roof", { bld: b.id });
    }
    // rooftop clutter on flat roofs (AC units / water tanks) — small colliders
    if (b.roof === "flat" && o.clutter !== false) {
      const top = tiers[tiers.length - 1];
      const w = top.x1 - top.x0;
      const d = top.z1 - top.z0;
      if (w > 10 && d > 10) {
        const n = 1 + Math.floor(R() * 3);
        b.clutter = [];
        for (let i = 0; i < n; i++) {
          const cx = top.x0 + 3 + R() * (w - 6);
          const cz = top.z0 + 3 + R() * (d - 6);
          const big = R() < 0.25 && w > 18;
          const c = big ? { t: "tank", x: cx, z: cz, y: top.y1, r: 1.6, h: 4.2 } : { t: "ac", x: cx, z: cz, y: top.y1, w: 2.2, d: 1.6, h: 1.3 };
          b.clutter.push(c);
          if (big) box(cx - 1.6, top.y1, cz - 1.6, cx + 1.6, top.y1 + 4.2, cz + 1.6, "roofprop");
          else box(cx - 1.1, top.y1, cz - 0.8, cx + 1.1, top.y1 + 1.3, cz + 0.8, "roofprop");
        }
      }
    }
    buildings.push(b);
    return b;
  };

  /* ---------------------------------------------------------------- hills (outskirts) */
  for (let bz = 7; bz < N; bz++) {
    for (let bx = 0; bx < 6; bx++) {
      const k = `${bx},${bz}`;
      if (HILL_FREE.has(k)) continue;
      const list = [];
      const n = k === "2,9" ? 1 : 2 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        if (k === "2,9") list.push({ x: bx * PITCH + 48, z: bz * PITCH + 46, r: 40, h: 13 });
        else list.push({ x: bx * PITCH + 20 + R() * 56, z: bz * PITCH + 20 + R() * 56, r: 18 + R() * 20, h: 3 + R() * 7 });
      }
      hills.set(k, list);
    }
  }
  // the highway runs along the southern edge: no hills under it
  const terrainH = (x, z) => {
    if (z > RIVER.z0 && z < RIVER.z1) {
      const d = Math.min(z - RIVER.z0, RIVER.z1 - z);
      if (d < 5) return 0;
      if (d < 15) return RIVER.bed * smooth((d - 5) / 10);
      return RIVER.bed;
    }
    if (z < 6 * PITCH + LOT || x > 6 * PITCH) return 0;
    const bx = Math.floor(x / PITCH);
    const bz = Math.floor(z / PITCH);
    const list = hills.get(`${bx},${bz}`);
    if (!list) return 0;
    const lx = x - bx * PITCH;
    const lz = z - bz * PITCH;
    const edge = Math.min(lx, PITCH - lx, lz, PITCH - lz) - LOT;
    if (edge <= 0) return 0;
    let h = 0;
    for (const p of list) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) h += p.h * smooth(1 - d / p.r);
    }
    return h * smooth(edge / 12);
  };
  const water = (x, z) => z > RIVER.z0 + 9 && z < RIVER.z1 - 9 && !BRIDGES.some((bx) => Math.abs(x - bx) < ROAD_HW + 1);
  const roadAt = (x, z) => {
    const rx = Math.abs(x - Math.round(x / PITCH) * PITCH) <= ROAD_HW;
    const rz = Math.abs(z - Math.round(z / PITCH) * PITCH) <= ROAD_HW;
    if (z > RIVER.z0 && z < RIVER.z1) return rx && BRIDGES.includes(Math.round(x / PITCH) * PITCH);
    return rx || rz;
  };
  const district = (x, z) => blockDistrict(clamp(Math.floor(x / PITCH), 0, N - 1), clamp(Math.floor(z / PITCH), 0, N - 1));

  /* ---------------------------------------------------------------- river: bridges + quay walls */
  for (const bx of BRIDGES) {
    const grand = bx === 480;
    const hw = grand ? ROAD_HW + 2 : ROAD_HW;
    box(bx - hw, -0.9, RIVER.z0 - 1, bx + hw, 0, RIVER.z1 + 1, "deck", { bridge: true });
    box(bx - hw - 0.6, 0, RIVER.z0 + 4, bx - hw, 1.15, RIVER.z1 - 4, "rail");
    box(bx + hw, 0, RIVER.z0 + 4, bx + hw + 0.6, 1.15, RIVER.z1 - 4, "rail");
    if (grand) {
      // suspension towers of the Grand Bridge (landmark)
      for (const z of [RIVER.z0 + 20, RIVER.z1 - 20]) {
        for (const sx of [-1, 1]) box(bx + sx * (hw + 0.3) - 1.2, 0, z - 1.2, bx + sx * (hw + 0.3) + 1.2, 34, z + 1.2, "pylon");
      }
      landmarks.push({ id: "bridge", name: "Grand Bridge", x: bx, z: (RIVER.z0 + RIVER.z1) / 2, r: 30 });
    }
    // piers under the deck
    for (let z = RIVER.z0 + 18; z < RIVER.z1 - 10; z += 22) box(bx - 2, RIVER.bed, z - 1.5, bx + 2, -0.9, z + 1.5, "pier");
  }
  // dead-end barriers where other north-south roads meet the river
  for (let i = 0; i <= N; i++) {
    const x = i * PITCH;
    if (BRIDGES.includes(x)) continue;
    for (const z of [RIVER.z0 + 1, RIVER.z1 - 1]) prop("concrete", x - 3, z, 0, { fixedY: 0 }), prop("concrete", x + 3, z, 0);
  }

  /* ---------------------------------------------------------------- elevated highway (outskirts) */
  {
    const H = HIGHWAY;
    box(H.x0, H.top - 0.9, H.z - H.hw, H.x1, H.top, H.z + H.hw, "deck", { highway: true });
    box(H.x0 - H.ramp, -0.5, H.z - H.hw, H.x0, H.top, H.z + H.hw, "ramp", { ramp: { axis: "x", a: H.x0 - H.ramp, b: H.x0, h0: 0, h1: H.top } });
    box(H.x1, -0.5, H.z - H.hw, H.x1 + H.ramp, H.top, H.z + H.hw, "ramp", { ramp: { axis: "x", a: H.x1, b: H.x1 + H.ramp, h0: H.top, h1: 0 } });
    for (let x = H.x0 + 14; x < H.x1; x += 30) box(x - 1.3, 0, H.z - 1.3, x + 1.3, H.top - 0.9, H.z + 1.3, "pillar");
    for (const s of [-1, 1]) box(H.x0, H.top, H.z + s * H.hw - 0.3, H.x1, H.top + 1.1, H.z + s * H.hw + 0.3, "rail");
  }

  /* ---------------------------------------------------------------- street furniture + parked cars */
  const PARK = { downtown: 0.26, residential: 0.22, industrial: 0.12, outskirts: 0.05, military: 0 };
  const CAR_TYPES = ["car", "car", "car", "taxi", "van"];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j < N; j++) {
      // segment along z of the road x = i*96 between z = j*96 and (j+1)*96, and the transposed one
      for (const axis of ["x", "z"]) {
        const c = i * PITCH; // road centre-line coordinate
        const a0 = j * PITCH + LOT + 4;
        const a1 = (j + 1) * PITCH - LOT - 4;
        const mid = (a0 + a1) / 2;
        // the block on either side decides the district; river row has no roads crossing water
        const sample = (side) => (axis === "x" ? district(c + side * 20, mid) : district(mid, c + side * 20));
        if (axis === "x" && j === 6 && !BRIDGES.includes(c)) continue; // no road over the river
        if (axis === "x" && j === 6) continue; // bridge: no parking / furniture
        if (axis === "z" && j === 9 && c === 960) continue;
        if (axis === "z" && c === 960) {
          // the southern edge road is the highway's ground road
        }
        for (const side of [-1, 1]) {
          const pos = c + side * 0;
          if ((side < 0 && c === 0) || (side > 0 && c === SIZE)) continue; // outer edges: no sidewalk beyond the city
          const dist = sample(side);
          if (axis === "z" && ((c === 576 && side > 0) || (c === 672 && side < 0))) {
            // riverside promenade: lamps + benches only
            for (let a = a0; a <= a1; a += 18) {
              prop("lamp", a, c + side * (ROAD_HW + 1), 0);
              if (R() < 0.5) prop("bench", a + 6, c + side * (ROAD_HW + 2.6), side > 0 ? 0 : Math.PI);
            }
            continue;
          }
          if (dist === "military") continue; // the military zone has its own walls
          // lamps on the sidewalk
          for (let a = a0 + 4; a <= a1; a += 22) {
            const off = side * (ROAD_HW + 0.9);
            if (axis === "x") prop("lamp", pos + off, a, side > 0 ? -Math.PI / 2 : Math.PI / 2);
            else prop("lamp", a, pos + off, side > 0 ? Math.PI : 0);
          }
          // sidewalk furniture
          for (let a = a0 + 12; a <= a1 - 6; a += 22) {
            const r = R();
            const off = side * (ROAD_HW + 2.6);
            const type = r < 0.25 ? "bench" : r < 0.42 ? "bin" : r < 0.52 ? "hydrant" : null;
            if (!type) continue;
            const rot = axis === "x" ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0;
            if (axis === "x") prop(type, pos + off, a, rot);
            else prop(type, a, pos + off, rot);
          }
          // parked cars in the curb lane
          const pk = PARK[dist] || 0;
          for (let a = a0 + 2; a <= a1 - 2; a += 7.5) {
            if (R() >= pk) continue;
            const off = side * (ROAD_HW - 1.6);
            const type = R.pick(CAR_TYPES);
            const flip = R() < 0.5 ? 0 : Math.PI;
            if (axis === "x") prop(type, pos + off, a, flip, { color: (R() * 1e6) | 0 });
            else prop(type, a, pos + off, Math.PI / 2 + flip, { color: (R() * 1e6) | 0 });
          }
        }
      }
    }
  }
  // traffic lights on intersection corners (city districts only)
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const x = i * PITCH;
      const z = j * PITCH;
      if (j === 6 || j === 7) continue;
      const d = district(x + 1, z + 1);
      if (d === "military" || d === "outskirts") continue;
      prop("light", x + ROAD_HW + 0.8, z + ROAD_HW + 0.8, Math.PI);
      prop("light", x - ROAD_HW - 0.8, z - ROAD_HW - 0.8, 0);
    }
  }

  /* ---------------------------------------------------------------- blocks */
  for (let bz = 0; bz < N; bz++) {
    for (let bx = 0; bx < N; bx++) {
      if (bz === 6) {
        // river row: riverside lawns, trees along both banks
        for (let x = bx * PITCH + LOT + 4; x < (bx + 1) * PITCH - LOT; x += 13) {
          if (BRIDGES.some((b) => Math.abs(x - b) < 16)) continue;
          tree(x + R() * 4, RIVER.z0 + 2.8, 0.9 + R() * 0.3);
          tree(x + R() * 4, RIVER.z1 - 2.8, 0.9 + R() * 0.3);
        }
        continue;
      }
      const dist = blockDistrict(bx, bz);
      const X0 = bx * PITCH + LOT;
      const Z0 = bz * PITCH + LOT;
      const X1 = (bx + 1) * PITCH - LOT;
      const Z1 = (bz + 1) * PITCH - LOT;
      const key = `${bx},${bz}`;
      const special = RESERVED[key];
      const cx = (X0 + X1) / 2;
      const cz = (Z0 + Z1) / 2;
      if (special) {
        buildSpecial(special, { X0, Z0, X1, Z1, cx, cz, bx, bz, dist });
        continue;
      }
      if (dist === "downtown") downtownBlock(X0, Z0, X1, Z1);
      else if (dist === "residential") residentialBlock(X0, Z0, X1, Z1, bx, bz);
      else if (dist === "industrial") industrialBlock(X0, Z0, X1, Z1);
      else if (dist === "military") militaryBlock(X0, Z0, X1, Z1, bx, bz);
      else outskirtsBlock(X0, Z0, X1, Z1, bx, bz);
    }
  }

  function towerTiers(x0, z0, x1, z1, h) {
    if (h < 40) return [{ x0, z0, x1, z1, y0: 0, y1: h }];
    const t = [];
    const podium = 8 + Math.floor(R() * 3) * 2;
    t.push({ x0, z0, x1, z1, y0: 0, y1: podium });
    const i1 = 2 + R() * 2;
    const mid = h * (0.55 + R() * 0.15);
    t.push({ x0: x0 + i1, z0: z0 + i1, x1: x1 - i1, z1: z1 - i1, y0: podium, y1: mid });
    const i2 = i1 + 2.5 + R() * 2;
    if (x1 - x0 - 2 * i2 > 8 && z1 - z0 - 2 * i2 > 8) t.push({ x0: x0 + i2, z0: z0 + i2, x1: x1 - i2, z1: z1 - i2, y0: mid, y1: h });
    else t[1].y1 = h;
    return t;
  }

  function downtownBlock(X0, Z0, X1, Z1) {
    const r = R();
    const HS = [13, 16, 19, 22, 26, 32, 42, 56, 70, 88];
    const skins = ["glass", "glassB", "concrete", "dark", "brick"];
    if (r < 0.55) {
      const w = (X1 - X0) / 2;
      const d = (Z1 - Z0) / 2;
      for (let qx = 0; qx < 2; qx++) {
        for (let qz = 0; qz < 2; qz++) {
          const x0 = X0 + qx * w + 1.5;
          const z0 = Z0 + qz * d + 1.5;
          const fw = w - 3 - R() * 4;
          const fd = d - 3 - R() * 4;
          const h = R.pick(HS);
          const ox = qx ? w - 3 - fw : 0;
          const oz = qz ? d - 3 - fd : 0;
          building(h > 30 ? "tower" : "office", x0 + ox, z0 + oz, x0 + ox + fw, z0 + oz + fd, h, h > 30 ? R.pick(["glass", "glassB", "dark"]) : R.pick(skins), { district: "downtown", tiers: towerTiers(x0 + ox, z0 + oz, x0 + ox + fw, z0 + oz + fd, h) });
        }
      }
    } else if (r < 0.8) {
      const d = (Z1 - Z0 - 6) / 2;
      for (let k = 0; k < 2; k++) {
        const h = R.pick([14, 18, 22, 26, 30]);
        building("office", X0 + 2, Z0 + k * (d + 6), X1 - 2, Z0 + k * (d + 6) + d, h, R.pick(skins), { district: "downtown" });
      }
    } else {
      const h = R.pick([60, 76, 96]);
      building("tower", X0 + 12, Z0 + 4, X1 - 12, Z0 + 46, h, R.pick(["glass", "glassB", "dark"]), { district: "downtown", tiers: towerTiers(X0 + 12, Z0 + 4, X1 - 12, Z0 + 46, h) });
      // small plaza south of the tower: planters and benches
      for (let k = 0; k < 4; k++) {
        tree(X0 + 10 + k * 17, Z1 - 8, 0.85);
        prop("bench", X0 + 18 + k * 17, Z1 - 12, Math.PI);
      }
    }
  }

  function residentialBlock(X0, Z0, X1, Z1, bx, bz) {
    if (R() < 0.3 && !(bz === 0 && bx < 3)) {
      // apartment slabs + parking court
      for (const zz of [Z0 + 2, Z1 - 22]) building("apartment", X0 + 3, zz, X1 - 3, zz + 20, R.pick([12, 15, 18, 21]), R.pick(["brick", "concrete", "stucco"]), { district: "residential" });
      for (let x = X0 + 6; x < X1 - 6; x += 6) if (R() < 0.5) prop(R.pick(["car", "car", "van"]), x, (Z0 + Z1) / 2 + (R() < 0.5 ? -4 : 4), 0, { color: (R() * 1e6) | 0 });
      for (let x = X0 + 4; x < X1; x += 14) tree(x, (Z0 + Z1) / 2 + R() * 2 - 1, 0.8);
      return;
    }
    const n = 3;
    const w = (X1 - X0) / n;
    const d = (Z1 - Z0) / n;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const lx0 = X0 + i * w;
        const lz0 = Z0 + k * d;
        if (i === 1 && k === 1) {
          // backyard commons: trees
          tree(lx0 + w / 2, lz0 + d / 2, 1.1);
          tree(lx0 + w * 0.25, lz0 + d * 0.3, 0.9);
          continue;
        }
        const hw = 11 + R() * 3;
        const hd = 9 + R() * 2.5;
        // face the nearest street: houses sit toward the block edge
        const fx = i === 0 ? lx0 + 2 : i === 2 ? lx0 + w - 2 - hw : lx0 + (w - hw) / 2;
        const fz = k === 0 ? lz0 + 4 : k === 2 ? lz0 + d - 4 - hd : lz0 + (d - hd) / 2;
        const h = 5.4 + R() * 2.6;
        building("house", fx, fz, fx + hw, fz + hd, h, R.pick(["stucco", "brick", "stucco", "wood"]), { district: "residential", roof: R() < 0.6 ? "gable" : "hip", roofH: 2.6, clutter: false });
        // front fence segments along the street-facing side
        if (k === 0 || k === 2) {
          const zf = k === 0 ? lz0 + 0.8 : lz0 + d - 0.8;
          for (let x = lx0 + 2.5; x < lx0 + w - 2; x += 4.2) if (Math.abs(x - (fx + hw / 2)) > 3) prop("fence", x, zf, 0);
        }
        if (R() < 0.6) tree(lx0 + (i === 0 ? w - 4 : 4), lz0 + (k === 0 ? d - 4 : 4), 0.8 + R() * 0.4);
      }
    }
  }

  function industrialBlock(X0, Z0, X1, Z1) {
    const r = R();
    if (r < 0.4) {
      building("warehouse", X0 + 2, Z0 + 2, X1 - 2, Z0 + 28, 10 + R() * 4, "warehouse", { district: "industrial", roof: "flat" });
      building("warehouse", X0 + 2, Z1 - 26, X1 - 30, Z1 - 2, 9 + R() * 3, "metal", { district: "industrial" });
      stacks(X1 - 26, Z1 - 26, X1 - 2, Z1 - 2);
      yardJunk(X0 + 4, Z0 + 32, X1 - 4, Z1 - 30);
    } else if (r < 0.7) {
      // fuel farm
      for (let k = 0; k < 3; k++) {
        const x = X0 + 14 + k * 22;
        const z = Z0 + 16;
        box(x - 7, 0, z - 7, x + 7, 12, z + 7, "silo");
        decor.push({ type: "silo", x, y: 0, z, r: 7, h: 12 });
      }
      building("warehouse", X0 + 4, Z1 - 30, X1 - 4, Z1 - 4, 11, "metal", { district: "industrial" });
      yardJunk(X0 + 4, Z0 + 32, X1 - 4, Z0 + 38);
    } else {
      stacks(X0 + 2, Z0 + 2, X1 - 2, Z0 + 30);
      building("warehouse", X0 + 6, Z1 - 30, X1 - 6, Z1 - 3, 12, "warehouse", { district: "industrial" });
      yardJunk(X0 + 4, Z0 + 34, X1 - 4, Z1 - 34);
    }
  }
  /** container stacks: 12 × 2.6 × 2.6 m boxes, 1-3 high, walkable tops */
  function stacks(x0, z0, x1, z1) {
    for (let z = z0 + 2; z + 2.8 < z1; z += 3.4) {
      if (R() < 0.25) continue;
      for (let x = x0 + 1; x + 12.4 < x1; x += 13.2) {
        const n = 1 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++) {
          box(x, k * 2.6, z, x + 12.2, (k + 1) * 2.6, z + 2.6, "container", { color: Math.floor(R() * 6) });
        }
      }
    }
  }
  function yardJunk(x0, z0, x1, z1) {
    const n = 4 + Math.floor(R() * 5);
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * (x1 - x0);
      const z = z0 + R() * (z1 - z0);
      const t = R.pick(["barrel", "barrel", "crate", "crate", "concrete"]);
      prop(t, x, z, R() * Math.PI, t === "barrel" ? { red: R() < 0.5 } : undefined);
    }
  }

  function militaryBlock(X0, Z0, X1, Z1) {
    const r = R();
    if (r < 0.45) {
      building("hangar", X0 + 6, Z0 + 4, X1 - 6, Z0 + 30, 9, "military", { district: "military", roof: "vault", roofH: 5 });
      building("bunker", X0 + 4, Z1 - 14, X0 + 18, Z1 - 4, 4, "bunker", { district: "military", clutter: false });
      building("bunker", X1 - 18, Z1 - 14, X1 - 4, Z1 - 4, 4, "bunker", { district: "military", clutter: false });
    } else {
      for (let k = 0; k < 3; k++) building("barracks", X0 + 4 + k * 23, Z0 + 4, X0 + 21 + k * 23, Z0 + 16, 4.5, "barracks", { district: "military", roof: "gable", roofH: 1.8, clutter: false });
      watchtower(X1 - 8, Z1 - 8);
    }
    for (let i = 0; i < 6; i++) prop(R() < 0.5 ? "sandbag" : "mcrate", X0 + 8 + R() * (X1 - X0 - 16), Z0 + 36 + R() * 18, R() * Math.PI);
    if (R() < 0.6) prop("van", X0 + 12 + R() * 40, Z0 + 56, Math.PI / 2, { military: true });
  }
  function watchtower(x, z) {
    box(x - 2, 0, z - 2, x + 2, 9, z + 2, "watch");
    decor.push({ type: "watch", x, y: 0, z, h: 9 });
  }

  function outskirtsBlock(X0, Z0, X1, Z1, bx, bz) {
    const r = R();
    const g = (x, z) => terrainH(x, z);
    if (bz === 9 || r < 0.35) {
      // farm: barn + silo
      const x = X0 + 10 + R() * 20;
      const z = Z0 + 10 + R() * 20;
      const y = g(x + 7, z + 5);
      building("barn", x, z, x + 14, z + 10, 7 + y, "barn", { district: "outskirts", roof: "gable", roofH: 3.2, clutter: false });
      box(x + 18, 0, z, x + 23, 13 + y, z + 5, "silo");
      decor.push({ type: "farmsilo", x: x + 20.5, y: 0, z: z + 2.5, r: 2.5, h: 13 + y });
    } else if (r < 0.55) {
      // gas station: canopy on four posts + shop
      const x = X0 + 6;
      const z = Z0 + 6;
      for (const [px, pz] of [[2, 2], [20, 2], [2, 12], [20, 12]]) box(x + px - 0.4, 0, z + pz - 0.4, x + px + 0.4, 5, z + pz + 0.4, "post");
      box(x, 5, z, x + 22, 5.7, z + 14, "canopy");
      decor.push({ type: "canopy", x: x + 11, y: 5, z: z + 7, w: 22, d: 14 });
      building("shop", x + 28, z, x + 44, z + 12, 4.5, "stucco", { district: "outskirts" });
      for (let k = 0; k < 3; k++) prop("car", x + 6 + k * 5, z + 7, Math.PI / 2, { color: (R() * 1e6) | 0 });
    }
    // trees on hills
    const n = 8 + Math.floor(R() * 8);
    for (let i = 0; i < n; i++) {
      const x = X0 + 3 + R() * (X1 - X0 - 6);
      const z = Z0 + 3 + R() * (Z1 - Z0 - 6);
      if (boxes.some((b) => b.kind !== "tree" && x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3)) continue;
      if (Math.abs(z - HIGHWAY.z) < HIGHWAY.hw + 4) continue;
      tree(x, z, 0.9 + R() * 0.6, R() < 0.5 ? "pine" : "round");
    }
    if (R() < 0.5) decor.push({ type: "billboard", x: X0 + 10 + R() * 50, y: 0, z: Z0 + 4, rot: 0, i: Math.floor(R() * 4) });
  }

  /* ---------------------------------------------------------------- reserved blocks */
  function buildSpecial(kind, B) {
    const { X0, Z0, X1, Z1, cx, cz } = B;
    switch (kind) {
      case "plaza": {
        building("cityhall", X0 + 12, Z0 + 2, X1 - 12, Z0 + 20, 16, "civic", { district: "downtown", name: "City Hall", roof: "flat" });
        box(cx - 6, 0, cz + 4, cx + 6, 0.9, cz + 16, "fountain");
        box(cx - 1.5, 0.9, cz + 8.5, cx + 1.5, 3.5, cz + 11.5, "fountain"); // central column + dish
        decor.push({ type: "fountain", x: cx, y: 0, z: cz + 10 });
        for (const sx of [-1, 1]) {
          for (let k = 0; k < 3; k++) tree(cx + sx * 26, Z0 + 30 + k * 13, 0.9);
          prop("bench", cx + sx * 18, cz + 10, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
        }
        sites.plaza = { x: cx, z: cz + 22, name: "City Hall Plaza" };
        sites.plazaRoof = { x: cx, z: Z0 + 11, y: 16, name: "City Hall roof" };
        landmarks.push({ id: "cityhall", name: "City Hall Plaza", x: cx, z: cz + 10, r: 34 });
        break;
      }
      case "apex": {
        const t = [
          { x0: X0 + 4, z0: Z0 + 4, x1: X1 - 4, z1: Z1 - 4, y0: 0, y1: 12 },
          { x0: X0 + 12, z0: Z0 + 12, x1: X1 - 12, z1: Z1 - 12, y0: 12, y1: 90 },
          { x0: X0 + 18, z0: Z0 + 18, x1: X1 - 18, z1: Z1 - 18, y0: 90, y1: 150 },
        ];
        building("apex", X0 + 4, Z0 + 4, X1 - 4, Z1 - 4, 150, "glass", { district: "downtown", name: "Apex Tower", tiers: t, clutter: false });
        sites.apexPodium = { x: X0 + 8, z: Z0 + 8, y: 12, name: "Apex podium" };
        landmarks.push({ id: "apex", name: "Apex Tower", x: cx, z: cz, r: 50 });
        break;
      }
      case "arena": {
        // Liberty Square: open paving with a statue plinth and low planters
        box(cx - 3, 0, cz - 3, cx + 3, 3.2, cz + 3, "plinth");
        decor.push({ type: "statue", x: cx, y: 3.2, z: cz });
        for (const [dx, dz] of [[-24, -24], [24, -24], [-24, 24], [24, 24]]) tree(cx + dx, cz + dz, 1);
        building("office", X0 + 2, Z0 + 2, X0 + 22, Z0 + 18, 14, "concrete", { district: "downtown" });
        building("office", X1 - 22, Z1 - 18, X1 - 2, Z1 - 2, 18, "brick", { district: "downtown" });
        for (let k = 0; k < 4; k++) prop("car", X0 + 30 + k * 6, Z1 - 6, Math.PI / 2, { color: (R() * 1e6) | 0 });
        sites.arena = { x: cx, z: cz + 12, name: "Liberty Square" };
        landmarks.push({ id: "liberty", name: "Liberty Square", x: cx, z: cz, r: 32 });
        break;
      }
      case "park": {
        // Maple Park: pond, trees, paths, benches
        decor.push({ type: "pond", x: cx + 10, y: 0, z: cz - 8, r: 12 });
        for (let i = 0; i < 26; i++) {
          const x = X0 + 4 + R() * (X1 - X0 - 8);
          const z = Z0 + 4 + R() * (Z1 - Z0 - 8);
          if (Math.hypot(x - cx - 10, z - cz + 8) < 15 || Math.hypot(x - cx, z - cz - 18) < 12) continue;
          tree(x, z, 0.9 + R() * 0.5);
        }
        for (let k = 0; k < 6; k++) prop("bench", cx - 24 + k * 9, cz + 24, 0);
        sites.park = { x: cx - 4, z: cz + 18, name: "Maple Park" };
        landmarks.push({ id: "park", name: "Maple Park", x: cx, z: cz, r: 36 });
        break;
      }
      case "yard": {
        stacks(X0 + 2, Z0 + 2, X1 - 2, Z0 + 18);
        building("warehouse", X1 - 26, Z1 - 30, X1 - 2, Z1 - 2, 11, "warehouse", { district: "industrial" });
        for (let i = 0; i < 18; i++) prop(R.pick(["barrel", "crate", "crate", "concrete", "barrel"]), X0 + 6 + R() * 40, Z0 + 26 + R() * 34, R() * 3, { red: R() < 0.6 });
        for (let k = 0; k < 4; k++) prop(k % 2 ? "van" : "car", X0 + 10 + k * 8, Z1 - 6, Math.PI / 2, { color: (R() * 1e6) | 0 });
        sites.yard = { x: cx - 8, z: cz + 6, name: "Dockside Yard" };
        break;
      }
      case "steel": {
        // Steelworks: a huge open yard ringed by tall sheds (Iron Colossus arena)
        building("factory", X0 + 2, Z0 + 2, X0 + 22, Z1 - 2, 18, "metal", { district: "industrial" });
        box(X0 + 8, 18, Z0 + 10, X0 + 13, 42, Z0 + 15, "chimney");
        decor.push({ type: "chimney", x: X0 + 10.5, y: 18, z: Z0 + 12.5, r: 2.5, h: 24 });
        for (let i = 0; i < 10; i++) prop(R.pick(["concrete", "barrel", "crate"]), X0 + 30 + R() * 38, Z0 + 6 + R() * 60, R() * 3, { red: R() < 0.5 });
        sites.steel = { x: cx + 10, z: cz, name: "Steelworks" };
        landmarks.push({ id: "steel", name: "Steelworks", x: cx, z: cz, r: 36 });
        break;
      }
      case "foundry": {
        // The Foundry: an enclosed hall (walls + roof slab) with a breakable south wall
        const fx0 = X0 + 6;
        const fx1 = X1 - 6;
        const fz0 = Z0 + 6;
        const fz1 = Z1 - 14;
        const H = 15;
        const T = 1.2;
        const b = { id: buildings.length, kind: "foundry", x0: fx0, z0: fz0, x1: fx1, z1: fz1, h: H, skin: "metal", roof: "hall", district: "industrial", tiers: [], name: "The Foundry", seed: 1 };
        buildings.push(b);
        const gapC = (fx0 + fx1) / 2;
        const add = (x0, z0, x1, z1, y0, y1) => {
          b.tiers.push({ x0, z0, x1, z1, y0, y1 });
          box(x0, y0, z0, x1, y1, z1, "bld", { bld: b.id });
        };
        add(fx0, fz0, fx1, fz0 + T, 0, H); // north wall
        add(fx0, fz0, fx0 + T, fz1, 0, H); // west wall
        add(fx1 - T, fz0, fx1, fz1, 0, H); // east wall
        add(fx0, fz1 - T, gapC - 5, fz1, 0, H); // south wall, left of the breach
        add(gapC + 5, fz1 - T, fx1, fz1, 0, H); // south wall, right
        add(gapC - 5, fz1 - T, gapC + 5, fz1, 6, H); // lintel above the breakable section
        add(fx0, fz0, fx1, fz1, H - 1, H); // roof slab (tier for rendering)
        box(fx0 + 10, H, fz0 + 8, fx0 + 15, H + 22, fz0 + 13, "chimney");
        decor.push({ type: "chimney", x: fx0 + 12.5, y: H, z: fz0 + 10.5, r: 2.5, h: 22 });
        prop("wallSec", gapC, fz1 - T / 2, 0, { tag: "foundryWall" });
        prop("reactor", (fx0 + fx1) / 2, (fz0 + fz1) / 2 - 4, 0, { tag: "reactor", inert: true });
        for (let i = 0; i < 8; i++) prop(R.pick(["barrel", "crate"]), fx0 + 6 + R() * (fx1 - fx0 - 12), fz0 + 6 + R() * 10, R() * 3, { red: true });
        sites.foundryOut = { x: gapC, z: fz1 + 8, name: "Foundry gate" };
        sites.foundryIn = { x: gapC, z: (fz0 + fz1) / 2 + 6, name: "Foundry hall" };
        landmarks.push({ id: "foundry", name: "The Foundry", x: gapC, z: (fz0 + fz1) / 2, r: 34 });
        break;
      }
      case "fort": {
        // Fort Bastion: HQ along the south side, open parade ground (boss arena)
        building("hq", X0 + 8, Z1 - 20, X1 - 8, Z1 - 2, 12, "military", { district: "military", name: "Fort Bastion HQ" });
        watchtower(X0 + 4, Z0 + 4);
        watchtower(X1 - 4, Z0 + 4);
        for (let i = 0; i < 8; i++) prop(R() < 0.5 ? "mcrate" : "barrel", X0 + 6 + R() * 60, Z0 + 10 + R() * 8, R() * 3, { red: true });
        sites.fort = { x: cx, z: cz - 4, name: "Fort Bastion" };
        landmarks.push({ id: "fort", name: "Fort Bastion", x: cx, z: cz, r: 36 });
        break;
      }
      case "depot": {
        building("hangar", X0 + 4, Z0 + 30, X1 - 4, Z1 - 4, 10, "military", { district: "military", roof: "vault", roofH: 5 });
        for (let k = 0; k < 3; k++) prop("van", X0 + 14 + k * 18, Z0 + 14, Math.PI / 2, { military: true });
        sites.depot = { x: (X0 + X1) / 2, z: Z0 + 12, name: "Armour Depot" };
        break;
      }
      case "field":
        sites.field = { x: cx - 26, z: cz, name: "Long-Jump Field" };
        for (let k = 0; k < 6; k++) tree(X1 - 4, Z0 + 6 + k * 12, 1);
        break;
      case "titan":
        sites.titan = { x: cx, z: cz, name: "Proving Grounds" };
        for (let k = 0; k < 4; k++) prop("concrete", cx - 20 + k * 13, cz - 22, 0);
        for (let k = 0; k < 4; k++) prop("car", cx - 22 + k * 14, cz + 26, 0, { color: (R() * 1e6) | 0 });
        break;
      case "range": {
        sites.range = { x: X0 + 10, z: cz, name: "Throwing Range" };
        for (let k = 0; k < 6; k++) prop(k % 3 === 2 ? "van" : "car", X0 + 4, Z0 + 10 + k * 7, Math.PI / 2, { color: (R() * 1e6) | 0, tag: "rangeCar" });
        break;
      }
      case "radio": {
        box(cx - 1.6, 0, cz - 1.6, cx + 1.6, 64, cz + 1.6, "mast");
        decor.push({ type: "mast", x: cx + 2, y: terrainH(cx + 2, cz - 2), z: cz - 2, h: 64 - terrainH(cx, cz) });
        sites.radio = { x: cx + 10, z: cz + 10, name: "Radio Hill" };
        landmarks.push({ id: "radio", name: "Radio Hill", x: cx, z: cz, r: 30 });
        break;
      }
      default:
    }
  }

  /* ---------------------------------------------------------------- military perimeter */
  {
    const Zw = 6 * PITCH + PITCH + LOT - 2; // just inside the riverside boulevard (z ≈ 683)
    const Xw = 6 * PITCH + LOT - 2;
    const gates = [];
    // north wall (gaps at x = 672, 768, 864)
    for (let x = Xw; x < SIZE - 2; x += 8) {
      const gx = [672, 768, 864].find((g) => Math.abs(x + 4 - g) < 10);
      if (gx) continue;
      box(x, 0, Zw - 0.6, x + 8, 4.2, Zw + 0.6, "milwall");
    }
    for (const gx of [672, 768, 864]) {
      for (const dx of [-5.4, 0, 5.4]) {
        const p = prop("barricade", gx + dx, Zw, 0, { tag: gx === 768 ? "mainGate" : "gate" });
        gates.push(p);
      }
    }
    // west wall (gaps at z = 768, 864)
    for (let z = Zw; z < SIZE - 2; z += 8) {
      if ([768, 864].some((g) => Math.abs(z + 4 - g) < 10)) continue;
      box(Xw - 0.6, 0, z, Xw + 0.6, 4.2, z + 8, "milwall");
    }
    for (const gz of [768, 864]) for (const dz of [-5.4, 0, 5.4]) prop("barricade", Xw, gz + dz, Math.PI / 2, { tag: "gate" });
    sites.gate = { x: 768, z: Zw - 22, name: "Military checkpoint" };
    sites.gateIn = { x: 768, z: Zw + 30, name: "Inside the checkpoint" };
  }

  /* ---------------------------------------------------------------- remaining sites */
  sites.intersectionN = { x: 2 * PITCH, z: 1 * PITCH, name: "Elm Street crossing" };
  sites.resStreet = { x: 1 * PITCH, z: 3 * PITCH, name: "Oak Avenue" };
  sites.dtStreet = { x: 4 * PITCH, z: 2 * PITCH, name: "Downtown crossing" };
  sites.dtEast = { x: 6 * PITCH, z: 4 * PITCH, name: "Market Street" };
  sites.indStreet = { x: 7 * PITCH, z: 3 * PITCH, name: "Foundry Road" };
  sites.indNorth = { x: 9 * PITCH, z: 1 * PITCH, name: "Canal Works" };
  sites.bridge = { x: 480, z: RIVER.z0 - 10, name: "Grand Bridge (north end)" };
  sites.bridgeS = { x: 480, z: RIVER.z1 + 12, name: "Grand Bridge (south end)" };
  sites.highway = { x: 280, z: HIGHWAY.z, y: HIGHWAY.top, name: "Skyway" };
  sites.outskirtsRoad = { x: 2 * PITCH, z: 8 * PITCH, name: "Old Mill Road" };
  sites.convoyStart = { x: 0 * PITCH + 3, z: 8 * PITCH, name: "West Road" };
  sites.start = { x: 4 * PITCH + 48, z: 3 * PITCH + 70, name: "City Hall Plaza" };
  landmarks.push({ id: "skyway", name: "The Skyway", x: (HIGHWAY.x0 + HIGHWAY.x1) / 2, z: HIGHWAY.z, r: 40, y: HIGHWAY.top });

  // drop props that landed inside a collider (ramps, trees, pillars …) and re-number
  const kept = props.filter((p) => {
    if (p.tag) return true;
    for (const b of boxes) {
      if (b.y0 > 1.5) continue;
      if (b.y1 - b.y0 < 0.5 && !b.ramp) continue;
      if (p.x > b.x0 - 0.8 && p.x < b.x1 + 0.8 && p.z > b.z0 - 0.8 && p.z < b.z1 + 0.8) return false;
    }
    return true;
  });
  props.length = 0;
  kept.forEach((p, i) => props.push({ ...p, id: i }));

  return {
    size: SIZE,
    boxes,
    buildings,
    props,
    trees,
    decor,
    sites,
    landmarks,
    hills,
    terrainH,
    water,
    roadAt,
    district,
  };
}
