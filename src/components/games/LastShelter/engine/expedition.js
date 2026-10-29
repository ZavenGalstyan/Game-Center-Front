/**
 * Last Shelter — expeditions. One family member leaves with up to two pieces
 * of gear (three with the backpack), is away for a few days (eating what they
 * find, not the shelter's stock) and comes back with loot, wounds, sickness,
 * news — or doesn't come back. Outcomes are rolled on return from the
 * traveller's state, the destination and the gear, so preparation matters.
 */
import { roll, chance, randInt, clamp } from "./rng.js";
import { BY_ID } from "../data/family.js";
import { DEST_BY_ID, GEAR } from "../data/expeditions.js";
import { TOOL_NAMES, RES_NAMES } from "../data/items.js";

const nm = (id) => BY_ID[id]?.name || id;

export function maxGear(S) {
  return S.items.backpack ? 3 : 2;
}
export function destState(S, dest, who) {
  if (dest.need && !S.items[dest.need]) return `Needs ${TOOL_NAMES[dest.need]}`;
  if (dest.needFlag && !S.flags[dest.needFlag]) return "Undiscovered";
  if (who === "pip" && dest.noKids) return "Too far for Pip";
  return true;
}
export function canSend(S, who) {
  const m = S.fam[who];
  if (!m || !m.alive || m.away) return "Unavailable";
  if (S.exp) return "Someone is already out";
  if (m.hp < 25) return "Too weak to go";
  if (Object.values(S.fam).filter((x) => x.alive && !x.away).length < 1) return "Unavailable";
  return true;
}
export function tripDays(S, dest, who, gear) {
  const shortcut = S.flags.pipMap && (dest.id === "store" || dest.id === "elm") ? 1 : 0;
  return Math.max(1, dest.days + (BY_ID[who].exp.speed || 0) + (gear.includes("map") ? -1 : 0) - shortcut);
}

/** Danger estimate shown in the UI (and used for the roll). */
export function riskOf(S, dest, who, gear) {
  const m = S.fam[who];
  const c = BY_ID[who];
  let r = dest.risk * c.exp.risk;
  r += m.fatigue / 260 + (100 - m.hp) / 240 + m.sick * 0.09 + m.injured * 0.11;
  if (m.morale < 25) r += 0.07;
  if (m.hunger > 60 || m.thirst > 60) r += 0.06;
  for (const g of gear) r -= GEAR[g]?.risk || 0;
  if (S.flags.riskIntel) r -= 0.04;
  if (S.flags.rifle) r -= 0.04;
  if (S.flags.firstAid) r -= 0.02;
  if (gear.includes("gasmask") && dest.fallout > 0.3) r -= 0.04;
  return clamp(r, 0.03, 0.95);
}
export const riskLabel = (r) => (r < 0.18 ? "Low" : r < 0.32 ? "Moderate" : r < 0.48 ? "High" : "Deadly");

export function startExpedition(S, who, destId, gear = []) {
  const dest = DEST_BY_ID[destId];
  if (!dest || canSend(S, who) !== true || destState(S, dest, who) !== true) return false;
  gear = [...new Set(gear)].filter((g) => GEAR[g] && S.items[g]).slice(0, maxGear(S));
  const days = tripDays(S, dest, who, gear);
  for (const g of gear) S.items[g] = 0; // the gear leaves with them
  let lit = false;
  if (gear.includes("flashlight") && S.res.batteries > 0) {
    S.res.batteries--;
    lit = true;
  }
  const m = S.fam[who];
  m.away = true;
  // nobody plans rations for someone who isn't here
  for (const k of ["food", "water", "meds"]) delete S.plan[k][who];
  S.exp = { who, dest: destId, gear, days, left: days, lit, start: S.day, risk: riskOf(S, dest, who, gear) };
  S.stats.expeditions++;
  return true;
}

/** Called once per End Day while someone is out. Returns report lines. */
export function advanceExpedition(S) {
  const E = S.exp;
  const m = S.fam[E.who];
  const c = BY_ID[E.who];
  const lines = [];
  // they forage on the road: hunger and thirst rise at half speed
  m.hunger = clamp(m.hunger + c.hungerRate * 0.5, 0, 100);
  m.thirst = clamp(m.thirst + c.thirstRate * 0.5, 0, 100);
  m.fatigue = clamp(m.fatigue + 9, 0, 100);
  E.left--;
  if (E.left > 0) return lines;
  const dest = DEST_BY_ID[E.dest];
  const risk = E.risk;
  const r = roll(S);
  const gear = E.gear.slice();
  const name = nm(E.who);
  S.exp = null;
  m.away = false;
  // the worst case
  if (r < risk * risk * 0.5) {
    // (killMember lives in shelter.js; marked directly here to avoid an import cycle)
    m.alive = false;
    m.hp = 0;
    m.cause = `lost on the way to ${dest.name}`;
    m.diedDay = S.day;
    m.diedAway = true;
    S.stats.deaths++;
    for (const id of Object.keys(S.fam)) {
      const o = S.fam[id];
      if (o.alive && !o.away) o.morale = clamp(o.morale - 26 * BY_ID[id].moraleSwing, 0, 100);
    }
    lines.push(`${name} never came back from ${dest.name}.`);
    if (gear.length) lines.push(`The ${gear.map((g) => TOOL_NAMES[g]).join(" and ")} went with ${BY_ID[E.who].pron.o}.`);
    S.lastExp = { who: E.who, dest: E.dest, outcome: "lost", loot: {}, lines: lines.slice() };
    return lines;
  }
  const hurt = r < risk * 0.62;
  const out = { food: 0, water: 0, meds: 0, batteries: 0 };
  let mult = c.exp.loot * (gear.includes("backpack") ? 1.5 : 1) * (hurt ? 0.5 : 1);
  for (const [k, [a, b]] of Object.entries(dest.loot)) out[k] += Math.round(randInt(S, a, b) * mult);
  if (E.bonus) {
    out.food += 2;
    out.water += 2;
  }
  if (gear.includes("toolkit") && dest.toolkitBonus) for (const [k, v] of Object.entries(dest.toolkitBonus)) out[k] += v;
  if (gear.includes("flashlight") && dest.flashlightBonus) for (const [k, v] of Object.entries(dest.flashlightBonus)) out[k] += v;
  // scarcity: the longer the world is quiet, the emptier it gets
  if (S.day > 25) for (const k of Object.keys(out)) if (out[k] > 1 && chance(S, 0.3)) out[k]--;
  const found = [];
  for (const [k, n] of Object.entries(out)) {
    if (n > 0) {
      S.res[k] += n;
      found.push(`${n} ${RES_NAMES[k]}`);
    }
  }
  // tools found
  for (const [k, p] of Object.entries(dest.tools || {})) {
    if (!S.items[k] && !gear.includes(k) && chance(S, p)) {
      S.items[k] = 1;
      if (k === "radio") S.radio = 60;
      found.push(TOOL_NAMES[k]);
    }
  }
  // gear comes home, unless it was lost
  const lostGear = [];
  for (const g of gear) {
    if (hurt && chance(S, 0.35)) lostGear.push(g);
    else S.items[g] = 1;
  }
  m.fatigue = clamp(m.fatigue + 22, 0, 100);
  if (hurt) {
    m.injured = Math.min(2, m.injured + 1);
    m.hp = clamp(m.hp - randInt(S, 12, 25), 1, 100);
    lines.push(`${name} limped home from ${dest.name}, hurt.`);
  } else lines.push(`${name} made it back from ${dest.name}.`);
  if (dest.fallout && chance(S, dest.fallout * (gear.includes("gasmask") ? 0.2 : 1) * (1 - c.sickResist))) {
    m.sick = Math.min(3, m.sick + (dest.fallout > 0.4 ? 2 : 1));
    lines.push(`${name} breathed something bad out there and is running a fever.`);
  }
  lines.push(found.length ? `Brought back: ${found.join(", ")}.` : "Came back empty-handed.");
  if (lostGear.length) lines.push(`Lost on the way: ${lostGear.map((g) => TOOL_NAMES[g]).join(", ")}.`);
  // special destinations move the stories forward
  if (dest.special === "mast" && !S.flags.cedarFreq) {
    S.flags.cedarFreq = true;
    lines.push(`Scratched into the relay hut door: a frequency, and the words “CEDAR HOLLOW — SAFE — ASK FOR WREN”.`);
    if (S.items.radio && S.radio < 60) {
      S.radio = 60;
      lines.push("Spare valves from the hut brought the radio back up to strength.");
    }
  }
  if (dest.special === "tunnels") {
    S.flags.tunnelTrips = (S.flags.tunnelTrips | 0) + 1;
    if (S.flags.tunnelTrips === 1) lines.push(`${name} followed the tunnel for hours. It keeps going down — and somewhere far below, a train horn echoed once.`);
    if (S.flags.tunnelTrips >= 2 && !S.flags.deepSeen) {
      S.flags.deepSeen = true;
      S.queue.push({ id: "deep_line", day: S.day + 1, who: E.who });
      lines.push(`${name} found tiled walls far below — a station nobody ever opened — and lights still burning.`);
    }
  }
  m.morale = clamp(m.morale + (hurt ? -6 : 8), 0, 100);
  for (const id of Object.keys(S.fam)) if (id !== E.who && S.fam[id].alive && !S.fam[id].away) S.fam[id].morale = clamp(S.fam[id].morale + 6, 0, 100);
  S.lastExp = { who: E.who, dest: E.dest, outcome: hurt ? "hurt" : "ok", loot: out, lines: lines.slice() };
  return lines;
}
