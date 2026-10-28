/**
 * Last Hope — harvestable resource nodes.
 *
 * Swing nodes (trees, rocks, bushes, scrap, wrecks, machines) take hits: each
 * hit adds the weapon's gather power for that kind to an accumulator and
 * every whole point yields one `item` until `amount` runs out. `bonus` rolls
 * a chance per yielded item. `min` is the gather power required at all.
 * Pick nodes (branches, loose stones, mushrooms, berry bushes) are collected
 * with one interact.
 * Depleted nodes come back `resp` seconds of game time later.
 */
export const NODES = {
  tree: { kind: "tree", amount: 8, item: "wood", resp: 360, label: "Oak", bonus: [["fiber", 0.08]] },
  pine: { kind: "tree", amount: 7, item: "wood", resp: 360, label: "Pine", bonus: [["fiber", 0.05]] },
  birch: { kind: "tree", amount: 6, item: "wood", resp: 330, label: "Birch", bonus: [["fiber", 0.1]] },
  stump_big: { kind: "tree", amount: 6, item: "wood", resp: 600, label: "Old Stump" },
  rock: { kind: "rock", amount: 6, item: "stone", resp: 420, label: "Rock", bonus: [["metal", 0.06]] },
  boulder: { kind: "rock", amount: 10, item: "stone", resp: 520, label: "Boulder", bonus: [["metal", 0.1]] },
  bush: { kind: "bush", amount: 3, item: "fiber", resp: 200, label: "Bush" },
  scrap: { kind: "scrap", amount: 5, item: "metal", resp: 600, label: "Scrap Pile", min: 0.3, bonus: [["parts", 0.12]] },
  wreck: { kind: "scrap", amount: 7, item: "metal", resp: 1200, label: "Wrecked Car", min: 1, bonus: [["parts", 0.22], ["cloth", 0.1]], need: "Needs a pickaxe or crowbar" },
  machine: { kind: "scrap", amount: 5, item: "metal", resp: 1200, label: "Machinery", min: 1, bonus: [["parts", 0.5]], need: "Needs a pickaxe or crowbar" },
  branch: { pick: true, give: { wood: [2, 3] }, resp: 160, label: "Fallen Branches" },
  stones: { pick: true, give: { stone: [2, 3] }, resp: 160, label: "Loose Stones" },
  mushroom: { pick: true, give: { mushroom: [1, 2] }, resp: 240, label: "Mushrooms" },
  berry: { pick: true, give: { berries: [2, 4], fiber: [0, 1] }, resp: 260, label: "Berry Bush" },
};

/** Bare-hands gather power. */
export const FIST_GATHER = { tree: 0.5, rock: 0.34, scrap: 0.34, bush: 1 };

export const nodeDef = (t) => NODES[t];
export const isPickNode = (t) => !!NODES[t]?.pick;
/** The gather "kind" a weapon is best at, for auto-selecting a tool. */
export function bestToolFor(kind, items) {
  let best = null;
  let bp = kind === "bush" ? 0.99 : FIST_GATHER[kind] || 0;
  for (const it of items) {
    const p = it.w?.gather?.[kind] || 0;
    if (p > bp) {
      bp = p;
      best = it;
    }
  }
  return best;
}
