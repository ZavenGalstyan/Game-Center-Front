/**
 * Last Shelter — the things you can grab in 60 seconds, and what each one
 * becomes in the shelter.
 *
 *  slots  carry space it takes (capacity is 4, 6 with the backpack on)
 *  gives  resources added to the shelter when it goes down the hatch
 *  tool   a one-off piece of equipment (flags in shelter.items)
 */
export const ITEMS = {
  water: { name: "Water Bottle", slots: 1, gives: { water: 1 }, color: "#5cb8e6", hint: "1 day of water for one person" },
  food: { name: "Food Can", slots: 1, gives: { food: 1 }, color: "#d9963a", hint: "1 meal for one person" },
  medkit: { name: "First Aid Kit", slots: 1, gives: { meds: 2 }, color: "#e04b4b", hint: "2 doses of medicine" },
  flashlight: { name: "Flashlight", slots: 1, tool: true, color: "#f2c94c", hint: "Safer expeditions; signalling" },
  radio: { name: "Radio", slots: 2, tool: true, color: "#8a6d4b", hint: "Hear broadcasts. Needs batteries." },
  toolkit: { name: "Tool Kit", slots: 2, tool: true, color: "#c0392b", hint: "Repairs, building, prying doors" },
  map: { name: "Map", slots: 1, tool: true, color: "#e2cf9a", hint: "Unlocks far destinations; shorter trips" },
  gasmask: { name: "Gas Mask", slots: 1, tool: true, color: "#4d5a4a", hint: "Protects expeditions from fallout" },
  batteries: { name: "Batteries", slots: 1, gives: { batteries: 3 }, color: "#3fa05a", hint: "3 charges for radio & flashlight" },
  books: { name: "Books", slots: 1, tool: true, color: "#6b4fa0", hint: "Keeps morale up underground" },
  backpack: { name: "Backpack", slots: 0, wear: true, tool: true, color: "#7a8f3a", hint: "Wear it: +2 carry space. Bigger expedition hauls." },
};
export const TOOL_KEYS = ["flashlight", "radio", "toolkit", "map", "gasmask", "books", "backpack"];
export const RES_KEYS = ["food", "water", "meds", "batteries"];
export const RES_NAMES = { food: "Food", water: "Water", meds: "Medicine", batteries: "Batteries" };
export const TOOL_NAMES = { flashlight: "Flashlight", radio: "Radio", toolkit: "Tool Kit", map: "Map", gasmask: "Gas Mask", books: "Books", backpack: "Backpack" };
