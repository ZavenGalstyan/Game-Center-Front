/**
 * Pirate Cove — island props: what each prop blocks (engine colliders) and
 * how much room it wants cleared of vegetation. The renderer draws each type
 * in three/Props.jsx; the engine only needs the footprint.
 *
 * Collider specs are prop-local (x right, z forward), rotated by the prop's
 * `rot` and lifted to the ground height at the prop:
 *   c: [lx, lz, r]                circle
 *   b: [lx, lz, hw, hd, top]      box (top above ground; ≤ a step = walkable)
 */
export const PROP_TYPES = {
  hut: { clear: 6, col: [{ b: [0, 0, 2.3, 2.1, 4.5] }] },
  tent: { clear: 4.5, col: [{ b: [0, 0, 1.6, 1.4, 2.6] }] },
  campfire: { clear: 3, col: [{ c: [0, 0, 0.75] }] },
  crates: { clear: 2, col: [{ c: [0, 0, 0.9] }] },
  barrels: { clear: 1.8, col: [{ c: [0, 0, 0.7] }] },
  table: { clear: 2.5, col: [{ b: [0, 0, 0.95, 0.6, 0.95] }] },
  boulder: { clear: 3, col: [{ c: [0, 0, 1.6] }] },
  bigRock: { clear: 5, col: [{ c: [0, 0, 3.2] }] },
  signpost: { clear: 1.5, col: [{ c: [0, 0, 0.2] }] },
  flag: { clear: 1.5, col: [{ c: [0, 0, 0.25] }] },
  torch: { clear: 1, col: [{ c: [0, 0, 0.15] }] },
  lantern: { clear: 1, col: [{ c: [0, 0, 0.18] }] },
  bones: { clear: 1.5, col: [] },
  skullRock: { clear: 4, col: [{ c: [0, 0, 2.2] }] },
  lighthouse: { clear: 7, col: [{ c: [0, 0, 3.1] }] },
  caveMouth: {
    clear: 7,
    col: [
      { c: [-3.6, -0.6, 2.2] },
      { c: [3.6, -0.6, 2.2] },
      { c: [0, -3.6, 3.2] },
      { c: [-2.6, -3.2, 2.2] },
      { c: [2.6, -3.2, 2.2] },
    ],
  },
  column: { clear: 2, col: [{ c: [0, 0, 0.62] }] },
  brokenColumn: { clear: 2, col: [{ c: [0, 0, 0.62] }] },
  statue: { clear: 3, col: [{ b: [0, 0, 0.9, 0.9, 5] }] },
  idol: { clear: 6, col: [{ b: [0, 0, 2, 2, 9] }] },
  ruinWall: { clear: 3, len: true, col: [{ b: [0, 0, 4, 0.6, 3.2] }] },
  ruinFloor: { clear: 6, fixedTop: true, col: [{ b: [0, 0, 5, 5, 0.35] }] },
  stairs: { clear: 3, col: [{ b: [0, -1.2, 2, 0.6, 0.3] }, { b: [0, 0, 2, 0.6, 0.6] }] },
  fortWall: { clear: 4, len: true, col: [{ b: [0, 0, 7, 1.1, 6] }] },
  fortTower: { clear: 6, col: [{ c: [0, 0, 3.6] }] },
  fortGate: { clear: 6, col: [{ b: [-4.3, 0, 1.6, 1.4, 6.5] }, { b: [4.3, 0, 1.6, 1.4, 6.5] }] },
  wreckBeach: { clear: 7, col: [{ b: [0, 0, 1.8, 5.5, 2.6] }] },
  rowboat: { clear: 3, col: [{ b: [0, 0, 0.8, 2, 0.9] }] },
  well: { clear: 2.5, col: [{ c: [0, 0, 1] }] },
  pedestal: { clear: 2, col: [{ c: [0, 0, 0.55] }] },
  brazier: { clear: 2, col: [{ c: [0, 0, 0.45] }] },
  cannonEmplacement: { clear: 3, col: [{ b: [0, 0, 1.1, 1.6, 1.1] }] },
  treasurePile: { clear: 3, col: [{ c: [0, 0, 1.2] }] },
  deadTree: { clear: 2, col: [{ c: [0, 0, 0.4] }] },
  stoneRing: { clear: 5, col: [] },
  palmBig: { clear: 2, col: [{ c: [0, 0, 0.45] }] },
};

/** World colliders for a placed prop: { circles, boxes }. */
export function propColliders(p, groundY) {
  const T = PROP_TYPES[p.t];
  const out = { circles: [], boxes: [] };
  if (!T) return out;
  const s = p.scale || 1;
  const c = Math.cos(p.rot || 0);
  const sn = Math.sin(p.rot || 0);
  // prop-local → world, matching three's rotation.y = rot
  const tx = (lx, lz) => ({ x: p.x + lx * c + lz * sn, z: p.z - lx * sn + lz * c });
  for (const k of T.col) {
    if (k.c) {
      const w = tx(k.c[0] * s, k.c[1] * s);
      out.circles.push({ x: w.x, z: w.z, r: k.c[2] * s, prop: p.t });
    } else if (k.b) {
      const w = tx(k.b[0] * s, k.b[1] * s);
      const hw = T.len && p.len ? p.len / 2 : k.b[2] * s;
      out.boxes.push({ x: w.x, z: w.z, hw, hd: k.b[3] * s, rot: p.rot || 0, top: groundY + k.b[4] * (T.fixedTop ? 1 : s), prop: p.t });
    }
  }
  return out;
}
