/**
 * Rooftop Sniper — 60 data-driven missions across 6 locations (10 each),
 * run by ONE reusable mission engine (engine/missionEngine.js). Downtown is
 * hand-authored below with a deliberate teaching curve (moving targets,
 * then timing, then pop-ups, then switches, then decoys); Industrial
 * District through High Security Zone are produced by
 * data/missionGenerator.js from a per-location template rotation, so no
 * location plays as ten copies of the same mission.
 *
 * Target entry shape:
 *   { id, kind, position: [x,y,z], radius, label, movement?, unlocksAfter? }
 *   kind: "stationary" | "moving" | "popup" | "decoy" | "switch" | "drone"
 *   position is world-space, relative to the rooftop spawn at the origin.
 *   movement: { type: "patrol", to: [x,y,z], speed } — ping-pongs
 *             { type: "popup", interval, visibleFor, offset } — appears/hides
 *             { type: "hover", radius, speed } — drones, circles the base position
 *   unlocksAfter: id of a "switch" target that must be hit first.
 */
import { LOCATIONS, locationForMission } from "./locations.js";
import { generateLocationMissions } from "./missionGenerator.js";

export const TOTAL_MISSIONS = LOCATIONS.length * 10;

const STARS = { twoAccuracy: 0.7, threeAccuracy: 0.9 };

const DOWNTOWN_MISSIONS = [
  {
    id: 1,
    name: "FIRST SIGHT",
    objective: "Hit all 5 training targets",
    briefing:
      "Welcome to the range. Five electronic training targets are mounted on rooftops across the block. Aim, zoom, and squeeze the trigger — take your time, there's no clock.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: null,
    wind: null,
    bulletDrop: false,
    targets: [
      { id: "t1", kind: "stationary", position: [-14, 2.4, -72], radius: 0.55, label: "A" },
      { id: "t2", kind: "stationary", position: [6, 4.6, -92], radius: 0.5, label: "B" },
      { id: "t3", kind: "stationary", position: [-4, 7.2, -112], radius: 0.46, label: "C" },
      { id: "t4", kind: "stationary", position: [16, 3.1, -128], radius: 0.42, label: "D" },
      { id: "t5", kind: "stationary", position: [-20, 9.4, -146], radius: 0.4, label: "E" },
    ],
  },
  {
    id: 2,
    name: "ON THE MOVE",
    objective: "Hit all 3 moving targets",
    briefing: "That target rolls back and forth along the rooftop. Lead your shot — aim where it's going, not where it is.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: null,
    wind: null,
    bulletDrop: false,
    targets: [
      {
        id: "t1",
        kind: "moving",
        position: [-10, 3.4, -80],
        radius: 0.5,
        label: "A",
        movement: { type: "patrol", to: [10, 3.4, -80], speed: 0.4 },
      },
      {
        id: "t2",
        kind: "moving",
        position: [-14, 5.6, -104],
        radius: 0.48,
        label: "B",
        movement: { type: "patrol", to: [8, 5.6, -104], speed: 0.35 },
      },
      {
        id: "t3",
        kind: "moving",
        position: [-6, 8.2, -128],
        radius: 0.46,
        label: "C",
        movement: { type: "patrol", to: [14, 8.2, -128], speed: 0.42 },
      },
    ],
  },
  {
    id: 3,
    name: "AGAINST THE CLOCK",
    objective: "Hit all 4 targets before time runs out",
    briefing: "Same drill, new pressure: a 40-second clock. Don't rush your first shot, but don't waste time either.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: 40,
    wind: null,
    bulletDrop: false,
    targets: [
      { id: "t1", kind: "stationary", position: [-16, 3.2, -76], radius: 0.5, label: "A" },
      { id: "t2", kind: "stationary", position: [8, 5.4, -96], radius: 0.48, label: "B" },
      { id: "t3", kind: "stationary", position: [-8, 7.6, -116], radius: 0.44, label: "C" },
      { id: "t4", kind: "stationary", position: [18, 4.2, -134], radius: 0.42, label: "D" },
    ],
  },
  {
    id: 4,
    name: "MIXED TRAFFIC",
    objective: "Hit all 5 targets",
    briefing: "Two of these targets move, three don't. Track the movers first — the stationary ones will wait.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: null,
    wind: null,
    bulletDrop: false,
    targets: [
      { id: "t1", kind: "stationary", position: [-18, 2.8, -74], radius: 0.46, label: "A" },
      {
        id: "t2",
        kind: "moving",
        position: [-4, 4.8, -98],
        radius: 0.46,
        label: "B",
        movement: { type: "patrol", to: [12, 4.8, -98], speed: 0.4 },
      },
      { id: "t3", kind: "stationary", position: [2, 6.6, -116], radius: 0.42, label: "C" },
      {
        id: "t4",
        kind: "moving",
        position: [-16, 8.4, -134], radius: 0.42,
        label: "D",
        movement: { type: "patrol", to: [0, 8.4, -134], speed: 0.36 },
      },
      { id: "t5", kind: "stationary", position: [18, 9.6, -150], radius: 0.4, label: "E" },
    ],
  },
  {
    id: 5,
    name: "QUICK LOOK",
    objective: "Hit all 4 pop-up targets",
    briefing: "These targets only show for a moment before dropping back down. Keep your crosshair steady where you expect the next one.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: null,
    wind: null,
    bulletDrop: false,
    targets: [
      { id: "t1", kind: "popup", position: [-14, 3.6, -82], radius: 0.5, label: "A", movement: { type: "popup", interval: 3.2, visibleFor: 1.7, offset: 0 } },
      { id: "t2", kind: "popup", position: [6, 5.2, -100], radius: 0.48, label: "B", movement: { type: "popup", interval: 3.2, visibleFor: 1.7, offset: 0.8 } },
      { id: "t3", kind: "popup", position: [-2, 7.4, -120], radius: 0.46, label: "C", movement: { type: "popup", interval: 3.4, visibleFor: 1.6, offset: 1.6 } },
      { id: "t4", kind: "popup", position: [16, 4.4, -138], radius: 0.44, label: "D", movement: { type: "popup", interval: 3.4, visibleFor: 1.6, offset: 2.4 } },
    ],
  },
  {
    id: 6,
    name: "FINE PRINT",
    objective: "Hit all 4 small targets",
    briefing: "Smaller plates this time. Hold your breath (Shift) to steady the shot before you fire.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: null,
    wind: null,
    bulletDrop: false,
    targets: [
      { id: "t1", kind: "stationary", position: [-12, 3.4, -96], radius: 0.3, label: "A" },
      { id: "t2", kind: "stationary", position: [10, 5.8, -114], radius: 0.28, label: "B" },
      { id: "t3", kind: "stationary", position: [-4, 8, -132], radius: 0.27, label: "C" },
      { id: "t4", kind: "stationary", position: [16, 6.4, -148], radius: 0.26, label: "D" },
    ],
  },
  {
    id: 7,
    name: "LIMITED SUPPLY",
    objective: "Hit all 5 targets",
    briefing: "Only one spare magazine this run. Every shot counts.",
    magazine: 5,
    reserveMags: 1,
    timeLimit: null,
    wind: null,
    bulletDrop: false,
    targets: [
      { id: "t1", kind: "stationary", position: [-16, 3, -80], radius: 0.42, label: "A" },
      {
        id: "t2",
        kind: "moving",
        position: [4, 5.2, -100],
        radius: 0.42,
        label: "B",
        movement: { type: "patrol", to: [16, 5.2, -100], speed: 0.38 },
      },
      { id: "t3", kind: "popup", position: [-6, 7.4, -120], radius: 0.42, label: "C", movement: { type: "popup", interval: 3, visibleFor: 1.5, offset: 0 } },
      { id: "t4", kind: "stationary", position: [14, 4.6, -136], radius: 0.4, label: "D" },
      { id: "t5", kind: "stationary", position: [-18, 9, -150], radius: 0.4, label: "E" },
    ],
  },
  {
    id: 8,
    name: "OPEN THE GATE",
    objective: "Hit the switch to unlock the hidden target, then clear all targets",
    briefing: "That amber panel is a switch, not a target — hitting it activates the target behind it. The other two plates are live already.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: null,
    wind: null,
    bulletDrop: false,
    targets: [
      { id: "sw1", kind: "switch", position: [-10, 3.4, -78], radius: 0.6, label: "SW" },
      { id: "t1", kind: "stationary", position: [8, 6.2, -110], radius: 0.42, label: "A", unlocksAfter: "sw1" },
      { id: "t2", kind: "stationary", position: [-14, 4.6, -96], radius: 0.44, label: "B" },
      { id: "t3", kind: "stationary", position: [16, 8, -132], radius: 0.4, label: "C" },
    ],
  },
  {
    id: 9,
    name: "LOOK TWICE",
    objective: "Hit the 4 real targets — ignore the decoys",
    briefing: "Not every plate out there is a valid target. Decoys are marked with a blue ring — check before you shoot.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: null,
    wind: null,
    bulletDrop: false,
    failOnDecoyHit: false,
    targets: [
      { id: "t1", kind: "stationary", position: [-16, 3.2, -84], radius: 0.42, label: "A" },
      { id: "d1", kind: "decoy", position: [-6, 4, -84], radius: 0.46, label: "?" },
      { id: "t2", kind: "stationary", position: [6, 5.6, -104], radius: 0.42, label: "B" },
      { id: "d2", kind: "decoy", position: [14, 5.6, -104], radius: 0.46, label: "?" },
      { id: "t3", kind: "stationary", position: [-4, 7.6, -124], radius: 0.4, label: "C" },
      { id: "t4", kind: "stationary", position: [16, 9, -142], radius: 0.4, label: "D" },
    ],
  },
  {
    id: 10,
    name: "CERTIFICATION",
    objective: "Complete the full qualification course",
    briefing: "Moving targets, a pop-up, a switch, and a decoy — everything you've learned. Clear this and Industrial District opens up.",
    magazine: 5,
    reserveMags: 2,
    timeLimit: 55,
    wind: null,
    bulletDrop: false,
    failOnDecoyHit: true,
    targets: [
      {
        id: "t1",
        kind: "moving",
        position: [-16, 3.4, -84],
        radius: 0.42,
        label: "A",
        movement: { type: "patrol", to: [-2, 3.4, -84], speed: 0.4 },
      },
      { id: "t2", kind: "popup", position: [8, 5.6, -104], radius: 0.42, label: "B", movement: { type: "popup", interval: 3, visibleFor: 1.5, offset: 0 } },
      { id: "sw1", kind: "switch", position: [-8, 4.2, -90], radius: 0.6, label: "SW" },
      { id: "t3", kind: "stationary", position: [16, 7.4, -122], radius: 0.4, label: "C", unlocksAfter: "sw1" },
      { id: "t4", kind: "stationary", position: [-4, 9, -140], radius: 0.4, label: "D" },
      { id: "d1", kind: "decoy", position: [2, 8.6, -140], radius: 0.44, label: "?" },
    ],
  },
].map((m) => ({
  ...m,
  location: "downtown",
  built: true,
  bulletTravel: true,
  weather: "clear",
  failOnDecoyHit: m.failOnDecoyHit ?? false,
  stars: STARS,
}));

const MISSIONS = new Map();
for (const m of DOWNTOWN_MISSIONS) MISSIONS.set(m.id, m);
for (const loc of LOCATIONS) {
  if (loc.id === "downtown") continue;
  for (const m of generateLocationMissions(loc)) MISSIONS.set(m.id, { ...m, stars: STARS });
}

export function getMission(id) {
  return MISSIONS.get(id) || null;
}

export function missionsForLocation(locId) {
  const loc = LOCATIONS.find((l) => l.id === locId);
  if (!loc) return [];
  const out = [];
  for (let id = loc.range[0]; id <= loc.range[1]; id++) out.push(MISSIONS.get(id));
  return out;
}

export function isMissionBuilt(id) {
  return Boolean(MISSIONS.get(id)?.built);
}

export { locationForMission };
