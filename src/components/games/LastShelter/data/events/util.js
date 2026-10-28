/**
 * Last Shelter — helpers for writing events.
 *
 * An event: { id, cat, title, text, choices[], minDay?, maxDay?, once?,
 *   cooldown?, weight?, when?(S), pick?, needItem?, chainOnly? }
 * A choice: { label, req?(S, c) → true | "reason", run(S, c, r) → { text, fx } }
 *   r is a fresh 0..1 roll; fx is applied by engine/shelter.js applyFx.
 * Text may use {A}/{B} (names of c.who / c.who2), {a.s} {a.o} {a.p}
 * (he/him/his of who), {b.*} for who2 and {X} for whoever is out.
 */
import { TOOL_NAMES, RES_NAMES } from "../items.js";

export const out = (text, fx = {}) => ({ text, fx });
export const tool = (S, k) => (S.items[k] | 0) > 0;
export const presentIds = (S) => Object.keys(S.fam).filter((id) => S.fam[id].alive && !S.fam[id].away);
export const isHere = (S, id) => !!(S.fam[id] && S.fam[id].alive && !S.fam[id].away);
export const radioOn = (S) => tool(S, "radio") && S.radio > 0;

/** Requirement helpers → true or a reason string for the disabled button. */
export const needTool = (k) => (S) => tool(S, k) || `Needs ${TOOL_NAMES[k]}`;
export const needRes = (k, n = 1) => (S) => (S.res[k] | 0) >= n || `Needs ${n} ${RES_NAMES[k]}`;
export const needAll = (...fns) => (S, c) => {
  for (const f of fns) {
    const r = f(S, c);
    if (r !== true) return r;
  }
  return true;
};
export const needHere = (id, label) => (S) => isHere(S, id) || `${label || id} isn't here`;
export const needRadio = (S) => (!tool(S, "radio") ? "No radio" : S.radio <= 0 ? "Radio is broken" : true);

/** Morale or stat helpers. */
export const avg = (S, k) => {
  const ids = presentIds(S);
  return ids.length ? ids.reduce((a, id) => a + S.fam[id][k], 0) / ids.length : 0;
};
export const anySick = (S) => presentIds(S).some((id) => S.fam[id].sick > 0);
export const anyHurt = (S) => presentIds(S).some((id) => S.fam[id].injured > 0);
