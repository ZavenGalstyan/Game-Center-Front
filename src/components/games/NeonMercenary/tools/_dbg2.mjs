import { Game } from "../engine/game.js";
import { newProfile } from "../engine/profile.js";
import { createBot } from "./bot.mjs";
import { lineOfSight } from "../engine/map.js";
import { wrapAngle, yawOf, dist } from "../engine/math.js";
const P = newProfile(); for (let i = 1; i <= 4; i++) { P.story.done.push(i); P.story.flags['c'+i] = true; }
const G = new Game(P, { seed: 3, district: "market" });
const bot = createBot(G);
G.missions.start(5);
G.enemies = G.enemies.filter(e => !e.ambient);
let t = 0;
for (let i = 0; i < 60 * 45; i++) {
  const inp = bot.step(); G.step(1/60, inp); t += 1/60;
  const evs = G.drain();
  if (G.missions.active?.stepI === 1 && i % 15 === 0) {
    const p = G.player;
    const g = G.enemies.filter(e => e.mission && e.state !== 'dead').map(e => ({ e, d: dist(e.x, e.z, p.x, p.z) })).sort((a, b) => a.d - b.d)[0];
    if (g) { const e = g.e; const facing = Math.abs(wrapAngle(yawOf(p.x - e.x, p.z - e.z) - e.yaw)); const los = lineOfSight(G.map, e.x, e.y + 1.6, e.z, p.x, p.y + 1, p.z);
      console.log(t.toFixed(2), 'p', p.x.toFixed(1), p.z.toFixed(1), 'inp', inp.mx.toFixed(1), inp.mz.toFixed(1), 'g', e.x.toFixed(1), e.z.toFixed(1), 'd', g.d.toFixed(1), 'fac', facing.toFixed(2), 'los', los, 'aware', e.aware.toFixed(2), e.state); }
  }
  if (evs.some(e => e.type === 'missionFailed')) { console.log('FAIL at', t.toFixed(1)); break; }
}
