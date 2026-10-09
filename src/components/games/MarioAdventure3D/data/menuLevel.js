/**
 * Mario Adventure 3D — the showcase island behind the main menu: a round
 * meadow where Mario runs laps (menu autopilot), with pipes, ? blocks,
 * coins, a lift and a couple of wandering troopers.
 */
import { build } from "./kit.js";

let cached = null;
export function menuLevel() {
  if (cached) return cached;
  const L = build({ id: 0, world: 1, num: 0, name: "Menu", theme: "green", sea: { kind: "water", y: -3 }, killY: -20 });
  L.island(0, 0, 22, 22, 0, { wob: 0.05 });
  L.island(26, 20, 7, 7, 6, { wob: 0.08, float: 7 });
  L.island(-24, 26, 6, 6, 9, { wob: 0.08, float: 6 });
  L.hill(0, 0, 6, 1.6, { flat: 0.4 });
  L.hill(-12, -9, 6, 2.6);
  L.hill(11, -11, 5, 1.8);
  L.spawn(8, 0, 0);
  L.coinRingG(0, 0, 8, 14);
  L.qblock(-2.2, 4.2, 0).qblock(0, 4.2, 0, "speed").brick(2.2, 4.2, 0);
  L.pipe(-14, 6, 2.6);
  L.pipe(14, 8, 1.8);
  L.mover(16, 2.4, -3, 2.6, 2.6, [16, 5, -3], 5);
  L.enemy("walker", -6, 12, { radius: 3 });
  L.enemy("walker", 6, -12, { radius: 3 });
  L.enemy("flyer", 10, 10, { radius: 2.5, fly: 3 });
  L.deco("tree", -8, -16, { s: 1.1 });
  L.deco("tree", 15, -2, { s: 0.9 });
  L.deco("tree", -17, -3, { s: 1.15 });
  L.deco("tree", 4, 17, { s: 1 });
  L.deco("tree", 26, 20, { s: 0.8 });
  L.deco("castle", -2, -19, { rot: 0, noCollide: true, s: 0.8 });
  L.scatter("flowers", 30, 0, 0, 20, 20, { noCollide: true, avoid: [[0, 0, 9.5]] });
  L.scatter("bush", 8, 0, 0, 19, 19, { noCollide: true, avoid: [[0, 0, 10]] });
  cached = L.done();
  return cached;
}

/** Mario runs laps round the meadow, hopping now and then */
export function menuAutopilot() {
  let t = 0;
  let nextJump = 2.4;
  return (W, dt) => {
    t += dt;
    const p = W.player;
    const R = 8;
    const a = Math.atan2(p.z, p.x) + 0.55;
    const tx = Math.cos(a) * R;
    const tz = Math.sin(a) * R;
    // steer in world space (camera yaw is 0 in menu mode: forward = +z, right = -x)
    let dx = tx - p.x;
    let dz = tz - p.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    let jump = false;
    if (t > nextJump) {
      jump = true;
      nextJump = t + 2.2 + Math.random() * 2.5;
    }
    W.cam.yaw = 0;
    return { ax: -dx, ay: dz, sprint: Math.sin(t * 0.3) > 0.2, jumpHeld: jump || p.vy > 0, jump };
  };
}
