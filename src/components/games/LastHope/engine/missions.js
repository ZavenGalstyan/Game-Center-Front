/**
 * Last Hope — objective progress and rewards (see data/missions.js).
 */
import { MISSIONS, TRACKED } from "../data/missions.js";
import { ITEMS } from "../data/items.js";
import { LOCATIONS } from "../data/locations/index.js";
import { PIECES } from "../data/structures.js";
import { emit, giveXp } from "./damage.js";
import { giveItem, haveItem } from "./items.js";

export function progress(G, m) {
  const c = m.cond;
  const S = G.stats;
  const f = (cur, need) => ({ cur: Math.min(cur, need), need, done: cur >= need });
  switch (c.k) {
    case "gather":
      return f(S.gathered[c.item] || 0, c.n);
    case "craft":
      return f(S.crafted[c.item] || 0, c.n);
    case "build":
      return f(S.built[c.piece] || 0, c.n);
    case "upgrade":
      return f((S.upgrades[c.piece] ?? -1) >= c.tier ? 1 : 0, 1);
    case "kill":
      return f(S.kills[c.type] || 0, c.n);
    case "boss":
      return f(G.flags[`boss_${c.id}`] ? 1 : 0, 1);
    case "visit":
      return f(G.visited.includes(c.loc) ? 1 : 0, 1);
    case "loot":
      return f(S.looted[c.loc] || 0, c.n);
    case "have":
      return f(G.flags[`got_${c.item}`] || haveItem(G, c.item) ? 1 : 0, 1);
    case "eat":
      return f(S.eaten, c.n);
    case "flag":
      return f(G.flags[c.name] ? 1 : 0, 1);
    case "level":
      return f(G.P.level, c.n);
    default:
      return f(0, 1);
  }
}

export function tracked(G) {
  const out = [];
  for (const m of MISSIONS) {
    if (G.done.includes(m.id)) continue;
    out.push(m);
    if (out.length >= TRACKED) break;
  }
  return out;
}

export function checkMissions(G) {
  for (let guard = 0; guard < 8; guard++) {
    let changed = false;
    for (const m of tracked(G)) {
      if (!progress(G, m).done) continue;
      G.done.push(m.id);
      changed = true;
      const rewards = [];
      if (m.items)
        for (const [id, n] of Object.entries(m.items)) {
          giveItem(G, id, n);
          rewards.push(`${n}× ${ITEMS[id].name}`);
        }
      for (const loc of m.unlock || [])
        if (!G.unlocked.includes(loc)) {
          G.unlocked.push(loc);
          rewards.push(`${LOCATIONS[loc].name} unlocked`);
          emit(G, { t: "unlock", loc });
        }
      for (const fl of m.flags || []) G.flags[fl] = true;
      if (m.flags?.includes("gunsmith")) rewards.push("Pistol recipes");
      emit(G, { t: "mission", id: m.id, title: m.title, xp: m.xp, rewards });
      giveXp(G, m.xp);
    }
    if (!changed) break;
  }
  // story unlocks that also follow from items (if found out of order)
  if (G.flags.got_survivor_map && !G.unlocked.includes("industrial") && G.done.includes("m25")) G.unlocked.push("industrial");
}

/** Human-readable progress line for the tracker. */
export function progressText(G, m) {
  const p = progress(G, m);
  if (p.need <= 1) return p.done ? "Done" : "";
  return `${p.cur} / ${p.need}`;
}

export const pieceName = (k) => PIECES[k]?.name || k;
