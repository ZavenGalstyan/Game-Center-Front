/**
 * Training-mode lessons. Each objective is a counter fed by match events
 * (see ui/useTraining.js → countEvent); the dummy's behaviour is an AI preset
 * (engine/ai.js `dummy` option) so drills use the real combat engine.
 */
export const DUMMIES = {
  passive: { label: "Passive dummy", passive: true },
  guardHigh: { label: "High guard", passive: true, block: "high" },
  guardBody: { label: "Body guard", passive: true, block: "body" },
  counter: { label: "Counter-striker", attacks: true, rate: 0.25, range: 1.25 },
  aggressive: { label: "Aggressive", attacks: true, rate: 0.75, range: 0.95 },
  wrestler: { label: "Wrestler", attacks: false, grapple: true, range: 1.4 },
  sparring: { label: "Sparring partner", attacks: true, rate: 0.5, range: 1.1, grappleAll: true },
};

export const LESSONS = [
  {
    id: "move",
    name: "Movement",
    dummy: "passive",
    tip: "W/S step in and out, A/D circle around your opponent. Your stance turns to face him automatically.",
    goals: [
      { k: "moveF", n: 3, text: "Step forward (W) — 3 m" },
      { k: "moveB", n: 3, text: "Step back (S) — 3 m" },
      { k: "moveL", n: 4, text: "Circle (A / D) — 4 m" },
    ],
  },
  {
    id: "punches",
    name: "Basic Punches",
    dummy: "passive",
    tip: "J jab · K cross · L left hook · O right hook · U uppercut. Get in range first — a punch that falls short does nothing.",
    goals: [
      { k: "land:jab", n: 3, text: "Land 3 jabs (J)" },
      { k: "land:cross", n: 3, text: "Land 3 crosses (K)" },
      { k: "land:hook", n: 2, text: "Land 2 hooks (L / O)" },
      { k: "land:uppercut", n: 1, text: "Land an uppercut (U)" },
      { k: "land:body", n: 2, text: "Hold S + J/K/L for body shots — land 2" },
    ],
  },
  {
    id: "kicks",
    name: "Kicks",
    dummy: "passive",
    tip: "I body kick · S+I low kick · W+I head kick · H front kick. Kicks reach further but cost stamina.",
    goals: [
      { k: "land:kickLow", n: 2, text: "Land 2 low kicks (S + I)" },
      { k: "land:kickBody", n: 2, text: "Land 2 body kicks (I)" },
      { k: "land:kickHead", n: 1, text: "Land a head kick (W + I)" },
      { k: "land:kickFront", n: 1, text: "Land a front kick (H)" },
    ],
  },
  {
    id: "block",
    name: "Blocking",
    dummy: "aggressive",
    tip: "Hold SPACE for a high guard. Hold SPACE + S to drop to a body guard (also checks low kicks). Guarding slows you down.",
    goals: [
      { k: "block", n: 5, text: "Block 5 strikes" },
      { k: "blockBody", n: 2, text: "Block 2 body / leg strikes with the low guard" },
    ],
  },
  {
    id: "dodge",
    name: "Dodging & Countering",
    dummy: "aggressive",
    tip: "SHIFT + A/D slips, SHIFT alone ducks, SHIFT + S steps back. Right after a slip, strike — counters hit 30% harder.",
    goals: [
      { k: "evade", n: 3, text: "Make 3 strikes miss with a dodge" },
      { k: "counter", n: 2, text: "Land 2 counter strikes" },
    ],
  },
  {
    id: "combos",
    name: "Combinations",
    dummy: "passive",
    tip: "Press the next strike as the previous one lands — the recovery is cancelled into the follow-up.",
    goals: [
      { k: "combo:1-2", n: 1, text: "One-Two (J → K)" },
      { k: "combo:1-2-3", n: 1, text: "One-Two-Hook (J → K → L)" },
      { k: "combo:2-lk", n: 1, text: "Cross → Low Kick (K → S+I)" },
      { k: "combo:jab-body-head", n: 1, text: "Jab → Body Jab → Head Kick (J → S+J → W+I)" },
    ],
  },
  {
    id: "takedowns",
    name: "Clinch & Takedowns",
    dummy: "wrestler",
    tip: "E up close = clinch (then I knees, L elbows, E trip, SHIFT break). E from 1–2 m = shoot a double-leg. When HE shoots, press SHIFT to sprawl.",
    goals: [
      { k: "clinch", n: 1, text: "Get into the clinch (E up close)" },
      { k: "land:knee", n: 2, text: "Land 2 clinch knees (I)" },
      { k: "td", n: 1, text: "Land a takedown (E)" },
      { k: "sprawl", n: 1, text: "Sprawl on his shot (SHIFT)" },
    ],
  },
  {
    id: "ground",
    name: "Ground Transitions",
    dummy: "passive",
    startGround: "guard",
    tip: "On top: R advances (guard → half → side → mount → back), J/K strike, SHIFT stands up. On the bottom: R sweeps / escapes, SPACE covers.",
    goals: [
      { k: "advance", n: 3, text: "Advance position 3 times (R)" },
      { k: "pos:mount", n: 1, text: "Reach full mount" },
      { k: "gnp", n: 3, text: "Land 3 ground strikes (J / K)" },
    ],
  },
  {
    id: "subs",
    name: "Submissions",
    dummy: "passive",
    startGround: "mount",
    tip: "From mount E = armbar, from the back E = rear-naked choke, from the bottom of full guard E = armbar / U = guillotine. In the struggle, tap J/K/SPACE when the marker is inside YOUR zone.",
    goals: [
      { k: "subAtt", n: 1, text: "Attempt a submission (E)" },
      { k: "tap", n: 1, text: "Make him tap" },
    ],
  },
];
