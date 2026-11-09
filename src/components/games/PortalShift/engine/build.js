/**
 * Portal Shift — level builder. Levels are written as box operations on a
 * voxel grid that starts completely solid (dark metal): carve the rooms, paint
 * the portal surfaces white, then place the devices. All coordinates are cell
 * indices (x, layer, z); a cell spans [2i, 2i+2] in world metres.
 *
 * Face names give the direction a surface faces (its normal, pointing into
 * the room): px nx (east/west), py ny (floor/ceiling), pz nz (south/north).
 */
import { CELL, EMPTY, METAL, WHITE, GLASS, GOO } from "./constants.js";
import { FACES } from "./portalMath.js";

const YAW = { nz: 0, nx: Math.PI / 2, pz: Math.PI, px: -Math.PI / 2 };

export function builder(nx, ny, nz) {
  const grid = new Uint8Array(nx * ny * nz).fill(METAL);
  const id = (i, j, k) => i + nx * (j + ny * k);
  const L = {
    nx, ny, nz, grid,
    spawn: null, exit: null,
    doors: [], plates: [], switches: [], cubes: [], emitters: [], receivers: [], platforms: [], checkpoints: [], pads: [],
    fixedPortals: {}, locked: [],
  };
  const each = (a, b, fn) => {
    for (let k = Math.min(a[2], b[2]); k <= Math.max(a[2], b[2]); k++)
      for (let j = Math.min(a[1], b[1]); j <= Math.max(a[1], b[1]); j++)
        for (let i = Math.min(a[0], b[0]); i <= Math.max(a[0], b[0]); i++)
          if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) fn(id(i, j, k), i, j, k);
          else L.outOfBounds = [i, j, k];
  };
  const B = {
    L,
    /** carve empty space */
    room(x0, y0, z0, x1, y1, z1) {
      each([x0, y0, z0], [x1, y1, z1], (n) => (grid[n] = EMPTY));
      return B;
    },
    fill(x0, y0, z0, x1, y1, z1, v = METAL) {
      each([x0, y0, z0], [x1, y1, z1], (n) => (grid[n] = v));
      return B;
    },
    /** paint every solid cell in the box as a portal surface */
    white(x0, y0, z0, x1, y1, z1) {
      each([x0, y0, z0], [x1, y1, z1], (n) => {
        if (grid[n] === METAL) grid[n] = WHITE;
      });
      return B;
    },
    /** turn solid cells back to dark metal */
    dark(x0, y0, z0, x1, y1, z1) {
      each([x0, y0, z0], [x1, y1, z1], (n) => {
        if (grid[n] === WHITE) grid[n] = METAL;
      });
      return B;
    },
    glass(x0, y0, z0, x1, y1, z1) {
      each([x0, y0, z0], [x1, y1, z1], (n) => (grid[n] = GLASS));
      return B;
    },
    /** flood the empty cells of the box with energy liquid */
    goo(x0, y0, z0, x1, y1, z1) {
      each([x0, y0, z0], [x1, y1, z1], (n) => {
        if (grid[n] === EMPTY) grid[n] = GOO;
      });
      return B;
    },
    spawn(cell, face = "nz") {
      L.spawn = { pos: [cell[0] * CELL + 1, cell[1] * CELL + 0.01, cell[2] * CELL + 1], yaw: YAW[face] };
      return B;
    },
    /** exit lift: a door in `door` that leads into the goal cell */
    exit(door, goal, inputs = [], any = false) {
      const axis = door[0] !== goal[0] ? 0 : 2;
      grid[id(...door)] = EMPTY;
      grid[id(...goal)] = EMPTY;
      L.doors.push({ id: "exit", cell: door, axis, inputs, any, exit: true });
      L.exit = { door, goal };
      return B;
    },
    door(name, cell, axis, inputs, any = false, latch = false) {
      grid[id(...cell)] = EMPTY;
      L.doors.push({ id: name, cell, axis: axis === "x" ? 0 : 2, inputs, any, latch });
      return B;
    },
    plate(name, cell, cubeOnly = false) {
      L.plates.push({ id: name, cell, cubeOnly });
      return B;
    },
    cube(cell, kind = "cube", face = "nz") {
      L.cubes.push({ pos: [cell[0] * CELL + 1, cell[1] * CELL + 0.001, cell[2] * CELL + 1], kind, dir: FACES[face] });
      return B;
    },
    /** cube at an exact world position (bottom centre) */
    cubeAt(pos, kind = "cube", face = "nz") {
      L.cubes.push({ pos, kind, dir: FACES[face] });
      return B;
    },
    button(name, cell, time = 0) {
      L.switches.push({ id: name, pos: [cell[0] * CELL + 1, cell[1] * CELL, cell[2] * CELL + 1], time });
      return B;
    },
    emitter(cell, face, inputs = []) {
      L.emitters.push({ cell, face, inputs });
      return B;
    },
    receiver(name, cell, face) {
      L.receivers.push({ id: name, cell, face });
      return B;
    },
    /** moving platform between two cells (bottom of the slab `lift` metres above the cell floor) */
    platform(name, a, b, opts = {}) {
      const o = opts.offset || [0, 0, 0];
      const at = (c, lift) => [c[0] * CELL + 1 + o[0], c[1] * CELL + lift, c[2] * CELL + 1 + o[2]];
      L.platforms.push({
        id: name,
        a: at(a, opts.liftA ?? -0.3),
        b: at(b, opts.liftB ?? -0.3),
        size: opts.size || [1.96, 0.3, 1.96],
        speed: opts.speed || 2,
        inputs: opts.inputs || [],
        any: !!opts.any,
        loop: !!opts.loop,
        pause: opts.pause ?? 1.2,
      });
      return B;
    },
    checkpoint(cell, face = "nz") {
      L.checkpoints.push({ cell, yaw: YAW[face] });
      return B;
    },
    portal(color, cell, face, up) {
      L.fixedPortals[color] = { cell, face, up };
      return B;
    },
    lock(...colors) {
      L.locked.push(...colors);
      return B;
    },
    pad(cell, vel) {
      L.pads.push({ cell, vel });
      return B;
    },
  };
  return B;
}

export const cx = (i) => i * CELL + 1;
export { YAW };
