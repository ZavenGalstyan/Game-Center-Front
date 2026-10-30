/**
 * The campaign: Training → three missions → Shredder. Each mission plays on
 * one map; steps complete in order (only the current one counts, except
 * state-based steps like "guards", which read the world each frame).
 */
export const MISSIONS = [
  {
    id: "training",
    level: "sewer",
    name: "Sewer Training",
    brief: "Master Splinter wants to see your basics before you go topside.",
    steps: [
      { id: "move", text: "Move around", hint: "WASD / joystick", need: 8 },
      { id: "look", text: "Turn the camera", hint: "Mouse / drag the right side", need: 1.2 },
      { id: "jump", text: "Jump twice", hint: "Space / JUMP", need: 2 },
      { id: "dodge", text: "Shell-roll dodge", hint: "Shift / DODGE", need: 1 },
      { id: "light", text: "Hit a training dummy", hint: "Left click / ATTACK", need: 3 },
      { id: "combo", text: "Land a full 3-hit combo", hint: "Click ×3 quickly on a dummy", need: 1 },
      { id: "heavy", text: "Heavy attack a dummy", hint: "Right click or F / HEAVY", need: 2 },
      { id: "special", text: "Hit a dummy with your special", hint: "Q / SPECIAL", need: 1 },
      { id: "splinter", text: "Report to Master Splinter", hint: "E / TALK", need: 1 },
    ],
  },
  {
    id: "streets",
    level: "streets",
    name: "Foot Clan Patrol",
    brief: "Foot soldiers are prowling the streets of New York. Take them down.",
    steps: [{ id: "kills", text: "Defeat Foot soldiers", hint: "Combos, heavies and your special", need: 5 }],
    waves: ["foot", "foot", "foot", "foot", "foot"],
    startAlive: 2,
    maxAlive: 3,
  },
  {
    id: "rescue",
    level: "streets",
    name: "Hostage Rescue",
    brief: "The Foot grabbed a civilian. Find them, beat the guards and get them to the van.",
    steps: [
      { id: "find", text: "Find the captured civilian", hint: "Follow the arrow", need: 1 },
      { id: "guards", text: "Defeat the guards", hint: "The Elite hits hard — dodge its red ring", need: 3 },
      { id: "free", text: "Free the civilian", hint: "E / USE next to them", need: 1 },
      { id: "escort", text: "Escort them to the van", hint: "They follow you — stay close", need: 1 },
    ],
  },
  {
    id: "rooftops",
    level: "rooftops",
    name: "Rooftop Ambush",
    brief: "A Foot squad waits on the rooftops. Clear all six of them.",
    steps: [{ id: "kills", text: "Defeat the Foot squad", hint: "Elites shrug off light hits — use heavies", need: 6 }],
    waves: ["foot", "foot", "elite", "foot", "elite", "foot"],
    startAlive: 3,
    maxAlive: 3,
  },
  {
    id: "boss",
    level: "arena",
    name: "Shredder",
    brief: "The Shredder awaits on his tower. End this.",
    steps: [{ id: "boss", text: "Defeat the Shredder", hint: "Dodge out of the red lane, punish the recovery", need: 1 }],
  },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

export const SPLINTER_LINES = {
  idle: ["Focus, my son. Strike the dummy as you would a foe.", "Patience. Speed. Precision.", "Again — and this time, mean it."],
  done: "Well done, my son. The city above needs its protectors. Go — and stay in the shadows.",
};
export const CIVILIAN_LINES = {
  tied: "Help! Please get me out of here!",
  freed: "Turtles?! …Whatever — thank you! Get me to the van!",
  safe: "I'm safe! I'll never forget this. Thank you!",
};
