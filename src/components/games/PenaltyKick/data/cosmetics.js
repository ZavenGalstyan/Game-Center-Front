/**
 * Penalty Kick — cosmetics. Purely visual: no ball or kit changes physics.
 * Balls unlock through play (no currency, no purchases).
 */

/** pattern: "classic" panels · "stripe" bands · "star" points · "swirl" arcs · "hex" grid */
export const BALLS = [
  { id: "classic", name: "Classic Panel", base: "#f7f7f2", ink: "#1d1d1f", accent: "#1d1d1f", pattern: "classic", unlock: null, note: "The ball everyone learns with." },
  { id: "street", name: "Street Orange", base: "#ff8a2a", ink: "#2a1a10", accent: "#ffffff", pattern: "stripe", unlock: { kind: "goals", n: 10 }, note: "Score 10 penalties." },
  { id: "nightline", name: "Night Line", base: "#20243a", ink: "#63f0ff", accent: "#f7f7ff", pattern: "swirl", unlock: { kind: "matches", n: 3 }, note: "Win 3 career matches." },
  { id: "meadow", name: "Meadow", base: "#f4f7ea", ink: "#2f8d49", accent: "#f2c230", pattern: "hex", unlock: { kind: "saves", n: 10 }, note: "Make 10 saves." },
  { id: "coral", name: "Coral Reef", base: "#fff3ea", ink: "#ff5b6e", accent: "#1aa7a1", pattern: "star", unlock: { kind: "stage", n: 2 }, note: "Win the City League." },
  { id: "volt", name: "Volt", base: "#e9ff3f", ink: "#141414", accent: "#141414", pattern: "stripe", unlock: { kind: "targets", n: 25 }, note: "Hit 25 targets in Target Shooting." },
  { id: "royal", name: "Royal Crest", base: "#f6f1e3", ink: "#3a2178", accent: "#d8a93a", pattern: "star", unlock: { kind: "stage", n: 4 }, note: "Win the National Arena stage." },
  { id: "champion", name: "Champion Gold", base: "#f3cf62", ink: "#5a3c0c", accent: "#fff6d8", pattern: "classic", unlock: { kind: "stage", n: 5 }, note: "Win Championship Night." },
];

export const getBall = (id) => BALLS.find((b) => b.id === id) || BALLS[0];

export const KIT_OPTIONS = {
  shirt: ["#2b62d9", "#d8352a", "#1f9e57", "#f2c230", "#f4f4f0", "#1b1d24", "#7a3cc7", "#ff7a2a", "#12a3b5", "#e0467c"],
  shorts: ["#f4f4f0", "#1b1d24", "#2b62d9", "#d8352a", "#1f9e57", "#3a3f4c"],
  boots: ["#101114", "#f4f4f0", "#ff5a2a", "#28d0ff", "#c8f03c", "#e8b43a"],
  gloves: ["#f4f4f0", "#28d0ff", "#c8f03c", "#ff5a2a", "#101114", "#e0467c"],
  keeperShirt: ["#1fb56a", "#f2c230", "#ff7a2a", "#7a3cc7", "#1b1d24", "#e0467c"],
  skin: ["#f1c7a3", "#d9a37a", "#b67c52", "#8a5634", "#5e3a22"],
};

export const DEFAULT_KIT = {
  shirt: "#2b62d9",
  shorts: "#f4f4f0",
  boots: "#101114",
  gloves: "#28d0ff",
  keeperShirt: "#1fb56a",
  skin: "#d9a37a",
  number: 9,
  name: "ROOKIE",
};
