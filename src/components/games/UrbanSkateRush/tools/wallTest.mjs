/**
 * Wall stress test: in every room the skater rides flat-out (sprinting) at
 * walls, pillars and props from many spots and headings, jumping non-stop
 * and launching off kickers. Every frame it must stay inside the room and
 * never be inside a solid (tall) obstacle.
 *   node src/components/games/UrbanSkateRush/tools/wallTest.mjs
 * PHYSICS=../path/to/physics.js swaps the physics module (to prove the test
 * catches a regression).
 */
import { getLevelForMission } from "../data/levels/index.js";

const physicsPath = process.env.PHYSICS || "../engine/physics.js";
const { createPlayer, stepPlayer, CONFIG } = await import(physicsPath);

const R = CONFIG.PLAYER_RADIUS;
let runs = 0;
let bad = 0;
const examples = [];
for (const lvl of [1, 2, 7, 8, 13, 14, 19, 20, 25, 26]) {
  const L = getLevelForMission(`mission${lvl}`);
  const b = L.bounds;
  const world = { grounds: L.grounds, obstacles: L.obstacles, rails: L.rails, bounds: b };
  const solid = L.obstacles.filter((o) => o.maxY > 1.2 && !o.id.startsWith("wall"));
  for (let sx = b.minX + 2; sx < b.maxX - 1; sx += 4) {
    for (let sz = b.minZ + 2; sz < b.maxZ - 1; sz += 4) {
      if (solid.some((o) => sx > o.minX - 1 && sx < o.maxX + 1 && sz > o.minZ - 1 && sz < o.maxZ + 1)) continue;
      for (let k = 0; k < 8; k++) {
        runs++;
        const p = createPlayer({ x: sx, y: 0.05, z: sz, yaw: (k / 8) * Math.PI * 2 });
        let fail = null;
        for (let f = 0; f < 60 * 8 && !fail; f++) {
          const jump = f % 40 === 0;
          stepPlayer(p, {
            mx: Math.sin(f * 0.013 + k) * 0.25, mz: 1, mag: 1, sprint: true,
            jumpPressed: jump, jumpHeld: jump, crouch: false, grind: false,
            kickflip: f % 40 === 15, heelflip: false, shoveIt: false,
          }, 1 / 60, world);
          p.events = [];
          if (p.x < b.minX + R - 1e-6 || p.x > b.maxX - R + 1e-6 || p.z < b.minZ + R - 1e-6 || p.z > b.maxZ - R + 1e-6) {
            fail = `left the room at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) state ${p.state}`;
          }
          for (const o of solid) {
            if (p.y < o.maxY && p.x > o.minX + R * 0.5 && p.x < o.maxX - R * 0.5 && p.z > o.minZ + R * 0.5 && p.z < o.maxZ - R * 0.5) {
              fail = `inside ${o.id} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) state ${p.state}`;
              break;
            }
          }
        }
        if (fail) {
          bad++;
          if (examples.length < 6) examples.push(`L${lvl} start(${sx.toFixed(0)},${sz.toFixed(0)}) dir${k}: ${fail}`);
        }
      }
    }
  }
}
for (const e of examples) console.log("  FAIL", e);
console.log(`${runs - bad}/${runs} wall runs OK`);
process.exit(bad ? 1 : 0);
