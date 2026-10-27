/**
 * Iron Arena — game modes, difficulty labels and scoring constants.
 */
export const MODES = {
  dm: { id: "dm", name: "Deathmatch", short: "DM", teams: false, size: 6, limit: 15, time: 300, respawn: 4, unit: "kills", blurb: "Every tank for itself. First to 15 kills — or the top fragger when time runs out — wins." },
  tdm: { id: "tdm", name: "Team Battle", short: "TB", teams: true, size: 4, limit: 25, time: 420, respawn: 5, unit: "kills", blurb: "Blue vs Red, four tanks a side. First team to 25 kills wins." },
  ctf: { id: "ctf", name: "Capture the Flag", short: "CTF", teams: true, size: 4, limit: 3, time: 540, respawn: 7, unit: "captures", blurb: "Steal the enemy flag and bring it to your base while yours is home. 3 captures win." },
};
export const MODE_IDS = ["dm", "tdm", "ctf"];

export const DIFFICULTY = {
  easy: { name: "Easy", blurb: "Slow reactions, loose aim. Great for learning the tanks.", coins: 0.8 },
  normal: { name: "Normal", blurb: "Competent crews that use cover and abilities.", coins: 1 },
  hard: { name: "Hard", blurb: "Quick, accurate veterans that flank and retreat to repair.", coins: 1.35 },
};

export const POINTS = { kill: 100, assist: 40, capture: 300, take: 50, ret: 80, carrierKill: 60 };

export const CALLSIGNS = ["Havoc", "Rook", "Brimstone", "Sable", "Vulcan", "Kestrel", "Onyx", "Talon", "Ironside", "Mamba", "Bastille", "Cinder", "Gauntlet", "Nomad", "Rampart", "Wolfhound", "Quarry", "Striga", "Harrow", "Juno"];
