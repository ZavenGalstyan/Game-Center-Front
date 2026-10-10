import { createWorld, step, cityFor } from "../engine/world.js";
import { STEP } from "../engine/config.js";
import { findAnchor } from "../engine/hero.js";
const C = cityFor("downtown");
const sb = C.roofAt(35, -84).box;
const spec = { id: 0, district: "downtown", name: "t", spawn: { x: 31, y: sb.y1, z: -84, h: Math.PI / 2 }, steps: [{ type: "reach", at: { x: 9999, y: 0, z: 9999 }, label: "x" }] };
const W = createWorld(spec);
const yaw = Math.PI / 2;
let jumped = -1, qStart = -1;
for (let i = 0; i < 700; i++) {
  const h = W.hero;
  if (jumped < 0 && h.x > sb.x1 - 1.2) jumped = i;
  if (jumped > 0 && qStart < 0 && i > jumped + 12) qStart = i;
  const q = qStart > 0 && i >= qStart && i < qStart + (+process.argv[2] || 150);
  step(W, { mx: 0, my: 1, camYaw: yaw, sprint: true, swing: q, swingWas: q && i > qStart, jump: i === jumped, jumpHeld: jumped > 0 && i < jumped + 30 }, STEP);
  if (i % 12 === 0 || W.events.length) console.log(i, h.x.toFixed(1), h.y.toFixed(1), h.z.toFixed(1), h.mode, h.vx.toFixed(1), h.vy.toFixed(1), W.events.map(e => e.type + (e.x ? `@${e.x.toFixed(0)},${e.y.toFixed(0)},${e.z.toFixed(0)}` : "")).join(","));
  W.events.length = 0;
  if (h.grounded && i > (qStart > 0 ? qStart + 20 : 1e9)) { console.log("landed", h.x.toFixed(1), h.y.toFixed(1), h.z.toFixed(1)); break; }
}
