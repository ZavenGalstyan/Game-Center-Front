/**
 * Last Shelter — endings. checkEnding() runs after every event choice and
 * every End Day; the first matching rule wins. Each ending reads the actual
 * run (who lived, what you did) to write its epilogue.
 */
import { BY_ID } from "../data/family.js";

const nm = (id) => BY_ID[id]?.name || id;
const living = (S) => Object.values(S.fam).filter((m) => m.alive);
const list = (ids) => (ids.length <= 1 ? ids.map(nm).join("") : `${ids.slice(0, -1).map(nm).join(", ")} and ${nm(ids[ids.length - 1])}`);

export const ENDINGS = {
  rescued: {
    title: "Lights on the Ridge",
    kind: "good",
    art: "rescue",
    blurb: "Rescued by the Ridgeline Relief Corps.",
    hint: "Keep a radio alive, listen, and answer when they ask for a signal.",
  },
  selfsufficient: {
    title: "The Quiet Garden",
    kind: "good",
    art: "garden",
    blurb: "You made the shelter a home that feeds itself.",
    hint: "Grow food and catch water, then hold on to day 40.",
  },
  settlement: {
    title: "Cedar Hollow",
    kind: "good",
    art: "settlement",
    blurb: "You found other survivors and walked out to join them.",
    hint: "The radio mast on the ridge holds a frequency. You'll need the map.",
  },
  discovery: {
    title: "The Deep Line",
    kind: "strange",
    art: "deep",
    blurb: "Something far below the shelter was waiting to be found.",
    hint: "Listen to the walls. Dig when they knock.",
  },
  caravan: {
    title: "The Road North",
    kind: "bittersweet",
    art: "caravan",
    blurb: "You left the shelter behind with a band of travellers.",
    hint: "Be kind to strangers who trade fairly.",
  },
  failed_evac: {
    title: "The Sirens Stopped",
    kind: "bad",
    art: "failed",
    blurb: "The hatch closed without you.",
    hint: "Be standing on the hatch when the timer hits zero.",
  },
  collapse: {
    title: "Under the Weight",
    kind: "bad",
    art: "collapse",
    blurb: "The shelter gave way.",
    hint: "Keep the shelter above zero. A tool kit makes repairs possible.",
  },
  exhaustion: {
    title: "Empty Shelves",
    kind: "bad",
    art: "empty",
    blurb: "Nobody was left to open the hatch.",
    hint: "Ration food and water; treat sickness before it spreads.",
  },
  lost_expedition: {
    title: "Footprints in the Ash",
    kind: "bad",
    art: "lost",
    blurb: "The last of the family walked out and never returned.",
    hint: "Never send someone weak, tired or unequipped to a deadly place.",
  },
};
export const ENDING_IDS = Object.keys(ENDINGS);

/** Returns { id, day } when the run is over, else null. */
export function checkEnding(S) {
  const alive = living(S);
  if (S.pendingEnding) {
    const id = S.pendingEnding;
    S.pendingEnding = null;
    if (alive.length) return { id, day: S.day };
  }
  if (!alive.length) {
    const last = Object.values(S.fam).sort((a, b) => b.diedDay - a.diedDay)[0];
    return { id: last && last.diedAway ? "lost_expedition" : "exhaustion", day: S.day };
  }
  if (S.shelter <= 0) return { id: "collapse", day: S.day };
  if (S.flags.rescueDay && S.day >= S.flags.rescueDay) return { id: "rescued", day: S.day };
  if (S.flags.cedarDay && S.day >= S.flags.cedarDay) return { id: "settlement", day: S.day };
  if (S.flags.garden && S.flags.collector && S.day >= 40) return { id: "selfsufficient", day: S.day };
  return null;
}

/** Epilogue paragraphs for the ending screen, written from the run. */
export function epilogue(S, id) {
  const alive = Object.values(S.fam).filter((m) => m.alive).map((m) => m.id);
  const away = S.exp ? S.exp.who : null;
  const dead = Object.values(S.fam).filter((m) => !m.alive).map((m) => m.id);
  const lost = S.lostInHouse || [];
  const day = S.day;
  const p = [];
  const all4 = alive.length === 4;
  switch (id) {
    case "rescued":
      p.push(`On day ${day}, engines growled overhead and a white beam swept the yard until it found the hatch. The Ridgeline Relief Corps pulled ${list(alive)} up into the cold, bright air.`);
      p.push(all4 ? "Every one of you. The medic counted twice to be sure." : "The medic asked how many there had been. Nobody answered right away.");
      break;
    case "selfsufficient":
      p.push(`By day ${day} the mushroom beds were thick and the rain barrel never ran dry. The shelter stopped being a place to wait and became a place to live.`);
      p.push(`${list(alive)} painted a window on the concrete wall — a garden, a sky. Some days it is almost real.`);
      break;
    case "settlement":
      p.push(`Wren from Cedar Hollow met you at the edge of the woods with a handcart and a rifle she never had to raise. ${list(alive)} walked the last mile together.`);
      p.push("There are forty-one people in the Hollow, a schoolroom, and a greenhouse made of old car windshields. They had been waiting for someone to answer.");
      break;
    case "discovery":
      p.push(`Beneath the shelter, past the tunnel ${list(alive)} dug by hand, lay a station that never opened: tiled walls, a sleeping train, and a sealed vault of seed, water and light.`);
      p.push("You were not the first to find it. The notes on the walls say you are welcome. The family went down, and stayed.");
      break;
    case "caravan":
      p.push(`The travellers' carts left at dawn on day ${day}, and ${list(alive)} walked beside them, the shelter hatch shrinking behind you.`);
      p.push("Nobody knows what's north. But the stars are out again, and nobody is counting cans.");
      break;
    case "failed_evac":
      p.push("The siren wound down into silence. The hatch was right there — a few steps too far.");
      p.push("Sometimes sixty seconds is not enough. Next time, keep one eye on the clock.");
      break;
    case "collapse":
      p.push(`On day ${day} the long crack above the shelves finally gave. Concrete and earth came down in a roar.`);
      p.push(alive.length ? `${list(alive)} dug out through the hatch, bruised and coughing, into a world with no shelter left in it.` : "");
      break;
    case "exhaustion":
      p.push(`The last entry in the journal is dated day ${day}. The handwriting gets smaller towards the end.`);
      break;
    case "lost_expedition":
      p.push(`The shelter waited with its light on. Whoever went out last never made it back; the footprints led toward the ridge and stopped.`);
      break;
  }
  if (dead.length) p.push(`Remembered: ${list(dead)}.`);
  if (lost.length) p.push(`${list(lost)} never made it to the hatch.`);
  if (away && alive.includes(away) && id !== "failed_evac") p.push(`${nm(away)} was still out on an expedition — the family left a note on the hatch.`);
  return p.filter(Boolean);
}
