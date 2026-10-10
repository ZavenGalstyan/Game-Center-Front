// find rooftop chase chains: roofs facing each other across a street/alley at similar heights
import { cityFor } from "../engine/world.js";
import { segmentClear } from "./pathCheck.mjs";
const C = cityFor(process.argv[2]);
const minLen = Number(process.argv[3] || 4);
const tops = C.roofs.filter((r) => !r.lighthouse && !C.roofs.some((o) => o !== r && Math.abs(o.y0 - r.y1) < 0.01 && o.x0 >= r.x0 - 0.01 && o.x1 <= r.x1 + 0.01 && o.z0 >= r.z0 - 0.01 && o.z1 <= r.z1 + 0.01) && r.x1 - r.x0 > 8 && r.z1 - r.z0 > 8);
const edges = new Map(tops.map((r) => [r, []]));
for (const a of tops) for (const b of tops) {
  const drop = a.y1 - b.y1;
  if (a === b || drop < -6 || drop > Number(process.argv[4] || 6)) continue;
  const gx = Math.max(b.x0 - a.x1, a.x0 - b.x1);
  const gz = Math.max(b.z0 - a.z1, a.z0 - b.z1);
  let ok = false, pa, pb;
  if (gx >= 3 && gx <= 20 && gz < -4) { const z = (Math.max(a.z0, b.z0) + Math.min(a.z1, b.z1)) / 2; const ax = b.x0 > a.x1 ? a.x1 - 1.6 : a.x0 + 1.6; const bx = b.x0 > a.x1 ? b.x0 + 1.6 : b.x1 - 1.6; pa = { x: ax, y: a.y1, z }; pb = { x: bx, y: b.y1, z }; ok = true; }
  if (gz >= 3 && gz <= 20 && gx < -4) { const x = (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2; const az = b.z0 > a.z1 ? a.z1 - 1.6 : a.z0 + 1.6; const bz = b.z0 > a.z1 ? b.z0 + 1.6 : b.z1 - 1.6; pa = { x, y: a.y1, z: az }; pb = { x, y: b.y1, z: bz }; ok = true; }
  if (!ok) continue;
  const clear = segmentClear(C.geo, pa, { ...pb, hop: true });
  if (clear) edges.get(a).push({ b, pa, pb });
}
const chains = [];
const dfs = (path, legs) => {
  if (path.length >= minLen) chains.push({ path: [...path], legs: [...legs] });
  if (path.length >= 6) return;
  for (const e of edges.get(path[path.length - 1])) {
    if (path.includes(e.b)) continue;
    const prev = legs[legs.length - 1];
    if (prev && !segmentClear(C.geo, prev.pb, e.pa)) continue;
    dfs([...path, e.b], [...legs, e]);
  }
};
for (const r of tops) dfs([r], []);
const blk = (r) => { const b = C.blocks.find((q) => (r.x0 + r.x1) / 2 > q.x0 - 1 && (r.x0 + r.x1) / 2 < q.x1 + 1 && (r.z0 + r.z1) / 2 > q.z0 - 1 && (r.z0 + r.z1) / 2 < q.z1 + 1); return b ? `${b.i},${b.j}` : "?"; };
chains.sort((p, q) => q.path.length - p.path.length);
const seen = new Set();
for (const ch of chains) { const k = ch.path.map(blk).join(">"); if (seen.has(k)) continue; seen.add(k); console.log(ch.path.length, k, ch.path.map((r) => `#${r.id}@${r.y1.toFixed(0)}`).join(" ")); if (seen.size > 12) break; }
