import { Bot, playCampaign } from "./bot.mjs";
const hero = process.argv[2] || "harry";
const bot = new Bot(hero, { verbose: true, seed: Number(process.argv[3] || 7) });
const t0 = Date.now();
try {
  playCampaign(bot);
  console.log("FINISHED", hero, "game time", bot.G.time.toFixed(0), "s deaths", bot.deaths, "level", bot.G.P.heroes[hero].level, "wall", Date.now() - t0, "ms");
} catch (e) {
  console.log("FAILED:", e.message);
  const G = bot.G;
  console.log("quests", JSON.stringify(G.P.quests));
  console.log("alive", JSON.stringify(G.enemies.filter(e => !e.dead && e.def.ai !== "dummy").map(e => [e.type, e.group, +e.x.toFixed(1), +e.y.toFixed(1), +e.z.toFixed(1), e.aggro, G.nav.open(e.x, e.z)])));
  console.log("player", G.player.x.toFixed(1), G.player.z.toFixed(1), G.player.y.toFixed(1), "hp", G.player.hp|0, "focus", G.focus?.label);
  console.log(e.stack.split("\n").slice(0,5).join("\n"));
}
