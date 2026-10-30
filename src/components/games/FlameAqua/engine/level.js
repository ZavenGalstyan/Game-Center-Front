/**
 * Turns a level definition (data/levels.js) into a fresh simulation state.
 * Restart = call buildLevel(def) again, so every switch, door, box, gem and
 * timer is reset by construction.
 *
 * Map legend (32×18 chars, row 0 at the top):
 *   #  stone          f  fire pool     w  water pool     g  toxic pool
 *   1  Flame start    2  Aqua start    (feet on the floor of that tile)
 *   R  Flame exit     B  Aqua exit     (door stands on the floor of that tile)
 *   r  red gem        b  blue gem
 *   X  box            /  \  mirror box (pushable mirror)
 *   anything else is empty space ('.' by convention)
 *
 * Objects (tile coordinates; `ch` names a signal channel, "a+b" = both on):
 *   {t:"plate", x, y, w?, ch, hold?}       pressure plate on the floor of (x,y)
 *   {t:"lever", x, y, ch, on?, hold?, dir?} walk right through = on, left = off (dir:-1 mirrors it)
 *   {t:"door", x, y, w?, h?, ch, inv?, slide?: "up"|"side", speed?}
 *   {t:"plat", x, y, w?, h?, to:[x,y], ch?, inv?, mode?: "loop", speed?, pause?}
 *   {t:"saw"|"fire"|"water"|"toxic", x, y, r?, to?:[x,y], orbit?:R, speed?, phase?}  (centre in tiles)
 *   {t:"emit", x, y, dir: "l"|"r"|"u"|"d", ch?}
 *   {t:"mirror", x, y, o: "/"|"\\", ch?}   a channel flips it while on
 *   {t:"sensor", x, y, ch, hold?}
 */
import { T, COLS, ROWS, PW, PH, BOX, TILE } from "./sim.js";

const TILE_OF = { "#": TILE.SOLID, f: TILE.FIRE, w: TILE.WATER, g: TILE.TOXIC };
const DIRS = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };
const FLIP = { "/": "\\", "\\": "/" };

export function buildLevel(def) {
  const tiles = new Uint8Array(COLS * ROWS);
  const s = {
    def,
    id: def.id,
    tick: 0,
    time: 0,
    post: 0,
    status: "playing",
    endT: 0,
    tiles,
    players: [],
    boxes: [],
    gems: [],
    exits: [],
    plates: [],
    levers: [],
    doors: [],
    platforms: [],
    hazards: [],
    emitters: [],
    mirrors: [],
    sensors: [],
    beams: [],
    ch: {},
    events: [],
  };
  const starts = {};
  def.map.forEach((row, ty) => {
    for (let tx = 0; tx < COLS; tx++) {
      const c = row[tx] ?? ".";
      if (TILE_OF[c]) tiles[ty * COLS + tx] = TILE_OF[c];
      const x = tx * T;
      const y = ty * T;
      if (c === "1" || c === "2") starts[c] = { x: x + (T - PW) / 2, y: y + T - PH };
      else if (c === "R" || c === "B") s.exits.push({ el: c === "R" ? "fire" : "water", x, floor: y + T, active: false });
      else if (c === "r" || c === "b") s.gems.push({ el: c === "r" ? "fire" : "water", x: x + T / 2, y: y + T / 2, taken: false });
      else if (c === "X" || c === "/" || c === "\\")
        s.boxes.push({ kind: "box", x: x + (T - BOX) / 2, y: y + T - BOX, w: BOX, h: BOX, vy: 0, mirror: c === "X" ? null : c });
    }
  });
  const mk = (id, el, st) => ({
    kind: "player", id, el, x: st.x, y: st.y, w: PW, h: PH, vx: 0, vy: 0,
    ground: true, coyote: 0, buffer: 0, face: id === "flame" ? 1 : -1,
    pushing: 0, dead: false, atExit: false, gems: 0, jumps: 0,
  });
  s.players.push(mk("flame", "fire", starts["1"]), mk("aqua", "water", starts["2"]));

  for (const o of def.objects || []) {
    const src = { ch: o.ch, hold: o.hold || 0, timer: 0 };
    if (o.ch) for (const c of o.ch.split("+")) s.ch[c] = false;
    switch (o.t) {
      case "plate": {
        const w = (o.w || 1) * T;
        s.plates.push({ ...src, down: false, floor: (o.y + 1) * T, zone: { x: o.x * T + 3, y: (o.y + 1) * T - 8, w: w - 6, h: 8 } });
        break;
      }
      case "lever":
        s.levers.push({ ...src, on: !!o.on, dir: o.dir === -1 ? -1 : 1, zone: { x: o.x * T + 6, y: o.y * T, w: T - 12, h: T } });
        break;
      case "door": {
        const d = { ch: o.ch, inv: !!o.inv, slide: o.slide || ((o.w || 1) > (o.h || 1) ? "side" : "up"), x: o.x * T, y: o.y * T, w: (o.w || 1) * T, h: (o.h || 1) * T, speed: o.speed || 2.5, open: 0 };
        d.open = d.inv ? 1 : 0;
        d.solid = d.open >= 1 ? null : { x: d.x, y: d.y, w: d.w, h: d.h, kind: "door", door: d };
        s.doors.push(d);
        break;
      }
      case "plat": {
        const a = { x: o.x * T, y: o.y * T };
        const b = { x: o.to[0] * T, y: o.to[1] * T };
        s.platforms.push({
          kind: "plat", ch: o.ch, inv: !!o.inv, mode: o.mode || "lift",
          x: a.x, y: a.y, w: (o.w || 3) * T, h: (o.h || 0.5) * T, a, b, goal: b,
          speed: o.speed || 70, pause: o.pause || 0, wait: o.pause || 0, vx: 0, vy: 0,
        });
        break;
      }
      case "saw":
      case "fire":
      case "water":
      case "toxic": {
        const h = { kind: o.t, x: o.x * T, y: o.y * T, r: (o.r || 0.45) * T, speed: o.speed || 60, phase: o.phase || 0 };
        if (o.to) h.to = { x: o.to[0] * T, y: o.to[1] * T };
        if (o.orbit) h.orbit = { cx: h.x, cy: h.y, r: o.orbit * T };
        h.pos = { x: h.x, y: h.y };
        s.hazards.push(h);
        break;
      }
      case "emit":
        s.emitters.push({ ch: o.ch, d: DIRS[o.dir], dir: o.dir, cx: o.x * T + T / 2, cy: o.y * T + T / 2, lit: false });
        break;
      case "mirror":
        s.mirrors.push({ kind: "mirror", ch: o.ch, o: o.o, alt: FLIP[o.o], rect: { x: o.x * T, y: o.y * T, w: T, h: T } });
        break;
      case "sensor":
        s.sensors.push({ kind: "sensor", ...src, lit: false, wasLit: false, rect: { x: o.x * T, y: o.y * T, w: T, h: T } });
        break;
      default:
        throw new Error(`level ${def.id}: unknown object ${o.t}`);
    }
  }
  for (const h of s.hazards) h.pos = h.orbit ? { x: h.orbit.cx + h.orbit.r * Math.cos(h.phase * Math.PI * 2), y: h.orbit.cy + h.orbit.r * Math.sin(h.phase * Math.PI * 2) } : { x: h.x, y: h.y };
  return s;
}

/** structural problems with a level definition (empty array = fine) */
export function validateLevel(def) {
  const errs = [];
  if (!Array.isArray(def.map) || def.map.length !== ROWS) errs.push(`map has ${def.map?.length} rows`);
  const count = {};
  def.map?.forEach((row, i) => {
    if (row.length !== COLS) errs.push(`row ${i} has ${row.length} chars`);
    for (const c of row) count[c] = (count[c] || 0) + 1;
  });
  for (const c of ["1", "2", "R", "B"]) if (count[c] !== 1) errs.push(`'${c}' appears ${count[c] || 0} times`);
  if (!count.r) errs.push("no red gems");
  if (!count.b) errs.push("no blue gems");
  // feet of starts / exits must rest on solid ground
  def.map?.forEach((row, ty) => {
    [...row].forEach((c, tx) => {
      if ("12RBX".includes(c)) {
        const below = def.map[ty + 1]?.[tx];
        if (!below || !TILE_OF[below]) {
          if (!(c === "X")) errs.push(`'${c}' at ${tx},${ty} is not standing on a tile`);
        }
      }
    });
  });
  return errs;
}
