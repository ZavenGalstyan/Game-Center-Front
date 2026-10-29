/**
 * Last Shelter — every event, by id. Categories (cat) also pick the card art.
 */
import outside from "./outside.js";
import inside from "./inside.js";
import people from "./people.js";
import stories from "./stories.js";

export const EVENTS = [...outside, ...inside, ...people, ...stories];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
export const CATEGORIES = {
  noises: "Strange Noises",
  visitor: "Visitors",
  equipment: "Equipment",
  radio: "Radio",
  spoilage: "Supplies",
  illness: "Illness",
  leak: "Water & Leaks",
  discovery: "Discovery",
  dilemma: "Dilemma",
  family: "Family",
  mystery: "Underground",
  rescue: "Rescue",
  expedition: "Expedition",
  hazard: "Hazard",
};
