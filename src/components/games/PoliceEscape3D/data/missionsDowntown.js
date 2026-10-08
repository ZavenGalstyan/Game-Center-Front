/**
 * Police Escape 3D — World 1, DOWNTOWN NIGHT (missions 1–6). Teaches
 * driving, the pursuit, nitro and shortcuts, then checkpoints, a time limit,
 * a first survive and the first roadblocks.
 *
 * Mission fields: type, brief, start { node: [i, j], dir }, zone { block,
 * side, kind }, police { start, max, ramp, speed }, traffic, nitros
 * [[segment, at]], checkpoints [[i, j]], roadblocks [{ seg, at, gap }],
 * dynamicBlocks, timeLimit, survive, clear (lose the police within N m
 * before the escape point accepts you), stars { time, integrity }.
 */
import { WORLDS } from "./worlds.js";

const CITY = WORLDS[0].city;

export const MISSIONS_DOWNTOWN = [
  {
    // QUALITY GATE: wide start road, several intersections, a traffic
    // section, an alley shortcut, one nitro pickup, the garage.
    id: 1,
    name: "First Pursuit",
    world: 1,
    type: "escape",
    brief: "Two patrol cars are on you. Reach the underground garage on the north side.",
    city: CITY,
    start: { node: [0, 6], dir: "E" },
    zone: { block: [9, 0], side: "S", kind: "garage" },
    police: { start: 2, max: 1, speed: 0.94 },
    traffic: 10,
    nitros: [[["h", 2, 6], 0.5]],
    stars: { integrity: 50 },
  },
  {
    id: 2,
    name: "Rush Hour",
    world: 1,
    type: "escape",
    brief: "Weave through heavy evening traffic and shake the police before you slip into the garage.",
    city: CITY,
    start: { node: [10, 1], dir: "W" },
    zone: { block: [1, 7], side: "N", kind: "garage" },
    police: { start: 2, max: 2, ramp: [55, 999], speed: 0.95 },
    traffic: 16,
    clear: 45,
    nitros: [
      [["h", 6, 1], 0.5],
      [["v", 3, 4], 0.5],
    ],
    stars: { integrity: 50 },
  },
  {
    id: 3,
    name: "Checkpoint Charlie",
    world: 1,
    type: "checkpoint",
    brief: "Pick up the crew at three checkpoints across downtown, then hide in the garage.",
    city: CITY,
    start: { node: [5, 8], dir: "N" },
    checkpoints: [
      [7, 6],
      [9, 2],
      [3, 1],
    ],
    zone: { block: [0, 3], side: "E", kind: "garage" },
    police: { start: 2, max: 2, ramp: [50, 999], speed: 0.95 },
    traffic: 12,
    nitros: [
      [["v", 7, 5], 0.5],
      [["h", 5, 1], 0.5],
    ],
    stars: { integrity: 50 },
  },
  {
    id: 4,
    name: "Against the Clock",
    world: 1,
    type: "time",
    brief: "The garage closes soon. Cross downtown before the timer runs out.",
    city: CITY,
    start: { node: [0, 0], dir: "S" },
    checkpoints: [[4, 4]],
    zone: { block: [6, 6], side: "S", kind: "garage" },
    timeLimit: 120,
    police: { start: 2, max: 2, ramp: [40, 999], speed: 0.96 },
    traffic: 12,
    nitros: [
      [["v", 0, 2], 0.5],
      [["h", 6, 6], 0.5],
    ],
    stars: { integrity: 50 },
  },
  {
    id: 5,
    name: "Hold the Line",
    world: 1,
    type: "survive",
    brief: "Your contact needs a minute. Stay free for 60 seconds — then the garage opens.",
    city: CITY,
    start: { node: [4, 4], dir: "E" },
    survive: 60,
    zone: { block: [6, 7], side: "N", kind: "garage" },
    police: { start: 2, max: 2, ramp: [30, 999], speed: 0.96 },
    traffic: 12,
    nitros: [
      [["h", 1, 3], 0.5],
      [["v", 7, 2], 0.5],
      [["h", 8, 6], 0.5],
    ],
    stars: { integrity: 45 },
  },
  {
    id: 6,
    name: "Downtown Showdown",
    world: 1,
    type: "final",
    brief: "Two checkpoints, roadblocks on the avenues, a heavy pursuit. Lose them and reach the garage.",
    city: CITY,
    start: { node: [10, 7], dir: "W" },
    checkpoints: [
      [5, 3],
      [1, 1],
    ],
    survive: 0,
    zone: { block: [9, 3], side: "E", kind: "garage" },
    roadblocks: [
      { seg: ["h", 6, 3], at: 0.5, gap: "L" },
      { seg: ["v", 3, 2], at: 0.5, gap: "R" },
    ],
    dynamicBlocks: true,
    clear: 45,
    police: { start: 3, max: 2, ramp: [45, 999], speed: 0.96 },
    traffic: 12,
    nitros: [
      [["h", 8, 7], 0.5],
      [["v", 3, 5], 0.5],
      [["h", 2, 1], 0.5],
    ],
    stars: { integrity: 40 },
  },
];
