#!/usr/bin/env node
/**
 * Element Merge — recipe graph validator. Run with:
 *   node src/components/games/ElementMerge/engine/validate.mjs
 *
 * Checks (per the design spec's "anti-bug" and "reachability" requirements):
 *   - every recipe's inputs and result reference a real element id
 *   - no duplicate normalized pair maps to two different results
 *   - the four starters are valid elements
 *   - every non-secret, non-starter element is reachable from the starters
 *     by repeatedly applying recipes (simulateReachable)
 *   - no element id is used as a recipe result more than... (dup results are
 *     fine, ONLY dup normalized pairs with different results are an error)
 *
 * Exits non-zero on any failure so it can gate a future CI step.
 */
import { ELEMENTS, STARTER_IDS } from "../data/elements.js";
import { RECIPES, buildRecipeIndex } from "../data/recipes.js";
import { simulateReachable } from "./discoveryEngine.js";

const ids = new Set(ELEMENTS.map((e) => e.id));
let failed = false;
const fail = (msg) => { console.error(`✗ ${msg}`); failed = true; };
const ok = (msg) => console.log(`✓ ${msg}`);

// 1. duplicate element ids
const seen = new Set();
for (const e of ELEMENTS) {
  if (seen.has(e.id)) fail(`duplicate element id: ${e.id}`);
  seen.add(e.id);
}
if (seen.size === ELEMENTS.length) ok(`${ELEMENTS.length} element ids are unique`);

// 2. starters are valid
for (const s of STARTER_IDS) {
  if (!ids.has(s)) fail(`starter "${s}" is not a registered element`);
}
ok(`${STARTER_IDS.length} starter elements valid`);

// 3. every recipe references real elements
let badRefs = 0;
for (const [a, b, result] of RECIPES) {
  for (const ref of [a, b, result]) {
    if (!ids.has(ref)) { fail(`recipe [${a}, ${b}] -> ${result} references unknown element "${ref}"`); badRefs++; }
  }
}
if (badRefs === 0) ok(`all ${RECIPES.length} recipes reference valid element ids`);

// 4. duplicate normalized pairs pointing at different results
const index = buildRecipeIndex(RECIPES);
if (index.conflicts.length) {
  for (const c of index.conflicts) {
    fail(`recipe pair "${c.a} + ${c.b}" conflicts: "${c.first}" vs "${c.second}"`);
  }
} else {
  ok(`no duplicate normalized pairs (${index.size} unique pairs across ${RECIPES.length} recipes)`);
}

// 5. reachability
const { unlocked } = simulateReachable(STARTER_IDS);
const unreachable = ELEMENTS.filter((e) => !unlocked.has(e.id) && !e.secret);
console.log(`\nReachability: ${unlocked.size} / ${ELEMENTS.length} elements reachable from starters.`);
if (unreachable.length) {
  fail(`${unreachable.length} unreachable required element(s): ${unreachable.map((e) => e.id).join(", ")}`);
} else {
  ok("every non-secret element is reachable from Fire/Water/Earth/Air");
}

// 6. summary report
const dupResults = new Map();
for (const [, , result] of RECIPES) dupResults.set(result, (dupResults.get(result) || 0) + 1);
const multiPathResults = [...dupResults.entries()].filter(([, n]) => n > 1);

console.log("\n---- Element Merge recipe graph report ----");
console.log(`Total registered elements: ${ELEMENTS.length}`);
console.log(`Reachable elements:        ${unlocked.size}`);
console.log(`Unreachable elements:      ${unreachable.length}`);
console.log(`Total recipes:             ${RECIPES.length}`);
console.log(`Unique normalized pairs:   ${index.size}`);
console.log(`Duplicate/conflicting pairs: ${index.conflicts.length}`);
console.log(`Elements with >1 recipe path: ${multiPathResults.length} (${multiPathResults.map(([r]) => r).join(", ") || "none"})`);
console.log("--------------------------------------------\n");

if (failed) {
  console.error("VALIDATION FAILED\n");
  process.exit(1);
} else {
  console.log("VALIDATION PASSED\n");
}
