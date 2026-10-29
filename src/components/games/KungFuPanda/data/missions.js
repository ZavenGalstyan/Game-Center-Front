/**
 * The campaign: Training → 2 missions → Tai Lung. Each mission plays on one
 * map; its steps are completed in order (only the current one counts).
 * `reward` names the hero unlocked by finishing it for the first time.
 */
export const MISSIONS = [
  {
    id: "training",
    level: "training",
    name: "Training Day",
    brief: "Master Shifu wants to see the basics before you face real danger.",
    steps: [
      { id: "move", text: "Move around", hint: "WASD / joystick", need: 8 },
      { id: "look", text: "Turn the camera", hint: "Mouse / drag the right side", need: 1.2 },
      { id: "jump", text: "Jump twice", hint: "Space / JUMP", need: 2 },
      { id: "dodge", text: "Dodge roll", hint: "Shift / DODGE", need: 1 },
      { id: "punch", text: "Punch a training dummy", hint: "Left click / PUNCH", need: 3 },
      { id: "kick", text: "Kick a training dummy", hint: "Right click or F / KICK", need: 2 },
      { id: "special", text: "Hit a dummy with your special", hint: "Q / SPECIAL", need: 1 },
      { id: "shifu", text: "Talk to Master Shifu", hint: "E / TALK", need: 1 },
    ],
    reward: "crane",
  },
  {
    id: "valley",
    level: "valley",
    name: "Bandits in the Valley",
    brief: "Wolf bandits are raiding the village. Drive them out!",
    steps: [{ id: "kills", text: "Defeat wolf bandits", hint: "Punch, kick and use your special", need: 5 }],
    totalEnemies: 5,
    maxAlive: 3,
    reward: "viper",
  },
  {
    id: "forest",
    level: "forest",
    name: "Scrolls of the Bamboo Forest",
    brief: "Five sacred scrolls were scattered in the forest. Bring them back.",
    steps: [{ id: "scrolls", text: "Collect sacred scrolls", hint: "Follow the golden light, press E", need: 5 }],
    reward: "mantis",
  },
  {
    id: "arena",
    level: "arena",
    name: "Tai Lung",
    brief: "Tai Lung has escaped. Only the Dragon Warrior can stop him.",
    steps: [{ id: "boss", text: "Defeat Tai Lung", hint: "Dodge his pounce, punish the landing", need: 1 }],
    reward: null,
  },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

export const SHIFU_LINES = {
  idle: ["Focus. Breathe. Then hit the dummy.", "Inner peace… and a strong kick.", "Again! With more chi!"],
  done: "Hmm. Not bad, Dragon Warrior. Not bad at all. Now go — the valley needs you.",
};
