/**
 * Night Corridor — bot walkthroughs per section (test-only data).
 *
 * plan       the intended route
 * chaseAt    index in `plan` where the scripted chase starts (torture variants
 *            splice hesitation / detours in there)
 * retryPlan  route after a checkpoint restore (defaults to plan.slice(chaseAt))
 * stealth    patrol sections: the bot hides when the creature prowls close
 */
export const WALKTHROUGHS = {
  1: {
    plan: [{ door: "X", once: true }, { take: "K" }, { go: "A" }, { wait: 2.5, look: "G" }, { door: "X" }],
    expectStates: ["SCRIPTED"],
  },
  2: {
    plan: [{ take: "F" }, { use: "B" }, { waitFlag: "blackout", max: 8 }, { go: "Z" }, { waitFlag: "chased:c1", max: 3 }, { door: "X" }],
    chaseAt: 3,
    chases: 1,
    doorDelay: true,
    wrongWay: { x: 28, z: 11 },
    corner: { x: 39, z: 11 },
  },
  3: {
    plan: [{ take: "K" }, { go: "G" }, { wait: 2, look: { x: 55, z: 11 } }, { door: "X" }],
    expectStates: ["SCRIPTED"],
  },
  4: {
    plan: [{ take: "K" }, { door: "L" }, { go: "Z" }, { waitFlag: "chased:c1", max: 3 }, { door: "X" }],
    chaseAt: 2,
    chases: 1,
    doorDelay: true,
    corner: { x: 3, z: 19 },
  },
  5: {
    plan: [{ hide: true }, { wait: 20 }, { waitFar: 11, max: 60 }, { leave: true }, { take: "K" }, { door: "X" }],
    stealth: true,
    expectStates: ["PATROL"],
    hideTest: true,
  },
  6: {
    plan: [{ use: "U" }, { go: "Z" }, { waitFlag: "chased:c1", max: 3 }, { door: "X" }],
    chaseAt: 1,
    chases: 1,
    doorDelay: true,
  },
  7: {
    plan: [{ take: "K" }, { hide: true }, { waitGone: true, minT: 4, max: 80 }, { leave: true }, { door: "X" }],
    stealth: true,
    expectStates: ["SCRIPTED", "PATROL"],
  },
  8: {
    plan: [{ take: "W" }, { use: "V" }, { door: "X" }],
    stealth: true,
    expectStates: ["PATROL"],
  },
  9: {
    plan: [{ use: "U" }, { go: "Z" }, { waitFlag: "chased:c1", max: 3 }, { door: "X" }],
    chaseAt: 1,
    chases: 1,
    doorDelay: true,
  },
  10: {
    plan: [{ door: "X", once: true }, { take: "K" }, { door: "X" }],
    chaseAt: 2,
    chases: 1,
    noSafe: true,
    expectStates: ["SCRIPTED"],
  },
};
