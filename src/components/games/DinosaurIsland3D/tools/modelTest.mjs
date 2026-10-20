/**
 * Builds every procedural model headlessly and checks for NaNs + triangle budgets:
 *   node src/components/games/DinosaurIsland3D/tools/modelTest.mjs
 */
import * as M from "../models.js";

const mats = M.makeMaterials();
let fail = 0;
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const nan = (g) => Array.from(g.attributes.position.array).some((v) => !Number.isFinite(v));
const check = (name, g, budget) => {
  const t = tris(g);
  const bad = nan(g) || !g.attributes.color;
  if (bad || t > budget) fail++;
  console.log(`${bad || t > budget ? "✗" : "✓"} ${name.padEnd(14)} ${String(Math.round(t)).padStart(6)} tris${bad ? " (NaN/no colour!)" : ""}${t > budget ? ` > ${budget}` : ""}`);
};
const rigTris = (root) => {
  let t = 0;
  let calls = 0;
  let bad = false;
  root.traverse((o) => {
    if (o.isMesh) {
      t += tris(o.geometry);
      calls++;
      bad ||= nan(o.geometry);
    }
  });
  return { t, calls, bad };
};
for (const [name, g, b] of [
  ["palm", M.palmGeo(1), 900],
  ["jungle", M.jungleTreeGeo(1), 900],
  ["big tree", M.jungleTreeGeo(3, true), 1600],
  ["stump", M.stumpGeo(), 200],
  ["bush", M.bushGeo(2), 400],
  ["berries", M.berriesGeo(), 900],
  ["fern", M.fernGeo(), 120],
  ["grass", M.grassGeo(), 60],
  ["flower", M.flowerGeo(), 300],
  ["rock", M.rockGeo(1, true), 400],
  ["stick", M.stickGeo(), 120],
  ["stones", M.stonesGeo(), 120],
  ["cloud", M.cloudGeo(), 1200],
  ["campfire", M.campfireGeo(), 600],
  ["crate", M.crateGeo(), 100],
  ["battery", M.partGeo("battery"), 200],
  ["antenna", M.partGeo("antenna"), 300],
  ["circuit", M.partGeo("circuit"), 100],
])
  check(name, g, b);
for (const [name, rig] of [
  ["survivor", M.buildSurvivor(mats)],
  ["raptor", M.buildTheropod("raptor", mats)],
  ["trex", M.buildTheropod("trex", mats)],
  ["stego", M.buildStego(mats)],
]) {
  const r = rigTris(rig.root);
  // animate a few frames in every state to make sure nothing throws
  for (const state of ["idle", "roam", "alert", "chase", "attack", "recover", "flee", "dead"]) {
    const d = { state, speed: state === "chase" ? 8 : 2, t: 0.1, hurtT: 0.2, alive: state !== "dead" };
    for (let i = 0; i < 5; i++) name === "survivor" ? M.animateSurvivor(rig, { dt: 1 / 60, speed: 5, sprint: true, crouch: i % 2, onGround: true, swing: i / 5, tool: ["hands", "axe", "spear"][i % 3], dead: state === "dead", deadT: 1 }) : M.animateDino(rig, d, 1 / 60, i);
  }
  rig.root.updateMatrixWorld(true);
  let nanMat = false;
  rig.root.traverse((o) => o.matrixWorld.elements.forEach((v) => (nanMat ||= !Number.isFinite(v))));
  const bad = r.bad || nanMat || r.t > 6000;
  if (bad) fail++;
  console.log(`${bad ? "✗" : "✓"} ${name.padEnd(14)} ${String(Math.round(r.t)).padStart(6)} tris, ${r.calls} meshes`);
}
console.log(fail ? `\n${fail} FAILED` : "\nall models OK");
process.exit(fail ? 1 : 0);
