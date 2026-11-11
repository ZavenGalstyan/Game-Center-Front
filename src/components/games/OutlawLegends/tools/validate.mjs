/**
 * Structural checks for all 20 missions:
 *   node src/components/games/OutlawLegends/tools/validate.mjs
 * - every mission builds and a sim starts
 * - player start, NPCs, enemies, mission objects aren't inside solid boxes
 * - every objective point / enemy spawn is reachable on the nav grid from the start
 * - step references (groups, objects, npcs) exist
 */
import { MISSIONS, buildMission } from "../engine/missions.js";
import { buildGrid, reachable, cellOf, nearestFree } from "../engine/geom.js";
import { createSim } from "../engine/sim.js";
import { playerStats } from "../engine/data.js";

const stats = playerStats({ xp: 0, weapons: ["revolver", "shotgun", "rifle", "dual"], upgrades: {}, abilities: {} });
let fails = 0;
const fail = (m, msg) => {
  fails++;
  console.log(`  ✗ M${m.id}: ${msg}`);
};

function insideSolid(L, x, z, r = 0.3) {
  return L.obs.find((b) => !b.nocol && b.h > 0.3 && !b.y0 && Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r);
}

for (const m of MISSIONS) {
  const L = buildMission(m);
  // gates get blown open during the mission
  const G = buildGrid(L.bounds, L.obs.filter((b) => !b.gate));
  const [sx, sz] = m.start;
  const seen = reachable(G, sx, sz);
  const reach = (x, z, what) => {
    const c = nearestFree(G, ...cellOf(G, x, z), 2);
    if (!c || !seen[c[1] * G.W + c[0]]) fail(m, `${what} at (${x}, ${z}) unreachable`);
  };
  const b0 = insideSolid(L, sx, sz, 0.4);
  if (b0) fail(m, `start inside ${b0.kind}`);
  for (const n of m.npcs || []) {
    const b = insideSolid(L, n.x, n.z);
    if (b) fail(m, `npc ${n.id} inside ${b.kind}`);
    reach(n.x, n.z, `npc ${n.id}`);
  }
  for (const o of m.objects || []) {
    if (o.kind === "bottle" || o.kind === "jail" || o.kind === "coach" || o.kind === "poster") continue;
    const b = insideSolid(L, o.x, o.z, 0.1);
    if (b && o.kind !== "weapon") fail(m, `object ${o.id} inside ${b.kind}`);
    reach(o.x, o.z, `object ${o.id}`);
  }
  for (const [gname, list] of Object.entries(m.groups || {})) {
    for (const [type, x, z, opt] of list) {
      const b = insideSolid(L, x, z, type === "rider" ? 0.8 : 0.35);
      if (b) fail(m, `${gname} ${type} at (${x}, ${z}) inside ${b.kind} ${b.id}`);
      if (!opt?.hold) reach(x, z, `${gname} ${type}`);
      const [x0, z0, x1, z1] = L.bounds;
      if (x < x0 || x > x1 || z < z0 || z > z1) fail(m, `${gname} ${type} out of bounds`);
    }
  }
  for (const st of m.steps) {
    if (st.type === "kill") for (const gname of st.groups) if (!m.groups[gname]?.length) fail(m, `step '${st.text}' group ${gname} missing`);
    if (["interact", "targets", "collect"].includes(st.type)) for (const id of st.ids) if (!m.objects.find((o) => o.id === id)) fail(m, `object ${id} missing`);
    if (st.type === "talk" && !m.npcs.find((n) => n.id === st.npc)) fail(m, `npc ${st.npc} missing`);
    if (st.type === "reach" || st.type === "duel") reach(st.at[0], st.at[1], `step '${st.text}'`);
    if (st.type === "duel") reach(st.foeAt[0], st.foeAt[1], `duel foe`);
    if (st.type === "survive" || st.type === "defend") for (const [, gname] of st.waves) if (!m.groups[gname]) fail(m, `wave ${gname} missing`);
    if (st.type === "defend" && !m.objects.find((o) => o.id === st.obj)) fail(m, `defend object missing`);
  }
  // poster: reachable spot in front of it
  for (const o of m.objects || []) if (o.kind === "poster") reach(o.x - 0.9, o.z, `poster ${o.id}`);
  let S;
  try {
    S = createSim(m.id, { stats, difficulty: "normal" });
  } catch (err) {
    fail(m, `createSim threw ${err.stack}`);
  }
  const enemies = Object.values(m.groups).reduce((a, l) => a + l.length, 0);
  console.log(`M${String(m.id).padStart(2)} ${m.name.padEnd(26)} obs ${String(L.obs.length).padStart(3)} · grid ${G.W}×${G.H} · ${m.steps.length} steps · ${enemies} enemies${S ? "" : " · SIM FAILED"}`);
}
console.log(fails ? `\n${fails} problem(s)` : "\nall missions valid");
process.exit(fails ? 1 : 0);
