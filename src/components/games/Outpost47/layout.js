/**
 * Outpost 47 — derives physical geometry from data.js rooms/props.
 *
 * Shared by sim.js (collision, zones) and world.js (meshes) so what you see is
 * exactly what you bump into. Pure JS — runs in Node for tools/simTest.mjs.
 */
import { ROOMS, DOORS, PROPS, FOOT, EXTRA_COLLIDERS, WALL_T, DOOR_H } from "./data.js";

const H = WALL_T / 2;

export function buildLayout() {
  const walls = []; // {x1,z1,x2,z2,y1,y2,room,side,lintel}
  const doors = {}; // id -> {id,x,z,axis,w,room,side}
  const floors = [];
  const ceilings = [];
  for (const r of ROOMS) {
    floors.push({ x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2, room: r });
    ceilings.push({ x1: r.x1 - H, z1: r.z1 - H, x2: r.x2 + H, z2: r.z2 + H, y: r.h, room: r });
    const skip = r.skip || "";
    for (const side of "nsew") {
      if (skip.includes(side)) continue;
      const horiz = side === "n" || side === "s";
      const line = side === "n" ? r.z1 : side === "s" ? r.z2 : side === "w" ? r.x1 : r.x2;
      const a0 = horiz ? r.x1 - H : r.z1 + H;
      const a1 = horiz ? r.x2 + H : r.z2 - H;
      const ops = (r.doors || []).filter((d) => d.side === side).sort((p, q) => p.at - q.at);
      let cur = a0;
      const seg = (s, e, y1, y2, lintel) => {
        if (e - s < 0.01) return;
        walls.push(horiz
          ? { x1: s, x2: e, z1: line - H, z2: line + H, y1, y2, room: r.id, side, lintel }
          : { x1: line - H, x2: line + H, z1: s, z2: e, y1, y2, room: r.id, side, lintel });
      };
      for (const o of ops) {
        const s = o.at - o.w / 2, e = o.at + o.w / 2;
        seg(cur, s, 0, r.h);
        seg(s, e, DOOR_H, r.h, true);
        cur = e;
        if (o.id) {
          doors[o.id] = {
            id: o.id, w: o.w, room: r.id, side, axis: horiz ? "x" : "z",
            x: horiz ? o.at : line, z: horiz ? line : o.at, ...DOORS[o.id],
          };
        }
      }
      seg(cur, a1, 0, r.h);
    }
  }
  // props
  const props = PROPS.map(([type, x, z, rot = 0, opts = {}], i) => ({ i, type, x, z, rot, opts }));
  const colliders = [];
  for (const w of walls) colliders.push({ ...w, kind: "wall" });
  for (const p of props) {
    const f = FOOT[p.type];
    if (!f || p.opts.onDesk || p.opts.nocol) continue;
    let w = p.opts.w ?? f[0], d = p.opts.d ?? f[1];
    if (p.rot % 2) [w, d] = [d, w];
    colliders.push({ x1: p.x - w / 2, x2: p.x + w / 2, z1: p.z - d / 2, z2: p.z + d / 2, y1: 0, y2: f[2], kind: "prop", prop: p.type });
  }
  for (const [x1, z1, x2, z2, y2] of EXTRA_COLLIDERS) colliders.push({ x1, z1, x2, z2, y1: -5, y2, kind: "wall" });
  return { walls, doors, floors, ceilings, props, colliders };
}

/** Door collider box (closed). */
export function doorBox(d) {
  const t = 0.12;
  return d.axis === "x"
    ? { x1: d.x - d.w / 2, x2: d.x + d.w / 2, z1: d.z - t, z2: d.z + t, y1: 0, y2: DOOR_H, kind: "door", door: d.id }
    : { x1: d.x - t, x2: d.x + t, z1: d.z - d.w / 2, z2: d.z + d.w / 2, y1: 0, y2: DOOR_H, kind: "door", door: d.id };
}

/** Which room contains (x, z)? Smallest match wins (rooms never overlap much). */
export function roomAt(x, z) {
  let best = null;
  for (const r of ROOMS) {
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) {
      const a = (r.x2 - r.x1) * (r.z2 - r.z1);
      if (!best || a < best.a) best = { r, a };
    }
  }
  return best ? best.r : null;
}
