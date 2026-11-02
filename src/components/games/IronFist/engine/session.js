/**
 * Binds input sources to the two fighters of one match. This is the ONLY place
 * the two modes differ:
 *   arcade  side 0 ← keyboard (either key set), side 1 ← AI
 *   vs      side 0 ← keyboard P1 keys,          side 1 ← keyboard P2 keys (no AI exists)
 */
import { createAI } from "./ai.js";
import { EMPTY_INPUT } from "./fight.js";

export function createSession({ mode, keyboard = null, ai = null, seed = 1 }) {
  if (mode !== "arcade" && mode !== "vs") throw new Error(`bad mode ${mode}`);
  keyboard?.setMode(mode);
  const bot = mode === "arcade" ? createAI(ai || undefined, seed) : null;
  const controllers = mode === "arcade" ? ["keyboard", "ai"] : ["keyboard", "keyboard"];
  return {
    mode,
    controllers,
    ai: bot,
    /** Input frames for one sim step. */
    inputs(m, dt) {
      const p1 = keyboard ? keyboard.read(0) : EMPTY_INPUT;
      const p2 = bot ? bot.update(m, 1, dt) : keyboard ? keyboard.read(1) : EMPTY_INPUT;
      return [p1, p2];
    },
  };
}
