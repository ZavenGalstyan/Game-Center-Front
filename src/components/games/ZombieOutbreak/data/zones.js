/** Zombie Outbreak — the five infected zones as shown on the Stage Select map. */
export const ZONES = [
  { id: "city", name: "Abandoned City", code: "ZONE A", first: 1, color: "#e0a03a", blurb: "Empty streets, wrecked cars and the first walkers." },
  { id: "warehouse", name: "Dark Warehouse", code: "ZONE B", first: 7, color: "#4ab0d8", blurb: "Container stacks, catwalks and fast runners." },
  { id: "hospital", name: "Ruined Hospital", code: "ZONE C", first: 13, color: "#7ad86a", blurb: "Dark wards, emergency lights — and new mutations." },
  { id: "lab", name: "Underground Lab", code: "ZONE D", first: 19, color: "#b06aff", blurb: "Glass corridors, toxic tanks, where it all began." },
  { id: "military", name: "Military Base", code: "ZONE E", first: 25, color: "#ff5a3a", blurb: "Floodlights, hangars and a storm. The last stand." },
];

export function zoneOf(stageId) {
  return ZONES[Math.min(4, Math.floor((stageId - 1) / 6))];
}
