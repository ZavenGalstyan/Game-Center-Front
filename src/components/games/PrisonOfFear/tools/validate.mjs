/**
 * Static checks for every level: map shape, markers vs steps, door placement,
 * and that each objective is reachable once the earlier steps' gates open.
 *   node src/components/games/PrisonOfFear/tools/validate.mjs
 */
import { LEVELS } from "../engine/levels.js";
import { parseLevel } from "../engine/sim.js";

let fails = 0;
const bad = (L, msg) => {
  fails++;
  console.log(`L${L.id} ${L.name}: ${msg}`);
};
for (const L of LEVELS) {
  const G = parseLevel(L);
  const widths = new Set(L.map.map((r) => r.length));
  if (widths.size > 1) bad(L, `ragged rows ${[...widths]}`);
  if (!G.start) bad(L, "no P");
  const reachSteps = L.steps.filter((s) => s.t === "reach").length;
  if (reachSteps !== G.reach.length) bad(L, `reach steps ${reachSteps} vs R markers ${G.reach.length}`);
  if ((L.scares || []).length !== G.triggers.length) bad(L, `scares ${(L.scares || []).length} vs T ${G.triggers.length}`);
  if (L.steps.at(-1).t !== "exit") bad(L, "last step must be exit");
  if (!G.doors.some((d) => d.kind === "exit")) bad(L, "no X");
  const solid = (k) => k === "#" || k === " ";
  for (const d of G.doors) {
    const ew = solid(G.at(d.c - 1, d.r)) || "=1234DX".includes(G.at(d.c - 1, d.r));
    const ns = solid(G.at(d.c, d.r - 1)) || "=1234DX".includes(G.at(d.c, d.r - 1));
    const ew2 = ew && (solid(G.at(d.c + 1, d.r)) || "=1234DX".includes(G.at(d.c + 1, d.r)));
    const ns2 = ns && (solid(G.at(d.c, d.r + 1)) || "=1234DX".includes(G.at(d.c, d.r + 1)));
    if (!ew2 && !ns2) bad(L, `door ${d.kind} at c${d.c} r${d.r} not between walls`);
  }
  for (const s of G.switches) {
    const k = G.at(Math.floor((s.x - s.nx * 0.5) / 2), Math.floor((s.z - s.nz * 0.5) / 2));
    if (k !== "#") bad(L, `switch c${s.c} r${s.r} not on a wall`);
  }
  // progressive reachability
  const open = new Set();
  const reach = () => {
    const seen = new Set();
    const q = [[G.start.c, G.start.r]];
    seen.add(G.start.r * G.w + G.start.c);
    while (q.length) {
      const [c, r] = q.pop();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        const k = G.at(nc, nr);
        const j = nr * G.w + nc;
        if (seen.has(j)) continue;
        const ok = G.floorish(k) || k === "D" || (/[1-4]/.test(k) && open.has(k));
        if (!ok) continue;
        seen.add(j);
        q.push([nc, nr]);
      }
    }
    return seen;
  };
  const near = (seen, c, r) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => seen.has((r + dr) * G.w + c + dc));
  let ri = 0;
  for (const [i, st] of L.steps.entries()) {
    const seen = reach();
    const tag = `step ${i + 1} (${st.t})`;
    if (st.t === "reach") {
      const m = G.reach[ri++];
      if (m && !seen.has(Math.floor(m.z / 2) * G.w + Math.floor(m.x / 2))) bad(L, `${tag} marker unreachable`);
    } else if (st.t === "item") {
      if (!G.items.some((it) => it.kind === st.item && seen.has(it.r * G.w + it.c))) bad(L, `${tag} item ${st.item} unreachable`);
    } else if (st.t === "collect") {
      const n = G.items.filter((it) => it.kind === st.item && seen.has(it.r * G.w + it.c)).length;
      if (n < st.count) bad(L, `${tag} only ${n}/${st.count} ${st.item} reachable`);
    } else if (st.t === "switch") {
      const n = G.switches.filter((s) => seen.has(s.r * G.w + s.c)).length;
      if (n < st.count) bad(L, `${tag} only ${n}/${st.count} switches reachable`);
    } else if (st.t === "wave") {
      const n = G.spawns.filter((s) => seen.has(s.r * G.w + s.c)).length;
      if (n < 2) bad(L, `${tag} only ${n} spawn points reachable`);
    } else if (st.t === "boss") {
      if (!G.enemies.some((e) => e.type === "brute" && seen.has(e.r * G.w + e.c))) bad(L, `${tag} brute unreachable`);
    } else if (st.t === "kill") {
      const n = G.enemies.filter((e) => seen.has(e.r * G.w + e.c)).length;
      if (!n) console.log(`  note L${L.id} ${tag}: no pre-placed enemies reachable`);
    } else if (st.t === "exit") {
      const x = G.doors.find((d) => d.kind === "exit");
      if (x && !near(seen, x.c, x.r)) bad(L, `${tag} exit not adjacent to reachable floor`);
    }
    for (const g of st.open || []) open.add(g);
  }
  const all = reach();
  const stuck = G.enemies.filter((e) => !all.has(e.r * G.w + e.c));
  if (stuck.length) console.log(`  note L${L.id}: ${stuck.length} enemies never reachable (${stuck.map((e) => `c${e.c}r${e.r}`).join(" ")})`);
  const items = G.items.filter((e) => !all.has(e.r * G.w + e.c));
  if (items.length) console.log(`  note L${L.id}: unreachable items ${items.map((e) => `${e.kind}@c${e.c}r${e.r}`).join(" ")}`);
  console.log(`L${L.id} ${L.name}: ${G.w}x${G.h}, enemies ${G.enemies.length}, items ${G.items.length}, lights ${G.lights.length}, doors ${G.doors.length}`);
}
console.log(fails ? `${fails} problem(s)` : "all levels valid");
process.exit(fails ? 1 : 0);
