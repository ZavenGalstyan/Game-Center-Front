/**
 * Night Corridor — turns a section's ASCII map into a runtime level.
 *
 * Every section is drawn as rows of characters; one character = one
 * CELL x CELL square. Fixed legend:
 *
 *   #  wall            (space) void (solid, never rendered)
 *   .  floor           @  player start
 *   D  door            L  locked door (section.lock)      X  exit door (section.exit)
 *   H  hiding locker   c  clutter prop against a wall
 *   o  ceiling lamp    f  flickering lamp   x  dead lamp fixture
 *   e  red emergency   w  warm safe-room lamp   b  bare hanging bulb
 *
 * Any other letter or digit is a section marker whose meaning lives in
 * `section.marks` (item pickups, wall switches, trigger zones, creature
 * spawns, safe rooms, special doors, patrol waypoints...). Marker cells are
 * floor. A marker can span several cells — triggers use the whole set, point
 * lookups use the centroid.
 *
 * The builder is pure and deterministic (seeded by the section id) so the
 * renderer, the game and the Node test-suite all see the same level.
 */
import { CELL, WALL_H, DOOR_JAMB } from "./constants.js";
import { hashStr, mulberry32, pick } from "./rng.js";
import { getTheme } from "../data/themes.js";

export const cellX = (c) => (c + 0.5) * CELL;
export const cellZ = (r) => (r + 0.5) * CELL;
export const toCell = (v) => Math.floor(v / CELL);

export const LAMP_KINDS = { o: "lamp", f: "flicker", x: "broken", e: "emergency", w: "warm", b: "bulb" };

export const T_SOLID = 0;
export const T_FLOOR = 1;
export const T_DOOR = 2;

/** N, E, S, W — dc/dr plus the yaw an object must have to face OUT of that wall into the cell. */
export const SIDES = [
  { name: "N", dc: 0, dr: -1, faceYaw: 0 },
  { name: "E", dc: 1, dr: 0, faceYaw: -Math.PI / 2 },
  { name: "S", dc: 0, dr: 1, faceYaw: Math.PI },
  { name: "W", dc: -1, dr: 0, faceYaw: Math.PI / 2 },
];

/** Yaw for a compass heading (forward = (-sin yaw, -cos yaw)). */
export const HEADING_YAW = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };

/** Collidable furniture footprints: w along the wall, d out from it, h height. */
export const PROP_SIZES = {
  cabinet: { w: 0.9, d: 0.5, h: 1.9 },
  shelf: { w: 1.6, d: 0.5, h: 2.0 },
  gurney: { w: 1.9, d: 0.7, h: 0.95 },
  wheelchair: { w: 0.7, d: 0.7, h: 0.95 },
  bed: { w: 1.9, d: 0.95, h: 0.75 },
  desk: { w: 1.4, d: 0.7, h: 0.78 },
  crates: { w: 1.3, d: 0.9, h: 1.3 },
  barrels: { w: 1.3, d: 0.65, h: 1.0 },
  cart: { w: 1.1, d: 0.6, h: 1.0 },
  chairs: { w: 1.4, d: 0.5, h: 0.9 },
  filing: { w: 0.9, d: 0.55, h: 1.35 },
  rubble: { w: 1.7, d: 0.9, h: 0.7 },
  generator: { w: 1.4, d: 0.8, h: 1.2 },
  locker: { w: 0.9, d: 0.6, h: 2.05 },
  stand: { w: 0.8, d: 0.45, h: 0.92 },
  table: { w: 1.1, d: 0.7, h: 0.8 },
};

function boxAgainstWall(x, z, side, w, d) {
  // Centre of the footprint, pushed flush to the wall on `side`.
  const off = CELL / 2 - d / 2 - 0.02;
  const px = x + side.dc * off;
  const pz = z + side.dr * off;
  const alongX = side.dc === 0; // wall is N/S → footprint's long side runs along x
  const hw = (alongX ? w : d) / 2;
  const hd = (alongX ? d : w) / 2;
  return { x: px, z: pz, box: { minX: px - hw, maxX: px + hw, minZ: pz - hd, maxZ: pz + hd } };
}

export function buildLevel(section) {
  const rows = section.map;
  const H = rows.length;
  const W = rows[0].length;
  const theme = getTheme(section.theme);
  const marks = section.marks || {};
  const rand = mulberry32(hashStr(`nc:${section.id}`));

  const type = new Uint8Array(W * H);
  const chars = [];
  const idx = (c, r) => r * W + c;
  const inside = (c, r) => c >= 0 && r >= 0 && c < W && r < H;

  const floors = [];
  const doorCells = [];
  const markers = {};
  let start = null;

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = rows[r][c] ?? "#";
      chars.push(ch);
      if (ch === "#" || ch === " ") {
        type[idx(c, r)] = T_SOLID;
        continue;
      }
      const markDef = marks[ch];
      if (ch === "D" || ch === "L" || ch === "X" || (markDef && markDef.type === "door")) {
        type[idx(c, r)] = T_DOOR;
        doorCells.push({ c, r, ch });
        if (markDef) (markers[ch] ||= { cells: [] }).cells.push({ c, r });
        continue;
      }
      type[idx(c, r)] = T_FLOOR;
      const cell = { c, r, x: cellX(c), z: cellZ(r), ch, lamp: LAMP_KINDS[ch] || null };
      floors.push(cell);
      if (ch === "@") start = { c, r };
      else if (!LAMP_KINDS[ch] && ch !== "." && ch !== "c" && ch !== "H") {
        (markers[ch] ||= { cells: [] }).cells.push({ c, r });
      }
    }
  }
  for (const m of Object.values(markers)) {
    m.x = m.cells.reduce((s, k) => s + cellX(k.c), 0) / m.cells.length;
    m.z = m.cells.reduce((s, k) => s + cellZ(k.r), 0) / m.cells.length;
  }

  const solidAt = (c, r) => !inside(c, r) || type[idx(c, r)] === T_SOLID;
  const floorAt = (c, r) => inside(c, r) && type[idx(c, r)] === T_FLOOR;
  const openAt = (c, r) => inside(c, r) && type[idx(c, r)] !== T_SOLID;

  // Static colliders that live inside floor/door cells (furniture, jambs).
  const cellSolids = new Map();
  const addSolid = (box) => {
    const c0 = toCell(box.minX);
    const c1 = toCell(box.maxX - 1e-6);
    const r0 = toCell(box.minZ);
    const r1 = toCell(box.maxZ - 1e-6);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!inside(c, r)) continue;
        const k = idx(c, r);
        if (!cellSolids.has(k)) cellSolids.set(k, []);
        cellSolids.get(k).push(box);
      }
    }
  };

  const opaque = new Set();
  // Wall faces already claimed by furniture/fixtures — decor skips them.
  const usedFaces = new Set();
  const faceKey = (c, r, s) => `${c},${r},${s}`;
  const wallSidesOf = (c, r) => SIDES.filter((s) => solidAt(c + s.dc, r + s.dr) && !(inside(c + s.dc, r + s.dr) && type[idx(c + s.dc, r + s.dr)] === T_DOOR));
  const preferWallSide = (c, r) => {
    const sides = wallSidesOf(c, r).filter((s) => !usedFaces.has(faceKey(c, r, s.name)));
    if (!sides.length) return null;
    // Prefer a wall whose opposite side is open (keeps the walkway clear in corridors).
    const good = sides.filter((s) => openAt(c - s.dc, r - s.dr));
    return pick(rand, good.length ? good : sides);
  };

  // ---------------------------------------------------------------- doors
  const doors = doorCells.map((d, i) => {
    const def = d.ch === "L" ? { ...(section.lock || {}), locked: section.lock?.item || "never" }
      : d.ch === "X" ? { exit: true, ...(section.exit || {}) }
      : d.ch === "D" ? {}
      : marks[d.ch];
    const x = cellX(d.c);
    const z = cellZ(d.r);
    // axis = direction of travel through the doorway.
    const axis = solidAt(d.c - 1, d.r) && solidAt(d.c + 1, d.r) ? "z" : "x";
    const door = {
      id: i,
      ch: d.ch,
      c: d.c,
      r: d.r,
      x,
      z,
      axis,
      open: def.open ? 1 : 0,
      target: def.open ? 1 : 0,
      swing: 1,
      locked: def.locked || null,
      lockedMsg: def.lockedMsg || (def.locked === "never" ? "IT WON'T OPEN" : "LOCKED"),
      exit: Boolean(def.exit),
      requires: def.requires || null,
      safe: Boolean(def.safe),
      label: def.label || null,
      unlockMsg: def.unlockMsg || null,
      style: def.style || (def.exit ? "exit" : d.ch === "L" ? "security" : "wood"),
      cooldown: 0,
      shake: 0,
      broken: false,
    };
    // Jambs: the doorway is the middle (CELL - 2*JAMB) of the cell.
    const h = CELL / 2;
    if (axis === "z") {
      addSolid({ minX: x - h, maxX: x - h + DOOR_JAMB, minZ: z - h, maxZ: z + h });
      addSolid({ minX: x + h - DOOR_JAMB, maxX: x + h, minZ: z - h, maxZ: z + h });
    } else {
      addSolid({ minX: x - h, maxX: x + h, minZ: z - h, maxZ: z - h + DOOR_JAMB });
      addSolid({ minX: x - h, maxX: x + h, minZ: z + h - DOOR_JAMB, maxZ: z + h });
    }
    return door;
  });
  const doorAtCell = new Map(doors.map((d) => [idx(d.c, d.r), d]));

  // ---------------------------------------------------------------- lamps
  const lamps = [];
  for (const f of floors) {
    if (!f.lamp) continue;
    lamps.push({ id: lamps.length, c: f.c, r: f.r, x: f.x, z: f.z, kind: f.lamp });
  }

  // -------------------------------------------------------------- lockers
  const lockers = [];
  const props = [];
  const interactables = [];

  for (const f of floors) {
    if (f.ch !== "H") continue;
    const side = preferWallSide(f.c, f.r);
    if (!side) continue;
    usedFaces.add(faceKey(f.c, f.r, side.name));
    const s = PROP_SIZES.locker;
    const p = boxAgainstWall(f.x, f.z, side, s.w, s.d);
    addSolid(p.box);
    // faceYaw: the object's local +Z points out of the wall, i.e. (sin, cos).
    const yaw = side.faceYaw;
    const ox = Math.sin(yaw);
    const oz = Math.cos(yaw);
    const step = s.d / 2 + 0.5;
    lockers.push({
      id: lockers.length,
      c: f.c,
      r: f.r,
      x: p.x,
      z: p.z,
      yaw,
      outX: p.x + ox * step,
      outZ: p.z + oz * step,
      open: 0,
    });
  }

  // -------------------------------------------------------- clutter props
  for (const f of floors) {
    if (f.ch !== "c") continue;
    const side = preferWallSide(f.c, f.r);
    const kind = pick(rand, theme.clutter);
    const s = PROP_SIZES[kind];
    if (!side) {
      const box = { minX: f.x - s.w / 2, maxX: f.x + s.w / 2, minZ: f.z - s.d / 2, maxZ: f.z + s.d / 2 };
      addSolid(box);
      props.push({ kind, x: f.x, z: f.z, yaw: 0, ...s });
      continue;
    }
    usedFaces.add(faceKey(f.c, f.r, side.name));
    const p = boxAgainstWall(f.x, f.z, side, s.w, s.d);
    addSolid(p.box);
    props.push({ kind, x: p.x, z: p.z, yaw: side.faceYaw + (kind === "crates" || kind === "rubble" ? (rand() - 0.5) * 0.3 : 0), ...s });
  }

  // ----------------------------------------------- marker-driven objects
  for (const [ch, def] of Object.entries(marks)) {
    const m = markers[ch];
    if (!m) continue;
    if (def.type === "item" || def.type === "radio" || def.type === "note") {
      const k = m.cells[0];
      const x = cellX(k.c);
      const z = cellZ(k.r);
      const side = preferWallSide(k.c, k.r);
      let px = x;
      let pz = z;
      let yaw = 0;
      const stand = def.on || (side ? "stand" : "table");
      const s = PROP_SIZES[stand] || PROP_SIZES.stand;
      if (side) {
        usedFaces.add(faceKey(k.c, k.r, side.name));
        const p = boxAgainstWall(x, z, side, s.w, s.d);
        addSolid(p.box);
        px = p.x;
        pz = p.z;
        yaw = side.faceYaw;
      } else {
        addSolid({ minX: x - s.w / 2, maxX: x + s.w / 2, minZ: z - s.d / 2, maxZ: z + s.d / 2 });
      }
      props.push({ kind: stand, x: px, z: pz, yaw, ...s, under: ch });
      interactables.push({
        id: `m:${ch}`,
        ch,
        kind: def.type,
        item: def.item || null,
        model: def.model || (def.type === "radio" ? "radio" : def.type === "note" ? "note" : "key"),
        label: def.label || "Pick Up",
        name: def.name || def.label || "",
        x: px,
        y: s.h + 0.05,
        z: pz,
        yaw,
        radius: 0.45,
        taken: false,
        text: def.text || null,
      });
    } else if (def.type === "use") {
      const k = m.cells[0];
      const x = cellX(k.c);
      const z = cellZ(k.r);
      const side = def.side ? SIDES.find((s) => s.name === def.side) : preferWallSide(k.c, k.r);
      const sd = side || SIDES[0];
      usedFaces.add(faceKey(k.c, k.r, sd.name));
      const off = CELL / 2 - 0.1;
      interactables.push({
        id: `m:${ch}`,
        ch,
        kind: "use",
        model: def.model || "switch",
        requires: def.requires || null,
        flag: def.flag || null,
        consume: def.consume !== false,
        label: def.label || "Use",
        needMsg: def.needMsg || "SOMETHING IS MISSING",
        doneMsg: def.doneMsg || null,
        x: x + sd.dc * off,
        y: def.model === "elevator" ? 1.25 : 1.35,
        z: z + sd.dr * off,
        yaw: sd.faceYaw,
        radius: 0.4,
        used: false,
      });
    } else if (def.type === "prop") {
      for (const k of m.cells) {
        const x = cellX(k.c);
        const z = cellZ(k.r);
        const s = PROP_SIZES[def.model] || PROP_SIZES.crates;
        const side = def.free ? null : preferWallSide(k.c, k.r);
        if (side) {
          usedFaces.add(faceKey(k.c, k.r, side.name));
          const p = boxAgainstWall(x, z, side, s.w, s.d);
          addSolid(p.box);
          props.push({ kind: def.model, x: p.x, z: p.z, yaw: side.faceYaw, ...s });
        } else {
          addSolid({ minX: x - s.w / 2, maxX: x + s.w / 2, minZ: z - s.d / 2, maxZ: z + s.d / 2 });
          props.push({ kind: def.model, x, z, yaw: def.yaw || 0, ...s });
          // Tall free-standing furniture blocks sight lines (you can hide behind a shelf).
          if (s.h >= 1.3) opaque.add(idx(k.c, k.r));
        }
      }
    }
  }

  // ------------------------------------------------------------ safe rooms
  // A safe marker floods its whole room (stopping at doors), so one marker
  // cell is enough and lamps inside the room still count as safe.
  const safeCells = new Set();
  const safeZones = {};
  for (const [ch, def] of Object.entries(marks)) {
    if (def.type !== "safe" || !markers[ch]) continue;
    const zone = new Set();
    const stack = markers[ch].cells.map((k) => idx(k.c, k.r));
    while (stack.length) {
      const k = stack.pop();
      if (zone.has(k)) continue;
      zone.add(k);
      const c = k % W;
      const r = (k - c) / W;
      for (const s of SIDES) {
        if (floorAt(c + s.dc, r + s.dr)) stack.push(idx(c + s.dc, r + s.dr));
      }
      if (zone.size > 60) break;
    }
    safeZones[ch] = zone;
    for (const k of zone) safeCells.add(k);
  }

  // ------------------------------------------------------------ start pose
  if (!start) start = floors[0] ? { c: floors[0].c, r: floors[0].r } : { c: 1, r: 1 };
  let startYaw = section.startHeading ? HEADING_YAW[section.startHeading] : null;
  if (startYaw == null) {
    let best = 0;
    startYaw = 0;
    for (const s of SIDES) {
      let n = 0;
      while (openAt(start.c + s.dc * (n + 1), start.r + s.dr * (n + 1)) && n < 20) n++;
      if (n > best) {
        best = n;
        startYaw = HEADING_YAW[s.name];
      }
    }
  }

  // ------------------------------------------------------------- decor
  const decor = buildDecor({ section, theme, rand, floors, W, H, solidAt, openAt, inside, type, idx, usedFaces, faceKey, lamps, doors });

  const level = {
    section,
    theme,
    W,
    H,
    type,
    chars,
    floors,
    doors,
    doorAtCell,
    lamps,
    lockers,
    props,
    interactables,
    markers,
    safeCells,
    safeZones,
    opaque,
    decor,
    start: { x: cellX(start.c), z: cellZ(start.r), yaw: startYaw },
    idx,
    inside,
    solidAt,
    floorAt,
    openAt,
    cellSolids,
    surfaceAt(x, z) {
      const c = toCell(x);
      const r = toCell(z);
      const ch = inside(c, r) ? chars[idx(c, r)] : "#";
      const def = marks[ch];
      if (def && def.surface) return def.surface;
      return theme.surface;
    },
  };
  return level;
}

/** Deterministic set dressing: wall fixtures, floor/ceiling details, pipe runs. */
function buildDecor({ section, theme, rand, floors, W, H, solidAt, openAt, inside, type, idx, usedFaces, faceKey, lamps, doors }) {
  const decor = [];
  const signs = section.signs || theme.signs;
  const lampCells = new Set(lamps.map((l) => idx(l.c, l.r)));
  const doorSides = new Set();
  for (const d of doors) {
    // Don't hang things on the wall right beside a doorway frame.
    for (const s of SIDES) doorSides.add(`${d.c + s.dc},${d.r + s.dr}`);
  }
  const pickWeighted = (list) => {
    let total = 0;
    for (const [, w] of list) total += w;
    let t = rand() * total;
    for (const [k, w] of list) {
      t -= w;
      if (t <= 0) return k;
    }
    return list[list.length - 1][0];
  };
  const isExterior = (c, r, s) => {
    const c2 = c + s.dc * 2;
    const r2 = r + s.dr * 2;
    return !inside(c2, r2) || (solidAt(c2, r2) && !openAt(c2, r2));
  };

  for (const f of floors) {
    const nearDoor = doorSides.has(`${f.c},${f.r}`);
    for (const s of SIDES) {
      if (!solidAt(f.c + s.dc, f.r + s.dr)) continue;
      if (inside(f.c + s.dc, f.r + s.dr) && type[idx(f.c + s.dc, f.r + s.dr)] === 2) continue;
      const key = faceKey(f.c, f.r, s.name);
      const off = 1 - 0.01;
      const fx = f.x + s.dc * off;
      const fz = f.z + s.dr * off;
      const yaw = s.faceYaw;
      if (theme.rail && !usedFaces.has(key)) decor.push({ kind: "rail", x: fx, y: 0.92, z: fz, yaw });
      if (rand() < theme.stains) decor.push({ kind: "stain", x: fx + s.dc * -0.004, y: 0.3 + rand() * 1.4, z: fz + s.dr * -0.004, yaw, s: 0.7 + rand() * 1.1, v: Math.floor(rand() * 4) });
      if (usedFaces.has(key) || nearDoor) continue;
      if (section.windows && isExterior(f.c, f.r, s) && rand() < section.windows) {
        decor.push({ kind: "window", x: fx, y: 1.55, z: fz, yaw });
        usedFaces.add(key);
        continue;
      }
      const kind = pickWeighted(theme.wallDecor);
      if (kind === "none") continue;
      const item = { kind, x: fx, y: 1.4, z: fz, yaw, v: Math.floor(rand() * 8) };
      if (kind === "sign") {
        item.text = pick(rand, signs);
        item.y = 1.85;
      } else if (kind === "ebox") item.y = 1.5;
      else if (kind === "vent") item.y = 2.45;
      else if (kind === "board") item.y = 1.45;
      else if (kind === "extinguisher") item.y = 0.9;
      else if (kind === "pipeV") item.y = WALL_H / 2;
      else if (kind === "cables") item.y = 2.2;
      decor.push(item);
      usedFaces.add(key);
    }
    // floor details
    if (f.ch !== "H" && f.ch !== "c" && rand() < theme.floorDetail) {
      decor.push({ kind: pick(rand, theme.floorDecor), x: f.x + (rand() - 0.5) * 1.1, y: 0.006, z: f.z + (rand() - 0.5) * 1.1, yaw: rand() * Math.PI * 2, v: Math.floor(rand() * 4), s: 0.7 + rand() * 0.6 });
    }
    // ceiling details
    if (!lampCells.has(idx(f.c, f.r)) && rand() < theme.ceilingDetail) {
      decor.push({ kind: pick(rand, ["panelHole", "panelHole", "cableHang"]), x: f.x + (rand() - 0.5) * 0.6, y: WALL_H, z: f.z + (rand() - 0.5) * 0.6, yaw: Math.floor(rand() * 4) * (Math.PI / 2), v: Math.floor(rand() * 3) });
    }
  }

  // Ceiling pipe runs along straight corridor stretches.
  if (theme.pipes > 0) {
    const corridorRun = (horizontal) => {
      const outer = horizontal ? H : W;
      const inner = horizontal ? W : H;
      for (let o = 0; o < outer; o++) {
        let runStart = -1;
        for (let i = 0; i <= inner; i++) {
          const c = horizontal ? i : o;
          const r = horizontal ? o : i;
          const ok = i < inner && inside(c, r) && type[idx(c, r)] === 1 &&
            (horizontal ? solidAt(c, r - 1) && solidAt(c, r + 1) : solidAt(c - 1, r) && solidAt(c + 1, r));
          if (ok && runStart < 0) runStart = i;
          if (!ok && runStart >= 0) {
            const len = i - runStart;
            if (len >= 3 && rand() < theme.pipes) {
              const side = rand() < 0.5 ? -1 : 1;
              const a = runStart * 2;
              const b = i * 2;
              const across = (o + 0.5) * 2 + side * 0.68;
              decor.push({ kind: "pipeRun", horizontal, a, b, across, y: WALL_H - 0.22, r: 0.07 + rand() * 0.03, double: rand() < 0.6, side });
            }
            runStart = -1;
          }
        }
      }
    };
    corridorRun(true);
    corridorRun(false);
  }
  return decor;
}
