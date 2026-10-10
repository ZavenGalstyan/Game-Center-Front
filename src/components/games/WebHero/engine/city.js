/**
 * Web Hero — city builder. Each district is a hand-drawn block map (6×6)
 * turned into colliders + render data by a deterministic generator:
 *
 *   T tower block (2-4 skyscrapers with setbacks)   M mid-rise block
 *   P park                                         Q plaza (open square)
 *   W warehouses                                   C container yard + crane
 *   S sea (no ground)                              D dock / pier over water
 *   N neon block (towers + big signs)              F fortress tower block
 *   H fortress HQ                                  I island block
 *
 * Output (plain data): geo (collision), buildings[] (render), props
 * (streetlights, traffic lights, trees, benches, billboards, signs, cars),
 * anchors (special swing points), roads, nav grid, named locations.
 */
import { createWorldGeo, addBox } from "./collide.js";

export const PITCH = 50; // block + street
export const STREET = 14;
export const BLOCK = PITCH - STREET;

function rng(seed) {
  let s = (seed * 2654435761) % 2147483647 || 7;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const MAPS = {
  downtown: ["TTMPTT", "TMTTMT", "MTQTTM", "TTTMTT", "MTTTPM", "TMTTTT"],
  industrial: ["WWCMWT", "WMWWCW", "CWQWWM", "WWWCWW", "MCWWTW", "WWMWCW"],
  coastal: ["TMMDSS", "MTMDSS", "MQTDSI", "TMMDSS", "MPMDSS", "TMTDSS"],
  neon: ["NTNNTN", "TNQTNT", "NTNNTN", "TNNTNT", "NQTNTN", "TNTNNT"],
  fortress: ["FMFFMF", "MFFFFM", "FFHHFF", "FFHHFF", "MFQFFM", "FMFFMF"],
};

const STYLE = {
  downtown: { tall: [55, 110], mid: [22, 40], skins: ["glass", "glassB", "concrete", "brick"] },
  industrial: { tall: [30, 55], mid: [14, 24], skins: ["brick", "metal", "concrete"] },
  coastal: { tall: [38, 70], mid: [16, 30], skins: ["stucco", "glass", "brick"] },
  neon: { tall: [70, 130], mid: [30, 52], skins: ["dark", "darkB", "glassB"] },
  fortress: { tall: [50, 90], mid: [26, 40], skins: ["armor", "dark", "metal"] },
};

export function buildCity(districtKey, seed = 1) {
  const map = MAPS[districtKey] || MAPS.downtown;
  const style = STYLE[districtKey] || STYLE.downtown;
  const R = rng(seed * 31 + districtKey.length * 7);
  const N = map.length;
  const half = (N * PITCH) / 2;
  const x0c = -half;
  // water: any S column region (coastal) → one rect spanning those blocks + streets between
  let water = null;
  const sea = [];
  map.forEach((row, j) => [...row].forEach((c, i) => (c === "S" || c === "I" || c === "D") && sea.push([i, j])));
  if (sea.some(([i, j]) => map[j][i] === "S")) {
    const is = sea.map(([i]) => i);
    const i0 = Math.min(...is);
    water = { x0: x0c + i0 * PITCH + STREET / 2, x1: x0c + N * PITCH + 200, z0: -half - 200, z1: half + 200, y: -3 };
  }
  const geo = createWorldGeo({ groundY: 0, water });
  const C = {
    key: districtKey,
    N,
    half,
    geo,
    buildings: [],
    props: { lights: [], tlights: [], trees: [], benches: [], billboards: [], signs: [], cars: [], containers: [], cranes: [], roofUnits: [], tanks: [], fountains: [], piers: [], bridges: [], walls: [], antennas: [], pedestrians: [], stairs: [] },
    anchors: [],
    roofs: [],
    parks: [],
    blocks: [],
    water,
  };
  const block = (i, j) => ({ x0: x0c + i * PITCH + STREET / 2, z0: -half + j * PITCH + STREET / 2, x1: x0c + i * PITCH + STREET / 2 + BLOCK, z1: -half + j * PITCH + STREET / 2 + BLOCK });

  const building = (x0, z0, x1, z1, h, o = {}) => {
    const skin = o.skin || style.skins[Math.floor(R() * style.skins.length)];
    const b = addBox(geo, { x0, z0, x1, z1, y0: o.y0 ?? 0, y1: (o.y0 ?? 0) + h, kind: "building", skin, tint: R(), anchor: true });
    C.buildings.push(b);
    C.roofs.push(b);
    return b;
  };
  // a tower with up to two setbacks; returns the top box
  const tower = (x0, z0, x1, z1, h, o = {}) => {
    const base = building(x0, z0, x1, z1, o.setback && h > 40 ? h * 0.55 : h, o);
    let top = base;
    if (o.setback && h > 40) {
      const ins = 2 + R() * 3;
      top = building(x0 + ins, z0 + ins, x1 - ins, z1 - ins, h * 0.45, { ...o, y0: base.y1, skin: base.skin });
      if (h > 80 && R() < 0.6) {
        const ins2 = ins + 3;
        top = building(x0 + ins2, z0 + ins2, x1 - ins2, z1 - ins2, 10 + R() * 12, { ...o, y0: top.y1, skin: base.skin });
      }
    }
    roofGear(top);
    return top;
  };
  const roofGear = (b) => {
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    if (w < 8 || d < 8) return;
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const ux = b.x0 + 2 + R() * (w - 6);
      const uz = b.z0 + 2 + R() * (d - 6);
      const kind = R() < 0.35 ? "tank" : "unit";
      if (kind === "tank") {
        const t = addBox(geo, { x0: ux, z0: uz, x1: ux + 3, z1: uz + 3, y0: b.y1, y1: b.y1 + 5, kind: "tank", climb: true, anchor: true });
        C.props.tanks.push(t);
      } else {
        const u = addBox(geo, { x0: ux, z0: uz, x1: ux + 2.6, z1: uz + 1.8, y0: b.y1, y1: b.y1 + 1.4, kind: "unit", climb: false });
        C.props.roofUnits.push(u);
      }
    }
    if (R() < 0.35) C.props.antennas.push({ x: (b.x0 + b.x1) / 2 + (R() - 0.5) * w * 0.4, y: b.y1, z: (b.z0 + b.z1) / 2 + (R() - 0.5) * d * 0.4, h: 4 + R() * 8 });
  };

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const t = map[j][i];
      const B = block(i, j);
      C.blocks.push({ i, j, t, ...B });
      const cx = (B.x0 + B.x1) / 2;
      const cz = (B.z0 + B.z1) / 2;
      switch (t) {
        case "T":
        case "N":
        case "F": {
          // 2-4 towers with 4 m alleys
          const split = R();
          const tall = t === "F" ? style.tall : style.tall;
          if (split < 0.35) {
            tower(B.x0 + 1, B.z0 + 1, B.x1 - 1, B.z1 - 1, lerp(tall, R()), { setback: true });
          } else if (split < 0.7) {
            const m = B.x0 + BLOCK * (0.4 + R() * 0.2);
            tower(B.x0 + 1, B.z0 + 1, m - 2, B.z1 - 1, lerp(tall, R()), { setback: true });
            tower(m + 2, B.z0 + 1, B.x1 - 1, B.z1 - 1, lerp(tall, R()) * 0.8, { setback: R() < 0.5 });
          } else {
            const mx = cx + (R() - 0.5) * 4;
            const mz = cz + (R() - 0.5) * 4;
            tower(B.x0 + 1, B.z0 + 1, mx - 2, mz - 2, lerp(tall, R()), { setback: true });
            tower(mx + 2, B.z0 + 1, B.x1 - 1, mz - 2, lerp(style.mid, R()));
            tower(B.x0 + 1, mz + 2, mx - 2, B.z1 - 1, lerp(style.mid, R()));
            tower(mx + 2, mz + 2, B.x1 - 1, B.z1 - 1, lerp(tall, R()) * 0.85, { setback: true });
          }
          if (t === "N") {
            for (let k = 0; k < 3; k++) C.props.signs.push({ x: B.x0 - 0.3, y: 8 + R() * 30, z: B.z0 + 4 + R() * (BLOCK - 8), side: "w", w: 3 + R() * 4, h: 6 + R() * 10, hue: R() });
            for (let k = 0; k < 2; k++) C.props.signs.push({ x: B.x0 + 4 + R() * (BLOCK - 8), y: 8 + R() * 30, z: B.z1 + 0.3, side: "s", w: 6 + R() * 6, h: 3 + R() * 3, hue: R() });
          }
          if (t === "F") {
            // fortress: armoured pylons on the corners (anchors) + energy beacons
            C.props.antennas.push({ x: B.x0 + 2, y: 0, z: B.z0 + 2, h: 18, beacon: true });
          }
          break;
        }
        case "M": {
          const n = R() < 0.5 ? 2 : 3;
          const step = BLOCK / n;
          for (let k = 0; k < n; k++) {
            const h = lerp(style.mid, R());
            if (R() < 0.5) tower(B.x0 + 1 + k * step, B.z0 + 1, B.x0 + (k + 1) * step - 1.5, B.z1 - 1, h);
            else tower(B.x0 + 1, B.z0 + 1 + k * step, B.x1 - 1, B.z0 + (k + 1) * step - 1.5, h);
          }
          break;
        }
        case "P": {
          C.parks.push(B);
          for (let k = 0; k < 14; k++) C.props.trees.push({ x: B.x0 + 3 + R() * (BLOCK - 6), z: B.z0 + 3 + R() * (BLOCK - 6), s: 0.8 + R() * 0.6 });
          for (let k = 0; k < 6; k++) C.props.benches.push({ x: B.x0 + 4 + R() * (BLOCK - 8), z: B.z0 + 4 + R() * (BLOCK - 8), r: R() * 6 });
          C.props.fountains.push({ x: cx, z: cz });
          break;
        }
        case "Q": {
          C.parks.push({ ...B, plaza: true });
          C.props.fountains.push({ x: cx, z: cz, big: true });
          for (let k = 0; k < 8; k++) C.props.benches.push({ x: B.x0 + 4 + R() * (BLOCK - 8), z: B.z0 + 4 + R() * (BLOCK - 8), r: R() * 6 });
          C.props.billboards.push({ x: cx, y: 0, z: B.z0 + 3, w: 12, h: 6, r: 0 });
          break;
        }
        case "W": {
          const h = lerp(style.mid, R());
          const ww = building(B.x0 + 1, B.z0 + 2, B.x1 - 1, B.z0 + BLOCK * 0.55, h * 0.75, { skin: "warehouse" });
          roofGear(ww);
          building(B.x0 + 4, B.z0 + BLOCK * 0.62, B.x0 + BLOCK * 0.5, B.z1 - 1, h, { skin: "brick" });
          // chimney (tall, anchorable)
          if (R() < 0.6) {
            const ch = addBox(geo, { x0: B.x1 - 7, z0: B.z1 - 7, x1: B.x1 - 4, z1: B.z1 - 4, y0: 0, y1: 34 + R() * 12, kind: "chimney", anchor: true });
            C.props.tanks.push(ch);
          }
          for (let k = 0; k < 4; k++) container(B.x0 + BLOCK * 0.55 + R() * (BLOCK * 0.4 - 7), B.z0 + BLOCK * 0.62 + R() * (BLOCK * 0.3), R() < 0.4 ? 2 : 1);
          break;
        }
        case "C": {
          for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) if (R() < 0.8) container(B.x0 + 3 + a * 11, B.z0 + 4 + b2 * 10, 1 + Math.floor(R() * 3));
          // a gantry crane: two legs + a beam high above (great swing point)
          const ly = 32;
          const l1 = addBox(geo, { x0: B.x0 + 1, z0: cz - 1.2, x1: B.x0 + 3.4, z1: cz + 1.2, y0: 0, y1: ly, kind: "crane", anchor: true });
          const l2 = addBox(geo, { x0: B.x1 - 3.4, z0: cz - 1.2, x1: B.x1 - 1, z1: cz + 1.2, y0: 0, y1: ly, kind: "crane", anchor: true });
          const beam = addBox(geo, { x0: B.x0 + 1, z0: cz - 1.4, x1: B.x1 - 1, z1: cz + 1.4, y0: ly, y1: ly + 2.2, kind: "crane", anchor: true, climb: false });
          C.props.cranes.push({ l1, l2, beam });
          C.anchors.push({ x: cx, y: ly, z: cz });
          break;
        }
        case "D": {
          // pier deck over water + warehouse
          const deck = addBox(geo, { x0: B.x0, z0: B.z0, x1: B.x1 + STREET / 2, z1: B.z1, y0: -2, y1: 0, kind: "pier", climb: false });
          C.props.piers.push(deck);
          const shed = building(B.x0 + 3, B.z0 + 4, B.x0 + 18, B.z1 - 4, lerp(style.mid, R()) * 0.7, { skin: "warehouse" });
          roofGear(shed);
          for (let k = 0; k < 3; k++) container(B.x0 + 21 + (k % 2) * 7, B.z0 + 5 + k * 9, 1 + Math.floor(R() * 2));
          // mooring posts as low anchors along the pier edge
          C.anchors.push({ x: B.x1 + 2, y: 12, z: cz, post: true });
          addBox(geo, { x0: B.x1 + 1.5, z0: cz - 0.5, x1: B.x1 + 2.5, z1: cz + 0.5, y0: 0, y1: 12, kind: "pole", anchor: true, climb: true });
          break;
        }
        case "I": {
          // island with a lighthouse
          const isl = addBox(geo, { x0: B.x0 + 4, z0: B.z0 + 4, x1: B.x1 - 4, z1: B.z1 - 4, y0: -3, y1: 0.4, kind: "island", climb: false });
          C.props.piers.push(isl);
          const lh = building(cx - 3, cz - 3, cx + 3, cz + 3, 36, { skin: "stucco", y0: 0.4 });
          lh.lighthouse = true;
          break;
        }
        case "H": {
          // HQ: one huge block over the 2x2 H area is built once at the top-left H
          if (map[j][i - 1] === "H" || (map[j - 1] && map[j - 1][i] === "H")) break;
          const x1 = B.x1 + PITCH;
          const z1 = B.z1 + PITCH;
          const base = building(B.x0 + 2, B.z0 + 2, x1 - 2, z1 - 2, 28, { skin: "armor" });
          const mid = building(B.x0 + 14, B.z0 + 14, x1 - 14, z1 - 14, 50, { skin: "armor", y0: base.y1 });
          building(B.x0 + 26, B.z0 + 26, x1 - 26, z1 - 26, 30, { skin: "dark", y0: mid.y1 });
          C.hq = { x: (B.x0 + x1) / 2, z: (B.z0 + z1) / 2, roof: base.y1 };
          break;
        }
        default:
          break;
      }
    }
  }

  function container(x, z, stack) {
    for (let s = 0; s < stack; s++) {
      const c = addBox(geo, { x0: x, z0: z, x1: x + 6.1, z1: z + 2.5, y0: s * 2.6, y1: (s + 1) * 2.6, kind: "container", tint: R(), climb: true });
      C.props.containers.push(c);
    }
  }

  // coastal bridge across the sea to the island row
  if (water && map.some((r) => r.includes("I"))) {
    const jI = map.findIndex((r) => r.includes("I"));
    const iI = map[jI].indexOf("I");
    const zc = -half + jI * PITCH + STREET / 2 + BLOCK / 2;
    const xa = water.x0 - STREET / 2;
    const xb = x0c + iI * PITCH + STREET / 2 + 4;
    const deck = addBox(geo, { x0: xa, z0: zc - 6 - BLOCK / 2 - 4, x1: xb, z1: zc - BLOCK / 2 - 4, y0: 6, y1: 7.2, kind: "bridge", climb: false });
    // ramps down at both ends
    C.props.bridges.push({ deck, towers: [] });
    for (const tx of [xa + (xb - xa) * 0.3, xa + (xb - xa) * 0.7]) {
      const tw = addBox(geo, { x0: tx - 1.5, z0: deck.z0 - 1.6, x1: tx + 1.5, z1: deck.z0 - 0.2, y0: -3, y1: 46, kind: "pylon", anchor: true });
      const tw2 = addBox(geo, { x0: tx - 1.5, z0: deck.z1 + 0.2, x1: tx + 1.5, z1: deck.z1 + 1.6, y0: -3, y1: 46, kind: "pylon", anchor: true });
      C.props.bridges[0].towers.push(tw, tw2);
      C.anchors.push({ x: tx, y: 44, z: (deck.z0 + deck.z1) / 2 });
    }
    // walkable stairs (0.48 m risers) up from the shore road …
    for (let k = 0; k < 15; k++) C.props.stairs.push(addBox(geo, { x0: xa - 15 + k, z0: deck.z0, x1: xa - 14 + k + 0.01, z1: deck.z1, y0: 0, y1: 0.48 * (k + 1), kind: "stair", climb: false }));
    // … and a wide flight down at the island end that lands on the island itself
    const isl = C.props.piers.find((p) => p.kind === "island");
    const z1 = isl ? isl.z0 + 2 : deck.z1;
    for (let k = 0; k < 15; k++) C.props.stairs.push(addBox(geo, { x0: xb + k - 0.01, z0: deck.z0, x1: xb + k + 1, z1, y0: -3, y1: 7.2 - (k + 1) * (6.8 / 15), kind: "stair", climb: false }));
    // the stair flight counts as dry land for the street nav grid
    C.props.piers.push({ x0: xb, z0: deck.z0, x1: xb + 15, z1, y0: -3, y1: 0.4, kind: "stairfoot", virtual: true });
  }

  // fortress perimeter wall segments with gates
  if (districtKey === "fortress") {
    const e = half - 4;
    for (const [x0, z0, x1, z1] of [
      [-e, -e, -e + 2, -12],
      [-e, 12, -e + 2, e],
      [e - 2, -e, e, -12],
      [e - 2, 12, e, e],
    ]) {
      const w = addBox(geo, { x0, z0, x1, z1, y0: 0, y1: 9, kind: "wall", skin: "armor", climb: true, anchor: true });
      C.props.walls.push(w);
    }
  }

  // street furniture on the sidewalks (props; parked cars collide)
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const ix = x0c + i * PITCH;
      const iz = -half + j * PITCH;
      if (isWaterXZ(water, ix, iz)) continue;
      C.props.tlights.push({ x: ix + STREET / 2 - 0.6, z: iz + STREET / 2 - 0.6, r: R() * 4 });
    }
  }
  for (const b of C.blocks) {
    if (b.t === "S" || b.t === "I") continue;
    for (let k = 0; k < 4; k++) {
      const along = 6 + k * ((BLOCK - 12) / 3);
      C.props.lights.push({ x: b.x0 - 1.2, z: b.z0 + along, r: Math.PI / 2 });
      C.props.lights.push({ x: b.x0 + along, z: b.z1 + 1.2, r: 0 });
    }
    if (R() < 0.7 && b.t !== "D") {
      const along = 8 + R() * (BLOCK - 16);
      const car = addBox(geo, { x0: b.x0 - 4.2, z0: b.z0 + along, x1: b.x0 - 2.2, z1: b.z0 + along + 4.4, y0: 0, y1: 1.5, kind: "car", tint: R(), climb: false });
      C.props.cars.push(car);
    }
    if (R() < 0.35) C.props.billboards.push({ x: b.x1 + 1.2, y: 0, z: b.z0 + 6 + R() * 20, w: 8, h: 4, r: Math.PI / 2 });
  }

  // pedestrians walk loops around blocks (visual only)
  for (let k = 0; k < 26; k++) {
    const b = C.blocks[Math.floor(R() * C.blocks.length)];
    if (b.t === "S" || b.t === "I") continue;
    C.props.pedestrians.push({ block: b, u: R(), speed: 1.1 + R() * 0.6, tint: R() });
  }

  // nav grid on the street level (2 m cells) for AI + the bot
  const navSize = 2;
  const W = Math.ceil((N * PITCH + 40) / navSize);
  const nav = { size: navSize, w: W, h: W, ox: -half - 20, oz: -half - 20, block: new Uint8Array(W * W) };
  for (let gz = 0; gz < W; gz++) {
    for (let gx = 0; gx < W; gx++) {
      const x = nav.ox + (gx + 0.5) * navSize;
      const z = nav.oz + (gz + 0.5) * navSize;
      let bl = isWaterXZ(water, x, z) && !onPier(C, x, z) ? 1 : 0;
      if (Math.abs(x) > half + 4 || Math.abs(z) > half + 4) bl = 1;
      if (!bl) {
        for (const b of geo.boxes) {
          if (b.y0 > 1.2 || b.y1 < 0.6) continue;
          if (x > b.x0 - 0.7 && x < b.x1 + 0.7 && z > b.z0 - 0.7 && z < b.z1 + 0.7) {
            bl = 1;
            break;
          }
        }
      }
      nav.block[gz * W + gx] = bl;
    }
  }
  C.nav = nav;
  C.bounds = { x0: -half - 10, x1: half + 10, z0: -half - 10, z1: half + 10 };

  /* -------- named locations for mission authoring */
  C.blockAt = (i, j) => C.blocks.find((b) => b.i === i && b.j === j);
  /** tallest roof whose footprint centre lies in block (i,j) */
  C.roofIn = (i, j, pick = "tall") => {
    const b = C.blockAt(i, j);
    const list = C.roofs.filter((r) => (r.x0 + r.x1) / 2 > b.x0 - 1 && (r.x0 + r.x1) / 2 < b.x1 + 1 && (r.z0 + r.z1) / 2 > b.z0 - 1 && (r.z0 + r.z1) / 2 < b.z1 + 1 && !r.lighthouse);
    // only true tops (nothing stacked on them)
    const tops = list.filter((r) => !list.some((o) => o !== r && Math.abs(o.y0 - r.y1) < 0.01 && o.x0 >= r.x0 - 0.01 && o.x1 <= r.x1 + 0.01));
    tops.sort((a, b2) => (pick === "low" ? a.y1 - b2.y1 : b2.y1 - a.y1));
    const r = tops[0];
    return r ? { x: (r.x0 + r.x1) / 2, y: r.y1, z: (r.z0 + r.z1) / 2, box: r } : null;
  };
  /** the top roof surface containing (x,z) */
  C.roofAt = (x, z) => {
    let best = null;
    for (const r of C.roofs) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && (!best || r.y1 > best.y1)) best = r;
    return best ? { x: (best.x0 + best.x1) / 2, y: best.y1, z: (best.z0 + best.z1) / 2, box: best } : null;
  };
  /** street intersection south-west of block (i,j) (i,j may be N for the far edge) */
  C.corner = (i, j) => ({ x: x0c + i * PITCH, y: 0, z: -half + j * PITCH });
  /** middle of the street west of block (i,j) */
  C.streetW = (i, j) => ({ x: x0c + i * PITCH, y: 0, z: -half + j * PITCH + PITCH / 2 });
  /** middle of the street north of block (i,j) */
  C.streetN = (i, j) => ({ x: x0c + i * PITCH + PITCH / 2, y: 0, z: -half + j * PITCH });
  C.blockCenter = (i, j) => {
    const b = C.blockAt(i, j);
    return { x: (b.x0 + b.x1) / 2, y: 0, z: (b.z0 + b.z1) / 2 };
  };
  return C;
}

function lerp([a, b], t) {
  return a + (b - a) * t;
}
function isWaterXZ(w, x, z) {
  return !!w && x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1;
}
function onPier(C, x, z) {
  for (const p of C.props.piers) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return true;
  return false;
}
