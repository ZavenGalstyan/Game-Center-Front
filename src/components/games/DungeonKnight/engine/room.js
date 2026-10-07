/**
 * Dungeon Knight — turns a layout into solid geometry: four walls with
 * doorway gaps, a short alcove behind every doorway (the knight walks INTO
 * an open door to leave), door leaves that are solid while closed, and the
 * layout's obstacles. Pure data — the renderer builds meshes from the same
 * records, so what you see is what you collide with.
 */
import { createColliders, addBox, addCyl } from "./collision.js";
import { LAYOUTS, WALL_T, WALL_H, DOOR_W, ALCOVE } from "../data/layouts.js";

export const BARREL_OFFSETS = [[0, 0], [0.66, 0.18], [0.24, 0.64]];
export const BARREL_R = 0.36;
/** World spots of a barrel cluster (offsets point toward the room centre). */
export const barrelSpots = (o) => BARREL_OFFSETS.map(([dx, dz]) => [o.x + dx * Math.sign(-o.x || 1), o.z + dz * Math.sign(-o.z || 1)]);

export function buildRoomGeometry(layoutId, exitCount) {
  const L = LAYOUTS[layoutId];
  const w = L.w;
  const d = L.d;
  const hx = w / 2;
  const hz = d / 2;
  const C = createColliders();
  const T = WALL_T;
  const H = WALL_H;
  const exitXs = exitCount >= 2 ? [-w / 4, w / 4] : [0];

  // walls with gaps
  const wallRun = (z0, z1, gaps) => {
    let x = -hx - T;
    const sorted = gaps.slice().sort((a, b) => a - b);
    for (const g of sorted) {
      const g0 = g - DOOR_W / 2;
      if (g0 > x) addBox(C, { x0: x, x1: g0, z0, z1, y1: H, tag: "wall" });
      x = g + DOOR_W / 2;
    }
    if (x < hx + T) addBox(C, { x0: x, x1: hx + T, z0, z1, y1: H, tag: "wall" });
  };
  wallRun(-hz - T, -hz, [0]); // south (entry)
  wallRun(hz, hz + T, exitXs); // north (exits)
  addBox(C, { x0: -hx - T, x1: -hx, z0: -hz - T, z1: hz + T, y1: H, tag: "wall" });
  addBox(C, { x0: hx, x1: hx + T, z0: -hz - T, z1: hz + T, y1: H, tag: "wall" });

  // doorway alcoves (side cheeks + back wall), door leaves
  const doors = [];
  const alcove = (x, north) => {
    const s = north ? 1 : -1;
    const za = north ? hz : -hz;
    const zb = za + s * (T + ALCOVE);
    const z0 = Math.min(za, zb);
    const z1 = Math.max(za, zb);
    addBox(C, { x0: x - DOOR_W / 2 - 0.45, x1: x - DOOR_W / 2, z0, z1, y1: H, tag: "alcove" });
    addBox(C, { x0: x + DOOR_W / 2, x1: x + DOOR_W / 2 + 0.45, z0, z1, y1: H, tag: "alcove" });
    const zbk0 = north ? zb : zb - 0.5;
    const zbk1 = north ? zb + 0.5 : zb;
    addBox(C, { x0: x - DOOR_W / 2 - 0.45, x1: x + DOOR_W / 2 + 0.45, z0: zbk0, z1: zbk1, y1: H, tag: "alcove" });
    // the leaf hangs in the wall plane, a little into the alcove
    const lz0 = north ? hz + 0.12 : -hz - 0.42;
    const leaf = addBox(C, { x0: x - DOOR_W / 2, x1: x + DOOR_W / 2, z0: lz0, z1: lz0 + 0.3, y1: H, tag: "door" });
    return leaf;
  };
  const entryLeaf = alcove(0, false);
  entryLeaf.on = false; // the knight walks in through the open entry
  doors.push({ id: "entry", kind: "entry", x: 0, z: -hz, leaf: entryLeaf, open: true, openK: 1 });
  exitXs.forEach((x, i) => {
    const leaf = alcove(x, true);
    doors.push({ id: `exit${i}`, kind: "exit", index: i, x, z: hz, leaf, open: false, openK: 0 });
  });

  // obstacles
  const props = [];
  for (const o of L.obstacles) {
    switch (o.k) {
      case "pillar":
        addCyl(C, { x: o.x, z: o.z, r: o.r, y1: H, tag: "pillar" });
        break;
      case "column":
        addBox(C, { x0: o.x - o.s / 2, x1: o.x + o.s / 2, z0: o.z - o.s / 2, z1: o.z + o.s / 2, y1: H, tag: "column" });
        break;
      case "crates":
        addBox(C, { x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2, y1: o.h, cam: o.h > 1.2, tag: "crates" });
        break;
      case "barrels":
        for (const [x, z] of barrelSpots(o)) addCyl(C, { x, z, r: BARREL_R, y1: 1.0, cam: false, tag: "barrel" });
        break;
      case "tomb":
        addBox(C, { x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2, y1: 0.85, cam: false, tag: "tomb" });
        break;
      case "fountain":
        addCyl(C, { x: o.x, z: o.z, r: o.r, y1: 0.9, cam: false, tag: "fountain" });
        break;
      case "statue":
        addBox(C, { x0: o.x - 0.55, x1: o.x + 0.55, z0: o.z - 0.55, z1: o.z + 0.55, y1: 3.3, tag: "statue" });
        break;
      case "cells": {
        const x0 = o.side < 0 ? -hx : hx - 1.25;
        addBox(C, { x0, x1: x0 + 1.25, z0: -hz + 2.4, z1: hz - 2.4, y1: H, cam: false, tag: "cells" });
        break;
      }
      default:
        break;
    }
    props.push(o);
  }

  return { layout: L, w, d, hx, hz, C, doors, props, exitXs };
}
