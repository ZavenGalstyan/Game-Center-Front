import { Game } from "../engine/game.js";
import { newProfile } from "../engine/profile.js";
import { createBot } from "./bot.mjs";
const P = newProfile(); for (let i = 1; i <= 4; i++) { P.story.done.push(i); P.story.flags['c'+i] = true; }
P.level = 5;
const G = new Game(P, { seed: 3, district: "market" });
const bot = createBot(G);
bot.prepare();
console.log(G.missions.start(5));
let t = 0, fails = 0;
for (let i = 0; i < 60 * 300 && fails < 4; i++) {
  const inp = bot.step(); G.step(1/60, inp); t += 1/60;
  for (const ev of G.drain()) {
    if (ev.type === 'alert') { const e = G.enemies.find(x => x.id === ev.id); console.log(t.toFixed(1), 'ALERT by', e.type, e.mission ? 'mission' : 'ambient', 'at', e.x.toFixed(1), e.z.toFixed(1), 'yaw', e.yaw.toFixed(2), 'player', G.player.x.toFixed(1), G.player.z.toFixed(1), 'crouch', G.player.crouchT.toFixed(1), 'd', Math.hypot(e.x - G.player.x, e.z - G.player.z).toFixed(1)); }
    if (ev.type === 'missionFailed') { fails++; console.log(t.toFixed(1), 'FAILED', ev.reason); }
    if (ev.type === 'kill') console.log(t.toFixed(1), 'kill', ev.name, ev.takedown ? 'takedown' : '');
  }
  if (i % 600 === 0) console.log(t.toFixed(1), 'step', G.missions.active?.stepI, 'player', G.player.x.toFixed(1), G.player.z.toFixed(1), 'crouch', G.player.crouch);
}
