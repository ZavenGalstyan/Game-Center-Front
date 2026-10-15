/**
 * Camera collision check for every indoor room: the skater is placed all over
 * the floor (against walls, beside pillars / crates / ledges) facing 8
 * directions; after the chase camera settles it must
 *   - not be inside any wall or obstacle, nor outside the room,
 *   - have a clear line of sight to the rider,
 *   - not sit on top of the rider (≥ 1.4 m away).
 *   node src/components/games/UrbanSkateRush/tools/cameraTest.mjs
 */
import { createCamera, updateCamera, resetCamera, resolveCameraCollision } from "../engine/camera.js";
import { createPlayer } from "../engine/physics.js";
import { getLevelForMission } from "../data/levels/index.js";

const inside = (b, x, y, z, pad = 0) =>
  x > b.minX - pad && x < b.maxX + pad && y > (b.minY ?? 0) - pad && y < b.maxY + pad && z > b.minZ - pad && z < b.maxZ + pad;

let checks = 0;
let fails = 0;
const examples = [];
for (const lvl of [1, 2, 8, 13, 14, 19, 20, 25, 30]) {
  const L = getLevelForMission(`mission${lvl}`);
  const b = L.bounds;
  for (let x = b.minX + 0.5; x < b.maxX; x += 1.5) {
    for (let z = b.minZ + 0.5; z < b.maxZ; z += 1.5) {
      // the rider can't stand inside a solid obstacle (0.4 m body radius)
      if (L.obstacles.some((o) => o.maxY > 0.6 && inside(o, x, 0.5, z, 0.4))) continue;
      for (let k = 0; k < 8; k++) {
        const p = createPlayer({ x, y: 0, z, yaw: (k / 8) * Math.PI * 2 });
        const cam = createCamera();
        resetCamera(cam, p);
        for (let f = 0; f < 90; f++) {
          updateCamera(cam, p, { mouseDeltaX: 0, mouseDeltaY: 0 }, 1 / 60, {});
          resolveCameraCollision(cam, L.obstacles, b);
        }
        checks++;
        const bad = [];
        if (L.obstacles.some((o) => inside(o, cam.x, cam.y, cam.z, 0.1))) bad.push("inside obstacle");
        if (!inside({ ...b, minY: 0 }, cam.x, cam.y, cam.z, 0.01)) bad.push("outside room");
        const dist = Math.hypot(cam.x - cam.targetX, cam.y - cam.targetY, cam.z - cam.targetZ);
        if (dist < 1.4) bad.push(`too close ${dist.toFixed(2)}`);
        const head = Math.hypot(cam.x - cam.targetX, cam.y - (cam.targetY + 0.65), cam.z - cam.targetZ);
        if (head < 1.2) bad.push(`at the rider's head ${head.toFixed(2)}`);
        // line of sight to the rider's chest
        for (let s = 0.05; s < 0.95; s += 0.05) {
          const px = cam.x + (cam.targetX - cam.x) * s;
          const py = cam.y + (cam.targetY - cam.y) * s;
          const pz = cam.z + (cam.targetZ - cam.z) * s;
          if (L.obstacles.some((o) => inside(o, px, py, pz, -0.02))) {
            bad.push("view blocked");
            break;
          }
        }
        if (bad.length) {
          fails++;
          if (examples.length < 8) examples.push(`L${lvl} rider(${x.toFixed(1)},${z.toFixed(1)}) yaw${k} cam(${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.z.toFixed(1)}): ${bad.join(", ")}`);
        }
      }
    }
  }
}
for (const e of examples) console.log("  FAIL", e);
console.log(`${checks - fails}/${checks} camera placements OK`);
process.exit(fails ? 1 : 0);
