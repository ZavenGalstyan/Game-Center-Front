/**
 * Underground Bunker — SITE 9. Carved from a 46 × 36 grid of 2 m cells:
 * entry hall (elevator back up), a long main corridor, barracks, a lab, the
 * generator room, storage, the locked armory (Security Keycard) and the
 * sealed containment hall where The Warden waits. The blast door to the hall
 * only opens once the generator's power is restored.
 */
import { createLayout, gridWalls } from "../../engine/layout.js";

const COLS = 46;
const ROWS = 36;
const CELL = 2;
const OX = -46;
const OZ = -36;
/** Cell centre → world. */
const cx = (c) => OX + c * CELL + CELL / 2;
const cz = (r) => OZ + r * CELL + CELL / 2;

export const BUNKER_ROOMS = [
  // [name, c0, r0, c1, r1] inclusive cell ranges
  ["Entry Hall", 2, 13, 9, 22],
  ["Main Corridor", 10, 16, 40, 18],
  ["Barracks", 3, 2, 13, 10],
  ["Lab", 16, 3, 27, 11],
  ["Generator Room", 30, 3, 41, 10],
  ["Storage", 11, 22, 20, 31],
  ["Armory", 24, 23, 30, 30],
  ["Containment Hall", 33, 20, 44, 33],
];
const PASSAGES = [
  [7, 11, 8, 12], // barracks → entry hall
  [21, 12, 22, 15], // lab → corridor
  [35, 11, 36, 15], // generator → corridor
  [14, 19, 15, 21], // corridor → storage
  [27, 19, 27, 22], // corridor → armory (locked at r 21)
  [38, 19, 39, 19], // corridor → containment (blast door)
];

export function buildBunker() {
  const B = createLayout({ id: "bunker", name: "Underground Bunker", w: COLS * CELL, d: ROWS * CELL, seed: 5501, biome: "bunker", base: "concrete" });
  const { L } = B;
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill("#"));
  const carve = (c0, r0, c1, r1) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r][c] = ".";
  };
  for (const [, c0, r0, c1, r1] of BUNKER_ROOMS) carve(c0, r0, c1, r1);
  for (const p of PASSAGES) carve(...p);
  const rows = grid.map((r) => r.join(""));
  L.grid = { rows, cell: CELL, ox: OX, oz: OZ };
  L.rooms = BUNKER_ROOMS.map(([name, c0, r0, c1, r1]) => ({ name, x0: OX + c0 * CELL, z0: OZ + r0 * CELL, x1: OX + (c1 + 1) * CELL, z1: OZ + (r1 + 1) * CELL }));
  for (const b of gridWalls(rows, CELL, OX, OZ)) {
    const hw = (b.x1 - b.x0) / 2;
    const hd = (b.z1 - b.z0) / 2;
    L.solids.push({ k: "b", x: b.x0 + hw, z: b.z0 + hd, hw, hd, a: 0, op: true });
    L.walls.push({ block: true, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: 3.4, mat: "bunker" });
  }
  // floor paint: room floors concrete, corridor stripes, debris
  for (const r of L.rooms) B.paintRect("concrete", r.x0, r.z0, r.x1, r.z1, 0.1, 1);
  for (let k = 0; k < 30; k++) {
    const r = L.rooms[k % L.rooms.length];
    B.paintCircle("dirt", B.r(r.x0 + 1, r.x1 - 1), B.r(r.z0 + 1, r.z1 - 1), B.r(0.8, 2.2), 1.2, 0.5);
  }
  B.paintRect("asphalt", cx(10), cz(17) - 0.5, cx(40), cz(17) + 0.5, 0.1, 0.35);

  // locked doors
  L.doors.push({ id: "armory_door", x: cx(27), z: OZ + 21 * CELL + CELL / 2, yaw: 0, w: 2.2, key: "security_card", label: "Armory — Security Keycard required", kind: "security" });
  L.doors.push({ id: "blast_door", x: OX + 38.5 * CELL + CELL / 2, z: cz(19), yaw: 0, w: 4.2, flag: "power", label: "Blast door — no power", kind: "blast" });
  L.switches = [{ id: "generator", x: cx(35), z: cz(4), label: "Restore power", flag: "power" }];

  // props / containers per room (cells)
  const P = (t, c, r, o = {}) => B.prop(t, cx(c) + (o.dx || 0), cz(r) + (o.dz || 0), o);
  const C = (t, c, r, yaw = 0, o = {}) => B.container(t, cx(c) + (o.dx || 0), cz(r) + (o.dz || 0), yaw, o);

  // entry hall
  P("elevator", 2, 17, { dx: -0.6, yaw: Math.PI / 2, solid: "b", hw: 1.4, hd: 1.6 });
  B.exit(cx(3) + 0.4, cz(17), "Elevator — back to the surface", { r: 2.2 });
  L.entry = { x: cx(5), z: cz(17), yaw: Math.PI / 2 };
  P("sandbags", 8, 14, { yaw: 0, solid: "b", hw: 1.4, hd: 0.4 });
  P("sandbags", 8, 21, { yaw: 0, solid: "b", hw: 1.4, hd: 0.4 });
  C("mil_crate", 3, 21, 0.2);
  P("warning_sign", 6, 13, { dz: -0.9 });

  // barracks
  for (const c of [4, 6, 8, 10]) C("bunker_locker", c, 2, 0, { dz: -0.4 });
  for (const c of [4, 7, 10]) {
    P("bunk", c, 5, { yaw: 0, solid: "b", hw: 0.5, hd: 1.05 });
    P("bunk", c, 8, { yaw: 0, solid: "b", hw: 0.5, hd: 1.05 });
  }
  P("table_metal", 12, 6, { solid: "b", hw: 0.8, hd: 0.5 });
  C("footlocker", 12, 9, Math.PI / 2, { id: "officer_locker", name: "Officer's Footlocker", contents: { security_card: 1, medkit: 1, pistol_ammo: 8 } });

  // lab
  for (const [c, r] of [
    [16, 3],
    [27, 3],
    [16, 11],
    [27, 11],
  ])
    C("lab_cabinet", c, r, c < 20 ? Math.PI / 2 : -Math.PI / 2);
  P("lab_table", 19, 6, { solid: "b", hw: 1.2, hd: 0.55 });
  P("lab_table", 24, 6, { solid: "b", hw: 1.2, hd: 0.55 });
  P("lab_tank", 21, 9, { solid: "c", r: 0.7 });
  P("lab_tank", 23, 9, { solid: "c", r: 0.7 });
  P("gurney", 18, 9, { yaw: 0.3, solid: "b", hw: 0.4, hd: 1 });

  // generator room
  P("generator", 33, 6, { solid: "b", hw: 1.5, hd: 1 });
  P("generator", 38, 6, { solid: "b", hw: 1.5, hd: 1 });
  P("switchboard", 35, 3, { dz: -0.5, solid: "b", hw: 1.2, hd: 0.3 });
  P("fuel_drums", 40, 9, { solid: "c", r: 0.8 });
  C("toolbox", 31, 9, 0.4);
  C("metal_crate", 40, 4, -0.2);

  // storage
  for (const [c, r] of [
    [12, 23],
    [15, 23],
    [19, 24],
    [12, 28],
    [17, 30],
  ])
    C("mil_crate", c, r, ((c + r) % 3) * 0.3);
  P("shelving", 19, 28, { yaw: Math.PI / 2, solid: "b", hw: 0.5, hd: 1.6 });
  P("shelving", 12, 26, { yaw: Math.PI / 2, solid: "b", hw: 0.5, hd: 1.6 });

  // armory (behind the security door)
  C("weapon_rack", 27, 29, 0, { id: "armory_rack", name: "Armory Weapon Rack", contents: { rifle: 1, rifle_ammo: 30, military_vest: 1 }, dz: 0.4 });
  C("mil_crate", 25, 24, 0.1);
  C("mil_crate", 29, 24, -0.1);
  P("gun_case", 24, 27, { yaw: Math.PI / 2, solid: "b", hw: 0.2, hd: 0.6 });

  // containment hall (boss arena)
  for (const [c, r] of [
    [35, 23],
    [42, 23],
    [35, 30],
    [42, 30],
  ])
    P("pillar", c, r, { solid: "b", hw: 0.7, hd: 0.7, op: true });
  P("cage", 38, 32, { yaw: 0, solid: "b", hw: 2, hd: 0.8 });
  P("debris", 37, 26, { s: 1.3 });
  P("debris", 41, 28, { s: 1.1 });
  L.boss = { id: "warden", x: cx(38) + 1, z: cz(27) };

  // lights: emergency (red, flicker) everywhere; white once power is back
  const lamp = (c, r, o = {}) => B.light(cx(c), 3.1, cz(r), { color: o.color || "#ff6a4a", i: o.i ?? 1.4, r: o.r ?? 11, kind: "ceiling", flicker: o.flicker ?? 0.5, power: true });
  for (const [c, r] of [
    [5, 15],
    [6, 20],
    [8, 4],
    [8, 8],
    [21, 5],
    [22, 10],
    [35, 7],
    [15, 17],
    [22, 17],
    [29, 17],
    [36, 17],
    [15, 26],
    [27, 26],
    [38, 23],
    [38, 30],
  ])
    lamp(c, r);

  // the dead of SITE 9
  B.spawn("walker", cx(20), cz(17), 3, 6);
  B.spawn("walker", cx(32), cz(17), 2, 5);
  B.spawn("runner", cx(26), cz(17), 2, 6);
  B.spawn("walker", cx(6), cz(6), 2, 4);
  B.spawn("armored", cx(9), cz(7), 1, 2);
  B.spawn("toxic", cx(21), cz(7), 3, 4);
  B.spawn("armored", cx(36), cz(8), 2, 3);
  B.spawn("runner", cx(36), cz(5), 1, 3);
  B.spawn("walker", cx(15), cz(27), 3, 4);
  B.spawn("runner", cx(17), cz(25), 2, 3);
  B.spawn("armored", cx(27), cz(26), 1, 2);
  return L;
}
