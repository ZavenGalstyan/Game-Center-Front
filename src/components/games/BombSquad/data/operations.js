/**
 * Bomb Squad — the 6 operations (10 missions each). Purely presentational +
 * range metadata; mission content itself lives in data/missions.js.
 */
export const OPERATIONS = [
  {
    id: "training-facility",
    index: 0,
    name: "TRAINING FACILITY",
    tagline: "Basic certification bench",
    range: [1, 10],
    accent: "#5ad18f",
    case: "training",
  },
  {
    id: "city-lockdown",
    index: 1,
    name: "CITY LOCKDOWN",
    tagline: "Urban emergency response",
    range: [11, 20],
    accent: "#e8a33d",
    case: "city",
  },
  {
    id: "underground-signal",
    index: 2,
    name: "UNDERGROUND SIGNAL",
    tagline: "Transit maintenance tunnels",
    range: [21, 30],
    accent: "#3dd6c8",
    case: "underground",
  },
  {
    id: "industrial-blackout",
    index: 3,
    name: "INDUSTRIAL BLACKOUT",
    tagline: "Factory power grid",
    range: [31, 40],
    accent: "#e8763d",
    case: "industrial",
  },
  {
    id: "arctic-station",
    index: 4,
    name: "ARCTIC STATION",
    tagline: "Cold research facility",
    range: [41, 50],
    accent: "#7ec8f2",
    case: "arctic",
  },
  {
    id: "black-site",
    index: 5,
    name: "BLACK SITE",
    tagline: "Classified tactical facility",
    range: [51, 60],
    accent: "#ff5c6c",
    case: "blacksite",
  },
];

export function operationForMission(id) {
  return OPERATIONS.find((o) => id >= o.range[0] && id <= o.range[1]) || OPERATIONS[0];
}

export function getOperation(opId) {
  return OPERATIONS.find((o) => o.id === opId) || OPERATIONS[0];
}

export function localIndex(id) {
  const op = operationForMission(id);
  return id - op.range[0]; // 0..9 within the operation
}
