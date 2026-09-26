/**
 * Element Merge — progressive, non-spoiling hint engine. Never suggests a
 * recipe requiring an element the player hasn't unlocked yet — every
 * candidate comes from `nextReachable`, which only looks one step past the
 * player's current unlocked set (engine/discoveryEngine.js).
 */
import { getElement } from "../data/elements.js";
import { nextReachable } from "./discoveryEngine.js";

const FAMILY_FLAVOR = {
  energy: "something warm or powerful",
  fluid: "something wet or related to the sky",
  mineral: "something solid, like earth or stone",
  air: "something airy or related to the sky",
  organic: "something green and growing",
  creature: "something alive",
  human: "something related to people",
  mechanical: "something built or mechanical",
  cosmic: "something related to space",
};

function flavorFor(id) {
  const el = getElement(id);
  return FAMILY_FLAVOR[el?.family] || "something nearby";
}

/**
 * Pick one currently-reachable-but-undiscovered recipe to hint toward.
 * `seed` lets callers get a stable pick across re-renders in the same turn.
 */
function pickCandidate(unlockedIds, seed = 0) {
  const candidates = nextReachable(unlockedIds);
  if (!candidates.length) return null;
  return candidates[seed % candidates.length];
}

/**
 * level: 1 (vague flavor text) | 2 (one input + the result) | 3 (both inputs, hidden result)
 * Returns { level, text, resultId, a, b } — screens render `text` for level 1
 * and build their own token row for 2/3 using the ids (so undiscovered names
 * still render as "???" via the caller's own discovered-check).
 */
export function getHint(unlockedIds, level = 1, seed = 0) {
  const candidate = pickCandidate(unlockedIds, seed);
  if (!candidate) return null;
  const { a, b, result } = candidate;
  const resultEl = getElement(result);

  if (level >= 3) {
    return { level: 3, a, b, resultId: result, text: `${getElement(a).name} + ${getElement(b).name} = ?` };
  }
  if (level === 2) {
    return { level: 2, a, b, resultId: result, revealA: true, text: `${getElement(a).name} + ??? = ${resultEl.name}` };
  }
  return {
    level: 1,
    a, b, resultId: result,
    text: `Try combining ${getElement(a).name} with ${flavorFor(b)}.`,
  };
}
