/** Metro Rush — small seeded RNG (mulberry32) whose state is a plain number,
 *  so a run can be cloned for bots and tests. */
export function rngNext(st) {
  st.s = (st.s + 0x6d2b79f5) | 0;
  let t = st.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rngInt = (st, n) => Math.floor(rngNext(st) * n);
export const rngPick = (st, arr) => arr[rngInt(st, arr.length)];
export function rngWeighted(st, entries) {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  let r = rngNext(st) * total;
  for (const [k, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
