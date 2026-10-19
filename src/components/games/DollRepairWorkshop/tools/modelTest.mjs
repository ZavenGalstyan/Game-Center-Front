/**
 * Headless check: every doll type, every order, builds without errors or NaNs.
 *   node src/components/games/DollRepairWorkshop/tools/modelTest.mjs
 */
import { buildDoll } from "../render/dollModel.js";
import { ORDERS } from "../data/orders.js";
import { DOLL_TYPES, DEFAULT_LOOKS } from "../data/dolls.js";

let fail = 0;
const nanCheck = (model, label) => {
  let verts = 0, bad = 0;
  model.root.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position.array;
    verts += p.length / 3;
    for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) { bad++; break; }
  });
  if (bad) { fail++; console.log("  ✗ NaN geometry in", label, bad); }
  return verts;
};
const t0 = Date.now();
for (const type of Object.keys(DOLL_TYPES)) {
  try {
    const m = buildDoll({ type, look: DEFAULT_LOOKS[type], damage: [], seed: 3 });
    const v = nanCheck(m, type);
    console.log(type.padEnd(10), "verts", v, "grime meshes", m.grime.length, "pick", m.pickables.length, "locks", m.hair?.locks.length ?? 0, "buttons", m.buttons.length);
  } catch (e) { fail++; console.log("  ✗", type, e.stack); }
}
for (const o of ORDERS) {
  try {
    const m = buildDoll({ type: o.type, look: o.look, damage: o.damage, seed: o.id * 101 });
    nanCheck(m, o.title);
    let dust = 0, dirt = 0, stain = 0;
    for (const g of m.grime) for (let i = 0; i < g.n; i++) { dust += g.attr.array[i * 4]; dirt += g.attr.array[i * 4 + 1]; stain += g.attr.array[i * 4 + 2]; }
    const want = (k) => o.damage.some((d) => d.kind === k);
    const probs = [];
    if (want("dust") && dust < 5) probs.push("no dust");
    if (want("dirt") && dirt < 5) probs.push("no dirt");
    if (want("stain") && stain < 2) probs.push("no stain");
    const tears = o.damage.filter((d) => d.kind === "tear").length;
    if (m.tears.length !== tears) probs.push(`tears ${m.tears.length}/${tears}`);
    const cracks = o.damage.filter((d) => d.kind === "crack").length;
    if (m.cracks.length !== cracks) probs.push("cracks");
    for (const d of o.damage) {
      if (d.kind === "button" && !m.sockets[`button${d.slot}`]) probs.push(`button socket ${d.slot} missing`);
      if (d.kind === "accessory" && !m.sockets[`acc:${["hat","ribbon","extra"].find((s) => m.look[s] === d.item)}`]) probs.push(`acc ${d.item}`);
      if (d.kind === "shoe" && !m.sockets[`shoe${d.side}`]) probs.push("shoe socket");
      if (d.kind === "scratch" && m.scratches.length < 1) probs.push("scratch");
      if ((d.kind === "tangle" || d.kind === "bald") && !m.hair) probs.push("no hair for " + d.kind);
      if (d.kind === "faded" && !m.faded.length) probs.push("faded");
    }
    console.log(String(o.id).padStart(2), o.title.padEnd(28), `dust ${dust.toFixed(0)} dirt ${dirt.toFixed(0)} stain ${stain.toFixed(0)} scratches ${m.scratches.length}`, probs.length ? "  ✗ " + probs.join(", ") : "");
    if (probs.length) fail++;
  } catch (e) { fail++; console.log("  ✗", o.title, e.stack); }
}
console.log(fail ? `FAIL ${fail}` : "OK", (Date.now() - t0) + "ms");
process.exit(fail ? 1 : 0);
